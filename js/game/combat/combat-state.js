// Per-fighter combat state: Launch Point, Energy, the attack in progress
// and its phase clock, hitstun, blockstun and impact freeze, paralysis, and
// every cooldown. Universal: one CombatState per fighter, whoever it is.
//
// Inputs: the fighter's resolved Energy settings (resolveEnergy, from its
// definition's `energy` entry).
// Outputs: CombatState, CooldownTimers, resolveEnergy and the Energy rules
// (MAX_ENERGY, DASH_ENERGY_COST, BLOCK_ENERGY_COST, DEFLECT_ENERGY_COST).
// Important constraints: the Fighter (js/game/fighters/fighter.js) and
// CombatSystem.applyHit (js/game/combat/combat.js) are the only writers;
// readers (the HUD, the status drawn over a fighter, the combat AI) only
// read. Every clock compares its boundaries with PHASE_EPSILON
// (js/game/combat/attacks.js), so a phase a whole number of fixed steps
// long lasts exactly that many steps.
//
// A summon or a technique on a numbered button (see js/data/loadout.js) is
// not paid for: each has its own cooldown (CombatState.abilityCooldowns, see
// CooldownTimers), keyed by the attack it is (attack4, attack5), started
// when it is used (none at all when its cooldown is 0) and apart from the
// short repeat cooldowns of ordinary attacks (CombatState.cooldowns, at most
// MAX_ATTACK_COOLDOWN: see js/game/combat/attacks.js). Both run down in
// real time.
//
// Energy (CombatState.energy, see resolveEnergy) is the one resource a
// fighter spends (there is no Shield meter apart from it), on three things
// only, at the same price for every fighter: a Dash or an air dash pays
// DASH_ENERGY_COST as it starts (the same when it cuts short an attack that
// hit), the Deflect pays DEFLECT_ENERGY_COST as it starts, and every hit the
// Shield blocks costs BLOCK_ENERGY_COST, a perfect Shield's included. Each
// works with less left than it costs, but then takes all of it. It refills
// by itself at one passive rate, and every fighter's bar holds MAX_ENERGY.
// Emptied, it exhausts the fighter: no Dash, air dash, Deflect or Shield
// until it is full again. Nothing else (movement, jumps, attacks, Combat
// Assist, summons, techniques, a successful block or Deflect) ever touches
// it: no defense gives any back.

import { PHASE_EPSILON, attackPhase } from './attacks.js';

// The Energy rules, the same for every fighter: what a full bar holds
// (where every fighter starts, and what a respawn or a restart refills it
// to) and what each thing that spends it costs.
export const MAX_ENERGY = 100;
export const DASH_ENERGY_COST = 25;    // a Dash or an air dash, a Dash cancel included
export const BLOCK_ENERGY_COST = 15;   // each hit the Shield blocks, a perfect Shield's included
export const DEFLECT_ENERGY_COST = 15; // each Deflect, as it starts

// The universal fields of a resolved Energy entry, by name. A fighter's
// `energy` entry may leave any of them out (and should), and declaring one
// with any other value is refused: no fighter holds more or less Energy,
// or pays more or less for anything, than another.
const ENERGY_RULES = Object.freeze({
  max: MAX_ENERGY,
  dashCost: DASH_ENERGY_COST,
  dashCancelCost: DASH_ENERGY_COST,
  shieldHitCost: BLOCK_ENERGY_COST,
  deflectCost: DEFLECT_ENERGY_COST,
});

// The one field a fighter's `energy` entry may set, its refill rate:
//
//   energy: { regen: 14 }  // per second, whatever the fighter is doing
const DEFAULT_REGEN = 12;

// Frozen Energy settings: the universal rules, and the fighter's own regen
// (DEFAULT_REGEN left out). A field the schema does not know, a negative
// regen, or a universal field declared with any other value than the rule's
// is refused, naming `owner`.
export function resolveEnergy(spec, owner = 'A fighter') {
  for (const [field, value] of Object.entries(spec ?? {})) {
    if (field === 'regen') {
      if (!(typeof value === 'number' && value >= 0)) throw new Error(`[Alva] ${owner}'s Energy regen must be a number from 0`);
    } else if (Object.hasOwn(ENERGY_RULES, field)) {
      if (value !== ENERGY_RULES[field]) {
        throw new Error(`[Alva] ${owner} declares Energy ${field} ${value}: it is ${ENERGY_RULES[field]} for every fighter`);
      }
    } else {
      throw new Error(`[Alva] ${owner} declares an unknown Energy field "${field}" (only regen is a fighter's own)`);
    }
  }
  return Object.freeze({ ...ENERGY_RULES, regen: spec?.regen ?? DEFAULT_REGEN });
}

// Named cooldowns that each remember their full length, so progress can be
// read back (1 - remaining / duration) without knowing where they came from.
// Used for the summons' and techniques' cooldowns
// (CombatState.abilityCooldowns).
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

  // Every cooldown recovers `dt` seconds; one that reaches 0 (to within a
  // little slack, as the steps are sums of floats) is over. Never negative.
  update(dt) {
    for (const [id, e] of this.entries) {
      if (e.remaining - dt <= PHASE_EPSILON) this.entries.delete(id);
      else e.remaining -= dt;
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
    // Energy for the Dash, the Deflect and the Shield (see resolveEnergy):
    // full at the start, never below 0 or above maxEnergy (MAX_ENERGY for
    // every fighter). Emptying it (however it happens) exhausts the
    // fighter, and only a full refill clears that (see setEnergy).
    this.energySpec = energy;
    this.maxEnergy = MAX_ENERGY;
    this.energy = MAX_ENERGY;
    this.energyExhausted = false;
    // The Shield is up (see Fighter.update): hits that reach the fighter are
    // blocked (see CombatSystem.applyHit).
    this.shielding = false;
    this.stun = 0;          // hitstun remaining
    this.shieldStun = 0;    // blockstun remaining, held in the Shield
    this.hitstop = 0;       // freeze frames on impact
    // { def, time, hasHit, confirmed, confirmedAt, projectileSpawned,
    // stepped, struck, blocked, motion }: hasHit once its hitbox (any of its
    // strikes) has struck anyone, confirmed (at its time confirmedAt) only
    // for a hit a Shield did not block, stepped once its `step` has moved
    // the fighter. A multi-hit attack also keeps the strikes it has dealt
    // (`struck`, by index) and whether a Shield stopped it (`blocked`); a
    // motion attack its motion's progress (`motion`, see Fighter).
    this.attack = null;
    this.release = null;    // the attack's projectile, released this step (see Fighter.update)
    // Ordinary attacks' short repeat cooldowns (MAX_ATTACK_COOLDOWN at
    // most): attack id -> seconds left.
    this.cooldowns = new Map();
    // The summons' and techniques' own cooldowns (e.g. #0001's attack4 and
    // attack5), by the attack each one is: the Fighter starts them, and
    // they recover in real time (see update).
    this.abilityCooldowns = new CooldownTimers();
    this.lastIntent = null; // last combat button pressed (see Fighter.tryAction)
    // Seconds this fighter is still held in place by a hit's `paralyze`
    // (see js/game/combat/hit-effects.js and paralyze below).
    this.paralysis = 0;
  }

  get attacking() {
    return !!this.attack;
  }

  // The attack in progress hit (a block does not count) and has reached its
  // hitCancel time: another attack, a jump or a Dash may cut the rest of it
  // short (see Fighter.tryAction, Fighter.tryDash and the jump in
  // Fighter.update). Never during the hit's freeze, a stun or a paralysis.
  get cancellable() {
    const a = this.attack;
    const at = a?.def.hitCancel;
    return !!a && a.confirmed && at != null && this.hitstop <= 0 && this.stun <= 0 && !this.immobilized &&
      a.time >= at - PHASE_EPSILON;
  }

  // Seconds the attack in progress has been cancellable (see cancellable),
  // or -1 while it is not: it may cut itself short into itself only once
  // its own cooldown (never more than MAX_ATTACK_COOLDOWN, none at all for
  // a cooldown of 0) has run for that long.
  get cancellableFor() {
    if (!this.cancellable) return -1;
    const a = this.attack;
    return a.time - Math.max(a.def.hitCancel, a.confirmedAt);
  }

  // Ends the attack in progress now: finished, or cut short once it is
  // cancellable. Its cooldown starts either way.
  endAttack() {
    const a = this.attack;
    if (!a) return;
    if (a.def.cooldown > 0) this.cooldowns.set(a.def.id, a.def.cooldown);
    this.attack = null;
  }

  // Drops the attack in progress with nothing left behind (no cooldown): a
  // hit or a paralysis took the fighter out of it (see Fighter.update).
  interruptAttack() {
    this.attack = null;
    this.release = null;
  }

  get phase() {
    const a = this.attack;
    return a ? attackPhase(a.def, a.time) : null;
  }

  // Held in place (paralyzed, see paralyze): the fighter cannot act, its
  // sideways speed is held at 0 and it shows its hurt pose (see
  // Fighter.update). Apart from hitstun: a hit that only stuns never ends
  // it, and it never ends a stun.
  get immobilized() {
    return this.paralysis > 0;
  }

  // A real hit paralyzed the fighter for `seconds`: the longer of what is
  // left and the new hold. It runs down like hitstun (never during an
  // impact freeze), and a launching hit ends it at once (see
  // releaseParalysis): a launch is never held back.
  paralyze(seconds) {
    if (seconds > this.paralysis) this.paralysis = seconds;
  }

  releaseParalysis() {
    this.paralysis = 0;
  }

  // Free of any attack, stun (a Shield's blockstun included) or paralysis.
  // Launch Point never matters here, however high it is, and neither does
  // Energy. (An attack that hit may still be cut short by another attack or
  // a jump: see cancellable.)
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

  // One step of passive recovery: regen per second.
  updateEnergy(dt) {
    this.regenEnergy(dt * this.energySpec.regen);
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
    // Every step, frozen or not, whatever the fighter holds or does.
    this.abilityCooldowns.update(dt);
    if (this.hitstop > 0) {
      // To within a little slack, so a freeze a whole number of steps long
      // (0.05 s) lasts exactly that many.
      this.hitstop = this.hitstop - dt <= PHASE_EPSILON ? 0 : this.hitstop - dt;
      return;
    }
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    if (this.shieldStun > 0) this.shieldStun = Math.max(0, this.shieldStun - dt);
    // To within a little slack, like the freeze: a hold a whole number of
    // steps long lasts exactly that many.
    if (this.paralysis > 0) this.paralysis = this.paralysis - dt <= PHASE_EPSILON ? 0 : this.paralysis - dt;
    if (this.attack) {
      this.attack.time += dt;
      // One-shot release: the step the attack's time crosses `spawnAt`. A
      // throw interrupted by a hit before that point throws nothing.
      const proj = this.attack.def.projectile;
      if (proj && !this.attack.projectileSpawned && this.attack.time >= proj.spawnAt - PHASE_EPSILON) {
        this.attack.projectileSpawned = true;
        if (this.stun <= 0) this.release = proj;
      }
      if (this.attack.time >= this.attack.def.total - PHASE_EPSILON) this.endAttack();
    }
  }
}
