// The Practice run driven in Node with fake elements: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../js/instruments.js';
import { Scheduler, newModel } from '../js/srs.js';
import { generateZones } from '../js/zones.js';
import { Quiz } from '../js/quiz.js';

// any element: known props are kept, any other property is a no-op method returning another fake
const fake = (props = {}) => {
  const cls = new Set();
  const t = {
    textContent: '', innerHTML: '', className: '', isConnected: false, dataset: {}, style: { setProperty() {} },
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on = !cls.has(c)) => (on ? cls.add(c) : cls.delete(c), on) },
    ...props,
  };
  return new Proxy(t, { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' || k === 'then' ? undefined : () => fake()) });
};
Object.assign(globalThis, {
  window: { addEventListener() {} },
  document: { body: fake() },
  matchMedia: () => ({ matches: false }),
  scrollTo() {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
});

const strings = INSTRUMENTS.guitar6.strings;
const zones = generateZones(strings, 15, 'both');

function makeQuiz(over = {}) {
  const settings = {
    runTask: 'play', runMode: 'count', runCount: 10, sprintSec: 60, cueMode: 'off', beat: false, retry: false, timeoutSec: 10,
    latencyMs: 0, flats: false, showQueue: false, frets: 15, nameAccidentals: 'sharps', tuningLabel: 'standard', instrument: 'guitar6', ...over,
  };
  const sch = new Scheduler(newModel(), strings, 15);
  const attempts = [];
  const runs = [];
  const els = new Proxy({}, { get: (o, k) => (o[k] ||= fake()) });
  const quiz = new Quiz({
    board: fake({ layers: undefined }), els, getSettings: () => settings, getScheduler: () => sch, getZones: () => zones, getStrings: () => strings,
    isActive: () => true, onAttempt: (a) => attempts.push(a), onRun: (r) => runs.push(r), onSave() {}, onRunEnd() {}, actions: {},
  });
  quiz.prepare();
  quiz.begin();
  return { quiz, attempts, runs };
}

test('play run: the right note is graded right and logged', () => {
  const { quiz, attempts } = makeQuiz();
  quiz.simulate(quiz.cur.cell.midi);
  assert.equal(quiz.run.results.length, 1);
  assert.equal(quiz.run.results[0].correct, true);
  assert.equal(attempts.length, 1);
  quiz.leave();
});

test('leaving with a missed prompt still on screen logs it and closes the run row', () => {
  const { quiz, attempts, runs } = makeQuiz();
  quiz.simulate(quiz.cur.cell.midi + 1);
  assert.equal(quiz.run.results[0].correct, false);
  assert.equal(attempts.length, 0); // logged when the prompt closes
  quiz.leave();
  assert.equal(attempts.length, 1);
  assert.equal(runs.at(-1).end_reason, 'left');
});

test('true/false run: played notes and letter keys do not grade, Y/N does', () => {
  const { quiz } = makeQuiz({ runTask: 'truefalse' });
  const cur = quiz.cur;
  assert.equal(cur.task, 'truefalse');
  quiz.simulate(cur.cell.midi);
  quiz.simulate(cur.cell.midi + 1);
  quiz.onKey({ key: 'C', target: { closest: () => null } });
  assert.equal(quiz.run.results.length, 0);
  quiz.answerTF(cur.shown.truth);
  assert.equal(quiz.run.results.length, 1);
  assert.equal(quiz.run.results[0].correct, true);
  quiz.leave();
});

test('a resumed sprint keeps its full length on the time bar', () => {
  const { quiz } = makeQuiz({ runMode: 'sprint' });
  quiz.end('stopped');
  quiz.run.stoppedAt -= 30000; // stood still for 30 s
  quiz.resume();
  assert.ok(Math.abs(quiz.run.endsAt - quiz.run.startedAt - 60000) < 1);
  quiz.leave();
});
