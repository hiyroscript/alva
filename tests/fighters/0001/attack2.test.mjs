// Run with node --test tests/fighters/0001/attack2.test.mjs (no dependencies).
// #0001's attack2 button (attack2, the Kick, and midair_attack2): inputs,
// ground/air selection, clip playback, phase timing against the art, hit
// resolution (ground attack2's Base
// Launch 2 vertical launch; midair_attack2, the five-frame airborne kick,
// driving the target downward at Base Launch 2 reverse vertical; and a
// Shielded attack2 that is neither launched nor driven down) and missing-art
// safety. Uses the real Fighter, CombatSystem, physics and
// InputManager (see tests/helpers/fighter-harness.mjs). The attack1 button lives in
// attack1.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMBAT_ACTIONS } from '../../../js/game/fighters/fighter.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { worldBox, CombatSystem } from '../../../js/game/combat/combat.js';
import { ACTIONS, CONFIG } from '../../../js/config.js';
import { LAUNCH_UNIT_SPEED } from '../../../js/data/launch.js';
import {
  def, DT, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil,
  steps, frameNo, recordAttack, sequence, duel,
} from '../../helpers/fighter-harness.mjs';
import { resolveLaunchStun } from '../../../js/game/combat/combat.js';

const ATTACK1 = { attack1: true, attack1Pressed: true };
const ATTACK2 = { attack2: true, attack2Pressed: true };
const JUMP = { jump: true, jumpPressed: true };

// The frames each attack is live on, chosen from the art: ground attack2's kick
// (attack2_4 low sweep, attack2_5 rising kick, both with motion trails) and mid-air
// attack2's kick (midair_attack2_3, the forward-low arc).
const CONTACT = { attack2: [4, 5], midair_attack2: [3] };

// Either attack2 adds 5 to the target's Launch Point first, then launches at
// Base Launch 2 x that new Launch Point: ground attack2 upward, midair_attack2
// downward. The launch tests start the target at 25, so 25 + 5 = 30, a
// strength of 2 x 30 = 60, and a speed of 60 x LAUNCH_UNIT_SPEED (600): a
// clear launch that still lands on the stage.
const LAUNCH_FROM = 25;
const STRENGTH = 60;
const LAUNCHED = STRENGTH * LAUNCH_UNIT_SPEED;
const BA2_LAUNCH = {
  attack2: { baseLaunch: 2, directionalLaunch: 'vertical' },
  midair_attack2: { baseLaunch: 2, directionalLaunch: 'reverseVertical' },
};

// Each attack2's whole data entry. Ground attack2 is the seven-frame spinning high
// kick; midair_attack2 is the five-frame airborne kick (midair_attack2_1-5), with the
// kick's own timing, hitbox and combat values, and each its own movement:
// the spinning kick keeps half a run's speed and steps in on its first
// frame; the airborne kick keeps all of its drift and some steering. Both
// open a follow-up once they hit (hitCancel, from their kick).
const ENTRIES = {
  attack2: {
    animation: 'attack2', startup: 3 / 12, active: 2 / 12, recovery: 2 / 12, damage: 5,
    hitbox: { x: 10, y: -88, w: 24, h: 78 }, ...BA2_LAUNCH.attack2,
    hitstun: 0.28, blockstun: 0.15, hitstop: 0.09, cooldown: 0.15, groundOnly: true,
    momentum: 0.5, friction: 0.5, step: { at: 0, speed: 280 }, hitCancel: 3 / 12,
  },
  midair_attack2: {
    animation: 'midair_attack2', startup: 2 / 12, active: 1 / 12, recovery: 2 / 12, damage: 5,
    hitbox: { x: 8, y: -44, w: 40, h: 40 }, ...BA2_LAUNCH.midair_attack2,
    hitstun: 0.28, blockstun: 0.14, hitstop: 0.08, cooldown: 0.1,
    airMomentum: 1, airControl: 0.7, hitCancel: 2 / 12,
  },
};

// Zero either way: +0 or -0 (both === 0).
const isZero = (v) => v === 0;

test('the attack2 button: ground attack2, air midair_attack2; the controls go by their canonical codenames', () => {
  assert.deepEqual(def.actions.attack2, { ground: 'attack2', air: 'midair_attack2' });
  assert.deepEqual(def.actions.attack1, { ground: 'attack1', air: 'midair_attack1' });
  assert.equal(def.actions.extra_attack, 'extra_attack');
  assert.equal(def.actions.transform, null);
  assert.deepEqual(CONFIG.bindings.attack1, ['KeyU']);
  assert.deepEqual(CONFIG.bindings.attack2, ['KeyI']);
  for (const action of ['attack1', 'attack2']) {
    assert.ok(COMBAT_ACTIONS.includes(action), action);
    assert.ok(ACTIONS.includes(action), action);
  }
  // The retired generic names are gone, with no alias left behind.
  for (const retired of ['action1', 'action2']) {
    assert.ok(!COMBAT_ACTIONS.includes(retired) && !ACTIONS.includes(retired), `no ${retired} input action`);
    assert.equal(def.actions[retired], undefined, `no ${retired} action mapping`);
  }
});

test('keyboard I and gamepad LB press attack2; U and B / Circle still press attack1', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../../../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code) => listeners[type]({ code, repeat: false, preventDefault() {} });
  const pressed = () => {
    const f = input.sample();
    return COMBAT_ACTIONS.filter((a) => f[`${a}Pressed`]);
  };

  key('keydown', 'KeyI');
  assert.deepEqual(pressed(), ['attack2']);
  key('keyup', 'KeyI');
  key('keydown', 'KeyU');
  assert.deepEqual(pressed(), ['attack1']);
  key('keyup', 'KeyU');

  listeners.gamepadconnected();
  const button = (i, down) => {
    pad.buttons[i] = { pressed: down, value: down ? 1 : 0 };
    input.pollGamepads(0);
  };
  button(4, true); // LB
  assert.deepEqual(pressed(), ['attack2']);
  button(4, false);
  button(1, true); // B / Circle
  assert.deepEqual(pressed(), ['attack1']);
  button(1, false);
  // Shield and jump mappings are unchanged.
  for (const [i, action] of [[0, 'jump'], [5, 'shield'], [7, 'shield']]) {
    button(i, true);
    assert.equal(input.sample()[action], true, `button ${i}`);
    button(i, false);
  }
});

test('attack2 attack definitions match their clips: the ground spinning kick launching upward, the mid-air kick driving downward', () => {
  const { fighter } = makeFighter();
  for (const id of ['attack2', 'midair_attack2']) {
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
    // Not attack1 under another name: its own art and hitbox.
    const punch = fighter.attacks[id === 'attack2' ? 'attack1' : 'midair_attack1'];
    assert.notEqual(atk.animation, punch.animation);
    assert.notDeepEqual(atk.hitbox, punch.hitbox);
    // In front of the fighter and above the feet.
    const hb = atk.hitbox;
    assert.ok(hb.x > 0 && hb.x + hb.w > def.collider.width / 2, `${id} hitbox is in front`);
    assert.ok(hb.y < 0 && hb.y + hb.h <= 0, `${id} hitbox is above the feet`);
  }
  // Ground attack2: frames 1-3 wind-up, 4-5 the kick, 6-7 recovery. Slower and
  // heavier than ground attack1, which only pushes; its hitbox spans the kick's
  // arc within a limb's reach, never wrapping the fighter's own body.
  const g = fighter.attacks.attack2;
  const first = fighter.attacks.attack1;
  assert.equal(def.animations.attack2.frames.length, 7);
  assert.deepEqual([g.startup, g.active, g.recovery], [3 / 12, 2 / 12, 2 / 12]);
  assert.equal(g.groundOnly, true);
  assert.equal(g.damage, 5, 'adds 5 Launch Point');
  assert.deepEqual([g.hitstun, g.blockstun, g.hitstop, g.cooldown], [0.28, 0.15, 0.09, 0.15]);
  assert.ok(g.total > first.total && g.startup > first.startup, 'slower than ground attack1, more committed');
  assert.ok(g.damage > first.damage && g.hitstop > first.hitstop, 'heavier than ground attack1: more damage, a stronger freeze');
  assert.equal(g.hitCancel, g.startup, 'a follow-up from its kick on, once it hits');
  assert.equal(first.directionalLaunch, 'horizontal', 'attack1 pushes sideways');
  assert.equal(g.directionalLaunch, 'vertical', 'attack2 launches upward instead');
  assert.ok(g.baseLaunch > first.baseLaunch, 'attack2 doubles the Launch Point; attack1 uses it once');
  assert.ok(g.hitbox.x + g.hitbox.w <= 40, 'attack2 hitbox stays within reach');
  assert.ok(g.hitbox.w < def.collider.width, 'attack2 hitbox is narrower than the fighter');
  // midair_attack2: frames 1-2 wind-up, frame 3 the kick, frames 4-5 recovery.
  // The kick's forward-low box, no bigger than the fighter's own body.
  const a = fighter.attacks.midair_attack2;
  assert.equal(def.animations.midair_attack2.frames.length, 5);
  assert.deepEqual([a.startup, a.active, a.recovery], [2 / 12, 1 / 12, 2 / 12]);
  assert.equal(a.groundOnly, false);
  assert.equal(a.damage, 5, 'adds 5 Launch Point');
  assert.deepEqual([a.hitstun, a.blockstun, a.hitstop, a.cooldown], [0.28, 0.14, 0.08, 0.1]);
  assert.equal(a.hitCancel, a.startup, 'a follow-up from its kick on, once it hits');
  assert.ok(a.hitbox.x + a.hitbox.w <= 60, 'midair_attack2 hitbox is within reach');
  assert.ok(a.hitbox.w <= def.collider.width + 10 && a.hitbox.h <= def.collider.height / 2, 'midair_attack2 hitbox is not oversized');
  // Ground attack2's Base Launch, reversed: where midair_attack1 launches upward,
  // midair_attack2 drives the target down.
  assert.equal(a.baseLaunch, g.baseLaunch, 'the same Base Launch as ground attack2');
  assert.equal(a.directionalLaunch, 'reverseVertical', 'midair_attack2 drives downward');
  assert.equal(fighter.attacks.midair_attack1.directionalLaunch, 'vertical', 'midair_attack1 launches upward');
});

test('attack2\'s launch is exactly its declared Base Launch and Directional Launch, never derived from its damage', () => {
  for (const id of ['attack2', 'midair_attack2']) {
    const source = def.attacks[id];
    assert.equal(source.baseLaunch, 2, `${id} declares Base Launch 2`);
    assert.equal(source.directionalLaunch, BA2_LAUNCH[id].directionalLaunch);
    assert.equal('powers' in source, false, `${id} declares no Powers`);
    // Any other legal Base Launch on the same entry is kept as declared: it
    // is never inferred from the 5 damage, and the direction never changes.
    for (const baseLaunch of [0, 1, 2, 3]) {
      const atk = createAttackDefinition({ id, ...source, baseLaunch });
      assert.deepEqual([atk.baseLaunch, atk.directionalLaunch, atk.damage], [baseLaunch, source.directionalLaunch, 5], `${id} at ${baseLaunch}`);
    }
    // Everything about attack2 is the entry's own.
    const { fighter } = makeFighter();
    const atk = fighter.attacks[id];
    for (const [key, value] of Object.entries(source)) assert.deepEqual(atk[key], value, `${id}.${key}`);
  }
  // The launch is the shared launch path's: nothing in combat singles out
  // an attack or a fighter.
  // Its code, that is: the schema comments show example move codenames.
  const combat = ['combat', 'attacks', 'combat-state', 'defense']
    .map((name) => readFileSync(new URL(`../../../js/game/combat/${name}.js`, import.meta.url), 'utf8')).join('\n')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(combat, /(?:\.id|attack|attackId)\s*===?\s*['"]/);
  assert.doesNotMatch(combat, /'0001'|'attack2'|'midair_attack2'/);
});

test('grounded attack2 plays the seven-frame ground attack2 once, then returns to idle', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK2);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'attack2');
  assert.equal(fighter.animator.anim.key, 'attack2');
  assert.equal(frameName(fighter), '0001_attack2_1.png');

  const log = [{ frame: frameName(fighter), phase: fighter.combat.phase }, ...recordAttack(step)];
  assert.deepEqual(sequence(log), [
    '0001_attack2_1.png', '0001_attack2_2.png', '0001_attack2_3.png', '0001_attack2_4.png',
    '0001_attack2_5.png', '0001_attack2_6.png', '0001_attack2_7.png',
  ]);
  assert.equal(log.length, steps(7 / 12), 'one pass of the clip');
  // Never loops back to an earlier frame.
  for (let i = 1; i < log.length; i++) assert.ok(frameNo(log[i].frame) >= frameNo(log[i - 1].frame));
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active', 'recovery']);
  assert.ok(log.slice(1).every((s) => s.grounded && s.id === 'attack2' && s.anim === 'attack2'));

  // Clean exit: no attack, idle art.
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.combat.attack, null);
  assert.equal(frameName(fighter), '0001_idle_1.png');

  // Cooldown: attack2 is refused until it expires; attack1 has its own cooldown.
  assert.ok(fighter.combat.cooldowns.has('attack2'));
  assert.equal(fighter.tryAction('attack2'), false);
  assert.equal(fighter.combat.attack, null);
  const n = stepUntil(step, (f) => !f.combat.cooldowns.has('attack2'), {}, steps(0.3));
  // The whole cooldown (float accumulation may add one step), no more.
  assert.ok(n >= steps(0.15) && n <= steps(0.15) + 1, `${n} steps`);
  step(ATTACK2);
  assert.equal(fighter.combat.attack?.def.id, 'attack2');
  recordAttack(step);
  step(ATTACK1);
  assert.equal(fighter.combat.attack?.def.id, 'attack1', 'attack1 is free while attack2 cools down');
});

test('attack2 cannot be cancelled into attack1, and attack1 cannot be cancelled into attack2', () => {
  for (const [first, second, id] of [[ATTACK2, ATTACK1, 'attack2'], [ATTACK1, ATTACK2, 'attack1']]) {
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

test('the ground attack2 hitbox is live only on the kick frames (attack2_4-attack2_5)', () => {
  const { step } = makeFighter();
  const log = recordAttack(step, ATTACK2);
  assert.equal(log[0].id, 'attack2');
  assertActiveOnContactFrames(log, 'attack2');
});

test('the midair_attack2 hitbox is live only on the kick frame (midair_attack2_3)', () => {
  const { step } = makeFighter();
  step(JUMP);
  const log = recordAttack(step, ATTACK2);
  assert.equal(log[0].id, 'midair_attack2');
  assertActiveOnContactFrames(log, 'midair_attack2');
  // Wind-up before it, recovery after it.
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active', 'recovery']);
});

test('airborne attack2 plays the five-frame midair_attack2 (the airborne kick) during the ascent, under normal gravity', () => {
  const { fighter, step } = makeFighter();
  // The same jump without an attack, for comparison. A tap: the normal jump.
  const plain = makeFighter();
  const HELD = {};
  step(JUMP);
  plain.step(JUMP);
  step(HELD);
  plain.step(HELD);
  assert.ok(fighter.body.vy < 0, 'rising');
  step({ ...ATTACK2, ...HELD });
  plain.step(HELD);
  assert.equal(fighter.combat.attack.def.id, 'midair_attack2');
  assert.equal(fighter.animator.anim.key, 'midair_attack2');
  assert.equal(frameName(fighter), '0001_midair_attack2_1.png');
  const log = [{ frame: frameName(fighter) }];
  const vys = [fighter.body.vy];
  while (fighter.state === 'attack') {
    step(HELD);
    plain.step(HELD);
    // Gravity keeps working: no freeze, no extra lift.
    for (const k of ['x', 'y', 'vx', 'vy']) assert.equal(fighter.body[k], plain.fighter.body[k], `body.${k}`);
    vys.push(fighter.body.vy);
    if (fighter.state === 'attack') log.push({ frame: frameName(fighter) });
  }
  assert.deepEqual(sequence(log), [
    '0001_midair_attack2_1.png', '0001_midair_attack2_2.png', '0001_midair_attack2_3.png',
    '0001_midair_attack2_4.png', '0001_midair_attack2_5.png',
  ]);
  assert.equal(log.length, steps(5 / 12), 'one pass of the clip');
  for (let i = 1; i < vys.length; i++) assert.ok(vys[i] > vys[i - 1], 'falling faster every step');
  assert.equal(fighter.grounded, false);
  assert.ok(['jump', 'fall'].includes(fighter.state));
  assert.match(frameName(fighter), /^0001_(jump|fall)_\d\.png$/);
});

test('airborne attack2 also triggers midair_attack2 during the descent', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0);
  assert.equal(fighter.state, 'fall');
  step(ATTACK2);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'midair_attack2');
  assert.equal(frameName(fighter), '0001_midair_attack2_1.png');
  const log = recordAttack(step);
  assert.equal(log[0].grounded, false);
  assert.equal(sequence(log).at(-1), '0001_midair_attack2_5.png');
  assert.ok(log.every((s) => s.id === 'midair_attack2'));
  // The press step, then the rest of the clip: its full length, landing or not.
  assert.equal(1 + log.length, steps(5 / 12));
});

test('landing during midair_attack2 finishes the mid-air clip instead of switching to ground attack2 or land', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  // Late in the descent, so the fighter lands partway through the attack.
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 740);
  const states = [];
  const log = [];
  let f = step(ATTACK2);
  while (f.state === 'attack') {
    log.push({ id: f.combat.attack.def.id, frame: frameName(f), anim: f.animator.anim.key, grounded: f.grounded });
    states.push(f.state);
    f = step();
  }
  assert.equal(log[0].grounded, false);
  assert.ok(log.some((s) => s.grounded), 'landed during the attack');
  for (const s of log) {
    assert.equal(s.id, 'midair_attack2');
    assert.equal(s.anim, 'midair_attack2');
    assert.match(s.frame, /^0001_midair_attack2_\d\.png$/);
  }
  assert.ok(!states.includes('land'));
  assert.deepEqual(sequence(log), [
    '0001_midair_attack2_1.png', '0001_midair_attack2_2.png', '0001_midair_attack2_3.png',
    '0001_midair_attack2_4.png', '0001_midair_attack2_5.png',
  ]);
  assert.equal(log.length, steps(5 / 12), 'the attack runs its full length');
  // Touchdown happened mid-attack, so there is no late land clip afterwards.
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle_1.png');
});

test('attack2 on the same step as a jump attacks on the ground; the jump is dropped', () => {
  const { fighter, step } = makeFighter();
  step({ ...JUMP, ...ATTACK2 });
  assert.equal(fighter.combat.attack.def.id, 'attack2');
  assert.equal(fighter.grounded, true);
  const log = recordAttack(step);
  assert.ok(log.every((s) => s.grounded && s.id === 'attack2'));
  assert.equal(fighter.grounded, true);
});

test('attack2 turns to the direction held while it plays; the ground kick is steered by nothing, the airborne kick by its airControl', () => {
  for (const air of [false, true]) {
    const { fighter, step } = makeFighter();
    stepUntil(step, (f) => f.state === 'run', { runRight: true });
    // In the air: a tap, the normal jump.
    if (air) step({ runRight: true, ...JUMP });
    step({ runRight: true, ...ATTACK2 });
    const atk = fighter.combat.attack.def;
    assert.equal(atk.id, air ? 'midair_attack2' : 'attack2');
    assert.equal(fighter.facing, 1, 'started facing the way held');
    const log = [];
    while (fighter.state === 'attack') {
      log.push(fighter.body.vx);
      step({ runLeft: true });
      assert.equal(fighter.facing, -1, 'holding Left turns the attack around at once');
      if (fighter.state === 'attack' && fighter.combat.phase === 'active') {
        const box = worldBox(fighter, atk.hitbox);
        assert.ok(box.x + box.w <= fighter.body.x, 'its kick lands on the left now');
      }
    }
    for (let i = 1; i < log.length; i++) assert.ok(log[i] <= log[i - 1], 'Left never speeds it up');
    if (!air) {
      assert.ok(log.every((vx) => vx >= 0), 'no steering against the ground kick: turning is not walking');
      assert.equal(log.at(-1), 0, 'decelerates to a stop');
    } else {
      // The airborne kick keeps its drift and steers with its share of the
      // air control: holding Left brakes it harder than the air drag alone.
      assert.equal(atk.airControl, 0.7);
      const braked = log[0] - log[3];
      assert.ok(braked > 3 * def.movement.airDeceleration * DT, 'steered against its drift');
      assert.ok(log.at(-1) < 0, 'and on into the other way before it ends');
    }
    // Once it ends, it keeps the facing it turned to.
    for (let i = 0; i < 10; i++) step();
    assert.equal(fighter.facing, -1);
  }
});

test('hitstun overrides attack2 on screen', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK2);
  fighter.combat.stun = 0.2;
  step();
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_hurt_1.png');
});

test('ground attack2 hits an opponent in front once, during the active phase, with its own values', () => {
  const { attacker, target, tick, events } = duel();
  target.combat.launchPoint = LAUNCH_FROM;
  const startX = target.body.x;
  tick(ATTACK2);
  let hitPhase = null;
  let hitFrame = null;
  while (attacker.combat.attack) {
    const before = events.length;
    tick();
    if (events.length > before) {
      // CombatSystem runs after the fighters, on the phase they just reached.
      hitPhase = attacker.combat.phase;
      hitFrame = frameNo(frameName(attacker));
      assert.equal(target.combat.stun, 0.28 + resolveLaunchStun(events.at(-1).launchSpeed, target.launchReaction));
      assert.equal(target.combat.hitstop, 0.09);
      assert.equal(attacker.combat.hitstop, 0.09);
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
  assert.equal(events[0].damage, 5);
  assert.equal(target.combat.launchPoint, LAUNCH_FROM + 5);
  assert.equal(hitPhase, 'active');
  assert.ok(CONTACT.attack2.includes(hitFrame), `hit on frame ${hitFrame}`);
});

test('a normal attack2 hit launches a grounded target straight up through the shared CombatSystem', (t) => {
  const applyHit = t.mock.method(CombatSystem.prototype, 'applyHit');
  for (const facing of [1, -1]) {
    applyHit.mock.resetCalls();
    const { attacker, target, tick, events } = duel({ attackerFacing: facing });
    target.combat.launchPoint = LAUNCH_FROM;
    const groundY = target.body.y;
    const startX = target.body.x;
    assert.equal(target.grounded, true);
    tick(ATTACK2);
    while (!events.length) tick();
    // At impact, before any gravity: vx 0, upward at 2 x 30, off the ground.
    assert.ok(isZero(target.body.vx), `facing ${facing}: no sideways push`);
    assert.equal(target.body.vy, -LAUNCHED);
    assert.equal(target.grounded, false);
    // Through the one shared applyHit, with attack2's own resolved definition.
    assert.equal(applyHit.mock.callCount(), 1);
    const [by, on, hitDef] = applyHit.mock.calls[0].arguments;
    assert.deepEqual([by, on, hitDef], [attacker, target, attacker.attacks.attack2]);

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
    assert.equal(frozen, Math.floor(attacker.attacks.attack2.hitstop / DT), 'frozen for the hitstop first');
    assert.ok(groundY - top > 5, `rose ${(groundY - top).toFixed(1)} units`);
    assert.equal(target.body.y, groundY, 'back on the ground');
    assert.equal(target.body.x, startX);
  }
});

test('a ground attack2 hit shows the target in its hurt poses while it is launched', () => {
  const { attacker, target, tick, until, events } = duel();
  // Launched at 2 x 30: long enough in the air to outlast its hitstun.
  target.combat.launchPoint = LAUNCH_FROM;
  tick(ATTACK2);
  until(() => events.length > 0, 60);
  const frozenAt = { x: target.body.x, y: target.body.y, attackerFrame: frameName(attacker) };
  tick(); // hitstop: nothing moves, but the pose updates
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_midair_hurt_1.png', 'already off the ground');
  assert.equal(target.body.x, frozenAt.x);
  assert.equal(target.body.y, frozenAt.y);
  assert.equal(frameName(attacker), frozenAt.attackerFrame);
  while (target.combat.hitstop > 0) tick();
  tick();
  assert.ok(target.body.y < frozenAt.y, 'launched upward');
  assert.equal(target.body.x, frozenAt.x, 'not knocked sideways');
  assert.equal(frameName(target), '0001_midair_hurt_1.png');
  // Mid-air hurt for the whole hitstun. The launch outlasts it, so the
  // target is still in the air when it ends and finishes the fall normally.
  while (target.state === 'hitstun') {
    assert.equal(frameName(target), '0001_midair_hurt_1.png');
    tick();
  }
  assert.equal(target.grounded, false, 'still airborne after hitstun');
  assert.ok(['jump', 'fall'].includes(target.state));
  until(() => target.grounded);
  assert.equal(target.body.y, frozenAt.y, 'lands where it stood');
  assert.equal(target.body.x, frozenAt.x);
});

// A duel with #0001 in the air, descending, about to press attack2: midair_attack2.
function maba2Duel({ attackerFacing = 1, gap = 44 } = {}) {
  const d = duel({ gap, attackerFacing });
  d.tick(JUMP);
  // Early in the descent, so the kick connects before touchdown.
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
  d.tick(ATTACK2);
  assert.equal(d.attacker.combat.attack.def.id, 'midair_attack2');
  return d;
}

test('a midair_attack2 hit adds its 5 first, then drives a grounded target downward at 2 x its new Launch Point: 25 + 5 = 30, a strength of 60, no sideways push', () => {
  for (const facing of [1, -1]) {
    const { attacker, target, tick, events } = maba2Duel({ attackerFacing: facing });
    target.combat.launchPoint = LAUNCH_FROM;
    const floor = target.body.y;
    const startX = target.body.x;
    while (!events.length) tick();
    assert.equal(events[0].type, 'hit');
    assert.equal(events[0].target, target);
    assert.equal(target.combat.launchPoint, 30, '25 + the kick\'s own 5');
    assert.equal(events[0].launchStrength, STRENGTH);
    assert.equal(attacker.facing, facing);
    // At impact, before the target's next step: CombatSystem.applyHit set it.
    assert.ok(isZero(target.body.vx), 'no horizontal launch');
    assert.equal(target.body.vy, LAUNCHED, 'positive body vy: downward, not upward');
    // Knocked into the floor it stands on: never pushed through it or
    // sideways. 600 units/s into it is hard enough to rebound (a launch
    // bounce, see launch-bounce.test.mjs): it rises off that floor once,
    // straight up, then settles back on it.
    let bounce = null;
    while (target.combat.stun > 0 || target.combat.hitstop > 0 || !target.grounded) {
      tick();
      bounce ??= target.bounce;
      assert.ok(target.body.y <= floor, 'never pushed through the floor');
      assert.equal(target.body.x, startX, 'never pushed sideways');
    }
    assert.equal(bounce?.normalY, -1, 'rebounds off the floor it was driven into');
    assert.equal(bounce.normalX, 0);
    assert.equal(target.grounded, true);
    assert.equal(target.body.y, floor, 'back on the ground it stood on');
  }
});

test('a midair_attack2 hit on a rising target reverses it: driven downward instead of carrying on up', () => {
  // #0001 jumps and presses attack2 on the way down; the target jumps `delay`
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
      d.tick(i === 0 && kick ? ATTACK2 : {}, i === delay ? JUMP : {});
      if (i >= delay) {
        log.push({
          before, y: d.target.body.y, vx: d.target.body.vx, vy: d.target.body.vy,
          hit: d.events.length > hits, grounded: d.target.grounded, bounce: d.target.bounce,
        });
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
  // Without the kick the target carries on up; with it, from the hit until
  // it strikes the floor it only ever moves down (or holds, frozen by the
  // impact's hitstop). Driven into the floor at 600 units/s and more, it
  // rebounds off it (a launch bounce, see launch-bounce.test.mjs), then
  // lands.
  assert.ok(plain.log[at + 1].y < plain.log[at].y, 'unhit, it keeps rising');
  const struck = kicked.log.findIndex((s) => s.bounce);
  assert.ok(struck > at, 'strikes the floor after the kick');
  assert.equal(kicked.log[struck].bounce.normalY, -1, 'and rebounds off it');
  for (let i = at + 1; i <= struck; i++) {
    assert.ok(kicked.log[i].y >= kicked.log[i - 1].y, `tick ${i}: never lifted before it strikes the floor`);
  }
  assert.ok(Math.min(...kicked.log.slice(at, struck + 1).map((s) => s.y)) >= impact.y, 'never above where it was hit on the way down');
  assert.equal(kicked.log.filter((s) => s.bounce).length, 1, 'one rebound: falling back, it lands');
  assert.equal(kicked.d.target.grounded, true, 'lands');
  assert.ok(struck + 1 < plain.log.length, 'driven into the floor sooner than the unhit jump lands');
});

test('a Shielded midair_attack2 is neither driven downward nor pushed', () => {
  const d = duel();
  d.tick(JUMP, { shield: true });
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 650);
  d.tick(ATTACK2, { shield: true });
  assert.equal(d.attacker.combat.attack.def.id, 'midair_attack2');
  while (!d.events.length && d.attacker.combat.attack) d.tick({}, { shield: true });
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.target.body.vy, 0, 'no downward launch on a block');
  assert.ok(isZero(d.target.body.vx), 'no horizontal launch either');
  assert.equal(d.events[0].damage, 0);
  assert.equal(d.target.combat.launchPoint, 0, 'no chip damage');
  assert.equal(d.target.grounded, true);
});

test('#0001 Shielding attack2 pays 25 Energy and takes its blockstun and hitstop in the Shield, but no damage or launch', () => {
  const { attacker, target, tick, events } = duel();
  const groundY = target.body.y;
  const startX = target.body.x;
  tick(ATTACK2, { shield: true });
  assert.equal(target.combat.shielding, true);
  while (!events.length) tick({}, { shield: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'block');
  assert.equal(events[0].energyCost, 25);
  assert.equal(target.combat.launchPoint, 0, 'no chip damage');
  assert.equal(target.combat.stun, 0, 'no hitstun');
  assert.equal(target.combat.shieldStun, attacker.attacks.attack2.blockstun, 'blockstun, held in the Shield');
  assert.equal(target.combat.hitstop, attacker.attacks.attack2.hitstop, 'hitstop');
  // A Shielded hit never launches.
  assert.equal(target.body.vy, 0);
  assert.equal(target.grounded, true);
  assert.ok(isZero(target.body.vx));
  while (attacker.combat.attack || target.combat.shieldStun > 0) {
    tick({}, { shield: true });
    assert.equal(target.grounded, true, 'stays on the ground');
    assert.equal(target.body.y, groundY);
    assert.equal(target.body.x, startX, 'no horizontal displacement');
    assert.equal(target.state, 'shield', 'never a hurt pose');
  }
  assert.equal(events.length, 1);
  assert.equal(def.stats?.blockDamageScale, undefined, '#0001 has no chip-damage stat');
});

test('midair_attack2 hits a grounded opponent in front while still airborne', () => {
  const { attacker, target, tick, until, events } = duel();
  tick(JUMP);
  // Early in the descent, so the kick connects before touchdown.
  until(() => attacker.body.vy > 0 && attacker.body.y > 650);
  tick(ATTACK2);
  assert.equal(attacker.combat.attack.def.id, 'midair_attack2');
  let airborneAtHit = null;
  while (attacker.combat.attack) {
    tick();
    if (events.length && airborneAtHit === null) {
      airborneAtHit = !attacker.grounded;
      assert.equal(attacker.combat.phase, 'active');
      assert.equal(frameName(attacker), '0001_midair_attack2_3.png');
      // The kick's own stun and freeze, on both fighters.
      assert.equal(target.combat.stun, 0.28 + resolveLaunchStun(events.at(-1).launchSpeed, target.launchReaction));
      assert.equal(target.combat.hitstop, 0.08);
      assert.equal(attacker.combat.hitstop, 0.08);
    }
  }
  assert.equal(events.length, 1);
  assert.equal(airborneAtHit, true);
  assert.equal(events[0].damage, 5);
  assert.equal(target.combat.launchPoint, 5);
});

test('midair_attack2 hits an airborne opponent at the same height, showing its mid-air hurt pose', () => {
  const { attacker, target, tick, events } = duel();
  tick(JUMP, JUMP);
  tick(ATTACK2);
  assert.equal(attacker.combat.attack.def.id, 'midair_attack2');
  while (attacker.combat.attack && !events.length) tick();
  assert.equal(events.length, 1);
  assert.equal(attacker.grounded, false);
  assert.equal(target.grounded, false);
  tick();
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_midair_hurt_1.png');
  assert.equal(target.combat.launchPoint, 5);
});

test('attack2 hitboxes mirror with facing', () => {
  for (const id of ['attack2', 'midair_attack2']) {
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
  tick(ATTACK2);
  while (!events.length) tick();
  assert.equal(events.length, 1, 'hits the opponent on the left');
  assert.equal(target.body.vy, -LAUNCHED, 'launched upward');
  assert.ok(isZero(target.body.vx), 'not pushed either way');
  while (attacker.combat.attack) tick();
  assert.equal(target.body.x, startX);
});

test('attack2 misses an opponent out of reach or behind the attacker', () => {
  // Just past the longer reach of the two, the mid-air kick's.
  for (const gap of [70, -44]) {
    for (const air of [false, true]) {
      const { attacker, target, tick, until, events } = duel({ gap });
      attacker.facing = 1;
      if (air) {
        tick(JUMP, JUMP);
        until(() => attacker.body.vy > -600);
      }
      tick(ATTACK2);
      assert.equal(attacker.combat.attack?.def.id, air ? 'midair_attack2' : 'attack2');
      while (attacker.combat.attack) tick();
      assert.equal(events.length, 0, `gap ${gap}${air ? ' in the air' : ''}`);
      assert.equal(target.combat.launchPoint, 0);
    }
  }
});

test('attack2 whose frames failed to load is refused, not faked, and never hits', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const keys = Object.keys(def.animations).filter((k) => k !== 'attack2' && k !== 'midair_attack2');
  const sprites = fakeSprites(keys);
  const { attacker, target, tick, events } = duel({ attackerSprites: sprites });
  tick(ATTACK2);
  assert.equal(attacker.combat.attack, null);
  assert.equal(attacker.state, 'idle');
  assert.equal(frameName(attacker), '0001_idle_1.png');
  for (let i = 0; i < steps(1); i++) {
    tick(i % 10 === 0 ? ATTACK2 : {});
    assert.equal(attacker.combat.attack, null);
    assert.equal(attacker.combat.phase, null, 'no hitbox');
  }
  assert.equal(events.length, 0);
  assert.equal(target.combat.launchPoint, 0);

  // In the air, too.
  tick(JUMP);
  tick(ATTACK2);
  assert.equal(attacker.combat.attack, null);
  assert.ok(['jump', 'fall'].includes(attacker.state));
  assert.ok(warn.mock.callCount() >= 2);
  assert.ok(warn.mock.calls.every((c) => /Attack "(attack2|midair_attack2)" has no animation frames/.test(c.arguments[0])));

  // attack1 is unaffected by missing attack2 art.
  const other = makeFighter({ sprites });
  other.step(ATTACK1);
  assert.equal(other.fighter.combat.attack?.def.id, 'attack1');
});

test('only the missing half of attack2 is refused', (t) => {
  t.mock.method(console, 'warn', () => {});
  const noAir = fakeSprites(Object.keys(def.animations).filter((k) => k !== 'midair_attack2'));
  const { fighter, step } = makeFighter({ sprites: noAir });
  step(ATTACK2);
  assert.equal(fighter.combat.attack?.def.id, 'attack2');
  recordAttack(step);
  step(JUMP);
  step(ATTACK2);
  assert.equal(fighter.combat.attack, null);
});

test('the training CPU stays non-attacking with attack2 mapped', async () => {
  const { TrainingAIController } = await import('../../../js/game/fighters/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 300 < 150 ? { runRight: true } : { runLeft: true, ...(i % 61 === 0 ? JUMP : {}) });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.attack2, false);
    assert.equal(out.attack2Pressed, false);
    bot.step(out);
    assert.equal(bot.fighter.combat.attack, null);
  }
});

test('Quick Battle: an attack2 hit launches the training CPU straight up through the arena\'s CombatSystem', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../../../js/game/battle.js');
  const { getMap } = await import('../../../js/data/maps.js');
  const { TrainingAIController } = await import('../../../js/game/fighters/fighter-controller.js');
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
  once = ATTACK2;
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) {
    battle.update(DT);
    hit = battle.combat.events.find((e) => e.type === 'hit') ?? null;
  }
  assert.ok(hit, 'attack2 connected');
  // Where it was struck: attack2's step-in may have shoved it along a little
  // through the pushboxes before the kick landed.
  const hitX = p2.body.x;
  assert.equal(hit.attacker, p1);
  assert.equal(hit.target, p2);
  assert.equal(p2.combat.launchPoint, LAUNCH_FROM + 5);
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
  assert.equal(p2.body.x, hitX, 'straight up and down');
  battle.destroy();
});

test('damage accumulates as Launch Point: attack1 -> attack1 -> attack2 on a fresh target is 3 + 3 + 5 = 11, each hit launching from its own new total', () => {
  const { attacker, target, tick, until, events } = duel();
  for (const [press, total] of [[{ attack1: true, attack1Pressed: true }, 3], [{ attack1: true, attack1Pressed: true }, 6], [ATTACK2, 11]]) {
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
  assert.deepEqual(events.map((e) => e.damage), [3, 3, 5]);
  // Each hit's strength is its Base Launch x the Launch Point it leaves the
  // target at, sent along its own direction at LAUNCH_UNIT_SPEED per point:
  // attack1 1 x 3 and 1 x 6 sideways, attack2 2 x 11 upward.
  const U = LAUNCH_UNIT_SPEED;
  assert.deepEqual(events.map((e) => [e.launchPointBefore, e.launchPointAfter, e.baseLaunch, e.directionalLaunch, e.launchStrength, e.finalLaunch]), [
    [0, 3, 1, 'horizontal', 3, { x: 3 * U, y: 0 }],
    [3, 6, 1, 'horizontal', 6, { x: 6 * U, y: 0 }],
    [6, 11, 2, 'vertical', 22, { x: 0, y: -22 * U }],
  ]);
  assert.equal(attacker.combat.launchPoint, 0);
});
