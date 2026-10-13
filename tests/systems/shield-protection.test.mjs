// Run with node --test tests/systems/shield-protection.test.mjs (no dependencies).
// Absolute Shield protection: every attack is blockable. A target whose
// Shield is up when a hit reaches it blocks that hit, whatever made it (a
// melee strike, a multi-hit string, a projectile, a piercing or erasing
// one, a finisher, a technique's burst, a summoned clone's strike, a
// Deflect's strike, a projectile turned back) and however hard it hits:
// no Launch Point, no launch, no stun, no paralysis, no carry, and nothing
// later through a callback, a lingering field or a projectile flying on.
// Every source is driven through real fights (the Fighter, its inputs, the
// projectiles, the clones and the CombatSystem, see
// tests/helpers/fighter-harness.mjs) against an open target, a raised
// Shield, a perfect one, one struck from behind and one at low Energy; the
// rest (same-step hits, exhaustion, real-hit handlers, the CPU's
// prediction) through the CombatSystem itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { Projectile } from '../../js/game/combat/projectile.js';
import { Clone } from '../../js/game/combat/summon.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { duel, fakeSpritesOf, makeFighter, probeHit, steps } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { FUTURE_FIGHTER } from '../fighters/fixtures/offense-fighters.mjs';

const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const SHIELD = { shield: true, shieldPressed: true };
const HOLD = { shield: true };

// Every damage source, driven by its attacker's own inputs (`drive`, step
// n's input) from `gap` units away. The target is #0001 unless `target`
// says otherwise; both have a Shield.
const SOURCES = [
  { name: '#0001 Jab (melee)', attacker: DEF_0001, gap: 40, drive: (n) => (n === 0 ? P('attack1') : {}) },
  { name: '#0001 High Kick (a launcher)', attacker: DEF_0001, gap: 40, drive: (n) => (n === 0 ? P('extra_attack') : {}) },
  { name: '#0001 Red (a projectile that shoves a Shield)', attacker: DEF_0001, gap: 200, drive: (n) => (n === 0 ? P('attack2') : {}) },
  { name: '#0001 Maximum Blue (a pulling, piercing projectile and its finisher)', attacker: DEF_0001, gap: 160, drive: (n) => (n === 0 ? P('attack3') : {}) },
  { name: '#0001 Red Kick (a homing dash)', attacker: DEF_0001, gap: 120, drive: (n) => (n === 0 ? P('jump') : n === 6 ? P('attack2') : {}) },
  { name: '#0001 Unlimited Void (a technique\'s paralyzing burst)', attacker: DEF_0001, gap: 200, drive: (n) => (n === 0 ? P('attack4') : {}) },
  { name: '#0001 Hollow Purple (an erasing projectile, 10 and Base Launch 3)', attacker: DEF_0001, gap: 400, drive: (n) => (n === 0 ? P('attack5') : {}) },
  { name: '#0001 Deflect (its strike)', attacker: DEF_0001, gap: 30, drive: (n) => (n === 0 ? P('jump') : n === 1 ? SHIELD : {}) },
  { name: '#0002 One-Two (a multi-hit string)', attacker: DEF_0002, gap: 40, drive: (n) => (n === 0 ? P('attack1') : {}) },
  { name: '#0002 Rapid Kicks (four strikes)', attacker: DEF_0002, gap: 40, drive: (n) => (n === 0 ? P('attack2') : {}) },
  { name: '#0002 Spin Attack (a roll)', attacker: DEF_0002, gap: 150, drive: (n) => (n === 0 ? P('attack3') : {}) },
  { name: '#0002 Homing Attack (a homing dash)', attacker: DEF_0002, gap: 120, drive: (n) => (n === 0 ? P('jump') : n === 6 ? P('attack1') : {}) },
  { name: '#0002 Blue Tornado (a rising string)', attacker: DEF_0002, gap: 30, drive: (n) => (n === 0 ? P('jump') : n === 2 ? P('attack3') : {}) },
  { name: '#0002 Whirlwind (a piercing projectile and its finisher)', attacker: DEF_0002, gap: 150, drive: (n) => (n === 0 ? P('extra_attack') : {}) },
  { name: '#0002 Deflect (its strike)', attacker: DEF_0002, gap: 30, drive: (n) => (n === 0 ? P('jump') : n === 3 ? SHIELD : {}) },
  { name: 'a summoned clone\'s strike (from behind its target)', attacker: SAMPLE_FIGHTER, gap: 200, drive: (n) => (n === 0 ? P('attack3') : {}) },
  { name: 'Shadow Clone (a summon that attacks later, and paralyzes)', attacker: FUTURE_FIGHTER, gap: 200, drive: (n) => (n === 0 ? P('attack3') : {}) },
  { name: 'Meteor Storm (a technique that releases two damaging sources)', attacker: FUTURE_FIGHTER, gap: 100, drive: (n) => (n === 0 ? P('attack4') : {}) },
  { name: 'Poison Field (a lingering field: repeated, delayed damage)', attacker: FUTURE_FIGHTER, gap: 140, drive: (n) => (n === 0 ? P('attack5') : {}) },
  { name: 'Counter Pulse (a defense and an attack at once, paralyzing)', attacker: FUTURE_FIGHTER, gap: 40, drive: (n) => (n === 0 ? P('extra_attack') : {}) },
  { name: 'Phantom Strike (a string ending in a heavy launcher)', attacker: FUTURE_FIGHTER, gap: 40, drive: (n) => (n === 0 ? P('attack1') : {}) },
  { name: '#0002 One-Two on #0002', attacker: DEF_0002, target: DEF_0002, gap: 40, drive: (n) => (n === 0 ? P('attack1') : {}) },
  { name: '#0001 Unlimited Void on #0002', attacker: DEF_0001, target: DEF_0002, gap: 200, drive: (n) => (n === 0 ? P('attack4') : {}) },
];

const LIMIT = steps(3);

// One fight: `source`'s attacker drives its move at the target, which
// guards as `guard` says ('none', 'raised': held from the start, 'perfect':
// raised `at` steps in, 'low': held from the start, down to 1 Energy on
// step `at`). `behind`
// turns the target's back to the attacker. Returns the duel and the step of
// each event on the target.
function fight(source, { guard = 'none', behind = false, at = -1, settle = LIMIT } = {}) {
  const target = source.target ?? DEF_0001;
  const d = duel({
    gap: source.gap, attackerCharacter: source.attacker, attackerSprites: fakeSpritesOf(source.attacker),
    targetCharacter: target, targetSprites: fakeSpritesOf(target), targetFacing: behind ? 1 : -1,
  });
  const on = [];
  const lp = [];
  for (let n = 0; n < settle; n++) {
    let held = {};
    if (guard === 'raised' || guard === 'low') held = n === 0 ? SHIELD : HOLD;
    if (guard === 'perfect' && n >= at) held = n === at ? SHIELD : HOLD;
    if (guard === 'low' && n === at) d.target.combat.setEnergy(1);
    const before = d.events.length;
    d.tick(source.drive(n), held);
    for (const e of d.events.slice(before)) if (e.target === d.target) on.push({ e, n, lp: d.target.combat.launchPoint });
    lp.push(d.target.combat.launchPoint);
  }
  return { d, on, lp };
}

// What a block leaves: nothing at all on the defender.
function assertBlocked(e, what) {
  assert.equal(e.type, 'block', what);
  assert.equal(e.attack, true, `${what}: an attack, blocked`);
  assert.equal(e.damage, 0, `${what}: no damage`);
  assert.equal(e.launchPointAfter, e.launchPointBefore, `${what}: no Launch Point`);
  assert.equal(e.launchStrength, 0, `${what}: no launch`);
  assert.equal(e.launchSpeed, 0);
  assert.equal(e.hitstun, 0, `${what}: no hitstun`);
  assert.equal(e.paralysis, 0, `${what}: no paralysis`);
}

for (const source of SOURCES) {
  test(`${source.name}: lands on an open target, and a raised Shield blocks all of it`, () => {
    const open = fight(source);
    assert.ok(open.on.length > 0, 'it reaches the target');
    assert.equal(open.on[0].e.type, 'hit');
    assert.ok(open.on.reduce((n, x) => n + x.e.damage, 0) > 0, 'and deals damage');

    const shut = fight(source, { guard: 'raised' });
    assert.ok(shut.on.length > 0, 'it reaches the Shield');
    for (const { e } of shut.on) assertBlocked(e, `${e.source} ${e.ability}`);
    assert.ok(shut.lp.every((v) => v === 0), 'the Launch Point never rises');
    assert.equal(shut.d.target.combat.immobilized, false, 'never paralyzed');
    assert.equal(shut.d.target.combat.stun, 0, 'never stunned');
    assert.equal(shut.d.target.combat.shielding, true, 'the guard held');
    // Lowered once it is all over: nothing it threw, cast, summoned or left
    // lingering comes through later.
    const after = shut.d.events.length;
    for (let i = 0; i < steps(2); i++) shut.d.tick({}, {});
    assert.equal(shut.d.events.slice(after).filter((e) => e.target === shut.d.target).length, 0, 'nothing later');
    assert.equal(shut.d.target.combat.launchPoint, 0);
    for (const { e } of shut.on) if (e.projectile) assert.equal(e.projectile.alive, false, 'a blocked projectile flies on no further');
  });

  test(`${source.name}: blocked from behind, by a perfect Shield and by a Shield on its last Energy`, () => {
    const back = fight(source, { guard: 'raised', behind: true });
    assert.ok(back.on.length > 0);
    for (const { e } of back.on) assertBlocked(e, `from behind: ${e.source} ${e.ability}`);
    assert.ok(back.lp.every((v) => v === 0));

    // A perfect Shield: raised just before the first contact the open fight
    // had, inside its perfect window.
    const open = fight(source);
    const contact = open.on[0].n;
    const perfect = fight(source, { guard: 'perfect', at: Math.max(1, contact - 3) });
    assert.ok(perfect.on.length > 0);
    assertBlocked(perfect.on[0].e, 'perfect');
    assert.equal(perfect.on[0].e.perfect, true, 'a perfect block');
    assert.equal(perfect.on[0].e.launchPointAfter, perfect.on[0].e.launchPointBefore);

    // Its last Energy, drained as the blow comes: the hit the Shield meets
    // is still blocked (it pays what is left and drops, exhausted); only
    // what comes after its fall may land.
    const raised = fight(source, { guard: 'raised' });
    const low = fight(source, { guard: 'low', at: raised.on[0].n });
    assert.ok(low.on.length > 0);
    const first = low.on[0];
    assertBlocked(first.e, 'on its last Energy');
    assert.ok(first.e.energyCost > 0 && first.e.energyCost < low.d.target.energyDef.shieldHitCost, `it pays what it has (${first.e.energyCost})`);
    assert.equal(first.e.launchPointAfter, 0, 'nothing through on that hit');
    assert.equal(low.d.target.combat.energyExhausted, true, 'and the Shield falls');
  });
}

// ---- Every hit of every fighter -----------------------------------------------------------

// Every hit fighter `f` can produce: each attack (each strike of a
// multi-hit one), each projectile and its finisher, each technique's
// burst, its Deflect.
function everyHit(f) {
  const out = [];
  for (const [id, atk] of Object.entries(f.attacks)) {
    if (atk.hits) for (const h of atk.hits) out.push([`${id} strike ${h.index + 1}`, h]);
    else if (atk.hitbox && atk.offense.attack) out.push([id, atk]);
  }
  for (const [id, p] of Object.entries(f.projectileDefs)) {
    out.push([id, p]);
    if (p.finisher) out.push([`${id} finisher`, p.finisher]);
  }
  for (const [id, t] of Object.entries(f.techniqueDefs)) if (t.burst) out.push([`${id} burst`, t.burst.hit]);
  if (f.deflect) out.push(['deflect', f.deflect]);
  return out;
}

test('every hit of every playable fighter and of the test fighters: blocked by a raised Shield, from either side, at any Launch Point', () => {
  for (const c of [...playableCharacters(), SAMPLE_FIGHTER, FUTURE_FIGHTER]) {
    const { fighter: f } = makeFighter({ character: c, sprites: fakeSpritesOf(c), x: 500 });
    for (const [what, hit] of everyHit(f)) {
      for (const [facing, kind] of [[1, null], [-1, 'projectile'], [1, 'technique'], [-1, 'summon']]) {
        const t = makeFighter({ x: 540, facing });
        t.step(SHIELD);
        for (let i = 0; i < steps(0.2); i++) t.step(HOLD);
        assert.equal(t.fighter.combat.shielding, true);
        t.fighter.combat.launchPoint = 150;
        const system = new CombatSystem();
        const opts = kind === 'projectile' ? { projectile: { ability: what } } : kind === 'technique' ? { technique: { def: { id: what } } }
          : kind === 'summon' ? { summon: { def: { id: what } } } : {};
        const e = system.applyHit(f, t.fighter, hit, { ...opts, velocity: { x: 800, y: -200 } });
        assertBlocked(e, `#${c.id} ${what} (${kind ?? 'melee'}, facing ${facing})`);
        assert.equal(t.fighter.combat.launchPoint, 150);
        assert.equal(t.fighter.combat.immobilized, false);
        assert.equal(t.fighter.body.vy, 0, 'never carried or launched');
      }
    }
  }
});

// ---- Deflect -----------------------------------------------------------------------------

test('a projectile turned back by a Deflect is blockable by its thrower\'s Shield, and lands in full on an open thrower', () => {
  for (const guard of [false, true]) {
    // #0001 casts Hollow Purple at #0002 in the air, which Deflects it back;
    // #0001 then either guards or not.
    const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF_0002, targetSprites: fakeSpritesOf(DEF_0002), gap: 260 });
    if (guard) {
      d.tick(SHIELD, {});
      for (let i = 0; i < steps(0.2); i++) d.tick(HOLD, {});
    }
    const held = guard ? HOLD : {};
    Object.assign(d.target.body, { y: 700, prevY: 700, vx: 0, vy: 0, grounded: false, ground: null });
    d.tick(held, SHIELD);
    while (d.target.combat.phase !== 'active') d.tick(held, {});
    const box = d.target.deflect.hitbox;
    const def = d.attacker.projectileDefs.attack5_object;
    const x = d.target.body.x + d.target.facing * (box.x + box.w / 2);
    const purple = new Projectile({
      owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x, y: d.target.body.y + box.y + box.h / 2, direction: 1, ability: 'attack5',
    });
    purple.through.add(d.target);
    d.projectiles.push(purple);
    d.tick(held, {});
    assert.equal(purple.owner, d.target, 'turned back');
    assert.equal(purple.redirected, true);
    assert.equal(purple.def.offense.attack, true, 'still an attack');
    for (let i = 0; i < 120 && !d.events.some((e) => e.target === d.attacker); i++) d.tick(held, {});
    const e = d.events.find((x2) => x2.target === d.attacker);
    assert.ok(e, 'it reaches its thrower');
    assert.deepEqual([e.source, e.ability, e.redirected, e.attacker], ['projectile', 'attack5', true, d.target]);
    if (guard) {
      assertBlocked(e, 'turned back, still blockable');
      assert.equal(purple.alive, false, 'and the Shield stops it, erasing as it is');
      assert.equal(d.attacker.combat.launchPoint, 0);
    } else {
      assert.equal(e.type, 'hit');
      assert.equal(e.damage, 10);
    }
  }
});

test('a Deflect turns projectiles back and strikes, but is no Shield: a blow it does not turn back still hits it', () => {
  const d = duel({ gap: 30 });
  d.tick({}, P('jump'));
  d.tick({}, {});
  d.tick({}, SHIELD);
  assert.equal(d.target.combat.attack?.def.id, 'deflect');
  assert.equal(d.target.combat.shielding, false, 'never a Shield');
  d.target.combat.launchPoint = 30;
  const system = new CombatSystem();
  const e = system.applyHit(d.attacker, d.target, d.attacker.attacks.attack1);
  assert.equal(e.type, 'hit', 'struck like any attacker');
  assert.ok(e.damage > 0);
});

// ---- Same step, exhaustion, real-hit handlers --------------------------------------------

// Two projectiles of #0001's overlapping a shielding #0001 on the same step.
function volley(energy) {
  const a = makeFighter({ x: 300 });
  const t = makeFighter({ x: 600, facing: -1 });
  a.fighter.opponent = t.fighter;
  t.fighter.opponent = a.fighter;
  t.step(SHIELD);
  for (let i = 0; i < steps(0.2); i++) t.step(HOLD);
  t.fighter.combat.setEnergy(energy);
  const def = a.fighter.projectileDefs.attack5_object;
  const anim = a.fighter.sprites.projectile(def.animation);
  const shots = [0, 1].map(() => new Projectile({ owner: a.fighter, def, anim, x: 590, y: t.fighter.body.y - 50, direction: 1, ability: 'attack5' }));
  const system = new CombatSystem();
  const events = system.update([a.fighter, t.fighter], shots, []);
  return { events, target: t.fighter, shots };
}

test('same-step hits resolve in a fixed order: a Shield with Energy for both blocks both; one that runs dry on the first drops, and only then can the next land', () => {
  const full = volley(100);
  assert.deepEqual(full.events.map((e) => e.type), ['block', 'block']);
  assert.equal(full.target.combat.launchPoint, 0);
  assert.ok(full.shots.every((p) => !p.alive), 'both stopped');

  const dry = volley(15);
  assert.deepEqual(dry.events.map((e) => e.type), ['block', 'hit'], 'the first blocked; the Shield then dropped, exhausted');
  assert.equal(dry.events[0].energyCost, 15);
  assert.equal(dry.events[0].launchPointAfter, 0, 'nothing through on the hit the Shield met');
  assert.equal(dry.events[1].launchPointBefore, 0);
  assert.equal(dry.target.combat.energyExhausted, true);
  // Deterministic: the same every time.
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(volley(15).events.map((e) => [e.type, e.damage, e.energyCost]), dry.events.map((e) => [e.type, e.damage, e.energyCost]));
  }
});

test('a blocked hit never reaches what only a real hit does: the target\'s technique or summoning startup is not cut short by it', () => {
  for (const shielding of [true, false]) {
    const a = makeFighter({ x: 500 });
    const t = makeFighter({ x: 540, facing: -1 });
    if (shielding) {
      t.step(SHIELD);
      for (let i = 0; i < steps(0.2); i++) t.step(HOLD);
    }
    const calls = [];
    t.fighter.endTechnique = (reason) => calls.push(`technique:${reason}`);
    t.fighter.cancelSummon = () => calls.push('summon');
    t.fighter.takeHit = () => calls.push('takeHit');
    const e = new CombatSystem().applyHit(a.fighter, t.fighter, probeHit({ id: 'x', damage: 3, paralyze: 1 }));
    assert.equal(e.type, shielding ? 'block' : 'hit');
    assert.deepEqual(calls, shielding ? [] : ['technique:hit', 'summon', 'takeHit']);
  }
});

test('a piercing projectile\'s finisher is blocked like its first strike, and a lingering one stops at the Shield', () => {
  const a = makeFighter({ x: 300 });
  const t = makeFighter({ x: 600, facing: -1 });
  a.fighter.opponent = t.fighter;
  t.fighter.opponent = a.fighter;
  t.step(SHIELD);
  for (let i = 0; i < steps(0.2); i++) t.step(HOLD);
  const def = a.fighter.projectileDefs.attack3_object;
  const blue = new Projectile({ owner: a.fighter, def, anim: a.fighter.sprites.projectile(def.animation), x: 600, y: t.fighter.body.y - 50, direction: 1 });
  blue.hits = def.pierce.hits - 1;
  assert.equal(blue.nextHit, def.finisher, 'its next strike is its finisher');
  const [e] = new CombatSystem().update([a.fighter, t.fighter], [blue], []);
  assertBlocked(e, 'the finisher');
  assert.equal(blue.alive, false);
  assert.equal(t.fighter.combat.launchPoint, 0);
});

test('a clone\'s strike is blocked like its owner\'s would be, wherever it appears, and still credits its owner', () => {
  const owner = makeFighter({ character: SAMPLE_FIGHTER, sprites: fakeSpritesOf(SAMPLE_FIGHTER), x: 300 });
  const t = makeFighter({ x: 600, facing: -1 });
  owner.fighter.opponent = t.fighter;
  t.step(SHIELD);
  for (let i = 0; i < steps(0.2); i++) t.step(HOLD);
  const def = owner.fighter.summonDefs.attack3;
  for (const side of [1, -1]) {
    const clone = new Clone({
      owner: owner.fighter, target: t.fighter, def, attackDef: owner.fighter.attacks[def.attack],
      cloud: owner.fighter.sprites.effect(def.cloud), x: t.fighter.body.x - side * 20, y: t.fighter.body.y, facing: side,
    });
    clone.phase = 'attack';
    clone.attackTime = clone.attackDef.startup;
    const [e] = new CombatSystem().update([owner.fighter, t.fighter], [], [clone]);
    assertBlocked(e, `a clone facing ${side}`);
    assert.deepEqual([e.source, e.ability, e.attacker, e.summon], ['summon', 'attack3', owner.fighter, clone]);
    assert.equal(t.fighter.combat.launchPoint, 0);
  }
});

// ---- One door ------------------------------------------------------------------------------

// Every source file of the game, comments stripped.
function sources(dir = new URL('../../js/', import.meta.url)) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) out.push(...sources(url));
    else if (entry.name.endsWith('.js')) {
      out.push([url.pathname.split('/js/').pop(), readFileSync(url, 'utf8').replace(/^\s*\/\/.*$/gm, '')]);
    }
  }
  return out;
}

test('no hidden damage path: only CombatSystem.applyHit raises a Launch Point, stuns for a hit, paralyzes or decides a block', () => {
  const files = sources();
  assert.ok(files.length > 50);
  for (const [path, code] of files) {
    if (path === 'game/combat/combat.js') continue;
    assert.doesNotMatch(code, /\.applyHit\(/, `${path} resolves hits outside the CombatSystem`);
    assert.doesNotMatch(code, /\.paralyze\(/, `${path} paralyzes outside applyHit`);
    assert.doesNotMatch(code, /launchPoint\s*\+=/, `${path} adds Launch Point outside applyHit`);
    // Only the Launch Point's own recovery (down, never up) and its reset
    // write it elsewhere.
    if (path !== 'game/combat/combat-state.js') {
      assert.doesNotMatch(code, /combat\.launchPoint\s*=[^=]/, `${path} writes a Launch Point`);
    }
    // A fighter's hitstun is a hit's, except the wall bounce that follows a
    // real launch (Fighter.update), the one place it is topped up.
    const stuns = code.match(/combat\.stun\s*=[^=]/g) ?? [];
    assert.equal(stuns.length, path === 'game/fighters/fighter.js' ? 1 : 0, `${path} stuns outside applyHit`);
    assert.doesNotMatch(code, /unblockable\s*[:&|)]|\.unblockable\b|!def\.unblockable/, `${path} reads a Shield bypass`);
  }
  // And applyHit itself consults nothing of the hit to decide a block.
  const combat = files.find(([path]) => path === 'game/combat/combat.js')[1];
  assert.match(combat, /const blocked = tc\.shielding;/);
});
