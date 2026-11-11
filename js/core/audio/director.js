// The music's state machine (the Sound update): which version of the
// stage's theme plays, and when a change of version happens. Pure: no Web
// Audio here. The engine (js/core/audio-manager.js) carries each change
// out on the music bus, where only one version is ever the active voice.
//
//   idle ──start──▶ battle ──overtime──▶ overtime
//                     │                     │
//                     └──────end────────────┴──▶ postVictory | postDefeat | postDraw
//
//   restart (from any state but idle) ──▶ battle, from its intro, intensity 0
//   leave (from any state) ──▶ idle
//
// Each method returns the change it asks for, or null when it asks for
// none (an event that does not apply in the current state is ignored, so
// an event heard twice changes nothing):
//
//   { version, quantize, fade }
//
// `version` is the theme version to play next ('main', 'overtime',
// 'victory', 'defeat', 'draw'; null: silence), `quantize` where the change
// lands on the musical clock ('now', 'bar': the next bar line, or the
// next beat when a bar is longer than BAR_QUANTUM_LIMIT seconds; 'beat':
// the next beat) and `fade` how long the outgoing version takes to go
// (seconds, an equal-power crossfade).
//
// Overtime's intensity (0-1) is the battle's own Void pressure
// (Battle.overtimeVoidPressure), read from the battle and never counted
// here: it only moves in overtime, never while paused, and is back to 0 on
// a restart.

export const MUSIC_STATES = Object.freeze({
  idle: 'idle',
  battle: 'battle',
  overtime: 'overtime',
  postVictory: 'postVictory',
  postDefeat: 'postDefeat',
  postDraw: 'postDraw',
});

const VERSION_OF = Object.freeze({
  battle: 'main', overtime: 'overtime', postVictory: 'victory', postDefeat: 'defeat', postDraw: 'draw',
});

const POST_STATE = Object.freeze({ victory: 'postVictory', defeat: 'postDefeat', draw: 'postDraw' });

// A bar longer than this (seconds) is too long to wait for: overtime then
// comes in on the next beat instead.
export const BAR_QUANTUM_LIMIT = 1.5;

// How long each change's outgoing version takes to fade.
export const FADES = Object.freeze({
  start: 0.05,
  overtime: 0.35,
  // At most about a beat: the sting cuts in on the downbeat.
  ending: 0.3,
  restart: 0.25,
  leave: 0.6,
});

export class MusicDirector {
  constructor() {
    this.state = MUSIC_STATES.idle;
    this.stage = null;
    this.intensity = 0;
    this.paused = false;
  }

  // The version the state plays (null when idle).
  get version() {
    return VERSION_OF[this.state] ?? null;
  }

  get post() {
    return this.state === MUSIC_STATES.postVictory || this.state === MUSIC_STATES.postDefeat || this.state === MUSIC_STATES.postDraw;
  }

  // A battle on `stage` begins: its Main Battle version from its intro.
  start(stage) {
    this.stage = stage;
    this.state = MUSIC_STATES.battle;
    this.intensity = 0;
    this.paused = false;
    return { version: 'main', quantize: 'now', fade: FADES.start };
  }

  // The battle's overtime started: once, from the Main Battle only.
  overtime() {
    if (this.state !== MUSIC_STATES.battle) return null;
    this.state = MUSIC_STATES.overtime;
    this.intensity = 0;
    return { version: 'overtime', quantize: 'bar', fade: FADES.overtime };
  }

  // Overtime's Void pressure, 0-1. Returns the intensity in force.
  pressure(p) {
    if (this.state === MUSIC_STATES.overtime && !this.paused) {
      this.intensity = Math.min(1, Math.max(0, Number(p) || 0));
    }
    return this.intensity;
  }

  // The match ended on `version` ('victory', 'defeat' or 'draw'): once,
  // from the Main Battle or Overtime.
  end(version) {
    if (!Object.hasOwn(POST_STATE, version)) return null;
    if (this.state !== MUSIC_STATES.battle && this.state !== MUSIC_STATES.overtime) return null;
    this.state = POST_STATE[version];
    return { version, quantize: 'beat', fade: FADES.ending };
  }

  // A restart or a rematch: the Main Battle again from its intro, overtime's
  // intensity back to 0.
  restart() {
    if (this.state === MUSIC_STATES.idle || !this.stage) return null;
    this.state = MUSIC_STATES.battle;
    this.intensity = 0;
    return { version: 'main', quantize: 'now', fade: FADES.restart };
  }

  pause() {
    if (this.paused) return false;
    this.paused = true;
    return true;
  }

  resume() {
    if (!this.paused) return false;
    this.paused = false;
    return true;
  }

  // Leaving the battle: silence.
  leave() {
    if (this.state === MUSIC_STATES.idle) return null;
    this.state = MUSIC_STATES.idle;
    this.stage = null;
    this.intensity = 0;
    this.paused = false;
    return { version: null, quantize: 'now', fade: FADES.leave };
  }
}
