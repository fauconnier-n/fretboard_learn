// Automatic backups: full exports of a user's data, kept in IndexedDB, which is
// a separate store from the DuckDB files in OPFS, so a damaged database file
// does not take its backups with it.

const DB_NAME = 'fretboard-backups';
const KEEP = 10; // newest backups kept per user, plus the one with the most answers

let dbPromise = null;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const st = req.result.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
      st.createIndex('user', 'user');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('backups', mode);
    const req = fn(t.objectStore('backups'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const summary = ({ data, ...meta }) => meta;

export async function list(user) {
  const all = await tx('readonly', (st) => st.index('user').getAll(user));
  return all.map(summary).sort((a, b) => b.t - a.t);
}

export const get = (id) => tx('readonly', (st) => st.get(id));

// data: the object from storage.exportAll(); reason: 'run' | 'manual' | 'before restore'
export async function save(user, data, reason) {
  const id = await tx('readwrite', (st) => st.add({ user, t: Date.now(), reason, attempts: data.attempts.length, data }));
  await prune(user);
  return id;
}

async function prune(user) {
  const items = await list(user);
  const largest = items.reduce((m, b) => (!m || b.attempts > m.attempts ? b : m), null);
  const drop = items.slice(KEEP).filter((b) => b.id !== largest.id);
  if (drop.length) await tx('readwrite', (st) => drop.forEach((b) => st.delete(b.id)));
}
