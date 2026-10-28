// CPU Intelligence: predictive simulation.
//
// Purpose: where things will be, by the game's own rules. Every prediction
// here steps a scratch body through the shared physics (stepBody in
// js/game/physics.js) and the shared movement rules (steer, attackDrift,
// activationStep, attackStartSpeed, groundJump and airJump in
// js/game/fighters/movement.js) with the universal movement values, so the
// CPU never runs a second physics with rules of its own. It predicts:
//
//   - a fighter's motion from what is visible of it (its velocity, a stun
//     or a paralysis running down, its attack's own motion, a Dash),
//     continued only as far as the CPU's lookahead reaches: future inputs
//     are never known (predictTrack);
//   - the path of one of its own moves started now, step by step, and which
//     of its strikes would meet an opponent on its predicted path, and by
//     how much (moveContact);
//   - a projectile's flight against a predicted path (projectileContact);
//   - a jump's arc under any steering (arcTrack);
//   - where a launch carries its target and whether it takes it into the
//     Void or beyond any way back (launchOutcome);
//   - whether a fighter in the air can still get back to the stage with
//     what it has left (recoverySim).
//
// Inputs: a StageCollision, gravity, plain body-like states. Outputs: the
// functions above and Track. Important constraints: pure (scratch bodies
// only, never a fighter's), deterministic, and bounded: every simulation
// has a step limit.

import { CONFIG } from '../../../config.js';
import { stepBody } from '../../physics.js';
import { steer, attackDrift, activationStep, attackStartSpeed, groundJump, airJump } from '../../fighters/movement.js';
import { attackPhase, strikeLive } from '../../combat/attacks.js';
import { BASE_FIGHTER_MOVEMENT as MV } from '../../../data/movement.js';

export const STEP = CONFIG.sim.step;
const EPS = 1e-6;

// A physics body (see createBody in js/game/physics.js) copied from a
// body-like state, into `out`.
export function bodyFrom(src, out = {}) {
  out.x = src.x;
  out.y = src.y;
  out.vx = src.vx ?? 0;
  out.vy = src.vy ?? 0;
  out.prevX = out.x;
  out.prevY = out.y;
  out.halfW = src.halfW;
  out.height = src.height;
  out.gravityScale = src.gravityScale ?? MV.gravityScale;
  out.maxFall = src.maxFall ?? MV.maxFallSpeed;
  out.grounded = !!src.grounded;
  out.ground = src.grounded ? src.ground ?? null : null;
  out.landed = false;
  out.wall = 0;
  out.bonked = false;
  out.impactVx = 0;
  out.impactVy = 0;
  out.dropId = null;
  out.dropTimer = 0;
  return out;
}

// Positions (and velocities and footing) step by step: index k is k fixed
// steps from now. Reused, so nothing is allocated per prediction.
export class Track {
  constructor(n = 200) {
    this.cap = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.g = new Uint8Array(n);
    this.len = 0;
    // Index of "now" in a track predicted from an older picture (the CPU's
    // perception latency): i(0) is now.
    this.origin = 0;
  }

  clear() {
    this.len = 0;
    this.origin = 0;
    return this;
  }

  push(b) {
    if (this.len >= this.cap) return;
    const k = this.len++;
    this.x[k] = b.x;
    this.y[k] = b.y;
    this.vx[k] = b.vx;
    this.vy[k] = b.vy;
    this.g[k] = b.grounded ? 1 : 0;
  }

  // Index k steps from now, held at the last known point beyond the end.
  i(k) {
    return Math.max(0, Math.min(this.len - 1, k + this.origin));
  }
}

const scratch = {};
const scratch2 = {};

// One step of an attack's own movement, exactly as the Fighter runs it
// (Fighter.moveMotion and moveAttack): returns the share of gravity the
// body falls under. It plays the move with nothing held (on the ground
// nothing held would steer it anyway; in the air its air control is the
// CPU's own choice, never assumed). `rec` is { def, time, step, stepped, motion } (step: the Step-in this
// activation makes, see activationStep) where motion is
// the scratch motion state ({ done, aimed, dirX, dirY, speed, rolling,
// target: { x, y } | null, range }); `target` is the opponent's middle this
// step (for a homing dash's aim), `face` the way it faces.
function attackStep(body, rec, face, target, burst) {
  const def = rec.def;
  const spec = def.motion;
  const m = rec.motion;
  if (spec && m && !m.done) {
    const phase = attackPhase(def, rec.time);
    if (spec.type === 'roll') {
      if (phase === 'startup' && !m.rolling) {
        attackDrift(body, MV, face, rec, 0, STEP, burst);
        return 1;
      }
      if (body.wall === face) m.speed = 0;
      if (m.rolling && body.grounded) m.speed = Math.max(0, m.speed - spec.friction * STEP);
      m.rolling = true;
      body.vx = face * m.speed;
      return 1;
    }
    if (spec.type === 'hover') {
      attackDrift(body, MV, face, rec, 0, STEP, burst);
      body.vy = 0;
      return 0;
    }
    if (phase === 'recovery') {
      m.done = true;
      if (spec.type === 'homing') {
        body.vx *= spec.exit;
        body.vy *= spec.exit;
      }
      attackDrift(body, MV, face, rec, 0, STEP, burst);
      return 1;
    }
    if (spec.type === 'homing') {
      if (phase === 'startup') {
        steer(body, MV, 0, STEP, burst);
        body.vy = 0;
        return 0;
      }
      if (!m.aimed) {
        m.aimed = true;
        m.dirX = face;
        m.dirY = 0;
        if (target) {
          const dx = target.x - body.x;
          const dy = target.y - (body.y - body.height / 2);
          const d = Math.hypot(dx, dy);
          if (d > 0 && d <= spec.range && dx * face >= -8) m.locked = true;
        }
      }
      if (m.locked && target) {
        const dx = target.x - body.x;
        const dy = target.y - (body.y - body.height / 2);
        const d = Math.hypot(dx, dy);
        if (d >= 1) {
          m.dirX = dx / d;
          m.dirY = dy / d;
        }
      }
      body.vx = m.dirX * spec.speed;
      body.vy = m.dirY * spec.speed;
      return 0;
    }
    attackDrift(body, MV, face, rec, 0, STEP, burst);
    if (phase === 'startup') body.vy = 0;
    else body.vy = spec.type === 'rise' ? -spec.speed : spec.fallSpeed;
    return 0;
  }
  attackDrift(body, MV, face, rec, 0, STEP, burst);
  return 1;
}

// A fresh scratch attack record for `def` starting now at running speed
// `running` facing `face`, on the ground (`grounded`) or in the air, its
// Step-in and its motion set going as Fighter.startAttack and startMotion do.
function attackRecord(def, face, running, grounded, out = {}) {
  out.def = def;
  out.time = 0;
  out.step = activationStep(def, grounded);
  out.stepped = false;
  const spec = def.motion;
  if (spec) {
    out.motion = out.motion ?? {};
    const m = out.motion;
    m.done = false;
    m.aimed = false;
    m.locked = false;
    m.dirX = face;
    m.dirY = 0;
    m.rolling = false;
    m.speed = spec.type === 'roll' ? Math.min(spec.maxSpeed, spec.speed + spec.keep * Math.max(0, running * face)) : 0;
  } else {
    out.motion = null;
  }
  return out;
}

const foeRec = {};

// The predicted path of a fighter whose visible state is `st` for `steps`
// fixed steps, into `track`. `st`: { x, y, vx, vy, grounded, ground,
// halfW, height, stun, paralysis, hitstop, attack: { def, time, motion } |
// null, facing, dash: { dir, speed, left, air } | null, technique: seconds
// left | 0 }. What it is doing now plays out by the rules (a stun's drag, a
// paralysis holding it, its attack's own motion, a Dash); once it is free
// again its own steering is unknown, so its velocity carries on for
// `horizon` seconds (scaled by `velScale`, the CPU's estimation error) and
// then runs down. `target` is where a homing dash of its would aim.
export function predictTrack(track, stage, gravity, st, { steps = 90, horizon = 0.3, velScale = 1, target = null } = {}) {
  track.clear();
  const b = bodyFrom(st, scratch);
  b.vx *= velScale;
  let stun = st.stun ?? 0;
  let para = st.paralysis ?? 0;
  let stop = st.hitstop ?? 0;
  let tech = st.technique ?? 0;
  let dash = st.dash ? { ...st.dash } : null;
  let rec = null;
  if (st.attack && !(stun > 0) && !(para > 0)) {
    rec = foeRec;
    rec.def = st.attack.def;
    rec.time = st.attack.time;
    // A Mash Combo turn's clock runs at its rate.
    rec.rate = st.attack.rate ?? 1;
    // Its Step-in, where the state says (a fighter's own record does; a
    // perceived opponent's attack does not, so none is guessed at).
    rec.step = st.attack.step ?? null;
    rec.stepped = st.attack.stepped ?? true;
    const mo = st.attack.motion;
    rec.motion = mo ? { ...mo } : null;
  }
  const face = st.facing || 1;
  let free = 0;
  for (let k = 0; k < steps; k++) {
    let share = 1;
    if (stop > 0) {
      stop -= STEP;
      track.push(b);
      continue;
    }
    if (para > 0) {
      para -= STEP;
      b.vx = 0;
    } else if (stun > 0) {
      stun -= STEP;
      const drag = (b.grounded ? MV.hitstunFriction : MV.hitstunAirDrag) * STEP;
      b.vx = Math.abs(b.vx) <= drag ? 0 : b.vx - Math.sign(b.vx) * drag;
    } else if (tech > 0) {
      tech -= STEP;
      b.vx = 0;
    } else if (dash) {
      b.vx = dash.dir * dash.speed;
      if (dash.air) {
        b.vy = 0;
        share = 0;
      }
      dash.left -= STEP;
      if (dash.left <= EPS) dash = null;
    } else if (rec) {
      rec.time += STEP * (rec.rate ?? 1);
      if (rec.time >= rec.def.total - EPS) rec = null;
      else share = attackStep(b, rec, face, target, false);
    } else {
      free += STEP;
      if (free > horizon) steer(b, MV, 0, STEP, false);
      else if (!b.grounded) b.vx -= Math.sign(b.vx) * Math.min(Math.abs(b.vx), MV.airDeceleration * STEP);
    }
    stepBody(b, STEP, stage, gravity * share, b.maxFall);
    track.push(b);
  }
  return track;
}

// The way to hold to drift toward `toX` in the air at speed `vx`: toward
// it, or back against the drift once it would overshoot (the air's turn
// brake), nothing once there. Shared by the arc predictions and the
// executor, so a plan flies the arc it was planned on.
export function driftDir(x, vx, toX) {
  const dx = toX - x;
  // Close enough: let the drag settle it rather than flick back and forth.
  if (Math.abs(dx) < 10) return Math.abs(vx) > 160 ? -Math.sign(vx) : 0;
  const stopDist = (vx * vx) / (2 * MV.airAcceleration * MV.airTurnBoost);
  if (Math.sign(dx) === Math.sign(vx) && Math.abs(dx) < stopDist) return -Math.sign(dx);
  return Math.sign(dx);
}

// A jump's arc from `st` (grounded or not), into `track`: `jump` 'ground'
// (the normal jump), 'super' (the Super Jump: from the ground only, its
// whole lift at takeoff), 'air' or null (no jump: the drift from here),
// steering toward `dir` (or toward `toX` when given, braking near it), with
// the fast fall from `fastFallAt` seconds when given. Every jump rises and
// falls under the same gravity, exactly as the Fighter's does. `steps`
// long, stopping early once it lands (kept as its last point).
export function arcTrack(track, stage, gravity, st, { jump = 'ground', dir = 0, toX = null, steps = 70, fastFallAt = null } = {}) {
  track.clear();
  const b = bodyFrom(st, scratch);
  if (jump === 'ground' || jump === 'super') {
    groundJump(b, MV, jump === 'super');
    b.grounded = false;
    b.ground = null;
  } else if (jump === 'air') {
    airJump(b, MV);
    b.grounded = false;
    b.ground = null;
  }
  for (let k = 0; k < steps; k++) {
    const d = toX != null ? driftDir(b.x, b.vx, toX) : dir;
    steer(b, MV, d, STEP, false);
    if (fastFallAt != null && k * STEP >= fastFallAt && b.vy > 0) b.vy = Math.min(MV.fastFallSpeed, b.vy + MV.fastFallAcceleration * STEP);
    stepBody(b, STEP, stage, gravity, b.maxFall);
    track.push(b);
    if (b.grounded && k > 0) break;
  }
  return track;
}

// The world box of `hb` (facing right from an origin) for an owner at (x, y)
// facing `face`, into `out`.
export function boxAt(hb, x, y, face, out) {
  out.x = face > 0 ? x + hb.x : x - hb.x - hb.w;
  out.y = y + hb.y;
  out.w = hb.w;
  out.h = hb.h;
  return out;
}

const hitBox = {};
const myRec = {};

// What move `m` (see capabilities.js), started now by a fighter in state
// `st` facing `face`, would meet: the opponent's hurt extent `hurt` ({ hw,
// top, bottom }) on its predicted path `foe` (a Track). Steps the move's
// own movement by the game's rules into `self` (a Track: where the fighter
// is, step by step), and checks each strike while it is live. Returns {
// contact: the step of the first strike that meets the opponent (-1: none),
// strikes: how many of its strikes meet, margin: how far (world units) the
// opponent could have stood further away and still been met, marginUp the
// same upward, endK: the steps it lasts }.
// `k0` shifts the opponent's path: the move starts k0 steps from now (out
// of a jump, a Dash). An ordinary attack turns its box toward the opponent
// every step (the CPU's attack orientation); a motion attack keeps `face`.
// A quake strike meets the opponent only where its path stands on the
// ground; a slam that lands strikes with its impact there, then stands
// through its landing (its recovery) where it landed.
export function moveContact(stage, gravity, m, st, face, foe, hurt, self, out = {}, k0 = 0) {
  self.clear();
  const def = m.def;
  const turns = !def.motion;
  const b = bodyFrom(st, scratch2);
  const running = b.vx;
  b.vx = attackStartSpeed(def, b.vx, b.grounded);
  const rec = attackRecord(def, face, running, b.grounded, myRec);
  if (def.motion && def.motion.type !== 'roll') b.vy = 0;
  const steps = Math.min(self.cap, Math.ceil(def.total / STEP) + 1);
  out.contact = -1;
  out.strikes = 0;
  out.margin = -Infinity;
  out.marginUp = -Infinity;
  out.endK = steps;
  const strikes = m.strikes;
  const met = strikes.length > 1 ? new Uint8Array(strikes.length) : null;
  const aim = { x: 0, y: 0 };
  for (let k = 0; k < steps; k++) {
    const fk = foe.i(k + k0);
    aim.x = foe.x[fk];
    aim.y = foe.y[fk] - (hurt.bottom - hurt.top) / 2;
    if (turns) face = Math.sign(aim.x - b.x) || face;
    const share = attackStep(b, rec, face, aim, false);
    stepBody(b, STEP, stage, gravity * share, b.maxFall);
    // A homing dash or a plunge that meets the ground stops there.
    if (rec.motion && !rec.motion.done && b.grounded && def.motion &&
        (def.motion.type === 'homing' || def.motion.type === 'bounce' || def.motion.type === 'slam') &&
        attackPhase(def, rec.time) === 'active') {
      rec.motion.done = true;
      if (def.motion.type === 'bounce') {
        self.push(b);
        out.endK = k + 1;
        break;
      }
      if (def.motion.type === 'slam') {
        // Landed: its impact round the landing point, then the landing.
        b.vx = 0;
        b.vy = 0;
        self.push(b);
        const imp = m.impact;
        if (imp) {
          const fx = foe.x[fk];
          const fy = foe.y[fk];
          boxAt(imp.box, b.x, b.y, face, hitBox);
          const reaches = !imp.strike.quake || foe.g[fk];
          if (reaches && hitBox.x < fx + hurt.hw && hitBox.x + hitBox.w > fx - hurt.hw &&
              hitBox.y < fy + hurt.bottom && hitBox.y + hitBox.h > fy + hurt.top) {
            if (out.contact < 0) out.contact = k;
            out.strikes++;
            out.margin = Math.max(out.margin, Math.min(hitBox.x + hitBox.w - (fx - hurt.hw), fx + hurt.hw - hitBox.x));
            out.marginUp = Math.max(out.marginUp, fy + hurt.bottom - hitBox.y);
          }
        }
        const landing = Math.ceil(def.recovery / STEP);
        for (let j = 0; j < landing && self.len < self.cap; j++) self.push(b);
        out.endK = k + 1 + landing;
        break;
      }
    }
    self.push(b);
    const t = rec.time;
    const fx = foe.x[fk];
    const fy = foe.y[fk];
    // A single strike lands once; a string's each strike once.
    const done = !met && out.contact >= 0;
    for (let i = 0; !done && i < strikes.length; i++) {
      const s = strikes[i];
      const live = met ? strikeLive({ at: s.at, active: s.end - s.at }, t) : attackPhase(def, t) === 'active';
      if (!live || (met && met[i])) continue;
      if (s.quake && !foe.g[fk]) continue;
      const hb = s.hitbox ?? def.hitbox;
      boxAt(hb, b.x, b.y, face, hitBox);
      const h0 = fx - hurt.hw;
      const h1 = fx + hurt.hw;
      const v0 = fy + hurt.top;
      const v1 = fy + hurt.bottom;
      if (hitBox.x < h1 && hitBox.x + hitBox.w > h0 && hitBox.y < v1 && hitBox.y + hitBox.h > v0) {
        if (out.contact < 0) out.contact = k;
        if (met) met[i] = 1;
        out.strikes++;
        const away = Math.sign(fx - b.x) || face;
        const mx = away > 0 ? hitBox.x + hitBox.w - h0 : h1 - hitBox.x;
        out.margin = Math.max(out.margin, Math.min(mx, hitBox.w + 2 * hurt.hw));
        out.marginUp = Math.max(out.marginUp, v1 - hitBox.y);
        if (!met) break;
      }
    }
    rec.time += STEP;
  }
  out.face = face;
  return out;
}

const shotBox = {};

// Whether a projectile `p` (a capability's projectile model) released `delay`
// seconds from now from (x0, y0) going `dir` meets the opponent on its
// predicted path `foe` (hurt extent `hurt`): { contact (step from now, -1
// none), margin (vertical slack), strikes (how many land at most), blocked
// (a solid stops it first) }. Its pull, if any, drags a `pullable`
// opponent toward it (at the pull's speed, once inside its radius), which
// the opponent's path does not show: a Shield, a paralysis or a cast holds
// its ground.
export function projectileContact(stage, p, x0, y0, dir, delay, foe, hurt, out = {}, pullable = true) {
  out.contact = -1;
  out.margin = -Infinity;
  out.strikes = 0;
  out.blocked = false;
  const startK = Math.max(0, Math.round(delay / STEP));
  const life = Math.round(p.lifetime / STEP);
  const pull = pullable && p.pull ? p.pull : null;
  const v = stage.void;
  let dragX = 0;
  let dragY = 0;
  const midY = (hurt.top + hurt.bottom) / 2;
  for (let j = 0; j < life; j++) {
    const k = startK + j;
    const px = x0 + dir * p.speed * (j + 1) * STEP;
    boxAt(p.hitbox, px, y0, dir, shotBox);
    if (shotBox.x + shotBox.w < v.left || shotBox.x > v.right) break;
    if (stage.solids.some((s) => s.active !== false && shotBox.x < s.x + s.w && shotBox.x + shotBox.w > s.x && shotBox.y < s.y + s.h && shotBox.y + shotBox.h > s.y)) {
      out.blocked = true;
      break;
    }
    const fk = foe.i(k);
    // A quake reaches the opponent only standing on the ground: one in the
    // air is passed by, the shot still live for it (hitReaches).
    if (p.quake && !foe.g[fk]) continue;
    let fx = foe.x[fk] + dragX;
    let fy = foe.y[fk] + dragY;
    if (pull) {
      const cx = px + dir * (pull.offset?.x ?? 0);
      const cy = y0 + (pull.offset?.y ?? 0);
      const ddx = cx - fx;
      const ddy = cy - (fy + midY);
      const d = Math.hypot(ddx, ddy);
      if (d <= pull.radius && d > 1e-6) {
        const step = Math.min(pull.speed * STEP, d);
        dragX += (ddx / d) * step;
        dragY += (ddy / d) * step;
        fx += (ddx / d) * step;
        fy += (ddy / d) * step;
      }
    }
    const h0 = fx - hurt.hw;
    const h1 = fx + hurt.hw;
    const v0 = fy + hurt.top;
    const v1 = fy + hurt.bottom;
    if (shotBox.x < h1 && shotBox.x + shotBox.w > h0 && shotBox.y < v1 && shotBox.y + shotBox.h > v0) {
      out.contact = k;
      out.margin = Math.min(v1 - shotBox.y, shotBox.y + shotBox.h - v0);
      out.strikes = p.pierce ? (pull || p.carry ? p.pierce.hits : Math.max(1, Math.ceil(p.pierce.hits / 2))) : 1;
      break;
    }
  }
  return out;
}

const launchBody = {};

// Where a launch takes a fighter (hurt height `height`, half width `halfW`)
// standing at (x, y) (`grounded` or not): launch velocity (vx, vy), `stun`
// seconds of hitstun. Steps it through its stun by the rules (hitstun drag,
// gravity, the stage) and then, free again, asks recoverySim whether it can
// still get back with `res` (its air jumps and air dash: a hit gives them
// all back). Returns { ko: 0-1, offstage, x, y, vx, vy, t (seconds of
// flight), margin (how comfortably it gets back) }.
export function launchOutcome(model, gravity, from, vx, vy, stun, res, out = {}) {
  const b = bodyFrom(from, launchBody);
  b.vx = vx;
  if (vy) {
    b.vy = vy;
    b.grounded = false;
    b.ground = null;
  }
  out.ko = 0;
  out.offstage = false;
  out.t = 0;
  out.margin = Infinity;
  const steps = Math.min(150, Math.ceil(stun / STEP));
  for (let k = 0; k < steps; k++) {
    const drag = (b.grounded ? MV.hitstunFriction : MV.hitstunAirDrag) * STEP;
    b.vx = Math.abs(b.vx) <= drag ? 0 : b.vx - Math.sign(b.vx) * drag;
    stepBody(b, STEP, model.stage, gravity, b.maxFall);
    out.t += STEP;
    if (model.inVoid(b.x, b.y, b.height)) {
      out.ko = 1;
      break;
    }
  }
  out.x = b.x;
  out.y = b.y;
  out.vx = b.vx;
  out.vy = b.vy;
  if (out.ko) return out;
  out.offstage = !b.grounded && !model.supported(b.x, b.halfW, b.y);
  if (!out.offstage) return out;
  const r = recoverySim(model, gravity, b, res, { maxSteps: 150 });
  out.margin = r.margin;
  if (!r.ok) out.ko = r.fell ? 0.9 : 0.6;
  return out;
}

const recBody = {};

// Whether a fighter in the air at `st` can get back onto a surface with
// `res` ({ airJumps, airDash (distance > 0 when it has one left), dashOk
// (not exhausted, not still flying from a launch), rise ({ speed, time,
// hang, airMomentum } of a lifting move it may still start, or null: its
// hang, then its lift under the universal air control, as the Fighter
// plays it), hover (seconds of a stalling move, or 0) }), by a sensible recovery: hold toward the stage,
// air jump as it falls past the ledge's height (the threshold
// `policy.jumpBelow` units under it), air dash home when far out, a lift
// when nothing else is left. Returns { ok, fell (into the Void), t, x, y,
// jumps: air jumps used, dashed, margin (how high above the ledge it
// clears, roughly) }. `policy` varies the timings: the CPU tries several
// and keeps the best (see the recovery plan).
export function recoverySim(model, gravity, st, res, policy = {}, out = {}, track = null) {
  const b = bodyFrom(st, recBody);
  if (track) track.clear();
  const jumpBelow = policy.jumpBelow ?? 30;
  const dashFar = policy.dashFar ?? 150;
  const maxSteps = policy.maxSteps ?? 160;
  let jumps = res.airJumps ?? 0;
  let dash = res.airDash && res.dashOk ? res.airDash : 0;
  let dashLeft = 0;
  let dashDir = 0;
  let rise = res.rise ?? null;
  let riseLeft = 0;
  let riseHang = 0;
  let launched = !!res.launched;
  out.ok = false;
  out.fell = false;
  out.jumps = 0;
  out.dashed = false;
  out.rose = false;
  out.margin = -Infinity;
  out.t = 0;
  let minY = b.y;
  let burst = false;
  for (let k = 0; k < maxSteps; k++) {
    const target = model.landingTarget(b.x, b.halfW, 14);
    const dx = target.x - b.x;
    const dir = Math.abs(dx) < 2 ? 0 : Math.sign(dx);
    // Already over something to land on: nothing more to spend.
    const over = model.supported(b.x, b.halfW, b.y);
    let share = 1;
    if (dashLeft > 0) {
      b.vx = dashDir * MV.airDashSpeed;
      b.vy = 0;
      share = 0;
      dashLeft -= STEP;
      burst = true;
    } else if (riseHang > 0 || riseLeft > 0) {
      // Held toward the stage: an aerial keeps the universal air control
      // (attackDrift in the air).
      steer(b, MV, dir, STEP, burst);
      share = 0;
      if (riseHang > 0) {
        b.vy = 0;
        riseHang -= STEP;
      } else {
        b.vy = -rise.speed;
        riseLeft -= STEP;
        if (riseLeft <= 0) rise = null;
      }
    } else {
      steer(b, MV, dir, STEP, burst);
      const below = b.y - target.y;
      if (over) {
        // Falling onto the stage: let it land.
      } else if (dash && !launched && Math.abs(dx) > dashFar && below > -40 && below < 60 && (policy.dashEarly || b.vy > -150)) {
        dashLeft = MV.airDashDuration;
        dashDir = Math.sign(dx);
        dash = 0;
        out.dashed = true;
      } else if (jumps > 0 && b.vy > 0 && below > -jumpBelow) {
        airJump(b, MV);
        jumps--;
        out.jumps++;
        launched = false;
      } else if (!jumps && rise && b.vy > 0 && below > -20) {
        riseLeft = rise.time;
        riseHang = rise.hang ?? 0;
        b.vx *= rise.airMomentum ?? 1;
        launched = false;
        out.rose = true;
      } else if (launched && b.vy > 0) {
        launched = false;
      }
    }
    if (burst && Math.abs(b.vx) <= MV.maxSpeed) burst = false;
    stepBody(b, STEP, model.stage, gravity * share, b.maxFall);
    if (track) track.push(b);
    out.t += STEP;
    minY = Math.min(minY, b.y);
    if (b.grounded) {
      out.ok = true;
      out.margin = model.top - minY;
      break;
    }
    if (model.inVoid(b.x, b.y, b.height)) {
      out.fell = true;
      break;
    }
  }
  out.x = b.x;
  out.y = b.y;
  if (!out.ok && !out.fell) out.margin = model.top - b.y;
  return out;
}
