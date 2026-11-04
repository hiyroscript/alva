// Run with node --test tests/integration/match-score.test.mjs (no dependencies).
// Quick Battle's match: first to three points, a point for each time the
// opponent falls into the Void, the fallen fighter out of play for two
// seconds and then back at its spawn in a clean neutral state; the
// simultaneous-fall rule, the final point ending the match at once,
// time-up during a respawn wait, and rematches. Runs the real Battle, Fighter, CombatSystem and
// physics on a stub canvas (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { CONFIG } from '../../js/config.js';
import { def, DT, fakeSprites } from '../helpers/fighter-harness.mjs';

const RESPAWN_STEPS = Math.round(CONFIG.battle.respawnSeconds / DT);

// Stage themes build Path2D art, which Node lacks: a do-nothing stand-in.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// A Quick Battle in its fight phase, both fighters driven by `script`
// (Player 1's input; the CPU stands still unless given `cpu` input).
function match(mapId = 'desert') {
  const sprites = fakeSprites();
  const script = { held: {}, cpu: {} };
  const input = { flushes: 0, flush() { this.flushes++; }, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.p2.controller = { getInput: () => ({ ...script.cpu }) };
  battle.setPhase('fight');
  const run = (steps = 1) => {
    for (let i = 0; i < steps; i++) battle.update(DT);
  };
  return { battle, script, input, run };
}

// Carries `f` past the Void's fixed line; its next step takes it.
const intoVoid = (battle, f) => {
  Object.assign(f.body, { y: battle.stage.void.bottom + 100, vy: 0, grounded: false, ground: null });
};

test('config: first to 3 points, 2 seconds out of play', () => {
  assert.equal(CONFIG.battle.pointsToWin, 3);
  assert.equal(CONFIG.battle.respawnSeconds, 2);
  const { battle } = match();
  assert.equal(battle.pointsToWin, CONFIG.battle.pointsToWin);
  assert.equal(battle.round, 1, 'the round is not the score');
});

test('both start at 0; each fall scores the opponent exactly one point, never the one that fell, until 3 wins', () => {
  const { battle, run } = match();
  const { p1, p2 } = battle;
  assert.deepEqual(battle.score, { p1: 0, p2: 0 });
  for (const expected of [1, 2]) {
    intoVoid(battle, p2);
    run();
    assert.deepEqual(battle.score, { p1: expected, p2: 0 }, `fall ${expected}`);
    assert.equal(battle.phase, 'fight', 'the match goes on');
    assert.equal(p2.lostToVoid, true);
    run(RESPAWN_STEPS);
    assert.equal(p2.lostToVoid, false, 'back for more');
    assert.deepEqual(battle.score, { p1: expected, p2: 0 }, 'the points stay through the respawn');
  }
  // Player 1 falls once: the CPU's point.
  intoVoid(battle, p1);
  run();
  assert.deepEqual(battle.score, { p1: 2, p2: 1 });
  run(RESPAWN_STEPS);
  // The third: the match is won at once.
  intoVoid(battle, p2);
  run();
  assert.deepEqual(battle.score, { p1: 3, p2: 1 });
  assert.equal(battle.phase, 'celebration', 'the match is over at once, the world going on');
  assert.equal(battle.matchOver, true);
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'void' });
  assert.equal(p2.respawnTimer, null, 'the final loser does not respawn');
  run(RESPAWN_STEPS * 2);
  assert.equal(p2.lostToVoid, true, 'and stays out');
  assert.equal(battle.phase, 'celebration', 'nothing restarts by itself');
  assert.deepEqual(battle.score, { p1: 3, p2: 1 });
});

test('a fall takes the fighter out of play at once; it is back exactly 2 s later, at its own spawn, clean and neutral', () => {
  const { battle, run, script, input } = match();
  const { p1, p2 } = battle;
  const [spawn] = battle.map.spawnPoints;
  // Make a mess to clear: Launch Point, empty Energy, a raised Shield, the
  // Clone Attack's and the Sphere Rush's cooldowns, a stun and a speed.
  p1.combat.launchPoint = 64;
  p1.combat.setEnergy(0);
  p1.combat.shielding = true;
  p1.combat.abilityCooldowns.start('attack3', 5);
  p1.combat.abilityCooldowns.start('attack4', 5);
  intoVoid(battle, p1);
  p1.body.vx = 400;
  run();
  assert.equal(p1.lostToVoid, true);
  assert.deepEqual(battle.inPlay, [p2], 'out of play: not updated, collided, hit or drawn');
  assert.equal(battle.secondary, p2);
  assert.deepEqual(battle.cameraTargets, [p2, null], 'the camera follows the CPU meanwhile');
  const frozen = { x: p1.body.x, y: p1.body.y };
  // Not a step early; its Launch Point stays until it is back.
  script.held = { runRight: true, jump: true, jumpPressed: true };
  for (let i = 1; i < RESPAWN_STEPS; i++) {
    run();
    assert.equal(p1.lostToVoid, true, `still out after ${i} steps`);
    assert.equal(p1.combat.launchPoint, 64);
    assert.deepEqual({ x: p1.body.x, y: p1.body.y }, frozen, 'frozen');
  }
  const flushes = input.flushes;
  script.held = {};
  run();
  assert.equal(p1.lostToVoid, false, 'back at exactly 2.0 s');
  assert.equal(p1.respawnTimer, null);
  assert.ok(input.flushes > flushes, 'presses buffered while it was out are dropped');
  assert.deepEqual([p1.body.x, p1.body.vx, p1.body.vy, p1.body.grounded], [spawn.x, 0, 0, true]);
  assert.equal(p1.body.y, battle.map.mainStage.top, 'on the stage, never inside a solid');
  assert.equal(p1.combat.launchPoint, 0);
  assert.deepEqual([p1.combat.energy, p1.combat.energyExhausted], [100, false], 'Energy full, not exhausted');
  assert.deepEqual([p1.combat.shielding, p1.combat.shieldStun], [false, 0], 'the Shield down');
  assert.equal(p1.combat.abilityCooldowns.size, 0, 'A3 and A4 ready');
  assert.deepEqual([p1.combat.stun, p1.combat.hitstop, p1.combat.attack, p1.technique, p1.dash], [0, 0, null, null, null]);
  assert.equal(p1.state, 'idle');
  assert.deepEqual(battle.inPlay, [p1, p2]);
  assert.deepEqual(battle.cameraTargets, [p1, p2]);
  // Active at once: no respawn invulnerability, platform or wait.
  assert.equal(p1.canAct(), true);
  assert.equal('invulnerable' in p1.combat, false);
});

test('whatever aimed at a fallen fighter or came from it goes: summons, clones, projectiles, its own technique; it comes back unparalysed', () => {
  const { battle, run, script } = match();
  const { p1, p2 } = battle;
  p2.body.x = p1.body.x + 120;
  run(10);
  // Unlimited Void paralyses the CPU where it stands.
  script.held = { attack4: true, attack4Pressed: true };
  run();
  script.held = {};
  for (let i = 0; i < 120 && !p2.combat.immobilized; i++) run();
  assert.ok(p2.combat.immobilized, 'paralysed');
  p1.summons.push({ id: 'attack3', target: p2 });
  // A projectile of the CPU's own, far off (it strikes nothing).
  const far = { x: -1e5, y: -1e5, w: 1, h: 1 };
  battle.projectiles.push({ alive: true, owner: p2, def: {}, update() {}, interpolate() {}, hitbox: (out) => Object.assign(out, far) });
  intoVoid(battle, p2);
  run();
  assert.equal(p2.lostToVoid, true);
  assert.deepEqual(p1.summons, []);
  assert.ok(battle.clones.every((c) => c.target !== p2 && c.owner !== p2));
  assert.ok(battle.projectiles.every((p) => p.owner !== p2), 'its own projectile went too');
  // Back at its spawn once the wait is over: no paralysis left.
  run(RESPAWN_STEPS + 1);
  assert.equal(p2.lostToVoid, false);
  assert.equal(p2.combat.immobilized, false);
  assert.equal(p2.combat.paralysis, 0);

  // A technique cast by the one that falls ends there, releasing nothing.
  run(30);
  script.cpu = { attack5: true, attack5Pressed: true };
  run();
  script.cpu = {};
  const purple = p2.technique;
  assert.equal(purple?.action, 'attack5', 'Hollow Purple under way');
  intoVoid(battle, p2);
  run();
  assert.equal(p2.technique, null);
  // Carried off the ground, it is over before the Void even takes it.
  assert.ok(['ground', 'void'].includes(purple.endReason), purple.endReason);
  assert.equal(purple.released, false);
  run(120);
  assert.ok(battle.projectiles.every((p) => p.owner !== p2), 'and nothing came out of it');
});

test('simultaneous falls score nothing: both respawn, and play goes on', () => {
  const { battle, run } = match();
  const { p1, p2 } = battle;
  battle.score.p1 = 2;
  battle.score.p2 = 2;
  intoVoid(battle, p1);
  intoVoid(battle, p2);
  run();
  assert.deepEqual([p1.lostToVoid, p2.lostToVoid], [true, true]);
  assert.deepEqual(battle.score, { p1: 2, p2: 2 }, 'no point for either, whatever the check order');
  assert.equal(battle.phase, 'fight');
  assert.deepEqual(battle.cameraTargets, [null, null], 'nobody to frame: the camera holds still');
  run(RESPAWN_STEPS);
  assert.deepEqual([p1.lostToVoid, p2.lostToVoid], [false, false]);
  assert.deepEqual(battle.score, { p1: 2, p2: 2 });
});

test('a fall while the opponent still waits to respawn scores nothing either', () => {
  const { battle, run } = match();
  const { p1, p2 } = battle;
  intoVoid(battle, p2);
  run();
  assert.deepEqual(battle.score, { p1: 1, p2: 0 }, 'a clean point first');
  run(30);
  intoVoid(battle, p1);
  run();
  assert.deepEqual(battle.score, { p1: 1, p2: 0 }, 'the CPU is not in play: it cannot score');
  assert.equal(p1.respawnTimer !== null, true, 'Player 1 waits its own 2 s');
  run(RESPAWN_STEPS - 31);
  assert.deepEqual([p1.lostToVoid, p2.lostToVoid], [true, false], 'each on its own clock');
  run(31);
  assert.equal(p1.lostToVoid, false);
});

test('the timer keeps running through a respawn wait; time up during one keeps the points and the Launch Point it fell with', () => {
  const { battle, run } = match();
  const { p1, p2 } = battle;
  p1.combat.launchPoint = 80;
  p2.combat.launchPoint = 10;
  battle.timeLeft = 0.5;
  intoVoid(battle, p1);
  run();
  assert.deepEqual(battle.score, { p1: 0, p2: 1 });
  const left = battle.timeLeft;
  run(10);
  assert.ok(battle.timeLeft < left, 'no pause for the respawn');
  run(30);
  assert.equal(battle.phase, 'celebration', 'time up ends the match at once');
  // No more respawns once time is up: whoever is out stays out, keeping the
  // Launch Point it fell with, and no point comes from the timer.
  run(RESPAWN_STEPS * 2);
  assert.equal(p1.lostToVoid, true);
  assert.equal(p1.combat.launchPoint, 80);
  assert.deepEqual(battle.score, { p1: 0, p2: 1 });
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'points' });
  // Level on points, the Launch Point it fell with still counts.
  battle.score.p2 = 0;
  assert.deepEqual(battle.liveResult, { outcome: 'p2', reason: 'time' });
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'points' }, 'the result it ended on stands');
});

test('while its opponent is out the Quick Battle CPU repositions with a purpose, never attacks nobody, then plays on', () => {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, seed: 4,
  });
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  intoVoid(battle, p1);
  battle.update(DT);
  let moved = 0;
  let unmeant = 0;
  for (let i = 0; i < RESPAWN_STEPS - 1; i++) {
    battle.update(DT);
    const out = p2.controller.out;
    assert.ok(!['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].some((a) => out[`${a}Pressed`]), 'no attack at nobody');
    if (p2.moveDir !== 0) moved++;
    else if (p2.body.grounded && p2.canAct() && !p2.controller.waiting) unmeant++;
    assert.ok(p2.body.grounded || p2.body.y < battle.stage.groundY + 1, 'it stays on the stage');
  }
  // It takes up a position for the respawn and then may wait there, ready:
  // standing still is a wait it means, never idleness.
  const spot = p2.controller.plan?.targetX;
  assert.ok(moved > 10 || (spot != null && Math.abs(p2.body.x - spot) < 40), `it takes up a position for the respawn (${moved} steps moving)`);
  assert.ok(unmeant * DT < 0.45, `still only on purpose (${(unmeant * DT).toFixed(2)} s without a reason)`);
  assert.equal(p2.controller.telemetry.counters.inactivity, 0, 'no inactivity');
  assert.equal(p1.lostToVoid, true);
  battle.update(DT);
  assert.equal(p1.lostToVoid, false);
});

test('a rematch (or a restart) resets the points to 0 and brings everyone back', () => {
  const { battle, run } = match();
  const { p1, p2 } = battle;
  battle.score.p1 = 2;
  intoVoid(battle, p2);
  run();
  assert.equal(battle.phase, 'celebration');
  battle.restart();
  assert.deepEqual(battle.score, { p1: 0, p2: 0 });
  assert.deepEqual([p1.lostToVoid, p2.lostToVoid], [false, false]);
  assert.deepEqual([p1.respawnTimer, p2.respawnTimer], [null, null]);
  assert.equal(battle.phase, 'intro');
  // A respawn wait in progress is cancelled by it too.
  battle.setPhase('fight');
  intoVoid(battle, p1);
  run();
  assert.ok(p1.respawnTimer > 0);
  battle.restart();
  assert.equal(p1.respawnTimer, null);
  assert.equal(p1.lostToVoid, false);
});

// ---- The loser ejected (the Void update) ---------------------------------------

// What the ejection must never touch: the score, the frozen result and the
// falls counted in the statistics.
function ended(battle) {
  return {
    score: { ...battle.score },
    result: { ...battle.result },
    falls: { p1: battle.final.stats.p1.voidFalls, p2: battle.final.stats.p2.voidFalls },
  };
}

test('time-up on points: the loser, still on the stage, bursts in its own colours where it stands and is out of play', () => {
  const { battle, run } = match();
  const { p1, p2 } = battle;
  battle.score.p1 = 1;
  run(5);
  const at = { x: p2.body.x, y: p2.body.y };
  const shake = battle.fx.shake;
  battle.timeLeft = DT / 2;
  run();
  assert.equal(battle.phase, 'celebration');
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'points' });
  assert.equal(p2.lostToVoid, true, 'gone');
  assert.equal(p2.ejected, true, 'ejected, not taken by the Void');
  assert.equal(p1.lostToVoid, false, 'the winner stays');
  assert.deepEqual(battle.inPlay, [p1], 'undrawn and unframed: only the winner is in play');
  // The same burst as a Void fall, at its body, in its palette, with its
  // shake; no ripple, as it never touched the Void's edge.
  assert.equal(battle.fx.eliminations.length, 1);
  const burst = battle.fx.eliminations[0];
  assert.equal(burst.slot, 'p2');
  assert.equal(burst.x, at.x);
  assert.ok(Math.abs(burst.y - (at.y - p2.body.height / 2)) < 1e-6, 'centred on its body');
  assert.ok(battle.fx.shake >= shake, 'its shake');
  assert.equal(battle.fx.ripples.length, 0);
  // Not a fall: no point, no statistic, no respawn, the result unchanged.
  assert.deepEqual(ended(battle), { score: { p1: 1, p2: 0 }, result: { outcome: 'p1', reason: 'points' }, falls: { p1: 0, p2: 0 } });
  assert.equal(p2.respawnTimer, null);
  run(RESPAWN_STEPS * 2);
  assert.equal(p2.lostToVoid, true, 'it never comes back');
  assert.deepEqual(ended(battle), { score: { p1: 1, p2: 0 }, result: { outcome: 'p1', reason: 'points' }, falls: { p1: 0, p2: 0 } });
  assert.equal(battle.fx.eliminations.filter((e) => e.slot === 'p2').length <= 1, true, 'once');
});

test('time-up on Launch Point (overtime off): the higher Launch Point is ejected; Player 1 just the same when it loses', () => {
  for (const loser of ['p1', 'p2']) {
    const { battle, run } = match();
    battle.overtimeSeconds = 0;
    battle[loser].combat.launchPoint = 90;
    battle.timeLeft = DT / 2;
    run();
    const winner = loser === 'p1' ? 'p2' : 'p1';
    assert.deepEqual(battle.result, { outcome: winner, reason: 'time' });
    assert.equal(battle[loser].lostToVoid, true, `${loser} ejected`);
    assert.equal(battle[winner].lostToVoid, false);
    assert.deepEqual(battle.fx.eliminations.map((e) => e.slot), [loser]);
    assert.deepEqual(battle.final.launchPoints[loser], 90, 'the Launch Point it lost on, frozen');
    assert.deepEqual(battle.score, { p1: 0, p2: 0 });
  }
});

test('a match won by a fall does not burst its loser twice, nor one still waiting to respawn when time runs out', () => {
  const { battle, run } = match();
  const { p2 } = battle;
  battle.score.p1 = 2;
  intoVoid(battle, p2);
  run();
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'void' });
  assert.equal(battle.fx.eliminations.length, 1, 'the Void\'s burst only');
  assert.equal(p2.ejected, false, 'taken by the Void');
  run(30);
  assert.equal(battle.fx.eliminations.length, 1);
  // Out and waiting when the clock runs out: already gone.
  const waiting = match();
  waiting.battle.timeLeft = 0.2;
  intoVoid(waiting.battle, waiting.battle.p1);
  waiting.run();
  waiting.run(20);
  assert.deepEqual(waiting.battle.result, { outcome: 'p2', reason: 'points' });
  assert.equal(waiting.battle.fx.eliminations.length, 1, 'one burst: its fall');
  assert.equal(waiting.battle.p1.ejected, false);
});

test('a draw ejects nobody', () => {
  const { battle, run } = match();
  battle.overtimeSeconds = 0;
  battle.timeLeft = DT / 2;
  run();
  assert.deepEqual(battle.result, { outcome: 'draw', reason: 'time' });
  assert.deepEqual(battle.fighters.map((f) => f.lostToVoid), [false, false]);
  assert.equal(battle.fx.eliminations.length, 0);
});

test('whatever aimed at the ejected loser goes; the winner\'s celebration plays on with it gone; a rematch brings it back', async () => {
  const { CelebrationController, CELEBRATIONS } = await import('../../js/game/ai/celebration.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    const { battle, run } = match();
    const { p1, p2 } = battle;
    battle.score.p2 = 1;
    // The winner a CPU celebrating: every behaviour may come up, the Void
    // run included, all with nobody to face.
    battle.timeLeft = DT / 2;
    run();
    assert.equal(p1.lostToVoid, true);
    let s = seed;
    p2.controller = new CelebrationController({ behaviours: CELEBRATIONS, rng: () => ((s = (s * 16807) % 2147483647) / 2147483647) });
    run(Math.round(8 / DT));
    assert.deepEqual(battle.score, { p1: 0, p2: 1 }, 'nothing it does there counts');
    assert.equal(p1.lostToVoid, true, 'the loser stays out');
    battle.restart();
    assert.deepEqual([p1.lostToVoid, p1.ejected, p2.lostToVoid], [false, false, false], 'a rematch: both back');
  }
  // A projectile in flight at the loser goes with it.
  const { battle, run } = match();
  battle.score.p1 = 1;
  battle.projectiles.push({ owner: battle.p1, target: battle.p2, update() {}, interpolate() {} });
  battle.timeLeft = DT / 2;
  run();
  assert.equal(battle.projectiles.filter((p) => p.target === battle.p2).length, 0);
});
