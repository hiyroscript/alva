// DESERT — a compact sandstone mesa at golden hour, standing over open
// desert air. Bright, warm and open: the fight happens on the mesa's top,
// and past either ledge there is nothing but the drop and, a short way
// below, the Void.
//
// The background is flat parallax (sky, sun, far mesas and dunes, buttes,
// mid dunes, hoodoos on the desert floor below), with a warm haze thickening
// below the mesa's rim. The mesa and the rock outcrops on it are drawn in
// the shared one-point perspective (js/stages/perspective.js), like Practice
// Ground: a sunlit top that recedes in depth, a strata-banded cliff face in
// front, and the cliff's side past whichever ledge the view looks beyond.
// Their edges are exactly the collision's (map.mainStage, map.solids).

import { StageTheme, smoothRidge, mesaRange, ParticleField } from './stage-theme.js';
import { fillQuad, quadGradient, prism, clipAboveRim } from './perspective.js';
import { mulberry32, range } from '../core/utils.js';

const C = {
  sky: ['#d9703a', '#ee9a55', '#f7c585', '#fde0b0'],
  sunCore: '#fff5dc',
  farMesa: '#e6ad86',
  farDune: '#e8ad78',
  butteLit: '#c46d3e',
  butteShade: '#9a4f31',
  butteTop: '#dd8752',
  midDune: '#e29a5a',
  midDuneCrest: '#f2bd7e',
  nearLit: '#b0572f',
  nearShade: '#7c391f',
  nearEdge: '#d27c48',
  shrub: '#5e3d24',
  haze: [[0, 'rgba(246, 204, 150, 0)'], [0.45, 'rgba(246, 204, 150, 0.42)'], [1, 'rgba(240, 190, 130, 0.72)']],
  // The mesa's top: hazier at the back, bright sand at the front rim.
  topSand: [[0, '#e0a870'], [1, '#f5cc8f']],
  rim: '#ffe4b4',
  backRim: 'rgba(150, 78, 38, 0.45)',
  ripple: 'rgba(160, 96, 48, 0.22)',
  rippleLight: 'rgba(255, 232, 190, 0.35)',
  pebble: 'rgba(120, 70, 36, 0.35)',
  // The cliff: warm sandstone in front, a lit east face, a shaded west face.
  cliff: [[0, '#b8653a'], [0.25, '#a2552f'], [1, '#7a3a20']],
  cliffLit: [[0, '#cd7a46'], [1, '#9a4a28']],
  cliffShade: [[0, '#7c391f'], [1, '#5a2814']],
  strata: 'rgba(236, 150, 96, 0.3)',
  strataDark: 'rgba(90, 38, 18, 0.35)',
  lipShadow: 'rgba(70, 30, 14, 0.35)',
  cliffHaze: [[0, 'rgba(240, 190, 130, 0)'], [1, 'rgba(240, 190, 130, 0.78)']],
  // Rock outcrops on the mesa.
  rockTop: '#dc8e5a',
  rockFront: [[0, '#b45b31'], [1, '#823f22']],
  rockLit: '#c06838',
  rockShade: '#6a3019',
  rockLine: 'rgba(70, 30, 14, 0.4)',
  dust: '#fff0d2',
};

// Depth of the mesa's top (back rim to front rim) and of the outcrops on it.
// The fighters stand at 1, just behind the front rim.
const MESA = { back: 0.64, front: 1.06 };
const ROCK = { back: 0.88, front: 1.04 };
// Camera height over the mesa's top at the reference view (world units).
const RISE = 240;
// Depth rows of sand ripples across the top.
const RIPPLE_ROWS = 7;
// Where the cliff face fades into the haze below the rim (world units).
const HAZE_FROM = 180;
const HAZE_TO = 720;

// A rock facet's colour from its outward normal: tops catch the most light,
// the sun is low on the right, so east faces are lit and west faces shaded.
function rockFacet(nx, ny) {
  if (ny < -0.6) return C.rockTop;
  return nx > 0 ? C.rockLit : C.rockShade;
}

export class DesertTheme extends StageTheme {
  constructor(map, opts) {
    super(map, opts);
    this.shadow = { alpha: 0.26, skew: -1.1, stretch: 1.9 };
    this.persp = this.perspective(RISE);
    this.faces = {};
    this.build();
  }

  build() {
    const m = this.map;
    const rng = mulberry32(0xde5e27);
    const G = this.groundY;
    const cb = m.cameraBounds;
    // Far enough down and across for every camera position, at any parallax.
    const bottom = cb.bottom + 600;
    const end = (p) => cb.right * p + 2400;

    // Layer 1: far mesas (parallax 0.08)
    this.farMesa = mesaRange(rng, { x0: -200, x1: end(0.08), baseY: G - 150, minH: 40, maxH: 110, bottom });

    // Layer 1b: far dunes (0.16)
    this.farDune = smoothRidge(rng, { x0: -200, x1: end(0.16), baseY: G - 150, amp: 36, step: 180, bottom }).path;

    // Layer 2: buttes / monuments (0.3), on the desert floor below the mesa
    this.butteLit = new Path2D();
    this.butteShade = new Path2D();
    this.butteTop = new Path2D();
    let x = -60;
    const bx1 = end(0.3);
    while (x < bx1) {
      x += range(rng, 260, 620);
      const w = range(rng, 70, 190);
      const h = range(rng, 150, 300);
      this.addButte(rng, x, G - 70, w, h, bottom);
      if (rng() < 0.5) this.addButte(rng, x + w * range(rng, 0.8, 1.2), G - 70, w * 0.5, h * range(rng, 0.45, 0.7), bottom);
      x += w;
    }

    // Layer 3a: mid dunes (0.45)
    const md = smoothRidge(rng, { x0: -200, x1: end(0.45), baseY: G - 20, amp: 44, step: 240, bottom });
    this.midDune = md.path;
    this.midDuneCrest = new Path2D();
    for (let i = 1; i < md.pts.length; i++) {
      const [px, py] = md.pts[i - 1];
      const [cx, cy] = md.pts[i];
      this.midDuneCrest.moveTo(px, py + 1);
      this.midDuneCrest.quadraticCurveTo((px + cx) / 2, Math.min(py, cy) - 2, cx, cy + 1);
    }

    // Layer 3b: hoodoos, arches and shrubs (0.6), rising from the desert
    // floor well below the mesa's rim
    this.nearLit = new Path2D();
    this.nearShade = new Path2D();
    this.nearEdge = new Path2D();
    this.shrubs = new Path2D();
    x = 80;
    const nx1 = end(0.6);
    const floor = G + 150;
    while (x < nx1) {
      x += range(rng, 420, 900);
      const kind = rng();
      if (kind < 0.3) this.addArch(rng, x, floor, range(rng, 150, 220), range(rng, 120, 170));
      else this.addHoodoo(rng, x, floor, range(rng, 34, 70), range(rng, 90, 230));
      for (let i = 0; i < 3; i++) this.addShrub(rng, this.shrubs, x + range(rng, -160, 260), floor, range(rng, 8, 16));
    }

    // Layer 4: the mesa and the rock outcrops on it (perspective, 1.0)
    this.buildMesa(rng);
    this.rocks = m.solids.map((so) => this.buildOutcrop(rng, so));

    // Layer 5: atmosphere
    const prng = mulberry32(0x5a4d);
    const count = this.reducedMotion ? 14 : 42;
    this.dust = new ParticleField(prng, count, { speed: [18, 60], size: [0.8, 2], drift: [-3, 5], depth: [0.9, 1.35], alpha: [0.18, 0.5], band: [0.25, 1] });
    this.sand = new ParticleField(prng, this.reducedMotion ? 10 : 30, { speed: [60, 140], size: [0.6, 1.4], drift: [-2, 2], depth: [1, 1.2], alpha: [0.15, 0.4], band: [0.72, 0.98] });
  }

  // The mesa's art, authored in world units on flat planes and cached: sand
  // ripples, pebbles and shrubs in rows across its top (each row drawn on
  // the plane at its own depth), and the cliff face's strata, cracks and
  // shading on the front plane.
  buildMesa(rng) {
    const { left, right, bottom } = this.map.mainStage;
    const G = this.groundY;
    // Rows even in depth between the rims, like Practice Ground's floor.
    const z0 = 1 / MESA.front;
    const dz = (1 / MESA.back - z0) / (RIPPLE_ROWS + 1);
    this.sandRows = [];
    for (let k = 1; k <= RIPPLE_ROWS; k++) {
      const f = 1 / (z0 + k * dz);
      const dark = new Path2D();
      const light = new Path2D();
      const pebbles = new Path2D();
      const shrubs = new Path2D();
      for (let i = 0; i < 12; i++) {
        const rx = range(rng, left + 20, right - 150);
        const len = range(rng, 40, 130);
        const target = rng() < 0.5 ? dark : light;
        target.moveTo(rx, G);
        target.quadraticCurveTo(rx + len / 2, G - range(rng, 1.5, 3.5), rx + len, G);
      }
      for (let i = 0; i < 10; i++) pebbles.rect(range(rng, left + 8, right - 8), G - 2, range(rng, 2, 5), range(rng, 1.5, 3));
      if (k > 2 && rng() < 0.8) this.addShrub(rng, shrubs, range(rng, left + 60, right - 60), G, range(rng, 6, 12));
      this.sandRows.push({ f, dark, light, pebbles, shrubs });
    }
    // Deepest row first, so nearer art paints over it.
    this.sandRows.reverse();

    // The cliff face: strata bands, darker seams and a few cracks, down to
    // the block's bottom.
    this.strata = new Path2D();
    this.strataDark = new Path2D();
    for (let y = G + range(rng, 26, 40); y < bottom; y += range(rng, 34, 72)) {
      this.strata.rect(left, y, right - left, range(rng, 2, 5));
      this.strataDark.rect(left, y + range(rng, 6, 12), right - left, range(rng, 1, 2.5));
    }
    this.cracks = new Path2D();
    for (let i = 0; i < 9; i++) {
      let cx = range(rng, left + 40, right - 40);
      let cy = G + range(rng, 14, 60);
      this.cracks.moveTo(cx, cy);
      const len = range(rng, 90, 320);
      for (let d = 0; d < len; d += range(rng, 14, 30)) {
        cx += range(rng, -6, 6);
        cy += range(rng, 14, 30);
        this.cracks.lineTo(cx, cy);
      }
    }
    // A jagged rim: small bites out of the lip, over the lit band.
    this.lip = new Path2D();
    for (let lx = left; lx < right; lx += range(rng, 30, 70)) {
      const w = range(rng, 18, 46);
      this.lip.rect(lx, G + 5, Math.min(w, right - lx), range(rng, 3, 8));
    }
  }

  addButte(rng, x, baseY, w, h, bottom) {
    const top = baseY - h;
    const lean = range(rng, -10, 10);
    const shoulder = range(rng, 0.12, 0.3);
    const left = [
      [x - w * 0.18, baseY],
      [x - w * 0.02, baseY - h * 0.35],
      [x + lean * 0.5, baseY - h * 0.7],
      [x + w * 0.06 + lean, top + h * shoulder * 0.3],
      [x + w * 0.1 + lean, top],
    ];
    const right = [
      [x + w * 0.9 + lean, top],
      [x + w * 0.96 + lean, top + h * shoulder * 0.4],
      [x + w + lean * 0.5, baseY - h * 0.62],
      [x + w * 1.04, baseY - h * 0.3],
      [x + w * 1.2, baseY],
    ];
    const all = new Path2D();
    all.moveTo(left[0][0], bottom);
    for (const p of left) all.lineTo(p[0], p[1]);
    for (const p of right) all.lineTo(p[0], p[1]);
    all.lineTo(right[right.length - 1][0], bottom);
    all.closePath();
    this.butteShade.addPath(all);
    // Lit face: sun is to the right, so light the right ~55%.
    const lit = new Path2D();
    const split = x + w * 0.45 + lean;
    lit.moveTo(split - 6, bottom);
    lit.lineTo(split - 6, baseY);
    lit.lineTo(split, top + h * 0.2);
    lit.lineTo(split + 4, top);
    for (const p of right) lit.lineTo(p[0], p[1]);
    lit.lineTo(right[right.length - 1][0], bottom);
    lit.closePath();
    this.butteLit.addPath(lit);
    this.butteTop.rect(x + w * 0.1 + lean, top, w * 0.8, 3);
    // Strata bands
    for (let i = 1; i < 4; i++) {
      const sy = top + (h * i) / 4.2;
      this.butteTop.rect(x + w * 0.2, sy, w * 0.75, 1.6);
    }
  }

  addHoodoo(rng, x, baseY, w, h) {
    const top = baseY - h;
    const cap = w * 1.3;
    const shade = new Path2D();
    shade.moveTo(x - w * 0.6, baseY);
    shade.lineTo(x - w * 0.35, baseY - h * 0.4);
    shade.lineTo(x - w * 0.28, top + 18);
    shade.lineTo(x - cap / 2, top + 14);
    shade.lineTo(x - cap / 2 + 6, top);
    shade.lineTo(x + cap / 2 - 4, top - 2);
    shade.lineTo(x + cap / 2, top + 12);
    shade.lineTo(x + w * 0.3, top + 18);
    shade.lineTo(x + w * 0.36, baseY - h * 0.45);
    shade.lineTo(x + w * 0.65, baseY);
    shade.closePath();
    this.nearShade.addPath(shade);
    const lit = new Path2D();
    lit.moveTo(x + 2, baseY);
    lit.lineTo(x + 2, top + 18);
    lit.lineTo(x + 4, top);
    lit.lineTo(x + cap / 2 - 4, top - 2);
    lit.lineTo(x + cap / 2, top + 12);
    lit.lineTo(x + w * 0.3, top + 18);
    lit.lineTo(x + w * 0.36, baseY - h * 0.45);
    lit.lineTo(x + w * 0.65, baseY);
    lit.closePath();
    this.nearLit.addPath(lit);
    this.nearEdge.rect(x - cap / 2 + 6, top - 1, cap - 10, 2.5);
  }

  addArch(rng, x, baseY, w, h) {
    const t = h * 0.3;
    const shade = new Path2D();
    shade.moveTo(x - 20, baseY);
    shade.lineTo(x - 8, baseY - h * 0.55);
    shade.quadraticCurveTo(x - 4, baseY - h - 6, x + w * 0.45, baseY - h);
    shade.quadraticCurveTo(x + w + 10, baseY - h + 4, x + w + 6, baseY - h * 0.5);
    shade.lineTo(x + w + 24, baseY);
    shade.lineTo(x + w - 26, baseY);
    shade.lineTo(x + w - 30, baseY - h * 0.45);
    shade.quadraticCurveTo(x + w * 0.5, baseY - h + t + 18, x + 30, baseY - h * 0.45);
    shade.lineTo(x + 24, baseY);
    shade.closePath();
    this.nearShade.addPath(shade);
    const lit = new Path2D();
    lit.moveTo(x + w * 0.45, baseY - h);
    lit.quadraticCurveTo(x + w + 10, baseY - h + 4, x + w + 6, baseY - h * 0.5);
    lit.lineTo(x + w + 24, baseY);
    lit.lineTo(x + w - 8, baseY);
    lit.lineTo(x + w - 14, baseY - h * 0.5);
    lit.quadraticCurveTo(x + w * 0.7, baseY - h + t, x + w * 0.45, baseY - h + t * 0.7);
    lit.closePath();
    this.nearLit.addPath(lit);
    this.nearEdge.rect(x + w * 0.2, baseY - h - 1, w * 0.5, 2.5);
  }

  addShrub(rng, path, x, baseY, size) {
    const n = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.2;
      const len = size * range(rng, 0.6, 1.1);
      path.moveTo(x, baseY);
      path.quadraticCurveTo(x + Math.cos(a) * len * 0.5, baseY + Math.sin(a) * len * 0.7, x + Math.cos(a) * len, baseY + Math.sin(a) * len);
    }
  }

  // A rock outcrop as a faceted prism in depth: a chamfered outline inside
  // its collision box, extruded back from the front plane, with strata and
  // cracks on its front face (cached; drawn by drawRock).
  buildOutcrop(rng, so) {
    const x0 = so.x;
    const x1 = so.x + so.w;
    const y0 = so.y;
    const y1 = so.y + so.h;
    // Clockwise on screen from the bottom-left corner.
    const outline = [
      x0 + 2, y1,
      x0, y0 + so.h * 0.45,
      x0 + 8, y0 + 6,
      x0 + 18, y0,
      x1 - 16, y0,
      x1 - 6, y0 + 7,
      x1, y0 + so.h * 0.5,
      x1 - 1, y1,
    ];
    const lines = new Path2D();
    for (let i = 1; i < 3; i++) lines.rect(x0 + 8, y0 + (so.h * i) / 3 + range(rng, -4, 4), so.w - 16, 1.5);
    for (let i = 0; i < 3; i++) {
      const cx = x0 + range(rng, 24, so.w - 24);
      lines.moveTo(cx, y0 + 4);
      lines.lineTo(cx + range(rng, -8, 8), y0 + so.h * range(rng, 0.4, 0.8));
    }
    const rim = new Path2D();
    rim.rect(x0 + 18, y0, so.w - 34, 2.5);
    return { outline, top: y0, ...ROCK, lines, rim };
  }

  resize(view) {
    const ctx = view.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, view.pxH);
    g.addColorStop(0, C.sky[0]);
    g.addColorStop(0.32, C.sky[1]);
    g.addColorStop(0.58, C.sky[2]);
    g.addColorStop(1, C.sky[3]);
    this.skyGrad = g;
  }

  update(dt, view) {
    super.update(dt);
    this.dust.update(dt, view);
    this.sand.update(dt, view);
  }

  drawBackground(ctx, view) {
    const G = this.groundY;
    const s = view.scale;

    // Layer 0 — sky + sun (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, view.pxW, view.pxH);

    const sunX = view.pxW * 0.74 - view.x * s * 0.02;
    const sunY = (G - 340 - (this.refY + (view.y - this.refY) * 0.05)) * s;
    const r = 34 * s;
    const glow = ctx.createRadialGradient(sunX, sunY, r * 0.4, sunX, sunY, r * 6);
    glow.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
    glow.addColorStop(0.25, 'rgba(255, 214, 150, 0.35)');
    glow.addColorStop(1, 'rgba(255, 200, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - r * 6, sunY - r * 6, r * 12, r * 12);
    ctx.fillStyle = C.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
    ctx.fill();

    // Layer 1 — far mesas & dunes
    this.layer(ctx, view, 0.08, 0.1);
    ctx.fillStyle = C.farMesa;
    ctx.fill(this.farMesa);
    this.layer(ctx, view, 0.16, 0.2);
    ctx.fillStyle = C.farDune;
    ctx.fill(this.farDune);

    // Horizon haze band + subtle heat shimmer
    const hazeTop = (G - 230 - (this.refY + (view.y - this.refY) * 0.2)) * s;
    const hazeH = 170 * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const haze = ctx.createLinearGradient(0, hazeTop, 0, hazeTop + hazeH);
    haze.addColorStop(0, 'rgba(255, 232, 196, 0)');
    haze.addColorStop(0.6, 'rgba(255, 232, 196, 0.38)');
    haze.addColorStop(1, 'rgba(255, 232, 196, 0.1)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, hazeTop, view.pxW, hazeH);
    if (!this.reducedMotion) this.heatShimmer(ctx, view, hazeTop + hazeH * 0.35, hazeH * 0.45);

    // Layer 2 — buttes
    this.layer(ctx, view, 0.3, 0.35);
    ctx.fillStyle = C.butteShade;
    ctx.fill(this.butteShade);
    ctx.fillStyle = C.butteLit;
    ctx.fill(this.butteLit);
    ctx.fillStyle = C.butteTop;
    ctx.fill(this.butteTop);

    // Layer 3 — mid dunes, then near rocks
    this.layer(ctx, view, 0.45, 0.5);
    ctx.fillStyle = C.midDune;
    ctx.fill(this.midDune);
    ctx.strokeStyle = C.midDuneCrest;
    ctx.lineWidth = 2.5;
    ctx.stroke(this.midDuneCrest);

    this.layer(ctx, view, 0.6, 0.64);
    ctx.fillStyle = C.nearShade;
    ctx.fill(this.nearShade);
    ctx.fillStyle = C.nearLit;
    ctx.fill(this.nearLit);
    ctx.fillStyle = C.nearEdge;
    ctx.fill(this.nearEdge);
    ctx.strokeStyle = C.shrub;
    ctx.lineWidth = 1.6;
    ctx.stroke(this.shrubs);

    // Warm haze thickening below the mesa's rim: the open air past the
    // ledges reads as a long drop, not solid ground.
    const rim = this.persp.y(view, G, MESA.back);
    const depth = 420 * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = quadGradient(ctx, [0, rim, 0, rim, 0, rim + depth, 0, rim + depth], C.haze);
    ctx.fillRect(0, rim, view.pxW, view.pxH - rim);
  }

  // Subtle heat haze: faint wavering light bands along the horizon. Pure
  // vector strokes (no canvas read-back), so it stays cheap on phones.
  heatShimmer(ctx, view, y, h) {
    const t = this.time;
    const s = view.scale;
    const step = Math.max(12, 28 * s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = Math.max(1, s * 1.1);
    for (let i = 0; i < 5; i++) {
      const by = y + (h * i) / 5;
      ctx.strokeStyle = `rgba(255, 244, 222, ${0.07 + 0.04 * Math.sin(t * 0.9 + i)})`;
      ctx.beginPath();
      for (let x = -step; x <= view.pxW + step; x += step) {
        const yy = by + Math.sin(x / (90 * s) + t * 1.7 + i * 1.3) * 1.6 * s;
        if (x === -step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // The mesa, then the rock outcrops on its top (never below its rim).
  drawTerrain(ctx, view) {
    this.drawMesa(ctx, view);
    clipAboveRim(ctx, this.persp, view, this.groundY, MESA.front);
    for (const r of this.rocks) this.drawRock(ctx, view, r);
    ctx.restore();
  }

  // The mesa in perspective: its sandy top (rippled rows, back to front),
  // the cliff side past whichever ledge the view looks beyond, then the
  // front cliff face fading into the haze below.
  drawMesa(ctx, view) {
    const { left, right, bottom } = this.map.mainStage;
    const G = this.groundY;
    const p = this.persp;
    const f = p.box(view, { x0: left, x1: right, top: G, bottom, ...MESA }, this.faces);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (f.top) {
      fillQuad(ctx, f.top, quadGradient(ctx, f.top, C.topSand));
      // The far rim, against the dunes beyond.
      ctx.beginPath();
      ctx.moveTo(f.top[0], f.top[1]);
      ctx.lineTo(f.top[2], f.top[3]);
      ctx.strokeStyle = C.backRim;
      ctx.lineWidth = Math.max(1, view.scale * 1.5);
      ctx.stroke();
      for (const row of this.sandRows) {
        p.plane(ctx, view, row.f);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = C.ripple;
        ctx.stroke(row.dark);
        ctx.strokeStyle = C.rippleLight;
        ctx.stroke(row.light);
        ctx.fillStyle = C.pebble;
        ctx.fill(row.pebbles);
        ctx.strokeStyle = C.shrub;
        ctx.stroke(row.shrubs);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // The cliff sides: the east face catches the low sun, the west is in
    // shade. Strata carry back along them from the front face.
    for (const [q, stops] of [[f.left, C.cliffShade], [f.right, C.cliffLit]]) {
      if (!q) continue;
      fillQuad(ctx, q, quadGradient(ctx, q, stops));
      const x = q === f.left ? left : right;
      ctx.beginPath();
      for (let d = 40; d < 900; d += 55) {
        const [bx, by] = p.point(view, x, G + d, MESA.back);
        const [fx, fy] = p.point(view, x, G + d, MESA.front);
        if (by > view.pxH && fy > view.pxH) break;
        ctx.moveTo(bx, by);
        ctx.lineTo(fx, fy);
      }
      ctx.strokeStyle = C.strataDark;
      ctx.lineWidth = Math.max(1, view.scale);
      ctx.stroke();
      fillQuad(ctx, q, this.hazeGradient(ctx, view, MESA.front));
    }

    // The front face, drawn on its own plane with cached art.
    p.plane(ctx, view, MESA.front);
    ctx.fillStyle = this.cliffGradient ??= this.worldGradient(ctx, G, G + 900, C.cliff);
    ctx.fillRect(left, G, right - left, bottom - G);
    ctx.fillStyle = C.strata;
    ctx.fill(this.strata);
    ctx.fillStyle = C.strataDark;
    ctx.fill(this.strataDark);
    ctx.strokeStyle = C.strataDark;
    ctx.lineWidth = 2;
    ctx.stroke(this.cracks);
    // The rim: a sunlit lip, bitten and shadowed underneath.
    ctx.fillStyle = C.rim;
    ctx.fillRect(left, G, right - left, 4);
    ctx.fillStyle = C.lipShadow;
    ctx.fillRect(left, G + 4, right - left, 8);
    ctx.fill(this.lip);
    ctx.fillStyle = this.cliffHaze ??= this.worldGradient(ctx, G + HAZE_FROM, G + HAZE_TO, C.cliffHaze);
    ctx.fillRect(left, G + HAZE_FROM, right - left, bottom - G - HAZE_FROM);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // A rock outcrop in the same depth as the mesa: its facets lit by the low
  // sun on the right (the top brightest, the west faces in shade), then its
  // front face with strata, cracks and a sunlit rim.
  drawRock(ctx, view, r) {
    const p = this.persp;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const front = quadGradient(ctx, [0, p.y(view, r.top, r.front), 0, 0, 0, p.y(view, r.top + 68, r.front), 0, 0], C.rockFront);
    prism(ctx, p, view, r.outline, r.back, r.front, rockFacet, front);
    p.plane(ctx, view, r.front);
    ctx.strokeStyle = C.rockLine;
    ctx.fillStyle = C.rockLine;
    ctx.lineWidth = 1.5;
    ctx.stroke(r.lines);
    ctx.fillStyle = C.rim;
    ctx.globalAlpha = 0.7;
    ctx.fill(r.rim);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // A world-space vertical gradient (for art drawn on a depth plane): its
  // coordinates scale with the plane, so it is built once.
  worldGradient(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  // The haze over a cliff side, in screen space, matching the front face's.
  hazeGradient(ctx, view, f) {
    const G = this.groundY;
    const y0 = this.persp.y(view, G + HAZE_FROM, f);
    const y1 = this.persp.y(view, G + HAZE_TO, f);
    return quadGradient(ctx, [0, y0, 0, y0, 0, y1, 0, y1], C.cliffHaze);
  }

  drawForeground(ctx, view) {
    this.sand.draw(ctx, view, C.dust);
    this.dust.draw(ctx, view, C.dust);
  }
}
