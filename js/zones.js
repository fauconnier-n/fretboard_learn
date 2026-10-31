// Zone generator. A zone is a set of 12 fretboard cells holding each pitch class
// exactly once, so every quiz prompt has a single correct position.

import { pcOf, stringName } from './music.js';

const MAX_BOX_SPAN = 5; // highest fret - lowest fret inside a box
const MIN_RUN = 2;      // at least two cells per string in a box
const MAX_BOX_STRINGS = 4;

export function generateZones(strings, frets, types = 'both') {
  const zones = [];
  if (types !== 'string') zones.push(...curateBoxes(strings, frets));
  if (types !== 'box') zones.push(...singleStringZones(strings, frets));
  return zones;
}

function singleStringZones(strings, frets) {
  const out = [];
  for (let s = 0; s < strings.length; s++) {
    for (let f0 = 0; f0 + 11 <= frets; f0++) out.push(makeZone('string', strings, [{ s, a: f0, b: f0 + 11 }]));
  }
  return out;
}

// Every connected staircase of fret runs over adjacent strings with 12 unique pitch classes.
function boxCandidates(strings, frets) {
  const out = [];
  const runs = [];
  const nS = strings.length;

  function dfs(s, mask, count, lo, hi) {
    if (s >= nS) return;
    const prev = runs[runs.length - 1];
    for (let a = 0; a <= frets; a++) {
      if (prev && a > prev.b + 1) break;
      for (let b = a + MIN_RUN - 1; b <= frets; b++) {
        const len = b - a + 1;
        if (count + len > 12) break;
        const nlo = Math.min(lo, a);
        const nhi = Math.max(hi, b);
        if (nhi - nlo > MAX_BOX_SPAN) break;
        if (prev && b < prev.a - 1) continue;
        let m = mask;
        let clash = false;
        for (let f = a; f <= b; f++) {
          const bit = 1 << pcOf(strings[s] + f);
          if (m & bit) { clash = true; break; }
          m |= bit;
        }
        if (clash) break; // a longer run on this string would clash too
        runs.push({ s, a, b });
        if (count + len === 12) {
          if (runs.length >= 2) out.push(runs.map((r) => ({ ...r })));
        } else if (runs.length < MAX_BOX_STRINGS) {
          dfs(s + 1, m, count + len, nlo, nhi);
        }
        runs.pop();
      }
    }
  }

  for (let s0 = 0; s0 < nS - 1; s0++) dfs(s0, 0, 0, Infinity, -Infinity);
  return out;
}

// Lower is a more natural hand shape: compact, even runs, aligned across strings.
function shapeCost(runs) {
  const lens = runs.map((r) => r.b - r.a + 1);
  const mean = 12 / runs.length;
  const imbalance = Math.sqrt(lens.reduce((t, l) => t + (l - mean) ** 2, 0) / lens.length);
  let misalign = 0;
  for (let i = 1; i < runs.length; i++) {
    misalign += Math.abs(runs[i].a - runs[i - 1].a) + Math.abs(runs[i].b - runs[i - 1].b);
  }
  const lo = Math.min(...runs.map((r) => r.a));
  const hi = Math.max(...runs.map((r) => r.b));
  return hi - lo + 0.6 * imbalance + 0.15 * misalign + 0.3 * Math.abs(runs.length - 3);
}

function curateBoxes(strings, frets) {
  const cands = boxCandidates(strings, frets).map((runs) => ({
    runs,
    cost: shapeCost(runs),
    lo: Math.min(...runs.map((r) => r.a)),
  }));
  // keep the nicest shape per (first string, string count, lowest fret)
  const best = new Map();
  for (const c of cands) {
    const key = `${c.runs[0].s}|${c.runs.length}|${c.lo}`;
    const cur = best.get(key);
    if (!cur || c.cost < cur.cost) best.set(key, c);
  }
  const kept = [...best.values()];
  // make sure every position on the neck is in at least one box
  const covers = (c, s, f) => c.runs.some((r) => r.s === s && f >= r.a && f <= r.b);
  for (let s = 0; s < strings.length; s++) {
    for (let f = 0; f <= frets; f++) {
      if (kept.some((c) => covers(c, s, f))) continue;
      let pick = null;
      for (const c of cands) if (covers(c, s, f) && (!pick || c.cost < pick.cost)) pick = c;
      if (pick) kept.push(pick);
    }
  }
  return kept.map((c) => makeZone('box', strings, c.runs));
}

function makeZone(type, strings, runs) {
  const cells = [];
  for (const r of runs) {
    for (let f = r.a; f <= r.b; f++) {
      const midi = strings[r.s] + f;
      cells.push({ s: r.s, f, midi, pc: pcOf(midi), key: r.s + ':' + f });
    }
  }
  const ss = runs.map((r) => r.s);
  const fretMin = Math.min(...runs.map((r) => r.a));
  const fretMax = Math.max(...runs.map((r) => r.b));
  let crossesThird = false;
  for (let i = 1; i < ss.length; i++) if (strings[ss[i]] - strings[ss[i - 1]] !== 5) crossesThird = true;
  const byPc = new Array(12);
  for (const c of cells) byPc[c.pc] = c;
  return {
    id: type + ':' + runs.map((r) => `${r.s}.${r.a}-${r.b}`).join('/'),
    type,
    runs,
    cells,
    strings: ss,
    fretMin,
    fretMax,
    span: fretMax - fretMin,
    cs: cells.reduce((t, c) => t + c.s, 0) / cells.length,
    cf: cells.reduce((t, c) => t + c.f, 0) / cells.length,
    crossesThird,
    byPc,
  };
}

// Shape descriptor stored with every attempt; independent of zone ids.
export function describe(zone) {
  return {
    type: zone.type,
    sk: zone.strings.join(','),
    cs: +zone.cs.toFixed(3),
    cf: +zone.cf.toFixed(3),
    span: zone.span,
    fretMin: zone.fretMin,
    fretMax: zone.fretMax,
  };
}

export function zoneLabel(zone, strings, flats) {
  const names = zone.strings.map((s) => stringName(strings, s, flats)).join(' · ');
  return `${zone.type === 'string' ? 'String' : 'Strings'} ${names} — frets ${zone.fretMin}–${zone.fretMax}`;
}

export function selfTest(strings, frets, types = 'both') {
  const zones = generateZones(strings, frets, types);
  const bad = zones.filter((z) => z.cells.length !== 12 || new Set(z.cells.map((c) => c.pc)).size !== 12);
  const covered = new Set(zones.flatMap((z) => z.cells.map((c) => c.key)));
  const uncovered = [];
  for (let s = 0; s < strings.length; s++) {
    for (let f = 0; f <= frets; f++) if (!covered.has(s + ':' + f)) uncovered.push(s + ':' + f);
  }
  return { zones: zones.length, bad: bad.map((z) => z.id), uncovered };
}
