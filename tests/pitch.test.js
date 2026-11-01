// Pitch detection on synthetic signals: the two-stage detector (coarse at a quarter of the
// sample rate, refined at full rate) must give the single-stage McLeod result: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDetector } from '../js/pitch.js';

const cents = (f, ref) => 1200 * Math.log2(f / ref);

// a note with harmonics and a little noise, deterministic
function signal(freq, sr, n, kind, noise = 0.02) {
  const x = new Float32Array(n);
  let s = 1;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const ph = (2 * Math.PI * freq * i) / sr;
    let v = Math.sin(ph);
    if (kind === 'saw') v += 0.5 * Math.sin(2 * ph) + 0.33 * Math.sin(3 * ph) + 0.25 * Math.sin(4 * ph);
    if (kind === 'guitar') v += 0.7 * Math.sin(2 * ph) + 0.4 * Math.sin(3 * ph) + 0.2 * Math.sin(4 * ph) + 0.1 * Math.sin(5 * ph);
    x[i] = 0.3 * v + noise * rnd();
  }
  return x;
}

const two = createDetector(4096);
const one = createDetector(4096, { twoStage: false });

test('guitar range, 44.1/48/96 kHz: within 3 cents of the truth, no octave errors', () => {
  let n = 0;
  for (const sr of [44100, 48000, 96000]) {
    for (const kind of ['sine', 'saw', 'guitar']) {
      for (let f = 80; f <= 1300; f *= 1.06) {
        const r = two(signal(f, sr, sr > 50000 ? 4096 : 3072, kind), sr, 69, 1400);
        assert.ok(r, `${kind} ${f.toFixed(0)} Hz at ${sr}: nothing detected`);
        assert.ok(Math.abs(cents(r.freq, f)) < 3, `${kind} ${f.toFixed(0)} Hz at ${sr}: ${cents(r.freq, f).toFixed(1)} cents off`);
        assert.ok(r.clarity > 0.9);
        n++;
      }
    }
  }
  assert.ok(n > 400);
});

test('two-stage equals single-stage McLeod', () => {
  for (const sr of [44100, 48000]) {
    for (const kind of ['saw', 'guitar']) {
      for (let f = 80; f <= 1300; f *= 1.09) {
        const x = signal(f, sr, 3072, kind);
        const a = two(x, sr, 69, 1400);
        const b = one(x, sr, 69, 1400);
        assert.ok(Math.abs(cents(a.freq, b.freq)) < 0.01, `${kind} ${f.toFixed(0)} Hz at ${sr}: ${cents(a.freq, b.freq).toFixed(2)} cents apart`);
        assert.ok(Math.abs(a.clarity - b.clarity) < 0.01);
      }
    }
  }
});

test('bass range (down to 26 Hz, 4096 samples)', () => {
  for (let f = 30; f <= 400; f *= 1.07) {
    const r = two(signal(f, 48000, 4096, 'guitar'), 48000, 26, 1400);
    assert.ok(r && Math.abs(cents(r.freq, f)) < 3, `${f.toFixed(0)} Hz: ${r ? cents(r.freq, f).toFixed(1) + ' cents off' : 'nothing'}`);
  }
});

test('noise alone gives nothing or a low clarity', () => {
  const r = two(signal(0, 48000, 3072, 'sine', 0.3), 48000, 69, 1400);
  assert.ok(!r || r.clarity < 0.8);
});
