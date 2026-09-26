// Battle: one Quick Battle on the shared Arena (js/game/arena.js): Player 1
// against the combat AI (js/game/combat-ai.js) at the chosen difficulty,
// with the intro / fight / time-up / KO / result phases and the round timer. The Arena owns the fixed-timestep world and its
// Canvas 2D rendering; DOM concerns (HUD, pause, overlays) live in the battle
// screen.
//
// First to CONFIG.battle.pointsToWin (3) points wins. A fighter scores a
// point each time its opponent falls into the Void (see onVoid); the one
// that fell is out of play for CONFIG.battle.respawnSeconds (2), then back
// at its spawn, fresh, while the fight (and the timer) carries on. The
// point that reaches 3 ends the match instead: no respawn, the KO beat,
// then the result. If time runs out first, more points wins, then lower
// Launch Point; equal on both is a draw.

import { CONFIG } from '../config.js';
import { Arena } from './arena.js';
import { Fighter } from './character.js';
import { PlayerController } from './fighter-controller.js';
import { CombatAIController } from './combat-ai.js';
import { resolveDifficulty } from '../data/difficulty.js';
import { mulberry32 } from '../core/utils.js';

export class Battle extends Arena {
  // `difficulty` is the CPU's level (js/data/difficulty.js); anything
  // missing or unknown is Medium. It shapes only the CPU's controller: both
  // fighters are built from their definitions alone. `seed` fixes the CPU's
  // randomness (tests); by default every battle differs.
  constructor({ canvas, map, p1Def, p2Def, p1Sprites, p2Sprites, input, reducedMotion = false, onPhase, difficulty, seed }) {
    super({ canvas, map, input, reducedMotion });
    this.onPhase = onPhase || (() => {});
    // Kept for the whole battle: restarts, rematches and respawns keep it.
    this.difficulty = resolveDifficulty(difficulty);

    const [s1, s2] = map.spawnPoints;
    this.p1 = new Fighter({
      def: p1Def, sprites: p1Sprites, spawn: s1, stage: this.stage,
      slot: 'p1', label: 'P1', controller: new PlayerController(input),
    });
    this.p2 = new Fighter({
      def: p2Def, sprites: p2Sprites, spawn: s2, stage: this.stage,
      slot: 'p2', label: 'CPU',
      controller: new CombatAIController({ difficulty: this.difficulty, rng: mulberry32(seed ?? (Date.now() & 0xffff)) }),
    });
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.fighters = [this.p1, this.p2];
    // Points that win the match, and each fighter's points so far, by slot.
    // The match's own: never on a fighter or its character.
    this.pointsToWin = CONFIG.battle.pointsToWin;
    this.score = { p1: 0, p2: 0 };

    this.restart();
  }

  restart() {
    // Resetting a fighter ends its charged technique and releases whatever
    // it held, and cancels any respawn wait; the fresh combat state carries
    // no bind, timer or sphere, 0 Launch Point, full Energy and no cooldowns.
    // Both back to 0 points. The CPU's controller starts over too (nothing
    // held or planned), at the same difficulty.
    for (const f of this.fighters) {
      f.reset(this.stage);
      f.controller?.reset?.();
    }
    this.score.p1 = 0;
    this.score.p2 = 0;
    this.projectiles.length = 0;
    this.clones.length = 0;
    this.fx.reset();
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

  // A fighter fell into the Void (Arena.checkVoid already took it out of
  // play: frozen, undrawn, untouchable, untargetable). Nothing keeps
  // holding or aiming at it. While the fight is on, its opponent scores a
  // point, at once, if the opponent is itself still in play: when both are
  // out together (taken on the same step, or one taken while the other
  // still waits to respawn) that fall scores nothing, so a double K.O.
  // never moves both toward the win. The point that reaches pointsToWin
  // ends the match: the KO beat, then the result, and the loser stays out.
  // Otherwise the fighter respawns after its wait, keeping its Launch Point
  // until then (the respawn resets it to 0). Once time is up or the match is won, a fall changes
  // nothing more: no point and no respawn.
  onVoid(f) {
    this.detachFromPlay(f, 'void');
    if (this.phase !== 'fight') return;
    const scorer = f.opponent;
    if (scorer && !scorer.lostToVoid) {
      this.score[scorer.slot] += 1;
      if (this.score[scorer.slot] >= this.pointsToWin) {
        this.setPhase('ko');
        return;
      }
    }
    this.scheduleRespawn(f);
  }

  // Respawn waits run only while the fight is on: once time is up or the
  // match is won, whoever is out stays out, with the Launch Point it fell with.
  updateRespawns(dt) {
    if (this.phase === 'fight') super.updateRespawns(dt);
  }

  // The winner: whoever reached pointsToWin ('void': it took the last point
  // from a fall), else, on time, whoever has more points ('points'), else
  // whoever has the lower Launch Point ('time'; a fighter still out counts
  // with the Launch Point it fell with). Equal on both is a draw.
  get result() {
    const { p1, p2 } = this.score;
    if (p1 !== p2) {
      const outcome = p1 > p2 ? 'p1' : 'p2';
      return { outcome, reason: Math.max(p1, p2) >= this.pointsToWin ? 'void' : 'points' };
    }
    const a = this.p1.combat.launchPoint;
    const b = this.p2.combat.launchPoint;
    if (Math.abs(a - b) < 1e-6) return { outcome: 'draw', reason: 'time' };
    return { outcome: a < b ? 'p1' : 'p2', reason: 'time' };
  }
}
