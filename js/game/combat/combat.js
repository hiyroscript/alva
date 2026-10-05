// Hit resolution: the CombatSystem finds every hit each fixed step (melee
// hitboxes, projectiles, summoned clones, techniques) and applies it through
// one applyHit, the same for every fighter and every kind of attacker.
//
// Inputs: the fighters (their CombatState, hurtboxes and resolved
// definitions), the live projectiles and clones; Launch from
// js/data/launch.js.
// Outputs: CombatSystem (its per-step events drive the hit effects, the
// HUD and the scoring), worldBox, and how a fighter reacts to a launch
// (resolveLaunchReaction, resolveLaunchStun, steerLaunch).
// Important constraints: nothing here names a fighter, an attack or a
// move codename; every value comes from the hit's own definition
// (js/game/combat/attacks.js) and the target's. The attack schema lives in
// attacks.js, the defense schema in defense.js and the per-fighter state
// in combat-state.js.
//
// A hit's `damage` is added to the target's Launch Point
// (CombatState.launchPoint) first. Its launch strength is then exactly Base
// Launch x that new Launch Point, sent along its Directional Launch (see
// CombatSystem.applyHit). No Launch Point defeats a fighter: only the Void
// takes one out of play.
//
// A summon (see js/game/combat/summon.js) is a detached attacker: a temporary clone
// that performs one of its owner's attacks from its own position and facing.
// Its hits resolve through the same applyHit and credit the owner, but, like
// a projectile's, they never freeze the owner.
//
// A technique (see js/game/combat/technique.js) is performed by the fighter itself
// but is not an attack either: its sphere's contact, the
// ticks while it holds the target and its delayed explosion are its hits,
// resolved here through applyHit with their own data. They freeze only the
// target. A confirmed contact binds the target (CombatState.bind): a hold on
// it, separate from hitstun, that only the technique which placed it
// releases.

import { resolveLaunchStrength, resolveDirectionalLaunch } from '../../data/launch.js';
import { strikeLive } from './attacks.js';

// How a fighter responds to being launched (the character's
// `launchReaction`, every field optional; the defaults change nothing):
//
//   launchReaction: {
//     stunPerThousand: 0.2,  // extra hitstun, seconds per 1000 units/s of launch speed
//     maxStun: 0.7,          // ...never more than this
//     tumbleSpeed: 1100,     // launched at least this fast, it tumbles
//     steerAngle: 15,        // degrees a held direction may bend a launch
//   }
//
// None of it changes a launch's strength: Launch Point, Base Launch and the
// direction's own speed stay exactly as js/data/launch.js resolves them.
const NO_REACTION = Object.freeze({ stunPerThousand: 0, maxStun: 0, tumbleSpeed: Infinity, steerAngle: 0 });

export function resolveLaunchReaction(spec) {
  return Object.freeze({ ...NO_REACTION, ...spec });
}

// The extra hitstun a launch at `speed` (world units per second) adds for
// `reaction`: stunPerThousand per 1000 units/s, up to maxStun. A harder
// launch keeps its target helpless longer, so a big hit reads as one.
export function resolveLaunchStun(speed, reaction = NO_REACTION) {
  if (!(speed > 0)) return 0;
  return Math.min(reaction.maxStun, (speed / 1000) * reaction.stunPerThousand);
}

// Launch steering: `launch` (a world-space velocity { x, y }, y downward)
// bent toward the direction `held` ({ x, y }: -1, 0 or 1 each; y -1 is up)
// by up to `maxDegrees`. Only the part of `held` across the launch counts
// (the sine of the angle between them), so holding along it or against it
// bends nothing; the speed never changes. No launch, no direction or no
// angle: `launch` as it is.
export function steerLaunch(launch, held, maxDegrees) {
  const speed = Math.hypot(launch.x, launch.y);
  const hl = Math.hypot(held?.x ?? 0, held?.y ?? 0);
  if (!(speed > 0) || !(hl > 0) || !(maxDegrees > 0)) return launch;
  const lx = launch.x / speed;
  const ly = launch.y / speed;
  const across = lx * (held.y / hl) - ly * (held.x / hl);
  if (!across) return launch;
  const a = (across * maxDegrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Object.freeze({ x: (lx * c - ly * s) * speed, y: (lx * s + ly * c) * speed });
}

// World-space rectangle for a box defined relative to a fighter origin.
export function worldBox(fighter, box, out = {}) {
  const facing = fighter.facing;
  out.x = facing > 0 ? fighter.body.x + box.x : fighter.body.x - box.x - box.w;
  out.y = fighter.body.y + box.y;
  out.w = box.w;
  out.h = box.h;
  return out;
}

const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Where hitbox `hit` meets `target`'s hurtboxes: the centre of its overlap
// with the first one it touches ({ x, y }, world units), or null when it
// touches none. The point only places the hit's effects.
function strikePoint(hit, target) {
  for (const hb of target.hurtboxes ?? target.def.hurtboxes) {
    const box = worldBox(target, hb, scratchHurt);
    if (!intersects(hit, box)) continue;
    const x0 = Math.max(hit.x, box.x);
    const x1 = Math.min(hit.x + hit.w, box.x + box.w);
    const y0 = Math.max(hit.y, box.y);
    const y1 = Math.min(hit.y + hit.h, box.y + box.h);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }
  return null;
}

// The middle of `target`'s body, where a hit with no box of its own lands.
const bodyPoint = (target) => ({ x: target.body.x, y: target.body.y - target.body.height / 2 });

// What a fighter's strike carries its target along at (see `carry`).
const bodyVelocity = (f) => ({ x: f.body.vx, y: f.body.vy });

const scratchHit = {};
const scratchHurt = {};

// Resolves hits each simulation step: fighters' melee hitboxes, then live
// projectiles (see js/game/combat/projectile.js), then summoned clones (see
// js/game/combat/summon.js), then techniques (see js/game/combat/technique.js). A
// shielding target is struck exactly like any other (its own hurtboxes,
// never a bigger circle): applyHit decides the hit is blocked, and the
// hitbox is used up either way.
export class CombatSystem {
  constructor() {
    // { type: 'hit' | 'block', attacker, target, move, damage, energyCost,
    //   launchPointBefore, launchPointAfter, baseLaunch, directionalLaunch,
    //   launchStrength, finalLaunch, launchSpeed, hitstun, perfect, point,
    //   projectile, summon, technique }
    // `damage` is what the hit added to the target's Launch Point (0 on a
    // block), `move` the id of the attack or hit that dealt it and
    // `energyCost` what the target's Shield paid for it: shieldHitCost, or
    // whatever was left when that was less (0 on a hit).
    // `baseLaunch` is the hit's Base Launch (0-3) and `directionalLaunch` its
    // direction; `launchStrength` is baseLaunch x launchPointAfter (0 on a
    // block), and `finalLaunch` the world-space velocity { x, y } the target
    // was given: that strength at LAUNCH_UNIT_SPEED per point along the
    // direction (y grows downward; zero for no launch), bent by the
    // target's launch steering; `launchSpeed` its length and `hitstun` the
    // stun it dealt, a harder launch's longer. `perfect` marks a block by a
    // Shield raised just in time (see Fighter.perfectShield) and `point` is
    // where the hit landed, for the effects. `attacker` is the
    // owner for a projectile or clone hit; `projectile`, `summon` and
    // `technique` are null for the fighter's own melee.
    this.events = [];
  }

  update(fighters, projectiles = [], clones = []) {
    this.events.length = 0;
    for (const attacker of fighters) {
      const atk = attacker.combat.attack;
      if (!atk || attacker.combat.phase !== 'active') continue;
      if (atk.def.hits) {
        this.strike(attacker, atk, fighters);
        continue;
      }
      // A projectile attack has no melee hitbox: its damage is the projectile's.
      if (!atk.def.hitbox || atk.hasHit) continue;
      const hit = worldBox(attacker, atk.def.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker) continue;
        const point = strikePoint(hit, target);
        if (!point) continue;
        // One hit per attack, blocked or not; only a real hit (never a
        // block) opens its hitCancel.
        atk.hasHit = true;
        const event = this.applyHit(attacker, target, atk.def, { point, velocity: bodyVelocity(attacker) });
        atk.confirmed = event.type === 'hit';
        atk.confirmedAt = atk.time;
        attacker.attackContact?.(atk, event);
        break;
      }
    }
    for (const p of projectiles) {
      if (!p.alive) continue;
      const hit = p.hitbox(scratchHit);
      for (const target of fighters) {
        if (target === p.owner || !p.ready) continue;
        if (!strikePoint(hit, target)) continue;
        // One hit, then it is gone (a Shielded projectile included); a
        // piercing one strikes again every so often until its last strike,
        // its finisher (see js/game/combat/projectile.js).
        const def = p.nextHit;
        const event = this.applyHit(p.owner, target, def, {
          facing: p.direction, projectile: p, point: { x: p.x, y: p.y }, velocity: { x: p.vx, y: 0 },
        });
        p.struck(event.type === 'block');
        break;
      }
    }
    for (const c of clones) {
      // Only during the attack's active phase, and only once per attack.
      const hit = c.hitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === c.owner) continue;
        const point = strikePoint(hit, target);
        if (!point) continue;
        c.hasHit = true;
        // The clone's own facing, never the owner's: a horizontal launch
        // travels from the clone.
        this.applyHit(c.owner, target, c.attackDef, { facing: c.facing, summon: c, point });
        c.hitstop = c.attackDef.hitstop;
        break;
      }
    }
    for (const owner of fighters) {
      const t = owner.technique;
      if (!t) continue;
      // The ticks while it holds its target, one hit each: Launch Point
      // only, no launch. Never on the explosion's step (see
      // Technique.update).
      this.applyTicks(owner, t);
      // The delayed explosion, on the step its first frame shows: the target
      // is released first, then takes the big hit and its launch.
      if (t.explosionDue) {
        const target = t.takeExplosion();
        if (target) this.applyHit(owner, target, t.def.explosionHit, { facing: t.facing, technique: t });
        continue;
      }
      // The rushing sphere: only while dashing, and only until it connects.
      const hit = t.sphereHitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === owner) continue;
        const point = strikePoint(hit, target);
        if (!point) continue;
        // The contact, exactly once; the sphere stops searching after it. A
        // Shield blocks it and the technique ends there; otherwise the
        // target is bound and its first tick lands on this same step.
        const event = this.applyHit(owner, target, t.def.firstHit, { facing: t.facing, technique: t, point });
        const ended = t.contact(target, event.type === 'block');
        if (ended) owner.endTechnique(ended);
        else this.applyTicks(owner, t);
        break;
      }
    }
    return this.events;
  }

  // A multi-hit attack's strikes (see `hits` above) this step: each one
  // live in its own window, at most once, on the first opponent its box
  // meets. Any real hit confirms the attack (its hitCancel counts from the
  // first); a blocked strike ends the string, so no later one strikes.
  strike(attacker, atk, fighters) {
    atk.struck ??= new Set();
    for (const h of atk.def.hits) {
      if (atk.blocked) return;
      if (atk.struck.has(h.index) || !strikeLive(h, atk.time)) continue;
      const box = worldBox(attacker, h.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker) continue;
        const point = strikePoint(box, target);
        if (!point) continue;
        atk.struck.add(h.index);
        atk.hasHit = true;
        const event = this.applyHit(attacker, target, h, { point, velocity: bodyVelocity(attacker) });
        if (event.type === 'block') atk.blocked = true;
        else if (!atk.confirmed) {
          atk.confirmed = true;
          atk.confirmedAt = atk.time;
        }
        attacker.attackContact?.(atk, event);
        break;
      }
    }
  }

  // Every tick `t` has due this step, each one tickHit on its target.
  applyTicks(owner, t) {
    for (let target = t.takeTick(); target; target = t.takeTick()) {
      this.applyHit(owner, target, t.def.tickHit, { facing: t.facing, technique: t });
    }
  }

  // Shared by melee, projectiles, clones and techniques. `facing` is
  // the direction the hit travels: the attacker's facing for melee, the
  // projectile's own direction (fixed when thrown), the clone's facing
  // (fixed when summoned) or the technique's (fixed when it started). A
  // detached hit (a projectile's, a clone's or a technique's) freezes only
  // its target.
  //
  // A target whose Shield is up blocks the hit, whichever side it comes
  // from: no Launch Point, no launch and no hitstun, only the hit's hitstop
  // and its blockstun, held in the Shield. The Shield pays
  // energy.shieldHitCost for it, once, or all that is left when that is
  // less: a block that empties the bar exhausts the fighter and drops the
  // Shield straight away, so a later hit, even on this same step, lands in
  // full. The block itself stands.
  //
  // Otherwise the damage is added to the target's Launch Point first, so
  // the hit that raises it already launches from the new total. The launch
  // strength is exactly Base Launch x that Launch Point, sent along the
  // hit's Directional Launch at LAUNCH_UNIT_SPEED world units per second per
  // point (see js/data/launch.js). A hit that does not launch (Base Launch
  // 0 or no direction) leaves the target's velocity as it is. Returns the
  // event it recorded.
  //
  // A hit with `carry` (see above) that lands and launches nothing gives the
  // target `velocity`, what struck it (the attacker's body, a projectile),
  // less its `lift` upward: it is dragged along.
  applyHit(attacker, target, def, {
    facing = attacker.facing, projectile = null, summon = null, technique = null,
    detached = !!(projectile || summon || technique), point = bodyPoint(target), velocity = null,
  } = {}) {
    const tc = target.combat;
    const blocked = tc.shielding;
    // A perfect Shield (raised just in time, see Fighter.perfectShield)
    // blocks for free: no Energy and no blockstun, so its fighter can answer
    // at once.
    const perfect = blocked && !!target.perfectShield;
    let energyCost = 0;
    if (blocked && !perfect) {
      energyCost = Math.min(tc.energySpec.shieldHitCost, tc.energy);
      tc.spendEnergy(tc.energySpec.shieldHitCost);
      if (!tc.canShield()) tc.shielding = false;
    }
    const damage = blocked ? 0 : def.damage;
    const launchPointBefore = tc.launchPoint;
    tc.launchPoint = Math.max(0, launchPointBefore + damage);
    const launchPointAfter = tc.launchPoint;
    const launchStrength = blocked ? 0 : resolveLaunchStrength(def.baseLaunch, launchPointAfter);
    // The target may bend its launch a little with the direction it holds
    // as the hit lands (launch steering: never the strength, only the angle;
    // see steerLaunch), and a harder launch stuns it longer.
    // Standing on the ground, Down bends nothing: the floor is in the way.
    const reaction = target.launchReaction;
    const held = target.steerHeld && target.body.grounded && target.steerHeld.y > 0 ? { x: target.steerHeld.x, y: 0 } : target.steerHeld;
    const finalLaunch = steerLaunch(
      resolveDirectionalLaunch(def.directionalLaunch, launchStrength, facing), held, reaction?.steerAngle,
    );
    const launchSpeed = Math.hypot(finalLaunch.x, finalLaunch.y);
    const hitstun = def.hitstun > 0 ? def.hitstun + resolveLaunchStun(launchSpeed, reaction) : 0;
    // A hit with no stun or freeze of its own (a technique's tick)
    // leaves any already running as it is. A block's stun holds the Shield
    // only while it is still up.
    if (blocked) {
      if (tc.shielding && def.blockstun > 0 && !perfect) tc.shieldStun = def.blockstun;
    } else if (hitstun > 0) {
      tc.stun = hitstun;
    }
    if (def.hitstop > 0) tc.hitstop = def.hitstop;
    if (!detached) attacker.combat.hitstop = def.hitstop;
    // ...and a technique: no armour. It ends at once, releasing
    // whatever it held, before the launch below moves the fighter. So does
    // a summon's startup: the hurt pose shows on this very step, and no
    // clone comes of it.
    target.endTechnique?.('hit');
    target.cancelSummon?.();
    if (finalLaunch.x || finalLaunch.y) {
      // A launch replaces the target's sideways speed (a vertical one sends
      // it straight up or down) and, when it has one, its vertical speed.
      target.body.vx = finalLaunch.x;
      if (finalLaunch.y) {
        target.body.vy = finalLaunch.y;
        target.body.grounded = false;
      }
    } else if (!blocked && def.carry && velocity) {
      target.body.vx = velocity.x;
      target.body.vy = velocity.y - (def.carry.lift ?? 0);
      if (target.body.vy < 0) {
        target.body.grounded = false;
        target.body.ground = null;
      }
    }
    const event = {
      type: blocked ? 'block' : 'hit', attacker, target, move: def.id ?? null,
      damage, energyCost, launchPointBefore, launchPointAfter,
      baseLaunch: def.baseLaunch, directionalLaunch: def.directionalLaunch, launchStrength, finalLaunch,
      launchSpeed, hitstun: blocked ? 0 : hitstun, perfect, point,
      projectile, summon, technique,
    };
    // The target's own reaction to a real hit (its air jump back, see
    // Fighter.takeHit).
    if (!blocked) target.takeHit?.(event);
    this.events.push(event);
    return event;
  }
}
