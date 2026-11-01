// @ts-check
// Monophonic pitch detection: McLeod Pitch Method (NSDF + key maxima), and a
// tracker that turns per-frame pitches into discrete "note played" events.
//
// Two stages: the NSDF over the whole lag range costs n × maxTau multiply-adds (about 2 million
// per frame at 48 kHz, 40 times a second, on the main thread; three times that on a bass). The
// signal is first averaged down 4× (12 kHz is plenty for the 1.4 kHz top of the range), which
// divides both n and maxTau by 4, and the chosen peak is then refined on the full-rate signal
// over a few lags around it, so the pitch keeps its full-rate accuracy.

import { freqToMidi } from './music.js';

const DECIMATE = 4;
const REFINE = 6; // full-rate lags searched on each side of the coarse peak

export function createDetector(maxSize = 4096, { twoStage = true } = {}) {
  const nsdf = new Float32Array(maxSize);
  const coarse = new Float32Array(Math.ceil(maxSize / DECIMATE));

  // NSDF of x[0..n) for every lag up to maxTau, into out (the energy term is updated incrementally).
  function nsdfAll(x, n, maxTau, out) {
    let m = 0;
    for (let i = 0; i < n; i++) m += 2 * x[i] * x[i];
    for (let tau = 0; tau <= maxTau; tau++) {
      let acf = 0;
      for (let i = 0, end = n - tau; i < end; i++) acf += x[i] * x[i + tau];
      out[tau] = m > 0 ? (2 * acf) / m : 0;
      m -= x[tau] * x[tau] + x[n - 1 - tau] * x[n - 1 - tau];
    }
  }

  // NSDF of x[0..n) at one lag.
  function nsdfAt(x, n, tau) {
    let acf = 0;
    let m = 0;
    for (let i = 0, end = n - tau; i < end; i++) {
      acf += x[i] * x[i + tau];
      m += x[i] * x[i] + x[i + tau] * x[i + tau];
    }
    return m > 0 ? (2 * acf) / m : 0;
  }

  // The McLeod peak pick on an NSDF: the first key maximum within k of the highest, as an
  // integer lag, or -1.
  function pickPeak(out, minTau, maxTau, k) {
    const peaks = [];
    let tau = 1;
    while (tau < maxTau && out[tau] > 0) tau++;
    let cur = -1;
    for (; tau < maxTau; tau++) {
      const v = out[tau];
      if (v > 0) {
        if (cur < 0 || v > out[cur]) cur = tau;
      } else if (cur >= 0) {
        peaks.push(cur);
        cur = -1;
      }
    }
    if (cur >= 0) peaks.push(cur);
    const usable = peaks.filter((p) => p >= minTau);
    if (!usable.length) return -1;
    let best = 0;
    for (const p of usable) best = Math.max(best, out[p]);
    return usable.find((p) => out[p] >= k * best);
  }

  // Parabolic interpolation around lag t of out: { freq, clarity }.
  function interpolate(out, t, sampleRate) {
    const a = out[t - 1];
    const b = out[t];
    const c = out[t + 1];
    const den = a - 2 * b + c;
    const shift = den ? (0.5 * (a - c)) / den : 0;
    return { freq: sampleRate / (t + shift), clarity: b - 0.25 * (a - c) * shift };
  }

  return function detect(x, sampleRate, minF = 55, maxF = 1400, k = 0.9) {
    const n = x.length;
    const maxTau = Math.min(n - 2, Math.floor(sampleRate / minF));
    const minTau = Math.max(2, Math.floor(sampleRate / maxF));
    if (!twoStage || n < 4 * DECIMATE * REFINE) {
      nsdfAll(x, n, maxTau, nsdf);
      const t = pickPeak(nsdf, minTau, maxTau, k);
      return t < 1 ? null : interpolate(nsdf, t, sampleRate);
    }

    // stage 1: the whole lag range on the signal averaged down DECIMATE times
    const nd = Math.floor(n / DECIMATE);
    for (let j = 0, i = 0; j < nd; j++, i += DECIMATE) {
      let s = 0;
      for (let d = 0; d < DECIMATE; d++) s += x[i + d];
      coarse[j] = s / DECIMATE;
    }
    const srd = sampleRate / DECIMATE;
    const maxTauD = Math.min(nd - 2, Math.floor(srd / minF));
    const minTauD = Math.max(2, Math.floor(srd / maxF));
    nsdfAll(coarse, nd, maxTauD, nsdf); // nsdf has room: nd <= n
    const td = pickPeak(nsdf, minTauD, maxTauD, k);
    if (td < 1) return null;
    const guess = Math.round((td + parabolicShift(nsdf, td)) * DECIMATE);

    // stage 2: the full-rate NSDF around that lag and around half of it (a high note's own peak
    // sits at a lag of a few coarse samples and can be lost between them, leaving its octave
    // below), then McLeod's rule between the two and the usual interpolation
    const refined = [];
    for (const g of guess / 2 >= minTau ? [guess, Math.round(guess / 2)] : [guess]) {
      const lo = Math.max(minTau, 2, g - REFINE);
      const hi = Math.min(maxTau, n - 2, g + REFINE);
      if (hi - lo < 2) continue;
      let bestT = lo;
      for (let tau = lo; tau <= hi; tau++) {
        nsdf[tau] = nsdfAt(x, n, tau);
        if (nsdf[tau] > nsdf[bestT]) bestT = tau;
      }
      if (bestT === lo) nsdf[lo - 1] = nsdfAt(x, n, lo - 1);
      if (bestT === hi) nsdf[hi + 1] = nsdfAt(x, n, hi + 1);
      refined.push(bestT);
    }
    if (!refined.length) return null;
    let best = 0;
    for (const t of refined) best = Math.max(best, nsdf[t]);
    refined.sort((a, b) => a - b);
    return interpolate(nsdf, refined.find((t) => nsdf[t] >= k * best), sampleRate);
  };
}

function parabolicShift(out, t) {
  const a = out[t - 1];
  const b = out[t];
  const c = out[t + 1];
  const den = a - 2 * b + c;
  return den ? (0.5 * (a - c)) / den : 0;
}

// Emits { midi, cents, freq, t } once a pitch has held steady for holdMs after an
// onset (or after moving to a different note, e.g. a slide or hammer-on).
export class NoteTracker {
  constructor(holdMs = 60) {
    this.holdMs = holdMs;
    this.armed = true;
    this.cand = null;
    this.candStart = 0;
    this.lastEmit = null;
    this.env = 0;
  }

  feed(now, res, rms, { gate, clarity, a4 }) {
    const prevEnv = this.env;
    this.env = 0.6 * this.env + 0.4 * rms;
    if (rms < gate * 0.6) {
      this.armed = true;
      this.cand = null;
      this.lastEmit = null;
      return null;
    }
    if (rms > gate && rms > prevEnv * 1.6 + gate * 0.5) {
      // new pick attack: allow the same note to count again
      this.armed = true;
      this.cand = null;
    }
    if (!res || res.clarity < clarity || rms < gate) {
      this.cand = null;
      return null;
    }
    const mf = freqToMidi(res.freq, a4);
    const midi = Math.round(mf);
    if (midi !== this.cand) {
      this.cand = midi;
      this.candStart = now;
      return null;
    }
    if (now - this.candStart >= this.holdMs && (this.armed || midi !== this.lastEmit)) {
      this.armed = false;
      this.lastEmit = midi;
      return { midi, cents: (mf - midi) * 100, freq: res.freq, t: this.candStart };
    }
    return null;
  }
}
