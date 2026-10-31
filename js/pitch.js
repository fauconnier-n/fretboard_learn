// @ts-check
// Monophonic pitch detection: McLeod Pitch Method (NSDF + key maxima), and a
// tracker that turns per-frame pitches into discrete "note played" events.

import { freqToMidi } from './music.js';

export function createDetector(maxSize = 4096) {
  const nsdf = new Float32Array(maxSize);

  return function detect(x, sampleRate, minF = 55, maxF = 1400, k = 0.9) {
    const n = x.length;
    const maxTau = Math.min(n - 2, Math.floor(sampleRate / minF));
    const minTau = Math.max(2, Math.floor(sampleRate / maxF));

    let m = 0;
    for (let i = 0; i < n; i++) m += 2 * x[i] * x[i];
    for (let tau = 0; tau <= maxTau; tau++) {
      let acf = 0;
      for (let i = 0, end = n - tau; i < end; i++) acf += x[i] * x[i + tau];
      nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
      m -= x[tau] * x[tau] + x[n - 1 - tau] * x[n - 1 - tau];
    }

    // key maxima: highest point between each positive-going and negative-going zero crossing
    const peaks = [];
    let tau = 1;
    while (tau < maxTau && nsdf[tau] > 0) tau++;
    let cur = -1;
    for (; tau < maxTau; tau++) {
      const v = nsdf[tau];
      if (v > 0) {
        if (cur < 0 || v > nsdf[cur]) cur = tau;
      } else if (cur >= 0) {
        peaks.push(cur);
        cur = -1;
      }
    }
    if (cur >= 0) peaks.push(cur);
    const usable = peaks.filter((p) => p >= minTau);
    if (!usable.length) return null;

    let best = 0;
    for (const p of usable) best = Math.max(best, nsdf[p]);
    const t = usable.find((p) => nsdf[p] >= k * best);

    // parabolic interpolation around the chosen peak
    const a = nsdf[t - 1];
    const b = nsdf[t];
    const c = nsdf[t + 1];
    const den = a - 2 * b + c;
    const shift = den ? (0.5 * (a - c)) / den : 0;
    const clarity = b - 0.25 * (a - c) * shift;
    return { freq: sampleRate / (t + shift), clarity };
  };
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
