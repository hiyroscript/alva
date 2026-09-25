// Run with node --test tests/launch.test.mjs (no dependencies).
// The Launch system (js/data/launch.js): Launch Point on every fighter, Base
// Launch 0-3 and Directional Launch on every hit, and the one formula that
// joins them. A hit's damage is added to the target's Launch Point first;
// its launch strength is then exactly Base Launch x that new Launch Point,
// Directional Launch only decides where it goes, and one factor
// (LAUNCH_UNIT_SPEED, 10 world units per second per point) turns it into a
// speed. Covers the registry and
// its validation, the shared resolvers, the real CombatSystem.applyHit path
// (melee, projectiles, clones and charged techniques alike), the Shield's
// blocked hits (no Launch Point, no launch), #0001's authored hits, Void respawns and a guard against the old
// Knockback architecture coming back. Runs the real Fighter, physics and
// combat (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  BASE_LAUNCH_VALUES, DIRECTIONAL_LAUNCHES, resolveBaseLaunch, resolveDirectionalLaunchValue, resolveHitLaunch,
  resolveLaunchStrength, resolveDirectionalLaunch, LAUNCH_UNIT_SPEED,
} from '../js/data/launch.js';
import * as launchModule from '../js/data/launch.js';
import { CHARACTERS } from '../js/data/characters.js';
import * as combatModule from '../js/game/combat.js';
import { CombatState, CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { createProjectileDefinition } from '../js/game/projectile.js';
import { createTechniqueDefinition } from '../js/game/charged-technique.js';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import { CONFIG } from '../js/config.js';
import { def, DT, fakeSprites, makeFighter, duel } from './fighter-harness.mjs';

const ROOT = new URL('../', import.meta.url);
// World units per second per point of launch strength.
const U = LAUNCH_UNIT_SPEED;
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

// Silences and collects console.warn while `fn` runs.
function warnings(fn) {
  const original = console.warn;
  const out = [];
  console.warn = (...args) => out.push(args.join(' '));
  try {
    return { value: fn(), warnings: out };
  } finally {
    console.warn = original;
  }
}

// A plain hit through the real attack-definition path: no stun or freeze,
// so only damage and launch are in play.
const probe = (damage, baseLaunch, directionalLaunch) => createAttackDefinition({
  id: 'probe', damage, baseLaunch, directionalLaunch, hitstun: 0, blockstun: 0, hitstop: 0,
});

// Resolves `hitDef` from a fresh duel's attacker onto its target, the target
// starting at `launchPoint`. `facing` is the direction the hit travels.
function hitAt(launchPoint, hitDef, { facing = 1, options = {}, targetCharacter, shielding = false } = {}) {
  const d = duel({ attackerFacing: facing, targetCharacter });
  d.target.combat.launchPoint = launchPoint;
  d.target.combat.shielding = shielding;
  const event = new CombatSystem().applyHit(d.attacker, d.target, hitDef, { facing, ...options });
  return { ...d, event };
}

// #0001's own resolved hits, as the engine holds them.
function realHits() {
  const { fighter } = makeFighter();
  const rush = fighter.techniqueDefs.rasenRush;
  return {
    ba1: fighter.attacks.ba1,
    ba2: fighter.attacks.ba2,
    midairBa1: fighter.attacks.midairBa1,
    midairBa2: fighter.attacks.midairBa2,
    shuriken: fighter.projectileDefs.shuriken,
    firstHit: rush.firstHit,
    tickHit: rush.tickHit,
    explosionHit: rush.explosionHit,
  };
}

// ---- Registry ---------------------------------------------------------------------

test('Base Launch has exactly four legal values, the multipliers themselves: 0, 1, 2 and 3', () => {
  assert.deepEqual(BASE_LAUNCH_VALUES, [0, 1, 2, 3]);
  assert.ok(Object.isFrozen(BASE_LAUNCH_VALUES));
});

test('Directional Launch is none, horizontal, vertical or reverse vertical, by clean ids', () => {
  assert.deepEqual(DIRECTIONAL_LAUNCHES.map((d) => [d.id, d.name]), [
    [null, 'None'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['reverseVertical', 'Reverse vertical'],
  ]);
  assert.ok(Object.isFrozen(DIRECTIONAL_LAUNCHES));
  assert.ok(DIRECTIONAL_LAUNCHES.every((d) => Object.isFrozen(d)));
});

test('the launch module is small: values, directions, validation, resolution and reference copy, with no tuning tables', () => {
  assert.deepEqual(Object.keys(launchModule).sort(), [
    'BASE_LAUNCH_DESCRIPTIONS', 'BASE_LAUNCH_SUMMARY', 'BASE_LAUNCH_VALUES', 'DIRECTIONAL_LAUNCHES',
    'DIRECTIONAL_LAUNCH_SUMMARY', 'LAUNCH_FORMULA', 'LAUNCH_POINT_SUMMARY', 'LAUNCH_UNIT_SPEED', 'resolveBaseLaunch',
    'resolveDirectionalLaunch', 'resolveDirectionalLaunchValue', 'resolveHitLaunch', 'resolveLaunchStrength',
  ]);
  const code = read('js/data/launch.js').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /perPoint|growth|\blevel|\b(Low|Mid|High)\b|bonus|knockback/i, 'no rates, levels, growth or bonus');
});

// ---- Validation -------------------------------------------------------------------

test('resolveBaseLaunch keeps 0, 1, 2 and 3; nothing declared is 0', () => {
  for (const value of [0, 1, 2, 3]) assert.equal(resolveBaseLaunch(value), value);
  const { value, warnings: w } = warnings(() => [resolveBaseLaunch(undefined), resolveBaseLaunch(null)]);
  assert.deepEqual(value, [0, 0]);
  assert.deepEqual(w, [], 'not declaring one is not an error');
});

test('any other Base Launch is logged and resolves to 0, never an arbitrary strength', () => {
  for (const bad of [0.5, 4, 10, -1, 1.5, '1', NaN, Infinity, true, [1], { value: 1 }]) {
    const { value, warnings: w } = warnings(() => resolveBaseLaunch(bad, 'Attack "x"'));
    assert.equal(value, 0, `${String(bad)} is not a Base Launch`);
    assert.equal(w.length, 1);
    assert.match(w[0], /Attack "x" declares invalid baseLaunch/);
    assert.match(w[0], /not 0, 1, 2 or 3/);
  }
});

test('resolveDirectionalLaunchValue keeps the four directions; anything else is logged and becomes none', () => {
  for (const id of [null, 'horizontal', 'vertical', 'reverseVertical']) assert.equal(resolveDirectionalLaunchValue(id), id);
  assert.equal(resolveDirectionalLaunchValue(undefined), null);
  for (const bad of ['up', 'down', 'Horizontal', 'reversed', 'reverse vertical', -1, 1, { x: 1, y: 0 }]) {
    const { value, warnings: w } = warnings(() => resolveDirectionalLaunchValue(bad, 'Hit "y"'));
    assert.equal(value, null, `${JSON.stringify(bad)} is not a Directional Launch`);
    assert.equal(w.length, 1);
    assert.match(w[0], /Hit "y" declares invalid directionalLaunch/);
  }
});

test('a nonzero Base Launch with no direction is logged as malformed, and it still never launches', () => {
  const { value, warnings: w } = warnings(() => resolveHitLaunch({ baseLaunch: 2, directionalLaunch: null }, 'Attack "z"'));
  assert.deepEqual(value, { baseLaunch: 2, directionalLaunch: null }, 'neither is rewritten from the other');
  assert.match(w[0], /Attack "z" declares Base Launch 2 with no directionalLaunch/);
  const { value: atk } = warnings(() => probe(5, 3, null));
  const { target, event } = hitAt(115, atk);
  assert.equal(target.combat.launchPoint, 120);
  assert.deepEqual(event.finalLaunch, { x: 0, y: 0 }, 'a null direction is no physical launch');
  assert.deepEqual([target.body.vx, target.body.vy], [0, 0]);
});

test('every hit definition validates the same two fields the same way: attacks, projectiles and technique hits', () => {
  const bad = { damage: 5, baseLaunch: 4, directionalLaunch: 'sideways' };
  const { value, warnings: w } = warnings(() => [
    createAttackDefinition({ id: 'a', ...bad }),
    createProjectileDefinition({ id: 'p', ...bad }),
    createTechniqueDefinition({ id: 't', firstHit: bad }).firstHit,
  ]);
  for (const hit of value) {
    assert.deepEqual([hit.baseLaunch, hit.directionalLaunch], [0, null]);
    assert.ok(Object.isFrozen(hit));
  }
  assert.equal(w.length, 6, 'both fields, on all three');
  assert.ok(w.some((m) => /Attack "a"/.test(m)) && w.some((m) => /Projectile "p"/.test(m)) && w.some((m) => /Hit "t.firstHit"/.test(m)));
  // Declared fields are kept exactly: never inferred from damage or hitbox.
  const atk = createAttackDefinition({ id: 'b', damage: 10, baseLaunch: 1, directionalLaunch: 'reverseVertical', hitbox: { x: 0, y: -90, w: 10, h: 90 } });
  assert.deepEqual([atk.damage, atk.baseLaunch, atk.directionalLaunch], [10, 1, 'reverseVertical']);
  // Nothing declared: no launch at all.
  const none = createAttackDefinition({ id: 'c', damage: 3 });
  assert.deepEqual([none.baseLaunch, none.directionalLaunch], [0, null]);
});

// ---- Launch Point -----------------------------------------------------------------

test('Launch Point starts at 0 on every new combat state and every new fighter', () => {
  assert.equal(new CombatState().launchPoint, 0);
  for (const character of CHARACTERS) assert.equal(makeFighter({ character }).fighter.combat.launchPoint, 0);
  assert.equal('knockback' in new CombatState(), false, 'the old accumulated Knockback is gone');
});

test('damage adds exactly the damage received: 0 + 5 = 5, + 10 = 15, + 1 = 16', () => {
  const { ba1, ba2, shuriken } = realHits();
  const d = duel();
  const system = new CombatSystem();
  const seen = [];
  for (const hit of [ba1, ba2, shuriken]) {
    const e = system.applyHit(d.attacker, d.target, hit);
    seen.push([e.launchPointBefore, e.damage, e.launchPointAfter]);
  }
  assert.deepEqual(seen, [[0, 5, 5], [5, 10, 15], [15, 1, 16]]);
  assert.equal(d.target.combat.launchPoint, 16);
});

test('Launch Point never becomes negative', () => {
  const { target } = hitAt(10, probe(-50, 1, 'horizontal'));
  assert.equal(target.combat.launchPoint, 0);
});

test('the hit\'s own damage is added before its launch: 115 + 5 = 120, so Base Launch 1 launches at 120, not 115', () => {
  const { target, event } = hitAt(115, probe(5, 1, 'horizontal'));
  assert.equal(event.launchPointBefore, 115);
  assert.equal(event.launchPointAfter, 120);
  assert.equal(target.combat.launchPoint, 120);
  assert.equal(event.launchStrength, 120);
  assert.notEqual(event.launchStrength, 115);
  assert.equal(target.body.vx, 120 * U, '120 points of strength, as a speed');
});

// ---- Strength ---------------------------------------------------------------------

test('launch strength is exactly Base Launch x Launch Point: 0 / 120 / 240 / 360 at 120, and 0 / 37 / 74 / 111 at 37', () => {
  for (const [lp, expected] of [[120, [0, 120, 240, 360]], [37, [0, 37, 74, 111]]]) {
    assert.deepEqual(BASE_LAUNCH_VALUES.map((b) => resolveLaunchStrength(b, lp)), expected, `the resolver at ${lp}`);
    // The same numbers through the real applyHit: a 0-damage hit keeps the
    // target at `lp`.
    assert.deepEqual(BASE_LAUNCH_VALUES.map((b) => hitAt(lp, probe(0, b, 'horizontal')).event.launchStrength), expected, `applyHit at ${lp}`);
  }
});

test('one conversion to speed, 10 per point, the same for every direction: 1 x 120 is a strength of 120 and a speed of 1200', () => {
  assert.equal(LAUNCH_UNIT_SPEED, 10);
  for (const [baseLaunch, expected] of [[1, 120], [2, 240], [3, 360]]) {
    for (const direction of ['horizontal', 'vertical', 'reverseVertical']) {
      const { target, event } = hitAt(120, probe(0, baseLaunch, direction));
      assert.equal(event.launchStrength, expected, 'the strength is Base Launch x Launch Point, nothing added');
      const speed = Math.abs(target.body.vx) + Math.abs(target.body.vy);
      assert.equal(speed, expected * U, `${direction}: exactly the strength x ${U}, nothing added`);
    }
  }
});

test('no hidden launch constant: speed stays proportional to Base Launch x Launch Point, from 1 point up', () => {
  // No base velocity: doubling the Launch Point doubles the speed, and the
  // smallest strength gives the smallest speed.
  const speedAt = (lp, baseLaunch) => hitAt(lp, probe(0, baseLaunch, 'horizontal')).target.body.vx;
  assert.equal(speedAt(1, 1), U);
  assert.equal(speedAt(60, 1) * 2, speedAt(120, 1));
  assert.equal(speedAt(120, 1) * 3, speedAt(120, 3));
  assert.equal(speedAt(37, 2), 74 * U);
});

test('Base Launch 0 never launches, at 0, 1, 50, 120, 500 or 1000 Launch Point, with or without a direction', () => {
  for (const lp of [0, 1, 50, 120, 500, 1000]) {
    for (const direction of [null, 'horizontal', 'vertical', 'reverseVertical']) {
      const d = duel();
      d.target.combat.launchPoint = lp;
      const event = new CombatSystem().applyHit(d.attacker, d.target, probe(0, 0, direction));
      assert.equal(event.launchStrength, 0, `0 x ${lp}`);
      assert.deepEqual(event.finalLaunch, { x: 0, y: 0 });
      assert.deepEqual([d.target.body.vx, d.target.body.vy], [0, 0], `no velocity at ${lp}, ${direction}`);
      // A target already moving keeps its own motion: no minimum launch, no
      // residual push, no stop either.
      Object.assign(d.target.body, { vx: -75, vy: -30 });
      new CombatSystem().applyHit(d.attacker, d.target, probe(0, 0, direction));
      assert.deepEqual([d.target.body.vx, d.target.body.vy], [-75, -30]);
    }
  }
});

// ---- Direction --------------------------------------------------------------------

test('resolveDirectionalLaunch: horizontal along the facing, vertical upward (world y grows down), reverse vertical downward, none nothing', () => {
  assert.deepEqual(resolveDirectionalLaunch('horizontal', 120, 1), { x: 1200, y: 0 });
  assert.deepEqual(resolveDirectionalLaunch('horizontal', 120, -1), { x: -1200, y: 0 });
  assert.deepEqual(resolveDirectionalLaunch('vertical', 120, 1), { x: 0, y: -1200 });
  assert.deepEqual(resolveDirectionalLaunch('vertical', 120, -1), { x: 0, y: -1200 });
  assert.deepEqual(resolveDirectionalLaunch('reverseVertical', 120, -1), { x: 0, y: 1200 });
  assert.deepEqual(resolveDirectionalLaunch(null, 120, 1), { x: 0, y: 0 });
  assert.deepEqual(resolveDirectionalLaunch('horizontal', 0, -1), { x: 0, y: 0 });
});

test('through applyHit, at strength 120: horizontal right +1200 and left -1200 with no vertical launch; vertical -1200; reverse vertical +1200; none leaves it be', () => {
  for (const facing of [1, -1]) {
    const { target, event } = hitAt(120, probe(0, 1, 'horizontal'), { facing });
    assert.equal(target.body.vx, 1200 * facing);
    assert.equal(target.body.vy, 0, 'no launch-system vertical velocity');
    assert.deepEqual(event.finalLaunch, { x: 1200 * facing, y: 0 });
  }
  const up = hitAt(120, probe(0, 1, 'vertical'));
  assert.deepEqual([up.target.body.vx, up.target.body.vy, up.target.body.grounded], [0, -1200, false]);
  const down = hitAt(120, probe(0, 1, 'reverseVertical'));
  assert.deepEqual([down.target.body.vx, down.target.body.vy, down.target.body.grounded], [0, 1200, false]);
  const none = hitAt(120, probe(0, 1, null));
  assert.deepEqual([none.target.body.vx, none.target.body.vy], [0, 0]);
  assert.deepEqual(none.event.finalLaunch, { x: 0, y: 0 });
});

test('direction never changes magnitude: at strength 240, |vx| or |vy| is 2400 whichever way it goes', () => {
  for (const direction of ['horizontal', 'vertical', 'reverseVertical']) {
    const { target } = hitAt(120, probe(0, 2, direction));
    assert.equal(Math.hypot(target.body.vx, target.body.vy), 240 * U, direction);
  }
});

test('the facing a hit travels in is its own: a projectile\'s direction, a clone\'s facing, a technique\'s snapshot', () => {
  const hit = probe(0, 1, 'horizontal');
  // The attacker faces right; each detached hit says where it travels.
  for (const [key, source] of [['projectile', { direction: -1 }], ['summon', { facing: -1 }], ['technique', { facing: -1 }]]) {
    const { target, event } = hitAt(120, hit, { facing: -1, options: { [key]: source } });
    assert.equal(target.body.vx, -120 * U, key);
    assert.equal(event[key], source);
  }
});

// ---- Shield -----------------------------------------------------------------------

test('a Shielded hit adds no Launch Point and launches nothing, whatever its Base Launch or direction; the Shield pays 25 Energy instead', () => {
  for (const [baseLaunch, direction] of [[1, 'horizontal'], [2, 'vertical'], [2, 'reverseVertical'], [3, 'horizontal']]) {
    for (const facing of [1, -1]) {
      const { target, event } = hitAt(119, probe(5, baseLaunch, direction), { facing, shielding: true });
      assert.equal(event.type, 'block');
      assert.equal(event.damage, 0, 'no chip damage');
      assert.equal(event.energyCost, 25);
      assert.deepEqual([event.launchPointBefore, event.launchPointAfter], [119, 119]);
      assert.equal(target.combat.launchPoint, 119);
      assert.equal(event.baseLaunch, baseLaunch, 'the hit keeps its own data');
      assert.equal(event.directionalLaunch, direction);
      assert.equal(event.launchStrength, 0);
      assert.deepEqual({ ...event.finalLaunch }, { x: 0, y: 0 });
      assert.deepEqual([target.body.vx, target.body.vy], [0, 0]);
      assert.notEqual(target.body.grounded, false, 'not lifted or driven down');
      assert.equal(target.combat.energy, 75);
    }
  }
  // The old Block modifiers (chip damage, a halved sideways launch) are gone.
  for (const key of ['blockLaunch', 'BLOCKED_HORIZONTAL_LAUNCH_SCALE']) assert.equal(key in combatModule, false, key);
  assert.equal('chipDamage' in createAttackDefinition({ id: 'x' }), false);
});

// ---- Events -----------------------------------------------------------------------

test('a hit event describes the new system and nothing of the old one', () => {
  const { event, attacker, target } = hitAt(110, realHits().ba2);
  assert.deepEqual(Object.keys(event).sort(), [
    'attacker', 'baseLaunch', 'damage', 'directionalLaunch', 'energyCost', 'finalLaunch', 'launchPointAfter',
    'launchPointBefore', 'launchStrength', 'move', 'projectile', 'summon', 'target', 'technique', 'type',
  ]);
  assert.equal(event.energyCost, 0, 'a hit costs its target no Energy');
  assert.deepEqual(
    [event.type, event.attacker, event.target, event.move, event.damage, event.launchPointBefore, event.launchPointAfter],
    ['hit', attacker, target, 'ba2', 10, 110, 120],
  );
  assert.equal(event.baseLaunch, 2, 'the integer multiplier, not a vector');
  assert.equal(event.directionalLaunch, 'vertical');
  assert.equal(event.launchStrength, 240);
  assert.deepEqual(event.finalLaunch, { x: 0, y: -240 * U });
});

// ---- #0001 ------------------------------------------------------------------------

test('#0001\'s authored hits: damage, Base Launch and Directional Launch, exactly', () => {
  const rush = def.chargedTechniques.rasenRush;
  const authored = {
    ba1: def.attacks.ba1,
    ba2: def.attacks.ba2,
    midairBa1: def.attacks.midairBa1,
    midairBa2: def.attacks.midairBa2,
    shuriken: def.projectiles.shuriken,
    tickHit: rush.tickHit,
    explosionHit: rush.explosionHit,
  };
  const table = Object.fromEntries(Object.entries(authored).map(([id, h]) => [id, [h.damage, h.baseLaunch, h.directionalLaunch]]));
  assert.deepEqual(table, {
    ba1: [5, 1, 'horizontal'],
    ba2: [10, 2, 'vertical'],
    midairBa1: [5, 2, 'vertical'],
    midairBa2: [10, 2, 'reverseVertical'],
    shuriken: [1, 0, null],
    tickHit: [1, 0, null],
    explosionHit: [15, 3, 'horizontal'],
  });
  assert.equal(rush.tickInterval, 0.5, 'one tick every 0.5 s');
  // The contact before the hold deals no damage and never launches: the
  // explosion is the technique's only launching hit.
  assert.deepEqual([rush.firstHit.damage, rush.firstHit.baseLaunch, rush.firstHit.directionalLaunch], [0, 0, null]);
  // Every resolved definition carries the same values.
  const hits = realHits();
  for (const [id, [damage, baseLaunch, directionalLaunch]] of Object.entries(table)) {
    assert.deepEqual([hits[id].damage, hits[id].baseLaunch, hits[id].directionalLaunch], [damage, baseLaunch, directionalLaunch], id);
  }
});

test('#0001 at work: each hit adds its damage, then launches at Base Launch x the new Launch Point along its direction', () => {
  const hits = realHits();
  const cases = [
    // [hit, from, to, strength, finalLaunch facing right (strength x 10)]
    ['ba1', 115, 120, 120, { x: 1200, y: 0 }],
    ['ba2', 110, 120, 240, { x: 0, y: -2400 }],
    ['midairBa1', 115, 120, 240, { x: 0, y: -2400 }],
    ['midairBa2', 110, 120, 240, { x: 0, y: 2400 }],
    ['shuriken', 119, 120, 0, { x: 0, y: 0 }],
    ['tickHit', 119, 120, 0, { x: 0, y: 0 }],
    ['explosionHit', 105, 120, 360, { x: 3600, y: 0 }],
  ];
  for (const [id, from, to, strength, final] of cases) {
    const { target, event } = hitAt(from, hits[id]);
    assert.equal(target.combat.launchPoint, to, `${id}: ${from} + damage`);
    assert.equal(event.launchStrength, strength, `${id}: ${event.baseLaunch} x ${to}`);
    assert.deepEqual(event.finalLaunch, final, id);
    if (final.x || final.y) {
      assert.equal(target.body.vx, final.x, `${id} vx`);
      if (final.y) assert.equal(target.body.vy, final.y, `${id} vy`);
    } else {
      assert.deepEqual([target.body.vx, target.body.vy], [0, 0], `${id}: no launch`);
    }
  }
  // Facing left, the sideways hits travel left.
  assert.equal(hitAt(115, hits.ba1, { facing: -1 }).target.body.vx, -1200);
  assert.equal(hitAt(105, hits.explosionHit, { facing: -1 }).target.body.vx, -3600);
});

// ---- Respawn ----------------------------------------------------------------------

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

test('a fighter with Launch Point that falls into the Void is eliminated, scores its opponent a point and respawns at 0', () => {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.p2.controller = { getInput: () => ({}) };
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  assert.deepEqual([p1.combat.launchPoint, p2.combat.launchPoint], [0, 0], 'every fighter starts the round at 0');
  // Launched off with a real, heavy Launch Point.
  const e = new CombatSystem().applyHit(p1, p2, realHits().ba1);
  assert.equal(e.launchPointAfter, 5);
  p2.combat.launchPoint = 240;
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, vy: 0, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true, 'eliminated');
  assert.deepEqual(battle.score, { p1: 1, p2: 0 }, 'the opponent\'s point');
  assert.equal(p2.combat.launchPoint, 240, 'kept while out of play');
  const wait = Math.round(CONFIG.battle.respawnSeconds / DT);
  for (let i = 1; i < wait; i++) battle.update(DT);
  assert.equal(p2.lostToVoid, true, 'not a step early');
  battle.update(DT);
  assert.equal(p2.lostToVoid, false, 'back after the respawn delay');
  assert.equal(p2.combat.launchPoint, 0, 'a fresh life starts at 0');
  // A rematch starts everyone at 0 too.
  p1.combat.launchPoint = 77;
  battle.restart();
  assert.deepEqual([p1.combat.launchPoint, p2.combat.launchPoint], [0, 0]);
  battle.destroy();
});

// ---- The old architecture is gone -------------------------------------------------

// Every source file the game ships: scripts, styles and markup.
function shippedFiles() {
  const out = ['index.html', 'styles.css'];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
      else if (entry.name.endsWith('.js')) out.push(`${dir}${entry.name}`);
    }
  };
  walk('js/');
  return out;
}

const OBSOLETE = [
  'KNOCKBACK_LEVELS', 'ACCUMULATED_KNOCKBACK_SCALING', 'DEFAULT_KNOCKBACK_GROWTH', 'knockbackGrowth',
  'accumulatedKnockbackAxis', 'accumulatedKnockbackBonus', 'baseKnockback', 'resolveKnockback', 'resolveLaunchAxis',
  'dominantLaunchAxis', 'knockbackBefore', 'knockbackAfter', 'bonusLaunch', 'KNOCKBACK_SUMMARY', 'KNOCKBACK_DIRECTIONS',
];

test('the old Knockback engine is gone: no knockback.js, and nothing the game ships names Knockback at all', () => {
  assert.equal(existsSync(new URL('js/data/knockback.js', ROOT)), false);
  assert.ok(existsSync(new URL('js/data/launch.js', ROOT)));
  const files = shippedFiles();
  assert.ok(files.includes('js/game/combat.js') && files.includes('js/data/characters.js'));
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /knockback/i, `${file} still mentions Knockback`);
    for (const name of OBSOLETE) assert.ok(!source.includes(name), `${file}: ${name}`);
  }
});

test('the documentation describes only the new system: no obsolete engine names in README.md or ALVA_SPEC.md', () => {
  for (const file of ['README.md', 'ALVA_SPEC.md']) {
    const doc = read(file);
    for (const name of OBSOLETE) assert.ok(!doc.includes(name), `${file}: ${name}`);
    assert.doesNotMatch(doc, /\b(Low|Mid|High) (horizontal|vertical|Knockback)\b/, `${file}: no Low / Mid / High Knockback`);
    assert.doesNotMatch(doc, /accumulated Knockback|knockback growth/i, `${file}: no accumulated Knockback or growth`);
    assert.match(doc, /Launch Point/);
    assert.match(doc, /Base Launch/);
    assert.match(doc, /Directional Launch/);
  }
});

test('the launch path is shared and generic: no fighter, attack or technique singled out anywhere in combat', () => {
  const combat = read('js/game/combat.js').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(combat, /(?:\.id|attack|attackId|fighter\.id|technique\.id)\s*===?\s*['"]/);
  assert.doesNotMatch(combat, /'0001'|'ba1'|'ba2'|'midairBa\d'|'shuriken'|'rasenRush'/);
  // Projectiles, clones and techniques never compute a launch of their own.
  for (const file of ['js/game/projectile.js', 'js/game/clone.js', 'js/game/charged-technique.js']) {
    const code = read(file).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /resolveLaunchStrength|resolveDirectionalLaunch\(|launchPoint\s*\*/, `${file} has no launch math`);
  }
});
