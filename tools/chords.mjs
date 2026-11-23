// A tour of the Chord page for tools/browser-check.mjs: node tools/browser-check.mjs tools/chords.mjs --out screenshots/chords
// Prompts are answered through ft.chords.simulate (what a played note does); ft.chords.forceKey /
// forceLevel pick the next grip and its label level for the shots of the fading labels.
import { key, ready, runGif, tab, wait } from './tour.mjs';

const P = { width: 844, height: 390, mobile: true }; // a phone held sideways
const ch = 'const c = window.ft.chords;';
// stop any run, pick the run type, optionally the next grip and level, start
const fresh = (task, k = null, level = null, pre = '') => `${wait} ${key} ${ch} key('Escape'); await wait(300); c.setTask('${task}'); ${pre} c.reset(); await wait(200);
  c.forceKey = ${JSON.stringify(k)}; c.forceLevel = ${JSON.stringify(level)}; key('Enter'); await wait(900); c.forceLevel = null;`;
// play every string of the current grip, one note every `ms` (not awaited: a GIF records it)
const strum = (ms) => `(async () => { for (const x of [...c.cur.grip.cells]) { c.simulate(x.midi); await new Promise((r) => setTimeout(r, ${ms})); } })();`;
const toTuning = (mode) => `document.querySelector('.tabs button[data-tab=settings]').click(); await wait(300); document.querySelector('[data-open=instrument]').click(); await wait(500);
  document.querySelector('#tuneMode [data-mode=${mode}]').click(); await wait(900);`;
// a whole Play run, every grip played right (a miss on the 3rd prompt)
const wholeRun = `${wait} ${key} ${ch} key('Escape'); await wait(300); if (c.s.beat) c.toggleBeat(); c.setTask('play'); c.reset(); key('Enter');
  for (let i = 0; i < 200 && c.running; i++) {
    await wait(150);
    if (c.state !== 'await') continue;
    if (c.run.n === 3 && !c.cur.wrong.length && !c.cur.graded) { c.simulate(c.cur.grip.bass - 1); continue; }
    for (const x of [...c.cur.left]) c.simulate(x);
  }
  await wait(600);`;

export default [
  { name: 'c1-chords-idle', full: true, js: `${ready} ${tab('chords')} ${ch} c.setTask('play'); c.reset(); await wait(300);` },
  { name: 'c2-play-prompt', js: fresh('play') },
  { name: 'c3-play-run', gif: { clip: '#view-chords', ms: 4500 }, js: `${fresh('play')} await wait(300); ${strum(450)}` },
  { name: 'c4-play-miss', js: `${fresh('play')} c.simulate(c.cur.grip.bass - 1); await wait(700);` },
  { name: 'c5-name-level0', js: fresh('name', 'G7:open', 0) },
  { name: 'c5-name-level2', js: fresh('name', 'G7:open', 2) },
  { name: 'c5-name-level4', js: fresh('name', 'G7:open', 4) },
  { name: 'c5b-inversion', js: `${fresh('play')} const m = await import('./js/chords.js'); const k = m.ITEMS.find((it) => it.shapeId === 'tri-GBe-maj-1' && it.base > 3).key; key('Escape'); await wait(300); c.forceKey = k; c.forceLevel = 0; key('Enter'); await wait(900); c.forceLevel = null; return k;` },
  { name: 'c6-name-wrong', js: `${fresh('name', 'C:open', 4)} key('D'); await wait(200); document.querySelector('#chQuality [data-q=maj]').click(); await wait(600);` },
  { name: 'c7-changes-beat', js: `${fresh('change', null, null, 'if (!c.s.beat) c.toggleBeat();')} await wait(500); for (const x of [...c.cur.grip.cells]) c.simulate(x.midi); await wait(300); return c.run.prog.labels;` },
  { name: 'c8-summary', full: true, js: wholeRun },
  { name: 'c9-grip-preview', full: true, js: `${wait} const chip = [...document.querySelectorAll('#chItems .ch-chip')].find((x) => !x.classList.contains('ch-locked') && x.dataset.key !== 'E:open') || document.querySelector('#chItems .ch-chip'); chip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await wait(700); return chip.dataset.key;` },
  { name: 'c10-drop-tuning', js: `${wait} ${key} key('Escape'); ${toTuning('drop')} ${tab('chords')}` },
  // phones held sideways
  { name: 'mc1-phone-idle', ...P, full: true, js: `${wait} ${toTuning('standard')} ${tab('chords')} window.ft.chords.setTask('play'); window.ft.chords.reset();` },
  { name: 'mc2-phone-play-prompt', ...P, js: fresh('play') },
  { name: 'mc3-phone-play-run', ...P, gif: { clip: '#view-chords', ms: 4500, scale: 0.8 }, js: `${fresh('play')} await wait(300); ${strum(450)}` },
  { name: 'mc4-phone-name', ...P, js: fresh('name', 'Am:open', 0) },
  { name: 'mc5-phone-changes', ...P, js: `${fresh('change', null, null, 'if (!c.s.beat) c.toggleBeat();')} await wait(500); for (const x of [...c.cur.grip.cells]) c.simulate(x.midi); await wait(300);` },
  { name: 'mc6-phone-summary', ...P, full: true, js: wholeRun },
  // the note run every set of screenshots includes (CLAUDE.md)
  runGif('run-answer'),
  runGif('m0-phone-run-answer', { width: 844, height: 390, mobile: true }),
];
