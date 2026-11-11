// Per-fighter modifiers: the few numbers a Battle may hand one fighter for
// the whole match, read by the shared rules at the exact points they apply.
// Universal: every fighter has a modifiers object, and in every mode but
// Adventure it is the identity (IDENTITY_MODIFIERS), which changes nothing,
// bit for bit: a hit's damage times 1, a recovery tick's amount plus 0, its
// interval times 1, an Energy cost times 1.
//
//   damageDealt            multiplies the damage of every real (unblocked)
//                          hit this fighter is credited with: its melee, its
//                          projectiles, its clones', its techniques', a
//                          projectile it turned back (CombatSystem.applyHit)
//   damageTaken            multiplies the damage of every real hit this
//                          fighter takes, a stage hazard's included
//   recoveryAmountBonus    Launch Points added to each passive recovery
//                          tick (LAUNCH_RECOVERY_AMOUNT, 2)
//   recoveryIntervalScale  multiplies the seconds between ticks
//                          (LAUNCH_RECOVERY_INTERVAL, 0.5); never the delay
//                          before recovery starts (LAUNCH_RECOVERY_DELAY, 2)
//   energyCostScale        multiplies every Energy cost the fighter pays:
//                          the Dash, the air dash, a blocked hit, the
//                          Deflect, every move's own `energyCost`
//
// The damage a real hit adds to its target's Launch Point and Limit gauge is
// the hit's own (its definition's, one of the tiers 1, 3, 5 and 10, or its
// backstab's) times the attacker's damageDealt times the target's
// damageTaken (hitDamage), so the launch that follows (Base Launch x the new
// Launch Point) grows with it. A blocked hit deals 0 whatever the modifiers;
// a hit of 0 stays 0. Nothing else is touched: no speed, cooldown, hitbox,
// stun, Shield, Deflect or Energy maximum.
//
// The combat engine never knows where a modifiers object came from: no
// mode, no fighter id, no Adventure state is read here or by any rule that
// reads one. Only the Battle builds them (js/game/battle.js), and only
// Adventure gives a fighter anything but the identity, and only the
// player's (js/data/adventure.js: their Perquisites, Redoutable Strength's
// damageDealt among them). A CPU's fighter always has the identity: no
// difficulty, Venture included, feeds any of these, and the Battle refuses
// anything else for a CPU's side. The CPU reads the same functions to
// predict what its hits and its opponent's really do
// (js/game/ai/cpu-intelligence/effective.js), so nothing is computed twice.

import { LAUNCH_RECOVERY_AMOUNT, LAUNCH_RECOVERY_INTERVAL } from '../../data/launch.js';

export const IDENTITY_MODIFIERS = Object.freeze({
  damageDealt: 1,
  damageTaken: 1,
  recoveryAmountBonus: 0,
  recoveryIntervalScale: 1,
  energyCostScale: 1,
});

export const MODIFIER_KEYS = Object.freeze(Object.keys(IDENTITY_MODIFIERS));

// The lowest each field may be: damage and Energy costs may fall to 0 but
// never below, the recovery bonus never takes recovery away, and the
// interval is never zero (a tick every instant).
const FLOORS = Object.freeze({
  damageDealt: 0, damageTaken: 0, recoveryAmountBonus: 0, recoveryIntervalScale: 0.05, energyCostScale: 0,
});

// A frozen, complete modifiers object from `spec` (any of the fields above;
// left out, a field is the identity's). An unknown field, or a value that
// is not a finite number at least its floor, is refused, naming `owner`.
export function resolveModifiers(spec, owner = 'A fighter') {
  if (spec == null || spec === IDENTITY_MODIFIERS) return IDENTITY_MODIFIERS;
  const out = { ...IDENTITY_MODIFIERS };
  for (const [field, value] of Object.entries(spec)) {
    if (!Object.hasOwn(IDENTITY_MODIFIERS, field)) throw new Error(`[Alva] ${owner}: unknown modifier "${field}"`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < FLOORS[field]) {
      throw new Error(`[Alva] ${owner}: modifier ${field} must be a finite number from ${FLOORS[field]}`);
    }
    out[field] = value;
  }
  return isIdentity(out) ? IDENTITY_MODIFIERS : Object.freeze(out);
}

// Whether `m` changes nothing.
export function isIdentity(m) {
  return !m || MODIFIER_KEYS.every((k) => (m[k] ?? IDENTITY_MODIFIERS[k]) === IDENTITY_MODIFIERS[k]);
}

// What a real hit of `base` damage adds to its target's Launch Point:
// `base` x the attacker's damageDealt x the target's damageTaken (either
// side missing: the identity's). A hit of 0 stays 0.
export function hitDamage(base, attacker = IDENTITY_MODIFIERS, target = IDENTITY_MODIFIERS) {
  if (!(base > 0)) return base;
  return base * (attacker?.damageDealt ?? 1) * (target?.damageTaken ?? 1);
}

// The Launch Points one passive recovery tick takes off a fighter with `m`.
export function recoveryAmount(m = IDENTITY_MODIFIERS) {
  return LAUNCH_RECOVERY_AMOUNT + (m?.recoveryAmountBonus ?? 0);
}

// The seconds between passive recovery ticks for a fighter with `m`.
export function recoveryInterval(m = IDENTITY_MODIFIERS) {
  return LAUNCH_RECOVERY_INTERVAL * (m?.recoveryIntervalScale ?? 1);
}

// What a cost of `cost` Energy really costs a fighter with `m`.
export function energyCost(cost, m = IDENTITY_MODIFIERS) {
  return cost * (m?.energyCostScale ?? 1);
}
