// Adamaris: a tropical beach under a volcano that throws rocks onto the
// sand. Its theme is an island epic in A Mixolydian (A B C# D E F# G) at
// 126 BPM with a little swing: a steel-pan hook in the tresillo's 3-3-2, a
// marimba, a tremolo-picked surf guitar with a spring-like echo, tribal
// toms and a log drum's son clave, all over a rumbling, overdriven
// volcanic low end.
//
// The hook (four bars, eight with its answer), over A, G, D, Em: E E F# E
// C# A in 3-3-2; D D E D B G; F# F# A F# E D; C# D C# B, and on the
// eighth bar home to A. Overtime brings the volcano forward (a step up in
// B Dorian, sub rumbles and erupting drums); Victory in A major; Defeat
// slowed in A minor; Draw hangs on a suspended chord.

import { OVERTIME_CHANNELS, OVERTIME_LAYERS, HIT_CHANNELS } from './common.js';

const hookA = '>5:3 5:3 6:2 >5:3 3:3 1:2 | >4:3 4:3 5:2 >4:3 2:3 7,:2 | >6:3 6:3 8:2 >6:3 5:3 4:2';

export default {
  id: 'adamaris',
  bpm: 126,
  tonic: 69,
  scale: 'mixolydian',
  swing: 0.1,
  level: 1,
  reverb: { seconds: 2.2, damp: 0.5, level: 0.85 },
  delay: { beats: 0.5, feedback: 0.36, level: 0.8 },
  channels: {
    steel: { tone: 'steel', octave: 0, gain: 0.396, pan: 0.12, reverb: 0.25, delay: 0.14 },
    steel2: { tone: 'steel', octave: 1, gain: 0.353, pan: -0.35, reverb: 0.3, delay: 0.2 },
    marimba: { tone: 'marimba', octave: -1, gain: 0.182, pan: -0.22, reverb: 0.22 },
    guitar: { tone: 'guitar', octave: 0, gain: 1.52, pan: 0.3, reverb: 0.45, delay: 0.3 },
    brass: { synth: 'brass', octave: -1, gain: 0.437, pan: -0.1, reverb: 0.3, params: { level: 0.28, bright: 1.1 } },
    pad: { synth: 'pad', octave: -1, gain: 0.7, reverb: 0.35, pump: true, params: { level: 0.13, cutoff: 1600, wave: 'sawtooth' } },
    bass: { synth: 'bass', octave: -2, gain: 0.51, params: { cutoff: 320, level: 0.36, decay: 0.2, sustain: 0.55, drive: 2.2, wave: 'sawtooth' } },
    kick: { drum: 'kick', opts: { deep: true }, gain: 0.268, duck: 0.45 },
    clap: { drum: 'clap', gain: 0.656, reverb: 0.25 },
    log: { drum: 'log', gain: 0.412, pan: 0.28, reverb: 0.15 },
    conga: { drum: 'log', opts: { tone: 0.6 }, gain: 0.426, pan: -0.28, reverb: 0.15 },
    shaker: { drum: 'shaker', gain: 0.424, pan: -0.35 },
    tomHi: { drum: 'tom', opts: { tone: 1.25 }, gain: 0.138, pan: 0.25, reverb: 0.25 },
    tomLo: { drum: 'tom', opts: { tone: 0.75 }, gain: 0.156, pan: -0.25, reverb: 0.25 },
    taiko: { drum: 'taiko', gain: 0.299, reverb: 0.3 },
    rumble: { synth: 'swell', gain: 1.03, params: { kind: 'rumble', level: 0.35 } },
    ...HIT_CHANNELS,
    ...OVERTIME_CHANNELS,
    // Its own levels for the shared channels.
    crash: { ...HIT_CHANNELS.crash, gain: 0.449 },
    riser: { ...OVERTIME_CHANNELS.riser, gain: 1.44 },
    tick: { ...OVERTIME_CHANNELS.tick, gain: 0.592 },
    tock: { ...OVERTIME_CHANNELS.tock, gain: 1.04 },
    pulse: { ...OVERTIME_CHANNELS.pulse, gain: 0.53 },
    tension: { ...OVERTIME_CHANNELS.tension, gain: 0.91 },
    boom: { ...HIT_CHANNELS.boom, gain: 0.812 },
  },
  parts: {
    hook8: { melody: `${hookA} | >3:3 4:3 3:2 >2:8 | ${hookA} | >3:3 2:3 3:2 >1:8` },
    surf: { melody: '>8:8 6:4 5:4 | >4:8 6:8 | >5:8 3:4 1:4 | >3:8 5:8 | >8:8 9:4 10:4 | >11:8 10:4 8:4 | >9:8 8:4 7:4 | >9:4 10:4 >12:8' },
    counter: { melody: '>3:8 1:8 | >2:8 7,:8 | >4:8 6,:8 | >5,:16 | >3:8 5:8 | >4:8 2:8 | >6:8 4:8 | >3:16' },
    introLine: { melody: '.:16 | >5:3 5:3 6:2 >5:8 | .:16 | >4:3 4:3 5:2 >5:8' },
    hookFrag: { melody: '>5:3 5:3 6:2 >5:3 3:3 1:2 | .:16' },
    victoryLine: { melody: '>5:3 5:3 6:2 >5:3 3:3 5:2 | >8:16' },
    calmHook: { melody: '>5:3 5:3 6:2 >5:8 | .:16 | >4:3 4:3 5:2 >4:8 | .:16 | >6:3 6:3 8:2 >6:8 | .:16 | >3:3 2:3 3:2 >1:8 | .:16' },
    defeatLine: { melody: '>5:3 5:3 6:2 >5:3 3:3 1:2 | >3:4 2:4 1:4 >7,:4' },
    defeatCalm: { melody: '>5:8 3:8 | >1:16 | .:16 | .:16 | >4:8 3:8 | >2:16 | .:16 | .:16' },
    drawLine: { melody: '>5:3 5:3 6:2 >5:3 3:3 2:2 | .:16' },
    drawCalm: { melody: '>5:3 5:3 6:2 >2:8 | .:16 | >4:3 4:3 5:2 >2:8 | .:16' },
    bassTres: { line: '>R:3 R:3 5:2 >R:3 8:3 5:2' },
    bassDrive: { line: '>R:2 R:1 8:1 R:2 5:2 >R:2 R:1 8:1 5:2 7:2' },
    bassCalm: { line: '>R:16' },
    marimbaArp: { line: 'R:2 5:2 8:2 5:2 10:2 8:2 5:2 8:2' },
    marimba16: { line: 'R:1 5:1 8:1 10:1 8:1 5:1 R:1 5:1 8:1 10:1 12:1 10:1 8:1 5:1 8:1 10:1' },
    pads: { chord: 16 },
    padsOpen: { chord: 16, open: true },
    brassStabs: { chord: 2, rhythm: 'X..x..x...x.x...' },
    lava: { hold: 1, len: 32, every: 32 },
    introBeat: { beat: { log: 'x..x..x...x.x...', shaker: 'o.o.o.o.o.o.o.o.' } },
    beatA: { beat: { kick: 'X..X..X.X..X..X.', clap: '....X.......X...', log: 'x..x..x...x.x...', shaker: 'x.xxx.xxx.xxx.xx', conga: '......x.......x.' } },
    beatA2: { beat: { kick: 'X..X..X.X..X..X.', clap: '....X.......X...', log: 'x..x..x...x.x...', shaker: 'xxxxxxxxxxxxxxxx', conga: '..x...x...x.x.x.', tomLo: '..............x.' } },
    tribal: { beat: { kick: 'X...X...X...X...', tomHi: 'x.x..x.x..x.x.x.', tomLo: 'X...x..X..x.X...', shaker: 'xxxxxxxxxxxxxxxx', log: 'x..x..x...x.x...' } },
    full: { beat: { kick: 'X...X...X...X...', clap: '....X.......X...', log: 'x..x..x...x.x...', shaker: 'xxxxxxxxxxxxxxxx', tomLo: 'X......X..X.....', taiko: 'X.......X.......' } },
    breakBeat: { beat: { log: 'x..x..x...x.x...', conga: '......x.......x.' } },
    fill: { beat: { kick: 'X.......X.......', tomHi: 'x.x.x.x.........', tomLo: '........x.x.XXXX', clap: '....x...........' } },
    fillBig: { beat: { kick: 'X...X...X.X.XXXX', tomHi: 'x.x.x.x.x.x.....', tomLo: '........x.x.XXXX', taiko: 'X.......X...X.X.' } },
    otRoll: { beat: { tomLo: 'X.x.X.x.XxXxXXXX', taiko: 'X.......X...X.X.' } },
    otBeat: { beat: { kick: 'X...X...X...X...', clap: '....X.......X...', log: 'x..x..x...x.x...', shaker: 'xxxxxxxxxxxxxxxx', tomLo: 'X..X..X.........' } },
    eruption: { beat: { tomLo: 'XxxxXxxx....XXXX', tomHi: '........xxxx....', taiko: 'X.......X.......' } },
    stingBeat: { beat: { tomHi: 'x.x.x.x.x.x.....', tomLo: '........x.x.XXXX', taiko: 'X.......X...X.X.', shaker: 'xxxxxxxxxxxxxxxx' } },
    calmBeat: { beat: { log: 'x..x..x...x.x...', shaker: '....o.......o...' } },
    defeatSting: { beat: { tomLo: 'X.......X.......', conga: '....x.......x...' } },
    defeatBeat: { beat: { conga: 'X.......x.......' } },
    drawSting: { beat: { tomLo: 'X..x..X...x.x...', log: 'x..x..x...x.x...', shaker: 'o.o.o.o.o.o.o.o.' } },
    drawBeat: { beat: { log: 'x.....x.........', shaker: '....o.......o...' } },
  },
  sections: {
    intro: {
      bars: 4, chords: '1 7 4 5', riser: 2, fill: 'fill',
      play: { steel: 'introLine', marimba: { part: 'marimbaArp', vel: 0.7 }, pad: 'padsOpen', beat: 'introBeat', rumble: 'lava' },
    },
    A1: {
      bars: 8, chords: '1 7 4 5 1 7 4 1', crash: true, fill: 'fill',
      play: { steel: 'hook8', marimba: 'marimbaArp', bass: 'bassTres', pad: 'pads', beat: 'beatA', steel2: [null, { part: 'hook8', shift: 2, octave: -1, vel: 0.6 }] },
    },
    A2: {
      bars: 8, chords: '1 7 4 5 1 7 4 1', fill: 'fill',
      play: { steel: 'hook8', brass: 'brassStabs', marimba: 'marimba16', bass: 'bassTres', pad: 'pads', beat: 'beatA2', guitar: [{ part: 'counter', vel: 0.8 }, null] },
    },
    B: {
      bars: 8, chords: '4 4 1 1 4 4 5 5', riser: 2, fill: 'fillBig',
      play: { guitar: { part: 'surf', repeat: 1 }, marimba: 'marimba16', bass: 'bassDrive', pad: 'pads', beat: 'tribal', rumble: 'lava' },
    },
    C: {
      bars: 8, chords: '1 7 4 5 1 7 4 1', crash: true, fill: 'fill',
      play: {
        steel: 'hook8', steel2: { part: 'hook8', vel: 0.7 }, brass: 'hook8', marimba: 'marimba16', bass: 'bassDrive', pad: 'pads', beat: 'full',
      },
    },
    D: {
      bars: 4, chords: '1 7 4 5', riser: 1,
      play: { steel: 'hookFrag', marimba: { part: 'marimbaArp', vel: 0.6 }, pad: 'padsOpen', beat: 'breakBeat', rumble: 'lava' },
    },
    A3: {
      bars: 8, chords: '1 7 4 5 1 7 4 1', crash: true, fill: 'fill',
      play: { steel: 'hook8', guitar: { part: 'counter', repeat: 2, vel: 0.8 }, marimba: 'marimbaArp', bass: 'bassTres', pad: 'pads', beat: 'beatA2' },
    },
    B2: {
      bars: 8, chords: '4 4 1 1 4 4 5 5', riser: 2, fill: 'fillBig',
      play: { guitar: { part: 'surf', repeat: 1 }, steel: { part: 'surf', octave: -1, vel: 0.75 }, marimba: 'marimba16', bass: 'bassDrive', pad: 'pads', beat: 'full', rumble: 'lava' },
    },
    C2: {
      bars: 8, chords: '1 7 4 5 1 7 4 1', crash: true, transpose: 2, fill: 'fillBig',
      play: {
        steel: 'hook8', steel2: { part: 'hook8', shift: 2, vel: 0.6 }, brass: 'hook8', marimba: 'marimba16', bass: 'bassDrive', pad: 'pads', beat: 'full',
      },
    },
    otPickup: { bars: 1, chords: '1', riser: 1, play: { beat: 'otRoll', rumble: 'lava' } },
    otA: {
      bars: 8, chords: '1 7 4 5 1 7 4 1', crash: true, fill: 'fillBig',
      play: {
        steel: 'hook8', marimba: 'marimba16', bass: 'bassDrive', beat: 'otBeat', rumble: 'lava',
        brass: { part: 'hook8', min: 0.4 }, taiko: { part: 'eruption', min: 0.55 }, pad: { part: 'pads', min: 0.6 },
      },
    },
    otB: {
      bars: 8, chords: '4 4 1 1 4 4 5 5', fill: 'fillBig',
      play: {
        guitar: { part: 'surf', repeat: 1 }, steel: { part: 'surf', octave: -1, min: 0.5 }, marimba: 'marimba16', bass: 'bassDrive', beat: 'tribal', rumble: 'lava',
        brass: { part: 'brassStabs', min: 0.3 }, taiko: { part: 'eruption', min: 0.55 },
      },
    },
    vSting: {
      bars: 2, chords: '1 1', hit: { bar: 1, channel: 'boom' },
      play: { steel: 'victoryLine', brass: 'victoryLine', marimba: 'marimba16', pad: 'pads', beat: 'stingBeat' },
    },
    vCalm: {
      bars: 8, chords: '1 4 5 1 1 4 5 1',
      play: { steel: { part: 'calmHook', vel: 0.65 }, marimba: { part: 'marimbaArp', vel: 0.55 }, pad: { part: 'pads', vel: 0.6 }, bass: { part: 'bassCalm', vel: 0.5 }, beat: 'calmBeat' },
    },
    dSting: {
      bars: 2, chords: '1 5',
      play: { steel: 'defeatLine', marimba: { part: 'defeatLine', octave: -1, vel: 0.7 }, pad: 'pads', beat: 'defeatSting', rumble: 'lava' },
    },
    dCalm: {
      bars: 8, chords: '1 6 4 5 1 6 7 1',
      play: { steel: { part: 'defeatCalm', vel: 0.55 }, marimba: { part: 'marimbaArp', vel: 0.35 }, pad: { part: 'pads', vel: 0.55 }, bass: { part: 'bassCalm', vel: 0.45 }, beat: 'defeatBeat' },
    },
    drSting: {
      bars: 2, chords: '1sus2 7sus2', hit: { bar: 1, channel: 'taiko' },
      play: { steel: 'drawLine', marimba: { part: 'drawLine', octave: -1, vel: 0.7 }, pad: 'padsOpen', beat: 'drawSting' },
    },
    drCalm: {
      bars: 8, chords: '1sus2 7sus2 4sus2 1sus4 1sus2 7sus2 4sus2 5sus4',
      play: { steel: { part: 'drawCalm', vel: 0.55 }, marimba: { part: 'marimbaArp', vel: 0.4 }, pad: { part: 'padsOpen', vel: 0.6 }, beat: 'drawBeat' },
    },
  },
  versions: {
    main: { once: ['intro'], loop: ['A1', 'A2', 'B', 'C', 'D', 'A3', 'B2', 'C2'] },
    overtime: { bpm: 145, transpose: 2, scale: 'dorian', once: ['otPickup'], loop: ['otA', 'otB'], overtime: OVERTIME_LAYERS, lowpass: [1600, 18000] },
    victory: { bpm: 116, scale: 'ionian', once: ['vSting'], loop: ['vCalm'] },
    defeat: { bpm: 90, scale: 'aeolian', once: ['dSting'], loop: ['dCalm'], level: 1.43 },
    draw: { bpm: 104, once: ['drSting'], loop: ['drCalm'], level: 1.8 },
  },
};
