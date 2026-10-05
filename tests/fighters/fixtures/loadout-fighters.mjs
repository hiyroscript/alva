// Test-only fighters for the attack loadout matrix (imported by the
// *.test.mjs files; not a test file itself, and never in the game). Each is
// built from the loadout rules alone (js/data/loadout.js): a number of
// numbered attacks, every one a button of its own, ordinary or (with
// `specials`) a summon and a technique, and optionally an extra_attack.
// Their body, physics and art are #0001's, borrowed (they are not what
// these fighters test): every ordinary numbered attack plays #0001's punch
// frames and every mid-air one its kunai slash, each under its own
// codename, and each hits for its own number in damage (attack3 deals 3,
// midair_attack5 5), so a test can tell which one landed.
//
// The cases the loadout rules spell out:
//
//   A  2 attacks                 attack1 attack2, ordinary
//   B  3 attacks                 attack1 attack2 attack3, ordinary
//   C  5 attacks                 attack1 ... attack5, ordinary
//   D  3 attacks with specials   attack1 attack2 ordinary, attack3 a summon
//   E  4 attacks with specials   attack1 attack2 ordinary, attack3 a summon,
//                                attack4 a technique (#0001's shape)
//   F  5 attacks with specials   as E, and attack5 ordinary
//
// The summon is #0001's clone (performing attack1, after #0001's own
// summoning startup, its attack3_summon clip borrowed with it) and the
// technique its Sphere Rush (its clips and sphere art borrowed under
// attack4's own names).
import { getCharacter } from '../../../js/data/characters.js';
import { NUMBERED_ATTACKS } from '../../../js/config.js';

const BASE = getCharacter('0001');
const A = BASE.animations;

const UNIVERSAL = [
  'idle', 'run', 'jump', 'fall', 'mouvment', 'land', 'hurt', 'midair_hurt',
  'prepshield', 'shielding', 'releaseshield', 'midair_shielding',
];

// A fighter with `count` numbered attacks (2 to 5, or more to break the
// rules), attack3 a summon and attack4 a technique when `specials`, and
// #0001's Throw as its extra_attack when `extra`. `id` names it.
export function loadoutFighter({ id, count, specials = false, extra = false }) {
  const numbered = Array.from({ length: count }, (_, i) => `attack${i + 1}`);
  const special = specials ? numbered.filter((a) => a === 'attack3' || a === 'attack4') : [];
  const animations = Object.fromEntries(UNIVERSAL.map((key) => [key, A[key]]));
  const attacks = {};
  const actions = {};
  for (const button of numbered.filter((a) => !special.includes(a))) {
    const n = Number(button.slice(6));
    const air = `midair_${button}`;
    animations[button] = A.attack1;
    animations[air] = A.midair_attack1;
    attacks[button] = { ...BASE.attacks.attack1, animation: button, damage: n };
    attacks[air] = { ...BASE.attacks.midair_attack1, animation: air, damage: n };
    actions[button] = { ground: button, air };
  }
  const def = {
    ...BASE,
    id,
    displayName: id,
    available: false,
    rosterSlot: null,
    animations,
    attacks,
    actions,
    projectileAnimations: {},
    projectiles: {},
    effectAnimations: {},
    summons: {},
    techniques: {},
    mobileAbilities: {},
    abilityNames: {},
  };
  if (special.includes('attack3')) {
    actions.attack3 = { type: 'summon', id: 'attack3' };
    def.summons.attack3 = { ...BASE.summons.attack3 };
    animations.attack3_summon = A.attack3_summon;
    def.effectAnimations.attack3_object = BASE.effectAnimations.attack3_object;
  }
  if (special.includes('attack4')) {
    actions.attack4 = { type: 'technique', id: 'attack4' };
    def.techniques.attack4 = BASE.techniques.attack4;
    for (const key of Object.keys(BASE.animations).filter((k) => k.startsWith('attack4_'))) animations[key] = A[key];
    for (const key of Object.keys(BASE.effectAnimations).filter((k) => k.startsWith('attack4_object'))) {
      def.effectAnimations[key] = BASE.effectAnimations[key];
    }
  }
  if (extra) {
    actions.extra_attack = 'extra_attack';
    animations.extra_attack = A.extra_attack;
    attacks.extra_attack = BASE.attacks.extra_attack;
    def.projectiles.extra_attack_object = BASE.projectiles.extra_attack_object;
    def.projectileAnimations.extra_attack_object = BASE.projectileAnimations.extra_attack_object;
  }
  return def;
}

// The matrix: each case's fighter and what the rules say it shows.
// `buttons` are its numbered attack buttons (every numbered attack it has)
// and `types` the kind of move each one is.
const ordinary = (buttons) => Object.fromEntries(buttons.map((id) => [id, 'attack']));
export const LOADOUT_CASES = Object.freeze([
  { name: 'A', count: 2, specials: false, buttons: ['attack1', 'attack2'], types: ordinary(['attack1', 'attack2']) },
  { name: 'B', count: 3, specials: false, buttons: ['attack1', 'attack2', 'attack3'], types: ordinary(['attack1', 'attack2', 'attack3']) },
  { name: 'C', count: 5, specials: false, buttons: [...NUMBERED_ATTACKS], types: ordinary(NUMBERED_ATTACKS) },
  {
    name: 'D', count: 3, specials: true, buttons: ['attack1', 'attack2', 'attack3'],
    types: { ...ordinary(['attack1', 'attack2']), attack3: 'summon' },
  },
  {
    name: 'E', count: 4, specials: true, buttons: ['attack1', 'attack2', 'attack3', 'attack4'],
    types: { ...ordinary(['attack1', 'attack2']), attack3: 'summon', attack4: 'technique' },
  },
  {
    name: 'F', count: 5, specials: true, buttons: [...NUMBERED_ATTACKS],
    types: { ...ordinary(['attack1', 'attack2']), attack3: 'summon', attack4: 'technique', attack5: 'attack' },
  },
].map((c) => Object.freeze({ ...c, def: loadoutFighter({ id: `loadout-${c.name}`, count: c.count, specials: c.specials }) })));

// Case C with an extra_attack as well: five numbered attacks and the Throw.
export const WITH_EXTRA = loadoutFighter({ id: 'loadout-extra', count: 5, extra: true });
