// Run with node --test tests/systems/sample-fighter.test.mjs (no dependencies).
// A second fighter that is not #0001 (tests/fighters/fixtures/sample-fighter.mjs, tests only):
// the same universal codenames and loadout rules, different moves on them.
// Its buttons make its own moves on the ground and in the air, it has three
// numbered attacks (attack3 a summon on its own button, which performs its
// attack2), it has no Defense, it fights #0001
// through the same combat, the CPU plays it from its own data, and its
// ability names are its own. Its
// touch buttons are checked in controls-ui.test.mjs, and the universal
// contract covers it in codenames.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, STAGE, def, duel, fakeSprites, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { CONFIG, MOVES } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { resolveSolidOverlap } from '../../js/game/physics.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { cooldownIndicators } from '../../js/game/rendering/fighter-status.js';
import { abilityName } from '../../js/data/abilities.js';
import { mulberry32 } from '../../js/core/utils.js';

const SPRITES = fakeSpritesOf(SAMPLE_FIGHTER);
const sample = (opts = {}) => makeFighter({ character: SAMPLE_FIGHTER, sprites: SPRITES, ...opts });
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const JUMP = { jump: true, jumpPressed: true };
const SHIELD = { shield: true, shieldPressed: true };

test('each button makes the sample fighter\'s own move, on the ground and in the air', () => {
  // attack3 is a summon: no attack of the fighter's own (see below).
  const ground = { extra_attack: 'extra_attack', transform: 'transform', attack1: 'attack1', attack2: 'attack2', attack3: null };
  const air = { extra_attack: 'extra_attack', transform: 'transform', attack1: 'midair_attack1', attack2: 'midair_attack2', attack3: null };
  for (const [button, move] of Object.entries(ground)) {
    const { fighter, step } = sample();
    step(P(button));
    assert.equal(fighter.combat.attack?.def.id ?? null, move, `${button} on the ground`);
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

test('its Attack 3 button summons its attack3 clone, shown as A3; attack1 and attack2 stay its own attacks', () => {
  const d = duel({ attackerCharacter: SAMPLE_FIGHTER, attackerSprites: SPRITES, gap: 120 });
  d.tick(P('attack3'));
  assert.equal(d.attacker.combat.attack, null, 'the summon, not an attack of its own');
  assert.ok(d.attacker.combat.abilityCooldowns.active('attack3'));
  assert.equal(d.attacker.combat.abilityCooldowns.duration('attack3'), 3, 'its own 3 s cooldown');
  assert.deepEqual(cooldownIndicators(d.attacker).map((c) => [c.id, c.label]), [['attack3', 'A3']]);
  d.until(() => d.clones.length === 1);
  assert.equal(d.clones[0].attackDef.id, 'attack2', 'the clone performs its own attack2');
  d.until(() => d.target.combat.launchPoint > 0);
  assert.equal(d.target.combat.launchPoint, SAMPLE_FIGHTER.attacks.attack2.damage);

  for (const button of ['attack1', 'attack2']) {
    const { fighter, step } = sample();
    step({ down: true });
    step({ down: true, ...P(button) });
    assert.equal(fighter.combat.attack?.def.id, button, `${button}: its normal attack, Down held or not`);
    assert.equal(fighter.combat.abilityCooldowns.size, 0);
  }
  // With no opponent to appear behind, Attack 3 does nothing at all: no
  // attack in its place and no cooldown spent.
  const alone = sample();
  alone.step(P('attack3'));
  assert.equal(alone.fighter.combat.attack, null);
  assert.equal(alone.fighter.summons.length, 0);
  assert.equal(alone.fighter.combat.abilityCooldowns.size, 0);
});

test('with no Defense the shield button does nothing: no Shield, and a hit lands in full', () => {
  const { fighter, step } = sample();
  assert.equal(fighter.defense, null);
  step(SHIELD);
  for (let i = 0; i < 10; i++) step({ shield: true });
  assert.equal(fighter.combat.shielding, false);
  assert.notEqual(fighter.state, 'shield');
  // Holding it rules nothing out either.
  step({ shield: true, ...P('attack1') });
  assert.equal(fighter.combat.attack?.def.id, 'attack1');

  const d = duel({ targetCharacter: SAMPLE_FIGHTER, targetSprites: SPRITES });
  d.tick(P('attack1'), SHIELD);
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.target.combat.launchPoint, def.attacks.attack1.damage);
});

test('it and #0001 hit each other through the same combat, each with its own move data', () => {
  const mine = duel({ attackerCharacter: SAMPLE_FIGHTER, attackerSprites: SPRITES, targetSprites: fakeSprites() });
  mine.tick(P('extra_attack'));
  mine.until(() => mine.events.length > 0);
  assert.deepEqual([mine.events[0].type, mine.events[0].move], ['hit', 'extra_attack']);
  assert.equal(mine.target.combat.launchPoint, SAMPLE_FIGHTER.attacks.extra_attack.damage);

  // #0001's Red: its projectile's hit, credited to #0001.
  const theirs = duel({ targetCharacter: SAMPLE_FIGHTER, targetSprites: SPRITES });
  theirs.tick(P('attack2'));
  theirs.until(() => theirs.events.length > 0);
  assert.deepEqual([theirs.events[0].type, theirs.events[0].move, theirs.events[0].attacker], ['hit', 'attack2_object', theirs.attacker]);
  assert.equal(theirs.target.combat.launchPoint, def.projectiles.attack2_object.damage);
});

test('the CPU reads its moveset from its own data', () => {
  const moves = readMoveset(new Fighter({ def: SAMPLE_FIGHTER, sprites: SPRITES, stage: STAGE, spawn: { x: 500 } }));
  assert.deepEqual(moves.melee.map((m) => [m.action, m.id, m.air]).sort(), [
    ['attack1', 'attack1', false], ['attack1', 'midair_attack1', true],
    ['attack2', 'attack2', false], ['attack2', 'midair_attack2', true],
    ['extra_attack', 'extra_attack', false], ['extra_attack', 'extra_attack', true],
    ['transform', 'transform', false], ['transform', 'transform', true],
  ]);
  assert.deepEqual(moves.ranged, [], 'no projectile');
  assert.deepEqual(moves.specials.map((c) => [c.action, c.id, c.type]), [['attack3', 'attack3', 'summon']]);
  assert.equal(moves.groundShield, false, 'no Shield to raise');
  assert.equal(moves.deflect, null, 'no Deflect');
  assert.ok(moves.dash);
  assert.equal(moves.airDash, null, 'no air dash: none authored');
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
    attack1: 'Jab',
    midair_attack1: 'Mid-air Attack 1',
    attack2: 'Attack 2',
    midair_attack2: 'Mid-air Attack 2',
    attack3: 'Shadow Knee',
    midair_attack3: 'Mid-air Attack 3',
    attack4: 'Attack 4',
    midair_attack4: 'Mid-air Attack 4',
    attack5: 'Attack 5',
    midair_attack5: 'Mid-air Attack 5',
    extra_attack: 'Palm Strike',
    transform: 'Awakening',
  });
});
