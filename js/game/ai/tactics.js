// CPU Intelligence: the tactical planner, which plan serves the goal.
//
// Purpose: generates the plans that fit this moment and weighs each by its
// expected outcome. Offence: every move the fighter has (its strikes on
// the ground and in the air, its projectiles, techniques and summons, its
// Deflect as an aerial strike) that would connect now, after walking or
// Dashing into its range, or from a jump of the height that puts its
// hitbox on the opponent; each weighed by the chance it lands (an opponent
// held by a hit or a paralysis cannot avoid it, a free one may move or
// shield: as long as it has to see it coming, and as its habits say), what
// landing it is worth (valuation.js: damage, a launch toward the Void, a
// paralysis, follow-ups), what a block or a whiff costs (the window it
// leaves against the opponent's quickest answer, a Shield's stall) and
// what it spends (Energy, a long cooldown). Neutral: holding a spacing
// just outside the opponent's reach, advancing, backing off to let its own
// Launch Point recover, taking the centre back, following the opponent to
// another level, holding the ledge against a recovering opponent, baiting
// a whiff, waiting for a respawn in a good spot. The strategic goal and
// the opponent's habits tilt the weights; a move not used for a while
// gains a little (its whole kit stays in play), one just used loses a
// little (no spam), never enough to pick a bad move.
//
// Inputs: the situation, the controller's memory (moves used, the
// opponent model). Outputs: planCandidates, strikeValue, aerialPlan.
// Important constraints: plans are data; plans.js executes them through
// the executor. Nothing here reads a fighter's id.

import { reachOf, STEP } from './forecast.js';
import { foeAt, moveFit, arcAt } from './targeting.js';
import { hitWorth, punishCost, energyCost, foeHitWorth } from './valuation.js';
import { goalSurface, route } from './navigation.js';
import { clamp } from '../../core/utils.js';

const GOAL_ROLES = Object.freeze({
  finish: { launcher: 1.3, finisher: 1.45, unblockable: 1.1 },
  build: { comboStarter: 1.2, fast: 1.1, trap: 1.1 },
  punish: { fast: 1.2, launcher: 1.1 },
  edgeguard: { zoning: 1.35, launcher: 1.2, airToGround: 1.2, antiAir: 1.1 },
  pressure: { groundPressure: 1.15, shieldPressure: 1.1, trap: 1.15, comboStarter: 1.1 },
  forceAction: { launcher: 1.2, finisher: 1.2 },
});

// Whether move `m` may be started right now (or the instant the fighter
// is free): free to act, or able to cut short what it is doing; specials
// only free and on the ground; never the same attack cutting into itself.
export function startable(S, m) {
  if (!S.moveReady(m)) return false;
  if (m.ability) return S.canAct && S.grounded;
  if (!S.canFollowUp) return false;
  if (S.attack && m.atk && S.attack.def.id === m.atk.id) return false;
  return true;
}

// How likely a move that would meet the opponent `fit.t` seconds from now
// is to land, be blocked or be avoided.
function landingOdds(S, m, fit) {
  const t = fit.t;
  const model = S.model;
  const busy = S.foeBusy;
  const at = foeAt(S, t);
  let pAvoid = 0;
  let pBlock = 0;
  const canShield = !m.hit.unblockable && !!S.fk?.shield && !S.foeExhausted && at.grounded;
  if (S.foeShielding && canShield) {
    // Behind a raised Shield it blocks, unless it drops it in time.
    const tell = t - Math.max(0, busy);
    pBlock = clamp(0.92 - 0.25 * (model?.rate.shields < 0.4 ? 1 : 0) * clamp(tell / 0.6, 0, 1), 0.5, 0.92);
    pAvoid = 0.04;
  } else if (t > busy + 0.02) {
    const tell = t - Math.max(0, busy);
    pAvoid = clamp((tell - 0.14) / 0.45, 0, 0.72);
    if (m.proj) pAvoid = clamp(pAvoid + 0.05 + 0.3 * (model?.rate.dodgesShots ?? 0.3) * clamp(tell / 0.4, 0, 1), 0, 0.85);
    if (canShield) {
      const habit = 0.08 + 0.4 * (model?.rate.shields ?? 0.3);
      pBlock = S.foeShielding ? 0.8 : clamp(habit * clamp(tell / 0.25, 0.3, 1), 0, 0.6);
      pAvoid *= 0.75;
    }
  }
  const pHit = Math.max(0, 1 - pAvoid - pBlock);
  return { pHit, pBlock, pAvoid, at };
}

// The value of pressing move `m`, which would meet the opponent as `fit`
// says (`delay` seconds of approach or jump first): its expected outcome,
// less what it spends.
export function strikeValue(S, m, fit, { mem = null, delay = 0 } = {}) {
  const p = S.profile;
  const { pHit, pBlock, at } = landingOdds(S, m, fit);
  let worth = hitWorth(S, m, { at, face: fit.face });
  const roles = GOAL_ROLES[S.goal];
  if (roles) for (const r of m.roles) if (roles[r]) worth *= roles[r];
  const dist = Math.abs(at.x - S.x);
  // A strike is next to its target when it lands (or is blocked).
  const contact = m.kind === 'melee' || m.kind === 'deflect' ? Math.min(dist, m.atk.hitbox.x + m.atk.hitbox.w) : dist;
  // Blocked: Energy drained from the Shield (an emptied one exhausts its
  // fighter: no Shield until it refills), pushed toward the ledge, and the
  // window its recovery (and a stalling Shield) leaves.
  let onBlock = 0;
  if (pBlock > 0) {
    onBlock += S.foeEnergy <= 15 ? 6 : 0.6;
    if (m.hit.blockPush > 0 && S.foeLedge && S.foeLedge.inside < 160) onBlock += 1.2;
    if (m.kind === 'melee' || m.kind === 'deflect') {
      const stall = S.fk?.shield?.stall ?? 0;
      const rebound = m.motion === 'homing' || m.motion === 'bounce' ? 0.5 : 1;
      onBlock -= punishCost(S, (m.exposure + stall - m.hit.blockstun) * rebound + stall * 0.5, contact);
    }
  }
  // Missed: the whole recovery against the opponent's answer (from range a
  // projectile's recovery is rarely punished).
  const whiff = punishCost(S, m.exposure + (m.kind === 'technique' ? 0 : m.active * 0.5), dist);
  let v = pHit * worth + pBlock * onBlock - (1 - pHit - pBlock) * whiff;
  // A cast holds the fighter in place: struck first, it is broken.
  if (m.kind === 'technique' && S.foeBusy < m.startup) v -= punishCost(S, m.startup, dist) * 0.8;
  v -= 0.12 * m.total + (m.cooldown > 1.5 ? 0.1 * Math.min(m.cooldown, 6) : 0);
  v -= energyCost(S, m.energy);
  v -= delay * 0.8;
  // A movement attack also moves: one that passes through the opponent
  // carries it out of a corner, toward the middle.
  if (m.atk?.passThrough && S.grounded && S.ledge.inside < 240 && S.dist < 170 && Math.sign(S.center - S.x) === fit.face) {
    v += (1.2 + 3 * S.myDanger) * p.stage;
  }
  if (mem) v += variety(S, m, mem, pHit);
  // Habits: anti-air against jumpers, Shield pressure against turtles,
  // shots meeting shots against zoners.
  const model = S.model;
  if (model) {
    if (m.roles.has('antiAir') && !S.foeGrounded) v += 1.5 * Math.max(0, model.bias('jumpIns') + 0.3);
    if (m.roles.has('shieldPressure') || m.roles.has('unblockable')) v += 2 * Math.max(0, model.bias('shields'));
    if (m.roles.has('interceptProjectile')) v += 1.2 * Math.max(0, model.bias('projectiles'));
  }
  return v;
}

// A move just used weighs less for a few seconds (no spam); one left
// unused for a while weighs a little more, but only when it would really
// work (the whole kit in play).
function variety(S, m, mem, pHit) {
  const last = mem.lastUsed.get(m.key);
  const since = last === undefined ? 30 : S.clock - last;
  let v = 0;
  if (since < 2.5) v -= 1.4 * (1 - since / 2.5);
  if (pHit > 0.35) v += 1.2 * clamp((since - 4) / 14, 0, 1);
  return v;
}

// Where move `m` connects from, as a band of horizontal distances to the
// opponent's origin (same level): { lo, hi }.
export function bandFor(S, m) {
  if (m.kind === 'melee' || m.kind === 'deflect') {
    const r = reachOf(m.motion && m.motion !== 'hover' ? m.reach : m.atk.hitbox, S.fe);
    return { lo: Math.max(0, r.lo + 4), hi: Math.max(r.lo + 8, r.hi - 6) };
  }
  if (m.kind === 'technique' && m.burst) {
    const hb = m.burst.hitbox;
    return { lo: 0, hi: hb.x + hb.w + S.fe.hw - 30 };
  }
  if (m.proj) {
    const range = Math.min(m.range, m.proj.speed * 1.2);
    return { lo: 60, hi: Math.max(120, range * 0.75) };
  }
  return { lo: 0, hi: 600 };
}

// A jump (or, in the air, a fall or an air jump) that puts aerial `m` on
// the opponent: { kind, steer, delay, fit } for the first point of the arc
// it connects from, or null.
export function aerialPlan(S, m) {
  if (!m.air) return null;
  const kinds = S.grounded ? ['normal', 'high'] : [null, ...(S.airJumps > 0 && !S.freeFall ? ['air'] : [])];
  const steer = S.dir;
  for (const kind of kinds) {
    for (let k = 2; k <= 44; k += 2) {
      const delay = k * STEP;
      const a = arcAt(S, kind, steer, delay);
      if (S.grounded || kind === null) {
        const ground = S.stage.surfaceBelow(a.x - S.halfW, a.x + S.halfW, S.y - 1).y;
        if (a.y >= ground && a.vy > 0) break;
      }
      const from = { x: a.x, y: a.y, vx: a.vx, vy: a.vy, grounded: false };
      // Never jumping out over the Void without the means to come back.
      if (!S.stage.surfaceBelow(from.x - S.halfW, from.x + S.halfW, from.y).ref && S.goal !== 'edgeguard') continue;
      const fit = moveFit(S, m, { delay, from });
      if (fit) return { kind, steer, delay, fit };
    }
  }
  return null;
}

// Every plan worth considering now, each { value, plan }.
export function planCandidates(S, mem) {
  const out = [];
  // Held by a hit, or in the middle of its own move with nothing to cut it
  // short: ride it out (bending a launch toward the stage).
  if (!S.canAct && !S.canFollowUp) {
    out.push({ value: 0, plan: { kind: 'wait', value: 0 } });
    return out;
  }
  if (!S.foeIn) {
    respawnPlans(S, out);
    return out;
  }
  offence(S, mem, out);
  neutral(S, mem, out);
  if (!S.grounded) airborne(S, out);
  return out;
}

// In the air with nothing to strike yet: drift where it wants to be (in
// on the opponent, or away from it), and fast-fall to be on the ground and
// acting sooner when that is where it wants to be.
function airborne(S, out) {
  const a = S.aggression;
  const toward = a >= 0.45 || S.goal === 'pressure' || S.goal === 'finish';
  const spacing = (S.fk?.reachFront ?? 50) + 30;
  const x = toward ? S.fx - S.dir * 30 : S.fx - S.dir * (spacing + 80);
  const v = 0.6 + (toward ? a : 1 - a) * 0.5;
  out.push({ value: v, plan: { kind: 'drift', x, fall: S.foeGrounded || S.fy > S.y, until: S.clock + 0.4, value: v } });
}

function offence(S, mem, out) {
  const p = S.profile;
  const k = S.k;
  for (const m of k.moves) {
    if (!S.moveReady(m) && !(m.air && S.grounded)) continue;
    // Pressed now (or the instant the fighter is free).
    if (startable(S, m)) {
      const fit = moveFit(S, m);
      if (fit) {
        const v = strikeValue(S, m, fit, { mem });
        out.push({ value: v, plan: { kind: 'strike', move: m, value: v } });
        continue;
      }
    }
    if (!S.canAct && !S.cancellable) continue;
    // From a jump: aerials (the Deflect among them) off the ground, or
    // later in the air.
    if (m.air && (S.grounded ? S.canAct || S.cancellable : startable(S, m))) {
      if (m.kind === 'deflect' && (S.exhausted || S.energy < 30 * p.resources)) continue;
      if (!S.grounded && !S.moveReady(m)) continue;
      if ((S.self.combat.cooldowns.get(m.id) ?? 0) > 0.25) continue;
      const a = aerialPlan(S, m);
      if (a) {
        // A jump commits to its arc where the opponent sees it coming: an
        // anti-air meets it if the opponent is free to throw one.
        const antiAir = S.foeBusy < a.fit.t && S.fk?.moves.some((f) => f.roles.has('antiAir') && !f.air)
          ? foeHitWorth(S) * clamp((a.fit.t - 0.18) / 0.5, 0, 0.5) * (0.5 + 0.5 * S.profile.risk) : 0;
        const v = strikeValue(S, m, a.fit, { mem, delay: a.delay * 0.6 }) - (a.kind === 'high' ? 0.2 : 0) - (a.kind === 'air' ? 0.3 : 0) - antiAir;
        out.push({ value: v, plan: { kind: 'jumpStrike', move: m, jump: a.kind, steer: a.steer, pressIn: a.delay, value: v } });
      }
      continue;
    }
    // Into range on foot (or with a Dash), on the same level.
    if (!m.air && S.grounded && S.sameLevel && (m.kind !== 'summon')) {
      const band = bandFor(S, m);
      const d = S.dist;
      if (d >= band.lo && d <= band.hi) continue; // in range but no fit (height, timing): later
      const gap = d > band.hi ? d - band.hi : band.lo - d;
      const toward = d > band.hi ? S.dir : -S.dir;
      if (!S.groundAhead(toward, Math.min(gap, 200))) continue;
      const dash = k.dash && toward === S.dir && gap > 140 && S.movementReady(false) && !S.exhausted && p.mobility > 0.15
        && S.groundAhead(toward, k.dash.reach + 20);
      const tReach = dash ? gap / 1100 + 0.05 : gap / S.self.maxSpeed;
      const fit = { t: tReach + m.startup, face: S.dir };
      const est = strikeValue(S, m, fit, { mem, delay: tReach }) * Math.exp(-tReach * 1.1);
      // Walking into its reach while it is free costs a little.
      const exposed = S.foeBusy < tReach && d > band.hi && S.fk ? 0.25 * foeHitWorth(S) * clamp((S.fk.reachFront - band.hi + 40) / 80, 0, 1) : 0;
      const v = est - exposed - (dash ? energyCost(S, k.dash.cost) * 0.8 : 0);
      out.push({ value: v, plan: { kind: 'engage', move: m, band, dash: !!dash, until: S.clock + Math.min(1.4, tReach + 0.5), value: v } });
    }
  }
}

function neutral(S, mem, out) {
  const p = S.profile;
  const a = S.aggression;
  const model = S.model;
  const fk = S.fk;
  const foeReach = fk ? fk.reachFront + S.me.hw : 60;
  const dist = S.dist;
  const toCenter = Math.sign(S.center - S.x) || 1;
  // Hold a spacing just outside its reach: let it come, punish a whiff.
  if (S.grounded && S.sameLevel) {
    const spacing = foeReach + 18 + S.rangeError * 0.5;
    let v = (1 - a) * 1.6 + 0.6 * p.punish * Math.max(0, model.bias('unsafe') + 0.2) + S.myDanger * 2.2 - 0.6;
    if (S.goal === 'survive' || S.goal === 'protectLead') v += 1;
    if (Math.abs(dist - spacing) < 30) v -= 0.4; // already there: something else
    out.push({ value: v, plan: { kind: 'space', dist: spacing, until: S.clock + 0.45 + 0.5 * S.rng(), value: v } });
    // Advance: nothing in range yet, but pressure gets there.
    if (dist > foeReach + 20) {
      const av = a * 1.4 - 0.2 + (S.goal === 'pressure' || S.goal === 'forceAction' ? 0.6 : 0) - S.myDanger * 1.2;
      out.push({ value: av, plan: { kind: 'advance', until: S.clock + 0.5, value: av } });
    }
    // Bait: step to the edge of its reach and back out (a skilled player's
    // whiff-punish setup).
    if (p.punish > 0.5 && dist < foeReach + 120 && dist > foeReach - 10) {
      const bv = (p.punish - 0.5) * 2 + Math.max(0, model.bias('unsafe')) * 2 + Math.max(0, model.bias('approaches')) - 0.3;
      out.push({ value: bv, plan: { kind: 'bait', phase: 'in', depth: foeReach - 6, out: foeReach + 40, until: S.clock + 0.9, value: bv } });
    }
  }
  // Back to the middle: a ledge behind it (hits send it toward it), or
  // any ledge close with a high Launch Point.
  const edge = S.ledge.inside;
  const behind = Math.sign(S.center - S.x) === S.dir || dist > 400;
  if (S.grounded && edge < 180 && (behind || S.myDanger > 0.25)) {
    const v = p.stage * (1.6 - edge / 150) * (1 + 2 * S.myDanger) + (S.goal === 'escape' ? 1.5 : 0);
    // With the opponent between it and the middle: over it with a jump.
    const over = toCenter === S.dir && dist < 140;
    out.push({
      value: v,
      plan: over ? { kind: 'evade', how: 'jump', jump: 'high', dir: toCenter, value: v } : { kind: 'move', x: S.center + toCenter * -40, until: S.clock + 0.6, value: v },
    });
  }
  // Let its own Launch Point recover: well away, safely, while it can.
  if (S.lp > 18 && dist > 220 && S.foeBusy <= 0) {
    const v = (S.lp / 50) * (1 - a) * (0.5 + p.risk) + S.myDanger * 1.5 - 0.5;
    const away = -S.dir;
    if (S.groundAhead(away, 120)) out.push({ value: v, plan: { kind: 'retreat', dir: away, until: S.clock + 0.5, value: v } });
  }
  // Another level: up or down to it.
  if (!S.sameLevel && S.grounded) {
    const goal = goalSurface(S.stage, S.fx, S.foeLevel, S.halfW);
    const path = route(S.stage, S.surface, goal, S.halfW);
    if (path && path.length) {
      const v = 1.6 + a + (S.goal === 'pressure' ? 0.4 : 0);
      out.push({ value: v, plan: { kind: 'navigate', nav: { path, i: 0, phase: null }, until: S.clock + 2.5, value: v } });
    }
  }
  // Edge-guard: hold the ledge it must come back to.
  if (S.foeOffStage && S.grounded) {
    const side = S.foeLedge.side;
    const x = side < 0 ? S.floor.x + 40 + 50 * (1 - p.stage) : S.floor.x + S.floor.w - 40 - 50 * (1 - p.stage);
    const v = 2 + 3 * S.foeDanger + 1.5 * p.stage;
    out.push({ value: v, plan: { kind: 'edgeguard', x, until: S.clock + 1.2, value: v } });
  }
  // Under an airborne opponent: where it comes down.
  if (!S.foeGrounded && S.grounded && !S.foeOffStage) {
    const land = foeAt(S, Math.min(0.6, S.horizon + 0.2));
    const v = 0.8 + a * 0.8 + p.punish * 0.6;
    out.push({ value: v, plan: { kind: 'move', x: land.x - S.dir * 30, until: S.clock + 0.35, value: v } });
  }
}

// The opponent is out of play, waiting to respawn: take the middle of the
// stage, facing where it comes back, and keep moving (never frozen, never
// attacking nobody).
function respawnPlans(S, out) {
  const spawn = S.foe?.spawn?.x ?? S.center;
  const x = S.center + (spawn - S.center) * 0.3;
  if (S.grounded) out.push({ value: 2, plan: { kind: 'reposition', x, until: S.clock + 0.8, value: 2 } });
  else out.push({ value: 1, plan: { kind: 'move', x, until: S.clock + 0.3, value: 1 } });
}
