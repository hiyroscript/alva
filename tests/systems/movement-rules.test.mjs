// Run with node --test tests/systems/movement-rules.test.mjs (no dependencies).
// The shared movement rules (js/game/fighters/movement.js) against the
// values they are given, not against the universal ones: ground and air
// steering, turning, braking, overspeed (held, let go, reversed; a burst in
// the air), attack momentum and the Step-in (never steered), the hitstun
// drift, the fast fall, the air
// jump and the higher jump's lift, each checked
// with made-up values. Whatever the numbers, the same rules turn them into
// motion; the numbers every fighter actually runs on are checked in
// tests/systems/universal-movement.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  steer, attackDrift, activationStep, attackStartSpeed, hitstunDrag, fastFallVelocity, airJump, highJumpLift,
} from '../../js/game/fighters/movement.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { CONFIG } from '../../js/config.js';
import { DT } from '../helpers/fighter-harness.mjs';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected} (±${tolerance})`);

// Made-up values: none of these is the game's.
const VALUES = Object.freeze({
  maxSpeed: 400,
  acceleration: 3000, deceleration: 2000, turnBoost: 3, overspeedDeceleration: 5000, overspeedHoldDeceleration: 1500,
  airAcceleration: 1500, airDeceleration: 300, airTurnBoost: 1.5, airOverspeedDeceleration: 2500,
  jumpVelocity: 1000, fastFallAcceleration: 9000, fastFallSpeed: 1200, airJumpRatio: 0.8, highJumpHeight: 1.5,
  hitstunFriction: 700, hitstunAirDrag: 90,
});
const body = (fields = {}) => ({ x: 0, y: 0, vx: 0, vy: 0, grounded: true, gravityScale: 1, ...fields });

// Steps of `steer` from `b` holding `dir` until `done`, with `mv`.
function steerUntil(b, mv, dir, done, limit = 600) {
  for (let n = 1; n <= limit; n++) {
    steer(b, mv, dir, DT);
    if (done(b)) return n;
  }
  throw new Error('never reached');
}

// ---- Steering -----------------------------------------------------------------------

test('ground steering: top speed at the supplied acceleration, a stop at the supplied deceleration, whatever they are', () => {
  for (const acceleration of [1200, 3000, 6000]) {
    const mv = { ...VALUES, acceleration };
    const b = body();
    const n = steerUntil(b, mv, 1, (x) => x.vx >= 400);
    assert.equal(n, Math.ceil(400 / (acceleration * DT) - 1e-9), `${acceleration}: steps to top speed`);
    assert.equal(b.vx, 400, 'holding on stays at top speed');
  }
  for (const maxSpeed of [300, 500]) {
    const b = body();
    steerUntil(b, { ...VALUES, maxSpeed }, 1, (x) => x.vx >= maxSpeed);
    assert.equal(b.vx, maxSpeed, `${maxSpeed}: the supplied top speed`);
  }
  for (const deceleration of [1000, 4000]) {
    const b = body({ vx: 400 });
    const n = steerUntil(b, { ...VALUES, deceleration }, 0, (x) => x.vx === 0);
    assert.equal(n, Math.ceil(400 / (deceleration * DT) - 1e-9), `${deceleration}: steps to a stop`);
  }
});

test('turning brakes at acceleration x turnBoost, never softer than letting go; air steering uses the air values', () => {
  const b = body({ vx: 400 });
  steer(b, VALUES, -1, DT);
  near(b.vx, 400 - VALUES.acceleration * VALUES.turnBoost * DT, 1e-9, 'one braking step');
  const soft = { ...VALUES, turnBoost: 0.1 };
  const c = body({ vx: 400 });
  steer(c, soft, -1, DT);
  near(c.vx, 400 - VALUES.deceleration * DT, 1e-9, 'never softer than the deceleration');
  // In the air: airAcceleration, airTurnBoost and the gentle airDeceleration drag.
  const air = body({ grounded: false });
  steer(air, VALUES, 1, DT);
  near(air.vx, VALUES.airAcceleration * DT, 1e-9, 'air acceleration');
  const turning = body({ grounded: false, vx: 400 });
  steer(turning, VALUES, -1, DT);
  near(turning.vx, 400 - VALUES.airAcceleration * VALUES.airTurnBoost * DT, 1e-9, 'air turn');
  const drifting = body({ grounded: false, vx: 400 });
  steer(drifting, VALUES, 0, DT);
  near(drifting.vx, 400 - VALUES.airDeceleration * DT, 1e-9, 'air drag');
});

test('overspeed on the ground: held on it bleeds off gently, let go it brakes, pressed back it turns hard; never at once', () => {
  const held = body({ vx: 900 });
  steer(held, VALUES, 1, DT);
  near(held.vx, 900 - VALUES.overspeedHoldDeceleration * DT, 1e-9, 'held the way it goes: the gentle rate');
  const letGo = body({ vx: 900 });
  steer(letGo, VALUES, 0, DT);
  near(letGo.vx, 900 - VALUES.overspeedDeceleration * DT, 1e-9, 'let go: the overspeed brake');
  // Pressed back: the harder of the turn and the brake.
  const back = body({ vx: 900 });
  steer(back, VALUES, -1, DT);
  near(back.vx, 900 - VALUES.acceleration * VALUES.turnBoost * DT, 1e-9, 'pressed back: the turn, when it is harder');
  const soft = { ...VALUES, turnBoost: 1 };
  const turn = body({ vx: 900 });
  steer(turn, soft, -1, DT);
  near(turn.vx, 900 - soft.overspeedDeceleration * DT, 1e-9, 'never softer than letting go');
  // Holding on, it settles at top speed and stays there: never below it.
  const settle = body({ vx: 900 });
  const n = steerUntil(settle, VALUES, 1, (x) => x.vx <= VALUES.maxSpeed);
  assert.equal(settle.vx, VALUES.maxSpeed);
  assert.equal(n, Math.ceil(500 / (VALUES.overspeedHoldDeceleration * DT) - 1e-9), 'over the whole excess, at the held rate');
  // A softer friction never softens the brake above top speed.
  const sliding = body({ vx: 900 });
  steer(sliding, VALUES, 0, DT, false, 0.2);
  near(sliding.vx, 900 - VALUES.overspeedDeceleration * DT, 1e-9);
});

test('overspeed in the air: a burst of the fighter\'s own bleeds off, a launch\'s flies on under the drag', () => {
  const burst = body({ grounded: false, vx: 900 });
  steer(burst, VALUES, 1, DT, true);
  near(burst.vx, 900 - VALUES.airOverspeedDeceleration * DT, 1e-9, 'a burst, held on');
  const neutral = body({ grounded: false, vx: 900 });
  steer(neutral, VALUES, 0, DT, true);
  near(neutral.vx, 900 - VALUES.airOverspeedDeceleration * DT, 1e-9, 'a burst, let go');
  const launched = body({ grounded: false, vx: 900 });
  steer(launched, VALUES, 1, DT, false);
  near(launched.vx, 900 - VALUES.airDeceleration * DT, 1e-9, 'not a burst: the drag only');
  // Below top speed a burst changes nothing.
  const slow = body({ grounded: false, vx: 300 });
  steer(slow, VALUES, 0, DT, true);
  near(slow.vx, 300 - VALUES.airDeceleration * DT, 1e-9);
});

test('`friction` scales the ground deceleration while nothing is held, never the steering', () => {
  const slide = body({ vx: 300 });
  steer(slide, VALUES, 0, DT, false, 0.5);
  near(slide.vx, 300 - VALUES.deceleration * 0.5 * DT, 1e-9, 'half the deceleration');
  const held = body({ vx: 100 });
  steer(held, VALUES, 1, DT, false, 0.5);
  near(held.vx, 100 + VALUES.acceleration * DT, 1e-9, 'held: the whole acceleration');
  const air = body({ grounded: false, vx: 300 });
  steer(air, VALUES, 0, DT, false, 0.5);
  near(air.vx, 300 - VALUES.airDeceleration * DT, 1e-9, 'in the air: the drag alone');
});

// ---- Attacks ------------------------------------------------------------------------

test('attack momentum: an attack keeps its share of the speed, all of it unless it says otherwise, never capped', () => {
  const atk = createAttackDefinition({ id: 'fixture', animation: 'x', damage: 1, momentum: 0.5, airMomentum: 0.25 });
  assert.equal(attackStartSpeed(atk, 300, true), 150);
  assert.equal(attackStartSpeed(atk, 1200, true), 600, 'a Dash\'s burst carries on: no cap');
  assert.equal(attackStartSpeed(atk, -1200, true), -600);
  assert.equal(attackStartSpeed(atk, 900, false), 225, 'in the air: airMomentum');
  const plain = createAttackDefinition({ id: 'plain', animation: 'x', damage: 1 });
  assert.deepEqual([plain.momentum, plain.airMomentum, plain.friction], [1, 1, 1]);
  assert.equal(attackStartSpeed(plain, 1250, true), 1250, 'all of it');
  assert.equal(attackStartSpeed(plain, -1250, false), -1250);
});

test('an attack\'s drift: its Step-in once, on the ground, the way it faces; no steering on the ground, the air control in the air', () => {
  const stepping = createAttackDefinition({ id: 's', animation: 'x', damage: 1, step: { at: 0.05, speed: 250 }, friction: 0.5 });
  const record = { def: stepping, time: 0, step: activationStep(stepping, true), stepped: false };
  const b = body();
  attackDrift(b, VALUES, -1, record, -1, DT);
  assert.equal(b.vx, 0, 'not yet, and the direction held moves nothing on the ground');
  record.time = 0.05;
  attackDrift(b, VALUES, -1, record, 1, DT);
  near(b.vx, -250 + VALUES.deceleration * 0.5 * DT, 1e-9, 'stepped in the way it faces, then running down under its friction, held back or not');
  assert.equal(record.stepped, true);
  const after = b.vx;
  record.time = 0.1;
  attackDrift(b, VALUES, -1, record, -1, DT);
  near(b.vx, after + VALUES.deceleration * 0.5 * DT, 1e-9, 'once only, and held on it runs down all the same');
  const fast = body({ vx: -600 });
  attackDrift(fast, VALUES, -1, { def: stepping, time: 0.05, step: stepping.step, stepped: false }, -1, DT);
  near(fast.vx, -600 + VALUES.overspeedDeceleration * DT, 1e-9, 'already faster: the step-in never slows it, held on or not');
  // Off the ground as its time comes: never made, and never later.
  const air = body({ grounded: false });
  const late = { def: stepping, time: 0.05, step: stepping.step, stepped: false };
  attackDrift(air, VALUES, 1, late, 0, DT);
  assert.deepEqual([air.vx, late.stepped], [0, true], 'skipped in the air');
  air.grounded = true;
  late.time = 0.1;
  attackDrift(air, VALUES, 1, late, 0, DT);
  assert.equal(air.vx, 0, 'never fired late on landing');
  // Started in the air: no Step-in at all.
  assert.equal(activationStep(stepping, false), null);
  assert.equal(activationStep(stepping, true), stepping.step);
  // In the air: the universal air control, exactly as outside an attack.
  for (const [vx, dir] of [[0, 1], [300, -1], [300, 0], [900, 1]]) {
    const during = body({ grounded: false, vx });
    const free = body({ grounded: false, vx });
    attackDrift(during, VALUES, 1, { def: stepping, time: 0.2, step: null, stepped: true }, dir, DT, true);
    steer(free, VALUES, dir, DT, true);
    assert.equal(during.vx, free.vx, `${vx} held ${dir}: the air control`);
  }
});

// ---- The rest ------------------------------------------------------------------------

test('hitstun drift, fast fall, air jump and the higher jump read the values they are given', () => {
  assert.equal(hitstunDrag(VALUES, true), VALUES.hitstunFriction);
  assert.equal(hitstunDrag(VALUES, false), VALUES.hitstunAirDrag);
  // The fast fall: toward fastFallSpeed, never a jump in speed, never slower.
  near(fastFallVelocity(100, VALUES, DT), 100 + VALUES.fastFallAcceleration * DT, 1e-9, 'speeding up');
  assert.equal(fastFallVelocity(1190, VALUES, DT), VALUES.fastFallSpeed, 'capped');
  assert.equal(fastFallVelocity(1500, VALUES, DT), 1500, 'never slower');
  // The air jump: airJumpRatio x the jump speed, upward, and nothing else:
  // whatever sideways speed the body has carries straight through it.
  for (const vx of [-650, 0, 120, 1250]) {
    const b = body({ grounded: false, vx, vy: 300 });
    airJump(b, VALUES);
    assert.deepEqual([b.vy, b.vx], [-800, vx], `${vx}: a fresh rise, the drift untouched`);
  }
  // The higher jump's lift: the share of gravity under which the rise left
  // tops out at exactly highJumpHeight x the normal jump's height.
  const g = CONFIG.sim.gravity;
  const v = 900;
  const normal = (v * v) / (2 * g);
  for (const highJumpHeight of [1.2, 1.5, 2]) {
    const rise = body({ grounded: false, y: -40, vy: -700 });
    const lift = highJumpLift(rise, { ...VALUES, jumpVelocity: v, highJumpHeight }, 0, g);
    assert.ok(lift > 0 && lift < 1, `${highJumpHeight}: lighter gravity`);
    near(40 + (rise.vy * rise.vy) / (2 * g * lift), normal * highJumpHeight, 1e-6, `${highJumpHeight}: its apex`);
  }
  // Already rising faster than the target needs: full gravity, never more.
  assert.equal(highJumpLift(body({ y: -40, vy: -900 }), { ...VALUES, jumpVelocity: v, highJumpHeight: 1 }, 0, g), 1, 'never more than gravity');
  assert.equal(highJumpLift(body({ vy: -700 }), VALUES, 0, 0), 1, 'no gravity, no lift');
});

test('movement rules contain no tap detector or tap window', async () => {
  const rules = await import('../../js/game/fighters/movement.js');
  const { BASE_FIGHTER_MOVEMENT } = await import('../../js/data/movement.js');
  assert.equal('readDashTap' in rules, false);
  assert.equal('dashTapWindow' in BASE_FIGHTER_MOVEMENT, false);
});
