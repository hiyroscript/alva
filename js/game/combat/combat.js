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
// A technique (see js/game/combat/technique.js) is performed by the fighter
// itself but is executed as no ordinary attack: the burst it releases round
// itself is its hit, resolved here through applyHit with its own data (what
// it throws is a projectile like any other). It freezes only its targets.
//
// A fighter's Deflect (see js/game/combat/deflect.js) is one of its attacks
// here, struck and blocked like any other; its hitbox's other job, turning
// projectiles back (`deflectProjectiles`), is settled first every step
// (deflectProjectiles), before any projectile can strike.
//
// However each is executed, every one of them is an attack (see
// js/game/combat/offense.js), and applyHit is the one place any attack
// reaches a fighter: melee strikes, a multi-hit string's, projectiles
// (thrown, cast or turned back), clones' strikes and techniques' bursts
// alike. It is also the one place a Shield is consulted, and it consults it
// unconditionally: a target whose Shield is up when a hit reaches it blocks
// that hit, whatever made it, whatever its damage, launch, size or speed
// and whichever side it comes from. Nothing declares its way past one
// (`unblockable` is refused as a hit is built). Nothing else writes a
// fighter's Launch Point upward, stuns it for a hit or paralyzes it.
//
// Beyond damage and launch, a hit may carry the shared hit effects (see
// js/game/combat/hit-effects.js): `paralyze` (a timed hold on the target,
// CombatState.paralyze, that a launch ends; never through a Shield),
// `blockPush` (a Shield that blocks it is shoved back, and nothing more),
// `quake` (it reaches only a fighter standing on the ground: every
// place below that a hit meets a fighter asks hitReaches first, so an
// airborne one is passed by with nothing used up) and `charm` (for a while
// the target's own hits on the attacker heal it instead: see applyHit).
// And a Shield may stall the blows it blocks (`defense.stall`, see
// js/game/combat/defense.js): a melee attacker freezes in it.

import { resolveLaunchStrength, resolveDirectionalLaunch } from '../../data/launch.js';
import { strikeLive } from './attacks.js';
import { hitReaches } from './hit-effects.js';

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

// Where a hit came from, and the attack, technique or summon that produced
// it (a projectile's thrower's, kept when it is turned back): for its event.
const sourceOf = (def, projectile, summon, technique) => (
  projectile ? 'projectile' : summon ? 'summon' : technique ? 'technique' : def.deflectProjectiles ? 'deflect' : 'melee'
);
const abilityOf = (def, projectile, summon, technique) => (
  projectile ? projectile.ability ?? null : summon ? summon.def?.id ?? null : technique ? technique.def?.id ?? null : def.id ?? null
);
const NO_LAUNCH = Object.freeze({ x: 0, y: 0 });

const scratchHit = {};
const scratchHurt = {};
const scratchBurst = {};
const scratchDeflect = {};
const scratchShot = {};

// Resolves hits each simulation step: first the projectiles a live
// `deflectProjectiles` hitbox turns back (see deflectProjectiles), then
// fighters' melee hitboxes (a slam's impact the step it lands among
// them, see impact), then live projectiles (see
// js/game/combat/projectile.js), then summoned clones (see
// js/game/combat/summon.js), then techniques' bursts (see
// js/game/combat/technique.js). A
// shielding target is struck exactly like any other (its own hurtboxes,
// never a bigger circle): applyHit decides the hit is blocked, and the
// hitbox is used up either way.
export class CombatSystem {
  constructor() {
    // { type: 'hit' | 'block' | 'charmed', attacker, target, move, damage,
    //   heal, energyCost, launchPointBefore, launchPointAfter, baseLaunch,
    //   directionalLaunch, launchStrength, finalLaunch, launchSpeed, hitstun,
    //   perfect, point, paralysis, charm, stall, projectile, summon,
    //   technique, attack, source, ability, redirected }
    // `damage` is what the hit added to the target's Launch Point (0 on a
    // block), `move` the id of the attack or hit that dealt it and
    // `energyCost` what the target's Shield paid for it: BLOCK_ENERGY_COST,
    // a perfect block's included, or whatever was left when that was less
    // (0 on a hit).
    // `baseLaunch` is the hit's Base Launch (0-3) and `directionalLaunch` its
    // direction; `launchStrength` is baseLaunch x launchPointAfter (0 on a
    // block), and `finalLaunch` the world-space velocity { x, y } the target
    // was given: that strength at LAUNCH_UNIT_SPEED per point along the
    // direction (y grows downward; zero for no launch), bent by the
    // target's launch steering; `launchSpeed` its length and `hitstun` the
    // stun it dealt, a harder launch's longer. `perfect` marks a block by a
    // Shield raised just in time (see Fighter.perfectShield) and `point` is
    // where the hit landed, for the effects. `paralysis` is the hold it put
    // on its target (seconds, 0 for none), `charm` the charm it put on it
    // (seconds, 0 for none) and `stall` how long a melee blow
    // the target's Shield blocked froze its attacker (0 for none). `attacker`
    // is the owner for a projectile or clone hit; `projectile`, `summon` and
    // `technique` are null for the fighter's own melee. `attack` is always
    // true (every hit is an attack's, blocked or not, whatever it did);
    // `source` is where it came from (ATTACK_SOURCES in
    // js/game/combat/offense.js: 'melee', 'deflect', 'projectile', 'summon'
    // or 'technique'), `ability` the id of the attack, technique or summon
    // that produced it (a projectile's thrower's, kept when it is turned
    // back) and `redirected` whether it is a projectile that was turned
    // back. A blocked hit is recorded as a block, never as a hit. A charmed
    // fighter's hit on its charmer is recorded as `charmed` (see applyHit):
    // `damage` 0, `heal` the Launch Point it took off the charmer instead.
    this.events = [];
    // { fighter, projectile, from, direction }: the projectiles turned back
    // this step (see deflectProjectiles), `from` the owner each one had.
    this.deflections = [];
  }

  update(fighters, projectiles = [], clones = []) {
    this.events.length = 0;
    this.deflections.length = 0;
    // Before anything strikes: a projectile caught by a live Deflect is the
    // deflecting fighter's own by the time projectiles strike below, so it
    // never hits the fighter that caught it.
    this.deflectProjectiles(fighters, projectiles);
    for (const attacker of fighters) {
      const atk = attacker.combat.attack;
      if (atk?.impactDue) this.impact(attacker, atk, fighters);
      if (!atk || attacker.combat.phase !== 'active') continue;
      if (atk.def.hits) {
        this.strike(attacker, atk, fighters);
        continue;
      }
      // A projectile attack has no melee hitbox: its damage is the projectile's.
      if (!atk.def.hitbox || atk.hasHit) continue;
      const hit = worldBox(attacker, atk.def.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker || !hitReaches(atk.def, target)) continue;
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
        if (target === p.owner || !p.ready || p.passed(target)) continue;
        if (!strikePoint(hit, target)) continue;
        // One hit, then it is gone; a piercing one strikes again every so
        // often until its last strike, its finisher, and an erasing one
        // that hits flies on through. A Shield that blocks any of them
        // stops it there, an erasing one included (see
        // js/game/combat/projectile.js). A quake flies on past a fighter
        // off the ground.
        const def = p.nextHit;
        if (!hitReaches(def, target)) continue;
        const event = this.applyHit(p.owner, target, def, {
          facing: p.direction, projectile: p, point: { x: p.x, y: p.y }, velocity: { x: p.vx, y: 0 },
        });
        p.struck(event.type === 'block', target);
        break;
      }
    }
    for (const c of clones) {
      // Only during the attack's active phase, and only once per attack.
      const hit = c.hitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === c.owner || !hitReaches(c.attackDef, target)) continue;
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
      // The burst a technique releases round itself, on the step it lets
      // go: its hit, once, on every opponent its box meets.
      const box = t?.takeBurst(scratchBurst);
      if (!box) continue;
      for (const target of fighters) {
        if (target === owner || !hitReaches(t.def.burst.hit, target)) continue;
        const point = strikePoint(box, target);
        if (point) this.applyHit(owner, target, t.def.burst.hit, { facing: t.facing, technique: t, point });
      }
    }
    return this.events;
  }

  // Every live projectile of another fighter's that meets the live hitbox
  // of an attack with `deflectProjectiles` (see js/game/combat/attacks.js)
  // during its active phase is turned back (Projectile.turnBack): from this
  // step it is that fighter's, flying away from it (to the side of it the
  // projectile is on, or the way it faces with the projectile level with
  // it) at its own speed, its strikes starting over, so it can strike its
  // old owner. The same projectile, never a copy, and never destroyed for
  // it. It is not a hit: no event, no freeze, nothing used up (the box may
  // turn back more than one, and still strike a fighter). Startup and
  // recovery turn nothing back.
  deflectProjectiles(fighters, projectiles) {
    if (!projectiles.length) return;
    for (const f of fighters) {
      const atk = f.combat.attack;
      if (!atk?.def.deflectProjectiles || f.combat.phase !== 'active') continue;
      const box = worldBox(f, atk.def.hitbox, scratchDeflect);
      for (const p of projectiles) {
        if (!p.alive || p.owner === f || !intersects(box, p.hitbox(scratchShot))) continue;
        const from = p.owner;
        const direction = Math.sign(p.x - f.body.x) || f.facing;
        p.turnBack(f, direction);
        this.deflections.push({ fighter: f, projectile: p, from, direction });
      }
    }
  }

  // A slam's impact, due the step it lands (see `slam` in
  // js/game/combat/attacks.js and Fighter.landSlam): its hit, once, on every
  // opponent its box meets round the landing point (a quake only on those
  // standing on the ground). The fighter's own blow, so it freezes it as a
  // melee hit does; a real hit confirms the attack (its hitCancel counts
  // from then), a block does not.
  impact(attacker, atk, fighters) {
    atk.impactDue = false;
    const impact = atk.def.motion?.impact;
    if (!impact) return;
    const box = worldBox(attacker, impact.hitbox, scratchBurst);
    for (const target of fighters) {
      if (target === attacker || !hitReaches(impact.hit, target)) continue;
      const point = strikePoint(box, target);
      if (!point) continue;
      atk.hasHit = true;
      const event = this.applyHit(attacker, target, impact.hit, { point });
      if (event.type === 'hit' && !atk.confirmed) {
        atk.confirmed = true;
        atk.confirmedAt = atk.time;
      }
    }
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
        if (target === attacker || !hitReaches(h, target)) continue;
        const point = strikePoint(box, target);
        if (!point) continue;
        atk.struck.add(h.index);
        atk.hasHit = true;
        const event = this.applyHit(attacker, target, h, { point, velocity: bodyVelocity(attacker) });
        if (event.type === 'block') atk.blocked = true;
        else if (event.type === 'hit' && !atk.confirmed) {
          atk.confirmed = true;
          atk.confirmedAt = atk.time;
        }
        attacker.attackContact?.(atk, event);
        break;
      }
    }
  }

  // Shared by melee, projectiles, clones and techniques: every attack's hit
  // on a fighter comes through here, and only here. `facing` is
  // the direction the hit travels: the attacker's facing for melee, the
  // projectile's own direction (fixed when thrown), the clone's facing
  // (fixed when summoned) or the technique's (fixed when it started). A
  // detached hit (a projectile's, a clone's or a technique's burst) freezes
  // only its target.
  //
  // A target whose Shield is up blocks the hit, whatever it is and whichever
  // side it comes from: no Launch Point, no launch, no hitstun, no
  // paralysis and no carry, only the hit's hitstop and its blockstun, held
  // in the Shield, and its blockPush. The Shield pays
  // BLOCK_ENERGY_COST (energy.shieldHitCost, the same for every fighter) for
  // it, once, or all that is left when that is less, a perfect block
  // exactly as any other: a block that empties the bar exhausts the fighter
  // and drops the Shield straight away, so a later hit, even on this same
  // step (hits resolve in the fixed order of update), lands in full. The
  // block itself stands: the Shield was up when it met it. A blocked hit
  // never reaches what only a real hit does (the target's technique or
  // summoning startup cut short, its takeHit).
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
  //
  // The hit effects (js/game/combat/hit-effects.js): a real hit that
  // `paralyze`s holds the target for that long (CombatState.paralyze)
  // unless it launches it: any launching hit ends a paralysis first, so the
  // launch is never held back; a blocked one paralyzes nobody. A blocked
  // hit with `blockPush` still shoves the Shield along the hit's direction
  // at that speed, and nothing more. And a melee blow the target's Shield
  // blocks stalls in it: the attacker is frozen for at least the Shield's
  // `stall` (a detached hit stalls nothing). A real hit that `charm`s
  // charms its target (CombatState.charmBy), whether it launches or not.
  //
  // A hit whose attacker is charmed by its target (its charm still running,
  // see `charm` in hit-effects.js) and that the target does not block is
  // no hit at all: see charmed. The Shield rule comes first all the same.
  applyHit(attacker, target, def, {
    facing = attacker.facing, projectile = null, summon = null, technique = null,
    detached = !!(projectile || summon || technique), point = bodyPoint(target), velocity = null,
  } = {}) {
    const tc = target.combat;
    // The universal Shield rule: up at contact, it blocks. Nothing about the
    // hit is consulted.
    const blocked = tc.shielding;
    // A perfect Shield (raised just in time, see Fighter.perfectShield)
    // blocks with no blockstun, so its fighter can answer at once; it pays
    // for the block like any other (no discount, nothing given back).
    const perfect = blocked && !!target.perfectShield;
    let energyCost = 0;
    if (blocked) {
      energyCost = Math.min(tc.energySpec.shieldHitCost, tc.energy);
      tc.spendEnergy(tc.energySpec.shieldHitCost);
      if (!tc.canShield()) tc.shielding = false;
    }
    if (!blocked && attacker?.combat?.charmedTo?.(target)) return this.charmed(attacker, target, def, { projectile, summon, technique, point });
    const damage = blocked ? 0 : def.damage;
    const launchPointBefore = tc.launchPoint;
    tc.launchPoint = Math.max(0, launchPointBefore + damage);
    // Every real hit restarts recovery, including non-launching strikes.
    // A block leaves the existing schedule untouched.
    if (!blocked) tc.resetLaunchRecovery();
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
    // A hit with no stun or freeze of its own leaves any already running
    // as it is. A block's stun holds the Shield
    // only while it is still up.
    if (blocked) {
      if (tc.shielding && def.blockstun > 0 && !perfect) tc.shieldStun = def.blockstun;
    } else if (hitstun > 0) {
      tc.stun = hitstun;
    }
    if (def.hitstop > 0) tc.hitstop = def.hitstop;
    if (!detached) attacker.combat.hitstop = def.hitstop;
    const stall = blocked && !detached ? target.defense?.stall ?? 0 : 0;
    if (stall > attacker.combat.hitstop) attacker.combat.hitstop = stall;
    // ...and a technique: no armour. A real hit ends it at once (whatever it
    // has not released yet never is), before the launch below moves the
    // fighter. So does a summon's startup: the hurt pose shows on this very
    // step, and no clone comes of it. A block is no hit.
    if (!blocked) {
      target.endTechnique?.('hit');
      target.cancelSummon?.();
    }
    // A launch ends a paralysis; a hit that paralyzes and launches nothing
    // holds the target.
    if (finalLaunch.x || finalLaunch.y) tc.releaseParalysis();
    else if (!blocked && def.paralyze > 0) tc.paralyze(def.paralyze);
    if (!blocked && def.charm > 0) tc.charmBy(def.charm, attacker);
    if (blocked && def.blockPush > 0) target.body.vx = facing * def.blockPush;
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
      paralysis: blocked || finalLaunch.x || finalLaunch.y ? 0 : def.paralyze ?? 0, charm: blocked ? 0 : def.charm ?? 0, stall,
      projectile, summon, technique, attack: true,
      source: sourceOf(def, projectile, summon, technique), ability: abilityOf(def, projectile, summon, technique),
      redirected: !!projectile?.redirected,
    };
    // The target's own reaction to a real hit (its air jumps back, see
    // Fighter.takeHit).
    if (!blocked) target.takeHit?.(event);
    this.events.push(event);
    return event;
  }

  // A charmed fighter's hit on the fighter that charmed it (see applyHit):
  // it heals that fighter, its Launch Point taken down by the hit's damage
  // (never below 0, see CombatState.heal), and does nothing else: no Launch
  // Point added, no launch, stun, freeze, paralysis, charm or carry, its
  // technique and Launch Point recovery left as they were, and no reaction
  // (takeHit). The attack that dealt it is used up as a hit's would be, but
  // never confirmed. Returns the `charmed` event it recorded.
  charmed(attacker, target, def, { projectile, summon, technique, point }) {
    const tc = target.combat;
    const launchPointBefore = tc.launchPoint;
    const heal = tc.heal(def.damage ?? 0);
    const event = {
      type: 'charmed', attacker, target, move: def.id ?? null,
      damage: 0, heal, energyCost: 0, launchPointBefore, launchPointAfter: tc.launchPoint,
      baseLaunch: def.baseLaunch, directionalLaunch: def.directionalLaunch, launchStrength: 0, finalLaunch: NO_LAUNCH,
      launchSpeed: 0, hitstun: 0, perfect: false, point, paralysis: 0, charm: 0, stall: 0,
      projectile, summon, technique, attack: true,
      source: sourceOf(def, projectile, summon, technique), ability: abilityOf(def, projectile, summon, technique),
      redirected: !!projectile?.redirected,
    };
    this.events.push(event);
    return event;
  }
}
