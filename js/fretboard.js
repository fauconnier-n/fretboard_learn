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

  configure({ strings, frets, leftHanded, flats }) {
    Object.assign(this, { strings, frets, left: !!leftHanded, flats: !!flats });
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
    return this.top + (this.strings.length - 1 - s) * this.sp;
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
    for (let s = 0; s < n; s++) {
      const y = this.cy(s);
      el('line', { x1: this.X(20), x2: xb, y1: y, y2: y, class: 'fb-string', 'stroke-width': (1 + (n - 1 - s) * 0.35).toFixed(2) }, g);
    }
    for (let f = 0; f <= this.frets; f++) {
      const marked = f === 0 || f === 12 || f === 24 || INLAYS.includes(f);
      el('text', { x: this.cx(f), y: this.boardBot + 16, class: 'fb-num' + (marked ? ' marked' : '') }, g).textContent = f;
    }

    this.layers = {
      dim: el('rect', { x: 0, y: 0, width: this.W, height: this.H, class: 'fb-dim', mask: `url(#${this.id}-mask)`, visibility: 'hidden' }, svg),
      zone: el('g', {}, svg),
      heat: el('g', {}, svg),
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

  // fn(s, f) -> null | { fill, stroke, dash, label }
  setHeat(fn) {
    const h = this.layers.heat;
    h.innerHTML = '';
    for (let s = 0; s < this.strings.length; s++) {
      for (let f = 0; f <= this.frets; f++) {
        const v = fn(s, f);
        if (!v) continue;
        const g = el('g', { transform: `translate(${this.cx(f)},${this.cy(s)})` }, h);
        el('circle', { r: 11, class: 'fb-heat', fill: v.fill || 'none', stroke: v.stroke || 'none', 'stroke-width': v.fill && v.stroke ? 2.5 : 1.5, 'stroke-dasharray': v.dash || 'none' }, g);
        if (v.label) el('text', { y: 4, class: 'fb-heat-lbl' }, g).textContent = v.label;
      }
    }
  }
}
