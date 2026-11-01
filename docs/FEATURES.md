# Features

Everything the app does today, grouped by area. Keep this file up to date: add a line whenever a feature is added, changed or removed, and a dated entry under [Changes](#changes). Why each learning feature works the way it does: [learning-algorithm.md](learning-algorithm.md). Ideas not built yet: [the report](../reports/Fretboard%20learning%20science%20ideas.md).

## Running the app
- Static PWA with no build step, ES modules only. It installs from Chrome or Edge and works offline (service worker, network first, cache as fallback).
- `start.bat` starts `serve.ps1`, a small PowerShell server on <http://localhost:8137>, and opens the browser. If the server is already running, it just opens the browser.
- The server keeps running through browser-cancelled requests and restarts its listener after any error.
- At any other local address (another port), a banner links back to the usual one, since each address has its own, separate storage.
- Local only, with no login.

## Audio input and pitch
- A single audio-input control, in Settings: device, input channel (for interfaces with several inputs), gain, noise gate, pitch clarity, latency offset, A4 reference.
- An input meter with per-channel levels and a marker for the noise gate, to test the chosen input.
- Pitch detection with the McLeod Pitch Method, plus a stabiliser so a ringing note counts once.
- Muted-strum detection: a short burst well above the noise gate with no clear pitch. Its level is set in Settings → Audio input, next to a live "strum heard" check.
- A Tuner tab: note, cents needle, frequency and the string targets of the current tuning.

## Board and zones
- **Instruments:** 6-, 7-, 8- and 9-string guitar, 4-, 5- and 6-string bass. Tuning: a **Standard / Drop** switch (drop lowers the lowest string a tone) and a slider moving **every string by semitones** (−7 to +5: one down = Eb standard, drop with two down = drop C), or a **custom tuning** on its own page, written lowest string first (e.g. `D2 A2 D3 G3 B3 E4`). Default: 6-string guitar in standard tuning. 12–24 frets. Left-handed view.
- **Progress follows each string** across instruments and tunings: a new or retuned string starts from scratch, strings left out keep their progress, switching back restores everything.
- Open-string menus page with "More…" when there are more choices than strings (4-string bass).
- SVG fretboard with inlays and fret numbers. No string names.
- **String order:** low E on top by default, like Rocksmith; Settings → Board can put it at the bottom, like tab. The same order is used on every board (Practice, Intervals, Stats) and in the open-string menus.
- Strings get thinner from low E (3.4 px) to high e (0.9 px).
- **Played notes vibrate:** the string waves between the fret played and the bridge (never between the nut and the fret), with closer and faster waves for higher notes, fading in about a second. Open strings chosen in a menu vibrate too.
- **Muted strums** make the strings give a short dead thump instead of waves.
- Zones of 12 cells holding each of the 12 notes once: boxes over several strings and/or 12 frets on one string. Answers must be the exact pitch.

## Navigation
- Top tabs: **Practice**, Tuner, Stats, Settings. Practice holds two kinds of quiz, switched at the top: **Note position** and **Interval**; the Practice tab reopens the last one used.
- **Settings** opens on a page of cards (Audio input, Instrument & tuning, Board display, Practice, Data & backups, Database tables), each opening its own page with a back button. **Custom tuning** is a page under Instrument & tuning. Clicking Settings again returns to the cards.

## Runs
- **New run** shows the zone with its natural notes; **Start run** (Enter or click) begins; **Stop run** (or Esc) ends it.
- Run length: a number of prompts, or a sprint in seconds.
- Run types, each either all guitar or all without guitar:
  - guitar: **Play the note** (you play the note named) and **Mix-ups** (a zone and prompts built from notes you have confused and the notes you played instead);
  - no guitar: **Name the note** (a position is marked; type its letter or click one of the 12 name buttons; both spellings of a sharp/flat count) and **True or false** (a position is marked with a name, right half the time; answer Yes or No with the buttons, Y/N or the arrow keys).
- **Zone choice:** before a run, the picked zone plus up to two other, different-looking zones are offered on the open-string menu.
- **Guitar-only control:**
  - a **muted strum** (strings damped by the fretting hand) takes the next step: new run, then start it; during a run it skips the wait after a miss, and two quick muted strums stop the run;
  - choices are made by playing an **open string**: the menu is drawn as the neck at the nut, with the string's letter left of each option. Between runs: E new run, A run type, D length (prompts / sprint), G beat mode, B Intervals tab; the run-type menu has the 4 types and Back; before a run, the offered zones;
  - the same rows can be clicked, or picked with keys 1–6 (1 = low E);
  - the Intervals tab has its own menu (E start a run, A back to Practice) and the same strums.
- **Beat mode** (♩ Beat): a metronome click, prompts on the beat, a prompt lasts 4 beats; the tempo starts near 2.5× your usual time per prompt, rises 3% after a right answer and falls 7% after a miss. With a sprint it is a sprint whose tempo follows your results.
- **Boss and closing note:** a prompts run of 6 or more ends with the zone's hardest note, then a note you know well (re-picked if you missed it in the run), so it ends on a success.
- **Golden prompts:** now and then a note you have been missing, marked gold, with its own effect when right.
- Prompts mix sharp and flat spellings.
- **Note names on the board** (Settings → Practice): Fade (default), None, All, Naturals only, Landmark frets only.
  - Fade: a name shows on positions you don't know well yet, goes after a right answer and comes back after a miss.
  - Check-ups and re-tests never show the asked note's name. Name-the-note runs show none.
- Next-notes queue: the next 4 prompts, shown only if the setting is on (off by default; play runs only).
- **During a run:** a live ring of the first-try accuracy, a glow that builds with fast right answers in a row (a miss lets it fade), and a clean board showing only the run (no mastery colours).
- **Between runs** the practice board shows each played position coloured by mastery, with fog over positions not unlocked yet.
- After a miss with the play-along setting on, the run moves on by itself after 6 s if you do not play the note.
- Green flash on a right answer, red at the played position on a wrong one, with the kind of mistake (octave, one or two frets off).
- **After a miss:** the answer is revealed with a structural hint (nearest landmark, octave shape, B-string shift), optionally played once ungraded, then re-tested 3–8 prompts later.
- **Answer shown automatically** after about 2.5× your expected time for that note (4–8 s, capped by the "Longest wait" setting). **Show me** (or H) shows it at any time. Both count as a miss.
- **Check-up prompts:** every 10th prompt is a random position of the zone, with no names shown, as an honest measure.
- **Before a run:** welcome back after a break, number of fading notes, and your practice plan if you wrote one.
- **After a run**, in this order: **Done**, the open-string **menu**, the **neck with the run's notes** (each position asked shows three progress rings — known, fast, automatic — with its name in front, in red if it was missed in this run), then the details: right first time, median vs usual time, check-ups, cued prompts, notes due tomorrow, a dot plot of answer times, faster-than-usual and needs-work lists, a near-miss line and the tempo change in beat mode.
- Keyboard and click fallback for playing without a guitar.

## Intervals
- An **Intervals** tab: a root is marked on the board and you play the note asked, from octave shapes (2 and 3 strings away) to intervals above the root, major and minor triads (three notes in order) and major-scale degrees (any octave, no root marked). Items open one by one as you know the earlier ones; a list shows each item as locked, learning (accuracy, answers, median time) or known. Runs use the Practice run length, an 8 s time-out (12 s for triads) that shows the answer, Enter to start, Esc to stop, and the same click and keyboard fallback. Answers are logged with task `interval` and an `interval` column; they do not enter the note model.

## Learning model
- FSRS-6 memory card per item (position × spelling, plus "name" cards), with a decay you can fit to your own answers.
- Grades 1–4 from right/wrong plus answer time compared with your expected time for that item. A first sighting is capped at Good.
- Speed model separate from memory: a running mean and spread of log answer time for each item, the same note name, and overall. "Fast" is measured against your own fast end.
- Answer times are not used for speed when the queue was visible or the note's own name was showing.
- Shared factors (string, fret region, natural/sharp/flat, spelling) estimate positions you haven't played much.
- Curriculum:
  - low E first, then A; high e mirrors low E;
  - octave-shape priors for new positions;
  - landmark frets and naturals first on a new string;
  - new zones unlock next to what you know.
- Zone choice aims at a target success rate of 75–85%, with a separate speed pressure. Once 8 or more notes are due, the run becomes a review of known zones.
- Within a run: weak and slow items come up more, notes you confuse are paired, re-tests come after misses, with guards against repeats.
- Mastered = right and fast on 2 or more days. Notes are due when their memory falls below 85%.
- Cued answers: with the asked note's own name showing, at most Hard; with other names showing, at most Good.
- The model rebuilds from the answer log when its format changes or when answers come back from the disk copy.

## Stats
- **Knowledge map** of the neck (Stats page, and the practice board between runs): each played position is a soft **pill-shaped cloud** whose colour goes red (weak) → orange → yellow → green (mastered), like the note bars below it, and which is **bigger and denser the more often it was asked** (growing mostly along the string), thinning out gradually towards its top and bottom. **Every position shows its note name**; unlocked positions not played yet have a dashed ring and a pale name.
- Cards: mastered, fading/due, typical answer time, your fast end, days practised this week, check-up accuracy, Name-the-note accuracy.
- Slowest positions, marked erratic or steady, and per-note figures.

## Model check (Settings → Data)
- Log loss against a constant guess, AUC, results split by time since the item was last asked, and calibration.
- Decay fit with a button to apply it and rebuild (or go back to the default).
- **Reliance on note names:** results by what the board showed, and a fitted odds multiplier for the asked note's own name and for nearby names.

## Data and storage
- Users: `user` for real progress, `test` for trying things (shown with a TEST DATA badge). More can be added.
- DuckDB-WASM (core v2.0.0-dev) with one file per user in the browser's private file system (OPFS). The worker is patched so a checkpoint really reaches the disk. Data is flushed after writes, at the end of each run, and when the page is hidden or closed.
- Tables: `kv` (settings and models), `attempts` (one row per prompt), `runs` (one row per run).
- `attempts` logs:
  - time to answer, time to the right note, each wrong note and when it was played;
  - the previous prompt;
  - predictions made before the answer;
  - error type, check-up, re-test and queue flags;
  - the names on the board and their distances.
- **IndexedDB safety copy** of every write. On start, the DuckDB file is repaired from it.
- **Disk copy** through the local server in `data\<user>\` (`attempts.jsonl`, `runs.jsonl`, `kv.json`).
  - On start, data missing on either side is copied across, so a wiped browser refills itself.
  - Saves wait and retry while the server is down.
- Automatic backups after each run (newest 10 plus the largest), restore from Settings, JSON export and import, reset.
- Settings → Database tables shows the newest rows of each table, with a description of every column.
- Storage persistence is requested. A header badge shows saved / saved in browser only / NOT SAVED.

## Docs
- [README.md](../README.md): running, storage, how it works.
- [learning-algorithm.md](learning-algorithm.md): the model and the reasons for each part.
- [design.md](design.md): the colour palette and how it is used.
- [reports/Fretboard learning science ideas.md](../reports/Fretboard%20learning%20science%20ideas.md): research and ideas not built yet.

## Changes
Newest first. Earlier work had no dated log; everything up to 2026-10-29 is folded into the sections above.

- **2026-11-01** — Pill-shaped clouds with a gradual vertical fade. After a run: Done, menu, then the run's notes on the neck (progress rings with names), then the details.
- **2026-11-01** — Confusion boxes removed. Knowledge-map clouds: red → orange → yellow → green like the note bars, rounder, soft progressive edges, size and density by questions asked; note names on the Stats map and on the practice board after a run. A finished run shows its results first. (#10 restored #6–#9, which had been merged into their stacked branches instead of main.)
- **2026-11-01** — Stats map: cloud shapes (yellow → green, size by questions asked, density by freshness) and confusion boxes for neighbouring notes. `tools/browser-check.mjs` records animated GIFs (`tools/gif.mjs`, no dependency).
- **2026-11-01** — Settings split into pages (custom tuning one level deeper); Practice tab with Note position / Interval inside; tuning as a Standard/Drop switch plus a semitone slider; vibrant greens (option 3: `#6fd94c`, `#3cbd2b`, `#27871a`). Fix: answers were saved with misaligned columns after the instrument columns were added (rows are now built by column name, with a start-up check).
- **2026-11-01** — Instruments: guitars with 6–9 strings and basses with 4–6, presets and custom tunings; knowledge follows each string by its open note (rebuilt from the log per instrument); answers and runs log `instrument` and `strings`; longer pitch window for low bass notes.
- **2026-11-01** — String order setting (low E on top by default, like Rocksmith) used on every board and menu; thicker low strings; played strings vibrate from the fret to the bridge, muted strums thump; no mastery colours on the board during a run; brighter greens.
- **2026-11-01** — New look: white page, the Born & Raised poster colours made a touch brighter, its beige for secondary backgrounds (docs/design.md), a beige fretboard drawn like a chord diagram, coloured number cards. Sticker buttons (dark outline, offset shadow; the chosen option filled yellow). Yes/No buttons now hide when a True or false run ends. `tools/browser-check.mjs` drives the app headless and takes screenshots.
- **2026-11-01** — Guitar-only control: muted strums and open-string menus (Practice and Intervals), strum level setting. True or false runs. Mixed runs removed: a run is all guitar or all without guitar. New column `attempts.shown_name`.
- **2026-11-01** — Practice: Mix-ups runs, zone choice, beat mode with adaptive tempo, boss and closing note, golden prompts, live progress board with fog, accuracy ring, momentum glow, per-note rings, near-miss lines, auto-advance after the play-along. New columns: `attempts.special`, `attempts.bpm`, `runs.focus`, `runs.bpm_start`, `runs.bpm_end`. The `data` folder is no longer tracked by git.
- **2026-11-01** — Intervals tab: octave shapes, intervals, triads and scale degrees, unlocked easiest first. New `interval` column in the answers table.

- **2026-10-31** — Cue-reliance estimate in the model check. This file added.
- **2026-10-30** — Note names on the board, with per-note fading, cue levels and cue logging (labels, distances). Check-ups are always unlabelled.
- **2026-10-30** — Disk copy of all data through the local server; server no longer stops on cancelled requests; warning at other local addresses.
