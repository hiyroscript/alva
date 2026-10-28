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
import { DASH_ENERGY_COST } from '../../js/game/combat/combat-state.js';
import { STEP_IN } from '../../js/data/attack-movement.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';

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
  const late = (steps, airJumps = mv.airJumps, held = {}) => {
    const { fighter, step } = makeFighter({ x: 1080, y: 600 });
    stepUntil(step, (f) => !f.grounded, RIGHT);
    for (let i = 0; i < steps; i++) step(RIGHT);
    fighter.airJumps = airJumps;
    step({ ...RIGHT, ...JUMP, ...held });
    return { vy: fighter.body.vy, airJumps: fighter.airJumps };
  };
  const coyote = Math.floor(mv.coyoteTime / DT);
  const g = CONFIG.sim.gravity * DT;
  const inside = late(coyote - 2);
  assert.ok(close(inside.vy, -mv.jumpVelocity + g), 'inside coyote time: the ground jump');
  assert.equal(inside.airJumps, mv.airJumps, 'and the air jump is still there');
  // Down held with it: still the normal jump. The Super Jump needs the
  // ground itself, never coyote time.
  const superLate = late(coyote - 2, mv.airJumps, { down: true, downPressed: true });
  assert.ok(close(superLate.vy, -mv.jumpVelocity + g), 'inside coyote time, Down held: the normal jump');
  const after = late(coyote + 2);
  assert.ok(close(after.vy, -mv.airJumpVelocity + g), 'not after it: the air jump instead');
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
  // Down from the first step in the air (with Jump it would be the Super
  // Jump).
  fast.step(JUMP);
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
    step({ ...RIGHT, mouvementRightPressed: true });
    assert.ok(fighter.dash);
    const energy = fighter.combat.energy;
    assert.equal(energy, 100 - DASH_ENERGY_COST, 'its Energy, once');
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
  step({ ...RIGHT, mouvementRightPressed: true });
  step(P('attack1'));
  assert.equal(fighter.combat.attack, null, 'never in the Dash\'s first moment');
  let n = 1;
  while (!fighter.combat.attack) {
    step({});
    n++;
  }
  assert.equal(n, Math.ceil(mv.dashCancelTime / DT - 1e-9), 'on the first step the Dash may be cut short');
  assert.equal(fighter.dash, null, 'the attack cut it short');
  const attack1 = fighter.attacks.attack1;
  assert.ok(fighter.body.vx > mv.dashSpeed * attack1.momentum - mv.overspeedDeceleration * DT - 1e-9, `${fighter.body.vx}`);
  // Late in a Dash, at once.
  const late = makeFighter();
  late.step({ ...RIGHT, runRightPressed: true });
  late.step({});
  late.step({ ...RIGHT, mouvementRightPressed: true });
  while (late.fighter.dash.time < late.fighter.dash.duration - 3 * DT) late.step({});
  late.step(P('attack1'));
  assert.equal(late.fighter.combat.attack?.def.id, 'attack1');
});

// ---- Attacks and momentum ---------------------------------------------------------

test('running into attack1 keeps the whole run as it starts, then it runs down whatever is held: no steering, no invisible wall', () => {
  // `late`: held only once its Step-in has gone (a direction held turns an
  // attack, and a Step-in still to come goes the way the strike then faces).
  const play = (held, late = false) => {
    const h = running();
    h.step({ ...RIGHT, ...P('attack1') });
    const log = [];
    const now = () => (!late || h.fighter.combat.attack?.stepped ? held : {});
    for (h.step(now()); h.fighter.state === 'attack'; h.step(now())) log.push([h.fighter.body.x, h.fighter.body.vx]);
    return { h, log };
  };
  const neutral = play({});
  const attack1 = neutral.h.fighter.attacks.attack1;
  assert.equal(attack1.momentum, 1);
  assert.ok(close(neutral.log[0][1], neutral.h.fighter.maxSpeed - 2 * mv.deceleration * attack1.friction * DT), 'its friction');
  // Its Step-in, once, as the strike nears: never past the run it came in at.
  for (const [, vx] of neutral.log) assert.ok(vx <= neutral.h.fighter.maxSpeed && vx >= 0, `never faster than the run (${vx})`);
  assert.deepEqual(play(RIGHT).log, neutral.log, 'Run held: exactly as if nothing were held');
  // Held back once its Step-in is made it turns, but nothing redirects the
  // speed it has.
  const back = play(LEFT, true);
  assert.equal(back.h.fighter.facing, -1, 'turned');
  assert.deepEqual(back.log, neutral.log, 'held back: the same path');
  // From a standstill it steps in by itself, a little, held or not.
  const still = makeFighter();
  const x0 = still.fighter.body.x;
  for (still.step(P('attack1')); still.fighter.state === 'attack'; still.step());
  const lean = still.fighter.body.x - x0;
  assert.ok(lean > 6 && lean < 20, `a slight Step-in (${lean.toFixed(1)})`);
  const pushed = makeFighter();
  let reached = x0;
  for (pushed.step({ ...RIGHT, ...P('attack1') }); pushed.fighter.state === 'attack'; pushed.step(RIGHT)) reached = pushed.fighter.body.x;
  assert.ok(close(reached - x0, lean), 'Run held from a standstill: the same Step-in, no further while it plays');
});

test('the High Kick steps in on its leap frame (its own Step-in, no other); a cast never steps in and is never steered, only turned', () => {
  const { fighter, step } = makeFighter();
  const kick = fighter.attacks.extra_attack;
  assert.equal(kick.stepIn, 'authored');
  step(P('extra_attack'));
  assert.equal(fighter.body.vx, 0, 'standing: no speed to keep');
  while (fighter.combat.attack.time < kick.step.at - 1e-9) step({});
  assert.ok(close(fighter.body.vx, kick.step.speed - mv.deceleration * kick.friction * DT), 'its step-in, as the leap frame shows');
  const x = fighter.body.x;
  while (fighter.state === 'attack') step({});
  assert.ok(fighter.body.x - x > 6 && fighter.body.x - x < 30, `a subtle step forward (${(fighter.body.x - x).toFixed(1)})`);
  // Facing left, it steps left.
  const left = makeFighter({ facing: -1 });
  left.step(P('extra_attack'));
  while (left.fighter.combat.attack.time < kick.step.at - 1e-9) left.step({});
  assert.ok(left.fighter.body.vx < 0);

  // Red, a cast: run into it and hold back: it turns, but its speed runs
  // down exactly as with nothing held, and it never steps in.
  const back = running();
  const plain = running();
  const red = back.fighter.attacks.attack2;
  assert.equal(red.stepIn, 'exempt');
  back.step({ ...RIGHT, ...P('attack2') });
  plain.step({ ...RIGHT, ...P('attack2') });
  assert.equal(back.fighter.combat.attack.def.id, 'attack2');
  for (back.step(LEFT), plain.step(); back.fighter.state === 'attack'; back.step(LEFT), plain.step()) {
    assert.equal(back.fighter.facing, -1, 'turned by the direction held');
    assert.equal(back.fighter.body.vx, plain.fighter.body.vx, 'never steered');
    assert.ok(back.fighter.body.vx >= 0, 'never reversed');
  }
  const cast = makeFighter();
  const x1 = cast.fighter.body.x;
  for (cast.step(P('attack2')); cast.fighter.state === 'attack'; cast.step());
  assert.equal(cast.fighter.body.x, x1, 'from a standstill it stays where it casts');
});

test('aerials keep their share of the drift and the universal air control; landing cuts only their recovery and never steps them in', () => {
  const play = (held) => {
    const h = running();
    h.step({ ...RIGHT, ...JUMP });
    h.step(P('attack1'));
    const atk = h.fighter.combat.attack;
    const log = [h.fighter.body.vx];
    while (h.fighter.combat.attack === atk) {
      h.step(held);
      if (h.fighter.combat.attack === atk) log.push(h.fighter.body.vx);
    }
    return { atk, log };
  };
  const { atk, log } = play({});
  assert.equal(atk.def.id, 'midair_attack1');
  assert.equal(atk.step, null, 'no Step-in in the air');
  // Its share of the drift (airMomentum), then the air drag with nothing
  // held, and the air control, as ever, with a direction held.
  const drift = MOVEMENT.maxSpeed * atk.def.airMomentum;
  assert.ok(close(log[0], drift - mv.airDeceleration * DT), 'its share of the drift');
  const back = play(LEFT).log;
  assert.ok(close(back[1], log[0] - mv.airAcceleration * mv.airTurnBoost * DT), 'held back: the air turn, as outside an attack');
  assert.ok(back.at(-1) < log.at(-1) - 100, 'turned round by the air control');
  const on = play(RIGHT).log;
  assert.ok(on.at(-1) > log.at(-1), 'held on: back up toward top speed');
  // A plain aerial started just before touchdown plays its startup and
  // strike on after landing; its recovery is cut by the ground (the landing
  // cancel), and the fighter acts at once.
  const plainAir = { ...def, attacks: { ...def.attacks, midair_attack1: { ...def.attacks.midair_attack1, motion: undefined } } };
  const low = makeFighter({ character: plainAir });
  low.step(JUMP);
  while (low.fighter.body.vy < 0 || low.fighter.body.y < 785) low.step();
  low.step(P('attack1'));
  const punch = low.fighter.combat.attack;
  assert.equal(punch.def.id, 'midair_attack1');
  assert.equal(punch.step, null, 'started in the air: no Step-in, landed or not');
  const landX = low.fighter.body.x;
  let steps = 0;
  let landed = false;
  while (low.fighter.combat.attack === punch) {
    low.step();
    steps++;
    landed ||= low.fighter.grounded;
  }
  assert.ok(landed, 'landed during it');
  assert.equal(low.fighter.body.x, landX, 'no lunge on landing');
  assert.equal(steps, Math.round((punch.def.startup + punch.def.active) / DT), 'its startup and strike, never its recovery');
  for (let i = 0; i < 10 && low.fighter.combat.cooldowns.size; i++) low.step();
  low.step(P('attack1'));
  assert.equal(low.fighter.combat.attack?.def.id, 'attack1', 'free on the ground again');
  // #0001's own hovers instead: started that low, it stays up for the whole
  // attack and only lands after it.
  const hover = makeFighter();
  hover.step(JUMP);
  while (hover.fighter.body.vy < 0 || hover.fighter.body.y < 785) hover.step();
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

test('attack movement is data with defaults: an attack that declares none keeps all its speed and steps in; a steering field is refused', () => {
  const plain = { animation: 'attack1', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 1, hitbox: def.attacks.attack1.hitbox };
  const character = { ...def, attacks: { ...def.attacks, plain }, actions: { ...def.actions, attack1: 'plain' } };
  const a = running({ character });
  a.step({ ...RIGHT, ...P('attack1') });
  const atk = a.fighter.combat.attack.def;
  assert.equal(atk.id, 'plain');
  assert.deepEqual([atk.momentum, atk.airMomentum, atk.friction, atk.stepIn], [1, 1, 1, 'universal']);
  assert.deepEqual({ ...atk.step }, { at: atk.startup * STEP_IN.lead, speed: STEP_IN.speed });
  assert.ok(close(a.fighter.body.vx, a.fighter.maxSpeed - mv.deceleration * DT), 'all its speed, the universal deceleration');
  a.step(RIGHT);
  assert.ok(close(a.fighter.body.vx, a.fighter.maxSpeed - 2 * mv.deceleration * DT), 'no steering, held or not');
  assert.equal(a.fighter.moveDir, 0, 'no locomotion while it plays');
  for (const field of ['mobility', 'control', 'airControl', 'topSpeed', 'airTopSpeed', 'lockMovement']) {
    const value = field === 'mobility' ? 'quick' : field === 'lockMovement' ? false : 0.5;
    assert.throws(() => createAttackDefinition({ ...plain, id: 'x', [field]: value }), /steering of its own/, field);
    assert.throws(() => makeFighter({ character: { ...character, attacks: { ...character.attacks, plain: { ...plain, [field]: value } } } }), /steering of its own/, `${field}: the fighter refuses it`);
  }
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

test('a technique holds its fighter still: Unlimited Void\'s cast never moves, whatever is held', () => {
  const d = duel({ gap: 600 });
  for (let i = 0; i < 20; i++) d.tick({ runRight: true });
  assert.ok(d.attacker.body.vx > 0, 'running');
  d.tick(P('attack4'));
  assert.ok(d.attacker.technique);
  const x = d.attacker.body.x;
  while (d.attacker.technique) {
    assert.equal(d.attacker.body.vx, 0, 'held input ignored');
    d.tick({ runLeft: true });
  }
  assert.ok(Math.abs(d.attacker.body.prevX - x) < 1e-9, 'not a unit until it is over');
});

// ---- Normal jump, Super Jump and air jump -----------------------------------------

// The apexes before this update, measured on this very harness (the fixed
// step, #0001, the flat stage): the normal jump at 920 and the retired
// hold-for-higher jump, both from the ground at 800.
const OLD_NORMAL_APEX = 161.64;
const OLD_HIGHER_APEX = 232.48;
const SUPER = { ...JUMP, ...DOWN, downPressed: true };

// The arc of a ground jump pressed with `first` and `held(i)` after (step i
// from 1), from the ground at 800: every step's height, its apex, and the
// step it topped out on.
function jumpArc(first, held = () => ({})) {
  const { fighter, step } = makeFighter();
  const y0 = fighter.body.y;
  step(first);
  const ys = [fighter.body.y];
  for (let i = 1; !fighter.grounded && i < 300; i++) {
    step(held(i));
    ys.push(fighter.body.y);
  }
  const top = Math.min(...ys);
  return { ys, apex: y0 - top, apexAt: ys.indexOf(top) };
}

test('the normal jump is a quick, low hop: well under the old one, and the same however long Jump is held', () => {
  const tap = jumpArc(JUMP);
  assert.ok(tap.apex >= 100 && tap.apex <= 115, `about 105 units: ${tap.apex.toFixed(1)}`);
  assert.ok(tap.apex < OLD_NORMAL_APEX * 0.7, `clearly lower than the old ${OLD_NORMAL_APEX}`);
  // Held for any length, or let go at once: the same arc, step for step.
  for (const hold of [2, 5, 9, 12, 200]) {
    assert.deepEqual(jumpArc(JUMP, (i) => (i < hold ? { jump: true } : {})).ys, tap.ys, `held ${hold} steps`);
  }
});

test('the Super Jump: Down held with a fresh Jump press on the ground, the old higher jump\'s height, all of its lift at takeoff', () => {
  const sup = jumpArc(SUPER);
  assert.ok(Math.abs(sup.apex - OLD_HIGHER_APEX) <= 3, `${sup.apex.toFixed(2)} vs the old higher jump's ${OLD_HIGHER_APEX}`);
  assert.ok(sup.apex > jumpArc(JUMP).apex * 2, 'more than twice the normal jump');
  // Its whole lift from the press step on, then ordinary gravity every step
  // to the top: never a lighter rise, never a later kick.
  const { fighter, step } = makeFighter();
  const g = CONFIG.sim.gravity * DT;
  step(SUPER);
  assert.ok(close(fighter.body.vy, -mv.superJumpVelocity + g), 'its own speed, from the press step');
  let vy = fighter.body.vy;
  while (fighter.body.vy < 0) {
    step({ jump: true, down: true });
    assert.ok(close(fighter.body.vy - vy, g, 1e-6), 'full gravity, Down and Jump held on');
    vy = fighter.body.vy;
  }
  // Faster to its apex than the old higher jump's lighter rise (36 steps).
  assert.ok(sup.apexAt < 30, `${sup.apexAt} steps to its apex`);
});

test('the Super Jump is decided as Jump is pressed: Down and Jump on the same step, or Down first, held any time; never Down after Jump', () => {
  const sup = jumpArc(SUPER).ys;
  const normal = jumpArc(JUMP).ys;
  // Down pressed first and held for a while, then Jump: the same Super Jump.
  for (const wait of [1, 10, 60]) {
    const { fighter, step } = makeFighter();
    step({ down: true, downPressed: true });
    for (let i = 1; i < wait; i++) step(DOWN);
    const ys = [];
    step({ ...JUMP, ...DOWN });
    ys.push(fighter.body.y);
    while (!fighter.grounded) {
      step({});
      ys.push(fighter.body.y);
    }
    assert.deepEqual(ys, sup, `Down held ${wait} steps first`);
  }
  // Let go of both at once after takeoff, or hold both: the same arc as far
  // as the apex (Down held while falling is the fast fall, as ever).
  const held = jumpArc(SUPER, () => ({ jump: true, down: true })).ys;
  const top = sup.indexOf(Math.min(...sup));
  assert.deepEqual(held.slice(0, top + 1), sup.slice(0, top + 1), 'held on: the same rise');
  // Jump first, Down a step later: the normal jump, never upgraded.
  assert.deepEqual(jumpArc(JUMP, (i) => (i === 1 ? { ...DOWN, downPressed: true } : {})).ys.slice(0, 5), normal.slice(0, 5));
  const late = makeFighter();
  late.step(JUMP);
  late.step({ ...DOWN, downPressed: true, jump: true });
  assert.ok(close(late.fighter.body.vy, -mv.jumpVelocity + 2 * CONFIG.sim.gravity * DT), 'Down after Jump: the normal jump');
});

test('no Super Jump in the air: Down and Jump in the air is the air jump, and a press made in the air never becomes one on landing', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0);
  step(SUPER);
  assert.ok(close(fighter.body.vy, -mv.airJumpVelocity + CONFIG.sim.gravity * DT), 'the air jump');
  assert.equal(fighter.superJumpTakeoff, null, 'no Super Jump takeoff');
  // Down and Jump pressed just before landing, the air jumps spent: the
  // buffered press is the normal jump on touchdown.
  const ref = makeFighter();
  ref.step(JUMP);
  const airborne = stepUntil(ref.step, (f) => f.grounded);
  const buffered = makeFighter();
  buffered.step(JUMP);
  buffered.fighter.airJumps = 0;
  for (let i = 1; i < airborne - 2; i++) buffered.step({});
  buffered.step({ ...SUPER });
  while (!buffered.fighter.grounded) buffered.step(DOWN);
  buffered.step(DOWN);
  assert.ok(close(buffered.fighter.body.vy, -mv.jumpVelocity + CONFIG.sim.gravity * DT), 'the normal jump, Down held or not');
});

test('a Super Jump asked for on the ground keeps its kind in the jump buffer while the fighter cannot act yet', () => {
  // Pressed during an attack's last steps: it comes out as the Super Jump
  // once the attack is over, Down let go meanwhile or not.
  for (const after of [{}, DOWN]) {
    const { fighter, step } = makeFighter();
    step(P('attack1'));
    let n = 0;
    while (fighter.combat.attack && n++ < 200) {
      const left = fighter.combat.attack.def.startup + fighter.combat.attack.def.active + fighter.combat.attack.def.recovery - fighter.combat.attack.time;
      if (left < mv.jumpBuffer - DT && left > 2 * DT) break;
      step({});
    }
    assert.ok(fighter.combat.attack, 'still in the attack');
    step(SUPER);
    stepUntil(step, (f) => !f.grounded, after);
    assert.ok(fighter.body.vy < -mv.jumpVelocity, `the Super Jump (${fighter.body.vy.toFixed(0)})`);
  }
  // Nothing of it is left once the buffer runs out: a later plain press is
  // the normal jump.
  const { fighter, step } = makeFighter();
  step({ ...P('attack1') });
  step(SUPER);
  while (fighter.combat.attack) step({});
  for (let i = 0; i < 20; i++) step({});
  assert.equal(fighter.grounded, true);
  step(JUMP);
  assert.ok(close(fighter.body.vy, -mv.jumpVelocity + CONFIG.sim.gravity * DT), 'a later press: the normal jump');
});

test('the Super Jump keeps every rule of a jump: its sideways speed, both air jumps after it, a hit or landing over it', () => {
  // Out of a run: the run's whole speed into the air, as the normal jump.
  const run = running();
  run.step({ ...RIGHT, ...SUPER });
  assert.equal(run.fighter.body.vx, run.fighter.maxSpeed, 'the run\'s whole speed');
  // Both air jumps after it, the same height as after a normal jump.
  const airAfter = (first) => {
    const { fighter, step } = makeFighter();
    step(first);
    stepUntil(step, (f) => f.body.vy > 0);
    assert.equal(fighter.airJumps, mv.airJumps, 'both air jumps still there');
    const rises = [];
    for (let k = 0; k < mv.airJumps; k++) {
      step(JUMP);
      const from = fighter.body.y;
      let top = from;
      while (fighter.body.vy < 0) {
        step({});
        top = Math.min(top, fighter.body.y);
      }
      rises.push(from - top);
    }
    const vy = fighter.body.vy;
    step(JUMP);
    assert.ok(fighter.body.vy > vy, 'no third');
    return rises;
  };
  const afterSuper = airAfter(SUPER);
  const afterNormal = airAfter(JUMP);
  afterSuper.forEach((rise, k) => assert.ok(close(rise, afterNormal[k], 1e-6), `air jump ${k + 1}: the same after either`));
  // A hit in the rise: full gravity from there, nothing of the jump kept.
  const hit = makeFighter();
  hit.step(SUPER);
  hit.fighter.takeHit({ launchSpeed: 0 });
  const vy = hit.fighter.body.vy;
  hit.step({});
  assert.ok(close(hit.fighter.body.vy - vy, CONFIG.sim.gravity * DT, 1e-6));
  // Landing, then a plain press: the normal jump.
  stepUntil(hit.step, (f) => f.grounded);
  hit.step({});
  hit.step(JUMP);
  assert.ok(close(hit.fighter.body.vy, -mv.jumpVelocity + CONFIG.sim.gravity * DT));
});

test('the Super Jump\'s takeoff is recorded once, where it left the ground; never for a normal jump, an air jump or a refused press', () => {
  const { fighter, step } = makeFighter();
  const x = fighter.body.x;
  step(SUPER);
  assert.deepEqual(
    { x: fighter.superJumpTakeoff.x, y: fighter.superJumpTakeoff.y, ground: fighter.superJumpTakeoff.ground },
    { x, y: 800, ground: STAGE.floor },
  );
  step({ jump: true, down: true });
  assert.equal(fighter.superJumpTakeoff, null, 'one step only');
  const takeoffs = (script, n = 80) => {
    const h = makeFighter();
    let count = 0;
    for (let i = 0; i < n; i++) {
      h.step(script(i, h.fighter));
      if (h.fighter.superJumpTakeoff) count++;
    }
    return count;
  };
  assert.equal(takeoffs((i) => (i === 0 ? JUMP : i === 20 ? SUPER : {})), 0, 'a normal jump, then Down and Jump in the air');
  assert.equal(takeoffs(() => DOWN), 0, 'Down alone');
  assert.equal(takeoffs((i, f) => (i === 0 ? P('attack1') : i === 1 ? { ...SUPER } : {}), 3), 0, 'refused (an attack plays): none yet');
  assert.equal(takeoffs((i) => (i % 2 ? {} : SUPER), 200), takeoffs((i) => (i % 2 ? {} : SUPER), 200), 'deterministic');
  // Each Super Jump its own: two jumps, two takeoffs.
  let landed = 0;
  assert.equal(takeoffs((i, f) => {
    if (f.grounded) landed++;
    return i === 0 || i === 70 ? SUPER : {};
  }, 140), 2);
});

test('two air jumps: past coyote time, from anywhere in the air, each the jump clip from its first frame', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0, { jump: true });
  assert.equal(fighter.state, 'fall');
  assert.equal(fighter.airJumps, 2);
  for (const left of [1, 0]) {
    step(JUMP);
    assert.ok(close(fighter.body.vy, -mv.airJumpVelocity + CONFIG.sim.gravity * DT), 'a fresh jump');
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

test('a hit gives the air jumps back; a stun or an attack in progress holds them for later, but a Deflect gives way to one', () => {
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
  assert.equal(deflect.fighter.airJumps, mv.airJumps - 1, 'the Deflect is cancellable: the air jump goes');
  assert.equal(deflect.fighter.combat.attack, null, 'the Deflect is over');
  // An aerial that has not hit holds it: the jump waits.
  const aerial = makeFighter();
  aerial.step(JUMP);
  stepUntil(aerial.step, (f) => f.body.vy > 0, { jump: true });
  aerial.step({ attack1: true, attack1Pressed: true });
  const record = aerial.fighter.combat.attack;
  aerial.step(JUMP);
  assert.equal(aerial.fighter.combat.attack, record, 'the aerial plays on');
  assert.equal(aerial.fighter.airJumps, mv.airJumps, 'the jump waits');
});

test('the CPUs jump as a player does: the normal jump on a press, the Super Jump with Down on that same step, and the same heights', async () => {
  const { CombatAIController } = await import('../../js/game/ai/combat-ai.js');
  const { TrainingAIController } = await import('../../js/game/fighters/fighter-controller.js');
  const normal = jumpArc(JUMP).apex;
  const high = jumpArc(SUPER).apex;
  const apexWith = (controller, prepare) => {
    const d = duel({ gap: 600 });
    const log = [];
    d.attacker.controller = {
      getInput: (self, dt, ctx) => {
        const out = controller.getInput(self, dt, ctx);
        log.push({ jump: out.jump, jumpPressed: out.jumpPressed, down: out.down, grounded: self.body.grounded });
        return out;
      },
    };
    prepare(d);
    let top = d.attacker.body.y;
    for (let i = 0; i < 70; i++) {
      d.tick();
      top = Math.min(top, d.attacker.body.y);
    }
    const first = log.findIndex((o) => o.jump);
    const run = log.findIndex((o, i) => i > first && !o.jump) - first;
    assert.ok(run >= 1 && run <= 6, `held ${run} steps: a moment, then let go`);
    // Down on the ground only on the press step (a Super Jump's), never
    // standing about.
    for (const [i, o] of log.entries()) if (o.grounded && o.down) assert.ok(o.jumpPressed, `step ${i}: Down only with the press`);
    return { apex: 800 - top, down: log.some((o) => o.down) };
  };
  for (const [jump, want] of [['ground', normal], ['super', high]]) {
    const ai = new CombatAIController({ difficulty: 'hard', rng: () => 0.5 });
    const cpu = apexWith(ai, (d) => {
      ai.neutral = false;
      ai.getInput(d.attacker, DT, { stage: STAGE, gravity: CONFIG.sim.gravity });
      ai.command({ jump, dir: 0 });
    });
    assert.ok(Math.abs(cpu.apex - want) < 2, `the combat AI's ${jump} jump: ${cpu.apex.toFixed(0)} vs ${want.toFixed(0)}`);
    assert.equal(cpu.down, jump === 'super');
  }
  // The training CPU, its jump asked for (as it does to follow or hop).
  for (const [kind, want] of [['normal', normal], ['super', high]]) {
    const training = new TrainingAIController({ rng: () => 0.5 });
    training.thinkTimer = Infinity;
    const hop = apexWith(training, () => { training.wantJump = kind; });
    assert.ok(Math.abs(hop.apex - want) < 2, `the training CPU's ${kind} jump: ${hop.apex.toFixed(0)} vs ${want.toFixed(0)}`);
  }
});
