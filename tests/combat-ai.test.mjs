// Run with node --test tests/combat-ai.test.mjs (no dependencies).
// Quick Battle's combat AI (js/game/combat-ai.js): it fights through the
// same inputs a player has (attacks, Throw, the Clone Attack and Sphere
// Rush on their own buttons, Shield, Dash, jumps, the fast fall), reacts
// late on low levels and early (never
// instantly) on high ones, reassesses faster the higher it goes, keeps off
// the Void's edge, waits while its opponent is out, and never touches a
// fighter's stats. Deterministic: every CPU gets a seeded RNG. Runs the real
// Fighter, CombatSystem, projectiles, clones and physics in a small "ring"
// (the Arena's step order without its rendering).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { def, DT, fakeSprites, fakeSpritesOf, stageMap } from './fighter-harness.mjs';
import { getCharacter } from '../js/data/characters.js';
import { CONFIG } from '../js/config.js';
import { Fighter, separateFighters } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../js/game/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../js/game/clone.js';
import { StageCollision, resolveSolidOverlap } from '../js/game/physics.js';
import { CombatAIController, readMoveset } from '../js/game/combat-ai.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { DIFFICULTY_IDS, getDifficultyProfile } from '../js/data/difficulty.js';
import { mulberry32 } from '../js/core/utils.js';
import { blankInput } from '../js/game/fighter-controller.js';

const BUTTONS = ['runLeft', 'runRight', 'down', 'jump', 'shield', 'extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4'];
const COMBAT = ['extra_attack', 'transform', 'attack1', 'attack2'];

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
  cpuFacing = Math.sign(foeX - cpuX) || 1, foeFacing = -cpuFacing, cpuDef = def, foeDef = def,
} = {}) {
  const ai = new CombatAIController({ difficulty, rng: mulberry32(seed) });
  let n = 0;
  const foe = new Fighter({
    def: foeDef, sprites: fakeSpritesOf(foeDef), stage, slot: 'p1', label: 'P1', spawn: { x: foeX, y: foeY, facing: foeFacing },
    controller: { getInput: (self) => ({ ...script(n, self) }) },
  });
  const cpu = new Fighter({ def: cpuDef, sprites: fakeSpritesOf(cpuDef), stage, slot: 'p2', label: 'CPU', spawn: { x: cpuX, facing: cpuFacing }, controller: ai });
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
    if (fighters.length === 2) separateFighters(fighters[0], fighters[1], stage);
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

test('while its own attack plays it never turns away from its opponent (a held direction turns an attack)', () => {
  let attacks = 0;
  for (const difficulty of DIFFICULTY_IDS) {
    for (const seed of [1, 2, 3, 4, 5]) {
      // Against another CPU, so both close in, cross over and strike. Where
      // each one's opponent is, as its controller decides (the first to
      // step has already moved when the second decides).
      const side = new Map();
      const decide = (controller) => (self, dt, ctx) => {
        side.set(self, Math.sign(self.opponent.body.x - self.body.x));
        return controller.getInput(self, dt, ctx);
      };
      const other = decide(new CombatAIController({ difficulty, rng: mulberry32(seed + 100) }));
      const r = ring({ difficulty, seed, cpuX: 900, foeX: 1100, script: (n, self) => other(self, DT, r.ctx) });
      r.cpu.controller = { getInput: decide(r.ai) };
      for (let i = 0; i < seconds(30); i++) {
        const before = [r.cpu, r.foe].map((f) => ({ f, atk: f.combat.attack, facing: f.facing }));
        r.step();
        for (const { f, atk, facing } of before) {
          if (!atk && f.combat.attack) attacks++;
          if (!atk || f.combat.attack !== atk || f.facing === facing) continue;
          assert.equal(f.facing, side.get(f), `${difficulty} seed ${seed}: ${f.label} turned away mid-attack at step ${r.n}`);
        }
        if (r.cpu.body.y > 2000 || r.foe.body.y > 2000) break; // one fell into the Void
      }
    }
  }
  assert.ok(attacks > 300, `plenty of attacks (${attacks})`);
});

test('it never presses a reserved button, and never drops through a platform', () => {
  assert.equal(def.actions.transform, null, '#0001\'s transform is reserved');
  const moves = readMoveset(new Fighter({ def, sprites: fakeSprites(), stage: FLAT, spawn: { x: 100 } }));
  // Read from the fighter's own data: Throw, attack1 and attack2 on the ground and
  // in the air as mapped, attack3 and attack4 (its summon and technique) on
  // their own buttons, the Shield and the Dash.
  assert.deepEqual(moves.melee.map((m) => m.id).sort(), ['attack1', 'attack2', 'midair_attack1', 'midair_attack2']);
  assert.deepEqual(moves.ranged.map((m) => [m.id, m.air]), [['extra_attack', false]], 'Throw is ground only');
  assert.deepEqual(moves.specials.map((c) => [c.action, c.id, c.type]), [['attack3', 'attack3', 'summon'], ['attack4', 'attack4', 'technique']]);
  assert.equal(moves.shield, true);
  assert.ok(moves.dash.distance > 0);
  assert.ok([...moves.melee, ...moves.ranged, ...moves.specials].every((m) => m.action !== 'transform'));
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 11, stage: RAISED, cpuX: 900, foeX: 1400 });
    r.run(seconds(12));
    assert.ok(r.log.every((o) => !o.transform && !o.transformPressed), `${difficulty}: transform never pressed`);
    assert.ok(r.log.every((o) => !o.dropPressed), `${difficulty}: no platform drop (no player control has one)`);
  }
});

test('press edges last exactly one step, and every press is of a held button', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    // A busy opponent: it walks back and forth, jumps and swings now and then.
    const script = (n, self) => ({
      runLeft: n % 240 < 120, runRight: n % 240 >= 120,
      jump: n % 97 === 0, jumpPressed: n % 97 === 0,
      attack1: n % 53 === 0, attack1Pressed: n % 53 === 0,
      extra_attack: n % 71 === 0, extra_attackPressed: n % 71 === 0,
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
      assert.ok(!(o.runLeft && o.runRight), 'never both directions');
    }
  }
});

// ---- Shield and reaction ---------------------------------------------------------

// The opponent, 50 units away and facing the CPU, starts Attack 2 on
// step 30 (0.25 s of startup before its kick can land). The CPU's own
// neutral thinking is paused, so only its reaction to the attack acts: how
// soon it answers (Shield held, a jump, or a step away) and whether the
// kick lands.
function reactionTrial(difficulty, seed) {
  const START = 30;
  const script = (n) => (n === START ? { attack2: true, attack2Pressed: true } : {});
  const r = ring({ difficulty, seed, cpuX: 1000, foeX: 1050, script });
  r.hush();
  r.run(START - 1 + seconds(0.8));
  const away = 'runLeft';
  const answer = r.log.find((o) => o.step > START && (o.shield || o.jumpPressed || o[away]));
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
  assert.ok(safe >= 10, `Brutal answers attack2 in time (${safe}/12)`);
  // With its back to the ledge there is nowhere to step: it Shields.
  let shielded = 0;
  for (let seed = 0; seed < 8; seed++) {
    const script = (n) => (n === 30 ? { attack2: true, attack2Pressed: true } : {});
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
      const script = (n) => (n === 20 ? { extra_attack: true, extra_attackPressed: true } : {});
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
    assert.ok(tail.every((o) => !o.runLeft && !o.runRight && !o.jump), `${difficulty} does not chase`);
    assert.ok(tail.every((o) => COMBAT.every((a) => !o[`${a}Pressed`])), `${difficulty} does not attack nobody`);
    assert.ok(Math.abs(r.cpu.body.x - x) < 25, 'it stays put');
    r.foe.lostToVoid = false;
    r.run(seconds(3));
    assert.ok(r.log.slice(-seconds(3)).some((o) => o.runLeft || o.runRight || COMBAT.some((a) => o[`${a}Pressed`])), 'back to fighting');
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
  assert.ok(r.log.slice(-10).every((o) => !o.runRight), 'no longer holding toward it');
});

// ---- Attack 3, Attack 4, Dash ---------------------------------------------------------

test('it presses Attack 3 and Attack 4 directly: one press on the move\'s own button, nothing held with it, and never again while it cools down', () => {
  for (const special of readMoveset(ring().cpu).specials) {
    const r = ring({ difficulty: 'hard', seed: 17, cpuX: 900, foeX: 1100 });
    r.hush();
    const face = special.type === 'technique' ? 1 : 0;
    r.ai.setIntent({ kind: 'attack', action: special.action, face, until: r.ai.clock + 0.3 });
    r.run(seconds(1.5));
    const log = r.log.slice(1);
    const presses = log.filter((o) => o[`${special.action}Pressed`]);
    assert.equal(presses.length, 1, `${special.id}: one press`);
    const [press] = presses;
    assert.equal(press.down, false, `${special.id}: no Down held with it`);
    for (const other of ['attack1', 'attack2', 'extra_attack', 'shield']) assert.equal(press[other], false, `${special.id}: no ${other} with it`);
    assert.ok(r.cpu.combat.abilityCooldowns.active(special.id), `${special.id}: its cooldown runs`);
    if (special.type === 'summon') assert.ok(r.world.clones.length === 1 || r.events.some((e) => e.summon), 'the clone came from the fighter\'s own summon');
    else assert.ok(r.cpu.technique || r.events.some((e) => e.technique), 'the Sphere Rush came from its own button');
    // Its own options never offer it again while it is cooling down.
    const s = r.ai.sense(r.cpu, r.foe, r.ctx);
    assert.ok(!r.ai.specialOptions(s).some((o) => o.intent.action === special.action), `${special.id}: not while cooling down`);
  }
});

test('left to itself, a high level uses the Clone Attack and the Sphere Rush, each from its own button', () => {
  let clones = 0;
  let rushes = 0;
  for (let seed = 0; seed < 6; seed++) {
    // A far opponent standing still.
    const r = ring({ difficulty: 'brutal', seed: 400 + seed, cpuX: 500, foeX: 1100 });
    let tech = null;
    let cooling = [];
    for (let i = 0; i < seconds(10); i++) {
      r.step();
      const out = r.log.at(-1);
      const now = [...r.cpu.combat.abilityCooldowns.entries.keys()];
      for (const id of now.filter((c) => !cooling.includes(c))) {
        assert.ok(out[`${id}Pressed`], `seed ${seed}: ${id} started on its own button`);
        assert.ok(!out.attack1Pressed && !out.attack2Pressed, `seed ${seed}: never from attack1 or attack2`);
      }
      cooling = now;
      if (r.cpu.technique && r.cpu.technique !== tech) rushes++;
      tech = r.cpu.technique;
    }
    clones += new Set(r.events.filter((e) => e.summon && e.attacker === r.cpu).map((e) => e.summon)).size +
      (r.cpu.combat.abilityCooldowns.active('attack3') ? 1 : 0);
  }
  assert.ok(clones > 0, `it summons (${clones} clones)`);
  assert.ok(rushes > 0, `it rushes (${rushes} rushes)`);
});

test('its output is only the player\'s own controls, and the way its attacks face: never a control the fighter does not read', () => {
  const allowed = Object.keys(blankInput()).sort();
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 9, cpuX: 700, foeX: 1100, script: (n) => (n % 120 < 30 ? { runLeft: true } : {}) });
    r.run(seconds(8));
    for (const out of r.log) {
      const { step, intent, ...controls } = out;
      assert.deepEqual(Object.keys(controls).sort(), allowed, `${difficulty}: the same controls a player has, and face`);
      assert.ok([-1, 0, 1].includes(controls.face), `${difficulty}: face is a direction`);
    }
    assert.ok(r.log.every((o) => o.intent === null || typeof o.intent === 'string'));
  }
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
        const d = r.cpu.dash.direction > 0 ? 'runRight' : 'runLeft';
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
  dash: f.dashDuration, attacks: f.attacks, projectiles: f.projectileDefs,
  summons: f.summonDefs, techniques: f.techniqueDefs, defense: f.defense, collider: [f.body.halfW, f.body.height, f.body.gravityScale, f.body.maxFall],
});

test('difficulty never changes the fighter: identical stats on every level, before and after a fight', () => {
  const before = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 31, cpuX: 900, foeX: 1100, script: (n) => ({ attack1: n % 40 === 0, attack1Pressed: n % 40 === 0 }) });
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
  for (const call of ['tryAction', 'tryDash', 'trySpecial', 'trySummon', 'tryTechnique', 'applyHit', 'spendEnergy', 'dropThrough', 'endTechnique', 'reset(']) {
    assert.ok(!new RegExp(`(self|foe)\\.${call.replace('(', '\\(')}`).test(src), call);
  }
  assert.ok(!/Math\.random\(\)/.test(src.replace('rng = Math.random', '')), 'randomness comes from the injected rng');
  assert.ok(!/input-manager|InputManager|\.sample\(/.test(src), 'never reads the player\'s input');
});

// ---- Practice Ground keeps its training dummy --------------------------------------

test('the training controller still never presses a combat button, Down or Shield', () => {
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
    for (const k of ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'down', 'shield']) {
      assert.ok(!o[k] && !o[`${k}Pressed`], `never ${k}`);
    }
    assert.equal(o.face, 0, 'and it never faces anything for an attack');
  }
  assert.equal(cpu.combat.launchPoint, 0);
  assert.equal(foe.combat.launchPoint, 0, 'it never hit anyone');
});

// ---- Facing its opponent ------------------------------------------------------------

const DEF_0002 = getCharacter('0002');
// The way a fighter is drawn looking: a committed move's look, else its facing.
const looking = (f) => f.lookFacing || f.facing;

test('every attack it makes faces its opponent, from the step it starts to the step it ends, crossing over included: #0001 and #0002, every level', () => {
  const stats = { attacks: 0, crossed: 0, committed: 0 };
  for (const [cpuDef, foeDef] of [[def, def], [DEF_0002, def], [DEF_0002, DEF_0002]]) {
    for (const difficulty of DIFFICULTY_IDS) {
      for (const seed of [1, 2, 3]) {
        // Against another CPU, so both close in, cross over and strike. The
        // opponent's side as each controller decides (the step's own facing
        // input), and each attack's side as it started.
        const side = new Map();
        const decide = (controller) => (self, dt, ctx) => {
          side.set(self, self.opponent.body.x - self.body.x);
          return controller.getInput(self, dt, ctx);
        };
        const other = decide(new CombatAIController({ difficulty, rng: mulberry32(seed + 100) }));
        const r = ring({ difficulty, seed, cpuX: 900, foeX: 1100, cpuDef, foeDef, script: (n, self) => other(self, DT, r.ctx) });
        r.cpu.controller = { getInput: decide(r.ai) };
        const started = new Map();
        for (let i = 0; i < seconds(20); i++) {
          const frozen = new Map([r.cpu, r.foe].map((f) => [f, f.combat.hitstop > 0]));
          r.step();
          for (const f of [r.cpu, r.foe]) {
            const atk = f.combat.attack;
            if (!atk) continue;
            const dx = side.get(f);
            if (!started.has(atk)) {
              started.set(atk, Math.sign(dx));
              stats.attacks++;
              if (atk.def.motion) stats.committed++;
            }
            if (frozen.get(f) || Math.abs(dx) <= 2) continue;
            if (Math.sign(dx) !== started.get(atk)) stats.crossed++;
            assert.equal(looking(f), Math.sign(dx), `${cpuDef.id} vs ${foeDef.id}, ${difficulty} seed ${seed}: ${f.label}'s ${atk.def.id} looks away at step ${r.n}`);
            // A committed move keeps its own heading meanwhile.
            if (atk.def.motion?.type === 'roll') assert.equal(f.facing, atk.motion.dir, 'a roll keeps its path');
          }
          if (r.cpu.body.y > 2000 || r.foe.body.y > 2000) break; // one fell into the Void
        }
      }
    }
  }
  assert.ok(stats.attacks > 400, `plenty of attacks (${stats.attacks})`);
  assert.ok(stats.crossed > 10, `the opponent crossed during some (${stats.crossed})`);
  assert.ok(stats.committed > 10, `committed moves among them (${stats.committed})`);
});

test('it strikes without first turning: the press is the button alone, the attack faces the opponent on that step, nothing walks or Dashes', () => {
  for (const action of ['attack1', 'attack2', 'extra_attack']) {
    // Facing away from an opponent right behind it (clear of its pushbox).
    const r = ring({ difficulty: 'hard', seed: 41, cpuX: 1000, foeX: 940, cpuFacing: 1, foeFacing: 1 });
    r.hush();
    const x = r.cpu.body.x;
    r.ai.setIntent({ kind: 'attack', action, until: r.ai.clock + 0.3 });
    r.step();
    const press = r.log.at(-1);
    assert.equal(press[`${action}Pressed`], true, `${action}: pressed on its first step, no turn step before it`);
    assert.equal(press.runLeft || press.runRight, false, `${action}: no direction held with it`);
    assert.equal(press.face, -1, `${action}: facing where the opponent is now`);
    assert.equal(r.cpu.combat.attack?.def.id, action);
    assert.equal(r.cpu.facing, -1, `${action}: it starts facing the opponent`);
    // Only the attack's own step-in (attack2's) moves it, and toward the opponent.
    if (def.attacks[action].step) assert.ok(r.cpu.body.x < x, `${action}: its step-in, at the opponent`);
    else assert.equal(r.cpu.body.x, x, `${action}: no walk to turn`);
    assert.equal(r.cpu.dash, null);
    const taps = r.log.filter((o) => o.runLeftPressed || o.runRightPressed);
    assert.deepEqual(taps, [], `${action}: no tap that could become a Dash`);
  }
});

test('the opponent crossing behind it during its startup or its strike: its attack turns after it and still lands', () => {
  for (const when of ['startup', 'active']) {
    // In front, out of the kick's reach until it crosses.
    const r = ring({ difficulty: 'hard', seed: 43, cpuX: 1000, foeX: when === 'startup' ? 1044 : 1140 });
    r.hush();
    r.ai.setIntent({ kind: 'attack', action: 'attack2', until: r.ai.clock + 0.3 });
    r.step();
    assert.equal(r.cpu.combat.attack?.def.id, 'attack2');
    assert.equal(r.cpu.facing, 1);
    while (r.cpu.combat.phase !== when) r.step();
    Object.assign(r.foe.body, { x: r.cpu.body.x - (when === 'startup' ? 4 : 24), prevX: r.cpu.body.x - 24 });
    r.step();
    assert.equal(r.cpu.facing, -1, `${when}: turned to it on the next step`);
    while (r.cpu.combat.attack && !hitsOn(r.events, r.foe).length) r.step();
    assert.equal(hitsOn(r.events, r.foe)[0]?.move, 'attack2', `${when}: the kick lands behind`);
  }
});

test('in the air too: its aerial faces the opponent as it starts and turns when the opponent crosses under it', () => {
  const r = ring({ difficulty: 'hard', seed: 47, cpuX: 1000, foeX: 960 });
  r.hush();
  Object.assign(r.cpu.body, { y: 640, prevY: 640, grounded: false, ground: null, vx: 0, vy: 0 });
  Object.assign(r.foe.body, { y: 660, prevY: 660, grounded: false, ground: null, vx: 0, vy: 0, gravityScale: 0 });
  r.ai.setIntent({ kind: 'attack', action: 'attack1', until: r.ai.clock + 0.3 });
  r.step();
  assert.equal(r.cpu.combat.attack?.def.id, 'midair_attack1');
  assert.equal(r.cpu.facing, -1);
  Object.assign(r.foe.body, { x: 1040, prevX: 1040 });
  r.step();
  if (r.cpu.combat.attack) assert.equal(r.cpu.facing, 1, 'turned under it');
  assert.equal(r.cpu.body.vx, 0, 'no drift spent turning');
});

test('a committed move: #0002\'s Spin Attack rolls on under its opponent, its path and boxes kept, looking back at it, then faces it', () => {
  // The opponent hangs just over the ball's path, as if it had jumped it.
  const r = ring({ difficulty: 'hard', seed: 53, cpuDef: DEF_0002, cpuX: 1000, foeX: 1120 });
  Object.assign(r.foe.body, { y: 690, prevY: 690, grounded: false, ground: null, gravityScale: 0, vy: 0 });
  r.hush();
  r.ai.setIntent({ kind: 'attack', action: 'attack3', until: r.ai.clock + 0.3 });
  r.step();
  const atk = r.cpu.combat.attack;
  assert.equal(atk?.def.id, 'attack3');
  assert.equal(atk.motion.dir, 1, 'rolling at the opponent');
  let behind = 0;
  let last = r.cpu.body.x;
  // Behind it as the step began: what that step's look goes by.
  let wasBehind = false;
  while (r.cpu.combat.attack === atk) {
    r.step();
    if (r.cpu.combat.attack !== atk) break;
    assert.equal(r.cpu.facing, 1, 'its facing, path and boxes kept');
    assert.ok(r.cpu.body.x >= last - 1e-9, 'never rolled back to flip its sprite');
    last = r.cpu.body.x;
    if (wasBehind) {
      behind++;
      assert.equal(r.cpu.spriteFlip, true, 'drawn looking back at the opponent');
    }
    wasBehind = r.foe.body.x < r.cpu.body.x - 2;
  }
  assert.ok(behind > 0, `it rolled through (${behind} steps past)`);
  assert.equal(r.cpu.facing, -1, 'over: facing the opponent behind it');
});

test('level with its opponent it keeps the way it faces: an overlap never flicks it back and forth', () => {
  const r = ring({ difficulty: 'hard', seed: 59, cpuX: 1000, foeX: 1100 });
  r.hush();
  r.step();
  assert.equal(r.log.at(-1).face, 1);
  // On the very same spot, and wobbling a unit or so either side.
  for (let i = 0; i < 90; i++) {
    const x = r.cpu.body.x + [0, 1.5, -1.5, 0.5, -2][i % 5];
    Object.assign(r.foe.body, { x, prevX: x, vx: 0 });
    if (i === 30) r.ai.setIntent({ kind: 'attack', action: 'attack1', until: r.ai.clock + 0.3 });
    r.step();
    assert.equal(r.log.at(-1).face, 1, `step ${i}: the last way it had`);
    if (r.cpu.combat.attack) assert.equal(r.cpu.facing, 1);
  }
  // Clearly to the other side: it faces that way, once.
  Object.assign(r.foe.body, { x: r.cpu.body.x - 30, prevX: r.cpu.body.x - 30 });
  r.step();
  assert.equal(r.log.at(-1).face, -1);
});

test('with nobody in play it faces nothing: an opponent lost to the Void (or none) never steers its attacks', () => {
  const r = ring({ difficulty: 'hard', seed: 61, cpuX: 1000, foeX: 900 });
  r.run(10);
  assert.equal(r.log.at(-1).face, -1);
  r.foe.lostToVoid = true;
  r.run(30);
  assert.ok(r.log.slice(-30).every((o) => o.face === 0), 'out of play: nothing to face');
  r.cpu.opponent = null;
  r.run(10);
  assert.ok(r.log.slice(-10).every((o) => o.face === 0), 'no opponent at all');
  r.cpu.opponent = r.foe;
  r.foe.lostToVoid = false;
  r.run(2);
  assert.equal(r.log.at(-1).face, -1, 'back in play: facing it again');
  // Locked input (intro, time-up, K.O.): nothing either.
  r.cpu.inputLocked = true;
  r.run(3);
  assert.ok(r.log.slice(-3).every((o) => o.face === 0));
});

test('facing is as deterministic as the rest: the same seed, the same fight, step for step', () => {
  const run = () => {
    const other = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(7) });
    const r = ring({ difficulty: 'brutal', seed: 6, cpuX: 900, foeX: 1100, script: (n, self) => other.getInput(self, DT, r.ctx) });
    r.run(seconds(8));
    return JSON.stringify(r.log.map((o) => [o.face, o.attack1Pressed, o.attack2Pressed, o.runLeft, o.runRight])) + r.cpu.body.x + r.foe.body.x;
  };
  assert.equal(run(), run());
});
