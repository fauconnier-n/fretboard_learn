// fsrsStep, the FSRS memory update shared by note cards and chord grips: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fsrsStep, retrievability, DUE_R } from '../js/srs.js';

const DAY = 86400000;
const W = [0.212, 1.2931, 2.3065, 8.2956]; // FSRS-6 initial stabilities per grade

test('fsrsStep: a new card starts from the grade\'s initial stability', () => {
  for (const G of [1, 2, 3, 4]) {
    const c = fsrsStep(null, G, 1000);
    assert.equal(c.S, W[G - 1]);
    assert.equal(c.last, 1000);
    assert.ok(c.D >= 1 && c.D <= 10);
  }
});

test('fsrsStep: a same-day Good never lowers S, and a 60-day gap makes it due', () => {
  const t0 = Date.UTC(2026, 0, 1);
  const c = fsrsStep(null, 3, t0);
  const again = fsrsStep(c, 3, t0 + 3600000);
  assert.ok(again.S >= c.S);
  assert.notEqual(again, c);
  assert.ok(retrievability(again, again.last + 60 * DAY) < DUE_R);
});

test('the known bar: one day of cramming stays at half, fast answers on 4 days fill it', async () => {
  const { Scheduler, newModel } = await import('../js/srs.js');
  const sch = new Scheduler(newModel(), [40, 45, 50, 55, 59, 64], 15);
  const cell = { s: 0, f: 5, midi: 45, pc: 9, key: '0:5' };
  const desc = { type: 'string', sk: '0', cs: 0, cf: 5.5, span: 11 };
  const day0 = new Date(2026, 10, 2, 10).getTime();
  const answer = (t, ms = 1000) => sch.record(desc, cell, 'n', true, ms, t);
  // four sessions on one day, ten fast right answers each
  for (let s = 0; s < 4; s++) for (let i = 0; i < 10; i++) answer(day0 + s * 3 * 3600000 + i * 5000);
  assert.ok(sch.noteRings('0:5', day0 + 10 * 3600000).known <= 0.5);
  // slow right answers on later days do not count
  for (let d = 1; d <= 3; d++) for (let i = 0; i < 5; i++) answer(day0 + d * DAY + i * 5000, 4000);
  assert.ok(sch.noteRings('0:5', day0 + 3 * DAY + 60000).known <= 0.5);
  for (let d = 4; d <= 6; d++) for (let i = 0; i < 5; i++) answer(day0 + d * DAY + i * 5000);
  assert.ok(sch.noteRings('0:5', day0 + 6 * DAY + 60000).known > 0.95);
});
