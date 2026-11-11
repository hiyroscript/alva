// Asperitas: one great cloud adrift high above the cloud sea, with
// drifting cloud platforms. Its theme soars: orchestral-electronic in D
// Lydian (the raised fourth, G#, its brightness) at 140 BPM, airy choir
// pads, celesta arpeggios, a harp, big taiko hits under a half-time beat
// that doubles for the climax, and a high flying lead.
//
// The hook (four bars, eight with its answer), over D, E, Bm, A: up from A
// to D, a turn through C#, out to E; down from the bright G# over E; up a
// Bm arpeggio to a high A; and down again to E, then home to D. Overtime
// moves it a step up into E Aeolian, darker; Victory keeps the Lydian
// light; Defeat sinks into D Aeolian; Draw leaves the G# hanging.

import { OVERTIME_CHANNELS, OVERTIME_LAYERS, HIT_CHANNELS } from './common.js';

const hookA = '>5:4 8:4 7:2 8:2 >9:4 | >11:6 10:2 9:4 8:4 | >6:4 8:4 9:2 10:2 >12:4';

export default {
  id: 'asperitas',
  bpm: 140,
  tonic: 62,
  scale: 'lydian',
  level: 1,
  reverb: { seconds: 3.4, damp: 0.4, level: 1 },
  delay: { beats: 0.75, feedback: 0.3, level: 0.7 },
  channels: {
    lead: { synth: 'lead', octave: 0, gain: 1.29, pan: 0.05, reverb: 0.35, delay: 0.22, params: { level: 0.2, wave: 'triangle', wave2: 'sawtooth', mix2: 0.25, cutoff: 5200, vibrato: 20, attack: 0.03 } },
    horn: { synth: 'brass', octave: -1, gain: 0.535, pan: -0.15, reverb: 0.4, params: { level: 0.26, bright: 0.75, attack: 0.05, swell: 0.12 } },
    choir: { synth: 'choir', octave: -1, gain: 0.976, reverb: 0.5, pump: true, params: { level: 0.2, f1: 750, f2: 1200 } },
    strings: { synth: 'strings', octave: 0, gain: 0.653, pan: 0.1, reverb: 0.45, params: { level: 0.13, cutoff: 3200 } },
    celesta: { tone: 'celesta', octave: 1, gain: 0.153, pan: 0.32, reverb: 0.4, delay: 0.3 },
    harp: { tone: 'harp', octave: 0, gain: 0.629, pan: -0.3, reverb: 0.45, strum: 0.035 },
    bass: { synth: 'bass', octave: -2, gain: 0.388, params: { wave: 'triangle', cutoff: 420, level: 0.4, decay: 0.3, sustain: 0.7, sub: 1 } },
    kick: { drum: 'kick', opts: { deep: true }, gain: 0.22, duck: 0.4 },
    snare: { drum: 'snare', gain: 0.368, reverb: 0.4 },
    hat: { drum: 'hat', gain: 0.339, pan: 0.25 },
    taiko: { drum: 'taiko', gain: 0.32, reverb: 0.4 },
    tomLo: { drum: 'tom', opts: { tone: 0.7 }, gain: 0.385, pan: -0.25, reverb: 0.4 },
    tomHi: { drum: 'tom', opts: { tone: 1.1 }, gain: 0.248, pan: 0.25, reverb: 0.4 },
    shaker: { drum: 'shaker', gain: 0.311, pan: -0.3 },
    ...HIT_CHANNELS,
    ...OVERTIME_CHANNELS,
    // Its own levels for the shared channels.
    crash: { ...HIT_CHANNELS.crash, gain: 0.449 },
    riser: { ...OVERTIME_CHANNELS.riser, gain: 1.52 },
    tick: { ...OVERTIME_CHANNELS.tick, gain: 0.475 },
    tock: { ...OVERTIME_CHANNELS.tock, gain: 0.944 },
    pulse: { ...OVERTIME_CHANNELS.pulse, gain: 0.501 },
    tension: { ...OVERTIME_CHANNELS.tension, gain: 0.88 },
    boom: { ...HIT_CHANNELS.boom, gain: 0.812 },
  },
  parts: {
    hook8: { melody: `${hookA} | >11:3 10:1 9:4 >9:8 | ${hookA} | >11:3 10:1 9:4 >8:8` },
    bMelody: { melody: '>6:8 8:8 | >9:8 11:8 | >10:8 8:8 | >9:12 7:4 | >6:4 8:4 10:4 12:4 | >13:8 11:8 | >12:8 10:8 | >11:4 12:4 >14:8' },
    counter: { melody: '>3:8 5:8 | >2:8 4:8 | >1:8 3:8 | >2:16 | >3:8 1:8 | >4:8 2:8 | >3:8 6,:8 | >7,:16' },
    introLine: { melody: '.:16 | >5:8 9:8 | >8:16 | .:8 >11:4 12:4' },
    hookFrag: { melody: '>5:4 8:4 7:2 8:2 >9:4 | .:16' },
    victoryLine: { melody: '>5:4 8:4 9:2 10:2 >12:4 | >15:16' },
    calmHook: { melody: '>5:4 8:4 7:2 8:2 >9:4 | .:16 | >11:8 10:4 9:4 | .:16 | >6:4 8:4 9:2 10:2 >12:4 | .:16 | >11:4 10:4 >8:8 | .:16' },
    defeatLine: { melody: '>5:4 8:4 7:2 8:2 >9:4 | >7:4 6:4 5:4 >1:4' },
    defeatCalm: { melody: '>5:8 4:8 | >3:16 | .:16 | .:16 | >6:8 5:8 | >1:16 | .:16 | .:16' },
    drawLine: { melody: '>5:4 8:4 7:2 8:2 >11:4 | .:16' },
    drawCalm: { melody: '>8:4 9:4 >11:8 | .:16 | >5:4 6:4 >4:8 | .:16' },
    bassHalf: { line: '>R:8 R:4 5:4' },
    bassDrive: { line: '>R:2 R:2 8:2 R:2 >R:2 R:2 5:2 8:2' },
    bassCalm: { line: '>R:16' },
    arp: { line: 'R:1 5:1 8:1 10:1 12:1 10:1 8:1 5:1 R:1 5:1 8:1 10:1 12:1 10:1 8:1 5:1' },
    arp8: { line: 'R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2' },
    harpRoll: { line: 'R:1 3:1 5:1 8:1 10:1 12:11' },
    pads: { chord: 16 },
    padsOpen: { chord: 16, open: true },
    swells: { chord: 8 },
    hornStabs: { chord: 4, rhythm: 'X.......x.......' },
    introBeat: { beat: { taiko: 'X...............', shaker: '....o.......o...' } },
    halfTime: { beat: { kick: 'X.........X.....', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.', taiko: 'X...............', shaker: 'o.o.o.o.o.o.o.o.' } },
    halfTime2: { beat: { kick: 'X.....x...X.....', snare: '........X.......', hat: 'xoxoxoxoxoxoxoxo', taiko: 'X.......x.......', tomLo: '..............x.' } },
    build: { beat: { kick: 'X...X...X...X...', snare: '........X.......', hat: 'xoxoxoxoxoxoxoxo', taiko: 'X.....X.X.......', tomLo: '...x......x..x..', shaker: 'xxxxxxxxxxxxxxxx' } },
    full: { beat: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xxxxxxxxxxxxxxxx', taiko: 'X.......X.......', shaker: 'o.o.o.o.o.o.o.o.' } },
    breakBeat: { beat: { taiko: 'X...............', tomLo: '........x.......', shaker: '..o...o...o...o.' } },
    fill: { beat: { taiko: 'X.......X...X.X.', tomHi: '....x.x.........', tomLo: '........x.x.x.x.', snare: '............xxxx' } },
    fillBig: { beat: { taiko: 'X...X...X.X.XXXX', tomHi: 'x.x.x.x.........', tomLo: '........x.x.x.x.', snare: '........xxxxXXXX', kick: 'X...X...X...X...' } },
    otRoll: { beat: { taiko: 'X...X...X.X.XXXX', snare: 'x.x.x.x.xxxxXXXX' } },
    otBeat: { beat: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xxxxxxxxxxxxxxxx', taiko: 'X.......X.......', tomLo: '......x.......x.' } },
    otBeat2: { beat: { kick: 'X...X...X...X.x.', snare: '....X.......X..x', hat: 'xxxxxxxxxxxxxxxx', taiko: 'X...X...X...X...', tomHi: '..x.......x.....', tomLo: '......x.......x.' } },
    stingBeat: { beat: { taiko: 'X...X...X.X.XXXX', tomLo: '........x.x.x.x.', snare: '........xxxxXXXX' } },
    calmBeat: { beat: { taiko: 'X...............', shaker: '......o.......o.' } },
    defeatSting: { beat: { taiko: 'X.......X.......' } },
    defeatBeat: { beat: { taiko: 'X...............' } },
    drawSting: { beat: { taiko: 'X..x..X...X..x..', tomLo: '....x.......x...', shaker: 'o.o.o.o.o.o.o.o.' } },
    drawBeat: { beat: { tomLo: 'X.......x.......', shaker: '....o.......o...' } },
  },
  sections: {
    intro: {
      bars: 4, chords: '1 2 6 5', riser: 2, fill: 'fill',
      play: { choir: 'padsOpen', celesta: { part: 'arp8', vel: 0.7 }, lead: 'introLine', beat: 'introBeat', harp: { part: 'harpRoll', vel: 0.8 } },
    },
    A1: {
      bars: 8, chords: '1 2 6 5 1 2 6 1', crash: true, fill: 'fill',
      play: { lead: 'hook8', choir: 'pads', celesta: 'arp', bass: 'bassHalf', beat: 'halfTime', harp: [null, { part: 'harpRoll', vel: 0.7 }] },
    },
    A2: {
      bars: 8, chords: '1 2 6 5 1 2 6 1', fill: 'fill',
      play: {
        lead: 'hook8', horn: 'counter', choir: 'pads', celesta: 'arp', bass: 'bassHalf', beat: 'halfTime2',
        strings: [{ part: 'hook8', shift: -2, octave: -1, vel: 0.6 }, null],
      },
    },
    B: {
      bars: 8, chords: '6 2 1 5 6 2 3 5', riser: 2, fill: 'fillBig',
      play: { strings: 'bMelody', horn: 'hornStabs', choir: 'pads', celesta: 'arp', bass: 'bassDrive', beat: 'build' },
    },
    C: {
      bars: 8, chords: '1 2 6 5 1 2 6 1', crash: true, fill: 'fill',
      play: {
        lead: { part: 'hook8', octave: 1 }, horn: 'hook8', strings: { part: 'hook8', shift: -2 }, choir: 'pads', celesta: 'arp',
        bass: 'bassDrive', beat: 'full',
      },
    },
    D: {
      bars: 4, chords: '1 2 6 5', riser: 1,
      play: { lead: 'hookFrag', choir: 'padsOpen', harp: 'harpRoll', beat: 'breakBeat', celesta: { part: 'arp8', vel: 0.6 } },
    },
    A3: {
      bars: 8, chords: '1 2 6 5 1 2 6 1', crash: true, fill: 'fill',
      play: { lead: 'hook8', strings: 'counter', choir: 'pads', celesta: 'arp', bass: 'bassDrive', beat: 'halfTime2', harp: 'harpRoll' },
    },
    B2: {
      bars: 8, chords: '6 2 1 5 6 2 3 5', riser: 2, fill: 'fillBig',
      play: { strings: 'bMelody', lead: { part: 'bMelody', vel: 0.75 }, horn: 'hornStabs', choir: 'pads', celesta: 'arp', bass: 'bassDrive', beat: 'full' },
    },
    C2: {
      bars: 8, chords: '1 2 6 5 1 2 6 1', crash: true, transpose: 2, fill: 'fillBig',
      play: {
        lead: { part: 'hook8', octave: 1 }, horn: 'hook8', strings: { part: 'hook8', shift: -2 }, choir: 'pads', celesta: 'arp',
        bass: 'bassDrive', beat: 'full', harp: 'harpRoll',
      },
    },
    otPickup: { bars: 1, chords: '1', riser: 1, play: { beat: 'otRoll', choir: 'padsOpen' } },
    otA: {
      bars: 8, chords: '1 7 6 5 1 7 6 1', crash: true, fill: 'fill',
      play: {
        lead: 'hook8', horn: { part: 'hook8', min: 0.45 }, celesta: 'arp', bass: 'bassDrive', beat: 'otBeat',
        choir: { part: 'pads', min: 0.25 }, strings: { part: 'hook8', shift: -2, min: 0.7 },
      },
    },
    otB: {
      bars: 8, chords: '6 7 1 5 6 7 3 5', fill: 'fillBig',
      play: {
        strings: 'bMelody', lead: { part: 'bMelody', min: 0.5, vel: 0.8 }, horn: 'hornStabs', celesta: 'arp', bass: 'bassDrive', beat: 'otBeat2',
        choir: { part: 'pads', min: 0.25 },
      },
    },
    vSting: {
      bars: 2, chords: '1 1', hit: { bar: 1, channel: 'boom' },
      play: { lead: 'victoryLine', horn: { part: 'victoryLine', octave: -1 }, choir: 'pads', strings: 'pads', beat: 'stingBeat', harp: 'harpRoll' },
    },
    vCalm: {
      bars: 8, chords: '1 2 6 5 1 2 4 1',
      play: { lead: { part: 'calmHook', vel: 0.55 }, choir: { part: 'pads', vel: 0.65 }, celesta: { part: 'arp8', vel: 0.5 }, harp: { part: 'harpRoll', vel: 0.5 }, beat: 'calmBeat', bass: { part: 'bassCalm', vel: 0.5 } },
    },
    dSting: {
      bars: 2, chords: '6 1',
      play: { lead: 'defeatLine', horn: { part: 'defeatLine', octave: -1, vel: 0.7 }, choir: 'pads', beat: 'defeatSting' },
    },
    dCalm: {
      bars: 8, chords: '1 6 4 1 1 6 7 1',
      play: { lead: { part: 'defeatCalm', vel: 0.5 }, choir: { part: 'pads', vel: 0.6 }, celesta: { part: 'arp8', vel: 0.3 }, beat: 'defeatBeat', bass: { part: 'bassCalm', vel: 0.45 } },
    },
    drSting: {
      bars: 2, chords: '1sus2 2sus4', hit: { bar: 1, channel: 'taiko' },
      play: { lead: 'drawLine', choir: 'padsOpen', strings: { part: 'drawLine', octave: -1, vel: 0.6 }, beat: 'drawSting' },
    },
    drCalm: {
      bars: 8, chords: '1sus2 2sus2 1sus4 5sus2 1sus2 2sus2 6sus4 5sus4',
      play: { lead: { part: 'drawCalm', vel: 0.5 }, choir: { part: 'padsOpen', vel: 0.6 }, celesta: { part: 'arp8', vel: 0.4 }, beat: 'drawBeat' },
    },
  },
  versions: {
    main: { once: ['intro'], loop: ['A1', 'A2', 'B', 'C', 'D', 'A3', 'B2', 'C2'] },
    overtime: { bpm: 160, transpose: 2, scale: 'aeolian', once: ['otPickup'], loop: ['otA', 'otB'], overtime: OVERTIME_LAYERS, lowpass: [1900, 18000] },
    victory: { bpm: 120, scale: 'lydian', once: ['vSting'], loop: ['vCalm'] },
    defeat: { bpm: 92, scale: 'aeolian', once: ['dSting'], loop: ['dCalm'], level: 1.13 },
    draw: { bpm: 108, once: ['drSting'], loop: ['drCalm'], level: 0.9 },
  },
};
