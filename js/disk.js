// @ts-check
// Disk copy: every answer, run and setting is also saved in files on disk by the local
// server (serve.ps1), under data/<user>/. Everything in the browser (the DuckDB file, the
// IndexedDB safety copy, the backups) goes together on "clear site data", and is separate
// for each browser and address; the disk copy survives that, and storage.js refills the
// browser from it on start.
//   attempts.jsonl  one answer per line, append-only (same fields as the safety copy)
//   runs.jsonl      one run row per line, append-only; the last line for a run_id wins
//   kv.json         settings and models, {key: JSON text}, replaced whole
// The app works without it (a static host, or the server is down): writes then wait in
// memory and the next start or the next reachable save catches the disk up.

const API = 'api/data/';
const DOWN = 'local server not reachable (run start.bat)';

// fetch, with a readable message when the server is not running
async function call(url, opts) {
  try {
    return await fetch(url, opts);
  } catch {
    throw new Error(DOWN);
  }
}
const KEEPALIVE_MAX = 60000; // fetch keepalive (used while the page closes) is limited to 64 KB

// The disk folder, or null when there is no server with the disk API.
export async function probe() {
  try {
    const r = await fetch('api/disk', { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).dir || null;
  } catch {
    return null;
  }
}

async function getText(user, file) {
  const r = await call(API + user + '/' + file, { cache: 'no-store' });
  if (r.status === 404) return '';
  if (!r.ok) throw new Error(`disk copy: ${file} ${r.status}`);
  return r.text();
}

// a line cut short by a crash is skipped
const lines = (text) => text.split('\n').flatMap((l) => {
  if (!l.trim()) return [];
  try {
    return [JSON.parse(l)];
  } catch {
    return [];
  }
});

// {kv: {key: jsonText}, attempts: [...], runs: {run_id: row}}
export async function load(user) {
  const [kvText, attemptsText, runsText] = await Promise.all(['kv.json', 'attempts.jsonl', 'runs.jsonl'].map((f) => getText(user, f)));
  let kv = {};
  try {
    kv = kvText ? JSON.parse(kvText) : {};
  } catch {}
  const runs = {};
  for (const r of lines(runsText)) if (r?.run_id) runs[r.run_id] = r;
  return { kv, attempts: lines(attemptsText).filter((a) => typeof a?.t === 'number' && a.desc), runs };
}

async function send(user, file, method, body, keepalive) {
  const r = await call(API + user + '/' + file, {
    method, body, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    keepalive: keepalive && body.length < KEEPALIVE_MAX,
  });
  if (!r.ok) throw new Error(`disk copy: saving ${file} failed (${r.status})`);
}

const jsonl = (items) => items.map((x) => JSON.stringify(x) + '\n').join('');

export const append = (user, file, items, keepalive) => send(user, file, 'POST', jsonl(items), keepalive);
export const replaceLines = (user, file, items) => send(user, file, 'PUT', jsonl(items));
export const putKv = (user, kvText, keepalive) => send(user, 'kv.json', 'PUT', JSON.stringify(kvText), keepalive);
