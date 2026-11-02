// @ts-check
// Chord page: qualities, grips (shapes × roots), the unlock DAG, spaced repetition per
// grip, degree labels that fade run after run, the string-by-string check and Changes
// progressions. Pure logic, no DOM, so it can be tested in Node.

import { isAccidental, pcOf } from './music.js';
import { ROOT_NAMES, addResult, isKnown, pcFromName, pickItem, spellAbove } from './intervals.js';
import { DUE_R, fsrsStep, retrievability } from './srs.js';

const DAY = 86400000;
// Grips are written for the top six strings in standard spacing (E A D G B e).
const STD6 = [40, 45, 50, 55, 59, 64];
const SPACING = [5, 5, 5, 4, 5];
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
export const MAX_STRETCH = 4; // frets one hand covers in a grip

// ---------- qualities ----------

/** Degree label -> [semitones above the root, letter steps above the root]. @type {Record<string, [number, number]>} */
export const DEGREES = {
  R: [0, 0], 2: [2, 1], b3: [3, 2], 3: [4, 2], 4: [5, 3], b5: [6, 4], 5: [7, 4], '#5': [8, 4],
  6: [9, 5], bb7: [9, 6], b7: [10, 6], 7: [11, 6],
};
// What a degree tells, for the fading labels: root, 3rd (or what replaces it), 5th, 7th/6th.
const ROLE = { R: 'R', 2: '3', b3: '3', 3: '3', 4: '3', b5: '5', 5: '5', '#5': '5', 6: '7', bb7: '7', b7: '7', 7: '7' };

/** @typedef {{ id: string, sym: string, name: string, degs: string[], semis: number[] }} Quality */

/** @returns {Quality} */
const Q = (id, sym, name, degs) => ({ id, sym, name, degs: degs.split(' '), semis: degs.split(' ').map((d) => DEGREES[d][0]) });

/** Every quality up to the sevenths. id is what a name answer gives; sym is written after the root. @type {Quality[]} */
export const QUALITIES = [
  Q('5', '5', 'power chord', 'R 5'),
  Q('maj', '', 'major', 'R 3 5'),
  Q('m', 'm', 'minor', 'R b3 5'),
  Q('dim', 'dim', 'diminished', 'R b3 b5'),
  Q('aug', 'aug', 'augmented', 'R 3 #5'),
  Q('sus2', 'sus2', 'suspended 2nd', 'R 2 5'),
  Q('sus4', 'sus4', 'suspended 4th', 'R 4 5'),
  Q('6', '6', 'major 6th', 'R 3 5 6'),
  Q('m6', 'm6', 'minor 6th', 'R b3 5 6'),
  Q('7', '7', 'dominant 7th', 'R 3 5 b7'),
  Q('maj7', 'maj7', 'major 7th', 'R 3 5 7'),
  Q('m7', 'm7', 'minor 7th', 'R b3 5 b7'),
  Q('mmaj7', 'm(maj7)', 'minor major 7th', 'R b3 5 7'),
  Q('m7b5', 'm7b5', 'half-diminished 7th', 'R b3 b5 b7'),
  Q('dim7', 'dim7', 'diminished 7th', 'R b3 b5 bb7'),
  Q('7#5', '7#5', 'augmented 7th', 'R 3 #5 b7'),
  Q('maj7#5', 'maj7#5', 'augmented major 7th', 'R 3 #5 7'),
  Q('7sus4', '7sus4', 'dominant 7th sus4', 'R 4 5 b7'),
  Q('7b5', '7b5', 'dominant 7th flat 5', 'R 3 b5 b7'),
];
/** @type {Record<string, Quality>} */
export const QUALITY = Object.fromEntries(QUALITIES.map((q) => [q.id, q]));
// Common qualities first, rare ones last: the teaching order inside every family.
export const QUALITY_ORDER = ['maj', 'm', '7', '5', 'm7', 'maj7', 'sus4', 'sus2', '6', 'm6', 'dim', 'm7b5', 'dim7', 'aug', '7sus4', 'mmaj7', '7#5', '7b5', 'maj7#5'];

// ---------- shapes ----------

/** @typedef {'open'|'barre'|'shell'|'triad'|'power'} Kind */
/**
 * f: six frets low -> high (relative to the root's fret for movable shapes, absolute for
 * open ones), null = not played; root: string index 0-5 of the root cell; deg: degree
 * label per string; inv: 0 root position, 1 first, 2 second inversion; set: triad strings.
 * @typedef {{ id: string, kind: Kind, q: string, f: (number|null)[], root: number, deg: (string|null)[], inv: number, set?: string, label?: string, rootPc?: number }} Shape
 */

/** Degree label of every played string ('?' when a pitch is not in the quality: tests catch it). */
function degsOf(f, root, q) {
  const qy = QUALITY[q];
  const rootMidi = STD6[root] + f[root];
  return f.map((x, i) => (x == null ? null : qy.degs[qy.semis.indexOf(pcOf(STD6[i] + x - rootMidi))] ?? '?'));
}

/** @returns {Shape} */
function shape(id, kind, q, f, root, extra = {}) {
  return { id, kind, q, f, root, deg: degsOf(f, root, q), inv: 0, ...extra };
}

const parse = (s) => [...s].map((c) => (c === 'x' ? null : Number(c)));

// Standard open grips (frets low E -> high e). The 5th is left out where the usual grip
// leaves it out (C7, C6).
const OPEN = [
  ['C', 'maj', 'x32010'], ['A', 'maj', 'x02220'], ['G', 'maj', '320003'], ['E', 'maj', '022100'], ['D', 'maj', 'xx0232'], ['F', 'maj', 'xx3211'],
  ['A', 'm', 'x02210'], ['E', 'm', '022000'], ['D', 'm', 'xx0231'],
  ['E', '7', '020100'], ['A', '7', 'x02020'], ['D', '7', 'xx0212'], ['G', '7', '320001'], ['C', '7', 'x32310'], ['B', '7', 'x21202'],
  ['C', 'maj7', 'x32000'], ['A', 'maj7', 'x02120'], ['D', 'maj7', 'xx0222'], ['E', 'maj7', '021100'], ['F', 'maj7', 'xx3210'], ['G', 'maj7', '320002'],
  ['A', 'm7', 'x02010'], ['E', 'm7', '020000'], ['D', 'm7', 'xx0211'], ['B', 'm7', 'x20202'],
  ['A', 'sus4', 'x02230'], ['D', 'sus4', 'xx0233'], ['E', 'sus4', '022200'],
  ['A', 'sus2', 'x02200'], ['D', 'sus2', 'xx0230'],
  ['C', '6', 'x32210'], ['A', '6', 'x02222'], ['D', '6', 'xx0202'], ['E', '6', '022120'], ['G', '6', '320000'],
  ['A', 'm6', 'x02212'], ['D', 'm6', 'xx0201'], ['E', 'm6', '022020'],
  ['D', 'dim', 'xx0131'],
  ['B', 'm7b5', 'x20201'],
  ['D', 'dim7', 'xx0101'], ['A', 'dim7', 'x01212'],
  ['C', 'aug', 'x32110'], ['E', 'aug', '032110'], ['D', 'aug', 'xx0332'],
  ['A', '7sus4', 'x02030'], ['D', '7sus4', 'xx0213'], ['E', '7sus4', '020200'], ['G', '7sus4', '330011'],
  ['A', 'mmaj7', 'x02110'], ['E', 'mmaj7', '021000'], ['D', 'mmaj7', 'xx0221'],
];

// Movable grips, frets relative to the root's: root on the low E string (E shape) and on
// the A string (A shape). dim/aug and the altered sevenths use their usual 4-string forms.
const X = null;
const BARRE = {
  E: {
    maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], maj7: [0, X, 1, 1, 0, X], m7: [0, 2, 0, 0, 0, 0],
    6: [0, X, 2, 1, 2, X], m6: [0, 2, 2, 0, 2, 0], sus4: [0, 2, 2, 2, 0, 0], '7sus4': [0, 2, 0, 2, 0, 0], mmaj7: [0, 2, 1, 0, 0, 0],
    m7b5: [0, X, 0, 0, -1, X], dim7: [0, X, -1, 0, -1, X], dim: [0, 1, 2, 0, X, X], aug: [0, X, 2, 1, 1, X],
    '7#5': [0, X, 0, 1, 1, X], '7b5': [0, X, 0, 1, -1, X], 'maj7#5': [0, X, 1, 1, 1, X],
  },
  A: {
    maj: [X, 0, 2, 2, 2, 0], m: [X, 0, 2, 2, 1, 0], 7: [X, 0, 2, 0, 2, 0], maj7: [X, 0, 2, 1, 2, 0], m7: [X, 0, 2, 0, 1, 0],
    6: [X, 0, 2, 2, 2, 2], m6: [X, 0, X, -1, 1, 0], sus4: [X, 0, 2, 2, 3, 0], sus2: [X, 0, 2, 2, 0, 0], '7sus4': [X, 0, 2, 0, 3, 0],
    mmaj7: [X, 0, 2, 1, 1, 0], m7b5: [X, 0, 1, 0, 1, X], dim7: [X, 0, 1, -1, 1, X], dim: [X, 0, 1, 2, 1, X], aug: [X, 0, 3, 2, 2, X],
    '7#5': [X, 0, X, 0, 2, 1], '7b5': [X, 0, 1, 0, 2, X], 'maj7#5': [X, 0, X, 1, 2, 1],
  },
};

export const STRING_SETS = { EAD: [0, 1, 2], ADG: [1, 2, 3], DGB: [2, 3, 4], GBe: [3, 4, 5] };
const TRIADS = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4'];
const SHELLS = ['6', 'm6', '7', 'maj7', 'm7', 'mmaj7', 'm7b5', 'dim7', '7sus4'];

/**
 * Each degree on its string (lowest first) at the fret closest to the previous string's,
 * normalised so the root's fret is 0. null when the hand would stretch over MAX_STRETCH.
 * @param {number[]} set string indices 0-5, low to high @param {string[]} degs degree labels, same order
 * @returns {{ f: (number|null)[], root: number } | null}
 */
export function voice(set, degs) {
  const rs = set[degs.indexOf('R')];
  /** @type {(number|null)[]} */
  const f = Array(6).fill(null);
  let prev = null;
  set.forEach((s, i) => {
    const want = pcOf(STD6[rs] + DEGREES[degs[i]][0] - STD6[s]);
    prev = prev == null ? want : prev + ((((want - prev) % 12) + 18) % 12) - 6;
    f[s] = prev;
  });
  const r0 = f[rs];
  const out = f.map((x) => (x == null ? null : x - r0));
  const played = out.filter((x) => x != null);
  return Math.max(...played) - Math.min(...played) > MAX_STRETCH ? null : { f: out, root: rs };
}

/** @type {Shape[]} */
export const SHAPES = [];
for (const [root, q, frets] of OPEN) {
  const f = parse(frets);
  const rootPc = pcFromName(root);
  const rs = f.findIndex((x, i) => x != null && pcOf(STD6[i] + x) === rootPc);
  const label = root + QUALITY[q].sym;
  SHAPES.push(shape('open-' + label, 'open', q, f, rs, { label, rootPc }));
}
SHAPES.push(
  shape('E5', 'power', '5', [0, 2, 2, X, X, X], 0), shape('E5-2', 'power', '5', [0, 2, X, X, X, X], 0),
  shape('A5', 'power', '5', [X, 0, 2, 2, X, X], 1), shape('A5-2', 'power', '5', [X, 0, 2, X, X, X], 1),
);
for (const [letter, table] of Object.entries(BARRE)) {
  for (const [q, f] of Object.entries(table)) SHAPES.push(shape(letter + QUALITY[q].sym, 'barre', q, f, letter === 'E' ? 0 : 1));
}
for (const q of SHELLS) {
  const [, third, , seventh] = QUALITY[q].degs;
  for (const [str, set, degs] of [['E', [0, 2, 3], ['R', seventh, third]], ['A', [1, 2, 3], ['R', third, seventh]]]) {
    const v = voice(/** @type {number[]} */ (set), /** @type {string[]} */ (degs));
    if (v) SHAPES.push(shape(`shell-${str}-${q}`, 'shell', q, v.f, v.root));
  }
}
for (const q of TRIADS) {
  const d = QUALITY[q].degs;
  for (const [set, strs] of Object.entries(STRING_SETS)) {
    for (let inv = 0; inv < 3; inv++) {
      const v = voice(strs, [0, 1, 2].map((i) => d[(i + inv) % 3]));
      if (v) SHAPES.push(shape(`tri-${set}-${q}-${inv}`, 'triad', q, v.f, v.root, { inv, set }));
    }
  }
}
/** @type {Record<string, Shape>} */
export const SHAPE = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

const played = (sh) => sh.f.filter((x) => x != null);
/** Frets the hand spans (open strings left out of open grips). @param {Shape} sh */
export const stretch = (sh) => {
  const fr = played(sh).filter((x) => sh.kind !== 'open' || x > 0);
  return fr.length ? Math.max(...fr) - Math.min(...fr) : 0;
};

// ---------- items: a shape at one root ----------

/** @typedef {{ key: string, label: string, shapeId: string, kind: Kind, base: number, rootPc: number, q: string }} Item */

/** @type {Item[]} */
export const ITEMS = [];
for (const sh of SHAPES) {
  if (sh.kind === 'open') {
    ITEMS.push({ key: `${sh.label}:open`, label: sh.label, shapeId: sh.id, kind: 'open', base: 0, rootPc: sh.rootPc, q: sh.q });
    continue;
  }
  // one grip per root: the lowest root fret 1..12 at which no string goes below fret 0
  const lo = Math.min(...played(sh));
  for (let b = 1; b <= 12; b++) {
    const base = b + lo < 0 ? b + 12 : b;
    const rootPc = pcOf(STD6[sh.root] + base);
    const label = ROOT_NAMES[rootPc] + QUALITY[sh.q].sym;
    ITEMS.push({ key: `${label}:${sh.id}:${base}`, label, shapeId: sh.id, kind: sh.kind, base, rootPc, q: sh.q });
  }
}
/** @type {Record<string, Item>} */
export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.key, it]));

/** How the sub line names a grip's shape, e.g. "E shape at fret 1". @param {Item} it */
export function describe(it) {
  const sh = SHAPE[it.shapeId];
  const on = `root on the ${STRING_NAMES[sh.root]} string`;
  if (it.kind === 'open') return 'open chord';
  if (it.kind === 'barre') return `${sh.id[0]} shape${sh.f.every((x) => x != null) ? ', barre' : ''} at fret ${it.base}`;
  if (it.kind === 'power') return `power chord, ${on}, fret ${it.base}`;
  if (it.kind === 'shell') return `shell (no 5th), ${on}, fret ${it.base}`;
  return `triad on ${sh.set.split('').join('-')}, ${['root position', '1st inversion', '2nd inversion'][sh.inv]}`;
}

/** Whether the top six strings are in standard spacing (any shift): grips need it. @param {number[]} strings open MIDIs, lowest first */
export const standardTop6 = (strings) => strings.length >= 6 && strings.slice(-6).every((m, i, a) => i === 0 || m - a[i - 1] === SPACING[i - 1]);

/** Whether a grip fits on a neck of `frets` frets. @param {Item} item @param {number} frets */
export const available = (item, frets) => Math.max(...played(SHAPE[item.shapeId])) + item.base <= frets;

/** @typedef {{ s: number, f: number, midi: number, deg: string, name: string }} Cell */

/**
 * The cells of a grip on these strings (the top six; s counts from the lowest string),
 * low to high, with degree and spelled note name; root cell, bass midi, chord tones spelled.
 * @param {Item} item @param {number[]} strings
 * @returns {{ cells: Cell[], root: Cell, bass: number, names: string[] }}
 */
export function grip(item, strings) {
  const sh = SHAPE[item.shapeId];
  const off = strings.length - 6;
  const rootName = ROOT_NAMES[item.rootPc];
  const name = (d) => spellAbove(rootName, DEGREES[d][1], DEGREES[d][0]);
  /** @type {Cell[]} */
  const cells = [];
  sh.f.forEach((rel, i) => {
    if (rel == null) return;
    const f = item.base + rel;
    cells.push({ s: off + i, f, midi: strings[off + i] + f, deg: sh.deg[i], name: name(sh.deg[i]) });
  });
  return {
    cells,
    root: cells.find((c) => c.s === off + sh.root),
    bass: cells[0].midi,
    names: QUALITY[item.q].degs.filter((d) => sh.deg.includes(d)).map(name),
  };
}

// ---------- groups: a DAG, each group opens when its `after` group is all known ----------

/** @typedef {{ id: string, keys: string[], after: string|null }} Group */

/** @type {Group[]} */
export const GROUPS = [];
{
  let last = null;
  const add = (id, keys, after = last) => {
    if (keys.length) { GROUPS.push({ id, keys, after }); last = id; }
  };
  const keys = (pred) => ITEMS.filter(pred).map((it) => it.key);
  const nat = (it) => !isAccidental(it.rootPc);
  const acc = (it) => isAccidental(it.rootPc);
  const split = (id, pred) => { add(id + '-nat', keys((it) => pred(it) && nat(it))); add(id + '-acc', keys((it) => pred(it) && acc(it))); };

  // open: the first chords everyone learns, then the other qualities in teaching order
  const op = (labels) => labels.map((l) => l + ':open');
  add('open-1', op(['E', 'A', 'D']), null);
  add('open-2', op(['Am', 'Em', 'Dm']));
  add('open-3', op(['G', 'C']));
  add('open-4', op(['E7', 'A7', 'D7']));
  add('open-5', op(['G7', 'C7', 'B7']));
  add('open-6', op(['F']));
  const done = new Set(GROUPS.flatMap((g) => g.keys));
  for (const q of QUALITY_ORDER) add('open-q-' + q, keys((it) => it.kind === 'open' && it.q === q && !done.has(it.key)));

  // power chords after the first open chords; barre chords after them; shells after barre maj and m
  last = 'open-1';
  const pw = (it, s) => it.kind === 'power' && SHAPE[it.shapeId].root === s;
  add('power-E', keys((it) => pw(it, 0) && nat(it)));
  add('power-A', keys((it) => pw(it, 1) && nat(it)));
  add('power-acc', keys((it) => it.kind === 'power' && acc(it)));
  last = 'power-A';
  let shellsAfter = null;
  for (const q of QUALITY_ORDER) {
    for (const letter of ['E', 'A']) split(`barre-${letter}-${q}`, (it) => it.kind === 'barre' && it.q === q && it.shapeId[0] === letter);
    if (q === 'm') shellsAfter = last;
  }
  last = shellsAfter;
  for (const q of ['7', 'maj7', 'm7', '6', 'm6', 'm7b5', 'dim7', 'mmaj7', '7sus4']) split('shell-' + q, (it) => it.kind === 'shell' && it.q === q);

  // triads after the first open minor chords: major and minor set by set, inversion by inversion
  last = 'open-2';
  const tri = (it, set, qs, inv = null) => {
    const sh = SHAPE[it.shapeId];
    return it.kind === 'triad' && sh.set === set && qs.includes(it.q) && (inv == null || sh.inv === inv);
  };
  for (const set of ['GBe', 'DGB', 'ADG', 'EAD']) for (let inv = 0; inv < 3; inv++) split(`tri-${set}-${inv}`, (it) => tri(it, set, ['maj', 'm'], inv));
  for (const q of ['sus4', 'sus2', 'dim', 'aug']) for (const set of ['GBe', 'DGB', 'ADG', 'EAD']) split(`tri-${set}-${q}`, (it) => tri(it, set, [q]));
}
/** @type {Record<string, Group>} */
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

/** Keys of every open group (a group opens once its `after` group is open and all ever known). @param {Map<string, any>} stats play stats */
export function unlockedKeys(stats) {
  const open = new Set();
  const out = [];
  for (const g of GROUPS) {
    const a = g.after && GROUP[g.after];
    if (a && !(open.has(a.id) && a.keys.every((k) => stats.get(k)?.everKnown))) continue;
    open.add(g.id);
    out.push(...g.keys);
  }
  return out;
}

// ---------- learning: stats, FSRS cards, label levels ----------

/** @typedef {'play'|'name'|'chord'|'chord-name'|'change'} Task  row tasks ('chord', 'chord-name') or run types */
/** @typedef {{ chord: string, task?: string, correct: boolean, ms: number, t: number, chordCue?: number|null, runId?: string|number|null, probe?: boolean, retest?: boolean }} ChordRow */
/** @typedef {{ S: number, D: number, last: number }} Card */
/** @typedef {{ stats: Map<string, import('./intervals.js').ItemStats>, cards: Record<string, Card>, levels: Map<string, number>, best: Map<string, number> }} ChordState */

const isName = (task) => task === 'name' || task === 'chord-name';
/** Card (and stats) key: the item key for Play and Changes, key + ':r' for Name. @param {string} key @param {string} task */
export const cardKey = (key, task) => (isName(task) ? key + ':r' : key);
const bestKey = (key, task) => `${isName(task) ? 'name' : 'play'}|${ITEM[key].shapeId}`;
// Name has no 7th to keep on a triad or power chord: its level 2 is skipped.
const skips2 = (key, task) => isName(task) && QUALITY[ITEM[key].q].degs.length <= 3;
const step = (lv, dir, skip) => {
  let n = lv + dir;
  if (skip && n === 2) n += dir;
  return Math.max(0, Math.min(4, n));
};

/**
 * Memory grade 1-4 of one answer: wrong = 1; fewer than 3 timed right answers = 3;
 * else the log time's z-score against the item's own right times. Capped at maxG.
 * @param {import('./intervals.js').ItemStats|undefined} st stats before this answer @param {boolean} correct @param {number} ms @param {number} [maxG]
 */
export function timeGrade(st, correct, ms, maxG = 4) {
  if (!correct) return 1;
  const logs = (st?.results ?? []).filter((r) => r.correct && Number.isFinite(r.ms)).map((r) => Math.log(Math.max(100, r.ms)));
  if (logs.length < 3) return Math.min(3, maxG);
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.max(0.25, Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length));
  const z = (Math.log(Math.max(100, ms)) - mean) / sd;
  return Math.min(maxG, z < -0.5 ? 4 : z <= 1 ? 3 : 2);
}

/** How a label level caps the grade: 0-1 at most Hard, time ignored; 2-3 at most Good; 4 full. @param {number} level */
export const gradeCap = (level) => (level <= 1 ? { maxG: 2, speed: false } : level <= 3 ? { maxG: 3, speed: true } : { maxG: 4, speed: true });

/** Every 10th prompt of a run (n counted from 0) is a check-up without labels. @param {number} n */
export const isCheckup = (n) => (n + 1) % 10 === 0;

/** The level actually shown: none (4) on re-tests and check-ups. @param {number} level @param {{ retest?: boolean, n?: number }} [o] */
export const shownLevel = (level, { retest = false, n = 0 } = {}) => (retest || isCheckup(n) ? 4 : level);

/** Level of a grip never answered: 0 on a new shape, one below the best reached on its shape otherwise. */
function startLevel(best, key, task) {
  const b = best.get(bestKey(key, task));
  return b == null ? 0 : step(b, -1, skips2(key, task));
}

/**
 * Replays the chord log in time order: stats and FSRS cards per card key, and the label
 * level per card key (one step per run: up after a run with every answer right, down after a miss).
 * @param {ChordRow[]} rows @returns {ChordState}
 */
export function buildState(rows) {
  /** @type {ChordState} */
  const state = { stats: new Map(), cards: {}, levels: new Map(), best: new Map() };
  const { stats, cards, levels, best } = state;
  let run = [];
  let runId;
  const close = () => {
    for (const ck of new Set(run.map((x) => x.ck))) {
      const mine = run.filter((x) => x.ck === ck);
      const { key, task } = mine[0];
      const lv = step(levels.get(ck), mine.every((x) => x.correct) ? 1 : -1, skips2(key, task));
      levels.set(ck, lv);
      const bk = bestKey(key, task);
      best.set(bk, Math.max(best.get(bk) ?? 0, lv));
    }
    run = [];
  };
  for (const r of rows.filter((x) => ITEM[x.chord]).sort((a, b) => a.t - b.t)) {
    const id = r.runId ?? r.t;
    if (run.length && id !== runId) close();
    runId = id;
    const task = r.task ?? 'chord';
    const ck = cardKey(r.chord, task);
    if (!levels.has(ck)) levels.set(ck, startLevel(best, r.chord, task));
    const cap = gradeCap(r.chordCue ?? 4);
    const G = timeGrade(stats.get(ck), r.correct, r.ms, cap.maxG);
    addResult(stats, ck, r.correct, cap.speed ? r.ms : NaN);
    cards[ck] = fsrsStep(cards[ck] ?? null, G, r.t);
    run.push({ ck, key: r.chord, task, correct: !!r.correct });
  }
  close();
  return state;
}

/** Label level 0-4 of a grip for a task (start level when never answered). @param {ChordState} state @param {string} key @param {string} task */
export const labelLevel = (state, key, task) => state.levels.get(cardKey(key, task)) ?? startLevel(state.best, key, task);

/**
 * What the board shows at a label level. draw: 'grip' (every cell), 'root' (root cell only)
 * or 'none'; labels: degree labels written on drawn cells; list: degrees for the sub line.
 * @param {Item} item @param {number} level @param {string} task
 * @returns {{ draw: 'grip'|'root'|'none', labels: string[], list: string[] }}
 */
export function labelsFor(item, level, task) {
  const degs = QUALITY[item.q].degs.filter((d) => SHAPE[item.shapeId].deg.includes(d));
  const keep = (roles) => degs.filter((d) => roles.includes(ROLE[d]));
  if (isName(task)) return { draw: 'grip', labels: keep([['R', '3', '5', '7'], ['R', '3', '7'], ['R', '3', '7'], ['R'], []][level]), list: [] };
  if (level === 0) return { draw: 'grip', labels: degs, list: [] };
  if (level === 1) return { draw: 'grip', labels: keep(['R', '3']), list: [] };
  if (level === 2) return { draw: 'root', labels: [], list: degs };
  if (level === 3) return { draw: 'root', labels: [], list: [] };
  return { draw: 'none', labels: [], list: [] };
}

/** Card keys whose recall has faded below DUE_R. @param {Record<string, Card>} cards @param {number} now */
export const dueKeys = (cards, now) => Object.keys(cards).filter((k) => retrievability(cards[k], now) < DUE_R);

/**
 * Next grip: due ones first (weighted like Intervals), else any open one; never prev twice.
 * @param {string[]} open item keys @param {Map<string, any>} stats @param {Record<string, Card>} cards
 * @param {string|null} prev @param {number} now @param {() => number} [rand] @param {string} [task]
 */
export function pickChord(open, stats, cards, prev, now, rand = Math.random, task = 'play') {
  const pool = open.length > 1 ? open.filter((k) => k !== prev) : open;
  const due = pool.filter((k) => cards[cardKey(k, task)] && retrievability(cards[cardKey(k, task)], now) < DUE_R);
  const byCard = new Map((due.length ? due : pool).map((k) => [cardKey(k, task), k]));
  return byCard.get(pickItem([...byCard.keys()], stats, null, rand));
}

/** Prompt number of a re-test after a miss at prompt n: 3 to 8 prompts later. @param {number} n @param {() => number} [rand] */
export const retestAt = (n, rand = Math.random) => n + 3 + Math.floor(rand() * 6);

/** Counts over every card (Play and Name). @param {ChordState} state @param {number} now */
export function summary(state, now) {
  const keys = Object.keys(state.cards);
  const known = keys.filter((k) => isKnown(state.stats.get(k))).length;
  return {
    known,
    learning: keys.length - known,
    due: dueKeys(state.cards, now).length,
    dueTomorrow: dueKeys(state.cards, now + DAY).length,
  };
}

/** Chip colour of a grip in the items panel. @param {ChordState} state @param {string} key @param {string[]} unlocked @param {number} now @param {string} [task] */
export function chipState(state, key, unlocked, now, task = 'play') {
  if (!unlocked.includes(key)) return 'locked';
  const ck = cardKey(key, task);
  const card = state.cards[ck];
  if (!card) return 'new';
  if (retrievability(card, now) < DUE_R) return 'due';
  return isKnown(state.stats.get(ck)) ? 'known' : 'learning';
}

// ---------- checks ----------

/**
 * One detected note during Play: cur.left holds the midis still expected, cur.heard the
 * ones ticked. Any order; a ticked note ringing again is ignored; anything else (an
 * expected note an octave off too) is a miss.
 * @param {{ left: number[], heard: number[] }} cur @param {number} midi
 * @returns {'tick'|'done'|'ring'|'miss'}
 */
export function hear(cur, midi) {
  const i = cur.left.indexOf(midi);
  if (i >= 0) {
    cur.left.splice(i, 1);
    cur.heard.push(midi);
    return cur.left.length ? 'tick' : 'done';
  }
  return cur.heard.includes(midi) ? 'ring' : 'miss';
}

/**
 * Name the chord: root and quality right. dim7 and aug are symmetric, so any of their
 * 4 (3) roots is right with the same quality.
 * @param {Item} item @param {number} pc root picked @param {string} q quality id picked
 */
export function isRightName(item, pc, q) {
  if (q !== item.q) return false;
  const d = pcOf(pc - item.rootPc);
  return d === 0 || (q === 'dim7' && d % 3 === 0) || (q === 'aug' && d % 4 === 0);
}

/** Time allowed for a Play prompt. @param {any[]|number} cells the grip's cells or their count */
export const promptTimeout = (cells) => 4000 + 1500 * (Array.isArray(cells) ? cells.length : cells);

// ---------- Changes ----------

export const BEATS = 4; // beats per chord in beat mode
export const BPM_MIN = 40;
export const BPM_MAX = 120;
const clampBpm = (b) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(b)));

/** Starting tempo: a bar of BEATS ≈ 2.5 × the median right chord time (60 without data). @param {number[]} rightMs */
export function startBpm(rightMs) {
  if (!rightMs.length) return 60;
  const s = [...rightMs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return clampBpm((60000 * BEATS) / (2.5 * m));
}

/** +3 % after a right chord, -7 % after a miss, within BPM_MIN..BPM_MAX. @param {number} bpm @param {boolean} right */
export const nextBpm = (bpm, right) => clampBpm(bpm * (right ? 1.03 : 0.93));

export const TEMPLATES = [['I', 'IV', 'V', 'I'], ['I', 'V', 'vi', 'IV'], ['I', 'vi', 'IV', 'V'], ['ii', 'V', 'I'], ['i', 'iv', 'v', 'i']];
const ROMAN = { I: 0, ii: 2, IV: 5, V: 7, vi: 9, i: 0, iv: 5, v: 7 };
// Lower-case numerals are minor chords.
const numeralLabel = (tonic, rn) => ROOT_NAMES[pcOf(tonic + ROMAN[rn])] + (rn === rn.toLowerCase() ? 'm' : '');

/**
 * A progression from the open grips: a key and a template whose chords resolve to open
 * grips (same family as the first chord when there is one); chords with no grip are
 * dropped, fewer than two -> another try; at last 4 different random grips.
 * @param {string[]} open item keys @param {Map<string, any>} stats
 * @param {{ keys: string[] }|null} [prev] the previous progression, not repeated
 * @param {() => number} [rand]
 * @returns {{ tonic: string|null, numerals: string[]|null, labels: string[], keys: string[] }}
 */
export function makeProgression(open, stats, prev = null, rand = Math.random) {
  const byLabel = new Map();
  for (const k of open) byLabel.set(ITEM[k].label, [...(byLabel.get(ITEM[k].label) || []), k]);
  const tonics = [...new Set(open.map((k) => ITEM[k].rootPc))];
  for (let tries = 0; tries < 30 && tonics.length; tries++) {
    const tonic = tonics[Math.floor(rand() * tonics.length)];
    const numerals = TEMPLATES[Math.floor(rand() * TEMPLATES.length)].filter((rn) => byLabel.has(numeralLabel(tonic, rn)));
    const labels = numerals.map((rn) => numeralLabel(tonic, rn));
    if (new Set(labels).size < 2) continue;
    let kind = null;
    const chosen = new Map();
    const keys = labels.map((l) => {
      if (!chosen.has(l)) {
        const all = byLabel.get(l);
        const same = all.filter((k) => ITEM[k].kind === kind);
        const k = pickItem(same.length ? same : all, stats, null, rand);
        kind ??= ITEM[k].kind;
        chosen.set(l, k);
      }
      return chosen.get(l);
    });
    if (prev && prev.keys.join() === keys.join()) continue;
    return { tonic: ROOT_NAMES[tonic], numerals, labels, keys };
  }
  const keys = [];
  while (keys.length < Math.min(4, open.length)) keys.push(pickItem(open.filter((k) => !keys.includes(k)), stats, null, rand));
  return { tonic: null, numerals: null, labels: keys.map((k) => ITEM[k].label), keys };
}

