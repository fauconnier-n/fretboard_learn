// @ts-check
// Instruments and tunings. Strings are listed lowest first as open-string MIDI notes.
//
// Knowledge carries across instruments by **string key**: the open note of a string, moved
// up an octave on a bass (a bass sounds an octave below a guitar, but its E string is
// fingered exactly like the guitar's). The memory model of an instrument is rebuilt from the
// whole answer log, replaying each past answer on the string with the same key:
// - a string added (low B on a 5-string bass) has no past answers: it starts unknown;
// - strings left out (guitar → bass) are skipped, and their answers stay in the log;
// - a retuned string (standard → drop D) has a new key: only that string starts over;
// - going back to an earlier instrument or tuning rebuilds it exactly as it was.

import { noteName } from './music.js';

const t = (name, strings) => ({ name, strings });
/** @type {Record<string, { name: string, family: 'guitar' | 'bass', tunings: Record<string, { name: string, strings: number[] }> }>} */
export const INSTRUMENTS = {
  guitar6: { name: '6-string guitar', family: 'guitar', tunings: {
    standard: t('Standard (E A D G B E)', [40, 45, 50, 55, 59, 64]),
    dropD: t('Drop D (D A D G B E)', [38, 45, 50, 55, 59, 64]),
    eb: t('Eb standard', [39, 44, 49, 54, 58, 63]),
  } },
  guitar7: { name: '7-string guitar', family: 'guitar', tunings: {
    standard: t('Standard (B E A D G B E)', [35, 40, 45, 50, 55, 59, 64]),
    dropA: t('Drop A (A E A D G B E)', [33, 40, 45, 50, 55, 59, 64]),
  } },
  guitar8: { name: '8-string guitar', family: 'guitar', tunings: {
    standard: t('Standard (F# B E A D G B E)', [30, 35, 40, 45, 50, 55, 59, 64]),
    dropE: t('Drop E (E B E A D G B E)', [28, 35, 40, 45, 50, 55, 59, 64]),
  } },
  guitar9: { name: '9-string guitar', family: 'guitar', tunings: {
    standard: t('Standard (C# F# B E A D G B E)', [25, 30, 35, 40, 45, 50, 55, 59, 64]),
  } },
  bass4: { name: '4-string bass', family: 'bass', tunings: {
    standard: t('Standard (E A D G)', [28, 33, 38, 43]),
    dropD: t('Drop D (D A D G)', [26, 33, 38, 43]),
  } },
  bass5: { name: '5-string bass', family: 'bass', tunings: {
    standard: t('Standard (B E A D G)', [23, 28, 33, 38, 43]),
  } },
  bass6: { name: '6-string bass', family: 'bass', tunings: {
    standard: t('Standard (B E A D G C)', [23, 28, 33, 38, 43, 48]),
  } },
};

// Answers logged before instruments existed carry only a tuning name.
export const LEGACY = { standard: ['guitar6', 'standard'], dropD: ['guitar6', 'dropD'], eb: ['guitar6', 'eb'], seven: ['guitar7', 'standard'] };

const instrumentOf = (id) => INSTRUMENTS[id] || INSTRUMENTS.guitar6;

/** String keys (see above) of an instrument's strings. @param {string} instrument @param {number[]} strings */
export const stringKeys = (instrument, strings) => strings.map((m) => m + (instrumentOf(instrument).family === 'bass' ? 12 : 0));

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * A custom tuning written lowest string first, e.g. "D2 A2 D3 G3 B3 E4" (# and b allowed).
 * @param {string} text @param {number} count number of strings
 * @returns {{ strings: number[], flats: boolean } | { error: string }}
 */
export function parseTuning(text, count) {
  const parts = String(text || '').trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== count) return { error: `Write ${count} notes, lowest string first (you wrote ${parts.length}).` };
  const strings = [];
  for (const p of parts) {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(p);
    if (!m) return { error: `"${p}" is not a note with an octave, like E2, F#1 or Bb3.` };
    strings.push(12 * (+m[3] + 1) + LETTERS[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
  }
  if (new Set(strings).size !== strings.length) return { error: 'Two strings have the same note.' };
  if (strings.some((s) => s < 12 || s > 84)) return { error: 'A note is out of range for a string.' };
  return { strings, flats: parts.some((p) => /^[A-Ga-g]b/.test(p)) };
}

/** A tuning written as notes, lowest first, e.g. "E2 A2 D3". @param {number[]} strings @param {boolean} [flats] */
export const tuningText = (strings, flats = false) => strings.map((m) => noteName(m, flats) + (Math.floor(m / 12) - 1)).join(' ');

/**
 * The strings to play from the settings. A custom tuning that does not parse falls back to standard.
 * @param {{ instrument?: string, tuning?: string, customTuning?: string }} s
 */
export function resolveTuning(s) {
  const inst = instrumentOf(s.instrument);
  const standard = inst.tunings.standard.strings;
  if (s.tuning === 'custom') {
    const p = parseTuning(s.customTuning ?? '', standard.length);
    if ('strings' in p) return { strings: p.strings, flats: p.flats, error: '' };
    return { strings: standard, flats: false, error: p.error };
  }
  const preset = inst.tunings[s.tuning ?? ''] || inst.tunings.standard;
  return { strings: preset.strings, flats: s.tuning === 'eb', error: '' };
}

/** The instrument and strings an answer was given on (older rows: from their tuning name). */
export function attemptStrings(a) {
  if (a.strings) return { instrument: a.instrument || 'guitar6', strings: String(a.strings).split(',').map(Number) };
  const [instrument, tuning] = LEGACY[a.tuning] || LEGACY.standard;
  return { instrument, strings: INSTRUMENTS[instrument].tunings[tuning].strings };
}

/**
 * A past answer replayed on the instrument whose string keys are `keys`: the same answer on
 * the string with the same key, or null if this instrument has no such string.
 * @param {any} a an answer from the log @param {number[]} keys
 */
export function mapAttempt(a, keys) {
  const { instrument, strings } = attemptStrings(a);
  const from = stringKeys(instrument, strings);
  const s = keys.indexOf(from[a.s]);
  if (s < 0) return null;
  if (s === a.s && from.length === keys.length && from.every((k, i) => k === keys[i])) return a;
  // the zone shape is in string numbers: move it to this instrument's numbering
  const d = a.desc || {};
  const sk = typeof d.sk === 'string' ? d.sk.split(',').map((x) => keys.indexOf(from[+x])).filter((x) => x >= 0).join(',') : d.sk;
  return { ...a, s, desc: { ...d, sk, cs: d.cs == null ? d.cs : d.cs + (s - a.s) } };
}
