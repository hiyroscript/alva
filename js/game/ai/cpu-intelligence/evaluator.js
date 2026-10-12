// CPU Intelligence, layer 6: tactical action evaluation (and the search
// over short sequences: a Dash into a strike, a jump into an aerial, a
// strike timed for a landing).
//
// Purpose: every attack, projectile, technique, summon and Deflect the
// fighter could start (now, out of a Dash, or at the right moment of a
// jump) is simulated by the game's rules (prediction.js) against where the
// opponent is predicted to be, and judged by its expected utility:
//
//   utility = P(hit) x what the hit is worth (damage, launch, a fall, a
//             paralysis, the combo it opens)
//           + P(blocked) x what a block costs (the Shield's stall, the
//             recovery left, the punish it invites) and gains (the
//             opponent's Energy)
//           + P(miss) x what a whiff costs (the punish window it leaves)
//           - resources (Energy, a long cooldown), commitment, and the
//             risk of not getting back to the stage afterwards
//           + strategy (the roles the current mode favours)
//
// P(hit) comes from the move's real geometry and timing: whether a strike
// meets the opponent's predicted path at all, how much room it has (how
// far the opponent would have to move to escape), whether the opponent is
// still busy when it lands or free to react, jump or Shield it (an
// unblockable hit ignores the Shield), and how predictable the move has
// become. A short-range move far from its target is not rejected: the
// Dash and jump sequences bring it into range, and the neutral layer walks
// there. Nothing is ranked by button or by fighter.
//
// Inputs: the situation (situation.js), the CPU's capabilities and
// profile, the strategy's parameters, the opponent model.
// Outputs: Evaluator (candidates, outcome, followUps).
// Important constraints: bounded work per reassessment (the arcs and Dash
// lengths it tries are capped by the level's plan depth); read-only.

import { moveReady } from './capabilities.js';
import {
  STEP, Track, moveContact, projectileContact, arcTrack, recoverySim, boxAt, bodyFrom,
} from './prediction.js';
import { LaunchJudge, KO_VALUE, riseOf } from './values.js';
import { stepBody } from '../../physics.js';
import { BASE_FIGHTER_MOVEMENT as MV } from '../../../data/movement.js';

// How quickly a sharp opponent reacts to a move it sees coming (seconds):
// what the CPU assumes, since it cannot know.
const FOE_REACT = 0.2;
// How often an opponent that could get out of the way does: nobody escapes
// everything.
const ALERT = 0.8;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const scratchBox = {};

export class Evaluator {
  constructor(brain) {
    this.brain = brain;
    this.judge = new LaunchJudge();
    this.selfTrack = new Track(160);
    this.arc = new Track(120);
    this.c = {};
    this.shot = {};
    this.hv = {};
    this.rec = {};
    this.dashBody = {};
    this.list = [];
  }

  // A fresh reassessment: forget cached launches, and work out what the
  // opponent's quickest punish on the CPU would be worth from here.
  begin(s) {
    this.judge.reset();
    this.s = s;
    if (!s.present) return;
    let fast = Infinity;
    let best = 3;
    const myPos = { x: s.me.x, y: s.me.y, grounded: s.me.grounded, halfW: s.me.halfW, height: s.me.height };
    const face = Math.sign(s.me.x - s.op.x) || 1;
    for (const m of s.foeCaps.moves) {
      if (m.kind !== 'melee' || m.air) continue;
      fast = Math.min(fast, m.lead);
      if (m.lead > 0.3) continue;
      const v = this.judge.strikes(s, 'me', m.strikes, m.strikes.length, myPos, face, this.hv).value;
      best = Math.max(best, v * (1 / (1 + m.lead * 2)));
    }
    this.foeFast = Number.isFinite(fast) ? fast : 0.15;
    this.foePunish = best;
  }

  // ---- Candidates ---------------------------------------------------------------

  // Every option worth weighing from here, scored (see the header): moves
  // started now, out of a Dash, or out of a jump. `combo` marks a follow-up
  // search (the opponent's path is the launch the CPU just dealt).
  // `wait` (seconds, for a follow-up) is how long before the CPU can
  // start anything: every option starts that much later.
  candidates(s, out = [], { combo = false, wait = 0 } = {}) {
    out.length = 0;
    const self = s.self;
    const k0 = Math.round(wait / STEP);
    for (const m of s.caps.moves) {
      if (combo ? !this.readySoon(self, m, wait) : !moveReady(self, m)) continue;
      const c = this.now(s, m, combo, k0);
      if (c) out.push(c);
    }
    if (s.me.grounded && (self.canFollowUp() || combo) && !s.me.shielding) this.dashStrikes(s, out, combo, k0);
    this.jumpStrikes(s, out, combo, k0);
    return out;
  }

  // Whether move `m` can start `wait` seconds from now, as an attack that
  // hit is cut short (a follow-up): its cooldown over by then, the right
  // footing, its airtime starts left. A summon or technique never cuts an
  // attack short, so only when the fighter is already free.
  readySoon(self, m, wait) {
    const grounded = self.body.grounded;
    if (m.kind === 'technique' || m.kind === 'summon') return moveReady(self, m);
    if (m.air === grounded) return false;
    if ((self.combat.cooldowns.get(m.id) ?? 0) > wait + 0.01) return false;
    if (self.airStartBlocked(m.def) || self.combat.attack?.def.id === m.id) return false;
    if (m.kind === 'deflect') return !self.combat.energyExhausted;
    return true;
  }

  // Move `m` started `k0` steps from now, from where the CPU is.
  now(s, m, combo, k0 = 0) {
    const me = s.me;
    const face = Math.sign(s.op.x - me.x) || me.facing;
    let c;
    if (m.kind === 'melee' || m.kind === 'deflect') c = this.melee(s, m, me, face, k0);
    else if (m.kind === 'ranged') c = this.ranged(s, m, me, face, k0);
    else if (k0 > 0) return null;
    else if (m.kind === 'technique') c = this.technique(s, m, face);
    else c = this.summon(s, m);
    if (!c) return null;
    c.kind = 'strike';
    c.combo = combo;
    return this.outcome(s, m, c);
  }

  // A melee move (or the Deflect) from state `st`, starting `k0` steps from now.
  melee(s, m, st, face, k0) {
    const c = moveContact(s.stage, s.gravity, m, st, face, s.foeTrack, s.foeCaps.hurt, this.selfTrack, this.c, k0);
    if (c.contact < 0) return null;
    const t = this.selfTrack;
    const e = t.len - 1;
    return {
      move: m, k0, contactK: c.contact + k0, margin: c.margin, marginUp: c.marginUp, strikes: c.strikes, face: c.face,
      endX: t.x[e], endY: t.y[e], endGrounded: !!t.g[e], endK: k0 + t.len,
    };
  }

  // A thrown projectile from state `st`, released `k0` steps from now plus its own spawn time.
  ranged(s, m, st, face, k0) {
    const shot = m.projectile;
    // Where the thrower is as it lets go (its momentum share carries it).
    moveContact(s.stage, s.gravity, m, st, face, s.foeTrack, s.foeCaps.hurt, this.selfTrack, this.c, k0);
    const t = this.selfTrack;
    const ks = t.i(Math.round(shot.spawnAt / STEP));
    const x0 = t.x[ks] + face * shot.offset.x;
    const y0 = t.y[ks] + shot.offset.y;
    const r = projectileContact(s.stage, shot, x0, y0, face, k0 * STEP + shot.spawnAt, s.foeTrack, s.foeCaps.hurt, this.shot);
    if (r.contact < 0) return null;
    const flight = (r.contact - k0) * STEP - shot.spawnAt;
    return {
      move: m, k0, contactK: r.contact, margin: Math.max(0, shot.range - Math.abs(s.dx)) + 20, marginUp: r.margin,
      strikes: r.strikes, face, projectile: true, flight,
      endX: t.x[t.len - 1], endY: t.y[t.len - 1], endGrounded: !!t.g[t.len - 1], endK: k0 + t.len,
    };
  }

  // A technique: its burst round the fighter at its release, and its
  // projectile from there. The fighter stands still throughout.
  technique(s, m, face) {
    const me = s.me;
    const k = Math.round(m.lead / STEP);
    const hurt = s.foeCaps.hurt;
    if (m.burst) {
      boxAt(m.burst.box, me.x, me.y, face, scratchBox);
      const fk = s.foeTrack.i(k);
      const fx = s.foeTrack.x[fk];
      const fy = s.foeTrack.y[fk];
      const inX = Math.min(fx + hurt.hw - scratchBox.x, scratchBox.x + scratchBox.w - (fx - hurt.hw));
      const inY = Math.min(fy + hurt.bottom - scratchBox.y, scratchBox.y + scratchBox.h - (fy + hurt.top));
      if (inX > 0 && inY > 0) {
        // Toward the nearer side of the box is the way out.
        const out = Math.min(fx - scratchBox.x, scratchBox.x + scratchBox.w - fx) + hurt.hw;
        return {
          move: m, k0: 0, contactK: k, margin: out, marginUp: inY + 120, strikes: 1, face, burst: true,
          endX: me.x, endY: me.y, endGrounded: true, endK: Math.round(m.commitment / STEP),
        };
      }
    }
    if (m.projectile) {
      const shot = m.projectile;
      const x0 = me.x + face * shot.offset.x;
      const y0 = me.y + shot.offset.y;
      const r = projectileContact(s.stage, shot, x0, y0, face, shot.spawnAt, s.foeTrack, hurt, this.shot);
      if (r.contact < 0) return null;
      return {
        move: m, k0: 0, contactK: r.contact, margin: 30, marginUp: r.margin, strikes: r.strikes, face, projectile: true,
        flight: r.contact * STEP - shot.spawnAt, endX: me.x, endY: me.y, endGrounded: true, endK: Math.round(m.commitment / STEP),
      };
    }
    return null;
  }

  // A summon: its clone appears behind the opponent as its startup ends,
  // then strikes from there after its cloud. It lands if the opponent
  // stays roughly where it was (still, Shielding, busy, or walking into it).
  summon(s, m) {
    const sm = m.summon;
    const atk = sm.attack;
    const k1 = Math.round(m.startup / STEP);
    const fk1 = s.foeTrack.i(k1);
    const facing = s.op.facing;
    const cx = s.foeTrack.x[fk1] - facing * sm.behind;
    const cy = s.foeTrack.y[fk1];
    const kHit = Math.round(m.lead / STEP);
    const fk = s.foeTrack.i(kHit);
    boxAt(atk.hitbox, cx, cy, facing, scratchBox);
    const hurt = s.foeCaps.hurt;
    const fx = s.foeTrack.x[fk];
    const fy = s.foeTrack.y[fk];
    const overlapX = Math.min(fx + hurt.hw - scratchBox.x, scratchBox.x + scratchBox.w - (fx - hurt.hw));
    const overlapY = Math.min(fy + hurt.bottom - scratchBox.y, scratchBox.y + scratchBox.h - (fy + hurt.top));
    if (overlapX <= 0 || overlapY <= 0) return null;
    return {
      move: m, k0: 0, contactK: kHit, margin: overlapX, marginUp: overlapY, strikes: m.strikes.length, face: facing, detached: true,
      endX: s.me.x, endY: s.me.y, endGrounded: true, endK: k1,
    };
  }

  // Dashing in and striking out of the Dash (cut short past its cancel
  // time): each ground melee move, from a few Dash lengths. Only toward the
  // opponent, with the Energy for it, and with ground all along.
  dashStrikes(s, out, combo, k0 = 0) {
    const self = s.self;
    const dash = s.caps.movement.dash;
    const me = s.me;
    if (!dash || !self.movementReady(false) || me.exhausted) return;
    const cost = self.combat.attack ? dash.cancelCost : dash.cost;
    const dir = s.dir;
    if (!s.model.supported(me.x + dir * (dash.distance + me.halfW + 10), me.halfW, me.y)) return;
    const p = this.brain.profile;
    const lengths = p.planDepth >= 3 ? [3, 5, 7, 9] : p.planDepth >= 2 ? [4, 7, 9] : [6, 9];
    const b = this.dashBody;
    for (const n of lengths) {
      bodyFrom(me, b);
      const speed = Math.max(MV.dashSpeed, b.vx * dir);
      for (let k = 0; k < n; k++) {
        b.vx = dir * speed;
        stepBody(b, STEP, s.stage, s.gravity, b.maxFall);
      }
      if (!b.grounded) continue;
      // The gap closed must be worth it: no Dash for what a strike already reaches.
      for (const m of s.caps.ground) {
        if (m.kind !== 'melee' || (combo ? !this.readySoon(self, m, k0 * STEP) : !moveReady(self, m))) continue;
        const c = this.melee(s, m, b, dir, n + k0);
        if (!c) continue;
        c.kind = 'dashStrike';
        c.dashDir = dir;
        c.pressK = n;
        c.waitK = k0;
        c.combo = combo;
        c.energy = cost;
        const scored = this.outcome(s, m, c);
        if (scored) out.push(scored);
      }
    }
  }

  // Jumping (or air jumping) into an aerial: each arc the level weighs
  // (toward the opponent, onto it, straight up; the normal and the higher
  // jump), each aerial at the first step of the arc where it would connect.
  // Also the aerials still to come in the jump the CPU is already in.
  jumpStrikes(s, out, combo, k0 = 0) {
    const self = s.self;
    const me = s.me;
    const p = this.brain.profile;
    const kinds = [];
    const free = me.canAct || self.canFollowUp() || (combo && self.combat.attack?.confirmed);
    if (me.grounded && free && !me.shielding) {
      kinds.push('ground');
      if (p.planDepth >= 2) kinds.push('high');
    } else if (!me.grounded) {
      kinds.push(null);
      if (me.airJumps > 0 && !me.freeFall && free) kinds.push('air');
    }
    if (!kinds.length) return;
    const fk = s.foeTrack.i(18);
    const fx = s.foeTrack.x[fk];
    const targets = [fx - s.dir * 40, fx];
    if (p.planDepth >= 3) targets.push(fx - s.dir * 90);
    if (p.planDepth >= 2) targets.push(me.x);
    const delays = combo ? [k0] : me.grounded && !s.op.grounded && p.planDepth >= 3 ? [0, 6, 12] : [0];
    const aerials = s.caps.aerial.filter((m) => m.kind !== 'ranged' && !(m.kind === 'deflect' && me.exhausted));
    if (!aerials.length) return;
    const hurt = s.foeCaps.hurt;
    for (const delay of delays) {
      for (const jump of kinds) {
        for (const toX of targets) {
          arcTrack(this.arc, s.stage, s.gravity, me, { jump, toX, steps: 80 });
          const arc = this.arc;
          for (const m of aerials) {
            if (!this.readyInAir(self, m, me.grounded)) continue;
            const lead = Math.round(m.lead / STEP);
            // Not before its cooldown is over.
            const from = Math.max(jump ? 2 : 1, Math.ceil((self.combat.cooldowns.get(m.id) ?? 0) / STEP) - delay + 1);
            for (let j = from; j < arc.len; j += 2) {
              const a = arc.i(j - 1);
              if (arc.g[a]) break;
              // Cheap check first: is the opponent anywhere near this
              // move's reach when it comes out?
              const f = s.foeTrack.i(j + delay + lead);
              const ddx = Math.abs(s.foeTrack.x[f] - arc.x[a]);
              const reach = m.reach ? Math.max(Math.abs(m.reach.x), Math.abs(m.reach.x + m.reach.w)) : 60;
              if (ddx > reach + hurt.hw + 60) continue;
              const ddy = s.foeTrack.y[f] - arc.y[a];
              if (ddy < (m.reach?.y ?? -100) - 140 || ddy > (m.reach ? m.reach.y + m.reach.h : 40) + 160) continue;
              const st = { x: arc.x[a], y: arc.y[a], vx: arc.vx[a], vy: arc.vy[a], grounded: false, halfW: me.halfW, height: me.height };
              const face = Math.sign(s.foeTrack.x[f] - st.x) || me.facing;
              const c = this.melee(s, m, st, face, j + delay);
              if (!c) continue;
              c.kind = 'jumpStrike';
              c.jump = jump;
              c.toX = toX;
              c.delayK = delay;
              c.pressK = j + delay;
              c.combo = combo;
              const scored = this.outcome(s, m, c);
              if (scored) out.push(scored);
              break;
            }
          }
          if (jump === null) break;
        }
      }
    }
  }

  // Whether aerial `m` could start later in this airtime: its cooldown
  // aside (it may run out by then), not in free fall, its starts for the
  // airtime not used up (all of them back once it has landed).
  readyInAir(self, m, fromGround) {
    if (m.kind === 'deflect' && self.combat.energyExhausted) return false;
    if (fromGround) return true;
    if (self.freeFall) return false;
    return !(m.airUses > 0 && (self.airAttacks.get(m.id) ?? 0) >= m.airUses);
  }

  // ---- Judgement ------------------------------------------------------------------

  // Scores candidate `c` (a move `m` and where it meets the opponent) by
  // its expected utility (see the header). Fills c.p, c.value, c.utility,
  // c.reason; null for an option not worth listing at all.
  outcome(s, m, c) {
    const brain = this.brain;
    const p = brain.profile;
    const model = brain.opponent;
    const params = brain.strategy.params;
    const op = s.op;
    const tC = (c.contactK + 1) * STEP;
    const fk = s.foeTrack.i(c.contactK);
    const fpos = {
      x: s.foeTrack.x[fk], y: s.foeTrack.y[fk], grounded: !!s.foeTrack.g[fk], halfW: op.halfW, height: op.height,
    };
    // How likely it meets the opponent: the room it has against how far the
    // opponent could move once it sees it coming (and free to).
    const busy = c.combo ? Math.max(op.busy, brain.combo?.stunLeft ?? 0) : op.busy;
    const esc = Math.max(0, tC - Math.max(busy, FOE_REACT));
    let pg = 0.96;
    if (esc > 0) {
      const run = esc * MV.maxSpeed * (fpos.grounded ? 1 : 0.6);
      const fit = c.margin >= run ? 1 : clamp((c.margin + 4) / (run + 4), 0, 1) ** 0.8;
      let jumpOut = 1;
      if (fpos.grounded && !c.burst) {
        const rise = MV.jumpVelocity * esc - 0.5 * s.gravity * esc * esc;
        if (c.marginUp < rise) jumpOut = 0.75;
      }
      pg = 0.96 * (1 - ALERT * (1 - fit * jumpOut));
    }
    // A projectile from far away gives time to see it.
    if (c.projectile && c.flight > 0.3 && busy < tC) pg *= clamp(1.25 - c.flight, 0.35, 1);
    pg *= 1 - brain.predictability(m);
    // A Shield in the way. A stunned opponent that saw it coming raises
    // its Shield the moment it is free: it only has to be free in time.
    let pBlock = 0;
    const blockable = !m.unblockable && s.foeCaps.shield && !op.exhausted && fpos.grounded;
    if (blockable && busy < tC - 0.03) {
      const bias = clamp(model.shieldy * 1.5 + 0.1, 0.15, 0.9);
      if (op.shielding) pBlock = 0.85;
      else pBlock = bias * clamp((tC - 0.1) / 0.2, 0.12, 1);
    }
    pBlock = clamp(pBlock, 0, 0.92);
    const pHit = pg * (1 - pBlock);
    const pBlocked = pg * pBlock;
    const pMiss = 1 - pg;
    // What the hit is worth.
    const strikes = m.projectile && c.projectile ? m.projectile.strikes : m.strikes;
    const hv = this.judge.strikes(s, 'foe', strikes, Math.max(1, c.strikes), fpos, c.face, this.hv);
    let vHit = hv.value;
    // The combo it opens: stun to spare after the CPU can act again.
    const lastStrike = strikes[Math.min(strikes.length, Math.max(1, c.strikes)) - 1];
    const freeAt = m.hitCancel != null && !c.projectile && !c.detached ? m.hitCancel : m.total;
    const advantage = (lastStrike?.hitstun ?? 0) + (lastStrike?.paralyze ?? 0) - (c.k0 * STEP + freeAt - tC);
    if (advantage > s.caps.fastest.ground * 0.8 && !hv.ko) vHit += p.comboReliability * (3 + op.lp * 0.06) * Math.min(1, advantage / 0.3);
    // What a block costs: the Shield's stall and the recovery left against
    // the blockstun; a block that would exhaust the opponent is a win.
    let vBlock = 0;
    if (pBlocked > 0) {
      const stall = !c.projectile && !c.detached ? s.foeCaps.shield?.stall ?? 0 : 0;
      const minus = stall + (m.total - tC + c.k0 * STEP) - (lastStrike?.blockstun ?? 0);
      vBlock = minus > this.foeFast ? -this.foePunish * 0.7 : -0.5;
      if (op.energy <= (s.foeCaps.shield?.blockCost ?? 15)) vBlock += 6;
      else vBlock += 0.6;
    }
    // What a whiff costs: the window it leaves the opponent.
    const window = (c.k0 * STEP + m.total) - tC + (c.projectile || c.detached ? 0 : 0.05);
    const endF = s.foeTrack.i(c.endK);
    const gap = Math.abs(s.foeTrack.x[endF] - c.endX);
    const near = gap < s.foeReach.lunge + 60 ? 1 : gap < s.foeReach.lunge + 220 ? 0.45 : 0.15;
    const punishable = clamp((window - this.foeFast - FOE_REACT * 0.6) / 0.25, 0, 1) * near;
    let vMiss = -0.4 - punishable * this.foePunish * 0.75;
    // Something already on its way to the CPU that lands first: its attack
    // is lost (no attack has armour) and the blow lands, unless the move
    // itself carries it clear.
    const incoming = brain.incoming;
    let struckFirst = 0;
    if (incoming && !c.combo) {
      const first = incoming.contact < tC - 0.02 || (m.kind === 'technique' && incoming.contact < m.lead + 0.05);
      if (first) struckFirst = clamp(incoming.p ?? 0.8, 0, 1);
    }
    // Struck first: an opponent free to act before the strike lands (or a
    // projectile is let go, or a cast releases) and close enough to reach
    // the CPU can hit it out of its move; nothing has armour.
    let interrupt = 0;
    if (!c.combo) {
      const exposedUntil = m.kind === 'technique' ? m.lead : c.projectile ? c.k0 * STEP + (m.projectile?.spawnAt ?? m.lead) : tC;
      const freeFor = exposedUntil - Math.max(busy, FOE_REACT);
      const reachIn = Math.max(0, s.dist - s.foeReach.lunge - 20) / MV.maxSpeed;
      if (freeFor - reachIn > this.foeFast + 0.02) {
        interrupt = clamp((freeFor - reachIn - this.foeFast) / 0.25, 0, 0.85) * (0.3 + 0.55 * model.aggressive) * (op.shielding ? 0.5 : 1);
      }
    }
    // Resources: Energy (the Deflect's, a Dash's), a long cooldown.
    let cost = 0;
    const energy = (c.energy ?? 0) + (m.energyCost ?? 0);
    if (energy > 0) {
      const left = s.me.energy - energy;
      cost += (energy / 25) * (0.3 + p.energySense * 0.5) + (left <= 0 ? 7 * p.energySense : left < 30 ? 1.2 * p.energySense : 0);
    }
    if (m.abilityCooldown > 1) cost += Math.min(2.5, m.abilityCooldown * 0.25);
    else if (m.cooldown > 1) cost += Math.min(1.5, m.cooldown * 0.15);
    // Getting back: a move that ends over open air must leave a way home.
    const elim = this.eliminationRisk(s, m, c);
    const risk = params.risk * (0.4 + p.riskSense * 0.6);
    const lost = Math.max(struckFirst, interrupt);
    let utility = (pHit * vHit + pBlocked * vBlock * risk + pMiss * vMiss * risk) * (1 - lost) - cost -
      interrupt * this.foePunish * risk - struckFirst * (incoming?.severity ?? 0) * (0.4 + p.riskSense * 0.6) -
      elim * KO_VALUE * s.match.koAgainst * (0.3 + p.riskSense * 0.7);
    // The strategy's preferred roles, and the CPU's own sense of variety.
    let bonus = 0;
    for (const role of m.roles) bonus += params.roles[role] ?? 0;
    utility += bonus * (0.5 + pHit);
    if (brain.unused(m) && pHit > 0.25) utility += 0.35;
    c.p = pHit * (1 - lost);
    c.pBlock = pBlocked;
    c.pg = pg;
    c.value = vHit;
    c.ko = hv.ko;
    c.utility = utility;
    c.elim = elim;
    c.reason = this.reason(s, m, c, busy, tC);
    return c;
  }

  // How likely move `m` (candidate `c`) leaves the CPU unable to get back:
  // where it ends, then a recovery from there with what would be left.
  eliminationRisk(s, m, c) {
    const model = s.model;
    const halfW = s.me.halfW;
    if (c.endGrounded || model.supported(c.endX, halfW, c.endY)) return 0;
    const fromGround = s.me.grounded;
    const usedAirJump = c.jump === 'air' ? 1 : 0;
    const res = {
      airJumps: m.freeFall ? 0 : Math.max(0, (fromGround ? MV.airJumps : s.me.airJumps) - usedAirJump),
      airDash: !m.freeFall && s.caps.movement.airDash && (fromGround || s.me.airDashes > 0) ? s.caps.movement.airDash.distance : 0,
      dashOk: !s.me.exhausted,
      rise: m.freeFall || m.motion === 'rise' ? null : riseOf(s.caps),
    };
    const k = this.selfTrack.len - 1;
    const st = {
      x: c.endX, y: c.endY, vx: this.selfTrack.vx[Math.max(0, k)] ?? 0, vy: this.selfTrack.vy[Math.max(0, k)] ?? 0,
      grounded: false, halfW, height: s.me.height,
    };
    if (c.kind === 'jumpStrike' || c.kind === 'strike') {
      st.vx = this.selfTrack.vx[k];
      st.vy = this.selfTrack.vy[k];
    }
    const r = recoverySim(model, s.gravity, st, res, { jumpBelow: 40, maxSteps: 150 }, this.rec);
    if (r.ok) return r.margin < 10 ? 0.15 : 0;
    return r.fell ? 1 : 0.7;
  }

  // Why the candidate is worth it, in words built from the numbers behind
  // it (for the debug trace).
  reason(s, m, c, busy, tC) {
    const parts = [];
    if (busy >= tC - 0.02) parts.push(busy > 0.3 && s.op.stunned ? 'opponent stunned' : 'opponent busy');
    else if (s.op.shielding && m.unblockable) parts.push('unblockable into a Shield');
    if (c.combo) parts.push('follow-up');
    if (c.kind === 'dashStrike') parts.push('Dash into');
    if (c.kind === 'jumpStrike') parts.push(s.op.grounded ? 'jump-in' : 'aerial interception');
    parts.push(`${m.id} lands in ${Math.round(tC * 1000)} ms`);
    if (c.ko > 0.3) parts.push(`launch likely ends a life (${Math.round(c.ko * 100)}%)`);
    else if (m.roles.has('launcher')) parts.push('launches');
    if (c.elim > 0) parts.push('risks the Void');
    return parts.join('; ');
  }
}
