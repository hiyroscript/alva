// CPU Intelligence: combat execution, plans carried out step by step.
//
// Purpose: each plan the planner picks (tactics.js, threats.js) is carried
// out here over as many steps as it needs, through the executor's wants
// only: walk or Dash into range and strike the moment the move would
// connect; jump at the height the aerial needs and strike on the way;
// hold a spacing; bait; take the centre back; climb or drop to another
// level; hold the ledge; raise the Shield on time (into its perfect window
// when the level can) and lower it after; jump, step or Dash out of a
// threat; jump and Deflect a shot; brace for a hit (bending its launch
// toward the stage). Each runner watches its own result: an attack that
// did not start, a target that moved away, a Dash that did not happen,
// ends the plan at once so the planner replaces it on the same step: the
// CPU never stands waiting on a plan that failed.
//
// Inputs: the situation, the executor, a plan, the controller (to note
// what it used). Outputs: runPlan, INTENTIONAL.
// Important constraints: wants only, never a write to a fighter.

import { STEP } from './forecast.js';
import { moveFit } from './targeting.js';
import { startable } from './tactics.js';
import { navigateStep } from './navigation.js';

// Plans that may hold the fighter still on purpose (a Shield up, a spacing
// held, a ledge held, a wait for a respawn in place, a cast): never mistaken
// for inactivity by the watchdog.
export const INTENTIONAL = Object.freeze(new Set(['shield', 'space', 'edgeguard', 'reposition', 'brace', 'strike', 'jumpDeflect', 'wait']));

// Whether move `m` has started on the fighter.
function started(S, m) {
  switch (m.kind) {
    case 'technique':
      return S.technique?.def.id === m.id;
    case 'summon':
      return S.summoning || S.self.combat.abilityCooldowns.active(m.id);
    default:
      return S.attack?.def.id === m.atk.id;
  }
}

function strike(S, ex, plan, c) {
  const m = plan.move;
  if (plan.pressedAt === undefined) {
    const free = m.ability ? S.canAct && S.grounded : S.canFollowUp;
    if (!free) {
      // Busy a moment longer (its own recovery, a landing): wait for it.
      plan.waited = (plan.waited ?? 0) + STEP;
      if (plan.waited > 0.3) return 'fail';
      if (!S.grounded) ex.move(Math.abs(S.dx) > 12 ? S.dir : 0);
      return 'run';
    }
    if (!S.moveReady(m) || (S.attack && m.atk && S.attack.def.id === m.atk.id)) return 'fail';
    if (m.kind === 'deflect' && S.grounded) return 'fail';
    if (!ex.canPress(m.action)) return 'run';
    ex.press(m.action);
    plan.pressedAt = S.clock;
    return 'run';
  }
  if (!plan.started && started(S, m)) {
    plan.started = true;
    c.noteUse(m, S);
  }
  if (!plan.started) return S.clock - plan.pressedAt > 4 * STEP ? 'fail' : 'run';
  // An aerial with air control is steered at its target.
  if (!S.grounded && (m.atk?.airControl ?? 0) > 0 && S.foeIn) ex.move(Math.abs(S.dx) > 10 ? S.dir : 0);
  if (S.canAct && !S.technique && !S.summoning) return 'done';
  // It hit and may be cut short: back to the planner for the follow-up.
  if (S.cancellable && !plan.cancelSeen) {
    plan.cancelSeen = true;
    return 'done';
  }
  return 'run';
}

function engage(S, ex, plan) {
  const m = plan.move;
  if (S.clock > plan.until || !S.foeIn) return 'done';
  if (startable(S, m)) {
    const fit = moveFit(S, m);
    if (fit) return { next: { kind: 'strike', move: m, value: plan.value } };
  } else if (!S.moveReady(m)) {
    return 'fail';
  }
  if (!S.grounded) return 'done';
  const d = S.dist;
  const { lo, hi } = plan.band;
  if (plan.dashing) {
    if (ex.dashResult || S.dashing) {
      plan.dashing = false;
      plan.dash = false;
    } else {
      ex.dash(S.dir);
      return 'run';
    }
  }
  if (d > hi - 4) {
    if (plan.dash && d - hi > 120 && S.canAct) {
      plan.dashing = true;
      ex.dashResult = null;
      ex.dash(S.dir);
      return 'run';
    }
    ex.move(S.dir);
  } else if (d < lo + 4) {
    ex.move(-S.dir);
  } else {
    // In its band but it would not connect (height, timing): a beat, then
    // the planner looks again.
    plan.idle = (plan.idle ?? 0) + STEP;
    if (plan.idle > 0.15) return 'done';
  }
  return 'run';
}

function jumpStrike(S, ex, plan) {
  const m = plan.move;
  if (plan.at === undefined) {
    if (plan.jump === null) {
      plan.at = S.clock;
    } else {
      if (plan.jump === 'air') {
        if (S.grounded || S.airJumps <= 0 || S.freeFall || !S.canFollowUp) return 'fail';
      } else if (!S.grounded || !(S.canAct || S.cancellable)) {
        return 'fail';
      }
      ex.jump(plan.jump);
      ex.move(plan.steer);
      plan.at = S.clock;
      return 'run';
    }
  }
  const t = S.clock - plan.at;
  if (S.grounded && t > 0.1) return 'done';
  if (!S.foeIn) return 'done';
  // Toward the target, without sailing past it.
  const ahead = S.dx * plan.steer;
  ex.move(ahead > 26 ? plan.steer : ahead < 6 ? -plan.steer : 0);
  if (S.canFollowUp && S.moveReady(m)) {
    const fit = moveFit(S, m);
    if (fit) return { next: { kind: 'strike', move: m, value: plan.value } };
  }
  if (t > plan.pressIn + 0.3) return 'done';
  return 'run';
}

function space(S, ex, plan) {
  if (S.clock > plan.until || !S.foeIn || !S.grounded) return 'done';
  const d = S.dist;
  if (d < plan.dist - 16) {
    const away = -S.dir;
    if (!S.groundAhead(away, 50)) return 'done';
    ex.move(away);
    plan.held = 0;
  } else if (d > plan.dist + 26) {
    ex.move(S.dir);
    plan.held = 0;
  } else {
    // Held on purpose, reading the opponent; a little shuffle in and out
    // after a moment, as a player keeps the spacing alive.
    plan.held = (plan.held ?? 0) + STEP;
    if (plan.held > 0.25) {
      const phase = Math.floor((plan.held - 0.25) / 0.18) % 3;
      if (phase === 0) ex.move(S.dir);
      else if (phase === 1 && S.groundAhead(-S.dir, 50)) ex.move(-S.dir);
    }
  }
  return 'run';
}

function moveTo(S, ex, plan) {
  if (S.clock > plan.until) return 'done';
  const dx = plan.x - S.x;
  if (Math.abs(dx) < 12) return 'done';
  ex.move(Math.sign(dx));
  if (plan.blocked) return 'done';
  return 'run';
}

function reposition(S, ex, plan) {
  if (S.clock > plan.until) return 'done';
  const dx = plan.x - S.x;
  if (Math.abs(dx) > 24) {
    ex.move(Math.sign(dx));
  } else {
    // In place: stays loose, a step either way, never frozen.
    plan.held = (plan.held ?? 0) + STEP;
    const phase = Math.floor(plan.held / 0.22) % 4;
    if (phase === 1) ex.move(1);
    else if (phase === 3) ex.move(-1);
  }
  return 'run';
}

function advance(S, ex, plan) {
  if (S.clock > plan.until || !S.foeIn || !S.grounded) return 'done';
  ex.move(S.dir);
  if (plan.blocked) return 'done';
  return 'run';
}

function retreat(S, ex, plan) {
  if (S.clock > plan.until || !S.grounded) return 'done';
  ex.move(plan.dir);
  if (plan.blocked) return 'done';
  return 'run';
}

function bait(S, ex, plan) {
  if (S.clock > plan.until || !S.foeIn || !S.grounded) return 'done';
  if (plan.phase === 'in') {
    if (S.dist <= plan.depth) plan.phase = 'out';
    else ex.move(S.dir);
  }
  if (plan.phase === 'out') {
    if (S.dist >= plan.out) return 'done';
    if (!S.groundAhead(-S.dir, 50)) return 'done';
    ex.move(-S.dir);
  }
  if (plan.blocked) return 'done';
  return 'run';
}

function edgeguard(S, ex, plan) {
  if (S.clock > plan.until || !S.foeIn || !S.grounded) return 'done';
  const dx = plan.x - S.x;
  if (Math.abs(dx) > 14) ex.move(Math.sign(dx));
  return 'run';
}

function navigate(S, ex, plan) {
  if (S.clock > plan.until || !S.foeIn) return 'done';
  if (S.sameLevel && S.grounded) return 'done';
  return navigateStep(S, ex, plan.nav);
}

function shield(S, ex, plan) {
  if (!S.grounded) return 'done';
  if (S.clock >= plan.raiseAt) ex.shield();
  if (S.clock > plan.until && S.self.combat.shieldStun <= 0) return 'done';
  return 'run';
}

function evade(S, ex, plan) {
  if (plan.how === 'jump') {
    if (plan.at === undefined) {
      if (!S.grounded || !(S.canAct || S.cancellable)) return 'fail';
      ex.jump(plan.jump ?? 'normal');
      if (plan.dir) ex.move(plan.dir);
      plan.at = S.clock;
      return 'run';
    }
    if (plan.dir) ex.move(plan.dir);
    const t = S.clock - plan.at;
    if ((S.grounded && t > 0.1) || t > 0.3) return 'done';
    return 'run';
  }
  if (plan.how === 'dash') {
    if (plan.at === undefined) {
      plan.at = S.clock;
      ex.dashResult = null;
    }
    if (ex.dashResult === 'ok' || S.dashing) return 'done';
    if (ex.dashResult === 'failed' || S.clock - plan.at > 0.2) return 'fail';
    ex.dash(plan.dir);
    return 'run';
  }
  // A step.
  if (S.clock > plan.until) return 'done';
  ex.move(plan.dir);
  if (plan.blocked) return 'done';
  return 'run';
}

function jumpDeflect(S, ex, plan) {
  const t = S.clock - plan.at;
  if (!plan.jumped) {
    if (t >= plan.jumpIn - 1e-6) {
      if (!S.grounded || !S.canAct) return 'fail';
      ex.jump(plan.kind);
      plan.jumped = true;
    }
    return 'run';
  }
  if (!plan.pressed) {
    if (t >= plan.deflectIn - 1e-6) {
      if (S.grounded || !S.canFollowUp) return 'fail';
      if (!ex.canPress('shield')) return 'run';
      ex.press('shield');
      plan.pressed = true;
      plan.pressedAt = S.clock;
    }
    return 'run';
  }
  if (S.clock - plan.pressedAt > 0.45 || (S.canAct && S.clock - plan.pressedAt > 0.1)) return 'done';
  return 'run';
}

function brace(S, ex, plan) {
  // A hit it cannot avoid: hold toward the stage's middle, so a launch is
  // bent away from the Void (near the middle, into the hit).
  const mid = S.center - S.x;
  ex.move(Math.abs(mid) > 40 ? Math.sign(mid) : plan.threat?.from || S.dir);
  if (S.clock > plan.until) return 'done';
  return 'run';
}

function wait(S, ex) {
  // Nothing it may start: hold toward the stage's middle (a launch is bent
  // that way), steer a drift toward the opponent once free in the air.
  if (S.canAct || S.canFollowUp) return 'done';
  if (S.stun > 0 || S.paralyzed) ex.move(Math.sign(S.center - S.x) || 1);
  return 'run';
}

function drift(S, ex, plan) {
  if (S.grounded || S.clock > plan.until || !S.foeIn) return 'done';
  const dx = plan.x - S.x;
  ex.move(Math.abs(dx) > 16 ? Math.sign(dx) : 0);
  // Coming down where it wants to be, over the stage: a fast fall.
  if (plan.fall && S.vy > 0 && Math.abs(dx) < 120 && !S.offStage) ex.down();
  return 'run';
}

const RUNNERS = {
  wait, drift,
  strike, engage, jumpStrike, space, move: moveTo, reposition, advance, retreat, bait, edgeguard, navigate, shield, evade,
  jumpDeflect, brace,
};

// One step of `plan`: 'run' while it goes on, 'done' or 'fail' when the
// planner should choose again, or { next } for the plan it turns into.
export function runPlan(S, ex, plan, c) {
  const run = RUNNERS[plan.kind];
  if (!run) return 'fail';
  return run(S, ex, plan, c);
}
