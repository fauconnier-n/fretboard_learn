// Mock practice data for the README's growth GIF: a learner who starts on low E near the nut and
// meets new positions day by day, as the curriculum opens them. A new position starts often wrong
// and slow; it gets surer and quicker with each answer. One backup file per snapshot day, each
// ending an hour ago, for Settings → Data → Import JSON:
//   node tools/seed-growth.mjs <out folder> [--days 1,2,3,5,7,10,14,19,24] [--seed 3]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const out = args[0];
if (!out) throw new Error('usage: node tools/seed-growth.mjs <out folder> [--days 1,2,5] [--seed 3]');
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const SNAPS = opt('days', '1,2,3,5,7,10,14,19,24').split(',').map(Number);
let seed = +opt('seed', 3);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const STRINGS = [40, 45, 50, 55, 59, 64]; // low E … high e
const run = (s, a, b) => Array.from({ length: b - a + 1 }, (_, i) => ({ s, f: a + i }));
// the order the curriculum opens positions in: low E from the nut, A near the nut, high e (low E's
// twin), then up the neck and across
const ORDER = [run(0, 0, 12), run(1, 0, 4), run(5, 0, 9), run(1, 5, 12), run(2, 0, 7), run(5, 10, 15), run(0, 13, 15),
  run(2, 8, 15), run(3, 0, 12), run(4, 0, 12), run(1, 13, 15), run(3, 13, 15), run(4, 13, 15)].flat()
  .map((c) => ({ ...c, reps: 0, ease: 0.7 + rnd() * 0.6 }));
const ACCIDENTAL = new Set([1, 3, 6, 8, 10]);
const grade = (ms) => clamp(1 - (0.8 * Math.log(ms / 600)) / Math.log(7000 / 600), 0.2, 1);

// the whole history, day by day, with times as days from the start
const days = [];
let open = 0;
for (let d = 0; d < Math.max(...SNAPS); d++) {
  open = Math.min(ORDER.length, open + (d === 0 ? 8 : 5));
  const known = ORDER.slice(0, open);
  const answers = [];
  for (let k = 0; k < 2; k++) { // two runs a day, 20 prompts each
    for (let i = 0; i < 20; i++) {
      // newer and weaker positions come up more
      const w = known.map((c, j) => 1 / (1 + c.reps) + (j >= open - 5 ? 0.6 : 0));
      let r = rnd() * w.reduce((a, b) => a + b, 0);
      const c = known[w.findIndex((x) => (r -= x) <= 0)] || known.at(-1);
      const skill = 1 - Math.exp(-(c.reps * c.ease) / 10); // 0 new … 1 well known
      const correct = rnd() < 0.2 + 0.77 * skill - (ACCIDENTAL.has((STRINGS[c.s] + c.f) % 12) ? 0.08 : 0);
      const ms = Math.round((800 + 4200 * (1 - skill)) * Math.exp((rnd() - 0.5) * 0.5));
      c.reps++;
      answers.push({ run: k, s: c.s, f: c.f, correct, ms });
    }
  }
  days.push(answers);
}

mkdirSync(out, { recursive: true });
for (const snap of SNAPS) {
  const end = Date.now() - 3600000;
  const attempts = [];
  const runs = [];
  days.slice(0, snap).forEach((answers, d) => {
    for (const k of [0, 1]) {
      const id = `growth${d}-${k}`;
      const start = end - (snap - 1 - d) * 86400000 - (k ? 1 : 2) * 1800000;
      let t = start;
      const mine = answers.filter((a) => a.run === k);
      const s = mine[0].s;
      const desc = { type: 'string', sk: String(s), cs: s, cf: 5.5, span: 11, fretMin: 0, fretMax: 11 };
      for (const a of mine) {
        const target = STRINGS[a.s] + a.f;
        t += a.ms + 700;
        attempts.push({
          t, runId: id, tuning: 'standard', instrument: 'guitar6', strings: STRINGS.join(','), desc, s: a.s, f: a.f, target,
          spelling: ACCIDENTAL.has(target % 12) ? 's' : 'n', played: a.correct ? target : target + (rnd() < 0.5 ? -1 : 2),
          correct: a.correct, ms: a.ms, g: a.correct ? grade(a.ms) : 0, review: false, task: 'play',
        });
      }
      const times = mine.filter((a) => a.correct).map((a) => a.ms).sort((a, b) => a - b);
      runs.push({
        run_id: id, started_at: start, ended_at: t, end_reason: 'completed', tuning: 'standard', instrument: 'guitar6', strings: STRINGS.join(','),
        mode: 'count', run_count: 20, zone_type: 'string', zone_strings: String(s), zone_cs: s, zone_cf: 5.5, zone_span: 11, zone_fret_min: 0, zone_fret_max: 11,
        zone_label: `String ${s} — frets 0–11`, review: false, retry: true, timeout_sec: 10, prompts: 20, correct: times.length,
        median_ms: times[Math.floor(times.length / 2)] ?? null, task: 'play',
      });
    }
  });
  writeFileSync(join(out, `day${snap}.json`), JSON.stringify({ app: 'fretboard-trainer', version: 3, user: 'demo', exported: new Date().toISOString(), kv: {}, attempts, runs }));
  console.log(`day ${snap}: ${attempts.length} answers`);
}
