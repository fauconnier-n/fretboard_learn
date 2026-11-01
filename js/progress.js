// @ts-check
// Stats → Progress: how you are doing over runs and days, as small SVG charts.
// runs: [{ t, prompts, correct, median_ms }] oldest first (note-position runs on these strings)
// days: [{ day: 'YYYY-MM-DD', n, acc, med }] oldest first
// known: [{ day, n }] new positions answered right for the first time that day
// total: number of positions on the neck

const DAY = 86400000;
const pct = (x) => Math.round(x * 100) + '%';
const secs = (ms) => (ms / 1000).toFixed(2) + ' s';

/** Mean of the last `k` values at each point. @param {number[]} xs @param {number} k */
export function rolling(xs, k) {
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - k + 1), i + 1).filter((x) => x != null);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

/**
 * The last 7 days against the 7 before: answers, accuracy and median time of each week.
 * @param {{ day: string, n: number, acc: number, med: number }[]} days @param {number} now
 */
export function weekOverWeek(days, now) {
  const today = new Date(now).toISOString().slice(0, 10);
  const age = (day) => Math.round((Date.parse(today) - Date.parse(day)) / DAY);
  const week = (from, to) => {
    const ds = days.filter((d) => age(d.day) >= from && age(d.day) <= to);
    const n = ds.reduce((t, d) => t + d.n, 0);
    // weighted by answers per day; the median is approximated by the weighted mean of daily medians
    return n ? { n, acc: ds.reduce((t, d) => t + d.acc * d.n, 0) / n, med: ds.reduce((t, d) => t + d.med * d.n, 0) / n } : { n: 0, acc: null, med: null };
  };
  return { now: week(0, 6), before: week(7, 13) };
}

const W = 520;
const H = 170;
const L = 42;
const R = 10;
const T = 14;
const B = 26;

// One chart: dots (each run or day), an optional line (a rolling mean, or a cumulative total)
// and bars. ys in [lo, hi]; fmt labels the y axis.
function chart({ title, about, n, dots = [], line = [], bars = [], lo, hi, fmt, ticks, xLabels }) {
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="pg-grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="pg-ytick">${fmt(v)}</text>`).join('');
  const bw = Math.max(2, Math.min(16, ((W - L - R) / Math.max(1, n)) * 0.7));
  const barsSvg = bars.map((v, i) => (v == null ? '' : `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(lo) - y(v)).toFixed(1)}" rx="2" class="pg-bar"/>`)).join('');
  const dotsSvg = dots.map((v, i) => (v == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="pg-dot"/>`)).join('');
  const pts = line.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
  const lineSvg = pts.length > 1 ? `<polyline points="${pts.join(' ')}" class="pg-line"/>` : '';
  // the first label starts at its point, the last one ends at it, so neither is cut off
  const anchor = (i) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
  const xl = xLabels.map(([i, label]) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="pg-xtick" text-anchor="${anchor(i)}">${label}</text>`).join('');
  return `<figure class="pg-chart"><figcaption><b>${title}</b><span class="muted"> · ${about}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${grid}${barsSvg}${lineSvg}${dotsSvg}${xl}</svg></figure>`;
}

const shortDate = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
const ends = (n, label) => (n ? [[0, label(0)], ...(n > 1 ? [[n - 1, label(n - 1)]] : [])] : []);

/** @param {HTMLElement} el */
export function renderProgress(el, { runs, days, known, total, now = Date.now() }) {
  if (!runs.length && !days.length) {
    el.innerHTML = '<p class="muted">Play a few runs: your progress over runs and days shows here.</p>';
    return;
  }
  const last = runs.slice(-60);
  const acc = last.map((r) => r.correct / r.prompts);
  const med = last.map((r) => r.median_ms);
  const meds = med.filter((v) => v != null);
  const medHi = Math.max(1000, Math.ceil(Math.max(...meds, 0) / 500) * 500);
  const runLabels = ends(last.length, (i) => shortDate(last[i].t));

  // the last 30 days, including days without practice
  const byDay = new Map(days.map((d) => [d.day, d]));
  const range = Array.from({ length: 30 }, (_, i) => new Date(now - (29 - i) * DAY).toISOString().slice(0, 10));
  const perDay = range.map((d) => byDay.get(d)?.n ?? 0);
  const dayHi = Math.max(10, Math.ceil(Math.max(...perDay) / 10) * 10);
  let sum = 0;
  const firstRight = new Map(known.map((k) => [k.day, k.n]));
  // positions known before the 30-day window count from the start
  for (const k of known) if (k.day < range[0]) sum += k.n;
  const cumulative = range.map((d) => (sum += firstRight.get(d) ?? 0));
  const dayLabels = [[0, shortDate(Date.parse(range[0]))], [29, 'today']];

  const { now: wk, before } = weekOverWeek(days, now);
  const delta = (a, b, fmt, higherIsBetter) => {
    if (a == null) return '<span class="muted">—</span>';
    if (b == null) return fmt(a);
    const up = a > b;
    const good = up === higherIsBetter;
    return `${fmt(a)} <span class="${a === b ? 'muted' : good ? 'up' : 'down'}">${up ? '▲' : a < b ? '▼' : '='} vs ${fmt(b)}</span>`;
  };

  el.innerHTML = `
    <div class="pg-week">
      <div><b>${wk.n}</b><span>answers in the last 7 days <span class="muted">(${before.n} the week before)</span></span></div>
      <div><b>${delta(wk.acc, before.acc, pct, true)}</b><span>right first time, last 7 days vs the 7 before</span></div>
      <div><b>${delta(wk.med, before.med, secs, false)}</b><span>typical answer time, last 7 days vs the 7 before</span></div>
    </div>
    <div class="pg-grid-charts">
      ${chart({ title: 'Right first time per run', about: `each dot is a run, the line the mean of the last 8 (${last.length} runs)`, n: last.length, dots: acc, line: rolling(acc, 8), lo: 0, hi: 1, ticks: [0, 0.5, 1], fmt: pct, xLabels: runLabels })}
      ${chart({ title: 'Median answer time per run', about: 'lower is faster; line: mean of the last 8', n: last.length, dots: med, line: rolling(med, 8), lo: 0, hi: medHi, ticks: [0, medHi / 2, medHi], fmt: (v) => (v / 1000).toFixed(1) + ' s', xLabels: runLabels })}
      ${chart({ title: 'Answers per day', about: 'the last 30 days', n: 30, bars: perDay, lo: 0, hi: dayHi, ticks: [0, dayHi / 2, dayHi], fmt: (v) => String(Math.round(v)), xLabels: dayLabels })}
      ${chart({ title: 'Positions answered right at least once', about: `out of ${total}, over the last 30 days`, n: 30, line: cumulative, dots: cumulative.map((v, i) => (firstRight.has(range[i]) ? v : null)), lo: 0, hi: total, ticks: [0, Math.round(total / 2), total], fmt: (v) => String(Math.round(v)), xLabels: dayLabels })}
    </div>`;
}
