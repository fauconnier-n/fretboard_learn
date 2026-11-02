// Performance measurements of the app in headless Edge, as user "test" (the server must be running).
//   node tools/perf.mjs [--out <file.json>] [--compare <baseline.json>] [--seed <k>] [--origin http://localhost:8137] [--port 9444]
// Scenarios, in order: a cold start (fresh browser profile: no caches, the database restored from
// the disk copy), two warm starts, a run of keyboard answers, 2 s of a running quiz with nothing
// happening, the Stats tab, and the end of a run with its backup. Numbers come from the marks
// in js/main.js and js/storage.js (app:*, db:*), the Performance API and a DevTools trace.
// --seed k multiplies the test user's answer log k times first (older copies, shifted back in
// time) to see how costs grow with data; it replaces the test user's data.
// --compare prints each metric next to the baseline file's value.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { launch, openApp, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const origin = opt('origin', 'http://localhost:8137');
const port = +opt('port', 9444);
const out = opt('out', '');
const compare = opt('compare', '');
const seed = +opt('seed', 0);

const metrics = {}; // name -> number (ms unless the name says otherwise)
const put = (name, value) => { metrics[name] = typeof value === 'number' ? +value.toFixed(1) : value; };

// the page's marks and measures since the last navigation
const MARKS = `(() => {
  const m = {};
  for (const e of performance.getEntriesByType('mark')) m[e.name] = Math.round(e.startTime);
  const ms = {};
  for (const e of performance.getEntriesByType('measure')) (ms[e.name] ||= []).push(+e.duration.toFixed(1));
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const api = res.filter((r) => r.name.includes('/api/data/'));
  return { marks: m, measures: ms, dcl: Math.round(nav?.domContentLoadedEventEnd || 0), resources: res.length,
    apiBytes: api.reduce((a, r) => a + r.transferSize, 0), apiMs: api.reduce((a, r) => Math.max(a, r.responseEnd), 0) - (api.length ? Math.min(...api.map((r) => r.startTime)) : 0),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    boardNodes: document.querySelectorAll('#board *').length };
})()`;

// answers the asked note with the keyboard (the same trick as tools/tour.mjs)
const ANSWER = `const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nat = [0, 2, 4, 5, 7, 9, 11];
const key = (k, shift) => { const t = performance.now(); window.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true })); return performance.now() - t; };
const play = (n) => { const pc = PC[n]; const i = nat.indexOf(pc); return i >= 0 ? key('CDEFGAB'[i]) : key('CDEFGAB'[nat.indexOf(pc - 1)], true); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const running = () => document.getElementById('startBtn').textContent.includes('Stop');`;

const TRACE_CATS = ['disabled-by-default-devtools.timeline', 'devtools.timeline'];

async function traced(page, ms) {
  const events = [];
  page.on('Tracing.dataCollected', (p) => events.push(...p.value));
  const done = new Promise((r) => page.on('Tracing.tracingComplete', r));
  await page.send('Tracing.start', { traceConfig: { includedCategories: TRACE_CATS }, transferMode: 'ReportEvents' });
  await sleep(ms);
  await page.send('Tracing.end');
  await done;
  page.off('Tracing.dataCollected');
  page.off('Tracing.tracingComplete');
  const sum = {};
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur || !['Layout', 'Paint', 'UpdateLayoutTree', 'FunctionCall', 'RunTask'].includes(e.name)) continue;
    const s = (sum[e.name] ||= { n: 0, ms: 0 });
    s.n++;
    s.ms += e.dur / 1000;
  }
  const per = (name) => ({ perSec: +(((sum[name]?.n || 0) * 1000) / ms).toFixed(1), ms: +(((sum[name]?.ms || 0) * 1000) / ms).toFixed(1) });
  return { layout: per('Layout'), paint: per('Paint'), style: per('UpdateLayoutTree'), script: per('FunctionCall') };
}

async function startup(page, label) {
  const ready = await openApp(page, { origin });
  await sleep(1200);
  const m = await page.evaluate(MARKS);
  put(`${label}.ready`, ready);
  for (const [k, v] of Object.entries(m.marks)) put(`${label}.${k}`, v);
  put(`${label}.dcl`, m.dcl);
  put(`${label}.apiKB`, m.apiBytes / 1024);
  put(`${label}.apiMs`, m.apiMs);
  put(`${label}.heapMB`, m.heapMB);
  put(`${label}.resources`, m.resources);
}

let browser;
try {
  browser = await launch({ port, profileName: `fretboard-perf-${port}`, fresh: true });
  let page = browser;
  await page.size(1200, 900);
  await page.send('Network.enable', { maxPostDataSize: 4 << 20 });

  if (seed > 1) {
    await openApp(page, { origin });
    const n = await page.evaluate(`(async () => {
      const storage = await import('/js/storage.js');
      const data = await storage.exportAll();
      const ts = data.attempts.map((a) => a.t);
      const span = Math.max(...ts) - Math.min(...ts) + 86400000;
      const attempts = [...data.attempts];
      const runs = [...data.runs];
      for (let i = 1; i < ${seed}; i++) {
        for (const a of data.attempts) attempts.push({ ...a, t: a.t - i * span, runId: a.runId + '_' + i });
        for (const r of data.runs) runs.push({ ...r, run_id: r.run_id + '_' + i, started_at: r.started_at - i * span, ended_at: r.ended_at == null ? null : r.ended_at - i * span });
      }
      attempts.sort((a, b) => a.t - b.t);
      await storage.importAll({ ...data, attempts, runs });
      return attempts.length;
    })()`);
    console.log(`seeded the test user with ${n} answers (x${seed})`);
    browser.close();
    page = browser = await launch({ port, profileName: `fretboard-perf-${port}`, fresh: true });
    await page.size(1200, 900);
    await page.send('Network.enable', { maxPostDataSize: 4 << 20 });
  }

  console.log('cold start…');
  await startup(page, 'cold');
  console.log('warm starts…');
  await startup(page, 'warm1');
  await startup(page, 'warm');
  put('attempts', await page.evaluate(`window.ft.rows('attempts').length`));

  console.log('a run of answers…');
  // a run of keyboard answers: handler time, long tasks, saves, writes to the disk copy
  const net = { put: 0, putKB: 0, post: 0, postKB: 0 };
  page.on('Network.requestWillBeSent', (p) => {
    const r = p.request;
    if (!r.url.includes('/api/data/')) return;
    const kb = (r.postData?.length || 0) / 1024;
    if (r.method === 'PUT') { net.put++; net.putKB += kb; } else if (r.method === 'POST') { net.post++; net.postKB += kb; }
  });
  const run = await page.evaluate(`(async () => { ${ANSWER}
    window.__lt = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch {}
    performance.clearMeasures();
    key('Escape'); await wait(200);
    document.querySelector('[data-task=play]').click(); document.querySelector('[data-mode=count]').click();
    const t0 = performance.now(); key('Enter'); const preview = performance.now() - t0; await wait(400);
    const t1 = performance.now(); key('Enter'); const start = performance.now() - t1; await wait(300);
    const handler = [];
    for (let i = 0; i < 10 && running(); i++) { handler.push(play(document.getElementById('promptNote').textContent)); await wait(1100); }
    await wait(2500); // the flush to the disk copy
    const saves = performance.getEntriesByType('measure').filter((m) => m.name === 'answer:save').map((m) => m.duration);
    return { preview, start, handler: handler.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, handler.length - 1), firstHandler: handler[0], saves: saves.length, saveMs: saves.reduce((a, b) => a + b, 0) / Math.max(1, saves.length), longTasks: window.__lt.length, longTaskMs: window.__lt.reduce((a, b) => a + b, 0) };
  })()`);
  put('run.newRunMs', run.preview);
  put('run.startMs', run.start);
  put('run.answerHandlerMs', run.handler);
  put('run.firstAnswerMs', run.firstHandler);
  put('run.modelSaves', run.saves);
  put('run.modelSaveMs', run.saveMs);
  put('run.longTasks', run.longTasks);
  put('run.longTaskMs', run.longTaskMs);
  put('run.diskPUT', net.put);
  put('run.diskPUTKB', net.putKB);
  put('run.diskPOST', net.post);
  put('run.diskPOSTKB', net.postKB);
  page.off('Network.requestWillBeSent');

  console.log('tick loop…');
  // the run is still going: 2 s of the tick loop with nothing happening
  const idle = await traced(page, 2000);
  put('loop.layoutsPerSec', idle.layout.perSec);
  put('loop.paintsPerSec', idle.paint.perSec);
  put('loop.layoutMsPerSec', idle.layout.ms);
  put('loop.paintMsPerSec', idle.paint.ms);
  put('loop.styleMsPerSec', idle.style.ms);
  put('loop.scriptMsPerSec', idle.script.ms);

  console.log('end of the run…');
  // finish the run: its summary, the model save and the backup
  const end = await page.evaluate(`(async () => { ${ANSWER}
    performance.clearMeasures();
    for (let i = 0; i < 60 && running(); i++) { const t = document.getElementById('promptNote').textContent; if (/Again|Play it/.test(document.getElementById('promptSub').textContent)) play(t); await wait(900); }
    for (let i = 0; i < 100 && !performance.getEntriesByName('run:backup').length; i++) await wait(100);
    const b = performance.getEntriesByName('run:backup')[0];
    return { backup: b ? b.duration : -1, summaryNodes: document.querySelectorAll('#summary *').length, boardNodes: document.querySelectorAll('#board *').length };
  })()`);
  put('end.backupMs', end.backup);
  put('end.boardNodes', end.boardNodes);

  console.log('stats…');
  // Stats: queries + render, then 1 s idle on the heat board
  const stats = await page.evaluate(`(async () => {
    performance.clearMeasures();
    document.querySelector('.tabs button[data-tab=stats]').click();
    for (let i = 0; i < 100 && !performance.getEntriesByName('stats:render').length; i++) await new Promise((r) => setTimeout(r, 50));
    const m = performance.getEntriesByName('stats:render')[0];
    return { ms: m ? m.duration : -1, heatNodes: document.querySelectorAll('#heatBoard *').length, filters: document.querySelectorAll('#heatBoard [filter]').length, dom: document.querySelectorAll('#view-stats *').length };
  })()`);
  put('stats.renderMs', stats.ms);
  put('stats.heatNodes', stats.heatNodes);
  put('stats.filters', stats.filters);
  put('stats.domNodes', stats.dom);
  const statsIdle = await traced(page, 1000);
  put('stats.paintsPerSec', statsIdle.paint.perSec);
  put('stats.paintMsPerSec', statsIdle.paint.ms);

  console.log('settings…');
  // Settings (lists the backups)
  const settings = await page.evaluate(`(async () => { const t = performance.now(); document.querySelector('.tabs button[data-tab=settings]').click(); await new Promise((r) => setTimeout(r, 50)); for (let i = 0; i < 60 && !document.querySelector('#backupList li'); i++) await new Promise((r) => setTimeout(r, 50)); return performance.now() - t; })()`);
  put('settings.openMs', settings);
  const heap = Object.fromEntries((await page.send('Performance.enable').then(() => page.send('Performance.getMetrics'))).metrics.map((m) => [m.name, m.value]));
  put('final.heapMB', heap.JSHeapUsedSize / 1048576);
  put('final.nodesWithDetached', heap.Nodes);

  // report
  let base = null;
  if (compare) {
    try { base = JSON.parse(readFileSync(compare, 'utf8')).metrics; } catch (e) { console.log('could not read baseline:', e.message); }
  }
  const w = Math.max(...Object.keys(metrics).map((k) => k.length));
  console.log(`\n${'metric'.padEnd(w)}  ${'now'.padStart(9)}${base ? '  ' + 'baseline'.padStart(9) + '  ' + 'change'.padStart(9) : ''}`);
  for (const [k, v] of Object.entries(metrics)) {
    const b = base?.[k];
    const d = b == null || typeof v !== 'number' ? '' : (v - b >= 0 ? '+' : '') + (v - b).toFixed(1);
    console.log(`${k.padEnd(w)}  ${String(v).padStart(9)}${base ? '  ' + String(b ?? '').padStart(9) + '  ' + d.padStart(9) : ''}`);
  }
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), origin, seed, metrics }, null, 2));
    console.log('\nsaved ' + resolve(out));
  }
  console.log(browser.errors.length ? 'ERRORS:\n' + browser.errors.join('\n') : 'no console errors');
} catch (e) {
  console.log('HARNESS ERROR', e.message);
  process.exitCode = 1;
} finally {
  browser?.close();
}
