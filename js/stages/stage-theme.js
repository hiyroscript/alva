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
// Void sits a short way past the stage and shows only as the view nears it.

import { Perspective } from './perspective.js';
import { EDGE_RED, waveOffset } from '../core/organic-edge.js';
import { HIT_FX } from '../game/rendering/hit-fx.js';

// Reference view the layers are authored for: a typical view height at the
// platform-fighter zoom, with resting feet at 70% of it (the camera's floor
// line).
export const REF_VIEW_H = 860;
export const REF_FLOOR_LINE = 0.7;

// The Void's look: one solid black layer whose single inner edge wavers
// `amp` world units either way of the kill boundary in force (art only:
// gameplay tests the boundary itself), traced every `step` units, so it
// reads as organic rather than a ruled line while staying close enough to
// the boundary to show where the danger is. A thin red rim, `rimWidth` CSS
// pixels wide, runs along that same edge on the stage's side: no glow, blur
// or shadow.
export const VOID = Object.freeze({
  color: '#000',
  rim: EDGE_RED,
  rimWidth: 1.5,
  amp: 12,
  step: 14,
  waves: [[2 * Math.PI / 260, 0.9, 0.6], [2 * Math.PI / 97, -1.4, 0.4]], // [k, speed, weight]
});

export class StageTheme {
  constructor(map, { reducedMotion = false } = {}) {
    this.map = map;
    this.reducedMotion = reducedMotion;
    this.time = 0;
    // How far the Void's waves have run ahead of `time` (seconds of wave
    // motion): 0 while they run at their normal speed, growing while the
    // Arena runs them faster (advanceVoid), so a change of speed never
    // jumps their phase.
    this.voidSurge = 0;
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

  // Runs the Void's waves on by `dt` seconds at `speed` times their normal
  // rate (the Arena's voidWaveSpeed: 1 normally, faster through a
  // Battle's overtime). Their shape, amplitude and colours never change.
  advanceVoid(dt, speed = 1) {
    this.voidSurge += dt * Math.max(0, speed - 1);
  }

  // The waves back at their normal speed and phase (a restart).
  resetVoid() {
    this.voidSurge = 0;
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

  // The Void: one layer of pure black beyond `bounds`, the kill boundary in
  // force (the Arena passes its stage's `void`, so what is drawn is what
  // collision tests: the map's voidBounds, or closer in through overtime;
  // the theme never decides it), with one gently wavering inner edge and a thin red rim
  // along it, drawn over everything at the fighters' depth. Only the sides
  // the view comes near are traced, all in one path and one fill, so in
  // neutral play the stage is never boxed in and no part of the black is
  // ever drawn twice. The rim is stroked from the very points the black is
  // filled from, so the two never drift apart. With reduced motion the edge,
  // rim included, holds still.
  //
  // `ripples` are the Void's reactions to the fighters it has just taken
  // (HitEffects.ripples: each { side, x, y, age, life }, the point on the
  // boundary a fighter crossed): each one heaves the edge itself (a damped
  // wave impulse running out along it from that point, laid over the slow
  // waves: rippleOffset), so the black and its rim visibly ripple there;
  // then rings spread through the black from it, the rim burns brighter
  // there and a bright pulse flares at the point (drawVoidRipples). Art
  // only: the boundary handed in is never moved. With reduced motion the
  // edge only dips at the point and a still ring fades there.
  drawVoid(ctx, view, bounds, ripples = []) {
    const v = bounds;
    if (!v) return;
    const reach = VOID.amp;
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
    const t = this.reducedMotion ? 0 : this.time + this.voidSurge;
    const s = view.scale;
    ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
    // Far past the view, so each region reaches the screen edge.
    const pad = 40;
    const regions = sides.map((side) => this.voidEdgePoints(v, side, t, x0 - pad, x1 + pad, y0 - pad, y1 + pad, ripples));
    // The rim first, stroked twice its width along each wavy edge: the black
    // laid over it hides the half on the Void's side, and wherever another
    // side's black covers it (a corner), so what shows is a thin red line
    // hugging the edge on the stage's side.
    ctx.strokeStyle = VOID.rim;
    ctx.lineWidth = (2 * VOID.rimWidth * (view.dpr ?? 1)) / s;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const pts of regions) traceVoidEdge(ctx, pts);
    ctx.stroke();
    ctx.fillStyle = VOID.color;
    ctx.beginPath();
    for (const pts of regions) traceVoidRegion(ctx, pts);
    ctx.fill();
    if (ripples?.length) this.drawVoidRipples(ctx, view, sides, regions, ripples);
  }

  // How far the ripples push the edge of `side` (of Void `v`) at `along`
  // (y on a side, x on the top or bottom), toward the stage when positive.
  // Each ripple acts on its own side, and on another whose line passes
  // within `reach` of it (a corner): a dip right where the fighter went in,
  // a ringing swell there, and a wave packet running out both ways along
  // the edge, all dying away with its age.
  rippleOffset(v, side, along, ripples) {
    const cfg = HIT_FX.voidRipple;
    const inward = side === 'left' || side === 'top' ? 1 : -1;
    const vertical = side === 'left' || side === 'right';
    const line = side === 'left' ? v.left : side === 'right' ? v.right : side === 'top' ? v.top : v.bottom;
    let sum = 0;
    for (const r of ripples) {
      const off = Math.abs((vertical ? r.x : r.y) - line);
      if (off > cfg.reach) continue;
      const weight = r.side === side ? 1 : 1 - off / cfg.reach;
      const d = Math.abs(along - (vertical ? r.y : r.x));
      const a = r.age;
      const fade = Math.max(0, 1 - a / r.life);
      if (this.reducedMotion) {
        sum -= weight * cfg.dip * fade * Math.exp(-(d * d) / (2 * 60 * 60));
        continue;
      }
      const env = Math.exp(-cfg.decay * a) * fade;
      const front = cfg.speed * a;
      const packet = Math.exp(-((d - front) ** 2) / (2 * cfg.width * cfg.width));
      const wave = Math.cos((2 * Math.PI * (d - front)) / cfg.wavelength);
      const centre = Math.exp(-(d * d) / (2 * 70 * 70));
      sum += weight * (
        cfg.amp * env * packet * wave
        - cfg.dip * Math.exp(-a * 5) * centre
        + cfg.amp * 0.45 * env * centre * Math.sin(a * 16)
      );
    }
    return inward * sum;
  }

  // Each ripple's light over the drawn Void: rings spreading out through
  // the black from where the fighter went in (clipped to the black, so they
  // ripple on the Void's own surface) over a dark crimson stir, the rim
  // along the disturbed stretch of edge burning brighter, and a bright
  // pulse flaring at the point. All in world units (the transform drawVoid
  // set), fading out with the ripple's age.
  drawVoidRipples(ctx, view, sides, regions, ripples) {
    const cfg = HIT_FX.voidRipple;
    const s = view.scale;
    const px = (view.dpr ?? 1) / s;
    const still = this.reducedMotion;
    ctx.save();
    // The rings and the stir, on the black only.
    ctx.beginPath();
    for (const pts of regions) traceVoidRegion(ctx, pts);
    ctx.clip();
    for (const r of ripples) {
      const k = Math.min(1, r.age / r.life);
      const fade = (1 - k) ** 1.4;
      const stir = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, cfg.pulse * 3);
      stir.addColorStop(0, `rgba(150, 10, 24, ${0.6 * fade})`);
      stir.addColorStop(0.5, `rgba(90, 0, 12, ${0.3 * fade})`);
      stir.addColorStop(1, 'rgba(60, 0, 8, 0)');
      ctx.fillStyle = stir;
      ctx.fillRect(r.x - cfg.pulse * 3, r.y - cfg.pulse * 3, cfg.pulse * 6, cfg.pulse * 6);
      ctx.lineCap = 'round';
      if (still) {
        ctx.strokeStyle = EDGE_RED;
        ctx.globalAlpha = fade;
        ctx.lineWidth = 3 * px;
        ctx.beginPath();
        ctx.arc(r.x, r.y, cfg.reducedRing, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      for (let i = 0; i < cfg.rings; i++) {
        const a = r.age - i * cfg.ringGap;
        if (a <= 0) continue;
        const radius = 12 + cfg.ringSpeed * a * (1 - 0.25 * Math.min(1, a / r.life));
        const ringFade = fade * (1 - i * 0.22);
        ctx.globalAlpha = Math.max(0, ringFade);
        ctx.strokeStyle = i % 2 ? '#ff6b5e' : EDGE_RED;
        ctx.lineWidth = Math.max(1, (4.5 - i) * (1 - 0.5 * k)) * px;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        // A faint second crest just behind each ring.
        ctx.globalAlpha = Math.max(0, ringFade * 0.35);
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        ctx.arc(r.x, r.y, Math.max(1, radius - 16), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // The rim, brighter along the disturbed stretch of each rippling side.
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const r of ripples) {
      const k = Math.min(1, r.age / r.life);
      const fade = (1 - k) ** 1.2;
      const span = (still ? 90 : cfg.speed * r.age + cfg.width) + 40;
      sides.forEach((side, i) => {
        const vertical = side === 'left' || side === 'right';
        const centre = vertical ? r.y : r.x;
        const pts = regions[i];
        ctx.beginPath();
        let open = false;
        for (let j = 2; j < pts.length - 2; j += 2) {
          const along = vertical ? pts[j + 1] : pts[j];
          if (Math.abs(along - centre) > span) {
            open = false;
            continue;
          }
          if (open) ctx.lineTo(pts[j], pts[j + 1]);
          else ctx.moveTo(pts[j], pts[j + 1]);
          open = true;
        }
        for (const [color, width, alpha] of [['#ff2233', 7, 0.4], ['#ff8a7a', 2.5, 0.95]]) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha * fade;
          ctx.lineWidth = width * px;
          ctx.stroke();
        }
      });
    }
    // The pulse: a bright flare at the point, swelling and fading fast.
    for (const r of ripples) {
      const k = Math.min(1, r.age / 0.6);
      if (k >= 1) continue;
      const radius = cfg.pulse * (still ? 0.8 : 0.35 + 0.65 * (1 - (1 - k) ** 3));
      const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
      const a = (1 - k) ** 1.5;
      g.addColorStop(0, `rgba(255, 240, 232, ${0.95 * a})`);
      g.addColorStop(0.35, `rgba(255, 70, 70, ${0.75 * a})`);
      g.addColorStop(1, 'rgba(210, 31, 43, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // One side of `v`'s region as flat [x, y, ...] points: an outer corner
  // past the view, the wavy edge (every `step` units, `amp` either way of
  // the boundary), then the other outer corner. Every side winds the same
  // way, so where two meet at a corner the nonzero fill covers it once.
  voidEdgePoints(v, side, t, x0, x1, y0, y1, ripples = null) {
    const edge = ripples?.length
      ? (along) => VOID.amp * waveOffset(VOID.waves, along, t) + this.rippleOffset(v, side, along, ripples)
      : (along) => VOID.amp * waveOffset(VOID.waves, along, t);
    const step = VOID.step;
    const pts = [];
    if (side === 'bottom' || side === 'top') {
      const down = side === 'bottom';
      const line = down ? v.bottom : v.top;
      const outer = down ? y1 : y0;
      const a = Math.floor(x0 / step) * step;
      pts.push(a, outer);
      for (let x = a; x <= x1 + step; x += step) pts.push(x, line + edge(x));
      pts.push(x1 + step, outer);
    } else {
      const right = side === 'right';
      const line = right ? v.right : v.left;
      const outer = right ? x1 : x0;
      const a = Math.floor(y0 / step) * step;
      pts.push(outer, a);
      for (let y = a; y <= y1 + step; y += step) pts.push(line + edge(y), y);
      pts.push(outer, y1 + step);
    }
    // Bottom and left run clockwise as traced; top and right are reversed.
    if (side === 'top' || side === 'right') {
      const out = [];
      for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
      return out;
    }
    return pts;
  }
}

// The whole region of voidEdgePoints, closed, for the black fill.
function traceVoidRegion(ctx, pts) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

// Only its wavy edge (every point but the two outer corners), for the rim.
function traceVoidEdge(ctx, pts) {
  ctx.moveTo(pts[2], pts[3]);
  for (let i = 4; i < pts.length - 2; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
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
