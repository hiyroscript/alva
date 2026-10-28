// Run with node --test tests/systems/cpu-super-jump.test.mjs (no dependencies).
// The CPU and the Super Jump: its jump predictions walk the Fighter's own
// arcs (the normal jump, the Super Jump, the air jump), its capabilities read
// the universal jumps, it reaches a footing with the normal jump where that
// is enough and with the Super Jump only where it is not, it weighs the
// Super Jump into an aerial, every level Super Jumps in a real match by the
// same legal inputs as a player, and the training CPU follows onto high
// ground with it. Uses the real Fighter, physics, CombatSystem and CPU
// Intelligence (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { TrainingAIController } from '../../js/game/fighters/fighter-controller.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { Track, arcTrack } from '../../js/game/ai/cpu-intelligence/prediction.js';
import { DIFFICULTY_IDS } from '../../js/data/difficulty.js';
import { playableCharacters } from '../../js/data/characters.js';
import { DT, MOVEMENT, fakeSpritesOf, makeFighter, stageMap } from '../helpers/fighter-harness.mjs';

const G = CONFIG.sim.gravity;
const [ONE] = playableCharacters();
const JUMP = { jump: true, jumpPressed: true };
const SUPER = { ...JUMP, down: true, downPressed: true };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A CPU (`controller`) against a fighter that stands where it is put, on
// `stage`, stepped as the Arena steps them. Every real takeoff the CPU makes
// is logged with its input.
function world({ stage, controller, cpuX = 800, foeX = 1200, foeY, def = ONE }) {
  const foe = new Fighter({ def, sprites: fakeSpritesOf(def), stage, slot: 'p1', label: 'P1', spawn: { x: foeX, y: foeY, facing: -1 } });
  const inputs = [];
  const cpu = new Fighter({
    def, sprites: fakeSpritesOf(def), stage, slot: 'p2', label: 'CPU', spawn: { x: cpuX, facing: 1 },
    controller: {
      kind: 'cpu',
      getInput: (self, dt, ctx) => {
        const out = controller.getInput(self, dt, ctx);
        inputs.push({ ...out, grounded: self.body.grounded });
        return out;
      },
      attackFacing: (self) => controller.attackFacing?.(self) ?? null,
    },
  });
  foe.opponent = cpu;
  cpu.opponent = foe;
  const fighters = [foe, cpu];
  const ctx = { stage, gravity: G, battle: { stage, projectiles: [], clones: [], fighters, score: { p1: 0, p2: 0 }, timeLeft: 99 } };
  const combat = new CombatSystem();
  const takeoffs = [];
  const step = () => {
    for (const f of fighters) f.update(DT, ctx);
    separateFighters(foe, cpu, stage);
    for (const f of fighters) resolveSolidOverlap(f.body, stage);
    combat.update(fighters, [], []);
    if (cpu.superJumpTakeoff) takeoffs.push('super');
    else if (inputs.at(-1).jumpPressed && inputs.at(-1).grounded && cpu.body.vy < 0 && !cpu.body.grounded) takeoffs.push('normal');
  };
  return { cpu, foe, step, takeoffs, inputs };
}

// ---- Prediction and capabilities ---------------------------------------------------------

test('the CPU\'s arcs are the Fighter\'s own: the normal jump and the Super Jump, standing or running, step for step', () => {
  const stage = new StageCollision(stageMap());
  for (const [jump, press] of [['ground', JUMP], ['super', SUPER]]) {
    for (const run of [false, true]) {
      const { fighter, step } = makeFighter({ stage, x: 600 });
      if (run) for (let i = 0; i < 30; i++) step({ runRight: true });
      const b = fighter.body;
      const st = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: true, ground: b.ground, halfW: b.halfW, height: b.height };
      const track = arcTrack(new Track(), stage, G, st, { jump, dir: run ? 1 : 0, steps: 120 });
      const held = run ? { runRight: true } : {};
      step({ ...press, ...held });
      for (let k = 0; k < track.len; k++) {
        assert.ok(Math.abs(track.y[k] - b.y) < 1e-6, `${jump}${run ? ', running' : ''}: step ${k} y ${track.y[k]} vs ${b.y}`);
        assert.ok(Math.abs(track.x[k] - b.x) < 1e-6, `${jump}${run ? ', running' : ''}: step ${k} x`);
        if (k + 1 < track.len) step(held);
      }
      assert.ok(track.g[track.len - 1], 'it lands');
    }
  }
  // An air jump too, from the top of a normal jump.
  const { fighter, step } = makeFighter({ stage, x: 600 });
  step(JUMP);
  while (fighter.body.vy < 0) step({});
  const b = fighter.body;
  const air = arcTrack(new Track(), stage, G, { x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: false, halfW: b.halfW, height: b.height }, { jump: 'air', steps: 120 });
  step(JUMP);
  for (let k = 0; k < air.len - 1; k++) {
    assert.ok(Math.abs(air.y[k] - b.y) < 1e-6, `air jump: step ${k}`);
    step({});
  }
});

test('its capabilities read the universal jumps: the normal jump, the Super Jump, the air jump, with no higher-jump field left', () => {
  const { fighter } = makeFighter();
  const m = analyzeCapabilities(fighter).movement;
  assert.equal(m.jumpVelocity, MOVEMENT.jumpVelocity);
  assert.equal(m.superJumpVelocity, MOVEMENT.superJumpVelocity);
  assert.equal(m.airJumpVelocity, MOVEMENT.airJumpVelocity);
  assert.ok(Math.abs(m.jumpHeight - MOVEMENT.jumpVelocity ** 2 / (2 * G)) < 1e-9);
  assert.ok(Math.abs(m.superJumpHeight - MOVEMENT.superJumpVelocity ** 2 / (2 * G)) < 1e-9);
  assert.ok(Math.abs(m.airJumpHeight - MOVEMENT.airJumpVelocity ** 2 / (2 * G)) < 1e-9);
  assert.ok(Math.abs(m.superJumpAirtime - (2 * MOVEMENT.superJumpVelocity) / G) < 1e-9);
  assert.ok(m.superJumpHeight > m.jumpHeight * 2 && m.superJumpAirtime > m.normalJumpAirtime);
  for (const gone of ['highJumpHeight', 'highJumpWindow', 'airtime']) assert.equal(gone in m, false, gone);
});

// ---- Choosing the jump ------------------------------------------------------------------------

// A floor with one wide one-way platform `rise` units above it, the
// opponent standing on it.
function onPlatform(rise, difficulty = 'hard', seed = 3) {
  const stage = new StageCollision(stageMap({ platforms: [{ id: 'up', x: 1050, y: 800 - rise, w: 360, h: 16 }] }));
  const ai = new CombatAIController({ difficulty, rng: mulberry32(seed) });
  const w = world({ stage, controller: ai, cpuX: 700, foeX: 1230, foeY: 800 - rise });
  let reached = false;
  for (let i = 0; i < 60 * 8 && !reached; i++) {
    w.step();
    reached = w.cpu.body.grounded && w.cpu.body.ground?.id === 'up';
    w.foe.body.x = 1230;
  }
  return { ...w, reached };
}

test('onto a footing the normal jump reaches it jumps normally; onto one only the Super Jump reaches, it Super Jumps', () => {
  const low = onPlatform(80);
  assert.ok(low.reached, 'it reached the low platform');
  assert.ok(low.takeoffs.includes('normal'), `the normal jump: ${low.takeoffs}`);
  assert.equal(low.takeoffs.filter((t) => t === 'super').length, 0, 'no Super Jump where the normal one reaches');
  const high = onPlatform(200);
  assert.ok(high.reached, 'it reached the high platform');
  assert.ok(high.takeoffs.includes('super'), `the Super Jump: ${high.takeoffs}`);
  // Never a stream of failed jumps: a handful at most.
  assert.ok(high.takeoffs.length <= 4, `${high.takeoffs.length} jumps`);
  // Every Super Jump by the chord a player makes, Down never held on the
  // ground otherwise.
  for (const o of [...low.inputs, ...high.inputs]) if (o.grounded && o.down) assert.ok(o.jumpPressed && o.downPressed);
});

test('every level reaches the high platform with the Super Jump, by legal inputs only', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const r = onPlatform(200, difficulty, 5);
    assert.ok(r.reached, `${difficulty}: reached it`);
    assert.ok(r.takeoffs.includes('super'), `${difficulty}: ${r.takeoffs}`);
  }
});

test('the training CPU follows onto high ground with the Super Jump, and onto low ground with the normal jump', () => {
  for (const [rise, want] of [[200, 'super'], [80, 'normal']]) {
    const stage = new StageCollision(stageMap({ platforms: [{ id: 'up', x: 1050, y: 800 - rise, w: 300, h: 16 }] }));
    const w = world({ stage, controller: new TrainingAIController({ rng: mulberry32(2) }), cpuX: 1000, foeX: 1200, foeY: 800 - rise });
    let reached = false;
    for (let i = 0; i < 60 * 10 && !reached; i++) {
      w.step();
      reached = w.cpu.body.grounded && w.cpu.body.ground?.id === 'up';
    }
    assert.ok(reached, `${rise} up: reached it`);
    assert.equal(w.takeoffs[0], want, `${rise} up: ${w.takeoffs}`);
  }
});

// ---- In a real match ----------------------------------------------------------------------------

// Real ground jumps each side takes off with in a Watch Mode match at
// `difficulty` on `map`: { normal, super }.
async function matchJumps(difficulty, map, seed, seconds = 45) {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../../js/game/battle.js');
  const { getMap } = await import('../../js/data/maps.js');
  const [a, b] = playableCharacters();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(map), mode: 'watch', seed, difficulty,
    p1Def: a, p2Def: b, p1Sprites: fakeSpritesOf(a), p2Sprites: fakeSpritesOf(b), input: { flush() {}, sample: () => ({}) },
  });
  battle.p1.controller = new CombatAIController({ difficulty, rng: mulberry32(seed) });
  battle.p2.controller = new CombatAIController({ difficulty, rng: mulberry32(seed + 1) });
  battle.setPhase('fight');
  const out = { normal: 0, super: 0 };
  const was = new Map(battle.fighters.map((f) => [f, f.body.grounded]));
  for (let i = 0; i < seconds * 60 && !battle.matchOver; i++) {
    battle.update(DT);
    for (const f of battle.fighters) {
      if (f.superJumpTakeoff) out.super++;
      else if (was.get(f) && !f.body.grounded && f.body.vy < -MOVEMENT.jumpVelocity + 100 && f.body.vy > -MOVEMENT.jumpVelocity - 1) out.normal++;
      was.set(f, f.body.grounded);
    }
  }
  battle.destroy();
  return out;
}

test('in CPU-versus-CPU matches every level Super Jumps, and jumps normally more often', async () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const total = { normal: 0, super: 0 };
    for (const [map, seed] of [['city', 7], ['asperitas', 8], ['desert', 9]]) {
      const r = await matchJumps(difficulty, map, seed);
      total.normal += r.normal;
      total.super += r.super;
    }
    assert.ok(total.super > 0, `${difficulty}: ${JSON.stringify(total)}`);
    assert.ok(total.super < total.normal, `${difficulty}: not every jump a Super Jump (${JSON.stringify(total)})`);
  }
});

test('a CPU\'s Super Jump is a player\'s, step for step: no jump speed of its own', () => {
  const stage = new StageCollision(stageMap());
  // The player's: Down and Jump pressed together, nothing held after.
  const player = makeFighter({ stage, x: 800 });
  player.step({});
  const mine = [];
  player.step(SUPER);
  mine.push(player.fighter.body.y);
  while (!player.fighter.grounded) mine.push(player.step({}).body.y);
  // The CPU's, asked for by a directive, on the same spot.
  const ai = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(1) });
  const w = world({ stage, controller: ai, cpuX: 800, foeX: 1700 });
  w.step();
  ai.command({ jump: 'super', dir: 0 });
  const theirs = [];
  for (let i = 0; i < 200 && theirs.length < mine.length; i++) {
    w.step();
    if (theirs.length || !w.cpu.body.grounded) theirs.push(w.cpu.body.y);
  }
  // The same rise to the same apex (on the way down a CPU may fast-fall,
  // as a player may).
  const top = mine.indexOf(Math.min(...mine));
  assert.deepEqual(theirs.slice(0, top + 1), mine.slice(0, top + 1));
  assert.equal(w.cpu.movement, MOVEMENT, 'the universal movement, nothing else');
});

test('Super Jumps play the same at 30, 60 and 144 Hz frames: a player\'s and a CPU\'s, their dust included', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../../js/game/battle.js');
  const { getMap } = await import('../../js/data/maps.js');
  const [a, b] = playableCharacters();
  const run = (hz) => {
    let t = 0;
    const input = {
      flush() {},
      // Held input from the simulation clock: presses land on the same step whatever the frame rate.
      sample() {
        const i = Math.round(t / DT);
        t += DT;
        const k = i % 90;
        return { runRight: k < 25, runLeft: k > 60, jump: k === 30, jumpPressed: k === 30, down: k === 30 && i % 180 < 90, downPressed: k === 30 && i % 180 < 90 };
      },
    };
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('city'), p1Def: a, p2Def: b, p1Sprites: fakeSpritesOf(a), p2Sprites: fakeSpritesOf(b), input,
    });
    const ai = new CombatAIController({ difficulty: 'hard', rng: mulberry32(4) });
    battle.p2.controller = ai;
    battle.setPhase('fight');
    let dust = 0;
    const add = battle.fx.addSuperJumpDust.bind(battle.fx);
    battle.fx.addSuperJumpDust = (takeoff) => {
      dust++;
      add(takeoff);
    };
    for (let s = 0; s < 6 * hz; s++) {
      if (s === hz) ai.command({ jump: 'super', dir: 0 });
      battle.frame(1 / hz + 1e-9);
    }
    const out = [battle.p1.body.x, battle.p1.body.y, battle.p2.body.x, battle.p2.body.y, battle.p1.combat.launchPoint, battle.p2.combat.launchPoint, dust];
    battle.destroy();
    return out;
  };
  const at60 = run(60);
  assert.ok(at60[6] >= 2, `Super Jumps were made: ${at60[6]}`);
  assert.deepEqual(run(30), at60);
  assert.deepEqual(run(144), at60);
});
