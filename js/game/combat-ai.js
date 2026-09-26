// Combat AI: Quick Battle's CPU opponent (Practice Ground keeps its
// controller-less training dummy; see js/game/practice.js).
//
// A controller like PlayerController: Fighter.update asks it for one
// FighterInput snapshot per fixed step, and that is all it ever produces.
// Every attack, Throw, Shield, Charge, charged action, jump and Dash happens
// because it pressed or held the same inputs a player would, and the fighter
// and combat engine decide what those inputs do, exactly as for Player 1. It
// never moves, hurts, spawns, cancels or refreshes anything itself, and it
// never writes to a fighter.
//
// Difficulty (js/data/difficulty.js) changes how well it thinks, never what
// its fighter can do. Its profile tunes perception and judgement only:
//
//   sense     one honest picture of the fight from what is on screen: both
//             fighters' positions, motion, attacks and their phases, Shield,
//             Charge, Energy, Launch Point and cooldowns, the projectiles and
//             clones in play, the stage, the score and the clock. Never the
//             player's raw input: an attack is seen once the fighter starts
//             it, not when a key goes down.
//   evaluate  score the options that fit the moment (answer a threat, strike,
//             Throw, approach, space, Dash, jump in, Charge for a charged
//             action, make for the centre, wait), each option built from the
//             fighter's own move data, and take the best one after the
//             level's noise.
//   act       turn the chosen intent into held buttons and one-step presses,
//             over as many steps as it needs (turn, then strike; hold Charge,
//             then press the charged action; tap, release, tap for a Dash).
//
// Reaction: something new the opponent does (an attack's startup, a
// projectile, a clone's cloud, a charged technique, a whiff, a Charge) is an
// event. Each is noticed once, after a delay sampled from the level's
// reaction window, or not at all (its lapse chance); only then can it be
// answered. Nothing is answered on the step it appears, on any level.
// Neutral decisions happen on the level's own reassessment cadence, and a
// chosen plan is kept for the level's planning time before it is thought
// over again (a threat always interrupts it).
//
// Prediction is limited to motion: the opponent's position a short horizon
// ahead (the level's lookahead) from its current velocity, and the path of a
// projectile or a charged rush already under way. Never future inputs.

import { range, clamp } from '../core/utils.js';
import { COMBAT_ACTIONS } from './character.js';
import { worldBox } from './combat.js';
import { summonProblem } from './clone.js';
import { techniqueProblem } from './charged-technique.js';
import { blankInput } from './fighter-controller.js';
import { DEFAULT_DIFFICULTY, getDifficultyProfile, resolveDifficulty } from '../data/difficulty.js';

// The buttons a controller holds; each has a matching `…Pressed` edge.
const BUTTONS = ['left', 'right', 'charge', 'jump', 'defense', 'primary', 'special', 'action1', 'action2'];
const DIR_KEY = { [-1]: 'left', 1: 'right' };

// Threats further off than this (seconds to contact) wait for a later look.
const DEFENSE_HORIZON = 0.45;
// Never hold a Shield longer than this for one threat: no turtling.
const SHIELD_MAX_HOLD = 0.9;
// World units kept clear of a main-floor edge when walking, beyond the
// stopping distance at the current speed.
const LEDGE_MARGIN = 10;
// A neutral press of a direction waits this long after the last press of the
// same direction, so walking never double-taps into a Dash by accident.
const TAP_SLACK = 1 / 60;

const passOf = (anim) => (anim ? anim.frames.length / anim.fps : 0);
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Height above take-off `t` seconds into a jump at `v` under gravity `g`.
const jumpHeight = (v, g, t) => v * t - 0.5 * g * t * t;
// How far a body sliding at `vx` travels in `t` seconds while braking at `decel`.
const slide = (vx, decel, t) => Math.sign(vx) * Math.min(Math.abs(vx) * t, (vx * vx) / (2 * decel));

// Horizontal half-width and vertical span of a fighter's hurtboxes (their
// union, either facing), read from its own data.
export function hurtExtent(def) {
  let hw = 0;
  let top = Infinity;
  let bottom = -Infinity;
  for (const hb of def.hurtboxes ?? []) {
    hw = Math.max(hw, Math.abs(hb.x), Math.abs(hb.x + hb.w));
    top = Math.min(top, hb.y);
    bottom = Math.max(bottom, hb.y + hb.h);
  }
  if (!Number.isFinite(top)) return { hw: def.collider.width / 2, top: -def.collider.height, bottom: 0 };
  return { hw, top, bottom };
}

// Where hitbox `hb` (facing right from its owner's origin) meets a target
// whose hurtboxes span `e`: the target's origin must be between `lo` and
// `hi` ahead of the owner's, and between `dyLo` and `dyHi` below it.
export function reachOf(hb, e) {
  return { lo: hb.x - e.hw, hi: hb.x + hb.w + e.hw, dyLo: hb.y - e.bottom, dyHi: hb.y + hb.h - e.top };
}

const within = (r, d, dy) => d > r.lo && d < r.hi && dy > r.dyLo && dy < r.dyHi;

// ---- Moveset: what a fighter can do, from its own data ------------------------

const MOVESETS = new WeakMap();

// Read once per fighter (and again if its definition or art changes): every
// attack a button starts, on the ground and in the air, split into melee and
// ranged; its charged actions; whether it has a Shield and a Dash. An action
// mapped to null (a reserved button, like #0001's Special) is left out, as is
// anything the fighter would refuse for missing art, so the AI never presses
// a button that cannot do anything.
export function readMoveset(f) {
  const cached = MOVESETS.get(f);
  if (cached && cached.def === f.def && cached.sprites === f.sprites) return cached;
  const { def, sprites } = f;
  const melee = [];
  const ranged = [];
  for (const action of COMBAT_ACTIONS) {
    const mapping = def.actions?.[action];
    if (!mapping) continue;
    const pairs = typeof mapping === 'string' ? [[mapping, false], [mapping, true]] : [[mapping.ground, false], [mapping.air, true]];
    for (const [id, air] of pairs) {
      const atk = id ? f.attacks[id] : null;
      if (!atk || (air && atk.groundOnly) || !atk.animation || !sprites.has(atk.animation)) continue;
      if (atk.projectile) {
        const proj = f.projectileDefs[atk.projectile.id];
        if (!proj?.animation || !sprites.projectile(proj.animation) || !(proj.speed > 0)) continue;
        ranged.push({ action, air, id, atk, proj });
      } else if (atk.hitbox) {
        melee.push({ action, air, id, atk });
      }
    }
  }
  const charged = [];
  for (const action of COMBAT_ACTIONS) {
    const spec = def.chargedActions?.[action];
    if (spec?.type === 'summon') {
      const summon = f.summonDefs[spec.id];
      if (!summon || summonProblem(f, summon)) continue;
      const attack = f.attacks[summon.attack];
      // From the press to its strike: one pass of the cloud, then the attack's startup.
      const lead = passOf(sprites.effect(summon.cloud)) + (attack?.startup ?? 0);
      charged.push({ action, type: 'summon', id: spec.id, lead, hit: attack });
    } else if (spec?.type === 'technique') {
      const t = f.techniqueDefs[spec.id];
      if (!t || techniqueProblem(f, t)) continue;
      const form = Math.max(sprites.duration(t.formAnimation), passOf(sprites.effect(t.sphereBuild)));
      const rush = sprites.duration(t.dashAnimation);
      // The span the sphere sweeps over the rush, facing right from the
      // fighter's origin: its hand positions through the dash clip, carried
      // forward by the rush.
      const hands = t.handOffsets?.[t.dashAnimation]?.length ? t.handOffsets[t.dashAnimation] : [{ x: 0, y: 0 }];
      const hb = t.sphereHitbox;
      const x0 = Math.min(...hands.map((h) => h.x)) + hb.x;
      const x1 = Math.max(...hands.map((h) => h.x)) + hb.x + hb.w + t.dashSpeed * rush;
      const y0 = Math.min(...hands.map((h) => h.y)) + hb.y;
      const y1 = Math.max(...hands.map((h) => h.y)) + hb.y + hb.h;
      const ticks = t.tickHit ? Math.floor(t.explosionDelay / t.tickInterval) : 0;
      const damage = (t.firstHit?.damage ?? 0) + ticks * (t.tickHit?.damage ?? 0) + (t.explosionHit?.damage ?? 0);
      charged.push({
        action, type: 'technique', id: spec.id, lead: form, form, rush,
        box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        hit: { ...t.explosionHit, damage },
      });
    }
  }
  const dashDistance = (def.movement?.dashSpeed ?? 0) * f.dashDuration;
  const moveset = {
    def, sprites, melee, ranged, charged,
    shield: f.defense?.type === 'shield',
    dash: dashDistance > 0 && sprites.has('dash') ? { distance: dashDistance, cost: f.energyDef.dashCost } : null,
    hurt: hurtExtent(def),
  };
  MOVESETS.set(f, moveset);
  return moveset;
}

// ---- The controller ---------------------------------------------------------------

export class CombatAIController {
  constructor({ difficulty = DEFAULT_DIFFICULTY, rng = Math.random } = {}) {
    this.kind = 'cpu';
    this.difficulty = resolveDifficulty(difficulty);
    this.profile = getDifficultyProfile(this.difficulty);
    this.rng = rng;
    this.out = blankInput();
    this.body = null;
    this.reset();
  }

  // Forget everything: the fighter was reset (a restart or rematch) or
  // respawned, so the fight starts over from neutral with nothing held.
  reset() {
    this.clock = 0;
    this.held = Object.fromEntries(BUTTONS.map((k) => [k, false]));
    this.prev = { ...this.held };
    this.thinkTimer = range(this.rng, this.profile.think[0], this.profile.think[1]);
    this.intent = null;
    this.events = [];
    this.seen = new WeakSet();
    this.openSeen = new WeakSet();
    this.foeWas = { charging: false, stunned: false, exhausted: false };
    // The last horizontal press and how long ago it was (see emit).
    this.tap = { dir: 0, age: Infinity };
    this.lastThrow = -Infinity;
    // When it last pressed an attack or landed a hit: the longer neutral
    // drags on, the more it wants to commit (see urge).
    this.lastOffence = 0;
    this.turning = false;
  }

  getInput(self, dt, ctx) {
    // A fresh body means Fighter.reset ran: a restart, a rematch or a
    // respawn. Nothing held or planned survives it.
    if (self.body !== this.body) {
      this.reset();
      this.body = self.body;
    }
    this.clock += dt;
    this.tap.age += dt;
    this.gravity = ctx.gravity ?? 2500;
    this.turning = false;
    const held = this.held;
    for (const k of BUTTONS) held[k] = false;

    const foe = self.opponent;
    if (self.inputLocked) {
      // Intro, time-up or K.O.: the fighter ignores input anyway. Start the
      // fight with a clear head.
      this.intent = null;
      this.events.length = 0;
      return this.emit();
    }
    if (!foe || foe.lostToVoid) {
      // Nobody to fight (the opponent is out, waiting to respawn): no
      // chasing. Only get back onto the stage if knocked off it.
      this.intent = null;
      this.events.length = 0;
      if (this.offStage(self, ctx.stage)) this.steerHome(self, ctx.stage, held);
      return this.emit();
    }

    this.perceive(self, foe, ctx);
    this.thinkTimer -= dt;
    const urgent = this.eventDue();
    if (this.thinkTimer <= 0 || urgent) this.think(self, foe, ctx, urgent);
    this.act(self, foe, ctx, held);
    this.guard(self, ctx, held);
    return this.emit();
  }

  // The snapshot for this step: what is held, and a press edge for each
  // button that went down this step (and only this step).
  emit() {
    const { out, held, prev } = this;
    for (const k of BUTTONS) {
      out[k] = held[k];
      out[`${k}Pressed`] = held[k] && !prev[k];
      prev[k] = held[k];
    }
    // Only the training CPU drops through platforms; no player control can,
    // so neither does this one (it walks off an edge instead).
    out.dropPressed = false;
    if (out.leftPressed && out.rightPressed) this.tap = { dir: 0, age: Infinity };
    else if (out.leftPressed || out.rightPressed) this.tap = { dir: out.rightPressed ? 1 : -1, age: 0 };
    return out;
  }

  // ---- Perception ---------------------------------------------------------------

  // Notices what is new since the last step. Each thing is registered once,
  // with the moment it will have been taken in (the level's reaction delay)
  // or, on a lapse, never.
  perceive(self, foe, ctx) {
    const fc = foe.combat;
    const atk = fc.attack;
    if (atk && !this.seen.has(atk)) {
      this.seen.add(atk);
      this.notice('attack', atk, () => foe.combat.attack === atk);
    }
    // A whiff (or a blocked hit) leaves the attacker in its recovery: an
    // opening, for as long as the recovery lasts.
    if (atk && fc.phase === 'recovery' && !this.openSeen.has(atk)) {
      this.openSeen.add(atk);
      this.notice('opening', atk, () => foe.combat.attack === atk);
    }
    const tech = foe.technique;
    if (tech && !this.seen.has(tech)) {
      this.seen.add(tech);
      this.notice('technique', tech, () => foe.technique === tech);
    }
    if (tech && tech.phase === 'whiffRelease' && !this.openSeen.has(tech)) {
      this.openSeen.add(tech);
      this.notice('opening', tech, () => foe.technique === tech);
    }
    const world = ctx.battle;
    if (world?.combat?.events.some((e) => e.attacker === self && e.type === 'hit')) this.lastOffence = this.clock;
    for (const p of world?.projectiles ?? []) {
      if (p.owner !== foe || !p.alive || this.seen.has(p)) continue;
      this.seen.add(p);
      this.notice('projectile', p, () => p.alive && world.projectiles.includes(p));
    }
    for (const c of world?.clones ?? []) {
      if (c.owner !== foe || c.target !== self || !c.alive || this.seen.has(c)) continue;
      this.seen.add(c);
      this.notice('clone', c, () => c.alive);
    }
    // States that come and go: a Charge (it stands still, and a projectile
    // interrupts it), hitstun (a follow-up), an exhausted bar (no Shield).
    const now = {
      charging: foe.charging,
      stunned: fc.stun > 0,
      exhausted: fc.energyExhausted,
    };
    if (now.charging && !this.foeWas.charging) this.notice('opening', null, () => foe.charging, 'charge');
    if (now.stunned && !this.foeWas.stunned) this.notice('opening', null, () => foe.combat.stun > 0, 'stun');
    if (now.exhausted && !this.foeWas.exhausted) this.notice('opening', null, () => foe.combat.energyExhausted, 'exhausted');
    this.foeWas = now;
    this.events = this.events.filter((e) => e.valid());
  }

  notice(kind, ref, valid, why = null) {
    const p = this.profile;
    const rng = this.rng;
    // An opening is only taken in as often as the level looks for one.
    const lapsed = rng() < p.lapse || (kind === 'opening' && rng() >= p.punish);
    const delay = range(rng, p.react[0], p.react[1]);
    this.events.push({ kind, ref, valid, why, readyAt: this.clock + delay, lapsed, handled: false });
  }

  // An event just taken in: think now rather than at the next look.
  eventDue() {
    return this.events.some((e) => !e.lapsed && !e.handled && e.readyAt <= this.clock);
  }

  known(kind) {
    return this.events.filter((e) => !e.lapsed && e.readyAt <= this.clock && (!kind || e.kind === kind));
  }

  // ---- Sense ------------------------------------------------------------------------

  sense(self, foe, ctx) {
    const p = this.profile;
    const stage = ctx.stage;
    const world = ctx.battle ?? null;
    const g = ctx.gravity ?? 2500;
    const b = self.body;
    const fb = foe.body;
    const ms = readMoveset(self);
    const fms = readMoveset(foe);
    const look = p.lookahead;
    // The opponent where its own motion carries it `look` seconds on (not
    // through the surface under it); Easy sees only where it is.
    const fx = fb.x + fb.vx * look;
    let fy = fb.y;
    if (!fb.grounded && look > 0) {
      fy = fb.y + fb.vy * look + 0.5 * g * fb.gravityScale * look * look;
      fy = Math.min(fy, stage.surfaceBelow(fx - fb.halfW, fx + fb.halfW, fb.y).y);
    }
    const dx = fx - b.x;
    const dir = Math.sign(dx) || self.facing;
    const floor = stage.floor;
    const room = (x, d) => (d > 0 ? floor.x + floor.w - x : x - floor.x);
    const fc = foe.combat;

    // Seconds until the opponent can act again: what its animation shows
    // (an attack's remaining frames, stun, a technique, a Dash).
    let foeBusy = Math.max(fc.stun + fc.hitstop, fc.shieldStun);
    if (fc.attack) foeBusy = Math.max(foeBusy, fc.attack.def.total - fc.attack.time);
    if (foe.dash) foeBusy = Math.max(foeBusy, foe.dash.duration - foe.dash.time);
    if (foe.technique) {
      const t = foe.technique;
      if (t.phase === 'whiffRelease') foeBusy = Math.max(foeBusy, t.whiffDuration - t.time);
      else if (t.phase === 'form') foeBusy = Math.max(foeBusy, t.formDuration - t.time + t.dashDuration);
      else foeBusy = Math.max(foeBusy, 1);
    }
    if (fc.immobilized) foeBusy = Math.max(foeBusy, 1);

    const score = world?.score;
    const lead = (score?.[self.slot] ?? 0) - (score?.[foe.slot] ?? 0);
    const timeLeft = world?.timeLeft ?? Infinity;
    const late = timeLeft < 20;
    // Match sense: behind, take a little more risk; ahead late on, play the
    // stage a little safer. Restrained on purpose.
    const aggro = p.aggression * (lead < 0 ? 1.15 : lead > 0 && late ? 0.8 : 1);
    // Neutral cannot last forever: a few quiet seconds and it commits.
    const urge = clamp((this.clock - this.lastOffence - 0.8) / 2.5, 0, 1);
    const stageSense = Math.min(1, p.stage * (lead > 0 && late ? 1.25 : 1));

    const foeLevel = fb.grounded ? fb.y : foe.lastGroundY;
    const s = {
      self, foe, stage, world, g, p, ms, fms,
      me: ms.hurt, fe: fms.hurt,
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded, facing: self.facing,
      canAct: self.canAct(), charging: self.charging,
      energy: self.combat.energy, exhausted: self.combat.energyExhausted,
      fx, fy, dx, dist: Math.abs(dx), dir, dy: fy - b.y,
      liveDist: Math.abs(fb.x - b.x),
      foeGrounded: fb.grounded, foeCanAct: foe.canAct(), foeBusy,
      foeCharging: foe.charging, foeShielding: fc.shielding, foeExhausted: fc.energyExhausted,
      foeEnergy: fc.energy, myLP: self.combat.launchPoint, foeLP: fc.launchPoint,
      sameLevel: Math.abs(foeLevel - b.y) < 40 || (!fb.grounded && fb.y > b.y - 120 && fb.y < b.y + 40),
      foeLevel,
      roomAhead: room(b.x, dir), roomBehind: room(b.x, -dir), foeRoom: room(fb.x, dir),
      offStage: this.offStage(self, stage),
      aggro, stageSense, lead, late, urge,
    };
    s.foeReach = Math.max(0, ...fms.melee.map((m) => reachOf(m.atk.hitbox, s.me).hi));
    s.myReach = Math.max(0, ...ms.melee.filter((m) => !m.air).map((m) => reachOf(m.atk.hitbox, s.fe).hi));
    s.threats = [];
    for (const e of this.known()) {
      const t = e.kind === 'opening' ? null : this.threatOf(e, s);
      if (t) s.threats.push(t);
    }
    s.openings = this.known('opening');
    return s;
  }

  offStage(self, stage) {
    const b = self.body;
    return !b.grounded && !stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref;
  }

  // Own feet `t` seconds on: its body is its own to know.
  ownY(s, t) {
    if (s.grounded) return s.y;
    const b = s.self.body;
    const y = b.y + b.vy * t + 0.5 * s.g * b.gravityScale * t * t;
    return Math.min(y, s.stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).y);
  }

  myBox(s, x = s.x, y = s.y, pad = 0) {
    const e = s.me;
    return { x: x - e.hw - pad, y: y + e.top - pad, w: e.hw * 2 + pad * 2, h: e.bottom - e.top + pad * 2 };
  }

  // How bad a hit would be: its damage and stun, and its launch from the
  // Launch Point it would leave. Sideways toward a near edge is worse.
  severity(hit, s, from) {
    const lp = s.myLP + (hit.damage ?? 0);
    let v = (hit.damage ?? 0) + (hit.hitstun ?? 0) * 10 + (hit.baseLaunch ?? 0) * lp * 0.25;
    if (hit.directionalLaunch === 'horizontal') {
      const room = from > 0 ? s.x - s.stage.floor.x : s.stage.floor.x + s.stage.floor.w - s.x;
      if (room < 220) v *= 1 + s.stageSense * (1 - Math.max(0, room) / 220);
    }
    return v;
  }

  // A known event turned into a threat to this fighter: when it can first
  // touch it (`contactIn`), when it is over (`endIn`), the top of its danger
  // (for jumping it), which side it comes from, and how bad it is. Null when
  // it cannot reach (a whiff, a projectile going elsewhere) or is spent.
  threatOf(e, s) {
    const { self, foe } = s;
    const b = self.body;
    if (e.kind === 'attack') {
      const atk = e.ref;
      const def = atk.def;
      if (def.projectile && !def.hitbox) {
        if (atk.projectileSpawned) return null;
        const proj = foe.projectileDefs[def.projectile.id];
        if (!proj) return null;
        const f = foe.facing;
        const o = def.projectile.offset ?? { x: 0, y: 0 };
        const shot = { x: foe.body.x + o.x * f, y: foe.body.y + o.y, vx: proj.speed * f, def: proj, age: 0 };
        const t = this.projectileThreat(s, shot, Math.max(0, def.projectile.spawnAt - atk.time));
        if (t) t.kind = 'throw';
        return t;
      }
      if (atk.hasHit || !def.hitbox) return null;
      const endIn = def.startup + def.active - atk.time;
      if (endIn <= 0) return null;
      const box = worldBox(foe, def.hitbox, {});
      if (!overlap(box, this.myBox(s, s.x, s.y, 3))) return null;
      const from = Math.sign(foe.body.x - b.x) || foe.facing * -1;
      return { kind: 'melee', contactIn: Math.max(0, def.startup - atk.time), endIn, box, top: box.y, from, severity: this.severity(def, s, from) };
    }
    if (e.kind === 'projectile') return this.projectileThreat(s, e.ref, 0);
    if (e.kind === 'clone') {
      const c = e.ref;
      if (!c.alive || c.hasHit || c.phase === 'vanish') return null;
      const def = c.attackDef;
      const lead = c.phase === 'appear' ? c.cloudDuration - c.time : -c.attackTime;
      const endIn = lead + def.startup + def.active;
      if (endIn <= 0 || !def.hitbox) return null;
      const hb = def.hitbox;
      const box = { x: c.facing > 0 ? c.x + hb.x : c.x - hb.x - hb.w, y: c.y + hb.y, w: hb.w, h: hb.h };
      if (!overlap(box, this.myBox(s, s.x, s.y, 3))) return null;
      const from = Math.sign(box.x + box.w / 2 - b.x) || -self.facing;
      return { kind: 'clone', contactIn: Math.max(0, lead + def.startup), endIn, box, top: box.y, from, severity: this.severity(def, s, from) };
    }
    if (e.kind === 'technique') {
      const t = e.ref;
      if (t.phase !== 'form' && t.phase !== 'dash') return null;
      const center = t.sphereCenter();
      if (!center) return null;
      const speed = t.def.dashSpeed;
      const startIn = t.phase === 'form' ? Math.max(0, t.formDuration - t.time) : 0;
      const rushLeft = t.phase === 'form' ? t.dashDuration : Math.max(0, t.dashDuration - t.time);
      const half = t.def.sphereHitbox.w / 2;
      // The sphere's sweep from where it is to the end of the rush (the hand
      // swings forward on the last frame: a generous margin covers it).
      const reach = speed * rushLeft + 70;
      const x0 = t.facing > 0 ? center[0] - half : center[0] - reach - half;
      const box = { x: x0, y: center[1] + t.def.sphereHitbox.y - 8, w: reach + half * 2, h: t.def.sphereHitbox.h + 16 };
      if (!overlap(box, this.myBox(s))) return null;
      const ahead = (b.x - center[0]) * t.facing;
      const contactIn = startIn + Math.max(0, (ahead - s.me.hw - half) / speed);
      const hit = { ...t.def.explosionHit, damage: (t.def.explosionHit?.damage ?? 0) + 4 };
      return { kind: 'technique', contactIn, endIn: startIn + rushLeft + 0.05, box, top: box.y, from: -t.facing, severity: this.severity(hit, s, -t.facing) + 6 };
    }
    return null;
  }

  // A projectile (live, or one about to be released `delay` seconds from
  // now) on course for this fighter: straight on at its speed, against where
  // this fighter's own motion puts it.
  projectileThreat(s, p, delay) {
    const dirp = Math.sign(p.vx);
    if (!dirp) return null;
    const hb = p.def.hitbox;
    const e = s.me;
    const front = dirp > 0 ? p.x + hb.x + hb.w : p.x - hb.x - hb.w;
    const tail = dirp > 0 ? p.x + hb.x : p.x - hb.x;
    if (dirp > 0 ? tail > s.x + e.hw : tail < s.x - e.hw) return null; // already past
    const gap = dirp > 0 ? s.x - e.hw - front : front - (s.x + e.hw);
    const speed = Math.abs(p.vx);
    const travel = Math.max(0, gap) / speed;
    if (travel > p.def.lifetime - (p.age ?? 0)) return null;
    const contactIn = delay + travel;
    const y = this.ownY(s, contactIn);
    const top = p.y + hb.y;
    if (!(top < y + e.bottom && top + hb.h > y + e.top)) return null;
    const from = -dirp;
    return {
      kind: 'projectile', contactIn, endIn: contactIn + (e.hw * 2 + hb.w) / speed, box: null, top, from,
      severity: this.severity(p.def, s, from),
    };
  }

  // ---- Evaluate -------------------------------------------------------------------

  // `urgent`: something was just taken in, so a plan in progress does not
  // shield the CPU from thinking again.
  think(self, foe, ctx, urgent = false) {
    const p = this.profile;
    const rng = this.rng;
    this.thinkTimer = range(rng, p.think[0], p.think[1]);
    const fresh = this.events.filter((e) => !e.lapsed && !e.handled && e.readyAt <= this.clock);
    for (const e of this.events) if (e.readyAt <= this.clock) e.handled = true;
    const s = this.sense(self, foe, ctx);
    s.fresh = fresh;

    // A known threat still further off than the horizon: a careful CPU
    // makes sure to look again before it lands.
    const later = s.threats.filter((t) => t.contactIn > DEFENSE_HORIZON);
    if (later.length && p.guard >= 0.5) {
      const soonest = Math.min(...later.map((t) => t.contactIn));
      this.thinkTimer = Math.min(this.thinkTimer, soonest - DEFENSE_HORIZON + 0.02);
    }

    if (s.offStage) return this.setIntent({ kind: 'recover' });
    const defense = this.chooseDefense(s);
    if (defense) return this.setIntent(defense);
    // A plan in progress is kept for the level's planning time (a Charge for
    // as long as its own checks allow) unless something new calls for a look.
    const it = this.intent;
    if (it && !it.done && !urgent && (it.keepUntil > this.clock || it.kind === 'charge')) return undefined;
    // Mid-move (an attack, stun, a Dash, a charged technique): nothing new
    // to start until it is over; the next look decides what comes next.
    if (!s.canAct) return this.setIntent({ kind: 'idle', until: this.clock + 0.05 });
    if (rng() < p.hesitation * (s.openings.length ? 0.4 : 1)) {
      return this.setIntent({ kind: 'idle', until: this.clock + range(rng, 0.15, 0.45) });
    }
    const best = this.pick(this.options(s));
    return this.setIntent(best ?? { kind: 'idle', until: this.clock + 0.2 });
  }

  // The highest option after the level's decision noise.
  pick(options) {
    const noise = this.profile.noise;
    let best = null;
    let bestScore = -Infinity;
    for (const o of options) {
      const v = o.score * (1 + (this.rng() * 2 - 1) * noise);
      if (v > bestScore) {
        bestScore = v;
        best = o;
      }
    }
    return best?.intent ?? null;
  }

  setIntent(intent) {
    if (intent) intent.keepUntil = this.clock + this.profile.plan;
    this.intent = intent;
    return intent;
  }

  // Answering the soonest real threat: Shield, step away, jump, Dash away or
  // strike first; or take it. Null to take it (or when there is none).
  chooseDefense(s) {
    const p = this.profile;
    const { self } = s;
    let threat = null;
    for (const t of s.threats) {
      if (t.contactIn <= DEFENSE_HORIZON && (!threat || t.contactIn < threat.contactIn)) threat = t;
    }
    if (!threat) {
      // Taken in too late: the attack is already past, or already landed.
      // A lower level sometimes raises its Shield anyway, a beat behind.
      const late = s.fresh?.some((e) => e.kind === 'attack' && !this.threatOf(e, s)) && s.liveDist < s.foeReach + 40;
      if (late && s.ms.shield && self.shieldAllowed() && this.rng() < (1 - p.guard) * 0.5) {
        return { kind: 'shield', until: this.clock + range(this.rng, 0.2, 0.45) };
      }
      return null;
    }
    const weight = p.guard * (0.6 + Math.min(threat.severity, 30) / 12);
    const ready = s.canAct || s.charging;
    const options = [{ score: (1 - p.guard) * 0.8 + (threat.severity < 3 ? 0.6 : 0), intent: { kind: 'take' } }];

    // Shield: up the step Defense is held, from either side; costs Energy
    // only if it blocks. Held through the threat, never much longer.
    if (s.ms.shield && self.shieldAllowed()) {
      const cost = self.energyDef.shieldHitCost;
      const drain = cost >= s.energy ? 1.2 : (cost / s.energy) * 0.8;
      const linger = 0.04 + (1 - p.guard) * 0.25;
      const hold = Math.min(threat.endIn + linger, SHIELD_MAX_HOLD);
      options.push({ score: weight - p.energyCare * drain, intent: { kind: 'shield', until: this.clock + hold } });
    }

    // Step away from the side it comes from, if a walk clears it in time
    // and the stage allows.
    if (threat.box && s.grounded && ready) {
      const away = threat.from > 0 ? -1 : 1;
      const need = away < 0 ? s.x + s.me.hw - threat.box.x + 2 : threat.box.x + threat.box.w - (s.x - s.me.hw) + 2;
      const mv = self.def.movement;
      const t = Math.max(0, threat.contactIn - 1 / 60);
      const ta = self.maxSpeed / mv.acceleration;
      const walk = t < ta ? 0.5 * mv.acceleration * t * t : 0.5 * mv.acceleration * ta * ta + self.maxSpeed * (t - ta);
      if (need > 0 && walk > need && this.groundAhead(self, s.stage, away, need + 20)) {
        options.push({ score: weight * 1.05, intent: { kind: 'move', dir: away, until: this.clock + threat.endIn + 0.05 } });
      }
    }

    // Jump it: clear its top from the moment it can touch until it is over.
    if (s.grounded && ready && Number.isFinite(threat.top)) {
      const need = s.y - threat.top + 2;
      const v = self.jumpVelocity;
      const g = s.g * self.body.gravityScale;
      const airtime = (2 * v) / g;
      const t0 = threat.contactIn;
      const t1 = Math.min(threat.endIn, airtime);
      if (threat.endIn < airtime && jumpHeight(v, g, t0) > need && jumpHeight(v, g, t1) > need) {
        const bias = threat.kind === 'projectile' || threat.kind === 'throw' ? 1.15 : 0.85;
        options.push({ score: weight * bias, intent: { kind: 'jump', dir: 0 } });
      }
    }

    // Dash away: a longer escape, paid in Energy.
    const dash = s.ms.dash;
    if (dash && p.dash > 0 && threat.box && s.grounded && s.canAct && !s.exhausted && threat.contactIn > 3 / 60) {
      const away = threat.from > 0 ? -1 : 1;
      if (this.groundAhead(self, s.stage, away, dash.distance + 20)) {
        const spend = (dash.cost / Math.max(1, s.energy)) * p.energyCare * 0.5;
        options.push({ score: weight * (0.7 + 0.3 * p.dash) - spend, intent: { kind: 'dash', dir: away } });
      }
    }

    // Strike first: a hit stops a Throw before it lets go, and ends a
    // charged technique still forming.
    if ((threat.kind === 'throw' || threat.kind === 'technique') && s.canAct) {
      const strike = this.meleeOptions(s, false).find((m) => m.atk.startup < threat.contactIn - 1 / 60);
      if (strike) options.push({ score: weight * 1.1 * (0.4 + p.punish), intent: this.attackIntent(strike) });
    }

    const chosen = this.pick(options);
    return chosen?.kind === 'take' ? null : chosen;
  }

  // The melee attacks that would connect now (with this level's spacing
  // error), strongest first: where each one's hitbox will be when it comes
  // out (the fighter slides under the attack's movement lock), against where
  // the opponent's motion takes it by then, as far as the level projects.
  meleeOptions(s, air = !s.grounded) {
    const { self, foe, p } = s;
    const out = [];
    const fb = foe.body;
    const mv = self.def.movement;
    for (const m of s.ms.melee) {
      if (m.air !== air || self.combat.cooldowns.has(m.id)) continue;
      const atk = m.atk;
      const t = atk.startup;
      const lt = Math.min(t, p.lookahead);
      const sx = s.x + slide(s.vx, air ? mv.airDeceleration : mv.deceleration, t);
      const fx = fb.x + fb.vx * lt;
      const fy = fb.grounded ? fb.y : fb.y + fb.vy * lt + 0.5 * s.g * lt * lt;
      const face = Math.sign(fx - sx) || s.facing;
      const d = (fx - sx) * face + (this.rng() * 2 - 1) * p.rangeError;
      const dy = fy - this.ownY(s, t);
      if (!within(reachOf(atk.hitbox, s.fe), d, dy)) continue;
      out.push({ ...m, face, value: this.hitValue(atk, s, face) });
    }
    return out.sort((a, b) => b.value - a.value);
  }

  // What landing `hit` is worth: damage, then its launch from the Launch
  // Point it leaves, more when it sends the opponent toward a near edge.
  hitValue(hit, s, face) {
    const lp = s.foeLP + (hit.damage ?? 0);
    let v = (hit.damage ?? 0) / 10 + ((hit.baseLaunch ?? 0) * lp) / 60;
    if (hit.directionalLaunch === 'horizontal') {
      const f = s.stage.floor;
      const room = face > 0 ? f.x + f.w - s.foe.body.x : s.foe.body.x - f.x;
      if (room < 180) v += s.stageSense * (1 - Math.max(0, room) / 180) * (0.6 + lp / 60);
    }
    return v;
  }

  attackIntent(m) {
    return { kind: 'attack', action: m.action, face: m.face, until: this.clock + 0.3 };
  }

  // The neutral options that fit this moment, each scored.
  options(s) {
    const { self, p } = s;
    const out = [];
    const punishing = s.openings.length > 0;
    const busyFor = (t) => punishing && s.foeBusy >= t;
    const exposedBonus = s.openings.some((e) => e.why === 'exhausted') ? 0.4 * p.punish : 0;

    // Airborne and free: strike on the way down, or steer.
    if (!s.grounded) {
      for (const m of this.meleeOptions(s, true)) {
        out.push({ score: s.aggro * (0.8 + m.value) + (busyFor(m.atk.startup) ? p.punish : 0), intent: this.attackIntent(m) });
      }
      const home = s.roomAhead < 60 || s.roomBehind < 60 ? Math.sign(s.stage.centerX - s.x) : s.dir;
      out.push({ score: 0.5, intent: { kind: 'move', dir: home, until: this.clock + 0.25, air: true } });
      return out;
    }

    // Different levels: find a way up or down first.
    if (!s.sameLevel) {
      out.push({ score: 0.9 + s.aggro * 0.4, intent: { kind: 'navigate', until: this.clock + 1.2 } });
    }

    // Strike: each melee attack that would connect.
    for (const m of this.meleeOptions(s, false)) {
      let score = s.aggro * (0.7 + m.value) + exposedBonus;
      if (s.foeShielding) score *= 0.3 + (s.foeEnergy <= self.energyDef.shieldHitCost * 2 ? 0.5 * p.punish : 0);
      if (busyFor(m.atk.startup + 1 / 30)) score += p.punish * 1.4 + m.value * 0.5;
      if (m.face !== s.facing) score *= 0.92;
      out.push({ score, intent: this.attackIntent(m) });
    }

    // Throw (a ranged attack): chips from a distance, stops a Charge.
    for (const r of s.ms.ranged) {
      const score = this.rangedScore(r, s);
      if (score > 0) out.push({ score, intent: { kind: 'attack', action: r.action, face: s.dir, until: this.clock + 0.3, ranged: true } });
    }

    if (s.sameLevel) {
      // Close in to striking distance.
      if (s.dist > s.myReach * 0.9) {
        const far = clamp((s.dist - 100) / 400, 0, 1);
        const reachable = busyFor((s.dist - s.myReach) / self.maxSpeed + 0.1);
        const score = s.aggro * (0.55 + far * 0.5) + s.urge * 0.55 + (reachable ? p.punish * 1.1 : 0) + exposedBonus +
          (s.foeCharging ? 0.25 * p.punish : 0);
        const range = Math.max(s.myReach - 10, 24);
        out.push({ score, intent: { kind: 'approach', range, then: p.plan > 0, until: this.clock + 1.2 } });
        // ...or cover the gap with a Dash.
        const dash = s.ms.dash;
        if (dash && p.dash > 0 && s.dist > 170 && s.dist < 460 && !s.exhausted &&
            s.energy >= dash.cost + p.energyCare * 35 && this.groundAhead(self, s.stage, s.dir, dash.distance + 20)) {
          out.push({ score: score * (0.45 + p.dash * 0.8), intent: { kind: 'dash', dir: s.dir, then: p.plan > 0 } });
        }
      }

      // Hold a spacing just outside the opponent's reach, and let it come.
      const spacing = s.foeReach + 20 + (this.rng() * 2 - 1) * p.rangeError;
      out.push({
        score: (1 - s.aggro) * 0.75 + (s.dist < spacing + 60 ? 0.15 * p.guard : 0) - s.urge * 0.45,
        intent: { kind: 'space', dist: spacing, until: this.clock + range(this.rng, 0.3, 0.8) },
      });

      // Jump in with an air attack, never over open air.
      if (s.ms.melee.some((m) => m.air) && s.dist > s.myReach && s.dist < 200 &&
          this.groundAhead(self, s.stage, s.dir, s.dist)) {
        out.push({ score: s.aggro * 0.5 * (0.5 + p.plan) + s.urge * 0.2, intent: { kind: 'jump', dir: s.dir, air: true } });
      }
    }

    // Back toward the centre: an edge behind (hits send us away from the
    // opponent, toward it), or any edge near with a high Launch Point. An
    // edge ahead, toward an opponent off the stage, is no danger.
    const edge = s.myLP > 40 ? Math.min(s.roomBehind, s.roomAhead * 1.5) : s.roomBehind;
    const cornered = 150 + 60 * s.stageSense;
    if (edge < cornered) {
      const home = Math.sign(s.stage.centerX - s.x) || 1;
      const over = home === s.dir && s.dist < 90 && p.stage >= 0.8;
      out.push({
        score: s.stageSense * (1.3 - edge / 250) * (1 + s.myLP / 80),
        intent: over ? { kind: 'jump', dir: home } : { kind: 'move', dir: home, until: this.clock + 0.5 },
      });
    }

    // Charge: Energy and charged cooldowns come back faster, and it leads
    // into a charged action.
    const charge = this.chargeOption(s);
    if (charge) out.push(charge);

    out.push({ score: 0.18 + (1 - s.aggro) * 0.2, intent: { kind: 'idle', until: this.clock + range(this.rng, 0.1, 0.3) } });
    return out;
  }

  rangedScore(r, s) {
    const { self, foe, p } = s;
    if (r.air !== !s.grounded || self.combat.cooldowns.has(r.id)) return 0;
    const o = r.atk.projectile.offset ?? { x: 0, y: 0 };
    const hb = r.proj.hitbox;
    const gap = Math.max(0, s.dist - o.x - s.fe.hw);
    const t = r.atk.projectile.spawnAt + gap / r.proj.speed;
    if (gap > r.proj.speed * r.proj.lifetime) return 0;
    // Still level with the shot when it arrives, as far as the level projects.
    const lt = Math.min(t, p.lookahead);
    const fb = foe.body;
    const fy = fb.grounded ? fb.y : Math.min(fb.y + fb.vy * lt + 0.5 * s.g * lt * lt, s.foeLevel);
    const top = s.y + o.y + hb.y;
    if (!(top < fy + s.fe.bottom && top + hb.h > fy + s.fe.top)) return 0;
    // A solid block in the way stops it.
    const y = s.y + o.y;
    const x0 = Math.min(s.x, fb.x);
    const x1 = Math.max(s.x, fb.x);
    if (s.stage.solids.some((so) => so.y < y && so.y + so.h > y && so.x < x1 && so.x + so.w > x0)) return 0;
    // Best from mid range out, where no strike reaches.
    const far = clamp((s.dist - s.myReach * 1.4) / 260, 0, 1);
    let score = s.aggro * (0.2 + 0.55 * far) + s.urge * 0.25 * far;
    if (s.foeCharging) score += 0.9 * (0.3 + p.punish);
    if (s.openings.length && s.foeBusy > t) score += 0.6 * p.punish;
    if (s.foeShielding) score += 0.25 * p.punish;
    // Not the same trick over and over.
    const since = this.clock - this.lastThrow;
    if (since < 1.6) score -= (1.6 - since) * 0.35;
    return score;
  }

  // Charge, planning a charged action when one fits (a Clone Attack at an
  // opponent likely to stay put, a Sphere Rush it is in line for) or just to
  // recover Energy and cooldowns at a safe distance.
  chargeOption(s) {
    const { self, p } = s;
    if (!s.canAct || !s.sameLevel) return null;
    const cooling = s.ms.charged.filter((c) => self.combat.chargedCooldowns.active(c.id)).length;
    const energyNeed = 1 - s.energy / self.combat.maxEnergy;
    if (!s.ms.charged.length && energyNeed <= 0) return null;
    // Room to charge: how long the opponent would need to get here.
    const danger = s.foeReach + 60 + self.maxSpeed * 0.2;
    const safety = clamp((s.liveDist - danger) / 200, 0, 1);
    let then = null;
    let thenValue = 0;
    for (const c of s.ms.charged) {
      if (self.combat.chargedCooldowns.active(c.id)) continue;
      const v = this.chargedValue(c, s);
      if (v > thenValue) {
        thenValue = v;
        then = c;
      }
    }
    // Charging with nothing to gain (full Energy, every cooldown ready, no
    // charged action to set up) is only standing still.
    const gain = 0.6 * energyNeed + 0.25 * cooling + thenValue;
    if (gain <= 0.05) return null;
    const far = clamp((s.liveDist - 320) / 300, 0, 1);
    const score = p.charged * (0.1 + gain + 0.35 * far) * (0.2 + 0.8 * safety) - s.urge * 0.3;
    if (score <= 0) return null;
    const face = then?.type === 'technique' ? s.dir : 0;
    return {
      score,
      intent: {
        kind: 'charge', then, face, danger, checkAt: 0,
        until: this.clock + (then ? 1.4 : range(this.rng, 0.4, 0.4 + gain * 1.2)),
      },
    };
  }

  // How good charged action `c` looks right now (0 when it does not fit):
  // how likely the opponent is to still be where it lands, times what it is
  // worth, judged by the level.
  chargedValue(c, s) {
    const { foe, p } = s;
    const judged = 0.3 + 0.7 * p.charged;
    if (s.foeShielding) return c.type === 'summon' ? 0.1 * judged : 0;
    const still = Math.abs(foe.body.vx) < 30 && s.foeGrounded;
    let stay = 0.15;
    if (s.foeCharging) stay = 0.85;
    else if (s.openings.length && s.foeBusy > c.lead) stay = 0.9;
    else if (still) stay = 0.35;
    // A clone makes the opponent answer it wherever it is, and lands on one
    // that stays put; it pushes the way the opponent faces.
    if (c.type === 'summon') return (0.18 + stay * this.hitValue(c.hit, s, foe.facing)) * judged;
    if (c.type === 'technique') {
      if (!s.sameLevel || !s.foeGrounded) return 0;
      const r = reachOf(c.box, s.fe);
      const d = s.dist + (this.rng() * 2 - 1) * p.rangeError;
      if (!within(r, d, s.dy)) return 0;
      // Walking into the rush counts as staying.
      if (Math.sign(foe.body.vx) === -s.dir && Math.abs(foe.body.vx) > 30) stay = Math.max(stay, 0.35);
    }
    return stay * this.hitValue(c.hit, s, s.dir) * judged;
  }

  // ---- Act ------------------------------------------------------------------------

  act(self, foe, ctx, held) {
    const it = this.intent;
    if (!it || it.done) return;
    const b = self.body;
    const clock = this.clock;
    switch (it.kind) {
      case 'idle':
        if (clock > it.until) it.done = true;
        break;
      case 'recover':
        this.steerHome(self, ctx.stage, held);
        if (b.grounded) it.done = true;
        break;
      case 'shield':
        if (clock > it.until) it.done = true;
        else held.defense = true;
        break;
      case 'move':
        if (clock > it.until || (!it.air && !b.grounded)) it.done = true;
        else held[DIR_KEY[it.dir]] = true;
        break;
      case 'attack':
        this.actAttack(self, it, held);
        break;
      case 'approach': {
        const dx = foe.body.x - b.x;
        if (Math.abs(dx) <= it.range || clock > it.until) {
          it.done = true;
          if (it.then && Math.abs(dx) <= it.range) this.followUp(self, foe, ctx);
        } else {
          held[DIR_KEY[Math.sign(dx)]] = true;
        }
        break;
      }
      case 'space': {
        const dx = foe.body.x - b.x;
        const dist = Math.abs(dx);
        if (clock > it.until) it.done = true;
        else if (dist < it.dist - 14) held[DIR_KEY[-Math.sign(dx) || -self.facing]] = true;
        else if (dist > it.dist + 30) held[DIR_KEY[Math.sign(dx) || self.facing]] = true;
        break;
      }
      case 'jump':
        this.actJump(self, foe, ctx, it, held);
        break;
      case 'dash':
        this.actDash(self, foe, ctx, it, held);
        break;
      case 'charge':
        this.actCharge(self, foe, ctx, it, held);
        break;
      case 'navigate':
        this.actNavigate(self, foe, ctx, it, held);
        break;
      default:
        break;
    }
  }

  // Turn to face the target if needed (one step of the direction), then one
  // press of the button. Done once the attack has run (or was refused).
  actAttack(self, it, held) {
    if (it.pressed) {
      if (self.canAct() || this.clock - it.pressedAt > 2) it.done = true;
      return;
    }
    if (this.clock > it.until || !self.canAct()) {
      it.done = true;
      return;
    }
    if (it.face && self.facing !== it.face) {
      held[DIR_KEY[it.face]] = true;
      this.turning = true;
      return;
    }
    held[it.action] = true;
    it.pressed = true;
    it.pressedAt = this.clock;
    this.lastOffence = this.clock;
    if (it.ranged) this.lastThrow = this.clock;
  }

  // A planned follow-up: whatever strike connects now, if any.
  followUp(self, foe, ctx) {
    const s = this.sense(self, foe, ctx);
    const m = this.meleeOptions(s)[0];
    if (m) this.setIntent(this.attackIntent(m));
  }

  actJump(self, foe, ctx, it, held) {
    const b = self.body;
    if (!it.jumped) {
      if (!b.grounded || !(self.canAct() || self.charging)) {
        it.done = true;
        return;
      }
      held.jump = true;
      it.jumped = true;
      it.at = this.clock;
      if (it.dir) held[DIR_KEY[it.dir]] = true;
      return;
    }
    if (b.grounded) {
      if (this.clock - it.at > 0.1) it.done = true;
      return;
    }
    // Jumping in: drift to just outside striking distance rather than
    // sailing over the opponent. Otherwise keep the jump's direction.
    if (it.air) {
      const ahead = (foe.body.x - b.x) * it.dir;
      if (ahead > 40) held[DIR_KEY[it.dir]] = true;
      else if (ahead < 12) held[DIR_KEY[-it.dir]] = true;
    } else if (it.dir) {
      held[DIR_KEY[it.dir]] = true;
    }
    // An air attack once the opponent comes into its reach on the way:
    // steer to face it first (in the air that turns at once), then press.
    if (it.air && !it.struck && self.canAct()) {
      const m = this.meleeOptions(this.sense(self, foe, ctx), true)[0];
      if (m && m.face !== self.facing) {
        held[DIR_KEY[-m.face]] = false;
        held[DIR_KEY[m.face]] = true;
      } else if (m) {
        held[m.action] = true;
        it.struck = true;
      }
    }
  }

  // Dash: a tap, a release and a tap of the same direction, as a player
  // double-taps; the fighter decides whether it can Dash.
  actDash(self, foe, ctx, it, held) {
    const key = DIR_KEY[it.dir];
    const step = (it.step = (it.step ?? -1) + 1);
    if (step === 0 && !(self.body.grounded && self.canAct() && !self.charging)) {
      it.done = true;
      return;
    }
    if (step === 0 || step === 2) held[key] = true;
    else if (step > 2) {
      if (self.dash) held[key] = true;
      else {
        it.done = true;
        if (it.then) this.followUp(self, foe, ctx);
      }
    }
  }

  actCharge(self, foe, ctx, it, held) {
    const p = this.profile;
    const b = self.body;
    if (!b.grounded || this.clock > it.until || self.technique || self.combat.stun > 0 || (!self.charging && !self.canAct())) {
      it.done = true;
      return;
    }
    // A Sphere Rush goes the way the fighter faces: turn before charging.
    if (it.face && self.facing !== it.face && !self.charging) {
      held[DIR_KEY[it.face]] = true;
      this.turning = true;
      return;
    }
    held.charge = true;
    if (!self.charging || this.clock < it.checkAt) return;
    // Looked at again at the level's reaction pace, not every frame.
    it.checkAt = this.clock + range(this.rng, p.react[0], p.react[1]);
    const s = this.sense(self, foe, ctx);
    const close = s.liveDist < it.danger || s.threats.some((t) => t.contactIn < 0.5);
    const rushReady = it.then?.type === 'technique' && !it.used && !self.combat.chargedCooldowns.active(it.then.id);
    if (close && !(rushReady && this.chargedValue(it.then, s) > 0.3)) {
      held.charge = false;
      it.done = true;
      return;
    }
    const c = it.then;
    if (c && !it.used && !self.combat.chargedCooldowns.active(c.id) && this.chargedValue(c, s) > 0.12) {
      // Charge is still held on this step, and was on the last: the press is
      // the charged action.
      held[c.action] = true;
      it.used = true;
      if (c.type === 'technique') it.done = true;
      else it.until = Math.min(it.until, this.clock + range(this.rng, 0.3, 0.9));
      return;
    }
    const cooling = s.ms.charged.some((x) => self.combat.chargedCooldowns.active(x.id));
    if (!c && !cooling && s.energy >= self.combat.maxEnergy) it.done = true;
  }

  // Following the opponent to another level: up by a reachable platform,
  // down by walking off the edge of this one.
  actNavigate(self, foe, ctx, it, held) {
    const b = self.body;
    const fb = foe.body;
    const stage = ctx.stage;
    const foeY = fb.grounded ? fb.y : foe.lastGroundY;
    const up = b.y - foeY;
    if (this.clock > it.until || (Math.abs(up) < 40 && b.grounded)) {
      it.done = true;
      return;
    }
    let tx = fb.x;
    let jump = false;
    if (up > 40) {
      const step = this.findStep(self, foeY, fb.x, stage);
      if (step) {
        const lo = step.x + 16;
        const hi = step.x + step.w - 16;
        tx = clamp(fb.x, lo, hi);
        if (b.grounded) {
          const gap = b.x < step.x ? step.x - b.x : b.x > step.x + step.w ? b.x - (step.x + step.w) : 0;
          // From beside a solid block; from under or beside a platform.
          const under = !step.oneWay && gap === 0;
          if (under) tx = b.x < step.x + step.w / 2 ? step.x - 30 : step.x + step.w + 30;
          else if (gap < 70) jump = true;
        }
      } else if (Math.abs(fb.x - b.x) < 160) {
        jump = true;
      }
    } else if (up < -40 && b.grounded && b.ground && b.ground !== stage.floor) {
      // Walk off the edge nearer the opponent (either, if it is below us).
      const g = b.ground;
      const left = g.x - b.halfW - 16;
      const right = g.x + g.w + b.halfW + 16;
      if (fb.x < g.x) tx = left;
      else if (fb.x > g.x + g.w) tx = right;
      else tx = b.x - g.x < g.x + g.w - b.x ? left : right;
    }
    const dx = tx - b.x;
    if (Math.abs(dx) > 6) held[DIR_KEY[Math.sign(dx)]] = true;
    if (jump && self.canAct() && !this.prev.jump) held.jump = true;
  }

  // The best surface to jump to on the way up to the opponent's level: one
  // within a jump, no higher than it needs, and nearest the opponent.
  findStep(self, foeY, foeX, stage) {
    const b = self.body;
    const maxUp = ((self.jumpVelocity * self.jumpVelocity) / (2 * this.gravity * b.gravityScale)) * 0.88;
    let best = null;
    let bestScore = Infinity;
    for (const p of [...stage.platforms, ...stage.solids]) {
      const rise = b.y - p.y;
      if (p === b.ground || rise < 20 || rise > maxUp || p.y < foeY - 20) continue;
      const cx = clamp(foeX, p.x, p.x + p.w);
      const score = Math.abs(p.y - foeY) * 1.5 + Math.abs(cx - foeX) * 0.6 + Math.abs(p.x + p.w / 2 - b.x) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  // Back toward the stage's centre (knocked off it, or with nobody to fight).
  steerHome(self, stage, held) {
    const dx = stage.centerX - self.body.x;
    if (Math.abs(dx) > 8) held[DIR_KEY[Math.sign(dx)]] = true;
  }

  // ---- Safety on every level --------------------------------------------------------

  // Whether there is anything to stand on `ahead` world units past the body's
  // side in direction `dir` (a lower platform counts; open air does not).
  groundAhead(self, stage, dir, ahead) {
    const b = self.body;
    const x = b.x + dir * (b.halfW + ahead);
    return !!stage.surfaceBelow(x - b.halfW, x + b.halfW, b.y).ref;
  }

  // Last checks on what the intent holds: never walk off the main floor into
  // open air, hop a solid block in the way, and never double-tap into a
  // Dash by accident.
  guard(self, ctx, held) {
    const b = self.body;
    const dir = held.right === held.left ? 0 : held.right ? 1 : -1;
    if (!dir) return;
    const key = DIR_KEY[dir];
    const dashing = this.intent?.kind === 'dash' && !this.intent.done;
    if (b.grounded && !this.intent?.jumped) {
      const decel = self.def.movement.deceleration;
      const stop = Math.sign(b.vx) === dir ? (b.vx * b.vx) / (2 * decel) : 0;
      // A Dash's taps look a whole Dash ahead; a one-step turn barely moves.
      const margin = dashing ? (readMoveset(self).dash?.distance ?? 0) + LEDGE_MARGIN
        : this.turning ? 2 : LEDGE_MARGIN + stop;
      if (!this.groundAhead(self, ctx.stage, dir, margin)) {
        held[key] = false;
        if (this.intent && this.intent.kind !== 'attack' && this.intent.kind !== 'charge') this.intent.done = true;
        return;
      }
      if (b.wall === dir && self.canAct() && !this.prev.jump) held.jump = true;
    }
    if (!dashing && !this.prev[key] && this.tap.dir === dir && this.tap.age <= (self.def.movement.dashTapWindow ?? 0) + TAP_SLACK) {
      held[key] = false;
    }
  }
}
