// Defense schema: what the shared `shield` input does for a fighter on the
// ground.
//
// Inputs: a character definition's `defense` entry.
// Outputs: createDefenseDefinition (frozen, or null for a fighter with no
// defense: the `shield` input then does nothing for it on the ground).
// Important constraints: typed, so a future fighter can defend in another
// way; an unknown type is refused rather than treated as a Shield. The
// Fighter runs the Shield (raising, holding, lowering; see
// js/game/fighters/fighter.js) and CombatSystem.applyHit resolves what a
// block does (js/game/combat/combat.js). In the air the same input is
// the fighter's Deflect instead (its `deflect` entry, an attack: see
// js/game/combat/deflect.js), never a Shield: no fighter Shields in the
// air.
//
// `shield` is the shared player input; each character's `defense` entry says
// what it does on the ground, that is how the character defends (see
// createDefenseDefinition). The one type so far is the Shield, a held guard
// all the way round the fighter:
//
//   defense: {
//     type: 'shield',
//     groundAnimation: 'shielding',
//     // Optional one-frame poses around the hold:
//     groundStartAnimation: 'prepshield', groundReleaseAnimation: 'releaseshield',
//     // Optional: a blow it blocks freezes the attacker this long:
//     stall: 0.3,
//   }
//
// While it is up (CombatState.shielding, see Fighter.update) any hit that
// reaches the fighter's own hurtboxes, from either side, is blocked: it adds
// no Launch Point and launches nothing, and the fighter pays
// BLOCK_ENERGY_COST (15, the same for every fighter and every block, a
// perfect one's included: see js/game/combat/combat-state.js) for that one
// hit instead. The Shield holds through
// the hit's hitstop and blockstun (CombatState.shieldStun), never a hurt
// pose. Holding it costs nothing; it cannot rise or stay up while the
// fighter is exhausted (CombatState.canShield), nor once it is off the
// ground.

const SHIELD_DEFAULTS = Object.freeze({
  groundAnimation: null,
  groundStartAnimation: null,
  groundReleaseAnimation: null,
  // A hit that lands within perfectWindow seconds of the Shield going up is
  // a perfect block: no blockstun, so its fighter can answer at once. It
  // costs the same Energy as any block (no discount, nothing given back).
  // Only a Shield raised after
  // being down for perfectRearm seconds has that window, so tapping `shield`
  // over and over never keeps one open. 0 is none.
  perfectWindow: 0,
  perfectRearm: 0,
  // A melee blow it blocks stalls in it: the attacker (never a projectile,
  // a clone or a technique, whose hits are detached) is frozen at least
  // this many seconds, the hit's own hitstop if that is longer. 0 is none:
  // the attacker freezes for the hit's hitstop, as ever.
  stall: 0,
});

// What a Shield may not declare: an air Shield and its slow fall. There is
// none, so naming one is refused rather than quietly ignored.
const SHIELD_REFUSED = Object.freeze(['airAnimation', 'slowFallSpeed', 'slowFallBrake']);

// Frozen form of a character's `defense` entry, or null for a fighter that
// has none (the `shield` input then does nothing on the ground). Typed, so
// a future fighter can defend in another way; an unknown type is refused.
export function createDefenseDefinition(spec) {
  if (!spec) return null;
  if (spec.type === 'shield') {
    const declared = SHIELD_REFUSED.filter((field) => spec[field] !== undefined);
    if (declared.length) {
      throw new Error(`[Alva] A Shield declares ${declared.join(', ')}: there is no Shield in the air (the air's is the Deflect)`);
    }
    return Object.freeze({ ...SHIELD_DEFAULTS, ...spec });
  }
  throw new Error(`[Alva] Unknown defense type "${spec.type}"`);
}
