// Character registry: the roster's one list of fighter definitions, and the
// lookups every other module uses to reach them.
//
// Purpose: each fighter's definition lives in a module of its own under
// js/data/characters/ (0001.js, 0002.js, ...): its animations, body,
// movement profile, Powers, Energy, defense, attacks, projectiles,
// summons, techniques, touch buttons and ability names. This module only
// collects them, validates each one and answers "which fighters exist" and
// "which may be played". It holds no fighter's data itself.
//
// Outputs: CHARACTERS (the list, in roster order of registration),
// getCharacter, isPlayable, getPlayableCharacter, playableCharacters,
// characterFramePaths, and the asset-path helpers framePath / frames (from
// js/data/characters/helpers.js, re-exported here so callers keep one
// import).
//
// Important constraints:
//   - CHARACTERS is a plain, mutable array and stays the same instance for
//     the whole run: tests register temporary fighters by pushing onto it
//     and splice them out again (tests/fighters/fixtures/test-fighters.mjs).
//     Never freeze it or replace it.
//   - Every definition passes assertLoadout (js/data/loadout.js) as this
//     module loads, every problem named; one that breaks the loadout rules
//     never loads.
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
//      its loadout following js/data/loadout.js, with its own Power tiers
//      (js/data/powers.js), movement profile and each hit's `damage`,
//      `baseLaunch` and `directionalLaunch` (js/data/launch.js);
//   3. import it below and add it to CHARACTERS, with a rosterSlot of its
//      own;
//   4. set `available: true` once it is ready to be played.
//
// A fighter whose art comes before its combat attributes can still be
// added: an attack whose art is in is `pending` (art only, see
// js/game/combat/attacks.js). What the engine cannot build a fighter
// without, its `powers` and `movement`, is still its own.

import { assertLoadout } from './loadout.js';
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
// and effects, each file once (two clips may share one, e.g. #0001's
// attack4_12 in attack4_release and attack4_whiff_release).
export function characterFramePaths(def) {
  const out = [];
  for (const anim of Object.values(def.animations)) out.push(...anim.frames);
  for (const anim of Object.values(def.projectileAnimations || {})) out.push(...anim.frames);
  for (const anim of Object.values(def.effectAnimations || {})) out.push(...anim.frames);
  return [...new Set(out)];
}

// No definition that breaks the attack loadout rules is ever loaded.
for (const def of CHARACTERS) assertLoadout(def);
