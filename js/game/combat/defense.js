// Defense schema: what the shared `shield` input does for a fighter.
//
// Inputs: a character definition's `defense` entry.
// Outputs: createDefenseDefinition (frozen, or null for a fighter with no
// defense: the `shield` input then does nothing for it).
// Important constraints: typed, so a future fighter can defend in another
// way; an unknown type is refused rather than treated as a Shield. The
// Fighter runs the Shield (raising, holding, slow fall; see
// js/game/fighters/fighter.js) and CombatSystem.applyHit resolves what a
// block does (js/game/combat/combat.js).
//
// `shield` is the shared player input; each character's `defense` entry says
// what it does, that is how the character defends (see
// createDefenseDefinition). The one type so far is the Shield, a held guard
// all the way round the fighter:
//
//   defense: {
//     type: 'shield',
//     groundAnimation: 'shielding', airAnimation: 'midair_shielding',
//     // Optional one-frame poses around the grounded hold:
//     groundStartAnimation: 'prepshield', groundReleaseAnimation: 'releaseshield',
//     // Optional slow fall while it is up in the air:
//     slowFallSpeed: 200, slowFallBrake: 6000,
//     // Optional: a blow it blocks freezes the attacker this long:
//     stall: 0.3,
//   }
//
// While it is up (CombatState.shielding, see Fighter.update) any hit that
// reaches the fighter's own hurtboxes, from either side, is blocked: it adds
// no Launch Point and launches nothing, and the fighter pays
// energy.shieldHitCost for that one hit instead. The Shield holds through
// the hit's hitstop and blockstun (CombatState.shieldStun), never a hurt
// pose. Holding it costs nothing; it cannot rise or stay up while the
// fighter is exhausted (CombatState.canShield).

const SHIELD_DEFAULTS = Object.freeze({
  groundAnimation: null,
  airAnimation: null,
  groundStartAnimation: null,
  groundReleaseAnimation: null,
  // A hit that lands within perfectWindow seconds of the Shield going up is
  // a perfect block: free, with no blockstun. Only a Shield raised after
  // being down for perfectRearm seconds has that window, so tapping `shield`
  // over and over never keeps one open. 0 is none.
  perfectWindow: 0,
  perfectRearm: 0,
  // Up in the air, the Shield slows the fall: a faster one brakes toward
  // slowFallSpeed (world units / s) at slowFallBrake (per second), and it
  // never falls faster while the Shield stays up. 0 is none: it falls as
  // ever.
  slowFallSpeed: 0,
  slowFallBrake: 6000,
  // A melee blow it blocks stalls in it: the attacker (never a projectile,
  // a clone or a technique, whose hits are detached) is frozen at least
  // this many seconds, the hit's own hitstop if that is longer. 0 is none:
  // the attacker freezes for the hit's hitstop, as ever.
  stall: 0,
});

// Frozen form of a character's `defense` entry, or null for a fighter that
// has none (the `shield` input then does nothing). Typed, so a future
// fighter can defend in another way; an unknown type is refused.
export function createDefenseDefinition(spec) {
  if (!spec) return null;
  if (spec.type === 'shield') return Object.freeze({ ...SHIELD_DEFAULTS, ...spec });
  throw new Error(`[Alva] Unknown defense type "${spec.type}"`);
}
