// Note-name labels shown on the zone during a run (the "cue"), and how far they are from
// the note asked. In "fade" mode a label shows only on positions you do not know well yet,
// and it is dropped during the run once you answer that note right. Every prompt logs the
// labels that were on the board and their distances (attempts.cue_*), so the effect of
// cues can be studied later and other distance measures can be computed in SQL.

import { LANDMARKS } from './srs.js';
import { isAccidental, spellName } from './music.js';

export const CUE_MODES = ['off', 'fade', 'all', 'naturals', 'landmarks'];

// "fade": a position gets its label while the chance of recalling it is below FULL_BELOW;
// between FULL_BELOW and PART_BELOW only naturals and landmark frets keep theirs.
const FULL_BELOW = 0.55;
const PART_BELOW = 0.7;

// Distance between two positions on the board, in fret widths. A step along a string
// (the horizontal direction) counts 1; a step to the next string counts STRING_WEIGHT, so
// notes on the same string are closer than notes the same number of steps away across strings.
export const STRING_WEIGHT = 2;
export const distance = (a, b) => Math.hypot(a.f - b.f, STRING_WEIGHT * (a.s - b.s));

export const labelOf = (cell) => spellName(cell.midi, isAccidental(cell.pc) ? 's' : 'n');

// Keys of the zone cells that carry a label at the start of a run.
export function initialCues(mode, zone, sch, desc, now = Date.now()) {
  const out = new Set();
  if (mode === 'off') return out;
  const snap = mode === 'fade' ? sch.snapshot(now) : null;
  for (const c of zone.cells) {
    const natural = !isAccidental(c.pc);
    const landmark = LANDMARKS.includes(c.f);
    let show;
    if (mode === 'all') show = true;
    else if (mode === 'naturals') show = natural;
    else if (mode === 'landmarks') show = landmark;
    else {
      const p = sch.pCell(c, desc, snap, now);
      show = p < FULL_BELOW || (p < PART_BELOW && (natural || landmark));
    }
    if (show) out.add(c.key);
  }
  return out;
}

// What is logged for one prompt, given the cells that carried a label while it was asked.
// cueLabels is "name@string:fret;…" (string 0 = lowest) and cueDist the distance of each
// label to the target, in the same order; cueNearest is the nearest label other than the
// target's own.
export function describeCues(target, shown) {
  const others = shown.filter((c) => c.key !== target.key);
  const nearest = others.length ? Math.min(...others.map((c) => distance(target, c))) : null;
  return {
    cueN: shown.length,
    cueTarget: shown.some((c) => c.key === target.key),
    cueLabels: shown.map((c) => `${labelOf(c)}@${c.s}:${c.f}`).join(';') || null,
    cueDist: shown.map((c) => +distance(target, c).toFixed(2)).join(';') || null,
    cueNearest: nearest == null ? null : +nearest.toFixed(2),
  };
}
