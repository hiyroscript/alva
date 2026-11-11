// The sound effects (the Sound update): the three ejections, the Deflect,
// the Perfect Shield, the Shield block and the Shield held. Synthesized
// live on Web Audio, each a small graph started on the audio clock and gone
// once it has sounded: a tight transient, a weighty low end, a bright,
// crisp top and a short sparkle or tail. Each play varies its pitch and
// level by a few per cent (`vary`), so no two repeats sound alike.
//
// Every recipe: (ctx, out, t, { pitch, level, pan, direction, reverb },
// bank) => end time. `out` is the effects bus; `reverb` the effects'
// shared reverb send.

function node(ctx, type, opts = {}) {
  let n;
  switch (type) {
    case 'osc':
      n = ctx.createOscillator();
      n.type = opts.wave ?? 'sine';
      n.frequency.setValueAtTime(opts.freq ?? 440, opts.t ?? 0);
      break;
    case 'gain':
      n = ctx.createGain();
      n.gain.value = opts.value ?? 1;
      break;
    case 'filter':
      n = ctx.createBiquadFilter();
      n.type = opts.kind ?? 'lowpass';
      n.frequency.setValueAtTime(opts.freq ?? 1000, opts.t ?? 0);
      n.Q.setValueAtTime(opts.q ?? 0.707, opts.t ?? 0);
      break;
    case 'pan':
      n = ctx.createStereoPanner();
      n.pan.setValueAtTime(opts.pan ?? 0, opts.t ?? 0);
      break;
    default:
      throw new Error(type);
  }
  return n;
}

// A one-shot envelope: up to `peak` in `a`, down with time constant `d`.
function hit(param, t, peak, a, d) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(0, t + a, d);
  return t + a + d * 7;
}

function noiseSource(ctx, bank, t) {
  const src = ctx.createBufferSource();
  src.buffer = bank.noise();
  src.loop = true;
  src.loopStart = Math.random() * 1.5;
  return src;
}

// A pitch falling from `from` to `to` Hz: the body of every boom.
function boom(ctx, out, t, { from, to, bend, decay, level, lowpass = 0 }) {
  const o = node(ctx, 'osc', { freq: from, t });
  o.frequency.setTargetAtTime(to, t, bend);
  const g = node(ctx, 'gain', { value: 0 });
  const end = hit(g.gain, t, level, 0.004, decay);
  if (lowpass) {
    const f = node(ctx, 'filter', { freq: lowpass, t });
    o.connect(f).connect(g);
  } else o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(end);
  return end;
}

// Filtered noise: a burst, a whoosh, a roar.
function burst(ctx, out, t, bank, { kind = 'bandpass', freq, q = 1, to = null, sweep = 0.2, level, a = 0.002, d = 0.05, pan = 0 }) {
  const src = noiseSource(ctx, bank, t);
  const f = node(ctx, 'filter', { kind, freq, q, t });
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + sweep);
  const g = node(ctx, 'gain', { value: 0 });
  const end = hit(g.gain, t, level, a, d);
  const p = node(ctx, 'pan', { pan, t });
  src.connect(f).connect(g).connect(p).connect(out);
  src.start(t, src.loopStart);
  src.stop(end);
  return end;
}

// Ringing partials: [ratio, amp, decay] over `freq`, optionally gliding
// up `rise` semitones into pitch over `riseTime`.
function ring(ctx, out, t, { freq, partials, level, rise = 0, riseTime = 0.2, shimmer = 0, wave = 'sine', a = 0.002 }) {
  let end = t;
  for (const [ratio, amp, decay] of partials) {
    const f0 = freq * ratio;
    if (f0 > ctx.sampleRate * 0.45) continue;
    const o = node(ctx, 'osc', { wave, freq: rise ? f0 * 2 ** (-rise / 12) : f0, t });
    if (rise) o.frequency.setTargetAtTime(f0, t, riseTime / 3);
    const g = node(ctx, 'gain', { value: 0 });
    const e = hit(g.gain, t, level * amp, a, decay);
    if (shimmer) {
      // A tremolo before the envelope, so it dies with the note.
      const trem = node(ctx, 'gain', { value: 0.7 });
      const lfo = node(ctx, 'osc', { freq: shimmer * (0.9 + (0.2 * ratio) / 4), t });
      const depth = node(ctx, 'gain', { value: 0.3 });
      lfo.connect(depth).connect(trem.gain);
      lfo.start(t);
      lfo.stop(e);
      o.connect(trem).connect(g);
    } else o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(e);
    end = Math.max(end, e);
  }
  return end;
}

// A brass hit: detuned saws through a filter blooming open, on `freqs`.
function brassHit(ctx, out, t, { freqs, level, decay = 0.35, bright = 4200 }) {
  const lp = node(ctx, 'filter', { freq: 300, q: 1.6, t });
  lp.frequency.linearRampToValueAtTime(bright, t + 0.035);
  lp.frequency.setTargetAtTime(900, t + 0.04, decay / 2);
  const g = node(ctx, 'gain', { value: 0 });
  const end = hit(g.gain, t, level, 0.012, decay);
  const oscs = [];
  for (const f of freqs) for (const c of [-10, 0, 10]) {
    const o = node(ctx, 'osc', { wave: 'sawtooth', freq: f, t });
    o.detune.setValueAtTime(c, t);
    o.connect(lp);
    oscs.push(o);
  }
  lp.connect(g).connect(out);
  for (const o of oscs) {
    o.start(t);
    o.stop(end);
  }
  return end;
}

const max = (...ends) => Math.max(...ends);

// Each recipe's channel: its level, pan, and a send to the effects' reverb.
function strip(ctx, out, reverb, t, { level = 1, pan = 0, send = 0.25 }) {
  const g = node(ctx, 'gain', { value: level });
  const p = node(ctx, 'pan', { pan, t });
  g.connect(p).connect(out);
  if (reverb && send) {
    const s = node(ctx, 'gain', { value: send });
    p.connect(s).connect(reverb);
  }
  return { input: g, pan: p };
}

export const SFX_RECIPES = Object.freeze({
  // The opponent knocked out: a huge, rewarding boom, a bright "shing"
  // rising into place, a roar of noise like a crowd, and a triumphant
  // major brass hit.
  'sfx.ejectOpponent'(ctx, out, t, o, bank) {
    const k = o.pitch;
    const s = strip(ctx, out, o.reverb, t, { level: o.level, pan: o.pan * 0.6, send: 0.32 });
    const wide = strip(ctx, out, o.reverb, t, { level: o.level, pan: 0, send: 0.4 });
    return max(
      boom(ctx, s.input, t, { from: 150 * k, to: 36 * k, bend: 0.06, decay: 0.32, level: 0.9 }),
      burst(ctx, s.input, t, bank, { kind: 'highpass', freq: 3000, level: 0.35, d: 0.012 }),
      burst(ctx, wide.input, t + 0.01, bank, { freq: 700 * k, q: 0.7, to: 1500 * k, sweep: 0.25, level: 0.22, a: 0.08, d: 0.35, pan: -0.5 }),
      burst(ctx, wide.input, t + 0.012, bank, { freq: 760 * k, q: 0.7, to: 1700 * k, sweep: 0.25, level: 0.22, a: 0.08, d: 0.35, pan: 0.5 }),
      ring(ctx, wide.input, t + 0.02, {
        freq: 1318.5 * k, level: 0.1, rise: 7, riseTime: 0.22, shimmer: 11,
        partials: [[1, 1, 0.45], [1.5, 0.7, 0.4], [2, 0.5, 0.35], [3, 0.25, 0.25]],
      }),
      brassHit(ctx, s.input, t + 0.03, { freqs: [220 * k, 277.2 * k, 329.6 * k, 440 * k], level: 0.17, decay: 0.3 }),
    );
  },

  // The player sent away: clearly a loss, still good to hear: a falling
  // sweep, a muffled low boom, a hollow, detuned minor tail.
  'sfx.ejectPlayer'(ctx, out, t, o, bank) {
    const k = o.pitch;
    const s = strip(ctx, out, o.reverb, t, { level: o.level, pan: o.pan * 0.6, send: 0.38 });
    const sweep = node(ctx, 'osc', { wave: 'sawtooth', freq: 620 * k, t });
    sweep.frequency.exponentialRampToValueAtTime(70 * k, t + 0.55);
    const sweepLp = node(ctx, 'filter', { freq: 2400, q: 2, t });
    sweepLp.frequency.exponentialRampToValueAtTime(200, t + 0.55);
    const sweepGain = node(ctx, 'gain', { value: 0 });
    const sweepEnd = hit(sweepGain.gain, t, 0.16, 0.01, 0.2);
    sweep.connect(sweepLp).connect(sweepGain).connect(s.input);
    sweep.start(t);
    sweep.stop(sweepEnd);
    let tail = t;
    for (const [f, c] of [[146.8, -22], [174.6, 18], [220, -12], [146.8, 25]]) {
      const v = node(ctx, 'osc', { wave: 'triangle', freq: f * k, t: t + 0.12 });
      v.detune.setValueAtTime(c, t + 0.12);
      v.frequency.setTargetAtTime(f * k * 0.97, t + 0.3, 0.6);
      const lp = node(ctx, 'filter', { freq: 900, t: t + 0.12 });
      const g = node(ctx, 'gain', { value: 0 });
      const e = hit(g.gain, t + 0.12, 0.09, 0.05, 0.45);
      v.connect(lp).connect(g).connect(s.input);
      v.start(t + 0.12);
      v.stop(e);
      tail = Math.max(tail, e);
    }
    return max(
      sweepEnd, tail,
      boom(ctx, s.input, t, { from: 110 * k, to: 34 * k, bend: 0.08, decay: 0.3, level: 0.9, lowpass: 260 }),
      burst(ctx, s.input, t, bank, { kind: 'lowpass', freq: 500, level: 0.3, d: 0.06 }),
    );
  },

  // Local Play's and Watch Mode's ejection, nobody's good or bad news: a
  // punchy boom, an impact of noise, and an open fifth (no third, neither
  // major nor minor) ringing out.
  'sfx.ejectUniversal'(ctx, out, t, o, bank) {
    const k = o.pitch;
    const s = strip(ctx, out, o.reverb, t, { level: o.level, pan: o.pan * 0.6, send: 0.32 });
    return max(
      boom(ctx, s.input, t, { from: 140 * k, to: 40 * k, bend: 0.05, decay: 0.28, level: 0.9 }),
      burst(ctx, s.input, t, bank, { kind: 'highpass', freq: 2600, level: 0.3, d: 0.014 }),
      burst(ctx, s.input, t + 0.005, bank, { freq: 1100 * k, q: 0.8, level: 0.22, a: 0.01, d: 0.18 }),
      brassHit(ctx, s.input, t + 0.02, { freqs: [130.8 * k, 196 * k, 261.6 * k], level: 0.16, decay: 0.28, bright: 3400 }),
      ring(ctx, s.input, t + 0.02, { freq: 784 * k, level: 0.06, partials: [[1, 1, 0.3], [1.5, 0.8, 0.28], [2, 0.5, 0.22]] }),
    );
  },

  // A projectile turned back: a sharp metallic parry ringing out, a whoosh
  // reversing, swept across the stereo field the way the shot now flies.
  'sfx.deflect'(ctx, out, t, o, bank) {
    const k = o.pitch;
    const dir = o.direction || 1;
    const s = strip(ctx, out, o.reverb, t, { level: o.level * 2, pan: o.pan * 0.5, send: 0.28 });
    s.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, o.pan * 0.5 - 0.15 * dir)), t);
    s.pan.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, o.pan * 0.5 + 0.75 * dir)), t + 0.28);
    const whoosh = noiseSource(ctx, bank, t);
    const wf = node(ctx, 'filter', { kind: 'bandpass', freq: 2600, q: 1.6, t });
    wf.frequency.exponentialRampToValueAtTime(700, t + 0.07);
    wf.frequency.exponentialRampToValueAtTime(4200, t + 0.26);
    const wg = node(ctx, 'gain', { value: 0 });
    wg.gain.setValueAtTime(0, t);
    wg.gain.linearRampToValueAtTime(0.22, t + 0.05);
    wg.gain.linearRampToValueAtTime(0.32, t + 0.2);
    wg.gain.linearRampToValueAtTime(0, t + 0.28);
    whoosh.connect(wf).connect(wg).connect(s.input);
    whoosh.start(t, whoosh.loopStart);
    whoosh.stop(t + 0.3);
    return max(
      t + 0.3,
      burst(ctx, s.input, t, bank, { kind: 'highpass', freq: 4000, level: 0.5, d: 0.006 }),
      boom(ctx, s.input, t, { from: 260 * k, to: 120 * k, bend: 0.02, decay: 0.05, level: 0.45 }),
      ring(ctx, s.input, t, {
        freq: 1240 * k, level: 0.13, wave: 'triangle',
        partials: [[1, 1, 0.22], [2.32, 0.7, 0.16], [4.25, 0.45, 0.1], [6.63, 0.3, 0.07], [1.006, 0.6, 0.22]],
      }),
    );
  },

  // A Perfect Shield: a crystalline "ting" and a shimmering bloom, a
  // premium version of the block.
  'sfx.perfectShield'(ctx, out, t, o, bank) {
    const k = o.pitch;
    const s = strip(ctx, out, o.reverb, t, { level: o.level * 2.4, pan: o.pan * 0.5, send: 0.45 });
    return max(
      boom(ctx, s.input, t, { from: 200 * k, to: 110 * k, bend: 0.02, decay: 0.05, level: 0.4 }),
      burst(ctx, s.input, t, bank, { kind: 'highpass', freq: 5000, level: 0.25, d: 0.004 }),
      ring(ctx, s.input, t, {
        freq: 2637 * k, level: 0.11,
        partials: [[1, 1, 0.25], [1.5, 0.55, 0.2], [2, 0.4, 0.16], [3.01, 0.2, 0.1], [0.5, 0.6, 0.3]],
      }),
      ring(ctx, s.input, t + 0.03, {
        freq: 1975.5 * k, level: 0.05, shimmer: 13, a: 0.04,
        partials: [[1, 1, 0.35], [1.335, 0.8, 0.3], [2, 0.6, 0.3], [2.67, 0.4, 0.25]],
      }),
    );
  },

  // A Shield blocking a hit: a solid, muted thump of energy, understated.
  'sfx.block'(ctx, out, t, o, bank) {
    const k = o.pitch;
    const s = strip(ctx, out, o.reverb, t, { level: o.level * 0.7, pan: o.pan * 0.5, send: 0.12 });
    const buzz = node(ctx, 'osc', { wave: 'square', freq: 110 * k, t });
    const bf = node(ctx, 'filter', { kind: 'bandpass', freq: 1300, q: 1.4, t });
    const bg = node(ctx, 'gain', { value: 0 });
    const be = hit(bg.gain, t, 0.08, 0.002, 0.03);
    buzz.connect(bf).connect(bg).connect(s.input);
    buzz.start(t);
    buzz.stop(be);
    return max(
      be,
      boom(ctx, s.input, t, { from: 190 * k, to: 85 * k, bend: 0.025, decay: 0.05, level: 0.75, lowpass: 900 }),
      burst(ctx, s.input, t, bank, { freq: 750 * k, q: 0.9, level: 0.3, d: 0.022 }),
    );
  },
});

// The Shield held: a soft, low hum of energy that wavers like the Shield's
// black-and-red circle. A loop of its own (ShieldHum), not a one-shot.
export class ShieldHum {
  constructor(ctx, out, { pan = 0, pitch = 1 } = {}) {
    this.ctx = ctx;
    const t = ctx.currentTime;
    this.gain = node(ctx, 'gain', { value: 0 });
    this.panner = node(ctx, 'pan', { pan, t });
    this.gain.connect(this.panner).connect(out);
    const lp = node(ctx, 'filter', { freq: 260, q: 2.5, t });
    const waver = node(ctx, 'osc', { freq: 0.8, t });
    const waverDepth = node(ctx, 'gain', { value: 90 });
    waver.connect(waverDepth).connect(lp.frequency);
    const tremolo = node(ctx, 'osc', { freq: 5.5, t });
    const tremoloDepth = node(ctx, 'gain', { value: 0.18 });
    const body = node(ctx, 'gain', { value: 0.82 });
    tremolo.connect(tremoloDepth).connect(body.gain);
    this.sources = [waver, tremolo];
    for (const [f, d, w] of [[55, -8, 'sawtooth'], [55, 8, 'sawtooth'], [82.4, 0, 'triangle'], [110, 4, 'sine']]) {
      const o = node(ctx, 'osc', { wave: w, freq: f * pitch, t });
      o.detune.setValueAtTime(d, t);
      o.connect(lp);
      this.sources.push(o);
    }
    const air = noiseSourceLoop(ctx);
    if (air) {
      const af = node(ctx, 'filter', { kind: 'bandpass', freq: 2200, q: 3, t });
      const ag = node(ctx, 'gain', { value: 0.012 });
      air.connect(af).connect(ag).connect(body);
      this.sources.push(air);
    }
    lp.connect(body).connect(this.gain);
    for (const s of this.sources) s.start(t);
    this.level = 0.045;
    this.on = false;
    this.stopped = false;
  }

  // Up in about 80 ms.
  fadeIn() {
    const t = this.ctx.currentTime;
    this.on = true;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(this.level, t, 0.025);
  }

  // Held silent (pause), kept running.
  hold() {
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.015);
  }

  setPan(pan) {
    this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime, 0.05);
  }

  // Released: down in about 120 ms, then gone.
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.on = false;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.035);
    for (const s of this.sources) s.stop(t + 0.3);
  }
}

// A looping noise source for the hum's air, from a short buffer of its own.
let humNoise = null;
function noiseSourceLoop(ctx) {
  if (!ctx.createBuffer) return null;
  if (!humNoise || humNoise.sampleRate !== ctx.sampleRate) {
    humNoise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = humNoise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i += 1) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = humNoise;
  src.loop = true;
  return src;
}

