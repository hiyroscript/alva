// Lightweight, deterministic 2D platform physics.
//
// Bodies use a bottom-centre origin (x = centre, y = feet) and an axis-aligned
// collider that is completely independent from sprite dimensions.
// Integration runs on the fixed simulation step (see battle.js), so movement
// is identical at 30/60/120/144 Hz.
//
// Nothing holds a body inside the stage: there are no side walls. The main
// floor is finite on most stages (see StageCollision), so a body can run,
// jump or be knocked past either ledge and fall; on a stage whose ground is
// continuous (Adamaris's beach) the ground runs on under it instead. Either
// way only the Void (StageCollision.inVoid), a short way past the main
// stage, ends that, and the game modes decide what it means.
//
// A collision always stops the body on that axis: a solid's side zeroes vx,
// a landing or a ceiling zeroes vy. Physics never bounces anything. It
// reports what each contact stopped instead (impactVx / impactVy, with the
// contact's side in wall / landed / bonked), so a caller that knows why the
// body was moving can turn it into a rebound (a hard combat launch, see
// js/game/combat/launch-bounce.js). Physics itself never knows why.
//
// One-way platforms may be dynamic (a stage hazard's, see
// js/game/platform-hazards.js): the same surfaces, moved and switched off
// and on by their controller between steps, never by physics. Physics only
// reads where each one is now and was a step ago (`prevX` / `prevY`), and
// whether it is `active`: a platform switched off is gone from every query
// and every landing, as if it were not there. A body standing on a moving
// one is carried along with it (carryBody) before it takes its own step.

const EPS = 0.5;
// The least a closing Void ever leaves past a ledge or below the main
// stage's top, in world units, whatever its tuning (see closeVoid).
const MIN_VOID_GAP = 40;

// The kinds of main floor a stage may have (map.ground.type, see
// js/data/maps.js): `finite` (the default) is the main stage itself, with a
// ledge at each end; `continuous` is ground that runs on past both sides of
// the Void (a beach, a plain), so there is no ledge to walk off anywhere a
// fighter can be.
export const GROUND_TYPES = Object.freeze(['finite', 'continuous']);

// The extent of `map`'s main floor: { type, left, right }. A finite one is
// exactly map.mainStage's; a continuous one reaches `reach` world units past
// each side of the map's own Void (which a closing Void only ever moves in),
// so its ends are always deep in the black and never reachable. Anything
// else is refused rather than guessed at.
export function resolveGround(map) {
  const main = map.mainStage;
  const g = map.ground ?? { type: 'finite' };
  if (!GROUND_TYPES.includes(g.type)) throw new Error(`[Alva] Stage "${map.id}": unknown ground type "${g.type}"`);
  if (g.type === 'finite') return Object.freeze({ type: 'finite', left: main.left, right: main.right });
  if (!(Number.isFinite(g.reach) && g.reach > 0)) throw new Error(`[Alva] Stage "${map.id}": a continuous ground needs a positive reach`);
  const v = map.voidBounds;
  return Object.freeze({
    type: 'continuous', left: Math.min(main.left, v.left) - g.reach, right: Math.max(main.right, v.right) + g.reach,
  });
}

export class StageCollision {
  constructor(map) {
    const main = map.mainStage;
    // The main floor: a solid block whose top is the ground. It collides
    // like any other solid, so it supports a body only while the body
    // overlaps it horizontally. A finite one is the main stage (below its
    // top its sides are the stage's own cliff faces, not walls around the
    // arena); a continuous one runs far past the Void on both sides (see
    // resolveGround), so nobody ever reaches its ends: the Void takes them
    // first. Either way its top is the ground every mode stands on.
    this.ground = resolveGround(map);
    // No ledges anywhere a fighter can be (a continuous ground).
    this.continuousGround = this.ground.type === 'continuous';
    this.floor = Object.freeze({
      id: '__floor', kind: 'floor', oneWay: false, dropThrough: false,
      x: this.ground.left, y: main.top, w: this.ground.right - this.ground.left, h: main.bottom - main.top,
    });
    this.groundY = main.top;
    this.centerX = (main.left + main.right) / 2;
    // The runtime platforms: this stage's own copies, never the map's
    // (map.platforms is never written). A static one keeps its place; a
    // dynamic one (`dynamic`, from the map) is moved and switched off and on
    // by its controller (js/game/platform-hazards.js). Either way physics
    // reads `x` / `y` (where it is now), `prevX` / `prevY` (where it was a
    // step ago: the same for a static one) and `active` (false: gone from
    // collision). `renderX` / `renderY` are where it is drawn between steps
    // (interpolate) and `opacity` how visible it is: art only.
    this.platforms = map.platforms.map((p) => ({
      dropThrough: true, ...p, oneWay: true,
      active: true, prevX: p.x, prevY: p.y, renderX: p.x, renderY: p.y, opacity: 1,
    }));
    // The dynamic ones among them, in map order.
    this.dynamicPlatforms = this.platforms.filter((p) => p.dynamic);
    this.solids = [
      this.floor,
      ...map.solids.map((s) => ({ ...s, oneWay: false, dropThrough: false })),
    ];
    // The main stage's edges, which the Void never closes past (see
    // closeVoid): on a continuous ground, the combat area the camera frames
    // and the Void is set around, not an end of the ground.
    this.main = Object.freeze({ left: main.left, right: main.right, top: main.top });
    // The danger zones a stage hazard shows right now (its warnings: see
    // js/game/stage-hazards.js), kept live by its controller for whoever
    // reads the stage (the CPU's stage model). Only what is visible is ever
    // here: never where a hazard is going before it shows.
    this.dangerZones = [];
    // The kill boundary (see inVoid): `baseVoid` is the map's own rectangle,
    // copied once and never changed (map.voidBounds is never written);
    // `void` is the one in force, the same rectangle unless a mode closes
    // it in (closeVoid, a Battle's overtime). Each is frozen: a change
    // replaces it whole, so whatever reads `void` (inVoid, projectiles, the
    // drawn Void, the debug overlay) always sees one consistent rectangle.
    this.baseVoid = Object.freeze({ ...map.voidBounds });
    this.void = this.baseVoid;
  }

  // Closes the Void in by `progress` (clamped to 0-1) of the way from the
  // map's own rectangle to `sideEndGap` world units past each ledge and
  // `bottomEndGap` below the main stage's top, linearly; the top never
  // moves. Never past those lines (a gap under MIN_VOID_GAP counts as
  // that), never outward (an edge already closer stays put), and never
  // past a ledge or the surface whatever the numbers, so standing on the
  // main stage is always safe. 0 restores the map's own rectangle.
  closeVoid(progress, { sideEndGap, bottomEndGap }) {
    const base = this.baseVoid;
    const p = Math.min(1, Math.max(0, Number(progress) || 0));
    if (p === 0) {
      this.void = base;
      return this.void;
    }
    const m = this.main;
    const side = Math.max(MIN_VOID_GAP, sideEndGap);
    const below = Math.max(MIN_VOID_GAP, bottomEndGap);
    const left = Math.max(base.left, m.left - side);
    const right = Math.min(base.right, m.right + side);
    const bottom = Math.min(base.bottom, m.top + below);
    // Exact at both ends: the map's own edge at 0, the destination at 1.
    const lerp = (a, b) => a * (1 - p) + b * p;
    this.void = Object.freeze({
      left: Math.min(lerp(base.left, left), m.left - MIN_VOID_GAP),
      right: Math.max(lerp(base.right, right), m.right + MIN_VOID_GAP),
      top: base.top,
      bottom: Math.max(lerp(base.bottom, bottom), m.top + MIN_VOID_GAP),
    });
    return this.void;
  }

  // Where every dynamic platform is drawn, `alpha` (0-1) of the way from
  // its place a step ago to its place now: the same interpolation the
  // fighters are drawn with (Fighter.interpolate), so a rider and its cloud
  // move together on screen.
  interpolate(alpha) {
    for (const p of this.dynamicPlatforms) {
      p.renderX = p.prevX + (p.x - p.prevX) * alpha;
      p.renderY = p.prevY + (p.y - p.prevY) * alpha;
    }
  }

  // Highest surface at or below `y` under horizontal span [x0, x1]:
  // { y, ref }, or { y: Infinity, ref: null } with nothing below at all
  // (past the main floor's edges, over open air). A platform switched off
  // is not there.
  surfaceBelow(x0, x1, y) {
    let best = Infinity;
    let ref = null;
    for (const p of this.platforms) {
      if (p.active === false) continue;
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

  // Whether a solid's side stands anywhere across span [x0, x1] at the
  // height of a body with its feet at `y`, `height` tall: one stepBody would
  // stop that body at, moving across the span. A solid it stands on top of
  // (the main floor included) never counts.
  solidAcross(x0, x1, y, height) {
    return this.solids.some((s) => y > s.y + EPS && y - height < s.y + s.h && x1 > s.x && x0 < s.x + s.w);
  }

  // Whether a body has crossed into the Void: its centre (half its height
  // above its feet) is outside the Void in force (`void`: the map's
  // voidBounds, or closer in through overtime, see closeVoid). A
  // mathematical boundary: the wavering edge the themes draw around it is
  // art only and never moves it.
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
    // The velocity this step's contacts stopped, just before they zeroed it:
    // impactVx for a solid's side (the side is `wall`), impactVy for a
    // landing (`landed`, or a grounded body's resting contact: 0) or a
    // ceiling (`bonked`). 0 when nothing was stopped on that axis. The
    // contact normals follow: (-wall, 0) for a side, (0, -1) for a floor,
    // (0, 1) for a ceiling (world y grows downward).
    impactVx: 0,
    impactVy: 0,
    dropId: null,    // one-way platform currently being dropped through
    dropTimer: 0,
    // How far the platform it stands on carried it this step (carryBody),
    // before its own motion: 0 on anything that never moves.
    carryX: 0,
    carryY: 0,
  };
}

const overlapsX = (b, x0, x1) => b.x + b.halfW > x0 && b.x - b.halfW < x1;

// Carries a body standing on a dynamic platform along with it: by exactly
// the platform's own movement this step (its controller has already moved
// it), so a rider keeps its footing whichever way the platform goes: never
// sinking into one that rises or left hovering over one that sinks. Called
// once per step before the body's own step (stepBody), so its own motion
// and collision start from where the platform took it. Anything else under
// a body (the main floor, a solid, a static platform) never moves it. The
// carry is kept as `carryX` / `carryY`, for whoever draws the body between
// steps. A body in the air is never dragged: jumping off ends the ride.
export function carryBody(b) {
  const g = b.grounded ? b.ground : null;
  if (!g?.dynamic || g.active === false) {
    b.carryX = 0;
    b.carryY = 0;
    return false;
  }
  b.carryX = g.x - g.prevX;
  b.carryY = g.y - g.prevY;
  b.x += b.carryX;
  b.y += b.carryY;
  return b.carryX !== 0 || b.carryY !== 0;
}

// Lets go of a platform that is gone from under a body (switched off: a
// hazard that vanished): no longer its ground, so the body is in the air
// with whatever velocity it had, and gravity takes it from this step on. No
// push, no snap, no speed taken or given. True if it let go.
export function releaseGround(b) {
  if (!b.ground || b.ground.active !== false) return false;
  b.grounded = false;
  b.ground = null;
  return true;
}

// One fixed step of a body's motion through the stage. `maxFall` caps this
// step's fall speed: the body's own unless given (a fighter's slow fall
// passes a lower one, see Fighter.update).
export function stepBody(b, dt, stage, gravity, maxFall = b.maxFall) {
  b.prevX = b.x;
  b.prevY = b.y;
  b.landed = false;
  b.wall = 0;
  b.bonked = false;
  b.impactVx = 0;
  b.impactVy = 0;
  const wasGrounded = b.grounded;

  if (b.dropTimer > 0) {
    b.dropTimer -= dt;
    if (b.dropTimer <= 0) b.dropId = null;
  }

  if (!b.grounded) b.vy = Math.min(b.vy + gravity * b.gravityScale * dt, maxFall);

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
    // The first solid met keeps the speed it stopped (any later one this
    // step meets a body already at rest).
    if (b.vx !== 0) b.impactVx = b.vx;
    b.vx = 0;
  }

  // ---- Vertical ------------------------------------------------------------
  const prevBottom = b.y;
  const prevTop = b.y - b.height;
  b.y += b.vy * dt;

  if (b.vy >= 0) {
    let surface = Infinity;
    let ref = null;
    // A platform that moved this step is landed on if the feet were above
    // it as it was or as it is now (the lower of its two lines, y growing
    // down), so one rising into falling feet catches them rather than
    // passing up through them; for a static one both lines are the same.
    for (const p of stage.platforms) {
      if (p.id === b.dropId || p.active === false) continue;
      const line = p.prevY > p.y ? p.prevY : p.y;
      if (prevBottom <= line + EPS && b.y >= p.y - EPS && p.y < surface && overlapsX(b, p.x, p.x + p.w)) {
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
      b.impactVy = b.vy;
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
        if (b.vy !== 0) b.impactVy = b.vy;
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
