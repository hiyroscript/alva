// Run with node --test tests/systems/grab.test.mjs (no dependencies).
// A grab (`grab: { recovery }`, a multi-hit attack's: js/game/combat/
// attacks.js): its first strike seizes, and the rest of the move follows
// only a seizure. If that strike has made no real hit by the end of its
// window (it found nobody, or a raised Shield blocked it), the grab has
// missed: no later strike is live and the attack ends `recovery` after the
// window, well before its full length. Until it has seized someone its
// motion never moves it, so a lift (motion `rise`) that misses never
// leaves the ground. Nothing passes a Shield. Checked on a test-only
// grabber (#0001 whose Jab is a grab that lifts) through the real Fighter
// and CombatSystem; #0014's Meteodrive and Meteor Strike in its own tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { attackEndsAt } from '../../js/game/combat/combat-state.js';
import { ROUTINE_EFFECTS, cooldownClass } from '../../js/data/cooldowns.js';
import { def, duel, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -80, w: 40, h: 80 };
const HITS = [
  { at: 0.1, active: 0.05, damage: 1, hitbox: BOX },
  { at: 0.2, active: 0.05, damage: 3, hitbox: { x: -20, y: -140, w: 70, h: 140 }, baseLaunch: 2, directionalLaunch: 'vertical' },
];

// #0001 whose Jab seizes, then lifts it 400 units/s, then strikes again.
const GRABBER = {
  ...def,
  id: 'test-grabber',
  attacks: {
    ...def.attacks,
    attack1: {
      animation: def.attacks.attack1.animation, recovery: 0.1, hitstun: 0.5, groundOnly: true,
      grab: { recovery: 0.05 }, carry: { lift: 0 }, hits: HITS, motion: { type: 'rise', speed: 400 },
    },
  },
};

test('a grab is a multi-hit attack\'s, its seizing strike the first: refused on a single strike, a bad recovery or a pending attack', () => {
  const g = createAttackDefinition({ id: 'g', hits: HITS, grab: { recovery: 0.05 } });
  assert.equal(g.grab.recovery, 0.05);
  assert.ok(Math.abs(g.grab.until - 0.15) < 1e-9, 'it is known at the end of its first strike');
  assert.equal(createAttackDefinition({ id: 'g', hits: HITS, grab: {} }).grab.recovery, 0, 'no recovery by default');
  assert.equal(createAttackDefinition({ id: 'g', hits: HITS }).grab, null, 'none by default');
  assert.throws(() => createAttackDefinition({ id: 'g', hitbox: BOX, damage: 3, grab: {} }), /a grab is a multi-hit attack/);
  assert.throws(() => createAttackDefinition({ id: 'g', hits: [HITS[0]], grab: {} }), /a grab is a multi-hit attack/);
  for (const bad of [-0.1, '0.1', NaN, Infinity]) {
    assert.throws(() => createAttackDefinition({ id: 'g', hits: HITS, grab: { recovery: bad } }), /grab recovery must be/, String(bad));
  }
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, grab: {} }), /pending but declares grab/);
  // Routine: no cooldown of its own.
  assert.ok(ROUTINE_EFFECTS.includes('grab'));
  assert.equal(cooldownClass('attack', { hits: HITS, grab: {} }), 'ordinary');
});

test('a seizure goes on: every strike follows, and its lift rises', () => {
  const d = duel({ attackerCharacter: GRABBER, gap: 30 });
  d.tick(P('attack1'));
  let highest = 0;
  for (let i = 0; i < steps(0.5); i++) {
    d.tick();
    highest = Math.max(highest, 800 - d.attacker.body.y);
  }
  assert.deepEqual(d.events.filter((e) => e.attacker === d.attacker).map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.ok(highest > 30, 'it rose once it had seized');
});

test('a grab that seizes nobody lets go: no later strike, never off the ground, over at its window and its recovery', () => {
  const d = duel({ attackerCharacter: GRABBER, gap: 300 });
  d.tick(P('attack1'));
  const record = d.attacker.combat.attack;
  let highest = 0;
  let n = 1;
  while (d.attacker.combat.attack && n < 120) {
    d.tick();
    highest = Math.max(highest, 800 - d.attacker.body.y);
    n++;
  }
  assert.ok(Math.abs(record.whiffAt - 0.2) < 1e-9, 'it missed: over 0.05 s after its seizing strike');
  assert.equal(attackEndsAt(record), record.whiffAt);
  assert.ok(record.time < record.def.total, 'well before its full length');
  assert.equal(highest, 0, 'a lift that seized nobody never leaves the ground');
  assert.deepEqual(d.events, []);
});

test('a raised Shield is a missed grab: the seizure blocked, nothing follows', () => {
  const d = duel({ attackerCharacter: GRABBER, gap: 30 });
  d.tick({}, P('shield'));
  for (let i = 0; i < steps(0.3); i++) d.tick({}, { shield: true });
  d.tick(P('attack1'), { shield: true });
  for (let i = 0; i < steps(0.6); i++) d.tick({}, { shield: true });
  assert.deepEqual(d.events.filter((e) => e.attacker === d.attacker).map((e) => e.type), ['block']);
  assert.ok(d.attacker.body.grounded);
});
