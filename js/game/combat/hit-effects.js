// Hit effects: what a hit may do beyond its damage and its launch. Shared
// by every kind of hit (an attack's or one of its strikes, a projectile's,
// a technique's), validated once as the hit's definition is built and
// applied by CombatSystem.applyHit (js/game/combat/combat.js).
//
// Inputs: one hit's entry from a character definition.
// Outputs: resolveHitEffects and HIT_EFFECT_FIELDS.
// Important constraints: every field is optional and its default changes
// nothing, so a hit that declares none of them resolves exactly as it
// always did. Nothing here names a fighter or a move.
//
//   unblockable: true   a raised Shield does not stop it: it lands in full
//                       (Launch Point, launch, stun) on a shielding target,
//                       and the Shield pays nothing for it.
//   paralyze: 1.5       seconds a real hit holds its target in place (see
//                       CombatState.paralyze): it cannot act, its sideways
//                       speed is held at 0 and it shows its hurt pose, as
//                       long as the paralysis lasts or until a hit launches
//                       it, whichever comes first (a launch is never held
//                       back by it). Hits that launch nothing keep it.
//   blockPush: 520      world units / s a Shield that blocks the hit is
//                       still shoved along the hit's direction: the guard
//                       holds, the ground under it does not.
//
// For example:
//
//   explosionHit: { damage: 3, unblockable: true, paralyze: 1.8, hitstun: 0.3 },
//   attack2: { ..., blockPush: 520 },

// The fields a hit may declare here, with the value that changes nothing.
const DEFAULTS = Object.freeze({ unblockable: false, paralyze: 0, blockPush: 0 });

export const HIT_EFFECT_FIELDS = Object.freeze(Object.keys(DEFAULTS));

// The hit effects `spec` declares (each field its own value, or the default
// that changes nothing). A value of the wrong kind is refused, naming
// `owner`: never a guess at what was meant.
export function resolveHitEffects(spec, owner = 'A hit') {
  const unblockable = spec?.unblockable ?? DEFAULTS.unblockable;
  const paralyze = spec?.paralyze ?? DEFAULTS.paralyze;
  const blockPush = spec?.blockPush ?? DEFAULTS.blockPush;
  if (typeof unblockable !== 'boolean') throw new Error(`[Alva] ${owner}'s unblockable must be true or false`);
  if (!(typeof paralyze === 'number' && paralyze >= 0)) throw new Error(`[Alva] ${owner}'s paralyze must be seconds from 0`);
  if (!(typeof blockPush === 'number' && blockPush >= 0)) throw new Error(`[Alva] ${owner}'s blockPush must be a speed from 0`);
  return { unblockable, paralyze, blockPush };
}
