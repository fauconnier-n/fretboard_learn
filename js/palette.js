// @ts-check
// The app's colours, in one place for the scripts. css/app.css carries the same values as
// custom properties (--green, --red, ...); keep both in step. Taken from the Born & Raised
// poster (green, red, blue, yellow on a dark outline) and the Element tee (orange, olive,
// slate blue, mustard), on a white page. See docs/design.md.
export const PALETTE = {
  green: '#6cbf5b', // brand and primary actions
  greenInk: '#2f8a43', // green for text and "right" on white
  red: '#d7322d', // "wrong", errors
  blue: '#2b9ac8', // information, "fast"
  sky: '#6e97c3', // fading / secondary
  yellow: '#f2b632', // highlight: zone, cues, golden
  orange: '#e8582a', // boss, warnings, test data
  olive: '#7d8b2b',
  ink: '#27241f', // text and outlines
  muted: '#6d6a64',
  steel: '#8d8a84', // strings, and outlines on the light neck
};

// Weak to mastered: red → orange → yellow → green.
const STOPS = [PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.green];

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
