// JÖKULL — an ancient glacier hanging over an endless frozen abyss on a
// bitter polar day. Cold, vast and beautiful, a little dangerous: the
// fighters stand on one great block of snow-capped ice, and past its ledges
// there is only the drop. These are scene colours of the stage artwork, not
// part of the monochrome Alva interface palette.
//
// The background is flat parallax: a pale polar sky with a low sun diffused
// through icy cloud (and its halo), snow-covered ranges far off, glacial
// peaks and ice shelves nearer, frosty seracs and rock rising out of the
// abyss below the stage, and a cold haze thickening into the depths, so the
// glacier reads as standing over open air.
//
// The glacier is drawn in the shared one-point perspective
// (js/stages/perspective.js), section by section, from the live state of
// the stage (`hazards`, the Arena's StageHazards, see
// js/game/stage-hazards.js): its snowy top (wind-sculpted, with polished
// blue ice showing through, frost and drifts at its edges), its front face
// (layered blue-white ice, turquoise strata, trapped bubbles, ancient
// fractures, deep navy below) and its jagged underside. Three sections, one
// block: at full strength they join with no seam. Each breakable wing
// shows the cracks its controller has made, darker, wider and more
// connected as its contacts mount, each contact's stress flash and chips,
// a tremble once critically unstable, then its break: shaking with
// glowing cracks (critical), torn from the centre with its dark interior
// showing (separating), its pieces tumbling into the abyss with snow
// trailing behind them (collapsing), and nothing where it was (destroyed),
// the centre's face torn where it broke away. Nothing here decides
// anything: every contact, crack, phase and piece is the simulation's. A
// theme handed no live hazards (a roster thumbnail) draws the glacier whole
// and the weather calm.
//
// The weather: ambient snow in three depths, wind with gusts and drifting
// powder, and the blizzard (the live weather's `renderIntensity`): the wind
// rising, the snow thickening and turning to driving streaks, fog drawing
// in, the distant scenery fading out, a whiteout over the battle canvas
// that still leaves the glacier and fighters showing through (the HUD is
// never touched), and the cracks of a section about to break drawn again
// over it so the cue is never lost. With reduced motion the snow and wind
// slow right down, nothing shakes or flickers, and the storm is a steady
// veil; the ice's state, its cracks and its break still show, as gameplay
// does.

import { StageTheme } from './stage-theme.js';
import { fillQuad, quadGradient } from './perspective.js';
import { mulberry32, range, clamp } from '../core/utils.js';
import { iceUnderside } from '../game/stage-hazards.js';
import { ICE_SECTION_STATES } from '../data/stage-hazards.js';

const I = ICE_SECTION_STATES;

const C = {
  sky: [[0, '#6f97c2'], [0.35, '#9dbbd9'], [0.62, '#cbd9eb'], [0.85, '#e6ecf5'], [1, '#f1f4fa']],
  sunCore: '#fffdf6',
  sunGlow: 'rgba(255, 250, 238, 0.55)',
  halo: 'rgba(255, 255, 255, 0.22)',
  cirrus: 'rgba(250, 252, 255, 0.5)',
  // Ranges, cold blue with distance; snow on their upper slopes.
  farRange: '#b2c3d8',
  farRangeLit: '#c7d5e6',
  farSnow: '#eef3f9',
  range: '#8fa7c1',
  rangeLit: '#a9bdd3',
  rangeSnow: '#e9f0f7',
  // Ice shelves and glacial cliffs in the middle distance.
  shelf: '#bcd6e8',
  shelfShade: '#88abc6',
  shelfLine: 'rgba(80, 120, 160, 0.35)',
  shelfSnow: '#f2f7fc',
  plain: '#d3e1ee',
  plainLine: 'rgba(150, 178, 205, 0.45)',
  // Seracs and frosted rock rising out of the abyss.
  serac: '#7fb0cd',
  seracLit: '#b3d8ea',
  seracShade: '#4f7f9f',
  rock: '#4e5f75',
  rockSnow: '#dbe6f1',
  fog: 'rgba(226, 236, 246, ',
  abyss: [[0, 'rgba(206, 222, 238, 0)'], [0.3, 'rgba(176, 198, 222, 0.55)'], [0.7, 'rgba(92, 122, 158, 0.85)'], [1, '#2b4565']],
  // The glacier's top: snow, bluish at the back, bright toward the rim.
  topSnow: [[0, '#d7e3f0'], [0.55, '#eaf1f8'], [1, '#f8fbfe']],
  backRim: 'rgba(110, 140, 175, 0.5)',
  frontRim: '#ffffff',
  sastrugi: 'rgba(110, 142, 182, 0.42)',
  sastrugiLight: 'rgba(255, 255, 255, 0.85)',
  blueIce: 'rgba(110, 188, 226, 0.7)',
  blueIceRim: 'rgba(230, 248, 255, 0.7)',
  frost: 'rgba(255, 255, 255, 0.9)',
  drift: '#fbfdff',
  // The front face: snow cap, then blue-white ice down to deep navy.
  face: [[0, '#eaf6fc'], [0.06, '#bfe6f4'], [0.25, '#7fcbe0'], [0.5, '#3f9fbe'], [0.75, '#1f6c92'], [1, '#173f66']],
  faceSideLit: [[0, '#cdeaf6'], [1, '#2a6a90']],
  faceSideShade: [[0, '#8fb9d3'], [1, '#183e62']],
  interior: [[0, '#1d5d86'], [1, '#0c2a48']],
  strata: 'rgba(230, 248, 255, 0.35)',
  strataDark: 'rgba(16, 70, 110, 0.32)',
  shaft: 'rgba(240, 252, 255, 0.09)',
  bubble: 'rgba(236, 250, 255, 0.55)',
  ancient: 'rgba(214, 240, 252, 0.22)',
  cap: '#f7fbff',
  capShade: 'rgba(150, 190, 220, 0.45)',
  underside: 'rgba(12, 36, 60, 0.45)',
  // Damage.
  crackDark: [14, 52, 86],
  crackLight: [236, 252, 255],
  crackGlow: [130, 230, 255],
  stress: [190, 242, 255],
  chip: '#f4fcff',
  chipBlue: '#a8dcf0',
  // Weather.
  snow: '#ffffff',
  storm: [238, 243, 249],
};

// Depth of the glacier's top (back rim to front rim); the fighters stand at
// 1, just behind the front rim.
const GLACIER = { back: 0.64, front: 1.06 };
// Camera height over the glacier's top at the reference view (world units),
// as on every stage.
const RISE = 240;
// Depth rows of snow detail across the top.
const TOP_ROWS = 8;
// World units of wind per unit of wind strength (art).
const WIND_SPEED = 170;
// Ambient snow, far to near: how many flakes, their size (world units at
// the fighters' scale), fall speed, how much the wind takes them, their
// parallax and opacity. The storm's own driving snow is drawn only as it
// blows (STORM_FLAKES at full strength).
const SNOW_LAYERS = [
  { count: 110, size: [0.7, 1.3], fall: [14, 26], wind: 0.45, depth: 0.35, alpha: [0.35, 0.65] },
  { count: 80, size: [1.3, 2.2], fall: [30, 55], wind: 0.8, depth: 0.7, alpha: [0.5, 0.8] },
  { count: 36, size: [2.6, 4.6], fall: [60, 105], wind: 1.25, depth: 1.25, alpha: [0.6, 0.95] },
];
const STORM_FLAKES = 220;
// The whiteout's strength at full blizzard: over the background, over
// everything (the fighters included), and how much of a breaking section's
// cracks is drawn again over it.
const STORM_VEIL = { far: 0.72, near: 0.4, all: 0.42, cue: 0.6 };

const lerp = (a, b, k) => a + (b - a) * k;
const frac = (x) => x - Math.floor(x);

export class JokullTheme extends StageTheme {
  constructor(map, opts = {}) {
    super(map, opts);
    // A low polar sun on the left: long, cool shadows stretched right.
    this.shadow = { alpha: 0.22, skew: 0.9, stretch: 1.6 };
    this.persp = this.perspective(RISE);
    // The live stage hazards (the Arena's or a preview's), else none: the
    // glacier whole and the weather calm.
    this.hazards = opts.hazards ?? null;
    const m = map.mainStage;
    this.bottom = m.bottom;
    // The floor's sections, left to right (the whole main stage as one when
    // the map has none).
    const sections = map.ground?.sections ?? [{ id: 'main', left: m.left, right: m.right, breakable: false }];
    this.sections = sections.map((s) => ({ id: s.id, x0: s.left, x1: s.right, breakable: !!s.breakable }));
    this.faces = {};
    this.pt = [0, 0];
    this.outlines = new Map();
    this.build();
  }

  // The ice section controlling `sec`, if the theme has live hazards.
  controllerOf(sec) {
    return sec.breakable ? this.hazards?.iceFor?.(sec.id) ?? null : null;
  }

  // How strong the storm is now (0 calm to 1 full whiteout).
  get storm() {
    return this.hazards?.blizzard?.renderIntensity ?? 0;
  }

  // The wind's strength now (art): a steady breeze with gusts, rising hard
  // with the storm.
  get wind() {
    const t = this.reducedMotion ? 0 : this.time;
    const gust = 0.16 * Math.sin(t * 0.63) + 0.1 * Math.sin(t * 1.71 + 1.3) + 0.06 * Math.sin(t * 3.9 + 0.4);
    return 0.38 + gust + this.storm * 1.9;
  }

  build() {
    const rng = mulberry32(0x70cc011);
    const m = this.map;
    const G = this.groundY;
    const cb = m.cameraBounds;
    const bottom = cb.bottom + 900;
    const end = (p) => cb.right * p + 2600;

    // Sky: high icy cirrus, as fractions of the view.
    this.cirrus = Array.from({ length: 7 }, () => ({
      x: rng(), y: range(rng, 0.05, 0.32), w: range(rng, 0.18, 0.4), h: range(rng, 0.008, 0.02), speed: range(rng, 0.002, 0.006), a: range(rng, 0.35, 0.7),
    }));

    // Layer 1: far snowy ranges (parallax 0.08 and 0.16).
    this.far = this.buildRange(rng, { x0: -400, x1: end(0.08), baseY: G - 120, minH: 160, maxH: 380, bottom, snowline: 0.45 });
    this.near = this.buildRange(rng, { x0: -400, x1: end(0.16), baseY: G - 90, minH: 110, maxH: 260, bottom, snowline: 0.55 });

    // Layer 2: ice shelves and glacial cliffs (0.3).
    this.buildShelves(rng, end(0.3), G, bottom);

    // Layer 3: seracs and frosted rock rising out of the abyss (0.6).
    this.buildSeracs(rng, end(0.6), G);

    // Layer 4: the glacier's own detail (cached, world units).
    this.buildTop(rng);
    this.buildFace(rng);

    // Layer 5: the snow, each flake fixed in its layer (screen fractions),
    // and the storm's driving snow, all allocated once.
    const srng = mulberry32(0x5e0ff1);
    const scale = this.reducedMotion ? 0.4 : 1;
    this.snow = SNOW_LAYERS.map((layer) => ({
      ...layer,
      flakes: Array.from({ length: Math.round(layer.count * scale) }, () => ({
        x: srng(), y: srng(), size: range(srng, ...layer.size), fall: range(srng, ...layer.fall), drift: range(srng, -8, 8),
        alpha: range(srng, ...layer.alpha), phase: srng() * Math.PI * 2,
      })),
    }));
    this.stormFlakes = Array.from({ length: Math.round(STORM_FLAKES * scale) }, () => ({
      x: srng(), y: srng(), size: range(srng, 1.2, 3.6), speed: range(srng, 0.7, 1.4), lift: range(srng, -0.25, 0.35), alpha: range(srng, 0.35, 0.9), depth: range(srng, 0.6, 1.4),
    }));
    // Powder blowing low over the ice, and fog banks that roll through.
    this.powder = Array.from({ length: 14 }, () => ({ y: range(srng, -40, 6), len: range(srng, 120, 380), speed: range(srng, 0.7, 1.3), phase: srng(), a: range(srng, 0.15, 0.4) }));
    this.banks = Array.from({ length: 9 }, () => ({ y: range(srng, 0.15, 0.95), r: range(srng, 0.12, 0.3), speed: range(srng, 0.6, 1.3), phase: srng(), a: range(srng, 0.35, 0.8) }));
    this.lastCam = null;
  }

  // A snow-covered range: jagged peaks, each lit on its left (the sun's
  // side), with snow down to `snowline` of its height.
  buildRange(rng, { x0, x1, baseY, minH, maxH, bottom, snowline }) {
    const body = new Path2D();
    const lit = new Path2D();
    const snow = new Path2D();
    body.moveTo(x0, bottom);
    let x = x0;
    body.lineTo(x, baseY);
    while (x < x1) {
      const w = range(rng, 220, 520);
      const h = range(rng, minH, maxH);
      const peak = x + w * range(rng, 0.35, 0.65);
      const top = baseY - h;
      // Left flank up to the peak, right flank down, a few shoulders.
      const lf = [[x + (peak - x) * 0.35, baseY - h * range(rng, 0.25, 0.45)], [x + (peak - x) * 0.7, baseY - h * range(rng, 0.6, 0.8)], [peak, top]];
      const rf = [[peak + (x + w - peak) * 0.3, baseY - h * range(rng, 0.65, 0.85)], [peak + (x + w - peak) * 0.65, baseY - h * range(rng, 0.3, 0.5)], [x + w, baseY - range(rng, 0, 20)]];
      for (const [px, py] of [...lf, ...rf]) body.lineTo(px, py);
      // The lit flank: from the peak down its left side.
      lit.moveTo(peak, top);
      for (let i = lf.length - 2; i >= 0; i--) lit.lineTo(lf[i][0], lf[i][1]);
      lit.lineTo(x, baseY);
      lit.lineTo(peak + range(rng, -10, 30), baseY);
      lit.closePath();
      // Snow: the upper slopes, its lower edge ragged.
      const sl = top + h * snowline;
      const at = (pts, y) => {
        for (let i = 1; i < pts.length; i++) {
          if ((pts[i - 1][1] - y) * (pts[i][1] - y) <= 0) {
            const k = (y - pts[i - 1][1]) / ((pts[i][1] - pts[i - 1][1]) || 1);
            return pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k;
          }
        }
        return null;
      };
      const left = at([[x, baseY], ...lf], sl);
      const right = at([[peak, top], ...rf], sl);
      if (left !== null && right !== null) {
        snow.moveTo(peak, top);
        snow.lineTo(right, sl);
        for (let sx = right; sx > left; sx -= range(rng, 14, 30)) snow.lineTo(sx, sl + range(rng, -6, 26));
        snow.lineTo(left, sl);
        snow.closePath();
      }
      x += w;
    }
    body.lineTo(x, bottom);
    body.closePath();
    return { body, lit, snow };
  }

  // The frozen plain far below the ranges, a broad expanse of ice, and the
  // tabular ice shelves and glacial cliffs standing on it: flat tops, sheer
  // striated faces, snow along their edges.
  buildShelves(rng, x1, G, bottom) {
    this.shelf = new Path2D();
    this.shelfShade = new Path2D();
    this.shelfLines = new Path2D();
    this.shelfSnow = new Path2D();
    const base = G - 30;
    this.plainY = base;
    this.plain = new Path2D();
    this.plain.rect(-400, base, x1 + 800, bottom - base);
    this.plainLines = new Path2D();
    for (let i = 0; i < 40; i++) {
      const y = base + range(rng, 6, 120);
      const px = range(rng, -300, x1);
      this.plainLines.moveTo(px, y);
      this.plainLines.lineTo(px + range(rng, 80, 400), y + range(rng, -2, 2));
    }
    let x = -300;
    while (x < x1) {
      x += range(rng, 240, 700);
      const w = range(rng, 220, 640);
      const h = range(rng, 24, 80);
      const top = base - h;
      const face = new Path2D();
      face.moveTo(x, base);
      face.lineTo(x + range(rng, -8, 8), top + 12);
      face.lineTo(x + 18, top);
      for (let tx = x + 18; tx < x + w - 18; tx += range(rng, 40, 90)) face.lineTo(tx, top + range(rng, -4, 4));
      face.lineTo(x + w - 14, top);
      face.lineTo(x + w + range(rng, -6, 6), top + 14);
      face.lineTo(x + w, base);
      face.closePath();
      this.shelf.addPath(face);
      // The shaded end, away from the sun.
      this.shelfShade.moveTo(x + w * 0.78, top + 6);
      this.shelfShade.lineTo(x + w - 14, top);
      this.shelfShade.lineTo(x + w, top + 14);
      this.shelfShade.lineTo(x + w, base);
      this.shelfShade.lineTo(x + w * 0.74, base);
      this.shelfShade.closePath();
      for (let lx = x + range(rng, 14, 30); lx < x + w - 10; lx += range(rng, 18, 46)) {
        this.shelfLines.moveTo(lx, top + range(rng, 5, 10));
        this.shelfLines.lineTo(lx + range(rng, -4, 4), top + h * range(rng, 0.6, 1.1));
      }
      this.shelfSnow.rect(x + 10, top - 3, w - 22, range(rng, 4, 7));
      x += w;
    }
  }

  // Seracs (towers of broken glacier ice) and frosted rock rising out of
  // the abyss below the stage's level, their tops about level with it.
  buildSeracs(rng, x1, G) {
    this.seracs = [];
    this.rocks = new Path2D();
    this.rockSnow = new Path2D();
    const base = G + 420;
    let x = -200;
    while (x < x1) {
      x += range(rng, 260, 700);
      if (rng() < 0.35) {
        const w = range(rng, 90, 200);
        const h = range(rng, 280, 520);
        const top = base - h;
        this.rocks.moveTo(x - w / 2, base);
        this.rocks.lineTo(x - w * 0.42, top + h * 0.3);
        this.rocks.lineTo(x - w * 0.15, top + range(rng, 0, 20));
        this.rocks.lineTo(x + w * 0.2, top);
        this.rocks.lineTo(x + w * 0.46, top + h * 0.35);
        this.rocks.lineTo(x + w / 2, base);
        this.rocks.closePath();
        this.rockSnow.moveTo(x - w * 0.15, top + 2);
        this.rockSnow.lineTo(x + w * 0.2, top);
        this.rockSnow.lineTo(x + w * 0.3, top + 30);
        this.rockSnow.lineTo(x, top + 22);
        this.rockSnow.closePath();
      } else {
        // A serac: a leaning faceted prism of blue ice, lit on its left.
        const w = range(rng, 60, 150);
        const h = range(rng, 300, 560);
        const lean = range(rng, -40, 40);
        const top = base - h;
        const pts = [[x - w / 2, base], [x - w * 0.55 + lean * 0.6, top + h * 0.35], [x - w * 0.2 + lean, top], [x + w * 0.35 + lean, top + range(rng, 10, 40)], [x + w * 0.5 + lean * 0.5, top + h * 0.5], [x + w / 2, base]];
        const body = new Path2D();
        body.moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) body.lineTo(px, py);
        body.closePath();
        const lit = new Path2D();
        lit.moveTo(pts[0][0], pts[0][1]);
        lit.lineTo(pts[1][0], pts[1][1]);
        lit.lineTo(pts[2][0], pts[2][1]);
        lit.lineTo(x + lean * 0.4, base);
        lit.closePath();
        const cap = new Path2D();
        cap.moveTo(pts[2][0] - 4, pts[2][1] + 2);
        cap.lineTo(pts[3][0] + 4, pts[3][1] + 2);
        cap.lineTo(pts[3][0], pts[3][1] + 14);
        cap.lineTo(pts[2][0] + 6, pts[2][1] + 16);
        cap.closePath();
        this.seracs.push({ body, lit, cap });
      }
    }
  }

  // The glacier top's detail, in rows even in depth between its rims, each
  // across the whole glacier on its own plane: wind-sculpted ridges of snow
  // (sastrugi) lit on top, polished blue ice showing through, frost glints,
  // and drifts piled toward its outer ledges.
  buildTop(rng) {
    const { left, right } = this.map.mainStage;
    const G = this.groundY;
    const z0 = 1 / GLACIER.front;
    const dz = (1 / GLACIER.back - z0) / (TOP_ROWS + 1);
    this.topRows = [];
    for (let k = 1; k <= TOP_ROWS; k++) {
      const f = 1 / (z0 + k * dz);
      const ridges = new Path2D();
      const lights = new Path2D();
      const ice = new Path2D();
      const frost = new Path2D();
      const drifts = new Path2D();
      for (let i = 0; i < 16; i++) {
        const rx = range(rng, left + 10, right - 140);
        const len = range(rng, 50, 150);
        ridges.moveTo(rx, G);
        ridges.bezierCurveTo(rx + len * 0.3, G - range(rng, 2, 4), rx + len * 0.6, G + 1, rx + len, G);
        lights.moveTo(rx + 4, G - 1);
        lights.quadraticCurveTo(rx + len * 0.35, G - range(rng, 2.5, 4.5), rx + len * 0.65, G - 1);
      }
      for (let i = 0; i < 3; i++) {
        if (rng() < 0.45) continue;
        const ix = range(rng, left + 40, right - 40);
        const rw = range(rng, 18, 60);
        ice.moveTo(ix + rw, G);
        ice.ellipse(ix, G, rw, range(rng, 1.5, 3), 0, 0, Math.PI * 2);
      }
      for (let i = 0; i < 14; i++) frost.rect(range(rng, left + 4, right - 4), G - 1.5, range(rng, 1, 2.5), 1.2);
      for (const edge of [left, right]) {
        const dir = edge === left ? 1 : -1;
        const w = range(rng, 30, 70);
        drifts.moveTo(edge, G);
        drifts.quadraticCurveTo(edge + dir * w * 0.3, G - range(rng, 5, 9), edge + dir * w, G);
        drifts.closePath();
      }
      this.topRows.push({ f, ridges, lights, ice, frost, drifts });
    }
    // Deepest row first, so nearer art paints over it.
    this.topRows.reverse();
  }

  // The front face's detail, on the front plane in world units across the
  // whole glacier: the snow cap hanging over the rim, layered strata,
  // translucent shafts of light, trapped bubbles and thin ancient fractures.
  buildFace(rng) {
    const { left, right } = this.map.mainStage;
    const G = this.groundY;
    const B = this.bottom;
    this.cap = new Path2D();
    this.cap.moveTo(left - 2, G);
    this.cap.lineTo(right + 2, G);
    let x = right + 2;
    this.cap.lineTo(x, G + 8);
    while (x > left - 2) {
      const w = range(rng, 12, 30);
      const nx = Math.max(left - 2, x - w);
      this.cap.quadraticCurveTo((x + nx) / 2, G + range(rng, 12, 22), nx, G + range(rng, 7, 11));
      x = nx;
    }
    this.cap.closePath();
    this.strata = new Path2D();
    this.strataDark = new Path2D();
    for (let y = G + range(rng, 26, 40); y < B; y += range(rng, 18, 46)) {
      const target = rng() < 0.55 ? this.strata : this.strataDark;
      const t = range(rng, 1.5, 4);
      target.moveTo(left, y);
      for (let sx = left; sx <= right + 40; sx += 40) target.lineTo(sx, y + Math.sin(sx * 0.013 + y) * 3);
      for (let sx = Math.floor((right + 40 - left) / 40) * 40 + left; sx >= left; sx -= 40) target.lineTo(sx, y + t + Math.sin(sx * 0.013 + y) * 3);
      target.closePath();
    }
    // Light through the ice: tall tapering shafts.
    this.shafts = new Path2D();
    for (let i = 0; i < 14; i++) {
      const sx = range(rng, left, right);
      const w = range(rng, 8, 30);
      const h = (B - G) * range(rng, 0.35, 0.8);
      this.shafts.moveTo(sx, G + 12);
      this.shafts.lineTo(sx + w, G + 12);
      this.shafts.lineTo(sx + w * 0.6 + range(rng, -6, 6), G + 12 + h);
      this.shafts.lineTo(sx + w * 0.4 + range(rng, -6, 6), G + 12 + h);
      this.shafts.closePath();
    }
    this.bubbles = new Path2D();
    for (let i = 0; i < 120; i++) {
      const bx = range(rng, left + 4, right - 4);
      const by = G + range(rng, 24, B - G - 30);
      const r = range(rng, 0.8, 2.6);
      this.bubbles.moveTo(bx + r, by);
      this.bubbles.arc(bx, by, r, 0, Math.PI * 2);
    }
    this.ancient = new Path2D();
    for (let i = 0; i < 16; i++) {
      let ax = range(rng, left + 20, right - 20);
      let ay = G + range(rng, 30, 140);
      this.ancient.moveTo(ax, ay);
      for (let d = 0, len = range(rng, 60, 200); d < len; d += range(rng, 12, 24)) {
        ax += range(rng, -12, 18);
        ay += range(rng, 6, 20);
        this.ancient.lineTo(ax, ay);
      }
    }
  }

  resize(view) {
    const ctx = view.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, view.pxH);
    for (const [at, color] of C.sky) g.addColorStop(at, color);
    this.skyGrad = g;
    if (this.gradCtx !== ctx) {
      this.gradCtx = ctx;
      const G = this.groundY;
      this.faceGrad = this.worldGradient(ctx, G, this.bottom + 20, C.face);
      this.interiorGrad = this.worldGradient(ctx, G, this.bottom, C.interior);
    }
  }

  worldGradient(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  update(dt, view) {
    super.update(dt);
    if (view?.w > 0) this.updateSnow(dt, view);
  }

  // The snow drifts and falls on the wind, each layer at its own parallax
  // (screen fractions, wrapped round the view), carried against the
  // camera's own motion like the dust and sand of the other stages.
  updateSnow(dt, view) {
    const cam = this.lastCam;
    const dx = cam ? view.x - cam.x : 0;
    const dy = cam ? view.y - cam.y : 0;
    this.lastCam = { x: view.x, y: view.y };
    const slow = this.reducedMotion ? 0.25 : 1;
    const wind = this.wind;
    const storm = this.storm;
    const t = this.time;
    for (const layer of this.snow) {
      for (const p of layer.flakes) {
        const vx = (wind * WIND_SPEED * layer.wind + p.drift) * slow;
        const vy = p.fall * (1 + storm * 0.7) * slow + Math.sin(t * 1.3 + p.phase) * 6 * slow;
        p.x = wrap(p.x + (vx * dt - dx * layer.depth) / view.w);
        p.y = wrap(p.y + (vy * dt - dy * layer.depth) / view.h);
      }
    }
    if (storm > 0.01) {
      for (const p of this.stormFlakes) {
        const vx = wind * WIND_SPEED * 1.8 * p.speed * slow;
        const vy = (90 + 160 * p.lift) * slow;
        p.x = wrap(p.x + (vx * dt - dx * p.depth) / view.w);
        p.y = wrap(p.y + (vy * dt - dy * p.depth) / view.h);
      }
    }
  }

  // ---- Background ---------------------------------------------------------------

  drawBackground(ctx, view) {
    if (!this.faceGrad) this.resize(view);
    const G = this.groundY;
    const s = view.scale;
    const t = this.reducedMotion ? 0 : this.time;
    const storm = this.storm;

    // Layer 0 — sky, low sun through icy cloud, its halo, cirrus.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, view.pxW, view.pxH);
    const sunX = view.pxW * 0.26 - view.x * s * 0.015;
    const sunY = (G - 420 - (this.refY + (view.y - this.refY) * 0.05)) * s;
    const r = 24 * s;
    const glow = ctx.createRadialGradient(sunX, sunY, r * 0.3, sunX, sunY, r * 9);
    glow.addColorStop(0, C.sunGlow);
    glow.addColorStop(1, 'rgba(255, 250, 238, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - r * 9, sunY - r * 9, r * 18, r * 18);
    ctx.strokeStyle = C.halo;
    ctx.lineWidth = Math.max(1, 5 * s);
    ctx.beginPath();
    ctx.arc(sunX, sunY, r * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.sunCore;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Cirrus: thin streaks of ice cloud, each a few strands.
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.cirrus;
    for (const c of this.cirrus) {
      const x = (frac(c.x + t * c.speed * 0.15 - view.x * s * 0.00001) * 1.6 - 0.3) * view.pxW;
      const y = c.y * view.pxH;
      const w = c.w * view.pxW;
      ctx.globalAlpha = c.a * 0.6;
      ctx.lineWidth = Math.max(1, c.h * view.pxH);
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const dy = (k - 1) * c.h * view.pxH * 1.3;
        ctx.moveTo(x - w * (0.5 - k * 0.08), y + dy);
        ctx.quadraticCurveTo(x, y + dy - c.h * view.pxH * 2, x + w * (0.5 - k * 0.1), y + dy + c.h * view.pxH);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Layer 1 — the far ranges.
    this.layer(ctx, view, 0.08, 0.1);
    this.drawRange(ctx, this.far, C.farRange, C.farRangeLit, C.farSnow);
    this.layer(ctx, view, 0.16, 0.2);
    this.drawRange(ctx, this.near, C.range, C.rangeLit, C.rangeSnow);
    // Faint fog along the horizon, drifting a little.
    const hazeTop = (G - 260 - (this.refY + (view.y - this.refY) * 0.2)) * s;
    this.fogBand(ctx, view, hazeTop, 220 * s, 0.4 + 0.1 * Math.sin(t * 0.21));

    // Layer 2 — ice shelves and cliffs on the frozen plain, far below the
    // glacier's level, misted.
    this.layer(ctx, view, 0.3, 0.35);
    ctx.fillStyle = C.plain;
    ctx.fill(this.plain);
    ctx.strokeStyle = C.plainLine;
    ctx.lineWidth = 2;
    ctx.stroke(this.plainLines);
    ctx.fillStyle = C.shelf;
    ctx.fill(this.shelf);
    ctx.fillStyle = C.shelfShade;
    ctx.fill(this.shelfShade);
    ctx.strokeStyle = C.shelfLine;
    ctx.lineWidth = 2;
    ctx.stroke(this.shelfLines);
    ctx.fillStyle = C.shelfSnow;
    ctx.fill(this.shelfSnow);
    const plain = (G - 30 - (this.refY + (view.y - this.refY) * 0.35)) * s;
    this.fogBand(ctx, view, plain - 60 * s, 140 * s, 0.55);
    // The storm takes the distance first.
    if (storm > 0.01) this.veil(ctx, view, STORM_VEIL.far * storm);

    // Layer 3 — seracs and rock rising out of the abyss.
    this.layer(ctx, view, 0.6, 0.64);
    for (const sr of this.seracs) {
      ctx.fillStyle = C.seracShade;
      ctx.fill(sr.body);
      ctx.fillStyle = C.seracLit;
      ctx.fill(sr.lit);
      ctx.fillStyle = C.rockSnow;
      ctx.fill(sr.cap);
    }
    ctx.fillStyle = C.rock;
    ctx.fill(this.rocks);
    ctx.fillStyle = C.rockSnow;
    ctx.fill(this.rockSnow);

    // The abyss: cold haze thickening into the depths below the glacier's
    // rim, so the open air past its ledges reads as a long, long drop.
    const rim = this.persp.y(view, G, GLACIER.back);
    const depth = 520 * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = quadGradient(ctx, [0, rim, 0, rim, 0, rim + depth, 0, rim + depth], C.abyss);
    ctx.fillRect(0, rim, view.pxW, view.pxH - rim);
    // Mist rolling slowly through the abyss.
    this.fogBand(ctx, view, rim + 80 * s, 160 * s, 0.25 + 0.08 * Math.sin(t * 0.33 + 1));
    if (storm > 0.01) this.veil(ctx, view, STORM_VEIL.near * storm);
  }

  drawRange(ctx, range, body, lit, snow) {
    ctx.fillStyle = body;
    ctx.fill(range.body);
    ctx.fillStyle = lit;
    ctx.fill(range.lit);
    ctx.fillStyle = snow;
    ctx.fill(range.snow);
  }

  // A soft band of cold fog across the screen at `y` (device pixels).
  fogBand(ctx, view, y, h, a) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, y, 0, y + Math.max(1, h));
    g.addColorStop(0, `${C.fog}0)`);
    g.addColorStop(0.5, `${C.fog}${clamp(a, 0, 1)})`);
    g.addColorStop(1, `${C.fog}0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, view.pxW, h);
  }

  // The storm's whiteout over everything drawn so far, `a` strong.
  veil(ctx, view, a) {
    const [r, g, b] = C.storm;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1)})`;
    ctx.fillRect(0, 0, view.pxW, view.pxH);
  }

  // ---- The glacier ----------------------------------------------------------------

  // Every section where it is now: whole ones as one block (with their
  // cracks, reactions and tremble), breaking ones as their falling pieces,
  // broken ones as nothing.
  drawTerrain(ctx, view) {
    if (!this.faceGrad) this.resize(view);
    const list = this.sections;
    const ctrls = list.map((sec) => this.controllerOf(sec));
    const standing = list.map((sec, i) => this.standing(ctrls[i]));
    for (let i = 0; i < list.length; i++) {
      if (!standing[i]) continue;
      // A neighbour that has broken away leaves this section's face torn
      // along its tear line; a standing one joins it with no seam.
      const left = i > 0 ? (standing[i - 1] ? 'join' : ctrls[i - 1]?.tear ?? null) : null;
      const right = i < list.length - 1 ? (standing[i + 1] ? 'join' : ctrls[i + 1]?.tear ?? null) : null;
      this.drawSection(ctx, view, list[i], ctrls[i], left, right);
    }
    // Falling pieces in front of the ice that is left.
    for (let i = 0; i < list.length; i++) if (ctrls[i] && !standing[i]) this.drawPieces(ctx, view, ctrls[i]);
    for (const c of ctrls) if (c) this.drawReactions(ctx, view, c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Whether a section is still standing (whole, or shaking in its critical
  // fracture): drawn as a block, not as pieces.
  standing(c) {
    return !c || c.state === I.intact || c.state === I.critical;
  }

  // How far a section is drawn shifted sideways now (world units): a
  // tremble once critically unstable, a hard shake in its critical
  // fracture, a jolt as each contact lands. None with reduced motion.
  shakeOf(c) {
    if (!c || this.reducedMotion) return 0;
    const t = this.time;
    let amp = 0;
    if (c.state === I.critical) amp = 2.6;
    else if (c.unstable) amp = 0.7;
    let dx = amp * Math.sin(t * 57 + c.outward * 1.7) * (0.7 + 0.3 * Math.sin(t * 13));
    for (const e of c.impacts) if (e.age < 0.16) dx += (1 - e.age / 0.16) * (0.8 + 1.6 * e.strength) * Math.sin(e.age * 90);
    return dx;
  }

  // One standing section: its top, its outer side if one shows, its front
  // face (torn along a broken neighbour's tear line), its underside, then
  // its cracks. `left` / `right`: 'join' (a standing neighbour: the faces
  // run on into it, overlapping by a unit so no seam shows), a torn edge's
  // points, or null (an outer ledge).
  drawSection(ctx, view, sec, c, left, right) {
    const p = this.persp;
    const G = this.groundY;
    const ox = this.shakeOf(c);
    const x0 = sec.x0 + ox - (left === 'join' ? 1 : 0);
    const x1 = sec.x1 + ox + (right === 'join' ? 1 : 0);
    const f = p.box(view, { x0, x1, top: G, bottom: this.bottom, ...GLACIER }, this.faces);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // The top: snow, its rows of detail clipped to it.
    if (f.top) {
      fillQuad(ctx, f.top, quadGradient(ctx, f.top, C.topSnow));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.top[0], f.top[1]);
      for (let k = 2; k < 8; k += 2) ctx.lineTo(f.top[k], f.top[k + 1]);
      ctx.closePath();
      ctx.clip();
      for (const row of this.topRows) {
        p.plane(ctx, view, row.f);
        if (ox) ctx.translate(ox, 0);
        ctx.fillStyle = C.blueIce;
        ctx.fill(row.ice);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = C.blueIceRim;
        ctx.stroke(row.ice);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = C.sastrugi;
        ctx.stroke(row.ridges);
        ctx.strokeStyle = C.sastrugiLight;
        ctx.lineWidth = 1.1;
        ctx.stroke(row.lights);
        ctx.fillStyle = C.drift;
        ctx.fill(row.drifts);
        ctx.fillStyle = C.frost;
        ctx.fill(row.frost);
      }
      ctx.restore();
      // The far rim against the abyss beyond.
      ctx.beginPath();
      ctx.moveTo(f.top[0], f.top[1]);
      ctx.lineTo(f.top[2], f.top[3]);
      ctx.strokeStyle = C.backRim;
      ctx.lineWidth = Math.max(1, view.scale * 1.4);
      ctx.stroke();
    }

    // Its sides: only past an outer ledge or where a neighbour broke away
    // (the inner ice there, darker), never between standing sections.
    for (const [q, edge, stops] of [[f.left, left, C.faceSideLit], [f.right, right, C.faceSideShade]]) {
      if (!q || edge === 'join') continue;
      fillQuad(ctx, q, quadGradient(ctx, q, edge ? C.interior : stops));
    }

    // The front face on its own plane, cached art clipped to its outline.
    p.plane(ctx, view, GLACIER.front);
    if (ox) ctx.translate(ox, 0);
    const outline = this.outline(sec, left, right);
    ctx.save();
    ctx.clip(outline);
    ctx.fillStyle = this.faceGrad;
    ctx.fillRect(sec.x0 - 30, G, sec.x1 - sec.x0 + 60, this.bottom - G + 60);
    ctx.fillStyle = C.shaft;
    ctx.fill(this.shafts);
    ctx.fillStyle = C.strata;
    ctx.fill(this.strata);
    ctx.fillStyle = C.strataDark;
    ctx.fill(this.strataDark);
    ctx.fillStyle = C.bubble;
    ctx.fill(this.bubbles);
    ctx.strokeStyle = C.ancient;
    ctx.lineWidth = 1;
    ctx.stroke(this.ancient);
    // The snow cap hanging over the rim, its shadow under it.
    ctx.fillStyle = C.capShade;
    ctx.translate(0, 5);
    ctx.fill(this.cap);
    ctx.translate(0, -5);
    ctx.fillStyle = C.cap;
    ctx.fill(this.cap);
    ctx.restore();
    // A torn edge: the broken ice there darker and sharp-lit.
    for (const edge of [left, right]) {
      if (!Array.isArray(edge)) continue;
      ctx.beginPath();
      ctx.moveTo(edge[0], edge[1]);
      for (let k = 2; k < edge.length; k += 2) ctx.lineTo(edge[k], edge[k + 1]);
      ctx.strokeStyle = 'rgba(10, 40, 70, 0.75)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 248, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // The underside's shadowed teeth.
    ctx.strokeStyle = C.underside;
    ctx.lineWidth = 3;
    ctx.stroke(this.underside(sec));
    // The bright front rim.
    ctx.fillStyle = C.frontRim;
    ctx.fillRect(x0 - ox, G - 1, x1 - x0, 2.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (c) this.drawCracks(ctx, view, c, ox, 1);
  }

  // A section's front outline (world units, the front plane), cached:
  // along the rim, down its right edge (straight, or a torn neighbour's
  // tear), along the underside's teeth, and up its left edge.
  outline(sec, left, right) {
    const key = `${sec.id}:${left === 'join' ? 'j' : left ? 't' : 'o'}${right === 'join' ? 'j' : right ? 't' : 'o'}`;
    let path = this.outlines.get(key);
    if (path) return path;
    const G = this.groundY;
    const B = this.bottom;
    const x0 = sec.x0 - (left === 'join' ? 1 : 0);
    const x1 = sec.x1 + (right === 'join' ? 1 : 0);
    path = new Path2D();
    path.moveTo(x0, G);
    path.lineTo(x1, G);
    let endX = x1;
    if (Array.isArray(right)) {
      for (let k = 0; k < right.length; k += 2) path.lineTo(right[k], right[k + 1]);
      endX = right[right.length - 2];
    } else {
      path.lineTo(x1, iceUnderside(x1, B));
    }
    let startX = x0;
    if (Array.isArray(left)) startX = left[left.length - 2];
    for (let x = endX - 8; x > startX; x -= 8) path.lineTo(x, iceUnderside(x, B));
    if (Array.isArray(left)) {
      for (let k = left.length - 2; k >= 0; k -= 2) path.lineTo(left[k], left[k + 1]);
    } else {
      path.lineTo(x0, iceUnderside(x0, B));
    }
    path.closePath();
    this.outlines.set(key, path);
    return path;
  }

  // The underside line under a section (for its shadowed teeth), cached.
  underside(sec) {
    const key = `${sec.id}:under`;
    let path = this.outlines.get(key);
    if (!path) {
      path = new Path2D();
      path.moveTo(sec.x0, iceUnderside(sec.x0, this.bottom));
      for (let x = sec.x0 + 8; x <= sec.x1; x += 8) path.lineTo(x, iceUnderside(x, this.bottom) - 2);
      this.outlines.set(key, path);
    }
    return path;
  }

  // Screen point of a top crack point (x, d: 0 the front rim, 1 the back).
  topPoint(view, x, d, ox) {
    const z0 = 1 / GLACIER.front;
    const z1 = 1 / GLACIER.back;
    const f = 1 / (z0 + (z1 - z0) * d);
    return this.persp.point(view, x + ox, this.groundY, f, this.pt);
  }

  // A section's fracture network: dark, then a thin light edge beside it,
  // wider and darker as its damage mounts (older cracks wider still), glowing
  // cold white and cyan through its critical fracture; the tear along its
  // inner seam shows from deep damage on, and races open as it breaks.
  // `alpha` < 1 draws it again over the storm (drawForeground).
  drawCracks(ctx, view, c, ox, alpha) {
    if (!c.cracks.length && c.state !== I.critical) return;
    const s = view.scale;
    const level = c.level;
    const critical = c.state === I.critical;
    const k = c.progress;
    const darkness = 0.45 + 0.09 * level;
    const [dr, dg, db] = C.crackDark;
    const [lr, lg, lb] = C.crackLight;
    const [gr, gg, gb] = C.crackGlow;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A crack's path in device pixels, shifted (dx, dy).
    const trace = (crack, dx = 0, dy = 0) => {
      ctx.beginPath();
      const pts = crack.pts;
      for (let i = 0; i < pts.length; i += 2) {
        let x;
        let y;
        if (crack.face === 'top') [x, y] = this.topPoint(view, pts[i], pts[i + 1], ox);
        else [x, y] = this.persp.point(view, pts[i] + ox, pts[i + 1], GLACIER.front, this.pt);
        if (i === 0) ctx.moveTo(x + dx, y + dy);
        else ctx.lineTo(x + dx, y + dy);
      }
    };
    // The glow pulses through the critical fracture (steady with reduced
    // motion: the shape and contrast carry it).
    const pulse = this.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(this.time * 40);
    for (const crack of c.cracks) {
      const age = c.contacts - crack.born;
      const width = (0.8 + 0.22 * level + 0.12 * Math.min(6, age)) * s;
      trace(crack);
      if (critical) {
        ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${0.45 * alpha * pulse})`;
        ctx.lineWidth = width * 4;
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${dr}, ${dg}, ${db}, ${Math.min(0.95, darkness) * alpha})`;
      ctx.lineWidth = Math.max(1, width);
      ctx.stroke();
      // A thin lit edge beside it, so it reads on snow and in the storm.
      trace(crack, 0.7 * s, 0.7 * s);
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${(critical ? 0.95 : 0.55) * alpha})`;
      ctx.lineWidth = Math.max(0.6, width * 0.4);
      ctx.stroke();
    }
    // The inner seam opening: from deep damage (level 4) on, faint then
    // plain; racing open through the critical fracture.
    const open = critical ? 1 : clamp((level - 3) / 3, 0, 1);
    if (open > 0) {
      const tear = c.tear;
      const reach = critical ? k : 1;
      const yEnd = tear[1] + (tear[tear.length - 1] - tear[1]) * (critical ? reach : 0.25 + 0.4 * open);
      ctx.beginPath();
      for (let i = 0; i < tear.length; i += 2) {
        if (tear[i + 1] > yEnd) break;
        const [x, y] = this.persp.point(view, tear[i] + ox, tear[i + 1], GLACIER.front, this.pt);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${dr}, ${dg}, ${db}, ${(0.4 + 0.5 * open) * alpha})`;
      ctx.lineWidth = Math.max(1, (1 + 2.2 * open) * s);
      ctx.stroke();
      // Across the top along the seam, back from the rim.
      ctx.beginPath();
      const [ax, ay] = this.topPoint(view, c.seam, 0, ox);
      ctx.moveTo(ax, ay);
      const [bx, by] = this.topPoint(view, c.seam, critical ? reach : 0.35 + 0.5 * open, ox);
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (critical) {
        ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.9 * alpha})`;
        ctx.lineWidth = Math.max(0.8, 1.2 * s);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Each contact's reaction on a section: a stress flash spreading from
  // the impact across the top, and chips of ice thrown up and falling back;
  // in its critical fracture, chips jumping off its whole surface.
  drawReactions(ctx, view, c) {
    const s = view.scale;
    const p = this.persp;
    const G = this.groundY;
    const [sr, sg, sb] = C.stress;
    ctx.save();
    for (const e of c.impacts) {
      const k = e.age / e.life;
      const [x, y] = p.point(view, e.x, G, 1, this.pt);
      const rx = (14 + 70 * (0.5 + e.strength) * (this.reducedMotion ? 0.6 : 1 - (1 - k) ** 2)) * s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, rx);
      glow.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.55 * (1 - k)})`);
      glow.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - rx, y - rx * 0.4, rx * 2, rx * 0.8);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - k)})`;
      ctx.lineWidth = Math.max(1, 1.6 * s);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (this.reducedMotion) continue;
      // Chips: thrown up from the impact, falling back (from its seed).
      const rnd = mulberry32(e.seed);
      const time = e.age;
      p.plane(ctx, view, 1);
      for (let i = 0, n = 6 + Math.round(8 * e.strength); i < n; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
        const v = 120 + rnd() * 220;
        const cx = e.x + Math.cos(a) * v * time;
        const cy = G + Math.sin(a) * v * time + 0.5 * 1600 * time * time;
        if (cy > G + 2) continue;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 3 ? C.chip : C.chipBlue;
        const size = 1.4 + rnd() * 2.4;
        ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
    if (c.state === I.critical && !this.reducedMotion) {
      const sec = c.section;
      p.plane(ctx, view, 1);
      const rnd = mulberry32(0x1ce ^ (c.outward + 3));
      for (let i = 0; i < 16; i++) {
        const cx = sec.x + rnd() * sec.w;
        const hop = frac(this.time * (2.2 + rnd() * 2) + rnd());
        const cy = G - Math.sin(Math.PI * hop) * (8 + rnd() * 18);
        ctx.fillStyle = i % 2 ? C.chip : C.chipBlue;
        ctx.fillRect(cx - 1.2, cy - 1.2, 2.4, 2.4);
      }
    }
    ctx.restore();
  }

  // A breaking section as its pieces (the controller's, where each is now):
  // while it tears away, the dark interior behind them and its torn edges
  // glowing; each piece of ice turning as it falls, a snow cap on the top
  // slab's, powder trailing behind it.
  drawPieces(ctx, view, c) {
    const p = this.persp;
    const sec = c.section;
    const G = this.groundY;
    p.plane(ctx, view, GLACIER.front);
    if (c.state === I.separating || (c.state === I.collapsing && c.progress < 0.2)) {
      // The interior laid bare where it tore, gone as soon as it falls.
      const k = c.state === I.separating ? 1 - c.progress * 0.3 : 0.7 * (1 - c.progress / 0.2) ** 2;
      if (k > 0.01) {
        ctx.globalAlpha = k;
        ctx.fillStyle = this.interiorGrad;
        ctx.beginPath();
        ctx.moveTo(sec.x, G + 4);
        ctx.lineTo(sec.x + sec.w, G + 4);
        ctx.lineTo(sec.x + sec.w, iceUnderside(sec.x + sec.w, this.bottom) - 40);
        ctx.lineTo(sec.x, iceUnderside(sec.x, this.bottom) - 40);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    const tearing = c.state === I.separating;
    for (const piece of c.debris) {
      if (!this.reducedMotion && piece.kind === 'chunk' && c.state !== I.separating) this.drawTrail(ctx, piece);
      ctx.save();
      ctx.translate(piece.renderX, piece.renderY);
      ctx.rotate(piece.renderA);
      const poly = piece.poly;
      // Its thickness: the outline again, up and back, as its top face
      // (snow on the top slab, inner ice below it).
      if (piece.kind === 'chunk') {
        ctx.save();
        ctx.translate(-3, -7);
        tracePoly(ctx, poly);
        ctx.fillStyle = piece.row === 0 ? C.cap : '#2c6e94';
        ctx.fill();
        ctx.restore();
      }
      tracePoly(ctx, poly);
      if (piece.kind === 'chunk') {
        // Its own share of the face, as it was where it broke from (the
        // gradient set back by its resting centre), the snow cap along the
        // top slab's rim, and its torn edges.
        ctx.translate(-piece.x0, -piece.y0);
        ctx.fillStyle = this.faceGrad;
        ctx.fill();
        if (piece.row === 0) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = C.cap;
          ctx.fillRect(piece.x0 - piece.reach - 4, G - 1, piece.reach * 2 + 8, 11);
          ctx.restore();
        }
        ctx.translate(piece.x0, piece.y0);
        ctx.strokeStyle = tearing ? 'rgba(170, 238, 255, 0.95)' : 'rgba(14, 50, 84, 0.7)';
        ctx.lineWidth = tearing ? 2.4 : 1.6;
        ctx.stroke();
      } else {
        ctx.fillStyle = piece.seed % 2 ? C.chip : C.chipBlue;
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Powder streaming off a falling piece, back along its path: fine
  // grains, thinning out behind it.
  drawTrail(ctx, piece) {
    const speed = Math.hypot(piece.vx, piece.vy);
    if (speed < 80) return;
    const ux = -piece.vx / speed;
    const uy = -piece.vy / speed;
    const len = Math.min(3, speed / 300) * piece.reach;
    ctx.fillStyle = C.snow;
    for (let i = 1; i <= 12; i++) {
      const d = (i / 12) * len;
      const wob = Math.sin(piece.seed * 1.7 + i * 2.3) * piece.reach * 0.6;
      const size = 1.6 + 2.2 * (1 - i / 12);
      ctx.globalAlpha = 0.65 * (1 - i / 13);
      ctx.fillRect(piece.renderX + ux * d - uy * wob - size / 2, piece.renderY + uy * d + ux * wob - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // ---- Foreground ---------------------------------------------------------------

  // The air in front of the fighters: blowing powder low over the ice, the
  // snow in its three depths, and the storm (its fog banks, driving snow
  // and whiteout), then the cracks of a section about to break drawn again
  // over it so the warning still reads.
  drawForeground(ctx, view) {
    const storm = this.storm;
    const t = this.reducedMotion ? 0 : this.time;
    const s = view.scale;
    const wind = this.wind;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Powder blowing across the glacier's top.
    const gy = this.persp.y(view, this.groundY, 1);
    ctx.lineCap = 'round';
    for (const w of this.powder) {
      const x = (frac(w.phase + t * 0.06 * w.speed * wind) * 1.6 - 0.3) * view.pxW;
      const y = gy + w.y * s;
      ctx.strokeStyle = `rgba(255, 255, 255, ${w.a * (0.6 + 0.6 * clamp(wind - 0.2, 0, 1.5))})`;
      ctx.lineWidth = Math.max(1, (1.5 + storm * 2) * s);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - w.len * 0.5 * s, y - 6 * s, x - w.len * s * (1 + storm), y + 2 * s);
      ctx.stroke();
    }
    // The snow, far to near.
    for (const layer of this.snow) {
      const size = layer.depth * s;
      ctx.fillStyle = C.snow;
      for (const p of layer.flakes) {
        ctx.globalAlpha = p.alpha;
        const r = Math.max(1, p.size * size);
        ctx.fillRect(Math.round(p.x * view.pxW), Math.round(p.y * view.pxH), r, r);
      }
    }
    ctx.globalAlpha = 1;
    if (storm > 0.01) this.drawStorm(ctx, view, storm, wind, t);
    // The cues: a section critically unstable or breaking stays readable
    // through the whiteout.
    if (storm > 0.05) {
      for (const sec of this.sections) {
        const c = this.controllerOf(sec);
        if (c && this.standing(c) && c.level >= 3) this.drawCracks(ctx, view, c, this.shakeOf(c), STORM_VEIL.cue * storm);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // The blizzard over everything, `storm` strong: fog banks rolling through
  // on the wind, the driving snow as streaks along it (still flakes with
  // reduced motion), and the whiteout veil.
  drawStorm(ctx, view, storm, wind, t) {
    const s = view.scale;
    const [r, g, b] = C.storm;
    for (const bank of this.banks) {
      const x = (frac(bank.phase + t * 0.035 * bank.speed * wind) * 1.8 - 0.4) * view.pxW;
      const y = bank.y * view.pxH;
      const rad = bank.r * view.pxH;
      const fog = ctx.createRadialGradient(x, y, 0, x, y, rad);
      fog.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.5 * bank.a * storm})`);
      fog.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = fog;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const n = Math.round(this.stormFlakes.length * storm);
    const streak = this.reducedMotion ? 0 : (0.012 + 0.02 * storm) * wind;
    ctx.strokeStyle = C.snow;
    ctx.fillStyle = C.snow;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p = this.stormFlakes[i];
      const x = p.x * view.pxW;
      const y = p.y * view.pxH;
      const size = Math.max(1, p.size * p.depth * s);
      ctx.globalAlpha = p.alpha * Math.min(1, storm * 1.4);
      if (streak > 0) {
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - streak * view.pxW * p.speed, y - streak * view.pxW * p.speed * (0.18 + p.lift * 0.3));
        ctx.stroke();
      } else {
        ctx.fillRect(Math.round(x), Math.round(y), size, size);
      }
    }
    ctx.globalAlpha = 1;
    this.veil(ctx, view, STORM_VEIL.all * storm);
  }
}

// A wrapped screen fraction: back into [0, 1).
function wrap(v) {
  return v - Math.floor(v);
}

// A piece's outline (flat [x, y, ...]) as the current path.
function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0], poly[1]);
  for (let k = 2; k < poly.length; k += 2) ctx.lineTo(poly[k], poly[k + 1]);
  ctx.closePath();
}
