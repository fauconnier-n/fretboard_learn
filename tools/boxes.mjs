// Boxes over 2 strings and over 5–6 strings in the Ready menu: asks for new zones until one is
// offered, then picks it. On a new browser-only profile holding the mock learner's day 24
// (node tools/seed-growth.mjs screenshots/growth-data first), whose strings are evenly known:
//   node tools/browser-check.mjs tools/boxes.mjs --fresh --no-seed --out screenshots/boxes
import { key, ready, runGif, tab, until, wait } from './tour.mjs';

// strings in a zone label "Strings E · A — frets 0–6"
const find = (test) => `${wait} ${key} ${tab('practice')} key('Escape'); await wait(300);
  const n = (t) => (t.split('—')[0].match(/·/g) || []).length + 1;
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#guitarMenu .gm-row') && !document.querySelector('#guitarMenu .gm-opt')?.textContent.startsWith('Start')) key('Enter');
    await wait(500);
    const row = [...document.querySelectorAll('#guitarMenu .gm-row[data-opt]')].find((r) => /^Strings /.test(r.textContent.trim().slice(1)) && (${test})(n(r.querySelector('.gm-opt').textContent)));
    if (row) { row.click(); await wait(700); return document.getElementById('zoneLabel').textContent; }
    [...document.querySelectorAll('#guitarMenu .gm-row[data-opt]')].at(-1).click(); await wait(400);
  }
  return 'not offered';`;
const phone = { width: 844, height: 390, mobile: true, full: true };

export default [
  { name: 'a0', shot: false, js: `${until} await until(() => !document.getElementById('welcome').classList.contains('hidden')); document.getElementById('newProfileBtn').click(); await wait(200);
    const f = document.getElementById('newProfile'); f.profileName.value = 'demo'; f.store.value = 'browser'; f.requestSubmit();` },
  { name: 'a1', shot: false, js: `${ready} const st = await import('/js/storage.js'); await st.importAll(await (await fetch('/screenshots/growth-data/day24.json')).json()); location.reload();` },
  { name: 'a2', shot: false, js: ready },
  { name: 'b1-two-strings', js: find('(k) => k === 2') },
  { name: 'b2-five-or-six-strings', js: find('(k) => k >= 5') },
  { name: 'm1-phone-two-strings', ...phone, js: find('(k) => k === 2') },
  { name: 'm2-phone-five-or-six', ...phone, js: find('(k) => k >= 5') },
  runGif('run-answer'),
  runGif('m3-phone-run-answer', { width: 844, height: 390, mobile: true }),
];
