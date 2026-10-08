// CPU Intelligence: execution, intentions turned into legal input.
//
// Purpose: the one place CPU Intelligence's decisions become a FighterInput
// snapshot, exactly the snapshot a player's controller produces: held
// directions, Down, Jump, Shield and the combat buttons, and a `…Pressed`
// edge on the one step each goes down. Every step the planner states what
// it wants (a direction, a press, a jump of a given height, the Shield
// held, a Dash); the executor makes that legal: a button already held is
// released for a step before it is pressed again, a jump is held just long
// enough for the normal jump or long enough for the higher one, a Dash or
// an air dash is a real double tap (tap, release, tap) of a direction, and
// a direction re-pressed inside the double-tap window by accident is held
// back so walking never Dashes by mistake. The Shield is held on the ground
// only; in the air the Shield button is only ever a fresh press (the
// Deflect).
//
// Inputs: the planner's wants for this step and the CPU's own fighter
// (read only: its waiting double tap, whether a Dash started).
// Outputs: Executor and DIR_KEY.
// Important constraints: it produces input and nothing else: never a write
// to the fighter. The training CPU's platform drop and the touch-only
// mouvement requests are never produced.

import { HELD_CONTROLS, blankInput } from '../fighters/fighter-controller.js';
import { BASE_FIGHTER_MOVEMENT } from '../../data/movement.js';
import { STEP } from './forecast.js';

const MV = BASE_FIGHTER_MOVEMENT;
const BUTTONS = HELD_CONTROLS;
export const DIR_KEY = Object.freeze({ [-1]: 'runLeft', 1: 'runRight' });

// Steps Jump is held for each jump: the normal one lets go well inside the
// higher-jump window; the higher one holds through it.
export const JUMP_HOLD = Object.freeze({
  normal: 4,
  high: Math.ceil(MV.highJumpWindow / STEP) + 2,
  air: 4,
});

export class Executor {
  constructor() {
    this.out = blankInput();
    this.held = {};
    this.prev = {};
    for (const k of BUTTONS) {
      this.held[k] = false;
      this.prev[k] = false;
    }
    this.reset();
    this.begin();
  }

  // Nothing held, nothing pending: a fresh start.
  reset() {
    for (const k of BUTTONS) {
      this.held[k] = false;
      this.prev[k] = false;
    }
    this.jumpLeft = 0;
    this.jumpKind = null;
    this.pendingJump = null;
    this.dashSeq = null;
    this.dashResult = null;
    this.lastPress = {};
    this.suppressed = false;
  }

  // ---- This step's wants -------------------------------------------------------

  begin() {
    this.wantDir = 0;
    this.wantDown = false;
    this.wantJump = null;
    this.wantShield = false;
    this.wantPress = [];
    this.wantDash = 0;
  }

  move(dir) { this.wantDir = dir > 0 ? 1 : dir < 0 ? -1 : 0; }
  down() { this.wantDown = true; }
  shield() { this.wantShield = true; }
  // A fresh press of `action` (a combat button, or `shield` for the
  // Deflect in the air).
  press(action) { if (!this.wantPress.includes(action)) this.wantPress.push(action); }
  // A jump: 'normal', 'high' (the higher jump) or 'air' (an air jump).
  jump(kind = 'normal') { this.wantJump = kind; }
  dash(dir) { this.wantDash = dir > 0 ? 1 : -1; }

  // Whether a press of `action` this step would be a fresh edge.
  canPress(action) { return !this.prev[action]; }

  // Whether a press of direction `dir` now would complete the fighter's
  // waiting double tap (and so Dash): its own waiting tap, read back.
  static tapWaiting(self, dir, slack = 0) {
    const tap = self.dashTap;
    return !!tap && tap.direction === dir && tap.age + slack <= MV.dashTapWindow + 1e-6;
  }

  // ---- The snapshot ------------------------------------------------------------

  emit(self) {
    const { held, prev } = this;
    for (const k of BUTTONS) held[k] = false;
    const grounded = self.body.grounded;

    // Jump: a fresh press held for its kind's length. Wanting one while the
    // button is still down lets it go for a step first.
    const want = this.wantJump ?? this.pendingJump;
    this.pendingJump = null;
    if (want) {
      if (prev.jump) {
        this.jumpLeft = 0;
        this.pendingJump = want;
      } else {
        held.jump = true;
        this.jumpKind = want;
        this.jumpLeft = (JUMP_HOLD[want] ?? JUMP_HOLD.normal) - 1;
      }
    } else if (this.jumpLeft > 0) {
      held.jump = true;
      this.jumpLeft--;
    }

    // Presses: a fresh edge, or (still held from the step before) a step
    // let go first, after which the planner asks again.
    for (const action of this.wantPress) {
      if (action === 'shield' && grounded) continue; // the Deflect is the air's
      if (prev[action]) continue;
      held[action] = true;
      this.lastPress[action] = self.steps;
    }

    // The Shield: held on the ground only. In the air the button is never
    // held (a fresh press there is the Deflect, above).
    if (this.wantShield && grounded) held.shield = true;

    if (this.wantDown) held.down = true;

    // A Dash (or an air dash): tap, release, tap of one direction.
    if (this.wantDash && (!this.dashSeq || this.dashSeq.dir !== this.wantDash)) {
      this.dashSeq = { dir: this.wantDash, phase: 0, frames: 0 };
      this.dashResult = null;
    }
    this.suppressed = false;
    const seq = this.dashSeq;
    if (seq) {
      const key = DIR_KEY[seq.dir];
      if (seq.phase === 0) {
        if (prev[key]) {
          held[key] = false;
        } else {
          held[key] = true;
          seq.phase = Executor.tapWaiting(self, seq.dir, STEP) ? 3 : 1;
        }
      } else if (seq.phase === 1) {
        held[key] = false;
        seq.phase = 2;
      } else if (seq.phase === 2) {
        held[key] = true;
        seq.phase = 3;
      } else {
        held[key] = true;
        seq.frames++;
        if (self.dash) {
          this.dashResult = 'ok';
          this.dashSeq = null;
        } else if (seq.frames > 2) {
          this.dashResult = 'failed';
          this.dashSeq = null;
        }
      }
      if (!this.wantDash && seq.phase < 3) {
        // Abandoned before its second tap.
        this.dashSeq = null;
      }
    } else if (this.wantDir) {
      const key = DIR_KEY[this.wantDir];
      // A fresh press that the fighter would read as the second tap of a
      // double tap: held back until that tap has aged out.
      if (!prev[key] && Executor.tapWaiting(self, this.wantDir)) {
        this.suppressed = true;
      } else {
        held[key] = true;
      }
    }

    const out = this.out;
    for (const k of BUTTONS) {
      out[k] = held[k];
      out[`${k}Pressed`] = held[k] && !prev[k];
      prev[k] = held[k];
    }
    out.mouvementLeftPressed = false;
    out.mouvementRightPressed = false;
    out.dropPressed = false;
    return out;
  }
}
