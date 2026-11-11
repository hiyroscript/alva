// A stand-in for Web Audio in Node (the Sound update's tests): an
// AudioContext whose nodes connect, schedule and start exactly as the
// engine asks, recording everything, and sounding nothing. Its clock is
// the test's: set `ctx.currentTime` and call the engine's tick.
//
//   const audio = fakeAudio();
//   const engine = new AudioManager({ settings, win: audio.win, doc: audio.doc, AudioContextClass: audio.AudioContext, timers: audio.timers });
//   audio.win.press();           // a user gesture: the context is made
//   audio.ctx.currentTime = 2;   // two seconds on
//   engine.tick();
//   audio.created('createOscillator')   // how many were made

export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) {
    if (!(v > 0)) throw new RangeError('an exponential ramp needs a positive value');
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v, t, k) { this.events.push(['target', v, t, k]); return this; }
  setValueCurveAtTime(curve, t, d) { this.events.push(['curve', [...curve], t, d]); return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }

  // The last value it was asked to reach, whatever the curve.
  get target() {
    const e = this.events.at(-1);
    if (!e) return this.value;
    if (e[0] === 'curve') return e[1].at(-1);
    if (e[0] === 'cancel') return this.value;
    return e[1];
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    this.context = ctx;
  }

  connect(dest) {
    this.outputs.push(dest);
    return dest;
  }

  disconnect() {
    this.outputs.length = 0;
  }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind) {
    super(ctx, kind);
    this.started = null;
    this.stopped = null;
  }

  start(t = 0) {
    if (this.started !== null) throw new Error('started twice');
    this.started = t;
    this.ctx.starts.push(this);
  }

  stop(t = 0) {
    this.stopped = t;
  }
}

export class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(i) { return this.data[i]; }
  copyToChannel(source, i) { this.data[i].set(source.subarray(0, this.length)); }
}

export class FakeAudioContext {
  constructor({ sampleRate = 8000 } = {}) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new FakeNode(this, 'destination');
    this.counts = new Map();
    this.starts = [];
    this.calls = [];
  }

  count(kind) {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
  }

  createGain() {
    this.count('createGain');
    const n = new FakeNode(this, 'gain');
    n.gain = new FakeParam(1);
    return n;
  }

  createOscillator() {
    this.count('createOscillator');
    const n = new FakeSource(this, 'oscillator');
    n.type = 'sine';
    n.frequency = new FakeParam(440);
    n.detune = new FakeParam(0);
    return n;
  }

  createBufferSource() {
    this.count('createBufferSource');
    const n = new FakeSource(this, 'buffer');
    n.buffer = null;
    n.loop = false;
    n.playbackRate = new FakeParam(1);
    return n;
  }

  createBiquadFilter() {
    this.count('createBiquadFilter');
    const n = new FakeNode(this, 'filter');
    n.type = 'lowpass';
    n.frequency = new FakeParam(350);
    n.Q = new FakeParam(1);
    n.gain = new FakeParam(0);
    return n;
  }

  createStereoPanner() {
    this.count('createStereoPanner');
    const n = new FakeNode(this, 'panner');
    n.pan = new FakeParam(0);
    return n;
  }

  createConvolver() {
    this.count('createConvolver');
    const n = new FakeNode(this, 'convolver');
    n.buffer = null;
    return n;
  }

  createDynamicsCompressor() {
    this.count('createDynamicsCompressor');
    const n = new FakeNode(this, 'compressor');
    for (const p of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[p] = new FakeParam(0);
    return n;
  }

  createWaveShaper() {
    this.count('createWaveShaper');
    const n = new FakeNode(this, 'shaper');
    n.curve = null;
    return n;
  }

  createDelay() {
    this.count('createDelay');
    const n = new FakeNode(this, 'delay');
    n.delayTime = new FakeParam(0);
    return n;
  }

  createChannelMerger() {
    this.count('createChannelMerger');
    return new FakeNode(this, 'merger');
  }

  createBuffer(channels, length, sampleRate) {
    this.count('createBuffer');
    return new FakeBuffer(channels, length, sampleRate);
  }

  resume() {
    this.calls.push('resume');
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.calls.push('suspend');
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    this.calls.push('close');
    this.state = 'closed';
    return Promise.resolve();
  }

  // Every node made so far, of every kind.
  get made() {
    let n = 0;
    for (const v of this.counts.values()) n += v;
    return n;
  }
}

// A page for the engine: a window that takes listeners (and can be
// pressed), a document that can be hidden, timers the test drives, and the
// AudioContext class that makes (and remembers) one FakeAudioContext.
export function fakeAudio({ sampleRate = 8000 } = {}) {
  const listeners = new Map();
  const on = (map) => (type, fn) => {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(fn);
  };
  const off = (map) => (type, fn) => map.get(type)?.delete(fn);
  const fire = (map) => (type, event = {}) => {
    for (const fn of [...(map.get(type) ?? [])]) fn(event);
  };
  const docListeners = new Map();
  const result = { ctx: null, made: 0 };
  const win = {
    addEventListener: on(listeners),
    removeEventListener: off(listeners),
    fire: fire(listeners),
    press: () => fire(listeners)('pointerdown', {}),
  };
  const doc = {
    hidden: false,
    addEventListener: on(docListeners),
    removeEventListener: off(docListeners),
    setHidden(hidden) {
      this.hidden = hidden;
      fire(docListeners)('visibilitychange', {});
    },
  };
  const timers = {
    intervals: [],
    setInterval(fn) {
      this.intervals.push(fn);
      return this.intervals.length;
    },
    clearInterval() {},
  };
  function AudioContext() {
    result.made += 1;
    result.ctx = new FakeAudioContext({ sampleRate });
    return result.ctx;
  }
  return Object.assign(result, { win, doc, timers, AudioContext });
}
