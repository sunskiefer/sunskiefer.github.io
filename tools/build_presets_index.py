#!/usr/bin/env python3
"""Builds presets/index.json from the zips in presets/packs/.

A zip is named  AUTHOR-PACK NAME.zip  (a pack)  or  PRESET NAME-TYPE.zip  (one preset), see presets/README.md.
Next to a zip there may be a .json of the same name (author, link, notes, date) as the inbox writes it.
What is in presets/packs/ is what the site lists. To hide one, put  "listed": false  in its .json, or delete the zip.
"""
import json, os, re, subprocess, sys, zipfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PK = os.path.join(ROOT, "presets", "packs")
cfg = json.load(open(os.path.join(ROOT, "presets", "synths.json")))
TYPES = {t.lower(): t for t in cfg["types"]}
NATIVE = {x["native"]["ext"]: x for x in cfg["synths"] if x.get("native")}
BY_UID = {"".join("%02x" % ord(c) for c in s["uid"]): s for s in cfg["synths"]}


def parse(base):
    last = base.rfind("-")
    if last > 0 and base[last + 1:].strip().lower() in TYPES and base[:last].strip():
        return dict(kind="single", name=base[:last].strip(), type=TYPES[base[last + 1:].strip().lower()], author="")
    first = base.find("-")
    if first > 0 and base[first + 1:].strip():
        return dict(kind="pack", author=base[:first].strip(), name=base[first + 1:].strip(), type="Pack")
    return None


def unesc(s):
    return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'")


def git_date(path):
    try:
        out = subprocess.run(["git", "log", "--diff-filter=A", "--format=%as", "-1", "--", path], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        return out or None
    except Exception:
        return None


def main():
    out, problems = [], []
    for fn in sorted(os.listdir(PK)) if os.path.isdir(PK) else []:
        if not fn.lower().endswith(".zip"):
            continue
        base = fn[:-4]
        info = parse(base)
        if not info:
            problems.append("%s: name does not follow the rule" % fn); continue
        side = {}
        sp = os.path.join(PK, base + ".json")
        if os.path.exists(sp):
            side = json.load(open(sp))
        if side.get("listed") is False:
            continue
        synths, presets = {}, []
        try:
            with zipfile.ZipFile(os.path.join(PK, fn)) as z:
                for n in z.namelist():
                    ext = n.rsplit(".", 1)[-1].lower() if "." in n else ""
                    if n.startswith("__MACOSX/") or n.endswith("/"):
                        continue
                    if ext in NATIVE:   # a plugin's own preset file: VADER "VADER 1" text, SurgeXXL .fxp chunk file
                        raw = z.read(n)
                        ok = raw.startswith(b"VADER 1") if ext == "vader" else raw[:4] == b"CcnK" and raw[8:12] == b"FPCh"
                        if not ok:
                            problems.append("%s: %s is not a valid %s file" % (fn, n, NATIVE[ext]["native"]["what"])); continue
                        synths[NATIVE[ext]["key"]] = NATIVE[ext]["name"]
                        presets.append(os.path.splitext(os.path.basename(n))[0])
                        continue
                    if ext != "xpl":
                        continue
                    t = z.read(n).decode("utf-8", "replace")
                    m = re.search(r'<PLUGIN\b[^>]*\buid="([0-9a-fA-F]{8})"', t)
                    pm = re.search(r"<preset>([^<]{1,100})</preset>", t)
                    s = BY_UID.get(m.group(1).lower()) if m else None
                    if not s or not pm:
                        problems.append("%s: %s is not a preset for one of the plugins" % (fn, n)); continue
                    synths[s["key"]] = s["name"]
                    presets.append(unesc(pm.group(1).strip()))
        except zipfile.BadZipFile:
            problems.append("%s: not a zip" % fn); continue
        if not presets:
            problems.append("%s: no usable presets inside" % fn); continue
        author = side.get("author") or info["author"] or "Unknown"
        out.append(dict(
            id=re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-"), kind=info["kind"], name=info["name"], type=info["type"], author=author,
            link=side.get("link", ""), notes=side.get("notes", ""), date=side.get("date") or git_date("presets/packs/" + fn) or "",
            synths=[dict(key=k, name=v) for k, v in sorted(synths.items(), key=lambda kv: kv[1].lower())],
            count=len(presets), presets=presets[:40], file="presets/packs/" + fn, listed=True))
    out.sort(key=lambda e: (e["date"], e["name"]), reverse=True)
    with open(os.path.join(ROOT, "presets", "index.json"), "w") as f:
        json.dump({"presets": out}, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("%d listed" % len(out))
    for p in problems:
        print("SKIPPED", p)
    return 1 if problems and "--strict" in sys.argv else 0


sys.exit(main())
