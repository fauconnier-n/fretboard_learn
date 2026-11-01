import { midiLabel, midiToFreq } from './music.js';
import { INSTRUMENTS, LEGACY, mapAttempt, parseTuning, resolveTuning, shiftText, stringKeys, tunedStrings, tuningText } from './instruments.js';
import { generateZones, selfTest } from './zones.js';
import * as storage from './storage.js';
import { VERSION } from './version.js';
import * as backup from './backup.js';
import { AudioInput } from './audio.js';
import { createDetector, NoteTracker } from './pitch.js';
import { DOUBLE_MS, StrumDetector } from './strum.js';
import { Scheduler, newModel } from './srs.js';
import { Fretboard, closeTips } from './fretboard.js';
import { Quiz } from './quiz.js';
import { IntervalsView } from './intervalsView.js';
import { Tuner } from './tuner.js';
import { renderStats } from './stats.js';
import { renderProgress } from './progress.js';
import { fitDecay, renderCheck, renderCueReliance } from './modelcheck.js';
import { firstRightPerDay, logStrings, perDay, practisedDays, predictionRows, rate, taskOf } from './logQueries.js';

// timing marks for tools/perf.mjs (performance.getEntriesByType('mark'|'measure') in the console)
performance.mark('app:modules');

const DEFAULTS = {
  deviceId: '',
  channel: 0,
  gain: 1,
  gate: 0.01,
  clarity: 0.9,
  a4: 440,
  latencyMs: 80,
  instrument: 'guitar6',
  tuning: 'standard', // 'standard', 'drop' or 'custom'
  tuningShift: 0, // standard and drop: every string moved by this many semitones
  customTuning: '', // custom tuning, lowest string first, e.g. "D2 A2 D3 G3 B3 E4"
  frets: 15,
  leftHanded: false,
  lowAtBottom: false, // low E on top by default (like Rocksmith); true draws it at the bottom (like tab)
  zoneTypes: 'both',
  runMode: 'count',
  runCount: 20,
  sprintSec: 120,
  timeoutSec: 10,
  retry: true,
  showQueue: false,
  beat: false,
  strumLevel: 4, // muted strum: a burst this many times above the noise gate
  cueMode: 'fade',
  nameAccidentals: 'sharps',
  runTask: 'play',
  plan: '',
  sound: true,
};
const BOARD_KEYS = ['instrument', 'frets', 'leftHanded', 'lowAtBottom', 'zoneTypes'];
const FRAME = 3072;
const POLL_MS = 25;

const $ = (id) => document.getElementById(id);

const app = {
  levelTick: 0,
  settings: null,
  settingsAt: 0, // savedAt of the settings in use
  model: null,
  modelKey: null,
  scheduler: null,
  zones: [],
  strings: INSTRUMENTS.guitar6.strings,
  keys: INSTRUMENTS.guitar6.strings,
  practicePage: 'practice', // the Practice tab reopens the last kind of quiz
  view: 'practice',
  audio: new AudioInput(),
  tracker: new NoteTracker(),
  strum: new StrumDetector(),
  lastStrum: { t: -Infinity, running: false, n: 0 },
  detect: createDetector(4096),
  loop: 0,
};

// What is stored of a model: its version and `meta` (the difficulty target, run history, best
// runs, fitted decay). Everything else (cards, notes, ctx, conf) is replayed from the answer log
// at every load (applyBoardSettings marks the model stale), so storing it only cost time: the
// full model is 100 KB to 1 MB of JSON, written to the browser and the disk.
const persistedModel = (m) => ({ version: m.version, meta: m.meta });
const saveModelNow = () => storage.set(app.modelKey, persistedModel(app.model));

let saveQueued = false;
function saveModel() {
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    const t = performance.now();
    saveModelNow().then(() => performance.measure('answer:save', { start: t }));
  });
}

// The audio setup belongs to the computer (its interface, levels, latency), not to the profile:
// it is kept in this browser only (storage.lastSettings) and left out of the profile's data,
// which carries the time it was saved so the newer copy wins between computers.
const AUDIO_KEYS = ['deviceId', 'channel', 'gain', 'gate', 'clarity', 'latencyMs', 'strumLevel'];
const audioPart = (s, audio) => Object.fromEntries(Object.entries(s).filter(([k]) => AUDIO_KEYS.includes(k) === audio));

function saveSettings() {
  // settings saved later came in from the disk meanwhile (a folder connected, a sync retried in
  // the background): they win, so show them rather than write these over them
  if ((storage.get('settings')?.savedAt || 0) > app.settingsAt) return location.reload();
  app.settingsAt = Date.now();
  storage.set('settings', { ...audioPart(app.settings, false), savedAt: app.settingsAt });
  storage.rememberSettings(app.settings);
}

// kind: 'good' | 'bad' | 'golden' | 'tick' (the beat-mode metronome, which plays even with sound effects off)
function sound(kind) {
  if (!app.settings.sound && kind !== 'tick') return;
  const ctx = (app.sfx ||= app.audio.ctx || new AudioContext());
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = { good: 1320, golden: 1760, tick: 2400 }[kind] ?? 150;
  o.connect(g);
  g.connect(ctx.destination);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  const len = kind === 'tick' ? 0.03 : kind === 'golden' ? 0.35 : 0.14;
  g.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.06 : 0.12, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.start(t);
  o.stop(t + len + 0.02);
}

// ---------- board / model ----------

// Every answer of the log replayed on this instrument: answers on a string with the same key
// (instruments.js) count, others are left out. The Intervals tab has its own stats.
const tuningAttempts = () =>
  storage.allAttempts().filter((a) => a.task !== 'interval')
    .map((a) => mapAttempt(a, app.keys)).filter(Boolean)
    .sort((a, b) => a.t - b.t);

// an answer or run given on the open strings in use (rows from before instruments too)
const sameStrings = (a) => logStrings(a, LEGACY) === app.strings.join(',');

// The tuning controls: Standard/Drop switch, a semitone slider, the notes they give, and the
// custom tuning page. A custom tuning written for another string count is dropped.
function fillTunings(preview = null) {
  const s = app.settings;
  if (!INSTRUMENTS[s.instrument]) s.instrument = 'guitar6';
  const inst = INSTRUMENTS[s.instrument];
  if (s.tuning === 'custom' && !('strings' in parseTuning(s.customTuning, inst.strings.length))) s.tuning = 'standard';
  if (!['standard', 'drop', 'custom'].includes(s.tuning)) s.tuning = 'standard';
  const custom = s.tuning === 'custom';
  const shift = preview ?? s.tuningShift;
  if (!$('instrumentSelect').options.length) {
    $('instrumentSelect').innerHTML = Object.entries(INSTRUMENTS).map(([id, i]) => `<option value="${id}">${i.name}</option>`).join('');
  }
  $('instrumentSelect').value = s.instrument;
  document.querySelectorAll('#tuneMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.tuning));
  Object.assign($('tuneShift'), { value: shift, disabled: custom });
  $('tuneShiftOut').textContent = shiftText(shift) || 'none';
  const r = resolveTuning({ ...s, tuningShift: shift });
  const notes = tuningText(r.strings, r.flats);
  $('tuningNotes').textContent = custom ? `Custom tuning in use: ${notes}. Choose Standard or Drop to leave it.` : `Open strings: ${notes}`;
  $('customBtn').textContent = custom ? 'Custom tuning (in use) ›' : 'Custom tuning ›';
  $('sumInstrument').textContent = `${inst.name} · ${custom ? 'custom' : s.tuning === 'drop' ? 'drop' : 'standard'}${!custom && s.tuningShift ? ', ' + shiftText(s.tuningShift) : ''} (${notes})`;
}

// Settings: a home page of cards, one page per topic, custom tuning under instrument & tuning.
function openSettings(page = 'home') {
  app.settingsPage = page;
  document.querySelectorAll('[data-spage]').forEach((p) => p.classList.toggle('hidden', p.dataset.spage !== page));
  if (page === 'custom') {
    const r = resolveTuning(app.settings);
    $('customTuning').value = app.settings.tuning === 'custom' ? app.settings.customTuning : tuningText(r.strings, r.flats);
    $('tuningError').textContent = '';
  }
  if (page === 'data') {
    renderBackups();
    renderDataPage();
  }
  if (page === 'tables') renderTable();
  window.scrollTo(0, 0);
}

async function setTuning(changes) {
  Object.assign(app.settings, changes);
  saveSettings();
  fillTunings();
  await applyBoardSettings();
}

// the pitch range the detector looks at: the open strings minus 3 semitones up to the last fret plus 3
function setDetectRange() {
  const s = app.settings;
  app.minF = midiToFreq(Math.min(...app.strings) - 3, s.a4);
  app.maxF = midiToFreq(Math.max(...app.strings) + s.frets + 3, s.a4);
}

async function applyBoardSettings() {
  const s = app.settings;
  const tuning = resolveTuning(s);
  app.strings = tuning.strings;
  app.keys = stringKeys(s.instrument, tuning.strings);
  // prompts mix sharps and flats; this only picks how string names and the tuner are written
  s.flats = tuning.flats;
  s.tuningLabel = tuning.label; // what the answer log records as the tuning
  // one model per set of strings; it is rebuilt from the whole log whenever it is loaded, so
  // answers given meanwhile on another instrument count on the strings they share
  const key = 'model:' + app.keys.join(',');
  if (app.modelKey !== key) {
    const legacy = Object.entries(LEGACY).find(([, [inst, st]]) => stringKeys(inst, st).join(',') === app.keys.join(','));
    // a stored model has only version and meta (older ones everything): the rest is replayed
    app.model = { ...newModel(), ...((await storage.get(key)) || (legacy && (await storage.get('model:' + legacy[0]))) || {}) };
    app.model.stale = true;
    app.modelKey = key;
  }
  app.zones = generateZones(tuning.strings, s.frets, s.zoneTypes);
  app.scheduler = new Scheduler(app.model, tuning.strings, s.frets, app.keys);
  if (app.scheduler.needsRebuild) {
    // replay the answer log, which keeps every answer and its time
    app.scheduler.rebuild(await tuningAttempts());
    await saveModelNow();
  }
  const cfg = { strings: app.strings, frets: s.frets, leftHanded: s.leftHanded, flats: s.flats, lowAtBottom: s.lowAtBottom };
  app.board.configure(cfg);
  app.heat.configure(cfg);
  app.ivBoard.configure(cfg);
  app.intervals.leave();
  app.intervals.reset();
  app.quiz.reset();
  app.tuner.setStrings(app.strings, s.flats);
  // detector range: a tone below the lowest string up to the top fret
  setDetectRange();
  if (app.view === 'stats') showStats();
}

// ---------- audio ----------

async function connectAudio() {
  const s = app.settings;
  const label = $('audioLabel');
  try {
    label.textContent = 'Connecting…';
    await app.audio.start({ deviceId: s.deviceId, channel: s.channel, gain: s.gain });
    await refreshDevices();
    refreshChannels();
    updateAudioLabel();
    $('connectBtn').textContent = 'Reconnect';
    clearInterval(app.loop);
    app.loop = setInterval(processFrame, POLL_MS);
  } catch (e) {
    label.textContent = 'Input error: ' + (e.message || e.name);
    console.error(e);
  }
}

function updateAudioLabel() {
  const a = app.audio;
  $('audioLabel').textContent = a.running ? `${a.label}${a.channels > 1 ? ` · in ${a.channel + 1}` : ''}` : 'No input';
  $('topMeter').classList.toggle('off', !a.running);
}

function processFrame() {
  const buf = app.audio.read();
  if (!buf) return;
  const frame = buf.subarray(buf.length - (app.minF < 40 ? Math.min(buf.length, 4096) : FRAME));
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length);
  const s = app.settings;
  const now = performance.now();
  // the detector is the costly part: not run where nothing listens (Stats, a hidden tab)
  const listening = app.view !== 'stats' && !document.hidden;
  const res = listening && rms >= s.gate ? app.detect(frame, app.audio.sampleRate, app.minF, app.maxF) : null;
  if (app.view === 'settings') updateMeter(rms);
  $('topMeterFill').style.width = meterPct(rms) + '%';
  $('topMeterFill').classList.toggle('gated', rms < s.gate);
  if (app.view === 'tuner') app.tuner.onFrame(res, rms, now);
  if (app.strum.feed(now, rms, !!res && res.clarity >= s.clarity, s.gate)) onStrum(now);
  const ev = app.tracker.feed(now, res, rms, s);
  if (ev) app.quiz.onNote(ev);
  if (ev && app.view === 'intervals') app.intervals.onNote(ev);
}

// A muted strum. Strums less than DOUBLE_MS apart in the same state (all in a run, or all
// outside) make a series: n is its length so far. Two go back to the previous menu, three stop
// a run.
function onStrum(now) {
  const running = app.view === 'intervals' ? app.intervals.running : app.quiz.running;
  const last = app.lastStrum;
  const n = last.running === running && now - last.t < DOUBLE_MS ? last.n + 1 : 1;
  app.lastStrum = { t: now, running, n };
  $('strumSeen').textContent = `Muted strum heard${n > 1 ? ` (×${n})` : ''} at ${new Date().toLocaleTimeString()}`;
  if (app.view === 'practice') {
    app.board.strum();
    app.quiz.onStrum(n);
  } else if (app.view === 'intervals') {
    app.ivBoard.strum();
    app.intervals.onStrum(n);
  }
}

// Meter scale: -60 dBFS (empty) to 0 dBFS (full).
const meterPct = (rms) => Math.max(0, Math.min(100, ((rms > 0 ? 20 * Math.log10(rms) : -100) + 60) / 60 * 100));

function updateMeter(rms) {
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  $('meterFill').style.width = meterPct(rms) + '%';
  $('meterFill').classList.toggle('gated', rms < app.settings.gate);
  $('meterDb').textContent = db > -90 ? `${db.toFixed(0)} dB` : '—';
  if (++app.levelTick % 4) return;
  // every input's level, so the channel carrying the guitar is easy to spot
  $('channelLevels').innerHTML = app.audio.levels().map((peak, i) => {
    const pdb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    return `<span class="${i === app.audio.channel ? 'sel' : ''}">Input ${i + 1}
      <span class="meter"><span class="meter-fill${pdb > -60 ? '' : ' gated'}" style="width:${meterPct(peak)}%"></span></span>
      ${pdb > -90 ? pdb.toFixed(0) + ' dB' : 'silent'}</span>`;
  }).join('');
}

function updateGateMarker() {
  $('meterGate').style.left = $('topMeterGate').style.left = meterPct(app.settings.gate) + '%';
}

async function refreshDevices() {
  const sel = $('deviceSelect');
  let inputs = [];
  try {
    inputs = await app.audio.listInputs();
  } catch {}
  sel.innerHTML = '<option value="">System default input</option>' +
    inputs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => `<option value="${d.deviceId}">${d.label || 'Input ' + (i + 1)}</option>`).join('');
  sel.value = app.settings.deviceId;
  if (sel.value !== app.settings.deviceId) sel.value = '';
}

function refreshChannels() {
  const sel = $('channelSelect');
  const n = Math.max(2, app.audio.channels || 1);
  sel.innerHTML = Array.from({ length: n }, (_, i) =>
    `<option value="${i}"${i >= app.audio.channels && app.audio.running ? ' disabled' : ''}>Input ${i + 1}</option>`).join('');
  sel.value = String(app.settings.channel);
}

// ---------- views ----------

function showView(name) {
  app.view = name;
  closeTips();
  const practice = name === 'practice' || name === 'intervals';
  if (practice) app.practicePage = name;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === (practice ? 'practice' : name)));
  document.querySelectorAll('#practiceNav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('practiceNav').classList.toggle('hidden', !practice);
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'stats') showStats();
  if (name === 'settings') {
    renderDbStatus();
    renderBackups();
    renderTable();
  }
  if (name !== 'practice') app.quiz.leave();
  if (name === 'intervals') app.intervals.open();
  else app.intervals.leave();
}

async function showStats() {
  performance.mark('stats:start');
  const weekAgo = new Date().setHours(0, 0, 0, 0) - 6 * 86400000; // today and the 6 days before
  const monthAgo = Date.now() - 30 * 86400000;
  const log = storage.allAttempts();
  const attemptCount = log.length;
  // practice consistency: days with at least one answer in the last 7 (no streak to lose)
  const days = practisedDays(log, weekAgo);
  const month = log.filter((a) => a.t >= monthAgo && sameStrings(a));
  // check-up prompts are random, so their success rate is not pulled towards the target
  const probe = rate(month.filter((a) => a.probe));
  const named = rate(month.filter((a) => a.task === 'name'));
  const pct = (x) => Math.round(x * 100) + '%';
  renderStats({
    extraCards: [
      ['Practised (last 7 days)', `${days} of 7 days`],
      ['Check-up accuracy (30 days)', probe.n ? `${pct(probe.acc)} of ${probe.n}` : '—'],
      ['Name the note (30 days)', named.n ? `${pct(named.acc)} of ${named.n}` : '—'],
    ],
    els: { cards: $('statCards'), notes: $('noteBars'), cells: $('weakCells'), slow: $('slowCells') },
    scheduler: app.scheduler,
    strings: app.strings,
    frets: app.settings.frets,
    flats: app.settings.flats,
    heat: app.heat,
    attemptCount,
  });
  // progress over runs and days, on these strings, note-position quizzes only
  const notInterval = (a) => taskOf(a) !== 'interval' && sameStrings(a);
  const here = log.filter(notInterval);
  renderProgress($('progressCharts'), {
    runs: storage.allRuns().filter((r) => r.prompts > 0 && notInterval(r))
      .map((r) => ({ t: r.started_at, prompts: r.prompts, correct: r.correct, median_ms: r.median_ms })),
    days: perDay(here),
    known: firstRightPerDay(here),
    total: app.strings.length * (app.settings.frets + 1),
  });
  performance.measure('stats:render', 'stats:start');
}

function updateModeUI() {
  const s = app.settings;
  const count = s.runMode === 'count';
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.runMode));
  document.querySelectorAll('#taskSeg button').forEach((b) => b.classList.toggle('active', b.dataset.task === (s.runTask || 'play')));
  $('beatBtn').classList.toggle('active', !!s.beat);
  if (app.quiz && !app.quiz.running) app.quiz.showMenu(app.quiz.menuSub);
  const input = $('runLen');
  Object.assign(input, count ? { min: 1, max: 200, step: 1 } : { min: 10, max: 1200, step: 10 });
  input.value = count ? s.runCount : s.sprintSec;
  $('runLenUnit').textContent = count ? 'prompts' : 'seconds';
  if (app.quiz?.state === 'preview') app.quiz.els.progress.textContent = count ? `${s.runCount} prompts` : `${s.sprintSec} s sprint`;
}

// ---------- settings form ----------

function readInput(input) {
  if (input.type === 'checkbox') return input.checked;
  const t = input.dataset.type;
  if (t === 'int') return parseInt(input.value, 10);
  if (t === 'float') return parseFloat(input.value);
  return input.value;
}

function showOutput(input) {
  const out = input.parentElement.querySelector('output');
  if (!out || input.type !== 'range') return;
  const v = readInput(input);
  out.textContent = input.dataset.setting === 'gate' ? `${(20 * Math.log10(v)).toFixed(0)} dB` : input.dataset.setting === 'gain' ? `×${v}` : v;
}

function bindSettings() {
  document.querySelectorAll('[data-setting]').forEach((input) => {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') input.checked = !!app.settings[key];
    else input.value = app.settings[key];
    showOutput(input);
    input.addEventListener(input.type === 'range' ? 'input' : 'change', async () => {
      let v = readInput(input);
      if (typeof v === 'number' && Number.isNaN(v)) return;
      if (input.tagName === 'INPUT' && input.min !== '' && typeof v === 'number') v =Math.max(+input.min, Math.min(+input.max || Infinity, v));
      app.settings[key] = v;
      showOutput(input);
      saveSettings();
      if (key === 'instrument') fillTunings();
      if (BOARD_KEYS.includes(key)) await applyBoardSettings();
      else if (key === 'a4') setDetectRange(); // the reference pitch changes the detector's range, nothing on the board
      if (key === 'deviceId') connectAudio();
      if (key === 'gate') updateGateMarker();
      if (key === 'channel') { app.audio.setChannel(v); updateAudioLabel(); }
      if (key === 'gain') app.audio.setGain(v);
      if (key === 'strumLevel') app.strum.level = v;
      if (key === 'runCount' || key === 'sprintSec') updateModeUI();
    });
  });
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function runSelfTest() {
  const lines = [];
  for (const [id, t] of Object.entries(INSTRUMENTS).flatMap(([iid, inst]) => ['standard', 'drop'].map((m) => [inst.name + ' ' + m, { strings: tunedStrings(iid, m) }]))) {
    for (const frets of [12, 15, 22, 24]) {
      const r = selfTest(t.strings, frets);
      const ok = !r.bad.length && !r.uncovered.length;
      lines.push(`${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(8)} ${String(frets).padStart(2)} frets: ${r.zones} zones` +
        (r.bad.length ? ` · ${r.bad.length} invalid` : '') + (r.uncovered.length ? ` · uncovered ${r.uncovered.join(' ')}` : ''));
    }
  }
  return lines.join('\n');
}

function bindData() {
  $('exportBtn').onclick = async () => {
    const data = await storage.exportAll();
    download(`fretboard-trainer-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
  };
  $('importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await storage.importAll(JSON.parse(await file.text()));
      location.reload();
    } catch (err) {
      $('dataOut').textContent = 'Import failed: ' + err.message;
    }
  };
  $('rebuildBtn').onclick = async () => {
    const attempts = await tuningAttempts();
    app.scheduler.rebuild(attempts);
    await saveModelNow();
    $('dataOut').textContent = `Rebuilt from ${attempts.length} logged answers.`;
  };
  $('checkModelBtn').onclick = checkModel;
  $('resetBtn').onclick = async () => {
    if (!confirm(`Delete all progress, settings and the answer log of user "${storage.status().user}"? Other users are not affected.`)) return;
    await storage.clearAll();
    location.reload();
  };
  $('selfTestBtn').onclick = () => {
    $('dataOut').textContent = runSelfTest();
  };
  $('backupNowBtn').onclick = () => makeBackup('manual');
  // the profile's folder and other profiles' data; a cancelled picker (AbortError) is not an error
  const act = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      if (e?.name !== 'AbortError') $('dataOut').textContent = e?.message || String(e);
    }
    renderDbStatus();
  };
  // a folder whose settings were saved later brings them in: reload to use them, or the next
  // save would write the settings on screen over them
  const folderAct = (fn) => act(async () => {
    const before = storage.get('settings')?.savedAt;
    await fn();
    if (storage.get('settings')?.savedAt !== before) location.reload();
  });
  $('folderCreateBtn').onclick = folderAct(() => storage.createFolder());
  $('folderChooseBtn').onclick = folderAct(() => storage.connectFolder((other) => confirm(`This folder holds the data of "${other}". Use it for "${storage.status().user}" anyway? The answers of both are merged.`)));
  $('folderReconnectBtn').onclick = folderAct(() => storage.reconnectFolder());
  $('dbBadge').onclick = () => { if (storage.status().disk.needsPermission) $('folderReconnectBtn').click(); };
  $('folderForgetBtn').onclick = folderAct(() => storage.disconnectFolder());
  $('bringBtn').onclick = act(async () => {
    const src = $('bringFrom').value;
    const { name, data } = src === '__folder' ? await storage.folderData() : { name: src, data: await storage.profileData(src) };
    if (name === storage.status().user) throw new Error('That folder holds this profile\'s own data.');
    const r = await storage.bringIn(data, name);
    const old = data.attempts.length - r.attempts;
    $('dataOut').textContent = `${r.attempts} answers and ${r.runs} runs brought from "${name}".` + (old ? ` ${old} answers were already here.` : '') + (data.attempts.length ? '' : ` "${name}" has no answers in this browser or its folder.`);
    if (r.attempts || r.runs) await rebuildAfterLogChange();
  });
  $('originList').onclick = act(async (e) => {
    const b = e?.target?.closest('[data-origin]');
    if (!b || !confirm(`Remove the ${b.previousElementSibling.textContent.trim()}?`)) return;
    await storage.removeOrigin(b.dataset.origin);
    await rebuildAfterLogChange();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-restore]');
    if (btn) restoreBackup(Number(btn.dataset.restore));
  });
  $('dismissRestore').onclick = () => $('restoreBanner').classList.add('hidden');
}

// ---------- backups ----------

const fmtDate = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const REASONS = { run: 'after a run', manual: 'manual', 'before restore': 'before a restore' };

async function makeBackup(reason) {
  if (!storage.status().persistent) return; // a NOT SAVED tab must not back up its empty in-memory data
  const t = performance.now();
  try {
    await saveModelNow();
    await backup.save(storage.status().user, await storage.exportAll(), reason);
    performance.measure('run:backup', { start: t });
    if (app.view === 'settings') await renderBackups();
  } catch (e) {
    console.error('Backup failed', e);
  }
}

async function restoreBackup(id) {
  const b = await backup.get(id);
  if (!b) return;
  const msg = `Replace all data of user "${b.user}" with the backup from ${fmtDate(b.t)} (${b.attempts} answers)?\n` +
    'The current data is backed up first, so this can be undone.';
  if (!confirm(msg)) return;
  await makeBackup('before restore');
  await storage.importAll(b.data);
  location.reload();
}

// ---------- model check ----------

async function checkModel() {
  const out = $('modelCheck');
  out.innerHTML = '<p class="muted small">Checking…</p>';
  const log = storage.allAttempts().filter(sameStrings);
  const rows = predictionRows(log.filter((a) => ['play', 'name'].includes(taskOf(a))));
  const attempts = tuningAttempts();
  const fit = await fitDecay(attempts, app.strings, app.settings.frets, app.model.meta.decay);
  app.scheduler.useDecay(app.model.meta.decay); // the replays changed the curve in use
  const useBtn = fit.best ? `<button class="btn small" id="useDecayBtn">Use decay ${fit.best} and rebuild</button>` : '';
  const resetBtn = app.model.meta.decay ? ' <button class="btn small" id="defaultDecayBtn">Back to the default decay</button>' : '';
  const cueRows = log.filter((a) => taskOf(a) === 'play' && a.cueMode != null && a.predP != null)
    .map((a) => ({ p: a.predP, y: a.correct ? 1 : 0, ms: a.ms, own: !!a.cueTarget, n: a.cueN ?? 0, near: a.cueNearest }));
  out.innerHTML = renderCheck(rows, fit.html + useBtn + resetBtn) + `<h4>Reliance on note names</h4>${renderCueReliance(cueRows)}`;
  const apply = async (d) => {
    app.scheduler.useDecay(d);
    app.scheduler.rebuild(await tuningAttempts());
    await saveModelNow();
    checkModel();
  };
  $('useDecayBtn')?.addEventListener('click', () => apply(fit.best));
  $('defaultDecayBtn')?.addEventListener('click', () => apply(null));
}

// ---------- table viewer ----------

const TABLE_ROWS = 50;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TIME_COLS = new Set(['t', 'started_at', 'ended_at']);
const MIDI_COLS = new Set(['target', 'played', 'prev_target']);

// Raw value plus a readable hint for times and MIDI notes.
function cellText(table, col, v) {
  if (v == null) return '<span class="muted">—</span>';
  if (TIME_COLS.has(col)) return esc(new Date(v).toLocaleString());
  if (table === 'attempts' && MIDI_COLS.has(col)) return `${v} <span class="muted">${midiLabel(v)}</span>`;
  if (col === 'wrong_notes') return `${esc(v)} <span class="muted">${String(v).split(',').map((m) => midiLabel(+m)).join(' ')}</span>`;
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(3);
  return esc(v);
}

async function renderTable(name = app.tableView || 'attempts') {
  app.tableView = name;
  document.querySelectorAll('#tableSeg button').forEach((b) => b.classList.toggle('active', b.dataset.table === name));
  const def = storage.TABLES[name];
  const { total, rows } = await storage.tableRows(name, TABLE_ROWS);
  $('tableInfo').textContent = `${total} row${total === 1 ? '' : 's'}${total > TABLE_ROWS ? ` · newest ${TABLE_ROWS} shown` : ''} · table "${name}"`;
  $('tableAbout').textContent = def.about;
  $('tableData').innerHTML =
    `<thead><tr>${def.cols.map(([c, , doc]) => `<th title="${esc(doc)}">${c}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${def.cols.map(([c]) => `<td>${cellText(name, c, r[c])}</td>`).join('')}</tr>`).join('') ||
      `<tr><td colspan="${def.cols.length}" class="muted">No rows yet.</td></tr>`}</tbody>`;
  $('tableDocs').innerHTML = '<thead><tr><th>Column</th><th>Type</th><th>Meaning</th></tr></thead><tbody>' +
    def.cols.map(([c, type, doc]) => `<tr><td><code>${c}</code></td><td class="muted">${type.split(' ')[0]}</td><td>${esc(doc)}</td></tr>`).join('') +
    '</tbody>';
}

async function renderBackups() {
  const items = await backup.list(storage.status().user);
  $('backupList').innerHTML = items.map((b) => `<li><span>${fmtDate(b.t)} <span class="muted">· ${REASONS[b.reason] || b.reason} · ${b.attempts} answers</span></span>
    <button class="btn small" data-restore="${b.id}">Restore</button></li>`).join('') || '<li class="muted">No backups yet. One is made after every run.</li>';
}

// The profile is empty but a backup has answers: most likely the browser lost its data.
async function checkForLostData(db) {
  const banner = $('restoreBanner');
  const back = db.disk.restored;
  if (back?.attempts) {
    banner.querySelector('span').textContent =
      `${back.attempts} answers and ${back.runs} runs for "${db.user}" were missing in this browser and were copied back from the disk copy (${db.disk.dir}).`;
    banner.querySelector('[data-restore]').classList.add('hidden');
    banner.classList.remove('hidden');
    return;
  }
  if (!db.persistent || (await storage.countAttempts()) > 0) return;
  const latest = (await backup.list(db.user)).find((b) => b.attempts > 0);
  if (!latest) return;
  banner.querySelector('span').textContent =
    `User "${db.user}" has no saved answers, but a backup from ${fmtDate(latest.t)} has ${latest.attempts}.`;
  banner.querySelector('[data-restore]').dataset.restore = latest.id;
  banner.classList.remove('hidden');
}

// ---------- users ----------

async function switchUser(name) {
  storage.setActiveUser(name);
  await storage.flush();
  location.reload();
}

function bindUsers(db) {
  const sel = $('userSelect');
  sel.innerHTML = storage.listUsers().map((u) => `<option value="${u}">${u}</option>`).join('') +
    '<option value="__new">+ New profile…</option>';
  sel.value = db.user;
  sel.onchange = () => {
    if (sel.value !== '__new') return switchUser(sel.value);
    sel.value = db.user;
    showWelcome('new').then(() => location.reload());
  };
  renderDbStatus();
}

// Where the copy is, for the badge and the Data page
const copyPlace = (db) => (db.disk.mode === 'folder' ? `folder "${db.disk.name}"` : `${db.disk.name || 'the data folder'}\\${db.user} (local server)`);
// why there is none right now
function noCopyReason(db) {
  const d = db.disk;
  if (d.needsPermission) return 'the data folder needs your permission again (Settings → Data → Reconnect)';
  if (d.error) return d.error;
  if (d.mode === 'server') return 'the local server (start.bat) is not reachable; writes are sent once it is back';
  return d.supported ? 'no folder chosen (Settings → Data)' : 'this browser cannot write to a folder; export a JSON backup now and then';
}

// The header badge and Settings → Data lines. Called again when Settings opens and every
// 5 s, since the disk copy can come and go with the server or the folder's permission.
function renderDbStatus() {
  const db = storage.status();
  const d = db.disk;
  const onDisk = db.persistent && d.dir && !d.error;
  const badge = $('dbBadge');
  badge.textContent = !db.persistent || db.storeError ? 'NOT SAVED' : onDisk ? (d.mode === 'folder' ? 'saved to folder' : 'saved to disk') : d.needsPermission ? 'folder: reconnect' : 'saved in browser only';
  badge.classList.toggle('warn', !onDisk);
  badge.classList.toggle('action', !!d.needsPermission);
  badge.title = !db.persistent
    ? `Could not open the profile (${db.error}). Progress is kept in memory only — is the app open in another tab?`
    : db.storeError ? `Saving in this browser failed: ${db.storeError}`
      : onDisk ? `Saved in this browser (IndexedDB) · copy in ${copyPlace(db)}` : `Saved in this browser (IndexedDB) · no copy outside it: ${noCopyReason(db)}`;
  const waiting = d.waiting ? ` (${d.waiting} writes on their way)` : ' (up to date)';
  $('dbInfo').textContent = `Fretboard Trainer ${VERSION} · profile "${db.user}" · ${db.persistent ? 'saved in this browser (IndexedDB)' : 'in memory only: ' + db.error}` +
    (!db.persistent ? '' : onDisk ? ` · copy in ${copyPlace(db)}${waiting}` : ` · NO copy outside this browser right now: ${noCopyReason(db)}`) +
    (db.storeError ? ` · SAVING IN THIS BROWSER FAILED: ${db.storeError}` : '') +
    (db.persisted ? ' · storage marked persistent' : ' · storage NOT marked persistent: the browser may clear it when disk space is low');
  // the Data folder block
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  show('folderReconnectBtn', !!d.needsPermission);
  show('folderCreateBtn', d.supported && db.persistent);
  show('folderChooseBtn', d.supported && db.persistent);
  show('folderForgetBtn', d.mode === 'folder');
  $('folderCreateBtn').textContent = d.mode === 'none' ? 'Create a folder…' : 'Move to a new folder…';
  $('folderInfo').textContent = d.mode === 'folder'
    ? (d.needsPermission ? `Folder "${d.name}": the browser needs your permission again before it can write there.`
      : d.error ? `Folder "${d.name}" could not be used: ${d.error}.`
        : `Folder "${d.name}"` + (d.savedAt ? ` · last saved ${new Date(d.savedAt).toLocaleTimeString()}` : '') + '. Moving makes a new fretboard-<name> folder where you choose and copies everything there; the old folder is left as it is.')
    : d.mode === 'server' ? `Written by the local server in ${d.name || 'the data folder'}\\${db.user}. You can keep a folder of your own instead (one inside OneDrive or Dropbox follows you to another computer).`
      : d.supported ? 'No folder yet. Pick one on this computer: every answer is written there too, as small files (one per run), and a wiped browser refills itself from them. A folder inside OneDrive or Dropbox follows you to another computer.'
        : 'Saving to a folder needs Chrome or Edge on a computer. Export JSON now and then to keep a copy elsewhere.';
}

// Settings → Data: the profiles to bring data from, and what was brought in
async function renderDataPage() {
  const me = storage.status().user;
  const sel = $('bringFrom');
  sel.innerHTML = storage.listUsers().filter((u) => u !== me).map((u) => `<option value="${u}">${u}</option>`).join('') +
    (storage.diskStatus().supported ? '<option value="__folder">a folder…</option>' : '');
  $('bringBtn').disabled = !sel.options.length;
  const origins = await storage.origins();
  $('originList').innerHTML = Object.entries(origins).map(([o, n]) => `<li><span>From "${o}" <span class="muted">· ${n} answers</span></span><button class="btn small" data-origin="${o}">Remove</button></li>`).join('');
}

// the model is replayed from the log, which has changed
async function rebuildAfterLogChange() {
  app.model.stale = true;
  await applyBoardSettings();
  await renderDataPage();
}

// ---------- profiles: welcome and picker ----------

const STORE_TEXT = { folder: 'own folder', server: 'data folder next to the app', browser: 'this browser only' };

// Resolves with the profile to open: on the first start (no profile yet), when several profiles
// exist (once per tab), and from "+ New profile…" in the header. A profile made here lands on
// the instrument page next (ft:firstRun).
function showWelcome(mode) {
  return new Promise((resolve) => {
    const el = $('welcome');
    const all = storage.profiles();
    const names = storage.listUsers();
    const ds = storage.diskStatus();
    const form = $('newProfile');
    const err = (e) => { $('welcomeError').textContent = e?.message || String(e || ''); };
    document.body.classList.add('welcome');
    $('welcomeIntro').classList.toggle('hidden', names.length > 0);
    $('loading').classList.add('hidden');
    el.classList.remove('hidden');
    const onKey = (e) => { if (e.key === 'Enter' && form.classList.contains('hidden')) $('profileList').querySelector('[data-pick]')?.click(); };
    document.addEventListener('keydown', onKey);
    const done = (name) => {
      document.removeEventListener('keydown', onKey);
      sessionStorage.setItem('ft:picked', '1');
      document.body.classList.remove('welcome');
      el.classList.add('hidden');
      $('loading').classList.remove('hidden');
      resolve(name);
    };
    const showList = () => {
      $('welcomeTitle').textContent = names.length ? 'Who is practising?' : 'Welcome';
      $('profileList').innerHTML = names.map((n) => {
        const p = all[n];
        const what = [p.instrument && INSTRUMENTS[p.instrument]?.name, p.tuning, p.lastUsed && 'last used ' + fmtDate(p.lastUsed), STORE_TEXT[p.store]].filter(Boolean).join(' · ');
        return `<li><span><b>${n}</b> <span class="muted">${what}</span></span><button class="btn small primary" data-pick="${n}">Open</button></li>`;
      }).join('');
      form.classList.add('hidden');
      $('welcomeChoice').classList.remove('hidden');
    };
    const showForm = () => {
      $('welcomeTitle').textContent = names.length ? 'New profile' : 'Welcome';
      $('welcomeChoice').classList.add('hidden');
      form.classList.remove('hidden');
      $('storeFolder').classList.toggle('hidden', !ds.supported);
      $('storeServer').classList.toggle('hidden', !ds.local);
      $('browserOnlyNote').textContent = ds.supported ? '— no copy anywhere else; export a JSON backup now and then' : '— Chrome or Edge on a computer can also save to a folder';
      form.store.value = ds.local ? 'server' : ds.supported ? 'folder' : 'browser';
      err('');
      $('profileName').focus();
    };
    $('profileList').onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      storage.setActiveUser(b.dataset.pick);
      done(b.dataset.pick);
    };
    $('newProfileBtn').onclick = showForm;
    $('cancelProfileBtn').onclick = showList;
    $('profileName').oninput = () => { $('profileFolder').textContent = storage.sanitizeUser($('profileName').value) ? `(folder: fretboard-${storage.sanitizeUser($('profileName').value)})` : ''; };
    $('openFolderBtn').onclick = async () => {
      try {
        const name = await storage.openProfileFolder();
        storage.setActiveUser(name, 'folder');
        done(name);
      } catch (e) {
        if (e.name !== 'AbortError') err(e);
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = storage.sanitizeUser($('profileName').value);
      if (!name) return err('A name is needed: letters, digits, - and _.');
      const store = form.store.value;
      try {
        if (store === 'folder') await storage.createProfileFolder(name);
        if (!all[name]) sessionStorage.setItem('ft:firstRun', name);
        storage.setActiveUser(name, store);
        done(name);
      } catch (e2) {
        if (e2.name !== 'AbortError') err(e2);
      }
    };
    if (mode === 'new') showForm();
    else showList(); // the first start too: a folder from another computer can be opened
  });
}

// Browser storage belongs to one address. The same app opened at another local address
// (127.0.0.1, another port) starts empty, so point back to the usual one.
const HOME = 'http://localhost:8137';
function checkAddress() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!local || location.origin === HOME) return;
  const banner = $('addressBanner');
  banner.querySelector('span').textContent =
    `This page is open at ${location.origin}. Your browser keeps a separate, empty storage for each address; ` +
    `the app's usual address is ${HOME}.`;
  banner.querySelector('a').href = HOME + location.pathname + location.hash;
  banner.classList.remove('hidden');
}

// ---------- init ----------

async function init() {
  await storage.migrateProfiles();
  const names = storage.listUsers();
  if (!names.length || (names.length > 1 && !sessionStorage.getItem('ft:picked'))) await showWelcome('pick');
  let db;
  try {
    db = await storage.open();
  } catch (e) {
    $('loading').textContent = 'Could not start the database: ' + (e.message || e);
    console.error(e);
    return;
  }
  performance.mark('app:db');
  $('loading').remove();
  document.querySelector('.brand').title = `Fretboard Trainer ${VERSION}`;
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  bindUsers(db);
  // console helpers; ft.strum() acts like a muted strum (for testing without a guitar)
  window.ft = { rows: storage.rows, status: storage.status, strum: () => onStrum(performance.now()) };
  // models stored in full by earlier versions (100 KB each, every instrument's): keep only what
  // is read back, once, so the kv table and kv.json stay small
  if (db.persistent) {
    for (const [k, v] of storage.entries('model:')) if (v?.cards) await storage.set(k, persistedModel(v));
  }

  // the profile's settings, with this computer's audio setup (AUDIO_KEYS); before 1.1 the audio
  // setup was in the profile's data too: it is taken from there once if this browser has none
  const stored = storage.get('settings') || {};
  const last = storage.lastSettings();
  const machine = AUDIO_KEYS.some((k) => k in last) ? last : stored;
  app.settings = { ...DEFAULTS, ...last, ...audioPart(stored, false), ...audioPart(machine, true) };
  delete app.settings.savedAt;
  app.settingsAt = stored.savedAt || 0;
  if (!Number.isInteger(app.settings.channel)) app.settings.channel = 0; // was saved as NaN by an old bug
  if (app.settings.runTask === 'mixed') app.settings.runTask = 'play'; // mixed runs were removed
  // tunings from before the standard/drop switch
  const OLD = { seven: { instrument: 'guitar7', tuning: 'standard' }, dropD: { tuning: 'drop' }, dropA: { tuning: 'drop' }, dropE: { tuning: 'drop' }, eb: { tuning: 'standard', tuningShift: -1 } };
  Object.assign(app.settings, OLD[app.settings.tuning] || {});
  if (AUDIO_KEYS.some((k) => k in stored)) saveSettings(); // moves the audio setup out of the profile's data
  app.strum.level = app.settings.strumLevel;
  app.board = new Fretboard($('board'));
  app.heat = new Fretboard($('heatBoard'));
  app.tuner = new Tuner($('view-tuner'), () => app.settings);
  app.quiz = new Quiz({
    board: app.board,
    els: {
      area: $('promptArea'), note: $('promptNote'), sub: $('promptSub'), timer: $('promptTimer'),
      zone: $('zoneLabel'), progress: $('progressLabel'), fill: $('progressFill'),
      feedback: $('feedback'), summary: $('summary'), queue: $('promptQueue'), startBtn: $('startBtn'), showMe: $('showMeBtn'), names: $('nameButtons'),
      ring: $('accRing'), menu: $('guitarMenu'), tf: $('tfButtons'), neckLegend: $('runNeckLegend'), mapLegend: $('mapLegend'), boardView: $('boardView'),
    },
    getSettings: () => app.settings,
    getScheduler: () => app.scheduler,
    getZones: () => app.zones,
    getStrings: () => app.strings,
    isActive: () => app.view === 'practice',
    onAttempt: (a) => storage.addAttempt(a),
    // a finished, stopped or abandoned run is saved to disk straight away
    onRun: async (row) => {
      await storage.saveRun(row);
      if (row.ended_at) await storage.flush();
    },
    onSave: saveModel,
    // after the summary has painted and the run's flush is through, not in the same frame
    onRunEnd: () => setTimeout(() => makeBackup('run'), 1200),
    // the open-string menu changes the same settings as the practice bar
    actions: {
      setTask: (t) => { app.settings.runTask = t; saveSettings(); updateModeUI(); },
      setLength: (mode, n) => { app.settings.runMode = mode; app.settings[mode === 'count' ? 'runCount' : 'sprintSec'] = n; saveSettings(); updateModeUI(); },
      toggleBeat: () => { app.settings.beat = !app.settings.beat; saveSettings(); updateModeUI(); },
      goIntervals: () => showView('intervals'),
    },
    sound,
  });
  app.ivBoard = new Fretboard($('ivBoard'));
  app.intervals = new IntervalsView({
    board: app.ivBoard,
    els: {
      area: $('ivArea'), title: $('ivTitle'), sub: $('ivSub'), steps: $('ivSteps'), timer: $('ivTimer'),
      progress: $('ivProgress'), fill: $('ivFill'), feedback: $('ivFeedback'), items: $('ivItems'), startBtn: $('ivStartBtn'), menu: $('ivMenu'),
    },
    goPractice: () => showView('practice'),
    getSettings: () => app.settings,
    getStrings: () => app.strings,
    isActive: () => app.view === 'intervals',
    loadRows: () => storage.allAttempts().filter((a) => a.task === 'interval').map((a) => ({ interval: a.interval, correct: a.correct, ms: a.ms })),
    onAttempt: (a) => storage.addAttempt(a),
    onRun: async (row) => {
      await storage.saveRun(row);
      if (row.ended_at) await storage.flush();
    },
    ensureAudio: () => { if (!app.audio.running) connectAudio(); },
    sound,
  });

  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
    if (b.dataset.tab === 'settings' && app.view === 'settings') return openSettings('home'); // second click: back to the cards
    showView(b.dataset.tab === 'practice' ? app.practicePage : b.dataset.tab);
  }));
  document.querySelectorAll('#practiceNav button').forEach((b) => (b.onclick = () => showView(b.dataset.tab)));
  $('view-settings').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-open]');
    if (b) openSettings(b.dataset.open);
  });
  document.querySelectorAll('#tuneMode button').forEach((b) => (b.onclick = () => setTuning({ tuning: b.dataset.mode })));
  $('tuneShift').addEventListener('input', () => fillTunings(+$('tuneShift').value)); // preview while sliding
  $('tuneShift').addEventListener('change', () => setTuning({ tuningShift: +$('tuneShift').value }));
  $('customUse').onclick = async () => {
    const text = $('customTuning').value;
    const p = parseTuning(text, INSTRUMENTS[app.settings.instrument].strings.length);
    if ('error' in p) {
      $('tuningError').textContent = p.error;
      return;
    }
    await setTuning({ tuning: 'custom', customTuning: text.trim() });
    openSettings('instrument');
  };
  document.querySelectorAll('#modeSeg button').forEach((b) => (b.onclick = () => {
    app.settings.runMode = b.dataset.mode;
    saveSettings();
    updateModeUI();
  }));
  document.querySelectorAll('#taskSeg button').forEach((b) => (b.onclick = () => {
    if (app.quiz.running) return; // switch between runs, not during one
    app.settings.runTask = b.dataset.task;
    saveSettings();
    updateModeUI();
    if (app.quiz.state === 'preview') app.quiz.prepare(); // the choice can change the zones offered
    else app.quiz.showMenu();
  }));
  $('beatBtn').onclick = () => {
    if (app.quiz.running) return;
    app.settings.beat = !app.settings.beat;
    saveSettings();
    updateModeUI();
  };
  $('startBtn').onclick = () => {
    if (!app.audio.running) connectAudio();
    app.quiz.primary();
  };
  $('runLen').onchange = () => {
    const input = $('runLen');
    const key = app.settings.runMode === 'count' ? 'runCount' : 'sprintSec';
    const v = parseInt(input.value, 10);
    if (Number.isFinite(v)) app.settings[key] = Math.max(+input.min, Math.min(+input.max, v));
    saveSettings();
    updateModeUI();
  };
  $('connectBtn').onclick = connectAudio;
  document.querySelectorAll('#tableSeg button').forEach((b) => (b.onclick = () => renderTable(b.dataset.table)));
  $('tableRefresh').onclick = () => renderTable();
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);

  fillTunings();
  bindSettings();
  updateGateMarker();
  bindData();
  updateModeUI();
  refreshChannels();
  refreshDevices(); // the device list fills in on its own; the board does not wait for it
  await applyBoardSettings();
  performance.mark('app:board');
  checkForLostData(db);
  checkAddress();
  setInterval(renderDbStatus, 5000);
  // a profile made on the welcome screen picks its instrument and tuning first
  $('firstRunDone').onclick = () => {
    $('firstRunNote').classList.add('hidden');
    $('audioFirstNote').classList.remove('hidden');
    openSettings('audio');
  };
  $('audioFirstDone').onclick = () => {
    $('audioFirstNote').classList.add('hidden');
    showView('practice');
    $('firstRunTip').classList.remove('hidden');
  };
  // the header meter: always there, a click opens the audio setup
  $('topMeter').onclick = () => { showView('settings'); openSettings('audio'); };
  // then the first run is one click away
  $('firstRunGo').onclick = () => {
    $('firstRunTip').classList.add('hidden');
    app.quiz.prepare();
  };
  $('startBtn').addEventListener('click', () => $('firstRunTip').classList.add('hidden'));
  if (sessionStorage.getItem('ft:firstRun') === db.user) {
    sessionStorage.removeItem('ft:firstRun');
    $('firstRunNote').classList.remove('hidden');
    showView('settings');
    openSettings('instrument');
  }

  window.fretboardSelfTest = runSelfTest;
  performance.mark('app:ready');
}

init();
