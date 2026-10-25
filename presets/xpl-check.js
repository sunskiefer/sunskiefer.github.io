// Shared by the presets page, the admin screen and the Worker. Checks that a file is a Force / MPC plugin preset (.xpl)
// for one of the L'Cronx plugins. Format: see docs/NOTES.md of mpc-vst-plugins ("Instruments-browser tiles"):
// <pluginstate> with <PLUGIN ... uid="%08x"/>, <preset>Name</preset>, <state> = JUCE base64 of an fxb chunk set.
export const MAX_BYTES = 400 * 1024;
const T = ".ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function uidHex(uid4) {
  return [...uid4].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

// JUCE MemoryBlock::fromBase64Encoding; returns null if the text is not valid.
export function b64dec(s) {
  const dot = s.indexOf(".");
  if (dot < 1) return null;
  const n = Number(s.slice(0, dot));
  if (!Number.isInteger(n) || n < 0 || n > MAX_BYTES) return null;
  const out = new Uint8Array(n);
  let acc = 0, bits = 0, bi = 0;
  for (const ch of s.slice(dot + 1)) {
    const v = T.indexOf(ch);
    if (v < 0) return null;
    acc |= v << bits;
    bits += 6;
    while (bits >= 8 && bi < n) {
      out[bi++] = acc & 0xff;
      acc >>= 8;
      bits -= 8;
    }
  }
  return bi === n ? out : null;
}

// text: the file as text; synths: the "synths" array of synths.json.
// Returns {ok:true, synth, preset, uid} or {ok:false, error}.
export function checkXpl(text, synths) {
  const bad = (error) => ({ ok: false, error });
  if (typeof text !== "string" || !text.length) return bad("The file is empty.");
  if (text.length > MAX_BYTES) return bad("The file is bigger than " + MAX_BYTES / 1024 + " KB.");
  if (/<!DOCTYPE|<!ENTITY|<script|<iframe|javascript:/i.test(text)) return bad("The file contains things a preset never has.");
  if (!/<pluginstate>[\s\S]*<\/pluginstate>/.test(text)) return bad("This is not a plugin preset (.xpl) from the Force / MPC.");
  const pm = text.match(/<PLUGIN\b[^>]*\buid="([0-9a-fA-F]{8})"/);
  if (!pm) return bad("The preset does not say which plugin it belongs to.");
  const uidh = pm[1].toLowerCase();
  const synth = synths.find((s) => uidHex(s.uid) === uidh);
  if (!synth) return bad("This preset is not for one of the L'Cronx plugins.");
  const nm = text.match(/<preset>([^<]{1,100})<\/preset>/);
  if (!nm) return bad("The preset has no name.");
  const preset = nm[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  if (/[\u0000-\u001f]/.test(preset)) return bad("The preset name has odd characters.");
  const sm = text.match(/<state>([^<]+)<\/state>/);
  if (!sm) return bad("The preset has no saved sound inside.");
  const bytes = b64dec(sm[1].trim());
  if (!bytes || bytes.length < 28) return bad("The saved sound inside is damaged.");
  const tag = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));
  if (tag(0, 4) !== "CcnK" || tag(8, 4) !== "FBCh") return bad("The saved sound is not in the format the plugins use.");
  if (tag(16, 4) !== synth.uid) return bad("The saved sound belongs to a different plugin than the preset header says.");
  return { ok: true, synth, preset, uid: synth.uid };
}

// The plugins' own preset files (only where the plugin writes its own, see "native" in synths.json):
//   VADER MY PRESETS: text file "USER 001.vader", first line "VADER 1".   SurgeXXL: a Surge patch, a VST2 .fxp chunk file ("CcnK" ... "FPCh").
export const MAX_NATIVE = 2 * 1024 * 1024;
export function nativeSynth(filename, synths) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return synths.find((s) => s.native && s.native.ext === ext);
}
// bytes: Uint8Array of the file. Returns {ok, synth, preset} or {ok:false, error}.
export function checkNative(filename, bytes, synths) {
  const synth = nativeSynth(filename, synths);
  if (!synth) return { ok: false, error: "This file type is not one of the plugins' preset files." };
  if (bytes.length === 0 || bytes.length > MAX_NATIVE) return { ok: false, error: "The file is empty or bigger than " + MAX_NATIVE / 1048576 + " MB." };
  const head = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));
  const base = filename.split("/").pop().replace(/\.[^.]+$/, "");
  if (synth.key === "vader") {
    if (bytes.length > 256 * 1024) return { ok: false, error: "A VADER preset is never this big." };
    const t = new TextDecoder().decode(bytes);
    if (!/^VADER 1\r?\n/.test(t) || /<script|<iframe/i.test(t)) return { ok: false, error: "This is not a VADER preset file (it should start with VADER 1)." };
    return { ok: true, synth, preset: base };
  }
  if (synth.key === "surgexxl") {
    if (head(0, 4) !== "CcnK" || head(8, 4) !== "FPCh") return { ok: false, error: "This is not a Surge patch (.fxp)." };
    return { ok: true, synth, preset: base };
  }
  return { ok: false, error: "No check for this file type yet." };
}
