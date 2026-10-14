// CPU Intelligence: threats and defensive responses (Shield, Deflect,
// projectile intelligence).
//
// Purpose: what is about to hit the CPU, as it perceives it, and the best
// answer. A threat is an opponent attack it has recognized whose strikes
// will meet its body (from the attack's own data, the opponent's predicted
// path and the CPU's own), a projectile on course for it (its own heading,
// speed, box, pull and lifetime; one the CPU owns is never a threat, and a
// projectile turned back is the turner's once the CPU has seen it turn),
// a throw about to let go, a technique still casting (its burst and its
// projectile), or a clone about to strike. Every one of them is an attack,
// and a raised Shield blocks every attack. Each has a time to contact, an
// end, a box, a side, how hard it pushes a Shield, and what it would cost
// the CPU (its damage and launch at the CPU's Launch Point, a fall into the
// Void included).
//
// Answers, each simulated by the rules and weighed against the others:
// the Shield (on the ground only, raised in time, held through the threat
// and no longer, perfectly timed when the level can see it coming, against
// any threat: a cast's burst or sphere as well as a jab; never into a push
// off a ledge, and its Energy weighed), a jump over it, a step or a Dash out of reach, the
// Deflect (in the air, pressed so its live box meets the projectile; from
// the ground by jumping into it), a counter-strike that lands first (a
// cast or a throw broken before it lets go), meeting a projectile with an
// erasing or repelling one, or taking a small hit when answering would cost
// more.
//
// Inputs: the situation, perception, the evaluator, the profile.
// Outputs: Defense (assess, choose).
// Important constraints: only recognized events are answered, after the
// perception latency; nothing reads the opponent's inputs.

import { STEP, Track, arcTrack, boxAt } from './prediction.js';
import { moveReady } from './capabilities.js';
import { BASE_FIGHTER_MOVEMENT as MV } from '../../../data/movement.js';
import { attackPhase, strikeLive } from '../../combat/attacks.js';

const HORIZON = 1.1;
const box = {};
const box2 = {};
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Defense {
  constructor(brain) {
    this.brain = brain;
    this.threats = [];
    this.arc = new Track(90);
    this.hv = {};
    // The answers the latest choose weighed, before the level's noise:
    // { why, score, threat } each (the debug trace; nothing reads it back).
    this.weighed = [];
  }

  // The CPU's hurt box with its feet at (x, y), padded.
  myBox(s, x, y, pad, out) {
    const h = s.caps.hurt;
    out.x = x - h.hw - pad;
    out.y = y + h.top - pad;
    out.w = h.hw * 2 + pad * 2;
    out.h = h.bottom - h.top + pad * 2;
    return out;
  }

  // Where the CPU's feet will be `t` seconds on if it carries on as it is,
  // and whether it will be standing on the ground then (what a quake needs).
  myAt(s, t) {
    const me = s.me;
    if (me.grounded) {
      const slide = Math.min(t, 0.1);
      return { x: me.x + me.vx * slide, y: me.y, grounded: true };
    }
    const g = s.gravity * me.gravityScale;
    const y = me.y + me.vy * t + 0.5 * g * t * t;
    const floor = s.model.groundBelow(me.x, me.halfW, me.y);
    return { x: me.x + me.vx * t, y: Math.min(y, floor), grounded: y >= floor };
  }

  // Every threat the CPU can see (see the header), soonest first.
  assess(s) {
    const out = this.threats;
    out.length = 0;
    if (!s.present) return out;
    const per = this.brain.perception;
    const v = per.view;
    if (v.attackDef && per.attackRecognized(v.attack)) this.meleeThreat(s, v, out);
    if (v.attackDef?.projectile && per.attackRecognized(v.attack)) this.throwThreat(s, v, out);
    if (v.techniqueDef && v.techniquePhase === 'cast') this.techniqueThreat(s, v, out);
    for (const shot of s.shots) {
      if (shot.owner === s.self) continue;
      const t = this.projectileThreat(s, shot.x, shot.y, shot.dir, shot.def, shot.age, shot.hits);
      if (t) {
        t.kind = 'projectile';
        t.ref = shot.p;
        t.shot = shot;
        out.push(t);
      }
    }
    for (const c of s.clones) {
      if (c.owner === s.self || c.target !== s.self || !c.alive || c.hasHit) continue;
      const t = this.cloneThreat(s, c);
      if (t) out.push(t);
    }
    out.sort((a, b) => a.contact - b.contact);
    return out;
  }

  // The opponent's attack, perceived: its strikes still to come against
  // the CPU's body.
  meleeThreat(s, v, out) {
    const def = v.attackDef;
    if (!def.hitbox) return;
    const strikes = def.hits ?? [def];
    const tNow = s.op.attackTime;
    if (tNow >= def.startup + def.active) return;
    if (!def.hits && v.attackHit) return;
    const myH = s.caps.hurt;
    const face0 = def.motion ? v.facing : Math.sign(s.me.x - s.op.x) || v.facing;
    // A slam's impact, where its plunge lands (see `slam` in
    // js/game/combat/attacks.js): the opponent's path shows the landing.
    const impact = def.motion?.type === 'slam' ? def.motion.impact : null;
    let landed = false;
    let contact = -1;
    let end = -1;
    let n = 0;
    let first = null;
    let top = Infinity;
    const boxes = [];
    const steps = Math.min(90, Math.ceil((def.startup + def.active - tNow) / STEP) + 1);
    for (let k = 0; k < steps; k++) {
      const t = tNow + (k + 1) * STEP;
      const fk = s.foeTrack.i(k);
      const fx = s.foeTrack.x[fk];
      const fy = s.foeTrack.y[fk];
      const me = this.myAt(s, (k + 1) * STEP);
      this.myBox(s, me.x, me.y, 4, box2);
      if (impact && !landed && s.foeTrack.g[fk] && attackPhase(def, t) === 'active') {
        landed = true;
        boxAt(impact.hitbox, fx, fy, face0, box);
        boxes.push({ k, x: box.x, y: box.y, w: box.w, h: box.h });
        if ((!impact.hit.quake || me.grounded) && overlaps(box, box2)) {
          if (contact < 0) {
            contact = k;
            first = impact.hit;
          }
          end = k;
          n++;
          top = Math.min(top, box.y);
        }
        break;
      }
      for (const h of strikes) {
        const live = def.hits ? strikeLive(h, t) : attackPhase(def, t) === 'active';
        if (!live) continue;
        // A quake passes by a CPU off the ground.
        if (h.quake && !me.grounded) continue;
        boxAt(h.hitbox ?? def.hitbox, fx, fy, face0, box);
        boxes.push({ k, x: box.x, y: box.y, w: box.w, h: box.h });
        if (overlaps(box, box2)) {
          if (contact < 0) {
            contact = k;
            first = h;
          }
          end = k;
          n++;
          top = Math.min(top, box.y);
        }
      }
    }
    if (contact < 0) return;
    const pos = { x: s.me.x, y: s.me.y, grounded: s.me.grounded, halfW: s.me.halfW, height: s.me.height };
    const list = def.hits ? def.hits.map((h) => ({ ...h, dir: h.directionalLaunch })) : [{ ...def, dir: def.directionalLaunch }];
    if (impact) list.push({ ...impact.hit, dir: impact.hit.directionalLaunch });
    const sev = this.brain.evaluator.judge.strikes(s, 'me', list, Math.max(1, Math.min(n, list.length)), pos, face0, this.hv);
    out.push({
      kind: 'melee', ref: v.attack, def, contact: (contact + 1) * STEP, end: (end + 1) * STEP + 0.02, boxes, top,
      from: Math.sign(s.op.x - s.me.x) || -s.me.facing, severity: sev.value, ko: sev.ko,
      blockPush: first.blockPush ?? def.blockPush ?? 0,
      strikesLeft: n, foeRecovery: def.total - tNow - (contact + 1) * STEP,
    });
  }

  // A projectile at (x, y) flying `dir`, `age` seconds old: when it would
  // meet the CPU (its pull widening what it catches), and what it would cost.
  projectileThreat(s, x, y, dir, def, age, hits = 0, delay = 0) {
    if (hits > 0 && !def.pierce && !def.erase) return null;
    const pull = def.pull?.radius ?? 0;
    const life = def.lifetime - age;
    let contact = -1;
    let end = -1;
    for (let k = 0; k * STEP < Math.min(HORIZON, life + delay); k++) {
      const t = (k + 1) * STEP;
      if (t < delay) continue;
      const px = x + dir * def.speed * (t - delay);
      boxAt(def.hitbox, px, y, dir, box);
      const me = this.myAt(s, t);
      this.myBox(s, me.x, me.y, 3 + pull, box2);
      if (overlaps(box, box2)) {
        if (contact < 0) contact = k;
        end = k;
      } else if (contact >= 0) break;
    }
    if (contact < 0) return null;
    const pos = { x: s.me.x, y: s.me.y, grounded: s.me.grounded, halfW: s.me.halfW, height: s.me.height };
    const strikes = [];
    const n = def.pierce ? def.pierce.hits : 1;
    for (let i = 0; i < n; i++) {
      const h = def.pierce && i === n - 1 && def.finisher ? def.finisher : def;
      strikes.push({ ...h, dir: h.directionalLaunch });
    }
    const sev = this.brain.evaluator.judge.strikes(s, 'me', strikes, n, pos, dir, this.hv);
    return {
      contact: (contact + 1) * STEP, end: (end + 1) * STEP + (def.pierce ? def.pierce.interval * def.pierce.hits : 0.02),
      top: y + def.hitbox.y - pull, bottom: y + def.hitbox.y + def.hitbox.h + pull, from: -dir, severity: sev.value, ko: sev.ko,
      blockPush: def.blockPush ?? 0, x, y, dir, def, delay, pull, strikesLeft: n, age,
    };
  }

  // A throw still winding up: its projectile, once it lets go.
  throwThreat(s, v, out) {
    const def = v.attackDef;
    const spec = def.projectile;
    const tNow = s.op.attackTime;
    if (tNow >= spec.spawnAt) return;
    const proj = s.foe.projectileDefs?.[spec.id];
    if (!proj) return;
    const face = Math.sign(s.me.x - s.op.x) || v.facing;
    const delay = spec.spawnAt - tNow;
    const fk = s.foeTrack.i(Math.round(delay / STEP));
    const x = s.foeTrack.x[fk] + spec.offset.x * face;
    const y = s.foeTrack.y[fk] + spec.offset.y;
    const t = this.projectileThreat(s, x, y, face, proj, 0, 0, delay);
    if (!t) return;
    t.kind = 'throw';
    t.ref = v.attack;
    t.releaseIn = delay;
    out.push(t);
  }

  // A technique still casting: its burst and its projectile, at its release.
  techniqueThreat(s, v, out) {
    const def = v.techniqueDef;
    const releaseIn = Math.max(0, v.techniqueReleaseIn - s.op.age);
    const face = v.techniqueFacing;
    if (def.burst) {
      boxAt(def.burst.hitbox, s.op.x, s.op.y, face, box);
      const me = this.myAt(s, releaseIn);
      this.myBox(s, me.x, me.y, 4, box2);
      // A quake passes by a CPU off the ground.
      if ((!def.burst.hit.quake || me.grounded) && overlaps(box, box2)) {
        const pos = { x: s.me.x, y: s.me.y, grounded: s.me.grounded, halfW: s.me.halfW, height: s.me.height };
        const hit = def.burst.hit;
        const sev = this.brain.evaluator.judge.strikes(s, 'me', [{ ...hit, dir: hit.directionalLaunch }], 1, pos, face, this.hv);
        out.push({
          kind: 'technique', ref: v.technique, contact: releaseIn + STEP, end: releaseIn + 2 * STEP, burst: { x: box.x, y: box.y, w: box.w, h: box.h },
          top: box.y, from: Math.sign(s.op.x - s.me.x) || -1, severity: sev.value + (hit.paralyze ?? 0) * 8, ko: sev.ko,
          blockPush: hit.blockPush ?? 0, releaseIn, strikesLeft: 1,
        });
      }
    }
    if (def.projectile) {
      const proj = s.foe.projectileDefs?.[def.projectile.id];
      if (!proj) return;
      const x = s.op.x + def.projectile.offset.x * face;
      const y = s.op.y + def.projectile.offset.y;
      const t = this.projectileThreat(s, x, y, face, proj, 0, 0, releaseIn);
      if (!t) return;
      t.kind = 'technique';
      t.ref = v.technique;
      t.releaseIn = releaseIn;
      out.push(t);
    }
  }

  // A clone about to strike: its box once its attack is live.
  cloneThreat(s, c) {
    const def = c.attackDef;
    const lead = c.phase === 'appear' ? c.cloudDuration - c.time : -c.attackTime;
    const contact = lead + def.startup;
    const end = lead + def.startup + def.active;
    if (end <= 0 || !def.hitbox) return null;
    boxAt(def.hitbox, c.x, c.y, c.facing, box);
    const me = this.myAt(s, Math.max(0, contact));
    this.myBox(s, me.x, me.y, 4, box2);
    if (!overlaps(box, box2)) return null;
    const pos = { x: s.me.x, y: s.me.y, grounded: s.me.grounded, halfW: s.me.halfW, height: s.me.height };
    const sev = this.brain.evaluator.judge.strikes(s, 'me', [{ ...def, dir: def.directionalLaunch }], 1, pos, c.facing, this.hv);
    return {
      kind: 'clone', ref: c, contact: Math.max(STEP, contact), end, boxes: [{ k: Math.round(contact / STEP), x: box.x, y: box.y, w: box.w, h: box.h }],
      top: box.y, from: Math.sign(box.x + box.w / 2 - s.me.x) || -1, severity: sev.value, ko: sev.ko,
      blockPush: def.blockPush ?? 0, strikesLeft: 1,
    };
  }

  // ---- Answers ----------------------------------------------------------------------

  // The best answer to `threat` (see the header) as a plan spec for the
  // brain, or null to take it. Weighed by the level: how fully it defends
  // (`guard`), how well it times a perfect Shield, how much it cares about
  // Energy.
  choose(s, threat) {
    const brain = this.brain;
    const p = brain.profile;
    const self = s.self;
    const me = s.me;
    const options = [];
    const sev = threat.severity + threat.ko * 40;
    // Doing nothing: the hit lands.
    options.push({ score: -sev, plan: null, why: 'takes it' });
    const free = me.canAct || (self.canFollowUp() && !me.attack);
    const canJump = (me.canAct || self.combat.cancellable || self.dashCancellable) && !me.shielding;
    // The Shield.
    const shield = s.caps.shield;
    // Every threat is an attack, and every attack is blockable: a technique's
    // burst, a sphere, a clone's strike and a Deflect's as surely as a jab.
    if (shield && me.grounded && !me.exhausted && (me.canAct || me.shielding) &&
        threat.contact > STEP * 0.5) {
      const cost = shield.blockCost;
      const exhausts = me.energy <= cost + 0.5;
      const slide = (threat.blockPush * threat.blockPush) / (2 * MV.deceleration);
      const room = s.model.edgeRoom(me.x, -threat.from);
      const pushedOff = slide > room - me.halfW - 4;
      let score = -0.3 - (cost / 25) * (0.4 + p.energySense) - (exhausts ? 8 * p.energySense : 0) - (pushedOff ? sev * 0.9 : 0);
      // Blocking leaves the attacker its recovery: a punish, if long enough.
      if (threat.kind === 'melee' && threat.foeRecovery > s.caps.fastest.ground + 0.05) score += 2 + threat.foeRecovery * 4;
      const rearmed = self.shieldDownTime >= (shield.perfectRearm ?? 0);
      const perfect = shield.perfectWindow > 0 && rearmed && brain.rng() < p.perfectShield && threat.contact > 0.08;
      const raiseIn = perfect ? Math.max(0, threat.contact - shield.perfectWindow * 0.6) : Math.max(0, threat.contact - 0.16 - (1 - p.guard) * 0.1);
      options.push({
        score: score + (perfect ? 1.2 : 0),
        plan: { kind: 'shield', raiseAt: brain.clock + raiseIn, until: brain.clock + threat.end + 0.03 + (1 - p.guard) * 0.12, threat, perfect },
        why: perfect ? 'perfect Shield' : 'Shield',
      });
    }
    // A jump over it: now, or later for something still far off (the jump
    // timed to clear it as it passes).
    if (me.grounded && canJump && Number.isFinite(threat.top)) {
      const latest = Math.max(0, threat.contact - 0.12);
      const delays = [0];
      for (let d = 0.1; d <= latest && delays.length < 8; d += 0.08) delays.push(d);
      let found = null;
      for (const delay of delays) {
        for (const jump of ['ground', 'high']) {
          for (const dir of [0, -threat.from]) {
            if (this.clearsByJump(s, threat, jump, dir, delay)) {
              found = { jump, dir, delay };
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) {
        const landRisk = threat.kind === 'melee' ? 1.2 : 0.4;
        options.push({
          score: -0.6 - landRisk + (threat.kind !== 'melee' ? 0.8 : 0),
          plan: { kind: 'jump', jump: found.jump, dir: found.dir, startAt: brain.clock + found.delay, why: 'jump over' }, why: 'jump over',
        });
      }
    }
    // Out of reach on foot, or by Dash.
    if (me.grounded && free) {
      const away = -threat.from;
      const room = s.model.edgeRoom(me.x, away);
      const need = this.clearance(s, threat, away);
      if (need > 0 && Number.isFinite(need)) {
        const t = Math.max(0, threat.contact - STEP);
        const walk = MV.maxSpeed * Math.max(0, t - 0.04);
        if (walk > need && room > need + me.halfW + 30) {
          options.push({ score: -0.5, plan: { kind: 'move', dir: away, until: brain.clock + threat.end + 0.05, why: 'steps out' }, why: 'steps out' });
        }
        const dash = s.caps.movement.dash;
        if (dash && self.movementReady(false) && !me.exhausted && room > dash.distance + me.halfW + 40 && t > 0.05 && dash.reach > need) {
          const left = me.energy - dash.cost;
          options.push({
            score: -0.9 - (dash.cost / 25) * p.energySense - (left <= 0 ? 6 : 0),
            plan: { kind: 'dash', dir: away, why: 'Dashes out' }, why: 'Dashes out',
          });
        }
      }
    }
    // In the air: drift away from it, or fast fall under a high one.
    if (!me.grounded && !me.offstage && free) {
      options.push({ score: -sev * 0.6 - 0.2, plan: { kind: 'airDrift', dir: -threat.from, until: brain.clock + threat.end, why: 'drifts away' }, why: 'drifts away' });
    }
    // The Deflect against a projectile.
    const deflect = s.caps.deflect;
    if (deflect && (threat.kind === 'projectile' || threat.kind === 'throw' || (threat.kind === 'technique' && threat.def)) && !me.exhausted &&
        !self.combat.cooldowns.has(deflect.id)) {
      const d = this.deflectTiming(s, threat, deflect);
      if (d) {
        const left = me.energy - deflect.energyCost;
        // Turned back, it is the CPU's own for the rest of its flight: a
        // hit on its thrower if it still reaches, most of all one still
        // recovering from the throw.
        const flight = Math.max(0, threat.def.lifetime - (threat.age ?? 0) - threat.contact) * threat.def.speed;
        const back = Math.abs(s.op.x - me.x) < flight ? (0.6 + (threat.def.damage ?? 0) * 0.12) * (s.op.busy > 0.15 ? 1.3 : 0.7) : 0;
        options.push({
          score: 0.4 + back - (deflect.energyCost / 25) * p.energySense - (left <= 0 ? 5 * p.energySense : 0),
          plan: { kind: 'deflect', jump: d.jump, jumpAt: brain.clock + d.jumpAt, startAt: d.jump ? brain.clock + d.jumpAt : null, pressAt: brain.clock + d.press, why: 'Deflects it back' }, why: 'Deflect',
        });
      }
    }
    // Strike first: break a throw or a cast before it lets go, or hit an
    // attacker during its startup.
    if (threat.kind !== 'projectile' && threat.kind !== 'clone') {
      const strikes = brain.evaluator.candidates(s, brain.scratchList, {});
      for (const c of strikes) {
        if (c.kind !== 'strike' || c.move.kind === 'technique' || c.move.kind === 'summon') continue;
        const tHit = (c.contactK + 1) * STEP;
        const before = threat.kind === 'melee' ? threat.contact - 0.02 : threat.releaseIn ?? threat.contact;
        if (tHit >= before || c.p < 0.3) continue;
        options.push({ score: c.utility * 0.6 + sev * c.p * 0.8 - sev * (1 - c.p), plan: { kind: 'strike', cand: c, why: 'strikes first' }, why: 'strikes first' });
      }
    }
    // Meet a projectile with an erasing or repelling one of its own.
    if (threat.kind === 'projectile' || threat.kind === 'throw' || threat.kind === 'technique') {
      for (const m of s.caps.moves) {
        const shot = m.projectile;
        if (!shot || !(shot.erase || shot.repel) || !moveReady(self, m)) continue;
        if (threat.def?.erase && !shot.erase) continue;
        if (shot.spawnAt + 0.05 < threat.contact) {
          options.push({ score: -0.4 + (shot.erase ? 0.5 : 0), plan: { kind: 'press', move: m, why: shot.erase ? 'erases it' : 'repels it' }, why: 'counter-projectile' });
        }
      }
    }
    this.weighed = options.map((o) => ({ why: o.why, score: o.score, threat }));
    // The level's judgement: noise on every option, and a lower level
    // sometimes misses the better answer or freezes.
    let best = options[0];
    let bestScore = -Infinity;
    for (const o of options) {
      const v = o.score + (brain.rng() * 2 - 1) * brain.profile.noise * (2 + Math.abs(o.score) * 0.3);
      if (v > bestScore) {
        bestScore = v;
        best = o;
      }
    }
    if (best.plan && brain.rng() > 0.35 + p.guard * 0.65) return null;
    if (best.plan) best.plan.threat = threat;
    return best.plan;
  }

  // How far the CPU must move away (toward `away`) for the threat's boxes
  // to miss it; 0 if it is already clear, Infinity if there is no box.
  clearance(s, threat, away) {
    const h = s.caps.hurt;
    if (threat.def && !threat.boxes && !threat.burst) {
      // A projectile: only out of its remaining range, if it flies away from it.
      if (away !== threat.dir) return Infinity;
      const left = threat.def.lifetime - (threat.age ?? 0);
      const endX = threat.x + threat.dir * threat.def.speed * left + threat.dir * (threat.def.hitbox.x + threat.def.hitbox.w);
      return away > 0 ? endX - (s.me.x - h.hw) + 6 : s.me.x + h.hw - endX + 6;
    }
    const list = threat.boxes ?? (threat.burst ? [threat.burst] : null);
    if (!list) return Infinity;
    let need = 0;
    for (const b of list) {
      const n = away > 0 ? b.x + b.w - (s.me.x - h.hw) + 4 : s.me.x + h.hw - b.x + 4;
      need = Math.max(need, n);
    }
    return need;
  }

  // Whether a jump (`jump`, steering `dir`) started now keeps the CPU's
  // body clear of the threat from its contact to its end.
  clearsByJump(s, threat, jump, dir, delay = 0) {
    const arc = arcTrack(this.arc, s.stage, s.gravity, s.me, { jump, dir, steps: 90 });
    const d = Math.round(delay / STEP);
    // A projectile is checked over its whole remaining flight (moving
    // changes when it would meet the CPU); an attack over its strikes.
    const shot = threat.def && !threat.boxes && !threat.burst;
    const from = shot ? 0 : Math.floor(threat.contact / STEP) - 1;
    const to = shot ? Math.min(150, Math.ceil((threat.def.lifetime - (threat.age ?? 0) + (threat.delay ?? 0)) / STEP))
      : Math.ceil(threat.end / STEP) + 1;
    for (let k = Math.max(0, from); k <= to; k++) {
      // Standing where it is until the jump.
      if (k < d) {
        this.myBox(s, s.me.x, s.me.y, 2, box2);
        if (this.hitsAt(threat, k, box2)) return false;
        continue;
      }
      // Landed again it stands where it came down (a shot already past
      // is no danger).
      const a = arc.i(k - d);
      if (arc.g[a] && k - d > 2 && !shot) return false;
      this.myBox(s, arc.x[a], arc.y[a], 2, box2);
      if (this.hitsAt(threat, k, box2)) return false;
    }
    return true;
  }

  // Whether `threat` meets box `b` (the CPU's) `k` steps from now.
  hitsAt(threat, k, b) {
    if (threat.boxes) {
      for (const tb of threat.boxes) if (Math.abs(tb.k - k) <= 1 && overlaps(tb, b)) return true;
      return false;
    }
    if (threat.burst) return k >= Math.floor(threat.contact / STEP) - 1 && overlaps(threat.burst, b);
    if (threat.def) {
      const t = (k + 1) * STEP - (threat.delay ?? 0);
      if (t < 0) return false;
      boxAt(threat.def.hitbox, threat.x + threat.dir * threat.def.speed * t, threat.y, threat.dir, box);
      box.x -= threat.pull;
      box.y -= threat.pull;
      box.w += threat.pull * 2;
      box.h += threat.pull * 2;
      return overlaps(box, b);
    }
    return b.y + b.h > threat.top;
  }

  // When to press the Deflect so its live box meets projectile `threat`
  // before the projectile meets the CPU's body: { press (seconds from now),
  // jump (a jump first, from the ground), jumpAt (seconds from now) } or
  // null. From the ground the jump may wait so the swat meets a low shot
  // early in the rise.
  deflectTiming(s, threat, d) {
    if (!threat.def) return null;
    const me = s.me;
    const jumpFirst = me.grounded;
    if (jumpFirst && !(me.canAct || s.self.combat.cancellable)) return null;
    if (!jumpFirst && !s.self.canFollowUp()) return null;
    if (!jumpFirst && (s.self.freeFall || s.self.airStartBlocked(d.def))) return null;
    const arc = jumpFirst ? arcTrack(this.arc, s.stage, s.gravity, me, { jump: 'ground', dir: 0, steps: 70 }) :
      arcTrack(this.arc, s.stage, s.gravity, me, { jump: null, dir: 0, steps: 70 });
    const hb = d.def.hitbox;
    const startK = Math.round(d.def.startup / STEP);
    const activeK = Math.max(1, Math.round(d.def.active / STEP));
    // The step (0: this one) at whose end the projectile meets the body.
    // The game turns projectiles back before any strikes in a step, so the
    // Deflect must be live by that step at the latest.
    const contactK = Math.round(threat.contact / STEP) - 1;
    // The Fighter aims every attack, the Deflect included, at the opponent
    // the CPU sees (CpuIntelligence.attackFacing): its box is on that side.
    const face = Math.sign(s.op.x - me.x) || me.facing;
    if (face !== -threat.dir) return null;
    // Standing still until the jump, its arc is the same one, later. The
    // latest jump that works is taken: the swat follows the takeoff, with
    // no long wait in the air.
    const lastJump = jumpFirst ? Math.max(0, contactK - startK - 1) : 0;
    const wait = Math.round(0.3 / STEP);
    for (let jumpAt = lastJump; jumpAt >= 0; jumpAt--) {
      const first = jumpFirst ? jumpAt + 1 : 0;
      for (let press = first; press + startK <= contactK && press - first <= wait; press++) {
        const live0 = press + startK;
        for (let k = live0; k < live0 + activeK; k++) {
          const a = arc.i(k - jumpAt);
          if (arc.g[a] && k - jumpAt > 3) break;
          boxAt(hb, arc.x[a], arc.y[a], face, box2);
          const t = (k + 1) * STEP - (threat.delay ?? 0);
          if (t < 0) continue;
          boxAt(threat.def.hitbox, threat.x + threat.dir * threat.def.speed * t, threat.y, threat.dir, box);
          if (overlaps(box, box2)) return { press: press * STEP, jump: jumpFirst, jumpAt: jumpAt * STEP };
        }
      }
    }
    return null;
  }
}
