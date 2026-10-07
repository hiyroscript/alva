// Run with node --test tests/systems/projectile-spin.test.mjs (no dependencies).
// A projectile's spin: its `rotationSpeed` (degrees per second, 0 unless
// authored), art only. Its angle runs on its own age, so it is the same at
// any frame rate and is never reset by being turned back; it never turns
// its hitbox, path or hits. drawCenteredFrame turns the frame round its
// centre, and with no rotation draws exactly as it always has. The canvas
// is a recording stand-in: no wall-clock time is involved anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, getCharacter } from '../../js/data/characters.js';
import { Projectile, createProjectileDefinition, projectileAngle } from '../../js/game/combat/projectile.js';
import { drawCenteredFrame } from '../../js/game/rendering/sprite-normalizer.js';
import { Arena } from '../../js/game/arena.js';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { DT, STAGE, makeFighter } from '../helpers/fighter-harness.mjs';

const DEF_0001 = getCharacter('0001');
const ORBS = ['attack2_object', 'attack3_object', 'attack5_object'];
const near = (a, b) => Math.abs(a - b) < 1e-9;

// A recording 2D context: every call, in order.
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  return { ctx, calls };
}

// A frame as the normalizer leaves it.
const FRAME = { canvas: {}, artW: 30, artH: 20, anchorArtX: 15, anchorArtY: 10 };

test('rotationSpeed is 0 unless authored; #0001\'s Red, Maximum Blue and Hollow Purple spin six turns a second', () => {
  assert.equal(createProjectileDefinition({ id: 'plain', damage: 1 }).rotationSpeed, 0);
  assert.throws(() => createProjectileDefinition({ id: 'bad', damage: 1, rotationSpeed: 'fast' }), /degrees per second/);
  for (const id of ORBS) assert.equal(DEF_0001.projectiles[id].rotationSpeed, 2160, id);
  // Every other projectile is as it was: unrotated.
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    for (const [id, p] of Object.entries(c.projectiles ?? {})) {
      if (c === DEF_0001) continue;
      assert.equal(createProjectileDefinition({ id, ...p }).rotationSpeed, 0, `#${c.id} ${id}`);
    }
  }
});

test('the angle advances with the projectile\'s own age, step for step, and the drawn one with its interpolated age', () => {
  const { fighter } = makeFighter();
  const def = fighter.projectileDefs.attack2_object;
  const p = Projectile.release(fighter, { id: 'attack2_object', offset: { x: 44, y: -70 }, direction: 1 });
  assert.equal(p.angle, 0);
  for (let n = 1; n <= 12; n++) {
    p.update(DT, STAGE);
    assert.ok(near(p.angle, (2160 * n * DT * Math.PI) / 180), `step ${n}`);
    assert.ok(near(p.angle, projectileAngle(def, p.age)));
  }
  // Six whole turns a second: a tenth of a second is 216 degrees.
  assert.ok(near(projectileAngle(def, 0.1), (216 * Math.PI) / 180));
  p.interpolate(0.5);
  assert.ok(near(p.renderAngle, projectileAngle(def, p.age - DT / 2)), 'between the last two steps');
  p.interpolate(1);
  assert.ok(near(p.renderAngle, p.angle));
  // A projectile that does not spin never has an angle.
  assert.equal(projectileAngle(createProjectileDefinition({ id: 'still', damage: 1 }), 3), 0);
});

test('the spin is art only: the hitbox, path and speed are those of the same projectile unspun', () => {
  const { fighter } = makeFighter();
  for (const id of ORBS) {
    const def = fighter.projectileDefs[id];
    const still = createProjectileDefinition({ ...DEF_0001.projectiles[id], id, rotationSpeed: 0 });
    const anim = fighter.sprites.projectile(def.animation);
    const a = new Projectile({ owner: fighter, def, anim, x: 400, y: 700, direction: -1 });
    const b = new Projectile({ owner: fighter, def: still, anim, x: 400, y: 700, direction: -1 });
    for (let n = 0; n < 20; n++) {
      a.update(DT, STAGE);
      b.update(DT, STAGE);
      assert.deepEqual(a.hitbox(), b.hitbox(), `${id} step ${n}: the same box, never turned`);
      assert.deepEqual([a.x, a.y, a.vx, a.alive], [b.x, b.y, b.vx, b.alive]);
    }
    assert.ok(a.angle > 0 && b.angle === 0);
  }
});

test('turned back (a repel or a Deflect), it spins on: the angle runs on its age, never reset', () => {
  const { fighter } = makeFighter();
  const other = makeFighter({ x: 900 }).fighter;
  const p = Projectile.release(fighter, { id: 'attack3_object', offset: { x: 0, y: -60 }, direction: 1 });
  for (let n = 0; n < 7; n++) p.update(DT, STAGE);
  const before = p.angle;
  p.turnBack(other, -1);
  assert.equal(p.angle, before, 'the same angle the step it turns');
  p.update(DT, STAGE);
  assert.ok(near(p.angle, before + (2160 * DT * Math.PI) / 180), 'and on, the same way round');
});

test('drawCenteredFrame turns the frame round its centre, then mirrors it; with no rotation it draws exactly as before', () => {
  const plain = recorder();
  drawCenteredFrame(plain.ctx, FRAME, 100.4, 200.6, 2, false);
  assert.deepEqual(plain.calls.map((c) => c[0]), ['save', 'translate', 'drawImage', 'restore'], 'no rotate at all');
  assert.deepEqual(plain.calls[1], ['translate', 100, 201]);
  assert.deepEqual(plain.calls[2], ['drawImage', FRAME.canvas, -30, -20, 60, 40]);
  const zero = recorder();
  drawCenteredFrame(zero.ctx, FRAME, 100.4, 200.6, 2, false, 0);
  assert.deepEqual(zero.calls, plain.calls, 'rotation 0: identical');

  const spun = recorder();
  drawCenteredFrame(spun.ctx, FRAME, 100.4, 200.6, 2, true, 1.25);
  assert.deepEqual(spun.calls.map((c) => c[0]), ['save', 'translate', 'rotate', 'scale', 'drawImage', 'restore'],
    'translate to the centre, rotate, then mirror');
  assert.deepEqual(spun.calls[2], ['rotate', 1.25]);
  assert.deepEqual(spun.calls[3], ['scale', -1, 1]);
  assert.deepEqual(spun.calls[4], plain.calls[2], 'drawn round the same normalized anchor, at the same size');
});

test('the Arena draws each projectile at its interpolated angle, at the scale of the art it came from', () => {
  const { fighter } = makeFighter();
  const p = Projectile.release(fighter, { id: 'attack5_object', offset: { x: 95, y: -60 }, direction: 1 });
  for (let n = 0; n < 5; n++) p.update(DT, STAGE);
  p.interpolate(0.25);
  const { ctx, calls } = recorder();
  const scales = [];
  const arena = { ctx, toScreen: (x, y) => [x, y], pxPerArtOf: (sprites) => { scales.push(sprites); return 3; } };
  Arena.prototype.drawProjectile.call(arena, p);
  assert.deepEqual(calls.find((c) => c[0] === 'rotate'), ['rotate', p.renderAngle]);
  assert.deepEqual(scales, [fighter.sprites]);
  // A projectile whose art does not spin is drawn unrotated, as ever.
  const two = makeFighter({ character: getCharacter('0002') }).fighter;
  const tornado = Projectile.release(two, { id: 'extra_attack_object', offset: { x: 44, y: -39 }, direction: 1 });
  tornado.update(DT, STAGE);
  tornado.interpolate(1);
  const still = recorder();
  Arena.prototype.drawProjectile.call({ ...arena, ctx: still.ctx }, tornado);
  assert.equal(still.calls.some((c) => c[0] === 'rotate'), false);
  // Turned back, it keeps the size of the art it came from.
  tornado.turnBack(fighter, -1);
  scales.length = 0;
  Arena.prototype.drawProjectile.call(arena, tornado);
  assert.deepEqual(scales, [two.sprites]);
});
