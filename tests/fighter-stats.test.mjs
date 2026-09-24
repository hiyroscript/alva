// Run with node --test tests/fighter-stats.test.mjs (no dependencies).
// Every fighter's base stats: each definition in CHARACTERS declares 100
// health and 100 Energy, and a Fighter built from it (player or CPU, any
// roster slot) starts at full health and full Energy, read from its own
// stats rather than from anything the engine hard-codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { CombatState } from '../js/game/combat.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { STAGE } from './fighter-harness.mjs';

// A real Fighter for `character`, with its own (art-less) sprite set.
const build = (character, facing = 1) => new Fighter({
  def: character, sprites: new SpriteSet(character), stage: STAGE, slot: 0, label: 'P1',
  controller: { getInput: () => ({}) }, spawn: { x: 500, facing },
});

test('every fighter in CHARACTERS declares exactly 100 health and 100 Energy', () => {
  assert.ok(CHARACTERS.length > 0);
  for (const character of CHARACTERS) {
    assert.equal(character.stats.health, 100, `${character.displayName} health`);
    assert.equal(character.stats.energy, 100, `${character.displayName} Energy`);
  }
});

test('every fighter starts at 100 / 100 health and 100 / 100 Energy, and a reset refills both', () => {
  for (const character of CHARACTERS) {
    for (const facing of [1, -1]) {
      const fighter = build(character, facing);
      const { combat } = fighter;
      assert.equal(combat.maxHealth, 100, `${character.displayName} max health`);
      assert.equal(combat.health, 100, `${character.displayName} starts at full health`);
      assert.equal(combat.maxEnergy, 100, `${character.displayName} max Energy`);
      assert.equal(combat.energy, 100, `${character.displayName} starts with full Energy`);
      combat.health = 40;
      combat.energy = 25;
      fighter.reset(STAGE);
      assert.deepEqual(
        [fighter.combat.health, fighter.combat.maxHealth, fighter.combat.energy, fighter.combat.maxEnergy],
        [100, 100, 100, 100], `${character.displayName} after a reset`,
      );
    }
  }
});

test('health and Energy capacity come from the character\'s own stats, not the engine', () => {
  // The combat state reads whatever the definition declares.
  const other = new CombatState({ health: 70, energy: 40 });
  assert.deepEqual([other.maxHealth, other.health, other.maxEnergy, other.energy], [70, 70, 40, 40]);
  for (const character of CHARACTERS) {
    const state = new CombatState(character.stats);
    assert.deepEqual([state.maxHealth, state.health, state.maxEnergy, state.energy], [100, 100, 100, 100]);
  }
});
