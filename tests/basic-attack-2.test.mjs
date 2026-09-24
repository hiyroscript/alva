// Run with node --test tests/basic-attack-2.test.mjs (no dependencies).
// #0001 Basic Attack 2 (BA2) on action2: inputs, ground/air selection, clip
// playback, phase timing against the art, hit resolution (ground BA2's
// Vertical Knockback Power 2 launch, mid-air BA2's lighter Vertical Knockback
// Power 1 launch, and a blocked BA2 that does not launch) and
// missing-art safety. Uses the real Fighter, CombatSystem, physics and
// InputManager (see fighter-harness.mjs). Basic Attack 1 lives in
// basic-attack.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { worldBox, CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { getPowerTier } from '../js/data/powers.js';
import { ACTIONS, CONFIG } from '../js/config.js';
import {
  def, DT, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil,
  steps, frameNo, recordAttack, sequence, duel,
} from './fighter-harness.mjs';

const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };
const JUMP = { jump: true, jumpPressed: true };

// The frames each attack is live on, chosen from the art: ground BA2's kick
// (2ba4 low sweep, 2ba5 rising kick, both with motion trails) and mid-air
// BA2's kunai slash (midair2ba3, the frame with the slash arc).
const CONTACT = { ba2: [4, 5], midairBa2: [3] };

// Vertical Knockback Power 2: ground BA2's upward launch speed.
const LAUNCH = 640;
// Vertical Knockback Power 1: mid-air BA2's lighter upward launch speed.
const AIR_LAUNCH = 480;
// Each BA2's declared Vertical Knockback Power tier and launch speed.
const TIER = { ba2: 2, midairBa2: 1 };
const LAUNCHES = { ba2: LAUNCH, midairBa2: AIR_LAUNCH };

// Zero either way: a vertical-only hit sets vx to 0 * facing, which is -0
// when the hit travels left (still === 0).
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

test('BA2 attack definitions match their clips and are a heavier, slower basic attack than BA1 that launches', () => {
  const { fighter } = makeFighter();
  for (const id of ['ba2', 'midairBa2']) {
    const atk = fighter.attacks[id];
    const clip = def.animations[id];
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
    assert.equal(atk.damage, 8);
    // Vertical Knockback Power 2 on the ground (a 640 launch), Power 1 in
    // mid-air (a lighter 480 launch), and no sideways push.
    assert.deepEqual(def.attacks[id].powers, { verticalKnockback: TIER[id] });
    assert.deepEqual(atk.knockback, { x: 0, y: LAUNCHES[id] });
    assert.equal(atk.hitstun, 0.24);
    assert.equal(atk.blockstun, 0.15);
    assert.equal(atk.hitstop, 0.07);
    assert.equal(atk.lockMovement, true);
    // Heavier than BA1 (more damage and hitstun, and a launch where BA1 only
    // pushes), and not BA1 under another name. Their knockback runs along
    // different axes, so the two are not compared by size.
    const ba1 = fighter.attacks[id === 'ba2' ? 'ba1' : 'midairBa1'];
    assert.ok(atk.damage > ba1.damage && atk.hitstun > ba1.hitstun);
    assert.ok(atk.knockback.y > 0 && ba1.knockback.y <= 0, 'BA2 launches upward; BA1 does not');
    assert.ok(atk.knockback.x === 0 && ba1.knockback.x > 0, 'BA1 pushes sideways; BA2 does not');
    assert.notEqual(atk.animation, ba1.animation);
    assert.notDeepEqual(atk.hitbox, ba1.hitbox);
    // In front of the fighter, above the feet, within a limb's reach, and
    // never wrapping the fighter's own body.
    const hb = atk.hitbox;
    assert.ok(hb.x > 0 && hb.x + hb.w > def.collider.width / 2, `${id} hitbox is in front`);
    assert.ok(hb.x + hb.w <= 40, `${id} hitbox stays within reach`);
    assert.ok(hb.y < 0 && hb.y + hb.h <= 0, `${id} hitbox is above the feet`);
    assert.ok(hb.w < def.collider.width, `${id} hitbox is narrower than the fighter`);
  }
  const g = fighter.attacks.ba2;
  assert.deepEqual([g.startup, g.active, g.recovery], [3 / 12, 2 / 12, 2 / 12]);
  assert.equal(g.groundOnly, true);
  assert.equal(g.cooldown, 0.15);
  assert.ok(g.total > fighter.attacks.ba1.total, 'slower than ground BA1');
  const a = fighter.attacks.midairBa2;
  assert.deepEqual([a.startup, a.active, a.recovery], [2 / 12, 1 / 12, 0]);
  assert.equal(a.groundOnly, false);
  assert.equal(a.cooldown, 0.18);
  assert.ok(a.knockback.y < g.knockback.y, 'mid-air BA2 launches less than ground BA2');
});

test('BA2 knockback comes only from its Vertical Knockback Power, not a raw value: tier 2 on the ground, tier 1 in mid-air', () => {
  assert.equal(getPowerTier('verticalKnockback', 2).knockbackY, LAUNCH);
  assert.equal(getPowerTier('verticalKnockback', 1).knockbackY, AIR_LAUNCH);
  for (const id of ['ba2', 'midairBa2']) {
    const source = def.attacks[id];
    assert.equal('knockback' in source, false, `${id} has no raw knockback in #0001's data`);
    assert.deepEqual(source.powers, { verticalKnockback: TIER[id] }, `${id} declares no sideways push`);
    assert.equal(getPowerTier('verticalKnockback', TIER[id]).knockbackY, LAUNCHES[id]);
    for (const n of [1, 2, 3]) {
      const atk = createAttackDefinition({ id, ...source, powers: { verticalKnockback: n } });
      assert.deepEqual(atk.knockback, { x: 0, y: getPowerTier('verticalKnockback', n).knockbackY }, `${id} at tier ${n}`);
    }
    // Damage, stun, hitstop, timing, hitbox and cooldown are the entry's own.
    const { fighter } = makeFighter();
    const atk = fighter.attacks[id];
    for (const [key, value] of Object.entries(source)) {
      if (key !== 'powers') assert.deepEqual(atk[key], value, `${id}.${key}`);
    }
  }
  // The launch is the shared knockback path's: nothing in combat singles out
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

test('the mid-air BA2 hitbox is live only on the slash frame (midair2ba3)', () => {
  const { step } = makeFighter();
  step(JUMP);
  const log = recordAttack(step, BA2);
  assert.equal(log[0].id, 'midairBa2');
  assertActiveOnContactFrames(log, 'midairBa2');
  // Wind-up only before it: the clip has no recovery frame.
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active']);
});

test('airborne action2 plays the three-frame mid-air BA2 during the ascent, under normal gravity', () => {
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
  assert.equal(frameName(fighter), '0001_midair2ba1.png');
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
  assert.deepEqual(sequence(log), ['0001_midair2ba1.png', '0001_midair2ba2.png', '0001_midair2ba3.png']);
  assert.equal(log.length, steps(3 / 12), 'one pass of the clip');
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
  assert.equal(frameName(fighter), '0001_midair2ba1.png');
  const log = recordAttack(step);
  assert.equal(sequence(log).at(-1), '0001_midair2ba3.png');
  assert.ok(log.every((s) => s.id === 'midairBa2' && !s.grounded));
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
    assert.match(s.frame, /^0001_midair2ba\d\.png$/);
  }
  assert.ok(!states.includes('land'));
  assert.deepEqual(sequence(log), ['0001_midair2ba1.png', '0001_midair2ba2.png', '0001_midair2ba3.png']);
  assert.equal(log.length, steps(3 / 12), 'the attack runs its full length');
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
      assert.equal(target.body.vy, -LAUNCH, 'launched upward');
      assert.equal(target.grounded, false);
    }
    // Keep the target overlapping: one attack still hits only once.
    if (events.length) target.body.x = startX;
  }
  assert.equal(events.length, 1, 'one hit per attack');
  assert.equal(events[0].type, 'hit');
  assert.equal(events[0].attacker, attacker);
  assert.equal(events[0].damage, 8);
  assert.equal(target.combat.health, 92);
  assert.equal(hitPhase, 'active');
  assert.ok(CONTACT.ba2.includes(hitFrame), `hit on frame ${hitFrame}`);
});

test('a normal BA2 hit launches a grounded target straight up through the shared CombatSystem', (t) => {
  const applyHit = t.mock.method(CombatSystem.prototype, 'applyHit');
  for (const facing of [1, -1]) {
    applyHit.mock.resetCalls();
    const { attacker, target, tick, events } = duel({ attackerFacing: facing });
    const groundY = target.body.y;
    const startX = target.body.x;
    assert.equal(target.grounded, true);
    tick(BA2);
    while (!events.length) tick();
    // At impact, before any gravity: vx 0, vy -640, off the ground.
    assert.ok(isZero(target.body.vx), `facing ${facing}: no sideways push`);
    assert.equal(target.body.vy, -LAUNCH);
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

test('mid-air BA2 launches upward more lightly: vx 0, vy -480 on a grounded target', () => {
  // Highest point a grounded target reaches after a BA2 hit, ground or air.
  const peak = (air) => {
    const { attacker, target, tick, until, events } = duel();
    if (air) {
      tick(JUMP);
      until(() => attacker.body.vy > 0 && attacker.body.y > 650);
    }
    tick(BA2);
    assert.equal(attacker.combat.attack.def.id, air ? 'midairBa2' : 'ba2');
    while (!events.length) tick();
    assert.equal(target.combat.health, 92);
    assert.ok(isZero(target.body.vx));
    assert.equal(target.body.vy, air ? -AIR_LAUNCH : -LAUNCH, 'launched upward');
    assert.ok(target.body.vy < 0, 'still upward');
    assert.equal(target.grounded, false);
    const floor = target.body.y;
    let top = floor;
    until(() => {
      top = Math.min(top, target.body.y);
      return target.grounded;
    });
    return floor - top;
  };
  const ground = peak(false);
  const air = peak(true);
  assert.ok(air > 0, 'mid-air BA2 still lifts the target');
  assert.ok(air < ground, `a lower launch than ground BA2 (${air.toFixed(1)} < ${ground.toFixed(1)})`);
});

test('a Block-type fighter guarding BA2 takes chip damage, blockstun and hitstop but is not launched; #0001 itself does not block', () => {
  // #0001's Defense is a Dodge, so the block path is kept for future
  // characters whose Defense is { type: 'block' }.
  const blocker = { ...def, defense: { type: 'block' }, stats: { ...def.stats, blockDamageScale: 0.15 } };
  const { attacker, target, tick, events } = duel({ targetCharacter: blocker });
  const groundY = target.body.y;
  const startX = target.body.x;
  tick(BA2, { defense: true });
  assert.equal(target.combat.blocking, true);
  while (!events.length) tick({}, { defense: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'block');
  assert.ok(Math.abs(target.combat.health - (100 - 8 * 0.15)) < 1e-9, 'chip damage');
  assert.equal(target.combat.stun, attacker.attacks.ba2.blockstun, 'blockstun');
  assert.equal(target.combat.hitstop, attacker.attacks.ba2.hitstop, 'hitstop');
  // A blocked hit never launches, and BA2 has no sideways push to halve.
  assert.equal(target.body.vy, 0);
  assert.equal(target.grounded, true);
  assert.ok(isZero(target.body.vx));
  while (attacker.combat.attack || target.combat.stun > 0) {
    tick({}, { defense: true });
    assert.equal(target.grounded, true, 'stays on the ground');
    assert.equal(target.body.y, groundY);
    assert.equal(target.body.x, startX, 'no horizontal displacement');
  }
  assert.equal(events.length, 1);
  assert.equal(def.stats.blockDamageScale, undefined, '#0001 has no chip-damage stat');
});

test('mid-air BA2 hits a grounded opponent in front while still airborne', () => {
  const { attacker, target, tick, until, events } = duel();
  tick(JUMP);
  // Early in the descent, so the slash connects before touchdown.
  until(() => attacker.body.vy > 0 && attacker.body.y > 650);
  tick(BA2);
  assert.equal(attacker.combat.attack.def.id, 'midairBa2');
  let airborneAtHit = null;
  while (attacker.combat.attack) {
    tick();
    if (events.length && airborneAtHit === null) {
      airborneAtHit = !attacker.grounded;
      assert.equal(attacker.combat.phase, 'active');
      assert.equal(frameName(attacker), '0001_midair2ba3.png');
    }
  }
  assert.equal(events.length, 1);
  assert.equal(airborneAtHit, true);
  assert.equal(events[0].damage, 8);
  assert.equal(target.combat.health, 92);
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
  assert.equal(target.combat.health, 92);
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
  const startX = target.body.x;
  tick(BA2);
  while (!events.length) tick();
  assert.equal(events.length, 1, 'hits the opponent on the left');
  assert.equal(target.body.vy, -LAUNCH, 'launched upward');
  assert.ok(isZero(target.body.vx), 'not pushed either way');
  while (attacker.combat.attack) tick();
  assert.equal(target.body.x, startX);
});

test('BA2 misses an opponent out of reach or behind the attacker', () => {
  for (const gap of [60, -44]) {
    for (const air of [false, true]) {
      const { attacker, target, tick, until, events } = duel({ gap });
      attacker.facing = 1;
      attacker.opponent = null; // keep facing right even with the target behind
      if (air) {
        tick(JUMP, JUMP);
        until(() => attacker.body.vy > -600);
      }
      tick(BA2);
      assert.equal(attacker.combat.attack?.def.id, air ? 'midairBa2' : 'ba2');
      while (attacker.combat.attack) tick();
      assert.equal(events.length, 0, `gap ${gap}${air ? ' in the air' : ''}`);
      assert.equal(target.combat.health, 100);
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
  assert.equal(target.combat.health, 100);

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
  assert.equal(p2.combat.health, 92);
  assert.ok(isZero(p2.body.vx), 'no sideways push');
  assert.equal(p2.body.vy, -LAUNCH);
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
