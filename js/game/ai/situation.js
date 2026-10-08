// CPU Intelligence: situation analysis, the battle state as it stands.
//
// Purpose: one picture per step of everything a decision needs: the CPU's
// own body, state and resources (exact: its own), the opponent as its
// perception shows it (perception.js), their spacing and levels, both
// Launch Points, the stage (ledges, the Void in force, platforms), the
// projectiles and clones it has taken in, the opponent's openings (how
// long until it can act again, a whiff, a stun, a paralysis, an exhausted
// bar), the score and the clock (overtime and the Launch Point tiebreak
// included). Helpers on it answer the questions every module asks: is
// there ground ahead, may a move start now, may a Dash.
//
// Inputs: the controller, both fighters, the step context, the perceived
// opponent. Outputs: buildSituation.
// Important constraints: read-only. Built fresh each step; the opponent's
// forecasts are cached on it for that step only.

import { knowFighter } from './knowledge.js';
import { foeFlightOf } from './targeting.js';
import { offStage, ledgeInfo, surfaceUnder } from './navigation.js';

export function buildSituation(c, self, foe, ctx, fv) {
  const b = self.body;
  const stage = ctx.stage;
  const world = ctx.battle ?? null;
  const profile = c.profile;
  const combat = self.combat;
  const k = knowFighter(self);
  const fk = foe ? knowFighter(foe) : null;
  const atk = combat.attack;
  const S = {
    c, clock: c.clock, profile, rng: c.rng, self, foe, stage, world, k, fk,
    me: k.hurt, fe: fk?.hurt ?? k.hurt, g: ctx.gravity ?? 2500,
    x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded, facing: self.facing, halfW: b.halfW, height: b.height,
    canAct: self.canAct(), canFollowUp: self.canFollowUp(), cancellable: combat.cancellable,
    attack: atk, attackPhase: combat.phase, technique: self.technique, dashing: !!self.dash, summoning: !!self.pendingSummon,
    stun: combat.stun, hitstop: combat.hitstop, paralyzed: combat.immobilized, shielding: combat.shielding,
    energy: combat.energy, exhausted: combat.energyExhausted, maxEnergy: combat.maxEnergy,
    airJumps: self.airJumps, airDashes: self.airDashes, freeFall: self.freeFall, launched: !!self.launch,
    lp: combat.launchPoint, lpRecoverIn: combat.launchRecoveryRemaining,
    horizon: profile.horizon, rangeError: c.spacingError,
    floor: stage.floor, top: stage.groundY, center: stage.centerX, void: stage.void,
    foeCache: [], foeFlight: null,
  };
  S.offStage = !b.grounded && offStage(stage, b.x, b.halfW, b.y);
  S.surface = b.grounded ? surfaceUnder(stage, b.x, b.halfW, b.y + 1) : null;
  S.ledge = ledgeInfo(stage, b.x);
  // Readiness, as the fighter's own rules decide it.
  S.movementReady = (air) => self.movementReady(air);
  S.moveReady = (m) => moveReady(self, m, combat);
  S.groundAhead = (dir, ahead, from = S) => {
    const x = from.x + dir * (S.halfW + ahead);
    return !!stage.surfaceBelow(x - S.halfW, x + S.halfW, from.y).ref;
  };

  // ---- The opponent, as perceived ---------------------------------------------
  S.fv = fv;
  S.foeIn = !!(foe && fv && !foe.lostToVoid);
  if (S.foeIn) {
    S.fx = fv.x;
    S.fy = fv.y;
    S.fvx = fv.vx;
    S.fvy = fv.vy;
    S.foeGrounded = fv.grounded;
    S.dx = fv.x - b.x;
    S.dir = Math.sign(S.dx) || self.facing;
    S.dist = Math.abs(S.dx);
    S.dy = fv.y - b.y;
    S.foeLP = fv.lp;
    S.foeShielding = fv.shielding;
    S.foeEnergy = fv.energy;
    S.foeExhausted = fv.exhausted;
    S.foeOffStage = !fv.grounded && offStage(stage, fv.x, fv.halfW, fv.y);
    S.foeLedge = ledgeInfo(stage, fv.x);
    S.foeSurface = fv.grounded ? surfaceUnder(stage, fv.x, fv.halfW, fv.y + 1) : null;
    S.foeLevel = fv.grounded ? fv.y : fv.lastGroundY;
    S.sameLevel = Math.abs(S.foeLevel - b.y) < 40 || (!fv.grounded && fv.y > b.y - 140 && fv.y < b.y + 40);
    // Seconds until it can act again, from what its animation shows.
    let busy = Math.max(fv.stun + fv.hitstop, fv.shieldStun, fv.paralysis, fv.dashLeft, fv.summonLeft);
    const def = fv.atkDef;
    if (def) busy = Math.max(busy, def.total - fv.atkTime);
    if (fv.techDef) busy = Math.max(busy, fv.techEndIn);
    S.foeBusy = busy;
    S.foePhase = def ? (fv.atkTime < def.startup ? 'startup' : fv.atkTime < def.startup + def.active ? 'active' : 'recovery') : null;
    S.foeWhiffing = !!def && S.foePhase === 'recovery' && !fv.atkHasHit;
    S.foeHeld = fv.stun > 0 || fv.paralysis > 0;
    S.foeFlight = foeFlightOf(S);
  } else {
    S.dx = 0;
    S.dir = self.facing;
    S.dist = Infinity;
    S.dy = 0;
    S.foeLP = 0;
    S.foeBusy = Infinity;
    S.sameLevel = true;
  }

  // ---- The match ----------------------------------------------------------------
  const score = world?.score;
  S.lead = score && foe ? (score[self.slot] ?? 0) - (score[foe.slot] ?? 0) : 0;
  S.timeLeft = Number.isFinite(world?.timeLeft) ? world.timeLeft : Infinity;
  S.overtime = world?.period === 'overtime' || world?.overtime === true;
  S.late = S.timeLeft < 30;
  // Level on points late on (or in overtime) the lower Launch Point wins.
  S.tiebreak = S.lead === 0 && (S.overtime || S.late) ? Math.sign((S.foeLP ?? 0) - S.lp) : 0;
  return S;
}

// Whether move `m` may start now as far as cooldowns, airtime and Energy
// go (the fighter's own rules: see Fighter.tryAction, tryDeflect,
// trySpecial). Being free to act is the caller's to check.
export function moveReady(self, m, combat = self.combat) {
  const air = !self.body.grounded;
  if (!!m.air !== air) return false;
  if (m.ability) return !combat.abilityCooldowns.active(m.id);
  if (combat.cooldowns.has(m.id)) return false;
  if (air && self.airStartBlocked(m.atk)) return false;
  if (m.kind === 'deflect' && combat.energyExhausted) return false;
  return true;
}
