// Run with node --test tests/attack1.test.mjs (no dependencies).
// #0001's attack1 button (attack1, the Punch, and midair_attack1): ground/air
// selection, clip playback,
// phase timing, hit resolution (ground attack1's Base Launch 1 horizontal push;
// midair_attack1, the three-frame kunai slash, launching the target upward at
// Base Launch 2 vertical) and the other combat inputs (Throw on extra_attack,
// transform still reserved). Uses the real Fighter, CombatSystem and
// physics (see fighter-harness.mjs). The attack2 button has its own file,
// attack2.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { worldBox, createAttackDefinition } from '../js/game/combat.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { LAUNCH_UNIT_SPEED as U } from '../js/data/launch.js';
import { CONFIG } from '../js/config.js';
import {
  def, DT, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil,
  steps, frameNo, recordAttack, sequence, duel,
} from './fighter-harness.mjs';
import { resolveLaunchStun } from '../js/game/combat.js';

const ATTACK1 = { attack1: true, attack1Pressed: true };
const ATTACK2 = { attack2: true, attack2Pressed: true };

const JUMP = { jump: true, jumpPressed: true };

// Each attack1's Base Launch and Directional Launch: ground attack1 pushes sideways
// at 1; midair_attack1 launches the target upward at 2 and pushes it nowhere.
const BA1_LAUNCH = {
  attack1: { baseLaunch: 1, directionalLaunch: 'horizontal' },
  midair_attack1: { baseLaunch: 2, directionalLaunch: 'vertical' },
};

// Each attack1's whole data entry. Ground attack1 is the four-frame punch; mid-air
// attack1 is the three-frame kunai slash (midair_attack1_1-3), with the slash's own
// timing, hitbox and combat values, and each its own movement: the punch
// keeps some of a run's speed and slides on it, the slash keeps all of its
// drift and most of the air steering. Both open a follow-up once they hit
// (hitCancel, from their strike).
const BA1_ENTRIES = {
  attack1: {
    animation: 'attack1', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 3,
    hitbox: { x: 12, y: -64, w: 28, h: 16 }, ...BA1_LAUNCH.attack1,
    hitstun: 0.32, blockstun: 0.14, hitstop: 0.05, cooldown: 0.15, groundOnly: true,
    momentum: 0.75, friction: 0.4, hitCancel: 1 / 12,
  },
  midair_attack1: {
    animation: 'midair_attack1', startup: 2 / 12, active: 1 / 12, recovery: 0, damage: 3,
    hitbox: { x: 14, y: -100, w: 22, h: 80 }, ...BA1_LAUNCH.midair_attack1,
    hitstun: 0.32, blockstun: 0.15, hitstop: 0.05, cooldown: 0.16,
    airMomentum: 1, airControl: 0.85, hitCancel: 2 / 12,
  },
};

// Zero either way: +0 or -0 (both === 0).
const isZero = (v) => v === 0;

test('the attack1 button: ground attack1, air midair_attack1; attack2 on its own button, extra_attack the Throw, transform reserved, no attack3 to attack5 button', () => {
  assert.deepEqual(def.actions, {
    extra_attack: 'extra_attack',
    transform: null,
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
  });
  assert.deepEqual(COMBAT_ACTIONS, ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  for (const button of ['attack3', 'attack4', 'attack5']) assert.equal(def.actions[button], undefined, `no ${button} button`);
  assert.deepEqual(CONFIG.bindings.attack1, ['KeyU']);
  assert.deepEqual(CONFIG.bindings.attack2, ['KeyI']);
  assert.deepEqual(CONFIG.bindings.extra_attack, ['KeyJ']);
});

test('attack1 attack definitions match their clips: the ground punch and the mid-air kunai slash', () => {
  const { fighter } = makeFighter();
  for (const id of ['attack1', 'midair_attack1']) {
    const atk = fighter.attacks[id];
    const clip = def.animations[id];
    assert.deepEqual({ ...def.attacks[id] }, BA1_ENTRIES[id], `${id}: its whole entry`);
    assert.equal(atk.id, id);
    assert.equal(atk.animation, id);
    // One pass of the clip: the attack never ends halfway through its art.
    assert.ok(Math.abs(atk.total - clip.frames.length / clip.fps) < 1e-9, `${id} lasts one pass of its clip`);
    assert.ok(atk.active < atk.total / 2, `${id} is not active for its whole clip`);
    assert.equal(atk.lockMovement, true);
    // The declared Base Launch and Directional Launch, as authored.
    assert.equal(atk.baseLaunch, BA1_LAUNCH[id].baseLaunch);
    assert.equal(atk.directionalLaunch, BA1_LAUNCH[id].directionalLaunch);
    // In front of the fighter and above the feet.
    assert.ok(atk.hitbox.x > 0, `${id} hitbox is in front`);
    assert.ok(atk.hitbox.y < 0 && atk.hitbox.y + atk.hitbox.h <= 0, `${id} hitbox is above the feet`);
  }
  // Ground attack1: frame 1 wind-up, frame 2 punch, frames 3-4 recovery; a
  // short jab, no bigger than the fighter's own body.
  const g = fighter.attacks.attack1;
  assert.equal(def.animations.attack1.frames.length, 4);
  assert.deepEqual([g.startup, g.active, g.recovery], [1 / 12, 1 / 12, 2 / 12]);
  assert.equal(g.groundOnly, true);
  assert.equal(g.damage, 3, 'adds 3 Launch Point');
  assert.deepEqual([g.hitstun, g.blockstun, g.hitstop, g.cooldown], [0.32, 0.14, 0.05, 0.15]);
  // A combo starter: once it hits it may be cut short from its strike, and
  // its stun outlasts that (with room for attack2's wind-up); its freeze is
  // short, so repeated jabs stay crisp.
  assert.equal(g.hitCancel, g.startup);
  assert.ok(g.hitstun > fighter.attacks.attack2.startup, 'the stun covers attack2\'s wind-up');
  assert.ok(g.hitstop < fighter.attacks.attack2.hitstop, 'a lighter freeze than attack2');
  assert.ok(g.hitbox.x + g.hitbox.w <= 60, 'attack1 hitbox is within reach');
  assert.ok(g.hitbox.w <= def.collider.width + 10 && g.hitbox.h <= def.collider.height / 2, 'attack1 hitbox is not oversized');
  // midair_attack1: frames 1-2 wind-up, frame 3 the slash, and no recovery
  // frame (the clip ends on the slash; the longer cooldown makes up for it).
  // The hitbox covers the slash arc: in front, within a limb's reach and
  // narrower than the fighter.
  const a = fighter.attacks.midair_attack1;
  assert.equal(def.animations.midair_attack1.frames.length, 3);
  assert.deepEqual([a.startup, a.active, a.recovery], [2 / 12, 1 / 12, 0]);
  assert.equal(a.groundOnly, false);
  assert.equal(a.damage, 3, 'adds 3 Launch Point');
  assert.deepEqual([a.hitstun, a.blockstun, a.hitstop, a.cooldown], [0.32, 0.15, 0.05, 0.16]);
  assert.equal(a.hitCancel, a.startup, 'a follow-up from its slash on');
  assert.ok(a.hitbox.x + a.hitbox.w > def.collider.width / 2 && a.hitbox.x + a.hitbox.w <= 40, 'midair_attack1 hitbox reach');
  assert.ok(a.hitbox.w < def.collider.width, 'midair_attack1 hitbox is narrower than the fighter');
  assert.ok(a.cooldown > g.cooldown);
});

test('attack1\'s launch is exactly its declared Base Launch and Directional Launch, never derived from its damage', () => {
  const { fighter } = makeFighter();
  assert.deepEqual([fighter.attacks.attack1.baseLaunch, fighter.attacks.attack1.directionalLaunch], [1, 'horizontal']);
  assert.deepEqual([fighter.attacks.midair_attack1.baseLaunch, fighter.attacks.midair_attack1.directionalLaunch], [2, 'vertical']);
  for (const id of ['attack1', 'midair_attack1']) {
    const source = def.attacks[id];
    assert.equal('powers' in source, false, `${id} declares no Powers`);
    // The same entry with any other legal Base Launch keeps that one: it is
    // authored, not inferred from the 3 damage (which never changes).
    for (const baseLaunch of [0, 1, 2, 3]) {
      const atk = createAttackDefinition({ id, ...source, baseLaunch });
      assert.equal(atk.baseLaunch, baseLaunch, `${id} at Base Launch ${baseLaunch}`);
      assert.equal(atk.damage, 3);
      assert.equal(atk.directionalLaunch, source.directionalLaunch);
    }
    // Everything about attack1 is its entry's own.
    const atk = fighter.attacks[id];
    for (const [key, value] of Object.entries(source)) assert.deepEqual(atk[key], value, `${id}.${key}`);
  }
});
test('grounded attack1 plays the four-frame ground attack1 once, then returns to idle', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK1);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'attack1');
  assert.equal(fighter.animator.anim.key, 'attack1');
  assert.equal(frameName(fighter), '0001_attack1_1.png');

  const log = [{ frame: frameName(fighter), phase: fighter.combat.phase }, ...recordAttack(step)];
  assert.deepEqual(sequence(log), ['0001_attack1_1.png', '0001_attack1_2.png', '0001_attack1_3.png', '0001_attack1_4.png']);
  assert.equal(log.length, steps(4 / 12), 'one pass of the clip');
  // Never loops back to an earlier frame.
  for (let i = 1; i < log.length; i++) assert.ok(frameNo(log[i].frame) >= frameNo(log[i - 1].frame));
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active', 'recovery']);

  // Clean exit: no attack, idle art, free to act again after the cooldown.
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.combat.attack, null);
  assert.equal(frameName(fighter), '0001_idle_1.png');
  assert.ok(fighter.combat.cooldowns.has('attack1'));
  stepUntil(step, (f) => !f.combat.cooldowns.has('attack1'), {}, steps(0.2));
  step(ATTACK1);
  assert.equal(fighter.combat.attack?.def.id, 'attack1');
});

test('the hitbox is live only around the contact frame', () => {
  const cases = {
    attack1: { contact: '0001_attack1_2.png', setup: () => makeFighter() },
    midair_attack1: {
      contact: '0001_midair_attack1_3.png',
      setup: () => {
        const r = makeFighter();
        r.step({ jump: true, jumpPressed: true });
        return r;
      },
    },
  };
  for (const [id, { contact, setup }] of Object.entries(cases)) {
    const { step } = setup();
    const log = recordAttack(step, ATTACK1);
    assert.equal(log[0].id, id);
    const active = log.filter((s) => s.phase === 'active');
    assert.equal(active.length, steps(1 / 12), `${id}: active for exactly one frame of art`);
    const shown = active.map((s) => s.frame);
    // The contact frame, trailing at most one simulation step into the next.
    assert.ok(shown.filter((n) => n === contact).length >= active.length - 1, `${id}: ${shown}`);
    const contactIndex = def.animations[id].frames.findIndex((u) => u.endsWith(contact));
    for (const n of shown) {
      const i = def.animations[id].frames.findIndex((u) => u.endsWith(n));
      assert.ok(i === contactIndex || i === contactIndex + 1, `${id}: active on ${n}`);
    }
  }
});

test('airborne attack1 plays the three-frame midair_attack1 (the kunai slash) during the ascent, under normal gravity', () => {
  const { fighter, step } = makeFighter();
  // The same jump without an attack, for comparison.
  const plain = makeFighter();
  step(JUMP);
  plain.step(JUMP);
  step();
  plain.step();
  assert.ok(fighter.body.vy < 0, 'rising');
  step(ATTACK1);
  plain.step();
  assert.equal(fighter.combat.attack.def.id, 'midair_attack1');
  assert.equal(fighter.animator.anim.key, 'midair_attack1');
  assert.equal(frameName(fighter), '0001_midair_attack1_1.png');
  const log = [{ frame: frameName(fighter) }];
  while (fighter.state === 'attack') {
    step();
    plain.step();
    // Gravity keeps working: no stall, no extra lift.
    for (const k of ['x', 'y', 'vx', 'vy']) assert.equal(fighter.body[k], plain.fighter.body[k], `body.${k}`);
    if (fighter.state === 'attack') log.push({ frame: frameName(fighter) });
  }
  assert.deepEqual(sequence(log), ['0001_midair_attack1_1.png', '0001_midair_attack1_2.png', '0001_midair_attack1_3.png']);
  assert.equal(log.length, steps(3 / 12), 'one pass of the clip');
  assert.equal(fighter.grounded, false);
  assert.ok(['jump', 'fall'].includes(fighter.state));
});

test('airborne attack1 also triggers midair_attack1 during the descent', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0); // a tap: the normal jump
  assert.equal(fighter.state, 'fall');
  step(ATTACK1);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'midair_attack1');
  assert.equal(frameName(fighter), '0001_midair_attack1_1.png');
  const log = recordAttack(step);
  assert.equal(sequence(log).at(-1), '0001_midair_attack1_3.png');
  assert.ok(log.every((s) => s.id === 'midair_attack1' && !s.grounded));
});

test('landing during midair_attack1 finishes the mid-air clip instead of switching to ground attack1 or land', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  // Late in the descent, so the fighter lands partway through the attack.
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 740);
  const states = [];
  const log = [];
  let f = step(ATTACK1);
  while (f.state === 'attack') {
    log.push({ id: f.combat.attack.def.id, frame: frameName(f), anim: f.animator.anim.key, grounded: f.grounded });
    states.push(f.state);
    f = step();
  }
  assert.equal(log[0].grounded, false);
  assert.ok(log.some((s) => s.grounded), 'landed during the attack');
  for (const s of log) {
    assert.equal(s.id, 'midair_attack1');
    assert.equal(s.anim, 'midair_attack1');
    assert.match(s.frame, /^0001_midair_attack1_\d\.png$/);
  }
  assert.ok(!states.includes('land'));
  assert.deepEqual(sequence(log), ['0001_midair_attack1_1.png', '0001_midair_attack1_2.png', '0001_midair_attack1_3.png']);
  assert.equal(log.length, steps(3 / 12), 'the attack runs its full length');
  // Touchdown happened mid-attack, so there is no late land clip afterwards.
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle_1.png');
});

test('attack1 on the same step as a jump punches on the ground; the jump is dropped', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true, ...ATTACK1 });
  assert.equal(fighter.combat.attack.def.id, 'attack1');
  assert.equal(fighter.grounded, true);
  const log = recordAttack(step);
  assert.ok(log.every((s) => s.grounded && s.id === 'attack1'));
  assert.equal(fighter.grounded, true);
});

test('the ground/air choice follows grounded state; a mapping without `air` is inactive in the air', () => {
  const { fighter, step } = makeFighter();
  assert.equal(fighter.attackFor('attack1'), 'attack1');
  assert.equal(fighter.attackFor('attack2'), 'attack2');
  step({ jump: true, jumpPressed: true });
  assert.equal(fighter.attackFor('attack1'), 'midair_attack1');
  assert.equal(fighter.attackFor('attack2'), 'midair_attack2');
  assert.equal(fighter.attackFor('transform'), null);
  // Throw is a plain string mapping: the same id in the air, refused there
  // because it is ground-only (see extra-attack.test.mjs).
  assert.equal(fighter.attackFor('extra_attack'), 'extra_attack');
  assert.equal(fighter.tryAction('extra_attack'), false);

  const character = { ...def, actions: { ...def.actions, attack1: { ground: 'attack1' } } };
  const groundOnly = makeFighter({ character });
  groundOnly.step({ jump: true, jumpPressed: true });
  assert.equal(groundOnly.fighter.tryAction('attack1'), false);
  assert.equal(groundOnly.fighter.combat.attack, null);
});

test('a plain string mapping still means one attack', () => {
  const character = { ...def, actions: { ...def.actions, extra_attack: 'attack1' } };
  const { fighter, step } = makeFighter({ character });
  step({ extra_attack: true, extra_attackPressed: true });
  assert.equal(fighter.combat.attack.def.id, 'attack1');
  assert.equal(frameName(fighter), '0001_attack1_1.png');
  // groundOnly still applies to string mappings.
  const air = makeFighter({ character });
  air.step({ jump: true, jumpPressed: true });
  air.step({ extra_attack: true, extra_attackPressed: true });
  assert.equal(air.fighter.combat.attack, null);
});

test('transform stays inactive for #0001; Throw (extra_attack), attack1 and attack2 work', () => {
  const { fighter, step } = makeFighter();
  assert.equal(fighter.tryAction('transform'), false);
  step({ transform: true, transformPressed: true });
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.combat.lastIntent, 'transform');
  step({ jump: true, jumpPressed: true });
  step({ transform: true, transformPressed: true });
  assert.equal(fighter.combat.attack, null, 'transform in the air');

  // Throw, the extra_attack action, on the ground (it has no mid-air version).
  const thrower = makeFighter();
  thrower.step({ extra_attack: true, extra_attackPressed: true });
  assert.equal(thrower.fighter.combat.attack?.def.id, 'extra_attack');
  assert.equal(thrower.fighter.combat.lastIntent, 'extra_attack');

  // The two basic attacks, on the ground and in the air.
  for (const [held, ground, air] of [[ATTACK1, 'attack1', 'midair_attack1'], [ATTACK2, 'attack2', 'midair_attack2']]) {
    const g = makeFighter();
    g.step(held);
    assert.equal(g.fighter.combat.attack?.def.id, ground);
    const a = makeFighter();
    a.step({ jump: true, jumpPressed: true });
    a.step(held);
    assert.equal(a.fighter.combat.attack?.def.id, air);
  }
});

test('an attack whose frames failed to load is refused, not faked', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const keys = Object.keys(def.animations).filter((k) => k !== 'attack1' && k !== 'midair_attack1');
  const { fighter, step } = makeFighter({ sprites: fakeSprites(keys) });
  step(ATTACK1);
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.state, 'idle');
  step({ jump: true, jumpPressed: true });
  step(ATTACK1);
  assert.equal(fighter.combat.attack, null);
  assert.ok(['jump', 'fall'].includes(fighter.state));
  assert.equal(warn.mock.callCount(), 2);
});

test('attack1 locks movement while it plays; the direction held turns it at once', () => {
  const { fighter, step } = makeFighter();
  stepUntil(step, (f) => f.state === 'run', { runRight: true });
  step({ runRight: true, ...ATTACK1 });
  assert.equal(fighter.facing, 1);
  const log = [];
  while (fighter.state === 'attack') {
    log.push(fighter.body.vx);
    step({ runLeft: true });
    assert.equal(fighter.facing, -1, 'holding Left turns the attack around');
  }
  assert.equal(log.at(-1), 0, 'decelerates to a stop');
  assert.ok(log.every((vx) => vx >= 0), 'turning never walks it: the run\'s slide just runs down');
  // Back and forth, as often as the player likes.
  for (let i = 0; i < 30; i++) step();
  step(ATTACK1);
  for (const [held, facing] of [[{ runRight: true }, 1], [{ runLeft: true }, -1], [{}, -1], [{ runRight: true }, 1]]) {
    step(held);
    assert.equal(fighter.combat.attack?.def.id, 'attack1');
    assert.equal(fighter.facing, facing);
  }
});

test('ground attack1 hits an opponent in front during the active phase only', () => {
  const { attacker, target, tick, events } = duel();
  tick(ATTACK1);
  let hitPhase = null;
  while (attacker.combat.attack) {
    const before = events.length;
    tick();
    // CombatSystem runs after the fighters, on the phase they just reached.
    if (events.length > before) hitPhase = attacker.combat.phase;
  }
  assert.equal(events.length, 1, 'one hit per attack');
  assert.equal(events[0].type, 'hit');
  assert.equal(events[0].attacker, attacker);
  assert.equal(events[0].damage, 3);
  assert.equal(target.combat.launchPoint, 3, '0 + 3');
  assert.equal(hitPhase, 'active');
});

test('a ground attack1 hit adds its 3 first, then pushes the target sideways at 1 x its new Launch Point: 117 + 3 = 120, a strength of 120, with no launch', () => {
  for (const facing of [1, -1]) {
    const { attacker, target, tick, events } = duel({ attackerFacing: facing });
    target.combat.launchPoint = 117;
    tick(ATTACK1);
    while (!events.length) tick();
    // At impact, before the target's next step: CombatSystem.applyHit set it.
    assert.equal(target.combat.launchPoint, 120);
    assert.equal(events[0].launchStrength, 120, '1 x 120, not 1 x 117');
    assert.equal(target.body.vx, 120 * U * facing, 'away from the attacker, at the strength\'s speed');
    assert.equal(target.body.vy, 0);
    assert.equal(target.grounded, true, 'attack1 never launches upward');
    assert.equal(attacker.facing, facing);
  }
});

test('a hit shows the target in its hurt pose through the impact freeze', () => {
  const { attacker, target, tick, until, events } = duel();
  target.combat.launchPoint = 115;
  tick(ATTACK1);
  until(() => events.length > 0, 60);
  // attack1's own 0.32 s, plus what the launch adds (see resolveLaunchStun).
  assert.equal(target.combat.stun, 0.32 + resolveLaunchStun(events[0].launchSpeed, target.launchReaction));
  assert.ok(events[0].launchSpeed > 0 && target.combat.stun > 0.32, 'a hard push stuns longer');
  assert.ok(target.combat.hitstop > 0);
  const frozenAt = { x: target.body.x, attackerFrame: frameName(attacker) };
  tick(); // hitstop: nothing moves, but the pose updates
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_hurt_1.png');
  assert.equal(target.body.x, frozenAt.x);
  assert.equal(frameName(attacker), frozenAt.attackerFrame);
  while (target.combat.hitstop > 0) tick();
  tick();
  assert.ok(target.body.vx > 0, 'launched away from the attacker');
  assert.ok(target.body.x > frozenAt.x);
  assert.equal(target.body.vy, 0, 'no vertical launch');
  while (target.state === 'hitstun') {
    assert.equal(frameName(target), '0001_hurt_1.png');
    tick();
  }
  assert.equal(target.grounded, true);
  assert.ok(['idle', 'run'].includes(target.state));
});

test('attack1 hitboxes mirror with facing', () => {
  for (const id of ['attack1', 'midair_attack1']) {
    const hb = def.attacks[id].hitbox;
    const right = worldBox(makeFighter({ facing: 1 }).fighter, hb);
    const left = worldBox(makeFighter({ facing: -1 }).fighter, hb);
    assert.equal(right.x, 500 + hb.x);
    assert.equal(left.x + left.w, 500 - hb.x, `${id} mirrors about the origin`);
    assert.equal(left.y, right.y);
  }

  const { attacker, target, tick, events } = duel({ attackerFacing: -1 });
  assert.equal(attacker.facing, -1);
  target.combat.launchPoint = 115;
  const startX = target.body.x;
  tick(ATTACK1);
  while (attacker.combat.attack) tick();
  assert.equal(events.length, 1, 'hits the opponent on the left');
  assert.ok(target.body.x < startX, 'launched to the left');
});

test('attack1 misses an opponent out of reach or behind the attacker', () => {
  for (const gap of [70, -44]) {
    const { attacker, target, tick, events } = duel({ gap });
    attacker.facing = 1;
    tick(ATTACK1);
    while (attacker.combat.attack) tick();
    assert.equal(events.length, 0, `gap ${gap}`);
    assert.equal(target.combat.launchPoint, 0);
  }
});

// A duel with #0001 in the air, descending, about to press attack1: midair_attack1.
function maba1Duel({ attackerFacing = 1, gap = 44 } = {}) {
  const d = duel({ gap, attackerFacing });
  d.tick(JUMP);
  // Early in the descent, so the slash connects before touchdown.
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
  d.tick(ATTACK1);
  assert.equal(d.attacker.combat.attack.def.id, 'midair_attack1');
  return d;
}

test('midair_attack1 hits a grounded opponent below and in front while still airborne, on the slash frame', () => {
  const { attacker, target, tick, events } = maba1Duel();
  let airborneAtHit = null;
  while (attacker.combat.attack) {
    tick();
    if (events.length && airborneAtHit === null) {
      airborneAtHit = !attacker.grounded;
      assert.equal(attacker.combat.phase, 'active');
      assert.equal(frameName(attacker), '0001_midair_attack1_3.png');
      // The slash's own stun and freeze, on both fighters.
      assert.equal(target.combat.stun, 0.32 + resolveLaunchStun(events[0].launchSpeed, target.launchReaction));
      assert.equal(target.combat.hitstop, 0.05);
      assert.equal(attacker.combat.hitstop, 0.05);
    }
  }
  assert.equal(events.length, 1);
  assert.equal(airborneAtHit, true);
  assert.equal(events[0].damage, 3);
  assert.equal(target.combat.launchPoint, 3);
});

test('a midair_attack1 hit adds its 3 first, then launches a grounded target straight up at 2 x its new Launch Point: 117 + 3 = 120, a strength of 240', () => {
  for (const facing of [1, -1]) {
    const { attacker, target, tick, until, events } = maba1Duel({ attackerFacing: facing });
    target.combat.launchPoint = 117;
    const floor = target.body.y;
    const startX = target.body.x;
    while (!events.length) tick();
    assert.equal(events[0].type, 'hit');
    assert.equal(events[0].target, target);
    assert.equal(attacker.facing, facing);
    assert.equal(target.combat.launchPoint, 120);
    assert.equal(events[0].launchStrength, 240);
    // At impact, before the target's next step: CombatSystem.applyHit set it.
    assert.ok(isZero(target.body.vx), 'no horizontal launch');
    assert.equal(target.body.vy, -240 * U, 'negative body vy: launched upward');
    assert.equal(target.grounded, false);
    // It rises, then gravity brings it back down where it stood.
    let top = floor;
    until(() => {
      top = Math.min(top, target.body.y);
      assert.equal(target.body.x, startX, 'straight up and down');
      return target.grounded;
    });
    assert.ok(floor - top > 5, `rose ${(floor - top).toFixed(1)} units`);
    assert.equal(target.body.y, floor, 'lands where it stood');
  }
});

test('from the same Launch Point, midair_attack1 launches less high than ground attack2: both Base Launch 2 upward, attack1 adds 3 and attack2 adds 5', () => {
  // Highest point a grounded target at 110 reaches after the hit.
  const peak = (air) => {
    const d = air ? maba1Duel() : duel();
    d.target.combat.launchPoint = 110;
    if (!air) d.tick(ATTACK2);
    while (!d.events.length) d.tick();
    assert.equal(d.events[0].launchStrength, air ? 2 * 113 : 2 * 115);
    const floor = d.target.body.y;
    let top = floor;
    d.until(() => {
      top = Math.min(top, d.target.body.y);
      return d.target.grounded;
    });
    return floor - top;
  };
  const slash = peak(true);
  const ground = peak(false);
  assert.ok(slash > 0, 'midair_attack1 lifts the target');
  assert.ok(slash < ground, `a lower launch than ground attack2 (${slash.toFixed(1)} < ${ground.toFixed(1)})`);
});

test('a Shielded midair_attack1 is neither launched nor pushed, and adds no Launch Point', () => {
  const d = duel();
  d.tick(JUMP, { shield: true });
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
  d.tick(ATTACK1, { shield: true });
  assert.equal(d.attacker.combat.attack.def.id, 'midair_attack1');
  while (!d.events.length && d.attacker.combat.attack) d.tick({}, { shield: true });
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.target.body.vy, 0, 'no vertical launch on a block');
  assert.ok(isZero(d.target.body.vx), 'no horizontal launch either');
  assert.equal(d.events[0].damage, 0);
  assert.equal(d.target.combat.launchPoint, 0, 'no chip damage');
  assert.equal(d.target.combat.energy, 75, 'the Shield paid 25 instead');
  assert.equal(d.target.grounded, true);
});

test('the training CPU never presses a combat button', () => {
  const cpu = new TrainingAIController({ rng: mulberry(7) });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 3000; i++) {
    // Keep the player moving so the CPU follows, jumps and repositions.
    player.step(i % 400 < 200 ? { runRight: true } : { runLeft: true, jump: i % 97 === 0, jumpPressed: i % 97 === 0 });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    for (const action of COMBAT_ACTIONS) {
      assert.equal(out[action], false, action);
      assert.equal(out[`${action}Pressed`], false, `${action}Pressed`);
    }
    bot.step(out);
    assert.equal(bot.fighter.combat.attack, null);
  }
});

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Pending (art-only) attacks --------------------------------------------------

// Any fighter whose art arrives before its combat attributes can give an
// attack `pending: true` (see js/game/combat.js). No fighter uses one now;
// here, #0001's own attack1 clip stands in for such art.
test('a pending attack plays one pass of its clip and strikes nothing; combat fields are refused', () => {
  const atk = createAttackDefinition({ id: 'attack1', animation: 'attack1', pending: true }, { clipDuration: 0.4 });
  assert.equal(atk.pending, true);
  assert.equal(atk.total, 0.4);
  assert.deepEqual([atk.startup, atk.active, atk.recovery], [0, 0, 0.4]);
  assert.deepEqual([atk.hitbox, atk.projectile, atk.damage, atk.baseLaunch, atk.directionalLaunch], [null, null, 0, 0, null]);
  assert.deepEqual([atk.cooldown, atk.hitCancel], [0, null]);
  for (const field of ['damage', 'hitbox', 'projectile', 'baseLaunch', 'directionalLaunch', 'hitstun', 'cooldown', 'hitCancel', 'startup']) {
    const value = field === 'hitbox' ? { x: 0, y: 0, w: 1, h: 1 } : field === 'directionalLaunch' ? 'vertical' : 1;
    assert.throws(() => createAttackDefinition({ id: 'x', animation: 'x', pending: true, [field]: value }), new RegExp(field), field);
  }
  // In a fight: a fighter whose attack1 is pending plays that clip once, every
  // frame in order, and hits nothing it overlaps.
  const artOnly = { ...def, attacks: { ...def.attacks, attack1: { animation: 'attack1', pending: true } } };
  const d = duel({ attackerCharacter: artOnly, gap: 30 });
  const log = recordAttack((held) => {
    d.tick(held);
    return d.attacker;
  }, ATTACK1);
  const clip = def.animations.attack1;
  assert.equal(log.length, Math.round(clip.frames.length / clip.fps / DT), 'one pass of the clip');
  assert.deepEqual(sequence(log), clip.frames.map((u) => u.split('/').pop()));
  assert.ok(log.every((s) => s.id === 'attack1' && s.phase === 'recovery'));
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.launchPoint, 0);
  assert.equal(d.target.combat.stun, 0);
});
