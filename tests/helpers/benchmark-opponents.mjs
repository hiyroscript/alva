// Scripted benchmark opponents for CPU Intelligence (imported by tests and
// tools/cpu-benchmark.mjs; not a test file, never part of the game).
//
// Each is a controller with one fixed playing style, built for every
// fighter from its own data (knowFighter), pressing only legal inputs
// through CPU Intelligence's own executor (so a Dash is a real double tap
// and every press a real edge). They are deliberately competent, not
// strawmen: a fast reaction (0.15 s by default), real reach checks, the
// Shield on time, punishes after a block, jumps over shots, recovery back
// to the stage. What they lack is judgement: each plays its one style
// whatever happens.
//
//   rushdown  closes in (Dashing from range), strikes with whatever
//             reaches, jumps over shots, shields half the strikes it sees.
//   zoner     keeps a long range, throws every projectile it has as soon
//             as it can, backs off and anti-airs anything that comes in.
//   turtle    holds its Shield whenever the opponent is close or a shot is
//             coming, and punishes out of every block.
//   aerial    jumps in again and again with its air attacks, air dashes to
//             close the gap and fast-falls onto its target.

import { knowFighter } from '../../js/game/ai/knowledge.js';
import { Executor } from '../../js/game/ai/execution.js';
import { reachOf, within } from '../../js/game/ai/forecast.js';
import { recoverStep } from '../../js/game/ai/navigation.js';
import { CONFIG } from '../../js/config.js';

export const BENCHMARK_STYLES = Object.freeze(['rushdown', 'zoner', 'turtle', 'aerial']);

const DT = CONFIG.sim.step;

export class ScriptedOpponent {
  constructor({ style = 'rushdown', rng = Math.random, reaction = 0.15 } = {}) {
    this.kind = 'cpu';
    this.style = style;
    this.rng = rng;
    this.reaction = reaction;
    this.executor = new Executor();
    this.history = [];
    this.body = null;
    this.clock = 0;
    this.rec = {};
  }

  get out() { return this.executor.out; }

  reset() {
    this.executor.reset();
    this.history = [];
    this.clock = 0;
    this.rec = {};
  }

  attackFacing(self) {
    const foe = self.opponent;
    if (self.inputLocked || !foe || foe.lostToVoid) return null;
    return Math.sign(foe.body.x - self.body.x) || self.facing;
  }

  // The opponent as it was `reaction` seconds ago.
  seen(foe) {
    this.history.push({
      x: foe.body.x, y: foe.body.y, vx: foe.body.vx, grounded: foe.body.grounded, attack: foe.combat.attack?.def ?? null,
      time: foe.combat.attack?.time ?? 0, shielding: foe.combat.shielding,
    });
    const lag = Math.round(this.reaction / DT);
    if (this.history.length > lag + 2) this.history.shift();
    return this.history[Math.max(0, this.history.length - 1 - lag)];
  }

  getInput(self, dt, ctx) {
    if (self.body !== this.body) {
      this.reset();
      this.body = self.body;
    }
    this.clock += dt;
    const ex = this.executor;
    ex.begin();
    const foe = self.opponent;
    if (self.inputLocked || !foe || foe.lostToVoid) {
      if (!self.inputLocked && foe?.lostToVoid) ex.move(Math.sign(ctx.stage.centerX - self.body.x));
      return ex.emit(self);
    }
    const k = knowFighter(self);
    const fk = knowFighter(foe);
    const b = self.body;
    const v = this.seen(foe);
    const stage = ctx.stage;
    const offStage = !b.grounded && !stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref;
    if (offStage) {
      const S = {
        self, stage, k, x: b.x, y: b.y, vx: b.vx, vy: b.vy, halfW: b.halfW, center: stage.centerX, g: ctx.gravity,
        canAct: self.canAct(), stun: self.combat.stun, airJumps: self.airJumps, airDashes: self.airDashes, freeFall: self.freeFall,
        launched: !!self.launch, exhausted: self.combat.energyExhausted, profile: { recover: 0.9 },
        movementReady: (air) => self.movementReady(air),
        moveReady: (m) => !self.combat.cooldowns.has(m.id) && !self.airStartBlocked(m.atk),
      };
      recoverStep(S, ex, this.rec);
      return ex.emit(self);
    }
    const dx = v.x - b.x;
    const dir = Math.sign(dx) || self.facing;
    const dist = Math.abs(dx);
    const dy = v.y - b.y;
    const free = self.canFollowUp();
    const ready = (m) => !m.ability ? !self.combat.cooldowns.has(m.id) && (b.grounded ? !m.air : m.air && !self.airStartBlocked(m.atk))
      : b.grounded && self.canAct() && !self.combat.abilityCooldowns.active(m.id);
    const reaches = (m) => {
      if (m.kind !== 'melee' && m.kind !== 'deflect') return false;
      const r = reachOf(m.motion && m.motion !== 'hover' ? m.reach : m.atk.hitbox, fk.hurt);
      return within(r, dist, dy);
    };
    const strike = (m) => {
      if (!ex.canPress(m.action)) return false;
      ex.press(m.action);
      return true;
    };
    // A strike it sees coming at close range.
    const incoming = v.attack && v.attack.hitbox && v.time < v.attack.startup && dist < 160;
    const shotComing = ctx.battle?.projectiles?.some((p) => p.owner === foe && Math.sign(b.x - p.x) === Math.sign(p.vx) && Math.abs(b.x - p.x) < 260);
    const canShield = b.grounded && k.shield && self.shieldAllowed();
    const groundOk = (d) => !!stage.surfaceBelow(b.x + d * 60 - b.halfW, b.x + d * 60 + b.halfW, b.y).ref;

    if (this.style === 'turtle') {
      if (canShield && (incoming || shotComing || (dist < 130 && self.combat.shieldStun > 0))) {
        ex.shield();
        return ex.emit(self);
      }
      if (free) {
        const m = k.ground.filter((x) => ready(x) && reaches(x)).sort((a, c) => a.startup - c.startup)[0];
        if (m && strike(m)) return ex.emit(self);
      }
      if (canShield && dist < 120) ex.shield();
      else if (dist > 140) ex.move(dir);
      return ex.emit(self);
    }

    if (this.style === 'zoner') {
      if (shotComing && b.grounded && self.canAct() && !self.combat.attack) {
        ex.jump('normal');
        return ex.emit(self);
      }
      if (incoming && canShield) {
        ex.shield();
        return ex.emit(self);
      }
      if (free) {
        const shots = k.ground.filter((x) => (x.kind === 'projectile' || x.kind === 'technique') && ready(x) && Math.abs(dy) < 60);
        if (shots.length && dist > 150 && strike(shots[Math.floor(this.rng() * shots.length)])) return ex.emit(self);
        const m = k.moves.filter((x) => ready(x) && reaches(x)).sort((a, c) => a.startup - c.startup)[0];
        if (m && dist < 120 && strike(m)) return ex.emit(self);
      }
      if (dist < 280 && groundOk(-dir)) ex.move(-dir);
      else if (dist > 460) ex.move(dir);
      else if (!groundOk(-dir) && b.grounded && self.canAct() && dist < 200) ex.jump('high'), ex.move(dir);
      return ex.emit(self);
    }

    if (this.style === 'aerial') {
      if (!b.grounded) {
        if (free) {
          const m = k.air.filter((x) => ready(x) && reaches(x))[0];
          if (m && strike(m)) return ex.emit(self);
        }
        ex.move(Math.abs(dx) > 20 ? dir : 0);
        if (dist > 220 && k.airDash && self.airDashes > 0 && self.movementReady(true) && !self.combat.energyExhausted && !self.launch) ex.dash(dir);
        if (b.vy > 0 && dist < 60 && dy > 0) ex.down();
        return ex.emit(self);
      }
      if (incoming && canShield && this.rng() < 0.4) {
        ex.shield();
        return ex.emit(self);
      }
      if (free) {
        const m = k.ground.filter((x) => ready(x) && reaches(x)).sort((a, c) => a.startup - c.startup)[0];
        if (m && strike(m)) return ex.emit(self);
      }
      if (dist < 260 && self.canAct()) {
        ex.jump(dist > 150 ? 'high' : 'normal');
        ex.move(dir);
      } else {
        ex.move(dir);
      }
      return ex.emit(self);
    }

    // Rushdown.
    if (shotComing && b.grounded && self.canAct()) {
      ex.jump('normal');
      ex.move(dir);
      return ex.emit(self);
    }
    if (incoming && canShield && this.rng() < 0.5) {
      ex.shield();
      return ex.emit(self);
    }
    if (free) {
      const opts = k.moves.filter((x) => ready(x) && reaches(x));
      if (opts.length) {
        const m = opts.sort((a, c) => (c.hit.damage + c.hit.baseLaunch * 2) - (a.hit.damage + a.hit.baseLaunch * 2))[0];
        if (strike(m)) return ex.emit(self);
      }
    }
    if (!b.grounded) {
      ex.move(Math.abs(dx) > 20 ? dir : 0);
      return ex.emit(self);
    }
    if (dist > 260 && k.dash && self.movementReady(false) && !self.combat.energyExhausted && groundOk(dir)) {
      ex.dash(dir);
    } else if (dist > 40) {
      ex.move(dir);
    } else if (self.canAct() && this.rng() < 0.02) {
      ex.jump('normal');
    }
    return ex.emit(self);
  }
}
