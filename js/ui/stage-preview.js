// Renders a live stage preview (same theme renderers as battle) into a menu
// canvas. Optionally shows idle fighters at the spawn points.
//
// A preview frames the compact stage itself: the main stage across the
// width with a little air past each ledge, never mostly open air or the
// far-off Void.
//
// An animated preview of a stage with hazards (dynamic platforms, e.g.
// Asperitas's clouds; stage hazards, e.g. Adamaris's volcano, Jökull's ice
// and weather) runs them for real, in a little world of its own: its own
// StageCollision, PlatformHazards and StageHazards, stepped at the
// simulation's fixed step, so the clouds drift, rest, vanish and form again
// elsewhere and the volcano erupts and throws its rocks (with their
// warnings) exactly as in a battle, with no battle running, no fighter to
// strike and nothing shared with one. Its volcano opens with an eruption,
// so the preview shows what the stage does; and since no fighter lands
// there, its hazards run their demonstration (`demo`, see
// js/data/stage-hazards.js): Jökull's wings take contacts on a timer of
// their own, crack, break away and, only here, form again after a rest,
// and its weather brings a blizzard at every check. None of it is a
// battle's: a battle builds its own stage, whole and calm. A still preview
// (a roster thumbnail, or reduced motion) draws the platforms where the map
// starts them, the volcano at rest, the glacier whole and the weather calm.

import { CONFIG } from '../config.js';
import { createTheme } from '../stages/index.js';
import { StageCollision } from '../game/physics.js';
import { PlatformHazards } from '../game/platform-hazards.js';
import { StageHazards } from '../game/stage-hazards.js';
import { drawFrame } from '../game/rendering/sprite-normalizer.js';
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
    if (!this.themes.has(map.id)) this.themes.set(map.id, this.buildScene(map));
    this.map = map;
    this.sprites = sprites;
    const scene = this.themes.get(map.id);
    this.theme = scene.theme;
    this.sim = scene.sim;
    // Each time a stage is shown its hazards start over from the map.
    this.sim?.hazards.reset();
    this.sim?.stageHazards.reset();
    if (this.sim) this.sim.acc = 0;
    this.theme.lastPxW = 0; // force gradient rebuild for this canvas
    this.time = 0;
    this.render(0, true);
  }

  // `map`'s theme, and its hazards' own little world when they should run
  // here (an animated preview without reduced motion).
  buildScene(map) {
    let sim = null;
    if (this.animated && !this.reducedMotion && (map.platforms.some((p) => p.dynamic) || map.hazards?.length)) {
      const stage = new StageCollision(map);
      const seed = (Date.now() ^ 0x5a17) & 0xffff;
      sim = {
        stage, acc: 0,
        hazards: new PlatformHazards(stage, { seed }),
        stageHazards: new StageHazards(stage, map, { seed, opening: 'erupting', demo: true }),
      };
    }
    const theme = createTheme(map, { reducedMotion: this.reducedMotion, platforms: sim?.stage.platforms, hazards: sim?.stageHazards });
    return { theme, sim };
  }

  // Runs the preview's hazards on by `dt` seconds of fixed steps (never more
  // steps per frame than a battle takes), then places them between steps.
  stepHazards(dt) {
    const sim = this.sim;
    if (!sim) return;
    const step = CONFIG.sim.step;
    sim.acc += Math.min(dt, CONFIG.sim.maxFrameDelta);
    let steps = 0;
    while (sim.acc >= step && steps < CONFIG.sim.maxStepsPerFrame) {
      sim.hazards.update(step);
      sim.stageHazards.update(step);
      sim.acc -= step;
      steps++;
    }
    if (steps >= CONFIG.sim.maxStepsPerFrame) sim.acc = 0;
    sim.stage.interpolate(sim.acc / step);
    sim.stageHazards.interpolate(sim.acc / step);
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
    if (this.animated) {
      this.stepHazards(dt);
      theme.update(dt, v);
    }
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
