// A tour of the main screens for tools/browser-check.mjs: node tools/browser-check.mjs tools/tour.mjs --out <dir>
const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
const tab = (name) => `document.querySelector('.tabs button[data-tab=${name}]').click(); await new Promise((r) => setTimeout(r, 700));`;
const key = 'const key = (k, shift) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true }));';
// answers a play prompt from the zone's own note (keyboard fallback)
const answer = `const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nat = [0, 2, 4, 5, 7, 9, 11];
const play = (n) => { const pc = PC[n]; const i = nat.indexOf(pc); if (i >= 0) key('CDEFGAB'[i]); else key('CDEFGAB'[nat.indexOf(pc - 1)], true); };`;

export default [
  { name: '1-practice-idle', js: `${tab('practice')} document.querySelector('[data-task=play]').click(); document.querySelector('[data-mode=count]').click();` },
  { name: '2-practice-preview', js: `${wait} ${key} key('Enter'); await wait(600);` },
  { name: '3-practice-prompt', js: `${wait} ${key} ${answer} key('Enter'); await wait(500); for (let i = 0; i < 3; i++) { play(document.getElementById('promptNote').textContent); await wait(1300); } key('C'); await wait(400);` },
  { name: '4-practice-summary', full: true, js: `${wait} ${key} ${answer} for (let i = 0; i < 40 && document.getElementById('startBtn').textContent.includes('Stop'); i++) { const t = document.getElementById('promptNote').textContent; if (/Again|Play it/.test(document.getElementById('promptSub').textContent)) play(t); await wait(1300); } await wait(800);` },
  { name: '5-true-or-false', js: `${wait} ${key} document.querySelector('[data-task=truefalse]').click(); key('Enter'); await wait(500); key('Enter'); await wait(800);` },
  { name: '6-intervals', js: `${wait} ${key} key('Escape'); await wait(300); document.querySelector('[data-task=play]').click(); ${tab('intervals')} key('Enter'); await wait(800);` },
  { name: '7-tuner', js: `${wait} ${key} key('Escape'); await wait(300); ${tab('tuner')}` },
  { name: '8-stats', full: true, js: `${tab('stats')}` },
  { name: '9-settings', full: true, js: `${tab('settings')}` },
  { name: '10-practice-phone', width: 390, height: 844, js: `${tab('practice')}` },
];
