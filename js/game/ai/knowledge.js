// CPU Intelligence: combat knowledge, what every move is for.
//
// Purpose: turns a fighter's moveset (readMoveset, js/game/ai/moveset.js:
// what exists) into tactical descriptors (what it is for): each move's
// timing, reach, hit, safety, Energy and roles (fast punish, combo starter,
// launcher, anti-air, zoning, trap, pull, mobility, recovery, ...),
// inferred from its data alone. The same reading serves the CPU's own
// fighter and its picture of the opponent's (an opponent's moves are
// observable capabilities, never its inputs).
//
// Inputs: a Fighter. Outputs: knowFighter (cached per fighter and moveset),
// moveKey and the ROLES list.
// Important constraints: read-only, and never by a fighter's id or a
// move's player-facing name: a role comes from the move's mechanics.

import { readMoveset } from './moveset.js';

// Every tactical role a move may have (a move may have several).
export const ROLES = Object.freeze([
  'fast', 'comboStarter', 'comboExtender', 'launcher', 'finisher', 'antiAir', 'airToGround', 'groundPressure',
  'zoning', 'trap', 'pull', 'repel', 'erase', 'interceptProjectile', 'mobility', 'recovery', 'shieldPressure',
  'unblockable', 'aerialPursuit', 'counter', 'paralyze', 'heavy', 'poke',
]);

export const moveKey = (action, air) => `${action}:${air ? 'air' : 'ground'}`;

// The hit a move deals in full: its total damage, its finisher's launch,
// its stuns and its hit effects (any strike's).
function hitOf(def, strikes = def.hits ?? [def]) {
  const last = strikes[strikes.length - 1];
  return {
    damage: strikes.reduce((sum, h) => sum + (h.damage ?? 0), 0),
    first: strikes[0].damage ?? 0,
    baseLaunch: last.baseLaunch ?? def.baseLaunch ?? 0,
    direction: last.directionalLaunch ?? def.directionalLaunch ?? null,
    hitstun: Math.max(...strikes.map((h) => h.hitstun ?? def.hitstun ?? 0)),
    finisherStun: last.hitstun ?? def.hitstun ?? 0,
    blockstun: Math.max(...strikes.map((h) => h.blockstun ?? def.blockstun ?? 0)),
    hitstop: last.hitstop ?? def.hitstop ?? 0,
    unblockable: strikes.some((h) => h.unblockable ?? def.unblockable),
    paralyze: Math.max(...strikes.map((h) => h.paralyze ?? def.paralyze ?? 0)),
    blockPush: Math.max(...strikes.map((h) => h.blockPush ?? def.blockPush ?? 0)),
    strikes: strikes.length,
    carry: strikes.some((h) => h.carry ?? def.carry),
  };
}

// A projectile's whole hit: every strike of a piercing one, its last its
// finisher.
function shotHit(proj) {
  if (!proj.pierce) return hitOf(proj, [proj]);
  const strikes = Array.from({ length: proj.pierce.hits }, (_, i) => (i === proj.pierce.hits - 1 && proj.finisher ? proj.finisher : proj));
  return hitOf(proj, strikes);
}

const launches = (hit) => hit.baseLaunch > 0 && !!hit.direction;

function rolesOf(m) {
  const r = new Set();
  const { hit } = m;
  if (m.startup <= 0.1 + 1e-6) r.add('fast');
  if (launches(hit) && hit.baseLaunch >= 2) r.add('launcher');
  if (launches(hit) && (hit.baseLaunch >= 3 || (hit.baseLaunch >= 2 && hit.damage >= 5))) r.add('finisher');
  if (hit.unblockable) r.add('unblockable');
  if (hit.paralyze > 0) r.add('paralyze');
  if (hit.blockPush > 0 || hit.unblockable || hit.strikes > 2) r.add('shieldPressure');
  if (m.kind === 'melee') {
    const atk = m.atk;
    if (atk.hitCancel != null && m.startup <= 0.15) r.add('comboStarter');
    if (atk.hitCancel != null && hit.hitstun >= 0.25) r.add('comboExtender');
    // A string: its early strikes hold the target for the later ones.
    if (hit.strikes > 1) r.add('comboStarter');
    if (atk.pull) r.add('pull');
    const motion = m.motion;
    if (motion === 'homing') r.add('aerialPursuit').add('mobility');
    if (motion === 'roll' || motion === 'hover' || (atk.step?.speed ?? 0) >= 250) r.add('mobility');
    if (m.air && (motion === 'rise' || motion === 'homing')) r.add('recovery');
    if (m.air && (motion === 'bounce' || hit.direction === 'reverseVertical' || m.reach.y + m.reach.h > 20)) r.add('airToGround');
    // Reaching high above its own head, or launching upward from the
    // ground: it meets what comes down on it.
    if ((!m.air && (m.reach.y < -110 || hit.direction === 'vertical')) || (m.air && motion === 'rise')) r.add('antiAir');
    if (!m.air && m.startup <= 0.15) r.add('groundPressure');
  }
  if (m.kind === 'deflect') {
    r.add('counter').add('interceptProjectile');
    if (hit.direction === 'vertical') r.add('antiAir');
  }
  if (m.kind === 'projectile' || (m.kind === 'technique' && m.proj)) {
    const p = m.proj;
    if (p.speed * p.lifetime >= 200) r.add('zoning');
    if (p.pull) r.add('pull').add('trap');
    if (p.pierce && p.speed <= 400) r.add('trap');
    if (p.repel) r.add('repel').add('interceptProjectile');
    if (p.erase) r.add('erase').add('interceptProjectile');
  }
  if (m.kind === 'technique' && m.burst) r.add('trap');
  if (m.kind === 'summon') r.add('trap');
  // Whatever else it is: a heavy hit, or a plain poke.
  if (hit.damage >= 5) r.add('heavy');
  if (!r.size) r.add('poke');
  return r;
}

function describeMelee(f, m) {
  const atk = m.atk;
  const hit = hitOf(atk);
  const d = {
    key: moveKey(m.action, m.air), kind: 'melee', action: m.action, air: m.air, id: m.id, atk,
    startup: atk.startup, active: atk.active, recovery: atk.recovery, total: atk.total, cooldown: atk.cooldown,
    reach: m.reach, motion: m.motion, hit,
    airUses: atk.airUses ?? 0, freeFall: !!atk.freeFall, hitCancel: atk.hitCancel,
    energy: 0,
  };
  // Seconds it leaves its fighter exposed once its strikes are over.
  d.exposure = atk.recovery;
  d.onBlock = hit.blockstun - atk.recovery;
  d.roles = rolesOf(d);
  return d;
}

function describeProjectile(f, r) {
  const atk = r.atk;
  const proj = r.proj;
  const d = {
    key: moveKey(r.action, r.air), kind: 'projectile', action: r.action, air: r.air, id: r.id, atk, proj,
    startup: atk.projectile.spawnAt, active: 0, recovery: atk.total - atk.projectile.spawnAt, total: atk.total, cooldown: atk.cooldown,
    offset: atk.projectile.offset ?? { x: 0, y: 0 }, hit: shotHit(proj),
    range: proj.speed * proj.lifetime, energy: 0, airUses: atk.airUses ?? 0, freeFall: !!atk.freeFall,
  };
  d.exposure = d.recovery;
  d.roles = rolesOf(d);
  return d;
}

function describeSpecial(f, c) {
  if (c.type === 'technique') {
    const t = f.techniqueDefs[c.id];
    const release = f.sprites.duration(t.releaseAnimation);
    const proj = c.projectile?.def ?? null;
    const d = {
      key: moveKey(c.action, false), kind: 'technique', action: c.action, air: false, id: c.id, def: t,
      startup: c.lead, active: 0, recovery: release, total: c.lead + release, cooldown: t.cooldown, ability: true,
      box: c.box, burst: t.burst ?? null, proj, offset: c.projectile?.offset ?? null,
      hit: t.burst ? hitOf(t.burst.hit, [t.burst.hit]) : shotHit(proj), range: proj ? proj.speed * proj.lifetime : 0,
      energy: 0,
    };
    d.exposure = c.lead + release;
    d.roles = rolesOf(d);
    return d;
  }
  const s = f.summonDefs[c.id];
  const d = {
    key: moveKey(c.action, false), kind: 'summon', action: c.action, air: false, id: c.id, def: s, atk: c.hit,
    startup: c.lead, active: c.hit?.active ?? 0, recovery: 0, total: f.sprites.duration(s.startupAnimation), cooldown: s.cooldown,
    ability: true, hit: hitOf(c.hit), energy: 0,
  };
  d.exposure = d.total;
  d.roles = rolesOf(d);
  return d;
}

function describeDeflect(f, dm) {
  const atk = dm.atk;
  const d = {
    key: 'shield:air', kind: 'deflect', action: 'shield', air: true, id: atk.id, atk,
    startup: atk.startup, active: atk.active, recovery: atk.recovery, total: atk.total, cooldown: atk.cooldown,
    reach: dm.reach, motion: dm.motion, hit: hitOf(atk), catches: !!dm.catches, energy: dm.cost,
    airUses: atk.airUses ?? 0, freeFall: !!atk.freeFall, hitCancel: atk.hitCancel,
  };
  d.exposure = atk.recovery;
  d.onBlock = d.hit.blockstun - atk.recovery;
  d.roles = rolesOf(d);
  return d;
}

const KNOWLEDGE = new WeakMap();

// Everything the CPU knows about fighter `f`'s capabilities, from its data:
// `moves` (every usable move, each a descriptor with `roles`), split by
// where it starts (`ground`, `air`), the fastest strikes, its Shield, its
// Deflect, its Dash and air dash and its hurtboxes' extent. Cached while
// the fighter's moveset is the same.
export function knowFighter(f) {
  const ms = readMoveset(f);
  const cached = KNOWLEDGE.get(f);
  if (cached && cached.ms === ms) return cached;
  const moves = [];
  for (const m of ms.melee) moves.push(describeMelee(f, m));
  for (const r of ms.ranged) moves.push(describeProjectile(f, r));
  for (const c of ms.specials) moves.push(describeSpecial(f, c));
  if (ms.deflect) moves.push(describeDeflect(f, ms.deflect));
  const strikes = moves.filter((m) => m.kind === 'melee' && !m.air);
  const k = {
    ms, moves,
    ground: moves.filter((m) => !m.air),
    air: moves.filter((m) => m.air),
    byKey: new Map(moves.map((m) => [m.key, m])),
    hurt: ms.hurt,
    // Its quickest grounded strike's startup (Infinity with none): how fast
    // it can punish.
    fastest: strikes.reduce((best, m) => (m.startup < best ? m.startup : best), Infinity),
    // How far its grounded strikes reach (a roll's whole path included).
    reachFront: strikes.reduce((best, m) => Math.max(best, m.reach.x + m.reach.w), 0),
    shield: ms.groundShield ? {
      stall: f.defense?.stall ?? 0, perfectWindow: f.defense?.perfectWindow ?? 0, perfectRearm: f.defense?.perfectRearm ?? 0,
    } : null,
    deflect: moves.find((m) => m.kind === 'deflect') ?? null,
    dash: ms.dash, airDash: ms.airDash,
    recoveryMoves: moves.filter((m) => m.air && m.roles.has('recovery')),
  };
  KNOWLEDGE.set(f, k);
  return k;
}
