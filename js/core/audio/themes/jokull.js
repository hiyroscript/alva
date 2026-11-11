// Jökull: one great glacier over a frozen abyss, sections that break
// away, sudden blizzards, the aurora. Its theme is a Nordic epic in E
// Dorian (E F# G A B C# D) at 112 BPM: a horn section carries the hook
// over war drums, a low throat chant pulses on every bar, icy glass bells
// ring out high, a deep drone holds the floor, all in a cold, wide hall.
//
// The hook (four bars, eight with its answer), over Em, D, Em, A: E held,
// F# G and up to B; A G F# down to D; E F# G B C#; E D C# B, and on the
// eighth bar home to E. Overtime is a step up and darker (F# Aeolian),
// with ice cracking and blizzard gusts; Victory in E major; Defeat slowed
// in E Aeolian; Draw hangs on a suspended chord.

import { OVERTIME_CHANNELS, OVERTIME_LAYERS, HIT_CHANNELS } from './common.js';

const hookA = '>1:6 2:2 3:4 >5:4 | >4:6 3:2 2:4 >7,:4 | >1:6 2:2 3:4 >5:2 6:2';

export default {
  id: 'jokull',
  bpm: 112,
  tonic: 64,
  scale: 'dorian',
  level: 1,
  reverb: { seconds: 4.6, damp: 0.3, level: 1 },
  delay: { beats: 0.75, feedback: 0.3, level: 0.6 },
  channels: {
    horn: { synth: 'brass', octave: 0, gain: 0.62, pan: 0.05, reverb: 0.4, params: { level: 0.3, bright: 0.7, attack: 0.06, swell: 0.14, release: 0.25 } },
    horn2: { synth: 'brass', octave: -1, gain: 0.638, pan: -0.2, reverb: 0.45, params: { level: 0.28, bright: 0.6, attack: 0.08, swell: 0.16 } },
    chant: { synth: 'chant', octave: -2, gain: 0.306, pan: -0.05, reverb: 0.45, params: { level: 0.32 } },
    choir: { synth: 'choir', octave: -1, gain: 0.755, reverb: 0.55, pump: true, params: { level: 0.2, f1: 420, f2: 820, f3: 2400 } },
    strings: { synth: 'strings', octave: 0, gain: 0.617, pan: 0.15, reverb: 0.5, params: { level: 0.13, cutoff: 2800 } },
    glass: { tone: 'glass', octave: 1, gain: 0.158, pan: 0.32, reverb: 0.55, delay: 0.25, ring: true },
    drone: { synth: 'drone', octave: -2, gain: 0.176, reverb: 0.4, params: { cutoff: 340, level: 0.2, rate: 0.07 } },
    bass: { synth: 'bass', octave: -2, gain: 0.609, params: { wave: 'sawtooth', cutoff: 380, level: 0.34, decay: 0.3, sustain: 0.6 } },
    kick: { drum: 'kick', opts: { deep: true }, gain: 0.315, duck: 0.4 },
    snare: { drum: 'snare', gain: 0.535, reverb: 0.45 },
    taiko: { drum: 'taiko', gain: 0.201, reverb: 0.45 },
    tomLo: { drum: 'tom', opts: { tone: 0.65 }, gain: 0.163, pan: -0.25, reverb: 0.4 },
    tomHi: { drum: 'tom', opts: { tone: 0.95 }, gain: 0.285, pan: 0.25, reverb: 0.4 },
    frame: { drum: 'frame', gain: 0.389, reverb: 0.35 },
    shaker: { drum: 'shaker', gain: 0.311, pan: 0.3, reverb: 0.2 },
    ice: { drum: 'ice', gain: 0.401, pan: 0.2, reverb: 0.5 },
    blizzard: { synth: 'swell', gain: 1.23, pan: -0.2, reverb: 0.4, params: { level: 0.2 } },
    ...HIT_CHANNELS,
    ...OVERTIME_CHANNELS,
    // Its own levels for the shared channels.
    crash: { ...HIT_CHANNELS.crash, gain: 0.449 },
    riser: { ...OVERTIME_CHANNELS.riser, gain: 1.54 },
    tick: { ...OVERTIME_CHANNELS.tick, gain: 0.613 },
    tock: { ...OVERTIME_CHANNELS.tock, gain: 1.04 },
    pulse: { ...OVERTIME_CHANNELS.pulse, gain: 0.524 },
    tension: { ...OVERTIME_CHANNELS.tension, gain: 0.88 },
    boom: { ...HIT_CHANNELS.boom, gain: 0.85 },
  },
  parts: {
    hook8: { melody: `${hookA} | >8:6 7:2 6:4 >5:4 | ${hookA} | >3:4 2:4 >1:8` },
    bMelody: { melody: '>5:8 3:8 | >4:8 2:8 | >6:8 8:8 | >5:16 | >8:8 10:8 | >9:8 7:8 | >8:8 6:8 | >9:8 >12:8' },
    counter: { melody: '>5,:8 3,:8 | >6,:8 4,:8 | >5,:8 7,:8 | >6,:16 | >3,:8 5,:8 | >4,:8 6,:8 | >7,:8 5,:8 | >5,:16' },
    introLine: { melody: '.:16 | >1:12 .:4 | .:16 | >5:8 4:4 3:4' },
    hookFrag: { melody: '>1:6 2:2 3:4 >5:4 | .:16' },
    victoryLine: { melody: '>1:6 2:2 3:4 >5:4 | >8:16' },
    calmHook: { melody: '>1:6 2:2 3:4 >5:4 | .:16 | >4:6 3:2 2:4 >1:4 | .:16 | >5:6 6:2 7:4 >8:4 | .:16 | >7:4 6:4 >5:8 | .:16' },
    defeatLine: { melody: '>1:6 2:2 3:4 >5:4 | >4:4 3:4 2:4 >1:4' },
    defeatCalm: { melody: '>5:8 3:8 | >1:16 | .:16 | .:16 | >4:8 2:8 | >7,:16 | .:16 | .:16' },
    drawLine: { melody: '>1:6 2:2 3:4 >5:4 | .:16' },
    drawCalm: { melody: '>5:8 4:8 | >2:16 | .:16 | .:16 | >1:8 2:8 | >5:16 | .:16 | .:16' },
    bassWar: { line: '>R:4 R:2 R:2 >R:4 5:2 7,:2' },
    bassDrive: { line: '>R:2 R:2 8:2 R:2 >R:2 R:2 5:2 R:2' },
    bassCalm: { line: '>R:16' },
    bells: { line: 'R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2' },
    bellsSparse: { line: 'R:4 8:4 12:4 10:4' },
    pads: { chord: 16 },
    padsOpen: { chord: 16, open: true },
    hornStabs: { chord: 4, rhythm: 'X.......X...x...' },
    throat: { hold: 'R', len: 16, every: 16 },
    drone: { hold: 1, len: 32, every: 32 },
    gust: { hold: 1, len: 32, every: 32 },
    cracks: { hits: 'X.......x.....x.' },
    introBeat: { beat: { taiko: 'X...............', frame: '........x.......' } },
    war: { beat: { kick: 'X.........X.....', taiko: 'X.....X...X.....', snare: '........X.......', tomLo: '...x......x..x..', shaker: 'x.x.x.x.x.x.x.x.' } },
    war2: { beat: { kick: 'X.....x...X.....', taiko: 'X.....X...X...x.', snare: '........X.......', tomLo: '...x..x...x..x..', tomHi: '.............x..', shaker: 'xoxoxoxoxoxoxoxo' } },
    build: { beat: { kick: 'X...X...X...X...', taiko: 'X.....X.X.....X.', snare: '........X.......', tomLo: 'x..x..x...x..x..', tomHi: '..x.......x.....', shaker: 'xxxxxxxxxxxxxxxx' } },
    full: { beat: { kick: 'X...X...X...X...', snare: '....X.......X...', taiko: 'X.......X.......', tomLo: '...x......x..x..', shaker: 'xxxxxxxxxxxxxxxx' } },
    breakBeat: { beat: { frame: 'X.........x.....', shaker: '..o...o...o...o.' } },
    fill: { beat: { taiko: 'X.......X...X.X.', tomHi: '....x.x.........', tomLo: '........x.x.XXXX' } },
    fillBig: { beat: { taiko: 'X...X...X.X.XXXX', tomHi: 'x.x.x.x.........', tomLo: '........x.x.XXXX', snare: '............xxxx' } },
    otRoll: { beat: { taiko: 'X...X...X.X.XXXX', tomLo: 'x.x.x.x.xxxxXXXX' } },
    otBeat: { beat: { kick: 'X...X...X...X...', snare: '....X.......X...', taiko: 'X.......X.......', tomLo: '..x...x...x...x.', shaker: 'xxxxxxxxxxxxxxxx' } },
    otBeat2: { beat: { kick: 'X...X...X...X.x.', snare: '....X.......X...', taiko: 'X...X...X...X...', tomLo: '..x.x.x...x.x.x.', tomHi: '...x.......x....', shaker: 'xxxxxxxxxxxxxxxx' } },
    stingBeat: { beat: { taiko: 'X...X...X.X.XXXX', tomLo: '........x.x.XXXX', snare: '............xxxx' } },
    calmBeat: { beat: { frame: 'X...............', shaker: '......o.......o.' } },
    defeatSting: { beat: { taiko: 'X.......X.......' } },
    defeatBeat: { beat: { frame: 'X.....o.........' } },
    drawSting: { beat: { taiko: 'X..x..X...X..x..', frame: '....x.......x...', shaker: 'o.o.o.o.o.o.o.o.' } },
    drawBeat: { beat: { frame: 'X.......x.......', shaker: '....o.......o...' } },
  },
  sections: {
    intro: {
      bars: 4, chords: '1 7 1 4', riser: 2, fill: 'fill',
      play: { horn: 'introLine', drone: 'drone', chant: 'throat', glass: { part: 'bellsSparse', vel: 0.7 }, choir: 'padsOpen', beat: 'introBeat' },
    },
    A1: {
      bars: 8, chords: '1 7 1 4 1 7 1 1', crash: true, fill: 'fill',
      play: { horn: 'hook8', chant: 'throat', choir: 'pads', bass: 'bassWar', beat: 'war', glass: [{ part: 'bellsSparse', vel: 0.6 }, 'bells'] },
    },
    A2: {
      bars: 8, chords: '1 7 1 4 1 7 1 1', fill: 'fill',
      play: { horn: 'hook8', horn2: 'counter', chant: 'throat', choir: 'pads', bass: 'bassWar', beat: 'war2', glass: 'bells', strings: [null, { part: 'hook8', shift: 2, vel: 0.55 }] },
    },
    B: {
      bars: 8, chords: '3 7 4 1 3 7 4 5', riser: 2, fill: 'fillBig',
      play: { strings: 'bMelody', horn2: 'hornStabs', choir: 'pads', glass: 'bells', bass: 'bassDrive', beat: 'build', drone: 'drone' },
    },
    C: {
      bars: 8, chords: '1 7 1 4 1 7 1 1', crash: true, fill: 'fill',
      play: {
        horn: { part: 'hook8', octave: 1 }, horn2: 'hook8', strings: { part: 'hook8', shift: 2 }, chant: 'throat', choir: 'pads', glass: 'bells', bass: 'bassDrive', beat: 'full',
      },
    },
    D: {
      bars: 4, chords: '1 7 1 4', riser: 1,
      play: { horn: 'hookFrag', drone: 'drone', choir: 'padsOpen', glass: 'bellsSparse', beat: 'breakBeat', chant: 'throat' },
    },
    A3: {
      bars: 8, chords: '1 7 1 4 1 7 1 1', crash: true, fill: 'fill',
      play: { horn: 'hook8', strings: 'counter', chant: 'throat', choir: 'pads', bass: 'bassWar', beat: 'war2', glass: 'bells' },
    },
    B2: {
      bars: 8, chords: '3 7 4 1 3 7 4 5', riser: 2, fill: 'fillBig',
      play: { strings: 'bMelody', horn: { part: 'bMelody', vel: 0.75 }, horn2: 'hornStabs', choir: 'pads', glass: 'bells', bass: 'bassDrive', beat: 'full' },
    },
    C2: {
      bars: 8, chords: '1 7 1 4 1 7 1 1', crash: true, transpose: 2, fill: 'fillBig',
      play: {
        horn: { part: 'hook8', octave: 1 }, horn2: 'hook8', strings: { part: 'hook8', shift: 2 }, chant: 'throat', choir: 'pads', glass: 'bells', bass: 'bassDrive', beat: 'full',
      },
    },
    otPickup: { bars: 1, chords: '1', riser: 1, play: { beat: 'otRoll', drone: 'drone', ice: 'cracks' } },
    otA: {
      bars: 8, chords: '1 7 1 4 1 7 1 1', crash: true, fill: 'fill',
      play: {
        horn: 'hook8', chant: 'throat', bass: 'bassDrive', beat: 'otBeat', glass: 'bells', drone: 'drone',
        horn2: { part: 'hook8', min: 0.45 }, ice: { part: 'cracks', min: 0.25 }, blizzard: { part: 'gust', min: 0.15 }, choir: { part: 'pads', min: 0.6 },
      },
    },
    otB: {
      bars: 8, chords: '3 7 4 1 3 7 4 5', fill: 'fillBig',
      play: {
        strings: 'bMelody', horn: { part: 'bMelody', min: 0.5, vel: 0.8 }, horn2: 'hornStabs', bass: 'bassDrive', beat: 'otBeat2', glass: 'bells', chant: 'throat',
        ice: { part: 'cracks', min: 0.25 }, blizzard: { part: 'gust', min: 0.15 }, choir: { part: 'pads', min: 0.6 },
      },
    },
    vSting: {
      bars: 2, chords: '1 1', hit: { bar: 1, channel: 'boom' },
      play: { horn: 'victoryLine', horn2: { part: 'victoryLine', octave: -1 }, choir: 'pads', strings: 'pads', glass: 'bells', beat: 'stingBeat' },
    },
    vCalm: {
      bars: 8, chords: '1 4 5 1 1 4 7 1',
      play: { horn: { part: 'calmHook', vel: 0.55 }, choir: { part: 'pads', vel: 0.6 }, glass: { part: 'bellsSparse', vel: 0.5 }, drone: 'drone', beat: 'calmBeat' },
    },
    dSting: {
      bars: 2, chords: '4 1',
      play: { horn: 'defeatLine', horn2: { part: 'defeatLine', octave: -1, vel: 0.7 }, choir: 'pads', drone: 'drone', beat: 'defeatSting' },
    },
    dCalm: {
      bars: 8, chords: '1 6 4 1 1 6 7 1',
      play: { horn: { part: 'defeatCalm', vel: 0.5 }, choir: { part: 'pads', vel: 0.55 }, glass: { part: 'bellsSparse', vel: 0.35 }, drone: 'drone', beat: 'defeatBeat' },
    },
    drSting: {
      bars: 2, chords: '1sus2 1sus4', hit: { bar: 1, channel: 'taiko' },
      play: { horn: 'drawLine', choir: 'padsOpen', chant: 'throat', drone: 'drone', beat: 'drawSting' },
    },
    drCalm: {
      bars: 8, chords: '1sus2 7sus2 1sus4 4sus2 1sus2 7sus2 3sus2 1sus4',
      play: { horn: { part: 'drawCalm', vel: 0.5 }, choir: { part: 'padsOpen', vel: 0.6 }, glass: { part: 'bellsSparse', vel: 0.4 }, drone: 'drone', beat: 'drawBeat' },
    },
  },
  versions: {
    main: { once: ['intro'], loop: ['A1', 'A2', 'B', 'C', 'D', 'A3', 'B2', 'C2'] },
    overtime: { bpm: 129, transpose: 2, scale: 'aeolian', once: ['otPickup'], loop: ['otA', 'otB'], overtime: OVERTIME_LAYERS, lowpass: [1500, 18000] },
    victory: { bpm: 100, scale: 'ionian', once: ['vSting'], loop: ['vCalm'] },
    defeat: { bpm: 84, scale: 'aeolian', once: ['dSting'], loop: ['dCalm'], level: 1.27 },
    draw: { bpm: 96, once: ['drSting'], loop: ['drCalm'], level: 1.13 },
  },
};
