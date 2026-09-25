// Run with node --test tests/facing.test.mjs (no dependencies).
// Facing is manual: a fighter never turns toward its opponent by itself.
// Only its own movement (and a Dash) turns it; standing still it keeps its
// last facing, attacks and shurikens go the way it faces, and a respawn
// takes the spawn's facing. The HUD portraits facing the timer are a
// separate, fixed rule (see battle-screen.test.mjs). Uses the real Fighter,
// CombatSystem, Battle and physics (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import { worldBox } from '../js/game/combat.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { CONFIG } from '../js/config.js';
import { def, DT, fakeSprites, makeFighter, duel } from './fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const BA1 = { action1: true, action1Pressed: true };
const THROW = { primary: true, primaryPressed: true };
// Two presses of `dir`, one step apart: a Dash's double tap.
const doubleTap = (step, dir) => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};
// Moves `foe` to x at once (no interpolation drift).
const place = (foe, x) => Object.assign(foe.body, { x, prevX: x });

test('no auto-facing: an opponent crossing from in front to behind never turns a standing fighter', () => {
  for (const facing of [1, -1]) {
    const me = makeFighter({ x: 1000, facing });
    const foe = makeFighter({ x: 1000 + 200 * facing, facing: -facing });
    me.fighter.opponent = foe.fighter;
    foe.fighter.opponent = me.fighter;
    for (let i = 0; i < 30; i++) me.step();
    assert.equal(me.fighter.facing, facing);
    // Behind it, near and far, and back and forth.
    for (const x of [1000 - 30 * facing, 1000 - 300 * facing, 1000 + 300 * facing, 1000 - 60 * facing]) {
      place(foe.fighter, x);
      for (let i = 0; i < 60; i++) {
        me.step();
        assert.equal(me.fighter.facing, facing, `still ${facing} with the opponent at ${x}`);
      }
    }
    assert.equal(me.fighter.state, 'idle');
  }
});

test('movement turns it: left faces left, right faces right, and stopping keeps the last direction whatever the opponent does', () => {
  const me = makeFighter({ x: 1000, facing: 1 });
  const foe = makeFighter({ x: 1300 });
  me.fighter.opponent = foe.fighter;
  for (let i = 0; i < 20; i++) me.step({ left: true });
  assert.equal(me.fighter.facing, -1, 'walked left: faces left');
  // Stopped, with the opponent on its right: keeps facing left.
  for (let i = 0; i < 90; i++) me.step();
  assert.equal(me.fighter.body.vx, 0);
  assert.equal(me.fighter.facing, -1, 'stopped: keeps its last facing');
  place(foe.fighter, me.fighter.body.x + 40);
  for (let i = 0; i < 60; i++) me.step();
  assert.equal(me.fighter.facing, -1, 'an opponent right behind changes nothing');
  for (let i = 0; i < 20; i++) me.step({ right: true });
  assert.equal(me.fighter.facing, 1, 'walked right: faces right');
  place(foe.fighter, me.fighter.body.x - 200);
  for (let i = 0; i < 90; i++) me.step();
  assert.equal(me.fighter.facing, 1, 'stopped: keeps facing right with the opponent on its left');
  // Steering in the air turns it too, and it keeps that on landing.
  me.step({ jump: true, jumpPressed: true });
  me.step({ left: true });
  assert.equal(me.fighter.grounded, false);
  assert.equal(me.fighter.facing, -1);
  while (!me.fighter.grounded) me.step();
  for (let i = 0; i < 60; i++) me.step();
  assert.equal(me.fighter.facing, -1);
});

test('a Dash faces its own direction, and the opponent never overrides it afterwards', () => {
  for (const [dir, facing] of [['left', -1], ['right', 1]]) {
    const me = makeFighter({ x: 1000, facing: -facing });
    // The opponent on the side the Dash turns away from.
    const foe = makeFighter({ x: 1000 - 300 * facing });
    me.fighter.opponent = foe.fighter;
    doubleTap(me.step, dir);
    assert.ok(me.fighter.dash, `${dir} Dash started`);
    assert.equal(me.fighter.facing, facing, `${dir} Dash faces ${dir} at once`);
    while (me.fighter.dash) me.step();
    for (let i = 0; i < 90; i++) me.step();
    assert.equal(me.fighter.facing, facing, `still facing ${dir} after the Dash, the opponent behind`);
  }
});

test('attacks use the current facing: BA1 facing right strikes right with the opponent on the left, and nothing turns it', () => {
  const d = duel({ gap: -44 });
  const { attacker, target } = d;
  assert.ok(target.body.x < attacker.body.x, 'the opponent is on the left');
  assert.equal(attacker.facing, 1);
  for (let i = 0; i < 10; i++) d.tick();
  assert.equal(attacker.facing, 1, 'no turn before the attack');
  d.tick(BA1);
  assert.equal(attacker.combat.attack?.def.id, 'ba1');
  let sawActive = false;
  while (attacker.combat.attack) {
    assert.equal(attacker.facing, 1);
    if (attacker.combat.phase === 'active') {
      sawActive = true;
      const box = worldBox(attacker, attacker.combat.attack.def.hitbox);
      assert.ok(box.x >= attacker.body.x, 'the hitbox is on the right side');
    }
    d.tick();
  }
  assert.ok(sawActive);
  assert.equal(d.events.length, 0, 'the opponent behind is not hit');
  assert.equal(attacker.facing, 1, 'still facing right afterwards');
});

test('a shuriken flies the way the thrower faces, with no aim toward an opponent behind it', () => {
  const d = duel({ gap: -200 });
  const { attacker } = d;
  assert.equal(attacker.facing, 1);
  d.tick(THROW);
  d.until(() => d.projectiles.length > 0, 60);
  const [p] = d.projectiles;
  assert.equal(p.direction, 1);
  const x = p.x;
  for (let i = 0; i < 10; i++) d.tick();
  assert.ok(p.x > x, 'travels right');
  assert.equal(attacker.facing, 1);
});

test('the training AI turns only by its own movement: stopped, it keeps its last facing with P1 behind it', () => {
  const ai = new TrainingAIController({ rng: () => 0.5 });
  ai.thinkTimer = Infinity; // no decisions of its own
  const cpu = makeFighter({ x: 1000, facing: 1 });
  cpu.fighter.controller = ai;
  const p1 = makeFighter({ x: 1400 });
  cpu.fighter.opponent = p1.fighter;
  ai.moveIntent = -1;
  for (let i = 0; i < 20; i++) cpu.step();
  assert.equal(cpu.fighter.facing, -1, 'walking left: faces left');
  ai.moveIntent = 0;
  for (let i = 0; i < 120; i++) cpu.step();
  assert.equal(cpu.fighter.facing, -1, 'stopped: still left, P1 on its right');
  // The practice dummy (no controller) likewise never turns.
  const dummy = makeFighter({ x: 1000, facing: -1 });
  dummy.fighter.controller = null;
  dummy.fighter.opponent = p1.fighter;
  for (let i = 0; i < 120; i++) dummy.step();
  assert.equal(dummy.fighter.facing, -1);
});

test('a respawn takes the spawn\'s facing, and the opponent\'s side does not flip it', () => {
  const sprites = fakeSprites();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p2.controller = null;
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  const [spawn1, spawn2] = battle.map.spawnPoints;
  assert.deepEqual([p1.facing, p2.facing], [spawn1.facing, spawn2.facing]);
  // P1 turned the other way, then into the Void; meanwhile the CPU waits on
  // P1's left, behind the way its spawn faces.
  p1.facing = -spawn1.facing;
  Object.assign(p1.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p1.lostToVoid, true);
  place(p2, spawn1.x - 250 * spawn1.facing);
  const wait = Math.round(CONFIG.battle.respawnSeconds / DT);
  for (let i = 0; i < wait && p1.lostToVoid; i++) battle.update(DT);
  assert.equal(p1.lostToVoid, false, 'back');
  assert.equal(p1.body.x, spawn1.x);
  assert.equal(p1.facing, spawn1.facing, 'the spawn\'s facing, not the one it fell with');
  for (let i = 0; i < 120; i++) {
    battle.update(DT);
    assert.equal(p1.facing, spawn1.facing, 'never turned toward the CPU behind it');
  }
  assert.equal(p2.facing, spawn2.facing, 'the CPU never turned either');
});
