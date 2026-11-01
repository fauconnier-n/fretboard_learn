// The folder transport on a fake File System Access folder: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FolderTransport, createIn, profileName } from '../js/diskFolder.js';

// Just enough of FileSystemDirectoryHandle / FileSystemFileHandle, on Buffers so byte offsets count
class FakeFile {
  constructor() { this.kind = 'file'; this.buf = Buffer.alloc(0); }
  async getFile() { const buf = this.buf; return { size: buf.length, text: async () => buf.toString('utf8') }; }
  async createWritable({ keepExistingData = false } = {}) {
    let data = keepExistingData ? Buffer.from(this.buf) : Buffer.alloc(0);
    return {
      write: async (chunk) => {
        const text = typeof chunk === 'string' ? chunk : chunk.data;
        const at = typeof chunk === 'string' ? data.length : chunk.position;
        const bytes = Buffer.from(text, 'utf8');
        if (at > data.length) data = Buffer.concat([data, Buffer.alloc(at - data.length)]);
        data = Buffer.concat([data.subarray(0, at), bytes, data.subarray(at + bytes.length)]);
      },
      close: async () => { this.buf = data; },
    };
  }
}
const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
class FakeDir {
  constructor(name) { this.kind = 'directory'; this.name = name; this.items = new Map(); }
  async getDirectoryHandle(name, { create } = {}) {
    if (!this.items.has(name)) { if (!create) throw notFound(); this.items.set(name, new FakeDir(name)); }
    return this.items.get(name);
  }
  async getFileHandle(name, { create } = {}) {
    if (!this.items.has(name)) { if (!create) throw notFound(); this.items.set(name, new FakeFile()); }
    return this.items.get(name);
  }
  async removeEntry(name) { if (!this.items.delete(name)) throw notFound(); }
  async *entries() { yield* this.items.entries(); }
}

const write = async (dir, name, text) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };

test('appends land at the byte end of the run file, even after multi-byte characters', async () => {
  const t = new FolderTransport(new FakeDir('fretboard-nico'));
  await t.appendFile('attempts', '00000000-000000-r0.jsonl', '{"zone":"E — frets 0–11"}\n');
  await t.appendFile('attempts', '00000000-000000-r0.jsonl', '{"n":2}\n');
  await t.appendFile('attempts', '00000000-000000-r1.jsonl', '{"n":3}\n');
  assert.deepEqual(await t.readAll('attempts'), ['{"zone":"E — frets 0–11"}\n{"n":2}\n', '{"n":3}\n']);
});

test('the flat file of earlier versions is read first, conflicted copies too, and clear removes both', async () => {
  const root = new FakeDir('x');
  const t = new FolderTransport(root);
  await t.appendFile('runs', '00000000-000000-r1.jsonl', 'b\n');
  await write(await root.getDirectoryHandle('runs'), '00000000-000000-r0 (conflicted copy).jsonl', 'a\n');
  await write(root, 'runs.jsonl', 'legacy\n');
  assert.deepEqual(await t.readAll('runs'), ['legacy\n', 'a\n', 'b\n']);
  await t.clear('runs');
  assert.deepEqual(await t.readAll('runs'), []);
  await t.clear('runs'); // nothing left: not an error
});

test('kv.json and profile.json are replaced whole; an empty folder reads as empty', async () => {
  const root = new FakeDir('x');
  const t = new FolderTransport(root);
  assert.equal(await t.readKv(), '');
  await t.putKv('{"a":1,"b":2}');
  await t.putKv('{"a":1}');
  assert.equal(await t.readKv(), '{"a":1}');
  await t.putProfile('{"name":"Nico"}');
  assert.equal(await profileName(root), 'nico');
  assert.equal(await profileName(new FakeDir('fretboard-Lea')), 'lea');
});

test('a profile folder is created under the picked location', async () => {
  const location = new FakeDir('Documents');
  const h = await createIn(location, 'fretboard-nico');
  assert.equal(h.name, 'fretboard-nico');
  assert.equal(await createIn(location, 'fretboard-nico'), h);
});
