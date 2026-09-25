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
//       knockback: { axis: 'horizontal', level: 'low' }, hitstun: 0.22, blockstun: 0.14, cooldown: 0.1,
//     },
//     launcher: { ..., knockback: { axis: 'vertical', level: 'high' } },
//     airSpike: { animation: 'airSpike', ..., knockback: { axis: 'vertical', level: 'mid', sign: -1 } },
//   },
//   // One attack per action, or { ground, air } chosen by grounded state.
//   actions: { primary: 'jab', action1: { ground: 'jab', air: 'airSpike' }, ... }
//
// An attack's `knockback` is a Knockback descriptor (js/data/knockback.js):
// an `axis` and a strength `level` ('low', 'mid' or 'high'), independent of
// each other. It is the attack's default Knockback: its own natural launch,
// never the target's accumulated Knockback. Horizontal Knockback pushes the
// target away along the hit's facing; vertical Knockback launches it upward
// (positive `baseKnockback.y`), or, with `sign: -1`, drives it downward at
// the same level's strength (negative `baseKnockback.y`). An attack that
// declares none has no knockback. createAttackDefinition resolves the
// descriptor once, into the definition's numeric `baseKnockback: { x, y }`
// and its `accumulatedKnockbackAxis` (the descriptor's axis), which is all
// applyHit (and a clone performing the attack) ever reads. Bespoke hits that
// are not fighter attacks (a projectile's, a charged technique's) declare
// their own numeric `baseKnockback: { x, y }` and, optionally, their
// `accumulatedKnockbackAxis`.
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
// how it defends (see createDefenseDefinition):
//
//   // Dodge: one press, one clip; attacks pass through while invulnerable.
//   defense: {
//     type: 'dodge',
//     ground: { animation: 'dodge', startup: 1 / 12, invulnerable: 1 / 12, recovery: 1 / 12 },
//     air: { animation: 'midairDodge', ... },
//   }
//   // Block: a held guard that takes chip damage (stats.blockDamageScale)
//   // and each attack's blockstun instead of a full hit.
//   defense: { type: 'block' }
//
// A hit's `damage` (a blocked hit's chip damage) is how much it adds to the
// target's accumulated Knockback (CombatState.knockback). A launching hit
// then launches with its own default launch plus a separate bonus from that
// new total (see resolveLaunch in js/data/knockback.js): the bonus follows
// the move's direction but never its strength, and damage never sets the
// move's default launch. No amount of Knockback defeats a fighter: only the
// Void takes one out of play.
//
// A Dodge is not an attack: no hitbox, damage, cooldown or combat event.
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
// Stamina (CombatState.stamina, see resolveStamina) is the one resource a
// fighter spends, and only on Dash, Dodge and Block: a Dash or a Dodge pays
// its cost once as it starts, a held Block drains it per second. It refills
// by itself, faster while the fighter is in its Charge stance. Emptied, it
// exhausts the fighter: no Dash, Dodge or Block until it is full again.
// Nothing else (movement, jumps, attacks, charged actions) ever touches it.

import { resolveKnockback, resolveLaunch } from '../data/knockback.js';

const ATTACK_DEFAULTS = {
  animation: null,
  startup: 0.08,
  active: 0.06,
  recovery: 0.18,
  damage: 0,
  chipDamage: 0,
  hitbox: { x: 0, y: -60, w: 30, h: 20 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
  cooldown: 0,
  groundOnly: false,
  lockMovement: true,
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
// Its Knockback descriptor becomes its numeric default launch,
// `baseKnockback`, here, once, so hits never look levels up; the
// descriptor's axis is the one the target's accumulated Knockback adds
// launch along (none for an attack with no default launch).
export function createAttackDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Attack definitions need an id');
  const { knockback, ...rest } = spec;
  const def = { ...ATTACK_DEFAULTS, ...rest };
  def.baseKnockback = resolveKnockback(knockback, `Attack "${spec.id}"`);
  def.accumulatedKnockbackAxis = def.baseKnockback.x || def.baseKnockback.y ? knockback.axis : null;
  def.total = def.startup + def.active + def.recovery;
  return Object.freeze(def);
}

const DODGE_DEFAULTS = { animation: null, startup: 0, invulnerable: 0, recovery: 0 };

function createDodgeMove(spec) {
  if (!spec) return null;
  const move = { ...DODGE_DEFAULTS, ...spec };
  move.total = move.startup + move.invulnerable + move.recovery;
  return Object.freeze(move);
}

// Frozen form of a character's `defense` entry, or null for a fighter that has
// no Defense (the input then does nothing).
export function createDefenseDefinition(spec) {
  if (!spec) return null;
  if (spec.type === 'dodge') {
    return Object.freeze({ type: 'dodge', ground: createDodgeMove(spec.ground), air: createDodgeMove(spec.air) });
  }
  if (spec.type === 'block') return Object.freeze({ ...spec });
  throw new Error(`[Alva] Unknown defense type "${spec.type}"`);
}

// A character's `stamina` entry, every field optional:
//
//   stamina: {
//     max: 100,        // full, and where every fighter starts
//     regen: 12,       // per second, whatever the fighter is doing
//     chargeRegen: 30, // per second instead, while in the Charge stance
//     dashCost: 25,    // spent once as a Dash starts
//     dodgeCost: 25,   // spent once as a Dodge starts
//     blockDrain: 20,  // per second while a Block guard is held
//   }
const STAMINA_DEFAULTS = Object.freeze({
  max: 100, regen: 12, chargeRegen: 30, dashCost: 25, dodgeCost: 25, blockDrain: 20,
});

// Frozen stamina settings: the character's entry over the defaults.
export function resolveStamina(spec) {
  return Object.freeze({ ...STAMINA_DEFAULTS, ...spec });
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
  constructor(stats = {}, stamina = resolveStamina()) {
    // Accumulated Knockback: starts at 0 and only ever grows, by each hit's
    // damage (see CombatSystem.applyHit). No maximum, and it never stops the
    // fighter acting; the higher it is, the more extra launch every
    // launching hit adds on top of that move's own default launch.
    this.knockback = 0;
    // Stamina for Dash, Dodge and Block (see resolveStamina): full at the
    // start, never below 0 or above maxStamina. Emptying it exhausts the
    // fighter, and only a full refill clears that (see setStamina).
    this.staminaSpec = stamina;
    this.maxStamina = stamina.max;
    this.stamina = stamina.max;
    this.staminaExhausted = false;
    // Block-type Defense only: the held guard and its chip-damage scale (a
    // blocked hit adds that share of its damage to Knockback).
    this.blockDamageScale = stats.blockDamageScale ?? 0.2;
    this.blocking = false;
    this.stun = 0;          // hitstun / blockstun remaining
    this.hitstop = 0;       // freeze frames on impact
    this.attack = null;     // { def, time, hasHit, projectileSpawned }
    this.release = null;    // the attack's projectile, released this step (see Fighter.update)
    this.defenseAction = null; // { type: 'dodge', def, time } while a Dodge plays
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

  // 'startup' | 'invulnerable' | 'recovery' while a Dodge plays, else null.
  get defensePhase() {
    const d = this.defenseAction;
    if (!d) return null;
    if (d.time < d.def.startup - PHASE_EPSILON) return 'startup';
    if (d.time < d.def.startup + d.def.invulnerable - PHASE_EPSILON) return 'invulnerable';
    return 'recovery';
  }

  // Attacks pass through an invulnerable fighter (see CombatSystem.update).
  get invulnerable() {
    return this.defensePhase === 'invulnerable';
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

  // Free of any attack, Dodge, stun or bind. Accumulated Knockback never
  // matters here, however high it is, and neither does stamina.
  canAct() {
    return !this.attack && !this.defenseAction && this.stun <= 0 && !this.immobilized;
  }

  // ---- Stamina ----------------------------------------------------------------

  // Whether something costing `cost` may start now: never while exhausted,
  // however much has refilled since, and only with at least `cost` left.
  canUseStamina(cost) {
    return !this.staminaExhausted && this.stamina >= cost - PHASE_EPSILON;
  }

  // Pays `cost` at once, if canUseStamina allows it. True when paid.
  spendStamina(cost) {
    if (!this.canUseStamina(cost)) return false;
    this.setStamina(this.stamina - cost);
    return true;
  }

  // Takes up to `amount` (a held Block's drain for one step). True while
  // some is left; false once it has run out and exhausted the fighter.
  drainStamina(amount) {
    this.setStamina(this.stamina - amount);
    return !this.staminaExhausted;
  }

  regenStamina(amount) {
    this.setStamina(this.stamina + amount);
  }

  // One step of recovery: chargeRegen per second while `charging` (the
  // fighter is really in its Charge stance), regen per second otherwise.
  updateStamina(dt, charging) {
    const spec = this.staminaSpec;
    this.regenStamina(dt * (charging ? spec.chargeRegen : spec.regen));
  }

  // Full again, not exhausted (a fresh fighter, a respawn).
  refillStamina() {
    this.setStamina(this.maxStamina);
  }

  // stamina / maxStamina, from 0 to 1.
  get staminaRatio() {
    return this.maxStamina > 0 ? Math.min(1, Math.max(0, this.stamina / this.maxStamina)) : 0;
  }

  // Every change goes through here: clamped to [0, max] (to within a little
  // slack, as steps are sums of floats). Reaching 0 exhausts the fighter;
  // only reaching max again clears it.
  setStamina(value) {
    const max = this.maxStamina;
    let v = Math.min(max, Math.max(0, value));
    if (v <= PHASE_EPSILON) {
      v = 0;
      this.staminaExhausted = true;
    } else if (v >= max - PHASE_EPSILON) {
      v = max;
      this.staminaExhausted = false;
    }
    this.stamina = v;
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
    // A Dodge ends by itself after one pass of its clip.
    if (this.defenseAction) {
      this.defenseAction.time += dt;
      if (this.defenseAction.time >= this.defenseAction.def.total - PHASE_EPSILON) this.defenseAction = null;
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
// js/game/charged-technique.js).
export class CombatSystem {
  constructor() {
    // { type: 'hit' | 'block', attacker, target, move, damage, knockbackBefore,
    //   knockbackAfter, baseLaunch, bonusLaunch, finalLaunch, projectile,
    //   summon, technique }
    // `damage` is what the hit added to the target's Knockback, `move` the id
    // of the attack or hit that dealt it. The launches are in the move's own
    // frame (x away from the attacker, y upward): `baseLaunch` the move's
    // default, `bonusLaunch` what the target's accumulated Knockback added
    // and `finalLaunch` what the target was given (base + bonus; on a block,
    // half of that sideways and nothing vertical). `attacker` is the owner
    // for a projectile or clone hit; `projectile`, `summon` and `technique`
    // are null for the fighter's own melee.
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
        // Dodged: the attack passes through without being used up, so it can
        // still connect if it is active after the invulnerable frames end.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
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
        // Dodged: the projectile flies on, unspent, and can still connect if
        // it overlaps once the invulnerable frames end.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        // One hit, then it is gone (a blocked projectile included).
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
        // Dodged: passes through unspent, exactly like the fighter's own.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        c.hasHit = true;
        // The clone's own facing, never the owner's: knockback travels from
        // the clone, and a Block guard must face the clone to hold.
        this.applyHit(c.owner, target, c.attackDef, { facing: c.facing, summon: c });
        c.hitstop = c.attackDef.hitstop;
        break;
      }
    }
    for (const owner of fighters) {
      const t = owner.technique;
      if (!t) continue;
      // The ticks while it holds its target, one hit each: Knockback only,
      // no launch. Never on the explosion's step (see ChargedTechnique.update).
      for (let target = t.takeTick(); target; target = t.takeTick()) {
        this.applyHit(owner, target, t.def.tickHit, { facing: t.facing, technique: t });
      }
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
        // Dodged: the rush carries on, unspent, and can still connect after
        // the invulnerable frames.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        // The contact, exactly once; the sphere stops searching after it.
        const event = this.applyHit(owner, target, t.def.firstHit, { facing: t.facing, technique: t });
        const ended = t.contact(target, event.type === 'block');
        if (ended) owner.endTechnique(ended);
        break;
      }
    }
    return this.events;
  }

  // Shared by melee, projectiles, clones and charged techniques. `facing` is
  // the direction the hit travels: the attacker's facing for melee, the
  // projectile's own direction (fixed when thrown), the clone's facing
  // (fixed when summoned) or the technique's (fixed when it started).
  // `blocked` needs a Block-type guard facing into it; a Dodge never blocks,
  // so a hit outside its invulnerable frames is a full hit. A detached hit
  // (a projectile's, a clone's or a technique's) freezes only its target.
  //
  // The damage (chip damage when blocked) is added to the target's
  // accumulated Knockback first. The launch is then the move's default launch
  // plus the accumulated-Knockback bonus for that new total, two separate
  // parts added, never one scaled by the other (see resolveLaunch), so the
  // hit that raises the number already launches harder. A block then halves
  // the sideways launch and cancels the vertical one. Returns the event it
  // recorded.
  applyHit(attacker, target, def, {
    facing = attacker.facing, projectile = null, summon = null, technique = null,
    detached = !!(projectile || summon || technique),
  } = {}) {
    const tc = target.combat;
    const blocked = tc.blocking && target.facing === -facing;
    // Hitstun always wins: a hit cancels a Dodge in its startup or recovery.
    tc.defenseAction = null;
    const damage = blocked ? def.chipDamage || def.damage * tc.blockDamageScale : def.damage;
    const knockbackBefore = tc.knockback;
    tc.knockback = knockbackBefore + damage;
    // A hit with no default launch (a shuriken, a technique's ticks) has no
    // launch axis, so the bonus leaves it at zero however high Knockback is.
    const launch = resolveLaunch(def.baseKnockback, tc.knockback, def.accumulatedKnockbackAxis);
    const finalLaunch = blocked ? { x: 0.5 * launch.final.x, y: 0 } : launch.final;
    // A hit with no stun or freeze of its own (a charged technique's tick)
    // leaves any already running as it is.
    const stun = blocked ? def.blockstun : def.hitstun;
    if (stun > 0) tc.stun = stun;
    if (def.hitstop > 0) tc.hitstop = def.hitstop;
    if (!detached) attacker.combat.hitstop = def.hitstop;
    // ...and a charged technique: no armour. It ends at once, releasing
    // whatever it held, before the knockback below moves the fighter.
    target.endTechnique?.('hit');
    target.body.vx = finalLaunch.x * facing;
    // Vertical knockback, unblocked hits only: world y grows downward, so a
    // positive launch y launches upward and a negative one drives the
    // target down.
    if (finalLaunch.y) {
      target.body.vy = -finalLaunch.y;
      target.body.grounded = false;
    }
    const event = {
      type: blocked ? 'block' : 'hit', attacker, target, move: def.id ?? null,
      damage, knockbackBefore, knockbackAfter: tc.knockback,
      baseLaunch: launch.base, bonusLaunch: launch.bonus, finalLaunch,
      projectile, summon, technique,
    };
    this.events.push(event);
    return event;
  }
}
