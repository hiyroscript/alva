// Run with node --test tests/basic-attack.test.mjs (no dependencies).
// #0001 Basic Attack 1 (BA1) on action1: ground/air selection, clip playback,
// phase timing, hit resolution and the other combat inputs (Throw on primary,
// Special still reserved). Uses the real
// Fighter, CombatSystem and physics (see fighter-harness.mjs). Basic Attack 2
// (BA2, action2) has its own file, basic-attack-2.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { worldBox, createAttackDefinition } from '../js/game/combat.js';
import { getPowerTier } from '../js/data/powers.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { CONFIG } from '../js/config.js';
import {
  def, DT, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil,
  steps, frameNo, recordAttack, sequence, duel,
} from './fighter-harness.mjs';

const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };

test('action1 is Basic Attack 1: ground ba1, air midairBa1; action2 is BA2; primary is Throw; Special stays reserved', () => {
  assert.deepEqual(def.actions, {
    primary: 'throw',
    special: null,
    action1: { ground: 'ba1', air: 'midairBa1' },
    action2: { ground: 'ba2', air: 'midairBa2' },
  });
  assert.deepEqual(COMBAT_ACTIONS, ['primary', 'special', 'action1', 'action2']);
  assert.deepEqual(CONFIG.bindings.action1, ['KeyU']);
  assert.deepEqual(CONFIG.bindings.action2, ['KeyI']);
  assert.deepEqual(CONFIG.bindings.primary, ['KeyJ']);
});

test('BA1 attack definitions match their clips and stay conservative', () => {
  const { fighter } = makeFighter();
  const clips = { ba1: 'ba1', midairBa1: 'midairBa1' };
  for (const [id, animation] of Object.entries(clips)) {
    const atk = fighter.attacks[id];
    const clip = def.animations[animation];
    assert.equal(atk.id, id);
    assert.equal(atk.animation, animation);
    // One pass of the clip: the attack never ends halfway through its art.
    assert.ok(Math.abs(atk.total - clip.frames.length / clip.fps) < 1e-9, `${id} lasts one pass of its clip`);
    assert.ok(atk.active < atk.total / 3, `${id} is not active for its whole clip`);
    assert.equal(atk.damage, 6);
    // Horizontal Knockback Power 2, resolved: the same 180 sideways push
    // and no launch as before.
    assert.deepEqual(def.attacks[id].powers, { horizontalKnockback: 2 });
    assert.deepEqual(atk.knockback, { x: 180, y: 0 });
    assert.equal(atk.hitstun, 0.22);
    assert.equal(atk.blockstun, 0.14);
    assert.equal(atk.hitstop, 0.06);
    assert.equal(atk.cooldown, 0.1);
    assert.equal(atk.lockMovement, true);
    // In front of the fighter and no bigger than the fighter's own body.
    assert.ok(atk.hitbox.x > 0 && atk.hitbox.x + atk.hitbox.w <= 60, `${id} hitbox is in front, within reach`);
    assert.ok(atk.hitbox.y < 0 && atk.hitbox.y + atk.hitbox.h <= 0, `${id} hitbox is above the feet`);
    assert.ok(atk.hitbox.w <= def.collider.width + 10 && atk.hitbox.h <= def.collider.height / 2, `${id} hitbox is not oversized`);
  }
  const g = fighter.attacks.ba1;
  assert.deepEqual([g.startup, g.active, g.recovery], [1 / 12, 1 / 12, 2 / 12]);
  assert.equal(g.groundOnly, true);
  const a = fighter.attacks.midairBa1;
  assert.deepEqual([a.startup, a.active, a.recovery], [2 / 12, 1 / 12, 2 / 12]);
  assert.equal(a.groundOnly, false);
});

test('BA1 knockback comes only from its Horizontal Knockback Power 2, not a raw value', () => {
  const tier = getPowerTier('horizontalKnockback', 2);
  assert.equal(tier.knockbackX, 180);
  for (const id of ['ba1', 'midairBa1']) {
    const source = def.attacks[id];
    assert.equal('knockback' in source, false, `${id} has no raw knockback in #0001's data`);
    assert.deepEqual(source.powers, { horizontalKnockback: 2 }, `${id} declares no vertical launch`);
    // The resolved number follows the declared tier and nothing else: the
    // same entry at tiers 1 and 3 gets those tiers' pushes.
    for (const n of [1, 2, 3]) {
      const atk = createAttackDefinition({ id, ...source, powers: { horizontalKnockback: n } });
      assert.deepEqual(atk.knockback, { x: getPowerTier('horizontalKnockback', n).knockbackX, y: 0 }, `${id} at tier ${n}`);
    }
    // Everything else about BA1 is untouched by the Power.
    const { fighter } = makeFighter();
    const atk = fighter.attacks[id];
    for (const [key, value] of Object.entries(source)) {
      if (key !== 'powers') assert.deepEqual(atk[key], value, `${id}.${key}`);
    }
  }
});

test('grounded action1 plays the four-frame ground BA1 once, then returns to idle', () => {
  const { fighter, step } = makeFighter();
  step(BA1);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'ba1');
  assert.equal(fighter.animator.anim.key, 'ba1');
  assert.equal(frameName(fighter), '0001_1ba1.png');

  const log = [{ frame: frameName(fighter), phase: fighter.combat.phase }, ...recordAttack(step)];
  assert.deepEqual(sequence(log), ['0001_1ba1.png', '0001_1ba2.png', '0001_1ba3.png', '0001_1ba4.png']);
  assert.equal(log.length, steps(4 / 12), 'one pass of the clip');
  // Never loops back to an earlier frame.
  for (let i = 1; i < log.length; i++) assert.ok(frameNo(log[i].frame) >= frameNo(log[i - 1].frame));
  assert.deepEqual([...new Set(log.map((s) => s.phase))], ['startup', 'active', 'recovery']);

  // Clean exit: no attack, idle art, free to act again after the cooldown.
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.combat.attack, null);
  assert.equal(frameName(fighter), '0001_idle1.png');
  assert.ok(fighter.combat.cooldowns.has('ba1'));
  stepUntil(step, (f) => !f.combat.cooldowns.has('ba1'), {}, steps(0.2));
  step(BA1);
  assert.equal(fighter.combat.attack?.def.id, 'ba1');
});

test('the hitbox is live only around the contact frame', () => {
  const cases = {
    ba1: { contact: '0001_1ba2.png', setup: () => makeFighter() },
    midairBa1: {
      contact: '0001_midair1ba3.png',
      setup: () => {
        const r = makeFighter();
        r.step({ jump: true, jumpPressed: true });
        return r;
      },
    },
  };
  for (const [id, { contact, setup }] of Object.entries(cases)) {
    const { step } = setup();
    const log = recordAttack(step, BA1);
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

test('airborne action1 plays the five-frame mid-air BA1 during the ascent', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  step();
  assert.ok(fighter.body.vy < 0, 'rising');
  step(BA1);
  assert.equal(fighter.combat.attack.def.id, 'midairBa1');
  assert.equal(fighter.animator.anim.key, 'midairBa1');
  assert.equal(frameName(fighter), '0001_midair1ba1.png');
  const log = [{ frame: frameName(fighter) }, ...recordAttack(step)];
  assert.deepEqual(sequence(log), [
    '0001_midair1ba1.png', '0001_midair1ba2.png', '0001_midair1ba3.png',
    '0001_midair1ba4.png', '0001_midair1ba5.png',
  ]);
  assert.equal(log.length, steps(5 / 12));
  // Gravity keeps working: no stall, no extra lift.
  assert.equal(fighter.grounded, false);
  assert.ok(['jump', 'fall'].includes(fighter.state));
});

test('airborne action1 also triggers mid-air BA1 during the descent', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.body.vy > 0);
  assert.equal(fighter.state, 'fall');
  step(BA1);
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'midairBa1');
  assert.equal(frameName(fighter), '0001_midair1ba1.png');
});

test('landing during mid-air BA1 finishes the mid-air clip instead of switching to ground BA1', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  // Late in the descent, so the fighter lands partway through the attack.
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 740);
  const log = recordAttack(step, BA1);
  assert.equal(log[0].grounded, false);
  assert.ok(log.some((s) => s.grounded), 'landed during the attack');
  for (const s of log) {
    assert.equal(s.id, 'midairBa1');
    assert.equal(s.anim, 'midairBa1');
    assert.match(s.frame, /^0001_midair1ba\d\.png$/);
  }
  assert.equal(sequence(log).at(-1), '0001_midair1ba5.png');
  assert.equal(log.length, steps(5 / 12), 'the attack runs its full length');
  // Touchdown happened mid-attack, so there is no late land clip afterwards.
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.state, 'idle');
});

test('BA1 on the same step as a jump punches on the ground; the jump is dropped', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true, ...BA1 });
  assert.equal(fighter.combat.attack.def.id, 'ba1');
  assert.equal(fighter.grounded, true);
  const log = recordAttack(step);
  assert.ok(log.every((s) => s.grounded && s.id === 'ba1'));
  assert.equal(fighter.grounded, true);
});

test('the ground/air choice follows grounded state; a mapping without `air` is inactive in the air', () => {
  const { fighter, step } = makeFighter();
  assert.equal(fighter.attackFor('action1'), 'ba1');
  assert.equal(fighter.attackFor('action2'), 'ba2');
  step({ jump: true, jumpPressed: true });
  assert.equal(fighter.attackFor('action1'), 'midairBa1');
  assert.equal(fighter.attackFor('action2'), 'midairBa2');
  assert.equal(fighter.attackFor('special'), null);
  // Throw is a plain string mapping: the same id in the air, refused there
  // because it is ground-only (see throw.test.mjs).
  assert.equal(fighter.attackFor('primary'), 'throw');
  assert.equal(fighter.tryAction('primary'), false);

  const character = { ...def, actions: { ...def.actions, action1: { ground: 'ba1' } } };
  const groundOnly = makeFighter({ character });
  groundOnly.step({ jump: true, jumpPressed: true });
  assert.equal(groundOnly.fighter.tryAction('action1'), false);
  assert.equal(groundOnly.fighter.combat.attack, null);
});

test('a plain string mapping still means one attack', () => {
  const character = { ...def, actions: { ...def.actions, primary: 'ba1' } };
  const { fighter, step } = makeFighter({ character });
  step({ primary: true, primaryPressed: true });
  assert.equal(fighter.combat.attack.def.id, 'ba1');
  assert.equal(frameName(fighter), '0001_1ba1.png');
  // groundOnly still applies to string mappings.
  const air = makeFighter({ character });
  air.step({ jump: true, jumpPressed: true });
  air.step({ primary: true, primaryPressed: true });
  assert.equal(air.fighter.combat.attack, null);
});

test('Special stays inactive for #0001; Throw (primary), BA1 and BA2 work', () => {
  const { fighter, step } = makeFighter();
  assert.equal(fighter.tryAction('special'), false);
  step({ special: true, specialPressed: true });
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.combat.lastIntent, 'special');
  step({ jump: true, jumpPressed: true });
  step({ special: true, specialPressed: true });
  assert.equal(fighter.combat.attack, null, 'special in the air');

  // Throw, the primary action, on the ground (it has no mid-air version).
  const thrower = makeFighter();
  thrower.step({ primary: true, primaryPressed: true });
  assert.equal(thrower.fighter.combat.attack?.def.id, 'throw');
  assert.equal(thrower.fighter.combat.lastIntent, 'primary');

  // The two basic attacks, on the ground and in the air.
  for (const [held, ground, air] of [[BA1, 'ba1', 'midairBa1'], [BA2, 'ba2', 'midairBa2']]) {
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
  const keys = Object.keys(def.animations).filter((k) => k !== 'ba1' && k !== 'midairBa1');
  const { fighter, step } = makeFighter({ sprites: fakeSprites(keys) });
  step(BA1);
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.state, 'idle');
  step({ jump: true, jumpPressed: true });
  step(BA1);
  assert.equal(fighter.combat.attack, null);
  assert.ok(['jump', 'fall'].includes(fighter.state));
  assert.equal(warn.mock.callCount(), 2);
});

test('BA1 locks movement and facing while it plays', () => {
  const { fighter, step } = makeFighter();
  stepUntil(step, (f) => f.state === 'run', { right: true });
  step({ right: true, ...BA1 });
  const log = [];
  while (fighter.state === 'attack') {
    log.push(fighter.body.vx);
    assert.equal(fighter.facing, 1, 'holding Left never turns an attack around');
    step({ left: true });
  }
  assert.equal(log.at(-1), 0, 'decelerates to a stop');
  assert.ok(log.every((vx) => vx >= 0));
  // Once it ends, the held direction applies again.
  step({ left: true });
  assert.equal(fighter.facing, -1);
});

test('ground BA1 hits an opponent in front during the active phase only', () => {
  const { attacker, target, tick, events } = duel();
  tick(BA1);
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
  assert.equal(events[0].damage, 6);
  assert.equal(target.combat.health, 94);
  assert.equal(hitPhase, 'active');
});

test('a BA1 hit pushes the target sideways by exactly 180, away from the attacker, with no launch', () => {
  for (const facing of [1, -1]) {
    const { attacker, target, tick, events } = duel({ attackerFacing: facing });
    tick(BA1);
    while (!events.length) tick();
    // At impact, before the target's next step: CombatSystem.applyHit set it.
    assert.equal(target.body.vx, 180 * facing);
    assert.equal(target.body.vy, 0);
    assert.equal(target.grounded, true, 'BA1 never launches');
    assert.equal(attacker.facing, facing);
  }
});

test('a hit shows the target in its hurt pose through the impact freeze', () => {
  const { attacker, target, tick, until, events } = duel();
  tick(BA1);
  until(() => events.length > 0, 60);
  assert.equal(target.combat.stun, 0.22);
  assert.ok(target.combat.hitstop > 0);
  const frozenAt = { x: target.body.x, attackerFrame: frameName(attacker) };
  tick(); // hitstop: nothing moves, but the pose updates
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_hurt.png');
  assert.equal(target.body.x, frozenAt.x);
  assert.equal(frameName(attacker), frozenAt.attackerFrame);
  while (target.combat.hitstop > 0) tick();
  tick();
  assert.ok(target.body.vx > 0, 'knocked back away from the attacker');
  assert.ok(target.body.x > frozenAt.x);
  assert.equal(target.body.vy, 0, 'no vertical launch');
  while (target.state === 'hitstun') {
    assert.equal(frameName(target), '0001_hurt.png');
    tick();
  }
  assert.equal(target.grounded, true);
  assert.ok(['idle', 'run'].includes(target.state));
});

test('BA1 hitboxes mirror with facing', () => {
  for (const id of ['ba1', 'midairBa1']) {
    const hb = def.attacks[id].hitbox;
    const right = worldBox(makeFighter({ facing: 1 }).fighter, hb);
    const left = worldBox(makeFighter({ facing: -1 }).fighter, hb);
    assert.equal(right.x, 500 + hb.x);
    assert.equal(left.x + left.w, 500 - hb.x, `${id} mirrors about the origin`);
    assert.equal(left.y, right.y);
  }

  const { attacker, target, tick, events } = duel({ attackerFacing: -1 });
  assert.equal(attacker.facing, -1);
  const startX = target.body.x;
  tick(BA1);
  while (attacker.combat.attack) tick();
  assert.equal(events.length, 1, 'hits the opponent on the left');
  assert.ok(target.body.x < startX, 'knocked back to the left');
});

test('BA1 misses an opponent out of reach or behind the attacker', () => {
  for (const gap of [70, -44]) {
    const { attacker, target, tick, events } = duel({ gap });
    attacker.facing = 1;
    attacker.opponent = null; // keep facing right even with the target behind
    tick(BA1);
    while (attacker.combat.attack) tick();
    assert.equal(events.length, 0, `gap ${gap}`);
    assert.equal(target.combat.health, 100);
  }
});

test('mid-air BA1 hits a grounded opponent below and in front while still airborne', () => {
  const { attacker, target, tick, until, events } = duel({ gap: 50 });
  tick({ jump: true, jumpPressed: true });
  // Early in the descent, so the kick connects before touchdown.
  until(() => attacker.body.vy > 0 && attacker.body.y > 660);
  tick(BA1);
  assert.equal(attacker.combat.attack.def.id, 'midairBa1');
  let airborneAtHit = null;
  while (attacker.combat.attack) {
    tick();
    if (events.length && airborneAtHit === null) airborneAtHit = !attacker.grounded;
  }
  assert.equal(events.length, 1);
  assert.equal(airborneAtHit, true);
  assert.equal(target.combat.health, 94);
});

test('the training CPU never presses a combat button', () => {
  const cpu = new TrainingAIController({ rng: mulberry(7) });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 3000; i++) {
    // Keep the player moving so the CPU follows, jumps and repositions.
    player.step(i % 400 < 200 ? { right: true } : { left: true, jump: i % 97 === 0, jumpPressed: i % 97 === 0 });
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
