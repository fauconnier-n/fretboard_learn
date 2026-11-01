// One run = one zone, N prompts (or a timed sprint).
// Flow: New run picks a zone and shows it with its natural notes (preview); Start run
// begins the prompts; the run ends when done, when time is up, or when stopped.
// Grades the first attempt of each prompt and hands it to the scheduler. Each prompt
// is logged once it closes, with the time to the right note, every wrong note played
// and the prompt before it. Each run is logged too, when it starts and when it ends.

import { isAccidental, midiLabel, noteName, pcOf, positionsOf, spellName, stringName } from './music.js';
import { describe, zoneLabel } from './zones.js';
import { LANDMARKS, cueOpts, errorType, itemKey } from './srs.js';
import { describeCues, initialCues, labelOf } from './cues.js';
import { GuitarMenu } from './guitarMenu.js';
import { mapCell } from './stats.js';
import { burst } from './burst.js';

const DAY = 86400000;
const PROBE_EVERY = 10; // every 10th prompt is a random check-up, not picked by the model
const ERROR_TEXT = {
  octave: 'right name, wrong octave',
  semitone_sharp: 'one fret too high',
  semitone_flat: 'one fret too low',
  tone_sharp: 'two frets too high',
  tone_flat: 'two frets too low',
};
// note names for "Name the note": both spellings of an accidental are right
const NAME_LABELS = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
const NATURALS = [0, 2, 4, 5, 7, 9, 11];

const NEXT_DELAY = 550;
const NEXT_DELAY_AFTER_MISS = 900;
const REVEAL_DELAY = 1500;
// The answer is shown after REVEAL_FACTOR × the expected time for that note, kept
// within REVEAL_MIN..REVEAL_MAX ms (and never after the time-out setting).
const REVEAL_FACTOR = 2.5;
const REVEAL_MIN = 4000;
const REVEAL_MAX = 8000;
const QUEUE_AHEAD = 4; // upcoming prompts picked in advance (shown only if the setting is on)
const RETEST_MIN = 3; // a missed note comes back after 3–8 other prompts
const RETEST_MAX = 8;
const PLAYALONG_MS = 6000; // after a miss, the ungraded play-along is skipped after this long
const SPECIAL_MIN_RUN = 6; // prompts runs at least this long get a boss and a closing note
const GOLDEN_RATE = 0.07; // chance that an ordinary prompt becomes a golden one
// beat mode: a prompt lasts BEATS beats; the tempo rises after a right answer, falls after a miss
const BEATS = 4;
const BPM_UP = 1.03;
const BPM_DOWN = 0.93;
const BPM_MIN = 40;
const BPM_MAX = 220;
const SPECIAL_TEXT = { boss: 'Boss note: the hardest one in this zone', finale: 'Last one', golden: '★ Golden note: one you have been missing' };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const hz = (ev) => ev.freq || 440 * 2 ** ((ev.midi - 69) / 12); // typed or clicked notes have no measured frequency
// runs without the guitar: name the marked position, or say whether the name shown is right
const noGuitar = (task) => task === 'name' || task === 'truefalse';
const itemTask = (task) => (noGuitar(task) ? 'name' : 'play'); // both no-guitar tasks train the position → name card
const spellFor = (cell, task) => (noGuitar(task) ? 'r' : isAccidental(cell.pc) ? (Math.random() < 0.5 ? 's' : 'f') : 'n');
// run types: [value, label]; the guitar ones first
export const RUN_TYPES = [
  ['play', 'Play the note (guitar)'],
  ['confusions', 'Mix-ups (guitar)'],
  ['name', 'Name the note (buttons)'],
  ['truefalse', 'True or false (buttons)'],
];
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

const write = (el, text) => { if (el.textContent !== text) el.textContent = text; };

export class Quiz {
  // o: { board, els, getSettings, getScheduler, getZones, getStrings, isActive, onAttempt, onRun, onSave, onRunEnd, sound }
  constructor(o) {
    Object.assign(this, o);
    this.run = null;
    this.cur = null;
    this.state = 'idle'; // idle | preview | await | feedback | done
    this.timers = [];
    this.muteUntil = 0;
    this.raf = 0;
    this.cueMarks = new Map(); // cell key -> label mark on the board for the current prompt
    this.board.onCellClick = (s, f) => this.simulate(this.getStrings()[s] + f);
    this.els.showMe.onclick = () => this.giveUp('show');
    this.els.names.onclick = (e) => {
      const b = e.target.closest('[data-pc]');
      if (b) this.answerName(+b.dataset.pc, b.textContent);
    };
    this.els.tf.onclick = (e) => {
      const b = e.target.closest('[data-tf]');
      if (b) this.answerTF(b.dataset.tf === 'yes');
    };
    this.menu = new GuitarMenu(this.els.menu, this.getStrings, () => !!this.s.flats, () => !!this.s.lowAtBottom);
    this.menuSub = null;
    window.addEventListener('keydown', (e) => this.onKey(e));
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
  }

  // The main button: New run → Start run → Stop run.
  primary() {
    if (this.state === 'preview') this.begin();
    else if (this.running) this.end('stopped');
    else this.prepare();
  }

  // "Name the note": a name with sharps or with flats, as set in Settings
  nameOf(pc) {
    const [sharp, flat = sharp] = NAME_LABELS[pc].split('/');
    return this.s.nameAccidentals === 'flats' ? flat : sharp;
  }

  // the name buttons, laid out like a piano: naturals along the bottom, each sharp or flat
  // above, centred between its two neighbours (a grid of half-button columns)
  renderNames() {
    this.els.names.innerHTML = NAME_LABELS.map((_, pc) => {
      const i = NATURALS.indexOf(pc);
      const at = i >= 0 ? `2 / ${2 * i + 1}` : `1 / ${2 * NATURALS.indexOf(pc - 1) + 2}`;
      return `<button class="btn small" data-pc="${pc}" style="grid-area: ${at} / span 1 / span 2">${this.nameOf(pc)}</button>`;
    }).join('');
  }

  updateButton() {
    const b = this.els.startBtn;
    b.textContent = this.state === 'preview' ? 'Start run ⏎' : this.running ? 'Stop run' : 'New run ⏎';
    b.classList.toggle('danger', this.running);
    document.body.classList.toggle('in-run', this.running);
    this.board.zoomTo(this.running ? this.run.zone.cells : null);
  }

  reset() {
    this.leave();
    this.board.setZone(null);
    this.board.clearMarks();
    const e = this.els;
    e.note.textContent = '—';
    e.sub.textContent = this.idleText();
    e.names.classList.add('hidden');
    e.tf.classList.add('hidden');
    e.zone.textContent = '';
    e.progress.textContent = '';
    e.timer.textContent = '';
    e.queue.innerHTML = '';
    e.fill.style.width = '0%';
    e.feedback.textContent = '';
    e.summary.classList.add('hidden');
    e.neckLegend.classList.add('hidden');
    this.state = 'idle';
    this.updateButton();
    this.paintProgress();
    this.showMenu();
  }

  // Practice board between runs: the knowledge map (clouds and note names, as on the Stats
  // page), positions not unlocked yet under fog.
  paintProgress() {
    const sch = this.getScheduler();
    if (!sch || !this.board.layers) return;
    // during a run the board shows only the run: no knowledge colours
    if (this.running) return this.board.setHeat(() => null);
    // a finished run: its notes on the neck, with their progress rings
    if (this.state === 'done' && this.run) return this.board.setHeat(this.runResultsCell(sch));
    const snap = sch.snapshot();
    this.board.setHeat((s, f) => mapCell(sch, snap, s, f, this.s.flats) || { fog: true });
  }

  // Text before a run: welcome back after a gap (neutral, no streak lost), what is due,
  // and your practice plan if you wrote one.
  idleText() {
    const sch = this.getScheduler();
    const parts = [];
    const last = sch?.model.meta.recent.at(-1)?.t;
    if (last && Date.now() - last > 2 * DAY) parts.push('Welcome back. Notes you have not played for a while come first.');
    const due = sch ? sch.dueKeys().length : 0;
    if (due) parts.push(`${due} note${due === 1 ? ' is' : 's are'} fading and due for review.`);
    if (this.s.plan) parts.push(`Your plan: ${this.s.plan}`);
    parts.push('Press New run to see the next zone.');
    return parts.join(' ');
  }

  // Called when the practice view is left or the board changes: a running run ends as 'left'.
  leave() {
    if (this.running) this.end('left', false);
    else if (this.state === 'preview') {
      this.state = 'idle';
      this.run = null;
    }
    this.clearTimers();
    clearTimeout(this.beatTimer);
    cancelAnimationFrame(this.raf);
  }

  // Pick the zone and show it, with its natural notes as a reminder, plus up to two other
  // zones to choose from on the open-string menu. `chosen` is one of those offers.
  prepare(chosen = null) {
    this.leave();
    const sch = this.getScheduler();
    if (!sch) return; // the board is still loading
    const s = this.s;
    const focus = s.runTask === 'confusions' ? 'confusions' : null;
    if (!chosen) {
      const pick = sch.pickZone(this.getZones(), Date.now(), focus);
      if (!pick) return;
      this.offers = [pick, ...pick.alternatives];
      chosen = pick;
    }
    const pick = chosen;
    const { zone } = pick;
    this.run = {
      id: Date.now().toString(36),
      zone,
      desc: describe(zone),
      review: pick.review,
      predicted: pick.predicted,
      due: pick.due,
      task: noGuitar(s.runTask) ? s.runTask : 'play',
      focus: pick.focus,
      mixups: pick.focus ? sch.confusionCells(zone) : null,
      label: zoneLabel(zone, this.getStrings(), s.flats),
      asked: [],
      counts: {},
      failed: new Set(),
      queue: [],
      prev: null,
      results: [],
    };
    this.state = 'preview';
    this.board.setZone(zone.cells);
    this.board.clearMarks();
    for (const c of zone.cells) if (!isAccidental(c.pc)) this.board.mark(c.s, c.f, 'hint', spellName(c.midi, 'n'));
    const e = this.els;
    e.zone.textContent = this.run.label + (pick.review ? ' · review of fading notes' : '') +
      (pick.focus ? ' · your mix-ups' : focus ? ' · no mix-ups recorded yet, a usual run' : '');
    e.names.classList.add('hidden');
    e.tf.classList.add('hidden');
    e.summary.classList.add('hidden');
    e.neckLegend.classList.add('hidden');
    e.feedback.textContent = '';
    e.feedback.className = 'feedback';
    e.note.textContent = 'Ready?';
    e.sub.textContent = 'This is the zone. The natural notes are shown as a reminder' +
      (noGuitar(s.runTask) || s.cueMode === 'off' ? '; they hide when the run starts.' : '; during the run, names show according to your Note names setting.') +
      ' Press Start run or Enter.';
    e.timer.textContent = '';
    e.queue.innerHTML = '';
    e.progress.textContent = s.runMode === 'count' ? `${s.runCount} prompts` : `${s.sprintSec} s sprint`;
    e.fill.style.width = '0%';
    this.paintProgress();
    this.updateButton();
    this.showMenu();
  }

  begin() {
    const run = this.run;
    if (!run || this.state !== 'preview') return;
    const s = this.s;
    const sch = this.getScheduler();
    const now = performance.now();
    Object.assign(run, {
      mode: s.runMode,
      total: s.runMode === 'count' ? s.runCount : Infinity,
      startedAt: now,
      endsAt: s.runMode === 'sprint' ? now + s.sprintSec * 1000 : 0,
      usualMs: Math.exp(sch.globalMu()), // your typical answer time before this run
      cueMode: noGuitar(run.task) ? 'off' : s.cueMode || 'off',
      streak: 0, // fast right answers in a row, for the glow
      goldenLeft: s.runMode === 'count' ? Math.max(1, Math.floor(s.runCount / 12)) : 2,
      beat: !!s.beat,
      // beat mode starts with a prompt lasting about 2.5× your usual time
      bpm: clamp(Math.round((60000 * BEATS) / (2.5 * Math.exp(sch.globalMu()))), 50, 160),
      // each item's expected time before the run, to say afterwards what got faster
      beforeMs: new Map(run.zone.cells.flatMap((c) => ['n', 's', 'f', 'r'].map((sp) => {
        const key = itemKey(c.key, sp);
        return [key, sch.model.cards[key] ? sch.expectedMs(key) : null];
      }))),
    });
    // cells that carry a name label; in "fade" mode it changes during the run
    run.labelled = initialCues(run.cueMode, run.zone, sch, run.desc, Date.now());
    run.row = {
      cue_mode: run.cueMode,
      run_id: run.id, started_at: Date.now(), ended_at: null, end_reason: null,
      tuning: s.tuningLabel, instrument: s.instrument, strings: this.getStrings().join(','), mode: run.mode,
      run_count: run.mode === 'count' ? s.runCount : null,
      sprint_sec: run.mode === 'sprint' ? s.sprintSec : null,
      zone_type: run.desc.type, zone_strings: run.desc.sk, zone_cs: run.desc.cs, zone_cf: run.desc.cf,
      zone_span: run.desc.span, zone_fret_min: run.desc.fretMin, zone_fret_max: run.desc.fretMax, zone_label: run.label,
      review: !!run.review, predicted: run.predicted, target: sch.model.meta.target,
      retry: !!s.retry, timeout_sec: s.timeoutSec, task: run.task, due_at_start: run.due ?? null,
      focus: run.focus, bpm_start: run.beat ? run.bpm : null,
    };
    this.onRun?.(run.row);
    this.board.clearMarks();
    this.menu.hide();
    this.els.area.style.setProperty('--glow', '0');
    this.state = 'feedback';
    this.updateButton();
    this.ring();
    this.paintProgress();
    this.tick();
    if (run.beat) this.startBeat();
    this.next();
  }

  // Beat mode: a click on every beat; prompts appear on a beat.
  startBeat() {
    const run = this.run;
    run.beatAt = performance.now();
    const beat = () => {
      if (this.run !== run || !this.running) return;
      this.sound?.('tick');
      run.beatAt += 60000 / run.bpm;
      this.beatTimer = setTimeout(beat, Math.max(0, run.beatAt - performance.now()));
    };
    beat();
  }

  // Wait at least `ms`, then until the next beat in beat mode.
  advance(ms) {
    this.state = 'feedback';
    this.clearTimers();
    const run = this.run;
    let wait = ms;
    if (run?.beat) {
      const now = performance.now();
      let t = run.beatAt;
      while (t - now < ms) t += 60000 / run.bpm;
      wait = t - now;
    }
    this.later(() => this.next(), wait);
  }

  // Live first-try accuracy ring next to the run progress.
  ring() {
    const res = this.run?.results || [];
    const acc = res.length ? res.filter((r) => r.correct).length / res.length : 0;
    const C = 2 * Math.PI * 15;
    this.els.ring.innerHTML = `<circle cx="18" cy="18" r="15" class="ring-bg"/>` +
      `<circle cx="18" cy="18" r="15" class="ring-fg" stroke-dasharray="${(acc * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 18 18)"/>` +
      `<text x="18" y="22" class="ring-txt">${res.length ? Math.round(acc * 100) : '–'}</text>`;
    this.els.ring.classList.toggle('hidden', !this.running);
    this.els.ring.setAttribute('aria-label', res.length ? `${Math.round(acc * 100)}% right first time` : 'No answers yet');
  }

  // Keep the next prompts picked in advance, so they can be shown.
  fillQueue() {
    const run = this.run;
    const sch = this.getScheduler();
    const left = run.total - run.results.length;
    while (run.queue.length < Math.min(QUEUE_AHEAD + 1, left)) {
      const n = run.results.length + run.queue.length + 1; // prompt number in the run
      const task = run.task;
      let p;
      // a prompts run closes with its boss (hardest note) then a note you know, so it ends on a
      // success; both are queued together so a re-test can't take the closing slot
      if (run.total >= SPECIAL_MIN_RUN && left - run.queue.length === 2) {
        const ranked = sch.zoneChances(run.zone, itemTask(task)).filter((x) => x.cell.key !== (run.queue.at(-1)?.cell.key ?? run.asked.at(-1))).sort((a, b) => a.p - b.p);
        const known = ranked.filter((x) => x.seen);
        const boss = known[0] || ranked[0];
        const finale = [...known].reverse().find((x) => x !== boss) || ranked.at(-1);
        for (const [x, special] of [[boss, 'boss'], [finale, 'finale']]) {
          run.asked.push(x.cell.key);
          run.counts[x.cell.key] = (run.counts[x.cell.key] || 0) + 1;
          run.queue.push({ cell: x.cell, sp: spellFor(x.cell, task), task, special });
        }
        continue;
      } else if (n % PROBE_EVERY === 0) {
        // check-up: any position of the zone, so its success rate is not shaped by the model
        const cell = run.zone.cells[Math.floor(Math.random() * run.zone.cells.length)];
        p = { cell, sp: spellFor(cell, task), probe: true };
      } else {
        // golden: now and then, a note you have been missing, with a special effect when right
        const missed = run.goldenLeft > 0 && Math.random() < GOLDEN_RATE
          ? sch.zoneChances(run.zone, itemTask(task)).filter((x) => x.lapses > 0 && x.p < 0.7 && x.cell.key !== run.asked.at(-1)).sort((a, b) => a.p - b.p)[0]
          : null;
        if (missed) {
          run.goldenLeft--;
          p = { cell: missed.cell, sp: spellFor(missed.cell, task), special: 'golden' };
        } else p = sch.pickPrompt(run.zone, run, itemTask(task));
      }
      p.task = task;
      run.asked.push(p.cell.key);
      run.counts[p.cell.key] = (run.counts[p.cell.key] || 0) + 1;
      run.queue.push(p);
    }
  }

  next() {
    this.closePrompt();
    this.clearTimers();
    this.board.clearMarks();
    const run = this.run;
    if (!run) return;
    if (run.results.length >= run.total) return this.end('completed');
    if (run.endsAt && performance.now() >= run.endsAt) return this.end('time_up');
    this.fillQueue();
    let { cell, sp, retest, probe, task, special } = run.queue.shift();
    if (special === 'finale' && run.failed.has(cell.key)) {
      // missed during this run: close on the best-known note you have not missed instead
      const x = this.getScheduler().zoneChances(run.zone, itemTask(task)).filter((y) => !run.failed.has(y.cell.key) && y.cell.key !== run.asked.at(-1)).sort((a, b) => b.p - a.p)[0];
      if (x) {
        cell = x.cell;
        sp = spellFor(cell, task);
      }
    }
    const s = this.s;
    const naming = task === 'name';
    const tf = task === 'truefalse';
    const expected = this.getScheduler().expectedMs(itemKey(cell.key, sp));
    const reveal = run.beat ? (BEATS * 60000) / run.bpm : Math.min(REVEAL_MAX, Math.max(REVEAL_MIN, REVEAL_FACTOR * expected));
    const giveUpAfter = Math.min(s.timeoutSec * 1000, reveal);
    this.cur = {
      cell, sp, task, special: special || null, retest: !!retest, probe: !!probe, queueShown: !!s.showQueue && run.task === 'play', shownAt: performance.now(),
      expected, bpm: run.beat ? run.bpm : null,
      attempts: 0, graded: false, revealed: false, wrong: [], solvedMs: null, log: null, prev: run.prev,
    };
    run.prev = { cell, sp };
    // name prompts never show labels: they would give the answer away
    this.showCues(cell, !!retest, !!probe || noGuitar(task));
    if (tf) this.cur.shown = this.tfName(cell);
    this.state = 'await';
    const e = this.els;
    e.note.textContent = naming ? '?' : tf ? this.cur.shown.name + '?' : spellName(cell.midi, sp);
    e.note.className = 'prompt-note' + (special ? ' ' + special : '');
    void e.note.offsetWidth;
    e.note.classList.add('pop');
    if (noGuitar(task)) this.board.mark(cell.s, cell.f, 'ask', tf ? this.cur.shown.name : '?');
    if (naming) this.renderNames();
    e.names.classList.toggle('hidden', !naming);
    e.tf.classList.toggle('hidden', !tf);
    e.sub.textContent = (special ? SPECIAL_TEXT[special] + ' · ' : '') + (retest ? 'Again — you missed this one a moment ago'
      : naming ? 'Name the marked note: type its letter (Shift = sharp) or click it below'
        : tf ? `Is the marked note ${this.cur.shown.name}? Yes (Y or →) or No (N or ←)`
        : 'Play it inside the zone');
    e.queue.innerHTML = s.showQueue && run.task === 'play' ? run.queue.slice(0, QUEUE_AHEAD).map((q, i) =>
      `<span style="opacity:${1 - i * 0.18}">${spellName(q.cell.midi, q.sp)}</span>`).join('') : '';
    e.showMe.classList.remove('invisible');
    if (Number.isFinite(run.total)) e.progress.textContent = `${run.results.length + 1} / ${run.total}`;
    this.later(() => this.giveUp('time'), giveUpAfter);
  }

  // Put the name labels on the board for this prompt and remember what was shown. Check-ups
  // show none, and a re-test hides the asked note's own label (the answer was just shown).
  showCues(cell, retest, probe) {
    const run = this.run;
    this.cueMarks.clear();
    const shown = probe ? [] : run.zone.cells.filter((c) => run.labelled.has(c.key) && !(retest && c.key === cell.key));
    for (const c of shown) this.cueMarks.set(c.key, this.board.mark(c.s, c.f, 'cue', labelOf(c)));
    this.cur.cue = describeCues(cell, shown);
  }

  // The asked note's own label gives way to the answer or the reveal.
  dropCue(cell) {
    this.cueMarks.get(cell.key)?.remove();
  }

  // No right answer in time, or "Show me": a miss. Show where the note is.
  giveUp(kind) {
    const cur = this.cur;
    if (!cur || this.state !== 'await' || cur.graded) return;
    const ms = Math.max(0, performance.now() - cur.shownAt);
    this.grade(false, ms, null, { showMe: kind === 'show' });
    this.feedback('bad', kind === 'show' ? 'Here it is' : '⏱ Here it is');
    this.missed();
  }

  // After the first miss of a prompt: show the answer with a structural hint, queue a
  // re-test a few prompts later, then either wait for one ungraded play-along or move on.
  missed() {
    const cur = this.cur;
    const naming = cur.task === 'name';
    this.els.showMe.classList.add('invisible');
    this.reveal();
    this.scheduleRetest(cur);
    const hint = this.getScheduler().positionMastered(cur.cell) ? '' : this.structuralHint(cur.cell);
    // beat mode keeps the beat going: no waiting for a play-along
    if (this.s.retry && !this.run.beat && cur.task !== 'truefalse') {
      this.els.sub.textContent = (hint ? hint + ' ' : '') +
        (naming ? 'Type or click its name once (not graded).' : 'Play it once where it is shown (not graded).') +
        ' It comes back in a few prompts.';
      this.clearTimers();
      this.later(() => this.cur === cur && this.state === 'await' && this.advance(0), PLAYALONG_MS);
    } else {
      if (hint) this.els.sub.textContent = hint;
      this.advance(REVEAL_DELAY);
    }
  }

  // A way to work the note out from the neck's structure: a nearby landmark fret on the
  // same string, and the same note through an octave shape two strings away. Shown after
  // a miss until the position is mastered, so the "algorithm" fades into direct recall.
  structuralHint(cell) {
    const strings = this.getStrings();
    // a "Name the note" prompt (sp 'r') spells its hint like the buttons
    const flats = this.cur?.sp === 'f' || (this.cur?.sp === 'r' && this.s.nameAccidentals === 'flats');
    const name = (m) => noteName(m, flats);
    const str = (s) => `${stringName(strings, s, this.s.flats)} string`;
    const out = [];
    const lm = LANDMARKS.filter((f) => f <= this.s.frets).sort((a, b) => Math.abs(a - cell.f) - Math.abs(b - cell.f))[0];
    if (lm !== undefined && lm !== cell.f && Math.abs(lm - cell.f) <= 2) {
      const d = cell.f - lm;
      out.push(`Fret ${cell.f} is ${Math.abs(d)} fret${Math.abs(d) > 1 ? 's' : ''} ${d > 0 ? 'above' : 'below'} the ${lm === 0 ? 'open string' : `fret-${lm} marker`} (${name(strings[cell.s] + lm)}).`);
    }
    for (const ds of [-2, 2]) {
      const t = cell.s + ds;
      if (t < 0 || t >= strings.length) continue;
      const fs = [];
      for (let f = Math.max(0, cell.f - 4); f <= Math.min(this.s.frets, cell.f + 4); f++) if (pcOf(strings[t] + f) === cell.pc) fs.push(f);
      if (!fs.length) continue;
      const f = fs.sort((a, b) => Math.abs(a - cell.f) - Math.abs(b - cell.f))[0];
      const lower = ds < 0;
      out.push(`Octave shape: ${name(cell.midi)} is also on the ${str(t)}, fret ${f} (${lower ? 'two strings lower' : 'two strings higher'}${this.crossesB(cell.s, t) ? ', the shape shifts one fret where it crosses the B string' : ''}).`);
      break;
    }
    return out.join(' ');
  }

  // True when going from string a to string b crosses the major-third step (G→B in standard).
  crossesB(a, b) {
    const strings = this.getStrings();
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let s = lo; s < hi; s++) if (strings[s + 1] - strings[s] === 4) return true;
    return false;
  }

  // "Name the note": a pitch class from a key press or a button.
  answerName(pc, label) {
    const cur = this.cur;
    if (this.state !== 'await' || !cur || cur.task !== 'name') return;
    const ms = Math.max(0, performance.now() - cur.shownAt);
    const cell = cur.cell;
    if (pc === cell.pc) {
      if (!cur.graded) this.grade(true, ms, cell.midi, { answerName: label });
      cur.solvedMs = ms;
      this.closePrompt();
      this.els.showMe.classList.add('invisible');
      this.dropCue(cell);
      this.board.flash(cell.s, cell.f, cur.special === 'golden' ? 'golden' : 'good', this.nameOf(cell.pc));
      this.feedback('good', cur.revealed ? `✓ That's it — ${this.nameOf(cell.pc)}. It comes back in a few prompts.` : this.goodText(this.nameOf(cell.pc), ms));
      this.sound?.(cur.special === 'golden' ? 'golden' : 'good');
      this.advance(cur.attempts ? NEXT_DELAY_AFTER_MISS : NEXT_DELAY);
      return;
    }
    // as a pitch, the wrong name is the nearest note with that name
    const played = cell.midi + ((((pc - cell.pc) % 12) + 18) % 12) - 6;
    cur.attempts++;
    cur.wrong.push({ midi: played, ms });
    this.feedback('bad', `✗ Not ${label}${ERROR_TEXT[errorType(cell.midi, played)] ? ` (${ERROR_TEXT[errorType(cell.midi, played)].replace('fret', 'semitone').replace('frets', 'semitones')})` : ''}`);
    this.sound?.('bad');
    if (!cur.graded) {
      this.grade(false, ms, played, { answerName: label });
      this.missed();
    }
  }

  // True or false: the marked position with its real name half the time, otherwise a name
  // it is easy to mix it up with: one you have confused it with, or a semitone or tone away.
  tfName(cell) {
    const truth = Math.random() < 0.5;
    let pc = cell.pc;
    if (!truth) {
      const conf = [...this.getScheduler().confusedWith(cell)];
      const near = [1, -1, 2, -2].map((d) => (cell.pc + d + 12) % 12);
      const pool = conf.length && Math.random() < 0.6 ? conf : near;
      pc = pool[Math.floor(Math.random() * pool.length)];
    }
    return { pc, truth, name: noteName(pc, Math.random() < 0.5) };
  }

  answerTF(yes) {
    const cur = this.cur;
    if (this.state !== 'await' || !cur || cur.task !== 'truefalse' || cur.graded) return;
    const ms = Math.max(0, performance.now() - cur.shownAt);
    const { cell, shown } = cur;
    const right = NAME_LABELS[cell.pc];
    const correct = yes === shown.truth;
    this.grade(correct, ms, null, { answerName: yes ? 'yes' : 'no' });
    if (correct) {
      cur.solvedMs = ms;
      this.closePrompt();
      this.board.flash(cell.s, cell.f, cur.special === 'golden' ? 'golden' : 'good', right.split('/')[0]);
      this.feedback('good', this.goodText(shown.truth ? `Yes, it is ${right}` : `No, it is ${right}`, ms));
      this.sound?.(cur.special === 'golden' ? 'golden' : 'good');
      this.advance(NEXT_DELAY);
      return;
    }
    this.feedback('bad', shown.truth ? `✗ It is ${shown.name}` : `✗ Not ${shown.name}: it is ${right}`);
    this.sound?.('bad');
    this.missed();
  }

  // What comes next, answered on the open strings (or by clicking a row, or keys 1–6).
  // Low E carries the usual next step, which a muted strum also takes.
  showMenu(sub = null) {
    const s = this.s;
    const a = this.actions;
    if (this.running) return this.menu.hide();
    if (this.state === 'preview') {
      this.menuSub = null;
      return this.menu.show('Zone', this.offers.map((o) => ({
        label: zoneLabel(o.zone, this.getStrings(), s.flats), active: o.zone === this.run.zone, act: () => this.prepare(o),
      })), 'start the run');
    }
    this.menuSub = sub;
    if (sub === 'type') {
      return this.menu.show('Run type', [
        ...RUN_TYPES.map(([t, label]) => ({ label, active: (s.runTask || 'play') === t, act: () => { a.setTask(t); this.showMenu(); } })),
        { label: 'Back', act: () => this.showMenu() },
      ], 'back');
    }
    const type = (RUN_TYPES.find(([t]) => t === s.runTask) || RUN_TYPES[0])[1];
    this.menu.show('Next', [
      { label: 'New run', act: () => this.prepare() },
      { label: `Run type: ${type} …`, act: () => this.showMenu('type') },
      { label: s.runMode === 'count' ? `Length: ${s.runCount} prompts (switch to a ${s.sprintSec} s sprint)` : `Length: ${s.sprintSec} s sprint (switch to ${s.runCount} prompts)`, act: () => { a.toggleMode(); this.showMenu(); } },
      { label: `Beat mode: ${s.beat ? 'on' : 'off'}`, act: () => { a.toggleBeat(); this.showMenu(); } },
      { label: 'Interval practice', act: () => a.goIntervals() },
    ], 'new run');
  }

  // A muted strum. Outside a run it takes the next step (new run, then start it). During a
  // run a double strum stops it, and a single one skips the wait after a miss.
  onStrum(double) {
    if (this.running) {
      if (double) return this.end('stopped');
      if (this.state === 'await' && this.cur?.graded) this.advance(0);
      return;
    }
    if (this.menuSub) return this.showMenu();
    this.primary();
  }

  scheduleRetest(cur) {
    const run = this.run;
    const q = run.queue;
    // the boss and the closing note stay last
    const firstRole = q.findIndex((x) => x.special === 'boss' || x.special === 'finale');
    const end = firstRole < 0 ? q.length : firstRole;
    const droppable = (x) => !x.retest && x.special !== 'boss' && x.special !== 'finale';
    const left = run.total - run.results.length;
    // a count run keeps its length: no room for a re-test if nothing planned can be dropped
    if (q.length >= left && !q.some(droppable)) return;
    const at = Math.min(end, RETEST_MIN - 1 + Math.floor(Math.random() * (RETEST_MAX - RETEST_MIN + 1)));
    q.splice(at, 0, { cell: cur.cell, sp: cur.sp, task: cur.task, retest: true });
    run.asked.push(cur.cell.key);
    while (q.length > left) {
      const i = q.map(droppable).lastIndexOf(true);
      if (i < 0) break;
      q.splice(i, 1);
    }
  }

  // Every frame while a run is on. DOM writes only when the text or width changes: a write per
  // frame cost a layout per frame (the timer text changes 10 times a second, the bar rarely).
  tick() {
    const run = this.run;
    if (!run || !this.running) return;
    const now = performance.now();
    const e = this.els;
    if (this.state === 'await' && this.cur) write(e.timer, ((now - this.cur.shownAt) / 1000).toFixed(1) + ' s');
    let left = Infinity;
    let fill;
    if (run.endsAt) {
      left = Math.max(0, run.endsAt - now);
      fill = ((100 * left) / (run.endsAt - run.startedAt)).toFixed(1) + '%';
      write(e.progress, `${Math.ceil(left / 1000)} s · ${run.results.length} answered`);
    } else {
      fill = ((100 * run.results.length) / run.total).toFixed(1) + '%';
    }
    if (e.fill.style.width !== fill) e.fill.style.width = fill;
    if (left <= 0) return this.end('time_up');
    this.raf = requestAnimationFrame(() => this.tick());
  }

  // ev: { midi, t } with t in performance.now() time
  onNote(ev) {
    if (!this.running) {
      const open = this.getStrings().indexOf(ev.midi);
      if (this.isActive() && this.menu.visible && open >= 0) this.board.vibrate(open, 0, hz(ev));
      if (this.isActive()) this.menu.onNote(ev.midi);
      return;
    }
    const cur = this.cur;
    if (this.state !== 'await' || !cur || cur.task === 'name') return;
    if (ev.t < cur.shownAt || ev.t < this.muteUntil) return;
    const s = this.s;
    const cell = cur.cell;
    const flats = cur.sp === 'f'; // name played notes the way the prompt was spelled
    const ms = Math.max(0, ev.t - cur.shownAt - s.latencyMs);
    if (ev.midi === cell.midi) {
      if (!cur.graded) this.grade(true, ms, ev.midi);
      cur.solvedMs = ms;
      this.closePrompt();
      this.els.showMe.classList.add('invisible');
      this.dropCue(cell);
      this.board.vibrate(cell.s, cell.f, hz(ev));
      this.board.flash(cell.s, cell.f, cur.special === 'golden' ? 'golden' : 'good', spellName(cell.midi, cur.sp));
      this.feedback('good', cur.revealed ? `✓ That's it — ${midiLabel(cell.midi, flats)}. It comes back in a few prompts.` : this.goodText(spellName(cell.midi, cur.sp), ms));
      this.sound?.(cur.special === 'golden' ? 'golden' : 'good');
      this.muteUntil = performance.now() + 250;
      this.advance(cur.attempts ? NEXT_DELAY_AFTER_MISS : NEXT_DELAY);
      return;
    }
    cur.attempts++;
    cur.wrong.push({ midi: ev.midi, ms });
    const pos = this.locate(ev.midi);
    if (pos) {
      this.board.vibrate(pos.s, pos.f, hz(ev));
      this.board.flash(pos.s, pos.f, 'bad', midiLabel(ev.midi, flats));
    }
    const kind = ERROR_TEXT[errorType(cell.midi, ev.midi)];
    this.feedback('bad', `✗ You played ${midiLabel(ev.midi, flats)}${kind ? ` — ${kind}` : ''}`);
    this.sound?.('bad');
    this.muteUntil = performance.now() + 250;
    if (!cur.graded) {
      this.getScheduler().recordConfusion(cell, cur.sp, ev.midi);
      this.grade(false, ms, ev.midi);
      this.missed();
    }
  }

  reveal() {
    const cur = this.cur;
    if (!cur || cur.revealed) return;
    cur.revealed = true;
    this.dropCue(cur.cell);
    this.board.reveal(cur.cell.s, cur.cell.f, noGuitar(cur.task) ? this.nameOf(cur.cell.pc) : midiLabel(cur.cell.midi, cur.sp === 'f'));
  }

  grade(correct, ms, played, extra = {}) {
    const { cur, run } = this;
    const { cell, sp, prev } = cur;
    const sch = this.getScheduler();
    const now = Date.now();
    const pred = sch.predict(run.desc, cell, sp, now); // before the update, to check the model later
    const cue = cur.cue;
    const { g, G } = sch.record(run.desc, cell, sp, correct, ms, now, cueOpts({ queueShown: cur.queueShown, cueTarget: cue.cueTarget, cueN: cue.cueN, task: cur.task }));
    cur.graded = true;
    if (!correct) run.failed.add(cell.key);
    // fade: the label goes once the note is answered right, and comes back after a miss
    if (run.cueMode === 'fade' && !cur.probe && cur.task === 'play') run.labelled[correct ? 'delete' : 'add'](cell.key);
    run.cued = (run.cued || 0) + (cue.cueTarget ? 1 : 0);
    run.results.push({ key: itemKey(cell.key, sp), cell, sp, correct, ms, g, probe: cur.probe, special: cur.special });
    // momentum: fast right answers in a row build a glow; a miss lets it fade, a slow right answer keeps it
    if (!correct) run.streak = 0;
    else if (ms <= cur.expected) run.streak++;
    this.els.area.style.setProperty('--glow', String(Math.min(run.streak, 6) / 6));
    if (run.beat) run.bpm = clamp(run.bpm * (correct ? BPM_UP : BPM_DOWN), BPM_MIN, BPM_MAX);
    this.ring();
    this.paintProgress();
    cur.log = {
      t: Date.now(), runId: run.id, tuning: this.s.tuningLabel, instrument: this.s.instrument, strings: this.getStrings().join(','), desc: run.desc,
      s: cell.s, f: cell.f, target: cell.midi, spelling: sp, played, correct, ms: Math.round(ms), g, review: run.review,
      prevTarget: prev?.cell.midi ?? null, prevSpelling: prev?.sp ?? null, prevS: prev?.cell.s ?? null, prevF: prev?.cell.f ?? null,
      retest: cur.retest, queueShown: cur.queueShown, showMe: !!extra.showMe, fsrsGrade: G,
      predP: pred.p, predMs: pred.ms, predR: pred.R, predS: pred.S, predD: pred.D,
      task: cur.task, answerName: extra.answerName ?? null, probe: cur.probe,
      errorType: correct ? null : errorType(cell.midi, played),
      cueMode: noGuitar(cur.task) ? 'off' : run.cueMode, ...cue,
      shownName: cur.shown?.name ?? null,
      special: cur.special, bpm: cur.bpm,
    };
    // the model is saved at the end of the run (end()): what a graded answer changes in it is
    // replayed from the answer log, which was just written by onAttempt
  }

  // Feedback line for a right first answer: the role of the prompt and the momentum.
  goodText(name, ms) {
    const { cur, run } = this;
    const head = cur.special === 'golden' ? '★ Golden! ' : cur.special === 'boss' ? 'Boss beaten! ' : '';
    const chain = run.streak >= 3 ? ` · ${run.streak} fast in a row` : '';
    return `${head}✓ ${name} · ${(ms / 1000).toFixed(2)} s${chain}${run.beat ? ` · ${Math.round(run.bpm)} bpm` : ''}`;
  }

  // Log the current prompt once it is over: solved, moved on, or the run ended.
  closePrompt() {
    const cur = this.cur;
    if (!cur?.log) return;
    this.onAttempt({
      ...cur.log,
      solveMs: cur.solvedMs == null ? null : Math.round(cur.solvedMs),
      wrongCount: cur.wrong.length,
      wrongNotes: cur.wrong.map((w) => w.midi).join(',') || null,
      wrongMs: cur.wrong.map((w) => Math.round(w.ms)).join(',') || null,
    });
    cur.log = null;
  }

  // Where to show a played pitch: inside the zone if it is there, else the nearest position.
  locate(midi) {
    const z = this.run.zone;
    const inZone = z.cells.find((c) => c.midi === midi);
    if (inZone) return inZone;
    const all = positionsOf(this.getStrings(), this.s.frets, midi);
    let best = null;
    let bd = Infinity;
    for (const p of all) {
      const d = (p.s - z.cs) ** 2 + ((p.f - z.cf) / 2) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  feedback(kind, text) {
    const e = this.els;
    e.feedback.textContent = text;
    e.feedback.className = 'feedback ' + kind;
    burst(e.note, kind);
  }

  // reason: 'completed' | 'time_up' | 'stopped' (Stop button) | 'left' (view or board changed)
  end(reason, showSummary = true) {
    const run = this.run;
    if (!run || !this.running) return;
    this.clearTimers();
    clearTimeout(this.beatTimer);
    cancelAnimationFrame(this.raf);
    this.closePrompt();
    this.state = 'done';
    this.cur = null;
    this.ring();
    this.paintProgress();
    this.els.area.style.setProperty('--glow', '0');
    const res = run.results;
    const ok = res.filter((r) => r.correct);
    const acc = res.length ? ok.length / res.length : 0;
    const med = median(ok.map((r) => r.ms));
    // only full runs move the difficulty target
    if (reason === 'completed' || reason === 'time_up') {
      this.getScheduler().endRun({ acc, medianMs: med ?? 99999, desc: run.desc, review: run.review });
    }
    if (reason === 'completed') run.nearMiss = this.nearMiss(run, ok.length);
    this.onSave();
    this.onRun?.({ ...run.row, ended_at: Date.now(), end_reason: reason, prompts: res.length, correct: ok.length, median_ms: med, bpm_end: run.beat ? run.bpm : null });
    if (res.length) this.onRunEnd?.();
    this.board.clearMarks();
    const e = this.els;
    e.timer.textContent = '';
    e.queue.innerHTML = '';
    e.showMe.classList.add('invisible');
    e.names.classList.add('hidden');
    e.tf.classList.add('hidden');
    this.updateButton();
    if (!showSummary) {
      this.state = 'idle';
      this.run = null;
      e.sub.textContent = this.idleText();
      this.showMenu();
      return;
    }
    e.note.textContent = reason === 'stopped' ? 'Stopped' : 'Done';
    e.sub.textContent = 'Press New run or Enter to keep going';
    e.fill.style.width = '100%';
    this.renderSummary(run, acc, med);
    this.showMenu();
  }

  // A finished prompts run: one note from perfect, one short of your best on this zone and
  // length, or a new best. Remembers the best in the model.
  nearMiss(run, ok) {
    const best = (this.getScheduler().model.meta.best ||= {});
    const key = `${run.label}|${run.total}`;
    const prev = best[key];
    best[key] = Math.max(prev ?? 0, ok);
    const out = [];
    if (run.total - ok === 1) out.push('One note away from a perfect run.');
    else if (prev != null && ok === prev - 1) out.push(`One note short of your best here (${prev} of ${run.total}).`);
    if (prev != null && ok > prev) out.push(`New best here: ${ok} of ${run.total}.`);
    return out.join(' ');
  }

  // The board after a run: each position asked, with the rings of the spelling asked first and
  // its name, red when it was missed in this run.
  runResultsCell(sch) {
    const byCell = new Map();
    for (const r of this.run.results) {
      const c = byCell.get(r.cell.key) || { r, missed: false };
      c.missed ||= !r.correct;
      byCell.set(r.cell.key, c);
    }
    return (s, f) => {
      const c = byCell.get(s + ':' + f);
      if (!c) return null;
      const { r } = c;
      return { rings: sch.noteRings(r.key), label: r.sp === 'r' ? NAME_LABELS[r.cell.pc].split('/')[0] : spellName(r.cell.midi, r.sp), missed: c.missed };
    };
  }

  renderSummary(run, acc, med) {
    const s = this.s;
    const strings = this.getStrings();
    const fmt = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + ' s');
    const where = (c) => `<span class="muted">${stringName(strings, c.s, s.flats)} string · fret ${c.f}</span>`;

    // per note asked: tries, right first time, this run's time vs the usual before the run
    const items = new Map();
    for (const r of run.results) {
      const it = items.get(r.key) || { cell: r.cell, sp: r.sp, key: r.key, n: 0, ok: 0, times: [] };
      it.n++;
      if (r.correct) { it.ok++; it.times.push(r.ms); }
      items.set(r.key, it);
    }
    const rows = [...items.values()].map((it) => {
      const ms = median(it.times);
      const before = run.beforeMs.get(it.key);
      return { ...it, ms, before, ratio: ms != null && before ? ms / before : null };
    });
    const name = (it) => `<span><b>${spellName(it.cell.midi, it.sp)}</b> ${where(it.cell)}</span>`;
    const faster = rows.filter((r) => r.ok === r.n && r.ratio != null && r.ratio < 0.9).sort((a, b) => a.ratio - b.ratio).slice(0, 6)
      .map((r) => `<li>${name(r)}<span>${fmt(r.ms)} <span class="muted">· usual ${fmt(r.before)}</span></span></li>`).join('')
      || '<li class="muted">Nothing clearly faster than usual this time.</li>';
    const work = rows.filter((r) => r.ok < r.n || (r.ratio != null && r.ratio > 1.15))
      .sort((a, b) => (a.ok / a.n) - (b.ok / b.n) || (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 6)
      .map((r) => `<li>${name(r)}<span>${r.ok < r.n ? `<b class="down">missed ${r.n - r.ok} of ${r.n}</b>` : `${fmt(r.ms)} <span class="muted">· usual ${fmt(r.before)}</span>`}</span></li>`).join('')
      || '<li class="muted">Nothing missed or slower than usual.</li>';

    // end on tomorrow, not on "one more run": what will be due, and that short daily
    // sessions beat one long one
    const sch = this.getScheduler();
    const dueNow = sch.dueKeys().length;
    const dueTomorrow = sch.dueKeys(Date.now(), DAY).length;
    const probes = run.results.filter((r) => r.probe);
    const tomorrow = `<p class="tomorrow">${dueTomorrow ? `<b>${dueTomorrow}</b> note${dueTomorrow === 1 ? '' : 's'} will be due for review tomorrow` : 'Nothing will be due tomorrow'}${dueNow ? ` (${dueNow} already today)` : ''}. A few short runs every day work better than one long session.</p>`;

    const reasons = { completed: '', time_up: '', stopped: ' · stopped early' };
    const e = this.els.summary;
    e.innerHTML = `
      <div class="sum-head">
        <div><b>${Math.round(acc * 100)}%</b><span>right first time</span></div>
        <div><b>${run.results.length}</b><span>prompts${reasons[run.row.end_reason] ?? ''}</span></div>
        <div><b>${fmt(med)}</b><span>median time · your usual ${fmt(run.usualMs)}</span></div>
        ${probes.length ? `<div><b>${probes.filter((r) => r.correct).length} / ${probes.length}</b><span>check-up prompts right${run.cueMode !== 'off' ? ' (no names shown)' : ''}</span></div>` : ''}
      </div>
      ${run.nearMiss ? `<p class="near-miss">${run.nearMiss}</p>` : ''}
      ${run.beat ? `<p class="muted small">Beat mode: ${Math.round(run.row.bpm_start)} → ${Math.round(run.bpm)} bpm.</p>` : ''}
      ${run.cued ? `<p class="muted small">The asked note's own name was on the board for ${run.cued} of ${run.results.length} prompts. Those count at most as Hard and their times are not used for speed.</p>` : ''}
      ${tomorrow}
      <h4>Answer times <span class="muted">· each dot is one prompt, first answer</span></h4>
      ${this.timePlot(run)}
      <div class="sum-lists">
        <div><h4>Faster than your usual</h4><ul class="chg">${faster}</ul></div>
        <div><h4>Needs work <span class="muted">· missed, or slower than usual</span></h4><ul class="chg">${work}</ul></div>
      </div>
      <button class="btn primary" id="nextRunBtn">New run ⏎</button>`;
    e.classList.remove('hidden');
    this.els.neckLegend.classList.remove('hidden');
    e.querySelector('#nextRunBtn').onclick = () => this.prepare();
  }

  // Answer times on a continuous log scale: green = right first time, red = wrong or time out.
  timePlot(run) {
    const W = 640;
    const H = 96;
    const L = 16;
    const R = W - 16;
    const lo = Math.log(300);
    const hi = Math.log(12000);
    const x = (ms) => L + ((Math.log(Math.min(12000, Math.max(300, ms))) - lo) / (hi - lo)) * (R - L);
    const ticks = [500, 1000, 2000, 3000, 5000, 10000].map((ms) =>
      `<line x1="${x(ms)}" x2="${x(ms)}" y1="8" y2="${H - 22}" class="tp-grid"/><text x="${x(ms)}" y="${H - 6}" class="tp-tick">${ms / 1000} s</text>`).join('');
    const dots = run.results.map((r, i) =>
      `<circle cx="${x(r.ms).toFixed(1)}" cy="${18 + ((i * 37) % 5) * 11}" r="5" class="${r.correct ? 'tp-ok' : 'tp-bad'}"><title>${spellName(r.cell.midi, r.sp)} · ${(r.ms / 1000).toFixed(2)} s${r.correct ? '' : ' · missed'}</title></circle>`).join('');
    const med = median(run.results.filter((r) => r.correct).map((r) => r.ms));
    // the two labels sit on opposite sides of their lines so they don't collide
    const line = (ms, cls, label, right) => (ms == null ? '' : `<line x1="${x(ms)}" x2="${x(ms)}" y1="6" y2="${H - 22}" class="${cls}"/>
      <text x="${x(ms) + (right ? 4 : -4)}" y="12" class="tp-lbl" text-anchor="${right ? 'start' : 'end'}">${label}</text>`);
    const medRight = med == null || med >= run.usualMs;
    return `<svg class="time-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Answer times">${ticks}${line(run.usualMs, 'tp-usual', 'usual', !medRight)}${line(med, 'tp-med', 'median', medRight)}${dots}</svg>`;
  }

  simulate(midi) {
    this.onNote({ midi, t: performance.now() + this.s.latencyMs });
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
    // keys 1–6 pick a row of the open-string menu (1 = low E)
    if (!this.running && /^[1-6]$/.test(e.key)) return this.menu.pick(+e.key - 1);
    if (e.key.length !== 1 || !this.run || !this.running) return;
    if (this.cur?.task === 'truefalse') {
      if (e.key === 'y' || e.key === 'Y' || e.key === 'ArrowRight') return this.answerTF(true);
      if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowLeft') return this.answerTF(false);
    }
    if (e.key.toLowerCase() === 'h') return this.giveUp('show');
    const idx = 'CDEFGAB'.indexOf(e.key.toUpperCase());
    if (idx < 0) return;
    const pc = ([0, 2, 4, 5, 7, 9, 11][idx] + (e.shiftKey ? 1 : 0)) % 12;
    if (this.cur?.task === 'name') return this.answerName(pc, 'CDEFGAB'[idx] + (e.shiftKey ? '#' : ''));
    const cell = this.run.zone.byPc[pc];
    if (cell) this.simulate(cell.midi);
  }
}
