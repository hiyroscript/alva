// Run with node --test tests/match-score.test.mjs (no dependencies).
// Quick Battle's match: first to three points, a point for each time the
// opponent falls into the Void, the fallen fighter out of play for two
// seconds and then back at its spawn in a clean neutral state; the
// simultaneous-fall rule, the final point's K.O., time-up during a respawn
// wait, and rematches. Runs the real Battle, Fighter, CombatSystem and
// physics on a stub canvas (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import { CONFIG } from '../js/config.js';
import { def, DT, fakeSprites } from './fighter-harness.mjs';

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
  assert.equal(battle.phase, 'ko');
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'void' });
  assert.equal(p2.respawnTimer, null, 'the final loser does not respawn');
  run(RESPAWN_STEPS * 2);
  assert.equal(p2.lostToVoid, true, 'and stays out');
  assert.equal(battle.phase, 'result', 'the result follows the K.O. beat');
  assert.deepEqual(battle.score, { p1: 3, p2: 1 });
});

test('a fall takes the fighter out of play at once; it is back exactly 2 s later, at its own spawn, clean and neutral', () => {
  const { battle, run, script, input } = match();
  const { p1, p2 } = battle;
  const [spawn] = battle.map.spawnPoints;
  // Make a mess to clear: Launch Point, empty Energy, a raised Shield, both
  // charged cooldowns, a stun and a speed.
  p1.combat.launchPoint = 64;
  p1.combat.setEnergy(0);
  p1.combat.shielding = true;
  p1.combat.chargedCooldowns.start('ba1Clone', 5);
  p1.combat.chargedCooldowns.start('rasenRush', 5);
  intoVoid(battle, p1);
  p1.body.vx = 400;
  run();
  assert.equal(p1.lostToVoid, true);
  assert.deepEqual(battle.inPlay, [p2], 'out of play: not updated, collided, hit or drawn');
  assert.equal(battle.secondary, p2);
  assert.deepEqual(battle.cameraTargets, [p2, null], 'the camera follows the CPU meanwhile');
  const frozen = { x: p1.body.x, y: p1.body.y };
  // Not a step early; its Launch Point stays until it is back.
  script.held = { right: true, jump: true, jumpPressed: true };
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
  assert.equal(p1.combat.chargedCooldowns.size, 0, 'CAB1 and CAB2 ready');
  assert.deepEqual([p1.combat.stun, p1.combat.hitstop, p1.combat.attack, p1.technique, p1.dash], [0, 0, null, null, null]);
  assert.equal(p1.state, 'idle');
  assert.deepEqual(battle.inPlay, [p1, p2]);
  assert.deepEqual(battle.cameraTargets, [p1, p2]);
  // Active at once: no respawn invulnerability, platform or wait.
  assert.equal(p1.canAct(), true);
  assert.equal('invulnerable' in p1.combat, false);
});

test('whatever held or aimed at a fallen fighter lets go: a Sphere Rush bind, clones and projectiles', () => {
  const { battle, run, script } = match();
  const { p1, p2 } = battle;
  p2.body.x = p1.body.x + 120;
  script.held = { charge: true };
  run(10);
  script.held = { charge: true, action2: true, action2Pressed: true };
  run();
  script.held = {};
  const rush = p1.technique;
  for (let i = 0; i < 120 && !rush.hitConfirmed; i++) run();
  assert.ok(p2.combat.immobilized);
  p1.summons.push({ id: 'ba1Clone', target: p2 });
  // A shuriken of the CPU's own, far off (it strikes nothing).
  const far = { x: -1e5, y: -1e5, w: 1, h: 1 };
  battle.projectiles.push({ alive: true, owner: p2, update() {}, interpolate() {}, hitbox: (out) => Object.assign(out, far) });
  intoVoid(battle, p2);
  run();
  assert.equal(p2.lostToVoid, true);
  assert.equal(p1.technique, null);
  assert.equal(rush.endReason, 'released');
  assert.equal(p2.combat.immobilized, false);
  assert.deepEqual(p1.summons, []);
  assert.ok(battle.clones.every((c) => c.target !== p2 && c.owner !== p2));
  assert.ok(battle.projectiles.every((p) => p.owner !== p2), 'its own shuriken went too');
  // While it is out, a Charged BA1 has nobody to appear behind: an ordinary
  // BA1, and CAB1's cooldown is not spent.
  run(60);
  script.held = { charge: true };
  run(10);
  script.held = { charge: true, action1: true, action1Pressed: true };
  run();
  script.held = {};
  assert.equal(p1.combat.attack?.def.id, 'ba1');
  assert.equal(p1.combat.chargedCooldowns.active('ba1Clone'), false);
  assert.deepEqual(battle.clones, []);
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
  assert.equal(battle.phase, 'timeup');
  // No more respawns once time is up: whoever is out stays out, keeping the
  // Launch Point it fell with, and no point comes from the timer.
  run(RESPAWN_STEPS * 2);
  assert.equal(p1.lostToVoid, true);
  assert.equal(p1.combat.launchPoint, 80);
  assert.deepEqual(battle.score, { p1: 0, p2: 1 });
  assert.equal(battle.phase, 'result');
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'points' });
  // Level on points, the Launch Point it fell with still counts.
  battle.score.p2 = 0;
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'time' });
});

test('the Quick Battle CPU stands still while its opponent is out, then plays on', () => {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  intoVoid(battle, p1);
  battle.update(DT);
  for (let i = 0; i < RESPAWN_STEPS - 1; i++) {
    battle.update(DT);
    assert.equal(p2.moveDir, 0, 'nobody to follow');
  }
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
  assert.equal(battle.phase, 'ko');
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
