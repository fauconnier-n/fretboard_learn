// @ts-check
// The app's colours, in one place for the scripts. css/app.css carries the same values as
// custom properties (--green, --red, ...); keep both in step. Only the colours of the Born &
// Raised poster, a touch brighter, on a white page, with its beige for secondary
// backgrounds. See docs/design.md.
export const PALETTE = {
  greenLight: '#6fd94c', // the title green: primary actions
  green: '#3cbd2b', // right answers, progress
  greenInk: '#27871a', // green text on white
  red: '#e5252f', // wrong answers, boss, test data
  blue: '#14a0c4', // information, fading, "fast"
  yellow: '#f5cb2a', // highlight: zone, cues, golden
  ink: '#3f3c37', // text and outlines
  beige: '#f9f6ed', // secondary backgrounds, the neck
  muted: '#77716a',
  steel: '#948c7e', // strings, and outlines on the neck
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// A colour between palette stops, for m from 0 to 1.
function blend(stops, m) {
  const x = Math.min(1, Math.max(0, m)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = rgb(stops[i]);
  const b = rgb(stops[i + 1]);
  const t = x - i;
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Mastery 0–1 from red (weak) through orange and yellow to green (mastered): note bars and knowledge maps. @param {number} m */
export const masteryColor = (m) => blend([PALETTE.red, PALETTE.yellow, PALETTE.green], m);
