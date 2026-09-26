// Movement and game feel (see Fighter.moveHorizontal / moveAttack and the
// movement entry in js/data/characters.js): ground acceleration, stopping
// and turning, air steering, jumps that carry their speed, the fast fall,
// the Dash's handoff back into running, how attacks keep, spend and add
// momentum, the facing an attack takes, landing out of an aerial, and
// fixed-step determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { StageCollision } from '../js/game/physics.js';
import { Fighter } from '../js/game/character.js';
import { CONFIG } from '../js/config.js';
import {
  def, DT, makeFighter, fakeSprites, stageMap, stepUntil, duel,
} from './fighter-harness.mjs';

const mv = def.movement;
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const RIGHT = { right: true };
const LEFT = { left: true };
const DOWN = { charge: true };
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

test('ground: top speed in about 0.1 s; letting go stops in under 0.1 s on a short slide, never dead', () => {
  const { fighter, step } = makeFighter();
  const toTop = stepUntil(step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  assert.ok(toTop <= 7, `${toTop} steps to top speed`);
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
  assert.ok(n >= 5 && n <= 9, `a full turn in ${n} steps`);
  const hardest = Math.max(mv.acceleration * mv.turnBoost, mv.deceleration) * DT;
  for (let i = 1; i < log.length; i++) {
    const d = log[i - 1] - log[i];
    assert.ok(d > 0 && d <= hardest + 1e-9, `step ${i}: a change of ${d.toFixed(1)}, never a jump`);
  }
  // Braking against the run is stronger than letting go, and than speeding up.
  assert.ok(log[0] - log[1] > mv.deceleration * DT);
  assert.equal(fighter.facing, -1, 'facing the new way');
});

test('microspacing: taps move a little; run, let go and BA1 lands right beside the opponent', () => {
  const tap = (n) => {
    const { fighter, step } = makeFighter();
    const x = fighter.body.x;
    for (let i = 0; i < n; i++) step(RIGHT);
    for (let i = 0; i < 20; i++) step({});
    return fighter.body.x - x;
  };
  assert.ok(tap(1) < 2, 'a one-step tap barely moves');
  assert.ok(tap(2) < tap(4) && tap(4) < 20, 'longer taps, a little further');

  // Run at an opponent from well away, let go in time, then punch: the
  // stop leaves it inside BA1's reach and short of the pushboxes.
  const d = duel({ gap: 260 });
  let n = 0;
  while (d.target.body.x - d.attacker.body.x > 58 && n++ < 120) d.tick(RIGHT);
  while (d.attacker.body.vx > 0) d.tick();
  const gap = d.target.body.x - d.attacker.body.x;
  assert.ok(gap >= 36 && gap < 57, `stopped at ${gap.toFixed(1)}: no overshoot`);
  d.tick(P('action1'));
  d.until(() => d.events.length > 0, 20);
  assert.equal(d.events[0].move, 'ba1');
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
  while (!hold.fighter.grounded) hold.step(RIGHT);
  assert.ok(hold.fighter.body.x - x > 230, 'a natural forward jump');
});

test('air steering bends the drift: a standing jump can be steered, and reversing in the air is quick but softer than on the ground', () => {
  const stand = makeFighter();
  stand.step(JUMP);
  const toTop = stepUntil(stand.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  assert.ok(toTop <= 9, `${toTop} steps to full air speed`);

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

test('air: faster than top speed (a launch, a jump out of a Dash), holding on never slows the fighter beyond the drag', () => {
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
  const late = (steps) => {
    const { fighter, step } = makeFighter({ x: 1080, y: 600 });
    stepUntil(step, (f) => !f.grounded, RIGHT);
    for (let i = 0; i < steps; i++) step(RIGHT);
    step({ ...RIGHT, ...JUMP });
    return fighter.body.vy < 0;
  };
  const coyote = Math.floor(mv.coyoteTime / DT);
  assert.ok(late(coyote - 2), 'inside coyote time');
  assert.ok(!late(coyote + 2), 'not after it');
  // Jump pressed just before landing: it jumps on touchdown.
  const buffered = (early) => {
    const { fighter, step } = makeFighter();
    step(JUMP);
    while (!fighter.grounded) {
      const landsIn = Math.ceil((800 - fighter.body.y) / Math.max(1, fighter.body.vy * DT));
      step(fighter.body.vy > 0 && landsIn === early ? JUMP : {});
    }
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
  assert.ok(steps < plainSteps * 0.65, `down in ${steps} steps instead of ${plainSteps}`);
});

test('fast fall only while free to fall: never on the ground, in hitstun or behind an air Shield; an aerial attack may', () => {
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

  const shielded = falling();
  shielded.step({ ...DOWN, defense: true });
  assert.equal(shielded.fighter.combat.shielding, true);
  assert.equal(shielded.fighter.fastFalling, false);

  const aerial = falling();
  aerial.step({ ...DOWN, ...P('action2') });
  assert.equal(aerial.fighter.combat.attack?.def.id, 'midairBa2');
  aerial.step(DOWN);
  assert.equal(aerial.fighter.fastFalling, true, 'return to the ground after an aerial');
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

test('after a Dash its burst eases back into the run within a few steps, or into a short slide; never a spike or a dead stop', () => {
  for (const hold of [true, false]) {
    const { fighter, step } = makeFighter();
    step({ ...RIGHT, rightPressed: true });
    step({});
    step({ ...RIGHT, rightPressed: true });
    assert.ok(fighter.dash);
    const energy = fighter.combat.energy;
    assert.equal(energy, 100 - def.energy.dashCost, 'its Energy, once');
    while (fighter.dash) step(hold ? RIGHT : {});
    const log = [fighter.body.vx];
    const x = fighter.body.x;
    for (let i = 0; i < 20; i++) log.push(step(hold ? RIGHT : {}).body.vx);
    for (let i = 1; i < log.length; i++) {
      const d = log[i - 1] - log[i];
      assert.ok(d >= 0 && d <= mv.overspeedDeceleration * DT + 1e-9, `step ${i}: eases by ${d}`);
    }
    if (hold) {
      const settle = log.findIndex((v) => v === fighter.maxSpeed);
      assert.ok(settle > 0 && settle <= 7, `running at top speed ${settle} steps after the Dash`);
      assert.ok(log.slice(settle).every((v) => v === fighter.maxSpeed));
    } else {
      assert.equal(log.at(-1), 0);
      assert.ok(fighter.body.x - x < 70, `a short slide (${(fighter.body.x - x).toFixed(1)})`);
    }
  }
});

test('an attack pressed late in a Dash comes out as it ends, keeping a share of top speed at most: never a lunge', () => {
  const { fighter, step } = makeFighter();
  step({ ...RIGHT, rightPressed: true });
  step({});
  step({ ...RIGHT, rightPressed: true });
  while (fighter.dash.time < fighter.dash.duration - 4 * DT) step({});
  step(P('action1'));
  assert.equal(fighter.combat.attack, null, 'never during the Dash');
  let n = 0;
  while (fighter.dash) {
    step({});
    n++;
  }
  assert.ok(n <= 4);
  assert.equal(fighter.combat.attack?.def.id, 'ba1', 'on the step the Dash ends');
  const ba1 = fighter.attacks.ba1;
  assert.ok(fighter.body.vx <= fighter.maxSpeed * ba1.momentum, `${fighter.body.vx}`);
});

// ---- Attacks and momentum ---------------------------------------------------------

test('running into BA1 keeps its momentum share and slides on it under its own friction: no invisible wall', () => {
  const ba1 = def.attacks.ba1;
  const { fighter, step } = running();
  step({ ...RIGHT, ...P('action1') });
  assert.equal(fighter.combat.attack.def.id, 'ba1');
  assert.ok(close(fighter.body.vx, fighter.maxSpeed * ba1.momentum - mv.deceleration * ba1.friction * DT), 'kept, then its friction');
  const x = fighter.body.x;
  const log = [];
  for (step(RIGHT); fighter.state === 'attack'; step(RIGHT)) log.push(fighter.body.vx);
  assert.ok(fighter.body.x - x > 12, 'it carries on through the punch');
  for (let i = 1; i < log.length; i++) assert.ok(log[i] <= log[i - 1], 'never speeding up: no steering');
  // Standing still, it never moves, whatever is held.
  const still = makeFighter();
  const x0 = still.fighter.body.x;
  for (still.step(P('action1')); still.fighter.state === 'attack'; still.step(RIGHT)) {
    assert.equal(still.fighter.body.x, x0);
  }
});

test('BA2 steps in on its first frame; the Throw keeps half a run and may be steered back while its facing holds', () => {
  const ba2 = def.attacks.ba2;
  const { fighter, step } = makeFighter();
  step(P('action2'));
  assert.ok(close(fighter.body.vx, ba2.step.speed - mv.deceleration * ba2.friction * DT), 'its step-in');
  const x = fighter.body.x;
  while (fighter.state === 'attack') step({});
  assert.ok(fighter.body.x - x > 10 && fighter.body.x - x < 30, 'a subtle step forward');
  // Facing left, it steps left.
  const left = makeFighter({ facing: -1 });
  left.step(P('action2'));
  assert.ok(left.fighter.body.vx < 0);

  const thr = def.attacks.throw;
  const t = running();
  t.step({ ...RIGHT, ...P('primary') });
  assert.equal(t.fighter.combat.attack.def.id, 'throw');
  const kept = t.fighter.body.vx;
  assert.ok(kept > 0 && kept < t.fighter.maxSpeed * thr.momentum);
  let backing = false;
  for (t.step(LEFT); t.fighter.state === 'attack'; t.step(LEFT)) {
    assert.equal(t.fighter.facing, 1);
    backing ||= t.fighter.body.vx < 0;
  }
  assert.ok(backing, 'backing off while it throws');
});

test('aerials keep their drift and steer with their airControl; landing keeps only what is left of them', () => {
  const { fighter, step } = running();
  step({ ...RIGHT, ...JUMP });
  step({ ...RIGHT, ...P('action1') });
  const atk = fighter.combat.attack;
  assert.equal(atk.def.id, 'midairBa1');
  // Its whole drift (airMomentum 1), above its own steering cap: only the
  // air drag eases it, holding on or not.
  assert.ok(close(fighter.body.vx, fighter.maxSpeed - mv.airDeceleration * DT), 'its whole drift');
  // Steering with 60% of the air control: capped at that share of top speed.
  for (let i = 0; i < 4; i++) step(LEFT);
  assert.ok(fighter.body.vx < fighter.maxSpeed - 4 * mv.airDeceleration * DT, 'steered');
  // A mid-air BA2 started just before touchdown keeps its own clip after
  // landing, then the fighter acts at once: no extra lock.
  const low = makeFighter();
  low.step(JUMP);
  while (low.fighter.body.vy < 0 || low.fighter.body.y < 790) low.step();
  low.step(P('action2'));
  const kick = low.fighter.combat.attack;
  assert.equal(kick.def.id, 'midairBa2');
  let steps = 0;
  let landed = false;
  while (low.fighter.combat.attack === kick) {
    low.step();
    steps++;
    landed ||= low.fighter.grounded;
  }
  assert.ok(landed, 'landed during it');
  assert.equal(steps, Math.round(kick.def.total / DT), 'its own length, not restarted');
  low.step(P('action1'));
  assert.equal(low.fighter.combat.attack?.def.id, 'ba1', 'free on the very next step');
});

test('attack movement is data with defaults: an attack that declares none is planted; lockMovement false keeps locomotion', () => {
  const plain = { animation: 'ba1', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 1, hitbox: def.attacks.ba1.hitbox };
  const character = {
    ...def,
    attacks: { ...def.attacks, plain, free: { ...plain, lockMovement: false } },
    actions: { ...def.actions, action1: 'plain', action2: 'free' },
  };
  const a = running({ character });
  a.step({ ...RIGHT, ...P('action1') });
  assert.equal(a.fighter.combat.attack.def.id, 'plain');
  assert.ok(close(a.fighter.body.vx, a.fighter.maxSpeed - mv.deceleration * DT), 'all its speed, normal friction');
  a.step(LEFT);
  assert.ok(close(a.fighter.body.vx, a.fighter.maxSpeed - 2 * mv.deceleration * DT), 'no steering');

  const b = running({ character });
  b.step({ ...RIGHT, ...P('action2') });
  assert.equal(b.fighter.combat.attack.def.id, 'free');
  assert.equal(b.fighter.body.vx, b.fighter.maxSpeed, 'still running');
  assert.equal(b.fighter.moveDir, 1);
});

// ---- Facing -----------------------------------------------------------------------

test('an attack faces the direction held as it starts: run left, reverse and BA1 on one step strikes right, then holds', () => {
  const { fighter, step } = makeFighter();
  for (let i = 0; i < 20; i++) step(LEFT);
  assert.equal(fighter.facing, -1);
  step({ ...RIGHT, ...P('action1') });
  assert.equal(fighter.combat.attack.def.id, 'ba1');
  assert.equal(fighter.facing, 1, 'the way the player turned');
  for (step(LEFT); fighter.state === 'attack'; step(LEFT)) assert.equal(fighter.facing, 1, 'fixed for the whole attack');
  // With no direction held, the attack keeps the fighter's facing.
  const idle = makeFighter({ facing: -1 });
  idle.step(P('action2'));
  assert.equal(idle.fighter.facing, -1);
  // The strike lands on the side it faces.
  const d = duel({ gap: 44 });
  for (let i = 0; i < 10; i++) d.tick(LEFT);
  d.attacker.body.x = d.target.body.x - 44;
  d.attacker.body.vx = -60;
  d.tick({ ...RIGHT, ...P('action1') });
  d.until(() => d.events.length > 0, 20);
  assert.equal(d.events[0].move, 'ba1');
});

// ---- Determinism ------------------------------------------------------------------

test('fixed-step determinism: the same inputs give the same fight, step for step', () => {
  const script = (i) => {
    const k = i % 97;
    return {
      right: k < 30 || (k > 60 && k < 70), left: k > 40 && k < 50,
      jump: k === 33, jumpPressed: k === 33,
      charge: k > 34 && k < 45,
      action1: k === 20 || k === 36, action1Pressed: k === 20 || k === 36,
      action2: k === 26 || k === 52, action2Pressed: k === 26 || k === 52,
      primary: k === 80, primaryPressed: k === 80,
      rightPressed: k === 0 || k === 61 || k === 63,
    };
  };
  // The target plays the same script mirrored, so the two meet and fight.
  const mirror = (h) => ({ ...h, left: h.right, right: h.left, leftPressed: h.rightPressed, rightPressed: false });
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
  const { Battle } = await import('../js/game/battle.js');
  const { getMap } = await import('../js/data/maps.js');
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
        return { right: k < 25, left: k > 40, jump: k === 30, jumpPressed: k === 30, action1: k === 10, action1Pressed: k === 10 };
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

test('the Sphere Rush still owns its own movement: its authored rush speed, whatever the new locomotion', () => {
  const d = duel({ gap: 600 });
  d.tick({ charge: true });
  d.tick({ charge: true, ...P('action2') });
  assert.ok(d.attacker.technique);
  d.until(() => d.attacker.technique?.phase === 'dash', 60);
  d.tick({ left: true });
  assert.equal(d.attacker.body.vx, def.chargedTechniques.rasenRush.dashSpeed, 'held input ignored');
});

test('a fresh Fighter with a character that declares no new movement stats still moves (the old fields suffice)', () => {
  const { overspeedDeceleration, airTurnBoost, fastFallAcceleration, fastFallSpeed, attackBuffer, hitstunFriction, hitstunAirDrag, ...old } = def.movement;
  const character = { ...def, movement: old };
  const stage = new StageCollision(stageMap());
  const fighter = new Fighter({
    def: character, sprites: fakeSprites(), stage, slot: 0, label: 'P1', controller: null, spawn: { x: 500, facing: 1 },
  });
  const ctx = { stage, gravity: CONFIG.sim.gravity };
  fighter.body.vx = 900;
  fighter.update(DT, ctx);
  assert.ok(fighter.body.vx < 900 && fighter.body.vx > 0, 'slows under the deceleration');
  assert.equal(fighter.bufferedAttack, null);
});
