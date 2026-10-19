// CPU Intelligence: the brain. One universal intelligence that plays every
// fighter, at every level, through a player's controls.
//
// Purpose: run the layers in a deliberate hierarchy every fixed step:
//
//   1. observe     perception (the opponent as it was `latency` ago), the
//                  opponent model, the world model, own hits landed
//   2. forced      a stun, a freeze, a paralysis, an attack or technique
//                  playing out: nothing to decide but steering a launch
//   3. survival    off the stage: the recovery plan owns the inputs
//   4. threats     a newly recognized threat may interrupt any plan with
//                  the best defensive answer (defense.js)
//   5. combos      a hit just landed: the best follow-up the rules allow,
//                  found by the same evaluation against the launch the CPU
//                  dealt, pressed in time (hit-cancels, Dash and jump
//                  cancels), abandoned if it no longer connects
//   6. the plan    a committed plan carries on until its objective is met
//   7. strategy    on the level's reassessment cadence the match objective
//                  is re-weighed (objective.js: build, finish, stabilize,
//                  protect, survive, force, regroup), then the way to fight
//                  under it (strategy.js), and, when the current plan is not
//                  committed, a plan is chosen (a fresh decision on that
//                  cadence; in between only an opening it sees is taken):
//                  the best attack sequence if its utility, less what
//                  waiting for a clearer chance is worth, clears the bar
//                  the mode and the objective set (evaluator.js), else the
//                  movement they call for (neutral footwork that settles
//                  at its spacing, navigation to another level,
//                  edge-guarding, breaking off to a safer spot, a
//                  deliberate wait there with the Shield ready)
//   8. execute     the executor's legal inputs, with the ledge guard
//   9. liveness    the intent-aware safety net (telemetry.js): a wait its
//                  plan means is waiting; stillness nothing means is an
//                  inactivity incident and a fresh plan
//
// Match objective -> strategy mode -> tactical plan -> legal inputs: each
// level persists over many decisions of the one below, and survival (a
// threat, the way back to the stage) overrides any of them.
//
// The difficulty profile (js/data/difficulty.js) changes how well each
// layer works (latency, lapses, cadence, noise, prediction, plan depth,
// timing, guard, punish and finisher recognition, adaptation, Energy and
// risk sense, recovery, patience, discipline, how fully it reads the
// match), never what the fighter can do. Every random draw
// comes from the injected seeded RNG, so a seeded match replays exactly.
//
// Inputs: the Fighter it controls (FighterController contract: getInput
// once per fixed step), ctx (stage, gravity, battle). Outputs: CpuIntelligence.
// Important constraints: it only reads the game and returns an input
// snapshot; it never writes to a fighter, spawns, moves or hurts anything,
// and never reads the player's raw input.

import { range } from '../../../core/utils.js';
import { DEFAULT_DIFFICULTY, getDifficultyProfile, resolveDifficulty } from '../../../data/difficulty.js';
import { Perception } from './perception.js';
import { OpponentModel } from './opponent-model.js';
import { Situation } from './situation.js';
import { Strategy } from './strategy.js';
import { Evaluator } from './evaluator.js';
import { Defense } from './defense.js';
import { Executor } from './executor.js';
import { makePlan, COMMITTED, CONTINUED } from './plans.js';
import { Telemetry, STILL_LIMIT, WAIT_LIMIT } from './telemetry.js';
import { MatchObjective } from './objective.js';
import { STEP, Track, arcTrack, predictTrack, recoverySim } from './prediction.js';
import { riseOf, KO_VALUE } from './values.js';
import { analyzeCapabilities, moveReady } from './capabilities.js';
import { StageModel } from './stage-model.js';
import { BASE_FIGHTER_MOVEMENT as MV } from '../../../data/movement.js';

// How far ahead a recognized threat is answered (seconds to contact).
const THREAT_HORIZON = 0.9;

export class CpuIntelligence {
  constructor({ difficulty = DEFAULT_DIFFICULTY, rng = Math.random, debug = false } = {}) {
    this.kind = 'cpu';
    this.difficulty = resolveDifficulty(difficulty);
    this.profile = getDifficultyProfile(this.difficulty);
    this.rng = rng;
    this.perception = new Perception(rng, this.profile);
    this.opponent = new OpponentModel(this.profile);
    this.strategy = new Strategy(this.profile);
    this.objective = new MatchObjective(this.profile);
    this.situation = new Situation();
    this.evaluator = new Evaluator(this);
    this.defense = new Defense(this);
    this.executor = new Executor();
    this.telemetry = new Telemetry(debug);
    this.comboTrack = new Track(160);
    this.recoveryTrack = new Track(200);
    this.lagTrack = new Track(40);
    this.returnOut = {};
    this.scratchList = [];
    this.candidateList = [];
    this.out = this.executor.out;
    this.body = null;
    // Directives (tests, debugging): `neutral` false keeps it from starting
    // offense or footwork of its own (it still perceives, defends and
    // recovers); `command` hands it one plan to carry out.
    this.neutral = true;
    this.directive = null;
    this.reset();
  }

  // A new match, a restart or a rematch: forget everything, this opponent's
  // habits included.
  reset() {
    this.clock = 0;
    this.perception.reset();
    this.opponent.reset();
    this.strategy.reset();
    this.objective.reset(this.rng);
    this.executor.reset();
    this.telemetry.clear();
    this.usage = new Map();
    // When either fighter last did anything (an attack, a hit, a block):
    // how long the fight has gone quiet (the objective's impatience).
    this.lastExchange = 0;
    this.softReset();
  }

  // A fresh life (a respawn) or a fresh match: nothing held or planned,
  // the opponent's habits kept within a match.
  softReset() {
    this.plan = null;
    this.thinkTimer = 0;
    this.lastThink = this.clock;
    this.handled = new WeakSet();
    this.err = { vel: 1, x: 0, toVel: 1, toX: 0, until: 0 };
    this.combo = null;
    this.still = 0;
    this.lastInterrupt = null;
    this.threatened = false;
    this.diDir = 0;
    this.diUntil = 0;
    this.pendingShield = null;
    // The stage hazards' warnings this life has seen (by id): whether it
    // will react to each one and from when (see avoidHazards).
    this.seenZones = new Map();
    // The fading platform under it this life: whether it noticed, from when.
    this.seenFooting = null;
    this.sees = { opening: true, finisher: true };
    this.lastUsedLife = new Set();
    // Waiting: how long the current deliberate stillness has run, and until
    // when a reassessment that found a wait too long keeps it moving.
    this.waitRun = 0;
    this.restlessUntil = -Infinity;
    // The safer spot last worked out (see saferSpot), and when.
    this.spot = null;
    this.spotAt = -Infinity;
    this.retreatAfter = -Infinity;
    // Its own attack in play (whether it hit, was blocked or whiffed), and
    // when a whiff of its last left it open (a punish, if it is hit soon).
    this.ownAttack = null;
    this.whiffAt = -Infinity;
    // The run of pressure in progress (see pressed).
    this.pressure = { tries: 0, budget: 3, resetUntil: -Infinity };
    // Until when a wait keeps its Shield down after a long stint behind it
    // (see holdPlan): never camping behind it.
    this.shieldRestUntil = -Infinity;
    // A break-off to recover in progress: its Launch Point as it began and
    // whether it was hit since (see trackDisengage).
    this.disengage = null;
    this.prevLP = 0;
    this.executor.reset();
  }

  // ---- Controller contract ----------------------------------------------------------

  getInput(self, dt, ctx) {
    if (self.body !== this.body) {
      if (this.body) this.softReset();
      this.body = self.body;
    }
    this.clock += dt;
    const ex = this.executor;
    ex.begin(this.clock);
    if (self.inputLocked) {
      this.plan = null;
      return ex.finish(self, ctx.stage);
    }
    const foe = self.opponent;
    const present = !!foe && !foe.lostToVoid && Number.isFinite(foe.body?.x);
    if (present) this.perception.observe(foe, ctx.battle, this.clock, self);
    this.thinkTimer -= dt;
    const think = this.thinkTimer <= 0;
    if (think) {
      const p = this.profile;
      this.thinkTimer = range(this.rng, p.think[0], p.think[1]);
      // Its misjudgement of the opponent's spacing and motion: a lasting
      // impression that drifts toward a fresh one every second or so (a
      // player's sense of range is off for a while, not flickering).
      const e = this.err;
      if (this.clock >= e.until) {
        e.toVel = 1 + (this.rng() * 2 - 1) * p.predictError;
        e.toX = (this.rng() * 2 - 1) * p.rangeError;
        e.until = this.clock + 0.8 + this.rng() * 0.8;
      }
      e.vel += (e.toVel - e.vel) * 0.35;
      e.x += (e.toX - e.x) * 0.35;
      this.sees.opening = this.rng() < p.punish;
      this.sees.finisher = this.rng() < p.opportunity;
    }
    const s = this.situation.build(this, self, foe, ctx, think);
    if (present) {
      const mine = self.combat.attack;
      const threatening = !!mine && mine.def.hitbox && self.combat.phase !== 'recovery' && s.dist < s.myReach.lunge + 40;
      this.opponent.update(dt, this.perception.events, this.perception.view, s.dx, threatening, s.dist < s.foeReach.lunge + 40);
    }
    if (think) {
      const since = this.clock - this.lastThink;
      this.evaluator.begin(s);
      this.strategy.tick(since);
      this.strategy.estimate(s, this.evaluator.judge);
      this.objective.update(s, this.strategy, this, since, this.clock - this.lastExchange);
      this.strategy.update(s, this.opponent, this.evaluator.judge, this.objective);
      this.lastThink = this.clock;
      if (s.present && !this.sees.opening) s.op.busy = Math.min(s.op.busy, 0.05);
      if (s.present && this.sees.opening && s.op.busy > 0.25) this.telemetry.count('punishChances');
      if (s.present && this.strategy.finish > 0.5) this.telemetry.count(this.sees.finisher ? 'finishChances' : 'finishesMissed');
    }
    this.telemetry.spent(this.objective.kind, dt);
    this.decide(s, think, ex);
    const out = ex.finish(self, ctx.stage);
    this.liveness(s, ex);
    this.bookkeep(s, ex);
    return out;
  }

  // What this CPU is deliberately waiting for right now (the reason its
  // plan gives), or null: for the liveness monitor, tests and overlays.
  get waiting() {
    const p = this.plan;
    return p && p.intent === 'wait' && !this.executor.wantDir ? p.why ?? 'waiting' : null;
  }

  // The live direction of the opponent as the CPU perceives it, which every
  // attack, technique and summon startup it starts is aimed by (sampled by
  // the Fighter every step, see Fighter.updateAttackFacing): the same as a
  // player holding toward an opponent it sees, so a side switch is followed
  // only once it has been seen. Equal positions keep the last valid
  // direction; an absent or out-of-play target is ignored.
  attackFacing(self) {
    const foe = self.opponent;
    if (self.inputLocked || self.lostToVoid || !foe || foe.lostToVoid ||
        !Number.isFinite(foe.body?.x) || !Number.isFinite(self.body?.x)) return null;
    const seen = this.perception?.hasView && this.situation?.op && this.situation.present ? this.situation.op.x : foe.body.x;
    return Math.sign(seen - self.body.x) || self.attackVisualFacing || self.facing;
  }

  // ---- Directives -------------------------------------------------------------------

  // Hands the brain one plan to carry out next step (tests, debugging),
  // through the same legal inputs: { press: action } (that button's move
  // where the fighter is), { jump: 'ground' | 'high' | 'air', dir },
  // { dash: dir }, { move: dir, seconds }, { shield: seconds }.
  command(spec) {
    this.directive = spec;
  }

  directivePlan(s) {
    const d = this.directive;
    this.directive = null;
    if (d.press) {
      const air = !s.me.grounded;
      const move = s.caps.moves.find((m) => m.action === d.press && m.air === air) ?? s.caps.moves.find((m) => m.action === d.press);
      if (!move) return null;
      return makePlan('press', { move, wait: d.wait ?? 0.3, reason: 'directive' }, this);
    }
    if (d.jump) return makePlan('jump', { jump: d.jump, dir: d.dir ?? 0, hold: d.hold ?? 0.6, reason: 'directive' }, this);
    if (d.dash) return makePlan('dash', { dir: d.dash, reason: 'directive' }, this);
    if (d.move) return makePlan('move', { dir: d.move, until: this.clock + (d.seconds ?? 1), reason: 'directive' }, this);
    if (d.shield) return makePlan('shield', { raiseAt: this.clock, until: this.clock + d.shield, reason: 'directive' }, this);
    return null;
  }

  // ---- Decisions -----------------------------------------------------------------------

  decide(s, think, ex) {
    const self = s.self;
    const me = s.me;
    if (this.directive) {
      const plan = this.directivePlan(s);
      if (plan) this.setPlan(plan, s, 'directive');
    }
    this.incoming = null;
    if (!s.present) {
      this.absent(s, think, ex);
      return;
    }
    this.trackOwnHits(s);
    // Forced states: a stun, a freeze, a paralysis. Nothing to choose but
    // the direction a launch is steered.
    if (me.stun > 0 || me.paralysis > 0 || (me.hitstop > 0 && !me.attack)) {
      if (this.plan && this.plan.kind !== 'recover') {
        this.lastInterrupt = `hit during ${this.plan.kind}`;
        this.plan = null;
      }
      this.steerLaunch(s, ex);
      return;
    }
    // Survival: off the stage, getting back comes first.
    if (me.offstage && !me.inMotion && this.plan?.kind !== 'recover' && !this.safeAerialPlan(s)) {
      this.setPlan(this.recoveryPlan(s), s, 'offstage');
    }
    // A falling rock's warning under it: out of the circle, if it noticed.
    this.avoidHazards(s);
    // A platform fading out from under it: off it, if it noticed.
    this.avoidFadingFooting(s);
    // Threats: the best answer to anything newly recognized.
    this.answerThreats(s);
    // A deferred answer whose moment has come.
    const ps = this.pendingShield;
    if (ps && this.clock >= (ps.kind === 'shield' ? ps.raiseAt : ps.startAt) - 1.5 * STEP) {
      this.pendingShield = null;
      const ok = ps.kind === 'shield' ? me.grounded && (me.canAct || me.shielding) && this.clock < ps.until : me.grounded && me.canAct;
      if (ok) this.setPlan(this.planFromAnswer(ps, s), s, `${ps.kind} moment`);
    }
    // Combos: a hit just landed (never while charmed by the opponent: its
    // hits would heal it).
    // It knows its hit landed once it has seen it land (its hit-confirm,
    // quicker the more practised the level).
    if (this.combo && !this.combo.decided && this.plan?.kind !== 'recover' && this.clock + 1e-9 >= this.combo.confirmAt) {
      if (me.charmed > 0) this.combo.decided = true;
      else this.followUp(s);
    }
    // The plan in progress.
    this.runPlan(s, ex);
    // A new plan when there is none, or when the current one may be
    // reconsidered on this reassessment.
    const free = me.canAct || self.canFollowUp();
    if (free && (!this.plan || (think && !COMMITTED.has(this.plan.kind)))) {
      if (this.neutral || this.plan == null) {
        // A fresh decision comes on the level's reassessment cadence, like
        // the next thing a player decides to do; in between, only an
        // opening it sees is taken at once, and its footwork carries on.
        const fresh = think || me.offstage || this.opening(s);
        const plan = this.neutral ? (fresh ? this.choose(s) : this.movePlan(s)) : this.passivePlan(s);
        if (plan && plan !== this.plan) {
          this.setPlan(plan, s, null);
          ex.redo();
          this.runPlan(s, ex);
        } else if (plan) {
          ex.redo();
          this.runPlan(s, ex);
        }
        // A plan that ended on the very step it was chosen (overtaken
        // already) leaves footwork in its place, never nothing.
        if (plan && !this.plan && this.neutral && me.grounded && me.canAct) {
          this.setPlan(this.footwork(s), s, null);
          ex.redo();
          this.runPlan(s, ex);
        }
      }
    }
  }

  runPlan(s, ex) {
    const plan = this.plan;
    if (!plan) return;
    if (this.clock > plan.until + 0.5 && COMMITTED.has(plan.kind)) {
      this.telemetry.count('expiredPlans');
      this.lastInterrupt = `${plan.kind} expired`;
      this.plan = null;
      return;
    }
    const status = plan.step(plan, this, s, ex);
    if (status === 'run') return;
    if (status === 'fail') {
      this.telemetry.failed(plan.kind);
      this.lastInterrupt = `${plan.kind} failed`;
    }
    this.plan = null;
  }

  setPlan(plan, s, why) {
    const prev = this.plan;
    if (plan === prev) return;
    if (prev && why) this.lastInterrupt = `${prev.kind} interrupted: ${why}`;
    if (prev?.kind === 'hold') this.endWait(prev, why ? (why.endsWith('threat') ? 'answered a threat' : 'interrupted') : plan.cand ? 'took an opening' : 'changed plan');
    this.plan = plan;
    if (plan.kind === 'retreat' && prev?.kind !== 'retreat') this.telemetry.count('retreats');
    this.telemetry.planned(plan, this, s);
  }

  // A deliberate wait over, and why (counted once per wait).
  endWait(plan, why) {
    if (!plan || plan.kind !== 'hold' || plan.ended) return;
    plan.ended = true;
    this.telemetry.waitEnded(this, why);
  }

  // A plan dropped because the situation it was made for has gone. A
  // retreat given up is not tried again at once.
  abandon(plan, why) {
    this.telemetry.count('abandonedPlans');
    this.telemetry.note(this, `${plan.kind} abandoned`, why);
    this.lastInterrupt = why;
    if (plan.kind === 'retreat') {
      this.spot = null;
      this.retreatAfter = this.clock + 0.6;
    }
  }

  // Whether the plan in progress is an aerial strike that still leaves a way home.
  safeAerialPlan(s) {
    const p = this.plan;
    return !!p && (p.kind === 'jumpStrike' || p.kind === 'strike') && (p.cand?.elim ?? 0) < 0.2 && this.clock - p.start < 0.8 && s.me.airJumps > 0;
  }

  // ---- Stage hazards ---------------------------------------------------------------

  // A stage hazard's visible warning (a falling rock's red circle, see
  // StageModel.dangerZones) under the CPU, standing: it steps out of it,
  // the nearer way unless that way is under another warning, if it noticed
  // it at all. Whether it does is drawn once per warning, from how well it
  // reads the stage and how often it lapses (an Easy CPU often stands
  // there; even a Brutal one sometimes does), and it moves only after its
  // reaction time. It knows nothing until the warning shows, and nothing a
  // player could not see.
  avoidHazards(s) {
    const me = s.me;
    const model = s.model;
    if (!me.grounded || !me.canAct || !model.dangerZones.length) return;
    if (this.plan?.kind === 'move' && this.plan.dodge) return;
    const z = model.dangerAt(me.x, me.halfW, 6);
    if (!z) return;
    let seen = this.seenZones.get(z.id);
    if (!seen) {
      const p = this.profile;
      const chance = Math.min(0.9, (1 - p.lapse) * (0.3 + 0.7 * p.stageSense));
      seen = { react: this.rng() < chance, at: this.clock + range(this.rng, p.react[0], p.react[1]) };
      this.seenZones.set(z.id, seen);
      if (this.seenZones.size > 24) this.seenZones.delete(this.seenZones.keys().next().value);
    }
    if (!seen.react || this.clock < seen.at) return;
    const v = model.void;
    const exit = (dir) => z.x + dir * (z.radius + me.halfW + 18);
    const clear = (dir) => !model.dangerAt(exit(dir), me.halfW, 0) && exit(dir) > v.left + 80 && exit(dir) < v.right - 80;
    const near = Math.sign(me.x - z.x) || (me.x < model.centerX ? 1 : -1);
    const dir = clear(near) ? near : clear(-near) ? -near : near;
    const plan = makePlan('move', { dir, until: this.clock + Math.min(0.9, z.timeLeft + 0.1), reason: 'stepping out of a falling rock\'s warning' }, this);
    plan.dodge = z.id;
    this.setPlan(plan, s, 'falling rock');
  }

  // A dynamic platform under the CPU visibly fading out (see StageModel
  // surfaces): it walks off it, toward the side with footing below (the
  // nearer edge when both have), if it noticed at all. Like a hazard's
  // warning, whether it does is drawn once per platform it stands on, from
  // how well it reads the stage and how often it lapses, and it moves only
  // after its reaction time. Only what anyone can see: the fading itself,
  // never where the platform will form again.
  avoidFadingFooting(s) {
    const me = s.me;
    if (!me.grounded || !me.canAct || !me.ground) return;
    if (this.plan?.footing) return;
    const surf = s.model.surfaceOf(me.ground);
    if (!surf?.dynamic || !surf.fading) return;
    let seen = this.seenFooting;
    if (!seen || seen.ref !== surf.ref) {
      const p = this.profile;
      const chance = Math.min(0.95, (1 - p.lapse) * (0.35 + 0.65 * p.stageSense));
      seen = this.seenFooting = { ref: surf.ref, react: this.rng() < chance, at: this.clock + range(this.rng, p.react[0], p.react[1]) };
    }
    if (!seen.react || this.clock < seen.at) return;
    const below = (x) => s.model.supported(x, me.halfW, surf.y + 4);
    const left = surf.x0 - me.halfW - 20;
    const right = surf.x1 + me.halfW + 20;
    const nearer = me.x - surf.x0 < surf.x1 - me.x ? -1 : 1;
    const ok = (d) => below(d < 0 ? left : right);
    const dir = ok(nearer) ? nearer : ok(-nearer) ? -nearer : nearer;
    const plan = makePlan('move', { dir, until: this.clock + 0.9, reason: 'leaving a platform because its footing is fading' }, this);
    plan.footing = true;
    this.telemetry.count('footingEscapes');
    this.setPlan(plan, s, 'fading footing');
  }

  // ---- Threats ------------------------------------------------------------------------

  answerThreats(s) {
    const threats = this.defense.assess(s);
    this.threatened = threats.length > 0 && threats[0].contact < 0.5;
    // The soonest threat it knows of, for weighing its own options against.
    this.incoming = threats.length ? { contact: threats[0].contact, severity: threats[0].severity + threats[0].ko * 40, p: 0.85 } : null;
    if (!threats.length) return;
    const horizon = THREAT_HORIZON * (0.6 + this.profile.guard * 0.4);
    for (const t of threats) {
      if (t.contact > horizon || this.handled.has(t.ref)) continue;
      this.handled.add(t.ref);
      // A committed strike that lands first already answers it.
      const p = this.plan;
      if (p?.cand && (p.kind === 'strike' || p.kind === 'dashStrike') && (p.cand.contactK + 1) * STEP < t.contact - 0.03 && p.cand.p > 0.5) continue;
      if (p && (p.kind === 'shield' || p.kind === 'deflect') && p.threat && this.clock < p.until) continue;
      if (p?.kind === 'recover') continue;
      this.telemetry.count('threats');
      const answer = this.defense.choose(s, t);
      if (!answer) continue;
      // An answer for later (a Shield to raise, a jump to time): carry on
      // until its moment comes.
      const at = answer.kind === 'shield' ? answer.raiseAt : answer.startAt;
      if (at != null && at - this.clock > 0.1) {
        this.pendingShield = answer;
        this.telemetry.count(`answer.${answer.kind}`);
        break;
      }
      const plan = this.planFromAnswer(answer, s);
      if (plan) {
        this.telemetry.count(`answer.${answer.kind}`);
        if (this.plan) this.telemetry.count('threatInterrupts');
        this.setPlan(plan, s, `${t.kind} threat`);
        break;
      }
    }
  }

  planFromAnswer(a, s) {
    switch (a.kind) {
      case 'shield':
        return makePlan('shield', { raiseAt: a.raiseAt, until: a.until, threat: a.threat, perfect: a.perfect, reason: a.perfect ? 'perfect Shield' : 'Shield against a real threat' }, this);
      case 'jump':
        return makePlan('jump', { jump: a.jump, dir: a.dir, hold: 0.35, reason: a.why }, this);
      case 'move':
        return makePlan('move', { dir: a.dir, until: a.until, reason: a.why }, this);
      case 'dash':
        return makePlan('dash', { dir: a.dir, reason: a.why }, this);
      case 'airDrift':
        return makePlan('airDrift', { dir: a.dir, until: a.until, reason: a.why }, this);
      case 'deflect':
        return makePlan('deflect', { jump: a.jump, jumpAt: a.jumpAt, pressAt: a.pressAt, threat: a.threat, until: this.clock + 1, reason: a.why }, this);
      case 'strike':
        return this.planFromCandidate(a.cand, a.why);
      case 'press':
        return makePlan('press', { move: a.move, reason: a.why }, this);
      default:
        return null;
    }
  }

  // ---- Combos -----------------------------------------------------------------------

  // Records the CPU's own hits as they land: a follow-up to find, once it
  // has confirmed the hit (`confirmAt`: a practised player confirms
  // sooner). And how its attacks fare (a hit, a block; a whiff, and whether
  // the opponent punished it), for the opponent model.
  trackOwnHits(s) {
    const self = s.self;
    const a = self.combat.attack;
    const prev = this.ownAttack;
    if (prev && prev !== a) {
      if (!prev.hasHit && !prev.confirmed && !prev.blocked && prev.def?.hitbox) {
        this.opponent.ownOutcome('whiff');
        this.whiffAt = this.clock;
      }
    }
    this.ownAttack = a ?? null;
    const events = s.world?.combat?.events;
    if (!events?.length) return;
    for (const e of events) {
      if (e.attacker === s.foe && e.target === self && e.type === 'hit' && this.clock - this.whiffAt < 0.6) {
        this.opponent.ownOutcome('punished');
        this.whiffAt = -Infinity;
      }
      if (e.attacker !== self || e.target !== s.foe) continue;
      if (e.type === 'block') {
        this.opponent.ownOutcome('blocked');
        continue;
      }
      if (e.type !== 'hit') continue;
      this.opponent.ownOutcome('hit');
      this.pressure.tries = 0;
      const b = s.foe.body;
      const p = this.profile;
      this.combo = {
        at: this.clock, move: e.move, stun: Math.max(e.hitstun ?? 0, e.paralysis ?? 0), decided: false,
        confirmAt: this.clock + p.react[0] * Math.max(0, 1.2 - p.comboReliability),
        foe: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded, ground: b.ground, halfW: b.halfW, height: b.height },
        paralysis: e.paralysis ?? 0,
      };
    }
  }

  // The best follow-up to the hit just landed (see the header), as the
  // level finds and executes combos.
  followUp(s) {
    const c = this.combo;
    const self = s.self;
    const p = this.profile;
    const since = this.clock - c.at;
    // Seconds until this fighter can start something new.
    let wait = 0;
    if (!self.canFollowUp()) {
      const a = self.combat.attack;
      if (a?.confirmed && a.def.hitCancel != null) wait = Math.max(0, a.def.hitCancel - a.time);
      else if (a) wait = Math.max(0, a.def.total - a.time);
      else if (self.technique) wait = self.technique.endIn;
      else wait = 0.05;
    }
    const stunLeft = c.stun - since;
    if (wait > stunLeft + 0.25) {
      c.decided = true;
      return;
    }
    // The opponent's path: the launch just dealt, played out by the rules.
    const st = { ...c.foe, stun: c.paralysis > 0 ? 0 : c.stun, paralysis: c.paralysis, facing: s.foe.facing, hitstop: 0 };
    predictTrack(this.comboTrack, s.stage, s.gravity, st, { steps: 150, horizon: 0.1, velScale: 1 });
    this.comboTrack.origin = Math.min(this.comboTrack.len - 1, Math.round(since / STEP));
    // Its spacing misjudgement holds for a follow-up too.
    if (this.err.x) for (let i = 0; i < this.comboTrack.len; i++) this.comboTrack.x[i] += this.err.x;
    const saved = s.foeTrack;
    const savedBusy = s.op.busy;
    s.foeTrack = this.comboTrack;
    s.op.busy = Math.max(0, stunLeft);
    this.combo.stunLeft = Math.max(0, stunLeft);
    this.evaluator.begin(s);
    const list = this.evaluator.candidates(s, this.candidateList, { combo: true, wait });
    s.foeTrack = saved;
    s.op.busy = savedBusy;
    c.decided = true;
    let best = null;
    for (const cand of list) {
      this.unseenFinish(cand, s);
      if (cand.p < 0.4 || cand.utility < 0.4) continue;
      if (!best || cand.utility > best.utility) best = cand;
    }
    if (!best || this.rng() > p.comboReliability) {
      // Dropped: the level did not find it, or not in time. The opening it
      // left is not taken by another way either (see choose).
      c.dropped = true;
      return;
    }
    const plan = this.planFromCandidate(best, 'combo follow-up');
    if (plan) {
      plan.until = this.clock + wait + 0.8;
      plan.wait = wait + 0.15;
      if (best.kind === 'strike') plan.pressAt = this.clock + Math.max(0, wait - 0.05) + plan.timing * 0.5;
      this.setPlan(plan, s, 'combo');
      this.telemetry.count('combos');
    }
  }

  // ---- Choosing a plan -----------------------------------------------------------------

  planFromCandidate(c, why) {
    const reason = why ? `${why}: ${c.reason}` : c.reason;
    if (c.kind === 'jumpStrike' || c.kind === 'dashStrike') this.markPattern(c.kind);
    if (c.kind === 'dashStrike') return makePlan('dashStrike', { cand: c, reason, until: this.clock + 0.6 }, this);
    if (c.kind === 'jumpStrike') return makePlan('jumpStrike', { cand: c, reason, until: this.clock + (c.pressK + 30) * STEP }, this);
    return makePlan('strike', { cand: c, reason, wait: 0.15 }, this);
  }

  // A finisher it does not see this time (the level's `opportunity`, drawn
  // at each reassessment): the life the launch would end is not part of what
  // it makes of the move, which it may still choose for what else it does.
  unseenFinish(c, s) {
    if (this.sees.finisher || !(c.ko > 0.1)) return;
    c.utility -= c.p * c.ko * KO_VALUE * s.match.koFor;
  }

  // Whether the opponent, as the CPU sees it, is open right now (busy in its
  // recovery, a stun, a cast) and it means to take it.
  opening(s) {
    return s.present && this.sees.opening && s.op.busy > 0.1;
  }

  // Pressure that is not working (attacks on a free opponent that whiffed or
  // were blocked, one after another) is broken off for a moment: back to
  // its spacing, taking only an opening, before it presses again. A hit
  // landed keeps the momentum going. How many tries it gives a run of
  // pressure grows with the mode's aggression and the level's initiative.
  pressed(c) {
    const pr = this.pressure;
    if (c.open) return;
    pr.tries++;
    if (pr.tries < pr.budget) return;
    const p = this.profile;
    pr.tries = 0;
    pr.budget = 2 + Math.round(this.rng() * 3 * Math.max(0.2, this.strategy.params.aggro + p.initiative * 0.5));
    pr.resetUntil = this.clock + 0.3 + this.rng() * (0.5 + (1 - p.initiative) * 0.6);
    this.telemetry.count('pressureResets');
  }

  // The plan the strategy calls for now (see the header). Charmed by its
  // opponent (see `charm` in js/game/combat/hit-effects.js), every hit it
  // landed on that opponent would heal it: it strikes nothing and keeps its
  // distance until the charm runs out (see spacing).
  choose(s) {
    const me = s.me;
    const params = this.strategy.params;
    if (me.offstage) return this.recoveryPlan(s);
    const heal = this.healPlan(s);
    if (heal) return heal;
    if (me.charmed > 0) return this.movePlan(s);
    const list = this.evaluator.candidates(s, this.candidateList, {});
    const p = this.profile;
    const o = this.objective;
    // What keeping its options open is worth rather than committing now:
    // against a free opponent a patient player waits for a clearer chance
    // (the more patient the level, the more so when waiting suits the
    // objective, the less as impatience grows), while an opening (the
    // opponent still busy when the move lands) is taken. Waiting pays only
    // while the opponent may commit: little against one sitting behind its
    // Shield, less the more it turtles or holds back.
    const model = this.opponent;
    const commits = s.present ? (s.op.shielding ? 0.35 : 1) * (1 - 0.6 * model.turtling) * Math.min(1, 0.4 + model.aggressive) : 1;
    const wait = (0.4 + p.patience * 1.6) * o.select * (1 - o.impatience * 0.6) * commits;
    // Keeping out of the fight (recovering, protecting a lead), even an
    // opening must be a clear one, and is worth part of the wait.
    const guarded = o.wait >= 0.8;
    const openWait = guarded ? wait * 0.5 : 0;
    // Keeping out of the fight, it lets the opponent come: going in after
    // it (a Dash-in, a jump-in from the ground) costs more again.
    const goingIn = guarded ? wait * 0.6 : 0;
    const resetting = this.clock < this.pressure.resetUntil;
    // The opponent still reeling from its own hit: following that up is a
    // combo, and a combo is found and confirmed as the level finds and
    // confirms them (see followUp): not before the hit is confirmed, and
    // not at all once dropped.
    const k = this.combo;
    const ownStun = !!k && this.clock - k.at < k.stun + 0.15 && (this.clock < k.confirmAt || k.dropped);
    let best = null;
    let bestV = -Infinity;
    const noise = p.noise;
    for (const c of list) {
      this.unseenFinish(c, s);
      if (!c.open && resetting) continue;
      if (c.open && ownStun) continue;
      if (c.open && guarded && c.p < 0.45) continue;
      const initiates = !c.open && (c.kind === 'dashStrike' || (c.kind === 'jumpStrike' && c.jump && c.jump !== 'air'));
      const v = c.utility - (c.open ? openWait : wait) - (initiates ? goingIn : 0) + (this.rng() * 2 - 1) * noise * (0.6 + Math.abs(c.utility) * 0.35);
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    // The bar a commitment must clear: lower in an aggressive mode or
    // objective (and as impatience grows), higher when waiting suits it.
    const bar = 1.0 - params.aggro;
    if (best && bestV > bar && best.p > 0.12) {
      this.lastOffence = this.clock;
      this.pressed(best);
      return this.planFromCandidate(best, null);
    }
    return this.movePlan(s);
  }

  // Movement with a purpose: navigation to another level, edge-guarding,
  // airborne control, breaking off to a safer spot and waiting there,
  // neutral footwork (see plans.js).
  movePlan(s) {
    const me = s.me;
    const op = s.op;
    const p = this.profile;
    const obj = this.objective;
    if (!me.grounded) return makePlan('air', { spacing: this.spacing(s), fastFall: this.rng() < 0.4 + p.stageSense * 0.4, until: this.clock + 0.5, reason: 'air control toward a safe landing' }, this);
    // Breaking off to recover (the objective's call, the level's
    // discipline whether it heeds it), protecting a lead or running out the
    // clock: the safer spot, then a deliberate wait there.
    // (Not for a moment after a wait that ran too long: then it goes back
    // to the opponent, see liveness.)
    const restless = this.clock < this.restlessUntil;
    const defensive = !restless && (obj.bias.retreat ? this.heeds() : obj.kind === 'protect' || obj.kind === 'survive');
    // The opponent on another level: go there (not while keeping clear).
    const foeY = op.grounded ? op.y : op.view.lastGroundY;
    if (!defensive && Math.abs(foeY - me.y) > 40 && (op.grounded || Math.abs(op.vy) < 300) && !op.offstage) {
      return makePlan('navigate', { until: this.clock + 1.6, lastX: me.x, lastY: me.y, movedAt: this.clock, reason: 'opponent on another level' }, this);
    }
    // The opponent off the stage: hold the ledge it must come back to.
    if (op.offstage && p.stageSense > this.rng() * 0.6 && obj.kind !== 'survive') {
      const side = op.x < s.model.centerX ? -1 : 1;
      const ledge = side < 0 ? s.model.left : s.model.right;
      const targetX = ledge - side * (me.halfW + 8 + (1 - p.stageSense) * 40);
      return this.continued('edgeguard', { targetX, until: this.clock + 0.8, why: 'edge-guarding', reason: 'edge-guard: holding the ledge the opponent must return to' }, s);
    }
    // Cornered with the opponent in front: get past it, over its head.
    if (s.myEdge < 90 && s.dist < 160 && p.stageSense > 0.5 && this.rng() < p.stageSense * 0.5) {
      return makePlan('jump', { jump: 'high', dir: s.dir, hold: 0.5, reason: 'cornered: jumping past the opponent toward the centre' }, this);
    }
    // Hunting the finish from the wrong side (a horizontal launch from here
    // would send the opponent the long way, toward the centre): over it, to
    // launch it toward the nearer ledge.
    if (obj.kind === 'finish' && this.crossover(s)) {
      return makePlan('jump', { jump: 'high', dir: s.dir, hold: 0.5, reason: 'finish: crossing over to launch it toward the near ledge' }, this);
    }
    if (defensive) {
      const plan = this.defensivePlan(s);
      if (plan) return plan;
    }
    return this.footwork(s);
  }

  // Neutral footwork: the spacing the mode wants (out of the opponent's
  // reach while pressure is being reset), closing in by Dash when the mode
  // is offensive, settling once there. Impatient, or after a wait there
  // that ran too long (see liveness), it stops waiting at the edge of the
  // opponent's reach for something to happen and steps into its own.
  footwork(s) {
    const me = s.me;
    const p = this.profile;
    const resetting = this.clock < this.pressure.resetUntil;
    const pushing = !resetting && !(me.charmed > 0) && (this.clock < this.restlessUntil || this.objective.impatience > 0.5);
    let dist = resetting ? Math.max(this.spacing(s), s.foeReach.lunge + 30) : this.spacing(s);
    if (pushing) dist = Math.min(dist, Math.max(28, this.idealRange(s) - 6));
    const mode = this.strategy.mode;
    const offense = !resetting && (mode === 'rushdown' || mode === 'controlledOffense' || mode === 'finisherHunt');
    const dash = s.caps.movement.dash;
    return this.continued('neutral', {
      dist, baitRange: this.strategy.params.spacing === 'bait' ? 30 : 0,
      band: 14 + (1 - p.stageSense) * 14,
      edgeRoom: me.halfW + 12 + p.stageSense * 30 + (this.strategy.danger > 0.3 ? 80 : 0),
      dashIn: offense && !!dash && this.rng() < 0.35 + p.energySense * 0.4, dashFrom: (dash?.distance ?? 200) + 80,
      dashEnergy: 35 + p.energySense * 35, until: this.clock + 0.7, targetX: s.op.x - s.dir * dist, why: 'holding spacing',
      reason: resetting ? `${mode}: pressure not working, resetting to ${Math.round(dist)} from the opponent` :
        pushing ? `${mode}: nothing happening, stepping in to ${Math.round(dist)} from the opponent` : `${mode}: keeping ${Math.round(dist)} from the opponent`,
    }, s);
  }

  // A plan of a kind a reassessment may carry on with (see CONTINUED in
  // plans.js): the one in progress with its spec refreshed (its state kept:
  // a dead band, how long it has waited), or a new one.
  continued(kind, spec, s) {
    const cur = this.plan;
    if (cur && cur.kind === kind && CONTINUED.has(kind) && (spec.why == null || cur.why === spec.why)) {
      Object.assign(cur, spec);
      return cur;
    }
    return makePlan(kind, spec, this);
  }

  // Whether it heeds its objective's call to break off and recover: drawn
  // once each time the objective asks, from the level's discipline (a
  // casual player often keeps trading when it should not).
  heeds() {
    const o = this.objective;
    if (this.heedFor !== o.entries) {
      this.heedFor = o.entries;
      this.heeding = this.rng() < 0.3 + 0.7 * this.profile.discipline;
    }
    return this.heeding;
  }

  // Breaking off to recover, protecting a lead, running out the clock:
  // toward a safer spot when there is a clearly better one within reach,
  // else a deliberate wait where it stands, the Shield ready while it has
  // the Energy for it.
  defensivePlan(s) {
    const me = s.me;
    const obj = this.objective;
    const spot = this.clock < this.retreatAfter ? null : this.saferSpot(s);
    if (spot && !spot.stay && Math.abs(spot.x - me.x) > 50 && spot.gain > 0.25) {
      return this.continued('retreat', {
        targetX: spot.x, until: this.clock + 1.8, dashOk: obj.kind === 'stabilize', lastX: me.x, movedAt: this.clock, why: 'safer spot',
        reason: `${obj.kind}: ${spot.danger < spot.here - 0.05 ? `moving to safer ground (${Math.round(spot.danger * 100)}% a launch ends its life there, ${Math.round(spot.here * 100)}% here)` : 'making room to recover (more space from the opponent and the ledge)'}` +
          `${s.dist < 260 ? ', the opponent near' : ''}`,
      }, s);
    }
    if (this.clock < this.restlessUntil) return null;
    const why = obj.kind === 'stabilize' ? 'recovering Launch Point' : obj.kind === 'survive' ? 'running out the clock' : 'protecting the lead';
    const guard = s.caps.shield && !me.exhausted && me.energy > 40 && this.clock >= this.shieldRestUntil ? 'shield' : 'open';
    // A wait the opponent's reach would end at once is no wait: it keeps
    // its footwork (or fights) instead.
    if (s.present && s.dist < s.foeReach.lunge + 30 && guard !== 'shield' && this.plan?.kind !== 'hold') return null;
    return this.holdPlan(s, why, {
      guard,
      lpTarget: obj.kind === 'stabilize' ? Math.max(0, me.lp * 0.4) : null,
      reason: obj.kind === 'stabilize'
        ? `holding here, Shield ready, while Launch Point ${Math.round(me.lp)} recovers (the opponent ${Math.round(s.dist)} away)`
        : `holding a safe spot: ${obj.reason}`,
    });
  }

  // A deliberate wait (see `hold` in plans.js) for `why`, carried on if it
  // is already waiting for the same reason. How long it is content to wait
  // grows with the level's patience and how well waiting suits the
  // objective; the Shield is held for at most a few blocks, and not past
  // what the Energy allows.
  holdPlan(s, why, { guard = 'open', lpTarget = null, reason = why, absent = false } = {}) {
    const cur = this.plan;
    if (cur?.kind === 'hold' && cur.why === why && !cur.ended) {
      cur.guard = guard;
      cur.reason = reason;
      return cur;
    }
    const p = this.profile;
    const patience = (1.4 + p.patience * 2.6 + this.objective.wait * 1.6) * (1 + this.objective.temper.patience);
    return makePlan('hold', {
      why, reason, guard, holdX: s.me.x, lpTarget, absent, objective: absent ? null : this.objective.kind, intent: 'wait',
      patience, until: this.clock + patience + 0.5, blocks: 0, maxBlocks: 2 + Math.round(p.discipline * 2), lastStun: 0,
      shieldFor: 0, maxShield: 0.9 + p.patience * 1.4, raised: false,
    }, this);
  }

  // Whether the hold's Shield can go up (and stay up): on the ground, not
  // exhausted, Energy for a couple of blocks, not held past the wait's
  // allowance.
  shieldUsable(s, plan) {
    const me = s.me;
    return !!s.caps.shield && me.grounded && !me.exhausted && me.energy > 30 && plan.shieldFor < plan.maxShield;
  }

  // A safer spot to break off to, worked out a couple of times a second
  // from the real launch rules (Strategy.dangerAt: how likely the
  // opponent's best launch would be to end its life there, struck from the
  // opponent's side, the Void in force included): a handful of spots on the
  // floor it stands on, away from the opponent and at the centre, each
  // weighed by that danger, the room it leaves (to the opponent and to the
  // ledge behind) and the way there (never through the opponent, never into
  // a hazard's warning). A lower level weighs fewer spots and less exactly.
  // { x, danger, here, stay }.
  saferSpot(s) {
    if (this.clock < this.spotAt && this.spot) return this.spot;
    this.spotAt = this.clock + 0.4;
    const me = s.me;
    const op = s.op;
    const model = s.model;
    const p = this.profile;
    const judge = this.evaluator.judge;
    const surf = (me.ground && model.surfaceOf(me.ground)) || model.fixed[0];
    const lo = (surf.main ? model.left : surf.x0) + me.halfW + 40;
    const hi = (surf.main ? model.right : surf.x1) - me.halfW - 40;
    const away = -s.dir;
    // Measured as the objective measures it: after another hit or two.
    const extra = 8;
    const here = this.strategy.dangerAt(s, judge, me.x, me.y, extra);
    const xs = [me.x, me.x + away * 160, me.x + away * 320, model.centerX];
    if (p.stageSense > 0.6) xs.push(me.x + away * 480);
    let best = { x: me.x, danger: here, here, stay: true, score: -Infinity, gain: 0 };
    let stayScore = -Infinity;
    const score = (x, danger) => {
      const sep = Math.abs(x - op.x);
      const behind = model.edgeRoom(x, Math.sign(x - op.x) || away);
      const v = model.blast(x, me.y, me.height);
      return -danger * 3 + Math.min(sep, 500) / 500 * 0.6 + Math.min(behind, 300) / 300 * 0.5 -
        Math.abs(x - me.x) / 1400 * 0.3 + Math.min(v.left, v.right) / 800 * 0.3 + (this.rng() * 2 - 1) * (1 - p.stageSense) * 0.5;
    };
    for (let i = 0; i < xs.length; i++) {
      // Where it stands is always weighed as it is; every other spot is
      // kept on its footing, and never past the opponent (no way there
      // but through it) or under a hazard's warning.
      const stay = i === 0;
      const x = stay ? me.x : lo > hi ? model.centerX : Math.min(hi, Math.max(lo, xs[i]));
      if (!stay && Math.abs(x - me.x) < 20) continue;
      if (!stay && Math.sign(x - me.x) === s.dir && Math.abs(x - me.x) > Math.abs(op.x - me.x) - 40) continue;
      if (!stay && model.dangerZones.length && model.dangerAt(x, me.halfW, 20)) continue;
      const danger = stay ? here : this.strategy.dangerAt(s, judge, x, me.y, extra);
      const v = score(x, danger) + (stay ? 0.15 : 0);
      if (stay) stayScore = v;
      if (v > best.score) best = { x, danger, here, stay, score: v, gain: 0 };
    }
    best.gain = best.score - stayScore;
    this.spot = best;
    return best;
  }

  // Hunting the finish, but on the wrong side: the CPU's horizontal
  // launchers would send the opponent toward the centre (far from any
  // Void) while the ledge behind the opponent's other side is near. Only
  // up close, with a horizontal finisher in the kit, and as often as the
  // level sees the stage that way.
  crossover(s) {
    if (s.dist > 200 || !s.op.grounded || s.myEdge < 120) return false;
    if (!s.caps.moves.some((m) => m.finisher.dir === 'horizontal' && m.finisher.baseLaunch >= 2)) return false;
    const longWay = s.model.edgeRoom(s.op.x, s.dir);
    const shortWay = s.model.edgeRoom(s.op.x, -s.dir);
    if (!(longWay > shortWay + 400)) return false;
    return this.rng() < this.profile.stageSense * this.profile.opportunity * 0.5;
  }

  // The neutral distance the current mode wants (charmed, out of the
  // opponent's reach whatever the mode).
  spacing(s) {
    const poke = s.foeReach.poke;
    const lunge = s.foeReach.lunge;
    if (s.me.charmed > 0) return Math.min(480, lunge + 90);
    const ideal = this.idealRange(s);
    switch (this.strategy.params.spacing) {
      case 'close': return Math.max(28, ideal - 6);
      case 'edge': return Math.max(ideal, poke + 6);
      case 'bait': return lunge + 18;
      case 'far': return Math.min(480, Math.max(lunge + 80, this.zoneRange(s) * 0.7));
      default: return poke + 26;
    }
  }

  idealRange(s) {
    let best = Infinity;
    for (const m of s.caps.ground) {
      if (m.kind !== 'melee' || !m.reach || m.lead > 0.2) continue;
      best = Math.min(best, m.reach.x + m.reach.w * 0.55 + s.foeCaps.hurt.hw * 0.6);
    }
    return Number.isFinite(best) ? best : 60;
  }

  zoneRange(s) {
    let r = 0;
    for (const m of s.caps.ground) if (m.projectile && m.kind === 'ranged') r = Math.max(r, m.projectile.range);
    return r || 300;
  }

  // A heal of its own (a technique that gives Launch Point back, see
  // `heal` in js/game/combat/technique.js): worth its cast once the CPU has
  // taken enough for the whole heal to count, and only where nothing can
  // break the cast before it lets go: no threat on its way, and the
  // opponent (busy as long as it is, then closing in with a Dash and a run)
  // unable to come within reach before then. With nobody to fight (the
  // opponent respawning) that is any time on the ground.
  healPlan(s) {
    const me = s.me;
    if (!me.grounded || !me.canAct || me.offstage) return null;
    for (const m of s.caps.moves) {
      if (!(m.heal > 0) || !moveReady(s.self, m) || me.lp < m.heal * 1.2) continue;
      if (s.present) {
        if (this.threatened || (this.incoming && this.incoming.contact < m.commitment + 0.15)) continue;
        if (this.opponentArrives(s) < m.lead + 0.15) continue;
      }
      return makePlan('press', { move: m, reason: `heal: ${Math.round(me.lp)} Launch Point, the opponent out of reach` }, this);
    }
    return null;
  }

  // Seconds before the opponent could strike the CPU from where it is: what
  // keeps it busy, a moment to react, then the gap beyond its longest reach
  // closed with a Dash and a run at top speed.
  opponentArrives(s) {
    const gap = Math.max(0, s.dist - s.foeReach.lunge);
    const dash = s.foeCaps.movement.dash ? MV.dashSpeed * MV.dashDuration : 0;
    const close = gap <= dash ? gap / MV.dashSpeed : (dash ? MV.dashDuration : 0) + (gap - dash) / MV.maxSpeed;
    return s.op.busy + 0.12 + close;
  }

  // With its own decisions held (`neutral` off): only what keeps it safe.
  passivePlan(s) {
    if (s.me.offstage) return this.recoveryPlan(s);
    return null;
  }

  // Nobody to fight (the opponent is out, waiting to respawn): get back
  // onto the stage if off it, then take up a good position for its return:
  // on the centre side of where it will reappear, outside its reach.
  absent(s, think, ex) {
    const me = s.me;
    if (me.stun > 0 || me.paralysis > 0) return;
    // An attack planned on the opponent that has just left play is dropped
    // before it is pressed: nobody to hit (one already started plays out).
    const p = this.plan;
    if (p && p.pressedAt == null && (p.cand || p.kind === 'deflect' || (p.kind === 'press' && !(p.move?.heal > 0)))) {
      this.lastInterrupt = `${p.kind} dropped: opponent out of play`;
      this.plan = null;
    }
    if (me.offstage && this.plan?.kind !== 'recover') this.setPlan(this.recoveryPlan(s), s, 'offstage');
    if (!this.plan || (think && !COMMITTED.has(this.plan.kind))) {
      const heal = this.neutral ? this.healPlan(s) : null;
      if (heal) this.setPlan(heal, s, null);
      else if (me.grounded) {
        const foe = s.foe;
        const spawnX = foe?.spawn?.x ?? s.model.centerX;
        const toward = Math.sign(s.model.centerX - spawnX) || 1;
        const reach = foe ? analyzeCapabilities(foe) : null;
        const keep = reach ? 160 + Math.max(...reach.moves.filter((m) => m.reach).map((m) => m.reach.x + m.reach.w), 60) * 0.5 : 200;
        // After a long wait there (see liveness), a fresh spot a little nearer
        // the centre.
        const restless = this.clock < this.restlessUntil ? toward * 120 : 0;
        const targetX = s.model.safeSpot(spawnX + toward * keep + restless, me.halfW + 60);
        // There, it waits for the return (its Launch Point recovering
        // meanwhile): standing ready is the plan.
        this.setPlan(this.continued('reposition', {
          targetX, until: this.clock + 0.8, why: 'opponent respawning',
          reason: `opponent respawning: taking up a spot ${Math.round(Math.abs(targetX - spawnX))} from where it returns`,
        }, s), s, null);
      } else if (!this.plan) {
        this.setPlan(makePlan('air', { targetX: s.model.centerX, fastFall: false, until: this.clock + 0.4, reason: 'landing while the opponent respawns' }, this), s, null);
      }
    }
    this.runPlan(s, ex);
  }

  // ---- Recovery ----------------------------------------------------------------------

  // A recovery plan: the policy (when to air jump, when to air dash) that
  // gets back with the most room, tried by simulation (more variants on a
  // higher level).
  recoveryPlan(s) {
    const me = s.me;
    const p = this.profile;
    const caps = s.caps;
    const res = {
      airJumps: me.freeFall ? 0 : me.airJumps,
      airDash: caps.movement.airDash && me.airDashes > 0 ? caps.movement.airDash.distance : 0,
      dashOk: !me.exhausted, launched: me.launched, rise: me.freeFall ? null : riseOf(caps),
    };
    const variants = [{ jumpBelow: 30, dashFar: 150 }, { jumpBelow: 70, dashFar: 110 }, { jumpBelow: 10, dashFar: 220 }, { jumpBelow: 50, dashFar: 0 },
      { jumpBelow: 90, dashFar: 90, dashEarly: true }];
    const n = Math.max(2, Math.round(1 + p.recoverySkill * 4));
    let best = variants[0];
    let bestScore = -Infinity;
    const st = { x: me.x, y: me.y, vx: me.vx, vy: me.vy, grounded: false, halfW: me.halfW, height: me.height };
    const path = this.recoveryTrack;
    for (const v of variants.slice(0, n)) {
      const r = recoverySim(s.model, s.gravity, st, { ...res, airDash: v.dashFar > 0 ? res.airDash : 0 }, { ...v, maxSteps: 200 }, {}, path);
      // Back on the stage, with room, keeping the most for later: a lift
      // that ends in free fall is the last resort. A route through the
      // reach of an opponent waiting at the ledge is a route into its
      // edge-guard: the level's stage sense weighs it.
      const score = (r.ok ? 100 : r.fell ? -100 : 0) + Math.min(60, r.margin) - r.jumps * 4 - (r.dashed ? 6 : 0) - (r.rose ? 25 : 0) -
        this.edgeGuardExposure(s, path) * (0.3 + 0.7 * p.stageSense);
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    // A lower level judges the timing less precisely.
    const err = (1 - p.recoverySkill) * 40;
    return makePlan('recover', {
      jumpBelow: Math.max(0, best.jumpBelow + (this.rng() * 2 - 1) * err), dashFar: best.dashFar, until: this.clock + 3,
      reason: `recovering: air jump ${Math.round(best.jumpBelow)} under the ledge${best.dashFar ? ', air dash home when far' : ''}`,
    }, this);
  }

  // Whether the CPU, off the stage and waiting on `plan`, could still get
  // back if it set off a moment from now: falling `lag` seconds as it is,
  // then the recovery it would fly with what it has left (the point of no
  // return, with a margin). Checked every few steps per plan.
  canStillReturn(s, plan, lag = 0.25) {
    if (plan.returnAt != null && this.clock < plan.returnAt) return plan.canReturn;
    plan.returnAt = this.clock + 3 * STEP;
    const me = s.me;
    const caps = s.caps;
    const st = { x: me.x, y: me.y, vx: me.vx, vy: me.vy, grounded: false, halfW: me.halfW, height: me.height };
    const fall = arcTrack(this.lagTrack, s.stage, s.gravity, st, { jump: null, dir: 0, steps: Math.round(lag / STEP) });
    let ok = true;
    if (fall.len) {
      const k = fall.len - 1;
      if (fall.g[k]) ok = true;
      else {
        const from = { x: fall.x[k], y: fall.y[k], vx: fall.vx[k], vy: fall.vy[k], grounded: false, halfW: me.halfW, height: me.height };
        const res = {
          airJumps: me.freeFall ? 0 : me.airJumps,
          airDash: caps.movement.airDash && me.airDashes > 0 ? caps.movement.airDash.distance : 0,
          dashOk: !me.exhausted, launched: false, rise: me.freeFall ? null : riseOf(caps),
        };
        ok = false;
        for (const v of [{ jumpBelow: 30, dashFar: 150 }, { jumpBelow: 70, dashFar: 110 }, { jumpBelow: 10, dashFar: 220 }]) {
          if (recoverySim(s.model, s.gravity, from, res, { ...v, maxSteps: 200 }, this.returnOut).ok) {
            ok = true;
            break;
          }
        }
      }
    }
    // A lower level sometimes misses the moment.
    plan.canReturn = ok || this.rng() > 0.6 + 0.4 * this.profile.stageSense;
    return plan.canReturn;
  }

  // How exposed a recovery route (`path`, a Track from now) is to the
  // opponent: the steps it passes within reach of where the opponent is
  // predicted to be once free to act (its lunges and aerials), as a
  // penalty on the route's score.
  edgeGuardExposure(s, path) {
    if (!s.present || s.op.offstage) return 0;
    const reachX = s.foeReach.lunge + 50;
    const reachY = s.foeCaps.height + 60;
    const from = Math.ceil(s.op.busy / STEP);
    let steps = 0;
    for (let k = from; k < path.len; k++) {
      const f = s.foeTrack.i(k);
      if (Math.abs(path.x[k] - s.foeTrack.x[f]) < reachX && Math.abs(path.y[k] - s.foeTrack.y[f]) < reachY) steps++;
    }
    return Math.min(45, steps * 1.5);
  }

  // Steering a launch while stunned: toward the stage's centre, as a
  // player may (a held direction bends the launch of the next hit).
  steerLaunch(s, ex) {
    if (this.clock > this.diUntil) {
      this.diUntil = this.clock + 0.3;
      this.diDir = this.rng() < this.profile.diSkill ? Math.sign(s.model.centerX - s.me.x) : 0;
    }
    ex.dir(this.diDir);
  }

  // Whether a planned strike still makes sense from where the CPU really
  // is now (a plan made a few steps ago may have been overtaken: a pull, a
  // push, the opponent moving): its melee strike still meets the opponent's
  // predicted path, and it still leaves a way back to the stage. Lower
  // levels check less carefully (they more often press what was planned).
  stillGood(plan, s) {
    const c = plan.cand;
    const m = c?.move;
    if (!m || !s.present || (m.kind !== 'melee' && m.kind !== 'deflect')) return true;
    const ev = this.evaluator;
    const face = Math.sign(s.op.x - s.me.x) || s.me.facing;
    const r = ev.melee(s, m, s.me, face, 0);
    const elim = r ? ev.eliminationRisk(s, m, { ...r, kind: 'strike' }) : ev.eliminationRisk(s, m, this.endOf(s, m));
    if (elim > 0.2 && this.rng() < 0.4 + this.profile.riskSense * 0.6) return false;
    if (!r && this.rng() < this.profile.riskSense) return false;
    return true;
  }

  // Where move `m` started now ends (no contact): for the elimination check.
  endOf(s, m) {
    const t = this.evaluator.selfTrack;
    const e = Math.max(0, t.len - 1);
    return { endX: t.x[e], endY: t.y[e], endGrounded: !!t.g[e], kind: 'strike', jump: null };
  }

  // ---- Bookkeeping ---------------------------------------------------------------------

  markUsed(m) {
    const u = this.usage.get(m.key) ?? { n: 0, at: -Infinity };
    u.n = u.n * Math.exp(-(this.clock - u.at) / 6) + 1;
    u.at = this.clock;
    this.usage.set(m.key, u);
    this.lastUsedLife.add(m.key);
    this.lastOffence = this.clock;
  }

  // How predictable move `m` (and the way it is delivered: a jump-in, a
  // Dash-in) has become from repeating it (0-0.4): what a watching
  // opponent would anticipate, and cover.
  predictability(m, kind = null) {
    const decayed = (key) => {
      const u = this.usage.get(key);
      return u ? u.n * Math.exp(-(this.clock - u.at) / 6) : 0;
    };
    const own = Math.min(0.3, Math.max(0, decayed(m.key) - 1.2) * 0.07);
    const how = kind === 'jumpStrike' || kind === 'dashStrike' ? Math.min(0.25, Math.max(0, decayed(kind) - 2) * 0.05) : 0;
    return Math.min(0.4, own + how);
  }

  // Remembers the way a strike was delivered (a jump-in, a Dash-in).
  markPattern(kind) {
    const u = this.usage.get(kind) ?? { n: 0, at: -Infinity };
    u.n = u.n * Math.exp(-(this.clock - u.at) / 6) + 1;
    u.at = this.clock;
    this.usage.set(kind, u);
  }

  // Whether `m` has not been used yet this life: a little surprise value.
  unused(m) {
    return !this.lastUsedLife.has(m.key);
  }

  // What reaching for move `m` is worth for variety alone: more the longer
  // it has gone unused (a move left idle is one the opponent stops
  // covering), most for one not yet used this life. A stronger player
  // mixes its options up more deliberately (`adapt`).
  variety(m) {
    const u = this.usage.get(m.key);
    const idle = u ? this.clock - u.at : this.clock + 30;
    return (this.unused(m) ? 0.35 : 0) + Math.min(0.9, idle / 25) * (0.2 + 0.8 * this.profile.adapt);
  }

  // The safety net, aware of intent: free to act, on the ground, in a live
  // match, with nothing held, pressed or moving. Standing still because its
  // plan means it (`intent` 'wait': a hold, footwork settled at its
  // spacing, a ledge guarded, a spot taken while the opponent respawns) is
  // waiting, counted as such; a wait that runs on unbroken past WAIT_LIMIT
  // makes it reassess (and, unless waiting is winning, move for a moment
  // before it may wait again). Stillness its plan does not mean (no plan, a
  // plan that should be moving, a walk the ledge guard keeps holding back)
  // is an inactivity incident after STILL_LIMIT, by cause, and a fresh
  // plan at once.
  liveness(s, ex) {
    const self = s.self;
    if (self.inputLocked) return;
    const me = s.me;
    const free = me.canAct && me.grounded;
    const blocked = ex.heldBack;
    const active = (ex.wantDir && !blocked) || ex.held.shield || ex.pressed || ex.held.jump || ex.mouvement || Math.abs(me.vx) > 15;
    if (!free || active) {
      this.still = 0;
      this.waitRun = 0;
      return;
    }
    const plan = this.plan;
    if (plan && plan.intent === 'wait' && !blocked) {
      this.still = 0;
      this.waitRun += STEP;
      this.telemetry.waited(plan.why ?? 'waiting', STEP);
      if (this.waitRun > WAIT_LIMIT) {
        this.waitRun = 0;
        this.telemetry.count('longWaits');
        this.telemetry.note(this, 'long wait', `still for ${WAIT_LIMIT} s (${plan.why ?? 'waiting'}): reassessing`);
        this.thinkTimer = 0;
        if (this.objective.kind !== 'survive') {
          this.restlessUntil = this.clock + 1.5;
          this.endWait(plan, 'waited too long');
          this.plan = null;
        }
      }
      return;
    }
    this.still += STEP;
    if (this.still > STILL_LIMIT) {
      const cause = blocked ? 'held back at a ledge' : !plan ? 'no plan' : `${plan.kind} not moving`;
      this.telemetry.inactive(cause);
      if (blocked) this.telemetry.count('navigationFailures');
      this.lastInterrupt = 'inactivity';
      this.still = 0;
      this.plan = null;
      this.thinkTimer = 0;
    }
  }

  // Per-step bookkeeping after the inputs: when the fight last saw an
  // exchange (either fighter attacking, any hit or block between them), and
  // how a break-off to recover is going (the Launch Point it gets back
  // while keeping out of the fight, and whether it held or was broken by a
  // hit).
  bookkeep(s, ex) {
    const me = s.me;
    if (ex.pressed) this.lastExchange = this.clock;
    if (s.present) {
      for (const e of this.perception.events) {
        if (e.recognized && (e.kind === 'attack' || e.kind === 'technique' || e.kind === 'summon')) this.lastExchange = this.clock;
      }
    } else {
      this.lastExchange = this.clock;
    }
    const events = s.world?.combat?.events;
    let hit = false;
    if (events?.length) {
      for (const e of events) {
        if (e.attacker === s.self || e.target === s.self) this.lastExchange = this.clock;
        if (e.target === s.self && e.type === 'hit') hit = true;
      }
    }
    this.trackDisengage(s, hit);
    this.prevLP = me.lp;
  }

  // A break-off to recover: from the first retreat or wait the stabilize
  // objective calls for, to the objective changing. It held if it got some
  // Launch Point back unhit; it broke if a hit landed meanwhile.
  trackDisengage(s, hit) {
    const me = s.me;
    const kind = this.plan?.kind;
    const off = this.objective.kind === 'stabilize' && (kind === 'retreat' || kind === 'hold');
    let d = this.disengage;
    if (!d && off) d = this.disengage = { at: this.clock, lp: me.lp, hit: false, got: 0 };
    if (!d) return;
    if (hit) d.hit = true;
    const back = this.prevLP - me.lp;
    if (back > 0 && back <= 2 && !hit) {
      d.got += back;
      this.telemetry.count('lpRecovered', back);
    }
    if (this.objective.kind !== 'stabilize' || hit) {
      if (d.hit) {
        this.telemetry.count('retreatsBroken');
        this.telemetry.note(this, 'retreat broken', `hit after recovering ${Math.round(d.got)} Launch Point`);
      } else if (d.got >= 3) {
        this.telemetry.count('retreatsHeld');
        this.telemetry.note(this, 'retreat held', `recovered ${Math.round(d.got)} Launch Point in ${(this.clock - d.at).toFixed(1)} s`);
      }
      this.disengage = null;
    }
  }
}

export { StageModel };
