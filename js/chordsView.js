// @ts-check
// Chord page: grips from the unlocked chords, played string by string on the guitar (or clicked
// on the board / typed), named with buttons, or chained in Changes (progressions, with an
// optional metronome bar per chord). Same flow as Intervals: Start or Enter, green/red feedback,
// a time-out that shows the answer, Esc stops. Each graded chord is logged with task 'chord'
// or 'chord-name'; each run gets a runs row ('chord', 'chord-name' or 'chord-change').

import {
  BEATS, ITEM, ITEMS, QUALITY, SHAPE, available, buildState, cardKey, chipState, describe, grip,
  gradeCap, hear, isCheckup, isRightName, labelLevel, labelsFor, makeProgression, nextBpm, pickChord, promptTimeout,
  retestAt, shownLevel, standardTop6, startBpm, summary, timeGrade, unlockedKeys,
} from './chords.js';
import { ROOT_NAMES } from './intervals.js';
import { median } from './logQueries.js';
import { midiLabel, pcOf, stringName } from './music.js';
import { GuitarMenu } from './guitarMenu.js';
import { burst } from './burst.js';
import { namesHtml } from './quiz.js';
import { NO_ZONE } from './intervalsView.js';

const NEXT_DELAY = 700;
const REVEAL_DELAY = 2200;
const ALONG_MS = 6000; // the ungraded play-along after a miss
const KEY_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TASKS = [['play', 'Play the chord'], ['name', 'Name the chord'], ['change', 'Changes']];
const ROW_TASK = { play: 'chord', name: 'chord-name', change: 'chord-change' };
const KINDS = [['open', 'Open chords'], ['power', 'Power chords'], ['barre', 'Barre chords'], ['shell', 'Shells (no 5th)'], ['triad', 'Triads']];
// the quality buttons of Name the chord, grouped like the table of qualities
/** @type {[string, string[]][]} */
const Q_GROUPS = [['Triads', ['5', 'maj', 'm', 'dim', 'aug', 'sus2', 'sus4']], ['Sixths', ['6', 'm6']], ['Sevenths', ['7', 'maj7', 'm7', 'mmaj7', 'm7b5', 'dim7', '7#5', 'maj7#5', '7sus4', '7b5']]];

const fmt = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s');
const qName = (q) => QUALITY[q].sym || 'maj';

export class ChordsView {
  // o: { board, els, getSettings, getStrings, isActive, loadRows, onAttempt, onRun, sound, ensureAudio, goPractice, setTask, toggleBeat }
  constructor(o) {
    this.board = o.board;
    this.els = o.els;
    this.getSettings = o.getSettings;
    this.getStrings = o.getStrings;
    this.isActive = o.isActive;
    this.loadRows = o.loadRows;
    this.onAttempt = o.onAttempt;
    this.onRun = o.onRun;
    this.sound = o.sound;
    this.ensureAudio = o.ensureAudio;
    this.goPractice = o.goPractice;
    this.setTask = o.setTask;
    this.toggleBeat = o.toggleBeat;
    this.rows = [];
    this.st = buildState([]);
    this.state = 'idle'; // idle | await | feedback | done
    this.run = null;
    this.cur = null;
    this.timers = [];
    this.beatTimer = 0;
    this.raf = 0;
    this.preview = null;
    // tours: force the next grip and its label level
    this.forceKey = null;
    this.forceLevel = null;
    this.board.onCellClick = (s, f) => this.simulate(this.getStrings()[s] + f);
    this.els.startBtn.onclick = () => this.primary();
    this.els.names.onclick = (e) => {
      const b = e.target.closest('[data-pc]');
      if (b) this.pickName(+b.dataset.pc, null);
    };
    this.els.quality.onclick = (e) => {
      const b = e.target.closest('[data-q]');
      if (b) this.pickName(null, b.dataset.q);
    };
    // a chip between runs: its grip on the board
    const chip = (e) => {
      const c = e.target.closest?.('[data-key]');
      if (c && !this.running) this.showGrip(c.dataset.key);
    };
    this.els.items.addEventListener('mouseover', chip);
    this.els.items.addEventListener('click', chip);
    this.menu = new GuitarMenu(this.els.menu, this.getStrings, () => !!this.s.flats, () => !!this.s.lowAtBottom);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get s() {
    return this.getSettings();
  }

  get task() {
    return this.s.chordTask || 'play';
  }

  get running() {
    return this.state === 'await' || this.state === 'feedback';
  }

  get usable() {
    return standardTop6(this.getStrings());
  }

  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    cancelAnimationFrame(this.raf);
  }

  // Between runs: Start, run type, beat mode on the open strings; the bottom row goes back to
  // the Note position main menu.
  showMenu(sub = null) {
    if (this.running) return this.menu.hide();
    const back = { back: () => this.goPractice?.(), backLabel: 'Back to the Note position menu' };
    if (!this.usable) return this.menu.show('Chords', [], back);
    if (sub === 'type') {
      return this.menu.show('Run type', TASKS.map(([t, label]) => ({ label, active: this.task === t, act: () => { this.setTask(t); this.renderItems(); this.reset(); } })),
        { back: () => this.showMenu() });
    }
    const type = (TASKS.find(([t]) => t === this.task) || TASKS[0])[1];
    this.menu.show('Next', [
      { label: 'Start a run', primary: true, act: () => this.primary() },
      { label: `Run type: ${type} …`, act: () => this.showMenu('type') },
      { label: `Beat mode: ${this.s.beat ? 'on' : 'off'}`, act: () => { this.toggleBeat(); this.showMenu(); } },
    ], back);
  }

  // A muted strum: during a run three in a row stop it; between runs two start a run.
  onStrum(n) {
    if (this.running) {
      if (n >= 3) this.end('strum_stop');
    } else if (n === 2) this.menu.primary();
  }

  // The page was opened: stats, cards and label levels from the answer log.
  async open() {
    this.rows = await this.loadRows();
    this.st = buildState(this.rows);
    this.renderItems();
    if (!this.running) this.reset();
  }

  reset() {
    this.clearTimers();
    clearTimeout(this.beatTimer);
    if (this.board.layers) {
      this.board.clearMarks();
      this.board.zoomTo(null);
    }
    const e = this.els;
    e.title.textContent = 'Chords';
    e.sub.textContent = !this.usable ? 'Chords need the top six strings in standard tuning (any shift).'
      : { play: 'A chord is named; play every string of its grip, in any order. Press Start or Enter.',
        name: 'A grip is drawn on the board; name the chord with the buttons. Press Start or Enter.',
        change: `Four chords in a row; play each, then the next.${this.s.beat ? ' Beat mode: one bar per chord.' : ''} Press Start or Enter.` }[this.task];
    e.steps.textContent = '';
    e.prog.textContent = '';
    e.timer.textContent = '';
    e.progress.textContent = '';
    e.fill.style.width = '0%';
    e.feedback.textContent = '';
    e.feedback.className = 'feedback';
    this.showAnswerUi(false);
    this.state = 'idle';
    this.updateButton();
    this.showMenu();
  }

  showAnswerUi(on) {
    this.els.names.classList.toggle('hidden', !on);
    this.els.quality.classList.toggle('hidden', !on);
  }

  updateButton() {
    const b = this.els.startBtn;
    b.textContent = this.running ? 'Stop' : 'Start ⏎';
    b.classList.toggle('danger', this.running);
    b.classList.toggle('hidden', !this.usable && !this.running);
    document.body.classList.toggle('in-run', this.running);
    this.board.setLongStrings(!this.running);
  }

  primary() {
    if (this.running) return this.end('stopped');
    if (!this.usable) return;
    this.ensureAudio?.();
    this.start();
  }

  // The view is left or the board changed.
  leave() {
    if (this.running) this.end('left');
    this.clearTimers();
  }

  // grips open for runs: unlocked and on the neck
  pool() {
    return unlockedKeys(this.st.stats).filter((k) => available(ITEM[k], this.s.frets));
  }

  start() {
    const s = this.s;
    const task = this.task;
    const beat = task === 'change' && !!s.beat;
    const bpm = beat ? startBpm(this.rows.filter((r) => r.correct && r.special === 'change').map((r) => r.ms)) : null;
    this.run = {
      id: Date.now().toString(36), task, total: s.runCount, n: 0, results: [], prev: null, retests: [],
      st0: this.st, unlockedAtStart: unlockedKeys(this.st.stats), beat, bpm, bpmStart: bpm, prog: null, pi: 0, beatN: 0,
    };
    this.run.row = {
      run_id: this.run.id, started_at: Date.now(), ended_at: null, end_reason: null,
      tuning: s.tuningLabel, instrument: s.instrument, strings: this.getStrings().join(','), mode: 'count', run_count: s.runCount, timeout_sec: null, task: ROW_TASK[task],
      zone_type: null, zone_strings: null, zone_cs: null, zone_cf: null, zone_span: null, zone_fret_min: null, zone_fret_max: null, zone_label: null,
      retry: !!s.retry, bpm_start: bpm, bpm_end: null,
    };
    this.onRun?.(this.run.row);
    this.state = 'feedback';
    this.preview = null;
    this.updateButton();
    this.menu.hide();
    this.showAnswerUi(task === 'name');
    if (task === 'name') {
      this.els.names.innerHTML = namesHtml(s.nameAccidentals === 'flats');
      const open = new Set(this.pool().map((k) => ITEM[k].q));
      this.els.quality.innerHTML = Q_GROUPS.map(([g, qs]) => {
        const btns = qs.filter((q) => open.has(q)).map((q) => `<button data-q="${q}" title="${QUALITY[q].name}">${qName(q)}</button>`).join('');
        return btns ? `<span class="seg-label">${g}</span>${btns}` : '';
      }).join('');
    }
    if (beat) this.startBeat();
    else this.next();
  }

  // Beat mode: a click on every beat; a chord lasts a bar of BEATS beats and the next one starts
  // on the bar line, done or not.
  startBeat() {
    const run = this.run;
    run.beatAt = performance.now();
    const beat = () => {
      if (this.run !== run || !this.running) return;
      if (run.beatN % BEATS === 0) this.barLine();
      if (this.run !== run) return;
      this.sound?.('tick');
      run.beatN++;
      run.beatAt += 60000 / run.bpm;
      this.beatTimer = setTimeout(beat, Math.max(0, run.beatAt - performance.now()));
    };
    beat();
  }

  barLine() {
    if (this.cur && !this.cur.graded) this.miss(performance.now() - this.cur.shownAt, null, '⏱ Bar over');
    this.next();
  }

  // The next prompt: a re-test that is due, the next chord of the progression, or a pick.
  pickKey() {
    const run = this.run;
    if (this.forceKey && ITEM[this.forceKey]) {
      const k = this.forceKey;
      this.forceKey = null;
      return { key: k, retest: false };
    }
    const r = run.retests.findIndex((x) => x.at <= run.n);
    if (r >= 0) return { key: run.retests.splice(r, 1)[0].key, retest: true };
    const pool = this.pool();
    if (!pool.length) return null;
    if (run.task === 'change') {
      if (!run.prog || run.pi >= run.prog.keys.length) {
        run.prog = makeProgression(pool, this.st.stats, run.prog);
        run.pi = 0;
      }
      return { key: run.prog.keys[run.pi++], retest: false, special: 'change' };
    }
    return { key: pickChord(pool, this.st.stats, this.st.cards, run.prev, Date.now(), Math.random, run.task), retest: false };
  }

  next() {
    this.clearTimers();
    this.board.clearMarks();
    const run = this.run;
    if (!run) return;
    if (run.results.length >= run.total) return this.end('completed');
    const pick = this.pickKey();
    if (!pick) return this.end('completed');
    const item = ITEM[pick.key];
    const strings = this.getStrings();
    const g = grip(item, strings);
    const task = run.task === 'name' ? 'chord-name' : 'chord';
    const level = this.forceLevel ?? labelLevel(run.st0, pick.key, task);
    const shown = shownLevel(level, { retest: pick.retest, n: run.n });
    this.cur = {
      key: pick.key, item, grip: g, task, level: shown, retest: pick.retest, probe: isCheckup(run.n) && !pick.retest, special: pick.special ?? null,
      shownAt: performance.now(), left: g.cells.map((c) => c.midi), heard: [], wrong: [], graded: false, along: false, pc: null, q: null, played: null,
    };
    run.prev = pick.key;
    run.n++;
    this.state = 'await';
    const e = this.els;
    const L = labelsFor(item, shown, task);
    if (task === 'chord-name') {
      e.title.textContent = 'Name it';
      e.sub.textContent = `${describe(item).replace(/^triad on .*?, /, 'triad, ')} · pick the root and the quality`;
      for (const c of g.cells) this.board.mark(c.s, c.f, 'ask', L.labels.includes(c.deg) ? c.deg : '');
      this.els.names.querySelectorAll('.active').forEach((b) => b.classList.remove('active'));
      this.els.quality.querySelectorAll('.active').forEach((b) => b.classList.remove('active'));
    } else {
      e.title.textContent = g.label;
      e.sub.textContent = `${describe(item)} · play every string, any order${L.list.length ? ` · ${L.list.join(' ')}` : ''}`;
      if (L.draw === 'grip') for (const c of g.cells) this.board.mark(c.s, c.f, 'cue', L.labels.includes(c.deg) ? c.deg : '');
      if (L.draw === 'root') this.board.mark(g.root.s, g.root.f, 'ask', '');
    }
    e.title.classList.remove('pop');
    void e.title.offsetWidth;
    e.title.classList.add('pop');
    e.feedback.textContent = '';
    e.feedback.className = 'feedback';
    e.progress.textContent = `${run.results.length + 1} / ${run.total}${run.beat ? ` · ${run.bpm} bpm` : ''}`;
    e.fill.style.width = (100 * run.results.length) / run.total + '%';
    this.board.zoomTo(g.cells);
    this.renderSteps();
    this.renderProg();
    if (!run.beat) this.later(() => this.timeout(), task === 'chord-name' ? promptTimeout(g.cells) + 4000 : promptTimeout(g.cells));
    this.tick();
  }

  // Play: one dot per string of the grip, its letter until played, then the note's name.
  renderSteps() {
    const cur = this.cur;
    if (!cur || cur.task === 'chord-name') return void (this.els.steps.innerHTML = '');
    const strings = this.getStrings();
    const done = [...cur.heard];
    this.els.steps.innerHTML = cur.grip.cells.map((c) => {
      const i = done.indexOf(c.midi);
      if (i >= 0) done.splice(i, 1);
      return `<span class="${i >= 0 ? 'done' : ''}">${i >= 0 ? c.name : stringName(strings, c.s, this.s.flats)}</span>`;
    }).join('');
  }

  // Changes: the progression on one line, the current chord highlighted.
  renderProg() {
    const run = this.run;
    if (!run?.prog || run.task !== 'change') return void (this.els.prog.innerHTML = '');
    const strings = this.getStrings();
    const at = this.cur?.special === 'change' ? run.pi - 1 : -1;
    this.els.prog.innerHTML = run.prog.keys.map((k, i) =>
      `<span class="${i === at ? 'now' : i < at ? 'done' : ''}">${grip(ITEM[k], strings).label}</span>`).join('');
  }

  // the answer timer, written only when its text changes
  tick() {
    if (this.state !== 'await' || !this.cur) return;
    const text = ((performance.now() - this.cur.shownAt) / 1000).toFixed(1) + ' s';
    if (this.els.timer.textContent !== text) this.els.timer.textContent = text;
    this.raf = requestAnimationFrame(() => this.tick());
  }

  cellOf(midi) {
    return this.cur?.grip.cells.find((c) => c.midi === midi);
  }

  // ev: { midi, t } with t in performance.now() time
  onNote(ev) {
    if (!this.running) {
      const open = this.getStrings().indexOf(ev.midi);
      if (this.menu.visible && open >= 0) this.board.vibrate(open, 0, ev.freq || 440 * 2 ** ((ev.midi - 69) / 12));
      this.menu.onNote(ev.midi);
      return;
    }
    const cur = this.cur;
    if (!cur || cur.task === 'chord-name' || ev.t < cur.shownAt) return;
    if (this.state !== 'await' && !cur.along) return;
    const freq = ev.freq || 440 * 2 ** ((ev.midi - 69) / 12);
    const r = hear(cur, ev.midi);
    if (r === 'ring') return;
    const ms = Math.max(0, ev.t - cur.shownAt - this.s.latencyMs);
    if (r === 'tick' || r === 'done') {
      const c = this.cellOf(ev.midi);
      this.board.vibrate(c.s, c.f, freq);
      this.board.flash(c.s, c.f, 'good', c.name);
      this.renderSteps();
      if (cur.along) {
        if (r === 'done') { this.clearTimers(); this.later(() => this.next(), NEXT_DELAY); }
        return;
      }
      cur.played = ev.midi;
      if (r === 'tick') return;
      const news = this.grade(true, ms);
      this.feedback('good', `✓ ${cur.grip.label} · ${(ms / 1000).toFixed(2)} s${news}`);
      this.sound?.('good');
      this.state = 'feedback';
      this.clearTimers();
      if (!this.run.beat) this.later(() => this.next(), cur.special === 'change' && !news ? 0 : news ? REVEAL_DELAY : NEXT_DELAY);
      return;
    }
    if (cur.along) return;
    cur.wrong.push({ midi: ev.midi, ms });
    cur.played = ev.midi;
    const pos = this.where(ev.midi);
    if (pos) {
      this.board.vibrate(pos.s, pos.f, freq);
      this.board.flash(pos.s, pos.f, 'bad', midiLabel(ev.midi, this.s.flats).replace(/\d+$/, ''));
    }
    this.sound?.('bad');
    this.miss(ms, ev.midi, `✗ You played ${midiLabel(ev.midi, this.s.flats)}`);
  }

  timeout() {
    if (this.state !== 'await' || !this.cur) return;
    this.miss(performance.now() - this.cur.shownAt, null, '⏱ Here it is');
  }

  // A miss ends the prompt: every note of the grip shown, then (Play, play-along on) an
  // ungraded replay, and a re-test a few prompts later.
  miss(ms, played, text) {
    const { cur, run } = this;
    this.feedback('bad', text + this.grade(false, ms, played));
    const g = cur.grip;
    for (const c of g.cells) {
      if (cur.task === 'chord-name') this.board.reveal(c.s, c.f, c.deg);
      else if (c === g.root) this.board.mark(c.s, c.f, 'ask', c.name);
      else this.board.reveal(c.s, c.f, c.name);
    }
    this.els.sub.textContent = `${cur.task === 'chord-name' ? `It is ${g.label}: ` : ''}${g.names.join(' ')} (${g.cells.map((c) => c.deg).join(' ')})`;
    if (cur.task === 'chord-name') this.els.title.textContent = g.label;
    if (!cur.retest && run.task !== 'change') run.retests.push({ at: retestAt(run.n - 1), key: cur.key });
    this.state = 'feedback';
    this.clearTimers();
    if (run.beat) return;
    if (this.s.retry && cur.task !== 'chord-name') {
      cur.along = true;
      cur.left = g.cells.map((c) => c.midi);
      cur.heard = [];
      this.renderSteps();
      this.later(() => this.next(), ALONG_MS);
    } else this.later(() => this.next(), REVEAL_DELAY);
  }

  // Name the chord: a root (letter or button) and a quality, in any order.
  pickName(pc, q) {
    const cur = this.cur;
    if (this.state !== 'await' || cur?.task !== 'chord-name') return;
    if (pc != null) cur.pc = pc;
    if (q != null) cur.q = q;
    this.els.names.querySelectorAll('[data-pc]').forEach((b) => b.classList.toggle('active', +b.dataset.pc === cur.pc));
    this.els.quality.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('active', b.dataset.q === cur.q));
    if (cur.pc == null || cur.q == null) return;
    const ms = performance.now() - cur.shownAt;
    const said = ROOT_NAMES[cur.pc] + QUALITY[cur.q].sym;
    cur.answerName = said;
    if (isRightName(cur.item, cur.pc, cur.q, cur.grip.rootPc)) {
      const news = this.grade(true, ms);
      this.els.title.textContent = cur.grip.label;
      for (const c of cur.grip.cells) this.board.mark(c.s, c.f, 'good', c.deg);
      this.feedback('good', `✓ ${said} · ${(ms / 1000).toFixed(2)} s${news}`);
      this.sound?.('good');
      this.state = 'feedback';
      this.clearTimers();
      this.later(() => this.next(), news ? REVEAL_DELAY : NEXT_DELAY + 300);
    } else {
      this.sound?.('bad');
      this.board.clearMarks();
      this.miss(ms, null, `✗ ${said}`);
    }
  }

  grade(correct, ms, played = null) {
    const { cur, run } = this;
    if (cur.graded) return '';
    cur.graded = true;
    const before = unlockedKeys(this.st.stats);
    const ck = cardKey(cur.key, cur.task);
    const cap = gradeCap(cur.level);
    const fsrsGrade = timeGrade(this.st.stats.get(ck), correct, ms, cap.maxG);
    const t = Date.now();
    const row = { chord: cur.key, task: cur.task, correct, ms: Math.round(ms), t, chordCue: cur.level, runId: run.id, probe: cur.probe, retest: cur.retest, special: cur.special };
    this.rows.push(row);
    this.st = buildState(this.rows);
    run.results.push({ key: cur.key, label: cur.grip.label, correct, ms });
    this.onAttempt({
      t, runId: run.id, tuning: this.s.tuningLabel, instrument: this.s.instrument, strings: this.getStrings().join(','), desc: NO_ZONE,
      s: cur.grip.root.s, f: cur.grip.root.f, target: cur.grip.bass, played: played ?? cur.played, correct, ms: Math.round(ms), g: null, review: false,
      solveMs: correct ? Math.round(ms) : null, wrongCount: cur.wrong.length,
      wrongNotes: cur.wrong.map((w) => w.midi).join(',') || null, wrongMs: cur.wrong.map((w) => Math.round(w.ms)).join(',') || null,
      showMe: false, task: cur.task, chord: cur.key, chordCue: cur.level, retest: cur.retest, probe: cur.probe, special: cur.special,
      bpm: run.beat ? run.bpm : null, fsrsGrade, answerName: cur.answerName ?? null,
    });
    if (run.beat) run.bpm = nextBpm(run.bpm, correct);
    this.renderItems();
    const added = unlockedKeys(this.st.stats).filter((k) => !before.includes(k));
    return added.length ? ` · New: ${this.labels(added)}` : '';
  }

  labels(keys) {
    const strings = this.getStrings();
    const out = [...new Set(keys.map((k) => grip(ITEM[k], strings).label))];
    return out.length > 6 ? out.slice(0, 6).join(', ') + ` and ${out.length - 6} more` : out.join(', ');
  }

  // Where to show a played pitch: nearest the root of the grip.
  where(midi) {
    const strings = this.getStrings();
    const ref = this.cur.grip.root;
    let best = null;
    let bd = Infinity;
    strings.forEach((open, s) => {
      const f = midi - open;
      if (f < 0 || f > this.s.frets) return;
      const d = (s - ref.s) ** 2 + ((f - ref.f) / 2) ** 2;
      if (d < bd) { bd = d; best = { s, f }; }
    });
    return best;
  }

  feedback(kind, text) {
    const e = this.els;
    e.feedback.textContent = text;
    e.feedback.className = 'feedback ' + kind;
    burst(e.title, kind);
  }

  // reason: 'completed' | 'stopped' (Stop or Esc) | 'strum_stop' (three muted strums) | 'left' (another tab or a board setting changed)
  end(reason) {
    const run = this.run;
    if (!run || !this.running) return;
    this.clearTimers();
    clearTimeout(this.beatTimer);
    this.state = 'done';
    this.cur = null;
    const res = run.results;
    const ok = res.filter((r) => r.correct);
    const med = median(ok.map((r) => r.ms));
    this.onRun?.({ ...run.row, ended_at: Date.now(), end_reason: reason, prompts: res.length, correct: ok.length, median_ms: med == null ? null : Math.round(med), bpm_end: run.beat ? run.bpm : null });
    this.run = null;
    this.board.clearMarks();
    this.board.zoomTo(null);
    this.showAnswerUi(false);
    const e = this.els;
    const added = unlockedKeys(this.st.stats).filter((k) => !run.unlockedAtStart.includes(k));
    const missed = [...new Set(res.filter((r) => !r.correct).map((r) => r.label))];
    e.title.textContent = reason === 'stopped' || reason === 'strum_stop' ? 'Stopped' : 'Done';
    e.sub.textContent = `${ok.length} of ${res.length} right · median ${fmt(med)} · due tomorrow: ${summary(this.st, Date.now()).dueTomorrow}` +
      (missed.length ? ` · missed: ${missed.join(', ')}` : '') +
      (added.length ? ` · new: ${this.labels(added)}` : '') +
      (run.beat ? ` · tempo ${run.bpmStart} → ${run.bpm} bpm` : '') + '. Press Start or Enter to go again.';
    e.steps.textContent = '';
    e.prog.textContent = '';
    e.timer.textContent = '';
    e.fill.style.width = '100%';
    this.updateButton();
    if (reason === 'left') this.reset();
    else this.showMenu();
  }

  // One row per shape, grouped by kind (open chords: one row per quality), a chip per root
  // coloured by its state; kinds with nothing open yet stay folded.
  renderItems() {
    const strings = this.getStrings();
    const task = this.task === 'name' ? 'chord-name' : 'chord';
    const open = new Set(unlockedKeys(this.st.stats));
    const now = Date.now();
    const count = { known: 0, learning: 0, new: 0, due: 0, locked: 0 };
    const rowName = (it) => {
      const sh = SHAPE[it.shapeId];
      const q = qName(it.q);
      if (it.kind === 'open') return q;
      if (it.kind === 'barre') return `${sh.id[0]} shape ${q}`;
      if (it.kind === 'power') return `${sh.id.startsWith('E') ? 'E' : 'A'} string${sh.id.endsWith('-2') ? ', 2 notes' : ''}`;
      if (it.kind === 'shell') return `${q}, root on ${sh.id[6]}`;
      return `${sh.set.split('').join('-')} ${q} ${['root pos.', '1st inv.', '2nd inv.'][sh.inv]}`;
    };
    const lines = KINDS.map(([kind, title]) => {
      const rows = new Map();
      let any = false;
      for (const it of ITEMS) {
        if (it.kind !== kind) continue;
        const state = open.has(it.key) ? chipState(this.st, it.key, [it.key], now, task) : 'locked';
        count[state]++;
        if (state !== 'locked') any = true;
        const name = rowName(it);
        const label = this.usable ? grip(it, strings).label : it.label;
        rows.set(name, (rows.get(name) || '') + `<span class="ch-chip ch-${state}" data-key="${it.key}" title="${state}">${label}</span>`);
      }
      // in a kind with open grips, rows still all locked are counted, not listed (72 triad rows)
      const all = [...rows];
      const shown = any ? all.filter(([, chips]) => /ch-(new|learning|known|due)"/.test(chips)) : all;
      const hidden = all.length - shown.length;
      const body = shown.map(([name, chips]) => `<li><span class="ch-row">${name}</span><span class="ch-chips">${chips}</span></li>`).join('') +
        (hidden ? `<li class="muted">${hidden} more shape${hidden === 1 ? '' : 's'}, all locked</li>` : '');
      return `<details class="ch-kind"${any ? ' open' : ''}><summary>${title}</summary><ul class="chg ch-rows">${body}</ul></details>`;
    });
    this.els.items.innerHTML = lines.join('');
    this.els.counts.textContent = `${count.known} known · ${count.learning} learning · ${count.due} due · ${count.new} new · ${count.locked} locked`;
  }

  // Between runs: a chip's grip on the board with every degree, its name as the title.
  showGrip(key) {
    if (this.preview === key || !this.usable) return;
    this.preview = key;
    const item = ITEM[key];
    const g = grip(item, this.getStrings());
    this.board.clearMarks();
    for (const c of g.cells) this.board.mark(c.s, c.f, c === g.root ? 'ask' : 'cue', c.deg);
    this.board.zoomTo(g.cells);
    this.els.title.textContent = g.label;
    this.els.sub.textContent = `${describe(item)} · ${g.names.join(' ')}`;
  }

  simulate(midi) {
    this.onNote({ midi, t: performance.now() + this.s.latencyMs });
  }

  // A typed letter: Play takes the grip's note of that name still to play (else the one nearest
  // the bass); Name takes it as the root.
  simulatePc(pc) {
    const cur = this.cur;
    if (!cur) return;
    if (cur.task === 'chord-name') return this.pickName(pc, null);
    const m = cur.left.find((x) => pcOf(x) === pc);
    const b = cur.grip.bass;
    this.simulate(m ?? b + ((((pc - pcOf(b)) % 12) + 18) % 12) - 6);
  }

  onKey(e) {
    if (!this.isActive() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, select, textarea, button')) return;
    if (e.key === 'Enter' || (e.key === ' ' && e.target === document.body)) {
      if (!this.running) {
        e.preventDefault();
        this.primary();
      }
      return;
    }
    if (e.key === 'Escape' && this.running) return this.end('stopped');
    if (!this.running && /^[1-9]$/.test(e.key)) return this.menu.pick(+e.key - 1);
    const base = KEY_PC[e.key.toUpperCase()];
    if (e.key.length === 1 && base !== undefined && (this.state === 'await' || this.cur?.along)) this.simulatePc((base + (e.shiftKey ? 1 : 0)) % 12);
  }
}
