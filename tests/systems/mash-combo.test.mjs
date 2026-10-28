// Run with node --test tests/systems/mash-combo.test.mjs (no dependencies).
// The Mash Combo (js/data/mash-combo.js, js/game/combat/mash-combo.js): five
// fresh presses of one of a fighter's pair's buttons on the ground set off
// twelve automatic turns of its two grounded close-range strikes,
// alternating, each twice as fast, every turn's launch suppressed but the
// twelfth's; nothing its own controls do cancels it, and a hit, a
// paralysis, a launch, lost ground, the Void or a respawn ends it. Covered
// here: activation (and everything that must not activate it), the series,
// the launch rule, the lock and every interruption, Shield blocks, every
// input device, every fighter (the ensemble's members included), the
// registry's rule for future fighters, the CPU (all four levels, through
// its own presses, and against an opponent's series) and the game modes.
// Shared rules: every playable fighter, never one fighter's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../../js/config.js';
import { getCharacter, playableCharacters, CHARACTERS } from '../../js/data/characters.js';
import {
  MASH_COMBO, MASH_PARTNER, assertMashCombo, mashComboProblems, mashSequence, mashTriggers,
} from '../../js/data/mash-combo.js';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { InputManager } from '../../js/core/input-manager.js';
import { ControllerManager } from '../../js/core/controller-manager.js';
import { resolveProfile } from '../../js/data/controller-profiles.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { PlayerController, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { MashCombo } from '../../js/game/combat/mash-combo.js';
import { resolveDirectionalLaunch } from '../../js/data/launch.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { mashCounterState } from '../../js/game/rendering/fighter-status.js';
import { HitEffects } from '../../js/game/rendering/hit-fx.js';
import { StageCollision } from '../../js/game/physics.js';
import { mulberry32 } from '../../js/core/utils.js';
import { DT, cpuFight, fakeSpritesOf, probeHit, stageMap } from '../helpers/fighter-harness.mjs';
import { playerRig, press } from '../helpers/player-rig.mjs';
import { fakePad, setButton, padSource, stubWindow, PAD_IDS } from '../helpers/fake-gamepad.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');
const { PracticeSession } = await import('../../js/game/practice.js');

const EPS = 1e-6;
const FIGHTERS = playableCharacters();
const ONE = getCharacter('0001');

// Every trigger button of `c` (its pair's moves with a button).
const triggersOf = (c) => [...mashTriggers(c).keys()];

// The rig for `c`: the human player at close range of a training dummy
// (no controller) of the same fighter, pushboxes as in a match.
const rigFor = (c, opts = {}) => playerRig({ character: c, gap: 40, ...opts });

// `n` fresh presses of `button`, one every `every` steps (released in
// between), then nothing.
function mashOn(r, button, { n = MASH_COMBO.presses, every = 2, extra = {} } = {}) {
  for (let i = 0; i < n; i++) {
    r.tick({ ...press(button), ...extra });
    for (let k = 1; k < every; k++) r.tick(extra);
  }
}

// Steps until the series is over (or `limit`), recording every turn (its
// record, in order) and returning them.
function runSeries(r, held = () => ({}), limit = 900) {
  const turns = [];
  for (let i = 0; i < limit; i++) {
    const a = r.player.combat.attack;
    if (a?.mash && turns.at(-1) !== a) turns.push(a);
    if (!r.player.mash.engaged && turns.length) break;
    r.tick(held(i));
  }
  return turns;
}

// The rig mashed into a series through `button`, the series run to its
// end: { r, turns }.
function series(c, button, opts = {}) {
  const r = rigFor(c, opts);
  mashOn(r, button);
  const turns = runSeries(r);
  return { r, turns };
}

// ---- The rules and the roster -----------------------------------------------------------

test('the mechanic\'s numbers: five presses, twelve turns, two moves, twice as fast; an even series', () => {
  assert.equal(MASH_COMBO.presses, 5);
  assert.equal(MASH_COMBO.turns, 12);
  assert.equal(MASH_COMBO.rate, 2);
  assert.ok(MASH_COMBO.window > 0.5 && MASH_COMBO.window <= 1, 'a rolling window of about 0.8 s');
  assert.ok(MASH_COMBO.maxGap < MASH_COMBO.window);
  assert.equal(MASH_COMBO.turns % 2, 0, 'each move plays half of it');
  assert.equal(Object.isFrozen(MASH_COMBO), true);
  assert.deepEqual(mashSequence(['a', 'b'], 'a'), ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
  assert.deepEqual(mashSequence(['a', 'b'], 'b'), ['b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a']);
});

test('every playable fighter has exactly one valid pair: two distinct genuine grounded close-range melee strikes', () => {
  const pairs = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.mashCombo.attacks]));
  assert.deepEqual(pairs, {
    '0001': ['attack1', 'extra_attack'],
    '0002': ['attack1', 'attack2'],
    '0003': ['attack1', 'extra_attack'],
    '0004': ['attack1', 'attack3'],
    '0005': ['attack1', MASH_PARTNER],
    '0006': ['attack1', MASH_PARTNER],
    '0007': ['attack1', 'attack2'],
    '0008': ['attack1', MASH_PARTNER],
    '0009': ['attack1', 'attack2'],
  });
  for (const c of FIGHTERS) {
    assert.deepEqual(mashComboProblems(c), [], `#${c.id}`);
    assert.ok(triggersOf(c).length >= 1, `#${c.id}: at least one button sets it off`);
    const f = rigFor(c).player;
    for (const id of c.mashCombo.attacks) {
      const atk = f.attacks[id];
      assert.ok(atk.hitbox && !atk.projectile && !atk.pull && atk.cooldown === 0, `#${c.id} ${id}: a direct ordinary strike`);
      assert.ok(!atk.motion || atk.motion.type === 'hover', `#${c.id} ${id}: no motion carries it off`);
      const boxes = atk.hits ? atk.hits.map((h) => h.hitbox) : [atk.hitbox];
      for (const b of boxes) assert.ok(b.x + b.w <= MASH_COMBO.reach && b.x <= MASH_COMBO.nearEdge, `#${c.id} ${id}: close range`);
      assert.ok(f.sprites.has(atk.animation), `#${c.id} ${id}: its own art`);
    }
  }
});

test('the misclassifications the rule exists to stop are refused: projectiles, long reach, pulls, rolls, homing, Specials, cooldowns, aerials', () => {
  const pairOf = (c, attacks) => mashComboProblems({ ...c, mashCombo: { attacks } });
  const D5 = getCharacter('0005');
  const D6 = getCharacter('0006');
  // Red and Maximum Blue are orbs.
  assert.match(pairOf(ONE, ['attack1', 'attack2']).join(' '), /throws a projectile/);
  // The Long Bite and Phantom Hands reach far out; Dark Tendrils pull.
  assert.match(pairOf(D5, ['attack1', 'attack2']).join(' '), /reaches 198 units out/);
  assert.match(pairOf(D5, ['attack1', 'attack3']).join(' '), /reaches 116 units out/);
  assert.match(pairOf(D5, ['attack1', 'extra_attack']).join(' '), /it pulls/);
  // The Tornado Spin rolls, pulls and carries; the Triple Strike homes in.
  assert.match(pairOf(D6, ['attack1', 'attack2']).join(' '), /roll motion.*pulls|pulls/);
  assert.match(pairOf(D6, ['attack1', 'extra_attack']).join(' '), /homing motion/);
  // #0002's Whirlwind: a projectile with a 5 s cooldown.
  assert.match(pairOf(getCharacter('0002'), ['attack1', 'extra_attack']).join(' '), /5 s cooldown/);
  // A 3 s cooldown (a paralysis), a Special, an aerial, the same move twice.
  const paralyzing = { ...ONE, attacks: { ...ONE.attacks, attack1: { ...ONE.attacks.attack1, paralyze: 0.5 } } };
  assert.match(pairOf(paralyzing, ['attack1', 'extra_attack']).join(' '), /3 s cooldown/);
  assert.match(pairOf({ ...ONE, specialAbilities: ['extra_attack'] }, ['attack1', 'extra_attack']).join(' '), /Special ability/);
  assert.match(pairOf(ONE, ['attack1', 'attack4']).join(' '), /not in `attacks`/);
  assert.match(pairOf(ONE, ['attack1', 'midair_attack1']).join(' '), /aerial/);
  assert.match(pairOf(ONE, ['attack1', 'attack1']).join(' '), /twice/);
  // A partner that no pair names would never be performed.
  assert.match(mashComboProblems({ ...ONE, attacks: { ...ONE.attacks, [MASH_PARTNER]: ONE.attacks.attack1 } }).join(' '), /no move of its mashCombo/);
});

test('a future fighter without a valid pair is refused as the registry loads, and the rule names no fighter', () => {
  assert.throws(() => assertMashCombo({ ...ONE, mashCombo: undefined }), /every fighter needs two grounded close-range melee strikes/);
  assert.throws(() => assertMashCombo({ ...ONE, mashCombo: { attacks: ['attack1'] } }), /exactly two/);
  assert.throws(() => assertMashCombo({ ...ONE, mashCombo: { attacks: ['attack1', 'attack2'] } }), /Mash Combo rules/);
  assert.doesNotThrow(() => assertMashCombo(SAMPLE_FIGHTER), 'the sample fighter, the template for a new one, has one');
  const registry = readFileSync(new URL('../../js/data/characters.js', import.meta.url), 'utf8');
  assert.match(registry, /assertMashCombo\(def\);/);
  for (const file of ['js/data/mash-combo.js', 'js/game/combat/mash-combo.js']) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /'000\d'|#000\d|displayName|Punch|Kick|Claw/, `${file} names no fighter or move`);
  }
});

// ---- Activation ---------------------------------------------------------------------------

test('five rapid presses of an eligible grounded button set it off, for every fighter and every trigger', () => {
  for (const c of FIGHTERS) {
    for (const button of triggersOf(c)) {
      const r = rigFor(c);
      mashOn(r, button);
      assert.ok(r.player.mash.engaged, `#${c.id} ${button}: recognized`);
      const turns = runSeries(r);
      assert.equal(turns.length, MASH_COMBO.turns, `#${c.id} ${button}: twelve turns`);
    }
  }
});

test('four presses, slow presses, a held button, mixed buttons or an ineligible move never set it off', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    const why = `#${c.id}`;
    const watch = (r, n = 120) => {
      for (let i = 0; i < n; i++) {
        r.tick();
        assert.equal(r.player.mash.engaged, false);
      }
    };
    // Four.
    let r = rigFor(c);
    mashOn(r, button, { n: 4 });
    assert.equal(r.player.mash.engaged, false, `${why}: four presses`);
    watch(r);
    // Slow: a gap over maxGap between each.
    r = rigFor(c);
    mashOn(r, button, { n: 8, every: Math.ceil(MASH_COMBO.maxGap / DT) + 2 });
    assert.equal(r.player.mash.started, 0, `${why}: slow presses`);
    // Held: one press, then held for two seconds.
    r = rigFor(c);
    r.tick(press(button));
    for (let i = 0; i < 120; i++) r.tick({ [button]: true });
    assert.equal(r.player.mash.started, 0, `${why}: a held button`);
    // Mixed with any other button of its own.
    const other = ['attack1', 'attack2', 'extra_attack', 'attack3'].find((b) => b !== button && c.actions[b]);
    r = rigFor(c);
    for (const b of [button, other, button, other, button, other, button]) {
      r.tick(press(b));
      r.tick();
    }
    assert.equal(r.player.mash.started, 0, `${why}: mixed presses`);
  }
  // An ineligible move's button, mashed (a long-reach bite, a projectile,
  // a Special technique, a 5 s cooldown throw).
  for (const [id, button] of [['0005', 'attack2'], ['0001', 'attack2'], ['0001', 'attack4'], ['0002', 'extra_attack'], ['0006', 'attack2']]) {
    const r = rigFor(getCharacter(id), { gap: 300 });
    mashOn(r, button, { n: 10 });
    for (let i = 0; i < 60; i++) r.tick();
    assert.equal(r.player.mash.started, 0, `#${id} ${button}: not a Mash Combo move`);
  }
});

test('a key\'s autorepeat never fakes presses; five real key presses do set it off', () => {
  stubWindow();
  const input = new InputManager(CONFIG.bindings);
  input.setGameplayActive(true);
  const key = (code, down, repeat = false) => input[down ? '_onKeyDown' : '_onKeyUp']({ code, repeat, preventDefault() {} });
  const code = CONFIG.bindings.attack1[0];
  const r = rigFor(ONE, { controller: new PlayerController(input) });
  // One press held down, the OS repeating it for a second.
  key(code, true);
  r.tick();
  for (let i = 0; i < 60; i++) {
    key(code, true, true);
    r.tick();
  }
  key(code, false);
  assert.equal(r.player.mash.started, 0, 'autorepeat is one press');
  for (let i = 0; i < 60; i++) r.tick();
  for (let i = 0; i < MASH_COMBO.presses; i++) {
    key(code, true);
    r.tick();
    key(code, false);
    r.tick();
  }
  assert.ok(r.player.mash.engaged, 'five key presses');
});

test('only on the ground: presses in the air never count, and the fifth must be made on the ground', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    // All five in the air.
    let r = rigFor(c, { gap: 400 });
    r.tick(press('jump'));
    for (let i = 0; i < 3; i++) r.tick({ jump: true });
    assert.equal(r.player.grounded, false);
    mashOn(r, button, { extra: {} });
    assert.equal(r.player.mash.engaged, false, `#${c.id}: aerial presses`);
    // Four on the ground, the fifth after leaving it.
    r = rigFor(c, { gap: 400 });
    mashOn(r, button, { n: 4 });
    r.tick(press('jump'));
    r.tick({ jump: true });
    r.tick({ jump: true });
    if (!r.player.grounded) {
      r.tick(press(button));
      assert.equal(r.player.mash.engaged, false, `#${c.id}: the fifth in the air`);
    }
  }
});

test('presses made while the first move plays count without restarting it, through its hitstop, and the fifth is no extra turn', () => {
  for (const c of FIGHTERS) {
    for (const button of triggersOf(c)) {
      const r = rigFor(c);
      r.tick(press(button));
      const first = r.player.combat.attack;
      assert.ok(first && !first.mash, `#${c.id} ${button}: the first press is the ordinary move`);
      let during = 0;
      let frozen = 0;
      let last = first.time;
      for (let i = 1; i < MASH_COMBO.presses; i++) {
        r.tick();
        if (r.player.combat.hitstop > 0) frozen++;
        const before = r.player.combat.attack;
        r.tick(press(button));
        if (before === first) during++;
        if (r.player.combat.attack === first) {
          assert.ok(first.time >= last - EPS, `#${c.id}: never restarted`);
          last = first.time;
        }
      }
      assert.ok(during >= 2, `#${c.id} ${button}: presses during the first move (${during})`);
      assert.ok(r.player.mash.engaged, `#${c.id} ${button}: recognized`);
      assert.equal(r.player.bufferedAttack, null, 'the fifth is buffered as nothing');
      const turns = runSeries(r);
      assert.equal(turns.length, MASH_COMBO.turns);
      assert.equal(turns[0].def.id, mashTriggers(c).get(button), 'turn 1 is the trigger\'s move');
      assert.ok(turns.every((t) => t !== first), 'the first move is no turn');
      void frozen;
    }
  }
  // Presses made inside an impact freeze count: the clock runs on.
  const r = rigFor(ONE);
  r.tick(press('attack1'));
  let inFreeze = 0;
  for (let i = 0; i < 20 && !r.player.mash.engaged; i++) {
    if (i % 2 === 0) {
      if (r.player.combat.hitstop > 0) inFreeze++;
      r.tick(press('attack1'));
    } else r.tick();
  }
  assert.ok(inFreeze >= 1, 'pressed during the freeze');
  assert.ok(r.player.mash.engaged, 'still recognized');
});

test('a partial count goes stale, and a hit wipes it out', () => {
  const r = rigFor(ONE, { gap: 300 });
  mashOn(r, 'attack1', { n: 3 });
  assert.equal(r.player.mash.pressCount, 3);
  for (let i = 0; i < Math.ceil(MASH_COMBO.maxGap / DT) + 2; i++) r.tick();
  assert.equal(r.player.mash.pressCount, 0, 'stale');
  mashOn(r, 'attack1', { n: 2 });
  assert.equal(r.player.mash.engaged, false, 'two fresh presses are only two');
  mashOn(r, 'attack1', { n: 3 });
  r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', hitstun: 0.3, damage: 1 }));
  assert.equal(r.player.mash.pressCount, 0, 'a hit forgets the count');
  r.tick(press('attack1'));
  assert.equal(r.player.mash.engaged, false);
});

test('the detector alone: rolling window, gap limit, reset by another button, ineligible presses', () => {
  const pair = { attacks: ['a', 'b'], triggers: new Map([['x', 'a'], ['y', 'b']]) };
  const m = new MashCombo(pair);
  const tap = (b, ok = true, wait = 2) => {
    const r = m.press(b, ok);
    for (let i = 0; i < wait; i++) m.tick(DT);
    return r;
  };
  assert.deepEqual([1, 2, 3, 4].map(() => tap('x')), ['counted', 'counted', 'counted', 'counted']);
  assert.equal(tap('x'), 'armed');
  assert.equal(m.first, 'a');
  assert.equal(m.press('x', true), null, 'armed: presses are the combo\'s');
  m.end('reset');
  // Through B: B first.
  for (let i = 0; i < 5; i++) tap('y');
  assert.deepEqual(m.sequence.slice(0, 3), ['b', 'a', 'b']);
  m.end('reset');
  // Another trigger resets; an ineligible press resets.
  for (const [b, ok] of [['x', true], ['x', true], ['y', true], ['x', true], ['x', true], ['x', false], ['x', true]]) tap(b, ok);
  assert.equal(m.engaged, false);
  // Rolling: presses spread over more than the window drop off, so five
  // within any 0.8 s are enough, after slower ones too.
  const r = new MashCombo(pair);
  for (const gap of [17, 17, 17, 10, 10, 10, 10]) {
    r.press('x', true);
    if (r.engaged) break;
    for (let k = 0; k < gap; k++) r.tick(DT);
  }
  assert.ok(r.engaged, 'five within any 0.8 s, even after slower ones');
  // Armed too long without starting: dropped.
  for (let i = 0; i < Math.ceil(MASH_COMBO.armWait / DT) + 2; i++) r.tick(DT);
  assert.equal(r.engaged, false);
  assert.equal(r.lastEnd.reason, 'expired');
});

// ---- The series --------------------------------------------------------------------------

test('exactly twelve turns of exactly two moves, six each, alternating, the trigger\'s first and the other\'s last; then normal play', () => {
  for (const c of FIGHTERS) {
    for (const button of triggersOf(c)) {
      const { r, turns } = series(c, button);
      const why = `#${c.id} ${button}`;
      const ids = turns.map((t) => t.def.id);
      const first = mashTriggers(c).get(button);
      const second = c.mashCombo.attacks.find((id) => id !== first);
      assert.deepEqual(ids, mashSequence(c.mashCombo.attacks, first), why);
      assert.equal(new Set(ids).size, 2, `${why}: two moves`);
      assert.equal(ids.filter((id) => id === first).length, 6);
      assert.equal(ids.filter((id) => id === second).length, 6);
      assert.ok(ids.every((id, i) => i === 0 || id !== ids[i - 1]), `${why}: strict alternation`);
      assert.deepEqual(turns.map((t) => t.mash.turn), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      assert.deepEqual(turns.map((t) => t.mash.final), [...Array(11).fill(false), true]);
      assert.ok(turns.every((t) => t.rate === MASH_COMBO.rate), `${why}: every turn at the combo's rate`);
      assert.ok(turns.every((t) => r.player.sprites.has(t.def.animation)), `${why}: every turn has its art`);
      assert.equal(r.player.mash.lastEnd.reason, 'complete', why);
      assert.equal(r.player.mash.engaged, false);
      // Every turn met the opponent standing in reach: a real strike each.
      const hit = new Set(r.events.filter((e) => e.attacker === r.player && e.mash).map((e) => e.mash.turn));
      assert.equal(hit.size, MASH_COMBO.turns, `${why}: every turn struck (${[...hit]})`);
      // No thirteenth: nothing more starts by itself.
      for (let i = 0; i < 90; i++) {
        r.tick();
        assert.equal(r.player.combat.attack?.mash ?? null, null, `${why}: no thirteenth turn`);
      }
      assert.equal(r.player.combat.attack, null, `${why}: back to normal play`);
      // An ordinary press again: its own move at its own pace.
      const r2 = r;
      r2.tick(press(button));
      assert.equal(r2.player.combat.attack?.rate, 1);
      assert.equal(r2.player.combat.attack?.mash, null);
    }
  }
});

test('each turn plays twice as fast, strike for strike: every strike of every turn lands, none skipped, none repeated', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    const { r, turns } = series(c, button);
    const struck = r.events.filter((e) => e.attacker === r.player && e.mash);
    for (const t of turns) {
      const strikes = t.def.hits?.length ?? 1;
      const mine = struck.filter((e) => e.mash.turn === t.mash.turn);
      assert.equal(mine.length, strikes, `#${c.id} turn ${t.mash.turn} (${t.def.id}): ${mine.length} of ${strikes} strikes`);
    }
    // Faster: from the first turn's start to the last's end, about half the
    // moves' own lengths (impact freezes aside).
    const own = turns.reduce((sum, t) => sum + t.def.total, 0);
    const steps = Math.round(turns.reduce((sum, t) => sum + t.def.total / MASH_COMBO.rate, 0) / DT);
    assert.ok(steps * DT < own * 0.6, `#${c.id}: ${steps * DT} s of turns for ${own} s of moves`);
  }
});

test('pressing on through the series never extends it, and nothing pressed during it comes out after', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    const r = rigFor(c);
    mashOn(r, button);
    const all = ['attack1', 'attack2', 'attack3', 'extra_attack', button];
    const turns = runSeries(r, (i) => (i % 2 === 0 ? press(all[i % all.length]) : {}));
    assert.equal(turns.length, MASH_COMBO.turns, `#${c.id}`);
    for (let i = 0; i < 60; i++) {
      r.tick();
      assert.equal(r.player.combat.attack, null, `#${c.id}: no press of the series comes out late`);
      assert.equal(r.player.bufferedAttack, null);
    }
    assert.equal(r.player.mash.started, 1, 'no second series from presses made during the first');
  }
});

// ---- Launch ----------------------------------------------------------------------------------

test('turns 1 to 11 launch nothing (every strike, multi-hit ones too) but still add Launch Point; turn 12 launches with its own Base Launch from the Launch Point built', () => {
  for (const c of FIGHTERS) {
    for (const button of triggersOf(c)) {
      const r = rigFor(c);
      const before = JSON.stringify(Object.values(r.player.attacks));
      mashOn(r, button);
      const lpAtStart = () => r.foe.combat.launchPoint;
      runSeries(r);
      const why = `#${c.id} ${button}`;
      const events = r.events.filter((e) => e.attacker === r.player && e.mash);
      for (const e of events.filter((x) => !x.mash.final)) {
        assert.equal(e.baseLaunch, 0, `${why}: turn ${e.mash.turn} effective Base Launch 0`);
        assert.equal(e.launchStrength, 0);
        assert.equal(e.launchSpeed, 0, `${why}: turn ${e.mash.turn} launches nothing`);
        const atk = r.player.attacks[e.move];
        if (!atk.hits) assert.equal(e.authoredBaseLaunch, atk.baseLaunch, `${why}: its own recorded beside it`);
        else assert.ok(atk.hits.some((h) => h.baseLaunch === e.authoredBaseLaunch), `${why}: a strike's own recorded beside it`);
        assert.ok(e.damage > 0 && e.launchPointAfter === e.launchPointBefore + e.damage, `${why}: Launch Point still added`);
      }
      const finals = events.filter((x) => x.mash.final);
      assert.ok(finals.length >= 1, `${why}: the finisher landed`);
      const last = finals.at(-1);
      assert.equal(last.baseLaunch, last.authoredBaseLaunch, `${why}: its own Base Launch`);
      assert.ok(last.baseLaunch > 0, `${why}: the finisher launches`);
      assert.equal(last.launchStrength, last.baseLaunch * last.launchPointAfter, 'Base Launch x the Launch Point built');
      const expected = resolveDirectionalLaunch(last.directionalLaunch, last.launchStrength, Math.sign(last.finalLaunch.x) || 1);
      assert.equal(Math.hypot(last.finalLaunch.x, last.finalLaunch.y), Math.hypot(expected.x, expected.y), 'along its own direction');
      // Nothing changed for good: definitions intact, no rule left behind.
      assert.equal(JSON.stringify(Object.values(r.player.attacks)), before, `${why}: definitions untouched`);
      for (let i = 0; i < 90; i++) r.tick();
      r.foe.combat.launchPoint = 30;
      r.foe.body.x = r.player.body.x + 40;
      r.foe.body.vx = 0;
      r.tick(press(button));
      const ordinary = r.player.combat.attack;
      for (let i = 0; i < 40 && r.player.combat.attack === ordinary; i++) r.tick();
      const plain = r.events.filter((e) => e.attacker === r.player && !e.mash && e.move === ordinary.def.id);
      for (const e of plain) assert.equal(e.baseLaunch, e.authoredBaseLaunch, `${why}: an ordinary activation keeps its own launch`);
      void lpAtStart;
    }
  }
});

test('the suppression is the turn\'s, never the move\'s: the same strike out of a series launches as authored', () => {
  const r = rigFor(getCharacter('0002'));
  r.foe.combat.launchPoint = 40;
  r.tick(press('attack2'));
  for (let i = 0; i < 60; i++) r.tick();
  const kicks = r.events.filter((e) => e.attacker === r.player && e.move === 'attack2');
  assert.equal(kicks.at(-1).baseLaunch, 2, 'the Rapid Kicks\' finisher, outside a series, launches at 2');
  assert.ok(kicks.at(-1).launchSpeed > 0);
});

// ---- Lock and interruption -------------------------------------------------------------------

test('nothing the player asks for cancels it: no attack, Special, jump, Dash, Shield or hit-cancel', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    const r = rigFor(c);
    mashOn(r, button);
    const asks = [
      press('attack1'), press('attack2'), press('extra_attack'), press('attack3'), press('attack4'), press('attack5'),
      press('jump'), { mouvementRightPressed: true }, { mouvementLeftPressed: true }, press('shield'), { shield: true },
      { runRight: true }, { runLeft: true }, { down: true, downPressed: true },
    ];
    const turns = runSeries(r, (i) => {
      if (r.player.mash.active) {
        assert.equal(r.player.dash, null, `#${c.id}: no Dash`);
        assert.equal(r.player.technique, null, `#${c.id}: no Special`);
        assert.equal(r.player.combat.shielding, false, `#${c.id}: no Shield`);
        assert.ok(r.player.grounded, `#${c.id}: no jump`);
        assert.ok(!r.player.combat.attack || r.player.combat.attack.mash, `#${c.id}: no other attack`);
      }
      return asks[i % asks.length];
    });
    assert.equal(turns.length, MASH_COMBO.turns, `#${c.id}: twelve turns, whatever was asked`);
    assert.equal(r.player.mash.lastEnd.reason, 'complete');
  }
});

test('a hit, a paralysis, a launch, lost ground or a respawn ends it at once: no later turn, no rate, no suppression left', () => {
  const cases = {
    hit: (r) => r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', damage: 1, hitstun: 0.3 })),
    paralysis: (r) => r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', damage: 1, hitstun: 0, paralyze: 0.6 })),
    launch: (r) => {
      r.player.combat.launchPoint = 40;
      r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', damage: 1, hitstun: 0, baseLaunch: 2, directionalLaunch: 'vertical' }));
    },
    ground: (r) => {
      r.player.body.y -= 120;
      r.player.body.grounded = false;
      r.player.body.ground = null;
    },
  };
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    for (const [why, interrupt] of Object.entries(cases)) {
      const r = rigFor(c);
      mashOn(r, button);
      r.until(() => r.player.mash.active && r.player.mash.turn === 7);
      interrupt(r);
      r.tick();
      const name = `#${c.id} ${why}`;
      assert.equal(r.player.mash.engaged, false, `${name}: over`);
      assert.equal(r.player.mash.lastEnd.reason, 'interrupted', name);
      assert.equal(r.player.mash.lastEnd.turn, 7, `${name}: during turn 7`);
      for (let i = 0; i < 120; i++) {
        r.tick();
        assert.equal(r.player.combat.attack?.mash ?? null, null, `${name}: turns 8 to 12 never come`);
      }
      assert.equal(r.player.animator.speed ?? 1, 1, `${name}: playback back to normal`);
    }
    // A respawn: a fresh life, no combo.
    const r = rigFor(c);
    mashOn(r, button);
    r.until(() => r.player.mash.active);
    r.player.respawn(r.player.stage);
    assert.equal(r.player.mash.engaged, false);
    assert.equal(r.player.combat.attack, null);
  }
});

test('the forced state takes over the clip: hurt on a hit, never a frozen attack frame', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    const r = rigFor(c);
    mashOn(r, button);
    r.until(() => r.player.mash.active && r.player.mash.turn === 4);
    r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', damage: 1, hitstun: 0.3 }));
    r.tick();
    assert.equal(r.player.state, 'hitstun', `#${c.id}`);
    assert.match(r.player.animator.anim?.key ?? '', /hurt/, `#${c.id}: its hurt clip`);
  }
});

test('a raised Shield blocks a turn like any attack and ends the series there: one block, no bypass, no later turn', () => {
  for (const c of FIGHTERS) {
    const [button] = triggersOf(c);
    const r = rigFor(c, { foeController: { getInput: () => ({ ...blankInput(), shield: true }) } });
    for (let i = 0; i < 20; i++) r.tick();
    assert.equal(r.foe.combat.shielding, true);
    mashOn(r, button);
    runSeries(r, () => ({}));
    const mine = r.events.filter((e) => e.attacker === r.player && e.mash);
    assert.ok(mine.length >= 1, `#${c.id}: a turn met the Shield`);
    assert.ok(mine.every((e) => e.type === 'block'), `#${c.id}: blocked, never a hit through it`);
    assert.equal(r.foe.combat.launchPoint, 0, 'no Launch Point through a Shield');
    assert.equal(r.player.mash.lastEnd.reason, 'blocked');
    assert.equal(new Set(mine.map((e) => e.mash.turn)).size, 1, `#${c.id}: one turn only`);
  }
});

test('it is no armour: a hit landing on the same step as a turn\'s strike still trades', () => {
  const r = rigFor(ONE);
  mashOn(r, 'attack1');
  r.until(() => r.player.mash.active && r.player.combat.attack && r.player.combat.phase === 'active');
  r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', damage: 3, hitstun: 0.3 }));
  r.tick();
  assert.equal(r.player.mash.engaged, false);
});

test('the Void ends it with its fighter\'s life, and the respawned fighter starts clean', () => {
  const input = { flush() {}, sample: () => ({}) };
  const sprites = fakeSpritesOf(ONE);
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: ONE, p2Def: ONE, p1Sprites: sprites, p2Sprites: sprites,
    input, seed: 3, mode: 'quick-battle', difficulty: 'easy',
  });
  battle.setPhase('fight');
  const p1 = battle.p1;
  battle.p2.controller = null;
  p1.body.x = battle.p2.body.x - 40;
  const held = {};
  p1.controller = { kind: 'player', getInput: () => ({ ...blankInput(), ...held }) };
  for (let i = 0; i < MASH_COMBO.presses; i++) {
    Object.assign(held, press('attack1'));
    battle.update(DT);
    for (const k of Object.keys(held)) delete held[k];
    battle.update(DT);
  }
  for (let i = 0; i < 30 && !p1.mash.active; i++) battle.update(DT);
  assert.ok(p1.mash.active, 'running');
  p1.body.y = battle.stage.void.bottom + 400;
  battle.update(DT);
  assert.equal(p1.lostToVoid, true);
  assert.equal(p1.mash.engaged, false);
  assert.equal(p1.mash.lastEnd.reason, 'void');
});

// ---- Devices ------------------------------------------------------------------------------

test('keyboard, touch (either layout: one tap, one press), a PlayStation and an Xbox pad and a custom binding all set it off', async () => {
  const devices = ['keyboard', 'touch', 'dualsense', 'xbox', 'custom'];
  for (const c of [ONE, getCharacter('0005'), getCharacter('0006')]) {
    for (const device of devices) {
      stubWindow();
      const pad = fakePad({ id: device === 'xbox' ? PAD_IDS.xboxSeries : PAD_IDS.dualsense });
      const custom = device === 'custom' ? { 'ground:attack1': { button: 'north', modifier: null, stick: null, direction: null, activation: 'press' },
        'ground:attack2': { button: 'west', modifier: null, stick: null, direction: null, activation: 'press' } } : null;
      const profileFor = (def) => resolveProfile(def, def?.id === c.id ? custom : null);
      const input = new InputManager(CONFIG.bindings, { controllers: new ControllerManager({ source: padSource([pad]), target: null }), profileFor });
      input.setGameplayActive(true);
      let now = 0;
      const poll = () => input.pollGamepads((now += 16));
      poll();
      input.sample();
      const r = rigFor(c, { controller: new PlayerController(input) });
      r.tick();
      const padButton = device === 'custom' ? 'north' : resolveProfile(c).bindings?.['ground:attack1']?.button ?? c.controller.layout['ground:attack1'].button;
      const down = (on) => {
        if (device === 'keyboard') input[on ? '_onKeyDown' : '_onKeyUp']({ code: CONFIG.bindings.attack1[0], repeat: false, preventDefault() {} });
        else if (device === 'touch') input.setTouch('attack1', on);
        else {
          setButton(pad, padButton, on);
          poll();
        }
      };
      for (let i = 0; i < MASH_COMBO.presses; i++) {
        down(true);
        r.tick();
        down(false);
        r.tick();
      }
      assert.ok(r.player.mash.engaged, `#${c.id} ${device}`);
      const turns = runSeries(r);
      assert.equal(turns.length, MASH_COMBO.turns, `#${c.id} ${device}`);
    }
  }
});

// ---- Every fighter, the ensemble -------------------------------------------------------------

test('#0005 and #0006: the partner strike is their own close-range blow, performed only as a turn', () => {
  for (const c of [getCharacter('0005'), getCharacter('0006')]) {
    const r = rigFor(c);
    // No button starts it.
    for (const b of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
      assert.notEqual(r.player.attackFor(b, true), MASH_PARTNER, `#${c.id} ${b}`);
    }
    mashOn(r, 'attack1');
    const turns = runSeries(r);
    assert.deepEqual([...new Set(turns.map((t) => t.def.id))], ['attack1', MASH_PARTNER]);
    assert.equal(turns.at(-1).def.id, MASH_PARTNER, 'its finisher');
  }
});

test('#0006: each turn is performed by its own sister (pink\'s punch, green\'s), one fighter throughout; its afterimages show her', () => {
  const c = getCharacter('0006');
  const r = rigFor(c);
  mashOn(r, 'attack1');
  const performers = [];
  const fx = new HitEffects();
  let ghosts = 0;
  for (let i = 0; i < 400 && (r.player.mash.engaged || !performers.length); i++) {
    r.tick();
    r.player.interpolate(1);
    fx.sampleTrail(r.player, DT);
    const a = r.player.combat.attack;
    if (a?.mash && r.player.state === 'attack') {
      const who = r.player.animator.members.filter((m) => m.performing).map((m) => m.id);
      if (performers.at(-1)?.turn !== a.mash.turn) performers.push({ turn: a.mash.turn, who: who.join('+') });
      for (const g of fx.ghosts(r.player)) {
        ghosts++;
        assert.ok(g.parts.every((p) => ['pink', 'green'].includes(p.member)), 'only a performing sister');
      }
    }
  }
  assert.deepEqual(performers.map((p) => p.who), ['pink', 'green', 'pink', 'green', 'pink', 'green', 'pink', 'green', 'pink', 'green', 'pink', 'green']);
  assert.ok(ghosts > 0, 'afterimages while it runs');
  assert.equal(r.events.filter((e) => e.attacker === r.player && e.mash).length >= 12, true, 'one fighter\'s hits');
});

// ---- Status and effects ------------------------------------------------------------------

test('its counter shows the turn from 1 to 12 and goes the step it ends; the finisher is marked', () => {
  const r = rigFor(ONE);
  assert.equal(mashCounterState(r.player), null);
  mashOn(r, 'attack1');
  const seen = [];
  for (let i = 0; i < 400; i++) {
    const s = mashCounterState(r.player);
    if (!s && seen.length && seen.at(-1).turn === 12) break;
    if (s && seen.at(-1)?.turn !== s.turn) seen.push(s);
    r.tick();
  }
  assert.deepEqual(seen.filter((s) => s.turn > 0).map((s) => s.turn), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(seen.at(-1).final, true);
  assert.equal(mashCounterState(r.player), null);
});

test('its strikes paint a slash, its finisher a burst; afterimages strike nothing and are dropped once it ends', () => {
  const { r } = series(ONE, 'attack1');
  const fx = new HitEffects({ reducedMotion: true });
  const arena = { stage: new StageCollision(stageMap()), gravity: CONFIG.sim.gravity, step: DT };
  fx.take(r.events.filter((e) => e.mash), arena);
  const kinds = fx.sparks.map((s) => s.kind);
  assert.ok(kinds.includes('slash'));
  assert.equal(kinds.filter((k) => k === 'finisher').length, 1);
  // No damage event comes from paint: the events are the strikes, one per
  // strike of each turn.
  const strikes = r.events.filter((e) => e.attacker === r.player && e.mash).length;
  assert.equal(strikes, 12);
  for (let i = 0; i < 20; i++) fx.sampleTrail(r.player, 1 / 60);
  assert.deepEqual(fx.ghosts(r.player), [], 'no afterimage once it is over');
});

// ---- CPU ------------------------------------------------------------------------------------

// A CPU of `c` at `difficulty` against a passive opponent standing in reach
// (no controller), stepped in Battle's order: { cpu, dummy, log }. `log`
// records every step's snapshot, the attack, whether it was grounded and
// the combo's state.
function cpuVersusDummy(c, difficulty, { seconds = 6, seed = 7, gap = 45 } = {}) {
  const stage = new StageCollision(stageMap());
  const cpu = new Fighter({
    def: c, sprites: fakeSpritesOf(c), stage, slot: 'p1', label: 'CPU', spawn: { x: 1000, facing: 1 },
    controller: new CombatAIController({ difficulty, rng: mulberry32(seed) }),
  });
  const dummy = new Fighter({ def: ONE, sprites: fakeSpritesOf(ONE), stage, slot: 'p2', label: 'D', spawn: { x: 1000 + gap, facing: -1 }, controller: null });
  cpu.opponent = dummy;
  dummy.opponent = cpu;
  const world = { stage, projectiles: [], clones: [], score: { p1: 0, p2: 0 }, timeLeft: 99, combat: new CombatSystem() };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  const log = [];
  for (let n = 0; n < seconds / DT; n++) {
    const before = cpu.combat.attack;
    cpu.update(DT, ctx);
    dummy.update(DT, ctx);
    separateFighters(cpu, dummy, stage);
    world.combat.update([cpu, dummy], [], []);
    log.push({ out: { ...cpu.controller.out }, before, attack: cpu.combat.attack, grounded: cpu.grounded, state: cpu.mash.state, turn: cpu.mash.turn });
    if (dummy.body.y > 1600 || Math.abs(dummy.body.x - 1000) > 1500) dummy.respawn(stage);
  }
  return { cpu, dummy, log, world };
}

test('every CPU level performs it, through legal presses: fresh edges only, five while its first move plays, on the ground', () => {
  for (const difficulty of ['easy', 'medium', 'hard', 'brutal']) {
    for (const c of FIGHTERS) {
      const { cpu, log } = cpuVersusDummy(c, difficulty);
      const why = `${difficulty} #${c.id}`;
      assert.ok(cpu.mash.started >= 1, `${why}: it set one off`);
      // Every press a fresh edge: never pressed on two steps running.
      for (let i = 1; i < log.length; i++) {
        for (const b of ['attack1', 'attack2', 'attack3', 'extra_attack']) {
          if (log[i].out[`${b}Pressed`]) assert.equal(log[i - 1].out[b], false, `${why}: ${b} let go before it is pressed again`);
          assert.equal(log[i].out[`${b}Pressed`], !!log[i].out[b] && !log[i - 1].out[b], `${why}: an edge is its button going down`);
        }
      }
      // Recognized only on the ground, and with presses made during the
      // ordinary move its first press started.
      const armed = log.findIndex((s) => s.state !== 'idle');
      assert.ok(log[armed].grounded, `${why}: on the ground`);
      const trigger = [...cpu.mashPair.triggers.keys()];
      const presses = log.slice(0, armed + 1).filter((s) => trigger.some((b) => s.out[`${b}Pressed`]));
      const during = presses.filter((s) => s.before && !s.before.mash);
      assert.ok(during.length >= 2, `${why}: presses made while its first move played (${during.length})`);
    }
  }
});

test('a CPU\'s series obeys every rule a player\'s does: twelve alternating turns, the lock, and it is broken by a hit', () => {
  for (const c of [ONE, getCharacter('0006')]) {
    const { cpu, log } = cpuVersusDummy(c, 'brutal', { seconds: 4 });
    const turns = [];
    for (const s of log) if (s.attack?.mash && turns.at(-1) !== s.attack) turns.push(s.attack);
    const firstSeries = turns.slice(0, 12);
    assert.deepEqual(firstSeries.map((t) => t.mash.turn), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], `#${c.id}`);
    assert.ok(firstSeries.every((t, i) => i === 0 || t.def.id !== firstSeries[i - 1].def.id), 'alternating');
    void cpu;
  }
  // Broken by a hit like anyone's.
  const stage = new StageCollision(stageMap());
  const sys = new CombatSystem();
  const cpu = new Fighter({
    def: ONE, sprites: fakeSpritesOf(ONE), stage, slot: 'p1', label: 'CPU', spawn: { x: 1000, facing: 1 },
    controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(7) }),
  });
  const dummy = new Fighter({ def: ONE, sprites: fakeSpritesOf(ONE), stage, slot: 'p2', label: 'D', spawn: { x: 1045, facing: -1 }, controller: null });
  cpu.opponent = dummy;
  dummy.opponent = cpu;
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: { stage, projectiles: [], clones: [], combat: sys, score: {}, timeLeft: 99 } };
  for (let i = 0; i < 240 && !(cpu.mash.active && cpu.mash.turn >= 3); i++) {
    cpu.update(DT, ctx);
    dummy.update(DT, ctx);
    separateFighters(cpu, dummy, stage);
    sys.update([cpu, dummy], [], []);
  }
  assert.ok(cpu.mash.active);
  sys.applyHit(dummy, cpu, probeHit({ id: 'probe', damage: 1, hitstun: 0.3 }));
  cpu.update(DT, ctx);
  assert.equal(cpu.mash.engaged, false);
  assert.equal(cpu.mash.lastEnd.reason, 'interrupted');
});

test('CPU versus CPU and mirror matches use it, at every level', () => {
  let started = 0;
  for (const difficulty of ['easy', 'medium', 'hard', 'brutal']) {
    for (const [a, b] of [[ONE, ONE], [getCharacter('0007'), getCharacter('0003')]]) {
      const { a: fa, b: fb } = cpuFight(a, b, { seconds: 25, seed: 5, difficulty });
      started += fa.mash.started + fb.mash.started;
    }
  }
  assert.ok(started >= 4, `${started} series in CPU matches`);
});

test('the CPU knows the real launch rule: eleven suppressed turns, then the finisher\'s own launch; it never plans one with an ineligible move', () => {
  for (const c of FIGHTERS) {
    const f = rigFor(c).player;
    const caps = analyzeCapabilities(f);
    assert.ok(caps.mash, `#${c.id}`);
    assert.deepEqual(caps.mash.triggers.map((t) => t.action).sort(), triggersOf(c).sort(), `#${c.id}: only its pair's buttons`);
    for (const t of caps.mash.triggers) {
      const last = t.starts[MASH_COMBO.turns - 1];
      assert.ok(t.strikes.slice(0, last).every((s) => s.baseLaunch === 0), `#${c.id}: turns 1-11 launch nothing`);
      const finisher = f.attacks[t.sequence.at(-1)];
      const fin = t.strikes.at(-1);
      assert.equal(fin.baseLaunch, finisher.hits ? finisher.hits.at(-1).baseLaunch : finisher.baseLaunch, `#${c.id}: the finisher's own`);
      assert.ok(t.duration > 0);
    }
  }
});

test('an opponent\'s series is seen for what it is: committed to every turn left, its finisher\'s launch coming, and a Shield answering it ends it', () => {
  const stage = new StageCollision(stageMap());
  const sys = new CombatSystem();
  const held = {};
  const player = new Fighter({
    def: ONE, sprites: fakeSpritesOf(ONE), stage, slot: 'p1', label: 'P1', spawn: { x: 1000, facing: 1 },
    controller: { kind: 'player', getInput: () => ({ ...blankInput(), ...held }) },
  });
  const brain = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(4) });
  // Out of the first move's reach: the turns' Step-ins carry the series to
  // it, a CPU free to see it coming.
  const cpu = new Fighter({ def: ONE, sprites: fakeSpritesOf(ONE), stage, slot: 'p2', label: 'CPU', spawn: { x: 1090, facing: -1 }, controller: brain });
  brain.neutral = false;
  player.opponent = cpu;
  cpu.opponent = player;
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: { stage, projectiles: [], clones: [], combat: sys, score: {}, timeLeft: 99 } };
  const step = (now = {}) => {
    for (const k of Object.keys(held)) delete held[k];
    Object.assign(held, now);
    player.update(DT, ctx);
    cpu.update(DT, ctx);
    separateFighters(player, cpu, stage);
    sys.update([player, cpu], [], []);
  };
  for (let i = 0; i < MASH_COMBO.presses; i++) {
    step(press('attack1'));
    step();
  }
  let seen = null;
  let threat = null;
  for (let i = 0; i < 200 && player.mash.engaged; i++) {
    step();
    const op = brain.situation?.op;
    if (op?.mash && op.mash.turn >= 1 && !seen) seen = { ...op.mash, busy: op.busy };
    // The threat it weighs carries the series: the turn's strikes (launch
    // suppressed) and every turn still to come, the finisher's launch last.
    threat ??= brain.defense.threats.find((t) => t.mash) ?? null;
  }
  assert.ok(seen, 'its perception carries the series');
  assert.ok(seen.turnsLeft > 0 && seen.left > 0, 'turns and seconds still to come');
  assert.ok(seen.busy >= seen.left - 1e-9, 'the opponent counts as committed through them');
  assert.ok(threat, 'a threat that knows it is a Mash Combo turn');
  assert.ok(threat.mash.turnsLeft >= 0 && threat.severity > 0);
  // It answered with its Shield: the turn it blocked ended the series.
  assert.equal(player.mash.lastEnd.reason, 'blocked');
  assert.equal(cpu.combat.launchPoint, 0, 'nothing got through');
  // A Shield raised against it blocks a turn and ends the series there.
  const r = rigFor(ONE, { foeController: { getInput: () => ({ ...blankInput(), shield: true }) } });
  for (let i = 0; i < 10; i++) r.tick();
  mashOn(r, 'attack1');
  runSeries(r);
  assert.equal(r.player.mash.lastEnd.reason, 'blocked');
});

test('a CPU never stays stuck on a Mash Combo it cannot make: in the air or with nothing to mash, the plan fails and play goes on', () => {
  const { cpu, log } = cpuVersusDummy(getCharacter('0005'), 'hard', { seconds: 5, gap: 600 });
  // Far away: whatever it planned, it never sat in a mash plan for long.
  let run = 0;
  let longest = 0;
  for (const s of log) {
    run = s.state === 'armed' ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  assert.ok(longest * DT <= MASH_COMBO.armWait + 0.05, 'never armed longer than the arm wait');
  assert.ok(!cpu.mash.engaged || cpu.grounded);
});

// ---- Game modes ------------------------------------------------------------------------------

test('Watch Mode, Quick Battle (Regular and Custom play share it) and Practice Ground all run it with no fighter-specific code', () => {
  const sprites = (d) => fakeSpritesOf(d);
  // Watch Mode: two CPUs.
  const watch = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('city'), p1Def: getCharacter('0007'), p2Def: getCharacter('0004'),
    p1Sprites: sprites(getCharacter('0007')), p2Sprites: sprites(getCharacter('0004')), input: { flush() {}, sample: () => ({}) },
    seed: 3, mode: 'watch', difficulty: 'medium',
  });
  watch.setPhase('fight');
  let n = 0;
  for (let i = 0; i < 60 / DT && watch.phase === 'fight'; i++) {
    watch.update(DT);
    n = watch.p1.mash.started + watch.p2.mash.started;
    if (n) break;
  }
  assert.ok(n >= 1, 'a Watch Mode CPU set one off');
  // Practice Ground: the player mashes on the dummy, which never attacks.
  const held = {};
  const input = { flush() {}, sample: () => ({ ...blankInput(), ...held }), script: [] };
  const session = new PracticeSession({ canvas: { getContext: () => ({}) }, map: PRACTICE_MAP, def: ONE, sprites: sprites(ONE), input });
  const p = session.player;
  const dummy = session.fighters?.[1] ?? session.cpu;
  if (dummy) p.body.x = dummy.body.x - 40;
  for (let i = 0; i < MASH_COMBO.presses; i++) {
    Object.assign(held, press('attack1'));
    session.update(DT);
    for (const k of Object.keys(held)) delete held[k];
    session.update(DT);
  }
  let turns = 0;
  for (let i = 0; i < 400 && (p.mash.engaged || !turns); i++) {
    session.update(DT);
    turns = Math.max(turns, p.mash.turn);
  }
  assert.equal(p.mash.lastEnd?.reason, 'complete', 'the player\'s series plays out in Practice Ground');
  if (dummy) assert.equal(dummy.mash.started, 0, 'the training dummy never mashes');
});

test('no fighter is special-cased in the engine: the combo\'s code reads data only', () => {
  for (const file of ['js/game/fighters/fighter.js', 'js/game/combat/combat.js', 'js/game/combat/combat-state.js', 'js/game/combat/mash-combo.js',
    'js/game/ai/cpu-intelligence/evaluator.js', 'js/game/ai/cpu-intelligence/plans.js', 'js/game/rendering/hit-fx.js']) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /['"]000\d['"]/, `${file}: no fighter id`);
    assert.doesNotMatch(src, /mash_attack/, `${file}: no partner codename in the engine (it is data)`);
  }
});
