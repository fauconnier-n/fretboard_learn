// @ts-check
// The disk copy of a profile's data, laid out as in js/disklayout.js and kept by one of two
// transports: a folder the user picked (js/diskFolder.js) or, on localhost, the local server's
// data/<name>/ (serve.ps1). storage.js writes through here after every change and merges from
// here on start, so a wiped browser refills itself. With neither (a static host such as GitHub
// Pages and no folder chosen) configured() is false and everything stays in the browser.
import { fold, groupByRun, profileFolder, toJsonl } from './disklayout.js';
import * as folder from './diskFolder.js';

const LOCAL = typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const KEEPALIVE_MAX = 60000; // fetch keepalive (used while the page closes) is limited to 64 KB
const DOWN = 'local server not reachable (run start.bat)';

let transport = null;
let handle = null; // the folder, when mode is 'folder'
const state = { mode: 'none', local: LOCAL, name: '', needsPermission: false };

// ---------- the local server ----------

async function call(url, opts) {
  try {
    return await fetch(url, opts);
  } catch {
    throw new Error(DOWN);
  }
}

async function getText(url) {
  const r = await call(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`disk copy: ${url} ${r.status}`);
  return r.text();
}

async function send(url, method, body, keepalive) {
  const r = await call(url, { method, body, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, keepalive: keepalive && body.length < KEEPALIVE_MAX });
  if (!r.ok) throw new Error(`disk copy: ${method} ${url} failed (${r.status})`);
}

const server = (name) => {
  const base = 'api/data/' + name + '/';
  return {
    readKv: () => getText(base + 'kv.json'),
    readAll: async (kind) => [await getText(base + kind)],
    appendFile: (kind, file, text, keepalive) => send(base + kind + '/' + file, 'POST', text, keepalive),
    clear: (kind) => send(base + kind, 'DELETE', ''),
    putKv: (text, keepalive) => send(base + 'kv.json', 'PUT', text, keepalive),
    putProfile: (text) => send(base + 'profile.json', 'PUT', text),
  };
};

async function serverDir() {
  try {
    const r = await fetch('api/disk', { cache: 'no-store' });
    return r.ok ? (await r.json()).dir || null : null;
  } catch {
    return null;
  }
}

// ---------- choice of transport ----------

export const supportsFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.isSecureContext;
export const status = () => ({ ...state, supported: supportsFolder() });
// a copy is wanted and can be written (the server may still be down: that is retried)
export const configured = () => state.mode !== 'none' && !state.needsPermission;

async function checkFolder(ask) {
  state.needsPermission = (await folder.permission(handle, ask)) !== 'granted';
  transport = state.needsPermission ? null : new folder.FolderTransport(handle);
  return !state.needsPermission;
}

// The profile's stored folder first; else the local server, on localhost, unless the profile
// was made browser-only; else none.
export async function start(name, store) {
  transport = null;
  handle = await folder.loadHandle(name).catch(() => null);
  Object.assign(state, { mode: 'none', name: '', needsPermission: false });
  if (handle) {
    Object.assign(state, { mode: 'folder', name: handle.name });
    await checkFolder(false);
  } else if (LOCAL && store !== 'browser') {
    state.mode = 'server';
    transport = server(name);
  }
  return status();
}

// The label of a copy that can be reached right now, or null (storage keeps it as info.disk.dir).
export async function probe() {
  if (state.mode === 'folder') return transport || (await checkFolder(false)) ? handle.name : null;
  if (state.mode === 'server') {
    const dir = await serverDir();
    if (dir) state.name = dir;
    return dir;
  }
  return null;
}

function active() {
  if (!transport) throw new Error(state.needsPermission ? 'the data folder needs permission again' : 'no disk copy');
  return transport;
}

// {kv: {key: jsonText}, attempts: [...], runs: {run_id: row}}
async function loadWith(t) {
  const [kv, attempts, runs] = await Promise.all([t.readKv(), t.readAll('attempts'), t.readAll('runs')]);
  return fold(kv, attempts, runs);
}
export const load = () => loadWith(active());

// Another profile's folder, for bringing its answers in: the one stored under its name (asking
// for permission if need be: call from a click), or null when it has none.
export async function loadStored(name) {
  const h = await folder.loadHandle(name).catch(() => null);
  if (!h) return null;
  if ((await folder.permission(h, true)) !== 'granted') throw new Error(`the folder of "${name}" needs permission`);
  return loadWith(new folder.FolderTransport(h));
}

// a folder the user picks now: {name, data}
export async function loadPicked() {
  const { handle, name } = await openFolder();
  return { name, data: await loadWith(new folder.FolderTransport(handle)) };
}

// kind: 'attempts' | 'runs'; one append per run file
export async function append(kind, items, keepalive) {
  for (const [file, list] of Object.entries(groupByRun(kind, items))) await active().appendFile(kind, file, toJsonl(list), keepalive);
}

export async function replaceLines(kind, items) {
  await active().clear(kind);
  await append(kind, items);
}

export const putKv = (kv, keepalive) => active().putKv(JSON.stringify(kv), keepalive);

// ---------- folders (each needs a click, except forget) ----------

// an existing profile folder, with the name found inside it
export async function openFolder() {
  const h = await folder.pick();
  return { handle: h, name: await folder.profileName(h) };
}

export async function useFolder(name, h) {
  await folder.saveHandle(name, h);
  await start(name);
}

// a new fretboard-<name> folder in a location the user picks (an existing one is reused)
export async function createFolder(name) {
  const h = await folder.createIn(await folder.pick(), profileFolder(name));
  await new folder.FolderTransport(h).putProfile(JSON.stringify({ name, created: new Date().toISOString() }));
  await useFolder(name, h);
}

export const reconnect = () => (handle ? checkFolder(true) : Promise.resolve(false));

export async function forget(name, store) {
  await folder.forgetHandle(name);
  await start(name, store);
}
