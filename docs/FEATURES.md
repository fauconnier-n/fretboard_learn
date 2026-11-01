# Features

Everything the app does today, grouped by area. Keep this file up to date: add a line whenever a feature is added, changed or removed, and a dated entry under [Changes](#changes). Why each learning feature works the way it does: [learning-algorithm.md](learning-algorithm.md). Ideas not built yet: [the report](../reports/Fretboard%20learning%20science%20ideas.md).

## Running the app
- Static PWA with no build step, ES modules only. It installs from Chrome or Edge and works offline (service worker: the app's files network first with the cache as fallback; the vendored DuckDB files cache first, since they are version pinned and 34 MB; it clears only its own caches, since every site on `user.github.io` shares the origin).
- Hosted at <https://fauconnier-n.github.io/fretboard_learn/> by GitHub Pages: publishing a release `vX.Y.Z` runs `npm test`, `npm run lint` and `npm run typecheck` and deploys that tag, stamped into `js/version.js` (shown in Settings → Data and on the title's tooltip); pushes and pull requests to `main` run the checks only (`.github/workflows/pages.yml`). The site always runs the latest release.
- `start.bat` starts `serve.ps1`, a small PowerShell server on <http://localhost:8137>, and opens the browser. If the server is already running, it just opens the browser.
- The server keeps running through browser-cancelled requests and restarts its listener after any error.
- At any other local address (another port), a banner links back to the usual one, since each address has its own, separate storage.
- No login. **Profiles** instead: the first start asks who is practising and where the data lives (a folder you choose, the `data` folder next to the app, or just this browser; or *Open my folder…* for a profile folder from another computer), then shows the instrument and tuning page ("no stress, you can change them later"). With two or more profiles the app asks which one on every start; the header switch changes mid-session, *+ New profile…* adds one.

## Audio input and pitch
- A single audio-input control, in Settings: device, input channel (for interfaces with several inputs), gain, noise gate, pitch clarity, latency offset, A4 reference.
- An input meter with per-channel levels and a marker for the noise gate, to test the chosen input.
- Pitch detection with the McLeod Pitch Method, in two stages (the whole lag range on the signal averaged down to 12 kHz, then the chosen peak refined at full rate, so the result is the full-rate one at a sixth of the cost), plus a stabiliser so a ringing note counts once. The audio context runs at 48 kHz whatever the interface's rate.
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
  - no guitar: **Name the note** (a position is marked; type its letter or click one of the 12 name buttons, laid out like a piano with the sharps or flats on top, centred between their naturals; the buttons show sharps or flats as set in Settings → Practice, and both spellings of a sharp/flat count) and **True or false** (a position is marked with a name, right half the time; answer Yes or No with the buttons, Y/N or the arrow keys).
- **Zone choice:** before a run, the picked zone plus up to two other, different-looking zones are offered on the open-string menu.
- **Guitar-only control:**
  - **muted strums** (strings damped by the fretting hand): outside a run, two quick ones go back to the previous menu (a single one does nothing, so a stray strum starts nothing); during a run a single one skips the wait after a miss and three quick ones stop the run (saved with `end_reason` `strum_stop`). The main step of each menu (New run, Start the run) is green, like the main button;
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
- **Between runs** the practice board shows each played position coloured by mastery, with fog over positions not unlocked yet, and a legend under it (colours, size, dashed ring for unlocked but not played, cross-hatched for locked). A new player starts on one run of frets from the nut on each string.
- After a miss with the play-along setting on, the run moves on by itself after 6 s if you do not play the note.
- Green on a right answer, red at the played position on a wrong one, with the kind of mistake (octave, one or two frets off). **Answer animation:** green confetti thrown out of the asked note on a right answer, red fireworks on a wrong one.
- **During a run the board zooms in on the zone** (up to 2×), and the circles and note names on it are a little bigger. The view is at most six strings high, so on a 7–9-string guitar it frames the strings around the zone.
- **During a run** the run settings (Note position / Interval, run type, Prompts / Sprint, length) step aside: they are the menu before a run; only Stop, the score ring and the progress stay. The prompt is two fixed, invisible boxes: the note with Show me under it on the left (aligned right), the short texts, timer and answer buttons on the right (aligned left), so a long hint never moves the note. Run types are grouped as *With an instrument* and *No instrument on hand*.
- **On phones, during a run** the header and banners slide away too, so the board fits on screen (checked for every run type with 6 and 9 strings).
- The board never moves during a run: "Show me" keeps its place when hidden, and the text under the note has room for two lines.
- **After a miss:** the answer is revealed with a structural hint (nearest landmark, octave shape, B-string shift), optionally played once ungraded, then re-tested 3–8 prompts later.
- **Answer shown automatically** after about 2.5× your expected time for that note (4–8 s, capped by the "Longest wait" setting). **Show me** (or H) shows it at any time. Both count as a miss.
- **Check-up prompts:** every 10th prompt is a random position of the zone, with no names shown, as an honest measure.
- **Before a run:** welcome back after a break, number of fading notes, and your practice plan if you wrote one.
- **After a run**, in this order: **Done**, the open-string **menu**, the **neck with the run's notes** (each position asked shows its name on the left, in red if it was missed in this run, and three small bars on the right: known in green, fast in yellow, automatic in ink; a legend sits under the board; hovering a position opens a popup with what happened in the run, and a click or tap pins it (a grey cross or a click elsewhere closes it); a switch shows **This run** or **All runs**, the knowledge map of every run on this instrument and tuning). Popups appear only after a run and on the Stats map, never before or during a run), then the details: right first time, median vs usual time, check-ups, cued prompts, notes due tomorrow, a dot plot of answer times, faster-than-usual and needs-work lists, a near-miss line and the tempo change in beat mode.
- Keyboard and click fallback for playing without a guitar.

## Intervals
- An **Intervals** tab: a root is marked on the board and you play the note asked, from octave shapes (2 and 3 strings away) to intervals above the root, major and minor triads (three notes in order) and major-scale degrees (any octave, no root marked). Items open one by one as you know the earlier ones; a list shows each item as locked, learning (accuracy, answers, median time) or known. Runs use the Practice run length, an 8 s time-out (12 s for triads) that shows the answer, Enter to start, Esc to stop, and the same click and keyboard fallback. Answers are logged with task `interval` and an `interval` column; they do not enter the note model.

## Learning model
- FSRS-6 memory card per item (position × spelling, plus "name" cards), with a decay you can fit to your own answers.
- Grades 1–4 from right/wrong plus answer time compared with your expected time for that item. A first sighting is capped at Good.
- Speed model separate from memory: a running mean and spread of log answer time for each item, the same note name, and overall. "Fast" is measured against your own quickest 10% of right answers.
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
- **Knowledge map** of the neck (Stats page, the practice board between runs, and *All runs* after a run): each played position is a small card like the run results, its name and three bars over all runs: **known** (coloured red when weak through orange and yellow to green), **fast** (light grey) and **automatic** (ink). Unlocked positions not played yet have a dashed ring and a pale name; locked ones are cross-hatched on the practice board. Hovering or clicking a position (Stats, after a run) opens a popup beside it on the board, and the position is highlighted (yellow card, ink outline) like the card at the top of the popup.
- **Notes:** accuracy and typical time per note name; open a note to see it **per octave** (C2, C3, C4…), from the positions of that name in each octave.
- **Progress** (full width): answers in the last 7 days, right-first-time and typical answer time against the 7 days before (▲▼ coloured by whether it is better), and four charts: right first time per run and median answer time per run (each dot a run, the line the mean of the last 8), answers per day over 30 days, and positions answered right at least once over 30 days. Note-position quizzes on the current strings.
- Cards: mastered, fading/due, typical answer time, your quickest 10%, days practised this week, check-up accuracy, Name-the-note accuracy.
- Slowest positions, marked erratic or steady, and per-note figures.

## Model check (Settings → Data)
- Log loss against a constant guess, AUC, results split by time since the item was last asked, and calibration.
- Decay fit with a button to apply it and rebuild (or go back to the default).
- **Reliance on note names:** results by what the board showed, and a fitted odds multiplier for the asked note's own name and for nearby names.

## Data and storage
- Profiles, each with its own database; `test` is for trying things.
- DuckDB-WASM (core v2.0.0-dev) with one file per profile in the browser's private file system (OPFS). The worker is patched so a checkpoint really reaches the disk. Data is flushed after writes, at the end of each run, and when the page is hidden or closed.
- Tables: `kv` (settings, and per instrument the model's version and `meta`: target, run history, best runs, fitted decay; the cards themselves are replayed from the log at every start), `attempts` (one row per prompt), `runs` (one row per run).
- `attempts` logs:
  - time to answer, time to the right note, each wrong note and when it was played;
  - the previous prompt;
  - predictions made before the answer;
  - error type, check-up, re-test and queue flags;
  - the names on the board and their distances.
- **IndexedDB safety copy** of every write. On start, the DuckDB file is repaired from it.
- **Disk copy** in the profile's folder: one the user picked (written by the browser, File System Access API, Chrome and Edge on a computer; the browser may ask for permission again on a later visit: *Reconnect*) or `data\<name>\` next to the app through the local server. Same layout in both: `profile.json`, `kv.json`, and one small append-only file per run under `attempts/` and `runs/`; the flat files of earlier versions are still read.
  - On start, data missing on either side is copied across, so a wiped browser refills itself; a profile folder opened on another computer brings everything along.
  - Saves wait and retry while the server is down; without any copy (a hosted site, no folder chosen) nothing is queued and a later sync catches up by comparing keys.
  - Settings → Data: create or move to a new `fretboard-<name>` folder, use an existing one, disconnect.
- **Bring / sync from another profile** (Settings → Data): another profile's answers and runs are added to this one, tagged with `origin` (a column of both log tables), only what is new on a second pass; each origin can be removed again. Settings and models are not copied; the model is rebuilt from the log. The log tables stay a union of rows: every column nullable, rows built by column name (checked at start).
- Automatic backups after each run (newest 10 plus the largest), restore from Settings, JSON export and import, reset. The list of backups is read from their summaries; the full copies are opened only to restore one.
- Settings → Database tables shows the newest rows of each table, with a description of every column.
- Storage persistence is requested. A header badge shows saved to disk / saved to folder / folder: reconnect / saved in browser only / NOT SAVED.

## Docs
- [README.md](../README.md): running, storage, how it works.
- [learning-algorithm.md](learning-algorithm.md): the model and the reasons for each part.
- [design.md](design.md): the colour palette and how it is used.
- [reports/Fretboard learning science ideas.md](../reports/Fretboard%20learning%20science%20ideas.md): research and ideas not built yet.

## Changes
Newest first. Earlier work had no dated log; everything up to 2026-10-29 is folded into the sections above.

- **2026-11-01** — Three muted strums stop a run (two no longer do), saved as `end_reason` `strum_stop`. Strings run from the edge of the board past the last fret, and in the open-string menus from the nut under the string letters. Menus read "play an open string to select".

- **2026-11-01** — The middle bar is called *speed vs avg* (your answer time on this note against your average on all notes). Open-string menus: the main step is green; Ready has *Start the run*; outside a run two muted strums go back to the previous menu and a single one does nothing.

- **2026-11-01** — During a run, Stop is 6 px less tall around the same centre (so it no longer touches the top of the screen) and the score ring is as tall, its digits as tall as the button's lower-case letters. Popups label the line on the top bar "before this session", like a pin; the middle bar is called *pace*.

- **2026-11-01** — Popups: the note and fret in a yellow box instead of a copy of the card; the last 15 answers as same-size dots; every bar has a mark where it stood before your last session on that position (a session starts after 30 min without answering it), on Stats too; "fast end" is called *quickest 10%*. During a run the page no longer scrolls (nothing waits below the board; on a phone held sideways the feedback line hides too), and the run bar sits a little in from the edges.

- **2026-11-01** — Note position has no settings bar: the menu under the prompt holds run type, length (10–50 prompts or a 60–180 s sprint), beat mode and interval practice, and Ready offers *Back to the menu*. Ready shows only the zone, no knowledge bars. Position popups in detail: labelled bars with a mark where each stood before the run, the last 10 answers, and a time line with your fast end, your usual time and this run's answers. Side dots above the board, fret numbers below. The answer shown after a miss is green again, with a white contour. On phones a run starts at the top of the page.

- **2026-11-01** — Every space on the neck is the same width, the open strings' too, so every position card is the same size; dots under the marker frets (two under 12). Fast and automatic bars fill only from right answers; the legends say what each bar means. The answer shown after a miss is written in ink on white. `tools/seed-test.mjs` makes varied practice data for the `test` profile (import it from Settings → Data).

- **2026-11-01** — The knowledge map (Stats, All runs, the board between runs) uses the run results' cards instead of clouds: name and three bars, known red → green, fast light grey, automatic ink. The position of an open popup is highlighted and repeated at the top of the popup, which sits beside it on the board; popups close when the page changes.

- **2026-11-01** — Popups open on a click or tap too (for phones), with a close cross; a click elsewhere closes them; none before or during a run. The switch reads This run / All runs. The test profile has no special badge or colour any more.

- **2026-11-01** — After a run: each note as its name plus three bars (known, fast, automatic; green, yellow, ink instead of green and blue rings), a legend, popups with details on hover (this run after a run, all runs on the Stats map and the practice board), and a This run / All runs · this tuning switch. During a run the prompt keeps the note in place whatever the text length, the texts are shorter, and the run settings stay in the menu before the run. *With an instrument* / *No instrument on hand* instead of Guitar / No guitar.

- **2026-11-01** — Colour-blind friendly shapes: a wrong note on the board is struck through with a cross, missed answers on the run time plot are crosses (right ones stay discs), and the fog over locked positions has a fine cross-hatch.
- **2026-11-01** — A new player's starting area is one run of frets from the nut on each string (marker frets beyond it no longer start unlocked on their own); a legend under the practice board between runs.
- **2026-11-01** — Releases: the site deploys from a published release (`v1.0.0` first), whose version shows in Settings → Data and on the title; `main` only moves at a release, work goes through `dev`.

- **2026-11-01** — Hosted on GitHub Pages, with the checks run by GitHub on every pull request. Profiles: a welcome screen on the first start (name, where the data lives, instrument step), a picker when there are several, *+ New profile…* in the header. The disk copy can live in a folder the user picks (File System Access API), with one small file per run (`attempts/`, `runs/`) in both the folder and the server's `data` folder; Settings → Data creates, moves, connects or disconnects the folder. *Bring / sync* adds another profile's answers and runs, tagged with the new `origin` column and removable again. The service worker clears only its own caches.

- **2026-11-01** — Lighter run end and Stats map: backups keep a summary next to each full copy, so listing them (every run end, every visit to Settings) no longer deserialises up to 11 full copies of the log, and the end-of-run backup is made just after the summary shows; on the mastery map all clouds share one blur filter (one pass per repaint instead of one per cloud) and clouds of the same colour and width share a gradient.
- **2026-11-01** — Quicker New run and Stats: the mix-ups lookup is indexed once per pick instead of walking every logged mix-up for every cell of every zone; the prior of a position and its octave shapes are computed once per pick; zones and their descriptions are reused while strings, frets and shapes stay the same, and changing the A4 reference no longer rebuilds the board; the model check's AUC is rank-based (a 50k-answer log took seconds) and the decay fit yields between its seven replays; the Stats note list groups octaves in one pass and runs its first queries together. Nothing changes in what is asked or how answers count.
- **2026-11-01** — Cheaper pitch detection: the McLeod detector runs in two stages (coarse at 12 kHz, refined at full rate around the peak and its half lag), giving the same pitch as before (tests on synthetic notes, 80–1300 Hz at 44.1/48/96 kHz, bass down to 30 Hz) in about a sixth of the time (1.8 → 0.3 ms per frame for a guitar, 5.3 → 0.5 ms for a bass, on a desktop). The audio context is pinned to 48 kHz. Please confirm the tuner with a real guitar.
- **2026-11-01** — Calmer run loop: the answer timer and the progress bar are written only when their text or width changes (they were written every frame, which forced a layout per frame); the pulsing mark steps 8 times a second instead of repainting the board 60 times; the zone dim and shadow are plain geometry (one path with a hole, a clip) instead of masks rasterised at every repaint, so the dim's inner edge now follows the rounded zone contour; the tuner writes nothing while idle; pitch detection is skipped on Stats and in a hidden tab.
- **2026-11-01** — Quicker start: the DuckDB engine starts while the storage-persistence request and the tab lock are pending; the schema check reads the catalogue once instead of issuing one `ALTER ... IF NOT EXISTS` per column (82 round trips); the safety-copy check compares counts, settings and runs first and reads every answer of the copy only when they disagree; the disk-copy sync reads answer keys instead of full rows; the board no longer waits for the audio device list; the service worker registers as soon as the database is open. No change in what is checked or repaired.
- **2026-11-01** — Lighter answers: the model is no longer rewritten after every graded answer (100 KB to 1 MB of JSON to DuckDB, the safety copy and `kv.json` on disk each time); only its run-level `meta` is stored, at the end of a run, since everything else is replayed from the answer log at every start anyway. `kv.json` shrinks accordingly. Nothing changes in what is asked or how answers count.
- **2026-11-01** — Faster start: the 34 MB DuckDB module is no longer downloaded and re-cached on every start (service worker cache first for `vendor/`, server `ETag`/304 and `immutable`), and the worker is patched to load it with a plain fetch so the browser keeps the compiled code; the longest module chain is preloaded from `index.html`. No change to what the app does.
- **2026-11-01** — Performance measurement: `npm run perf` (`tools/perf.mjs`) times cold and warm starts, a run of answers and its writes, the run loop, Stats and the end-of-run backup in headless Edge, with timing marks in `main.js` and `storage.js`; `--compare` shows the change against a saved baseline. No change to the app itself.
- **2026-11-01** — Checked with a 9-string guitar: during a run the view is at most six strings high, so the board fits a phone held sideways; banners hide during runs on phones. Name the note: piano-style buttons of one size, sharps or flats as set in Settings → Practice (hints after a miss follow it).
- **2026-11-01** — Answer animation settled: green confetti when right, red fireworks when wrong (the style setting is gone). The board zooms in on the zone during a run; bigger circles and names on it. On phones the header and run settings slide away during a run. Headless screenshot runs are muted.
- **2026-11-01** — The answer flash is replaced by shapes thrown out of the asked note (fireworks, splat, confetti or stars; Settings → Practice). The zone's thicker bottom and right edges are now a filled shadow of its shape, like the buttons', with no seam. The board no longer moves when "Show me" or a hint appears.
- **2026-11-01** — Clouds a bit less dense, with a softer, more gradual edge and less pill-like corners. The zone contour gets a button-like offset line, so its bottom and right edges look thicker.

- **2026-11-01** — The zone is drawn as one thin contour with rounded corners, no fill. Clouds: soft edges, a wider solid band, much denser when practised. Stats: notes open per octave, a full-width Progress tile; "Hardest unlocked zones" and "Recent runs" removed.
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
