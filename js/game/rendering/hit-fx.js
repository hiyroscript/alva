// Hit effects: how an impact looks and feels on screen, never what it does.
//
// The Arena hands every step's combat events here (see Arena.update) and
// asks, each rendered frame, for what to draw. Nothing in this module ever
// reads or writes the simulation beyond the events and the fighters'
// interpolated positions: it only shakes, zooms and paints the view, and
// slows the clock the Arena feeds its fixed steps from (so every step stays
// exactly the same step; there are just fewer of them per second for a
// moment).
//
// - Screen shake, scaled to the hit's strength (its damage and launch
//   speed); a block and a perfect block give a small one.
// - A one-frame white flash on a fighter that is hit.
// - Procedural sparks where the hit landed: amber streaks thrown along the
//   launch for a hit, a red ring for a block, a bright white ring for a
//   perfect block.
// - Speed trails: fading afterimages behind a fighter launched hard enough
//   to tumble, while it flies fast, and fainter ones behind a Dash or an air
//   dash while it lasts.
// - A short slow-motion zoom on a launch that will carry its fighter into
//   the Void if it does nothing (see launchIsLethal).
// - A launch's rebound off a wall, floor or ceiling (see
//   js/game/combat/launch-bounce.js): sparks thrown off the surface it struck and,
//   for a hard one, a small shake. The rebound itself says the rest.
// - A fighter the Void takes bursts where it went in: a flash, a ring and
//   shards in its own colours (its visual.eliminationPalette, see
//   eliminationPalette), drawn on after it has gone. Nothing but paint.
//
// With reduced motion there is no shake and no zoom, and an elimination's
// shards barely travel; the rest stays.

import { stepBody } from '../physics.js';
import { bounceLaunch } from '../combat/launch-bounce.js';
import { approach } from '../../core/utils.js';
import { BASE_FIGHTER_MOVEMENT } from '../../data/movement.js';

// All tuning in one place. Times are real seconds; sizes are CSS pixels
// unless noted (scaled by the view's device-pixel ratio when drawn).
export const HIT_FX = Object.freeze({
  shake: {
    base: 1.5, // px for any hit
    perDamage: 0.18, // px per point of damage
    perSpeed: 1 / 320, // px per unit/s of launch speed
    max: 14,
    block: 1.5,
    perfect: 2.5,
    lethal: 16,
    time: 0.22, // seconds to die away (longer for bigger shakes, below)
  },
  flash: 1 / 60, // the white flash: one frame at 60 Hz, at least one frame drawn
  sparks: { hit: 0.26, block: 0.2, perfect: 0.32 }, // lifetimes
  trail: {
    speed: 900, // world units/s: a tumbling fighter this fast leaves a trail
    every: 1 / 40, // seconds between afterimages
    count: 6,
    life: 0.16, // seconds each afterimage takes to fade
    alpha: 0.42,
    dashAlpha: 0.26, // a Dash's (or air dash's) afterimages: fainter
  },
  bounce: {
    shakeSpeed: 900, // world units/s into the surface: slower rebounds do not shake
    perSpeed: 1 / 450, // px per unit/s of that speed
    max: 7,
    spark: 0.22, // lifetime
  },
  // A fighter taken by the Void: its burst, sized from the fighter's own
  // height (world units), so it reads the same at every zoom.
  elimination: {
    life: 0.55, // seconds
    shards: 24,
    radius: 0.95, // how far the shards fly, in fighter heights
    shardLength: 0.2, // in fighter heights
    ring: 0.85, // the ring's widest, in fighter heights
    shake: 5, // px, none with reduced motion
    reducedTravel: 0.3, // with reduced motion, this much of the flight
  },
  lethal: {
    scale: 0.25, // the clock's speed at its slowest
    hold: 0.45, // real seconds held at its slowest
    ease: 0.3, // real seconds back to full speed (the zoom eases out with it)
    zoom: 1.35, // how far the view closes in
    pull: 0.6, // how far toward the launched fighter it leans
    grace: 0.3, // seconds past the stun still counted as "would not recover"
  },
});

const AMBER = '#ffd27a';
const RED = '#d21f2b';

// The colours a fighter with no eliminationPalette of its own bursts in:
// white, a light grey and the sparks' amber.
export const NEUTRAL_ELIMINATION_PALETTE = Object.freeze(['#ffffff', '#c9c9cf', AMBER]);

// The colours `def`'s elimination burst is drawn in: its own
// visual.eliminationPalette (a few CSS colours, character data), or the
// neutral one when it has none.
export function eliminationPalette(def) {
  const own = def?.visual?.eliminationPalette;
  return Array.isArray(own) && own.length && own.every((c) => typeof c === 'string' && c)
    ? own : NEUTRAL_ELIMINATION_PALETTE;
}

// Deterministic noise for the sparks: art only, but the same hit always
// draws the same burst.
function seeded(seed) {
  let s = Math.floor(seed * 9973) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Whether the launch `event` just gave its target carries that target into
// the Void if it does nothing more: its body stepped on with the stage's own
// physics, its speed running down at its hitstun rates for the stun, then
// at its normal ones for `grace` seconds more, with no steering, jump or
// fast fall. Its launch rebounds off whatever it meets on the way, exactly
// as the fighter's would (see js/game/combat/launch-bounce.js), each rebound
// keeping it stunned at least as long as the fighter's. Only then is the
// finishing blow shown in slow motion.
export function launchIsLethal(event, stage, gravity, dt, grace = HIT_FX.lethal.grace) {
  const target = event.target;
  if (!target?.body || !(event.launchSpeed > 0) || !stage?.inVoid) return false;
  const mv = target.movement ?? BASE_FIGHTER_MOVEMENT;
  const body = { ...target.body };
  const bounce = target.launchBounce;
  const launch = target.launch ? { ...target.launch } : null;
  let stun = event.hitstun ?? 0;
  for (let t = 0; t < stun + grace; t += dt) {
    const stunned = t < stun;
    const drag = body.grounded
      ? (stunned ? mv.hitstunFriction : mv.deceleration)
      : (stunned ? mv.hitstunAirDrag : mv.airDeceleration);
    body.vx = approach(body.vx, 0, drag * dt);
    stepBody(body, dt, stage, gravity);
    if (launch && bounceLaunch(body, launch, bounce)) stun = Math.max(stun, t + dt + bounce.stun);
    if (stage.inVoid(body)) return true;
  }
  return false;
}

export class HitEffects {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.reset();
  }

  reset() {
    this.shake = { amp: 0, time: 0, life: 0 };
    this.clock = 0; // real seconds, for the shake's waves
    this.flashes = new Map(); // fighter -> real seconds of flash left
    this.sparks = []; // { kind, x, y, dx, dy, size, age, life, seed }
    this.trails = new Map(); // fighter -> { ghosts: [{ x, y, frame, flip, age }], since }
    this.slow = null; // { time, focus: fighter } while the lethal slow motion runs
    this.eliminations = []; // { slot, x, y, size, palette, age, life, seed }
  }

  // ---- From the simulation -------------------------------------------------------

  // One fixed step's combat events. `arena` gives the stage, gravity and step
  // to judge a lethal launch by.
  take(events, arena) {
    for (const e of events) {
      if (e.type === 'block') {
        this.addShake(e.perfect ? HIT_FX.shake.perfect : HIT_FX.shake.block);
        this.addSpark(e.perfect ? 'perfect' : 'block', e);
        continue;
      }
      // A hit with no stun and no launch only counts (a Launch Point
      // tick): it shows nothing.
      if (!(e.hitstun > 0) && !(e.launchSpeed > 0)) continue;
      const s = HIT_FX.shake;
      this.addShake(Math.min(s.max, s.base + e.damage * s.perDamage + e.launchSpeed * s.perSpeed));
      this.flashes.set(e.target, HIT_FX.flash);
      this.addSpark('hit', e);
      if (!this.slow && launchIsLethal(e, arena.stage, arena.gravity, arena.step)) {
        this.slow = { time: 0, focus: e.target };
        this.addShake(s.lethal);
      }
    }
  }

  // A launched fighter's rebound off stage geometry this step (`bounce`, see
  // Fighter.bounce): sparks thrown off the surface where it struck, sized
  // by its speed into it, and a small shake for a hard one. No flash: the
  // surface is not a hit.
  takeBounce(bounce) {
    const b = HIT_FX.bounce;
    if (bounce.speed >= b.shakeSpeed) this.addShake(Math.min(b.max, bounce.speed * b.perSpeed));
    const n = Math.hypot(bounce.normalX, bounce.normalY) || 1;
    this.sparks.push({
      kind: 'hit', x: bounce.x, y: bounce.y, dx: bounce.normalX / n, dy: bounce.normalY / n,
      size: Math.min(1.6, 0.6 + bounce.speed / 3000), age: 0, life: b.spark,
      seed: bounce.x * 0.29 + bounce.y * 0.17 + bounce.bounces,
    });
  }

  // `f` was just taken by the Void (Arena.checkVoid): its burst, at its
  // body's centre where it went in, its height and its colours, all caught
  // now, so the burst plays on after the fighter has left play. A small
  // shake with it (none with reduced motion).
  addElimination(f) {
    const b = f.body;
    const e = HIT_FX.elimination;
    this.eliminations.push({
      slot: f.slot ?? null, x: b.x, y: b.y - b.height / 2,
      size: f.def?.visual?.height ?? b.height, palette: eliminationPalette(f.def),
      age: 0, life: e.life, seed: b.x * 0.23 + b.y * 0.31 + this.eliminations.length,
    });
    this.addShake(e.shake);
  }

  addShake(amp) {
    if (this.reducedMotion || !(amp > 0)) return;
    if (amp < this.shake.amp * (1 - this.shake.time / (this.shake.life || 1))) return;
    this.shake = { amp, time: 0, life: HIT_FX.shake.time * (1 + amp / HIT_FX.shake.max) };
  }

  addSpark(kind, e) {
    const point = e.point ?? { x: e.target.body.x, y: e.target.body.y - e.target.body.height / 2 };
    const speed = e.launchSpeed ?? 0;
    const dir = speed > 0 ? { x: e.finalLaunch.x / speed, y: e.finalLaunch.y / speed } : { x: 0, y: 0 };
    const size = kind === 'hit' ? Math.min(2.2, 0.8 + e.damage / 10 + speed / 2500) : kind === 'perfect' ? 1.4 : 1;
    this.sparks.push({
      kind, x: point.x, y: point.y, dx: dir.x, dy: dir.y, size,
      age: 0, life: HIT_FX.sparks[kind], seed: point.x * 0.37 + point.y * 0.11 + e.damage,
    });
  }

  // ---- Per rendered frame -----------------------------------------------------------

  // Ages everything by `dt` real seconds. Called once per rendered frame.
  update(dt) {
    this.clock += dt;
    if (this.shake.amp > 0) {
      this.shake.time += dt;
      if (this.shake.time >= this.shake.life) this.shake.amp = 0;
    }
    for (const [f, left] of this.flashes) {
      if (left - dt <= 0) this.flashes.delete(f);
      else this.flashes.set(f, left - dt);
    }
    for (const s of this.sparks) s.age += dt;
    this.sparks = this.sparks.filter((s) => s.age < s.life);
    for (const e of this.eliminations) e.age += dt;
    this.eliminations = this.eliminations.filter((e) => e.age < e.life);
    if (this.slow) {
      this.slow.time += dt;
      const { hold, ease } = HIT_FX.lethal;
      if (this.slow.time >= hold + ease) this.slow = null;
    }
  }

  // How fast the simulation clock runs this frame (1 normally; slower
  // through a lethal launch's slow motion, easing back).
  get timeScale() {
    if (!this.slow) return 1;
    const { scale, hold, ease } = HIT_FX.lethal;
    const t = this.slow.time;
    if (t <= hold) return scale;
    const k = Math.min(1, (t - hold) / ease);
    return scale + (1 - scale) * k * k * (3 - 2 * k);
  }

  // How far the view closes in this frame (1 for none) and on whom.
  get zoom() {
    if (!this.slow || this.reducedMotion) return 1;
    const { zoom, hold, ease } = HIT_FX.lethal;
    const t = this.slow.time;
    // In fast, held through the slow motion, out as the clock comes back.
    const inK = Math.min(1, t / 0.08);
    const outK = t <= hold ? 1 : 1 - Math.min(1, (t - hold) / ease);
    const k = Math.min(inK, outK);
    return 1 + (zoom - 1) * k * k * (3 - 2 * k);
  }

  get zoomFocus() {
    return this.slow?.focus ?? null;
  }

  // The shake's offset this frame, in CSS pixels ({ x, y }).
  shakeOffset(out = { x: 0, y: 0 }) {
    const s = this.shake;
    if (!(s.amp > 0)) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    const fade = 1 - s.time / s.life;
    const a = s.amp * fade * fade;
    const t = this.clock;
    out.x = a * Math.sin(t * 91 + 1.3) * Math.cos(t * 23);
    out.y = a * Math.cos(t * 77 + 0.4) * Math.sin(t * 31 + 2);
    return out;
  }

  // Whether `f` is drawn white this frame.
  flashing(f) {
    return this.flashes.has(f);
  }

  // Records `f`'s afterimage while it tumbles fast or Dashes (Combat
  // Assist's approach, a Dash's clip and speed, included), called once per
  // frame with its current frame and interpolated position; old ones fade.
  sampleTrail(f, dt) {
    let trail = this.trails.get(f);
    const tumbling = f.tumbling && Math.hypot(f.body.vx, f.body.vy) >= HIT_FX.trail.speed;
    const dashing = !!f.dash || !!f.combatAssist;
    const fast = (tumbling || dashing) && !f.lostToVoid;
    if (!trail) {
      if (!fast) return;
      trail = { ghosts: [], since: Infinity };
      this.trails.set(f, trail);
    }
    for (const g of trail.ghosts) g.age += dt;
    trail.ghosts = trail.ghosts.filter((g) => g.age < HIT_FX.trail.life);
    trail.since += dt;
    const frame = f.animator.frame;
    if (fast && frame && trail.since >= HIT_FX.trail.every) {
      trail.since = 0;
      trail.ghosts.push({ x: f.renderX, y: f.renderY, frame, flip: f.spriteFlip, age: 0, dash: !tumbling });
      if (trail.ghosts.length > HIT_FX.trail.count) trail.ghosts.shift();
    }
    if (!fast && !trail.ghosts.length) this.trails.delete(f);
  }

  // `f`'s afterimages, oldest first, each with the alpha to draw it at.
  ghosts(f) {
    const trail = this.trails.get(f);
    if (!trail) return [];
    const { life, alpha, dashAlpha } = HIT_FX.trail;
    return trail.ghosts.map((g) => ({ ...g, alpha: (g.dash ? dashAlpha : alpha) * (1 - g.age / life) }));
  }

  // Draws every live spark. `toScreen(x, y)` maps world to device pixels and
  // `dpr` is device pixels per CSS pixel.
  drawSparks(ctx, toScreen, dpr) {
    for (const s of this.sparks) {
      const [x, y] = toScreen(s.x, s.y);
      const k = s.age / s.life;
      const fade = 1 - k;
      const px = dpr * s.size;
      ctx.save();
      ctx.lineCap = 'round';
      if (s.kind === 'hit') {
        const rnd = seeded(s.seed);
        const n = Math.round(6 + s.size * 4);
        const along = Math.hypot(s.dx, s.dy) > 0;
        // A white core that pops and shrinks.
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, px * (7 - 4 * k), 0, Math.PI * 2);
        ctx.fill();
        // Amber streaks thrown out, most of them along the launch, each over
        // a thin dark line so it reads on the pale stages too.
        const width = Math.max(1, px * 2.2 * fade);
        const streaks = [];
        for (let i = 0; i < n; i++) {
          let a = rnd() * Math.PI * 2;
          if (along && i < n * 0.6) a = Math.atan2(s.dy, s.dx) + (rnd() - 0.5) * 1.1;
          const r0 = px * (4 + 10 * k);
          const r1 = r0 + px * (8 + rnd() * 14) * (1 - k * 0.5);
          streaks.push([x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1]);
        }
        for (const [color, w] of [['rgba(0, 0, 0, 0.35)', width + 2 * dpr], [AMBER, width]]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.beginPath();
          for (const [x0, y0, x1, y1] of streaks) {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
          }
          ctx.stroke();
        }
      } else {
        // A ring that opens out: red on a block, white edged in red on a
        // perfect one.
        const r = px * (8 + 26 * k);
        ctx.globalAlpha = fade;
        ctx.lineWidth = Math.max(1, px * 3 * fade);
        ctx.strokeStyle = s.kind === 'perfect' ? '#ffffff' : RED;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        if (s.kind === 'perfect') {
          ctx.strokeStyle = RED;
          ctx.lineWidth = Math.max(1, px * 1.2 * fade);
          ctx.beginPath();
          ctx.arc(x, y, r + px * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // Draws every live elimination burst: a bright flash that pops and fades,
  // a ring opening out in the fighter's first colour, and shards in all its
  // colours flung out round it, each over a thin dark line so it reads on the
  // pale stages too, all fading out together. `toScreen(x, y)` maps world to
  // device pixels, `scale` is device pixels per world unit and `dpr` device
  // pixels per CSS pixel. The shards fly out fast and settle (an ease-out);
  // with reduced motion they travel only a short way. The same burst always
  // draws the same shards.
  drawEliminations(ctx, toScreen, scale, dpr = 1) {
    const cfg = HIT_FX.elimination;
    const travel = this.reducedMotion ? cfg.reducedTravel : 1;
    for (const e of this.eliminations) {
      const [x, y] = toScreen(e.x, e.y);
      const k = Math.min(1, e.age / e.life);
      const fade = 1 - k;
      const out = 1 - (1 - k) ** 3;
      const size = e.size * scale;
      const [main] = e.palette;
      ctx.save();
      ctx.lineCap = 'round';
      // The flash: white, popping out and shrinking away in the first half.
      if (k < 0.5) {
        ctx.globalAlpha = (1 - k / 0.5) ** 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, size * (0.18 + 0.22 * Math.min(1, k * 6)) * (1 - k), 0, Math.PI * 2);
        ctx.fill();
      }
      // The ring.
      ctx.globalAlpha = fade;
      ctx.strokeStyle = main;
      ctx.lineWidth = Math.max(1, size * 0.06 * fade);
      ctx.beginPath();
      ctx.arc(x, y, size * (0.15 + (cfg.ring - 0.15) * out * travel), 0, Math.PI * 2);
      ctx.stroke();
      // The shards, round the whole circle with a little jitter.
      const rnd = seeded(e.seed);
      const shards = [];
      for (let i = 0; i < cfg.shards; i++) {
        const a = (i / cfg.shards) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        const reach = size * cfg.radius * (0.6 + rnd() * 0.5);
        const r0 = size * 0.12 + reach * out * travel;
        const r1 = r0 + size * cfg.shardLength * (0.6 + rnd() * 0.6) * (1 - 0.6 * k);
        shards.push([e.palette[i % e.palette.length], x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1]);
      }
      const width = Math.max(1, size * 0.045 * (1 - 0.5 * k));
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = width + 2 * dpr;
      ctx.beginPath();
      for (const [, x0, y0, x1, y1] of shards) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
      ctx.lineWidth = width;
      for (const color of e.palette) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        for (const [c, x0, y0, x1, y1] of shards) {
          if (c !== color) continue;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

// A white silhouette of normalized frame `frame`, made once per frame and
// kept (the hit flash). Same size and anchor, so it draws exactly over the
// sprite.
const WHITE = new WeakMap();
// Where no canvas can be made (no DOM), the frame itself is drawn.
export function whiteFrame(frame) {
  let white = WHITE.get(frame);
  if (white) return white;
  const src = frame.canvas;
  if (!(src?.width > 0 && src?.height > 0)) return frame;
  let canvas = null;
  if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(src.width, src.height);
  else if (typeof document !== 'undefined' && document.createElement) {
    canvas = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
  }
  const c = canvas?.getContext?.('2d');
  if (!c) return frame;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, src.width, src.height);
  white = { ...frame, canvas };
  WHITE.set(frame, white);
  return white;
}
