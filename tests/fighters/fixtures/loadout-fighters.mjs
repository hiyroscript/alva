// Test-only fighters for the attack loadout matrix (imported by the
// *.test.mjs files; not a test file itself, and never in the game). Each is
// built from the loadout rules alone (js/data/loadout.js): a number of
// numbered attacks, every one a button of its own, ordinary or (with
// `specials`) a summon and a technique, and optionally an extra_attack.
// Their body, physics and art are #0001's, borrowed (they are not what
// these fighters test): every ordinary numbered attack plays #0001's Jab
// frames and every mid-air one its Floating Straight (without its hover:
// a plain aerial), each under its own codename, and each hits for its own
// number in damage (attack3 deals 3, midair_attack5 5), so a test can tell
// which one landed.
//
// The cases the loadout rules spell out:
//
//   A  2 attacks                 attack1 attack2, ordinary
//   B  3 attacks                 attack1 attack2 attack3, ordinary
//   C  5 attacks                 attack1 ... attack5, ordinary
//   D  3 attacks with specials   attack1 attack2 ordinary, attack3 a summon
//   E  4 attacks with specials   attack1 attack2 ordinary, attack3 a summon,
//                                attack4 a technique (a cast, #0001's form)
//   F  5 attacks with specials   as E, and attack5 ordinary
//   G  5 attacks, two techniques attack1 attack2 attack3 ordinary, attack4
//                                and attack5 techniques (#0001's shape)
//
// The summon is a clone performing attack1 after a summoning startup of
// its own (#0001's Unlimited Void cast poses, borrowed as attack3_summon),
// appearing through a cloud (the blue orb's frame); the technique is
// #0001's Unlimited Void (its clips borrowed under attack4's own names),
// and in Case G attack5 is #0001's Hollow Purple with its projectile.
import { getCharacter } from '../../../js/data/characters.js';
import { NUMBERED_ATTACKS } from '../../../js/config.js';

const BASE = getCharacter('0001');
const A = BASE.animations;

const UNIVERSAL = [
  'idle', 'run', 'jump', 'fall', 'mouvment', 'land', 'hurt', 'midair_hurt', 'shielding', 'midair_shielding',
];

// A fighter with `count` numbered attacks (2 to 5, or more to break the
// rules), attack3 a summon and attack4 a technique when `specials`, the
// buttons in `casts` #0001's own technique on that button, and #0001's
// High Kick as its extra_attack when `extra`. `id` names it.
export function loadoutFighter({ id, count, specials = false, casts = [], extra = false }) {
  const numbered = Array.from({ length: count }, (_, i) => `attack${i + 1}`);
  const special = specials ? numbered.filter((a) => a === 'attack3' || a === 'attack4') : [...casts];
  const animations = Object.fromEntries(UNIVERSAL.map((key) => [key, A[key]]));
  const attacks = {};
  const actions = {};
  for (const button of numbered.filter((a) => !special.includes(a))) {
    const n = Number(button.slice(6));
    const air = `midair_${button}`;
    animations[button] = A.attack1;
    animations[air] = A.midair_attack1;
    attacks[button] = { ...BASE.attacks.attack1, animation: button, damage: n };
    attacks[air] = { ...BASE.attacks.midair_attack1, animation: air, damage: n, motion: undefined, airUses: 0 };
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
    def.summons.attack3 = {
      attack: 'attack1', cloud: 'attack3_object', startupAnimation: 'attack3_summon', cooldown: 5,
      behindDistance: 48, effectOffset: { x: 0, y: -52 }, noGround: { attack: 'midair_attack1', offset: { x: 0, y: -40 } },
    };
    animations.attack3_summon = { ...A.attack4_cast, fps: 10 };
    def.effectAnimations.attack3_object = { ...BASE.projectileAnimations.attack3_object, fps: 2, loop: false };
  }
  for (const button of special.filter((b) => b === 'attack4' || b === 'attack5')) {
    actions[button] = { type: 'technique', id: button };
    def.techniques[button] = BASE.techniques[button];
    for (const key of Object.keys(BASE.animations).filter((k) => k.startsWith(`${button}_`))) animations[key] = A[key];
    const shot = BASE.techniques[button].projectile;
    if (shot) {
      def.projectiles[shot.id] = BASE.projectiles[shot.id];
      def.projectileAnimations[shot.id] = BASE.projectileAnimations[shot.id];
    }
  }
  if (extra) {
    actions.extra_attack = 'extra_attack';
    animations.extra_attack = A.extra_attack;
    attacks.extra_attack = BASE.attacks.extra_attack;
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
  {
    name: 'G', count: 5, specials: false, casts: ['attack4', 'attack5'], buttons: [...NUMBERED_ATTACKS],
    types: { ...ordinary(['attack1', 'attack2', 'attack3']), attack4: 'technique', attack5: 'technique' },
  },
].map((c) => Object.freeze({
  ...c, def: loadoutFighter({ id: `loadout-${c.name}`, count: c.count, specials: c.specials, casts: c.casts }),
})));

// Case C with an extra_attack as well: five numbered attacks and the High
// Kick.
export const WITH_EXTRA = loadoutFighter({ id: 'loadout-extra', count: 5, extra: true });
