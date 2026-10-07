// Run with node --test tests/fighters/profiles.test.mjs (no dependencies).
// Fighter profiles (js/data/fighter-profiles.js), Discover's editorial card
// for each fighter: every playable fighter has one, with ONE difficulty
// rating, a whole number from 1 to 5 (no separate learning and mastery
// scores), a play-style description in English and French, and a review
// hash that matches its definition's current source.
//
// The review hash is the profile-recheck guard: it is the SHA-256 of
// js/data/characters/<id>.js (UTF-8, line endings normalized to \n) when the
// profile was last reviewed. Any change to the definition fails the test
// below until someone rechecks the rating and the description against it
// and records the new hash (docs/characters/adding-characters.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { CHARACTERS, playableCharacters } from '../../js/data/characters.js';
import {
  FIGHTER_PROFILES, DIFFICULTY_MIN, DIFFICULTY_MAX, DIFFICULTY_SCALE, getFighterProfile, assertFighterProfile,
} from '../../js/data/fighter-profiles.js';
import { STRINGS } from '../../js/localization/i18n.js';
import { TEST_A, TEST_DISABLED, withTestFighters } from './fixtures/test-fighters.mjs';

const ROOT = new URL('../../', import.meta.url);
const sourcePath = (id) => `js/data/characters/${id}.js`;

// The review hash of a definition's source text.
function sourceHash(text) {
  return createHash('sha256').update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('hex');
}

// Why fighter `def`'s profile is stale against `source` (its definition's
// text), or null while it is current.
function staleReview(def, source) {
  const profile = getFighterProfile(def.id);
  if (sourceHash(source) === profile?.reviewedSourceHash) return null;
  return `${def.displayName} changed since its Discover profile was reviewed. Recheck its difficulty and play-style description, then update reviewedSourceHash in js/data/fighter-profiles.js to ${sourceHash(source)}.`;
}

// Everything that keeps `defs` (playable fighters) from shipping: a missing
// or invalid profile, a description missing in a language, a definition
// with no source file of its own, or a stale review.
function profileProblems(defs) {
  const problems = [];
  for (const def of defs) {
    const profile = getFighterProfile(def.id);
    if (!profile) {
      problems.push(`${def.displayName} is playable but has no Discover profile in js/data/fighter-profiles.js.`);
      continue;
    }
    try {
      assertFighterProfile(def.id, profile);
    } catch (error) {
      problems.push(error.message);
    }
    for (const language of ['en', 'fr']) {
      if (typeof STRINGS[language][profile.descriptionKey] !== 'string') {
        problems.push(`${def.displayName}: no ${language} play-style description (${profile.descriptionKey}).`);
      }
    }
    const file = new URL(sourcePath(def.id), ROOT);
    if (!existsSync(file)) {
      problems.push(`${def.displayName}: no definition source at ${sourcePath(def.id)} to review against.`);
      continue;
    }
    const stale = staleReview(def, readFileSync(file, 'utf8'));
    if (stale) problems.push(stale);
  }
  return problems;
}

test('every playable fighter has a valid, current Discover profile', () => {
  assert.ok(playableCharacters().length > 0);
  assert.deepEqual(profileProblems(playableCharacters()), []);
});

test('the review guard: each profile was reviewed against its definition as it is now', () => {
  for (const def of playableCharacters()) {
    const source = readFileSync(new URL(sourcePath(def.id), ROOT), 'utf8');
    assert.equal(staleReview(def, source), null, staleReview(def, source) ?? '');
    assert.equal(getFighterProfile(def.id).reviewedSourceHash, sourceHash(source));
  }
});

test('changing a fighter\'s definition makes its review stale until the profile is rechecked; line endings alone do not', () => {
  for (const def of playableCharacters()) {
    const source = readFileSync(new URL(sourcePath(def.id), ROOT), 'utf8');
    // Any edit at all: a retuned number, a renamed move, one more line.
    const edits = [
      source.replace(/available: true/, 'available: true '),
      source.replace(/damage: 3\b/, 'damage: 5'),
      `${source}\n// a note\n`,
    ];
    for (const edited of edits) {
      assert.notEqual(edited, source);
      const message = staleReview(def, edited);
      assert.ok(message, `${def.displayName}: an edit must make the review stale`);
      assert.match(message, new RegExp(`^${def.displayName} changed since its Discover profile was reviewed\\. Recheck its difficulty and play-style description, then update reviewedSourceHash`));
    }
    // Windows line endings are the same source.
    assert.equal(staleReview(def, source.replace(/\n/g, '\r\n')), null, `${def.displayName}: CRLF is the same text`);
  }
});

test('a newly playable fighter cannot ship without a profile, a description and a current review', () => withTestFighters([TEST_A, TEST_DISABLED], () => {
  // A disabled fighter needs none until it is made playable; a playable one
  // without a profile is reported.
  assert.ok(playableCharacters().includes(TEST_A));
  assert.ok(!playableCharacters().includes(TEST_DISABLED));
  assert.deepEqual(profileProblems(playableCharacters()), ['Test A is playable but has no Discover profile in js/data/fighter-profiles.js.']);
  // Made playable, it is reported too.
  TEST_DISABLED.available = true;
  try {
    assert.deepEqual(profileProblems(playableCharacters()), [
      'Test A is playable but has no Discover profile in js/data/fighter-profiles.js.',
      'Disabled is playable but has no Discover profile in js/data/fighter-profiles.js.',
    ]);
  } finally {
    TEST_DISABLED.available = false;
  }
}));

test('#0001 is rated 5 and #0002 3: one difficulty each', () => {
  assert.equal(getFighterProfile('0001').difficulty, 5);
  assert.equal(getFighterProfile('0002').difficulty, 3);
  assert.equal(getFighterProfile('0001').descriptionKey, 'discover.fighter.0001.playStyle');
  assert.equal(getFighterProfile('0002').descriptionKey, 'discover.fighter.0002.playStyle');
  assert.equal(getFighterProfile('nobody'), null);
  assert.equal(getFighterProfile('constructor'), null, 'only the profiles themselves');
});

test('a profile is exactly one 1-5 rating, a description key and a review hash: no separate learn / master scores', () => {
  assert.deepEqual([DIFFICULTY_MIN, DIFFICULTY_MAX], [1, 5]);
  for (const [id, profile] of Object.entries(FIGHTER_PROFILES)) {
    assert.deepEqual(Object.keys(profile).sort(), ['descriptionKey', 'difficulty', 'reviewedSourceHash'], id);
    assert.ok(Number.isInteger(profile.difficulty) && profile.difficulty >= 1 && profile.difficulty <= 5, id);
    assert.ok(Object.isFrozen(profile), id);
    assert.ok(CHARACTERS.some((c) => c.id === id), `${id}: a profile only for a fighter that exists`);
  }
  assert.ok(Object.isFrozen(FIGHTER_PROFILES));
  const valid = { difficulty: 3, descriptionKey: 'discover.fighter.x.playStyle', reviewedSourceHash: 'a'.repeat(64) };
  assert.doesNotThrow(() => assertFighterProfile('x', valid));
  for (const difficulty of [0, 6, 3.5, '3', NaN, null, undefined, -1]) {
    assert.throws(() => assertFighterProfile('x', { ...valid, difficulty }), /one whole number from 1 to 5/, String(difficulty));
  }
  for (const extra of ['learnDifficulty', 'masteryDifficulty', 'difficultyToPlay', 'difficultyToMaster', 'beginnerDifficulty']) {
    assert.throws(() => assertFighterProfile('x', { ...valid, [extra]: 2 }), /unknown field/, extra);
  }
  assert.throws(() => assertFighterProfile('x', { ...valid, descriptionKey: '' }), /descriptionKey/);
  assert.throws(() => assertFighterProfile('x', { ...valid, reviewedSourceHash: 'abc' }), /reviewedSourceHash/);
  assert.throws(() => assertFighterProfile('x', { ...valid, reviewedSourceHash: 'A'.repeat(64) }), /reviewedSourceHash/);
  assert.throws(() => assertFighterProfile('x', null), /missing/);
  // The scale every rating is read against has exactly the five steps.
  assert.deepEqual(Object.keys(DIFFICULTY_SCALE), ['1', '2', '3', '4', '5']);
});

test('profiles are editorial: kept apart from the definitions, never derived from them, never hashing themselves', () => {
  const profiles = readFileSync(new URL('js/data/fighter-profiles.js', ROOT), 'utf8');
  assert.doesNotMatch(profiles.replace(/^\s*\/\/.*$/gm, ''), /^import /m, 'reads nothing: no rating is computed from move counts or any data');
  for (const def of CHARACTERS) {
    const file = new URL(sourcePath(def.id), ROOT);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /reviewedSourceHash|difficulty:|playStyle|fighter-profiles/, `${def.id}: the definition knows nothing of its profile`);
    const hash = getFighterProfile(def.id)?.reviewedSourceHash;
    if (hash) assert.ok(!source.includes(hash), `${def.id}: the hash is not inside what it hashes`);
  }
  // The game never reads a profile: only Discover's fighter browser does.
  const readers = ['js/ui/fighter-browser.js'];
  for (const file of ['js/game/battle.js', 'js/game/practice.js', 'js/game/ai/combat-ai.js', 'js/ui/fighter-roster.js', 'js/data/characters.js']) {
    const code = readFileSync(new URL(file, ROOT), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /fighter-profiles/, `${file} never imports the profiles`);
  }
  for (const file of readers) assert.match(readFileSync(new URL(file, ROOT), 'utf8'), /fighter-profiles\.js/);
});

test('each play-style description reads in English and French, its own for each fighter, about how it plays', () => {
  const keys = Object.values(FIGHTER_PROFILES).map((p) => p.descriptionKey);
  assert.equal(new Set(keys).size, keys.length, 'one description per fighter');
  for (const [id, { descriptionKey }] of Object.entries(FIGHTER_PROFILES)) {
    const en = STRINGS.en[descriptionKey];
    const fr = STRINGS.fr[descriptionKey];
    assert.ok(typeof en === 'string' && en.length > 200, `${id}: English`);
    assert.ok(typeof fr === 'string' && fr.length > 200, `${id}: French`);
    assert.notEqual(en, fr, `${id}: really translated`);
    assert.doesNotMatch(en, /\b\d\/5\b|stars?|difficulty/i, `${id}: the rating is shown as stars, not repeated in the text`);
  }
  // #0001: space control and setup; #0002: momentum rushdown and aerial chase.
  assert.match(STRINGS.en['discover.fighter.0001.playStyle'], /^A space-control and setup fighter/);
  assert.match(STRINGS.en['discover.fighter.0001.playStyle'], /Red and Maximum Blue control space/);
  assert.match(STRINGS.en['discover.fighter.0001.playStyle'], /Hollow Purple is a slow, high-commitment finisher/);
  assert.match(STRINGS.en['discover.fighter.0002.playStyle'], /^A momentum-driven rushdown and aerial-chase fighter/);
  assert.match(STRINGS.en['discover.fighter.0002.playStyle'], /managing limited air uses and free-fall states/);
  assert.match(STRINGS.fr['discover.fighter.0001.playStyle'], /^Un combattant de contrôle de l’espace et de mise en place/);
  assert.match(STRINGS.fr['discover.fighter.0002.playStyle'], /^Un combattant de pression offensive et de poursuite aérienne/);
  // The moves it names are the fighter's own, by their names in each language.
  for (const [action, en] of [['attack2', 'Red'], ['attack3', 'Maximum Blue'], ['attack4', 'Unlimited Void'], ['attack5', 'Hollow Purple']]) {
    assert.equal(STRINGS.en[`ability.0001.${action}`], en);
    assert.ok(STRINGS.fr['discover.fighter.0001.playStyle'].includes(STRINGS.fr[`ability.0001.${action}`]), `${action} in French`);
  }
  for (const action of ['attack1', 'attack2', 'midair_attack1', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.ok(STRINGS.en['discover.fighter.0002.playStyle'].includes(STRINGS.en[`ability.0002.${action}`]), `${action} in English`);
    assert.ok(STRINGS.fr['discover.fighter.0002.playStyle'].includes(STRINGS.fr[`ability.0002.${action}`]), `${action} in French`);
  }
});
