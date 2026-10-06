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
// is blocked, perfect, paid for in Energy, held in blockstun, stalled or
// drawn as a Shield. What it adds is the attacks' `deflectProjectiles`
// capability (see CombatSystem.deflectProjectiles in
// js/game/combat/combat.js): while its strike is live its box turns back
// the other fighters' projectiles it meets.
//
// Its strike is the same for every fighter: DEFLECT_DAMAGE (3) Launch
// Points at Base Launch DEFLECT_BASE_LAUNCH (2). A fighter authors the rest
// (its clip, timing, box, stuns, freeze, direction, cooldown, movement),
// and may leave damage and baseLaunch out; any other value for either is
// refused, so no fighter's Deflect can drift from the rule:
//
//   deflect: {
//     animation: 'deflect',
//     startup: 1 / 15, active: 2 / 15, recovery: 2 / 15,
//     hitbox: { x: 6, y: -118, w: 44, h: 98 },
//     directionalLaunch: 'vertical', hitstun: 0.32, blockstun: 0.14, hitstop: 0.06,
//     cooldown: 0.3, airMomentum: 0.7, airControl: 0.3,
//     deflectProjectiles: true,
//   }
//
// A Deflect is one strike in the air: a multi-hit string (`hits`), a
// thrown projectile, a ground-only or a pending one is refused, and so is
// one without a hitbox or a clip.

import { createAttackDefinition } from './attacks.js';

// Every Deflect's strike: its damage (the Launch Point it adds) and its
// Base Launch (see js/data/launch.js).
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
  return createAttackDefinition({
    ...spec, id: 'deflect', damage: DEFLECT_DAMAGE, baseLaunch: DEFLECT_BASE_LAUNCH, groundOnly: false,
  });
}
