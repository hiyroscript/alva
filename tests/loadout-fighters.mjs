// Test-only fighters for the attack loadout matrix (imported by the
// *.test.mjs files; not a test file itself, and never in the game). Each is
// built from the loadout rules alone (js/data/loadout.js): a number of
// numbered attacks, with or without Charge replacements, and optionally an
// extra_attack. Their body, physics and art are #0001's, borrowed (they are
// not what these fighters test): every numbered attack plays #0001's punch
// frames and every mid-air one its kunai slash, each under its own codename,
// and each hits for its own number in damage (attack3 deals 3, midair_attack5
// 5), so a test can tell which one landed.
//
// The cases the loadout rules spell out:
//
//   A  2 attacks, no Charge    buttons attack1 attack2
//   B  3 attacks, no Charge    buttons attack1 attack2 attack3
//   C  5 attacks, no Charge    buttons attack1 ... attack5
//   D  3 attacks + Charge      buttons attack1 attack2; Charge + attack1 -> attack3
//   E  4 attacks + Charge      buttons attack1 attack2; Charge + attack1 -> attack3, Charge + attack2 -> attack4
//   F  5 attacks + Charge      buttons attack1 attack2 attack5; attack3 and attack4 as in E
//
// Charge + attack1 makes a summon (#0001's clone, performing attack1) and
// Charge + attack2 a technique (#0001's Sphere Rush, its clips and sphere
// art borrowed under attack4's own names).
import { getCharacter } from '../js/data/characters.js';
import { NUMBERED_ATTACKS } from '../js/config.js';

const BASE = getCharacter('0001');
const A = BASE.animations;

const UNIVERSAL = [
  'idle', 'run', 'jump', 'fall', 'mouvment', 'land', 'hurt', 'midair_hurt', 'charge', 'charge_loop', 'charge_release',
  'prepshield', 'shielding', 'releaseshield', 'midair_shielding',
];

// A fighter with `count` numbered attacks (2 to 5, or more to break the
// rules), Charge replacements when `charge`, and #0001's Throw as its
// extra_attack when `extra`. `id` names it.
export function loadoutFighter({ id, count, charge = false, extra = false }) {
  const numbered = Array.from({ length: count }, (_, i) => `attack${i + 1}`);
  // With Charge, attack3 and attack4 are Charge + attack1 / attack2: no
  // buttons of their own.
  const replaced = charge ? numbered.filter((a) => a === 'attack3' || a === 'attack4') : [];
  const buttons = numbered.filter((a) => !replaced.includes(a));
  const animations = Object.fromEntries(UNIVERSAL.map((key) => [key, A[key]]));
  const attacks = {};
  const actions = {};
  for (const button of buttons) {
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
    chargeReplacements: {},
    summons: {},
    chargedTechniques: {},
    mobileAbilities: {},
    abilityNames: {},
  };
  if (replaced.includes('attack3')) {
    def.chargeReplacements.attack1 = { type: 'summon', id: 'attack3' };
    def.summons.attack3 = { ...BASE.summons.attack3 };
    def.effectAnimations.attack3_object = BASE.effectAnimations.attack3_object;
  }
  if (replaced.includes('attack4')) {
    def.chargeReplacements.attack2 = { type: 'technique', id: 'attack4' };
    def.chargedTechniques.attack4 = BASE.chargedTechniques.attack4;
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
// `buttons` are its numbered attack buttons, `charge` what Charge makes of
// each button it replaces, `chargeOnly` the numbered attacks it has no
// button for.
export const LOADOUT_CASES = Object.freeze([
  { name: 'A', count: 2, charge: false, buttons: ['attack1', 'attack2'], charged: {}, chargeOnly: [] },
  { name: 'B', count: 3, charge: false, buttons: ['attack1', 'attack2', 'attack3'], charged: {}, chargeOnly: [] },
  { name: 'C', count: 5, charge: false, buttons: [...NUMBERED_ATTACKS], charged: {}, chargeOnly: [] },
  { name: 'D', count: 3, charge: true, buttons: ['attack1', 'attack2'], charged: { attack1: 'attack3' }, chargeOnly: ['attack3'] },
  {
    name: 'E', count: 4, charge: true, buttons: ['attack1', 'attack2'],
    charged: { attack1: 'attack3', attack2: 'attack4' }, chargeOnly: ['attack3', 'attack4'],
  },
  {
    name: 'F', count: 5, charge: true, buttons: ['attack1', 'attack2', 'attack5'],
    charged: { attack1: 'attack3', attack2: 'attack4' }, chargeOnly: ['attack3', 'attack4'],
  },
].map((c) => Object.freeze({ ...c, def: loadoutFighter({ id: `loadout-${c.name}`, count: c.count, charge: c.charge }) })));

// Case C with an extra_attack as well: five numbered attacks and the Throw.
export const WITH_EXTRA = loadoutFighter({ id: 'loadout-extra', count: 5, extra: true });
