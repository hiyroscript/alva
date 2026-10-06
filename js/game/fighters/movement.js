// Movement mechanics: the universal rules that turn a fighter's movement
// profile into velocity, the same rules for every fighter.
//
// Purpose: how ground acceleration and braking, turning, air steering, an
// attack's momentum, the hitstun drift, the fast fall, the air jump, the
// higher jump and the double tap (the Dash's and the air dash's) work. A
// fighter never changes these rules; it only supplies the numbers they
// read.
//
// Inputs: the fighter's `movement` entry (its definition in
// js/data/characters/<id>.js), its top speed and jump speed from its Powers
// (js/data/powers.js), an attack definition where one is playing
// (js/game/combat/attacks.js), and the body being moved (js/game/physics.js).
//
// Outputs: pure functions. Each one reads what it is given and writes only
// the body (or the tap record) it is handed; none keeps state of its own.
//
// Important constraints: the Fighter (js/game/fighters/fighter.js) owns all
// movement state (the body, the Dash, the jump buffer, the higher jump, air
// jumps left) and the order things happen in each fixed step; it calls
// these. Values are read on every call, never cached, so the same profile
// always moves the same way, step for step.
//
// The movement profile, every field in world units and seconds (a missing
// field takes the default named here; nothing is validated beyond that):
//
//   acceleration          ground: speed gained per second toward top speed
//   deceleration          ground: speed lost per second while not steering
//   turnBoost             ground: x acceleration while braking against the
//                         way it moves (never softer than deceleration)
//   overspeedDeceleration ground: braking above top speed, e.g. after a
//                         Dash (default 0: just deceleration)
//   airAcceleration       air: speed gained per second toward top speed
//   airDeceleration       air: the gentle drag while not steering
//   airTurnBoost          air: as turnBoost (default: turnBoost)
//   hitstunFriction       ground drag while stunned (default deceleration / 2)
//   hitstunAirDrag        air drag while stunned (default airDeceleration / 2)
//   fastFallAcceleration  Down held while falling: extra fall speed per second
//   fastFallSpeed         ...up to this fall speed (0 or less: no fast fall)
//   airJumps              jumps in the air before landing (default 0)
//   airJumpRatio          an air jump's speed, x the normal jump's (default 1)
//   highJumpWindow        Jump held this long after takeoff makes the
//                         higher jump (default: never)
//   highJumpHeight        the higher jump's height, x the normal jump's
//                         (default 1)
//   dashSpeed             the Dash's speed (0 or missing: no Dash)
//   dashTapWindow         seconds between the two taps of a double tap
//                         (default 0), on the ground and in the air
//   airDashSpeed          the air dash's speed, flat across the air (0 or
//                         missing: no air dash; see Fighter.tryAirDash)
//   airDashUses           air dashes per airtime, given back on landing and
//                         by a hit (default 1)
//   attackBuffer          seconds an early attack press is kept (default 0:
//                         none)
//   coyoteTime, jumpBuffer, gravityScale, maxFallSpeed, dropThroughTime
//                         read by the Fighter and the physics directly
//
// Top speed (Speed Power) and jump speed (Jump Power) are not in the
// profile: they come from the fighter's Power tiers.

import { approach, clamp, sign } from '../../core/utils.js';

// Clocks and speeds here are sums of fixed steps, which drift just below
// whole-step boundaries; compare against them with a little slack (see
// TIME_EPSILON in js/game/fighters/fighter.js).
const EPSILON = 1e-6;

// One step of horizontal steering on whatever `body` stands on (or in the
// air), with `control` (0-1) of the fighter's normal steering: that share
// of its acceleration and of `maxSpeed`. `friction` scales the ground
// deceleration that slows it while it is not steering. `mv` is the
// fighter's movement profile and `dir` the direction held (-1, 0 or 1).
//
// Ground: from rest to top speed at `acceleration`; letting go stops it at
// `deceleration`; pressing against the way it moves brakes at
// acceleration x `turnBoost` until that way is spent, then accelerates the
// new way, so a turn is quick but never a jump from one full speed to the
// other. Faster than top speed (a Dash's burst, run down after it ends)
// the excess bleeds off at `overspeedDeceleration`, whatever is held.
// Air: the same shape with `airAcceleration`, `airTurnBoost` and the
// gentle `airDeceleration` drag, so steering bends the drift instead of
// replacing it. Holding the way it already moves never slows the fighter
// beyond the drag, however fast it goes.
export function steer(body, mv, maxSpeed, dir, control, friction, dt) {
  const grounded = body.grounded;
  const v = body.vx;
  const top = maxSpeed * control;
  const accel = (grounded ? mv.acceleration : mv.airAcceleration) * control;
  const boost = grounded ? mv.turnBoost : mv.airTurnBoost ?? mv.turnBoost;
  let drag = grounded ? mv.deceleration * friction : mv.airDeceleration;
  if (grounded && Math.abs(v) > maxSpeed + EPSILON) drag = Math.max(drag, mv.overspeedDeceleration ?? 0);
  if (!dir || control <= 0) {
    body.vx = approach(v, 0, drag * dt);
  } else if (v !== 0 && sign(v) !== dir) {
    // Reversing: brake hard (never softer than letting go), then whatever
    // is left of this step accelerates the new way.
    const brake = Math.max(accel * boost, drag) * dt;
    body.vx = brake <= Math.abs(v) ? v + dir * brake : dir * Math.min(top, Math.min(brake - Math.abs(v), accel * dt));
  } else if (Math.abs(v) > top) {
    body.vx = approach(v, dir * top, drag * dt);
  } else {
    body.vx = approach(v, dir * top, accel * dt);
  }
}

// One step of attack record `atk`'s own movement (see the attack fields in
// js/game/combat/attacks.js) for a fighter facing `facing`: its step-in once
// its time reaches it (on the ground only), then steering with the attack's
// share of control (none by default) over the speed it started with, the
// rest running down under its friction.
export function steerAttack(body, mv, maxSpeed, facing, atk, dir, dt) {
  const def = atk.def;
  const step = def.step;
  if (step && !atk.stepped && atk.time >= step.at - EPSILON) {
    atk.stepped = true;
    if (body.grounded && body.vx * facing < step.speed) body.vx = facing * step.speed;
  }
  const grounded = body.grounded;
  steer(body, mv, maxSpeed, dir, grounded ? def.control : def.airControl, grounded ? def.friction : 1, dt);
}

// The horizontal speed an attack definition `atk` starting now keeps of
// `vx`: its momentum share (airMomentum in the air), and on the ground never
// more than that share of `maxSpeed`, so a Dash's burst never becomes a
// lunge. An attack that leaves normal locomotion on keeps all of it.
export function attackStartSpeed(atk, vx, grounded, maxSpeed) {
  if (!atk.lockMovement) return vx;
  if (!grounded) return vx * atk.airMomentum;
  const kept = vx * atk.momentum;
  return clamp(kept, -maxSpeed * atk.momentum, maxSpeed * atk.momentum);
}

// How fast a stunned fighter's speed runs down (per second), whatever is
// held: its own hitstun rates, or half its normal ones.
export function hitstunDrag(mv, grounded) {
  return grounded ? mv.hitstunFriction ?? mv.deceleration * 0.5 : mv.hitstunAirDrag ?? mv.airDeceleration * 0.5;
}

// The fall speed one step of the fast fall leaves a fighter falling at `vy`
// with: up toward `fastFallSpeed` at `fastFallAcceleration`, never a jump in
// speed and never slower than the fall already is.
export function fastFallVelocity(vy, mv, dt) {
  return vy < mv.fastFallSpeed ? Math.min(mv.fastFallSpeed, vy + mv.fastFallAcceleration * dt) : vy;
}

// An air jump from wherever `body` is: `airJumpRatio` x the normal jump's
// speed (`jumpVelocity`) upward. A held direction (`held`, -1 or 1) sets off
// that way at least at `maxSpeed`, so it can change course; with none held
// the drift carries on.
export function airJump(body, mv, jumpVelocity, maxSpeed, held) {
  body.vy = -jumpVelocity * (mv.airJumpRatio ?? 1);
  if (held) body.vx = held * Math.max(held * body.vx, maxSpeed);
}

// The share of gravity (0-1) under which a higher jump that took off at
// `fromY` rises from here to top out at `highJumpHeight` x the normal jump's
// height (a jump at `jumpVelocity` under `gravity` x the body's own
// gravityScale): its upward speed now, spent over the height left. Never
// more than full gravity, so it only ever goes higher than the normal jump
// would from here.
export function highJumpLift(body, mv, jumpVelocity, fromY, gravity) {
  const g = gravity * body.gravityScale;
  if (!(g > 0)) return 1;
  const normal = (jumpVelocity * jumpVelocity) / (2 * g);
  const left = normal * (mv.highJumpHeight ?? 1) - (fromY - body.y);
  if (!(left > 0)) return 1;
  return Math.min(1, (body.vy * body.vy) / (2 * g * left));
}

// Double-tap detection on this step's run press edges (runLeftPressed /
// runRightPressed, from any device). `tap` is the press still waiting for
// its second tap ({ direction, age }, or null); it ages by `dt` here. A
// press of the same direction within `dashTapWindow` seconds of it is a
// double tap. Any other press (the other direction, or one too late)
// becomes the new first tap; both directions on one step cancel it.
// Returns { direction, tap }: the Dash asked for (1 right, -1 left, 0 none)
// and the press now waiting.
export function readDashTap(tap, input, mv, dt) {
  if (tap) tap.age += dt;
  if (!input.runLeftPressed && !input.runRightPressed) return { direction: 0, tap };
  if (input.runLeftPressed && input.runRightPressed) return { direction: 0, tap: null };
  const direction = input.runRightPressed ? 1 : -1;
  const window = mv.dashTapWindow ?? 0;
  if (tap && tap.direction === direction && tap.age <= window + EPSILON) return { direction, tap: null };
  return { direction: 0, tap: { direction, age: 0 } };
}
