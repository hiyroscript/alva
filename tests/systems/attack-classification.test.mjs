// Run with node --test tests/systems/attack-classification.test.mjs (no dependencies).
// The universal attack classification (js/game/combat/offense.js): what an
// action, an entity or a hit is capable of doing, apart from how it is
// executed. Every move that can deal damage, directly or through what it
// creates, is an attack: a melee strike, a multi-hit string, a throw, its
// projectile and a piercing one's finisher, a technique's burst and its
// projectile, a summon, its clone and the clone's strike, a projectile
// turned back, and the Deflect, which is a defense too. The Shield is a
// defense only; movement is neither. Classification follows from what a
// definition does, never from its name, and a declaration may only agree
// with it. Checked for every playable fighter, the sample fighter's summon
// and a test-only fighter with mechanics nobody has made yet (see
// tests/fighters/fixtures/offense-fighters.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATTACK_SOURCES, NOT_AN_ATTACK, PURE_DEFENSE, SHIELD_BYPASS_FIELDS, actionOffense, attackOffense, classifyHit,
  isHarmfulHit, projectileOffense, summonOffense, techniqueOffense,
} from '../../js/game/combat/offense.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createDefenseDefinition } from '../../js/game/combat/defense.js';
import { createDeflectDefinition } from '../../js/game/combat/deflect.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createSummonDefinition } from '../../js/game/combat/summon.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { assertCombatRules, getCharacter, playableCharacters } from '../../js/data/characters.js';
import { COMBAT_BUTTONS } from '../../js/config.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { duel, fakeSpritesOf, makeFighter, steps } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { FUTURE_FIGHTER } from '../fighters/fixtures/offense-fighters.mjs';

const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const plain = (o) => ({ ...o, sources: [...o.sources] });
const built = (character) => makeFighter({ character, sprites: fakeSpritesOf(character) }).fighter;

// ---- The rule ----------------------------------------------------------------------------

test('a hit is an attack when it can harm: damage, a paralysis or a launch', () => {
  assert.equal(isHarmfulHit({ damage: 1 }), true);
  assert.equal(isHarmfulHit({ damage: 0, paralyze: 0.5 }), true);
  assert.equal(isHarmfulHit({ damage: 0, baseLaunch: 2, directionalLaunch: 'vertical' }), true);
  assert.equal(isHarmfulHit({ damage: 0, baseLaunch: 2, directionalLaunch: null }), false, 'a launch needs a direction');
  assert.equal(isHarmfulHit({ damage: 0 }), false);
  assert.equal(isHarmfulHit(null), false);
  assert.equal(classifyHit({ damage: 3 }).attack, true);
  assert.deepEqual(classifyHit({ damage: 0 }), NOT_AN_ATTACK);
  assert.deepEqual([...ATTACK_SOURCES], ['melee', 'deflect', 'projectile', 'summon', 'technique']);
  assert.ok(SHIELD_BYPASS_FIELDS.includes('unblockable'));
});

test('the classification names no fighter, no move and no ability: it reads what a definition does', () => {
  const code = readFileSync(new URL('../../js/game/combat/offense.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /000\d|attack\d|extra_attack|midair_|Hollow|Void|Purple|Blue|Red|Tornado|Whirlwind/);
});

test('its name never decides it: the same move under any name, and any ability name, is classified the same', () => {
  const spec = { animation: 'a', damage: 3, hitbox: { x: 0, y: -50, w: 30, h: 20 } };
  const names = ['attack1', 'extra_attack', 'divineJudgment', 'lightningCage', 'phantomStrike'];
  const profiles = names.map((id) => plain(createAttackDefinition({ id, ...spec }).offense));
  for (const p of profiles) assert.deepEqual(p, profiles[0]);
  // A fighter that renames its moves classifies them exactly as before.
  const renamed = { ...DEF_0001, id: 'renamed', abilityNames: { attack4: 'Spirit Explosion', attack5: 'Meteor Storm' } };
  const a = built(DEF_0001);
  const b = built(renamed);
  for (const action of COMBAT_BUTTONS) assert.deepEqual(plain(actionOffense(b, action, true)), plain(actionOffense(a, action, true)), action);
});

// ---- Every kind of move -------------------------------------------------------------------

test('an ordinary melee attack, a multi-hit string, a throw and its projectile are attacks', () => {
  const jab = createAttackDefinition({ id: 'x', damage: 3, hitbox: { x: 0, y: -50, w: 30, h: 20 } });
  assert.deepEqual(plain(jab.offense), { attack: true, defense: false, sources: ['strike'] });
  const flurry = createAttackDefinition({
    id: 'x', hitbox: { x: 0, y: -50, w: 30, h: 20 }, hits: [{ at: 0, active: 0.05, damage: 1 }, { at: 0.1, active: 0.05, damage: 3 }],
  });
  assert.deepEqual(plain(flurry.offense), { attack: true, defense: false, sources: ['strikes'] });
  const thrower = createAttackDefinition({ id: 'x', hitbox: null, projectile: { id: 'x_object', spawnAt: 0.1, offset: { x: 0, y: 0 } } });
  assert.deepEqual(plain(thrower.offense), { attack: true, defense: false, sources: ['projectile'] },
    'a throw is an attack though it has no melee strike of its own');
  const shot = createProjectileDefinition({ id: 'x_object', speed: 400, damage: 3 });
  assert.deepEqual(plain(shot.offense), { attack: true, defense: false, sources: ['projectile'] });
  const grinder = createProjectileDefinition({ id: 'x_object', speed: 400, damage: 1, pierce: { hits: 3, interval: 0.1 }, finisher: { damage: 3 } });
  assert.deepEqual(plain(grinder.offense), { attack: true, defense: false, sources: ['projectile', 'finisher'] });
});

test('a technique is executed as a technique and is an attack: its burst, its projectile, or both', () => {
  const clips = { castAnimation: 'c', releaseAnimation: 'r' };
  const burst = createTechniqueDefinition({ id: 'x', ...clips, burst: { hitbox: { x: -1, y: -1, w: 2, h: 2 }, hit: { damage: 3, paralyze: 1 } } });
  const cast = createTechniqueDefinition({ id: 'x', ...clips, projectile: { id: 'x_object' } });
  const both = createTechniqueDefinition({ id: 'x', ...clips, projectile: { id: 'x_object' }, burst: { hitbox: { x: -1, y: -1, w: 2, h: 2 }, hit: { damage: 1 } } });
  assert.deepEqual(plain(burst.offense), { attack: true, defense: false, sources: ['burst'] });
  assert.deepEqual(plain(cast.offense), { attack: true, defense: false, sources: ['projectile'] });
  assert.deepEqual(plain(both.offense), { attack: true, defense: false, sources: ['burst', 'projectile'] });
  assert.deepEqual(techniqueOffense(null), NOT_AN_ATTACK);
});

test('a summon is executed as a summon and is an attack: its clone, and the clone\'s strike', () => {
  const summon = createSummonDefinition({ id: 'attack3', attack: 'attack2', cloud: 'c' });
  assert.deepEqual(plain(summon.offense), { attack: true, defense: false, sources: ['clone'] });
  const f = built(SAMPLE_FIGHTER);
  assert.equal(summonOffense(f.summonDefs.attack3, f.attacks).attack, true, 'its clone performs an attack that strikes');
  assert.equal(f.attacks[f.summonDefs.attack3.attack].offense.attack, true, 'and that strike is an attack');
  assert.deepEqual(plain(actionOffense(f, 'attack3', true)), { attack: true, defense: false, sources: ['clone'] });
  // Every attack its clone may perform counts: with its main one pending
  // art, its no-ground one still strikes, so it is still an attack...
  const harmless = { ...SAMPLE_FIGHTER, attacks: { ...SAMPLE_FIGHTER.attacks, attack2: { animation: 'attack2', pending: true } } };
  const half = createSummonDefinition({ id: 'attack3', ...harmless.summons.attack3 });
  assert.equal(summonOffense(half, built(harmless).attacks).attack, true);
  // ...and one whose clone could strike nothing at all is none, and the
  // registry refuses it.
  const neither = { ...harmless, summons: { attack3: { ...harmless.summons.attack3, noGround: null } } };
  const none = createSummonDefinition({ id: 'attack3', ...neither.summons.attack3 });
  assert.deepEqual(summonOffense(none, built(neither).attacks), NOT_AN_ATTACK);
  assert.throws(() => assertCombatRules(neither), /summon "attack3" sends a clone whose attack strikes nothing: a summon is an attack/);
});

test('the Deflect is both an attack and a defense; the Shield is a defense only; movement and an empty button are neither', () => {
  for (const c of playableCharacters()) {
    const f = built(c);
    const deflect = createDeflectDefinition(c.deflect);
    assert.deepEqual(plain(deflect.offense), { attack: true, defense: true, sources: ['strike', 'redirect'] }, `#${c.id}'s Deflect`);
    assert.deepEqual(plain(actionOffense(f, 'shield', false)), plain(deflect.offense), 'the shield button in the air');
    assert.deepEqual(actionOffense(f, 'shield', true), PURE_DEFENSE, 'the shield button on the ground');
    assert.deepEqual(f.defense.offense, PURE_DEFENSE);
    assert.equal(f.defense.offense.attack, false);
    for (const action of ['jump', 'mouvment', 'midair_mouvment', 'runLeft', 'down']) {
      assert.deepEqual(actionOffense(f, action, true), NOT_AN_ATTACK, `${action} is movement`);
      assert.deepEqual(actionOffense(f, action, false), NOT_AN_ATTACK);
    }
  }
  assert.deepEqual(actionOffense(built(DEF_0001), 'transform', true), NOT_AN_ATTACK, 'a reserved button');
  assert.deepEqual(actionOffense(null, 'attack1'), NOT_AN_ATTACK);
  // A Deflect is always both: one that would not turn projectiles back is refused.
  assert.throws(() => createDeflectDefinition({ ...DEF_0001.deflect, deflectProjectiles: false }), /a Deflect turns projectiles back/);
  // The Shield deals nothing: one that says it does is refused.
  for (const strike of [{ damage: 3 }, { paralyze: 1 }, { hitbox: { x: 0, y: 0, w: 1, h: 1 } }, { offensive: true }]) {
    assert.throws(() => createDefenseDefinition({ ...DEF_0001.defense, ...strike }), /a Shield is a defense and deals nothing/);
  }
  // Pending art is no attack yet.
  assert.deepEqual(createAttackDefinition({ id: 'x', animation: 'a', pending: true }).offense, NOT_AN_ATTACK);
});

// ---- Declarations agree, never decide ---------------------------------------------------

test('a definition may say whether it is an attack only to agree with what it does', () => {
  const strike = { id: 'x', damage: 3, hitbox: { x: 0, y: -50, w: 30, h: 20 } };
  assert.equal(createAttackDefinition({ ...strike, offensive: true }).offense.attack, true);
  assert.throws(() => createAttackDefinition({ ...strike, offensive: false }),
    /Attack "x" declares offensive: false, but it can deal damage \(strike\): whether it is an attack follows from what it does/);
  assert.throws(() => createAttackDefinition({ id: 'x', animation: 'a', pending: true, offensive: true }), /declares offensive: true, but it deals no damage/);
  assert.throws(() => createAttackDefinition({ ...strike, offensive: 'no' }), /offensive must be true or false/);
  assert.throws(() => createProjectileDefinition({ id: 'x', damage: 1, offensive: false }), /Projectile "x" declares offensive: false/);
  assert.throws(() => createTechniqueDefinition({ id: 'x', projectile: { id: 'o' }, offensive: false }), /Technique "x" declares offensive: false/);
  assert.throws(() => createSummonDefinition({ id: 'x', attack: 'a', cloud: 'c', offensive: false }), /Summon "x" declares offensive: false/);
  assert.throws(() => createDeflectDefinition({ ...DEF_0001.deflect, offensive: false }), /declares offensive: false/);
});

// ---- The roster ---------------------------------------------------------------------------

test('every playable fighter: every move it can make that can harm is an attack, whatever executes it', () => {
  for (const c of playableCharacters()) {
    const f = built(c);
    for (const [id, atk] of Object.entries(f.attacks)) {
      const harms = atk.hits ? atk.hits.some(isHarmfulHit) : !!atk.projectile || (!!atk.hitbox && isHarmfulHit(atk));
      assert.equal(atk.offense.attack, harms, `#${c.id} ${id}`);
      assert.equal(atk.offense.attack, !atk.pending, `#${c.id} ${id}: every authored attack can harm`);
    }
    for (const [id, p] of Object.entries(f.projectileDefs)) assert.equal(p.offense.attack, true, `#${c.id} ${id}`);
    for (const [id, t] of Object.entries(f.techniqueDefs)) assert.equal(t.offense.attack, true, `#${c.id} ${id}`);
    for (const [id, s] of Object.entries(f.summonDefs)) assert.equal(summonOffense(s, f.attacks).attack, true, `#${c.id} ${id}`);
    // Every combat button it has is an attack on the ground and in the air
    // (where it has one there).
    for (const action of COMBAT_BUTTONS) {
      if (!c.actions?.[action]) continue;
      assert.equal(actionOffense(f, action, true).attack, true, `#${c.id} ${action} on the ground`);
    }
  }
});

test('#0001: Unlimited Void and Hollow Purple are techniques and attacks; Red and Maximum Blue are attacks to the last strike', () => {
  const f = built(DEF_0001);
  assert.deepEqual(DEF_0001.actions.attack4, { type: 'technique', id: 'attack4' }, 'still a technique');
  assert.deepEqual(DEF_0001.actions.attack5, { type: 'technique', id: 'attack5' });
  assert.deepEqual(plain(f.techniqueDefs.attack4.offense), { attack: true, defense: false, sources: ['burst'] }, 'Unlimited Void');
  assert.deepEqual(plain(f.techniqueDefs.attack5.offense), { attack: true, defense: false, sources: ['projectile'] }, 'Hollow Purple');
  assert.equal(f.projectileDefs.attack5_object.offense.attack, true, 'its sphere');
  assert.deepEqual(plain(f.attacks.attack2.offense), { attack: true, defense: false, sources: ['projectile'] }, 'Red\'s throw');
  assert.equal(f.projectileDefs.attack2_object.offense.attack, true, 'Red');
  assert.deepEqual(plain(f.projectileDefs.attack3_object.offense), { attack: true, defense: false, sources: ['projectile', 'finisher'] },
    'Maximum Blue, its pull, its grinding strikes and its finisher');
  assert.equal(f.attacks.midair_attack3.offense.attack, true, 'Blue\'s palm, its pull included');
  assert.equal(f.def.abilityNames.attack4, 'Unlimited Void', 'names untouched');
  assert.equal(f.def.abilityNames.attack5, 'Hollow Purple');
});

test('#0002: One-Two, Rapid Kicks, the Homing Attack, the Bounce Attack, the Spin Attack, the Blue Tornado and the Whirlwind are attacks', () => {
  const f = built(DEF_0002);
  const kinds = {
    attack1: 'strikes', attack2: 'strikes', midair_attack1: 'strike', midair_attack2: 'strike', attack3: 'strike',
    midair_attack3: 'strikes', extra_attack: 'projectile',
  };
  for (const [id, source] of Object.entries(kinds)) {
    assert.equal(f.attacks[id].offense.attack, true, id);
    assert.ok(f.attacks[id].offense.sources.includes(source), `${id}: ${f.attacks[id].offense.sources}`);
  }
  assert.deepEqual(plain(f.projectileDefs.extra_attack_object.offense), { attack: true, defense: false, sources: ['projectile', 'finisher'] });
});

test('a test-only fighter nobody has made yet: every unusual move is an attack, with no code written for it', () => {
  const f = built(FUTURE_FIGHTER);
  assert.doesNotThrow(() => assertCombatRules(FUTURE_FIGHTER));
  const expect = {
    attack1: { attack: true, defense: false, sources: ['strikes'] }, // Phantom Strike
    attack2: { attack: true, defense: false, sources: ['projectile'] },
    attack3: { attack: true, defense: false, sources: ['clone'] }, // Shadow Clone
    attack4: { attack: true, defense: false, sources: ['burst', 'projectile'] }, // Meteor Storm
    attack5: { attack: true, defense: false, sources: ['projectile'] }, // Poison Field
    extra_attack: { attack: true, defense: true, sources: ['strike', 'redirect'] }, // Counter Pulse
  };
  for (const [action, profile] of Object.entries(expect)) {
    assert.deepEqual(plain(actionOffense(f, action, true)), profile, `${action} (${FUTURE_FIGHTER.abilityNames[action]})`);
  }
  assert.deepEqual(plain(f.projectileDefs.attack5_object.offense), { attack: true, defense: false, sources: ['projectile', 'finisher'] },
    'the lingering field strikes again and again');
  assert.equal(f.attacks.midair_attack3.offense.attack, true, 'the clone\'s strike');
});

test('the CPU reads the same classification: techniques, summons, throws and the Deflect are attacks to it too', () => {
  for (const c of [DEF_0001, DEF_0002, SAMPLE_FIGHTER, FUTURE_FIGHTER]) {
    const caps = analyzeCapabilities(built(c));
    for (const m of caps.moves) assert.equal(m.offense.attack, true, `#${c.id} ${m.kind} ${m.id}`);
    const deflect = caps.moves.find((m) => m.kind === 'deflect');
    if (deflect) assert.equal(deflect.offense.defense, true, 'the Deflect is a defense too');
    assert.ok(caps.moves.every((m) => !m.roles.has('unblockable')), 'and no role gets past a Shield');
  }
  const sample = analyzeCapabilities(built(SAMPLE_FIGHTER));
  assert.ok(sample.moves.some((m) => m.kind === 'summon' && m.offense.attack));
  const future = analyzeCapabilities(built(FUTURE_FIGHTER));
  assert.deepEqual(future.moves.filter((m) => m.kind === 'technique').map((m) => m.offense.attack), [true, true]);
});

// ---- An attack stays an attack -------------------------------------------------------------

test('an attack stays one whether it misses, is blocked or lands, and a projectile turned back stays one, now its new owner\'s', () => {
  // A miss: no event, and the classification is the definition's, untouched.
  const miss = duel({ gap: 400 });
  const before = miss.attacker.attacks.attack1.offense;
  miss.tick(P('attack1'));
  for (let i = 0; i < 30; i++) miss.tick();
  assert.equal(miss.events.length, 0);
  assert.equal(miss.attacker.attacks.attack1.offense, before);
  assert.equal(before.attack, true);
  // Blocked: recorded as an attack that was blocked, never as a hit.
  const blocked = duel({ gap: 40 });
  blocked.tick({}, { shield: true, shieldPressed: true });
  for (let i = 0; i < steps(0.2); i++) blocked.tick({}, { shield: true });
  blocked.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 30 && !blocked.events.length; i++) blocked.tick({}, { shield: true });
  assert.deepEqual([blocked.events[0].type, blocked.events[0].attack, blocked.events[0].source], ['block', true, 'melee']);
  // Turned back by a Deflect: the same projectile, still an attack.
  const d = duel({ gap: 300 });
  d.tick(P('attack2'));
  d.until(() => d.projectiles.length > 0);
  const red = d.projectiles[0];
  const thrown = red.def;
  assert.equal(red.redirected, false);
  red.turnBack(d.target, -red.direction);
  assert.equal(red.redirected, true);
  assert.equal(red.ability, 'attack2', 'it keeps the ability that produced it');
  assert.equal(red.def, thrown, 'the same projectile');
  assert.equal(red.def.offense.attack, true);
  d.until(() => d.events.length > 0);
  const e = d.events[0];
  assert.deepEqual([e.type, e.target, e.attacker, e.source, e.ability, e.redirected, e.attack],
    ['hit', d.attacker, d.target, 'projectile', 'attack2', true, true]);
});
