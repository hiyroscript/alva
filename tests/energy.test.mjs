// Run with node --test tests/energy.test.mjs (no dependencies).
// Energy: the one resource, spent only by Dash (as it starts) and by the
// Shield (for each hit it blocks). Its defaults, clamping, passive and
// Charge refill, what each action costs, spending more than is left (it
// still happens, and empties the bar), the exhaustion lockout that only a
// full refill clears, and the one bright purple bar. Uses the real Fighter,
// CombatState and physics (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CombatState, resolveEnergy } from '../js/game/combat.js';
import * as status from '../js/game/fighter-status.js';
import { energyBarState, ENERGY_STYLE } from '../js/game/fighter-status.js';
import { def, DT, makeFighter, duel, steps } from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOLD = { defense: true };
const CHARGE = { charge: true };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} vs ${b}`);
// Two presses of `dir`, one step apart: a Dash's double tap.
const dash = (step, dir = 'right') => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};

test('#0001 declares its Energy: 100 max, 12 / s, 30 / s in Charge, 15 per Dash, 25 per blocked hit', () => {
  assert.deepEqual(def.energy, { max: 100, regen: 12, chargeRegen: 30, dashCost: 15, shieldHitCost: 25 });
  assert.equal(def.stamina, undefined, 'the old name is gone');
  // Defaults for a future fighter that declares none (or only some).
  assert.deepEqual({ ...resolveEnergy(undefined) }, def.energy);
  assert.deepEqual({ ...resolveEnergy({ max: 80, dashCost: 10 }) }, { ...def.energy, max: 80, dashCost: 10 });
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

test('it refills by itself at 12 per second: standing, running, in the air, attacking, stunned and shielding alike', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(10);
  for (let i = 0; i < 60; i++) step();
  near(c.energy, 22, 'a second standing');
  for (let i = 0; i < 30; i++) step({ right: true });
  near(c.energy, 28, 'half a second running');
  step({ jump: true, jumpPressed: true });
  for (let i = 0; i < 29; i++) step({ jump: true }); // the full jump
  assert.equal(fighter.grounded, false);
  near(c.energy, 34, 'half a second jumping');
  while (!fighter.grounded) step();
  const before = c.energy;
  step({ action1: true, action1Pressed: true });
  assert.equal(fighter.state, 'attack');
  for (let i = 0; i < 5; i++) step();
  near(c.energy, before + 6 * 0.2, 'attacking');
  while (fighter.state !== 'idle') step();
  c.setEnergy(40);
  for (let i = 0; i < 30; i++) step(HOLD);
  assert.equal(fighter.combat.shielding, true);
  near(c.energy, 46, 'half a second shielding: held Shield never drains');
  // Stunned (and frozen by the hit): the refill never stops.
  const d = duel();
  d.target.combat.setEnergy(50);
  d.tick({ action1: true, action1Pressed: true });
  d.until(() => d.target.combat.stun > 0);
  const hit = d.target.combat.energy;
  for (let i = 0; i < 12; i++) d.tick();
  near(d.target.combat.energy, hit + 12 * 0.2, 'stunned');
  // And it is never instant: 90 still needs most of a second.
  c.setEnergy(90);
  for (let i = 0; i < 49; i++) step();
  assert.ok(c.energy < 100);
});

test('Charge refills it faster, at 30 per second, only in the real Charge stance', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(20);
  for (let i = 0; i < 60; i++) step(CHARGE);
  assert.equal(fighter.state, 'charge');
  near(c.energy, 50, 'a second of Charge: +30');
  // Letting go: the release pose is not Charge.
  step();
  assert.equal(fighter.state, 'chargeRelease');
  near(c.energy, 50.2, 'the release step refills at the normal rate');
  // Charge held in the air is not the stance either.
  step({ jump: true, jumpPressed: true });
  const up = c.energy;
  for (let i = 0; i < 10; i++) step(CHARGE);
  assert.equal(fighter.charging, false);
  near(c.energy, up + 10 * 0.2);
  // Nor is Charge held under a Shield: the Shield outranks it.
  const both = makeFighter();
  both.fighter.combat.setEnergy(60);
  for (let i = 0; i < 30; i++) both.step({ ...CHARGE, ...HOLD });
  assert.equal(both.fighter.charging, false);
  near(both.fighter.combat.energy, 66, 'normal rate');
});

test('a charged technique is not ordinary charging: Sphere Rush refills at the normal rate while Charge is held', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  for (let i = 0; i < 10; i++) step(CHARGE);
  step({ ...CHARGE, action2: true, action2Pressed: true });
  assert.ok(fighter.technique, 'the Sphere Rush started');
  c.setEnergy(40);
  for (let i = 0; i < 20; i++) step(CHARGE);
  assert.ok(fighter.technique);
  assert.equal(fighter.charging, false);
  near(c.energy, 44, 'normal rate');
});

test('a Dash spends exactly 15 as it starts, and only then; spending the last of it exhausts', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  dash(step);
  assert.ok(fighter.dash);
  assert.equal(c.energy, 85, 'exactly 15, and no refill on the step it was spent');
  step();
  near(c.energy, 85.2, 'then the refill carries on');
  // Exactly enough: it happens, and empties the bar.
  while (fighter.dash || fighter.state !== 'idle') step();
  step({ leftPressed: true, left: true });
  step({});
  c.setEnergy(15);
  step({ leftPressed: true, left: true });
  assert.ok(fighter.dash);
  assert.equal(c.energy, 0);
  assert.equal(c.energyExhausted, true, 'spending to zero exhausts at once');
});

test('the Shield costs 25 per blocked hit and nothing else: not raising it, holding it, nor a miss', () => {
  const { fighter, step } = makeFighter();
  step({ defense: true, defensePressed: true });
  for (let i = 0; i < steps(3); i++) step(HOLD);
  step();
  for (let i = 0; i < 5; i++) {
    step({ defense: true, defensePressed: true });
    step();
  }
  assert.equal(fighter.combat.energy, 100, 'taps and holds are free');
  const d = duel();
  // Up well before the hit: an ordinary block, never a perfect one.
  for (let i = 0; i < 9; i++) d.tick({}, HOLD);
  d.tick({ action1: true, action1Pressed: true }, HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.events[0].energyCost, 25);
  assert.equal(d.target.combat.energy, 75, 'the hit\'s step: exactly 25');
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
    assert.equal(c.shielding, false, `${label}: the held Defense raises nothing`);
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
  // A Dash on 5 (it costs 15).
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
  // A block on 20 (it costs 25).
  const d = duel();
  d.target.combat.setEnergy(20);
  // Up well before the hit: an ordinary block, never a perfect one.
  for (let i = 0; i < 9; i++) d.tick({}, HOLD);
  d.tick({ action1: true, action1Pressed: true }, HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  assert.equal(d.events[0].type, 'block', 'the block stands');
  assert.ok(d.events[0].energyCost > 20 && d.events[0].energyCost < 25, `all it had (${d.events[0].energyCost})`);
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

test('exhausted, a fighter still moves, jumps, attacks, charges and uses its charged actions', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(0);
  const x = fighter.body.x;
  for (let i = 0; i < 10; i++) step({ right: true });
  assert.ok(fighter.body.x > x, 'moves');
  step({ jump: true, jumpPressed: true });
  step();
  assert.equal(fighter.grounded, false, 'jumps');
  while (!fighter.grounded) step();
  for (let i = 0; i < 20; i++) step();
  step({ action1: true, action1Pressed: true, ...HOLD });
  assert.equal(fighter.state, 'attack', 'attacks, even holding Defense: no Shield to take the step');
  while (fighter.combat.attack) step();
  for (let i = 0; i < 10; i++) step();
  for (let i = 0; i < 5; i++) step(CHARGE);
  assert.equal(fighter.state, 'charge', 'charges: Energy never gates Charge');
  assert.equal(c.energyExhausted, true);
  step({ ...CHARGE, action2: true, action2Pressed: true });
  assert.ok(fighter.technique, 'Charged BA2 (CAB2): its own cooldown, no Energy');
});

test('nothing but Dash and blocked hits ever spends it: runs, jumps, attacks, shurikens and charged actions are free', () => {
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
  for (let i = 0; i < 20; i++) t({ right: true });
  t({ jump: true, jumpPressed: true });
  for (let i = 0; i < steps(1); i++) t();
  t({ action1: true, action1Pressed: true });
  for (let i = 0; i < 30; i++) t();
  t({ action2: true, action2Pressed: true });
  for (let i = 0; i < 30; i++) t();
  t({ primary: true, primaryPressed: true });
  for (let i = 0; i < 30; i++) t();
  for (let i = 0; i < 10; i++) t(CHARGE);
  t({ ...CHARGE, action1: true, action1Pressed: true });
  assert.equal(d.clones.length, 1, 'CAB1 summoned its clone');
  for (let i = 0; i < 60; i++) t(CHARGE);
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
