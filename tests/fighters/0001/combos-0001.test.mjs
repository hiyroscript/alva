// Run with node --test tests/fighters/0001/combos-0001.test.mjs (no dependencies).
// #0001's combos: the routes its moves are built to chain, each a true
// combo (the target never free to act between the hits) on a fresh or
// lightly battered target, and each dropping once the target's Launch
// Point sends it out of reach, so nothing loops forever. Scripted presses
// on the real Fighter, pushboxes, projectiles, pulls and CombatSystem (see
// tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { duel, steps } from '../../helpers/fighter-harness.mjs';
import { getCharacter } from '../../../js/data/characters.js';

const DEF = getCharacter('0001');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

// #0001 against #0001 at `gap`, the target at `lp` Launch Point, run by
// `script(step)` (the attacker's presses) for `count` steps. Returns the
// attacker's hits ({ step, move }) and how many of them form a true combo
// from the first: each one landing before the target could act again.
function combo(script, { lp = 0, gap = 40, count = 120 } = {}) {
  const d = duel({ attackerCharacter: DEF, targetCharacter: DEF, gap, pushboxes: true });
  d.target.combat.launchPoint = lp;
  const free = [];
  const update = d.target.update.bind(d.target);
  d.target.update = (dt, ctx) => {
    update(dt, ctx);
    free.push(d.target.canAct());
  };
  const hits = [];
  for (let i = 0; i < count; i++) {
    const before = d.events.length;
    d.tick(script(i) ?? {}, {});
    for (const e of d.events.slice(before)) {
      if (e.attacker === d.attacker && e.type === 'hit') hits.push({ step: i, move: e.move });
    }
  }
  let chain = hits.length ? 1 : 0;
  while (chain < hits.length && free.slice(hits[chain - 1].step + 1, hits[chain].step + 1).every((f) => !f)) chain++;
  return { hits, chain, moves: hits.slice(0, chain).map((h) => h.move), d };
}

// A press of `button` on each step listed.
const presses = (plan) => (i) => (plan[i] ? P(plan[i]) : {});

test('Jab into High Kick: the Jab\'s follow-up launches, a true combo up to about 30 Launch Point', () => {
  const route = presses({ 0: 'attack1', 8: 'extra_attack' });
  for (const lp of [0, 10, 20, 30]) assert.deepEqual(combo(route, { lp }).moves, ['attack1', 'extra_attack'], `at ${lp}`);
  assert.equal(combo(route, { lp: 50 }).chain, 1, 'at 50 the Jab pushes it out of the kick\'s reach');
});

test('repeated Jabs cannot form a true combo through the repeat cooldown', () => {
  const jabs = (i) => (i % 12 === 0 ? P('attack1') : {});
  for (const lp of [0, 20, 40]) assert.equal(combo(jabs, { lp, gap: 38, count: 200 }).chain, 1);
});

test('High Kick, jump, Floating Straight: the launcher chased up into the air, a true combo up to about 30', () => {
  const route = presses({ 0: 'extra_attack', 14: 'jump', 17: 'attack1' });
  for (const lp of [0, 10, 20, 30]) assert.deepEqual(combo(route, { lp }).moves, ['extra_attack', 'midair_attack1'], `at ${lp}`);
  assert.equal(combo(route, { lp: 50 }).chain, 1, 'at 50 it flies out of reach');
});

test('High Kick, jump, Blue: the pull reaches a target launched higher, a true combo up to about 60', () => {
  const route = presses({ 0: 'extra_attack', 14: 'jump', 17: 'attack3' });
  for (const lp of [0, 20, 40, 60]) assert.deepEqual(combo(route, { lp }).moves, ['extra_attack', 'midair_attack3'], `at ${lp}`);
  assert.equal(combo(route, { lp: 120 }).chain, 1, 'at 120 not even Blue reaches it');
});

test('Jab into Red: the orb catches the pushed target, a true combo up to about 40', () => {
  const route = presses({ 0: 'attack1', 8: 'attack2' });
  for (const lp of [0, 20, 40]) assert.deepEqual(combo(route, { lp }).moves, ['attack1', 'attack2_object'], `at ${lp}`);
});

test('Unlimited Void into Hollow Purple: the paralysis outlasts the chant, so the sphere lands on a target that never moved', () => {
  // Attack 4, then Attack 5 pressed every step: it starts the moment the
  // Void lets #0001 go.
  const route = (i) => (i === 0 ? P('attack4') : P('attack5'));
  for (const gap of [60, 180]) {
    const run = combo(route, { gap, count: steps(3) });
    assert.deepEqual(run.moves, ['attack4.burst', 'attack5_object'], `at ${gap}`);
    assert.equal(run.chain, 2, 'a true combo');
  }
  // Too far for the domain: nothing to open with.
  assert.equal(combo(route, { gap: 320, count: steps(1.2) }).hits.length, 0);
});
