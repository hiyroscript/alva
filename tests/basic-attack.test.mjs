// Run with node --test tests/basic-attack.test.mjs (no dependencies).
// #0001 Basic Attack 1 (BA1) on action1: ground/air selection, clip playback,
// phase timing, hit resolution (ground BA1's sideways push; mid-air BA1's
// push plus its Vertical Knockback Power -2 downward knockback) and the other
// combat inputs (Throw on primary, Special still reserved). Uses the real
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

// Each BA1's declared Powers and their resolved knockback: both push 180
// sideways (Horizontal Knockback Power 2); only mid-air BA1 also drives the
// target downward, at Vertical Knockback Power 2's 640 reversed (-2).
const BA1_POWERS = {
  ba1: { horizontalKnockback: 2 },
  midairBa1: { horizontalKnockback: 2, verticalKnockback: -2 },
};
const BA1_KNOCKBACK = {
  ba1: { x: 180, y: 0 },
  midairBa1: { x: 180, y: -640 },
};

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
    // Horizontal Knockback Power 2, resolved: the same 180 sideways push as
    // before; ground BA1 has no vertical knockback, mid-air BA1 drives down.
    assert.deepEqual(def.attacks[id].powers, BA1_POWERS[id]);
    assert.deepEqual(atk.knockback, BA1_KNOCKBACK[id]);
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

test('BA1 knockback comes only from its Powers, not a raw value: Horizontal 2, plus Vertical -2 in mid-air', () => {
  const tier = getPowerTier('horizontalKnockback', 2);
  assert.equal(tier.knockbackX, 180);
  assert.equal(getPowerTier('verticalKnockback', 2).knockbackY, 640);
  for (const id of ['ba1', 'midairBa1']) {
    const source = def.attacks[id];
    assert.equal('knockback' in source, false, `${id} has no raw knockback in #0001's data`);
    assert.deepEqual(source.powers, BA1_POWERS[id], id);
    // The resolved number follows the declared tier and nothing else: the
    // same entry at tiers 1 and 3 gets those tiers' pushes, and its vertical
    // knockback (none on the ground) is unchanged.
    for (const n of [1, 2, 3]) {
      const atk = createAttackDefinition({ id, ...source, powers: { ...source.powers, horizontalKnockback: n } });
      assert.deepEqual(atk.knockback, { x: getPowerTier('horizontalKnockback', n).knockbackX, y: BA1_KNOCKBACK[id].y }, `${id} at tier ${n}`);
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

test('a ground BA1 hit pushes the target sideways by exactly 180, away from the attacker, with no launch', () => {
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

// A duel with #0001 in the air, descending, about to press BA1: mid-air BA1.
function midairBa1Duel({ attackerFacing = 1, gap = 50 } = {}) {
  const d = duel({ gap, attackerFacing });
  d.tick({ jump: true, jumpPressed: true });
  // Early in the descent, so the kick connects before touchdown.
  d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 660);
  d.tick(BA1);
  assert.equal(d.attacker.combat.attack.def.id, 'midairBa1');
  return d;
}

test('a mid-air BA1 hit pushes the target 180 away and drives it downward: vx 180 * facing, vy +640', () => {
  for (const facing of [1, -1]) {
    const { attacker, target, tick, events } = midairBa1Duel({ attackerFacing: facing });
    const floor = target.body.y;
    while (!events.length) tick();
    assert.equal(events[0].type, 'hit');
    assert.equal(events[0].target, target);
    assert.equal(attacker.facing, facing);
    // At impact, before the target's next step: CombatSystem.applyHit set it.
    assert.equal(target.body.vx, 180 * facing, 'away from the attacker');
    assert.equal(target.body.vy, 640, 'positive body vy: downward, not a launch');
    // Knocked into the floor it stands on: it never rises, and settles back
    // on the ground.
    while (target.combat.stun > 0 || target.combat.hitstop > 0) {
      tick();
      assert.ok(target.body.y >= floor, 'never lifted off the ground');
      assert.equal(target.body.y, floor, 'never pushed through the floor');
    }
    assert.equal(target.grounded, true);
    assert.ok((target.body.x - attacker.body.x) * facing > 0, 'still in front of the attacker');
  }
});

test('a mid-air BA1 hit on a rising target reverses it: driven downward instead of carrying on up', () => {
  // #0001 jumps and presses BA1 on the way down; the target jumps `delay`
  // ticks after that press, so the kick meets it on its way up. Each run
  // logs the target from its jump until it lands.
  const run = (delay, kick) => {
    const d = duel({ gap: 50 });
    d.tick({ jump: true, jumpPressed: true });
    d.until(() => d.attacker.body.vy > 0 && d.attacker.body.y > 660);
    const log = [];
    for (let i = 0; i < 600 && !(log.length && d.target.grounded); i++) {
      const hits = d.events.length;
      const before = { y: d.target.body.y, vy: d.target.body.vy };
      d.tick(i === 0 && kick ? BA1 : {}, i === delay ? { jump: true, jumpPressed: true } : {});
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
  assert.equal(impact.vy, 640, 'positive body vy: driven downward');
  assert.equal(impact.vx, 180, 'and pushed away, as ever');
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
