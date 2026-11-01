// @ts-check
// Persistence on DuckDB-WASM. One database file per user in the browser's private
// file system (OPFS): opfs://fretboard-<user>.duckdb
//   kv(key, value)   settings and SRS models, as JSON text
//   attempts(...)    the answer log, one row per graded answer
// Every write is also kept in an IndexedDB safety copy (mirror.js); on open, the DuckDB
// file is checked against it and rebuilt if it lost data.
// Both of those live in the browser, so every write also goes to the disk copy (disk.js: a
// folder the user picked, or the local server's data folder); on open, whatever is missing on
// either side is copied across, so a wiped browser refills itself from the disk.
// Profiles (name, where the copy lives, last use) are a small per-browser list in localStorage.

import * as duckdb from '../vendor/duckdb/duckdb-wasm.mjs';
import * as mirror from './mirror.js';
import { missingColumnStatements } from './schema.js';
import * as disk from './disk.js';
import { attemptKey, sanitizeUser } from './disklayout.js';

const PROFILES_KEY = 'ft:profiles';
const ACTIVE_KEY = 'ft:activeUser';
const LAST_SETTINGS_KEY = 'ft:lastSettings';
const FLUSH_MS = 1500;
const OPEN_RETRIES = 6;
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
// profile's disk copy lives and what the picker shows. Each profile has its own database.

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
  if (!all.user && (await mirror.countAttempts('user').catch(() => 0)) > 0) all.user = { store };
  ls.set(PROFILES_KEY, all);
}

// settings of the last profile seen, so a new one starts with the same audio setup; the
// instrument and tuning also go on the profile, for the picker
export const lastSettings = () => ls.get(LAST_SETTINGS_KEY, {});
export function rememberSettings(s) {
  ls.set(LAST_SETTINGS_KEY, s);
  const all = profiles();
  if (!all[info.user]) return;
  Object.assign(all[info.user], { instrument: s.instrument, tuning: s.tuning });
  ls.set(PROFILES_KEY, all);
}

// ---------- database ----------

let db = null;
let conn = null;
let stmts = {};
let dirty = false;
let flushTimer = 0;
const info = { user: 'user', persistent: false, file: '', version: '', error: '', recovered: null, mirrorError: '' };
// disk copy: dir is null while the server's disk API can't be reached; restored counts
// what came back from the disk on open; waiting counts writes not on disk yet
const DISK_RETRY_MS = 30000;
info.disk = { dir: null, error: '', restored: null, waiting: 0, savedAt: 0 };
const pending = { attempts: [], runs: [], kv: false };
let diskBusy = false;
let diskTriedAt = 0;
let diskRetryTimer = 0;

// The two log tables, column by column: [name, SQL type, description]. This list is
// the schema (CREATE TABLE and ADD COLUMN are built from it) and also the documentation
// shown in Settings → Data → Database tables.
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
      ['task', 'VARCHAR', "What was asked: 'play' (note name shown, you play it), 'name' (position shown, you name it), 'truefalse' (a position is shown with a name, right or wrong; you answer yes or no) or 'interval' (Intervals tab, see the interval column)."],
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
      ['run_id', 'VARCHAR PRIMARY KEY', 'Identifier of the run.'],
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
      ['task', 'VARCHAR', "What the run asked: 'play' (guitar), 'name' or 'truefalse' (no guitar: buttons or keys)."],
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

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS kv (key VARCHAR PRIMARY KEY, value VARCHAR)',
  ...Object.entries(TABLES).map(([table, { cols }]) => `CREATE TABLE IF NOT EXISTS ${table} (${cols.map(([n, type]) => `${n} ${type}`).join(', ')})`),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startEngine() {
  const worker = new Worker(new URL('../vendor/duckdb/duckdb-browser-base.worker.js', import.meta.url));
  db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(new URL('../vendor/duckdb/duckdb-base.wasm', import.meta.url).href);
}

async function connect() {
  conn = await db.connect();
  for (const sql of SCHEMA) await conn.query(sql);
  // columns added in later versions appear in older files too: one look at the catalogue, then
  // only the ALTERs needed (none, usually) instead of one round trip per column
  const have = {};
  for (const r of rows(await conn.query("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_name IN ('attempts', 'runs')"))) (have[r.t] ||= new Set()).add(r.c);
  for (const sql of missingColumnStatements(TABLES, have)) await conn.query(sql);
}

// Only one tab at a time may touch a user's database file: two engines racing on the
// same OPFS file wiped a database during testing with the DuckDB 2.0 dev build.
// The lock is held until the page goes away; a reload waits for the old page to let go.
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

export async function open() {
  info.user = activeUser();
  info.file = `opfs://fretboard-${info.user}.duckdb`;
  // the engine (worker and 34 MB module) starts while the persistence request and the tab lock
  // are pending; it does not touch the file until db.open below
  const engine = startEngine();
  // ask the browser not to evict this site's storage (DuckDB files, safety copy, backups)
  // when disk space runs low; without it all of them can be cleared together
  try {
    info.persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    info.persisted = false;
  }
  const locked = await acquireTabLock('fretboard-db-' + info.user, LOCK_WAIT_MS);
  await engine;
  performance.mark('db:engine');
  if (!locked) info.error = `user "${info.user}" is open in another tab`;

  // the previous page's worker may still hold the file handle for a moment after a reload
  for (let i = 0; locked && i < OPEN_RETRIES && !info.persistent; i++) {
    try {
      info.openTries = i + 1;
      await db.open({ path: info.file, accessMode: duckdb.DuckDBAccessMode.READ_WRITE });
      performance.mark('db:open');
      await connect();
      performance.mark('db:connect');
      info.persistent = true;
      info.error = '';
    } catch (e) {
      info.error = e.message || String(e);
      await db.terminate().catch(() => {});
      await sleep(300 * (i + 1));
      await startEngine();
    }
  }
  if (!info.persistent) {
    // most likely the app is open in another tab, which holds the file
    console.error('DuckDB: could not open', info.file, info.error);
    await db.terminate().catch(() => {});
    await startEngine();
    await db.open({ path: ':memory:' });
    await connect();
  }

  const [getKv, putKv, addAttempt, putRun, version] = await Promise.all([
    conn.prepare('SELECT value FROM kv WHERE key = ?'),
    conn.prepare('INSERT OR REPLACE INTO kv VALUES (?, ?)'),
    conn.prepare(`INSERT INTO attempts (${ATTEMPT_COLS.join(', ')}) VALUES (${ATTEMPT_COLS.map(() => '?').join(', ')})`),
    conn.prepare(`INSERT OR REPLACE INTO runs (${RUN_COLS.join(', ')}) VALUES (${RUN_COLS.map(() => '?').join(', ')})`),
    conn.query('SELECT version() AS v'),
  ]);
  stmts = { getKv, putKv, addAttempt, putRun };
  info.version = version.toArray()[0].v;
  performance.mark('db:schema');
  if (info.persistent) {
    try {
      await reconcile();
    } catch (e) {
      info.mirrorError = e.message || String(e);
      console.error('Safety copy check failed', e);
    }
    performance.mark('db:reconcile');
    await closeOpenRuns();
    await disk.start(info.user, profiles()[info.user]?.store);
    await syncDisk();
    performance.mark('db:sync');
    pushDisk(false); // starts the retries if the server was not reachable
  }

  // keep the database settled at a WAL-free point as much as possible
  if (info.persistent) await conn.query("SET checkpoint_threshold = '64KB'").catch(() => {});
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('beforeunload', () => flush());
  return { ...info };
}

export const status = () => ({ ...info, disk: { ...info.disk, ...disk.status(), waiting: pending.attempts.length + pending.runs.length + (pending.kv ? 1 : 0) } });

function markDirty() {
  dirty = true;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
}

// Make the data durable: CHECKPOINT writes the WAL into the database file and fsyncs it
// (the vendored worker is patched so that fsync really flushes the OPFS handle, see
// vendor-duckdb.ps1), then flushFiles moves any scratch copies into place.
// Runs 1.5 s after a write, at the end of every run, and when the tab is hidden or closed.
export async function flush() {
  clearTimeout(flushTimer);
  pushDisk(document.visibilityState === 'hidden');
  if (!dirty || !conn || !info.persistent) return;
  dirty = false;
  try {
    await conn.query('CHECKPOINT');
    await db.flushFiles();
  } catch (e) {
    dirty = true;
    console.warn('DuckDB checkpoint failed', e);
  }
}

// ---------- disk copy ----------

const runText = (r) => JSON.stringify(runValues(toRun(r)));

// Copy whatever is missing across, both ways. Answers are matched by time and position,
// runs by run_id (a finished run beats an open one, otherwise the browser's row wins),
// settings and models by key (the browser's value wins). New answers from the disk mark
// the models for a rebuild from the log.
async function syncDisk() {
  diskTriedAt = Date.now();
  const user = info.user;
  try {
    info.disk.dir = await disk.probe();
    if (!info.disk.dir) return;
    const remote = await disk.load();
    pending.attempts = [];
    pending.runs = [];

    // keys only: the full rows are needed just for answers the disk copy lacks (normally none)
    const localKeys = rows(await conn.query('SELECT t, string_idx AS s, fret AS f FROM attempts')).map(attemptKey);
    const have = new Set(localKeys);
    const onDisk = new Set(remote.attempts.map(attemptKey));
    const toLocal = [];
    for (const a of remote.attempts) {
      const k = attemptKey(a);
      if (have.has(k)) continue;
      have.add(k);
      toLocal.push(toAttemptCopy(a));
    }
    const toDisk = localKeys.some((k) => !onDisk.has(k)) ? (await allAttempts()).filter((a) => !onDisk.has(attemptKey(a))) : [];

    const localRuns = await duckRuns();
    const runsToLocal = Object.values(remote.runs).map(toRun)
      .filter((r) => !localRuns[r.run_id] || (localRuns[r.run_id].ended_at == null && r.ended_at != null));
    const runsToDisk = Object.values(localRuns)
      .filter((r) => !remote.runs[r.run_id] || (runText(r) !== runText(remote.runs[r.run_id]) && !runsToLocal.some((x) => x.run_id === r.run_id)));

    const localKv = await duckKvText();
    const kvToLocal = Object.entries(remote.kv).filter(([k, v]) => typeof v === 'string' && !(k in localKv));
    if (toLocal.length) kvToLocal.push(...staleEntries({ ...localKv, ...Object.fromEntries(kvToLocal) }));

    if (toLocal.length || runsToLocal.length || kvToLocal.length) {
      await insertAttempts(toLocal);
      for (const r of runsToLocal) await stmts.putRun.query(...runValues(r));
      for (const [k, v] of kvToLocal) await stmts.putKv.query(k, v);
      await mirrored(async () => {
        await mirror.addAttempts(user, toLocal);
        for (const r of runsToLocal) await mirror.putRun(user, r);
        for (const [k, v] of kvToLocal) await mirror.putKv(user, k, v);
      });
      dirty = true;
      info.disk.restored = { attempts: toLocal.length, runs: runsToLocal.length, kv: kvToLocal.length };
    }

    if (toDisk.length) await disk.append('attempts', toDisk);
    if (runsToDisk.length) await disk.append('runs', runsToDisk);
    const merged = { ...localKv, ...Object.fromEntries(kvToLocal) };
    if (!sameKv(merged, remote.kv)) await disk.putKv(merged);
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
  const entries = staleEntries(await duckKvText());
  for (const [k, v] of entries) await stmts.putKv.query(k, v);
  await mirrored(async () => {
    for (const [k, v] of entries) await mirror.putKv(info.user, k, v);
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
        await disk.putKv(await duckKvText(), keepalive);
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

// Replace the disk copy with what DuckDB holds now (after a reset or an import).
async function replaceDisk() {
  if (!info.persistent || !info.disk.dir) return;
  try {
    pending.attempts = [];
    pending.runs = [];
    pending.kv = false;
    await disk.replaceLines('attempts', await allAttempts());
    await disk.replaceLines('runs', await allRuns());
    await disk.putKv(await duckKvText());
    info.disk.error = '';
  } catch (e) {
    info.disk.error = e.message || String(e);
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
// Anything that changes the tables must keep this a union (docs/learning-algorithm.md).

// another profile's answers and runs: its safety copy in this browser, else its folder
export async function profileData(name) {
  const copy = await mirror.load(name);
  return copy.attempts.length ? copy : (await disk.loadStored(name)) || copy;
}
export const folderData = disk.loadPicked;

export async function bringIn(data, origin) {
  const have = new Set(rows(await conn.query('SELECT t, string_idx AS s, fret AS f FROM attempts')).map(attemptKey));
  const attempts = [];
  for (const a of data.attempts) {
    if (have.has(attemptKey(a))) continue;
    have.add(attemptKey(a));
    attempts.push(toAttemptCopy({ ...a, origin }));
  }
  const known = await duckRuns();
  const runs = Object.values(data.runs).filter((r) => r?.run_id && !known[r.run_id]).map((r) => toRun({ ...r, origin }));
  await insertAttempts(attempts);
  for (const r of runs) await stmts.putRun.query(...runValues(r));
  await mirrored(async () => {
    await mirror.addAttempts(info.user, attempts);
    for (const r of runs) await mirror.putRun(info.user, r);
  });
  for (const a of attempts) queueDisk('attempts', a);
  for (const r of runs) queueDisk('runs', r);
  if (attempts.length) await staleModels();
  markDirty();
  return { attempts: attempts.length, runs: runs.length };
}

// {origin: answers} of what was brought in
export async function origins() {
  const out = {};
  for (const r of rows(await conn.query('SELECT origin, count(*)::INT AS n FROM attempts WHERE origin IS NOT NULL GROUP BY origin ORDER BY origin'))) out[r.origin] = r.n;
  return out;
}

export async function removeOrigin(origin) {
  await conn.query(`DELETE FROM attempts WHERE origin = ${literal(origin)}`);
  await conn.query(`DELETE FROM runs WHERE origin = ${literal(origin)}`);
  await mirrored(async () => mirror.replace(info.user, await duckKvText(), await allAttempts(), await duckRuns()));
  await replaceDisk();
  await staleModels();
  markDirty();
}

const rows = (table) => table.toArray().map((r) => r.toJSON());

// every [key, value] whose key starts with `prefix` (a constant, not user input)
export async function entries(prefix) {
  return rows(await conn.query(`SELECT key, value FROM kv WHERE key LIKE '${prefix}%' ORDER BY key`)).map((r) => [r.key, JSON.parse(r.value)]);
}

export async function get(key) {
  const r = rows(await stmts.getKv.query(key))[0];
  return r ? JSON.parse(r.value) : undefined;
}

// Writes go to DuckDB and to the IndexedDB safety copy. A tab that could not open the
// file (NOT SAVED) leaves the safety copy alone, so it can't overwrite the real data.
const mirrored = (write) => {
  if (!info.persistent) return Promise.resolve();
  return write().catch((e) => {
    info.mirrorError = e.message || String(e);
    console.error('Safety copy write failed', e);
  });
};

export async function set(key, value) {
  const text = JSON.stringify(value);
  await Promise.all([stmts.putKv.query(key, text), mirrored(() => mirror.putKv(info.user, key, text))]);
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
    interval: a.interval, task: a.task, answer_name: a.answerName, error_type: a.errorType, probe: a.probe,
    cue_mode: a.cueMode, cue_target: a.cueTarget, cue_n: a.cueN, cue_labels: a.cueLabels, cue_dist: a.cueDist, cue_nearest: a.cueNearest,
    special: a.special, shown_name: a.shownName, bpm: a.bpm, origin: a.origin,
  };
};
// every column must have a field: a missing one would be saved empty
{
  const missing = ATTEMPT_COLS.filter((c) => !(c in attemptRow({})));
  if (missing.length) console.error('attemptRow is missing columns', missing);
  // the log tables stay a union of rows (bringIn): every column nullable, rows built by name
  const required = Object.values(TABLES).flatMap(({ cols }) => cols.filter(([, type]) => /NOT NULL/i.test(type)).map(([n]) => n));
  if (required.length) console.error('log table columns must be nullable', required);
}
const attemptValues = (a) => {
  const row = attemptRow(a);
  return ATTEMPT_COLS.map((c) => row[c] ?? null);
};

// ---------- runs ----------
// A run row is a plain object with the RUN_COLS fields. It is written when the run
// starts and again when it ends.

const runValues = (r) => RUN_COLS.map((c) => (r[c] === undefined ? null : r[c]));
const RUN_INTS = new Set(['run_count', 'sprint_sec', 'zone_span', 'zone_fret_min', 'zone_fret_max', 'timeout_sec', 'prompts', 'correct', 'median_ms', 'due_at_start']);
// rounded like DuckDB stores them, so the safety copy compares equal
const toRun = (r) => Object.fromEntries(RUN_COLS.map((c) => {
  const v = r[c] ?? null;
  return [c, v != null && RUN_INTS.has(c) ? Math.round(Number(v)) : v];
}));

export async function saveRun(row) {
  row = toRun(row);
  await Promise.all([stmts.putRun.query(...runValues(row)), mirrored(() => mirror.putRun(info.user, row))]);
  queueDisk('runs', row);
  markDirty();
}

export async function allRuns() {
  return rows(await conn.query('SELECT * FROM runs ORDER BY started_at')).map(toRun);
}

async function duckRuns() {
  return Object.fromEntries((await allRuns()).map((r) => [r.run_id, r]));
}

// A run still open at start-up belongs to a page that was closed mid-run.
async function closeOpenRuns() {
  const open = rows(await conn.query(`SELECT r.*, (SELECT max(t) FROM attempts a WHERE a.run_id = r.run_id) AS last_t,
    (SELECT count(*) FROM attempts a WHERE a.run_id = r.run_id) AS n,
    (SELECT count(*) FROM attempts a WHERE a.run_id = r.run_id AND a.correct) AS ok
    FROM runs r WHERE ended_at IS NULL`));
  for (const r of open) {
    await saveRun({ ...r, ended_at: r.last_t ?? r.started_at, end_reason: 'closed', prompts: Number(r.n), correct: Number(r.ok) });
  }
}

export async function addAttempt(a) {
  a = toAttemptCopy(a);
  await Promise.all([stmts.addAttempt.query(...attemptValues(a)), mirrored(() => mirror.addAttempt(info.user, a))]);
  queueDisk('attempts', a);
  markDirty();
}

const literal = (v) =>
  v == null ? 'NULL'
    : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE')
      : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
        : `'${String(v).replace(/'/g, "''")}'`;

// Bulk load: hundreds of rows per statement instead of one worker round trip per answer.
async function insertAttempts(list) {
  for (let i = 0; i < list.length; i += 500) {
    const values = list.slice(i, i + 500).map((a) => `(${attemptValues(a).map(literal).join(', ')})`);
    await conn.query(`INSERT INTO attempts (${ATTEMPT_COLS.join(', ')}) VALUES ${values.join(', ')}`);
  }
}

// Load kv (JSON text), attempts and runs into DuckDB, replacing what is there. DuckDB only.
async function loadDuck(kvText, attempts, runs = {}) {
  await conn.query('BEGIN TRANSACTION');
  try {
    await conn.query('DELETE FROM kv');
    await conn.query('DELETE FROM attempts');
    await conn.query('DELETE FROM runs');
    for (const [k, v] of Object.entries(kvText)) await stmts.putKv.query(k, v);
    await insertAttempts(attempts);
    const list = Object.values(runs).map(toRun);
    for (let i = 0; i < list.length; i += 500) {
      const values = list.slice(i, i + 500).map((r) => `(${runValues(r).map(literal).join(', ')})`);
      await conn.query(`INSERT INTO runs (${RUN_COLS.join(', ')}) VALUES ${values.join(', ')}`);
    }
    await conn.query('COMMIT');
  } catch (e) {
    await conn.query('ROLLBACK').catch(() => {});
    throw e;
  }
  dirty = true;
  await flush();
}

async function duckKvText() {
  const kv = {};
  for (const r of rows(await conn.query('SELECT key, value FROM kv'))) kv[r.key] = r.value;
  return kv;
}

const sameKv = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
const runsText = (runs) => Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, JSON.stringify(runValues(r))]));

// Compare the DuckDB file with the safety copy and repair whichever side is behind.
// The safety copy is written on every change, so it wins, except for answers it is
// missing (a failed copy write), which are taken from DuckDB.
async function reconcile() {
  const user = info.user;
  const duckKv = await duckKvText();
  const duckCount = await countAttempts();
  const runs = await duckRuns();
  // the usual case first: same number of answers, same kv and runs, checked without reading
  // every answer of the copy (that read grows with the log and was done at every start)
  const quick = await mirror.loadKvRuns(user);
  const copyCount = await mirror.countAttempts(user);
  const quickEmpty = !copyCount && !Object.keys(quick.kv).length;
  if (!quickEmpty && duckCount === copyCount && sameKv(duckKv, quick.kv) && sameKv(runsText(runs), runsText(quick.runs))) return;
  const copy = await mirror.load(user);
  const empty = !copy.attempts.length && !Object.keys(copy.kv).length;
  const runsMissing = Object.keys(runs).some((id) => !copy.runs[id]);
  if (empty || duckCount > copy.attempts.length || runsMissing) {
    // first start with the safety copy, or writes whose copy failed
    copy.kv = { ...duckKv, ...copy.kv };
    copy.runs = { ...runs, ...copy.runs };
    if (empty || duckCount > copy.attempts.length) copy.attempts = await allAttempts();
    await mirror.replace(user, copy.kv, copy.attempts, copy.runs);
  }
  if (duckCount === copy.attempts.length && sameKv(duckKv, copy.kv) && sameKv(runsText(runs), runsText(copy.runs))) return;
  console.warn(`DuckDB file out of date (${duckCount} answers, safety copy has ${copy.attempts.length}): rebuilding it`);
  await loadDuck(copy.kv, copy.attempts, copy.runs);
  info.recovered = { before: duckCount, after: copy.attempts.length };
}

function toAttempt(r) {
  return {
    t: r.t, runId: r.run_id, tuning: r.tuning,
    desc: { type: r.zone_type, sk: r.zone_strings, cs: r.zone_cs, cf: r.zone_cf, span: r.zone_span, fretMin: r.zone_fret_min, fretMax: r.zone_fret_max },
    s: r.string_idx, f: r.fret, target: r.target, spelling: r.spelling, played: r.played, correct: r.correct, ms: r.ms, g: r.grade, review: r.review,
    solveMs: r.solve_ms, wrongCount: r.wrong_count, wrongNotes: r.wrong_notes, wrongMs: r.wrong_ms,
    prevTarget: r.prev_target, prevSpelling: r.prev_spelling, prevS: r.prev_string, prevF: r.prev_fret,
    retest: r.retest, queueShown: r.queue_shown, showMe: r.show_me, fsrsGrade: r.fsrs_grade,
    predP: r.pred_p, predMs: r.pred_ms, predR: r.pred_r, predS: r.pred_s, predD: r.pred_d,
    interval: r.interval,
    task: r.task, answerName: r.answer_name, errorType: r.error_type, probe: r.probe,
    cueMode: r.cue_mode, cueTarget: r.cue_target, cueN: r.cue_n, cueLabels: r.cue_labels, cueDist: r.cue_dist, cueNearest: r.cue_nearest,
    special: r.special, shownName: r.shown_name, bpm: r.bpm,
    instrument: r.instrument, strings: r.strings, origin: r.origin,
  };
}

export async function allAttempts() {
  return rows(await conn.query('SELECT * FROM attempts ORDER BY t')).map(toAttempt);
}

// Newest rows of one of the TABLES, for the table viewer in Settings.
export async function tableRows(table, limit = 50) {
  if (!TABLES[table]) throw new Error('Unknown table ' + table);
  const order = table === 'runs' ? 'started_at' : 't';
  const total = Number(rows(await conn.query(`SELECT count(*) AS n FROM ${table}`))[0].n);
  const list = rows(await conn.query(`SELECT ${colNames(table).join(', ')} FROM ${table} ORDER BY ${order} DESC LIMIT ${Math.round(limit)}`));
  return { total, rows: list };
}

export async function countAttempts() {
  return Number(rows(await conn.query('SELECT count(*) AS n FROM attempts'))[0].n);
}

// Run read-only SQL against the current user's database (handy from the console).
// Changes made here skip the safety copy and are undone on the next start.
export async function sql(query) {
  return rows(await conn.query(query));
}

export async function exportAll() {
  const kv = {};
  for (const r of rows(await conn.query('SELECT key, value FROM kv'))) kv[r.key] = JSON.parse(r.value);
  return {
    app: 'fretboard-trainer', version: 3, user: info.user, engine: info.version, exported: new Date().toISOString(),
    kv, attempts: await allAttempts(), runs: await allRuns(),
  };
}

export async function clearAll() {
  await loadDuck({}, [], {});
  await mirrored(() => mirror.replace(info.user, {}, [], {}));
  await replaceDisk();
}

export async function importAll(data) {
  if (data?.app !== 'fretboard-trainer') throw new Error('Not a Fretboard Trainer backup');
  const kvText = Object.fromEntries(Object.entries(data.kv || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  const attempts = data.attempts || [];
  const runs = Object.fromEntries((data.runs || []).map((r) => [r.run_id, toRun(r)]));
  await loadDuck(kvText, attempts, runs);
  await mirrored(() => mirror.replace(info.user, kvText, attempts.map(toAttemptCopy), runs));
  await replaceDisk();
}

// plain copy of an answer's known fields, as stored in the safety copy
function toAttemptCopy(a) {
  const values = attemptValues(a);
  return toAttempt(Object.fromEntries(ATTEMPT_COLS.map((c, i) => [c, values[i]])));
}
