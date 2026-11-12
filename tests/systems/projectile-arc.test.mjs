// Run with node --test tests/systems/projectile-arc.test.mjs (no dependencies).
// A lobbed projectile (`arc: { lift, gravity }`, js/game/combat/projectile.js):
// it leaves going up at `lift` and falls at `gravity`, its `speed` still
// carrying it the way it was thrown, exactly along projectileDrop's curve,
// the one the CPU's predictions share; the floor ends it like any shot, and
// turned back it keeps falling. One that flies straight never moves up or
// down. A gaze projectile is seen, or not, from the side it comes from,
// wherever over the fighter it happens to be. Checked on the real
// Projectile, CombatSystem and CPU prediction, with test-only fighters
// (#0001's body and clips) and #0018's Flash Grenade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectileDefinition, projectileDrop, projectileLaunchVy, Projectile } from '../../js/game/combat/projectile.js';
import { projectileContact, STEP, Track } from '../../js/game/ai/cpu-intelligence/prediction.js';
import { getCharacter } from '../../js/data/characters.js';
import { def, duel, fakeSpritesOf, steps, STAGE, DT } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: -5, y: -5, w: 10, h: 10 };
const lob = (spec = {}) => createProjectileDefinition({ id: 'lob', animation: 'x', speed: 400, lifetime: 2, hitbox: BOX, damage: 1, arc: { lift: 300, gravity: 1200 }, ...spec });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const ANIM = { frames: [{}], fps: 1, loop: true, sourceFacing: 1 };

test('an arc is a lift of 0 or more and a positive gravity, on a projectile that flies; none by default', () => {
  assert.deepEqual(lob().arc, { lift: 300, gravity: 1200 });
  assert.ok(Object.isFrozen(lob().arc));
  assert.equal(createProjectileDefinition({ id: 'shot', speed: 400, damage: 1 }).arc, null, 'a straight shot by default');
  assert.deepEqual(lob({ arc: { lift: 0, gravity: 900 } }).arc, { lift: 0, gravity: 900 }, 'dropped level');
  for (const arc of [{ lift: -1, gravity: 900 }, { lift: 100, gravity: 0 }, { lift: 100 }, { gravity: 900 }, { lift: 'up', gravity: 900 }, true]) {
    assert.throws(() => lob({ arc }), /arc needs a lift of 0 or more and a positive gravity/, JSON.stringify(arc));
  }
  assert.throws(() => lob({ speed: 0 }), /lobbed \(arc\) but has no speed/);
});

test('it flies exactly along projectileDrop\'s curve, step for step: up first, then down; a straight shot keeps its height', () => {
  const def0 = lob();
  assert.equal(projectileLaunchVy(def0), -300);
  const p = new Projectile({ owner: null, def: def0, anim: ANIM, x: 0, y: -100, direction: 1, sprites: null });
  const flat = { void: { left: -1e6, right: 1e6, top: -1e6, bottom: 1e6 }, solids: [] };
  let top = -100;
  for (let k = 1; k <= 60; k++) {
    p.update(DT, flat);
    assert.ok(near(p.x, 400 * k * DT), 'its speed carries it on');
    assert.ok(near(p.y, -100 + projectileDrop(def0, k * DT), 1e-6), `step ${k}: on the curve`);
    top = Math.min(top, p.y);
  }
  assert.ok(near(top, -100 - (300 * 300) / (2 * 1200), 1), 'its apex, lift² / 2 gravity above where it left');
  assert.ok(p.y > -100, 'and down past where it left');
  const straight = createProjectileDefinition({ id: 'shot', animation: 'x', speed: 400, lifetime: 2, hitbox: BOX, damage: 1 });
  const q = new Projectile({ owner: null, def: straight, anim: ANIM, x: 0, y: -100, direction: -1, sprites: null });
  for (let k = 0; k < 30; k++) q.update(DT, flat);
  assert.equal(q.y, -100, 'a straight shot never moves up or down');
  assert.equal(q.vy, 0);
  assert.equal(projectileDrop(straight, 1), 0);
});

test('turned back, it keeps falling where it was; the floor ends it as it ends any shot', () => {
  const def0 = lob();
  const flat = { void: { left: -1e6, right: 1e6, top: -1e6, bottom: 1e6 }, solids: [] };
  const p = new Projectile({ owner: null, def: def0, anim: ANIM, x: 0, y: -100, direction: 1, sprites: null });
  for (let k = 0; k < 10; k++) p.update(DT, flat);
  const vy = p.vy;
  p.turnBack(null, -1);
  assert.equal(p.vx, -400, 'back the other way');
  assert.equal(p.vy, vy, 'still rising or falling as it was');
  const y0 = p.y;
  p.update(DT, flat);
  assert.ok(near(p.y, y0 + projectileDrop(def0, DT, vy)));
  // On the test stage's floor: gone once it comes down into it.
  const floor = new Projectile({ owner: null, def: def0, anim: ANIM, x: 500, y: STAGE.solids[0].y - 40, direction: 1, sprites: null });
  let n = 0;
  while (floor.alive && n++ < 200) floor.update(DT, STAGE);
  assert.equal(floor.alive, false, 'the floor ended it');
  assert.ok(n * DT < 1, 'well before its lifetime');
});

test('the CPU predicts the same curve: a lob meets a fighter it would come down on, and passes over one too close', () => {
  const def0 = lob({ speed: 400, arc: { lift: 200, gravity: 1500 } });
  const model = { def: def0, speed: def0.speed, lifetime: def0.lifetime, hitbox: def0.hitbox };
  const hurt = { hw: 14, top: -80, bottom: 0 };
  const floorY = 600;
  const at = (x) => {
    const foe = new Track(10);
    foe.n = 1;
    foe.x[0] = x;
    foe.y[0] = floorY;
    foe.g[0] = 1;
    return foe;
  };
  const stage = { void: { left: -1e6, right: 1e6, top: -1e6, bottom: 1e6 }, solids: [] };
  const where = (x) => projectileContact(stage, model, 0, floorY - 120, 1, 0, at(x), hurt, {});
  // Where it comes down to a fighter's height, by the curve.
  let k = 1;
  while (floorY - 120 + projectileDrop(def0, k * STEP) < floorY - 85) k++;
  const lands = 400 * k * STEP;
  assert.ok(where(lands + 20).contact >= 0, 'met where it comes down');
  assert.equal(where(60).contact, -1, 'over the head of one too close');
});

test('a gaze lob is seen from the side it comes from: a fighter turned away from it is passed by, wherever it drops', () => {
  const thrower = getCharacter('0018');
  for (const gap of [170, 210, 250]) {
    for (const [targetFacing, lands] of [[-1, true], [1, false]]) {
      const d = duel({ attackerCharacter: thrower, attackerSprites: fakeSpritesOf(thrower), targetCharacter: def, targetSprites: fakeSpritesOf(def), gap, targetFacing });
      d.tick(P('attack3'));
      for (let i = 0; i < steps(1.2); i++) d.tick();
      assert.equal(d.events.some((e) => e.source === 'projectile'), lands, `gap ${gap}, target facing ${targetFacing}`);
    }
  }
});
