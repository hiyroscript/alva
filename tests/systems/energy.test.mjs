// Run with node --test tests/systems/energy.test.mjs (no dependencies).
// Energy: the one resource, the same bar (100) and the same prices for
// every fighter, spent only by the Dash and the air dash (25 as either
// starts, a Dash cancel included), the Deflect (15 as it starts) and the
// Shield (15 for each hit it blocks, a perfect block's included); never by
// Combat Assist. Its rules, clamping, its one passive
// refill rate, what each action costs, spending more than is left (it
// still happens, and empties the bar), the exhaustion lockout that only a
// full refill clears, and the one bright purple bar. Uses the real Fighter,
// CombatState and physics (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BLOCK_ENERGY_COST, CombatState, DASH_ENERGY_COST, DEFLECT_ENERGY_COST, MAX_ENERGY, resolveEnergy,
} from '../../js/game/combat/combat-state.js';
import * as status from '../../js/game/rendering/fighter-status.js';
import { energyBarState, ENERGY_STYLE } from '../../js/game/rendering/fighter-status.js';
import { def, DT, makeFighter, duel, steps } from '../helpers/fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOLD = { shield: true };
const DOWN = { down: true };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} vs ${b}`);
// #0001's Energy: its refill each fixed step, and the universal costs.
const E = resolveEnergy(def.energy);
const PER_STEP = E.regen * DT;
// Two presses of `dir`, one step apart: a Dash's double tap.
const dash = (step, dir = 'runRight') => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};

test('the Energy rules are universal: 100 full, 25 per Dash, air dash or Dash cancel, 15 per Deflect, 15 per blocked hit; a fighter sets only its refill', () => {
  assert.deepEqual([MAX_ENERGY, DASH_ENERGY_COST, BLOCK_ENERGY_COST, DEFLECT_ENERGY_COST], [100, 25, 15, 15]);
  assert.deepEqual(def.energy, { regen: 14 }, '#0001 declares its refill rate, and nothing else');
  assert.equal(def.stamina, undefined, 'the old name is gone');
  const RULES = { max: 100, dashCost: 25, dashCancelCost: 25, shieldHitCost: 15, deflectCost: 15 };
  assert.deepEqual({ ...resolveEnergy(undefined) }, { ...RULES, regen: 12 }, 'the default refill');
  assert.deepEqual({ ...resolveEnergy({ regen: 14 }) }, { ...RULES, regen: 14 });
  // Every universal field may be left out, or declared as the rule says;
  // any other value, or a field the schema does not know, is refused.
  assert.deepEqual({ ...resolveEnergy({ ...RULES, regen: 9 }) }, { ...RULES, regen: 9 });
  for (const [field, value] of [
    ['max', 80], ['max', 120], ['dashCost', 12], ['dashCost', 15], ['dashCancelCost', 35], ['dashCancelCost', 40],
    ['shieldHitCost', 20], ['shieldHitCost', 25], ['shieldHitCost', 0], ['deflectCost', 0],
  ]) {
    assert.throws(() => resolveEnergy({ [field]: value }, 'Character "x"'), new RegExp(`Character "x" declares Energy ${field} ${value}: it is ${RULES[field]} for every fighter`));
  }
  assert.throws(() => resolveEnergy({ shieldCost: 5 }), /unknown Energy field "shieldCost"/);
  assert.throws(() => resolveEnergy({ regen: -1 }), /regen must be a number from 0/);
  assert.throws(() => makeFighter({ character: { ...def, energy: { max: 150 } } }), /declares Energy max 150/);
  const bare = makeFighter({ character: { ...def, energy: undefined } }).fighter;
  assert.equal(bare.combat.maxEnergy, 100);
  // Renamed all the way through, never Stamina under an Energy label.
  const c = new CombatState();
  for (const key of ['energy', 'maxEnergy', 'energyExhausted', 'energySpec', 'energyRatio']) assert.ok(key in c, key);
  for (const key of ['setEnergy', 'spendEnergy', 'regenEnergy', 'updateEnergy', 'refillEnergy', 'canUseEnergy', 'canShield']) {
    assert.equal(typeof c[key], 'function', key);
  }
  for (const key of ['stamina', 'maxStamina', 'staminaExhausted', 'setStamina', 'drainStamina', 'infiniteEnergy']) {
    assert.equal(key in c, false, `no ${key}`);
  }
  const sources = (dir) => readdirSync(ROOT + dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : []);
  for (const file of sources('js/')) assert.doesNotMatch(readFileSync(ROOT + file, 'utf8'), /stamina/i, file);
});

test('a fighter starts at 100, its bar hidden, and not exhausted; Energy never leaves [0, 100]', () => {
  const { fighter } = makeFighter();
  const c = fighter.combat;
  assert.deepEqual([c.energy, c.maxEnergy, c.energyExhausted], [100, 100, false]);
  const bar = energyBarState(fighter);
  assert.deepEqual([bar.visible, bar.energy, bar.ratio, bar.exhausted, bar.color], [false, 100, 1, false, ENERGY_STYLE.fill]);
  assert.equal('segments' in bar, false, 'one bar, never segments');
  for (const key of ['ENERGY_SEGMENTS', 'energySegments', 'energySegmentRects']) assert.equal(key in status, false, key);
  c.regenEnergy(50);
  assert.equal(c.energy, 100, 'never above the maximum');
  assert.equal(c.spendEnergy(150), true, 'a cost larger than what is left is still paid...');
  assert.deepEqual([c.energy, c.energyExhausted], [0, true], '...by emptying the bar');
  c.refillEnergy();
  c.setEnergy(-40);
  assert.equal(c.energy, 0, 'never below 0');
  assert.equal(c.energyExhausted, true);
  assert.equal(energyBarState(fighter).ratio, 0);
  // A respawn or reset fills it again.
  c.refillEnergy();
  assert.deepEqual([c.energy, c.energyExhausted], [100, false]);
});

test('it refills by itself at its own rate (14 per second): standing, running, in the air, attacking, stunned and shielding alike', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(10);
  for (let i = 0; i < 60; i++) step();
  near(c.energy, 10 + E.regen, 'a second standing');
  for (let i = 0; i < 30; i++) step({ runRight: true });
  near(c.energy, 10 + 1.5 * E.regen, 'half a second running');
  step({ jump: true, jumpPressed: true });
  for (let i = 0; i < 29; i++) step(); // a tap: the normal jump
  assert.equal(fighter.grounded, false);
  near(c.energy, 10 + 2 * E.regen, 'half a second jumping');
  while (!fighter.grounded) step();
  const before = c.energy;
  step({ attack1: true, attack1Pressed: true });
  assert.equal(fighter.state, 'attack');
  for (let i = 0; i < 5; i++) step();
  near(c.energy, before + 6 * PER_STEP, 'attacking');
  while (fighter.state !== 'idle') step();
  c.setEnergy(40);
  for (let i = 0; i < 30; i++) step(HOLD);
  assert.equal(fighter.combat.shielding, true);
  near(c.energy, 40 + E.regen / 2, 'half a second shielding: held Shield never drains');
  // Stunned (and frozen by the hit): the refill never stops.
  const d = duel();
  d.target.combat.setEnergy(50);
  d.tick({ attack1: true, attack1Pressed: true });
  d.until(() => d.target.combat.stun > 0);
  const hit = d.target.combat.energy;
  for (let i = 0; i < 12; i++) d.tick();
  near(d.target.combat.energy, hit + 12 * PER_STEP, 'stunned');
  // And it is never instant: 90 still needs most of a second.
  c.setEnergy(90);
  for (let i = 0; i < Math.floor(10 / PER_STEP) - 1; i++) step();
  assert.ok(c.energy < 100);
});

test('it refills at one passive rate only, whatever is held: standing, holding Down, shielding or casting Unlimited Void', () => {
  const refill = (before, held, count = 60) => {
    const { fighter, step } = makeFighter();
    for (const h of before) step(h);
    fighter.combat.setEnergy(20);
    for (let i = 0; i < count; i++) step(held);
    return fighter;
  };
  near(refill([], {}).combat.energy, 20 + E.regen, 'a second standing');
  near(refill([], DOWN).combat.energy, 20 + E.regen, 'a second holding Down: the same');
  near(refill([], HOLD).combat.energy, 20 + E.regen, 'a second behind a held Shield: the same');
  near(refill([], { ...DOWN, runRight: true }).combat.energy, 20 + E.regen, 'running with Down held: the same');
  // Unlimited Void (A4): a technique, never a reason to refill faster.
  const cast = refill([{ attack4: true, attack4Pressed: true }], DOWN, 30);
  assert.ok(cast.technique, 'still casting');
  near(cast.combat.energy, 20 + E.regen / 2, 'half a second of the cast: the same rate');
  // There is one rate to set, and nothing else.
  assert.deepEqual(Object.keys(resolveEnergy()).sort(), ['dashCancelCost', 'dashCost', 'deflectCost', 'max', 'regen', 'shieldHitCost']);
  const c = new CombatState();
  c.setEnergy(0);
  c.updateEnergy(0.5, true);
  near(c.energy, 6, 'updateEnergy(dt) takes nothing else into account (the default 12 / s)');
});

test('a Dash spends exactly its cost (25) as it starts, and only then; spending the last of it exhausts', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  dash(step);
  assert.ok(fighter.dash);
  assert.equal(c.energy, 100 - E.dashCost, 'exactly its cost, and no refill on the step it was spent');
  step();
  near(c.energy, 100 - E.dashCost + PER_STEP, 'then the refill carries on');
  // Exactly enough: it happens, and empties the bar.
  while (fighter.dash || fighter.state !== 'idle' || !fighter.movementReady(false)) step();
  step({ runLeftPressed: true, runLeft: true });
  step({});
  c.setEnergy(E.dashCost);
  step({ runLeftPressed: true, runLeft: true });
  assert.ok(fighter.dash);
  assert.equal(c.energy, 0);
  assert.equal(c.energyExhausted, true, 'spending to zero exhausts at once');
});

test('the Shield costs 15 per blocked hit and nothing else: not raising it, holding it, nor a miss', () => {
  const { fighter, step } = makeFighter();
  step({ shield: true, shieldPressed: true });
  for (let i = 0; i < steps(3); i++) step(HOLD);
  step();
  for (let i = 0; i < 5; i++) {
    step({ shield: true, shieldPressed: true });
    step();
  }
  assert.equal(fighter.combat.energy, 100, 'taps and holds are free');
  const d = duel();
  // Up well before the hit: an ordinary block, never a perfect one.
  for (let i = 0; i < 9; i++) d.tick({}, HOLD);
  d.tick({ attack1: true, attack1Pressed: true }, HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.events[0].energyCost, BLOCK_ENERGY_COST);
  assert.equal(d.target.combat.energy, 100 - BLOCK_ENERGY_COST, 'the hit\'s step: exactly its price');
  assert.equal(d.attacker.combat.energy, 100, 'attacking costs nothing');
});

test('exhaustion lockout: from 0, Dash and Shield stay locked through 25, 50 and 99, and open at exactly 100', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(0);
  assert.equal(c.energyExhausted, true);
  const locked = (label) => {
    const before = c.energy;
    assert.equal(fighter.tryDash(1), false, `${label}: no Dash`);
    assert.equal(c.canShield(), false, `${label}: no Shield`);
    step(HOLD);
    assert.equal(c.shielding, false, `${label}: the held Shield raises nothing`);
    assert.equal(fighter.dash, null);
    assert.ok(c.energy >= before, `${label}: nothing spent`);
    assert.equal(energyBarState(fighter).color, ENERGY_STYLE.exhausted, `${label}: gray`);
  };
  const refillTo = (value) => {
    while (c.energy < value - 1e-9) c.updateEnergy(DT, false);
  };
  refillTo(25);
  assert.equal(c.energyExhausted, true);
  locked('at 25');
  refillTo(50);
  locked('at 50');
  refillTo(99);
  assert.ok(c.energy < 100);
  locked('at 99');
  refillTo(100);
  assert.equal(c.energy, 100);
  assert.equal(c.energyExhausted, false);
  assert.equal(energyBarState(fighter).visible, false, 'full: the bar is gone, never purple first');
  step(HOLD);
  assert.equal(c.shielding, true, 'Shield');
  step();
  while (fighter.state !== 'idle') step();
  assert.equal(fighter.tryDash(1), true, 'Dash');
});

test('too little left still pays: a Dash or a block with less than it costs takes all of it, and the bar turns gray until full', () => {
  // A Dash on 5 (it costs 25).
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(5);
  assert.equal(c.energyExhausted, false);
  assert.equal(energyBarState(fighter).color, ENERGY_STYLE.fill, 'low is still purple');
  assert.equal(c.canUseEnergy(), true);
  assert.equal(c.canShield(), true);
  assert.equal(fighter.tryDash(1), true, 'it happens');
  assert.deepEqual([c.energy, c.energyExhausted], [0, true]);
  assert.equal(energyBarState(fighter).color, ENERGY_STYLE.exhausted, 'gray at once');
  // A block on 10 (it costs 15).
  const d = duel();
  d.target.combat.setEnergy(10);
  // Up well before the hit: an ordinary block, never a perfect one.
  for (let i = 0; i < 9; i++) d.tick({}, HOLD);
  d.tick({ attack1: true, attack1Pressed: true }, HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  assert.equal(d.events[0].type, 'block', 'the block stands');
  assert.ok(d.events[0].energyCost > 10 && d.events[0].energyCost < BLOCK_ENERGY_COST, `all it had (${d.events[0].energyCost})`);
  assert.deepEqual([d.target.combat.energy, d.target.combat.energyExhausted], [0, true]);
  // Nothing more until the bar is completely full.
  const lockedUntilFull = (f) => {
    const cs = f.combat;
    while (cs.energy < 99) cs.updateEnergy(DT, false);
    assert.equal(cs.canUseEnergy(), false, 'still locked at 99');
    while (cs.energy < 100) cs.updateEnergy(DT, false);
    assert.equal(cs.canUseEnergy(), true, 'open again at 100');
  };
  lockedUntilFull(fighter);
  lockedUntilFull(d.target);
  // spendEnergy never goes below 0 and refuses nothing but an exhausted bar.
  const s = new CombatState();
  s.setEnergy(3);
  assert.equal(s.spendEnergy(40), true);
  assert.deepEqual([s.energy, s.energyExhausted], [0, true]);
  assert.equal(s.spendEnergy(1), false, 'exhausted: refused, nothing taken');
});

test('exhausted, a fighter still moves, jumps, attacks, and uses its techniques, Unlimited Void and Hollow Purple', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(0);
  const x = fighter.body.x;
  for (let i = 0; i < 10; i++) step({ runRight: true });
  assert.ok(fighter.body.x > x, 'moves');
  step({ jump: true, jumpPressed: true });
  step();
  assert.equal(fighter.grounded, false, 'jumps');
  while (!fighter.grounded) step();
  for (let i = 0; i < 20; i++) step();
  step({ attack1: true, attack1Pressed: true, ...HOLD });
  assert.equal(fighter.state, 'attack', 'attacks, even holding Shield: no Shield to take the step');
  while (fighter.combat.attack) step();
  for (let i = 0; i < 10; i++) step();
  assert.equal(c.energyExhausted, true);
  step({ attack4: true, attack4Pressed: true });
  assert.ok(fighter.technique, 'attack4 (A4): its own cooldown, no Energy');
  while (fighter.technique) step();
  assert.equal(c.energyExhausted, true);
  step({ attack5: true, attack5Pressed: true });
  assert.equal(fighter.technique?.def.id, 'attack5', 'attack5 (A5) too');
  assert.equal(c.energyExhausted, true);
});

test('nothing but Dash and blocked hits ever spends it: runs, jumps, attacks, orbs and techniques are free', () => {
  const d = duel();
  const { attacker, tick } = d;
  const spent = () => {
    // Refill is the only change: Energy never drops.
    let last = attacker.combat.energy;
    return (held = {}) => {
      tick(held);
      assert.ok(attacker.combat.energy >= last - 1e-9, `nothing spent (${attacker.state})`);
      last = attacker.combat.energy;
    };
  };
  attacker.combat.setEnergy(50);
  const t = spent();
  for (let i = 0; i < 20; i++) t({ runRight: true });
  t({ jump: true, jumpPressed: true });
  for (let i = 0; i < steps(1); i++) t();
  t({ attack1: true, attack1Pressed: true });
  for (let i = 0; i < 30; i++) t();
  t({ attack2: true, attack2Pressed: true });
  for (let i = 0; i < 60; i++) t();
  t({ attack3: true, attack3Pressed: true });
  for (let i = 0; i < 60; i++) t();
  t({ extra_attack: true, extra_attackPressed: true });
  for (let i = 0; i < 30; i++) t();
  for (let i = 0; i < 10; i++) t(DOWN);
  t({ attack4: true, attack4Pressed: true });
  assert.ok(attacker.technique, 'A4 cast Unlimited Void');
  while (attacker.technique) t();
  t({ attack5: true, attack5Pressed: true });
  assert.ok(attacker.technique, 'A5 cast Hollow Purple');
  while (attacker.technique) t();
});

// ---- The bar ------------------------------------------------------------------------

test('the bar is one bright purple fill that shrinks as Energy is spent, gray while exhausted', () => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ENERGY_STYLE.fill.slice(i, i + 2), 16));
  assert.ok(r > g && b > g, `purple: red and blue over green (${ENERGY_STYLE.fill})`);
  assert.ok(b === 0xff && r >= 0xa0 && g <= 0x40, `bright: full blue, strong red, little green (${ENERGY_STYLE.fill})`);
  assert.notEqual(ENERGY_STYLE.fill, '#a855f7', 'brighter than the old muted purple');
  const { fighter } = makeFighter();
  for (const [value, ratio] of [[100, 1], [85, 0.85], [50, 0.5], [10, 0.1]]) {
    fighter.combat.setEnergy(value);
    const bar = energyBarState(fighter);
    assert.ok(Math.abs(bar.ratio - ratio) < 1e-9, `${value}`);
    assert.equal(bar.color, ENERGY_STYLE.fill);
  }
  fighter.combat.setEnergy(0);
  fighter.combat.regenEnergy(60);
  assert.deepEqual([energyBarState(fighter).ratio, energyBarState(fighter).color], [0.6, ENERGY_STYLE.exhausted]);
});
