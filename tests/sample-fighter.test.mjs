// Run with node --test tests/sample-fighter.test.mjs (no dependencies).
// A second fighter that is not #0001 (tests/sample-fighter.mjs, tests only):
// the same universal codenames, different moves on them. Its buttons make
// its own moves on the ground and in the air, its charged move is a summon
// on ba2, it has no Defense, it fights #0001 through the same combat, the
// CPU plays it from its own data, and its ability names are its own. Its
// touch buttons are checked in controls-ui.test.mjs, and the universal
// contract covers it in codenames.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, STAGE, def, duel, fakeSprites, fakeSpritesOf, makeFighter } from './fighter-harness.mjs';
import { SAMPLE_FIGHTER } from './sample-fighter.mjs';
import { CONFIG, MOVES } from '../js/config.js';
import { Fighter, separateFighters } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../js/game/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../js/game/clone.js';
import { resolveSolidOverlap } from '../js/game/physics.js';
import { CombatAIController, readMoveset } from '../js/game/combat-ai.js';
import { cbaIndicators } from '../js/game/fighter-status.js';
import { abilityName } from '../js/data/abilities.js';
import { mulberry32 } from '../js/core/utils.js';

const SPRITES = fakeSpritesOf(SAMPLE_FIGHTER);
const sample = (opts = {}) => makeFighter({ character: SAMPLE_FIGHTER, sprites: SPRITES, ...opts });
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const JUMP = { jump: true, jumpPressed: true };
const CHARGE = { charge: true };
const SHIELD = { shield: true, shieldPressed: true };

test('each button makes the sample fighter\'s own move, on the ground and in the air', () => {
  const ground = { uniqueba: 'uniqueba', transform: 'transform', ba1: 'ba1', ba2: 'ba2' };
  const air = { uniqueba: 'uniqueba', transform: 'transform', ba1: null, ba2: 'maba2' };
  for (const [button, move] of Object.entries(ground)) {
    const { fighter, step } = sample();
    step(P(button));
    assert.equal(fighter.combat.attack?.def.id, move, `${button} on the ground`);
    assert.equal(fighter.combat.lastIntent, button);
  }
  for (const [button, move] of Object.entries(air)) {
    const { fighter, step } = sample();
    step(JUMP);
    step({ jump: true });
    assert.equal(fighter.grounded, false);
    step(P(button));
    assert.equal(fighter.combat.attack?.def.id ?? null, move, `${button} in the air`);
  }
});

test('Charge + ba2 summons its cba2 clone, shown as CBA2; Charge + ba1 is a plain ba1', () => {
  const d = duel({ attackerCharacter: SAMPLE_FIGHTER, attackerSprites: SPRITES, gap: 120 });
  d.tick(CHARGE);
  d.tick(CHARGE);
  d.tick({ ...CHARGE, ...P('ba2') });
  assert.equal(d.attacker.combat.attack, null, 'the charged press, not its ba2');
  assert.ok(d.attacker.combat.chargedCooldowns.active('cba2'));
  assert.deepEqual(cbaIndicators(d.attacker).map((c) => [c.id, c.action, c.label]), [['cba2', 'ba2', 'CBA2']]);
  d.until(() => d.clones.length === 1);
  assert.equal(d.clones[0].attackDef.id, 'ba2', 'the clone performs its own ba2');
  d.until(() => d.target.combat.launchPoint > 0);
  assert.equal(d.target.combat.launchPoint, SAMPLE_FIGHTER.attacks.ba2.damage);

  const { fighter, step } = sample();
  step(CHARGE);
  step(CHARGE);
  step({ ...CHARGE, ...P('ba1') });
  assert.equal(fighter.combat.attack?.def.id, 'ba1', 'nothing charged on ba1: its normal attack');
  assert.equal(fighter.combat.chargedCooldowns.size, 0);
});

test('with no Defense the shield button does nothing: no Shield, and a hit lands in full', () => {
  const { fighter, step } = sample();
  assert.equal(fighter.defense, null);
  step(SHIELD);
  for (let i = 0; i < 10; i++) step({ shield: true });
  assert.equal(fighter.combat.shielding, false);
  assert.notEqual(fighter.state, 'shield');
  // Holding it rules nothing out either.
  step({ shield: true, ...P('ba1') });
  assert.equal(fighter.combat.attack?.def.id, 'ba1');

  const d = duel({ targetCharacter: SAMPLE_FIGHTER, targetSprites: SPRITES });
  d.tick(P('ba1'), SHIELD);
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.target.combat.launchPoint, def.attacks.ba1.damage);
});

test('it and #0001 hit each other through the same combat, each with its own move data', () => {
  const mine = duel({ attackerCharacter: SAMPLE_FIGHTER, attackerSprites: SPRITES, targetSprites: fakeSprites() });
  mine.tick(P('uniqueba'));
  mine.until(() => mine.events.length > 0);
  assert.deepEqual([mine.events[0].type, mine.events[0].move], ['hit', 'uniqueba']);
  assert.equal(mine.target.combat.launchPoint, SAMPLE_FIGHTER.attacks.uniqueba.damage);

  const theirs = duel({ targetCharacter: SAMPLE_FIGHTER, targetSprites: SPRITES });
  theirs.tick(P('ba2'));
  theirs.until(() => theirs.events.length > 0);
  assert.deepEqual([theirs.events[0].type, theirs.events[0].move], ['hit', 'ba2']);
  assert.equal(theirs.target.combat.launchPoint, def.attacks.ba2.damage);
});

test('the CPU reads its moveset from its own data', () => {
  const moves = readMoveset(new Fighter({ def: SAMPLE_FIGHTER, sprites: SPRITES, stage: STAGE, spawn: { x: 500 } }));
  assert.deepEqual(moves.melee.map((m) => [m.action, m.id, m.air]).sort(), [
    ['ba1', 'ba1', false],
    ['ba2', 'ba2', false], ['ba2', 'maba2', true],
    ['transform', 'transform', false], ['transform', 'transform', true],
    ['uniqueba', 'uniqueba', false], ['uniqueba', 'uniqueba', true],
  ]);
  assert.deepEqual(moves.ranged, [], 'no projectile');
  assert.deepEqual(moves.charged.map((c) => [c.action, c.id, c.type]), [['ba2', 'cba2', 'summon']]);
  assert.equal(moves.shield, false, 'no Shield to raise');
  assert.ok(moves.dash);
});

test('a CPU plays it against a #0001 CPU: it attacks with its own moves and never shields', () => {
  const stage = STAGE;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99 };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  const make = (character, sprites, x, facing, slot, seed) => new Fighter({
    def: character, sprites, stage, slot, label: slot, spawn: { x, facing },
    controller: new CombatAIController({ difficulty: 'hard', rng: mulberry32(seed) }),
  });
  const mine = make(SAMPLE_FIGHTER, SPRITES, 800, 1, 'p1', 7);
  const theirs = make(def, fakeSprites(), 1100, -1, 'p2', 8);
  mine.opponent = theirs;
  theirs.opponent = mine;
  world.fighters = [mine, theirs];
  const started = new Set();
  const events = [];
  let shielded = false;
  for (let i = 0; i < Math.round(30 / DT) && !mine.lostToVoid && !theirs.lostToVoid; i++) {
    for (const f of world.fighters) f.update(DT, ctx);
    separateFighters(mine, theirs, stage);
    for (const f of world.fighters) resolveSolidOverlap(f.body, stage);
    spawnProjectiles(world.fighters, world.projectiles);
    for (const p of world.projectiles) p.update(DT, stage);
    updateClones(world.clones, DT);
    spawnClones(world.fighters, world.clones, stage);
    events.push(...world.combat.update(world.fighters, world.projectiles, world.clones));
    removeDeadProjectiles(world.projectiles);
    removeDeadClones(world.clones);
    if (mine.combat.attack) started.add(mine.combat.attack.def.id);
    if (mine.combat.shielding) shielded = true;
  }
  assert.ok(started.size >= 2, `several of its moves: ${[...started].join(', ')}`);
  for (const id of started) assert.ok(SAMPLE_FIGHTER.attacks[id], `${id} is one of its own attacks`);
  assert.ok(events.some((e) => e.attacker === mine && e.type === 'hit'), 'it lands hits');
  assert.equal(shielded, false);
});

test('its ability names are its own; unnamed moves, and moves it does not have, read neutrally', () => {
  assert.deepEqual(Object.fromEntries(Object.keys(MOVES).map((m) => [m, abilityName(SAMPLE_FIGHTER, m)])), {
    ba1: 'Jab',
    maba1: 'Mid-air Basic Attack 1',
    cba1: 'Charged Basic Attack 1',
    ba2: 'Basic Attack 2',
    maba2: 'Mid-air Basic Attack 2',
    cba2: 'Shadow Knee',
    uniqueba: 'Palm Strike',
    transform: 'Awakening',
  });
});
