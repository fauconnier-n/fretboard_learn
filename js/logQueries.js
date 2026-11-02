// @ts-check
// The stats read from the answer log and the runs (storage.allAttempts, storage.allRuns): plain
// filters over the rows in memory. Answers have the fields of storage.addAttempt, runs the
// columns of the runs table.

/** answers this far apart belong to different sessions (srs.js counts sessions the same way) */
export const SESSION_GAP = 2 * 3600000;

const pad = (n) => String(n).padStart(2, '0');
/** local day of a time, 'YYYY-MM-DD' @param {number} t */
export const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/**
 * The day each answer counts on: the local day its session started, so a session that goes
 * on past midnight counts on the day it began. Same order as `attempts`.
 * @param {{ t: number }[]} attempts
 */
export function sessionDays(attempts) {
  const out = new Array(attempts.length);
  let prev = -Infinity;
  let day = '';
  for (const i of attempts.map((_, i) => i).sort((i, j) => attempts[i].t - attempts[j].t)) {
    if (attempts[i].t - prev >= SESSION_GAP) day = dayOf(attempts[i].t);
    prev = attempts[i].t;
    out[i] = day;
  }
  return out;
}

/** middle value; the mean of the two middle ones for an even count @param {number[]} xs */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const taskOf = (a) => a.task ?? 'play';
// a note-position prompt (play, name, truefalse), not the Intervals tab nor the Chord page
export const isNoteTask = (a) => !/^(interval|chord)/.test(taskOf(a));

/**
 * Open strings an answer or run was on ('40,45,…'), also for rows from before instruments.
 * @param {{ strings?: string | null, tuning?: string | null }} a
 * @param {Record<string, [string, number[]]>} legacy instruments.js LEGACY: tuning name → [instrument, strings]
 */
export const logStrings = (a, legacy) => a.strings ?? legacy[a.tuning ?? '']?.[1].join(',') ?? null;

/** session days from the day of `since` on @param {any[]} attempts @param {number} since */
export const practisedDays = (attempts, since) => new Set(sessionDays(attempts).filter((d) => d >= dayOf(since))).size;

/** answers and the share right first time (0 when none) @param {any[]} list */
export const rate = (list) => ({ n: list.length, acc: list.length ? list.filter((a) => a.correct).length / list.length : 0 });

/** per session day, oldest first: answers, share right and median time @param {any[]} attempts */
export function perDay(attempts) {
  const days = new Map();
  const ds = sessionDays(attempts);
  attempts.forEach((a, i) => {
    if (!days.has(ds[i])) days.set(ds[i], []);
    days.get(ds[i]).push(a);
  });
  return [...days.keys()].sort().map((day) => ({ day, ...rate(days.get(day)), med: median(days.get(day).map((a) => a.ms)) }));
}

/** positions answered right for the first time, per session day, oldest first @param {any[]} attempts */
export function firstRightPerDay(attempts) {
  const first = new Map();
  const ds = sessionDays(attempts);
  attempts.forEach((a, i) => {
    if (!a.correct || taskOf(a) !== 'play') return;
    const k = a.s + ':' + a.f;
    if (!first.has(k) || a.t < first.get(k).t) first.set(k, { t: a.t, day: ds[i] });
  });
  const n = new Map();
  for (const { day } of first.values()) n.set(day, (n.get(day) || 0) + 1);
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
