// Controllers turn intent into a FighterInput snapshot. Player 1 and the CPU
// are completely separate: Quick Battle's CPU is the combat AI
// (CombatAIController, js/game/ai/combat-ai.js), which plugs in here without
// touching Fighter. TrainingAIController below is the older non-attacking
// training opponent, kept as a standalone controller. Only the player's
// controller carries the player's Automatic turn-around preference, and
// only its presses are a player's deliberate requests (see
// Fighter.playerControlled); no CPU's ever is.

import { range } from '../../core/utils.js';
import { ACTIONS, CONFIG } from '../../config.js';
import { jumpRise } from './movement.js';

// How far past its own collider the training CPU looks for a ledge ahead
// (world units): about two steps at its top speed.
const LEDGE_LOOKAHEAD = 12;

// The controls a fighter holds, by control codename (every gameplay control
// but pause): each one's held state and its `…Pressed` edge.
export const HELD_CONTROLS = Object.freeze(ACTIONS.filter((action) => action !== 'pause'));

// Every field Fighter.update reads, all false: a complete, neutral snapshot,
// keyed by control codename. Besides each held control and its press edge,
// explicit one-step Mouvement requests from any device or CPU, where the
// step's combat presses were made for (`pressedOnGround` / `pressedInAir`:
// a game controller resolves each press for the ground or the air, and a
// press buffered for one never comes out in the other; neither, from a
// keyboard, touch or a CPU, makes no such claim) and the training CPU's
// platform drop (`dropPressed`: a player asks for the same drop with a
// tap of Down, see Fighter.update).
export function blankInput() {
  const input = {};
  for (const control of HELD_CONTROLS) input[control] = false;
  for (const control of HELD_CONTROLS) input[`${control}Pressed`] = false;
  input.mouvementLeftPressed = false;
  input.mouvementRightPressed = false;
  input.pressedOnGround = false;
  input.pressedInAir = false;
  input.dropPressed = false;
  return input;
}

// Seconds a CPU keeps Jump held after pressing it, as a hand does. How
// high a jump goes never depends on it (a jump is decided as Jump is
// pressed: see Fighter.update); it only means every jump is a fresh press
// after a let-go.
const CPU_JUMP_HOLD = 4 / 60;
export function jumpTapHold() {
  return CPU_JUMP_HOLD;
}

// How far above `body`'s feet the top of the solid it stands against going
// `dir` (-1 or 1) is, world units (0 when nothing stands in the way).
export function wallAhead(body, stage, dir) {
  if (!stage || !dir) return 0;
  const side = body.x + dir * body.halfW;
  let top = 0;
  for (const s of stage.solids ?? []) {
    if (s.active === false) continue;
    const face = dir > 0 ? s.x : s.x + s.w;
    if (Math.abs(face - side) > 2 || s.y >= body.y || s.y + s.h <= body.y - body.height) continue;
    top = Math.max(top, body.y - s.y);
  }
  return top;
}

// The ground jump that clears `rise` world units above the feet: the
// normal jump while it clears it comfortably, otherwise the Super Jump (the
// same choice for every fighter: movement is universal).
export function jumpFor(self, rise, gravity = CONFIG.sim.gravity) {
  return rise > jumpRise(self.movement.jumpVelocity, gravity) * 0.88 ? 'super' : 'normal';
}

// The human player's controller (kind 'player'): its presses go through
// the same request and cancellation rules as a CPU's (see
// Fighter.canFollowUp), and it is the one that may have Automatic turn-around
// (see Fighter.turnAroundFacing), while its setting (`automaticTurnAround`:
// Home › Settings › Combat, read as the mode starts) is on. As in the
// settings, it is on unless said otherwise.
// Each sample is taken for the fighter as it is at that step (on the ground
// or not, its facing, which fighter it is), so a game controller resolves
// through that fighter's own controller profile (js/core/input-manager.js).
export class PlayerController {
  constructor(input, { automaticTurnAround = true } = {}) {
    this.input = input;
    this.kind = 'player';
    this.automaticTurnAround = automaticTurnAround === true;
  }

  getInput(self) {
    if (!self) return this.input.sample();
    return this.input.sample({ grounded: !!self.body?.grounded, facing: self.facing, character: self.def ?? null });
  }
}

// Non-attacking training opponent: keeps a readable distance, follows the
// player across platforms and occasionally repositions. It never presses
// combat buttons (extra_attack and attack1 to attack5 included, so it never
// throws a projectile, summons or casts) or Shield (so it never shields),
// so the player can practise on it. It holds Down only on the step it
// presses Jump for a Super Jump, as a player would (Down and Jump together),
// to reach a surface or clear a solid the normal jump would not.
// It drops through one-way platforms with `dropPressed`, its own intent (a
// player drops with a tap of Down instead, which this controller never
// makes). It never walks off the main floor's edges into open air
// on its own (see atLedge): it only leaves the stage when knocked off.
export class TrainingAIController {
  constructor({ rng = Math.random } = {}) {
    this.kind = 'cpu';
    this.rng = rng;
    this.out = blankInput();
    this.moveIntent = 0;
    this.thinkTimer = 0.6;
    // The jump it wants next: false, 'normal' or 'super'.
    this.wantJump = false;
    this.wantDrop = false;
    this.hopCooldown = 2;
    this.idleUntilSettled = 0;
    // Seconds Jump stays held after a press (see jumpTapHold).
    this.jumpHold = 0;
  }

  getInput(self, dt, ctx) {
    const out = this.out;
    out.jumpPressed = false;
    out.dropPressed = false;
    out.down = false;
    out.downPressed = false;

    // Nobody to follow (none, or one lost to the Void and waiting to
    // respawn): stand still until there is.
    const foe = self.opponent;
    if (!foe || foe.lostToVoid) {
      this.moveIntent = 0;
      out.runLeft = false;
      out.runRight = false;
      return out;
    }

    this.thinkTimer -= dt;
    this.hopCooldown -= dt;
    if (this.thinkTimer <= 0) this.think(self, foe, ctx);

    // Blocked by a solid while moving -> hop over it (the Super Jump for
    // one the normal jump would not clear).
    if (this.moveIntent !== 0 && self.body.grounded && self.body.wall === this.moveIntent) {
      this.wantJump = jumpFor(self, wallAhead(self.body, ctx.stage, this.moveIntent) + 8, ctx.gravity);
    }
    // About to walk off a ledge into open air -> stop at the edge.
    if (this.moveIntent !== 0 && self.body.grounded && this.atLedge(self, ctx.stage)) {
      this.moveIntent = 0;
      this.wantJump = false;
    }

    if (this.wantJump && self.body.grounded && this.jumpHold <= 0) {
      out.jumpPressed = true;
      // The Super Jump: Down pressed with Jump on this one step.
      out.down = out.downPressed = this.wantJump === 'super';
      this.wantJump = false;
      this.jumpHold = jumpTapHold(self);
    }
    out.jump = this.jumpHold > 0;
    this.jumpHold -= dt;
    if (this.wantDrop && self.body.grounded) {
      out.dropPressed = true;
      this.wantDrop = false;
    }

    out.runLeft = this.moveIntent < 0;
    out.runRight = this.moveIntent > 0;
    return out;
  }

  // Whether a step in the move direction would leave nothing at all under
  // the fighter: past the main floor's edge, only open air and the Void.
  // Dropping from a platform to a surface below is fine.
  atLedge(self, stage) {
    const b = self.body;
    const x = b.x + this.moveIntent * (b.halfW + LEDGE_LOOKAHEAD);
    return !stage.surfaceBelow(x - b.halfW, x + b.halfW, b.y).ref;
  }

  // Closest surface between our height and the foe's that a ground jump
  // (the Super Jump at most) reaches.
  findStep(self, foe, stage, gravity) {
    const y = self.body.y;
    const reach = jumpRise(self.movement.superJumpVelocity, gravity) * 0.92;
    let best = null;
    let bestD = Infinity;
    for (const p of [...stage.platforms, ...stage.solids]) {
      // Never a platform that is not there now (a hazard that vanished).
      if (p.active === false) continue;
      if (p.y >= y - 40 || p.y < y - reach || p.y <= foe.lastGroundY + 20) continue;
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - foe.body.x) > 460) continue;
      const d = Math.abs(cx - self.body.x);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  think(self, foe, ctx) {
    const rng = this.rng;
    this.thinkTimer = range(rng, 0.22, 0.5);

    const dx = foe.body.x - self.body.x;
    const dist = Math.abs(dx);
    const toward = Math.sign(dx) || 1;
    const foeGroundY = foe.lastGroundY;
    const selfY = self.body.y;

    // Vertical following: foe settled on a higher surface nearby -> jump up
    // (the normal jump where it reaches, the Super Jump where it does not),
    // using an intermediate platform as a stepping stone when it's too high.
    if (self.body.grounded && foe.body.grounded && foeGroundY < selfY - 40) {
      const reach = jumpRise(self.movement.superJumpVelocity, ctx.gravity) * 0.92;
      if (selfY - foeGroundY > reach) {
        const step = this.findStep(self, foe, ctx.stage, ctx.gravity);
        if (step) {
          const cx = step.x + step.w / 2;
          const gap = Math.max(step.x - self.body.x, self.body.x - (step.x + step.w), 0);
          this.moveIntent = Math.sign(cx - self.body.x) || toward;
          if (gap < 90) this.wantJump = jumpFor(self, selfY - step.y + 12, ctx.gravity);
          return;
        }
      }
      if (dist < 230) {
        this.moveIntent = toward;
        if (dist < 170) this.wantJump = jumpFor(self, selfY - foeGroundY + 12, ctx.gravity);
        return;
      }
    }
    // Foe below us and we're on a droppable platform -> drop down.
    if (self.body.grounded && foe.body.grounded && foeGroundY > selfY + 40) {
      const g = self.body.ground;
      if (g && g.oneWay && g.dropThrough && dist < 320) {
        this.wantDrop = true;
        this.moveIntent = 0;
        return;
      }
      // Otherwise walk toward the foe to fall off the edge.
      this.moveIntent = toward;
      return;
    }

    if (dist > 270) {
      this.moveIntent = toward;
    } else if (dist < 90) {
      // Too close: step back unless cornered.
      this.moveIntent = rng() < 0.7 ? -toward : 0;
      this.thinkTimer = range(rng, 0.15, 0.3);
    } else {
      // Comfortable range: mostly hold position, sometimes shuffle.
      const roll = rng();
      if (roll < 0.62) this.moveIntent = 0;
      else if (roll < 0.82) this.moveIntent = toward;
      else this.moveIntent = -toward;
      this.thinkTimer = range(rng, 0.35, 0.9);
      if (this.hopCooldown <= 0 && rng() < 0.12) {
        this.wantJump = 'normal';
        this.hopCooldown = range(rng, 2.5, 5);
      }
    }
  }
}
