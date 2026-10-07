// Run with node --test tests/systems/projectile-clash.test.mjs (no dependencies).
// Projectiles that act on each other (clashProjectiles in
// js/game/combat/projectile.js): when two of different owners meet,
// erasing beats repelling beats neither. A repelled one is turned back,
// its new owner's from then on; an erased one is gone; two of the same
// rank that act both go; two that do neither pass. And an erasing
// projectile flies on through the fighters it strikes, each once. Bespoke
// projectiles on the real runtime and CombatSystem; #0001 and #0002 are
// only owners and bodies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clashProjectiles, createProjectileDefinition, Projectile } from '../../js/game/combat/projectile.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { getCharacter } from '../../js/data/characters.js';
import { DT, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';
import { StageCollision } from '../../js/game/physics.js';

const STAGE = new StageCollision(stageMap());
const ANIM = Object.freeze({ frames: [{}], fps: 1, loop: true });
const kinds = {
  plain: createProjectileDefinition({ id: 'testPlain', speed: 300, lifetime: 2, hitbox: { x: -10, y: -10, w: 20, h: 20 }, damage: 1 }),
  repel: createProjectileDefinition({ id: 'testRepel', speed: 500, lifetime: 2, hitbox: { x: -10, y: -10, w: 20, h: 20 }, damage: 3, repel: true }),
  erase: createProjectileDefinition({ id: 'testErase', speed: 400, lifetime: 2, hitbox: { x: -30, y: -30, w: 60, h: 60 }, damage: 3, erase: true }),
};

const LEFT = makeFighter({ x: 200 }).fighter;
const RIGHT = makeFighter({ x: 1800, facing: -1, character: getCharacter('0002') }).fighter;

// Two projectiles meeting head on at x 1000: `a` LEFT's flying right, `b`
// RIGHT's flying left.
function meet(a, b) {
  const pa = new Projectile({ owner: LEFT, def: kinds[a], anim: ANIM, x: 995, y: 700, direction: 1 });
  const pb = new Projectile({ owner: RIGHT, def: kinds[b], anim: ANIM, x: 1005, y: 700, direction: -1 });
  const list = [pa, pb];
  clashProjectiles(list);
  return [pa, pb];
}

test('the data: repel and erase are off unless authored', () => {
  assert.equal(kinds.plain.repel, false);
  assert.equal(kinds.plain.erase, false);
  assert.equal(kinds.repel.repel, true);
  assert.equal(kinds.erase.erase, true);
});

test('two that do neither pass each other by', () => {
  const [a, b] = meet('plain', 'plain');
  assert.deepEqual([a.alive, b.alive, a.owner, b.owner, a.direction, b.direction], [true, true, LEFT, RIGHT, 1, -1]);
});

test('a repelling one turns the other back, the other\'s owner its own from then on, its strikes starting over', () => {
  const plain = new Projectile({ owner: RIGHT, def: kinds.plain, anim: ANIM, x: 1005, y: 700, direction: -1 });
  plain.hits = 1;
  plain.lastStrike = 0.1;
  const repel = new Projectile({ owner: LEFT, def: kinds.repel, anim: ANIM, x: 995, y: 700, direction: 1 });
  clashProjectiles([plain, repel]);
  assert.equal(repel.alive, true, 'flies on');
  assert.equal(plain.alive, true);
  assert.equal(plain.owner, LEFT, 'turned: its thrower\'s now');
  assert.equal(plain.direction, 1);
  assert.equal(plain.vx, kinds.plain.speed, 'at its own speed, the other way');
  assert.equal(plain.hits, 0);
  assert.equal(plain.lastStrike, -Infinity);
  // It now strikes its first owner, credited to its new one.
  const system = new CombatSystem();
  const target = makeFighter({ x: 1200, facing: -1 }).fighter;
  Object.assign(plain, { x: target.body.x, y: target.body.y - 50 });
  system.update([LEFT, target], [plain], []);
  assert.equal(system.events[0]?.attacker, LEFT);
});

test('erasing beats repelling beats neither; the same rank, when it acts, takes both out', () => {
  const cases = [
    ['repel', 'plain', [true, true], 'the plain one turned'],
    ['erase', 'plain', [true, false], 'erased'],
    ['erase', 'repel', [true, false], 'erasing beats repelling'],
    ['repel', 'repel', [false, false], 'two repelling: both'],
    ['erase', 'erase', [false, false], 'two erasing: both'],
  ];
  for (const [a, b, alive, why] of cases) {
    assert.deepEqual(meet(a, b).map((p) => p.alive), alive, `${a} vs ${b}: ${why}`);
    assert.deepEqual(meet(b, a).map((p) => p.alive), [...alive].reverse(), `${b} vs ${a}: ${why}`);
  }
  const [repel, plain] = meet('repel', 'plain');
  assert.equal(plain.owner, repel.owner);
});

test('one owner\'s projectiles never clash, and apart they never meet', () => {
  const a = new Projectile({ owner: LEFT, def: kinds.erase, anim: ANIM, x: 1000, y: 700, direction: 1 });
  const b = new Projectile({ owner: LEFT, def: kinds.plain, anim: ANIM, x: 1000, y: 700, direction: -1 });
  clashProjectiles([a, b]);
  assert.deepEqual([a.alive, b.alive], [true, true]);
  const c = new Projectile({ owner: RIGHT, def: kinds.erase, anim: ANIM, x: 1300, y: 700, direction: -1 });
  clashProjectiles([a, c]);
  assert.deepEqual([a.alive, c.alive], [true, true]);
});

test('an erasing projectile flies on through every fighter it strikes, each once, and is spent only by its lifetime', () => {
  const owner = makeFighter({ x: 200 }).fighter;
  const first = makeFighter({ x: 600, facing: -1 }).fighter;
  const second = makeFighter({ x: 800, facing: -1 }).fighter;
  const orb = new Projectile({ owner, def: kinds.erase, anim: ANIM, x: 500, y: first.body.y - 50, direction: 1 });
  const system = new CombatSystem();
  const struck = [];
  for (let i = 0; i < steps(1.5) && orb.alive; i++) {
    orb.update(DT, STAGE);
    struck.push(...system.update([owner, first, second], [orb], []).map((e) => e.target));
    system.events.length = 0;
  }
  assert.deepEqual(struck, [first, second], 'each once, in its path');
  assert.ok(orb.alive || orb.age >= kinds.erase.lifetime - 1e-6, 'never stopped by a fighter');
});
