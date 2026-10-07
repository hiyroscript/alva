// Battle: one match on the shared Arena (js/game/arena.js), with the intro /
// fight / time-up / KO / result phases and the match clock. In Quick Battle
// it is Player 1 against the combat AI (js/game/ai/combat-ai.js) at the chosen
// difficulty; in Watch Mode both fighters are the combat AI, each with its
// own controller, at the one chosen difficulty (see BATTLE_MODES). Every
// rule below is the same in both, the 7-minute clock and overtime
// included. The Arena owns the fixed-timestep world and its Canvas 2D
// rendering; DOM concerns (HUD, pause, overlays) live in the battle screen.
//
// First to CONFIG.battle.pointsToWin (3) points wins. A fighter scores a
// point each time its opponent falls into the Void (see onVoid); the one
// that fell is out of play for CONFIG.battle.respawnSeconds (2), then back
// at its spawn, fresh, while the fight (and the clock) carries on. The
// point that reaches 3 ends the match instead, overtime included: no
// respawn, the KO beat, then the result. If the clock runs out first, more
// points wins. Level on points, the match goes to overtime
// (startOvertime): the same fight played on for
// CONFIG.battle.overtimeSeconds under a closing Void, then more points,
// then the lower Launch Point, equal on both a draw.

import { CONFIG } from '../config.js';
import { Arena } from './arena.js';
import { Fighter } from './fighters/fighter.js';
import { PlayerController } from './fighters/fighter-controller.js';
import { CombatAIController } from './ai/combat-ai.js';
import { resolveDifficulty } from '../data/difficulty.js';
import { mulberry32, deriveSeed } from '../core/utils.js';

// Who plays each side, by mode, and the tag it is shown under (HUD cards,
// markers, results). `stream` picks a CPU's randomness from the battle's
// seed (see deriveSeed): each CPU has its own, so two CPUs never share one
// sequence, not even in a mirror match, and Quick Battle's CPU keeps the
// seed itself.
export const BATTLE_MODES = Object.freeze({
  'quick-battle': Object.freeze({
    p1: Object.freeze({ cpu: false, label: 'P1' }),
    p2: Object.freeze({ cpu: true, label: 'CPU', stream: 0 }),
  }),
  watch: Object.freeze({
    p1: Object.freeze({ cpu: true, label: 'CPU 1', stream: 1 }),
    p2: Object.freeze({ cpu: true, label: 'CPU 2', stream: 0 }),
  }),
});

// The match's periods: the normal clock, then (points level) overtime.
export const PERIODS = Object.freeze({ regulation: 'regulation', overtime: 'overtime' });

export class Battle extends Arena {
  // `mode` is 'quick-battle' (the default, also for anything unknown) or
  // 'watch' (see BATTLE_MODES). `difficulty` is the level of every CPU
  // (js/data/difficulty.js); anything missing or unknown is Medium. It shapes
  // only the CPUs' controllers: both fighters are built from their
  // definitions alone. `seed` fixes the CPUs' randomness (tests); by default
  // every battle differs. `combatAssist` is the human player's Combat
  // Assist setting (on unless given false): it goes to the player's
  // controller only, so a CPU (Quick Battle's, or either of Watch Mode's)
  // never has it.
  constructor({
    canvas, map, p1Def, p2Def, p1Sprites, p2Sprites, input, reducedMotion = false, onPhase, difficulty, seed, mode,
    combatAssist = true,
  }) {
    super({ canvas, map, input, reducedMotion });
    this.onPhase = onPhase || (() => {});
    // Kept for the whole battle: restarts, rematches and respawns keep them.
    this.mode = Object.keys(BATTLE_MODES).includes(mode) ? mode : 'quick-battle';
    this.difficulty = resolveDifficulty(difficulty);
    this.seed = seed ?? (Date.now() & 0xffff);

    const sides = BATTLE_MODES[this.mode];
    const controllerFor = (side) => (side.cpu
      ? new CombatAIController({ difficulty: this.difficulty, rng: mulberry32(deriveSeed(this.seed, side.stream)) })
      : new PlayerController(input, { combatAssist }));
    const [s1, s2] = map.spawnPoints;
    this.p1 = new Fighter({
      def: p1Def, sprites: p1Sprites, spawn: s1, stage: this.stage,
      slot: 'p1', label: sides.p1.label, controller: controllerFor(sides.p1),
    });
    this.p2 = new Fighter({
      def: p2Def, sprites: p2Sprites, spawn: s2, stage: this.stage,
      slot: 'p2', label: sides.p2.label, controller: controllerFor(sides.p2),
    });
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.fighters = [this.p1, this.p2];
    // Points that win the match, and each fighter's points so far, by slot.
    // The match's own: never on a fighter or its character.
    this.pointsToWin = CONFIG.battle.pointsToWin;
    this.score = { p1: 0, p2: 0 };
    // The match's clocks, the same in every mode: its normal length, and
    // its overtime's.
    this.roundSeconds = CONFIG.battle.matchSeconds;
    this.overtimeSeconds = CONFIG.battle.overtimeSeconds;

    this.restart();
  }

  restart() {
    // Resetting a fighter ends its technique and cancels any respawn wait;
    // the fresh combat state carries no paralysis or timer, 0 Launch Point,
    // full Energy and no cooldowns.
    // Both back to 0 points. Every CPU's controller starts over too (nothing
    // held or planned), at the same difficulty, and Player 1 stays Player 1.
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
    // Back to the normal clock at its full length, out of any overtime: the
    // map's own Void, its waves at their normal speed.
    this.period = PERIODS.regulation;
    this.setVoidPressure(0);
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

  // Whether the match is in overtime (points level when the normal clock
  // ran out). Play goes on in the `fight` phase all through
  // it.
  get overtime() {
    return this.period === PERIODS.overtime;
  }

  // How far overtime has run, 0 at its start to 1 at its end, from its
  // clock (so it moves exactly with the simulation and holds while
  // paused); 0 outside it.
  get overtimeProgress() {
    if (!this.overtime || !(this.overtimeSeconds > 0)) return 0;
    return Math.min(1, Math.max(0, 1 - this.timeLeft / this.overtimeSeconds));
  }

  // The match's phases and clock, then the shared world step. Through
  // overtime the Void closes in on every step as its clock runs, before
  // the world steps, so a fighter the new edge has passed is taken this
  // very step, by the usual Void check.
  update(dt) {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= CONFIG.battle.introSeconds) this.setPhase('fight');
        break;
      case 'fight':
        if (Number.isFinite(this.timeLeft)) {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          if (this.timeLeft <= 0) {
            if (this.goesToOvertime) this.startOvertime();
            else this.setPhase('timeup');
          }
          if (this.overtime) this.setVoidPressure(this.overtimeProgress);
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

  // Whether the normal clock running out now starts overtime: with the
  // points level, unless overtime is off (CONFIG.battle.overtimeSeconds 0).
  get goesToOvertime() {
    return !this.overtime && this.overtimeSeconds > 0 && this.score.p1 === this.score.p2;
  }

  // Overtime: the same match played on, never a new one. Only the clock
  // changes (its own CONFIG.battle.overtimeSeconds, counting down on the
  // simulation clock like the normal one) and the Void starts closing in
  // (see update). The score, both Launch Points, Energy, cooldowns,
  // positions, projectiles, clones, techniques and respawn waits all carry
  // on, and the phase stays `fight`: nobody's input is locked.
  startOvertime() {
    this.period = PERIODS.overtime;
    this.timeLeft = this.overtimeSeconds;
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
  // from a fall, in overtime too), else, on time, whoever has more points
  // ('points' when the normal clock ran out, 'overtimePoints' when
  // overtime did), else whoever has the lower Launch Point
  // ('overtimeLaunchPoint' at the end of overtime; 'time' only with
  // overtime off; a fighter still out counts with the Launch Point it fell
  // with). Equal on both is a draw.
  get result() {
    const { p1, p2 } = this.score;
    const overtime = this.period === PERIODS.overtime;
    if (p1 !== p2) {
      const outcome = p1 > p2 ? 'p1' : 'p2';
      const reason = Math.max(p1, p2) >= this.pointsToWin ? 'void' : overtime ? 'overtimePoints' : 'points';
      return { outcome, reason };
    }
    const a = this.p1.combat.launchPoint;
    const b = this.p2.combat.launchPoint;
    const reason = overtime ? 'overtimeLaunchPoint' : 'time';
    if (Math.abs(a - b) < 1e-6) return { outcome: 'draw', reason };
    return { outcome: a < b ? 'p1' : 'p2', reason };
  }
}
