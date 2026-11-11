// Practice Ground's factory ambience (the Sound update): no music, a room
// of machines. Layered and never the same twice:
//
//   - always there: a low machine hum and the room's tone, a faint
//     electrical buzz from the gridded wall's lights (flickering now and
//     then), and a conveyor's rattle that comes and goes;
//   - now and then, each on its own random clock: a distant press or
//     piston (sometimes twice, ka-chunk), a hiss of steam, a metallic clank
//     somewhere in the hall, a run of chain.
//
// Every interval and pitch is drawn from the ambience's own random stream
// (never the simulation's), jittered wide enough that nothing settles into
// a beat: it never feels like music, and never loops like a recording. It
// stays low under everything, fades in as Practice starts and out as it
// ends. Scheduled ahead on the audio clock by the engine's timer, like the
// music.

import { audioRng } from './dsp.js';

const between = (rng, a, b) => a + (b - a) * rng();

export class FactoryAmbience {
  constructor({ ctx, bank, dest, reverb, seed = Date.now() }) {
    this.ctx = ctx;
    this.bank = bank;
    this.rng = audioRng(seed >>> 0);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.out.connect(this.wet).connect(reverb);
    this.sources = [];
    this.stopped = false;
    const t = ctx.currentTime;
    this.startBeds(t);
    // When each one-shot comes next (audio time).
    this.next = {
      press: t + between(this.rng, 1.2, 3),
      steam: t + between(this.rng, 4, 9),
      clank: t + between(this.rng, 2, 5),
      chain: t + between(this.rng, 7, 14),
      rattle: t,
      flicker: t + between(this.rng, 3, 8),
    };
  }

  // The beds: hum and room tone, the lights' buzz, the conveyor.
  startBeds(t) {
    const ctx = this.ctx;
    const loopNoise = () => {
      const src = ctx.createBufferSource();
      src.buffer = this.bank.noise();
      src.loop = true;
      this.sources.push(src);
      return src;
    };
    // Hum: mains-like partials, breathing slowly.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0.5;
    for (const [f, a] of [[50, 0.32], [100, 0.2], [150, 0.07], [200, 0.03]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(this.hum);
      this.sources.push(o);
    }
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.07;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.12;
    breath.connect(breathDepth).connect(this.hum.gain);
    this.sources.push(breath);
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 240;
    this.hum.connect(humLp).connect(this.out);
    // Room tone: dark noise.
    const room = loopNoise();
    const roomLp = ctx.createBiquadFilter();
    roomLp.type = 'lowpass';
    roomLp.frequency.value = 180;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.35;
    room.connect(roomLp).connect(roomGain).connect(this.out);
    // The lights' buzz.
    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 100;
    const buzzBp = ctx.createBiquadFilter();
    buzzBp.type = 'bandpass';
    buzzBp.frequency.value = 2600;
    buzzBp.Q.value = 3;
    this.buzz = ctx.createGain();
    this.buzz.gain.value = 0.018;
    const buzzPan = ctx.createStereoPanner();
    buzzPan.pan.value = 0.35;
    buzz.connect(buzzBp).connect(this.buzz).connect(buzzPan).connect(this.out);
    this.sources.push(buzz);
    // The conveyor: a rattle of grains (see rattle), through its own level,
    // swelling and fading over tens of seconds.
    this.conveyor = ctx.createGain();
    this.conveyor.gain.value = 0.5;
    const conveyorPan = ctx.createStereoPanner();
    conveyorPan.pan.value = -0.3;
    this.conveyor.connect(conveyorPan).connect(this.out);
    for (const s of this.sources) s.start(t);
    this.nextSwell = t;
  }

  // Up from silence over `seconds`.
  fadeIn(seconds = 1.5) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + seconds);
  }

  // Down to silence over `seconds`, then gone.
  stop(seconds = 0.6) {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + seconds);
    for (const s of this.sources) s.stop(t + seconds + 0.05);
    this.endAt = t + seconds + 3;
  }

  finished(now) {
    return this.stopped && now >= this.endAt;
  }

  dispose() {
    this.out.disconnect();
    this.wet.disconnect();
  }

  // Writes every one-shot due before `horizon`.
  schedule(horizon) {
    if (this.stopped) return;
    const rng = this.rng;
    const n = this.next;
    const now = this.ctx.currentTime;
    // Never a burst of late one-shots after a stall.
    for (const key of Object.keys(n)) if (n[key] < now - 0.5) n[key] = now + rng() * 0.5;
    while (n.rattle < horizon) {
      this.grain(n.rattle);
      n.rattle += between(rng, 0.045, 0.16);
    }
    while (n.press < horizon) {
      this.press(n.press, between(rng, 0.7, 1));
      if (rng() < 0.4) this.press(n.press + between(rng, 0.28, 0.5), between(rng, 0.5, 0.8));
      n.press += between(rng, 2.6, 7.5);
    }
    while (n.steam < horizon) {
      this.steam(n.steam);
      n.steam += between(rng, 9, 22);
    }
    while (n.clank < horizon) {
      this.clank(n.clank);
      n.clank += between(rng, 3.5, 11);
    }
    while (n.chain < horizon) {
      this.chain(n.chain);
      n.chain += between(rng, 12, 28);
    }
    while (n.flicker < horizon) {
      this.flicker(n.flicker);
      n.flicker += between(rng, 6, 18);
    }
    if (this.nextSwell < horizon) {
      const len = between(rng, 12, 30);
      this.conveyor.gain.linearRampToValueAtTime(between(rng, 0.15, 0.7), this.nextSwell + len);
      this.nextSwell += len;
    }
  }

  // ---- The sounds ------------------------------------------------------------------

  noiseThrough(t, { type, freq, q = 1, level, a, d, pan = 0, out = this.out }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.bank.noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + a);
    g.gain.setTargetAtTime(0, t + a, d);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(out);
    src.start(t, this.rng() * 1.5);
    src.stop(t + a + d * 7);
    return f;
  }

  // One grain of the conveyor's rattle.
  grain(t) {
    this.noiseThrough(t, {
      type: 'bandpass', freq: between(this.rng, 1400, 2600), q: 4, level: between(this.rng, 0.03, 0.09), a: 0.001, d: 0.012,
      pan: between(this.rng, -0.3, 0.3), out: this.conveyor,
    });
  }

  // A distant press: a heavy thump and the hiss of its release.
  press(t, strength) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(between(this.rng, 70, 85), t);
    o.frequency.setTargetAtTime(38, t, 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * strength, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.006, 0.12);
    const pan = between(this.rng, -0.6, 0.6);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(lp).connect(g).connect(p).connect(this.out);
    o.start(t);
    o.stop(t + 1);
    this.noiseThrough(t, { type: 'lowpass', freq: 900, level: 0.06 * strength, a: 0.003, d: 0.04, pan });
    this.noiseThrough(t + between(this.rng, 0.12, 0.25), {
      type: 'bandpass', freq: between(this.rng, 2500, 4200), q: 1.2, level: 0.025 * strength, a: 0.04, d: 0.12, pan,
    });
  }

  steam(t) {
    const len = between(this.rng, 0.4, 1.6);
    const f = this.noiseThrough(t, {
      type: 'highpass', freq: between(this.rng, 2600, 4000), q: 0.7, level: between(this.rng, 0.03, 0.06), a: 0.09, d: len / 2,
      pan: between(this.rng, -0.8, 0.8),
    });
    f.frequency.linearRampToValueAtTime(between(this.rng, 3800, 6000), t + len);
  }

  // A metal clank: a few inharmonic modes, struck somewhere in the hall.
  clank(t) {
    const ctx = this.ctx;
    const base = between(this.rng, 240, 820);
    const modes = this.rng() < 0.5 ? [1, 2.76, 5.4, 8.93] : [1, 1.58, 2.33, 3.1];
    const pan = between(this.rng, -0.7, 0.7);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = between(this.rng, 1800, 4000);
    lp.connect(p).connect(this.out);
    const level = between(this.rng, 0.02, 0.05);
    modes.forEach((ratio, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      const decay = between(this.rng, 0.15, 0.35) / (1 + i * 0.6);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level / (1 + i * 0.7), t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.002, decay);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + decay * 7 + 0.01);
    });
    this.noiseThrough(t, { type: 'bandpass', freq: base * 3, q: 2, level: level * 0.8, a: 0.001, d: 0.01, pan });
  }

  // A run of chain: small clinks, unevenly spaced.
  chain(t) {
    const count = Math.floor(between(this.rng, 6, 15));
    const pan = between(this.rng, -0.6, 0.6);
    let at = t;
    for (let i = 0; i < count; i += 1) {
      this.noiseThrough(at, {
        type: 'bandpass', freq: between(this.rng, 2800, 5200), q: 8, level: between(this.rng, 0.03, 0.07), a: 0.001, d: between(this.rng, 0.015, 0.03),
        pan: pan + between(this.rng, -0.1, 0.1),
      });
      at += between(this.rng, 0.05, 0.15);
    }
  }

  // The lights flicker: the buzz jumps up for a moment.
  flicker(t) {
    const g = this.buzz.gain;
    const steps = Math.floor(between(this.rng, 2, 5));
    let at = t;
    for (let i = 0; i < steps; i += 1) {
      g.setValueAtTime(0.045, at);
      at += between(this.rng, 0.03, 0.09);
      g.setValueAtTime(0.012, at);
      at += between(this.rng, 0.03, 0.12);
    }
    g.setValueAtTime(0.018, at);
  }
}
