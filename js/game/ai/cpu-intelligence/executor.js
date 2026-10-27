// CPU Intelligence, layer 9: input execution and safety.
//
// Purpose: turn each step's decisions into exactly the snapshot a player's
// controller produces (FighterInput, see blankInput in
// js/game/fighters/fighter-controller.js): held directions, Down, Jump,
// Shield and combat buttons, each `…Pressed` edge true only on the step its
// button goes down, and a Dash or an air dash by an explicit one-step
// Mouvement request. It enforces what a player's hands would:
//
//   - a press is a fresh press: a button still held from the step before
//     is let go for a step first (so a Deflect is always a real press of
//     Shield in the air, never a Shield carried up off the ground);
//   - the Shield is only ever held on the ground;
//   - every jump is a tap (the normal jump) unless the plan asks for the
//     higher jump, which holds Jump past the higher-jump window;
//   - never both directions at once;
//   - never walking or Dashing off the main floor's edge into open air
//     unless the plan means to (an edge-guard, a route down), and a hop over
//     a solid block in the way.
//
// Inputs: the CPU's fighter and the stage. Outputs: Executor.
// Important constraints: it never writes to the fighter; what the inputs do
// is the Fighter's business, exactly as for a player.

import { HELD_CONTROLS, blankInput, jumpTapHold } from '../../fighters/fighter-controller.js';

const DIR_KEY = { [-1]: 'runLeft', 1: 'runRight' };
const LEDGE_MARGIN = 10;

export class Executor {
  constructor() {
    this.out = blankInput();
    this.held = Object.fromEntries(HELD_CONTROLS.map((k) => [k, false]));
    this.prev = { ...this.held };
    this.reset();
  }

  reset() {
    for (const k of HELD_CONTROLS) {
      this.held[k] = false;
      this.prev[k] = false;
    }
    this.mouvement = 0;
    this.jumpHoldUntil = -Infinity;
    this.allowEdge = false;
    this.pressed = null;
    this.clock = 0;
    this.blocked = 0;
  }

  // A new step: nothing held yet.
  begin(clock) {
    this.clock = clock;
    for (const k of HELD_CONTROLS) this.held[k] = false;
    this.mouvement = 0;
    this.allowEdge = false;
    this.pressed = null;
    this.wantDir = 0;
    this.heldBack = false;
  }

  // A plan chosen part-way through a step takes over its inputs: whatever
  // the plan it replaces had held this step (a direction, the Shield, a
  // Dash request) is let go, so the two never mix in one snapshot.
  redo() {
    for (const k of HELD_CONTROLS) this.held[k] = false;
    this.mouvement = 0;
    this.pressed = null;
    this.wantDir = 0;
  }

  // Hold a direction (-1, 0 or 1).
  dir(d) {
    this.wantDir = d || 0;
  }

  // Press `action` this step if it can be a fresh press; true when it is.
  // A button held on the step before is let go now (pressable next step).
  press(action) {
    if (this.prev[action]) return false;
    this.held[action] = true;
    this.pressed = action;
    return true;
  }

  // Hold the Shield (the ground's only).
  shield(grounded) {
    if (grounded) this.held.shield = true;
  }

  // Press Jump: a tap (`high` false) or the higher jump. False if Jump is
  // still held from an earlier press (let go first).
  jump(self, high = false) {
    if (this.prev.jump) {
      this.releaseJump();
      return false;
    }
    this.held.jump = true;
    const tap = jumpTapHold(self);
    this.jumpHoldUntil = this.clock + (high ? self.movement.highJumpWindow + 3 / 60 : tap);
    return true;
  }

  // Let go of Jump now (an air jump needs a fresh press).
  releaseJump() {
    this.jumpHoldUntil = -Infinity;
    this.held.jump = false;
  }

  // Whether Jump is free to be pressed again this step.
  jumpFree() {
    return !this.prev.jump;
  }

  fastFall() {
    this.held.down = true;
  }

  // An explicit Dash (on the ground) or air dash (in the air) request.
  dash(d) {
    this.mouvement = d;
  }

  // Applies the holds still running and the safety rules, then the press
  // edges: the snapshot for this step.
  finish(self, stage) {
    const held = this.held;
    if (this.clock <= this.jumpHoldUntil) held.jump = true;
    const b = self.body;
    let d = this.wantDir;
    // While an attack plays on the ground nothing held moves the fighter
    // (the Fighter ignores it then, a player's or a CPU's: see attackDrift)
    // and its attacks are aimed by attackFacing, so it holds none: the
    // ledge guard below never counts a walk that cannot happen. In the air
    // every move keeps the universal air control, a CPU's as a player's, and
    // it steers as its plan wants.
    if (self.combat.attack && b.grounded) d = 0;
    if (!b.grounded) held.shield = held.shield && this.pressed === 'shield';
    if (d && b.grounded && !this.allowEdge) {
      const decel = self.movement.deceleration;
      const stop = Math.sign(b.vx) === d ? (b.vx * b.vx) / (2 * decel) : 0;
      if (!this.groundAhead(self, stage, d, LEDGE_MARGIN + stop)) {
        d = 0;
        this.blocked++;
        // The plan wanted to walk on and the ledge guard held it back: the
        // liveness monitor's way of seeing a plan that cannot move.
        this.heldBack = true;
      }
    }
    if (this.mouvement && b.grounded && !this.allowEdge) {
      const dist = self.movement.dashSpeed * self.dashDuration;
      const run = (self.movement.dashSpeed ** 2 - self.movement.maxSpeed ** 2) / (2 * self.movement.overspeedDeceleration);
      if (!this.groundAhead(self, stage, this.mouvement, dist + run * 0.5 + LEDGE_MARGIN)) {
        this.mouvement = 0;
        this.blocked++;
      }
    }
    // A solid block in the way on the ground: hop it.
    if (d && b.grounded && b.wall === d && self.canAct() && !this.prev.jump) {
      held.jump = true;
      this.jumpHoldUntil = this.clock + jumpTapHold(self);
    }
    held.runLeft = d < 0;
    held.runRight = d > 0;
    // A fresh Down press on a platform drops through it; the CPU plans no
    // drop (it walks off a platform instead), so it never holds Down on the
    // ground, where Down does nothing else.
    if (b.grounded) held.down = false;
    const out = this.out;
    for (const k of HELD_CONTROLS) {
      out[k] = held[k];
      out[`${k}Pressed`] = held[k] && !this.prev[k];
      this.prev[k] = held[k];
    }
    out.dropPressed = false;
    out.mouvementLeftPressed = this.mouvement === -1;
    out.mouvementRightPressed = this.mouvement === 1;
    return out;
  }

  // Whether there is anything to stand on `ahead` units past the body's side going `dir`.
  groundAhead(self, stage, dir, ahead) {
    const b = self.body;
    const x = b.x + dir * (b.halfW + ahead);
    return !!stage.surfaceBelow(x - b.halfW, x + b.halfW, b.y).ref;
  }
}

export { DIR_KEY };
