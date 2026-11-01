// @ts-check
// The file layout of a profile's data copy, shared by the local server (data/<name>/) and a
// folder the user picks (<location>/fretboard-<name>/): pure helpers, also used by the tests.
//   profile.json          {"name": ...}
//   kv.json               settings and model meta, replaced whole
//   attempts/<file>.jsonl one append-only file per run; runs/<file>.jsonl its run row(s)
//   attempts.jsonl, runs.jsonl  the flat files of earlier versions: read, never written
// Small files per run mean a synced folder uploads only the current one, and two devices
// never write the same file. DuckDB (the command-line tool) reads them with read_json('.../attempts/*.jsonl').

export const sanitizeUser = (name) => String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

export const FILE_RE = /^(\d{8}-\d{6}-[a-z0-9]{1,16}|other)\.jsonl$/;
export const isJsonl = (name) => /\.jsonl$/i.test(name);

const pad = (n) => String(n).padStart(2, '0');

// Run ids are Date.now().toString(36), so the file name sorts by start time; rows without a
// usable id go to other.jsonl.
export function runFile(runId) {
  const id = String(runId || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  if (!id) return 'other.jsonl';
  const t = parseInt(id, 36);
  const d = new Date(t);
  const stamp = t > 946684800000 && t < 4102444800000
    ? `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
    : '00000000-000000';
  return `${stamp}-${id}.jsonl`;
}

// {file: items[]}: answers by their runId, run rows by run_id
export function groupByRun(kind, items) {
  const groups = {};
  for (const x of items) (groups[runFile(kind === 'attempts' ? x.runId : x.run_id)] ||= []).push(x);
  return groups;
}

export const toJsonl = (items) => items.map((x) => JSON.stringify(x) + '\n').join('');

// a line cut short by a crash is skipped
export const parseJsonl = (text) => text.split('\n').flatMap((l) => {
  if (!l.trim()) return [];
  try {
    return [JSON.parse(l)];
  } catch {
    return [];
  }
});

export const attemptKey = (a) => `${a.t}|${a.s}|${a.f}`;

// The [key, JSON text] entries of the disk's kv that the browser takes: keys it lacks, and values
// saved later than its own (settings carry savedAt, main.js saveSettings); otherwise the
// browser's value wins.
const savedAt = (text) => {
  try {
    return JSON.parse(text)?.savedAt || 0;
  } catch {
    return 0;
  }
};
export const kvFromDisk = (remote, local) =>
  Object.entries(remote).filter(([k, v]) => typeof v === 'string' && (!(k in local) || savedAt(v) > savedAt(local[k])));

// Everything read from a profile folder, as {kv, attempts, runs}. Files may overlap (a synced
// folder's "conflicted copy", a write repeated after a failure): answers are kept once by time
// and position, runs once by run_id, a finished run beating an open one.
export function fold(kvText, attemptsTexts, runsTexts) {
  let kv = {};
  try {
    kv = kvText ? JSON.parse(kvText) : {};
  } catch {}
  const seen = new Set();
  const attempts = [];
  for (const a of attemptsTexts.flatMap(parseJsonl)) {
    if (typeof a?.t !== 'number' || !a.desc || seen.has(attemptKey(a))) continue;
    seen.add(attemptKey(a));
    attempts.push(a);
  }
  const runs = {};
  for (const r of runsTexts.flatMap(parseJsonl)) {
    if (!r?.run_id) continue;
    if (runs[r.run_id]?.ended_at != null && r.ended_at == null) continue;
    runs[r.run_id] = r;
  }
  return { kv, attempts, runs };
}

export const profileFolder = (name) => 'fretboard-' + name;
export const profileNameFromFolder = (folder) => sanitizeUser(String(folder).replace(/^fretboard-/i, ''));
