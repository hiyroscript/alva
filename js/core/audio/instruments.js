// The instruments the themes, the ambience and the effects play, on Web
// Audio (the Sound update).
//
// Two kinds:
//
//   - Rendered once, replayed cheaply: every drum (DRUMS) and every
//     plucked or struck tone (TONES: oud, guitar, harp, pluck, celesta,
//     glass bells, steel pan, marimba) is computed in JavaScript
//     (js/core/audio/dsp.js) into an AudioBuffer the first time it is
//     needed, then played by one buffer source a note. A tone is rendered
//     at its exact pitch, once per MIDI note.
//   - Synthesized live (SYNTHS): brass, leads, pads, choir, strings, bass,
//     drones, chants, risers, sirens, swells and pulses, each a small graph
//     of oscillators, filters and envelopes started and stopped on the
//     audio clock, gone once it has sounded.
//
// Every note is scheduled ahead on AudioContext.currentTime; nothing here
// reads the game's clock or its randomness.

import { DRUMS, TONES, noise as noiseSamples, impulseResponse, audioRng } from './dsp.js';
import { midiToFreq } from './theory.js';

// A sample buffer from mono (or [left, right]) samples.
export function toBuffer(ctx, data) {
  const channels = Array.isArray(data) ? data : [data];
  const buffer = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
  channels.forEach((c, i) => {
    if (buffer.copyToChannel) buffer.copyToChannel(c, i);
    else buffer.getChannelData(i).set(c);
  });
  return buffer;
}

// The samples of one AudioContext: drums, tones, noise and reverbs,
// rendered on first use and kept.
export class SampleBank {
  constructor(ctx, seed = 0x5a17) {
    this.ctx = ctx;
    this.rng = audioRng(seed);
    this.cache = new Map();
  }

  get(key, render) {
    let buffer = this.cache.get(key);
    if (!buffer) {
      buffer = toBuffer(this.ctx, render(this.ctx.sampleRate, this.rng));
      this.cache.set(key, buffer);
    }
    return buffer;
  }

  drum(name, opts = {}) {
    const render = DRUMS[name];
    if (!render) throw new Error(`[Alva] Unknown drum "${name}"`);
    return this.get(`drum:${name}:${JSON.stringify(opts)}`, (sr, rng) => render(sr, rng, opts));
  }

  tone(name, midi) {
    const render = TONES[name];
    if (!render) throw new Error(`[Alva] Unknown tone "${name}"`);
    const note = Math.round(midi);
    return this.get(`tone:${name}:${note}`, (sr, rng) => render(sr, midiToFreq(note), rng));
  }

  // Two seconds of white noise, looped by whatever needs a noise source.
  noise() {
    return this.get('noise', (sr, rng) => [noiseSamples(sr, 2, rng), noiseSamples(sr, 2, rng)]);
  }

  reverb(seconds, damp) {
    return this.get(`reverb:${seconds}:${damp}`, (sr, rng) => impulseResponse(sr, seconds, rng, { damp }));
  }
}

// ---- Helpers ---------------------------------------------------------------------

const clampFreq = (ctx, f) => Math.max(10, Math.min(f, ctx.sampleRate * 0.45));

function osc(ctx, type, freq, t, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(clampFreq(ctx, freq), t);
  if (detune) o.detune.setValueAtTime(detune, t);
  return o;
}

function gain(ctx, value = 1) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function filter(ctx, type, freq, q = 0.707, t = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(clampFreq(ctx, freq), t);
  f.Q.setValueAtTime(q, t);
  return f;
}

// An ADSR on `param` from `t`, held `dur` seconds then released. Returns
// when it is silent.
function adsr(param, t, dur, { a = 0.01, d = 0.1, s = 0.7, r = 0.1, peak = 1 }) {
  const attackEnd = t + a;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, attackEnd);
  param.setTargetAtTime(peak * s, attackEnd, Math.max(0.005, d / 3));
  const release = Math.max(attackEnd, t + dur);
  param.setTargetAtTime(0, release, Math.max(0.005, r / 4));
  return release + r * 1.6;
}

function stopAll(nodes, at) {
  for (const n of nodes) n.stop(at);
}

// ---- Buffer playback -------------------------------------------------------------

// Plays `buffer` into `out` at `t` (`rate` for pitch), at gain `level`,
// faded out over `release` seconds from `t + dur` when given (a held
// tone shorter than its ring).
export function playBuffer(ctx, out, buffer, t, { level = 1, rate = 1, dur = null, release = 0.08 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  if (rate !== 1) src.playbackRate.setValueAtTime(rate, t);
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(level, t);
  let end = t + buffer.duration / rate;
  if (dur !== null && t + dur + release < end) {
    g.gain.setValueAtTime(level, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + release);
    end = t + dur + release;
  }
  src.connect(g).connect(out);
  src.start(t);
  src.stop(end + 0.01);
  return end;
}

// ---- Live synths -------------------------------------------------------------------

// Each: (ctx, out, t, note, bank) => end time. `note`: { freq | freqs, dur,
// vel, params } (params: the channel's own tuning of the instrument).
export const SYNTHS = Object.freeze({
  // A brass section: three detuned saws through a filter that blooms open
  // with the note's strength. `stab: true` for short punches.
  brass(ctx, out, t, { freq, freqs, dur, vel, params = {} }) {
    const notes = freqs ?? [freq];
    const peak = (params.level ?? 0.32) * vel ** 1.2 / Math.sqrt(notes.length);
    const lp = filter(ctx, 'lowpass', 300, params.q ?? 1.4, t);
    const open = (params.bright ?? 1) * (900 + 3600 * vel);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(open, t + (params.swell ?? 0.05));
    lp.frequency.setTargetAtTime(open * 0.55, t + (params.swell ?? 0.05), 0.12);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.022, d: 0.2, s: params.stab ? 0.4 : 0.78, r: params.release ?? 0.14, peak });
    const oscs = [];
    for (const f of notes) {
      for (const cents of [-9, 0, 9]) oscs.push(osc(ctx, 'sawtooth', f, t, cents));
    }
    for (const o of oscs) o.connect(lp);
    lp.connect(amp).connect(out);
    for (const o of oscs) o.start(t);
    stopAll(oscs, end);
    return end;
  },

  // A lead line: two oscillators, delayed vibrato, a filter. `wave`,
  // `wave2`, `cutoff`, `vibrato` (cents), `glide` (seconds from the
  // previous pitch, when given `from`).
  lead(ctx, out, t, { freq, dur, vel, params = {}, from = null }) {
    const peak = (params.level ?? 0.25) * vel ** 1.1;
    const lp = filter(ctx, 'lowpass', params.cutoff ?? 3200, params.q ?? 1.2, t);
    lp.frequency.setValueAtTime((params.cutoff ?? 3200) * 1.6, t);
    lp.frequency.setTargetAtTime(params.cutoff ?? 3200, t + 0.02, 0.09);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.012, d: 0.16, s: params.sustain ?? 0.82, r: params.release ?? 0.12, peak });
    const a = osc(ctx, params.wave ?? 'sawtooth', from ?? freq, t, params.detune ?? 0);
    const b = osc(ctx, params.wave2 ?? 'square', from ?? freq, t, -(params.detune ?? 7));
    if (from) {
      for (const o of [a, b]) o.frequency.setTargetAtTime(freq, t, params.glide ?? 0.03);
    }
    const mix2 = gain(ctx, params.mix2 ?? 0.5);
    const vib = osc(ctx, 'sine', params.rate ?? 5.4, t);
    const depth = gain(ctx, 0);
    const cents = params.vibrato ?? 14;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(cents, t + Math.min(dur, 0.12) + 0.18);
    vib.connect(depth);
    depth.connect(a.detune);
    depth.connect(b.detune);
    a.connect(lp);
    b.connect(mix2).connect(lp);
    lp.connect(amp).connect(out);
    for (const o of [a, b, vib]) o.start(t);
    stopAll([a, b, vib], end);
    return end;
  },

  // A pad chord, each note two detuned saws spread left and right.
  // `cutoff`, `attack`, `release`, `wave`.
  pad(ctx, out, t, { freqs, freq, dur, vel, params = {} }) {
    const notes = freqs ?? [freq];
    const peak = (params.level ?? 0.16) * vel / Math.sqrt(notes.length);
    const lp = filter(ctx, 'lowpass', params.cutoff ?? 1400, 0.6, t);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.35, d: 0.4, s: 0.85, r: params.release ?? 0.6, peak });
    const nodes = [];
    for (const f of notes) {
      for (const side of [-1, 1]) {
        const o = osc(ctx, params.wave ?? 'sawtooth', f, t, side * (params.detune ?? 11));
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(side * (params.width ?? 0.55), t);
        o.connect(p).connect(lp);
        nodes.push(o);
      }
    }
    lp.connect(amp).connect(out);
    for (const o of nodes) o.start(t);
    stopAll(nodes, end);
    return end;
  },

  // A choir: soft voices through two vowel formants (an open "ah"), wide.
  choir(ctx, out, t, { freqs, freq, dur, vel, params = {} }) {
    const notes = freqs ?? [freq];
    const peak = (params.level ?? 0.22) * vel / Math.sqrt(notes.length);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.5, d: 0.5, s: 0.9, r: params.release ?? 0.9, peak });
    const f1 = filter(ctx, 'bandpass', params.f1 ?? 700, 3.5, t);
    const f2 = filter(ctx, 'bandpass', params.f2 ?? 1150, 4, t);
    const f3 = filter(ctx, 'bandpass', params.f3 ?? 2600, 5, t);
    const sum = gain(ctx, 1);
    const f3g = gain(ctx, 0.35);
    const nodes = [];
    for (const f of notes) {
      for (const side of [-1, 0, 1]) {
        const o = osc(ctx, 'sawtooth', f, t, side * 8);
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(side * 0.7, t);
        o.connect(p);
        p.connect(f1);
        p.connect(f2);
        p.connect(f3);
        nodes.push(o);
      }
    }
    f1.connect(sum);
    f2.connect(sum);
    f3.connect(f3g).connect(sum);
    sum.connect(amp).connect(out);
    for (const o of nodes) o.start(t);
    stopAll(nodes, end);
    return end;
  },

  // Strings: bowed saws, a slow bow and a little vibrato; `staccato` for a
  // short, biting ostinato.
  strings(ctx, out, t, { freqs, freq, dur, vel, params = {} }) {
    const notes = freqs ?? [freq];
    const staccato = !!params.staccato;
    const peak = (params.level ?? (staccato ? 0.2 : 0.15)) * vel / Math.sqrt(notes.length);
    const bp = filter(ctx, staccato ? 'bandpass' : 'lowpass', params.cutoff ?? (staccato ? 1300 : 2600), staccato ? 0.9 : 0.7, t);
    const amp = gain(ctx, 0);
    const end = staccato
      ? adsr(amp.gain, t, Math.min(dur, 0.09), { a: 0.006, d: 0.08, s: 0.3, r: 0.07, peak })
      : adsr(amp.gain, t, dur, { a: params.attack ?? 0.18, d: 0.3, s: 0.9, r: params.release ?? 0.4, peak });
    const nodes = [];
    const vib = osc(ctx, 'sine', 5.2, t);
    const depth = gain(ctx, staccato ? 0 : 9);
    vib.connect(depth);
    for (const f of notes) {
      for (const side of [-1, 1]) {
        const o = osc(ctx, 'sawtooth', f, t, side * 6 + (params.cents ?? 0));
        depth.connect(o.detune);
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(side * 0.45, t);
        o.connect(p).connect(bp);
        nodes.push(o);
      }
    }
    bp.connect(amp).connect(out);
    for (const o of [...nodes, vib]) o.start(t);
    stopAll([...nodes, vib], end);
    return end;
  },

  // A bass: saw (or square) and a sine sub, its filter snapping shut.
  // `cutoff`, `drive` (a waveshaper's warmth), `wave`.
  bass(ctx, out, t, { freq, dur, vel, params = {} }) {
    const peak = (params.level ?? 0.38) * vel;
    const cutoff = params.cutoff ?? 600;
    const lp = filter(ctx, 'lowpass', cutoff * 4, params.q ?? 3, t);
    lp.frequency.setTargetAtTime(cutoff, t + 0.005, params.snap ?? 0.06);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: 0.004, d: params.decay ?? 0.18, s: params.sustain ?? 0.6, r: 0.06, peak });
    const a = osc(ctx, params.wave ?? 'sawtooth', freq, t);
    const sub = osc(ctx, 'sine', freq, t);
    const subLevel = gain(ctx, params.sub ?? 0.9);
    let head = lp;
    if (params.drive) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(params.drive);
      lp.connect(shaper);
      head = shaper;
    }
    a.connect(lp);
    sub.connect(subLevel).connect(amp);
    head.connect(amp).connect(out);
    for (const o of [a, sub]) o.start(t);
    stopAll([a, sub], end);
    return end;
  },

  // A deep drone: root and fifth, slowly breathing through a filter.
  drone(ctx, out, t, { freq, dur, vel, params = {} }) {
    const peak = (params.level ?? 0.2) * vel;
    const lp = filter(ctx, 'lowpass', params.cutoff ?? 500, 1.5, t);
    const lfo = osc(ctx, 'sine', params.rate ?? 0.11, t);
    const lfoDepth = gain(ctx, (params.cutoff ?? 500) * 0.45);
    lfo.connect(lfoDepth).connect(lp.frequency);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: params.attack ?? 1.2, d: 1, s: 1, r: params.release ?? 1.5, peak });
    const nodes = [osc(ctx, params.wave ?? 'sawtooth', freq, t, -6), osc(ctx, params.wave ?? 'sawtooth', freq, t, 6)];
    if (params.fifth !== false) nodes.push(osc(ctx, 'sawtooth', freq * 1.5, t, 3));
    nodes.push(osc(ctx, 'sine', freq, t));
    for (const o of nodes) o.connect(lp);
    lp.connect(amp).connect(out);
    for (const o of [...nodes, lfo]) o.start(t);
    stopAll([...nodes, lfo], end);
    return end;
  },

  // A throat chant: a low buzzing voice whose vowel opens from "oo" to
  // "ah" over the note.
  chant(ctx, out, t, { freq, dur, vel, params = {} }) {
    const peak = (params.level ?? 0.3) * vel;
    const src = osc(ctx, 'sawtooth', freq, t);
    const src2 = osc(ctx, 'sawtooth', freq, t, 7);
    const formants = [[320, 720, 6], [800, 1100, 7], [2300, 2600, 9]].map(([from, to, q]) => {
      const f = filter(ctx, 'bandpass', from, q, t);
      f.frequency.linearRampToValueAtTime(to, t + Math.max(0.2, dur * 0.7));
      return f;
    });
    const sum = gain(ctx, 1);
    for (const f of formants) {
      src.connect(f);
      src2.connect(f);
      f.connect(sum);
    }
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.12, d: 0.3, s: 0.85, r: params.release ?? 0.35, peak: peak * 3 });
    sum.connect(amp).connect(out);
    for (const o of [src, src2]) o.start(t);
    stopAll([src, src2], end);
    return end;
  },

  // A riser: filtered noise sweeping up, and a saw climbing an octave,
  // swelling to its end (`dur`).
  riser(ctx, out, t, { freq, dur, vel, params = {} }, bank) {
    const level = (params.level ?? 0.22) * vel;
    const src = ctx.createBufferSource();
    src.buffer = bank.noise();
    src.loop = true;
    const bp = filter(ctx, 'bandpass', 300, 2.2, t);
    bp.frequency.exponentialRampToValueAtTime(params.top ?? 7000, t + dur);
    const amp = gain(ctx, 0);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + dur);
    amp.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    const saw = osc(ctx, 'sawtooth', freq, t);
    saw.frequency.exponentialRampToValueAtTime(freq * 2, t + dur);
    const sawLp = filter(ctx, 'lowpass', 900, 1, t);
    sawLp.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const sawLevel = gain(ctx, 0.25);
    src.connect(bp).connect(amp);
    saw.connect(sawLp).connect(sawLevel).connect(amp);
    amp.connect(out);
    src.start(t);
    saw.start(t);
    const end = t + dur + 0.06;
    stopAll([src, saw], end);
    return end;
  },

  // A siren: a voice sliding up and down (Sol-Noir's overtime).
  siren(ctx, out, t, { freq, dur, vel, params = {} }) {
    const level = (params.level ?? 0.09) * vel;
    const o = osc(ctx, 'triangle', freq, t);
    const o2 = osc(ctx, 'sawtooth', freq, t, 5);
    const curve = new Float32Array(64);
    const cycles = params.cycles ?? 2;
    for (let i = 0; i < curve.length; i += 1) {
      curve[i] = freq * (1 + 0.5 * (0.5 - 0.5 * Math.cos((i / (curve.length - 1)) * cycles * Math.PI * 2)));
    }
    o.frequency.setValueCurveAtTime(curve, t, dur);
    o2.frequency.setValueCurveAtTime(curve, t, dur);
    const lp = filter(ctx, 'lowpass', 2400, 1, t);
    const o2g = gain(ctx, 0.25);
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: dur * 0.3, d: 0.2, s: 1, r: 0.3, peak: level });
    o.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(amp).connect(out);
    o.start(t);
    o2.start(t);
    stopAll([o, o2], end);
    return end;
  },

  // A swell of filtered noise: a blizzard's gust (`band`: high and airy) or
  // a volcano's rumble (low and heavy).
  swell(ctx, out, t, { dur, vel, params = {} }, bank) {
    const level = (params.level ?? 0.2) * vel;
    const src = ctx.createBufferSource();
    src.buffer = bank.noise();
    src.loop = true;
    const low = params.kind === 'rumble';
    const f = filter(ctx, low ? 'lowpass' : 'bandpass', low ? 90 : 700, low ? 2 : 1.2, t);
    f.frequency.linearRampToValueAtTime(low ? 260 : 3200, t + dur * 0.55);
    f.frequency.linearRampToValueAtTime(low ? 80 : 900, t + dur);
    const amp = gain(ctx, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(level, t + dur * 0.55);
    amp.gain.linearRampToValueAtTime(0, t + dur);
    let head = f;
    if (low) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(3);
      f.connect(shaper);
      head = shaper;
    }
    src.connect(f);
    head.connect(amp).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
    return t + dur + 0.02;
  },

  // A pulsing sub: one short sine thump (overtime's heartbeat).
  pulse(ctx, out, t, { freq, dur, vel, params = {} }) {
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, Math.min(dur, 0.12), { a: 0.006, d: 0.1, s: 0.5, r: 0.08, peak: (params.level ?? 0.45) * vel });
    const o = osc(ctx, 'sine', freq, t);
    o.connect(amp).connect(out);
    o.start(t);
    o.stop(end);
    return end;
  },

  // Tension: a high cluster of strings a semitone apart, bent sharp by
  // `params.cents` (overtime's rising pitch).
  tension(ctx, out, t, { freq, dur, vel, params = {} }) {
    const amp = gain(ctx, 0);
    const end = adsr(amp.gain, t, dur, { a: 0.4, d: 0.2, s: 1, r: 0.3, peak: (params.level ?? 0.06) * vel });
    const bp = filter(ctx, 'bandpass', freq * 2, 0.8, t);
    const nodes = [0, 1, 6].map((semi, i) => {
      const o = osc(ctx, 'sawtooth', freq * 2 ** (semi / 12), t, (i - 1) * 5);
      o.detune.linearRampToValueAtTime((params.cents ?? 0) + (i - 1) * 5, t + dur);
      o.connect(bp);
      return o;
    });
    bp.connect(amp).connect(out);
    for (const o of nodes) o.start(t);
    stopAll(nodes, end);
    return end;
  },
});

// A soft-clipping curve for a waveshaper: `amount` 1 is gentle, 4 heavy.
export function driveCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.tanh(amount);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / k;
  }
  return curve;
}

// Plays one note of channel `spec` into `out` at `t`: a drum's sample, a
// tone's sample at its pitch, or a synth. Returns its end time.
export function playNote(ctx, out, bank, spec, t, note) {
  if (spec.drum) {
    const buffer = bank.drum(spec.drum, spec.opts);
    return playBuffer(ctx, out, buffer, t, { level: (spec.level ?? 1) * note.vel ** 1.4, rate: spec.rate ?? 1 });
  }
  if (spec.tone) {
    const notes = note.midis ?? [note.midi];
    let end = t;
    const each = (spec.level ?? 0.6) * note.vel ** 1.2 / Math.sqrt(notes.length);
    notes.forEach((m, i) => {
      const at = t + i * (spec.strum ?? 0);
      end = Math.max(end, playBuffer(ctx, out, bank.tone(spec.tone, m), at, { level: each, dur: spec.ring ? null : note.dur + 0.02, release: spec.release ?? 0.25 }));
    });
    return end;
  }
  const synth = SYNTHS[spec.synth];
  if (!synth) throw new Error(`[Alva] Unknown synth "${spec.synth}"`);
  return synth(ctx, out, t, { ...note, params: spec.params ?? {} }, bank);
}
