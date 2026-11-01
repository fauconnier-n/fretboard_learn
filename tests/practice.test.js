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

test('zone outline: one closed contour around the rows, corners rounded', async () => {
  const { zoneOutline } = await import('../js/fretboard.js');
  // a staircase: row 1 frets x 0-40, row 2 x 0-20 (cells 10 wide, 30 high)
  const cell = (x, y) => ({ x, y, width: 10, height: 30 });
  const rects = [cell(0, 0), cell(10, 0), cell(20, 0), cell(30, 0), cell(0, 30), cell(10, 30)];
  const d = zoneOutline(rects);
  assert.ok(d.startsWith('M') && d.endsWith('Z'));
  assert.equal((d.match(/Q/g) || []).length, 6, 'six corners: four outer, two at the step');
  assert.ok(!/NaN/.test(d));
  // a single row is a rounded rectangle
  assert.equal((zoneOutline([cell(0, 0), cell(10, 0)]).match(/Q/g) || []).length, 4);
});

test('progress helpers: rolling mean and the last week against the one before', async () => {
  const { rolling, weekOverWeek } = await import('../js/progress.js');
  assert.deepEqual(rolling([1, 3, 5, 7], 2), [1, 2, 4, 6]);
  const now = Date.parse('2026-11-01T12:00:00Z');
  const w = weekOverWeek([
    { day: '2026-11-01', n: 10, acc: 0.9, med: 700 },
    { day: '2026-10-30', n: 10, acc: 0.7, med: 900 },
    { day: '2026-10-22', n: 20, acc: 0.5, med: 1200 }, // 10 days ago: the week before
    { day: '2026-10-01', n: 99, acc: 0, med: 0 }, // too old
  ], now);
  assert.equal(w.now.n, 20);
  assert.ok(Math.abs(w.now.acc - 0.8) < 1e-9);
  assert.equal(w.before.n, 20);
  assert.equal(w.before.acc, 0.5);
});

test('notes by octave: a note name splits into the octaves it was asked in', async () => {
  const { octaveRows } = await import('../js/stats.js');
  const sch = new Scheduler(newModel(), strings, 15);
  const desc = { type: 'string', sk: '0', cs: 0, cf: 5.5, span: 12 };
  const low = lowE.cells.find((c) => c.f === 5); // A2
  sch.record(desc, low, 'n', true, 800, Date.now());
  sch.record(desc, { s: 3, f: 2, midi: 57, pc: 9, key: '3:2' }, 'n', false, 3000, Date.now()); // A3 on the G string
  const rows = octaveRows(sch, 'A');
  assert.deepEqual(rows.map((r) => r.label), ['A2', 'A3']);
  assert.ok(rows[0].acc > rows[1].acc);
});
