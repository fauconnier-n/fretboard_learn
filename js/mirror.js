// Safety copy of every write, in IndexedDB. DuckDB stays the query engine, but its OPFS
// file (DuckDB 2.0 dev build) has come back empty twice during testing. IndexedDB is the
// browser's long-established transactional store, so each kv value and each answer is
// written here too, and the DuckDB file is rebuilt from this copy whenever they disagree.
//   kv        {user, key, value}   value is the JSON text stored in DuckDB
//   attempts  {user, a}            a is one answer, as passed to storage.addAttempt
//   runs      {user, run_id, row}  row is one run, as stored in the runs table

const DB_NAME = 'fretboard-mirror';
const TX = { durability: 'strict' }; // flush to disk before the write counts as done

let dbp = null;

function idb() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      if (e.oldVersion < 1) {
        d.createObjectStore('kv', { keyPath: ['user', 'key'] });
        d.createObjectStore('attempts', { autoIncrement: true }).createIndex('user', 'user');
      }
      if (e.oldVersion < 2) d.createObjectStore('runs', { keyPath: ['user', 'run_id'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});
const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const userRange = (user) => IDBKeyRange.only(user);

export async function putKv(user, key, value) {
  const tx = (await idb()).transaction('kv', 'readwrite', TX);
  tx.objectStore('kv').put({ user, key, value });
  await done(tx);
}

export async function addAttempt(user, a) {
  const tx = (await idb()).transaction('attempts', 'readwrite', TX);
  tx.objectStore('attempts').add({ user, a });
  await done(tx);
}

// several answers in one transaction (restoring from the disk copy)
export async function addAttempts(user, list) {
  const tx = (await idb()).transaction('attempts', 'readwrite', TX);
  const st = tx.objectStore('attempts');
  for (const a of list) st.add({ user, a });
  await done(tx);
}

export async function putRun(user, row) {
  const tx = (await idb()).transaction('runs', 'readwrite', TX);
  tx.objectStore('runs').put({ user, run_id: row.run_id, row });
  await done(tx);
}

export async function countAttempts(user) {
  const tx = (await idb()).transaction('attempts');
  return result(tx.objectStore('attempts').index('user').count(userRange(user)));
}

// kv and runs only, for the start-up check (the answers are counted with countAttempts)
export async function loadKvRuns(user) {
  const tx = (await idb()).transaction(['kv', 'runs']);
  const userKeys = IDBKeyRange.bound([user], [user, []]);
  const kvRows = await result(tx.objectStore('kv').getAll(userKeys));
  const runRows = await result(tx.objectStore('runs').getAll(userKeys));
  const kv = {};
  for (const r of kvRows) kv[r.key] = r.value;
  const runs = {};
  for (const r of runRows) runs[r.run_id] = r.row;
  return { kv, runs };
}

// {kv: {key: jsonText}, attempts: [...] in insertion order, runs: {run_id: row}}
export async function load(user) {
  const tx = (await idb()).transaction(['kv', 'attempts', 'runs']);
  const userKeys = IDBKeyRange.bound([user], [user, []]);
  const kvRows = await result(tx.objectStore('kv').getAll(userKeys));
  const rows = await result(tx.objectStore('attempts').index('user').getAll(userRange(user)));
  const runRows = await result(tx.objectStore('runs').getAll(userKeys));
  const kv = {};
  for (const r of kvRows) kv[r.key] = r.value;
  const runs = {};
  for (const r of runRows) runs[r.run_id] = r.row;
  return { kv, attempts: rows.map((r) => r.a), runs };
}

// Replace everything stored for one user. kvText values are JSON text, runs is {run_id: row}.
export async function replace(user, kvText, attempts, runs = {}) {
  const tx = (await idb()).transaction(['kv', 'attempts', 'runs'], 'readwrite', TX);
  const kv = tx.objectStore('kv');
  const st = tx.objectStore('attempts');
  const rs = tx.objectStore('runs');
  kv.delete(IDBKeyRange.bound([user], [user, []]));
  rs.delete(IDBKeyRange.bound([user], [user, []]));
  for (const row of Object.values(runs)) rs.put({ user, run_id: row.run_id, row });
  const req = st.index('user').openKeyCursor(userRange(user));
  req.onsuccess = () => {
    const c = req.result;
    if (c) {
      st.delete(c.primaryKey);
      c.continue();
      return;
    }
    for (const [key, value] of Object.entries(kvText)) kv.put({ user, key, value });
    for (const a of attempts) st.add({ user, a });
  };
  await done(tx);
}
