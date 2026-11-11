// Run with node --test tests/systems/venture.test.mjs (no dependencies).
// Venture, Adventure's own difficulty (the Adventure update,
// js/data/adventure.js): its profile at every level (Easy at Level 1, every
// trait's distance from perfect play divided by exactly 1.5 a level, within
// its bounds, never a trait getting worse), and that smarter is all it
// gets: at every level from 1 to 30 its fighter deals exactly what any
// other CPU's does (no modifier, the Battle refusing one for a CPU), while
// the player's Perquisites reach the player's fighter through the
// battle's modifiers, and nothing outside Adventure builds a modifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADVENTURE_LEVELS, VENTURE_SMARTS_GROWTH, VENTURE_LIMITS, VENTURE_BASE_DIFFICULTY,
  ventureProfile, ventureSmarts, ventureSpec, ventureNumbers, adventureModifiers,
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
  assert.deepEqual(ventureNumbers(1), { smarts: 1 }, 'how much smarter, and nothing else');
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
  assert.equal(ventureSmarts(30).toFixed(0), '127834');
  // One function computes it: nothing else in the game does.
  const src = readFileSync(new URL('../../js/data/adventure.js', import.meta.url), 'utf8');
  assert.equal(src.match(/VENTURE_SMARTS_GROWTH \*\*/g)?.length, 1);
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

test('Venture passes Brutal on most traits by Level 9 and keeps closing in: past it on every trait but plan depth from Level 11', () => {
  const brutal = getDifficultyProfile('brutal');
  const atLeast = (p) => TRAITS.filter((t) => values(p[t]).every((v, i) => CAPABILITY[t] * (v - values(brutal[t])[i]) >= -1e-12));
  const past = (p) => TRAITS.filter((t) => values(p[t]).every((v, i) => CAPABILITY[t] * (v - values(brutal[t])[i]) > 1e-12));
  const six = atLeast(ventureProfile(6));
  assert.ok(six.includes('react') && six.includes('planDepth'), 'by Level 6 it reacts faster than Brutal and plans as deep');
  assert.ok(six.length >= 13, `by Level 6, ${six.length} of 24 traits`);
  assert.ok(atLeast(ventureProfile(5)).length < 13, 'not yet at Level 5');
  assert.ok(atLeast(ventureProfile(9)).length >= 22, 'by Level 9 nearly every trait matches or passes Brutal');
  assert.ok(atLeast(ventureProfile(10)).length < 24, 'not yet all of them at Level 10');
  // Brutal is perfect only on its plan depth (4, a whole number Venture
  // reaches): every other trait Venture passes, from Level 11 on.
  const perfect = TRAITS.filter((t) => values(brutal[t]).every((v) => v === VENTURE_LIMITS[t]));
  assert.deepEqual(perfect, ['planDepth']);
  for (let level = 11; level <= ADVENTURE_LEVELS; level++) {
    assert.deepEqual(TRAITS.filter((t) => !past(ventureProfile(level)).includes(t)), ['planDepth'], `level ${level}`);
    assert.equal(ventureProfile(level).planDepth, 4);
  }
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

// ---- The same hits at every level ---------------------------------------------------

// A plain hit, launching sideways from the target's new Launch Point.
const probe = (damage, baseLaunch = 1) => probeHit({
  id: 'probe', damage, baseLaunch, directionalLaunch: 'horizontal', hitstun: 0, blockstun: 0, hitstop: 0,
});

const input = { flush() {}, sample: () => ({}) };
const quickBattle = (extra = {}) => new Battle({
  canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'quick-battle', seed: 3, p1Def: def, p2Def: def,
  p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input, ...extra,
});

// What the CPU's fighter (p2) adds with the same hit, struck straight, from
// a projectile, a clone and a technique credited to it, and blocked:
// [damage, Launch Point after, launch strength, Limit gauge, Energy paid].
function dealt(battle) {
  const system = new CombatSystem();
  const out = [];
  for (const via of [undefined, { projectile: { owner: battle.p2 } }, { summon: { owner: battle.p2 } }, { technique: { id: 'probe' } }, 'block']) {
    const target = battle.p1.combat;
    target.launchPoint = 40;
    target.limitGauge = 0;
    target.shielding = via === 'block';
    target.setEnergy(target.maxEnergy);
    const e = system.applyHit(battle.p2, battle.p1, probe(5, 2), via === 'block' ? undefined : via);
    out.push([e.type, e.damage, target.launchPoint, e.launchStrength ?? 0, target.limitGauge, target.maxEnergy - target.energy]);
  }
  battle.p1.combat.shielding = false;
  return out;
}

test('Venture never scales a hit: at every level from 1 to 30 its fighter deals exactly what any other CPU\'s does', () => {
  // The same hits from a Quick Battle CPU at each of the four difficulties.
  const reference = dealt(quickBattle({ difficulty: 'easy' }));
  for (const difficulty of DIFFICULTY_IDS) assert.deepEqual(dealt(quickBattle({ difficulty })), reference, `${difficulty}: the same hits`);
  assert.deepEqual(reference[0].slice(0, 5), ['hit', 5, 45, 90, 5], 'its authored damage, launching from 45');
  assert.deepEqual(reference.at(-1).slice(0, 3), ['block', 0, 40], 'blocked: nothing added');
  assert.equal(reference.at(-1)[5], BLOCK_ENERGY_COST, 'and the normal Energy paid');
  for (const level of LEVELS) {
    // An Adventure battle at that level, as the game builds it. The player
    // owning Redoutable Strength V changes nothing here: it is the player's
    // own damage, never the CPU's.
    const battle = quickBattle({ cpuLevel: ventureSpec(level), modifiers: adventureModifiers({ redoutableStrength: 5 }) });
    assert.equal(battle.p2.controller.profile, ventureProfile(level), `level ${level}: Venture plays it`);
    assert.equal(battle.p2.modifiers, IDENTITY_MODIFIERS, `level ${level}: no damageDealt, no modifier at all`);
    assert.equal(battle.p2.combat.modifiers, IDENTITY_MODIFIERS);
    assert.deepEqual(dealt(battle), reference, `level ${level}: the same damage, launch, Limit and Energy as any CPU`);
  }
  // Adventure's data gives the CPU's side nothing, whatever the player owns,
  // and computes no growth of damage at all.
  assert.deepEqual(Object.keys(adventureModifiers({ redoutableStrength: 5 })), ['p1']);
  const src = readFileSync(new URL('../../js/data/adventure.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bVENTURE_STRENGTH|\bventureStrength\b|\bventureModifiers\b/);
  // And the Battle refuses a modifier for a CPU's side, at any level or
  // difficulty, Watch Mode's two included.
  assert.throws(() => quickBattle({ cpuLevel: ventureSpec(30), modifiers: { p2: { damageDealt: 1.5 } } }), /CPU's fighter plays with the identity/);
  assert.throws(() => quickBattle({ difficulty: 'brutal', modifiers: { p2: { damageTaken: 0.5 } } }), /Side p2/);
  assert.throws(() => quickBattle({ mode: 'watch', modifiers: { p1: { damageDealt: 2 } } }), /Side p1/);
  assert.equal(quickBattle({ modifiers: { p2: { damageDealt: 1 } } }).p2.modifiers, IDENTITY_MODIFIERS, 'the identity spelled out is fine');
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

test('an Adventure Battle hands Venture its level, the player their Perquisites, through every restart and respawn', () => {
  const level = 7;
  const battle = quickBattle({ cpuLevel: ventureSpec(level), modifiers: adventureModifiers({ braveSoldier: 2 }) });
  assert.equal(battle.p2.controller.profile, ventureProfile(level));
  assert.equal(battle.p2.modifiers, IDENTITY_MODIFIERS, 'Venture: the identity');
  assert.equal(battle.p1.combat.modifiers, battle.p1.modifiers);
  assert.equal(battle.p1.modifiers.damageTaken, 1 - 0.12);
  assert.equal(battle.p1.modifiers.damageDealt, 1);
  battle.restart();
  assert.equal(battle.p1.combat.modifiers.damageTaken, 1 - 0.12, 'a restart keeps them');
  assert.equal(battle.p2.combat.modifiers, IDENTITY_MODIFIERS);
  battle.p1.respawn(battle.stage);
  assert.equal(battle.p1.combat.modifiers.damageTaken, 1 - 0.12, 'and so does a respawn');
  battle.p2.respawn(battle.stage);
  assert.equal(battle.p2.combat.modifiers, IDENTITY_MODIFIERS);
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
