// CPU Intelligence: valuation, what a hit, a risk and a resource are worth.
//
// Purpose: one scale for every decision, in Launch Point-like units: the
// damage a hit adds, its launch from the Launch Point it leaves (Launch
// Strength = Base Launch x the target's new Launch Point, sent along its
// Directional Launch, its flight simulated against the actual stage and
// the Void in force: koEstimate), a paralysis as the free hit it opens,
// combo potential; the cost of being punished (the opponent's best answer
// at the CPU's own Launch Point); the danger each side is in; and Energy
// (what spending it now leaves for later).
//
// Inputs: the situation, move descriptors.
// Outputs: KO_VALUE, hitWorth, launchFor, dangerTo, punishCost,
// energyCost.
// Important constraints: the launch formula is the game's own
// (js/data/launch.js); nothing here changes it.

import { resolveDirectionalLaunch, resolveLaunchStrength } from '../../data/launch.js';
import { resolveLaunchStun } from '../combat/combat.js';
import { koEstimate } from './forecast.js';
import { clamp } from '../../core/utils.js';

// What a point is worth against Launch Point: a fall into the Void.
export const KO_VALUE = 50;

// The launch hit `hit` gives a target whose Launch Point is `lp` before
// it, traveling `face`: the new Launch Point, the strength, the
// world-space velocity and the stun it deals (its own plus the launch's).
export function launchFor(hit, lp, face, reaction) {
  const after = lp + hit.damage;
  const strength = resolveLaunchStrength(hit.baseLaunch, after);
  const vec = resolveDirectionalLaunch(hit.direction, strength, face);
  const speed = Math.hypot(vec.x, vec.y);
  return { after, strength, vec, speed, stun: hit.finisherStun + resolveLaunchStun(speed, reaction) };
}

// What a point is worth to this side now: more when it wins the match or
// comes back from behind.
function koWeight(S, forMe) {
  const lead = forMe ? S.lead : -S.lead;
  let w = 1;
  const pts = S.world?.pointsToWin ?? 3;
  const mine = S.world?.score && S.self ? (forMe ? S.world.score[S.self.slot] : S.world.score[S.foe?.slot]) : 0;
  if (mine === pts - 1) w += 0.4;
  if (lead < 0) w += 0.15;
  return w;
}

// What landing move `m`'s whole hit on the opponent is worth to the CPU:
// its damage, its launch (a likely fall into the Void above all, sent off
// the stage short of that), a paralysis's free follow-up and what the hit
// opens for its follow-ups. `at` is where the opponent is when it lands
// ({ x, y, grounded }), `face` the way it travels.
export function hitWorth(S, m, { at = S.fv, face = S.dir, lp = S.foeLP } = {}) {
  const hit = m.hit;
  let v = hit.damage;
  if (hit.baseLaunch > 0 && hit.direction) {
    const l = launchFor(hit, lp, face, S.foe?.launchReaction);
    const st = { x: at.x, y: at.y, halfW: S.fv?.halfW ?? 16, height: S.fv?.height ?? 100, grounded: !!at.grounded };
    // A target with its air jumps and air dash used up recovers worse.
    const fv = S.fv;
    const budget = fv ? clamp(0.55 + 0.2 * Math.min(fv.airJumps, 2) / 2 + 0.25 * (fv.airDashes > 0 ? 1 : 0), 0.5, 1) : 1;
    const ko = koEstimate(S.stage, st, l.vec, l.stun, { budget: at.grounded ? 1 : budget });
    v += ko.p * KO_VALUE * koWeight(S, true) + ko.offstage * 5;
    // A vertical pop opens juggles; a horizontal one gives space.
    if (hit.direction === 'vertical' && ko.p < 0.5) v += Math.min(4, l.speed / 400) * S.profile.combo;
  }
  if (hit.paralyze > 0) v += 5 + hit.paralyze * 5;
  if (m.roles?.has('comboStarter')) v += 2.5 * S.profile.combo * Math.min(1, S.profile.planDepth / 2);
  if (m.roles?.has('comboExtender') && hit.baseLaunch < 2) v += 1.5 * S.profile.combo;
  return v;
}

// How much danger fighter `who` (the CPU: 'self'; its opponent: 'foe') is
// in right now: the chance the other side's best launching move, landing
// as things stand, would cost it a point (0-1), from the Launch Point it
// has and where it stands.
export function dangerTo(S, who) {
  const attackerK = who === 'self' ? S.fk : S.k;
  const target = who === 'self'
    ? { x: S.x, y: S.y, halfW: S.halfW, height: S.height, grounded: S.grounded, lp: S.lp, reaction: S.self.launchReaction }
    : { x: S.fx, y: S.fy, halfW: S.fv.halfW, height: S.fv.height, grounded: S.foeGrounded, lp: S.foeLP, reaction: S.foe.launchReaction };
  if (!attackerK) return 0;
  let worst = 0;
  const away = who === 'self' ? (Math.sign(S.x - (S.fx ?? S.center)) || 1) : (Math.sign(S.fx - S.x) || 1);
  for (const m of attackerK.moves) {
    const hit = m.hit;
    if (!(hit.baseLaunch > 0) || !hit.direction) continue;
    const l = launchFor(hit, target.lp, away, target.reaction);
    if (l.speed < 500) continue;
    const ko = koEstimate(S.stage, target, l.vec, l.stun);
    if (ko.p > worst) worst = ko.p;
    if (worst >= 0.95) break;
  }
  return worst;
}

// The opponent's best answer to the CPU if it hits: its strongest move's
// worth against the CPU at its Launch Point (a fast one weighs more: it
// lands more often). Cached on the situation.
export function foeHitWorth(S) {
  if (S._foeHitWorth !== undefined) return S._foeHitWorth;
  let best = 3;
  if (S.fk) {
    const target = { x: S.x, y: S.y, halfW: S.halfW, height: S.height, grounded: S.grounded };
    const away = Math.sign(S.x - (S.fx ?? S.center)) || 1;
    for (const m of S.fk.moves) {
      if (m.kind !== 'melee' || m.air) continue;
      let v = m.hit.damage;
      if (m.hit.baseLaunch > 0 && m.hit.direction) {
        const l = launchFor(m.hit, S.lp, away, S.self.launchReaction);
        v += koEstimate(S.stage, target, l.vec, l.stun).p * KO_VALUE;
      }
      v *= m.startup <= 0.12 ? 1 : 0.8;
      if (v > best) best = v;
    }
  }
  S._foeHitWorth = best;
  return best;
}

// The expected cost of being left exposed for `exposure` seconds at
// `dist` from the opponent: the chance it can and does punish in time
// (its quickest strike's startup plus the run in, against the window),
// times what its answer is worth.
export function punishCost(S, exposure, dist = S.dist) {
  if (!S.fk || !(exposure > 0)) return 0;
  const reach = S.fk.reachFront || 40;
  const run = Math.max(0, dist - reach) / 900;
  const need = (Number.isFinite(S.fk.fastest) ? S.fk.fastest : 0.15) + run + 0.12;
  const window = exposure - need;
  if (window <= 0) return 0;
  const p = clamp(window / 0.25, 0, 1) * (0.55 + 0.35 * (S.model?.punishes ?? 0.5));
  return p * foeHitWorth(S);
}

// What spending `cost` Energy now costs in options later: a little while
// the bar is full, much more as it nears empty (an empty bar exhausts the
// fighter: no Shield, Dash, air dash or Deflect until it refills), and
// more again for a careful level or a CPU in danger.
export function energyCost(S, cost) {
  if (!(cost > 0)) return 0;
  const left = S.energy - cost;
  const care = 0.4 + S.profile.resources;
  let v = (cost / 25) * 0.6 * care;
  if (left <= 0) v += 6 * care;
  else if (left < 30) v += ((30 - left) / 30) * 2.5 * care;
  return v * (1 + (S.myDanger ?? 0));
}
