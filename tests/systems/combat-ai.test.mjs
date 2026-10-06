// Run with node --test tests/systems/combat-ai.test.mjs (no dependencies).
// Quick Battle's combat AI (js/game/ai/combat-ai.js): it fights through the
// same inputs a player has (attacks, projectiles, techniques on their own
// buttons, Shield, Dash, jumps, the fast fall), reacts
// late on low levels and early (never
// instantly) on high ones, reassesses faster the higher it goes, keeps off
// the Void's edge, waits while its opponent is out, and never touches a
// fighter's stats. Deterministic: every CPU gets a seeded RNG. Runs the real
// Fighter, CombatSystem, projectiles, clones and physics in a small "ring"
// (the Arena's step order without its rendering).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { def, DT, fakeSprites, stageMap } from '../helpers/fighter-harness.mjs';
import { CONFIG } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { TrainingAIController } from '../../js/game/fighters/fighter-controller.js';
import { DIFFICULTY_IDS, getDifficultyProfile } from '../../js/data/difficulty.js';
import { mulberry32 } from '../../js/core/utils.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';

const BUTTONS = ['runLeft', 'runRight', 'down', 'jump', 'shield', 'extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'];
const COMBAT = ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3'];

// A flat main floor from x 0 to 2000 (top 800), and one with a platform a
// jump above the floor.
const FLAT = new StageCollision(stageMap());
const RAISED = new StageCollision(stageMap({ platforms: [{ id: 'deck', x: 1300, y: 670, w: 240, h: 16 }] }));

// Two fighters in play: the CPU (slot p2) driven by the combat AI, and a
// scripted opponent (p1, #0001 unless `foeDef` says otherwise) whose
// `script(step, fighter)` returns its input.
// `world` stands in for the Arena as ctx.battle (projectiles, clones, the
// combat system's events, the score and the clock). The AI's output is
// logged every step.
function ring({
  difficulty = 'medium', seed = 1, stage = FLAT, cpuX = 1000, foeX = 1200, foeY, script = () => ({}),
  cpuFacing = Math.sign(foeX - cpuX) || 1, foeFacing = -cpuFacing, foeDef = def,
} = {}) {
  const sprites = fakeSprites();
  const ai = new CombatAIController({ difficulty, rng: mulberry32(seed) });
  let n = 0;
  const foe = new Fighter({
    def: foeDef, sprites, stage, slot: 'p1', label: 'P1', spawn: { x: foeX, y: foeY, facing: foeFacing },
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
  // Read from the fighter's own data: the High Kick on the ground and in the
  // air, attack1 on both, attack2 and attack3 as close moves in the air and
  // as projectiles (Red, Maximum Blue) on the ground, attack4 and attack5
  // (its two techniques) on their own buttons, the Shield on the ground,
  // the Deflect on the Shield button in the air, the Dash and the air dash.
  assert.deepEqual(moves.melee.map((m) => m.id).sort(),
    ['attack1', 'extra_attack', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3']);
  assert.deepEqual(moves.ranged.map((m) => [m.id, m.air]), [['attack2', false], ['attack3', false]], 'the projectiles are ground only');
  assert.deepEqual(moves.specials.map((c) => [c.action, c.id, c.type]), [['attack4', 'attack4', 'technique'], ['attack5', 'attack5', 'technique']]);
  assert.equal(moves.shield, undefined, 'no Shield said to work everywhere');
  assert.equal(moves.groundShield, true);
  assert.equal(moves.deflect.action, 'shield');
  assert.ok(moves.dash.distance > 0);
  assert.ok(moves.airDash.distance > 0);
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

// An opponent with a telegraphed kick on Attack 2: #0001's High Kick
// slowed to 0.25 s of startup (a test fixture: none of the game's fighters
// is built around a kick this slow).
const KICKER = {
  ...def,
  actions: { ...def.actions, attack2: 'attack2' },
  attacks: { ...def.attacks, attack2: { ...def.attacks.extra_attack, animation: 'attack2', startup: 0.25, step: undefined } },
};

// The KICKER, 50 units away and facing the CPU, starts Attack 2 on step
// 30 (0.25 s of startup before its kick can land). The CPU's own neutral
// thinking is paused, so only its reaction to the attack acts: how soon it
// answers (Shield held, a jump, or a step away) and whether the kick
// lands.
function reactionTrial(difficulty, seed) {
  const START = 30;
  const script = (n) => (n === START ? { attack2: true, attack2Pressed: true } : {});
  const r = ring({ difficulty, seed, cpuX: 1000, foeX: 1050, script, foeDef: KICKER });
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
    const r = ring({ difficulty: 'hard', seed: 150 + seed, cpuX: 1975, foeX: 1925, script, foeDef: KICKER });
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

test('harder levels answer an incoming Red more often', () => {
  const caught = {};
  for (const difficulty of ['easy', 'brutal']) {
    caught[difficulty] = 0;
    for (let seed = 0; seed < 12; seed++) {
      // Thrown from 300 units: about half a second from the press to contact.
      const script = (n) => (n === 20 ? { attack2: true, attack2Pressed: true } : {});
      const r = ring({ difficulty, seed: 300 + seed, cpuX: 1000, foeX: 1300, script });
      r.hush();
      r.run(seconds(1.2));
      if (hitsOn(r.events, r.cpu).some((e) => e.projectile)) caught[difficulty]++;
    }
  }
  assert.ok(caught.brutal < caught.easy, `Brutal avoids more of them (${caught.brutal} vs ${caught.easy} of 12 hit)`);
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

test('it presses Attack 4 and Attack 5 directly: one press on the move\'s own button, nothing held with it, and never again while it cools down', () => {
  const specials = readMoveset(ring().cpu).specials;
  assert.deepEqual(specials.map((c) => c.action), ['attack4', 'attack5']);
  for (const special of specials) {
    const r = ring({ difficulty: 'hard', seed: 17, cpuX: 900, foeX: 1100 });
    r.hush();
    const face = special.type === 'technique' ? 1 : 0;
    r.ai.setIntent({ kind: 'attack', action: special.action, face, until: r.ai.clock + 0.3 });
    let cast = null;
    for (let i = 0; i < seconds(1.5); i++) {
      r.step();
      cast ??= r.cpu.technique;
    }
    const log = r.log.slice(1);
    const presses = log.filter((o) => o[`${special.action}Pressed`]);
    assert.equal(presses.length, 1, `${special.id}: one press`);
    const [press] = presses;
    assert.equal(press.down, false, `${special.id}: no Down held with it`);
    for (const other of ['attack1', 'attack2', 'attack3', 'extra_attack', 'shield']) {
      if (other !== special.action) assert.equal(press[other], false, `${special.id}: no ${other} with it`);
    }
    assert.ok(r.cpu.combat.abilityCooldowns.active(special.id), `${special.id}: its cooldown runs`);
    assert.equal(cast?.action, special.action, `${special.id}: the technique came from its own button`);
    // Its own options never offer it again while it is cooling down.
    const s = r.ai.sense(r.cpu, r.foe, r.ctx);
    assert.ok(!r.ai.specialOptions(s).some((o) => o.intent.action === special.action), `${special.id}: not while cooling down`);
  }
});

test('left to itself, a high level uses Unlimited Void and Hollow Purple on a turtle, each from its own button', () => {
  const used = { attack4: 0, attack5: 0 };
  for (let seed = 0; seed < 6; seed++) {
    // An opponent a few steps away holding its Shield up, never battered
    // (its Launch Point held at 0, so it stays on the stage): no Shield
    // stops either technique.
    const r = ring({ difficulty: 'brutal', seed: 400 + seed, cpuX: 700, foeX: 900, script: () => ({ shield: true }) });
    let tech = null;
    let cooling = [];
    for (let i = 0; i < seconds(14); i++) {
      r.foe.combat.launchPoint = 0;
      r.step();
      const out = r.log.at(-1);
      const now = [...r.cpu.combat.abilityCooldowns.entries.keys()];
      for (const id of now.filter((c) => !cooling.includes(c))) {
        assert.ok(out[`${id}Pressed`], `seed ${seed}: ${id} started on its own button`);
        assert.ok(!out.attack1Pressed && !out.attack2Pressed && !out.attack3Pressed, `seed ${seed}: never from another attack`);
      }
      cooling = now;
      if (r.cpu.technique && r.cpu.technique !== tech) used[r.cpu.technique.action]++;
      tech = r.cpu.technique;
    }
  }
  assert.ok(used.attack4 > 0, `it casts Unlimited Void (${used.attack4})`);
  assert.ok(used.attack5 > 0, `it casts Hollow Purple (${used.attack5})`);
});

test('its output is only the player\'s own controls: never a control the fighter does not read', () => {
  const allowed = Object.keys(blankInput()).sort();
  for (const difficulty of DIFFICULTY_IDS) {
    const r = ring({ difficulty, seed: 9, cpuX: 700, foeX: 1100, script: (n) => (n % 120 < 30 ? { runLeft: true } : {}) });
    r.run(seconds(8));
    for (const out of r.log) {
      const { step, intent, ...controls } = out;
      assert.deepEqual(Object.keys(controls).sort(), allowed, `${difficulty}: the same controls a player has`);
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
  const src = ['combat-ai', 'moveset'].map((name) => readFileSync(new URL(`../../js/game/ai/${name}.js`, import.meta.url), 'utf8'))
    .join('\n').replace(/\/\/.*$/gm, '');
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
  }
  assert.equal(cpu.combat.launchPoint, 0);
  assert.equal(foe.combat.launchPoint, 0, 'it never hit anyone');
});

test('an attack intent with a stale side presses immediately, and Fighter aims at the current target without a turn tap', () => {
  const r = ring({ cpuFacing: -1 });
  r.hush();
  const held = {};
  const intent = { action: 'attack1', face: -1, until: r.ai.clock + 1 };
  r.ai.actAttack(r.cpu, intent, held);
  assert.equal(held.attack1, true);
  assert.equal(held.runLeft, undefined);
  assert.equal(held.runRight, undefined);
  r.cpu.tryAction('attack1', -1);
  assert.equal(r.cpu.facing, 1, 'live target wins over stale planned direction');
  assert.ok(r.cpu.combat.attack);
});

test('an aerial attack presses without adding a direction just to turn its sprite', () => {
  const r = ring({ cpuFacing: -1 });
  r.hush();
  r.cpu.body.grounded = false;
  r.foe.body.x = r.cpu.body.x + 25;
  r.ai.meleeOptions = () => [{ action: 'attack1', face: 1 }];
  const held = {};
  const intent = { jumped: true, air: true, dir: 1 };
  r.ai.actJump(r.cpu, r.foe, r.ctx, intent, held);
  assert.equal(held.attack1, true);
  assert.equal(held.runLeft, undefined);
  assert.equal(held.runRight, undefined);
  assert.equal(intent.struck, true);
});
