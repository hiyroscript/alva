// BattleAudio: what a battle screen or Practice Ground sounds like (the
// Sound update). It listens to one Arena (a Battle or a PracticeSession)
// and tells the audio engine (js/core/audio-manager.js) what happened, in
// the engine's words:
//
//   attach      battleStarted(stage, mode, { localSlot }) or practiceStarted();
//               a battle in its entrance (js/game/entrance.js) waits for
//               the entrance's reveal to start its music
//   cues        the arena's own (Arena.cue): 'ejected' → fighterEjected,
//               'spawned' → fighterSpawned, 'deflected' → deflected,
//               'blocked' → blocked, 'overtime' → overtimeStarted,
//               'matchEnded' → matchEnded(winner), 'restart' → restarted
//               (or, into an entrance, entranceStarted), and the
//               entrance's 'entranceBolt' → entranceBolt, 'entranceCover'
//               → entranceCover, 'entranceReveal' → entranceReveal(stage)
//               then battleStarted
//   sync        every frame the world ran: overtimePressure(the battle's
//               own Battle.overtimeVoidPressure; never a clock of its own),
//               and each fighter's Shield raised or lowered (shieldHeld) and
//               where it is (shieldPan)
//   setPaused   paused / resumed
//   detach      left
//
// Every call goes to whichever of those the engine has (a test's stand-in
// may have none), and nothing here is ever read by the game: the screens
// call it after the world has stepped, and the arena's cues run inside a
// step only to be heard. Sounds play for any fighter on screen, the
// player's, a CPU's or Player 2's, from the shared systems alone: no
// fighter's id is ever looked at.

// How far left or right a sound may sit for where its fighter is on screen
// (the effects narrow it further): subtle, so two Shields held at once can
// be told apart without anything feeling lopsided.
export const PAN_SPREAD = 0.6;

export class BattleAudio {
  constructor(audio) {
    this.audio = audio ?? null;
    this.arena = null;
    this.mode = null;
    // Each fighter's Shield as last told to the engine: up or not.
    this.shields = new Map();
    this.pressure = -1;
    // The battle's start as attach heard it ({ stage, mode, localSlot }),
    // and whether its music waits for an entrance's reveal.
    this.start = null;
    this.awaitingReveal = false;
  }

  // Calls the engine's `name`, if it has one.
  call(name, ...args) {
    const fn = this.audio?.[name];
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(this.audio, args);
    } catch (err) {
      console.error(`[Alva] Audio "${name}" failed`, err);
      return undefined;
    }
  }

  // Starts listening to `arena`: a battle on stage `stage` in `mode`
  // ('quick-battle', 'adventure', 'watch', 'local', 'online'; Online,
  // `localSlot` is this device's side), or Practice Ground ('practice').
  attach(arena, { stage = null, mode = 'quick-battle', localSlot = 'p1' } = {}) {
    if (this.arena) this.detach();
    this.arena = arena;
    this.mode = mode;
    this.pressure = -1;
    this.shields.clear();
    this.start = { stage, mode, localSlot };
    this.awaitingReveal = false;
    arena.cueListener = (type, detail) => this.onCue(type, detail);
    if (mode === 'practice') this.call('practiceStarted');
    else if (arena.phase === 'entrance') this.waitForReveal();
    else this.call('battleStarted', stage, mode, { localSlot });
  }

  // A match's entrance: silence for the music until its reveal.
  waitForReveal() {
    this.awaitingReveal = true;
    this.call('entranceStarted');
  }

  onCue(type, detail) {
    switch (type) {
      case 'ejected': {
        const f = detail?.fighter;
        this.lower(f);
        this.call('fighterEjected', f, { pan: this.panOf(f) });
        break;
      }
      case 'deflected':
        this.call('deflected', detail.fighter, { pan: this.panOf(detail.fighter), direction: detail.direction });
        break;
      case 'blocked':
        this.call('blocked', detail.target, { perfect: !!detail.perfect, pan: this.panOf(detail.target) });
        break;
      case 'overtime':
        this.pressure = -1;
        this.call('overtimeStarted');
        break;
      case 'matchEnded':
        this.call('matchEnded', detail?.winner ?? null);
        break;
      case 'restart':
        this.lowerAll();
        this.pressure = -1;
        if (this.arena?.phase === 'entrance') this.waitForReveal();
        else this.call('restarted');
        break;
      case 'spawned': {
        const f = detail?.fighter;
        this.call('fighterSpawned', f, { pan: this.panOf(f) });
        break;
      }
      case 'entranceBolt':
        this.call('entranceBolt');
        break;
      case 'entranceCover':
        this.call('entranceCover');
        break;
      case 'entranceReveal': {
        const start = this.start;
        this.call('entranceReveal', start?.stage ?? null);
        // The stage's theme from its intro, led in by the reveal.
        if (this.awaitingReveal && start) {
          this.awaitingReveal = false;
          this.call('battleStarted', start.stage, start.mode, { localSlot: start.localSlot });
        }
        break;
      }
      default:
        break;
    }
  }

  // After a frame in which the world ran: overtime's pressure, and the
  // Shields.
  sync() {
    const arena = this.arena;
    if (!arena) return;
    if (arena.overtime) {
      const p = arena.overtimeVoidPressure;
      if (p !== this.pressure) {
        this.pressure = p;
        this.call('overtimePressure', p);
      }
    }
    const fighters = arena.fighters ?? [];
    for (const f of fighters) {
      const up = !!f.combat?.shielding && !f.lostToVoid;
      const was = this.shields.get(f) ?? false;
      if (up !== was) {
        this.shields.set(f, up);
        this.call('shieldHeld', f, up, { pan: this.panOf(f) });
      } else if (up) this.call('shieldPan', f, this.panOf(f));
    }
    // A fighter gone from the arena (Practice's swaps) holds nothing.
    for (const f of [...this.shields.keys()]) if (!fighters.includes(f)) this.lower(f);
  }

  // `f`'s Shield is down (it left play, or left the arena).
  lower(f) {
    if (!f || !this.shields.has(f)) return;
    const was = this.shields.get(f);
    this.shields.delete(f);
    if (was) this.call('shieldHeld', f, false);
  }

  lowerAll() {
    for (const f of [...this.shields.keys()]) this.lower(f);
  }

  setPaused(on) {
    this.call(on ? 'paused' : 'resumed');
  }

  // Stops listening: the music and ambience fade, every hum stops.
  detach() {
    if (!this.arena) return;
    this.arena.cueListener = null;
    this.lowerAll();
    this.arena = null;
    this.mode = null;
    this.start = null;
    this.awaitingReveal = false;
    this.call('left');
  }

  // Where `f` is on screen, -PAN_SPREAD (left) to PAN_SPREAD (right); the
  // middle when the view is not laid out yet.
  panOf(f) {
    const arena = this.arena;
    const width = arena?.view?.pxW;
    if (!f?.body || !width || typeof arena.toScreen !== 'function') return 0;
    const [x] = arena.toScreen(f.body.x, f.body.y);
    const p = (x / width) * 2 - 1;
    return Math.max(-1, Math.min(1, Number.isFinite(p) ? p : 0)) * PAN_SPREAD;
  }
}
