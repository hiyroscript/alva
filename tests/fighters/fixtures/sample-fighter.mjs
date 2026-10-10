// A sample second fighter for the tests only (not a test file itself, and
// never in CHARACTERS as it is; tests/fighters/fixtures/test-fighters.mjs registers a playable
// copy for the screen tests that need a fighter with different moves). It
// checks that the game works for a character that is not #0001: it goes by
// the same universal control and move codenames and the same loadout rules
// (js/data/loadout.js), but makes different moves on them and names them
// its own way.
//
// Against #0001 (five numbered attacks: three ordinary, two techniques) it
// has:
//   extra_attack  a melee palm strike, usable in the air too, planted (no
//                 hover: #0001's floats)
//   attack1 / midair_attack1, attack2 / midair_attack2
//                 on the ground and in the air, its own timings
//   attack3       its own button, a clone summon that performs attack2
//                 (#0001 has no summon at all); three numbered attacks in
//                 all, so there is no attack4 or attack5 (no technique) and
//                 its attack3 button keeps its neutral look
//   no Defense: the shield button does nothing
//   its own touch labels, frames of its own clips on its touch buttons
//   (attack2 left neutral, and no jump frame of its own, so Jump keeps its
//   arrow), and ability names (attack2
//   and both mid-air attacks left unnamed)
//
// Its body, physics, Powers, Energy and art are #0001's, borrowed: they are
// not what it tests. Its clips reuse #0001's frame lists under its own keys,
// each the length of the attack that plays it; its clone's cloud borrows
// the blue orb's frame.
import { getCharacter } from '../../../js/data/characters.js';

const BASE = getCharacter('0001');
const A = BASE.animations;
const FPS = 12;

// One of #0001's clips, as a sample clip played at FPS.
const at = (anim) => ({ ...anim, fps: FPS, anchorX: undefined });

export const SAMPLE_FIGHTER = Object.freeze({
  ...BASE,
  id: 'sample',
  displayName: 'Sample',
  available: false,
  rosterSlot: null,

  animations: {
    idle: A.idle, run: A.run, jump: A.jump, fall: A.fall, land: A.land,
    hurt: A.hurt, midair_hurt: A.midair_hurt, mouvment: A.mouvment,
    extra_attack: at(A.attack1),          // 6 frames
    attack1: at(A.midair_attack3),        // 4 frames
    midair_attack1: at(A.attack2),        // 5 frames
    attack2: at(A.land),                  // 2 frames
    midair_attack2: at(A.midair_attack2), // 4 frames
  },
  projectileAnimations: {},
  projectiles: {},
  effectAnimations: { attack3_object: { ...BASE.projectileAnimations.attack3_object, fps: 2, loop: false } },
  defense: null,

  actions: {
    extra_attack: 'extra_attack',
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
    attack1: { label: 'Jab', preview: { animation: 'attack1', frame: 1 } },
  },
  abilityNames: {
    extra_attack: 'Palm Strike',
    attack1: 'Jab',
    attack3: 'Shadow Knee',
  },

  attacks: {
    extra_attack: {
      animation: 'extra_attack', startup: 3 / FPS, active: 2 / FPS, recovery: 1 / FPS,
      damage: 5, baseLaunch: 1, directionalLaunch: 'horizontal',
      hitbox: { x: 10, y: -80, w: 34, h: 30 },
      hitstun: 0.25, blockstun: 0.12, hitstop: 0.06, cooldown: 0.05,
      airMomentum: 1, airControl: 0.5,
    },
    attack1: {
      animation: 'attack1', startup: 1 / FPS, active: 1 / FPS, recovery: 2 / FPS,
      damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
      hitbox: { x: 12, y: -84, w: 30, h: 20 },
      hitstun: 0.32, blockstun: 0.14, hitstop: 0.05, cooldown: 0.05, groundOnly: true,
      momentum: 0.75, friction: 0.4, hitCancel: 1 / FPS,
    },
    midair_attack1: {
      animation: 'midair_attack1', startup: 2 / FPS, active: 1 / FPS, recovery: 0,
      damage: 3, baseLaunch: 2, directionalLaunch: 'vertical',
      hitbox: { x: 14, y: -100, w: 22, h: 80 },
      hitstun: 0.32, blockstun: 0.15, hitstop: 0.05, cooldown: 0.05,
      airMomentum: 1, airControl: 0.85, hitCancel: 2 / FPS,
    },
    attack2: {
      animation: 'attack2', startup: 1 / FPS, active: 1 / FPS, recovery: 1 / FPS,
      damage: 5, baseLaunch: 2, directionalLaunch: 'vertical',
      hitbox: { x: 10, y: -90, w: 26, h: 60 },
      hitstun: 0.28, blockstun: 0.15, hitstop: 0.08, cooldown: 0.05, groundOnly: true,
    },
    midair_attack2: {
      animation: 'midair_attack2', startup: 2 / FPS, active: 1 / FPS, recovery: 1 / FPS,
      damage: 5, baseLaunch: 2, directionalLaunch: 'reverseVertical',
      hitbox: { x: 8, y: -44, w: 40, h: 40 },
      hitstun: 0.28, blockstun: 0.14, hitstop: 0.08, cooldown: 0.05,
      airMomentum: 1, airControl: 0.7, hitCancel: 2 / FPS,
    },
  },
});
