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
// still busy when it lands or free to react, jump or Shield it (every
// attack is blockable: a technique, a summon's clone, a projectile and a
// Deflect alike; an opponent already behind its Shield when the move lands
// and unable to lower it first blocks it for certain), and how predictable
// the move has become. A short-range move far from its target is not rejected: the
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
import { attackPhase } from '../../combat/attacks.js';
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
    // Its quick close moves, aerials and the Deflect included (it can jump
    // to swat the CPU as well as strike it on foot).
    for (const m of s.foeCaps.moves) {
      if (m.kind !== 'melee' && m.kind !== 'deflect') continue;
      if (!m.air) fast = Math.min(fast, m.lead);
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
    // The jump arcs are the heaviest search: at most every 70 ms (a combo's
    // follow-up always gets one).
    if (combo || this.brain.clock - (this.jumpEvalAt ?? -1) >= 0.07) {
      this.jumpEvalAt = this.brain.clock;
      this.jumpStrikes(s, out, combo, k0);
    }
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
    const r = projectileContact(s.stage, shot, x0, y0, face, k0 * STEP + shot.spawnAt, s.foeTrack, s.foeCaps.hurt, this.shot, this.pullable(s));
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
      // A quake reaches the opponent only standing on the ground.
      const reaches = !m.burst.hit?.quake || s.foeTrack.g[fk];
      if (reaches && inX > 0 && inY > 0) {
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
      const r = projectileContact(s.stage, shot, x0, y0, face, shot.spawnAt, s.foeTrack, hurt, this.shot, this.pullable(s));
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
    const aerials = s.caps.aerial.filter((m) => m.kind !== 'ranged' && !(m.kind === 'deflect' && me.exhausted));
    if (!aerials.length) return;
    // Out of reach of any arc: a whole jump's drift plus the longest
    // aerial reach (a homing dash's lock-on included).
    let longest = 0;
    for (const m of aerials) if (m.reach) longest = Math.max(longest, Math.abs(m.reach.x), Math.abs(m.reach.x + m.reach.w));
    const fk = s.foeTrack.i(18);
    const fx = s.foeTrack.x[fk];
    if (Math.abs(fx - me.x) > s.caps.movement.airtime * MV.maxSpeed * 1.2 + longest + 80) return;
    const targets = [fx - s.dir * 40, fx];
    if (p.planDepth >= 2) targets.push(me.x);
    if (p.planDepth >= 4) targets.push(fx - s.dir * 90);
    const delays = combo ? [k0] : me.grounded && !s.op.grounded && p.planDepth >= 3 ? [0, 8] : [0];
    const hurt = s.foeCaps.hurt;
    for (const delay of delays) {
      for (const jump of kinds) {
        for (const toX of targets) {
          arcTrack(this.arc, s.stage, s.gravity, me, { jump, toX, steps: 80 });
          const arc = this.arc;
          for (const m of aerials) {
            if (!this.readyInAir(self, m, me.grounded)) continue;
            const lead = Math.round(m.lead / STEP);
            const r = m.reach ?? m.hitbox;
            if (!r) continue;
            // Not before its cooldown is over.
            const from = Math.max(jump ? 2 : 1, Math.ceil((self.combat.cooldowns.get(m.id) ?? 0) / STEP) - delay + 1);
            for (let j = from; j < arc.len; j += 2) {
              const a = arc.i(j - 1);
              if (arc.g[a]) break;
              // Cheap check first: the move's reach (either way it may
              // face), carried by the arc's drift to when it strikes,
              // against where the opponent will be then.
              const f = s.foeTrack.i(j + delay + lead);
              const hover = m.motion === 'hover' || m.motion === 'homing';
              const ax = arc.x[a] + arc.vx[a] * m.lead * (m.airMomentum ?? 1);
              const ay = hover ? arc.y[a] : arc.y[a] + arc.vy[a] * m.lead + 0.5 * s.gravity * m.lead * m.lead;
              const ddx = Math.abs(s.foeTrack.x[f] - ax);
              if (ddx > Math.max(Math.abs(r.x), Math.abs(r.x + r.w)) + hurt.hw + 20) continue;
              const fy = s.foeTrack.y[f];
              if (fy + hurt.bottom < ay + r.y - 30 || fy + hurt.top > ay + r.y + r.h + 30 + (m.motion === 'bounce' || m.motion === 'slam' ? 400 : 0)) continue;
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

  // Whether a pull can drag the opponent: not behind a Shield, held by a
  // paralysis, or committed to a cast or a summon's startup.
  pullable(s) {
    const v = s.op.view;
    return !s.op.shielding && !(v.paralysis > 0) && !v.techniqueDef && !v.summon;
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
    pg *= 1 - brain.predictability(m, c.kind);
    // A Shield in the way: every attack is blockable. A stunned opponent
    // that saw it coming raises its Shield the moment it is free: it only
    // has to be free in time. One whose Shield is already up blocks for
    // certain if it cannot lower it before the move lands (held in its
    // blockstun, or no time to react), and very likely otherwise: the CPU
    // never counts on a hit through a raised Shield.
    let pBlock = 0;
    const blockable = s.foeCaps.shield && !op.exhausted && fpos.grounded;
    if (blockable && op.shielding) {
      pBlock = busy >= tC - 0.03 || tC <= FOE_REACT ? 1 : 0.85;
    } else if (blockable && busy < tC - 0.03) {
      // How readily it Shields what comes, and how much of what the CPU
      // has thrown ended on its Shield.
      const bias = clamp(model.shieldy * 1.5 + 0.1 + model.walls * 0.3, 0.15, 0.9);
      pBlock = clamp(bias * clamp((tC - 0.1) / 0.2, 0.12, 1), 0, 0.92);
    }
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
    // A charm: for its seconds the opponent's hits only heal the CPU, so
    // it can press on unanswered (worth little while one is still running).
    const charm = Math.max(0, ...strikes.map((h) => h.charm ?? 0));
    if (charm > 0) vHit += charm * (s.op.view.charm > 0 ? 0.5 : 4);
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
    // What being hit costs: the opponent's best quick hit from here, or,
    // at a Launch Point where its best launch ends the CPU's life, that.
    const exposure = Math.max(this.foePunish, brain.strategy.danger * KO_VALUE * s.match.koAgainst * 0.8);
    // An opponent that has been punishing its whiffs makes one cost more.
    let vMiss = (-0.4 - punishable * exposure * 0.75) * (1 + model.punishing * 0.6);
    // Something already on its way to the CPU that lands first: its attack
    // is lost (no attack has armour) and the blow lands, unless the move
    // itself carries it clear.
    const incoming = brain.incoming;
    let struckFirst = 0;
    let blow = incoming?.severity ?? 0;
    if (incoming && !c.combo) {
      const first = incoming.contact < tC - 0.02 || (m.kind === 'technique' && incoming.contact < m.lead + 0.05);
      if (first) struckFirst = clamp(incoming.p ?? 0.8, 0, 1);
    }
    // Or the CPU's own way in (a Dash, a jump, the move's step) runs into
    // the live box of the attack the opponent is already making.
    if (!c.combo && struckFirst < 0.9 && this.intoActiveBlow(s, c)) {
      struckFirst = 0.9;
      blow = Math.max(blow, this.foePunish);
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
      // Both pressing at once: up close an opponent that starts a quicker
      // strike of its own before this one lands wins the exchange, seen
      // coming or not (it may already be pressing). How often it does is
      // its habit (`pressure`: attacks a second within reach).
      const open = exposedUntil - Math.max(busy, 0) - this.foeFast;
      if (open > 0 && s.dist < s.foeReach.lunge + 40 && !op.shielding) {
        interrupt = Math.max(interrupt, clamp(1 - Math.exp(-model.pressure * open), 0, 0.85));
      }
    }
    // Resources: Energy (the Deflect's, a Dash's), a long cooldown.
    let cost = 0;
    const energy = (c.energy ?? 0) + (m.energyCost ?? 0);
    if (energy > 0) {
      // Emptying the bar leaves no Shield, Dash or Deflect until it is full
      // again: worth it only for a hit that ends a life.
      const left = s.me.energy - energy;
      const danger = brain.strategy.danger;
      const empty = (8 + danger * 30 + this.foePunish * 0.5) * p.energySense;
      cost += (energy / 25) * (0.3 + p.energySense * 0.5) + (left <= 0 ? empty : left < 30 ? (1.5 + danger * 4) * p.energySense : 0);
    }
    if (m.abilityCooldown > 1) cost += Math.min(2.5, m.abilityCooldown * 0.25);
    else if (m.cooldown > 1) cost += Math.min(1.5, m.cooldown * 0.15);
    // Getting back: a move that ends over open air must leave a way home.
    const elim = this.eliminationRisk(s, m, c);
    const risk = params.risk * (0.4 + p.riskSense * 0.6);
    const lost = Math.max(struckFirst, interrupt);
    let utility = (pHit * vHit + pBlocked * vBlock * risk + pMiss * vMiss * risk) * (1 - lost) - cost -
      interrupt * exposure * risk - struckFirst * blow * (0.4 + p.riskSense * 0.6) -
      elim * KO_VALUE * s.match.koAgainst * (0.3 + p.riskSense * 0.7);
    // The strategy's preferred roles (the mode's, and what the opponent's
    // habits make worth reaching for), and the CPU's own sense of variety.
    let bonus = 0;
    const adaptive = brain.strategy.adaptive;
    for (const role of m.roles) bonus += (params.roles[role] ?? 0) + (adaptive[role] ?? 0);
    utility += bonus * (0.5 + pHit);
    if (pHit > 0.25) utility += brain.variety(m);
    // Tempo: the same hit is worth less the longer it takes to land (the
    // time spent getting there is time the opponent gets back, and an
    // opening wasted waiting).
    if (utility > 0 && !c.projectile) utility /= 1 + Math.max(0, tC - 0.3) * 0.6;
    c.p = pHit * (1 - lost);
    // An opening: the opponent still busy (recovering, stunned) when it lands.
    c.open = busy >= tC - 0.02;
    c.pBlock = pBlocked;
    c.pg = pg;
    c.value = vHit;
    c.ko = hv.ko;
    c.utility = utility;
    c.elim = elim;
    c.reason = this.reason(s, m, c, busy, tC);
    return c;
  }

  // Whether the CPU's way to its strike (candidate `c`, whose own path is
  // in selfTrack from step k0) crosses the live box of the attack the
  // opponent is already making, as perceived, before the strike lands: on
  // its way to the move's start (straight there, a Dash or a jump), then on
  // the move's own path. A blow already on its way lands first.
  intoActiveBlow(s, c) {
    const op = s.op;
    const def = op.attackDef;
    if (!def?.hitbox || op.view.attackHit) return false;
    const hurt = s.caps.hurt;
    const t = this.selfTrack;
    if (!t.len) return false;
    const k0 = c.k0 ?? 0;
    const last = Math.min(c.contactK, 90);
    for (let k = 0; k <= last; k++) {
      if (attackPhase(def, op.attackTime + (k + 1) * STEP) !== 'active') continue;
      let x;
      let y;
      if (k < k0) {
        const a = (k + 1) / k0;
        x = s.me.x + (t.x[0] - s.me.x) * a;
        y = s.me.y + (t.y[0] - s.me.y) * a;
      } else {
        const i = t.i(k - k0);
        x = t.x[i];
        y = t.y[i];
      }
      const fk = s.foeTrack.i(k);
      boxAt(def.hitbox, s.foeTrack.x[fk], s.foeTrack.y[fk], op.facing, scratchBox);
      if (scratchBox.x < x + hurt.hw && scratchBox.x + scratchBox.w > x - hurt.hw &&
          scratchBox.y < y + hurt.bottom && scratchBox.y + scratchBox.h > y + hurt.top) return true;
    }
    return false;
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
