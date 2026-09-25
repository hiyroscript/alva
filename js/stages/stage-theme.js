// Base class + helpers for stage renderers.
//
// A theme draws a map in layers:
//   0 far sky            (screen space)
//   1 very distant       (parallax ~0.1)
//   2 mid silhouettes    (parallax ~0.3)
//   3 near background    (parallax ~0.6)
//   4 playable terrain   (in perspective, matching collision data exactly
//                         at the fighters' depth)
//   5 foreground atmosphere / particles
//   6 the Void           (drawVoid, over everything, the fighters included)
//
// Geometry is generated once from a seeded RNG into Path2D objects (cached);
// screen-space gradients are rebuilt only on resize. Any layer can later be
// swapped for image art without touching stage physics.
//
// The playable geometry (the main stage, platforms, solids) is drawn in
// one-point perspective (js/stages/perspective.js) so it has depth; the
// Void sits far past the stage and shows only as the view nears it.

import { Perspective } from './perspective.js';

// Reference view the layers are authored for: a typical view height at the
// platform-fighter zoom, with resting feet at 70% of it (the camera's floor
// line).
export const REF_VIEW_H = 860;
export const REF_FLOOR_LINE = 0.7;

// The Void's look. Its edge wavers `amp` world units either way of the fixed
// kill boundary (art only: gameplay tests the boundary itself), traced every
// `step` units, with a feathered second edge just inside it and a dark glow
// reaching `glow` units further in, so it reads as soft, deep and organic
// rather than a ruled line.
const VOID = {
  color: '#000',
  amp: 16,
  step: 14,
  waves: [[2 * Math.PI / 260, 0.9, 0.6], [2 * Math.PI / 97, -1.4, 0.4]], // [k, speed, weight]
  glow: 170,
  glowAlpha: 0.6,
  layers: [
    { inset: 26, alpha: 0.45, phase: 2.6 },
    { inset: 0, alpha: 1, phase: 0 },
  ],
};

export class StageTheme {
  constructor(map, { reducedMotion = false } = {}) {
    this.map = map;
    this.reducedMotion = reducedMotion;
    this.time = 0;
    // The main stage's top: the ground every layer is authored around.
    this.groundY = map.mainStage.top;
    // Camera y at which layers are authored (see REF_VIEW_H).
    this.refY = this.groundY - REF_VIEW_H * REF_FLOOR_LINE;
    this.lastPxH = 0;
    this.lastPxW = 0;
    this.shadow = { alpha: 0.3, skew: 0, stretch: 1 };
  }

  // The shared projection for this stage's playable geometry, with the
  // camera `rise` world units above the ground at refY.
  perspective(rise) {
    return new Perspective({ groundY: this.groundY, refY: this.refY, rise });
  }

  // Called by renderers before drawing; rebuilds screen-space caches only
  // when the canvas size changes.
  prepare(view) {
    if (view.pxW !== this.lastPxW || view.pxH !== this.lastPxH) {
      this.lastPxW = view.pxW;
      this.lastPxH = view.pxH;
      this.resize(view);
    }
  }

  resize() {}
  update(dt) {
    this.time += dt;
  }
  drawBackground() {}
  drawTerrain() {}
  drawForeground() {}

  // Sets a world->device transform for a parallax layer.
  layer(ctx, view, fx, fy = fx) {
    const ox = view.x * fx;
    const oy = this.refY + (view.y - this.refY) * fy;
    const s = view.scale;
    ctx.setTransform(s, 0, 0, s, -Math.round(ox * s), -Math.round(oy * s));
  }

  // ---- Void -----------------------------------------------------------------

  // The Void: pure black beyond the stage's kill boundary (map.voidBounds),
  // with a gently wavering inner edge and a dark glow just inside it, drawn
  // over everything at the fighters' depth. Only the sides the view comes
  // near are traced, so in neutral play the stage is never boxed in. With
  // reduced motion the edge holds still.
  drawVoid(ctx, view) {
    const v = this.map.voidBounds;
    if (!v) return;
    const reach = VOID.amp + VOID.glow;
    const x0 = view.x;
    const x1 = view.x + view.w;
    const y0 = view.y;
    const y1 = view.y + view.h;
    const sides = [];
    if (x0 < v.left + reach) sides.push('left');
    if (x1 > v.right - reach) sides.push('right');
    if (y0 < v.top + reach) sides.push('top');
    if (y1 > v.bottom - reach) sides.push('bottom');
    if (!sides.length) return;
    const t = this.reducedMotion ? 0 : this.time;
    const s = view.scale;
    ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
    // Far past the view, so each region reaches the screen edge.
    const pad = 40;
    // The glow: darkness gathering toward each edge from inside.
    for (const side of sides) {
      const horizontal = side === 'left' || side === 'right';
      const edge = side === 'left' ? v.left : side === 'right' ? v.right : side === 'top' ? v.top : v.bottom;
      const inward = side === 'left' || side === 'top' ? 1 : -1;
      const inner = edge + inward * VOID.glow;
      const g = horizontal
        ? ctx.createLinearGradient(edge, 0, inner, 0)
        : ctx.createLinearGradient(0, edge, 0, inner);
      g.addColorStop(0, `rgba(0, 0, 0, ${VOID.glowAlpha})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      const a = Math.min(edge, inner);
      const b = Math.max(edge, inner);
      if (horizontal) ctx.fillRect(a, y0 - pad, b - a, y1 - y0 + pad * 2);
      else ctx.fillRect(x0 - pad, a, x1 - x0 + pad * 2, b - a);
    }
    ctx.fillStyle = VOID.color;
    for (const layer of VOID.layers) {
      ctx.globalAlpha = layer.alpha;
      ctx.beginPath();
      for (const side of sides) this.traceVoidSide(ctx, side, layer, t, x0 - pad, x1 + pad, y0 - pad, y1 + pad);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // One side's region for a layer: the wavy edge (inset toward the stage
  // for the feathered layer), then out past the view. Every side winds the same
  // way, so where two meet at a corner the nonzero fill covers it once.
  traceVoidSide(ctx, side, layer, t, x0, x1, y0, y1) {
    const v = this.map.voidBounds;
    const edge = (along) => {
      let w = 0;
      for (const [k, speed, weight] of VOID.waves) w += Math.sin(along * k + t * speed + layer.phase) * weight;
      return VOID.amp * w;
    };
    const step = VOID.step;
    const pts = [];
    if (side === 'bottom' || side === 'top') {
      const down = side === 'bottom';
      const line = down ? v.bottom - layer.inset : v.top + layer.inset;
      const outer = down ? y1 : y0;
      const a = Math.floor(x0 / step) * step;
      pts.push(a, outer);
      for (let x = a; x <= x1 + step; x += step) pts.push(x, line + edge(x));
      pts.push(x1 + step, outer);
    } else {
      const right = side === 'right';
      const line = right ? v.right - layer.inset : v.left + layer.inset;
      const outer = right ? x1 : x0;
      const a = Math.floor(y0 / step) * step;
      pts.push(outer, a);
      for (let y = a; y <= y1 + step; y += step) pts.push(line + edge(y), y);
      pts.push(outer, y1 + step);
    }
    // Bottom and left run clockwise as traced; top and right are reversed.
    const reverse = side === 'top' || side === 'right';
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = reverse ? n - 1 - i : i;
      if (i === 0) ctx.moveTo(pts[j * 2], pts[j * 2 + 1]);
      else ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
    }
    ctx.closePath();
  }
}

// ---- Shape helpers --------------------------------------------------------

// Smooth rolling silhouette (dunes, hills) filled down to `bottom`.
export function smoothRidge(rng, { x0, x1, baseY, amp, step, bottom }) {
  const path = new Path2D();
  const pts = [];
  for (let x = x0; x <= x1 + step; x += step * (0.7 + rng() * 0.6)) {
    pts.push([x, baseY - amp * (0.35 + rng() * 0.65)]);
  }
  path.moveTo(x0, bottom);
  path.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    const my = (py + cy) / 2;
    path.quadraticCurveTo(px, py, mx, my);
  }
  const last = pts[pts.length - 1];
  path.lineTo(last[0], last[1]);
  path.lineTo(last[0], bottom);
  path.closePath();
  return { path, pts };
}

// Flat-topped plateau range (mesas).
export function mesaRange(rng, { x0, x1, baseY, minH, maxH, bottom }) {
  const path = new Path2D();
  path.moveTo(x0, bottom);
  let x = x0;
  let y = baseY - minH * 0.3;
  path.lineTo(x, y);
  while (x < x1) {
    const gap = 60 + rng() * 220;
    // Low ground between mesas.
    x += gap;
    y = baseY - rng() * minH * 0.3;
    path.lineTo(x, y);
    // Mesa: steep rise, flat top with small steps, steep fall.
    const h = minH + rng() * (maxH - minH);
    const w = 60 + rng() * 200;
    const rise = 14 + rng() * 26;
    path.lineTo(x + rise * 0.4, baseY - h * 0.55);
    path.lineTo(x + rise, baseY - h);
    let tx = x + rise;
    const steps = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < steps; i++) {
      tx += w / steps;
      const dh = (rng() - 0.5) * 16;
      path.lineTo(tx, baseY - h + dh);
    }
    path.lineTo(tx + rise * 0.8, baseY - h * 0.5);
    path.lineTo(tx + rise * 1.3, baseY - rng() * minH * 0.25);
    x = tx + rise * 1.3;
  }
  path.lineTo(x, bottom);
  path.closePath();
  return path;
}

// Screen-space drifting particles with per-particle parallax depth.
export class ParticleField {
  constructor(rng, count, { speed = [10, 30], size = [0.6, 1.6], drift = [-4, 4], depth = [0.9, 1.3], alpha = [0.2, 0.6], band = [0, 1] } = {}) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      this.items.push({
        x: rng(),
        y: band[0] + rng() * (band[1] - band[0]),
        vx: speed[0] + rng() * (speed[1] - speed[0]),
        vy: drift[0] + rng() * (drift[1] - drift[0]),
        size: size[0] + rng() * (size[1] - size[0]),
        depth: depth[0] + rng() * (depth[1] - depth[0]),
        alpha: alpha[0] + rng() * (alpha[1] - alpha[0]),
        phase: rng() * Math.PI * 2,
      });
    }
    this.band = band;
    this.lastCamX = null;
    this.lastCamY = null;
  }

  update(dt, view) {
    const camDx = this.lastCamX === null ? 0 : view.x - this.lastCamX;
    const camDy = this.lastCamY === null ? 0 : view.y - this.lastCamY;
    this.lastCamX = view.x;
    this.lastCamY = view.y;
    const [b0, b1] = this.band;
    for (const p of this.items) {
      p.x += ((p.vx * dt - camDx * p.depth) / view.w);
      p.y += ((p.vy * dt + Math.sin(p.phase + p.x * 6) * 3 * dt - camDy * p.depth) / view.h);
      if (p.x > 1.02) p.x -= 1.04;
      else if (p.x < -0.02) p.x += 1.04;
      if (p.y > b1) p.y = b0 + (p.y - b1);
      else if (p.y < b0) p.y = b1 - (b0 - p.y);
    }
  }

  draw(ctx, view, color) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    const s = view.scale;
    for (const p of this.items) {
      ctx.globalAlpha = p.alpha;
      const r = Math.max(1, p.size * s * p.depth);
      ctx.fillRect(Math.round(p.x * view.pxW), Math.round(p.y * view.pxH), r, r);
    }
    ctx.globalAlpha = 1;
  }
}
