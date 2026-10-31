// Intervals tab logic: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../js/instruments.js';
import {
  GROUPS, ITEM, ITEMS, KNOWN_MIN, accuracy, addResult, buildStats, isKnown, isReference, isRight,
  itemState, makePrompt, pickItem, rootsFor, spellAbove, unlockedKeys,
} from '../js/intervals.js';

const std = INSTRUMENTS.guitar6.tunings.standard.strings;
const at = (roots, s, f) => roots.find((r) => r.s === s && r.f === f);
const knowAll = (stats, keys) => keys.forEach((k) => { for (let i = 0; i < KNOWN_MIN; i++) addResult(stats, k, true, 1000); });

test('octave shape two strings up: +2 frets, +3 across the B string', () => {
  const roots = rootsFor(ITEM.oct2_up, std, 15);
  assert.deepEqual(at(roots, 0, 5).cells, [{ s: 2, f: 7 }]); // A on low E -> D string fret 7
  assert.deepEqual(at(roots, 1, 3).cells, [{ s: 3, f: 5 }]); // C on A -> G string fret 5
  assert.deepEqual(at(roots, 2, 5).cells, [{ s: 4, f: 8 }]); // G on D -> B string fret 8
  assert.deepEqual(at(roots, 3, 5).cells, [{ s: 5, f: 8 }]); // C on G -> high e fret 8
  assert.equal(at(roots, 0, 5).targets[0], 57);
});

test('octave shape down and three strings away', () => {
  const down = rootsFor(ITEM.oct2_down, std, 15);
  assert.deepEqual(at(down, 4, 8).cells, [{ s: 2, f: 5 }]); // G on B -> D string fret 5
  const up3 = rootsFor(ITEM.oct3_up, std, 15);
  assert.deepEqual(at(up3, 0, 8).cells, [{ s: 3, f: 5 }]); // C on low E -> G string fret 5
  assert.deepEqual(at(up3, 1, 3).cells, [{ s: 4, f: 1 }]); // C on A -> B string fret 1
});

test('roots only where the octave-shape target exists', () => {
  const up = rootsFor(ITEM.oct2_up, std, 12);
  assert.ok(up.every((r) => r.s <= 3), 'no string two above the B and e strings');
  assert.ok(!at(up, 3, 12), 'G string fret 12 needs e fret 15, off a 12-fret neck');
  assert.ok(at(up, 3, 9));
  assert.ok(rootsFor(ITEM.oct2_down, std, 12).every((r) => r.s >= 2));
  assert.ok(rootsFor(ITEM.oct3_up, std, 12).every((r) => r.s <= 2));
  const seven = rootsFor(ITEM.oct3_down, INSTRUMENTS.guitar7.tunings.standard.strings, 15);
  assert.ok(seven.length && seven.every((r) => r.s >= 3));
});

test('intervals and triads only where every note is within reach', () => {
  for (const it of ITEMS.filter((x) => x.type === 'interval' || x.type === 'triad')) {
    const roots = rootsFor(it, std, 15);
    assert.ok(roots.length > 20, it.key);
    for (const r of roots) {
      r.cells.forEach((c, i) => {
        assert.equal(std[c.s] + c.f, r.targets[i], it.key);
        assert.ok(Math.abs(c.f - r.f) <= 4 && c.f <= 15, it.key);
      });
    }
  }
  // the highest note on the neck has nothing above it
  assert.ok(!at(rootsFor(ITEM.P5_up, std, 15), 5, 15));
});

test('answer checking: exact pitch, triad steps, any octave for degrees', () => {
  const rand = () => 0.5;
  const p5 = makePrompt(ITEM.P5_up, std, 15, null, rand);
  assert.ok(isRight(p5, p5.root.midi + 7));
  assert.ok(!isRight(p5, p5.root.midi + 19), 'an octave higher is not the asked note');
  assert.ok(isReference(p5, p5.root.midi));
  const tri = makePrompt(ITEM.triad_min, std, 15, null, rand);
  const m = tri.root.midi;
  assert.deepEqual(tri.targets, [m, m + 3, m + 7]);
  assert.ok(isRight(tri, m, 0) && isRight(tri, m + 3, 1) && isRight(tri, m + 7, 2));
  assert.ok(!isRight(tri, m + 4, 1), 'major third in a minor triad');
  assert.ok(!isRight(tri, m + 7, 1), 'out of order');
  assert.ok(isReference(tri, m, 1) && !isReference(tri, m, 0));
  const deg = makePrompt(ITEM.deg5, std, 15, null, () => 0); // root C
  assert.equal(deg.rootName, 'C');
  assert.equal(deg.root, null);
  assert.ok(isRight(deg, 43) && isRight(deg, 67) && !isRight(deg, 60));
  assert.ok(deg.cells.every((c) => (std[c.s] + c.f) % 12 === 7));
});

test('note spelling follows the letters', () => {
  assert.equal(spellAbove('A', 2, 4), 'C#');
  assert.equal(spellAbove('Eb', 4, 7), 'Bb');
  assert.equal(spellAbove('F', 3, 6), 'B'); // tritone as an augmented 4th
  assert.equal(spellAbove('D', 2, 3), 'F');
  assert.equal(makePrompt(ITEM.deg7, std, 15, null, () => 6 / 11).names[0], 'E#'); // 7th of F#
});

test('unlock order: octave shapes first, then one item at a time', () => {
  const stats = new Map();
  assert.deepEqual(unlockedKeys(stats), ['oct2_up', 'oct2_down']);
  knowAll(stats, ['oct2_up']);
  assert.deepEqual(unlockedKeys(stats), ['oct2_up', 'oct2_down'], 'both directions must be known');
  knowAll(stats, ['oct2_down']);
  assert.deepEqual(unlockedKeys(stats), ['oct2_up', 'oct2_down', 'oct3_up', 'oct3_down']);
  knowAll(stats, ['oct3_up', 'oct3_down']);
  assert.equal(unlockedKeys(stats).at(-1), 'P5_up');
  assert.equal(itemState(stats, 'P4_up', unlockedKeys(stats)), 'locked');
  assert.equal(itemState(stats, 'P5_up', unlockedKeys(stats)), 'learning');
  // the whole list ends with the triads, then the scale degrees
  const order = GROUPS.flat();
  assert.equal(order.length, ITEMS.length);
  assert.ok(order.indexOf('triad_maj') > order.indexOf('TT_up'));
  assert.ok(order.indexOf('triad_maj') < order.indexOf('triad_min'));
  assert.ok(order.indexOf('deg5') > order.indexOf('triad_min'));
});

test('known needs 5 answers and 80% recent accuracy, and unlocking does not go back', () => {
  const stats = new Map();
  for (let i = 0; i < 4; i++) addResult(stats, 'oct2_up', true, 900);
  assert.ok(!isKnown(stats.get('oct2_up')));
  addResult(stats, 'oct2_up', true, 900);
  assert.ok(isKnown(stats.get('oct2_up')));
  addResult(stats, 'oct2_up', false, 8000);
  addResult(stats, 'oct2_up', false, 8000);
  assert.ok(accuracy(stats.get('oct2_up')) < 0.8, 'recent misses weigh more');
  assert.ok(!isKnown(stats.get('oct2_up')));
  assert.ok(stats.get('oct2_up').everKnown);
  knowAll(stats, ['oct2_down']);
  assert.ok(unlockedKeys(stats).includes('oct3_up'));
  // the same answers read back from the log give the same stats
  const rows = [...Array(5)].map(() => ({ interval: 'oct2_up', correct: true, ms: 900 }));
  assert.ok(isKnown(buildStats(rows).get('oct2_up')));
});

test('picking favours new and weak items and avoids repeats', () => {
  const stats = new Map();
  knowAll(stats, ['oct2_up']);
  for (let i = 0; i < 10; i++) addResult(stats, 'oct2_up', true, 900);
  const counts = { oct2_up: 0, oct2_down: 0 };
  let x = 0;
  const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 1000; i++) counts[pickItem(['oct2_up', 'oct2_down'], stats, null, rand)]++;
  assert.ok(counts.oct2_down > counts.oct2_up * 2, JSON.stringify(counts));
  assert.equal(pickItem(['oct2_up', 'oct2_down'], stats, 'oct2_down', () => 0.99), 'oct2_up');
});

test('prompts avoid the previous root', () => {
  const first = makePrompt(ITEM.oct2_up, std, 15, null, () => 0);
  const next = makePrompt(ITEM.oct2_up, std, 15, first, () => 0);
  assert.notDeepEqual([next.root.s, next.root.f], [first.root.s, first.root.f]);
});
