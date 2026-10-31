// SVG fretboard: board drawing, zone highlight, marks with green/red effects, heatmap.

const NS = 'http://www.w3.org/2000/svg';
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
let uid = 0;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export class Fretboard {
  constructor(svg) {
    this.svg = svg;
    this.onCellClick = null;
    this.id = 'fb' + uid++;
  }

  // lowAtBottom: low E drawn at the bottom, as in tab; by default it is on top, as in Rocksmith
  configure({ strings, frets, leftHanded, flats, lowAtBottom }) {
    Object.assign(this, { strings, frets, left: !!leftHanded, flats: !!flats, lowAtBottom: !!lowAtBottom });
    this.layout();
    this.render();
  }

  layout() {
    const n = this.strings.length;
    this.W = 1200;
    this.sp = 30;
    this.top = 24;
    this.boardTop = this.top - 15;
    this.boardBot = this.top + (n - 1) * this.sp + 15;
    this.H = this.boardBot + 24;
    this.openW = 64;
    this.nutX = this.openW + 6;
    const end = this.W - 12;
    const widths = [];
    for (let f = 1; f <= this.frets; f++) widths.push(Math.pow(0.96, f - 1));
    const total = widths.reduce((a, b) => a + b, 0);
    this.wire = [this.nutX];
    let x = this.nutX;
    for (const w of widths) this.wire.push((x += (w * (end - this.nutX)) / total));
  }

  X(x) {
    return this.left ? this.W - x : x;
  }
  cx(f) {
    return this.X(f === 0 ? this.openW * 0.62 : (this.wire[f - 1] + this.wire[f]) / 2);
  }
  cw(f) {
    return f === 0 ? this.openW * 0.6 : this.wire[f] - this.wire[f - 1];
  }
  cy(s) {
    return this.top + (this.lowAtBottom ? this.strings.length - 1 - s : s) * this.sp;
  }
  cellRect(s, f) {
    return { x: this.cx(f) - this.cw(f) / 2, y: this.cy(s) - this.sp / 2, width: this.cw(f), height: this.sp };
  }

  render() {
    const svg = this.svg;
    const n = this.strings.length;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    const defs = el('defs', {}, svg);
    this.mask = el('mask', { id: this.id + '-mask' }, defs);
    // soft edges for the "cloud" marks of the mastery map
    const blur = el('filter', { id: this.id + '-cloud', x: '-60%', y: '-120%', width: '220%', height: '340%' }, defs);
    el('feGaussianBlur', { stdDeviation: '2.4' }, blur);

    const g = el('g', {}, svg);
    const xa = this.X(this.nutX);
    const xb = this.X(this.wire[this.frets]);
    el('rect', { x: Math.min(xa, xb), y: this.boardTop, width: Math.abs(xb - xa), height: this.boardBot - this.boardTop, rx: 3, class: 'fb-wood' }, g);
    const mid = (this.boardTop + this.boardBot) / 2;
    for (let f = 1; f <= this.frets; f++) {
      if (INLAYS.includes(f)) el('circle', { cx: this.cx(f), cy: mid, r: 6, class: 'fb-inlay' }, g);
      if (f === 12 || f === 24) {
        el('circle', { cx: this.cx(f), cy: mid - this.sp, r: 6, class: 'fb-inlay' }, g);
        el('circle', { cx: this.cx(f), cy: mid + this.sp, r: 6, class: 'fb-inlay' }, g);
      }
    }
    for (let f = 1; f <= this.frets; f++) {
      const x = this.X(this.wire[f]);
      el('line', { x1: x, x2: x, y1: this.boardTop, y2: this.boardBot, class: 'fb-fret' }, g);
    }
    el('rect', { x: this.left ? this.W - this.nutX : this.nutX - 6, y: this.boardTop, width: 6, height: this.boardBot - this.boardTop, class: 'fb-nut' }, g);
    // strings: the lowest thickest; vibrations are drawn in their own layer just above them
    this.strG = el('g', { class: 'fb-strings' }, g);
    this.strLines = [];
    for (let s = 0; s < n; s++) {
      const y = this.cy(s);
      this.strLines.push(el('line', { x1: this.X(20), x2: xb, y1: y, y2: y, class: 'fb-string', 'stroke-width': (0.9 + (n - 1 - s) * 0.5).toFixed(2) }, this.strG));
    }
    this.vibeLayer = el('g', { class: 'fb-vibes' }, g);
    this.vibes = new Map();
    for (let f = 0; f <= this.frets; f++) {
      const marked = f === 0 || f === 12 || f === 24 || INLAYS.includes(f);
      el('text', { x: this.cx(f), y: this.boardBot + 16, class: 'fb-num' + (marked ? ' marked' : '') }, g).textContent = f;
    }

    this.layers = {
      dim: el('rect', { x: 0, y: 0, width: this.W, height: this.H, class: 'fb-dim', mask: `url(#${this.id}-mask)`, visibility: 'hidden' }, svg),
      zone: el('g', {}, svg),
      heat: el('g', {}, svg),
      boxes: el('g', { class: 'fb-boxes' }, svg),
      marks: el('g', { class: 'fb-marks' }, svg),
      hits: el('g', {}, svg),
    };
    for (let s = 0; s < n; s++) {
      for (let f = 0; f <= this.frets; f++) {
        const r = el('rect', { ...this.cellRect(s, f), class: 'fb-hit' }, this.layers.hits);
        r.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.onCellClick?.(s, f);
        });
      }
    }
  }

  setZone(cells) {
    const { zone, dim } = this.layers;
    zone.innerHTML = '';
    this.mask.innerHTML = '';
    if (!cells) {
      dim.setAttribute('visibility', 'hidden');
      return;
    }
    el('rect', { x: 0, y: 0, width: this.W, height: this.H, fill: 'white' }, this.mask);
    for (const c of cells) {
      const a = this.cellRect(c.s, c.f);
      el('rect', { ...a, fill: 'black' }, this.mask);
      el('rect', { ...a, class: 'fb-zone' }, zone);
    }
    dim.setAttribute('visibility', 'visible');
  }

  clearMarks() {
    this.layers.marks.innerHTML = '';
  }

  mark(s, f, cls, label) {
    const g = el('g', { class: 'fb-mark ' + cls, transform: `translate(${this.cx(f)},${this.cy(s)})` }, this.layers.marks);
    el('circle', { r: 12.5, class: 'dot' }, g);
    if (label) el('text', { y: 4, class: 'lbl' }, g).textContent = label;
    return g;
  }

  flash(s, f, kind, label) {
    const g = this.mark(s, f, kind, label);
    const ring = el('circle', { r: 12.5, class: 'ripple' }, g);
    ring.addEventListener('animationend', () => ring.remove());
  }

  reveal(s, f, label) {
    this.mark(s, f, 'reveal', label);
  }

  // A played note: string s vibrates between fret f and the bridge end, never between the nut
  // and the fret. Higher notes give closer and faster waves. Real string rates (80–1300 Hz)
  // cannot be drawn at 60 frames a second, so the motion is slowed to 2–12 cycles a second,
  // keeping the order from low to high notes.
  vibrate(s, f, freq) {
    const line = this.strLines?.[s];
    if (!line) return;
    this.stopVibe(s);
    const x0 = this.X(f === 0 ? this.nutX : this.wire[Math.min(f, this.frets)]);
    const x1 = this.X(this.wire[this.frets]);
    const y = this.cy(s);
    line.setAttribute('x2', String(x0)); // the part between the nut and the fret stays still
    const path = el('path', { class: 'fb-vibe', 'stroke-width': line.getAttribute('stroke-width') }, this.vibeLayer);
    const cycles = Math.min(14, Math.max(1, freq / 60)); // waves along the vibrating part
    const speed = Math.min(12, 2 + freq / 80); // cycles a second on screen
    const start = performance.now();
    const v = { path, raf: 0, line, x1 };
    const frame = (now) => {
      const t = (now - start) / 1000;
      const a = 3.2 * Math.exp(-t / 0.9);
      if (a < 0.15) return this.stopVibe(s);
      let d = '';
      for (let i = 0; i <= 64; i++) {
        const u = i / 64;
        const yy = y + a * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * (cycles * u - speed * t));
        d += (i ? 'L' : 'M') + (x0 + (x1 - x0) * u).toFixed(1) + ' ' + yy.toFixed(2);
      }
      path.setAttribute('d', d);
      v.raf = requestAnimationFrame(frame);
    };
    this.vibes.set(s, v);
    v.raf = requestAnimationFrame(frame);
  }

  stopVibe(s) {
    const v = this.vibes?.get(s);
    if (!v) return;
    cancelAnimationFrame(v.raf);
    v.path.remove();
    v.line.setAttribute('x2', String(v.x1));
    this.vibes.delete(s);
  }

  // A muted strum: no ringing waves, the strings give a short dead thump instead.
  strum() {
    if (!this.strG) return;
    for (const s of [...this.vibes.keys()]) this.stopVibe(s);
    this.strG.classList.remove('thump');
    void this.strG.getBoundingClientRect();
    this.strG.classList.add('thump');
  }

  // fn(s, f) -> null | { fill, stroke, dash, label } | { fog: true } (a position not unlocked yet)
  //   | { cloud: { w, h }, fill, opacity }: a soft blob w × the fret width wide and h × the
  //     string spacing high, so it spreads mostly along the string
  setHeat(fn) {
    const h = this.layers.heat;
    h.innerHTML = '';
    for (let s = 0; s < this.strings.length; s++) {
      for (let f = 0; f <= this.frets; f++) {
        const v = fn(s, f);
        if (!v) continue;
        if (v.fog) {
          el('rect', { ...this.cellRect(s, f), class: 'fb-fog' }, h);
          continue;
        }
        const g = el('g', { transform: `translate(${this.cx(f)},${this.cy(s)})` }, h);
        if (v.cloud) {
          const rx = (this.cw(f) / 2) * v.cloud.w;
          const ry = (this.sp / 2) * v.cloud.h;
          const c = el('g', { filter: `url(#${this.id}-cloud)`, fill: v.fill, opacity: (v.opacity ?? 1).toFixed(2), class: 'fb-cloud' }, g);
          // three overlapping puffs make an uneven, cloud-like outline
          el('ellipse', { rx: rx.toFixed(1), ry: ry.toFixed(1) }, c);
          el('ellipse', { cx: (-rx * 0.45).toFixed(1), cy: (-ry * 0.25).toFixed(1), rx: (rx * 0.6).toFixed(1), ry: (ry * 0.85).toFixed(1) }, c);
          el('ellipse', { cx: (rx * 0.45).toFixed(1), cy: (ry * 0.2).toFixed(1), rx: (rx * 0.55).toFixed(1), ry: (ry * 0.8).toFixed(1) }, c);
          continue;
        }
        el('circle', { r: 11, class: 'fb-heat', fill: v.fill || 'none', stroke: v.stroke || 'none', 'stroke-width': v.fill && v.stroke ? 2.5 : 1.5, 'stroke-dasharray': v.dash || 'none' }, g);
        if (v.label) el('text', { y: 4, class: 'fb-heat-lbl' }, g).textContent = v.label;
      }
    }
  }

  // Boxes around pairs of positions on one string: [{ s, f1, f2, cls, title }]
  setBoxes(list) {
    const h = this.layers.boxes;
    h.innerHTML = '';
    for (const b of list) {
      const a = this.cellRect(b.s, Math.min(b.f1, b.f2));
      const z = this.cellRect(b.s, Math.max(b.f1, b.f2));
      const x0 = Math.min(a.x, z.x);
      const x1 = Math.max(a.x + a.width, z.x + z.width);
      const r = el('rect', { x: x0 + 1, y: a.y + 2, width: x1 - x0 - 2, height: a.height - 4, rx: 9, class: 'fb-box ' + (b.cls || '') }, h);
      if (b.title) el('title', {}, r).textContent = b.title;
    }
  }
}
