// Builds the README's pictures in media/ from a tools/readme.mjs capture:
//   node tools/readme-gifs.mjs screenshots/readme
// growth.gif: the mastery map over a learner's first days (tools/seed-growth.mjs).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeGif } from './gif.mjs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node tools/readme-gifs.mjs <capture folder>');
mkdirSync('media', { recursive: true });
const frames = [];
for (let k = 0; existsSync(join(dir, `g${k}.png`)); k++) frames.push(readFileSync(join(dir, `g${k}.png`)));
writeFileSync('media/growth.gif', encodeGif(frames, frames.map((_, i) => (i === frames.length - 1 ? 3000 : 1100))));
copyFileSync(join(dir, 'run.gif'), 'media/run.gif');
console.log(`media/growth.gif (${frames.length} frames), media/run.gif`);
