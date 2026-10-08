// Movement mechanics: the universal rules that turn the universal movement
// values into velocity, the same rules and the same numbers for every
// fighter.
//
// Purpose: how ground acceleration and braking, turning, air steering,
// overspeed, an attack's momentum, the hitstun drift, the fast fall, the
// air jump and the higher jump work. No fighter changes these rules or their numbers.
//
// Inputs: the movement values (`mv`: BASE_FIGHTER_MOVEMENT in
// js/data/movement.js, which lists every field), an attack definition
// where one is playing (js/game/combat/attacks.js), and the body being
// moved (js/game/physics.js).
//
// Outputs: pure functions. Each one reads what it is given and writes only
// the body it is handed; none keeps state of its own.
//
// Important constraints: the Fighter (js/game/fighters/fighter.js) owns all
// movement state (the body, the Dash, the burst, the jump buffer, the
// higher jump, air jumps left) and the order things happen in each fixed
// step; it calls these. Values are read on every call, never cached.
//
// Momentum is state worth keeping: nothing here zeroes, clamps or replaces
// a velocity because the fighter changed what it is doing. Speed above top
// speed bleeds off at a rate (overspeed), never at once; a jump, an air
// jump, an attack's start (all of its speed, unless the attack's own data
// keeps less) and a landing keep the sideways speed they find.

import { approach, sign } from '../../core/utils.js';

// Clocks and speeds here are sums of fixed steps, which drift just below
// whole-step boundaries; compare against them with a little slack (see
// TIME_EPSILON in js/game/fighters/fighter.js).
const EPSILON = 1e-6;

// One step of horizontal steering on whatever `body` stands on (or in the
// air), with `control` (0-1) of the normal steering: that share of the
// acceleration and of top speed. `friction` scales the ground deceleration
// that slows it while it is not steering. `mv` is the movement values and
// `dir` the direction held (-1, 0 or 1). `burst`: the speed above top speed
// is the fighter's own (a Dash's or an air dash's; see Fighter.burst), so
// it bleeds off in the air too.
//
// Ground: from rest to top speed at `acceleration`; letting go stops it at
// `deceleration`; pressing against the way it moves brakes at
// acceleration x `turnBoost` until that way is spent, then accelerates the
// new way, so a turn is quick but never a jump from one full speed to the
// other. Faster than top speed (a Dash's burst) the excess bleeds off at
// `overspeedHoldDeceleration` while the fighter holds the way it moves and
// at `overspeedDeceleration` otherwise: keep going and the speed is kept
// longest, let go and it brakes, press back and it turns at once.
// Air: the same shape with `airAcceleration`, `airTurnBoost` and the gentle
// `airDeceleration` drag, so steering bends the drift instead of replacing
// it; a burst above top speed bleeds off at `airOverspeedDeceleration`, and
// any other speed (a launch's) only under the drag.
export function steer(body, mv, dir, control, friction, dt, burst = false) {
  const grounded = body.grounded;
  const v = body.vx;
  const top = mv.maxSpeed * control;
  const accel = (grounded ? mv.acceleration : mv.airAcceleration) * control;
  const boost = grounded ? mv.turnBoost : mv.airTurnBoost;
  const ahead = dir !== 0 && control > 0 && v !== 0 && sign(v) === dir;
  let drag = grounded ? mv.deceleration * friction : mv.airDeceleration;
  if (Math.abs(v) > mv.maxSpeed + EPSILON) {
    if (grounded) drag = ahead ? mv.overspeedHoldDeceleration : Math.max(drag, mv.overspeedDeceleration);
    else if (burst) drag = Math.max(drag, mv.airOverspeedDeceleration);
  }
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
// its time reaches it (on the ground only: never slower than the fighter
// already goes that way), then steering with the attack's share of control
// (none by default) over the speed it started with, the rest running down
// under its friction. `burst` as for steer.
export function steerAttack(body, mv, facing, atk, dir, dt, burst = false) {
  const def = atk.def;
  const step = def.step;
  if (step && !atk.stepped && atk.time >= step.at - EPSILON) {
    atk.stepped = true;
    if (body.grounded && body.vx * facing < step.speed) body.vx = facing * step.speed;
  }
  const grounded = body.grounded;
  steer(body, mv, dir, grounded ? def.control : def.airControl, grounded ? def.friction : 1, dt, burst);
}

// The horizontal speed an attack definition `atk` starting now keeps of
// `vx`: its momentum share (airMomentum in the air), which is all of it
// unless the attack says otherwise. Never capped at top speed: a Dash's
// burst carries on into the attack and bleeds off as overspeed does. An
// attack that leaves normal locomotion on keeps all of it.
export function attackStartSpeed(atk, vx, grounded) {
  if (!atk.lockMovement) return vx;
  return vx * (grounded ? atk.momentum : atk.airMomentum);
}

// How fast a stunned fighter's speed runs down (per second), whatever is
// held: the hitstun rates.
export function hitstunDrag(mv, grounded) {
  return grounded ? mv.hitstunFriction : mv.hitstunAirDrag;
}

// The fall speed one step of the fast fall leaves a fighter falling at `vy`
// with: up toward `fastFallSpeed` at `fastFallAcceleration`, never a jump in
// speed and never slower than the fall already is.
export function fastFallVelocity(vy, mv, dt) {
  return vy < mv.fastFallSpeed ? Math.min(mv.fastFallSpeed, vy + mv.fastFallAcceleration * dt) : vy;
}

// An air jump from wherever `body` is: a fresh rise at `airJumpRatio` x the
// normal jump's speed. Vertical only: the sideways speed carries straight
// through it, and steering bends it from there as the air allows.
export function airJump(body, mv) {
  body.vy = -mv.jumpVelocity * mv.airJumpRatio;
}

// The share of gravity (0-1) under which a higher jump that took off at
// `fromY` rises from here to top out at `highJumpHeight` x the normal jump's
// height (a jump at `jumpVelocity` under `gravity` x the body's own
// gravityScale): its upward speed now, spent over the height left. Never
// more than full gravity, so it only ever goes higher than the normal jump
// would from here.
export function highJumpLift(body, mv, fromY, gravity) {
  const g = gravity * body.gravityScale;
  if (!(g > 0)) return 1;
  const normal = (mv.jumpVelocity * mv.jumpVelocity) / (2 * g);
  const left = normal * mv.highJumpHeight - (fromY - body.y);
  if (!(left > 0)) return 1;
  return Math.min(1, (body.vy * body.vy) / (2 * g * left));
}
