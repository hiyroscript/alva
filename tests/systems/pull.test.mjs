// Run with node --test tests/systems/pull.test.mjs (no dependencies).
// Pulls (js/game/combat/pull.js): an attack's or a projectile's `pull`
// draws the opponents within its radius toward its point, straight there
// and never past it, dragging a grounded fighter along the ground (lifting
// it only toward a point above its head) and an airborne one along both
// axes. A raised Shield, a paralysed fighter, the owner and a fighter out
// of play are never drawn. One rule for attacks (only while active) and
// projectiles (while they fly). Bespoke pulls on the real Fighter and
// projectiles (see tests/helpers/fighter-harness.mjs); #0001 is only the
// body they act on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPulls, pullToward } from '../../js/game/combat/pull.js';
import { attackReach, createAttackDefinition, resolvePull } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition, Projectile } from '../../js/game/combat/projectile.js';
import { def, DT, makeFighter, steps, stageMap } from '../helpers/fighter-harness.mjs';
import { StageCollision } from '../../js/game/physics.js';

const PULL = Object.freeze({ radius: 200, speed: 600, offset: { x: 0, y: 0 } });
const middle = (f) => f.body.y - f.body.height / 2;

// A grounded fighter at `x`, facing left.
const standing = (x = 600) => makeFighter({ x, facing: -1 });

// ---- Data ---------------------------------------------------------------------------

test('a pull needs a positive radius and speed; its point defaults to the origin', () => {
  assert.equal(resolvePull(null, 'x'), null);
  assert.deepEqual(resolvePull({ radius: 100, speed: 300 }, 'x'), { radius: 100, speed: 300, offset: { x: 0, y: 0 } });
  assert.ok(Object.isFrozen(resolvePull({ radius: 1, speed: 1, offset: { x: 3 } }, 'x').offset));
  assert.throws(() => resolvePull({ radius: 0, speed: 300 }, 'Attack "a"'), /Attack "a"'s pull needs a positive radius and speed/);
  assert.throws(() => resolvePull({ radius: 100 }, 'x'), /positive radius and speed/);
  assert.throws(() => createAttackDefinition({ id: 'testPull', hitbox: { x: 0, y: 0, w: 1, h: 1 }, pull: { radius: -1, speed: 1 } }), /pull/);
  assert.throws(() => createProjectileDefinition({ id: 'testOrb', pull: { speed: 5 } }), /pull/);
  assert.equal(createProjectileDefinition({ id: 'testOrb' }).pull, null);
});

test('the CPU reads an attack\'s reach as its box widened to the pull\'s circle', () => {
  const atk = createAttackDefinition({
    id: 'testPull', hitbox: { x: 10, y: -60, w: 30, h: 30 }, pull: { radius: 100, speed: 500, offset: { x: 40, y: -50 } },
  });
  assert.deepEqual(attackReach(atk), { x: -60, y: -150, w: 200, h: 200 });
  const plain = createAttackDefinition({ id: 'testPlain', hitbox: { x: 10, y: -60, w: 30, h: 30 } });
  assert.deepEqual(attackReach(plain), plain.hitbox);
});

test('nothing in the pull rule names a fighter or a move', () => {
  const code = readFileSync(new URL('../../js/game/combat/pull.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /000\d|attack\d|extra_attack|midair/);
});

// ---- One step of a pull ---------------------------------------------------------------

test('a grounded fighter within the radius is dragged along the ground toward the point, at the pull\'s speed', () => {
  const { fighter } = standing(600);
  const y = middle(fighter);
  assert.equal(pullToward(fighter, 450, y, PULL, DT), true);
  assert.equal(fighter.body.vx, -600);
  assert.equal(fighter.body.vy, 0, 'not lifted');
  assert.equal(fighter.body.grounded, true);
  // Outside the radius: untouched.
  const far = standing(900).fighter;
  assert.equal(pullToward(far, 450, y, PULL, DT), false);
  assert.equal(far.body.vx, 0);
});

test('never past the point: closer than a step\'s travel, it arrives exactly', () => {
  const { fighter } = standing(600);
  pullToward(fighter, 595, middle(fighter), PULL, DT);
  assert.ok(Math.abs(fighter.body.vx * DT + 5) < 1e-9, 'exactly the 5 units left');
  const on = standing(600).fighter;
  on.body.vx = 120;
  assert.equal(pullToward(on, 600, middle(on), PULL, DT), true);
  assert.equal(on.body.vx, 0, 'on the point it stops');
});

test('a point above its head lifts a grounded fighter off the ground; an airborne one is drawn along both axes', () => {
  const { fighter } = standing(600);
  const head = fighter.body.y - fighter.body.height;
  pullToward(fighter, 600, head - 60, PULL, DT);
  assert.ok(fighter.body.vy < 0, 'lifted');
  assert.equal(fighter.body.grounded, false);
  const air = standing(600).fighter;
  Object.assign(air.body, { y: 600, grounded: false, ground: null });
  pullToward(air, 500, middle(air) + 100, PULL, DT);
  assert.ok(Math.abs(air.body.vx - (-600 * Math.SQRT1_2)) < 1e-9);
  assert.ok(Math.abs(air.body.vy - 600 * Math.SQRT1_2) < 1e-9);
});

test('a raised Shield holds its ground, and so does a paralysed fighter or one out of play', () => {
  const shield = standing(600);
  shield.step({ shield: true, shieldPressed: true });
  assert.equal(shield.fighter.combat.shielding, true);
  assert.equal(pullToward(shield.fighter, 450, middle(shield.fighter), PULL, DT), false);
  const held = standing(600).fighter;
  held.combat.paralyze(1);
  assert.equal(pullToward(held, 450, middle(held), PULL, DT), false);
  const gone = standing(600).fighter;
  gone.lostToVoid = true;
  assert.equal(pullToward(gone, 450, middle(gone), PULL, DT), false);
});

// ---- Attacks and projectiles -----------------------------------------------------------

// A fighter whose attack1 is a pulling strike, at x 500 facing right, and a
// target at `x`.
function pullingDuel(x) {
  const character = {
    ...def,
    attacks: {
      ...def.attacks,
      attack1: {
        ...def.attacks.attack1, startup: 0.1, active: 0.2, recovery: 0.1, hitCancel: 0,
        pull: { radius: 220, speed: 800, offset: { x: 40, y: -50 } },
      },
    },
  };
  const a = makeFighter({ character, x: 500 });
  const t = makeFighter({ x, facing: -1 });
  a.fighter.opponent = t.fighter;
  t.fighter.opponent = a.fighter;
  return { a, t };
}

test('an attack pulls only while its active phase is open, toward its own point, and never its owner', () => {
  const { a, t } = pullingDuel(680);
  a.step({ attack1: true, attack1Pressed: true });
  const xs = [];
  for (let i = 0; i < steps(0.5); i++) {
    t.fighter.body.vx = 0;
    applyPulls([a.fighter, t.fighter], [], DT);
    xs.push([a.fighter.combat.phase, t.fighter.body.vx, a.fighter.body.vx]);
    a.step({});
    t.step({});
  }
  const pulled = xs.filter(([, vx]) => vx < 0).map(([phase]) => phase);
  assert.ok(pulled.length > 0, 'drawn in');
  assert.ok(pulled.every((phase) => phase === 'active'), 'only while active');
  assert.ok(xs.filter(([phase]) => phase === 'startup' || phase === 'recovery').every(([, vx]) => vx === 0));
  assert.ok(t.fighter.body.x < 680, 'it came closer');
});

test('a projectile pulls toward its centre for as long as it flies, never its owner, and stops once spent', () => {
  const stage = new StageCollision(stageMap());
  const owner = standing(300).fighter;
  const target = standing(520).fighter;
  const orb = new Projectile({
    owner,
    def: createProjectileDefinition({ id: 'testOrb', speed: 100, lifetime: 0.5, pull: { radius: 200, speed: 400 } }),
    anim: { frames: [{}], fps: 1, loop: true },
    x: 400, y: middle(target), direction: 1,
  });
  applyPulls([owner, target], [orb], DT);
  assert.equal(target.body.vx, -400, 'toward the orb');
  assert.equal(owner.body.vx, 0, 'its owner never');
  target.body.vx = 0;
  for (let i = 0; i < steps(0.5); i++) orb.update(DT, stage);
  assert.equal(orb.alive, false);
  applyPulls([owner, target], [orb], DT);
  assert.equal(target.body.vx, 0, 'spent: no pull');
});
