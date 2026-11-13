// Run with node --test tests/systems/max-in-play.test.mjs (no dependencies).
// A projectile's `maxInPlay` (js/game/combat/projectile.js): its thrower
// never has more than that many of its move's projectiles in play at once;
// one more released takes the place of the oldest, gone that step without
// striking. The move is its attack family by codename (moveFamily: a
// ground move's and its mid-air version's count together), and only those
// it threw itself count. #0015's Gift and Air Gift (one present at a time)
// are its first users; their own behaviour is checked in fighter-0015.
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Projectile, createProjectileDefinition, moveFamily, removeDeadProjectiles, spawnProjectiles,
} from '../../js/game/combat/projectile.js';
import { cooldownClass, ROUTINE_EFFECTS } from '../../js/data/cooldowns.js';
import { getCharacter } from '../../js/data/characters.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ANIM = { frames: [{}], fps: 10, loop: true, sourceFacing: 0 };

// A thrower with the projectiles `specs` (id -> spec), releasing nothing yet.
function thrower(specs, x = 100) {
  const projectileDefs = Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, createProjectileDefinition({ id, ...spec })]));
  return { projectileDefs, sprites: { projectile: () => ANIM }, body: { x, y: 500 }, releases: [] };
}
const release = (f, id, n = 1) => {
  for (let i = 0; i < n; i++) f.releases.push({ id, offset: { x: 40 * i, y: -20 }, direction: 1 });
};
const step = (fighters, list) => {
  spawnProjectiles(fighters, list);
  const alive = list.filter((p) => p.alive);
  removeDeadProjectiles(list);
  return alive;
};

const PRESENT = { animation: 'present', speed: 0, lifetime: 6, damage: 5, maxInPlay: 1 };

test('maxInPlay is a whole number from 0, and 0 (no bound) unless authored', () => {
  assert.equal(createProjectileDefinition({ id: 'plain', damage: 1 }).maxInPlay, 0);
  assert.equal(createProjectileDefinition({ id: 'two', damage: 1, maxInPlay: 2 }).maxInPlay, 2);
  for (const bad of [-1, 1.5, '1', null, Infinity]) {
    assert.throws(() => createProjectileDefinition({ id: 'bad', damage: 1, maxInPlay: bad }), /maxInPlay must be a whole number/, String(bad));
  }
});

test('a move\'s family is its codename: the ground move and its mid-air version together', () => {
  assert.equal(moveFamily('attack3_object'), 'attack3');
  assert.equal(moveFamily('midair_attack3_object'), 'attack3');
  assert.equal(moveFamily('attack4_object'), 'attack4');
  assert.equal(moveFamily('extra_attack_object'), 'extra_attack');
  assert.equal(moveFamily('attack3_object_red'), 'attack3', 'a distinct object type of the same move');
});

test('without a bound, a thrower keeps every one it releases', () => {
  const f = thrower({ attack1_object: { animation: 'shot', speed: 0, lifetime: 6, damage: 1 } });
  const list = [];
  release(f, 'attack1_object', 3);
  step([f], list);
  release(f, 'attack1_object', 2);
  assert.equal(step([f], list).length, 5);
});

test('one more released takes the oldest\'s place: gone that step, the newest kept, never more than the bound', () => {
  const f = thrower({ attack3_object: PRESENT, attack5_object: { ...PRESENT, maxInPlay: 2 } });
  const list = [];
  release(f, 'attack3_object');
  const [first] = step([f], list);
  release(f, 'attack3_object');
  const live = step([f], list);
  assert.equal(first.alive, false, 'the oldest is gone');
  assert.equal(live.length, 1);
  assert.notEqual(live[0], first, 'the newest stays');
  // A bound of two keeps the two newest.
  const g = thrower({ attack5_object: { ...PRESENT, maxInPlay: 2 } });
  const shots = [];
  for (let i = 0; i < 4; i++) {
    release(g, 'attack5_object');
    step([g], shots);
  }
  assert.equal(shots.length, 2);
  // Several released on one step: still never more than the bound.
  const h = thrower({ attack5_object: { ...PRESENT, maxInPlay: 2 } });
  const many = [];
  release(h, 'attack5_object', 3);
  assert.equal(step([h], many).length, 2);
});

test('a move\'s ground and mid-air projectiles count together; another move\'s and another thrower\'s never', () => {
  const f = thrower({ attack3_object: PRESENT, midair_attack3_object: PRESENT, attack4_object: { ...PRESENT, maxInPlay: 0 } });
  const g = thrower({ attack3_object: PRESENT }, 900);
  const list = [];
  release(f, 'attack3_object');
  release(f, 'attack4_object');
  release(g, 'attack3_object');
  step([f, g], list);
  release(f, 'midair_attack3_object');
  const live = step([f, g], list);
  assert.deepEqual(live.map((p) => [p.owner === f ? 'f' : 'g', p.def.id]).sort(), [
    ['f', 'attack4_object'], ['f', 'midair_attack3_object'], ['g', 'attack3_object'],
  ].sort(), 'the mid-air one replaced the ground one; the other move\'s and the other thrower\'s stay');
});

test('one another fighter has turned back is that fighter\'s: it never counts for its thrower', () => {
  const f = thrower({ attack3_object: PRESENT });
  const g = thrower({}, 900);
  const list = [];
  release(f, 'attack3_object');
  const [turned] = step([f], list);
  turned.turnBack(g, -1);
  release(f, 'attack3_object');
  step([f], list);
  assert.equal(turned.alive, true, 'still in play, the deflector\'s');
  assert.equal(list.length, 2);
});

test('a projectile retired to make room strikes nothing: it is gone before hits resolve', () => {
  const f = thrower({ attack3_object: PRESENT });
  const list = [];
  release(f, 'attack3_object');
  const [old] = step([f], list);
  release(f, 'attack3_object');
  spawnProjectiles([f], list);
  assert.equal(old.alive, false, 'gone on the step the new one appears');
  assert.ok(old instanceof Projectile);
});

test('it is routine for the cooldown policy: a bounded projectile earns no cooldown', () => {
  assert.ok(ROUTINE_EFFECTS.includes('maxInPlay'));
  const projectiles = { attack3_object: PRESENT };
  assert.equal(cooldownClass('attack', { hitbox: null, projectile: { id: 'attack3_object', spawnAt: 0.1 } }, { projectiles }), 'ordinary');
  const def = getCharacter('0015');
  for (const id of ['attack3_object', 'midair_attack3_object']) assert.equal(def.projectiles[id].maxInPlay, 1, `#0015's ${id}`);
});

test('the shared code names no fighter or move for it', () => {
  const code = readFileSync(`${ROOT}js/game/combat/projectile.js`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /'00\d\d'|Gift|present/i);
});
