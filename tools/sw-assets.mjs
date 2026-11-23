// The service worker's list of files kept for offline use (sw.js ASSETS): every file of the app.
//   node tools/sw-assets.mjs [dir] [tag]
// Rewrites <dir>/sw.js (default: the repo) with the files under <dir>. With a tag (the deploy
// passes the release tag) the cache name too, so each release refreshes the cache without a
// hand-made bump. tests/sw.test.js checks that the repo's sw.js is up to date.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function appFiles(dir) {
  const walk = (d) => readdirSync(join(dir, d), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]));
  return ['./', 'index.html', 'manifest.webmanifest', ...['icons', 'css', 'js'].flatMap(walk).sort()];
}

export function withAssets(text, files, tag) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'; // a Windows checkout may have CRLF
  const out = text.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [${nl}${files.map((f) => `  '${f}',`).join(nl)}${nl}];`);
  return tag ? out.replace(/const CACHE = '[^']*';/, `const CACHE = 'fretboard-trainer-${tag}';`) : out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = '.', tag] = process.argv.slice(2);
  const file = join(dir, 'sw.js');
  writeFileSync(file, withAssets(readFileSync(file, 'utf8'), appFiles(dir), tag));
}
