// What every stage theme shares: overtime's own channels (the clock, the
// pulsing sub, the risers, the bending strings) and its layers' wiring, the
// drum fills' building blocks and the final hits. Each theme spreads these
// into its own channels and parts and tunes the rest itself (see
// docs/systems/audio.md, "Adding a stage's theme").

// Overtime's channels: the clock (tick and tock), the sub's pulse, the
// risers and the strings' cluster. Their levels are each theme's to
// trim.
export const OVERTIME_CHANNELS = Object.freeze({
  tick: { drum: 'tick', gain: 0.3, pan: 0.32, reverb: 0.06 },
  tock: { drum: 'tick', opts: { low: true }, gain: 0.26, pan: -0.32, reverb: 0.06 },
  pulse: { synth: 'pulse', octave: -2, gain: 0.85, params: { level: 0.42 } },
  riser: { synth: 'riser', octave: -1, gain: 0.65, reverb: 0.3, params: { level: 0.2 } },
  tension: { synth: 'tension', octave: 1, gain: 0.9, reverb: 0.35, params: { level: 0.05 } },
});

// The layers overtime's intensity brings in (see overtimeLayers in
// js/core/audio/sequencer.js).
export const OVERTIME_LAYERS = Object.freeze({ tick: 'tick', tock: 'tock', pulse: 'pulse', riser: 'riser', tension: 'tension' });

// Channels most themes play their hits on.
export const HIT_CHANNELS = Object.freeze({
  crash: { drum: 'crash', gain: 0.3, pan: 0.18, reverb: 0.22 },
  boom: { drum: 'boom', gain: 0.85, reverb: 0.4 },
});
