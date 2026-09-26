// How a launched fighter responds (the character's `launchReaction`, see
// resolveLaunchReaction in js/game/combat.js): a harder launch stuns longer,
// a hard one tumbles, and the direction held as a hit lands bends the launch
// a little. None of it changes a launch's strength.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLaunchReaction, resolveLaunchStun, steerLaunch, CombatSystem } from '../js/game/combat.js';
import { resolveDirectionalLaunch, LAUNCH_UNIT_SPEED as U } from '../js/data/launch.js';
import { def, DT, makeFighter, duel, frameName } from './fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const R = def.launchReaction;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const deg = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

test('#0001\'s launch reaction is data, and a fighter without one responds exactly as before', () => {
  assert.deepEqual(R, { stunPerThousand: 0.2, maxStun: 0.7, tumbleSpeed: 1100, steerAngle: 15 });
  const none = resolveLaunchReaction(undefined);
  assert.equal(resolveLaunchStun(3000, none), 0);
  assert.equal(none.tumbleSpeed, Infinity);
  const launch = resolveDirectionalLaunch('vertical', 100, 1);
  assert.equal(steerLaunch(launch, { x: 1, y: 0 }, none.steerAngle), launch);
});

test('a harder launch stuns longer, up to a cap; a hit that launches nothing keeps its own stun', () => {
  assert.equal(resolveLaunchStun(0, R), 0);
  assert.ok(close(resolveLaunchStun(1000, R), 0.2));
  assert.ok(close(resolveLaunchStun(2000, R), 0.4));
  assert.equal(resolveLaunchStun(10000, R), R.maxStun, 'capped');
  // Through the real CombatSystem: BA2 on a target at 50 launches at 1200.
  const d = duel({ gap: 40 });
  d.target.combat.launchPoint = 50;
  d.tick(P('action2'));
  d.until(() => d.events.length > 0, 30);
  const [e] = d.events;
  assert.equal(e.launchSpeed, 120 * U);
  assert.ok(close(e.hitstun, def.attacks.ba2.hitstun + 0.24));
  assert.equal(d.target.combat.stun, e.hitstun);
  // The shuriken never launches: its stun is its own.
  const s = duel({ gap: 200 });
  s.target.combat.launchPoint = 300;
  s.tick(P('primary'));
  s.until(() => s.events.length > 0, 60);
  assert.equal(s.events[0].launchSpeed, 0);
  assert.equal(s.events[0].hitstun, def.projectiles.shuriken.hitstun);
});

test('launched hard, a fighter tumbles in its mid-air hurt pose past the stun, until it acts or lands', () => {
  const d = duel({ gap: 40 });
  d.target.combat.launchPoint = 80;
  d.tick(P('action2'));
  d.until(() => d.events.length > 0, 30);
  assert.ok(d.events[0].launchSpeed >= R.tumbleSpeed);
  assert.equal(d.target.tumbling, true);
  d.until(() => d.target.combat.stun <= 0 && d.target.combat.hitstop <= 0, 120);
  d.tick();
  assert.equal(d.target.grounded, false);
  assert.equal(d.target.state, 'tumble', 'free, but still tumbling');
  assert.equal(frameName(d.target), '0001_midairhurt.png');
  // Steering alone does not end it...
  d.tick({}, { left: true });
  assert.equal(d.target.state, 'tumble');
  // ...an air jump does.
  d.tick({}, P('jump'));
  assert.equal(d.target.tumbling, false);
  assert.equal(d.target.state, 'jump');

  // A slower launch never tumbles; landing ends one.
  const slow = duel({ gap: 40 });
  slow.target.combat.launchPoint = 20;
  slow.tick(P('action2'));
  slow.until(() => slow.events.length > 0, 30);
  assert.equal(slow.target.tumbling, false);
  const land = duel({ gap: 40 });
  land.target.combat.launchPoint = 80;
  land.tick(P('action2'));
  land.until(() => land.target.grounded && land.events.length > 0, 240);
  assert.equal(land.target.tumbling, false);
});

test('launch steering bends a launch toward the held direction by up to 15 degrees; its speed never changes', () => {
  const up = { x: 0, y: -1000 };
  const right = steerLaunch(up, { x: 1, y: 0 }, R.steerAngle);
  assert.ok(close(Math.hypot(right.x, right.y), 1000), 'same speed');
  assert.ok(close(deg(right) - deg(up), R.steerAngle), 'the full angle across it');
  const left = steerLaunch(up, { x: -1, y: 0 }, R.steerAngle);
  assert.ok(left.x < 0 && close(-left.x, right.x));
  // Held along the launch, or against it: nothing to bend.
  assert.equal(steerLaunch(up, { x: 0, y: -1 }, R.steerAngle), up);
  assert.equal(steerLaunch(up, { x: 0, y: 1 }, R.steerAngle), up);
  // A diagonal counts only its part across.
  const diag = steerLaunch(up, { x: 1, y: -1 }, R.steerAngle);
  assert.ok(close(deg(diag) - deg(up), R.steerAngle * Math.SQRT1_2));
  // A sideways launch bends up with Jump held, down with Charge.
  const side = { x: 1000, y: 0 };
  assert.ok(steerLaunch(side, { x: 0, y: -1 }, R.steerAngle).y < 0);
  assert.ok(steerLaunch(side, { x: 0, y: 1 }, R.steerAngle).y > 0);
});

test('in play, the target\'s held direction steers the launch; with nothing held it is the formula exactly', () => {
  const launched = (held) => {
    const d = duel({ gap: 40 });
    d.target.combat.launchPoint = 60;
    d.tick(P('action2'));
    // Held on the step the kick lands (walking away any sooner would dodge it).
    const landing = () => d.attacker.combat.attack.time + DT >= d.attacker.combat.attack.def.startup - 1e-6;
    for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, landing() ? held : {});
    return d.events[0];
  };
  const plain = launched({});
  assert.deepEqual({ ...plain.finalLaunch }, { x: 0, y: -140 * U }, 'straight up, exactly');
  for (const [held, sign] of [[{ right: true }, 1], [{ left: true }, -1]]) {
    const e = launched(held);
    assert.equal(Math.sign(e.finalLaunch.x), sign);
    assert.ok(close(Math.hypot(e.finalLaunch.x, e.finalLaunch.y), 140 * U), 'the strength untouched');
    assert.equal(e.launchStrength, plain.launchStrength);
  }
  // Standing, Down bends nothing into the floor.
  const d = duel({ gap: 40 });
  d.target.combat.launchPoint = 60;
  d.tick(P('action1'), { charge: true });
  d.until(() => d.events.length > 0, 30);
  assert.equal(d.events[0].finalLaunch.y, 0);
});

test('a hit gives back the air jump, so a launched fighter can steer and jump its way home', () => {
  const { fighter } = makeFighter();
  fighter.airJumps = 0;
  const system = new CombatSystem();
  const attacker = makeFighter({ x: 460 }).fighter;
  system.applyHit(attacker, fighter, { ...fighter.attacks.ba2, id: 'ba2' });
  assert.equal(fighter.airJumps, def.movement.airJumps);
});
