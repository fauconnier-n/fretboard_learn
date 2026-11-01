// The per-run file layout of a profile's data copy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, groupByRun, kvFromDisk, parseJsonl, profileNameFromFolder, runFile, FILE_RE } from '../js/disklayout.js';

test('a run file is named after the start time held in the run id', () => {
  const id = (1700000000000).toString(36); // 2023-11-14T22:13:20Z
  assert.equal(runFile(id), `20231114-221320-${id}.jsonl`);
  assert.equal(runFile('r0'), '00000000-000000-r0.jsonl');
  assert.equal(runFile(null), 'other.jsonl');
  for (const f of [runFile(id), runFile('r0'), runFile('')]) assert.match(f, FILE_RE);
});

test('rows are grouped by run, answers by runId and runs by run_id', () => {
  const g = groupByRun('attempts', [{ runId: 'r0', t: 1 }, { runId: 'r1', t: 2 }, { runId: 'r0', t: 3 }, { t: 4 }]);
  assert.deepEqual(Object.keys(g).sort(), ['00000000-000000-r0.jsonl', '00000000-000000-r1.jsonl', 'other.jsonl']);
  assert.equal(g['00000000-000000-r0.jsonl'].length, 2);
  assert.deepEqual(Object.keys(groupByRun('runs', [{ run_id: 'r1' }])), ['00000000-000000-r1.jsonl']);
});

test('a line cut short is skipped', () => {
  assert.deepEqual(parseJsonl('{"a":1}\n{"a":2}\n{"a":'), [{ a: 1 }, { a: 2 }]);
});

test('fold keeps every answer once and lets a finished run beat an open one', () => {
  const a = (t, s = 0, f = 1) => JSON.stringify({ t, s, f, desc: {} });
  const folded = fold('{"k":"v"}', [a(1) + '\n' + a(2), a(2) + '\n' + a(3) + '\n{"t":9}'], [
    '{"run_id":"x","ended_at":5}\n{"run_id":"y"}',
    '{"run_id":"x"}\n{"run_id":"y","ended_at":7}\n{"run_id":"y","ended_at":8}',
  ]);
  assert.deepEqual(folded.kv, { k: 'v' });
  assert.deepEqual(folded.attempts.map((x) => x.t), [1, 2, 3]);
  assert.equal(folded.runs.x.ended_at, 5);
  assert.equal(folded.runs.y.ended_at, 8);
  assert.deepEqual(fold('not json', [], []).kv, {});
});

test('a profile folder gives back the profile name', () => {
  assert.equal(profileNameFromFolder('fretboard-Nico'), 'nico');
  assert.equal(profileNameFromFolder('user'), 'user');
});

test('kv from the disk: keys the browser lacks, and settings saved later', () => {
  const set = (frets, savedAt) => JSON.stringify({ frets, savedAt });
  const local = { settings: set(15, 200), 'model:a': '{"v":1}' };
  assert.deepEqual(kvFromDisk({ 'model:b': '{"v":2}', 'model:a': '{"v":9}' }, local), [['model:b', '{"v":2}']]);
  assert.deepEqual(kvFromDisk({ settings: set(21, 300) }, local), [['settings', set(21, 300)]]);
  assert.deepEqual(kvFromDisk({ settings: set(9, 100) }, local), []);
  assert.deepEqual(kvFromDisk({ settings: set(9, 200) }, local), []); // a tie: the browser's
  assert.deepEqual(kvFromDisk({ settings: '{"frets":12}' }, { settings: '{"frets":15}' }), []); // neither dated
});
