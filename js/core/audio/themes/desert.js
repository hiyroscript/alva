// Yerma (map id `desert`): a sandstone mesa over open desert air, far rock
// needles, gold-lit wisps. Its theme is a heroic desert march in D
// Phrygian dominant (the Hijaz colour: D Eb F# G A Bb C) at 134 BPM: an oud
// carries the hook, a brass section answers it, darbuka and frame drums
// drive a maqsum groove under a wide wind drone, strings swell beneath.
//
// The hook (four bars, eight with its answer): D Eb F# A, a long A, the
// F# G F# Eb turn; then the same rhythm a step up over Eb, and again from C
// over C minor, home to D. Every version is that hook: Overtime a step up
// and faster, Victory in D Mixolydian with the brass, Defeat slowed into D
// Phrygian with a falling cadence, Draw hanging on a suspended chord.

import { OVERTIME_CHANNELS, OVERTIME_LAYERS, HIT_CHANNELS } from './common.js';

const hookA = '>1:2 2:1 3:1 >5:4 3:2 4:2 3:2 2:2 | >2:3 1:1 2:2 4:2 >6:4 5:2 4:2 | >7,:2 1:1 2:1 >4:4 2:2 3:2 2:2 1:2';

export default {
  id: 'desert',
  bpm: 134,
  tonic: 62,
  scale: 'phrygianDominant',
  level: 1,
  reverb: { seconds: 2.6, damp: 0.55, level: 0.9 },
  delay: { beats: 0.75, feedback: 0.34, level: 0.8 },
  channels: {
    lead: { tone: 'oud', octave: 0, gain: 0.95, pan: 0.12, reverb: 0.22, delay: 0.16, legato: 1 },
    lead2: { tone: 'oud', octave: 1, gain: 0.5, pan: -0.38, reverb: 0.3, delay: 0.22 },
    brass: { synth: 'brass', octave: -1, gain: 0.9, pan: -0.14, reverb: 0.3, params: { level: 0.3, bright: 0.9 } },
    stab: { synth: 'brass', octave: -1, gain: 0.62, pan: 0.22, reverb: 0.22, params: { stab: true, level: 0.28, bright: 1.1 } },
    pad: { synth: 'strings', octave: -1, gain: 0.8, reverb: 0.4, pump: true, params: { level: 0.13, cutoff: 2300 } },
    drone: { synth: 'drone', octave: -2, gain: 0.6, reverb: 0.35, params: { cutoff: 380, level: 0.18 } },
    wind: { synth: 'swell', gain: 0.55, pan: -0.2, reverb: 0.5, params: { level: 0.12 } },
    bass: { synth: 'bass', octave: -2, gain: 0.9, pump: false, params: { cutoff: 520, level: 0.34, decay: 0.16, sustain: 0.55 } },
    tremolo: { tone: 'oud', octave: 0, gain: 0.42, pan: 0.3, reverb: 0.2, delay: 0.1 },
    kick: { drum: 'kick', opts: { deep: true }, gain: 0.82, duck: 0.45 },
    doum: { drum: 'doum', gain: 0.62, pan: -0.08, reverb: 0.1 },
    tek: { drum: 'tek', gain: 0.46, pan: 0.18, reverb: 0.12 },
    ka: { drum: 'tek', opts: { soft: true }, gain: 0.3, pan: 0.26, reverb: 0.08 },
    riq: { drum: 'riq', gain: 0.3, pan: -0.32, reverb: 0.12 },
    frame: { drum: 'frame', gain: 0.62, pan: 0.05, reverb: 0.22 },
    clap: { drum: 'clap', gain: 0.4, reverb: 0.28 },
    taiko: { drum: 'taiko', gain: 0.62, reverb: 0.32 },
    clash: { synth: 'strings', octave: 0, gain: 0.6, pan: -0.25, reverb: 0.15, params: { staccato: true, level: 0.17 } },
    ostinato: { synth: 'strings', octave: 0, gain: 0.6, pan: 0.25, reverb: 0.15, params: { staccato: true, level: 0.17 } },
    ...HIT_CHANNELS,
    ...OVERTIME_CHANNELS,
  },
  parts: {
    // ---- Melodies (scale degrees) ----
    hook8: { melody: `${hookA} | >3:2 4:2 5:2 6:1 5:1 >5:8 | ${hookA} | >3:2 2:2 1:2 2:1 3:1 >1:8` },
    hook8Orn: {
      melody: '>1:1 2:1 1:1 3:1 >5:4 4:1 3:1 4:2 3:2 2:2 | >2:2 1:1 2:1 3:1 4:1 >6:4 5:1 6:1 5:2 4:2 | '
        + '>7,:1 1:1 2:1 3:1 >4:4 2:2 3:1 4:1 2:2 1:2 | >3:2 4:2 5:2 6:1 5:1 >5:8 | '
        + `${hookA} | >3:1 2:1 3:1 2:1 1:2 2:1 3:1 >1:8`,
    },
    counter: { melody: '>3:8 5:8 | >4:8 6:8 | >2:8 4:8 | >3:16 | >5:8 3:8 | >6:8 4:8 | >4:8 2:8 | >1:16' },
    bMelody: {
      melody: '>4:4 5:2 6:2 >8:6 6:2 | >9:4 8:2 9:2 >6:8 | >7:4 8:2 9:2 >11:6 9:2 | >10:8 9:2 8:2 7:2 6:2 | '
        + '>4:4 5:2 6:2 >8:6 6:2 | >9:4 8:2 9:2 >6:8 | >7:4 8:2 9:2 >11:6 9:2 | >10:4 11:4 >12:8',
    },
    introLick: { melody: '.:4 >1:2 2:1 3:1 >5:6 4:1 3:1 | >2:12 .:4 | .:4 >1:2 2:1 3:1 >6:6 5:1 4:1 | >5:4 4:2 3:2 >2:4 3:2 2:1 1:1' },
    hookFrag: { melody: '>1:2 2:1 3:1 >5:4 .:8 | .:16' },
    victoryLine: { melody: '>1:2 2:1 3:1 >5:4 6:2 7:2 >8:4 | >8:16' },
    calmHook: { melody: '>1:2 2:1 3:1 >5:12 | .:16 | >4:2 3:1 2:1 >1:12 | .:16 | >5:2 6:1 7:1 >8:12 | .:16 | >7:2 6:2 5:4 .:8 | >5:16' },
    defeatLine: { melody: '>1:2 2:1 3:1 >5:4 4:2 3:2 2:2 1:2 | >4:4 3:4 2:4 >1:4' },
    defeatCalm: { melody: '>5:4 4:2 3:2 >2:8 | .:16 | >4:4 3:2 2:2 >1:8 | .:16 | >3:4 2:2 1:2 >7,:8 | .:16 | >2:4 1:4 7,:4 6,:4 | >5,:16' },
    drawLine: { melody: '>1:2 2:1 3:1 >5:12 | .:16' },
    drawCalm: { melody: '>5:2 4:1 3:1 >2:12 | .:16 | >1:2 2:1 3:1 >5:12 | .:16 | >6:2 5:1 4:1 >2:12 | .:16 | >1:2 2:1 4:1 >5:12 | .:16' },
    // ---- Chord-relative lines ----
    bassA: { line: '>R:2 R:4 R:2 >R:4 5:2 R:2' },
    bassA2: { line: '>R:2 R:2 8:2 R:2 >R:4 5:2 7,:2' },
    bassRun: { line: '>R:2 R:1 R:1 8:2 R:2 >R:2 R:1 R:1 5:2 7:2' },
    bassDrive: { line: '>R:1 R:1 8:1 R:1 R:1 R:1 8:1 R:1 >R:1 R:1 8:1 R:1 5:1 R:1 8:1 5:1' },
    bassCalm: { line: '>R:16' },
    tremolo: { line: 'R:1 5:1 8:1 10:1 8:1 5:1 R:1 5:1 8:1 10:1 12:1 10:1 8:1 5:1 8:1 5:1' },
    ostinato: { line: '>R:1 8:1 R:1 5:1 R:1 8:1 R:1 5:1 >R:1 8:1 R:1 5:1 R:1 8:1 5:1 8:1' },
    ostinatoClash: { line: '>R:1 8:1 R#:1 8:1 R:1 8:1 R#:1 5:1 >R:1 8:1 R#:1 8:1 R:1 8:1 R#:1 5:1' },
    // ---- Chords ----
    pads: { chord: 16 },
    padsOpen: { chord: 16, open: true },
    stabs: { chord: 2, rhythm: 'X.....x.....x...' },
    stabsHard: { chord: 1, rhythm: 'X..x..x...X.x...' },
    drone: { hold: 1, len: 32, every: 32 },
    gust: { hold: 1, len: 32, every: 32 },
    // ---- Drums ----
    introBeat: { beat: { frame: 'X.........x.....', riq: '....o.......o...' } },
    grooveA: {
      beat: {
        kick: 'X.......X..x....', doum: 'X.......X.......', tek: '..x...x.....x...', ka: '.o.o.o..o.o.o.oo',
        riq: '..x...x...x...x.', clap: '....x.......x...',
      },
    },
    grooveA2: {
      beat: {
        kick: 'X.......X..x..x.', doum: 'X.......X.....o.', tek: '..x...x.....x...', ka: '.o.o.ooo.o.o.ooo',
        riq: 'x.x.x.x.x.x.x.x.', clap: '....x.......x...', frame: '..........x.....',
      },
    },
    grooveB: {
      beat: {
        kick: 'X...X...X...X...', doum: 'X.....x.X.....x.', tek: '..x...x...x...x.', ka: 'o.o.o.o.o.o.o.o.',
        riq: 'xxx.xxx.xxx.xxx.', clap: '....X.......X...', frame: 'X.........X.....',
      },
    },
    grooveC: {
      beat: {
        kick: 'X...X...X...X.x.', doum: 'X.......X.......', tek: '..x...x.....x.x.', ka: '.o.o.o.o.o.o.o.o',
        riq: 'xxxxxxxxxxxxxxxx', clap: '....X.......X...', taiko: 'X.......X.......',
      },
    },
    breakBeat: { beat: { frame: 'X.........x.....', riq: '..o...o...o...o.', ka: '......o.......o.' } },
    fillA: {
      beat: {
        kick: 'X.......X.......', doum: 'X.....X.X...X...', tek: 'x.x.x.x.xxxxXXXX', taiko: '............X.X.', clap: '....x...........',
      },
    },
    fillB: { beat: { kick: 'X...X...X.X.XXXX', taiko: 'X.......X...X.X.', tek: 'xxxxxxxxXXXXXXXX', clap: '....X.......X...' } },
    otRoll: { beat: { tek: 'x.x.x.x.xxxxXXXX', taiko: 'X.......X...X.X.', frame: 'X...X...X.X.XXXX' } },
    otBeat: {
      beat: {
        kick: 'X...X...X...X...', doum: 'X.....x.X.....x.', tek: '..x...x...x...x.', ka: 'oooooooooooooooo',
        riq: 'x.x.x.x.x.x.x.x.', clap: '....X.......X...',
      },
    },
    otBeat2: {
      beat: {
        kick: 'X...X...X...X.x.', doum: 'X.x...x.X.x...x.', tek: '..x.x.x...x.x.x.', ka: 'oooooooooooooooo',
        riq: 'xxxxxxxxxxxxxxxx', clap: '....X.......X...', taiko: 'X.......X.......',
      },
    },
    stingBeat: { beat: { frame: 'X...x...X.x.XXXX', taiko: 'X.......X...X.XX', riq: 'xxxxxxxxxxxxxxxx' } },
    calmBeat: { beat: { frame: 'X...............', riq: '......o.......o.' } },
    defeatSting: { beat: { frame: 'X.......X.......', taiko: 'X...............' } },
    defeatBeat: { beat: { frame: 'X.....o.........' } },
    drawSting: { beat: { frame: 'X..x..X..x..X.x.', riq: 'o.o.o.o.o.o.o.o.', taiko: 'X.......X.......' } },
    drawBeat: { beat: { frame: 'X.......x.......', riq: '....o.......o...' } },
    hitOnly: { beat: { taiko: 'X...............' } },
  },
  sections: {
    intro: {
      bars: 4, chords: '1 1 2 1', riser: 2, fill: 'fillA',
      play: { lead: 'introLick', drone: 'drone', wind: 'gust', pad: 'padsOpen', beat: 'introBeat' },
    },
    A1: {
      bars: 8, chords: '1 2 7 1 1 2 7 1', crash: true, fill: 'fillA',
      play: {
        lead: 'hook8', bass: ['bassA', 'bassA2'], pad: 'pads', beat: 'grooveA', wind: [null, 'gust'],
        lead2: [null, { part: 'hook8', shift: 2, octave: -1, vel: 0.7 }],
      },
    },
    A2: {
      bars: 8, chords: '1 2 7 1 1 2 7 1', fill: 'fillA',
      play: {
        lead: 'hook8', stab: 'stabs', bass: ['bassA2', 'bassA'], pad: 'pads', beat: 'grooveA2',
        brass: [null, { part: 'counter', vel: 0.8 }],
      },
    },
    B: {
      bars: 8, chords: '4 2 7 1 4 2 7 1', riser: 2, fill: 'fillB',
      play: { brass: 'bMelody', tremolo: 'tremolo', bass: 'bassRun', pad: 'pads', beat: 'grooveB', drone: 'drone' },
    },
    C: {
      bars: 8, chords: '1 2 7 1 1 2 7 1', crash: true, fill: 'fillA',
      play: {
        lead: { part: 'hook8', octave: 1 }, brass: 'hook8', stab: 'stabsHard', bass: 'bassDrive', pad: 'pads', beat: 'grooveC',
        lead2: [{ part: 'hook8', shift: 2, vel: 0.6 }, null],
      },
    },
    D: {
      bars: 4, chords: '1 1 2 1', riser: 1,
      play: { lead: 'hookFrag', drone: 'drone', wind: 'gust', pad: 'padsOpen', beat: 'breakBeat' },
    },
    A3: {
      bars: 8, chords: '1 2 7 1 1 2 7 1', crash: true, fill: 'fillA',
      play: { lead: 'hook8Orn', brass: 'counter', bass: 'bassA', pad: 'pads', beat: 'grooveA2', wind: 'gust' },
    },
    B2: {
      bars: 8, chords: '4 2 7 1 4 2 7 1', riser: 2, fill: 'fillB',
      play: {
        brass: 'bMelody', lead: { part: 'bMelody', octave: 1, vel: 0.85 }, tremolo: 'tremolo', bass: 'bassRun', pad: 'pads', beat: 'grooveC',
      },
    },
    C2: {
      bars: 8, chords: '1 2 7 1 1 2 7 1', crash: true, transpose: 2, fill: 'fillB',
      play: {
        lead: { part: 'hook8', octave: 1 }, brass: 'hook8', lead2: { part: 'hook8', shift: 2, vel: 0.65 }, stab: 'stabsHard',
        bass: 'bassDrive', pad: 'pads', beat: 'grooveC',
      },
    },
    // Overtime.
    otPickup: { bars: 1, chords: '1', riser: 1, play: { beat: 'otRoll', drone: 'drone' } },
    otA: {
      bars: 8, chords: '1 2 7 1 1 2 7 1', crash: true, fill: 'fillA',
      play: {
        lead: 'hook8', brass: { part: 'hook8', min: 0.5 }, bass: 'bassDrive', beat: 'otBeat',
        ostinato: { part: 'ostinato', max: 0.55 }, clash: { part: 'ostinatoClash', min: 0.55 },
        stab: { part: 'stabsHard', min: 0.3 }, pad: { part: 'pads', min: 0.7 },
      },
    },
    otB: {
      bars: 8, chords: '4 2 7 1 4 2 7 1', fill: 'fillB',
      play: {
        brass: 'bMelody', lead: { part: 'bMelody', octave: 1, min: 0.4 }, tremolo: 'tremolo', bass: 'bassDrive', beat: 'otBeat2',
        ostinato: { part: 'ostinato', max: 0.55 }, clash: { part: 'ostinatoClash', min: 0.55 }, pad: { part: 'pads', min: 0.6 },
      },
    },
    // Victory.
    vSting: {
      bars: 2, chords: '1 1', hit: { bar: 1, channel: 'boom' }, crash: false,
      play: { lead: { part: 'victoryLine', octave: 1 }, brass: 'victoryLine', pad: 'pads', beat: 'stingBeat', stab: { part: 'stabs', vel: 0.9 } },
    },
    vCalm: {
      bars: 8, chords: '1 7 4 1 1 7 4 1',
      play: { lead: { part: 'calmHook', vel: 0.75 }, pad: { part: 'pads', vel: 0.7 }, drone: 'drone', bass: { part: 'bassCalm', vel: 0.6 }, beat: 'calmBeat', wind: 'gust' },
    },
    // Defeat.
    dSting: {
      bars: 2, chords: '4 1',
      play: { lead: 'defeatLine', brass: { part: 'defeatLine', octave: -1, vel: 0.7 }, pad: 'pads', beat: 'defeatSting', drone: 'drone' },
    },
    dCalm: {
      bars: 8, chords: '1 6 4 1 1 6 7 1',
      play: { lead: { part: 'defeatCalm', vel: 0.65 }, pad: { part: 'pads', vel: 0.6 }, drone: 'drone', bass: { part: 'bassCalm', vel: 0.5 }, beat: 'defeatBeat', wind: 'gust' },
    },
    // Draw.
    drSting: {
      bars: 2, chords: '1sus4 1sus2',
      play: { lead: 'drawLine', brass: { part: 'drawLine', vel: 0.8 }, pad: 'padsOpen', beat: ['drawSting'], drone: 'drone', taiko: null },
      hit: { bar: 1, channel: 'taiko' },
    },
    drCalm: {
      bars: 8, chords: '1sus4 1sus2 4sus2 1sus4 1sus4 1sus2 2sus2 1sus4',
      play: { lead: { part: 'drawCalm', vel: 0.65 }, pad: { part: 'padsOpen', vel: 0.65 }, drone: 'drone', beat: 'drawBeat', wind: 'gust' },
    },
  },
  versions: {
    main: { once: ['intro'], loop: ['A1', 'A2', 'B', 'C', 'D', 'A3', 'B2', 'C2'] },
    overtime: {
      bpm: 154, transpose: 2, once: ['otPickup'], loop: ['otA', 'otB'],
      overtime: OVERTIME_LAYERS, lowpass: [1700, 18000],
    },
    victory: { bpm: 120, scale: 'mixolydian', once: ['vSting'], loop: ['vCalm'] },
    defeat: { bpm: 92, scale: 'phrygian', once: ['dSting'], loop: ['dCalm'], level: 0.9 },
    draw: { bpm: 108, once: ['drSting'], loop: ['drCalm'], level: 0.9 },
  },
};
