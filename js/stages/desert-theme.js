// DESERT — wide sandstone basin at golden hour. Bright, warm and open.

import { StageTheme, smoothRidge, mesaRange, ParticleField } from './stage-theme.js';
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
  floorTop: '#f7d196',
  floor: ['#e7b173', '#d69b5e', '#bd7f48'],
  ripple: 'rgba(160, 96, 48, 0.22)',
  rippleLight: 'rgba(255, 232, 190, 0.35)',
  cliffLit: '#96492a',
  cliffShade: '#6c321b',
  cliffMid: '#7f3c22',
  strata: 'rgba(214, 128, 78, 0.35)',
  dust: '#fff0d2',
};

export class DesertTheme extends StageTheme {
  constructor(map, opts) {
    super(map, opts);
    this.shadow = { alpha: 0.26, skew: -1.1, stretch: 1.9 };
    this.build();
  }

  build() {
    const m = this.map;
    const rng = mulberry32(0xde5e27);
    const G = m.groundLevel;
    const bottom = m.worldHeight + 800;

    // Layer 1: far mesas (parallax 0.08)
    this.farMesa = mesaRange(rng, { x0: -200, x1: m.worldWidth * 0.08 + 1800, baseY: G - 150, minH: 40, maxH: 110, bottom });

    // Layer 1b: far dunes (0.16)
    this.farDune = smoothRidge(rng, { x0: -200, x1: m.worldWidth * 0.16 + 1800, baseY: G - 150, amp: 36, step: 180, bottom }).path;

    // Layer 2: buttes / monuments (0.3)
    this.butteLit = new Path2D();
    this.butteShade = new Path2D();
    this.butteTop = new Path2D();
    let x = -60;
    const bx1 = m.worldWidth * 0.3 + 1800;
    while (x < bx1) {
      x += range(rng, 260, 620);
      const w = range(rng, 70, 190);
      const h = range(rng, 150, 300);
      this.addButte(rng, x, G - 96, w, h, bottom);
      if (rng() < 0.5) this.addButte(rng, x + w * range(rng, 0.8, 1.2), G - 96, w * 0.5, h * range(rng, 0.45, 0.7), bottom);
      x += w;
    }

    // Layer 3a: mid dunes (0.45)
    const md = smoothRidge(rng, { x0: -200, x1: m.worldWidth * 0.45 + 1800, baseY: G - 58, amp: 44, step: 240, bottom });
    this.midDune = md.path;
    this.midDuneCrest = new Path2D();
    for (let i = 1; i < md.pts.length; i++) {
      const [px, py] = md.pts[i - 1];
      const [cx, cy] = md.pts[i];
      this.midDuneCrest.moveTo(px, py + 1);
      this.midDuneCrest.quadraticCurveTo((px + cx) / 2, Math.min(py, cy) - 2, cx, cy + 1);
    }

    // Layer 3b: near rock formations + shrubs (0.72)
    this.nearLit = new Path2D();
    this.nearShade = new Path2D();
    this.nearEdge = new Path2D();
    this.shrubs = new Path2D();
    x = 80;
    const nx1 = m.worldWidth * 0.72 + 1800;
    while (x < nx1) {
      x += range(rng, 420, 900);
      const kind = rng();
      if (kind < 0.3) this.addArch(rng, x, G - 12, range(rng, 150, 220), range(rng, 120, 170));
      else this.addHoodoo(rng, x, G - 12, range(rng, 34, 70), range(rng, 70, 190));
      for (let i = 0; i < 3; i++) this.addShrub(rng, this.shrubs, x + range(rng, -160, 260), G - 12, range(rng, 8, 16));
    }

    // Layer 4: playable floor, bounds cliffs and rock outcrops (1.0)
    this.floorRipples = new Path2D();
    this.floorRipplesLight = new Path2D();
    for (let i = 0; i < 140; i++) {
      const rx = range(rng, 0, m.worldWidth);
      const ry = G + range(rng, 10, m.worldHeight - G - 6);
      const len = range(rng, 40, 140);
      const target = rng() < 0.5 ? this.floorRipples : this.floorRipplesLight;
      target.moveTo(rx, ry);
      target.quadraticCurveTo(rx + len / 2, ry - range(rng, 2, 5), rx + len, ry);
    }
    this.pebbles = new Path2D();
    for (let i = 0; i < 90; i++) {
      this.pebbles.rect(range(rng, 0, m.worldWidth), G + range(rng, 4, m.worldHeight - G), range(rng, 2, 5), range(rng, 1.5, 3));
    }
    this.floorShrubs = new Path2D();
    for (let i = 0; i < 16; i++) {
      this.addShrub(rng, this.floorShrubs, range(rng, m.bounds.left + 60, m.bounds.right - 60), G + 1, range(rng, 6, 12));
    }

    this.cliffs = this.buildCliffs(rng);
    this.rocks = m.solids.map((s) => this.buildOutcrop(rng, s));

    // Layer 5: atmosphere
    const prng = mulberry32(0x5a4d);
    const count = this.reducedMotion ? 14 : 42;
    this.dust = new ParticleField(prng, count, { speed: [18, 60], size: [0.8, 2], drift: [-3, 5], depth: [0.9, 1.35], alpha: [0.18, 0.5], band: [0.25, 1] });
    this.sand = new ParticleField(prng, this.reducedMotion ? 10 : 30, { speed: [60, 140], size: [0.6, 1.4], drift: [-2, 2], depth: [1, 1.2], alpha: [0.15, 0.4], band: [0.72, 0.98] });
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

  buildCliffs(rng) {
    const m = this.map;
    const G = m.groundLevel;
    const topY = -200;
    const make = (edgeX, dir) => {
      // dir = 1 -> cliff occupies x < edgeX (left); -1 -> x > edgeX (right)
      const outer = dir > 0 ? -300 : m.worldWidth + 300;
      const shade = new Path2D();
      const lit = new Path2D();
      const strata = new Path2D();
      const pts = [];
      let y = G + 2;
      while (y > topY) {
        const jut = range(rng, -26, 10);
        pts.push([edgeX + jut * dir, y]);
        y -= range(rng, 40, 110);
      }
      pts.push([edgeX - 30 * dir, topY]);
      shade.moveTo(outer, G + 400);
      shade.lineTo(edgeX + 12 * dir, G + 400);
      for (const p of pts) shade.lineTo(p[0], p[1]);
      shade.lineTo(outer, topY);
      shade.closePath();
      lit.moveTo(outer, G + 400);
      for (const p of pts) lit.lineTo(p[0] - 22 * dir, p[1]);
      lit.lineTo(outer, topY);
      lit.closePath();
      for (let sy = G - 40; sy > topY; sy -= range(rng, 36, 70)) {
        strata.rect(Math.min(outer, edgeX - 40 * dir), sy, Math.abs(edgeX - outer) + 10, 2);
      }
      return { whole: shade, inner: lit, strata, faceLit: dir > 0 };
    };
    return [make(m.bounds.left, 1), make(m.bounds.right, -1)];
  }

  buildOutcrop(rng, s) {
    const shade = new Path2D();
    const lit = new Path2D();
    const top = new Path2D();
    const x0 = s.x;
    const x1 = s.x + s.w;
    const y0 = s.y;
    const y1 = s.y + s.h;
    shade.moveTo(x0 + 2, y1 + 2);
    shade.lineTo(x0 + 1, y0 + s.h * 0.45);
    shade.lineTo(x0 + 8, y0 + 6);
    shade.lineTo(x0 + 18, y0);
    shade.lineTo(x1 - 16, y0);
    shade.lineTo(x1 - 6, y0 + 7);
    shade.lineTo(x1, y0 + s.h * 0.5);
    shade.lineTo(x1 - 1, y1 + 2);
    shade.closePath();
    const mid = x0 + s.w * 0.42;
    lit.moveTo(mid, y1 + 2);
    lit.lineTo(mid + 6, y0 + s.h * 0.4);
    lit.lineTo(mid + 2, y0);
    lit.lineTo(x1 - 16, y0);
    lit.lineTo(x1 - 6, y0 + 7);
    lit.lineTo(x1, y0 + s.h * 0.5);
    lit.lineTo(x1 - 1, y1 + 2);
    lit.closePath();
    top.rect(x0 + 16, y0, s.w - 30, 3);
    for (let i = 1; i < 3; i++) top.rect(x0 + 10, y0 + (s.h * i) / 3, s.w * 0.7, 1.5);
    return { shade, lit, top };
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
    const m = this.map;
    const G = m.groundLevel;
    const s = view.scale;

    // Layer 0 — sky + sun (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, view.pxW, view.pxH);

    const sunX = view.pxW * 0.74 - view.x * s * 0.02;
    const sunY = (G - 250 - (this.refY + (view.y - this.refY) * 0.05)) * s;
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

    this.layer(ctx, view, 0.72, 0.76);
    ctx.fillStyle = C.nearShade;
    ctx.fill(this.nearShade);
    ctx.fillStyle = C.nearLit;
    ctx.fill(this.nearLit);
    ctx.fillStyle = C.nearEdge;
    ctx.fill(this.nearEdge);
    ctx.strokeStyle = C.shrub;
    ctx.lineWidth = 1.6;
    ctx.stroke(this.shrubs);
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

  drawTerrain(ctx, view) {
    const m = this.map;
    const G = m.groundLevel;
    this.layer(ctx, view, 1, 1);

    // Floor
    if (!this.floorGrad) {
      const g = ctx.createLinearGradient(0, G, 0, m.worldHeight);
      g.addColorStop(0, C.floor[0]);
      g.addColorStop(0.45, C.floor[1]);
      g.addColorStop(1, C.floor[2]);
      this.floorGrad = g;
    }
    ctx.fillStyle = this.floorGrad;
    ctx.fillRect(-100, G, m.worldWidth + 200, m.worldHeight - G + 400);
    ctx.fillStyle = C.floorTop;
    ctx.fillRect(-100, G, m.worldWidth + 200, 3);
    ctx.strokeStyle = C.ripple;
    ctx.lineWidth = 1.4;
    ctx.stroke(this.floorRipples);
    ctx.strokeStyle = C.rippleLight;
    ctx.stroke(this.floorRipplesLight);
    ctx.fillStyle = 'rgba(120, 70, 36, 0.35)';
    ctx.fill(this.pebbles);
    ctx.strokeStyle = C.shrub;
    ctx.lineWidth = 1.4;
    ctx.stroke(this.floorShrubs);

    // Rock outcrops (solid collision)
    for (const r of this.rocks) {
      ctx.fillStyle = C.nearShade;
      ctx.fill(r.shade);
      ctx.fillStyle = C.nearLit;
      ctx.fill(r.lit);
      ctx.fillStyle = C.nearEdge;
      ctx.fill(r.top);
    }

    // Boundary cliffs
    // The left wall's face points at the sun (lit), the right wall's away.
    for (const c of this.cliffs) {
      ctx.fillStyle = c.faceLit ? C.cliffLit : C.cliffShade;
      ctx.fill(c.whole);
      ctx.fillStyle = c.faceLit ? C.cliffShade : C.cliffMid;
      ctx.fill(c.inner);
      ctx.fillStyle = C.strata;
      ctx.fill(c.strata);
    }
  }

  drawForeground(ctx, view) {
    this.sand.draw(ctx, view, C.dust);
    this.dust.draw(ctx, view, C.dust);
  }
}
