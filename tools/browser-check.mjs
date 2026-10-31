// Drive the app in headless Edge (or Chrome) and take screenshots, without a browser window.
//   node tools/browser-check.mjs <steps.mjs> [--origin http://localhost:8137] [--out <dir>] [--port 9333] [--url <page>]
// --url opens that page (a path relative to the origin) instead of the app.
// <steps.mjs> default-exports [{ name, js, shot = true, width = 1200, height = 900, full }]: each
// `js` is the body of an async function run in the page (use `return ...` to print a result);
// then, if shot, a PNG <out>/<name>.png is saved; <out>/index.html shows them all. The active user is set to "test" before the
// app loads, so real data is never touched. The browser profile lives in the temp folder and
// is kept between runs (the test user's data persists). Console errors are printed at the end.
// The local server must be running (start.bat).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const exe = BROWSERS.find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!stepsFile || !exe) {
  console.log(!exe ? 'No Edge or Chrome found.' : 'usage: node tools/browser-check.mjs <steps.mjs> [--origin URL] [--out DIR] [--port N]');
  process.exit(1);
}
const steps = (await import(pathToFileURL(resolve(stepsFile)).href)).default;
const profile = join(tmpdir(), `fretboard-browser-check-${port}`);
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let ws;
let id = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 240000 });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('browser did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await size(1200, 900);
  await send('Page.navigate', { url: origin + '/manifest.webmanifest' });
  await sleep(1200);
  await evaluate(`localStorage.setItem('ft:activeUser', JSON.stringify('test')); localStorage.setItem('ft:users', JSON.stringify(['user','test']))`);
  await send('Page.navigate', { url: origin + '/' + page });
  // wait until the database is open and the board is drawn
  for (let i = 0; i < 80 && !page; i++) {
    if (await evaluate(`!!(window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length)`)) break;
    await sleep(250);
  }
  await sleep(1500);
  mkdirSync(out, { recursive: true });
  for (const st of steps) {
    try {
      const value = await evaluate(`(async () => {${st.js || ''}\n})()`);
      if (value !== undefined) console.log(st.name + ':', JSON.stringify(value));
    } catch (e) {
      console.log(st.name + ': SCRIPT ERROR ' + e.message);
    }
    if (st.shot === false) continue;
    await size(st.width || 1200, st.height || 900);
    await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!st.full });
    writeFileSync(join(out, st.name + '.png'), Buffer.from(shot.data, 'base64'));
    console.log(st.name + ': saved ' + join(out, st.name + '.png'));
  }
  const names = steps.filter((st) => st.shot !== false).map((st) => st.name);
  writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Screenshots</title>
<style>body{font:14px system-ui;margin:20px;color:#3f3c37}figure{margin:0 0 28px}img{max-width:100%;border:1px solid #ebe5d6;border-radius:8px}figcaption{font-weight:700;margin-bottom:6px}</style>
${names.map((n) => `<figure><figcaption>${n}</figcaption><img src="${n}.png" alt="${n}"></figure>`).join('\n')}`);
  console.log('gallery: ' + join(out, 'index.html'));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
} catch (e) {
  console.log('HARNESS ERROR', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  proc.kill();
}
