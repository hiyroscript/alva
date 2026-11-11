// Run with node --test tests/systems/venture.test.mjs (no dependencies).
// Venture, Adventure's own difficulty (the Adventure update,
// js/data/adventure.js): its profile at every level (Easy at Level 1, every
// trait's distance from perfect play divided by exactly 1.5 a level, within
// its bounds, never a trait getting worse), its strength (1.05 a level,
// apart from the smarts), and that strength reaching the fighters through
// the battle's modifiers alone: a Venture hit adds the scaled damage (and
// launches from it), a blocked one still adds nothing and costs the normal
// Energy, and nothing outside Adventure ever scales a hit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADVENTURE_LEVELS, VENTURE_SMARTS_GROWTH, VENTURE_STRENGTH_GROWTH, VENTURE_LIMITS, VENTURE_BASE_DIFFICULTY,
  ventureProfile, ventureSmarts, ventureStrength, ventureModifiers, ventureSpec, adventureModifiers,
} from '../../js/data/adventure.js';
import {
  CAPABILITY, DIFFICULTIES, DIFFICULTY_IDS, getDifficultyProfile, resolveDifficulty,
} from '../../js/data/difficulty.js';
import { IDENTITY_MODIFIERS, resolveModifiers, hitDamage } from '../../js/game/combat/modifiers.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { BLOCK_ENERGY_COST } from '../../js/game/combat/combat-state.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { LAUNCH_UNIT_SPEED } from '../../js/data/launch.js';
import { CONFIG } from '../../js/config.js';
import { formatLaunchPoint } from '../../js/ui/hud.js';
import { formatStat } from '../../js/screens/battle-screen.js';
import { def, duel, makeFighter, probeHit, fakeSprites, DT } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const LEVELS = Array.from({ length: ADVENTURE_LEVELS }, (_, i) => i + 1);
const TRAITS = Object.keys(CAPABILITY);
const STEP = CONFIG.sim.step;
const close = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
// A trait's values as a list (a range's two bounds, or the one value).
const values = (v) => (Array.isArray(v) ? v : [v]);

// ---- Smarter ---------------------------------------------------------------------------

test('Level 1 is the Easy profile exactly', () => {
  assert.equal(VENTURE_BASE_DIFFICULTY, 'easy');
  assert.equal(ventureProfile(1), getDifficultyProfile('easy'), 'the very profile, not a copy');
  assert.deepEqual(ventureProfile(1), getDifficultyProfile('easy'));
  assert.equal(ventureSmarts(1), 1);
  assert.equal(ventureStrength(1), 1);
});

test('every level holds every trait of a difficulty profile and nothing else', () => {
  for (const level of LEVELS) {
    const p = ventureProfile(level);
    assert.deepEqual(Object.keys(p).sort(), [...TRAITS].sort(), `level ${level}`);
    assert.ok(Object.isFrozen(p), `level ${level} is frozen`);
    for (const t of ['react', 'think']) assert.equal(p[t].length, 2, `${t} stays a range`);
  }
});

test('each level, every trait\'s distance from perfect play is divided by exactly 1.5, within its bounds', () => {
  assert.equal(VENTURE_SMARTS_GROWTH, 1.5);
  const easy = getDifficultyProfile('easy');
  for (const level of LEVELS) {
    assert.equal(ventureSmarts(level), 1.5 ** (level - 1), `the intelligence factor at ${level}`);
    const p = ventureProfile(level);
    for (const trait of TRAITS) {
      const limit = VENTURE_LIMITS[trait];
      const got = values(p[trait]);
      const from = values(easy[trait]);
      got.forEach((v, i) => {
        // Never past perfect play, never short of Easy.
        const lo = Math.min(limit, from[i]);
        const hi = Math.max(limit, from[i]);
        assert.ok(v >= lo - 1e-12 && v <= hi + 1e-12, `${trait} at ${level}: ${v} within [${lo}, ${hi}]`);
        if (trait === 'planDepth') {
          assert.ok(Number.isInteger(v) && v >= 1 && v <= 4, `plan depth is a whole number 1-4 (${v})`);
          assert.equal(v, Math.round(limit + (from[i] - limit) / 1.5 ** (level - 1)));
          return;
        }
        // value(L) = limit + (easy - limit) / 1.5^(L-1): the distance left.
        assert.ok(close(v - limit, (from[i] - limit) / 1.5 ** (level - 1)), `${trait} at ${level}`);
        if (level > 1) {
          const before = values(ventureProfile(level - 1)[trait])[i];
          if (before !== limit) assert.ok(close((v - limit) * 1.5, before - limit), `${trait}: exactly 1.5 times closer than at ${level - 1}`);
        }
      });
    }
  }
});

test('perfect play is the physical limit: reactions of at least two steps, no lapse, plan depth 4, probabilities 1', () => {
  assert.ok(VENTURE_LIMITS.react >= 2 * STEP - 1e-12, 'never on the frame something starts');
  assert.ok(VENTURE_LIMITS.think >= 2 * STEP - 1e-12);
  for (const t of ['lapse', 'noise', 'rangeError', 'predictError', 'timing']) assert.equal(VENTURE_LIMITS[t], 0, t);
  assert.equal(VENTURE_LIMITS.planDepth, 4);
  for (const [t, dir] of Object.entries(CAPABILITY)) {
    if (dir === 1 && !['lookahead', 'planDepth'].includes(t)) assert.equal(VENTURE_LIMITS[t], 1, `${t} closes in on 1`);
  }
  // Even Level 30 reacts on no earlier frame than two steps.
  for (const level of LEVELS) assert.ok(ventureProfile(level).react[0] >= 2 * STEP - 1e-12, `level ${level}`);
  // Probabilities stay probabilities.
  for (const level of LEVELS) {
    const p = ventureProfile(level);
    for (const t of ['lapse', 'comboReliability', 'guard', 'perfectShield', 'punish', 'adapt', 'energySense', 'riskSense', 'stageSense',
      'opportunity', 'diSkill', 'recoverySkill', 'initiative', 'patience', 'discipline', 'awareness']) {
      assert.ok(p[t] >= 0 && p[t] <= 1, `${t} at ${level}`);
    }
  }
});

test('no trait ever gets worse from one level to the next, across all 30 (the CAPABILITY ordering)', () => {
  for (let level = 2; level <= ADVENTURE_LEVELS; level++) {
    const before = ventureProfile(level - 1);
    const now = ventureProfile(level);
    for (const [trait, dir] of Object.entries(CAPABILITY)) {
      values(now[trait]).forEach((v, i) => {
        assert.ok(dir * (v - values(before[trait])[i]) >= -1e-12, `${trait}: level ${level} is no worse than ${level - 1}`);
      });
    }
  }
});

test('Venture passes Brutal on most traits by Level 9 and keeps closing in: past it everywhere Brutal is not already perfect', () => {
  const brutal = getDifficultyProfile('brutal');
  const atLeast = (p) => TRAITS.filter((t) => values(p[t]).every((v, i) => CAPABILITY[t] * (v - values(brutal[t])[i]) >= -1e-12));
  assert.ok(atLeast(ventureProfile(6)).length >= 6, 'by Level 6 it reacts and plans like Brutal');
  assert.ok(atLeast(ventureProfile(9)).length >= 18, 'by Level 9 most traits match or pass Brutal');
  // Brutal is already perfect on its plan depth (4, a whole number Venture
  // reaches), stage sense, launch steering and recovery skill (1): Venture
  // only ever closes in on the last three.
  const perfect = TRAITS.filter((t) => values(brutal[t]).every((v) => v === VENTURE_LIMITS[t]));
  assert.deepEqual(perfect.sort(), ['diSkill', 'planDepth', 'recoverySkill', 'stageSense']);
  const short = TRAITS.filter((t) => !atLeast(ventureProfile(30)).includes(t));
  assert.deepEqual(short.sort(), ['diSkill', 'recoverySkill', 'stageSense']);
  for (const t of short) assert.ok(ventureProfile(30)[t] > 0.9999, `${t} within a hair of perfect`);
});

test('Venture is no fifth difficulty: four levels listed, its profile reached through getDifficultyProfile({ venture })', () => {
  assert.deepEqual(DIFFICULTY_IDS, ['easy', 'medium', 'hard', 'brutal']);
  assert.equal(DIFFICULTIES.length, 4);
  assert.equal(resolveDifficulty('venture'), 'medium', 'no difficulty id reaches it');
  for (const level of LEVELS) assert.equal(getDifficultyProfile({ venture: level }), ventureProfile(level));
  assert.equal(getDifficultyProfile(ventureSpec(99)), ventureProfile(30), 'out of range: clamped');
  assert.equal(getDifficultyProfile(ventureSpec(-3)), ventureProfile(1));
  const ai = new CombatAIController({ difficulty: ventureSpec(12), rng: () => 0.5 });
  assert.equal(ai.profile, ventureProfile(12));
  assert.equal(ai.difficulty, 'venture');
  const given = new CombatAIController({ profile: ventureProfile(4), rng: () => 0.5 });
  assert.equal(given.profile, ventureProfile(4), 'a profile may be given outright');
  // Every other controller is as it was.
  assert.equal(new CombatAIController({ difficulty: 'hard' }).profile, getDifficultyProfile('hard'));
  assert.equal(new CombatAIController({ difficulty: 'nonsense' }).profile, getDifficultyProfile('medium'));
});

// ---- Stronger --------------------------------------------------------------------------

test('ventureStrength(L) is 1.05^(L-1): x1 at 1, about x1.55 at 10, x2.53 at 20 and x4.12 at 30, apart from the smarts', () => {
  assert.equal(VENTURE_STRENGTH_GROWTH, 1.05);
  assert.notEqual(VENTURE_STRENGTH_GROWTH, VENTURE_SMARTS_GROWTH, 'each grows from its own constant');
  for (const level of LEVELS) {
    assert.equal(ventureStrength(level), 1.05 ** (level - 1), `level ${level}`);
    assert.deepEqual(ventureModifiers(level), { damageDealt: 1.05 ** (level - 1) }, 'its strength and nothing else');
  }
  assert.equal(ventureStrength(10).toFixed(2), '1.55');
  assert.equal(ventureStrength(20).toFixed(2), '2.53');
  assert.equal(ventureStrength(30).toFixed(2), '4.12');
  assert.equal(ventureSmarts(30).toFixed(0), '127834', 'the smarts grow far faster; damage never does');
  // One function each: nothing else in the game computes them.
  const src = readFileSync(new URL('../../js/data/adventure.js', import.meta.url), 'utf8');
  assert.equal(src.match(/VENTURE_STRENGTH_GROWTH \*\*/g)?.length, 1);
  assert.equal(src.match(/VENTURE_SMARTS_GROWTH \*\*/g)?.length, 1);
});

// A plain hit, launching sideways from the target's new Launch Point.
const probe = (damage, baseLaunch = 1) => probeHit({
  id: 'probe', damage, baseLaunch, directionalLaunch: 'horizontal', hitstun: 0, blockstun: 0, hitstop: 0,
});

test('a Venture hit adds the scaled damage, fills the Limit gauge by as much and launches from the new total', () => {
  const level = 10;
  const d = duel({ attackerModifiers: ventureModifiers(level) });
  d.target.combat.launchPoint = 40;
  const e = new CombatSystem().applyHit(d.attacker, d.target, probe(5, 2));
  const damage = 5 * 1.05 ** 9;
  assert.equal(e.type, 'hit');
  assert.equal(e.damage, damage);
  assert.equal(e.launchPointAfter, 40 + damage, 'fractional, kept as it is');
  assert.equal(d.target.combat.limitGauge, damage);
  assert.equal(e.launchStrength, 2 * (40 + damage), 'Base Launch x the new Launch Point');
  assert.ok(Math.abs(d.target.body.vx - 2 * (40 + damage) * LAUNCH_UNIT_SPEED) < 1e-9);
  // The same hit from anyone else adds its own damage.
  const plain = duel();
  plain.target.combat.launchPoint = 40;
  assert.equal(new CombatSystem().applyHit(plain.attacker, plain.target, probe(5, 2)).damage, 5);
});

test('Venture\'s strength reaches every hit it is credited with: a projectile, a clone or a technique hits through its owner', () => {
  const d = duel({ attackerModifiers: ventureModifiers(30) });
  const system = new CombatSystem();
  for (const via of [{ projectile: { owner: d.attacker } }, { summon: { owner: d.attacker } }, { technique: { id: 'probe' } }]) {
    d.target.combat.launchPoint = 0;
    const e = system.applyHit(d.attacker, d.target, probe(3, 0), via);
    assert.equal(e.damage, 3 * 1.05 ** 29, Object.keys(via)[0]);
  }
  // A hazard has no attacker: no strength.
  d.target.combat.launchPoint = 0;
  assert.equal(system.applyHit(null, d.target, probe(3, 0), { hazard: { id: 'rock' } }).damage, 3);
});

test('a blocked Venture hit still adds nothing and costs the normal Energy', () => {
  const d = duel({ attackerModifiers: ventureModifiers(30) });
  d.target.combat.launchPoint = 20;
  d.target.combat.shielding = true;
  const before = d.target.combat.energy;
  const e = new CombatSystem().applyHit(d.attacker, d.target, probe(10, 3));
  assert.equal(e.type, 'block');
  assert.equal(e.damage, 0);
  assert.equal(d.target.combat.launchPoint, 20);
  assert.equal(d.target.combat.limitGauge, 0);
  assert.equal(e.energyCost, BLOCK_ENERGY_COST);
  assert.equal(before - d.target.combat.energy, BLOCK_ENERGY_COST);
});

test('a hit of 0 stays 0 whatever the modifiers, and the identity changes nothing', () => {
  assert.equal(hitDamage(0, { damageDealt: 4 }, { damageTaken: 2 }), 0);
  for (const d of [1, 3, 5, 10]) assert.equal(hitDamage(d, IDENTITY_MODIFIERS, IDENTITY_MODIFIERS), d);
  assert.equal(resolveModifiers(null), IDENTITY_MODIFIERS);
  assert.equal(resolveModifiers({ damageDealt: 1 }), IDENTITY_MODIFIERS, 'an identity spelled out is the identity');
  assert.throws(() => resolveModifiers({ speed: 2 }), /unknown modifier "speed"/);
  assert.throws(() => resolveModifiers({ damageDealt: -1 }), /damageDealt must be a finite number/);
  assert.throws(() => resolveModifiers({ recoveryIntervalScale: 0 }), /recoveryIntervalScale/);
});

test('an Adventure Battle hands Venture its level and strength, the player their Perquisites, through every restart and respawn', () => {
  const level = 7;
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 3, p1Def: def, p2Def: def,
    p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input: { flush() {}, sample: () => ({}) },
    cpuLevel: ventureSpec(level), modifiers: adventureModifiers(level, { braveSoldier: 2 }),
  });
  assert.equal(battle.p2.controller.profile, ventureProfile(level));
  assert.equal(battle.p2.modifiers.damageDealt, 1.05 ** 6);
  assert.equal(battle.p2.combat.modifiers, battle.p2.modifiers);
  assert.equal(battle.p1.modifiers.damageTaken, 1 - 0.12);
  assert.equal(battle.p1.modifiers.damageDealt, 1);
  battle.restart();
  assert.equal(battle.p2.combat.modifiers.damageDealt, 1.05 ** 6, 'a restart keeps them');
  battle.p2.respawn(battle.stage);
  assert.equal(battle.p2.combat.modifiers.damageDealt, 1.05 ** 6, 'and so does a respawn');
  assert.equal(battle.p2.controller.profile, ventureProfile(level), 'the same level for the whole battle');
  // Every other battle: identity on both sides, the chosen difficulty.
  const quick = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 3, difficulty: 'hard', p1Def: def, p2Def: def,
    p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input: { flush() {}, sample: () => ({}) },
  });
  assert.equal(quick.p1.modifiers, IDENTITY_MODIFIERS);
  assert.equal(quick.p2.modifiers, IDENTITY_MODIFIERS);
  assert.equal(quick.p2.controller.profile, getDifficultyProfile('hard'));
});

test('fractional Launch Points: shown whole, compared real in the overtime tiebreak', () => {
  assert.equal(formatLaunchPoint(4.654), '5');
  assert.equal(formatLaunchPoint(4.4), '4');
  assert.equal(formatStat(10.5), '11');
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 3, p1Def: def, p2Def: def,
    p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input: { flush() {}, sample: () => ({}) },
  });
  battle.setPhase('fight');
  battle.startOvertime();
  battle.p1.combat.launchPoint = 10.4;
  battle.p2.combat.launchPoint = 10.6;
  assert.deepEqual(battle.liveResult, { outcome: 'p1', reason: 'overtimeLaunchPoint' }, 'the lower real Launch Point, not the rounded tie');
});

test('nothing outside Adventure builds a modifier: no other mode, screen or rule names one', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  // The combat engine reads only what it is handed: no mode, no Adventure.
  for (const file of ['js/game/combat/combat.js', 'js/game/combat/combat-state.js', 'js/game/combat/modifiers.js', 'js/game/fighters/fighter.js']) {
    const code = read(file).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /adventure|venture|perquisite|'quick-battle'|'watch'|'local'|'online'/i, file);
  }
  // Only Adventure's battle screen route passes modifiers or a CPU level.
  for (const file of ['js/screens/watch-screens.js', 'js/screens/local-play-screens.js', 'js/screens/online-battle-screen.js',
    'js/screens/online-screens.js', 'js/screens/practice-screen.js', 'js/game/practice.js', 'js/online/lockstep.js']) {
    assert.doesNotMatch(read(file), /modifiers|cpuLevel|adventure/i, file);
  }
});

// A fighter built with modifiers keeps them through a reset.
test('a fighter\'s modifiers belong to the fighter: kept through reset, given to every fresh combat state', () => {
  const { fighter } = makeFighter({ modifiers: { damageTaken: 0.5 } });
  assert.equal(fighter.combat.modifiers.damageTaken, 0.5);
  fighter.combat.launchPoint = 30;
  fighter.reset(fighter.stage);
  assert.equal(fighter.combat.launchPoint, 0);
  assert.equal(fighter.combat.modifiers.damageTaken, 0.5);
  assert.ok(DT > 0);
});
