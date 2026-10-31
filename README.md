# Fretboard Trainer

Learn the guitar fretboard by playing. The app listens to your guitar (DI through an audio interface, or a mic), asks for notes inside a zone of the neck, and uses spaced repetition to focus on what you find hard: the note, its exact position, the shape of the zone, and how fast you answered.

## Run locally

Double-click `start.bat`. It starts a tiny PowerShell server on <http://localhost:8137> and opens your browser (Chrome or Edge recommended). If the server is already running, it just opens the browser. Keep the server window open while you practise: it also saves the disk copy of your data (see below). Then:

1. **Settings → Audio input**: pick your interface and the input channel your guitar is plugged into. Adjust the gain so the meter moves when you play.
2. **Tuner**: tune up and check the notes read cleanly.
3. **Practice → Start run**.

Everything the app does, with a dated change log: [docs/FEATURES.md](docs/FEATURES.md). How the app picks notes and models your memory, and why: [docs/learning-algorithm.md](docs/learning-algorithm.md). Ideas not yet built, with their evidence: [reports/Fretboard learning science ideas.md](reports/Fretboard%20learning%20science%20ideas.md).

## Users and storage

Data lives in **DuckDB** (WASM build of core v2.0.0-dev, pinned in `vendor/duckdb/VERSION`). Each user gets its own database file in the browser's private file system: `opfs://fretboard-<user>.duckdb`. It has three tables:
- `kv` holds settings and models.
- `attempts` holds one row per prompt: the first answer and its time, the time to the right note, each wrong note and when it was played, and the prompt asked just before.
- `runs` holds one row per run: zone, mode (prompts or sprint) and its length, settings in use, and how it ended (`completed`, `time_up`, `stopped`, `left` for another tab or a board change, `closed` if the page was closed mid-run). `attempts.run_id` links the two.

**Settings → Database tables** shows the newest rows of both log tables and what each column means (hover a column header too). The column documentation lives in `TABLES` in `js/storage.js`, which also defines the schema.

**Durability.** In this DuckDB-WASM build the browser hook behind DuckDB's fsync was empty, so a `CHECKPOINT` never forced the file to disk. `vendor-duckdb.ps1` patches the worker so it flushes the OPFS file handle. The app checkpoints 1.5 s after each write, right after every run ends (finished, stopped or abandoned), and when the tab is hidden or closed.

The OPFS file support in this DuckDB dev build has lost data, so every write also goes to a **safety copy in IndexedDB** (`js/mirror.js`, written with strict durability). When the app starts, it compares the DuckDB file with the safety copy. If the file is missing answers or settings, it is rebuilt from the copy and a banner says so. The automatic backups (Settings → Data) are a third, separate layer.

**Disk copy.** All of the above lives in the browser, so "clear site data", another browser, another Chrome profile or another address (`127.0.0.1`, another port) would lose or hide all of it at once. So every write is also sent to the local server, which saves it under `data\<user>\` next to the app (`js/disk.js`, the `/api/` part of `serve.ps1`):
- `attempts.jsonl`: one answer per line, only ever appended to.
- `runs.jsonl`: one run row per line (a run is written when it starts and when it ends; the last line wins).
- `kv.json`: settings and models, replaced whole; the previous version is kept as `kv.json.bak`.

The server writes straight through to the disk before it answers. When the app starts, it compares the browser with the disk copy and copies whatever is missing in either direction, matching answers by time and position. Answers that come back from the disk make the app rebuild the model from the log, and a banner says how many came back. If the server is not running, the badge shows *saved in browser only*, and the writes waiting are sent when the server is back (checked every 30 s). A reset or a JSON import replaces the disk copy too. The files are plain JSON lines: back up the `data` folder like any other, or query it with DuckDB, for example `select * from read_json('data/user/attempts.jsonl')`.

Answers are only ever added in this sync, never deleted. If you reset a user in one browser while another browser still has that user's answers, the other browser puts them back on its next start.

The app also warns when it is opened at a local address other than <http://localhost:8137>, because the browser keeps a separate, empty storage for each address.

- Pick the user in the header. Use **`test`** for trying things out; it shows an orange *TEST DATA* badge. Use **`user`** for your real progress. You can add more users with *+ New user…*.
- To query the active user's database from the browser console, run `await ft.sql("select fret, avg(ms) from attempts group by fret")`. Use it for reading only: changes made this way skip the safety copy and are undone at the next start.
- **Settings → Data → Export JSON** makes a backup of the current user. Use it to move to another computer; on this one the disk copy already covers a lost browser.
- Keep the app open in only one tab at a time. A database file can only be opened by one tab; if two tabs are open, the badge shows *NOT SAVED*.
- To upgrade DuckDB, run `powershell -File vendor-duckdb.ps1 -Version <npm version>` and bump the cache name in `sw.js`.

## How it works

- **Zones**: 12 cells holding each of the 12 notes exactly once. These are either compact boxes over 3–4 strings or 12 frets on one string. Answers must be the exact pitch, so there is only one right spot.
- **Instruments**: 6- to 9-string guitars and 4- to 6-string basses, presets or custom tunings. Progress follows each string by its open note, so switching instruments keeps what the strings have in common (`js/instruments.js`).
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
- `node tools/browser-check.mjs tools/tour.mjs --out <folder>`: opens the app in headless Edge as user `test`, walks through the main screens and saves a screenshot of each (the server must be running).

Colours and design rules: [docs/design.md](docs/design.md).

## Hosting / mobile later

This is a static site with no build step. To host it, upload the folder to any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages). The microphone needs HTTPS or localhost. It's an installable PWA. For app stores, wrap it with Capacitor. Persistence is isolated in `js/storage.js`, so you can swap that module to add sync or accounts. A static host has no `/api/`, so the disk copy is simply off there (the badge says *saved in browser only*).
