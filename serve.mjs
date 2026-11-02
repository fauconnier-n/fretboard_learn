// The local server: the app's files, and the disk copy of each profile's data in data/<name>/
// (layout in js/disklayout.js, client in js/disk.js). Runs under Node (npm start, start.bat) and,
// compiled with Bun, as the fretboard-trainer binary of each release, which serves its own folder.
//   node serve.mjs [--port 8137] [--dir <app folder>] [--no-open]
//   GET    /api/disk                              where the disk copy lives
//   GET    /api/data/<name>/kv.json|profile.json  read a file (empty if none);  PUT replaces it (old one kept as .bak)
//   GET    /api/data/<name>/attempts|runs         every run file of that kind, plus the flat file of earlier versions
//   POST   /api/data/<name>/attempts|runs/<file>.jsonl   append lines to one run file
//   DELETE /api/data/<name>/attempts|runs         keep the files aside as <kind>.bak-<stamp> (reset, import)
// Writes reach the disk (fsync) before the reply. Only this computer can connect (loopback address).
import { spawn } from 'node:child_process';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};
const API = /^\/api\/data\/([a-z0-9_-]{1,32})\/(kv\.json|profile\.json|attempts|runs)(?:\/((\d{8}-\d{6}-[a-z0-9]{1,16}|other)\.jsonl))?$/;
const LF = 10;
// NTFS and APFS ignore case, so the checks that keep a request inside the app folder and out of data/ do too
const lower = (p) => (process.platform === 'linux' ? p : p.toLowerCase());
const text = (code, body) => ({ code, type: 'text/plain; charset=utf-8', body: Buffer.from(body) });
const clock = () => new Date().toTimeString().slice(0, 8);

// ---------- durable files ----------

// Write and make sure the bytes reach the disk before returning.
function writeDurable(path, bytes, flag) {
  const fd = openSync(path, flag);
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function lastByte(path) {
  const size = existsSync(path) ? statSync(path).size : 0;
  if (!size) return LF;
  const fd = openSync(path, 'r');
  try {
    const b = Buffer.alloc(1);
    readSync(fd, b, 0, 1, size - 1);
    return b[0];
  } finally {
    closeSync(fd);
  }
}

// a line cut short by a crash stays on its own line, where the reader skips it
function appendLines(path, bytes) {
  if (!bytes.length) return;
  const parts = [bytes];
  if (bytes[bytes.length - 1] !== LF) parts.push(Buffer.from([LF]));
  if (lastByte(path) !== LF) parts.unshift(Buffer.from([LF]));
  writeDurable(path, Buffer.concat(parts), 'a');
}

function replaceFile(path, bytes) {
  writeDurable(path + '.tmp', bytes, 'w');
  if (existsSync(path)) renameSync(path, path + '.bak');
  renameSync(path + '.tmp', path);
}

// the flat file of earlier versions first, then one file per run, each ending in a newline
function readKind(dir, kind) {
  const files = [join(dir, kind + '.jsonl')];
  const sub = join(dir, kind);
  if (existsSync(sub)) files.push(...readdirSync(sub).filter((f) => f.endsWith('.jsonl')).sort().map((f) => join(sub, f)));
  const parts = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const b = readFileSync(f);
    parts.push(b);
    if (b.length && b[b.length - 1] !== LF) parts.push(Buffer.from([LF]));
  }
  return Buffer.concat(parts);
}

// a reset or an import: the run files and the flat file are kept aside, the newest 3 sets
function setAside(dir, kind) {
  if (!existsSync(dir)) return;
  for (const prefix of [`${kind}.bak-`, `${kind}.jsonl.bak-`]) {
    for (const f of readdirSync(dir).filter((f) => f.startsWith(prefix)).sort().reverse().slice(2)) rmSync(join(dir, f), { recursive: true, force: true });
  }
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
  if (existsSync(join(dir, kind))) renameSync(join(dir, kind), join(dir, `${kind}.bak-${stamp}`));
  if (existsSync(join(dir, `${kind}.jsonl`))) renameSync(join(dir, `${kind}.jsonl`), join(dir, `${kind}.jsonl.bak-${stamp}`));
}

// ---------- requests ----------

// the whole body, or null when it is over the cap
async function readBody(req, max) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function api(req, path, body, dataDir, origin) {
  // another site's page may send requests here (it can't read the answers, but it could write)
  if (req.headers.origin && req.headers.origin !== origin) return text(403, 'Forbidden origin');
  if (path === '/api/disk') return { code: 200, type: 'application/json', body: Buffer.from(JSON.stringify({ dir: dataDir })) };
  const m = API.exec(path);
  if (!m) return text(404, 'Unknown API path');
  const [, name, kind, file] = m;
  const dir = join(dataDir, name);
  const isJson = kind.endsWith('.json');
  switch (req.method) {
    case 'GET': {
      if (file) return text(405, 'Read a kind as a whole');
      // a file not written yet reads as empty
      const bytes = isJson ? (existsSync(join(dir, kind)) ? readFileSync(join(dir, kind)) : Buffer.alloc(0)) : readKind(dir, kind);
      return { code: 200, type: 'text/plain; charset=utf-8', body: bytes };
    }
    case 'PUT':
      if (!isJson) return text(405, 'Only the .json files are replaced whole');
      mkdirSync(dir, { recursive: true });
      replaceFile(join(dir, kind), body);
      return text(200, 'saved');
    case 'POST':
      if (!file) return text(405, 'Append to a run file');
      mkdirSync(join(dir, kind), { recursive: true });
      appendLines(join(dir, kind, file), body);
      return text(200, 'saved');
    case 'DELETE':
      if (isJson || file) return text(405, 'Delete a kind as a whole');
      setAside(dir, kind);
      return text(200, 'cleared');
  }
  return text(405, 'Method not allowed');
}

// Static files answer conditional requests with 304 (ETag from size and modification time), so a
// reload re-reads only files that changed. Nothing under data/ is served.
function staticFile(req, path, root, dataDir) {
  const full = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!lower(full).startsWith(lower(root + sep)) || lower(full).startsWith(lower(dataDir + sep)) || !existsSync(full)) return text(404, 'Not found');
  const st = statSync(full);
  if (!st.isFile()) return text(404, 'Not found');
  const etag = `"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
  const headers = { ETag: etag, 'Last-Modified': st.mtime.toUTCString() };
  if (req.headers['if-none-match'] === etag) return { code: 304, headers };
  return { code: 200, type: MIME[extname(full).toLowerCase()] || 'application/octet-stream', body: readFileSync(full), headers };
}

function reply(req, res, r) {
  res.statusCode = r.code;
  res.setHeader('Cache-Control', 'no-cache');
  for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
  if (r.code === 304) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', r.type);
  res.setHeader('Content-Length', r.body.length);
  res.end(req.method === 'HEAD' ? undefined : r.body);
}

// Serves `root` (and its data/ through the API) on the loopback address; resolves once listening.
export function start({ port = 8137, root = defaultRoot(), dataDir = join(root, 'data'), maxBody = 64 * 1024 * 1024, log = console.log } = {}) {
  root = resolve(root);
  dataDir = resolve(dataDir);
  let origin = '';
  const server = createServer(async (req, res) => {
    res.on('error', () => {});
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let r;
      if (path.startsWith('/api/')) {
        // the body first, then the files all at once: two writes never interleave
        const body = await readBody(req, maxBody);
        r = body ? api(req, path, body, dataDir, origin) : { ...text(413, 'Too large'), headers: { Connection: 'close' } };
      } else {
        r = staticFile(req, path, root, dataDir);
      }
      reply(req, res, r);
    } catch (e) {
      // a browser that cancels a request (a reload during a download, say) must not stop the server
      if (!['ECONNRESET', 'EPIPE'].includes(e.code)) log(`${clock()} Error on ${req.method} ${req.url}: ${e.message}`);
      try {
        reply(req, res, text(500, 'Server error'));
      } catch {}
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', fail);
      server.on('error', (e) => log(`${clock()} Server error: ${e.message}`));
      origin = `http://localhost:${server.address().port}`;
      ok(server);
    });
  });
}

// Compiled with Bun, the binary serves the folder it sits in; under Node, this file's folder.
function defaultRoot() {
  return typeof Bun === 'undefined' ? dirname(fileURLToPath(import.meta.url)) : dirname(process.execPath);
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

// ---------- the program ----------

// flags are looked up over the whole argv: a compiled binary lays it out differently from node
const argv = process.argv;
const flag = (name, fallback) => (argv.includes('--' + name) ? argv[argv.indexOf('--' + name) + 1] : fallback);
if (import.meta.main ?? (argv[1] && resolve(argv[1]) === fileURLToPath(import.meta.url))) {
  const port = +flag('port', 8137);
  const root = resolve(flag('dir', defaultRoot()));
  const open = !argv.includes('--no-open');
  const url = `http://localhost:${port}/`;
  start({ port, root }).then(
    () => {
      console.log(`Fretboard Trainer running at ${url}  (close this window or press Ctrl+C to stop)`);
      console.log(`Disk copy of your data: ${join(root, 'data')}`);
      if (open) openBrowser(url);
    },
    (e) => {
      // most likely the server is already running in another window (EACCES: Windows holds the
      // port for an HttpListener, the PowerShell server of earlier versions)
      if (!['EADDRINUSE', 'EACCES'].includes(e.code)) throw e;
      console.log(`Port ${port} is already in use: Fretboard Trainer is probably running already.`);
      if (open) openBrowser(url);
    },
  );
}
