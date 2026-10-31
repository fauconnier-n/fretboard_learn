// @ts-check
// Spaced repetition + curriculum. See docs/learning-algorithm.md for the reasoning.
//  - card per item = position (string:fret) + spelling. Natural notes have one item
//    ("1:3"); sharps/flats have two linked twins ("1:1:s" = A#, "1:1:f" = Bb).
//    "Name the note" (position → name) has its own card per position ("1:3:r").
//    Each card has two signals:
//      memory: FSRS-6 stability S / difficulty D, graded Again/Hard/Good/Easy from
//              right/wrong plus answer time relative to the time expected for that item
//      speed:  running mean and spread of log answer time, from right answers
//  - shared factors (string, fret region, natural/accidental, spelling) learnt Elo-style:
//    a prior for positions and times not seen yet
//  - per note-name stats (A# and Bb kept apart)
//  - per item "shape context": recent attempts tagged with the zone's shape
//  - zone choice: due reviews first when they pile up, else a target predicted success

import { pcOf, SHARPS, isAccidental, spellingsOf, spellName } from './music.js';
import { describe } from './zones.js';

const SLOW_MS = 10000;
const PRIOR_MS = 3000;
const PRIOR_WEIGHT = 2; // how many answers a prior counts for before an item's own times take over
const DEFAULT_FLOOR_MS = 800;

// Fixed-scale speed score (1 at 0.6 s, 0 at 10 s), logged as attempts.grade.
export const fluency = (ms) => Math.min(1, Math.max(0, Math.log(SLOW_MS / ms) / Math.log(SLOW_MS / 600)));

const newTime = () => ({ mu: Math.log(PRIOR_MS), v: 0, n: 0 });

// Running mean and variance of log answer time. The first answers are averaged,
// later ones weigh 25% each, so the estimate follows you as you get faster.
function addTime(t, ms) {
  const x = Math.log(Math.max(100, ms));
  t.n++;
  const a = Math.max(0.25, 1 / t.n);
  const d = x - t.mu;
  t.mu += a * d;
  t.v = (1 - a) * (t.v + a * d * d);
}

// own estimate shrunk towards a prior while there are few answers
const shrink = (t, prior) => (t && t.n ? (t.n * t.mu + PRIOR_WEIGHT * prior) / (t.n + PRIOR_WEIGHT) : prior);

export const itemKey = (cellKey, sp) => (sp === 'n' ? cellKey : cellKey + ':' + sp);
const twin = (sp) => (sp === 's' ? 'f' : 's');
const isReverse = (key) => key.endsWith(':r');

const MODEL_VERSION = 5;
const DAY = 86400000;
const CTX_MAX = 24;
const UNLOCK_FRACTION = 0.5;
const STARTER_DIFF = 0.2;
const TWIN_LINK = 0.85; // an unseen spelling starts from what is known of its twin, slightly discounted
const DUE_R = 0.85; // below this recall probability an item is "fading, due for review"
const BACKLOG_GATE = 8; // with this many due items, no zone with unseen positions is picked
const TARGET_MIN = 0.75; // band for the target success rate
const TARGET_MAX = 0.85;
// lowest string first: low E, A, D, G, B, high e (high e is lowered below as it repeats low E)
const STRING_DIFF = [0, 0.25, 0.45, 0.6, 0.75, 0.85, 0.9, 0.95];
const MARKERS = [3, 5, 7, 9, 15, 17, 19, 21];
export const LANDMARKS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

// How an answer logged with note-name labels on the board counts in the model. A right
// answer with its own label showing is at most Hard and says nothing about speed; one with
// other labels showing is at most Good.
// A true-or-false answer is recognition, not recall: a right one counts at most as Hard and
// its time (a yes/no click) is not used for speed.
export const cueOpts = (a) => (a.task === 'truefalse' ? { speed: false, maxG: 2 }
  : { speed: !a.queueShown && !a.cueTarget, maxG: a.cueTarget ? 2 : a.cueN > 0 ? 3 : 4 });

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const gauss = (x, mu, sd) => Math.exp(-0.5 * ((x - mu) / sd) ** 2);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

export function newModel() {
  return {
    version: MODEL_VERSION, cards: {}, notes: {}, ctx: {}, conf: {},
    meta: {
      target: 0.8, speedPush: 1, runsDone: 0, recent: [], last: null,
      time: newTime(), floor: DEFAULT_FLOOR_MS, fx: { time: {}, acc: {}, g: { v: logit(0.7), n: 0 } },
      best: {}, // most right first answers per "zone label|run length", for the near-miss line
    },
  };
}

// FSRS-6 default parameters (open-spaced-repetition, fitted on about 10k Anki collections).
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
export const DEFAULT_DECAY = W[20];
export const GRADE_NAMES = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

// FSRS-6 forgetting curve: R = (1 + F·t/S)^-decay, t and S in days, F such that R(S) = 90%.
// The decay can be fitted to your own answers (Settings → Data → Check the model).
let decay = DEFAULT_DECAY;
let factor = 0.9 ** (-1 / decay) - 1;
function setDecay(d) {
  decay = d;
  factor = 0.9 ** (-1 / d) - 1;
}
export const forgetting = (S, tDays, d = decay) => (1 + ((0.9 ** (-1 / d) - 1) * tDays) / S) ** -d;

export function retrievability(card, now) {
  if (!card) return 0;
  const t = Math.max(0, now - card.last) / DAY;
  return (1 + (factor * t) / card.S) ** -decay;
}

const initS = (G) => W[G - 1];
const initD = (G) => clamp(W[4] - Math.exp(W[5] * (G - 1)) + 1, 1, 10);

function nextD(D, G) {
  const d = D - W[6] * (G - 3) * ((10 - D) / 9); // linear damping towards 10
  return clamp(W[7] * initD(4) + (1 - W[7]) * d, 1, 10); // mean reversion
}

function nextS(c, G, R, elapsedDays) {
  if (elapsedDays < 1) {
    // same-day review: modest change, so many answers in one session can't inflate S
    let f = Math.exp(W[17] * (G - 3 + W[18])) * c.S ** -W[19];
    if (G >= 3) f = Math.max(1, f);
    return Math.max(0.001, c.S * f);
  }
  if (G === 1) return Math.min(W[11] * c.D ** -W[12] * ((c.S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)), c.S);
  const bonus = G === 2 ? W[15] : G === 4 ? W[16] : 1;
  return Math.min(36500, c.S * (1 + Math.exp(W[8]) * (11 - c.D) * c.S ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1) * bonus));
}

const dayKey = (t) => new Date(t).toDateString();

// probability of a right answer: memory only
export const cardP = (c, now) => retrievability(c, now) * (0.15 + 0.85 * c.acc);

// Similarity of two zone shape descriptors, 0..1.
export function similarity(a, b) {
  return Math.exp(-0.5 * (((a.cs - b.cs) / 0.8) ** 2 + ((a.cf - b.cf) / 2) ** 2))
    * (a.type === b.type ? 1 : 0.4)
    * (a.sk === b.sk ? 1 : 0.7)
    * Math.exp(-((a.span - b.span) ** 2) / 8);
}

// Where the cell sits inside the shape (edge vs middle).
const offsetSim = (a, b) => Math.exp(-0.5 * (((a.os - b.os) / 0.8) ** 2 + ((a.of - b.of) / 2) ** 2));

function sample(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return Math.floor(Math.random() * weights.length);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// What kind of wrong note: same name in another octave, a semitone or tone off, or further.
export function errorType(target, played) {
  if (played == null) return null;
  const d = played - target;
  if (d % 12 === 0) return 'octave';
  if (Math.abs(d) === 1) return d > 0 ? 'semitone_sharp' : 'semitone_flat';
  if (Math.abs(d) === 2) return d > 0 ? 'tone_sharp' : 'tone_flat';
  return 'other';
}

// Elo-style uncertainty: big steps while a factor has few answers, smaller later.
const U = (n) => 1 / (1 + 0.06 * n);

export class Scheduler {
  constructor(model, strings, frets) {
    this.model = model;
    this.strings = strings;
    this.frets = frets;
    this.diffCache = new Map();
    this.migrate();
    setDecay(model.meta.decay || DEFAULT_DECAY);
  }

  // v1 had one card per position, always shown with sharps: those become the sharp twin.
  // Later versions changed what is stored: needsRebuild asks the caller to replay the
  // answer log, which has every answer and its time. So does `stale`, set when answers
  // were added to the log from elsewhere (the disk copy).
  migrate() {
    const m = this.model;
    const v = m.version || 1;
    const fresh = newModel();
    m.conf ||= {};
    for (const [k, val] of Object.entries(fresh.meta)) if (m.meta[k] === undefined) m.meta[k] = val;
    m.meta.target = clamp(m.meta.target, TARGET_MIN, TARGET_MAX);
    if (m.stale) this.needsRebuild = true;
    if (v >= MODEL_VERSION) return;
    this.needsRebuild = true;
    if (v >= 2) return;
    for (const store of [m.cards, m.ctx]) {
      for (const key of Object.keys(store)) {
        const [s, f, sp] = key.split(':');
        if (sp !== undefined || s >= this.strings.length) continue;
        if (isAccidental(pcOf(this.strings[s] + +f))) {
          store[key + ':s'] = store[key];
          delete store[key];
        }
      }
    }
    for (const k of Object.keys(m.notes)) {
      if (/^\d+$/.test(k)) {
        m.notes[SHARPS[+k]] = m.notes[k];
        delete m.notes[k];
      }
    }
  }

  nameOf(key) {
    const [s, f, sp = 'n'] = key.split(':');
    return spellName(this.strings[s] + +f, sp === 'r' ? 'n' : sp);
  }

  // ---------- shared factors (cold-start prior) ----------

  factorsOf(key) {
    const [s, f, sp = 'n'] = key.split(':');
    const pc = pcOf(this.strings[s] + +f);
    const fr = +f % 12;
    return ['s' + s, 'r' + (fr <= 4 ? 0 : fr <= 8 ? 1 : 2), isAccidental(pc) ? 'acc' : 'nat', 'sp' + sp];
  }

  // Typical log time predicted from the factors alone.
  factorMu(key) {
    const fx = this.model.meta.fx.time;
    return this.globalMu() + this.factorsOf(key).reduce((t, k) => t + (fx[k]?.v || 0), 0);
  }

  // Chance of a right answer predicted from the factors alone.
  factorP(key) {
    const { acc, g } = this.model.meta.fx;
    return sigmoid(g.v + this.factorsOf(key).reduce((t, k) => t + (acc[k]?.v || 0), 0));
  }

  updateFactors(key, correct, ms) {
    const { fx } = this.model.meta;
    const ks = this.factorsOf(key);
    const resid = (correct ? 1 : 0) - this.factorP(key);
    fx.g.v += 0.3 * U(fx.g.n++) * resid;
    for (const k of ks) {
      const e = (fx.acc[k] ||= { v: 0, n: 0 });
      e.v += 0.3 * U(e.n++) * resid;
    }
    if (ms == null) return;
    const r = Math.log(Math.max(100, ms)) - this.factorMu(key);
    for (const k of ks) {
      const e = (fx.time[k] ||= { v: 0, n: 0 });
      e.v += 0.25 * U(e.n++) * r;
    }
  }

  // ---------- speed ----------

  // Your typical answer time overall, as a log.
  globalMu() {
    const t = this.model.meta.time;
    return t && t.n ? t.mu : Math.log(PRIOR_MS);
  }

  // Your own fastest typical times: a running estimate of the 10th percentile of right answers.
  floorMs() {
    return clamp(this.model.meta.floor || DEFAULT_FLOOR_MS, 350, 3000);
  }

  // Speed score relative to your own floor: 1 at your fast end, 0 at 10 s.
  fluency(ms) {
    const floor = this.floorMs();
    return clamp(Math.log(SLOW_MS / ms) / Math.log(SLOW_MS / floor), 0, 1);
  }

  // Expected answer time (ms) of one item now: its own times, shrunk towards the same
  // note name, then towards the factor prior. Slower when the memory has faded.
  expectedMs(key, now = Date.now()) {
    const c = this.model.cards[key];
    const prior = isReverse(key) ? this.factorMu(key) : shrink(this.model.notes[this.nameOf(key)]?.time, this.factorMu(key));
    const R = c ? retrievability(c, now) : 0.5;
    return Math.exp(shrink(c?.time, prior)) * (1 + 0.8 * (1 - R));
  }

  // Spread of an item's log answer times (null while it has fewer than 3).
  spread(key) {
    const t = this.model.cards[key]?.time;
    return t && t.n >= 3 ? Math.sqrt(t.v) : null;
  }

  // Combined score for display and for picking: remembered, and found fast.
  itemMastery(key, now) {
    const c = this.model.cards[key];
    if (!c) return 0;
    return retrievability(c, now) * c.acc * (0.5 + 0.5 * this.fluency(this.expectedMs(key, now)));
  }

  // Memory grade of one answer. Wrong = Again. Right: compare the log time with the time
  // expected for this item (z-score using its own spread, or your overall spread while
  // it has few answers): clearly faster = Easy, about as expected = Good, slower = Hard.
  timeGrade(key, correct, ms, now) {
    if (!correct) return 1;
    // a first sighting has no time of its own to compare with: at most Good
    if (!this.model.cards[key]) return Math.min(3, this.timeGradeRaw(key, ms, now));
    return this.timeGradeRaw(key, ms, now);
  }

  timeGradeRaw(key, ms, now) {
    const own = this.model.cards[key]?.time;
    const v = own && own.n >= 3 ? own.v : this.model.meta.time?.v ?? 0.1;
    const sd = Math.max(0.25, Math.sqrt(v));
    const z = (Math.log(Math.max(100, ms)) - Math.log(this.expectedMs(key, now))) / sd;
    return z < -0.5 ? 4 : z <= 1 ? 3 : 2;
  }

  // Right and fast (Good or Easy) on at least two different days: one long session
  // can't make a position look mastered.
  isMastered(key, now = Date.now()) {
    const c = this.model.cards[key];
    return !!c && (c.days?.length || 0) >= 2 && this.itemMastery(key, now) >= 0.7;
  }

  positionMastered(cell, now = Date.now()) {
    return spellingsOf(cell.pc).every((sp) => this.isMastered(itemKey(cell.key, sp), now));
  }

  // Item keys (play mode) whose memory has faded below DUE_R.
  dueKeys(now = Date.now(), within = 0) {
    const out = [];
    for (const [key, c] of Object.entries(this.model.cards)) {
      if (isReverse(key)) continue;
      const [s, f] = key.split(':').map(Number);
      if (s >= this.strings.length || f > this.frets) continue;
      if (retrievability(c, now + within) < DUE_R) out.push(key);
    }
    return out;
  }

  // What the model expects just before an answer, logged with it to check the model later.
  predict(desc, cell, sp, now = Date.now()) {
    const key = itemKey(cell.key, sp);
    const c = this.model.cards[key];
    return {
      p: this.pItem(cell, sp, desc, this.snapshot(now), now),
      ms: this.expectedMs(key, now),
      R: c ? retrievability(c, now) : null,
      S: c ? c.S : null,
      D: c ? c.D : null,
    };
  }

  // How much an item needs speed work: known but slow, slower than your usual, or erratic.
  speedNeed(key, now) {
    const c = this.model.cards[key];
    if (!c) return 0;
    const ms = this.expectedMs(key, now);
    const slowerThanUsual = clamp((Math.log(ms) - this.globalMu()) / 0.7, 0, 1);
    const sd = this.spread(key);
    const erratic = sd == null ? 0 : clamp((sd - 0.25) / 0.35, 0, 1);
    return cardP(c, now) * (1 - this.fluency(ms)) + 0.5 * slowerThanUsual + 0.4 * erratic;
  }

  // ---------- difficulty and priors ----------

  // Built-in difficulty of a position, 0 (easy) .. 1.
  cellDifficulty(s, f) {
    const key = s + ':' + f;
    let d = this.diffCache.get(key);
    if (d !== undefined) return d;
    const st = this.strings;
    let sd = STRING_DIFF[Math.min(s, STRING_DIFF.length - 1)];
    // a string tuned like a lower one (high e vs low E) reuses what was learnt there
    for (let t = 0; t < s - 1; t++) if (pcOf(st[t]) === pcOf(st[s])) sd = Math.min(sd, STRING_DIFF[t] + 0.15);
    const fd = f <= 5 ? 0.03 * f : f <= 9 ? 0.25 : f <= 12 ? 0.4 : 0.5;
    const bonus = f === 0 || f === 12 || f === 24 ? 0.1 : MARKERS.includes(f) ? 0.06 : 0;
    d = clamp(0.55 * sd + 0.45 * fd - bonus, 0, 1);
    this.diffCache.set(key, d);
    return d;
  }

  zoneDifficulty(z) {
    if (z._diff !== undefined) return z._diff;
    let d = avg(z.cells.map((c) => this.cellDifficulty(c.s, c.f))) + 0.05 * (z.strings.length - 2);
    if (z.type === 'box') d += 0.03 * (z.span - 3) + (z.crossesThird ? 0.1 : 0);
    else d += z.strings[0] === 0 ? -0.05 : 0.05;
    return (z._diff = d);
  }

  // items: mastery per item key; mastery: per position, combining both spellings
  snapshot(now = Date.now()) {
    const items = new Map();
    const positions = new Set();
    for (const key of Object.keys(this.model.cards)) {
      if (isReverse(key)) continue;
      const [s, f] = key.split(':').map(Number);
      if (s >= this.strings.length || f > this.frets) continue;
      items.set(key, this.itemMastery(key, now));
      positions.add(s + ':' + f);
    }
    const mastery = new Map();
    const byPc = Array.from({ length: 12 }, () => []);
    for (const pos of positions) {
      const [s, f] = pos.split(':').map(Number);
      const pc = pcOf(this.strings[s] + f);
      const vals = spellingsOf(pc).map((sp) => items.get(itemKey(pos, sp)));
      const filled = vals.map((v, i) => v ?? TWIN_LINK * (vals[1 - i] ?? 0));
      const m = avg(filled);
      mastery.set(pos, m);
      byPc[pc].push(m);
    }
    return { now, items, mastery, byPc };
  }

  masteryOf(key, now = Date.now()) {
    return this.itemMastery(key, now);
  }

  hasCard(cell) {
    return spellingsOf(cell.pc).some((sp) => this.model.cards[itemKey(cell.key, sp)]);
  }

  // Same note on other strings close by: the octave and unison shapes a guitarist uses
  // to move between strings. The string tuned like this one (low E for high e) counts most.
  shapeNeighbours(s, f) {
    const pc = pcOf(this.strings[s] + f);
    const out = [];
    for (let t = 0; t < this.strings.length; t++) {
      if (t === s) continue;
      for (let g = Math.max(0, f - 4); g <= Math.min(this.frets, f + 4); g++) {
        if (pcOf(this.strings[t] + g) !== pc) continue;
        const mirror = pcOf(this.strings[t]) === pcOf(this.strings[s]) && g === f;
        out.push({ s: t, f: g, w: mirror ? 1 : 0.5 / (1 + Math.abs(g - f) / 2) });
      }
    }
    return out;
  }

  // Expected success on a never-played position: built-in difficulty, the shared factors,
  // nearby cells, the same note through octave shapes, and the same note anywhere.
  prior(s, f, snap) {
    let base = 0.9 - 0.9 * this.cellDifficulty(s, f);
    if (this.model.meta.fx.g.n >= 20) base = 0.5 * base + 0.5 * this.factorP(s + ':' + f);
    let nsum = 0;
    let nw = 0;
    for (let ds = -1; ds <= 1; ds++) {
      for (let df = -2; df <= 2; df++) {
        if (!ds && !df) continue;
        const m = snap.mastery.get(s + ds + ':' + (f + df));
        if (m === undefined) continue;
        const w = 1 / (1 + Math.abs(ds) + 0.5 * Math.abs(df));
        nsum += w * m;
        nw += w;
      }
    }
    const neigh = nw ? nsum / nw : base;
    let osum = 0;
    let ow = 0;
    for (const n of this.shapeNeighbours(s, f)) {
      const m = snap.mastery.get(n.s + ':' + n.f);
      if (m === undefined) continue;
      osum += n.w * m;
      ow += n.w;
    }
    const octave = ow ? osum / ow : base;
    const samePc = avg(snap.byPc[pcOf(this.strings[s] + f)]) ?? base;
    return clamp(0.4 * base + 0.2 * neigh + 0.25 * octave + 0.15 * samePc, 0.05, 0.95);
  }

  contextAcc(key, cell, desc) {
    const list = this.model.ctx[key];
    if (!list || !list.length) return { acc: 0, w: 0 };
    const me = { os: cell.s - desc.cs, of: cell.f - desc.cf };
    let sum = 0;
    let w = 0;
    for (const e of list) {
      const k = similarity(desc, e) * offsetSim(me, e);
      sum += k * e.ok;
      w += k;
    }
    return { acc: w ? sum / w : 0, w };
  }

  // Predicted probability of a right answer for one item of a cell in this zone (memory only).
  pItem(cell, sp, desc, snap, now) {
    const key = itemKey(cell.key, sp);
    const c = this.model.cards[key];
    const prior = sp === 'r' ? this.pCell(cell, null, snap, now) : this.prior(cell.s, cell.f, snap);
    let p;
    if (!c) {
      const t = sp === 'n' || sp === 'r' ? null : this.model.cards[itemKey(cell.key, twin(sp))];
      p = t ? 0.4 * prior + 0.6 * TWIN_LINK * cardP(t, now) : prior;
    } else {
      const own = cardP(c, now);
      const conf = Math.min(1, c.seen / 4);
      p = conf * own + (1 - conf) * (0.5 * own + 0.5 * prior);
      if (desc) {
        // the same item can be weaker in some shapes than on average (damped: it never
        // outweighs the item's own record)
        const { acc, w } = this.contextAcc(key, cell, desc);
        if (w > 0.2) p += Math.min(0.2, w / (w + 6)) * (acc - c.acc);
      }
    }
    const n = sp === 'r' ? null : this.model.notes[spellName(cell.midi, sp)];
    if (n && n.n >= 3) p = 0.85 * p + 0.15 * n.acc;
    return clamp(p, 0.02, 0.99);
  }

  // Position-level prediction: average over its spellings.
  pCell(cell, desc, snap, now) {
    return avg(spellingsOf(cell.pc).map((sp) => this.pItem(cell, sp, desc, snap, now)));
  }

  // Played before, a starter cell, or next to something already known.
  isReachable(s, f, snap) {
    if (snap.mastery.has(s + ':' + f) || this.cellDifficulty(s, f) <= STARTER_DIFF) return true;
    for (let ds = -1; ds <= 1; ds++) {
      for (let df = -2; df <= 2; df++) {
        if ((snap.mastery.get(s + ds + ':' + (f + df)) ?? 0) >= 0.5) return true;
      }
    }
    // the mirror string (high e for low E) at the same fret
    return this.shapeNeighbours(s, f).some((n) => n.w === 1 && (snap.mastery.get(n.s + ':' + n.f) ?? 0) >= 0.5);
  }

  isUnlocked(z, snap) {
    const ok = z.cells.filter((c) => this.isReachable(c.s, c.f, snap)).length;
    return ok / z.cells.length >= UNLOCK_FRACTION;
  }

  zonePredicted(z, snap, now) {
    const desc = describe(z);
    return avg(z.cells.map((c) => this.pCell(c, desc, snap, now)));
  }

  zoneMastery(z, snap) {
    return avg(z.cells.map((c) => snap.mastery.get(c.key) ?? 0));
  }

  // ---------- choosing a zone ----------

  // Due reviews come first when they pile up: then only zones without unseen positions are
  // candidates, scored by how many due items they hold. Otherwise zones aim at the target
  // success rate, with a bonus for due items they contain.
  // focus 'confusions': only zones holding notes you have mixed up (none recorded: a normal
  // pick, with focus null). Also returns up to 2 other good, different-looking zones to offer.
  pickZone(zones, now = Date.now(), focus = null) {
    if (!zones.length) return null;
    const snap = this.snapshot(now);
    const meta = this.model.meta;
    const due = new Set(this.dueKeys(now).map((k) => k.split(':').slice(0, 2).join(':')));
    const dueIn = (z) => z.cells.filter((c) => due.has(c.key)).length;
    let review = due.size >= BACKLOG_GATE;

    let pool = zones.filter((z) => this.isUnlocked(z, snap));
    const mixed = focus === 'confusions' ? pool.filter((z) => this.confusionCells(z).size >= 2) : [];
    if (mixed.length) {
      pool = mixed;
      review = false;
    } else focus = null;
    if (review) {
      const seen = pool.filter((z) => z.cells.every((c) => this.hasCard(c)) && dueIn(z) > 0);
      if (seen.length) pool = seen;
    }
    if (!pool.length) pool = [...zones].sort((a, b) => this.zoneDifficulty(a) - this.zoneDifficulty(b)).slice(0, 3);
    const scored = pool.map((z) => {
      const P = this.zonePredicted(z, snap, now);
      let lg = focus
        ? 0.5 * this.confusionCells(z).size - 0.5 * ((P - meta.target) / 0.12) ** 2
        : review
          ? 0.6 * dueIn(z) - 0.5 * ((P - meta.target) / 0.12) ** 2
          : -0.5 * ((P - meta.target) / 0.06) ** 2 - 1.5 * this.zoneDifficulty(z) + 0.15 * dueIn(z);
      if (meta.last && similarity(describe(z), meta.last) > 0.8) lg -= 2.5;
      lg += Math.log(0.75 + 0.5 * Math.random());
      return { z, P, lg };
    });
    const max = Math.max(...scored.map((x) => x.lg));
    const pick = scored[sample(scored.map((x) => Math.exp(x.lg - max)))];
    const asPick = (x) => ({ zone: x.z, review, predicted: x.P, due: due.size, focus });
    const alternatives = [];
    for (const x of [...scored].sort((a, b) => b.lg - a.lg)) {
      if (alternatives.length === 2) break;
      const looks = [pick, ...alternatives].some((y) => similarity(describe(x.z), describe(y.z ?? y.zone)) > 0.8);
      if (x !== pick && !looks) alternatives.push(asPick(x));
    }
    return { ...asPick(pick), alternatives };
  }

  // Cells of a zone involved in a mix-up: notes you played wrong there, and the notes you
  // played instead of them (or instead of which they were played).
  confusionCells(zone) {
    const out = new Set();
    for (const c of zone.cells) {
      const others = this.confusedWith(c);
      if (!others.size) continue;
      out.add(c.key);
      for (const pc of others) if (zone.byPc[pc]) out.add(zone.byPc[pc].key);
    }
    return out;
  }

  // Recall chance and lapses of every cell of a zone, to pick the boss (hardest), the closing
  // note (best known) and golden prompts (notes you have been missing).
  zoneChances(zone, task = 'play', now = Date.now()) {
    const snap = this.snapshot(now);
    const desc = describe(zone);
    return zone.cells.map((cell) => ({
      cell,
      p: task === 'name' ? this.pItem(cell, 'r', desc, snap, now) : this.pCell(cell, desc, snap, now),
      seen: this.hasCard(cell),
      lapses: (task === 'name' ? ['r'] : spellingsOf(cell.pc)).reduce((t, sp) => t + (this.model.cards[itemKey(cell.key, sp)]?.lapses || 0), 0),
    }));
  }

  // How far an item is towards known (memory), fast (your usual time or better) and
  // automatic (mastered: right and fast on two days), each 0–1, for the rings in the summary.
  noteRings(key, now = Date.now()) {
    const c = this.model.cards[key];
    if (!c) return { known: 0, fast: 0, auto: 0 };
    return {
      known: Math.min(1, (retrievability(c, now) * c.acc) / 0.6),
      fast: Math.min(1, Math.exp(this.globalMu()) / this.expectedMs(key, now)),
      // not mastered yet never shows a full ring
      auto: this.isMastered(key, now) ? 1 : Math.min(0.95, 0.5 * Math.min(1, (c.days?.length || 0) / 2) + 0.5 * Math.min(1, this.itemMastery(key, now) / 0.7)),
    };
  }

  // ---------- choosing a prompt ----------

  // Next prompt inside a run: weak, due, slow and confused cells and cells near the target
  // difficulty come up more; landmarks and naturals first on a new string. Then a spelling
  // is drawn, leaning towards the weaker twin. Returns { cell, sp }. task 'name' asks
  // position → name, which has one item per position.
  pickPrompt(zone, run, task = 'play') {
    const now = Date.now();
    const snap = this.snapshot(now);
    const desc = describe(zone);
    const { target, speedPush = 1 } = this.model.meta;
    const cap = Math.ceil(0.25 * (Number.isFinite(run.total) ? run.total : 20));
    const lastKey = run.asked[run.asked.length - 1];
    const lastCell = zone.cells.find((c) => c.key === lastKey);
    const confused = lastCell ? this.confusedWith(lastCell) : new Set();
    const startedStrings = new Set(Object.keys(this.model.cards).map((k) => k.split(':')[0]));
    // prompts since each cell was last asked: a cell asked a moment ago is mostly still
    // in short-term memory, so asking it again teaches little
    const since = new Map();
    run.asked.forEach((k, i) => since.set(k, run.asked.length - i));
    const ws = zone.cells.map((c) => {
      if (c.key === lastKey) return 0;
      const gap = since.get(c.key) ?? Infinity;
      const recency = gap === Infinity ? 1 : 1 - Math.exp(-gap / 3);
      const sps = task === 'name' ? ['r'] : spellingsOf(c.pc);
      const p = task === 'name' ? this.pItem(c, 'r', desc, snap, now) : this.pCell(c, desc, snap, now);
      const seen = sps.some((sp) => this.model.cards[itemKey(c.key, sp)]);
      const slow = avg(sps.map((sp) => this.speedNeed(itemKey(c.key, sp), now)));
      const dueness = avg(sps.map((sp) => {
        const card = this.model.cards[itemKey(c.key, sp)];
        return card ? Math.max(0, DUE_R - retrievability(card, now)) / DUE_R : 0;
      }));
      let w = 0.08 + gauss(p, target, 0.2) + (seen ? 0.9 * (1 - p) : 0) + 0.7 * speedPush * slow + 1.2 * dueness
        + (run.failed.has(c.key) ? 0.6 : 0)
        // telling confusable notes apart: ask the note you mixed up with the last one
        + (confused.has(c.pc) ? 0.8 : 0);
      if (!seen) {
        // a new position: landmark frets first, and naturals first on a string not started yet
        if (LANDMARKS.includes(c.f)) w += 0.4;
        if (!startedStrings.has(String(c.s)) && isAccidental(c.pc)) w *= 0.4;
      }
      if ((run.counts[c.key] || 0) >= cap) w *= 0.05;
      // a mix-ups run asks almost only the notes involved in mix-ups
      if (run.mixups?.size && !run.mixups.has(c.key)) w *= 0.03;
      return w * recency;
    });
    const cell = zone.cells[sample(ws)];
    if (task === 'name') return { cell, sp: 'r' };
    if (!isAccidental(cell.pc)) return { cell, sp: 'n' };
    const score = (sp) => this.pItem(cell, sp, desc, snap, now) * (0.6 + 0.4 * this.fluency(this.expectedMs(itemKey(cell.key, sp), now)));
    const ps = score('s');
    const pf = score('f');
    const probSharp = clamp(0.5 + 1.5 * (pf - ps), 0.25, 0.75);
    return { cell, sp: Math.random() < probSharp ? 's' : 'f' };
  }

  // ---------- confusions ----------

  // Pitch classes you have played instead of this cell's note, or played this note instead of.
  confusedWith(cell) {
    const out = new Set();
    for (const [key, played] of Object.entries(this.model.conf)) {
      const [s, f] = key.split(':');
      const pc = pcOf(this.strings[s] + +f);
      if (key.startsWith(cell.key + ':') || key === cell.key) for (const m of Object.keys(played)) out.add(pcOf(+m));
      else if (Object.keys(played).some((m) => pcOf(+m) === cell.pc)) out.add(pc);
    }
    out.delete(cell.pc);
    return out;
  }

  recordConfusion(cell, sp, played) {
    if (played == null || played === cell.midi) return;
    const k = itemKey(cell.key, sp);
    const m = (this.model.conf[k] ||= {});
    m[played] = (m[played] || 0) + 1;
  }

  // ---------- recording ----------

  // Updates memory (FSRS-6 with a grade from right/wrong and answer time), speed (time of a
  // right answer, unless opts.speed is false, e.g. when the next-notes queue was visible),
  // the shared factors and the speed floor. Returns { g: fluency (0 if wrong), G: grade 1–4 }.
  record(desc, cell, sp, correct, ms, now = Date.now(), opts = {}) {
    const ok = correct ? 1 : 0;
    const g = correct ? fluency(ms) : 0;
    const key = itemKey(cell.key, sp);
    const { cards, notes, ctx, meta } = this.model;
    const useSpeed = opts.speed !== false;
    let G = useSpeed ? this.timeGrade(key, correct, ms, now) : correct ? 3 : 1;
    if (correct) G = Math.min(G, opts.maxG ?? 4);
    this.updateFactors(key, correct, correct && useSpeed ? ms : null);
    let c = cards[key];
    if (!c) {
      c = cards[key] = {
        S: initS(G), D: initD(G),
        last: now, reps: 1, seen: 1,
        lapses: correct ? 0 : 1,
        correct: ok,
        acc: correct ? 0.75 : 0.25,
        time: newTime(),
        days: [],
      };
    } else {
      const elapsed = Math.max(0, now - c.last) / DAY;
      const R = retrievability(c, now);
      c.S = nextS(c, G, R, elapsed);
      c.D = nextD(c.D, G);
      if (correct) c.correct++;
      else c.lapses++;
      c.acc = 0.7 * c.acc + 0.3 * ok;
      c.seen++;
      c.reps++;
      c.last = now;
    }
    if (G >= 3) {
      const d = dayKey(now);
      c.days ||= [];
      if (!c.days.includes(d)) c.days = [...c.days, d].slice(-5);
    }

    if (sp !== 'r') {
      const n = (notes[spellName(cell.midi, sp)] ||= { acc: 0.6, n: 0, time: newTime() });
      n.acc = 0.8 * n.acc + 0.2 * ok;
      n.n++;
      if (correct && useSpeed) addTime(n.time, ms);
    }
    if (correct && useSpeed) {
      addTime(c.time, ms);
      if (sp !== 'r') {
        addTime((meta.time ||= newTime()), ms);
        // running 10th percentile of right answers: step down 9× more often than up
        const q = Math.log(meta.floor || DEFAULT_FLOOR_MS);
        meta.floor = Math.exp(q + 0.05 * (ms < Math.exp(q) ? -0.9 : 0.1));
      }
    }

    const list = (ctx[key] ||= []);
    list.push({
      type: desc.type, sk: desc.sk, cs: desc.cs, cf: desc.cf, span: desc.span,
      os: +(cell.s - desc.cs).toFixed(3), of: +(cell.f - desc.cf).toFixed(3),
      ok, g, t: now,
    });
    if (list.length > CTX_MAX) list.splice(0, list.length - CTX_MAX);
    return { g, G };
  }

  // The target success rate stays within 75–85%. Speed pressure adapts on its own: more
  // weight on slow items when you are accurate, less when you are missing.
  endRun({ acc, medianMs, desc, review }) {
    const meta = this.model.meta;
    meta.recent.push({ acc, med: medianMs, t: Date.now(), review: !!review });
    if (meta.recent.length > 30) meta.recent.splice(0, meta.recent.length - 30);
    if (!review) {
      // lower target = harder zones
      if (acc >= 0.9) meta.target -= 0.02;
      else if (acc < 0.7) meta.target += 0.03;
      else meta.target += (0.8 - meta.target) * 0.1;
      meta.target = clamp(meta.target, TARGET_MIN, TARGET_MAX);
    }
    meta.speedPush = clamp((meta.speedPush || 1) + (acc >= 0.85 ? 0.1 : acc < 0.7 ? -0.1 : 0), 0.5, 1.5);
    meta.runsDone++;
    meta.last = desc;
  }

  // Replay the attempt log into fresh cards (keeps the difficulty target, decay and run history).
  rebuild(attempts) {
    const fresh = newModel();
    for (const k of ['cards', 'notes', 'ctx', 'conf']) this.model[k] = fresh[k];
    for (const k of ['time', 'floor', 'fx']) this.model.meta[k] = fresh.meta[k];
    this.model.version = MODEL_VERSION;
    delete this.model.stale;
    this.needsRebuild = false;
    const runs = new Set();
    for (const a of attempts) {
      const pc = pcOf(a.target);
      const cell = { s: a.s, f: a.f, midi: a.target, pc, key: a.s + ':' + a.f };
      // answers logged before spellings existed were all shown as sharps
      const sp = a.task === 'name' || a.task === 'truefalse' ? 'r' : a.spelling || (isAccidental(pc) ? 's' : 'n');
      this.record(a.desc, cell, sp, a.correct, a.ms, a.t, cueOpts(a));
      if (!a.correct && sp !== 'r') this.recordConfusion(cell, sp, a.played);
      runs.add(a.runId);
    }
    this.model.meta.runsDone = runs.size;
  }

  // Replay for the model check: the chance of a right answer the memory model alone gives
  // for each answer more than an hour after the previous one, under a given decay.
  static replayRecall(attempts, strings, frets, d) {
    const sch = new Scheduler(newModel(), strings, frets);
    setDecay(d);
    const out = [];
    for (const a of attempts) {
      const pc = pcOf(a.target);
      const cell = { s: a.s, f: a.f, midi: a.target, pc, key: a.s + ':' + a.f };
      const sp = a.task === 'name' || a.task === 'truefalse' ? 'r' : a.spelling || (isAccidental(pc) ? 's' : 'n');
      const c = sch.model.cards[itemKey(cell.key, sp)];
      if (c && !a.cueTarget && a.task !== 'truefalse' && a.t - c.last > 3600000) out.push({ p: clamp(cardP(c, a.t), 0.01, 0.99), y: a.correct ? 1 : 0 });
      sch.record(a.desc, cell, sp, a.correct, a.ms, a.t, cueOpts(a));
    }
    return out;
  }

  // Use a decay fitted to your answers (null = the FSRS-6 default).
  useDecay(d) {
    this.model.meta.decay = d || null;
    setDecay(d || DEFAULT_DECAY);
  }
}
