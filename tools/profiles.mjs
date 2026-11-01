// Profiles, the welcome screen and the Data page, for tools/browser-check.mjs. Run from an
// empty browser profile without the usual seeding, so the welcome shows:
//   node tools/browser-check.mjs tools/profiles.mjs --fresh --no-seed --out screenshots/profiles
// Against a hosted-like origin (node serve.mjs --port 8150 --no-open), add --host fretboard.test --secure
// --origin http://fretboard.test:8150 (and without --secure for a browser that cannot save to a folder).
// A step that reloads the page ends there (the call dies with the page); the next step waits.
import { answer, dataPage, key, ready, runGif, until, wait, welcome } from './tour.mjs';

const phone = { width: 844, height: 390, mobile: true, full: true };

export default [
  { name: 'p1-welcome', js: welcome },
  { name: 'p2-new-profile-form', js: `${wait} document.getElementById('newProfileBtn').click(); await wait(200); const i = document.getElementById('profileName'); i.value = 'test'; i.dispatchEvent(new Event('input')); await wait(200); return document.getElementById('profileFolder').textContent;` },
  // the default place on localhost is the data folder next to the app (the test profile's, which has answers)
  { name: 'p3-created-instrument-step', full: true, js: `document.getElementById('newProfile').requestSubmit(); ${ready} return document.getElementById('firstRunNote').textContent;` },
  { name: 'p4-start-practising', js: `${wait} document.getElementById('firstRunDone').click(); await wait(600);` },
  // a second profile: the picker shows on the next start
  { name: 'p5a', shot: false, js: `const p = JSON.parse(localStorage.getItem('ft:profiles')); p.demo = { store: 'browser', lastUsed: Date.now() - 86400000, instrument: 'bass4', tuning: 'standard' }; localStorage.setItem('ft:profiles', JSON.stringify(p)); sessionStorage.removeItem('ft:picked'); location.reload();` },
  { name: 'p5-picker', js: `${until} await until(() => document.getElementById('profileList')?.children.length); await wait(300);` },
  { name: 'p6-demo-run', shot: false, js: `document.querySelector('[data-pick=demo]').click(); ${ready} ${key} ${answer} document.querySelector('[data-task=play]').click(); key('Enter'); await wait(500); key('Enter'); await wait(400); for (let i = 0; i < 4; i++) { play(document.getElementById('promptNote').textContent); await wait(1300); } key('Escape'); await wait(2500); return ft.rows('attempts').length;` },
  { name: 'p7a', shot: false, js: `localStorage.setItem('ft:activeUser', JSON.stringify('test')); location.reload();` },
  { name: 'p7-data-page', full: true, js: `${ready} ${dataPage}` },
  { name: 'p8-brought-from-demo', full: true, js: `${wait} document.getElementById('bringFrom').value = 'demo'; document.getElementById('bringBtn').click(); await wait(3000); return document.getElementById('dataOut').textContent + ' | ' + document.getElementById('originList').textContent;` },
  { name: 'p9-brought-removed', full: true, js: `${until} window.confirm = () => true; document.querySelector('[data-origin]').click(); await until(() => !document.getElementById('originList').textContent); await wait(500); return document.getElementById('originList').textContent || '(nothing brought in)';` },
  { name: 'p10-tables-origin-column', full: true, js: `${wait} document.querySelector('[data-open=home]').click(); await wait(200); document.querySelector('[data-open=tables]').click(); await wait(800); const t = document.getElementById('tableData'); t.parentElement.scrollLeft = 1e6; await wait(200);` },
  runGif('run-answer'),
  runGif('m0-phone-run-answer', { width: 844, height: 390, mobile: true }),
  { name: 'm1a', shot: false, ...phone, js: `sessionStorage.removeItem('ft:picked'); location.reload();` },
  { name: 'm1-phone-picker', ...phone, js: `${until} await until(() => document.getElementById('profileList')?.children.length); await wait(300);` },
  { name: 'm2-phone-new-profile', ...phone, js: `${wait} document.getElementById('newProfileBtn').click(); await wait(300);` },
  { name: 'm3-phone-data-page', ...phone, js: `document.getElementById('cancelProfileBtn').click(); document.querySelector('[data-pick=test]').click(); ${ready} ${dataPage}` },
];
