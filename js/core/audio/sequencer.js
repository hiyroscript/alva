// The music sequencer (the Sound update): plays one version of a stage's
// theme (js/core/audio/themes/) on the audio clock, a sixteenth at a time,
// scheduled a little ahead (LOOKAHEAD) by the engine's timer, so the beat
// never depends on the game's frames.
//
// A theme is data: its tempo, tonic and scale, its channels (each an
// instrument with its level, pan, octave and effect sends), its parts
// (melodies in scale degrees, chord-relative lines, chords, drum beats,
// held notes; see js/core/audio/theory.js for the notation) and its
// versions. A version is its sections in order: `once` (an intro, a
// pickup, a sting), then `loop`, played round and round. A section is a
// number of bars, a chord a bar, and what each channel plays: a part, or a
// list of parts taken in turn on each pass of the loop (null: silent that
// pass), so the music changes as it comes round. A section may lift the key
// (`transpose`), end on a drum fill (`fill`), open on a crash (`crash`) and
// build to its end with a riser (`riser`, in bars).
//
// A version's `overtime` adds the layers overtime's intensity (the closing
// Void's pressure, 0-1) brings in: the clock's ticking getting denser, a
// pulsing sub, risers coming round more often, a cluster of strings bending
// sharp, a filter opening; any part may also be gated by intensity (`min`,
// `max`). Intensity is read as each bar is written and the filter follows
// it continuously.
//
// MusicVoice is one version playing: its channels, its sidechain pump (the
// pads ducking under each kick), and its faders, which the engine crossfades
// with equal-power curves. Nothing here reads the game: the engine hands it
// the time and the intensity.

import {
  SCALES, STEPS_PER_BAR, parseMelody, parseLine, parseChords, parseRhythm, degreeSemis, chordVoicing, lineSemis, midiToFreq,
} from './theory.js';
import { playNote } from './instruments.js';
import { BAR_QUANTUM_LIMIT } from './director.js';
import { audioRng } from './dsp.js';

// How far ahead of the audio clock notes are scheduled (seconds).
export const LOOKAHEAD = 0.2;
// How much later than the version's own end a voice is kept before its
// nodes are let go (its reverb and release tails).
const TAIL = 2.5;

const asList = (value) => (Array.isArray(value) ? value : [value]);

// ---- Compiling a theme ------------------------------------------------------------

// A line's length must fit the bar: a whole number of bars, or a part of
// one that divides it (a beat, half a bar).
function checkLength(name, steps) {
  if (steps % STEPS_PER_BAR === 0 || STEPS_PER_BAR % steps === 0) return;
  throw new Error(`[Alva] Part "${name}" is ${steps} sixteenths long: not a whole number of bars`);
}

function compilePart(name, spec) {
  const checked = (part) => {
    checkLength(name, part.steps);
    return part;
  };
  if (spec.melody !== undefined) return checked({ kind: 'melody', ...parseMelody(spec.melody) });
  if (spec.line !== undefined) return checked({ kind: 'line', ...parseLine(spec.line) });
  if (spec.beat !== undefined) {
    const lines = Object.fromEntries(Object.entries(spec.beat).map(([channel, text]) => [channel, parseRhythm(text)]));
    for (const rhythm of Object.values(lines)) checkLength(name, rhythm.steps);
    return { kind: 'beat', lines };
  }
  if (spec.chord !== undefined) {
    const rhythm = spec.rhythm ? parseRhythm(spec.rhythm) : null;
    return { kind: 'chord', len: spec.chord, rhythm, open: !!spec.open, top: spec.top ?? null };
  }
  if (spec.hold !== undefined) return { kind: 'hold', degree: spec.hold, len: spec.len ?? STEPS_PER_BAR, every: spec.every ?? STEPS_PER_BAR };
  if (spec.hits !== undefined) return checked({ kind: 'rhythm', ...parseRhythm(spec.hits) });
  throw new Error(`[Alva] Part "${name}" has no content`);
}

function compileEntry(entry) {
  if (entry === null) return null;
  if (typeof entry === 'string') return { part: entry };
  return { ...entry };
}

function compileSection(theme, name, spec) {
  const play = {};
  for (const [channel, value] of Object.entries(spec.play ?? {})) {
    const entries = asList(value).map(compileEntry);
    for (const e of entries) {
      if (!e) continue;
      if (!theme.parts[e.part]) throw new Error(`[Alva] Section "${name}" plays unknown part "${e.part}"`);
      if (channel !== 'beat' && !theme.channels[channel]) throw new Error(`[Alva] Section "${name}" plays on unknown channel "${channel}"`);
    }
    play[channel] = entries;
  }
  if (spec.fill && !theme.parts[spec.fill]) throw new Error(`[Alva] Section "${name}" fills with unknown part "${spec.fill}"`);
  return {
    name,
    bars: spec.bars,
    chords: parseChords(spec.chords ?? '1'),
    play,
    transpose: spec.transpose ?? 0,
    fill: spec.fill ?? null,
    crash: spec.crash ?? false,
    riser: spec.riser ?? 0,
    hit: spec.hit ?? null,
  };
}

const compiled = new WeakMap();

// A theme parsed once: every part, section and version checked, so a typo
// fails loudly at load, never quietly in play.
export function compileTheme(theme) {
  if (compiled.has(theme)) return compiled.get(theme);
  const parts = Object.fromEntries(Object.entries(theme.parts).map(([name, spec]) => [name, compilePart(name, spec)]));
  const withParts = { ...theme, parts };
  for (const [name, part] of Object.entries(parts)) {
    if (part.kind !== 'beat') continue;
    for (const channel of Object.keys(part.lines)) {
      if (!theme.channels[channel]) throw new Error(`[Alva] Beat "${name}" plays on unknown channel "${channel}"`);
    }
  }
  const sections = Object.fromEntries(Object.entries(theme.sections).map(([name, spec]) => [name, compileSection(withParts, name, spec)]));
  const versions = {};
  for (const [id, v] of Object.entries(theme.versions)) {
    for (const s of [...v.once, ...v.loop]) if (!sections[s]) throw new Error(`[Alva] Version "${id}" plays unknown section "${s}"`);
    const scale = SCALES[v.scale ?? theme.scale];
    if (!scale) throw new Error(`[Alva] Version "${id}" has unknown scale "${v.scale ?? theme.scale}"`);
    versions[id] = Object.freeze({
      id,
      bpm: v.bpm ?? theme.bpm,
      scale,
      transpose: v.transpose ?? 0,
      swing: v.swing ?? theme.swing ?? 0,
      once: v.once,
      loop: v.loop,
      overtime: v.overtime ?? null,
      level: v.level ?? 1,
      lowpass: v.lowpass ?? null,
    });
  }
  const result = Object.freeze({ ...withParts, sections, versions });
  compiled.set(theme, result);
  return result;
}

// How long one pass of the version's loop lasts (seconds), and its intro.
export function versionLength(theme, versionId) {
  const t = compileTheme(theme);
  const v = t.versions[versionId];
  const bar = (60 / v.bpm) * 4;
  const bars = (list) => list.reduce((n, s) => n + t.sections[s].bars, 0);
  return { once: bars(v.once) * bar, loop: bars(v.loop) * bar, bar, beat: 60 / v.bpm };
}

// ---- Writing a bar -----------------------------------------------------------------

// The events of bar `bar` of `section`, on pass `pass` of the loop, at
// overtime intensity `intensity`: [{ step, channel, midi | midis, len, vel }].
export function renderBar(theme, version, section, bar, pass, intensity = 0) {
  const events = [];
  const chord = section.chords[bar % section.chords.length];
  const scale = version.scale;
  const base = theme.tonic + version.transpose + section.transpose;
  const from = bar * STEPS_PER_BAR;
  const to = from + STEPS_PER_BAR;
  const last = bar === section.bars - 1;
  const octaveOf = (channel, entry) => (theme.channels[channel]?.octave ?? 0) + (entry?.octave ?? 0);

  // Each event of a part that loops every `steps` sixteenths, inside this
  // bar.
  const within = (steps, list, fn) => {
    if (!(steps > 0)) return;
    for (const e of list) {
      for (let k = Math.floor((from - e.step) / steps); k * steps + e.step < to; k += 1) {
        const s = k * steps + e.step;
        if (s >= from && s < to) fn(e, s - from);
      }
    }
  };

  const playEntry = (channel, entry) => {
    const part = theme.parts[entry.part];
    const vel = entry.vel ?? 1;
    const oct = octaveOf(channel, entry);
    switch (part.kind) {
      case 'melody':
        within(part.steps, part.events, (e, step) => {
          // `shift`: the same line a number of scale degrees higher (2: a
          // third above, in harmony).
          const midi = base + degreeSemis(scale, e.value + (entry.shift ?? 0)) + e.acc + 12 * (e.octave + oct);
          // `repeat`: each note picked again every that many sixteenths
          // (a surf guitar's tremolo picking), within this bar.
          if (entry.repeat) {
            for (let r = 0; r < e.len && step + r < STEPS_PER_BAR; r += entry.repeat) {
              events.push({ step: step + r, channel, midi, len: entry.repeat, vel: e.vel * vel * (r === 0 ? 1 : 0.8) });
            }
          } else events.push({ step, channel, midi, len: e.len, vel: e.vel * vel });
        });
        break;
      case 'line':
        within(part.steps, part.events, (e, step) => {
          const midi = base + lineSemis(scale, chord, e.value) + e.acc + 12 * (e.octave + oct);
          events.push({ step, channel, midi, len: e.len, vel: e.vel * vel });
        });
        break;
      case 'chord': {
        const voicing = chordVoicing(scale, chord).map((s) => base + s + 12 * oct);
        if (part.open) voicing[0] -= 12;
        if (part.top !== null) voicing.push(base + degreeSemis(scale, part.top) + 12 * oct);
        if (part.rhythm) {
          within(part.rhythm.steps, part.rhythm.hits, (e, step) => events.push({ step, channel, midis: voicing, len: part.len, vel: e.vel * vel }));
        } else {
          for (let s = 0; s < STEPS_PER_BAR; s += part.len) events.push({ step: s, channel, midis: voicing, len: part.len, vel: 0.8 * vel });
        }
        break;
      }
      case 'hold': {
        if ((from % part.every) !== 0 && part.every > STEPS_PER_BAR) break;
        const root = part.degree === 'R' ? lineSemis(scale, chord, 'R') : degreeSemis(scale, part.degree);
        for (let s = 0; s < STEPS_PER_BAR; s += Math.min(part.every, STEPS_PER_BAR)) {
          events.push({ step: s, channel, midi: base + root + 12 * oct, len: part.len, vel: 0.8 * vel });
        }
        break;
      }
      case 'rhythm':
        within(part.steps, part.hits, (e, step) => events.push({ step, channel, midi: base + 12 * oct, len: 1, vel: e.vel * vel }));
        break;
      case 'beat':
        for (const [line, rhythm] of Object.entries(part.lines)) {
          within(rhythm.steps, rhythm.hits, (e, step) => events.push({ step, channel: line, midi: base, len: 1, vel: e.vel * vel }));
        }
        break;
      default:
        break;
    }
  };

  const allowed = (entry) => entry && intensity >= (entry.min ?? 0) && intensity <= (entry.max ?? 1);
  for (const [channel, entries] of Object.entries(section.play)) {
    let entry = entries[pass % entries.length];
    if (channel === 'beat' && last && section.fill) entry = { part: section.fill };
    if (!allowed(entry)) continue;
    playEntry(channel, entry);
  }
  if (bar === 0 && section.crash && theme.channels.crash) events.push({ step: 0, channel: 'crash', midi: base, len: 1, vel: 1 });
  if (section.hit && bar === section.hit.bar && theme.channels[section.hit.channel ?? 'boom']) {
    events.push({ step: section.hit.step ?? 0, channel: section.hit.channel ?? 'boom', midi: base, len: 1, vel: 1 });
  }
  if (section.riser && bar === section.bars - section.riser && theme.channels.riser) {
    events.push({ step: 0, channel: 'riser', midi: base + 12 * octaveOf('riser'), len: section.riser * STEPS_PER_BAR, vel: 1 });
  }
  if (version.overtime) overtimeLayers(theme, version, chord, base, bar, intensity, events);
  return events;
}

// Overtime's own layers, written from its intensity (0-1) as each bar
// comes: the clock (quarters, then eighths, then sixteenths), the sub's
// pulse (from 0.2: eighths, sixteenths from 0.7), risers (every four bars
// from 0.45, every two from 0.75, every bar from 0.92) and the strings'
// cluster (from 0.35, bending up to a semitone sharp).
function overtimeLayers(theme, version, chord, base, bar, intensity, events) {
  const ot = version.overtime;
  const ch = theme.channels;
  const scale = version.scale;
  if (ot.tick && ch[ot.tick]) {
    const every = intensity >= 0.65 ? 1 : intensity >= 0.3 ? 2 : 4;
    for (let s = 0; s < STEPS_PER_BAR; s += every) {
      const accent = s % 4 === 0;
      events.push({ step: s, channel: s % 8 === 4 ? ot.tock ?? ot.tick : ot.tick, midi: base, len: 1, vel: accent ? 0.9 : 0.55 + 0.3 * intensity });
    }
  }
  if (ot.pulse && ch[ot.pulse] && intensity >= 0.2) {
    const every = intensity >= 0.7 ? 1 : 2;
    const root = base + lineSemis(scale, chord, 'R') + 12 * (ch[ot.pulse].octave ?? -2);
    for (let s = 0; s < STEPS_PER_BAR; s += every) events.push({ step: s, channel: ot.pulse, midi: root, len: every, vel: s % 4 === 0 ? 1 : 0.7 });
  }
  if (ot.riser && ch[ot.riser] && intensity >= 0.45) {
    const period = intensity >= 0.92 ? 1 : intensity >= 0.75 ? 2 : 4;
    if (bar % period === 0) {
      events.push({ step: 0, channel: ot.riser, midi: base + 12 * (ch[ot.riser].octave ?? 0), len: period * STEPS_PER_BAR, vel: 0.6 + 0.4 * intensity });
    }
  }
  if (ot.tension && ch[ot.tension] && intensity >= 0.35) {
    events.push({
      step: 0, channel: ot.tension, midi: base + lineSemis(scale, chord, 'R') + 12 * (ch[ot.tension].octave ?? 1),
      len: STEPS_PER_BAR, vel: 0.5 + 0.5 * intensity, cents: 100 * intensity,
    });
  }
}

// ---- A version playing ---------------------------------------------------------------

export class MusicVoice {
  // `rack`: the stage's shared effects ({ reverb, delay } inputs) and the
  // music bus (`dest`). `start`: when its first bar begins (audio time).
  constructor({ ctx, bank, theme, versionId, rack, dest, start, fadeIn = 0.02, intensity = 0, seed = 1 }) {
    this.ctx = ctx;
    this.bank = bank;
    this.theme = compileTheme(theme);
    this.version = this.theme.versions[versionId];
    if (!this.version) throw new Error(`[Alva] Theme "${theme.id}" has no version "${versionId}"`);
    this.versionId = versionId;
    this.rng = audioRng(seed);
    this.start = start;
    this.beat = 60 / this.version.bpm;
    this.stepDur = this.beat / 4;
    this.barDur = this.beat * 4;
    this.intensity = intensity;
    this.stopTime = Infinity;
    this.disposeAt = Infinity;
    this.disposed = false;
    // Where the version is: its sections in order, the pass of the loop.
    this.order = [...this.version.once, ...this.version.loop];
    this.sectionIndex = 0;
    this.bar = 0;
    this.pass = 0;
    this.step = 0;
    this.stepIndex = 0;
    this.barEvents = null;
    this.lastMidi = new Map();

    // Its graph: channels → mix (pumped channels through `pump`) → lowpass
    // (overtime's opening filter) → dry fader → the music bus; each
    // channel's reverb and delay sends through faders of their own, so a
    // fade takes the whole version, sends included.
    const level = this.version.level * (this.theme.level ?? 1);
    this.mix = ctx.createGain();
    this.mix.gain.value = level;
    this.pump = ctx.createGain();
    this.pump.connect(this.mix);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.9;
    this.lp.frequency.value = this.cutoff(intensity);
    this.faders = [ctx.createGain(), ctx.createGain(), ctx.createGain()];
    const [dry, wet, echo] = this.faders;
    this.mix.connect(this.lp).connect(dry).connect(dest);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = level;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = level;
    this.reverbSend.connect(wet).connect(rack.reverb);
    this.delaySend.connect(echo).connect(rack.delay);
    // Faded in from silence on its first beat (equal power when the fade is
    // long enough to hear its shape).
    this.fadeInEnd = start + Math.max(0.005, fadeIn);
    for (const f of this.faders) {
      f.gain.setValueAtTime(0, Math.max(0, start - 0.001));
      if (fadeIn > 0.03) f.gain.setValueCurveAtTime(equalPower(true), start, fadeIn);
      else f.gain.linearRampToValueAtTime(1, this.fadeInEnd);
    }
    this.channels = new Map();
  }

  // The lowpass's cutoff at intensity `p`: wide open outside overtime.
  cutoff(p) {
    const range = this.version.lowpass;
    if (!range) return 20000;
    const [lo, hi] = range;
    return lo * (hi / lo) ** Math.min(1, Math.max(0, p)) ** 0.8;
  }

  // Channel `name`'s strip, made the first time it plays.
  channel(name) {
    let strip = this.channels.get(name);
    if (strip) return strip;
    const spec = this.theme.channels[name];
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = spec.gain ?? 1;
    const pan = ctx.createStereoPanner();
    pan.pan.value = spec.pan ?? 0;
    input.connect(pan);
    pan.connect(spec.pump ? this.pump : this.mix);
    if (spec.reverb) {
      const send = ctx.createGain();
      send.gain.value = spec.reverb;
      pan.connect(send).connect(this.reverbSend);
    }
    if (spec.delay) {
      const send = ctx.createGain();
      send.gain.value = spec.delay;
      pan.connect(send).connect(this.delaySend);
    }
    strip = { input, spec };
    this.channels.set(name, strip);
    return strip;
  }

  // The current section.
  get section() {
    return this.theme.sections[this.order[this.sectionIndex]];
  }

  // Overtime's intensity, 0-1: the next bars are written for it, and the
  // filter follows it at once.
  setIntensity(p, at = this.ctx.currentTime) {
    const next = Math.min(1, Math.max(0, Number(p) || 0));
    if (Math.abs(next - this.intensity) < 1e-4) return;
    this.intensity = next;
    if (this.version.lowpass) this.lp.frequency.setTargetAtTime(this.cutoff(next), at, 0.3);
  }

  // The time of the next beat, or bar (a beat when a bar is longer than
  // BAR_QUANTUM_LIMIT), at or after `after`: where a change of version lands.
  boundary(after, quantize) {
    if (quantize === 'now') return after;
    const unit = quantize === 'beat' || this.barDur > BAR_QUANTUM_LIMIT ? this.beat : this.barDur;
    const k = Math.max(0, Math.ceil((after - this.start) / unit - 1e-6));
    return this.start + k * unit;
  }

  // The time the next unscheduled sixteenth would play: nothing before it
  // can be changed any more.
  get nextTime() {
    return this.start + this.stepIndex * this.stepDur;
  }

  // Writes every sixteenth due before `horizon` (audio time).
  schedule(horizon) {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    // Far behind (a starved timer, a suspended page): skip to now rather
    // than play a burst of late notes.
    while (this.nextTime < now - 0.05 && this.nextTime < this.stopTime) this.advance(false);
    while (this.nextTime < horizon && this.nextTime < this.stopTime) this.advance(true);
  }

  // One sixteenth: its notes (when `play`), then on to the next.
  advance(play) {
    if (this.step === 0) {
      this.barEvents = renderBar(this.theme, this.version, this.section, this.bar, this.pass, this.intensity);
    }
    if (play) {
      const swing = this.step % 2 === 1 ? this.version.swing * this.stepDur : 0;
      const t = this.nextTime + swing;
      for (const e of this.barEvents) if (e.step === this.step) this.playEvent(e, t);
    }
    this.stepIndex += 1;
    this.step += 1;
    if (this.step < STEPS_PER_BAR) return;
    this.step = 0;
    this.bar += 1;
    if (this.bar < this.section.bars) return;
    this.bar = 0;
    this.sectionIndex += 1;
    if (this.sectionIndex >= this.order.length) {
      this.sectionIndex = this.version.once.length;
      this.pass += 1;
    }
  }

  playEvent(e, t) {
    const strip = this.channel(e.channel);
    const spec = strip.spec;
    // A little life: never two hits exactly alike.
    const vel = Math.min(1, e.vel * (0.95 + this.rng() * 0.1));
    const dur = e.len * this.stepDur * (spec.legato ?? 0.92);
    const note = { midi: e.midi, midis: e.midis, freq: e.midi !== undefined ? midiToFreq(e.midi) : undefined, dur, vel };
    if (e.midis) note.freqs = e.midis.map(midiToFreq);
    if (spec.glide && e.midi !== undefined) {
      const prev = this.lastMidi.get(e.channel);
      if (prev !== undefined && prev !== e.midi) note.from = midiToFreq(prev);
      this.lastMidi.set(e.channel, e.midi);
    }
    const params = e.cents !== undefined ? { ...spec.params, cents: e.cents } : spec.params;
    playNote(this.ctx, strip.input, this.bank, params === spec.params ? spec : { ...spec, params }, t, note);
    if (spec.duck) this.duck(t, spec.duck);
  }

  // The sidechain pump: the pads dip under the kick and swell back.
  duck(t, depth) {
    const g = this.pump.gain;
    g.setTargetAtTime(1 - depth, t, 0.004);
    g.setTargetAtTime(1, t + 0.03, this.beat * 0.16);
  }

  // Stops writing at `at` (audio time) and fades out over `fade` seconds
  // from there (equal power), then lets its nodes go.
  stop(at, fade) {
    if (this.stopTime <= at) return;
    this.stopTime = at;
    // Never inside its own fade in (an automation curve may not overlap
    // another).
    const from = Math.max(at, this.fadeInEnd + 0.002);
    const len = Math.max(0.01, fade);
    for (const f of this.faders) {
      f.gain.cancelScheduledValues(from);
      try {
        if (len > 0.03) f.gain.setValueCurveAtTime(equalPower(false), from, len);
        else throw new Error('short');
      } catch {
        f.gain.setValueAtTime(1, from);
        f.gain.linearRampToValueAtTime(0, from + len);
      }
    }
    this.disposeAt = from + len + TAIL;
  }

  // Whether its last sound is over (audio time `now`).
  finished(now) {
    return now >= this.disposeAt;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.faders) f.disconnect();
    this.reverbSend.disconnect();
    this.delaySend.disconnect();
  }
}

// An equal-power fade curve: in (a quarter sine) or out (a quarter
// cosine), so a crossfade's two sides always sum to the same power.
export function equalPower(fadeIn) {
  const n = 32;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i / (n - 1);
    curve[i] = fadeIn ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return curve;
}
