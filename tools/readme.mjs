// The README's pictures, from a new profile kept in the browser only (the test data stays out):
//   node tools/browser-check.mjs tools/readme.mjs --fresh --no-seed --out screenshots/readme
// then node tools/readme-gifs.mjs screenshots/readme, which writes the GIFs into media/.
const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
const until = `${wait} const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await wait(100); };`;
const ready = `${until} await until(() => window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length); await wait(800);`;
const key = 'const key = (k, shift) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true }));';
const answer = `const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nat = [0, 2, 4, 5, 7, 9, 11];
const play = (n) => { const pc = PC[n]; const i = nat.indexOf(pc); if (i >= 0) key('CDEFGAB'[i]); else key('CDEFGAB'[nat.indexOf(pc - 1)], true); };`;
const done = "!document.getElementById('summary').classList.contains('hidden')";
const tab = (t) => `document.querySelector('.tabs button[data-tab=${t}]').click(); await wait(1200);`;
// the mastery map, framed for one GIF frame
const map = { width: 1200, height: 520, js: `${wait} ${tab('stats')} const h = [...document.querySelectorAll('h3, h2, .card-title, b')].find((x) => x.textContent.trim().startsWith('Mastery map')); (h || document.getElementById('heatBoard')).scrollIntoView({ block: 'start' }); scrollBy(0, -(document.querySelector('header')?.offsetHeight || 60) - 12); await wait(400);` };
// a whole run answered at a human pace (a miss now and then), then the mastery map
const run = (k) => [{
  name: `r${k}`, shot: false, js: `${wait} ${key} ${answer} ${tab('practice')} key('Enter'); await wait(700); key('Enter'); await wait(600);
    for (let i = 0; i < 80 && !(${done}); i++) {
      const n = document.getElementById('promptNote').textContent;
      if (PC[n] !== undefined) { if (i % 9 === 4) key(n[0] === 'C' ? 'D' : 'C'); else play(n); }
      await wait(i % 9 === 4 ? 2400 : 1100 + (i % 5) * 250);
    }
    await wait(1500); return document.getElementById('zoneLabel').textContent;`,
}, { name: `g${k}`, ...map }];

export default [
  { name: 'a0', shot: false, js: `${until} await until(() => !document.getElementById('welcome').classList.contains('hidden')); document.getElementById('newProfileBtn').click(); await wait(200);
    const f = document.getElementById('newProfile'); f.profileName.value = 'demo'; f.store.value = 'browser'; f.requestSubmit();` },
  { name: 'a1', shot: false, js: `${ready} document.getElementById('firstRunDone').click(); await wait(600);` },
  { name: 'g0', ...map },
  ...Array.from({ length: 8 }, (_, i) => run(i + 1)).flat(),
  // a run in motion: a few notes, one missed and shown
  { name: 'run', gif: { clip: '#view-practice', ms: 9000, scale: 0.5 }, js: `${wait} ${key} ${answer} ${tab('practice')} key('Enter'); await wait(700); key('Enter'); await wait(500);
    (async () => { for (let i = 0; i < 6; i++) { await wait(1000); const n = document.getElementById('promptNote').textContent; if (i === 3) { key(n[0] === 'C' ? 'D' : 'C'); await wait(900); } play(n); } })();` },
  { name: 'stats', full: true, js: `${wait} await wait(9000); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(800); ${tab('stats')}` },
];
