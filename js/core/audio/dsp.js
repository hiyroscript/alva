// Sample rendering in plain JavaScript: the drums, plucked strings, bells,
// steel pans and marimbas the stage themes play, and the reverb's impulse
// response, each computed once into a Float32Array (then an AudioBuffer,
// see js/core/audio/instruments.js) and replayed by a single buffer source a
// note. Cheap to play (one node a note), exact in pitch, and no file is
// downloaded: Alva ships no audio.
//
// Every renderer takes the sample rate and a random source (rng, 0-1) of
// the audio's own, never the simulation's, and returns mono samples in
// -1..1 (the reverb's two channels).

const TAU = Math.PI * 2;

// A standard RBJ biquad, run over a whole buffer in place.
export function biquad(data, sr, type, freq, q = 0.707, gainDb = 0) {
  const w0 = (TAU * Math.min(freq, sr * 0.45)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
      break;
    default:
      throw new Error(`[Alva] Unknown filter ${type}`);
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = y;
  }
  return data;
}

const samples = (sr, seconds) => new Float32Array(Math.max(1, Math.ceil(sr * seconds)));

// White noise, `seconds` long.
export function noise(sr, seconds, rng) {
  const out = samples(sr, seconds);
  for (let i = 0; i < out.length; i += 1) out[i] = rng() * 2 - 1;
  return out;
}

// Scales `data` so its loudest sample is `peak`.
export function normalize(data, peak = 0.95) {
  let max = 0;
  for (let i = 0; i < data.length; i += 1) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < data.length; i += 1) data[i] *= k;
  }
  return data;
}

// A short linear fade at both ends, so no sample starts or stops on a click.
export function declick(data, sr, inMs = 1, outMs = 6) {
  const a = Math.min(data.length, Math.ceil((sr * inMs) / 1000));
  const b = Math.min(data.length, Math.ceil((sr * outMs) / 1000));
  for (let i = 0; i < a; i += 1) data[i] *= i / a;
  for (let i = 0; i < b; i += 1) data[data.length - 1 - i] *= i / b;
  return data;
}

// Soft saturation: warmth and weight without hard clipping.
export function saturate(data, drive = 1.5) {
  const norm = Math.tanh(drive);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.tanh(data[i] * drive) / norm;
  return data;
}

function mixInto(target, source, gain = 1, offset = 0) {
  for (let i = 0; i < source.length && i + offset < target.length; i += 1) target[i + offset] += source[i] * gain;
  return target;
}

function expEnv(data, sr, decay, attack = 0) {
  const a = Math.max(1, sr * attack);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / sr;
    data[i] *= (i < a ? i / a : 1) * Math.exp(-t / decay);
  }
  return data;
}

// A sine whose pitch falls from `from` to `to` Hz (time constant `bend`),
// decaying with time constant `decay`: the body of a kick, tom or taiko.
export function droppingSine(sr, seconds, from, to, bend, decay, attack = 0.001) {
  const out = samples(sr, seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sr;
    const f = to + (from - to) * Math.exp(-t / bend);
    phase += (TAU * f) / sr;
    const a = Math.min(1, t / attack);
    out[i] = Math.sin(phase) * a * Math.exp(-t / decay);
  }
  return out;
}

// Sum of decaying partials: [{ ratio, amp, decay, detune? }] over `freq`,
// with an optional pitch glide at the start (`glide` semitones falling to
// none over `glideTime`): bells, celesta, steel pan, marimba.
export function partials(sr, seconds, freq, list, { glide = 0, glideTime = 0.03, attack = 0.002 } = {}) {
  const out = samples(sr, seconds);
  for (const p of list) {
    let phase = p.phase ?? 0;
    const f0 = freq * p.ratio * (1 + (p.detune ?? 0));
    if (f0 >= sr * 0.45) continue;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / sr;
      const bend = glide ? 2 ** ((glide * Math.exp(-t / glideTime)) / 12) : 1;
      phase += (TAU * f0 * bend) / sr;
      out[i] += Math.sin(phase) * p.amp * Math.exp(-t / p.decay) * Math.min(1, t / attack);
    }
  }
  return out;
}

// A plucked string (Karplus-Strong), exactly in tune: the loop's
// fractional delay is an all-pass. `bright` (0-1) is the pluck's
// brightness, `decay` how long the string rings (seconds to -60 dB, about),
// `body` an optional list of resonances [{ freq, q, gain }] (an oud's or
// a guitar's body).
export function pluck(sr, seconds, freq, rng, { bright = 0.6, decay = 1.6, body = [], position = 0.18 } = {}) {
  const out = samples(sr, seconds);
  const period = sr / freq;
  let n = Math.floor(period - 0.5);
  let frac = period - 0.5 - n;
  if (frac < 0.15) {
    n -= 1;
    frac += 1;
  }
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(n);
  // The excitation: noise, darkened as `bright` falls, combed by where the
  // string is plucked.
  const exc = new Float32Array(n);
  let lp = 0;
  const k = 0.15 + 0.8 * bright;
  for (let i = 0; i < n; i += 1) {
    lp += k * (rng() * 2 - 1 - lp);
    exc[i] = lp;
  }
  const comb = Math.max(1, Math.round(n * position));
  for (let i = 0; i < n; i += 1) line[i] = exc[i] - (i >= comb ? exc[i - comb] : 0);
  // Per-loop gain for the ring time asked.
  const loops = (decay * sr) / period;
  const g = Math.min(0.9995, 10 ** (-3 / Math.max(1, loops)));
  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < out.length; i += 1) {
    const x = line[idx];
    const avg = 0.5 * (x + prev);
    prev = x;
    const ap = c * avg + apIn - c * apOut;
    apIn = avg;
    apOut = ap;
    const y = ap * g;
    line[idx] = y;
    out[i] = x;
    idx = idx + 1 === n ? 0 : idx + 1;
  }
  for (const r of body) biquad(out, sr, 'peaking', r.freq, r.q, r.gain);
  return declick(normalize(out, 0.9), sr, 0.5, 30);
}

// Six detuned square waves, the classic metallic source of hats and
// cymbals.
export function metal(sr, seconds, base = 1) {
  const out = samples(sr, seconds);
  const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * base);
  const phases = freqs.map(() => 0);
  for (let i = 0; i < out.length; i += 1) {
    let s = 0;
    for (let j = 0; j < freqs.length; j += 1) {
      phases[j] += freqs[j] / sr;
      s += phases[j] % 1 < 0.5 ? 1 : -1;
    }
    out[i] = s / freqs.length;
  }
  return out;
}

// ---- Drums ---------------------------------------------------------------------

// Each drum: (sr, rng, opts) => samples. `opts.tone` shifts a pitched
// drum's tuning (a ratio).
export const DRUMS = Object.freeze({
  kick(sr, rng, { deep = false, punch = 1 } = {}) {
    const body = droppingSine(sr, deep ? 0.9 : 0.6, deep ? 140 : 165, deep ? 42 : 50, deep ? 0.05 : 0.035, deep ? 0.42 : 0.3);
    const click = noise(sr, 0.012, rng);
    biquad(click, sr, 'highpass', 2500, 0.8);
    expEnv(click, sr, 0.003);
    mixInto(body, click, 0.35 * punch);
    return declick(normalize(saturate(body, 1.6 + punch * 0.4), 0.98), sr, 0.2, 8);
  },
  snare(sr, rng, { gated = false } = {}) {
    const len = gated ? 0.42 : 0.3;
    const tone = partials(sr, len, 185, [{ ratio: 1, amp: 0.6, decay: 0.07 }, { ratio: 1.78, amp: 0.35, decay: 0.05 }]);
    const nz = noise(sr, len, rng);
    biquad(nz, sr, 'highpass', 1400, 0.7);
    biquad(nz, sr, 'peaking', 5200, 1, 4);
    if (gated) {
      // A big room cut off hard: full body, then the gate.
      for (let i = 0; i < nz.length; i += 1) {
        const t = i / sr;
        nz[i] *= Math.exp(-t / 0.5) * (t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 0.03));
      }
    } else expEnv(nz, sr, 0.11);
    mixInto(tone, nz, 0.8);
    return declick(normalize(saturate(tone, 1.3), 0.95), sr, 0.2, 6);
  },
  clap(sr, rng) {
    const out = samples(sr, 0.35);
    for (const [at, amp] of [[0, 0.7], [0.011, 0.8], [0.022, 1]]) {
      const burst = noise(sr, at === 0.022 ? 0.3 : 0.01, rng);
      expEnv(burst, sr, at === 0.022 ? 0.09 : 0.004);
      mixInto(out, burst, amp, Math.round(at * sr));
    }
    biquad(out, sr, 'bandpass', 1300, 0.9);
    biquad(out, sr, 'peaking', 2600, 1.2, 5);
    return declick(normalize(out, 0.92), sr, 0.2, 6);
  },
  hat(sr, rng, { open = false } = {}) {
    const len = open ? 0.45 : 0.08;
    const out = metal(sr, len, 1.6);
    mixInto(out, noise(sr, len, rng), 0.35);
    biquad(out, sr, 'bandpass', 10000, 0.6);
    biquad(out, sr, 'highpass', 7000, 0.7);
    expEnv(out, sr, open ? 0.16 : 0.025);
    return declick(normalize(out, 0.8), sr, 0.1, 4);
  },
  crash(sr, rng) {
    const out = metal(sr, 2.4, 1.2);
    mixInto(out, noise(sr, 2.4, rng), 0.9);
    biquad(out, sr, 'highpass', 3800, 0.6);
    biquad(out, sr, 'peaking', 7500, 0.8, 3);
    expEnv(out, sr, 0.75, 0.002);
    return declick(normalize(out, 0.75), sr, 0.2, 40);
  },
  // A clock's tick (tock with `low`), dry and exact: overtime's clock.
  tick(sr, rng, { low = false } = {}) {
    const f = low ? 1650 : 2900;
    const out = partials(sr, 0.05, f, [{ ratio: 1, amp: 1, decay: 0.008 }, { ratio: 2.4, amp: 0.4, decay: 0.004 }]);
    const click = noise(sr, 0.004, rng);
    biquad(click, sr, 'highpass', 4000);
    mixInto(out, click, 0.5);
    return declick(normalize(out, 0.9), sr, 0.05, 3);
  },
  // The darbuka's open low stroke.
  doum(sr, rng) {
    const out = droppingSine(sr, 0.5, 160, 92, 0.03, 0.22);
    const slap = noise(sr, 0.03, rng);
    biquad(slap, sr, 'bandpass', 900, 1.2);
    expEnv(slap, sr, 0.008);
    mixInto(out, slap, 0.25);
    return declick(normalize(saturate(out, 1.4), 0.95), sr, 0.2, 6);
  },
  // Its sharp rim stroke (`soft`: the ghosted "ka").
  tek(sr, rng, { soft = false } = {}) {
    const out = noise(sr, 0.08, rng);
    biquad(out, sr, 'bandpass', soft ? 3200 : 4200, 1.6);
    expEnv(out, sr, soft ? 0.014 : 0.02);
    const ring = partials(sr, 0.08, soft ? 520 : 640, [{ ratio: 1, amp: 0.6, decay: 0.02 }, { ratio: 2.3, amp: 0.3, decay: 0.012 }]);
    mixInto(out, ring, 0.6);
    return declick(normalize(out, 0.85), sr, 0.05, 4);
  },
  // Jingles of a frame drum (the riq).
  riq(sr, rng) {
    const out = noise(sr, 0.18, rng);
    const jingles = partials(sr, 0.18, 4100, [
      { ratio: 1, amp: 0.4, decay: 0.06 }, { ratio: 1.37, amp: 0.35, decay: 0.05 }, { ratio: 1.81, amp: 0.3, decay: 0.04 },
    ]);
    biquad(out, sr, 'highpass', 6000, 0.7);
    expEnv(out, sr, 0.045, 0.004);
    mixInto(out, jingles, 0.5);
    return declick(normalize(out, 0.7), sr, 0.1, 6);
  },
  // A great frame drum's low boom, with its skin's buzz.
  frame(sr, rng) {
    const out = droppingSine(sr, 0.7, 110, 66, 0.04, 0.3);
    const buzz = noise(sr, 0.25, rng);
    biquad(buzz, sr, 'bandpass', 320, 2);
    expEnv(buzz, sr, 0.07);
    mixInto(out, buzz, 0.3);
    return declick(normalize(saturate(out, 1.5), 0.95), sr, 0.2, 8);
  },
  // Taiko: a huge low drum, its strike and boom.
  taiko(sr, rng) {
    const out = droppingSine(sr, 1.4, 118, 54, 0.06, 0.55);
    mixInto(out, droppingSine(sr, 1.4, 236, 108, 0.04, 0.2), 0.25);
    const hit = noise(sr, 0.12, rng);
    biquad(hit, sr, 'lowpass', 700, 0.8);
    expEnv(hit, sr, 0.03);
    mixInto(out, hit, 0.6);
    return declick(normalize(saturate(out, 2), 0.98), sr, 0.2, 20);
  },
  tom(sr, rng, { tone = 1 } = {}) {
    const out = droppingSine(sr, 0.7, 190 * tone, 105 * tone, 0.05, 0.3);
    const hit = noise(sr, 0.05, rng);
    biquad(hit, sr, 'bandpass', 1500, 0.8);
    expEnv(hit, sr, 0.012);
    mixInto(out, hit, 0.3);
    return declick(normalize(saturate(out, 1.5), 0.95), sr, 0.2, 10);
  },
  // A shaker or brushed hiss on the off-beats.
  shaker(sr, rng) {
    const out = noise(sr, 0.1, rng);
    biquad(out, sr, 'bandpass', 6500, 1.1);
    for (let i = 0; i < out.length; i += 1) {
      const t = i / sr;
      out[i] *= Math.min(1, t / 0.012) * Math.exp(-t / 0.035);
    }
    return declick(normalize(out, 0.6), sr, 0.1, 4);
  },
  // A hollow log drum (Adamaris).
  log(sr, rng, { tone = 1 } = {}) {
    const out = partials(sr, 0.3, 420 * tone, [
      { ratio: 1, amp: 1, decay: 0.08 }, { ratio: 2.62, amp: 0.4, decay: 0.03 }, { ratio: 4.1, amp: 0.15, decay: 0.015 },
    ]);
    const tap = noise(sr, 0.01, rng);
    biquad(tap, sr, 'bandpass', 2400, 1);
    mixInto(out, tap, 0.3);
    return declick(normalize(out, 0.85), sr, 0.05, 6);
  },
  // Ice cracking (Jökull's overtime): a burst of sharp ticks and a cold
  // ring.
  ice(sr, rng) {
    const out = samples(sr, 0.6);
    let t = 0;
    while (t < 0.22) {
      const at = Math.round(t * sr);
      const amp = (1 - t / 0.25) * (0.4 + rng() * 0.6);
      for (let i = 0; i < 40 && at + i < out.length; i += 1) out[at + i] += (rng() * 2 - 1) * amp * Math.exp(-i / 8);
      t += 0.004 + rng() * 0.02;
    }
    biquad(out, sr, 'highpass', 1800, 0.7);
    mixInto(out, partials(sr, 0.6, 2350, [{ ratio: 1, amp: 0.25, decay: 0.12 }, { ratio: 1.47, amp: 0.18, decay: 0.09 }]), 1);
    mixInto(out, droppingSine(sr, 0.4, 90, 50, 0.05, 0.12), 0.5);
    return declick(normalize(out, 0.9), sr, 0.05, 20);
  },
  // The last hit of a sting: taiko, sub and a cymbal at once.
  boom(sr, rng) {
    const out = droppingSine(sr, 3, 120, 38, 0.08, 0.9);
    mixInto(out, DRUMS.taiko(sr, rng), 0.6);
    const air = DRUMS.crash(sr, rng);
    mixInto(out, air, 0.35);
    return declick(normalize(saturate(out, 1.6), 0.98), sr, 0.2, 60);
  },
});

// ---- Pitched instruments rendered a note at a time --------------------------------

// Each: (sr, freq, rng) => samples, exactly at `freq`.
export const TONES = Object.freeze({
  // An oud: a bright pluck with a nasal, woody body.
  oud: (sr, f, rng) => pluck(sr, 1.4, f, rng, {
    bright: 0.78, decay: 1.1, position: 0.13,
    body: [{ freq: 290, q: 1.4, gain: 5 }, { freq: 1150, q: 2, gain: 4 }, { freq: 3200, q: 1.5, gain: 2 }],
  }),
  // A clean electric guitar pluck (Adamaris's surf answer).
  guitar: (sr, f, rng) => pluck(sr, 1.6, f, rng, {
    bright: 0.62, decay: 1.4, position: 0.22, body: [{ freq: 180, q: 1, gain: 3 }, { freq: 2500, q: 1.2, gain: 3 }],
  }),
  // A harp (Asperitas's sky).
  harp: (sr, f, rng) => pluck(sr, 2.2, f, rng, { bright: 0.45, decay: 2.2, position: 0.3, body: [{ freq: 400, q: 0.8, gain: 2 }] }),
  // A synth pluck for arpeggios: tight and glassy.
  pluck: (sr, f, rng) => pluck(sr, 0.5, f, rng, { bright: 0.9, decay: 0.32, position: 0.5 }),
  celesta: (sr, f) => declick(normalize(partials(sr, 1.6, f, [
    { ratio: 1, amp: 1, decay: 0.9 }, { ratio: 2, amp: 0.25, decay: 0.35 }, { ratio: 3, amp: 0.1, decay: 0.2 },
    { ratio: 4.16, amp: 0.08, decay: 0.12 }, { ratio: 1, amp: 0.3, decay: 0.9, detune: 0.0016 },
  ], { attack: 0.0015 }), 0.85), sr, 0.1, 30),
  // Icy glass bells: inharmonic partials, beating pairs, a long ring.
  glass: (sr, f) => declick(normalize(partials(sr, 3, f, [
    { ratio: 1, amp: 1, decay: 1.6 }, { ratio: 1, amp: 0.5, decay: 1.6, detune: 0.0022 },
    { ratio: 2.76, amp: 0.45, decay: 0.9 }, { ratio: 2.76, amp: 0.2, decay: 0.9, detune: -0.0018 },
    { ratio: 5.4, amp: 0.22, decay: 0.45 }, { ratio: 8.93, amp: 0.1, decay: 0.22 },
  ], { attack: 0.001 }), 0.85), sr, 0.05, 60),
  // A steel pan: bright, its "boing" a slight fall into pitch.
  steel: (sr, f) => declick(normalize(saturate(partials(sr, 1.3, f, [
    { ratio: 1, amp: 1, decay: 0.75 }, { ratio: 2, amp: 0.55, decay: 0.45 }, { ratio: 3, amp: 0.22, decay: 0.3 },
    { ratio: 4.02, amp: 0.25, decay: 0.2 }, { ratio: 1, amp: 0.3, decay: 0.75, detune: 0.003 },
  ], { glide: 0.35, glideTime: 0.025, attack: 0.003 }), 1.3), 0.85), sr, 0.1, 30),
  marimba: (sr, f, rng) => {
    const out = partials(sr, 0.9, f, [
      { ratio: 1, amp: 1, decay: 0.38 }, { ratio: 3.93, amp: 0.3, decay: 0.08 }, { ratio: 9.2, amp: 0.08, decay: 0.025 },
    ], { attack: 0.002 });
    const mallet = noise(sr, 0.01, rng);
    biquad(mallet, sr, 'lowpass', 1800);
    mixInto(out, mallet, 0.15);
    return declick(normalize(out, 0.85), sr, 0.1, 20);
  },
});

// ---- Reverb ------------------------------------------------------------------------

// A stereo impulse response: decorrelated noise in each channel, decaying
// over `seconds` and darkening as it goes (`damp`: 0 bright, 1 dark), after
// `preDelay` seconds of silence.
export function impulseResponse(sr, seconds, rng, { damp = 0.5, preDelay = 0.015 } = {}) {
  const channels = [0, 1].map(() => {
    const out = samples(sr, seconds + preDelay);
    const start = Math.round(preDelay * sr);
    let lp = 0;
    for (let i = start; i < out.length; i += 1) {
      const t = (i - start) / sr;
      const progress = t / seconds;
      // The one-pole's coefficient falls as the tail goes on: high
      // frequencies die first.
      const k = Math.max(0.04, 1 - damp * (0.35 + 0.6 * progress));
      lp += k * (rng() * 2 - 1 - lp);
      out[i] = lp * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.006);
    }
    return out;
  });
  const peak = Math.max(...channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  for (const c of channels) for (let i = 0; i < c.length; i += 1) c[i] *= 0.6 / (peak || 1);
  return channels;
}

// The audio's own random stream (a seed, mulberry32): never the
// simulation's, so sound never touches what a match does.
export function audioRng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
