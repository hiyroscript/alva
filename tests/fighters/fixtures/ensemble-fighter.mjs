// A test-only fighter drawn as several members (imported by the *.test.mjs
// files; not a test file itself, and never in the game): #0006's three
// members, their art, body, Shield and Deflect (borrowed: they are not what
// these tests check), with moves written here instead of its own, only to
// exercise who performs what (js/data/ensemble.js). Its clips reuse its
// members' own files, so every move has art; the moves are no design of
// #0006's.
//
//   attack1         blue alone: the ordinary case, one member performs it
//                   (in the air too: midair_attack1)
//   attack2         pink and green together: a combination of two, blue
//                   steps back (midair_attack2 the same)
//   attack3         all three at once: one move, three animations, with a
//                   formation of its own (pink lifted over the others)
//   extra_attack    green alone, a single 3-damage strike with a hitbox that
//                   reaches the whole group's front: its one hit is what
//                   proves a move of several art bodies strikes once
import { getCharacter } from '../../../js/data/characters.js';

const BASE = getCharacter('0006');

// Member `m`'s own clip `from`, played as move codename `key`: its files,
// at 12 fps, never looping.
const reuse = (m, from) => ({ ...m.animations[from], fps: 12, loop: false });

const PLAIN = Object.freeze({
  startup: 1 / 12, active: 1 / 12, recovery: 1 / 12,
  hitbox: { x: 4, y: -60, w: 40, h: 50 },
  damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
  hitstun: 0.3, blockstun: 0.12, hitstop: 1 / 30,
});

export const ENSEMBLE_FIGHTER = {
  ...BASE,
  id: 'ensemble-test',
  displayName: 'Ensemble',
  available: false,
  rosterSlot: 40,
  controller: undefined,
  // None of #0006's own moves: only those written here.
  techniques: undefined,
  projectiles: undefined,
  projectileAnimations: undefined,
  specialAbilities: undefined,
  mobileAbilities: undefined,
  abilityNames: undefined,
  abilityDescriptions: undefined,
  ensemble: {
    ...BASE.ensemble,
    members: BASE.ensemble.members.map((m) => ({
      ...m,
      animations: {
        ...m.animations,
        attack1: reuse(m, 'mouvment'),
        attack2: reuse(m, 'mouvment'),
        attack3: reuse(m, 'jump'),
        extra_attack: reuse(m, 'mouvment'),
      },
    })),
  },
  actions: {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
  },
  attacks: {
    attack1: { animation: 'attack1', members: ['blue'], ...PLAIN },
    midair_attack1: { animation: 'attack1', members: ['blue'], ...PLAIN },
    attack2: { animation: 'attack2', members: ['pink', 'green'], ...PLAIN },
    midair_attack2: { animation: 'attack2', members: ['pink', 'green'], ...PLAIN },
    attack3: {
      animation: 'attack3', members: ['pink', 'green', 'blue'], formation: { pink: { x: 0, y: -30 } }, ...PLAIN,
    },
    midair_attack3: { animation: 'attack3', members: ['pink', 'green', 'blue'], ...PLAIN },
    extra_attack: { animation: 'extra_attack', members: ['green'], ...PLAIN, hitbox: { x: -60, y: -100, w: 160, h: 100 } },
  },
};
