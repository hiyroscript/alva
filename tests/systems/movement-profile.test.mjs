// Run with node --test tests/systems/movement-profile.test.mjs (no dependencies).
// The shared movement rules (js/game/fighters/movement.js) against the
// values they are given, not against any one fighter's: ground and air
// steering, turning, braking, overspeed, attack momentum, the hitstun
// drift, the fast fall, the air jump, the higher jump's lift and the Dash's
// double tap, each checked with made-up movement profiles. Then every
// playable fighter through the real Fighter, each held to its own profile
// and Powers: whatever the numbers, the same rules turn them into motion.
// (Each fighter's exact values are checked in its own tests: see
// tests/systems/movement.test.mjs and tests/fighters/.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  steer, steerAttack, attackStartSpeed, hitstunDrag, fastFallVelocity, airJump, highJumpLift, readDashTap,
} from '../../js/game/fighters/movement.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { playableCharacters } from '../../js/data/characters.js';
import { getMaxSpeed, getJumpVelocity } from '../../js/data/powers.js';
import { CONFIG } from '../../js/config.js';
import { DT, harnessFor } from '../helpers/fighter-harness.mjs';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected} (±${tolerance})`);

// A made-up profile: none of these is any fighter's.
const PROFILE = Object.freeze({
  acceleration: 3000, deceleration: 2000, turnBoost: 3, overspeedDeceleration: 5000,
  airAcceleration: 1500, airDeceleration: 300, airTurnBoost: 1.5,
  fastFallAcceleration: 9000, fastFallSpeed: 1200, airJumpRatio: 0.8, highJumpHeight: 1.5, dashTapWindow: 0.2,
});
const body = (fields = {}) => ({ x: 0, y: 0, vx: 0, vy: 0, grounded: true, gravityScale: 1, ...fields });

// Steps of `steer` from `b` holding `dir` until `done`, with `mv` and `top`.
function steerUntil(b, mv, top, dir, done, limit = 600) {
  for (let n = 1; n <= limit; n++) {
    steer(b, mv, top, dir, 1, 1, DT);
    if (done(b)) return n;
  }
  throw new Error('never reached');
}

// ---- The rules, with supplied values -----------------------------------------------

test('ground steering: top speed at the supplied acceleration, a stop at the supplied deceleration, whatever they are', () => {
  for (const acceleration of [1200, 3000, 6000]) {
    const mv = { ...PROFILE, acceleration };
    const b = body();
    const n = steerUntil(b, mv, 400, 1, (x) => x.vx >= 400);
    assert.equal(n, Math.ceil(400 / (acceleration * DT) - 1e-9), `${acceleration}: steps to top speed`);
    assert.equal(b.vx, 400, 'never past top speed');
  }
  for (const deceleration of [1000, 4000]) {
    const b = body({ vx: 400 });
    const n = steerUntil(b, { ...PROFILE, deceleration }, 400, 0, (x) => x.vx === 0);
    assert.equal(n, Math.ceil(400 / (deceleration * DT) - 1e-9), `${deceleration}: steps to a stop`);
  }
});

test('turning brakes at acceleration x turnBoost, never softer than letting go; air steering uses the air values', () => {
  const b = body({ vx: 400 });
  steer(b, PROFILE, 400, -1, 1, 1, DT);
  near(b.vx, 400 - PROFILE.acceleration * PROFILE.turnBoost * DT, 1e-9, 'one braking step');
  const soft = { ...PROFILE, turnBoost: 0.1 };
  const c = body({ vx: 400 });
  steer(c, soft, 400, -1, 1, 1, DT);
  near(c.vx, 400 - PROFILE.deceleration * DT, 1e-9, 'never softer than the deceleration');
  // In the air: airAcceleration, airTurnBoost (turnBoost when left out) and
  // the gentle airDeceleration drag.
  const air = body({ grounded: false });
  steer(air, PROFILE, 400, 1, 1, 1, DT);
  near(air.vx, PROFILE.airAcceleration * DT, 1e-9, 'air acceleration');
  const turning = body({ grounded: false, vx: 400 });
  steer(turning, { ...PROFILE, airTurnBoost: undefined }, 400, -1, 1, 1, DT);
  near(turning.vx, 400 - PROFILE.airAcceleration * PROFILE.turnBoost * DT, 1e-9, 'airTurnBoost defaults to turnBoost');
  const drifting = body({ grounded: false, vx: 400 });
  steer(drifting, PROFILE, 400, 0, 1, 1, DT);
  near(drifting.vx, 400 - PROFILE.airDeceleration * DT, 1e-9, 'air drag');
});

test('above top speed on the ground the excess bleeds off at overspeedDeceleration; `control` scales steering and top speed', () => {
  const b = body({ vx: 900 });
  steer(b, PROFILE, 400, 1, 1, 1, DT);
  near(b.vx, 900 - PROFILE.overspeedDeceleration * DT, 1e-9, 'overspeed');
  const plain = body({ vx: 900 });
  steer(plain, { ...PROFILE, overspeedDeceleration: undefined }, 400, 1, 1, 1, DT);
  near(plain.vx, 900 - PROFILE.deceleration * DT, 1e-9, 'no overspeedDeceleration: just the deceleration');
  const half = body();
  for (let i = 0; i < 120; i++) steer(half, PROFILE, 400, 1, 0.5, 1, DT);
  assert.equal(half.vx, 200, 'half control: half the top speed');
});

test('attack momentum: an attack keeps its share of the speed, capped by that share of top speed on the ground', () => {
  const atk = createAttackDefinition({ id: 'fixture', animation: 'x', momentum: 0.5, airMomentum: 0.25 });
  assert.equal(attackStartSpeed(atk, 300, true, 400), 150);
  assert.equal(attackStartSpeed(atk, 900, true, 400), 200, 'a Dash burst never becomes a lunge');
  assert.equal(attackStartSpeed(atk, -900, true, 400), -200);
  assert.equal(attackStartSpeed(atk, 900, false, 400), 225, 'in the air: airMomentum, uncapped');
  const free = createAttackDefinition({ id: 'free', animation: 'x', lockMovement: false });
  assert.equal(attackStartSpeed(free, 900, true, 400), 900, 'normal locomotion kept: all of it');
  // Its step-in raises the forward speed once its time reaches `at`, then
  // its own control steers.
  const stepping = createAttackDefinition({ id: 's', animation: 'x', step: { at: 0.05, speed: 250 }, control: 0 });
  const record = { def: stepping, time: 0, stepped: false };
  const b = body();
  steerAttack(b, PROFILE, 400, -1, record, 0, DT);
  assert.equal(b.vx, 0, 'not yet');
  record.time = 0.05;
  steerAttack(b, PROFILE, 400, -1, record, 0, DT);
  near(b.vx, -250 + PROFILE.deceleration * DT, 1e-9, 'stepped in the way it faces, then braking');
  assert.equal(record.stepped, true);
});

test('hitstun drift, fast fall, air jump and the higher jump read the profile, with their documented defaults', () => {
  assert.equal(hitstunDrag({ ...PROFILE, hitstunFriction: 700 }, true), 700);
  assert.equal(hitstunDrag(PROFILE, true), PROFILE.deceleration / 2, 'default: half the deceleration');
  assert.equal(hitstunDrag(PROFILE, false), PROFILE.airDeceleration / 2, 'default: half the air drag');
  // The fast fall: toward fastFallSpeed, never a jump in speed, never slower.
  near(fastFallVelocity(100, PROFILE, DT), 100 + PROFILE.fastFallAcceleration * DT, 1e-9, 'speeding up');
  assert.equal(fastFallVelocity(1190, PROFILE, DT), PROFILE.fastFallSpeed, 'capped');
  assert.equal(fastFallVelocity(1500, PROFILE, DT), 1500, 'never slower');
  // The air jump: airJumpRatio x the jump speed (1 when left out); a held
  // direction sets off that way at least at top speed.
  const b = body({ grounded: false, vx: -100 });
  airJump(b, PROFILE, 1000, 400, 1);
  assert.equal(b.vy, -800);
  assert.equal(b.vx, 400);
  const c = body({ grounded: false, vx: 50 });
  airJump(c, { ...PROFILE, airJumpRatio: undefined }, 1000, 400, 0);
  assert.deepEqual([c.vy, c.vx], [-1000, 50], 'no ratio, no direction: the jump speed, the drift kept');
  // The higher jump's lift: the share of gravity under which the rise left
  // tops out at exactly highJumpHeight x the normal jump's height.
  const g = CONFIG.sim.gravity;
  const normal = (900 * 900) / (2 * g);
  for (const highJumpHeight of [1.2, 1.5, 2]) {
    const rise = body({ grounded: false, y: -40, vy: -700 });
    const lift = highJumpLift(rise, { ...PROFILE, highJumpHeight }, 900, 0, g);
    assert.ok(lift > 0 && lift < 1, `${highJumpHeight}: lighter gravity`);
    near(40 + (rise.vy * rise.vy) / (2 * g * lift), normal * highJumpHeight, 1e-6, `${highJumpHeight}: its apex`);
  }
  // Already rising faster than the target needs: full gravity, never more.
  assert.equal(highJumpLift(body({ y: -40, vy: -900 }), { ...PROFILE, highJumpHeight: 1 }, 900, 0, g), 1, 'never more than gravity');
  assert.equal(
    highJumpLift(body({ y: -40, vy: -700 }), { ...PROFILE, highJumpHeight: undefined }, 900, 0, g),
    highJumpLift(body({ y: -40, vy: -700 }), { ...PROFILE, highJumpHeight: 1 }, 900, 0, g),
    'highJumpHeight defaults to 1',
  );
  assert.equal(highJumpLift(body({ vy: -700 }), PROFILE, 900, 0, 0), 1, 'no gravity, no lift');
});

test('the double tap: the same direction again within dashTapWindow is a Dash; any other press starts over', () => {
  const press = (dir) => ({ runRightPressed: dir > 0, runLeftPressed: dir < 0 });
  for (const window of [0.1, 0.3]) {
    const mv = { ...PROFILE, dashTapWindow: window };
    let state = readDashTap(null, press(1), mv, DT);
    assert.equal(state.direction, 0);
    let tap = state.tap;
    const within = Math.floor(window / DT);
    for (let i = 1; i < within; i++) tap = readDashTap(tap, {}, mv, DT).tap;
    state = readDashTap(tap, press(1), mv, DT);
    assert.equal(state.direction, 1, `${window}: inside the window`);
    assert.equal(state.tap, null, 'and it starts over');
    let late = readDashTap(null, press(-1), mv, DT).tap;
    for (let i = 0; i < within + 2; i++) late = readDashTap(late, {}, mv, DT).tap;
    state = readDashTap(late, press(-1), mv, DT);
    assert.equal(state.direction, 0, `${window}: too late`);
    assert.deepEqual(state.tap, { direction: -1, age: 0 }, 'too late: the new first tap');
  }
  assert.equal(readDashTap({ direction: 1, age: 0 }, press(-1), PROFILE, DT).direction, 0, 'the other way: no Dash');
});

// ---- Every playable fighter, held to its own profile --------------------------------

for (const character of playableCharacters()) {
  const mv = character.movement;
  const { makeFighter } = harnessFor(character);

  test(`${character.displayName} runs, turns and stops by its own profile and Speed Power`, () => {
    const { fighter, step } = makeFighter();
    const top = getMaxSpeed(character);
    assert.equal(fighter.maxSpeed, top);
    let n = 0;
    while (fighter.body.vx < top && n < 120) {
      step({ runRight: true });
      n++;
    }
    assert.equal(n, Math.ceil(top / (mv.acceleration * DT) - 1e-9), 'steps to top speed at its acceleration');
    let stop = 0;
    while (fighter.body.vx > 0 && stop < 120) {
      step({});
      stop++;
    }
    assert.equal(stop, Math.ceil(top / (mv.deceleration * DT) - 1e-9), 'steps to a stop at its deceleration');
  });

  test(`${character.displayName} jumps by its Jump Power, air-jumps by its airJumpRatio and Dashes by its dashSpeed`, () => {
    const g = CONFIG.sim.gravity * mv.gravityScale;
    const v = getJumpVelocity(character);
    // The normal jump: a tap.
    const jumper = makeFighter();
    const ground = jumper.fighter.body.y;
    jumper.step({ jump: true, jumpPressed: true });
    let apex = ground;
    while (!jumper.fighter.grounded || apex === ground) {
      jumper.step({});
      apex = Math.min(apex, jumper.fighter.body.y);
      if (jumper.fighter.body.vy >= 0) break;
    }
    near(ground - apex, (v * v) / (2 * g), v * DT, 'the normal jump\'s height');
    // An air jump from its apex rises airJumpRatio^2 as high.
    if (mv.airJumps > 0) {
      const from = jumper.fighter.body.y;
      jumper.step({ jump: true, jumpPressed: true });
      let top = from;
      while (jumper.fighter.body.vy < 0) top = Math.min(top, jumper.step({}).body.y);
      const ratio = mv.airJumpRatio ?? 1;
      near(from - top, (ratio * v) ** 2 / (2 * g), ratio * v * DT, 'the air jump\'s height');
    }
    // A Dash: one pass of its own mouvment clip at its own dashSpeed.
    if (mv.dashSpeed > 0) {
      const dasher = makeFighter();
      const clip = character.animations.mouvment;
      assert.equal(dasher.fighter.dashDuration, clip.frames.length / clip.fps, 'one pass of its own mouvment clip');
      dasher.step({ runRight: true, runRightPressed: true });
      dasher.step({});
      const x0 = dasher.fighter.body.x;
      dasher.step({ runRight: true, runRightPressed: true });
      assert.equal(dasher.fighter.state, 'dash');
      let steps = 1;
      while (dasher.fighter.state === 'dash') {
        dasher.step({});
        steps++;
      }
      assert.equal(steps - 1, Math.round(dasher.fighter.dashDuration / DT), 'the Dash lasts its clip');
      near(dasher.fighter.body.x - x0, mv.dashSpeed * dasher.fighter.dashDuration, mv.dashSpeed * DT * 2, 'its reach');
    }
  });
}

test('two fighters with different profiles move differently under the same rules: nothing is shared but the rules', () => {
  const profiles = playableCharacters().map((c) => JSON.stringify({ movement: c.movement, powers: c.powers }));
  // Not a requirement on the roster: a check that the per-fighter tests above
  // ran over distinct profiles, so they prove the numbers are each fighter's own.
  if (new Set(profiles).size < 2) return;
  const runs = playableCharacters().map((c) => {
    const { fighter, step } = harnessFor(c).makeFighter();
    for (let i = 0; i < 30; i++) step({ runRight: true });
    return fighter.body.x;
  });
  assert.ok(new Set(runs).size > 1, 'their own numbers, their own motion');
});
