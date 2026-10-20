// Hit effects: what a hit may do beyond its damage and its launch. Shared
// by every kind of hit (an attack's or one of its strikes, a projectile's,
// a technique's), validated once as the hit's definition is built and
// applied by CombatSystem.applyHit (js/game/combat/combat.js).
//
// Inputs: one hit's entry from a character definition.
// Outputs: resolveHitEffects, HIT_EFFECT_FIELDS, hitReaches, createHit
// (a hit of its own: a technique's burst, a slam's impact) and
// FLOAT_RISE_SPEED.
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
//   charm: 2.5          seconds a real hit charms its target (see
//                       CombatState.charmBy): for that long, every hit the
//                       charmed fighter would land on whoever charmed it
//                       (its strikes, its projectiles, its clones, its
//                       bursts) is no hit at all: it adds no Launch Point,
//                       launches, stuns and freezes nothing, and heals that
//                       fighter instead, taking the hit's damage off its
//                       Launch Point (see CombatSystem.applyHit). It holds
//                       nothing in place: the charmed fighter moves, jumps,
//                       Dashes and Shields as ever. The longer charm wins;
//                       a charm by another fighter replaces it. A blocked
//                       hit charms nobody, and a raised Shield still blocks
//                       a charmed fighter's hit like any other.
//   float: 1.6          seconds a real hit that launches nothing makes its
//                       target float (see CombatState.float): held as a
//                       paralysis holds it (it cannot act, its sideways
//                       speed is held at 0, its hurt pose), but lifted off
//                       the ground and rising slowly in the air,
//                       FLOAT_RISE_SPEED with no gravity, for as long as
//                       it lasts; then it falls. A hit that launches it
//                       ends it at once, as it ends a paralysis. A blocked
//                       hit floats nobody.
//   fear: 2.5           seconds a real hit frightens its target (see
//                       CombatState.frightenBy): for that long, every real
//                       hit whoever frightened it lands on it (a strike, a
//                       projectile, a clone, a burst) also feeds that
//                       fighter, taking the hit's damage off its own Launch
//                       Point (see CombatSystem.applyHit). The frightened
//                       fighter moves, acts and Shields as ever, and a
//                       blocked hit feeds nothing. The longer fear wins; a
//                       fear by another fighter replaces it. A blocked hit
//                       frightens nobody.
//   gaze: true          the hit has to be seen: it reaches only a fighter
//                       facing where it comes from (see hitReaches). One
//                       with its back turned is not met at all: its box
//                       passes it by and nothing is used up, as a quake
//                       passes a fighter off the ground. A Shield raised
//                       toward it still blocks it like any hit.
//
// For example:
//
//   burst: { hitbox: { ... }, hit: { damage: 3, paralyze: 1.8 } },
//   attack2_object: { ..., blockPush: 520 },
//   burst: { hitbox: { x: -150, y: -50, w: 300, h: 54 }, hit: { damage: 5, quake: true } },
//   burst: { hitbox: { x: -160, y: -110, w: 320, h: 130 }, hit: { damage: 1, charm: 2.5 } },
//   burst: { hitbox: { x: 0, y: -120, w: 170, h: 120 }, hit: { damage: 1, float: 1.6, gaze: true } },
//   attack5: { ..., damage: 3, fear: 2.5 },

import { resolveHitDamage, resolveHitLaunch } from '../../data/launch.js';
import { assertNoShieldBypass } from './offense.js';

// The fields a hit may declare here, with the value that changes nothing.
const DEFAULTS = Object.freeze({ paralyze: 0, blockPush: 0, quake: false, charm: 0, float: 0, fear: 0, gaze: false });

// World units per second a floating fighter rises (see `float` above): the
// same for every fighter and every hit, a slow drift up, never a launch.
export const FLOAT_RISE_SPEED = 42;

export const HIT_EFFECT_FIELDS = Object.freeze(Object.keys(DEFAULTS));

// The hit effects `spec` declares (each field its own value, or the default
// that changes nothing). A value of the wrong kind is refused, naming
// `owner`: never a guess at what was meant; so is any way past a Shield.
export function resolveHitEffects(spec, owner = 'A hit') {
  assertNoShieldBypass(spec, owner);
  const paralyze = spec?.paralyze ?? DEFAULTS.paralyze;
  const blockPush = spec?.blockPush ?? DEFAULTS.blockPush;
  const quake = spec?.quake ?? DEFAULTS.quake;
  const charm = spec?.charm ?? DEFAULTS.charm;
  const float = spec?.float ?? DEFAULTS.float;
  const fear = spec?.fear ?? DEFAULTS.fear;
  const gaze = spec?.gaze ?? DEFAULTS.gaze;
  const seconds = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!(typeof paralyze === 'number' && paralyze >= 0)) throw new Error(`[Alva] ${owner}'s paralyze must be seconds from 0`);
  if (!(typeof blockPush === 'number' && blockPush >= 0)) throw new Error(`[Alva] ${owner}'s blockPush must be a speed from 0`);
  if (typeof quake !== 'boolean') throw new Error(`[Alva] ${owner}'s quake must be true or false`);
  if (!seconds(charm)) throw new Error(`[Alva] ${owner}'s charm must be seconds from 0`);
  if (!seconds(float)) throw new Error(`[Alva] ${owner}'s float must be seconds from 0`);
  if (!seconds(fear)) throw new Error(`[Alva] ${owner}'s fear must be seconds from 0`);
  if (typeof gaze !== 'boolean') throw new Error(`[Alva] ${owner}'s gaze must be true or false`);
  return { paralyze, blockPush, quake, charm, float, fear, gaze };
}

// Whether hit `def` can reach `target` at all where it is now: always,
// but for a quake (see above), which reaches only a target standing on
// the ground, and a gaze, which reaches only a target facing `fromX`, the
// world x it comes from (its attacker's, its projectile's or its clone's;
// a target level with it faces it either way). Read wherever a hit meets
// a fighter (CombatSystem.update), before anything is used up.
export function hitReaches(def, target, fromX = null) {
  if (def?.quake && !target?.body?.grounded) return false;
  if (def?.gaze && fromX !== null && target?.body) {
    const side = Math.sign(fromX - target.body.x);
    if (side && side !== target.facing) return false;
  }
  return true;
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
