// Music theory for the stage themes (js/core/audio/themes/): scales, the
// notation the themes are written in, and pitches. Pure functions, no Web
// Audio: the sequencer (js/core/audio/sequencer.js) reads what these parse.
//
// A theme is written in scale degrees, never in note names, so the same
// hook can be heard in another mode: Victory restates it in a major mode,
// Defeat in a minor one, Overtime a step up and darker, all from the same
// line (see docs/systems/audio.md).
//
// Melodies (parseMelody): tokens separated by spaces, `|` a bar line for
// the reader only.
//
//   5        degree 5 of the scale (1 the tonic; 8 is the tonic an octave
//            up, 9 the second an octave up, and so on)
//   5'  5,   an octave up / down (repeatable: 5'' two octaves up)
//   4#  6b   a semitone above / below the scale's degree
//   :4       its length in sixteenths (2, an eighth, when left out)
//   >5  _5   accented (velocity 1) / a ghost note (0.5); 0.8 otherwise
//   .:4      a rest of four sixteenths
//
// Chord-relative lines (parseLine: bass, arpeggios, stabs) use the same
// grammar with chord tones in place of degrees: R the root, 3 the third,
// 5 the fifth, 7 the seventh, 8 the root an octave up, 10 the third and 12
// the fifth an octave up, 9 the ninth; `,` and `'` move them by octaves.
//
// Chords (parseChords): one a bar, a scale degree (its triad built from
// the scale itself, so 1 in a minor mode is a minor chord) with an optional
// shape: sus2, sus4, 7, add9 or 5 (a power chord), and an optional `b` or
// `#` on the degree (a borrowed root, e.g. 7b).
//
// Rhythms (parseRhythm): one character a sixteenth, any length: X an
// accent, x a hit, o a ghost, - or . nothing.

// Semitones of each mode's seven degrees above its tonic.
export const SCALES = Object.freeze({
  ionian: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  lydian: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  aeolian: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  locrian: Object.freeze([0, 1, 3, 5, 6, 8, 10]),
  harmonicMinor: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
  phrygianDominant: Object.freeze([0, 1, 4, 5, 7, 8, 10]),
  doubleHarmonic: Object.freeze([0, 1, 4, 5, 7, 8, 11]),
});

export const STEPS_PER_BAR = 16;

// Frequency of MIDI note `m` (A4 = 69 = 440 Hz), fractional notes too.
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

// Semitones above the tonic of 1-based `degree` in `scale` (any degree:
// 8 is the tonic an octave up, 0 the seventh an octave down).
export function degreeSemis(scale, degree) {
  const d = degree - 1;
  const octave = Math.floor(d / 7);
  const index = ((d % 7) + 7) % 7;
  return scale[index] + 12 * octave;
}

const VELOCITY = Object.freeze({ '>': 1, _: 0.5, '': 0.8 });
const NOTE = /^([>_]?)(R|\d+)([#b]?)([',]*)(?::(\d+))?$/;
const REST = /^\.(?::(\d+))?$/;

function octaveShift(marks) {
  let shift = 0;
  for (const m of marks) shift += m === "'" ? 1 : -1;
  return shift;
}

// Parses a line of tokens into events { step, len, value, acc, octave, vel }
// (value: a degree number, or 'R' / a chord-tone number for parseLine),
// and its whole length in sixteenths. A malformed token throws: a theme
// with a typo never plays wrong notes quietly.
function parseTokens(text, what) {
  const events = [];
  let step = 0;
  for (const token of String(text).split(/\s+/)) {
    if (!token || token === '|') continue;
    const rest = REST.exec(token);
    if (rest) {
      step += Number(rest[1] ?? 2);
      continue;
    }
    const m = NOTE.exec(token);
    if (!m) throw new Error(`[Alva] Bad ${what} token "${token}"`);
    const len = Number(m[5] ?? 2);
    if (!(len > 0)) throw new Error(`[Alva] Bad ${what} length in "${token}"`);
    events.push({
      step, len,
      value: m[2] === 'R' ? 'R' : Number(m[2]),
      acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0,
      octave: octaveShift(m[4]),
      vel: VELOCITY[m[1]],
    });
    step += len;
  }
  return { events, steps: step };
}

// A melody in scale degrees (see the top).
export function parseMelody(text) {
  const parsed = parseTokens(text, 'melody');
  for (const e of parsed.events) if (e.value === 'R') throw new Error('[Alva] A melody uses degrees, not R');
  return Object.freeze(parsed);
}

// A chord-relative line (see the top).
export function parseLine(text) {
  return Object.freeze(parseTokens(text, 'line'));
}

const CHORD = /^(\d)([#b]?)(sus2|sus4|7|add9|5)?$/;

// One chord: its root degree, borrowed accidental and shape.
export function parseChord(token) {
  const m = CHORD.exec(token);
  if (!m) throw new Error(`[Alva] Bad chord "${token}"`);
  return Object.freeze({ degree: Number(m[1]), acc: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, shape: m[3] ?? '' });
}

// Chords, one a bar.
export function parseChords(text) {
  return Object.freeze(String(text).split(/\s+/).filter((t) => t && t !== '|').map(parseChord));
}

// The chord's tones in semitones above the tonic, keyed as parseLine
// names them: R, 3, 5, 7, 9 (third / fifth / seventh / ninth of the
// stacked thirds from the scale, a sus chord's 2 or 4 standing in for
// its third).
export function chordTones(scale, chord) {
  const root = degreeSemis(scale, chord.degree) + chord.acc;
  const above = (n) => degreeSemis(scale, chord.degree + n) + chord.acc;
  let third = above(2);
  if (chord.shape === 'sus2') third = above(1);
  if (chord.shape === 'sus4') third = above(3);
  if (chord.shape === '5') third = above(4);
  return { R: root, 3: third, 5: above(4), 7: above(6), 9: above(8) };
}

// The pitches a chord sounds (semitones above the tonic), low to high:
// its triad (with its seventh or ninth for those shapes).
export function chordVoicing(scale, chord) {
  const t = chordTones(scale, chord);
  const notes = [t.R, t[3], t[5]];
  if (chord.shape === '7') notes.push(t[7]);
  if (chord.shape === 'add9') notes.push(t[9]);
  if (chord.shape === '5') notes.splice(1, 1, t.R + 12);
  return notes;
}

// Chord tone `value` of a parseLine event (R, 3, 5, 7, 8, 9, 10, 12) in
// semitones above the tonic.
export function lineSemis(scale, chord, value) {
  const t = chordTones(scale, chord);
  switch (value) {
    case 'R': return t.R;
    case 3: return t[3];
    case 5: return t[5];
    case 7: return t[7];
    case 8: return t.R + 12;
    case 9: return t[9];
    case 10: return t[3] + 12;
    case 12: return t[5] + 12;
    default: throw new Error(`[Alva] Unknown chord tone ${value}`);
  }
}

const HITS = Object.freeze({ X: 1, x: 0.78, o: 0.42 });

// A drum line: [{ step, vel }] and its length in sixteenths.
export function parseRhythm(text) {
  const clean = String(text).replace(/\s+/g, '');
  const hits = [];
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (c === '-' || c === '.') continue;
    if (!Object.hasOwn(HITS, c)) throw new Error(`[Alva] Bad rhythm character "${c}"`);
    hits.push({ step: i, vel: HITS[c] });
  }
  return Object.freeze({ hits: Object.freeze(hits), steps: clean.length });
}
