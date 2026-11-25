// Stats and run changes (asked bar, next notes sized from the asked note, fret numbers kept in view):
// node tools/browser-check.mjs tools/stats-spread.mjs --out screenshots/<name>
import { wait, key, answer, ready, tab, runGif } from './tour.mjs';

const spage = (name) => `document.querySelector('[data-open=${name}]').click(); await wait(500);`;
// next notes on, then a play run with its first prompt up
const queueOn = `${tab('settings')} ${spage('practice')} const q = document.querySelector('[data-setting=showQueue]'); if (!q.checked) q.click(); await wait(300);`;
const run = `${wait} ${key} ${queueOn} ${tab('practice')} key('Escape'); await wait(300);
  document.querySelector('[data-task=play]').click(); key('Enter'); await wait(500); key('Enter'); await wait(1600);`;
// play a few prompts so the zoom and the queue settle
const some = `${answer} for (let i = 0; i < 3; i++) { play(document.getElementById('promptNote').textContent); await wait(1500); }`;
const phone = { width: 844, height: 390, mobile: true };

export default [
  { name: '0-ready', shot: false, js: ready },
  { name: '1-run-next-notes', js: `${run} ${some}` },
  runGif('2-run-answer'),
  { name: '3-stats', full: true, js: `${wait} ${key} key('Escape'); await wait(300); ${tab('stats')}` },
  { name: '4-stats-popup', js: `${wait} ${tab('stats')} const r = [...document.querySelectorAll('#heatBoard .fb-hit')].find((x) => x.dataset || true); const cells = document.querySelectorAll('#heatBoard .fb-bars-bg'); if (cells[0]) cells[0].dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); const hit = [...document.querySelectorAll('#heatBoard .fb-hit')].find((h) => { const b = h.getBoundingClientRect(), c = cells[0]?.getBoundingClientRect(); return c && Math.abs(b.x + b.width / 2 - (c.x + c.width / 2)) < 20 && Math.abs(b.y + b.height / 2 - (c.y + c.height / 2)) < 15; }); hit?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait(500);` },
  { name: 'm1-phone-run-next-notes', ...phone, js: `${run} ${some}` },
  runGif('m2-phone-run-answer', phone),
  { name: 'm3-phone-stats', ...phone, full: true, js: `${wait} ${key} key('Escape'); await wait(300); ${tab('stats')}` },
];
