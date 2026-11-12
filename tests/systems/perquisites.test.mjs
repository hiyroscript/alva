// Run with node --test tests/systems/perquisites.test.mjs (no dependencies).
// Adventure's Perquisites (the Adventure update, js/data/adventure.js):
// their table and scaling (level n is the base x 1 + 0.5 (n - 1)), the
// offers (two different Perquisites, each at the next level the player does
// not own, drawn from the run's seed and saved, so a reload shows the same
// two), every effect hooked in at exactly its place in the shared rules
// (damage taken, the recovery tick's amount, its interval but never the
// delay, every Energy cost, damage dealt), and the saved progress itself
// (js/core/adventure-progress.js): checked on reading, a refusing storage
// never throwing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERQUISITES, PERQUISITE_IDS, PERQUISITE_MAX_LEVEL, PERQUISITE_MILESTONES, ADVENTURE_LEVELS, ROMAN,
  perquisiteScale, perquisiteEffect, perquisiteModifiers, perquisiteOffer, offerLevel, offerablePerquisites, perquisiteNumbers,
} from '../../js/data/adventure.js';
import {
  AdventureProgress, ADVENTURE_KEY, ADVENTURE_VERSION, ALL_CLEARED, readProgress,
} from '../../js/core/adventure-progress.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { CombatState, resolveEnergy, BLOCK_ENERGY_COST, DASH_ENERGY_COST, DEFLECT_ENERGY_COST } from '../../js/game/combat/combat-state.js';
import { resolveModifiers } from '../../js/game/combat/modifiers.js';
import { LAUNCH_RECOVERY_DELAY, LAUNCH_RECOVERY_INTERVAL, LAUNCH_RECOVERY_AMOUNT } from '../../js/data/launch.js';
import { mulberry32 } from '../../js/core/utils.js';
import { duel, makeFighter, probeHit } from '../helpers/fighter-harness.mjs';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    writes: 0,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { this.writes++; map.set(k, String(v)); },
  };
}

const probe = (damage) => probeHit({ id: 'probe', damage, baseLaunch: 0, directionalLaunch: null, hitstun: 0, blockstun: 0, hitstop: 0 });

// ---- The table -----------------------------------------------------------------------

test('five Perquisites, their final ids, their bases and five levels each', () => {
  assert.deepEqual(PERQUISITE_IDS, ['braveSoldier', 'nearlyImmortal', 'velociousImmuneSystem', 'maximumEnergy', 'redoutableStrength']);
  assert.deepEqual(PERQUISITES.map((p) => [p.id, p.base]), [
    ['braveSoldier', 0.08], ['nearlyImmortal', 0.5], ['velociousImmuneSystem', 0.08], ['maximumEnergy', 0.08], ['redoutableStrength', 0.08],
  ]);
  assert.equal(PERQUISITE_MAX_LEVEL, 5);
  assert.deepEqual(ROMAN.slice(1), ['I', 'II', 'III', 'IV', 'V']);
});

test('each level amplifies it by 0.5: levels I to V are the base x 1, 1.5, 2, 2.5 and 3', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(perquisiteScale), [1, 1.5, 2, 2.5, 3]);
  assert.equal(perquisiteScale(0), 0, 'not owned: nothing');
  for (const p of PERQUISITES) {
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => perquisiteEffect(p.id, n)), [1, 1.5, 2, 2.5, 3].map((k) => p.base * k), p.id);
  }
  // The spec's own table, in plain numbers.
  const pct = (id) => [1, 2, 3, 4, 5].map((n) => Math.round(perquisiteEffect(id, n) * 100));
  for (const id of ['braveSoldier', 'velociousImmuneSystem', 'maximumEnergy', 'redoutableStrength']) assert.deepEqual(pct(id), [8, 12, 16, 20, 24], id);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => perquisiteEffect('nearlyImmortal', n)), [0.5, 0.75, 1, 1.25, 1.5]);
});

test('the modifiers a player fights with: identity with nothing owned, each Perquisite its own field', () => {
  assert.deepEqual(perquisiteModifiers({}), {
    damageTaken: 1, recoveryAmountBonus: 0, recoveryIntervalScale: 1, energyCostScale: 1, damageDealt: 1,
  });
  const m = perquisiteModifiers({ braveSoldier: 2, nearlyImmortal: 3, velociousImmuneSystem: 1, maximumEnergy: 5, redoutableStrength: 4 });
  assert.ok(Math.abs(m.damageTaken - 0.88) < 1e-12);
  assert.equal(m.recoveryAmountBonus, 1);
  assert.ok(Math.abs(m.recoveryIntervalScale - 0.92) < 1e-12);
  assert.ok(Math.abs(m.energyCostScale - 0.76) < 1e-12);
  assert.ok(Math.abs(m.damageDealt - 1.2) < 1e-12);
});

test('each card states its effect in real numbers: Velocious Immune System at II recovers every 0.44 s instead of 0.5 s', () => {
  assert.deepEqual(perquisiteNumbers('braveSoldier', 2), { percent: 12 });
  const v = perquisiteNumbers('velociousImmuneSystem', 2);
  assert.ok(Math.abs(v.interval - 0.44) < 1e-12);
  assert.equal(v.normal, 0.5);
  assert.equal(v.delay, 2, 'recovery still starts after 2 s');
  assert.deepEqual(perquisiteNumbers('nearlyImmortal', 1), { points: 0.5, total: 2.5, normal: 2 });
});

// ---- The offers ----------------------------------------------------------------------

test('an offer is always two different Perquisites, each the next level of one not yet at V', () => {
  const rng = mulberry32(1234);
  for (let i = 0; i < 400; i++) {
    const levels = Object.fromEntries(PERQUISITE_IDS.map((id) => [id, Math.floor(rng() * 6)]));
    const open = offerablePerquisites(levels);
    const offer = perquisiteOffer(levels, Math.floor(rng() * 2 ** 32), PERQUISITE_MILESTONES[i % 6]);
    assert.equal(offer.length, Math.min(2, open.length));
    assert.equal(new Set(offer).size, offer.length, 'two different Perquisites');
    for (const id of offer) {
      assert.ok(levels[id] < PERQUISITE_MAX_LEVEL, `${id} is not at V`);
      assert.equal(offerLevel(levels, id), levels[id] + 1, 'its next level');
    }
  }
});

test('a full run: six picks, at least two Perquisites always open, and a level once owned never comes back', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const progress = new AdventureProgress(memoryStorage());
    progress.values.seed = seed;
    const seen = new Set();
    const rng = mulberry32(seed * 7);
    for (const level of PERQUISITE_MILESTONES) {
      assert.ok(offerablePerquisites(progress.perquisites).length >= 2, 'with 25 levels and 6 picks, two always remain');
      const offer = progress.offer(level);
      assert.equal(offer.length, 2);
      for (const id of offer) {
        const card = `${id}:${offerLevel(progress.perquisites, id)}`;
        assert.ok(!seen.has(card), `${card} already owned, never offered again`);
      }
      const pick = offer[Math.floor(rng() * 2)];
      assert.ok(progress.pick(level, pick));
      seen.add(`${pick}:${progress.perquisiteLevel(pick)}`);
    }
    assert.equal(Object.values(progress.perquisites).reduce((a, b) => a + b, 0), 6, 'six picks in a run');
  }
});

test('the same seed and milestone always draw the same pair; a saved offer comes back on a reload instead of a reroll', () => {
  assert.deepEqual(perquisiteOffer({}, 99, 5), perquisiteOffer({}, 99, 5));
  const storage = memoryStorage();
  const first = new AdventureProgress(storage);
  const offer = first.offer(10);
  assert.equal(JSON.parse(storage.map.get(ADVENTURE_KEY)).milestones['10'].picked, null, 'saved as it is drawn, nothing picked');
  // A reload in the middle of the choice: the same two cards.
  const reloaded = new AdventureProgress(storage);
  assert.deepEqual(reloaded.offer(10), offer);
  // Even with a different seed now (never in play, but the saved pair wins).
  reloaded.values.seed = (reloaded.values.seed + 1) >>> 0;
  assert.deepEqual(reloaded.offer(10), offer);
});

test('picking saves at once: that Perquisite a level up, the milestone claimed; a claimed milestone offers nothing again', () => {
  const storage = memoryStorage();
  const progress = new AdventureProgress(storage);
  assert.equal(progress.needsPick(5), true);
  assert.equal(progress.needsPick(6), false, 'not a milestone');
  const [a, b] = progress.offer(5);
  assert.equal(progress.pick(5, 'not-offered'), false);
  assert.ok(PERQUISITE_IDS.includes(b));
  assert.equal(progress.pick(5, a), true);
  const saved = JSON.parse(storage.map.get(ADVENTURE_KEY));
  assert.equal(saved.perquisites[a], 1);
  assert.deepEqual(saved.milestones['5'], { offer: [a, b], picked: a });
  assert.equal(progress.claimed(5), true);
  assert.equal(progress.needsPick(5), false, 'a replay shows no cards');
  assert.equal(progress.pick(5, b), false, 'never twice');
});

// ---- Each effect at exactly its place ----------------------------------------------------

test('Brave Soldier: the damage a real hit adds to its owner is lower; nothing else is', () => {
  const mods = perquisiteModifiers({ braveSoldier: 3 });
  const d = duel({ targetModifiers: mods });
  const e = new CombatSystem().applyHit(d.attacker, d.target, probe(10));
  assert.ok(Math.abs(e.damage - 10 * 0.84) < 1e-12);
  assert.equal(d.target.combat.launchPoint, e.damage);
  // Its own hits, recovery and Energy are untouched.
  const out = duel({ attackerModifiers: mods });
  assert.equal(new CombatSystem().applyHit(out.attacker, out.target, probe(10)).damage, 10);
  assert.equal(d.target.combat.costOf(15), 15);
  // And a stage hazard's hit is damage received too.
  d.target.combat.launchPoint = 0;
  assert.ok(Math.abs(new CombatSystem().applyHit(null, d.target, probe(5), { hazard: { id: 'rock' } }).damage - 5 * 0.84) < 1e-12);
});

test('Redoutable Strength: the damage its owner\'s real hits add is higher', () => {
  const d = duel({ attackerModifiers: perquisiteModifiers({ redoutableStrength: 5 }) });
  d.target.combat.launchPoint = 0;
  const e = new CombatSystem().applyHit(d.attacker, d.target, probe(5));
  assert.ok(Math.abs(e.damage - 5 * 1.24) < 1e-12);
  // Both at once: the attacker's dealt times the target's taken.
  const both = duel({ attackerModifiers: { damageDealt: 1.5 }, targetModifiers: { damageTaken: 0.5 } });
  assert.equal(new CombatSystem().applyHit(both.attacker, both.target, probe(10)).damage, 7.5);
});

// The Launch Point a fresh state with `mods` holds at each of `times`
// (seconds after a hit of 20).
function recoveryAt(mods, times) {
  const c = new CombatState(resolveEnergy(), resolveModifiers(mods));
  c.launchPoint = 20;
  c.resetLaunchRecovery();
  let t = 0;
  return times.map((at) => {
    c.update(at - t);
    t = at;
    return c.launchPoint;
  });
}

test('Nearly Immortal: each recovery tick takes off more; the delay and the interval are as ever', () => {
  const mods = perquisiteModifiers({ nearlyImmortal: 1 });
  assert.equal(mods.recoveryAmountBonus, 0.5);
  const delay = LAUNCH_RECOVERY_DELAY;
  const interval = LAUNCH_RECOVERY_INTERVAL;
  assert.deepEqual(recoveryAt(mods, [delay, delay + interval - 0.01, delay + interval, delay + 2 * interval]), [20, 20, 17.5, 15]);
  assert.deepEqual(recoveryAt({}, [delay + interval, delay + 2 * interval]), [20 - LAUNCH_RECOVERY_AMOUNT, 20 - 2 * LAUNCH_RECOVERY_AMOUNT]);
});

test('Velocious Immune System: the ticks come faster, never the 2 s delay before recovery starts', () => {
  const mods = perquisiteModifiers({ velociousImmuneSystem: 2 });
  const interval = 0.5 * 0.88;
  assert.ok(Math.abs(mods.recoveryIntervalScale * LAUNCH_RECOVERY_INTERVAL - interval) < 1e-12);
  // Nothing before the delay plus one (shorter) interval; then every 0.44 s.
  assert.deepEqual(recoveryAt(mods, [2, 2 + interval - 0.01, 2 + interval + 1e-9, 2 + 2 * interval + 1e-9, 2.5]), [20, 20, 18, 16, 16]);
  // The delay is the universal one: a hit still holds recovery 2 s.
  const c = new CombatState(resolveEnergy(), resolveModifiers(mods));
  c.launchPoint = 10;
  c.resetLaunchRecovery();
  assert.ok(Math.abs(c.launchRecoveryRemaining - (LAUNCH_RECOVERY_DELAY + interval)) < 1e-12);
});

test('Maximum Energy: every cost is lower: the Dash, the air dash, a blocked hit, the Deflect, a move\'s own cost', () => {
  const mods = perquisiteModifiers({ maximumEnergy: 2 });
  const scale = 0.88;
  // The Dash, through the real press.
  const { fighter, step } = makeFighter({ modifiers: mods });
  step({ mouvementRightPressed: true, runRight: true });
  assert.ok(fighter.dash);
  assert.ok(Math.abs(fighter.combat.energy - (100 - DASH_ENERGY_COST * scale)) < 1e-9);
  // Every payment goes through the same price: the Deflect's and a
  // construct move's (Fighter.payEnergy).
  for (const cost of [DEFLECT_ENERGY_COST, 15]) {
    const f = makeFighter({ modifiers: mods }).fighter;
    assert.ok(f.payEnergy(cost));
    assert.ok(Math.abs(f.combat.energy - (100 - cost * scale)) < 1e-9);
    assert.ok(Math.abs(f.combat.energySpent - cost * scale) < 1e-9, 'the statistics count what was really paid');
  }
  // A blocked hit.
  const d = duel({ targetModifiers: mods });
  d.target.combat.shielding = true;
  const e = new CombatSystem().applyHit(d.attacker, d.target, probe(5));
  assert.equal(e.type, 'block');
  assert.ok(Math.abs(e.energyCost - BLOCK_ENERGY_COST * scale) < 1e-9);
  assert.ok(Math.abs(d.target.combat.energy - (100 - BLOCK_ENERGY_COST * scale)) < 1e-9);
  // Nobody else pays less.
  assert.equal(makeFighter().fighter.combat.costOf(15), 15);
});

// ---- The saved progress ------------------------------------------------------------------

test('saved progress: one versioned object under its own key, every field checked, corrupt data fresh progress', () => {
  assert.equal(ADVENTURE_KEY, 'alva.adventure');
  assert.equal(ADVENTURE_VERSION, 1);
  const fresh = readProgress(null);
  assert.deepEqual([fresh.unlocked, fresh.cleared, fresh.milestones], [1, [], {}]);
  assert.deepEqual(fresh.perquisites, Object.fromEntries(PERQUISITE_IDS.map((id) => [id, 0])));
  for (const junk of ['nonsense', 42, [], { version: '1' }, { version: 2, unlocked: 9 }]) assert.equal(readProgress(junk).unlocked, 1, JSON.stringify(junk));
  const read = readProgress({
    version: 1, unlocked: 99, cleared: [3, 3, 'x', 40, -1], seed: 7,
    perquisites: { braveSoldier: 9, maximumEnergy: 2.5, nearlyImmortal: -3, mystery: 4 },
    milestones: { 5: { offer: ['braveSoldier', 'maximumEnergy'], picked: 'braveSoldier' }, 6: { offer: ['braveSoldier', 'maximumEnergy'] },
      10: { offer: ['braveSoldier', 'braveSoldier'], picked: null }, 15: { offer: ['braveSoldier', 'nope'] }, 20: { offer: ['maximumEnergy', 'nearlyImmortal'], picked: 'x' } },
  });
  assert.equal(read.unlocked, ALL_CLEARED, 'clamped to 31: every level cleared');
  assert.deepEqual(read.cleared, Array.from({ length: ADVENTURE_LEVELS }, (_, i) => i + 1), 'every level below it cleared');
  assert.equal(read.seed, 7);
  assert.deepEqual(read.perquisites, { braveSoldier: 5, nearlyImmortal: 0, velociousImmuneSystem: 0, maximumEnergy: 0, redoutableStrength: 0 });
  assert.deepEqual(read.milestones, {
    5: { offer: ['braveSoldier', 'maximumEnergy'], picked: 'braveSoldier' },
    20: { offer: ['maximumEnergy', 'nearlyImmortal'], picked: null },
  });
  assert.equal(readProgress({ version: 1, unlocked: 0 }).unlocked, 1, 'the clamp(unlocked | 0 || 1) pattern');
  assert.equal(readProgress({ version: 1, unlocked: 4.8 }).unlocked, 4);
  assert.deepEqual(readProgress({ version: 1, unlocked: 4, cleared: [9] }).cleared, [1, 2, 3], 'a cleared level above the next is dropped');
});

test('a storage that refuses or is missing keeps progress for this visit only and never throws', () => {
  const refusing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const progress = new AdventureProgress(refusing);
  assert.equal(progress.unlocked, 1);
  assert.doesNotThrow(() => progress.recordWin(1));
  assert.equal(progress.unlocked, 2, 'kept for this visit');
  const none = new AdventureProgress(null);
  assert.doesNotThrow(() => none.offer(5));
  const unreadable = new AdventureProgress(memoryStorage({ [ADVENTURE_KEY]: '{not json' }));
  assert.equal(unreadable.unlocked, 1);
});

test('a win on the next level unlocks the one after; a replay of a cleared level unlocks nothing; Level 30 completes the run', () => {
  const progress = new AdventureProgress(memoryStorage());
  assert.deepEqual(progress.recordWin(2), { unlocked: false, complete: false }, 'a locked level cannot be won');
  assert.deepEqual(progress.recordWin(1), { unlocked: true, complete: false });
  assert.equal(progress.unlocked, 2);
  assert.deepEqual(progress.recordWin(1), { unlocked: false, complete: false });
  assert.equal(progress.unlocked, 2);
  progress.values.unlocked = 30;
  progress.values.cleared = Array.from({ length: 29 }, (_, i) => i + 1);
  assert.deepEqual(progress.recordWin(30), { unlocked: false, complete: true });
  assert.equal(progress.unlocked, ALL_CLEARED);
  assert.equal(progress.complete, true);
  assert.equal(progress.state(30), 'cleared');
  assert.equal(progress.nextLevel, 30);
  progress.reset();
  assert.equal(progress.unlocked, 1);
  assert.equal(progress.hasProgress, false);
});
