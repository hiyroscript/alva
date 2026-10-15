// Special abilities: the moves a fighter presents to the player as Special.
//
// "Special" is a player-facing classification, and a deliberate one: an
// exceptionally distinctive move whose mechanic changes how a fight goes
// (a paralysis round the fighter, a vast sphere that erases projectiles and
// passes through fighters, a heal of its own Launch Point). It is never
// inferred from how a move is built. A projectile, a pull, a tornado, a push
// or a ground eruption is not Special because of what it is, and
// neither is a move because it is executed as a technique or a summon.
//
// Each fighter names its Special moves itself, in its definition, by move
// codename (MOVES in js/config.js):
//
//   specialAbilities: ['attack4', 'attack5'],   // #0001
//   specialAbilities: [],                       // #0002
//
// Leaving the field out means none. A technique or a summon is keyed by the
// button it is, so its move codename is that button's (attack4); an
// ordinary attack's ground and mid-air versions are separate moves
// (attack2, midair_attack2), so either may be Special without the other.
//
// What reads it (the controller editor's Special abilities category,
// js/data/controller-profiles.js; the orange mark over a fighter performing
// one, js/game/rendering/fighter-status.js) asks isSpecialAbility. Nothing
// here changes what a move does: its execution type stays its loadout's
// (actionType, specialAction and specialAttacks in js/data/loadout.js, which
// combat, the CPU and the loadout rules go by), and its cooldown stays the
// cooldown policy's, derived from what it does (js/data/cooldowns.js). Shared
// code never names a fighter or a move here: a new fighter opts its own
// moves in, with no change to this module.
//
// specialAbilityProblems checks a definition's list; js/data/characters.js
// refuses to load one that names anything the fighter cannot perform.

import { COMBAT_BUTTONS, MOVES } from '../config.js';
import { specialAction } from './loadout.js';

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Every move codename `def` can really perform, on a button and where it
// is: a summon's or technique's own (on the ground), an ordinary attack's
// ground version and its mid-air one (unless that one is ground-only), an
// extra_attack wherever it may be used. An art-only (`pending`) attack is
// left out: it strikes nothing, so it cannot be Special.
export function performableMoves(def) {
  const moves = new Set();
  const actions = isObject(def?.actions) ? def.actions : {};
  const attacks = def?.attacks ?? {};
  const ready = (id) => !!attacks[id] && !attacks[id].pending;
  for (const control of COMBAT_BUTTONS) {
    const mapping = actions[control];
    if (!mapping) continue;
    const special = specialAction(def, control);
    if (special) {
      const table = special.type === 'technique' ? def.techniques : def.summons;
      if (table?.[special.id]) moves.add(special.id);
      continue;
    }
    const ground = typeof mapping === 'string' ? mapping : mapping.ground;
    const air = typeof mapping === 'string' ? mapping : mapping.air;
    if (ground && ready(ground)) moves.add(ground);
    if (air && ready(air) && !attacks[air].groundOnly) moves.add(air);
  }
  return moves;
}

// `def`'s Special moves, checked once per definition (definitions never
// change while the game runs): only the moves its `specialAbilities` names
// that it can really perform (see performableMoves), in its order.
const cache = new WeakMap();
function specialSet(def) {
  if (!isObject(def)) return new Set();
  let set = cache.get(def);
  if (!set) {
    const listed = Array.isArray(def.specialAbilities) ? def.specialAbilities : [];
    const performable = performableMoves(def);
    set = new Set(listed.filter((move) => typeof move === 'string' && performable.has(move)));
    cache.set(def, set);
  }
  return set;
}

// Whether `move` (a move codename) is one of `def`'s Special abilities:
// named in its `specialAbilities` and a move it can really perform. Never
// true for a move it has no button for, a ground-only move in the air, an
// art-only move, or anything that is not a move codename.
export function isSpecialAbility(def, move) {
  return typeof move === 'string' && specialSet(def).has(move);
}

// `def`'s Special abilities, in the order it lists them.
export function specialAbilities(def) {
  return [...specialSet(def)];
}

// Every way `def`'s `specialAbilities` breaks the rules above, one sentence
// each; empty when it keeps them (or leaves the field out).
export function specialAbilityProblems(def) {
  const problems = [];
  if (def?.specialAbilities === undefined) return problems;
  if (!Array.isArray(def.specialAbilities)) return ['`specialAbilities` must be a list of move codenames'];
  const performable = performableMoves(def);
  const seen = new Set();
  for (const move of def.specialAbilities) {
    if (typeof move !== 'string' || !Object.hasOwn(MOVES, move)) {
      problems.push(`specialAbilities names ${JSON.stringify(move)}, which is not a move codename (${Object.keys(MOVES).join(', ')})`);
    } else if (seen.has(move)) {
      problems.push(`specialAbilities names ${move} twice`);
    } else if (!performable.has(move)) {
      problems.push(`specialAbilities names ${move}, which it cannot perform (no button performs it, or it is ground-only or art only there)`);
    }
    seen.add(move);
  }
  return problems;
}

// Throws, naming every problem, if `def`'s `specialAbilities` breaks the
// rules (see specialAbilityProblems).
export function assertSpecialAbilities(def) {
  const problems = specialAbilityProblems(def);
  if (problems.length) {
    throw new Error(`[Alva] Character "${def?.id}" breaks the Special ability rules:\n- ${problems.join('\n- ')}`);
  }
}
