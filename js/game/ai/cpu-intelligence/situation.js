// CPU Intelligence, layer 3: the world model.
//
// Purpose: one picture of the fight for every other layer, rebuilt each
// step: the CPU's own fighter exactly (a player knows what its own fighter
// is doing), its opponent as perceived (perception.js: as it was `latency`
// ago, carried forward by its visible motion to now), both fighters'
// capabilities (the opponent's moves are public knowledge: its definition),
// the stage (stage-model.js: ledges, surfaces, the Void in force), the
// projectiles it can see, and the match (score, clock, overtime, who is at
// match point). Derived numbers every layer shares live here too: the
// distance and side, how long the opponent stays busy, whether either is
// off the stage, and the reach of each fighter's threats.
//
// Inputs: the CPU's fighter, its opponent, ctx (stage, gravity, battle),
// the brain's perception. Outputs: Situation.
// Important constraints: read-only; the opponent's state is never read
// live except whether it is in play at all (its fall into the Void is plain
// to see) and what the CPU's own hits did to it (its own hit events).

import { analyzeCapabilities } from './capabilities.js';
import { StageModel } from './stage-model.js';
import { Track, predictTrack, recoverySim } from './prediction.js';
import { riseOf } from './values.js';

const STEP = 1 / 60;

function threatReach(caps) {
  // How far the fighter's quick ground strikes reach from its origin, motion
  // included (a roll's path, a step-in), and its lunges.
  let poke = 0;
  let lunge = 0;
  for (const m of caps.moves) {
    if (m.air || !m.reach) continue;
    const front = m.reach.x + m.reach.w + (m.step ? m.step.speed * Math.max(0, m.startup - m.step.at) : 0);
    if (m.lead <= 0.2) poke = Math.max(poke, front);
    lunge = Math.max(lunge, front);
  }
  return { poke, lunge };
}

export class Situation {
  constructor() {
    this.me = {};
    this.foeTrack = new Track(200);
    this.shots = [];
    this.clones = [];
    this.match = {};
    this.recOut = {};
  }

  // Rebuilds the picture for this step. `brain` supplies the clock,
  // perception, profile and the RNG draws of this reassessment (`err`:
  // spacing and prediction error).
  build(brain, self, foe, ctx, deep = true) {
    const clock = brain.clock;
    this.t = clock;
    this.self = self;
    this.foe = foe;
    this.stage = ctx.stage;
    this.model = StageModel.of(ctx.stage);
    this.gravity = ctx.gravity ?? 2500;
    this.world = ctx.battle ?? null;
    this.caps = analyzeCapabilities(self);
    this.profile = brain.profile;
    const b = self.body;
    const c = self.combat;
    const me = this.me;
    me.x = b.x;
    me.y = b.y;
    me.vx = b.vx;
    me.vy = b.vy;
    me.grounded = b.grounded;
    me.ground = b.ground;
    me.halfW = b.halfW;
    me.height = b.height;
    me.gravityScale = b.gravityScale;
    me.maxFall = b.maxFall;
    me.facing = self.facing;
    me.canAct = self.canAct();
    me.canFollowUp = self.canFollowUp();
    me.stun = c.stun;
    me.hitstop = c.hitstop;
    me.paralysis = c.paralysis;
    // Seconds its opponent's charm has left on it (see `charm` in
    // js/game/combat/hit-effects.js): while it lasts, its hits on that
    // opponent heal it, so it strikes nothing (see CpuIntelligence.choose).
    me.charmed = c.charmedTo?.(foe) ? c.charm : 0;
    me.shielding = c.shielding;
    me.shieldStun = c.shieldStun;
    me.energy = c.energy;
    me.exhausted = c.energyExhausted;
    me.lp = c.launchPoint;
    me.airJumps = self.airJumps;
    me.airDashes = self.airDashes;
    me.freeFall = self.freeFall;
    me.launched = !!self.launch;
    me.attack = c.attack;
    me.technique = self.technique;
    me.dash = self.dash;
    me.summoning = !!self.pendingSummon;
    me.inMotion = self.inMotion;
    me.offstage = this.model.offstage(b.x, b.y, b.halfW, b.grounded);
    me.lastGroundY = self.lastGroundY;
    this.match = this.readMatch(self, foe);
    this.present = !!foe && !foe.lostToVoid;
    if (!this.present) return this;
    this.foeCaps = analyzeCapabilities(foe);
    const v = brain.perception.view;
    const op = (this.op = this.op ?? {});
    op.view = v;
    op.age = v.age ?? 0;
    op.halfW = v.halfW;
    op.height = v.height;
    op.facing = v.facing;
    op.lp = v.lp;
    op.energy = v.energy;
    op.exhausted = v.exhausted;
    op.shielding = v.shielding;
    op.airJumps = v.airJumps;
    op.airDashes = v.airDashes;
    op.freeFall = v.freeFall;
    op.launched = v.launched;
    op.attackDef = v.attackDef;
    op.attackTime = v.attackDef ? v.attackTime + op.age : 0;
    op.technique = v.techniqueDef;
    // The opponent's path from the perceived picture, carried to now and on.
    const age = op.age;
    const steps = Math.round(age / STEP);
    const st = {
      x: v.x, y: v.y, vx: v.vx, vy: v.vy, grounded: v.grounded, ground: v.ground, halfW: v.halfW, height: v.height,
      gravityScale: v.gravityScale, maxFall: v.maxFall, facing: v.facing,
      stun: v.stun, paralysis: v.paralysis, hitstop: v.hitstop,
      attack: v.attackDef ? { def: v.attackDef, time: v.attackTime, motion: v.attackMotion } : null,
      dash: v.dashDir ? { dir: v.dashDir, speed: v.dashSpeed, left: v.dashLeft, air: v.dashAir } : null,
      technique: v.techniqueDef ? v.techniqueEndIn : 0,
    };
    const target = { x: b.x, y: b.y - b.height / 2 };
    predictTrack(this.foeTrack, ctx.stage, this.gravity, st, {
      steps: Math.min(this.foeTrack.cap, steps + (deep ? 120 : 24)),
      horizon: age + this.profile.lookahead,
      velScale: brain.err.vel,
      target,
    });
    this.foeTrack.origin = Math.min(steps, this.foeTrack.len - 1);
    // Off the stage and free to act, it will try to get back: its likely
    // recovery, not a plain fall (what an edge-guard plays against).
    if (deep && brain.profile.stageSense > 0.3 && !(v.stun > 0) && !v.grounded &&
        this.model.offstage(v.x, v.y, v.halfW, false)) {
      const fc = this.foeCaps;
      const res = {
        airJumps: v.freeFall ? 0 : v.airJumps,
        airDash: fc.movement.airDash && v.airDashes > 0 ? fc.movement.airDash.distance : 0,
        dashOk: !v.exhausted, launched: v.launched, rise: v.freeFall ? null : riseOf(fc),
      };
      recoverySim(this.model, this.gravity, st, res, { jumpBelow: 30, dashFar: 150, maxSteps: Math.min(this.foeTrack.cap, steps + 120) }, this.recOut, this.foeTrack);
      if (this.foeTrack.len) this.foeTrack.origin = Math.min(steps, this.foeTrack.len - 1);
      else predictTrack(this.foeTrack, ctx.stage, this.gravity, st, { steps: steps + 24, horizon: age, velScale: 1, target });
    }
    // Its spacing misjudgement (the level's rangeError, drawn at each
    // reassessment): the whole path sits that far off, so its own strikes
    // are planned against where it believes the opponent is, and as often
    // fall short or are started too soon as they land.
    const ex = brain.err.x;
    if (ex) for (let i = 0; i < this.foeTrack.len; i++) this.foeTrack.x[i] += ex;
    const k = this.foeTrack.i(0);
    op.x = this.foeTrack.x[k];
    op.y = this.foeTrack.y[k];
    op.vx = this.foeTrack.vx[k];
    op.vy = this.foeTrack.vy[k];
    op.grounded = !!this.foeTrack.g[k];
    // Seconds until it can act again, as far as the CPU can tell from what
    // it shows (its attack's remaining frames, a stun, a paralysis, a Dash,
    // a technique, a summon's startup), counted from now.
    let busy = Math.max(v.stun, v.paralysis, v.shieldStun) + v.hitstop;
    if (v.attackDef) busy = Math.max(busy, v.attackDef.total - v.attackTime);
    if (v.dashDir) busy = Math.max(busy, v.dashLeft);
    if (v.techniqueDef) busy = Math.max(busy, v.techniqueEndIn);
    if (v.summon) busy = Math.max(busy, v.summonLeft);
    op.busy = Math.max(0, busy - age);
    op.stunned = v.stun - age > 0 || v.paralysis - age > 0;
    op.offstage = this.model.offstage(op.x, op.y, op.halfW, op.grounded);
    op.recovering = op.offstage && !op.stunned;
    // Where they stand relative to each other.
    this.dx = op.x - me.x;
    this.dy = op.y - me.y;
    this.dist = Math.abs(this.dx);
    this.dir = Math.sign(this.dx) || me.facing;
    this.myReach = threatReach(this.caps);
    this.foeReach = threatReach(this.foeCaps);
    this.shots = brain.perception.perceivedShots(clock, this.shots);
    this.clones = brain.perception.perceivedClones(clock, this.clones);
    // The ledge behind each of them (the side away from the other).
    this.myEdge = this.model.edgeRoom(me.x, -this.dir);
    this.foeEdge = this.model.edgeRoom(op.x, this.dir);
    return this;
  }

  readMatch(self, foe) {
    const w = this.world;
    const score = w?.score;
    const mine = score?.[self.slot] ?? 0;
    const theirs = foe ? score?.[foe.slot] ?? 0 : 0;
    const toWin = w?.pointsToWin ?? 3;
    const timeLeft = Number.isFinite(w?.timeLeft) ? w.timeLeft : Infinity;
    const overtime = !!w?.overtime;
    return {
      mine, theirs, lead: mine - theirs, toWin, timeLeft, overtime,
      late: timeLeft < 30 || overtime,
      // What a fall is worth: more when it decides the match.
      koFor: mine >= toWin - 1 ? 1.5 : 1,
      koAgainst: theirs >= toWin - 1 ? 1.6 : 1,
    };
  }
}
