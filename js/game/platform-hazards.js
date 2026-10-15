// Platform hazards: the runtime of a stage's dynamic one-way platforms
// (Asperitas's two drifting clouds today; any future stage's moving or
// vanishing platforms the same way).
//
// Purpose: one HazardController per dynamic platform, each its own state
// machine on its own random stream: what state it is in, how long that
// lasts, where it is going and how fast, whether it is solid and how
// visible it is. Nothing is shared between two controllers but the stage
// they must keep clear of each other on: no common timer, state or stream,
// so two hazards line up only by chance. PlatformHazards runs a stage's
// controllers once per fixed step.
// Inputs: a StageCollision (js/game/physics.js), whose runtime platforms
// marked `dynamic` the controllers move and switch off and on; the
// behaviour each names (js/data/platform-hazards.js); a seed; each step,
// the bodies of the fighters in play (to keep a forming platform out of
// them and to let go of any standing on one that vanished).
// Outputs: HazardController, PlatformHazards, hazardEnvelope,
// hazardVolume, mainKeepOut, assertHazardLayout.
// Important constraints: deterministic and fixed-step (each random draw
// comes from the platform's own seeded stream, only as a state starts or a
// placement is tried, so how often the screen draws changes nothing); never
// writes the map (every battle and preview builds its own); a platform only
// ever moves inside its own region, whose whole envelope is disjoint from
// the main stage's and every other hazard's (assertHazardLayout, checked as
// the stage is built), and every move and placement is validated again
// against where the others are now and are going, so no two platforms can
// ever touch, not even for one step. A platform never moves while visible
// except by easing (no teleport): it relocates only while hidden. It never
// pushes, damages or launches anyone; a fighter whose platform vanishes
// simply falls (releaseGround), and a platform never forms into a fighter.

import { PLATFORM_BEHAVIORS, HAZARD_STATES, ORDINARY_STATES } from '../data/platform-hazards.js';
import { releaseGround } from './physics.js';
import { mulberry32, deriveSeed, range, clamp } from '../core/utils.js';

const S = HAZARD_STATES;
// Room above a platform for a fighter standing on it, when checking the
// Void's top: a body's centre is about half this above its feet, and no
// fighter is this tall (the tallest collider is 100).
const STANDING_ROOM = 120;
// How far inside the Void in force a platform (and whoever stands on it)
// must stay.
const VOID_MARGIN = 40;
// Floating-point slack for comparisons against a region's edges.
const EPS = 1e-6;

// A stream index for platform `id` (FNV-1a), for deriveSeed: every hazard
// draws from its own stream of the battle's seed, never 0 or 1 (the CPUs').
function streamOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 2 + ((h >>> 0) % 0x7ffffff0);
}

// The sine ease a move follows: 0 to 1, at rest at both ends.
const ease = (k) => (1 - Math.cos(Math.PI * k)) / 2;

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const union = (a, b) => ({
  left: Math.min(a.left, b.left), right: Math.max(a.right, b.right),
  top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom),
});

// The volume a platform with its collision slab at (x, y) fills: the slab
// (x to x + w, y to y + h) and its art around it (behavior.volume).
export function hazardVolume(p, behavior, x = p.x, y = p.y) {
  const v = behavior.volume;
  return { left: x - v.side, right: x + p.w + v.side, top: y - v.top, bottom: y + (p.h ?? 0) + v.bottom };
}

// Everywhere a platform's volume can ever be: its whole region (the
// dynamic.region its slab stays inside, see js/data/maps.js), with its art
// around it.
export function hazardEnvelope(p, behavior) {
  const r = p.dynamic.region;
  const v = behavior.volume;
  return { left: r.left - v.side, right: r.right + v.side, top: r.top - v.top, bottom: r.bottom + (p.h ?? 0) + v.bottom };
}

// What a hazard keeps clear of on the main stage: the main floor's block
// and `clearance` above its top, room for a fighter standing on the main
// stage under it, and its art (dynamic.mainClearance on the platform).
export function mainKeepOut(stage, clearance = 0) {
  const f = stage.floor;
  return { left: f.x, right: f.x + f.w, top: f.y - clearance, bottom: f.y + f.h };
}

// Refuses a stage whose hazards could ever touch: each one's start inside
// its region, and every envelope disjoint from the main stage's keep-out
// and from every other envelope. Then no move inside the regions can ever
// make two platforms meet, by construction.
export function assertHazardLayout(stage) {
  const list = stage.dynamicPlatforms.map((p) => ({ p, behavior: behaviorOf(p) }));
  for (const { p, behavior } of list) {
    const r = p.dynamic.region;
    const numbers = [r?.left, r?.right, r?.top, r?.bottom, p.dynamic.mainClearance, p.w, p.h];
    if (!numbers.every(Number.isFinite)) throw new Error(`[Alva] Hazard "${p.id}": region, mainClearance, w and h must be numbers`);
    if (!(r.left <= p.x + EPS && p.x + p.w <= r.right + EPS && r.top <= p.y + EPS && p.y <= r.bottom + EPS)) {
      throw new Error(`[Alva] Hazard "${p.id}" starts outside its region`);
    }
    if (r.right - r.left < p.w) throw new Error(`[Alva] Hazard "${p.id}": its region is narrower than it`);
    if (p.dynamic.disappears && p.dynamic.reappearance !== 'random') {
      throw new Error(`[Alva] Hazard "${p.id}": a disappearing platform reappears at random (reappearance: 'random')`);
    }
    if (overlaps(hazardEnvelope(p, behavior), mainKeepOut(stage, p.dynamic.mainClearance))) {
      throw new Error(`[Alva] Hazard "${p.id}" could reach the main stage`);
    }
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (overlaps(hazardEnvelope(list[i].p, list[i].behavior), hazardEnvelope(list[j].p, list[j].behavior))) {
        throw new Error(`[Alva] Hazards "${list[i].p.id}" and "${list[j].p.id}" could meet`);
      }
    }
  }
}

function behaviorOf(p) {
  const behavior = PLATFORM_BEHAVIORS[p.dynamic.behavior];
  if (!behavior) throw new Error(`[Alva] Hazard "${p.id}": unknown behaviour "${p.dynamic.behavior}"`);
  return behavior;
}

// One dynamic platform's state machine. It owns `platform` (a runtime
// platform of the stage: its x / y / prevX / prevY / active / opacity) and
// writes nothing else; `system` is the PlatformHazards it runs in, for
// the stage and the other hazards it keeps clear of.
export class HazardController {
  constructor(platform, system, seed) {
    this.platform = platform;
    this.system = system;
    this.id = platform.id;
    this.behavior = behaviorOf(platform);
    this.region = platform.dynamic.region;
    // Where the map places it: every reset starts it there.
    this.home = { x: platform.x, y: platform.y };
    this.seed = seed >>> 0;
    this.rng = mulberry32(deriveSeed(this.seed, streamOf(this.id)));
    this.reset();
  }

  // Back at its map position, solid and fully visible, starting an
  // ordinary state of its own (never disappearing at once). The stream
  // carries on: a rematch is a fresh layout, not a replay of the last.
  reset() {
    const p = this.platform;
    p.x = p.prevX = p.renderX = this.home.x;
    p.y = p.prevY = p.renderY = this.home.y;
    p.active = true;
    p.opacity = 1;
    p.vx = 0;
    p.vy = 0;
    // The current state and how long it has run / lasts (seconds).
    this.state = S.idle;
    this.time = 0;
    this.duration = 0;
    // A move: the way it goes (-1 / 1), its average speed, where it set off
    // from and where it ends, and its axis ('x' / 'y').
    this.direction = 0;
    this.speed = 0;
    this.axis = null;
    this.from = { x: p.x, y: p.y };
    this.to = { x: p.x, y: p.y };
    // A disappearance: where it vanished, and where it will form again
    // (null until a placement is found).
    this.vanishedAt = null;
    this.target = null;
    // Placements tried and failed in a row while hidden (bounded per try),
    // and whether it has moved to its new place yet.
    this.failures = 0;
    this.relocated = false;
    // States entered so far (tests, debugging).
    this.history = [];
    this.begin(this.pick({ allowDisappear: false }));
    this.sync();
  }

  get rect() {
    const p = this.platform;
    return { left: p.x, right: p.x + p.w, top: p.y, bottom: p.y + (p.h ?? 0) };
  }

  // Everywhere this platform's volume may be over its current state: where
  // it is now, the rest of its move, and the place it will form again. The
  // other hazards keep clear of all of it.
  get reserved() {
    const p = this.platform;
    const b = this.behavior;
    let box = null;
    if (this.state !== S.hidden) box = hazardVolume(p, b);
    if (this.state === S.horizontal || this.state === S.vertical) box = union(box, hazardVolume(p, b, this.to.x, this.to.y));
    if (this.target) {
      const t = hazardVolume(p, b, this.target.x, this.target.y);
      box = box ? union(box, t) : t;
    }
    return box;
  }

  // One fixed step. `bodies` are the fighters' bodies in play.
  step(dt, bodies) {
    const p = this.platform;
    const b = this.behavior;
    this.time += dt;
    const k = this.duration > 0 ? clamp(this.time / this.duration, 0, 1) : 1;
    switch (this.state) {
      case S.idle:
        if (k >= 1) this.begin(this.pick());
        break;
      case S.horizontal:
      case S.vertical: {
        const e = ease(k);
        p.x = this.from.x + (this.to.x - this.from.x) * e;
        p.y = this.from.y + (this.to.y - this.from.y) * e;
        if (k >= 1) {
          p.x = this.to.x;
          p.y = this.to.y;
          this.begin(this.pick());
        }
        break;
      }
      case S.disappearing:
        // Collision stays on through the fade: it goes as the cloud does.
        p.opacity = 1 - k;
        if (k >= 1) this.begin(S.hidden);
        break;
      case S.hidden:
        // Relocated on its first step fully hidden: it vanished at its old
        // place (the step its fade ended) and is moved only once nothing of
        // it has been drawn for a whole step.
        if (this.target && !this.relocated) {
          this.moveTo(this.target.x, this.target.y);
          this.relocated = true;
        }
        if (k < 1) break;
        // Time to form again: at the place chosen as it vanished, if that
        // is still clear, else at a fresh one; if nowhere is clear yet, it
        // waits hidden and tries again (never forming into anyone).
        if (!this.target || !this.clearAt(this.target.x, this.target.y, bodies)) this.target = this.findPlacement(bodies);
        if (this.target) this.begin(S.reappearing);
        else {
          this.failures++;
          this.duration += b.retrySeconds;
        }
        break;
      case S.reappearing: {
        // Fading in where it relocated to, still. Solid from `solidAt` of
        // the fade, once nobody is inside it; until then it holds there,
        // half-formed and not solid.
        if (!p.active) {
          if (k >= b.solidAt) {
            if (this.occupied(p.x, p.y, bodies)) this.time = b.solidAt * this.duration;
            else p.active = true;
          }
          p.opacity = Math.min(k, b.solidAt);
        } else {
          p.opacity = k;
          if (k >= 1) this.begin(this.pick({ allowDisappear: false }));
        }
        break;
      }
      default:
        break;
    }
    p.vx = (p.x - p.prevX) / dt;
    p.vy = (p.y - p.prevY) / dt;
    this.sync();
  }

  // Mirrors the state onto the platform, for whoever draws or reads it.
  sync() {
    const p = this.platform;
    p.state = this.state;
    // How far a forming platform has come (0-1), and how far a fading one
    // has gone: art only.
    p.formation = this.state === S.reappearing ? (this.duration > 0 ? clamp(this.time / this.duration, 0, 1) : 1) : this.state === S.hidden ? 0 : 1;
  }

  // The ordinary states this platform has (see `dynamic` in
  // js/data/maps.js): always idle, the moves it makes, and disappearing if
  // it disappears.
  get ordinary() {
    const d = this.platform.dynamic;
    return ORDINARY_STATES.filter((s) => s === S.idle || (s === S.disappearing ? d.disappears : (d.moves ?? []).includes(s)));
  }

  // The next ordinary state, by the behaviour's weights.
  pick({ allowDisappear = true } = {}) {
    const w = this.behavior.weights;
    const options = this.ordinary.filter((s) => allowDisappear || s !== S.disappearing);
    const total = options.reduce((sum, s) => sum + (w[s] ?? 0), 0);
    let r = this.rng() * total;
    for (const s of options) {
      r -= w[s] ?? 0;
      if (r < 0) return s;
    }
    return options[options.length - 1];
  }

  // Enters `state`, drawing its own duration (and a move's way and length)
  // from this platform's stream. A move with nowhere valid to go is an idle
  // instead.
  begin(state) {
    const p = this.platform;
    const b = this.behavior;
    if ((state === S.horizontal || state === S.vertical) && !this.planMove(state === S.horizontal ? 'x' : 'y')) state = S.idle;
    this.state = state;
    this.time = 0;
    this.history.push(state);
    if (this.history.length > 64) this.history.shift();
    switch (state) {
      case S.idle:
        this.duration = range(this.rng, ...b.idleSeconds);
        this.direction = 0;
        this.speed = 0;
        this.axis = null;
        break;
      case S.horizontal:
      case S.vertical:
        // Set by planMove.
        break;
      case S.disappearing:
        this.duration = range(this.rng, ...b.fadeOutSeconds);
        this.direction = 0;
        this.speed = 0;
        this.axis = null;
        break;
      case S.hidden:
        // Gone: no collision from this very step (releaseGround lets go of
        // anyone on it), and it relocates now, while nobody can see it.
        p.active = false;
        p.opacity = 0;
        this.duration = range(this.rng, ...b.hiddenSeconds);
        this.vanishedAt = { x: p.x, y: p.y };
        this.failures = 0;
        // Where it will form again, chosen now; it moves there on its next
        // step, while nobody can see it (see step).
        this.target = this.findPlacement(this.system.bodies);
        this.relocated = false;
        break;
      case S.reappearing:
        // Formed exactly where it is going to be: it never moves while it
        // fades in.
        this.moveTo(this.target.x, this.target.y);
        this.target = null;
        this.duration = range(this.rng, ...b.fadeInSeconds);
        p.opacity = 0;
        p.active = false;
        break;
      default:
        break;
    }
  }

  // Puts the platform at (x, y) at once, with no motion in between: only
  // ever while it is hidden.
  moveTo(x, y) {
    const p = this.platform;
    p.x = p.prevX = p.renderX = x;
    p.y = p.prevY = p.renderY = y;
  }

  // Plans a move along `axis` from where the platform is: a random way, a
  // random length, kept inside its region (the other way if this one has no
  // room, shortened to the room there is), and refused if it would sweep
  // through anything another platform holds. False: no valid move.
  planMove(axis) {
    const p = this.platform;
    const b = this.behavior;
    const r = this.region;
    const horizontal = axis === 'x';
    const pos = horizontal ? p.x : p.y;
    const lo = horizontal ? r.left : r.top;
    const hi = horizontal ? r.right - p.w : r.bottom;
    let dir = this.rng() < 0.5 ? -1 : 1;
    let travel = range(this.rng, ...(horizontal ? b.horizontalTravel : b.verticalTravel));
    const room = (d) => (d > 0 ? hi - pos : pos - lo);
    if (room(dir) < travel) {
      if (room(-dir) >= travel) dir = -dir;
      else {
        if (room(-dir) > room(dir)) dir = -dir;
        travel = room(dir);
      }
    }
    if (travel < b.minTravel) return false;
    const end = clamp(pos + dir * travel, lo, hi);
    const to = horizontal ? { x: end, y: p.y } : { x: p.x, y: end };
    const swept = union(hazardVolume(p, b), hazardVolume(p, b, to.x, to.y));
    if (!this.sweepClear(swept)) return false;
    this.axis = axis;
    this.direction = dir;
    this.from = { x: p.x, y: p.y };
    this.to = to;
    this.duration = range(this.rng, ...b.moveSeconds);
    this.speed = Math.abs(end - pos) / this.duration;
    return true;
  }

  // Whether a volume is clear of the main stage's keep-out and of all every
  // other hazard holds (see reserved).
  sweepClear(box) {
    if (overlaps(box, mainKeepOut(this.system.stage, this.platform.dynamic.mainClearance))) return false;
    for (const other of this.system.controllers) {
      if (other === this) continue;
      const held = other.reserved;
      if (held && overlaps(box, held)) return false;
    }
    return true;
  }

  // Whether a fighter's collider (with the behaviour's margin) is inside
  // the volume the platform would fill at (x, y).
  occupied(x, y, bodies) {
    const box = hazardVolume(this.platform, this.behavior, x, y);
    const m = this.behavior.fighterMargin;
    for (const body of bodies ?? []) {
      const f = { left: body.x - body.halfW - m, right: body.x + body.halfW + m, top: body.y - body.height - m, bottom: body.y + m };
      if (overlaps(box, f)) return true;
    }
    return false;
  }

  // Whether the platform may form at (x, y): inside its region, clear of
  // the main stage and the other hazards, of every fighter, and inside the
  // Void in force (overtime's closing Void included) with room to stand.
  clearAt(x, y, bodies) {
    const p = this.platform;
    const r = this.region;
    if (x < r.left - EPS || x + p.w > r.right + EPS || y < r.top - EPS || y > r.bottom + EPS) return false;
    const box = hazardVolume(p, this.behavior, x, y);
    if (!this.sweepClear(box)) return false;
    const v = this.system.stage.void;
    if (box.left < v.left + VOID_MARGIN || box.right > v.right - VOID_MARGIN) return false;
    if (y - STANDING_ROOM < v.top + VOID_MARGIN || box.bottom > v.bottom - VOID_MARGIN) return false;
    return !this.occupied(x, y, bodies);
  }

  // A new place to form, anywhere in its region in both x and y: random
  // candidates first (the first clear one at least minRelocation from where
  // it vanished), then the region's corners and middle; failing those, the
  // farthest clear place found at any distance. Null when nothing is clear.
  // Always a bounded number of tries.
  findPlacement(bodies) {
    const p = this.platform;
    const b = this.behavior;
    const r = this.region;
    const from = this.vanishedAt ?? { x: p.x, y: p.y };
    const dist = (c) => Math.hypot(c.x - from.x, c.y - from.y);
    const x1 = r.right - p.w;
    let fallback = null;
    const consider = (c) => {
      if (!this.clearAt(c.x, c.y, bodies)) return false;
      if (dist(c) >= b.minRelocation) return true;
      if (!fallback || dist(c) > dist(fallback)) fallback = c;
      return false;
    };
    for (let i = 0; i < b.placementAttempts; i++) {
      const c = { x: range(this.rng, r.left, x1), y: range(this.rng, r.top, r.bottom) };
      if (consider(c)) return c;
    }
    const fixed = [
      { x: r.left, y: r.top }, { x: x1, y: r.top }, { x: r.left, y: r.bottom }, { x: x1, y: r.bottom },
      { x: (r.left + x1) / 2, y: (r.top + r.bottom) / 2 },
    ].sort((a, c) => dist(c) - dist(a));
    for (const c of fixed) if (consider(c)) return c;
    return fallback;
  }
}

// A stage's hazards: one controller per dynamic platform of `stage`, each
// seeded from `seed` on its own stream. A stage with none has nothing to
// run.
export class PlatformHazards {
  constructor(stage, { seed = 0 } = {}) {
    this.stage = stage;
    this.seed = seed >>> 0;
    this.bodies = [];
    assertHazardLayout(stage);
    this.controllers = [];
    for (const p of stage.dynamicPlatforms) this.controllers.push(new HazardController(p, this, this.seed));
  }

  // The controller of platform `id`, or null.
  get(id) {
    return this.controllers.find((c) => c.id === id) ?? null;
  }

  // Every hazard back at its map position, starting over.
  reset() {
    for (const c of this.controllers) c.reset();
  }

  // One fixed step, before the fighters take theirs: every platform's last
  // place kept as `prevX` / `prevY`, each controller's step in map order
  // (each sees where the ones before it have just gone), then every body
  // standing on a platform that has just vanished lets go of it.
  // `fighters` are the fighters in play (anything with a `body`).
  update(dt, fighters = []) {
    if (!this.controllers.length) return;
    const bodies = this.bodies;
    bodies.length = 0;
    for (const f of fighters) bodies.push(f.body ?? f);
    for (const c of this.controllers) {
      c.platform.prevX = c.platform.x;
      c.platform.prevY = c.platform.y;
    }
    for (const c of this.controllers) c.step(dt, bodies);
    for (const b of bodies) releaseGround(b);
  }
}
