// Run with node --test tests/systems/facing.test.mjs (no dependencies).
// Facing is manual: a fighter never turns toward its opponent by itself.
// Only its own input turns it: its movement, a Dash, a direction held as an
// attack or a technique starts, and a direction held during an attack or
// the Shield (at once, either way); standing still it keeps its last
// facing, attacks and shurikens go the way it faces, and a respawn takes
// the spawn's facing. A stun, a bind, a Dash and a technique hold it. The HUD portraits facing the timer are a
// separate, fixed rule (see battle-screen.test.mjs). Uses the real Fighter,
// CombatSystem, Battle and physics (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { worldBox } from '../../js/game/combat/combat.js';
import { TrainingAIController } from '../../js/game/fighters/fighter-controller.js';
import { CONFIG } from '../../js/config.js';
import { def, DT, fakeSprites, makeFighter, duel } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const ATTACK1 = { attack1: true, attack1Pressed: true };
const ATTACK2 = { attack2: true, attack2Pressed: true };
const THROW = { extra_attack: true, extra_attackPressed: true };
// Run setup followed by one explicit Mouvement request.
const requestDash = (step, dir) => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [dir === 'runRight' ? 'mouvementRightPressed' : 'mouvementLeftPressed']: true, [dir]: true });
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
  for (let i = 0; i < 20; i++) me.step({ runLeft: true });
  assert.equal(me.fighter.facing, -1, 'walked left: faces left');
  // Stopped, with the opponent on its right: keeps facing left.
  for (let i = 0; i < 90; i++) me.step();
  assert.equal(me.fighter.body.vx, 0);
  assert.equal(me.fighter.facing, -1, 'stopped: keeps its last facing');
  place(foe.fighter, me.fighter.body.x + 40);
  for (let i = 0; i < 60; i++) me.step();
  assert.equal(me.fighter.facing, -1, 'an opponent right behind changes nothing');
  for (let i = 0; i < 20; i++) me.step({ runRight: true });
  assert.equal(me.fighter.facing, 1, 'walked right: faces right');
  place(foe.fighter, me.fighter.body.x - 200);
  for (let i = 0; i < 90; i++) me.step();
  assert.equal(me.fighter.facing, 1, 'stopped: keeps facing right with the opponent on its left');
  // Steering in the air turns it too, and it keeps that on landing.
  me.step({ jump: true, jumpPressed: true });
  me.step({ runLeft: true });
  assert.equal(me.fighter.grounded, false);
  assert.equal(me.fighter.facing, -1);
  while (!me.fighter.grounded) me.step();
  for (let i = 0; i < 60; i++) me.step();
  assert.equal(me.fighter.facing, -1);
});

test('a Dash faces its own direction, and the opponent never overrides it afterwards', () => {
  for (const [dir, facing] of [['runLeft', -1], ['runRight', 1]]) {
    const me = makeFighter({ x: 1000, facing: -facing });
    // The opponent on the side the Dash turns away from.
    const foe = makeFighter({ x: 1000 - 300 * facing });
    me.fighter.opponent = foe.fighter;
    requestDash(me.step, dir);
    assert.ok(me.fighter.dash, `${dir} Dash started`);
    assert.equal(me.fighter.facing, facing, `${dir} Dash faces ${dir} at once`);
    while (me.fighter.dash) me.step();
    for (let i = 0; i < 90; i++) me.step();
    assert.equal(me.fighter.facing, facing, `still facing ${dir} after the Dash, the opponent behind`);
  }
});

test('attacks use the current facing: attack1 facing right strikes right with the opponent on the left, and nothing but a direction turns it', () => {
  const d = duel({ gap: -44 });
  const { attacker, target } = d;
  assert.ok(target.body.x < attacker.body.x, 'the opponent is on the left');
  assert.equal(attacker.facing, 1);
  for (let i = 0; i < 10; i++) d.tick();
  assert.equal(attacker.facing, 1, 'no turn before the attack');
  d.tick(ATTACK1);
  assert.equal(attacker.combat.attack?.def.id, 'attack1');
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

test('a direction held mid-attack turns it at once: attack1 started facing away lands on the opponent behind', () => {
  for (const facing of [1, -1]) {
    const d = duel({ gap: -44, attackerFacing: facing, targetFacing: facing });
    const { attacker, target } = d;
    assert.equal(Math.sign(target.body.x - attacker.body.x), -facing, 'the opponent is behind');
    d.tick(ATTACK1);
    assert.equal(attacker.combat.phase, 'startup');
    assert.equal(attacker.facing, facing);
    const back = facing > 0 ? { runLeft: true } : { runRight: true };
    d.tick(back);
    assert.equal(attacker.facing, -facing, 'turned during the wind-up');
    d.until(() => d.events.length > 0 || !attacker.combat.attack, 30);
    assert.equal(d.events[0]?.target, target, 'the strike lands behind');
    assert.equal(d.events[0].move, 'attack1');
  }
});

test('Hollow Purple goes the way held as Attack 5 is pressed, from standing still, and holds that facing', () => {
  const d = duel({ x: 1000, gap: 400 });
  const fighter = d.attacker;
  for (let i = 0; i < 5; i++) d.tick({});
  assert.equal(fighter.state, 'idle');
  d.tick({ runLeft: true, attack5: true, attack5Pressed: true });
  assert.ok(fighter.technique, 'Hollow Purple started');
  assert.equal(fighter.facing, -1, 'turned on the press');
  assert.equal(fighter.technique.facing, -1);
  assert.equal(fighter.body.vx, 0, 'no walking');
  // Right held all through the chant: it still releases left.
  while (fighter.technique && !d.projectiles.length) d.tick({ runRight: true });
  assert.equal(d.projectiles.length, 1);
  assert.equal(d.projectiles[0].direction, -1, 'the sphere leaves leftward');
  assert.equal(fighter.facing, -1, 'a technique holds its facing');
});

test('a stun, a Dash or a paralysis still holds the facing whatever is held', () => {
  const stunned = makeFighter({ facing: 1 });
  stunned.fighter.combat.stun = 0.3;
  for (let i = 0; i < 10; i++) stunned.step({ runLeft: true });
  assert.equal(stunned.fighter.facing, 1, 'stunned');
  const dashing = makeFighter({ facing: 1 });
  requestDash(dashing.step, 'runRight');
  assert.ok(dashing.fighter.dash);
  dashing.step({ runLeft: true });
  assert.ok(dashing.fighter.dash, 'still dashing');
  assert.equal(dashing.fighter.facing, 1, 'dashing');
  const held = makeFighter({ facing: 1 });
  held.fighter.combat.paralyze(1);
  assert.ok(held.fighter.combat.immobilized);
  for (let i = 0; i < 5; i++) held.step({ runLeft: true });
  assert.equal(held.fighter.facing, 1, 'paralyzed');
});

test('Red flies the way its thrower faces, with no aim toward an opponent behind it', () => {
  const d = duel({ gap: -200 });
  const { attacker } = d;
  assert.equal(attacker.facing, 1);
  d.tick(ATTACK2);
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

// Combat AI opts into per-step attack targeting; use scripted input to
// isolate facing from tactical decisions and difficulty randomness.
const { CombatAIController } = await import('../../js/game/ai/combat-ai.js');
const { getCharacter } = await import('../../js/data/characters.js');
const { fakeSpritesOf } = await import('../helpers/fighter-harness.mjs');
const { spawnProjectiles } = await import('../../js/game/combat/projectile.js');
const { attackPhase } = await import('../../js/game/combat/attacks.js');
function aimedFighter(character = def, airborne = false) {
  const me = makeFighter({ character, sprites: fakeSpritesOf(character), x: 500, facing: -1 });
  const foe = makeFighter({ x: 750 }).fighter;
  me.fighter.opponent = foe;
  me.fighter.controller.attackFacing = CombatAIController.prototype.attackFacing;
  if (airborne) Object.assign(me.fighter.body, { y: -1000, prevY: -1000, grounded: false, ground: null });
  return { ...me, foe };
}

test('combat CPU aims on the press and follows side switches in startup, active frames and recovery, ground and air', () => {
  for (const character of [def, getCharacter('0002')]) {
    for (const airborne of [false, true]) {
      const { fighter: f, foe, step } = aimedFighter(character, airborne);
      step(ATTACK1);
      assert.ok(f.combat.attack, `${character.id}, airborne=${airborne}`);
      assert.equal(f.facing, 1, 'aims before starting, with no held direction');
      assert.equal(f.dash, null);
      assert.equal('dashTap' in f, false, 'no obsolete tap state');
      const recovery = f.combat.attack.def.recovery;
      const phases = new Set();
      for (let n = 0; f.combat.attack && n < 200; n++) {
        const side = n % 2 ? 1 : -1;
        place(foe, f.x + side * 300);
        step();
        if (!f.combat.attack) break;
        phases.add(attackPhase(f.combat.attack.def, f.combat.attack.time));
        assert.equal(f.attackVisualFacing, Math.sign(foe.x - f.x));
        assert.equal(f.spriteFlip, f.attackVisualFacing !== (f.animator.anim.sourceFacing ?? 1));
        if (!f.combat.attack.def.motion) assert.equal(f.facing, f.attackVisualFacing, 'ordinary hitbox follows artwork');
        assert.equal(f.dash, null);
      }
      assert.deepEqual([...phases].sort(), recovery > 0 ? ['active', 'recovery', 'startup'] : ['active', 'startup'], `${character.id} airborne=${airborne}`);
    }
  }
});

test('target overlap retains the last attack orientation, even in hitstop; absent and invalid targets are ignored', () => {
  const { fighter: f, foe, step } = aimedFighter();
  step(ATTACK1);
  place(foe, f.x - 200);
  step();
  f.combat.hitstop = 1;
  place(foe, f.x);
  for (let i = 0; i < 8; i++) {
    step();
    assert.equal(f.attackVisualFacing, -1);
    assert.equal(f.facing, -1);
  }
  for (const target of [null, { lostToVoid: true, body: { x: 2000 } }, { body: {} }, { body: { x: NaN } }]) {
    f.opponent = target;
    assert.doesNotThrow(() => step());
    assert.equal(f.facing, -1);
    assert.equal(f.attackVisualFacing, -1);
  }
});

test('CPU motion attacks turn only artwork: roll, homing, bounce and lift match manual trajectories and hitboxes', () => {
  const character = getCharacter('0002');
  for (const [action, airborne] of [['attack3', false], ['attack1', true], ['attack2', true], ['attack3', true]]) {
    const cpu = aimedFighter(character, airborne);
    const manual = aimedFighter(character, airborne);
    delete manual.fighter.controller.attackFacing;
    manual.fighter.facing = 1;
    for (const rig of [cpu, manual]) rig.step({ [action]: true, [`${action}Pressed`]: true });
    for (let n = 0; cpu.fighter.combat.attack && n < 100; n++) {
      for (const rig of [cpu, manual]) place(rig.foe, rig.fighter.x - 300);
      cpu.step(); manual.step();
      const f = cpu.fighter, m = manual.fighter;
      assert.deepEqual([f.x, f.y, f.body.vx, f.body.vy, f.facing], [m.x, m.y, m.body.vx, m.body.vy, m.facing], action);
      if (f.combat.attack) {
        assert.equal(f.attackVisualFacing, -1);
        assert.deepEqual(worldBox(f, f.combat.attack.def.hitbox), worldBox(m, m.combat.attack.def.hitbox), 'physical hitboxes stay with motion');
      }
    }
  }
});

test('CPU techniques visually track while casting, and keep their committed direction', () => {
  for (const action of ['attack4', 'attack5']) {
    const { fighter: f, foe, step } = aimedFighter();
    step({ [action]: true, [`${action}Pressed`]: true });
    assert.equal(f.facing, 1);
    assert.ok(f.technique);
    for (let i = 0; i < 8; i++) {
      place(foe, f.x - 300);
      step();
      assert.equal(f.attackVisualFacing, -1);
      assert.equal(f.technique.facing, 1);
      assert.equal(f.body.vx, 0);
    }
  }
});

test('CPU throw aims before release but never redirects a spawned projectile', () => {
  for (const [character, press] of [[def, ATTACK2], [getCharacter('0002'), THROW]]) {
    const { fighter: f, foe, step } = aimedFighter(character);
    step(press);
    place(foe, f.x - 300);
    const shots = [];
    for (let n = 0; !shots.length && n < 100; n++) {
      step();
      spawnProjectiles([f], shots);
    }
    assert.equal(shots.length, 1);
    const shot = shots[0];
    const heading = shot.direction;
    assert.equal(heading, -1);
    const vx = shot.vx;
    place(foe, f.x + 300);
    step();
    assert.equal(f.attackVisualFacing, 1);
    assert.equal(shot.direction, heading);
    assert.equal(shot.vx, vx);
  }
});
