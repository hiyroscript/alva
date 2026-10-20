// Run with node --test tests/systems/basic-strings.test.mjs (no dependencies).
// Each fighter's basic two-hit strings, as a player gets them by pressing
// the same button twice (Combo Assist's queued follow-up, default
// settings): Attack 1 then Attack 2, and Attack 2 then Attack 1, against a
// standing target, from every spacing where both moves land on their own.
// The chosen ranges (ALVA_SPEC.md 7.2.4b): Attack 1 into Attack 2 lands up
// to at least 60 Launch Point for every fighter; Attack 2 into Attack 1 up
// to at least 30, unless Attack 2 ends in a full launcher (Base Launch 3: a
// fling meant to end the string), which only has to land while launches
// are short (15). Combat Assist only ever helps: whatever lands without it
// lands with it. Read from each fighter's data, never its id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playableCharacters } from '../../js/data/characters.js';
import { playerRig, press } from '../helpers/player-rig.mjs';

// Whether `r`'s player landed a real hit with attack `id` (its projectile's
// included).
const landed = (r, id) => r.events.some((e) => e.attacker === r.player && e.type === 'hit' && (e.move === id || e.move?.startsWith(`${id}_`)));

// `action` pressed alone from `gap`: does it land on a standing target?
function lands(c, action, gap) {
  const r = playerRig({ character: c, gap, combatAssist: false });
  r.tick(press(action));
  for (let i = 0; i < 90; i++) r.tick();
  return landed(r, r.player.attackFor(action));
}

// `first` pressed, then pressed again at once (queuing `second`), from
// `gap`, the target at Launch Point `lp`: do both land?
function string(c, first, second, gap, lp, combatAssist = true) {
  const r = playerRig({ character: c, gap, combatAssist });
  r.foe.combat.launchPoint = lp;
  r.tick(press(first));
  r.tick(press(first));
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

// Whether attack `atk`'s last hit is a full launcher (Base Launch 3).
function endsInFling(atk) {
  const last = atk.hits?.at(-1) ?? atk;
  return last.baseLaunch === 3;
}

test('Attack 1 into Attack 2 lands up to 60 Launch Point for every fighter, from every spacing both reach', () => {
  for (const c of playableCharacters()) {
    const gaps = spacings(c);
    assert.ok(gaps.length >= 3, `#${c.id}: a close range both moves share`);
    for (const gap of gaps) {
      for (const lp of [0, 20, 40, 60]) {
        assert.ok(string(c, 'attack1', 'attack2', gap, lp), `#${c.id} from ${gap} at ${lp} Launch Point`);
      }
    }
  }
});

test('Attack 2 into Attack 1 lands up to 30 Launch Point for every fighter, or 15 after a fling (Base Launch 3) meant to end the string', () => {
  let flings = 0;
  for (const c of playableCharacters()) {
    const probe = playerRig({ character: c, gap: 900 }).player;
    const fling = endsInFling(probe.attacks[probe.attackFor('attack2')]);
    if (fling) flings++;
    const levels = fling ? [0, 15] : [0, 15, 30];
    for (const gap of spacings(c)) {
      for (const lp of levels) {
        assert.ok(string(c, 'attack2', 'attack1', gap, lp), `#${c.id} from ${gap} at ${lp} Launch Point`);
      }
    }
  }
  assert.ok(flings < playableCharacters().length, 'the exception stays an exception');
});

test('Combat Assist only ever helps a string: whatever lands without it lands with it', () => {
  for (const c of playableCharacters()) {
    const gaps = spacings(c);
    for (const [first, second] of [['attack1', 'attack2'], ['attack2', 'attack1']]) {
      for (const gap of [gaps[0], gaps[gaps.length >> 1], gaps.at(-1)]) {
        for (const lp of [0, 20, 40, 60, 80]) {
          if (string(c, first, second, gap, lp, false)) {
            assert.ok(string(c, first, second, gap, lp, true), `#${c.id} ${first} into ${second} from ${gap} at ${lp}`);
          }
        }
      }
    }
  }
});
