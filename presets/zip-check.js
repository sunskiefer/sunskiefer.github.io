// Looks inside a preset zip without unpacking it to disk: lists the entries, then reads every .xpl and checks it.
// Used by the page (so people see problems at once) and by the Worker (so the inbox only gets proper presets).
import { checkXpl, checkNative, MAX_BYTES, MAX_NATIVE } from "./xpl-check.js";
export const LIMITS = { zip: 8 * 1024 * 1024, entries: 300, total: 40 * 1024 * 1024 };
const ALLOWED_BASE = ["xpl", "txt", "md"];
const u16 = (d, o) => d[o] | (d[o + 1] << 8);
const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

export function listZip(b, synths = []) {
  const native = synths.filter((s) => s.native).map((s) => s.native.ext);
  const ALLOWED = [...ALLOWED_BASE, ...native];
  const err = (error) => ({ error });
  if (b.length > LIMITS.zip) return err("The zip is bigger than " + LIMITS.zip / 1048576 + " MB.");
  if (b.length < 22) return err("That is not a zip file.");
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (u32(b, i) === 0x06054b50) { e = i; break; }
  if (e < 0) return err("That is not a zip file.");
  const n = u16(b, e + 10), off = u32(b, e + 16);
  if (n === 0xffff || off === 0xffffffff) return err("Zip64 files are not supported.");
  if (n > LIMITS.entries) return err("Too many files in the zip (max " + LIMITS.entries + ").");
  const out = [], skipped = [];
  let p = off, total = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) return err("The zip is damaged.");
    const flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
    const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lho = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(name)) continue;
    if (flags & 1) return err("The zip is password protected.");
    if (/(^|\/)\.\.(\/|$)/.test(name) || name.startsWith("/") || /[\\:]/.test(name)) return err("The zip has an unsafe file path: " + name.slice(0, 60));
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED.includes(ext)) return err("Only presets (.xpl, or a plugin's own preset file) and an optional .txt or .md readme may be inside. Found: " + name.slice(0, 60));
    if (method !== 0 && method !== 8) return err("The zip uses a compression this page cannot read.");
    total += usize;
    if (total > LIMITS.total) return err("The zip unpacks to too much data.");
    if (ext === "xpl" && usize > MAX_BYTES || native.includes(ext) && usize > MAX_NATIVE) return err(name.slice(0, 60) + " is bigger than " + MAX_BYTES / 1024 + " KB.");
    out.push({ name, ext, method, csize, usize, lho });
  }
  return { entries: out, skipped };
}

async function readEntry(b, e) {
  const lh = e.lho;
  if (u32(b, lh) !== 0x04034b50) throw new Error("damaged");
  const start = lh + 30 + u16(b, lh + 26) + u16(b, lh + 28);
  const data = b.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  const rd = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = []; let len = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    len += value.length;
    if (len > e.usize + 1) { await rd.cancel(); throw new Error("bigger than the zip says"); }
    chunks.push(value);
  }
  const out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Returns {ok, error?, presets:[{file, preset, synth, synthName}], synths:[{key,name}], readme:boolean}
export async function analyzeZip(bytes, synths) {
  const l = listZip(bytes, synths);
  if (l.error) return { ok: false, error: l.error };
  const xpls = l.entries.filter((e) => e.ext !== "txt" && e.ext !== "md");
  if (!xpls.length) return { ok: false, error: "There is no preset inside the zip." };
  const presets = [], problems = [];
  for (const e of xpls) {
    try {
      const raw = await readEntry(bytes, e);
      const c = e.ext === "xpl" ? checkXpl(new TextDecoder("utf-8", { fatal: true }).decode(raw), synths) : checkNative(e.name, raw, synths);
      if (c.ok) presets.push({ file: e.name, preset: c.preset, synth: c.synth.key, synthName: c.synth.name });
      else problems.push(e.name.split("/").pop() + ": " + c.error);
    } catch { problems.push(e.name.split("/").pop() + ": cannot be read."); }
  }
  if (problems.length) return { ok: false, error: problems.slice(0, 3).join("  ") + (problems.length > 3 ? "  (+" + (problems.length - 3) + " more)" : "") };
  const seen = new Map(); presets.forEach((p) => seen.set(p.synth, p.synthName));
  return { ok: true, presets, synths: [...seen].map(([key, name]) => ({ key, name })), readme: l.entries.some((e) => e.ext === "txt" || e.ext === "md") };
}
