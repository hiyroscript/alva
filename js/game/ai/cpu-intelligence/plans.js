// CPU Intelligence, layers 7 to 9: plans (combo and sequence execution,
// stage navigation and recovery, neutral footwork).
//
// Purpose: a plan is one purposeful objective carried out over as many
// steps as it needs, through the executor's legal inputs only:
//
//   strike      press one move (an attack, a projectile, a technique, a
//               summon, the Deflect) now or at a planned step
//   mash        a Mash Combo (js/data/mash-combo.js): five fresh presses of
//               one of its pair's buttons, released between them as a hand
//               does, at the level's own rhythm (never faster than every
//               other step), the first starting that move as ever and the
//               rest made while it plays; done once the fighter's own
//               detector has started the series, failed if it never does
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
//               opponent, closing in by running or Dashing when the plan
//               calls for offense, and settling once there (it moves again
//               only when the spacing has drifted past a dead band, so it
//               never twitches round a spot); when baiting, a deliberate
//               step in and out of reach every second or so
//   hold        a deliberate wait (intent 'wait'): it knows why it waits
//               (`why`), the spot it holds (`holdX`, walked back to if it is
//               pushed off), whether to keep its Shield ready (`guard`: up as
//               the opponent closes in or attacks, while the Energy lasts,
//               for a few blocks at most, never for ever), and what ends the
//               wait: the opponent coming within reach, its patience running
//               out, the objective changing, the Launch Point recovered, the
//               footing fading or a hazard's warning, the opponent back in
//               play (see holdOver)
//   retreat     break off toward a safer spot (`targetX`, chosen by the
//               brain from the real launch rules), Dashing clear when the
//               opponent is right on it; abandoned if the opponent cuts it off
//               or the spot turns unsafe
//   air         airborne control: drift toward a useful landing, fast fall
//               when landing sooner is safer, never drift off the stage
//   recover     get back to the stage: hold toward it, space the air
//               jumps, air dash home when far out, a lift as a last resort,
//               steer a launch while stunned
//   navigate    reach an opponent on another level: walk under a surface
//               and jump to it (the higher jump and an air jump if needed),
//               or walk off a platform's edge (there is no platform drop)
//   edgeguard   hold the ledge the opponent must come back to, ready
//   reposition  make for a better spot (a safe distance from where an
//               opponent will respawn), then wait there
//
// Every plan has a lifetime and explicit end: 'run' while it goes on,
// 'done' when its objective is met, 'fail' when it can no longer be (the
// brain replans at once, so a failed plan never leaves the CPU idle). A
// plan standing still on purpose says so (`intent` 'wait', with its `why`):
// the liveness monitor counts that as waiting, never as inactivity.
//
// Inputs: the brain, the situation, the executor. Outputs: makePlan.

import { moveReady } from './capabilities.js';
import { driftDir, STEP } from './prediction.js';
import { riseOf } from './values.js';
import { BASE_FIGHTER_MOVEMENT as MV } from '../../../data/movement.js';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// Footwork toward `tx` with a dead band: it sets off only once more than
// `band` away and stops within `stop`, so it settles on a spot rather than
// twitching round it. The way to hold (-1, 0 or 1); the state is the plan's.
function stepToward(plan, me, tx, band, stop = 6) {
  if (plan.moving == null) plan.moving = false;
  const dx = tx - me.x;
  // Letting go a stopping distance early: it slides to the spot rather
  // than past it and back.
  const slide = sign(me.vx) === sign(dx) ? (me.vx * me.vx) / (2 * MV.deceleration) : 0;
  if (plan.moving) {
    if (Math.abs(dx) <= stop + slide) plan.moving = false;
  } else if (Math.abs(dx) > band) {
    plan.moving = true;
  }
  // Still sliding the other way past top speed (out of a Dash): let it run
  // down rather than fight it.
  if (plan.moving && sign(me.vx) === -sign(dx) && Math.abs(me.vx) > MV.maxSpeed) return 0;
  return plan.moving ? sign(dx) : 0;
}

// The spot `spacing` from the opponent on this side of it, kept on the
// stage with `room` to spare, re-aimed only once the opponent (as the CPU
// sees it) has moved on by more than `band` or changed sides: footwork that
// answers what the opponent does, not each step it takes.
function aimAt(plan, s, spacing, room, band) {
  const ox = s.op.x;
  if (plan.aimX == null || Math.abs(ox - plan.aimFrom) > band || s.dir !== plan.aimDir || Math.abs(spacing - plan.aimSpacing) > band) {
    plan.aimFrom = ox;
    plan.aimDir = s.dir;
    plan.aimSpacing = spacing;
    plan.aimX = s.model.safeSpot(ox - s.dir * spacing, room);
  }
  return plan.aimX;
}

// What ends a deliberate wait (see `hold` in the header), as a reason, or
// null while it goes on. Fixed phrases: they are counted by name.
function holdOver(plan, brain, s) {
  const me = s.me;
  if (brain.clock - plan.start > plan.patience) return 'patience ran out';
  if (plan.objective && brain.objective.kind !== plan.objective) return 'objective changed';
  if (plan.lpTarget != null && me.lp <= plan.lpTarget) return 'Launch Point recovered';
  const ground = me.ground ? s.model.surfaceOf(me.ground) : null;
  if (ground?.fading) return 'footing fading';
  if (s.model.dangerZones.length && s.model.dangerAt(me.x, me.halfW, 6)) return 'hazard warning';
  if (plan.absent) return s.present ? 'opponent back in play' : null;
  if (!s.present) return 'opponent out of play';
  // The opponent coming within reach: the brain chooses again (a strike, a
  // Shield, a step away), unless the Shield is up and holding.
  const reach = s.foeReach.lunge + 30;
  if (s.dist < reach && !plan.raised) return plan.guard === 'shield' && brain.shieldUsable(s, plan) ? null : 'opponent in reach';
  return null;
}

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
  mash(plan, brain, s, ex) {
    const self = s.self;
    const mash = self.mash;
    if (mash?.active) {
      brain.telemetry.count('mashCombos');
      return 'done';
    }
    if (plan.presses >= plan.need) {
      // All pressed: recognized, it waits for the move in progress; never
      // recognized, nothing more will come of it.
      if (mash?.armed) return 'run';
      return brain.clock - plan.lastPress > 2 * STEP ? 'fail' : 'run';
    }
    if (!s.me.grounded || s.me.shielding) return 'fail';
    // Its first press starts the move as ever; a hit-confirm's presses are
    // made while its own move still plays (they count, starting nothing).
    if (plan.presses === 0 && !plan.combo && !moveReady(self, plan.move)) return 'fail';
    if (brain.clock + 1e-9 < plan.nextAt) return 'run';
    if (ex.press(plan.action)) {
      plan.presses++;
      plan.lastPress = brain.clock;
      // The next press after a release step at least; a looser hand waits
      // a little longer (the level's timing), always well inside the
      // combo's own window.
      const extra = Math.min(3, Math.round((brain.rng() * brain.profile.timing) / STEP));
      plan.nextAt = brain.clock + (1 + extra) * STEP;
    }
    return 'run';
  },

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
      const free = me.canAct || self.combat.cancellable || self.dashCancellable || self.moveYields();
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
      // Waiting off the stage for the moment to strike: never past the
      // point of no return (the plan is dropped for the way back).
      if (me.offstage && !brain.canStillReturn(s, plan)) return 'fail';
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
      else if (plan.jumpAt != null && brain.clock + 1e-9 < plan.jumpAt) {
        // Standing its ground until the moment to jump.
        ex.dir(0);
        return 'run';
      } else {
        if (ex.jump(self, false)) {
          plan.jumped = true;
          brain.telemetry.count('jumps');
        }
        return 'run';
      }
    }
    if (s.me.grounded && brain.clock - Math.max(plan.start, plan.jumpAt ?? 0) > 4 * STEP) return 'fail';
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

  hold(plan, brain, s, ex) {
    const me = s.me;
    if (!me.grounded) {
      brain.endWait(plan, 'left the ground');
      return 'done';
    }
    const over = holdOver(plan, brain, s);
    if (over) {
      brain.endWait(plan, over);
      return 'done';
    }
    // Blocks taken behind the Shield: a few, then it does something else
    // (counter the attacker's recovery, slip away) rather than be worn down.
    if (me.shieldStun > 0 && !(plan.lastStun > 0)) plan.blocks++;
    plan.lastStun = me.shieldStun;
    if (plan.blocks >= plan.maxBlocks && me.shieldStun <= 0) {
      brain.endWait(plan, 'blocked enough');
      return 'done';
    }
    // The Shield, ready: up while the opponent closes in or strikes, down
    // once it backs off; never held past what the Energy and the level's
    // patience allow.
    if (plan.guard === 'shield') {
      // Only an opponent that could reach it soon: on its level, or above
      // it close enough to come down on it.
      const level = Math.abs(s.dy) < s.foeCaps.height + 40;
      const closing = level && s.dist < s.foeReach.lunge + 40 + Math.max(0, -s.dir * s.op.vx) * 0.25;
      const striking = level && !!s.op.attackDef && s.op.view.attackPhase !== 'recovery' && s.dist < s.foeReach.lunge + 120;
      if ((closing || striking || me.shieldStun > 0) && brain.shieldUsable(s, plan)) {
        if (!plan.raised) {
          plan.raised = true;
          brain.telemetry.count('shields');
        }
        plan.shieldFor += STEP;
        ex.shield(true);
        return 'run';
      }
      if (plan.raised && plan.shieldFor > plan.maxShield) {
        // A long stint behind the Shield: it stays down a while, whatever
        // comes next (an answer to a real threat aside).
        brain.shieldRestUntil = brain.clock + 1.2 + (1 - brain.profile.patience) * 0.8;
        brain.endWait(plan, 'Shield held long enough');
        return 'done';
      }
      plan.raised = false;
    }
    // Back to the spot it holds, if pushed off it.
    ex.dir(stepToward(plan, me, plan.holdX, 30, 8));
    return brain.clock > plan.until ? (brain.endWait(plan, 'patience ran out'), 'done') : 'run';
  },

  retreat(plan, brain, s, ex) {
    const me = s.me;
    const self = s.self;
    if (!me.grounded || brain.clock > plan.until) return 'done';
    const dx = plan.targetX - me.x;
    if (Math.abs(dx) < 14) return 'done';
    // Cut off (the opponent now between it and the spot, close), or the
    // spot gone bad (a hazard's warning over it): a fresh choice.
    if (s.present && sign(s.op.x - me.x) === sign(dx) && Math.abs(s.op.x - me.x) < Math.abs(dx) && s.dist < 240) {
      brain.abandon(plan, 'retreat cut off');
      return 'done';
    }
    if (s.model.dangerZones.length && s.model.dangerAt(plan.targetX, me.halfW, 10)) {
      brain.abandon(plan, 'retreat spot under a warning');
      return 'done';
    }
    // The opponent right on it: Dash clear, if the Energy can spare it.
    const dash = s.caps.movement.dash;
    if (plan.dashOk && !plan.dashed && dash && s.present && s.dist < s.foeReach.lunge + 70 && self.canAct() && self.movementReady(false) &&
        me.energy > 55 && Math.abs(dx) > dash.distance * 0.7) {
      ex.dash(sign(dx));
      plan.dashed = true;
      brain.telemetry.count('dashes');
      brain.telemetry.count('disengageDashes');
    }
    // Not getting anywhere (a wall, the ledge guard): give it up.
    if (Math.abs(me.x - plan.lastX) > 10) {
      plan.lastX = me.x;
      plan.movedAt = brain.clock;
    } else if (brain.clock - plan.movedAt > 0.5) {
      brain.telemetry.count('navigationFailures');
      brain.abandon(plan, 'retreat blocked');
      return 'done';
    }
    ex.dir(sign(dx));
    return 'run';
  },

  neutral(plan, brain, s, ex) {
    const me = s.me;
    const self = s.self;
    if (!me.grounded) return 'done';
    // Baiting: a deliberate step into the opponent's reach and back out,
    // every second or so (never a twitch, never a rhythm it can time).
    if (plan.baitRange && brain.clock > plan.baitAt) {
      plan.bait = plan.bait ? 0 : (brain.rng() < 0.5 ? -1 : 1) * plan.baitRange;
      plan.baitAt = brain.clock + 0.6 + brain.rng() * 0.8;
    }
    // Where to stand: the strategy's distance from the opponent, on this
    // side of it, kept on the stage.
    const tx = aimAt(plan, s, plan.dist + (plan.bait ?? 0), plan.edgeRoom, plan.band);
    const dx = tx - me.x;
    const d = stepToward(plan, me, tx, plan.band, 6);
    // Close in with a Dash when far and the plan wants offense.
    if (plan.dashIn && !plan.dashed && Math.abs(dx) > plan.dashFrom && self.canAct() && self.movementReady(false) &&
        sign(dx) === s.dir && me.energy > plan.dashEnergy) {
      ex.dash(s.dir);
      plan.dashed = true;
      brain.telemetry.count('dashes');
    }
    // At its spacing it settles: waiting there on purpose.
    plan.intent = d ? 'act' : 'wait';
    ex.dir(d);
    return brain.clock > plan.until ? 'done' : 'run';
  },

  air(plan, brain, s, ex) {
    const me = s.me;
    if (me.grounded) return 'done';
    const tx = s.present ? aimAt(plan, s, plan.spacing ?? (s.foeReach.poke + 20), me.halfW + 30, 24) : s.model.safeSpot(plan.targetX, me.halfW + 30);
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
    // Already over the stage: nothing more to spend, just land.
    if (s.model.supported(me.x, me.halfW, me.y)) return brain.clock > plan.until ? 'fail' : 'run';
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
    } else if (up < -30 && me.grounded && me.ground && !s.model.isMain(me.ground)) {
      // Down: walk off the nearer edge of this surface toward the opponent,
      // one with footing below it (never off the end of the stage).
      const g = s.model.surfaceOf(me.ground);
      if (g) {
        const left = g.x0 - me.halfW - 18;
        const right = g.x1 + me.halfW + 18;
        let edge = s.op.x < g.x0 ? left : s.op.x > g.x1 ? right : me.x - g.x0 < g.x1 - me.x ? left : right;
        const other = edge === left ? right : left;
        if (!s.model.supported(edge, me.halfW, g.y + 4) && s.model.supported(other, me.halfW, g.y + 4)) edge = other;
        tx = edge;
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
    // At the ledge it waits, ready (moving again only if the spot it wants
    // drifts by more than the dead band).
    const d = stepToward(plan, me, plan.targetX, 16, 5);
    plan.intent = d ? 'act' : 'wait';
    ex.dir(d);
    return brain.clock > plan.until ? 'done' : 'run';
  },

  reposition(plan, brain, s, ex) {
    const me = s.me;
    if (!me.grounded) return 'done';
    const d = stepToward(plan, me, plan.targetX, 24, 6);
    plan.intent = d ? 'act' : 'wait';
    ex.dir(d);
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
// (only a threat or the plan's own end does). A hold, a retreat and the
// footwork are reconsidered on every reassessment (an opening is taken
// from a wait as from anywhere).
export const COMMITTED = new Set(['mash', 'strike', 'press', 'dashStrike', 'jumpStrike', 'shield', 'deflect', 'dash', 'jump', 'recover', 'move', 'airDrift']);

// Kinds a reassessment may carry on with rather than start afresh (their
// state, such as a dead band or how long a wait has run, is kept).
export const CONTINUED = new Set(['neutral', 'hold', 'retreat', 'edgeguard', 'reposition']);
