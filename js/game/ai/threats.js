// CPU Intelligence: threat recognition and defensive answers.
//
// Purpose: what can hit the CPU and when, from what it has perceived
// (perception.js): the opponent's strike in its startup or active frames
// (its whole reach, a roll's path, a plunge, a lift, a homing dash's
// lock-on range), a projectile on course (straight on at its speed, its
// pull's circle included, a throw not yet released too), a technique still
// casting (its burst, its projectile) and a clone about to strike. Each
// threat says when it can first touch the CPU, when it is over, how high it
// reaches, which side it comes from, whether a Shield stops it and how bad
// it would be (its launch from the CPU's own Launch Point, against the
// stage). Then every legal answer is weighed: a Shield (on the ground,
// never against what no Shield stops, timed into its perfect window as
// often as the level can), a jump over it (the height it needs), a step or
// a Dash away, the Deflect in the air, a jump to Deflect a shot from the
// ground, striking first (a startup or a cast is breakable), meeting a shot
// with an erasing or repelling one, or taking it (bending the launch toward
// safety).
//
// Inputs: the situation (perceived opponent, projectiles, clones).
// Outputs: assessThreats, defenseOptions, deflectCatches, jumpDeflectPlan.
// Important constraints: side-effect free. Never reads the opponent's
// input, only what it has started.

import { attackReach } from '../combat/attacks.js';
import { overlap, boxAt, hurtBoxAt, jumpArc, koEstimate, STEP } from './forecast.js';
import { selfAt, moveFit, shotFit } from './targeting.js';
import { launchFor, KO_VALUE, energyCost, punishCost, hitWorth } from './valuation.js';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// Threats further off than this (seconds to contact) wait for a later look.
export const DEFENSE_HORIZON = 0.5;

// How bad hit `hit` landing on the CPU, coming from side `from`, would
// be: its damage, its stun, and its launch from the Launch Point it would
// leave, against the stage.
function severity(S, hit, from) {
  const damage = hit.damage ?? 0;
  let v = damage + (hit.hitstun ?? 0) * 4;
  const bl = hit.baseLaunch ?? 0;
  const dir = hit.directionalLaunch ?? hit.direction ?? null;
  if (bl > 0 && dir) {
    const l = launchFor({ damage, baseLaunch: bl, direction: dir, finisherStun: hit.hitstun ?? 0.2 }, S.lp, -from, S.self.launchReaction);
    const ko = koEstimate(S.stage, { x: S.x, y: S.y, halfW: S.halfW, height: S.height, grounded: S.grounded }, l.vec, l.stun);
    v += ko.p * KO_VALUE + ko.offstage * 4;
  }
  if (hit.paralyze > 0) v += 6 + hit.paralyze * 6;
  return v;
}

// A projectile (live, or one released `delay` seconds from now) on course
// for the CPU: when it touches it against where its own motion puts it,
// or null when it passes, has passed or dies first.
function projectileThreat(S, p, delay) {
  const dirp = sign(p.vx);
  if (!dirp) return null;
  const def = p.def;
  const hb = def.hitbox;
  const e = S.me;
  const pull = def.pull ? def.pull.radius * 0.85 : 0;
  const front = dirp > 0 ? p.x + hb.x + hb.w + pull : p.x - hb.x - hb.w - pull;
  const tail = dirp > 0 ? p.x + hb.x - pull : p.x - hb.x + pull;
  if (dirp > 0 ? tail > S.x + e.hw : tail < S.x - e.hw) return null;
  const gap = dirp > 0 ? S.x - e.hw - front : front - (S.x + e.hw);
  const speed = Math.abs(p.vx);
  const travel = Math.max(0, gap) / speed;
  if (travel > def.lifetime - Math.max(0, p.age ?? 0)) return null;
  const contactIn = delay + travel;
  const me = selfAt(S, contactIn);
  const top = p.y + hb.y - pull;
  const bottom = top + hb.h + 2 * pull;
  if (!(top < me.y + e.bottom && bottom > me.y + e.top)) return null;
  const hit = def.pierce && def.finisher ? { ...def, damage: def.damage * (def.pierce.hits - 1) + def.finisher.damage, baseLaunch: def.finisher.baseLaunch, directionalLaunch: def.finisher.directionalLaunch } : def;
  return {
    kind: 'projectile', contactIn, endIn: contactIn + (e.hw * 2 + hb.w + 2 * pull) / speed, box: null, top, bottom, from: -dirp,
    severity: severity(S, hit, -dirp), unblockable: !!def.unblockable, shot: p, delay, def,
  };
}

// How long attack `def`, once under way, travels before its strike can
// touch the CPU: a roll or a homing dash covering the gap, a plunge or a
// lift the height between; 0 for one that strikes where it stands.
function travelTime(S, def) {
  const m = def.motion;
  if (!m || m.type === 'hover') return 0;
  const fv = S.fv;
  const hb = def.hitbox;
  const e = S.me;
  if (m.type === 'roll' || m.type === 'homing') {
    const face = fv.facing;
    const front = face > 0 ? fv.x + hb.x + hb.w : fv.x - hb.x - hb.w;
    const gap = face > 0 ? S.x - e.hw - front : front - (S.x + e.hw);
    const speed = m.type === 'roll' ? Math.max(Math.abs(fv.vx), m.speed) : m.speed;
    return Math.max(0, gap) / speed;
  }
  if (m.type === 'bounce') return Math.max(0, S.y + e.top - (fv.y + hb.y + hb.h)) / m.fallSpeed;
  return Math.max(0, fv.y + hb.y - (S.y + e.bottom)) / m.speed;
}

// Every threat the CPU has perceived, soonest first.
export function assessThreats(S) {
  const out = [];
  if (!S.foeIn) return out;
  const fv = S.fv;
  const foe = S.foe;
  const mine = hurtBoxAt(S.me, S.x, S.y, 6);
  const def = fv.atkDef;
  if (def && !fv.atkHasHit) {
    if (def.projectile && !def.hitbox) {
      const proj = foe.projectileDefs[def.projectile.id];
      if (proj && fv.atkTime < def.projectile.spawnAt) {
        const o = def.projectile.offset ?? { x: 0, y: 0 };
        const face = sign(S.x - fv.x) || fv.facing;
        const shot = { x: fv.x + o.x * face, y: fv.y + o.y, vx: proj.speed * face, def: proj, age: 0 };
        const t = projectileThreat(S, shot, Math.max(0, def.projectile.spawnAt - fv.atkTime));
        if (t) out.push({ ...t, kind: 'throw', ref: fv.atkRef });
      }
    } else if (def.hitbox) {
      const endIn = def.startup + def.active - fv.atkTime;
      if (endIn > 0) {
        const reach = attackReach(def);
        // An ordinary strike aimed by its fighter may turn to the CPU.
        const face = def.motion ? fv.facing : sign(S.x - fv.x) || fv.facing;
        const box = boxAt(reach, fv.x, fv.y, face);
        let near = overlap(box, mine);
        if (def.motion?.type === 'homing') {
          const d = Math.hypot(S.x - fv.x, (S.y - S.height / 2) - (fv.y - fv.height / 2));
          near = d < def.motion.range + 40 && (S.x - fv.x) * fv.facing > -10;
        }
        if (near) {
          const from = sign(fv.x - S.x) || -S.facing;
          const contactIn = Math.min(endIn, Math.max(0, def.startup - fv.atkTime) + travelTime(S, def));
          const hits = def.hits;
          const hit = hits ? { ...hits[hits.length - 1], damage: def.damage } : def;
          out.push({
            kind: 'melee', contactIn, endIn, box, top: box.y, bottom: box.y + box.h, from, severity: severity(S, hit, from),
            unblockable: !!def.unblockable, def, multi: !!hits, ref: fv.atkRef,
          });
        }
      }
    }
  }
  if (fv.techDef && fv.techPhase === 'cast') {
    const t = fv.techDef;
    const startIn = fv.techReleaseIn;
    if (t.burst) {
      const box = boxAt(t.burst.hitbox, fv.x, fv.y, fv.techFacing);
      if (overlap(box, mine)) {
        const from = sign(fv.x - S.x) || -S.facing;
        out.push({
          kind: 'technique', contactIn: startIn, endIn: startIn + 2 * STEP, box, top: box.y, bottom: box.y + box.h, from,
          severity: severity(S, t.burst.hit, from) + 4, unblockable: !!t.burst.hit.unblockable, def: t.burst.hit, cast: true,
          ref: fv.techRef,
        });
      }
    }
    const spec = t.projectile;
    const proj = spec && foe.projectileDefs[spec.id];
    if (proj) {
      const f = fv.techFacing;
      const shot = { x: fv.x + spec.offset.x * f, y: fv.y + spec.offset.y, vx: proj.speed * f, def: proj, age: 0 };
      const th = projectileThreat(S, shot, startIn);
      if (th) out.push({ ...th, kind: 'technique', severity: th.severity + 4, cast: true, ref: fv.techRef });
    }
  }
  for (const p of S.projectiles) {
    if (!p.hostile) continue;
    const th = projectileThreat(S, p, 0);
    if (th) out.push({ ...th, ref: p.ref });
  }
  for (const c of S.clones) {
    if (!c.alive || c.hasHit || c.phase === 'vanish' || c.target !== S.self) continue;
    const def = c.attackDef;
    if (!def.hitbox) continue;
    const lead = c.phase === 'appear' ? c.cloudDuration - c.time : -c.attackTime;
    const endIn = lead + def.startup + def.active;
    if (endIn <= 0) continue;
    const box = boxAt(def.hitbox, c.x, c.y, c.facing);
    if (!overlap(box, mine)) continue;
    const from = sign(box.x + box.w / 2 - S.x) || -S.facing;
    out.push({
      kind: 'clone', contactIn: Math.max(0, lead + def.startup), endIn, box, top: box.y, bottom: box.y + box.h, from,
      severity: severity(S, def, from), unblockable: !!def.unblockable, def, ref: c,
    });
  }
  out.sort((a, b) => a.contactIn - b.contactIn);
  return out;
}

// Whether the Deflect, pressed after `delay` seconds while the CPU's own
// arc is `arc(t)` ({ x, y } feet, t from now), would catch shot `threat`
// while live, before the shot reaches its body.
export function deflectCatches(S, threat, delay = 0, arc = (t) => selfAt(S, t)) {
  const d = S.k.deflect;
  const shot = threat.shot;
  if (!d || !d.catches || !shot) return false;
  const atk = d.atk;
  if (threat.contactIn < delay + atk.startup - 1 / 120) return false;
  const hb = atk.hitbox;
  const ph = shot.def.hitbox;
  const dirp = sign(shot.vx);
  for (let t = delay + atk.startup; t < delay + atk.startup + atk.active - 1e-6; t += STEP) {
    const flown = t - (threat.delay ?? 0);
    if (flown < 0) continue;
    const at = arc(t);
    const px = shot.x + shot.vx * flown;
    const face = sign(px - at.x) || sign(S.fx - at.x) || S.facing;
    const box = boxAt(hb, at.x, at.y, face);
    const pbox = { x: dirp > 0 ? px + ph.x : px - ph.x - ph.w, y: shot.y + ph.y, w: ph.w, h: ph.h };
    if (overlap(box, pbox)) return true;
  }
  return false;
}

// From the ground: a jump (and which kind) and when to press the Deflect
// in the air so it catches shot `threat`: { jumpIn, deflectIn, kind } (s
// from now), searched over a few frames; null when none works.
export function jumpDeflectPlan(S, threat) {
  const d = S.k.deflect;
  if (!d || !d.catches || !threat.shot || !S.grounded) return null;
  for (const kind of ['normal', 'high']) {
    for (let j = 0; j <= 18; j += 1) {
      const jumpIn = j * STEP;
      if (jumpIn > threat.contactIn) break;
      for (let e = 2; e <= 16; e += 1) {
        const deflectIn = jumpIn + e * STEP;
        if (deflectIn + d.atk.startup > threat.contactIn + 0.02) break;
        const arc = (t) => (t <= jumpIn ? { x: S.x, y: S.y } : jumpArc({ x: S.x, y: S.y, vx: 0, vy: 0 }, kind, 0, t - jumpIn, S.g));
        if (!deflectCatches(S, threat, deflectIn, arc)) continue;
        // Its body clear of the shot until then.
        return { jumpIn, deflectIn, kind };
      }
    }
  }
  return null;
}

// What turning shot `threat` back at its thrower is worth: what it would
// do to them, if it can reach them before it dies.
function reflectWorth(S, threat) {
  const shot = threat.shot;
  if (!shot || !S.foeIn) return 0;
  const dist = Math.abs(S.fx - S.x);
  const left = shot.def.lifetime - Math.max(0, shot.age ?? 0) - threat.contactIn;
  if (left * Math.abs(shot.vx) < dist) return 0.5;
  return Math.min(12, (shot.def.damage ?? 0) + (shot.def.baseLaunch ?? 0) * 2) * 0.5;
}

// Every legal answer to `threat`, each { value, plan }; the best is taken
// by the planner (after its level's noise). Values are what the outcome
// is worth, a hit taken counting against.
export function defenseOptions(S, threat) {
  const p = S.profile;
  const out = [];
  const pHit = 0.9;
  const sev = threat.severity;
  // Take it, bending the launch toward the stage's middle.
  out.push({ value: -sev * pHit, plan: { kind: 'brace', until: S.clock + Math.max(0.1, threat.endIn), threat } });

  const self = S.self;
  const free = S.canAct;

  // Shield: on the ground, against what a Shield stops.
  if (S.grounded && S.k.shield && !threat.unblockable && self.shieldAllowed() && (free || S.shielding)) {
    const perfect = S.rng() < p.perfectShield && S.k.shield.perfectWindow > 0;
    let v = -energyCost(S, 15);
    if (threat.def?.blockPush > 0) {
      const toward = -threat.from;
      const room = toward > 0 ? S.floor.x + S.floor.w - S.x : S.x - S.floor.x;
      if (room < 120) v -= (120 - room) / 40;
    }
    // A blocked melee blow stalls in a Shield that stalls: a punish.
    if (threat.kind === 'melee' && (S.k.shield.stall > 0 || perfect)) v += 2.5 * p.punish;
    // Holding up a whole string is one block (the first stops it).
    const linger = 0.03 + (1 - p.defense) * 0.12;
    const lead = perfect ? Math.max(0.01, S.k.shield.perfectWindow * 0.45) : 0.12 + (1 - p.defense) * 0.12;
    out.push({
      value: v + 0.3,
      plan: {
        kind: 'shield', raiseAt: S.clock + Math.max(0, threat.contactIn - lead), until: S.clock + Math.min(threat.endIn + linger, 0.9),
        threat, perfect,
      },
    });
  }

  // Jump over it: clear its top from the moment it can touch until it is
  // over, then come down clear of it.
  if (S.grounded && free && Number.isFinite(threat.top)) {
    for (const kind of ['normal', 'high']) {
      let clear = threat.endIn < 0.9;
      for (let t = threat.contactIn; clear && t <= threat.endIn + 1e-6; t += 2 * STEP) {
        const a = jumpArc({ x: S.x, y: S.y, vx: 0, vy: 0 }, kind, 0, t, S.g);
        if (a.y >= S.y || a.y > threat.top - 2) clear = false;
      }
      if (clear) {
        // Over a projectile it is safe; over a strike it lands near the
        // attacker (a chance to punish its recovery).
        let v = threat.kind === 'projectile' || threat.kind === 'throw' ? 0.4 : -0.6;
        v += kind === 'high' ? -0.2 : 0;
        out.push({ value: v, plan: { kind: 'evade', how: 'jump', jump: kind, dir: 0, threat } });
        break;
      }
    }
  }

  // Step away from the side it comes from, if walking clears it in time.
  if (threat.box && S.grounded && free) {
    const away = threat.from > 0 ? -1 : 1;
    const need = away < 0 ? S.x + S.me.hw - threat.box.x + 2 : threat.box.x + threat.box.w - (S.x - S.me.hw) + 2;
    const mv = self.movement;
    const t = Math.max(0, threat.contactIn - STEP);
    const ta = mv.maxSpeed / mv.acceleration;
    const walk = t < ta ? 0.5 * mv.acceleration * t * t : 0.5 * mv.acceleration * ta * ta + mv.maxSpeed * (t - ta);
    if (need > 0 && walk > need && S.groundAhead(away, need + 30)) {
      out.push({ value: -0.2 - (threat.cast ? 0 : 0.2), plan: { kind: 'evade', how: 'step', dir: away, until: S.clock + threat.endIn + 0.05, threat } });
    }
    // A Dash away: longer, paid in Energy.
    const dash = S.k.dash;
    if (dash && S.movementReady(false) && !S.exhausted && threat.contactIn > 3 * STEP && S.groundAhead(away, dash.distance + 30)) {
      const dashNeed = Math.max(0, need - dash.distance);
      if (dashNeed <= mv.maxSpeed * Math.max(0, threat.contactIn - 4 * STEP - dash.distance / mv.dashSpeed)) {
        out.push({ value: -0.4 - energyCost(S, dash.cost), plan: { kind: 'evade', how: 'dash', dir: away, threat } });
      }
    }
  }

  // The Deflect: in the air, a shot its box would meet while live.
  const d = S.k.deflect;
  if (d && threat.shot && !S.grounded && free && S.moveReady(d) && deflectCatches(S, threat, 0)) {
    out.push({
      value: 0.6 + reflectWorth(S, threat) - energyCost(S, d.energy) * 0.6,
      plan: { kind: 'strike', move: d, threat, reason: 'deflect' },
    });
  }
  // From the ground: jump into its path and Deflect it.
  if (d && threat.shot && S.grounded && free && !S.exhausted && p.deflect > 0.2 && threat.contactIn > 0.12) {
    const jd = jumpDeflectPlan(S, threat);
    if (jd) {
      out.push({
        value: 0.2 + reflectWorth(S, threat) - energyCost(S, d.energy) * 0.6 - (1 - p.deflect) * 3,
        plan: { kind: 'jumpDeflect', at: S.clock, ...jd, threat },
      });
    }
  }

  // Strike first: a startup or a cast is broken by a hit.
  if (free && S.foeIn && (threat.kind === 'melee' || threat.kind === 'throw' || threat.cast)) {
    for (const m of S.k.moves) {
      if (m.kind !== 'melee' && m.kind !== 'deflect') continue;
      if (!S.moveReady(m) || (m.kind === 'deflect' && S.grounded)) continue;
      if (m.startup >= threat.contactIn - STEP) continue;
      const fit = moveFit(S, m);
      if (!fit || fit.t >= threat.contactIn - STEP) continue;
      const v = hitWorth(S, m, { at: S.fv }) * (0.5 + 0.5 * p.punish) - punishCost(S, m.exposure) * 0.3;
      out.push({ value: v, plan: { kind: 'strike', move: m, reason: 'interrupt' } });
    }
  }

  // Duck a shot inside a move that makes its fighter a smaller target (a
  // roll's ball): its own hurtboxes pass under the shot.
  if (free && S.grounded && threat.shot) {
    for (const m of S.k.ground) {
      if (m.kind !== 'melee' || !m.atk.hurtboxes || !S.moveReady(m)) continue;
      const top = Math.min(...m.atk.hurtboxes.map((h) => h.y));
      if (!(threat.bottom < S.y + top - 2) || m.total < threat.endIn) continue;
      const fit = moveFit(S, m);
      out.push({ value: 0.7 + (fit ? hitWorth(S, m, { at: S.fv }) * 0.5 : 0), plan: { kind: 'strike', move: m, reason: 'under' } });
    }
  }

  // Meet a shot with one of its own that erases or turns it back.
  if (free && S.grounded && threat.shot && S.foeIn) {
    for (const m of S.k.moves) {
      if (!m.proj || !(m.proj.erase || m.proj.repel) || !S.moveReady(m)) continue;
      if (m.startup >= threat.contactIn - 0.05) continue;
      if (m.proj.repel && threat.def?.erase) continue;
      const counter = shotFit(S, m);
      out.push({ value: 0.5 + (counter ? 3 : 0), plan: { kind: 'strike', move: m, reason: 'counterShot' } });
    }
  }
  return out;
}

// The best answer to the soonest threat it can still answer, or null when
// there is nothing to answer (or nothing better than what it is doing).
export function chooseDefense(S, threats, pick) {
  const threat = threats.find((t) => t.contactIn <= DEFENSE_HORIZON && t.endIn > 0);
  if (!threat) return null;
  const options = defenseOptions(S, threat);
  return pick(options);
}
