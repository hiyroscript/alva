// Per-fighter combat state: Launch Point, Energy, the attack in progress
// and its phase clock, hitstun, blockstun and impact freeze, paralysis (and
// a float), a charm and a fear, and every cooldown. Universal: one
// CombatState per fighter, whoever it is.
//
// Inputs: the fighter's resolved Energy settings (resolveEnergy, from its
// definition's `energy` entry).
// Outputs: CombatState, CooldownTimers, resolveEnergy and the Energy rules
// (re-exported from js/data/energy.js: MAX_ENERGY, ENERGY_COST,
// DASH_ENERGY_COST, BLOCK_ENERGY_COST, DEFLECT_ENERGY_COST,
// CONSTRUCT_ENERGY_COST).
// Important constraints: the Fighter (js/game/fighters/fighter.js),
// CombatSystem.applyHit (js/game/combat/combat.js) and spawnClones (a
// summon's cooldown, as its clone appears) are the only writers;
// readers (the HUD, the status drawn over a fighter, the combat AI) only
// read. Every clock compares its boundaries with PHASE_EPSILON
// (js/game/combat/attacks.js), so a phase a whole number of fixed steps
// long lasts exactly that many steps.
//
// Cooldowns: only the cooldown policy's special ones exist (3 s and 5 s,
// js/data/cooldowns.js); an ordinary move has none. Each starts once, as
// its move is released, never as it starts: an ordinary attack's in
// CombatState.cooldowns (see releaseAttack: its strike, its last strike,
// its projectile or its impact out), a technique's in abilityCooldowns
// as its cast lets go (Fighter.update, Technique.takeCooldown), a summon's
// there too as its clone appears (spawnClones, js/game/combat/summon.js),
// each keyed by the attack it is (attack4, attack5). A move interrupted
// before it releases starts none. The Dash and air dash keep their own
// timers (movementCooldowns). All recover every fixed step, including
// impact freeze; a fresh life replaces all three stores.
//
// Energy (CombatState.energy, see resolveEnergy) is the one resource a
// fighter spends (there is no Shield meter apart from it), at one nominal
// price for every fighter and everything, ENERGY_COST (15, the Energy
// policy's: js/data/energy.js): a Dash or an air dash as it starts (a Dash
// cancel included), the Deflect as it starts, every hit the Shield blocks
// (a perfect Shield's included), and every move that creates a construct
// (a projectile, a clone, a burst) with no special cooldown, as it starts
// (its definition's `energyCost`). Each works with less left than it
// costs, but then takes all of it. It refills by itself at one passive
// rate, and every fighter's bar holds MAX_ENERGY. Emptied, it exhausts the
// fighter: no Dash, air dash, Deflect, Shield or construct move until it
// is full again. Nothing else (movement, jumps, melee attacks, a heal, a
// successful block or Deflect) ever touches it: no defense gives any back.

import { PHASE_EPSILON, attackPhase } from './attacks.js';
import { LAUNCH_RECOVERY_DELAY, LAUNCH_RECOVERY_INTERVAL, LAUNCH_RECOVERY_AMOUNT } from '../../data/launch.js';

import {
  MAX_ENERGY, ENERGY_COST, DASH_ENERGY_COST, BLOCK_ENERGY_COST, DEFLECT_ENERGY_COST, CONSTRUCT_ENERGY_COST,
} from '../../data/energy.js';

// The Energy rules, the same for every fighter (js/data/energy.js).
export { MAX_ENERGY, ENERGY_COST, DASH_ENERGY_COST, BLOCK_ENERGY_COST, DEFLECT_ENERGY_COST, CONSTRUCT_ENERGY_COST };

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
  constructCost: CONSTRUCT_ENERGY_COST,
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

// One step of attack record `a`'s clock: `dt` x its `rate` (1 for any
// ordinary activation; a Mash Combo turn's is MASH_COMBO.rate, see
// js/data/mash-combo.js). A faster attack crosses more of its own time in a
// step than one fixed step: `samples` then lists every whole-step time of
// its own clock it reached on the way (at rate 2, the step's middle and its
// end), so a strike window only one step long is never skipped over: hit
// resolution checks each of them (see CombatSystem.update). At its own pace
// (or frozen) `samples` is null and only `time` counts, exactly as ever.
export function sweepAttack(a, dt) {
  const rate = a.rate ?? 1;
  const from = a.time;
  a.time += dt * rate;
  if (!(rate > 1)) {
    a.samples = null;
    return;
  }
  const n = Math.ceil(rate - PHASE_EPSILON);
  const out = a.samples ?? [];
  out.length = n;
  for (let k = 1; k <= n; k++) out[k - 1] = from + ((a.time - from) * k) / n;
  a.samples = out;
}

// Per-fighter combat state.
export class CombatState {
  constructor(energy = resolveEnergy()) {
    // Launch Point: each real hit adds its damage and restarts passive
    // recovery (see CombatSystem.applyHit); a technique's heal takes some
    // off (see heal). Never negative, no maximum, and it never stops the
    // fighter acting; a launching hit multiplies the new total by its Base
    // Launch.
    this.launchPoint = 0;
    this.resetLaunchRecovery();
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
    // released, step, stepped, struck, blocked, motion }:
    // released once it has emitted what it authors (see releaseAttack),
    // hasHit once its hitbox (any of its strikes) has struck anyone,
    // confirmed (at its time confirmedAt) only for a hit a Shield did not
    // block, `step` the Step-in this activation makes (none when it started
    // in the air: see activationStep in js/game/fighters/movement.js),
    // stepped once its time has come. A multi-hit attack also keeps the strikes it has dealt
    // (`struck`, by index) and whether a Shield stopped it (`blocked`); a
    // motion attack its motion's progress (`motion`, see Fighter).
    this.attack = null;
    this.release = null;    // the attack's projectile, released this step (see Fighter.update)
    // Attack cooldowns (the cooldown policy's special ones,
    // js/data/cooldowns.js: 3 s or 5 s, started as the attack is released):
    // attack id -> seconds left. An ordinary attack and the Deflect have
    // none.
    this.cooldowns = new Map();
    // The summons' and techniques' own cooldowns (e.g. #0001's attack4 and
    // attack5), by the attack each one is: started as each is released (a
    // technique's cast letting go, a summon's clone appearing), and they
    // recover in real time (see update).
    this.abilityCooldowns = new CooldownTimers();
    this.movementCooldowns = new CooldownTimers();
    this.lastIntent = null; // last combat button pressed (see Fighter.tryAction)
    // Seconds this fighter is still held in place by a hit's `paralyze`
    // (see js/game/combat/hit-effects.js and paralyze below).
    this.paralysis = 0;
    // Seconds this fighter is still charmed by a hit's `charm`, and the
    // fighter whose hit charmed it (see charmBy below): null when it is not.
    this.charm = 0;
    this.charmedBy = null;
    // Seconds of a hit's `float` still lifting this fighter (see float
    // below): its paralysis holds it, and while this runs too it rises.
    this.floating = 0;
    // Seconds this fighter is still frightened by a hit's `fear`, and the
    // fighter whose hit frightened it (see frightenBy below): null when it
    // is not.
    this.fear = 0;
    this.frightenedBy = null;
  }

  get attacking() {
    return !!this.attack;
  }

  // The attack in progress hit (a block does not count) and has reached its
  // hitCancel time: another attack, a jump or a Dash may cut the rest of it
  // short (see Fighter.tryAction, Fighter.tryDash and the jump in
  // Fighter.update). Never during the hit's freeze, a stun or a paralysis.
  // This authored, hit-confirmed window is the only way an attack that can
  // harm is ever cut short by a request (one that yields, see
  // Fighter.moveYields, is the other case).
  get cancellable() {
    const a = this.attack;
    const at = a?.def.hitCancel;
    return !!a && a.confirmed && at != null && this.hitstop <= 0 && this.stun <= 0 && !this.immobilized &&
      a.time >= at - PHASE_EPSILON;
  }

  // The attack in progress is released (see RELEASE_EVENTS in
  // js/data/cooldowns.js): its special cooldown, if it has one, starts now.
  // Exactly once per attack: a later step, a second strike, the attack
  // ending or being cut short never starts or restarts it.
  releaseAttack() {
    const a = this.attack;
    if (!a || a.released) return;
    a.released = true;
    if (a.def.cooldown > 0) this.cooldowns.set(a.def.id, a.def.cooldown);
  }

  // Ends the attack in progress now: finished, landed, or cut short (it
  // was cancellable, or it yields). Its cooldown, if it has one, started
  // as it was released, or never: nothing starts here.
  endAttack() {
    this.attack = null;
  }

  // A hit or a paralysis takes the attack away: what it had not struck or
  // released yet never is (no cooldown starts for it), and a cooldown its
  // release already started runs on.
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
    this.floating = 0;
  }

  // A real hit made the fighter float for `seconds` (see `float` in
  // js/game/combat/hit-effects.js): held exactly as a paralysis holds it
  // (see paralyze), and for as long as the float lasts lifted, rising in
  // the air (see Fighter.update). The longer of what is left and the new
  // float. A launching hit ends it with the paralysis (see
  // releaseParalysis).
  float(seconds) {
    if (!(seconds > 0)) return;
    if (seconds > this.paralysis) this.paralysis = seconds;
    if (seconds > this.floating) this.floating = seconds;
  }

  // Held floating right now (see float).
  get afloat() {
    return this.floating > 0 && this.paralysis > 0;
  }

  // A real hit of `by`'s frightened this fighter for `seconds` (see `fear`
  // in js/game/combat/hit-effects.js): until it runs out, every real hit
  // `by` lands on this fighter feeds `by` (CombatSystem.applyHit). The
  // longer of what is left and the new fear, by the same fighter; a fear by
  // another fighter replaces it. It holds nothing in place, and runs down
  // every step, frozen or not (see update).
  frightenBy(seconds, by) {
    if (!(seconds > 0) || !by) return;
    if (by !== this.frightenedBy) {
      this.frightenedBy = by;
      this.fear = seconds;
    } else if (seconds > this.fear) {
      this.fear = seconds;
    }
  }

  // Whether this fighter is frightened of `fighter` right now (see
  // frightenBy).
  frightenedOf(fighter) {
    return this.fear > 0 && !!fighter && this.frightenedBy === fighter;
  }

  releaseFear() {
    this.fear = 0;
    this.frightenedBy = null;
  }

  // A real hit of `by`'s charmed this fighter for `seconds` (see `charm` in
  // js/game/combat/hit-effects.js): until it runs out, every hit this
  // fighter would land on `by` heals `by` instead (CombatSystem.applyHit).
  // The longer of what is left and the new charm, by the same fighter; a
  // charm by another fighter replaces it. It holds nothing in place, and
  // runs down every step, frozen or not (see update).
  charmBy(seconds, by) {
    if (!(seconds > 0) || !by) return;
    if (by !== this.charmedBy) {
      this.charmedBy = by;
      this.charm = seconds;
    } else if (seconds > this.charm) {
      this.charm = seconds;
    }
  }

  // Whether this fighter is charmed by `fighter` right now (see charmBy).
  charmedTo(fighter) {
    return this.charm > 0 && !!fighter && this.charmedBy === fighter;
  }

  releaseCharm() {
    this.charm = 0;
    this.charmedBy = null;
  }

  // Free of any attack, stun (a Shield's blockstun included) or paralysis.
  // Launch Point never matters here, however high it is, and neither does
  // Energy. (An attack that hit may still be cut short by another attack or
  // a jump: see cancellable.)
  canAct() {
    return !this.attack && this.stun <= 0 && this.shieldStun <= 0 && !this.immobilized;
  }

  // ---- Launch Point recovery ---------------------------------------------------

  // A real hit discards all progress, including a partial recovery tick.
  resetLaunchRecovery() {
    this.launchRecoveryRemaining = LAUNCH_RECOVERY_DELAY + LAUNCH_RECOVERY_INTERVAL;
  }

  // Seconds until the next whole point: grace + interval after a hit,
  // then just interval. Consume every elapsed tick, retaining the fraction.
  // At zero discard spare time so no overdue recovery can be banked.
  updateLaunchRecovery(dt) {
    if (this.launchPoint > 0) {
      this.launchRecoveryRemaining -= dt;
      if (this.launchRecoveryRemaining <= PHASE_EPSILON) {
        const ticks = 1 + Math.floor((PHASE_EPSILON - this.launchRecoveryRemaining) / LAUNCH_RECOVERY_INTERVAL);
        this.launchPoint = Math.max(0, this.launchPoint - ticks * LAUNCH_RECOVERY_AMOUNT);
        this.launchRecoveryRemaining += ticks * LAUNCH_RECOVERY_INTERVAL;
      }
    }
    if (this.launchPoint <= 0) {
      this.launchPoint = 0;
      this.resetLaunchRecovery();
    }
  }

  // A heal of its own (a technique's `heal`, see js/game/combat/technique.js):
  // `amount` Launch Points off, never below 0. Returns what it took off.
  // Recovery runs on as it was: a heal is no hit, so it neither restarts
  // nor speeds up the passive schedule.
  heal(amount) {
    const before = this.launchPoint;
    this.launchPoint = Math.max(0, before - Math.max(0, amount));
    return before - this.launchPoint;
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
      if (t - dt <= PHASE_EPSILON) this.cooldowns.delete(id);
      else this.cooldowns.set(id, t - dt);
    }
    // Every step, frozen or not, whatever the fighter holds or does.
    this.updateLaunchRecovery(dt);
    this.abilityCooldowns.update(dt);
    this.movementCooldowns.update(dt);
    // A charm runs down in real time, through an impact freeze too, to
    // within the same slack as the freeze.
    if (this.charm > 0) {
      this.charm = this.charm - dt <= PHASE_EPSILON ? 0 : this.charm - dt;
      if (!this.charm) this.charmedBy = null;
    }
    // ...and so does a fear.
    if (this.fear > 0) {
      this.fear = this.fear - dt <= PHASE_EPSILON ? 0 : this.fear - dt;
      if (!this.fear) this.frightenedBy = null;
    }
    if (this.hitstop > 0) {
      // Frozen: the attack reaches no new time this step (see sweepAttack).
      if (this.attack) this.attack.samples = null;
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
    // A float runs down with the paralysis that holds it, and ends with it.
    if (this.floating > 0) this.floating = this.floating - dt <= PHASE_EPSILON || !this.paralysis ? 0 : this.floating - dt;
    if (this.attack) {
      const a = this.attack;
      sweepAttack(a, dt);
      // Nothing comes out of an attack while its fighter is stunned or held
      // (Fighter.update takes the attack away on this same step).
      const free = this.stun <= 0 && !this.immobilized;
      // One-shot release: the step the attack's time crosses `spawnAt`. A
      // throw interrupted by a hit before that point throws nothing.
      const proj = a.def.projectile;
      if (proj && !a.projectileSpawned && a.time >= proj.spawnAt - PHASE_EPSILON) {
        a.projectileSpawned = true;
        // Whatever releases it, the attack that threw it is its ability.
        if (this.stun <= 0) this.release = { ...proj, ability: a.def.id };
      }
      // Released once its time reaches its release point (a slam with an
      // impact is released by the impact itself: Fighter.landSlam).
      const at = a.def.releaseAt;
      if (at != null && !a.released && free && a.time >= at - PHASE_EPSILON) this.releaseAttack();
      if (a.time >= a.def.total - PHASE_EPSILON) this.endAttack();
    }
  }
}
