// The README's pictures, from a new profile kept in the browser only (the test data stays out):
//   node tools/seed-growth.mjs screenshots/growth-data
//   node tools/browser-check.mjs tools/readme.mjs --fresh --no-seed --out screenshots/readme
//   node tools/readme-gifs.mjs screenshots/readme     (writes the GIFs into media/)
// The mastery map is shown after each mock-data snapshot of tools/seed-growth.mjs (a learner's
// first days), then a run is played live on top of the last one.
const SNAPS = [1, 2, 3, 5, 7, 10, 14, 19, 24];
const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
const until = `${wait} const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await wait(100); };`;
const ready = `${until} await until(() => window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length); await wait(800);`;
const key = 'const key = (k, shift) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true }));';
const answer = `const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nat = [0, 2, 4, 5, 7, 9, 11];
const play = (n) => { const pc = PC[n]; const i = nat.indexOf(pc); if (i >= 0) key('CDEFGAB'[i]); else key('CDEFGAB'[nat.indexOf(pc - 1)], true); };`;
const tab = (t) => `document.querySelector('.tabs button[data-tab=${t}]').click(); await wait(1200);`;
// a snapshot: import it (the page reloads), then the mastery map, framed for one GIF frame, its day in the title
const snap = (day, k) => [
  { name: `i${k}`, shot: false, js: `${wait} const st = await import('/js/storage.js'); await st.importAll(await (await fetch('/screenshots/growth-data/day${day}.json')).json()); location.reload();` },
  { name: `g${k}`, width: 1200, height: 520, js: `${ready} ${tab('stats')}
    const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim().startsWith('Mastery map'));
    h.querySelector('.muted').textContent = '· day ${day}'; h.scrollIntoView({ block: 'start' });
    scrollBy(0, -(document.querySelector('header')?.offsetHeight || 60) - 12); await wait(400);` },
];

export default [
  { name: 'a0', shot: false, js: `${until} await until(() => !document.getElementById('welcome').classList.contains('hidden')); document.getElementById('newProfileBtn').click(); await wait(200);
    const f = document.getElementById('newProfile'); f.profileName.value = 'demo'; f.store.value = 'browser'; f.requestSubmit();` },
  { name: 'a1', shot: false, js: `${ready} document.getElementById('firstRunDone').click(); await wait(400); document.getElementById('audioFirstDone').click(); await wait(600);` },
  ...SNAPS.flatMap(snap),
  // a run in motion: a few notes, one missed and shown; the steps of the bar turn green or red
  { name: 'run', gif: { clip: '#view-practice', ms: 10000, scale: 0.5 }, js: `${wait} ${key} ${answer} ${tab('practice')} key('Enter'); await wait(700); key('Enter'); await wait(500);
    (async () => { for (let i = 0; i < 7; i++) { await wait(900); const n = document.getElementById('promptNote').textContent; if (i === 3) { key(n[0] === 'C' ? 'D' : 'C'); await wait(900); } play(n); } })();` },
];
