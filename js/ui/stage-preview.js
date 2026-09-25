// Renders a live stage preview (same theme renderers as battle) into a menu
// canvas. Optionally shows idle fighters at the spawn points.
//
// A preview frames the compact stage itself: the main stage across the
// width with a little air past each ledge, never mostly open air or the
// far-off Void.

import { createTheme } from '../stages/index.js';
import { drawFrame } from '../game/sprite-normalizer.js';
import { fitCanvas } from './sprite-art.js';

// View width as a multiple of the main stage's width.
const FRAME_WIDTH = 1.16;
// Where the main stage's top sits, as a fraction of the view height.
const FLOOR_LINE = 0.7;
// Gentle pan, as a fraction of the main stage's width either way.
const PAN_SWING = 0.05;

export class StagePreview {
  constructor(canvas, { animated = true, pan = true, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.animated = animated;
    this.pan = pan && !reducedMotion;
    this.reducedMotion = reducedMotion;
    this.themes = new Map();
    this.map = null;
    this.sprites = null;
    this.time = 0;
    this.frameTime = 0;
    this.frameIndex = 0;
    this.view = { ctx: this.ctx, x: 0, y: 0, w: 0, h: 0, scale: 1, pxW: 0, pxH: 0 };
  }

  setMap(map, sprites) {
    if (!this.themes.has(map.id)) this.themes.set(map.id, createTheme(map, { reducedMotion: this.reducedMotion }));
    this.map = map;
    this.sprites = sprites;
    this.theme = this.themes.get(map.id);
    this.theme.lastPxW = 0; // force gradient rebuild for this canvas
    this.time = 0;
    this.render(0, true);
  }

  render(dt, force = false) {
    if (!this.map) return;
    const size = fitCanvas(this.canvas);
    if (!size.w || size.w < 2) return;
    const v = this.view;
    const m = this.map;
    const main = m.mainStage;
    const stageW = main.right - main.left;
    if (size.changed || force || v.pxW !== size.w) {
      v.pxW = size.w;
      v.pxH = size.h;
      // Never taller than the camera could ever frame.
      const cb = m.cameraBounds;
      v.scale = Math.max(size.w / (stageW * FRAME_WIDTH), size.h / (cb.bottom - cb.top));
      v.w = size.w / v.scale;
      v.h = size.h / v.scale;
    }
    this.time += dt;

    const mid = (main.left + main.right) / 2;
    const cx = mid - v.w / 2 + (this.pan ? Math.sin(this.time * 0.12) * stageW * PAN_SWING : 0);
    const cy = main.top - v.h * FLOOR_LINE;
    v.x = Math.round(cx * v.scale) / v.scale;
    v.y = Math.round(cy * v.scale) / v.scale;

    const ctx = this.ctx;
    const theme = this.theme;
    if (this.animated) theme.update(dt, v);
    theme.prepare(v);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    theme.drawBackground(ctx, v);
    theme.drawTerrain(ctx, v);
    this.drawFighters(dt);
    theme.drawForeground(ctx, v);
  }

  drawFighters(dt) {
    const set = this.sprites;
    if (!set?.usable) return;
    const idle = set.animations.idle;
    this.frameTime += dt;
    if (this.frameTime > 1 / idle.fps) {
      this.frameTime = 0;
      this.frameIndex = (this.frameIndex + 1) % idle.frames.length;
    }
    const frame = idle.frames[this.frameIndex];
    const v = this.view;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const pxPerArt = v.scale * set.worldPerArt;
    this.map.spawnPoints.forEach((sp, i) => {
      const sx = (sp.x - v.x) * v.scale;
      const sy = (this.map.mainStage.top - v.y) * v.scale;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 20 * v.scale, 4 * v.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawFrame(ctx, frame, sx, sy, pxPerArt, i === 1);
    });
    ctx.imageSmoothingEnabled = true;
  }
}
