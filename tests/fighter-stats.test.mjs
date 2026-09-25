// Run with node --test tests/fighter-stats.test.mjs (no dependencies).
// Every fighter's base combat state: accumulated Knockback starts at 0 with
// no cooldowns, has no maximum, a reset (a new match) puts it back at 0,
// and no amount of it ever stops a fighter acting. There is no Health or
// Energy anywhere in a fighter's data or combat state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { CombatState, CombatSystem } from '../js/game/combat.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { STAGE, makeFighter, duel } from './fighter-harness.mjs';

// A real Fighter for `character`, with its own (art-less) sprite set.
const build = (character, facing = 1) => new Fighter({
  def: character, sprites: new SpriteSet(character), stage: STAGE, slot: 0, label: 'P1',
  controller: { getInput: () => ({}) }, spawn: { x: 500, facing },
});

test('no fighter declares Health or Energy, and no combat state carries either', () => {
  assert.ok(CHARACTERS.length > 0);
  for (const character of CHARACTERS) {
    for (const key of ['health', 'energy', 'maxHealth', 'maxEnergy']) {
      assert.equal(Object.hasOwn(character.stats ?? {}, key), false, `${character.displayName} stats.${key}`);
    }
    const { combat } = build(character);
    for (const key of ['health', 'maxHealth', 'energy', 'maxEnergy', 'canSpendEnergy', 'spendEnergy']) {
      assert.equal(key in combat, false, `${character.displayName} combat.${key}`);
    }
  }
});

test('every new fighter starts at 0 Knockback with every cooldown ready, and a reset returns it there', () => {
  for (const character of CHARACTERS) {
    for (const facing of [1, -1]) {
      const fighter = build(character, facing);
      assert.equal(fighter.combat.knockback, 0, `${character.displayName} starts at 0`);
      assert.equal(fighter.combat.cooldowns.size, 0);
      assert.equal(fighter.combat.chargedCooldowns.size, 0);
      fighter.combat.knockback = 87;
      fighter.combat.chargedCooldowns.start('ba1Clone', 5);
      fighter.reset(STAGE);
      assert.equal(fighter.combat.knockback, 0, `${character.displayName} after a reset`);
      assert.equal(fighter.combat.chargedCooldowns.size, 0);
    }
  }
  assert.equal(new CombatState().knockback, 0);
});

test('Knockback has no maximum: hits keep adding to it far past 100', () => {
  const { attacker, target } = duel();
  const system = new CombatSystem();
  const hit = { id: 'probe', damage: 40, knockback: { x: 0, y: 0 }, hitstun: 0, blockstun: 0, hitstop: 0 };
  for (let i = 0; i < 20; i++) system.applyHit(attacker, target, hit);
  assert.equal(target.combat.knockback, 800);
  target.combat.knockback = 1e6;
  system.applyHit(attacker, target, hit);
  assert.equal(target.combat.knockback, 1e6 + 40);
});

test('high Knockback alone never stops a fighter acting: it runs, jumps, attacks, dodges and charges at 100, 200 and 500', () => {
  for (const value of [100, 200, 500]) {
    const { fighter, step } = makeFighter();
    fighter.combat.knockback = value;
    assert.equal(fighter.canAct(), true, `can act at ${value}`);
    assert.equal(fighter.combat.canAct(), true);
    step({ right: true });
    assert.ok(fighter.body.vx > 0, `runs at ${value}`);
    for (let i = 0; i < 30; i++) step();
    step({ action1: true, action1Pressed: true });
    assert.equal(fighter.combat.attack?.def.id, 'ba1', `attacks at ${value}`);
    for (let i = 0; i < 60; i++) step();
    step({ defense: true, defensePressed: true });
    assert.equal(fighter.state, 'defense', `dodges at ${value}`);
    for (let i = 0; i < 60; i++) step();
    step({ charge: true, chargePressed: true });
    assert.equal(fighter.charging, true, `charges at ${value}`);
    for (let i = 0; i < 10; i++) step();
    step({ jump: true, jumpPressed: true });
    assert.equal(fighter.grounded, false, `jumps at ${value}`);
    assert.equal(fighter.combat.knockback, value, 'acting never changes Knockback');
  }
});
