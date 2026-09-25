// Run with node --test tests/basic-attack-2.test.mjs (no dependencies).
// #0001 Basic Attack 2 (BA2) on action2: inputs, ground/air selection, clip
// playback, phase timing against the art, hit resolution (ground BA2's Base
// Launch 2 vertical launch; mid-air BA2, the five-frame airborne kick,
// driving the target downward at Base Launch 2 reverse vertical; and a
// Shielded BA2 that is neither launched nor driven down) and missing-art
// safety. Uses the real Fighter, CombatSystem, physics and
// InputManager (see fighter-harness.mjs). Basic Attack 1 lives in
// basic-attack.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { worldBox, CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { ACTIONS, CONFIG } from '../js/config.js';
import { LAUNCH_UNIT_SPEED } from '../js/data/launch.js';
import {
  def, DT, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil,
  steps, frameNo, recordAttack, sequence, duel,
} from './fighter-harness.mjs';

const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };
const JUMP = { jump: true, jumpPressed: true };

// The frames each attack is live on, chosen from the art: ground BA2's kick
// (2ba4 low sweep, 2ba5 rising kick, both with motion trails) and mid-air
// BA2's kick (midair1ba3, the forward-low arc).
const CONTACT = { ba2: [4, 5], midairBa2: [3] };

// Either BA2 adds 10 to the target's Launch Point first, then launches at
// Base Launch 2 x that new Launch Point: ground BA2 upward, mid-air BA2
// downward. The launch tests start the target at 20, so 20 + 10 = 30, a
// strength of 2 x 30 = 60, and a speed of 60 x LAUNCH_UNIT_SPEED (600): a
// clear launch that still lands on the stage.
const LAUNCH_FROM = 20;
const STRENGTH = 60;
const LAUNCHED = STRENGTH * LAUNCH_UNIT_SPEED;
const BA2_LAUNCH = {
  ba2: { baseLaunch: 2, directionalLaunch: 'vertical' },
  midairBa2: { baseLaunch: 2, directionalLaunch: 'reverseVertical' },
};

// Each BA2's whole data entry. Ground BA2 is the seven-frame spinning high
// kick; mid-air BA2 is the five-frame airborne kick (midair1ba1-5), with the
// kick's own timing, hitbox and combat values.
const ENTRIES = {
  ba2: {
    animation: 'ba2', startup: 3 / 12, active: 2 / 12, recovery: 2 / 12, damage: 10,
    hitbox: { x: 10, y: -88, w: 24, h: 78 }, ...BA2_LAUNCH.ba2,
    hitstun: 0.24, blockstun: 0.15, hitstop: 0.07, cooldown: 0.15, groundOnly: true,
  },
  midairBa2: {
    animation: 'midairBa2', startup: 2 / 12, active: 1 / 12, recovery: 2 / 12, damage: 10,
    hitbox: { x: 8, y: -44, w: 40, h: 40 }, ...BA2_LAUNCH.midairBa2,
    hitstun: 0.22, blockstun: 0.14, hitstop: 0.06, cooldown: 0.1,
  },
};

// Zero either way: +0 or -0 (both === 0).
const isZero = (v) => v === 0;

test('action2 is Basic Attack 2: ground ba2, air midairBa2; the internal actions keep their names', () => {
  assert.deepEqual(def.actions.action2, { ground: 'ba2', air: 'midairBa2' });
  assert.deepEqual(def.actions.action1, { ground: 'ba1', air: 'midairBa1' });
  assert.equal(def.actions.primary, 'throw');
  assert.equal(def.actions.special, null);
  assert.deepEqual(CONFIG.bindings.action1, ['KeyU']);
  assert.deepEqual(CONFIG.bindings.action2, ['KeyI']);
  for (const action of ['action1', 'action2']) {
    assert.ok(COMBAT_ACTIONS.includes(action), action);
    assert.ok(ACTIONS.includes(action), action);
  }
  for (const renamed of ['ba1', 'ba2', 'BA1', 'BA2']) {
    assert.ok(!COMBAT_ACTIONS.includes(renamed) && !ACTIONS.includes(renamed), `no ${renamed} input action`);
  }
});

test('keyboard I and gamepad LB press action2; U and B / Circle still press action1', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code) => listeners[type]({ code, repeat: false, preventDefault() {} });
  const pressed = () => {
    const f = input.sample();
    return COMBAT_ACTIONS.filter((a) => f[`${a}Pressed`]);
  };

  key('keydown', 'KeyI');
  assert.deepEqual(pressed(), ['action2']);
  key('keyup', 'KeyI');
  key('keydown', 'KeyU');
  assert.deepEqual(pressed(), ['action1']);
  key('keyup', 'KeyU');

  listeners.gamepadconnected();
  const button = (i, down) => {
    pad.buttons[i] = { pressed: down, value: down ? 1 : 0 };
    input.pollGamepads(0);
  };
  button(4, true); // LB
  assert.deepEqual(pressed(), ['action2']);
  button(4, false);
  button(1, true); // B / Circle
  assert.deepEqual(pressed(), ['action1']);
  button(1, false);
  // Defense and jump mappings are unchanged.
  for (const [i, action] of [[0, 'jump'], [5, 'defense'], [7, 'defense']]) {
    button(i, true);
    assert.equal(input.sample()[action], true, `button ${i}`);
    button(i, false);
  }
});

test('BA2 attack definitions match their clips: the ground spinning kick launching upward, the mid-air kick driving downward', () => {
  const { fighter } = makeFighter();
  for (const id of ['ba2', 'midairBa2']) {
    const atk = fighter.attacks[id];
    const clip = def.animations[id];
    assert.deepEqual({ ...def.attacks[id] }, ENTRIES[id], `${id}: its whole entry`);
    assert.equal(atk.id, id);
    assert.equal(atk.animation, id);
    // One pass of the clip: the attack never ends halfway through its art.
    assert.ok(Math.abs(atk.total - clip.frames.length / clip.fps) < 1e-9, `${id} lasts one pass of its clip`);
    // Startup ends where the first contact frame starts; active covers the
    // contact frames only.
    const [first] = CONTACT[id];
    assert.ok(Math.abs(atk.startup - (first - 1) / clip.fps) < 1e-9, `${id} startup`);
    assert.ok(Math.abs(atk.active - CONTACT[id].length / clip.fps) < 1e-9, `${id} active`);
    assert.ok(atk.active < atk.total / 2, `${id} is not active for its whole clip`);
    assert.equal(atk.lockMovement, true);
    // Base Launch 2, upward on the ground and downward in mid-air, and no
    // sideways push.
    assert.equal(atk.baseLaunch, 2);
    assert.equal(atk.directionalLaunch, BA2_LAUNCH[id].directionalLaunch);
    // Not BA1 under another name: its own art and hitbox.
    const ba1 = fighter.attacks[id === 'ba2' ? 'ba1' : 'midairBa1'];
    assert.notEqual(atk.animation, ba1.animation);
    assert.notDeepEqual(atk.hitbox, ba1.hitbox);
    // In front of the fighter and above the feet.
    const hb = atk.hitbox;
    assert.ok(hb.x > 0 && hb.x + hb.w > def.collider.width / 2, `${id} hitbox is in front`);
    assert.ok(hb.y < 0 && hb.y + hb.h <= 0, `${id} hitbox is above the feet`);
  }
  // Ground BA2: frames 1-3 wind-up, 4-5 the kick, 6-7 recovery. Slower and
  // heavier than ground BA1, which only pushes; its hitbox spans the kick's
  // arc within a limb's reach, never wrapping the fighter's own body.
  const g = fighter.attacks.ba2;
  const ba1 = fighter.attacks.ba1;
  assert.equal(def.animations.ba2.frames.length, 7);
  assert.deepEqual([g.startup, g.active, g.recovery], [3 / 12, 2 / 12, 2 / 12]);
  assert.equal(g.groundOnly, true);
  assert.equal(g.damage, 10, 'adds 10 Launch Point');
  assert.deepEqual([g.hitstun, g.blockstun, g.hitstop, g.cooldown], [0.24, 0.15, 0.07, 0.15]);
  assert.ok(g.total > ba1.total, 'slower than ground BA1');
  assert.ok(g.damage > ba1.damage && g.hitstun > ba1.hitstun, 'heavier than ground BA1');
  assert.equal(ba1.directionalLaunch, 'horizontal', 'BA1 pushes sideways');
  assert.equal(g.directionalLaunch, 'vertical', 'BA2 launches upward instead');
  assert.ok(g.baseLaunch > ba1.baseLaunch, 'BA2 doubles the Launch Point; BA1 uses it once');
  assert.ok(g.hitbox.x + g.hitbox.w <= 40, 'ba2 hitbox stays within reach');
  assert.ok(g.hitbox.w < def.collider.width, 'ba2 hitbox is narrower than the fighter');
  // Mid-air BA2: frames 1-2 wind-up, frame 3 the kick, frames 4-5 recovery.
  // The kick's forward-low box, no bigger than the fighter's own body.
  const a = fighter.attacks.midairBa2;
  assert.equal(def.animations.midairBa2.frames.length, 5);
  assert.deepEqual([a.startup, a.active, a.recovery], [2 / 12, 1 / 12, 2 / 12]);
  assert.equal(a.groundOnly, false);
  assert.equal(a.damage, 10, 'adds 10 Launch Point');
  assert.deepEqual([a.hitstun, a.blockstun, a.hitstop, a.cooldown], [0.22, 0.14, 0.06, 0.1]);
  assert.ok(a.hitbox.x + a.hitbox.w <= 60, 'midairBa2 hitbox is within reach');
  assert.ok(a.hitbox.w <= def.collider.width + 10 && a.hitbox.h <= def.collider.height / 2, 'midairBa2 hitbox is not oversized');
  // Ground BA2's Base Launch, reversed: where mid-air BA1 launches upward,
  // mid-air BA2 drives the target down.
  assert.equal(a.baseLaunch, g.baseLaunch, 'the same Base Launch as ground BA2');
  assert.equal(a.directionalLaunch, 'reverseVertical', 'mid-air BA2 drives downward');
  assert.equal(fighter.attacks.midairBa1.directionalLaunch, 'vertical', 'mid-air BA1 launches upward');
});

test('BA2\'s launch is exactly its declared Base Launch and Directional Launch, never derived from its damage', () => {
  for (const id of ['ba2', 'midairBa2']) {
    const source = def.attacks[id];
    assert.equal(source.baseLaunch, 2, `${id} declares Base Launch 2`);
    assert.equal(source.directionalLaunch, BA2_LAUNCH[id].directionalLaunch);
    assert.equal('powers' in source, false, `${id} declares no Powers`);
    // Any other legal Base Launch on the same entry is kept as declared: it
    // is never inferred from the 10 damage, and the direction never changes.
    for (const baseLaunch of [0, 1, 2, 3]) {
      const atk = createAttackDefinition({ id, ...source, baseLaunch });
      assert.deepEqual([atk.baseLaunch, atk.directionalLaunch, atk.damage], [baseLaunch, source.directionalLaunch, 10], `${id} at ${baseLaunch}`);
    }
    // Everything about BA2 is the entry's own.
    const { fighter } = makeFighter();
    const atk = fighter.attacks[id];
    for (const [key, value] of Object.entries(source)) assert.deepEqual(atk[key], value, `${id}.${key}`);
  }
  // The launch is the shared launch path's: nothing in combat singles out
  // an attack or a fighter.
  const combat = readFileSync(new URL('../js/game/combat.js', import.meta.url), 'utf8');
  assert.doesNotMatch(combat, /(?:\.id|attack|attackId)\s*===?\s*['"]/);
  assert.doesNotMatch(combat, /'0001'|'ba2'|'midairBa2'/);
});

test('grounded action2 plays the seven-frame ground BA2 once, then returns to idle', () => {
  const { fighter, step } = makeFighter();
  step(BA2);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'ba2');
  assert.equal(fighter.animator.anim.key, 'ba2');
  assert.equal(frameName(fighter), '0001_2ba1.png');

  const log = [{ frame: frameName(fighter), phase: fighter.combat.phase }, ...recordAttack(step)];
  assert.deepEqual(sequence(log), [
    '0001_2ba1.png', '0001_2ba2.png', '0001_2ba3.png', '0001_2ba4.png',
    '0001_2ba5.png', '0001_2ba6.png', '0001_2ba7.png',
  ]);
  assert.equal(log.length, steps(7 / 12), 'one pass of the clip');
  // Never loops back to an earlier frame.
  for (let i = 1; i < log.length; i++) assert.ok(frameNo(log[i].frame) >= frameNo(log[i - 1].frame));
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active', 'recovery']);
  assert.ok(log.slice(1).every((s) => s.grounded && s.id === 'ba2' && s.anim === 'ba2'));

  // Clean exit: no attack, idle art.
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.combat.attack, null);
  assert.equal(frameName(fighter), '0001_idle1.png');

  // Cooldown: BA2 is refused until it expires; BA1 has its own cooldown.
  assert.ok(fighter.combat.cooldowns.has('ba2'));
  assert.equal(fighter.tryAction('action2'), false);
  assert.equal(fighter.combat.attack, null);
  const n = stepUntil(step, (f) => !f.combat.cooldowns.has('ba2'), {}, steps(0.3));
  // The whole cooldown (float accumulation may add one step), no more.
  assert.ok(n >= steps(0.15) && n <= steps(0.15) + 1, `${n} steps`);
  step(BA2);
  assert.equal(fighter.combat.attack?.def.id, 'ba2');
  recordAttack(step);
  step(BA1);
  assert.equal(fighter.combat.attack?.def.id, 'ba1', 'BA1 is free while BA2 cools down');
});

test('BA2 cannot be cancelled into BA1, and BA1 cannot be cancelled into BA2', () => {
  for (const [first, second, id] of [[BA2, BA1, 'ba2'], [BA1, BA2, 'ba1']]) {
    const { fighter, step } = makeFighter();
    step(first);
    const log = recordAttack(step, second);
    assert.ok(log.every((s) => s.id === id), `${id} plays out`);
  }
});

// Checks that the attack's active phase lines up with its contact frames.
// The animator runs one simulation step ahead of the attack clock (both start
// on the press step), so the first contact frame may show one step before the
// phase opens and the next frame one step before it closes; never more.
function assertActiveOnContactFrames(log, id) {
  const contact = CONTACT[id];
  const last = contact.at(-1);
  const active = log.filter((s) => s.phase === 'active');
  assert.equal(active.length, steps(contact.length / 12), `${id}: active for exactly the contact frames`);
  const shown = active.map((s) => frameNo(s.frame));
  for (const n of shown) assert.ok(contact.includes(n) || n === last + 1, `${id}: active on frame ${n}`);
  assert.ok(shown.filter((n) => !contact.includes(n)).length <= 1, `${id}: ${shown}`);
  for (const n of contact) assert.ok(shown.includes(n), `${id}: frame ${n} is live`);
  const early = log.filter((s) => s.phase !== 'active' && contact.includes(frameNo(s.frame)));
  assert.ok(early.length <= 1 && early.every((s) => s.phase === 'startup'), `${id}: contact frames outside active`);
  // Wind-up and recovery frames are never live.
  for (const s of log) {
    const n = frameNo(s.frame);
    if (n < contact[0] || n > last + 1) assert.notEqual(s.phase, 'active', `${id}: frame ${n}`);
  }
}

test('the ground BA2 hitbox is live only on the kick frames (2ba4-2ba5)', () => {
  const { step } = makeFighter();
  const log = recordAttack(step, BA2);
  assert.equal(log[0].id, 'ba2');
  assertActiveOnContactFrames(log, 'ba2');
});

test('the mid-air BA2 hitbox is live only on the kick frame (midair1ba3)', () => {
  const { step } = makeFighter();
  step(JUMP);
  const log = recordAttack(step, BA2);
  assert.equal(log[0].id, 'midairBa2');
  assertActiveOnContactFrames(log, 'midairBa2');
  // Wind-up before it, recovery after it.
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active', 'recovery']);
});

test('airborne action2 plays the five-frame mid-air BA2 (the airborne kick) during the ascent, under normal gravity', () => {
  const { fighter, step } = makeFighter();
  // The same jump without an attack, for comparison.
  const plain = makeFighter();
  step(JUMP);
  plain.step(JUMP);
  step();
  plain.step();
  assert.ok(fighter.body.vy < 0, 'rising');
  step(BA2);
  plain.step();
  assert.equal(fighter.combat.attack.def.id, 'midairBa2');
  assert.equal(fighter.animator.anim.key, 'midairBa2');
  assert.equal(frameName(fighter), '0001_midair1ba1.png');
  const log = [{ frame: frameName(fighter) }];
  const vys = [fighter.body.vy];
  while (fighter.state === 'attack') {
    step();
    plain.step();
    // Gravity keeps working: no freeze, no extra lift.
    for (const k of ['x', 'y', 'vx', 'vy']) assert.equal(fighter.body[k], plain.fighter.body[k], `body.${k}`);
    vys.push(fighter.body.vy);
    if (fighter.state === 'attack') log.push({ frame: frameName(fighter) });
  }
  assert.deepEqual(sequence(log), [
    '0001_midair1ba1.png', '0001_midair1ba2.png', '0001_midair1ba3.png',
    '0001_midair1ba4.png', '0001_midair1ba5.png',
  ]);
  assert.equal(log.length, steps(5 / 12), 'one pass of the clip');
  for (let i = 1; i < vys.length; i++) assert.ok(vys[i] > vys[i - 1], 'falling faster every step');
  assert.equal(fighter.grounded, false);
  assert.ok(['jump', 'fall'].includes(fighter.state));
  assert.match(frameName(fighter), /^0001_(jump|fall)\d\.png$/);
});

test('airborne action2 also triggers mid-air BA2 during the descent', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0);
  assert.equal(fighter.state, 'fall');
  step(BA2);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'midairBa2');
  assert.equal(frameName(fighter), '0001_midair1ba1.png');
  const log = recordAttack(step);
  assert.equal(log[0].grounded, false);
  assert.equal(sequence(log).at(-1), '0001_midair1ba5.png');
  assert.ok(log.every((s) => s.id === 'midairBa2'));
  // The press step, then the rest of the clip: its full length, landing or not.
  assert.equal(1 + log.length, steps(5 / 12));
});

test('landing during mid-air BA2 finishes the mid-air clip instead of switching to ground BA2 or land', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  // Late in the descent, so the fighter lands partway through the attack.
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 740);
  const states = [];
  const log = [];
  let f = step(BA2);
  while (f.state === 'attack') {
    log.push({ id: f.combat.attack.def.id, frame: frameName(f), anim: f.animator.anim.key, grounded: f.grounded });
    states.push(f.state);
    f = step();
  }
  assert.equal(log[0].grounded, false);
  assert.ok(log.some((s) => s.grounded), 'landed during the attack');
  for (const s of log) {
    assert.equal(s.id, 'midairBa2');
    assert.equal(s.anim, 'midairBa2');
    assert.match(s.frame, /^0001_midair1ba\d\.png$/);
  }
  assert.ok(!states.includes('land'));
  assert.deepEqual(sequence(log), [
    '0001_midair1ba1.png', '0001_midair1ba2.png', '0001_midair1ba3.png',
    '0001_midair1ba4.png', '0001_midair1ba5.png',
  ]);
  assert.equal(log.length, steps(5 / 12), 'the attack runs its full length');
  // Touchdown happened mid-attack, so there is no late land clip afterwards.
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle1.png');
});

test('BA2 on the same step as a jump attacks on the ground; the jump is dropped', () => {
  const { fighter, step } = makeFighter();
  step({ ...JUMP, ...BA2 });
  assert.equal(fighter.combat.attack.def.id, 'ba2');
  assert.equal(fighter.grounded, true);
  const log = recordAttack(step);
  assert.ok(log.every((s) => s.grounded && s.id === 'ba2'));
  assert.equal(fighter.grounded, true);
});

test('BA2 locks movement and facing while it plays', () => {
  for (const air of [false, true]) {
    const { fighter, step } = makeFighter();
    stepUntil(step, (f) => f.state === 'run', { right: true });
    if (air) step({ right: true, ...JUMP });
    step({ right: true, ...BA2 });
    assert.equal(fighter.combat.attack.def.id, air ? 'midairBa2' : 'ba2');
    const log = [];
    while (fighter.state === 'attack') {
      log.push(fighter.body.vx);
      assert.equal(fighter.facing, 1, 'holding Left never turns an attack around');
      step({ left: true });
    }
    assert.ok(log.every((vx) => vx >= 0), 'no steering against the attack');
    for (let i = 1; i < log.length; i++) assert.ok(log[i] <= log[i - 1], 'only decelerates');
    if (!air) assert.equal(log.at(-1), 0, 'decelerates to a stop');
    // Once it ends, the held direction applies again.
    stepUntil(step, (f) => f.facing === -1, { left: true }, 30);
  }
});

test('hitstun overrides BA2 on screen', () => {
  const { fighter, step } = makeFighter();
  step(BA2);
  fighter.combat.stun = 0.2;
  step();
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_hurt.png');
});

test('ground BA2 hits an opponent in front once, during the active phase, with its own values', () => {
  const { attacker, target, tick, events } = duel();
  target.combat.launchPoint = LAUNCH_FROM;
  const startX = target.body.x;
  tick(BA2);
  let hitPhase = null;
  let hitFrame = null;
  while (attacker.combat.attack) {
    const before = events.length;
    tick();
    if (events.length > before) {
      // CombatSystem runs after the fighters, on the phase they just reached.
      hitPhase = attacker.combat.phase;
      hitFrame = frameNo(frameName(attacker));
      assert.equal(target.combat.stun, 0.24);
      assert.equal(target.combat.hitstop, 0.07);
      assert.equal(attacker.combat.hitstop, 0.07);
      assert.ok(isZero(target.body.vx), 'no sideways push');
      assert.equal(target.body.vy, -LAUNCHED, 'launched upward');
      assert.equal(target.grounded, false);
    }
    // Keep the target overlapping: one attack still hits only once.
    if (events.length) target.body.x = startX;
  }
  assert.equal(events.length, 1, 'one hit per attack');
  assert.equal(events[0].type, 'hit');
  assert.equal(events[0].attacker, attacker);
  assert.equal(events[0].damage, 10);
  assert.equal(target.combat.launchPoint, LAUNCH_FROM + 10);
  assert.equal(hitPhase, 'active');
  assert.ok(CONTACT.ba2.includes(hitFrame), `hit on frame ${hitFrame}`);
});

test('a normal BA2 hit launches a grounded target straight up through the shared CombatSystem', (t) => {
  const applyHit = t.mock.method(CombatSystem.prototype, 'applyHit');
  for (const facing of [1, -1]) {
    applyHit.mock.resetCalls();
    const { attacker, target, tick, events } = duel({ attackerFacing: facing });
    target.combat.launchPoint = LAUNCH_FROM;
    const groundY = target.body.y;
    const startX = target.body.x;
    assert.equal(target.grounded, true);
    tick(BA2);
    while (!events.length) tick();
    // At impact, before any gravity: vx 0, upward at 2 x 30, off the ground.
    assert.ok(isZero(target.body.vx), `facing ${facing}: no sideways push`);
    assert.equal(target.body.vy, -LAUNCHED);
    assert.equal(target.grounded, false);
    // Through the one shared applyHit, with BA2's own resolved definition.
    assert.equal(applyHit.mock.callCount(), 1);
    const [by, on, hitDef] = applyHit.mock.calls[0].arguments;
    assert.deepEqual([by, on, hitDef], [attacker, target, attacker.attacks.ba2]);

    // The impact freeze holds it in place, then Alva's gravity takes over:
    // it rises, slows by gravity every step, comes back down and lands where
    // it stood, never pushed sideways.
    let vy = target.body.vy;
    let top = target.body.y;
    let frozen = 0;
    while (!target.grounded) {
      const y = target.body.y;
      tick();
      if (target.body.vy === vy) {
        frozen++;
        assert.equal(target.body.y, y, 'held by the impact freeze');
      } else if (!target.grounded) {
        assert.ok(Math.abs(target.body.vy - vy - CONFIG.sim.gravity * DT) < 1e-9, 'gravity per step');
      }
      vy = target.body.vy;
      top = Math.min(top, target.body.y);
      assert.equal(target.body.x, startX, 'straight up and down');
    }
    assert.equal(frozen, Math.floor(attacker.attacks.ba2.hitstop / DT), 'frozen for the hitstop first');
    assert.ok(groundY - top > 5, `rose ${(groundY - top).toFixed(1)} units`);
    assert.equal(target.body.y, groundY, 'back on the ground');
    assert.equal(target.body.x, startX);
  }
});

test('a ground BA2 hit shows the target in its hurt poses while it is launched', () => {
  const { attacker, target, tick, until, events } = duel();
  // Launched at 2 x 30: long enough in the air to outlast its hitstun.
  target.combat.launchPoint = LAUNCH_FROM;
  tick(BA2);
  until(() => events.length > 0, 60);
  const frozenAt = { x: target.body.x, y: target.body.y, attackerFrame: frameName(attacker) };
  tick(); // hitstop: nothing moves, but the pose updates
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_midairhurt.png', 'already off the ground');
  assert.equal(target.body.x, frozenAt.x);
  assert.equal(target.body.y, frozenAt.y);
  assert.equal(frameName(attacker), frozenAt.attackerFrame);
  while (target.combat.hitstop > 0) tick();
  tick();
  assert.ok(target.body.y < frozenAt.y, 'launched upward');
  assert.equal(target.body.x, frozenAt.x, 'not knocked sideways');
  assert.equal(frameName(target), '0001_midairhurt.png');
  // Mid-air hurt for the whole hitstun. The launch outlasts it, so the
  // target is still in the air when it ends and finishes the fall normally.
  while (target.state === 'hitstun') {
    assert.equal(frameName(target), '0001_midairhurt.png');
    tick();
  }
  assert.equal(target.grounded, false, 'still airborne after hitstun');
  assert.ok(['jump', 'fall'].includes(target.state));
  until(() => target.grounded);
  assert.equal(target.body.y, frozenAt.y, 'lands where it stood');
  assert.equal(target.body.x, frozenAt.x);
});

// A duel with #0001 in the air, descending, about to press BA2: mid-air BA2.
function midairBa2Duel({ attackerFacing = 1, gap = 44 } = {}) {
  const d = duel({ gap, attackerFacing });
  d.tick(JUMP);
  // Early in the descent, so the kick connects before touchdown.
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
  d.tick(BA2);
  assert.equal(d.attacker.combat.attack.def.id, 'midairBa2');
  return d;
}

test('a mid-air BA2 hit adds its 10 first, then drives a grounded target downward at 2 x its new Launch Point: 20 + 10 = 30, a strength of 60, no sideways push', () => {
  for (const facing of [1, -1]) {
    const { attacker, target, tick, events } = midairBa2Duel({ attackerFacing: facing });
    target.combat.launchPoint = LAUNCH_FROM;
    const floor = target.body.y;
    const startX = target.body.x;
    while (!events.length) tick();
    assert.equal(events[0].type, 'hit');
    assert.equal(events[0].target, target);
    assert.equal(target.combat.launchPoint, 30, '20 + the kick\'s own 10');
    assert.equal(events[0].launchStrength, STRENGTH);
    assert.equal(attacker.facing, facing);
    // At impact, before the target's next step: CombatSystem.applyHit set it.
    assert.ok(isZero(target.body.vx), 'no horizontal launch');
    assert.equal(target.body.vy, LAUNCHED, 'positive body vy: downward, not upward');
    // Knocked into the floor it stands on: it never rises, and settles back
    // on the ground.
    while (target.combat.stun > 0 || target.combat.hitstop > 0) {
      tick();
      assert.equal(target.body.y, floor, 'never lifted, and never pushed through the floor');
    }
    assert.equal(target.grounded, true);
    assert.equal(target.body.x, startX, 'never pushed sideways');
  }
});

test('a mid-air BA2 hit on a rising target reverses it: driven downward instead of carrying on up', () => {
  // #0001 jumps and presses BA2 on the way down; the target jumps `delay`
  // ticks after that press, so the kick meets it on its way up. Each run
  // logs the target from its jump until it lands.
  const run = (delay, kick) => {
    const d = duel();
    d.target.combat.launchPoint = LAUNCH_FROM;
    d.tick(JUMP);
    d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
    const log = [];
    for (let i = 0; i < 600 && !(log.length && d.target.grounded); i++) {
      const hits = d.events.length;
      const before = { y: d.target.body.y, vy: d.target.body.vy };
      d.tick(i === 0 && kick ? BA2 : {}, i === delay ? JUMP : {});
      if (i >= delay) {
        log.push({ before, y: d.target.body.y, vx: d.target.body.vx, vy: d.target.body.vy, hit: d.events.length > hits, grounded: d.target.grounded });
      }
    }
    return { d, log };
  };
  // The first jump delay whose kick lands while the target is still rising.
  let delay = 0;
  let kicked = null;
  for (; delay < 12; delay++) {
    kicked = run(delay, true);
    const hit = kicked.log.find((s) => s.hit);
    if (hit && hit.before.vy < 0) break;
  }
  assert.ok(delay < 12, 'the kick meets a rising target');
  const plain = run(delay, false);
  assert.equal(plain.d.events.length, 0);
  assert.equal(kicked.d.events.length, 1);
  assert.equal(kicked.d.events[0].type, 'hit');
  const at = kicked.log.findIndex((s) => s.hit);
  const impact = kicked.log[at];
  assert.equal(impact.grounded, false, 'hit in the air');
  assert.ok(impact.before.vy < 0, 'rising until the kick');
  assert.equal(impact.vy, LAUNCHED, 'positive body vy: driven downward at 2 x 30');
  assert.ok(isZero(impact.vx), 'and never pushed sideways');
  // Without the kick the target carries on up; with it, from the hit to
  // touchdown it only ever moves down (or holds, frozen by the impact's
  // hitstop).
  assert.ok(plain.log[at + 1].y < plain.log[at].y, 'unhit, it keeps rising');
  for (let i = at + 1; i < kicked.log.length; i++) {
    assert.ok(kicked.log[i].y >= kicked.log[i - 1].y, `tick ${i}: never lifted`);
  }
  assert.ok(Math.min(...kicked.log.slice(at).map((s) => s.y)) >= impact.y, 'never above where it was hit');
  assert.equal(kicked.d.target.grounded, true, 'lands');
  assert.ok(kicked.log.length < plain.log.length, 'lands sooner than the unhit jump');
});

test('a Shielded mid-air BA2 is neither driven downward nor pushed', () => {
  const d = duel();
  d.tick(JUMP, { defense: true });
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
  d.tick(BA2, { defense: true });
  assert.equal(d.attacker.combat.attack.def.id, 'midairBa2');
  while (!d.events.length && d.attacker.combat.attack) d.tick({}, { defense: true });
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.target.body.vy, 0, 'no downward launch on a block');
  assert.ok(isZero(d.target.body.vx), 'no horizontal launch either');
  assert.equal(d.events[0].damage, 0);
  assert.equal(d.target.combat.launchPoint, 0, 'no chip damage');
  assert.equal(d.target.grounded, true);
});

test('#0001 Shielding BA2 pays 25 Energy and takes its blockstun and hitstop in the Shield, but no damage or launch', () => {
  const { attacker, target, tick, events } = duel();
  const groundY = target.body.y;
  const startX = target.body.x;
  tick(BA2, { defense: true });
  assert.equal(target.combat.shielding, true);
  while (!events.length) tick({}, { defense: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'block');
  assert.equal(events[0].energyCost, 25);
  assert.equal(target.combat.launchPoint, 0, 'no chip damage');
  assert.equal(target.combat.stun, 0, 'no hitstun');
  assert.equal(target.combat.shieldStun, attacker.attacks.ba2.blockstun, 'blockstun, held in the Shield');
  assert.equal(target.combat.hitstop, attacker.attacks.ba2.hitstop, 'hitstop');
  // A Shielded hit never launches.
  assert.equal(target.body.vy, 0);
  assert.equal(target.grounded, true);
  assert.ok(isZero(target.body.vx));
  while (attacker.combat.attack || target.combat.shieldStun > 0) {
    tick({}, { defense: true });
    assert.equal(target.grounded, true, 'stays on the ground');
    assert.equal(target.body.y, groundY);
    assert.equal(target.body.x, startX, 'no horizontal displacement');
    assert.equal(target.state, 'shield', 'never a hurt pose');
  }
  assert.equal(events.length, 1);
  assert.equal(def.stats.blockDamageScale, undefined, '#0001 has no chip-damage stat');
});

test('mid-air BA2 hits a grounded opponent in front while still airborne', () => {
  const { attacker, target, tick, until, events } = duel();
  tick(JUMP);
  // Early in the descent, so the kick connects before touchdown.
  until(() => attacker.body.vy > 0 && attacker.body.y > 650);
  tick(BA2);
  assert.equal(attacker.combat.attack.def.id, 'midairBa2');
  let airborneAtHit = null;
  while (attacker.combat.attack) {
    tick();
    if (events.length && airborneAtHit === null) {
      airborneAtHit = !attacker.grounded;
      assert.equal(attacker.combat.phase, 'active');
      assert.equal(frameName(attacker), '0001_midair1ba3.png');
      // The kick's own stun and freeze, on both fighters.
      assert.equal(target.combat.stun, 0.22);
      assert.equal(target.combat.hitstop, 0.06);
      assert.equal(attacker.combat.hitstop, 0.06);
    }
  }
  assert.equal(events.length, 1);
  assert.equal(airborneAtHit, true);
  assert.equal(events[0].damage, 10);
  assert.equal(target.combat.launchPoint, 10);
});

test('mid-air BA2 hits an airborne opponent at the same height, showing its mid-air hurt pose', () => {
  const { attacker, target, tick, events } = duel();
  tick(JUMP, JUMP);
  tick(BA2);
  assert.equal(attacker.combat.attack.def.id, 'midairBa2');
  while (attacker.combat.attack && !events.length) tick();
  assert.equal(events.length, 1);
  assert.equal(attacker.grounded, false);
  assert.equal(target.grounded, false);
  tick();
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_midairhurt.png');
  assert.equal(target.combat.launchPoint, 10);
});

test('BA2 hitboxes mirror with facing', () => {
  for (const id of ['ba2', 'midairBa2']) {
    const hb = def.attacks[id].hitbox;
    const right = worldBox(makeFighter({ facing: 1 }).fighter, hb);
    const left = worldBox(makeFighter({ facing: -1 }).fighter, hb);
    assert.equal(right.x, 500 + hb.x);
    assert.equal(left.x + left.w, 500 - hb.x, `${id} mirrors about the origin`);
    assert.equal(left.y, right.y);
    assert.equal(left.w, right.w);
  }

  const { attacker, target, tick, events } = duel({ attackerFacing: -1 });
  assert.equal(attacker.facing, -1);
  target.combat.launchPoint = LAUNCH_FROM;
  const startX = target.body.x;
  tick(BA2);
  while (!events.length) tick();
  assert.equal(events.length, 1, 'hits the opponent on the left');
  assert.equal(target.body.vy, -LAUNCHED, 'launched upward');
  assert.ok(isZero(target.body.vx), 'not pushed either way');
  while (attacker.combat.attack) tick();
  assert.equal(target.body.x, startX);
});

test('BA2 misses an opponent out of reach or behind the attacker', () => {
  // Just past the longer reach of the two, the mid-air kick's.
  for (const gap of [70, -44]) {
    for (const air of [false, true]) {
      const { attacker, target, tick, until, events } = duel({ gap });
      attacker.facing = 1;
      if (air) {
        tick(JUMP, JUMP);
        until(() => attacker.body.vy > -600);
      }
      tick(BA2);
      assert.equal(attacker.combat.attack?.def.id, air ? 'midairBa2' : 'ba2');
      while (attacker.combat.attack) tick();
      assert.equal(events.length, 0, `gap ${gap}${air ? ' in the air' : ''}`);
      assert.equal(target.combat.launchPoint, 0);
    }
  }
});

test('BA2 whose frames failed to load is refused, not faked, and never hits', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const keys = Object.keys(def.animations).filter((k) => k !== 'ba2' && k !== 'midairBa2');
  const sprites = fakeSprites(keys);
  const { attacker, target, tick, events } = duel({ attackerSprites: sprites });
  tick(BA2);
  assert.equal(attacker.combat.attack, null);
  assert.equal(attacker.state, 'idle');
  assert.equal(frameName(attacker), '0001_idle1.png');
  for (let i = 0; i < steps(1); i++) {
    tick(i % 10 === 0 ? BA2 : {});
    assert.equal(attacker.combat.attack, null);
    assert.equal(attacker.combat.phase, null, 'no hitbox');
  }
  assert.equal(events.length, 0);
  assert.equal(target.combat.launchPoint, 0);

  // In the air, too.
  tick(JUMP);
  tick(BA2);
  assert.equal(attacker.combat.attack, null);
  assert.ok(['jump', 'fall'].includes(attacker.state));
  assert.ok(warn.mock.callCount() >= 2);
  assert.ok(warn.mock.calls.every((c) => /Attack "(ba2|midairBa2)" has no animation frames/.test(c.arguments[0])));

  // BA1 is unaffected by missing BA2 art.
  const ba1 = makeFighter({ sprites });
  ba1.step(BA1);
  assert.equal(ba1.fighter.combat.attack?.def.id, 'ba1');
});

test('only the missing half of BA2 is refused', (t) => {
  t.mock.method(console, 'warn', () => {});
  const noAir = fakeSprites(Object.keys(def.animations).filter((k) => k !== 'midairBa2'));
  const { fighter, step } = makeFighter({ sprites: noAir });
  step(BA2);
  assert.equal(fighter.combat.attack?.def.id, 'ba2');
  recordAttack(step);
  step(JUMP);
  step(BA2);
  assert.equal(fighter.combat.attack, null);
});

test('the training CPU stays non-attacking with BA2 mapped', async () => {
  const { TrainingAIController } = await import('../js/game/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 300 < 150 ? { right: true } : { left: true, ...(i % 61 === 0 ? JUMP : {}) });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.action2, false);
    assert.equal(out.action2Pressed, false);
    bot.step(out);
    assert.equal(bot.fighter.combat.attack, null);
  }
});

test('Quick Battle: a BA2 hit launches the training CPU straight up through the arena\'s CombatSystem', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../js/game/battle.js');
  const { getMap } = await import('../js/data/maps.js');
  const { TrainingAIController } = await import('../js/game/fighter-controller.js');
  const sprites = fakeSprites();
  let once = {};
  const input = {
    flush() {},
    sample() {
      const out = { ...once };
      once = {};
      return out;
    },
  };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  const { p1, p2 } = battle;
  // The real training CPU, told to stand still so the test is deterministic.
  const ai = new TrainingAIController({ rng: () => 0.5 });
  ai.thinkTimer = Infinity;
  p2.controller = ai;
  battle.setPhase('fight');
  p2.body.x = p1.body.x + 44;
  battle.update(DT); // pushboxes settle them side by side; P2 turns to face P1
  p2.combat.launchPoint = LAUNCH_FROM;
  const groundY = p2.body.y;
  const startX = p2.body.x;
  once = BA2;
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) {
    battle.update(DT);
    hit = battle.combat.events.find((e) => e.type === 'hit') ?? null;
  }
  assert.ok(hit, 'BA2 connected');
  assert.equal(hit.attacker, p1);
  assert.equal(hit.target, p2);
  assert.equal(p2.combat.launchPoint, LAUNCH_FROM + 10);
  assert.ok(isZero(p2.body.vx), 'no sideways push');
  assert.equal(p2.body.vy, -LAUNCHED);
  assert.equal(p2.grounded, false);
  let top = groundY;
  for (let i = 0; i < 120 && !(p2.grounded && i > 0); i++) {
    battle.update(DT);
    top = Math.min(top, p2.body.y);
  }
  assert.ok(top < groundY, 'visibly left the ground');
  assert.equal(p2.grounded, true, 'gravity brought it back down');
  assert.equal(p2.body.y, groundY);
  assert.equal(p2.body.x, startX, 'straight up and down');
  battle.destroy();
});

test('damage accumulates as Launch Point: BA1 -> BA1 -> BA2 on a fresh target is 5 + 5 + 10 = 20, each hit launching from its own new total', () => {
  const { attacker, target, tick, until, events } = duel();
  for (const [press, total] of [[{ action1: true, action1Pressed: true }, 5], [{ action1: true, action1Pressed: true }, 10], [BA2, 20]]) {
    // Back in reach and settled for each hit: this is about the numbers.
    until(() => !attacker.combat.attack && !attacker.combat.cooldowns.size && target.combat.stun <= 0 && target.grounded && target.combat.hitstop <= 0);
    target.body.x = attacker.body.x + 44;
    target.body.vx = 0;
    const before = events.length;
    tick(press);
    until(() => events.length > before);
    const e = events.at(-1);
    assert.equal(e.launchPointAfter, total);
    assert.equal(target.combat.launchPoint, total);
    assert.equal('launchMultiplier' in e, false, 'no launch multiplier');
    assert.equal('bonusLaunch' in e, false, 'no bonus launch');
  }
  assert.deepEqual(events.map((e) => e.damage), [5, 5, 10]);
  // Each hit's strength is its Base Launch x the Launch Point it leaves the
  // target at, sent along its own direction at LAUNCH_UNIT_SPEED per point:
  // BA1 1 x 5 and 1 x 10 sideways, BA2 2 x 20 upward.
  const U = LAUNCH_UNIT_SPEED;
  assert.deepEqual(events.map((e) => [e.launchPointBefore, e.launchPointAfter, e.baseLaunch, e.directionalLaunch, e.launchStrength, e.finalLaunch]), [
    [0, 5, 1, 'horizontal', 5, { x: 5 * U, y: 0 }],
    [5, 10, 1, 'horizontal', 10, { x: 10 * U, y: 0 }],
    [10, 20, 2, 'vertical', 40, { x: 0, y: -40 * U }],
  ]);
  assert.equal(attacker.combat.launchPoint, 0);
});
