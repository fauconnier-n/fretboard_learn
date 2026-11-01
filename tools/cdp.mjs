// Headless Edge (or Chrome) driven over the DevTools protocol, shared by tools/browser-check.mjs
// and tools/perf.mjs: launch a browser, talk to its first page, open the app as user "test".
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Edge or Chrome where each OS installs them; FT_BROWSER names another executable.
const BROWSERS = {
  win32: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'],
  darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
}[process.platform] || [];
export const browserExe = () => process.env.FT_BROWSER || BROWSERS.find(existsSync);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts the browser and connects to its page. The profile folder (in the temp folder, named
// after the port) is kept between runs unless `fresh`; `flags` are extra command-line switches.
export async function launch({ port = 9333, profileName = `fretboard-browser-check-${port}`, fresh = false, flags = [] } = {}) {
  const exe = browserExe();
  if (!exe) throw new Error('No Edge or Chrome found (set FT_BROWSER to a browser executable).');
  const profile = join(tmpdir(), profileName);
  if (fresh) rmSync(profile, { recursive: true, force: true });
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--hide-scrollbars', ...flags, 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => proc.kill());
  try {
    return await connect(proc, port, profile);
  } catch (e) {
    proc.kill();
    throw e;
  }
}

async function connect(proc, port, profile) {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('browser did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('could not connect to the browser'));
    setTimeout(() => rej(new Error('no connection to the browser in 10 s')), 10000).unref();
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map(); // CDP event name -> handlers
  const errors = []; // console errors and uncaught exceptions of the page
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    for (const fn of listeners.get(msg.method) || []) fn(msg.params);
  };
  // a browser that dies mid-run must fail the call, not hang the tool
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    setTimeout(() => {
      if (!pending.has(i)) return;
      pending.delete(i);
      rej(new Error(method + ': no answer from the browser in 4 minutes'));
    }, 240000).unref();
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  // runs `expression` in the page, awaiting a returned promise, and returns its value
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 240000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  const off = (method) => listeners.delete(method);
  await send('Runtime.enable');
  await send('Page.enable');
  const size = (w, h, mobile = w < 600) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  const close = () => {
    try { ws.close(); } catch {}
    proc.kill();
  };
  return { send, evaluate, on, off, size, errors, close, profile };
}

// Makes "test" the active profile (so real data is never touched), then opens the app and, for
// the app page itself, waits until the database is open and the board is drawn. With
// `seed: false` nothing is set and the app starts on its welcome screen.
export async function openApp(page, { origin = 'http://localhost:8137', path = '', timeoutMs = 20000, seed = true } = {}) {
  await page.send('Page.navigate', { url: origin + '/manifest.webmanifest' });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (await page.evaluate(`location.href.endsWith('/manifest.webmanifest') && document.readyState === 'complete'`).catch(() => false)) break;
  }
  if (seed) {
    await page.evaluate(`localStorage.setItem('ft:activeUser', JSON.stringify('test')); localStorage.setItem('ft:profiles', JSON.stringify({ test: { store: 'server', lastUsed: Date.now() } })); sessionStorage.setItem('ft:picked', '1')`);
  }
  const t0 = Date.now();
  await page.send('Page.navigate', { url: origin + '/' + path });
  if (path || !seed) return 0;
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(`!!(window.ft && !document.getElementById('loading') && document.querySelectorAll('#board .fb-num').length)`)) break;
    await sleep(50);
  }
  return Date.now() - t0; // time to a usable board, in ms
}
