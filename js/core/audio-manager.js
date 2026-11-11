// Alva's audio engine (the Sound update). Everything Alva sounds is made
// here, live, on Web Audio: no audio file is shipped or downloaded (see
// docs/systems/audio.md for why, and for every piece).
//
// What it holds:
//
//   - The buses: music and ambience (together the bed, ducked a little
//     under the big effects and by about 10 dB, darkened, while a battle is
//     paused), the sound effects, all into the master, then a glue
//     compressor and a limiter, then the speakers. Every level change is a
//     short ramp, never a jump.
//   - The music director (js/core/audio/director.js): which version of the
//     stage's theme plays (idle → battle → overtime → postVictory |
//     postDefeat | postDraw), carried out by the sequencer
//     (js/core/audio/sequencer.js) with one active version on the music bus
//     and equal-power crossfades on the beat or the bar.
//   - The sound effects (js/core/audio/sfx.js), at most SFX_LIMITS.perSound
//     of one at once and SFX_LIMITS.total in all, and one Shield hum per
//     fighter holding its Shield.
//   - Practice Ground's factory ambience (js/core/audio/ambience.js).
//   - The registry of the only sounds Alva has (js/core/audio/sounds.js):
//     anything else is refused, and a name nobody registered plays nothing
//     (the menus' `play('move')` stays silent).
//
// Nothing plays before a user gesture: the AudioContext is made on the
// first press or key, and a context the browser suspended (iOS, Safari) is
// resumed by any later gesture. The page hidden suspends it, shown resumes
// it. Muted (Settings › Audio), the master is silent and no effect is even
// made. Without Web Audio the game is silent and plays exactly as ever.
//
// The game drives it by events (battleStarted, overtimeStarted,
// overtimePressure, matchEnded, restarted, fighterEjected, deflected,
// blocked, shieldHeld, paused, resumed, left, practiceStarted), through
// BattleAudio (js/core/audio/battle-audio.js). It only listens: nothing here
// is read by the simulation, its timing or Online Play's lockstep.

import { SoundRegistry, THEMED_STAGES, MUSIC_VERSIONS, musicId, AMBIENCE, SFX } from './audio/sounds.js';
import { MusicDirector } from './audio/director.js';
import { audioPerspective, ejectionSound, endingVersion } from './audio/perspective.js';
import { MusicVoice, LOOKAHEAD, compileTheme } from './audio/sequencer.js';
import { SampleBank } from './audio/instruments.js';
import { SFX_RECIPES, ShieldHum } from './audio/sfx.js';
import { FactoryAmbience } from './audio/ambience.js';
import { THEMES } from './audio/themes/index.js';
import { DEFAULT_AUDIO, sanitizeAudio } from './settings.js';

// The mix: each bus at full volume, the bed's ducks and the pause's
// darkening.
export const MIX = Object.freeze({
  music: 0.62,
  ambience: 0.55,
  sfx: 0.95,
  // Under an ejection, a Deflect or a Perfect Shield: about -4 dB for a
  // quarter of a second.
  sfxDuck: 0.63,
  sfxDuckSeconds: 0.22,
  // While paused: about -10 dB and a gentle low-pass.
  pauseDuck: 0.316,
  pauseCutoff: 900,
});

// At most this many copies of one effect at once, and of all of them.
export const SFX_LIMITS = Object.freeze({ perSound: 2, total: 10, hums: 4 });

// How far one play of an effect may stray from the last, in pitch and in
// level (±4 %).
export const SFX_VARIATION = 0.04;

// The gestures that may unlock (or resume) the context: Pointer Events and
// keys, never Touch Events (the game uses none, see js/ui/touch-controls.js).
const UNLOCK_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'click', 'keydown']);

// The engine's timer: how often it writes the next notes (milliseconds).
const TICK_MS = 25;

// Every sound Alva has, registered once: the five themes' five versions,
// the ambience, the effects. Nothing else can be.
export function buildRegistry() {
  const registry = new SoundRegistry();
  for (const stage of THEMED_STAGES) {
    const theme = THEMES[stage];
    if (!theme) throw new Error(`[Alva] Stage "${stage}" has no theme`);
    const compiled = compileTheme(theme);
    for (const version of MUSIC_VERSIONS) {
      if (!compiled.versions[version]) throw new Error(`[Alva] Stage "${stage}" has no ${version} version`);
      registry.register(musicId(stage, version), { kind: 'music', stage, version });
    }
  }
  registry.register(AMBIENCE, { kind: 'ambience' });
  for (const id of Object.values(SFX)) {
    if (id === SFX.shieldHold) registry.register(id, { kind: 'loop' });
    else registry.register(id, { kind: 'sfx', recipe: SFX_RECIPES[id] });
  }
  return registry;
}

// A settings slider (0-100) as a gain: squared, so the travel feels even.
const volume = (value) => (Math.max(0, Math.min(100, value)) / 100) ** 2;

export class AudioManager {
  // `settings` (js/core/settings.js) gives the levels and the mute, and is
  // followed live. `win` / `doc` / `AudioContextClass` / `timers` are the
  // page's by default (tests pass their own).
  constructor({ settings = null, win = globalThis.window ?? null, doc = globalThis.document ?? null, AudioContextClass, timers = globalThis } = {}) {
    this.settings = settings;
    this.win = win;
    this.doc = doc;
    this.timers = timers;
    this.Ctx = AudioContextClass !== undefined ? AudioContextClass : (win?.AudioContext ?? win?.webkitAudioContext ?? null);
    this.registry = buildRegistry();
    this.director = new MusicDirector();
    this.perspective = audioPerspective('quick-battle');
    this.levels = { ...DEFAULT_AUDIO, ...(sanitizeAudio(settings?.audio ?? DEFAULT_AUDIO)) };
    this.ctx = null;
    this.voice = null;
    this.voices = new Set();
    this.rack = null;
    this.oldRacks = [];
    this.ambience = null;
    this.practice = false;
    // Whether the battle or Practice is paused (its menu): see setPaused.
    this.isPaused = false;
    this.hums = new Map();
    this.active = [];
    this.seed = 1;
    this.lastPreview = -Infinity;
    // Tests may set an array here to see what played.
    this.trace = null;
    settings?.onChange?.((name) => {
      if (name === 'audio') {
        this.levels = { ...DEFAULT_AUDIO, ...sanitizeAudio(settings.audio) };
        this.applyLevels();
      }
    });
    this.unlock = this.unlock.bind(this);
    for (const type of UNLOCK_EVENTS) win?.addEventListener?.(type, this.unlock, true);
    this.onVisibility = () => this.syncVisibility();
    doc?.addEventListener?.('visibilitychange', this.onVisibility);
  }

  get muted() {
    return !!this.levels.muted;
  }

  // ---- The context -----------------------------------------------------------------

  // A user gesture: the context is made (once), or resumed if the browser
  // suspended it. Never while the page is hidden.
  unlock() {
    if (!this.Ctx || this.doc?.hidden) return;
    if (!this.ctx) {
      try {
        this.ctx = new this.Ctx({ latencyHint: 'interactive' });
      } catch {
        try {
          this.ctx = new this.Ctx();
        } catch {
          this.Ctx = null;
          return;
        }
      }
      this.build();
      this.timer = this.timers.setInterval?.(() => this.tick(), TICK_MS) ?? null;
      this.catchUp();
    }
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume?.()?.catch?.(() => {});
  }

  build() {
    const ctx = this.ctx;
    this.bank = new SampleBank(ctx);
    const g = (value = 1) => {
      const n = ctx.createGain();
      n.gain.value = value;
      return n;
    };
    // Master: silent until the levels are applied (and while muted), so
    // nothing leaks during the unlock.
    this.master = g(0);
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 8;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.012;
    this.glue.release.value = 0.22;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;
    this.master.connect(this.glue).connect(this.limiter).connect(ctx.destination);
    this.bed = g();
    this.duck = g();
    this.pauseGain = g();
    this.pauseLp = ctx.createBiquadFilter();
    this.pauseLp.type = 'lowpass';
    this.pauseLp.frequency.value = 20000;
    this.bed.connect(this.duck).connect(this.pauseGain).connect(this.pauseLp).connect(this.master);
    // The music bus, its sub-bass cleaned below 30 Hz (nothing a speaker
    // plays, everything a limiter would waste headroom on).
    this.music = g(0);
    const clean = ctx.createBiquadFilter();
    clean.type = 'highpass';
    clean.frequency.value = 30;
    clean.Q.value = 0.6;
    this.music.connect(clean).connect(this.bed);
    this.ambienceBus = g(0);
    this.ambienceBus.connect(this.bed);
    this.sfx = g(0);
    this.sfx.connect(this.master);
    // The effects' own small room.
    this.sfxReverb = ctx.createConvolver();
    this.sfxReverb.buffer = this.bank.reverb(1.4, 0.5);
    this.sfxReverbIn = g();
    this.sfxReverbIn.connect(this.sfxReverb).connect(g(0.8)).connect(this.sfx);
    // The factory's hall, for the ambience.
    this.hall = ctx.createConvolver();
    this.hall.buffer = this.bank.reverb(3.2, 0.65);
    this.hall.connect(this.ambienceBus);
    this.applyLevels(true);
    // An instant of silence, played inside the gesture: older iOS needs it
    // to let the context sound at all.
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // Nothing to unlock.
    }
  }

  // The page hidden: everything stops where it is; shown: it goes on.
  syncVisibility() {
    if (!this.ctx) return;
    if (this.doc?.hidden) this.ctx.suspend?.()?.catch?.(() => {});
    else if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') this.ctx.resume?.()?.catch?.(() => {});
  }

  // Each bus at its level, by a short ramp (or at once, while building).
  applyLevels(immediate = false) {
    if (!this.ctx) return;
    const { master, music, sfx, muted } = this.levels;
    const set = (param, value) => {
      const t = this.ctx.currentTime;
      if (immediate) param.setValueAtTime(value, t);
      else {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.setTargetAtTime(value, t, 0.03);
      }
    };
    set(this.master.gain, muted ? 0 : volume(master));
    set(this.music.gain, volume(music) * MIX.music);
    set(this.ambienceBus.gain, volume(music) * MIX.ambience);
    set(this.sfx.gain, volume(sfx) * MIX.sfx);
  }

  // Writes the next notes of everything playing (the engine's timer).
  tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const v of this.voices) {
      v.schedule(horizon);
      if (v.finished(now)) {
        v.dispose();
        this.voices.delete(v);
      }
    }
    if (this.ambience) {
      this.ambience.schedule(horizon);
      if (this.ambience.finished(now)) {
        this.ambience.dispose();
        this.ambience = null;
      }
    }
    this.oldRacks = this.oldRacks.filter((r) => {
      if (now < r.releaseAt) return true;
      r.dispose();
      return false;
    });
  }

  // The context arrived mid-way (the first gesture came during a battle
  // or Practice): what should be playing starts now.
  catchUp() {
    if (this.director.version) this.transition({ version: this.director.version, quantize: 'now', fade: 0.05 }, { fresh: true });
    if (this.practice) this.startAmbience();
    if (this.isPaused) this.setPauseDuck(true);
  }

  // ---- Music -------------------------------------------------------------------------

  // The stage's effects: its reverb (its own room) and its delay.
  ensureRack(theme) {
    if (this.rack?.stage === theme.id) return this.rack;
    if (this.rack) this.releaseRack();
    const ctx = this.ctx;
    const reverbIn = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = this.bank.reverb(theme.reverb?.seconds ?? 2.4, theme.reverb?.damp ?? 0.5);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = theme.reverb?.level ?? 1;
    reverbIn.connect(reverb).connect(reverbOut).connect(this.music);
    // A ping-pong delay: left, right, left... a dotted eighth apart by
    // default, darker each time round.
    const delayIn = ctx.createGain();
    const left = ctx.createDelay(2);
    const right = ctx.createDelay(2);
    const feedback = ctx.createGain();
    feedback.gain.value = theme.delay?.feedback ?? 0.3;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2);
    const delayOut = ctx.createGain();
    delayOut.gain.value = theme.delay?.level ?? 0.8;
    delayIn.connect(left);
    left.connect(merger, 0, 0);
    left.connect(right);
    right.connect(merger, 0, 1);
    right.connect(feedback).connect(damp).connect(left);
    merger.connect(delayOut).connect(this.music);
    const beats = theme.delay?.beats ?? 0.75;
    const rack = {
      stage: theme.id,
      reverb: reverbIn,
      delay: delayIn,
      setTempo: (bpm, at) => {
        const time = Math.min(1.9, (60 / bpm) * beats);
        left.delayTime.setValueAtTime(time, at);
        right.delayTime.setValueAtTime(time, at);
      },
      dispose: () => {
        reverbOut.disconnect();
        delayOut.disconnect();
        feedback.disconnect();
      },
    };
    rack.setTempo(theme.bpm, ctx.currentTime);
    this.rack = rack;
    return rack;
  }

  releaseRack() {
    if (!this.rack) return;
    this.rack.releaseAt = (this.ctx?.currentTime ?? 0) + 4;
    this.oldRacks.push(this.rack);
    this.rack = null;
  }

  // Carries out the director's `change` ({ version, quantize, fade }): the
  // version playing stops at the next beat or bar (or now) and fades out
  // over `fade`, equal-power, as the new one starts there. A change made
  // `now` with a version playing waits for that one to fade first, so the
  // two never double up (a restart starts its intro clean).
  transition(change, { fresh = false } = {}) {
    if (!change || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const current = fresh ? null : this.voice;
    if (change.version === null) {
      current?.stop(now, change.fade);
      this.voice = null;
      this.releaseRack();
      this.trace?.push({ type: 'music', version: null, at: now });
      return;
    }
    const theme = THEMES[this.director.stage];
    if (!theme) return;
    const rack = this.ensureRack(theme);
    let at = now + 0.06;
    let fadeIn = 0.02;
    if (current && current.stopTime > now) {
      if (change.quantize === 'now') {
        current.stop(now, change.fade);
        at = now + change.fade;
      } else {
        at = current.boundary(Math.max(now + 0.04, current.nextTime), change.quantize);
        current.stop(at, change.fade);
        fadeIn = 0.012;
      }
    }
    this.seed += 1;
    const voice = new MusicVoice({
      ctx, bank: this.bank, theme, versionId: change.version, rack, dest: this.music, start: at, fadeIn, intensity: this.director.intensity, seed: this.seed,
    });
    rack.setTempo(voice.version.bpm, at);
    this.voice = voice;
    this.voices.add(voice);
    voice.schedule(now + LOOKAHEAD);
    this.trace?.push({ type: 'music', version: change.version, stage: this.director.stage, at, quantize: change.quantize });
  }

  // ---- Events from the game ------------------------------------------------------------

  // A battle on `stageId` in `mode` begins (its intro): that stage's Main
  // Battle from its intro. Online, `localSlot` is this device's side. A
  // stage with no theme plays nothing.
  battleStarted(stageId, mode, { localSlot = 'p1' } = {}) {
    this.perspective = audioPerspective(mode, { localSlot });
    this.practice = false;
    this.stopAmbience();
    this.stopHums();
    this.setPaused(false);
    if (!Object.hasOwn(THEMES, stageId)) {
      this.transition(this.director.leave());
      return;
    }
    this.transition(this.director.start(stageId));
  }

  // Practice Ground begins: its ambience, no music.
  practiceStarted() {
    this.perspective = audioPerspective('practice');
    this.transition(this.director.leave());
    this.stopHums();
    this.setPaused(false);
    this.practice = true;
    this.startAmbience();
  }

  overtimeStarted() {
    this.transition(this.director.overtime());
  }

  // Overtime's Void pressure (Battle.overtimeVoidPressure), 0-1, as it
  // stands: the music's intensity follows it (never while paused).
  overtimePressure(p) {
    const intensity = this.director.pressure(p);
    if (this.voice?.versionId === 'overtime') this.voice.setIntensity(intensity);
  }

  // The match ended, won by side `winner` ('p1' / 'p2', or null for a
  // draw): the stage's Victory, Defeat or Draw, from this mode's point of
  // view, on the next beat.
  matchEnded(winner) {
    const version = endingVersion(this.perspective, winner ?? null);
    if (version) this.transition(this.director.end(version));
  }

  // A restart or rematch: the Main Battle from its intro, overtime's
  // intensity back to 0.
  restarted() {
    this.stopHums();
    this.transition(this.director.restart());
  }

  // `fighter` (anything with a `slot`, or a slot) left play to the Void or
  // was ejected: once per exit (the caller's rule).
  fighterEjected(fighter, { pan = 0 } = {}) {
    const slot = typeof fighter === 'string' ? fighter : fighter?.slot;
    this.stopHum(fighter);
    return this.playSfx(ejectionSound(this.perspective, slot), { pan, duck: true });
  }

  // A Deflect turned a projectile back (once per Deflect), toward
  // `direction` (-1 left, 1 right).
  deflected(fighter, { pan = 0, direction = 1 } = {}) {
    return this.playSfx(SFX.deflect, { pan, direction, duck: true });
  }

  // A Shield blocked a hit: the Perfect Shield's sound for a perfect one,
  // in place of the block's (never both).
  blocked(fighter, { perfect = false, pan = 0 } = {}) {
    return this.playSfx(perfect ? SFX.perfectShield : SFX.block, { pan, duck: perfect });
  }

  // `fighter`'s Shield raised (`on`) or lowered.
  shieldHeld(fighter, on, { pan = 0 } = {}) {
    if (!on) {
      this.stopHum(fighter);
      return;
    }
    if (this.hums.has(fighter)) {
      this.hums.get(fighter).setPan(pan);
      return;
    }
    if (!this.ctx || this.ctx.state !== 'running' || this.hums.size >= SFX_LIMITS.hums) return;
    const hum = new ShieldHum(this.ctx, this.sfx, { pan, pitch: 1 + (Math.random() * 2 - 1) * 0.02 });
    this.hums.set(fighter, hum);
    if (!this.isPaused) hum.fadeIn();
    this.trace?.push({ type: 'hum', on: true });
  }

  // A held Shield's place on screen.
  shieldPan(fighter, pan) {
    this.hums.get(fighter)?.setPan(pan);
  }

  stopHum(fighter) {
    const hum = this.hums.get(fighter);
    if (!hum) return;
    hum.stop();
    this.hums.delete(fighter);
    this.trace?.push({ type: 'hum', on: false });
  }

  stopHums() {
    for (const fighter of [...this.hums.keys()]) this.stopHum(fighter);
  }

  // The battle or Practice paused (its menu): the bed ducks and darkens,
  // the Shield hums hold, overtime's intensity stays where it is.
  paused() {
    this.setPaused(true);
  }

  resumed() {
    this.setPaused(false);
  }

  setPaused(on) {
    if (on) this.director.pause();
    else this.director.resume();
    if (this.isPaused === on) return;
    this.isPaused = on;
    this.setPauseDuck(on);
    for (const hum of this.hums.values()) {
      if (on) hum.hold();
      else if (hum.on) hum.fadeIn();
    }
  }

  setPauseDuck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pauseGain.gain.setTargetAtTime(on ? MIX.pauseDuck : 1, t, 0.08);
    this.pauseLp.frequency.setTargetAtTime(on ? MIX.pauseCutoff : 20000, t, 0.1);
  }

  // Leaving the battle or Practice: everything fades out (music in about
  // 0.6 s), nothing keeps playing on the menus.
  left() {
    this.transition(this.director.leave());
    this.stopAmbience();
    this.stopHums();
    this.practice = false;
    this.setPaused(false);
  }

  // Settings › Audio: the effects slider moved, so a Shield block plays (at
  // most a few times a second).
  previewSfx() {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastPreview < 0.12) return false;
    this.lastPreview = now;
    return this.playSfx(SFX.block, { pan: 0 });
  }

  // The old foundation's call (the menus' 'move'): plays a registered
  // effect, and nothing at all for any other name.
  play(name) {
    const entry = this.registry.get(name);
    if (entry?.kind !== 'sfx') return false;
    return this.playSfx(name);
  }

  // ---- Effects --------------------------------------------------------------------------

  // Plays effect `id` (one of ALLOWED_SOUNDS' effects) now, within the
  // voice limits, varied a little; under it the bed ducks when `duck`.
  // Nothing is made while muted, silent or not yet unlocked.
  playSfx(id, { pan = 0, direction = 1, duck = false } = {}) {
    const entry = this.registry.get(id);
    if (entry?.kind !== 'sfx') return false;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || this.levels.master <= 0 || this.levels.sfx <= 0) return false;
    const now = ctx.currentTime;
    this.active = this.active.filter((a) => a.end > now);
    if (this.active.length >= SFX_LIMITS.total) return false;
    if (this.active.filter((a) => a.id === id).length >= SFX_LIMITS.perSound) return false;
    const vary = () => 1 + (Math.random() * 2 - 1) * SFX_VARIATION;
    const t = now + 0.005;
    const end = entry.recipe(ctx, this.sfx, t, {
      pitch: vary(), level: vary(), pan: Math.max(-1, Math.min(1, pan)), direction: direction < 0 ? -1 : 1, reverb: this.sfxReverbIn,
    }, this.bank);
    this.active.push({ id, end });
    if (duck) this.duckBed(t);
    this.trace?.push({ type: 'sfx', id, at: t });
    return true;
  }

  // The bed dips under a big effect so it punches through.
  duckBed(t) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(MIX.sfxDuck, t, 0.01);
    g.setTargetAtTime(1, t + MIX.sfxDuckSeconds, 0.08);
  }

  // ---- Ambience ----------------------------------------------------------------------------

  startAmbience() {
    if (!this.ctx || this.ambience) return;
    this.ambience = new FactoryAmbience({ ctx: this.ctx, bank: this.bank, dest: this.ambienceBus, reverb: this.hall, seed: Math.floor(Math.random() * 2 ** 31) });
    this.ambience.fadeIn(1.5);
    this.ambience.schedule(this.ctx.currentTime + LOOKAHEAD);
    this.trace?.push({ type: 'ambience', on: true });
  }

  stopAmbience() {
    if (!this.ambience || this.ambience.stopped) return;
    this.ambience.stop(0.6);
    this.trace?.push({ type: 'ambience', on: false });
  }

  // Lets the page go (tests): the timer, the listeners and the context.
  destroy() {
    if (this.timer) this.timers.clearInterval?.(this.timer);
    for (const type of UNLOCK_EVENTS) this.win?.removeEventListener?.(type, this.unlock, true);
    this.doc?.removeEventListener?.('visibilitychange', this.onVisibility);
    this.ctx?.close?.()?.catch?.(() => {});
  }
}
