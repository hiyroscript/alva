// Run with node --test tests/systems/adventure-cpu.test.mjs (no dependencies).
// CPU Intelligence and the match's real numbers (the Adventure update,
// js/game/ai/cpu-intelligence/effective.js): with the identity's modifiers
// (every mode but Adventure) its decisions are exactly what they were
// before the update, seeded match for seeded match; with Adventure's it
// reasons with what the match really does: a CPU that hits harder (Venture's
// strength) sees a finish at a lower Launch Point, and against a player who
// takes less (Brave Soldier) it predicts the lower Launch Point its hits
// leave. Recovery and Energy are read through the same modifiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { getCharacter } from '../../js/data/characters.js';
import { battleState, hashState } from '../../js/online/state-hash.js';
import { IDENTITY_MODIFIERS } from '../../js/game/combat/modifiers.js';
import { ventureModifiers, perquisiteModifiers, ventureSpec } from '../../js/data/adventure.js';
import {
  effectiveDamage, effectiveRecovery, effectiveEnergyCost, recoveryRelief, BASE_RECOVERY_RATE, modsOf,
} from '../../js/game/ai/cpu-intelligence/effective.js';
import { fakeSpritesOf, DT } from '../helpers/fighter-harness.mjs';
import { controllerFor } from '../helpers/cpu-match.mjs';

const input = { flush() {}, sample: () => ({}) };

// A seeded Quick Battle: #a (a scripted reference opponent) against #b, the
// CPU at `difficulty`, `seconds` long, fingerprinted step by step with the
// online state hash. `extra` goes to the Battle (modifiers, a CPU level).
function fingerprint({ a, b, map, seed, difficulty, seconds = 25, extra = {} }) {
  const p1Def = getCharacter(a);
  const p2Def = getCharacter(b);
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(map), mode: 'quick-battle', seed, difficulty,
    p1Def, p2Def, p1Sprites: fakeSpritesOf(p1Def), p2Sprites: fakeSpritesOf(p2Def), input, ...extra,
  });
  battle.p1.controller = controllerFor('ref:balanced', seed + 101);
  battle.setPhase('fight');
  let hash = 0x811c9dc5;
  for (let i = 0; i < Math.round(seconds / DT) && !battle.matchOver; i++) {
    battle.update(DT);
    hash = hashState(battleState(battle), hash);
  }
  return hash;
}

// The same two seeded matches, fingerprinted on the code just before the
// Adventure update (commit c5dd654): the identity's modifiers change no
// decision and no step. A deliberate change to a fighter or a shared rule
// may move them (then re-take them on the code before that change); nothing
// Adventure does may.
const BEFORE = [
  { a: '0001', b: '0002', map: 'desert', seed: 5, difficulty: 'hard', hash: 2110199624 },
  { a: '0007', b: '0003', map: 'city', seed: 9, difficulty: 'medium', hash: 1511309430 },
];

test('with the identity\'s modifiers the CPU decides exactly as before, seeded match for seeded match', () => {
  for (const { hash, ...match } of BEFORE) {
    assert.equal(fingerprint(match), hash, `${match.a} v ${match.b}: as before the update`);
    const spelledOut = fingerprint({ ...match, extra: { modifiers: { p1: IDENTITY_MODIFIERS, p2: { damageDealt: 1, energyCostScale: 1 } } } });
    assert.equal(spelledOut, hash, 'the identity spelled out is the same match');
  }
});

test('Venture\'s strength changes the match: the same seed, another fight', () => {
  const { hash, ...match } = BEFORE[0];
  assert.notEqual(fingerprint({ ...match, extra: { modifiers: { p2: ventureModifiers(30) } } }), hash);
});

// A Quick Battle's CPU (p2) a few steps into the fight, close to a still
// opponent, its picture of the fight built: { battle, ai, s, judge }.
function lookingAt({ cpuMods = null, foeMods = null } = {}) {
  const def = getCharacter('0001');
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 4, difficulty: 'brutal',
    p1Def: def, p2Def: def, p1Sprites: fakeSpritesOf(def), p2Sprites: fakeSpritesOf(def), input,
    modifiers: { p1: foeMods, p2: cpuMods },
  });
  battle.p1.controller = { getInput: () => ({}) };
  battle.setPhase('fight');
  for (let i = 0; i < 30; i++) battle.update(DT);
  const ai = battle.p2.controller;
  return { battle, ai, s: ai.situation, judge: ai.evaluator.judge };
}

// The lowest opponent Launch Point (in steps of 2) at which the CPU reckons
// its best launch more likely than not to end the opponent's life.
function finisherThreshold(look) {
  const { ai, s, judge } = look;
  for (let lp = 0; lp <= 400; lp += 2) {
    s.op.lp = lp;
    judge.reset();
    if (ai.strategy.koThreat(s, judge, s.caps, 'foe') >= 0.5) return lp;
  }
  return Infinity;
}

test('the CPU knows the match\'s modifiers as rules, like the clock: its own and its opponent\'s', () => {
  const cpuMods = ventureModifiers(12);
  const foeMods = perquisiteModifiers({ braveSoldier: 1 });
  const { battle, s } = lookingAt({ cpuMods, foeMods });
  assert.ok(s.present);
  assert.equal(s.me.mods, battle.p2.modifiers);
  assert.equal(s.op.mods, battle.p1.modifiers);
  assert.equal(modsOf(battle.p2).damageDealt, cpuMods.damageDealt);
  const plain = lookingAt();
  assert.equal(plain.s.me.mods, IDENTITY_MODIFIERS);
  assert.equal(plain.s.op.mods, IDENTITY_MODIFIERS);
});

test('with damageDealt raised, its finisher threshold drops: it goes for the finish much earlier', () => {
  const plain = finisherThreshold(lookingAt());
  const level20 = finisherThreshold(lookingAt({ cpuMods: ventureModifiers(20) }));
  const level30 = finisherThreshold(lookingAt({ cpuMods: ventureModifiers(30) }));
  assert.ok(Number.isFinite(plain), 'a finish exists at all');
  assert.ok(level20 < plain, `Level 20 (${level20}) sooner than its authored hits (${plain})`);
  assert.ok(level30 < level20, `Level 30 (${level30}) sooner still`);
  // And against a Brave Soldier its hits do less: the finish comes later.
  const brave = finisherThreshold(lookingAt({ foeMods: perquisiteModifiers({ braveSoldier: 5 }) }));
  assert.ok(brave > plain, `Brave Soldier V (${brave}) survives longer than ${plain}`);
});

test('with the player\'s damageTaken lowered, the CPU predicts the lower Launch Point its hits leave', () => {
  const run = (foeMods) => {
    const { s, judge } = lookingAt({ foeMods });
    s.op.lp = 40;
    judge.reset();
    const move = s.caps.moves.find((m) => m.kind === 'melee' && m.strikes.length && m.strikes[0].damage > 0);
    const pos = { x: s.op.x ?? s.me.x + 40, y: s.me.y, grounded: true, halfW: s.op.halfW, height: s.op.height };
    return { out: judge.strikes(s, 'foe', move.strikes, move.strikes.length, pos, 1, {}), move };
  };
  const plain = run(null);
  const brave = run(perquisiteModifiers({ braveSoldier: 5 }));
  const authored = plain.move.strikes.reduce((n, st) => n + st.damage, 0);
  assert.equal(plain.out.lp, 40 + authored, 'its authored damage');
  assert.ok(Math.abs(brave.out.lp - (40 + authored * 0.76)) < 1e-9, 'Brave Soldier V: 24% less');
  assert.ok(brave.out.value < plain.out.value, 'and the hit is worth less to it');
});

test('against a player who hits harder, the CPU weighs the player\'s hits more in its guard and risk', () => {
  const plain = lookingAt();
  const strong = lookingAt({ foeMods: perquisiteModifiers({ redoutableStrength: 5 }) });
  plain.ai.evaluator.begin(plain.s);
  strong.ai.evaluator.begin(strong.s);
  assert.ok(strong.ai.evaluator.foePunish > plain.ai.evaluator.foePunish, 'its punish on the CPU is worth more');
});

test('the helpers are the engine\'s own rules: recovery, Energy and damage as the match applies them', () => {
  assert.equal(BASE_RECOVERY_RATE, 4, '2 points every 0.5 s');
  assert.deepEqual(effectiveRecovery(IDENTITY_MODIFIERS), { delay: 2, amount: 2, interval: 0.5, rate: 4 });
  const quick = perquisiteModifiers({ nearlyImmortal: 5, velociousImmuneSystem: 5 });
  const r = effectiveRecovery(quick);
  assert.equal(r.delay, 2, 'the delay never changes');
  assert.equal(r.amount, 3.5);
  assert.ok(Math.abs(r.interval - 0.38) < 1e-12);
  assert.ok(recoveryRelief(quick) > 2, 'its Launch Point drains more than twice as fast');
  assert.equal(recoveryRelief(IDENTITY_MODIFIERS), 1);
  assert.ok(Math.abs(effectiveEnergyCost(perquisiteModifiers({ maximumEnergy: 1 }), 15) - 13.8) < 1e-12);
  assert.equal(effectiveEnergyCost(ventureModifiers(30), 15), 15, 'Venture has no Perquisite: full costs');
  assert.equal(effectiveDamage(ventureModifiers(2), IDENTITY_MODIFIERS, 10), 10.5);
});

test('a Venture CPU in a real Adventure battle plays: it attacks, scores and is never stuck', () => {
  const def = getCharacter('0001');
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 12,
    p1Def: def, p2Def: getCharacter('0002'), p1Sprites: fakeSpritesOf(def), p2Sprites: fakeSpritesOf(getCharacter('0002')), input,
    cpuLevel: ventureSpec(25), modifiers: { p1: perquisiteModifiers({ braveSoldier: 2, nearlyImmortal: 2 }), p2: ventureModifiers(25) },
  });
  battle.p1.controller = controllerFor('ref:balanced', 113);
  battle.setPhase('fight');
  const ai = battle.p2.controller;
  let dealt = 0;
  for (let i = 0; i < Math.round(40 / DT) && !battle.matchOver; i++) {
    battle.update(DT);
    for (const e of battle.combat.events) if (e.type === 'hit' && e.attacker === battle.p2) dealt += e.damage;
  }
  assert.ok(dealt > 0, 'it lands hits');
  const c = ai.telemetry.counters;
  assert.equal(c.invalidInputs, 0, 'no press the fighter refused');
  assert.equal(c.stuckNavigation, 0, 'never stuck');
});
