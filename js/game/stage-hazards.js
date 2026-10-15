// Stage hazards: the runtime of the hazards a map lists under `hazards`
// (js/data/maps.js) that are not platforms: today Adamaris's volcano, whose
// eruptions throw volcanic rocks onto the beach.
//
// Purpose: one controller per hazard, each its own state machine on its own
// random stream, and the rocks they throw: where each will land, when, how
// big, and the red warning circle each shows before it lands. StageHazards
// runs a stage's controllers once per fixed step, hands the rocks that land
// to the CombatSystem as hits with no owner (CombatSystem.hazardHit), and
// keeps the stage's visible danger zones (StageCollision.dangerZones) for
// the CPUs.
// Inputs: the map (its `hazards`), its StageCollision, the behaviour each
// names (js/data/stage-hazards.js), a seed; each step, the fighters in play
// and whether the fight is live.
// Outputs: StageHazards, VolcanoController, rockProgress, rockWarning.
// Important constraints: deterministic and fixed-step (every random draw
// comes from the hazard's own seeded stream, only as a period starts, a
// volley is thrown or a rock's landing is chosen: never while drawing, so
// how often the screen draws changes nothing); never writes the map (every
// battle and preview builds its own). A rock is a stage hazard, never a
// projectile: it is not in the Arena's projectiles, so nothing can turn it
// back, erase it, own it or clash with it, and its hit credits nobody. It
// strikes only where it lands, the step it lands, each fighter once at
// most; its warning is shown at that very place from `warning` seconds
// before, and nothing is ever struck by a warning alone.

import { STAGE_HAZARD_BEHAVIORS, VOLCANO_STATES, ERUPTION_PHASES, VOLCANIC_ROCKS } from '../data/stage-hazards.js';
import { mulberry32, deriveSeed, range, clamp } from '../core/utils.js';

const S = VOLCANO_STATES;
const P = ERUPTION_PHASES;
// Floating-point slack for comparisons against a rock's flight time.
const EPS = 1e-6;

// A stream index for hazard `id` (FNV-1a over a prefix of its own, so it
// never shares a stream with a dynamic platform of the same id), for
// deriveSeed: never 0 or 1 (the CPUs').
function streamOf(id) {
  let h = 0x811c9dc5;
  const key = `stage-hazard:${id}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 2 + ((h >>> 0) % 0x7ffffff0);
}

// How far rock `r` has flown, 0 at the crater to 1 on the sand, at its
// interpolated age (`render`) or its age this step.
export function rockProgress(r, render = true) {
  return clamp((render ? r.renderAge : r.age) / r.flight, 0, 1);
}

// Rock `r`'s warning: null while it is not shown yet, else how far it has
// come (0 as it appears, 1 as the rock lands), at the interpolated age.
export function rockWarning(r, render = true) {
  const age = render ? r.renderAge : r.age;
  const from = r.flight - r.warning;
  if (age < from - EPS) return null;
  return clamp((age - from) / r.warning, 0, 1);
}

function behaviorOf(spec) {
  const behavior = STAGE_HAZARD_BEHAVIORS[spec.behavior];
  if (!behavior) throw new Error(`[Alva] Stage hazard "${spec.id}": unknown behaviour "${spec.behavior}"`);
  return behavior;
}

// The volcano: two states, dormant and erupting, each lasting a random
// while; when one ends the next is drawn at random (eruptChance), never
// simply the other. An eruption runs its visible phases (buildup, burst,
// active, cooldown) and throws volleys of rocks from its burst until its
// cooldown; a dormant spell throws none. Rocks already flying finish their
// flight whatever the volcano does next.
export class VolcanoController {
  constructor(spec, system, seed, { opening = 'dormant' } = {}) {
    this.spec = spec;
    // How every run opens: dormant (a match: nobody is struck before the
    // fight has got going) or erupting (a preview: show what it does).
    this.opening = opening === 'erupting' ? S.erupting : S.dormant;
    this.system = system;
    this.id = spec.id;
    this.behavior = behaviorOf(spec);
    const t = spec.targets;
    if (!(Number.isFinite(t?.left) && Number.isFinite(t?.right) && t.right > t.left)) {
      throw new Error(`[Alva] Stage hazard "${spec.id}": its targets need a left and a right`);
    }
    this.targets = t;
    this.seed = seed >>> 0;
    this.rng = mulberry32(deriveSeed(this.seed, streamOf(this.id)));
    this.reset();
  }

  // At the start of its opening period (dormant, unless it opens erupting),
  // nothing flying. The stream carries on: a rematch is a fresh run, not a
  // replay of the last.
  reset() {
    const b = this.behavior;
    this.state = this.opening;
    this.time = 0;
    this.duration = range(this.rng, ...(this.state === S.erupting ? b.eruptingSeconds : b.openingDormantSeconds));
    // Seconds to the next volley (while rocks may fly).
    this.nextVolley = 0;
    // How brightly the crater glows (0-1), eased toward its phase's level
    // every step: art only, but simulated, so it never jumps.
    this.glow = 0.08;
    // Periods entered so far, oldest first (tests, debugging), and how many
    // rocks it has thrown.
    this.history = [this.state];
    this.thrown = 0;
  }

  // The visible phase this step: null while dormant.
  get phase() {
    if (this.state !== S.erupting) return null;
    const b = this.behavior;
    if (this.time < b.buildupSeconds) return P.buildup;
    if (this.time < b.buildupSeconds + b.burstSeconds) return P.burst;
    if (this.time >= this.duration - b.cooldownSeconds) return P.cooldown;
    return P.active;
  }

  // Whether rocks may be thrown now: from the burst until the cooldown.
  get throwing() {
    const phase = this.phase;
    return phase === P.burst || phase === P.active;
  }

  // How far through its period it is (0-1).
  get progress() {
    return this.duration > 0 ? clamp(this.time / this.duration, 0, 1) : 1;
  }

  // The glow its phase is heading for.
  get glowTarget() {
    if (this.state !== S.erupting) return 0.08;
    const b = this.behavior;
    switch (this.phase) {
      case P.buildup: return 0.15 + 0.55 * (this.time / b.buildupSeconds);
      case P.burst: return 1;
      case P.active: return 0.85;
      default: return 0.15 + 0.6 * clamp((this.duration - this.time) / b.cooldownSeconds, 0, 1);
    }
  }

  // One fixed step. `live` false (before the fight starts, once it is
  // over): the volcano holds where it is and throws nothing.
  step(dt, live) {
    if (live) {
      this.time += dt;
      if (this.time >= this.duration - EPS) this.next();
      if (this.throwing) {
        this.nextVolley -= dt;
        if (this.nextVolley <= EPS) this.volley();
      }
    }
    this.glow += (this.glowTarget - this.glow) * Math.min(1, dt * 4);
  }

  // The next period, drawn at random: an eruption with eruptChance, else a
  // dormant spell, whatever this one was.
  next() {
    const b = this.behavior;
    this.state = this.rng() < b.eruptChance ? S.erupting : S.dormant;
    this.time = 0;
    this.duration = range(this.rng, ...(this.state === S.erupting ? b.eruptingSeconds : b.dormantSeconds));
    this.nextVolley = 0;
    this.history.push(this.state);
    if (this.history.length > 64) this.history.shift();
  }

  // One volley: a few rocks out of the crater at once, each its own size,
  // flight and landing.
  volley() {
    const b = this.behavior;
    this.nextVolley = range(this.rng, ...b.volleyInterval);
    const n = Math.round(range(this.rng, b.volleyRocks[0] - 0.49, b.volleyRocks[1] + 0.49));
    for (let i = 0; i < n; i++) this.throwRock();
  }

  // A rock out of the crater: its size, its flight time, the bow of its
  // path, and where it lands (see placeRock).
  throwRock() {
    const b = this.behavior;
    const spec = this.rng() < b.largeChance ? VOLCANIC_ROCKS.large : VOLCANIC_ROCKS.small;
    const flight = range(this.rng, ...spec.flight);
    const x = this.placeRock(spec, flight);
    this.thrown++;
    this.system.addRock({
      id: `${this.id}#${this.thrown}`, source: this, size: spec.id, spec, hit: spec.hit,
      x, radius: spec.radius, height: spec.height, warning: spec.warning, flight,
      arc: range(this.rng, ...b.arc), spin: range(this.rng, -6, 6), shape: this.rng(),
      age: 0, prevAge: 0, renderAge: 0,
    });
  }

  // Where a rock of `spec` flying `flight` seconds lands: anywhere across
  // the targets, at random, kept `spacing` clear of every impact landing
  // within spacingWindow of it (sensible spacing, never a fixed list); the
  // try that leaves the most room if none does.
  placeRock(spec, flight) {
    const b = this.behavior;
    const t = this.targets;
    let best = null;
    let bestRoom = -Infinity;
    for (let i = 0; i < b.placementAttempts; i++) {
      const x = range(this.rng, t.left, t.right);
      let room = Infinity;
      for (const r of this.system.rocks) {
        if (Math.abs((r.flight - r.age) - flight) > b.spacingWindow) continue;
        room = Math.min(room, Math.abs(r.x - x) - r.radius - spec.radius);
      }
      if (room >= b.spacing) return x;
      if (room > bestRoom) {
        bestRoom = room;
        best = x;
      }
    }
    return best;
  }
}

const CONTROLLERS = Object.freeze({ volcano: VolcanoController });

// A stage's hazards: one controller per hazard of `map`, each seeded from
// `seed` on its own stream, and every rock in flight. A stage with none has
// nothing to run.
export class StageHazards {
  constructor(stage, map, { seed = 0, opening = 'dormant' } = {}) {
    this.stage = stage;
    this.seed = seed >>> 0;
    // The ground the rocks land on.
    this.groundY = stage.groundY;
    // Rocks in flight, in the order thrown.
    this.rocks = [];
    // Rocks that landed this step (CombatSystem resolves their hits:
    // resolve), and the impacts still playing (art: { x, y, size, radius,
    // age, life, seed }).
    this.landed = [];
    this.impacts = [];
    this.controllers = (map.hazards ?? []).map((spec) => {
      const Controller = CONTROLLERS[spec.behavior];
      if (!Controller) throw new Error(`[Alva] Stage hazard "${spec.id}": unknown behaviour "${spec.behavior}"`);
      return new Controller(spec, this, this.seed, { opening });
    });
  }

  // The volcano, if the stage has one (the theme draws it from this).
  get volcano() {
    return this.controllers.find((c) => c instanceof VolcanoController) ?? null;
  }

  // The controller of hazard `id`, or null.
  get(id) {
    return this.controllers.find((c) => c.id === id) ?? null;
  }

  addRock(rock) {
    this.rocks.push(rock);
  }

  // Every hazard back at its start, nothing flying, landing or shown.
  reset() {
    for (const c of this.controllers) c.reset();
    this.rocks.length = 0;
    this.landed.length = 0;
    this.impacts.length = 0;
    this.stage.dangerZones.length = 0;
  }

  // One fixed step: every hazard's own step, every rock flown on, those
  // that reach the sand landed (into `landed`, for resolve, and an impact
  // for the art), the impacts aged, and the stage's danger zones rebuilt
  // from the warnings now showing. `live` false: no new rocks, and the ones
  // that land strike nobody.
  update(dt, { live = true } = {}) {
    this.landed.length = 0;
    if (!this.controllers.length) return this.landed;
    for (const c of this.controllers) c.step(dt, live);
    let n = 0;
    for (const r of this.rocks) {
      r.prevAge = r.age;
      r.age += dt;
      if (r.age >= r.flight - EPS) {
        r.age = r.flight;
        r.harmless = !live;
        this.landed.push(r);
        this.impacts.push({
          x: r.x, y: this.groundY, size: r.size, radius: r.radius, age: 0, life: r.source.behavior.impactSeconds,
          seed: r.x * 0.37 + r.flight * 13,
        });
      } else {
        this.rocks[n++] = r;
      }
    }
    this.rocks.length = n;
    n = 0;
    for (const e of this.impacts) {
      e.age += dt;
      if (e.age < e.life) this.impacts[n++] = e;
    }
    this.impacts.length = n;
    const zones = this.stage.dangerZones;
    zones.length = 0;
    for (const r of this.rocks) {
      if (rockWarning(r, false) === null) continue;
      zones.push({ id: r.id, x: r.x, radius: r.radius, height: r.height, timeLeft: r.flight - r.age, size: r.size });
    }
    return this.landed;
  }

  // The hits of the rocks that landed this step, through `combat` (its
  // hazardHit): each strikes every fighter in play its impact meets, once.
  resolve(fighters, combat) {
    const G = this.groundY;
    for (const r of this.landed) {
      if (r.harmless) continue;
      const box = { x: r.x - r.radius, y: G - r.height, w: r.radius * 2, h: r.height };
      for (const f of fighters) combat.hazardHit(f, r.hit, box, r);
    }
  }

  // Where every rock is drawn, `alpha` (0-1) of the way from its age a step
  // ago to its age now.
  interpolate(alpha) {
    for (const r of this.rocks) r.renderAge = r.prevAge + (r.age - r.prevAge) * alpha;
  }
}
