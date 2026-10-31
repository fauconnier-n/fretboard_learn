// Offline support: network first (so edits show up straight away), cache as fallback.
const CACHE = 'fretboard-trainer-v14';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/app.css',
  'js/main.js', 'js/music.js', 'js/zones.js', 'js/srs.js', 'js/audio.js', 'js/pitch.js',
  'js/fretboard.js', 'js/quiz.js', 'js/tuner.js', 'js/stats.js', 'js/storage.js', 'js/backup.js', 'js/mirror.js', 'js/modelcheck.js', 'js/disk.js', 'js/cues.js',
  'vendor/duckdb/duckdb-wasm.mjs', 'vendor/duckdb/apache-arrow.mjs', 'vendor/duckdb/flatbuffers.mjs',
  'vendor/duckdb/tslib.mjs', 'vendor/duckdb/duckdb-browser-base.worker.js', 'vendor/duckdb/duckdb-base.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // the disk copy API must always reach the server, never a cached answer
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html'))),
  );
});
