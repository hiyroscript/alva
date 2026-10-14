// Hit effects: what a hit may do beyond its damage and its launch. Shared
// by every kind of hit (an attack's or one of its strikes, a projectile's,
// a technique's), validated once as the hit's definition is built and
// applied by CombatSystem.applyHit (js/game/combat/combat.js).
//
// Inputs: one hit's entry from a character definition.
// Outputs: resolveHitEffects, HIT_EFFECT_FIELDS, hitReaches and createHit
// (a hit of its own: a technique's burst, a slam's impact).
// Important constraints: every field is optional and its default changes
// nothing, so a hit that declares none of them resolves exactly as it
// always did. Nothing here names a fighter or a move. No hit effect gets
// past an active Shield: a hit a Shield blocks applies none of its
// offensive effects, and a field that would let it through (`unblockable`
// and the rest of SHIELD_BYPASS_FIELDS, js/game/combat/offense.js) is
// refused here, never quietly ignored.
//
//   paralyze: 1.5       seconds a real hit holds its target in place (see
//                       CombatState.paralyze): it cannot act, its sideways
//                       speed is held at 0 and it shows its hurt pose, as
//                       long as the paralysis lasts or until a hit launches
//                       it, whichever comes first (a launch is never held
//                       back by it). Hits that launch nothing keep it. A
//                       blocked hit paralyzes nobody.
//   blockPush: 520      world units / s a Shield that blocks the hit is
//                       still shoved along the hit's direction: the guard
//                       holds, the ground under it does not. It adds no
//                       Launch Point, stun or launch: only the shove.
//   quake: true         the hit runs through the ground: it reaches only a
//                       fighter standing on the ground as it lands (see
//                       hitReaches). An airborne one is not met at all: its
//                       box passes it by and nothing is used up (a strike
//                       stays live, a projectile flies on), so jumping
//                       clears it. A Shield, raised on the ground, still
//                       blocks it like any hit.
//
// For example:
//
//   burst: { hitbox: { ... }, hit: { damage: 3, paralyze: 1.8 } },
//   attack2_object: { ..., blockPush: 520 },
//   burst: { hitbox: { x: -150, y: -50, w: 300, h: 54 }, hit: { damage: 5, quake: true } },

import { resolveHitDamage, resolveHitLaunch } from '../../data/launch.js';
import { assertNoShieldBypass } from './offense.js';

// The fields a hit may declare here, with the value that changes nothing.
const DEFAULTS = Object.freeze({ paralyze: 0, blockPush: 0, quake: false });

export const HIT_EFFECT_FIELDS = Object.freeze(Object.keys(DEFAULTS));

// The hit effects `spec` declares (each field its own value, or the default
// that changes nothing). A value of the wrong kind is refused, naming
// `owner`: never a guess at what was meant; so is any way past a Shield.
export function resolveHitEffects(spec, owner = 'A hit') {
  assertNoShieldBypass(spec, owner);
  const paralyze = spec?.paralyze ?? DEFAULTS.paralyze;
  const blockPush = spec?.blockPush ?? DEFAULTS.blockPush;
  const quake = spec?.quake ?? DEFAULTS.quake;
  if (!(typeof paralyze === 'number' && paralyze >= 0)) throw new Error(`[Alva] ${owner}'s paralyze must be seconds from 0`);
  if (!(typeof blockPush === 'number' && blockPush >= 0)) throw new Error(`[Alva] ${owner}'s blockPush must be a speed from 0`);
  if (typeof quake !== 'boolean') throw new Error(`[Alva] ${owner}'s quake must be true or false`);
  return { paralyze, blockPush, quake };
}

// Whether hit `def` can reach `target` at all where it is now: always,
// but for a quake (see above), which reaches only a target standing on
// the ground. Read wherever a hit meets a fighter (CombatSystem.update),
// before anything is used up.
export function hitReaches(def, target) {
  return !def?.quake || !!target?.body?.grounded;
}

// The stuns and freeze a hit of its own has when it declares none.
const HIT_DEFAULTS = Object.freeze({
  baseLaunch: 0,
  directionalLaunch: null,
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
});

// A frozen hit of its own, `id`, from its entry `spec` (null for none),
// validated exactly as an attack's: its damage one of the tiers, its
// launch, its hit effects, and no way past a Shield. A technique's burst
// hit (js/game/combat/technique.js) and a slam's impact
// (js/game/combat/attacks.js) are built here. `owner` names it in errors.
export function createHit(id, spec, owner = `Hit "${id}"`) {
  if (!spec) return null;
  return Object.freeze({
    ...HIT_DEFAULTS, ...spec, id,
    damage: resolveHitDamage(spec.damage, owner), ...resolveHitLaunch(spec, owner), ...resolveHitEffects(spec, owner),
  });
}
