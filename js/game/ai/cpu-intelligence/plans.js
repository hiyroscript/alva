// CPU Intelligence, layers 7 to 9: plans (combo and sequence execution,
// stage navigation and recovery, neutral footwork).
//
// Purpose: a plan is one purposeful objective carried out over as many
// steps as it needs, through the executor's legal inputs only:
//
//   strike      press one move (an attack, a projectile, a technique, a
//               summon, the Deflect) now or at a planned step
//   dashStrike  Dash in, then strike out of the Dash past its cancel time
//   jumpStrike  jump (the normal or the higher jump, or an air jump),
//               steer the arc that was planned, press the aerial on the
//               planned step
//   shield      raise the Shield at the planned moment (just in time for a
//               perfect Shield when foreseen), hold it through the threat
//   deflect     (jump and) press Shield in the air so the Deflect's live
//               box meets the projectile
//   move, dash, jump, airDrift
//               get out of the way, or reposition
//   neutral     footwork: hold the strategy's spacing against the
//               opponent, step in and out of its reach (whiff-baiting,
//               conditioning), close in by running or Dashing when the
//               plan calls for offense; never still for long
//   air         airborne control: drift toward a useful landing, fast fall
//               when landing sooner is safer, never drift off the stage
//   recover     get back to the stage: hold toward it, space the air
//               jumps, air dash home when far out, a lift as a last resort,
//               steer a launch while stunned
//   navigate    reach an opponent on another level: walk under a surface
//               and jump to it (the higher jump and an air jump if needed),
//               or walk off a platform's edge (there is no platform drop)
//   edgeguard   hold the ledge the opponent must come back to, ready
//   reposition  make for a better spot (the centre, a safe distance from
//               where an opponent will respawn)
//
// Every plan has a lifetime and explicit end: 'run' while it goes on,
// 'done' when its objective is met, 'fail' when it can no longer be (the
// brain replans at once, so a failed plan never leaves the CPU idle).
//
// Inputs: the brain, the situation, the executor. Outputs: makePlan.

import { moveReady } from './capabilities.js';
import { driftDir, STEP } from './prediction.js';
import { riseOf } from './values.js';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// Whether move `m` started on the fighter's last step (an attack, a
// technique, a summon's startup or its cooldown starting).
function started(self, m, before) {
  const a = self.combat.attack;
  if (a && a !== before.attack && a.def === m.def) return true;
  if (m.kind === 'technique') return self.technique && self.technique !== before.technique && self.technique.def === m.def;
  if (m.kind === 'summon') return (!!self.pendingSummon && !before.summon) || (!before.cooling && self.combat.abilityCooldowns.active(m.id));
  return false;
}

function snapshotBefore(self) {
  return {
    attack: self.combat.attack, technique: self.technique, summon: self.pendingSummon,
    cooling: false,
  };
}

// Presses move `m` through the executor if it can start now; tracks the
// press until the fighter has started it. Shared by every plan that ends
// in a move. Returns 'run', 'done' or 'fail'.
function pressMove(plan, brain, s, ex, m) {
  const self = s.self;
  if (plan.pressedAt != null) {
    if (started(self, m, plan.before)) {
      brain.telemetry.used(m.key);
      brain.markUsed(m);
      return 'done';
    }
    // An ordinary attack pressed a little early waits in the fighter's own
    // buffer; anything else that has not started is a refused press.
    const buffered = self.bufferedAttack?.action === m.action;
    if (brain.clock - plan.pressedAt > (buffered ? 0.2 : 2.5 * STEP)) {
      brain.telemetry.count('invalidInputs');
      return 'fail';
    }
    return 'run';
  }
  if (m.kind === 'deflect' && s.me.grounded) return 'fail';
  if (!moveReady(self, m)) return brain.clock - plan.start > (plan.wait ?? 0.12) ? 'fail' : 'run';
  plan.before = snapshotBefore(self);
  plan.before.cooling = m.kind === 'summon' && self.combat.abilityCooldowns.active(m.id);
  if (ex.press(m.action)) plan.pressedAt = brain.clock;
  return 'run';
}

const STEPS = {
  strike(plan, brain, s, ex) {
    const m = plan.cand?.move ?? plan.move;
    if (plan.pressAt != null && brain.clock < plan.pressAt) {
      ex.dir(plan.holdDir ?? 0);
      return 'run';
    }
    if (plan.pressedAt == null && plan.cand && brain.clock - plan.start > 2 * STEP && !brain.stillGood(plan, s)) return 'fail';
    return pressMove(plan, brain, s, ex, m);
  },

  press(plan, brain, s, ex) {
    return pressMove(plan, brain, s, ex, plan.move);
  },

  dashStrike(plan, brain, s, ex) {
    const self = s.self;
    const c = plan.cand;
    if (!plan.dashed) {
      if (self.dash && !self.dash.air) {
        plan.dashed = true;
        plan.dashAt = brain.clock - STEP;
        brain.telemetry.count('dashes');
      } else {
        const deadline = plan.start + ((c.waitK ?? 0) + 4) * STEP;
        if (brain.clock > deadline || !s.me.grounded) return 'fail';
        if (!plan.requested && self.canFollowUp() && self.movementReady(false)) {
          ex.dash(c.dashDir);
          plan.requested = true;
        }
        ex.dir(c.dashDir);
        return 'run';
      }
    }
    ex.dir(c.dashDir);
    const pressAt = plan.dashAt + c.pressK * STEP + plan.timing;
    if (brain.clock + 1e-9 < pressAt) return self.dash || s.me.grounded ? 'run' : 'fail';
    if (plan.pressedAt == null && !brain.stillGood(plan, s)) return 'fail';
    return pressMove(plan, brain, s, ex, c.move);
  },

  jumpStrike(plan, brain, s, ex) {
    const self = s.self;
    const c = plan.cand;
    const me = s.me;
    if (c.jump && !plan.jumped) {
      if (plan.waitUntil == null) plan.waitUntil = brain.clock + (c.delayK ?? 0) * STEP;
      if (brain.clock < plan.waitUntil) {
        ex.dir(0);
        return 'run';
      }
      if (c.jump !== 'air' && !me.grounded) return 'fail';
      const free = me.canAct || self.combat.cancellable || self.dashCancellable;
      if (!free) return brain.clock - plan.start > 0.3 ? 'fail' : 'run';
      if (ex.jump(self, c.jump === 'high')) {
        plan.jumped = true;
        plan.jumpAt = brain.clock;
        brain.telemetry.count('jumps');
      }
      ex.dir(sign(c.toX - me.x));
      return 'run';
    }
    if (plan.jumpAt == null) plan.jumpAt = plan.start;
    if (me.grounded && brain.clock - plan.jumpAt > 4 * STEP) return 'done';
    if (plan.pressedAt == null) {
      ex.dir(driftDir(me.x, me.vx, c.toX));
      const pressAt = plan.jumpAt + (c.pressK - (c.delayK ?? 0)) * STEP + plan.timing;
      if (brain.clock + 1e-9 < pressAt) return 'run';
      // Things change in flight (a pull, a hit, a turn): the strike must
      // still connect, and still leave a way home, from where the CPU
      // really is.
      if (!brain.stillGood(plan, s)) return 'fail';
    }
    return pressMove(plan, brain, s, ex, c.move);
  },

  shield(plan, brain, s, ex) {
    if (!s.me.grounded) return 'done';
    if (brain.clock < plan.raiseAt) {
      ex.dir(0);
      return 'run';
    }
    if (brain.clock > plan.until) return 'done';
    if (!plan.raised) {
      plan.raised = true;
      brain.telemetry.count('shields');
    }
    ex.shield(true);
    return 'run';
  },

  deflect(plan, brain, s, ex) {
    const self = s.self;
    if (plan.jump && !plan.jumped) {
      if (!s.me.grounded) plan.jumped = true;
      else {
        if (ex.jump(self, false)) {
          plan.jumped = true;
          brain.telemetry.count('jumps');
        }
        return 'run';
      }
    }
    if (s.me.grounded && brain.clock - plan.start > 4 * STEP) return 'fail';
    if (plan.pressedAt == null && brain.clock + 1e-9 < plan.pressAt) return 'run';
    const r = pressMove(plan, brain, s, ex, s.caps.deflect);
    if (r === 'done') brain.telemetry.count('deflects');
    return r;
  },

  move(plan, brain, s, ex) {
    if (brain.clock > plan.until) return 'done';
    ex.dir(plan.dir);
    return 'run';
  },

  dash(plan, brain, s, ex) {
    const self = s.self;
    if (!plan.requested) {
      if (!self.canFollowUp() || !self.movementReady(!s.me.grounded)) return 'fail';
      ex.dash(plan.dir);
      ex.dir(plan.dir);
      plan.requested = true;
      return 'run';
    }
    if (self.dash) {
      if (!plan.counted) {
        plan.counted = true;
        brain.telemetry.count(self.dash.air ? 'airDashes' : 'dashes');
      }
      ex.dir(plan.dir);
      return 'run';
    }
    return brain.clock - plan.start > 3 * STEP ? 'done' : 'run';
  },

  jump(plan, brain, s, ex) {
    const self = s.self;
    if (!plan.jumped) {
      if (!s.me.grounded && plan.jump !== 'air') return 'fail';
      if (ex.jump(self, plan.jump === 'high')) {
        plan.jumped = true;
        plan.jumpAt = brain.clock;
        brain.telemetry.count('jumps');
      }
      ex.dir(plan.dir ?? 0);
      return brain.clock - plan.start > 0.25 ? 'fail' : 'run';
    }
    ex.dir(plan.dir ?? 0);
    if (s.me.grounded && brain.clock - plan.jumpAt > 4 * STEP) return 'done';
    return brain.clock - plan.jumpAt > (plan.hold ?? 0.3) ? 'done' : 'run';
  },

  airDrift(plan, brain, s, ex) {
    if (s.me.grounded || brain.clock > plan.until) return 'done';
    ex.dir(plan.dir);
    return 'run';
  },

  neutral(plan, brain, s, ex) {
    const me = s.me;
    const self = s.self;
    if (!me.grounded) return 'done';
    // Where to stand: the strategy's distance from the opponent, on this
    // side of it, kept on the stage.
    const want = plan.dist + plan.dance;
    let tx = s.op.x - s.dir * want;
    tx = s.model.safeSpot(tx, plan.edgeRoom);
    if (brain.clock > plan.danceAt) {
      // Step in and out of the opponent's reach: never a standing target,
      // never a rhythm it can time.
      plan.dance = (brain.rng() * 2 - 1) * plan.danceRange;
      plan.danceAt = brain.clock + 0.16 + brain.rng() * 0.3;
    }
    const dx = tx - me.x;
    let d = Math.abs(dx) > 6 ? sign(dx) : 0;
    // Close in with a Dash when far and the plan wants offense.
    if (plan.dashIn && !plan.dashed && Math.abs(dx) > plan.dashFrom && self.canAct() && self.movementReady(false) &&
        sign(dx) === s.dir && me.energy > plan.dashEnergy) {
      ex.dash(s.dir);
      plan.dashed = true;
      brain.telemetry.count('dashes');
    }
    // Nothing to do here this instant: a small step keeps the spacing alive.
    if (!d) d = plan.idleDir || (plan.idleDir = brain.rng() < 0.5 ? -s.dir : s.dir);
    else plan.idleDir = 0;
    ex.dir(d);
    return brain.clock > plan.until ? 'done' : 'run';
  },

  air(plan, brain, s, ex) {
    const me = s.me;
    if (me.grounded) return 'done';
    let tx = plan.targetX;
    if (s.present) {
      const spacing = plan.spacing ?? (s.foeReach.poke + 20);
      tx = s.op.x - s.dir * spacing;
    }
    tx = s.model.safeSpot(tx, me.halfW + 30);
    ex.dir(driftDir(me.x, me.vx, tx));
    // Down sooner: only over ground, falling already, and when nothing
    // is coming the CPU's way.
    if (me.vy > 0 && plan.fastFall && s.model.supported(me.x, me.halfW, me.y) && !brain.threatened) ex.fastFall();
    return brain.clock > plan.until ? 'done' : 'run';
  },

  recover(plan, brain, s, ex) {
    const me = s.me;
    const self = s.self;
    if (me.grounded) {
      brain.telemetry.count('recoveries');
      return 'done';
    }
    const target = s.model.landingTarget(me.x, me.halfW, 16);
    const dx = target.x - me.x;
    const below = me.y - target.y;
    if (me.stun > 0 || me.paralysis > 0 || me.hitstop > 0) {
      // Steer the launch toward the stage (a direction held as a hit lands bends it).
      if (brain.rng() < brain.profile.diSkill) ex.dir(sign(dx));
      return 'run';
    }
    ex.dir(Math.abs(dx) > 2 ? sign(dx) : 0);
    const free = self.canFollowUp();
    // Still flying from a launch: an air dash or a lift waits until it acts.
    if (me.launched && free && me.vy > 0 && me.airJumps === 0) ex.fastFall();
    const caps = s.caps;
    const airDash = caps.movement.airDash;
    if (airDash && plan.dashFar > 0 && !me.launched && !me.freeFall && free && me.airDashes > 0 && !me.exhausted &&
        self.movementReady(true) && Math.abs(dx) > plan.dashFar && below > -40 && below < 70) {
      ex.dash(sign(dx));
      brain.telemetry.count('airDashes');
      return 'run';
    }
    if (me.airJumps > 0 && !me.freeFall && me.vy > 0 && below > -plan.jumpBelow && free) {
      if (ex.jump(self, false)) brain.telemetry.count('jumps');
      return 'run';
    }
    const rise = riseOf(caps);
    if (plan.pressedAt != null && !plan.risen) {
      if (pressMove(plan, brain, s, ex, rise.move) !== 'run') plan.risen = true;
    } else if (!plan.risen && me.airJumps === 0 && rise && me.vy > 0 && below > -20 && free && moveReady(self, rise.move)) {
      pressMove(plan, brain, s, ex, rise.move);
    }
    return brain.clock > plan.until ? 'fail' : 'run';
  },

  navigate(plan, brain, s, ex) {
    const me = s.me;
    const self = s.self;
    const foeY = s.op.grounded ? s.op.y : s.op.view.lastGroundY;
    const up = me.y - foeY;
    if (brain.clock > plan.until) return 'done';
    if (Math.abs(up) < 30 && me.grounded) return 'done';
    let tx = s.op.x;
    let jump = false;
    if (up > 30) {
      const maxRise = (plan.high ? caps(s).highJumpHeight : caps(s).jumpHeight) + (me.airJumps > 0 ? caps(s).airJumpHeight * 0.8 : 0);
      const step = s.model.stepToward(me.grounded ? me.y : me.lastGroundY, foeY, s.op.x, me.x, maxRise * 0.92, me.ground);
      if (step) {
        tx = Math.min(step.x1 - 18, Math.max(step.x0 + 18, s.op.x));
        if (me.grounded) {
          const gap = me.x < step.x0 ? step.x0 - me.x : me.x > step.x1 ? me.x - step.x1 : 0;
          const under = !step.oneWay && gap === 0;
          if (under) tx = me.x < (step.x0 + step.x1) / 2 ? step.x0 - 34 : step.x1 + 34;
          else if (gap < 90) jump = true;
          plan.high = me.y - step.y > caps(s).jumpHeight * 0.85;
        } else if (me.vy > -80 && me.airJumps > 0 && me.y > step.y + 6 && ex.jumpFree()) {
          ex.jump(self, false);
        }
      } else if (Math.abs(s.op.x - me.x) < 160 && me.grounded) {
        jump = true;
        plan.high = true;
      }
    } else if (up < -30 && me.grounded && me.ground && me.ground !== s.model.floor) {
      // Down: walk off the nearer edge of this surface toward the opponent.
      const g = s.model.surfaceOf(me.ground);
      if (g) {
        const left = g.x0 - me.halfW - 18;
        const right = g.x1 + me.halfW + 18;
        tx = s.op.x < g.x0 ? left : s.op.x > g.x1 ? right : me.x - g.x0 < g.x1 - me.x ? left : right;
      }
    }
    const dx = tx - me.x;
    const d = Math.abs(dx) > 6 ? sign(dx) : 0;
    ex.dir(me.grounded ? d : driftDir(me.x, me.vx, tx));
    if (jump && self.canAct() && ex.jumpFree()) {
      if (ex.jump(self, !!plan.high)) brain.telemetry.count('jumps');
    }
    // Stuck: moving toward a target without getting any closer.
    if (Math.abs(me.x - plan.lastX) > 12 || Math.abs(me.y - plan.lastY) > 12) {
      plan.lastX = me.x;
      plan.lastY = me.y;
      plan.movedAt = brain.clock;
    } else if (brain.clock - plan.movedAt > 0.9) {
      brain.telemetry.count('stuckNavigation');
      return 'fail';
    }
    return 'run';
  },

  edgeguard(plan, brain, s, ex) {
    const me = s.me;
    if (!me.grounded) return 'done';
    if (!s.present || !s.op.offstage) return 'done';
    const dx = plan.targetX + plan.dance - me.x;
    if (brain.clock > plan.danceAt) {
      plan.dance = (brain.rng() * 2 - 1) * 14;
      plan.danceAt = brain.clock + 0.2 + brain.rng() * 0.25;
    }
    ex.dir(Math.abs(dx) > 4 ? sign(dx) : -sign(dx || 1));
    return brain.clock > plan.until ? 'done' : 'run';
  },

  reposition(plan, brain, s, ex) {
    const me = s.me;
    if (!me.grounded) return 'done';
    if (brain.clock > plan.danceAt) {
      plan.dance = (brain.rng() * 2 - 1) * (plan.danceRange ?? 40);
      plan.danceAt = brain.clock + 0.25 + brain.rng() * 0.35;
    }
    const dx = plan.targetX + plan.dance - me.x;
    ex.dir(Math.abs(dx) > 5 ? sign(dx) : sign(plan.dance) || 1);
    return brain.clock > plan.until ? 'done' : 'run';
  },
};

const caps = (s) => s.caps.movement;

// A plan of kind `kind` with its spec, started now.
export function makePlan(kind, spec, brain) {
  const step = STEPS[kind];
  if (!step) throw new Error(`[Alva] CPU Intelligence has no plan "${kind}"`);
  const timingError = (brain.rng() * 2 - 1) * brain.profile.timing;
  return {
    kind, ...spec, start: brain.clock, until: spec.until ?? brain.clock + (spec.ttl ?? 1.2),
    timing: spec.timing ?? timingError, pressedAt: null, step,
  };
}

// Kinds that commit the fighter: a reassessment does not replace them
// (only a threat or the plan's own end does).
export const COMMITTED = new Set(['strike', 'press', 'dashStrike', 'jumpStrike', 'shield', 'deflect', 'dash', 'jump', 'recover', 'move', 'airDrift']);
