// @ts-check
// Automatic backups: full exports of a user's data, kept in their own IndexedDB database,
// apart from the profiles' data (idb.js), so a damaged profile does not take its backups with it.
//   backups  {id, user, t, reason, attempts, data}   the export itself
//   meta     {id, user, t, reason, attempts}         the same without data, for listing:
//            reading the list used to deserialise every stored export (up to 11 full copies
//            of the log) at every run end and every visit to Settings

const DB_NAME = 'fretboard-backups';
const KEEP = 10; // newest backups kept per user (one 'run' backup per day), plus the one with the most answers

let dbPromise = null;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true }).createIndex('user', 'user');
      if (e.oldVersion < 2) {
        const meta = db.createObjectStore('meta', { keyPath: 'id' });
        meta.createIndex('user', 'user');
        // summaries of the backups already stored
        const cur = req.transaction.objectStore('backups').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          meta.put(summary(c.value));
          c.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// fn(transaction) runs on both stores; resolves with the result of the request fn returns, if any
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['backups', 'meta'], mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const summary = ({ data, ...meta }) => { void data; return meta; };

export async function list(user) {
  const all = await tx('readonly', (t) => t.objectStore('meta').index('user').getAll(user));
  return all.sort((a, b) => b.t - a.t);
}

export const get = (id) => tx('readonly', (t) => t.objectStore('backups').get(id));

// data: the object from storage.exportAll(); reason: 'run' | 'manual' | 'before restore'
export async function save(user, data, reason) {
  const id = await tx('readwrite', (t) => {
    const row = { user, t: Date.now(), reason, attempts: data.attempts.length };
    const add = t.objectStore('backups').add({ ...row, data });
    add.onsuccess = () => t.objectStore('meta').put({ id: add.result, ...row });
    return add;
  });
  await prune(user);
  return id;
}

// a day's newest 'run' backup replaces that day's earlier ones, so a busy day does not push
// out the backups of the days before
async function prune(user) {
  const items = await list(user);
  const largest = items.reduce((m, b) => (!m || b.attempts > m.attempts ? b : m), null);
  const runDays = new Set();
  const kept = items.filter((b) => {
    const day = new Date(b.t).toDateString();
    if (b.reason !== 'run') return true;
    if (runDays.has(day)) return false;
    runDays.add(day);
    return true;
  }).slice(0, KEEP);
  const drop = items.filter((b) => !kept.includes(b) && b.id !== largest.id);
  if (drop.length) {
    await tx('readwrite', (t) => {
      for (const b of drop) {
        t.objectStore('backups').delete(b.id);
        t.objectStore('meta').delete(b.id);
      }
    });
  }
}
