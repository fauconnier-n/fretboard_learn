// Scheduler helpers behind the Practice run features: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../js/instruments.js';
import { Scheduler, newModel } from '../js/srs.js';
import { generateZones } from '../js/zones.js';

const strings = INSTRUMENTS.guitar6.strings;
const zones = generateZones(strings, 15, 'both');
const lowE = zones.find((z) => z.type === 'string' && z.strings[0] === 0 && z.cells[0].f === 0);

test('mix-ups: a wrong note marks both the asked cell and the note played instead', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  assert.equal(sch.confusionCells(lowE).size, 0);
  const f = lowE.cells.find((c) => c.f === 1); // F on low E
  sch.recordConfusion(f, 'n', 42); // played F# instead
  const cells = sch.confusionCells(lowE);
  assert.ok(cells.has(f.key));
  assert.ok(cells.has(lowE.byPc[6].key)); // the F# of the zone
  assert.equal(cells.size, 2);
  // a mix-ups pick only offers zones holding mix-ups
  const pick = sch.pickZone(zones, Date.now(), 'confusions');
  assert.equal(pick.focus, 'confusions');
  assert.ok(sch.confusionCells(pick.zone).size >= 2);
});

test('zone offers are distinct and do not look like the pick', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  for (let i = 0; i < 20; i++) {
    const pick = sch.pickZone(zones, Date.now());
    assert.ok(pick.alternatives.length <= 2);
    const all = [pick.zone, ...pick.alternatives.map((a) => a.zone)];
    assert.equal(new Set(all).size, all.length);
  }
});

test('note rings: empty for an unseen note, full for a known fast mastered one', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  assert.deepEqual(sch.noteRings('0:5'), { known: 0, fast: 0, auto: 0 });
  const cell = lowE.cells.find((c) => c.f === 5);
  const day = 86400000;
  let t = Date.now() - 3 * day;
  for (let i = 0; i < 12; i++, t += day / 4) sch.record({ type: 'string', sk: '0', cs: 0, cf: 5.5, span: 12 }, cell, 'n', true, 600, t);
  const r = sch.noteRings('0:5');
  assert.ok(r.known > 0.9 && r.fast > 0.9, JSON.stringify(r));
  assert.equal(r.auto, 1);
  for (const v of Object.values(r)) assert.ok(v >= 0 && v <= 1);
});


test('knowledge map: note names, and clouds bigger and denser with more questions', async () => {
  const { mapCell } = await import('../js/stats.js');
  const sch = new Scheduler(newModel(), strings, 15);
  const cell = lowE.cells.find((c) => c.f === 5);
  const desc = { type: 'string', sk: '0', cs: 0, cf: 5.5, span: 12 };
  sch.record(desc, cell, 'n', true, 900, Date.now());
  const once = mapCell(sch, sch.snapshot(), 0, 5, false);
  for (let i = 0; i < 20; i++) sch.record(desc, cell, 'n', true, 900, Date.now());
  const often = mapCell(sch, sch.snapshot(), 0, 5, false);
  assert.equal(once.label, 'A');
  assert.ok(often.opacity > once.opacity && often.cloud.w > once.cloud.w);
  assert.ok(often.cloud.w - once.cloud.w > often.cloud.h - once.cloud.h, 'grows mostly along the string');
  const unplayed = mapCell(sch, sch.snapshot(), 0, 1, true);
  assert.deepEqual([unplayed.label, unplayed.faint], ['F', true]);
});
