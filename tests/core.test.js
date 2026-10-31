// Pure-logic tests, no browser needed: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freqToMidi, midiToFreq, noteName, stringName, positionsOf, spellingsOf } from '../js/music.js';
import { fluency, forgetting, errorType, similarity, itemKey } from '../js/srs.js';
import { selfTest } from '../js/zones.js';
import { INSTRUMENTS } from '../js/instruments.js';

const ALL_TUNINGS = Object.fromEntries(Object.entries(INSTRUMENTS).flatMap(([i, inst]) => Object.entries(inst.tunings).map(([t, v]) => [i + ' ' + t, v])));

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('pitch maths', () => {
  close(freqToMidi(440), 69);
  close(freqToMidi(82.4069), 40, 1e-3); // low E
  close(freqToMidi(466.16, 466.16), 69); // A4 tuned to another reference
  for (const m of [35, 40, 64, 88]) close(freqToMidi(midiToFreq(m)), m);
});

test('note names and spellings', () => {
  assert.equal(noteName(70), 'A#');
  assert.equal(noteName(70, true), 'Bb');
  assert.equal(noteName(-2), 'A#'); // negative midi still maps to a pitch class
  assert.deepEqual(spellingsOf(1), ['s', 'f']);
  assert.deepEqual(spellingsOf(0), ['n']);
  const std = INSTRUMENTS.guitar6.tunings.standard.strings;
  assert.equal(stringName(std, 0), 'E');
  assert.equal(stringName(std, 5), 'e');
  assert.equal(stringName(INSTRUMENTS.guitar6.tunings.dropD.strings, 0), 'D');
});

test('positionsOf finds every place a note sits', () => {
  const pos = positionsOf(INSTRUMENTS.guitar6.tunings.standard.strings, 22, 64); // E4: fret 24 on low E is off the neck
  assert.deepEqual(pos, [{ s: 1, f: 19 }, { s: 2, f: 14 }, { s: 3, f: 9 }, { s: 4, f: 5 }, { s: 5, f: 0 }]);
  assert.deepEqual(positionsOf(INSTRUMENTS.guitar6.tunings.standard.strings, 22, 39), []);
});

test('every zone holds the 12 pitch classes and the zones cover the neck', () => {
  for (const [name, t] of Object.entries(ALL_TUNINGS)) {
    for (const frets of [12, 15, 21, 22, 24]) {
      for (const types of ['both', 'string', 'box']) {
        const r = selfTest(t.strings, frets, types);
        assert.ok(r.zones > 0, `${name} ${frets} ${types}: no zones`);
        assert.deepEqual(r.bad, [], `${name} ${frets} ${types}: bad zones`);
        if (types === 'both') assert.deepEqual(r.uncovered, [], `${name} ${frets}: uncovered cells`);
      }
    }
  }
});

test('FSRS forgetting curve is 90% at t = S', () => {
  for (const S of [0.5, 3, 40]) for (const d of [0.2, 0.5, 1]) close(forgetting(S, S, d), 0.9);
  close(forgetting(5, 0), 1);
  assert.ok(forgetting(5, 10) < forgetting(5, 6));
});

test('fluency is 1 at 0.6 s, 0 at 10 s, clamped outside', () => {
  close(fluency(600), 1);
  close(fluency(10000), 0);
  assert.equal(fluency(100), 1);
  assert.equal(fluency(60000), 0);
  assert.ok(fluency(2000) > fluency(4000));
});

test('errorType classifies wrong notes', () => {
  assert.equal(errorType(60, null), null);
  assert.equal(errorType(60, 72), 'octave');
  assert.equal(errorType(60, 61), 'semitone_sharp');
  assert.equal(errorType(60, 58), 'tone_flat');
  assert.equal(errorType(60, 65), 'other');
});

test('zone similarity is 1 for identical shapes and drops with distance', () => {
  const a = { type: 'box', sk: '0,1,2', cs: 1, cf: 5, span: 4 };
  close(similarity(a, a), 1);
  assert.ok(similarity(a, { ...a, cf: 9 }) < similarity(a, { ...a, cf: 6 }));
  assert.ok(similarity(a, { ...a, type: 'string' }) < 0.5);
});

test('itemKey adds the spelling only for accidentals', () => {
  assert.equal(itemKey('2:5', 'n'), '2:5');
  assert.equal(itemKey('2:6', 'f'), '2:6:f');
});
