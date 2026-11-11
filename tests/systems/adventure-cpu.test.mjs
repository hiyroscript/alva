// Run with node --test tests/systems/adventure-cpu.test.mjs (no dependencies).
// CPU Intelligence and the match's real numbers (the Adventure update,
// js/game/ai/cpu-intelligence/effective.js): with the identity's modifiers
// (every mode but Adventure, and the CPU's own side in Adventure: Venture
// never scales a hit) its decisions are the same whether the identity is
// left out or spelled out, seeded match for seeded match; against the
// player's Perquisites it reasons with what the match really does: against
// a player who takes less (Brave Soldier) it predicts the lower Launch Point
// its hits leave and sees a finish later, and against one who hits harder
// (Redoutable Strength) it weighs that player's hits more. Recovery and
// Energy are read through the same modifiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { getCharacter } from '../../js/data/characters.js';
import { battleState, hashState } from '../../js/online/state-hash.js';
import { IDENTITY_MODIFIERS } from '../../js/game/combat/modifiers.js';
import { perquisiteModifiers, ventureSpec, adventureModifiers } from '../../js/data/adventure.js';
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

// The same two seeded matches, fingerprinted with no modifiers given at
// all, as every mode but Adventure plays: the identity's modifiers change no
// decision and no step. First taken on the code just before the Adventure
// update (commit c5dd654); re-taken when every difficulty was made less
// smart (the profiles, js/data/difficulty.js, decide every CPU step). A
// deliberate change to a fighter, a shared rule or a profile may move them
// (then re-take them with the modifiers left out); nothing Adventure does
// may.
const BEFORE = [
  { a: '0001', b: '0002', map: 'desert', seed: 5, difficulty: 'hard', hash: 2668964452 },
  { a: '0007', b: '0003', map: 'city', seed: 9, difficulty: 'medium', hash: 1562088838 },
];

test('with the identity\'s modifiers the CPU decides exactly as with none, seeded match for seeded match', () => {
  for (const { hash, ...match } of BEFORE) {
    assert.equal(fingerprint(match), hash, `${match.a} v ${match.b}: as fingerprinted`);
    const spelledOut = fingerprint({ ...match, extra: { modifiers: { p1: IDENTITY_MODIFIERS, p2: { damageDealt: 1, energyCostScale: 1 } } } });
    assert.equal(spelledOut, hash, 'the identity spelled out is the same match');
  }
});

test('an Adventure battle with no Perquisite is the same match, step for step: the CPU\'s side has nothing; the player\'s Perquisites change it', () => {
  const { hash, ...match } = BEFORE[0];
  assert.equal(fingerprint({ ...match, extra: { modifiers: adventureModifiers({}) } }), hash);
  assert.notEqual(fingerprint({ ...match, extra: { modifiers: adventureModifiers({ redoutableStrength: 5 }) } }), hash);
});

// A Quick Battle's CPU (p2) a few steps into the fight, close to a still
// opponent, its picture of the fight built: { battle, ai, s, judge }. The
// opponent (the player's side) has `foeMods`; the CPU never has any.
function lookingAt({ foeMods = null, cpuLevel = null } = {}) {
  const def = getCharacter('0001');
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 4, difficulty: 'brutal',
    p1Def: def, p2Def: def, p1Sprites: fakeSpritesOf(def), p2Sprites: fakeSpritesOf(def), input,
    modifiers: { p1: foeMods }, cpuLevel,
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

test('the CPU knows the match\'s modifiers as rules, like the clock: its opponent\'s, and its own, the identity\'s', () => {
  const foeMods = perquisiteModifiers({ braveSoldier: 1 });
  const { battle, s } = lookingAt({ foeMods, cpuLevel: ventureSpec(12) });
  assert.ok(s.present);
  assert.equal(s.me.mods, battle.p2.modifiers);
  assert.equal(s.me.mods, IDENTITY_MODIFIERS, 'Venture deals its hits as authored');
  assert.equal(s.op.mods, battle.p1.modifiers);
  assert.equal(modsOf(battle.p2).damageDealt, 1);
  assert.equal(modsOf(battle.p1).damageTaken, foeMods.damageTaken);
  const plain = lookingAt();
  assert.equal(plain.s.me.mods, IDENTITY_MODIFIERS);
  assert.equal(plain.s.op.mods, IDENTITY_MODIFIERS);
});

test('its finisher threshold follows the real numbers: its own hits as authored at every Venture level, a Brave Soldier finished later', () => {
  const plain = finisherThreshold(lookingAt());
  assert.ok(Number.isFinite(plain), 'a finish exists at all');
  // Venture's hits are its fighter's own at every level: it sees the
  // finish where any CPU would, never sooner.
  for (const level of [1, 20, 30]) {
    assert.equal(finisherThreshold(lookingAt({ cpuLevel: ventureSpec(level) })), plain, `Level ${level}: its authored hits`);
  }
  // Against a Brave Soldier its hits do less: the finish comes later.
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
  assert.equal(effectiveEnergyCost(IDENTITY_MODIFIERS, 15), 15, 'a CPU has no Perquisite: full costs');
  assert.equal(effectiveDamage(IDENTITY_MODIFIERS, IDENTITY_MODIFIERS, 10), 10, 'and its hits as authored');
  assert.ok(Math.abs(effectiveDamage(perquisiteModifiers({ redoutableStrength: 1 }), IDENTITY_MODIFIERS, 10) - 10.8) < 1e-12);
  assert.ok(Math.abs(effectiveDamage(IDENTITY_MODIFIERS, perquisiteModifiers({ braveSoldier: 1 }), 10) - 9.2) < 1e-12);
});

test('a Venture CPU in a real Adventure battle plays: it attacks, scores and is never stuck', () => {
  const def = getCharacter('0001');
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 12,
    p1Def: def, p2Def: getCharacter('0002'), p1Sprites: fakeSpritesOf(def), p2Sprites: fakeSpritesOf(getCharacter('0002')), input,
    cpuLevel: ventureSpec(25), modifiers: adventureModifiers({ braveSoldier: 2, nearlyImmortal: 2 }),
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
