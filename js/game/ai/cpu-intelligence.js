// CPU Intelligence: every competitive CPU in Alva (Quick Battle's CPU,
// both of Watch Mode's), one intelligence at four levels of skill.
// Practice Ground keeps its controller-less training dummy (see
// js/game/practice.js).
//
// A controller like PlayerController: Fighter.update asks it for one
// FighterInput snapshot per fixed step, and that is all it ever produces.
// Every attack, projectile, summon, technique, Shield, Deflect, jump, fast
// fall, Dash and air dash happens because it pressed or held the same
// inputs a player would; the fighter and the combat engine decide what
// they do. It never moves, hurts, spawns, cancels or refreshes anything
// itself, never writes to a fighter, and never reads the player's input.
//
// Each step runs one loop, the same on every level:
//
//   Observe     perception.js: the opponent as it was a reaction ago,
//               extrapolated as far as the level can; projectiles and
//               clones once seen; its own hits and blocks.
//   Understand  situation.js: both fighters, spacing, levels, Launch
//               Points, the stage and the Void in force, resources,
//               openings, the score and the clock; threats.js: what can
//               hit it and when.
//   Choose goal strategy.js: a goal and a style (aggression or patience)
//               from both fighters' danger, the score, the clock and the
//               opponent's habits, kept with hysteresis.
//   Plan        tactics.js and threats.js: every plan that fits (strikes,
//               jump-ins, approaches, projectiles, techniques, combos,
//               spacing, baits, centre control, platforms, edge-guards,
//               Shield, evasions, Deflects, jump-Deflects), each weighed by
//               its expected outcome (valuation.js); the best taken after
//               the level's noise.
//   Execute     plans.js through execution.js: the plan carried out over
//               the steps it needs, as legal input.
//   Evaluate    every plan watches its own result; one that failed, ended
//               or was overtaken by an event is replaced on the same step,
//               and the watchdog (safety.js) never lets an able fighter
//               stand idle.
//   Adapt       adaptation.js: the opponent's habits, gradually, as the
//               evidence comes.
//
// Off the stage, recovery (navigation.js) comes first on every step. A
// plan is reassessed on the level's cadence, at once on anything urgent (a
// threat seen, a hit confirmed, a block, a plan ended).
//
// Difficulty (js/data/difficulty.js) changes how well it does each of
// these things, never what its fighter can do.

import { range } from '../../core/utils.js';
import { DEFAULT_DIFFICULTY, getDifficultyProfile, resolveDifficulty } from '../../data/difficulty.js';
import { Perception } from './perception.js';
import { buildSituation } from './situation.js';
import { Strategy } from './strategy.js';
import { planCandidates } from './tactics.js';
import { assessThreats, defenseOptions, deflectCatches, DEFENSE_HORIZON } from './threats.js';
import { OpponentModel } from './adaptation.js';
import { Executor } from './execution.js';
import { runPlan, INTENTIONAL } from './plans.js';
import { recoverStep } from './navigation.js';
import { guard, Watchdog } from './safety.js';

// Whether plans `a` and `b` are the same intention (so the one under way
// is kept, with its progress).
function samePlan(a, b) {
  if (a.kind !== b.kind || a.ended) return false;
  if (a.move !== b.move) return false;
  if (a.kind === 'jumpStrike') return a.jump === b.jump && a.at === undefined;
  if (a.kind === 'evade') return a.how === b.how && a.dir === b.dir;
  if (a.kind === 'move' || a.kind === 'reposition' || a.kind === 'edgeguard') return Math.abs(a.x - b.x) < 30;
  if (a.kind === 'retreat') return a.dir === b.dir;
  if (a.kind === 'shield' || a.kind === 'jumpDeflect' || a.kind === 'brace') return a.threat?.ref === b.threat?.ref;
  return true;
}

// What a fresh match's statistics hold (see `stats`): read by the
// benchmark and the tests, never by the game.
function freshStats() {
  return {
    steps: 0, controllable: 0, idle: 0, longestIdle: 0, currentIdle: 0, moves: {}, hits: 0, hitsTaken: 0, blocks: 0,
    perfectBlocks: 0, deflectAttempts: 0, deflects: 0, recoveries: 0, recovered: 0, failedPlans: 0, plans: {},
    combos: 0, punishes: 0, goals: {},
  };
}

export class CPUIntelligenceController {
  // `reactionsOnly` (tests only, never a mode): the CPU answers what it
  // perceives (threats) and plans nothing of its own, so a scenario can
  // isolate its reactions.
  constructor({ difficulty = DEFAULT_DIFFICULTY, rng = Math.random, reactionsOnly = false } = {}) {
    this.kind = 'cpu';
    this.difficulty = resolveDifficulty(difficulty);
    this.profile = getDifficultyProfile(this.difficulty);
    this.rng = rng;
    this.reactionsOnly = reactionsOnly;
    this.perception = new Perception(this.profile, rng);
    this.model = new OpponentModel(this.profile);
    this.strategy = new Strategy(this.profile);
    this.executor = new Executor();
    this.watchdog = new Watchdog(this.profile);
    this.body = null;
    this.reset();
  }

  // The snapshot it produced on its last step.
  get out() {
    return this.executor.out;
  }

  // Attack orientation is sampled by Fighter on each simulation step, not
  // on the CPU's decision clock: the live direction of its target. It is
  // not a movement input or a tap.
  attackFacing(self) {
    const foe = self.opponent;
    if (self.inputLocked || self.lostToVoid || !foe || foe.lostToVoid ||
        !Number.isFinite(foe.body?.x) || !Number.isFinite(self.body?.x)) return null;
    return Math.sign(foe.body.x - self.body.x) || self.attackVisualFacing || self.facing;
  }

  // A new match (a restart or a rematch): everything forgotten, its
  // opponent's habits included.
  reset() {
    this.clock = 0;
    this.model.reset();
    this.strategy.reset();
    this.stats = freshStats();
    this.lastUsed = new Map();
    this.softReset();
  }

  // A new life (its own respawn): nothing held or planned survives, but
  // what it learned of its opponent does.
  softReset() {
    this.plan = null;
    this.executor.reset();
    this.perception.reset();
    this.watchdog.reset();
    this.thinkTimer = 0;
    this.spacingError = 0;
    this.answered = new WeakSet();
    this.counted = new WeakSet();
    this.rec = {};
    this.urgent = false;
    this.forceActive = false;
    this.confirmAt = null;
    this.threats = [];
    this.locked = false;
  }

  // Tests: hand it one plan to carry out, with no planning of its own until
  // it ends (see plans.js for the shapes).
  adoptPlan(plan) {
    this.plan = plan;
    this.frozen = true;
  }

  noteUse(m, S) {
    this.lastUsed.set(m.key, S.clock);
    this.stats.moves[m.key] = (this.stats.moves[m.key] ?? 0) + 1;
    if (m.kind === 'deflect') this.stats.deflectAttempts++;
  }

  getInput(self, dt, ctx) {
    // A fresh body means Fighter.reset ran: a restart, a rematch or a
    // respawn. Nothing held or planned survives it.
    if (self.body !== this.body) {
      if (this.body) this.softReset();
      this.body = self.body;
    }
    this.clock += dt;
    const ex = this.executor;
    ex.begin();
    const foe = self.opponent;
    const inPlay = foe && !foe.lostToVoid ? foe : null;
    this.perception.update(self, inPlay, ctx, this.clock);
    if (self.inputLocked) {
      // Intro, time-up or K.O.: the fighter ignores input anyway. Start the
      // fight with a clear head and nothing held.
      if (!this.locked) ex.reset();
      this.locked = true;
      this.plan = null;
      return ex.emit(self);
    }
    this.locked = false;
    const fv = inPlay ? this.perception.foe(ctx.stage, this.clock, ctx.gravity ?? 2500) : null;
    const S = buildSituation(this, self, foe ?? null, ctx, fv);
    S.dt = dt;
    S.projectiles = this.perception.projectiles(self, ctx.battle, this.clock);
    S.clones = this.perception.clones(self, ctx.battle, this.clock);
    S.model = this.model;
    S.aggression = this.strategy.aggression;
    S.goal = this.strategy.goal;
    S.myDanger = this.danger?.mine ?? 0;
    S.foeDanger = this.danger?.foe ?? 0;
    this.model.update(S, this.perception.events);
    this.takeEvents(S, ctx);
    this.stats.steps++;
    if (this.frozen) {
      this.runFrozen(S);
    } else if (S.offStage && !this.plan?.offstageOK) {
      this.recover(S);
    } else {
      if (this.plan?.kind === 'recover') {
        this.plan = null;
        this.stats.recovered++;
      }
      this.decideAndAct(S);
    }
    guard(S, ex, this.plan);
    const out = ex.emit(self);
    this.account(S, out);
    return out;
  }

  // ---- Observe: its own hits and blocks ------------------------------------------

  takeEvents(S, ctx) {
    for (const e of this.perception.events) {
      if (e.attacker === S.self) {
        this.strategy.exchanged(S.clock);
        if (e.type === 'hit') {
          this.stats.hits++;
          if (e.launchPointBefore > 0 && S.clock - (this.lastHitAt ?? -1) < 0.7) this.stats.combos++;
          this.lastHitAt = S.clock;
          // Seen once it registers: a short beat for a casual player.
          this.confirmAt = S.clock + this.perception.lag * 0.35;
        }
      } else if (e.target === S.self) {
        this.strategy.exchanged(S.clock);
        if (e.type === 'hit') {
          this.stats.hitsTaken++;
          this.plan = null;
        } else {
          this.stats.blocks++;
          if (e.perfect) this.stats.perfectBlocks++;
          this.urgent = true;
        }
      }
    }
    for (const d of ctx.battle?.combat?.deflections ?? []) {
      if (d.fighter === S.self && !this.counted.has(d)) {
        this.counted.add(d);
        this.stats.deflects++;
      }
    }
    if (this.confirmAt !== null && S.clock >= this.confirmAt) {
      this.confirmAt = null;
      this.urgent = true;
    }
  }

  // ---- Off the stage ---------------------------------------------------------------

  recover(S) {
    if (this.plan?.kind !== 'recover') {
      this.plan = { kind: 'recover' };
      this.rec = {};
      this.stats.recoveries++;
    }
    // A shot on course on the way back: the Deflect, if it would catch it
    // and the Energy can spare it (an air dash home matters more).
    const threats = assessThreats(S);
    const d = S.k.deflect;
    const shot = threats.find((t) => t.shot && t.contactIn <= DEFENSE_HORIZON);
    if (shot && d && S.canFollowUp && S.moveReady(d) && S.energy > 40 && this.executor.canPress('shield') &&
        this.rng() < this.profile.deflect && deflectCatches(S, shot, 0)) {
      this.executor.press('shield');
      this.executor.move(Math.sign(S.center - S.x) || 1);
      return;
    }
    recoverStep(S, this.executor, this.rec);
  }

  // ---- Understand, choose, plan ----------------------------------------------------

  decideAndAct(S) {
    const threats = assessThreats(S);
    this.threats = threats;
    let urgent = this.urgent;
    this.urgent = false;
    for (const t of threats) {
      if (t.ref && t.contactIn <= DEFENSE_HORIZON && !this.answered.has(t.ref)) {
        this.answered.add(t.ref);
        urgent = true;
      }
    }
    // Its own attack just became cancellable (it hit): the follow-up.
    if (S.cancellable && !this.wasCancellable) urgent = true;
    this.wasCancellable = S.cancellable;
    this.thinkTimer -= S.dt;
    if (!this.plan || this.thinkTimer <= 0 || urgent) this.think(S, threats, urgent);
    this.execute(S);
  }

  think(S, threats, urgent = false) {
    const p = this.profile;
    const rng = this.rng;
    this.thinkTimer = range(rng, p.think[0], p.think[1]);
    this.spacingError = (rng() * 2 - 1) * p.rangeError;
    S.rangeError = this.spacingError;
    this.strategy.update(S, this.model);
    this.danger = { mine: S.myDanger, foe: S.foeDanger };
    this.stats.goals[S.goal] = (this.stats.goals[S.goal] ?? 0) + 1;
    const cands = [];
    const threat = threats.find((t) => t.contactIn <= DEFENSE_HORIZON && t.endIn > 0);
    if (threat && (S.canAct || S.shielding || S.cancellable)) {
      const opts = defenseOptions(S, threat);
      // A level that defends worse sometimes misreads what is coming.
      if (rng() > 0.45 + 0.55 * p.defense) {
        const o = opts[Math.floor(rng() * opts.length)];
        cands.push({ ...o, value: o.value + 50 });
      } else {
        for (const o of opts) cands.push({ ...o, value: o.value + 0.5 });
      }
    }
    if (!this.reactionsOnly) {
      const offence = planCandidates(S, this);
      for (const o of offence) {
        // Starting something that the incoming threat lands through costs
        // that threat.
        if (threat && o.plan.kind !== 'strike' && o.plan.kind !== 'jumpStrike') o.value -= threat.severity * 0.9;
        else if (threat && o.plan.kind === 'strike' && threat.contactIn < (o.plan.move?.startup ?? 0) + 0.02) o.value -= threat.severity * 0.9;
        cands.push(o);
      }
    }
    // The plan in progress, if it still makes sense, has the benefit of
    // the doubt: no changing course for a whisker.
    const cur = this.plan;
    if (cur && !cur.ended && cur.kind !== 'recover' && cur.value !== undefined && !urgent) {
      cands.push({ value: cur.value + 0.9, plan: cur });
    }
    if (this.forceActive) {
      this.forceActive = false;
      for (const c of cands) if (c.plan.kind === 'space' || c.plan.kind === 'edgeguard') c.value -= 5;
    }
    if (!cands.length) {
      if (this.reactionsOnly) {
        this.plan = null;
        return;
      }
      cands.push({ value: 0, plan: { kind: 'advance', until: S.clock + 0.4, value: 0 } });
    }
    let best = this.pick(cands);
    // The same plan again (same kind, same move): keep the one under way.
    if (cur && best && best !== cur && samePlan(cur, best)) {
      cur.value = best.value;
      best = cur;
    }
    if (best !== cur) {
      this.plan = best;
      if (best.kind) this.stats.plans[best.kind] = (this.stats.plans[best.kind] ?? 0) + 1;
    }
  }

  // The best option after the level's noise; a careless level now and then
  // takes the second best.
  pick(cands) {
    const noise = this.profile.noise;
    let best = null;
    let second = null;
    let bestV = -Infinity;
    let secondV = -Infinity;
    for (const c of cands) {
      const v = c.value + noise * (Math.abs(c.value) * 0.4 + 1) * (this.rng() * 2 - 1);
      if (v > bestV) {
        second = best;
        secondV = bestV;
        best = c;
        bestV = v;
      } else if (v > secondV) {
        second = c;
        secondV = v;
      }
    }
    if (second && this.rng() < this.profile.misjudge) return second.plan;
    return best?.plan ?? null;
  }

  // ---- Execute and evaluate ----------------------------------------------------------

  execute(S) {
    for (let i = 0; i < 3 && this.plan; i++) {
      const r = runPlan(S, this.executor, this.plan, this);
      if (r === 'run') return;
      if (r?.next) {
        this.plan = r.next;
        continue;
      }
      this.plan.ended = true;
      if (r === 'fail') this.stats.failedPlans++;
      this.plan = null;
      // Ended or failed: the next one, on this very step.
      this.think(S, this.threats, true);
    }
  }

  runFrozen(S) {
    if (!this.plan) {
      this.frozen = false;
      return;
    }
    const r = runPlan(S, this.executor, this.plan, this);
    if (r?.next) this.plan = r.next;
    else if (r !== 'run') {
      this.plan = null;
      this.frozen = false;
    }
  }

  // Bookkeeping for the watchdog and the statistics.
  account(S, out) {
    const st = this.stats;
    if (S.canAct) st.controllable++;
    const intentional = INTENTIONAL.has(this.plan?.kind) || this.frozen || this.reactionsOnly;
    const still = S.canAct && !out.runLeft && !out.runRight && !out.jump && !out.shield && Math.abs(S.vx) < 30 && S.grounded;
    if (still && !intentional) {
      st.idle++;
      st.currentIdle++;
      if (st.currentIdle > st.longestIdle) st.longestIdle = st.currentIdle;
    } else {
      st.currentIdle = 0;
    }
    if (!this.frozen && !this.reactionsOnly && this.watchdog.check(S, out, this.plan, intentional)) {
      this.plan = null;
      this.forceActive = true;
      this.urgent = true;
    }
  }
}
