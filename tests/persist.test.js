// What is stored of a model (main.js persistedModel: version and meta) is enough to get the
// same model back after a rebuild from the answer log: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../js/instruments.js';
import { Scheduler, newModel } from '../js/srs.js';
import { generateZones } from '../js/zones.js';

const strings = INSTRUMENTS.guitar6.strings;
const zones = generateZones(strings, 15, 'both');
const lowE = zones.find((z) => z.type === 'string' && z.strings[0] === 0 && z.cells[0].f === 0);
const desc = { type: 'string', sk: '0', cs: 0, cf: 5.5, span: 11, fretMin: 0, fretMax: 11 };
const persistedModel = (m) => ({ version: m.version, meta: m.meta });

// a deterministic log: 6 runs of 12 answers on the low E string, some wrong
function syntheticLog() {
  const log = [];
  let t = 1700000000000;
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let run = 0; run < 6; run++) {
    for (const c of lowE.cells) {
      const correct = rnd() > 0.25;
      log.push({ desc, s: c.s, f: c.f, target: c.midi, spelling: 'n', correct, ms: 800 + Math.round(rnd() * 2000), t, runId: 'r' + run, task: 'play', played: correct ? c.midi : c.midi + 1 });
      t += 60000;
    }
    t += 86400000;
  }
  return log;
}

function fromLog(model, log) {
  const sch = new Scheduler(model, strings, 15);
  sch.rebuild(log);
  return sch;
}

test('version and meta are enough: a slim stored model rebuilds to the same model', () => {
  const log = syntheticLog();
  const sch = fromLog(newModel(), log);
  // what only the end of a run changes, and what the model check changes
  sch.endRun({ acc: 0.75, medianMs: 1200, desc, review: false });
  sch.useDecay(0.3);
  sch.rebuild(log); // the model check rebuilds under the new decay, as the app does
  sch.model.meta.best['String E — frets 0–11|12'] = 9;
  const stored = JSON.parse(JSON.stringify(persistedModel(sch.model)));
  assert.deepEqual(Object.keys(stored).sort(), ['meta', 'version']);
  // the next start: merge over a fresh model, mark stale, rebuild from the same log
  const again = fromLog({ ...newModel(), ...stored, stale: true }, log);
  assert.equal(again.needsRebuild, false);
  assert.deepEqual(again.model.cards, sch.model.cards);
  assert.deepEqual(again.model.notes, sch.model.notes);
  assert.deepEqual(again.model.ctx, sch.model.ctx);
  assert.deepEqual(again.model.conf, sch.model.conf);
  assert.deepEqual(again.model.meta, sch.model.meta);
});

test('a graded answer changes nothing of the stored part except the replayed time fields', () => {
  const log = syntheticLog();
  const sch = fromLog(newModel(), log);
  const kept = (m) => { const { time, recentLog, floor, fx, ...rest } = JSON.parse(JSON.stringify(m.meta)); void time; void recentLog; void floor; void fx; return rest; };
  const before = kept(sch.model);
  const c = lowE.cells[3];
  sch.record(desc, c, 'n', true, 950, Date.now());
  sch.record(desc, lowE.cells[4], 'n', false, 2500, Date.now() + 5000);
  sch.recordConfusion(lowE.cells[4], 'n', lowE.cells[4].midi + 1);
  assert.deepEqual(kept(sch.model), before);
  assert.equal(sch.model.version, newModel().version);
});

test('an old full model stored before this change still loads and rebuilds', () => {
  const log = syntheticLog();
  const full = JSON.parse(JSON.stringify(fromLog(newModel(), log).model));
  assert.ok(Object.keys(full.cards).length > 0);
  const again = fromLog({ ...newModel(), ...full, stale: true }, log.slice(0, 24));
  assert.equal(Object.keys(again.model.cards).length, Object.keys(fromLog(newModel(), log.slice(0, 24)).model.cards).length);
});
