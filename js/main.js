import { TUNINGS, midiLabel, midiToFreq } from './music.js';
import { generateZones, selfTest } from './zones.js';
import * as storage from './storage.js';
import * as backup from './backup.js';
import { AudioInput } from './audio.js';
import { createDetector, NoteTracker } from './pitch.js';
import { Scheduler, newModel } from './srs.js';
import { Fretboard } from './fretboard.js';
import { Quiz } from './quiz.js';
import { IntervalsView } from './intervalsView.js';
import { Tuner } from './tuner.js';
import { renderStats } from './stats.js';
import { fitDecay, renderCheck, renderCueReliance } from './modelcheck.js';

const DEFAULTS = {
  deviceId: '',
  channel: 0,
  gain: 1,
  gate: 0.01,
  clarity: 0.9,
  a4: 440,
  latencyMs: 80,
  tuning: 'standard',
  frets: 15,
  leftHanded: false,
  zoneTypes: 'both',
  runMode: 'count',
  runCount: 20,
  sprintSec: 120,
  timeoutSec: 10,
  retry: true,
  showQueue: false,
  cueMode: 'fade',
  runTask: 'play',
  plan: '',
  sound: true,
};
const BOARD_KEYS = ['tuning', 'frets', 'leftHanded', 'zoneTypes'];
const FRAME = 3072;
const POLL_MS = 25;

const $ = (id) => document.getElementById(id);

const app = {
  levelTick: 0,
  settings: null,
  model: null,
  modelKey: null,
  scheduler: null,
  zones: [],
  strings: TUNINGS.standard.strings,
  view: 'practice',
  audio: new AudioInput(),
  tracker: new NoteTracker(),
  detect: createDetector(4096),
  loop: 0,
};

let saveQueued = false;
function saveModel() {
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    storage.set(app.modelKey, app.model);
  });
}

function saveSettings() {
  storage.set('settings', app.settings);
  storage.rememberSettings(app.settings);
}

function sound(kind) {
  if (!app.settings.sound) return;
  const ctx = (app.sfx ||= app.audio.ctx || new AudioContext());
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = kind === 'good' ? 1320 : 150;
  o.connect(g);
  g.connect(ctx.destination);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.start(t);
  o.stop(t + 0.16);
}

// ---------- board / model ----------

const tuningAttempts = async () =>
  (await storage.allAttempts()).filter((a) => a.tuning === app.settings.tuning)
    .filter((a) => a.task !== 'interval') // the Intervals tab has its own stats, not the note model
    .sort((a, b) => a.t - b.t);

async function applyBoardSettings() {
  const s = app.settings;
  const tuning = TUNINGS[s.tuning] || TUNINGS.standard;
  app.strings = tuning.strings;
  // prompts mix sharps and flats; this only picks how string names and the tuner are written
  s.flats = s.tuning === 'eb';
  const key = 'model:' + s.tuning;
  if (app.modelKey !== key) {
    app.model = (await storage.get(key)) || newModel();
    app.modelKey = key;
  }
  app.zones = generateZones(tuning.strings, s.frets, s.zoneTypes);
  app.scheduler = new Scheduler(app.model, tuning.strings, s.frets);
  if (app.scheduler.needsRebuild) {
    // the model format changed: replay the answer log, which keeps every answer time
    app.scheduler.rebuild(await tuningAttempts());
    await storage.set(app.modelKey, app.model);
  }
  const cfg = { strings: tuning.strings, frets: s.frets, leftHanded: s.leftHanded, flats: s.flats };
  app.board.configure(cfg);
  app.heat.configure(cfg);
  app.ivBoard.configure(cfg);
  app.intervals.leave();
  app.intervals.reset();
  app.quiz.reset();
  app.tuner.setStrings(tuning.strings, s.flats);
  // detector range: a tone below the lowest string up to the top fret
  app.minF = midiToFreq(Math.min(...tuning.strings) - 3, s.a4);
  app.maxF = midiToFreq(Math.max(...tuning.strings) + s.frets + 3, s.a4);
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
}

function processFrame() {
  const buf = app.audio.read();
  if (!buf) return;
  const frame = buf.subarray(buf.length - FRAME);
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length);
  const s = app.settings;
  const now = performance.now();
  const res = rms >= s.gate ? app.detect(frame, app.audio.sampleRate, app.minF, app.maxF) : null;
  if (app.view === 'settings') updateMeter(rms);
  if (app.view === 'tuner') app.tuner.onFrame(res, rms, now);
  const ev = app.tracker.feed(now, res, rms, s);
  if (ev) app.quiz.onNote(ev);
  if (ev && app.view === 'intervals') app.intervals.onNote(ev);
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
  $('meterGate').style.left = meterPct(app.settings.gate) + '%';
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
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
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
  const attemptCount = await storage.countAttempts();
  const weekAgo = new Date().setHours(0, 0, 0, 0) - 6 * 86400000; // today and the 6 days before
  const monthAgo = Date.now() - 30 * 86400000;
  const tuning = app.settings.tuning.replace(/'/g, "''");
  // practice consistency: days with at least one answer in the last 7 (no streak to lose)
  const [{ days }] = await storage.sql(`SELECT count(DISTINCT strftime(to_timestamp(t / 1000), '%Y-%m-%d'))::INT AS days FROM attempts WHERE t >= ${weekAgo}`);
  // check-up prompts are random, so their success rate is not pulled towards the target
  const [probe] = await storage.sql(`SELECT count(*)::INT AS n, coalesce(avg(correct::INT), 0) AS acc FROM attempts WHERE probe AND t >= ${monthAgo} AND tuning = '${tuning}'`);
  const [named] = await storage.sql(`SELECT count(*)::INT AS n, coalesce(avg(correct::INT), 0) AS acc FROM attempts WHERE task = 'name' AND t >= ${monthAgo} AND tuning = '${tuning}'`);
  const pct = (x) => Math.round(x * 100) + '%';
  renderStats({
    extraCards: [
      ['Practised (last 7 days)', `${days} of 7 days`],
      ['Check-up accuracy (30 days)', probe.n ? `${pct(probe.acc)} of ${probe.n}` : '—'],
      ['Name the note (30 days)', named.n ? `${pct(named.acc)} of ${named.n}` : '—'],
    ],
    els: { cards: $('statCards'), notes: $('noteBars'), cells: $('weakCells'), slow: $('slowCells'), zones: $('weakZones'), runs: $('recentRuns') },
    scheduler: app.scheduler,
    zones: app.zones,
    strings: app.strings,
    frets: app.settings.frets,
    flats: app.settings.flats,
    heat: app.heat,
    attemptCount,
  });
}

function updateModeUI() {
  const s = app.settings;
  const count = s.runMode === 'count';
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.runMode));
  document.querySelectorAll('#taskSeg button').forEach((b) => b.classList.toggle('active', b.dataset.task === (s.runTask || 'play')));
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
      if (BOARD_KEYS.includes(key) || key === 'a4') await applyBoardSettings();
      if (key === 'deviceId') connectAudio();
      if (key === 'gate') updateGateMarker();
      if (key === 'channel') { app.audio.setChannel(v); updateAudioLabel(); }
      if (key === 'gain') app.audio.setGain(v);
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
  for (const [id, t] of Object.entries(TUNINGS)) {
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
    await storage.set(app.modelKey, app.model);
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
  try {
    await storage.set(app.modelKey, app.model);
    await backup.save(storage.status().user, await storage.exportAll(), reason);
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
  const tuning = app.settings.tuning.replace(/'/g, "''");
  const rows = (await storage.sql(`SELECT pred_p AS p, correct::INT AS y,
      t - lag(t) OVER (PARTITION BY string_idx, fret, spelling, coalesce(task, 'play') ORDER BY t) AS lag
    FROM attempts WHERE tuning = '${tuning}' QUALIFY pred_p IS NOT NULL AND NOT coalesce(cue_target, false) ORDER BY t`))
    .map((r) => ({ p: r.p, y: r.y, lag: r.lag == null ? null : Number(r.lag) }));
  const attempts = await tuningAttempts();
  const fit = fitDecay(attempts, app.strings, app.settings.frets, app.model.meta.decay);
  app.scheduler.useDecay(app.model.meta.decay); // the replays changed the curve in use
  const useBtn = fit.best ? `<button class="btn small" id="useDecayBtn">Use decay ${fit.best} and rebuild</button>` : '';
  const resetBtn = app.model.meta.decay ? ' <button class="btn small" id="defaultDecayBtn">Back to the default decay</button>' : '';
  const cueRows = (await storage.sql(`SELECT pred_p AS p, correct::INT AS y, ms, coalesce(cue_target, false)::INT AS own,
      coalesce(cue_n, 0) AS n, cue_nearest AS near
    FROM attempts WHERE tuning = '${tuning}' AND coalesce(task, 'play') = 'play' AND cue_mode IS NOT NULL AND pred_p IS NOT NULL`))
    .map((r) => ({ p: r.p, y: r.y, ms: Number(r.ms), own: !!r.own, n: Number(r.n), near: r.near }));
  out.innerHTML = renderCheck(rows, fit.html + useBtn + resetBtn) + `<h4>Reliance on note names</h4>${renderCueReliance(cueRows)}`;
  const apply = async (d) => {
    app.scheduler.useDecay(d);
    app.scheduler.rebuild(await tuningAttempts());
    await storage.set(app.modelKey, app.model);
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

// The database is empty but a backup has answers: most likely the file was lost.
async function checkForLostData(db) {
  const banner = $('restoreBanner');
  if (db.recovered) {
    banner.querySelector('span').textContent =
      `The database file for "${db.user}" was out of date (${db.recovered.before} answers). ` +
      `It was rebuilt from the safety copy: ${db.recovered.after} answers, nothing lost.`;
    banner.querySelector('[data-restore]').classList.add('hidden');
    banner.classList.remove('hidden');
    return;
  }
  const back = db.disk.restored;
  if (back?.attempts) {
    banner.querySelector('span').textContent =
      `${back.attempts} answers and ${back.runs} runs for "${db.user}" were missing in this browser and were copied back from the disk copy (${db.disk.dir}\\${db.user}).`;
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
    '<option value="__new">+ New user…</option>';
  sel.value = db.user;
  sel.onchange = () => {
    if (sel.value !== '__new') return switchUser(sel.value);
    const name = storage.sanitizeUser(prompt('New user name (letters, digits, - and _):') || '');
    if (name) switchUser(name);
    else sel.value = db.user;
  };
  document.body.classList.toggle('test-user', db.user === 'test');
  renderDbStatus();
}

// The header badge and Settings → Data line. Called again when Settings opens, since the
// disk copy can come and go with the server.
function renderDbStatus() {
  const db = storage.status();
  const onDisk = db.persistent && db.disk.dir && !db.disk.error;
  const badge = $('dbBadge');
  badge.textContent = !db.persistent ? 'NOT SAVED' : onDisk ? 'saved' : 'saved in browser only';
  badge.classList.toggle('warn', !onDisk);
  badge.title = !db.persistent
    ? `Could not open ${db.file} (${db.error}). Progress is kept in memory only — is the app open in another tab?`
    : onDisk
      ? `DuckDB ${db.version} · ${db.file} · disk copy in ${db.disk.dir}\\${db.user}`
      : `DuckDB ${db.version} · ${db.file} · no disk copy: ${db.disk.error || 'the local server (start.bat) is not reachable'}. Writes are sent once it is back.`;
  const diskText = !db.persistent ? ''
    : onDisk ? ` · disk copy in ${db.disk.dir}\\${db.user}` + (db.disk.waiting ? ` (${db.disk.waiting} writes on their way)` : ' (up to date)')
      : ` · NO disk copy right now (${db.disk.error || 'local server not reachable; run start.bat'})` + (db.disk.waiting ? `, ${db.disk.waiting} writes waiting` : '');
  $('dbInfo').textContent = `User "${db.user}" · DuckDB ${db.version} · ${db.persistent ? db.file + ' + safety copy in IndexedDB' : 'in memory only: ' + db.error}` +
    diskText +
    (db.mirrorError ? ` · safety copy error: ${db.mirrorError}` : '') +
    (db.persisted ? ' · storage marked persistent' : ' · storage NOT marked persistent: the browser may clear it when disk space is low');
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
  let db;
  try {
    db = await storage.open();
  } catch (e) {
    $('loading').textContent = 'Could not start the database: ' + (e.message || e);
    console.error(e);
    return;
  }
  $('loading').remove();
  bindUsers(db);
  window.ft = { sql: storage.sql, status: storage.status };

  app.settings = { ...DEFAULTS, ...storage.lastSettings(), ...((await storage.get('settings')) || {}) };
  if (!Number.isInteger(app.settings.channel)) app.settings.channel = 0; // was saved as NaN by an old bug
  app.board = new Fretboard($('board'));
  app.heat = new Fretboard($('heatBoard'));
  app.tuner = new Tuner($('view-tuner'), () => app.settings);
  app.quiz = new Quiz({
    board: app.board,
    els: {
      area: $('promptArea'), note: $('promptNote'), sub: $('promptSub'), timer: $('promptTimer'),
      zone: $('zoneLabel'), progress: $('progressLabel'), fill: $('progressFill'),
      feedback: $('feedback'), summary: $('summary'), queue: $('promptQueue'), startBtn: $('startBtn'), showMe: $('showMeBtn'), names: $('nameButtons'),
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
    onRunEnd: () => makeBackup('run'),
    sound,
  });
  app.ivBoard = new Fretboard($('ivBoard'));
  app.intervals = new IntervalsView({
    board: app.ivBoard,
    els: {
      area: $('ivArea'), title: $('ivTitle'), sub: $('ivSub'), steps: $('ivSteps'), timer: $('ivTimer'),
      progress: $('ivProgress'), fill: $('ivFill'), feedback: $('ivFeedback'), items: $('ivItems'), startBtn: $('ivStartBtn'),
    },
    getSettings: () => app.settings,
    getStrings: () => app.strings,
    isActive: () => app.view === 'intervals',
    loadRows: () => storage.sql(`SELECT "interval", correct, ms FROM attempts WHERE task = 'interval' ORDER BY t`),
    onAttempt: (a) => storage.addAttempt(a),
    onRun: async (row) => {
      await storage.saveRun(row);
      if (row.ended_at) await storage.flush();
    },
    ensureAudio: () => { if (!app.audio.running) connectAudio(); },
    sound,
  });

  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => showView(b.dataset.tab)));
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
    if (app.quiz.state === 'preview') app.quiz.run.task = b.dataset.task;
  }));
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

  bindSettings();
  updateGateMarker();
  bindData();
  updateModeUI();
  refreshChannels();
  await refreshDevices();
  await applyBoardSettings();
  checkForLostData(db);
  checkAddress();
  setInterval(renderDbStatus, 5000);

  window.fretboardSelfTest = runSelfTest;
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
