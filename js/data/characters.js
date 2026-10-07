// Character registry: the roster's one list of fighter definitions, and the
// lookups every other module uses to reach them.
//
// Purpose: each fighter's definition lives in a module of its own under
// js/data/characters/ (0001.js, 0002.js, ...): its animations, body,
// Energy, defense, attacks, projectiles, summons, techniques, touch buttons
// and ability names. Never its movement: run, jump, the triple jump, the
// Dash and the air dash are universal (js/data/movement.js). This module only
// collects them, validates each one and answers "which fighters exist" and
// "which may be played". It holds no fighter's data itself.
//
// Outputs: CHARACTERS (the list, in roster order of registration),
// getCharacter, isPlayable, getPlayableCharacter, playableCharacters,
// characterFramePaths, assertCombatRules, and the asset-path helpers framePath / frames (from
// js/data/characters/helpers.js, re-exported here so callers keep one
// import).
//
// Important constraints:
//   - CHARACTERS is a plain, mutable array and stays the same instance for
//     the whole run: tests register temporary fighters by pushing onto it
//     and splice them out again (tests/fighters/fixtures/test-fighters.mjs).
//     Never freeze it or replace it.
//   - Every definition passes assertLoadout (js/data/loadout.js),
//     assertUniversalMovement (js/data/movement.js) and assertCombatRules
//     (below) as this module loads, every problem named; one that breaks
//     the loadout rules, declares movement of its own (a `movement`
//     profile, `powers`), deals damage off the tiers (1, 3, 5, 10), gives an
//     attack an invalid repeat cooldown or sets its own Energy maximum
//     or costs never loads.
//   - A definition existing is not the same as it being playable.
//     getCharacter finds any definition (the engine and its tests build
//     fighters from it); only an `available` one is playable (isPlayable,
//     getPlayableCharacter, playableCharacters): only those are preloaded,
//     offered by a roster or started in a Battle, Watch Mode or Practice
//     Ground. With none available, every game-start route stays closed.
//   - The shared game systems read every per-fighter value from these
//     definitions; nothing about any one fighter is hard-coded in them.
//
// Adding a fighter (docs/characters/adding-characters.md has the full
// guide):
//   1. drop its frames into ./assets/characters/<id>/, each named
//      <id>_<codename>_<frame>.png (see js/data/characters/helpers.js):
//      0027_idle_1.png, 0027_attack2_3.png, 0027_midair_attack2_1.png,
//      0027_attack4_object_2.png. The codename is the universal one
//      (codename_rule), never the move's name in game;
//   2. write js/data/characters/<id>.js exporting its definition, its moves
//      keyed by the universal move codenames (MOVES in js/config.js) and
//      its loadout following js/data/loadout.js, with each hit's `damage`
//      (1, 3, 5 or 10), `baseLaunch` and `directionalLaunch`
//      (js/data/launch.js). No movement numbers: it runs, jumps and Dashes
//      exactly as every other fighter does; and no Energy maximum or costs:
//      only its refill rate is its own;
//   3. import it below and add it to CHARACTERS, with a rosterSlot of its
//      own;
//   4. give it a Discover profile in js/data/fighter-profiles.js (one 1-5
//      difficulty, a play-style description in both languages, the review
//      hash of its definition), then set `available: true` once it is ready
//      to be played.
//
// A fighter whose art comes before its combat attributes can still be
// added: an attack whose art is in is `pending` (art only, see
// js/game/combat/attacks.js).

import { assertLoadout } from './loadout.js';
import { assertUniversalMovement } from './movement.js';
import { createAttackDefinition } from '../game/combat/attacks.js';
import { resolveEnergy } from '../game/combat/combat-state.js';
import { createDeflectDefinition } from '../game/combat/deflect.js';
import { createProjectileDefinition } from '../game/combat/projectile.js';
import { createTechniqueDefinition } from '../game/combat/technique.js';
import { CHARACTER_0001 } from './characters/0001.js';
import { CHARACTER_0002 } from './characters/0002.js';

export { framePath, frames } from './characters/helpers.js';

// Every registered definition. Order is registration order only; where a
// fighter sits on the roster is its own `rosterSlot`.
export const CHARACTERS = [
  CHARACTER_0001,
  CHARACTER_0002,
];

// Any definition by id, available or not; null for an unknown id.
export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

// Whether `def` may be selected, preloaded or played.
export function isPlayable(def) {
  return !!def?.available;
}

// `id`'s definition only if it is playable: null for an unknown, missing or
// disabled fighter, so no game-start route can instantiate one.
export function getPlayableCharacter(id) {
  const def = getCharacter(id);
  return isPlayable(def) ? def : null;
}

// Every playable definition, in CHARACTERS order (empty while none is).
export function playableCharacters() {
  return CHARACTERS.filter(isPlayable);
}

// Every frame a character needs before battle: fighter poses, projectiles
// and effects, each file once (a clip may play one more than once, e.g.
// #0002's attack2, and two clips may share one).
export function characterFramePaths(def) {
  const out = [];
  for (const anim of Object.values(def.animations)) out.push(...anim.frames);
  for (const anim of Object.values(def.projectileAnimations || {})) out.push(...anim.frames);
  for (const anim of Object.values(def.effectAnimations || {})) out.push(...anim.frames);
  return [...new Set(out)];
}

// Throws, naming the move, for a definition whose combat data breaks a
// shared rule: every attack (each strike of a multi-hit one), projectile
// (its finisher too), technique burst and Deflect is built here exactly as
// the Fighter builds it, so a hit dealing anything but 1, 3, 5 or 10, an
// attack with a non-finite or negative cooldown, a Deflect off its
// fixed strike or an `energy` entry that sets its own maximum or costs is
// refused as the registry loads, not when a match first builds the
// fighter. A summon performs one of these attacks, so its hits are checked
// with them.
export function assertCombatRules(def) {
  const who = `Character "${def?.id}"`;
  for (const [id, spec] of Object.entries(def?.attacks ?? {})) createAttackDefinition({ id, ...spec });
  for (const [id, spec] of Object.entries(def?.projectiles ?? {})) createProjectileDefinition({ id, ...spec });
  for (const [id, spec] of Object.entries(def?.techniques ?? {})) createTechniqueDefinition({ id, ...spec });
  createDeflectDefinition(def?.deflect);
  resolveEnergy(def?.energy, who);
}

// No definition that breaks the attack loadout rules, declares movement of
// its own or breaks a combat rule is ever loaded.
for (const def of CHARACTERS) {
  assertLoadout(def);
  assertUniversalMovement(def);
  assertCombatRules(def);
}
