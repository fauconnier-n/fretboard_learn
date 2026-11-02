// A tour of the main screens for tools/browser-check.mjs: node tools/browser-check.mjs tools/tour.mjs --out <dir>
// In-page snippets for the js of steps, shared with the other step files.
export const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
export const until = `${wait} const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await wait(100); };`;
// the app is open and the board drawn
export const ready = `${until} await until(() => window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length); await wait(800);`;
export const welcome = `${until} await until(() => !document.getElementById('welcome').classList.contains('hidden')); await wait(300);`;
// Settings → Data (needs `wait`, e.g. from `ready`)
export const dataPage = `document.querySelector('.tabs button[data-tab=settings]').click(); await wait(300); document.querySelector('[data-open=data]').click(); await wait(800);`;
// top tabs; practice and intervals also pick the page inside Practice (the Practice tab alone reopens the last one)
export const tab = (name) => `document.querySelector('.tabs button[data-tab=${name === 'intervals' || name === 'chords' ? 'practice' : name}]').click(); document.querySelector('#practiceNav button[data-tab=${name}]')?.click(); await new Promise((r) => setTimeout(r, 700));`;
// a settings page (home, audio, instrument, custom, board, practice, data, tables)
const spage = (name) => `document.querySelector('[data-open=${name}]').click(); await new Promise((r) => setTimeout(r, 500));`;
export const key = 'const key = (k, shift) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true }));';
// answers a play prompt from the zone's own note (keyboard fallback)
export const answer = `const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nat = [0, 2, 4, 5, 7, 9, 11];
const play = (n) => { const pc = PC[n]; const i = nat.indexOf(pc); if (i >= 0) key('CDEFGAB'[i]); else key('CDEFGAB'[nat.indexOf(pc - 1)], true); };`;

// A run, recorded as a GIF: a note is asked, about a second later it is answered (the right
// note, or a wrong one first when wrong), then the confirmation shows. Shared with other step
// files: every set of screenshots includes one (CLAUDE.md).
export const runGif = (name, { width = 1200, height = 900, mobile = false, wrong = false } = {}) => ({
  name, width, height, mobile, gif: { clip: '#view-practice', ms: 3200, scale: mobile ? 0.8 : 0.6 },
  js: `${wait} ${key} ${answer} ${tab('practice')} key('Escape'); await wait(300);
    document.querySelector('[data-task=play]').click(); key('Enter'); await wait(500); key('Enter'); await wait(450); // after the header and zoom settle
    const n = document.getElementById('promptNote').textContent;
    setTimeout(() => { ${wrong ? "key(n[0] === 'C' ? 'D' : 'C'); setTimeout(() => play(n), 900);" : 'play(n);'} }, 1000);`,
});

export default [
  { name: '1-practice-idle', js: `${tab('practice')} document.querySelector('[data-task=play]').click(); document.querySelector('[data-mode=count]').click();` },
  { name: '2-practice-preview', js: `${wait} ${key} key('Enter'); await wait(600);` },
  { name: '3-practice-prompt', js: `${wait} ${key} ${answer} key('Enter'); await wait(500); for (let i = 0; i < 3; i++) { play(document.getElementById('promptNote').textContent); await wait(1300); } key('C'); await wait(400);` },
  { name: '4-practice-summary', full: true, js: `${wait} ${key} ${answer} for (let i = 0; i < 40 && document.getElementById('startBtn').textContent.includes('Stop'); i++) { const t = document.getElementById('promptNote').textContent; if (/Again|Play it/.test(document.getElementById('promptSub').textContent)) play(t); await wait(1300); } await wait(800);` },
  { name: '5-true-or-false', js: `${wait} ${key} document.querySelector('[data-task=truefalse]').click(); key('Enter'); await wait(500); key('Enter'); await wait(800);` },
  { name: '6-intervals', js: `${wait} ${key} key('Escape'); await wait(300); document.querySelector('[data-task=play]').click(); ${tab('intervals')} key('Enter'); await wait(800);` },
  { name: '6b-practice-tab-returns', shot: false, js: `${wait} ${key} key('Escape'); await wait(300); ${tab('tuner')} document.querySelector('.tabs button[data-tab=practice]').click(); await wait(500); return document.querySelector('#practiceNav .active').textContent;` },
  { name: '7-tuner', js: `${wait} ${key} key('Escape'); await wait(300); ${tab('tuner')}` },
  { name: '8-stats', full: true, js: `${tab('stats')}` },
  { name: '9-settings-home', js: `${tab('settings')} ${spage('home')}` },
  { name: '9b-settings-instrument', full: true, js: `${spage('instrument')} document.querySelector('#tuneMode [data-mode=drop]').click(); await new Promise((r) => setTimeout(r, 900)); const sl = document.getElementById('tuneShift'); sl.value = -2; sl.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 900)); return document.getElementById('tuningNotes').textContent;` },
  { name: '9c-settings-custom', full: true, js: `${spage('custom')} return document.getElementById('customTuning').value;` },
  { name: '9d-settings-audio', full: true, js: `${spage('instrument')} document.querySelector('#tuneMode [data-mode=standard]').click(); await new Promise((r) => setTimeout(r, 900)); const sl = document.getElementById('tuneShift'); sl.value = 0; sl.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 900)); ${spage('home')} ${spage('audio')} return document.getElementById('sumInstrument').textContent;` },
  // phones held sideways (landscape), the usual way to see the whole neck
  runGif('run-answer'),
  runGif('m0-phone-run-answer', { width: 844, height: 390, mobile: true }),
  { name: 'm1-phone-idle', width: 844, height: 390, mobile: true, js: `${wait} ${key} key('Escape'); await wait(300); ${tab('practice')}` },
  { name: 'm2-phone-preview', width: 844, height: 390, mobile: true, full: true, js: `${wait} ${key} key('Enter'); await wait(600);` },
  // a right answer: the string vibrates from the fret to the bridge (caught mid-wave)
  { name: 'm3-phone-run-vibrating', width: 844, height: 390, mobile: true, full: true, js: `${wait} ${key} ${answer} key('Enter'); await wait(500); play(document.getElementById('promptNote').textContent);` },
  { name: 'm4-phone-summary', width: 844, height: 390, mobile: true, full: true, js: `${wait} ${key} ${answer} for (let i = 0; i < 40 && document.getElementById('startBtn').textContent.includes('Stop'); i++) { const t = document.getElementById('promptNote').textContent; if (/Again|Play it/.test(document.getElementById('promptSub').textContent)) play(t); await wait(1300); } await wait(800);` },
  { name: 'm5-phone-intervals', width: 844, height: 390, mobile: true, full: true, js: `${tab('practice')} ${tab('intervals')}` },
  { name: 'm8-phone-settings-home', width: 844, height: 390, mobile: true, full: true, js: `${tab('settings')} ${spage('home')}` },
  { name: 'm9-phone-settings-instrument', width: 844, height: 390, mobile: true, full: true, js: `${spage('instrument')}` },
  { name: 'm6-phone-stats', width: 844, height: 390, mobile: true, full: true, js: `${tab('stats')}` },
  { name: 'm7-phone-portrait', width: 390, height: 844, mobile: true, js: `${tab('practice')}` },
];
