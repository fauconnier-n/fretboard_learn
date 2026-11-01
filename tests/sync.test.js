// What a sync between the browser and the disk copy copies each way (storage.js syncDisk): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePlan } from '../js/disklayout.js';

const a = (t) => ({ t, s: 0, f: 1, desc: {} });
const side = (attempts = [], runs = {}, kv = {}) => ({ attempts, runs, kv });

test('an answer only on the disk goes to the browser', () => {
  const p = mergePlan(side([a(1)]), side([a(1), a(2)]));
  assert.deepEqual(p.toLocal.map((x) => x.t), [2]);
  assert.deepEqual(p.toDisk, []);
});

test('an answer only in the browser goes to the disk', () => {
  const p = mergePlan(side([a(1), a(2)]), side([a(1)]));
  assert.deepEqual(p.toDisk.map((x) => x.t), [2]);
  assert.deepEqual(p.toLocal, []);
});

test('a run open in the browser but finished on the disk takes the disk row', () => {
  const p = mergePlan(side([], { r: { run_id: 'r', ended_at: null } }), side([], { r: { run_id: 'r', ended_at: 9 } }));
  assert.deepEqual(p.runsToLocal, [{ run_id: 'r', ended_at: 9 }]);
  assert.deepEqual(p.runsToDisk, []);
  // the other way round, the browser's finished row goes to the disk
  const q = mergePlan(side([], { r: { run_id: 'r', ended_at: 9 } }), side([], { r: { run_id: 'r', ended_at: null } }));
  assert.deepEqual([q.runsToLocal.length, q.runsToDisk.length], [0, 1]);
});

test('the newer setting wins, a missing one is copied', () => {
  const p = mergePlan(side([], {}, { s: '{"savedAt":1}', m: '{}' }), side([], {}, { s: '{"savedAt":2}', n: '{}', m: '{"x":1}' }));
  assert.deepEqual(p.kvToLocal.map(([k]) => k).sort(), ['n', 's']);
});

test('the same data on both sides copies nothing', () => {
  const both = () => side([a(1), a(2)], { r: { run_id: 'r', ended_at: 5 } }, { s: '{"savedAt":1}' });
  const p = mergePlan(both(), both());
  assert.deepEqual(p, { toLocal: [], toDisk: [], runsToLocal: [], runsToDisk: [], kvToLocal: [] });
});
