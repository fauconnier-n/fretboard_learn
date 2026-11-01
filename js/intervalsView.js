// @ts-check
// Intervals tab: a run of prompts from the unlocked interval items, played on the guitar
// (or clicked on the board / typed). Same flow as Practice: Start or Enter, green/red
// feedback, a time-out that shows the answer, Esc stops. Each graded prompt is logged
// with task 'interval'; each run gets a runs row.

import { ITEM, ITEMS, accuracy, addResult, buildStats, isReference, isRight, itemState, makePrompt, medianMs, pickItem, unlockedKeys } from './intervals.js';
import { midiLabel, pcOf } from './music.js';
import { GuitarMenu } from './guitarMenu.js';
import { burst } from './burst.js';

const TIMEOUT_MS = 8000;
const TRIAD_TIMEOUT_MS = 12000; // three notes to find
const NEXT_DELAY = 700;
const REVEAL_DELAY = 2200;
const MUTE_MS = 250; // the same pluck can be detected twice
const NO_ZONE = { type: null, sk: null, cs: null, cf: null, span: null, fretMin: null, fretMax: null };
const KEY_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const fmt = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s');

export class IntervalsView {
  // o: { board, els, getSettings, getStrings, isActive, loadRows, onAttempt, onRun, sound, ensureAudio }
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
    this.stats = new Map();
    this.state = 'idle'; // idle | await | feedback | done
    this.run = null;
    this.cur = null;
    this.timers = [];
    this.muteUntil = 0;
    this.board.onCellClick = (s, f) => this.simulate(this.getStrings()[s] + f);
    this.els.startBtn.onclick = () => this.primary();
    this.goPractice = o.goPractice;
    this.menu = new GuitarMenu(this.els.menu, this.getStrings, () => !!this.s.flats, () => !!this.s.lowAtBottom);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // Between runs: the next step on the open strings (low E starts a run).
  showMenu() {
    if (this.running) return this.menu.hide();
    this.menu.show('Next', [
      { label: 'Start a run', primary: true, act: () => this.primary() },
      { label: 'Note position practice', act: () => this.goPractice?.() },
    ]);
  }

  // A muted strum: during a run three in a row stop it; between runs this menu has nothing to go
  // back to, so strums do nothing.
  onStrum(n) {
    if (this.running && n >= 3) this.end('strum_stop');
  }

  get s() {
    return this.getSettings();
  }

  get running() {
    return this.state === 'await' || this.state === 'feedback';
  }

  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    cancelAnimationFrame(this.raf);
  }

  // The tab was opened: per-item stats from the answer log.
  async open() {
    this.stats = buildStats(await this.loadRows());
    this.renderItems();
    if (!this.running) this.reset();
  }

  reset() {
    this.clearTimers();
    // the tab can be opened before the board settings are applied at start-up
    if (this.board.layers) {
      this.board.setZone(null);
      this.board.clearMarks();
    }
    const e = this.els;
    e.title.textContent = 'Intervals';
    e.sub.textContent = 'A root is marked on the board; play the note asked. Press Start or Enter.';
    e.steps.textContent = '';
    e.timer.textContent = '';
    e.progress.textContent = '';
    e.fill.style.width = '0%';
    e.feedback.textContent = '';
    e.feedback.className = 'feedback';
    this.state = 'idle';
    this.updateButton();
    this.showMenu();
  }

  updateButton() {
    const b = this.els.startBtn;
    b.textContent = this.running ? 'Stop' : 'Start ⏎';
    b.classList.toggle('danger', this.running);
    document.body.classList.toggle('in-run', this.running);
  }

  primary() {
    if (this.running) return this.end('stopped');
    this.ensureAudio?.();
    this.start();
  }

  // The view is left or the board changed.
  leave() {
    if (this.running) this.end('left');
    this.clearTimers();
  }

  start() {
    const s = this.s;
    this.run = { id: Date.now().toString(36), total: s.runCount, results: [], prev: null, unlockedAtStart: unlockedKeys(this.stats) };
    this.run.row = {
      run_id: this.run.id, started_at: Date.now(), ended_at: null, end_reason: null,
      tuning: s.tuningLabel, instrument: s.instrument, strings: this.getStrings().join(','), mode: 'count', run_count: s.runCount, timeout_sec: TIMEOUT_MS / 1000, task: 'interval',
      zone_type: null, zone_strings: null, zone_cs: null, zone_cf: null, zone_span: null, zone_fret_min: null, zone_fret_max: null, zone_label: null,
    };
    this.onRun?.(this.run.row);
    this.state = 'feedback';
    this.updateButton();
    this.menu.hide();
    this.next();
  }

  next() {
    this.clearTimers();
    this.board.clearMarks();
    const run = this.run;
    if (!run) return;
    if (run.results.length >= run.total) return this.end('completed');
    const strings = this.getStrings();
    const keys = unlockedKeys(this.stats);
    let p = null;
    // an item can have no root on a short neck or odd tuning: try the others
    for (let i = 0; i < 20 && !p; i++) {
      const key = pickItem(keys, this.stats, run.prev?.key);
      p = makePrompt(ITEM[key], strings, this.s.frets, run.prev, Math.random, this.s.flats);
    }
    if (!p) return this.end('completed');
    this.cur = { p, step: 0, shownAt: performance.now(), wrong: [], graded: false };
    run.prev = p;
    this.state = 'await';
    const e = this.els;
    e.title.textContent = p.title;
    e.title.classList.remove('pop');
    void e.title.offsetWidth;
    e.title.classList.add('pop');
    e.sub.textContent = p.sub;
    e.feedback.textContent = '';
    e.feedback.className = 'feedback';
    e.progress.textContent = `${run.results.length + 1} / ${run.total}`;
    e.fill.style.width = (100 * run.results.length) / run.total + '%';
    if (p.root) this.board.mark(p.root.s, p.root.f, 'ask', p.rootName);
    this.renderSteps();
    this.later(() => this.timeout(), p.type === 'triad' ? TRIAD_TIMEOUT_MS : TIMEOUT_MS);
    this.tick();
  }

  // Triads: one dot per note, filled as each is played right.
  renderSteps() {
    const { p, step } = this.cur;
    this.els.steps.innerHTML = p.type === 'triad'
      ? ['root', '3rd', '5th'].map((n, i) => `<span class="${i < step ? 'done' : ''}">${i < step ? p.names[i] : n}</span>`).join('')
      : '';
  }

  // the answer timer, written only when its text changes (a write per frame cost a layout per frame)
  tick() {
    if (this.state !== 'await' || !this.cur) return;
    const text = ((performance.now() - this.cur.shownAt) / 1000).toFixed(1) + ' s';
    if (this.els.timer.textContent !== text) this.els.timer.textContent = text;
    this.raf = requestAnimationFrame(() => this.tick());
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
    if (this.state !== 'await' || !cur || ev.t < cur.shownAt || ev.t < this.muteUntil) return;
    const { p } = cur;
    const ms = Math.max(0, ev.t - cur.shownAt - this.s.latencyMs);
    this.muteUntil = performance.now() + MUTE_MS;
    if (isRight(p, ev.midi, cur.step)) {
      const pos = p.type === 'degree' ? this.where(ev.midi, p.cells) : p.cells[cur.step];
      if (pos) this.board.vibrate(pos.s, pos.f, ev.freq || 440 * 2 ** ((ev.midi - 69) / 12));
      if (pos) this.board.flash(pos.s, pos.f, 'good', p.names[p.type === 'triad' ? cur.step : 0]);
      cur.step++;
      this.renderSteps();
      if (p.type === 'triad' && cur.step < 3) {
        this.sound?.('good');
        this.els.feedback.textContent = `✓ ${p.names[cur.step - 1]}`;
        this.els.feedback.className = 'feedback good';
        return;
      }
      const news = this.grade(true, ms, ev.midi);
      this.feedback('good', `✓ ${p.type === 'triad' ? p.names.join(' ') : p.names[0]} · ${(ms / 1000).toFixed(2)} s${news}`);
      this.sound?.('good');
      this.state = 'feedback';
      this.clearTimers();
      this.later(() => this.next(), news ? REVEAL_DELAY : NEXT_DELAY);
      return;
    }
    if (isReference(p, ev.midi, cur.step)) return;
    cur.wrong.push({ midi: ev.midi, ms });
    const pos = this.where(ev.midi, p.cells);
    if (pos) this.board.vibrate(pos.s, pos.f, ev.freq || 440 * 2 ** ((ev.midi - 69) / 12));
    if (pos) this.board.flash(pos.s, pos.f, 'bad', midiLabel(ev.midi, this.s.flats).replace(/\d+$/, ''));
    this.sound?.('bad');
    this.miss(ms, ev.midi, `✗ You played ${midiLabel(ev.midi, this.s.flats)}`);
  }

  timeout() {
    if (this.state !== 'await' || !this.cur) return;
    this.miss(performance.now() - this.cur.shownAt, null, '⏱ Here it is');
  }

  // A miss ends the prompt: show where the answer was, then move on.
  miss(ms, played, text) {
    const { p } = this.cur;
    this.feedback('bad', text + this.grade(false, ms, played));
    for (let i = 0; i < p.cells.length; i++) this.board.reveal(p.cells[i].s, p.cells[i].f, p.type === 'degree' ? p.names[0] : p.names[i]);
    if (p.type !== 'degree') this.els.sub.textContent = `The answer: ${p.names.join(' ')}.`;
    this.state = 'feedback';
    this.clearTimers();
    this.later(() => this.next(), REVEAL_DELAY);
  }

  grade(correct, ms, played) {
    const { cur, run } = this;
    if (cur.graded) return '';
    cur.graded = true;
    const { p } = cur;
    const before = unlockedKeys(this.stats);
    addResult(this.stats, p.key, correct, ms);
    run.results.push({ key: p.key, correct, ms });
    this.onAttempt({
      t: Date.now(), runId: run.id, tuning: this.s.tuningLabel, instrument: this.s.instrument, strings: this.getStrings().join(','), desc: NO_ZONE,
      s: p.root?.s ?? null, f: p.root?.f ?? null, target: p.targets[0] ?? null, played, correct, ms: Math.round(ms), g: null, review: false,
      solveMs: correct ? Math.round(ms) : null, wrongCount: cur.wrong.length,
      wrongNotes: cur.wrong.map((w) => w.midi).join(',') || null, wrongMs: cur.wrong.map((w) => Math.round(w.ms)).join(',') || null,
      showMe: false, task: 'interval', interval: p.key,
    });
    this.renderItems();
    const added = unlockedKeys(this.stats).filter((k) => !before.includes(k));
    return added.length ? ` · New: ${added.map((k) => ITEM[k].label).join(', ')}` : '';
  }

  // Where to show a played pitch: an expected cell if it is one, else nearest the root.
  where(midi, cells) {
    const strings = this.getStrings();
    const hit = cells.find((c) => strings[c.s] + c.f === midi);
    if (hit) return hit;
    const ref = this.cur.p.root || cells[0] || { s: 0, f: 0 };
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
    this.state = 'done';
    this.cur = null;
    const res = run.results;
    const ok = res.filter((r) => r.correct);
    const times = ok.map((r) => r.ms).sort((a, b) => a - b);
    const med = times.length ? Math.round(times[times.length >> 1]) : null;
    this.onRun?.({ ...run.row, ended_at: Date.now(), end_reason: reason, prompts: res.length, correct: ok.length, median_ms: med });
    this.run = null;
    this.board.clearMarks();
    const e = this.els;
    const added = unlockedKeys(this.stats).filter((k) => !run.unlockedAtStart.includes(k));
    e.title.textContent = reason === 'stopped' || reason === 'strum_stop' ? 'Stopped' : 'Done';
    e.sub.textContent = `${ok.length} of ${res.length} right · median ${fmt(med)}.` +
      (added.length ? ` New this run: ${added.map((k) => ITEM[k].label).join(', ')}.` : '') + ' Press Start or Enter to go again.';
    e.steps.textContent = '';
    e.timer.textContent = '';
    e.fill.style.width = '100%';
    this.updateButton();
    if (reason === 'left') this.reset();
    else this.showMenu();
  }

  renderItems() {
    const unlocked = unlockedKeys(this.stats);
    this.els.items.innerHTML = ITEMS.map((it) => {
      const st = this.stats.get(it.key);
      const state = itemState(this.stats, it.key, unlocked);
      const info = state === 'locked' ? 'locked'
        : !st ? 'new'
          : `${Math.round(accuracy(st) * 100)}% · ${st.n} answer${st.n === 1 ? '' : 's'} · ${fmt(medianMs(st))}${state === 'known' ? ' · known' : ''}`;
      return `<li class="iv-${state}" data-item="${it.key}"><span>${it.label}</span><span class="muted">${info}</span></li>`;
    }).join('');
  }

  simulate(midi) {
    this.onNote({ midi, t: performance.now() + this.s.latencyMs });
  }

  // A typed letter: the note with that name closest to the answer (any octave for degrees).
  simulatePc(pc) {
    const p = this.cur?.p;
    if (!p) return;
    const ref = p.type === 'degree' ? this.getStrings()[0] + 12 : p.targets[Math.min(this.cur.step, p.targets.length - 1)];
    this.simulate(ref + ((((pc - pcOf(ref)) % 12) + 18) % 12) - 6);
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
    if (!this.running && /^[1-6]$/.test(e.key)) return this.menu.pick(+e.key - 1);
    const base = KEY_PC[e.key.toUpperCase()];
    if (e.key.length === 1 && base !== undefined && this.state === 'await') this.simulatePc((base + (e.shiftKey ? 1 : 0)) % 12);
  }
}
