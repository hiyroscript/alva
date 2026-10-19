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

// A sixth style, kept out of REFERENCE_STYLES (Brutal's benchmark
// composition is the five above): `competent`, a scripted stand-in for a
// regular player rather than a style, which every level is measured
// against to see how hard it is to beat (CompetentOpponent below).
export const COMPETENT_STYLE = 'competent';

const REACT_STEPS = 12;

export class ReferenceOpponent {
  constructor({ style = 'balanced', rng = Math.random } = {}) {
    if (style === COMPETENT_STYLE) return new CompetentOpponent({ rng });
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

// The competent reference (COMPETENT_STYLE): a regular player's habits,
// scripted, for any fighter, through the same inputs and rules, seeing its
// opponent COMPETENT_REACT steps (0.22 s) late:
//
//   - footwork: walks to its quickest strike's reach, Dashes in from far,
//     backs well off while its Launch Point is far above its opponent's,
//     keeps off the ledge and, cornered, jumps over its opponent;
//   - offense: one decision every 0.12 s, never two presses within 0.3 s:
//     a move that reaches (more readily on a stunned opponent, never into a
//     raised Shield; its strongest launcher, mostly, once the opponent's
//     Launch Point is high), an anti-air on an opponent above it, a
//     projectile from far now and then, a jump-in;
//   - defense: an attack it sees coming within reach is Shielded half the
//     time (with the Energy for it) or stepped away from a quarter of the
//     time, decided once per attack; a whiff it sees is punished;
//   - recovery: holds toward the stage, air jumps once below the ledge, air
//     dashes home from far out.
//
// It is a fixed yardstick, never tuned against the CPU.
const COMPETENT_REACT = 13;

export class CompetentOpponent {
  constructor({ rng = Math.random } = {}) {
    this.kind = 'cpu';
    this.style = COMPETENT_STYLE;
    this.rng = rng;
    this.out = blankInput();
    this.reset();
  }

  reset() {
    this.seen = [];
    this.prev = {};
    this.jumpHold = 0;
    this.shieldUntil = 0;
    this.stepUntil = 0;
    this.stepDir = 0;
    this.clock = 0;
    this.lastPress = -1;
    this.decideAt = 0;
    this.answered = null;
    this.punished = null;
    this.airDashed = false;
  }

  getInput(self, dt, ctx) {
    this.clock += dt;
    const held = {};
    this.out.mouvementRightPressed = false;
    this.out.mouvementLeftPressed = false;
    const foe = self.opponent;
    const stage = ctx.stage;
    const b = self.body;
    if (self.inputLocked) return this.emit(held, self);
    if (b.grounded) this.airDashed = false;
    const caps = analyzeCapabilities(self);
    const main = stage.main ?? { left: stage.floor.x, right: stage.floor.x + stage.floor.w, top: stage.floor.y };
    const dash = (d) => {
      this.out.mouvementRightPressed = d > 0;
      this.out.mouvementLeftPressed = d < 0;
    };
    // Off the stage: home.
    if (!b.grounded && !stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref) {
      const toward = b.x < main.left ? 1 : b.x > main.right ? -1 : Math.sign(stage.centerX - b.x) || 1;
      held[toward > 0 ? 'runRight' : 'runLeft'] = true;
      const far = b.x < main.left - 160 || b.x > main.right + 160;
      if (far && !this.airDashed && self.airDashes > 0 && !self.combat.energyExhausted && Math.abs(b.y - main.top) < 90 && self.canFollowUp()) {
        this.airDashed = true;
        dash(toward);
      } else if (b.vy > 0 && b.y > main.top - 30 && self.airJumps > 0 && !this.prev.jump) {
        held.jump = true;
      }
      return this.emit(held, self);
    }
    if (!foe || foe.lostToVoid) {
      // Nobody to fight: back toward the middle, then wait there.
      const dx = stage.centerX - b.x;
      if (Math.abs(dx) > 200 && b.grounded) held[dx > 0 ? 'runRight' : 'runLeft'] = true;
      return this.emit(held, self);
    }
    const fc = foe.combat;
    this.seen.push({
      x: foe.body.x, y: foe.body.y, grounded: foe.body.grounded, attack: fc.attack, phase: fc.phase,
      stunned: fc.stun > 0 || fc.paralysis > 0, shielding: fc.shielding,
    });
    if (this.seen.length > COMPETENT_REACT) this.seen.shift();
    const view = this.seen[0];
    const dx = view.x - b.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || self.facing;
    const dy = view.y - b.y;
    const reaches = (m, slack = 10) => {
      if (!m.reach) return false;
      const front = m.reach.x + m.reach.w + slack;
      return dist < front && dist > m.reach.x - 30 && dy > m.reach.y - 20 && dy < m.reach.y + m.reach.h + 60;
    };
    const press = (m) => {
      if (this.prev[m.action] || this.clock - this.lastPress < 0.3) return false;
      held[m.action] = true;
      this.lastPress = this.clock;
      return true;
    };
    const pick = (list) => list[Math.floor(this.rng() * list.length)];
    const roomBehind = dir > 0 ? b.x - main.left : main.right - b.x;
    const edgeAhead = (d) => !!stage.surfaceBelow(b.x + d * (b.halfW + 40) - b.halfW, b.x + d * (b.halfW + 40) + b.halfW, b.y).ref;
    const melee = caps.moves.filter((m) => (m.kind === 'melee' || m.kind === 'deflect') && m.air === !b.grounded && moveReady(self, m));
    // Defense: an attack it sees coming, decided once per attack.
    if (view.attack && view.phase !== 'recovery' && dist < 170 && b.grounded && this.answered !== view.attack) {
      this.answered = view.attack;
      const r = this.rng();
      if (caps.shield && r < 0.5 && self.combat.energy > 30 && !self.combat.energyExhausted) this.shieldUntil = this.clock + 0.4;
      else if (r < 0.75 && roomBehind > 140) {
        this.stepUntil = this.clock + 0.3;
        this.stepDir = -dir;
      }
    }
    if (this.clock < this.shieldUntil && b.grounded && self.canAct()) {
      held.shield = true;
      return this.emit(held, self);
    }
    if (this.clock < this.stepUntil && b.grounded) {
      if (edgeAhead(this.stepDir)) held[this.stepDir > 0 ? 'runRight' : 'runLeft'] = true;
      return this.emit(held, self);
    }
    // A whiff it sees: punished, once per attack.
    if (view.attack && view.phase === 'recovery' && this.punished !== view.attack) {
      const m = melee.find((x) => reaches(x, 30));
      if (m && this.rng() < 0.75) {
        this.punished = view.attack;
        press(m);
      }
    }
    if (this.clock >= this.decideAt) {
      this.decideAt = this.clock + 0.12;
      const reaching = melee.filter((m) => reaches(m));
      const anti = !view.grounded && dy < -40 && dist < 120 ? reaching.filter((m) => m.roles.has('antiAir')) : [];
      if (anti.length && this.rng() < 0.5) press(pick(anti));
      else if (reaching.length && !view.shielding && this.rng() < (view.stunned ? 0.6 : 0.45)) {
        // A high Launch Point is the time for its strongest launch.
        const launchers = fc.launchPoint > 60 ? reaching.filter((m) => m.maxBaseLaunch >= 2) : [];
        press(launchers.length && this.rng() < 0.7 ? launchers.reduce((x, y) => (y.maxBaseLaunch > x.maxBaseLaunch ? y : x)) : pick(reaching));
      }
      else if (b.grounded && dist > 320) {
        const shots = caps.moves.filter((m) => (m.kind === 'ranged' || m.kind === 'technique') && !(m.heal > 0) && moveReady(self, m));
        if (shots.length && this.rng() < 0.08) press(pick(shots));
      }
      if (b.grounded && self.canAct() && !this.prev.jump && dist > 110 && dist < 230 && this.rng() < 0.06) held.jump = true;
    }
    // Footwork: to its quickest strike's reach; well back while in danger.
    let poke = Infinity;
    for (const m of caps.ground) if (m.kind === 'melee' && m.reach && m.lead <= 0.2) poke = Math.min(poke, m.reach.x + m.reach.w);
    if (!Number.isFinite(poke)) poke = 60;
    const scared = fc && self.combat.launchPoint > 60 && self.combat.launchPoint > fc.launchPoint + 30;
    const spacing = poke - 5 + (scared ? 150 : 0);
    let move = 0;
    if (dist > spacing + 30) move = dir;
    else if (dist < spacing - 25 && roomBehind > 140) move = -dir;
    if (b.grounded && roomBehind < 120 && dist < 200 && self.canAct() && !this.prev.jump && this.rng() < 0.05) {
      held.jump = true;
      move = dir;
    }
    if (move && b.grounded && !edgeAhead(move)) move = 0;
    if (move) held[move > 0 ? 'runRight' : 'runLeft'] = true;
    if (move === dir && b.grounded && dist > 380 && self.canAct() && !self.combat.energyExhausted && self.combat.energy > 50 &&
        this.rng() < 0.03 && edgeAhead(dir)) dash(dir);
    if (b.grounded && b.wall && !this.prev.jump) held.jump = true;
    return this.emit(held, self);
  }

  emit(held, self) {
    return ReferenceOpponent.prototype.emit.call(this, held, self);
  }
}
