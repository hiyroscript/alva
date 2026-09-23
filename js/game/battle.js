// Battle: owns the simulation (fixed timestep) and Canvas 2D rendering for one
// Quick Battle. DOM concerns (HUD, pause, overlays) live in the battle screen.

import { CONFIG } from '../config.js';
import { StageCollision, separate, resolveSolidOverlap } from './physics.js';
import { Fighter } from './character.js';
import { PlayerController, TrainingAIController } from './fighter-controller.js';
import { CombatSystem, worldBox } from './combat.js';
import { Camera } from './camera.js';
import { drawFrame } from './sprite-normalizer.js';
import { createTheme } from '../stages/index.js';
import { mulberry32 } from '../core/utils.js';

// Ground ring + name tag tones: the player is white, the CPU a mid gray.
const MARKER = { p1: '#ffffff', p2: '#a3a3a3' };

export class Battle {
  constructor({ canvas, map, p1Def, p2Def, p1Sprites, p2Sprites, input, reducedMotion = false, onPhase }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.map = map;
    this.input = input;
    this.onPhase = onPhase || (() => {});
    this.stage = new StageCollision(map);
    this.theme = createTheme(map, { reducedMotion });
    this.camera = new Camera();
    this.camera.setBounds(map.cameraBounds);
    this.combat = new CombatSystem();
    this.gravity = CONFIG.sim.gravity;
    this.step = CONFIG.sim.step;
    this.acc = 0;
    this.debug = false;
    this.view = { ctx: this.ctx, x: 0, y: 0, w: 0, h: 0, scale: 1, pxW: 0, pxH: 0 };
    this.simCtx = { stage: this.stage, gravity: this.gravity, battle: this };

    const [s1, s2] = map.spawnPoints;
    this.p1 = new Fighter({
      def: p1Def, sprites: p1Sprites, spawn: s1, stage: this.stage,
      slot: 'p1', label: 'P1', controller: new PlayerController(input),
    });
    this.p2 = new Fighter({
      def: p2Def, sprites: p2Sprites, spawn: s2, stage: this.stage,
      slot: 'p2', label: 'CPU', controller: new TrainingAIController({ rng: mulberry32(Date.now() & 0xffff) }),
    });
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.fighters = [this.p1, this.p2];

    this.restart();
  }

  restart() {
    for (const f of this.fighters) f.reset(this.stage);
    this.acc = 0;
    this.roundSeconds = CONFIG.battle.roundSeconds;
    this.timeLeft = this.roundSeconds > 0 ? this.roundSeconds : Infinity;
    this.round = 1;
    this.setPhase('intro');
    this.input.flush();
    if (this.view.pxW) this.camera.snap(this.p1, this.p2);
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    const locked = phase !== 'fight';
    for (const f of this.fighters) f.inputLocked = locked;
    if (phase === 'fight') this.input.flush();
    this.onPhase(phase, this);
  }

  // ---- Sizing ---------------------------------------------------------------

  resize() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.dprCap);
    const pxW = Math.max(1, Math.round(rect.width * dpr));
    const pxH = Math.max(1, Math.round(rect.height * dpr));
    if (pxW === this.view.pxW && pxH === this.view.pxH) return false;
    canvas.width = pxW;
    canvas.height = pxH;
    canvas.classList.toggle('is-pixelated', (window.devicePixelRatio || 1) > CONFIG.render.dprCap);

    const scale = computeWorldScale(pxW, pxH, this.p1.sprites, this.map);
    this.pxPerArt = scale * this.p1.sprites.worldPerArt;
    Object.assign(this.view, { pxW, pxH, scale });
    this.camera.setView(pxW / scale, pxH / scale, scale);
    this.camera.snap(this.p1, this.p2);
    this.syncView();
    return true;
  }

  // ---- Loop -------------------------------------------------------------------

  frame(dt) {
    dt = Math.min(dt, CONFIG.sim.maxFrameDelta);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.step && steps < CONFIG.sim.maxStepsPerFrame) {
      this.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    if (steps >= CONFIG.sim.maxStepsPerFrame) this.acc = 0;
    const alpha = this.acc / this.step;
    for (const f of this.fighters) f.interpolate(alpha);
    this.camera.follow(this.p1, this.p2, dt);
    this.syncView();
    this.theme.update(dt, this.view);
    this.render();
  }

  update(dt) {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= CONFIG.battle.introSeconds) this.setPhase('fight');
        break;
      case 'fight':
        if (Number.isFinite(this.timeLeft)) {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          if (this.timeLeft <= 0) this.setPhase('timeup');
        }
        break;
      case 'timeup':
        if (this.phaseTime >= CONFIG.battle.timeUpSeconds) this.setPhase('result');
        break;
      default:
        break;
    }

    for (const f of this.fighters) f.update(dt, this.simCtx);
    separate(this.p1.body, this.p2.body, this.p1.def.pushbox.width / 2, this.p2.def.pushbox.width / 2, this.stage);
    for (const f of this.fighters) resolveSolidOverlap(f.body, this.stage);
    this.combat.update(this.fighters);
  }

  get result() {
    const a = this.p1.combat.health / this.p1.combat.maxHealth;
    const b = this.p2.combat.health / this.p2.combat.maxHealth;
    if (Math.abs(a - b) < 1e-6) return { outcome: 'draw' };
    return { outcome: a > b ? 'p1' : 'p2' };
  }

  // ---- Rendering --------------------------------------------------------------

  syncView() {
    const v = this.view;
    const cam = this.camera;
    // Snap the camera to whole device pixels so layers and sprites agree.
    v.x = Math.round(cam.x * v.scale) / v.scale;
    v.y = Math.round(cam.y * v.scale) / v.scale;
    v.w = cam.w;
    v.h = cam.h;
  }

  render() {
    const { ctx, view, theme } = this;
    if (!view.pxW) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    theme.prepare(view);
    theme.drawBackground(ctx, view);
    theme.drawTerrain(ctx, view);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const f of this.fighters) this.drawShadow(f);
    ctx.imageSmoothingEnabled = false;
    // CPU first so Player 1 is always drawn on top.
    this.drawFighter(this.p2);
    this.drawFighter(this.p1);
    ctx.imageSmoothingEnabled = true;

    theme.drawForeground(ctx, view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawMarkers();
    if (this.debug) this.drawDebug();
  }

  toScreen(x, y) {
    const v = this.view;
    return [(x - v.x) * v.scale, (y - v.y) * v.scale];
  }

  drawShadow(f) {
    const { ctx, view } = this;
    const b = f.body;
    const surface = this.stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, f.renderY);
    const height = Math.max(0, surface.y - f.renderY);
    const fade = Math.max(0, 1 - height / 220);
    if (fade <= 0) return;
    const sh = this.theme.shadow;
    const [sx, sy] = this.toScreen(f.renderX, surface.y);
    const rx = 21 * view.scale * (0.6 + 0.4 * fade);
    const ry = 4.5 * view.scale * (0.6 + 0.4 * fade);
    ctx.save();
    ctx.globalAlpha = sh.alpha * fade;
    ctx.fillStyle = '#000';
    ctx.translate(sx, sy);
    if (sh.skew) {
      // Long low-sun shadow stretched away from the light.
      ctx.beginPath();
      ctx.ellipse(sh.skew * rx * 0.55 * sh.stretch, 0, rx * sh.stretch, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Player ring marker on the ground.
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = MARKER[f.slot];
    ctx.lineWidth = Math.max(1.5, view.scale * 1.2);
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx * 1.1, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawFighter(f) {
    const frame = f.animator.frame;
    if (!frame) return;
    const [sx, sy] = this.toScreen(f.renderX, f.renderY);
    const flip = f.facing !== (f.def.sourceFacing || 1);
    drawFrame(this.ctx, frame, sx, sy, this.pxPerArt, flip);
  }

  drawMarkers() {
    const { ctx, view } = this;
    const s = view.scale;
    const font = Math.max(10, Math.round(9.5 * s));
    ctx.font = `700 ${font}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const f of this.fighters) {
      const color = MARKER[f.slot];
      const [x, footY] = this.toScreen(f.renderX, f.renderY);
      const top = footY - (f.def.visual.height + 16) * s;
      const onScreen = x > -10 && x < view.pxW + 10;
      if (onScreen) {
        ctx.fillStyle = 'rgba(8,8,8,0.55)';
        const tw = ctx.measureText(f.label).width + font * 0.8;
        ctx.fillRect(Math.round(x - tw / 2), Math.round(top - font * 1.25), Math.round(tw), Math.round(font * 1.2));
        ctx.fillStyle = color;
        ctx.fillText(f.label, Math.round(x), Math.round(top - font * 0.2));
        ctx.beginPath();
        ctx.moveTo(x - font * 0.35, top + font * 0.05);
        ctx.lineTo(x + font * 0.35, top + font * 0.05);
        ctx.lineTo(x, top + font * 0.45);
        ctx.closePath();
        ctx.fill();
      } else {
        // Off-screen indicator pinned to the edge.
        const edge = x < 0 ? 1 : -1;
        const ex = x < 0 ? font * 1.6 : view.pxW - font * 1.6;
        const ey = Math.min(Math.max(footY - f.def.visual.height * 0.5 * s, font * 3), view.pxH - font * 3);
        ctx.fillStyle = 'rgba(8,8,8,0.6)';
        ctx.beginPath();
        ctx.arc(ex, ey, font * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ex - edge * font * 1.1, ey);
        ctx.lineTo(ex - edge * font * 0.2, ey - font * 0.6);
        ctx.lineTo(ex - edge * font * 0.2, ey + font * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.textBaseline = 'middle';
        ctx.fillText(f.label, ex + edge * font * 0.1 + edge * font * 0.45, ey + font * 2.2);
        ctx.textBaseline = 'bottom';
      }
    }
  }

  drawDebug() {
    const { ctx, view } = this;
    const s = view.scale;
    ctx.save();
    ctx.lineWidth = 1;
    const rect = (x, y, w, h, color) => {
      const [sx, sy] = this.toScreen(x, y);
      ctx.strokeStyle = color;
      ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(w * s), Math.round(h * s));
    };
    for (const p of this.stage.platforms) rect(p.x, p.y, p.w, 2, p.dropThrough ? '#ffffff' : '#ff3b3b');
    for (const so of this.stage.solids) rect(so.x, so.y, so.w, so.h, '#ff3b3b');
    const box = {};
    for (const f of this.fighters) {
      const b = f.body;
      rect(b.x - b.halfW, b.y - b.height, b.halfW * 2, b.height, '#3cff7a');
      for (const hb of f.def.hurtboxes) {
        worldBox(f, hb, box);
        rect(box.x, box.y, box.w, box.h, '#4aa8ff');
      }
      // Attack hitbox, only while it can connect.
      const atk = f.combat.attack;
      if (atk && f.combat.phase === 'active') {
        worldBox(f, atk.def.hitbox, box);
        rect(box.x, box.y, box.w, box.h, '#ffb020');
      }
    }
    ctx.fillStyle = '#fff';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const p = this.p1;
    const lines = [
      `state ${p.state}${p.combat.attack ? ` ${p.combat.attack.def.id} ${p.combat.phase}` : ''}  grounded ${p.body.grounded}  ground ${p.body.ground?.id ?? '-'}`,
      `pos ${p.body.x.toFixed(1)}, ${p.body.y.toFixed(1)}  vel ${p.body.vx.toFixed(0)}, ${p.body.vy.toFixed(0)}`,
      `view ${view.w.toFixed(0)}x${view.h.toFixed(0)}  px/art ${this.pxPerArt.toFixed(2)}  cpu ${this.p2.state}`,
    ];
    const y0 = view.pxH - 12 - lines.length * 16;
    lines.forEach((l, i) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, y0 + i * 16, ctx.measureText(l).width + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(l, 12, y0 + 2 + i * 16);
    });
    ctx.restore();
  }

  destroy() {
    this.fighters = [];
  }
}

// Device pixels per world unit, chosen so the fighter is ~16% of the viewport
// height and (when possible) each art pixel maps to a whole number of device
// pixels for crisp pixel art. The view is never allowed to exceed the stage.
export function computeWorldScale(pxW, pxH, sprites, map) {
  const r = CONFIG.render;
  const artH = sprites.refArtHeight;
  const ideal = (r.fighterScreenRatio * pxH) / artH;
  let pxPerArt = ideal;
  if (r.pixelPerfect) {
    // Snap only when the whole-pixel size stays close to the target; on
    // small screens a 2-vs-3 px choice would change the fighter size too much.
    const opts = [Math.floor(ideal), Math.ceil(ideal)]
      .filter((n) => n >= 1 && Math.abs(n - ideal) / ideal <= 0.12)
      .filter((n) => {
        const ratio = (n * artH) / pxH;
        return ratio >= r.fighterScreenRatioMin && ratio <= r.fighterScreenRatioMax;
      })
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    if (opts.length) pxPerArt = opts[0];
  }
  let scale = pxPerArt / sprites.worldPerArt;
  const cb = map.cameraBounds;
  const minScaleW = pxW / (cb.right - cb.left);
  const minScaleH = pxH / (cb.bottom - cb.top);
  scale = Math.max(scale, minScaleW, minScaleH);
  return scale;
}
