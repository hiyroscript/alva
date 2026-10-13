// Test-only fighters with unusual offensive mechanics (imported by the
// *.test.mjs files; not a test file itself, and never in the game). They
// stand in for fighters nobody has made yet: each move is built from the
// ordinary character data (js/data/characters/<id>.js's schema, the same
// loadout rules) and nothing in the engine knows its name. The tests prove
// the shared engine classifies every one of them as an attack and that a
// raised Shield blocks every one, with no code written for them.
//
// FUTURE_FIGHTER, #0001's body and art (borrowed: they are not what these
// tests check) with moves of its own:
//
//   attack1        Phantom Strike: a multi-hit string, its finisher a
//                  launcher (`hits`)
//   attack2        #0001's own Red (an ordinary projectile throw)
//   attack3        Shadow Clone: a summon whose clone attacks later, after
//                  its owner's startup and its cloud, from behind its target
//   attack4        Meteor Storm: a technique that releases two damaging
//                  sources at once, a burst round itself and a projectile
//   attack5        Poison Field: a technique that leaves a lingering field
//                  (a projectile that does not move) striking again and
//                  again, its last strike a paralyzing finisher: repeated,
//                  delayed damage
//   extra_attack   Counter Pulse: a ground strike that paralyzes and turns
//                  projectiles back while it is live: a defense and an
//                  attack at once
import { getCharacter } from '../../../js/data/characters.js';

const BASE = getCharacter('0001');
const A = BASE.animations;
const P = BASE.projectileAnimations;

export const FUTURE_FIGHTER = Object.freeze({
  ...BASE,
  id: 'future',
  displayName: 'Future',
  available: false,
  rosterSlot: null,

  animations: {
    ...A,
    // The Shadow Clone's owner pose: one of #0001's clips under the
    // summon's own name.
    attack3_summon: A.attack4_cast,
  },
  projectileAnimations: {
    attack2_object: P.attack2_object,
    attack4_object: P.attack2_object,
    attack5_object: P.attack3_object,
  },
  effectAnimations: { attack3_object: { ...P.attack3_object, fps: 12, loop: false } },

  actions: {
    extra_attack: 'extra_attack',
    transform: null,
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'summon', id: 'attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  },
  abilityNames: {
    attack1: 'Phantom Strike',
    attack3: 'Shadow Clone',
    attack4: 'Meteor Storm',
    attack5: 'Poison Field',
    extra_attack: 'Counter Pulse',
  },

  attacks: {
    attack1: {
      animation: 'attack1', recovery: 0.12, hitbox: { x: 10, y: -80, w: 40, h: 50 },
      hitstun: 0.3, blockstun: 0.12, hitstop: 0.04, groundOnly: true,
      hits: [
        { at: 0.05, active: 0.05, damage: 1 },
        { at: 0.12, active: 0.05, damage: 1 },
        { at: 0.2, active: 0.05, damage: 5, baseLaunch: 3, directionalLaunch: 'horizontal' },
      ],
    },
    midair_attack1: BASE.attacks.midair_attack1,
    attack2: BASE.attacks.attack2,
    midair_attack2: BASE.attacks.midair_attack2,
    // The clone's strike (performed only by Shadow Clone).
    midair_attack3: {
      animation: 'midair_attack3', startup: 0.05, active: 0.1, recovery: 0.1,
      damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', paralyze: 0.4,
      hitbox: { x: -10, y: -90, w: 60, h: 90 }, hitstun: 0.3, blockstun: 0.15, hitstop: 0.06,
    },
    extra_attack: {
      animation: 'extra_attack', startup: 0.05, active: 0.2, recovery: 0.15,
      damage: 3, paralyze: 0.6, hitbox: { x: 0, y: -100, w: 60, h: 100 },
      hitstun: 0.2, blockstun: 0.12, hitstop: 0.05, groundOnly: true,
      deflectProjectiles: true,
    },
  },
  projectiles: {
    attack2_object: BASE.projectiles.attack2_object,
    attack4_object: {
      animation: 'attack4_object', speed: 700, lifetime: 1, hitbox: { x: -20, y: -20, w: 40, h: 40 },
      damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.3, blockstun: 0.14, hitstop: 0.05,
    },
    attack5_object: {
      animation: 'attack5_object', speed: 0, lifetime: 3, hitbox: { x: -60, y: -60, w: 120, h: 120 },
      damage: 1, hitstun: 0.2, blockstun: 0.1, hitstop: 0.02,
      pierce: { hits: 4, interval: 0.4 },
      finisher: { damage: 3, paralyze: 0.8, hitstun: 0.3 },
    },
  },
  summons: {
    attack3: {
      attack: 'midair_attack3', cloud: 'attack3_object', startupAnimation: 'attack3_summon',
      cooldown: 2, behindDistance: 30, effectOffset: { x: 0, y: -44 },
    },
  },
  techniques: {
    attack4: {
      castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release', cooldown: 2,
      burst: { hitbox: { x: -120, y: -160, w: 240, h: 170 }, hit: { damage: 5, baseLaunch: 2, directionalLaunch: 'vertical' } },
      projectile: { id: 'attack4_object', offset: { x: 60, y: -50 } },
    },
    attack5: {
      castAnimation: 'attack5_cast', releaseAnimation: 'attack5_release', cooldown: 2,
      projectile: { id: 'attack5_object', offset: { x: 140, y: -60 } },
    },
  },
});
