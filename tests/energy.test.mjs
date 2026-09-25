// Run with node --test tests/energy.test.mjs (no dependencies).
// Energy: the one resource, spent only by Dash (as it starts) and by the
// Shield (for each hit it blocks). Its defaults, clamping, passive and
// Charge refill, what each action costs, the exhaustion lockout that only a
// full refill clears, and the three-segment view of the one value. Uses the
// real Fighter, CombatState and physics (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CombatState, resolveEnergy } from '../js/game/combat.js';
import { energyBarState, energySegments, ENERGY_SEGMENTS, ENERGY_STYLE } from '../js/game/fighter-status.js';
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
const ratios = (energy) => energySegments(energy).map((s) => s.ratio);

test('#0001 declares its Energy: 100 max, 12 / s, 30 / s in Charge, 25 per Dash, 25 per blocked hit', () => {
  assert.deepEqual(def.energy, { max: 100, regen: 12, chargeRegen: 30, dashCost: 25, shieldHitCost: 25 });
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
  assert.deepEqual(bar.segments.map((s) => s.ratio), [1, 1, 1], 'hidden at full, all three full');
  c.regenEnergy(50);
  assert.equal(c.energy, 100, 'never above the maximum');
  assert.equal(c.spendEnergy(150), false, 'a cost it cannot pay is refused, nothing spent');
  assert.equal(c.energy, 100);
  c.setEnergy(-40);
  assert.equal(c.energy, 0, 'never below 0');
  assert.equal(c.energyExhausted, true);
  assert.deepEqual(energyBarState(fighter).segments.map((s) => s.ratio), [0, 0, 0]);
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
  for (let i = 0; i < 29; i++) step();
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

test('a Dash spends exactly 25 as it starts, and only then; spending the last of it exhausts', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  dash(step);
  assert.ok(fighter.dash);
  assert.equal(c.energy, 75, 'exactly 25, and no refill on the step it was spent');
  step();
  near(c.energy, 75.2, 'then the refill carries on');
  // Exactly enough: it happens, and empties the bar.
  while (fighter.dash || fighter.state !== 'idle') step();
  step({ leftPressed: true, left: true });
  step({});
  c.setEnergy(25);
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
  d.tick({}, HOLD);
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

test('low is not exhausted: 20 blocks nothing and cannot Dash, but both come back at 25 with no full refill', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(20);
  assert.equal(c.energyExhausted, false);
  assert.equal(energyBarState(fighter).color, ENERGY_STYLE.fill, 'purple, not gray');
  assert.equal(c.canShield(), false);
  assert.equal(fighter.tryDash(1), false);
  while (c.energy < 25) c.updateEnergy(DT, false);
  assert.equal(c.canShield(), true);
  step(HOLD);
  assert.equal(c.shielding, true);
  step();
  while (fighter.state !== 'idle') step();
  assert.equal(fighter.tryDash(1), true);
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

// ---- Three segments over one value ---------------------------------------------------

test('three segments of 34, 33 and 33: exactly 100, one value, no Energy lost or gained to rounding', () => {
  assert.deepEqual([...ENERGY_SEGMENTS], [34, 33, 33]);
  assert.ok(Object.isFrozen(ENERGY_SEGMENTS));
  assert.equal(ENERGY_SEGMENTS.reduce((a, b) => a + b, 0), 100);
  for (let e = 0; e <= 100; e += 0.5) {
    const segs = energySegments(e);
    assert.equal(segs.length, 3);
    near(segs.reduce((a, s) => a + s.amount, 0), e, `amounts add up at ${e}`);
    assert.deepEqual(segs.map((s) => s.capacity), [34, 33, 33]);
    for (const s of segs) assert.ok(s.ratio >= 0 && s.ratio <= 1);
  }
  // Clamped like the value itself.
  assert.deepEqual(ratios(-5), [0, 0, 0]);
  assert.deepEqual(ratios(140), [1, 1, 1]);
});

test('spending empties the segments front to back: 100, 75, 66, 50, 33, 25 and 0', () => {
  assert.deepEqual(ratios(100), [1, 1, 1]);
  assert.deepEqual(ratios(75), [9 / 34, 1, 1], '75: the front one partly spent');
  assert.deepEqual(ratios(67), [1 / 34, 1, 1]);
  assert.deepEqual(ratios(66), [0, 1, 1], 'the front one exactly empty');
  assert.deepEqual(ratios(50), [0, 17 / 33, 1], '50: the middle one half gone');
  assert.deepEqual(ratios(34), [0, 1 / 33, 1]);
  assert.deepEqual(ratios(33), [0, 0, 1], 'only the back one left');
  assert.deepEqual(ratios(25), [0, 0, 25 / 33]);
  assert.deepEqual(ratios(0), [0, 0, 0]);
  // Every drop from 100 to 0 only ever takes from the frontmost non-empty one.
  let prev = ratios(100);
  for (let e = 99; e >= 0; e--) {
    const now = ratios(e);
    const changed = now.map((r, i) => r !== prev[i]);
    assert.equal(changed.filter(Boolean).length, 1, `one segment changes at ${e}`);
    const i = changed.indexOf(true);
    assert.ok(prev.slice(0, i).every((r) => r === 0), `the ones in front of ${i} are already empty at ${e}`);
    prev = now;
  }
});

test('refilling rebuilds back to front: the back segment first, then the middle, then the front, never all at once', () => {
  const order = [];
  let prev = ratios(0);
  for (let e = 0.5; e <= 100; e += 0.5) {
    const now = ratios(e);
    const growing = now.map((r, i) => r > prev[i]).flatMap((g, i) => (g ? [i] : []));
    assert.equal(growing.length, 1, `exactly one segment fills at ${e}: ${now}`);
    if (order.at(-1) !== growing[0]) order.push(growing[0]);
    // The segments behind the one filling are full.
    for (let j = growing[0] + 1; j < 3; j++) assert.equal(now[j], 1, `behind ${growing[0]} is full at ${e}`);
    prev = now;
  }
  assert.deepEqual(order, [2, 1, 0], 'back, middle, front');
  // A real refill from an exhaustion: gray, and the rear rebuilt first.
  const { fighter, step } = makeFighter();
  fighter.combat.setEnergy(0);
  for (let i = 0; i < steps(2); i++) step();
  const bar = energyBarState(fighter);
  const round = (list) => list.map((x) => +x.toFixed(6));
  assert.equal(bar.color, ENERGY_STYLE.exhausted);
  assert.deepEqual(round(bar.segments.map((s) => s.ratio)), round([0, 0, 24 / 33]),
    'two seconds in: only the back segment, 24 of 33');
  for (let i = 0; i < steps(2); i++) step();
  assert.deepEqual(round(energyBarState(fighter).segments.map((s) => s.ratio)), round([0, 15 / 33, 1]),
    'four seconds in: back full, middle filling, front still empty');
});
