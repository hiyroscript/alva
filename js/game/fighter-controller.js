// Controllers turn intent into a FighterInput snapshot. Player 1 and the CPU
// are completely separate so a future combat AI can replace TrainingAI
// without touching Fighter.

import { range } from '../core/utils.js';

function blankInput() {
  return {
    left: false, right: false, charge: false, jump: false, defense: false,
    primary: false, special: false, action1: false, action2: false,
    jumpPressed: false, chargePressed: false, defensePressed: false,
    primaryPressed: false, specialPressed: false, action1Pressed: false, action2Pressed: false,
    dropPressed: false,
  };
}

export class PlayerController {
  constructor(input) {
    this.input = input;
    this.kind = 'player';
  }

  getInput() {
    return this.input.sample();
  }
}

// Non-attacking training opponent: keeps a readable distance, follows the
// player across platforms and occasionally repositions. It never presses
// combat buttons (Basic Attacks 1 and 2 included), Charge or Defense, so the
// player can practise on it. It drops through one-way platforms with `dropPressed`, an
// intent no player control produces.
export class TrainingAIController {
  constructor({ rng = Math.random } = {}) {
    this.kind = 'cpu';
    this.rng = rng;
    this.out = blankInput();
    this.moveIntent = 0;
    this.thinkTimer = 0.6;
    this.wantJump = false;
    this.wantDrop = false;
    this.hopCooldown = 2;
    this.idleUntilSettled = 0;
  }

  getInput(self, dt, ctx) {
    const out = this.out;
    out.jumpPressed = false;
    out.dropPressed = false;

    const foe = self.opponent;
    if (!foe) return out;

    this.thinkTimer -= dt;
    this.hopCooldown -= dt;
    if (this.thinkTimer <= 0) this.think(self, foe, ctx);

    // Blocked by a wall or solid while moving -> hop over it.
    if (this.moveIntent !== 0 && self.body.grounded && self.body.wall === this.moveIntent) {
      const atStageEdge =
        self.body.x - self.body.halfW <= ctx.stage.left + 1 ||
        self.body.x + self.body.halfW >= ctx.stage.right - 1;
      if (atStageEdge) this.moveIntent = 0;
      else this.wantJump = true;
    }

    if (this.wantJump && self.body.grounded) {
      out.jumpPressed = true;
      this.wantJump = false;
    }
    if (this.wantDrop && self.body.grounded) {
      out.dropPressed = true;
      this.wantDrop = false;
    }

    out.left = this.moveIntent < 0;
    out.right = this.moveIntent > 0;
    return out;
  }

  // Closest reachable surface between our height and the foe's.
  findStep(self, foe, stage) {
    const y = self.body.y;
    let best = null;
    let bestD = Infinity;
    for (const p of [...stage.platforms, ...stage.solids]) {
      if (p.y >= y - 40 || p.y < y - 155 || p.y <= foe.lastGroundY + 20) continue;
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

    // Vertical following: foe settled on a higher surface nearby -> jump up,
    // using an intermediate platform as a stepping stone when it's too high.
    if (self.body.grounded && foe.body.grounded && foeGroundY < selfY - 40) {
      if (selfY - foeGroundY > 150) {
        const step = this.findStep(self, foe, ctx.stage);
        if (step) {
          const cx = step.x + step.w / 2;
          const gap = Math.max(step.x - self.body.x, self.body.x - (step.x + step.w), 0);
          this.moveIntent = Math.sign(cx - self.body.x) || toward;
          if (gap < 90) this.wantJump = true;
          return;
        }
      }
      if (dist < 230) {
        this.moveIntent = toward;
        if (dist < 170) this.wantJump = true;
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
        this.wantJump = true;
        this.hopCooldown = range(rng, 2.5, 5);
      }
    }
  }
}
