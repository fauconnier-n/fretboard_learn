// The stats over the answer log give what the SQL queries gave before: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, median, logStrings, practisedDays, rate, perDay, firstRightPerDay, predictionRows, sessionDays, isNoteTask } from '../js/logQueries.js';

const D = new Date(2026, 9, 1, 12).getTime(); // local time: days are local
const H = 3600000;
const a = (t, o = {}) => ({ t, s: 0, f: 3, spelling: 'n', correct: true, ms: 1000, task: 'play', ...o });

test('median: middle value, mean of the two middle ones for an even count', () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('days are local dates', () => {
  assert.equal(dayOf(new Date(2026, 0, 2, 23, 59).getTime()), '2026-01-02');
  assert.equal(dayOf(new Date(2026, 0, 3, 0, 1).getTime()), '2026-01-03');
});

test('an answer counts on the local day its session started', () => {
  const late = new Date(2026, 9, 1, 23, 0).getTime();
  // one session across midnight (answers under 2 h apart), then a new one 3 h later
  const log = [a(late), a(late + 1.5 * H), a(late + 2.5 * H), a(late + 5.5 * H)];
  assert.deepEqual(sessionDays(log), ['2026-10-01', '2026-10-01', '2026-10-01', '2026-10-02']);
  assert.deepEqual(sessionDays([...log].reverse()), ['2026-10-02', '2026-10-01', '2026-10-01', '2026-10-01']);
  assert.deepEqual(perDay(log).map((d) => [d.day, d.n]), [['2026-10-01', 3], ['2026-10-02', 1]]);
  assert.equal(practisedDays(log, late + 2 * H), 1); // since the 2nd: only the session that started on the 2nd
});

test('strings of rows from before instruments come from the tuning name', () => {
  const legacy = { dropD: ['guitar6', [38, 45, 50, 55, 59, 64]] };
  assert.equal(logStrings({ strings: '40,45' }, legacy), '40,45');
  assert.equal(logStrings({ strings: null, tuning: 'dropD' }, legacy), '38,45,50,55,59,64');
  assert.equal(logStrings({ tuning: 'other' }, legacy), null);
});

test('practised days, rate, per day and first right per day', () => {
  const log = [a(D), a(D + H, { correct: false, ms: 3000 }), a(D + 24 * H, { f: 5 }), a(D + 25 * H, { f: 3 })];
  assert.equal(practisedDays(log, D + 24 * H), 1);
  assert.equal(practisedDays(log, 0), 2);
  assert.deepEqual(rate([]), { n: 0, acc: 0 });
  assert.deepEqual(perDay(log), [
    { day: '2026-10-01', n: 2, acc: 0.5, med: 2000 },
    { day: '2026-10-02', n: 2, acc: 1, med: 1000 },
  ]);
  assert.deepEqual(firstRightPerDay(log), [{ day: '2026-10-01', n: 1 }, { day: '2026-10-02', n: 1 }]);
});

test('prediction rows: lag to the same prompt, given-away answers left out', () => {
  const log = [
    a(D + 2 * H, { predP: 0.7 }),
    a(D, { predP: 0.5, correct: false }),
    a(D + 3 * H, { predP: 0.9, cueTarget: true }),
    a(D + 4 * H, { predP: 0.8, spelling: 's' }),
    a(D + 5 * H, { predP: 0.6 }),
  ];
  assert.deepEqual(predictionRows(log), [
    { p: 0.5, y: 0, lag: null },
    { p: 0.7, y: 1, lag: 2 * H },
    { p: 0.8, y: 1, lag: null },
    { p: 0.6, y: 1, lag: 2 * H },
  ]);
});

test('isNoteTask: note-position prompts only, not intervals or chords', () => {
  assert.equal(isNoteTask({ task: 'play' }), true);
  assert.equal(isNoteTask({}), true); // rows from before the task column were play
  assert.equal(isNoteTask({ task: 'name' }), true);
  assert.equal(isNoteTask({ task: 'interval' }), false);
  assert.equal(isNoteTask({ task: 'chord' }), false);
  assert.equal(isNoteTask({ task: 'chord-name' }), false);
});
