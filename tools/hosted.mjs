// The app on a plain static host (no local server), as on GitHub Pages, for tools/browser-check.mjs.
// Serve it with the plain static server and let the browser take a made-up host name for this machine:
//   node tools/static.mjs --port 8150
//   node tools/browser-check.mjs tools/hosted.mjs --fresh --no-seed --origin http://fretboard.test:8150 --host fretboard.test --secure --out screenshots/hosted
// Without --secure the origin is not a secure context, like a browser without the folder feature.
import { runGif } from './tour.mjs';

const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
const until = `${wait} const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await wait(100); };`;
const ready = `${until} await until(() => window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length); await wait(800);`;
const dataPage = `document.querySelector('.tabs button[data-tab=settings]').click(); await wait(300); document.querySelector('[data-open=data]').click(); await wait(800);`;

export default [
  { name: 'h1-welcome', js: `${until} await until(() => !document.getElementById('welcome').classList.contains('hidden')); await wait(300);` },
  { name: 'h2-new-profile-form', js: `${wait} document.getElementById('newProfileBtn').click(); await wait(200); const i = document.getElementById('profileName'); i.value = 'test'; i.dispatchEvent(new Event('input')); await wait(200); return [...document.querySelectorAll('#newProfile label.check')].filter((l) => !l.classList.contains('hidden')).map((l) => l.textContent.trim().split(' —')[0]);` },
  { name: 'h3-data-page', full: true, js: `document.getElementById('newProfile').store.value = 'browser'; document.getElementById('newProfile').requestSubmit(); ${ready} document.getElementById('firstRunDone').click(); ${dataPage} return document.getElementById('dbBadge').textContent + ' | ' + document.getElementById('folderInfo').textContent;` },
  { name: 'h4-phone-data-page', width: 844, height: 390, mobile: true, full: true, js: `${wait} await wait(300);` },
  runGif('run-answer'),
  runGif('m0-phone-run-answer', { width: 844, height: 390, mobile: true }),
];
