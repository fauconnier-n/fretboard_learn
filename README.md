# Fretboard Trainer

[![Live on GitHub Pages](https://img.shields.io/github/v/release/fauconnier-n/fretboard_learn?label=live%20on%20GitHub%20Pages)](https://github.com/fauconnier-n/fretboard_learn/releases/latest)

Learn the guitar fretboard by playing. The app listens to your guitar (DI through an audio interface, or a mic), asks for notes inside a zone of the neck, and uses spaced repetition to focus on what you find hard: the note, its exact position, the shape of the zone, and how fast you answered.

## Run it

The app is at <https://fauconnier-n.github.io/fretboard_learn/> (Chrome or Edge recommended; it installs as an app). It always runs the [latest release](https://github.com/fauconnier-n/fretboard_learn/releases/latest), whose number is in the badge above and in the app under Settings → Data. On the first start it asks for a name and where to keep your data: a folder you pick (one inside OneDrive or Dropbox follows you to another computer), or just the browser. See [Profiles and storage](#profiles-and-storage).

To run it on your own computer instead, double-click `start.bat`. It starts a tiny PowerShell server on <http://localhost:8137> and opens your browser (Chrome or Edge recommended). If the server is already running, it just opens the browser. Keep the server window open while you practise: it also saves the disk copy of your data (see below). Then:

1. **Settings → Audio input**: pick your interface and the input channel your guitar is plugged into. Adjust the gain so the meter moves when you play.
2. **Tuner**: tune up and check the notes read cleanly.
3. **Practice → Start run**.

Everything the app does, with a dated change log: [docs/FEATURES.md](docs/FEATURES.md). How the app picks notes and models your memory, and why: [docs/learning-algorithm.md](docs/learning-algorithm.md). Ideas not yet built, with their evidence: [reports/Fretboard learning science ideas.md](reports/Fretboard%20learning%20science%20ideas.md).

## Profiles and storage

A **profile** is a name and a place where its data is copied. The first start offers to open an existing profile folder (from another computer, say) or to make a profile: a name, then *a folder I choose* (the app makes `fretboard-<name>` inside the location you pick), *the `data` folder next to the app* (when the app runs from `start.bat`) or *just this browser*; then the instrument and tuning page, which can be changed any time. With two or more profiles the app asks who is practising when it opens; the header switch changes profile meanwhile, and *+ New profile…* adds one. Each profile has its own database; `test` is meant for trying things out.

Data lives in **DuckDB** (WASM build of core v2.0.0-dev, pinned in `vendor/duckdb/VERSION`). Each profile gets its own database file in the browser's private file system: `opfs://fretboard-<name>.duckdb`. It has three tables:
- `kv` holds the settings and, per set of strings, what the model keeps between starts: its version and `meta` (difficulty target, run history, best runs, fitted decay). The knowledge itself (cards, note stats, contexts, confusions) is replayed from `attempts` at every start and saved only at the end of a run, so answering costs one row, not a 100 KB rewrite.
- `attempts` holds one row per prompt: the first answer and its time, the time to the right note, each wrong note and when it was played, and the prompt asked just before.
- `runs` holds one row per run: zone, mode (prompts or sprint) and its length, settings in use, and how it ended (`completed`, `time_up`, `stopped`, `left` for another tab or a board change, `closed` if the page was closed mid-run). `attempts.run_id` links the two.

**Settings → Database tables** shows the newest rows of both log tables and what each column means (hover a column header too). The column documentation lives in `TABLES` in `js/storage.js`, which also defines the schema.

**Durability.** In this DuckDB-WASM build the browser hook behind DuckDB's fsync was empty, so a `CHECKPOINT` never forced the file to disk. `vendor-duckdb.ps1` patches the worker so it flushes the OPFS file handle. The app checkpoints 1.5 s after each write, right after every run ends (finished, stopped or abandoned), and when the tab is hidden or closed.

The OPFS file support in this DuckDB dev build has lost data, so every write also goes to a **safety copy in IndexedDB** (`js/mirror.js`, written with strict durability). When the app starts, it compares the DuckDB file with the safety copy (counts, settings and runs first; every answer only when those disagree). If the file is missing answers or settings, it is rebuilt from the copy and a banner says so. The automatic backups (Settings → Data) are a third, separate layer; each is stored with a summary, so listing them stays cheap.

**Disk copy.** All of the above lives in the browser, so "clear site data", another browser, another Chrome profile or another address (`127.0.0.1`, another port) would lose or hide all of it at once. So every write also goes to the profile's folder (`js/disk.js`, layout in `js/disklayout.js`): a folder you picked, written by the browser itself (File System Access API: Chrome and Edge on a computer; `js/diskFolder.js`), or `data\<name>\` next to the app, written by the local server (the `/api/` part of `serve.ps1`). Both hold the same files:
- `profile.json`: the profile's name.
- `attempts/<time>-<run id>.jsonl`: the answers of one run, one per line, only ever appended to. One small file per run, so a synced folder uploads little after each answer and two computers never write the same file.
- `runs/<time>-<run id>.jsonl`: that run's row, written when it starts and when it ends (the last line wins).
- `kv.json`: settings and the models' meta, replaced whole (the server keeps the previous version as `kv.json.bak`).
- `attempts.jsonl` and `runs.jsonl` from earlier versions are still read, never written.

When the app starts, it compares the browser with the folder and copies whatever is missing in either direction, matching answers by time and position and runs by id. Answers that come back from the folder make the app rebuild the model from the log, and a banner says how many came back. Without a reachable copy the badge shows *saved in browser only* (or *folder: reconnect* when the browser wants your permission again: the app remembers the folder, Chrome remembers the permission once the app is installed or you choose "Allow on every visit"); with the server down, the writes waiting are sent when it is back (checked every 30 s). A reset or a JSON import replaces the copy too. The files are plain JSON lines: back up the folder like any other, or query it with DuckDB, for example `select * from read_json('data/user/attempts/*.jsonl')`.

Answers are only ever added in this sync, never deleted. If you reset a profile in one browser while another browser still has its answers, the other browser puts them back on its next start.

**Settings → Data** manages the folder (*Create a folder…* or *Move to a new folder…* makes a fresh `fretboard-<name>` folder where you choose and copies everything there, leaving the old one as it is; *Use an existing folder…* points the profile at one; *Disconnect*), and other profiles' data: **Bring / sync** adds another profile's answers and runs to this one (from its safety copy in this browser, its folder, or any folder you pick), tagged with the `origin` column, and only what is new on a second pass; each origin can be removed again. Settings and models are not copied: the model is rebuilt from the whole log.

The app also warns when it is opened at a local address other than <http://localhost:8137>, because the browser keeps a separate, empty storage for each address.

- To query the active profile's database from the browser console, run `await ft.sql("select fret, avg(ms) from attempts group by fret")`. Use it for reading only: changes made this way skip the safety copy and are undone at the next start.
- **Settings → Data → Export JSON** makes a backup of the current profile. A profile folder inside OneDrive or Dropbox is the easier way to another computer: open it there with *Open my folder…*.
- Keep the app open in only one tab at a time. A database file can only be opened by one tab; if two tabs are open, the badge shows *NOT SAVED*.
- To upgrade DuckDB, run `powershell -File vendor-duckdb.ps1 -Version <npm version>` and bump the cache name in `sw.js`. The script applies two patches to the worker: the fsync one above, and one that makes it load the wasm module with a plain `fetch`, so the browser can keep the compiled code between starts instead of compiling 34 MB every time. The service worker serves the vendored files from its cache first (they are version pinned), the app's own files network first; the server answers conditional requests with 304 and marks the vendored files immutable. Restart `start.bat` after changing `serve.ps1`.

## How it works

- **Zones**: 12 cells holding each of the 12 notes exactly once. These are either compact boxes over 3–4 strings or 12 frets on one string. Answers must be the exact pitch, so there is only one right spot.
- **Instruments**: 6- to 9-string guitars and 4- to 6-string basses; standard or drop tuning shifted by semitones, or a custom tuning. Progress follows each string by its open note, so switching instruments keeps what the strings have in common (`js/instruments.js`).
- **Runs**: a number of prompts or a sprint; on the guitar (play the note, mix-ups) or without it (name the note, true or false); optional beat mode whose tempo follows your answers. Pick one of up to three offered zones. The whole flow can be driven from the guitar: a muted strum takes the next step, two stop a run, and choices sit on the open strings. Prompts focus on weaker cells and can repeat; a prompts run ends with its hardest note, then a note you know. The board shows your progress live, with fog over locked positions.
- **Two signals per note and position**, kept apart (see `js/srs.js`):
  - *memory*, from right/wrong only (a wrong answer or a timeout is a miss): stability, difficulty and accuracy;
  - *speed*, from the time of each right first answer: a running average of log answer time, with no buckets. While a position has few answers, its estimate leans on the same note name, then on your overall typical time.

  Prompts favour positions you are forgetting and positions that are right but slow, or slower than your usual. The answer log keeps every time, including time to the right note and each wrong note, so *Rebuild model from log* can replay it.
- **Note names on the board**: by default, a name label shows on the zone positions you don't know well yet and is dropped as you answer them right (Settings → Practice). Check-ups never show labels. Each answer logs the labels shown and their distance to the note asked. Details: [docs/learning-algorithm.md](docs/learning-algorithm.md).
- **Memory model**: each position (string + fret) is an FSRS-style card. There are also per-note stats and a per-position history tagged by zone *shape* (centroid, strings, span, where the cell sits in the shape), so weaknesses carry over to similar zones.
- **Intervals tab**: a marked root and a question to play: octave shapes first, then intervals, triads and scale degrees, each opening once the earlier ones are known (`js/intervals.js`).
- **Curriculum**: zones are picked to match a target predicted success, by default 80%, which adapts to your results. It starts on low E / low frets and unlocks material next to what you already know. With 8 or more items due, the run is a review and no new material is offered until the backlog is down.

## Development

The app needs no build. Node is only used for dev checks (`npm install` once):
- `npm test`: tests for the pure logic in `music.js`, `srs.js` and `zones.js` (Node's built-in runner, `tests/`).
- `npm run lint`: ESLint.
- `npm run typecheck`: type-checks the modules that start with `// @ts-check`.
- `node tools/browser-check.mjs tools/tour.mjs --out <folder>`: opens the app in headless Edge as profile `test`, walks through the main screens and saves a screenshot of each (the server must be running). `tools/profiles.mjs` (with `--fresh --no-seed`) walks the welcome screen, the picker and the Data page; `tools/hosted.mjs` does the same against `node tools/static.mjs`, a plain static server, with `--host fretboard.test --secure` so the app behaves as on GitHub Pages.
- The checks also run on GitHub for every pull request (`.github/workflows/pages.yml`).
- `npm run perf` (`node tools/perf.mjs [--out file.json] [--compare baseline.json] [--seed k]`): measures the app headless as user `test`: cold and warm start (the `app:*` and `db:*` marks of `js/main.js` and `js/storage.js`, visible in the console with `performance.getEntriesByType('mark')`), a run of answers and what it writes, layouts and paints per second during a run, the Stats tab, the end-of-run backup. `--seed k` multiplies the test user's answer log k times first. `tools/cdp.mjs` holds the headless-browser plumbing shared by both tools.

Colours and design rules: [docs/design.md](docs/design.md).

## Hosting

The site at <https://fauconnier-n.github.io/fretboard_learn/> is GitHub Pages. Publishing a [release](https://github.com/fauconnier-n/fretboard_learn/releases) (`vX.Y.Z`, semantic versions) runs the checks and deploys that tag, with the version written into `js/version.js`; pushes and pull requests to `main` only run the checks (`.github/workflows/pages.yml`). So the current release is always what the site runs. Work happens on the `dev` branch; `main` only moves at a release. It is a static site with no build step, so any HTTPS static host would do; the microphone needs HTTPS or localhost. It's an installable PWA. For app stores, wrap it with Capacitor. A static host has no `/api/`, so there the disk copy is the folder the user picks (Chrome and Edge on a computer) or nothing (the badge says *saved in browser only*).
