// Reference opponents for CPU Intelligence benchmarks and tests (imported by
// tests and tests/benchmarks/; not a test file itself, never in the game).
// Each is a simple scripted controller with a recognizable style, playing
// any fighter through the same player inputs (FighterInput) and the same
// rules as everyone, with a human-like 0.2-second reaction to what its
// opponent does:
//
//   aggressive   runs in and attacks with whatever reaches, Dashes in, jumps in
//   defensive    keeps its distance, Shields what comes, punishes recoveries
//   projectile   keeps away and throws every projectile it has
//   jumpHeavy    jumps at its opponent again and again with aerials
//   balanced     switches between those every couple of seconds
//
// They read their own moves from the fighter's data (capabilities.js), so
// they work for every fighter. Seeded: the same seed plays the same way.

import { blankInput, jumpTapHold } from '../../js/game/fighters/fighter-controller.js';
import { analyzeCapabilities, moveReady } from '../../js/game/ai/cpu-intelligence/capabilities.js';

export const REFERENCE_STYLES = Object.freeze(['aggressive', 'defensive', 'projectile', 'jumpHeavy', 'balanced']);

const REACT_STEPS = 12;

export class ReferenceOpponent {
  constructor({ style = 'balanced', rng = Math.random } = {}) {
    this.kind = 'cpu';
    this.style = style;
    this.rng = rng;
    this.out = blankInput();
    this.reset();
  }

  reset() {
    this.seen = [];
    this.prev = {};
    this.jumpHold = 0;
    this.shieldUntil = 0;
    this.clock = 0;
    this.mode = this.style === 'balanced' ? 'aggressive' : this.style;
    this.modeUntil = 0;
    this.lastPress = -1;
  }

  getInput(self, dt, ctx) {
    this.clock += dt;
    const held = {};
    // A Mouvement request lasts one step.
    this.out.mouvementRightPressed = false;
    this.out.mouvementLeftPressed = false;
    const foe = self.opponent;
    const stage = ctx.stage;
    const b = self.body;
    if (!foe || foe.lostToVoid || self.inputLocked) return this.emit(held, self);
    // What it sees: its opponent as it was a reaction time ago.
    this.seen.push({ x: foe.body.x, y: foe.body.y, attack: foe.combat.attack, phase: foe.combat.phase, grounded: foe.body.grounded });
    if (this.seen.length > REACT_STEPS) this.seen.shift();
    const view = this.seen[0];
    const caps = analyzeCapabilities(self);
    const dx = view.x - b.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || self.facing;
    if (this.style === 'balanced' && this.clock > this.modeUntil) {
      const pick = ['aggressive', 'defensive', 'projectile', 'jumpHeavy'];
      this.mode = pick[Math.floor(this.rng() * pick.length)];
      this.modeUntil = this.clock + 1.5 + this.rng() * 1.5;
    }
    // Off the stage: hold toward it and jump back.
    const offstage = !b.grounded && !stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref;
    if (offstage) {
      held[Math.sign(stage.centerX - b.x) > 0 ? 'runRight' : 'runLeft'] = true;
      if (b.vy > 0 && b.y > stage.groundY - 30 && self.airJumps > 0 && !this.prev.jump) held.jump = true;
      return this.emit(held, self);
    }
    const ready = (m) => moveReady(self, m);
    const reaches = (m) => {
      if (!m.reach) return false;
      const front = m.reach.x + m.reach.w + 18;
      const dy = view.y - b.y;
      return dist < front && dist > m.reach.x - 30 && dy > m.reach.y - 20 && dy < m.reach.y + m.reach.h + 110;
    };
    const press = (m) => {
      if (this.prev[m.action] || this.clock - this.lastPress < 0.18) return false;
      held[m.action] = true;
      this.lastPress = this.clock;
      return true;
    };
    const threat = view.attack && view.phase !== 'recovery' && dist < 160;
    const edgeAhead = (d) => !!stage.surfaceBelow(b.x + d * (b.halfW + 40) - b.halfW, b.x + d * (b.halfW + 40) + b.halfW, b.y).ref;
    const mode = this.mode;
    // Shield what comes (defensive), or now and then whoever it is.
    if (b.grounded && caps.shield && threat && (mode === 'defensive' ? this.rng() < 0.7 : this.rng() < 0.08)) {
      this.shieldUntil = this.clock + 0.3;
    }
    if (this.clock < this.shieldUntil && b.grounded) {
      held.shield = true;
      return this.emit(held, self);
    }
    const melee = caps.moves.filter((m) => (m.kind === 'melee' || m.kind === 'deflect') && m.air === !b.grounded && ready(m) && reaches(m));
    const ranged = caps.moves.filter((m) => (m.kind === 'ranged' || m.kind === 'technique' || m.kind === 'summon') && ready(m));
    if (mode === 'aggressive' || mode === 'jumpHeavy' || (mode === 'defensive' && view.phase === 'recovery')) {
      if (melee.length && this.rng() < 0.5) press(melee[Math.floor(this.rng() * melee.length)]);
    }
    if (mode === 'projectile' && ranged.length && this.rng() < 0.06) press(ranged[Math.floor(this.rng() * ranged.length)]);
    if (mode === 'aggressive' && ranged.length && this.rng() < 0.01) press(ranged[Math.floor(this.rng() * ranged.length)]);
    let move = 0;
    if (mode === 'aggressive') move = dist > 40 ? dir : 0;
    else if (mode === 'defensive') move = dist < 170 ? -dir : dist > 230 ? dir : 0;
    else if (mode === 'projectile') move = dist < 300 ? -dir : dist > 420 ? dir : 0;
    else if (mode === 'jumpHeavy') move = dist > 60 ? dir : 0;
    if (move && b.grounded && !edgeAhead(move)) move = 0;
    if (move) held[move > 0 ? 'runRight' : 'runLeft'] = true;
    if (mode === 'aggressive' && b.grounded && dist > 300 && this.rng() < 0.02 && edgeAhead(dir)) {
      this.out.mouvementRightPressed = dir > 0;
      this.out.mouvementLeftPressed = dir < 0;
    }
    if (b.grounded && !this.prev.jump && ((mode === 'jumpHeavy' && dist < 260 && this.rng() < 0.12) || (mode === 'aggressive' && this.rng() < 0.01) ||
        (mode === 'projectile' && dist < 120 && this.rng() < 0.05))) {
      held.jump = true;
    }
    // A wall in the way: hop it.
    if (b.grounded && b.wall && !this.prev.jump) held.jump = true;
    return this.emit(held, self);
  }

  emit(held, self) {
    if (held.jump && !this.prev.jump) this.jumpHold = this.clock + jumpTapHold(self);
    if (this.clock <= this.jumpHold) held.jump = true;
    const out = this.out;
    for (const k of Object.keys(out)) {
      if (k.endsWith('Pressed') || k.startsWith('mouvement')) continue;
      out[k] = !!held[k];
      out[`${k}Pressed`] = !!held[k] && !this.prev[k];
      this.prev[k] = !!held[k];
    }
    out.dropPressed = false;
    return out;
  }
}
