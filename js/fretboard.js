// SVG fretboard: board drawing, zone highlight, marks with green/red effects, heatmap.

const NS = 'http://www.w3.org/2000/svg';
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const MAX_ZOOM = 2;
const RUN_STRINGS = 6; // during a run the view is at most this many strings high, so 7–9 strings fit a phone
const ZOOM_MS = 450;
let uid = 0;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// The contour of a zone: its cells form one band of adjacent strings, each string a run of
// frets, so the outline goes clockwise down the right ends of the rows and back up the left
// ends. Corners are rounded like the app's buttons. rects: the cells' rectangles.
// Returns the SVG path.
export function zoneOutline(rects, radius = 9) {
  const rows = new Map();
  for (const r of rects) {
    const row = rows.get(r.y) || { y: r.y, h: r.height, x0: Infinity, x1: -Infinity };
    row.x0 = Math.min(row.x0, r.x);
    row.x1 = Math.max(row.x1, r.x + r.width);
    rows.set(r.y, row);
  }
  const list = [...rows.values()].sort((p, q) => p.y - q.y);
  const pts = [];
  for (const r of list) pts.push([r.x1, r.y], [r.x1, r.y + r.h]);
  for (const r of [...list].reverse()) pts.push([r.x0, r.y + r.h], [r.x0, r.y]);
  // drop points that do not turn (a straight edge across two rows)
  const corners = pts.filter((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    return !((prev[0] === p[0] && p[0] === next[0]) || (prev[1] === p[1] && p[1] === next[1]));
  });
  const n = corners.length;
  const at = (i) => corners[((i % n) + n) % n];
  // the corner i is cut back along both its edges, at most half of each edge
  const cut = (i, toward) => {
    const p = at(i);
    const dx = toward[0] - p[0];
    const dy = toward[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.min(radius, l / 2) / l;
    return [p[0] + dx * k, p[1] + dy * k];
  };
  const xy = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const arc = (i) => `Q${xy(at(i))} ${xy(cut(i, at(i + 1)))} `;
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${xy(cut(i, at(i - 1)))} ${arc(i)}`;
  return d + 'Z';
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
    cancelAnimationFrame(this.zoomRaf);
    this.view = [0, 0, this.W, this.H];
    svg.setAttribute('viewBox', this.view.join(' '));
    const defs = el('defs', {}, svg);
    // a light blur so the clouds of the knowledge map have no hard edge
    el('feGaussianBlur', { stdDeviation: '2.4' }, el('filter', { id: this.id + '-soft', x: '-20%', y: '-40%', width: '140%', height: '180%' }, defs));
    // fog over locked positions: white with a fine cross-hatch, "uncharted"
    const hatch = el('pattern', { id: this.id + '-hatch', patternUnits: 'userSpaceOnUse', width: 7, height: 7 }, defs);
    el('rect', { width: 7, height: 7, fill: '#ffffff' }, hatch);
    el('path', { d: 'M0 0L7 7M7 0L0 7', class: 'fb-hatch' }, hatch);

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
      // the board minus the zone, as one path with a hole: a mask would be rasterised again at
      // every repaint of the board (each vibration, ripple or zoom frame)
      dim: el('path', { class: 'fb-dim', 'fill-rule': 'evenodd', visibility: 'hidden' }, svg),
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
    if (!cells) {
      dim.setAttribute('visibility', 'hidden');
      return;
    }
    const d = zoneOutline(cells.map((c) => this.cellRect(c.s, c.f)));
    const outside = `M0 0H${this.W}V${this.H}H0Z${d}`; // the board with the zone cut out (even-odd)
    dim.setAttribute('d', outside);
    // like the buttons' shadow: the zone's shape filled and shifted 2 px down and right, seen
    // only outside the zone, so the edges facing right and down look thicker, with no seam
    el('path', { d: outside, 'clip-rule': 'evenodd' }, el('clipPath', { id: this.id + '-zone-out' }, zone));
    // the clip sits on an unshifted group: on the shifted path it would move with it
    el('path', { d, class: 'fb-zone-shadow', transform: 'translate(2 2)' }, el('g', { 'clip-path': `url(#${this.id}-zone-out)` }, zone));
    el('path', { d, class: 'fb-zone' }, zone);
    dim.setAttribute('visibility', 'visible');
  }

  // During a run the view closes in on the zone's cells (null: the whole neck). The view keeps
  // the shape of a RUN_STRINGS-string board (the board's own shape when it has fewer strings),
  // so nothing around it moves; the zone grows at most MAX_ZOOM times.
  zoomTo(cells) {
    let to = [0, 0, this.W, this.H];
    if (cells?.length) {
      const rs = cells.map((c) => this.cellRect(c.s, c.f));
      const x0 = Math.min(...rs.map((r) => r.x)) - 40;
      const x1 = Math.max(...rs.map((r) => r.x + r.width)) + 40;
      const y0 = Math.min(...rs.map((r) => r.y)) - this.sp * 0.6;
      const y1 = Math.max(...rs.map((r) => r.y + r.height)) + this.sp * 0.6;
      const aspect = this.W / Math.min(this.H, this.H - (this.strings.length - RUN_STRINGS) * this.sp);
      const w = Math.min(this.W, Math.max(this.W / MAX_ZOOM, x1 - x0, (y1 - y0) * aspect));
      const h = w / aspect;
      const inside = (v, size, max) => Math.min(max - size, Math.max(0, v));
      to = [inside((x0 + x1 - w) / 2, w, this.W), inside((y0 + y1 - h) / 2, h, this.H), w, h];
    }
    if (to.every((v, i) => Math.abs(v - this.view[i]) < 0.5)) return;
    const from = this.view;
    const t0 = performance.now();
    cancelAnimationFrame(this.zoomRaf);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / ZOOM_MS);
      const k = 1 - (1 - t) ** 3; // ease out
      this.view = from.map((v, i) => v + (to[i] - v) * k);
      this.svg.setAttribute('viewBox', this.view.map((v) => v.toFixed(1)).join(' '));
      if (t < 1) this.zoomRaf = requestAnimationFrame(frame);
    };
    this.zoomRaf = requestAnimationFrame(frame);
  }

  clearMarks() {
    this.layers.marks.innerHTML = '';
  }

  mark(s, f, cls, label) {
    const g = el('g', { class: 'fb-mark ' + cls, transform: `translate(${this.cx(f)},${this.cy(s)})` }, this.layers.marks);
    el('circle', { r: 14, class: 'dot' }, g);
    // a wrong note is struck out, so it reads without telling red from green
    if (cls === 'bad') el('path', { d: 'M-9.5 -9.5L9.5 9.5M9.5 -9.5L-9.5 9.5', class: 'strike' }, g);
    if (label) el('text', { y: 4.5, class: 'lbl' }, g).textContent = label;
    return g;
  }

  flash(s, f, kind, label) {
    const g = this.mark(s, f, kind, label);
    const ring = el('circle', { r: 14, class: 'ripple' }, g);
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
  //   | { cloud: { w, h }, fill, opacity, label }: a soft round cloud w × half the fret width
  //     wide and h × half the string spacing high, fading out gradually towards its edge
  //   | { stroke, dash, label, faint }: a ring with a (pale) name
  //   | { rings: { known, fast, auto }, label, missed }: three progress rings with the name in front
  setHeat(fn) {
    const h = this.layers.heat;
    h.innerHTML = '';
    const defs = el('defs', {}, h);
    // all clouds in one blurred group (one filter pass per repaint instead of one per cloud), their
    // names in a group above; gradients shared between clouds of the same colour and core
    const clouds = el('g', { class: 'fb-clouds', filter: `url(#${this.id}-soft)` }, h);
    const gradients = new Map();
    const labels = [];
    for (let s = 0; s < this.strings.length; s++) {
      for (let f = 0; f <= this.frets; f++) {
        const v = fn(s, f);
        if (!v) continue;
        if (v.fog) {
          el('rect', { ...this.cellRect(s, f), class: 'fb-fog', fill: `url(#${this.id}-hatch)` }, h);
          continue;
        }
        if (v.cloud) {
          // a pill, solid across a middle band (wider when practised more), fading at top and bottom
          const half = 0.1 + 0.16 * (v.cloud.core ?? 0.5);
          const gkey = `${v.fill}|${half.toFixed(3)}`;
          let id = gradients.get(gkey);
          if (!id) {
            id = `${this.id}-c${gradients.size}`;
            gradients.set(gkey, id);
            const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
            for (const [o, a] of [[0, 0], [0.5 - half - 0.26, 0.3], [0.5 - half - 0.12, 0.7], [0.5 - half, 1], [0.5 + half, 1], [0.5 + half + 0.12, 0.7], [0.5 + half + 0.26, 0.3], [1, 0]]) {
              el('stop', { offset: Math.max(0, Math.min(1, o)).toFixed(3), 'stop-color': v.fill, 'stop-opacity': a }, grad);
            }
          }
          const ry = (this.sp / 2) * v.cloud.h;
          const rx = Math.max(ry, (this.cw(f) / 2) * v.cloud.w);
          el('rect', { x: (this.cx(f) - rx).toFixed(1), y: (this.cy(s) - ry).toFixed(1), width: (2 * rx).toFixed(1), height: (2 * ry).toFixed(1), rx: (ry * 0.7).toFixed(1), fill: `url(#${id})`, opacity: (v.opacity ?? 1).toFixed(2), class: 'fb-cloud' }, clouds);
          if (v.label) labels.push([s, f, v.label]);
          continue;
        }
        const g = el('g', { transform: `translate(${this.cx(f)},${this.cy(s)})` }, h);
        if (v.rings) {
          // a note of the last run: rings known (outer), fast (middle), automatic (inner), name in front
          for (const [r, k] of [[12.5, 'known'], [9, 'fast'], [5.5, 'auto']]) {
            const C = 2 * Math.PI * r;
            el('circle', { r, class: 'fb-ring-bg' }, g);
            el('circle', { r, class: 'fb-ring nr-' + k, 'stroke-dasharray': `${(v.rings[k] * C).toFixed(1)} ${C.toFixed(1)}`, transform: 'rotate(-90)' }, g);
          }
          el('text', { y: 3.5, class: 'fb-ring-lbl' + (v.missed ? ' missed' : '') }, g).textContent = v.label;
          continue;
        }
        el('circle', { r: 11, class: 'fb-heat', fill: v.fill || 'none', stroke: v.stroke || 'none', 'stroke-width': v.fill && v.stroke ? 2.5 : 1.5, 'stroke-dasharray': v.dash || 'none' }, g);
        if (v.label) el('text', { y: 3.5, class: 'fb-heat-lbl' + (v.faint ? ' faint' : '') }, g).textContent = v.label;
      }
    }
    if (labels.length) {
      const lg = el('g', {}, h);
      for (const [s, f, label] of labels) el('text', { x: this.cx(f), y: this.cy(s) + 3.5, class: 'fb-heat-lbl' }, lg).textContent = label;
    }
  }
}
