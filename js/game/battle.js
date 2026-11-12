// Battle: one match on the shared Arena (js/game/arena.js), with its
// intro / fight / celebration phases and the match clock. In Quick Battle
// it is Player 1 against the combat AI (js/game/ai/combat-ai.js) at the
// chosen difficulty; in Watch Mode both fighters are the combat AI, each
// with its own controller, at the one chosen difficulty; in Local Play both
// are players, each on their own controller and nothing else; in Online
// Play both are players in two browsers, each side fed by the lockstep
// (js/online/lockstep.js), which also decides when a step runs (see
// BATTLE_MODES and Arena.advance). Every rule below is the same in all four, the 5-minute
// clock and overtime included. The Arena owns the fixed-timestep world and its Canvas 2D
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
import { overtimePressure } from './physics.js';
import { resolveDifficulty } from '../data/difficulty.js';
import { resolveModifiers, isIdentity } from './combat/modifiers.js';
import { mulberry32, deriveSeed } from '../core/utils.js';
import { entranceTimeline, entranceFraming } from './entrance.js';
import { IDENTITY_ZOOM, framedZoom, nudgedZoom, withScreenZoom } from './rendering/screen-zoom.js';

// Who plays each side, by mode, and the tag it is shown under (HUD cards,
// markers). `stream` picks a CPU's randomness from the battle's seed (see
// deriveSeed): each CPU has its own, so two CPUs never share one sequence,
// not even in a mirror match, and Quick Battle's CPU keeps the seed itself.
// `celebration` is the stream of the side's celebration after the match
// (CELEBRATION_STREAMS), never one its combat AI draws from. `player`: a
// Local Play side's player, whose own controller alone it samples
// (InputManager.player); a player side without one is Player 1 on every
// device (the keyboard, touch and its controller). Whatever the mode, p1 is
// Team I and p2 Team II wherever the sides are named; in Local Play they
// are Player 1 and Player 2.
export const BATTLE_MODES = Object.freeze({
  'quick-battle': Object.freeze({
    p1: Object.freeze({ cpu: false, label: 'P1' }),
    p2: Object.freeze({ cpu: true, label: 'CPU', stream: 0 }),
  }),
  watch: Object.freeze({
    p1: Object.freeze({ cpu: true, label: 'CPU 1', stream: 1 }),
    p2: Object.freeze({ cpu: true, label: 'CPU 2', stream: 0 }),
  }),
  local: Object.freeze({
    p1: Object.freeze({ cpu: false, label: 'P1', player: 'p1' }),
    p2: Object.freeze({ cpu: false, label: 'P2', player: 'p2' }),
  }),
  // Online Play (js/online/lockstep.js): two players in two browsers, each
  // side's PlayerController on the channel the lockstep fills for that
  // player (the room's host is p1, its guest p2). Labelled by the players'
  // online names (`labels`).
  online: Object.freeze({
    p1: Object.freeze({ cpu: false, label: 'P1', player: 'p1' }),
    p2: Object.freeze({ cpu: false, label: 'P2', player: 'p2' }),
  }),
});

// Each mode whose sides are marked in their players' own colours, and
// where its colours are (the ground rings, name tags and pointers).
const PLAYER_COLORS = Object.freeze({ local: CONFIG.localPlay.colors, online: CONFIG.online.colors });

// Side `slot`'s modifiers for the battle from `spec` (js/game/combat/modifiers.js).
// A CPU's side (`side.cpu`) always plays with the identity's: difficulty,
// Adventure's Venture included, is only how well a CPU thinks, never a
// multiplier on its fighter, so anything else handed to one is refused.
function sideModifiers(side, spec, slot) {
  const mods = resolveModifiers(spec, `Side ${slot}`);
  if (side.cpu && !isIdentity(mods)) {
    throw new Error(`[Alva] Side ${slot}: a CPU's fighter plays with the identity's modifiers; no difficulty scales it`);
  }
  return mods;
}

// The match's periods: the normal clock, then (points level) overtime.
export const PERIODS = Object.freeze({ regulation: 'regulation', overtime: 'overtime' });

// The match's phases: its entrance (a battle screen's, see
// js/game/entrance.js: the world holds still and the fighters appear one by
// one), its intro (nobody moves), the fight (the match is live) and, once
// it is decided, the celebration (the world goes on, the result stands).
export const PHASES = Object.freeze({ entrance: 'entrance', intro: 'intro', fight: 'fight', celebration: 'celebration' });

// Who the camera frames while it is held (the entrance): nobody.
const NOBODY = Object.freeze([null, null]);

// Each side's celebration randomness, a stream of the battle's seed of its
// own ('cel1', 'cel2'), so a celebration never moves a CPU's combat
// randomness or a stage hazard's.
export const CELEBRATION_STREAMS = Object.freeze({ p1: 0x63656c31, p2: 0x63656c32 });

export class Battle extends Arena {
  // `mode` is 'quick-battle' (the default, also for anything unknown),
  // 'watch' or 'local' (see BATTLE_MODES). `difficulty` is the level of
  // every CPU (js/data/difficulty.js); anything missing or unknown is
  // Medium. It shapes only the CPUs' controllers: both fighters are built
  // from their definitions alone. `seed` fixes the CPUs' randomness
  // (tests); by default every battle differs. `automaticTurnAround` is the
  // human players' Automatic turn-around setting (on unless given false, as
  // the settings' default): it goes to the players' controllers only (both
  // of Local Play's alike), so a CPU (Quick Battle's, or either of Watch
  // Mode's) never has it. Online, each player brings their own: it may be
  // { p1, p2 }, each side's on unless given false. `labels` ({ p1, p2 },
  // either optional) names the sides in place of their mode's tags (Online
  // Play's player names).
  //
  // Two more, Adventure's alone (js/data/adventure.js; every other mode
  // leaves them out): `cpuLevel`, a CPU level spec in place of the
  // difficulty, read by the CPUs' controllers through getDifficultyProfile
  // (Venture's, { venture: level }); and `modifiers` ({ p1, p2 }, either
  // optional), each side's fighter's modifiers for the whole battle
  // (js/game/combat/modifiers.js), built once here and kept through every
  // restart, rematch and respawn. Left out, a side's are the identity's,
  // which change nothing, so every other mode plays exactly as ever. A
  // CPU's side never has any other: no difficulty and no mode scales what
  // a CPU's fighter does (a level is only how well it thinks), so anything
  // but the identity handed to one is refused.
  //
  // `entrance`: every match (the first, each restart and rematch) begins
  // with the entrance (js/game/entrance.js) before its intro, as every
  // battle screen's does; left out (headless matches: tests, benchmarks),
  // a match starts on its intro with both fighters on their spawns.
  constructor({
    canvas, map, p1Def, p2Def, p1Sprites, p2Sprites, input, reducedMotion = false, onPhase, difficulty, seed, mode,
    automaticTurnAround = true, labels = null, cpuLevel = null, modifiers = null, entrance = false,
  }) {
    // One seed for the battle's randomness: each CPU's and each stage
    // hazard's its own stream of it.
    const battleSeed = seed ?? (Date.now() & 0xffff);
    super({ canvas, map, input, reducedMotion, seed: battleSeed });
    this.onPhase = onPhase || (() => {});
    // Kept for the whole battle: restarts, rematches and respawns keep them.
    this.mode = Object.keys(BATTLE_MODES).includes(mode) ? mode : 'quick-battle';
    this.difficulty = resolveDifficulty(difficulty);
    this.cpuLevel = cpuLevel ?? null;
    const sides = BATTLE_MODES[this.mode];
    this.modifiers = Object.freeze({ p1: sideModifiers(sides.p1, modifiers?.p1, 'p1'), p2: sideModifiers(sides.p2, modifiers?.p2, 'p2') });
    this.seed = battleSeed;

    const turnAround = (slot) => (automaticTurnAround && typeof automaticTurnAround === 'object'
      ? automaticTurnAround[slot] !== false
      : automaticTurnAround);
    const controllerFor = (side, slot) => (side.cpu
      ? new CombatAIController({ difficulty: this.cpuLevel ?? this.difficulty, rng: mulberry32(deriveSeed(this.seed, side.stream)) })
      : new PlayerController(side.player ? input.player?.(side.player) ?? input : input, { automaticTurnAround: turnAround(slot) }));
    const [s1, s2] = map.spawnPoints;
    this.p1 = new Fighter({
      def: p1Def, sprites: p1Sprites, spawn: s1, stage: this.stage,
      slot: 'p1', label: labels?.p1 ?? sides.p1.label, controller: controllerFor(sides.p1, 'p1'), modifiers: this.modifiers.p1,
    });
    this.p2 = new Fighter({
      def: p2Def, sprites: p2Sprites, spawn: s2, stage: this.stage,
      slot: 'p2', label: labels?.p2 ?? sides.p2.label, controller: controllerFor(sides.p2, 'p2'), modifiers: this.modifiers.p2,
    });
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.fighters = [this.p1, this.p2];
    // Local Play and Online Play mark each player in their own colour:
    // Player 1 (the host) red, Player 2 (the guest) blue, wherever they
    // stand.
    if (Object.hasOwn(PLAYER_COLORS, this.mode)) this.markerColors = PLAYER_COLORS[this.mode];
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
    // The entrance's timeline (the same for every match of this battle, on
    // both browsers of an online one), or null without one. `entranceNext`
    // is its next event to act on; `matchIndex` counts the matches this
    // battle has started (0 for the first), so each draws its own bolt.
    this.entrance = entrance ? entranceTimeline() : null;
    this.entranceNext = 0;
    this.matchIndex = -1;
    // The entrance camera's zoom this frame (js/game/rendering/
    // screen-zoom.js), applied after projection; the identity otherwise.
    this.screenZoom = IDENTITY_ZOOM;

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
    // With an entrance, both wait off the stage for it to bring them on.
    for (const f of this.fighters) {
      const own = this.celebrations?.[f.slot];
      if (own && f.controller === own.celebration) f.controller = own.controller;
      f.reset(this.stage);
      f.controller?.reset?.();
      f.awaitingEntrance = !!this.entrance;
    }
    this.matchIndex += 1;
    this.entranceNext = 0;
    this.screenZoom = IDENTITY_ZOOM;
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
    this.setPhase(this.entrance ? PHASES.entrance : PHASES.intro);
    this.input.flush();
    if (this.view.pxW) {
      if (this.entrance) this.placeEntranceCamera();
      else this.camera.snap(this.p1, this.p2);
    }
    // The music starts over from its intro (heard only once a screen
    // listens: never for the first match, built before it does; with an
    // entrance, from its reveal).
    this.cue('restart');
  }

  // Inputs are locked through the entrance and the intro: the fight and
  // the celebration after it are both played. Leaving the entrance, however
  // it is left (its end, or a phase set over it), nobody is still waiting
  // to appear.
  setPhase(phase) {
    if (this.phase === PHASES.entrance && phase !== PHASES.entrance) {
      for (const f of this.fighters) f.awaitingEntrance = false;
    }
    this.phase = phase;
    this.phaseTime = 0;
    const locked = phase === PHASES.intro || phase === PHASES.entrance;
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

  // How far overtime has closed the Void, 0 to 1: its progress eased in by
  // CONFIG.battle.overtimeVoid.closeCurve (overtimePressure), so the Void
  // closes slowly at first and faster and faster to the end. 0 outside it.
  get overtimeVoidPressure() {
    return overtimePressure(this.overtimeProgress, CONFIG.battle.overtimeVoid);
  }

  // The match's phases and clock, then the shared world step, then (while
  // the match was live) the step's statistics. Through overtime the Void
  // closes in on every step as its clock runs (overtimeVoidPressure, all on
  // the simulation clock, so a lockstep match closes it the same in both
  // browsers), before the world steps, so
  // a fighter the new edge has passed is taken this very step, by the usual
  // Void check. The clock running out ends the match before the world
  // steps; the winning point ends it within the step, as the Void takes
  // the loser, and that step still counts.
  update(dt) {
    this.phaseTime += dt;
    switch (this.phase) {
      case PHASES.entrance:
        // The world holds still: only the entrance's own timeline runs.
        this.stepEntrance(dt);
        return;
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
          if (this.overtime) this.setVoidPressure(this.overtimeVoidPressure);
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

  // ---- The entrance (js/game/entrance.js) ---------------------------------------------

  // One step of the entrance (its phaseTime already counted): every event
  // due by now, once each and in order (a sound's cue at its step's start,
  // a spawn burst, a fighter appearing), and the fighters already on the
  // stage idling in place: their art only, since nothing else of the world
  // steps (no clock, CPU, hazard, physics or respawn: none moves, slides,
  // falls or turns). Its end starts the intro, with phaseTime 0 so the
  // intro's banner keeps its timing, and drops every press buffered
  // meanwhile.
  stepEntrance(dt) {
    const timeline = this.entrance;
    const t = this.phaseTime;
    while (this.entranceNext < timeline.events.length && timeline.events[this.entranceNext].time <= t + 1e-9) {
      this.entranceEvent(timeline.events[this.entranceNext]);
      this.entranceNext += 1;
    }
    for (const f of this.fighters) if (!f.awaitingEntrance) f.animator.update(dt, f.visualFacing);
    if (t >= timeline.total - 1e-9) {
      this.setPhase(PHASES.intro);
      this.input.flush();
    }
  }

  // One of the entrance's events: a sound's cue, a fighter's spawn burst
  // (its elimination burst played backwards where it stands, as a
  // respawn's: Arena.announceSpawn), or the fighter appearing as it pops:
  // in play, fresh, its spawn's sound cued. Presentation and the fighters'
  // presence only: no score, statistic, fall or ejection.
  entranceEvent(event) {
    const f = event.slot ? this[event.slot] : null;
    switch (event.type) {
      case 'bolt':
        this.cue('entranceBolt');
        break;
      case 'cover':
        this.cue('entranceCover');
        break;
      case 'reveal':
        this.cue('entranceReveal');
        break;
      case 'burst':
        if (f?.awaitingEntrance) this.announceSpawn(f);
        break;
      case 'appear':
        if (!f?.awaitingEntrance) break;
        f.awaitingEntrance = false;
        this.cue('spawned', { fighter: f });
        break;
      default:
        break;
    }
  }

  // Where the entrance is, in seconds on its timeline, drawn between its
  // steps (the frame's share of the way to the next); null outside it.
  get entranceTime() {
    if (this.phase !== PHASES.entrance || !this.entrance) return null;
    return Math.min(this.entrance.total, this.phaseTime + (this.alpha ?? 0) * this.step);
  }

  // The camera is held through the entrance: nobody to follow.
  get cameraTargets() {
    return this.phase === PHASES.entrance ? NOBODY : super.cameraTargets;
  }

  // Through the entrance, a resize lays the home view out again (see
  // placeEntranceCamera), never restarting anything.
  snapCamera() {
    if (this.phase !== PHASES.entrance) {
      super.snapCamera();
      return;
    }
    if (!this.view.pxW) return;
    this.placeEntranceCamera();
    this.syncView();
  }

  // The entrance's home view: the stage's centre, at the height the match
  // start's framing of both fighters on their spawns holds (Camera.snap,
  // from where they stand, though neither is drawn). Every battle stage's
  // spawns sit either side of its centre, so the follow camera's target as
  // the intro starts is this very view: it takes over with no jump.
  placeEntranceCamera() {
    const cam = this.camera;
    cam.snap(this.p1, this.p2);
    cam.x = this.stage.centerX - cam.w / 2;
    cam.clampToBounds();
  }

  // Through the entrance the view is the lens: the home view, never moved
  // or resized, so the stage's perspective and parallax never change
  // (js/game/rendering/screen-zoom.js). Part C's camera is a zoom of the
  // picture in screen space toward each spawn (entranceZoom), the spawn
  // burst's shake nudging that zoom as far as the framed region allows.
  // Outside the entrance, the usual view (Arena.syncView).
  syncView() {
    if (this.phase !== PHASES.entrance) {
      this.screenZoom = IDENTITY_ZOOM;
      super.syncView();
      return;
    }
    const v = this.view;
    const cam = this.camera;
    const scale = this.baseScale ?? v.scale;
    v.scale = scale;
    v.x = Math.round(cam.x * scale) / scale;
    v.y = Math.round(cam.y * scale) / scale;
    v.w = cam.w;
    v.h = cam.h;
    if (this.worldPerArt) this.pxPerArt = scale * this.worldPerArt;
    const shake = this.fx.shakeOffset(this.shakePx);
    this.screenZoom = nudgedZoom(this.entranceZoom(this.entranceTime ?? 0), v.pxW, v.pxH, -shake.x * v.dpr, -shake.y * v.dpr);
  }

  // Part C's zoom at entrance time `t` (entranceFraming): toward the spawn
  // of the team it visits, the framed region's centre moving from the
  // screen's centre to that fighter's middle as the zoom grows to
  // CONFIG.battle.entrance.zoom (its reducedZoom, gentler, with reduced
  // motion), held inside the home frame.
  entranceZoom(t) {
    const framing = entranceFraming(this.entrance, t);
    const v = this.view;
    if (!framing || !v.pxW) return IDENTITY_ZOOM;
    const f = this[framing.slot];
    const at = f.spawnPlacement(this.stage);
    const [sx, sy] = this.toScreen(at.x, at.y - f.body.height / 2);
    const most = this.reducedMotion ? this.entrance.reducedZoom : this.entrance.zoom;
    const a = framing.amount;
    return framedZoom(v.pxW, v.pxH, 1 + (most - 1) * a, v.pxW / 2 + (sx - v.pxW / 2) * a, v.pxH / 2 + (sy - v.pxH / 2) * a);
  }

  // The stage is drawn once the entrance's cover has hidden the versus
  // screen (until then the canvas keeps what it showed: the frame the
  // player had), through the entrance's zoom.
  render() {
    const t = this.entranceTime;
    if (t !== null && t < this.entrance.coverFull) return;
    withScreenZoom(this.ctx, this.screenZoom, () => super.render());
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
    this.cue('overtime');
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
  // off, a loser still on the stage is ejected (ejectLoser), and the
  // celebration starts. A later call changes nothing.
  finishMatch(result = this.liveResult) {
    if (this.final) return this.final;
    const { outcome, reason } = result;
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
    this.ejectLoser();
    this.setPhase(PHASES.celebration);
    this.startCelebration();
    this.cue('matchEnded', { winner: this.final.winner });
    // Ended from outside a step: nothing of this step is left to count.
    if (!this.stepping) this.sealFinal();
    return this.final;
  }

  // The match has a loser (any result but a draw: on time on points or on
  // Launch Point, in overtime on either, a forfeit): if that fighter is
  // still in play, it goes as a fall into the Void goes, where it stands,
  // so a match never ends with its loser standing on the stage. Its
  // elimination burst in its own palette (HitEffects.addElimination: the
  // flash, the shards and the shake), then out of play (lostToVoid) and
  // detached as the Void detaches a fighter (detachFromPlay: undrawn,
  // untargetable, nothing aimed at it left). Presentation and the state of
  // the match's end only: the result is already frozen, so no point is
  // scored, no fall is counted in the statistics and nobody respawns. A
  // loser the Void already took (a match won by a fall, or one still
  // waiting to respawn when the clock ran out) does not burst twice; a
  // draw ejects nobody. Called on both browsers of an online match alike,
  // on the step the match ends.
  ejectLoser() {
    const winner = this.final?.winner;
    if (!winner) return;
    const loser = this.fighters.find((f) => f.slot !== winner);
    if (!loser || loser.lostToVoid) return;
    this.fx.addElimination(loser);
    // Its ejection's sound, with its burst, once (never for a loser the
    // Void already took: that fall had its own).
    this.cue('ejected', { fighter: loser });
    loser.lostToVoid = true;
    loser.ejected = true;
    loser.endMashCombo?.('void');
    this.detachFromPlay(loser, 'void');
  }

  // Side `slot` gives the match up (an online player who left it): it ends
  // at once, as finishMatch does, won by the other side ('forfeit'),
  // whatever the score. Once the match is over, nothing changes.
  forfeit(slot) {
    if (this.final) return this.final;
    return this.finishMatch({ outcome: slot === 'p1' ? 'p2' : 'p1', reason: 'forfeit' });
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
