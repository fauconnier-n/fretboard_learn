// Chord page logic: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS, tunedStrings } from '../js/instruments.js';
import { pcOf } from '../js/music.js';
import { KNOWN_MIN, addResult, spellAbove } from '../js/intervals.js';
import {
  GROUP, GROUPS, ITEM, ITEMS, QUALITIES, QUALITY, SHAPES, SHAPE, available, buildState, cardKey, dueKeys, gradeCap,
  grip, hear, isRightName, labelLevel, labelsFor, makeProgression, nextBpm, pickChord, promptTimeout, retestAt,
  shownLevel, standardTop6, startBpm, stretch, summary, timeGrade, unlockedKeys,
} from '../js/chords.js';

const std = INSTRUMENTS.guitar6.strings;
const DAY = 86400000;
const midis = (key, strings = std) => grip(ITEM[key], strings).cells.map((c) => c.midi);
const knowAll = (stats, keys) => keys.forEach((k) => { for (let i = 0; i < KNOWN_MIN; i++) addResult(stats, k, true, 1000); });
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test('standardTop6: standard spacing on the top six strings, any shift', () => {
  assert.ok(standardTop6(std));
  assert.ok(standardTop6(tunedStrings('guitar6', 'standard', -1)));
  assert.ok(standardTop6(INSTRUMENTS.guitar7.strings));
  assert.ok(standardTop6(INSTRUMENTS.guitar8.strings));
  assert.ok(!standardTop6(tunedStrings('guitar6', 'drop')));
  for (const b of ['bass4', 'bass5', 'bass6']) assert.ok(!standardTop6(INSTRUMENTS[b].strings), b);
  assert.ok(!standardTop6([38, 45, 50, 55, 59, 64])); // custom D2 A2 D3 G3 B3 E4
});

test('grip of open C, open D, and on a 7-string', () => {
  const g = grip(ITEM['C:open'], std);
  assert.deepEqual(g.cells.map((c) => [c.s, c.f]), [[1, 3], [2, 2], [3, 0], [4, 1], [5, 0]]);
  assert.deepEqual(g.cells.map((c) => c.midi), [48, 52, 55, 60, 64]);
  assert.deepEqual([g.root.s, g.root.f], [1, 3]);
  assert.equal(g.bass, 48);
  assert.deepEqual(g.names, ['C', 'E', 'G']);
  assert.equal(grip(ITEM['D:open'], std).cells.length, 4);
  const g7 = grip(ITEM['C:open'], INSTRUMENTS.guitar7.strings);
  assert.deepEqual(g7.cells.map((c) => c.s), g.cells.map((c) => c.s + 1));
  assert.deepEqual(g7.cells.map((c) => c.midi), [48, 52, 55, 60, 64]);
});

test('movable grips: E and A shapes, power chords', () => {
  const f = ITEM['F:E:1'];
  assert.equal(f.rootPc, 5);
  assert.deepEqual(grip(f, std).cells.map((c) => c.f), [1, 3, 3, 2, 1, 1]);
  assert.ok(ITEM['Bb:A:1']);
  assert.deepEqual(midis('G5:E5:3'), [43, 50, 55]);
  assert.deepEqual(grip(ITEM['Fm:Em:1'], std).cells.map((c) => c.f), [1, 3, 3, 1, 1, 1]);
  assert.deepEqual(grip(ITEM['E:E:12'], std).cells.map((c) => c.f), [12, 14, 14, 13, 12, 12]);
  assert.ok(available(ITEM['E:E:12'], 14) && !available(ITEM['E:E:12'], 13));
});

test('qualities: 19, degrees as in the table, spelled by function', () => {
  assert.equal(QUALITIES.length, 19);
  assert.deepEqual(QUALITY.dim7.degs, ['R', 'b3', 'b5', 'bb7']);
  assert.deepEqual(QUALITY.dim7.semis, [0, 3, 6, 9]);
  assert.deepEqual(QUALITY['7#5'].semis, [0, 4, 8, 10]);
  assert.deepEqual(QUALITY.mmaj7.semis, [0, 3, 7, 11]);
  assert.deepEqual(QUALITY.sus2.semis, [0, 2, 7]);
  const spell = (q) => QUALITY[q].degs.map((d) => spellAbove('C', ...{ R: [0, 0], b3: [2, 3], b5: [4, 6], bb7: [6, 9], 3: [2, 4], '#5': [4, 8], 7: [6, 11] }[d]));
  assert.deepEqual(spell('dim7'), ['C', 'Eb', 'Gb', 'Bbb']);
  assert.deepEqual(spell('maj7#5'), ['C', 'E', 'G#', 'B']);
  const cdim7 = ITEMS.find((it) => it.label === 'Cdim7');
  assert.deepEqual(grip(cdim7, std).names, ['C', 'Eb', 'Gb', 'Bbb']);
});

test('every shape: its quality\'s pitch classes, the right bass, stretch <= 4', () => {
  for (const sh of SHAPES) {
    const q = QUALITY[sh.q];
    const degs = new Set(sh.deg.filter(Boolean));
    assert.ok(!degs.has('?'), `${sh.id}: a note outside ${q.id}`);
    // every degree but a perfect 5th must be there; shells leave the 5th out
    for (const d of q.degs) if (d !== '5' && !(sh.kind === 'shell' && /5/.test(d))) assert.ok(degs.has(d), `${sh.id} misses ${d}`);
    if (sh.kind === 'shell') assert.ok(![...degs].some((d) => /5/.test(d)), `${sh.id} has a 5th`);
    if (sh.kind === 'triad' || sh.kind === 'power') assert.deepEqual(degs, new Set(q.degs), sh.id);
    const bass = sh.deg.find(Boolean);
    assert.equal(bass, sh.kind === 'triad' ? q.degs[sh.inv] : 'R', `${sh.id} bass`);
    assert.ok(stretch(sh) <= 4, `${sh.id} stretch`);
    assert.equal(sh.deg[sh.root], 'R');
  }
  assert.equal(SHAPES.filter((s) => s.kind === 'triad').length, 72);
  assert.equal(SHAPES.filter((s) => s.kind === 'shell').length, 18);
  assert.equal(SHAPES.filter((s) => s.kind === 'power').length, 4);
  // triad degrees in the asked order, low to high
  assert.deepEqual(SHAPE['tri-GBe-m-1'].deg.filter(Boolean), ['b3', '5', 'R']);
});

test('every item: distinct midis, root pc, unique keys, exactly one group, DAG sound', () => {
  assert.equal(new Set(ITEMS.map((it) => it.key)).size, ITEMS.length);
  for (const it of ITEMS) {
    const g = grip(it, std);
    assert.equal(new Set(g.cells.map((c) => c.midi)).size, g.cells.length, it.key);
    assert.equal(pcOf(g.root.midi), it.rootPc, it.key);
    assert.ok(g.cells.every((c) => c.f >= 0), it.key);
  }
  const seen = new Map();
  assert.equal(new Set(GROUPS.map((g) => g.id)).size, GROUPS.length);
  for (const g of GROUPS) for (const k of g.keys) seen.set(k, (seen.get(k) || 0) + 1);
  for (const it of ITEMS) assert.equal(seen.get(it.key), 1, it.key);
  for (const g of GROUPS) {
    if (g.after) assert.ok(GROUP[g.after], g.after);
    // parents come first, so walking `after` always ends
    const seenIds = new Set();
    for (let a = g; a; a = a.after && GROUP[a.after]) { assert.ok(!seenIds.has(a.id), 'cycle at ' + g.id); seenIds.add(a.id); }
    if (g.after) assert.ok(GROUPS.indexOf(GROUP[g.after]) < GROUPS.indexOf(g));
  }
});

test('unlock DAG: open group 1 opens power naturals and open group 2, not barre', () => {
  const stats = new Map();
  assert.deepEqual(unlockedKeys(stats), GROUP['open-1'].keys);
  knowAll(stats, GROUP['open-1'].keys);
  const open = unlockedKeys(stats);
  assert.ok(GROUP['power-E'].keys.every((k) => open.includes(k)));
  assert.ok(GROUP['open-2'].keys.every((k) => open.includes(k)));
  assert.ok(!open.includes('F:E:1'));
  assert.ok(!open.includes('C:tri-GBe-maj-0:5'));
  // a group stays shut while one item has only 4 answers
  const [last, ...rest] = GROUP['open-2'].keys;
  knowAll(stats, rest);
  for (let i = 0; i < KNOWN_MIN - 1; i++) addResult(stats, last, true, 1000);
  assert.ok(!unlockedKeys(stats).includes(GROUP['open-3'].keys[0]));
  addResult(stats, last, true, 1000);
  const now = unlockedKeys(stats);
  assert.ok(now.includes(GROUP['open-3'].keys[0]));
  assert.ok(GROUP['tri-GBe-0-nat'].keys.every((k) => now.includes(k)));
});

test('hear: any order, ringing ignored, octave or foreign note is a miss, done on the last', () => {
  const cur = { left: [48, 52, 55], heard: [] };
  assert.equal(hear(cur, 55), 'tick');
  assert.equal(hear(cur, 55), 'ring');
  assert.equal(hear(cur, 60), 'miss'); // C an octave above the bass
  assert.equal(hear(cur, 49), 'miss');
  assert.equal(hear(cur, 48), 'tick');
  assert.equal(hear(cur, 52), 'done');
});

test('isRightName: root and quality, symmetric chords, power chords', () => {
  const dim7 = ITEMS.find((it) => it.label === 'Cdim7');
  for (const pc of [0, 3, 6, 9]) assert.ok(isRightName(dim7, pc, 'dim7'), String(pc));
  assert.ok(!isRightName(dim7, 1, 'dim7'));
  const aug = ITEM['C:open'] && ITEMS.find((it) => it.label === 'Caug');
  assert.ok(isRightName(aug, 4, 'aug') && isRightName(aug, 8, 'aug') && !isRightName(aug, 3, 'aug'));
  assert.ok(isRightName(ITEM['C:open'], 0, 'maj'));
  assert.ok(!isRightName(ITEM['C:open'], 0, 'm'));
  assert.ok(!isRightName(ITEM['C6:open'], 9, 'm7')); // same notes as Am7, but the bass shows C
  assert.ok(isRightName(ITEM['G5:E5:3'], 7, '5'));
});

test('promptTimeout and retestAt', () => {
  assert.equal(promptTimeout(grip(ITEM['E:open'], std).cells), 13000);
  assert.equal(promptTimeout(3), 8500);
  for (const r of [0, 0.5, 0.999]) {
    const n = retestAt(10, () => r);
    assert.ok(n >= 13 && n <= 18, String(n));
  }
});

test('timeGrade: wrong, first answers, own fast and slow times, cap', () => {
  const stats = new Map();
  assert.equal(timeGrade(undefined, false, 1000), 1);
  assert.equal(timeGrade(undefined, true, 500), 3);
  for (const ms of [2000, 2200, 1800, 2100]) addResult(stats, 'k', true, ms);
  const st = stats.get('k');
  assert.equal(timeGrade(st, true, 900), 4);
  assert.equal(timeGrade(st, true, 2000), 3);
  assert.equal(timeGrade(st, true, 6000), 2);
  assert.equal(timeGrade(st, true, 900, 2), 2);
});

test('dueKeys, pickChord: due first, never prev', () => {
  const now = 100 * DAY;
  const cards = { a: { S: 1, D: 5, last: now - 30 * DAY }, b: { S: 100, D: 5, last: now - DAY } };
  assert.deepEqual(dueKeys(cards, now), ['a']);
  const stats = new Map();
  for (let i = 0; i < 20; i++) assert.equal(pickChord(['a', 'b', 'c'], stats, cards, null, now, () => i / 20), 'a');
  for (let i = 0; i < 20; i++) assert.notEqual(pickChord(['a', 'b', 'c'], stats, cards, 'a', now, () => i / 20), 'a');
  // name cards are key + ':r'
  assert.equal(pickChord(['a', 'b'], stats, { 'b:r': cards.a }, null, now, () => 0, 'name'), 'b');
});

// rows of one run: [key, correct] pairs
let clock = 1;
const run = (id, pairs, task = 'chord', cue = 0) => pairs.map(([chord, correct]) => ({ chord, task, correct, ms: 2000, t: clock++ * 1000, runId: id, chordCue: cue }));

test('buildState: replay, cards per task, label levels one step per run', () => {
  const rows = [
    ...run('r1', [['C:open', true], ['C:open', true], ['G:open', false]]),
    ...run('r2', [['C:open', true], ['G:open', false], ['G:open', true]]),
    ...run('r3', [['C:open', false], ['C:open', true]]),
    ...run('r4', [['C:open', true]], 'chord-name'),
  ];
  const s = buildState(rows);
  assert.ok(s.cards['C:open'] && s.cards['C:open:r']);
  assert.equal(s.stats.get('C:open').n, 5);
  assert.equal(labelLevel(s, 'C:open', 'play'), 1); // up, up, down
  assert.equal(labelLevel(s, 'G:open', 'play'), 0); // down (floor 0), down
  assert.equal(labelLevel(s, 'C:open', 'name'), 1);
  assert.equal(labelLevel(s, 'D:open', 'play'), 0); // never seen, new shape
  assert.equal(cardKey('C:open', 'chord-name'), 'C:open:r');
});

test('label levels: a new root of a known shape starts one below its best', () => {
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(...run('m' + i, [['F:E:1', true]], 'chord', i));
  const s = buildState(rows);
  assert.equal(labelLevel(s, 'F:E:1', 'play'), 3);
  assert.equal(labelLevel(s, 'G:E:3', 'play'), 2);
  assert.equal(labelLevel(s, 'G:E:3', 'name'), 0); // Name has its own levels
  assert.equal(labelLevel(s, 'Bb:A:1', 'play'), 0); // another shape
});

test('labelsFor: 5th, then 7th, then 3rd, then root go; triads skip level 2 for Name', () => {
  const g7 = ITEM['G7:open'];
  assert.deepEqual(labelsFor(g7, 0, 'name').labels, ['R', '3', '5', 'b7']);
  assert.deepEqual(labelsFor(g7, 1, 'name').labels, ['R', '3', 'b7']);
  assert.deepEqual(labelsFor(g7, 2, 'name').labels, ['R', '3', 'b7']);
  assert.deepEqual(labelsFor(g7, 3, 'name').labels, ['R']);
  assert.deepEqual(labelsFor(g7, 4, 'name').labels, []);
  assert.deepEqual(labelsFor(g7, 0, 'play'), { draw: 'grip', labels: ['R', '3', '5', 'b7'], list: [] });
  assert.deepEqual(labelsFor(g7, 1, 'play').labels, ['R', '3']);
  assert.deepEqual(labelsFor(g7, 2, 'play'), { draw: 'root', labels: [], list: ['R', '3', '5', 'b7'] });
  assert.equal(labelsFor(g7, 3, 'play').draw, 'root');
  assert.equal(labelsFor(g7, 4, 'play').draw, 'none');
  // a triad's Name level goes 1 -> 3 -> 4 and back 3 -> 1
  const rows = [];
  for (let i = 0; i < 2; i++) rows.push(...run('t' + i, [['C:open', true]], 'chord-name'));
  assert.equal(labelLevel(buildState(rows), 'C:open', 'name'), 3);
  rows.push(...run('t9', [['C:open', false]], 'chord-name'));
  assert.equal(labelLevel(buildState(rows), 'C:open', 'name'), 1);
});

test('grade caps by level; check-ups and re-tests show no labels', () => {
  assert.deepEqual(gradeCap(0), { maxG: 2, speed: false });
  assert.deepEqual(gradeCap(1), { maxG: 2, speed: false });
  assert.deepEqual(gradeCap(2), { maxG: 3, speed: true });
  assert.deepEqual(gradeCap(3), { maxG: 3, speed: true });
  assert.deepEqual(gradeCap(4), { maxG: 4, speed: true });
  assert.equal(shownLevel(0, { retest: true }), 4);
  assert.equal(shownLevel(1, { n: 9 }), 4);
  assert.equal(shownLevel(1, { n: 3 }), 1);
  // labelled answers are not timed: their ms does not enter the item's times
  const s = buildState(run('x', [['A:open', true]], 'chord', 0));
  assert.ok(Number.isNaN(s.stats.get('A:open').results[0].ms));
});

test('summary: known, learning, due now and tomorrow', () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(...run('s' + i, [['E:open', true], ['A:open', i > 3]], 'chord', 4));
  const s = buildState(rows);
  const last = rows[rows.length - 1].t;
  const sum = summary(s, last);
  assert.equal(sum.known, 1);
  assert.equal(sum.learning, 1);
  assert.equal(sum.due, 0);
  assert.ok(summary(s, last + 365 * DAY).due === 2);
  assert.ok(sum.dueTomorrow >= sum.due);
});

test('makeProgression: resolves to open grips; fallback of 4 different grips', () => {
  const open = ['G', 'C', 'D', 'Em', 'Am', 'E', 'A', 'Dm'].map((l) => l + ':open');
  const stats = new Map();
  for (let i = 0; i < 40; i++) {
    const p = makeProgression(open, stats, null, seq(i / 40, (i * 7 % 40) / 40, 0.3, 0.6));
    assert.ok(p.keys.length >= 2);
    p.keys.forEach((k, j) => { assert.ok(open.includes(k)); assert.equal(ITEM[k].label, p.labels[j]); });
  }
  // key G, I IV V I
  const g = makeProgression(open, stats, null, seq(0, 0));
  assert.deepEqual(g.labels, ['G', 'C', 'D', 'G']);
  assert.deepEqual(g.keys, ['G:open', 'C:open', 'D:open', 'G:open']);
  const odd = ['Ddim:open', 'Bm7b5:open', 'Adim7:open', 'Caug:open', 'E7sus4:open'];
  const f = makeProgression(odd, stats, null, seq(0.1, 0.5, 0.9));
  assert.equal(f.tonic, null);
  assert.equal(f.keys.length, 4);
  assert.equal(new Set(f.keys).size, 4);
});

test('tempo: start from the median right time, +3 % / -7 %, clamped', () => {
  assert.equal(startBpm([]), 60);
  assert.equal(startBpm([1000, 2000, 3000]), 48); // 4 beats = 5 s
  assert.equal(startBpm([100]), 120);
  assert.equal(startBpm([60000]), 40);
  assert.equal(nextBpm(100, true), 103);
  assert.equal(nextBpm(100, false), 93);
  assert.equal(nextBpm(120, true), 120);
  assert.equal(nextBpm(40, false), 40);
});
