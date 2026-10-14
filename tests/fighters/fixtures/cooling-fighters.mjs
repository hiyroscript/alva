// Test-only fighters for the shared cooldown runtimes (imported by the
// *.test.mjs files; not a test file itself, and never in the game). The
// runtime that runs a technique's cooldown (CombatState.abilityCooldowns,
// the A4 / A5 rings over a fighter) is shared; this caster exercises it
// apart from the roster: #0001's own techniques, whose cooldowns the
// cooldown policy derives (js/data/cooldowns.js): Unlimited Void 3 s (its
// paralysis) and Hollow Purple 5 s (its 10-damage sphere).
import { getCharacter } from '../../../js/data/characters.js';
import { createTechniqueDefinition } from '../../../js/game/combat/technique.js';

const BASE = getCharacter('0001');

export const COOLING_CASTER = Object.freeze({
  ...BASE,
  id: 'test-cooling-caster',
  displayName: 'Cooling Caster',
  available: false,
  rosterSlot: null,
});

// The cooldown the policy gives `caster`'s technique `id`, in seconds.
export function techniqueCooldown(caster, id) {
  return createTechniqueDefinition({ id, ...caster.techniques[id] }, { projectiles: caster.projectiles }).cooldown;
}
