// Mastery counts sessions (answers under 2 h apart), not days: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../js/instruments.js';
import { Scheduler, newModel } from '../js/srs.js';
import { generateZones } from '../js/zones.js';

const strings = INSTRUMENTS.guitar6.strings;
const lowE = generateZones(strings, 15, 'both').find((z) => z.type === 'string' && z.strings[0] === 0 && z.cells[0].f === 0);
const desc = { type: 'string', sk: '0', cs: 0, cf: 5.5, span: 12 };
const cell = lowE.cells.find((c) => c.f === 5);
const M = 60000;

// right and fast answers on low E fret 5, `n` of them `step` ms apart from `t`; returns the last time
function play(sch, t, n, step) {
  for (let i = 0; i < n; i++) sch.record(desc, cell, 'n', true, 600, t + i * step);
  return t + (n - 1) * step;
}

test('two sessions 3 h apart on the same day: two sessions, mastered', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  const t = new Date(2026, 9, 1, 9).getTime();
  play(sch, t, 6, 5 * M);
  const last = play(sch, t + 3 * 60 * M, 6, 5 * M);
  assert.equal(sch.model.meta.session, 2);
  assert.deepEqual(sch.model.cards['0:5'].sessions, [1, 2]);
  assert.ok(sch.isMastered('0:5', last));
});

test('one long session across midnight is one session: not mastered yet', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  const last = play(sch, new Date(2026, 9, 1, 22).getTime(), 10, 30 * M); // 22:00 to 02:30
  assert.equal(sch.model.meta.session, 1);
  assert.equal(sch.model.cards['0:5'].sessions.length, 1);
  assert.equal(sch.isMastered('0:5', last), false);
  assert.ok(sch.noteRings('0:5', last).auto < 1);
});

test('rebuild counts the same sessions and every run with an answer', () => {
  const t = new Date(2026, 9, 1, 9).getTime();
  const log = [0, 10, 200, 205].map((m, i) => ({ desc, s: 0, f: 5, target: cell.midi, spelling: 'n', correct: true, ms: 600, t: t + m * M, runId: 'r' + (i >> 1), task: 'play' }));
  const sch = new Scheduler(newModel(), strings, 15);
  sch.rebuild(log);
  assert.equal(sch.model.meta.session, 2);
  assert.equal(sch.model.meta.runsDone, 2);
  sch.rebuild(log); // replayed fields start over
  assert.equal(sch.model.meta.session, 2);
});

test('closing notes for Name the note only count positions already named', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  sch.record(desc, cell, 'n', true, 600, Date.now());
  const seen = (task) => sch.zoneChances(lowE, task).find((x) => x.cell.key === cell.key).seen;
  assert.equal(seen('play'), true);
  assert.equal(seen('name'), false);
  sch.record(desc, cell, 'r', true, 900, Date.now());
  assert.equal(seen('name'), true);
});
