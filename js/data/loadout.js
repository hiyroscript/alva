// Attack loadouts: which numbered attacks a character has, which of them
// have a button of their own, and which Charge reaches instead.
//
// Every character's moves go by the same universal codenames (MOVES in
// js/config.js), whatever it calls them in game:
//
//   attack1 ... attack5     the numbered attacks: attack1 and attack2
//                           always, at most five, and contiguous from
//                           attack1 to the highest one
//   midair_attack1 ... 5    each numbered attack's mid-air version
//   extra_attack            one optional special attack of the character's
//                           own (a throw, a projectile, a utility move),
//                           never counted among the numbered ones
//   transform               reserved
//
// Whether attack3 or attack4 is a button of its own or what Charge makes of
// attack1 or attack2 depends on the character, never on its number. A
// character with no Charge replacements gives every numbered attack its own
// button, and every one of those its mid-air version:
//
//   actions: {
//     attack1: { ground: 'attack1', air: 'midair_attack1' },
//     attack2: { ground: 'attack2', air: 'midair_attack2' },
//     attack3: { ground: 'attack3', air: 'midair_attack3' },
//   }
//
// A character with Charge replacements spends attack3 and attack4 on them:
// while it is Charging, its attack1 button makes attack3 and its attack2
// button attack4. They have no button of their own and need no mid-air
// version (Charge is grounded). A fifth attack is an ordinary third button:
//
//   actions: {
//     attack1: { ground: 'attack1', air: 'midair_attack1' },
//     attack2: { ground: 'attack2', air: 'midair_attack2' },
//     attack5: { ground: 'attack5', air: 'midair_attack5' },
//   },
//   chargeReplacements: {
//     attack1: { type: 'summon', id: 'attack3' },
//     attack2: { type: 'technique', id: 'attack4' },
//   },
//
// So, by numbered attacks and Charge replacements:
//
//   attacks  Charge  buttons                    while Charging
//   2        -       attack1 attack2
//   3        -       attack1 attack2 attack3
//   4        -       attack1 ... attack4
//   5        -       attack1 ... attack5
//   3        yes     attack1 attack2            attack1 -> attack3
//   4        yes     attack1 attack2            attack1 -> attack3, attack2 -> attack4
//   5        yes     attack1 attack2 attack5    attack1 -> attack3, attack2 -> attack4
//
// With a replacement on attack1 only, attack2 pressed while Charging is
// still attack2. A replacement is typed: a `summon` (js/game/clone.js) or a
// `technique` (js/game/charged-technique.js), keyed by the attack it is.
// Charge itself is every fighter's grounded state; only what it replaces is
// the character's.
//
// Anything an attack creates is named after it with `object`: a projectile
// `<attack>_object`, and the art of a summon or a technique
// `<attack>_object...` (its effect clips), so a fighter's data and files
// read the same whatever its moves are called.
//
// loadoutProblems checks a definition against every one of these rules;
// js/data/characters.js refuses to load one that breaks any.

import { COMBAT_BUTTONS, MOVES, NUMBERED_ATTACKS } from '../config.js';
import { TECHNIQUE_CLIPS, TECHNIQUE_EFFECTS } from '../game/charged-technique.js';

export { NUMBERED_ATTACKS };

// Fewest numbered attacks a character has (attack1 and attack2); the most
// is NUMBERED_ATTACKS.length.
export const MIN_NUMBERED_ATTACKS = 2;

// The one special attack outside the numbered ones.
export const EXTRA_ATTACK = 'extra_attack';

// Each button a Charge replacement may sit on, and the numbered attack it
// always is.
export const CHARGE_REPLACES = Object.freeze({ attack1: 'attack3', attack2: 'attack4' });

// What a Charge replacement may be.
export const REPLACEMENT_TYPES = Object.freeze(['summon', 'technique']);

// The mid-air version of numbered attack `attack` (midair_attack3 for attack3).
export const midairAttack = (attack) => `midair_${attack}`;

// Whether `id` is one of the numbered attacks.
export const isNumberedAttack = (id) => NUMBERED_ATTACKS.includes(id);

// The number in a numbered attack's codename (3 for attack3 or even
// attack7), Infinity for anything else: orders them.
const numberOf = (id) => Number(/^attack(\d+)$/.exec(id)?.[1] ?? Infinity);

// The codename an attack's own objects start with (see above).
export const objectOf = (attack) => `${attack}_object`;

// The numbered attacks `def` gives a button of its own, in order: the ones
// in its `actions`.
export function attackButtons(def) {
  const actions = def?.actions ?? {};
  return NUMBERED_ATTACKS.filter((id) => Object.hasOwn(actions, id));
}

// `def`'s Charge replacement on `button` ({ type, id }), or null.
export function chargeReplacement(def, button) {
  return def?.chargeReplacements?.[button] ?? null;
}

// Whether `def` has any Charge replacement.
export function hasChargeReplacements(def) {
  return Object.keys(def?.chargeReplacements ?? {}).length > 0;
}

// Every numbered attack `def` has, in order: the ones with a button and the
// ones Charge reaches (whatever ids those name, so a wrong one shows).
export function numberedAttacks(def) {
  const ids = new Set(attackButtons(def));
  for (const spec of Object.values(def?.chargeReplacements ?? {})) if (spec?.id) ids.add(spec.id);
  return [...ids].sort((a, b) => numberOf(a) - numberOf(b));
}

// The numbered attacks only Charge reaches: no button of their own.
export function chargeOnlyAttacks(def) {
  const buttons = attackButtons(def);
  return numberedAttacks(def).filter((id) => !buttons.includes(id));
}

// What `def`'s loadout comes to: its numbered attacks, the ones with a
// button (each with its mid-air version), what Charge makes of each button
// it replaces, and whether it has an extra_attack.
export function describeLoadout(def) {
  const buttons = attackButtons(def);
  return {
    numbered: numberedAttacks(def),
    buttons,
    air: Object.fromEntries(buttons.map((id) => [id, midairAttack(id)])),
    charge: Object.fromEntries(Object.entries(def?.chargeReplacements ?? {}).map(([button, spec]) => [button, spec?.id ?? null])),
    extra: !!def?.actions?.[EXTRA_ATTACK],
  };
}

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Every way `def` breaks the loadout rules above, one sentence each; empty
// when it keeps them all. Checks its buttons, its Charge replacements, the
// numbered attacks they come to, that every move they name exists with the
// art it plays, and that everything an attack creates is named after it.
export function loadoutProblems(def) {
  const problems = [];
  const say = (text) => problems.push(text);
  const actions = isObject(def?.actions) ? def.actions : {};
  const replacements = isObject(def?.chargeReplacements) ? def.chargeReplacements : {};
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

  // ---- Buttons ----------------------------------------------------------------
  for (const [button, mapping] of Object.entries(actions)) {
    if (!COMBAT_BUTTONS.includes(button)) {
      say(`actions.${button} is not a combat button (${COMBAT_BUTTONS.join(', ')})`);
    } else if (isNumberedAttack(button)) {
      // A numbered attack with a button always has its mid-air version.
      const air = midairAttack(button);
      if (!isObject(mapping) || mapping.ground !== button || mapping.air !== air) {
        say(`actions.${button} must be { ground: '${button}', air: '${air}' }`);
      } else {
        needAttack(button, `actions.${button}`);
        needAttack(air, `actions.${button}`);
      }
    } else if (mapping !== null) {
      // extra_attack and transform: their own move, or null (reserved).
      if (mapping !== button) say(`actions.${button} must be '${button}' or null`);
      else needAttack(button, `actions.${button}`);
    }
  }
  for (const id of ['attack1', 'attack2']) {
    if (!Object.hasOwn(actions, id)) say(`${id} needs a button of its own (actions.${id})`);
  }

  // ---- Charge replacements ----------------------------------------------------------
  for (const [button, spec] of Object.entries(replacements)) {
    const target = CHARGE_REPLACES[button];
    if (!target) {
      say(`chargeReplacements.${button}: only attack1 (-> attack3) and attack2 (-> attack4) have Charge replacements`);
      continue;
    }
    if (spec?.id !== target) say(`chargeReplacements.${button} is ${target}, not "${spec?.id}"`);
    if (spec?.type === 'summon') {
      const summon = def?.summons?.[target];
      if (!summon) {
        say(`chargeReplacements.${button} summons ${target}, which is not in \`summons\``);
      } else {
        needAttack(summon.attack, `summon ${target}`);
        if (summon.noGround) needAttack(summon.noGround.attack, `summon ${target}'s noGround`);
        if (!effects[summon.cloud]) say(`summon ${target}'s cloud "${summon.cloud}" is not in \`effectAnimations\``);
        else if (!summon.cloud.startsWith(objectOf(target))) say(`summon ${target}'s cloud "${summon.cloud}" is not named ${objectOf(target)}`);
      }
    } else if (spec?.type === 'technique') {
      const technique = def?.chargedTechniques?.[target];
      if (!technique) {
        say(`chargeReplacements.${button} performs ${target}, which is not in \`chargedTechniques\``);
      } else {
        for (const field of TECHNIQUE_CLIPS) {
          const key = technique[field];
          if (!animations[key]) say(`technique ${target}'s ${field} "${key}" is not in \`animations\``);
          else if (!key.startsWith(`${target}_`)) say(`technique ${target}'s ${field} "${key}" is not named ${target}_...`);
        }
        for (const field of TECHNIQUE_EFFECTS) {
          const key = technique[field];
          if (!effects[key]) say(`technique ${target}'s ${field} "${key}" is not in \`effectAnimations\``);
          else if (!key.startsWith(objectOf(target))) say(`technique ${target}'s ${field} "${key}" is not named ${objectOf(target)}...`);
        }
      }
    } else {
      say(`chargeReplacements.${button} has type "${spec?.type}" (${REPLACEMENT_TYPES.join(' or ')})`);
    }
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
  if (hasChargeReplacements(def)) {
    // With Charge, attack3 is always attack1's replacement, and attack4
    // attack2's once there is one: never a button in their place.
    if (!replacements.attack1) say('with Charge replacements, attack3 is Charge + attack1: chargeReplacements.attack1 is missing');
    if (numbered.includes('attack4') && !replacements.attack2) {
      say('with Charge replacements, attack4 is Charge + attack2: chargeReplacements.attack2 is missing');
    }
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
  for (const [kind, table] of [['summons', def?.summons], ['chargedTechniques', def?.chargedTechniques]]) {
    for (const id of Object.keys(table ?? {})) {
      if (!Object.values(replacements).some((spec) => spec?.id === id)) say(`${kind}.${id} is no Charge replacement's`);
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
