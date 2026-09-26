// Run with node --test tests/ability-names.test.mjs (no dependencies).
// In-game ability names (js/data/abilities.js): each character names its
// moves in `abilityNames`, keyed by the universal move codenames (MOVES in
// js/config.js), and abilityName falls back to the neutral name for any it
// leaves out. Names only: they reach no combat code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOVES } from '../js/config.js';
import { CHARACTERS, getCharacter } from '../js/data/characters.js';
import { abilityName } from '../js/data/abilities.js';

const DEF_0001 = getCharacter('0001');

test('#0001 names the moves it has names for; the rest keep their neutral names', () => {
  assert.deepEqual(DEF_0001.abilityNames, {
    uniqueba: 'Shuriken',
    ba1: 'Punch',
    ba2: 'Kick',
    cba1: 'Clone Attack',
    cba2: 'Sphere Rush',
  });
  assert.deepEqual(Object.fromEntries(Object.keys(MOVES).map((m) => [m, abilityName(DEF_0001, m)])), {
    ba1: 'Punch',
    maba1: 'Mid-air Basic Attack 1',
    cba1: 'Clone Attack',
    ba2: 'Kick',
    maba2: 'Mid-air Basic Attack 2',
    cba2: 'Sphere Rush',
    uniqueba: 'Shuriken',
    transform: 'Transform',
  });
});

test('a character with no names of its own, or none at all, gets the neutral name of every move', () => {
  for (const def of [null, undefined, { id: 'x' }, { id: 'y', abilityNames: {} }, { id: 'z', abilityNames: { ba1: '' } }]) {
    for (const [move, { label }] of Object.entries(MOVES)) assert.equal(abilityName(def, move), label, `${def?.id}: ${move}`);
  }
});

test('only move codenames have ability names: never a control, a retired name or anything else', () => {
  for (const name of ['shield', 'jump', 'charge', 'runLeft', 'mouvementLeft', 'throw', 'primary', 'action1', 'midairBa1', 'rasenRush', 'toString', '__proto__', '', undefined]) {
    assert.equal(abilityName(DEF_0001, name), null, String(name));
  }
});

test('every character\'s ability names are non-empty names of universal moves', () => {
  for (const c of CHARACTERS) {
    for (const [move, name] of Object.entries(c.abilityNames ?? {})) {
      assert.ok(Object.hasOwn(MOVES, move), `#${c.id}: ${move} is a move codename`);
      assert.equal(typeof name, 'string', `#${c.id}: ${move}`);
      assert.ok(name.trim() && name === name.trim(), `#${c.id}: ${move} has a name, untrimmed text never`);
    }
  }
});

test('names only: no combat code reads them', () => {
  for (const file of ['character.js', 'combat.js', 'combat-ai.js', 'clone.js', 'charged-technique.js', 'projectile.js']) {
    const code = readFileSync(new URL(`../js/game/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /abilityNames?\b/, file);
  }
});
