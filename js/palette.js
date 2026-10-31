// @ts-check
// The app's colours, in one place for the scripts. css/app.css carries the same values as
// custom properties (--green, --red, ...); keep both in step. Only the colours of the Born &
// Raised poster, a touch brighter, on a white page, with its beige for secondary
// backgrounds. See docs/design.md.
export const PALETTE = {
  greenLight: '#86d96f', // the title green: primary actions
  green: '#5cc24e', // right answers, progress
  greenInk: '#2f8228', // green text on white
  red: '#e5252f', // wrong answers, boss, test data
  blue: '#14a0c4', // information, fading, "fast"
  yellow: '#f5cb2a', // highlight: zone, cues, golden
  ink: '#3f3c37', // text and outlines
  beige: '#f9f6ed', // secondary backgrounds, the neck
  muted: '#77716a',
  steel: '#948c7e', // strings, and outlines on the neck
};

// Weak to mastered: red → yellow → green (orange appears on the way from red to yellow).
const STOPS = [PALETTE.red, PALETTE.yellow, PALETTE.green];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Mastery 0–1 as a palette colour, from red (weak) to green (mastered). @param {number} m */
export function masteryColor(m) {
  const x = Math.min(1, Math.max(0, m)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const a = rgb(STOPS[i]);
  const b = rgb(STOPS[i + 1]);
  const t = x - i;
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('');
}
