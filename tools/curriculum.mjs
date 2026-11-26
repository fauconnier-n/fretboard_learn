// Fewer note-name labels, 25 prompts by default, the length menu:
// node tools/browser-check.mjs tools/curriculum.mjs --out screenshots/<name>
import { wait, key, ready, tab, runGif } from './tour.mjs';

const phone = { width: 844, height: 390, mobile: true };
// a fresh play run, its first prompt up
const run = `${wait} ${key} ${tab('practice')} key('Escape'); await wait(300);
  document.querySelector('[data-task=play]').click(); key('Enter'); await wait(500); key('Enter'); await wait(1600);`;
// the main menu's Length submenu: from a fresh page (the main menu), row 3 (key 3)
const lengths = `${wait} ${key} location.reload(); await wait(3500);`;
const pick3 = `${wait} ${key} key('3'); await wait(600);`;

export default [
  { name: '0-ready', shot: false, js: ready },
  { name: '1-run-labels', js: run },
  runGif('2-run-answer'),
  { name: '3a-reload', shot: false, js: lengths },
  { name: '3-length-menu', js: pick3 },
  { name: 'm1-phone-run-labels', ...phone, js: run },
  runGif('m2-phone-run-answer', phone),
];
