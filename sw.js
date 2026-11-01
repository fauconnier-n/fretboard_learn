// Offline support: app files network first (so edits show up straight away), cache as fallback.
// Bump CACHE when the list of files changes.
const CACHE = 'fretboard-trainer-v34';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/app.css',
  'js/main.js', 'js/music.js', 'js/zones.js', 'js/srs.js', 'js/audio.js', 'js/pitch.js',
  'js/fretboard.js', 'js/quiz.js', 'js/tuner.js', 'js/stats.js', 'js/storage.js', 'js/backup.js', 'js/idb.js', 'js/logQueries.js', 'js/modelcheck.js', 'js/disk.js', 'js/cues.js', 'js/intervals.js', 'js/intervalsView.js', 'js/strum.js', 'js/guitarMenu.js', 'js/palette.js', 'js/instruments.js', 'js/progress.js', 'js/burst.js', 'js/disklayout.js', 'js/diskFolder.js', 'js/version.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// only this app's caches: other sites on the same origin (user.github.io) keep theirs
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fretboard-trainer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // the disk copy API must always reach the server, never a cached answer
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const fetchAndCache = () => fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  });
  e.respondWith(fetchAndCache().catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
