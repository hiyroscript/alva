// Sol-Noir (map id `city`): a rooftop block over the street canyon at
// night, supertall towers, blinking aviation lights. Its theme is dark
// synthwave, cyber-noir, in F minor (Aeolian) at 124 BPM: gated drums, a
// driving arpeggiated bass, a glassy pluck arpeggio, a neon lead, and the
// hook on a brass stab section, punched out on the off-beats.
//
// The hook (four bars, eight with its answer), over Fm, Db, Ab, Eb: C C, a
// jump to F, Eb C, a long Ab; then rising from Ab to C over Db; again a
// step higher over Ab; G F Eb C over Eb, and on the eighth bar home to F.
// Overtime is a step up in G Phrygian with sirens sweeping over it; Victory
// in F major; Defeat slowed in F Phrygian; Draw hangs on a suspended chord.

import { OVERTIME_CHANNELS, OVERTIME_LAYERS, HIT_CHANNELS } from './common.js';

const hookA = '>5:2 5:1 .:1 >8:2 .:2 7:2 5:2 >3:4 | .:2 3:2 4:2 >5:4 4:2 3:2 1:2 | >5:2 5:1 .:1 >8:2 .:2 9:2 8:2 >10:4';

export default {
  id: 'city',
  bpm: 124,
  tonic: 65,
  scale: 'aeolian',
  level: 1,
  reverb: { seconds: 2.2, damp: 0.4, level: 0.85 },
  delay: { beats: 0.75, feedback: 0.4, level: 0.85 },
  channels: {
    stab: { synth: 'brass', octave: 0, gain: 0.95, pan: 0.1, reverb: 0.25, delay: 0.12, params: { stab: true, level: 0.3, bright: 1.25, release: 0.1 } },
    stabLow: { synth: 'brass', octave: -1, gain: 0.6, pan: -0.15, reverb: 0.2, params: { stab: true, level: 0.28, bright: 1 } },
    lead: { synth: 'lead', octave: 0, gain: 0.85, pan: -0.08, reverb: 0.28, delay: 0.32, glide: true, params: { level: 0.22, cutoff: 3600, vibrato: 18, wave: 'sawtooth', wave2: 'square', detune: 8 } },
    arp: { tone: 'pluck', octave: 1, gain: 0.5, pan: 0.28, reverb: 0.2, delay: 0.38 },
    pad: { synth: 'pad', octave: -1, gain: 0.85, reverb: 0.4, pump: true, params: { level: 0.15, cutoff: 1100, attack: 0.4, release: 0.8, detune: 13 } },
    bass: { synth: 'bass', octave: -2, gain: 0.95, params: { cutoff: 720, level: 0.34, decay: 0.11, sustain: 0.35, snap: 0.05, q: 4 } },
    kick: { drum: 'kick', opts: { punch: 1.4 }, gain: 0.85, duck: 0.6 },
    snare: { drum: 'snare', opts: { gated: true }, gain: 0.55, reverb: 0.3 },
    clap: { drum: 'clap', gain: 0.32, pan: 0.05, reverb: 0.35 },
    hat: { drum: 'hat', gain: 0.32, pan: 0.22 },
    ohat: { drum: 'hat', opts: { open: true }, gain: 0.22, pan: -0.2 },
    tomHi: { drum: 'tom', opts: { tone: 1.3 }, gain: 0.5, pan: 0.3, reverb: 0.35 },
    tomLo: { drum: 'tom', opts: { tone: 0.85 }, gain: 0.55, pan: -0.3, reverb: 0.35 },
    siren: { synth: 'siren', octave: 0, gain: 0.8, pan: 0.2, reverb: 0.45, delay: 0.2, params: { level: 0.07, cycles: 2 } },
    ...HIT_CHANNELS,
    ...OVERTIME_CHANNELS,
  },
  parts: {
    hook8: { melody: `${hookA} | >9:6 8:2 7:4 5:4 | ${hookA} | >9:4 8:2 7:2 >8:8` },
    leadB: {
      melody: '>4:6 5:2 6:4 8:4 | >8:6 6:2 5:4 3:4 | >3:6 5:2 7:4 8:4 | >9:8 7:4 5:4 | '
        + '>4:6 5:2 6:4 8:4 | >8:6 6:2 5:4 3:4 | >7:6 8:2 9:4 10:4 | >11:8 9:4 7:4',
    },
    leadIntro: { melody: '.:16 | .:8 >5:4 4:2 3:2 | >1:16 | .:8 >3:2 4:2 >5:4' },
    hookFrag: { melody: '>5:2 5:1 .:1 >8:2 .:2 7:2 5:2 >3:4 | .:16' },
    victoryLine: { melody: '>5:2 5:1 .:1 >8:2 .:2 9:2 10:2 >12:4 | >8:16' },
    calmHook: { melody: '>5:4 8:4 7:4 5:4 | >3:16 | .:16 | .:16 | >5:4 8:4 9:4 10:4 | >8:16 | .:16 | .:16' },
    defeatLine: { melody: '>5:2 5:1 .:1 >8:2 .:2 7:2 5:2 >3:4 | >2:4 1:4 7,:4 >1:4' },
    defeatCalm: { melody: '>5:8 3:8 | >2:16 | .:16 | .:16 | >3:8 2:8 | >1:16 | .:16 | .:16' },
    drawLine: { melody: '>5:2 5:1 .:1 >8:2 .:2 7:2 >5:6 | .:16' },
    drawCalm: { melody: '>5:4 8:4 7:8 | .:16 | >4:4 5:4 >2:8 | .:16' },
    bassDrive: { line: '>R:2 8:2 R:2 8:2 R:2 8:2 R:2 8:2' },
    bassArp: { line: '>R:1 R:1 8:1 R:1 5:1 R:1 8:1 R:1 >R:1 R:1 8:1 R:1 5:1 7:1 8:1 5:1' },
    bassHalf: { line: '>R:6 R:2 .:4 8:2 5:2' },
    bassCalm: { line: '>R:16' },
    arp16: { line: 'R:1 3:1 5:1 8:1 10:1 8:1 5:1 3:1 R:1 3:1 5:1 8:1 10:1 12:1 10:1 8:1' },
    arp8: { line: 'R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2' },
    pads: { chord: 16 },
    padsOpen: { chord: 16, open: true },
    stabs: { chord: 2, rhythm: '..X...x...X...x.' },
    sirenSweep: { hold: 5, len: 32, every: 32 },
    introBeat: { beat: { kick: 'X...............', hat: 'x.x.x.x.x.x.x.x.' } },
    beatA: { beat: { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x.o.x.o.x.o.x.oo', ohat: '..............x.' } },
    beatA2: { beat: { kick: 'X.....x.X.x.....', snare: '....X.......X...', clap: '....X.......X...', hat: 'xoxoxoxoxoxoxoxo', ohat: '......x.......x.' } },
    beatB: { beat: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xoxoxoxoxoxoxoxo', ohat: '..x...x...x...x.' } },
    beatC: { beat: { kick: 'X...X...X...X.x.', snare: '....X.......X...', clap: '....X.......X...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.' } },
    breakBeat: { beat: { kick: 'X.......X.......', hat: '..o...o...o...o.' } },
    fill: { beat: { kick: 'X.......X.......', snare: '....X...xxxxXXXX', tomHi: '........X.X.....', tomLo: '............X.X.' } },
    fillBig: { beat: { kick: 'X...X...X.X.XXXX', snare: 'x.x.x.x.xxxxXXXX', tomHi: 'X.X.X.X.........', tomLo: '........X.X.X.X.' } },
    otRoll: { beat: { snare: 'x.x.x.x.xxxxXXXX', tomLo: 'X...X...X...X.X.', kick: 'X...X...X...X...' } },
    otBeat: { beat: { kick: 'X...X...X...X...', snare: '....X.......X...', clap: '....X.......X...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.' } },
    otBeat2: { beat: { kick: 'X...X...X..xX.x.', snare: '....X.......X...', clap: '....X..x....X...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', tomLo: '..............X.' } },
    stingBeat: { beat: { snare: 'x.x.x.x.xxxxXXXX', tomHi: 'X...X...........', tomLo: '........X...X.X.', kick: 'X.......X.......' } },
    calmBeat: { beat: { kick: 'X...............', hat: '....o.......o...' } },
    defeatSting: { beat: { kick: 'X.......X.......', snare: '........X.......' } },
    defeatBeat: { beat: { kick: 'X...............' } },
    drawSting: { beat: { kick: 'X.....x.X.......', snare: '....X.......x...', hat: 'x.x.x.x.x.x.x.x.' } },
    drawBeat: { beat: { kick: 'X.......x.......', hat: '..o...o...o...o.' } },
  },
  sections: {
    intro: {
      bars: 4, chords: '1 6 3 7', riser: 2, fill: 'fill',
      play: { lead: 'leadIntro', pad: 'padsOpen', bass: 'bassHalf', arp: { part: 'arp8', vel: 0.7 }, beat: 'introBeat' },
    },
    A1: {
      bars: 8, chords: '1 6 3 7 1 6 3 7', crash: true, fill: 'fill',
      play: { stab: 'hook8', stabLow: [null, 'hook8'], bass: 'bassDrive', pad: 'pads', beat: 'beatA', arp: [null, { part: 'arp8', vel: 0.6 }] },
    },
    A2: {
      bars: 8, chords: '1 6 3 7 1 6 3 7', fill: 'fill',
      play: { stab: 'hook8', stabLow: 'hook8', lead: [{ part: 'hook8', octave: 1, vel: 0.6 }, null], bass: 'bassArp', pad: 'pads', beat: 'beatA2', arp: 'arp16' },
    },
    B: {
      bars: 8, chords: '4 6 3 7 4 6 7 7', riser: 2, fill: 'fillBig',
      play: { lead: 'leadB', bass: 'bassArp', pad: 'pads', beat: 'beatB', arp: 'arp16', stabLow: 'stabs' },
    },
    C: {
      bars: 8, chords: '1 6 3 7 1 6 3 7', crash: true, fill: 'fill',
      play: {
        stab: 'hook8', stabLow: 'hook8', lead: { part: 'hook8', octave: 1 }, bass: 'bassArp', pad: 'pads', beat: 'beatC', arp: 'arp16',
      },
    },
    D: {
      bars: 4, chords: '1 6 3 7', riser: 1,
      play: { lead: 'hookFrag', pad: 'padsOpen', bass: 'bassHalf', beat: 'breakBeat', arp: { part: 'arp8', vel: 0.6 } },
    },
    A3: {
      bars: 8, chords: '1 6 3 7 1 6 3 7', crash: true, fill: 'fill',
      play: { stab: 'hook8', lead: { part: 'hook8', shift: 2, vel: 0.55 }, bass: 'bassDrive', pad: 'pads', beat: 'beatA2', arp: 'arp16' },
    },
    B2: {
      bars: 8, chords: '4 6 3 7 4 6 7 7', riser: 2, fill: 'fillBig',
      play: { lead: 'leadB', stab: { part: 'leadB', octave: -1, vel: 0.7 }, bass: 'bassArp', pad: 'pads', beat: 'beatC', arp: 'arp16' },
    },
    C2: {
      bars: 8, chords: '1 6 3 7 1 6 3 7', crash: true, transpose: 2, fill: 'fillBig',
      play: {
        stab: 'hook8', stabLow: 'hook8', lead: { part: 'hook8', octave: 1 }, bass: 'bassArp', pad: 'pads', beat: 'beatC', arp: 'arp16',
      },
    },
    otPickup: { bars: 1, chords: '1', riser: 1, play: { beat: 'otRoll', pad: 'padsOpen' } },
    otA: {
      bars: 8, chords: '1 6 3 7 1 6 3 7', crash: true, fill: 'fill',
      play: {
        stab: 'hook8', stabLow: { part: 'hook8', min: 0.4 }, bass: 'bassArp', beat: 'otBeat', arp: 'arp16',
        siren: { part: 'sirenSweep', min: 0.3 }, lead: { part: 'hook8', octave: 1, min: 0.65, vel: 0.7 }, pad: { part: 'pads', min: 0.5 },
      },
    },
    otB: {
      bars: 8, chords: '4 6 3 7 4 6 7 7', fill: 'fillBig',
      play: {
        lead: 'leadB', bass: 'bassArp', beat: 'otBeat2', arp: 'arp16', stabLow: { part: 'stabs', min: 0.25 },
        siren: { part: 'sirenSweep', min: 0.3 }, pad: { part: 'pads', min: 0.5 },
      },
    },
    vSting: {
      bars: 2, chords: '1 1', hit: { bar: 1, channel: 'boom' },
      play: { stab: 'victoryLine', stabLow: 'victoryLine', lead: { part: 'victoryLine', octave: 1, vel: 0.7 }, pad: 'pads', beat: 'stingBeat' },
    },
    vCalm: {
      bars: 8, chords: '1 4 6 5 1 4 6 5',
      play: { lead: { part: 'calmHook', vel: 0.6 }, pad: { part: 'pads', vel: 0.7 }, arp: { part: 'arp8', vel: 0.45 }, bass: { part: 'bassCalm', vel: 0.55 }, beat: 'calmBeat' },
    },
    dSting: {
      bars: 2, chords: '1 2',
      play: { stab: { part: 'defeatLine', vel: 0.85 }, lead: { part: 'defeatLine', vel: 0.6 }, pad: 'pads', beat: 'defeatSting' },
    },
    dCalm: {
      bars: 8, chords: '1 6 4 1 1 6 2 1',
      play: { lead: { part: 'defeatCalm', vel: 0.55 }, pad: { part: 'pads', vel: 0.6 }, bass: { part: 'bassCalm', vel: 0.5 }, beat: 'defeatBeat', arp: { part: 'arp8', vel: 0.35 } },
    },
    drSting: {
      bars: 2, chords: '1sus2 1sus4', hit: { bar: 1, channel: 'crash' },
      play: { stab: 'drawLine', lead: { part: 'drawLine', vel: 0.6 }, pad: 'padsOpen', beat: 'drawSting' },
    },
    drCalm: {
      bars: 8, chords: '1sus2 6sus2 1sus4 7sus4 1sus2 6sus2 4sus2 1sus4',
      play: { lead: { part: 'drawCalm', vel: 0.55 }, pad: { part: 'padsOpen', vel: 0.65 }, arp: { part: 'arp8', vel: 0.4 }, beat: 'drawBeat' },
    },
  },
  versions: {
    main: { once: ['intro'], loop: ['A1', 'A2', 'B', 'C', 'D', 'A3', 'B2', 'C2'] },
    overtime: { bpm: 142, transpose: 2, scale: 'phrygian', once: ['otPickup'], loop: ['otA', 'otB'], overtime: OVERTIME_LAYERS, lowpass: [1500, 18000] },
    victory: { bpm: 112, scale: 'ionian', once: ['vSting'], loop: ['vCalm'] },
    defeat: { bpm: 86, scale: 'phrygian', once: ['dSting'], loop: ['dCalm'], level: 0.9 },
    draw: { bpm: 100, once: ['drSting'], loop: ['drCalm'], level: 0.9 },
  },
};
