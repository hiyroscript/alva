// Test-only fighters for the shared cooldown runtimes (imported by the
// *.test.mjs files; not a test file itself, and never in the game). No
// fighter on the roster has a technique cooldown any more (#0001's
// Unlimited Void and Hollow Purple have none), but the runtime that runs
// one (CombatState.abilityCooldowns, the A4 / A5 rings over a fighter) is
// shared and stays for any fighter that declares one. These exercise it.
import { getCharacter } from '../../../js/data/characters.js';

const BASE = getCharacter('0001');

// #0001 with cooldowns on its techniques: Unlimited Void 14 s and Hollow
// Purple 12 s (the lengths #0001 itself once had), everything else its own.
export const COOLING_CASTER = Object.freeze({
  ...BASE,
  id: 'test-cooling-caster',
  displayName: 'Cooling Caster',
  available: false,
  rosterSlot: null,
  techniques: {
    attack4: { ...BASE.techniques.attack4, cooldown: 14 },
    attack5: { ...BASE.techniques.attack5, cooldown: 12 },
  },
});
