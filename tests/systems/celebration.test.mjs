// Run with node --test tests/systems/celebration.test.mjs (no dependencies).
// The match's end and the celebration after it (js/game/battle.js,
// js/game/ai/celebration.js) on real Battles: the match ends exactly once
// and the world plays on; the player keeps their controls; a winning CPU
// celebrates (ability spam from its own moveset, a run into the Void, idle,
// a dash dance, jump spam), a losing one stays calm and a draw moves both
// harmlessly, on a seeded stream of its own; nobody respawns after the
// match, no fall scores and the result never changes; a restart gives the
// CPUs their combat AI back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, CELEBRATION_STREAMS, BATTLE_MODES } from '../../js/game/battle.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import {
  CelebrationController, CELEBRATIONS, LOSER_CELEBRATIONS, DRAW_CELEBRATIONS,
} from '../../js/game/ai/celebration.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { getMap } from '../../js/data/maps.js';
import { playableCharacters } from '../../js/data/characters.js';
import { mulberry32 } from '../../js/core/utils.js';
import { def, DT, fakeSpritesOf } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// A Battle in its fight phase. In Quick Battle Player 1 holds `script.held`.
function battleOf({ mode = 'quick-battle', mapId = 'desert', seed = 3, p1Def = def, p2Def = def } = {}) {
  const script = { held: {} };
  const input = { flush() {}, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), mode, p1Def, p2Def,
    p1Sprites: fakeSpritesOf(p1Def), p2Sprites: fakeSpritesOf(p2Def), input, seed, difficulty: 'hard',
  });
  battle.setPhase('fight');
  const run = (steps = 1, each = null) => {
    for (let i = 0; i < steps; i++) {
      battle.update(DT);
      each?.(i);
    }
  };
  return { battle, script, run };
}

// Ends the match with `winner` ahead on points (null: a draw).
function finish(battle, winner) {
  if (winner) battle.score[winner] = battle.pointsToWin - 1;
  battle.timeLeft = 0;
  battle.finishMatch();
}

const seconds = (s) => Math.round(s / DT);

// Keeps `controller` on `behaviour` for as long as the test runs.
function hold(controller, behaviour, self) {
  controller.choose(behaviour, self);
  controller.timer = Infinity;
}

const intoVoid = (battle, f) => {
  Object.assign(f.body, { y: battle.stage.void.bottom + 100, vy: 0, grounded: false, ground: null });
};

// ---- The match's end ---------------------------------------------------------------------

test('the match ends exactly once, on its result, and the world plays on: Team I, Team II, by time, by points, overtime, a draw', () => {
  const cases = [
    ['p1', (b) => { b.score.p1 = 2; intoVoid(b, b.p2); }, 'void'],
    ['p2', (b) => { b.score.p2 = 2; intoVoid(b, b.p1); }, 'void'],
    ['p1', (b) => { b.score.p1 = 1; b.timeLeft = DT / 2; }, 'points'],
    ['p2', (b) => { b.p1.combat.launchPoint = 40; b.timeLeft = DT / 2; b.overtimeSeconds = 0; }, 'time'],
  ];
  for (const [winner, set, reason] of cases) {
    const { battle, run } = battleOf();
    let finishes = 0;
    const original = battle.finishMatch;
    battle.finishMatch = function () { finishes += this.final ? 0 : 1; return original.call(this); };
    set(battle);
    run();
    assert.equal(battle.phase, 'celebration', `${winner} ${reason}`);
    assert.deepEqual(battle.result, { outcome: winner, reason });
    const final = battle.final;
    assert.ok(Object.isFrozen(final), 'frozen');
    assert.equal(final.winner, winner);
    run(seconds(3));
    battle.finishMatch();
    assert.equal(finishes, 1, 'finalized exactly once');
    assert.equal(battle.final, final, 'the same result, untouched');
    assert.equal(battle.phase, 'celebration', 'no new match, round or overtime');
  }
  // Overtime: decided by points, by the lower Launch Point, or a draw, at
  // that very moment; recovery afterwards changes nothing.
  for (const [score, [a, b], outcome, reason] of [
    [{ p1: 1, p2: 0 }, [90, 0], 'p1', 'overtimePoints'],
    [{ p1: 1, p2: 1 }, [20, 60], 'p1', 'overtimeLaunchPoint'],
    [{ p1: 1, p2: 1 }, [30, 30], 'draw', 'overtimeLaunchPoint'],
  ]) {
    const { battle, run } = battleOf();
    battle.timeLeft = DT / 2;
    run();
    assert.equal(battle.overtime, true);
    Object.assign(battle.score, score);
    battle.p1.combat.launchPoint = a;
    battle.p2.combat.launchPoint = b;
    battle.timeLeft = DT / 2;
    run();
    assert.deepEqual(battle.result, { outcome, reason });
    assert.deepEqual(battle.final.launchPoints, { p1: a, p2: b }, 'the Launch Points it ended on');
    run(seconds(12));
    for (const [f, was] of [[battle.p1, a], [battle.p2, b]]) assert.ok(f.combat.launchPoint < was || was === 0, 'recovered since');
    assert.deepEqual(battle.result, { outcome, reason }, 'and still the same result');
  }
});

test('the player keeps their controls after the match: runs, jumps and attacks, the match long over', () => {
  const { battle, script, run } = battleOf();
  const { p1 } = battle;
  finish(battle, 'p1');
  assert.equal(p1.controller instanceof PlayerController, true, 'the player\'s own controller');
  assert.equal(p1.inputLocked, false);
  run(seconds(1));
  const x = p1.body.x;
  script.held = { runRight: true };
  run(20);
  assert.ok(p1.body.x > x + 10, 'runs');
  script.held = { jump: true, jumpPressed: true };
  run();
  script.held = {};
  run(5);
  assert.equal(p1.body.grounded, false, 'jumps');
  run(seconds(1.5));
  script.held = { attack1: true, attack1Pressed: true };
  run();
  script.held = {};
  assert.ok(p1.combat.attack, 'attacks');
});

test('a winning CPU celebrates, a losing one stays calm, a draw moves both harmlessly; each on its own seeded stream', () => {
  // Quick Battle's CPU winning against the player.
  let { battle } = battleOf();
  const ai = battle.p2.controller;
  finish(battle, 'p2');
  assert.ok(battle.p2.controller instanceof CelebrationController);
  assert.deepEqual(battle.p2.controller.behaviours, CELEBRATIONS);
  assert.ok(battle.p1.controller instanceof PlayerController);
  assert.notEqual(battle.p2.controller.rng, ai.rng, 'never the combat AI\'s randomness');
  // Losing to the player.
  ({ battle } = battleOf());
  finish(battle, 'p1');
  assert.deepEqual(battle.p2.controller.behaviours, LOSER_CELEBRATIONS);
  // Watch Mode: CPU I or CPU II winning, and a draw.
  for (const [winner, p1, p2] of [['p1', CELEBRATIONS, LOSER_CELEBRATIONS], ['p2', LOSER_CELEBRATIONS, CELEBRATIONS], [null, DRAW_CELEBRATIONS, DRAW_CELEBRATIONS]]) {
    ({ battle } = battleOf({ mode: 'watch' }));
    finish(battle, winner);
    assert.deepEqual([battle.p1.controller.behaviours, battle.p2.controller.behaviours], [p1, p2], `winner ${winner}`);
  }
  // The streams: one per side, apart from the CPUs' combat streams.
  const combat = Object.values(BATTLE_MODES).flatMap((m) => [m.p1.stream, m.p2.stream]).filter((s) => s != null);
  assert.ok(!combat.includes(CELEBRATION_STREAMS.p1) && !combat.includes(CELEBRATION_STREAMS.p2));
  assert.notEqual(CELEBRATION_STREAMS.p1, CELEBRATION_STREAMS.p2);
});

test('the celebration is deterministic with a known seed: the same seed, the same celebration step for step', () => {
  const play = (seed) => {
    const { battle, run } = battleOf({ mode: 'watch', seed });
    finish(battle, 'p1');
    const path = [];
    run(seconds(30), () => path.push(Math.round(battle.p1.body.x * 100), battle.p1.lostToVoid ? 1 : 0));
    return { history: battle.celebrations.p1.celebration.history.join(','), path: path.join(',') };
  };
  assert.deepEqual(play(11), play(11));
  const others = [12, 13, 14].map((s) => play(s).history);
  assert.ok(others.some((h) => h !== play(11).history), 'another seed, another celebration');
  // The controller on its own: the same rng, the same picks.
  const picks = (seed) => {
    const c = new CelebrationController({ rng: mulberry32(seed), behaviours: CELEBRATIONS.filter((b) => b !== 'void') });
    for (let i = 0; i < 40; i++) c.pick(null);
    return c.history;
  };
  assert.deepEqual(picks(5), picks(5));
});

test('a celebration varies: every behaviour comes up, never the same one twice running, never all five by force', () => {
  const seen = new Set();
  const firsts = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const c = new CelebrationController({ rng: mulberry32(seed) });
    for (let i = 0; i < 6; i++) {
      c.pick(null);
      if (c.behaviour === 'void') break;
    }
    firsts.add(c.history[0]);
    c.history.forEach((b, i) => {
      seen.add(b);
      if (i) assert.notEqual(b, c.history[i - 1]);
    });
  }
  assert.deepEqual([...seen].sort(), [...CELEBRATIONS].sort(), 'all five');
  assert.ok(firsts.size >= 4, 'celebrations start differently');
  // The Void run is the end: nothing is picked after it.
  const c = new CelebrationController({ rng: mulberry32(1) });
  c.choose('void', null);
  assert.equal(c.timer, Infinity);
});

// ---- The five behaviours ---------------------------------------------------------------------

test('ability spam presses only buttons of the fighter\'s own moveset, and real moves come out, for every playable fighter', () => {
  for (const fighterDef of playableCharacters()) {
    const { battle, run } = battleOf({ p1Def: def, p2Def: fighterDef, seed: 7 });
    finish(battle, 'p2');
    const cpu = battle.p2;
    const c = cpu.controller;
    hold(c, 'abilities', cpu);
    const set = readMoveset(cpu);
    const allowed = new Set(['jump', ...set.melee.map((m) => m.action), ...set.ranged.map((m) => m.action),
      ...set.specials.map((m) => m.action), ...(set.deflect ? [set.deflect.action] : [])]);
    const pressed = new Set();
    const started = new Set();
    run(seconds(6), () => {
      for (const [k, v] of Object.entries(c.out)) if (v && k.endsWith('Pressed')) pressed.add(k.slice(0, -'Pressed'.length));
      if (cpu.combat.attack) started.add(cpu.combat.attack.def.id);
      if (cpu.technique) started.add(cpu.technique.def.id);
    });
    for (const action of pressed) assert.ok(allowed.has(action), `${fighterDef.id}: ${action} is its own`);
    assert.ok(pressed.size >= 2, `${fighterDef.id}: several buttons (${[...pressed]})`);
    assert.ok(started.size >= 1, `${fighterDef.id}: real moves (${[...started]})`);
    assert.equal(cpu.lostToVoid, false, `${fighterDef.id}: never carried off`);
  }
});

test('the dash dance turns left and right, fast, round where it began, and never off a ledge', () => {
  const { battle, run } = battleOf({ mode: 'watch' });
  finish(battle, 'p1');
  const f = battle.p1;
  const c = f.controller;
  run(seconds(1));
  hold(c, 'dashDance', f);
  const from = f.body.x;
  let turns = 0;
  let last = 0;
  let far = 0;
  run(seconds(3), () => {
    const dir = c.out.runLeft ? -1 : c.out.runRight ? 1 : 0;
    if (dir && last && dir !== last) turns++;
    if (dir) last = dir;
    far = Math.max(far, Math.abs(f.body.x - from));
    assert.ok(!(c.out.runLeft && c.out.runRight));
  });
  assert.ok(turns >= 10, `rapid turns (${turns})`);
  assert.ok(far > 10 && far < 160, `in a small area (${far.toFixed(0)})`);
  // At a ledge it turns back instead of running off.
  const edge = battle.stage.main.right - f.body.halfW - 4;
  Object.assign(f.body, { x: edge, vx: 0 });
  hold(c, 'dashDance', f);
  run(seconds(4));
  assert.equal(f.lostToVoid, false);
  assert.ok(f.body.grounded);
});

test('jump spam: a fresh Jump press each time, let go in between, and the fighter jumps again and again, air jumps included', () => {
  const { battle, run } = battleOf({ mode: 'watch' });
  finish(battle, 'p1');
  const f = battle.p1;
  const c = f.controller;
  run(seconds(1));
  hold(c, 'jump', f);
  let presses = 0;
  let pressedLast = false;
  let takeoffs = 0;
  let airJumps = 0;
  let grounded = f.body.grounded;
  let jumpsLeft = f.airJumps;
  run(seconds(4), () => {
    if (c.out.jumpPressed) {
      presses++;
      assert.equal(pressedLast, false, 'never two presses in a row');
    }
    pressedLast = c.out.jumpPressed;
    if (grounded && !f.body.grounded) takeoffs++;
    if (f.airJumps < jumpsLeft) airJumps++;
    grounded = f.body.grounded;
    jumpsLeft = f.airJumps;
  });
  assert.ok(presses >= 8, `presses (${presses})`);
  assert.ok(takeoffs >= 2, `jumps from the ground (${takeoffs})`);
  assert.ok(airJumps >= 2, `air jumps (${airJumps})`);
  assert.equal(f.lostToVoid, false);
});

test('idle holds nothing: the fighter stands still in its idle, a while at a time', () => {
  const { battle, run } = battleOf({ mode: 'watch' });
  finish(battle, 'p1');
  const f = battle.p1;
  const c = f.controller;
  run(seconds(1));
  c.choose('idle', f);
  assert.ok(c.timer >= 1, 'a meaningful while');
  c.timer = Infinity;
  run(seconds(2), () => {
    for (const [k, v] of Object.entries(c.out)) assert.equal(v, false, k);
  });
  assert.ok(Math.abs(f.body.vx) < 1e-6 && f.body.grounded, 'still');
});

test('the Void run takes the CPU through the real elimination, once; it never respawns and nothing changes', () => {
  for (const [mapId, overtime] of [['desert', false], ['adamaris', false], ['city', true]]) {
    const { battle, run } = battleOf({ mode: 'watch', mapId });
    if (overtime) {
      battle.score.p1 = 1;
      battle.score.p2 = 1;
      battle.timeLeft = DT / 2;
      run();
      battle.score.p1 = 2;
      battle.timeLeft = DT / 2;
      run();
      assert.notEqual(battle.stage.void, battle.stage.baseVoid, 'overtime closed the Void in');
      assert.ok(battle.voidPressure > 0.99);
    } else {
      finish(battle, 'p1');
    }
    assert.equal(battle.matchOver, true);
    const f = battle.p1;
    const c = f.controller;
    let bursts = 0;
    const add = battle.fx.addElimination.bind(battle.fx);
    battle.fx.addElimination = (x) => { bursts += x === f ? 1 : 0; return add(x); };
    c.choose('void', f);
    const result = battle.final;
    const score = { ...battle.score };
    let steps = 0;
    while (!f.lostToVoid && steps++ < seconds(20)) run();
    assert.equal(f.lostToVoid, true, `${mapId}: into the Void`);
    assert.equal(bursts, 1, 'the usual elimination');
    const history = c.history.length;
    run(seconds(6));
    assert.equal(f.lostToVoid, true, 'never back');
    assert.equal(f.respawnTimer, null);
    assert.equal(c.history.length, history, 'it chooses nothing more');
    assert.deepEqual(battle.score, score, 'no point');
    assert.equal(battle.final, result, 'the result stands');
  }
});

// ---- No respawn after the match -------------------------------------------------------------

test('after the match nobody respawns: the player, a CPU, one already waiting, both together; the world still runs', () => {
  const { battle, run } = battleOf();
  const { p1, p2 } = battle;
  // Player 1 falls during the match and waits to respawn; time runs out.
  battle.score.p2 = 1;
  intoVoid(battle, p1);
  run();
  assert.deepEqual(battle.score, { p1: 0, p2: 2 });
  assert.ok(p1.respawnTimer > 0, 'waiting');
  battle.timeLeft = DT / 2;
  run();
  assert.equal(battle.phase, 'celebration');
  assert.equal(p1.respawnTimer, null, 'the wait is called off');
  run(seconds(4));
  assert.equal(p1.lostToVoid, true, 'and it stays out');
  // The CPU falls too: both out, no point, the world runs on.
  intoVoid(battle, p2);
  run();
  assert.equal(p2.lostToVoid, true);
  assert.deepEqual(battle.cameraTargets, [null, null]);
  const t = battle.fxTime;
  run(seconds(4));
  assert.deepEqual([p1.lostToVoid, p2.lostToVoid], [true, true], 'both remain eliminated');
  assert.deepEqual(battle.score, { p1: 0, p2: 2 }, 'no post-match point');
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'points' });
  assert.equal(battle.phase, 'celebration', 'no new announcement or overtime');
  assert.ok(battle.fxTime >= t);
  // The final point's loser stays out as well.
  const other = battleOf();
  other.battle.score.p1 = 2;
  intoVoid(other.battle, other.battle.p2);
  other.run(seconds(5));
  assert.equal(other.battle.p2.lostToVoid, true);
  assert.equal(other.battle.p2.respawnTimer, null);
});

test('during the match, falls still score and respawn after 2 s exactly as before', () => {
  const { battle, run } = battleOf();
  intoVoid(battle, battle.p2);
  run();
  assert.deepEqual(battle.score, { p1: 1, p2: 0 });
  run(seconds(2));
  assert.equal(battle.p2.lostToVoid, false, 'back');
  assert.equal(battle.matchOver, false);
});

test('a restart or rematch gives each CPU its combat AI back, reset, and clears the result and the statistics', () => {
  const { battle, run } = battleOf({ mode: 'watch' });
  const [a, b] = [battle.p1.controller, battle.p2.controller];
  run(seconds(2));
  finish(battle, 'p2');
  run(seconds(2));
  assert.ok(battle.p2.controller instanceof CelebrationController);
  battle.restart();
  assert.deepEqual([battle.p1.controller, battle.p2.controller], [a, b]);
  assert.ok(a instanceof CombatAIController && b instanceof CombatAIController);
  assert.equal(a.plan, null, 'planning afresh');
  assert.equal(battle.final, null);
  assert.equal(battle.matchOver, false);
  assert.equal(battle.celebrations, null);
  assert.equal(battle.phase, 'intro');
  assert.deepEqual(battle.stats.snapshot(), { p1: battle.stats.snapshot().p1, p2: battle.stats.snapshot().p2 });
  assert.ok(Object.values(battle.stats.snapshot().p1).every((v) => v === 0), 'statistics at 0');
});
