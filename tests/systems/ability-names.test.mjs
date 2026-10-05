// Run with node --test tests/systems/ability-names.test.mjs (no dependencies).
// In-game ability names (js/data/abilities.js): each character names its
// moves in `abilityNames`, keyed by the universal move codenames (MOVES in
// js/config.js), and abilityName falls back to the neutral name for any it
// leaves out. Names only: they reach no combat code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { MOVES } from '../../js/config.js';
import { CHARACTERS, getCharacter } from '../../js/data/characters.js';
import { abilityName } from '../../js/data/abilities.js';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';

const DEF_0001 = getCharacter('0001');

test('#0001 names the moves it has names for; the rest keep their neutral names', () => {
  assert.deepEqual(DEF_0001.abilityNames, {
    extra_attack: 'Shuriken',
    attack1: 'Punch',
    attack2: 'Kick',
    attack3: 'Clone Attack',
    attack4: 'Sphere Rush',
  });
  assert.deepEqual(Object.fromEntries(Object.keys(MOVES).map((m) => [m, abilityName(DEF_0001, m)])), {
    attack1: 'Punch',
    midair_attack1: 'Mid-air Attack 1',
    attack2: 'Kick',
    midair_attack2: 'Mid-air Attack 2',
    attack3: 'Clone Attack',
    midair_attack3: 'Mid-air Attack 3',
    attack4: 'Sphere Rush',
    midair_attack4: 'Mid-air Attack 4',
    attack5: 'Attack 5',
    midair_attack5: 'Mid-air Attack 5',
    extra_attack: 'Shuriken',
    transform: 'Transform',
  });
});

test('a character with no names of its own, or none at all, gets the neutral name of every move', () => {
  for (const def of [null, undefined, { id: 'x' }, { id: 'y', abilityNames: {} }, { id: 'z', abilityNames: { attack1: '' } }]) {
    for (const [move, { label }] of Object.entries(MOVES)) assert.equal(abilityName(def, move), label, `${def?.id}: ${move}`);
  }
});

test('only move codenames have ability names: never a control, an object or anything else', () => {
  // (The retired names are checked in codenames.test.mjs.)
  for (const name of [
    'shield', 'jump', 'down', 'runLeft', 'mouvementLeft', 'attack6', 'midair_extra_attack', 'extra_attack_object',
    'attack3_object', 'toString', '__proto__', '', undefined,
  ]) {
    assert.equal(abilityName(DEF_0001, name), null, String(name));
  }
});

test('every character\'s ability names are non-empty names of universal moves', () => {
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    for (const [move, name] of Object.entries(c.abilityNames ?? {})) {
      assert.ok(Object.hasOwn(MOVES, move), `#${c.id}: ${move} is a move codename`);
      assert.equal(typeof name, 'string', `#${c.id}: ${move}`);
      assert.ok(name.trim() && name === name.trim(), `#${c.id}: ${move} has a name, untrimmed text never`);
    }
  }
});

test('names only: no combat code reads them', () => {
  // Every simulation, combat, AI and rendering module under js/game/.
  const game = new URL('../../js/game/', import.meta.url);
  const files = readdirSync(game, { recursive: true }).filter((f) => f.endsWith('.js'));
  assert.ok(files.includes('fighters/fighter.js') && files.includes('ai/combat-ai.js'));
  for (const file of files) {
    const code = readFileSync(new URL(file, game), 'utf8');
    assert.doesNotMatch(code, /abilityNames?\b/, file);
  }
});
