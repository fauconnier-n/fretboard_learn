// @ts-check
// Persistence in IndexedDB (idb.js), per profile:
//   kv        settings and the models' meta, as JSON text
//   attempts  the answer log, one row per graded answer
//   runs      one row per run
// The whole profile is also held in memory: the app replays every answer at each start anyway,
// and the stats are a few filters over a few thousand rows (logQueries.js).
// IndexedDB lives in the browser, so every write also goes to the disk copy (disk.js: a folder
// the user picked, or the local server's data folder); on open, whatever is missing on either
// side is copied across, so a wiped browser refills itself from the disk.
// Profiles (name, where the copy lives, last use) are a small per-browser list in localStorage.

import * as idb from './idb.js';
import * as disk from './disk.js';
import { attemptKey, mergePlan, sanitizeUser } from './disklayout.js';

const PROFILES_KEY = 'ft:profiles';
const ACTIVE_KEY = 'ft:activeUser';
const LAST_SETTINGS_KEY = 'ft:lastSettings';
const FLUSH_MS = 1500;
const LOCK_WAIT_MS = 5000;

const ls = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ---------- profiles ----------
// {name: {store: 'folder' | 'server' | 'browser', lastUsed, instrument, tuning}}: where each
// profile's disk copy lives and what the picker shows.

export { sanitizeUser };

export const profiles = () => ls.get(PROFILES_KEY, null) || {};

// most recently used first
export function listUsers() {
  return Object.entries(profiles()).sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0)).map(([n]) => n);
}

export function activeUser() {
  const u = sanitizeUser(ls.get(ACTIVE_KEY, ''));
  return u && profiles()[u] ? u : listUsers()[0] || '';
}

export function setActiveUser(name, store) {
  const u = sanitizeUser(name);
  if (!u) throw new Error('Invalid profile name');
  const all = profiles();
  all[u] = { store: 'browser', ...all[u], ...(store ? { store } : {}), lastUsed: Date.now() };
  ls.set(PROFILES_KEY, all);
  ls.set(ACTIVE_KEY, u);
  return u;
}

// Earlier versions kept a plain user list, with "user" always present: those become profiles
// (user only if it has answers), kept by the server on localhost, in the browser elsewhere.
export async function migrateProfiles() {
  if (ls.get(PROFILES_KEY, null)) return;
  const store = disk.status().local ? 'server' : 'browser';
  const all = {};
  for (const n of ls.get('ft:users', []).map(sanitizeUser).filter(Boolean)) all[n] = { store };
  if (!all.user && (await idb.countAttempts('user').catch(() => 0)) > 0) all.user = { store };
  ls.set(PROFILES_KEY, all);
}

// Settings of the last profile seen in this browser: a new profile starts with the same setup,
// and the audio setup (main.js AUDIO_KEYS) is read from here only, since it belongs to this
// computer. The instrument and tuning also go on the profile, for the picker.
export const lastSettings = () => ls.get(LAST_SETTINGS_KEY, {});
export function rememberSettings(s) {
  ls.set(LAST_SETTINGS_KEY, s);
  const all = profiles();
  if (!all[info.user]) return;
  Object.assign(all[info.user], { instrument: s.instrument, tuning: s.tuning });
  ls.set(PROFILES_KEY, all);
}

// ---------- the profile's data ----------

// The whole profile, in memory: kv {key: JSON text}, attempts (oldest first), runs {run_id: row}.
// Loaded from IndexedDB at open; every write goes to both.
/** @type {{ kv: Record<string, string>, attempts: any[], runs: Record<string, any> }} */
let mem = { kv: {}, attempts: [], runs: {} };
let flushTimer = 0;
const info = { user: 'user', persistent: false, persisted: false, error: '', storeError: '', disk: /** @type {any} */ (null) };
// disk copy: dir is null while the server's disk API can't be reached; restored counts
// what came back from the disk on open; waiting counts writes not on disk yet
const DISK_RETRY_MS = 30000;
info.disk = { dir: null, error: '', restored: null, waiting: 0, savedAt: 0 };
const pending = { attempts: [], runs: [], kv: false };
let diskBusy = false;
let diskTriedAt = 0;
let diskRetryTimer = 0;

// The two log tables, column by column: [name, type, description]. Rows are stored by these
// names on disk and in the JSON export; the list is also the documentation shown in
// Settings → Database tables.
export const TABLES = {
  attempts: {
    title: 'Answers',
    about: 'One row per prompt: what was asked, what you played and how long it took. Written when the prompt closes.',
    cols: [
      ['t', 'DOUBLE', 'When the prompt was graded (first answer or time-out), in milliseconds since 1970.'],
      ['run_id', 'VARCHAR', 'The run this prompt belongs to; matches runs.run_id.'],
      ['tuning', 'VARCHAR', "Tuning: 'standard' or 'drop', followed by the shift of every string in semitones when there is one ('standard-1' = Eb standard, 'drop-2' = drop C), or 'custom'. Before instruments existed: 'standard', 'dropD', 'eb' or 'seven' (7-string guitar), with instrument and strings empty."],
      ['instrument', 'VARCHAR', "Instrument: 'guitar6', 'guitar7', 'guitar8', 'guitar9', 'bass4', 'bass5' or 'bass6'. Empty on rows from before instruments (a 6-string guitar, or 7-string when tuning is 'seven')."],
      ['strings', 'VARCHAR', "Open-string notes as MIDI numbers, lowest string first, e.g. '40,45,50,55,59,64' (string_idx indexes this list). Knowledge follows a string from one instrument to another by its open note, an octave higher on a bass."],
      ['zone_type', 'VARCHAR', "Shape of the zone: 'box' (several strings) or 'string' (12 frets on one string)."],
      ['zone_strings', 'VARCHAR', "Strings of the zone, 0 = lowest string, e.g. '0,1,2'."],
      ['zone_cs', 'DOUBLE', 'Centre of the zone across the strings (average string number).'],
      ['zone_cf', 'DOUBLE', 'Centre of the zone along the neck (average fret).'],
      ['zone_span', 'INTEGER', 'Number of frets the zone covers.'],
      ['zone_fret_min', 'INTEGER', 'Lowest fret in the zone.'],
      ['zone_fret_max', 'INTEGER', 'Highest fret in the zone.'],
      ['string_idx', 'INTEGER', 'String of the asked position, 0 = lowest string of the instrument (see strings).'],
      ['fret', 'INTEGER', 'Fret of the asked position, 0 = open string.'],
      ['target', 'INTEGER', 'Note asked, as a MIDI number (40 = low E, 60 = middle C).'],
      ['played', 'INTEGER', 'First note you played, as a MIDI number. Empty on a time-out.'],
      ['correct', 'BOOLEAN', 'True if the first note played was the right one, before the time-out.'],
      ['ms', 'INTEGER', 'Time to the first note played (or to the time-out), in ms, after the latency offset.'],
      ['grade', 'DOUBLE', 'Speed score of a right first answer: 1 at 0.6 s or faster, 0 at 10 s. 0 if wrong.'],
      ['review', 'BOOLEAN', 'True if the run was a review run (revisits material you already know).'],
      ['spelling', 'VARCHAR', "How the note was written: 'n' natural, 's' sharp (A#), 'f' flat (Bb)."],
      ['solve_ms', 'INTEGER', 'Time until you played the right note, in ms, even after wrong notes. Empty if never.'],
      ['wrong_count', 'INTEGER', 'Number of wrong notes played for this prompt.'],
      ['wrong_notes', 'VARCHAR', "The wrong notes, as MIDI numbers in the order played, e.g. '45,47'."],
      ['wrong_ms', 'VARCHAR', "When each wrong note was played, in ms after the prompt, e.g. '830,2410'."],
      ['prev_target', 'INTEGER', 'Note asked just before this one in the same run, as a MIDI number. Empty for the first prompt.'],
      ['prev_spelling', 'VARCHAR', "How that previous note was written: 'n', 's' or 'f'."],
      ['prev_string', 'INTEGER', 'String of the previous prompt.'],
      ['prev_fret', 'INTEGER', 'Fret of the previous prompt.'],
      ['retest', 'BOOLEAN', 'True if this prompt is the delayed re-test of a note missed a few prompts earlier.'],
      ['queue_shown', 'BOOLEAN', 'True if the next-notes queue was visible. Those answer times are left out of the speed model.'],
      ['show_me', 'BOOLEAN', 'True if you pressed "Show me" (counted as a miss).'],
      ['fsrs_grade', 'INTEGER', 'Grade given to the memory model: 1 Again (wrong), 2 Hard (right but slower than expected), 3 Good, 4 Easy (right and clearly faster than expected).'],
      ['pred_p', 'DOUBLE', 'Predicted chance of a right first answer, computed just before this answer (for checking the model).'],
      ['pred_ms', 'DOUBLE', 'Predicted answer time in ms, computed just before this answer.'],
      ['pred_r', 'DOUBLE', 'Memory retrievability R (0–1) just before this answer. Empty for a first sighting.'],
      ['pred_s', 'DOUBLE', 'Memory stability S in days just before this answer (time for R to fall to 90%).'],
      ['pred_d', 'DOUBLE', 'Memory difficulty D (1 easy – 10 hard) just before this answer.'],
      ['interval', 'VARCHAR', "In 'interval' prompts (Intervals tab): the item asked, e.g. 'oct2_up' (octave 2 strings up), 'P5_up' (perfect 5th above), 'triad_maj', 'deg5' (5th of the scale). string_idx/fret are then the marked root and target the first expected note."],
      ['chord', 'VARCHAR', "In chord prompts (Chord page): the grip asked, e.g. 'C:open', 'F:E:1' (E shape at fret 1), 'G:tri-GBe-maj-1:8'. string_idx/fret are the root's position, target the bass note."],
      ['chord_cue', 'INTEGER', 'Chord prompts: degree-label level shown, 0 every degree … 4 none.'],
      ['task', 'VARCHAR', "What was asked: 'play' (note name shown, you play it), 'name' (position shown, you name it), 'truefalse' (a position is shown with a name, right or wrong; you answer yes or no), 'interval' (Intervals tab, see the interval column), 'chord' (Chord page: a chord shown, you play its grip) or 'chord-name' (a grip shown, you name the chord; see the chord column)."],
      ['answer_name', 'VARCHAR', "In 'name' prompts: the note name you gave, e.g. 'Bb'."],
      ['error_type', 'VARCHAR', "Kind of wrong first answer: 'octave' (right name, wrong octave), 'semitone_sharp' / 'semitone_flat' (one fret off), 'tone_sharp' / 'tone_flat' (two frets off), 'other'. Empty if right or nothing played."],
      ['probe', 'BOOLEAN', 'True for a check-up prompt: every 10th prompt is a random position of the zone, not picked by the model, so its success rate is an unbiased measure. Check-ups never show note labels.'],
      ['cue_mode', 'VARCHAR', "Setting for note-name labels on the board during the run: 'off', 'fade' (a label only on positions you do not know well yet, dropped once you answer that note right), 'all', 'naturals' or 'landmarks' (only frets 0, 3, 5, 7, 9, 12…). 'off' in Name-the-note runs."],
      ['cue_target', 'BOOLEAN', "True if the label of the asked position itself was on the board, so the answer was given away. Such an answer counts at most as Hard in the memory model and is left out of the speed model. Empty before labels existed."],
      ['cue_n', 'INTEGER', 'Number of labels on the board while this prompt was asked (0 = none, e.g. on every check-up).'],
      ['cue_labels', 'VARCHAR', "Every label on the board while this prompt was asked, as 'name@string:fret' separated by ';', string 0 = lowest, e.g. 'E@0:0;G@0:3'. With the tuning in this row any distance can be recomputed from it."],
      ['cue_dist', 'VARCHAR', "Distance from the asked position to each label in cue_labels, same order, separated by ';'. In fret widths, a step to the next string counting 2 (so labels along the same string are closer): sqrt(Δfret² + (2·Δstring)²). 0 is the asked position's own label."],
      ['cue_nearest', 'DOUBLE', "Distance (same measure as cue_dist) from the asked position to the nearest label other than its own. Empty if there was none."],
      ['special', 'VARCHAR', "A prompt chosen for a role, not by the usual weights: 'boss' (second to last in a prompts run: the note of the zone the model thinks hardest), 'finale' (last: the best-known note, so the run ends on a success) or 'golden' (a rare prompt on a note you have been missing). Empty for ordinary prompts."],
      ['shown_name', 'VARCHAR', "In 'truefalse' prompts: the name shown next to the marked position (answer_name is then 'yes' or 'no'). Right half the time; otherwise a name you mixed it up with, or a semitone or tone away."],
      ['bpm', 'DOUBLE', 'Tempo of the metronome in beat mode when this prompt was shown, in beats per minute. Empty outside beat mode.'],
      ['origin', 'VARCHAR', 'Profile this row was brought from (Settings → Data → Bring data from another profile). Empty for rows of this profile.'],
    ],
  },
  runs: {
    title: 'Runs',
    about: 'One row per run. Written when the run starts and again when it ends. Linked to the answers by run_id.',
    cols: [
      ['run_id', 'VARCHAR', 'Identifier of the run.'],
      ['started_at', 'DOUBLE', 'When Start run was pressed, in milliseconds since 1970.'],
      ['ended_at', 'DOUBLE', 'When the run ended. Empty while it is running.'],
      ['end_reason', 'VARCHAR', "How it ended: 'completed' (all prompts done), 'time_up' (sprint over), 'stopped' (Stop run or Esc), 'strum_stop' (three muted strums), 'left' (another tab or a board setting changed), 'closed' (page closed mid-run)."],
      ['tuning', 'VARCHAR', 'Tuning in use (see attempts.tuning).'],
      ['instrument', 'VARCHAR', 'Instrument (see attempts.instrument).'],
      ['strings', 'VARCHAR', 'Open-string notes, lowest first (see attempts.strings).'],
      ['mode', 'VARCHAR', "Type of run: 'count' (a number of prompts) or 'sprint' (a time limit)."],
      ['run_count', 'INTEGER', 'Number of prompts asked for (count runs).'],
      ['sprint_sec', 'INTEGER', 'Sprint length in seconds (sprint runs).'],
      ['zone_type', 'VARCHAR', "Shape of the zone: 'box' or 'string'."],
      ['zone_strings', 'VARCHAR', 'Strings of the zone, 0 = lowest.'],
      ['zone_cs', 'DOUBLE', 'Centre of the zone across the strings.'],
      ['zone_cf', 'DOUBLE', 'Centre of the zone along the neck.'],
      ['zone_span', 'INTEGER', 'Number of frets the zone covers.'],
      ['zone_fret_min', 'INTEGER', 'Lowest fret in the zone.'],
      ['zone_fret_max', 'INTEGER', 'Highest fret in the zone.'],
      ['zone_label', 'VARCHAR', 'The zone as shown on screen.'],
      ['review', 'BOOLEAN', 'True for a review run: chosen because many positions were due (fading), so no zone with new positions was offered.'],
      ['predicted', 'DOUBLE', 'Predicted rate of right answers in this zone when it was picked (0–1).'],
      ['target', 'DOUBLE', 'Target rate of right answers the zone picker aimed at (0–1).'],
      ['retry', 'BOOLEAN', 'Setting "Retry until correct" during the run.'],
      ['timeout_sec', 'INTEGER', 'Time-out per prompt during the run, in seconds.'],
      ['prompts', 'INTEGER', 'Prompts answered (graded) in the run.'],
      ['correct', 'INTEGER', 'Prompts answered right on the first try.'],
      ['median_ms', 'INTEGER', 'Median time of the right first answers, in ms.'],
      ['task', 'VARCHAR', "What the run asked: 'play' (guitar), 'name' or 'truefalse' (no guitar: buttons or keys), 'chord', 'chord-name' or 'chord-change' (Chord page)."],
      ['due_at_start', 'INTEGER', 'Number of items fading (due for review) when the run was picked.'],
      ['cue_mode', 'VARCHAR', "Setting for note-name labels during the run: 'off', 'fade', 'all', 'naturals' or 'landmarks' (see attempts.cue_mode)."],
      ['focus', 'VARCHAR', "'confusions' for a mix-ups run (only notes you have mixed up and the notes you played instead), empty otherwise."],
      ['bpm_start', 'DOUBLE', 'Beat mode: tempo at the start of the run, in beats per minute. Empty outside beat mode.'],
      ['bpm_end', 'DOUBLE', 'Beat mode: tempo at the end of the run (it rises after right answers and falls after misses).'],
      ['origin', 'VARCHAR', 'Profile this run was brought from (see attempts.origin). Empty for runs of this profile.'],
    ],
  },
};

const colNames = (table) => TABLES[table].cols.map(([name]) => name);
const ATTEMPT_COLS = colNames('attempts');
const RUN_COLS = colNames('runs');
const byT = (a, b) => a.t - b.t;

// Only one tab at a time may write a profile: each tab holds the profile in memory, so a second
// one would write over the first one's data. The lock is held until the page goes away; a reload
// waits for the old page to let go.
function acquireTabLock(name, waitMs) {
  if (!navigator.locks) return Promise.resolve(true);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), waitMs);
  return new Promise((resolve) => {
    navigator.locks
      .request(name, { signal: abort.signal }, () => {
        clearTimeout(timer);
        resolve(true);
        return new Promise(() => {});
      })
      .catch(() => resolve(false));
  });
}

// what IndexedDB holds for a user, every row in today's shape (rows from older versions too)
async function load(user) {
  const c = await idb.load(user);
  return { kv: c.kv, attempts: c.attempts.map(toAttemptCopy).sort(byT), runs: Object.fromEntries(Object.values(c.runs).map((r) => [r.run_id, toRun(r)])) };
}

export async function open() {
  info.user = activeUser();
  // ask the browser not to evict this site's storage (profiles and backups) when disk space
  // runs low; without it all of them can be cleared together
  try {
    info.persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    info.persisted = false;
  }
  if (!(await acquireTabLock('fretboard-db-' + info.user, LOCK_WAIT_MS))) info.error = `profile "${info.user}" is open in another tab`;
  else {
    try {
      mem = await load(info.user);
      info.persistent = true;
    } catch (e) {
      info.error = e.message || String(e);
      console.error('Could not read the profile from IndexedDB', e);
    }
  }
  performance.mark('db:open');
  if (info.persistent) {
    await closeOpenRuns();
    await disk.start(info.user, profiles()[info.user]?.store);
    await syncDisk();
    performance.mark('db:sync');
    pushDisk(false); // starts the retries if the server was not reachable
  }
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('beforeunload', () => flush());
  return { ...info };
}

export const status = () => ({ ...info, disk: { ...info.disk, ...disk.status(), waiting: pending.attempts.length + pending.runs.length + (pending.kv ? 1 : 0) } });

function markDirty() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
}

// IndexedDB holds a write as soon as it returns; this sends what waits to the disk copy.
// Runs 1.5 s after a write, at the end of every run, and when the tab is hidden or closed.
export async function flush() {
  clearTimeout(flushTimer);
  pushDisk(document.visibilityState === 'hidden');
}

// Writes go to memory and IndexedDB. A tab that could not open the profile (NOT SAVED) keeps
// them in memory only, so it can't overwrite the real data. A failed write is shown in Settings
// and on the badge; the disk copy still gets it.
const stored = (write) => {
  if (!info.persistent) return Promise.resolve();
  return write().then(() => {
    info.storeError = '';
  }, (e) => {
    info.storeError = e.message || String(e);
    console.error('IndexedDB write failed', e);
  });
};

function addToLog(list) {
  const last = mem.attempts.at(-1);
  mem.attempts.push(...list);
  if (list.length > 1 || (last && list[0]?.t < last.t)) mem.attempts.sort(byT);
}

// ---------- disk copy ----------

const runText = (r) => JSON.stringify(toRun(r));

// Copy whatever is missing across, both ways (disklayout.js mergePlan says what goes where).
// New answers from the disk mark the models for a rebuild from the log.
async function syncDisk() {
  diskTriedAt = Date.now();
  const user = info.user;
  try {
    info.disk.dir = await disk.probe();
    if (!info.disk.dir) return;
    const remote = await disk.load();
    pending.attempts = [];
    pending.runs = [];

    const plan = mergePlan(mem, remote, (a, b) => runText(a) === runText(b));
    const { toDisk, runsToDisk, kvToLocal } = plan;
    const toLocal = plan.toLocal.map(toAttemptCopy);
    const runsToLocal = plan.runsToLocal.map(toRun);
    if (toLocal.length) kvToLocal.push(...staleEntries({ ...mem.kv, ...Object.fromEntries(kvToLocal) }));

    if (toLocal.length || runsToLocal.length || kvToLocal.length) {
      addToLog(toLocal);
      for (const r of runsToLocal) mem.runs[r.run_id] = r;
      for (const [k, v] of kvToLocal) mem.kv[k] = v;
      await stored(async () => {
        await idb.addAttempts(user, toLocal);
        for (const r of runsToLocal) await idb.putRun(user, r);
        for (const [k, v] of kvToLocal) await idb.putKv(user, k, v);
      });
      info.disk.restored = { attempts: toLocal.length, runs: runsToLocal.length, kv: kvToLocal.length };
    }

    if (toDisk.length) await disk.append('attempts', toDisk);
    if (runsToDisk.length) await disk.append('runs', runsToDisk);
    if (!sameKv(mem.kv, remote.kv)) await disk.putKv(mem.kv);
    info.disk.error = '';
    info.disk.savedAt = Date.now();
  } catch (e) {
    // try the whole sync again later, so nothing that failed here is skipped
    info.disk.dir = null;
    info.disk.error = e.message || String(e);
    console.warn('Disk copy sync failed', e);
  }
}

// the models were built from fewer answers: `stale` makes the app replay the log
function staleEntries(kvText) {
  const out = [];
  for (const [k, v] of Object.entries(kvText)) {
    if (!k.startsWith('model:')) continue;
    try {
      out.push([k, JSON.stringify({ ...JSON.parse(v), stale: true })]);
    } catch {}
  }
  return out;
}

async function staleModels() {
  const entries = staleEntries(mem.kv);
  for (const [k, v] of entries) mem.kv[k] = v;
  await stored(async () => {
    for (const [k, v] of entries) await idb.putKv(info.user, k, v);
  });
  queueDisk('kv');
}

// Without a copy to write to (a static host, no folder chosen, or a folder waiting for
// permission) nothing is queued: a later sync catches up by comparing keys.
function queueDisk(kind, item) {
  if (!info.persistent || !disk.configured()) return;
  if (kind === 'kv') pending.kv = true;
  else pending[kind].push(item);
}

// Send waiting writes to the disk copy. Runs with every flush. When the copy was not
// reachable (the server down), a full sync is tried again every 30 s instead.
async function pushDisk(keepalive) {
  if (!info.persistent || diskBusy || !disk.configured()) return;
  diskBusy = true;
  try {
    if (!info.disk.dir) {
      if (Date.now() - diskTriedAt > DISK_RETRY_MS) await syncDisk();
      return;
    }
    for (const kind of ['attempts', 'runs']) {
      const batch = pending[kind];
      if (!batch.length) continue;
      pending[kind] = [];
      try {
        await disk.append(kind, batch, keepalive);
      } catch (e) {
        pending[kind] = batch.concat(pending[kind]);
        throw e;
      }
    }
    if (pending.kv) {
      pending.kv = false;
      try {
        await disk.putKv({ ...mem.kv }, keepalive);
      } catch (e) {
        pending.kv = true;
        throw e;
      }
    }
    info.disk.error = '';
    info.disk.savedAt = Date.now();
  } catch (e) {
    info.disk.error = e.message || String(e);
  } finally {
    diskBusy = false;
    // try again later while something is still waiting (the server may be down)
    clearTimeout(diskRetryTimer);
    if (disk.configured() && (pending.attempts.length || pending.runs.length || pending.kv || !info.disk.dir)) diskRetryTimer = setTimeout(() => pushDisk(false), DISK_RETRY_MS);
  }
}

// Before a reset, an import or a removal: a disk copy that misses it would bring the old rows
// back at the next sync, so nothing is replaced while the copy can't be reached.
async function needDisk() {
  if (!info.persistent || disk.status().mode === 'none') return;
  info.disk.dir = await disk.probe();
  if (!info.disk.dir) throw new Error('The disk copy is not reachable: reconnect it first');
}

// Replace the disk copy with what the profile holds now (after a reset or an import).
async function replaceDisk() {
  if (!info.persistent || !info.disk.dir) return;
  try {
    pending.attempts = [];
    pending.runs = [];
    pending.kv = false;
    await disk.replaceLines('attempts', allAttempts());
    await disk.replaceLines('runs', allRuns());
    await disk.putKv({ ...mem.kv });
    info.disk.error = '';
  } catch (e) {
    info.disk.error = e.message || String(e);
    throw e;
  }
}

// ---------- the profile's folder (Settings → Data; each needs a click) ----------

// after a change of transport: forget what was waiting, merge both ways, then keep writing
async function resync() {
  info.disk.dir = null;
  info.disk.error = '';
  await syncDisk();
  pushDisk(false);
}

// a new fretboard-<name> folder in a location the user picks; also moves the copy there
export async function createFolder() {
  await disk.createFolder(info.user);
  await resync();
}

// an existing profile folder becomes this profile's copy; when the folder holds another
// profile's data, `accept(name)` is asked first
export async function connectFolder(accept) {
  const { handle, name } = await disk.openFolder();
  if (name !== info.user && !(await accept(name))) return false;
  await disk.useFolder(info.user, handle);
  await resync();
  return true;
}

// before open, on the welcome screen: a new profile's folder, or a folder found (its name)
export const diskStatus = disk.status;
export const createProfileFolder = (name) => disk.createFolder(name);
export async function openProfileFolder() {
  const { handle, name } = await disk.openFolder();
  await disk.useFolder(name, handle);
  return name;
}

export async function reconnectFolder() {
  if (!(await disk.reconnect())) return false;
  await resync();
  return true;
}

export async function disconnectFolder() {
  await disk.forget(info.user, profiles()[info.user]?.store);
  await resync();
}

// ---------- data of other profiles ----------
// Answers and runs are logs: bringing another profile's in is a union of rows, tagged with
// `origin`, that the models are then rebuilt from. Settings and models are not brought.
// Anything that changes the tables must keep this a union.

// another profile's answers and runs: its data in this browser, else its folder
export async function profileData(name) {
  const copy = await idb.load(name);
  return copy.attempts.length ? copy : (await disk.loadStored(name)) || copy;
}
export const folderData = disk.loadPicked;

export async function bringIn(data, origin) {
  const have = new Set(mem.attempts.map(attemptKey));
  const attempts = [];
  for (const a of data.attempts) {
    if (have.has(attemptKey(a))) continue;
    have.add(attemptKey(a));
    attempts.push(toAttemptCopy({ ...a, origin }));
  }
  const runs = Object.values(data.runs).filter((r) => r?.run_id && !mem.runs[r.run_id]).map((r) => toRun({ ...r, origin }));
  addToLog(attempts);
  for (const r of runs) mem.runs[r.run_id] = r;
  await stored(async () => {
    await idb.addAttempts(info.user, attempts);
    for (const r of runs) await idb.putRun(info.user, r);
  });
  for (const a of attempts) queueDisk('attempts', a);
  for (const r of runs) queueDisk('runs', r);
  if (attempts.length) await staleModels();
  markDirty();
  return { attempts: attempts.length, runs: runs.length };
}

// {origin: answers} of what was brought in
export function origins() {
  const out = {};
  for (const a of mem.attempts) if (a.origin != null) out[a.origin] = (out[a.origin] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
}

export async function removeOrigin(origin) {
  await needDisk();
  await replaceAll(mem.kv, mem.attempts.filter((a) => a.origin !== origin), Object.fromEntries(Object.entries(mem.runs).filter(([, r]) => r.origin !== origin)));
  await replaceDisk();
  await staleModels();
  markDirty();
}

// every [key, value] whose key starts with `prefix`
export function entries(prefix) {
  return Object.keys(mem.kv).filter((k) => k.startsWith(prefix)).sort().map((k) => [k, JSON.parse(mem.kv[k])]);
}

export function get(key) {
  const v = mem.kv[key];
  return v == null ? undefined : JSON.parse(v);
}

export async function set(key, value) {
  const text = JSON.stringify(value);
  mem.kv[key] = text;
  await stored(() => idb.putKv(info.user, key, text));
  queueDisk('kv');
  markDirty();
}

// One answer as a row, by column name, so the values always follow ATTEMPT_COLS whatever
// the order of TABLES (a positional list once put new columns in the wrong place).
const attemptRow = (a) => {
  const d = a.desc || {};
  return {
    t: a.t, run_id: a.runId, tuning: a.tuning, instrument: a.instrument, strings: a.strings,
    zone_type: d.type, zone_strings: d.sk, zone_cs: d.cs, zone_cf: d.cf, zone_span: d.span, zone_fret_min: d.fretMin, zone_fret_max: d.fretMax,
    string_idx: a.s, fret: a.f, target: a.target, played: a.played, correct: !!a.correct, ms: Math.round(a.ms), grade: a.g, review: !!a.review, spelling: a.spelling,
    solve_ms: a.solveMs, wrong_count: a.wrongCount, wrong_notes: a.wrongNotes, wrong_ms: a.wrongMs,
    prev_target: a.prevTarget, prev_spelling: a.prevSpelling, prev_string: a.prevS, prev_fret: a.prevF,
    retest: a.retest, queue_shown: a.queueShown, show_me: a.showMe, fsrs_grade: a.fsrsGrade,
    pred_p: a.predP, pred_ms: a.predMs, pred_r: a.predR, pred_s: a.predS, pred_d: a.predD,
    interval: a.interval, chord: a.chord, chord_cue: a.chordCue, task: a.task, answer_name: a.answerName, error_type: a.errorType, probe: a.probe,
    cue_mode: a.cueMode, cue_target: a.cueTarget, cue_n: a.cueN, cue_labels: a.cueLabels, cue_dist: a.cueDist, cue_nearest: a.cueNearest,
    special: a.special, shown_name: a.shownName, bpm: a.bpm, origin: a.origin,
  };
};
// every column must have a field: a missing one would be saved empty
{
  const missing = ATTEMPT_COLS.filter((c) => !(c in attemptRow({})));
  if (missing.length) console.error('attemptRow is missing columns', missing);
}

// ---------- runs ----------
// A run row is a plain object with the RUN_COLS fields. It is written when the run
// starts and again when it ends.

const RUN_INTS = new Set(['run_count', 'sprint_sec', 'zone_span', 'zone_fret_min', 'zone_fret_max', 'timeout_sec', 'prompts', 'correct', 'median_ms', 'due_at_start']);
// every column, integers rounded, so copies compare equal
const toRun = (r) => Object.fromEntries(RUN_COLS.map((c) => {
  const v = r[c] ?? null;
  return [c, v != null && RUN_INTS.has(c) ? Math.round(Number(v)) : v];
}));

export async function saveRun(row) {
  row = toRun(row);
  mem.runs[row.run_id] = row;
  await stored(() => idb.putRun(info.user, row));
  queueDisk('runs', row);
  markDirty();
}

// oldest first
export function allRuns() {
  return Object.values(mem.runs).sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0));
}

// A run still open at start-up belongs to a page that was closed mid-run.
async function closeOpenRuns() {
  for (const r of allRuns().filter((x) => x.ended_at == null)) {
    const own = mem.attempts.filter((a) => a.runId === r.run_id);
    await saveRun({ ...r, ended_at: own.at(-1)?.t ?? r.started_at, end_reason: 'closed', prompts: own.length, correct: own.filter((a) => a.correct).length });
  }
}

export async function addAttempt(a) {
  a = toAttemptCopy(a);
  addToLog([a]);
  await stored(() => idb.addAttempts(info.user, [a]));
  queueDisk('attempts', a);
  markDirty();
}

// Replace the profile's data (kv as JSON text, runs as {run_id: row}): IndexedDB first, so a
// failure leaves both as they were.
async function replaceAll(kvText, attempts, runs) {
  const next = { kv: { ...kvText }, attempts: attempts.map(toAttemptCopy).sort(byT), runs: Object.fromEntries(Object.values(runs).map((r) => [r.run_id, toRun(r)])) };
  if (info.persistent) await idb.replace(info.user, next.kv, next.attempts, next.runs);
  mem = next;
}

const sameKv = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

function toAttempt(r) {
  return {
    t: r.t, runId: r.run_id, tuning: r.tuning,
    desc: { type: r.zone_type, sk: r.zone_strings, cs: r.zone_cs, cf: r.zone_cf, span: r.zone_span, fretMin: r.zone_fret_min, fretMax: r.zone_fret_max },
    s: r.string_idx, f: r.fret, target: r.target, spelling: r.spelling, played: r.played, correct: r.correct, ms: r.ms, g: r.grade, review: r.review,
    solveMs: r.solve_ms, wrongCount: r.wrong_count, wrongNotes: r.wrong_notes, wrongMs: r.wrong_ms,
    prevTarget: r.prev_target, prevSpelling: r.prev_spelling, prevS: r.prev_string, prevF: r.prev_fret,
    retest: r.retest, queueShown: r.queue_shown, showMe: r.show_me, fsrsGrade: r.fsrs_grade,
    predP: r.pred_p, predMs: r.pred_ms, predR: r.pred_r, predS: r.pred_s, predD: r.pred_d,
    interval: r.interval, chord: r.chord, chordCue: r.chord_cue,
    task: r.task, answerName: r.answer_name, errorType: r.error_type, probe: r.probe,
    cueMode: r.cue_mode, cueTarget: r.cue_target, cueN: r.cue_n, cueLabels: r.cue_labels, cueDist: r.cue_dist, cueNearest: r.cue_nearest,
    special: r.special, shownName: r.shown_name, bpm: r.bpm,
    instrument: r.instrument, strings: r.strings, origin: r.origin,
  };
}

// every answer, oldest first (a copy of the list; the rows themselves are shared, not to be changed)
export const allAttempts = () => mem.attempts.slice();

export const countAttempts = () => mem.attempts.length;

// Every row of one of the TABLES by column name, oldest first (console: ft.rows('attempts')),
// or only those of `list`.
export function rows(table, list) {
  if (!TABLES[table]) throw new Error('Unknown table ' + table);
  if (table === 'runs') return list || allRuns();
  return (list || mem.attempts).map((a) => {
    const r = attemptRow(a);
    return Object.fromEntries(ATTEMPT_COLS.map((c) => [c, r[c] ?? null]));
  });
}

// Newest rows of one of the TABLES, for the table viewer in Settings.
export function tableRows(table, limit = 50) {
  const all = table === 'runs' ? allRuns() : mem.attempts;
  return { total: all.length, rows: rows(table, all.slice(-Math.round(limit))).reverse() };
}

export function exportAll() {
  const kv = {};
  for (const [k, v] of Object.entries(mem.kv)) kv[k] = JSON.parse(v);
  return { app: 'fretboard-trainer', version: 3, user: info.user, engine: 'IndexedDB', exported: new Date().toISOString(), kv, attempts: allAttempts(), runs: allRuns() };
}

export async function clearAll() {
  await needDisk();
  await replaceAll({}, [], {});
  await replaceDisk();
}

export async function importAll(data) {
  if (data?.app !== 'fretboard-trainer') throw new Error('Not a Fretboard Trainer backup');
  const kvText = Object.fromEntries(Object.entries(data.kv || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  const runs = Object.fromEntries((data.runs || []).map((r) => [r.run_id, r]));
  await needDisk();
  await replaceAll(kvText, data.attempts || [], runs);
  await replaceDisk();
}

// plain copy of an answer's known fields, rounded and typed as stored
function toAttemptCopy(a) {
  const row = attemptRow(a);
  return toAttempt(Object.fromEntries(ATTEMPT_COLS.map((c) => [c, row[c] ?? null])));
}
