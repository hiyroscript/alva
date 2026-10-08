// CPU Intelligence: safety, the last checks before input goes out.
//
// Purpose: whatever the plan wants, on every level: never walk or Dash
// off the main floor into the Void by accident (a plan that means to leave
// the stage says so), hop a solid in the way instead of pushing into it,
// and never stand doing nothing while able to act: the watchdog notices a
// fighter that can act, is not holding still on purpose (a Shield, a held
// spacing, a cast) and has produced no input for a moment, and has the
// planner choose again with standing still ruled out.
//
// Inputs: the situation, the executor's wants, the plan.
// Outputs: guard, Watchdog.
// Important constraints: it only removes or adds wants; it never writes
// to a fighter.

import { STEP } from './forecast.js';

// The distance a body going `vx` needs to stop once it lets go: the
// overspeed brake down to top speed, then the normal one.
function stoppingDistance(mv, vx, dir) {
  const v = vx * dir;
  if (v <= 0) return 0;
  if (v <= mv.maxSpeed) return (v * v) / (2 * mv.deceleration);
  return (v * v - mv.maxSpeed ** 2) / (2 * mv.overspeedDeceleration) + mv.maxSpeed ** 2 / (2 * mv.deceleration);
}

const LEDGE_MARGIN = 10;

// Edits this step's wants for safety (see above).
export function guard(S, ex, plan) {
  if (!S.grounded || plan?.offstageOK) return;
  const mv = S.self.movement;
  const dir = ex.wantDir;
  if (dir) {
    if (!S.groundAhead(dir, LEDGE_MARGIN + stoppingDistance(mv, S.vx, dir))) {
      ex.wantDir = 0;
      if (plan) plan.blocked = true;
    } else if (S.self.body.wall === dir && S.canAct && !ex.wantShield && !ex.wantJump) {
      // A solid in the way: over it.
      ex.jump('normal');
    }
  }
  const dashDir = ex.wantDash || ex.dashSeq?.dir || 0;
  if (dashDir && !S.dashing) {
    const reach = S.k.dash?.reach ?? 300;
    if (!S.groundAhead(dashDir, reach + LEDGE_MARGIN)) {
      ex.wantDash = 0;
      ex.dashSeq = null;
      ex.dashResult = 'failed';
      if (plan) plan.blocked = true;
    }
  }
  // Already moving toward the ledge faster than it can stop: let go.
  if (!dir && S.vx && !S.dashing) {
    const going = Math.sign(S.vx);
    if (!S.groundAhead(going, LEDGE_MARGIN + stoppingDistance(mv, S.vx, going) * 0.5) && S.canAct) ex.wantDir = -going;
  }
}

// Notices a fighter standing still for no reason (see above).
export class Watchdog {
  constructor(profile) {
    // A casual player may take a beat longer, but nobody freezes.
    this.limit = 0.2 + 0.1 * (1 - profile.mobility);
    this.reset();
  }

  reset() {
    this.still = 0;
  }

  // True when the planner must choose again, standing still ruled out.
  check(S, out, plan, intentional) {
    const idle = S.canAct && !out.runLeft && !out.runRight && !out.jump && !out.shield && !out.down &&
      !out.extra_attack && !out.attack1 && !out.attack2 && !out.attack3 && !out.attack4 && !out.attack5 && !out.transform;
    if (!idle || intentional || Math.abs(S.vx) > 60) {
      this.still = 0;
      return false;
    }
    this.still += STEP;
    if (this.still >= this.limit) {
      this.still = 0;
      return true;
    }
    return false;
  }
}
