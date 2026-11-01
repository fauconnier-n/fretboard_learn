// @ts-check
// The stats read from the answer log and the runs (storage.allAttempts, storage.allRuns): plain
// filters over the rows in memory. Answers have the fields of storage.addAttempt, runs the
// columns of the runs table.

/** UTC day of a time, 'YYYY-MM-DD' (progress.js counts days the same way) @param {number} t */
export const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

/** middle value; the mean of the two middle ones for an even count @param {number[]} xs */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const taskOf = (a) => a.task ?? 'play';

/**
 * Open strings an answer or run was on ('40,45,…'), also for rows from before instruments.
 * @param {{ strings?: string | null, tuning?: string | null }} a
 * @param {Record<string, [string, number[]]>} legacy instruments.js LEGACY: tuning name → [instrument, strings]
 */
export const logStrings = (a, legacy) => a.strings ?? legacy[a.tuning ?? '']?.[1].join(',') ?? null;

/** days with at least one answer since `since` @param {any[]} attempts @param {number} since */
export const practisedDays = (attempts, since) => new Set(attempts.filter((a) => a.t >= since).map((a) => dayOf(a.t))).size;

/** answers and the share right first time (0 when none) @param {any[]} list */
export const rate = (list) => ({ n: list.length, acc: list.length ? list.filter((a) => a.correct).length / list.length : 0 });

/** per day, oldest first: answers, share right and median time @param {any[]} attempts */
export function perDay(attempts) {
  const days = new Map();
  for (const a of attempts) {
    const d = dayOf(a.t);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(a);
  }
  return [...days.keys()].sort().map((day) => ({ day, ...rate(days.get(day)), med: median(days.get(day).map((a) => a.ms)) }));
}

/** positions answered right for the first time, per day, oldest first @param {any[]} attempts */
export function firstRightPerDay(attempts) {
  const first = new Map();
  for (const a of attempts) {
    if (!a.correct || taskOf(a) !== 'play') continue;
    const k = a.s + ':' + a.f;
    if (!first.has(k) || a.t < first.get(k)) first.set(k, a.t);
  }
  const n = new Map();
  for (const t of first.values()) n.set(dayOf(t), (n.get(dayOf(t)) || 0) + 1);
  return [...n.keys()].sort().map((day) => ({ day, n: n.get(day) }));
}

/**
 * Model check: each answer's prediction, outcome and the time since the same prompt was last
 * asked (same position, spelling and task) among `attempts`; answers without a prediction or
 * whose own label was on the board are left out. Oldest first.
 * @param {any[]} attempts
 */
export function predictionRows(attempts) {
  const last = new Map();
  const out = [];
  for (const a of [...attempts].sort((x, y) => x.t - y.t)) {
    const k = [a.s, a.f, a.spelling, taskOf(a)].join('|');
    const lag = last.has(k) ? a.t - last.get(k) : null;
    last.set(k, a.t);
    if (a.predP != null && !a.cueTarget) out.push({ p: a.predP, y: a.correct ? 1 : 0, lag });
  }
  return out;
}

