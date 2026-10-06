// Movement and game feel (the shared rules in js/game/fighters/movement.js
// with the universal values, js/data/movement.js, run here on #0001):
// ground acceleration, stopping and turning, air steering, jumps that carry
// their speed, the fast fall, the Dash's run-on, how attacks keep, spend and
// add momentum, the facing an attack takes, landing out of an aerial, and
// fixed-step determinism. (The same for every fighter: see
// tests/systems/universal-movement.test.mjs and momentum.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { StageCollision } from '../../js/game/physics.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { CONFIG } from '../../js/config.js';
import {
  def, DT, MOVEMENT, makeFighter, fakeSprites, stageMap, stepUntil, duel, STAGE,
} from '../helpers/fighter-harness.mjs';

const mv = MOVEMENT;
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const RIGHT = { runRight: true };
const LEFT = { runLeft: true };
const DOWN = { down: true };
const JUMP = P('jump');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// A fighter already running right at top speed.
function running(opts) {
  const f = makeFighter(opts);
  for (let i = 0; i < 30; i++) f.step(RIGHT);
  assert.equal(f.fighter.body.vx, f.fighter.maxSpeed);
  return f;
}

// ---- Ground ----------------------------------------------------------------------

test('ground: top speed in about 0.08 s; letting go stops in under 0.1 s on a short slide, never dead', () => {
  const { fighter, step } = makeFighter();
  const toTop = stepUntil(step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  assert.ok(toTop <= 5, `${toTop} steps to top speed`);
  const x = fighter.body.x;
  const vx = [];
  while (fighter.body.vx > 0) {
    step({});
    vx.push(fighter.body.vx);
  }
  assert.ok(vx.length >= 3 && vx.length <= 6, `stops in ${vx.length} steps: a short, natural slide`);
  for (let i = 1; i < vx.length; i++) assert.ok(close(vx[i - 1] - vx[i], mv.deceleration * DT) || vx[i] === 0, 'evenly');
  const slide = fighter.body.x - x;
  assert.ok(slide > 5 && slide < 20, `a slide of ${slide.toFixed(1)} units`);
});

test('ground: reversing brakes hard, then accelerates the other way: a quick turn, never a one-step flip', () => {
  const { fighter, step } = running();
  const log = [fighter.body.vx];
  while (fighter.body.vx > -fighter.maxSpeed) log.push(step(LEFT).body.vx);
  const n = log.length - 1;
  assert.ok(n >= 5 && n <= 7, `a full turn in ${n} steps`);
  const hardest = Math.max(mv.acceleration * mv.turnBoost, mv.deceleration) * DT;
  for (let i = 1; i < log.length; i++) {
    const d = log[i - 1] - log[i];
    assert.ok(d > 0 && d <= hardest + 1e-9, `step ${i}: a change of ${d.toFixed(1)}, never a jump`);
  }
  // Braking against the run is stronger than letting go, and than speeding up.
  assert.ok(log[0] - log[1] > mv.deceleration * DT);
  assert.equal(fighter.facing, -1, 'facing the new way');
});

test('microspacing: taps move a little; run, let go and attack1 lands right beside the opponent', () => {
  const tap = (n) => {
    const { fighter, step } = makeFighter();
    const x = fighter.body.x;
    for (let i = 0; i < n; i++) step(RIGHT);
    for (let i = 0; i < 20; i++) step({});
    return fighter.body.x - x;
  };
  assert.ok(tap(1) < 3, 'a one-step tap barely moves');
  assert.ok(tap(2) < tap(4) && tap(4) < 40, 'longer taps, a little further');

  // Run at an opponent from well away, let go in time, then punch: the
  // stop leaves it inside attack1's reach and short of the pushboxes.
  const d = duel({ gap: 260 });
  let n = 0;
  while (d.target.body.x - d.attacker.body.x > 58 && n++ < 120) d.tick(RIGHT);
  while (d.attacker.body.vx > 0) d.tick();
  const gap = d.target.body.x - d.attacker.body.x;
  assert.ok(gap >= 36 && gap < 57, `stopped at ${gap.toFixed(1)}: no overshoot`);
  d.tick(P('attack1'));
  d.until(() => d.events.length > 0, 20);
  assert.equal(d.events[0].move, 'attack1');
});

// ---- Air and jump -----------------------------------------------------------------

test('a running jump carries the run\'s speed into the air: no reset on takeoff, a light drag after', () => {
  const { fighter, step } = running();
  step({ ...RIGHT, ...JUMP });
  assert.equal(fighter.grounded, false);
  assert.ok(close(fighter.body.vy, -fighter.jumpVelocity + CONFIG.sim.gravity * DT), 'the jump itself, from the press step');
  assert.equal(fighter.body.vx, fighter.maxSpeed, 'the run\'s whole speed');
  const vx = fighter.body.vx;
  step({});
  assert.ok(close(fighter.body.vx, vx - mv.airDeceleration * DT), 'no input: only the air drag');
  // Holding on keeps it: the jump goes forward as far as it did before.
  const hold = running();
  const x = hold.fighter.body.x;
  hold.step({ ...RIGHT, ...JUMP });
  while (!hold.fighter.grounded) hold.step({ ...RIGHT, jump: true });
  assert.ok(hold.fighter.body.x - x > 230, 'a natural forward jump');
});

test('air steering bends the drift: a standing jump can be steered, and reversing in the air is quick but softer than on the ground', () => {
  const stand = makeFighter();
  stand.step(JUMP);
  const toTop = stepUntil(stand.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  assert.ok(toTop <= 7, `${toTop} steps to full air speed`);

  const { fighter, step } = running();
  step({ ...RIGHT, ...JUMP });
  const air = stepUntil(step, (f) => f.body.vx <= -f.maxSpeed, LEFT);
  assert.equal(fighter.grounded, false, 'reversed well within one jump');
  const airtime = (2 * fighter.jumpVelocity) / CONFIG.sim.gravity / DT;
  assert.ok(air < airtime / 3, `reversed in ${air} steps of a ${airtime.toFixed(0)}-step jump`);
  const ground = running();
  const turn = stepUntil(ground.step, (f) => f.body.vx <= -f.maxSpeed, LEFT);
  assert.ok(air > turn, 'not the same as the ground');
  assert.ok(mv.airAcceleration < mv.acceleration && mv.airDeceleration < mv.deceleration);
});

test('air: faster than top speed from a launch, holding on never slows the fighter beyond the drag', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  fighter.body.vx = 800;
  step(RIGHT);
  assert.ok(close(fighter.body.vx, 800 - mv.airDeceleration * DT), 'the drag only');
  step(LEFT);
  assert.ok(close(fighter.body.vx, 800 - mv.airDeceleration * DT - mv.airAcceleration * mv.airTurnBoost * DT), 'against it: the air brake');
});

test('coyote time and the jump buffer still work, at their tuned lengths', () => {
  // Walk off a platform's edge: a jump inside coyote time still jumps.
  // Past it, the press is the air jump instead (or nothing, with it spent).
  const late = (steps, airJumps = mv.airJumps) => {
    const { fighter, step } = makeFighter({ x: 1080, y: 600 });
    stepUntil(step, (f) => !f.grounded, RIGHT);
    for (let i = 0; i < steps; i++) step(RIGHT);
    fighter.airJumps = airJumps;
    step({ ...RIGHT, ...JUMP });
    return { vy: fighter.body.vy, airJumps: fighter.airJumps };
  };
  const coyote = Math.floor(mv.coyoteTime / DT);
  const g = CONFIG.sim.gravity * DT;
  const inside = late(coyote - 2);
  assert.ok(close(inside.vy, -920 + g), 'inside coyote time: the ground jump');
  assert.equal(inside.airJumps, mv.airJumps, 'and the air jump is still there');
  const after = late(coyote + 2);
  assert.ok(close(after.vy, -920 * mv.airJumpRatio + g), 'not after it: the air jump instead');
  assert.equal(after.airJumps, mv.airJumps - 1);
  assert.ok(late(coyote + 2, 0).vy > 0, 'nothing at all once it is spent');
  // Jump pressed just before landing, its air jump spent: it jumps on
  // touchdown (taps: the normal jump).
  const ref = makeFighter();
  ref.step(JUMP);
  const airborne = stepUntil(ref.step, (f) => f.grounded);
  const buffered = (early) => {
    const { fighter, step } = makeFighter();
    step(JUMP);
    fighter.airJumps = 0;
    for (let i = 1; i < airborne - early; i++) step({});
    step(JUMP);
    while (!fighter.grounded) step({});
    step({});
    return fighter.body.vy < 0;
  };
  assert.ok(buffered(3), 'pressed three steps early');
  assert.ok(!buffered(Math.ceil(mv.jumpBuffer / DT) + 3), 'not from long before');
});

// ---- Fast fall --------------------------------------------------------------------

test('fast fall: Down held while descending speeds the fall up smoothly toward fastFallSpeed; never while rising', () => {
  const plain = makeFighter();
  const fast = makeFighter();
  plain.step(JUMP);
  fast.step({ ...JUMP, ...DOWN });
  // Rising: exactly the same arc, however long Down is held.
  while (plain.fighter.body.vy < 0) {
    assert.equal(fast.fighter.body.y, plain.fighter.body.y);
    assert.equal(fast.fighter.fastFalling, false, 'never while rising');
    plain.step();
    fast.step(DOWN);
  }
  // Descending: faster every step, by no more than the fast fall's own
  // acceleration and gravity, up to its top speed.
  let prev = fast.fighter.body.vy;
  let steps = 0;
  while (!fast.fighter.grounded) {
    fast.step(DOWN);
    steps++;
    const vy = fast.fighter.body.vy;
    if (fast.fighter.grounded) break;
    assert.equal(fast.fighter.fastFalling, true);
    assert.ok(vy >= prev, 'never slower');
    assert.ok(vy - prev <= (mv.fastFallAcceleration + CONFIG.sim.gravity) * DT + 1e-9, 'no jump in speed');
    assert.ok(vy <= Math.max(mv.fastFallSpeed, mv.maxFallSpeed), 'capped');
    prev = vy;
  }
  let plainSteps = 0;
  while (!plain.fighter.grounded) {
    plain.step();
    plainSteps++;
  }
  assert.ok(steps < plainSteps * 0.5, `down in ${steps} steps instead of ${plainSteps}`);
});

test('fast fall only while free to fall: never on the ground, in hitstun or an air dash; Shield held in the air is no Shield; an aerial attack may', () => {
  const ground = makeFighter();
  ground.step(DOWN);
  assert.equal(ground.fighter.fastFalling, false);

  const falling = () => {
    const f = makeFighter();
    f.step(JUMP);
    while (f.fighter.body.vy < 0) f.step();
    f.step();
    return f;
  };
  const stunned = falling();
  stunned.fighter.combat.stun = 0.3;
  const vy = stunned.fighter.body.vy;
  stunned.step(DOWN);
  assert.equal(stunned.fighter.fastFalling, false);
  assert.ok(close(stunned.fighter.body.vy, vy + CONFIG.sim.gravity * DT), 'gravity only');

  // There is no Shield in the air: holding the button there rules nothing
  // out.
  const shielded = falling();
  shielded.step({ ...DOWN, shield: true });
  assert.equal(shielded.fighter.combat.shielding, false);
  assert.equal(shielded.fighter.fastFalling, true);

  // An air dash holds the fall off for its whole length: Down too.
  const dashing = falling();
  dashing.step({ runRight: true, mouvementRightPressed: true });
  assert.equal(dashing.fighter.dash?.air, true);
  dashing.step(DOWN);
  assert.equal(dashing.fighter.fastFalling, false);
  assert.equal(dashing.fighter.body.vy, 0, 'flat across the air');

  // A plain aerial (one with no motion of its own: #0001's Floating
  // Straight without its hover) may fast-fall.
  const plainAir = { ...def, attacks: { ...def.attacks, midair_attack1: { ...def.attacks.midair_attack1, motion: undefined } } };
  const f = makeFighter({ character: plainAir });
  f.step(JUMP);
  while (f.fighter.body.vy < 0) f.step();
  f.step();
  f.step({ ...DOWN, ...P('attack1') });
  assert.equal(f.fighter.combat.attack?.def.id, 'midair_attack1');
  f.step(DOWN);
  assert.equal(f.fighter.fastFalling, true, 'return to the ground after an aerial');
  // One that hovers neither falls nor fast-falls while it plays.
  const hover = falling();
  hover.step({ ...DOWN, ...P('attack1') });
  assert.equal(hover.fighter.combat.attack?.def.motion.type, 'hover');
  hover.step(DOWN);
  assert.equal(hover.fighter.fastFalling, false);
  assert.equal(hover.fighter.body.vy, 0, 'standing on the air');
});

test('a fast fall lands on a one-way platform like any fall, never through it', () => {
  const { fighter, step } = makeFighter({ x: 1000, y: 600 });
  assert.equal(fighter.body.ground.id, 'ledge');
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0, {});
  let fast = false;
  while (!fighter.grounded) {
    step(DOWN);
    if (fighter.fastFalling) fast = true;
  }
  assert.ok(fast, 'it fast-fell');
  assert.equal(fighter.body.ground.id, 'ledge');
  assert.equal(fighter.body.y, 600);
  assert.equal(fighter.body.vy, 0);
});

// ---- Dash -------------------------------------------------------------------------

test('after a Dash its burst runs on: held on, it eases back into the run; let go, into a slide; never a spike or a dead stop', () => {
  for (const hold of [true, false]) {
    const { fighter, step } = makeFighter();
    step({ ...RIGHT, runRightPressed: true });
    step({});
    step({ ...RIGHT, runRightPressed: true });
    assert.ok(fighter.dash);
    const energy = fighter.combat.energy;
    assert.equal(energy, 100 - def.energy.dashCost, 'its Energy, once');
    while (fighter.dash) step(hold ? RIGHT : {});
    // The step it ends on already runs on from the Dash's own speed: nothing
    // reset.
    const rate = hold ? mv.overspeedHoldDeceleration : mv.overspeedDeceleration;
    assert.ok(close(fighter.body.vx, mv.dashSpeed - rate * DT), `${fighter.body.vx}`);
    const log = [fighter.body.vx];
    const x = fighter.body.x;
    for (let i = 0; i < 40; i++) log.push(step(hold ? RIGHT : {}).body.vx);
    for (let i = 1; i < log.length; i++) {
      const d = log[i - 1] - log[i];
      assert.ok(d >= 0 && d <= Math.max(rate, mv.deceleration) * DT + 1e-9, `step ${i}: eases by ${d}`);
      if (log[i] > mv.maxSpeed) assert.ok(Math.abs(d - rate * DT) < 1e-9, `step ${i}: at its overspeed rate`);
    }
    if (hold) {
      const settle = log.findIndex((v) => v === fighter.maxSpeed);
      assert.equal(settle, Math.ceil((mv.dashSpeed - mv.maxSpeed) / (mv.overspeedHoldDeceleration * DT) - 1e-9) - 1, 'back to a run');
      assert.ok(log.slice(settle).every((v) => v === fighter.maxSpeed));
    } else {
      assert.equal(log.at(-1), 0);
      assert.ok(fighter.body.x - x < 180, `a slide (${(fighter.body.x - x).toFixed(1)})`);
    }
  }
});

test('an attack pressed during a Dash comes out once its cancel time is reached, keeping the Dash\'s speed: a Dash attack', () => {
  const { fighter, step } = makeFighter();
  step({ ...RIGHT, runRightPressed: true });
  step({});
  step({ ...RIGHT, runRightPressed: true });
  step(P('attack1'));
  assert.equal(fighter.combat.attack, null, 'never in the Dash\'s first moment');
  let n = 1;
  while (!fighter.combat.attack) {
    step({});
    n++;
  }
  assert.equal(n, Math.ceil(mv.dashCancelTime / DT - 1e-9), 'on the first step the Dash may be cut short');
  assert.equal(fighter.dash, null, 'the attack cut it short');
  assert.ok(close(fighter.body.vx, mv.dashSpeed - mv.overspeedHoldDeceleration * DT), `all of the Dash's speed (${fighter.body.vx})`);
  // Late in a Dash, at once.
  const late = makeFighter();
  late.step({ ...RIGHT, runRightPressed: true });
  late.step({});
  late.step({ ...RIGHT, runRightPressed: true });
  while (late.fighter.dash.time < late.fighter.dash.duration - 3 * DT) late.step({});
  late.step(P('attack1'));
  assert.equal(late.fighter.combat.attack?.def.id, 'attack1');
});

// ---- Attacks and momentum ---------------------------------------------------------

test('running into attack1 carries the whole run on through it, never braked, whatever is held: no invisible wall', () => {
  for (const held of [RIGHT, {}, LEFT]) {
    const { fighter, step } = running();
    step({ ...RIGHT, ...P('attack1') });
    assert.equal(fighter.combat.attack.def.id, 'attack1');
    assert.equal(fighter.body.vx, fighter.maxSpeed, 'all of it');
    const x = fighter.body.x;
    let n = 0;
    for (step(held); fighter.combat.attack; step(held)) {
      assert.equal(fighter.body.vx, fighter.maxSpeed, `${JSON.stringify(held)}: carried on, step ${++n}`);
    }
    assert.ok(fighter.body.x - x >= fighter.maxSpeed * n * DT - 1e-9, 'a run\'s distance through the punch');
  }
  // Standing still, it never moves, whatever is held.
  const still = makeFighter();
  const x0 = still.fighter.body.x;
  for (still.step(P('attack1')); still.fighter.state === 'attack'; still.step(RIGHT)) {
    assert.equal(still.fighter.body.x, x0);
  }
});

test('the High Kick steps in on its leap frame; an attack with control keeps a share of a run and may be steered, turning the way it is steered', () => {
  const kick = def.attacks.extra_attack;
  const { fighter, step } = makeFighter();
  step(P('extra_attack'));
  assert.equal(fighter.body.vx, 0, 'standing: no speed to keep');
  while (fighter.combat.attack.time < kick.step.at - 1e-9) step({});
  assert.ok(close(fighter.body.vx, kick.step.speed - mv.overspeedHoldDeceleration * DT), 'its step-in, as the leap frame shows');
  const x = fighter.body.x;
  while (fighter.state === 'attack') step({});
  assert.ok(fighter.body.x - x > 6 && fighter.body.x - x < 30, `a subtle step forward (${(fighter.body.x - x).toFixed(1)})`);
  assert.equal(fighter.body.vx, 0, 'its own lunge faded: back to the standstill it began from');
  // Running in, faster than the step: the run carries on through it.
  const run = running();
  run.step({ ...RIGHT, ...P('extra_attack') });
  while (run.fighter.combat.attack) {
    assert.equal(run.fighter.body.vx, run.fighter.maxSpeed, 'the run, all of it');
    run.step({});
  }
  // Facing left, it steps left.
  const left = makeFighter({ facing: -1 });
  left.step(P('extra_attack'));
  while (left.fighter.combat.attack.time < kick.step.at - 1e-9) left.step({});
  assert.ok(left.fighter.body.vx < 0);

  // Steering through an attack (`control`): Red, given a little.
  const steered = { ...def, attacks: { ...def.attacks, attack2: { ...def.attacks.attack2, control: 0.3 } } };
  const t = running({ character: steered });
  t.step({ ...RIGHT, ...P('attack2') });
  assert.equal(t.fighter.combat.attack.def.id, 'attack2');
  assert.equal(t.fighter.body.vx, t.fighter.maxSpeed, 'all of the run, held on: never pulled down to its share');
  let reversed = false;
  for (t.step(LEFT); t.fighter.state === 'attack'; t.step(LEFT)) {
    assert.equal(t.fighter.facing, -1, 'turned by the direction held');
    reversed ||= t.fighter.body.vx < 0;
  }
  assert.ok(reversed, 'steered the other way while it releases');
});

test('aerials keep all of the drift and steer with their airControl; landing cuts only their recovery', () => {
  const { fighter, step } = running();
  step({ ...RIGHT, ...JUMP });
  step({ ...RIGHT, ...P('attack1') });
  const atk = fighter.combat.attack;
  assert.equal(atk.def.id, 'midair_attack1');
  // All of the drift, above its own steering cap (airControl of top
  // speed): held on, no air drag at all.
  const drift = fighter.maxSpeed;
  assert.equal(fighter.body.vx, drift, 'all of the drift');
  step(RIGHT);
  step({});
  assert.equal(fighter.body.vx, drift, 'held on or let go: carried on');
  for (let i = 0; i < 4; i++) step(LEFT);
  assert.ok(fighter.body.vx < drift - 4 * mv.airDeceleration * DT, 'steered');
  // A plain aerial started just before touchdown plays its startup and
  // strike on after landing; its recovery is cut by the ground (the landing
  // cancel), and the fighter acts at once.
  const plainAir = { ...def, attacks: { ...def.attacks, midair_attack1: { ...def.attacks.midair_attack1, motion: undefined } } };
  const low = makeFighter({ character: plainAir });
  low.step(JUMP);
  while (low.fighter.body.vy < 0 || low.fighter.body.y < 790) low.step();
  low.step(P('attack1'));
  const punch = low.fighter.combat.attack;
  assert.equal(punch.def.id, 'midair_attack1');
  let steps = 0;
  let landed = false;
  while (low.fighter.combat.attack === punch) {
    low.step();
    steps++;
    landed ||= low.fighter.grounded;
  }
  assert.ok(landed, 'landed during it');
  assert.equal(steps, Math.round((punch.def.startup + punch.def.active) / DT), 'its startup and strike, never its recovery');
  for (let i = 0; i < 10 && low.fighter.combat.cooldowns.size; i++) low.step();
  low.step(P('attack1'));
  assert.equal(low.fighter.combat.attack?.def.id, 'attack1', 'free on the ground again');
  // #0001's own hovers instead: started that low, it stays up for the whole
  // attack and only lands after it.
  const hover = makeFighter();
  hover.step(JUMP);
  while (hover.fighter.body.vy < 0 || hover.fighter.body.y < 790) hover.step();
  hover.step(P('attack1'));
  const y = hover.fighter.body.y;
  const floating = hover.fighter.combat.attack;
  while (hover.fighter.combat.attack === floating) {
    assert.equal(hover.fighter.grounded, false);
    assert.equal(hover.fighter.body.y, y, 'never lower');
    hover.step();
  }
  hover.step();
  assert.ok(hover.fighter.body.y > y, 'and falls again once it is over');
});

test('attack movement is data with defaults: an attack that declares none carries its speed on; lockMovement false keeps locomotion', () => {
  const plain = { animation: 'attack1', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 1, hitbox: def.attacks.attack1.hitbox };
  const character = {
    ...def,
    attacks: { ...def.attacks, plain, free: { ...plain, lockMovement: false } },
    actions: { ...def.actions, attack1: 'plain', attack2: 'free' },
  };
  const a = running({ character });
  a.step({ ...RIGHT, ...P('attack1') });
  assert.equal(a.fighter.combat.attack.def.id, 'plain');
  assert.equal(a.fighter.body.vx, a.fighter.maxSpeed, 'all its speed, never braked');
  a.step(LEFT);
  assert.equal(a.fighter.body.vx, a.fighter.maxSpeed, 'no steering, no braking');

  const b = running({ character });
  b.step({ ...RIGHT, ...P('attack2') });
  assert.equal(b.fighter.combat.attack.def.id, 'free');
  assert.equal(b.fighter.body.vx, b.fighter.maxSpeed, 'still running');
  assert.equal(b.fighter.moveDir, 1);
});

// ---- Facing -----------------------------------------------------------------------

test('an attack faces the direction held as it starts: run left, reverse and attack1 on one step strikes right, and holding on keeps it there', () => {
  const { fighter, step } = makeFighter();
  for (let i = 0; i < 20; i++) step(LEFT);
  assert.equal(fighter.facing, -1);
  step({ ...RIGHT, ...P('attack1') });
  assert.equal(fighter.combat.attack.def.id, 'attack1');
  assert.equal(fighter.facing, 1, 'the way the player turned');
  for (step(RIGHT); fighter.state === 'attack'; step(RIGHT)) assert.equal(fighter.facing, 1, 'held on: it stays that way');
  // Let go, it keeps the facing it has; nothing turns it but a direction.
  for (let i = 0; i < 30; i++) step();
  step(P('attack1'));
  for (step(); fighter.state === 'attack'; step()) assert.equal(fighter.facing, 1, 'no direction held: unchanged');
  // With no direction held, the attack keeps the fighter's facing.
  const idle = makeFighter({ facing: -1 });
  idle.step(P('attack2'));
  assert.equal(idle.fighter.facing, -1);
  // The strike lands on the side it faces.
  const d = duel({ gap: 44 });
  for (let i = 0; i < 10; i++) d.tick(LEFT);
  d.attacker.body.x = d.target.body.x - 44;
  d.attacker.body.vx = -60;
  d.tick({ ...RIGHT, ...P('attack1') });
  d.until(() => d.events.length > 0, 20);
  assert.equal(d.events[0].move, 'attack1');
});

// ---- Determinism ------------------------------------------------------------------

test('fixed-step determinism: the same inputs give the same fight, step for step', () => {
  const script = (i) => {
    const k = i % 97;
    return {
      runRight: k < 30 || (k > 60 && k < 70), runLeft: k > 40 && k < 50,
      jump: k === 33, jumpPressed: k === 33,
      down: k > 34 && k < 45,
      attack1: k === 20 || k === 36, attack1Pressed: k === 20 || k === 36,
      attack2: k === 26 || k === 52, attack2Pressed: k === 26 || k === 52,
      extra_attack: k === 80, extra_attackPressed: k === 80,
      runRightPressed: k === 0 || k === 61 || k === 63,
    };
  };
  // The target plays the same script mirrored, so the two meet and fight.
  const mirror = (h) => ({ ...h, runLeft: h.runRight, runRight: h.runLeft, runLeftPressed: h.runRightPressed, runRightPressed: false });
  const run = () => {
    const d = duel({ gap: 44, pushboxes: true });
    const out = [];
    for (let i = 0; i < 900; i++) {
      d.tick(script(i), mirror(script(i + 40)));
      const f = [d.attacker, d.target].map((x) => [x.body.x, x.body.y, x.body.vx, x.body.vy, x.state, x.combat.launchPoint, x.combat.energy]);
      out.push(JSON.stringify(f));
    }
    return { out, events: d.events.map((e) => `${e.type}:${e.move}:${e.launchPointAfter}`) };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.out, b.out);
  assert.deepEqual(a.events, b.events);
  assert.ok(a.events.length > 3, 'a real fight');
});

test('frame rate never changes the simulation: 30, 60 and 120 Hz frames give the same fighters', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../../js/game/battle.js');
  const { getMap } = await import('../../js/data/maps.js');
  const sprites = fakeSprites();
  const run = (hz) => {
    let t = 0;
    const input = {
      flush() {},
      // Held input from the simulation clock: presses land on the same step whatever the frame rate.
      sample() {
        const i = Math.round(t / DT);
        t += DT;
        const k = i % 60;
        return { runRight: k < 25, runLeft: k > 40, jump: k === 30, jumpPressed: k === 30, attack1: k === 10, attack1Pressed: k === 10 };
      },
    };
    const battle = new Battle({ canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input });
    battle.p2.controller = null;
    battle.setPhase('fight');
    for (let s = 0; s < 3 * hz; s++) battle.frame(1 / hz + 1e-9);
    const f = battle.p1;
    const out = [f.body.x, f.body.y, f.state, battle.p2.combat.launchPoint];
    battle.destroy();
    return out;
  };
  const at60 = run(60);
  assert.deepEqual(run(30), at60);
  assert.deepEqual(run(120), at60);
});

// ---- Hitstun movement stays as it was ----------------------------------------------

test('a stunned fighter\'s push or launch runs down at its own hitstun rates, apart from the movement tuning', () => {
  const ground = makeFighter();
  ground.fighter.combat.stun = 0.5;
  ground.fighter.body.vx = 600;
  ground.step(RIGHT);
  assert.ok(close(ground.fighter.body.vx, 600 - mv.hitstunFriction * DT));
  const air = makeFighter();
  air.step(JUMP);
  air.fighter.combat.stun = 0.5;
  air.fighter.body.vx = 600;
  air.step(LEFT);
  assert.ok(close(air.fighter.body.vx, 600 - mv.hitstunAirDrag * DT));
  // The very rates Launch Point was tuned against.
  assert.deepEqual([mv.hitstunFriction, mv.hitstunAirDrag], [1600, 210]);
});

test('a technique carries its fighter on at the speed it had: Unlimited Void\'s cast never brakes it, whatever is held', () => {
  const d = duel({ gap: 900, x: 200 });
  for (let i = 0; i < 20; i++) d.tick({ runRight: true });
  const speed = d.attacker.body.vx;
  assert.equal(speed, mv.maxSpeed, 'running');
  d.tick(P('attack4'));
  assert.ok(d.attacker.technique);
  assert.equal(d.attacker.body.vx, speed, 'the run carried into it');
  while (d.attacker.technique) {
    assert.equal(d.attacker.body.vx, speed, 'held input ignored, the speed kept');
    const x = d.attacker.body.x;
    d.tick({ runLeft: true });
    if (d.attacker.technique) assert.ok(close(d.attacker.body.x - x, speed * DT), 'carried on a run\'s step');
  }
  assert.equal(d.attacker.technique, null);
  // Standing, it stays where it stands.
  const still = duel({ gap: 600 });
  still.tick(P('attack4'));
  const x0 = still.attacker.body.x;
  while (still.attacker.technique) still.tick({ runLeft: true });
  assert.ok(Math.abs(still.attacker.body.prevX - x0) < 1e-9, 'not a unit');
});

// ---- Higher jump and air jump --------------------------------------------------------

// Apex height of a ground jump whose Jump is held for `hold` steps (the
// press step included), from the ground at 800.
function apexOf(hold) {
  const { fighter, step } = makeFighter();
  let top = 800;
  step(JUMP);
  for (let i = 1; !fighter.grounded && i < 200; i++) {
    step(i < hold ? { jump: true } : {});
    top = Math.min(top, fighter.body.y);
  }
  return 800 - top;
}

// The higher-jump window in steps after takeoff: Jump still held on that
// step (held for window + 1 steps, the press step included) decides it.
const HIGH_WINDOW = Math.round(mv.highJumpWindow / DT);

test('a tap is the normal jump; held a little longer it is the higher jump, decided at the higher-jump window', () => {
  const g = CONFIG.sim.gravity;
  const normal = (920 * 920) / (2 * g);
  const high = normal * mv.highJumpHeight;
  assert.equal(HIGH_WINDOW, 9, 'a press of 0.15 s');
  // Let go before the window closes (a tap, or a little longer): the normal
  // jump, the same arc step for step as one never held at all.
  const arc = (hold) => {
    const { fighter, step } = makeFighter();
    step(JUMP);
    const ys = [fighter.body.y];
    for (let i = 1; !fighter.grounded; i++) {
      step(i < hold ? { jump: true } : {});
      ys.push(fighter.body.y);
    }
    return ys;
  };
  const tap = arc(1);
  for (const hold of [2, 5, HIGH_WINDOW]) assert.deepEqual(arc(hold), tap, `held ${hold}: the normal jump`);
  const h = apexOf(1);
  assert.ok(Math.abs(h - normal) < 8, `a tap: ${h.toFixed(1)} vs ${normal.toFixed(1)}`);
  // Held through it: the higher jump, whenever it is let go after.
  for (const hold of [HIGH_WINDOW + 1, HIGH_WINDOW + 3, 200]) {
    const hh = apexOf(hold);
    assert.ok(Math.abs(hh - high) < 8, `held ${hold}: ${hh.toFixed(1)} vs ${high.toFixed(1)}`);
  }
  assert.ok(high - normal > 60, 'clearly higher');
});

test('the higher jump bends its arc: never a kick upward, lighter gravity from the window to its apex, full gravity after', () => {
  const { fighter, step } = makeFighter();
  const g = CONFIG.sim.gravity * DT;
  step(JUMP);
  const vys = [fighter.body.vy];
  while (fighter.body.vy < 0) {
    step({ jump: true });
    vys.push(fighter.body.vy);
  }
  for (let i = 1; i < vys.length; i++) {
    const dv = vys[i] - vys[i - 1];
    if (i < HIGH_WINDOW) assert.ok(close(dv, g, 1e-6), `step ${i}: full gravity until the window`);
    else assert.ok(dv > 0 && dv < g * 0.8, `step ${i}: slowing, under lighter gravity (${(dv / g).toFixed(2)})`);
  }
  // The same lightness all the way up: one share of gravity, set once.
  const shares = vys.slice(HIGH_WINDOW).map((v, i) => (v - vys[HIGH_WINDOW - 1 + i]) / g);
  assert.ok(shares.every((k) => close(k, shares[0], 1e-6)));
  // Over the top: full gravity again from the next step, and it is done.
  const vy = fighter.body.vy;
  step({ jump: true });
  assert.ok(close(fighter.body.vy - vy, g, 1e-6));
  assert.equal(fighter.highJump, null);
});

test('the higher jump is decided once: an air jump, a hit or landing ends it, and the air jump is never a higher one', () => {
  const g = CONFIG.sim.gravity * DT;
  const rising = () => {
    const made = makeFighter();
    made.step(JUMP);
    for (let i = 0; i < HIGH_WINDOW; i++) made.step({ jump: true });
    assert.ok(made.fighter.highJump?.lift > 0 && made.fighter.highJump.lift < 1, 'the higher jump');
    return made;
  };
  // The air jump: a fresh jump at the air jump's speed, under full gravity.
  const air = rising();
  air.step({});
  air.step(JUMP);
  assert.equal(air.fighter.highJump, null);
  let vy = air.fighter.body.vy;
  air.step({ jump: true });
  assert.ok(close(air.fighter.body.vy - vy, g, 1e-6));
  // Held or tapped, the air jump tops out at the same height.
  const airApex = (hold) => {
    const { fighter, step } = makeFighter();
    step(JUMP);
    stepUntil(step, (f) => f.body.vy > 0);
    step(JUMP);
    const from = fighter.body.y;
    let top = from;
    for (let i = 1; fighter.body.vy < 0; i++) {
      step(i < hold ? { jump: true } : {});
      top = Math.min(top, fighter.body.y);
    }
    return from - top;
  };
  assert.equal(airApex(1), airApex(40));
  // A hit is over it at once.
  const hit = rising();
  hit.fighter.takeHit({ launchSpeed: 0 });
  assert.equal(hit.fighter.highJump, null);
  vy = hit.fighter.body.vy;
  hit.step({ jump: true });
  assert.ok(close(hit.fighter.body.vy - vy, g, 1e-6), 'full gravity at once');
  // And a new ground jump after landing decides afresh: a tap is normal.
  const land = rising();
  stepUntil(land.step, (f) => f.grounded);
  assert.equal(land.fighter.highJump, null);
});

test('two air jumps: past coyote time, from anywhere in the air, each the jump clip from its first frame', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0, { jump: true });
  assert.equal(fighter.state, 'fall');
  assert.equal(fighter.airJumps, 2);
  for (const left of [1, 0]) {
    step(JUMP);
    assert.ok(close(fighter.body.vy, -920 * mv.airJumpRatio + CONFIG.sim.gravity * DT), 'a fresh jump');
    assert.equal(fighter.airJumps, left);
    assert.equal(fighter.state, 'jump');
    assert.equal(fighter.animator.anim.key, 'jump');
    assert.equal(fighter.animator.index, 0, 'from its first frame');
    stepUntil(step, (f) => f.body.vy > 0);
  }
  // No third one.
  const vy = fighter.body.vy;
  step(JUMP);
  assert.ok(fighter.body.vy > vy, 'spent: nothing');
  // Landing gives both back.
  stepUntil(step, (f) => f.grounded);
  assert.equal(fighter.airJumps, 2);
  // Mid-rise, the air jump starts over too (the clip included).
  step(JUMP);
  for (let i = 0; i < 12; i++) step({ jump: true });
  assert.equal(fighter.state, 'jump');
  step(JUMP);
  assert.equal(fighter.animator.index, 0);
});

test('an air jump never sets the sideways speed: the drift carries on, and a held direction steers it as the air does', () => {
  const turn = running();
  turn.step({ ...RIGHT, ...JUMP });
  for (let i = 0; i < 10; i++) turn.step({ ...RIGHT, jump: true });
  const before = turn.fighter.body.vx;
  turn.step({ ...LEFT, ...JUMP });
  assert.ok(close(turn.fighter.body.vx, before - mv.airAcceleration * mv.airTurnBoost * DT), 'one step of the air\'s turn, no flip');
  const on = running();
  on.step({ ...RIGHT, ...JUMP });
  for (let i = 0; i < 10; i++) on.step({ jump: true });
  const vx = on.fighter.body.vx;
  on.step(JUMP);
  assert.ok(close(on.fighter.body.vx, vx - mv.airDeceleration * DT), 'no direction: the drift, under the drag');
});

test('a hit gives the air jumps back; a stun or an attack in progress (a Deflect too) holds them for later', () => {
  const d = duel({ gap: 44 });
  d.target.body.y = 700;
  d.target.body.grounded = false;
  d.target.body.ground = null;
  d.target.airJumps = 0;
  d.attacker.body.y = 700;
  d.attacker.body.grounded = false;
  d.attacker.body.ground = null;
  d.tick(P('attack1'));
  d.until(() => d.events.length > 0, 30);
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.target.airJumps, mv.airJumps, 'given back');
  // Stunned, the press waits (it may expire); it never fires mid-stun.
  d.tick({}, JUMP);
  assert.ok(d.target.combat.stun > 0);
  assert.equal(d.target.airJumps, mv.airJumps);
  const deflect = makeFighter();
  deflect.step(JUMP);
  stepUntil(deflect.step, (f) => f.body.vy > 0, { jump: true });
  deflect.step({ shield: true, shieldPressed: true });
  assert.equal(deflect.fighter.combat.attack?.def.id, 'deflect');
  deflect.step({ shield: true, ...JUMP });
  assert.equal(deflect.fighter.airJumps, mv.airJumps, 'the Deflect plays on: the jump waits');
});

test('the CPUs let go of Jump inside the higher-jump window: their jumps are normal ones', async () => {
  const { CombatAIController } = await import('../../js/game/ai/combat-ai.js');
  const { TrainingAIController } = await import('../../js/game/fighters/fighter-controller.js');
  const normal = (920 * 920) / (2 * CONFIG.sim.gravity);
  const apexWith = (controller, prepare) => {
    const d = duel({ gap: 600 });
    const held = [];
    d.attacker.controller = {
      getInput: (self, dt, ctx) => {
        const out = controller.getInput(self, dt, ctx);
        held.push(out.jump);
        return out;
      },
    };
    prepare(d);
    let top = d.attacker.body.y;
    for (let i = 0; i < 60; i++) {
      d.tick();
      top = Math.min(top, d.attacker.body.y);
    }
    const run = held.indexOf(false, held.indexOf(true)) - held.indexOf(true);
    assert.ok(run > 1 && run <= HIGH_WINDOW, `held ${run} steps: a moment, then let go in time`);
    return 800 - top;
  };
  // The combat AI, handed a jump to make (as its jump-in or a hop would).
  const ai = new CombatAIController({ difficulty: 'hard', rng: () => 0.5 });
  const cpu = apexWith(ai, (d) => {
    ai.getInput(d.attacker, DT, { stage: d.attacker.body && STAGE, gravity: CONFIG.sim.gravity });
    ai.setIntent({ kind: 'jump', dir: 0 });
    ai.intent.keepUntil = Infinity;
    ai.thinkTimer = Infinity;
  });
  assert.ok(Math.abs(cpu - normal) < 8, `the combat AI: a normal jump (${cpu.toFixed(0)})`);
  // The training CPU, hopping a block in its way.
  const training = new TrainingAIController({ rng: () => 0.5 });
  training.thinkTimer = Infinity;
  const hop = apexWith(training, () => { training.wantJump = true; });
  assert.ok(Math.abs(hop - normal) < 8, `the training CPU: a normal jump (${hop.toFixed(0)})`);
});
