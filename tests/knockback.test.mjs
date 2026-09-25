// Run with node --test tests/knockback.test.mjs (no dependencies).
// The standalone Knockback system (js/data/knockback.js): the three levels
// (Low, Mid, High) and their magnitudes, the resolver that turns an attack's
// { axis, level, sign } descriptor into its numeric default launch
// (baseKnockback), its validation of malformed data, the attack definitions
// that resolve it once (createAttackDefinition), the real
// CombatSystem.applyHit physics those numbers produce, and #0001's four
// Basic Attacks. Then the two separate parts of every launch: the attack's
// default Knockback and the separate bonus from the target's accumulated
// Knockback (accumulatedKnockbackBonus / resolveLaunch), added, never one
// multiplying the other. Knockback is not a Power: it is independent of
// Jump Power and Speed Power. Runs the real Fighter, physics and combat (see
// fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KNOCKBACK_LEVELS, KNOCKBACK_AXES, KNOCKBACK_DIRECTIONS, KNOCKBACK_SUMMARY, KNOCKBACK_DIRECTION_SUMMARY,
  ACCUMULATED_KNOCKBACK_SCALING, getKnockbackLevel, resolveKnockback, accumulatedKnockbackBonus,
  dominantLaunchAxis, resolveLaunchAxis, resolveLaunch,
} from '../js/data/knockback.js';
import * as knockbackModule from '../js/data/knockback.js';
import { POWERS } from '../js/data/powers.js';
import { CHARACTERS } from '../js/data/characters.js';
import { CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { def, DT, STAGE, makeFighter, stepUntil, duel } from './fighter-harness.mjs';

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

// An attack definition with `knockback`, hitting on its first step. No
// damage by default, so a target at 0 Knockback stays there and takes
// exactly the move's default launch.
const probe = (knockback, damage = 0) => createAttackDefinition({
  id: 'probe', animation: 'ba1', startup: 0, active: DT, recovery: 0, damage, hitstun: 0.3, hitstop: 0, knockback,
});

// A bespoke hit (like a technique's) with its own numeric default launch.
const bespoke = (baseKnockback, extra = {}) => ({
  id: 'bespoke', damage: 0, chipDamage: 0, baseKnockback, hitstun: 0.3, blockstun: 0.1, hitstop: 0, ...extra,
});

// An unblocked hit from an attack with Knockback `knockback` on a target in
// front, through the real CombatSystem.applyHit; the attacker faces `facing`.
// `attacker` / `target` swap in other definitions; `accumulated` is the
// target's Knockback before the hit, `damage` the probe's.
function hitWith(knockback, { damage = 0, ...options } = {}) {
  return strike(probe(knockback, damage), options);
}

// The same, with any hit definition `atk`.
function strike(atk, {
  facing = 1, airborne = false, blocker = false, attacker: attackerDef = def, target: targetDef = def,
  accumulated = 0,
} = {}) {
  const attacker = makeFighter({ x: 500, facing, character: attackerDef });
  const target = makeFighter({
    x: 500 + 50 * facing, facing: -facing,
    character: blocker ? { ...targetDef, defense: { type: 'block' } } : targetDef,
  });
  if (airborne) Object.assign(target.fighter.body, { y: 500, vy: 0, grounded: false, ground: null });
  if (blocker) target.fighter.combat.blocking = true;
  target.fighter.combat.knockback = accumulated;
  const event = new CombatSystem().applyHit(attacker.fighter, target.fighter, atk);
  return { atk, event, target };
}

// Zero either way: a vertical-only hit sets vx to 0 * facing, which is -0
// when the hit travels left (still === 0).
const isZero = (v) => v === 0;

const LOW_HORIZONTAL = { axis: 'horizontal', level: 'low' };
const HIGH_VERTICAL = { axis: 'vertical', level: 'high' };
const MID_REVERSED = { axis: 'vertical', level: 'mid', sign: -1 };

// ---- Levels ------------------------------------------------------------------------

test('Knockback has exactly three levels, Low, Mid and High: horizontal 140 / 180 / 220, vertical 480 / 640 / 800', () => {
  assert.deepEqual(Object.keys(KNOCKBACK_LEVELS), ['low', 'mid', 'high']);
  assert.deepEqual(Object.values(KNOCKBACK_LEVELS).map((l) => [l.id, l.name, l.description, l.horizontal, l.vertical]), [
    ['low', 'Low', 'Light knockback.', 140, 480],
    ['mid', 'Mid', 'Medium knockback.', 180, 640],
    ['high', 'High', 'Strong knockback.', 220, 800],
  ]);
  assert.equal(KNOCKBACK_LEVELS.low.horizontal, 140);
  assert.equal(KNOCKBACK_LEVELS.mid.horizontal, 180);
  assert.equal(KNOCKBACK_LEVELS.high.horizontal, 220);
  assert.equal(KNOCKBACK_LEVELS.low.vertical, 480);
  assert.equal(KNOCKBACK_LEVELS.mid.vertical, 640);
  assert.equal(KNOCKBACK_LEVELS.high.vertical, 800);
  assert.deepEqual(KNOCKBACK_AXES, ['horizontal', 'vertical']);
  assert.ok(Object.isFrozen(KNOCKBACK_LEVELS) && Object.values(KNOCKBACK_LEVELS).every(Object.isFrozen));
  assert.ok(Object.isFrozen(KNOCKBACK_AXES));
  for (const id of ['low', 'mid', 'high']) assert.equal(getKnockbackLevel(id), KNOCKBACK_LEVELS[id]);
});

test('each axis is strictly stronger from Low to Mid to High', () => {
  const levels = Object.values(KNOCKBACK_LEVELS);
  for (const axis of KNOCKBACK_AXES) {
    assert.ok(levels.every((l) => l[axis] > 0), axis);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i][axis] > levels[i - 1][axis], `${axis}: ${levels[i].name}`);
  }
});

test('levels are named by exactly \'low\', \'mid\' and \'high\': never old tier numbers, display names or inherited keys', () => {
  for (const id of [1, 2, 3, -1, -2, -3, 0, '1', '2', '3', 'Low', 'MID', 'High', 'medium', 'strong', 'toString', '__proto__', 'constructor', '', null, undefined, ['low'], { id: 'low' }]) {
    assert.equal(getKnockbackLevel(id), null, String(id));
  }
});

test('the reference copy names no fighter, attack or tuning value', () => {
  const copy = [
    KNOCKBACK_SUMMARY, KNOCKBACK_DIRECTION_SUMMARY,
    ...Object.values(KNOCKBACK_LEVELS).flatMap((l) => [l.name, l.description]),
    ...KNOCKBACK_DIRECTIONS.flatMap((d) => [d.name, d.description]),
  ];
  assert.equal(KNOCKBACK_SUMMARY, 'Controls how strongly an attack moves an opponent when it connects.');
  assert.deepEqual(KNOCKBACK_DIRECTIONS.map((d) => [d.id, d.name, d.description]), [
    ['horizontal', 'Horizontal', 'Pushes the opponent away from the direction of the hit.'],
    ['vertical', 'Vertical', 'Launches the opponent upward.'],
    ['reversed', 'Reversed vertical', 'Drives the opponent downward.'],
  ]);
  assert.ok(Object.isFrozen(KNOCKBACK_DIRECTIONS) && KNOCKBACK_DIRECTIONS.every(Object.isFrozen));
  for (const text of copy) {
    assert.doesNotMatch(text, /#\d{4}|\bBA\d|\d{3}/, text);
    for (const character of CHARACTERS) assert.ok(!text.includes(character.displayName), text);
  }
});

// ---- Resolution --------------------------------------------------------------------

test('a descriptor resolves to its level\'s numeric knockback along its axis', () => {
  const { value, warnings: logged } = warnings(() => [
    resolveKnockback(LOW_HORIZONTAL), resolveKnockback(HIGH_VERTICAL), resolveKnockback(MID_REVERSED),
  ]);
  assert.deepEqual(logged, [], 'valid data never warns');
  assert.deepEqual(value, [{ x: 140, y: 0 }, { x: 0, y: 800 }, { x: 0, y: -640 }]);
  assert.ok(value.every(Object.isFrozen));
});

test('every level on every axis, and every level reversed vertically', () => {
  for (const [level, h, v] of [['low', 140, 480], ['mid', 180, 640], ['high', 220, 800]]) {
    assert.deepEqual(resolveKnockback({ axis: 'horizontal', level }), { x: h, y: 0 }, `${level} horizontal`);
    assert.deepEqual(resolveKnockback({ axis: 'vertical', level }), { x: 0, y: v }, `${level} vertical`);
    assert.deepEqual(resolveKnockback({ axis: 'vertical', level, sign: -1 }), { x: 0, y: -v }, `${level} vertical, reversed`);
    // An explicit sign of 1 is the normal direction, the same as none.
    assert.deepEqual(resolveKnockback({ axis: 'vertical', level, sign: 1 }), { x: 0, y: v });
    assert.deepEqual(resolveKnockback({ axis: 'horizontal', level, sign: 1 }), { x: h, y: 0 });
  }
});

test('no descriptor is no knockback, and is not an error', () => {
  const { value, warnings: logged } = warnings(() => [resolveKnockback(undefined), resolveKnockback(null)]);
  assert.deepEqual(value, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.deepEqual(logged, []);
  const plain = warnings(() => createAttackDefinition({ id: 'plain' })).value;
  assert.deepEqual(plain.baseKnockback, { x: 0, y: 0 });
  assert.equal(plain.accumulatedKnockbackAxis, null, 'not a launching attack');
});

test('malformed descriptors are logged and give no knockback, never an arbitrary force', () => {
  for (const [knockback, pattern, label] of [
    [{ axis: 'vertical', level: 'medium' }, /level 'medium'/, 'an unknown level name'],
    [{ axis: 'horizontal', level: 'Low' }, /level 'Low'/, 'a display name, not a level id'],
    [{ axis: 'vertical', level: 'HIGH' }, /level 'HIGH'/, 'the wrong case'],
    [{ axis: 'vertical', level: 'toString' }, /level 'toString'/, 'an inherited key'],
    [{ axis: 'vertical', level: ['high'] }, /level an array/, 'a level that is not a string'],
    [{ axis: 'horizontal' }, /level undefined/, 'no level'],
    [{ axis: 'diagonal', level: 'mid' }, /axis 'diagonal'/, 'an unknown axis'],
    [{ axis: 'x', level: 'mid' }, /axis 'x'/, 'a coordinate, not an axis'],
    [{ level: 'mid' }, /axis undefined/, 'no axis'],
    [{ axis: 'horizontal', level: 'low', sign: -1 }, /only vertical Knockback can be reversed/, 'reversed horizontal knockback'],
    [{ axis: 'vertical', level: 'mid', sign: 0 }, /sign 0/, 'sign 0'],
    [{ axis: 'vertical', level: 'mid', sign: -2 }, /sign -2/, 'a sign that is a magnitude'],
    [{ axis: 'vertical', level: 'mid', sign: '-1' }, /sign '-1'/, 'a sign that is a string'],
    [{ axis: 'vertical', level: 'mid', sign: -0.5 }, /sign -0.5/, 'a fractional sign'],
    [{ axis: 'vertical', level: 'mid', strength: 3 }, /unknown field "strength"/, 'an unknown field'],
    [{ x: 180, y: 0 }, /unknown field "x", "y"/, 'a raw numeric knockback on an attack'],
    ['low', /'low' is not a Knockback descriptor/, 'a bare level'],
    [2, /2 is not a Knockback descriptor/, 'a bare tier number'],
    [[LOW_HORIZONTAL], /an array is not a Knockback descriptor/, 'a list of descriptors'],
  ]) {
    const { value, warnings: logged } = warnings(() => resolveKnockback(knockback, 'Attack "probe"'));
    assert.deepEqual(value, { x: 0, y: 0 }, label);
    assert.equal(logged.length, 1, `${label} is logged`);
    assert.match(logged[0], /Attack "probe" declares invalid Knockback/, label);
    assert.match(logged[0], pattern, label);
    assert.match(logged[0], /it has no knockback/, label);
  }
});

test('old numeric tiers are not Knockback levels, in either direction', () => {
  for (const level of [1, 2, 3, -1, -2, -3, '2', '-2']) {
    for (const axis of KNOCKBACK_AXES) {
      const { value, warnings: logged } = warnings(() => resolveKnockback({ axis, level }, 'Attack "probe"'));
      assert.deepEqual(value, { x: 0, y: 0 }, `${axis} level ${level}`);
      assert.equal(logged.length, 1, `${axis} level ${level} is logged`);
      assert.match(logged[0], /is not 'low', 'mid' or 'high'/);
    }
  }
  // Nor on an attack: a tier number there moves nobody.
  for (const level of [1, 2, 3, -2]) {
    const atk = warnings(() => createAttackDefinition({ id: 'probe', knockback: { axis: 'vertical', level } })).value;
    assert.deepEqual(atk.baseKnockback, { x: 0, y: 0 }, `level ${level}`);
    assert.equal(atk.accumulatedKnockbackAxis, null, `level ${level}`);
  }
});

// ---- Attack definitions ---------------------------------------------------------------

test('createAttackDefinition resolves the descriptor once, into the frozen default launch (baseKnockback) and axis applyHit reads', () => {
  const knockback = { axis: 'vertical', level: 'low' };
  const atk = probe(knockback);
  assert.deepEqual(atk.baseKnockback, { x: 0, y: 480 });
  assert.equal(atk.accumulatedKnockbackAxis, 'vertical', 'the descriptor\'s own axis');
  assert.equal('knockback' in atk, false, 'one name for the resolved default launch, never the descriptor');
  assert.ok(Object.isFrozen(atk) && Object.isFrozen(atk.baseKnockback));
  // Later edits to the source data never reach the frozen definition.
  knockback.level = 'high';
  assert.deepEqual(atk.baseKnockback, { x: 0, y: 480 });
  assert.equal(probe(LOW_HORIZONTAL).accumulatedKnockbackAxis, 'horizontal');
  assert.equal(probe(MID_REVERSED).accumulatedKnockbackAxis, 'vertical');
  // A malformed descriptor names the attack.
  const bad = warnings(() => createAttackDefinition({ id: 'jab', knockback: { axis: 'horizontal', level: 2 } }));
  assert.deepEqual(bad.value.baseKnockback, { x: 0, y: 0 });
  assert.equal(bad.value.accumulatedKnockbackAxis, null);
  assert.match(bad.warnings.join('\n'), /Attack "jab" declares invalid Knockback/);
});

test('combat stays generic: nothing in it names a level, an attack or a fighter', () => {
  const source = readFileSync(new URL('../js/game/combat.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ resolveKnockback, resolveLaunch \} from '\.\.\/data\/knockback\.js';/);
  assert.doesNotMatch(source, /powers\.js/);
  // The code itself, without the schema examples in its comments.
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /'(low|mid|high)'|KNOCKBACK_LEVELS|\b(140|180|220|480|640|800)\b/);
  assert.doesNotMatch(code, /'0001'|'ba1'|'ba2'|'midairBa1'|'midairBa2'/);
});

// ---- Physics (default launch, at 0 Knockback) -----------------------------------------

test('Low horizontal: vx +140 facing right, -140 facing left, with no launch', () => {
  for (const facing of [1, -1]) {
    const { event, target } = hitWith(LOW_HORIZONTAL, { facing });
    assert.equal(event.type, 'hit');
    assert.equal(target.fighter.body.vx, 140 * facing, 'away from the attacker');
    assert.equal(target.fighter.body.vy, 0);
    assert.equal(target.fighter.grounded, true);
  }
  assert.equal(hitWith(LOW_HORIZONTAL).target.fighter.body.vx, 140);
  assert.equal(hitWith(LOW_HORIZONTAL, { facing: -1 }).target.fighter.body.vx, -140);
});

test('High vertical: vy -800, launched off the ground and rising, never pushed sideways', () => {
  for (const facing of [1, -1]) {
    const { target } = hitWith(HIGH_VERTICAL, { facing });
    assert.equal(target.fighter.body.vy, -800);
    assert.ok(isZero(target.fighter.body.vx));
    assert.equal(target.fighter.grounded, false);
    target.step();
    assert.ok(target.fighter.body.y < STAGE.groundY, 'rising');
  }
});

test('Mid reversed vertical: vy +640, driving the target downward', () => {
  for (const facing of [1, -1]) {
    // A grounded target is knocked into the floor it stands on and stays there.
    const grounded = hitWith(MID_REVERSED, { facing });
    const body = grounded.target.fighter.body;
    assert.equal(body.vy, 640, 'positive body vy: downward');
    assert.ok(isZero(body.vx), 'no horizontal knockback');
    const floor = body.y;
    grounded.target.step();
    assert.equal(body.y, floor, 'never lifted, and never below the floor');
    assert.equal(body.grounded, true);

    // An airborne target falls faster and lands sooner than one not hit.
    const hit = hitWith(MID_REVERSED, { facing, airborne: true });
    const plain = makeFighter({ x: 500 + 50 * facing, facing: -facing });
    Object.assign(plain.fighter.body, { y: 500, vy: 0, grounded: false, ground: null });
    const startY = hit.target.fighter.body.y;
    hit.target.step();
    plain.step();
    assert.ok(hit.target.fighter.body.y > startY, 'moves down on the very next step');
    assert.ok(hit.target.fighter.body.y > plain.fighter.body.y, 'faster than falling on its own');
    assert.ok(stepUntil(hit.target.step, (f) => f.grounded) < stepUntil(plain.step, (f) => f.grounded), 'lands sooner');
  }
});

test('every level launches upward at vy -480 / -640 / -800 and drives downward at +480 / +640 / +800', () => {
  for (const [level, v] of [['low', 480], ['mid', 640], ['high', 800]]) {
    assert.equal(hitWith({ axis: 'vertical', level }).target.fighter.body.vy, -v, `${level} up`);
    assert.equal(hitWith({ axis: 'vertical', level, sign: -1 }, { airborne: true }).target.fighter.body.vy, v, `${level} down`);
    assert.equal(hitWith({ axis: 'horizontal', level }).target.fighter.body.vx, KNOCKBACK_LEVELS[level].horizontal);
  }
});

test('a blocked hit takes half the horizontal push and none of the vertical knockback, either direction', () => {
  for (const facing of [1, -1]) {
    const pushed = hitWith(LOW_HORIZONTAL, { facing, blocker: true });
    assert.equal(pushed.event.type, 'block');
    assert.equal(pushed.target.fighter.body.vx, 70 * facing, 'half the push');
    for (const knockback of [HIGH_VERTICAL, MID_REVERSED]) {
      const { event, target } = hitWith(knockback, { facing, blocker: true });
      assert.equal(event.type, 'block');
      assert.equal(target.fighter.body.vy, 0, 'no vertical knockback on a block');
      assert.equal(target.fighter.grounded, true);
    }
  }
});

// ---- Independent of Powers -------------------------------------------------------------

test('Knockback is not a Power, and ignores Jump Power and Speed Power on either side of the hit', () => {
  assert.deepEqual(POWERS.map((p) => p.id), ['jump', 'speed']);
  assert.ok(!POWERS.some((p) => /knockback/i.test(`${p.id} ${p.name}`)));
  const source = readFileSync(new URL('../js/data/knockback.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import /m, 'the Knockback module depends on nothing');
  assert.deepEqual(def.powers, { jump: 2, speed: 2 }, 'a fighter owns Powers only; its attacks own Knockback');

  const variants = [1, 3].flatMap((tier) => [
    { ...def, powers: { ...def.powers, jump: tier } },
    { ...def, powers: { ...def.powers, speed: tier } },
  ]);
  for (const knockback of [LOW_HORIZONTAL, HIGH_VERTICAL, MID_REVERSED]) {
    const reference = hitWith(knockback).target.fighter.body;
    for (const other of variants) {
      const label = `${JSON.stringify(knockback)} with ${JSON.stringify(other.powers)}`;
      // Resolved the same for any fighter...
      assert.deepEqual(makeFighter({ character: other }).fighter.attacks.ba1.baseKnockback, { x: 140, y: 0 }, label);
      // ...and applied the same whichever tiers the attacker or target has.
      for (const side of ['attacker', 'target']) {
        const body = hitWith(knockback, { [side]: other }).target.fighter.body;
        assert.deepEqual([body.vx, body.vy], [reference.vx, reference.vy], `${label} (${side})`);
      }
    }
  }
});

// ---- #0001 ----------------------------------------------------------------------------

test('#0001\'s Basic Attacks: ba1 Low horizontal, ba2 High vertical, midairBa1 Mid vertical, midairBa2 High reversed vertical', () => {
  assert.deepEqual(def.attacks.ba1.knockback, { axis: 'horizontal', level: 'low' });
  assert.deepEqual(def.attacks.ba2.knockback, { axis: 'vertical', level: 'high' });
  assert.deepEqual(def.attacks.midairBa1.knockback, { axis: 'vertical', level: 'mid' });
  assert.deepEqual(def.attacks.midairBa2.knockback, { axis: 'vertical', level: 'high', sign: -1 });

  const { value: fighter, warnings: logged } = warnings(() => makeFighter().fighter);
  assert.deepEqual(logged, [], '#0001\'s data is valid');
  assert.deepEqual(fighter.attacks.ba1.baseKnockback, { x: 140, y: 0 });
  assert.deepEqual(fighter.attacks.ba2.baseKnockback, { x: 0, y: 800 });
  assert.deepEqual(fighter.attacks.midairBa1.baseKnockback, { x: 0, y: 640 });
  assert.deepEqual(fighter.attacks.midairBa2.baseKnockback, { x: 0, y: -800 });
  assert.deepEqual(
    ['ba1', 'ba2', 'midairBa1', 'midairBa2'].map((id) => fighter.attacks[id].accumulatedKnockbackAxis),
    ['horizontal', 'vertical', 'vertical', 'vertical'],
  );
  for (const [id, attack] of Object.entries(def.attacks)) assert.equal('powers' in attack, false, `${id} declares no Powers`);
});

test('#0001\'s bespoke hits keep their own numeric default launch: Throw, the shuriken and the Sphere Rush contact and ticks have none', () => {
  const { value: fighter, warnings: logged } = warnings(() => makeFighter().fighter);
  assert.deepEqual(logged, []);
  assert.equal('knockback' in def.attacks.throw, false, 'Throw declares no Knockback');
  assert.deepEqual(fighter.attacks.throw.baseKnockback, { x: 0, y: 0 });
  assert.equal(fighter.attacks.throw.accumulatedKnockbackAxis, null);
  assert.deepEqual(def.projectiles.shuriken.baseKnockback, { x: 0, y: 0 });
  assert.deepEqual(fighter.projectileDefs.shuriken.baseKnockback, { x: 0, y: 0 });
  assert.equal(fighter.projectileDefs.shuriken.accumulatedKnockbackAxis, null, 'the shuriken is not a launching hit');
  const rush = def.chargedTechniques.rasenRush;
  const tech = fighter.techniqueDefs.rasenRush;
  for (const hit of ['firstHit', 'tickHit']) {
    assert.deepEqual(rush[hit].baseKnockback, { x: 0, y: 0 }, hit);
    assert.equal(tech[hit].accumulatedKnockbackAxis, null, `${hit} is not a launching hit`);
  }
  // The explosion: a strong, mostly horizontal blast, far past High, whose
  // accumulated-Knockback bonus is explicitly horizontal.
  const { x, y } = rush.explosionHit.baseKnockback;
  assert.deepEqual({ x, y }, { x: 720, y: 180 });
  assert.ok(x > 3 * KNOCKBACK_LEVELS.high.horizontal, 'strong: over three times High horizontal');
  assert.ok(x >= 3 * y && y >= 0, 'primarily horizontal, with at most a slight lift');
  assert.equal(rush.explosionHit.accumulatedKnockbackAxis, 'horizontal');
  assert.equal(tech.explosionHit.accumulatedKnockbackAxis, 'horizontal');
  // No bespoke hit still uses the old field name.
  for (const hit of [def.projectiles.shuriken, rush.firstHit, rush.tickHit, rush.explosionHit]) {
    assert.equal('knockback' in hit, false);
  }
});

// ---- Accumulated Knockback: a separate, added launch ------------------------------------

test('the accumulated-Knockback bonus is fighter-side tuning: 2 per point sideways, 4 per point vertically, no cap', () => {
  assert.deepEqual(ACCUMULATED_KNOCKBACK_SCALING, { horizontalPerPoint: 2, verticalPerPoint: 4 });
  assert.ok(Object.isFrozen(ACCUMULATED_KNOCKBACK_SCALING));
  for (const [value, h, v] of [[0, 0, 0], [5, 10, 20], [25, 50, 100], [50, 100, 200], [100, 200, 400], [150, 300, 600]]) {
    assert.equal(accumulatedKnockbackBonus(value, 'horizontal'), h, `${value} horizontal`);
    assert.equal(accumulatedKnockbackBonus(value, 'vertical'), v, `${value} vertical`);
  }
  // It only grows, steadily, with no cap; nothing below 0 counts, and a hit
  // with no launch axis gets none.
  for (let v = 0; v < 1000; v += 7) {
    assert.ok(accumulatedKnockbackBonus(v + 7, 'horizontal') > accumulatedKnockbackBonus(v, 'horizontal'));
  }
  assert.equal(accumulatedKnockbackBonus(-20, 'horizontal'), 0);
  for (const axis of [null, undefined, 'diagonal']) assert.equal(accumulatedKnockbackBonus(100, axis), 0);
});

test('the old launch multiplier is gone: no knockbackMultiplier, scaleKnockback or launchMultiplier anywhere', () => {
  for (const name of ['knockbackMultiplier', 'scaleKnockback', 'KNOCKBACK_SCALING']) {
    assert.equal(name in knockbackModule, false, name);
  }
  for (const file of ['../js/data/knockback.js', '../js/game/combat.js']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /multiplier|knockback\s*\/\s*100/i, file);
  }
  const { event } = hitWith(LOW_HORIZONTAL, { accumulated: 50 });
  assert.equal('launchMultiplier' in event, false);
});

test('resolveLaunch adds the bonus in the base\'s own sign along one axis, and a zero default launch stays zero', () => {
  assert.deepEqual(resolveLaunch({ x: 140, y: 0 }, 100), { base: { x: 140, y: 0 }, bonus: { x: 200, y: 0 }, final: { x: 340, y: 0 } });
  assert.deepEqual(resolveLaunch({ x: 0, y: 800 }, 50).final, { x: 0, y: 1000 });
  // A spike stays a spike: more magnitude, same (downward) direction.
  assert.deepEqual(resolveLaunch({ x: 0, y: -800 }, 50), { base: { x: 0, y: -800 }, bonus: { x: 0, y: -200 }, final: { x: 0, y: -1000 } });
  // A pull (negative x) is pulled harder, never reversed.
  assert.deepEqual(resolveLaunch({ x: -140, y: 0 }, 25).final, { x: -190, y: 0 });
  // Mixed: only the dominant axis gains, so the slight lift stays slight.
  assert.deepEqual(resolveLaunch({ x: 720, y: 180 }, 100).final, { x: 920, y: 180 });
  assert.deepEqual(resolveLaunch({ x: 720, y: 180 }, 0).final, { x: 720, y: 180 });
  // An explicit axis wins over the dominant one.
  assert.deepEqual(resolveLaunch({ x: 720, y: 180 }, 100, 'vertical').final, { x: 720, y: 580 });
  // No axis, or no default launch: no bonus, whatever the Knockback.
  for (const value of [0, 1, 99, 1e4]) {
    assert.deepEqual(resolveLaunch({ x: 0, y: 0 }, value).final, { x: 0, y: 0 });
    assert.deepEqual(resolveLaunch({ x: 0, y: 0 }, value, 'horizontal').final, { x: 0, y: 0 });
    assert.deepEqual(resolveLaunch({ x: 140, y: 0 }, value, null).final, { x: 140, y: 0 });
  }
});

test('a bespoke hit\'s accumulated-Knockback axis: declared when it launches along it, else the dominant one', () => {
  assert.equal(dominantLaunchAxis({ x: 720, y: 180 }), 'horizontal');
  assert.equal(dominantLaunchAxis({ x: 100, y: -600 }), 'vertical');
  assert.equal(dominantLaunchAxis({ x: 300, y: 300 }), 'horizontal', 'horizontal on a tie');
  assert.equal(dominantLaunchAxis({ x: 0, y: 0 }), null);
  const quiet = warnings(() => [
    resolveLaunchAxis({ x: 720, y: 180 }, 'horizontal'),
    resolveLaunchAxis({ x: 720, y: 180 }, 'vertical'),
    resolveLaunchAxis({ x: 720, y: 180 }, undefined),
    resolveLaunchAxis({ x: 0, y: 0 }, 'horizontal'),
  ]);
  assert.deepEqual(quiet.value, ['horizontal', 'vertical', 'horizontal', null]);
  assert.deepEqual(quiet.warnings, []);
  // An axis it does not launch along, or no axis at all: logged, dominant.
  for (const declared of ['vertical', 'diagonal', 2]) {
    const { value, warnings: logged } = warnings(() => resolveLaunchAxis({ x: 400, y: 0 }, declared, 'Hit "probe"'));
    assert.equal(value, 'horizontal', String(declared));
    assert.equal(logged.length, 1);
    assert.match(logged[0], /Hit "probe" declares accumulatedKnockbackAxis/);
  }
});

test('independence: a Low (140) and a High (220) push against a target at 100 both gain exactly +200, keeping their 80 apart', () => {
  const low = hitWith({ axis: 'horizontal', level: 'low' }, { accumulated: 100 });
  const high = hitWith({ axis: 'horizontal', level: 'high' }, { accumulated: 100 });
  assert.equal(low.target.fighter.body.vx, 340);
  assert.equal(high.target.fighter.body.vx, 420);
  assert.equal(high.target.fighter.body.vx - low.target.fighter.body.vx, 220 - 140, 'the default difference, unmagnified');
  assert.deepEqual(low.event.bonusLaunch, high.event.bonusLaunch, 'the same accumulated bonus for both');
  assert.equal(low.event.finalLaunch.x - low.event.baseLaunch.x, 200);
  assert.equal(high.event.finalLaunch.x - high.event.baseLaunch.x, 200);
});

test('not multiplicative: at 100 Knockback a 140 push is not 280, and a 720 blast is not 1440', () => {
  const push = hitWith(LOW_HORIZONTAL, { accumulated: 100 }).target.fighter.body;
  assert.notEqual(push.vx, 280);
  assert.equal(push.vx, 340);
  const blast = strike(bespoke({ x: 720, y: 180 }, { accumulatedKnockbackAxis: 'horizontal' }), { accumulated: 100 });
  assert.notEqual(blast.target.fighter.body.vx, 1440);
  assert.equal(blast.target.fighter.body.vx, 920);
  assert.equal(blast.target.fighter.body.vy, -180, 'the slight lift is the blast\'s own, not 360');
  assert.deepEqual(blast.event.finalLaunch, { x: 920, y: 180 });
  // Still dramatically stronger than the push at the same Knockback.
  assert.equal(blast.target.fighter.body.vx - push.vx, 720 - 140);
});

test('a hit adds its damage first: 45 + 5 = 50, so that very hit gains the bonus for 50 (not 45) on top of its own 140', () => {
  const { atk, event, target } = hitWith(LOW_HORIZONTAL, { accumulated: 45, damage: 5 });
  assert.equal(target.fighter.combat.knockback, 50);
  assert.deepEqual(
    { damage: event.damage, knockbackBefore: event.knockbackBefore, knockbackAfter: event.knockbackAfter,
      baseLaunch: event.baseLaunch, bonusLaunch: event.bonusLaunch, finalLaunch: event.finalLaunch },
    { damage: 5, knockbackBefore: 45, knockbackAfter: 50,
      baseLaunch: { x: 140, y: 0 }, bonusLaunch: { x: 100, y: 0 }, finalLaunch: { x: 240, y: 0 } },
  );
  assert.equal(target.fighter.body.vx, 240);
  // The attack's own default launch is untouched by the hit.
  assert.deepEqual(atk.baseKnockback, { x: 140, y: 0 });
});

test('damage accumulation: a target at 40 hit by a 5-damage push is at 45, and launches at 140 + the bonus for 45', () => {
  const { atk, event, target } = hitWith(LOW_HORIZONTAL, { accumulated: 40, damage: 5 });
  assert.equal(target.fighter.combat.knockback, 45);
  assert.deepEqual(atk.baseKnockback, { x: 140, y: 0 }, 'default launch unchanged');
  assert.deepEqual(event.bonusLaunch, { x: accumulatedKnockbackBonus(45, 'horizontal'), y: 0 });
  assert.equal(target.fighter.body.vx, 140 + 90);
});

test('damage is not default knockback: equal defaults, 5 vs 10 damage, differ only by the bonus the extra damage adds', () => {
  // From 0, A leaves the target at 5 and B at 10: B launches a little
  // further only because it raised the target's accumulated Knockback more.
  const a = hitWith(LOW_HORIZONTAL, { damage: 5 });
  const b = hitWith(LOW_HORIZONTAL, { damage: 10 });
  assert.deepEqual(a.event.baseLaunch, b.event.baseLaunch, 'the same default launch');
  assert.deepEqual([a.event.knockbackAfter, b.event.knockbackAfter], [5, 10]);
  assert.deepEqual([a.target.fighter.body.vx, b.target.fighter.body.vx], [150, 160]);
});

test('default knockback is not damage: equal damage, Low vs High, gain the same bonus and keep their own strength', () => {
  const low = hitWith({ axis: 'horizontal', level: 'low' }, { damage: 5 });
  const high = hitWith({ axis: 'horizontal', level: 'high' }, { damage: 5 });
  assert.deepEqual([low.event.knockbackAfter, high.event.knockbackAfter], [5, 5]);
  assert.deepEqual(low.event.bonusLaunch, high.event.bonusLaunch);
  assert.deepEqual([low.target.fighter.body.vx, high.target.fighter.body.vx], [150, 230]);
});

test('direction comes from the attack: sideways stays sideways, a launch rises and a spike still drives down, harder', () => {
  for (const facing of [1, -1]) {
    const side = hitWith(LOW_HORIZONTAL, { facing, accumulated: 25 }).target.fighter.body;
    assert.equal(side.vx, 190 * facing, 'away from the attacker');
    assert.equal(side.vy, 0);
    const up = hitWith(HIGH_VERTICAL, { facing, accumulated: 100 }).target.fighter.body;
    assert.equal(up.vy, -1200, '800 + 400, upward');
    assert.ok(isZero(up.vx));
    // High reversed at 50: -800 - 200 = -1000 knockback, body vy +1000.
    const spike = hitWith({ axis: 'vertical', level: 'high', sign: -1 }, { facing, accumulated: 50, airborne: true });
    assert.deepEqual(spike.event.finalLaunch, { x: 0, y: -1000 });
    assert.equal(spike.target.fighter.body.vy, 1000, 'still downward');
    assert.ok(isZero(spike.target.fighter.body.vx));
  }
});

test('a blocked hit halves the combined sideways launch and cancels the vertical one', () => {
  for (const facing of [1, -1]) {
    const pushed = hitWith(LOW_HORIZONTAL, { facing, blocker: true, accumulated: 100 });
    assert.equal(pushed.event.type, 'block');
    assert.equal(pushed.target.fighter.body.vx, 0.5 * (140 + 200) * facing);
    assert.deepEqual(pushed.event.finalLaunch, { x: 170, y: 0 });
    const lifted = hitWith(HIGH_VERTICAL, { facing, blocker: true, accumulated: 100 });
    assert.equal(lifted.target.fighter.body.vy, 0, 'no vertical launch on a block');
    assert.equal(lifted.target.fighter.grounded, true);
  }
});

test('a move with no default launch never launches, however much Knockback the target has', () => {
  for (const accumulated of [0, 100, 500, 1e5]) {
    const { event, target } = hitWith(null, { accumulated, damage: 3 });
    assert.equal(event.knockbackAfter, accumulated + 3);
    assert.deepEqual(event.bonusLaunch, { x: 0, y: 0 });
    assert.ok(isZero(target.fighter.body.vx), `vx at ${accumulated}`);
    assert.equal(target.fighter.body.vy, 0, `vy at ${accumulated}`);
    assert.equal(target.fighter.grounded, true);
  }
});

test('#0001\'s shuriken and Sphere Rush contact and ticks stay zero-launch at 0, 50, 100 and 500 Knockback', () => {
  const { fighter } = makeFighter();
  const rush = fighter.techniqueDefs.rasenRush;
  for (const [hit, damage] of [[fighter.projectileDefs.shuriken, 1], [rush.firstHit, 0], [rush.tickHit, 1]]) {
    for (const accumulated of [0, 50, 100, 500]) {
      const label = `${hit.id} at ${accumulated}`;
      const { event, target } = strike(hit, { accumulated });
      assert.equal(target.fighter.combat.knockback, accumulated + damage, label);
      assert.deepEqual([event.baseLaunch, event.bonusLaunch, event.finalLaunch], [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], label);
      assert.ok(isZero(target.fighter.body.vx), label);
      assert.equal(target.fighter.body.vy, 0, label);
      assert.equal(target.fighter.grounded, true, label);
    }
  }
});

test('#0001\'s Sphere Rush explosion: its strong default launch plus a horizontal bonus for the new total, the lift unchanged', () => {
  const { fighter } = makeFighter();
  const blast = fighter.techniqueDefs.rasenRush.explosionHit;
  // 3 ticks already on the target, then the blast's 15: 18.
  const { event, target } = strike(blast, { accumulated: 3 });
  assert.equal(target.fighter.combat.knockback, 18);
  assert.deepEqual(event.baseLaunch, { x: 720, y: 180 });
  assert.deepEqual(event.bonusLaunch, { x: 36, y: 0 });
  assert.deepEqual([target.fighter.body.vx, target.fighter.body.vy], [756, -180]);
  // At 100 after the blast: 920 sideways, never 1440.
  const worn = strike(blast, { accumulated: 85 });
  assert.equal(worn.target.fighter.combat.knockback, 100);
  assert.deepEqual([worn.target.fighter.body.vx, worn.target.fighter.body.vy], [920, -180]);
});

test('#0001\'s real BA1 through the CombatSystem: 140 + 10 from a fresh target, 140 + 200 from one at 95 (both +5)', () => {
  const speeds = [0, 95].map((accumulated) => {
    const d = duel();
    d.target.combat.knockback = accumulated;
    d.tick({ action1: true, action1Pressed: true });
    d.until(() => d.events.length > 0);
    assert.equal(d.events[0].damage, 5);
    assert.equal(d.target.combat.knockback, accumulated + 5);
    return d.target.body.vx;
  });
  assert.deepEqual(speeds, [150, 340], 'not 140 x 1.05 or 140 x 2');
});
