// Varied practice data for the `test` profile, as a backup file the app imports (Settings → Data →
// Import JSON replaces everything): node tools/seed-test.mjs <out.json> [--days 30] [--seed 7]
// A 6-string guitar in standard tuning; each position gets its own skill (strong low E, weak G and
// B strings, harder past fret 9, a few never played), getting better over the days, so the maps,
// bars and lists show a spread of strong, weak, slow and unplayed positions.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? +args[i + 1] : fallback; };
const out = args[0];
if (!out) throw new Error('usage: node tools/seed-test.mjs <out.json> [--days 30] [--seed 7]');
const DAYS = opt('days', 30);
let seed = opt('seed', 7);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const STRINGS = [40, 45, 50, 55, 59, 64];
const FRETS = 15;
const STRING_SKILL = [0.92, 0.85, 0.68, 0.55, 0.45, 0.82]; // low E … high e
const ACCIDENTAL = new Set([1, 3, 6, 8, 10]);
// each position's own skill and pace; some high positions on G and B are never played
const pos = [];
for (let s = 0; s < 6; s++) {
  for (let f = 0; f <= FRETS; f++) {
    const never = (s === 3 || s === 4) && f >= 12;
    const p = clamp(STRING_SKILL[s] - (f > 9 ? 0.18 : f > 5 ? 0.07 : 0) - (ACCIDENTAL.has((STRINGS[s] + f) % 12) ? 0.08 : 0) + (rnd() - 0.5) * 0.5, 0.1, 0.98);
    pos.push({ s, f, p, pace: 650 + (1 - p) * 2600 * (0.6 + rnd()), never });
  }
}

const grade = (ms) => clamp(1 - (0.8 * Math.log(ms / 600)) / Math.log(7000 / 600), 0.2, 1);
const attempts = [];
const runs = [];
const day0 = Date.now() - DAYS * 86400000;
for (let d = 0; d < DAYS; d++) {
  if (rnd() < 0.15) continue; // a few days off
  const learnt = d / DAYS; // better later on
  for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) {
    const id = 'seed' + d + '-' + k;
    let t = day0 + d * 86400000 + (17 + k) * 3600000 + Math.floor(rnd() * 1800000);
    // a zone: 12 frets on one string, or a box of 3 strings × 4 frets
    const box = rnd() < 0.5;
    const s0 = box ? Math.floor(rnd() * 4) : Math.floor(rnd() * 6);
    const f0 = box ? Math.floor(rnd() * 11) : pick([0, 0, 1, 3]);
    const cells = pos.filter((c) => !c.never && (box ? c.s >= s0 && c.s < s0 + 3 && c.f >= f0 && c.f < f0 + 4 : c.s === s0 && c.f >= f0 && c.f < f0 + 12));
    const strs = box ? [s0, s0 + 1, s0 + 2] : [s0];
    const desc = { type: box ? 'box' : 'string', sk: strs.join(','), cs: (strs[0] + strs.at(-1)) / 2, cf: box ? f0 + 1.5 : f0 + 5.5, span: box ? 3 : 11, fretMin: f0, fretMax: box ? f0 + 3 : f0 + 11 };
    const start = t;
    const times = [];
    let right = 0;
    const prompts = 12 + Math.floor(rnd() * 9);
    for (let i = 0; i < prompts; i++) {
      const c = pick(cells);
      const target = STRINGS[c.s] + c.f;
      const correct = rnd() < clamp(c.p * (0.75 + 0.3 * learnt), 0.05, 0.99);
      const ms = Math.round(c.pace * (1.25 - 0.35 * learnt) * Math.exp((rnd() - 0.5) * 0.6));
      const sp = ACCIDENTAL.has(target % 12) ? (rnd() < 0.5 ? 's' : 'f') : 'n';
      t += ms + 700;
      if (correct) { right++; times.push(ms); }
      attempts.push({
        t, runId: id, tuning: 'standard', instrument: 'guitar6', strings: STRINGS.join(','), desc, s: c.s, f: c.f, target, spelling: sp,
        played: correct ? target : target + pick([-2, -1, 1, 2, 12]), correct, ms, g: correct ? grade(ms) : 0, review: false, task: 'play',
      });
    }
    times.sort((a, b) => a - b);
    runs.push({
      run_id: id, started_at: start, ended_at: t, end_reason: 'completed', tuning: 'standard', instrument: 'guitar6', strings: STRINGS.join(','),
      mode: 'count', run_count: prompts, zone_type: desc.type, zone_strings: desc.sk, zone_cs: desc.cs, zone_cf: desc.cf, zone_span: desc.span,
      zone_fret_min: desc.fretMin, zone_fret_max: desc.fretMax, zone_label: box ? `Strings ${desc.sk} — frets ${f0}–${f0 + 3}` : `String ${s0} — frets ${f0}–${f0 + 11}`,
      review: false, retry: true, timeout_sec: 10, prompts, correct: right, median_ms: times[Math.floor(times.length / 2)] ?? null, task: 'play',
    });
  }
}
writeFileSync(out, JSON.stringify({ app: 'fretboard-trainer', version: 3, user: 'test', exported: new Date().toISOString(), kv: {}, attempts, runs }));
console.log(`${attempts.length} answers, ${runs.length} runs over ${DAYS} days -> ${out}`);
