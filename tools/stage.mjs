// Copies the app's files (what GitHub Pages serves and the service worker caches) into a folder
// and stamps the version into js/version.js. Used by the Pages deploy and by the release binaries.
//   node tools/stage.mjs <out dir> <version>
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [out, version] = process.argv.slice(2);
if (!out || !version) {
  console.log('usage: node tools/stage.mjs <out dir> <version>');
  process.exit(1);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons']) cpSync(join(repo, f), join(out, f), { recursive: true });
const file = join(out, 'js', 'version.js');
const marker = "export const VERSION = 'dev';";
const src = readFileSync(file, 'utf8');
if (!src.includes(marker)) throw new Error(`${marker} not found in ${file}`);
writeFileSync(file, src.replace(marker, `export const VERSION = '${version}';`));
console.log(`${out}: the app's files, as ${version}`);
