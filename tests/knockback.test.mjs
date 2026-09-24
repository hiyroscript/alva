// Run with node --test tests/knockback.test.mjs (no dependencies).
// The standalone Knockback system (js/data/knockback.js): the three levels
// (Low, Mid, High) and their magnitudes, the resolver that turns an attack's
// { axis, level, sign } descriptor into numeric { x, y } knockback, its
// validation of malformed data, the attack definitions that resolve it once
// (createAttackDefinition), the real CombatSystem.applyHit physics those
// numbers produce, and #0001's four Basic Attacks. Knockback is not a Power:
// it is independent of Jump Power and Speed Power. Runs the real Fighter,
// physics and combat (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KNOCKBACK_LEVELS, KNOCKBACK_AXES, KNOCKBACK_DIRECTIONS, KNOCKBACK_SUMMARY, KNOCKBACK_DIRECTION_SUMMARY,
  getKnockbackLevel, resolveKnockback,
} from '../js/data/knockback.js';
import { POWERS } from '../js/data/powers.js';
import { CHARACTERS } from '../js/data/characters.js';
import { CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { def, DT, STAGE, makeFighter, stepUntil } from './fighter-harness.mjs';

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

// An attack definition with `knockback`, hitting on its first step.
const probe = (knockback) => createAttackDefinition({
  id: 'probe', animation: 'ba1', startup: 0, active: DT, recovery: 0, damage: 5, hitstun: 0.3, hitstop: 0, knockback,
});

// An unblocked hit from an attack with Knockback `knockback` on a target in
// front, through the real CombatSystem.applyHit; the attacker faces `facing`.
// `attacker` / `target` swap in other definitions.
function hitWith(knockback, {
  facing = 1, airborne = false, blocker = false, attacker: attackerDef = def, target: targetDef = def,
} = {}) {
  const atk = probe(knockback);
  const attacker = makeFighter({ x: 500, facing, character: attackerDef });
  const target = makeFighter({
    x: 500 + 50 * facing, facing: -facing,
    character: blocker ? { ...targetDef, defense: { type: 'block' } } : targetDef,
  });
  if (airborne) Object.assign(target.fighter.body, { y: 500, vy: 0, grounded: false, ground: null });
  if (blocker) target.fighter.combat.blocking = true;
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
  assert.deepEqual(warnings(() => createAttackDefinition({ id: 'plain' })).value.knockback, { x: 0, y: 0 });
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
    assert.deepEqual(atk.knockback, { x: 0, y: 0 }, `level ${level}`);
  }
});

// ---- Attack definitions ---------------------------------------------------------------

test('createAttackDefinition resolves the descriptor once, into the frozen numeric knockback applyHit reads', () => {
  const knockback = { axis: 'vertical', level: 'low' };
  const atk = probe(knockback);
  assert.deepEqual(atk.knockback, { x: 0, y: 480 });
  assert.ok(Object.isFrozen(atk) && Object.isFrozen(atk.knockback));
  // Later edits to the source data never reach the frozen definition.
  knockback.level = 'high';
  assert.deepEqual(atk.knockback, { x: 0, y: 480 });
  // A malformed descriptor names the attack.
  const bad = warnings(() => createAttackDefinition({ id: 'jab', knockback: { axis: 'horizontal', level: 2 } }));
  assert.deepEqual(bad.value.knockback, { x: 0, y: 0 });
  assert.match(bad.warnings.join('\n'), /Attack "jab" declares invalid Knockback/);
});

test('combat stays generic: nothing in it names a level, an attack or a fighter', () => {
  const source = readFileSync(new URL('../js/game/combat.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ resolveKnockback \} from '\.\.\/data\/knockback\.js';/);
  assert.doesNotMatch(source, /powers\.js/);
  // The code itself, without the schema examples in its comments.
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /'(low|mid|high)'|KNOCKBACK_LEVELS|\b(140|180|220|480|640|800)\b/);
  assert.doesNotMatch(code, /'0001'|'ba1'|'ba2'|'midairBa1'|'midairBa2'/);
});

// ---- Physics ------------------------------------------------------------------------

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
      assert.deepEqual(makeFighter({ character: other }).fighter.attacks.ba1.knockback, { x: 140, y: 0 }, label);
      // ...and applied the same whichever tiers the attacker or target has.
      for (const side of ['attacker', 'target']) {
        const body = hitWith(knockback, { [side]: other }).target.fighter.body;
        assert.deepEqual([body.vx, body.vy], [reference.vx, reference.vy], `${label} (${side})`);
      }
    }
  }
});

// ---- #0001 ----------------------------------------------------------------------------

test('#0001\'s Basic Attacks: ba1 Low horizontal, ba2 High vertical, midairBa1 Mid reversed vertical, midairBa2 Mid vertical', () => {
  assert.deepEqual(def.attacks.ba1.knockback, { axis: 'horizontal', level: 'low' });
  assert.deepEqual(def.attacks.ba2.knockback, { axis: 'vertical', level: 'high' });
  assert.deepEqual(def.attacks.midairBa1.knockback, { axis: 'vertical', level: 'mid', sign: -1 });
  assert.deepEqual(def.attacks.midairBa2.knockback, { axis: 'vertical', level: 'mid' });

  const { value: fighter, warnings: logged } = warnings(() => makeFighter().fighter);
  assert.deepEqual(logged, [], '#0001\'s data is valid');
  assert.deepEqual(fighter.attacks.ba1.knockback, { x: 140, y: 0 });
  assert.deepEqual(fighter.attacks.ba2.knockback, { x: 0, y: 800 });
  assert.deepEqual(fighter.attacks.midairBa1.knockback, { x: 0, y: -640 });
  assert.deepEqual(fighter.attacks.midairBa2.knockback, { x: 0, y: 640 });
  for (const [id, attack] of Object.entries(def.attacks)) assert.equal('powers' in attack, false, `${id} declares no Powers`);
});

test('#0001\'s bespoke hits keep their own numeric knockback: Throw and the shuriken have none', () => {
  const { fighter } = makeFighter();
  assert.equal('knockback' in def.attacks.throw, false, 'Throw declares no Knockback');
  assert.deepEqual(fighter.attacks.throw.knockback, { x: 0, y: 0 });
  assert.deepEqual(def.projectiles.shuriken.knockback, { x: 0, y: 0 });
  assert.deepEqual(fighter.projectileDefs.shuriken.knockback, { x: 0, y: 0 });
  assert.deepEqual(def.chargedTechniques.rasenRush.firstHit.knockback, { x: 0, y: 0 });
  assert.deepEqual(def.chargedTechniques.rasenRush.explosionHit.knockback, { x: 420, y: 220 });
});
