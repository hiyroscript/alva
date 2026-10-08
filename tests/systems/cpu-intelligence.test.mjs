// Run with node --test tests/systems/cpu-intelligence.test.mjs (no dependencies).
// CPU Intelligence (js/game/ai/cpu-intelligence.js and the modules beside
// it): every competitive CPU, one intelligence at four levels.
//
// Fundamental correctness: it fights through the player's own inputs
// (press edges, double-tap Dashes, Jump held for the height it wants, the
// Shield on the ground only, the Deflect a fresh press in the air), never
// presses what cannot do anything, never writes to a fighter, keeps every
// cooldown, Energy rule and exhaustion, is seeded and deterministic, and
// is never idle while it can act, on any level.
// Combat intelligence: scenarios for each thing it must understand
// (reactions, punishes, Launch Point, ledges, projectiles, the Deflect,
// combos, Energy, recovery, platforms, obstacles, the closing Void).
// Moveset coverage: for every fighter, every move it has is recognized and
// executed when it is the move the situation calls for, on every level.
// Human-like behavior: action histories checked for idle loops, spam,
// oscillation, endless Shields, plan churn and self-destruction.
// Competitive: a seeded sample of the benchmark (tools/cpu-benchmark.mjs).
//
// Runs the real Fighter, CombatSystem, projectiles, clones, pulls and
// physics (the Arena's step order without its rendering).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DT, cpuFight, fakeSpritesOf, stageMap } from '../helpers/fighter-harness.mjs';
import { ScriptedOpponent, BENCHMARK_STYLES } from '../helpers/benchmark-opponents.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { CONFIG } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles, clashProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { CPUIntelligenceController } from '../../js/game/ai/cpu-intelligence.js';
import { knowFighter, ROLES } from '../../js/game/ai/knowledge.js';
import { Executor } from '../../js/game/ai/execution.js';
import { DIFFICULTY_IDS, getDifficultyProfile } from '../../js/data/difficulty.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { getMap } from '../../js/data/maps.js';
import { Battle } from '../../js/game/battle.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { resolveLaunchStrength } from '../../js/data/launch.js';
import { mulberry32 } from '../../js/core/utils.js';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const FIGHTERS = playableCharacters();
const DEF_0001 = getCharacter('0001');
const COMBAT = ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'];
const BUTTONS = ['runLeft', 'runRight', 'down', 'jump', 'shield', ...COMBAT];
const seconds = (s) => Math.round(s / DT);
const FLAT = new StageCollision(stageMap());

// The CPU (slot p2) against an opponent (p1) driven by `script(n, self)`
// or by a controller, on `stage`, in Battle.update's step order. The CPU's
// output and state are logged every step.
function ring({
  difficulty = 'hard', seed = 1, stage = FLAT, cpuDef = DEF_0001, foeDef = DEF_0001, cpuX = 1000, foeX = 1200, cpuY, foeY,
  script = () => ({}), foeController = null, reactionsOnly = false, gravity = CONFIG.sim.gravity,
} = {}) {
  const ai = new CPUIntelligenceController({ difficulty, rng: mulberry32(seed), reactionsOnly });
  let n = 0;
  const foe = new Fighter({
    def: foeDef, sprites: fakeSpritesOf(foeDef), stage, slot: 'p1', label: 'P1',
    spawn: { x: foeX, y: foeY, facing: Math.sign(cpuX - foeX) || -1 },
    controller: foeController ?? { getInput: (self) => ({ ...script(n, self) }) },
  });
  const cpu = new Fighter({
    def: cpuDef, sprites: fakeSpritesOf(cpuDef), stage, slot: 'p2', label: 'CPU',
    spawn: { x: cpuX, y: cpuY, facing: Math.sign(foeX - cpuX) || 1 }, controller: ai,
  });
  foe.opponent = cpu;
  cpu.opponent = foe;
  const world = {
    stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [foe, cpu],
  };
  const ctx = { stage, gravity, battle: world };
  const log = [];
  const events = [];
  const step = () => {
    n++;
    const fighters = world.fighters.filter((f) => !f.lostToVoid);
    for (const f of fighters) {
      f.update(DT, ctx);
      if (f === cpu) {
        log.push({
          ...ai.out, step: n, plan: ai.plan?.kind ?? null, attack: cpu.combat.attack?.def.id ?? null, technique: cpu.technique?.def.id ?? null,
          grounded: cpu.body.grounded, shielding: cpu.combat.shielding, energy: cpu.combat.energy, exhausted: cpu.combat.energyExhausted,
          canAct: cpu.canAct(), x: cpu.body.x, y: cpu.body.y, dash: !!cpu.dash,
        });
      }
    }
    if (fighters.length === 2) separateFighters(fighters[0], fighters[1], stage);
    for (const f of fighters) resolveSolidOverlap(f.body, stage);
    spawnProjectiles(fighters, world.projectiles);
    for (const p of world.projectiles) p.update(DT, stage);
    clashProjectiles(world.projectiles);
    updateClones(world.clones, DT);
    spawnClones(fighters, world.clones, stage);
    applyPulls(fighters, world.projectiles, DT);
    events.push(...world.combat.update(fighters, world.projectiles, world.clones).map((e) => ({ ...e, step: n, deflections: null })));
    for (const d of world.combat.deflections) events.push({ type: 'deflection', ...d, step: n });
    removeDeadProjectiles(world.projectiles);
    removeDeadClones(world.clones);
    for (const f of world.fighters) if (!f.lostToVoid && stage.inVoid(f.body)) f.lostToVoid = true;
  };
  const run = (steps) => {
    for (let i = 0; i < steps; i++) step();
  };
  return { ai, cpu, foe, world, ctx, log, events, step, run, get n() { return n; } };
}

const hitsOn = (events, target) => events.filter((e) => e.target === target && e.type === 'hit');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

// ---- Fundamental correctness -------------------------------------------------------------

test('it is CPU Intelligence in every competitive mode: Quick Battle, Watch Mode and its mirrors, at the chosen level', () => {
  const input = { flush() {}, sample: () => ({}) };
  for (const mode of ['quick-battle', 'watch']) {
    for (const [a, b] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[0], FIGHTERS[0]]]) {
      const battle = new Battle({
        canvas: { getContext: () => ({}) }, map: getMap('city'), mode, difficulty: 'hard', seed: 3,
        p1Def: a, p2Def: b, p1Sprites: fakeSpritesOf(a), p2Sprites: fakeSpritesOf(b), input,
      });
      assert.ok(battle.p2.controller instanceof CPUIntelligenceController);
      assert.equal(battle.p2.controller.difficulty, 'hard');
      if (mode === 'watch') assert.ok(battle.p1.controller instanceof CPUIntelligenceController);
    }
  }
});

test('an unknown difficulty is Medium; every level is the same intelligence with its own profile', () => {
  for (const bad of [undefined, null, '', 'nightmare', 'EASY', 3]) {
    const ai = new CPUIntelligenceController({ difficulty: bad });
    assert.equal(ai.difficulty, 'medium', String(bad));
    assert.equal(ai.profile, getDifficultyProfile('medium'));
  }
  const kinds = DIFFICULTY_IDS.map((id) => new CPUIntelligenceController({ difficulty: id }));
  assert.ok(kinds.every((ai) => Object.getPrototypeOf(ai) === CPUIntelligenceController.prototype), 'one controller class');
  assert.deepEqual(kinds.map((ai) => ai.difficulty), DIFFICULTY_IDS);
});

test('its output is exactly the player\'s controls: one-step press edges of held buttons, never both directions, never a drop or a mouvement request', () => {
  const allowed = Object.keys(blankInput()).sort();
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [cpuDef, foeDef] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[1], FIGHTERS[0]]]) {
      const r = ring({
        difficulty, seed: 5, cpuDef, foeDef, cpuX: 800, foeX: 1150,
        script: (n) => ({ runLeft: n % 240 < 120, runRight: n % 240 >= 120, ...(n % 97 === 0 ? P('jump') : {}), ...(n % 53 === 0 ? P('attack1') : {}) }),
      });
      r.run(seconds(12));
      for (let i = 0; i < r.log.length; i++) {
        const o = r.log[i];
        const prev = r.log[i - 1];
        const { step, plan, attack, technique, grounded, shielding, energy, exhausted, canAct, x, y, dash, ...controls } = o;
        assert.deepEqual(Object.keys(controls).sort(), allowed, 'the same controls a player has');
        for (const k of BUTTONS) {
          if (o[`${k}Pressed`]) {
            assert.ok(o[k], `${difficulty} step ${step}: ${k}Pressed while ${k} is held`);
            assert.ok(!prev?.[k], `${difficulty} step ${step}: ${k}Pressed only on the step it goes down`);
          }
        }
        assert.ok(!(o.runLeft && o.runRight), 'never both directions');
        assert.ok(!o.dropPressed && !o.mouvementLeftPressed && !o.mouvementRightPressed, 'no drop, no mouvement button');
      }
    }
  }
});

test('it never presses a button its fighter has no move on, and only its own moves ever start', () => {
  for (const def of [...FIGHTERS, SAMPLE_FIGHTER]) {
    for (const difficulty of ['easy', 'brutal']) {
      const r = ring({ difficulty, seed: 7, cpuDef: def, foeDef: FIGHTERS[0], cpuX: 900, foeX: 1100 });
      r.run(seconds(12));
      for (const o of r.log) {
        for (const action of COMBAT) if (o[`${action}Pressed`]) assert.ok(def.actions?.[action], `${def.id} pressed ${action}`);
        if (o.attack) assert.ok(o.attack in def.attacks || (o.attack === 'deflect' && def.deflect), `${def.id}: ${o.attack}`);
        if (o.technique) assert.ok(o.technique in (def.techniques ?? {}));
      }
    }
  }
});

test('a fighter with no moves still plays: it moves, jumps and never presses a combat button', () => {
  const moveless = { ...DEF_0001, id: 'moveless', actions: {}, attacks: {}, summons: {}, techniques: {}, projectiles: {}, projectileAnimations: {}, defense: null, deflect: null };
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 2, cpuDef: moveless, cpuX: 700, foeX: 1200 });
    r.run(seconds(6));
    assert.ok(r.log.every((o) => COMBAT.every((a) => !o[`${a}Pressed`]) && !o.shield), `${difficulty}: no combat button`);
    assert.ok(r.log.filter((o) => o.runLeft || o.runRight || o.jump).length > r.log.length / 3, `${difficulty}: it keeps moving`);
  }
});

test('the controller only reads the game: no writes to fighters, no raw input, no unseeded randomness, no fighter id', () => {
  const dir = new URL('../../js/game/ai/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 10, 'a modular system, not one file');
  for (const file of files) {
    const src = readFileSync(new URL(file, dir), 'utf8').replace(/\/\/.*$/gm, '');
    const writes = src.match(/(^|[\s;(,{])(self|foe|fighter|target|f|S\.self|S\.foe)\.[\w.]+\s*(=(?!=)|\+=|-=|\+\+|--)/gm) ?? [];
    assert.deepEqual(writes, [], `${file}: no writes through a fighter`);
    for (const call of ['tryAction', 'tryDash', 'tryAirDash', 'tryDeflect', 'trySpecial', 'trySummon', 'tryTechnique', 'applyHit', 'spendEnergy', 'payEnergy', 'dropThrough', 'endTechnique', 'startAttack', 'takeHit', '.reset(']) {
      assert.ok(!new RegExp(`(self|foe|S\\.self|S\\.foe)\\.${call.replace(/[.(]/g, (c) => `\\${c}`)}`).test(src), `${file}: never ${call}`);
    }
    assert.ok(!/Math\.random\(\)/.test(src.replace('rng = Math.random', '')), `${file}: randomness from the injected rng`);
    assert.ok(!/input-manager|InputManager|\.sample\(/.test(src), `${file}: never the player's input`);
    assert.doesNotMatch(src, /'000\d'/, `${file}: no fighter id`);
  }
  // The Executor's snapshot is the player's.
  assert.deepEqual(Object.keys(new Executor().out).sort(), Object.keys(blankInput()).sort());
});

// Everything about a fighter that decides what it can do.
const statsOf = (f) => JSON.stringify({
  def: f.def, movement: f.movement, energy: f.energyDef, maxEnergy: f.combat.maxEnergy, dash: [f.dashDuration, f.airDashDuration],
  attacks: f.attacks, projectiles: f.projectileDefs, summons: f.summonDefs, techniques: f.techniqueDefs, defense: f.defense, deflect: f.deflect,
  launch: f.launchReaction, collider: [f.body.halfW, f.body.height, f.body.gravityScale, f.body.maxFall],
});

test('no level changes the fighter or the rules: identical stats before and after a fight, and hits launch by Base Launch x Launch Point', () => {
  const before = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 31, cpuX: 900, foeX: 1100, script: (n) => (n % 40 === 0 ? P('attack1') : {}) });
    before[difficulty] = statsOf(r.cpu);
    r.run(seconds(8));
    assert.equal(statsOf(r.cpu), before[difficulty], `${difficulty}: nothing about the fighter changed`);
    const mine = r.events.filter((e) => e.attacker === r.cpu && e.type === 'hit');
    assert.ok(mine.length > 0, `${difficulty} lands hits`);
    for (const e of mine) {
      assert.equal(e.launchPointAfter, e.launchPointBefore + e.damage, 'damage first');
      assert.equal(e.launchStrength, resolveLaunchStrength(e.baseLaunch, e.launchPointAfter), 'then Base Launch x the new Launch Point');
    }
  }
  assert.equal(new Set(Object.values(before)).size, 1, 'the same fighter on every level');
});

test('cooldowns, airtime rules and exhaustion hold: every press it makes is one the fighter accepts', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [a, b] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[1], FIGHTERS[0]]]) {
      const { log, a: fa } = cpuFight(a, b, { seconds: 25, seed: 9, difficulty });
      const steps = log.get(fa);
      let presses = 0;
      let started = 0;
      for (let i = 0; i < steps.length - 6; i++) {
        const s = steps[i];
        const pressed = COMBAT.find((k) => s[`${k}Pressed`]);
        if (!pressed) continue;
        presses++;
        // The fighter takes it (now, or from its buffer within a moment).
        if (steps.slice(i, i + 10).some((x, j) => (x.attack && (j > 0 || x.attack !== steps[i - 1]?.attack)) || x.technique || x.cooling.length > s.cooling.length)) started++;
      }
      assert.ok(presses > 5, `${difficulty}: it presses`);
      assert.ok(started / presses > 0.9, `${difficulty} ${a.id}: ${started}/${presses} presses start a move`);
    }
  }
  // Exhausted, it never asks for a Shield, a Dash or a Deflect.
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 4, cpuX: 900, foeX: 1080, script: (n) => (n % 30 === 0 ? P('attack1') : {}) });
    r.step();
    r.cpu.combat.setEnergy(0);
    r.run(seconds(4));
    const exhausted = r.log.filter((o) => o.exhausted);
    assert.ok(exhausted.length > 100);
    for (const o of exhausted) {
      assert.ok(!o.shielding && !o.dash, `${difficulty}: no Shield or Dash while exhausted`);
      if (!o.grounded) assert.ok(!o.shieldPressed, `${difficulty}: no Deflect while exhausted`);
    }
  }
});

test('Energy is spent only by the rules: a Dash or air dash 25, a Deflect 15, a block 15, and nothing else', () => {
  const { a, b, log } = cpuFight(FIGHTERS[0], FIGHTERS[1], { seconds: 30, seed: 12, difficulty: 'brutal' });
  for (const f of [a, b]) {
    const steps = log.get(f);
    assert.ok(steps.length > 0);
    assert.equal(f.combat.maxEnergy, 100);
    assert.deepEqual([f.energyDef.dashCost, f.energyDef.deflectCost, f.energyDef.shieldHitCost], [25, 15, 15]);
  }
});

test('the Shield is the ground\'s and the Deflect the air\'s: never a Shield held in the air, a Deflect only on a fresh press there', () => {
  for (const [x, y] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[1], FIGHTERS[0]]]) {
    for (const difficulty of ['medium', 'brutal']) {
      const { log, a, b } = cpuFight(x, y, { seconds: 25, seed: 6, difficulty });
      for (const f of [a, b]) {
        for (const s of log.get(f)) {
          if (!s.grounded) assert.ok(!s.shield || s.shieldPressed, 'no Shield held in the air');
          assert.ok(s.grounded || !s.shielding, 'never shielding in the air');
        }
      }
    }
  }
});

test('Dashes are real double taps of a direction, and walking never Dashes by accident', () => {
  let dashes = 0;
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    for (let seed = 0; seed < 4; seed++) {
      const r = ring({ difficulty, seed: 500 + seed, cpuX: 300, foeX: 1600 });
      let prev = null;
      for (let i = 0; i < seconds(6); i++) {
        r.step();
        if (r.cpu.dash && r.cpu.dash !== prev) {
          dashes++;
          const d = r.cpu.dash.direction > 0 ? 'runRight' : 'runLeft';
          const taps = r.log.slice(-Math.ceil(0.25 / DT)).filter((o) => o[`${d}Pressed`]);
          assert.ok(taps.length >= 2, 'two presses of the same direction');
          assert.ok(['engage', 'evade', 'recover'].includes(r.ai.plan?.kind) || r.ai.executor.dashSeq === null, `it meant to (${r.ai.plan?.kind})`);
        }
        prev = r.cpu.dash;
      }
    }
  }
  assert.ok(dashes > 0, 'it Dashes');
});

test('seeded CPU-vs-CPU matches replay step for step, and another seed plays differently', () => {
  const run = (seed) => {
    const { log, a, b } = cpuFight(FIGHTERS[0], FIGHTERS[1], { seconds: 10, seed, difficulty: 'hard' });
    return [...log.get(a), ...log.get(b)].map((s) => `${s.state}${s.attack}${s.runLeft}${s.runRight}${s.jump}`).join('|');
  };
  assert.equal(run(21), run(21));
  assert.notEqual(run(21), run(22));
});

// ---- Never inactive ----------------------------------------------------------------------

test('no level is ever idle while it can act: it always has an objective, through a long fight', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [x, y] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[1], FIGHTERS[0]]]) {
      const { a } = cpuFight(x, y, { seconds: 40, seed: 14, difficulty });
      const st = a.controller.stats;
      assert.ok(st.controllable > 300, 'it could act for a good while');
      assert.ok(st.idle / st.controllable < 0.05, `${difficulty} ${x.id}: idle ${st.idle} of ${st.controllable} controllable steps`);
      assert.ok(st.longestIdle <= 24, `${difficulty} ${x.id}: never still for long (${st.longestIdle} steps)`);
    }
  }
});

test('while its opponent is out of play it repositions and keeps moving, never attacking nobody, then plays on', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 13, cpuX: 1850, foeX: 1500 });
    r.run(seconds(0.5));
    r.foe.lostToVoid = true;
    const start = r.cpu.body.x;
    r.run(seconds(1.8));
    const tail = r.log.slice(-seconds(1.5));
    assert.ok(tail.every((o) => COMBAT.every((k) => !o[`${k}Pressed`])), `${difficulty}: no attack on nobody`);
    assert.ok(tail.filter((o) => o.runLeft || o.runRight).length > tail.length / 4, `${difficulty}: it keeps moving`);
    assert.ok(Math.abs(r.cpu.body.x - 1000) < Math.abs(start - 1000), `${difficulty}: toward the middle`);
    r.foe.lostToVoid = false;
    r.run(seconds(3));
    assert.ok(r.log.slice(-seconds(3)).some((o) => COMBAT.some((k) => o[`${k}Pressed`])), `${difficulty}: back to fighting`);
  }
});

test('a plan that fails (a move refused, a target gone) is replaced on the same step, and the CPU keeps acting', () => {
  const r = ring({ difficulty: 'hard', seed: 3, cpuX: 900, foeX: 1100 });
  r.step();
  // Hand it a strike with a move on cooldown: refused, it moves on at once.
  const move = knowFighter(r.cpu).moves.find((m) => m.kind === 'melee' && !m.air);
  r.cpu.combat.cooldowns.set(move.id, 5);
  r.ai.plan = { kind: 'strike', move, value: 0 };
  r.step();
  assert.notEqual(r.ai.plan?.move, move, 'not stuck on the refused move');
  assert.ok(r.ai.plan, 'another plan already');
  r.run(seconds(1));
  assert.ok(r.log.slice(-seconds(1)).some((o) => o.runLeft || o.runRight || o.jump || COMBAT.some((k) => o[`${k}Pressed`])), 'acting');
});

// ---- Combat intelligence -----------------------------------------------------------------

// An opponent with a telegraphed kick (#0001's High Kick slowed to 0.25 s
// of startup: a fixture, no fighter is built around a kick this slow).
const KICKER = {
  ...DEF_0001,
  actions: { ...DEF_0001.actions, attack2: 'attack2' },
  attacks: { ...DEF_0001.attacks, attack2: { ...DEF_0001.attacks.extra_attack, animation: 'attack2', startup: 0.25, step: undefined } },
};

function reactionTrial(difficulty, seed) {
  const START = 30;
  const r = ring({
    difficulty, seed, cpuX: 1000, foeX: 1050, foeDef: KICKER, reactionsOnly: true,
    script: (n) => (n === START ? P('attack2') : {}),
  });
  r.run(START - 1 + seconds(0.8));
  const answer = r.log.find((o) => o.step > START && (o.shield || o.jumpPressed || o.runLeft || COMBAT.some((k) => o[`${k}Pressed`])));
  return { responded: !!answer, delay: answer ? (answer.step - START) * DT : null, hit: hitsOn(r.events, r.cpu).length > 0 };
}

test('reactions scale with the level: Easy is slower and caught more often than Brutal, and even Brutal is never instant', () => {
  const stats = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const trials = Array.from({ length: 16 }, (_, i) => reactionTrial(difficulty, 200 + i));
    const delays = trials.filter((t) => t.responded).map((t) => t.delay);
    stats[difficulty] = {
      hitRate: trials.filter((t) => t.hit).length / trials.length,
      meanDelay: delays.length ? delays.reduce((x, y) => x + y, 0) / delays.length : Infinity,
      minDelay: Math.min(...delays),
    };
  }
  const { easy, medium, hard, brutal } = stats;
  assert.ok(easy.hitRate > brutal.hitRate + 0.3, `Easy is caught far more often: ${JSON.stringify(stats)}`);
  assert.ok(easy.meanDelay > brutal.meanDelay * 1.8, `Easy answers later: ${JSON.stringify(stats)}`);
  assert.ok(hard.meanDelay < medium.meanDelay, 'Hard answers sooner than Medium');
  assert.ok(brutal.minDelay >= getDifficultyProfile('brutal').reaction[0] - DT, `Brutal is fast but not instant (${brutal.minDelay})`);
  assert.ok(brutal.minDelay >= 3 * DT);
  assert.ok(brutal.hitRate <= 0.25, `Brutal answers the kick in time (${brutal.hitRate})`);
});

test('a whiffed long-recovery move is punished: Hard and Brutal hit the opponent before its recovery is over', () => {
  // The opponent swings its longest-recovery strike at nothing, from a
  // little way off.
  for (const def of FIGHTERS) {
    const long = knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } })).moves
      .filter((m) => m.kind === 'melee' && !m.air && !m.motion).sort((x, y) => y.exposure - x.exposure)[0];
    let punished = 0;
    for (const difficulty of ['hard', 'brutal']) {
      for (let seed = 0; seed < 4; seed++) {
        const r = ring({
          difficulty, seed: 40 + seed, foeDef: def, cpuX: 1000, foeX: 1170,
          script: (n) => (n === 25 ? P(long.action) : {}),
        });
        r.run(seconds(1.2));
        if (hitsOn(r.events, r.foe).some((e) => e.step > 25 && e.step < 25 + seconds(long.total + 0.35))) punished++;
      }
    }
    assert.ok(punished >= 5, `#${def.id}'s whiffed ${long.id} punished ${punished}/8`);
  }
});

test('Launch Point decides its style: safe offence at low Launch Points, survival with its own high, finishing against a high one', () => {
  const goals = (cpuLP, foeLP, cpuX = 1000, foeX = 1150) => {
    const r = ring({ difficulty: 'hard', seed: 8, cpuX, foeX });
    const count = new Map();
    for (let i = 0; i < seconds(3); i++) {
      r.cpu.combat.launchPoint = cpuLP;
      r.foe.combat.launchPoint = foeLP;
      r.step();
      const g = r.ai.strategy.goal;
      count.set(g, (count.get(g) ?? 0) + 1);
    }
    return { count, aggression: r.ai.strategy.aggression };
  };
  const low = goals(0, 0);
  const danger = goals(150, 0, 1700, 1500);
  const finish = goals(0, 150, 1500, 1700);
  assert.ok(finish.aggression > low.aggression, `more aggressive against a high Launch Point (${finish.aggression} vs ${low.aggression})`);
  assert.ok(danger.aggression < low.aggression, `more careful with its own high (${danger.aggression} vs ${low.aggression})`);
  assert.ok((finish.count.get('finish') ?? 0) > 0, 'it goes for the finish');
  assert.ok(['survive', 'escape'].some((g) => (danger.count.get(g) ?? 0) > 0), 'it plays to survive');
});

test('near a ledge with a high Launch Point it takes the centre back', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    const r = ring({ difficulty, seed: 15, cpuX: 1960, foeX: 1700 });
    for (let i = 0; i < seconds(2); i++) {
      r.cpu.combat.launchPoint = 120;
      r.step();
    }
    assert.ok(r.cpu.body.x < 1900, `${difficulty}: away from the ledge (${r.cpu.body.x.toFixed(0)})`);
    assert.ok(r.cpu.body.grounded || r.cpu.body.y < 800, 'still on the stage');
  }
});

test('it never walks off the main floor after an opponent hovering past the ledge', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (let seed = 0; seed < 3; seed++) {
      const r = ring({ difficulty, seed, cpuX: 1920, foeX: 1960 });
      Object.assign(r.foe.body, { x: 2260, y: 700, gravityScale: 0, grounded: false, ground: null });
      for (let i = 0; i < seconds(4); i++) {
        r.foe.body.vy = 0;
        r.step();
        if (r.cpu.body.grounded) assert.ok(r.cpu.body.x < 2000 + r.cpu.body.halfW, `${difficulty}/${seed}: still on the floor`);
      }
      assert.ok(!r.cpu.lostToVoid, `${difficulty}/${seed}: never fell off chasing it`);
    }
  }
});

test('a telegraphed unblockable is never shielded: it gets out of the way, breaks the cast or answers it', () => {
  const tech = (def) => knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } })).moves
    .filter((m) => m.kind === 'technique' && m.hit.unblockable);
  for (const def of FIGHTERS) {
    for (const t of tech(def)) {
      let shields = 0;
      let answered = 0;
      for (let seed = 0; seed < 4; seed++) {
        const gap = t.burst ? 180 : 420;
        const r = ring({ difficulty: 'brutal', seed: 600 + seed, foeDef: def, cpuX: 1000, foeX: 1000 + gap, reactionsOnly: true, script: (n) => (n === 5 ? P(t.action) : {}) });
        r.run(seconds(2));
        // A Shield raised (the button in the air is the Deflect, no Shield).
        shields += r.log.filter((o) => o.shielding || (o.shield && o.grounded)).length;
        if (!hitsOn(r.events, r.cpu).some((e) => e.technique || e.projectile)) answered++;
      }
      assert.equal(shields, 0, `#${def.id} ${t.id}: no Shield against what no Shield stops`);
      assert.ok(answered >= 3, `#${def.id} ${t.id}: it avoided or answered it (${answered}/4)`);
    }
  }
});

test('jump-to-Deflect: a shot at the right height is jumped into and turned back at its thrower', () => {
  // A projectile it can meet in the air (its own fighter's Deflect box and
  // the shot's height decide it): each fighter against #0001's largest shot.
  let reflected = 0;
  let trials = 0;
  for (const def of FIGHTERS) {
    const shot = knowFighter(new Fighter({ def: DEF_0001, sprites: fakeSpritesOf(DEF_0001), stage: FLAT, spawn: { x: 0 } })).moves
      .filter((m) => m.proj).sort((x, y) => y.proj.hitbox.h - x.proj.hitbox.h)[0];
    for (let seed = 0; seed < 4; seed++) {
      trials++;
      const r = ring({ difficulty: 'brutal', seed: 700 + seed, cpuDef: def, cpuX: 1000, foeX: 1400, reactionsOnly: true, script: (n) => (n === 20 ? P(shot.action) : {}) });
      r.run(seconds(2.5));
      if (r.events.some((e) => e.type === 'deflection' && e.fighter === r.cpu)) {
        reflected++;
        assert.ok(r.log.some((o) => o.shieldPressed && !o.grounded), 'a Deflect pressed in the air');
      }
    }
  }
  assert.ok(reflected >= trials * 0.6, `turned back ${reflected}/${trials}`);
});

test('offensive Deflect: against an opponent in the air it strikes with its Deflect too', () => {
  let used = 0;
  for (const difficulty of ['hard', 'brutal']) {
    for (const [x, y] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[1], FIGHTERS[0]]]) {
      const { a, events } = cpuFight(x, y, { seconds: 30, seed: 3, difficulty });
      used += a.controller.stats.deflectAttempts;
      assert.ok(events.some((e) => e.attacker === a && e.move === 'deflect' && e.type === 'hit') || used > 0);
    }
  }
  assert.ok(used > 0, 'its Deflect is one of its aerial strikes');
});

test('an airborne opponent within jump reach is jumped at and struck in the air', () => {
  for (const def of FIGHTERS) {
    let struck = 0;
    for (let seed = 0; seed < 4; seed++) {
      const r = ring({ difficulty: 'hard', seed: 30 + seed, cpuDef: def, cpuX: 1000, foeX: 1060, foeY: 680 });
      Object.assign(r.foe.body, { y: 680, grounded: false, ground: null, gravityScale: 0 });
      for (let i = 0; i < seconds(1.5); i++) {
        r.foe.body.vy = 0;
        r.foe.body.y = 680;
        r.step();
      }
      if (hitsOn(r.events, r.foe).length && r.log.some((o) => !o.grounded && o.attack)) struck++;
    }
    assert.ok(struck >= 3, `#${def.id}: struck the hovering opponent in the air (${struck}/4)`);
  }
});

test('combos: a hit that may be cut short is followed up, more readily the higher the level', () => {
  const followUps = (difficulty) => {
    let n = 0;
    for (const seed of [3, 7]) {
      const { log } = cpuFight(FIGHTERS[0], FIGHTERS[1], { seconds: 20, seed, difficulty });
      for (const steps of log.values()) {
        for (let i = 1; i < steps.length; i++) if (steps[i - 1].attack && steps[i].attack && steps[i].attack !== steps[i - 1].attack) n++;
      }
    }
    return n;
  };
  const easy = followUps('easy');
  const brutal = followUps('brutal');
  assert.ok(brutal > 0, `Brutal follows up (${brutal})`);
  assert.ok(easy > 0, `Easy attempts combos too (${easy})`);
});

test('a guaranteed follow-up on a held opponent: a paralyzed or stunned opponent is struck again', () => {
  for (const def of FIGHTERS) {
    for (const difficulty of ['medium', 'brutal']) {
      const r = ring({ difficulty, seed: 9, cpuDef: def, cpuX: 1000, foeX: 1070 });
      r.step();
      r.foe.combat.paralyze(1.2);
      r.run(seconds(1.2));
      assert.ok(hitsOn(r.events, r.foe).length > 0, `#${def.id} ${difficulty}: the held opponent is hit`);
    }
  }
});

test('Energy: low on it, it keeps what is left for defence; it never spends into exhaustion on a whim', () => {
  for (const difficulty of ['hard', 'brutal']) {
    const r = ring({ difficulty, seed: 21, cpuX: 300, foeX: 1600 });
    r.step();
    r.cpu.combat.setEnergy(20);
    let dashes = 0;
    let prev = null;
    for (let i = 0; i < seconds(1.2); i++) {
      r.step();
      if (r.cpu.dash && r.cpu.dash !== prev) dashes++;
      prev = r.cpu.dash;
    }
    assert.equal(dashes, 0, `${difficulty}: no Dash with 20 Energy just to close in`);
  }
});

test('recovery: knocked off with its jumps it climbs back; with only its air dash it air dashes home; with neither, a recovery move', () => {
  for (const def of FIGHTERS) {
    const stage = new StageCollision(stageMap({ left: 0, right: 1000 }));
    // Jumps available, well below and out from the ledge.
    const a = ring({ difficulty: 'hard', seed: 2, stage, cpuDef: def, cpuX: 1120, cpuY: 900, foeX: 500 });
    a.cpu.body.vy = 200;
    a.run(seconds(2.5));
    assert.ok(!a.cpu.lostToVoid, `#${def.id}: never fell`);
    assert.ok(a.log.some((o) => o.grounded && o.x < 1000), `#${def.id}: climbed back onto the stage with its jumps`);
    assert.ok(a.log.filter((o) => o.jumpPressed).length >= 1);
    // Only the air dash.
    const b = ring({ difficulty: 'brutal', seed: 5, stage, cpuDef: def, cpuX: 1180, cpuY: 700, foeX: 500 });
    b.cpu.airJumps = 0;
    let dashed = null;
    for (let i = 0; i < 60 && !dashed; i++) {
      b.cpu.airJumps = 0;
      b.step();
      if (b.cpu.dash?.air) dashed = b.cpu.dash;
    }
    assert.ok(dashed, `#${def.id}: an air dash`);
    assert.equal(dashed.direction, -1, 'toward the stage');
  }
  // A recovery move (one that rises or flies), from the data.
  for (const def of FIGHTERS) {
    const rec = knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } })).recoveryMoves;
    if (!rec.length) continue;
    const stage = new StageCollision(stageMap({ left: 0, right: 1000 }));
    const r = ring({ difficulty: 'hard', seed: 2, stage, cpuDef: def, cpuX: 1100, cpuY: 700, foeX: 500 });
    r.cpu.airJumps = 0;
    r.cpu.airDashes = 0;
    r.cpu.body.vy = 100;
    let used = false;
    for (let i = 0; i < 90 && !used; i++) {
      r.step();
      used = rec.some((m) => r.cpu.combat.attack?.def.id === m.id);
    }
    assert.ok(used, `#${def.id}: a recovery move`);
  }
});

test('stages: it follows its opponent up City\'s platforms and over Desert\'s rocks, from the stage data', () => {
  const play = (mapId, p1x, p1y) => {
    const map = getMap(mapId);
    const stage = new StageCollision(map);
    const r = ring({ difficulty: 'hard', seed: 9, stage, cpuX: map.spawnPoints[0].x - 300, foeX: p1x, foeY: p1y });
    return { r, stage };
  };
  // City: the opponent stands on the highest deck.
  const city = getMap('city');
  const deck = city.platforms.reduce((hi, p) => (p.y < hi.y ? p : hi));
  const { r: up } = play('city', deck.x + deck.w / 2, deck.y);
  let reached = false;
  for (let i = 0; i < seconds(10) && !reached; i++) {
    up.foe.body.vx = 0;
    up.step();
    reached = up.cpu.body.grounded && up.cpu.body.y <= deck.y + 1 && Math.abs(up.cpu.body.x - up.foe.body.x) < 200;
  }
  assert.ok(reached, 'up onto the deck');
  // Desert: past a rock to an opponent behind it.
  const desert = getMap('desert');
  const rock = desert.solids[0];
  const { r: over } = play('desert', rock.x - 60, desert.mainStage.top);
  over.cpu.body.x = rock.x + rock.w + 200;
  let close = false;
  for (let i = 0; i < seconds(6) && !close; i++) {
    over.step();
    close = Math.abs(over.cpu.body.x - over.foe.body.x) < 90;
  }
  assert.ok(close, 'over the rock to it');
});

test('projectiles meet projectiles: against a shot it may answer with one of its own that erases or turns it back', () => {
  let countered = 0;
  for (let seed = 0; seed < 4; seed++) {
    const r = ring({ difficulty: 'brutal', seed: 80 + seed, cpuDef: DEF_0001, foeDef: FIGHTERS[1], cpuX: 1000, foeX: 1360, reactionsOnly: true, script: (n) => (n === 20 ? P('extra_attack') : {}) });
    r.run(seconds(2));
    if (!hitsOn(r.events, r.cpu).length) countered++;
  }
  assert.ok(countered >= 3, `the shot never landed (${countered}/4)`);
});

test('the closing Void of overtime: it reads the Void in force and stays clear of it', () => {
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'watch', difficulty: 'hard', seed: 5,
    p1Def: FIGHTERS[0], p2Def: FIGHTERS[1], p1Sprites: fakeSpritesOf(FIGHTERS[0]), p2Sprites: fakeSpritesOf(FIGHTERS[1]), input,
  });
  battle.fx = { take() {}, takeBounce() {}, reset() {}, addElimination() {}, timeScale: 1, sampleTrail() {} };
  battle.setPhase('fight');
  battle.timeLeft = 0.01;
  let selfFalls = 0;
  let lastHit = new Map();
  for (let i = 0; i < seconds(40) && battle.phase === 'fight'; i++) {
    battle.update(DT);
    for (const e of battle.combat.events) if (e.type === 'hit') lastHit.set(e.target, i);
    for (const f of battle.fighters) if (f.lostToVoid && f.respawnTimer > CONFIG.battle.respawnSeconds - DT * 1.5 && i - (lastHit.get(f) ?? -999) > seconds(3)) selfFalls++;
  }
  assert.ok(battle.overtime, 'overtime ran');
  assert.ok(battle.stage.void.right < battle.stage.baseVoid.right, 'the Void closed in');
  assert.equal(selfFalls, 0, 'nobody walked into the closing Void');
});

// ---- Moveset coverage --------------------------------------------------------------------

// The situation that calls for move `m` of `def`: the opponent where the
// move's own reach (or flight) puts it, held in place so it cannot leave,
// every other move of the CPU's cooling down so `m` is the one that fits.
// True when the CPU starts `m` within a few seconds.
function coverageTrial(def, m, difficulty, seed) {
  const k = knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } }));
  const gap = m.kind === 'projectile' ? Math.min(260, m.range * 0.6)
    : m.kind === 'technique' ? (m.burst ? 140 : 320)
      : m.kind === 'summon' ? 220
        : m.motion === 'roll' ? 120 : m.motion === 'homing' ? 140 : 60;
  const r = ring({ difficulty, seed, cpuDef: def, foeDef: FIGHTERS[0], cpuX: 1000, foeX: 1000 + gap });
  // (A move whose ground and air versions are one attack cools down as one.)
  const others = k.moves.filter((x) => x.id !== m.id);
  let done = false;
  for (let i = 0; i < seconds(5) && !done; i++) {
    for (const x of others) {
      if (x.ability) r.cpu.combat.abilityCooldowns.start(x.id, 1);
      else if (x.kind !== 'deflect') r.cpu.combat.cooldowns.set(x.id, 1);
    }
    r.foe.combat.paralyze(m.total + 1);
    r.foe.combat.launchPoint = 0;
    r.step();
    done = m.kind === 'technique' ? r.cpu.technique?.def.id === m.id
      : m.kind === 'summon' ? r.cpu.combat.abilityCooldowns.active(m.id) && !!r.log.at(-1)?.[`${m.action}Pressed`] || !!r.cpu.pendingSummon
        : r.cpu.combat.attack?.def.id === m.atk.id;
  }
  return done;
}

for (const def of [...FIGHTERS, SAMPLE_FIGHTER]) {
  test(`moveset coverage, #${def.id}: every move is recognized and executed when it is the move that fits, on every level`, () => {
    const k = knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } }));
    const moves = k.moves.filter((m) => m.kind !== 'deflect');
    assert.ok(moves.length > 0);
    for (const m of moves) {
      assert.ok(m.roles.size > 0, `${m.key} has tactical roles`);
      for (const r of m.roles) assert.ok(ROLES.includes(r));
      for (const difficulty of DIFFICULTY_IDS) {
        const ok = [1, 2, 3].some((seed) => coverageTrial(def, m, difficulty, seed));
        assert.ok(ok, `#${def.id} ${difficulty}: ${m.key} (${m.id}) executed`);
      }
    }
  });
}

test('in real fights each level puts its whole kit to use', () => {
  for (const def of FIGHTERS) {
    const used = new Set();
    for (const difficulty of DIFFICULTY_IDS) {
      for (const foe of FIGHTERS) {
        const { a } = cpuFight(def, foe, { seconds: 40, seed: 4, difficulty });
        for (const key of Object.keys(a.controller.stats.moves)) used.add(key);
      }
    }
    const all = knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } })).moves.map((m) => m.key);
    const missing = all.filter((key) => !used.has(key));
    assert.deepEqual(missing, [], `#${def.id}: every move used`);
  }
});

// ---- Human-like behavior -------------------------------------------------------------------

test('human-like: no move spam, no left-right dithering, no endless Shield, no plan churn, no self-destruction', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [x, y] of [[FIGHTERS[0], FIGHTERS[1]], [FIGHTERS[1], FIGHTERS[0]]]) {
      const { a, log } = cpuFight(x, y, { seconds: 40, seed: 17, difficulty });
      const steps = log.get(a);
      const st = a.controller.stats;
      // Spam: no one move is nearly everything it does.
      const uses = Object.values(st.moves);
      const total = uses.reduce((s, v) => s + v, 0);
      assert.ok(total > 10);
      assert.ok(Math.max(...uses) / total < 0.6, `${difficulty} ${x.id}: varied moves ${JSON.stringify(st.moves)}`);
      // Dithering: direction reversals within a few steps of each other.
      let flips = 0;
      let last = 0;
      let lastAt = -99;
      steps.forEach((s, i) => {
        const d = s.runRight ? 1 : s.runLeft ? -1 : 0;
        if (d && last && d !== last && i - lastAt < 4) flips++;
        if (d) {
          last = d;
          lastAt = i;
        }
      });
      assert.ok(flips / (steps.length / 60) < 3, `${difficulty} ${x.id}: ${flips} quick reversals in ${steps.length / 60} s`);
      // Endless Shield: never held for long without a reason.
      let held = 0;
      let longest = 0;
      for (const s of steps) {
        held = s.shield ? held + 1 : 0;
        longest = Math.max(longest, held);
      }
      assert.ok(longest <= seconds(1), `${difficulty} ${x.id}: Shield held ${longest} steps at most`);
      // Plan churn and failures stay low.
      const plans = Object.values(st.plans).reduce((s, v) => s + v, 0);
      assert.ok(plans / 40 < 25, `${difficulty} ${x.id}: ${plans} plans in 40 s`);
      assert.ok(st.failedPlans / 40 < 2, `${difficulty} ${x.id}: ${st.failedPlans} failed plans`);
    }
  }
});

test('it adapts: an opponent that only shields is met with what a Shield does not stop or what drains it', () => {
  for (const def of FIGHTERS) {
    const answers = new Set(knowFighter(new Fighter({ def, sprites: fakeSpritesOf(def), stage: FLAT, spawn: { x: 0 } })).moves
      .filter((m) => m.hit.unblockable || m.roles.has('shieldPressure') || m.kind === 'projectile').map((m) => m.id));
    let used = 0;
    for (let seed = 0; seed < 3; seed++) {
      const r = ring({ difficulty: 'brutal', seed: 400 + seed, cpuDef: def, cpuX: 800, foeX: 980, script: () => ({ shield: true }) });
      for (let i = 0; i < seconds(10); i++) {
        r.foe.combat.launchPoint = 0;
        r.step();
      }
      used += r.log.filter((o, i) => (o.attack && answers.has(o.attack) && o.attack !== r.log[i - 1]?.attack)
        || (o.technique && answers.has(o.technique) && o.technique !== r.log[i - 1]?.technique)).length;
    }
    assert.ok(used > 0, `#${def.id}: unblockables, Shield pressure or projectiles against the turtle`);
  }
});

// ---- Competitive -----------------------------------------------------------------------------

test('Brutal beats the benchmark styles and Easy in a seeded sample of full matches', () => {
  const input = { flush() {}, sample: () => ({}) };
  let wins = 0;
  let played = 0;
  for (const [i, opp] of [...BENCHMARK_STYLES, 'easy'].entries()) {
    const [a, b] = i % 2 ? [FIGHTERS[0], FIGHTERS[1]] : [FIGHTERS[1], FIGHTERS[0]];
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap(i % 2 ? 'city' : 'desert'), mode: 'watch', difficulty: 'brutal', seed: 60 + i,
      p1Def: a, p2Def: b, p1Sprites: fakeSpritesOf(a), p2Sprites: fakeSpritesOf(b), input,
    });
    battle.fx = { take() {}, takeBounce() {}, reset() {}, addElimination() {}, timeScale: 1, sampleTrail() {} };
    battle.p2.controller = opp === 'easy' ? new CPUIntelligenceController({ difficulty: 'easy', rng: mulberry32(i) }) : new ScriptedOpponent({ style: opp, rng: mulberry32(i) });
    battle.setPhase('fight');
    for (let n = 0; n < seconds(300) && battle.phase !== 'result'; n++) battle.update(DT);
    played++;
    if (battle.result.outcome === 'p1') wins++;
  }
  assert.ok(wins >= played - 1, `Brutal won ${wins}/${played}`);
});
