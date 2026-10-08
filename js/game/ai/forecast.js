// CPU Intelligence: bounded, side-effect-free prediction.
//
// Purpose: everything CPU Intelligence forecasts about bodies and hits,
// computed from observable state with the game's own rules: where a body
// falls, where a jump or a Dash carries the CPU, how far an attack drifts
// before it strikes (the Fighter's own steerAttack), where a stunned,
// launched fighter flies (the real stepBody on a scratch body) and whether
// that flight reaches the Void.
//
// Inputs: plain state ({ x, y, vx, vy, grounded }), the stage
// (StageCollision), the universal movement values and attack definitions.
// Outputs: geometry helpers (overlap, reachOf, within, boxAt, hurtBoxAt),
// attackDrift, projectFall, jumpArc, simulateFlight, koEstimate.
// Important constraints: never touches a real fighter, body, projectile or
// the stage: every simulation runs on a scratch copy and is bounded (a
// fixed number of steps). Prediction is motion only, never inputs.

import { CONFIG } from '../../config.js';
import { steerAttack } from '../fighters/movement.js';
import { stepBody } from '../physics.js';
import { BASE_FIGHTER_MOVEMENT } from '../../data/movement.js';
import { approach, clamp } from '../../core/utils.js';

export const STEP = CONFIG.sim.step;
export const GRAVITY = CONFIG.sim.gravity;
const MV = BASE_FIGHTER_MOVEMENT;

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Where hitbox `hb` (facing right from its owner's origin) meets a target
// whose hurtboxes span `e`: the target's origin must be between `lo` and
// `hi` ahead of the owner's, and between `dyLo` and `dyHi` below it.
export function reachOf(hb, e) {
  return { lo: hb.x - e.hw, hi: hb.x + hb.w + e.hw, dyLo: hb.y - e.bottom, dyHi: hb.y + hb.h - e.top };
}

export const within = (r, d, dy) => d > r.lo && d < r.hi && dy > r.dyLo && dy < r.dyHi;

// Box `hb` (facing right from an origin) in world space for an origin at
// (x, y) facing `facing`.
export function boxAt(hb, x, y, facing, out = {}) {
  out.x = facing > 0 ? x + hb.x : x - hb.x - hb.w;
  out.y = y + hb.y;
  out.w = hb.w;
  out.h = hb.h;
  return out;
}

// The box round hurtbox extent `e` (see hurtExtent) of a fighter whose
// feet are at (x, y), padded by `pad`.
export function hurtBoxAt(e, x, y, pad = 0, out = {}) {
  out.x = x - e.hw - pad;
  out.y = y + e.top - pad;
  out.w = e.hw * 2 + pad * 2;
  out.h = e.bottom - e.top + pad * 2;
  return out;
}

// How far attack `atk`, started now at speed `vx`, carries its fighter in
// `t` seconds, toward `face` for its step-in: the very rules the Fighter
// runs (attackStartSpeed, then steerAttack step by step), on a scratch body
// that never touches the stage. No steering through the attack.
export function attackDrift(self, atk, vx, t, air, face) {
  const body = { vx: self.attackStartSpeed(atk, vx, !air), grounded: !air };
  const record = { def: atk, time: 0, stepped: false };
  let x = 0;
  for (let i = Math.round(t / STEP); i > 0; i--) {
    steerAttack(body, self.movement, face, record, 0, STEP, self.burst);
    x += body.vx * STEP;
    record.time += STEP;
  }
  return x;
}

// Where a body falls in `t` seconds from (x, y) at (vx, vy) under gravity
// `g` (its fall capped at the universal maxFallSpeed), on the highest
// surface under its path at or below where it started. Its sideways speed
// is held (what it steers is its own business). Grounded, it stays at its
// height. Returns { x, y, landed }.
export function projectFall(stage, st, t, g = GRAVITY, halfW = 16) {
  const x = st.x + st.vx * t;
  if (st.grounded || t <= 0) return { x, y: st.y, landed: !!st.grounded };
  const cap = MV.maxFallSpeed;
  let y;
  const tc = g > 0 ? (cap - st.vy) / g : Infinity;
  if (t <= tc) y = st.y + st.vy * t + 0.5 * g * t * t;
  else y = st.y + st.vy * tc + 0.5 * g * tc * tc + cap * (t - tc);
  const surface = stage.surfaceBelow(x - halfW, x + halfW, st.y).y;
  if (y >= surface) return { x, y: surface, landed: true };
  return { x, y, landed: false };
}

// The upward speed of each kind of jump: the normal jump, the higher jump
// (its apex at highJumpHeight x the normal one's; its lighter-gravity rise
// is modelled as the full-gravity jump that tops out as high) and an air
// jump.
export function jumpSpeed(kind, g = GRAVITY) {
  if (kind === 'air') return MV.jumpVelocity * MV.airJumpRatio;
  if (kind === 'high') return Math.sqrt(2 * g * ((MV.jumpVelocity ** 2) / (2 * g)) * MV.highJumpHeight);
  return MV.jumpVelocity;
}

// The apex height above take-off of a jump of `kind`.
export function jumpApex(kind, g = GRAVITY) {
  const v = jumpSpeed(kind, g);
  return (v * v) / (2 * g);
}

// The CPU's own arc `t` seconds after a jump of `kind` ('normal', 'high',
// 'air', or null for none: a fall from where it is) pressed now from
// (x, y, vx, vy), holding `steer` (-1, 0, 1) the whole way: the air
// steering rules (airAcceleration toward top speed, the drag otherwise),
// stepped at `dt`. Feet height only; it never lands (callers test the
// ground themselves). Returns { x, y, vx, vy }.
export function jumpArc(st, kind, steer, t, g = GRAVITY, dt = STEP) {
  let { x, y, vx } = st;
  let vy = kind ? -jumpSpeed(kind, g) : st.vy;
  const n = Math.max(0, Math.round(t / dt));
  for (let i = 0; i < n; i++) {
    if (steer) {
      const top = MV.maxSpeed;
      if (vx * steer < 0) vx += steer * Math.min(MV.airAcceleration * MV.airTurnBoost * dt, Math.abs(vx) + top);
      else if (Math.abs(vx) > top) vx = approach(vx, steer * top, MV.airOverspeedDeceleration * dt);
      else vx = approach(vx, steer * top, MV.airAcceleration * dt);
    } else {
      vx = approach(vx, 0, MV.airDeceleration * dt);
    }
    vy = Math.min(vy + g * dt, MV.maxFallSpeed);
    x += vx * dt;
    y += vy * dt;
  }
  return { x, y, vx, vy };
}

// A scratch body for the real stepBody.
function scratchBody(st) {
  return {
    x: st.x, y: st.y, vx: st.vx, vy: st.vy, prevX: st.x, prevY: st.y,
    halfW: st.halfW ?? 16, height: st.height ?? 100, gravityScale: 1, maxFall: MV.maxFallSpeed,
    grounded: !!st.grounded, ground: null, landed: false, wall: 0, bonked: false,
    impactVx: 0, impactVy: 0, dropId: null, dropTimer: 0,
  };
}

const inVoidAt = (stage, x, y, height) => {
  const v = stage.void;
  const cy = y - height / 2;
  return x < v.left || x > v.right || cy < v.top || cy > v.bottom;
};

// A stunned (or freely flying) fighter's path: from `st` ({ x, y, vx, vy,
// grounded, halfW, height }), `seconds` long at `dt` steps, its speed
// running down at the hitstun rates (hitstunAirDrag, hitstunFriction) for
// the first `stun` seconds and under the normal drag after, on the real
// stage through the real stepBody (a scratch body: nothing real moves).
// Records every `record`-th step. Returns { path, voided, voidAt, end }.
export function simulateFlight(stage, st, { seconds, stun = 0, dt = STEP, g = GRAVITY, record = 1 }) {
  const b = scratchBody(st);
  if (b.grounded) b.ground = stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref;
  const path = [];
  const n = Math.max(1, Math.round(seconds / dt));
  let voidAt = null;
  for (let i = 1; i <= n; i++) {
    const t = i * dt;
    const stunned = t <= stun;
    const drag = stunned ? (b.grounded ? MV.hitstunFriction : MV.hitstunAirDrag) : (b.grounded ? MV.deceleration : MV.airDeceleration);
    b.vx = approach(b.vx, 0, drag * dt);
    stepBody(b, dt, stage, g, b.maxFall);
    if (i % record === 0) path.push({ t, x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded });
    if (inVoidAt(stage, b.x, b.y, b.height)) {
      voidAt = t;
      break;
    }
  }
  return { path, voided: voidAt !== null, voidAt, end: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded } };
}

// The universal recovery a fighter has once free in the air: both air
// jumps' height and an air dash's length (plus a little drift), the same
// for every fighter.
export const RECOVERY_BUDGET = Object.freeze({
  rise: 2 * jumpApex('air') + 30,
  across: MV.airDashSpeed * MV.airDashDuration + 140,
});

// How likely a launch `launch` ({ x, y }, world units/s) given to a body
// at `st` ({ x, y, halfW, height, grounded }) with `stun` seconds of
// hitstun is to cost it a point: 1 when its flight alone reaches the Void,
// otherwise how far past what the universal recovery can bring back it
// ends up once free (0 when it is still over the stage). `budget` scales
// the recovery it credits the victim with (1: a skilled one). Bounded.
export function koEstimate(stage, st, launch, stun, { budget = 1 } = {}) {
  const speed = Math.hypot(launch.x, launch.y);
  if (!(speed > 0)) return { p: 0, offstage: 0, end: st, voided: false };
  const grounded = st.grounded && launch.y >= 0;
  const flight = simulateFlight(stage, { ...st, vx: launch.x, vy: launch.y || 0, grounded }, {
    seconds: clamp(stun + 0.5, 0.4, 1.8), stun, dt: 1 / 30,
  });
  if (flight.voided) return { p: 1, offstage: 1, end: flight.end, voided: true };
  const end = flight.end;
  const floor = stage.floor;
  const gap = end.x < floor.x ? floor.x - end.x : end.x > floor.x + floor.w ? end.x - (floor.x + floor.w) : 0;
  const depth = end.y - stage.groundY;
  const v = stage.void;
  const sideRoom = Math.min(end.x - v.left, v.right - end.x);
  const outward = gap > 0 ? Math.max(0, end.vx * Math.sign(end.x - stage.centerX)) : 0;
  const rise = RECOVERY_BUDGET.rise * budget;
  const across = RECOVERY_BUDGET.across * budget;
  let need = 0;
  if (gap > 0) {
    need += Math.max(0, gap + outward * 0.25 - across * 0.6) / 220;
    need += Math.max(0, depth + Math.max(0, end.vy) * 0.2 - rise * 0.55) / 200;
    need += clamp((120 - sideRoom) / 240, 0, 0.5);
  }
  // Still rising high over the stage once free: the top of the Void.
  const topRoom = (end.y - st.height / 2) - v.top;
  if (end.vy < 0) need += clamp((end.vy * end.vy) / (2 * GRAVITY) - topRoom + 60, 0, 300) / 300;
  const offstage = gap > 0 ? clamp(gap / 300 + Math.max(0, depth) / 300, 0, 1) : 0;
  return { p: clamp(need, 0, 0.95), offstage, end, voided: false };
}
