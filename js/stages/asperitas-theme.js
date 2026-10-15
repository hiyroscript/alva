// ASPERITAS — high above the clouds in open daylight. A peaceful, airy,
// weightless stage: one great cloud adrift over a sea of clouds, and two
// smaller clouds drifting over it. These are scene colours of the stage
// artwork, not part of the monochrome Alva interface palette.
//
// The sky is flat parallax: a rich blue upper atmosphere paling to cyan
// and a soft white horizon, the sun high on the right with a gentle glow
// and faint rays, towering cumulus far off on the horizon, high cirrus
// wisps, nearer cloud banks, and an endless cloud sea below the stage
// level rather than any ground, with large soft clouds drifting by beneath.
//
// The main cloud is drawn in the shared one-point perspective
// (js/stages/perspective.js): rows of overlapping puffs receding in depth
// make its top, rounder and narrower toward the back, and its front is a
// billowing mass of vapour (no rock, building, pillar or foundation of any
// kind, and nothing beneath it but sky). Its walkable top is flat at
// exactly the collision's height and its ledges exactly at
// map.mainStage's edges; its dense core is what collides (a shallow slab),
// and only soft wisps hang lower.
//
// The two drifting clouds are drawn from the live runtime platforms the
// Arena hands over (`platforms`: each one's interpolated place, opacity
// and state, see js/game/platform-hazards.js), so the art is always where
// the collision is: their walkable top is never moved by any effect.
// Their hazard look stays gentle (no warning red): a cool rim and glow
// beneath, a soft breathing of their underside, faint trails while they
// drift, and a fade-out / forming effect as they vanish and appear. A
// preview without live platforms (a roster thumbnail) draws them still,
// where the map starts them. With reduced motion every decorative motion
// holds still; the clouds still move, fade and form, as gameplay does.

import { StageTheme, ParticleField } from './stage-theme.js';
import { quadGradient } from './perspective.js';
import { mulberry32, range } from '../core/utils.js';

const C = {
  sky: [[0, '#1f58bd'], [0.32, '#3f84dc'], [0.62, '#7fbcee'], [0.82, '#bfe3f8'], [1, '#e9f6fd']],
  sunCore: '#fffdf2',
  sunGlow: 'rgba(255, 248, 222, 0.55)',
  ray: 'rgba(255, 252, 236, 0.07)',
  // Sky clouds, paler, bluer and softer with distance (so nothing in the
  // background competes with the clouds you stand on).
  far: { halo: 'rgba(214, 230, 250, 0.16)', shade: 'rgba(150, 178, 222, 0.34)', body: [[0, 'rgba(224, 236, 251, 0.5)'], [1, 'rgba(176, 200, 236, 0.44)']], crest: 'rgba(240, 247, 255, 0.28)' },
  bank: { halo: 'rgba(214, 230, 250, 0.18)', shade: 'rgba(146, 176, 224, 0.42)', body: [[0, 'rgba(222, 235, 251, 0.62)'], [1, 'rgba(172, 198, 236, 0.56)']], crest: 'rgba(240, 247, 255, 0.32)' },
  near: { halo: 'rgba(245, 248, 254, 0.3)', shade: 'rgba(182, 196, 232, 0.7)', body: [[0, 'rgba(255, 255, 255, 0.94)'], [1, 'rgba(210, 220, 242, 0.9)']], crest: 'rgba(255, 253, 244, 0.55)' },
  cirrus: 'rgba(255, 255, 255, 0.34)',
  // The cloud sea below the stage level.
  sea: { halo: 'rgba(240, 246, 253, 0.3)', shade: 'rgba(178, 194, 230, 0.7)', body: [[0, '#f4f8fe'], [1, '#cfdbf1']], crest: 'rgba(255, 255, 255, 0.45)' },
  seaNear: { halo: 'rgba(240, 246, 253, 0.3)', shade: 'rgba(168, 184, 224, 0.75)', body: [[0, '#f8fbff'], [1, '#c6d3ee']], crest: 'rgba(255, 255, 255, 0.5)' },
  depthHaze: [[0, 'rgba(232, 242, 252, 0)'], [0.5, 'rgba(226, 238, 251, 0.3)'], [1, 'rgba(214, 230, 249, 0.58)']],
  // The main cloud: bright white tops, ivory highlights toward the sun,
  // pale blue and lavender shadows below.
  main: { halo: 'rgba(255, 255, 255, 0.4)', shade: '#a9b0de', body: [[0, '#ffffff'], [0.3, '#f2f4fb'], [0.72, '#d3d6f0'], [1, '#b7bbe4']], crest: 'rgba(255, 252, 241, 0.82)' },
  mainBack: { halo: 'rgba(250, 252, 255, 0.35)', shade: '#b9c3e3', body: [[0, '#f5f8fd'], [1, '#cdd5ee']], crest: 'rgba(255, 253, 245, 0.7)' },
  topLine: 'rgba(255, 255, 255, 0.95)',
  wisp: 'rgba(236, 240, 252, 0.3)',
  // The drifting clouds: the same vapour, a cool rim and glow beneath.
  hazard: { halo: 'rgba(255, 255, 255, 0.42)', shade: '#a9b6e4', body: [[0, '#ffffff'], [0.45, '#f0f3fb'], [1, '#c4c7ec']], crest: 'rgba(255, 252, 241, 0.8)' },
  hazardBack: { halo: 'rgba(250, 252, 255, 0.35)', shade: '#b3c0e6', body: [[0, '#f4f7fd'], [1, '#d0d6f0']], crest: 'rgba(255, 253, 245, 0.7)' },
  hazardRim: 'rgba(104, 192, 255, 0.85)',
  hazardGlow: 'rgba(150, 140, 255, 0.32)',
  trail: 'rgba(244, 248, 255, 0.55)',
  mote: '#ffffff',
};

// Depth of the main cloud's rows of puffs, back to front (the fighters
// stand at 1), and its front face. Its top is shallow in depth (a mass of
// vapour seen a little from above, not a deck), so even from high up it
// never rises on screen to where the drifting clouds float. Each row is
// inset at its ends by ROW_INSET x ((1 - f) / (1 - back))^1.4, so the top
// reads round, not boxed.
const MAIN = { back: 0.82, front: 1.06 };
const ROWS = [0.82, 0.88, 0.94, 1];
const ROW_INSET = 110;
// A drifting cloud's slab: its crown behind, its flat top at the fighters'
// depth, its billowing front.
const SLAB = { back: 0.95, top: 1, front: 1.05 };
// Camera height over the main cloud at the reference view (world units),
// as on every stage.
const RISE = 240;
// The main cloud's front: how far its billows hang below its top at the
// middle and at its ends (world units). Its collision slab is 64 deep.
const BILLOW_MID = 128;
const BILLOW_END = 56;

// ---- Cloud geometry ---------------------------------------------------------
//
// A cloud is a union of round puffs (and flat rectangles where it must be
// flat: a walkable top, a level base). It is painted in four cached paths,
// each one fill: a faint halo just around it (soft edges), its shadow
// (every puff shifted down and to the left, peeking out below: the sun is
// high on the right), its body (a vertical gradient, white to lavender) and
// its crest (every puff shifted up and to the right inside itself: the lit
// tops). Puffs overlap heavily, so each fill reads as one soft mass, never
// as separate bubbles.

class Puffs {
  constructor() {
    this.circles = [];
    this.rects = [];
  }

  add(x, y, r) {
    if (r > 0.5) this.circles.push([x, y, r]);
    return this;
  }

  // A rectangle, `rt` its top corners' radius (a flat top, rounded just
  // enough), `rb` its bottom corners'.
  rect(x0, y0, x1, y1, rt = 0, rb = 0) {
    if (x1 > x0 && y1 > y0) this.rects.push([x0, y0, x1, y1, rt, rb]);
    return this;
  }

  // The four paths. `crest` false leaves the lit tops out (a walkable top
  // gets its light from the gradient: nothing may rise past its surface).
  build({ feather = 6, crest = true } = {}) {
    const halo = new Path2D();
    const shade = new Path2D();
    const body = new Path2D();
    const lit = crest ? new Path2D() : null;
    for (const [x, y, r] of this.circles) {
      puff(halo, x, y, r + feather);
      puff(shade, x - r * 0.1, y + r * 0.18, r * 0.94);
      puff(body, x, y, r);
      if (lit) puff(lit, x + r * 0.1, y - r * 0.12, r * 0.8);
    }
    for (const [x0, y0, x1, y1, rt, rb] of this.rects) {
      roundRect(halo, x0 - feather * 0.6, y0, x1 + feather * 0.6, y1 + feather, rt, rb + feather);
      roundRect(shade, x0, y0 + 4, x1, y1 + 4, rt, rb);
      roundRect(body, x0, y0, x1, y1, rt, rb);
    }
    return { halo, shade, body, crest: lit };
  }
}

// Adds a circle as its own sub-path (all wound the same way, so a fill of
// many overlapping puffs paints their union once).
function puff(path, x, y, r) {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, Math.PI * 2);
}

// A rounded rectangle, top corners `rt`, bottom corners `rb` (each kept
// small enough to fit).
function roundRect(path, x0, y0, x1, y1, rt, rb) {
  rt = Math.max(0, Math.min(rt, (y1 - y0) / 2, (x1 - x0) / 2));
  rb = Math.max(0, Math.min(rb, y1 - y0 - rt, (x1 - x0) / 2));
  path.moveTo(x0 + rt, y0);
  path.lineTo(x1 - rt, y0);
  path.arcTo(x1, y0, x1, y0 + rt, rt);
  path.lineTo(x1, y1 - rb);
  path.arcTo(x1, y1, x1 - rb, y1, rb);
  path.lineTo(x0 + rb, y1);
  path.arcTo(x0, y1, x0, y1 - rb, rb);
  path.lineTo(x0, y0 + rt);
  path.arcTo(x0, y0, x0 + rt, y0, rt);
  path.closePath();
}

// A cloud whose walkable top is `top` along [x0, x1]: a dense core, flat
// on top (its corners only slightly rounded, so the ledge stays clear);
// puffs rising at most `bump` above the top (none within `edge` of an end:
// only behind the fighters' depth, see the callers); and billows hanging
// below to about `hang` under the top at the middle and `hangEnd` at the
// ends.
function walkableCloud(rng, { x0, x1, top, core, bump = 0, hang, hangEnd, edge = 16, corner = 10, rMin, rMax }) {
  const c = new Puffs().rect(x0, top, x1, top + core, corner, Math.min(core / 2, 14));
  const w = x1 - x0;
  if (bump > 0) {
    for (let x = x0 + edge + rMin; x < x1 - edge - rMin * 0.6;) {
      const r = range(rng, rMin, rMax);
      const rise = range(rng, bump * 0.3, bump);
      c.add(Math.min(x, x1 - edge - r * 0.7), top + r - rise, r);
      x += r * range(rng, 0.7, 1.05);
    }
  }
  for (let x = x0 + rMin * 0.7; x < x1 - rMin * 0.7;) {
    const u = (x - x0) / w;
    const depth = hangEnd + (hang - hangEnd) * Math.sin(Math.PI * u) ** 0.8;
    // Never more than half the depth: no billow reaches up past the top.
    const r = Math.min(range(rng, rMin, rMax), depth / 2);
    c.add(Math.min(Math.max(x, x0 + r * 0.85), x1 - r * 0.85), top + depth - r, r);
    x += r * range(rng, 0.75, 1.1);
  }
  return c;
}

// A free-standing cumulus (sky art): puffs piled into a dome over a flat
// base at `base`, `w` wide and up to `h` tall, rounded at both ends.
function cumulus(rng, { x, w, base, h, rMin, rMax }) {
  const c = new Puffs();
  const ring = Math.min(h * 0.32, rMax * 0.8);
  c.rect(x + rMin * 0.5, base - ring, x + w - rMin * 0.5, base, ring, 4);
  for (let cx = x + rMin * 0.6; cx < x + w - rMin * 0.6;) {
    const u = (cx - x) / w;
    const dome = Math.sin(Math.PI * u) ** 0.85;
    const r = range(rng, rMin, rMax) * (0.55 + 0.45 * dome);
    c.add(cx, base - r * 0.82, r);
    const lift = h * dome * range(rng, 0.7, 1);
    if (lift > r * 0.9) c.add(cx + range(rng, -r, r) * 0.3, base - lift + r * 0.85, r * range(rng, 0.9, 1.15));
    if (lift > r * 2.1) c.add(cx + range(rng, -r, r) * 0.3, base - (lift + r) * 0.55, r * 1.05);
    cx += r * range(rng, 0.65, 0.95);
  }
  return c;
}

// FNV-1a of a string: each drifting cloud's own shape from its id.
function hash(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class AsperitasTheme extends StageTheme {
  constructor(map, opts = {}) {
    super(map, opts);
    // Soft blue-grey shadows on white vapour.
    this.shadow = { alpha: 0.2, skew: 0, stretch: 1.15 };
    this.persp = this.perspective(RISE);
    // The live runtime platforms (the Arena's or a preview's stage), else
    // the map's own, still where they start.
    this.platforms = opts.platforms ?? map.platforms.map((p) => ({ ...p, renderX: p.x, renderY: p.y, opacity: 1, active: true, state: 'idle', formation: 1, vx: 0, vy: 0 }));
    this.build();
  }

  build() {
    const m = this.map;
    const rng = mulberry32(0xa57e12);
    const G = this.groundY;
    const cb = m.cameraBounds;
    const end = (p) => cb.right * p + 2400;
    const bottom = cb.bottom + 900;

    // Layer 1 (0.06): cumulus far off on the horizon, small with distance.
    const far = new Puffs();
    for (let x = -300; x < end(0.06); x += range(rng, 280, 560)) {
      const c = cumulus(rng, { x, w: range(rng, 200, 420), base: G - 36, h: range(rng, 40, 150), rMin: 24, rMax: 46 });
      far.circles.push(...c.circles);
      far.rects.push(...c.rects);
    }
    this.far = far.build({ feather: 5 });
    // Layer 2 (0.14): high cirrus wisps, long and thin.
    this.cirrus = new Path2D();
    for (let i = 0; i < 24; i++) {
      const x = range(rng, -300, end(0.14));
      const y = range(rng, G - 560, G - 400);
      const len = range(rng, 160, 440);
      for (let k = 0; k < 5; k++) {
        const ex = x + k * len * 0.18;
        const ey = y + Math.sin(k * 1.1) * 4;
        const rx = len * range(rng, 0.16, 0.26);
        this.cirrus.moveTo(ex + rx, ey);
        this.cirrus.ellipse(ex, ey, rx, range(rng, 2, 4.5), range(rng, -0.03, 0.03), 0, Math.PI * 2);
      }
    }
    // Layer 3 (0.3): nearer cloud banks, just above the cloud sea.
    const banks = new Puffs();
    for (let x = -300; x < end(0.3); x += range(rng, 420, 720)) {
      const c = cumulus(rng, { x, w: range(rng, 260, 520), base: G + 46, h: range(rng, 40, 100), rMin: 30, rMax: 54 });
      banks.circles.push(...c.circles);
      banks.rects.push(...c.rects);
    }
    this.banks = banks.build({ feather: 6 });
    // Layers 4 and 5 (0.45, 0.62): the cloud sea, rolling tops filled down
    // out of sight: there is no ground anywhere below.
    this.seaFar = this.seaRidge(rng, { x0: -300, x1: end(0.45), y: G + 60, step: 120, bottom });
    this.seaNear = this.seaRidge(rng, { x0: -300, x1: end(0.62), y: G + 190, step: 170, bottom });
    // Layer 6 (0.78): large soft clouds drifting by under the stage.
    this.drifters = [];
    for (let i = 0; i < 6; i++) {
      const w = range(rng, 320, 600);
      const h = range(rng, 50, 110);
      const art = cumulus(rng, { x: 0, w, base: 0, h, rMin: 34, rMax: 60 }).build({ feather: 8 });
      this.drifters.push({ art, w, h, x: range(rng, -400, end(0.78)), y: G + range(rng, 190, 340), speed: range(rng, 5, 12) });
    }
    this.driftSpan = end(0.78) + 1200;
    // Faint sun rays.
    this.rays = Array.from({ length: 7 }, (_, i) => ({ a: -2.2 + i * 0.32 + range(rng, -0.08, 0.08), w: range(rng, 0.04, 0.09), p: rng() * 6 }));

    this.buildMainCloud(rng);
    this.hazardArt = new Map();

    // Atmosphere: a few motes of light catching the sun.
    const prng = mulberry32(0x5e1a);
    this.motes = new ParticleField(prng, this.reducedMotion ? 6 : 22, { speed: [-6, 10], size: [0.6, 1.3], drift: [-3, 3], depth: [0.9, 1.2], alpha: [0.15, 0.45], band: [0, 1] });
  }

  // A rolling cloud-sea ridge: puffs along a gently wavy line at `y` over a
  // body filled down to `bottom`.
  seaRidge(rng, { x0, x1, y, step, bottom }) {
    const c = new Puffs().rect(x0, y, x1, bottom);
    for (let x = x0; x < x1;) {
      const r = range(rng, step * 0.4, step * 0.75);
      const wave = Math.sin(x / (step * 3.3)) * step * 0.18;
      c.add(x, y + wave + r * 0.35, r);
      x += r * range(rng, 0.7, 1.05);
    }
    return { art: c.build({ feather: 8 }), y };
  }

  // The main cloud's rows (each a cloud along the top, its ends inset
  // further back) and its front face, cached in world units on their
  // planes.
  buildMainCloud(rng) {
    const { left, right } = this.map.mainStage;
    const G = this.groundY;
    this.rows = ROWS.map((f) => {
      const depth = (1 - f) / (1 - MAIN.back);
      const inset = ROW_INSET * depth ** 1.4;
      const art = walkableCloud(rng, {
        x0: left + inset, x1: right - inset, top: G, core: 30,
        bump: f >= 1 ? 0 : 6 + 10 * depth, hang: 44, hangEnd: 30,
        edge: f >= 1 ? 18 : 24, corner: f >= 1 ? 10 : 18, rMin: 24, rMax: 46,
      }).build({ feather: 6 });
      return { f, art, palette: f >= 1 ? C.main : C.mainBack };
    });
    // The front face: the cloud's billowing body. Its dense core is the
    // collision's slab; the billows round it off below.
    const face = walkableCloud(rng, {
      x0: left, x1: right, top: G, core: 54, hang: BILLOW_MID, hangEnd: BILLOW_END,
      edge: 22, corner: 10, rMin: 30, rMax: 64,
    });
    // A second, smaller tier of billows under the middle: the cloud's
    // underside rounds off rather than ending in a line.
    for (let x = left + 160; x < right - 160;) {
      const u = (x - left) / (right - left);
      const r = range(rng, 26, 44) * (0.6 + 0.4 * Math.sin(Math.PI * u));
      face.add(x, G + BILLOW_MID * (0.72 + 0.28 * Math.sin(Math.PI * u)) - r * 0.2, r);
      x += r * range(rng, 1.1, 1.6);
    }
    this.face = face.build({ feather: 8 });
    // Soft wisps under it: vapour trailing off, nothing to stand on.
    this.wisps = [];
    for (let i = 0; i < 9; i++) {
      const u = range(rng, 0.1, 0.9);
      this.wisps.push({
        x: left + u * (right - left), y: G + BILLOW_MID * (0.7 + 0.35 * Math.sin(Math.PI * u)) + range(rng, 6, 30),
        rx: range(rng, 60, 150), ry: range(rng, 7, 14), p: rng() * 6, speed: range(rng, 0.2, 0.5),
      });
    }
  }

  // A drifting cloud's own art, built once per platform, in its own
  // coordinates (its collision slab's top-left corner at 0, 0) with its own
  // shape from its id: its crown behind, its flat top and its billowing
  // front.
  hazardArtOf(p) {
    let art = this.hazardArt.get(p.id);
    if (art) return art;
    const rng = mulberry32(hash(p.id));
    const h = p.h ?? 30;
    const w = p.w;
    art = {
      back: walkableCloud(rng, { x0: 0, x1: w, top: 0, core: h * 0.6, bump: 20, hang: h + 4, hangEnd: h * 0.7, edge: 12, corner: 14, rMin: 16, rMax: 30 }).build({ feather: 5 }),
      top: new Puffs().rect(0, 0, w, h * 0.6, 9, 9).build({ feather: 4, crest: false }),
      front: walkableCloud(rng, { x0: 0, x1: w, top: 0, core: h * 0.6, hang: h + 20, hangEnd: h * 0.85, edge: 16, corner: 9, rMin: 16, rMax: 28 }).build({ feather: 5 }),
      wisps: Array.from({ length: 5 }, (_, i) => ({ u: (i + 0.5) / 5 + range(rng, -0.06, 0.06), dy: range(rng, h * 0.4, h + 8), r: range(rng, 10, 18), p: rng() * 6 })),
      phase: rng() * 6,
      h,
    };
    this.hazardArt.set(p.id, art);
    return art;
  }

  resize(view) {
    const ctx = view.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, view.pxH);
    for (const [at, color] of C.sky) g.addColorStop(at, color);
    this.skyGrad = g;
    // World-space gradients drawn on a plane or layer scale with it: built
    // once per context (a preview has its own canvas).
    if (this.gradCtx !== ctx) {
      this.gradCtx = ctx;
      const G = this.groundY;
      const wg = (y0, y1, stops) => this.worldGradient(ctx, y0, y1, stops);
      this.grads = {
        far: wg(G - 240, G - 30, C.far.body),
        bank: wg(G - 120, G + 46, C.bank.body),
        seaFar: wg(G + 20, G + 360, C.sea.body),
        seaNear: wg(G + 130, G + 520, C.seaNear.body),
        near: wg(-170, 0, C.near.body),
        rowBack: wg(G - 34, G + 46, C.mainBack.body),
        row: wg(G - 4, G + 46, C.main.body),
        face: wg(G - 4, G + BILLOW_MID + 30, C.main.body),
        hazardBack: wg(-16, 34, C.hazardBack.body),
        hazard: wg(-4, 54, C.hazard.body),
      };
    }
  }

  update(dt, view) {
    super.update(dt);
    if (view?.w > 0) this.motes.update(dt, view);
  }

  // Paints a cloud's four paths (see Puffs) in palette `pal`, its body in
  // `grad`; a path left null is not painted.
  paintCloud(ctx, art, pal, grad) {
    if (art.halo) {
      ctx.fillStyle = pal.halo;
      ctx.fill(art.halo);
    }
    if (art.shade) {
      ctx.fillStyle = pal.shade;
      ctx.fill(art.shade);
    }
    ctx.fillStyle = grad;
    ctx.fill(art.body);
    if (art.crest) {
      ctx.fillStyle = pal.crest;
      ctx.fill(art.crest);
    }
  }

  drawBackground(ctx, view) {
    if (!this.grads) this.resize(view);
    const G = this.groundY;
    const s = view.scale;
    const t = this.reducedMotion ? 0 : this.time;

    // Layer 0 — the sky, the sun and its light.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, view.pxW, view.pxH);
    const sx = view.pxW * 0.8 - view.x * s * 0.01;
    const sy = view.pxH * 0.15 - (view.y - this.refY) * s * 0.01;
    const sr = 30 * s;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = C.ray;
    const len = Math.max(view.pxW, view.pxH) * 1.2;
    for (const ray of this.rays) {
      const a = ray.a + (this.reducedMotion ? 0 : Math.sin(t * 0.05 + ray.p) * 0.03);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - ray.w) * len, -Math.sin(a - ray.w) * len);
      ctx.lineTo(Math.cos(a + ray.w) * len, -Math.sin(a + ray.w) * len);
      ctx.closePath();
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(0, 0, sr * 0.6, 0, 0, sr * 7);
    glow.addColorStop(0, C.sunGlow);
    glow.addColorStop(1, 'rgba(255, 248, 222, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-sr * 7, -sr * 7, sr * 14, sr * 14);
    ctx.fillStyle = C.sunCore;
    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer 1 — far cumulus on the horizon.
    this.layer(ctx, view, 0.06, 0.08);
    this.paintCloud(ctx, this.far, C.far, this.grads.far);

    // Layer 2 — high cirrus, drifting very slowly.
    this.layer(ctx, view, 0.14, 0.16);
    ctx.translate(-((t * 3) % 2000), 0);
    ctx.fillStyle = C.cirrus;
    ctx.fill(this.cirrus);
    ctx.translate(2000, 0);
    ctx.fill(this.cirrus);

    // A soft band of haze along the horizon.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const hy = (G - 120 - (this.refY + (view.y - this.refY) * 0.1)) * s;
    const hg = ctx.createLinearGradient(0, hy, 0, hy + 200 * s);
    hg.addColorStop(0, 'rgba(240, 248, 255, 0)');
    hg.addColorStop(1, 'rgba(240, 248, 255, 0.5)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hy, view.pxW, 200 * s);

    // Layer 3 — nearer cloud banks.
    this.layer(ctx, view, 0.3, 0.34);
    this.paintCloud(ctx, this.banks, C.bank, this.grads.bank);

    // Layers 4 and 5 — the cloud sea.
    this.layer(ctx, view, 0.45, 0.5);
    this.paintCloud(ctx, this.seaFar.art, C.sea, this.grads.seaFar);
    this.layer(ctx, view, 0.62, 0.66);
    this.paintCloud(ctx, this.seaNear.art, C.seaNear, this.grads.seaNear);

    // Layer 6 — large clouds drifting by below the stage.
    for (const d of this.drifters) {
      const x = ((d.x + t * d.speed) % this.driftSpan + this.driftSpan) % this.driftSpan - 600;
      this.layer(ctx, view, 0.78, 0.8);
      ctx.translate(x, d.y);
      this.paintCloud(ctx, d.art, C.near, this.grads.near);
    }

    // Light haze thickening below the main cloud's level: the drop past
    // the ledges reads as endless sky, not a floor.
    const rim = this.persp.y(view, G, MAIN.back);
    const depth = 520 * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = quadGradient(ctx, [0, rim, 0, rim, 0, rim + depth, 0, rim + depth], C.depthHaze);
    ctx.fillRect(0, rim, view.pxW, view.pxH - rim);
  }

  // The main cloud, then the drifting clouds over it.
  drawTerrain(ctx, view) {
    if (!this.grads) this.resize(view);
    this.drawMainCloud(ctx, view);
    for (const p of this.platforms) if (p.dynamic || p.kind === 'cloud') this.drawHazardCloud(ctx, view, p);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Row after row of puffs from the back to the fighters' plane (its top),
  // then the billowing front face and the bright line of its walkable top,
  // then the wisps trailing beneath.
  drawMainCloud(ctx, view) {
    const p = this.persp;
    const G = this.groundY;
    const { left, right } = this.map.mainStage;
    // The rows behind are body and crest only: a shadow peeking out under
    // each would stripe the top. The fighters' row keeps the whole shading.
    for (const row of this.rows) {
      p.plane(ctx, view, row.f);
      if (row.f >= 1) this.paintCloud(ctx, row.art, row.palette, this.grads.row);
      else this.paintCloud(ctx, { ...row.art, halo: null, shade: null }, row.palette, this.grads.rowBack);
    }
    p.plane(ctx, view, MAIN.front);
    this.paintCloud(ctx, this.face, C.main, this.grads.face);
    // The walkable top: a bright, clean line from ledge to ledge.
    ctx.fillStyle = C.topLine;
    ctx.fillRect(left + 8, G, right - left - 16, 3);
    // Wisps under it, breathing slowly.
    const t = this.reducedMotion ? 0 : this.time;
    ctx.fillStyle = C.wisp;
    ctx.beginPath();
    for (const w of this.wisps) {
      const dx = Math.sin(t * w.speed + w.p) * 12;
      ctx.moveTo(w.x + dx + w.rx, w.y);
      ctx.ellipse(w.x + dx, w.y, w.rx, w.ry, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // One drifting cloud where it is drawn this frame (its interpolated
  // place), as visible as it is: its glow beneath, trails while it drifts,
  // its crown, flat top and billowing front with a cool rim along its
  // underside, and its walkable top. Its underside breathes; its top never
  // moves. Forming (before it is solid) it gathers in from a little
  // smaller around its top; once solid it is exactly its collision.
  drawHazardCloud(ctx, view, plat) {
    const opacity = plat.opacity ?? 1;
    if (opacity <= 0.001) return;
    const art = this.hazardArtOf(plat);
    const p = this.persp;
    const still = this.reducedMotion;
    const t = still ? 0 : this.time;
    const x = plat.renderX ?? plat.x;
    const y = plat.renderY ?? plat.y;
    const w = plat.w;
    const breathe = still ? 1 : 1 + 0.045 * Math.sin(t * 1.3 + art.phase);
    const forming = plat.state === 'reappearing' && !plat.active;
    const gather = forming ? 0.82 + 0.18 * Math.min(1, (plat.formation ?? 1) / 0.55) : 1;
    const place = (f) => {
      p.plane(ctx, view, f);
      ctx.translate(x + w / 2, y);
      ctx.scale(gather, gather * breathe);
      ctx.translate(-w / 2, 0);
    };
    ctx.save();
    ctx.globalAlpha = opacity;
    // A soft glow beneath: the gentle sign that this cloud is not like the
    // others.
    p.plane(ctx, view, 1);
    ctx.translate(x + w / 2, y + art.h + 14);
    ctx.scale(1, 0.24);
    const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, w * 0.64);
    gr.addColorStop(0, C.hazardGlow);
    gr.addColorStop(1, 'rgba(160, 150, 255, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(-w * 0.7, -w * 0.7, w * 1.4, w * 1.4);
    // Trails behind it while it drifts, fading with its speed.
    const speed = Math.hypot(plat.vx ?? 0, plat.vy ?? 0);
    if (!still && speed > 6) {
      const k = Math.min(1, speed / 90);
      const ux = -(plat.vx ?? 0) / speed;
      const uy = -(plat.vy ?? 0) / speed;
      p.plane(ctx, view, 0.97);
      ctx.fillStyle = C.trail;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = opacity * k * (0.34 - i * 0.08);
        const cx = x + w / 2 + ux * (w * 0.34 + i * 22);
        const cy = y + art.h * 0.45 + uy * (art.h * 0.6 + i * 14);
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * (0.3 - i * 0.05), art.h * (0.42 - i * 0.07), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = opacity;
    }
    // The slab: crown behind, flat top, billowing front.
    place(SLAB.back);
    this.paintCloud(ctx, art.back, C.hazardBack, this.grads.hazardBack);
    place(SLAB.top);
    this.paintCloud(ctx, art.top, C.hazard, this.grads.hazard);
    place(SLAB.front);
    // Its cool rim, just under the underside.
    ctx.strokeStyle = C.hazardRim;
    ctx.lineWidth = 3;
    ctx.stroke(art.front.shade);
    this.paintCloud(ctx, art.front, C.hazard, this.grads.hazard);
    ctx.fillStyle = C.topLine;
    ctx.fillRect(7, 0, w - 14, 2.5);
    // Vapour coming apart as it fades, gathering as it forms.
    if (!still && (plat.state === 'disappearing' || forming)) {
      const k = Math.min(1, Math.max(0, plat.state === 'disappearing' ? 1 - opacity : 1 - (plat.formation ?? 1) / 0.55));
      ctx.fillStyle = C.trail;
      ctx.globalAlpha = opacity * 0.5;
      ctx.beginPath();
      for (const wsp of art.wisps) {
        const spread = 1 + k * 0.9;
        const cx = w / 2 + (wsp.u - 0.5) * w * spread;
        const cy = wsp.dy + Math.sin(t * 2 + wsp.p) * 3 - k * 10;
        const r = wsp.r * (1 - k * 0.3);
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  worldGradient(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  drawForeground(ctx, view) {
    this.motes.draw(ctx, view, C.mote);
  }
}
