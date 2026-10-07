// Run with node --test tests/systems/combat-rules.test.mjs (no dependencies).
// The shared combat rules, for every registered fighter and every kind of
// hit at once (each one's own system has its own tests too): Energy (100
// for everyone; 25 for any Dash, air dash or Dash cancel; 15 for any
// Deflect; 15 for any block, a perfect one's included; nothing for Combat
// Assist; nothing back for any defense), damage (1, 3, 5 or 10, every hit
// that can land), difficulty (the CPU's judgement only, never a number of
// the fight), cooldowns (none on #0001, at most MAX_ATTACK_COOLDOWN on any
// attack) and movement (one baseline). Runs the real Fighter, CombatSystem,
// combat AI, Battle and Practice Ground (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTERS, getCharacter, assertCombatRules } from '../../js/data/characters.js';
import { ALLOWED_DAMAGE_VALUES, resolveHitDamage } from '../../js/data/launch.js';
import { BASE_FIGHTER_MOVEMENT, MOVEMENT_FIELDS, assertUniversalMovement } from '../../js/data/movement.js';
import { DIFFICULTY_IDS, CAPABILITY, getDifficultyProfile } from '../../js/data/difficulty.js';
import { CONFIG } from '../../js/config.js';
import { MAX_ATTACK_COOLDOWN, createAttackDefinition } from '../../js/game/combat/attacks.js';
import {
  BLOCK_ENERGY_COST, DASH_ENERGY_COST, DEFLECT_ENERGY_COST, MAX_ENERGY, resolveEnergy,
} from '../../js/game/combat/combat-state.js';
import { createDeflectDefinition } from '../../js/game/combat/deflect.js';
import { Projectile, createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { CombatSystem, worldBox } from '../../js/game/combat/combat.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { mulberry32 } from '../../js/core/utils.js';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { LOADOUT_CASES, WITH_EXTRA } from '../fighters/fixtures/loadout-fighters.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const SHIELD = { shield: true, shieldPressed: true };
const HOLD = { shield: true };
const TIERS = new Set([1, 3, 5, 10]);
const near = (a, b) => Math.abs(a - b) < 1e-9;
// Every definition the game loads, then every test-only one that leans on
// the shared rules (a summon among them): all the content there is.
const CONTENT = [...CHARACTERS, SAMPLE_FIGHTER, WITH_EXTRA, ...LOADOUT_CASES.map((c) => c.def)];

// Battle draws through Path2D, which Node has not got.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// `f` in the air at its own x, `y` high, still.
function aloft(f, y = 400) {
  Object.assign(f.body, { prevX: f.body.x, y, prevY: y, vx: 0, vy: 0, grounded: false, ground: null });
}

// The step a hit from `d.attacker`'s attack1 lands, then until that attack
// may be cut short.
function untilCancellable(d) {
  d.tick(P('attack1'));
  d.until(() => d.events.some((e) => e.type === 'hit'), 60);
  d.until(() => d.attacker.combat.cancellable, 60);
}

// ---- Energy: the one bar ------------------------------------------------------------

test('every registered fighter holds exactly 100 Energy: at the start, after a refill, a respawn, a reset, a Battle and Practice Ground', () => {
  assert.equal(MAX_ENERGY, 100);
  for (const c of CHARACTERS) {
    const { fighter } = makeFighter({ character: c });
    const who = `#${c.id}`;
    assert.equal(fighter.energyDef.max, 100, who);
    assert.deepEqual([fighter.combat.energy, fighter.combat.maxEnergy, fighter.combat.energyExhausted], [100, 100, false], `${who}: starts full`);
    fighter.combat.regenEnergy(500);
    assert.equal(fighter.combat.energy, 100, `${who}: never above it`);
    fighter.combat.spendEnergy(100);
    fighter.combat.refillEnergy();
    assert.equal(fighter.combat.energy, 100, `${who}: a full refill`);
    fighter.combat.spendEnergy(60);
    fighter.respawn(STAGE);
    assert.equal(fighter.combat.energy, 100, `${who}: a respawn`);
    fighter.combat.spendEnergy(100);
    fighter.reset(STAGE);
    assert.deepEqual([fighter.combat.energy, fighter.combat.energyExhausted], [100, false], `${who}: a reset`);
    assert.equal('max' in (c.energy ?? {}), false, `${who}: never written in its definition`);
  }
  // A Quick Battle starts both fighters full.
  const [a, b] = CHARACTERS;
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: a, p2Def: b,
    p1Sprites: fakeSpritesOf(a), p2Sprites: fakeSpritesOf(b), input: { flush() {}, sample: () => ({}) },
  });
  assert.deepEqual([battle.p1.combat.energy, battle.p2.combat.energy], [100, 100], 'a Battle');
  // So do Practice Ground and a change of fighter in it.
  const canvas = { getContext: () => new Proxy({}, { get: () => () => {} }), getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }) };
  const practice = new PracticeSession({ canvas, map: PRACTICE_MAP, def: a, sprites: fakeSpritesOf(a), input: { flush() {}, sample: () => ({}) } });
  assert.equal(practice.player.combat.energy, 100, 'Practice Ground');
  practice.player.combat.spendEnergy(70);
  practice.setFighter(b, fakeSpritesOf(b));
  assert.equal(practice.player.combat.energy, 100, 'Practice Ground, a new fighter');
  // And no definition may say otherwise.
  for (const max of [99, 101, 150, 0]) {
    assert.throws(() => assertCombatRules({ ...DEF_0001, energy: { max } }), new RegExp(`Energy max ${max}: it is 100 for every fighter`));
  }
});

// ---- Energy: the Dash, the air dash and the Dash cancel --------------------------------

test('every fighter pays exactly 25 for a ground Dash, an air dash and a Dash cancel, and nothing for running, jumps or a fast fall', () => {
  assert.equal(DASH_ENERGY_COST, 25);
  for (const c of CHARACTERS) {
    const who = `#${c.id}`;
    assert.deepEqual([resolveEnergy(c.energy).dashCost, resolveEnergy(c.energy).dashCancelCost], [25, 25], who);
    // The Dash.
    const ground = makeFighter({ character: c });
    ground.step({ runRight: true, mouvementRightPressed: true });
    assert.ok(ground.fighter.dash && !ground.fighter.dash.air, `${who}: a Dash`);
    assert.equal(ground.fighter.combat.energy, 100 - 25, `${who}: the Dash, 25`);
    // The air dash.
    const air = makeFighter({ character: c });
    air.step(P('jump'));
    for (let i = 0; i < 5; i++) air.step({ jump: true });
    assert.equal(air.fighter.combat.energy, 100, `${who}: jumping is free`);
    air.step({ runRight: true, mouvementRightPressed: true });
    assert.ok(air.fighter.dash?.air, `${who}: an air dash`);
    assert.equal(air.fighter.combat.energy, 100 - 25, `${who}: the air dash, 25`);
    // The Dash cancel, out of an attack that hit.
    const d = duel({ attackerCharacter: c, gap: 40 });
    untilCancellable(d);
    const before = d.attacker.combat.energy;
    d.tick({ runRight: true, mouvementRightPressed: true });
    assert.ok(d.attacker.dash, `${who}: a Dash cancel`);
    assert.equal(d.attacker.combat.energy, before - 25, `${who}: the Dash cancel, 25`);
    // Running, the air jumps, turning, the fast fall: free (the refill only).
    const free = makeFighter({ character: c });
    free.fighter.combat.setEnergy(50);
    let last = 50;
    for (const held of [
      ...Array(20).fill({ runRight: true }), ...Array(5).fill({ runLeft: true }), P('jump'), ...Array(8).fill({}),
      P('jump'), ...Array(8).fill({}), P('jump'), ...Array(20).fill({ down: true }), ...Array(30).fill({ down: true, runLeft: true }),
    ]) {
      free.step(held);
      assert.ok(near(free.fighter.combat.energy, last + resolveEnergy(c.energy).regen * DT), `${who}: nothing spent (${free.fighter.state})`);
      last = free.fighter.combat.energy;
    }
  }
});

// ---- Energy: the Shield -------------------------------------------------------------------

test('every fighter\'s Shield pays exactly 15 per block, a perfect block\'s included: no discount, nothing back', () => {
  assert.equal(BLOCK_ENERGY_COST, 15);
  for (const c of CHARACTERS) {
    const who = `#${c.id}`;
    const still = { ...c, energy: { regen: 0 } };
    // Ordinary: up long before the Jab.
    const d = duel({ targetCharacter: still });
    d.tick({}, SHIELD);
    for (let i = 0; i < 20; i++) d.tick({}, HOLD);
    d.tick(P('attack1'), HOLD);
    for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
    assert.deepEqual([d.events[0].type, d.events[0].perfect, d.events[0].energyCost, d.events[0].damage], ['block', false, 15, 0], who);
    assert.equal(d.target.combat.energy, 85, `${who}: 15 off`);
    // Perfect: raised just before it lands (the Jab lands 8 steps after
    // its press).
    const p = duel({ targetCharacter: still });
    p.tick(P('attack1'));
    p.tick();
    p.tick({}, SHIELD);
    for (let i = 0; i < 30 && !p.events.length; i++) p.tick({}, HOLD);
    assert.deepEqual([p.events[0].type, p.events[0].perfect, p.events[0].energyCost], ['block', true, 15], `${who}: perfect, the same 15`);
    assert.equal(p.target.combat.energy, 85, `${who}: and nothing given back after`);
    for (let i = 0; i < 60; i++) p.tick({}, HOLD);
    assert.equal(p.target.combat.energy, 85, `${who}: not a step later either`);
    // A blocked event reports no damage: it dealt none (no authored hit
    // deals 0; this is no hit).
    assert.equal(p.events[0].damage, 0);
    assert.equal(p.target.combat.launchPoint, 0);
  }
});

// ---- Energy: the Deflect -------------------------------------------------------------------

test('every fighter\'s Deflect pays exactly 15 as it starts, whiff or hit, never while exhausted, and nothing it does gives any back', () => {
  assert.equal(DEFLECT_ENERGY_COST, 15);
  for (const c of CHARACTERS) {
    const who = `#${c.id}`;
    const regen = resolveEnergy(c.energy).regen * DT;
    // A whiff: nothing to strike, still 15.
    const whiff = makeFighter({ character: c });
    aloft(whiff.fighter, 100);
    whiff.step(SHIELD);
    assert.equal(whiff.fighter.combat.attack?.def.id, 'deflect', who);
    assert.equal(whiff.fighter.combat.energy, 100 - 15, `${who}: a whiffed Deflect, 15 as it starts`);
    let steps = 0;
    while (whiff.fighter.combat.attack) {
      whiff.step({});
      steps++;
    }
    assert.ok(near(whiff.fighter.combat.energy, 85 + steps * regen), `${who}: the refill alone after it`);
    // A hit: the same 15, and the hit gives nothing back.
    const hit = duel({ attackerCharacter: c, gap: 30 });
    aloft(hit.attacker, 500);
    aloft(hit.target, 500);
    hit.tick(SHIELD);
    assert.equal(hit.attacker.combat.energy, 85, `${who}: 15`);
    let n = 0;
    while (!hit.events.length) {
      hit.tick();
      n++;
    }
    assert.equal(hit.events[0].move, 'deflect');
    assert.equal(hit.events[0].damage, 3, `${who}: the Deflect still deals 3`);
    assert.ok(near(hit.attacker.combat.energy, 85 + n * regen), `${who}: no refund for landing it`);
    // Exhausted: no Deflect at all, and nothing taken.
    const tired = makeFighter({ character: c });
    aloft(tired.fighter, 100);
    tired.fighter.combat.setEnergy(0);
    tired.step(SHIELD);
    assert.equal(tired.fighter.combat.attack, null, `${who}: exhausted, no Deflect`);
    assert.equal(tired.fighter.combat.energyExhausted, true);
    // Any Energy left, not exhausted, is enough: it takes the rest.
    const low = makeFighter({ character: c });
    aloft(low.fighter, 100);
    low.fighter.combat.setEnergy(6);
    low.step(SHIELD);
    assert.equal(low.fighter.combat.attack?.def.id, 'deflect', `${who}: on 6`);
    assert.deepEqual([low.fighter.combat.energy, low.fighter.combat.energyExhausted], [0, true], `${who}: all it had`);
  }
});

test('turning a projectile back with a Deflect gives no Energy back: the 15 it cost is all that moves, the refill aside', () => {
  for (const c of CHARACTERS) {
    const who = `#${c.id}`;
    const regen = resolveEnergy(c.energy).regen * DT;
    // #0001 hangs 120 units off, level with it: the shot it turns back
    // flies straight into its thrower.
    const d = duel({ targetCharacter: c, gap: 120 });
    aloft(d.target, 400);
    aloft(d.attacker, 400);
    d.tick({}, SHIELD);
    assert.equal(d.target.combat.energy, 85, `${who}: 15 as it starts`);
    let n = 0;
    while (d.target.combat.phase !== 'active') {
      d.tick();
      n++;
    }
    const box = worldBox(d.target, d.target.deflect.hitbox, {});
    const def = d.attacker.projectileDefs.attack2_object;
    const red = new Projectile({
      owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: box.x - def.speed * DT, y: box.y + box.h / 2, direction: 1,
    });
    d.projectiles.push(red);
    d.tick();
    n++;
    assert.equal(red.owner, d.target, `${who}: turned back`);
    assert.ok(near(d.target.combat.energy, 85 + n * regen), `${who}: no refund, no bonus refill`);
    // Nor when the turned-back shot lands on its old owner.
    for (let i = 0; i < 20 && !d.events.some((e) => e.projectile === red); i++) {
      d.tick();
      n++;
    }
    assert.ok(d.events.some((e) => e.projectile === red && e.target === d.attacker), `${who}: it struck its thrower`);
    assert.ok(near(d.target.combat.energy, Math.min(100, 85 + n * regen)), `${who}: still the refill alone`);
  }
});

test('no defense ever improves Energy: an event never carries a negative cost, and a fighter\'s bar only climbs at its own refill rate', () => {
  const source = (file) => readFileSync(ROOT + file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  // The engine never raises Energy anywhere but the refill and a full refill.
  for (const file of ['js/game/combat/combat.js', 'js/game/combat/deflect.js', 'js/game/combat/defense.js', 'js/game/combat/projectile.js', 'js/game/fighters/fighter.js']) {
    assert.doesNotMatch(source(file), /regenEnergy|refillEnergy\(\)|setEnergy\([^)]*\+/, `${file}: no Energy given for anything`);
  }
  // A real exchange of blocks, perfect blocks and Deflects: the bar never
  // rises faster than the refill.
  for (const c of CHARACTERS) {
    const d = duel({ targetCharacter: c, gap: 40 });
    const regen = resolveEnergy(c.energy).regen * DT;
    let last = d.target.combat.energy;
    for (let i = 0; i < 240; i++) {
      const raise = i % 40 === 6 ? SHIELD : i % 40 < 30 ? HOLD : {};
      d.tick(i % 20 === 0 ? P('attack1') : {}, raise);
      assert.ok(d.target.combat.energy <= last + regen + 1e-9, `#${c.id}: step ${i}`);
      last = d.target.combat.energy;
    }
    assert.ok(d.events.some((e) => e.type === 'block'), `#${c.id}: it did block`);
    assert.ok(d.events.every((e) => e.energyCost >= 0));
  }
});

// ---- Damage -------------------------------------------------------------------------------

// Every `damage` written anywhere in `node`, with where it was found.
function authoredDamage(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'damage') out.push([path + key, value]);
    else authoredDamage(value, `${path}${key}.`, out);
  }
  return out;
}

// Every hit fighter definition `c` can deal, resolved as the engine holds
// it: [where, damage].
function resolvedHits(c) {
  const { fighter: f } = makeFighter({ character: c });
  const out = [];
  for (const [id, atk] of Object.entries(f.attacks)) {
    if (atk.pending) continue;
    if (atk.hits) for (const h of atk.hits) out.push([`${id} hit ${h.index + 1}`, h.damage]);
    else if (atk.hitbox) out.push([id, atk.damage]);
  }
  if (f.deflect) out.push(['deflect', f.deflect.damage]);
  for (const [id, p] of Object.entries(f.projectileDefs)) {
    out.push([id, p.damage]);
    if (p.finisher) out.push([`${id} finisher`, p.finisher.damage]);
  }
  for (const [id, t] of Object.entries(f.techniqueDefs)) if (t.burst) out.push([`${id} burst`, t.burst.hit.damage]);
  for (const [id, s] of Object.entries(f.summonDefs)) {
    for (const attack of [s.attack, s.noGround?.attack].filter(Boolean)) {
      const atk = f.attacks[attack];
      for (const h of atk.hits ?? [atk]) out.push([`${id} summon (${attack})`, h.damage]);
    }
  }
  return out;
}

test('every hit in the game deals 1, 3, 5 or 10: every attack, strike, aerial, Deflect, projectile, finisher, technique burst and summon', () => {
  assert.deepEqual([...ALLOWED_DAMAGE_VALUES], [1, 3, 5, 10]);
  assert.ok(Object.isFrozen(ALLOWED_DAMAGE_VALUES));
  const kinds = new Set();
  for (const c of CONTENT) {
    // What each definition writes (a multi-hit attack writes no damage of
    // its own: only its strikes do)...
    for (const [where, damage] of authoredDamage(c)) assert.ok(TIERS.has(damage), `#${c.id} ${where}: ${damage}`);
    // ...and every hit the engine resolves from it.
    for (const [where, damage] of resolvedHits(c)) {
      assert.ok(TIERS.has(damage), `#${c.id} ${where}: ${damage}`);
      kinds.add(where.replace(/^\S+ ?/, '').replace(/\d+/g, '#') || 'single');
    }
  }
  for (const kind of ['single', 'hit #', 'finisher', 'burst', 'summon (attack#)']) assert.ok(kinds.has(kind), `covered: ${kind} (${[...kinds]})`);
  // The derived sum of a multi-hit attack may be anything (#0002's One-Two
  // is 1 + 3 = 4): it is no hit of its own.
  const { fighter } = makeFighter({ character: DEF_0002 });
  assert.equal(fighter.attacks.attack1.damage, 4);
  assert.deepEqual(fighter.attacks.attack1.hits.map((h) => h.damage), [1, 3]);
});

test('#0001 and #0002 deal the retuned tiers: Hollow Purple 10, the High Kick 5, every former 2 now 3, the Deflect 3', () => {
  const hits = (c) => Object.fromEntries(resolvedHits(c));
  const one = hits(DEF_0001);
  assert.deepEqual(
    ['attack1', 'midair_attack1', 'attack2_object', 'attack3_object', 'attack3_object finisher', 'midair_attack2', 'midair_attack3',
      'attack4 burst', 'extra_attack', 'attack5_object', 'deflect'].map((id) => [id, one[id]]),
    [['attack1', 3], ['midair_attack1', 3], ['attack2_object', 3], ['attack3_object', 1], ['attack3_object finisher', 3],
      ['midair_attack2', 3], ['midair_attack3', 3], ['attack4 burst', 3], ['extra_attack', 5], ['attack5_object', 10], ['deflect', 3]],
  );
  const two = hits(DEF_0002);
  assert.deepEqual(
    ['attack1 hit 2', 'midair_attack1', 'midair_attack2', 'attack3', 'midair_attack3 hit 4', 'extra_attack_object finisher', 'deflect']
      .map((id) => two[id]),
    [3, 3, 3, 3, 3, 3, 3],
  );
  // Its ticks and the Rapid Kicks' finisher are as they were: 1 and 3.
  assert.deepEqual([two['attack1 hit 1'], two['attack2 hit 1'], two['attack2 hit 4'], two.extra_attack_object], [1, 1, 3, 1]);
});

test('a hit authored off the tiers is refused at once, naming it, wherever it is written', () => {
  const box = { x: 0, y: -10, w: 10, h: 10 };
  for (const bad of [0, 2, 4, 6, 7, 8, 9, 11, 12, 2.5, -1, -3, '3', null, NaN]) {
    const shown = typeof bad === 'string' ? `'${bad}'` : String(bad);
    const said = new RegExp(`declares damage ${shown.replace(/[.]/g, '\\.')}: every hit deals 1, 3, 5 or 10`);
    assert.throws(() => createAttackDefinition({ id: 'a', hitbox: box, damage: bad }), said, `attack: ${shown}`);
    assert.throws(() => createAttackDefinition({ id: 'a', hitbox: box, hits: [{ at: 0, active: 0.1, damage: bad }] }), said, `strike: ${shown}`);
    assert.throws(() => createProjectileDefinition({ id: 'p', damage: bad }), said, `projectile: ${shown}`);
    assert.throws(() => createProjectileDefinition({ id: 'p', damage: 1, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: bad } }), said, `finisher: ${shown}`);
    assert.throws(() => createTechniqueDefinition({ id: 't', burst: { hitbox: box, hit: { damage: bad } } }), said, `burst: ${shown}`);
    assert.throws(() => createDeflectDefinition({ ...DEF_0001.deflect, damage: bad }), /every Deflect deals 3/, `deflect: ${shown}`);
  }
  // Leaving it out is no way round it.
  assert.throws(() => createAttackDefinition({ id: 'a', hitbox: box }), /Attack "a" declares no damage/);
  assert.throws(() => createProjectileDefinition({ id: 'p' }), /Projectile "p" declares no damage/);
  // A throw's own attack has no hitbox: its projectile deals the damage,
  // and the attack may not invent one.
  assert.equal(createAttackDefinition({ id: 'throw', hitbox: null, projectile: { id: 'p', spawnAt: 0 } }).damage, 0);
  assert.throws(() => createAttackDefinition({ id: 'throw', hitbox: null, damage: 3 }), /declares damage but has no hitbox/);
  // Every tier is fine.
  for (const ok of ALLOWED_DAMAGE_VALUES) assert.equal(resolveHitDamage(ok), ok);
  // And the registry refuses a definition that breaks it as it loads, so a
  // future fighter's damage 2 never reaches a match.
  const future = { ...DEF_0002, attacks: { ...DEF_0002.attacks, attack1: { ...DEF_0002.attacks.attack3, damage: 2 } } };
  assert.throws(() => assertCombatRules(future), /Attack "attack1" declares damage 2/);
  const futureShot = { ...DEF_0001, projectiles: { ...DEF_0001.projectiles, attack5_object: { ...DEF_0001.projectiles.attack5_object, damage: 12 } } };
  assert.throws(() => assertCombatRules(futureShot), /Projectile "attack5_object" declares damage 12/);
  for (const c of CHARACTERS) assert.doesNotThrow(() => assertCombatRules(c), `#${c.id}`);
});

// ---- Difficulty -----------------------------------------------------------------------------

test('difficulty is judgement only: a profile holds the CPU\'s traits and nothing the fight is made of', () => {
  for (const id of DIFFICULTY_IDS) {
    assert.deepEqual(Object.keys(getDifficultyProfile(id)).sort(), Object.keys(CAPABILITY).sort(), id);
  }
  // No module that builds or resolves a fighter, a hit, a launch or Energy
  // reads a difficulty: none of them can scale anything by one.
  const files = (dir) => readdirSync(ROOT + dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : []);
  for (const file of [
    ...files('js/game/combat/'), ...files('js/game/fighters/'), 'js/game/physics.js',
    'js/data/launch.js', 'js/data/movement.js', 'js/data/characters.js', ...files('js/data/characters/'),
  ]) {
    const code = readFileSync(ROOT + file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /difficulty|getDifficultyProfile|\.profile\b/, `${file}: never reads a difficulty`);
  }
});

// `action` pressed by `controller` (a CPU of some level given that one
// intent, or a player pressing it on step 1) at a still opponent 45 units
// away with 40 Launch Point, holding `foeHeld`, on the real Fighter and
// CombatSystem. What the fighter was built as, and the first event: the
// steps from the press to it, and everything it resolved to.
function exchange(controller, action, foeHeld = {}) {
  const sprites = fakeSpritesOf(DEF_0001);
  const foe = new Fighter({ def: DEF_0001, sprites, stage: STAGE, slot: 'p1', spawn: { x: 545, facing: -1 }, controller: { getInput: () => ({ ...foeHeld }) } });
  const me = new Fighter({ def: DEF_0001, sprites, stage: STAGE, slot: 'p2', spawn: { x: 500, facing: 1 }, controller });
  foe.opponent = me;
  me.opponent = foe;
  const system = new CombatSystem();
  const world = { stage: STAGE, projectiles: [], clones: [], combat: system, fighters: [foe, me], score: { p1: 0, p2: 0 }, timeLeft: 99 };
  const ctx = { stage: STAGE, gravity: CONFIG.sim.gravity, battle: world };
  foe.combat.launchPoint = 40;
  if (controller instanceof CombatAIController) {
    // Bound to its fighter, its own neutral thinking paused: the one
    // intent below is all it does, the same on every level.
    me.update(DT, ctx);
    controller.thinkTimer = Infinity;
    controller.setIntent({ kind: 'attack', action, face: 1, until: controller.clock + 0.3 });
  }
  let pressedAt = null;
  const events = [];
  for (let n = 0; n < 60 && !events.length; n++) {
    foe.update(DT, ctx);
    me.update(DT, ctx);
    if (pressedAt === null && me.combat.attack) pressedAt = n;
    events.push(...system.update([foe, me], [], []));
    if (events.length) {
      assert.notEqual(pressedAt, null, `${action}: started by its own controller`);
      const e = events[0];
      return {
        built: JSON.stringify({
          attacks: me.attacks, deflect: me.deflect, energy: me.energyDef, movement: me.movement, projectiles: me.projectileDefs,
          techniques: me.techniqueDefs, launch: me.launchReaction, gravity: me.body.gravityScale, maxFall: me.body.maxFall,
        }),
        hit: [n - pressedAt, e.type, e.move, e.damage, e.energyCost, e.launchPointAfter, e.launchStrength, e.finalLaunch.x, e.finalLaunch.y, e.hitstun, e.perfect],
        me,
      };
    }
  }
  throw new Error(`${action} never landed`);
}

test('the same attack resolves identically under Easy, Medium, Hard and Brutal: damage, launch, stun, Energy, timing', () => {
  const runs = DIFFICULTY_IDS.map((difficulty) => {
    const cpu = () => new CombatAIController({ difficulty, rng: mulberry32(5) });
    const kick = exchange(cpu(), 'extra_attack');
    const jab = exchange(cpu(), 'attack1');
    const blocked = exchange(cpu(), 'attack1', HOLD);
    // What its own Dash and Deflect cost, the fighter built under this CPU.
    const { me } = kick;
    me.reset(STAGE);
    const dashed = me.tryDash(1) && me.combat.energy;
    me.reset(STAGE);
    aloft(me, 300);
    const deflected = me.tryDeflect() && me.combat.energy;
    return { built: kick.built, hits: [kick.hit, jab.hit, blocked.hit], dashed, deflected, profile: getDifficultyProfile(difficulty) };
  });
  for (const r of runs) {
    assert.equal(r.built, runs[0].built, 'the fighter itself: every attack, its Energy, its movement');
    assert.deepEqual(r.hits, runs[0].hits, 'every hit and block, step for step');
    assert.deepEqual([r.dashed, r.deflected], [75, 85], 'the Dash and the Deflect, 25 and 15');
  }
  const [kick, jab, blocked] = runs[0].hits;
  assert.deepEqual(kick.slice(1, 5), ['hit', 'extra_attack', 5, 0]);
  assert.deepEqual(jab.slice(1, 5), ['hit', 'attack1', 3, 0]);
  assert.deepEqual(blocked.slice(1, 5), ['block', 'attack1', 0, 15]);
  // The profiles do differ: what changes is how the CPU thinks.
  assert.notDeepEqual(runs[0].profile, runs[3].profile);
});

test('a CPU at any level and a player deal the same damage with the same hit, through the same CombatSystem', () => {
  for (const action of ['extra_attack', 'attack1']) {
    let n = 0;
    const player = exchange(new PlayerController({ sample: () => (n++ === 0 ? P(action) : {}) }), action);
    for (const difficulty of DIFFICULTY_IDS) {
      const cpu = exchange(new CombatAIController({ difficulty, rng: mulberry32(1) }), action);
      assert.deepEqual(cpu.hit, player.hit, `${difficulty} ${action}`);
      assert.equal(cpu.built, player.built);
    }
  }
});

// ---- Cooldowns ------------------------------------------------------------------------------

test('#0001 has no cooldown on any move: every attack, its Deflect, Unlimited Void and Hollow Purple', () => {
  const { fighter } = makeFighter();
  for (const [id, atk] of Object.entries(fighter.attacks)) assert.equal(atk.cooldown, 0, id);
  for (const [id, spec] of Object.entries(DEF_0001.attacks)) assert.equal(spec.cooldown, 0, `${id}: written as 0`);
  assert.equal(fighter.deflect.cooldown, 0, 'the Deflect');
  assert.deepEqual(Object.values(fighter.techniqueDefs).map((t) => t.cooldown), [0, 0], 'Unlimited Void and Hollow Purple');
  // Using each leaves no cooldown behind, and the next one may start as
  // soon as the fighter is free.
  for (const button of ['attack4', 'attack5']) {
    const d = duel({ gap: 600 });
    d.tick(P(button));
    assert.equal(d.attacker.technique?.action, button);
    assert.equal(d.attacker.combat.abilityCooldowns.active(button), false, `${button}: no cooldown`);
    assert.equal(d.attacker.combat.abilityCooldowns.size, 0);
    while (d.attacker.technique) d.tick();
    d.tick(P(button));
    assert.equal(d.attacker.technique?.action, button, `${button}: again at once`);
  }
  for (const id of Object.keys(DEF_0001.attacks)) {
    const air = id.startsWith('midair_');
    const { fighter: f, step } = makeFighter();
    if (air) aloft(f, 100);
    const button = id.replace('midair_', '');
    step(P(button));
    assert.equal(f.combat.attack?.def.id, id, id);
    while (f.combat.attack) step({});
    assert.equal(f.combat.cooldowns.size, 0, `${id}: nothing left to wait out`);
  }
  // Its phases are untouched: the moves still take their time.
  assert.ok(fighter.attacks.attack1.total > 0 && fighter.attacks.extra_attack.startup > 0);
  assert.ok(fighter.techniqueDefs.attack5 && makeFighter().fighter.sprites.duration('attack5_cast') > 0);
});

test('no fighter\'s attack waits more than 0.05 s to repeat; a longer cooldown is refused, and a summon or technique keeps its own', () => {
  assert.equal(MAX_ATTACK_COOLDOWN, 0.05);
  for (const c of CONTENT) {
    const { fighter } = makeFighter({ character: c });
    for (const atk of [...Object.values(fighter.attacks), fighter.deflect].filter(Boolean)) {
      assert.ok(atk.cooldown >= 0 && atk.cooldown <= MAX_ATTACK_COOLDOWN, `#${c.id} ${atk.id}: ${atk.cooldown}`);
    }
  }
  // #0002's: every one of them the shortest there is, none raised.
  const { fighter: two } = makeFighter({ character: DEF_0002 });
  assert.deepEqual(
    Object.fromEntries(Object.entries(two.attacks).map(([id, a]) => [id, a.cooldown])),
    { attack1: 0.05, midair_attack1: 0.05, attack2: 0.05, midair_attack2: 0.05, attack3: 0.05, midair_attack3: 0.05, extra_attack: 0.05 },
  );
  assert.equal(two.deflect.cooldown, 0.05);
  for (const cooldown of [0.06, 0.1, 1.2, -0.01, '0.05']) {
    assert.throws(() => createAttackDefinition({ id: 'a', damage: 1, cooldown }), /repeat cooldown is 0 to 0\.05 s/, String(cooldown));
    assert.throws(() => createDeflectDefinition({ ...DEF_0002.deflect, cooldown }), /repeat cooldown is 0 to 0\.05 s/);
  }
  // A summon's or a technique's own cooldown is its fighter's choice.
  assert.equal(createTechniqueDefinition({ id: 't', cooldown: 12 }).cooldown, 12);
  // The repeat delay it leaves after the fighter is free: three steps at most.
  for (const c of CHARACTERS) {
    const { fighter: f, step } = makeFighter({ character: c });
    step(P('attack1'));
    while (f.combat.attack) step({});
    let waited = 0;
    while (!f.combat.attack && waited < 30) {
      step(P('attack1'));
      waited++;
    }
    assert.ok(waited <= Math.round(MAX_ATTACK_COOLDOWN / DT) + 1, `#${c.id}: attack1 again within ${waited} steps`);
  }
});

// ---- Movement -------------------------------------------------------------------------------

test('every fighter runs, jumps, falls and Dashes on the one baseline, and no definition may give itself another', () => {
  const fighters = CONTENT.map((c) => makeFighter({ character: c }).fighter);
  for (const f of fighters) {
    assert.equal(f.movement, BASE_FIGHTER_MOVEMENT, `#${f.def.id}: the very same object`);
    assert.equal(f.body.gravityScale, BASE_FIGHTER_MOVEMENT.gravityScale, `#${f.def.id}: gravity scale`);
    assert.equal(f.body.maxFall, BASE_FIGHTER_MOVEMENT.maxFallSpeed, `#${f.def.id}: fall limit`);
  }
  const [first] = fighters;
  for (const field of [
    'maxSpeed', 'acceleration', 'deceleration', 'turnBoost', 'airAcceleration', 'airDeceleration', 'jumpVelocity', 'highJumpWindow',
    'highJumpHeight', 'airJumps', 'airJumpRatio', 'gravityScale', 'maxFallSpeed', 'fastFallSpeed', 'fastFallAcceleration', 'dashSpeed',
    'dashDuration', 'airDashSpeed', 'airDashDuration', 'airDashUses', 'coyoteTime', 'jumpBuffer', 'attackBuffer',
  ]) {
    assert.ok(MOVEMENT_FIELDS.includes(field), field);
    for (const f of fighters) assert.equal(f.movement[field], first.movement[field], `#${f.def.id} ${field}`);
  }
  for (const f of fighters.filter((x) => CHARACTERS.includes(x.def))) {
    assert.deepEqual([f.dashDuration, f.airDashDuration], [BASE_FIGHTER_MOVEMENT.dashDuration, BASE_FIGHTER_MOVEMENT.airDashDuration]);
  }
  // A definition that declares any of it, or a movement block, never loads.
  for (const field of MOVEMENT_FIELDS) {
    assert.throws(() => assertUniversalMovement({ ...DEF_0001, [field]: BASE_FIGHTER_MOVEMENT[field] }), new RegExp(`declares \`${field}\``));
  }
  assert.throws(() => assertUniversalMovement({ ...DEF_0002, movement: { maxSpeed: 600 } }), /declares `movement`/);
  for (const c of CHARACTERS) assert.equal('movement' in c, false, `#${c.id}`);
  // One world gravity for everyone, the arena's.
  assert.equal(CONFIG.sim.gravity, 2500);
  assert.match(readFileSync(ROOT + 'js/game/arena.js', 'utf8'), /this\.gravity = CONFIG\.sim\.gravity;/);
});
