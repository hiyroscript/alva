// Run with node --test tests/systems/match-stats.test.mjs (no dependencies).
// The match statistics (js/game/match-stats.js) on real Battles: damage
// credited to whoever dealt it (melee and a real projectile alike, a
// hazard's to nobody), blocks and perfect Shields never counted as damage,
// projectiles turned back counted for the Deflect, Energy as actually paid
// (a partial payment as paid, regeneration never), Launch Point recovered
// by passive recovery and heals but never by a respawn's reset, every
// counter kept across lives, at 0 for a new match, and frozen with the
// result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { MatchStats, STAT_KEYS } from '../../js/game/match-stats.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { getMap } from '../../js/data/maps.js';
import { CONFIG } from '../../js/config.js';
import { def, DT, fakeSprites } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// A Quick Battle in its fight phase: Player 1 holds `script.held`, the CPU
// `script.cpu` (nothing: it stands still).
function battleOf() {
  const sprites = fakeSprites();
  const script = { held: {}, cpu: {} };
  const input = { flush() {}, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, seed: 2,
  });
  battle.p2.controller = { kind: 'cpu', getInput: () => ({ ...script.cpu }) };
  battle.setPhase('fight');
  const run = (steps = 1) => {
    for (let i = 0; i < steps; i++) battle.update(DT);
  };
  return { battle, script, run };
}

const stats = (battle) => battle.stats.sides;
const RESPAWN_STEPS = Math.round(CONFIG.battle.respawnSeconds / DT);

test('the statistics: one counter set per side, every one at 0 as a match starts', () => {
  const { battle } = battleOf();
  assert.deepEqual(Object.keys(stats(battle)), ['p1', 'p2']);
  for (const side of ['p1', 'p2']) {
    assert.deepEqual(Object.keys(stats(battle)[side]), STAT_KEYS);
    assert.ok(Object.values(stats(battle)[side]).every((v) => v === 0));
  }
});

test('a real melee hit credits its attacker\'s damage dealt and its target\'s damage received, once', () => {
  const { battle, script, run } = battleOf();
  const { p1, p2 } = battle;
  Object.assign(p2.body, { x: p1.body.x + 40 });
  p1.facing = 1;
  script.held = { attack1: true, attack1Pressed: true };
  run();
  script.held = {};
  let hits = [];
  for (let i = 0; i < 60 && !hits.length; i++) {
    run();
    hits = battle.combat.events.filter((e) => e.type === 'hit');
  }
  assert.equal(hits.length, 1, 'it landed');
  run(30);
  const dealt = hits[0].damage;
  assert.ok(dealt > 0);
  assert.equal(stats(battle).p1.damageDealt, dealt);
  assert.equal(stats(battle).p1.successfulAttacks, 1);
  assert.equal(stats(battle).p1.highestHit, dealt);
  assert.equal(stats(battle).p2.damageReceived, dealt);
  assert.equal(stats(battle).p2.damageDealt, 0);
  assert.equal(stats(battle).p1.damageReceived, 0);
});

test('a real projectile\'s damage is its owner\'s', () => {
  const { battle, script, run } = battleOf();
  const { p1, p2 } = battle;
  const ranged = readMoveset(p1).ranged.find((m) => !m.air);
  assert.ok(ranged, '#0001 throws something');
  Object.assign(p2.body, { x: p1.body.x + 260 });
  p1.facing = 1;
  script.held = { [ranged.action]: true, [`${ranged.action}Pressed`]: true };
  run();
  script.held = {};
  let hit = null;
  for (let i = 0; i < 180 && !hit; i++) {
    run();
    hit = battle.combat.events.find((e) => e.type === 'hit' && e.projectile);
  }
  assert.ok(hit, 'the projectile struck');
  assert.equal(hit.attacker, p1);
  assert.equal(stats(battle).p1.damageDealt, hit.damage);
  assert.equal(stats(battle).p2.damageReceived, hit.damage);
});

test('blocks are counted as blocks, never as damage; a perfect Shield also as one; a hazard\'s damage is received from nobody', () => {
  const stats = new MatchStats([{ slot: 'p1', combat: null }, { slot: 'p2', combat: null }]);
  const [a, b] = stats.fighters;
  const step = (events, deflections = []) => stats.record({ combat: { events, deflections } });
  step([
    { type: 'block', attacker: a, target: b, damage: 0, perfect: false },
    { type: 'block', attacker: a, target: b, damage: 0, perfect: true },
    { type: 'hit', attacker: a, target: b, damage: 5, projectile: {} },
    { type: 'hit', attacker: b, target: a, damage: 10, summon: {} },
    { type: 'hit', attacker: null, target: a, damage: 3, hazard: {} },
    { type: 'charmed', attacker: a, target: b, damage: 0, heal: 3 },
  ]);
  assert.deepEqual([stats.sides.p2.blocks, stats.sides.p2.perfectShields], [2, 1]);
  assert.deepEqual([stats.sides.p1.damageDealt, stats.sides.p1.successfulAttacks], [5, 1], 'blocked hits deal nothing');
  assert.deepEqual([stats.sides.p2.damageDealt, stats.sides.p2.highestHit], [10, 10], 'a clone\'s hit is its owner\'s');
  assert.equal(stats.sides.p1.damageReceived, 13, 'the clone\'s and the hazard\'s');
  assert.equal(stats.sides.p2.damageReceived, 5);
  assert.equal(stats.sides.p1.damageDealt + stats.sides.p2.damageDealt, 15, 'the hazard credited to nobody');
  // Projectiles turned back: each one the Deflect's.
  step([], [{ fighter: b, projectile: {} }, { fighter: b, projectile: {} }]);
  assert.equal(stats.sides.p2.deflects, 2);
  assert.equal(stats.sides.p1.deflects, 0);
  // A Deflected projectile's hit is its new owner's (the CombatSystem's
  // attacker).
  step([{ type: 'hit', attacker: b, target: a, damage: 3, projectile: { redirected: true } }]);
  assert.equal(stats.sides.p2.damageDealt, 13);
});

test('Energy consumed is what was actually paid: partial payments as paid, regeneration and refills never', () => {
  const { battle, run } = battleOf();
  const c = battle.p1.combat;
  c.spendEnergy(15);
  run();
  assert.equal(stats(battle).p1.energyConsumed, 15);
  c.setEnergy(10);
  c.spendEnergy(15);
  assert.equal(c.energy, 0);
  run();
  assert.equal(stats(battle).p1.energyConsumed, 25, 'only the 10 that was left');
  assert.equal(c.spendEnergy(15), false, 'exhausted: nothing paid');
  run(Math.round(3 / DT));
  assert.ok(c.energy > 0, 'it regenerates');
  assert.equal(stats(battle).p1.energyConsumed, 25, 'regeneration is no consumption');
  assert.equal(stats(battle).p2.energyConsumed, 0);
});

test('Launch Point recovered: passive recovery and heals, never a respawn\'s reset; every counter kept across lives', () => {
  const { battle, run } = battleOf();
  const { p1 } = battle;
  p1.combat.launchPoint = 20;
  run(Math.round(4 / DT));
  const passive = stats(battle).p1.launchPointRecovered;
  assert.ok(passive > 0, `passive recovery (${passive})`);
  assert.equal(passive, 20 - p1.combat.launchPoint);
  p1.combat.heal(3);
  run();
  assert.equal(stats(battle).p1.launchPointRecovered, passive + 3, 'a heal');
  p1.combat.spendEnergy(15);
  run();
  // Out with Launch Point on it: the respawn's reset to 0 is no recovery.
  p1.combat.launchPoint = 60;
  const before = stats(battle).p1.launchPointRecovered;
  Object.assign(p1.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  run();
  assert.equal(p1.lostToVoid, true);
  run(RESPAWN_STEPS + 1);
  assert.equal(p1.lostToVoid, false, 'back');
  assert.equal(p1.combat.launchPoint, 0);
  assert.equal(stats(battle).p1.launchPointRecovered, before);
  assert.equal(stats(battle).p1.voidFalls, 1);
  // The new life adds to the old one.
  p1.combat.spendEnergy(15);
  run();
  assert.equal(stats(battle).p1.energyConsumed, 30, 'both lives');
});

test('statistics freeze as the match ends, start over with a new match, and post-match play never reaches them', () => {
  const { battle, run } = battleOf();
  const { p1, p2 } = battle;
  p1.combat.spendEnergy(15);
  battle.score.p1 = 2;
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  run();
  assert.equal(battle.matchOver, true);
  const frozen = battle.final.stats;
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.p1) && Object.isFrozen(frozen.p2));
  assert.equal(frozen.p1.points, 3);
  assert.equal(frozen.p1.energyConsumed, 15);
  assert.equal(frozen.p2.voidFalls, 1, 'the fall that ended it counts');
  // Afterwards: Energy, a hit and a fall, none of it counted.
  p1.combat.spendEnergy(15);
  p1.combat.launchPoint = 30;
  Object.assign(p1.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  run(Math.round(5 / DT));
  assert.equal(battle.final.stats, frozen);
  assert.deepEqual(battle.final.stats.p1, frozen.p1);
  assert.equal(battle.stats.sides.p1.energyConsumed, 15, 'the live counters stopped too');
  assert.equal(battle.stats.sides.p1.voidFalls, 0);
  // A rematch: every counter at 0.
  battle.restart();
  assert.ok(Object.values(stats(battle).p1).every((v) => v === 0));
  assert.ok(Object.values(stats(battle).p2).every((v) => v === 0));
  assert.equal(battle.final, null);
});
