// Run with node --test tests/systems/basic-strings.test.mjs (no dependencies).
// Each fighter's basic two-hit strings, as a player makes them by hand:
// Attack 1 then Attack 2, and Attack 2 then Attack 1, against a standing
// target, from every spacing where both moves land on their own. Under the
// strict cancellation rules an attack is never cut short just because the
// second button was pressed: the second press waits for a legitimate
// moment, the first attack's authored hit-confirmed window (`hitCancel`,
// once its hit has landed) or the step it plays out in full. What holds
// for every fighter (ALVA_SPEC.md 7.2.4b): Attack 1 into Attack 2 through
// its hit-confirmed window lands on a fresh target (0 Launch Point) from
// every spacing both reach; Attack 2 into Attack 1 lands on a fresh target
// from most of them; and a second press made the instant the first hit
// lands never starts before that window. Nothing moves the fighter toward
// its target in between: the spacing is the player's own (see
// direct-input.test.mjs). Pressing the same button twice never makes a
// string: each button asks for its own move only. Read from each fighter's
// data, never its id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playableCharacters } from '../../js/data/characters.js';
import { DT } from '../helpers/fighter-harness.mjs';
import { playerRig, press } from '../helpers/player-rig.mjs';

const EPS = 1e-6;

// Whether `r`'s player landed a real hit with attack `id` (its projectile's
// included).
const landed = (r, id) => r.events.some((e) => e.attacker === r.player && e.type === 'hit' && (e.move === id || e.move?.startsWith(`${id}_`)));

// `action` pressed alone from `gap`: does it land on a standing target?
function lands(c, action, gap) {
  const r = playerRig({ character: c, gap });
  r.tick(press(action));
  for (let i = 0; i < 90; i++) r.tick();
  return landed(r, r.player.attackFor(action));
}

// Steps `r` until its player's attack in progress plays out on the next
// step (or is already over).
function untilLastStep(r) {
  const record = r.player.combat.attack;
  const combat = r.player.combat;
  while (combat.attack === record && !(combat.hitstop <= 0 && record.time + DT >= record.def.total - EPS)) r.tick();
}

// Steps `r` until its player's attack in progress has landed its hit and
// the impact freeze is over (or the attack is over).
function untilConfirmed(r) {
  const record = r.player.combat.attack;
  const combat = r.player.combat;
  while (combat.attack === record && !(record.confirmed && combat.hitstop <= 0)) r.tick();
}

// Steps `r` until its player's attack in progress may be cut short (its
// hit-confirmed window open, CombatState.cancellable) or is over.
function untilWindow(r) {
  const record = r.player.combat.attack;
  const combat = r.player.combat;
  while (combat.attack === record && !combat.cancellable) r.tick();
}

// `first` pressed, then `second` pressed at `moment` ('window': its
// hit-confirmed window, untilWindow; 'end': as it plays out, untilLastStep),
// from `gap`, the target at Launch Point `lp`: do both land?
function string(c, first, second, gap, lp, moment = 'window') {
  const r = playerRig({ character: c, gap });
  r.foe.combat.launchPoint = lp;
  r.tick(press(first));
  if (moment === 'window') untilWindow(r);
  else untilLastStep(r);
  r.tick(press(second));
  for (let i = 0; i < 150; i++) r.tick();
  return landed(r, r.player.attackFor(first)) && landed(r, r.player.attackFor(second));
}

// The spacings (every 8 units) where both of `c`'s ground Attack 1 and 2
// land on their own.
function spacings(c) {
  const out = [];
  for (let gap = 0; gap <= 320; gap += 8) if (lands(c, 'attack1', gap) && lands(c, 'attack2', gap)) out.push(gap);
  return out;
}

test('Attack 1 into Attack 2 through its hit-confirmed window lands on a fresh target for every fighter, from every spacing both reach', () => {
  for (const c of playableCharacters()) {
    const gaps = spacings(c);
    assert.ok(gaps.length >= 3, `#${c.id}: a close range both moves share`);
    for (const gap of gaps) assert.ok(string(c, 'attack1', 'attack2', gap, 0), `#${c.id} from ${gap}`);
  }
});

test('Attack 2 into Attack 1 lands on a fresh target for every fighter from most spacings both reach, through its window or as Attack 2 plays out', () => {
  for (const c of playableCharacters()) {
    const gaps = spacings(c);
    const ok = gaps.filter((gap) => string(c, 'attack2', 'attack1', gap, 0, 'window') || string(c, 'attack2', 'attack1', gap, 0, 'end'));
    assert.ok(ok.length * 2 >= gaps.length, `#${c.id}: ${ok.length} of ${gaps.length}`);
  }
});

test('the second press made the instant the first hit lands waits: it never starts before the first attack\'s hit-confirmed window', () => {
  for (const c of playableCharacters()) {
    const gap = spacings(c)[0];
    const r = playerRig({ character: c, gap });
    r.tick(press('attack1'));
    const record = r.player.combat.attack;
    untilConfirmed(r);
    if (r.player.combat.attack !== record) continue;
    r.tick(press('attack2'));
    if (r.player.combat.attack !== record) {
      assert.ok(record.time >= (record.def.hitCancel ?? record.def.total) - EPS, `#${c.id}: only from its window`);
    } else {
      r.until(() => r.player.combat.attack !== record);
      assert.ok(record.time >= (record.def.hitCancel ?? record.def.total) - EPS, `#${c.id}: never before its window`);
    }
  }
});

test('the same button pressed twice is never a string: the second press is nothing, and nothing follows the first attack', () => {
  for (const c of playableCharacters()) {
    const gaps = spacings(c);
    for (const button of ['attack1', 'attack2']) {
      const other = button === 'attack1' ? 'attack2' : 'attack1';
      const r = playerRig({ character: c, gap: gaps[0] });
      r.tick(press(button));
      const record = r.player.combat.attack;
      r.tick(press(button));
      assert.equal(r.player.combat.attack, record, `#${c.id} ${button}: the repeat neither cuts nor restarts it`);
      untilLastStep(r);
      r.tick(press(button));
      for (let i = 0; i < 150; i++) r.tick();
      assert.equal(landed(r, r.player.attackFor(other)), false, `#${c.id} ${button}: ${other} never comes`);
      assert.ok(!r.events.some((e) => e.attacker === r.player && e.move === r.player.attackFor(other)), `#${c.id}: ${other} never even tried`);
    }
  }
});
