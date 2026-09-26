// A sample second fighter for the tests only (not a test file itself, and
// never in CHARACTERS: no screen, roster or match shows it). It checks that
// the game works for a character that is not #0001: it goes by the same
// universal control and move codenames but makes different moves on them
// and names them its own way.
//
// Against #0001 it has:
//   uniqueba   a melee palm strike, usable in the air too (#0001's is a
//              ground-only projectile Throw)
//   transform  a real move (#0001's is reserved), presented on its own
//              touch button
//   ba1        ground only: nothing in the air (no maba1)
//   ba2 / maba2  on the ground and in the air
//   cba2       Charge + ba2, a clone summon (#0001's summon is cba1, and its
//              cba2 a technique); nothing charged on ba1
//   no Defense: the shield button does nothing
//   its own touch labels and icons (ba2 left neutral) and ability names
//   (ba2 and maba2 left unnamed)
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
    hurt: A.hurt, midairHurt: A.midairHurt, dash: A.dash,
    chargeStart: A.chargeStart, chargeLoop: A.chargeLoop, chargeRelease: A.chargeRelease,
    uniqueba: A.ba2,     // 7 frames
    transform: A.maba1,  // 3 frames
    ba1: A.ba1,          // 4 frames
    ba2: A.uniqueba,     // 3 frames
    maba2: A.maba2,      // 5 frames
  },
  projectileAnimations: {},
  projectiles: {},
  effectAnimations: { cloneCloud: BASE.effectAnimations.cloneCloud },
  defense: null,

  actions: {
    uniqueba: 'uniqueba',
    transform: 'transform',
    ba1: { ground: 'ba1' },
    ba2: { ground: 'ba2', air: 'maba2' },
  },
  chargedActions: {
    ba2: { type: 'summon', id: 'cba2' },
  },
  summons: {
    cba2: {
      attack: 'ba2',
      cloud: 'cloneCloud',
      cooldown: 3,
      behindDistance: 40,
      effectOffset: { x: 0, y: -44 },
      noGround: { attack: 'maba2', offset: { x: 0, y: -36 } },
    },
  },
  chargedTechniques: {},

  mobileAbilities: {
    uniqueba: { label: 'Palm Strike', icon: 'arrow' },
    transform: { label: 'Awakening', icon: 'up' },
    ba1: { label: 'Jab', icon: 'punch' },
  },
  abilityNames: {
    uniqueba: 'Palm Strike',
    transform: 'Awakening',
    ba1: 'Jab',
    cba2: 'Shadow Knee',
  },

  attacks: {
    uniqueba: {
      animation: 'uniqueba', startup: 3 / FPS, active: 2 / FPS, recovery: 2 / FPS,
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
    ba1: { ...BASE.attacks.ba1 },
    ba2: {
      animation: 'ba2', startup: 1 / FPS, active: 1 / FPS, recovery: 1 / FPS,
      damage: 6, baseLaunch: 2, directionalLaunch: 'vertical',
      hitbox: { x: 10, y: -80, w: 26, h: 50 },
      hitstun: 0.28, blockstun: 0.15, hitstop: 0.08, cooldown: 0.15, groundOnly: true,
    },
    maba2: { ...BASE.attacks.maba2 },
  },
});
