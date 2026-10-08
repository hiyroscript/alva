// CPU Intelligence: perception, what the CPU can see and when.
//
// Purpose: one honest, human-paced picture of the opponent. Every fixed
// step the opponent's visible state (its body, its attack and phase, its
// technique, Shield, stun, Energy, Launch Point, airtime resources) is
// recorded; the CPU then sees it as it was `lag` seconds ago (its level's
// reaction window, drifting over time), extrapolated forward by its
// `compensation` share of that lag from the motion and clocks it saw. So
// an attack's startup is only seen once the lag has passed, a lower level
// reacts later and judges motion worse, and nothing is ever answered on
// the step it appears. A lapse keeps something new hidden for a second
// reaction. Projectiles and clones are seen the same way: only once they
// have been in play for the lag, and where they were then (less what the
// level extrapolates). The CPU's own state is its own to know, but its own
// hits are confirmed after a short delay too.
//
// Inputs: the CPU's fighter, its opponent and the step context (ctx.stage,
// ctx.battle: projectiles, clones, combat events), the profile and the
// injected rng.
// Outputs: Perception (update, foe, projectiles, clones, events).
// Important constraints: read-only. Never the player's raw input: an
// attack is seen once the fighter starts it, never when a key goes down.

import { range } from '../../core/utils.js';
import { projectFall, STEP, GRAVITY } from './forecast.js';

// Steps of opponent history kept: comfortably more than any reaction.
const HISTORY = 72;

function blankSnapshot() {
  return {
    clock: -Infinity, x: 0, y: 0, vx: 0, vy: 0, grounded: true, facing: 1, halfW: 16, height: 100,
    canAct: true, atkRef: null, atkDef: null, atkTime: 0, atkHasHit: false, atkConfirmed: false, atkBlocked: false,
    techRef: null, techDef: null, techPhase: null, techReleaseIn: 0, techEndIn: 0, techFacing: 1,
    summoning: false, summonLeft: 0, shielding: false, shieldStun: 0, stun: 0, hitstop: 0, paralysis: 0,
    energy: 100, exhausted: false, lp: 0, dashing: false, dashLeft: 0, dashAir: false,
    airJumps: 2, airDashes: 1, freeFall: false, launched: false, tumbling: false, lastGroundY: 0, lost: false,
  };
}

function record(s, f, clock) {
  const b = f.body;
  const c = f.combat;
  const atk = c.attack;
  const t = f.technique;
  s.clock = clock;
  s.x = b.x; s.y = b.y; s.vx = b.vx; s.vy = b.vy; s.grounded = b.grounded; s.facing = f.facing;
  s.halfW = b.halfW; s.height = b.height;
  s.canAct = f.canAct();
  s.atkRef = atk ?? null;
  s.atkDef = atk?.def ?? null;
  s.atkTime = atk?.time ?? 0;
  s.atkHasHit = !!atk?.hasHit;
  s.atkConfirmed = !!atk?.confirmed;
  s.atkBlocked = !!atk?.blocked;
  s.techRef = t ?? null;
  s.techDef = t?.def ?? null;
  s.techPhase = t?.phase ?? null;
  s.techReleaseIn = t ? t.releaseIn : 0;
  s.techEndIn = t ? t.endIn : 0;
  s.techFacing = t?.facing ?? f.facing;
  s.summoning = !!f.pendingSummon;
  s.summonLeft = f.pendingSummon ? f.pendingSummon.duration - f.pendingSummon.time : 0;
  s.shielding = c.shielding;
  s.shieldStun = c.shieldStun;
  s.stun = c.stun;
  s.hitstop = c.hitstop;
  s.paralysis = c.paralysis;
  s.energy = c.energy;
  s.exhausted = c.energyExhausted;
  s.lp = c.launchPoint;
  s.dashing = !!f.dash;
  s.dashLeft = f.dash ? f.dash.duration - f.dash.time : 0;
  s.dashAir = !!f.dash?.air;
  s.airJumps = f.airJumps;
  s.airDashes = f.airDashes;
  s.freeFall = f.freeFall;
  s.launched = !!f.launch;
  s.tumbling = f.tumbling;
  s.lastGroundY = f.lastGroundY;
  s.lost = f.lostToVoid;
}

export class Perception {
  constructor(profile, rng) {
    this.profile = profile;
    this.rng = rng;
    this.ring = Array.from({ length: HISTORY }, blankSnapshot);
    this.view = blankSnapshot();
    this.reset();
  }

  // A new match (or a new life of its own fighter: everything it saw of
  // the old one goes).
  reset() {
    this.count = 0;
    this.foeRef = null;
    const [lo, hi] = this.profile.reaction;
    this.lag = (lo + hi) / 2;
    this.nextLagAt = 0;
    // Things kept hidden by a lapse, until a clock time.
    this.hidden = new WeakMap();
    this.rolled = new WeakSet();
    // When each projectile or clone was first seen in its current flight
    // (a turned-back one is a new sight), and when its owner or heading
    // last changed.
    this.sightings = new WeakMap();
    this.events = [];
    this.seenEvents = new WeakSet();
  }

  // The reaction this level takes right now, drifting within its window.
  sampleLag() {
    const [lo, hi] = this.profile.reaction;
    return range(this.rng, lo, hi);
  }

  // One fixed step: record the opponent, take in last step's combat events.
  update(self, foe, ctx, clock) {
    if (clock >= this.nextLagAt) {
      this.lag = this.sampleLag();
      this.nextLagAt = clock + range(this.rng, 0.35, 0.8);
    }
    if (foe !== this.foeRef) {
      this.foeRef = foe;
      this.count = 0;
    }
    if (foe) {
      record(this.ring[this.count % HISTORY], foe, clock);
      this.count++;
    }
    // Last step's hits and blocks (CombatSystem.update clears them each
    // step): what this fighter dealt and took, perceived at once for its
    // own and seen like anything else for the opponent's.
    // Each event once, however long a stand-in world keeps it.
    const list = ctx.battle?.combat?.events;
    this.events.length = 0;
    for (const e of list ?? []) {
      if (this.seenEvents.has(e)) continue;
      this.seenEvents.add(e);
      if (e.attacker === self || e.target === self) this.events.push(e);
    }
  }

  // The opponent as this level sees it now: the snapshot `lag` ago,
  // extrapolated by `compensation` of the lag (motion and its own clocks).
  // Null with no history. The object is reused: copy what you keep.
  foe(stage, clock, g = GRAVITY) {
    if (!this.count) return null;
    const lagSteps = Math.round(this.lag / STEP);
    const back = Math.min(this.count - 1, lagSteps);
    const src = this.ring[(this.count - 1 - back) % HISTORY];
    const v = this.view;
    Object.assign(v, src);
    // A lapse: something new it overlooked shows a second reaction late.
    if (v.atkRef) v.atkRef = this.noticed(v.atkRef, clock) ? v.atkRef : null;
    if (!v.atkRef) {
      v.atkDef = null;
      v.atkTime = 0;
      v.atkHasHit = false;
      v.atkConfirmed = false;
    }
    if (v.techRef && !this.noticed(v.techRef, clock)) {
      v.techRef = null;
      v.techDef = null;
      v.techPhase = null;
    }
    const seen = back * STEP;
    const ahead = seen * this.profile.compensation;
    if (ahead > 0) {
      const p = projectFall(stage, v, ahead, g, v.halfW);
      v.x = p.x;
      if (!v.grounded) {
        v.y = p.y;
        v.vy = p.landed ? 0 : v.vy + g * ahead;
        if (p.landed) v.grounded = true;
      }
      if (v.atkDef) v.atkTime += ahead;
      if (v.techDef) {
        v.techReleaseIn = Math.max(0, v.techReleaseIn - ahead);
        v.techEndIn = Math.max(0, v.techEndIn - ahead);
      }
      v.stun = Math.max(0, v.stun - ahead);
      v.shieldStun = Math.max(0, v.shieldStun - ahead);
      v.paralysis = Math.max(0, v.paralysis - ahead);
      v.dashLeft = Math.max(0, v.dashLeft - ahead);
      v.summonLeft = Math.max(0, v.summonLeft - ahead);
    }
    v.age = seen;
    return v;
  }

  // Whether `ref` (an attack record or a technique) has been taken in by
  // `clock`: always, unless a lapse rolled on first sight hides it for a
  // second reaction.
  noticed(ref, clock) {
    if (!this.rolled.has(ref)) {
      this.rolled.add(ref);
      if (this.rng() < this.profile.lapse) this.hidden.set(ref, clock + this.sampleLag());
    }
    const until = this.hidden.get(ref);
    return until === undefined || clock >= until;
  }

  // When `obj` (a projectile or a clone) was first seen as it is now: a
  // new owner or heading is a new sight.
  sighting(obj, clock, heading) {
    let s = this.sightings.get(obj);
    if (!s || s.owner !== obj.owner || s.heading !== heading) {
      s = { at: clock, owner: obj.owner, heading, extra: this.rng() < this.profile.lapse ? this.sampleLag() : 0 };
      this.sightings.set(obj, s);
    }
    return s;
  }

  // The live projectiles this level has taken in, each as it sees it:
  // { ref, x, y, vx, def, owner, age, hits, hostile }. Its own count as
  // seen at once (it threw them).
  projectiles(self, world, clock) {
    const out = [];
    for (const p of world?.projectiles ?? []) {
      if (!p.alive) continue;
      const s = this.sighting(p, clock, p.direction);
      const own = p.owner === self;
      const since = clock - s.at;
      if (!own && since < this.lag + s.extra) continue;
      const lagged = own ? 0 : this.lag * (1 - this.profile.compensation);
      out.push({
        ref: p, x: p.x - p.vx * lagged, y: p.y, vx: p.vx, def: p.def, owner: p.owner, age: p.age - lagged,
        hits: p.hits, hostile: !own, direction: p.direction,
      });
    }
    return out;
  }

  // The opponent's clones this level has taken in.
  clones(self, world, clock) {
    const out = [];
    for (const c of world?.clones ?? []) {
      if (!c.alive || c.owner === self) continue;
      const s = this.sighting(c, clock, c.facing);
      if (clock - s.at < this.lag + s.extra) continue;
      out.push(c);
    }
    return out;
  }
}
