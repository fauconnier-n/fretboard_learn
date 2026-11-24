// The practice rework (no time limit, retry after a miss, the asked note's entrance, 3-string boxes,
// the known bar): node tools/browser-check.mjs tools/rework.mjs --out screenshots/<name>
import { wait, key, answer, ready, tab, runGif } from './tour.mjs';

const spage = (name) => `document.querySelector('[data-open=${name}]').click(); await wait(500);`;
// a play run on, the first prompt up; settle: ms to wait after it appears
const start = (settle) => `${wait} ${key} ${tab('practice')} key('Escape'); await wait(300);
  document.querySelector('[data-task=play]').click(); key('Enter'); await wait(500); key('Enter'); await wait(${settle});`;
// the asked note entering: big over the board, then into its place (1 s)
const intro = (name, opts = {}) => ({ name, ...opts, gif: { clip: '#view-practice', ms: 1500, scale: opts.mobile ? 0.8 : 0.6 }, js: `${start(0)}` });
// a wrong note: the prompt stays, without the answer
const wrong = `${answer} const n = document.getElementById('promptNote').textContent; key(n[0] === 'C' ? 'D' : 'C'); await wait(700);`;
const phone = { width: 844, height: 390, mobile: true };

export default [
  { name: '0-ready', shot: false, js: ready },
  intro('1-note-entrance'),
  { name: '2-note-big', js: `${start(250)}` },
  { name: '3-after-wrong-note', js: `${start(1200)} ${wrong} return document.getElementById('promptSub').textContent;` },
  runGif('4-run-wrong-then-right', { wrong: true }),
  { name: '5-settings-practice', full: true, js: `${wait} ${key} key('Escape'); await wait(300); ${tab('settings')} ${spage('practice')}` },
  { name: '6-stats', full: true, js: `${tab('stats')}` },
  { name: '7-boxes', js: `${wait} ${tab('practice')} document.querySelector('[data-task=play]').click(); ${key} key('Enter'); await wait(800);` },
  intro('m1-phone-note-entrance', phone),
  { name: 'm2-phone-note-big', ...phone, js: `${start(250)}` },
  { name: 'm3-phone-after-wrong-note', ...phone, js: `${start(1200)} ${wrong}` },
  runGif('m4-phone-run-wrong-then-right', { ...phone, wrong: true }),
  { name: 'm5-phone-settings-practice', ...phone, full: true, js: `${wait} ${key} key('Escape'); await wait(300); ${tab('settings')} ${spage('practice')}` },
];
