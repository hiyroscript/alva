// Run with node --test tests/systems/quake.test.mjs (no dependencies).
// A quake (`quake: true`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a hit that runs through the ground, so it
// reaches only a fighter standing on the ground. An airborne one is passed
// by with nothing used up (a strike stays live, a projectile flies on), so
// jumping clears it; a raised Shield, on the ground, still blocks it.
// Checked on test-only fighters (#0001's body and clips, with quakes of
// their own) through the real Fighter, projectiles and CombatSystem, and
// for the CPU, which never counts on a quake reaching an airborne fighter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { hitReaches } from '../../js/game/combat/hit-effects.js';
import { def, duel, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

// The stomper: #0001 whose Jab is a quake, live long enough to meet a
// target that lands during it, whose Red throws a quake, and whose
// Unlimited Void erupts as a quake round it (no paralysis).
const STOMPER = {
  ...def,
  id: 'test-stomper',
  attacks: {
    ...def.attacks,
    attack1: { ...def.attacks.attack1, active: 0.5, recovery: 0.05, hitbox: { x: 0, y: -40, w: 60, h: 44 }, quake: true, hitCancel: null },
  },
  projectiles: { ...def.projectiles, attack2_object: { ...def.projectiles.attack2_object, quake: true, repel: false } },
  techniques: {
    ...def.techniques,
    attack4: { ...def.techniques.attack4, burst: { hitbox: { x: -200, y: -60, w: 400, h: 64 }, hit: { damage: 3, quake: true } } },
  },
};
const SPRITES = fakeSpritesOf(STOMPER);
const versus = (opts = {}) => duel({ attackerCharacter: STOMPER, attackerSprites: SPRITES, ...opts });

// Lifts the target `height` above the floor and holds it there.
function hold(target, height) {
  target.body.y -= height;
  target.body.grounded = false;
  target.body.ground = null;
  target.body.gravityScale = 0;
  target.body.vy = 0;
}

// ---- Data ---------------------------------------------------------------------------

test('a quake is a true-or-false hit field every kind of hit may declare, and inherited like the other hit effects', () => {
  const atk = createAttackDefinition({ id: 'a', hitbox: { x: 0, y: -10, w: 10, h: 10 }, damage: 3, quake: true });
  assert.equal(atk.quake, true);
  assert.equal(createAttackDefinition({ id: 'b', hitbox: { x: 0, y: -10, w: 10, h: 10 }, damage: 3 }).quake, false, 'none by default');
  const multi = createAttackDefinition({
    id: 'c', hitbox: { x: 0, y: -10, w: 10, h: 10 }, quake: true,
    hits: [{ at: 0.1, active: 0.05, damage: 1 }, { at: 0.2, active: 0.05, damage: 1, quake: false }],
  });
  assert.deepEqual(multi.hits.map((h) => h.quake), [true, false], 'a strike takes the attack\'s unless it says');
  const shot = createProjectileDefinition({ id: 'd', speed: 100, damage: 1, quake: true, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 } });
  assert.equal(shot.quake, true);
  assert.equal(shot.finisher.quake, true, 'a finisher inherits its projectile\'s');
  const cast = createTechniqueDefinition({ id: 'e', burst: { hitbox: { x: -1, y: -1, w: 2, h: 2 }, hit: { damage: 5, quake: true } } });
  assert.equal(cast.burst.hit.quake, true);
  assert.throws(() => createAttackDefinition({ id: 'f', hitbox: { x: 0, y: -10, w: 10, h: 10 }, damage: 3, quake: 1 }), /quake must be true or false/);
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, quake: true }), /pending but declares quake/);
});

test('hitReaches: anything reaches anyone, but a quake only a fighter standing on the ground', () => {
  const grounded = { body: { grounded: true } };
  const airborne = { body: { grounded: false } };
  assert.equal(hitReaches({ quake: false }, airborne), true);
  assert.equal(hitReaches({}, airborne), true);
  assert.equal(hitReaches({ quake: true }, grounded), true);
  assert.equal(hitReaches({ quake: true }, airborne), false);
});

// ---- A strike ---------------------------------------------------------------------------

test('a quake strike hits a fighter standing in its box', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  d.until(() => d.events.length > 0, 60);
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.events[0].move, 'attack1');
});

test('a fighter in the air is passed by: nothing used up, so the same strike meets it once it has landed', () => {
  const d = versus({ gap: 40 });
  hold(d.target, 30);
  d.tick(P('attack1'));
  for (let i = 0; i < 12; i++) d.tick();
  assert.equal(d.attacker.combat.phase, 'active', 'its box is live');
  assert.deepEqual(d.events, [], 'and passes it by, its box over the fighter\'s feet');
  assert.equal(d.attacker.combat.attack.hasHit, false, 'nothing used up');
  // Let it down: still in the window, the strike meets it on the ground.
  d.target.body.gravityScale = 1;
  d.until(() => d.events.length > 0, 30);
  assert.equal(d.target.body.grounded, true);
  assert.equal(d.events[0].type, 'hit');
});

test('a Shield, raised on the ground, blocks a quake like any hit', () => {
  const d = versus({ gap: 40 });
  d.tick({}, { shield: true });
  d.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 60 && !d.events.length; i++) d.tick({}, { shield: true });
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.target.combat.launchPoint, 0);
});

// ---- A burst and a projectile -------------------------------------------------------------

test('a quake burst throws up every opponent standing in its box and leaves one in the air untouched', () => {
  for (const [lifted, want] of [[0, 'hit'], [40, null]]) {
    const d = versus({ gap: -150 });
    if (lifted) hold(d.target, lifted);
    d.tick(P('attack4'));
    d.until(() => !d.attacker.technique, 120);
    assert.equal(d.events[0]?.type ?? null, want, `${lifted} above the ground: ${want ?? 'nothing'}`);
    if (want) assert.equal(d.events[0].source, 'technique', 'behind it as well as in front');
  }
});

test('a quake projectile flies on past a fighter off the ground, and strikes one on it', () => {
  for (const [lifted, want] of [[0, 'hit'], [30, null]]) {
    const d = versus({ gap: 200 });
    if (lifted) hold(d.target, lifted);
    d.tick(P('attack2'));
    for (let i = 0; i < 60; i++) d.tick();
    assert.equal(d.events[0]?.type ?? null, want, `${lifted} above the ground`);
    if (!want) assert.equal(d.projectiles.length + d.events.length, 0, 'flown on through and gone at the end of its life');
  }
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU reads a quake on every strike it weighs, from the data', () => {
  const caps = analyzeCapabilities(makeFighter({ character: STOMPER, sprites: SPRITES }).fighter);
  assert.equal(caps.moves.find((m) => m.key === 'attack1:ground').strikes[0].quake, true);
  assert.equal(caps.moves.find((m) => m.key === 'attack4:ground').burst.hit.quake, true);
  assert.equal(caps.moves.find((m) => m.key === 'attack1:air').strikes[0].quake, false, 'its other strikes are no quakes');
});
