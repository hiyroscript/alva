// Combat architecture.
//
// Attacks are pure data on the character definition; Fighter turns each entry
// into a frozen definition with createAttackDefinition(). #0001's Basic
// Attack 1 (ground `ba1`, mid-air `midairBa1`, both on action1), Basic
// Attack 2 (`ba2` / `midairBa2` on action2) and Throw (`throw` on primary)
// are the real attacks so far; see js/data/characters.js. The general shape:
//
//   attacks: {
//     jab: {
//       animation: 'jab', startup: 0.07, active: 0.05, recovery: 0.16,
//       damage: 6, hitbox: { x: 18, y: -62, w: 34, h: 18 },
//       baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.22, blockstun: 0.14, cooldown: 0.1,
//     },
//     launcher: { ..., baseLaunch: 2, directionalLaunch: 'vertical' },
//     airSpike: { animation: 'airSpike', ..., baseLaunch: 2, directionalLaunch: 'reverseVertical' },
//   },
//   // One attack per action, or { ground, air } chosen by grounded state.
//   actions: { primary: 'jab', action1: { ground: 'jab', air: 'airSpike' }, ... }
//
// Every hit (an attack's, a projectile's, a charged technique's) declares
// its Base Launch (`baseLaunch`: 0, 1, 2 or 3, a multiplier, never a
// velocity) and its Directional Launch (`directionalLaunch`: null,
// 'horizontal', 'vertical' or 'reverseVertical'), independently of each
// other and of its damage (see js/data/launch.js). createAttackDefinition
// validates them once; a hit that declares neither never launches.
//
// An attack needs real frames for its `animation`; without them it is refused
// rather than faked. Its hitbox only exists during the active phase.
// Hitboxes are defined facing right relative to the fighter's origin
// (bottom-centre) and mirrored automatically.
//
// A projectile attack has `hitbox: null` (no melee strike) and a `projectile`
// event instead: once its time crosses `spawnAt` it releases that projectile,
// exactly once, from `offset` (facing right from the origin, mirrored).
// See js/game/projectile.js.
//
//   throw: {
//     animation: 'throw', startup: 1 / 12, active: 1 / 12, recovery: 1 / 12,
//     hitbox: null, projectile: { id: 'shuriken', spawnAt: 1 / 12, offset: { x: 16, y: -38 } },
//     cooldown: 0.25, groundOnly: true,
//   },
//
// Defense is the shared player input; each character's `defense` entry says
// how it defends (see createDefenseDefinition). The one type so far is the
// Shield, a held guard all the way round the fighter:
//
//   defense: {
//     type: 'shield',
//     groundAnimation: 'shield', airAnimation: 'midairShield',
//     // Optional one-frame poses around the grounded hold:
//     groundStartAnimation: 'shieldStart', groundReleaseAnimation: 'shieldRelease',
//   }
//
// While it is up (CombatState.shielding, see Fighter.update) any hit that
// reaches the fighter's own hurtboxes, from either side, is blocked: it adds
// no Launch Point and launches nothing, and the fighter pays
// energy.shieldHitCost for that one hit instead. The Shield holds through
// the hit's hitstop and blockstun (CombatState.shieldStun), never a hurt
// pose. Holding it costs nothing; it cannot rise or stay up while the
// fighter is exhausted (CombatState.canShield).
//
// A hit's `damage` is added to the target's Launch Point
// (CombatState.launchPoint) first. Its launch strength is then exactly Base
// Launch x that new Launch Point, sent along its Directional Launch (see
// CombatSystem.applyHit). No Launch Point defeats a fighter: only the Void
// takes one out of play.
//
// A summon (see js/game/clone.js) is a detached attacker: a temporary clone
// that performs one of its owner's attacks from its own position and facing.
// Its hits resolve through the same applyHit and credit the owner, but, like
// a projectile's, they never freeze the owner.
//
// A charged technique (see js/game/charged-technique.js) is performed by the
// fighter itself but is not an attack either: its sphere's contact, the
// ticks while it holds the target and its delayed explosion are its hits,
// resolved here through applyHit with their own data. They freeze only the
// target. A confirmed contact binds the target (CombatState.bind): a hold on
// it, separate from hitstun, that only the technique which placed it
// releases.
//
// Charged actions (a summon or a technique) are not paid for: each has its
// own cooldown (CombatState.chargedCooldowns, see CooldownTimers), started
// when it is used and apart from the short recovery cooldowns of ordinary
// attacks (CombatState.cooldowns).
//
// Energy (CombatState.energy, see resolveEnergy) is the one resource a
// fighter spends, and only on Dash and Shield: a Dash pays dashCost as it
// starts, and every hit the Shield blocks costs shieldHitCost. Either works
// with less left than it costs, but then takes all of it. It refills by
// itself, faster while the fighter is in its Charge stance. Emptied, it
// exhausts the fighter: no Dash or Shield until it is full again. Nothing
// else (movement, jumps, attacks, charged actions) ever touches it.

import { resolveHitLaunch, resolveLaunchStrength, resolveDirectionalLaunch } from '../data/launch.js';

const ATTACK_DEFAULTS = {
  animation: null,
  startup: 0.08,
  active: 0.06,
  recovery: 0.18,
  damage: 0,
  hitbox: { x: 0, y: -60, w: 30, h: 20 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
  cooldown: 0,
  groundOnly: false,
  lockMovement: true,
  baseLaunch: 0,
  directionalLaunch: null,
  projectile: null, // { id, spawnAt, offset } for a projectile attack
};

// Attack time is a sum of fixed steps, so compare phase boundaries with a
// little slack: a phase that is a whole number of steps long (e.g. 1 / 12 s at
// 60 Hz) then lasts exactly that many steps instead of drifting by one.
const PHASE_EPSILON = 1e-6;

// 'startup' | 'active' | 'recovery' for an attack `time` seconds in. Shared
// by fighters (CombatState.phase) and clones.
export function attackPhase(def, time) {
  if (time < def.startup - PHASE_EPSILON) return 'startup';
  if (time < def.startup + def.active - PHASE_EPSILON) return 'active';
  return 'recovery';
}

// Frozen attack definition from a character's attack entry (plus its `id`).
// Its `baseLaunch` and `directionalLaunch` are validated here, once, as
// declared: neither is inferred from the damage, the hitbox or the other.
export function createAttackDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Attack definitions need an id');
  const def = { ...ATTACK_DEFAULTS, ...spec, ...resolveHitLaunch(spec, `Attack "${spec.id}"`) };
  def.total = def.startup + def.active + def.recovery;
  return Object.freeze(def);
}

const SHIELD_DEFAULTS = Object.freeze({
  groundAnimation: null,
  airAnimation: null,
  groundStartAnimation: null,
  groundReleaseAnimation: null,
});

// Frozen form of a character's `defense` entry, or null for a fighter that has
// no Defense (the input then does nothing). Typed, so a future fighter can
// defend in another way; an unknown type is refused.
export function createDefenseDefinition(spec) {
  if (!spec) return null;
  if (spec.type === 'shield') return Object.freeze({ ...SHIELD_DEFAULTS, ...spec });
  throw new Error(`[Alva] Unknown defense type "${spec.type}"`);
}

// A character's `energy` entry, every field optional:
//
//   energy: {
//     max: 100,          // full, and where every fighter starts
//     regen: 12,         // per second, whatever the fighter is doing
//     chargeRegen: 30,   // per second instead, while in the Charge stance
//     dashCost: 15,      // spent once as a Dash starts
//     shieldHitCost: 25, // spent once for every hit the Shield blocks
//   }
//
// A cost larger than what is left is still paid: it takes the rest, which
// empties the bar and exhausts the fighter (see CombatState.spendEnergy).
const ENERGY_DEFAULTS = Object.freeze({
  max: 100, regen: 12, chargeRegen: 30, dashCost: 15, shieldHitCost: 25,
});

// Frozen Energy settings: the character's entry over the defaults.
export function resolveEnergy(spec) {
  return Object.freeze({ ...ENERGY_DEFAULTS, ...spec });
}

// Named cooldowns that each remember their full length, so progress can be
// read back (1 - remaining / duration) without knowing where they came from.
// Used for charged actions' cooldowns (CombatState.chargedCooldowns).
export class CooldownTimers {
  constructor() {
    this.entries = new Map(); // id -> { remaining, duration } in seconds
  }

  // Starts (or restarts) `id` at `seconds`. A cooldown of 0 is no cooldown.
  start(id, seconds) {
    if (seconds > 0) this.entries.set(id, { remaining: seconds, duration: seconds });
    else this.entries.delete(id);
  }

  // Whether `id` is still cooling down.
  active(id) {
    return this.entries.has(id);
  }

  // Seconds left on `id`, 0 when it is ready.
  remaining(id) {
    return this.entries.get(id)?.remaining ?? 0;
  }

  // Full length of `id`'s current cooldown, 0 when it is ready.
  duration(id) {
    return this.entries.get(id)?.duration ?? 0;
  }

  // How far `id` has recovered, from 0 as it starts to 1 once it is ready.
  progress(id) {
    const e = this.entries.get(id);
    if (!e) return 1;
    return Math.min(1, Math.max(0, 1 - e.remaining / e.duration));
  }

  // Every cooldown recovers `dt * rate` seconds; one that reaches 0 (to
  // within a little slack, as the steps are sums of floats) is over. Never
  // negative.
  update(dt, rate = 1) {
    const amount = dt * rate;
    for (const [id, e] of this.entries) {
      if (e.remaining - amount <= PHASE_EPSILON) this.entries.delete(id);
      else e.remaining -= amount;
    }
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

// Per-fighter combat state.
export class CombatState {
  constructor(energy = resolveEnergy()) {
    // Launch Point: starts at 0 on every fresh life and only ever grows, by
    // exactly the damage each hit deals (see CombatSystem.applyHit). Never
    // negative, no maximum, and it never stops the fighter acting; a
    // launching hit multiplies it by its Base Launch.
    this.launchPoint = 0;
    // Energy for Dash and Shield (see resolveEnergy): full at the start,
    // never below 0 or above maxEnergy. Emptying it (however it happens)
    // exhausts the fighter, and only a full refill clears that (see
    // setEnergy).
    this.energySpec = energy;
    this.maxEnergy = energy.max;
    this.energy = energy.max;
    this.energyExhausted = false;
    // The Shield is up (see Fighter.update): hits that reach the fighter are
    // blocked (see CombatSystem.applyHit).
    this.shielding = false;
    this.stun = 0;          // hitstun remaining
    this.shieldStun = 0;    // blockstun remaining, held in the Shield
    this.hitstop = 0;       // freeze frames on impact
    this.attack = null;     // { def, time, hasHit, projectileSpawned }
    this.release = null;    // the attack's projectile, released this step (see Fighter.update)
    // Ordinary attacks' short recovery cooldowns: attack id -> seconds left.
    this.cooldowns = new Map();
    // Charged actions' own cooldowns (Charged BA1, Charged BA2), by summon or
    // technique id; the Fighter starts and recovers them.
    this.chargedCooldowns = new CooldownTimers();
    this.lastIntent = null; // last combat button pressed (for future buffering/UI)
    // Whatever holds this fighter in place (a charged technique that caught
    // it), each by its own token so a source only ever releases its own hold.
    this.binds = new Set();
  }

  get attacking() {
    return !!this.attack;
  }

  get phase() {
    const a = this.attack;
    return a ? attackPhase(a.def, a.time) : null;
  }

  // Bound: caught and held by a charged technique (see bind). Unlike
  // hitstun it has no timer: it lasts until its source releases it.
  get immobilized() {
    return this.binds.size > 0;
  }

  bind(source) {
    this.binds.add(source);
  }

  // Releases only `source`'s hold; any other stays.
  unbind(source) {
    this.binds.delete(source);
  }

  isBoundBy(source) {
    return this.binds.has(source);
  }

  // Free of any attack, stun (a Shield's blockstun included) or bind.
  // Launch Point never matters here, however high it is, and neither does
  // Energy.
  canAct() {
    return !this.attack && this.stun <= 0 && this.shieldStun <= 0 && !this.immobilized;
  }

  // ---- Energy -----------------------------------------------------------------

  // Whether something that costs Energy may start now: any time the fighter
  // is not exhausted, however little is left (see spendEnergy).
  canUseEnergy() {
    return !this.energyExhausted;
  }

  // Whether the Shield may be up: never while exhausted. A block it cannot
  // fully pay for still stands; it empties the bar (see CombatSystem.applyHit).
  canShield() {
    return this.canUseEnergy();
  }

  // Pays `cost` at once, if canUseEnergy allows it. True when paid. With
  // less than `cost` left it takes all of it: the bar is empty and the
  // fighter exhausted until it refills completely.
  spendEnergy(cost) {
    if (!this.canUseEnergy()) return false;
    this.setEnergy(this.energy - cost);
    return true;
  }

  regenEnergy(amount) {
    this.setEnergy(this.energy + amount);
  }

  // One step of recovery: chargeRegen per second while `charging` (the
  // fighter is really in its Charge stance), regen per second otherwise.
  updateEnergy(dt, charging) {
    const spec = this.energySpec;
    this.regenEnergy(dt * (charging ? spec.chargeRegen : spec.regen));
  }

  // Full again, not exhausted (a fresh fighter, a respawn).
  refillEnergy() {
    this.setEnergy(this.maxEnergy);
  }

  // energy / maxEnergy, from 0 to 1.
  get energyRatio() {
    return this.maxEnergy > 0 ? Math.min(1, Math.max(0, this.energy / this.maxEnergy)) : 0;
  }

  // Every change goes through here: clamped to [0, max] (to within a little
  // slack, as steps are sums of floats). Reaching 0 exhausts the fighter;
  // only reaching max again clears it.
  setEnergy(value) {
    const max = this.maxEnergy;
    let v = Math.min(max, Math.max(0, value));
    if (v <= PHASE_EPSILON) {
      v = 0;
      this.energyExhausted = true;
    } else if (v >= max - PHASE_EPSILON) {
      v = max;
      this.energyExhausted = false;
    }
    this.energy = v;
  }

  update(dt) {
    for (const [id, t] of this.cooldowns) {
      if (t - dt <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, t - dt);
    }
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      return;
    }
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    if (this.shieldStun > 0) this.shieldStun = Math.max(0, this.shieldStun - dt);
    if (this.attack) {
      this.attack.time += dt;
      // One-shot release: the step the attack's time crosses `spawnAt`. A
      // throw interrupted by a hit before that point throws nothing.
      const proj = this.attack.def.projectile;
      if (proj && !this.attack.projectileSpawned && this.attack.time >= proj.spawnAt - PHASE_EPSILON) {
        this.attack.projectileSpawned = true;
        if (this.stun <= 0) this.release = proj;
      }
      if (this.attack.time >= this.attack.def.total - PHASE_EPSILON) {
        this.cooldowns.set(this.attack.def.id, this.attack.def.cooldown);
        this.attack = null;
      }
    }
  }
}

// World-space rectangle for a box defined relative to a fighter origin.
export function worldBox(fighter, box, out = {}) {
  const facing = fighter.facing;
  out.x = facing > 0 ? fighter.body.x + box.x : fighter.body.x - box.x - box.w;
  out.y = fighter.body.y + box.y;
  out.w = box.w;
  out.h = box.h;
  return out;
}

const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const scratchHit = {};
const scratchHurt = {};

// Resolves hits each simulation step: fighters' melee hitboxes, then live
// projectiles (see js/game/projectile.js), then summoned clones (see
// js/game/clone.js), then charged techniques (see
// js/game/charged-technique.js). A shielding target is struck exactly like
// any other (its own hurtboxes, never a bigger circle): applyHit decides the
// hit is blocked, and the hitbox is used up either way.
export class CombatSystem {
  constructor() {
    // { type: 'hit' | 'block', attacker, target, move, damage, energyCost,
    //   launchPointBefore, launchPointAfter, baseLaunch, directionalLaunch,
    //   launchStrength, finalLaunch, projectile, summon, technique }
    // `damage` is what the hit added to the target's Launch Point (0 on a
    // block), `move` the id of the attack or hit that dealt it and
    // `energyCost` what the target's Shield paid for it: shieldHitCost, or
    // whatever was left when that was less (0 on a hit).
    // `baseLaunch` is the hit's Base Launch (0-3) and `directionalLaunch` its
    // direction; `launchStrength` is baseLaunch x launchPointAfter (0 on a
    // block), and `finalLaunch` the world-space velocity { x, y } the target
    // was given: that strength at LAUNCH_UNIT_SPEED per point along the
    // direction (y grows downward; zero for no launch). `attacker` is the
    // owner for a projectile or clone hit; `projectile`, `summon` and
    // `technique` are null for the fighter's own melee.
    this.events = [];
  }

  update(fighters, projectiles = [], clones = []) {
    this.events.length = 0;
    for (const attacker of fighters) {
      const atk = attacker.combat.attack;
      // A projectile attack has no melee hitbox: its damage is the projectile's.
      if (!atk || !atk.def.hitbox || atk.hasHit || attacker.combat.phase !== 'active') continue;
      const hit = worldBox(attacker, atk.def.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        // One hit per attack, blocked or not.
        atk.hasHit = true;
        this.applyHit(attacker, target, atk.def);
        break;
      }
    }
    for (const p of projectiles) {
      if (!p.alive) continue;
      const hit = p.hitbox(scratchHit);
      for (const target of fighters) {
        if (target === p.owner) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        // One hit, then it is gone (a Shielded projectile included).
        p.alive = false;
        this.applyHit(p.owner, target, p.def, { facing: p.direction, projectile: p });
        break;
      }
    }
    for (const c of clones) {
      // Only during the attack's active phase, and only once per attack.
      const hit = c.hitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === c.owner) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        c.hasHit = true;
        // The clone's own facing, never the owner's: a horizontal launch
        // travels from the clone.
        this.applyHit(c.owner, target, c.attackDef, { facing: c.facing, summon: c });
        c.hitstop = c.attackDef.hitstop;
        break;
      }
    }
    for (const owner of fighters) {
      const t = owner.technique;
      if (!t) continue;
      // The ticks while it holds its target, one hit each: Launch Point
      // only, no launch. Never on the explosion's step (see
      // ChargedTechnique.update).
      this.applyTicks(owner, t);
      // The delayed explosion, on the step its first frame shows: the target
      // is released first, then takes the big hit and its launch.
      if (t.explosionDue) {
        const target = t.takeExplosion();
        if (target) this.applyHit(owner, target, t.def.explosionHit, { facing: t.facing, technique: t });
        continue;
      }
      // The rushing sphere: only while dashing, and only until it connects.
      const hit = t.sphereHitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === owner) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        // The contact, exactly once; the sphere stops searching after it. A
        // Shield blocks it and the technique ends there; otherwise the
        // target is bound and its first tick lands on this same step.
        const event = this.applyHit(owner, target, t.def.firstHit, { facing: t.facing, technique: t });
        const ended = t.contact(target, event.type === 'block');
        if (ended) owner.endTechnique(ended);
        else this.applyTicks(owner, t);
        break;
      }
    }
    return this.events;
  }

  // Every tick `t` has due this step, each one tickHit on its target.
  applyTicks(owner, t) {
    for (let target = t.takeTick(); target; target = t.takeTick()) {
      this.applyHit(owner, target, t.def.tickHit, { facing: t.facing, technique: t });
    }
  }

  // Shared by melee, projectiles, clones and charged techniques. `facing` is
  // the direction the hit travels: the attacker's facing for melee, the
  // projectile's own direction (fixed when thrown), the clone's facing
  // (fixed when summoned) or the technique's (fixed when it started). A
  // detached hit (a projectile's, a clone's or a technique's) freezes only
  // its target.
  //
  // A target whose Shield is up blocks the hit, whichever side it comes
  // from: no Launch Point, no launch and no hitstun, only the hit's hitstop
  // and its blockstun, held in the Shield. The Shield pays
  // energy.shieldHitCost for it, once, or all that is left when that is
  // less: a block that empties the bar exhausts the fighter and drops the
  // Shield straight away, so a later hit, even on this same step, lands in
  // full. The block itself stands.
  //
  // Otherwise the damage is added to the target's Launch Point first, so
  // the hit that raises it already launches from the new total. The launch
  // strength is exactly Base Launch x that Launch Point, sent along the
  // hit's Directional Launch at LAUNCH_UNIT_SPEED world units per second per
  // point (see js/data/launch.js). A hit that does not launch (Base Launch
  // 0 or no direction) leaves the target's velocity as it is. Returns the
  // event it recorded.
  applyHit(attacker, target, def, {
    facing = attacker.facing, projectile = null, summon = null, technique = null,
    detached = !!(projectile || summon || technique),
  } = {}) {
    const tc = target.combat;
    const blocked = tc.shielding;
    let energyCost = 0;
    if (blocked) {
      energyCost = Math.min(tc.energySpec.shieldHitCost, tc.energy);
      tc.spendEnergy(tc.energySpec.shieldHitCost);
      if (!tc.canShield()) tc.shielding = false;
    }
    const damage = blocked ? 0 : def.damage;
    const launchPointBefore = tc.launchPoint;
    tc.launchPoint = Math.max(0, launchPointBefore + damage);
    const launchPointAfter = tc.launchPoint;
    const launchStrength = blocked ? 0 : resolveLaunchStrength(def.baseLaunch, launchPointAfter);
    const finalLaunch = resolveDirectionalLaunch(def.directionalLaunch, launchStrength, facing);
    // A hit with no stun or freeze of its own (a charged technique's tick)
    // leaves any already running as it is. A block's stun holds the Shield
    // only while it is still up.
    if (blocked) {
      if (tc.shielding && def.blockstun > 0) tc.shieldStun = def.blockstun;
    } else if (def.hitstun > 0) {
      tc.stun = def.hitstun;
    }
    if (def.hitstop > 0) tc.hitstop = def.hitstop;
    if (!detached) attacker.combat.hitstop = def.hitstop;
    // ...and a charged technique: no armour. It ends at once, releasing
    // whatever it held, before the launch below moves the fighter.
    target.endTechnique?.('hit');
    if (finalLaunch.x || finalLaunch.y) {
      // A launch replaces the target's sideways speed (a vertical one sends
      // it straight up or down) and, when it has one, its vertical speed.
      target.body.vx = finalLaunch.x;
      if (finalLaunch.y) {
        target.body.vy = finalLaunch.y;
        target.body.grounded = false;
      }
    }
    const event = {
      type: blocked ? 'block' : 'hit', attacker, target, move: def.id ?? null,
      damage, energyCost, launchPointBefore, launchPointAfter,
      baseLaunch: def.baseLaunch, directionalLaunch: def.directionalLaunch, launchStrength, finalLaunch,
      projectile, summon, technique,
    };
    this.events.push(event);
    return event;
  }
}
