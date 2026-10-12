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
//   7. strategy    on the level's reassessment cadence the mode is
//                  re-weighed (strategy.js) and, when the current plan is
//                  not committed, a new one is chosen: the best attack
//                  sequence if its utility clears the mode's bar
//                  (evaluator.js), else the movement the mode calls for
//                  (neutral footwork, navigation to another level,
//                  edge-guarding, repositioning)
//   8. execute     the executor's legal inputs, with the ledge guard
//   9. liveness    the inactivity and stuck-plan safety net (telemetry.js)
//
// The difficulty profile (js/data/difficulty.js) changes how well each
// layer works (latency, lapses, cadence, noise, prediction, plan depth,
// timing, guard, punish and finisher recognition, adaptation, Energy and
// risk sense, recovery), never what the fighter can do. Every random draw
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
import { makePlan, COMMITTED } from './plans.js';
import { Telemetry, STILL_LIMIT } from './telemetry.js';
import { STEP, Track, arcTrack, predictTrack, recoverySim } from './prediction.js';
import { riseOf } from './values.js';
import { analyzeCapabilities } from './capabilities.js';
import { StageModel } from './stage-model.js';

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
    this.executor.reset();
    this.telemetry.clear();
    this.usage = new Map();
    this.softReset();
  }

  // A fresh life (a respawn) or a fresh match: nothing held or planned,
  // the opponent's habits kept within a match.
  softReset() {
    this.plan = null;
    this.thinkTimer = 0;
    this.lastThink = this.clock;
    this.handled = new WeakSet();
    this.err = { vel: 1, x: 0 };
    this.combo = null;
    this.still = 0;
    this.lastInterrupt = null;
    this.threatened = false;
    this.diDir = 0;
    this.diUntil = 0;
    this.pendingShield = null;
    this.sees = { opening: true, finisher: true };
    this.lastUsedLife = new Set();
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
      this.err.vel = 1 + (this.rng() * 2 - 1) * p.predictError;
      this.err.x = (this.rng() * 2 - 1) * p.rangeError;
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
      this.evaluator.begin(s);
      this.strategy.update(s, this.opponent, this.evaluator.judge, this.clock - this.lastThink);
      this.lastThink = this.clock;
      if (s.present && !this.sees.opening) s.op.busy = Math.min(s.op.busy, 0.05);
    }
    this.decide(s, think, ex);
    this.liveness(s, ex);
    return ex.finish(self, ctx.stage);
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
    // Threats: the best answer to anything newly recognized.
    this.answerThreats(s);
    // A deferred answer whose moment has come.
    const ps = this.pendingShield;
    if (ps && this.clock >= (ps.kind === 'shield' ? ps.raiseAt : ps.startAt) - 1.5 * STEP) {
      this.pendingShield = null;
      const ok = ps.kind === 'shield' ? me.grounded && (me.canAct || me.shielding) && this.clock < ps.until : me.grounded && me.canAct;
      if (ok) this.setPlan(this.planFromAnswer(ps, s), s, `${ps.kind} moment`);
    }
    // Combos: a hit just landed.
    if (this.combo && !this.combo.decided && this.plan?.kind !== 'recover') this.followUp(s);
    // The plan in progress.
    this.runPlan(s, ex);
    // A new plan when there is none, or when the current one may be
    // reconsidered on this reassessment.
    const free = me.canAct || self.canFollowUp();
    if (free && (!this.plan || (think && !COMMITTED.has(this.plan.kind)))) {
      if (this.neutral || this.plan == null) {
        const plan = this.neutral ? this.choose(s) : this.passivePlan(s);
        if (plan) {
          this.setPlan(plan, s, null);
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
    if (this.plan && why) this.lastInterrupt = `${this.plan.kind} interrupted: ${why}`;
    this.plan = plan;
    this.telemetry.planned(plan, this, s);
  }

  // Whether the plan in progress is an aerial strike that still leaves a way home.
  safeAerialPlan(s) {
    const p = this.plan;
    return !!p && (p.kind === 'jumpStrike' || p.kind === 'strike') && (p.cand?.elim ?? 0) < 0.2 && this.clock - p.start < 0.8 && s.me.airJumps > 0;
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

  // Records the CPU's own hits as they land: a follow-up to find.
  trackOwnHits(s) {
    const events = s.world?.combat?.events;
    if (!events?.length) return;
    for (const e of events) {
      if (e.attacker !== s.self || e.type !== 'hit' || e.target !== s.foe) continue;
      const b = s.foe.body;
      this.combo = {
        at: this.clock, move: e.move, stun: Math.max(e.hitstun ?? 0, e.paralysis ?? 0), decided: false,
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
      if (cand.p < 0.4 || cand.utility < 0.4) continue;
      if (!best || cand.utility > best.utility) best = cand;
    }
    if (!best || this.rng() > p.comboReliability) return;
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

  // The plan the strategy calls for now (see the header).
  choose(s) {
    const me = s.me;
    const params = this.strategy.params;
    if (me.offstage) return this.recoveryPlan(s);
    const list = this.evaluator.candidates(s, this.candidateList, {});
    let best = null;
    let bestV = -Infinity;
    const noise = this.profile.noise;
    for (const c of list) {
      if (!this.sees.finisher && c.ko > 0.3) c.utility -= c.ko * 20;
      const v = c.utility + (this.rng() * 2 - 1) * noise * (0.6 + Math.abs(c.utility) * 0.35);
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    // The bar a commitment must clear: lower in an aggressive mode, lower
    // still the longer nothing has happened.
    const lull = Math.min(1, Math.max(0, this.clock - (this.lastOffence ?? 0) - 1.5) / 3);
    const bar = 1.0 - params.aggro - lull * 0.5;
    if (best && bestV > bar && best.p > 0.12) {
      this.lastOffence = this.clock;
      return this.planFromCandidate(best, null);
    }
    return this.movePlan(s);
  }

  // Movement with a purpose: navigation to another level, edge-guarding,
  // airborne control, neutral footwork (see plans.js).
  movePlan(s) {
    const me = s.me;
    const op = s.op;
    const p = this.profile;
    if (!me.grounded) return makePlan('air', { spacing: this.spacing(s), fastFall: this.rng() < 0.4 + p.stageSense * 0.4, until: this.clock + 0.5, reason: 'air control toward a safe landing' }, this);
    // The opponent on another level: go there.
    const foeY = op.grounded ? op.y : op.view.lastGroundY;
    if (Math.abs(foeY - me.y) > 40 && (op.grounded || Math.abs(op.vy) < 300) && !op.offstage) {
      return makePlan('navigate', { until: this.clock + 1.6, lastX: me.x, lastY: me.y, movedAt: this.clock, reason: 'opponent on another level' }, this);
    }
    // The opponent off the stage: hold the ledge it must come back to.
    if (op.offstage && p.stageSense > this.rng() * 0.6) {
      const side = op.x < s.model.centerX ? -1 : 1;
      const ledge = side < 0 ? s.model.left : s.model.right;
      const targetX = ledge - side * (me.halfW + 8 + (1 - p.stageSense) * 40);
      return makePlan('edgeguard', { targetX, dance: 0, danceAt: 0, until: this.clock + 0.8, reason: 'edge-guard: holding the ledge the opponent must return to' }, this);
    }
    // Cornered with the opponent in front: get past it, over its head.
    if (s.myEdge < 90 && s.dist < 160 && p.stageSense > 0.5 && this.rng() < p.stageSense * 0.5) {
      return makePlan('jump', { jump: 'high', dir: s.dir, hold: 0.5, reason: 'cornered: jumping past the opponent toward the centre' }, this);
    }
    const dist = this.spacing(s);
    const mode = this.strategy.mode;
    const offense = mode === 'rushdown' || mode === 'controlledOffense' || mode === 'finisherHunt';
    const dash = s.caps.movement.dash;
    return makePlan('neutral', {
      dist, dance: 0, danceAt: 0, danceRange: this.strategy.params.spacing === 'bait' ? 34 : 16,
      edgeRoom: me.halfW + 12 + p.stageSense * 30 + (this.strategy.danger > 0.3 ? 80 : 0),
      dashIn: offense && !!dash && this.rng() < 0.35 + p.energySense * 0.4, dashFrom: (dash?.distance ?? 200) + 80,
      dashEnergy: 35 + p.energySense * 35, until: this.clock + 0.7, targetX: s.op.x - s.dir * dist,
      reason: `${mode}: keeping ${Math.round(dist)} from the opponent`,
    }, this);
  }

  // The neutral distance the current mode wants.
  spacing(s) {
    const poke = s.foeReach.poke;
    const lunge = s.foeReach.lunge;
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
    if (me.offstage && this.plan?.kind !== 'recover') this.setPlan(this.recoveryPlan(s), s, 'offstage');
    if (!this.plan || (think && !COMMITTED.has(this.plan.kind))) {
      if (me.grounded) {
        const foe = s.foe;
        const spawnX = foe?.spawn?.x ?? s.model.centerX;
        const toward = Math.sign(s.model.centerX - spawnX) || 1;
        const reach = foe ? analyzeCapabilities(foe) : null;
        const keep = reach ? 160 + Math.max(...reach.moves.filter((m) => m.reach).map((m) => m.reach.x + m.reach.w), 60) * 0.5 : 200;
        const targetX = s.model.safeSpot(spawnX + toward * keep, me.halfW + 60);
        this.setPlan(makePlan('reposition', { targetX, dance: 0, danceAt: 0, danceRange: 36, until: this.clock + 0.8, reason: 'repositioning while the opponent respawns' }, this), s, null);
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

  // The safety net (Rule A): free to act, on the ground, in a live match,
  // and nothing held, pressed or moving for longer than a brief pause:
  // an incident, and a fresh plan at once.
  liveness(s, ex) {
    const self = s.self;
    if (self.inputLocked) return;
    const me = s.me;
    const free = me.canAct && me.grounded;
    const active = ex.wantDir || ex.held.shield || ex.pressed || ex.held.jump || ex.mouvement || Math.abs(me.vx) > 15;
    if (!free || active) {
      this.still = 0;
      return;
    }
    this.still += STEP;
    if (this.still > STILL_LIMIT) {
      this.telemetry.count('inactivity');
      this.lastInterrupt = 'inactivity';
      this.still = 0;
      this.plan = null;
      this.thinkTimer = 0;
    }
  }
}

export { StageModel };
