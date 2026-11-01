// Profiles, the welcome screen and the Data page, for tools/browser-check.mjs. Run from an
// empty browser profile without the usual seeding, so the welcome shows:
//   node tools/browser-check.mjs tools/profiles.mjs --fresh --no-seed --out screenshots/profiles
// Against a hosted-like origin (serve.ps1 -Port 8140 -NoApi), add --host fretboard.test --secure
// --origin http://fretboard.test:8140 (and without --secure for a browser that cannot save to a folder).
// A step that reloads the page ends there (the call dies with the page); the next step waits.
import { runGif } from './tour.mjs';

const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
const until = `${wait} const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await wait(100); };`;
const ready = `${until} await until(() => window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length); await wait(800);`;
const welcome = `${until} await until(() => !document.getElementById('welcome').classList.contains('hidden')); await wait(300);`;
const key = 'const key = (k, shift) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true }));';
const answer = `const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nat = [0, 2, 4, 5, 7, 9, 11];
const play = (n) => { const pc = PC[n]; const i = nat.indexOf(pc); if (i >= 0) key('CDEFGAB'[i]); else key('CDEFGAB'[nat.indexOf(pc - 1)], true); };`;
const dataPage = `document.querySelector('.tabs button[data-tab=settings]').click(); await wait(300); document.querySelector('[data-open=data]').click(); await wait(800);`;
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
  { name: 'p6-demo-run', shot: false, js: `document.querySelector('[data-pick=demo]').click(); ${ready} ${key} ${answer} document.querySelector('[data-task=play]').click(); key('Enter'); await wait(500); key('Enter'); await wait(400); for (let i = 0; i < 4; i++) { play(document.getElementById('promptNote').textContent); await wait(1300); } key('Escape'); await wait(2500); return (await ft.sql('select count(*)::INT n from attempts'))[0].n;` },
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
