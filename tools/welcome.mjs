// The first start for a beginner: the welcome intro, the new profile, the instrument step and
// the first-run suggestion. From an empty browser profile:
//   node tools/browser-check.mjs tools/welcome.mjs --fresh --no-seed --out screenshots/welcome
import { ready, runGif, wait, welcome } from './tour.mjs';

const phone = { width: 844, height: 390, mobile: true, full: true };

export default [
  { name: 'w1-welcome', full: true, js: welcome },
  { name: 'm1-phone-welcome', ...phone, js: welcome },
  { name: 'w2-new-profile', full: true, js: `${wait} document.getElementById('newProfileBtn').click(); await wait(200); const i = document.getElementById('profileName'); i.value = 'test'; i.dispatchEvent(new Event('input')); await wait(200);` },
  { name: 'w3-instrument-step', js: `document.getElementById('newProfile').requestSubmit(); ${ready}` },
  { name: 'w4-audio-step', js: `${wait} document.getElementById('firstRunDone').click(); await wait(600);` },
  { name: 'm2a-phone-audio-step', ...phone, js: `${wait} await wait(300);` },
  { name: 'w5-first-run-tip', js: `${wait} document.getElementById('audioFirstDone').click(); await wait(600);` },
  { name: 'm2-phone-first-run-tip', ...phone, js: `${wait} await wait(300);` },
  { name: 'w6-first-run-ready', js: `${wait} document.getElementById('firstRunGo').click(); await wait(800);` },
  runGif('run-answer'),
  runGif('m3-phone-run-answer', { width: 844, height: 390, mobile: true }),
];
