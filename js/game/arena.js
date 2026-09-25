// Arena: the fixed-timestep simulation and Canvas 2D rendering shared by every
// mode that puts fighters on a stage. Quick Battle (js/game/battle.js) adds an
// opponent, phases and a round timer; Practice Ground (js/game/practice.js)
// runs Player 1 with an optional training-dummy CPU and none of them. DOM
// concerns (HUD, menus, overlays) live in each mode's screen.

import { CONFIG } from '../config.js';
import { StageCollision, separate, resolveSolidOverlap } from './physics.js';
import { CombatSystem, worldBox } from './combat.js';
import { spawnProjectiles, removeDeadProjectiles } from './projectile.js';
import { spawnClones, updateClones, removeDeadClones } from './clone.js';
import { Camera } from './camera.js';
import { drawFrame, drawCenteredFrame } from './sprite-normalizer.js';
import { createTheme } from '../stages/index.js';

// Ground ring + name tag tones: the player is white, the CPU a mid gray.
const MARKER = { p1: '#ffffff', p2: '#a3a3a3' };
// Debug overlay: charged techniques get their own dashed colour, apart from
// melee / clone (orange) and projectile (magenta) boxes.
const TECHNIQUE_DEBUG = '#29f0ff';
const DEBUG_BUTTON = { primary: 'throw', special: 'special', action1: 'ba1', action2: 'ba2' };

export class Arena {
  constructor({ canvas, map, input, reducedMotion = false }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.map = map;
    this.input = input;
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
    // Fighters in play, Player 1 first; each mode fills it.
    this.fighters = [];
    // Live projectiles (js/game/projectile.js), in spawn order.
    this.projectiles = [];
    // Live summoned clones (js/game/clone.js), in spawn order. Never
    // fighters: no pushbox, camera, HUD, marker or result role.
    this.clones = [];
    // A charged technique (js/game/charged-technique.js) lives on the
    // fighter performing it (`fighter.technique`), not here: that fighter
    // updates, moves and ends it, and a reset ends it.
  }

  // Player 1: the fighter the camera keeps in view and the view is scaled
  // for.
  get primary() {
    return this.fighters[0] ?? null;
  }

  // The fighter the camera frames alongside Player 1, or null when Player 1
  // is alone (see Camera.follow).
  get secondary() {
    return this.fighters[1] ?? null;
  }

  // ---- Sizing ---------------------------------------------------------------

  // Fits the backing store and world scale to the canvas box. `force`
  // recomputes the scale at an unchanged size (a new fighter's art).
  resize(force = false) {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.dprCap);
    const pxW = Math.max(1, Math.round(rect.width * dpr));
    const pxH = Math.max(1, Math.round(rect.height * dpr));
    if (!force && pxW === this.view.pxW && pxH === this.view.pxH) return false;
    canvas.width = pxW;
    canvas.height = pxH;
    canvas.classList.toggle('is-pixelated', (window.devicePixelRatio || 1) > CONFIG.render.dprCap);

    const sprites = this.primary.sprites;
    const scale = computeWorldScale(pxW, pxH, sprites, this.map);
    this.pxPerArt = scale * sprites.worldPerArt;
    Object.assign(this.view, { pxW, pxH, scale });
    this.camera.setView(pxW / scale, pxH / scale, scale);
    this.camera.snap(this.primary, this.secondary);
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
    for (const p of this.projectiles) p.interpolate(alpha);
    this.camera.follow(this.primary, this.secondary, dt);
    this.syncView();
    this.theme.update(dt, this.view);
    this.render();
  }

  // One fixed step of the world. Modes with their own rules (phases, a
  // timer) run them first and then call this.
  update(dt) {
    // Fighters first (a charged technique advances and moves with its
    // fighter); then the projectiles they released this step spawn (once
    // each) and every projectile moves. Live clones advance, then the clones
    // summoned this step spawn (once each, on their cloud's first frame).
    // Melee, projectile, clone and charged-technique hits resolve, and spent
    // projectiles and finished clones are dropped.
    const fighters = this.fighters;
    for (const f of fighters) f.update(dt, this.simCtx);
    // Pushboxes keep every pair of fighters apart (a lone fighter has none).
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i];
        const b = fighters[j];
        separate(a.body, b.body, a.def.pushbox.width / 2, b.def.pushbox.width / 2, this.stage);
      }
    }
    for (const f of fighters) resolveSolidOverlap(f.body, this.stage);
    spawnProjectiles(fighters, this.projectiles);
    for (const p of this.projectiles) p.update(dt, this.stage);
    updateClones(this.clones, dt);
    spawnClones(fighters, this.clones, this.stage);
    this.combat.update(fighters, this.projectiles, this.clones);
    removeDeadProjectiles(this.projectiles);
    removeDeadClones(this.clones);
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
    // Clones and their clouds behind the fighters: a clone stands behind
    // its target, so the real fighter stays in front where they overlap.
    for (const c of this.clones) this.drawClone(c);
    // Player 1 last, so it is always drawn on top (behind it, the CPU).
    for (let i = this.fighters.length - 1; i >= 0; i--) this.drawFighter(this.fighters[i]);
    // A charged technique's sphere over the fighters, so the glowing orb is
    // never hidden behind a body, whether in a hand or on a caught opponent.
    for (const f of this.fighters) if (f.technique) this.drawTechnique(f.technique);
    // Projectiles over the fighters, so a shuriken stays visible in front.
    for (const p of this.projectiles) this.drawProjectile(p);
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
    // Mirroring follows the playing clip's own source orientation.
    drawFrame(this.ctx, frame, sx, sy, this.pxPerArt, f.spriteFlip);
  }

  // The clone's body (the owner's real art, mirrored by the same per-clip
  // rule), then its cloud over it, centred at the cloud offset at the
  // fighters' art scale and never mirrored. No shadow, ring or marker.
  drawClone(c) {
    const body = c.frame;
    if (body) {
      const [sx, sy] = this.toScreen(c.x, c.y);
      drawFrame(this.ctx, body, sx, sy, this.pxPerArt, c.spriteFlip);
    }
    const cloud = c.cloudFrame;
    if (cloud) {
      const [sx, sy] = this.toScreen(...c.cloudCenter());
      drawCenteredFrame(this.ctx, cloud, sx, sy, this.pxPerArt, false);
    }
  }

  // The technique's sphere frame, centred on the hand or the caught
  // opponent (interpolated like the fighters), at the fighters' art scale
  // times the technique's own sphereScale (it grows on the target; the
  // centre stays put), and never mirrored: a round effect only moves its
  // offset with facing.
  drawTechnique(t) {
    const sphere = t.sphere;
    const center = sphere && t.sphereCenter(true);
    if (!center) return;
    const [sx, sy] = this.toScreen(...center);
    const source = sphere.anim.sourceFacing;
    const frame = sphere.anim.frames[sphere.index];
    drawCenteredFrame(this.ctx, frame, sx, sy, this.pxPerArt * t.sphereScale, !!source && t.facing !== source);
  }

  // Centred on the projectile's position, at the fighters' art scale.
  drawProjectile(p) {
    const [sx, sy] = this.toScreen(p.renderX, p.renderY);
    drawCenteredFrame(this.ctx, p.frame, sx, sy, this.pxPerArt, p.flip);
  }

  // Name-tag font size, in device pixels.
  get markerFont() {
    return Math.max(10, Math.round(9.5 * this.view.scale));
  }

  // Where `f`'s name tag hangs, in device pixels: its centre x, the y just
  // over the head where the tag's box ends and its arrow points down, and
  // the y of the feet. Practice Ground floats its damage numbers from here.
  markerAnchor(f) {
    const [x, footY] = this.toScreen(f.renderX, f.renderY);
    return [x, footY - (f.def.visual.height + 16) * this.view.scale, footY];
  }

  drawMarkers() {
    const { ctx, view } = this;
    const s = view.scale;
    const font = this.markerFont;
    ctx.font = `700 ${font}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const f of this.fighters) {
      const color = MARKER[f.slot];
      const [x, top, footY] = this.markerAnchor(f);
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
      // Hurtboxes turn gray while a Dodge makes the fighter invulnerable.
      for (const hb of f.def.hurtboxes) {
        worldBox(f, hb, box);
        rect(box.x, box.y, box.w, box.h, f.combat.invulnerable ? '#8a8a8a' : '#4aa8ff');
      }
      // Attack hitbox, only while it can connect.
      const atk = f.combat.attack;
      if (atk?.def.hitbox && f.combat.phase === 'active') {
        worldBox(f, atk.def.hitbox, box);
        rect(box.x, box.y, box.w, box.h, '#ffb020');
      }
    }
    // Projectile hitboxes, magenta and labelled, drawn where the sprite is
    // drawn (interpolated) so the fit around the art can be judged.
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    // Clone attack hitboxes, in the attack colour and labelled, during the
    // active phase like a fighter's. A clone has no hurtboxes to draw.
    for (const c of this.clones) {
      if (!c.activeBox(box)) continue;
      rect(box.x, box.y, box.w, box.h, '#ffb020');
      const [lx, ly] = this.toScreen(box.x, box.y);
      ctx.fillStyle = '#ffb020';
      ctx.fillText(`clone ${c.attackDef.id}`, Math.round(lx), Math.round(ly) - 2);
    }
    for (const p of this.projectiles) {
      p.hitbox(box);
      box.x += p.renderX - p.x;
      box.y += p.renderY - p.y;
      rect(box.x, box.y, box.w, box.h, '#ff4dff');
      const [lx, ly] = this.toScreen(box.x, box.y);
      ctx.fillStyle = '#ff4dff';
      ctx.fillText(p.def.id, Math.round(lx), Math.round(ly) - 2);
    }
    // Charged techniques, dashed cyan: the rushing sphere's hitbox while it
    // can connect, then a cross on the sphere's centre once it is attached
    // to the caught opponent, drawn where the sphere is drawn. A bound
    // fighter is labelled over its hurtboxes.
    ctx.setLineDash([4, 3]);
    ctx.fillStyle = TECHNIQUE_DEBUG;
    for (const f of this.fighters) {
      const t = f.technique;
      if (!t) continue;
      const label = `charged ${DEBUG_BUTTON[t.action] ?? t.action} ${t.phase}`;
      if (t.sphereHitbox(box, true)) {
        rect(box.x, box.y, box.w, box.h, TECHNIQUE_DEBUG);
        const [lx, ly] = this.toScreen(box.x, box.y);
        ctx.fillText(label, Math.round(lx), Math.round(ly) - 2);
      } else if (t.sphereOwner === 'target') {
        const [cx, cy] = this.toScreen(...t.sphereCenter(true));
        ctx.strokeStyle = TECHNIQUE_DEBUG;
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) - 6, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx) + 7, Math.round(cy) + 0.5);
        ctx.moveTo(Math.round(cx) + 0.5, Math.round(cy) - 6);
        ctx.lineTo(Math.round(cx) + 0.5, Math.round(cy) + 7);
        ctx.stroke();
        ctx.fillText(label, Math.round(cx) + 8, Math.round(cy) - 8);
      }
    }
    for (const f of this.fighters) {
      if (!f.combat.immobilized) continue;
      const [lx, ly] = this.toScreen(f.renderX - f.body.halfW, f.renderY - f.body.height);
      ctx.fillText('bound', Math.round(lx), Math.round(ly) - 14);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const p = this.primary;
    const action = p.technique
      ? ` ${p.technique.def.id} ${p.technique.phase}`
      : p.combat.attack
        ? ` ${p.combat.attack.def.id} ${p.combat.phase}`
        : p.combat.defenseAction ? ` ${p.combat.defenseAction.def.animation} ${p.combat.defensePhase}` : '';
    // The other fighter's state under its own label (the CPU's, in Quick
    // Battle or practice); nothing when Player 1 is alone.
    const other = this.secondary;
    const rival = other ? `  ${other.label.toLowerCase()} ${other.state}${other.combat.immobilized ? ' (bound)' : ''}` : '';
    const lines = [
      `state ${p.state}${action}  grounded ${p.body.grounded}  ground ${p.body.ground?.id ?? '-'}`,
      `pos ${p.body.x.toFixed(1)}, ${p.body.y.toFixed(1)}  vel ${p.body.vx.toFixed(0)}, ${p.body.vy.toFixed(0)}`,
      `view ${view.w.toFixed(0)}x${view.h.toFixed(0)}  px/art ${this.pxPerArt.toFixed(2)}${rival}  clones ${this.clones.length}`,
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
    // No technique may keep its owner, target or bind past the arena.
    for (const f of this.fighters) f.endTechnique('destroy');
    this.fighters = [];
    this.projectiles = [];
    this.clones = [];
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
