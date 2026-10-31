// Muted-strum detection and how true-or-false answers count: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrumDetector } from '../js/strum.js';
import { cueOpts } from '../js/srs.js';

const GATE = 0.01;
// frames every 25 ms: [rms, pitched]
function run(frames, level = 4) {
  const d = new StrumDetector(level);
  const hits = [];
  frames.forEach(([rms, pitched], i) => d.feed(i * 25, rms, pitched, GATE) && hits.push(i * 25));
  return hits;
}
const quiet = (n) => Array(n).fill([0.002, false]);

test('a short unpitched burst is a muted strum', () => {
  const strum = [[0.2, false], [0.12, false], [0.05, false], [0.02, false], [0.01, false], [0.005, false], [0.003, false]];
  assert.equal(run([...quiet(5), ...strum, ...quiet(10)]).length, 1);
});

test('a played note (pitched, ringing) is not a strum', () => {
  const note = Array(20).fill(0).map((_, i) => [0.2 * 0.97 ** i, i > 0]);
  assert.equal(run([...quiet(5), ...note, ...quiet(5)]).length, 0);
});

test('a loud unpitched sound that keeps ringing is not a strum', () => {
  assert.equal(run([...quiet(5), ...Array(12).fill([0.2, false])]).length, 0);
});

test('a soft burst under the level is ignored, two strums in a row both count', () => {
  const soft = [[0.03, false], [0.01, false], ...quiet(8)];
  assert.equal(run([...quiet(5), ...soft]).length, 0);
  const strum = [[0.2, false], [0.08, false], [0.02, false], [0.005, false], [0.003, false], [0.002, false]];
  assert.equal(run([...quiet(5), ...strum, ...quiet(10), ...strum, ...quiet(10)]).length, 2);
});

test('true-or-false answers count as recognition: at most Hard, no speed', () => {
  assert.deepEqual(cueOpts({ task: 'truefalse' }), { speed: false, maxG: 2 });
  assert.deepEqual(cueOpts({ task: 'name' }), { speed: true, maxG: 4 });
});

test('mastery colours run from the palette red to the palette green', async () => {
  const { PALETTE, masteryColor } = await import('../js/palette.js');
  assert.equal(masteryColor(0), PALETTE.red);
  assert.equal(masteryColor(1), PALETTE.green);
  assert.equal(masteryColor(2 / 3), PALETTE.yellow);
  assert.match(masteryColor(0.5), /^#[0-9a-f]{6}$/);
});
