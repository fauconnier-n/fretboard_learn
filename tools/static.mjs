// A plain static server, like GitHub Pages: no disk API, any host name, right MIME types.
//   node tools/static.mjs [--port 8150] [--dir .]
// Used with tools/browser-check.mjs --host <name> to see the app as a hosted site (the
// PowerShell server only answers to "localhost").
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.indexOf('--' + name) >= 0 ? args[args.indexOf('--' + name) + 1] : fallback);
const port = +opt('port', 8140);
const dir = resolve(opt('dir', '.'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png' };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(dir, normalize(path === '/' ? '/index.html' : path));
  let st;
  try {
    st = file.startsWith(dir) && statSync(file);
  } catch {}
  if (!st || !st.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`static site on http://127.0.0.1:${port}/ (any host name), from ${dir}`));
