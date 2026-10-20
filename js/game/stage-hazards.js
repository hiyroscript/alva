// Stage hazards: the runtime of the hazards a map lists under `hazards`
// (js/data/maps.js) that are not platforms: Adamaris's volcano, whose
// eruptions throw volcanic rocks onto the beach, and Jökull's two breakable
// ice sections and its blizzard.
//
// Purpose: one controller per hazard, each its own state machine on its own
// random stream, and the rocks they throw: where each will land, when, how
// big, and the red warning circle each shows before it lands. StageHazards
// runs a stage's controllers once per fixed step, hands the rocks that land
// to the CombatSystem as hits with no owner (CombatSystem.hazardHit), and
// keeps the stage's visible danger zones (StageCollision.dangerZones) for
// the CPUs. An ice section (IceSectionController) counts the new footings
// fighters take on its floor section, cracks, and once broken switches the
// section's collision off for good and lets its pieces fall; the blizzard
// (BlizzardController) is weather: calm, warning, blizzard, clearing,
// touching nothing in play.
// Inputs: the map (its `hazards`), its StageCollision, the behaviour each
// names (js/data/stage-hazards.js), a seed; each step, the fighters in play
// and whether the fight is live.
// Outputs: StageHazards, VolcanoController, IceSectionController,
// BlizzardController, rockProgress, rockWarning, iceDamageLevel,
// iceUnderside, iceTearX.
// Important constraints: deterministic and fixed-step (every random draw
// comes from the hazard's own seeded stream, only as a period starts, a
// volley is thrown, a rock's landing is chosen, a contact cracks the ice, a
// section breaks or a weather check is made: never while drawing, so how
// often the screen draws changes nothing); never writes the map (every
// battle and preview builds its own). A rock is a stage hazard, never a
// projectile: it is not in the Arena's projectiles, so nothing can turn it
// back, erase it, own it or clash with it, and its hit credits nobody. It
// strikes only where it lands, the step it lands, each fighter once at
// most; its warning is shown at that very place from `warning` seconds
// before, and nothing is ever struck by a warning alone. A broken ice
// section's pieces are art, never projectiles or collision: only the
// section's own `active` (off from the first step of its separation, never
// on again in that match) changes play.

import {
  STAGE_HAZARD_BEHAVIORS, VOLCANO_STATES, ERUPTION_PHASES, VOLCANIC_ROCKS, ICE_SECTION_STATES, ICE_DAMAGE_LEVELS, WEATHER_STATES,
} from '../data/stage-hazards.js';
import { releaseGround } from './physics.js';
import { mulberry32, deriveSeed, range, clamp } from '../core/utils.js';

const S = VOLCANO_STATES;
const P = ERUPTION_PHASES;
const I = ICE_SECTION_STATES;
const W = WEATHER_STATES;
// How close a body's feet must be to a floor section's top to stand on it
// (physics' own slack).
const FOOT_EPS = 0.5;
// How many world units a crack runs from the front rim of an ice section's
// top to its back rim (its points keep depth as 0-1: art).
const TOP_DEPTH = 150;
// The damage level from which an ice section is critically unstable (see
// ICE_DAMAGE_LEVELS).
const UNSTABLE = ICE_DAMAGE_LEVELS.indexOf('unstable');
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

// ---- Jökull's ice -------------------------------------------------------------------

// The damage level (an index of ICE_DAMAGE_LEVELS) of a section that has
// taken `contacts` of its `max`: 0 untouched, then one level per fifth of
// its durability (1–3, 4–6, 7–9, 10–12, 13–14 of 15), the last at `max`.
export function iceDamageLevel(contacts, max) {
  if (!(contacts > 0)) return 0;
  if (contacts >= max) return ICE_DAMAGE_LEVELS.length - 1;
  return Math.min(UNSTABLE, Math.ceil((contacts / max) * UNSTABLE - 1e-9));
}

// The glacier's underside at world x, under a floor block whose collision
// ends at `bottom`: a jagged line of ice teeth a little either side of it.
// A fixed shape (no randomness), shared by the theme that draws the block
// and the pieces it breaks into, so they always match.
export function iceUnderside(x, bottom) {
  const teeth = Math.abs(Math.sin(x * 0.083)) ** 3 * 22 + Math.abs(Math.sin(x * 0.031 + 1.7)) ** 2 * 16;
  return bottom - 34 + 12 * Math.sin(x * 0.011 + 0.6) + teeth;
}

// Where torn line `tear` (an ice section's flat [x, y, ...] points, top to
// bottom) runs at height y.
export function iceTearX(tear, y) {
  if (y <= tear[1]) return tear[0];
  for (let i = 2; i < tear.length; i += 2) {
    if (y <= tear[i + 1]) {
      const k = (y - tear[i - 1]) / Math.max(1e-6, tear[i + 1] - tear[i - 1]);
      return tear[i - 2] + (tear[i] - tear[i - 2]) * k;
    }
  }
  return tear[tear.length - 2];
}

// A breakable ice section (Jökull's two wings): the controller of one
// breakable floor section of the stage (`spec.section`, see resolveGround
// in js/game/physics.js), which it alone switches off.
//
// It counts one contact for every new footing a fighter takes on the
// section: the step its ground becomes this section (a landing of any kind,
// a fall onto it, or its centre crossing the seam from the centre section:
// physics hands a body's ground over exactly there), and never again while
// that footing lasts: standing, walking, shielding or fighting on it,
// jittering on the seam, or crossing onto the centre and back while still
// overlapping it. The footing ends when the fighter leaves the ground or no
// longer overlaps the section at all. A wall or the section's underside is
// never footing, and a rebound off its top is no landing (physics leaves
// the body airborne). A body first seen already standing (placed by a
// spawn) is taken as it is, not as a landing. Both fighters count alike,
// on the same step too, but never past maxContacts, and only while the
// fight is live.
//
// Each contact cracks it (a new fracture at the impact or an extension of
// the old ones: the network is generated once, from the section's own
// stream, and kept), and the one that reaches maxContacts starts its break:
// critical (still solid), separating (collision off from its first step;
// whoever stood on it falls, unless the centre their collider still overlaps
// holds them up), collapsing (its pieces falling into the abyss), then
// destroyed for good. Its pieces are simulated here on the fixed step for
// the theme to draw, then dropped once they are far below the Void.
export class IceSectionController {
  constructor(spec, system, seed, { demo = false } = {}) {
    this.spec = spec;
    this.system = system;
    this.id = spec.id;
    this.behavior = behaviorOf(spec);
    const section = system.stage.floorSection?.(spec.section) ?? null;
    if (!section?.breakable) throw new Error(`[Alva] Stage hazard "${spec.id}": "${spec.section}" is not a breakable floor section`);
    const b = this.behavior;
    if (!(Number.isInteger(b.maxContacts) && b.maxContacts >= 1)) throw new Error(`[Alva] Stage hazard "${spec.id}": maxContacts must be a whole number of contacts`);
    this.section = section;
    this.max = b.maxContacts;
    // Which way is away from the centre (-1 west, 1 east), and its inner
    // seam, where it meets the next section toward the centre.
    this.outward = section.x + section.w / 2 < system.stage.centerX ? -1 : 1;
    this.seam = this.outward < 0 ? section.x + section.w : section.x;
    // A preview's demonstration (see ICE_SECTION.demo): contacts on a
    // timer of its own, since no fighter lands there.
    this.demo = !!demo;
    this.seed = seed >>> 0;
    this.rng = mulberry32(deriveSeed(this.seed, streamOf(this.id)));
    // The jagged line it tears away along, at its inner seam, top to
    // bottom: exactly at the seam at the top (the walkable edge left on the
    // centre is where its collision ends), cutting up to tearDepth into the
    // centre's face below. Its own fixed shape, the same every match.
    this.tear = this.buildTear();
    this.reset();
  }

  // Intact, untouched, solid, nothing falling. The stream carries on: a
  // rematch cracks differently.
  reset() {
    this.section.active = true;
    this.contacts = 0;
    this.state = I.intact;
    this.time = 0;
    // Each body's footing on the section (WeakMap: a respawned fighter's
    // new body starts afresh).
    this.footing = new WeakMap();
    // The fracture network ({ face: 'top' | 'front', pts, born }: top
    // points are [x, d], d 0 at the front rim to 1 at the back; front
    // points [x, y] on the face), each contact's reaction ({ x, age, life,
    // seed, strength }: art) and the falling pieces.
    this.cracks = [];
    this.impacts = [];
    this.debris = [];
    this.history = [I.intact];
    this.demoClock = this.demo ? range(this.rng, ...this.behavior.demo.contactSeconds) : 0;
    this.sync();
  }

  get level() {
    return iceDamageLevel(this.contacts, this.max);
  }

  // How much of its durability is left (1 untouched, 0 broken).
  get integrity() {
    return 1 - this.contacts / this.max;
  }

  // Critically unstable: its last fifth, still standing.
  get unstable() {
    return (this.state === I.intact || this.state === I.critical) && this.level >= UNSTABLE;
  }

  // Coming apart or falling: no collision.
  get breaking() {
    return this.state === I.separating || this.state === I.collapsing;
  }

  // How far through its current phase (0-1): art.
  get progress() {
    const b = this.behavior;
    const d = this.state === I.critical ? b.criticalSeconds : this.state === I.separating ? b.separationSeconds
      : this.state === I.collapsing ? b.collapseSeconds : 0;
    return d > 0 ? clamp(this.time / d, 0, 1) : 1;
  }

  // Mirrors the state onto its floor section, for whoever reads the stage
  // (the CPU's stage model): only what anyone can see.
  sync() {
    const s = this.section;
    s.state = this.state;
    s.contacts = this.contacts;
    s.maxContacts = this.max;
    s.damage = this.level;
    s.unstable = this.unstable;
    s.broken = this.state !== I.intact;
  }

  // One fixed step. `bodies` are the fighters' bodies in play, after their
  // own step; `live` false (before the fight, once it is over): footing is
  // still followed, but nothing counts.
  step(dt, live, bodies = []) {
    const b = this.behavior;
    this.time += dt;
    if (this.state === I.intact) {
      for (const body of bodies) this.observe(body, live);
      if (this.demo) {
        this.demoClock -= dt;
        if (this.demoClock <= EPS) {
          this.demoClock = range(this.rng, ...b.demo.contactSeconds);
          const s = this.section;
          this.contact(range(this.rng, s.x + 20, s.x + s.w - 20));
        }
      }
    }
    switch (this.state) {
      case I.critical:
        if (this.time >= b.criticalSeconds - EPS) this.enter(I.separating);
        break;
      case I.separating:
        if (this.time >= b.separationSeconds - EPS) this.enter(I.collapsing);
        break;
      case I.collapsing:
        if (this.time >= b.collapseSeconds - EPS) this.enter(I.destroyed);
        break;
      case I.destroyed:
        // Only a preview's demonstration ever builds it again.
        if (this.demo && this.time >= b.demo.restSeconds - EPS && !this.debris.length) this.reset();
        break;
      default:
        break;
    }
    let n = 0;
    for (const e of this.impacts) {
      e.age += dt;
      if (e.age < e.life) this.impacts[n++] = e;
    }
    this.impacts.length = n;
    this.stepDebris(dt);
  }

  // One body's footing on the section this step (see the class comment).
  observe(body, live) {
    const s = this.section;
    const standing = body.grounded && Math.abs(body.y - s.y) <= FOOT_EPS;
    const on = standing && body.ground === s;
    const seen = this.footing.get(body);
    if (seen === undefined) {
      this.footing.set(body, on);
      return;
    }
    if (on && !seen) {
      this.footing.set(body, true);
      if (live) this.contact(body.x);
    } else if (seen && !(standing && body.x + body.halfW > s.x && body.x - body.halfW < s.x + s.w)) {
      this.footing.set(body, false);
    }
  }

  // One qualifying contact at world x: it cracks, reacts, and the one that
  // reaches maxContacts starts the break. False when it no longer counts
  // (already breaking or broken).
  contact(x) {
    if (this.state !== I.intact || this.contacts >= this.max) return false;
    const s = this.section;
    this.contacts++;
    const at = clamp(x, s.x + 6, s.x + s.w - 6);
    const seed = Math.floor(this.rng() * 0x100000000) >>> 0;
    this.crack(at, seed);
    this.impacts.push({ x: at, age: 0, life: this.behavior.impactSeconds, seed, strength: this.contacts / this.max });
    if (this.impacts.length > 8) this.impacts.shift();
    this.system.event({ type: 'contact', hazard: this.id, section: s.id, x: at, contacts: this.contacts });
    if (this.contacts >= this.max) this.enter(I.critical);
    this.sync();
    return true;
  }

  enter(state) {
    this.state = state;
    this.time = 0;
    this.history.push(state);
    if (this.history.length > 32) this.history.shift();
    if (state === I.separating) {
      // Collision gone from this very step: StageHazards lets go of anyone
      // standing on it before the fighters take their next step.
      this.section.active = false;
      this.breakApart();
    }
    this.system.event({ type: state, hazard: this.id, section: this.section.id });
    this.sync();
  }

  // The danger zone the section shows while critically unstable or
  // breaking with its collision still on (a CPU can see it tremble): its
  // whole span. Null otherwise.
  get zone() {
    if (!this.unstable) return null;
    const s = this.section;
    const critical = this.state === I.critical;
    const z = (this.zoneOut ??= { kind: 'ice', size: 'ice' });
    z.id = `${this.id}:${critical ? 'critical' : 'unstable'}`;
    z.x = s.x + s.w / 2;
    z.radius = s.w / 2;
    z.height = s.h;
    z.timeLeft = critical ? Math.max(0, this.behavior.criticalSeconds - this.time) : Infinity;
    return z;
  }

  // ---- The fracture network ----------------------------------------------------

  // A contact's cracks at `x`, from its own `seed`: new arms from the
  // impact across the top, the last cracks carried further, and from the
  // second level on cracks down the front face from the rim; from the
  // fourth, cracks reaching toward the inner seam and joining up.
  crack(x, seed) {
    const r = mulberry32(seed);
    const s = this.section;
    const level = this.level;
    const n = this.contacts;
    const d0 = range(r, 0.15, 0.75);
    const arms = 2 + (level >= 3 ? 1 : 0);
    const spin = range(r, 0, Math.PI * 2);
    for (let i = 0; i < arms; i++) {
      const heading = spin + (i * Math.PI * 2) / arms + range(r, -0.5, 0.5);
      this.cracks.push({ face: 'top', born: n, pts: this.walkTop(r, x, d0, heading, 18 + 10 * level + r() * 20) });
    }
    // Carry an older crack further (the newest of each face first).
    for (const face of ['top', 'front']) {
      const old = this.cracks.filter((c) => c.face === face && c.born < n);
      if (!old.length || r() > 0.85) continue;
      const c = old[old.length - 1 - Math.floor(r() * Math.min(3, old.length))];
      const ex = c.pts[c.pts.length - 2];
      const ey = c.pts[c.pts.length - 1];
      const more = face === 'top' ? this.walkTop(r, ex, ey, range(r, 0, Math.PI * 2), 14 + 6 * level) : this.walkFront(r, ex, ey, 18 + 12 * level);
      c.pts.push(...more.slice(2));
    }
    if (level >= 2) this.cracks.push({ face: 'front', born: n, pts: this.walkFront(r, clamp(x + range(r, -20, 20), s.x + 4, s.x + s.w - 4), s.y + 2, 30 + 28 * level) });
    if (level >= 4) {
      // Toward the seam: the fractures join up and reach the centre's edge.
      const toward = this.outward < 0 ? 0 : Math.PI;
      this.cracks.push({ face: 'top', born: n, pts: this.walkTop(r, x, range(r, 0.15, 0.85), toward + range(r, -0.25, 0.25), Math.abs(this.seam - x) + 10) });
    }
  }

  // A crack's points across the top from (x, d), heading `heading`
  // (radians: 0 along +x, π/2 toward the back rim; a unit of d counts as
  // TOP_DEPTH world units), about `len` world units long, kept on the
  // section's top: a fairly straight line with a little wander.
  walkTop(r, x, d, heading, len) {
    const s = this.section;
    const pts = [x, d];
    for (let gone = 0; gone < len;) {
      const step = range(r, 8, 16);
      gone += step;
      heading += range(r, -0.35, 0.35);
      x = clamp(x + Math.cos(heading) * step, s.x + 2, s.x + s.w - 2);
      d = clamp(d + (Math.sin(heading) * step) / TOP_DEPTH, 0.02, 0.98);
      pts.push(x, d);
    }
    return pts;
  }

  // A crack's points down the front face from (x, y), about `len` long,
  // kept on the face above its underside.
  walkFront(r, x, y, len) {
    const s = this.section;
    const pts = [x, y];
    for (let gone = 0; gone < len;) {
      const step = range(r, 9, 20);
      gone += step;
      x = clamp(x + range(r, -7, 7), s.x + 2, s.x + s.w - 2);
      y = Math.min(y + step, iceUnderside(x, s.y + s.h) - 6);
      pts.push(x, y);
    }
    return pts;
  }

  // The tear line (see the constructor): exactly at the seam on top, then
  // jagged down the face into the centre's side, to the underside.
  buildTear() {
    const s = this.section;
    const r = mulberry32(streamOf(`${this.id}:tear`));
    const depth = this.behavior.tearDepth;
    const inward = -this.outward;
    const bottom = iceUnderside(this.seam, s.y + s.h);
    const pts = [this.seam, s.y, this.seam + inward * range(r, 0, 3), s.y + 6];
    for (let y = s.y + 6; y < bottom;) {
      y = Math.min(bottom, y + range(r, 16, 34));
      pts.push(this.seam + inward * range(r, 0.15, 1) * depth, y);
    }
    return pts;
  }

  // ---- Breaking apart -----------------------------------------------------------

  // The section's whole block as pieces: `columns` across by three rows
  // (its top slab, then its foundation in two), tiling the block exactly
  // along shared jagged edges (its outer ledge straight, its inner side the
  // tear line, its bottom the underside), then shards thrown out of the
  // tear. Each piece keeps its outline about its own centre and falls from
  // where it was, pushed out away from the centre and turning.
  breakApart() {
    const b = this.behavior;
    const s = this.section;
    const r = this.rng;
    const top = s.y;
    const bottom = s.y + s.h;
    const cols = b.columns;
    const rows = [top, top + b.slabDepth, top + b.slabDepth + (bottom - top - b.slabDepth) * 0.45, null];
    const innerCol = this.outward < 0 ? cols : 0;
    // Each cut's x at each level (the inner one follows the tear line).
    const cutX = [];
    for (let i = 0; i <= cols; i++) {
      cutX.push(rows.map((y) => {
        if (i === innerCol) return iceTearX(this.tear, y ?? bottom);
        if (i === 0) return s.x;
        if (i === cols) return s.x + s.w;
        return s.x + (s.w * i) / cols + range(r, -0.2, 0.2) * (s.w / cols);
      }));
    }
    const levelY = (j, x) => rows[j] ?? iceUnderside(x, bottom);
    // Vertical edges (cut i, row j to j + 1) and horizontal ones (level j,
    // cut i to i + 1), each a flat point list in its own direction.
    const vertical = (i, j) => {
      const x0 = cutX[i][j];
      const x1 = cutX[i][j + 1];
      const y0 = levelY(j, x0);
      const y1 = levelY(j + 1, x1);
      if (i === innerCol) {
        const pts = [x0, y0];
        for (let k = 2; k < this.tear.length; k += 2) if (this.tear[k + 1] > y0 && this.tear[k + 1] < y1) pts.push(this.tear[k], this.tear[k + 1]);
        pts.push(x1, y1);
        return pts;
      }
      if (i === 0 || i === cols) return [x0, y0, x1, y1];
      const pts = [x0, y0];
      for (let k = 1; k < 3; k++) pts.push(x0 + (x1 - x0) * (k / 3) + range(r, -9, 9), y0 + (y1 - y0) * (k / 3));
      pts.push(x1, y1);
      return pts;
    };
    const horizontal = (j, i) => {
      const x0 = cutX[i][j];
      const x1 = cutX[i + 1][j];
      if (j === 0) return [x0, top, x1, top];
      if (rows[j] === null) {
        const pts = [];
        const n = Math.max(2, Math.round((x1 - x0) / 10));
        for (let k = 0; k <= n; k++) {
          const x = x0 + ((x1 - x0) * k) / n;
          pts.push(x, iceUnderside(x, bottom));
        }
        return pts;
      }
      const pts = [x0, rows[j]];
      for (let k = 1; k < 3; k++) pts.push(x0 + (x1 - x0) * (k / 3), rows[j] + range(r, -10, 10));
      pts.push(x1, rows[j]);
      return pts;
    };
    const V = [];
    const H = [];
    for (let i = 0; i <= cols; i++) V.push([0, 1, 2].map((j) => vertical(i, j)));
    for (let j = 0; j < rows.length; j++) {
      const row = [];
      for (let i = 0; i < cols; i++) row.push(horizontal(j, i));
      H.push(row);
    }
    const reversed = (pts) => {
      const out = [];
      for (let k = pts.length - 2; k >= 0; k -= 2) out.push(pts[k], pts[k + 1]);
      return out;
    };
    this.debris.length = 0;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < cols; i++) {
        // Clockwise on screen: top (left to right), right side (down),
        // bottom (right to left), left side (up), no point twice.
        const outline = [
          ...H[j][i],
          ...V[i + 1][j].slice(2),
          ...reversed(H[j + 1][i]).slice(2),
          ...reversed(V[i][j]).slice(2, -2),
        ];
        // How far out from the seam it sits (0 at the seam, 1 at the ledge).
        const out = this.outward < 0 ? (cols - 1 - i + 0.5) / cols : (i + 0.5) / cols;
        this.addPiece('chunk', outline, {
          row: j,
          vx: this.outward * range(r, ...b.pushOut) * (0.4 + 0.8 * out),
          vy: j === 0 ? -range(r, 10, 70) : range(r, 0, 30),
          spin: this.outward * range(r, ...b.spin) * (r() < 0.2 ? -0.5 : 1),
        });
      }
    }
    // Shards out of the tear and off the top, popping up and out.
    for (let k = 0; k < b.shards; k++) {
      const atTear = k % 3 !== 0;
      const y = atTear ? top + range(r, 0, 160) : top;
      const x = atTear ? iceTearX(this.tear, y) : range(r, s.x + 10, s.x + s.w - 10);
      const size = range(r, 4, 13);
      const a = range(r, 0, Math.PI * 2);
      const outline = [];
      for (let v = 0; v < 3; v++) {
        const ang = a + (v * Math.PI * 2) / 3 + range(r, -0.4, 0.4);
        outline.push(x + Math.cos(ang) * size, y + Math.sin(ang) * size * range(r, 0.5, 1));
      }
      const speed = range(r, ...b.shardSpeed);
      const heading = -Math.PI / 2 + this.outward * range(r, 0.1, 1.1);
      this.addPiece('shard', outline, {
        row: -1, vx: Math.cos(heading) * speed + range(r, -60, 60), vy: Math.sin(heading) * speed, spin: range(r, -9, 9),
      });
    }
  }

  // A falling piece from its world outline: kept about its own centre
  // (`x0` / `y0`, where it was as it broke away).
  addPiece(kind, outline, { row, vx, vy, spin }) {
    let cx = 0;
    let cy = 0;
    const n = outline.length / 2;
    for (let k = 0; k < outline.length; k += 2) {
      cx += outline[k] / n;
      cy += outline[k + 1] / n;
    }
    const poly = outline.map((v, k) => v - (k % 2 ? cy : cx));
    let reach = 0;
    for (let k = 0; k < poly.length; k += 2) reach = Math.max(reach, Math.hypot(poly[k], poly[k + 1]));
    this.debris.push({
      kind, row, poly, reach, x0: cx, y0: cy, x: cx, y: cy, a: 0, vx, vy, spin, age: 0,
      prevX: cx, prevY: cy, prevA: 0, renderX: cx, renderY: cy, renderA: 0, seed: (this.debris.length * 7919 + 13) % 997,
    });
  }

  // The pieces fall on, a share of their gravity while the section only
  // sags apart (phase B), all of it after; each is dropped once well below
  // the Void.
  stepDebris(dt) {
    if (!this.debris.length) return;
    const b = this.behavior;
    const share = this.state === I.separating ? b.separationGravity : 1;
    const limit = this.system.stage.void.bottom + b.cullBelow;
    let n = 0;
    for (const p of this.debris) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevA = p.a;
      p.vy += b.debrisGravity * (p.kind === 'shard' ? 1 : share) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.spin * dt;
      p.age += dt;
      if (p.y - p.reach < limit) this.debris[n++] = p;
    }
    this.debris.length = n;
  }

  // Where every piece is drawn, `alpha` (0-1) of the way from its last step.
  interpolate(alpha) {
    for (const p of this.debris) {
      p.renderX = p.prevX + (p.x - p.prevX) * alpha;
      p.renderY = p.prevY + (p.y - p.prevY) * alpha;
      p.renderA = p.prevA + (p.a - p.prevA) * alpha;
    }
  }
}

// ---- Jökull's weather ----------------------------------------------------------------

// The blizzard: weather, never a weapon. Calm, a check every checkSeconds
// (the first after its opening calm), each check one draw against `chance`
// (exactly 0.25 in a match: BLIZZARD_CHANCE): a failed one leaves the
// weather calm until the next, a successful one starts a storm, which
// always runs warning → blizzard → clearing → calm, after which the checks
// start again. Only calm checks, so no two storms ever overlap, and nothing
// forces one weather after another. Its clock runs on the fixed step and
// only while the fight is live; `intensity` (0 calm to 1 full whiteout,
// eased in through the warning and out through the clearing) is all the
// theme draws from. A preview's demonstration (`demo`) has its own shorter
// tuning (BLIZZARD.demo).
export class BlizzardController {
  constructor(spec, system, seed, { demo = false } = {}) {
    this.spec = spec;
    this.system = system;
    this.id = spec.id;
    this.behavior = behaviorOf(spec);
    this.demo = !!demo;
    this.tuning = this.demo ? { ...this.behavior, ...this.behavior.demo } : this.behavior;
    const c = this.tuning.chance;
    if (!(Number.isFinite(c) && c >= 0 && c <= 1)) throw new Error(`[Alva] Stage hazard "${spec.id}": its chance must be between 0 and 1`);
    this.seed = seed >>> 0;
    this.rng = mulberry32(deriveSeed(this.seed, streamOf(this.id)));
    this.reset();
  }

  // Calm, at the start of its opening calm. The stream carries on.
  reset() {
    this.state = W.calm;
    this.time = 0;
    this.duration = 0;
    // Seconds to the next check (while calm).
    this.nextCheck = range(this.rng, ...this.tuning.openingCalmSeconds);
    // Checks made, and each one's outcome (true: a storm), oldest first;
    // storms started; states entered (tests, debugging).
    this.checks = 0;
    this.outcomes = [];
    this.storms = 0;
    this.history = [W.calm];
    this.intensity = 0;
    this.prevIntensity = 0;
    this.renderIntensity = 0;
  }

  // The chance each check has of starting a storm.
  get chance() {
    return this.tuning.chance;
  }

  // A storm under way (warning, blizzard or clearing).
  get active() {
    return this.state !== W.calm;
  }

  // One fixed step. `live` false: the weather holds as it is.
  step(dt, live) {
    this.prevIntensity = this.intensity;
    if (live) {
      this.time += dt;
      if (this.state === W.calm) {
        this.nextCheck -= dt;
        if (this.nextCheck <= EPS) this.check();
      } else if (this.time >= this.duration - EPS) {
        this.enter(this.state === W.warning ? W.blizzard : this.state === W.blizzard ? W.clearing : W.calm);
      }
    }
    const k = this.duration > 0 ? clamp(this.time / this.duration, 0, 1) : 1;
    const ease = k * k * (3 - 2 * k);
    this.intensity = this.state === W.warning ? ease : this.state === W.blizzard ? 1 : this.state === W.clearing ? 1 - ease : 0;
  }

  // One weather check: one draw. A storm, or calm until the next check.
  check() {
    this.checks++;
    const storm = this.rng() < this.tuning.chance;
    this.outcomes.push(storm);
    if (this.outcomes.length > 64) this.outcomes.shift();
    if (storm) this.enter(W.warning);
    else this.nextCheck = range(this.rng, ...this.tuning.checkSeconds);
  }

  enter(state) {
    const t = this.tuning;
    this.state = state;
    this.time = 0;
    this.history.push(state);
    if (this.history.length > 64) this.history.shift();
    switch (state) {
      case W.warning:
        this.storms++;
        this.duration = range(this.rng, ...t.warningSeconds);
        break;
      case W.blizzard:
        this.duration = range(this.rng, ...t.blizzardSeconds);
        break;
      case W.clearing:
        this.duration = range(this.rng, ...t.clearingSeconds);
        break;
      default:
        this.duration = 0;
        this.nextCheck = range(this.rng, ...t.checkSeconds);
        break;
    }
    this.system.event({ type: `weather-${state}`, hazard: this.id });
  }

  interpolate(alpha) {
    this.renderIntensity = this.prevIntensity + (this.intensity - this.prevIntensity) * alpha;
  }
}

const CONTROLLERS = Object.freeze({ volcano: VolcanoController, 'ice-section': IceSectionController, blizzard: BlizzardController });

// A stage's hazards: one controller per hazard of `map`, each seeded from
// `seed` on its own stream, and every rock in flight. A stage with none has
// nothing to run. `opening` is how a volcano opens (a preview's erupts),
// `demo` a preview's demonstration of the ice and the weather (never a
// match's).
export class StageHazards {
  constructor(stage, map, { seed = 0, opening = 'dormant', demo = false } = {}) {
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
    // What happened this step ({ type, hazard, ... }: an ice section's
    // contact, critical, separating, collapsing or destroyed; the weather's
    // changes), for the Arena's effects. Cleared every step.
    this.events = [];
    // The bodies in play this step.
    this.bodies = [];
    this.controllers = (map.hazards ?? []).map((spec) => {
      const Controller = CONTROLLERS[spec.behavior];
      if (!Controller) throw new Error(`[Alva] Stage hazard "${spec.id}": unknown behaviour "${spec.behavior}"`);
      return new Controller(spec, this, this.seed, { opening, demo });
    });
  }

  // The volcano, if the stage has one (the theme draws it from this).
  get volcano() {
    return this.controllers.find((c) => c instanceof VolcanoController) ?? null;
  }

  // The breakable ice sections, in map order (none on most stages).
  get iceSections() {
    return this.controllers.filter((c) => c instanceof IceSectionController);
  }

  // The ice section controlling floor section `id`, or null.
  iceFor(id) {
    return this.controllers.find((c) => c instanceof IceSectionController && c.section.id === id) ?? null;
  }

  // The weather, if the stage has any.
  get blizzard() {
    return this.controllers.find((c) => c instanceof BlizzardController) ?? null;
  }

  event(e) {
    this.events.push(e);
  }

  // The controller of hazard `id`, or null.
  get(id) {
    return this.controllers.find((c) => c.id === id) ?? null;
  }

  addRock(rock) {
    this.rocks.push(rock);
  }

  // Every hazard back at its start, nothing flying, landing or shown: every
  // ice section whole and solid again, the weather calm.
  reset() {
    for (const c of this.controllers) c.reset();
    this.rocks.length = 0;
    this.landed.length = 0;
    this.impacts.length = 0;
    this.events.length = 0;
    this.stage.dangerZones.length = 0;
  }

  // One fixed step, after the fighters have taken theirs: every hazard's
  // own step (an ice section reading where `fighters` now stand), then
  // every body standing on a floor section that has just broken away lets
  // go of it (or stands on the neighbour it still overlaps: releaseGround),
  // every rock flown on, those that reach the sand landed (into `landed`,
  // for resolve, and an impact for the art), the impacts aged, and the
  // stage's danger zones rebuilt from the warnings now showing. `live`
  // false: no new rocks, the ones that land strike nobody, no contact
  // counts and the weather holds.
  update(dt, { live = true, fighters = [] } = {}) {
    this.landed.length = 0;
    this.events.length = 0;
    if (!this.controllers.length) return this.landed;
    const bodies = this.bodies;
    bodies.length = 0;
    for (const f of fighters) bodies.push(f.body ?? f);
    for (const c of this.controllers) c.step(dt, live, bodies);
    for (const b of bodies) releaseGround(b, this.stage);
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
      zones.push({ id: r.id, kind: 'rock', x: r.x, radius: r.radius, height: r.height, timeLeft: r.flight - r.age, size: r.size });
    }
    for (const c of this.controllers) {
      const z = c.zone;
      if (z) zones.push(z);
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

  // Where every rock (and every falling piece of ice, and the weather's
  // strength) is drawn, `alpha` (0-1) of the way from a step ago to now.
  interpolate(alpha) {
    for (const r of this.rocks) r.renderAge = r.prevAge + (r.age - r.prevAge) * alpha;
    for (const c of this.controllers) c.interpolate?.(alpha);
  }
}
