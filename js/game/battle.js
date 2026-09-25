// Battle: one Quick Battle on the shared Arena (js/game/arena.js): Player 1
// against the training CPU, with the intro / fight / time-up / KO / result
// phases and the round timer. The Arena owns the fixed-timestep world and its
// Canvas 2D rendering; DOM concerns (HUD, pause, overlays) live in the battle
// screen.
//
// The round ends at once when a fighter falls into the Void (see onVoid):
// that fighter is defeated, whatever the timer or Knockback says. If time
// runs out first, the fighter with less accumulated Knockback wins.

import { CONFIG } from '../config.js';
import { Arena } from './arena.js';
import { Fighter } from './character.js';
import { PlayerController, TrainingAIController } from './fighter-controller.js';
import { mulberry32 } from '../core/utils.js';

export class Battle extends Arena {
  constructor({ canvas, map, p1Def, p2Def, p1Sprites, p2Sprites, input, reducedMotion = false, onPhase }) {
    super({ canvas, map, input, reducedMotion });
    this.onPhase = onPhase || (() => {});

    const [s1, s2] = map.spawnPoints;
    this.p1 = new Fighter({
      def: p1Def, sprites: p1Sprites, spawn: s1, stage: this.stage,
      slot: 'p1', label: 'P1', controller: new PlayerController(input),
    });
    this.p2 = new Fighter({
      def: p2Def, sprites: p2Sprites, spawn: s2, stage: this.stage,
      slot: 'p2', label: 'CPU', controller: new TrainingAIController({ rng: mulberry32(Date.now() & 0xffff) }),
    });
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.fighters = [this.p1, this.p2];

    this.restart();
  }

  restart() {
    // Resetting a fighter ends its charged technique and releases whatever
    // it held; the fresh combat state carries no bind, timer or sphere, 0
    // Knockback and no cooldowns.
    for (const f of this.fighters) f.reset(this.stage);
    this.projectiles.length = 0;
    this.clones.length = 0;
    this.acc = 0;
    this.roundSeconds = CONFIG.battle.roundSeconds;
    this.timeLeft = this.roundSeconds > 0 ? this.roundSeconds : Infinity;
    this.round = 1;
    this.setPhase('intro');
    this.input.flush();
    if (this.view.pxW) this.camera.snap(this.p1, this.p2);
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    const locked = phase !== 'fight';
    for (const f of this.fighters) f.inputLocked = locked;
    if (phase === 'fight') this.input.flush();
    this.onPhase(phase, this);
  }

  // ---- Loop -------------------------------------------------------------------

  // The round's phases and timer, then the shared world step.
  update(dt) {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= CONFIG.battle.introSeconds) this.setPhase('fight');
        break;
      case 'fight':
        if (Number.isFinite(this.timeLeft)) {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          if (this.timeLeft <= 0) this.setPhase('timeup');
        }
        break;
      case 'timeup':
        if (this.phaseTime >= CONFIG.battle.timeUpSeconds) this.setPhase('result');
        break;
      case 'ko':
        if (this.phaseTime >= CONFIG.battle.koSeconds) this.setPhase('result');
        break;
      default:
        break;
    }
    super.update(dt);
  }

  // A fighter fell into the Void: it is defeated on the spot. It leaves
  // play (frozen, undrawn, untouchable), nothing keeps holding or aiming at
  // it, and a round still being fought ends at once with the short KO beat.
  // Its Knockback stays as it was until the next match. One lost after time
  // ran out still loses; both lost is a draw.
  onVoid(f) {
    f.lostToVoid = true;
    this.detachFromPlay(f, 'void');
    if (this.phase === 'fight') this.setPhase('ko');
  }

  // The winner: whoever the Void did not take (both taken is a draw), else,
  // on time, whoever has less accumulated Knockback (equal is a draw).
  get result() {
    const lost = { p1: !!this.p1.lostToVoid, p2: !!this.p2.lostToVoid };
    if (lost.p1 || lost.p2) {
      if (lost.p1 && lost.p2) return { outcome: 'draw', reason: 'void' };
      return { outcome: lost.p1 ? 'p2' : 'p1', reason: 'void' };
    }
    const a = this.p1.combat.knockback;
    const b = this.p2.combat.knockback;
    if (Math.abs(a - b) < 1e-6) return { outcome: 'draw', reason: 'time' };
    return { outcome: a < b ? 'p1' : 'p2', reason: 'time' };
  }
}
