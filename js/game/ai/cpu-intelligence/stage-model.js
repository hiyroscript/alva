// CPU Intelligence: the universal stage analyzer.
//
// Purpose: what the stage means for a fight, read from its real collision
// geometry (js/game/physics.js StageCollision), for any stage: the main
// floor and its two ledges, every surface a fighter can stand on (the
// floor, one-way platforms, the tops of solid blocks), how much room there
// is to an edge, how far a point is from the Void in force (overtime's
// closing Void included: it is read live, never cached), and which surfaces
// lead to which by a jump or a walk off an edge. Desert, City and any
// future stage work the same way.
//
// Inputs: a StageCollision. Outputs: StageModel (one per stage, cached).
// Important constraints: read-only; nothing here assumes a platform drop,
// since no player control has one: the way down from a platform is to walk
// off its edge.

const CACHE = new WeakMap();

export class StageModel {
  constructor(stage) {
    this.stage = stage;
    const floor = stage.floor;
    this.floor = floor;
    this.left = floor.x;
    this.right = floor.x + floor.w;
    this.top = floor.y;
    this.centerX = stage.centerX;
    this.width = floor.w;
    // Every surface a fighter can stand on: the main floor's top, each
    // one-way platform, each other solid's top.
    this.surfaces = [
      { ref: floor, x0: floor.x, x1: floor.x + floor.w, y: floor.y, main: true, oneWay: false },
      ...stage.platforms.map((p) => ({ ref: p, x0: p.x, x1: p.x + p.w, y: p.y, main: false, oneWay: true })),
      ...stage.solids.filter((s) => s !== floor).map((s) => ({ ref: s, x0: s.x, x1: s.x + s.w, y: s.y, main: false, oneWay: false })),
    ];
  }

  static of(stage) {
    let model = CACHE.get(stage);
    if (!model) {
      model = new StageModel(stage);
      CACHE.set(stage, model);
    }
    return model;
  }

  // The Void in force (the map's own, or closer in through overtime).
  get void() {
    return this.stage.void;
  }

  // The surface entry standing on `ref` (a body's `ground`), or null.
  surfaceOf(ref) {
    if (!ref) return null;
    return this.surfaces.find((s) => s.ref === ref) ?? null;
  }

  // Whether anything to stand on lies at or below `y` under [x - halfW, x + halfW].
  supported(x, halfW, y) {
    return !!this.stage.surfaceBelow(x - halfW, x + halfW, y).ref;
  }

  // The height of the highest surface at or below `y` under the span (Infinity over open air).
  groundBelow(x, halfW, y) {
    return this.stage.surfaceBelow(x - halfW, x + halfW, y).y;
  }

  // World units from `x` to the main floor's edge going `dir` (1 right,
  // -1 left); negative once past it.
  edgeRoom(x, dir) {
    return dir > 0 ? this.right - x : x - this.left;
  }

  // The nearer main-floor edge: { dir, room }.
  nearestEdge(x) {
    const r = this.right - x;
    const l = x - this.left;
    return r < l ? { dir: 1, room: r } : { dir: -1, room: l };
  }

  // Whether `x` is over the main floor.
  overMain(x, halfW = 0) {
    return x + halfW > this.left && x - halfW < this.right;
  }

  // How far a body whose feet are at (x, y) and `height` tall is from the
  // Void in force on each side, measured at its centre as the Void takes it.
  blast(x, y, height) {
    const v = this.stage.void;
    const cy = y - height / 2;
    return { left: x - v.left, right: v.right - x, up: cy - v.top, down: v.bottom - cy };
  }

  // Whether a body centre at (x, y - height/2) is in the Void in force.
  inVoid(x, y, height) {
    const v = this.stage.void;
    const cy = y - height / 2;
    return x < v.left || x > v.right || cy < v.top || cy > v.bottom;
  }

  // Off the stage: in the air with nothing at all under it.
  offstage(x, y, halfW, grounded) {
    return !grounded && !this.supported(x, halfW, y);
  }

  // The closest point on the main floor's top a recovery should aim for
  // from `x`, kept `margin` inside the ledge.
  landingTarget(x, halfW, margin = 12) {
    const lo = this.left + halfW + margin;
    const hi = this.right - halfW - margin;
    return { x: Math.min(hi, Math.max(lo, x)), y: this.top };
  }

  // A safe spot on the main floor at least `room` from both edges, as near
  // `x` as can be (the centre when the floor is narrower than that).
  safeSpot(x, room) {
    const lo = this.left + room;
    const hi = this.right - room;
    if (lo > hi) return this.centerX;
    return Math.min(hi, Math.max(lo, x));
  }

  // A surface to step up to on the way from `fromY` toward a target on the
  // surface at `toY` near `toX`: one within `maxRise` above `fromY` (the
  // jump a fighter has), not below the target, and nearest it. Null when
  // none is needed or there is none.
  stepToward(fromY, toY, toX, x, maxRise, current = null) {
    let best = null;
    let bestScore = Infinity;
    for (const s of this.surfaces) {
      if (s.ref === current) continue;
      const rise = fromY - s.y;
      if (rise < 16 || rise > maxRise || s.y < toY - 20) continue;
      const cx = Math.min(s.x1, Math.max(s.x0, toX));
      const score = Math.abs(s.y - toY) * 1.5 + Math.abs(cx - toX) * 0.6 + Math.abs((s.x0 + s.x1) / 2 - x) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  // Whether a solid's side blocks the way between x0 and x1 at a body's
  // height (feet at `y`).
  blocked(x0, x1, y, height) {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    return this.stage.solids.some((s) => s !== this.floor && y > s.y + 0.5 && y - height < s.y + s.h && hi > s.x && lo < s.x + s.w);
  }
}
