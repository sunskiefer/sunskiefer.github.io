// L'Cronx preset inbox. Visitors drop a preset zip on the site; this checks it and puts it in a PRIVATE GitHub repo
// (inbox/<date>-<id>/<name>.zip + a small .json with author and notes) and opens an issue so you get a notification.
// Nothing here publishes anything: you look at it, and only what you copy into the public site repo is listed.
import { analyzeZip, LIMITS as ZIP } from "../../presets/zip-check.js";
import { compose } from "../../presets/naming.js";
import cfg from "../../presets/synths.json";

const SYNTHS = cfg.synths, TYPES = cfg.types;
const SUBMITS_PER_HOUR = 4;
const enc = new TextEncoder();

function origins(env) { return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean); }
function cors(req, env) {
  const o = req.headers.get("Origin") || "";
  return { "Access-Control-Allow-Origin": origins(env).includes(o) ? o : "null", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
}
const reply = (req, env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors(req, env), "Content-Type": "application/json" } });

async function sha(bytes) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const hour = () => Math.floor(Date.now() / 3.6e6);
async function counter(env, key, limit) {
  const n = Number((await env.LIMITS.get(key)) || 0);
  if (n >= limit) return false;
  await env.LIMITS.put(key, String(n + 1), { expirationTtl: 7200 });
  return true;
}
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function gh(env, method, path, body) {
  const r = await fetch("https://api.github.com/repos/" + env.INBOX_REPO + "/" + path, {
    method,
    headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "lcronx-presets", "X-GitHub-Api-Version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

async function submit(req, env) {
  let form;
  try { form = await req.formData(); } catch { return reply(req, env, { error: "Bad form." }, 400); }
  if (form.get("website")) return reply(req, env, { ok: true }); // honeypot: pretend it worked
  const file = form.get("file");
  if (!file || typeof file === "string") return reply(req, env, { error: "No file." }, 400);
  if (file.size > ZIP.zip) return reply(req, env, { error: "The zip is bigger than " + ZIP.zip / 1048576 + " MB." }, 413);
  if (form.get("agree") !== "yes") return reply(req, env, { error: "Please tick the box to confirm you may share it." }, 400);

  const name = compose({ kind: form.get("kind") === "single" ? "single" : "pack", author: form.get("author"), name: form.get("name"), type: form.get("type") }, TYPES);
  if (!name.ok) return reply(req, env, { error: name.error }, 400);
  const author = clean(form.get("author"), 60);
  if (!author) return reply(req, env, { error: "Please add your name or handle." }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const an = await analyzeZip(bytes, SYNTHS);
  if (!an.ok) return reply(req, env, { error: an.error }, 400);

  const ip = await sha(enc.encode(req.headers.get("CF-Connecting-IP") || "?"));
  if (!(await counter(env, "rl:" + ip.slice(0, 16) + ":" + hour(), SUBMITS_PER_HOUR)))
    return reply(req, env, { error: "Too many uploads from here this hour. Try again later." }, 429);
  const h = await sha(bytes);
  if (await env.LIMITS.get("hash:" + h)) return reply(req, env, { error: "This exact zip was already sent. Thank you!" }, 409);

  const date = new Date().toISOString().slice(0, 10);
  const id = date + "-" + h.slice(0, 6);
  const dir = "inbox/" + id + "/";
  const meta = {
    kind: name.kind, name: name.name, type: name.type, author,
    link: clean(form.get("link"), 200), notes: clean(form.get("notes"), 400), date,
    synths: an.synths.map((s) => s.name), count: an.presets.length, presets: an.presets.slice(0, 40).map((p) => p.preset), file: name.filename,
  };
  const f1 = await gh(env, "PUT", "contents/" + dir + encodeURIComponent(name.filename), { message: "Preset zip: " + name.filename, content: b64(bytes), branch: env.INBOX_BRANCH });
  if (!f1.ok) return reply(req, env, { error: "Could not store it right now (" + f1.status + "). Try again later." }, 502);
  await gh(env, "PUT", "contents/" + dir + encodeURIComponent(name.filename.replace(/\.zip$/, ".json")), { message: "Preset info: " + name.filename, content: b64(enc.encode(JSON.stringify(meta, null, 1) + "\n")), branch: env.INBOX_BRANCH });
  await env.LIMITS.put("hash:" + h, id, { expirationTtl: 60 * 60 * 24 * 60 });

  const repo = env.INBOX_REPO, base = "https://github.com/" + repo + "/blob/" + env.INBOX_BRANCH + "/" + dir;
  await gh(env, "POST", "issues", {
    title: "New " + (name.kind === "single" ? "preset" : "pack") + ": " + name.name + " (" + an.synths.map((s) => s.name).join(", ") + ") by " + author,
    labels: ["new"],
    body: [
      "**File:** [" + name.filename + "](" + base + encodeURIComponent(name.filename) + ")  ",
      "**Info file:** [" + name.filename.replace(/\.zip$/, ".json") + "](" + base + encodeURIComponent(name.filename.replace(/\.zip$/, ".json")) + ")",
      "", "| | |", "|-|-|",
      "| Kind | " + name.kind + " |", "| Author | " + author + " |", "| Type | " + name.type + " |",
      "| Plugins | " + an.synths.map((s) => s.name).join(", ") + " |", "| Presets inside | " + an.presets.length + " |",
      "| Link | " + (meta.link || "-") + " |", "| Notes | " + (meta.notes || "-") + " |", "",
      "Checked automatically: it is a valid zip with only .xpl presets (and a readme) for the plugins above. **Not checked: how it sounds.**", "",
      "To list it: download the zip and the .json, try it on a Force, then add both to `presets/packs/` in sunskiefer.github.io.",
    ].join("\n"),
  });
  return reply(req, env, { ok: true });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
    const o = req.headers.get("Origin");
    if (o && !origins(env).includes(o)) return reply(req, env, { error: "Not allowed from here." }, 403);
    try {
      if (new URL(req.url).pathname === "/submit" && req.method === "POST") return await submit(req, env);
      return reply(req, env, { ok: true });
    } catch { return reply(req, env, { error: "Something broke on my side." }, 500); }
  },
};
