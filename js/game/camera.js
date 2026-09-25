// 2D follow camera working in world units. Frames both fighters when they fit,
// otherwise keeps Player 1 comfortably in view (with no second fighter, as in
// Practice Ground without its CPU, it follows Player 1 alone). While it frames
// them it leans toward the main stage's centre, so the stage stays in view
// and a fighter off a ledge still sees the way back; always clamped to its
// camera bounds (the stage, the air around it and the Void's edge).

import { clamp, damp } from '../core/utils.js';

// How far the framing leans toward the main stage's centre (0 none, 1 all
// the way), as long as every framed fighter stays inside the margin.
const STAGE_LEAN = 0.35;

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.w = 960;
    this.h = 540;
    this.scale = 1; // device pixels per world unit
    this.bounds = { left: 0, right: 960, top: 0, bottom: 540 };
    this.anchorX = null; // the main stage's centre, leaned toward (setAnchor)
    // Where resting feet sit, as a fraction of view height: plenty of air
    // above, and room below to follow a fall past a ledge.
    this.floorLine = 0.7;
    this.tx = 0;
    this.ty = 0;
  }

  setBounds(bounds) {
    this.bounds = { ...bounds };
  }

  setAnchor(x) {
    this.anchorX = x;
  }

  setView(w, h, scale) {
    this.w = w;
    this.h = h;
    this.scale = scale;
    this.clampToBounds();
  }

  // Vertical reference for a fighter: ignore ordinary jump arcs so the camera
  // doesn't bob, but follow platform changes and big rises/falls.
  static trackY(f) {
    const b = f.body;
    if (b.grounded) return b.y;
    if (b.y > f.lastGroundY) return b.y;
    return Math.min(f.lastGroundY, b.y + 150);
  }

  computeTarget(primary, secondary) {
    const w = this.w;
    const margin = w * 0.2;
    const px = primary.renderX + primary.body.vx * 0.12;
    const maxSpan = w - margin * 2;
    let fx = px;
    let fy = Camera.trackY(primary);
    // The x range every framed fighter must stay inside the margin of.
    let lo = primary.renderX;
    let hi = primary.renderX;
    let framed = true;
    if (secondary) {
      const sx = secondary.renderX;
      const span = Math.abs(sx - primary.renderX);
      if (span <= maxSpan) {
        fx = (primary.renderX + sx) / 2;
        fy = fy * 0.7 + Camera.trackY(secondary) * 0.3;
        lo = Math.min(lo, sx);
        hi = Math.max(hi, sx);
      } else {
        // Keep P1 inside the margin while leaning toward the opponent.
        fx = primary.renderX + Math.sign(sx - primary.renderX) * (maxSpan / 2);
        framed = false;
      }
    }
    if (framed && this.anchorX !== null) {
      fx = clamp(fx + (this.anchorX - fx) * STAGE_LEAN, hi - maxSpan / 2, lo + maxSpan / 2);
    }
    let tx = fx - w / 2;
    let ty = fy - this.h * this.floorLine;

    // Never let Player 1's head leave the top of the frame.
    const headTop = primary.renderY - primary.body.height - 40;
    if (headTop < ty + this.h * 0.1) ty = headTop - this.h * 0.1;

    this.tx = tx;
    this.ty = ty;
  }

  follow(primary, secondary, dt) {
    this.computeTarget(primary, secondary);
    this.x += (this.tx - this.x) * damp(5.5, dt);
    this.y += (this.ty - this.y) * damp(3.6, dt);
    this.clampToBounds();
  }

  snap(primary, secondary) {
    this.computeTarget(primary, secondary);
    this.x = this.tx;
    this.y = this.ty;
    this.clampToBounds();
  }

  clampToBounds() {
    const b = this.bounds;
    const bw = b.right - b.left;
    const bh = b.bottom - b.top;
    this.x = this.w >= bw ? b.left + (bw - this.w) / 2 : clamp(this.x, b.left, b.right - this.w);
    this.y = this.h >= bh ? b.top + (bh - this.h) / 2 : clamp(this.y, b.top, b.bottom - this.h);
  }
}
