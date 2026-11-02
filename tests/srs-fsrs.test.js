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
