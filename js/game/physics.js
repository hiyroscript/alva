// Lightweight, deterministic 2D platform physics.
//
// Bodies use a bottom-centre origin (x = centre, y = feet) and an axis-aligned
// collider that is completely independent from sprite dimensions.
// Integration runs on the fixed simulation step (see battle.js), so movement
// is identical at 30/60/120/144 Hz.

const EPS = 0.5;

export const FLOOR = Object.freeze({ id: '__floor', kind: 'floor', dropThrough: false });

export class StageCollision {
  constructor(map) {
    this.groundY = map.groundLevel;
    this.left = map.bounds.left;
    this.right = map.bounds.right;
    this.platforms = map.platforms.map((p) => ({ dropThrough: true, ...p, oneWay: true }));
    this.solids = map.solids.map((s) => ({ ...s, oneWay: false, dropThrough: false }));
  }

  // Highest surface at or below `y` under horizontal span [x0, x1].
  surfaceBelow(x0, x1, y) {
    let best = this.groundY;
    let ref = FLOOR;
    for (const p of this.platforms) {
      if (p.y >= y - EPS && p.y < best && x1 > p.x && x0 < p.x + p.w) {
        best = p.y;
        ref = p;
      }
    }
    for (const s of this.solids) {
      if (s.y >= y - EPS && s.y < best && x1 > s.x && x0 < s.x + s.w) {
        best = s.y;
        ref = s;
      }
    }
    return { y: best, ref };
  }
}

export function createBody({ x, y, width, height, gravityScale = 1, maxFall = 1500 }) {
  return {
    x, y, vx: 0, vy: 0,
    prevX: x, prevY: y,
    halfW: width / 2,
    height,
    gravityScale,
    maxFall,
    grounded: true,
    ground: FLOOR,
    landed: false,   // touched down this step
    wall: 0,         // -1 / 1 when pressed against a wall this step
    bonked: false,   // hit a ceiling this step
    dropId: null,    // one-way platform currently being dropped through
    dropTimer: 0,
  };
}

const overlapsX = (b, x0, x1) => b.x + b.halfW > x0 && b.x - b.halfW < x1;

export function stepBody(b, dt, stage, gravity) {
  b.prevX = b.x;
  b.prevY = b.y;
  b.landed = false;
  b.wall = 0;
  b.bonked = false;
  const wasGrounded = b.grounded;

  if (b.dropTimer > 0) {
    b.dropTimer -= dt;
    if (b.dropTimer <= 0) b.dropId = null;
  }

  if (!b.grounded) b.vy = Math.min(b.vy + gravity * b.gravityScale * dt, b.maxFall);

  // ---- Horizontal ----------------------------------------------------------
  b.x += b.vx * dt;
  for (const s of stage.solids) {
    if (b.y <= s.y + EPS || b.y - b.height >= s.y + s.h) continue;
    if (!overlapsX(b, s.x, s.x + s.w)) continue;
    if (b.prevX <= s.x + s.w / 2) {
      b.x = s.x - b.halfW;
      b.wall = 1;
    } else {
      b.x = s.x + s.w + b.halfW;
      b.wall = -1;
    }
    b.vx = 0;
  }
  if (b.x - b.halfW < stage.left) {
    b.x = stage.left + b.halfW;
    if (b.vx < 0) b.vx = 0;
    b.wall = -1;
  } else if (b.x + b.halfW > stage.right) {
    b.x = stage.right - b.halfW;
    if (b.vx > 0) b.vx = 0;
    b.wall = 1;
  }

  // ---- Vertical ------------------------------------------------------------
  const prevBottom = b.y;
  const prevTop = b.y - b.height;
  b.y += b.vy * dt;

  if (b.vy >= 0) {
    let surface = Infinity;
    let ref = null;
    if (b.y >= stage.groundY - EPS) {
      surface = stage.groundY;
      ref = FLOOR;
    }
    for (const p of stage.platforms) {
      if (p.id === b.dropId) continue;
      if (prevBottom <= p.y + EPS && b.y >= p.y - EPS && p.y < surface && overlapsX(b, p.x, p.x + p.w)) {
        surface = p.y;
        ref = p;
      }
    }
    for (const s of stage.solids) {
      if (prevBottom <= s.y + EPS && b.y >= s.y - EPS && s.y < surface && overlapsX(b, s.x, s.x + s.w)) {
        surface = s.y;
        ref = s;
      }
    }
    if (ref) {
      b.y = surface;
      b.vy = 0;
      b.grounded = true;
      b.ground = ref;
      if (!wasGrounded) b.landed = true;
    } else {
      b.grounded = false;
      b.ground = null;
    }
  } else {
    b.grounded = false;
    b.ground = null;
    for (const s of stage.solids) {
      const top = b.y - b.height;
      if (prevTop >= s.y + s.h - EPS && top < s.y + s.h && overlapsX(b, s.x, s.x + s.w)) {
        b.y = s.y + s.h + b.height;
        b.vy = 0;
        b.bonked = true;
      }
    }
  }
}

// Start dropping through the one-way platform the body stands on.
export function dropThrough(b, time) {
  const g = b.ground;
  if (!b.grounded || !g || !g.oneWay || !g.dropThrough) return false;
  b.dropId = g.id;
  b.dropTimer = time;
  b.grounded = false;
  b.ground = null;
  b.y += 1;
  b.vy = Math.max(b.vy, 60);
  return true;
}

// Keep two fighters from overlapping (fighting-game pushboxes). Only applies
// when their vertical extents overlap, so jumping over an opponent works.
export function separate(a, b, aHalf, bHalf, stage) {
  const vertical = a.y - a.height < b.y && b.y - b.height < a.y;
  if (!vertical) return;
  const dx = b.x - a.x;
  const overlap = aHalf + bHalf - Math.abs(dx);
  if (overlap <= 0) return;
  // Only push while both are near the same footing; airborne crossups pass.
  if (!a.grounded && !b.grounded) return;
  const dir = dx !== 0 ? Math.sign(dx) : a.x < (stage.left + stage.right) / 2 ? 1 : -1;
  let pushA = overlap / 2;
  let pushB = overlap / 2;
  // Walls absorb nothing: push the other fighter the whole way.
  if (dir < 0 ? a.x + a.halfW + pushA > stage.right : a.x - a.halfW - pushA < stage.left) {
    pushB += pushA;
    pushA = 0;
  }
  if (dir < 0 ? b.x - b.halfW - pushB < stage.left : b.x + b.halfW + pushB > stage.right) {
    pushA += pushB;
    pushB = 0;
  }
  a.x -= dir * pushA;
  b.x += dir * pushB;
  a.x = Math.min(Math.max(a.x, stage.left + a.halfW), stage.right - a.halfW);
  b.x = Math.min(Math.max(b.x, stage.left + b.halfW), stage.right - b.halfW);
}

// Push a body horizontally out of any solid it overlaps (used after
// pushbox separation, which moves bodies outside of stepBody).
export function resolveSolidOverlap(b, stage) {
  for (const s of stage.solids) {
    if (b.y <= s.y + EPS || b.y - b.height >= s.y + s.h) continue;
    if (!overlapsX(b, s.x, s.x + s.w)) continue;
    if (b.x < s.x + s.w / 2) b.x = s.x - b.halfW;
    else b.x = s.x + s.w + b.halfW;
  }
}
