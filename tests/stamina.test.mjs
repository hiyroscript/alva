// Run with node --test tests/stamina.test.mjs (no dependencies).
// Stamina: the purple bar's resource, spent only by Dash, Dodge and Block.
// Its defaults, clamping, passive and Charge refill, what each action costs,
// and the exhaustion lockout that only a full refill clears. Uses the real
// Fighter, CombatState and physics (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatState, resolveStamina } from '../js/game/combat.js';
import { staminaBarState, STAMINA_STYLE } from '../js/game/fighter-status.js';
import { def, DT, makeFighter, fakeSprites, duel, steps } from './fighter-harness.mjs';

const DEFENSE = { defense: true, defensePressed: true };
const CHARGE = { charge: true };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} vs ${b}`);
// Two presses of `dir`, one step apart: a Dash's double tap.
const dash = (step, dir = 'right') => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};
const BLOCKER = { ...def, defense: { type: 'block' }, stats: { ...def.stats, blockDamageScale: 0.2 } };

test('#0001 declares its stamina: 100 max, 12 / s, 30 / s in Charge, 25 per Dash or Dodge, 20 / s of Block', () => {
  assert.deepEqual(def.stamina, { max: 100, regen: 12, chargeRegen: 30, dashCost: 25, dodgeCost: 25, blockDrain: 20 });
  // Defaults for a future fighter that declares none (or only some).
  assert.deepEqual({ ...resolveStamina(undefined) }, def.stamina);
  assert.deepEqual({ ...resolveStamina({ max: 80, dashCost: 10 }) }, { ...def.stamina, max: 80, dashCost: 10 });
  const bare = makeFighter({ character: { ...def, stamina: undefined } }).fighter;
  assert.equal(bare.combat.maxStamina, 100);
  // It is not the old Energy: nothing is called that.
  const c = new CombatState();
  for (const key of ['energy', 'maxEnergy', 'infiniteEnergy']) assert.equal(key in c, false, `no ${key}`);
});

test('a fighter starts full, its bar hidden, and not exhausted; stamina never leaves [0, max]', () => {
  const { fighter } = makeFighter();
  const c = fighter.combat;
  assert.deepEqual([c.stamina, c.maxStamina, c.staminaExhausted], [100, 100, false]);
  assert.deepEqual(staminaBarState(fighter), { visible: false, ratio: 1, exhausted: false, color: STAMINA_STYLE.fill });
  assert.match(STAMINA_STYLE.fill, /^#a8/, 'purple');
  c.regenStamina(50);
  assert.equal(c.stamina, 100, 'never above the maximum');
  assert.equal(c.spendStamina(150), false, 'a cost it cannot pay is refused, nothing spent');
  assert.equal(c.stamina, 100);
  c.drainStamina(400);
  assert.equal(c.stamina, 0, 'never below 0');
  assert.equal(c.staminaExhausted, true);
  assert.deepEqual(staminaBarState(fighter), { visible: true, ratio: 0, exhausted: true, color: STAMINA_STYLE.exhausted });
});

test('it refills by itself at 12 per second: standing, running, in the air, attacking and stunned alike', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setStamina(10);
  for (let i = 0; i < 60; i++) step();
  near(c.stamina, 22, 'a second standing');
  for (let i = 0; i < 30; i++) step({ right: true });
  near(c.stamina, 28, 'half a second running');
  step({ jump: true, jumpPressed: true });
  for (let i = 0; i < 29; i++) step();
  assert.equal(fighter.grounded, false);
  near(c.stamina, 34, 'half a second jumping');
  while (!fighter.grounded) step();
  const before = c.stamina;
  step({ action1: true, action1Pressed: true });
  assert.equal(fighter.state, 'attack');
  for (let i = 0; i < 5; i++) step();
  near(c.stamina, before + 6 * 0.2, 'attacking');
  // Stunned (and frozen by the hit): the refill never stops.
  const d = duel();
  d.target.combat.setStamina(50);
  d.tick({ action1: true, action1Pressed: true });
  d.until(() => d.target.combat.stun > 0);
  const hit = d.target.combat.stamina;
  for (let i = 0; i < 12; i++) d.tick();
  near(d.target.combat.stamina, hit + 12 * 0.2, 'stunned');
  // And it is never instant: 90 still needs most of a second.
  c.setStamina(90);
  for (let i = 0; i < 49; i++) step();
  assert.ok(c.stamina < 100);
});

test('Charge refills it faster, at 30 per second, only in the real Charge stance', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setStamina(20);
  for (let i = 0; i < 60; i++) step(CHARGE);
  assert.equal(fighter.state, 'charge');
  near(c.stamina, 50, 'a second of Charge: +30');
  // Letting go: the release pose is not Charge.
  step();
  assert.equal(fighter.state, 'chargeRelease');
  near(c.stamina, 50.2, 'the release step refills at the normal rate');
  // Charge held in the air is not the stance either.
  step({ jump: true, jumpPressed: true });
  const up = c.stamina;
  for (let i = 0; i < 10; i++) step(CHARGE);
  assert.equal(fighter.charging, false);
  near(c.stamina, up + 10 * 0.2);
});

test('a charged technique is not ordinary charging: Sphere Rush refills at the normal rate while Charge is held', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  for (let i = 0; i < 10; i++) step(CHARGE);
  step({ ...CHARGE, action2: true, action2Pressed: true });
  assert.ok(fighter.technique, 'the Sphere Rush started');
  c.setStamina(40);
  for (let i = 0; i < 20; i++) step(CHARGE);
  assert.ok(fighter.technique);
  assert.equal(fighter.charging, false);
  near(c.stamina, 44, 'normal rate');
});

test('a Dodge spends exactly 25 as it starts, and only then; spending the last of it exhausts', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  step(DEFENSE);
  assert.equal(fighter.state, 'defense');
  assert.equal(c.stamina, 75, 'exactly 25, and no refill on the step it was spent');
  step();
  near(c.stamina, 75.2, 'then the refill carries on');
  while (fighter.state === 'defense') step();
  // Too little left: no Dodge at all, nothing spent.
  c.setStamina(20);
  step(DEFENSE);
  assert.notEqual(fighter.state, 'defense');
  assert.equal(c.defenseAction, null);
  near(c.stamina, 20.2, 'nothing spent');
  // Exactly enough: it happens, and empties the bar.
  c.setStamina(25);
  step(DEFENSE);
  assert.equal(fighter.state, 'defense');
  assert.equal(c.stamina, 0);
  assert.equal(c.staminaExhausted, true, 'spending to zero exhausts at once');
  // A Dodge whose art is missing never spends.
  const noArt = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'dodge')) });
  const warn = console.warn;
  console.warn = () => {};
  try {
    noArt.step(DEFENSE);
  } finally {
    console.warn = warn;
  }
  assert.equal(noArt.fighter.combat.defenseAction, null);
  assert.equal(noArt.fighter.combat.stamina, 100);
  // Nor one refused because the fighter cannot act.
  const busy = makeFighter();
  busy.step({ action1: true, action1Pressed: true });
  busy.step(DEFENSE);
  assert.equal(busy.fighter.combat.defenseAction, null);
  assert.equal(busy.fighter.combat.stamina, 100);
});

test('a held Block drains 20 per second, deterministically, and ends the moment it runs out', () => {
  const run = () => {
    const { fighter, step } = makeFighter({ character: BLOCKER });
    const trace = [];
    for (let i = 0; i < 60; i++) {
      step({ defense: true });
      trace.push(fighter.combat.stamina);
    }
    return { fighter, step, trace };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.trace, b.trace, 'the same every time');
  assert.equal(a.fighter.state, 'block');
  near(a.fighter.combat.stamina, 80, 'a second of Block: -20, and no refill while it drains');
  near(a.trace[0], 100 - 20 / 60, 'rate x dt each step, never the whole cost at once');
  // Running out ends the guard on that very step.
  const { fighter, step } = a;
  fighter.combat.setStamina(0.5);
  step({ defense: true });
  assert.equal(fighter.combat.blocking, true);
  step({ defense: true });
  assert.equal(fighter.combat.stamina, 0);
  assert.equal(fighter.combat.blocking, false, 'the guard drops at 0');
  assert.equal(fighter.combat.staminaExhausted, true);
  step({ defense: true });
  assert.equal(fighter.combat.blocking, false, 'no immediate re-block');
  assert.notEqual(fighter.state, 'block');
});

test('Block keeps its chip damage: stamina changes nothing about the hit itself', () => {
  const { attacker, target, tick, events } = duel({ targetCharacter: BLOCKER });
  tick({}, { defense: true });
  tick({ action1: true, action1Pressed: true }, { defense: true });
  for (let i = 0; i < 60 && !events.length; i++) tick({}, { defense: true });
  assert.equal(events[0].type, 'block');
  near(events[0].damage, 5 * 0.2, 'chip damage as before');
  near(target.combat.knockback, 1);
  assert.ok(attacker.combat.stamina === 100, 'attacking costs nothing');
});

test('exhaustion lockout: from 0, Dash, Dodge and Block stay locked through 25, 50 and 99, and open at exactly 100', () => {
  const dodger = makeFighter();
  const blocker = makeFighter({ character: BLOCKER, x: 900 });
  const all = [dodger, blocker];
  // 1-2. Empty: exhausted.
  for (const { fighter } of all) {
    fighter.combat.drainStamina(100);
    assert.equal(fighter.combat.stamina, 0);
    assert.equal(fighter.combat.staminaExhausted, true);
  }
  const locked = (label) => {
    const { fighter, step } = dodger;
    const before = fighter.combat.stamina;
    assert.equal(fighter.tryDash(1), false, `${label}: no Dash`);
    assert.equal(fighter.tryDefense(), false, `${label}: no Dodge`);
    assert.equal(fighter.combat.stamina, before, `${label}: nothing spent`);
    assert.equal(fighter.combat.defenseAction, null);
    assert.equal(fighter.dash, null);
    blocker.step({ defense: true });
    assert.equal(blocker.fighter.combat.blocking, false, `${label}: no Block`);
    step();
  };
  const refillTo = (value) => {
    for (const { fighter } of all) {
      while (fighter.combat.stamina < value - 1e-9) fighter.combat.updateStamina(DT, false);
    }
  };
  // 3-6. Refilled to 25: enough for a Dash or a Dodge, still locked.
  refillTo(25);
  assert.ok(dodger.fighter.combat.canUseStamina(0) === false && dodger.fighter.combat.stamina > 25 - 1e-6);
  assert.equal(dodger.fighter.combat.staminaExhausted, true);
  locked('at 25');
  refillTo(50);
  assert.equal(dodger.fighter.combat.staminaExhausted, true);
  locked('at 50');
  // 7-8. 99: still locked, and the bar still gray.
  refillTo(99);
  assert.equal(staminaBarState(dodger.fighter).color, STAMINA_STYLE.exhausted);
  assert.ok(dodger.fighter.combat.stamina < 100);
  locked('at 99');
  // 9-10. Full: exhaustion clears.
  refillTo(100);
  for (const { fighter } of all) {
    assert.equal(fighter.combat.stamina, 100);
    assert.equal(fighter.combat.staminaExhausted, false);
  }
  assert.equal(staminaBarState(dodger.fighter).visible, false, 'full: the bar is gone, never purple first');
  // 11. Everything available again.
  assert.equal(dodger.fighter.tryDefense(), true, 'Dodge');
  while (dodger.fighter.combat.defenseAction) dodger.step();
  dodger.fighter.combat.refillStamina();
  assert.equal(dodger.fighter.tryDash(1), true, 'Dash');
  blocker.step({ defense: true });
  assert.equal(blocker.fighter.combat.blocking, true, 'Block');
});

test('exhausted, a fighter still moves, jumps, attacks, charges and uses its charged actions', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.drainStamina(100);
  const x = fighter.body.x;
  for (let i = 0; i < 10; i++) step({ right: true });
  assert.ok(fighter.body.x > x, 'moves');
  step({ jump: true, jumpPressed: true });
  step();
  assert.equal(fighter.grounded, false, 'jumps');
  while (!fighter.grounded) step();
  for (let i = 0; i < 20; i++) step();
  step({ action1: true, action1Pressed: true });
  assert.equal(fighter.state, 'attack', 'attacks');
  while (fighter.combat.attack) step();
  for (let i = 0; i < 10; i++) step();
  for (let i = 0; i < 5; i++) step(CHARGE);
  assert.equal(fighter.state, 'charge', 'charges: stamina never gates Charge');
  assert.equal(c.staminaExhausted, true);
  step({ ...CHARGE, action2: true, action2Pressed: true });
  assert.ok(fighter.technique, 'Charged BA2 (CAB2): its own cooldown, no stamina');
});

test('nothing but Dash, Dodge and Block ever spends it: runs, jumps, attacks, shurikens and charged actions are free', () => {
  const d = duel();
  const { attacker, tick } = d;
  const spent = () => {
    // Refill is the only change: stamina never drops.
    let last = attacker.combat.stamina;
    return (held = {}) => {
      tick(held);
      assert.ok(attacker.combat.stamina >= last - 1e-9, `nothing spent (${attacker.state})`);
      last = attacker.combat.stamina;
    };
  };
  attacker.combat.setStamina(50);
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
