// The decay fit's replays (modelcheck.js fitDecay), off the page's thread.
import { scoreDecays } from './modelcheck.js';

self.onmessage = ({ data }) => self.postMessage(scoreDecays(data.attempts, data.strings, data.frets));
