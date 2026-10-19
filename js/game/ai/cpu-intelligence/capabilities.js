// CPU Intelligence, layer 1: the universal capability analyzer.
//
// Purpose: turn any fighter's resolved definition into an actionable model
// of everything it can do, so one intelligence plays every fighter. Built on
// readMoveset (js/game/ai/moveset.js: which buttons start which moves, with
// their art checked), it resolves for every move its button and attack id,
// where it may start (ground or air), its timing and commitment, its
// strikes (damage, Base Launch, Directional Launch, stuns, hit effects), its
// reach over its own motion and pull, its projectile, burst or impact, the
// heal it gives its own fighter, its costs
// and limits, its classification (`offense`: whether it is an attack, a
// defense or both, read from the shared js/game/combat/offense.js, so a
// technique, a summon, a throw and the Deflect are attacks here exactly as
// they are in combat) and the roles it can play. Roles are derived from
// those properties, never from a button or a fighter: a fast, short, cheap
// strike is a poke whoever throws it, a rising strike an anti-air, a slow
// lingering projectile a trap. No role gets past a Shield: every attack is
// blockable, so the intelligence never plans on one that would.
//
// Inputs: a Fighter (its resolved attacks, projectiles, summons, techniques,
// defense, Deflect, Energy rules and SpriteSet).
// Outputs: analyzeCapabilities (cached per fighter, rebuilt if its
// definition or art changes), moveReady (live availability: cooldowns,
// airtime limits, Energy, free to act) and MOVE_ROLES.
// Important constraints: read-only. Immutable data is cached; anything that
// changes from step to step (cooldowns, Energy, air uses, free fall) is read
// live by moveReady every time a move is considered. Nothing here names a
// fighter, a button's role or a numbered attack.

import { readMoveset } from '../moveset.js';
import { attackReach } from '../../combat/attacks.js';
import { attackOffense, summonOffense, techniqueOffense } from '../../combat/offense.js';

// Every role a move can be given (a move may have several at once).
export const MOVE_ROLES = Object.freeze([
  'poke', 'approach', 'launcher', 'comboStarter', 'comboExtender', 'finisher', 'antiAir', 'airToGround', 'edgeGuard',
  'zoning', 'trap', 'punish', 'counterProjectile', 'mobility', 'recovery', 'shieldPressure', 'areaDenial',
  'defensiveDisengage', 'spike', 'heal',
]);

const CACHE = new WeakMap();

// One strike as the intelligence weighs it.
function strikeOf(h, at, end) {
  return Object.freeze({
    at, end, damage: h.damage ?? 0, baseLaunch: h.baseLaunch ?? 0, dir: h.directionalLaunch ?? null,
    hitbox: h.hitbox ?? null, hitstun: h.hitstun ?? 0, blockstun: h.blockstun ?? 0, hitstop: h.hitstop ?? 0,
    paralyze: h.paralyze ?? 0, blockPush: h.blockPush ?? 0, carry: h.carry ?? null, quake: !!h.quake,
    charm: h.charm ?? 0,
  });
}

// A slam's impact (see `slam` in js/game/combat/attacks.js) as the
// intelligence weighs it: its box round the landing point and its strike,
// which lands whenever the plunge does (`at` is the earliest: the plunge's
// start).
function impactOf(atk) {
  const impact = atk.motion?.type === 'slam' ? atk.motion.impact : null;
  if (!impact) return null;
  return Object.freeze({ box: impact.hitbox, strike: strikeOf(impact.hit, atk.startup, atk.startup + atk.active) });
}

// An attack's strikes in order: a multi-hit attack's each, else its one.
function attackStrikes(atk) {
  if (atk.hits) return atk.hits.map((h) => strikeOf(h, h.at, h.at + h.active));
  if (!atk.hitbox) return [];
  return [strikeOf(atk, atk.startup, atk.startup + atk.active)];
}

// A projectile's strikes: every strike of a piercing one, its last its
// finisher; `at` counts from its release.
function projectileStrikes(proj) {
  if (!proj.pierce) return [strikeOf(proj, 0, proj.lifetime)];
  const out = [];
  for (let i = 0; i < proj.pierce.hits; i++) {
    const last = i === proj.pierce.hits - 1;
    const hit = last && proj.finisher ? proj.finisher : proj;
    out.push(strikeOf(hit, i * proj.pierce.interval, proj.lifetime));
  }
  return out;
}

function projectileModel(proj, spawnAt, offset) {
  const strikes = projectileStrikes(proj);
  return Object.freeze({
    def: proj, id: proj.id, speed: proj.speed, lifetime: proj.lifetime, range: proj.speed * proj.lifetime,
    spawnAt, offset: { x: offset?.x ?? 0, y: offset?.y ?? 0 }, hitbox: proj.hitbox,
    pierce: proj.pierce, pull: proj.pull, repel: !!proj.repel, erase: !!proj.erase,
    carry: proj.carry, strikes, damage: strikes.reduce((n, s) => n + s.damage, 0),
  });
}

// Summary numbers over a list of strikes.
function sumStrikes(strikes) {
  let damage = 0;
  let maxBaseLaunch = 0;
  let hitstun = 0;
  let paralyze = 0;
  let charm = 0;
  let blockPush = 0;
  for (const s of strikes) {
    damage += s.damage;
    maxBaseLaunch = Math.max(maxBaseLaunch, s.dir ? s.baseLaunch : 0);
    hitstun = Math.max(hitstun, s.hitstun);
    paralyze = Math.max(paralyze, s.paralyze);
    charm = Math.max(charm, s.charm);
    blockPush = Math.max(blockPush, s.blockPush);
  }
  const last = strikes[strikes.length - 1];
  return {
    damage, maxBaseLaunch, hitstun, paralyze, charm, blockPush,
    finisher: last ? { baseLaunch: last.baseLaunch, dir: last.dir } : { baseLaunch: 0, dir: null },
  };
}

// The roles a move can play, from its own properties (see MOVE_ROLES).
// `height` is its fighter's body height, `fastest` its kit's quickest lead.
function rolesOf(m, height, fastest) {
  const r = new Set();
  const melee = m.kind === 'melee' || m.kind === 'deflect';
  const reach = m.reach;
  const shot = m.projectile;
  const fin = m.finisher;
  const motion = m.motion;
  if (melee && m.lead <= Math.max(0.13, fastest * 1.25) && m.commitment <= 0.4) r.add('poke');
  if (melee && (m.lead <= Math.max(0.17, fastest * 1.6) || m.damage >= 5)) r.add('punish');
  if (motion === 'homing' || motion === 'roll' || m.step) r.add('approach');
  const plunge = motion === 'bounce' || motion === 'slam';
  if (m.maxBaseLaunch >= 2 || (fin.dir === 'vertical' && fin.baseLaunch >= 1)) r.add('launcher');
  if (m.hitCancel != null || m.paralyze > 0 || m.pull || m.strikes.some((s) => s.baseLaunch === 0 && s.damage > 0)) r.add('comboStarter');
  if (m.air && melee && (m.hitCancel != null || motion === 'hover' || m.pull)) r.add('comboExtender');
  if ((fin.dir === 'horizontal' && fin.baseLaunch >= 2) || m.maxBaseLaunch >= 3 || m.damage >= 10) r.add('finisher');
  if (reach && (reach.y <= -height * 1.05 || (motion === 'rise') || (fin.dir === 'vertical' && reach.y <= -height * 0.8))) r.add('antiAir');
  if (m.air && reach && (reach.y + reach.h >= -12 || plunge)) r.add('airToGround');
  if (m.air && melee && (fin.dir === 'reverseVertical' || (fin.dir === 'horizontal' && fin.baseLaunch >= 1) || motion === 'homing')) r.add('edgeGuard');
  if (shot && shot.range >= 250) r.add('edgeGuard');
  if (shot && shot.range >= 250) r.add('zoning');
  if ((shot && ((shot.speed <= 420 && shot.lifetime >= 1) || shot.pull || shot.pierce)) || m.paralyze > 0 || m.kind === 'summon') r.add('trap');
  if (m.deflectProjectiles || shot?.repel || shot?.erase) r.add('counterProjectile');
  if (motion === 'homing' || motion === 'roll' || motion === 'rise' || plunge || m.step ||
      (motion === 'hover' && m.air && m.total >= 0.3)) r.add('mobility');
  if (m.air && (motion === 'rise' || motion === 'homing' || (motion === 'hover' && m.total >= 0.3))) r.add('recovery');
  if (m.blockPush > 0 || m.strikes.length > 1 || shot?.pierce) r.add('shieldPressure');
  if (m.burst || m.impact || (m.pull && m.pull.radius >= 120) || (shot && shot.lifetime >= 1)) r.add('areaDenial');
  if (m.passThrough || motion === 'rise' || shot?.repel) r.add('defensiveDisengage');
  if (fin.dir === 'reverseVertical' && fin.baseLaunch > 0) r.add('spike');
  // A heal of its own (Launch Point back): a move for a safe moment, never
  // a strike (see CpuIntelligence.healPlan).
  if (m.heal > 0) r.add('heal');
  return r;
}

// A move built from an ordinary attack (melee or ranged) or the Deflect.
function attackMove(kind, action, air, id, atk, proj, energyCost = 0) {
  const strikes = attackStrikes(atk);
  const projectile = proj ? projectileModel(proj, atk.projectile.spawnAt, atk.projectile.offset) : null;
  const impact = impactOf(atk);
  const sum = sumStrikes(projectile ? projectile.strikes : impact ? [...strikes, impact.strike] : strikes);
  const lead = projectile ? atk.projectile.spawnAt : strikes[0]?.at ?? atk.startup;
  return {
    key: `${action}:${air ? 'air' : 'ground'}`, kind, action, id, air, def: atk, offense: attackOffense(atk),
    startup: atk.startup, active: atk.active, recovery: atk.recovery, total: atk.total,
    lead, commitment: atk.total, strikes, projectile, burst: null, summon: null, impact, heal: 0, ...sum,
    blockstun: Math.max(0, ...(projectile ? projectile.strikes : strikes).map((s) => s.blockstun)),
    hitstop: Math.max(0, ...(projectile ? projectile.strikes : strikes).map((s) => s.hitstop)),
    reach: projectile ? null : attackReach(atk), hitbox: atk.hitbox,
    motion: atk.motion?.type ?? null, motionSpec: atk.motion ?? null, pull: atk.pull ?? projectile?.pull ?? null,
    cooldown: atk.cooldown, abilityCooldown: 0, airUses: atk.airUses, freeFall: !!atk.freeFall,
    groundOnly: !!atk.groundOnly, hitCancel: atk.hitCancel, energyCost,
    lockMovement: atk.lockMovement, momentum: atk.momentum, airMomentum: atk.airMomentum,
    control: atk.control, airControl: atk.airControl, friction: atk.friction, step: atk.step,
    passThrough: !!atk.passThrough, deflectProjectiles: !!atk.deflectProjectiles, carry: atk.carry,
  };
}

// A technique: a cast that releases a projectile, a burst round the
// fighter, a heal of its own (`heal`, Launch Points), or any of them
// together, its fighter committed throughout.
function techniqueMove(f, special, sprites) {
  const t = f.techniqueDefs[special.id];
  const cast = sprites.duration(t.castAnimation);
  const release = sprites.duration(t.releaseAnimation);
  const proj = t.projectile ? f.projectileDefs[t.projectile.id] : null;
  const projectile = proj ? projectileModel(proj, cast, t.projectile.offset) : null;
  const burstHit = t.burst?.hit ?? null;
  const strikes = burstHit ? [strikeOf(burstHit, cast, cast + 1 / 60)] : [];
  const sum = sumStrikes([...strikes, ...(projectile ? projectile.strikes : [])]);
  return {
    key: `${special.action}:ground`, kind: 'technique', action: special.action, id: special.id, air: false, def: t,
    offense: techniqueOffense(t),
    startup: cast, active: 1 / 60, recovery: release, total: cast + release, lead: cast, commitment: cast + release,
    strikes, projectile, burst: t.burst ? { box: t.burst.hitbox, hit: burstHit } : null, summon: null,
    impact: null, heal: t.heal ?? 0, ...sum,
    blockstun: burstHit?.blockstun ?? 0, hitstop: burstHit?.hitstop ?? 0, reach: t.burst ? { ...t.burst.hitbox } : null,
    hitbox: t.burst?.hitbox ?? null, motion: null, motionSpec: null, pull: projectile?.pull ?? null,
    cooldown: 0, abilityCooldown: t.cooldown, airUses: 0, freeFall: false, groundOnly: true, hitCancel: null,
    energyCost: 0, lockMovement: true, momentum: 0, airMomentum: 0, control: 0, airControl: 0, friction: 1, step: null,
    passThrough: false, deflectProjectiles: false, carry: null,
  };
}

// A summon: a clone of the fighter that appears behind its target and
// performs one of its attacks, after its owner's startup and its cloud.
function summonMove(f, special, entry) {
  const s = f.summonDefs[special.id];
  const atk = f.attacks[s.attack];
  const strikes = attackStrikes(atk).map((h) => strikeOf(h, h.at + entry.lead - atk.startup, h.end + entry.lead - atk.startup));
  const sum = sumStrikes(strikes);
  const startup = f.sprites.duration(s.startupAnimation);
  return {
    key: `${special.action}:ground`, kind: 'summon', action: special.action, id: special.id, air: false, def: s,
    offense: summonOffense(s, f.attacks),
    startup, active: 0, recovery: 0, total: startup, lead: entry.lead, commitment: startup, strikes, projectile: null,
    burst: null, summon: { def: s, attack: atk, behind: s.behindDistance, noGround: s.noGround }, impact: null, heal: 0, ...sum,
    blockstun: atk.blockstun, hitstop: atk.hitstop, reach: null, hitbox: atk.hitbox, motion: null, motionSpec: null,
    pull: null, cooldown: 0, abilityCooldown: s.cooldown, airUses: 0, freeFall: false, groundOnly: true, hitCancel: null,
    energyCost: 0, lockMovement: true, momentum: 0, airMomentum: 0, control: 0, airControl: 0, friction: 1, step: null,
    passThrough: false, deflectProjectiles: false, carry: null,
  };
}

// Everything fighter `f` can do, cached (see the header).
export function analyzeCapabilities(f) {
  const cached = CACHE.get(f);
  if (cached && cached.def === f.def && cached.sprites === f.sprites) return cached;
  const ms = readMoveset(f);
  const moves = [];
  for (const m of ms.melee) moves.push(attackMove('melee', m.action, m.air, m.id, m.atk, null));
  for (const r of ms.ranged) moves.push(attackMove('ranged', r.action, r.air, r.id, r.atk, r.proj));
  for (const c of ms.specials) {
    moves.push(c.type === 'technique' ? techniqueMove(f, c, f.sprites) : summonMove(f, c, c));
  }
  let deflect = null;
  if (ms.deflect) {
    deflect = attackMove('deflect', 'shield', true, ms.deflect.id, ms.deflect.atk, null, ms.deflect.cost);
    moves.push(deflect);
  }
  const height = f.def.collider.height;
  const fastest = Math.min(Infinity, ...moves.filter((m) => m.kind === 'melee').map((m) => m.lead));
  for (const m of moves) {
    m.roles = rolesOf(m, height, Number.isFinite(fastest) ? fastest : 0.1);
    Object.freeze(m);
  }
  const mv = f.movement;
  const g = 2500 * mv.gravityScale;
  const jumpHeight = (mv.jumpVelocity * mv.jumpVelocity) / (2 * g);
  const airJumpV = mv.jumpVelocity * mv.airJumpRatio;
  const shield = ms.groundShield && f.defense
    ? Object.freeze({
      perfectWindow: f.defense.perfectWindow, perfectRearm: f.defense.perfectRearm, stall: f.defense.stall,
      blockCost: f.energyDef.shieldHitCost,
    })
    : null;
  const roles = new Map(MOVE_ROLES.map((role) => [role, moves.filter((m) => m.roles.has(role))]));
  const caps = {
    def: f.def, sprites: f.sprites, moveset: ms, moves, deflect, shield, roles,
    ground: moves.filter((m) => !m.air), aerial: moves.filter((m) => m.air),
    hurt: ms.hurt, height, halfW: f.def.collider.width / 2,
    fastest: {
      ground: Math.min(Infinity, ...moves.filter((m) => !m.air && m.kind === 'melee').map((m) => m.lead)),
      air: Math.min(Infinity, ...moves.filter((m) => m.air && m.kind !== 'deflect').map((m) => m.lead)),
    },
    movement: Object.freeze({
      maxSpeed: mv.maxSpeed, acceleration: mv.acceleration, airAcceleration: mv.airAcceleration,
      jumpVelocity: mv.jumpVelocity, airJumpVelocity: airJumpV, airJumps: mv.airJumps, gravityScale: mv.gravityScale,
      jumpHeight, highJumpHeight: jumpHeight * mv.highJumpHeight, airJumpHeight: (airJumpV * airJumpV) / (2 * g),
      airtime: (2 * mv.jumpVelocity) / g, highJumpWindow: mv.highJumpWindow, fastFallSpeed: mv.fastFallSpeed,
      dash: ms.dash, airDash: ms.airDash, dashCancelTime: mv.dashCancelTime, attackBuffer: mv.attackBuffer,
    }),
    energy: f.energyDef,
    launchReaction: f.launchReaction,
  };
  CACHE.set(f, Object.freeze(caps));
  return caps;
}

// Whether move `m` could start for fighter `self` right now, read live:
// ground or air as it is, free to act (or to follow up out of an attack
// that hit or a Dash past its cancel time), its cooldown over, its starts
// for this airtime not used up, not in free fall, and, for the Deflect,
// not exhausted. A summon or technique needs the ground, a free fighter and
// its own cooldown over; a summon its opponent in play (it appears behind
// it), and so does any technique that strikes (the CPU attacks nobody), but
// not a heal of its own. The checks mirror the ones the Fighter makes when
// the button is pressed, so the CPU never presses what cannot start.
export function moveReady(self, m) {
  const grounded = self.body.grounded;
  const combat = self.combat;
  if (m.kind === 'technique' || m.kind === 'summon') {
    const gone = !!self.opponent?.lostToVoid;
    const pureHeal = m.kind === 'technique' && m.heal > 0 && !m.projectile && !m.burst;
    return grounded && self.canAct() && !combat.abilityCooldowns.active(m.id) && (!gone || pureHeal);
  }
  if (m.air === grounded) return false;
  if (!self.canFollowUp() || combat.cooldowns.has(m.id) || self.airStartBlocked(m.def)) return false;
  if (combat.attack && combat.attack.def.id === m.id) return false;
  if (m.kind === 'deflect') return !combat.energyExhausted;
  return true;
}
