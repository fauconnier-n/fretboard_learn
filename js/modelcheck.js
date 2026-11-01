// Model check (Settings → Data): how well the logged predictions matched what happened,
// and a fit of the forgetting curve's decay to your own answers.
// Predictions are logged just before each answer (attempts.pred_p), so each answer is an
// out-of-sample test. Metrics follow the open spaced-repetition benchmark: log loss against
// a constant baseline, AUC, calibration, split by the time since the item was last asked.

import { DEFAULT_DECAY, Scheduler } from './srs.js';
import { median } from './logQueries.js';

const LAGS = [
  ['under 2 min', 0, 2 * 60e3],
  ['2–10 min', 2 * 60e3, 10 * 60e3],
  ['10 min – 3 h', 10 * 60e3, 3 * 3600e3],
  ['3 h – 1 day', 3 * 3600e3, 86400e3],
  ['over 1 day', 86400e3, Infinity],
];
const DECAYS = [0.08, 0.1, 0.1542, 0.2, 0.3, 0.4, 0.5];
const MIN_FIT = 30; // answers more than an hour after the previous one, needed to fit the decay

const clampP = (p) => Math.min(0.99, Math.max(0.01, p));
export const logLoss = (rows) => -rows.reduce((t, r) => t + (r.y ? Math.log(clampP(r.p)) : Math.log(1 - clampP(r.p))), 0) / rows.length;

// Chance that a random right answer got a higher prediction than a random wrong one: the
// Mann–Whitney form (ranks, ties averaged), O(n log n) instead of every right-wrong pair.
export function auc(rows) {
  const n = rows.length;
  let pos = 0;
  for (const r of rows) if (r.y) pos++;
  const neg = n - pos;
  if (!pos || !neg) return null;
  const order = rows.map((_, i) => i).sort((a, b) => rows[a].p - rows[b].p);
  let rankSum = 0;
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && rows[order[j + 1]].p === rows[order[i]].p) j++;
    const rank = (i + j + 2) / 2; // 1-based, shared by the tied run
    for (let k = i; k <= j; k++) if (rows[order[k]].y) rankSum += rank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function metrics(rows) {
  if (!rows.length) return null;
  const base = rows.reduce((t, r) => t + r.y, 0) / rows.length;
  return { n: rows.length, ll: logLoss(rows), base: logLoss(rows.map((r) => ({ ...r, p: base }))), auc: auc(rows), acc: base };
}

const f3 = (x) => (x == null ? '—' : x.toFixed(3));
const pct = (x) => Math.round(x * 100) + '%';

// rows: [{p, y, lag}] from the log
export function renderCheck(rows, fit) {
  if (!rows.length) return `<p class="muted small">No answers with logged predictions yet. Play a few runs first.</p><h4>Forgetting curve decay</h4>${fit}`;
  const all = metrics(rows);
  const lagRows = LAGS.map(([label, lo, hi]) => [label, metrics(rows.filter((r) => r.lag != null && r.lag >= lo && r.lag < hi))]);
  const first = metrics(rows.filter((r) => r.lag == null));
  const bins = [];
  for (let lo = 0; lo < 1; lo += 0.1) {
    const b = rows.filter((r) => r.p >= lo && r.p < lo + 0.1);
    if (b.length) bins.push([`${pct(lo)}–${pct(lo + 0.1)}`, b.length, b.reduce((t, r) => t + r.p, 0) / b.length, b.reduce((t, r) => t + r.y, 0) / b.length]);
  }
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const better = (m) => (m.ll < m.base ? '<b class="up">better</b>' : '<b class="down">worse</b>');
  return `
    <p class="small">${all.n} answers with a logged prediction. Log loss ${f3(all.ll)} vs ${f3(all.base)} for a constant guess (${better(all)} than the baseline; lower is better). AUC ${f3(all.auc)} (0.5 = no better than chance).</p>
    <h4>By time since the same item was last asked</h4>
    <table class="check-table"><tr><th>Gap</th><th>Answers</th><th>Right</th><th>Log loss</th><th>Baseline</th><th>AUC</th></tr>
      ${[['first time', first], ...lagRows].filter(([, m]) => m).map(([l, m]) => tr([l, m.n, pct(m.acc), f3(m.ll), f3(m.base), f3(m.auc)])).join('')}
    </table>
    <h4>Calibration: predicted vs actual chance of a right answer</h4>
    <table class="check-table"><tr><th>Predicted</th><th>Answers</th><th>Mean predicted</th><th>Actually right</th></tr>
      ${bins.map(([l, n, p, y]) => tr([l, n, pct(p), pct(y)])).join('')}
    </table>
    <h4>Forgetting curve decay</h4>
    ${fit}`;
}

// ---------- reliance on note names ----------
// How much did the labels on the board change your answers, beyond what the memory model
// expected? A logistic regression on the answers logged with the Note names setting:
//   logit P(right) = b0 + logit(pred_p) + b1·[own label showing] + b2·proximity of the nearest other label
// pred_p (the memory model's chance, logged before the answer) is the baseline, so b1 and
// b2 are the extra log-odds the labels gave. proximity = exp(-distance / 3): 0.72 one step
// away, 0.26 four steps away, 0 with no label. A small ridge penalty keeps the own-label
// term finite, since those answers are almost always right.

const PROX_SCALE = 3;
const RIDGE = 0.5;
const MIN_CUE_ROWS = 40;
const MIN_TERM_ROWS = 8;
export const proximity = (d) => Math.exp(-d / PROX_SCALE);

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const logit = (p) => Math.log(p / (1 - p));

// Solve A·x = b by Gaussian elimination (A is small: at most 3×3).
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// rows: [{p, y, own, near, ms, n}]; near = distance to the nearest other label, or null
export function fitCueReliance(rows) {
  const data = rows.filter((r) => r.p != null).map((r) => ({
    off: logit(clampP(r.p)), y: r.y,
    x: [1, r.own ? 1 : 0, !r.own && r.near != null ? proximity(r.near) : 0],
  }));
  const right = data.filter((d) => d.y).length;
  if (data.length < MIN_CUE_ROWS || right < 5 || data.length - right < 5) return { n: data.length, terms: null };
  const names = ['baseline', 'own', 'near'];
  const active = [0, 1, 2].filter((j) => j === 0 || data.filter((d) => d.x[j] > 0).length >= MIN_TERM_ROWS);
  const lam = (j) => (j === 0 ? 1e-6 : RIDGE);
  let w = active.map(() => 0);
  let H;
  for (let it = 0; it < 50; it++) {
    const g = active.map(() => 0);
    H = active.map(() => active.map(() => 0));
    for (const d of data) {
      const p = sigmoid(d.off + active.reduce((t, j, k) => t + w[k] * d.x[j], 0));
      active.forEach((ja, a) => {
        g[a] += (d.y - p) * d.x[ja];
        active.forEach((jb, b) => (H[a][b] += p * (1 - p) * d.x[ja] * d.x[jb]));
      });
    }
    active.forEach((j, a) => {
      g[a] -= lam(j) * w[a];
      H[a][a] += lam(j);
    });
    const step = solve(H, g);
    w = w.map((v, a) => v + step[a]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  const se = active.map((_, a) => Math.sqrt(Math.max(0, solve(H, active.map((__, i) => (i === a ? 1 : 0)))[a])));
  const terms = {};
  active.forEach((j, a) => (terms[names[j]] = { b: w[a], se: se[a], count: data.filter((d) => d.x[j] > 0).length }));
  return { n: data.length, terms };
}

const orText = (b, se) => {
  const fmt = (x) => (x > 50 ? '>50' : x.toFixed(1));
  return `×${fmt(Math.exp(b))} <span class="muted">(95%: ${fmt(Math.exp(b - 1.96 * se))} to ${fmt(Math.exp(b + 1.96 * se))})</span>`;
};

// rows as for fitCueReliance
export function renderCueReliance(rows) {
  const fit = fitCueReliance(rows);
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const groups = [
    ['No names on the board (incl. check-ups)', (r) => !r.own && !r.n],
    ['Another name within 2 steps', (r) => !r.own && r.n > 0 && r.near <= 2],
    ['Another name further away', (r) => !r.own && r.n > 0 && r.near > 2],
    ["The asked note's own name", (r) => r.own],
  ];
  const table = groups.map(([label, test]) => {
    const g = rows.filter((r) => r.p != null && test(r));
    if (!g.length) return '';
    const t = median(g.filter((r) => r.y).map((r) => r.ms));
    return tr([label, g.length, pct(g.reduce((s, r) => s + r.y, 0) / g.length), pct(g.reduce((s, r) => s + r.p, 0) / g.length), t == null ? '—' : (t / 1000).toFixed(2) + ' s']);
  }).join('');
  if (!table) return '<p class="muted small">No answers logged with note names yet. They appear once you practise with the Note names setting on (Settings → Practice).</p>';
  let text;
  if (!fit.terms) {
    text = `<p class="muted small">Needs at least ${MIN_CUE_ROWS} answers with a logged prediction, five right and five wrong (you have ${fit.n}), before the labels' effect can be estimated.</p>`;
  } else {
    const { own, near } = fit.terms;
    const lines = [];
    if (own) lines.push(`With its own name showing, the odds of a right answer were ${orText(own.b, own.se)} what the memory model expected (${own.count} answers).`);
    if (near) {
      const at = (d) => orText(near.b * proximity(d), near.se * proximity(d));
      lines.push(`With another name one step away: ${at(1)}; four steps away: ${at(4)}; eight steps away: ${at(8)} (${near.count} answers).`);
    }
    if (!own || !near) lines.push(`<span class="muted">${!own ? 'Own-name' : 'Nearby-name'} answers are too few (under ${MIN_TERM_ROWS}) to estimate that part.</span>`);
    text = `<p class="small">${lines.join('<br>')}</p>
      <p class="muted small">×1 means the labels changed nothing beyond what the memory model expected; the bigger the number, the more the labels carry you. Estimated from ${fit.n} answers, so the ranges are wide until you have a few hundred.</p>`;
  }
  return `<table class="check-table"><tr><th>Names on the board</th><th>Answers</th><th>Right</th><th>Memory model expected</th><th>Median time (right)</th></tr>${table}</table>${text}`;
}

// Fit the FSRS-6 decay by replaying the answer log under each candidate value and scoring
// the memory model's prediction on answers given more than an hour after the previous one.
export async function fitDecay(attempts, strings, frets, current) {
  const results = [];
  for (const d of DECAYS) {
    const rows = Scheduler.replayRecall(attempts, strings, frets, d);
    results.push({ d, n: rows.length, ll: rows.length ? logLoss(rows) : null });
    await new Promise((r) => setTimeout(r)); // seven replays of the whole log: let the page breathe between them
  }
  const n = results[0]?.n || 0;
  if (n < MIN_FIT) {
    return { best: null, html: `<p class="muted small">Needs at least ${MIN_FIT} answers given more than an hour after the previous answer on the same item (you have ${n}). Until then the FSRS-6 default (${DEFAULT_DECAY}) is used.</p>` };
  }
  const best = results.reduce((a, b) => (b.ll < a.ll ? b : a));
  const cur = results.find((r) => Math.abs(r.d - (current || DEFAULT_DECAY)) < 1e-9) || results.find((r) => r.d === DEFAULT_DECAY);
  const gain = (cur.ll - best.ll) / cur.ll;
  const rows = results.map((r) => `<tr><td>${r.d}${r.d === DEFAULT_DECAY ? ' (default)' : ''}${r.d === best.d ? ' ← best' : ''}</td><td>${f3(r.ll)}</td></tr>`).join('');
  return {
    best: gain > 0.01 ? best.d : null,
    html: `<table class="check-table"><tr><th>Decay</th><th>Log loss (${n} answers)</th></tr>${rows}</table>
      <p class="small">${gain > 0.01 ? `Decay ${best.d} fits your answers ${(gain * 100).toFixed(1)}% better than the one in use.` : 'The decay in use fits your answers as well as any other value tried.'}</p>`,
  };
}
