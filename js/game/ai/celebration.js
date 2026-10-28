// CPU celebration: what a CPU does once its match is over (see
// Battle.finishMatch, js/game/battle.js). Never part of a live match: the
// Battle hands a CPU fighter this controller in place of its combat AI
// (js/game/ai/combat-ai.js) only after the result is final, and gives the
// combat AI back on a restart or a rematch, so nothing here touches how a
// CPU fights, its difficulty or its randomness.
//
// A winning CPU picks, at random from its own seeded stream, one of five
// behaviours at a time and runs it for a while, then picks again:
//
//   abilities  presses moves from its own moveset (readMoveset: every
//              button its definition gives it, on the ground or in the
//              air), one press at a time at random moments, sometimes
//              jumping first for an aerial. The Fighter decides as for any
//              press: a cooldown, missing Energy or a move still playing
//              refuses it.
//   void       runs to the nearer side of the Void in force (an overtime's
//              closing one included) and on into it, hopping whatever stops
//              it (a wall, the other fighter standing in the way): the
//              stage and the Void check take it, the usual
//              elimination plays, and with the match over nobody respawns.
//              Once chosen it never ends: nothing else is picked.
//   idle       holds nothing at all.
//   dashDance  runs left and right in quick turns round where it began,
//              never past a ledge.
//   jump       jumps again whenever it can: Jump pressed, held for a
//              normal jump (jumpTapHold), let go, pressed again; its air
//              jumps come out in the air as a player's would.
//
// Every behaviour is plain input (a FighterInput snapshot, blankInput):
// the Fighter moves, jumps and attacks by its own universal rules. A
// fighter out of play (lostToVoid) is never asked again.
//
// A side that did not win (Watch Mode's loser, either CPU after a draw, the
// CPU that lost to the player) gets a narrower `behaviours` list from the
// Battle: harmless ones only (see NEUTRAL_CELEBRATIONS).

import { blankInput, jumpTapHold, HELD_CONTROLS } from '../fighters/fighter-controller.js';
import { readMoveset } from './moveset.js';
import { range } from '../../core/utils.js';

export const CELEBRATIONS = Object.freeze(['abilities', 'void', 'idle', 'dashDance', 'jump']);

// What a side that did not win may do: stay calm, or move about in place.
export const LOSER_CELEBRATIONS = Object.freeze(['idle']);
export const DRAW_CELEBRATIONS = Object.freeze(['idle', 'dashDance', 'jump']);

// How likely each behaviour is to be picked, against the others: the Void
// run ends the celebration for good, so it comes up less often.
const WEIGHTS = Object.freeze({ abilities: 1, void: 0.45, idle: 1, dashDance: 1, jump: 1 });

// How long each behaviour lasts once picked (seconds, from..to); the Void
// run has no end.
const DURATIONS = Object.freeze({
  abilities: [2.5, 4.5],
  idle: [1.2, 3],
  dashDance: [1.5, 3],
  jump: [1.5, 3],
});

// The dash dance: how far from where it began it may go (world units), and
// how long each run lasts before it turns (seconds).
const DANCE_RADIUS = 90;
const DANCE_TURN = [0.09, 0.18];
// How far past its own collider it looks for a ledge before running on.
const LEDGE_LOOKAHEAD = 60;

// The wait between two presses of the ability spam and of the jump spam
// (seconds), and how often a press of the ability spam starts with a jump.
const ABILITY_GAP = [0.12, 0.55];
const JUMP_GAP = [0.06, 0.32];
const AIR_CHANCE = 0.25;

// The Void run: how long its run may stall (barely moving, held up by a wall
// or a fighter) before it jumps (seconds), and what counts as moving (world
// units a step).
const STALL_JUMP = 0.1;
const STALL_MOVE = 0.5;

export class CelebrationController {
  // `rng`: a seeded random source of its own (the Battle derives one per
  // side from its seed). `behaviours`: the ones it may pick (CELEBRATIONS
  // by default).
  constructor({ rng = Math.random, behaviours = CELEBRATIONS } = {}) {
    this.kind = 'cpu';
    this.rng = rng;
    this.behaviours = behaviours.filter((b) => CELEBRATIONS.includes(b));
    if (!this.behaviours.length) this.behaviours = ['idle'];
    this.out = blankInput();
    this.reset();
  }

  reset() {
    this.behaviour = null;
    this.timer = 0;
    // Every behaviour picked so far, in order.
    this.history = [];
    this.held = {};
    this.prev = {};
    this.stage = null;
    this.anchor = null;
    this.dir = 1;
    this.turnTimer = 0;
    this.gap = 0;
    this.jumpHold = 0;
    this.pendingAction = null;
    this.stall = 0;
    this.lastX = null;
  }

  // Starts `behaviour` now (picked, or asked for by name), for its random
  // length.
  choose(behaviour, self) {
    this.behaviour = behaviour;
    this.history.push(behaviour);
    const span = DURATIONS[behaviour];
    this.timer = span ? range(this.rng, span[0], span[1]) : Infinity;
    this.anchor = self?.body?.x ?? null;
    this.turnTimer = 0;
    this.gap = 0;
    this.jumpHold = 0;
    this.pendingAction = null;
    this.stall = 0;
    this.lastX = null;
    this.voidSideChosen = false;
    if (behaviour === 'void' && self) this.dir = this.voidSide(self);
    else if (behaviour === 'dashDance') this.dir = this.rng() < 0.5 ? -1 : 1;
  }

  // A behaviour at random by WEIGHTS, never the one just finished when
  // there is another.
  pick(self) {
    const options = this.behaviours.length > 1 ? this.behaviours.filter((b) => b !== this.behaviour) : this.behaviours;
    const total = options.reduce((sum, b) => sum + WEIGHTS[b], 0);
    let roll = this.rng() * total;
    let next = options[options.length - 1];
    for (const b of options) {
      roll -= WEIGHTS[b];
      if (roll < 0) {
        next = b;
        break;
      }
    }
    this.choose(next, self);
  }

  getInput(self, dt, ctx) {
    this.stage = ctx?.stage ?? self.stage ?? this.stage;
    this.held = {};
    if (!self.lostToVoid) {
      if (!this.behaviour || (this.behaviour !== 'void' && this.timer <= 0)) this.pick(self);
      this.timer -= dt;
      this[this.behaviour]?.(self, dt);
    }
    return this.emit();
  }

  // The held controls as a FighterInput: each `…Pressed` true on the step
  // its control goes down.
  emit() {
    const out = this.out;
    for (const control of HELD_CONTROLS) {
      const on = !!this.held[control];
      out[control] = on;
      out[`${control}Pressed`] = on && !this.prev[control];
    }
    this.prev = this.held;
    return out;
  }

  // The way a move faces as it starts: toward the stage's middle, so the
  // ability spam never carries itself off; anything else keeps its facing.
  attackFacing(self) {
    if (this.behaviour !== 'abilities' || !this.stage) return null;
    return Math.sign(this.stage.centerX - self.body.x) || null;
  }

  // ---- Behaviours ---------------------------------------------------------------

  idle() {}

  abilities(self, dt) {
    this.gap -= dt;
    // A jump first, then the aerial once off the ground.
    if (this.pendingAction) {
      if (!self.body.grounded) {
        this.held[this.pendingAction] = true;
        this.pendingAction = null;
      } else if (this.gap < -0.4) {
        this.pendingAction = null;
      }
      this.held.jump = this.jumpHold > 0;
      this.jumpHold -= dt;
      return;
    }
    if (this.gap > 0) return;
    this.gap = range(this.rng, ABILITY_GAP[0], ABILITY_GAP[1]);
    const grounded = !!self.body.grounded;
    if (grounded && this.rng() < AIR_CHANCE) {
      const aerial = this.moves(self, true);
      if (aerial.length) {
        this.pendingAction = aerial[Math.floor(this.rng() * aerial.length)];
        this.held.jump = true;
        this.jumpHold = jumpTapHold(self);
        return;
      }
    }
    const moves = this.moves(self, !grounded);
    if (moves.length) this.held[moves[Math.floor(this.rng() * moves.length)]] = true;
  }

  // The buttons with a move for the ground or the air in `self`'s own
  // moveset (its summons and techniques start on the ground only; its
  // Deflect, on Shield, in the air only).
  moves(self, air) {
    const set = readMoveset(self);
    const actions = new Set();
    for (const m of [...set.melee, ...set.ranged]) if (m.air === air) actions.add(m.action);
    if (!air) for (const s of set.specials) actions.add(s.action);
    if (air && set.deflect) actions.add(set.deflect.action);
    return [...actions];
  }

  void(self, dt) {
    // The side, once the stage is known (it may be chosen before).
    if (!this.voidSideChosen && this.stage) {
      this.dir = this.voidSide(self);
      this.voidSideChosen = true;
    }
    const dir = this.dir;
    const b = self.body;
    this.held[dir < 0 ? 'runLeft' : 'runRight'] = true;
    // Held up (a wall, the other fighter in the way): over it, with a fresh
    // press each time, air jumps too.
    const moved = this.lastX === null ? Infinity : Math.abs(b.x - this.lastX);
    this.lastX = b.x;
    this.stall = moved < STALL_MOVE || (b.grounded && b.wall === dir) ? this.stall + dt : 0;
    if (this.stall >= STALL_JUMP) this.held.jump = !this.prev.jump;
  }

  // The nearer side of the Void in force from where `self` stands.
  voidSide(self) {
    const v = this.stage?.void;
    if (!v) return this.dir || 1;
    const x = self.body.x;
    return x - v.left <= v.right - x ? -1 : 1;
  }

  dashDance(self, dt) {
    if (!self.body.grounded) return;
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.dir = -this.dir;
      this.turnTimer = range(this.rng, DANCE_TURN[0], DANCE_TURN[1]);
    }
    const from = this.anchor ?? self.body.x;
    if (Math.abs(self.body.x - from) > DANCE_RADIUS) this.dir = Math.sign(from - self.body.x) || this.dir;
    if (this.atLedge(self, this.dir)) {
      this.dir = -this.dir;
      if (this.atLedge(self, this.dir)) return;
    }
    this.held[this.dir < 0 ? 'runLeft' : 'runRight'] = true;
  }

  // Whether a run `dir` would leave nothing under `self` (a ledge into open
  // air), or carry it into the Void.
  atLedge(self, dir) {
    const stage = this.stage;
    if (!stage) return false;
    const b = self.body;
    const x = b.x + dir * (b.halfW + LEDGE_LOOKAHEAD);
    const v = stage.void;
    if (v && (x <= v.left || x >= v.right)) return true;
    return !stage.surfaceBelow(x - b.halfW, x + b.halfW, b.y).ref;
  }

  jump(self, dt) {
    this.gap -= dt;
    this.jumpHold -= dt;
    if (this.jumpHold > 0) {
      this.held.jump = true;
      return;
    }
    // Let go for a step at least, so every press is a new one.
    if (this.prev.jump || this.gap > 0) return;
    this.held.jump = true;
    this.jumpHold = jumpTapHold(self);
    this.gap = this.jumpHold + range(this.rng, JUMP_GAP[0], JUMP_GAP[1]);
  }
}
