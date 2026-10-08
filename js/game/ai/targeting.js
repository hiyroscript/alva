// CPU Intelligence: targeting, whether a move would connect.
//
// Purpose: the geometry of offence and defence, from the moves' own data:
// where the opponent will be (`foeAt`, bounded by the level's horizon, or
// its whole flight while a hit holds it), where the CPU will be (`selfAt`),
// and whether a melee strike (its drift and its motion: a roll, a homing
// dash, a plunge, a lift, a hover), a projectile (its release, flight,
// pull, lifetime and the solids in its way), a technique (its burst or its
// projectile) or a summon would meet the opponent if started now or after
// `delay`. The tactical planner, the combo planner and the threat
// assessment all ask here, so they never disagree.
//
// Inputs: the situation (situation.js) and move descriptors (knowledge.js).
// Outputs: foeAt, selfAt, meleeFit, shotFit, techniqueFit, summonFit,
// moveFit, aim.
// Important constraints: side-effect free and bounded.

import {
  attackDrift, reachOf, within, overlap, boxAt, hurtBoxAt, projectFall, jumpArc, simulateFlight, STEP,
} from './forecast.js';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// The opponent's feet `t` seconds from now, as this level can forecast:
// while a hit holds it, its whole flight (it cannot act); otherwise its
// current motion for at most the level's horizon, then where that leaves
// it. Cached per step on the situation.
export function foeAt(S, t) {
  const i = Math.max(0, Math.round(t / STEP));
  const cache = S.foeCache;
  if (cache[i]) return cache[i];
  let p;
  if (S.foeFlight) {
    const path = S.foeFlight.path;
    const q = i === 0 ? S.fv : path[Math.min(i, path.length) - 1] ?? S.foeFlight.end;
    p = { x: q.x, y: q.y, grounded: !!q.grounded };
  } else {
    const h = Math.min(i * STEP, S.horizon);
    const f = projectFall(S.stage, S.fv, h, S.g, S.fv.halfW);
    p = { x: f.x, y: f.y, grounded: S.fv.grounded || f.landed };
  }
  cache[i] = p;
  return p;
}

// Its whole flight while stunned (or held), for foeAt: from the perceived
// state, with the stun it has left. Null when it is free.
export function foeFlightOf(S) {
  const fv = S.fv;
  const held = Math.max(fv.stun + fv.hitstop, fv.paralysis);
  if (!(held > 0.02)) return null;
  return simulateFlight(S.stage, fv, { seconds: Math.min(1.2, held + 0.2), stun: held, g: S.g });
}

// The CPU's own feet `t` seconds from now with nothing new pressed: on the
// ground where it is (plus a little of its speed), in the air its fall.
export function selfAt(S, t) {
  if (S.grounded) return { x: S.x + S.vx * Math.min(t, 0.1), y: S.y };
  const f = projectFall(S.stage, S, t, S.g, S.halfW);
  return { x: f.x, y: f.y };
}

// The CPU's height `t` seconds into attack `m` started from state `from`:
// a hover and every motion's startup hang (no fall), anything else falls.
function attackY(S, m, from, t) {
  if (from.grounded) return from.y;
  if (m.motion) return from.y;
  const y = from.y + from.vy * t + 0.5 * S.g * t * t;
  const ground = S.stage.surfaceBelow(from.x - S.halfW, from.x + S.halfW, from.y).y;
  return Math.min(y, ground);
}

// When melee move `m` (an attack or the Deflect), started `delay` seconds
// from now from state `from` ({ x, y, vx, vy, grounded }, the CPU's own by
// default), would first meet the opponent: { t, face } (t from now), or
// null. Ordinary strikes are re-aimed at the opponent every step (the
// CPU's attack orientation), so only the distance matters. `err` is this
// level's spacing misjudgement.
export function meleeFit(S, m, { delay = 0, from = S, err = S.rangeError } = {}) {
  const atk = m.atk;
  const air = !from.grounded;
  if (!!m.air !== air) return null;
  if (m.motion && m.motion !== 'hover') return motionFit(S, m, delay, from, err);
  const fe = S.fe;
  const r = reachOf(atk.hitbox, fe);
  const toward = sign(foeAt(S, delay).x - from.x) || S.facing;
  const t0 = atk.startup;
  const drift = attackDrift(S.self, atk, from.vx, t0, air, toward);
  const sx = from.x + drift;
  // On the ground, never a strike whose own slide carries it off the
  // stage's edge into open air.
  if (!air && Math.abs(from.vx) > 40) {
    const slide = attackDrift(S.self, atk, from.vx, atk.total, false, toward);
    const ex = from.x + slide;
    if (!S.stage.surfaceBelow(ex - S.halfW * 0.5, ex + S.halfW * 0.5, from.y).ref) return null;
  }
  const n = Math.max(1, Math.round(atk.active / STEP));
  for (let k = 0; k < n; k += 2) {
    const t = t0 + k * STEP;
    const f = foeAt(S, delay + t);
    const sy = m.motion === 'hover' ? from.y : attackY(S, m, from, t);
    const d = Math.abs(f.x - sx) + err;
    if (within(r, d, f.y - sy)) return { t: delay + t, face: sign(f.x - sx) || toward };
  }
  return null;
}

// A melee move with a motion of its own.
function motionFit(S, m, delay, from, err) {
  const atk = m.atk;
  const spec = atk.motion;
  const t0 = atk.startup;
  const fStart = foeAt(S, delay + t0);
  const face = sign(fStart.x - from.x) || S.facing;
  const fe = S.fe;
  if (m.motion === 'homing') {
    // Hangs through its startup, then locks on (middle to middle, within
    // its range and not behind) and flies at its speed.
    const myMid = from.y - S.self.body.height / 2;
    const foeMid = fStart.y - S.fv.height / 2;
    const dist = Math.hypot(fStart.x - from.x, foeMid - myMid) + err;
    if (dist > spec.range * 0.92) return null;
    const fly = Math.max(0, dist - 30) / spec.speed;
    if (fly > atk.active) return null;
    return { t: delay + t0 + fly, face };
  }
  if (m.motion === 'roll') {
    // It rolls at its own speed plus its share of the run it was started
    // from (see Fighter.startMotion), losing its friction on the ground.
    const v0 = Math.min(spec.maxSpeed, spec.speed + spec.keep * Math.max(0, from.vx * face));
    const hb = atk.hitbox;
    for (let k = 0; k * STEP <= atk.active; k += 2) {
      const t = k * STEP;
      const brake = spec.friction > 0 ? Math.min(t, v0 / spec.friction) : t;
      const rolled = v0 * brake - 0.5 * spec.friction * brake * brake;
      const f = foeAt(S, delay + t0 + t);
      const d = (f.x - from.x) * face + err;
      const r = reachOf({ x: hb.x, y: hb.y, w: hb.w + rolled, h: hb.h }, fe);
      if (!within(r, d, f.y - from.y)) continue;
      // Never rolled off the stage into open air by accident.
      if (!S.groundAhead(face, Math.max(0, d) + 20, from)) return null;
      return { t: delay + t0 + t, face };
    }
    return null;
  }
  if (m.motion === 'bounce') {
    // Drops at its fall speed from where it hangs: what is under it, over
    // ground only (never a plunge into the Void).
    const ground = S.stage.surfaceBelow(from.x - S.halfW, from.x + S.halfW, from.y);
    if (!ground.ref) return null;
    const hb = atk.hitbox;
    const fall = Math.max(0, (fStart.y + fe.top) - (from.y + hb.y + hb.h));
    const t = t0 + fall / spec.fallSpeed;
    if (t - t0 > atk.active) return null;
    const f = foeAt(S, delay + t);
    const steer = (atk.airControl ?? 0) * 420 * (t - t0);
    if (Math.abs(f.x - from.x) + err > hb.w / 2 + fe.hw + steer) return null;
    if (f.y < from.y - 20) return null;
    return { t: delay + t, face };
  }
  if (m.motion === 'rise') {
    const r = reachOf(m.reach, fe);
    const f = foeAt(S, delay + t0 + atk.active * 0.5);
    const d = Math.abs(f.x - from.x) + err;
    const hb = atk.hitbox;
    if (d > hb.x + hb.w + fe.hw) return null;
    if (!(f.y - from.y > r.dyLo && f.y - from.y < r.dyHi)) return null;
    return { t: delay + t0 + atk.active * 0.5, face };
  }
  return null;
}

// Whether a solid stands between x0 and x1 at height y.
function blocked(S, x0, x1, y) {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  return S.stage.solids.some((so) => so.y < y && so.y + so.h > y && so.x < hi && so.x + so.w > lo);
}

// When projectile move `m` (a thrown projectile, or a technique's) started
// `delay` seconds from now would meet the opponent: { t, face }, or null.
// Its release turns with the CPU's aim (toward the opponent) and then flies
// straight on; a pull reaches as far again as its radius; a solid in the
// way, its lifetime or the Void stop it.
export function shotFit(S, m, { delay = 0, from = S } = {}) {
  const proj = m.proj;
  if (!proj) return null;
  const release = delay + m.startup;
  const fRel = foeAt(S, release);
  const face = sign(fRel.x - from.x) || S.facing;
  const o = m.offset ?? { x: 0, y: 0 };
  const sx = from.x + o.x * face;
  const sy = from.y + o.y;
  if (blocked(S, from.x, sx, sy)) return null;
  const hb = proj.hitbox;
  const pull = proj.pull ? proj.pull.radius * 0.8 : 0;
  const fe = S.fe;
  const life = Math.min(proj.lifetime, 1.6);
  const step = 2 * STEP;
  for (let t = 0; t <= life; t += step) {
    const px = sx + face * proj.speed * t;
    const box = { x: px + (face > 0 ? hb.x : -hb.x - hb.w) - pull, y: sy + hb.y - pull, w: hb.w + 2 * pull, h: hb.h + 2 * pull };
    const v = S.stage.void;
    if (px < v.left || px > v.right) return null;
    if (blocked(S, sx, px, sy)) return null;
    const f = foeAt(S, release + t);
    if (overlap(box, hurtBoxAt(fe, f.x, f.y))) return { t: release + t, face };
  }
  return null;
}

// When technique move `m` would land: its burst round the CPU as it lets
// go, or its projectile's flight.
export function techniqueFit(S, m, opts = {}) {
  if (!S.grounded) return null;
  if (m.burst) {
    const delay = opts.delay ?? 0;
    const f = foeAt(S, delay + m.startup);
    const face = sign(f.x - S.x) || S.facing;
    const box = boxAt(m.burst.hitbox, S.x, S.y, face);
    const pad = S.rangeError;
    if (overlap({ x: box.x + pad, y: box.y, w: Math.max(0, box.w - 2 * pad), h: box.h }, hurtBoxAt(S.fe, f.x, f.y))) {
      return { t: delay + m.startup, face };
    }
    if (!m.proj) return null;
  }
  return shotFit(S, m, opts);
}

// When summon move `m`'s clone would strike: it appears behind the
// opponent and strikes where it stood, so it lands on an opponent that
// stays put (or is held).
export function summonFit(S, m, { delay = 0 } = {}) {
  if (!S.grounded) return null;
  const t = delay + m.startup;
  const now = foeAt(S, delay);
  const then = foeAt(S, t);
  const busy = S.foeBusy >= t;
  if (!busy && Math.abs(then.x - now.x) > 40) return null;
  return { t, face: sign(now.x - S.x) || S.facing };
}

// When move `m` started `delay` seconds from now (from `from`) would
// connect, whatever kind it is; null when it would not.
export function moveFit(S, m, opts = {}) {
  switch (m.kind) {
    case 'melee':
    case 'deflect':
      return meleeFit(S, m, opts);
    case 'projectile':
      return opts.from && opts.from.grounded === false && !m.air ? null : shotFit(S, m, opts);
    case 'technique':
      return techniqueFit(S, m, opts);
    case 'summon':
      return summonFit(S, m, opts);
    default:
      return null;
  }
}

// The CPU's arc `t` seconds after a jump of `kind` (see jumpArc) steered
// toward `steer`, from its current state.
export function arcAt(S, kind, steer, t) {
  return jumpArc({ x: S.x, y: S.y, vx: S.vx, vy: S.vy }, kind, steer, t, S.g);
}
