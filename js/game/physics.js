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
//
// A solid may be switched off the same way (`active` false): a breakable
// section of a sectioned main floor (Jökull's glacier wings, see
// resolveGround), whose controller (js/game/stage-hazards.js) turns it off
// as it breaks away. Gone from every query, every landing, every side and
// every ceiling, as if it were not there: no invisible ground, no invisible
// wall. Physics never switches anything itself.

const EPS = 0.5;
// The least a closing Void ever leaves past a ledge or below the main
// stage's top, in world units, whatever its tuning (see closeVoid).
const MIN_VOID_GAP = 40;

// The kinds of main floor a stage may have (map.ground.type, see
// js/data/maps.js): `finite` (the default) is the main stage itself, with a
// ledge at each end; `continuous` is ground that runs on past both sides of
// the Void (a beach, a plain), so there is no ledge to walk off anywhere a
// fighter can be. A finite floor may also be divided into `sections` (see
// resolveSections): the same main stage, in contiguous blocks side by side.
export const GROUND_TYPES = Object.freeze(['finite', 'continuous']);

// The extent of `map`'s main floor: { type, left, right, sections }. A
// finite one is exactly map.mainStage's, undivided (`sections` null) or in
// its sections; a continuous one reaches `reach` world units past each side
// of the map's own Void (which a closing Void only ever moves in), so its
// ends are always deep in the black and never reachable, and is never
// divided. Anything else is refused rather than guessed at.
export function resolveGround(map) {
  const main = map.mainStage;
  const g = map.ground ?? { type: 'finite' };
  if (!GROUND_TYPES.includes(g.type)) throw new Error(`[Alva] Stage "${map.id}": unknown ground type "${g.type}"`);
  if (g.type === 'finite') {
    return Object.freeze({ type: 'finite', left: main.left, right: main.right, sections: resolveSections(map, g.sections) });
  }
  if (g.sections != null) throw new Error(`[Alva] Stage "${map.id}": a continuous ground cannot be divided into sections`);
  if (!(Number.isFinite(g.reach) && g.reach > 0)) throw new Error(`[Alva] Stage "${map.id}": a continuous ground needs a positive reach`);
  const v = map.voidBounds;
  return Object.freeze({
    type: 'continuous', left: Math.min(main.left, v.left) - g.reach, right: Math.max(main.right, v.right) + g.reach, sections: null,
  });
}

// A finite floor's sections (map.ground.sections), left to right, each
// { id, left, right, breakable }; null for an undivided floor. They must
// tile the main stage exactly: the first starts at its left edge, each
// next one where the last ends (no gap, no overlap) and the last ends at
// its right edge, so the floor is one uninterrupted surface at one height.
// `breakable` marks a section a stage hazard may switch off (see
// StageCollision); the one under the main stage's centre never is: it is
// the floor (StageCollision.floor), the footing that is always there.
function resolveSections(map, sections) {
  if (sections == null) return null;
  const main = map.mainStage;
  const fail = (why) => {
    throw new Error(`[Alva] Stage "${map.id}": ${why}`);
  };
  if (!Array.isArray(sections) || sections.length < 2) fail('a sectioned floor needs at least two sections');
  const ids = new Set();
  let x = main.left;
  const out = sections.map((s) => {
    if (typeof s?.id !== 'string' || !s.id || ids.has(s.id)) fail('every floor section needs an id of its own');
    ids.add(s.id);
    if (!(Number.isFinite(s.left) && Number.isFinite(s.right) && s.right > s.left)) fail(`floor section "${s.id}" needs a left and a right`);
    if (s.left !== x) fail(`floor section "${s.id}" must start where the last one ends, at ${x}: no gap, no overlap`);
    x = s.right;
    return Object.freeze({ id: s.id, left: s.left, right: s.right, breakable: s.breakable === true });
  });
  if (x !== main.right) fail('the floor sections must end at the main stage\'s right edge');
  const centre = (main.left + main.right) / 2;
  if (out.find((s) => s.left <= centre && centre <= s.right).breakable) fail('the section under the main stage\'s centre cannot be breakable');
  return Object.freeze(out);
}

// Whether surface `s` spans world x `x` (its left edge in, its right out),
// for choosing between two surfaces at the same height under one body: the
// one under its centre holds it (see stepBody, surfaceBelow).
const holds = (s, x) => x >= s.x && x < s.x + s.w;

export class StageCollision {
  constructor(map) {
    const main = map.mainStage;
    this.groundY = main.top;
    this.centerX = (main.left + main.right) / 2;
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
    const block = (id, left, right, extra) => ({
      id, kind: 'floor', oneWay: false, dropThrough: false, x: left, y: main.top, w: right - left, h: main.bottom - main.top, ...extra,
    });
    if (this.ground.sections) {
      // A sectioned floor (Jökull's glacier): one solid per section, side by
      // side at one height, each its whole block down to the main stage's
      // bottom. A breakable one is this stage's own runtime copy, `active`
      // until its stage hazard switches it off (js/game/stage-hazards.js);
      // a permanent one never changes. A body crossing from one to the next
      // meets no wall or step: a section's side stops only a body below its
      // top, and the next one's top is level with it.
      this.floors = Object.freeze(this.ground.sections.map((s) => (s.breakable
        ? block(s.id, s.left, s.right, { section: true, breakable: true, active: true })
        : Object.freeze(block(s.id, s.left, s.right, { section: true, breakable: false })))));
      // The floor: the permanent section under the main stage's centre.
      this.floor = this.floors.find((f) => !f.breakable && f.x <= this.centerX && this.centerX <= f.x + f.w);
    } else {
      this.floor = Object.freeze(block('__floor', this.ground.left, this.ground.right));
      this.floors = Object.freeze([this.floor]);
    }
    // The sections a stage hazard may switch off, left to right (none on an
    // undivided floor).
    this.breakableFloors = this.floors.filter((f) => f.breakable);
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
      ...this.floors,
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
  // (past the main floor's edges, over open air). A platform or solid
  // switched off is not there. Of two at the same height (two sections of
  // a sectioned floor) the one under the span's centre is the one, as
  // stepBody lands a body.
  surfaceBelow(x0, x1, y) {
    let best = Infinity;
    let ref = null;
    const mid = (x0 + x1) / 2;
    for (const p of this.platforms) {
      if (p.active === false) continue;
      if (p.y >= y - EPS && (p.y < best || (p.y === best && !holds(ref, mid) && holds(p, mid))) && x1 > p.x && x0 < p.x + p.w) {
        best = p.y;
        ref = p;
      }
    }
    for (const s of this.solids) {
      if (s.active === false) continue;
      if (s.y >= y - EPS && (s.y < best || (s.y === best && !holds(ref, mid) && holds(s, mid))) && x1 > s.x && x0 < s.x + s.w) {
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
    return this.solids.some((s) => s.active !== false && y > s.y + EPS && y - height < s.y + s.h && x1 > s.x && x0 < s.x + s.w);
  }

  // The floor section `id` (a sectioned floor's, see resolveGround), or null.
  floorSection(id) {
    return this.floors.find((f) => f.id === id) ?? null;
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

// Lets go of a surface that is gone from under a body (switched off: a
// hazard that vanished, a floor section that broke away): no longer its
// ground, so the body is in the air with whatever velocity it had, and
// gravity takes it from this step on. No push, no snap, no speed taken or
// given. True if it let go. Given the stage, a body that another surface
// still holds up at the very same height (the neighbouring section of a
// sectioned floor, which its collider still overlaps: the ordinary ledge
// rule) stands on that one instead, with no fall: that is legitimate
// footing, not a landing.
export function releaseGround(b, stage = null) {
  if (!b.ground || b.ground.active !== false) return false;
  const next = stage?.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y);
  if (next?.ref && Math.abs(next.y - b.y) <= EPS) {
    b.ground = next.ref;
    return false;
  }
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
  // Solids only (the main floor's body included, a switched-off one never):
  // nothing else stops a body sideways, so it can always leave the stage.
  b.x += b.vx * dt;
  for (const s of stage.solids) {
    if (s.active === false || b.y <= s.y + EPS || b.y - b.height >= s.y + s.h) continue;
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
    // Of two surfaces at the same height under the body (two sections of a
    // sectioned floor) the one under its centre holds it, so its ground
    // passes from one section to the next exactly as its centre crosses the
    // seam between them, and never back and forth while it stays put.
    for (const p of stage.platforms) {
      if (p.id === b.dropId || p.active === false) continue;
      const line = p.prevY > p.y ? p.prevY : p.y;
      if (prevBottom <= line + EPS && b.y >= p.y - EPS && (p.y < surface || (p.y === surface && !holds(ref, b.x) && holds(p, b.x))) &&
        overlapsX(b, p.x, p.x + p.w)) {
        surface = p.y;
        ref = p;
      }
    }
    for (const s of stage.solids) {
      if (s.active === false) continue;
      if (prevBottom <= s.y + EPS && b.y >= s.y - EPS && (s.y < surface || (s.y === surface && !holds(ref, b.x) && holds(s, b.x))) &&
        overlapsX(b, s.x, s.x + s.w)) {
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
      if (s.active === false) continue;
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
// The overlap is split evenly unless `aShare` says what part of it `a`
// takes (0: `a` holds its ground and `b` alone moves out of it): there are
// no walls to push against, so a fighter at a ledge can be pushed off it.
// Solids (the main floor's cliff faces included) are resolved afterwards by
// resolveSolidOverlap. True when the two overlapped and were moved apart.
export function separate(a, b, aHalf, bHalf, stage, aShare = 0.5) {
  const vertical = a.y - a.height < b.y && b.y - b.height < a.y;
  if (!vertical) return false;
  const dx = b.x - a.x;
  const overlap = aHalf + bHalf - Math.abs(dx);
  if (overlap <= 0) return false;
  // Only push while both are near the same footing; airborne crossups pass.
  if (!a.grounded && !b.grounded) return false;
  // Exactly level: a fixed tie-break by side of the main stage.
  const dir = dx !== 0 ? Math.sign(dx) : a.x < stage.centerX ? 1 : -1;
  a.x -= dir * overlap * aShare;
  b.x += dir * overlap * (1 - aShare);
  return true;
}

// Push a body horizontally out of any solid it overlaps (used after
// pushbox separation, which moves bodies outside of stepBody).
export function resolveSolidOverlap(b, stage) {
  for (const s of stage.solids) {
    if (s.active === false || b.y <= s.y + EPS || b.y - b.height >= s.y + s.h) continue;
    if (!overlapsX(b, s.x, s.x + s.w)) continue;
    if (b.x < s.x + s.w / 2) b.x = s.x - b.halfW;
    else b.x = s.x + s.w + b.halfW;
  }
}
