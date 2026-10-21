// Run with node --test tests/systems/attack-mobility.test.mjs (no dependencies).
// Attack mobility (js/data/attack-mobility.js): every attack moves by a
// tier (quick, medium, heavy, planted) chosen for what it does, steering
// with a share of the steering authority toward a share of top speed, the
// two apart. Checked: the tiers and their resolution, that every attack of
// every fighter names its tier on purpose, and on the real Fighter, physics
// and combat for every playable fighter: a quick strike keeps a run it is
// thrown at, every tier steers in every phase as its numbers say, heavy and
// planted ones stay committed, aerials keep their drift, and a plunge's or
// lift's own drift is unchanged. Shared rules, run on each fighter's own
// data (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACK_MOBILITY, DEFAULT_ATTACK_MOBILITY, MOBILITY_FIELDS, MOBILITY_TIERS, resolveMobility,
} from '../../js/data/attack-mobility.js';
import { createAttackDefinition, attackPhase } from '../../js/game/combat/attacks.js';
import { CHARACTERS, playableCharacters } from '../../js/data/characters.js';
import { DT, MOVEMENT as MV, harnessFor } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const RIGHT = { runRight: true };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Every attack a fighter performs from a button, by place: [{ action, id }].
function buttonAttacks(c, f, place) {
  const out = [];
  for (const [action, mapping] of Object.entries(c.actions ?? {})) {
    if (!mapping || mapping.type) continue;
    const id = typeof mapping === 'string' ? mapping : mapping[place];
    const atk = id ? f.attacks[id] : null;
    if (!atk || (place === 'air' && atk.groundOnly)) continue;
    out.push({ action, id, atk });
  }
  return out;
}

// A fighter running right at top speed.
function running(makeFighter) {
  const h = makeFighter({ x: 300 });
  for (let i = 0; i < 20; i++) h.step(RIGHT);
  assert.equal(h.fighter.body.vx, MV.maxSpeed);
  return h;
}

test('the tiers: six numbers each, shares from 0 to 1; quick to planted, less authority and less speed', () => {
  assert.deepEqual([...MOBILITY_TIERS], ['quick', 'medium', 'heavy', 'planted']);
  assert.deepEqual([...MOBILITY_FIELDS], ['momentum', 'airMomentum', 'control', 'airControl', 'topSpeed', 'airTopSpeed', 'friction']);
  assert.equal(DEFAULT_ATTACK_MOBILITY, 'medium', 'an attack naming none is never planted');
  for (const tier of MOBILITY_TIERS) assert.ok(Object.isFrozen(ATTACK_MOBILITY[tier]), tier);
  const { quick, medium, heavy, planted } = ATTACK_MOBILITY;
  for (const field of ['control', 'airControl', 'topSpeed', 'airTopSpeed', 'momentum']) {
    assert.ok(quick[field] >= medium[field] && medium[field] >= heavy[field], `${field}: quick ≥ medium ≥ heavy`);
  }
  assert.ok(quick.friction <= medium.friction && medium.friction <= heavy.friction, 'friction: quick slides on longest');
  assert.equal(quick.topSpeed, 1, 'a quick strike may hold the whole run');
  assert.ok(quick.control < 1, '…though it steers a little more slowly than the run');
  assert.equal(planted.control, 0);
  assert.equal(planted.airControl, 0);
});

test('resolution: the tier, the attack\'s own fields over it, and nothing out of range', () => {
  assert.deepEqual(resolveMobility({}), { mobility: 'medium', ...ATTACK_MOBILITY.medium });
  assert.deepEqual(resolveMobility({ mobility: 'heavy', airControl: 0.5 }), { mobility: 'heavy', ...ATTACK_MOBILITY.heavy, airControl: 0.5 });
  assert.throws(() => resolveMobility({ mobility: 'snappy' }, 'X'), /X has mobility "snappy"/);
  assert.throws(() => resolveMobility({ control: 1.5 }, 'X'), /control 1.5: a share from 0 to 1/);
  assert.throws(() => resolveMobility({ topSpeed: -0.1 }, 'X'), /topSpeed/);
  assert.throws(() => resolveMobility({ friction: -1 }, 'X'), /friction -1: a rate from 0/);
  // Through the attack schema too.
  const atk = createAttackDefinition({ id: 'a', animation: 'x', damage: 1, mobility: 'quick' });
  for (const field of MOBILITY_FIELDS) assert.equal(atk[field], ATTACK_MOBILITY.quick[field], field);
  assert.equal(atk.mobility, 'quick');
  assert.throws(() => createAttackDefinition({ id: 'b', animation: 'x', damage: 1, mobility: 'nope' }), /mobility "nope"/);
  const pending = createAttackDefinition({ id: 'p', animation: 'x', pending: true });
  assert.equal(pending.mobility, 'medium', 'a pending attack moves as any ordinary one');
});

test('every attack of every fighter, and every Deflect, names its tier on purpose', () => {
  for (const c of CHARACTERS) {
    for (const [id, spec] of Object.entries(c.attacks ?? {})) {
      assert.ok(MOBILITY_TIERS.includes(spec.mobility), `#${c.id} ${id} names its mobility (${spec.mobility})`);
    }
    if (c.deflect) assert.ok(MOBILITY_TIERS.includes(c.deflect.mobility), `#${c.id} deflect names its mobility`);
  }
});

for (const c of playableCharacters()) {
  const { makeFighter } = harnessFor(c);
  const probe = makeFighter().fighter;
  const name = `#${c.id}`;
  const ground = buttonAttacks(c, probe, 'ground').filter(({ atk }) => !atk.motion || atk.motion.type === 'hover');
  const air = buttonAttacks(c, probe, 'air').filter(({ atk }) => !atk.motion || atk.motion.type === 'hover');

  test(`${name}: an attack thrown at a run keeps it as its tier says, held on; a quick one never brakes the run at all`, () => {
    for (const { action, id, atk } of ground) {
      const h = running(makeFighter);
      h.step({ ...RIGHT, ...P(action) });
      assert.equal(h.fighter.combat.attack?.def.id, id, `${id} started`);
      const top = MV.maxSpeed * atk.topSpeed;
      let low = Infinity;
      while (h.fighter.combat.attack) {
        h.step(RIGHT);
        low = Math.min(low, h.fighter.body.vx);
      }
      if (atk.mobility === 'quick') assert.equal(low, MV.maxSpeed, `${id}: the whole run, all through it`);
      else if (atk.control > 0) {
        // Eased down to its share (or up to it from a smaller momentum share),
        // never under it, never stopped dead.
        assert.ok(low >= Math.min(top, MV.maxSpeed * atk.momentum) - 1e-6, `${id}: never under its share (${low} < ${top})`);
        assert.ok(low > 0, `${id}: never stopped dead while held on`);
      }
    }
  });

  test(`${name}: steering works through the startup, the strike and the recovery, with each tier's authority, toward its share`, () => {
    for (const { action, id, atk } of ground) {
      const h = makeFighter({ x: 600 });
      h.step({ ...RIGHT, ...P(action) });
      if (atk.control <= 0) {
        assert.equal(h.fighter.body.vx, 0, `${id}: planted, held or not`);
        continue;
      }
      assert.ok(close(h.fighter.body.vx, Math.min(MV.acceleration * atk.control * DT, MV.maxSpeed * atk.topSpeed)), `${id}: its share of the acceleration`);
      const moved = { startup: 0, active: 0, recovery: 0 };
      while (h.fighter.combat.attack) {
        const phase = attackPhase(atk, h.fighter.combat.attack.time);
        const x = h.fighter.body.x;
        h.step(RIGHT);
        moved[phase] += h.fighter.body.x - x;
        // While it plays, and until a step-in (movement it makes itself)
        // raises it: the steering never builds past its share.
        const record = h.fighter.combat.attack;
        if (record && !record.stepped) {
          assert.ok(h.fighter.body.vx <= MV.maxSpeed * atk.topSpeed + 1e-6, `${id}: never past its share of top speed`);
        }
      }
      for (const phase of ['startup', 'active', 'recovery']) {
        if ((phase === 'startup' ? atk.startup : phase === 'active' ? atk.active : atk.recovery) >= DT) {
          assert.ok(moved[phase] > 0, `${id}: steered in its ${phase}`);
        }
      }
    }
  });

  test(`${name}: a heavy or planted attack stays a commitment: from a standstill it walks no faster than its share, never runs`, () => {
    for (const { action, id, atk } of ground) {
      if (atk.mobility !== 'heavy' && atk.mobility !== 'planted') continue;
      const h = makeFighter({ x: 600 });
      const x0 = h.fighter.body.x;
      h.step({ ...RIGHT, ...P(action) });
      let steps = 1;
      while (h.fighter.combat.attack) {
        h.step(RIGHT);
        steps++;
      }
      const travelled = h.fighter.body.x - x0;
      const step = atk.step ? atk.step.speed * atk.total : 0;
      assert.ok(travelled <= MV.maxSpeed * atk.topSpeed * steps * DT + step + 1e-6, `${id}: ${travelled.toFixed(1)} units`);
      assert.ok(travelled < MV.maxSpeed * steps * DT * 0.5, `${id}: well under a run's distance`);
    }
  });

  test(`${name}: an aerial keeps the drift it is thrown at while held on, and turns it round as its share allows`, () => {
    for (const { action, id, atk } of air) {
      const h = running(makeFighter);
      h.step({ ...RIGHT, ...P('jump') });
      for (let i = 0; i < 10; i++) h.step(RIGHT);
      h.step({ ...RIGHT, ...P(action) });
      assert.equal(h.fighter.combat.attack?.def.id, id, `${id} started`);
      while (h.fighter.combat.attack && !h.fighter.grounded) h.step(RIGHT);
      assert.ok(h.fighter.body.vx >= MV.maxSpeed * Math.min(atk.airTopSpeed, atk.airMomentum) - 1e-6, `${id}: the drift kept (${h.fighter.body.vx})`);
    }
  });

  test(`${name}: a press the fighter cannot act on leaves its speed alone`, () => {
    for (const { action, id } of ground) {
      const h = running(makeFighter);
      h.step({ ...RIGHT, ...P(action) });
      while (h.fighter.combat.attack) h.step(RIGHT);
      for (let i = 0; i < 20; i++) h.step(RIGHT);
      if (!h.fighter.combat.cooldowns.has(id)) continue;
      const before = h.fighter.body.vx;
      h.step({ ...RIGHT, ...P(action) });
      assert.equal(h.fighter.combat.attack, null, `${id}: refused while cooling`);
      assert.equal(h.fighter.body.vx, before, `${id}: the run untouched`);
    }
  });

  test(`${name}: run → quick strike → run and run → quick strike → jump flow without a stop`, () => {
    for (const { action, id, atk } of ground) {
      if (atk.mobility !== 'quick') continue;
      const h = running(makeFighter);
      h.step({ ...RIGHT, ...P(action) });
      while (h.fighter.combat.attack) h.step(RIGHT);
      h.step(RIGHT);
      assert.equal(h.fighter.body.vx, MV.maxSpeed, `${id}: running on at once`);
      assert.equal(h.fighter.state, 'run');
      // Cut by a jump the player asks for after it began: the run goes up with it.
      const j = running(makeFighter);
      j.fighter.controller.kind = 'player';
      j.step({ ...RIGHT, ...P(action) });
      j.step(RIGHT);
      j.step({ ...RIGHT, ...P('jump') });
      assert.equal(j.fighter.grounded, false, `${id}: jumped out of it`);
      assert.equal(j.fighter.body.vx, MV.maxSpeed, `${id}: the whole run in the air`);
    }
  });

  test(`${name}: a plunge's or a lift's own drift is unchanged: it steers toward the share its authority names`, () => {
    for (const [id, atk] of Object.entries(probe.attacks)) {
      const type = atk.motion?.type;
      if (type !== 'slam' && type !== 'bounce' && type !== 'rise') continue;
      assert.equal(atk.airTopSpeed, atk.airControl, `${id}: its authored drift`);
    }
  });
}
