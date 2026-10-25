# Presets for the L'Cronx plugins

The public page is `presets.html`. People drop a zip on it, the zip lands in a **private** GitHub repo, and only what you
copy into `presets/packs/` is shown on the site.

## Naming rules (for people sending presets)

| What | Zip name | Example |
|-|-|-|
| A pack of presets | `AUTHOR-PACK NAME.zip` | `Sam-Dark Drones.zip` |
| One preset | `PRESET NAME-TYPE.zip` | `Warm Wall-Pad.zip` |

* `TYPE` is one of: Bass, Lead, Pad, Keys, Pluck, Strings, Brass, Arp, Sequence, Drone, Texture, Ambient, FX, Percussion,
  Drums, Vocal, Filter, Init. **If none fits, use `Experimental`.** (The list lives in `presets/synths.json`.)
* One dash `-` between the parts, none inside them. A name whose last part is a type is read as a single preset;
  anything else is read as `AUTHOR-PACK NAME`.
* Apostrophes, slashes and other odd characters are dropped from names (they would break scripts and paths).
* Two kinds of preset file are accepted, and may be mixed in one zip: the Force / MPC `.xpl` presets (every plugin), and a plugin's
  **own** preset files where it has them: VADER MY PRESETS (`USER 001.vader`, text starting `VADER 1`) and SurgeXXL patches (`.fxp`).
  PhyXXL and DroneXXL have no files of their own, so for them it is `.xpl`. Plus an optional `.txt` or `.md` readme. Up to 8 MB,
  300 files, 400 KB per `.xpl`, 2 MB per `.fxp`. Every file must belong to one of the plugins in `synths.json`.
  Add a plugin's own format by giving it a `native` entry in `synths.json` and a check in `xpl-check.js` (`checkNative`).
* The page reads the zip and shows what is inside; if the name does not follow the rule it fills in the form for the sender and
  shows the name it will file the zip under.

## How you screen and publish

1. A new **issue** appears in the private `sunskiefer/preset-inbox` repo (label `new`), with links to the zip and a small `.json`
   (author, link, notes). GitHub emails you / notifies the app.
2. The automatic checks only prove the file is a proper preset zip for your plugins. **Listening is yours.**
   Download it, try it on a Force.
3. To list it: add the zip **and its .json** to `presets/packs/` in this repo (GitHub web: *Add file > Upload files*).
   A workflow rebuilds `presets/index.json` and the page shows it. To drop one later, delete the zip or put
   `"listed": false` in its `.json`.
4. Close the issue in the inbox.

A zip without a `.json` is listed too; the author is then read from the file name (packs) or shown as "Unknown" (single presets).

## Files

* `presets.html`, `xpl-check.js`, `zip-check.js`, `naming.js`: the page and its checks (the Worker uses the same files).
* `synths.json`: plugins (name, 4-letter ID, effect or instrument) and the type list. Add a new plugin here when it ships.
* `index.json`: built by `tools/build_presets_index.py` (run by `.github/workflows/presets-index.yml`). Do not edit by hand.
* `config.js`: the address of the inbox Worker. Empty = uploads show "open soon".
* `../worker/`: the small Cloudflare Worker that receives uploads. Setup: `worker/README.md`.
