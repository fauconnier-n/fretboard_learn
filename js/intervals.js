// @ts-check
// Intervals tab: the items in the order they are taught, the unlock rule, prompt
// generation and answer checking. Pure logic, no DOM, so it can be tested in Node.

import { pcOf, stringName } from './music.js';

// Root names as keys are usually written (Bb major, not A# major).
export const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTERS = 'CDEFGAB';
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ORDINAL = { 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };
const MAJOR = { 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }; // scale degree -> semitones above the root

export const REACH = 4; // frets either side of the root a hand covers without moving
export const KNOWN_MIN = 5; // answers before an item can count as known
export const KNOWN_ACC = 0.8; // recent accuracy to count as known
const DECAY = 0.8; // weight of each older answer in the recent accuracy
const KEEP = 20; // answers kept per item for accuracy and time

// [key, semitones, letter steps, name]. Order: shapes a guitarist already uses first
// (power chord 5th, same fret on the next string 4th), then the two thirds that build
// triads, the sixths (inverted thirds), the seconds and sevenths (one step from the root
// or its octave), and the tritone last, as the one interval no common shape gives away.
const INTERVALS = [
  ['P5', 7, 4, 'Perfect 5th'], ['P4', 5, 3, 'Perfect 4th'],
  ['M3', 4, 2, 'Major 3rd'], ['m3', 3, 2, 'Minor 3rd'],
  ['M6', 9, 5, 'Major 6th'], ['m6', 8, 5, 'Minor 6th'],
  ['M2', 2, 1, 'Major 2nd'], ['m7', 10, 6, 'Minor 7th'],
  ['M7', 11, 6, 'Major 7th'], ['m2', 1, 1, 'Minor 2nd'],
  ['TT', 6, 3, 'Tritone'],
];
const DEGREES = [5, 4, 3, 6, 2, 7]; // most used degrees first

/** @typedef {{ key: string, type: 'oct'|'interval'|'triad'|'degree', label: string, span?: number, dir?: number, semis?: number, steps?: number, name?: string, third?: number, deg?: number }} Item */

/** @type {Item[]} */
export const ITEMS = [
  { key: 'oct2_up', type: 'oct', span: 2, dir: 1, label: 'Octave, 2 strings up' },
  { key: 'oct2_down', type: 'oct', span: 2, dir: -1, label: 'Octave, 2 strings down' },
  { key: 'oct3_up', type: 'oct', span: 3, dir: 1, label: 'Octave, 3 strings up' },
  { key: 'oct3_down', type: 'oct', span: 3, dir: -1, label: 'Octave, 3 strings down' },
  ...INTERVALS.map(([k, semis, steps, name]) => /** @type {Item} */ ({ key: k + '_up', type: 'interval', semis, steps, name, label: name + ' above' })),
  { key: 'triad_maj', type: 'triad', third: 4, label: 'Major triad' },
  { key: 'triad_min', type: 'triad', third: 3, label: 'Minor triad' },
  ...DEGREES.map((deg) => /** @type {Item} */ ({ key: 'deg' + deg, type: 'degree', deg, semis: MAJOR[deg], label: `${ORDINAL[deg]} of the scale` })),
];
export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.key, it]));

// Unlocked together: the two directions of one octave shape, then one item at a time.
export const GROUPS = [
  ['oct2_up', 'oct2_down'],
  ['oct3_up', 'oct3_down'],
  ...ITEMS.filter((it) => it.type !== 'oct').map((it) => [it.key]),
];

// ---------- note names ----------

export function pcFromName(name) {
  let pc = LETTER_PC[LETTERS.indexOf(name[0])];
  for (const c of name.slice(1)) pc += c === '#' ? 1 : c === 'b' ? -1 : 0;
  return pcOf(pc);
}

// The note `steps` letters and `semis` semitones above a root name: ('A', 2, 4) -> 'C#'.
export function spellAbove(root, steps, semis) {
  const letter = LETTERS[(LETTERS.indexOf(root[0]) + steps) % 7];
  const d = ((((pcFromName(root) + semis - LETTER_PC[LETTERS.indexOf(letter)]) % 12) + 18) % 12) - 6;
  return letter + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d));
}

// ---------- stats ----------
// Per item: total answers, the last KEEP results, and whether it was ever known.
// Known once means it stays unlocked-past, so a bad day does not lock later items again.

/** @typedef {{ n: number, results: { correct: boolean, ms: number }[], everKnown: boolean }} ItemStats */

/** @param {Map<string, ItemStats>} stats */
export function addResult(stats, key, correct, ms) {
  const st = stats.get(key) || { n: 0, results: [], everKnown: false };
  st.n++;
  st.results.push({ correct: !!correct, ms: Number(ms) });
  if (st.results.length > KEEP) st.results.shift();
  if (isKnown(st)) st.everKnown = true;
  stats.set(key, st);
  return st;
}

// rows: { interval, correct, ms } in time order, from the answer log
export function buildStats(rows) {
  /** @type {Map<string, ItemStats>} */
  const stats = new Map();
  for (const r of rows) if (ITEM[r.interval]) addResult(stats, r.interval, r.correct, r.ms);
  return stats;
}

// Recent-weighted accuracy: the newest answer weighs 1, the one before DECAY, and so on.
export function accuracy(st) {
  if (!st?.results.length) return null;
  let w = 1;
  let sum = 0;
  let tot = 0;
  for (let i = st.results.length - 1; i >= 0; i--, w *= DECAY) {
    sum += w * (st.results[i].correct ? 1 : 0);
    tot += w;
  }
  return sum / tot;
}

export function medianMs(st) {
  const xs = (st?.results || []).filter((r) => r.correct).map((r) => r.ms).sort((a, b) => a - b);
  return xs.length ? xs[xs.length >> 1] : null;
}

export const isKnown = (st) => !!st && st.n >= KNOWN_MIN && accuracy(st) >= KNOWN_ACC;

// Groups are unlocked in order; the next one opens once every item so far has been known.
export function unlockedKeys(stats) {
  const out = [];
  for (const g of GROUPS) {
    out.push(...g);
    if (!g.every((k) => stats.get(k)?.everKnown)) break;
  }
  return out;
}

export function itemState(stats, key, unlocked) {
  if (!unlocked.includes(key)) return 'locked';
  return isKnown(stats.get(key)) ? 'known' : 'learning';
}

// Weighted towards new and weak items; never the same item twice in a row if there is a choice.
export function pickItem(keys, stats, prevKey, rand = Math.random) {
  const pool = keys.length > 1 ? keys.filter((k) => k !== prevKey) : keys;
  const weights = pool.map((k) => {
    const st = stats.get(k);
    if (!st || st.n < KNOWN_MIN) return 4;
    return 1 + 4 * (1 - accuracy(st));
  });
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) < 0) return pool[i];
  return pool[pool.length - 1];
}

// ---------- prompts ----------

// The position of a pitch closest to the root, within reach of the root's fret.
export function nearPosition(strings, frets, midi, root) {
  let best = null;
  let bd = Infinity;
  strings.forEach((open, s) => {
    const f = midi - open;
    if (f < 0 || f > frets || Math.abs(f - root.f) > REACH) return;
    const d = (s - root.s) ** 2 + ((f - root.f) / 2) ** 2;
    if (d < bd) { bd = d; best = { s, f }; }
  });
  return best;
}

// Every root position whose answer fits on the neck, with the expected answer positions.
export function rootsFor(item, strings, frets) {
  const out = [];
  for (let s = 0; s < strings.length; s++) {
    for (let f = 0; f <= frets; f++) {
      const root = { s, f, midi: strings[s] + f };
      const ans = answerFor(item, root, strings, frets);
      if (ans) out.push({ ...root, ...ans });
    }
  }
  return out;
}

function answerFor(item, root, strings, frets) {
  if (item.type === 'oct') {
    const t = root.s + item.dir * item.span;
    if (t < 0 || t >= strings.length) return null; // that string does not exist
    const midi = root.midi + 12 * item.dir;
    const f = midi - strings[t];
    if (f < 0 || f > frets) return null;
    return { targets: [midi], cells: [{ s: t, f }] };
  }
  const semis = item.type === 'triad' ? [0, item.third, 7] : [item.semis];
  const targets = semis.map((d) => root.midi + d);
  const cells = targets.map((m, i) => (item.type === 'triad' && i === 0 ? { s: root.s, f: root.f } : nearPosition(strings, frets, m, root)));
  return cells.every(Boolean) ? { targets, cells } : null;
}

// One prompt for an item. avoid: the previous prompt, so the same root does not come twice.
export function makePrompt(item, strings, frets, avoid = null, rand = Math.random, flats = false) {
  const str = (s) => `${stringName(strings, s, flats)} string`;
  if (item.type === 'degree') {
    const pcs = [...Array(12).keys()].filter((pc) => pc !== avoid?.rootPc);
    const rootPc = pcs[Math.floor(rand() * pcs.length)];
    const rootName = ROOT_NAMES[rootPc];
    const targetPc = pcOf(rootPc + item.semis);
    const cells = [];
    strings.forEach((open, s) => { for (let f = 0; f <= frets; f++) if (pcOf(open + f) === targetPc) cells.push({ s, f }); });
    return {
      key: item.key, type: item.type, root: null, rootPc, rootName, targets: [], targetPc, cells,
      names: [spellAbove(rootName, item.deg - 1, item.semis)],
      title: `${ORDINAL[item.deg]} of ${rootName}`,
      sub: `The ${ORDINAL[item.deg]} note of the ${rootName} major scale. Any octave, anywhere on the neck.`,
    };
  }
  const all = rootsFor(item, strings, frets);
  if (!all.length) return null;
  const pool = all.filter((r) => !(avoid?.root && r.s === avoid.root.s && r.f === avoid.root.f));
  const r = (pool.length ? pool : all)[Math.floor(rand() * (pool.length || all.length))];
  const rootName = ROOT_NAMES[pcOf(r.midi)];
  const base = { key: item.key, type: item.type, root: { s: r.s, f: r.f, midi: r.midi }, rootPc: pcOf(r.midi), rootName, targets: r.targets, targetPc: pcOf(r.targets[0]), cells: r.cells };
  const where = `${str(r.s)}, fret ${r.f}`;
  if (item.type === 'oct') {
    const up = item.dir > 0;
    return {
      ...base, names: [rootName],
      title: `${rootName}: octave ${up ? 'up' : 'down'}`,
      sub: `${rootName} is on the ${where}. Play it an octave ${up ? 'higher' : 'lower'} on the ${str(r.cells[0].s)}, ${item.span} strings ${up ? 'up' : 'down'}.`,
    };
  }
  if (item.type === 'interval') {
    return {
      ...base, names: [spellAbove(rootName, item.steps, item.semis)],
      title: `${item.name} above ${rootName}`,
      sub: `The root ${rootName} is marked on the ${where}. Play the note a ${item.name.toLowerCase()} above it, close by.`,
    };
  }
  const minor = item.third === 3;
  return {
    ...base, names: [rootName, spellAbove(rootName, 2, item.third), spellAbove(rootName, 4, 7)],
    title: `${rootName} ${minor ? 'minor' : 'major'}`,
    sub: `Play root, 3rd and 5th, in that order, near the marked ${rootName}.`,
  };
}

// ---------- answers ----------

// Right note for step `step` (triads have steps 0, 1, 2; the others only 0).
export function isRight(prompt, midi, step = 0) {
  return prompt.type === 'degree' ? pcOf(midi) === prompt.targetPc : midi === prompt.targets[step];
}

// Notes that are not graded: the marked root when it is not the answer (players often
// sound it first), and in a triad the note just played right ringing again.
export function isReference(prompt, midi, step = 0) {
  if (prompt.type === 'degree') return pcOf(midi) === prompt.rootPc;
  if (prompt.type === 'triad') return step > 0 && midi === prompt.targets[step - 1];
  return midi === prompt.root.midi;
}
