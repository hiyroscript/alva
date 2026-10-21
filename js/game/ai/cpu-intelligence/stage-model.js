// CPU Intelligence: the universal stage analyzer.
//
// Purpose: what the stage means for a fight, read from its real collision
// geometry (js/game/physics.js StageCollision), for any stage: the main
// floor and its two ledges, every surface a fighter can stand on (the
// floor, one-way platforms, the tops of solid blocks), how much room there
// is to an edge, how far a point is from the Void in force (overtime's
// closing Void included: it is read live, never cached), and which surfaces
// lead to which by a jump or a walk off an edge, and the danger zones a
// stage hazard shows. Yerma (desert), Sol-Noir (city), Asperitas, Adamaris
// (whose ground is continuous: no ledges) and any future stage work the
// same way.
//
// Moving and vanishing platforms (a stage's hazards, see
// js/game/platform-hazards.js) are read live, like the Void: a dynamic
// platform's surface is where it is now, and one switched off (hidden, or
// still forming) is no surface at all, so a CPU never aims at where a
// cloud was or at one that is not there. It knows only what anyone can
// see: never where a hazard will go next. The main floor and every static
// surface never change, so they are cached.
//
// A sectioned main floor (Jökull's glacier, see resolveGround in
// js/game/physics.js) is read live too: its permanent sections are fixed,
// but each breakable one is a surface only while it is there, with the
// damage it shows (its contacts, critically unstable or breaking: see
// js/game/stage-hazards.js IceSectionController), and the main floor's
// edges (left, right) are where its footing ends now: past a wing that has
// started breaking or is gone, the ledge is the centre's own edge. So a CPU
// never plans to stand on missing ice, nor counts on a wing it can see
// going; a wing it can see is critically unstable is a danger zone it may
// step off (dangerZones), as its level reads the stage.
//
// Inputs: a StageCollision. Outputs: StageModel (one per stage, cached).
// Important constraints: read-only; nothing here plans a platform drop (a
// player's fresh Down press on a platform, which the CPU never makes: see
// Executor.finish): the CPU's way down from a platform is to walk off its
// edge.

const CACHE = new WeakMap();

export class StageModel {
  constructor(stage) {
    this.stage = stage;
    const floor = stage.floor;
    this.floor = floor;
    // The main stage's edges as built: its ledges on a finite stage; on a
    // continuous ground (no ledge anywhere), the edges of the combat area,
    // past which only the side Void lies, so the room a CPU keeps from them
    // is the same safety margin either way. Where they are now is `left` /
    // `right` (a sectioned floor's move in as its wings break).
    const main = stage.main ?? { left: floor.x, right: floor.x + floor.w, top: floor.y };
    this.mainLeft = main.left;
    this.mainRight = main.right;
    this.top = floor.y;
    this.centerX = stage.centerX;
    // Whether walking past those edges drops a fighter off the stage.
    this.ledges = !stage.continuousGround;
    // Every section of the main floor (the floor alone, undivided), and the
    // breakable ones among them, read live.
    this.floors = stage.floors ?? [floor];
    this.sections = this.floors.filter((f) => f.breakable);
    // The surfaces that never change: the main floor's top (each permanent
    // section of a sectioned one, the floor first), each static one-way
    // platform, each other solid's top.
    this.fixed = [
      ...this.floors.filter((f) => !f.breakable).sort((a, b) => (a === floor ? -1 : b === floor ? 1 : 0))
        .map((f) => ({ ref: f, x0: f.x, x1: f.x + f.w, y: f.y, main: true, oneWay: false, dynamic: false })),
      ...stage.platforms.filter((p) => !p.dynamic).map((p) => ({ ref: p, x0: p.x, x1: p.x + p.w, y: p.y, main: false, oneWay: true, dynamic: false })),
      ...stage.solids.filter((s) => !this.floors.includes(s)).map((s) => ({ ref: s, x0: s.x, x1: s.x + s.w, y: s.y, main: false, oneWay: false, dynamic: false })),
    ];
    this.dynamic = stage.platforms.filter((p) => p.dynamic);
  }

  // Whether floor section `f` is footing to count on: there, and not
  // visibly breaking (or broken).
  static footing(f) {
    return f.active !== false && !f.broken;
  }

  // The main floor's left edge now: the main stage's, or on a sectioned
  // floor the left end of the footing joined to the permanent floor (see
  // footing).
  get left() {
    if (!this.sections.length) return this.mainLeft;
    const floors = this.floors;
    let k = floors.indexOf(this.floor);
    while (k > 0 && StageModel.footing(floors[k - 1])) k--;
    return floors[k].x;
  }

  // Its right edge now, likewise.
  get right() {
    if (!this.sections.length) return this.mainRight;
    const floors = this.floors;
    let k = floors.indexOf(this.floor);
    while (k < floors.length - 1 && StageModel.footing(floors[k + 1])) k++;
    return floors[k].x + floors[k].w;
  }

  get width() {
    return this.right - this.left;
  }

  // Every surface a fighter can stand on right now: the fixed ones, and
  // each dynamic platform that is solid at this moment, where it is now
  // (`moving` while it drifts; `hazard` from the map). Read fresh on every
  // call.
  get surfaces() {
    if (!this.dynamic.length && !this.sections.length) return this.fixed;
    const out = this.fixed.slice();
    // Each breakable section of the main floor while it is there (its
    // collision on), with what it shows: how damaged it is (`damage`, a
    // level of ICE_DAMAGE_LEVELS, and `integrity`, 1 untouched to 0),
    // whether it is critically `unstable`, and whether its break has begun
    // (`broken`).
    for (const f of this.sections) {
      if (f.active === false) continue;
      out.push({
        ref: f, x0: f.x, x1: f.x + f.w, y: f.y, main: true, oneWay: false, dynamic: false, section: true,
        damage: f.damage ?? 0, integrity: f.maxContacts ? 1 - (f.contacts ?? 0) / f.maxContacts : 1,
        unstable: !!f.unstable, broken: !!f.broken,
      });
    }
    for (const p of this.dynamic) {
      if (p.active === false) continue;
      out.push({
        ref: p, x0: p.x, x1: p.x + p.w, y: p.y, main: false, oneWay: true, dynamic: true,
        hazard: !!p.hazard, moving: (p.vx ?? 0) !== 0 || (p.vy ?? 0) !== 0,
        // Visibly fading out (or not yet fully formed): footing about to
        // go, or only just back.
        fading: (p.opacity ?? 1) < 1,
      });
    }
    return out;
  }

  // The danger zones a stage hazard shows right now (a falling rock's red
  // warning: { id, x, radius, height, timeLeft }, see
  // js/game/stage-hazards.js), read live. Only visible warnings are ever
  // here: a CPU never knows where a rock will land before it is shown.
  get dangerZones() {
    return this.stage.dangerZones ?? [];
  }

  // The visible danger zone covering a body of half-width `halfW` at `x`
  // (feet on the ground), with `margin` to spare, or null.
  dangerAt(x, halfW, margin = 0) {
    for (const z of this.dangerZones) if (Math.abs(x - z.x) < z.radius + halfW + margin) return z;
    return null;
  }

  // Whether `ref` (a body's `ground`, a planned step) is a surface to stand
  // on now: anything static, or a dynamic platform while it is solid.
  usable(ref) {
    return !!ref && ref.active !== false;
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

  // The surface entry standing on `ref` (a body's `ground`), or null
  // (null too for a platform that has just vanished).
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
  // none is needed or there is none. Never a platform visibly fading out
  // from under whoever would land on it.
  stepToward(fromY, toY, toX, x, maxRise, current = null) {
    let best = null;
    let bestScore = Infinity;
    for (const s of this.surfaces) {
      if (s.ref === current || s.fading) continue;
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
  // height (feet at `y`): never the main floor's own sides, nor a solid
  // that is gone.
  blocked(x0, x1, y, height) {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    return this.stage.solids.some((s) => s.active !== false && !this.floors.includes(s) && y > s.y + 0.5 && y - height < s.y + s.h && hi > s.x && lo < s.x + s.w);
  }

  // Whether `ref` (a body's `ground`) is part of the main floor, any
  // section of it.
  isMain(ref) {
    return !!ref && this.floors.includes(ref);
  }
}
