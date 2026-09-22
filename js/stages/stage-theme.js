// Base class + helpers for stage renderers.
//
// A theme draws a map in layers:
//   0 far sky            (screen space)
//   1 very distant       (parallax ~0.1)
//   2 mid silhouettes    (parallax ~0.3)
//   3 near background    (parallax ~0.6)
//   4 playable terrain   (parallax 1, matches collision data exactly)
//   5 foreground atmosphere / particles
//
// Geometry is generated once from a seeded RNG into Path2D objects (cached);
// screen-space gradients are rebuilt only on resize. Any layer can later be
// swapped for image art without touching stage physics.

export const REF_VIEW_H = 540;

export class StageTheme {
  constructor(map, { reducedMotion = false } = {}) {
    this.map = map;
    this.reducedMotion = reducedMotion;
    this.time = 0;
    // Camera y at which layers are authored (feet at 76% of a 540-unit view).
    this.refY = map.groundLevel - REF_VIEW_H * 0.76;
    this.lastPxH = 0;
    this.lastPxW = 0;
    this.shadow = { alpha: 0.3, skew: 0, stretch: 1 };
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
