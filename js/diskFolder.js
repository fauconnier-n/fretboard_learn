// @ts-check
// A profile's data copy in a folder the user picked (File System Access API: Chrome and Edge
// on a computer). The folder handle is kept in IndexedDB under the profile name. On a later
// visit the browser may ask for permission again (not when the app is installed, or after
// "Allow on every visit"), so the app shows a Reconnect button then. No browser global is
// touched at module level: the tests run the transport on a fake folder in Node.
import { isJsonl, profileNameFromFolder, sanitizeUser } from './disklayout.js';

const DB_NAME = 'fretboard-disk';
let dbPromise = null;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('handles', mode);
    const req = fn(t.objectStore('handles'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const loadHandle = (name) => tx('readonly', (st) => st.get(name));
export const saveHandle = (name, handle) => tx('readwrite', (st) => st.put(handle, name));
export const forgetHandle = (name) => tx('readwrite', (st) => st.delete(name));

const RW = { mode: 'readwrite' };
// 'granted' | 'prompt' | 'denied'; asking needs a click
export async function permission(handle, ask) {
  const h = /** @type {any} */ (handle);
  let p = await h.queryPermission(RW);
  if (p === 'prompt' && ask) p = await h.requestPermission(RW);
  return p;
}

export const pick = () => /** @type {any} */ (window).showDirectoryPicker({ id: 'fretboard-data', mode: 'readwrite', startIn: 'documents' });
export const createIn = (location, folderName) => location.getDirectoryHandle(folderName, { create: true });

const notFound = (e) => e?.name === 'NotFoundError';

async function readText(dir, name) {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch (e) {
    if (notFound(e)) return '';
    throw e;
  }
}

async function writeText(dir, name, text) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

async function remove(dir, name, recursive) {
  try {
    await dir.removeEntry(name, { recursive });
  } catch (e) {
    if (!notFound(e)) throw e;
  }
}

// the name written in profile.json, else the folder's own name
export async function profileName(handle) {
  try {
    return sanitizeUser(JSON.parse(await readText(handle, 'profile.json')).name) || profileNameFromFolder(handle.name);
  } catch {
    return profileNameFromFolder(handle.name);
  }
}

export class FolderTransport {
  constructor(root) {
    this.root = root;
  }

  label() {
    return this.root.name;
  }

  readKv() {
    return readText(this.root, 'kv.json');
  }

  // the flat file of earlier versions first, then every run file in name (= time) order
  async readAll(kind) {
    const texts = [];
    const legacy = await readText(this.root, kind + '.jsonl');
    if (legacy) texts.push(legacy);
    let dir;
    try {
      dir = await this.root.getDirectoryHandle(kind);
    } catch (e) {
      if (notFound(e)) return texts;
      throw e;
    }
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && isJsonl(name)) names.push(name);
    names.sort();
    return texts.concat(await Promise.all(names.map((n) => readText(dir, n))));
  }

  async appendFile(kind, file, text) {
    const dir = await this.root.getDirectoryHandle(kind, { create: true });
    const fh = await dir.getFileHandle(file, { create: true });
    const size = (await fh.getFile()).size; // bytes, not characters
    const w = await fh.createWritable({ keepExistingData: true });
    await w.write({ type: 'write', position: size, data: text });
    await w.close(); // swapped in whole: a write cut short leaves the old file as it was
  }

  async clear(kind) {
    await remove(this.root, kind, true);
    await remove(this.root, kind + '.jsonl', false);
  }

  putKv(text) {
    return writeText(this.root, 'kv.json', text);
  }

  putProfile(text) {
    return writeText(this.root, 'profile.json', text);
  }
}
