// @ts-check
// The answer animation, thrown out of the asked note: green confetti for a right answer, red
// fireworks for a wrong one. See docs/design.md.
import { PALETTE } from './palette.js';

// Each kind: how many pieces, their colours and look, and where they travel.
// spin in turns, fall in px (gravity at the end of the path), ms the duration.
const STYLES = {
  // strips that tumble and fall
  good: {
    n: 20, size: [10, 16], dist: [70, 135], fall: 70, ms: 950, spin: 2,
    colors: [PALETTE.green, PALETTE.greenLight, PALETTE.green], look: () => ({ height: '6px', borderRadius: '1px' }),
  },
  // dots shooting out in a ring, falling a little as they fade
  bad: {
    n: 18, size: [8, 13], dist: [80, 130], fall: 26, ms: 700, spin: 0,
    colors: [PALETTE.red, PALETTE.red, PALETTE.ink], look: () => ({ borderRadius: '50%' }),
  },
};

/** @param {number[]} r a range [low, high] */
const between = ([a, b]) => a + Math.random() * (b - a);

/**
 * Throws the shapes out of the middle of an element.
 * @param {HTMLElement} from the asked note
 * @param {'good'|'bad'} kind
 */
export function burst(from, kind) {
  const st = STYLES[kind];
  if (!from.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = from.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.style.left = r.left + r.width / 2 + 'px';
  layer.style.top = r.top + r.height / 2 + 'px';
  const runs = [];
  for (let i = 0; i < st.n; i++) {
    const p = document.createElement('span');
    const size = between(st.size);
    Object.assign(p.style, { width: size + 'px', height: size + 'px', background: st.colors[i % st.colors.length] }, st.look());
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
      { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + st.fall}px)) scale(0.6) rotate(${turn}deg)`, opacity: 0 },
    ], { duration: st.ms * between([0.85, 1.15]), fill: 'forwards' }).finished);
  }
  document.body.append(layer);
  Promise.allSettled(runs).then(() => layer.remove());
}
