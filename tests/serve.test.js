// The local server (serve.mjs): static files, the disk-copy API and what keeps it safe.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { start } from '../serve.mjs';

let server, root, base, origin;
before(async () => {
  root = mkdtempSync(join(tmpdir(), 'ft-serve-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>');
  server = await start({ port: 0, root, maxBody: 1000, log: () => {} });
  base = `http://127.0.0.1:${server.address().port}`;
  origin = `http://localhost:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
  rmSync(root, { recursive: true, force: true });
});
const call = (path, init) => fetch(base + path, init);
const read = async (path) => (await call(path)).text();

test('static files: index, 304 on the same ETag, nothing else', async () => {
  const r = await call('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(await r.text(), '<!doctype html><title>t</title>');
  assert.equal((await call('/', { headers: { 'If-None-Match': r.headers.get('etag') } })).status, 304);
  assert.equal((await call('/missing.js')).status, 404);
  assert.equal((await call('/api/data/test/nope')).status, 404);
});

test('kv.json: empty, then replaced whole with the old one kept; origin and size checks', async () => {
  assert.equal((await (await call('/api/disk')).json()).dir, join(root, 'data'));
  assert.equal(await read('/api/data/test/kv.json'), '');
  const put = (body, headers = {}) => call('/api/data/test/kv.json', { method: 'PUT', body, headers });
  assert.equal((await put('{"a":1}', { Origin: origin })).status, 200);
  assert.equal(await read('/api/data/test/kv.json'), '{"a":1}');
  assert.equal((await put('{"a":2}')).status, 200);
  assert.equal(await read('/api/data/test/kv.json'), '{"a":2}');
  assert.equal(readFileSync(join(root, 'data', 'test', 'kv.json.bak'), 'utf8'), '{"a":1}');
  assert.equal((await put('{"a":3}', { Origin: 'http://evil.test' })).status, 403);
  assert.equal((await put('x'.repeat(1001))).status, 413);
  assert.equal(await read('/api/data/test/kv.json'), '{"a":2}');
  // the data folder is never served as files
  assert.equal((await call('/data/test/kv.json')).status, 404);
  if (process.platform !== 'linux') assert.equal((await call('/DATA/test/kv.json')).status, 404);
});

test('run files: appended with newlines, read as one text, set aside on delete', async () => {
  const file = '/api/data/test/attempts/20260101-120000-abc.jsonl';
  const post = (path, body) => call(path, { method: 'POST', body });
  assert.equal((await post(file, '')).status, 200);
  assert.ok(!existsSync(join(root, 'data', 'test', 'attempts', '20260101-120000-abc.jsonl')), 'an empty append writes no file');
  await post(file, '{"n":1}');
  await post(file, '{"n":2}\n');
  await post('/api/data/test/attempts/other.jsonl', '{"n":3}');
  writeFileSync(join(root, 'data', 'test', 'attempts.jsonl'), '{"n":0}'); // flat file of earlier versions, no final newline
  assert.equal(await read('/api/data/test/attempts'), '{"n":0}\n{"n":1}\n{"n":2}\n{"n":3}\n');
  assert.equal((await call(file)).status, 405);
  assert.equal((await call('/api/data/test/attempts', { method: 'DELETE' })).status, 200);
  assert.equal(await read('/api/data/test/attempts'), '');
  const aside = readdirSync(join(root, 'data', 'test'));
  assert.ok(aside.some((f) => /^attempts\.bak-\d{8}-\d{6}-\d{3}$/.test(f)), aside.join());
  assert.ok(aside.some((f) => /^attempts\.jsonl\.bak-\d{8}-\d{6}-\d{3}$/.test(f)), aside.join());
});
