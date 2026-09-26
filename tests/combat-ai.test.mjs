// Run with node --test tests/combat-ai.test.mjs (no dependencies).
// Quick Battle's combat AI (js/game/combat-ai.js): it fights through the
// same inputs a player has (attacks, Throw, Shield, Charge and charged
// actions, Dash, jumps), reacts late on low levels and early (never
// instantly) on high ones, reassesses faster the higher it goes, keeps off
// the Void's edge, waits while its opponent is out, and never touches a
// fighter's stats. Deterministic: every CPU gets a seeded RNG. Runs the real
// Fighter, CombatSystem, projectiles, clones and physics in a small "ring"
// (the Arena's step order without its rendering).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { def, DT, fakeSprites, stageMap } from './fighter-harness.mjs';
import { CONFIG } from '../js/config.js';
import { Fighter } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../js/game/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../js/game/clone.js';
import { StageCollision, separate, resolveSolidOverlap } from '../js/game/physics.js';
import { CombatAIController, readMoveset } from '../js/game/combat-ai.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { DIFFICULTY_IDS, getDifficultyProfile } from '../js/data/difficulty.js';
import { mulberry32 } from '../js/core/utils.js';

const BUTTONS = ['left', 'right', 'charge', 'jump', 'defense', 'primary', 'special', 'action1', 'action2'];
const COMBAT = ['primary', 'special', 'action1', 'action2'];

// A flat main floor from x 0 to 2000 (top 800), and one with a platform a
// jump above the floor.
const FLAT = new StageCollision(stageMap());
const RAISED = new StageCollision(stageMap({ platforms: [{ id: 'deck', x: 1300, y: 670, w: 240, h: 16 }] }));

// Two fighters in play: the CPU (slot p2) driven by the combat AI, and a
// scripted opponent (p1) whose `script(step, fighter)` returns its input.
// `world` stands in for the Arena as ctx.battle (projectiles, clones, the
// combat system's events, the score and the clock). The AI's output is
// logged every step.
function ring({
  difficulty = 'medium', seed = 1, stage = FLAT, cpuX = 1000, foeX = 1200, foeY, script = () => ({}),
  cpuFacing = Math.sign(foeX - cpuX) || 1, foeFacing = -cpuFacing,
} = {}) {
  const sprites = fakeSprites();
  const ai = new CombatAIController({ difficulty, rng: mulberry32(seed) });
  let n = 0;
  const foe = new Fighter({
    def, sprites, stage, slot: 'p1', label: 'P1', spawn: { x: foeX, y: foeY, facing: foeFacing },
    controller: { getInput: (self) => ({ ...script(n, self) }) },
  });
  const cpu = new Fighter({ def, sprites, stage, slot: 'p2', label: 'CPU', spawn: { x: cpuX, facing: cpuFacing }, controller: ai });
  foe.opponent = cpu;
  cpu.opponent = foe;
  const world = {
    stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [foe, cpu],
  };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  const log = [];
  const events = [];
  const step = () => {
    n++;
    const fighters = world.fighters.filter((f) => !f.lostToVoid);
    for (const f of fighters) {
      f.update(DT, ctx);
      if (f === cpu) log.push({ ...ai.out, step: n, intent: ai.intent?.kind ?? null });
    }
    if (fighters.length === 2) {
      separate(fighters[0].body, fighters[1].body, def.pushbox.width / 2, def.pushbox.width / 2, stage);
    }
    for (const f of fighters) resolveSolidOverlap(f.body, stage);
    spawnProjectiles(fighters, world.projectiles);
    for (const p of world.projectiles) p.update(DT, stage);
    updateClones(world.clones, DT);
    spawnClones(fighters, world.clones, stage);
    events.push(...world.combat.update(fighters, world.projectiles, world.clones).map((e) => ({ ...e, step: n })));
    removeDeadProjectiles(world.projectiles);
    removeDeadClones(world.clones);
  };
  const run = (steps) => {
    for (let i = 0; i < steps; i++) step();
  };
  // Binds the controller to its fighter (its first step starts it fresh)
  // and pauses its own neutral decisions: from here only the events it
  // takes in (or an intent a test gives it) make it act.
  const hush = () => {
    step();
    ai.thinkTimer = Infinity;
  };
  return { ai, cpu, foe, world, ctx, log, events, step, run, hush, get n() { return n; } };
}

const seconds = (s) => Math.round(s / DT);
const hitsOn = (events, target) => events.filter((e) => e.target === target && e.type === 'hit');

// ---- Fighting through the input pipeline ----------------------------------------

test('every level fights: it presses real attack buttons, its fighter attacks through them and the hits land', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    // A standing opponent just inside striking distance.
    const r = ring({ difficulty, seed: 3, cpuX: 1000, foeX: 1050 });
    r.run(seconds(6));
    const presses = r.log.filter((o) => COMBAT.some((a) => o[`${a}Pressed`]));
    assert.ok(presses.length >= 3, `${difficulty} presses attack buttons (${presses.length})`);
    const landed = r.events.filter((e) => e.attacker === r.cpu && e.type === 'hit');
    assert.ok(landed.length >= 2, `${difficulty} lands hits (${landed.length})`);
    // Every one of those hits is a move its fighter really has.
    for (const e of landed) assert.ok(e.move, 'a named move');
    assert.ok(r.foe.combat.launchPoint > 0, `${difficulty}: the opponent's Launch Point went up`);
  }
});

test('it never presses a reserved button, and never drops through a platform', () => {
  assert.equal(def.actions.special, null, '#0001\'s Special is reserved');
  const moves = readMoveset(new Fighter({ def, sprites: fakeSprites(), stage: FLAT, spawn: { x: 100 } }));
  // Read from the fighter's own data: Throw, BA1 and BA2 on the ground and
  // in the air as mapped, both charged actions, the Shield and the Dash.
  assert.deepEqual(moves.melee.map((m) => m.id).sort(), ['ba1', 'ba2', 'midairBa1', 'midairBa2']);
  assert.deepEqual(moves.ranged.map((m) => [m.id, m.air]), [['throw', false]], 'Throw is ground only');
  assert.deepEqual(moves.charged.map((c) => [c.action, c.type]), [['action1', 'summon'], ['action2', 'technique']]);
  assert.equal(moves.shield, true);
  assert.ok(moves.dash.distance > 0);
  assert.ok([...moves.melee, ...moves.ranged, ...moves.charged].every((m) => m.action !== 'special'));
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 11, stage: RAISED, cpuX: 900, foeX: 1400 });
    r.run(seconds(12));
    assert.ok(r.log.every((o) => !o.special && !o.specialPressed), `${difficulty}: Special never pressed`);
    assert.ok(r.log.every((o) => !o.dropPressed), `${difficulty}: no platform drop (no player control has one)`);
  }
});

test('press edges last exactly one step, and every press is of a held button', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    // A busy opponent: it walks back and forth, jumps and swings now and then.
    const script = (n, self) => ({
      left: n % 240 < 120, right: n % 240 >= 120,
      jump: n % 97 === 0, jumpPressed: n % 97 === 0,
      action1: n % 53 === 0, action1Pressed: n % 53 === 0,
      primary: n % 71 === 0, primaryPressed: n % 71 === 0,
    });
    const r = ring({ difficulty, seed: 5, cpuX: 700, foeX: 1100, script });
    r.run(seconds(20));
    for (let i = 0; i < r.log.length; i++) {
      const o = r.log[i];
      const prev = r.log[i - 1];
      for (const k of BUTTONS) {
        if (o[`${k}Pressed`]) {
          assert.ok(o[k], `${difficulty} step ${o.step}: ${k}Pressed while ${k} is held`);
          assert.ok(!prev?.[k], `${difficulty} step ${o.step}: ${k}Pressed only on the step it goes down`);
        }
      }
      assert.ok(!(o.left && o.right), 'never both directions');
    }
  }
});

// ---- Defense and reaction ---------------------------------------------------------

// The opponent, 50 units away and facing the CPU, starts Basic Attack 2 on
// step 30 (0.25 s of startup before its kick can land). The CPU's own
// neutral thinking is paused, so only its reaction to the attack acts: how
// soon it answers (Defense held, a jump, or a step away) and whether the
// kick lands.
function reactionTrial(difficulty, seed) {
  const START = 30;
  const script = (n) => (n === START ? { action2: true, action2Pressed: true } : {});
  const r = ring({ difficulty, seed, cpuX: 1000, foeX: 1050, script });
  r.hush();
  r.run(START - 1 + seconds(0.8));
  const away = 'left';
  const answer = r.log.find((o) => o.step > START && (o.defense || o.jumpPressed || o[away]));
  return {
    responded: !!answer,
    delay: answer ? (answer.step - START) * DT : null,
    hit: hitsOn(r.events, r.cpu).length > 0,
    shielded: r.events.some((e) => e.target === r.cpu && e.type === 'block'),
  };
}

test('it answers a telegraphed attack (Shield, a jump or a step away), and the kick misses or is blocked', () => {
  const trials = Array.from({ length: 12 }, (_, i) => reactionTrial('brutal', 100 + i));
  const safe = trials.filter((t) => !t.hit).length;
  assert.ok(safe >= 10, `Brutal answers BA2 in time (${safe}/12)`);
  // With its back to the ledge there is nowhere to step: it Shields.
  let shielded = 0;
  for (let seed = 0; seed < 8; seed++) {
    const script = (n) => (n === 30 ? { action2: true, action2Pressed: true } : {});
    const r = ring({ difficulty: 'hard', seed: 150 + seed, cpuX: 1975, foeX: 1925, script });
    r.hush();
    r.run(29 + seconds(0.8));
    if (r.events.some((e) => e.target === r.cpu && e.type === 'block')) shielded++;
    assert.ok(r.cpu.body.x < 2000, 'not off the edge');
  }
  assert.ok(shielded >= 4, `cornered, the Shield is its answer (${shielded}/8)`);
});

test('reactions scale with difficulty: Easy is slower and less reliable than Brutal, and even Brutal is never instant', () => {
  const stats = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const trials = Array.from({ length: 24 }, (_, i) => reactionTrial(difficulty, 200 + i));
    const delays = trials.filter((t) => t.responded).map((t) => t.delay);
    stats[difficulty] = {
      hitRate: trials.filter((t) => t.hit).length / trials.length,
      meanDelay: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : Infinity,
      minDelay: Math.min(...delays),
    };
  }
  const { easy, medium, hard, brutal } = stats;
  assert.ok(easy.hitRate > brutal.hitRate + 0.4, `Easy is caught far more often (${easy.hitRate} vs ${brutal.hitRate})`);
  assert.ok(easy.hitRate >= medium.hitRate && medium.hitRate >= hard.hitRate && hard.hitRate >= brutal.hitRate,
    `caught less often level by level: ${JSON.stringify(stats)}`);
  assert.ok(easy.meanDelay > brutal.meanDelay * 2, `Easy answers later (${easy.meanDelay} vs ${brutal.meanDelay})`);
  assert.ok(hard.meanDelay < medium.meanDelay, 'Hard answers sooner than Medium');
  // Never on the step it starts: at least Brutal's shortest reaction.
  assert.ok(brutal.minDelay >= getDifficultyProfile('brutal').react[0] - DT, `Brutal is fast but not instant (${brutal.minDelay})`);
  assert.ok(brutal.minDelay >= 2 * DT);
});

test('harder levels answer an incoming shuriken more often', () => {
  const caught = {};
  for (const difficulty of ['easy', 'brutal']) {
    caught[difficulty] = 0;
    for (let seed = 0; seed < 12; seed++) {
      // Thrown from 420 units: about half a second of flight.
      const script = (n) => (n === 20 ? { primary: true, primaryPressed: true } : {});
      const r = ring({ difficulty, seed: 300 + seed, cpuX: 1000, foeX: 1420, script });
      r.hush();
      r.run(seconds(1.2));
      if (hitsOn(r.events, r.cpu).some((e) => e.projectile)) caught[difficulty]++;
    }
  }
  assert.ok(caught.brutal < caught.easy, `Brutal avoids more shurikens (${caught.brutal} vs ${caught.easy} of 12 hit)`);
});

// ---- Movement and the stage ----------------------------------------------------

test('it closes in on a distant opponent', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 7, cpuX: 300, foeX: 1500 });
    r.run(seconds(6));
    const dist = Math.abs(r.foe.body.x - r.cpu.body.x);
    assert.ok(dist < 400, `${difficulty} got closer (${dist.toFixed(0)} from 1200)`);
  }
});

test('it follows its opponent up onto a platform', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    // The opponent stands on the deck, 130 units over the floor.
    const r = ring({ difficulty, seed: 9, stage: RAISED, cpuX: 900, foeX: 1420, foeY: 600 });
    assert.equal(r.foe.body.ground.id, 'deck');
    let up = false;
    for (let i = 0; i < seconds(8) && !up; i++) {
      r.step();
      up = r.cpu.body.grounded && r.cpu.body.ground?.id === 'deck';
    }
    assert.ok(up, `${difficulty} reached the deck`);
  }
});

test('it stands still while its opponent is lost to the Void, then plays on', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 13, cpuX: 800, foeX: 1300 });
    r.run(seconds(0.5));
    r.foe.lostToVoid = true;
    const x = r.cpu.body.x;
    r.run(seconds(1.5));
    const tail = r.log.slice(-seconds(1.2));
    assert.ok(tail.every((o) => !o.left && !o.right && !o.jump), `${difficulty} does not chase`);
    assert.ok(tail.every((o) => COMBAT.every((a) => !o[`${a}Pressed`])), `${difficulty} does not attack nobody`);
    assert.ok(Math.abs(r.cpu.body.x - x) < 25, 'it stays put');
    r.foe.lostToVoid = false;
    r.run(seconds(3));
    assert.ok(r.log.slice(-seconds(3)).some((o) => o.left || o.right || COMBAT.some((a) => o[`${a}Pressed`])), 'back to fighting');
  }
});

test('it never walks off the main floor after an opponent hovering past the ledge', () => {
  const right = 2000;
  for (const difficulty of DIFFICULTY_IDS) {
    for (let seed = 0; seed < 4; seed++) {
      const r = ring({ difficulty, seed, cpuX: right - 80, foeX: right - 40 });
      // The opponent hangs in the air out past the east ledge.
      Object.assign(r.foe.body, { x: right + 260, y: 700, gravityScale: 0, grounded: false, ground: null });
      for (let i = 0; i < seconds(5); i++) {
        r.foe.body.vy = 0;
        r.step();
        assert.ok(r.cpu.body.x <= right + 1, `${difficulty}/${seed}: still over the floor at step ${i}`);
      }
      assert.equal(r.cpu.body.grounded, true);
      assert.ok(r.cpu.body.x > right - 200, 'it waits near the edge rather than running off');
    }
  }
});

test('a walk toward the ledge stops at it', () => {
  const r = ring({ difficulty: 'easy', seed: 1, cpuX: 1900, foeX: 1500 });
  r.hush();
  r.ai.setIntent({ kind: 'move', dir: 1, until: Infinity });
  r.run(seconds(2));
  assert.equal(r.cpu.body.grounded, true, 'still standing');
  assert.equal(r.cpu.body.ground, FLAT.floor);
  assert.ok(r.cpu.body.x > 1950 && r.cpu.body.x < 2000, `stopped at the edge (${r.cpu.body.x.toFixed(1)})`);
  assert.ok(r.log.slice(-10).every((o) => !o.right), 'no longer holding toward it');
});

// ---- Charge, charged actions, Dash --------------------------------------------------

test('it holds Charge over several steps, then presses the charged action with Charge still held', () => {
  const r = ring({ difficulty: 'hard', seed: 17, cpuX: 600, foeX: 1300 });
  r.hush();
  const summon = readMoveset(r.cpu).charged.find((c) => c.type === 'summon');
  assert.ok(summon, '#0001\'s Charged BA1 is a summon');
  // It plans to look again a moment in: Charge has to be kept up until then.
  r.ai.setIntent({ kind: 'charge', then: summon, face: 0, danger: 0, checkAt: r.ai.clock + 0.2, until: Infinity });
  r.ai.intent.keepUntil = Infinity;
  r.run(seconds(1));
  const log = r.log.slice(1);
  const press = log.findIndex((o) => o[`${summon.action}Pressed`]);
  assert.ok(press >= seconds(0.2) - 1, `pressed only after charging for a while (step ${press})`);
  assert.ok(log.slice(0, press + 1).every((o) => o.charge), 'Charge held from the start through the press');
  assert.equal(log.filter((o) => o.chargePressed).length, 1, 'one Charge press, then held');
  assert.equal(r.world.clones.length, 1, 'the clone came from the fighter\'s own summon');
  assert.ok(r.cpu.combat.chargedCooldowns.active(summon.id), 'its cooldown runs');
  // It does not press it again while cooling down.
  r.run(seconds(1.5));
  assert.equal(r.log.filter((o) => o[`${summon.action}Pressed`]).length, 1);
  assert.ok(r.cpu.combat.chargedCooldowns.active(summon.id));
});

test('left to itself, a high level uses Charge and charged actions', () => {
  let charged = 0;
  let clones = 0;
  let rushes = 0;
  for (let seed = 0; seed < 6; seed++) {
    // A far opponent that keeps charging.
    const r = ring({ difficulty: 'brutal', seed: 400 + seed, cpuX: 500, foeX: 1100, script: () => ({ charge: true }) });
    let tech = null;
    for (let i = 0; i < seconds(10); i++) {
      r.step();
      if (r.cpu.charging) charged++;
      if (r.cpu.technique && r.cpu.technique !== tech) rushes++;
      tech = r.cpu.technique;
    }
    clones += new Set(r.events.filter((e) => e.summon && e.attacker === r.cpu).map((e) => e.summon)).size +
      (r.cpu.combat.chargedCooldowns.active('ba1Clone') ? 1 : 0);
  }
  assert.ok(charged > 60, `it charges (${charged} steps)`);
  assert.ok(clones + rushes > 0, `and uses a charged action (${clones} clones, ${rushes} rushes)`);
});

test('Dash is a double tap of a direction on the levels that use it, and never an accident', () => {
  let dashes = 0;
  for (let seed = 0; seed < 6; seed++) {
    const r = ring({ difficulty: 'brutal', seed: 500 + seed, cpuX: 300, foeX: 1500 });
    let prev = null;
    for (let i = 0; i < seconds(6); i++) {
      r.step();
      if (r.cpu.dash && r.cpu.dash !== prev) {
        dashes++;
        const d = r.cpu.dash.direction > 0 ? 'right' : 'left';
        // The tap before this one, within the tap window: a real double tap.
        const taps = r.log.slice(-seconds(0.25)).filter((o) => o[`${d}Pressed`]);
        assert.ok(taps.length >= 2, 'two presses of the same direction');
        assert.equal(r.ai.intent?.kind, 'dash', 'it meant to');
      }
      prev = r.cpu.dash;
    }
  }
  assert.ok(dashes > 0, 'Brutal dashes');
  const easy = ring({ difficulty: 'easy', seed: 1, cpuX: 300, foeX: 1500 });
  let easyDash = false;
  for (let i = 0; i < seconds(8); i++) {
    easy.step();
    easyDash ||= !!easy.cpu.dash;
  }
  assert.equal(easyDash, false, 'Easy never dashes');
});

// ---- Cadence, difficulty and fairness -------------------------------------------------

test('higher levels reassess more often', () => {
  const thinks = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 21, cpuX: 700, foeX: 1300 });
    let count = 0;
    const think = r.ai.think.bind(r.ai);
    r.ai.think = (...args) => {
      count++;
      return think(...args);
    };
    r.run(seconds(10));
    thinks[difficulty] = count;
  }
  assert.ok(thinks.hard > thinks.easy * 2, JSON.stringify(thinks));
  assert.ok(thinks.brutal > thinks.hard && thinks.hard > thinks.medium && thinks.medium > thinks.easy, JSON.stringify(thinks));
});

test('an unknown difficulty is Medium', () => {
  for (const bad of [undefined, null, '', 'nightmare', 'EASY', 3]) {
    const ai = new CombatAIController({ difficulty: bad });
    assert.equal(ai.difficulty, 'medium', String(bad));
    assert.equal(ai.profile, getDifficultyProfile('medium'));
  }
  for (const id of DIFFICULTY_IDS) assert.equal(new CombatAIController({ difficulty: id }).difficulty, id);
});

// Everything about a fighter that decides what it can do.
const statsOf = (f) => JSON.stringify({
  def: f.def, maxSpeed: f.maxSpeed, jumpVelocity: f.jumpVelocity, energy: f.energyDef, maxEnergy: f.combat.maxEnergy,
  rate: f.chargedCooldownRate, dash: f.dashDuration, attacks: f.attacks, projectiles: f.projectileDefs,
  summons: f.summonDefs, techniques: f.techniqueDefs, defense: f.defense, collider: [f.body.halfW, f.body.height, f.body.gravityScale, f.body.maxFall],
});

test('difficulty never changes the fighter: identical stats on every level, before and after a fight', () => {
  const before = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 31, cpuX: 900, foeX: 1100, script: (n) => ({ action1: n % 40 === 0, action1Pressed: n % 40 === 0 }) });
    before[difficulty] = statsOf(r.cpu);
    r.run(seconds(8));
    assert.equal(statsOf(r.cpu), before[difficulty], `${difficulty}: nothing about the fighter changed`);
  }
  assert.equal(new Set(Object.values(before)).size, 1, 'the same fighter on every level');
});

test('the controller only reads the game: no writes to fighters, no raw input, no unseeded randomness', () => {
  const src = readFileSync(new URL('../js/game/combat-ai.js', import.meta.url), 'utf8')
    .replace(/\/\/.*$/gm, '');
  // Assignments to anything reached through a fighter.
  const writes = src.match(/(^|[\s;(,{])(self|foe|fighter|target|f)\.[\w.]+\s*(=(?!=)|\+=|-=|\+\+|--)/gm) ?? [];
  assert.deepEqual(writes, []);
  // No calls that act on a fighter instead of pressing its buttons.
  for (const call of ['tryAction', 'tryDash', 'tryChargedAction', 'trySummon', 'tryTechnique', 'applyHit', 'spendEnergy', 'dropThrough', 'endTechnique', 'reset(']) {
    assert.ok(!new RegExp(`(self|foe)\\.${call.replace('(', '\\(')}`).test(src), call);
  }
  assert.ok(!/Math\.random\(\)/.test(src.replace('rng = Math.random', '')), 'randomness comes from the injected rng');
  assert.ok(!/input-manager|InputManager|\.sample\(/.test(src), 'never reads the player\'s input');
});

// ---- Practice Ground keeps its training dummy --------------------------------------

test('the training controller still never presses a combat button, Charge or Defense', () => {
  const sprites = fakeSprites();
  const trainee = new TrainingAIController({ rng: mulberry32(8) });
  const foe = new Fighter({ def, sprites, stage: RAISED, slot: 'p1', label: 'P1', spawn: { x: 1400 }, controller: null });
  const cpu = new Fighter({ def, sprites, stage: RAISED, slot: 'p2', label: 'CPU', spawn: { x: 600 }, controller: trainee });
  cpu.opponent = foe;
  foe.opponent = cpu;
  const ctx = { stage: RAISED, gravity: CONFIG.sim.gravity };
  for (let i = 0; i < seconds(20); i++) {
    if (i % 300 === 0) foe.body.x = 400 + ((i / 300) % 4) * 350;
    cpu.update(DT, ctx);
    foe.update(DT, ctx);
    const o = trainee.out;
    for (const k of ['primary', 'special', 'action1', 'action2', 'charge', 'defense']) {
      assert.ok(!o[k] && !o[`${k}Pressed`], `never ${k}`);
    }
  }
  assert.equal(cpu.combat.launchPoint, 0);
  assert.equal(foe.combat.launchPoint, 0, 'it never hit anyone');
});
