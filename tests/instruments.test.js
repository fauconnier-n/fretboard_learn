// Instruments, tunings and how knowledge follows strings between them: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS, attemptStrings, mapAttempt, parseTuning, resolveTuning, stringKeys } from '../js/instruments.js';
import { Scheduler, newModel } from '../js/srs.js';

const keysOf = (inst, tun = 'standard') => stringKeys(inst, INSTRUMENTS[inst].tunings[tun].strings);
// an answer on string s of an instrument
const answer = (inst, tun, s) => ({ t: 1, s, f: 3, instrument: inst, strings: INSTRUMENTS[inst].tunings[tun].strings.join(','), desc: { sk: '0,1,2', cs: 1 } });

test('default is a 6-string guitar in standard tuning', () => {
  assert.deepEqual(resolveTuning({}).strings, [40, 45, 50, 55, 59, 64]);
});

test('adding a lower string: that string is new, the others keep their answers', () => {
  const bass5 = keysOf('bass5');
  for (let s = 0; s < 4; s++) assert.equal(mapAttempt(answer('bass4', 'standard', s), bass5).s, s + 1);
  // nothing in a 4-string log lands on the low B
  assert.ok([0, 1, 2, 3].every((s) => mapAttempt(answer('bass4', 'standard', s), bass5).s !== 0));
});

test('removing strings changes nothing for the strings kept (guitar to bass)', () => {
  const bass4 = keysOf('bass4');
  assert.deepEqual([0, 1, 2, 3].map((s) => mapAttempt(answer('guitar6', 'standard', s), bass4).s), [0, 1, 2, 3]);
  assert.equal(mapAttempt(answer('guitar6', 'standard', 4), bass4), null); // B string: not on this bass
  assert.equal(mapAttempt(answer('guitar6', 'standard', 5), bass4), null);
});

test('retuning one string (standard to drop D): only that string starts over', () => {
  const dropD = keysOf('guitar6', 'dropD');
  assert.equal(mapAttempt(answer('guitar6', 'standard', 0), dropD), null);
  for (let s = 1; s < 6; s++) assert.equal(mapAttempt(answer('guitar6', 'standard', s), dropD).s, s);
});

test('going back to the earlier instrument keeps every answer as it was', () => {
  const g6 = keysOf('guitar6');
  for (let s = 0; s < 6; s++) {
    const a = answer('guitar6', 'standard', s);
    assert.equal(mapAttempt(a, g6), a);
  }
  // answers given on a bass count on the guitar's matching strings
  assert.equal(mapAttempt(answer('bass4', 'standard', 2), g6).s, 2);
});

test('a 7-string adds a low B that is not the B string', () => {
  const g7 = keysOf('guitar7');
  assert.equal(mapAttempt(answer('guitar6', 'standard', 4), g7).s, 5); // B3 string
  assert.equal(mapAttempt(answer('guitar6', 'standard', 0), g7).s, 1); // low E moves up one index
});

test('rows from before instruments are read from their tuning name', () => {
  assert.deepEqual(attemptStrings({ tuning: 'seven' }), { instrument: 'guitar7', strings: [35, 40, 45, 50, 55, 59, 64] });
  assert.equal(mapAttempt({ tuning: 'standard', s: 2, f: 0, desc: {} }, keysOf('guitar6')).s, 2);
});

test('custom tunings', () => {
  assert.deepEqual(parseTuning('D2 A2 D3 G3 B3 E4', 6), { strings: [38, 45, 50, 55, 59, 64], flats: false });
  assert.deepEqual(parseTuning('Eb2 Ab2 Db3 Gb3 Bb3 Eb4', 6).flats, true);
  assert.match(parseTuning('E2 A2', 6).error, /6 notes/);
  assert.match(parseTuning('E2 A2 D3 G3 B3 H4', 6).error, /not a note/);
  assert.match(parseTuning('E2 E2 D3 G3 B3 E4', 6).error, /same note/);
  // a bad custom tuning plays standard and says why
  const r = resolveTuning({ instrument: 'bass4', tuning: 'custom', customTuning: 'x' });
  assert.deepEqual(r.strings, [28, 33, 38, 43]);
  assert.ok(r.error);
});

test('new strings are introduced after the familiar ones', () => {
  const g7 = INSTRUMENTS.guitar7.tunings.standard.strings;
  const sch = new Scheduler(newModel(), g7, 15, keysOf('guitar7'));
  assert.ok(sch.cellDifficulty(0, 3) > sch.cellDifficulty(1, 3), 'low B is harder than low E');
  const bass = INSTRUMENTS.bass4.tunings.standard.strings;
  const bs = new Scheduler(newModel(), bass, 15, keysOf('bass4'));
  assert.equal(bs.cellDifficulty(0, 3), new Scheduler(newModel(), [40, 45, 50, 55, 59, 64], 15).cellDifficulty(0, 3), 'bass E string = guitar E string');
});
