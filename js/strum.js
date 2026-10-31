// @ts-check
// Muted strum: the hand damps the strings and strums, giving a short burst of noise with no
// clear pitch. It is the app's "go" signal, so the whole app can be driven from the guitar.
// A burst starts on a sharp rise well above the noise gate; WINDOW_MS later it counts as a
// strum if no clear pitch showed up during it and it has already died down (a played note
// rings on with a pitch).

const WINDOW_MS = 140;
const REFRACTORY_MS = 200; // after a confirmed strum (about 340 ms after its attack), ignore its tail
export const DOUBLE_MS = 700; // two strums this close together are a double strum

export class StrumDetector {
  /** @param {number} level burst threshold, as a multiple of the noise gate */
  constructor(level = 4) {
    this.level = level;
    this.env = 0;
    this.burst = null;
    this.last = -Infinity;
  }

  /**
   * Feed one audio frame. Returns true once, when a burst is confirmed as a muted strum.
   * @param {number} now ms
   * @param {number} rms frame level
   * @param {boolean} pitched a clear pitch was detected in this frame
   * @param {number} gate noise gate
   */
  feed(now, rms, pitched, gate) {
    const prev = this.env;
    this.env = 0.6 * this.env + 0.4 * rms;
    const b = this.burst;
    if (!b) {
      if (rms > gate * this.level && rms > prev * 1.6 + gate * 0.5 && now - this.last > REFRACTORY_MS) {
        this.burst = { t: now, peak: rms, pitched };
      }
      return false;
    }
    b.peak = Math.max(b.peak, rms);
    b.pitched ||= pitched;
    if (now - b.t < WINDOW_MS) return false;
    this.burst = null;
    if (b.pitched || rms > b.peak * 0.5) return false;
    this.last = now;
    return true;
  }
}
