// A sample second fighter for the tests only (not a test file itself, and
// never in CHARACTERS as it is; test-fighters.mjs registers a playable
// copy for the screen tests that need a fighter with different moves). It
// checks that the game works for a character that is not #0001: it goes by
// the same universal control and move codenames and the same loadout rules
// (js/data/loadout.js), but makes different moves on them and names them
// its own way.
//
// Against #0001 (four numbered attacks: two ordinary, a summon and a
// technique) it has:
//   extra_attack  a melee palm strike, usable in the air too (#0001's is a
//                 ground-only projectile Throw)
//   transform     a real move (#0001's is reserved), presented on its own
//                 touch button
//   attack1 / midair_attack1, attack2 / midair_attack2
//                 on the ground and in the air, its own timings
//   attack3       its own button, a clone summon that performs attack2
//                 (#0001's attack3 performs attack1); three numbered attacks
//                 in all, so there is no attack4 (no technique) and its
//                 attack3 button keeps its neutral look
//   no Defense: the shield button does nothing
//   its own touch labels, frames of its own clips on its touch buttons
//   (attack2 left neutral, and no jump frame of its own, so Jump keeps its
//   arrow) and its own glyph on its Transform, and ability names (attack2
//   and both mid-air attacks left unnamed)
//
// Its body, physics, Powers, Energy and art are #0001's, borrowed: they are
// not what it tests. Its clips reuse #0001's frame lists under its own keys,
// each the length of the attack that plays it.
import { getCharacter } from '../js/data/characters.js';

const BASE = getCharacter('0001');
const A = BASE.animations;
const FPS = 12;

export const SAMPLE_FIGHTER = Object.freeze({
  ...BASE,
  id: 'sample',
  displayName: 'Sample',
  available: false,
  rosterSlot: null,

  animations: {
    idle: A.idle, run: A.run, jump: A.jump, fall: A.fall, land: A.land,
    hurt: A.hurt, midair_hurt: A.midair_hurt, mouvment: A.mouvment,
    extra_attack: A.attack2,              // 7 frames
    transform: A.midair_attack1,          // 3 frames
    attack1: A.attack1,                   // 4 frames
    midair_attack1: A.midair_attack1,     // 3 frames
    attack2: A.extra_attack,              // 3 frames
    midair_attack2: A.midair_attack2,     // 5 frames
  },
  projectileAnimations: {},
  projectiles: {},
  effectAnimations: { attack3_object: BASE.effectAnimations.attack3_object },
  defense: null,

  actions: {
    extra_attack: 'extra_attack',
    transform: 'transform',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'summon', id: 'attack3' },
  },
  summons: {
    attack3: {
      attack: 'attack2',
      cloud: 'attack3_object',
      cooldown: 3,
      behindDistance: 40,
      effectOffset: { x: 0, y: -44 },
      noGround: { attack: 'midair_attack2', offset: { x: 0, y: -36 } },
    },
  },
  techniques: {},

  mobileAbilities: {
    extra_attack: { label: 'Palm Strike', preview: { animation: 'extra_attack', frame: 3 } },
    transform: { label: 'Awakening', icon: 'up' },
    attack1: { label: 'Jab', preview: { animation: 'attack1', frame: 1 } },
  },
  abilityNames: {
    extra_attack: 'Palm Strike',
    transform: 'Awakening',
    attack1: 'Jab',
    attack3: 'Shadow Knee',
  },

  attacks: {
    extra_attack: {
      animation: 'extra_attack', startup: 3 / FPS, active: 2 / FPS, recovery: 2 / FPS,
      damage: 4, baseLaunch: 1, directionalLaunch: 'horizontal',
      hitbox: { x: 10, y: -70, w: 30, h: 30 },
      hitstun: 0.25, blockstun: 0.12, hitstop: 0.06, cooldown: 0.2,
      airMomentum: 1, airControl: 0.5,
    },
    transform: {
      animation: 'transform', startup: 2 / FPS, active: 1 / FPS, recovery: 0,
      damage: 2, baseLaunch: 2, directionalLaunch: 'vertical',
      hitbox: { x: 8, y: -90, w: 26, h: 70 },
      hitstun: 0.3, blockstun: 0.15, hitstop: 0.05, cooldown: 0.3,
    },
    attack1: { ...BASE.attacks.attack1 },
    midair_attack1: { ...BASE.attacks.midair_attack1 },
    attack2: {
      animation: 'attack2', startup: 1 / FPS, active: 1 / FPS, recovery: 1 / FPS,
      damage: 6, baseLaunch: 2, directionalLaunch: 'vertical',
      hitbox: { x: 10, y: -80, w: 26, h: 50 },
      hitstun: 0.28, blockstun: 0.15, hitstop: 0.08, cooldown: 0.15, groundOnly: true,
    },
    midair_attack2: { ...BASE.attacks.midair_attack2 },
  },
});
