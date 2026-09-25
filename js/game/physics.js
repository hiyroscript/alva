// Lightweight, deterministic 2D platform physics.
//
// Bodies use a bottom-centre origin (x = centre, y = feet) and an axis-aligned
// collider that is completely independent from sprite dimensions.
// Integration runs on the fixed simulation step (see battle.js), so movement
// is identical at 30/60/120/144 Hz.
//
// Nothing holds a body inside the stage: there are no side walls. The main
// floor is finite (see StageCollision), so a body can run, jump or be
// knocked past either ledge and fall; only the Void (StageCollision.inVoid),
// far away, ends that, and the game modes decide what it means.

const EPS = 0.5;

export class StageCollision {
  constructor(map) {
    const main = map.mainStage;
    // The main floor: a finite solid block whose top is the ground. It
    // collides like any other solid, so it supports a body only while the
    // body overlaps it horizontally, and below its top its sides are the
    // stage's own cliff faces, not walls around the arena.
    this.floor = Object.freeze({
      id: '__floor', kind: 'floor', oneWay: false, dropThrough: false,
      x: main.left, y: main.top, w: main.right - main.left, h: main.bottom - main.top,
    });
    this.groundY = main.top;
    this.centerX = (main.left + main.right) / 2;
    this.platforms = map.platforms.map((p) => ({ dropThrough: true, ...p, oneWay: true }));
    this.solids = [
      this.floor,
      ...map.solids.map((s) => ({ ...s, oneWay: false, dropThrough: false })),
    ];
    // The kill boundary, a fixed rectangle (see inVoid).
    this.void = Object.freeze({ ...map.voidBounds });
  }

  // Highest surface at or below `y` under horizontal span [x0, x1]:
  // { y, ref }, or { y: Infinity, ref: null } with nothing below at all
  // (past the main floor's edges, over open air).
  surfaceBelow(x0, x1, y) {
    let best = Infinity;
    let ref = null;
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

  // Whether something under span [x0, x1] is at height `y` (within EPS) to
  // stand on: the same horizontal overlap stepBody lands a body with. A lower
  // surface further down does not count.
  supportsAt(x0, x1, y) {
    return Math.abs(this.surfaceBelow(x0, x1, y).y - y) <= EPS;
  }

  // Whether a body has crossed into the Void: its centre (half its height
  // above its feet) is outside voidBounds. A fixed, mathematical boundary:
  // the wavering edge the themes draw is art only and never moves it.
  inVoid(b) {
    const v = this.void;
    const x = b.x;
    const y = b.y - b.height / 2;
    return x < v.left || x > v.right || y < v.top || y > v.bottom;
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
    grounded: false,
    ground: null,
    landed: false,   // touched down this step
    wall: 0,         // -1 / 1 when pressed against a solid's side this step
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
  // Solids only (the main floor's body included): nothing else stops a body
  // sideways, so it can always leave the stage.
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

  // ---- Vertical ------------------------------------------------------------
  const prevBottom = b.y;
  const prevTop = b.y - b.height;
  b.y += b.vy * dt;

  if (b.vy >= 0) {
    let surface = Infinity;
    let ref = null;
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
// The overlap is split evenly: there are no walls to push against, so a
// fighter at a ledge can be pushed off it. Solids (the main floor's cliff
// faces included) are resolved afterwards by resolveSolidOverlap.
export function separate(a, b, aHalf, bHalf, stage) {
  const vertical = a.y - a.height < b.y && b.y - b.height < a.y;
  if (!vertical) return;
  const dx = b.x - a.x;
  const overlap = aHalf + bHalf - Math.abs(dx);
  if (overlap <= 0) return;
  // Only push while both are near the same footing; airborne crossups pass.
  if (!a.grounded && !b.grounded) return;
  // Exactly level: a fixed tie-break by side of the main stage.
  const dir = dx !== 0 ? Math.sign(dx) : a.x < stage.centerX ? 1 : -1;
  a.x -= (dir * overlap) / 2;
  b.x += (dir * overlap) / 2;
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
