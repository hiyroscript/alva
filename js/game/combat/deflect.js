// Deflect schema: what the shared `shield` input does in the air.
//
// Inputs: a character definition's `deflect` entry.
// Outputs: createDeflectDefinition (a frozen attack definition, or null for
// a fighter with no Deflect: the `shield` input then does nothing in the
// air), DEFLECT_DAMAGE and DEFLECT_BASE_LAUNCH.
// Important constraints: a Deflect is an attack like any other (see
// createAttackDefinition in js/game/combat/attacks.js): the Fighter starts
// it on a fresh `shield` press in the air (Fighter.tryDeflect) and the
// CombatSystem resolves its strike like any melee hit, so it trades, is
// interrupted and is punished exactly as an attack is. It is never a
// Shield: CombatState.shielding stays false throughout, so nothing it does
// is blocked, perfect, held in blockstun, stalled or drawn as a Shield.
// What it adds is the attacks' `deflectProjectiles` capability (see
// CombatSystem.deflectProjectiles in js/game/combat/combat.js): while its
// strike is live its box turns back the other fighters' projectiles it
// meets.
//
// So a Deflect is both an attack and a defense (its `offense`, see
// js/game/combat/offense.js: { attack: true, defense: true }): its strike
// deals damage, launches, freezes and is cut short like any attack's, and
// a target whose Shield is up blocks it like any other; its turning back
// is a real defense, the projectile it turns back staying an attack (now
// the deflecting fighter's), blockable by its new target's Shield. Being a
// defense never makes it a Shield: it is no held guard, nothing about it is
// invulnerable, and a blow it does not turn back strikes it as it would any
// attacker. Every Deflect must turn projectiles back
// (`deflectProjectiles`), so it is always both.
//
// It costs Energy, the same for every fighter: DEFLECT_ENERGY_COST (15, see
// js/data/energy.js), paid once as it starts (Fighter.tryDeflect),
// whether it then strikes, turns a projectile back or meets nothing, and
// never while the fighter is exhausted. Nothing it does gives any back.
//
// Its strike is the same for every fighter: DEFLECT_DAMAGE (3) Launch
// Points at Base Launch DEFLECT_BASE_LAUNCH (2). A fighter authors the rest
// (its clip, timing, box, stuns, freeze, direction and the share of its
// drift it keeps, under the universal air control; it never steps in). Its
// cooldown is the cooldown policy's (js/data/cooldowns.js): none at all,
// since its 3 damage is no special class (Energy is what limits it). An
// entry may leave `cooldown` out or declare 0; any other is refused.
//
// Attack though it is, a Deflect is cancellable (its `freeCancel`, by
// explicit rule: it is a defense, see yieldsToRequests in
// js/game/combat/offense.js): from the step after it starts, in its
// startup, active phase or recovery, any valid request (another aerial, an
// air jump, an air dash) ends it the moment the replacement starts. Its box
// strikes nothing and turns nothing back after that; a projectile it has
// already turned back stays turned. Its Energy is never given back, and it
// never cancels into itself. Cancelling out of a Deflect is not cancelling
// into one: a Deflect may only cut short an attack that may be cut short
// (its hit-confirmed `hitCancel`) or itself yields. It may leave damage and
// baseLaunch out; any other value for either is refused, so no fighter's
// Deflect can drift from the rule:
//
//   deflect: {
//     animation: 'deflect',
//     startup: 1 / 15, active: 2 / 15, recovery: 2 / 15,
//     hitbox: { x: 6, y: -118, w: 44, h: 98 },
//     directionalLaunch: 'vertical', hitstun: 0.32, blockstun: 0.14, hitstop: 0.06,
//     airMomentum: 0.7,
//     deflectProjectiles: true,
//   }
//
// A Deflect is one strike in the air: a multi-hit string (`hits`), a
// thrown projectile, a ground-only or a pending one is refused, and so is
// one without a hitbox or a clip, or one that does not turn projectiles
// back (`deflectProjectiles: false`).

import { createAttackDefinition } from './attacks.js';

// Every Deflect's strike: its damage (the Launch Point it adds, the solid
// tier of ALLOWED_DAMAGE_VALUES) and its Base Launch (see js/data/launch.js).
export const DEFLECT_DAMAGE = 3;
export const DEFLECT_BASE_LAUNCH = 2;

// What a Deflect may not declare: anything that would make it more than
// one strike in the air.
const DEFLECT_REFUSED = Object.freeze(['hits', 'projectile', 'pending']);

// Frozen attack definition (id 'deflect') from a character's `deflect`
// entry, or null for a fighter that has none.
export function createDeflectDefinition(spec) {
  if (!spec) return null;
  const owner = 'Deflect';
  const declared = DEFLECT_REFUSED.filter((field) => spec[field] !== undefined);
  if (declared.length) throw new Error(`[Alva] ${owner} declares ${declared.join(', ')}: a Deflect is one strike`);
  if (spec.groundOnly) throw new Error(`[Alva] ${owner} is ground-only: a Deflect is the air's`);
  if (spec.damage !== undefined && spec.damage !== DEFLECT_DAMAGE) {
    throw new Error(`[Alva] ${owner} declares damage ${spec.damage}: every Deflect deals ${DEFLECT_DAMAGE}`);
  }
  if (spec.baseLaunch !== undefined && spec.baseLaunch !== DEFLECT_BASE_LAUNCH) {
    throw new Error(`[Alva] ${owner} declares Base Launch ${spec.baseLaunch}: every Deflect has Base Launch ${DEFLECT_BASE_LAUNCH}`);
  }
  if (!spec.animation) throw new Error(`[Alva] ${owner} needs an animation`);
  if (!spec.hitbox) throw new Error(`[Alva] ${owner} needs a hitbox`);
  if (spec.deflectProjectiles === false) throw new Error(`[Alva] ${owner} declares deflectProjectiles: false: a Deflect turns projectiles back`);
  return createAttackDefinition({
    ...spec, id: 'deflect', damage: DEFLECT_DAMAGE, baseLaunch: DEFLECT_BASE_LAUNCH, groundOnly: false, deflectProjectiles: true,
  });
}
