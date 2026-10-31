// Note names, pitch maths and tunings. Strings are indexed from the lowest (0).

export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Open-string MIDI numbers, lowest string first.
export const TUNINGS = {
  standard: { name: 'Standard (E A D G B E)', strings: [40, 45, 50, 55, 59, 64] },
  dropD: { name: 'Drop D (D A D G B E)', strings: [38, 45, 50, 55, 59, 64] },
  eb: { name: 'Eb standard', strings: [39, 44, 49, 54, 58, 63] },
  seven: { name: '7-string (B E A D G B E)', strings: [35, 40, 45, 50, 55, 59, 64] },
};

export const pcOf = (midi) => ((midi % 12) + 12) % 12;
export const noteName = (midi, flats = false) => (flats ? FLATS : SHARPS)[pcOf(midi)];
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;
export const midiLabel = (midi, flats = false) => noteName(midi, flats) + octaveOf(midi);
// Spellings: 'n' natural, 's' sharp (A#), 'f' flat (Bb).
export const isAccidental = (pc) => pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
export const spellingsOf = (pc) => (isAccidental(pc) ? ['s', 'f'] : ['n']);
export const spellName = (midi, sp) => noteName(midi, sp === 'f');
export const freqToMidi =(freq, a4 = 440) => 69 + 12 * Math.log2(freq / a4);
export const midiToFreq = (midi, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);

export function stringName(strings, s, flats = false) {
  const name = noteName(strings[s], flats);
  // lowercase the top string when it shares its name with the bottom one (E ... e)
  const top = s === strings.length - 1 && pcOf(strings[s]) === pcOf(strings[0]);
  return top ? name.toLowerCase() : name;
}

export function positionsOf(strings, frets, midi) {
  const out = [];
  strings.forEach((open, s) => {
    const f = midi - open;
    if (f >= 0 && f <= frets) out.push({ s, f });
  });
  return out;
}
