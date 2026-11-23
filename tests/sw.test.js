// The service worker keeps every app file for offline use: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appFiles, withAssets } from '../tools/sw-assets.mjs';

test('sw.js lists every app file (fix: node tools/sw-assets.mjs)', () => {
  const text = readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');
  assert.equal(text, withAssets(text, appFiles('.')));
});

test('a release tag becomes the cache name', () => {
  assert.match(withAssets("const CACHE = 'fretboard-trainer-dev';", [], 'v1.4.0'), /'fretboard-trainer-v1\.4\.0'/);
});
