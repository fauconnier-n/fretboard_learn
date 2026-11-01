// Drive the app in headless Edge (or Chrome) and take screenshots, without a browser window.
//   node tools/browser-check.mjs <steps.mjs> [--origin http://localhost:8137] [--out <dir>] [--port 9333] [--url <page>]
//                                [--fresh] [--no-seed] [--host <name>] [--secure] [--fake-audio]
// --url opens that page (a path relative to the origin) instead of the app. --fresh starts from an
// empty browser profile and --no-seed leaves the app's storage alone (the welcome screen shows).
// --host <name> makes the browser resolve that name to this machine, so an origin like
// http://fretboard.test:8140 stands in for a hosted site; with --secure that origin also counts as
// secure (what https gives), so the folder feature is on.
// <steps.mjs> default-exports [{ name, js, shot = true, width = 1200, height = 900, full, mobile, gif }]: each
// `js` is the body of an async function run in the page (use `return ...` to print a result);
// then, if shot, a PNG <out>/<name>.png is saved; with gif: { clip: selector, ms, scale } an
// animated <name>.gif of that element is recorded instead (start the animation in js without
// awaiting it). <out>/index.html shows them all. The active user is set to "test" before the
// app loads, so real data is never touched. The browser profile lives in the temp folder and
// is kept between runs (the test user's data persists). Console errors are printed at the end.
// The local server must be running (start.bat). The browser plumbing is in tools/cdp.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserExe, launch, openApp, sleep } from './cdp.mjs';
import { encodeGif } from './gif.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const stepsFile = args[0];
const origin = opt('origin', 'http://localhost:8137');
const out = resolve(opt('out', 'screenshots/latest'));
const port = +opt('port', 9333);
const page = opt('url', '');
const host = opt('host', '');
const flags = [];
if (host) flags.push(`--host-resolver-rules=MAP ${host} 127.0.0.1`);
if (host && args.includes('--secure')) flags.push(`--unsafely-treat-insecure-origin-as-secure=${origin}`);
if (args.includes('--fake-audio')) flags.push('--use-fake-device-for-media-stream'); // a beeping test input
if (!stepsFile || !browserExe()) {
  console.log(!browserExe() ? 'No Edge or Chrome found.' : 'usage: node tools/browser-check.mjs <steps.mjs> [--origin URL] [--out DIR] [--port N]');
  process.exit(1);
}
const steps = (await import(pathToFileURL(resolve(stepsFile)).href)).default;

let browser;
try {
  browser = await launch({ port, fresh: args.includes('--fresh'), flags });
  const { send, evaluate, size, errors } = browser;
  await size(1200, 900);
  await openApp(browser, { origin, path: page, seed: !args.includes('--no-seed') });
  await sleep(1500);
  mkdirSync(out, { recursive: true });
  const files = [];
  for (const st of steps) {
    if (st.shot !== false) await size(st.width || 1200, st.height || 900, st.mobile);
    try {
      const value = await evaluate(`(async () => {${st.js || ''}\n})()`);
      if (value !== undefined) console.log(st.name + ':', JSON.stringify(value));
    } catch (e) {
      console.log(st.name + ': SCRIPT ERROR ' + e.message);
    }
    if (st.gif) {
      // an animation: frames of one element for gif.ms milliseconds, as fast as they come
      // the element can still be laid out (a view switch or a zoom under way): wait until it has a size
      let r;
      for (let i = 0; i < 20; i++) {
        r = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(st.gif.clip || 'body')}); if (!el) return null; el.scrollIntoView({ block: el.offsetHeight > innerHeight ? 'start' : 'center' }); /* a tall element from its top */ const b = el.getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height }; })()`);
        if (r?.width && r?.height) break;
        await sleep(100);
      }
      if (!r?.width) {
        console.log(st.name + ': GIF SKIPPED, ' + (st.gif.clip || 'body') + ' has no size');
        continue;
      }
      const pngs = [];
      const times = [];
      const start = Date.now();
      while (Date.now() - start < st.gif.ms) {
        times.push(Date.now());
        const f = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: st.gif.scale || 1 } });
        pngs.push(Buffer.from(f.data, 'base64'));
      }
      const delays = times.map((t, i) => (times[i + 1] ?? t + 100) - t);
      delays[delays.length - 1] = 800; // a pause before the loop starts again
      writeFileSync(join(out, st.name + '.gif'), encodeGif(pngs, delays));
      files.push(st.name + '.gif');
      console.log(`${st.name}: saved ${join(out, st.name + '.gif')} (${pngs.length} frames, ${Math.round((1000 * pngs.length) / st.gif.ms)} per second)`);
      continue;
    }
    if (st.shot === false) continue;
    // a full-page shot starts at the top, or the sticky header lands in the middle of it
    if (st.full) await evaluate('window.scrollTo(0, 0)');
    await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!st.full });
    writeFileSync(join(out, st.name + '.png'), Buffer.from(shot.data, 'base64'));
    files.push(st.name + '.png');
    console.log(st.name + ': saved ' + join(out, st.name + '.png'));
  }
  writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Screenshots</title>
<style>body{font:14px system-ui;margin:20px;color:#3f3c37}figure{margin:0 0 28px}img{max-width:100%;border:1px solid #ebe5d6;border-radius:8px}figcaption{font-weight:700;margin-bottom:6px}</style>
${files.map((n) => `<figure><figcaption>${n}</figcaption><img src="${n}" alt="${n}"></figure>`).join('\n')}`);
  console.log('gallery: ' + join(out, 'index.html'));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
} catch (e) {
  console.log('HARNESS ERROR', e.message);
  process.exitCode = 1;
} finally {
  browser?.close();
}
