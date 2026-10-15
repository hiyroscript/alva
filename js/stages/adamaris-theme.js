// ADAMARIS — a tropical beach at midday, a towering volcano across the bay.
// Bright, warm and wide open: the fighters stand on the sand itself, which
// runs on past both sides of the Void (the map's continuous ground, see
// js/data/maps.js), so nothing here is a platform, a slab or a cliff: no
// edge, underside or foundation is ever drawn. These are scene colours of
// the stage artwork, not part of the monochrome Alva interface palette.
//
// Everything stands in the shared one-point perspective
// (js/stages/perspective.js): the sky (screen space, the sun and drifting
// cumulus), the volcano far off across the water on its own island (a plane
// deep in the distance, centred on the stage, so it barely moves as the
// camera pans), small islands and green headlands on the horizon, the sea
// (a horizontal plane from the horizon to the shore, its swells rolling in
// toward the beach, glints, the volcano's glow mirrored on it), the shore
// (foam washing up and back over a band of wet sand) and the beach (a
// horizontal plane from the water's edge down past the bottom of the screen,
// rippled, scattered with shells and pebbles, palms leaning in at its
// sides). The fighters' plane is exactly the ground's: map.mainStage.top.
//
// The volcano is the live hazard's (js/game/stage-hazards.js, handed in as
// `hazards`): dormant it breathes a little steam over a dark crater;
// erupting it brightens through its buildup, bursts, glows, fountains lava,
// pours smoke and ash, and cools again, and every rock it throws is drawn
// flying out of its crater and down onto the sand, its red warning circle
// where it will land, its impact where it lands. Nothing here decides
// anything: every state, rock, landing and timing is the simulation's. A
// preview without live hazards (a roster thumbnail) draws it dormant. With
// reduced motion the smoke, sea and sand hold still and the warnings stop
// pulsing; the volcano's state, the rocks and their warnings still show, as
// gameplay does.

import { StageTheme, ParticleField } from './stage-theme.js';
import { mulberry32, range, clamp } from '../core/utils.js';
import { rockProgress, rockWarning } from '../game/stage-hazards.js';

const C = {
  sky: [[0, '#1874c9'], [0.3, '#3a9ce0'], [0.6, '#86ccef'], [0.85, '#c8ecf6'], [1, '#effaf6']],
  sunCore: '#fffdf0',
  sunGlow: 'rgba(255, 249, 220, 0.6)',
  cloud: 'rgba(255, 255, 255, 0.82)',
  cloudShade: 'rgba(196, 220, 238, 0.7)',
  // The volcano, blue with distance: a lit east flank, a shaded west one,
  // green lower slopes, a dark crater.
  volcanoLit: [[0, '#6d7d93'], [0.55, '#5e7187'], [1, '#4f6d6b']],
  volcanoShade: [[0, '#4d5a6e'], [0.6, '#46566a'], [1, '#3f5a58']],
  ridge: 'rgba(40, 48, 62, 0.45)',
  ridgeLit: 'rgba(170, 186, 206, 0.28)',
  crater: '#2b2f3a',
  forest: 'rgba(58, 104, 80, 0.75)',
  haze: [[0, 'rgba(214, 238, 246, 0)'], [1, 'rgba(214, 238, 246, 0.72)']],
  lava: '#ff7a1a',
  lavaHot: '#ffd36a',
  steam: [238, 242, 246],
  ash: [74, 64, 62],
  // Distant land.
  island: '#4e8577',
  islandFar: '#7fae9f',
  headland: '#3f7a5c',
  headlandFar: '#6da08a',
  // The sea, deep at the horizon to turquoise in the shallows.
  sea: [[0, '#0d6aa6'], [0.45, '#1590b8'], [0.8, '#2ab7c4'], [1, '#62d7cf']],
  swell: 'rgba(235, 252, 255, 0.55)',
  swellShade: 'rgba(8, 82, 120, 0.28)',
  glint: 'rgba(255, 255, 248, 0.85)',
  horizon: 'rgba(230, 248, 252, 0.6)',
  foam: 'rgba(255, 255, 255, 0.92)',
  foamSoft: 'rgba(255, 255, 255, 0.45)',
  wetSand: [[0, '#a98a5c'], [1, '#c9a46c']],
  wetShine: 'rgba(220, 240, 245, 0.28)',
  // The beach: wet near the water, golden where the fighters stand,
  // a little paler toward the viewer.
  sand: [[0, '#d9b277'], [0.25, '#efcd8f'], [0.6, '#f3d69c'], [1, '#e9c487']],
  ripple: 'rgba(170, 120, 62, 0.22)',
  rippleLight: 'rgba(255, 242, 214, 0.45)',
  pebble: 'rgba(122, 98, 78, 0.5)',
  shell: '#fbe9dc',
  shellPink: '#f2b9a6',
  // Palms.
  trunk: '#7a5636',
  trunkRing: 'rgba(60, 38, 22, 0.5)',
  frond: '#2f7d47',
  frondLit: '#4fa25a',
  grass: '#5b8f43',
  // Hazards.
  warn: '#ff1f1f',
  warnFill: 'rgba(255, 32, 32, ',
  rock: '#2b2523',
  rockCrack: '#ff6a12',
  rockHot: '#ffc04a',
  dust: [222, 196, 150],
  spray: '#ffffff',
};

// Depths (parallax factors; the fighters stand at 1). The volcano's island
// is far out in the bay, the islands and headlands beyond the water, the
// shore a little way behind the fighters and the beach on past them toward
// the viewer.
const VOLCANO_F = 0.1;
const ISLAND_F = [0.16, 0.22];
const HEADLAND_F = 0.3;
const SHORE_F = 0.58;
const WET_F = 0.66;
// Camera height over the sand at the reference view (world units), as on
// every stage.
const RISE = 240;
// The volcano, in world units on its own plane: its base half-width, its
// height to the crater rim, the crater's half-width and depth.
// Its crater sits a fifth of the way down the view: clear of the HUD
// above, well above the fighters below.
const VOLCANO = { half: 4000, height: 2150, crater: 440, dip: 120 };
// Depth rows of sand ripples, shells and pebbles, from the wet sand to the
// front of the view.
const SAND_ROWS = [0.68, 0.72, 0.77, 0.82, 0.88, 0.94, 1.02, 1.1, 1.2, 1.32, 1.48, 1.7, 2];
// The swells rolling in, and how long one takes from far out to the shore.
const SWELLS = 9;
const SWELL_SECONDS = 9;
// The rock's drawn path: it leaves the crater, bows `arc` upward and lands;
// its scale from the crater (tiny with distance) to the sand.
const ROCK_START_SCALE = 0.18;

const lerp = (a, b, k) => a + (b - a) * k;
const frac = (x) => x - Math.floor(x);

export class AdamarisTheme extends StageTheme {
  constructor(map, opts = {}) {
    super(map, opts);
    // Bright overhead sun: short, crisp shadows.
    this.shadow = { alpha: 0.28, skew: 0, stretch: 1.1 };
    this.persp = this.perspective(RISE);
    // The live stage hazards (the Arena's or a preview's), else none: a
    // still volcano.
    this.hazards = opts.hazards ?? null;
    this.centerX = (map.mainStage.left + map.mainStage.right) / 2;
    this.build();
  }

  // The volcano's live state (or a dormant one with no hazards).
  get volcano() {
    return this.hazards?.volcano ?? null;
  }

  // How hard it is erupting, 0 (dormant) to 1, from its simulated glow.
  get eruption() {
    const v = this.volcano;
    return v ? clamp((v.glow - 0.08) / 0.92, 0, 1) : 0;
  }

  build() {
    const rng = mulberry32(0xada3a5);
    const m = this.map;
    const G = this.groundY;
    const cb = m.cameraBounds;
    const cx = this.centerX;

    // Sky cumulus: screen-space, as fractions of the view.
    this.clouds = Array.from({ length: 9 }, () => {
      const n = 5 + Math.floor(rng() * 4);
      const puffs = Array.from({ length: n }, (_, i) => ({
        dx: (i / (n - 1) - 0.5) * range(rng, 0.8, 1.1), dy: -range(rng, 0, 0.5) * Math.sin(Math.PI * (i / (n - 1))), r: range(rng, 0.28, 0.5),
      }));
      return { x: rng(), y: range(rng, 0.05, 0.28), w: range(rng, 0.06, 0.12), speed: range(rng, 0.003, 0.008), puffs, a: range(rng, 0.55, 0.9) };
    });

    this.buildVolcano(rng, cx, G);

    // Small islands far out on the water, either side of the volcano.
    this.islands = [];
    for (const [x, w, h, f] of [[cx - 9800, 1900, 260, ISLAND_F[0]], [cx + 10600, 2600, 340, ISLAND_F[0]], [cx - 6200, 900, 150, ISLAND_F[1]], [cx + 6800, 1200, 120, ISLAND_F[1]]]) {
      this.islands.push({ f, path: this.hillPath(rng, x, w, h, G), far: f < 0.2 });
    }
    // Green headlands closing the bay at both ends of the view.
    this.headlands = [];
    for (const side of [-1, 1]) {
      const x = cx + side * 5200;
      this.headlands.push({ path: this.hillPath(rng, x, 3600, 420, G, side), f: HEADLAND_F });
    }

    // Sea glints: fixed places on the water, each twinkling on its own.
    this.glints = Array.from({ length: 70 }, () => ({ u: rng(), d: rng() ** 1.6, w: range(rng, 6, 22), p: rng() * 6.3, speed: range(rng, 1.5, 3.5) }));
    // The swells' shapes.
    this.swells = Array.from({ length: SWELLS }, () => ({ k: range(rng, 0.004, 0.009), p: rng() * 6.3, amp: range(rng, 5, 10) }));

    this.buildSand(rng, cb, G);
    this.buildPalms(rng, G);

    // Smoke puffs and lava sparks: fixed seeds, moved by the clock.
    this.steam = Array.from({ length: 18 }, (_, i) => ({ p: i / 18, sx: range(rng, -1, 1), r: range(rng, 0.8, 1.3), wob: rng() * 6.3 }));
    this.ash = Array.from({ length: 34 }, (_, i) => ({ p: i / 34, sx: range(rng, -1, 1), r: range(rng, 0.7, 1.4), wob: rng() * 6.3 }));
    this.sparks = Array.from({ length: 46 }, (_, i) => ({ p: i / 46, vx: range(rng, -620, 620), vy: range(rng, 1600, 2900), size: range(rng, 18, 40) }));
    this.flows = this.buildFlows(rng, cx, G);

    // Atmosphere: sea spray and sand blowing low over the beach, ash in the
    // air while the volcano erupts.
    const prng = mulberry32(0xada5);
    this.spray = new ParticleField(prng, this.reducedMotion ? 8 : 26, { speed: [8, 26], size: [0.6, 1.4], drift: [-3, 2], depth: [0.9, 1.2], alpha: [0.2, 0.5], band: [0.45, 0.62] });
    this.sandDrift = new ParticleField(prng, this.reducedMotion ? 8 : 24, { speed: [30, 80], size: [0.6, 1.3], drift: [-1, 1], depth: [1, 1.2], alpha: [0.15, 0.35], band: [0.75, 0.98] });
    this.ashFall = new ParticleField(prng, this.reducedMotion ? 12 : 48, { speed: [12, 40], size: [0.8, 2], drift: [16, 34], depth: [0.9, 1.3], alpha: [0.25, 0.6], band: [0, 1] });
  }

  // A low hill or island silhouette over [x - w/2, x + w/2] on the sea at
  // G, up to `h` tall; `lean` skews its peak toward one end (a headland).
  hillPath(rng, x, w, h, G, lean = 0) {
    const path = new Path2D();
    const n = 14;
    path.moveTo(x - w / 2, G + 4);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const peak = lean ? (lean > 0 ? u ** 0.6 : (1 - u) ** 0.6) : Math.sin(Math.PI * u) ** 0.8;
      const y = G - h * peak * (0.82 + 0.18 * rng()) * (lean ? Math.sin(Math.PI * Math.min(1, u * 1.1 + (lean > 0 ? 0 : -0.1))) ** 0.3 : 1);
      path.lineTo(x - w / 2 + w * u, Math.min(G, y));
    }
    path.lineTo(x + w / 2, G + 4);
    path.closePath();
    return path;
  }

  // The volcano's silhouette on its plane: concave flanks steepening to a
  // jagged crater rim, the crater's notch, a lit east half and a shaded west
  // one split along its ridge line, gullies running down from the rim, and
  // forest on its lower slopes.
  buildVolcano(rng, cx, G) {
    const { half, height, crater, dip } = VOLCANO;
    const top = G - height;
    const left = [];
    const right = [];
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const rise = u ** 1.85;
      const jag = i > 0 && i < n ? (rng() - 0.5) * 70 * (1 - u * 0.6) : 0;
      left.push([cx - crater - (half - crater) * (1 - u), G - height * rise + jag]);
      right.push([cx + crater + (half - crater) * (1 - u), G - height * rise + (i > 0 && i < n ? (rng() - 0.5) * 70 * (1 - u * 0.6) : 0)]);
    }
    const rim = [
      [cx - crater, top], [cx - crater * 0.7, top - 40], [cx - crater * 0.35, top + 20],
      [cx, top + 10], [cx + crater * 0.4, top - 30], [cx + crater * 0.75, top + 15], [cx + crater, top],
    ];
    const outline = new Path2D();
    outline.moveTo(cx - half - 400, G + 6);
    for (const [x, y] of left) outline.lineTo(x, y);
    for (const [x, y] of rim) outline.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) outline.lineTo(right[i][0], right[i][1]);
    outline.lineTo(cx + half + 400, G + 6);
    outline.closePath();
    this.volcanoPath = outline;
    // The lit east half: from the crater's middle down a wandering ridge.
    const lit = new Path2D();
    lit.moveTo(cx + 40, top + 10);
    let ry = top + 10;
    let rx = cx + 40;
    while (ry < G) {
      ry += range(rng, 120, 260);
      rx += range(rng, -110, 160);
      lit.lineTo(rx, Math.min(G + 6, ry));
    }
    lit.lineTo(cx + half + 400, G + 6);
    for (let i = 0; i < right.length; i++) lit.lineTo(right[i][0], right[i][1]);
    for (let i = rim.length - 1; i >= 0 && rim[i][0] > cx; i--) lit.lineTo(rim[i][0], rim[i][1]);
    lit.closePath();
    this.volcanoLit = lit;
    // The crater: a dark notch below the rim's lowest points.
    const c = new Path2D();
    c.moveTo(cx - crater * 0.85, top + 8);
    c.quadraticCurveTo(cx, top + dip, cx + crater * 0.85, top + 6);
    c.quadraticCurveTo(cx, top + dip * 0.25, cx - crater * 0.85, top + 8);
    c.closePath();
    this.crater = { path: c, x: cx, y: top + dip * 0.2 };
    // Gullies and ridges down the flanks from near the rim.
    this.gullies = new Path2D();
    this.ridgeLines = new Path2D();
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const start = range(rng, 0.05, 0.95);
      let x = cx + side * (crater * start + range(rng, 0, 260));
      let y = top + range(rng, 40, 300);
      const target = i % 3 === 0 ? this.ridgeLines : this.gullies;
      target.moveTo(x, y);
      const len = range(rng, 900, 2600);
      for (let d = 0; d < len && y < G - 60; d += range(rng, 120, 220)) {
        const slope = (y - top) / height;
        x += side * range(rng, 40, 140) * (1 + slope * 1.6);
        y += range(rng, 110, 210);
        target.lineTo(x, y);
      }
    }
    // Forest on the lower slopes: bumpy canopy along the foot.
    this.forest = new Path2D();
    this.forest.moveTo(cx - half - 400, G + 6);
    for (let x = cx - half - 400; x <= cx + half + 400; x += range(rng, 90, 200)) {
      const u = Math.abs(x - cx) / half;
      const foot = u >= 1 ? 0 : height * (1 - u) ** 1.85;
      const band = Math.min(foot, range(rng, 260, 520));
      this.forest.lineTo(x, G - band + range(rng, -30, 30));
    }
    this.forest.lineTo(cx + half + 400, G + 6);
    this.forest.closePath();
  }

  // Lava channels down the flanks from the crater (lit while it erupts).
  buildFlows(rng, cx, G) {
    const { height, crater } = VOLCANO;
    const top = G - height;
    const flows = new Path2D();
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      let x = cx + side * range(rng, crater * 0.3, crater * 0.95);
      let y = top + 20;
      flows.moveTo(x, y);
      const end = top + range(rng, 600, 1500);
      while (y < end) {
        const slope = (y - top) / height;
        x += side * range(rng, 30, 110) * (0.6 + slope * 2);
        y += range(rng, 60, 140);
        flows.lineTo(x, y);
      }
    }
    return flows;
  }

  // The beach's rows: in each, ripples, pebbles and shells across the whole
  // width any view at that depth can show, drawn on that row's plane.
  buildSand(rng, cb, G) {
    this.sandRows = SAND_ROWS.map((f) => {
      const x0 = this.centerX - (this.centerX - cb.left + 1400) / Math.min(1, f);
      const x1 = this.centerX + (cb.right - this.centerX + 1400) / Math.min(1, f);
      const dark = new Path2D();
      const light = new Path2D();
      const pebbles = new Path2D();
      const shells = new Path2D();
      const pink = new Path2D();
      const count = Math.round((x1 - x0) / 70);
      for (let i = 0; i < count; i++) {
        const rx = range(rng, x0, x1);
        const len = range(rng, 30, 120);
        const target = rng() < 0.55 ? dark : light;
        target.moveTo(rx, G);
        target.quadraticCurveTo(rx + len / 2, G - range(rng, 1.2, 3), rx + len, G);
      }
      for (let i = 0; i < count * 0.35; i++) pebbles.rect(range(rng, x0, x1), G - 2, range(rng, 2, 5), range(rng, 1.4, 2.8));
      for (let i = 0; i < count * 0.06; i++) {
        const sx = range(rng, x0, x1);
        const r = range(rng, 2.5, 5);
        const target = rng() < 0.4 ? pink : shells;
        target.moveTo(sx + r, G - 1);
        target.ellipse(sx, G - 1, r, r * 0.55, 0, Math.PI, 0);
        target.closePath();
      }
      return { f, dark, light, pebbles, shells, pink };
    }).reverse();
  }

  // Palms leaning in at the beach's sides (behind the fighters' plane),
  // with tufts of beach grass round their feet. Each on its own plane.
  buildPalms(rng, G) {
    const { left, right } = this.map.mainStage;
    const spots = [
      [left - 230, 0.86, 1], [left - 470, 0.76, 1], [left - 760, 0.9, 1], [left - 1100, 0.72, 1],
      [right + 230, 0.84, -1], [right + 520, 0.74, -1], [right + 820, 0.9, -1], [right + 1150, 0.7, -1],
    ];
    this.palms = spots.map(([x, f, lean]) => {
      const h = range(rng, 360, 470);
      const bend = lean * range(rng, 60, 120);
      const trunk = new Path2D();
      const rings = new Path2D();
      const tx = x + bend;
      const ty = G - h;
      const w0 = 13;
      const w1 = 7;
      trunk.moveTo(x - w0, G);
      trunk.quadraticCurveTo(x - w0 + bend * 0.15, G - h * 0.55, tx - w1, ty);
      trunk.lineTo(tx + w1, ty);
      trunk.quadraticCurveTo(x + w0 + bend * 0.15, G - h * 0.55, x + w0, G);
      trunk.closePath();
      for (let k = 1; k < 14; k++) {
        const u = k / 14;
        const cx = lerp(x, tx, u * u * 0.9 + u * 0.1);
        const cy = G - h * u;
        const w = lerp(w0, w1, u);
        rings.moveTo(cx - w, cy);
        rings.lineTo(cx + w, cy + 3);
      }
      const fronds = [];
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI / 2 + (k / 7 - 0.5) * 3.4 + range(rng, -0.12, 0.12);
        const len = range(rng, 150, 210);
        fronds.push({ a, len, droop: range(rng, 0.35, 0.6) });
      }
      const grass = new Path2D();
      for (let k = 0; k < 14; k++) {
        const gx = x + range(rng, -90, 90);
        const gh = range(rng, 14, 34);
        grass.moveTo(gx - 4, G);
        grass.quadraticCurveTo(gx + range(rng, -6, 6), G - gh * 0.6, gx + range(rng, -10, 10), G - gh);
        grass.quadraticCurveTo(gx + 2, G - gh * 0.5, gx + 4, G);
      }
      return { x, f, tx, ty, trunk, rings, fronds, grass, phase: rng() * 6.3 };
    }).sort((a, b) => a.f - b.f);
  }

  resize(view) {
    const ctx = view.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, view.pxH);
    for (const [at, color] of C.sky) g.addColorStop(at, color);
    this.skyGrad = g;
    if (this.gradCtx !== ctx) {
      this.gradCtx = ctx;
      const G = this.groundY;
      const top = G - VOLCANO.height;
      this.volcanoLitGrad = this.worldGradient(ctx, top, G, C.volcanoLit);
      this.volcanoShadeGrad = this.worldGradient(ctx, top, G, C.volcanoShade);
      this.volcanoHaze = this.worldGradient(ctx, G - VOLCANO.height * 0.55, G, C.haze);
    }
  }

  update(dt, view) {
    super.update(dt);
    if (view?.w > 0) {
      this.spray.update(dt, view);
      this.sandDrift.update(dt, view);
      if (this.eruption > 0.05) this.ashFall.update(dt, view);
    }
  }

  worldGradient(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  // Screen y (device pixels) of the ground's plane at depth f (the sea
  // and the beach both lie in it).
  groundAt(view, f) {
    return this.persp.y(view, this.groundY, f);
  }

  // ---- Background ---------------------------------------------------------------

  drawBackground(ctx, view) {
    if (!this.volcanoLitGrad) this.resize(view);
    const s = view.scale;
    const t = this.reducedMotion ? 0 : this.time;
    const erupt = this.eruption;

    // Sky, its warmth deepening under an eruption.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, view.pxW, view.pxH);
    if (erupt > 0.02) {
      const warm = ctx.createLinearGradient(0, 0, 0, view.pxH * 0.5);
      warm.addColorStop(0, `rgba(120, 60, 50, ${0.18 * erupt})`);
      warm.addColorStop(1, `rgba(255, 140, 70, ${0.16 * erupt})`);
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, view.pxW, view.pxH * 0.5);
    }
    // The sun, high on the right.
    const sx = view.pxW * 0.82 - view.x * s * 0.01;
    const sy = view.pxH * 0.12;
    const sr = 26 * s;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 7);
    glow.addColorStop(0, C.sunGlow);
    glow.addColorStop(1, 'rgba(255, 249, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - sr * 7, sy - sr * 7, sr * 14, sr * 14);
    ctx.fillStyle = C.sunCore;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    this.drawClouds(ctx, view, t);

    const horizon = this.groundAt(view, 0);
    // Distant islands and headlands.
    for (const isl of this.islands) {
      this.persp.plane(ctx, view, isl.f);
      ctx.fillStyle = isl.far ? C.islandFar : C.island;
      ctx.fill(isl.path);
    }
    this.drawVolcano(ctx, view, t);
    for (const h of this.headlands) {
      this.persp.plane(ctx, view, h.f);
      ctx.fillStyle = C.headlandFar;
      ctx.fill(h.path);
    }
    this.drawSea(ctx, view, t, horizon);
  }

  drawClouds(ctx, view, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = view.pxW;
    const H = view.pxH;
    for (const c of this.clouds) {
      const x = (frac(c.x + t * c.speed * 0.2 - view.x * view.scale * 0.00002) * 1.4 - 0.2) * W;
      const y = c.y * H;
      const w = c.w * W;
      ctx.globalAlpha = c.a;
      for (const [fill, dy] of [[C.cloudShade, 0.12], [C.cloud, 0]]) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        for (const p of c.puffs) {
          const r = p.r * w * 0.5;
          const px = x + p.dx * w;
          const py = y + (p.dy * w * 0.5) + dy * w * 0.3;
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // The volcano on its plane: its flanks, forest, gullies, haze, then its
  // crater's glow, lava and plume by how hard it is erupting.
  drawVolcano(ctx, view, t) {
    const p = this.persp;
    const erupt = this.eruption;
    const glow = this.volcano?.glow ?? 0.08;
    const cr = this.crater;
    p.plane(ctx, view, VOLCANO_F);
    // Smoke behind the cone first (the steam that rises behind its rim).
    this.drawPlume(ctx, t, erupt, true);
    ctx.fillStyle = this.volcanoShadeGrad;
    ctx.fill(this.volcanoPath);
    ctx.fillStyle = this.volcanoLitGrad;
    ctx.fill(this.volcanoLit);
    ctx.fillStyle = C.forest;
    ctx.save();
    ctx.clip(this.volcanoPath);
    ctx.fill(this.forest);
    ctx.lineWidth = 26;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ridge;
    ctx.stroke(this.gullies);
    ctx.strokeStyle = C.ridgeLit;
    ctx.stroke(this.ridgeLines);
    // Lava down the channels while it erupts.
    if (glow > 0.2) {
      const k = clamp((glow - 0.2) / 0.8, 0, 1);
      ctx.strokeStyle = `rgba(255, 110, 30, ${0.25 * k})`;
      ctx.lineWidth = 120;
      ctx.stroke(this.flows);
      ctx.strokeStyle = `rgba(255, 150, 50, ${0.85 * k})`;
      ctx.lineWidth = 34;
      ctx.stroke(this.flows);
      ctx.strokeStyle = `rgba(255, 230, 140, ${0.7 * k})`;
      ctx.lineWidth = 10;
      ctx.stroke(this.flows);
    }
    ctx.fillStyle = this.volcanoHaze;
    ctx.fillRect(cr.x - VOLCANO.half - 500, this.groundY - VOLCANO.height, (VOLCANO.half + 500) * 2, VOLCANO.height + 10);
    ctx.restore();
    // The crater: dark, and glowing from within as it wakes.
    ctx.fillStyle = C.crater;
    ctx.fill(cr.path);
    const glowR = 900 + 900 * glow;
    const gr = ctx.createRadialGradient(cr.x, cr.y + 40, 20, cr.x, cr.y, glowR);
    gr.addColorStop(0, `rgba(255, 220, 120, ${Math.min(1, glow * 1.1)})`);
    gr.addColorStop(0.25, `rgba(255, 110, 30, ${0.75 * glow})`);
    gr.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = gr;
    ctx.fillRect(cr.x - glowR - 50, cr.y - glowR - 50, glowR * 2 + 100, glowR * 2 + 100);
    if (glow > 0.12) {
      ctx.fillStyle = `rgba(255, 140, 40, ${Math.min(1, glow)})`;
      ctx.fill(cr.path);
    }
    this.drawSparks(ctx, t, erupt);
    this.drawPlume(ctx, t, erupt, false);
  }

  // The plume: steam (always a little) and, while erupting, ash, billowing
  // up and drifting east, lit orange from beneath near the crater. `back`
  // draws the half behind the cone.
  drawPlume(ctx, t, erupt, back) {
    const cr = this.crater;
    const rise = this.reducedMotion ? 0.4 : 1;
    const sets = [[this.steam, C.steam, 0.05, 1500, 140, 0.22 + 0.2 * erupt]];
    if (erupt > 0.02) sets.push([this.ash, C.ash, 0.07 + 0.05 * erupt, 2600 + 3200 * erupt, 260 + 260 * erupt, 0.75 * erupt]);
    for (const [puffs, rgb, speed, height, size, alpha] of sets) {
      for (let i = 0; i < puffs.length; i++) {
        if ((i % 2 === 0) !== back) continue;
        const q = puffs[i];
        const k = this.reducedMotion ? q.p : frac(q.p + t * speed);
        const y = cr.y - height * k * rise - 40;
        const x = cr.x + q.sx * 180 * (0.4 + k) + k * k * 1300 + Math.sin(t * 0.6 + q.wob) * 60 * k;
        const r = size * q.r * (0.5 + 1.6 * k);
        const a = alpha * Math.min(1, k * 8) * (1 - k) ** 1.2;
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (rgb === C.ash && k < 0.35) {
          ctx.fillStyle = `rgba(255, 120, 40, ${a * 0.6 * (1 - k / 0.35)})`;
          ctx.beginPath();
          ctx.arc(x, y + r * 0.3, r * 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Lava thrown up out of the crater while it erupts hard: glowing gobs on
  // short arcs, falling back onto the cone.
  drawSparks(ctx, t, erupt) {
    const phase = this.volcano?.phase;
    const strength = phase === 'burst' ? 1 : phase === 'active' ? 0.75 : phase === 'buildup' ? 0.15 * erupt : 0.25 * erupt;
    if (strength <= 0.02) return;
    const cr = this.crater;
    const g = 3600;
    for (const sp of this.sparks) {
      const k = this.reducedMotion ? sp.p : frac(sp.p + t * 0.7);
      const time = k * 1.3;
      const x = cr.x + sp.vx * time;
      const y = cr.y - sp.vy * time + 0.5 * g * time * time;
      if (y > cr.y + 500) continue;
      ctx.globalAlpha = strength * (1 - k) ** 0.6;
      ctx.fillStyle = k < 0.4 ? C.lavaHot : C.lava;
      ctx.beginPath();
      ctx.arc(x, y, sp.size * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The sea from the horizon to the shore: its colour deepening with
  // distance, swells rolling in, glints, the volcano's glow mirrored under
  // it, then the band of wet sand and the foam at the water's edge washing
  // up and back.
  drawSea(ctx, view, t, horizon) {
    const s = view.scale;
    const W = view.pxW;
    const wash = this.reducedMotion ? 0 : Math.sin(t * 0.7) * 0.012 + Math.sin(t * 1.9) * 0.004;
    const shore = this.groundAt(view, SHORE_F + wash);
    const wet = this.groundAt(view, WET_F);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sea = ctx.createLinearGradient(0, horizon, 0, Math.max(horizon + 1, shore));
    for (const [at, color] of C.sea) sea.addColorStop(at, color);
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, W, shore - horizon + 1);
    // The horizon's bright line.
    ctx.fillStyle = C.horizon;
    ctx.fillRect(0, horizon - Math.max(1, s), W, Math.max(1.5, 2 * s));
    // The volcano's glow on the water.
    const glow = this.volcano?.glow ?? 0.08;
    if (glow > 0.15) {
      const cx = this.persp.x(view, this.centerX, VOLCANO_F);
      const k = clamp((glow - 0.15) / 0.85, 0, 1);
      const rg = ctx.createLinearGradient(0, horizon, 0, shore);
      rg.addColorStop(0, `rgba(255, 140, 50, ${0.55 * k})`);
      rg.addColorStop(1, 'rgba(255, 140, 50, 0)');
      ctx.fillStyle = rg;
      const w = 70 * s;
      const rows = 40;
      const rowH = Math.max(1, (shore - horizon) / rows);
      for (let i = 0; i < rows; i++) {
        const y = horizon + rowH * i;
        const wob = this.reducedMotion ? 0 : Math.sin(t * 2.2 + i * 0.9) * 6 * s;
        const ww = w * (0.45 + 0.35 * Math.sin(i * 1.3 + t * 1.5) ** 2) * (1 + (i / rows) * 0.8);
        ctx.fillRect(cx - ww / 2 + wob, y, ww, rowH * 0.6);
      }
    }
    // Swells: lines across the water, each rolling in from far out to the
    // shore, wider apart and brighter as they near it.
    ctx.lineCap = 'round';
    for (let i = 0; i < SWELLS; i++) {
      const sw = this.swells[i];
      const k = this.reducedMotion ? (i + 0.5) / SWELLS : frac(i / SWELLS + t / SWELL_SECONDS);
      const z = lerp(1 / 0.13, 1 / (SHORE_F + 0.01), k ** 0.8);
      const f = 1 / z;
      const y = this.groundAt(view, f);
      if (y > shore - 1) continue;
      const amp = sw.amp * f * s * 0.6;
      ctx.beginPath();
      const step = 18 * s;
      for (let x = -step; x <= W + step; x += step) {
        const wx = view.x + view.w / 2 + (x / s - view.w / 2) / f;
        const yy = y + Math.sin(wx * sw.k + sw.p + t * 0.4) * amp;
        if (x === -step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = C.swellShade;
      ctx.lineWidth = Math.max(1, 3.5 * f * s);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.strokeStyle = C.swell;
      ctx.lineWidth = Math.max(1, 2 * f * s);
      ctx.translate(0, -Math.max(1, 1.5 * f * s));
      ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Glints.
    ctx.fillStyle = C.glint;
    for (const g of this.glints) {
      const tw = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * g.speed + g.p);
      if (tw < 0.55) continue;
      const f = lerp(0.12, SHORE_F, g.d);
      const y = this.groundAt(view, f);
      if (y > shore - 2) continue;
      const wx = this.centerX + (g.u - 0.5) * 9000;
      const x = this.persp.x(view, wx, f);
      if (x < -40 || x > W + 40) continue;
      ctx.globalAlpha = (tw - 0.55) / 0.45;
      ctx.fillRect(x, y, g.w * f * s, Math.max(1, 1.4 * f * s));
    }
    ctx.globalAlpha = 1;
    // Wet sand, glossy where the water just left it.
    const wg = ctx.createLinearGradient(0, shore, 0, Math.max(shore + 1, wet));
    for (const [at, color] of C.wetSand) wg.addColorStop(at, color);
    ctx.fillStyle = wg;
    ctx.fillRect(0, shore, W, wet - shore + 1);
    ctx.fillStyle = C.wetShine;
    ctx.fillRect(0, shore, W, Math.max(1, (wet - shore) * 0.4));
    // Foam along the water's edge, and a fainter line of it just seaward.
    for (const [dy, style, width] of [[-(wet - shore) * 0.35, C.foamSoft, 2.2], [0, C.foam, 3.2]]) {
      ctx.beginPath();
      const step = 14 * s;
      for (let x = -step; x <= W + step; x += step) {
        const wx = view.x + view.w / 2 + (x / s - view.w / 2) / SHORE_F;
        const yy = shore + dy + Math.sin(wx * 0.012 + t * 0.9) * 2.4 * s + Math.sin(wx * 0.031 - t * 1.3) * 1.2 * s;
        if (x === -step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = Math.max(1, width * s * SHORE_F);
      ctx.stroke();
    }
  }

  // ---- Terrain -----------------------------------------------------------------

  // The beach (the ground itself, running past every side of the view), the
  // palms at its sides, the red warnings where rocks will land, the
  // scorches of fresh impacts, and the rocks in flight.
  drawTerrain(ctx, view) {
    if (!this.volcanoLitGrad) this.resize(view);
    const t = this.reducedMotion ? 0 : this.time;
    const p = this.persp;
    const wet = this.groundAt(view, WET_F);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bottom = view.pxH;
    const sand = ctx.createLinearGradient(0, wet, 0, Math.max(wet + 1, bottom));
    for (const [at, color] of C.sand) sand.addColorStop(at, color);
    ctx.fillStyle = sand;
    ctx.fillRect(0, wet, view.pxW, bottom - wet + 1);
    // Sand rows, deepest first.
    for (const row of this.sandRows) {
      const y = this.groundAt(view, row.f);
      if (y < wet - 2 || y > bottom + 20) continue;
      p.plane(ctx, view, row.f);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = C.ripple;
      ctx.stroke(row.dark);
      ctx.strokeStyle = C.rippleLight;
      ctx.stroke(row.light);
      ctx.fillStyle = C.pebble;
      ctx.fill(row.pebbles);
      ctx.fillStyle = C.shell;
      ctx.fill(row.shells);
      ctx.fillStyle = C.shellPink;
      ctx.fill(row.pink);
    }
    for (const palm of this.palms) this.drawPalm(ctx, view, palm, t);
    const hz = this.hazards;
    if (hz) {
      for (const e of hz.impacts) this.drawScorch(ctx, view, e);
      for (const r of hz.rocks) this.drawWarning(ctx, view, r, t);
      for (const r of hz.rocks) this.drawRock(ctx, view, r);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawPalm(ctx, view, palm, t) {
    this.persp.plane(ctx, view, palm.f);
    ctx.fillStyle = 'rgba(80, 60, 30, 0.18)';
    ctx.beginPath();
    ctx.ellipse(palm.x + (palm.tx - palm.x) * 0.5, this.groundY + 2, 120, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.grass;
    ctx.fill(palm.grass);
    ctx.fillStyle = C.trunk;
    ctx.fill(palm.trunk);
    ctx.strokeStyle = C.trunkRing;
    ctx.lineWidth = 2.2;
    ctx.stroke(palm.rings);
    const sway = Math.sin(t * 0.9 + palm.phase) * 0.05;
    for (const [color, width, shift] of [[C.frond, 15, 0], [C.frondLit, 7, -3]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const fr of palm.fronds) {
        const a = fr.a + sway;
        const ex = palm.tx + Math.cos(a) * fr.len;
        const ey = palm.ty + Math.sin(a) * fr.len * 0.55 + fr.len * fr.droop + shift;
        const mx = palm.tx + Math.cos(a) * fr.len * 0.55;
        const my = palm.ty + Math.sin(a) * fr.len * 0.6 - 20 + shift;
        ctx.moveTo(palm.tx, palm.ty + shift);
        ctx.quadraticCurveTo(mx, my, ex, ey);
      }
      ctx.stroke();
    }
    // Leaflets: short strokes along each frond.
    ctx.strokeStyle = C.frond;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const fr of palm.fronds) {
      const a = fr.a + sway;
      for (let k = 2; k < 9; k++) {
        const u = k / 9;
        const bx = palm.tx + Math.cos(a) * fr.len * u;
        const by = palm.ty + Math.sin(a) * fr.len * 0.6 * u + fr.len * fr.droop * u * u - 20 * Math.sin(Math.PI * u);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + 1.2) * 22, by + 26);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a - 1.2) * 22, by + 26);
      }
    }
    ctx.stroke();
    ctx.fillStyle = '#5a3f22';
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(palm.tx + 12 * (k - 1) + 8, palm.ty + 10);
      ctx.arc(palm.tx + 12 * (k - 1), palm.ty + 10, 8, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // A rock's red warning: a glowing ring at exactly its impact's reach on
  // the sand (its radius, in the ground's perspective at the fighters'
  // depth), a translucent red interior, an inner ring closing in as the
  // rock comes, and the rock's growing shadow, all brighter as it nears.
  // With reduced motion it holds still, as bright as it gets.
  drawWarning(ctx, view, r, t) {
    const k = rockWarning(r);
    if (k === null) return;
    const s = view.scale;
    const [x, y] = this.persp.point(view, r.x, this.groundY, 1, this.pt ??= [0, 0]);
    const rx = r.radius * s;
    const ry = rx * 0.32;
    const still = this.reducedMotion;
    const pulse = still ? 1 : 0.75 + 0.25 * Math.sin(t * (8 + 14 * k));
    const appear = still ? 1 : Math.min(1, k * 6);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = appear;
    ctx.fillStyle = `${C.warnFill}${(0.16 + 0.22 * (still ? 1 : k)) * pulse})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // The rock's shadow, growing as it falls.
    ctx.fillStyle = `rgba(60, 0, 0, ${0.15 + 0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * (0.2 + 0.5 * k), ry * (0.2 + 0.5 * k), 0, 0, Math.PI * 2);
    ctx.fill();
    // The outer ring: a soft glow under a crisp bright line.
    ctx.strokeStyle = `rgba(255, 40, 40, ${0.35 * pulse})`;
    ctx.lineWidth = Math.max(3, 7 * s);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = Math.max(1.5, 2.6 * s);
    ctx.stroke();
    // The inner ring, closing in on the impact.
    if (!still) {
      const c = 1 - k;
      ctx.strokeStyle = `rgba(255, 90, 80, ${0.9 * pulse})`;
      ctx.lineWidth = Math.max(1, 1.8 * s);
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(1, rx * c), Math.max(1, ry * c), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Where rock `r` is drawn at `u` (0 at the crater, 1 on the sand): a
  // screen point and a scale. It leaves the volcano's crater (wherever the
  // view puts it now), bows upward and comes down at exactly its landing,
  // growing from tiny with distance to its full size.
  rockPoint(view, r, u, out) {
    const s = view.scale;
    const cr = this.crater;
    const cx = this.persp.x(view, cr.x, VOLCANO_F);
    const cy = this.persp.y(view, cr.y, VOLCANO_F);
    // The crater as a point on the fighters' plane, then the path there.
    const sx = view.x + cx / s;
    const sy = view.y + cy / s;
    const e = u ** 1.35;
    const wx = lerp(sx, r.x, e);
    const wy = lerp(sy, this.groundY - (r.size === 'large' ? 26 : 15) * 0.6, e) - r.arc * 4 * u * (1 - u);
    out[0] = (wx - view.x) * s;
    out[1] = (wy - view.y) * s;
    out[2] = lerp(ROCK_START_SCALE, 1, u ** 1.6);
    return out;
  }

  // A rock in flight: its glowing trail back toward the crater, then the
  // rock itself, dark volcanic stone with molten cracks (a large one
  // brighter, edged in fire), turning as it flies.
  drawRock(ctx, view, r) {
    const u = rockProgress(r);
    if (u >= 1) return;
    const s = view.scale;
    const size = r.spec.size * s;
    const pt = this.rockPt ??= [0, 0, 0];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The trail.
    // A short glowing trail (a large rock's longer), tapering back along
    // the path it came by.
    const trail = r.size === 'large' ? 16 : 10;
    for (let i = trail; i >= 1; i--) {
      const uu = Math.max(0, u - i * 0.007);
      this.rockPoint(view, r, uu, pt);
      const k = 1 - i / (trail + 1);
      ctx.globalAlpha = 0.55 * k;
      ctx.fillStyle = i < trail * 0.35 ? C.rockHot : C.lava;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], Math.max(0.5, size * pt[2] * 0.7 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.rockPoint(view, r, u, pt);
    const [x, y, k] = pt;
    const rad = size * k;
    // A heat halo.
    const halo = ctx.createRadialGradient(x, y, rad * 0.4, x, y, rad * (r.size === 'large' ? 2.4 : 1.9));
    halo.addColorStop(0, 'rgba(255, 120, 30, 0.55)');
    halo.addColorStop(1, 'rgba(255, 90, 20, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - rad * 2.5, y - rad * 2.5, rad * 5, rad * 5);
    // The stone: a lumpy polygon, turning.
    ctx.translate(x, y);
    ctx.rotate(r.spin * r.renderAge);
    ctx.beginPath();
    const n = r.size === 'large' ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (0.78 + 0.22 * Math.sin(i * 2.7 + r.shape * 9));
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = C.rock;
    ctx.fill();
    if (r.size === 'large') {
      ctx.strokeStyle = 'rgba(255, 140, 40, 0.9)';
      ctx.lineWidth = Math.max(1, rad * 0.14);
      ctx.stroke();
    }
    // Molten cracks.
    ctx.strokeStyle = r.size === 'large' ? C.rockHot : C.rockCrack;
    ctx.lineWidth = Math.max(1, rad * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-rad * 0.5, -rad * 0.1);
    ctx.lineTo(-rad * 0.05, rad * 0.15);
    ctx.lineTo(rad * 0.4, -rad * 0.25);
    ctx.moveTo(-rad * 0.05, rad * 0.15);
    ctx.lineTo(rad * 0.1, rad * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  // A fresh impact's mark on the sand: a scorched patch and a shock ring
  // spreading out over it, in the ground's perspective.
  drawScorch(ctx, view, e) {
    const s = view.scale;
    const [x, y] = this.persp.point(view, e.x, this.groundY, 1, this.pt ??= [0, 0]);
    const k = e.age / e.life;
    const big = e.size === 'large';
    const rx = e.radius * s;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = (1 - k) * 0.6;
    ctx.fillStyle = '#5b3b22';
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.7, rx * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    const ring = rx * (0.5 + (big ? 1.4 : 1) * (1 - (1 - Math.min(1, k * 1.6)) ** 2));
    ctx.globalAlpha = (1 - Math.min(1, k * 1.6)) * 0.9;
    ctx.strokeStyle = '#fff1d8';
    ctx.lineWidth = Math.max(1.5, (big ? 4 : 2.6) * s);
    ctx.beginPath();
    ctx.ellipse(x, y, ring, ring * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Foreground ---------------------------------------------------------------

  // Impacts' bursts over the fighters (a flash, sand thrown up, volcanic
  // fragments and a dust cloud, bigger for a large rock), then the air:
  // spray, drifting sand and, while the volcano erupts, falling ash.
  drawForeground(ctx, view) {
    const hz = this.hazards;
    if (hz) for (const e of hz.impacts) this.drawImpact(ctx, view, e);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.spray.draw(ctx, view, C.spray);
    this.sandDrift.draw(ctx, view, '#fff3d6');
    const erupt = this.eruption;
    if (erupt > 0.05) {
      ctx.fillStyle = '#4a403c';
      const s = view.scale;
      for (const p of this.ashFall.items) {
        ctx.globalAlpha = p.alpha * erupt * 0.8;
        const r = Math.max(1, p.size * s * p.depth);
        ctx.fillRect(Math.round(p.x * view.pxW), Math.round(p.y * view.pxH), r, r);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawImpact(ctx, view, e) {
    const s = view.scale;
    const [x, y] = this.persp.point(view, e.x, this.groundY, 1, this.pt ??= [0, 0]);
    const k = Math.min(1, e.age / e.life);
    const big = e.size === 'large';
    const scale = (big ? 1.5 : 1) * s;
    const rnd = mulberry32(Math.floor(e.seed * 1000) >>> 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The flash.
    if (k < 0.3) {
      const a = 1 - k / 0.3;
      const g = ctx.createRadialGradient(x, y - 10 * scale, 0, x, y - 10 * scale, 80 * scale);
      g.addColorStop(0, `rgba(255, 250, 220, ${a})`);
      g.addColorStop(0.4, `rgba(255, 150, 50, ${0.7 * a})`);
      g.addColorStop(1, 'rgba(255, 110, 30, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 80 * scale, y - 90 * scale, 160 * scale, 160 * scale);
    }
    // The dust cloud, billowing out and fading.
    const [dr, dg, db] = C.dust;
    for (let i = 0; i < (big ? 9 : 6); i++) {
      const a = (i / (big ? 9 : 6)) * Math.PI + rnd() * 0.4;
      const spread = (30 + 60 * (1 - (1 - k) ** 2)) * scale;
      const px = x + Math.cos(a) * spread * (0.6 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1);
      const py = y - (12 + 30 * k + rnd() * 18) * scale;
      const r = (16 + 26 * k + rnd() * 10) * scale;
      ctx.fillStyle = `rgba(${dr}, ${dg}, ${db}, ${0.5 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sand and volcanic fragments thrown up and falling back.
    const time = k * e.life;
    for (let i = 0; i < (big ? 26 : 16); i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      const v = (180 + rnd() * 320) * (big ? 1.3 : 1);
      const fx = x + Math.cos(a) * v * time * s;
      const fy = y + (Math.sin(a) * v * time + 0.5 * 1400 * time * time) * s;
      if (fy > y + 4 * s) continue;
      const frag = i % 3 === 0;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = frag ? (i % 2 ? C.rockCrack : C.rock) : '#e8c98f';
      const size = (frag ? 3.5 : 2.2) * scale * (1 - k * 0.4);
      ctx.fillRect(fx - size / 2, fy - size / 2, size, size);
    }
    ctx.restore();
  }
}
