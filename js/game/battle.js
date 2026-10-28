// Battle: one match on the shared Arena (js/game/arena.js), with its
// intro / fight / celebration phases and the match clock. In Quick Battle
// it is Player 1 against the combat AI (js/game/ai/combat-ai.js) at the
// chosen difficulty; in Watch Mode both fighters are the combat AI, each
// with its own controller, at the one chosen difficulty (see BATTLE_MODES).
// Every rule below is the same in both, the 5-minute clock and overtime
// included. The Arena owns the fixed-timestep world and its Canvas 2D
// rendering; DOM concerns (HUD, pause, the result toast and dialog) live in
// the battle screen.
//
// First to CONFIG.battle.pointsToWin (3) points wins. A fighter scores a
// point each time its opponent falls into the Void (see onVoid); the one
// that fell is out of play for CONFIG.battle.respawnSeconds (2), then back
// at its spawn, fresh, while the fight (and the clock) carries on. The
// point that reaches 3 ends the match instead, overtime included. If the
// clock runs out first, more points wins. Level on points, the match goes
// to overtime (startOvertime): the same fight played on for
// CONFIG.battle.overtimeSeconds under a closing Void, then more points,
// then the lower Launch Point, equal on both a draw (a tie: the match is
// over with no winner).
//
// The match's lifecycle keeps four things apart: whether the competitive
// match is live (`matchLive`: the fight phase, before the result), whether
// the world runs (always, but for the screen's own pause), whether the
// player paused (the screen's), and whether the results are on show (the
// screen's). The match ends exactly once (finishMatch): the result is
// frozen with the score, both Launch Points and the match statistics as
// they stood (`final`), the clock stops, and the phase becomes
// `celebration`. The world carries on: the fighters still in play keep
// moving and fighting, the player keeps their controls, a CPU celebrates
// (js/game/ai/celebration.js), the camera follows whoever is left, the
// stage and its effects go on. Nothing that happens then counts: a fall
// into the Void takes the fighter out for good (no point, no respawn,
// whoever was waiting to respawn stays out), no hazard strikes, no
// overtime starts, and the result and statistics never change. Only a
// restart or a rematch starts a new match.

import { CONFIG } from '../config.js';
import { Arena } from './arena.js';
import { Fighter } from './fighters/fighter.js';
import { PlayerController } from './fighters/fighter-controller.js';
import { CombatAIController } from './ai/combat-ai.js';
import { CelebrationController, CELEBRATIONS, LOSER_CELEBRATIONS, DRAW_CELEBRATIONS } from './ai/celebration.js';
import { MatchStats } from './match-stats.js';
import { resolveDifficulty } from '../data/difficulty.js';
import { mulberry32, deriveSeed } from '../core/utils.js';

// Who plays each side, by mode, and the tag it is shown under (HUD cards,
// markers). `stream` picks a CPU's randomness from the battle's seed (see
// deriveSeed): each CPU has its own, so two CPUs never share one sequence,
// not even in a mirror match, and Quick Battle's CPU keeps the seed itself.
// `celebration` is the stream of the side's celebration after the match
// (CELEBRATION_STREAMS), never one its combat AI draws from. Whatever the
// mode, p1 is Team I and p2 Team II wherever the sides are named.
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

// The match's phases: its intro (nobody moves), the fight (the match is
// live) and, once it is decided, the celebration (the world goes on, the
// result stands).
export const PHASES = Object.freeze({ intro: 'intro', fight: 'fight', celebration: 'celebration' });

// Each side's celebration randomness, a stream of the battle's seed of its
// own ('cel1', 'cel2'), so a celebration never moves a CPU's combat
// randomness or a stage hazard's.
export const CELEBRATION_STREAMS = Object.freeze({ p1: 0x63656c31, p2: 0x63656c32 });

export class Battle extends Arena {
  // `mode` is 'quick-battle' (the default, also for anything unknown) or
  // 'watch' (see BATTLE_MODES). `difficulty` is the level of every CPU
  // (js/data/difficulty.js); anything missing or unknown is Medium. It shapes
  // only the CPUs' controllers: both fighters are built from their
  // definitions alone. `seed` fixes the CPUs' randomness (tests); by default
  // every battle differs. `automaticTurnAround` is the human player's
  // Automatic turn-around setting (on unless given false, as the settings'
  // default): it goes to the player's controller only, so a CPU (Quick
  // Battle's, or either of Watch Mode's) never has it.
  constructor({
    canvas, map, p1Def, p2Def, p1Sprites, p2Sprites, input, reducedMotion = false, onPhase, difficulty, seed, mode,
    automaticTurnAround = true,
  }) {
    // One seed for the battle's randomness: each CPU's and each stage
    // hazard's its own stream of it.
    const battleSeed = seed ?? (Date.now() & 0xffff);
    super({ canvas, map, input, reducedMotion, seed: battleSeed });
    this.onPhase = onPhase || (() => {});
    // Kept for the whole battle: restarts, rematches and respawns keep them.
    this.mode = Object.keys(BATTLE_MODES).includes(mode) ? mode : 'quick-battle';
    this.difficulty = resolveDifficulty(difficulty);
    this.seed = battleSeed;

    const sides = BATTLE_MODES[this.mode];
    const controllerFor = (side) => (side.cpu
      ? new CombatAIController({ difficulty: this.difficulty, rng: mulberry32(deriveSeed(this.seed, side.stream)) })
      : new PlayerController(input, { automaticTurnAround }));
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
    // What each side does over the match (js/game/match-stats.js), started
    // over with every match.
    this.stats = new MatchStats(this.fighters);
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
    // Every stage hazard is back where the map puts it first, starting over.
    // A celebration ends: each CPU gets its match controller back, and the
    // match's result and statistics go.
    this.hazards.reset();
    this.stageHazards.reset();
    for (const f of this.fighters) {
      const own = this.celebrations?.[f.slot];
      if (own && f.controller === own.celebration) f.controller = own.controller;
      f.reset(this.stage);
      f.controller?.reset?.();
    }
    this.final = null;
    this.celebrations = null;
    this.elapsed = 0;
    this.stats.reset();
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
    this.setPhase(PHASES.intro);
    this.input.flush();
    if (this.view.pxW) this.camera.snap(this.p1, this.p2);
  }

  // Inputs are locked through the intro only: the fight and the
  // celebration after it are both played.
  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    const locked = phase === PHASES.intro;
    for (const f of this.fighters) f.inputLocked = locked;
    if (phase === PHASES.fight) this.input.flush();
    this.onPhase(phase, this);
  }

  // Whether the competitive match is live: its fight, before a result.
  get matchLive() {
    return this.phase === PHASES.fight && !this.final;
  }

  // Whether the match is over (its result final, see finishMatch).
  get matchOver() {
    return !!this.final;
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

  // The match's phases and clock, then the shared world step, then (while
  // the match was live) the step's statistics. Through overtime the Void
  // closes in on every step as its clock runs, before the world steps, so
  // a fighter the new edge has passed is taken this very step, by the usual
  // Void check. The clock running out ends the match before the world
  // steps; the winning point ends it within the step, as the Void takes
  // the loser, and that step still counts.
  update(dt) {
    this.phaseTime += dt;
    switch (this.phase) {
      case PHASES.intro:
        if (this.phaseTime >= CONFIG.battle.introSeconds) this.setPhase(PHASES.fight);
        break;
      case PHASES.fight:
        this.elapsed += dt;
        if (Number.isFinite(this.timeLeft)) {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          if (this.timeLeft <= 0) {
            if (this.goesToOvertime) this.startOvertime();
            else this.finishMatch();
          }
          if (this.overtime) this.setVoidPressure(this.overtimeProgress);
        }
        break;
      default:
        break;
    }
    const live = this.matchLive;
    this.stepping = true;
    try {
      super.update(dt);
    } finally {
      this.stepping = false;
    }
    if (live) this.stats.record(this);
    if (this.final && !this.final.stats) this.sealFinal();
  }

  // The stage hazards strike and throw only while the match is live: never
  // during the intro or the celebration (rocks already flying land
  // harmlessly).
  get hazardsLive() {
    return this.matchLive;
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
  // holding or aiming at it. While the match is live, its opponent scores
  // a point, at once, if the opponent is itself still in play: when both
  // are out together (taken on the same step, or one taken while the other
  // still waits to respawn) that fall scores nothing, so a double K.O.
  // never moves both toward the win. The point that reaches pointsToWin
  // ends the match (finishMatch), and the loser stays out. Otherwise the
  // fighter respawns after its wait, keeping its Launch Point until then
  // (the respawn resets it to 0). Once the match is over, a fall changes
  // nothing: no point, no statistic and no respawn.
  onVoid(f) {
    this.detachFromPlay(f, 'void');
    if (!this.matchLive) return;
    this.stats.fall(f);
    const scorer = f.opponent;
    if (scorer && !scorer.lostToVoid) {
      this.score[scorer.slot] += 1;
      if (this.score[scorer.slot] >= this.pointsToWin) {
        this.finishMatch();
        return;
      }
    }
    this.scheduleRespawn(f);
  }

  // Respawn waits run only while the match is live: once it is over,
  // whoever is out stays out, with the Launch Point it fell with.
  updateRespawns(dt) {
    if (this.matchLive) super.updateRespawns(dt);
  }

  // Ends the match, exactly once, on its result as it stands now (see
  // liveResult): the outcome and its reason, the score, both Launch Points,
  // whether overtime was played and how long the match ran, all frozen
  // (`final`; its statistics are sealed once this step's are counted, see
  // sealFinal). The clock stops where it is, every respawn wait is called
  // off, and the celebration starts. A later call changes nothing.
  finishMatch() {
    if (this.final) return this.final;
    const { outcome, reason } = this.liveResult;
    this.final = {
      outcome, reason,
      winner: outcome === 'draw' ? null : outcome,
      score: Object.freeze({ ...this.score }),
      launchPoints: Object.freeze({ p1: this.p1.combat.launchPoint, p2: this.p2.combat.launchPoint }),
      overtime: this.overtime,
      seconds: this.elapsed,
      stats: null,
    };
    for (const f of this.fighters) f.respawnTimer = null;
    this.setPhase(PHASES.celebration);
    this.startCelebration();
    // Ended from outside a step: nothing of this step is left to count.
    if (!this.stepping) this.sealFinal();
    return this.final;
  }

  // The match statistics as they stood at the end, frozen into the result,
  // and the result frozen with them.
  sealFinal() {
    const sealed = { ...this.final, stats: this.stats.snapshot(this.final.score) };
    this.final = Object.freeze(sealed);
  }

  // Every CPU's controller makes way for a celebration of its own, on its
  // side's celebration stream: the winner may do anything a celebration
  // does; a side that did not win stays calm (LOSER_CELEBRATIONS), and after
  // a draw both only move about (DRAW_CELEBRATIONS). The player keeps their
  // controller. Each side's match controller is kept (`celebrations`, by
  // slot) for a restart to give back.
  startCelebration() {
    const winner = this.final.winner;
    this.celebrations = {};
    for (const f of this.fighters) {
      if (f.controller?.kind !== 'cpu') continue;
      const behaviours = !winner ? DRAW_CELEBRATIONS : winner === f.slot ? CELEBRATIONS : LOSER_CELEBRATIONS;
      const celebration = new CelebrationController({
        behaviours, rng: mulberry32(deriveSeed(this.seed, CELEBRATION_STREAMS[f.slot])),
      });
      this.celebrations[f.slot] = { celebration, controller: f.controller };
      f.controller = celebration;
    }
  }

  // The match's result: once it is over, the one it ended on (never
  // changing afterwards, whatever happens in the celebration); before
  // that, what it would be now (liveResult).
  get result() {
    if (this.final) return { outcome: this.final.outcome, reason: this.final.reason };
    return this.liveResult;
  }

  // The winner as things stand: whoever reached pointsToWin ('void': it
  // took the last point from a fall, in overtime too), else, on time,
  // whoever has more points ('points' when the normal clock ran out,
  // 'overtimePoints' when overtime did), else whoever has the lower Launch
  // Point ('overtimeLaunchPoint' at the end of overtime; 'time' only with
  // overtime off; a fighter still out counts with the Launch Point it fell
  // with). Equal on both is a draw.
  get liveResult() {
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
