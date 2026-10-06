// Attack loadouts: which numbered attacks a character has and what each of
// their buttons does.
//
// Every character's moves go by the same universal codenames (MOVES in
// js/config.js), whatever it calls them in game:
//
//   attack1 ... attack5     the numbered attacks: attack1 and attack2
//                           always, at most five, and contiguous from
//                           attack1 to the highest one
//   midair_attack1 ... 5    an ordinary numbered attack's mid-air version
//   extra_attack            one optional special attack of the character's
//                           own (a throw, a projectile, a utility move),
//                           never counted among the numbered ones
//   transform               reserved
//
// The one rule: a numbered attack the fighter has is a numbered combat
// button the player presses directly. Nothing else reaches one: no held
// stance, modifier or other button. Its `actions` entry says which kind of
// move the button is (ACTION_TYPES):
//
//   an ordinary attack   { ground: 'attackN', air: 'midair_attackN' }:
//                        attackN on the ground, its mid-air version in the
//                        air (both in `attacks`)
//   a summon             { type: 'summon', id: 'attackN' }: sends out the
//                        detached entity `summons.attackN` (js/game/combat/summon.js)
//   a technique          { type: 'technique', id: 'attackN' }: the fighter
//                        itself performs the multi-phase move
//                        `techniques.attackN` (js/game/combat/technique.js)
//
// A summon or a technique is ground-only and has no mid-air version; each
// has its own cooldown. attack1 and attack2 are always ordinary attacks;
// attack3 to attack5 may be any of the three. #0001, for example:
//
//   actions: {
//     attack1: { ground: 'attack1', air: 'midair_attack1' },
//     attack2: { ground: 'attack2', air: 'midair_attack2' },
//     attack3: { ground: 'attack3', air: 'midair_attack3' },
//     attack4: { type: 'technique', id: 'attack4' },
//     attack5: { type: 'technique', id: 'attack5' },
//   }
//
// So a fighter with N numbered attacks has exactly N numbered buttons,
// attack1 to attackN, whatever kind each one is.
//
// Anything an attack creates is named after it with `object`: a projectile
// `<attack>_object` (an ordinary attack's or a technique's), and the art of
// a summon `<attack>_object...` (its effect clips), so a fighter's data and
// files read the same whatever its moves are called.
//
// loadoutProblems checks a definition against every one of these rules;
// js/data/characters.js refuses to load one that breaks any.

import { COMBAT_BUTTONS, MOVES, NUMBERED_ATTACKS } from '../config.js';
import { TECHNIQUE_CLIPS } from '../game/combat/technique.js';

export { NUMBERED_ATTACKS };

// Fewest numbered attacks a character has (attack1 and attack2); the most
// is NUMBERED_ATTACKS.length.
export const MIN_NUMBERED_ATTACKS = 2;

// The one special attack outside the numbered ones.
export const EXTRA_ATTACK = 'extra_attack';

// The kinds of move a numbered button may be (see above).
export const ACTION_TYPES = Object.freeze(['attack', 'summon', 'technique']);

// The numbered buttons that are always ordinary attacks.
const ORDINARY_ONLY = Object.freeze(['attack1', 'attack2']);

// The mid-air version of numbered attack `attack` (midair_attack3 for attack3).
export const midairAttack = (attack) => `midair_${attack}`;

// Whether `id` is one of the numbered attacks.
export const isNumberedAttack = (id) => NUMBERED_ATTACKS.includes(id);

// The codename an attack's own objects start with (see above).
export const objectOf = (attack) => `${attack}_object`;

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Which kind of move `def`'s `action` button is (ACTION_TYPES): 'summon' or
// 'technique' for a typed entry, 'attack' for any other mapped button, null
// for one it does not have or that is reserved (null).
export function actionType(def, action) {
  const mapping = def?.actions?.[action];
  if (!mapping) return null;
  return isObject(mapping) && Object.hasOwn(mapping, 'type') ? mapping.type : 'attack';
}

// `def`'s summon or technique on `action`'s button ({ type, id }), or null
// for any other button.
export function specialAction(def, action) {
  const type = actionType(def, action);
  return type === 'summon' || type === 'technique' ? def.actions[action] : null;
}

// The numbered attacks `def` gives a button of its own, in order: the ones
// in its `actions`. Every numbered attack it has is one of them.
export function attackButtons(def) {
  const actions = def?.actions ?? {};
  return NUMBERED_ATTACKS.filter((id) => Object.hasOwn(actions, id));
}

// Every numbered attack `def` has, in order: exactly its numbered buttons.
export function numberedAttacks(def) {
  return attackButtons(def);
}

// The numbered buttons that are a summon or a technique, in order.
export function specialAttacks(def) {
  return attackButtons(def).filter((id) => specialAction(def, id));
}

// What `def`'s loadout comes to: its numbered attacks (every one a button),
// the ordinary ones' mid-air versions, the kind of move each button is, and
// whether it has an extra_attack.
export function describeLoadout(def) {
  const buttons = attackButtons(def);
  return {
    numbered: numberedAttacks(def),
    buttons,
    air: Object.fromEntries(buttons.filter((id) => actionType(def, id) === 'attack').map((id) => [id, midairAttack(id)])),
    types: Object.fromEntries(buttons.map((id) => [id, actionType(def, id)])),
    extra: !!def?.actions?.[EXTRA_ATTACK],
  };
}

// Every way `def` breaks the loadout rules above, one sentence each; empty
// when it keeps them all. Checks its buttons, the numbered attacks they
// come to, that every move they name exists with the art it plays, and that
// everything an attack creates is named after it.
export function loadoutProblems(def) {
  const problems = [];
  const say = (text) => problems.push(text);
  const actions = isObject(def?.actions) ? def.actions : {};
  const attacks = def?.attacks ?? {};
  const animations = def?.animations ?? {};
  const effects = def?.effectAnimations ?? {};
  const projectileArt = def?.projectileAnimations ?? {};
  if (!isObject(def?.actions)) say('it has no `actions`');

  // A move a button or a summon names must be defined (its clip is checked
  // with every attack's, below).
  const needAttack = (id, where) => {
    if (!attacks[id]) say(`${where} names attack "${id}", which is not in \`attacks\``);
  };

  // A summon's data and art, for button `id`.
  const checkSummon = (id) => {
    const summon = def?.summons?.[id];
    if (!summon) {
      say(`actions.${id} summons ${id}, which is not in \`summons\``);
      return;
    }
    needAttack(summon.attack, `summon ${id}`);
    if (summon.noGround) needAttack(summon.noGround.attack, `summon ${id}'s noGround`);
    if (!effects[summon.cloud]) say(`summon ${id}'s cloud "${summon.cloud}" is not in \`effectAnimations\``);
    else if (!summon.cloud.startsWith(objectOf(id))) say(`summon ${id}'s cloud "${summon.cloud}" is not named ${objectOf(id)}`);
  };

  // A technique's data and art, for button `id`: its clips named after it,
  // something to release, and its projectile named after it with art.
  const checkTechnique = (id) => {
    const technique = def?.techniques?.[id];
    if (!technique) {
      say(`actions.${id} performs ${id}, which is not in \`techniques\``);
      return;
    }
    for (const field of TECHNIQUE_CLIPS) {
      const key = technique[field];
      if (!animations[key]) say(`technique ${id}'s ${field} "${key}" is not in \`animations\``);
      else if (!key.startsWith(`${id}_`)) say(`technique ${id}'s ${field} "${key}" is not named ${id}_...`);
    }
    if (!technique.projectile && !technique.burst) say(`technique ${id} releases nothing (no projectile and no burst)`);
    const shot = technique.projectile;
    if (shot) {
      if (shot.id !== objectOf(id)) say(`technique ${id} releases "${shot.id}": its projectile is ${objectOf(id)}`);
      const projectile = def?.projectiles?.[shot.id];
      if (!projectile) say(`technique ${id} releases "${shot.id}", which is not in \`projectiles\``);
      else if (!projectileArt[projectile.animation]) say(`projectile "${shot.id}" plays "${projectile.animation}", which is not in \`projectileAnimations\``);
    }
    const burst = technique.burst;
    if (burst && (!burst.hitbox || !burst.hit)) say(`technique ${id}'s burst needs a hitbox and a hit`);
  };

  // ---- Buttons ----------------------------------------------------------------
  for (const [button, mapping] of Object.entries(actions)) {
    if (!COMBAT_BUTTONS.includes(button)) {
      say(`actions.${button} is not a combat button (${COMBAT_BUTTONS.join(', ')})`);
    } else if (isNumberedAttack(button)) {
      const air = midairAttack(button);
      const type = actionType(def, button);
      if (type === 'attack') {
        // An ordinary numbered attack always has its mid-air version.
        if (!isObject(mapping) || mapping.ground !== button || mapping.air !== air) {
          say(`actions.${button} must be { ground: '${button}', air: '${air}' }, a summon or a technique`);
        } else {
          needAttack(button, `actions.${button}`);
          needAttack(air, `actions.${button}`);
        }
      } else if (ORDINARY_ONLY.includes(button)) {
        say(`actions.${button} must be an ordinary attack ({ ground: '${button}', air: '${air}' })`);
      } else if (type !== 'summon' && type !== 'technique') {
        say(`actions.${button} has type ${JSON.stringify(mapping?.type)} (summon or technique)`);
      } else if (mapping.id !== button || Object.keys(mapping).some((key) => key !== 'type' && key !== 'id')) {
        say(`actions.${button} must be { type: '${type}', id: '${button}' }: a ${type} is keyed by the button it is`);
      } else if (type === 'summon') {
        checkSummon(button);
      } else {
        checkTechnique(button);
      }
    } else if (mapping !== null) {
      // extra_attack and transform: their own move, or null (reserved).
      if (mapping !== button) say(`actions.${button} must be '${button}' or null`);
      else needAttack(button, `actions.${button}`);
    }
  }
  for (const id of ORDINARY_ONLY) {
    if (!Object.hasOwn(actions, id)) say(`${id} needs a button of its own (actions.${id})`);
  }

  // ---- The numbered attacks they come to --------------------------------------------
  const numbered = numberedAttacks(def);
  const most = NUMBERED_ATTACKS.length;
  if (numbered.length < MIN_NUMBERED_ATTACKS || numbered.length > most) {
    say(`it has ${numbered.length} numbered attacks (${numbered.join(', ') || 'none'}): ${MIN_NUMBERED_ATTACKS} to ${most}`);
  }
  if (numbered.some((id, i) => id !== NUMBERED_ATTACKS[i])) {
    say(`its numbered attacks (${numbered.join(', ')}) are not attack1 to attack${numbered.length} in a row`);
  }

  // ---- Moves, and what they create ----------------------------------------------------
  for (const [id, atk] of Object.entries(attacks)) {
    if (!Object.hasOwn(MOVES, id)) {
      say(`attacks.${id} is not a move codename (${Object.keys(MOVES).join(', ')})`);
      continue;
    }
    if (atk.animation && !animations[atk.animation]) say(`attack "${id}" plays "${atk.animation}", which is not in \`animations\``);
    const shot = atk.projectile;
    if (!shot) continue;
    if (shot.id !== objectOf(id)) say(`attack "${id}" throws "${shot.id}": its projectile is ${objectOf(id)}`);
    const projectile = def?.projectiles?.[shot.id];
    if (!projectile) say(`attack "${id}" throws "${shot.id}", which is not in \`projectiles\``);
    else if (!projectileArt[projectile.animation]) say(`projectile "${shot.id}" plays "${projectile.animation}", which is not in \`projectileAnimations\``);
  }
  // Every summon and technique is some button's: none is left unreachable.
  for (const [kind, type, table] of [['summons', 'summon', def?.summons], ['techniques', 'technique', def?.techniques]]) {
    for (const id of Object.keys(table ?? {})) {
      if (actionType(def, id) !== type) say(`${kind}.${id} is no button's: actions.${id} is not { type: '${type}', id: '${id}' }`);
    }
  }
  const owned = (key) => Object.keys(MOVES).some((move) => key.startsWith(objectOf(move)));
  for (const [kind, table] of [['projectiles', def?.projectiles], ['projectileAnimations', projectileArt], ['effectAnimations', effects]]) {
    for (const key of Object.keys(table ?? {})) {
      if (!owned(key)) say(`${kind}.${key} is not named after the attack that creates it (<attack>_object...)`);
    }
  }
  return problems;
}

// Throws, naming every problem, if `def` breaks the loadout rules (see
// loadoutProblems).
export function assertLoadout(def) {
  const problems = loadoutProblems(def);
  if (problems.length) {
    throw new Error(`[Alva] Character "${def?.id}" breaks the attack loadout rules:\n- ${problems.join('\n- ')}`);
  }
}
