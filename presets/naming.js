// The zip naming rule, shared by the page and the Worker.
//   pack:           AUTHOR-PACK NAME.zip
//   single preset:  PRESET NAME-TYPE.zip      (TYPE from synths.json; if none fits: Experimental)
// A name whose last part after "-" is a known type is a single preset; otherwise it is a pack (author = before the first "-").
// Inside each part hyphens, apostrophes, slashes and other odd characters are dropped, so the rule always parses back.
export const FALLBACK_TYPE = "Experimental";

export function cleanPart(s, max = 60) {
  return String(s ?? "").normalize("NFC").replace(/-/g, " ").replace(/[^\p{L}\p{N} _.&()+,!#@]/gu, "")
    .replace(/\s+/g, " ").trim().slice(0, max);
}
const findType = (t, types) => types.find((x) => x.toLowerCase() === String(t).trim().toLowerCase());

// fields: {kind:"pack"|"single", author, name, type}. Returns {ok, filename, kind, author, name, type} or {ok:false, error}.
export function compose(f, types) {
  const name = cleanPart(f.name, 70), author = cleanPart(f.author, 40);
  if (f.kind === "single") {
    const type = findType(f.type, types) || FALLBACK_TYPE;
    if (!name) return { ok: false, error: "Please give the preset a name." };
    return { ok: true, kind: "single", name, type, author, filename: name + "-" + type + ".zip" };
  }
  if (!author) return { ok: false, error: "Please add the author name." };
  if (!name) return { ok: false, error: "Please give the pack a name." };
  return { ok: true, kind: "pack", name, author, type: "Pack", filename: author + "-" + name + ".zip" };
}

// base: the file name without .zip. Returns {kind:"single",name,type} | {kind:"pack",author,name} | {error}
export function parseName(base, types) {
  const b = String(base).replace(/\.zip$/i, "").trim();
  const last = b.lastIndexOf("-");
  if (last > 0) {
    const type = findType(b.slice(last + 1), types);
    if (type && b.slice(0, last).trim()) return { kind: "single", name: b.slice(0, last).trim(), type };
  }
  const first = b.indexOf("-");
  if (first > 0 && b.slice(first + 1).trim()) return { kind: "pack", author: b.slice(0, first).trim(), name: b.slice(first + 1).trim() };
  return { error: "Name it AUTHOR-PACK NAME.zip, or PRESET NAME-TYPE.zip" };
}
