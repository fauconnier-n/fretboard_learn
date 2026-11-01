// The start-up schema check adds only the columns a database file is missing: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingColumnStatements } from '../js/schema.js';

const tables = {
  attempts: { cols: [['t', 'BIGINT', ''], ['run_id', 'VARCHAR', ''], ['bpm', 'DOUBLE', '']] },
  runs: { cols: [['run_id', 'VARCHAR PRIMARY KEY', ''], ['started_at', 'BIGINT', ''], ['focus', 'VARCHAR', '']] },
};

test('a file with every column needs no statement', () => {
  const have = { attempts: new Set(['t', 'run_id', 'bpm']), runs: new Set(['run_id', 'started_at', 'focus']) };
  assert.deepEqual(missingColumnStatements(tables, have), []);
});

test('columns from later versions are added, keys never', () => {
  const have = { attempts: new Set(['t', 'run_id']), runs: new Set(['run_id']) };
  assert.deepEqual(missingColumnStatements(tables, have), [
    'ALTER TABLE attempts ADD COLUMN IF NOT EXISTS bpm DOUBLE',
    'ALTER TABLE runs ADD COLUMN IF NOT EXISTS started_at BIGINT',
    'ALTER TABLE runs ADD COLUMN IF NOT EXISTS focus VARCHAR',
  ]);
});

test('a table the catalogue does not list yet gets all its columns', () => {
  assert.equal(missingColumnStatements(tables, {}).length, 5);
});
