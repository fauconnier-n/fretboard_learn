// Tuner tab: note, cents needle, Hz, strobe bar and string targets.

import { freqToMidi, midiToFreq, midiLabel, noteName, octaveOf, stringName } from './music.js';

const NS = 'http://www.w3.org/2000/svg';
const HOLD_MS = 700;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export class Tuner {
  constructor(root, getSettings) {
    this.get = getSettings;
    this.hist = [];
    this.cents = 0;
    this.midi = null;
    this.lastSeen = -Infinity;
    this.lastT = 0;
    this.phase = 0;
    const q = (sel) => root.querySelector(sel);
    this.els = {
      box: q('.tuner'), note: q('#tNote'), oct: q('#tOct'), cents: q('#tCents'), hz: q('#tHz'),
      gauge: q('#tGauge'), strobe: q('#tStrobe'), strings: q('#tStrings'),
    };
    this.buildGauge();
  }

  buildGauge() {
    const svg = this.els.gauge;
    const cx = 150;
    const cy = 160;
    const R = 130;
    const add = (tag, attrs) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      svg.appendChild(e);
      return e;
    };
    const pt = (cents, r) => {
      const a = ((cents / 50) * 60 - 90) * (Math.PI / 180);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const [x1, y1] = pt(-3, R + 6);
    const [x2, y2] = pt(3, R + 6);
    add('path', { d: `M${x1},${y1} A${R + 6},${R + 6} 0 0 1 ${x2},${y2}`, class: 'tg-zone' });
    for (let c = -50; c <= 50; c += 5) {
      const major = c % 25 === 0;
      const [a, b] = pt(c, R - (major ? 18 : 9));
      const [d, e] = pt(c, R);
      add('line', { x1: a, y1: b, x2: d, y2: e, class: major ? 'tg-tick major' : 'tg-tick' });
    }
    for (const c of [-50, -25, 0, 25, 50]) {
      const [x, y] = pt(c, R - 32);
      add('text', { x, y: y + 4, class: 'tg-num' }).textContent = c > 0 ? '+' + c : c;
    }
    this.needle = add('line', { x1: cx, y1: cy, x2: cx, y2: cy - R + 4, class: 'tg-needle' });
    add('circle', { cx, cy, r: 7, class: 'tg-hub' });
  }

  setStrings(strings, flats) {
    this.strings = strings;
    const a4 = this.get().a4;
    this.els.strings.innerHTML = '';
    this.stringEls = [...strings].map((m, s) => {
      const d = document.createElement('div');
      d.className = 'tstring';
      d.innerHTML = `<b>${stringName(strings, s, flats)}</b><span>${midiLabel(m, flats)} · ${midiToFreq(m, a4).toFixed(1)} Hz</span>`;
      return d;
    });
    this.stringEls.forEach((d) => this.els.strings.appendChild(d));
  }

  onFrame(res, rms, now) {
    const s = this.get();
    const els = this.els;
    if (res && res.clarity >= Math.min(s.clarity, 0.9) && rms >= s.gate) {
      this.hist.push(res.freq);
      if (this.hist.length > 5) this.hist.shift();
      const f = median(this.hist);
      const mf = freqToMidi(f, s.a4);
      const midi = Math.round(mf);
      const c = (mf - midi) * 100;
      this.cents = midi === this.midi ? 0.6 * this.cents + 0.4 * c : c;
      this.midi = midi;
      this.lastSeen = now;
      els.note.textContent = noteName(midi, s.flats);
      els.oct.textContent = octaveOf(midi);
      els.hz.textContent = f.toFixed(1) + ' Hz';
      const rc = Math.round(this.cents);
      els.cents.textContent = (rc > 0 ? '+' : rc < 0 ? '−' : '±') + Math.abs(rc) + ' ¢';
      const inTune = Math.abs(this.cents) < 3;
      els.box.classList.toggle('in-tune', inTune);
      els.box.classList.remove('idle');
      const angle = Math.max(-60, Math.min(60, (this.cents / 50) * 60));
      this.needle.setAttribute('transform', `rotate(${angle} 150 160)`);
      let near = -1;
      this.strings?.forEach((m, i) => {
        if (Math.abs(m - mf) <= 2 && (near < 0 || Math.abs(m - mf) < Math.abs(this.strings[near] - mf))) near = i;
      });
      this.stringEls?.forEach((d, i) => d.classList.toggle('near', i === near));
    } else if (now - this.lastSeen > HOLD_MS) {
      this.hist = [];
      this.midi = null;
      els.box.classList.add('idle');
      els.box.classList.remove('in-tune');
      els.note.textContent = '—';
      els.oct.textContent = '';
      els.hz.textContent = '— Hz';
      els.cents.textContent = '';
      this.stringEls?.forEach((d) => d.classList.remove('near'));
    }
    // strobe drifts right when sharp, left when flat, and stands still in tune
    const dt = this.lastT ? (now - this.lastT) / 1000 : 0;
    this.lastT = now;
    if (now - this.lastSeen < HOLD_MS) {
      this.phase += this.cents * dt * 6;
      els.strobe.style.backgroundPositionX = this.phase.toFixed(1) + 'px';
    }
  }
}
