// Battle: one Quick Battle on the shared Arena (js/game/arena.js): Player 1
// against the training CPU, with the intro / fight / time-up / result phases
// and the round timer. The Arena owns the fixed-timestep world and its Canvas
// 2D rendering; DOM concerns (HUD, pause, overlays) live in the battle screen.

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
    // it held; the fresh combat state carries no bind, timer or sphere.
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
      default:
        break;
    }
    super.update(dt);
  }

  get result() {
    const a = this.p1.combat.health / this.p1.combat.maxHealth;
    const b = this.p2.combat.health / this.p2.combat.maxHealth;
    if (Math.abs(a - b) < 1e-6) return { outcome: 'draw' };
    return { outcome: a > b ? 'p1' : 'p2' };
  }
}
