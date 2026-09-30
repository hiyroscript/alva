// Test-only fighters (imported by the *.test.mjs files; not a test file
// itself, and never in the game). A screen test that needs fighters of its
// own to pick, preview, practise with or watch registers these for its own
// run: #0001's definition and art (borrowed: they are not what those tests
// check) under neutral ids, marked available (all but TEST_DISABLED), in
// roster slots of their own (slot 01 stays #0001's and slot 02 #0002's).
// Every one registered is taken out again, so the exported CHARACTERS array
// ends each run as it started.
import { after } from 'node:test';
import { CHARACTERS, getCharacter } from '../js/data/characters.js';
import { SAMPLE_FIGHTER } from './sample-fighter.mjs';

const BASE = getCharacter('0001');

// A playable copy of #0001 as `id`, named `displayName`, in roster slot
// `rosterSlot` (0-based), with `overrides` on top.
export function testFighter(id, displayName, rosterSlot, overrides = {}) {
  return { ...BASE, id, displayName, rosterSlot, available: true, ...overrides };
}

// The two the screen tests pick from: slots 09 and 03.
export const TEST_A = testFighter('test-a', 'Test A', 8);
export const TEST_B = testFighter('test-b', 'Test B', 2);

// A fighter with no moves at all (slot 04): every combat button left out of
// its `actions`, so no touch button, attack, Charge replacement, projectile
// or Shield. It still moves, jumps, falls and is hit like any fighter. On
// purpose it breaks the loadout rules (no attack1 or attack2; see
// js/data/loadout.js, which the game's own definitions must pass): a
// robustness fixture, proving the screens, the touch controls and the CPU
// survive a fighter with nothing to press.
export const TEST_MOVELESS = testFighter('test-moveless', 'Moveless', 3, {
  actions: {}, attacks: {}, chargeReplacements: {}, summons: {}, chargedTechniques: {},
  projectiles: {}, projectileAnimations: {}, effectAnimations: {}, mobileAbilities: {}, abilityNames: {}, defense: null,
});

// The sample fighter's different moves and names (see sample-fighter.mjs),
// playable, in slot 05.
export const TEST_SAMPLE = { ...SAMPLE_FIGHTER, id: 'test-sample', displayName: 'Sample', rosterSlot: 4, available: true };

// A fighter that exists but is disabled (`available: false`, slot 07): the
// definition no route may start, and the roster shows locked.
export const TEST_DISABLED = testFighter('test-disabled', 'Disabled', 6, { available: false });

// The ids of the fighters removed from the roster: slot 03's. Only ever
// checked for absence: no definition, art, string or credit of theirs may
// come back, and a stale selection naming one must be refused. (Slot 02's
// was removed too, and its id now belongs to the new #0002.)
export const REMOVED_IDS = Object.freeze(['0003']);

// Adds `defs` to CHARACTERS, after the production entries. Returns the
// function that takes exactly those out again.
export function registerTestFighters(...defs) {
  CHARACTERS.push(...defs);
  return () => {
    for (const def of defs) {
      const i = CHARACTERS.indexOf(def);
      if (i >= 0) CHARACTERS.splice(i, 1);
    }
  };
}

// Registers `defs` for the rest of the calling test file, and takes them out
// once its last test has ended. Call it before any roster is built.
export function useTestFighters(...defs) {
  after(registerTestFighters(...defs));
}

// Runs `fn` (sync or async) with `defs` registered, and takes them out
// afterwards whatever happens.
export async function withTestFighters(defs, fn) {
  const unregister = registerTestFighters(...defs);
  try {
    return await fn();
  } finally {
    unregister();
  }
}
