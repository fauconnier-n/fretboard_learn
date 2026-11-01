// The shortcuts taken for speed give the same answers as the plain computations: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../js/instruments.js';
import { Scheduler, newModel } from '../js/srs.js';
import { generateZones, describe } from '../js/zones.js';
import { auc } from '../js/modelcheck.js';
import { pcOf } from '../js/music.js';

const strings = INSTRUMENTS.guitar6.strings;
const zones = generateZones(strings, 15, 'both');
let seed = 11;
const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;

// the mix-up lookup as it was written before the index, kept here as the reference
function confusedWithPlain(sch, cell) {
  const out = new Set();
  for (const [key, played] of Object.entries(sch.model.conf)) {
    const [s, f] = key.split(':');
    const pc = pcOf(sch.strings[s] + +f);
    if (key.startsWith(cell.key + ':') || key === cell.key) for (const m of Object.keys(played)) out.add(pcOf(+m));
    else if (Object.keys(played).some((m) => pcOf(+m) === cell.pc)) out.add(pc);
  }
  out.delete(cell.pc);
  return out;
}

test('the mix-ups index gives the same notes as walking every logged mix-up', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  const cells = zones.flatMap((z) => z.cells);
  for (let i = 0; i < 300; i++) {
    const c = cells[Math.floor(rnd() * cells.length)];
    sch.recordConfusion(c, rnd() < 0.5 ? 'n' : 's', c.midi + Math.round(rnd() * 6 - 3) + (rnd() < 0.2 ? 12 : 0));
  }
  const idx = sch.confusionIndex();
  for (const z of zones) {
    for (const c of z.cells) assert.deepEqual([...sch.confusedWith(c, idx)].sort(), [...confusedWithPlain(sch, c)].sort(), c.key);
  }
  // and a mix-ups pick still works on it
  const pick = sch.pickZone(zones, Date.now(), 'confusions');
  assert.equal(pick.focus, 'confusions');
});

test('rank-based AUC equals the pairwise one, ties included', () => {
  const pairwise = (rows) => {
    const pos = rows.filter((r) => r.y).map((r) => r.p);
    const neg = rows.filter((r) => !r.y).map((r) => r.p);
    let wins = 0;
    for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
    return wins / (pos.length * neg.length);
  };
  for (let trial = 0; trial < 20; trial++) {
    const rows = Array.from({ length: 200 }, () => { const p = Math.round(rnd() * 10) / 10; return { p, y: rnd() < p ? 1 : 0 }; });
    if (!rows.some((r) => r.y) || rows.every((r) => r.y)) continue;
    assert.ok(Math.abs(auc(rows) - pairwise(rows)) < 1e-12);
  }
  assert.equal(auc([{ p: 0.5, y: 1 }]), null);
  assert.equal(auc([{ p: 0.9, y: 1 }, { p: 0.1, y: 0 }]), 1);
  assert.equal(auc([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]), 0.5);
});

test('zones and their descriptions are reused for the same strings, frets and shapes', () => {
  assert.equal(generateZones(strings, 15, 'both'), zones);
  assert.notEqual(generateZones(strings, 12, 'both'), zones); // one entry is kept: the live board
  const z = zones[0];
  assert.equal(describe(z), describe(z));
  assert.deepEqual(describe(z), { type: z.type, sk: z.strings.join(','), cs: +z.cs.toFixed(3), cf: +z.cf.toFixed(3), span: z.span, fretMin: z.fretMin, fretMax: z.fretMax });
});

test('the prior cached in a snapshot is the plain prior', () => {
  const sch = new Scheduler(newModel(), strings, 15);
  const lowE = zones.find((z) => z.type === 'string' && z.strings[0] === 0 && z.cells[0].f === 0);
  const desc = describe(lowE);
  for (let i = 0; i < 40; i++) { const c = lowE.cells[i % 12]; sch.record(desc, c, 'n', rnd() < 0.7, 900 + rnd() * 1500, Date.now() - (40 - i) * 60000); }
  const snap = sch.snapshot();
  for (const z of zones) for (const c of z.cells) assert.equal(sch.prior(c.s, c.f, snap), sch.priorOf(c.s, c.f, snap));
});
