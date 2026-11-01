// @ts-check
// The answer animation: shapes thrown out of the asked note, green for a right answer and red
// for a wrong one. One style per setting (answerFx); see docs/design.md.
import { PALETTE } from './palette.js';

const COLORS = {
  good: [PALETTE.green, PALETTE.greenLight, PALETTE.green],
  bad: [PALETTE.red, PALETTE.red, PALETTE.ink],
};

// Each style: how many pieces, the piece's look, and where it travels.
// spin in turns, fall in px (gravity at the end of the path), ms the duration.
const STYLES = {
  // dots shooting out in a ring, falling a little as they fade
  fireworks: { n: 18, size: [8, 13], dist: [80, 130], fall: 26, ms: 700, spin: 0, look: () => ({ borderRadius: '50%' }) },
  // blobs of different sizes thrown a short way, squashed, like paint
  splat: {
    n: 11, size: [12, 28], dist: [40, 95], fall: 14, ms: 650, spin: 0,
    look: () => ({ borderRadius: [0, 0, 0, 0].map(() => 35 + Math.round(Math.random() * 30) + '%').join(' '), border: `2px solid ${PALETTE.ink}` }),
  },
  // strips that tumble and fall
  confetti: { n: 20, size: [10, 16], dist: [70, 135], fall: 70, ms: 950, spin: 2, look: () => ({ height: '6px', borderRadius: '1px' }) },
  // four-pointed sparkles that turn as they fly
  stars: {
    n: 10, size: [18, 30], dist: [65, 115], fall: 8, ms: 750, spin: 0.5,
    look: () => ({ clipPath: 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)' }),
  },
};
export const FX_STYLES = Object.keys(STYLES);

const between = ([a, b]) => a + Math.random() * (b - a);

/**
 * Throws the shapes of a style out of the middle of an element.
 * @param {HTMLElement} from the asked note
 * @param {'good'|'bad'} kind
 * @param {string} style one of FX_STYLES; anything else (e.g. 'off') draws nothing
 */
export function burst(from, kind, style) {
  const st = STYLES[style];
  if (!st || !from.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = from.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.style.left = r.left + r.width / 2 + 'px';
  layer.style.top = r.top + r.height / 2 + 'px';
  const colors = COLORS[kind];
  const runs = [];
  for (let i = 0; i < st.n; i++) {
    const p = document.createElement('span');
    const size = between(st.size);
    Object.assign(p.style, { width: size + 'px', height: size + 'px', background: colors[i % colors.length] }, st.look());
    layer.append(p);
    // spread evenly round the circle, a little jitter so it does not look drawn with a compass
    const a = ((i + Math.random() * 0.6) / st.n) * 2 * Math.PI;
    const d = between(st.dist);
    const x = Math.cos(a) * d * 1.3;
    const y = Math.sin(a) * d * 0.8; // the prompt area is wider than tall
    const turn = st.spin * (Math.random() < 0.5 ? -1 : 1) * 360;
    runs.push(p.animate([
      // fast out of the note, then slower while it drifts and fades
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1, easing: 'cubic-bezier(.15, .8, .3, 1)' },
      { transform: `translate(calc(-50% + ${x * 0.8}px), calc(-50% + ${y * 0.8}px)) scale(1) rotate(${turn / 2}deg)`, opacity: 1, offset: 0.4, easing: 'ease-in' },
      { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + st.fall}px)) scale(${style === 'splat' ? 1.15 : 0.6}) rotate(${turn}deg)`, opacity: 0 },
    ], { duration: st.ms * between([0.85, 1.15]), fill: 'forwards' }).finished);
  }
  document.body.append(layer);
  Promise.allSettled(runs).then(() => layer.remove());
}
