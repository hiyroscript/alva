// Arena: the fixed-timestep simulation and Canvas 2D rendering shared by every
// mode that puts fighters on a stage. Quick Battle (js/game/battle.js) adds an
// opponent, phases, a round timer and points; Practice Ground
// (js/game/practice.js) runs Player 1 with a training-dummy CPU and none of
// them. Both share the Void's respawn wait (updateRespawns). DOM concerns
// (HUD, menus, overlays) live in each mode's screen; the status drawn over
// each fighter (Energy bar, name tag, the long move cooldowns, the orange
// mark over a fighter performing a Special ability) and the Shield round it
// are drawn here.

import { CONFIG } from '../config.js';
import { StageCollision, resolveSolidOverlap } from './physics.js';
import { PlatformHazards } from './platform-hazards.js';
import { StageHazards } from './stage-hazards.js';
import { separateFighters } from './fighters/fighter.js';
import { CombatSystem, worldBox } from './combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles, clashProjectiles } from './combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from './combat/summon.js';
import { applyPulls } from './combat/pull.js';
import { Camera } from './rendering/camera.js';
import { drawFrame, drawCenteredFrame } from './rendering/sprite-normalizer.js';
import { fighterParts } from './rendering/ensemble.js';
import {
  drawEnergyBar, drawCooldownIndicators, drawSpecialMark, energyBarState, specialMarkRect, statusOnScreen,
  charmMarkRect, drawCharmMark, fearMarkRect, drawFearMark, mashCounterState, mashCounterRect, drawMashCounter,
} from './rendering/fighter-status.js';
import { activeSpecialAbility } from './combat/move-status.js';
import { drawShield } from './rendering/shield-fx.js';
import { HIT_FX, HitEffects, whiteFrame } from './rendering/hit-fx.js';
import { createTheme } from '../stages/index.js';
import { slotLabel, t } from '../localization/i18n.js';

// Ground ring + name tag tones: the player is white, the CPU a mid gray. A
// mode may give its own (Local Play: each player's colour, see
// markerColors), always by slot, never by where a fighter stands.
export const MARKER = Object.freeze({ p1: '#ffffff', p2: '#a3a3a3' });
// Debug overlay: techniques get their own dashed colour, apart from
// melee / clone (orange) and projectile (magenta) boxes.
const TECHNIQUE_DEBUG = '#29f0ff';

export class Arena {
  // `seed` fixes the stage hazards' randomness (each its own stream of it,
  // see js/game/platform-hazards.js); a mode passes its own (a Battle's).
  constructor({ canvas, map, input, reducedMotion = false, seed = 0 }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.map = map;
    this.input = input;
    this.stage = new StageCollision(map);
    // The stage's hazards (its dynamic platforms, if any): this arena's own
    // runtime state, built fresh for every arena from the map, which is
    // never written.
    this.hazards = new PlatformHazards(this.stage, { seed });
    // The stage's other hazards (Adamaris's volcano and its rocks, Jökull's
    // breakable ice sections and blizzard, if any): also this arena's own,
    // seeded from the same seed on streams of their own (see
    // js/game/stage-hazards.js), so every battle starts with them whole and
    // calm and nothing of one battle reaches another.
    this.stageHazards = new StageHazards(this.stage, map, { seed });
    // The theme draws the live platforms (a hazard where it is now, as
    // solid and as visible as it is now) and the live stage hazards (the
    // volcano's state, the rocks in flight, their warnings and impacts),
    // never a copy of its own.
    this.theme = createTheme(map, { reducedMotion, platforms: this.stage.platforms, hazards: this.stageHazards });
    // Effects drawn here (the Shield's drifting edge) run on this clock, and
    // hold still with reduced motion.
    this.reducedMotion = reducedMotion;
    this.fxTime = 0;
    // How far a mode has closed the Void in (0-1, see setVoidPressure):
    // never, unless a mode says so (a Battle's overtime).
    this.voidPressure = 0;
    // The camera keeps the map's own bounds, whatever the Void in force.
    this.camera = new Camera();
    this.camera.setBounds(map.cameraBounds);
    this.camera.setAnchor(this.stage.centerX);
    this.combat = new CombatSystem();
    // Hit effects (js/game/rendering/hit-fx.js): screen shake, hit flashes, sparks,
    // speed trails and a lethal launch's slow motion. Presentation only:
    // they slow the clock the fixed steps are fed from, never a step.
    this.fx = new HitEffects({ reducedMotion });
    this.shakePx = { x: 0, y: 0 };
    this.gravity = CONFIG.sim.gravity;
    this.step = CONFIG.sim.step;
    this.acc = 0;
    this.debug = false;
    // `dpr`: device pixels per CSS pixel on the canvas, so drawn UI can keep
    // a readable size in CSS pixels however far the world zooms out.
    this.view = { ctx: this.ctx, x: 0, y: 0, w: 0, h: 0, scale: 1, pxW: 0, pxH: 0, dpr: 1 };
    this.simCtx = { stage: this.stage, gravity: this.gravity, battle: this };
    // Fighters in play, Player 1 first; each mode fills it.
    this.fighters = [];
    // Live projectiles (js/game/combat/projectile.js), in spawn order.
    this.projectiles = [];
    // Live summoned clones (js/game/combat/summon.js), in spawn order. Never
    // fighters: no pushbox, camera, HUD, marker or result role.
    this.clones = [];
    // The art techniques' bursts let go of (Fighter.effects): { clip,
    // sprites, x, y, flip, age }, each played once on the simulation clock
    // where it went out, then dropped. Art only.
    this.castEffects = [];
    // The fighter whose move cooldowns a screen's ability HUD shows
    // (js/ui/ability-hud.js), or a list of them (Local Play's two players,
    // each with their own HUD), or null: their world-space cooldown rings
    // step aside for it, so the same timer is never shown twice as
    // prominently. Every other fighter (the CPU, any fighter in a mode
    // without that HUD) keeps its rings.
    this.hudCooldownsFor = null;
    // Each slot's marker tone (the ground ring, the name tag and the
    // off-screen pointer).
    this.markerColors = MARKER;
    // A technique (js/game/combat/technique.js) lives on the
    // fighter performing it (`fighter.technique`), not here: that fighter
    // updates and ends it, and a reset ends it. What it releases is a
    // projectile here like any other.
  }

  // Player 1: the fighter the camera keeps in view and the view is scaled
  // for.
  get primary() {
    return this.fighters[0] ?? null;
  }

  // The fighter the camera frames alongside Player 1, or null when Player 1
  // is alone (see Camera.follow) or it has been lost to the Void.
  get secondary() {
    const f = this.fighters[1];
    return f && !f.lostToVoid ? f : null;
  }

  // The fighters still in play: every fighter, less any lost to the Void
  // (see checkVoid) and still waiting to respawn. Only they update, collide,
  // fight, are targeted and are drawn.
  get inPlay() {
    const all = this.fighters;
    return all.some((f) => f.lostToVoid) ? all.filter((f) => !f.lostToVoid) : all;
  }

  // Who the camera frames: the fighters in play, Player 1 first. While
  // Player 1 waits to respawn the other fighter leads alone; with nobody in
  // play the camera holds still.
  get cameraTargets() {
    const [lead = null, other = null] = this.inPlay;
    return [lead, other];
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
    // The view's own scale, before any zoom (see syncView).
    this.baseScale = scale;
    this.worldPerArt = sprites.worldPerArt;
    this.pxPerArt = scale * sprites.worldPerArt;
    Object.assign(this.view, { pxW, pxH, scale, dpr });
    this.camera.setView(pxW / scale, pxH / scale, scale);
    this.snapCamera();
    return true;
  }

  // Frames the fighters at once (see cameraTargets), if the view has been
  // sized.
  snapCamera() {
    if (!this.view.pxW) return;
    const [lead, other] = this.cameraTargets;
    if (lead) this.camera.snap(lead, other);
    this.syncView();
  }

  // ---- Loop -------------------------------------------------------------------

  frame(dt) {
    dt = Math.min(dt, CONFIG.sim.maxFrameDelta);
    // A lethal launch's slow motion feeds the fixed steps more slowly (see
    // HitEffects.timeScale); each step is still exactly one step.
    this.acc += dt * this.fx.timeScale;
    let steps = 0;
    while (this.acc >= this.step && steps < CONFIG.sim.maxStepsPerFrame) {
      this.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    if (steps >= CONFIG.sim.maxStepsPerFrame) this.acc = 0;
    const alpha = this.acc / this.step;
    // Platforms and fighters drawn the same share of the way between steps,
    // so whoever stands on a moving platform stays on it on screen.
    this.stage.interpolate(alpha);
    this.stageHazards.interpolate(alpha);
    for (const f of this.fighters) f.interpolate(alpha);
    for (const p of this.projectiles) p.interpolate(alpha);
    for (const f of this.fighters) this.fx.sampleTrail(f, dt);
    const [lead, other] = this.cameraTargets;
    if (lead) this.camera.follow(lead, other, dt);
    this.syncView();
    this.theme.update(dt, this.view);
    this.theme.advanceVoid(dt, this.voidWaveSpeed);
    this.fxTime += dt;
    this.render();
    // Aged after drawing, so what this frame's steps started (a one-frame
    // flash, a spark at age 0) is drawn at least once.
    this.fx.update(dt);
  }

  // One fixed step of the world. Modes with their own rules (phases, a
  // timer) run them first and then call this.
  update(dt) {
    // Any fighter whose respawn wait is over comes back first, and plays
    // this step. Then the stage's hazards take their step (each moves,
    // fades or relocates, and anyone standing on one that has just
    // vanished lets go of it), so every fighter then moves, rides and lands
    // on the platforms where they are now. Then the fighters (a technique advances with its
    // fighter); then the projectiles they released this step spawn (once
    // each), every projectile moves and those that meet settle it
    // (clashProjectiles). Live clones advance, then the clones summoned this
    // step spawn (once each, on their cloud's first frame). Pulls draw
    // fighters in (applyPulls), then melee, projectile, clone and technique
    // hits resolve; then the stage hazards take theirs (an ice section
    // counts the footings the fighters have just taken and may break away,
    // letting go of whoever stood on it; the weather moves on), the rocks
    // fly on, and those that land this step strike whoever their impact
    // meets (no attacker: see StageHazards.resolve), and spent projectiles
    // and finished clones are dropped. Last, any fighter now in the Void is
    // handed to the mode (checkVoid).
    this.updateRespawns(dt);
    const fighters = this.inPlay;
    this.updateCastEffects(dt);
    this.hazards.update(dt, fighters);
    for (const f of fighters) f.update(dt, this.simCtx);
    // A launch that rebounded off the stage this step shows its impact,
    // and a fighter that healed itself its glow.
    for (const f of fighters) if (f.bounce) this.fx.takeBounce(f.bounce);
    // A Super Jump that took off this step raises its dust where it left
    // the ground.
    for (const f of fighters) if (f.superJumpTakeoff) this.fx.addSuperJumpDust(f.superJumpTakeoff);
    for (const f of fighters) for (const heal of f.heals) this.fx.addHeal(f, heal);
    for (const f of fighters) for (const effect of f.effects) this.addCastEffect(f, effect);
    // Pushboxes keep every pair of fighters apart (a lone fighter has none;
    // a ricochet passes, see separateFighters).
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) separateFighters(fighters[i], fighters[j], this.stage);
    }
    for (const f of fighters) resolveSolidOverlap(f.body, this.stage);
    // Both fighters have moved: catch a side switch by the fighter updated
    // second as well, before melee hitboxes are resolved (Watch Mode too):
    // an aimed attack and the player's Automatic turn-around (see
    // Fighter.settleFacing).
    for (const f of fighters) f.settleFacing();
    spawnProjectiles(fighters, this.projectiles);
    for (const p of this.projectiles) p.update(dt, this.stage);
    clashProjectiles(this.projectiles);
    updateClones(this.clones, dt);
    spawnClones(fighters, this.clones, this.stage);
    applyPulls(fighters, this.projectiles, dt);
    this.combat.update(fighters, this.projectiles, this.clones);
    const landed = this.stageHazards.update(dt, { live: this.hazardsLive, fighters });
    for (const r of landed) this.fx.addShake(r.size === 'large' ? 4 : 2);
    // An ice section's break shakes the view a little as it fractures and
    // more as it tears away (never with reduced motion: see addShake).
    for (const e of this.stageHazards.events) {
      if (e.type === 'critical') this.fx.addShake(3);
      else if (e.type === 'separating') this.fx.addShake(7);
    }
    this.stageHazards.resolve(fighters, this.combat);
    this.fx.take(this.combat.events, this);
    removeDeadProjectiles(this.projectiles);
    removeDeadClones(this.clones);
    this.checkVoid(fighters);
  }

  // A technique's burst let go of `effect` (see Technique.takeEffect): its
  // clip, from `f`'s own art, plays once from this step where it went out,
  // at `f`'s art scale, mirrored with the technique's facing when the clip
  // faces a way (sourceFacing). Missing art shows nothing.
  addCastEffect(f, effect) {
    const clip = f.sprites?.effect(effect.animation);
    if (!clip?.frames.length) return;
    const source = clip.sourceFacing ?? 0;
    this.castEffects.push({ clip, sprites: f.sprites, x: effect.x, y: effect.y, flip: !!source && effect.facing !== source, age: 0 });
  }

  // Ages the cast effects by one step, dropping each once its clip has
  // played through.
  updateCastEffects(dt) {
    if (!this.castEffects.length) return;
    for (const e of this.castEffects) e.age += dt;
    this.castEffects = this.castEffects.filter((e) => e.age < e.clip.frames.length / e.clip.fps - 1e-6);
  }

  // Whether the stage hazards may strike and throw anything new: always,
  // unless a mode holds them (a Battle, outside its fight).
  get hazardsLive() {
    return true;
  }

  // ---- Void and respawn ----------------------------------------------------------

  // Every fighter whose centre has crossed the stage's Void boundary in
  // force this step (StageCollision.inVoid, never the animated edge) is out
  // of play (lostToVoid) and goes to onVoid, once. All of this step's are
  // out before any is handed on, so two taken on the same step are seen as
  // taken together (see Battle.onVoid). Each bursts where it was taken, in
  // its own colours (HitEffects.addElimination), caught before it leaves
  // play: the burst lives on in the effects, never on the fighter. And the
  // Void itself ripples where the fighter's centre crossed its boundary
  // (voidCrossing, HitEffects.addVoidRipple): first, so the burst plays
  // over it. Both are paint only: neither touches the boundary, the score
  // or the respawn.
  checkVoid(fighters) {
    const taken = fighters.filter((f) => !f.lostToVoid && this.stage.inVoid(f.body));
    for (const f of taken) {
      this.fx.addVoidRipple(voidCrossing(f.body, this.stage.void), f);
      this.fx.addElimination(f);
      f.lostToVoid = true;
      // A Mash Combo armed or running ends with its fighter's life.
      f.endMashCombo?.('void');
    }
    for (const f of taken) this.onVoid(f);
  }

  // Closes the Void in by `progress` (0-1: 0 is the map's own Void), for
  // collision and the drawn Void alike: both read the one rectangle in
  // force, `stage.void` (see StageCollision.closeVoid), so the black edge
  // is exactly where a fighter is taken. The tuning is
  // CONFIG.battle.overtimeVoid. Only a mode that closes the Void calls it
  // (a Battle's overtime); 0 also brings the waves back to their
  // normal speed and phase.
  setVoidPressure(progress) {
    this.voidPressure = Math.min(1, Math.max(0, Number(progress) || 0));
    this.stage.closeVoid(this.voidPressure, CONFIG.battle.overtimeVoid);
    if (this.voidPressure === 0) this.theme.resetVoid();
  }

  // How many times their normal speed the Void's drawn waves run: 1, rising
  // smoothly and ever faster with the Void's pressure to
  // CONFIG.battle.overtimeVoid.maxWaveSpeedMultiplier (1 + (max - 1) p²).
  get voidWaveSpeed() {
    const p = this.voidPressure;
    return 1 + (CONFIG.battle.overtimeVoid.maxWaveSpeedMultiplier - 1) * p * p;
  }

  // What entering the Void means is each mode's rule: Quick Battle scores a
  // point for the opponent and respawns the fighter unless that point won
  // the match (Battle.onVoid); Practice Ground only respawns it
  // (PracticeSession.onVoid).
  onVoid() {}

  // Starts `f`'s wait out of play: CONFIG.battle.respawnSeconds on the
  // simulation clock (see updateRespawns).
  scheduleRespawn(f) {
    f.respawnTimer = CONFIG.battle.respawnSeconds;
  }

  // One step of every respawn wait. A fighter whose wait is over is back at
  // its own spawn (Fighter.respawn: 0 Launch Point, full Energy, every
  // cooldown ready, nothing transient) and in play at once. Buffered presses
  // made while a player was out are dropped, so it comes back neutral: that
  // player's own (in Local Play the other player's are untouched).
  updateRespawns(dt) {
    for (const f of this.fighters) {
      if (f.respawnTimer === null) continue;
      f.respawnTimer -= dt;
      if (f.respawnTimer > 1e-6) continue;
      f.respawn(this.stage);
      if (f.controller?.kind !== 'player') continue;
      if (f.controller.flush) f.controller.flush();
      else this.input.flush();
    }
  }

  // Nothing else may aim at `f` once the Void takes it: a summon's startup
  // cast at it is cut short, and pending summons, clones and projectiles
  // aimed at it or released by it go. Its own technique ends with
  // `reason`, and its own summon's startup is cut short.
  detachFromPlay(f, reason) {
    f.endTechnique(reason);
    f.cancelSummon();
    for (const other of this.fighters) {
      if (other === f) continue;
      if (other.pendingSummon?.target === f) other.cancelSummon();
      other.summons = other.summons.filter((s) => s.target !== f);
    }
    const keep = (e) => e.owner !== f && e.target !== f;
    this.clones.splice(0, this.clones.length, ...this.clones.filter(keep));
    this.projectiles.splice(0, this.projectiles.length, ...this.projectiles.filter(keep));
  }

  // ---- Rendering --------------------------------------------------------------

  syncView() {
    const v = this.view;
    const cam = this.camera;
    // A lethal launch's zoom closes in, leaning toward the launched fighter
    // and never past the camera's bounds; the screen shake nudges the whole
    // view. Both are presentation only (see HitEffects).
    const zoom = this.fx.zoom;
    const scale = (this.baseScale ?? v.scale) * zoom;
    let x = cam.x;
    let y = cam.y;
    let w = cam.w;
    let h = cam.h;
    const focus = this.fx.zoomFocus;
    if (zoom > 1 && focus) {
      const { zoom: most, pull: lean } = HIT_FX.lethal;
      const pull = lean * Math.min(1, (zoom - 1) / (most - 1));
      w = cam.w / zoom;
      h = cam.h / zoom;
      const cx = cam.x + cam.w / 2 + (focus.renderX - (cam.x + cam.w / 2)) * pull;
      const cy = cam.y + cam.h / 2 + (focus.renderY - focus.body.height / 2 - (cam.y + cam.h / 2)) * pull;
      const b = cam.bounds;
      x = Math.min(Math.max(cx - w / 2, b.left), b.right - w);
      y = Math.min(Math.max(cy - h / 2, b.top), b.bottom - h);
    }
    const shake = this.fx.shakeOffset(this.shakePx);
    x += (shake.x * v.dpr) / scale;
    y += (shake.y * v.dpr) / scale;
    // Snap the camera to whole device pixels so layers and sprites agree.
    v.scale = scale;
    v.x = Math.round(x * scale) / scale;
    v.y = Math.round(y * scale) / scale;
    v.w = w;
    v.h = h;
    if (this.worldPerArt) this.pxPerArt = scale * this.worldPerArt;
  }

  render() {
    const { ctx, view, theme } = this;
    if (!view.pxW) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    theme.prepare(view);
    theme.drawBackground(ctx, view);
    theme.drawTerrain(ctx, view);

    // A fighter lost to the Void is gone from the stage: no body, shadow or
    // marker.
    const fighters = this.inPlay;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const f of fighters) this.drawShadow(f);
    // A Super Jump's dust on the ground it rose from, behind everything
    // that fights.
    this.fx.drawDust(ctx, (x, y) => this.toScreen(x, y), view.scale);
    ctx.imageSmoothingEnabled = false;
    // A burst's art behind everything that fights: it goes out round its
    // fighter, who stays in front of it.
    for (const e of this.castEffects) this.drawCastEffect(e);
    // Clones and their clouds behind the fighters: a clone stands behind
    // its target, so the real fighter stays in front where they overlap.
    for (const c of this.clones) this.drawClone(c);
    // Player 1 last, so it is always drawn on top (behind it, the CPU). A
    // raised Shield wraps its fighter: its faint interior behind the sprite,
    // its rim in front, so the fighter reads as inside it; both trace the
    // same waves, on this Arena's effects clock (see shield-fx.js).
    for (let i = fighters.length - 1; i >= 0; i--) {
      const f = fighters[i];
      this.drawTrail(f);
      drawShield(ctx, f, view, 'interior', this.fxTime, this.reducedMotion);
      this.drawFighter(f);
      drawShield(ctx, f, view, 'rim', this.fxTime, this.reducedMotion);
    }
    // Projectiles over the fighters, so a thrown one stays visible in front.
    for (const p of this.projectiles) this.drawProjectile(p);
    ctx.imageSmoothingEnabled = true;
    // Hit sparks over all of it, where each hit landed.
    this.fx.drawSparks(ctx, (x, y) => this.toScreen(x, y), view.dpr);

    theme.drawForeground(ctx, view);
    // The Void over everything on the stage: whatever falls into it is
    // swallowed by the black. It is drawn at the boundary in force, the
    // very rectangle collision tests (stage.void).
    theme.drawVoid(ctx, view, this.stage.void, this.fx.ripples);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // A fighter the Void took bursts over the black where it went in, after
    // it has gone from the stage.
    this.fx.drawEliminations(ctx, (x, y) => this.toScreen(x, y), view.scale, view.dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The status of each fighter in play over everything, the Void
    // included, so it stays readable near its edge: name tags (or the
    // off-screen pointers), then each on-screen fighter's Energy bar over
    // its tag while below full, its long cooldown icons under its feet
    // while cooling down and, while it performs a Special ability, the
    // orange mark over all of it. A fighter out of play shows none of it.
    this.drawMarkers(fighters);
    this.drawStatus(fighters);
    if (this.debug) this.drawDebug();
  }

  toScreen(x, y) {
    const v = this.view;
    return [(x - v.x) * v.scale, (y - v.y) * v.scale];
  }

  // The fighter's shadow and ground ring on the surface under it, solid
  // ones only: a hazard that has vanished takes none, and one fading out or
  // forming takes them as faintly as it shows. On a moving platform they
  // lie on it where it is drawn.
  drawShadow(f) {
    const { ctx, view } = this;
    const b = f.body;
    const surface = this.stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, f.renderY);
    const surfaceY = surface.ref?.dynamic ? surface.ref.renderY : surface.y;
    const height = Math.max(0, surfaceY - f.renderY);
    const fade = Math.max(0, 1 - height / 220) * (surface.ref?.opacity ?? 1);
    if (fade <= 0) return;
    const sh = this.theme.shadow;
    const [sx, sy] = this.toScreen(f.renderX, surfaceY);
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
    ctx.strokeStyle = this.markerColor(f);
    ctx.lineWidth = Math.max(1.5, view.scale * 1.2);
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx * 1.1, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Its frame, or a fighter drawn as several members every member's, each
  // at its place round the fighter (see fighterParts). Mirroring follows
  // the playing clip's own source orientation. Just hit, it shows for one
  // frame as a white silhouette of the same pose (all of it: one fighter).
  drawFighter(f) {
    const flashing = this.fx.flashing(f);
    const pxPerArt = this.pxPerArtOf(f.sprites);
    for (const part of fighterParts(f)) {
      const [sx, sy] = this.toScreen(part.x, part.y);
      drawFrame(this.ctx, flashing ? whiteFrame(part.frame) : part.frame, sx, sy, pxPerArt, part.flip);
    }
  }

  // Device pixels per art pixel for art from `sprites`: each fighter's art
  // (its poses, clones, projectiles and effects) keeps its own world size,
  // whoever the view was sized for (Player 1's, see resize), so two
  // different fighters are each drawn at their own visual.height.
  pxPerArtOf(sprites) {
    return this.view.scale * (sprites?.worldPerArt ?? this.worldPerArt);
  }

  // `f`'s speed trail: fading afterimages of its own poses where it just
  // was, behind it (see HitEffects.sampleTrail).
  drawTrail(f) {
    const ghosts = this.fx.ghosts(f);
    if (!ghosts.length) return;
    const { ctx } = this;
    ctx.save();
    for (const g of ghosts) {
      ctx.globalAlpha = g.alpha;
      for (const part of g.parts) {
        const [sx, sy] = this.toScreen(part.x, part.y);
        drawFrame(ctx, part.frame, sx, sy, this.pxPerArtOf(f.sprites), part.flip);
      }
    }
    ctx.restore();
  }

  // The clone's body (the owner's real art, mirrored by the same per-clip
  // rule), then its cloud over it, centred at the cloud offset at its
  // owner's art scale and never mirrored. No shadow, ring or marker.
  drawClone(c) {
    const body = c.frame;
    if (body) {
      const [sx, sy] = this.toScreen(c.x, c.y);
      drawFrame(this.ctx, body, sx, sy, this.pxPerArtOf(c.owner?.sprites), c.spriteFlip);
    }
    const cloud = c.cloudFrame;
    if (cloud) {
      const [sx, sy] = this.toScreen(...c.cloudCenter());
      drawCenteredFrame(this.ctx, cloud, sx, sy, this.pxPerArtOf(c.owner?.sprites), false);
    }
  }

  // The frame a cast effect is on (one pass of its clip on its own age),
  // centred where it went out.
  drawCastEffect(e) {
    const i = Math.min(Math.floor(e.age * e.clip.fps + 1e-6), e.clip.frames.length - 1);
    const [sx, sy] = this.toScreen(e.x, e.y);
    drawCenteredFrame(this.ctx, e.clip.frames[i], sx, sy, this.pxPerArtOf(e.sprites), e.flip);
  }

  // Centred on the projectile's position, at the art scale of the fighter
  // whose art it is (its owner's at release: a projectile turned back keeps
  // its size), spun to its angle (see Projectile.renderAngle).
  drawProjectile(p) {
    const [sx, sy] = this.toScreen(p.renderX, p.renderY);
    drawCenteredFrame(this.ctx, p.frame, sx, sy, this.pxPerArtOf(p.sprites ?? p.owner?.sprites), p.flip, p.renderAngle);
  }

  // Name-tag font size, in device pixels.
  get markerFont() {
    return Math.max(10, Math.round(9.5 * this.view.scale));
  }

  // Where `f`'s name tag hangs, in device pixels: its centre x, the y just
  // over the head where the tag's box ends and its arrow points down, and
  // the y of the feet. Everything drawn over the fighter stacks from here.
  markerAnchor(f) {
    const [x, footY] = this.toScreen(f.renderX, f.renderY);
    return [x, footY - (f.def.visual.height + 16) * this.view.scale, footY];
  }

  // The top of the name tag's box (see drawMarkers), in device pixels.
  markerTop(f) {
    return this.markerAnchor(f)[1] - this.markerFont * 1.25;
  }

  // Where `f`'s Energy bar goes when it shows, in device pixels: { x, y,
  // w, h } (y its top), just over its name tag. Compact: about the
  // fighter's width at this zoom (roughly 45-60 px on a desktop screen),
  // never narrower than 44 CSS px or thinner than 4.
  energyBarRect(f) {
    const { scale: s, dpr } = this.view;
    const [x] = this.markerAnchor(f);
    const w = Math.round(Math.max(44 * dpr, 50 * s));
    const h = Math.round(Math.max(4 * dpr, 4.5 * s));
    const gap = Math.round(Math.max(3 * dpr, 3 * s));
    return { x: Math.round(x - w / 2), y: Math.round(this.markerTop(f) - gap - h), w, h };
  }

  // The top of `f`'s tag-and-bar column: the top of its Energy bar's
  // outline while the bar shows, else the top of its name tag, so no room
  // is kept for a hidden bar.
  barTop(f) {
    return energyBarState(f).visible ? this.energyBarRect(f).y - 1 : this.markerTop(f);
  }

  // Where `f`'s Special ability mark goes (see specialMarkRect in
  // js/game/rendering/fighter-status.js), in device pixels, while it
  // performs one of its Special abilities (activeSpecialAbility, read live
  // every frame: from the step its technique, summon's startup or attack
  // is accepted to the step it ends, however it ends); null otherwise.
  // Above its Energy bar or name tag, never over them. Its resting place:
  // the gentle bob is drawn, not laid out.
  specialMarkRect(f) {
    if (!activeSpecialAbility(f)) return null;
    const [x] = this.markerAnchor(f);
    return specialMarkRect(x, this.barTop(f), this.view.scale, this.view.dpr);
  }

  // Where `f`'s charm mark goes (see charmMarkRect in
  // js/game/rendering/fighter-status.js), in device pixels, for as long as
  // it is charmed (CombatState.charm, read live every frame); null
  // otherwise. Above its Special ability mark while that shows, else above
  // its Energy bar or name tag.
  charmMarkRect(f) {
    if (!(f.combat?.charm > 0)) return null;
    const [x] = this.markerAnchor(f);
    const special = this.specialMarkRect(f);
    return charmMarkRect(x, special ? special.y - 1 : this.barTop(f), this.view.scale, this.view.dpr);
  }

  // Where `f`'s fear mark goes (see fearMarkRect in
  // js/game/rendering/fighter-status.js), in device pixels, for as long as
  // it is frightened (CombatState.fear, read live every frame); null
  // otherwise. Above its charm mark or Special ability mark while one
  // shows, else above its Energy bar or name tag.
  fearMarkRect(f) {
    if (!(f.combat?.fear > 0)) return null;
    const [x] = this.markerAnchor(f);
    const below = this.charmMarkRect(f) ?? this.specialMarkRect(f);
    return fearMarkRect(x, below ? below.y - 1 : this.barTop(f), this.view.scale, this.view.dpr);
  }

  // Where `f`'s Mash Combo counter goes (see mashCounterRect in
  // js/game/rendering/fighter-status.js), in device pixels, while its Mash
  // Combo is armed or running (read live every frame); null otherwise.
  // Above every mark that shows, else above its Energy bar or name tag.
  mashCounterRect(f) {
    if (!mashCounterState(f)) return null;
    const [x] = this.markerAnchor(f);
    const below = this.fearMarkRect(f) ?? this.charmMarkRect(f) ?? this.specialMarkRect(f);
    return mashCounterRect(x, below ? below.y - 1 : this.barTop(f), this.view.scale, this.view.dpr);
  }

  // The highest point of what is drawn over `f`: the top of its Mash Combo
  // counter, fear mark, charm mark or Special ability mark while one shows,
  // else of its Energy bar or name tag (see barTop). Practice Ground floats
  // its damage numbers from here.
  statusTop(f) {
    const mark = this.mashCounterRect(f) ?? this.fearMarkRect(f) ?? this.charmMarkRect(f) ?? this.specialMarkRect(f);
    return mark ? mark.y - 1 : this.barTop(f);
  }

  // Energy bars, the long move cooldowns, the Special ability mark, the
  // charm mark and the fear mark, for the fighters whose body is on screen
  // (the cooldowns of the fighter the ability HUD shows are there instead:
  // see hudCooldownsFor): an off-screen fighter only gets its edge pointer.
  // Each draws only while it has something to show (see
  // js/game/rendering/fighter-status.js); the marks, for whichever fighters
  // are performing a Special or are charmed or frightened at once, Player 1
  // or a CPU alike.
  drawStatus(fighters = this.inPlay) {
    const { ctx, view } = this;
    for (const f of fighters) {
      const [x, , footY] = this.markerAnchor(f);
      if (!statusOnScreen(x, footY, view)) continue;
      drawEnergyBar(ctx, f, this.energyBarRect(f), view.dpr);
      if (!this.cooldownsInHud(f)) drawCooldownIndicators(ctx, f, x, footY, view.scale, view.dpr);
      const mark = this.specialMarkRect(f);
      if (mark) drawSpecialMark(ctx, mark, view.dpr, this.fxTime, this.reducedMotion);
      const charm = this.charmMarkRect(f);
      if (charm) drawCharmMark(ctx, charm, view.dpr, this.fxTime, this.reducedMotion);
      const fear = this.fearMarkRect(f);
      if (fear) drawFearMark(ctx, fear, view.dpr, this.fxTime, this.reducedMotion);
      const mash = mashCounterState(f);
      if (mash) {
        const label = mash.turn ? t('hud.mashCombo', { turn: mash.turn, turns: mash.turns }) : t('hud.mashComboReady');
        drawMashCounter(ctx, this.mashCounterRect(f), mash, label, view.dpr, this.reducedMotion);
      }
    }
  }

  // Whether a screen's ability HUD carries `f`'s cooldowns (see
  // hudCooldownsFor).
  cooldownsInHud(f) {
    const shown = this.hudCooldownsFor;
    return Array.isArray(shown) ? shown.includes(f) : f === shown;
  }

  // `f`'s marker tone: its slot's.
  markerColor(f) {
    return this.markerColors?.[f.slot] ?? MARKER[f.slot] ?? MARKER.p2;
  }

  drawMarkers(fighters = this.inPlay) {
    const { ctx, view } = this;
    const s = view.scale;
    const font = this.markerFont;
    ctx.font = `700 ${font}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const f of fighters) {
      const color = this.markerColor(f);
      // The tag as the HUD shows it, in the interface language (P1 or J1).
      const tag = slotLabel(f.label);
      const [x, top, footY] = this.markerAnchor(f);
      const onScreen = x > -10 && x < view.pxW + 10;
      if (onScreen) {
        ctx.fillStyle = 'rgba(8,8,8,0.55)';
        const tw = ctx.measureText(tag).width + font * 0.8;
        ctx.fillRect(Math.round(x - tw / 2), Math.round(top - font * 1.25), Math.round(tw), Math.round(font * 1.2));
        ctx.fillStyle = color;
        ctx.fillText(tag, Math.round(x), Math.round(top - font * 0.2));
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
        ctx.fillText(tag, ex + edge * font * 0.1 + edge * font * 0.45, ey + font * 2.2);
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
    // Solid platforms only (a vanished hazard has no collision to show),
    // where they are drawn.
    for (const p of this.stage.platforms) {
      if (p.active !== false) rect(p.renderX, p.renderY, p.w, 2, p.dropThrough ? '#ffffff' : '#ff3b3b');
    }
    // Solids, the main floor's block among them (its top the ground): only
    // those there now (a floor section that broke away has no collision).
    for (const so of this.stage.solids) if (so.active !== false) rect(so.x, so.y, so.w, so.h, '#ff3b3b');
    // The Void's fixed kill boundary, dashed: the line gameplay tests, not
    // the wavering edge drawn over it.
    const v = this.stage.void;
    ctx.setLineDash([8, 6]);
    rect(v.left, v.top, v.right - v.left, v.bottom - v.top, '#b06cff');
    ctx.setLineDash([]);
    const box = {};
    const fighters = this.inPlay;
    for (const f of fighters) {
      const b = f.body;
      rect(b.x - b.halfW, b.y - b.height, b.halfW * 2, b.height, '#3cff7a');
      // Hurtboxes, the same whether or not the Shield is up: it blocks what
      // reaches them, never a bigger area.
      for (const hb of f.def.hurtboxes) {
        worldBox(f, hb, box);
        rect(box.x, box.y, box.w, box.h, '#4aa8ff');
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
    // Techniques, dashed cyan: a burst's box through the release it lands
    // on, labelled by the attack it is and its phase (e.g. "attack4
    // release" for #0001's Unlimited Void). A paralyzed, shielding or
    // ricocheting fighter is labelled over its hurtboxes (a paralysis with
    // its seconds left, a ricochet with its rebound count).
    ctx.setLineDash([4, 3]);
    ctx.fillStyle = TECHNIQUE_DEBUG;
    for (const f of fighters) {
      const t = f.technique;
      if (!t || t.phase !== 'release' || !t.burstBox(box, true)) continue;
      rect(box.x, box.y, box.w, box.h, TECHNIQUE_DEBUG);
      const [lx, ly] = this.toScreen(box.x, box.y);
      ctx.fillText(`${t.def.id} ${t.phase}`, Math.round(lx), Math.round(ly) - 2);
    }
    for (const f of fighters) {
      const tag = f.combat.immobilized ? `paralyzed ${f.combat.paralysis.toFixed(1)}` : f.combat.shielding ? 'shield'
        : f.ricocheting ? `ricochet ${f.launch.bounces}` : null;
      if (!tag) continue;
      const [lx, ly] = this.toScreen(f.renderX - f.body.halfW, f.renderY - f.body.height);
      ctx.fillText(tag, Math.round(lx), Math.round(ly) - 14);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const p = this.primary;
    const action = p.technique
      ? ` ${p.technique.def.id} ${p.technique.phase}`
      : p.pendingSummon
        ? ` ${p.pendingSummon.id} startup`
        : p.combat.attack
        ? ` ${p.combat.attack.def.id} ${p.combat.phase}`
        : p.combat.shielding ? ` shield ${Math.round(p.combat.energy)}` : '';
    // The other fighter's state under its own label (the CPU's, in Quick
    // Battle or practice); nothing when Player 1 is alone.
    const other = this.secondary;
    const rival = other ? `  ${other.label.toLowerCase()} ${other.state}${other.combat.immobilized ? ' (paralyzed)' : ''}` : '';
    const lines = [
      `state ${p.state}${action}  grounded ${p.body.grounded}  ground ${p.body.ground?.id ?? '-'}`,
      `pos ${p.body.x.toFixed(1)}, ${p.body.y.toFixed(1)}  vel ${p.body.vx.toFixed(0)}, ${p.body.vy.toFixed(0)}`,
      `view ${view.w.toFixed(0)}x${view.h.toFixed(0)}  px/art ${this.pxPerArt.toFixed(2)}${rival}  clones ${this.clones.length}`,
    ];
    // Each stage hazard's state, solid or not.
    const hazards = this.hazards.controllers;
    if (hazards.length) lines.push(`hazards ${hazards.map((c) => `${c.id} ${c.state}${c.platform.active ? '' : ' (no collision)'}`).join('  ')}`);
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
    // No technique may keep its owner past the arena, nor a summon's
    // startup its target.
    for (const f of this.fighters) {
      f.endTechnique('destroy');
      f.cancelSummon();
    }
    this.fighters = [];
    this.projectiles = [];
    this.clones = [];
    this.castEffects = [];
    // Nothing of the stage hazards outlives the arena: no rock in flight,
    // impact or warning.
    this.stageHazards.reset();
  }
}

// Where body `b` crossed the Void's boundary `v` (the rectangle in force,
// the one StageCollision.inVoid tests) this step: { side, x, y }, the point
// on the boundary its centre passed through on its way from where it was a
// step ago (prevX, prevY) to where it is now, and the side ('left',
// 'right', 'top' or 'bottom') it crossed first; a diagonal through a corner
// takes the side it reached first. A centre that was already outside a step
// ago (a Void that closed over it) is anchored to the nearest point of the
// boundary to where it is now, on the side it is furthest past.
export function voidCrossing(b, v) {
  const x1 = b.x;
  const y1 = b.y - b.height / 2;
  const x0 = b.prevX ?? x1;
  const y0 = (b.prevY ?? b.y) - b.height / 2;
  const inside = x0 >= v.left && x0 <= v.right && y0 >= v.top && y0 <= v.bottom;
  if (inside) {
    let best = null;
    const cross = (side, line, from, to) => {
      if (from === to) return;
      const t = (line - from) / (to - from);
      if (t < 0 || t > 1 || (best && t >= best.t)) return;
      best = { side, t };
    };
    if (x1 < v.left) cross('left', v.left, x0, x1);
    if (x1 > v.right) cross('right', v.right, x0, x1);
    if (y1 < v.top) cross('top', v.top, y0, y1);
    if (y1 > v.bottom) cross('bottom', v.bottom, y0, y1);
    if (best) {
      const x = x0 + (x1 - x0) * best.t;
      const y = y0 + (y1 - y0) * best.t;
      return {
        side: best.side,
        x: best.side === 'left' ? v.left : best.side === 'right' ? v.right : Math.min(v.right, Math.max(v.left, x)),
        y: best.side === 'top' ? v.top : best.side === 'bottom' ? v.bottom : Math.min(v.bottom, Math.max(v.top, y)),
      };
    }
  }
  const past = { left: v.left - x1, right: x1 - v.right, top: v.top - y1, bottom: y1 - v.bottom };
  const side = Object.keys(past).reduce((a, c) => (past[c] > past[a] ? c : a), 'left');
  return {
    side,
    x: side === 'left' ? v.left : side === 'right' ? v.right : Math.min(v.right, Math.max(v.left, x1)),
    y: side === 'top' ? v.top : side === 'bottom' ? v.bottom : Math.min(v.bottom, Math.max(v.top, y1)),
  };
}

// Device pixels per world unit, chosen so a fighter of the reference height
// (CONFIG.render.fighterHeight) is ~10% of the viewport height (a
// platform-fighter view), zoomed out further when needed so the whole main
// stage and a little air past its ledges fit across the view, but never so
// far that it drops below fighterScreenRatioMin. The same whoever is
// picked: a fighter drawn taller or shorter (its own visual.height) is
// just that on the same stage. When possible each art pixel of `sprites`
// (Player 1's) maps to a whole number of device pixels for crisp pixel
// art. The view is never allowed to exceed the camera bounds.
export function computeWorldScale(pxW, pxH, sprites, map) {
  const r = CONFIG.render;
  // The reference height in `sprites`' art pixels.
  const artH = r.fighterHeight / sprites.worldPerArt;
  const minPx = (r.fighterScreenRatioMin * pxH) / artH;
  const maxPx = (r.fighterScreenRatioMax * pxH) / artH;
  const main = map.mainStage;
  const frameW = main.right - main.left + 2 * r.stageFrameMargin;
  const fitPx = (pxW / frameW) * sprites.worldPerArt;
  const ideal = Math.max(minPx, Math.min((r.fighterScreenRatio * pxH) / artH, fitPx));
  let pxPerArt = ideal;
  if (r.pixelPerfect) {
    // Snap only when the whole-pixel size stays close to the target, inside
    // the min / max ratio, and never closer in than the stage fit allows; on
    // small screens a 2-vs-3 px choice would change the fighter size too much.
    const limit = Math.max(fitPx, minPx) + 1e-9;
    const opts = [Math.floor(ideal), Math.ceil(ideal)]
      .filter((n) => n >= 1 && Math.abs(n - ideal) / ideal <= 0.12)
      .filter((n) => n >= minPx && n <= maxPx && n <= limit)
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
