// Run with node --test tests/facing.test.mjs (no dependencies).
// Facing is manual for a player: a fighter never turns toward its opponent
// by itself. Only its own input turns it: its movement, a Dash, a direction
// held as an attack or a technique starts, and a direction held during an
// attack or the Shield (at once, either way); standing still it keeps its
// last facing, attacks and shurikens go the way it faces, and a respawn
// takes the spawn's facing. A stun, a bind, a Dash and a technique hold it.
// A CPU's attacks also face its opponent (`face`, an input only the combat
// AI produces): turned on the press, kept on the opponent through every
// phase, a committed move's path kept while only its sprite looks. The HUD
// portraits facing the timer are a separate, fixed rule (see
// battle-screen.test.mjs). Uses the real Fighter, CombatSystem, Battle and
// physics (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import { getCharacter } from '../js/data/characters.js';
import { worldBox } from '../js/game/combat.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { CONFIG } from '../js/config.js';
import { def, DT, fakeSprites, fakeSpritesOf, makeFighter, duel, startupSteps } from './fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const ATTACK1 = { attack1: true, attack1Pressed: true };
const ATTACK2 = { attack2: true, attack2Pressed: true };
const THROW = { extra_attack: true, extra_attackPressed: true };
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
    doubleTap(me.step, dir);
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

test('the Sphere Rush goes the way held as Attack 4 is pressed, from standing still, and holds that facing', () => {
  const { fighter, step } = makeFighter({ x: 1000, facing: 1 });
  for (let i = 0; i < 5; i++) step({});
  assert.equal(fighter.state, 'idle');
  step({ runLeft: true, attack4: true, attack4Pressed: true });
  assert.ok(fighter.technique, 'the Sphere Rush started');
  assert.equal(fighter.facing, -1, 'turned on the press');
  assert.equal(fighter.technique.facing, -1);
  assert.equal(fighter.body.vx, 0, 'no walking');
  const x = fighter.body.x;
  while (fighter.technique && fighter.technique.phase !== 'dash') step();
  for (let i = 0; i < 3 && fighter.technique; i++) step({ runRight: true });
  assert.ok(fighter.body.x < x, 'rushes left');
  assert.equal(fighter.facing, -1, 'a technique holds its facing');
});

test('a stun, a Dash or a bind still holds the facing whatever is held', () => {
  const stunned = makeFighter({ facing: 1 });
  stunned.fighter.combat.stun = 0.3;
  for (let i = 0; i < 10; i++) stunned.step({ runLeft: true });
  assert.equal(stunned.fighter.facing, 1, 'stunned');
  const dashing = makeFighter({ facing: 1 });
  doubleTap(dashing.step, 'runRight');
  assert.ok(dashing.fighter.dash);
  dashing.step({ runLeft: true });
  assert.ok(dashing.fighter.dash, 'still dashing');
  assert.equal(dashing.fighter.facing, 1, 'dashing');
  const bound = makeFighter({ facing: 1 });
  bound.fighter.combat.bind('a technique');
  assert.ok(bound.fighter.combat.immobilized);
  for (let i = 0; i < 5; i++) bound.step({ runLeft: true });
  assert.equal(bound.fighter.facing, 1, 'bound');
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

// ---- A CPU's attacks face its opponent ----------------------------------------------
// `face` is the combat AI's own input (see CombatAIController.track): no
// player control produces it.

const DEF_0002 = getCharacter('0002');
const ATTACK2_STARTUP = Math.round(def.attacks.attack2.startup / DT);

test('a CPU\'s attack starts facing its opponent: turned on the press, with no step, speed, Dash or held direction spent', () => {
  for (const facing of [1, -1]) {
    // The opponent right behind it.
    const d = duel({ gap: -44, attackerFacing: facing, targetFacing: facing });
    const { attacker, target } = d;
    const toward = Math.sign(target.body.x - attacker.body.x);
    assert.equal(toward, -facing);
    const x = attacker.body.x;
    d.tick({ ...ATTACK1, face: toward });
    assert.equal(attacker.combat.attack?.def.id, 'attack1');
    assert.equal(attacker.facing, toward, 'turned on the press step itself');
    assert.equal(attacker.body.vx, 0, 'not a walk');
    assert.equal(attacker.dash, null, 'not a Dash');
    // Kept on the opponent through every phase, even with the other way held.
    const away = toward > 0 ? { runLeft: true } : { runRight: true };
    const phases = new Set();
    while (attacker.combat.attack) {
      phases.add(attacker.combat.phase);
      assert.equal(attacker.facing, toward, `${attacker.combat.phase}: facing the opponent`);
      assert.equal(attacker.body.x, x, `${attacker.combat.phase}: turning moved it nowhere`);
      d.tick({ face: toward, ...(attacker.combat.phase === 'recovery' ? {} : away) });
    }
    assert.deepEqual([...phases].sort(), ['active', 'recovery', 'startup']);
    assert.equal(d.events[0]?.target, target, 'the strike lands on it');
  }
});

test('the opponent crossing behind a CPU during the startup or the active frames: the attack turns after it, step by step', () => {
  for (const when of ['startup', 'active']) {
    // In front of it as it presses (out of reach, for the active case).
    const d = duel({ gap: when === 'startup' ? 44 : 140 });
    const { attacker, target } = d;
    d.tick({ ...ATTACK2, face: 1 });
    assert.equal(attacker.combat.attack?.def.id, 'attack2');
    while (attacker.combat.phase !== when) d.tick({ face: 1 });
    // Over to its left, out of the kick's reach on the right (and where the
    // kick's step-in leaves it in reach on the left).
    place(target, attacker.body.x - (when === 'startup' ? 4 : 24));
    if (when === 'active') assert.equal(d.events.length, 0, 'nothing hit before it crossed');
    d.tick({ face: -1 });
    assert.equal(attacker.facing, -1, `${when}: turned to it at once`);
    while (attacker.combat.attack && !d.events.length) {
      if (attacker.combat.phase === 'active') {
        const box = worldBox(attacker, attacker.combat.attack.def.hitbox);
        assert.ok(box.x + box.w <= attacker.body.x + 1, `${when}: the hitbox is on its left`);
      }
      d.tick({ face: -1 });
    }
    assert.equal(d.events[0]?.target, target, `${when}: the kick lands behind`);
    assert.equal(d.events[0].move, 'attack2');
  }
  // Startup as long as the art says: the turn takes nothing from it.
  assert.ok(ATTACK2_STARTUP > 3);
});

test('a CPU turns its air attacks after its opponent too, without drifting toward it', () => {
  const { fighter, step } = makeFighter({ x: 1000, facing: 1 });
  Object.assign(fighter.body, { y: 600, prevY: 600, grounded: false, ground: null, vx: 0, vy: 0 });
  step({ ...ATTACK1, face: -1 });
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack1', 'its mid-air version');
  assert.equal(fighter.facing, -1);
  for (const face of [-1, 1, 1, -1]) {
    step({ face });
    if (!fighter.combat.attack) break;
    assert.equal(fighter.facing, face);
    assert.equal(fighter.body.vx, 0, 'a turn is no steering');
  }
});

test('a committed move keeps its path, boxes and facing when the opponent crosses: only its sprite looks at it, and it turns for real once over', () => {
  const { fighter, step } = makeFighter({ character: DEF_0002, sprites: fakeSpritesOf(DEF_0002), x: 600, facing: 1 });
  step({ attack3: true, attack3Pressed: true, face: 1 });
  assert.equal(fighter.combat.attack?.def.id, 'attack3', 'the Spin Attack: a roll');
  assert.equal(fighter.combat.attack.motion.dir, 1);
  // The opponent now on its left (it rolled through, or jumped over).
  let rolled = false;
  let last = fighter.body.x;
  while (fighter.combat.attack) {
    step({ face: -1 });
    if (!fighter.combat.attack) break;
    assert.equal(fighter.facing, 1, 'its facing, and so its hitbox and hurtbox, kept');
    assert.equal(fighter.combat.attack.motion.dir, 1, 'its path kept');
    assert.ok(fighter.body.x >= last, 'never reversed');
    rolled ||= fighter.body.x > last;
    last = fighter.body.x;
    const box = worldBox(fighter, fighter.combat.attack.def.hitbox);
    assert.equal(box.x, fighter.body.x + fighter.combat.attack.def.hitbox.x, 'the ball\'s box where the facing puts it');
    assert.equal(fighter.lookFacing, -1);
    assert.equal(fighter.spriteFlip, true, 'drawn looking left at it');
  }
  assert.ok(rolled, 'it rolled on');
  assert.equal(fighter.facing, -1, 'over: it faces the opponent');
  assert.equal(fighter.lookFacing, 0);
  assert.equal(fighter.spriteFlip, true);
  // A player's roll (no face) looks the way it rolls, as ever.
  const p = makeFighter({ character: DEF_0002, sprites: fakeSpritesOf(DEF_0002), x: 600, facing: 1 });
  p.step({ attack3: true, attack3Pressed: true });
  while (p.fighter.combat.attack) {
    assert.equal(p.fighter.spriteFlip, false);
    assert.equal(p.fighter.facing, 1);
    p.step({ runLeft: true });
  }
});

test('a CPU\'s homing dash and plunge keep their own heading; only the sprite looks at the opponent', () => {
  for (const [action, move] of [['attack1', 'midair_attack1'], ['attack2', 'midair_attack2']]) {
    const { fighter, step } = makeFighter({ character: DEF_0002, sprites: fakeSpritesOf(DEF_0002), x: 600, facing: 1 });
    Object.assign(fighter.body, { y: 500, prevY: 500, grounded: false, ground: null, vx: 0, vy: 0 });
    step({ [action]: true, [`${action}Pressed`]: true, face: 1 });
    assert.equal(fighter.combat.attack?.def.id, move);
    while (fighter.combat.attack?.def.id === move) {
      step({ face: -1 });
      if (!fighter.combat.attack) break;
      assert.equal(fighter.facing, 1, `${move}: its heading kept`);
      assert.ok(fighter.body.vx >= 0, `${move}: never sent back toward the opponent`);
      assert.equal(fighter.spriteFlip, true, `${move}: looking at it`);
    }
  }
});

test('a projectile keeps the direction it was thrown in, whichever way its CPU turns after', () => {
  const d = duel({ gap: 200 });
  const { attacker, target } = d;
  d.tick({ ...THROW, face: 1 });
  while (!d.projectiles.length) d.tick({ face: 1 });
  const [p] = d.projectiles;
  assert.equal(p.direction, 1);
  place(target, attacker.body.x - 150);
  const x = p.x;
  for (let i = 0; i < 10; i++) d.tick({ face: -1 });
  assert.equal(p.direction, 1, 'never redirected');
  assert.ok(p.x > x, 'still flying right');
  // One thrown after the turn goes the new way.
  const late = duel({ gap: 200 });
  late.tick({ ...THROW, face: 1 });
  late.tick({ face: -1 });
  while (!late.projectiles.length) late.tick({ face: -1 });
  assert.equal(late.projectiles[0].direction, -1, 'not thrown yet when it turned');
});

test('a CPU\'s summon startup keeps its facing while its sprite looks at the opponent; a technique keeps its rush and its look', () => {
  // The Clone Attack: the summoning pose looks at the opponent across.
  const cpu = makeFighter({ x: 1000, facing: 1 });
  const foe = makeFighter({ x: 1200, facing: -1 });
  cpu.fighter.opponent = foe.fighter;
  foe.fighter.opponent = cpu.fighter;
  cpu.step({ attack3: true, attack3Pressed: true, face: 1 });
  assert.ok(cpu.fighter.pendingSummon, 'its startup');
  for (let i = 1; i < startupSteps(def, 'attack3'); i++) {
    cpu.step({ face: -1 });
    assert.equal(cpu.fighter.facing, 1, 'its facing kept');
    assert.equal(cpu.fighter.body.vx, 0, 'standing still');
    assert.equal(cpu.fighter.spriteFlip, true, 'looking at the opponent');
  }
  cpu.step({ face: -1 });
  assert.equal(cpu.fighter.pendingSummon, null);
  assert.equal(cpu.fighter.summons.length, 1, 'its clone, as ever');
  assert.equal(cpu.fighter.facing, -1, 'and then it faces the opponent');
  // The Sphere Rush: set off toward the opponent, then committed, sprite and all.
  const rush = makeFighter({ x: 1000, facing: 1 });
  rush.step({ attack4: true, attack4Pressed: true, face: -1 });
  assert.ok(rush.fighter.technique);
  assert.equal(rush.fighter.technique.facing, -1, 'it rushes at the opponent');
  for (let i = 0; i < 20 && rush.fighter.technique; i++) {
    rush.step({ face: 1 });
    assert.equal(rush.fighter.facing, -1);
    assert.equal(rush.fighter.spriteFlip, true, 'the sphere and the pose stay one');
  }
});

test('face does nothing outside an attack: no turn standing, walking or shielding, and none for a player at all', () => {
  const { fighter, step } = makeFighter({ x: 1000, facing: 1 });
  for (let i = 0; i < 30; i++) step({ face: -1 });
  assert.equal(fighter.facing, 1, 'standing');
  for (let i = 0; i < 20; i++) step({ runRight: true, face: -1 });
  assert.equal(fighter.facing, 1, 'walking: its movement turns it');
  for (let i = 0; i < 10; i++) step({ shield: true, face: -1 });
  assert.equal(fighter.combat.shielding, true);
  assert.equal(fighter.facing, 1, 'shielding');
  assert.equal(fighter.lookFacing, 0);
  // Without it (every player), an attack keeps the facing it started with.
  const d = duel({ gap: -44 });
  d.tick(ATTACK1);
  while (d.attacker.combat.attack) {
    assert.equal(d.attacker.facing, 1);
    d.tick();
  }
});
