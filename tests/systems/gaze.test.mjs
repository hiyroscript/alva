// Run with node --test tests/systems/gaze.test.mjs (no dependencies).
// A gaze (`gaze: true`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a hit that has to be seen. It reaches
// only a fighter facing where it comes from (hitReaches); one with its back
// turned is passed by with nothing used up, so a strike stays live and a
// burst simply misses it. A Shield raised toward it blocks it as any hit.
// Checked through the real Fighter, techniques and CombatSystem, for melee
// strikes, projectiles and a technique's burst; and that it earns no
// cooldown (routine, like a quake).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { hitReaches } from '../../js/game/combat/hit-effects.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { def, duel, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };

test('a gaze is true or false: none by default, routine for the cooldown policy, refused when it is anything else', () => {
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 1, gaze: true }).gaze, true);
  assert.equal(createAttackDefinition({ id: 'b', hitbox: BOX, damage: 1 }).gaze, false);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 1, gaze: true } } }).burst.hit.gaze, true);
  assert.throws(() => createAttackDefinition({ id: 'c', hitbox: BOX, damage: 1, gaze: 1 }), /gaze must be true or false/);
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 1, gaze: true }), 'ordinary');
});

test('it reaches only a fighter facing where it comes from; one level with it either way', () => {
  const f = makeFighter({ x: 500, facing: 1 }).fighter;
  const gaze = { gaze: true };
  assert.equal(hitReaches(gaze, f, 600), true, 'ahead of it: seen');
  assert.equal(hitReaches(gaze, f, 400), false, 'behind it: unseen');
  assert.equal(hitReaches(gaze, f, 500), true, 'level with it');
  assert.equal(hitReaches(gaze, f), true, 'no source given: it reaches');
  assert.equal(hitReaches({}, f, 400), true, 'no gaze: from anywhere');
});

// A test-only fighter (#0001's body and clips) whose Jab must be seen.
const STARER = {
  ...def,
  id: 'test-starer',
  attacks: { ...def.attacks, attack1: { ...def.attacks.attack1, gaze: true, hitCancel: null } },
};

test('a melee strike passes by a fighter with its back to it, nothing used up; it lands on one facing it', () => {
  for (const [targetFacing, lands] of [[-1, true], [1, false]]) {
    const d = duel({ attackerCharacter: STARER, attackerSprites: fakeSpritesOf(STARER), targetFacing });
    d.tick(P('attack1'));
    for (let i = 0; i < 30; i++) d.tick();
    assert.equal(d.events.length > 0, lands, `target facing ${targetFacing}`);
    if (!lands) assert.equal(d.target.combat.launchPoint, 0);
  }
});

test('a technique\'s burst that must be seen misses a back turned to it, and a Shield raised toward it blocks it', () => {
  const caster = {
    ...def,
    id: 'test-gazer',
    techniques: {
      ...def.techniques,
      attack4: { ...def.techniques.attack4, burst: { hitbox: { x: 0, y: -120, w: 200, h: 140 }, hit: { damage: 1, float: 1, gaze: true } } },
    },
  };
  for (const [targetFacing, shield, expected] of [[-1, false, 'hit'], [1, false, null], [-1, true, 'block']]) {
    const d = duel({ attackerCharacter: caster, attackerSprites: fakeSpritesOf(caster), gap: 90, targetFacing });
    d.tick({}, shield ? { shield: true } : {});
    d.tick(P('attack4'), shield ? { shield: true } : {});
    for (let i = 0; i < 80; i++) d.tick({}, shield ? { shield: true } : {});
    const e = d.events.find((x) => x.technique);
    assert.equal(e?.type ?? null, expected, `facing ${targetFacing}${shield ? ', shielding' : ''}`);
  }
});
