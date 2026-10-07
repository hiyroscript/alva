// Combat AI: Quick Battle's CPU opponent (Practice Ground keeps its
// controller-less training dummy; see js/game/practice.js).
//
// A controller like PlayerController: Fighter.update asks it for one
// FighterInput snapshot per fixed step, and that is all it ever produces.
// Every attack, Throw, summon, technique, Shield, Deflect, jump, fast fall,
// Dash and air dash happens because it pressed or held the same inputs a
// player would, and
// the fighter and combat engine decide what those inputs do, exactly as for
// Player 1. It
// never moves, hurts, spawns, cancels or refreshes anything itself, and it
// never writes to a fighter.
//
// Difficulty (js/data/difficulty.js) changes how well it thinks, never what
// its fighter can do. Its profile tunes perception and judgement only:
//
//   sense     one honest picture of the fight from what is on screen: both
//             fighters' positions, motion, attacks and their phases, Shield,
//             techniques, Energy, Launch Point and cooldowns, the projectiles and
//             clones in play, the stage, the score and the clock. Never the
//             player's raw input: an attack is seen once the fighter starts
//             it, not when a key goes down.
//   evaluate  score the options that fit the moment (answer a threat, strike,
//             Throw, a summon or technique, approach, space, Dash, jump in,
//             air dash, make for the centre, wait), each option built from
//             the fighter's own move data, and take the best one after the
//             level's noise. On the ground a threat may be Shielded; in the
//             air there is no Shield, and a projectile may be Deflected
//             instead, if the fighter's Deflect would be live as it arrives.
//   act       turn the chosen intent into held buttons and one-step presses,
//             over as many steps as it needs (turn, then strike, or turn,
//             then press attack5 for #0001's Hollow Purple; tap, release, tap
//             for a Dash). It never presses a button the fighter has no
//             action for.
//
// Reaction: something new the opponent does (an attack's startup, a
// projectile, a clone's cloud, a technique, a whiff) is an event. Each is noticed once, after a delay sampled from the level's
// reaction window, or not at all (its lapse chance); only then can it be
// answered. Nothing is answered on the step it appears, on any level.
// Neutral decisions happen on the level's own reassessment cadence, and a
// chosen plan is kept for the level's planning time before it is thought
// over again (a threat always interrupts it).
//
// Prediction is limited to motion: the opponent's position a short horizon
// ahead (the level's lookahead) from its current velocity, and the path of a
// projectile already under way or a technique still casting. Never future inputs.

import { range, clamp } from '../../core/utils.js';
import { CONFIG } from '../../config.js';
import { HELD_CONTROLS, blankInput, jumpTapHold } from '../fighters/fighter-controller.js';
import { steerAttack } from '../fighters/movement.js';
import { attackReach } from '../combat/attacks.js';
import { worldBox } from '../combat/combat.js';
import { DEFAULT_DIFFICULTY, getDifficultyProfile, resolveDifficulty } from '../../data/difficulty.js';
import { readMoveset } from './moveset.js';

// The buttons a controller holds, by control codename (every held control:
// the directions, Down included, Jump, Shield and every combat button up to
// attack5); each has a matching `…Pressed` edge. The mouvement buttons are
// touch-only: it Dashes (and air dashes) by double-tapping runLeft /
// runRight, as a keyboard or gamepad player does.
const BUTTONS = HELD_CONTROLS;
const DIR_KEY = { [-1]: 'runLeft', 1: 'runRight' };

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
// Seconds after a summon, a technique or a ranged attack during which the
// same move again is weighed down (see specialOptions and rangedScore): its
// own judgement, the same on every level, so a move with no cooldown is not
// the only thing it ever does.
const SPECIAL_REST = 8;
// How much less a move is worth pressed again `since` seconds after it last
// was: `weight` at once, nothing from SPECIAL_REST on.
const restPenalty = (since, weight) => (since < SPECIAL_REST ? weight * (1 - since / SPECIAL_REST) : 0);

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Height above take-off `t` seconds into a jump at `v` under gravity `g`.
const jumpHeight = (v, g, t) => v * t - 0.5 * g * t * t;
const STEP = CONFIG.sim.step;

// How far an attack `self` starts now at speed `vx` carries it in `t`
// seconds, toward `face` for its step-in: the very rules the Fighter runs
// (attackStartSpeed, then steerAttack in js/game/fighters/movement.js step
// by step: the share of that speed it keeps, a burst's overspeed bleeding
// off, its friction, its step-in once its time reaches it), on a scratch
// body that never touches the stage. Its steering is left out: the CPU
// does not steer through its attacks.
function attackDrift(self, atk, vx, t, air, face) {
  const body = { vx: self.attackStartSpeed(atk, vx, !air), grounded: !air };
  const record = { def: atk, time: 0, stepped: false };
  let x = 0;
  for (let i = Math.round(t / STEP); i > 0; i--) {
    steerAttack(body, self.movement, face, record, 0, STEP, self.burst);
    x += body.vx * STEP;
    record.time += STEP;
  }
  return x;
}

// Where hitbox `hb` (facing right from its owner's origin) meets a target
// whose hurtboxes span `e`: the target's origin must be between `lo` and
// `hi` ahead of the owner's, and between `dyLo` and `dyHi` below it.
export function reachOf(hb, e) {
  return { lo: hb.x - e.hw, hi: hb.x + hb.w + e.hw, dyLo: hb.y - e.bottom, dyHi: hb.y + hb.h - e.top };
}

const within = (r, d, dy) => d > r.lo && d < r.hi && dy > r.dyLo && dy < r.dyHi;

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

  // Attack orientation is sampled by Fighter on each simulation step, not
  // on the AI's slower decision clock. It is not a movement input or tap.
  attackFacing(self) {
    const foe = self.opponent;
    if (self.inputLocked || self.lostToVoid || !foe || foe.lostToVoid ||
        !Number.isFinite(foe.body?.x) || !Number.isFinite(self.body?.x)) return null;
    return Math.sign(foe.body.x - self.body.x) || self.attackVisualFacing || self.facing;
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
    this.foeWas = { stunned: false, exhausted: false };
    // The last horizontal press and how long ago it was (see emit).
    this.tap = { dir: 0, age: Infinity };
    this.lastThrow = -Infinity;
    // ...and each ranged attack by itself, by its action (see rangedScore).
    this.lastThrown = new Map();
    // When it last pressed each summon or technique, by its action (see
    // specialOptions).
    this.lastSpecial = new Map();
    // When it last pressed an attack or landed a hit: the longer neutral
    // drags on, the more it wants to commit (see urge).
    this.lastOffence = 0;
    // A jump's button stays held until this clock time, then is let go in
    // time for the normal jump (see holdJump).
    this.jumpHoldUntil = -Infinity;
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
      this.holdJump(self, held);
      return this.emit();
    }

    this.perceive(self, foe, ctx);
    this.thinkTimer -= dt;
    const urgent = this.eventDue();
    if (this.thinkTimer <= 0 || urgent) this.think(self, foe, ctx, urgent);
    this.act(self, foe, ctx, held);
    this.guard(self, ctx, held);
    this.holdJump(self, held);
    return this.emit();
  }

  // Every jump it presses is the normal one: the button stays held a
  // moment, then is let go inside the fighter's higher-jump window (held
  // through it would be the higher jump, see Fighter.update), so a later
  // press (the air jump) is a fresh one.
  holdJump(self, held) {
    if (held.jump && !this.prev.jump) this.jumpHoldUntil = this.clock + jumpTapHold(self);
    if (this.clock <= this.jumpHoldUntil) held.jump = true;
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
    if (out.runLeftPressed && out.runRightPressed) this.tap = { dir: 0, age: Infinity };
    else if (out.runLeftPressed || out.runRightPressed) this.tap = { dir: out.runRightPressed ? 1 : -1, age: 0 };
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
    // A technique that has let go leaves its fighter committed to its
    // release pose: an opening, for as long as that lasts.
    if (tech && tech.phase === 'release' && !this.openSeen.has(tech)) {
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
    // States that come and go: hitstun (a follow-up), an exhausted bar (no
    // Shield).
    const now = {
      stunned: fc.stun > 0,
      exhausted: fc.energyExhausted,
    };
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
    if (foe.technique) foeBusy = Math.max(foeBusy, foe.technique.endIn);
    if (fc.immobilized) foeBusy = Math.max(foeBusy, fc.paralysis);

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
      canAct: self.canAct(),
      energy: self.combat.energy, exhausted: self.combat.energyExhausted,
      fx, fy, dx, dist: Math.abs(dx), dir, dy: fy - b.y,
      liveDist: Math.abs(fb.x - b.x),
      foeGrounded: fb.grounded, foeCanAct: foe.canAct(), foeBusy,
      foeShielding: fc.shielding, foeExhausted: fc.energyExhausted,
      foeEnergy: fc.energy, myLP: self.combat.launchPoint, foeLP: fc.launchPoint,
      sameLevel: Math.abs(foeLevel - b.y) < 40 || (!fb.grounded && fb.y > b.y - 120 && fb.y < b.y + 40),
      foeLevel,
      roomAhead: room(b.x, dir), roomBehind: room(b.x, -dir), foeRoom: room(fb.x, dir),
      offStage: this.offStage(self, stage),
      aggro, stageSense, lead, late, urge,
    };
    // How far each side's ground strikes reach, a roll's whole path
    // included (an air one's lock-on range is not a threat on the ground).
    s.foeReach = Math.max(0, ...fms.melee.map((m) => reachOf(m.air ? m.atk.hitbox : m.reach, s.me).hi));
    s.myReach = Math.max(0, ...ms.melee.filter((m) => !m.air).map((m) => reachOf(m.reach, s.fe).hi));
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
      // Where its strikes can reach: a roll's, a plunge's or a lift's path
      // too, not just where its box is now; and one that travels to its
      // target first arrives once it has covered the gap.
      const box = worldBox(foe, attackReach(def), {});
      if (!overlap(box, this.myBox(s, s.x, s.y, 3))) return null;
      const from = Math.sign(foe.body.x - b.x) || foe.facing * -1;
      const contactIn = Math.min(endIn, Math.max(0, def.startup - atk.time) + this.travelTime(foe, atk, s));
      return { kind: 'melee', contactIn, endIn, box, top: box.y, from, severity: this.severity(def, s, from), unblockable: def.unblockable };
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
      return { kind: 'clone', contactIn: Math.max(0, lead + def.startup), endIn, box, top: box.y, from, severity: this.severity(def, s, from), unblockable: def.unblockable };
    }
    if (e.kind === 'technique') {
      // Still casting: what it will release. Once it has, its projectile is
      // a projectile like any other and its burst has landed.
      const t = e.ref;
      if (t.phase !== 'cast') return null;
      const startIn = t.releaseIn;
      const burst = t.def.burst;
      if (burst) {
        const box = t.burstBox({});
        if (box && overlap(box, this.myBox(s, s.x, s.y, 3))) {
          const from = Math.sign(foe.body.x - b.x) || -self.facing;
          return {
            kind: 'technique', contactIn: startIn, endIn: startIn + 1 / 30, box, top: box.y, from,
            severity: this.severity(burst.hit, s, from) + 6, unblockable: burst.hit.unblockable,
          };
        }
      }
      const shot = t.def.projectile;
      const proj = shot && foe.projectileDefs[shot.id];
      if (proj) {
        const f = t.facing;
        const ball = { x: foe.body.x + shot.offset.x * f, y: foe.body.y + shot.offset.y, vx: proj.speed * f, def: proj, age: 0 };
        const threat = this.projectileThreat(s, ball, startIn);
        if (threat) {
          threat.kind = 'technique';
          threat.severity += 6;
        }
        return threat;
      }
    }
    return null;
  }

  // How long attack `atk` of the opponent's, once under way, travels before
  // its strike can touch this fighter: a roll or a homing dash covering the
  // gap at its speed, a plunge or a lift the height between. 0 for one that
  // strikes where it stands (a hover included).
  travelTime(foe, atk, s) {
    const m = atk.def.motion;
    if (!m) return 0;
    const hb = atk.def.hitbox;
    const fb = foe.body;
    const e = s.me;
    if (m.type === 'roll' || m.type === 'homing') {
      const front = foe.facing > 0 ? fb.x + hb.x + hb.w : fb.x - hb.x - hb.w;
      const gap = foe.facing > 0 ? s.x - e.hw - front : front - (s.x + e.hw);
      const speed = m.type === 'roll' ? Math.max(Math.abs(fb.vx), m.speed) : m.speed;
      return Math.max(0, gap) / speed;
    }
    if (m.type === 'bounce') return Math.max(0, s.y + e.top - (fb.y + hb.y + hb.h)) / m.fallSpeed;
    if (m.type === 'hover') return 0;
    return Math.max(0, fb.y + hb.y - (s.y + e.bottom)) / m.speed;
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
      severity: this.severity(p.def, s, from), unblockable: p.def.unblockable, shot: p, delay,
    };
  }

  // Whether Deflect `d` (see readMoveset), pressed now, would catch the
  // projectile threatening this fighter (`threat.shot`, `threat.delay`
  // seconds from release): its box, turned to the opponent as the fighter
  // turns its attacks, meets the shot's while the Deflect is live, and the
  // shot does not reach the fighter before. Its own fall carries it, as far
  // as it knows its body; its drift is left out.
  deflectCatches(s, d, threat) {
    const shot = threat.shot;
    const atk = d.atk;
    if (!shot || !d.catches || threat.contactIn < atk.startup - 1 / 120) return false;
    const face = Math.sign(s.foe.body.x - s.x) || s.facing;
    const hb = atk.hitbox;
    const ph = shot.def.hitbox;
    const dirp = Math.sign(shot.vx);
    for (let t = atk.startup; t < atk.startup + atk.active - 1e-6; t += 1 / 60) {
      const flown = t - threat.delay;
      if (flown < 0) continue;
      const y = this.ownY(s, t);
      const box = { x: face > 0 ? s.x + hb.x : s.x - hb.x - hb.w, y: y + hb.y, w: hb.w, h: hb.h };
      const px = shot.x + shot.vx * flown;
      const pbox = { x: dirp > 0 ? px + ph.x : px - ph.x - ph.w, y: shot.y + ph.y, w: ph.w, h: ph.h };
      if (overlap(box, pbox)) return true;
    }
    return false;
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
    // In the air with a Deflect, a shot inside the horizon is watched step by
    // step: the Deflect's live window is only a few steps long.
    if (s.ms.deflect && !s.grounded && p.guard >= 0.5 && s.threats.some((t) => t.shot && t.contactIn <= DEFENSE_HORIZON)) {
      this.thinkTimer = Math.min(this.thinkTimer, 1 / 60);
    }

    if (s.offStage) return this.setIntent(this.airDashHome(s) ?? { kind: 'recover' });
    const defense = this.chooseDefense(s);
    if (defense) return this.setIntent(defense);
    // A plan in progress is kept for the level's planning time unless
    // something new calls for a look.
    const it = this.intent;
    if (it && !it.done && !urgent && it.keepUntil > this.clock) return undefined;
    // Mid-move (an attack, stun, a Dash, a technique): nothing new to start
    // until it is over, unless its own attack hit and may be cut short (a
    // hit-cancel): then a strike that connects now, or a Dash after what it
    // sent flying, as readily as the level presses an advantage. The next
    // look decides what comes next.
    if (!s.canAct) {
      const chase = self.combat.cancellable ? this.chase(s) : null;
      return this.setIntent(chase ?? { kind: 'idle', until: this.clock + 0.05 });
    }
    if (rng() < p.hesitation * (s.openings.length ? 0.4 : 1)) {
      return this.setIntent({ kind: 'idle', until: this.clock + range(rng, 0.15, 0.45) });
    }
    const best = this.pick(this.options(s));
    return this.setIntent(best ?? { kind: 'idle', until: this.clock + 0.2 });
  }

  // Whether an air dash could start now, as far as the CPU can tell: one
  // left this airtime, free to act, not exhausted, not in free fall and not
  // still flying from a launch (no air dash starts then; see
  // Fighter.tryAirDash).
  airDashFree(s) {
    const { self } = s;
    return !s.grounded && s.canAct && !s.exhausted && self.airDashes > 0 && !self.freeFall && !self.launch;
  }

  // Knocked off the stage and still level with its top, but too far out
  // for drifting back: an air dash home (as often as the level Dashes at
  // all), the air jumps kept for the climb. Null for none.
  airDashHome(s) {
    const { self, stage, p } = s;
    const d = s.ms.airDash;
    if (!d || !(p.dash > 0) || !this.airDashFree(s) || this.rng() >= p.dash) return null;
    const b = self.body;
    const floor = stage.floor;
    const gap = b.x < floor.x ? floor.x - b.x : b.x - (floor.x + floor.w);
    if (gap < 100 || b.y > stage.groundY + 60) return null;
    return { kind: 'dash', dir: Math.sign(stage.centerX - b.x) || 1, air: true, recover: true };
  }

  // A follow-up out of an attack that hit and may be cut short (see
  // CombatState.cancellable), as often as the level punishes: a strike that
  // connects now (never the same attack again: it may not cut into itself
  // yet), else, on the ground, a Dash after an opponent sent out of reach
  // (a level that Dashes at all, with the Energy a Dash cancel costs). Null
  // to let the attack play out.
  chase(s) {
    const { self, p } = s;
    if (this.rng() >= p.punish) return null;
    const current = self.combat.attack?.def.id;
    const strike = this.meleeOptions(s).find((m) => m.id !== current);
    if (strike) return this.attackIntent(strike);
    const dash = s.ms.dash;
    if (dash && p.dash > 0 && s.grounded && s.sameLevel && s.dist > s.myReach + 40 && s.dist < dash.reach + s.myReach &&
        s.energy >= dash.cancelCost + p.energyCare * 25 && this.groundAhead(self, s.stage, s.dir, dash.reach)) {
      return { kind: 'dash', dir: s.dir, then: p.plan > 0 };
    }
    return null;
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
      if (late && s.grounded && s.ms.groundShield && self.shieldAllowed() && this.rng() < (1 - p.guard) * 0.5) {
        return { kind: 'shield', until: this.clock + range(this.rng, 0.2, 0.45) };
      }
      return null;
    }
    const weight = p.guard * (0.6 + Math.min(threat.severity, 30) / 12);
    const ready = s.canAct;
    const options = [{ score: (1 - p.guard) * 0.8 + (threat.severity < 3 ? 0.6 : 0), intent: { kind: 'take' } }];

    // Shield: on the ground only, up the step `shield` is held, from either
    // side; costs Energy only if it blocks, the same whether the block is
    // perfect or not. Held through the threat, never much longer. Raised
    // this close to contact it is a perfect Shield (see
    // Fighter.perfectShield), with no blockstun: a timing the level has to
    // earn, so a lower one mostly fumbles it and takes the hit instead.
    // Never against a hit no Shield stops.
    const justInTime = !self.combat.shielding && threat.contactIn <= (self.defense?.perfectWindow ?? 0);
    if (s.grounded && s.ms.groundShield && !threat.unblockable && self.shieldAllowed() &&
        (!justInTime || this.rng() < p.guard ** 4)) {
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
      const mv = self.movement;
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

    // Deflect it: in the air, a projectile on course that the Deflect's box
    // would meet while it is live is turned back at its thrower (see
    // deflectCatches). Pressed on `shield`, now: an answer whose timing the
    // level's own reaction already has to make. Unblockable shots too (a
    // Deflect is no Shield). It costs Energy as it starts, whatever it
    // meets, so never while exhausted, and weighed like a block's.
    const deflect = s.ms.deflect;
    if (deflect && !s.grounded && ready && !s.exhausted && !self.combat.cooldowns.has(deflect.id) &&
        !self.airStartBlocked(deflect.atk) && this.deflectCatches(s, deflect, threat)) {
      const spend = deflect.cost >= s.energy ? 1.2 : (deflect.cost / Math.max(1, s.energy)) * 0.8;
      options.push({
        score: weight * 1.2 - p.energyCare * spend * 0.5,
        intent: this.attackIntent({ ...deflect, face: Math.sign(s.foe.body.x - s.x) || s.facing }),
      });
    }

    // Strike first: a hit stops a Throw before it lets go, and ends a
    // technique still casting.
    if ((threat.kind === 'throw' || threat.kind === 'technique') && s.canAct) {
      const strike = this.meleeOptions(s, false).find((m) => m.atk.startup < threat.contactIn - 1 / 60);
      if (strike) options.push({ score: weight * 1.1 * (0.4 + p.punish), intent: this.attackIntent(strike) });
    }

    const chosen = this.pick(options);
    return chosen?.kind === 'take' ? null : chosen;
  }

  // The melee attacks that would connect now (with this level's spacing
  // error), strongest first: where each one's hitbox will be when it comes
  // out (the fighter carried by the attack's own movement: the speed it
  // keeps and its step-in), against where the opponent's motion takes it by
  // then, as far as the level projects. An attack with a motion of its own
  // is judged by where that motion takes its strikes instead (see
  // motionFits). Never one used up until the fighter lands again. In the
  // air its Deflect is one of them (an aerial strike on `shield`), while it
  // has the Energy to start one (it is never exhausted).
  meleeOptions(s, air = !s.grounded) {
    const { self, foe, p } = s;
    const out = [];
    const fb = foe.body;
    const toward = Math.sign(fb.x - s.x) || s.facing;
    const moves = air && s.ms.deflect && !s.exhausted ? [...s.ms.melee, s.ms.deflect] : s.ms.melee;
    for (const m of moves) {
      if (m.air !== air || self.combat.cooldowns.has(m.id) || self.airStartBlocked(m.atk)) continue;
      const atk = m.atk;
      const t = atk.startup;
      const lt = Math.min(t, p.lookahead);
      const fx = fb.x + fb.vx * lt;
      const fy = fb.grounded ? fb.y : fb.y + fb.vy * lt + 0.5 * s.g * lt * lt;
      if (m.motion) {
        const face = Math.sign(fx - s.x) || s.facing;
        if (this.motionFits(m, s, fx, fy, face)) out.push({ ...m, face, value: this.hitValue(atk, s, face) });
        continue;
      }
      const sx = s.x + attackDrift(self, atk, s.vx, t, air, toward);
      const face = Math.sign(fx - sx) || s.facing;
      const d = (fx - sx) * face + (this.rng() * 2 - 1) * p.rangeError;
      const dy = fy - this.ownY(s, t);
      if (!within(reachOf(atk.hitbox, s.fe), d, dy)) continue;
      out.push({ ...m, face, value: this.hitValue(atk, s, face) });
    }
    return out.sort((a, b) => b.value - a.value);
  }

  // Whether motion attack `m` would reach an opponent whose feet will be at
  // (fx, fy), turned to `face`, and is safe to start here: a homing dash
  // when the opponent's middle is well inside its lock-on range; a roll, a
  // plunge, a lift or a hover when its swept reach covers the opponent (with
  // this level's spacing error), a roll only with ground all along its path
  // and a plunge only over ground (never into the Void).
  motionFits(m, s, fx, fy, face) {
    const { self, foe, p } = s;
    const spec = m.atk.motion;
    const err = (this.rng() * 2 - 1) * p.rangeError;
    if (m.motion === 'homing') {
      const myMid = this.ownY(s, m.atk.startup) - self.body.height / 2;
      const foeMid = fy - foe.body.height / 2;
      return Math.hypot(fx - s.x, foeMid - myMid) + err < spec.range * 0.9;
    }
    const d = (fx - s.x) * face + err;
    // A hover holds the fighter where it is from its first step.
    const dy = fy - (m.motion === 'hover' ? s.y : this.ownY(s, m.atk.startup));
    if (!within(reachOf(m.reach, s.fe), d, dy)) return false;
    if (m.motion === 'roll') return this.groundAhead(self, s.stage, face, m.reach.w - m.atk.hitbox.w);
    if (m.motion === 'bounce') {
      const b = self.body;
      return !!s.stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref;
    }
    return true;
  }

  // What landing `hit` is worth: damage, then its launch from the Launch
  // Point it leaves, more when it sends the opponent toward a near edge.
  hitValue(hit, s, face) {
    const lp = s.foeLP + (hit.damage ?? 0);
    let v = (hit.damage ?? 0) / 6 + ((hit.baseLaunch ?? 0) * lp) / 60;
    // A hit that paralyses is worth the free strikes that follow it.
    v += (hit.paralyze ?? 0) * 0.6;
    if (hit.directionalLaunch === 'horizontal') {
      const f = s.stage.floor;
      const room = face > 0 ? f.x + f.w - s.foe.body.x : s.foe.body.x - f.x;
      if (room < 180) v += s.stageSense * (1 - Math.max(0, room) / 180) * (0.6 + lp / 60);
    }
    return v;
  }

  // What projectile `proj` landing in full is worth (see hitValue): every
  // strike of a piercing one, its last its finisher.
  shotValue(proj, s) {
    const face = s.dir;
    if (!proj.pierce) return this.hitValue(proj, s, face);
    const strikes = proj.pierce.hits - (proj.finisher ? 1 : 0);
    return strikes * this.hitValue(proj, s, face) + (proj.finisher ? this.hitValue(proj.finisher, s, face) : 0);
  }

  attackIntent(m) {
    return { kind: 'attack', action: m.action, face: m.face, until: this.clock + 0.3, deflect: !!m.deflect };
  }

  // The neutral options that fit this moment, each scored.
  options(s) {
    const { self, p } = s;
    const out = [];
    const punishing = s.openings.length > 0;
    const busyFor = (t) => punishing && s.foeBusy >= t;
    const exposedBonus = s.openings.some((e) => e.why === 'exhausted') ? 0.4 * p.punish : 0;

    // Airborne and free: strike on the way down, close in with an air dash,
    // or steer.
    if (!s.grounded) {
      for (const m of this.meleeOptions(s, true)) {
        out.push({ score: s.aggro * (0.8 + m.value) + (busyFor(m.atk.startup) ? p.punish : 0), intent: this.attackIntent(m) });
      }
      const airDash = s.ms.airDash;
      if (airDash && p.dash > 0 && this.airDashFree(s) && s.sameLevel && s.dist > s.myReach + 60 &&
          s.dist < airDash.distance + s.myReach + 120 && s.energy >= airDash.cost + p.energyCare * 35 &&
          this.groundAhead(self, s.stage, s.dir, airDash.distance)) {
        out.push({ score: s.aggro * (0.35 + p.dash * 0.6) + s.urge * 0.2, intent: { kind: 'dash', dir: s.dir, air: true, then: p.plan > 0 } });
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

    // Throw (a ranged attack): chips from a distance.
    for (const r of s.ms.ranged) {
      const score = this.rangedScore(r, s);
      if (score > 0) out.push({ score, intent: { kind: 'attack', action: r.action, face: s.dir, until: this.clock + 0.3, ranged: true } });
    }

    if (s.sameLevel) {
      // Close in to striking distance.
      if (s.dist > s.myReach * 0.9) {
        const far = clamp((s.dist - 100) / 400, 0, 1);
        const reachable = busyFor((s.dist - s.myReach) / self.maxSpeed + 0.1);
        const score = s.aggro * (0.55 + far * 0.5) + s.urge * 0.55 + (reachable ? p.punish * 1.1 : 0) + exposedBonus;
        const range = Math.max(s.myReach - 10, 24);
        out.push({ score, intent: { kind: 'approach', range, then: p.plan > 0, until: this.clock + 1.2 } });
        // ...or cover the gap with a Dash: from a little more than its own
        // length out to where a Dash, its run-on and a strike out of it
        // reach (a strike may cut it short: see actDash).
        const dash = s.ms.dash;
        if (dash && p.dash > 0 && s.dist > dash.distance * 0.8 && s.dist < dash.reach + s.myReach + 120 && !s.exhausted &&
            s.energy >= dash.cost + p.energyCare * 35 && this.groundAhead(self, s.stage, s.dir, dash.reach + 20)) {
          out.push({ score: score * (0.5 + p.dash * 0.9), intent: { kind: 'dash', dir: s.dir, then: p.plan > 0 } });
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

    // A summon or a technique (e.g. #0001's Attack 4 and Attack 5),
    // pressed directly when one fits.
    out.push(...this.specialOptions(s));

    out.push({ score: 0.18 + (1 - s.aggro) * 0.2, intent: { kind: 'idle', until: this.clock + range(this.rng, 0.1, 0.3) } });
    return out;
  }

  rangedScore(r, s) {
    const { self, foe, p } = s;
    if (r.air !== !s.grounded || self.combat.cooldowns.has(r.id)) return 0;
    const o = r.atk.projectile.offset ?? { x: 0, y: 0 };
    const hb = r.proj.hitbox;
    // A shot that pulls reaches as far again as its pull: whoever is that
    // close is drawn into it.
    const pull = r.proj.pull?.radius ?? 0;
    const gap = Math.max(0, s.dist - o.x - s.fe.hw - pull);
    const t = r.atk.projectile.spawnAt + gap / r.proj.speed;
    if (gap > r.proj.speed * r.proj.lifetime) return 0;
    // Still level with the shot when it arrives, as far as the level projects.
    const lt = Math.min(t, p.lookahead);
    const fb = foe.body;
    const fy = fb.grounded ? fb.y : Math.min(fb.y + fb.vy * lt + 0.5 * s.g * lt * lt, s.foeLevel);
    const top = s.y + o.y + hb.y - pull;
    if (!(top < fy + s.fe.bottom && top + hb.h + 2 * pull > fy + s.fe.top)) return 0;
    // A solid block in the way stops it.
    const y = s.y + o.y;
    const x0 = Math.min(s.x, fb.x);
    const x1 = Math.max(s.x, fb.x);
    if (s.stage.solids.some((so) => so.y < y && so.y + so.h > y && so.x < x1 && so.x + so.w > x0)) return 0;
    // Best from mid range out, where no strike reaches; and worth what its
    // hit is (a shot that launches, or strikes again and again, more than
    // one that chips).
    const far = clamp((s.dist - s.myReach * 1.4) / 260, 0, 1);
    let score = s.aggro * (0.2 + 0.55 * far) + s.urge * 0.25 * far + 0.3 * this.shotValue(r.proj, s);
    if (s.openings.length && s.foeBusy > t) score += 0.6 * p.punish;
    if (s.foeShielding) score += 0.25 * p.punish;
    // Not the same trick over and over: no throw straight after another,
    // and the same one less still (a shot with no cooldown would otherwise
    // be the only one it throws).
    const since = this.clock - this.lastThrow;
    if (since < 1.6) score -= (1.6 - since) * 0.35;
    const sameSince = this.clock - (this.lastThrown.get(r.action) ?? -Infinity);
    score -= restPenalty(sameSince, 0.75);
    return score;
  }

  // The fighter's summons and techniques (e.g. #0001's Attack 4 and Attack
  // 5), each one ready and on the ground pressed on its own button when it
  // fits: a summon at an opponent likely to stay put, a technique whose
  // burst or projectile it is in line for. A technique goes the way the
  // fighter faces, so it turns first. Worth its cast (and its cooldown,
  // if it has one) only when it is likely to land, as the level judges it,
  // and not the same trick over and over: one with no cooldown is not
  // pressed again the moment it is free (SPECIAL_REST, each move apart). A
  // summon holds the fighter only for its startup (if it has one), as it
  // would a player, and its lead counts it; a technique holds it in place
  // while it casts, so it is worth less the closer the opponent could
  // strike first, unless the opponent is busy for longer than that.
  specialOptions(s) {
    const { self, p } = s;
    if (!s.canAct || !s.grounded) return [];
    const out = [];
    const danger = s.foeReach + 60 + self.maxSpeed * 0.2;
    const safety = clamp((s.liveDist - danger) / 200, 0, 1);
    for (const c of s.ms.specials) {
      if (self.combat.abilityCooldowns.active(c.id)) continue;
      const v = this.specialValue(c, s);
      if (v <= 0.12) continue;
      const exposed = c.type === 'technique' && !(s.openings.length && s.foeBusy > c.lead);
      let risk = exposed ? 0.2 + 0.8 * safety : 1;
      // A raised Shield has to come down before it can strike back: against
      // one, a technique no Shield stops is a smaller risk.
      if (exposed && s.foeShielding && c.hit?.unblockable) risk = Math.max(risk, 0.6);
      const face = c.type === 'technique' ? s.dir : 0;
      const since = this.clock - (this.lastSpecial.get(c.action) ?? -Infinity);
      const rest = restPenalty(since, 2.5);
      out.push({
        score: p.specials * (0.3 + 2 * v) * risk + s.urge * 0.2 - rest,
        intent: { kind: 'attack', action: c.action, face, until: this.clock + 0.3, special: true },
      });
    }
    return out;
  }

  // How good summon or technique `c` looks right now (0 when it does not
  // fit): how likely the opponent is to still be where it lands, times what
  // it is worth, judged by the level.
  specialValue(c, s) {
    const { foe, p } = s;
    const judged = 0.3 + 0.7 * p.specials;
    // A Shield blocks it, unless nothing can: then a raised one is an
    // opponent standing still for it.
    const unblockable = !!c.hit?.unblockable;
    if (s.foeShielding && !unblockable) return c.type === 'summon' ? 0.1 * judged : 0;
    const still = (Math.abs(foe.body.vx) < 30 && s.foeGrounded) || s.foeShielding;
    let stay = 0.15;
    if (s.openings.length && s.foeBusy > c.lead) stay = 0.9;
    else if (still) stay = 0.35;
    // A clone makes the opponent answer it wherever it is, and lands on one
    // that stays put; it pushes the way the opponent faces.
    if (c.type === 'summon') return (0.18 + stay * this.hitValue(c.hit, s, foe.facing)) * judged;
    if (c.type === 'technique') {
      if (!c.box || !s.sameLevel) return 0;
      const r = reachOf(c.box, s.fe);
      const d = s.dist + (this.rng() * 2 - 1) * p.rangeError;
      if (!within(r, d, s.dy)) return 0;
      // Walking into it counts as staying.
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
        // The Shield is the ground's: leaving the ground ends the plan, so
        // a held button never becomes a press in the air (a Deflect).
        if (clock > it.until || !b.grounded) it.done = true;
        else held.shield = true;
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
      case 'navigate':
        this.actNavigate(self, foe, ctx, it, held);
        break;
      default:
        break;
    }
  }

  // Fighter aims at the current opponent when accepting the press. No
  // directional tap is needed just to turn (and no stale intent.face). It
  // presses whenever the fighter may follow up: free, or in an attack that
  // hit or a Dash past its cancel time (see Fighter.canFollowUp). A Deflect
  // (`deflect`) is the air's: landed before the press, it is dropped rather
  // than pressed into a Shield, and it needs `shield` up first to be a press
  // at all.
  actAttack(self, it, held) {
    if (it.pressed) {
      if (self.canAct() || this.clock - it.pressedAt > 2) it.done = true;
      return;
    }
    if (this.clock > it.until || !self.canFollowUp() || (it.deflect && self.body.grounded)) {
      it.done = true;
      return;
    }
    if (it.deflect && this.prev[it.action]) return;
    held[it.action] = true;
    it.pressed = true;
    it.pressedAt = this.clock;
    this.lastOffence = this.clock;
    if (it.ranged) {
      this.lastThrow = this.clock;
      this.lastThrown.set(it.action, this.clock);
    }
    if (it.special) this.lastSpecial.set(it.action, this.clock);
  }

  // A planned follow-up: whatever strike connects now, if any. True when
  // there was one.
  followUp(self, foe, ctx) {
    const s = this.sense(self, foe, ctx);
    const m = this.meleeOptions(s)[0];
    if (m) this.setIntent(this.attackIntent(m));
    return !!m;
  }

  actJump(self, foe, ctx, it, held) {
    const b = self.body;
    if (!it.jumped) {
      if (!b.grounded || !self.canAct()) {
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
    // press directly. Fighter aims without changing the navigation drift.
    if (it.air && !it.struck && self.canAct()) {
      const m = this.meleeOptions(this.sense(self, foe, ctx), true)[0];
      if (m) {
        held[m.action] = true;
        it.struck = true;
      }
    }
  }

  // Dash: a tap, a release and a tap of the same direction, as a player
  // double-taps; the fighter decides whether it can Dash (out of an attack
  // that hit too: a Dash cancel). The same taps in the air (`air`) are its
  // air dash; one made to get back to the stage (`recover`) goes back to
  // recovering once it is over. A planned follow-up (`then`) strikes out of
  // the Dash as soon as one connects, cutting it short.
  actDash(self, foe, ctx, it, held) {
    const key = DIR_KEY[it.dir];
    // Already holding that way (running there): let go for a step first, so
    // the first tap is a fresh press.
    if (it.step === undefined && this.prev[key] && !it.released) {
      it.released = true;
      return;
    }
    const step = (it.step = (it.step ?? -1) + 1);
    if (step === 0 && !(self.body.grounded === !it.air && self.canFollowUp())) {
      it.done = true;
      return;
    }
    if (step === 0 || step === 2) held[key] = true;
    else if (step > 2) {
      if (self.dash) {
        held[key] = true;
        if (it.then && self.dashCancellable && this.followUp(self, foe, ctx)) it.done = true;
      } else {
        it.done = true;
        if (it.then) this.followUp(self, foe, ctx);
        else if (it.recover && this.offStage(self, ctx.stage)) this.setIntent({ kind: 'recover' });
      }
    }
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
    // Falling past the stage's top with an air jump left: jump back up (both
    // of the triple jump's, one after the other). With them spent, a lift
    // (an air attack that rises, like #0002's Blue Tornado) still to use
    // this airtime: that instead.
    const b = self.body;
    if (b.grounded || b.vy <= 0 || b.y <= stage.groundY - 40 || self.combat.stun > 0) return;
    if (self.airJumps > 0 && !self.freeFall) {
      if (!this.prev.jump) held.jump = true;
      return;
    }
    const lift = readMoveset(self).melee.find((m) => m.air && m.motion === 'rise');
    if (!lift || !self.canAct() || self.combat.cooldowns.has(lift.id) || this.prev[lift.action]) return;
    if (!self.airStartBlocked(lift.atk)) {
      held[lift.action] = true;
      return;
    }
    // Still flying from the launch that sent it out here (no motion starts
    // until it recovers), with the lift otherwise left: a fast fall ends
    // the launch, and the lift comes on the next look.
    const spent = self.freeFall || (lift.atk.airUses > 0 && (self.airAttacks.get(lift.id) ?? 0) >= lift.atk.airUses);
    if (self.launch && !spent) held.down = true;
  }

  // ---- Safety on every level --------------------------------------------------------

  // Whether there is anything to stand on `ahead` world units past the body's
  // side in direction `dir` (a lower platform counts; open air does not).
  groundAhead(self, stage, dir, ahead) {
    const b = self.body;
    const x = b.x + dir * (b.halfW + ahead);
    return !!stage.surfaceBelow(x - b.halfW, x + b.halfW, b.y).ref;
  }

  // Last checks on what the intent holds: never turn its own attack away
  // from the opponent, never walk off the main floor into open air, hop a
  // solid block in the way, and never double-tap into a Dash by accident.
  guard(self, ctx, held) {
    const b = self.body;
    const dir = held.runRight === held.runLeft ? 0 : held.runRight ? 1 : -1;
    if (!dir) return;
    const key = DIR_KEY[dir];
    // A direction held while its attack plays turns it (see
    // Fighter.updateFacing): steering back to brake an aerial would swing
    // the strike away. Only ever toward the opponent, then.
    const foe = self.opponent;
    if (self.combat.attack && dir !== self.facing && foe && Math.sign(foe.body.x - b.x) !== dir) {
      held[key] = false;
      return;
    }
    const dashing = this.intent?.kind === 'dash' && !this.intent.done;
    if (b.grounded && !this.intent?.jumped) {
      const decel = self.movement.deceleration;
      const stop = Math.sign(b.vx) === dir ? (b.vx * b.vx) / (2 * decel) : 0;
      // A Dash's taps look a whole Dash ahead; running leaves braking room.
      const margin = dashing ? (readMoveset(self).dash?.distance ?? 0) + LEDGE_MARGIN
        : LEDGE_MARGIN + stop;
      if (!this.groundAhead(self, ctx.stage, dir, margin)) {
        held[key] = false;
        if (this.intent && this.intent.kind !== 'attack') this.intent.done = true;
        return;
      }
      if (b.wall === dir && self.canAct() && !this.prev.jump) held.jump = true;
    }
    if (!dashing && !this.prev[key] && this.tap.dir === dir && this.tap.age <= self.movement.dashTapWindow + TAP_SLACK) {
      held[key] = false;
    }
  }
}
