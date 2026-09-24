// Run with node --test tests/powers.test.mjs (no dependencies).
// The Power system (js/data/powers.js): the registry of fighter Powers (Jump,
// Speed) and attack Powers (Horizontal and Vertical Knockback), their frozen
// tier tables and resolvers, and #0001's Jump Power 2 and Speed Power 2. The
// shared Fighter takes its jump strength and top speed from those tiers for
// player and CPU fighters alike, while gravity, falling, coyote time, the jump
// buffer, acceleration, knockback, projectiles, techniques and every other
// movement stat stay independent of them. Attack definitions turn their
// knockback Powers into numeric knockback once, when they are created;
// Vertical Knockback is signed (a positive tier launches upward, a negative
// one drives the target downward at the same tier's magnitude). Runs the
// real Fighter, physics and combat (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POWERS, FIGHTER_POWERS, ATTACK_POWERS,
  JUMP_POWER_TIERS, SPEED_POWER_TIERS, HORIZONTAL_KNOCKBACK_POWER_TIERS, VERTICAL_KNOCKBACK_POWER_TIERS,
  getPower, getPowerTier, getFighterPowerTier, getJumpPowerTier, getJumpVelocity, getSpeedPowerTier, getMaxSpeed,
  getAttackPowerTier, getHorizontalKnockback, getVerticalKnockback, getAttackKnockback,
} from '../js/data/powers.js';
import { CHARACTERS } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { spawnProjectiles } from '../js/game/projectile.js';
import { PlayerController, TrainingAIController } from '../js/game/fighter-controller.js';
import { CONFIG } from '../js/config.js';
import { def, DT, STAGE, SIM_CTX, fakeSprites, makeFighter, stepUntil } from './fighter-harness.mjs';

const JUMP = { jump: true, jumpPressed: true };
const RIGHT = { right: true };
// One step with gravity switched off: the velocity the jump itself set,
// before any gravity is integrated.
const NO_GRAVITY = { stage: STAGE, gravity: 0 };

// #0001 with another Jump Power or Speed Power tier and nothing else changed.
const withJump = (tier) => ({ ...def, powers: { ...def.powers, jump: tier } });
const withSpeed = (tier) => ({ ...def, powers: { ...def.powers, speed: tier } });

const SPEEDS = [[1, 270], [2, 330], [3, 360]];

// Holds `held` until horizontal speed stops changing; returns the settled vx.
function settledSpeed(step, fighter, held = RIGHT) {
  let vx = NaN;
  for (let i = 0; i < 600; i++) {
    step(held);
    if (fighter.body.vx === vx) return vx;
    vx = fighter.body.vx;
  }
  throw new Error('speed never settled');
}

// Silences and collects console.warn while `fn` runs.
function warnings(fn) {
  const original = console.warn;
  const out = [];
  console.warn = (...args) => out.push(args.join(' '));
  try {
    return { value: fn(), warnings: out };
  } finally {
    console.warn = original;
  }
}

// A Fighter on the harness stage with `controller`, stepped with `ctx`.
function fighterWith(character, controller, x = 500) {
  return new Fighter({
    def: character, sprites: fakeSprites(), stage: STAGE, slot: 0, label: 'P1', controller,
    spawn: { x, facing: 1 },
  });
}

// Highest point (smallest y) a standing jump reaches, and the steps it took.
function apexOf(character) {
  const { fighter, step } = makeFighter({ character });
  const ground = fighter.body.y;
  step(JUMP);
  let top = fighter.body.y;
  let steps = 1;
  while (!fighter.grounded) {
    step();
    top = Math.min(top, fighter.body.y);
    steps++;
    assert.ok(steps < 600, 'lands again');
  }
  return { height: ground - top, airSteps: steps };
}

// ---- Jump Power ------------------------------------------------------------------

test('Jump Power has exactly three tiers: 650, 920 and 1000', () => {
  assert.deepEqual(JUMP_POWER_TIERS.map((t) => [t.tier, t.name, t.description, t.jumpVelocity]), [
    [1, 'Jump Power 1', 'Very low jump.', 650],
    [2, 'Jump Power 2', 'Normal jump.', 920],
    [3, 'Jump Power 3', 'Slightly higher jump.', 1000],
  ]);
  assert.equal(getPowerTier('jump', 1).jumpVelocity, 650);
  assert.equal(getPowerTier('jump', 2).jumpVelocity, 920);
  assert.equal(getPowerTier('jump', 3).jumpVelocity, 1000);
  assert.equal(getPowerTier('jump', 0), null);
  assert.equal(getPowerTier('jump', 4), null);
  assert.equal(getPowerTier('unknown', 1), null);
});

test('Jump Power tiers are strictly ordered: 1 < 2 < 3', () => {
  const [one, two, three] = [1, 2, 3].map((tier) => getPowerTier('jump', tier).jumpVelocity);
  assert.ok(one < two && two < three);
  for (let i = 1; i < JUMP_POWER_TIERS.length; i++) {
    assert.ok(JUMP_POWER_TIERS[i].jumpVelocity > JUMP_POWER_TIERS[i - 1].jumpVelocity);
  }
});

// ---- Registry ------------------------------------------------------------------

test('POWERS is the one registry of Power types: four Powers in two scopes, frozen, each with tiers 1, 2 and 3', () => {
  assert.deepEqual(POWERS.map((p) => p.id), ['jump', 'speed', 'horizontalKnockback', 'verticalKnockback']);
  assert.deepEqual(POWERS.map((p) => p.name), ['Jump Power', 'Speed Power', 'Horizontal Knockback Power', 'Vertical Knockback Power']);
  assert.deepEqual(POWERS.map((p) => [p.id, p.scope]), [
    ['jump', 'fighter'], ['speed', 'fighter'], ['horizontalKnockback', 'attack'], ['verticalKnockback', 'attack'],
  ]);
  assert.deepEqual(FIGHTER_POWERS.map((p) => p.id), ['jump', 'speed']);
  assert.deepEqual(ATTACK_POWERS.map((p) => p.id), ['horizontalKnockback', 'verticalKnockback']);
  assert.deepEqual(POWERS.map((p) => p.tiers), [
    JUMP_POWER_TIERS, SPEED_POWER_TIERS, HORIZONTAL_KNOCKBACK_POWER_TIERS, VERTICAL_KNOCKBACK_POWER_TIERS,
  ]);
  for (const power of POWERS) {
    assert.ok(power.id && power.name && power.summary);
    assert.equal(getPower(power.id), power);
    assert.deepEqual(power.tiers.map((t) => t.tier), [1, 2, 3], `${power.id} has exactly tiers 1, 2 and 3`);
    assert.deepEqual(power.tiers.map((t) => t.name), [1, 2, 3].map((n) => `${power.name} ${n}`));
    assert.ok(power.tiers.every((t) => typeof t.description === 'string' && t.description.endsWith('.')));
    assert.equal(power.defaultTier, 2, `${power.id} falls back to its normal tier`);
    assert.ok(Object.isFrozen(power) && Object.isFrozen(power.tiers) && power.tiers.every(Object.isFrozen), `${power.id} is frozen`);
    // Player-facing copy is mechanics only: no fighter is ever named.
    for (const text of [power.name, power.summary, ...power.tiers.flatMap((t) => [t.name, t.description])]) {
      assert.doesNotMatch(text, /#\d{4}/, text);
      for (const character of CHARACTERS) assert.ok(!text.includes(character.displayName), text);
    }
  }
  assert.ok(Object.isFrozen(POWERS) && Object.isFrozen(FIGHTER_POWERS) && Object.isFrozen(ATTACK_POWERS));
  assert.equal(getPower('nope'), null);
  assert.deepEqual(POWERS.map((p) => p.summary), [
    'Controls how high a normal jump goes. Higher tiers jump higher.',
    'Controls maximum movement speed. Higher tiers move faster.',
    'Controls how strongly an attack pushes a hit opponent sideways. Higher tiers push farther.',
    'Controls how strongly an attack launches a hit opponent upward or drives it downward. Higher tiers hit harder.',
  ]);
  // Only Vertical Knockback takes a signed tier.
  assert.deepEqual(POWERS.filter((p) => p.signed).map((p) => p.id), ['verticalKnockback']);
});

test('fighter resolvers read fighter Powers only; attack resolvers attack Powers only', () => {
  const attack = { id: 'probe', powers: { horizontalKnockback: 2, verticalKnockback: 2 } };
  const fighter = { ...def, powers: { ...def.powers, horizontalKnockback: 3 } };
  for (const power of ATTACK_POWERS) assert.equal(getFighterPowerTier(fighter, power.id), null, power.id);
  for (const power of FIGHTER_POWERS) assert.equal(getAttackPowerTier({ ...attack, powers: { [power.id]: 2 } }, power.id), null, power.id);
  assert.equal(getAttackPowerTier(attack, 'unknown'), null);
  assert.equal(getFighterPowerTier(def, 'speed'), getSpeedPowerTier(def));
});

// ---- #0001 ------------------------------------------------------------------------

test('#0001 declares Jump Power 2 and Speed Power 2, which resolve to its original 920 and 330', () => {
  assert.deepEqual(def.powers, { jump: 2, speed: 2 });
  assert.equal(getJumpPowerTier(def), getPowerTier('jump', 2));
  assert.equal(getFighterPowerTier(def, 'jump').name, 'Jump Power 2');
  assert.equal(getJumpVelocity(def), 920);
  assert.equal('jumpVelocity' in def.movement, false, 'the tier is the only source of the jump strength');
  assert.equal(getSpeedPowerTier(def), getPowerTier('speed', 2));
  assert.equal(getFighterPowerTier(def, 'speed').name, 'Speed Power 2');
  assert.equal(getMaxSpeed(def), 330);
  assert.equal('maxSpeed' in def.movement, false, 'the tier is the only source of the top speed');
  // Every roster fighter owns a valid tier of every fighter Power, and no
  // attack Power: those belong to its attacks.
  for (const character of CHARACTERS) {
    for (const power of FIGHTER_POWERS) {
      assert.ok(power.tiers.some((t) => t.tier === character.powers?.[power.id]), `${character.displayName} ${power.name}`);
    }
    for (const power of ATTACK_POWERS) assert.equal(power.id in character.powers, false, `${character.displayName} ${power.id}`);
  }
});

test('a normal #0001 jump still starts at exactly -920, then falls under the unchanged gravity', () => {
  const { fighter } = makeFighter();
  assert.equal(fighter.jumpVelocity, 920);
  fighter.controller = { getInput: () => JUMP };
  fighter.update(DT, NO_GRAVITY);
  assert.equal(fighter.body.vy, -920, 'before gravity is integrated');
  assert.equal(fighter.grounded, false);
  assert.equal(fighter.state, 'jump');

  // With Alva's gravity the jump step also integrates one step of it.
  const real = makeFighter();
  real.step(JUMP);
  assert.equal(real.fighter.body.vy, -920 + CONFIG.sim.gravity * def.movement.gravityScale * DT);
  assert.equal(CONFIG.sim.gravity, 2500);
});

// ---- Other tiers --------------------------------------------------------------

test('fighters configured with Jump Power 1 or 3 receive that tier\'s jump', () => {
  for (const [tier, velocity] of [[1, 650], [2, 920], [3, 1000]]) {
    const { fighter } = makeFighter({ character: withJump(tier) });
    assert.equal(fighter.jumpVelocity, velocity);
    fighter.controller = { getInput: () => JUMP };
    fighter.update(DT, NO_GRAVITY);
    assert.equal(fighter.body.vy, -velocity, `Jump Power ${tier}`);
  }
});

test('Jump Power 1 is dramatically lower than the normal jump; Jump Power 3 only a little higher', () => {
  const [low, normal, high] = [1, 2, 3].map((tier) => apexOf(withJump(tier)));
  assert.ok(low.height < normal.height && normal.height < high.height);
  assert.ok(low.height < normal.height * 0.6, `tier 1 ${low.height.toFixed(1)} vs ${normal.height.toFixed(1)}`);
  assert.ok(high.height > normal.height * 1.05 && high.height < normal.height * 1.3, `tier 3 ${high.height.toFixed(1)}`);
  assert.ok(low.airSteps < normal.airSteps && normal.airSteps < high.airSteps);
});

test('Jump Power changes nothing but the jump\'s initial speed: gravity, fall speed and movement stats are shared', () => {
  const fighters = [1, 2, 3].map((tier) => makeFighter({ character: withJump(tier) }));
  for (const { fighter } of fighters) {
    assert.equal(fighter.def.movement, def.movement, 'the same movement data');
    assert.equal(fighter.body.gravityScale, def.movement.gravityScale);
    assert.equal(fighter.body.maxFall, def.movement.maxFallSpeed);
  }
  // The same run-up and jump: horizontal motion is identical step for step,
  // and every airborne step applies the same gravity.
  const right = { right: true };
  const logs = fighters.map(({ fighter, step }) => {
    for (let i = 0; i < 20; i++) step(right);
    step({ ...right, ...JUMP });
    const log = [];
    while (!fighter.grounded) {
      const vy = fighter.body.vy;
      step(right);
      log.push({ vx: fighter.body.vx, x: fighter.body.x, dvy: fighter.grounded ? null : fighter.body.vy - vy });
    }
    return log;
  });
  const shortest = Math.min(...logs.map((l) => l.length));
  for (let i = 0; i < shortest - 1; i++) {
    assert.equal(logs[0][i].vx, logs[2][i].vx, `vx at step ${i}`);
    assert.equal(logs[0][i].x, logs[2][i].x, `x at step ${i}`);
    for (const log of logs) {
      assert.ok(Math.abs(log[i].dvy - CONFIG.sim.gravity * DT) < 1e-9, 'gravity per step');
    }
  }
  assert.equal(CONFIG.sim.gravity, 2500, 'global gravity is untouched');
});

// Coyote time and the jump buffer for `character`, whose normal jump starts
// at `velocity`: a jump just inside coyote time works and one just past it
// does not; a press buffered just before touchdown jumps on landing and one
// pressed too early has expired.
function checkCoyoteAndBuffer(character, velocity, label) {
  const coyoteSteps = Math.floor(def.movement.coyoteTime / DT);
  const bufferSteps = Math.floor(def.movement.jumpBuffer / DT);

  // Walk off the ledge, then jump while coyote time remains.
  const ledge = makeFighter({ character, x: 1000, y: 600 });
  assert.equal(ledge.fighter.body.ground.id, 'ledge');
  stepUntil(ledge.step, (f) => !f.grounded, RIGHT);
  for (let i = 0; i < coyoteSteps - 1; i++) ledge.step(RIGHT);
  ledge.fighter.controller = { getInput: () => JUMP };
  ledge.fighter.update(DT, NO_GRAVITY);
  assert.equal(ledge.fighter.body.vy, -velocity, `${label}: a coyote-time jump`);

  // Past coyote time, the same press does not jump.
  const late = makeFighter({ character, x: 1000, y: 600 });
  stepUntil(late.step, (f) => !f.grounded, RIGHT);
  for (let i = 0; i < coyoteSteps + 2; i++) late.step(RIGHT);
  const vy = late.fighter.body.vy;
  late.fighter.controller = { getInput: () => JUMP };
  late.fighter.update(DT, NO_GRAVITY);
  assert.equal(late.fighter.body.vy, vy, `${label}: no jump after coyote time`);

  // Pressed a few steps before touchdown, the buffered press jumps on the
  // step after landing; pressed too early, it has expired by then.
  const ref = makeFighter({ character });
  ref.step(JUMP);
  const airborne = stepUntil(ref.step, (f) => f.grounded);
  for (const [early, jumps] of [[bufferSteps - 2, true], [bufferSteps + 3, false]]) {
    const run = makeFighter({ character });
    run.step(JUMP);
    for (let i = 1; i < airborne - early; i++) run.step();
    run.step(JUMP);
    stepUntil(run.step, (f) => f.grounded);
    run.step();
    assert.equal(!run.fighter.grounded, jumps, `${label}: pressed ${early} steps before landing`);
    if (jumps) assert.equal(run.fighter.body.vy, -velocity + CONFIG.sim.gravity * def.movement.gravityScale * DT);
  }
}

test('coyote time and the jump buffer work the same for every Jump Power tier', () => {
  for (const tier of [1, 2, 3]) {
    checkCoyoteAndBuffer(withJump(tier), getPowerTier('jump', tier).jumpVelocity, `Jump Power ${tier}`);
  }
});

test('knockback and launches ignore Jump Power: tier 1 and tier 3 targets fly identically', () => {
  const launch = createAttackDefinition({
    id: 'launch', animation: 'ba1', startup: 0, active: DT, recovery: 0,
    damage: 5, knockback: { x: 260, y: 480 }, hitstun: 0.4, hitstop: 0,
  });
  const flights = [1, 3].map((tier) => {
    const attacker = makeFighter({ x: 400 });
    const target = makeFighter({ character: withJump(tier), x: 460, facing: -1 });
    new CombatSystem().applyHit(attacker.fighter, target.fighter, launch);
    assert.equal(target.fighter.body.vy, -480, 'the launch is the attack\'s own');
    const path = [];
    while (target.fighter.combat.stun > 0 || !target.fighter.grounded) {
      target.step();
      path.push([target.fighter.body.x, target.fighter.body.y, target.fighter.body.vy]);
      assert.ok(path.length < 600);
    }
    return path;
  });
  assert.deepEqual(flights[0], flights[1]);
});

// ---- One Fighter for player and CPU ------------------------------------------

test('the same Fighter jump serves player- and CPU-controlled fighters, with the tier each declares', () => {
  for (const tier of [1, 2, 3]) {
    const character = withJump(tier);
    const velocity = getPowerTier('jump', tier).jumpVelocity;

    const input = { sample: () => ({ ...JUMP }) };
    const player = fighterWith(character, new PlayerController(input), 400);

    const ai = new TrainingAIController({ rng: () => 0.5 });
    ai.thinkTimer = 10; // no decisions of its own this step
    ai.wantJump = true;
    const cpu = fighterWith(character, ai, 700);
    player.opponent = cpu;
    cpu.opponent = player;

    for (const fighter of [player, cpu]) {
      assert.ok(fighter instanceof Fighter);
      assert.equal(fighter.update, Fighter.prototype.update, 'no separate player or CPU jump');
      assert.equal(fighter.jumpVelocity, velocity);
      fighter.update(DT, NO_GRAVITY);
      assert.equal(fighter.body.vy, -velocity, `${fighter.controller.kind} at Jump Power ${tier}`);
    }
  }
});

// ---- Malformed data -----------------------------------------------------------

test('a fighter with no valid Jump Power falls back, logged, to the normal jump', () => {
  const { powers, ...bare } = def;
  for (const [character, label] of [
    [bare, 'no powers'],
    [{ ...def, powers: {} }, 'no jump tier'],
    [{ ...def, powers: { jump: 7 } }, 'an unknown tier'],
    [{ ...def, powers: { jump: '2' } }, 'a tier that is not a number'],
  ]) {
    const { value, warnings: logged } = warnings(() => getJumpPowerTier(character));
    assert.equal(value, getPowerTier('jump', 2), label);
    assert.equal(logged.length, 1, `${label} is logged`);
    assert.match(logged[0], /Jump Power/);
    const built = warnings(() => makeFighter({ character }).fighter);
    assert.equal(built.value.jumpVelocity, 920, `${label}: still a playable jump`);
  }
  // Valid data never warns.
  assert.deepEqual(warnings(() => getJumpVelocity(def)).warnings, []);
  assert.equal(getFighterPowerTier(def, 'unknown'), null);
});

test('only the jump reads Jump Power: a fighter at rest or running has the same body with any tier', () => {
  for (const tier of [1, 3]) {
    const a = makeFighter();
    const b = makeFighter({ character: withJump(tier) });
    for (let i = 0; i < 40; i++) {
      const held = i < 25 ? { right: true } : {};
      a.step(held);
      b.step(held);
      assert.deepEqual(
        { x: b.fighter.body.x, y: b.fighter.body.y, vx: b.fighter.body.vx, vy: b.fighter.body.vy, state: b.fighter.state },
        { x: a.fighter.body.x, y: a.fighter.body.y, vx: a.fighter.body.vx, vy: a.fighter.body.vy, state: a.fighter.state },
      );
    }
  }
  assert.ok(SIM_CTX.gravity === CONFIG.sim.gravity);
});

test('Speed Power and Jump Power are independent of each other', () => {
  for (const tier of [1, 3]) {
    const jumper = makeFighter({ character: withJump(tier) }).fighter;
    assert.equal(jumper.maxSpeed, 330, `Jump Power ${tier} keeps Speed Power 2`);
    const runner = makeFighter({ character: withSpeed(tier) }).fighter;
    assert.equal(runner.jumpVelocity, 920, `Speed Power ${tier} keeps Jump Power 2`);
    assert.deepEqual(apexOf(withSpeed(tier)), apexOf(def), `Speed Power ${tier}: the same jump height and airtime`);
  }
});

// ---- Speed Power --------------------------------------------------------------

test('Speed Power has exactly three tiers: 270, 330 and 360', () => {
  assert.deepEqual(SPEED_POWER_TIERS.map((t) => [t.tier, t.name, t.description, t.maxSpeed]), [
    [1, 'Speed Power 1', 'Slow.', 270],
    [2, 'Speed Power 2', 'Normal speed.', 330],
    [3, 'Speed Power 3', 'Slightly faster.', 360],
  ]);
  for (const [tier, speed] of SPEEDS) assert.equal(getPowerTier('speed', tier).maxSpeed, speed);
  assert.equal(getPowerTier('speed', 0), null);
  assert.equal(getPowerTier('speed', 4), null);
});

test('Speed Power tiers are strictly ordered: tier 1 clearly slower, tier 3 only moderately faster', () => {
  const [slow, normal, fast] = [1, 2, 3].map((tier) => getPowerTier('speed', tier).maxSpeed);
  assert.ok(slow < normal && normal < fast);
  assert.ok(slow <= normal * 0.85, 'tier 1 is clearly slower');
  assert.ok(fast > normal && fast <= normal * 1.15, 'tier 3 is not a dramatic boost');
});

test('a held run caps at exactly the tier\'s top speed, on the ground and in the air', () => {
  for (const [tier, speed] of SPEEDS) {
    const character = withSpeed(tier);
    const right = makeFighter({ character });
    assert.equal(right.fighter.maxSpeed, speed);
    assert.equal(settledSpeed(right.step, right.fighter), speed, `Speed Power ${tier} right`);
    assert.equal(right.fighter.state, 'run');
    const left = makeFighter({ character });
    assert.equal(settledSpeed(left.step, left.fighter, { left: true }), -speed, `Speed Power ${tier} left`);

    // The same target in the air: from a standing jump, air control builds
    // up to the tier's speed and no further.
    const air = makeFighter({ character });
    air.step(JUMP);
    let top = 0;
    while (!air.fighter.grounded) {
      air.step(RIGHT);
      top = Math.max(top, air.fighter.body.vx);
    }
    assert.equal(top, speed, `Speed Power ${tier} in the air`);
  }
  // #0001 itself: exactly its original 330.
  const { fighter, step } = makeFighter();
  assert.equal(settledSpeed(step, fighter), 330);
});

test('Speed Power changes only the top speed: acceleration, deceleration, air control and the turn boost are shared', () => {
  const mv = def.movement;
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  // Each step's change in vx while it is still short of its target.
  const deltas = (step, fighter, held, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const vx = fighter.body.vx;
      step(held);
      out.push(fighter.body.vx - vx);
    }
    return out;
  };
  for (const [tier, speed] of SPEEDS) {
    const character = withSpeed(tier);
    const label = `Speed Power ${tier}`;
    const { fighter, step } = makeFighter({ character });
    assert.equal(fighter.def.movement, mv, 'the same movement data');

    // Ground acceleration from rest, the same per step until the cap.
    const accel = Math.floor(speed / (mv.acceleration * DT));
    assert.ok(deltas(step, fighter, RIGHT, accel).every((d) => close(d, mv.acceleration * DT)), `${label}: acceleration`);
    settledSpeed(step, fighter);
    // The turn boost on the first step against the run.
    const [turn] = deltas(step, fighter, { left: true }, 1);
    assert.ok(close(turn, -mv.acceleration * mv.turnBoost * DT), `${label}: turn boost`);
    // Ground deceleration from the tier's top speed.
    settledSpeed(step, fighter);
    const decel = Math.floor(speed / (mv.deceleration * DT));
    assert.ok(deltas(step, fighter, {}, decel).every((d) => close(d, -mv.deceleration * DT)), `${label}: deceleration`);

    // Air acceleration from a standing jump, then the gentle air drag.
    const air = makeFighter({ character });
    air.step(JUMP);
    const airAccel = Math.floor(speed / (mv.airAcceleration * DT));
    assert.ok(deltas(air.step, air.fighter, RIGHT, airAccel).every((d) => close(d, mv.airAcceleration * DT)), `${label}: air acceleration`);
    assert.ok(deltas(air.step, air.fighter, {}, 5).every((d) => close(d, -mv.airDeceleration * DT)), `${label}: air deceleration`);
  }
});

test('Speed Power changes nothing vertical: jump, gravity, fall speed, coyote time and the jump buffer', () => {
  const reference = makeFighter();
  reference.step(JUMP);
  const path = [];
  while (!reference.fighter.grounded) path.push([reference.fighter.body.y, reference.fighter.body.vy, reference.step().state]);
  for (const tier of [1, 3]) {
    const character = withSpeed(tier);
    const { fighter, step } = makeFighter({ character });
    assert.equal(fighter.jumpVelocity, 920);
    assert.equal(fighter.body.gravityScale, def.movement.gravityScale);
    assert.equal(fighter.body.maxFall, def.movement.maxFallSpeed);
    step(JUMP);
    const own = [];
    while (!fighter.grounded) own.push([fighter.body.y, fighter.body.vy, step().state]);
    assert.deepEqual(own, path, `Speed Power ${tier}: the same jump, rise and fall`);
    checkCoyoteAndBuffer(character, 920, `Speed Power ${tier}`);
  }
  assert.equal(CONFIG.sim.gravity, 2500, 'global gravity is untouched');
});

// A ground Dodge from standing: how many steps it lasts, how far it moved.
function dodgeFrom(character) {
  const { fighter, step } = makeFighter({ character });
  const x = fighter.body.x;
  step({ defense: true, defensePressed: true });
  assert.equal(fighter.state, 'defense');
  const steps = stepUntil(step, (f) => !f.combat.defenseAction);
  return { steps, moved: fighter.body.x - x };
}

test('Speed Power leaves every other velocity alone: knockback received, the shuriken, the Sphere Rush and Dodges', () => {
  // Knockback and launches received: tier 1 and tier 3 targets fly alike.
  const launch = createAttackDefinition({
    id: 'launch', animation: 'ba1', startup: 0, active: DT, recovery: 0,
    damage: 5, knockback: { x: 260, y: 480 }, hitstun: 0.4, hitstop: 0,
  });
  const flights = [1, 3].map((tier) => {
    const attacker = makeFighter({ x: 400 });
    const target = makeFighter({ character: withSpeed(tier), x: 460, facing: -1 });
    new CombatSystem().applyHit(attacker.fighter, target.fighter, launch);
    assert.deepEqual([target.fighter.body.vx, target.fighter.body.vy], [260, -480]);
    const path = [];
    while (target.fighter.combat.stun > 0 || !target.fighter.grounded) {
      target.step();
      path.push([target.fighter.body.x, target.fighter.body.y]);
      assert.ok(path.length < 600);
    }
    return path;
  });
  assert.deepEqual(flights[0], flights[1]);

  for (const [tier] of SPEEDS) {
    const character = withSpeed(tier);
    const label = `Speed Power ${tier}`;

    // The shuriken flies at its own 700.
    const thrower = makeFighter({ character });
    const projectiles = [];
    for (let i = 0; i < 30 && !projectiles.length; i++) {
      thrower.step(i === 0 ? { primary: true, primaryPressed: true } : {});
      spawnProjectiles([thrower.fighter], projectiles);
    }
    assert.equal(projectiles.length, 1);
    assert.equal(projectiles[0].vx, def.projectiles.shuriken.speed, label);
    assert.equal(def.projectiles.shuriken.speed, 700);

    // The Sphere Rush dashes at its own 1050.
    const rusher = makeFighter({ character });
    rusher.step({ charge: true });
    rusher.step({ charge: true, action2: true, action2Pressed: true });
    const technique = rusher.fighter.technique;
    assert.ok(technique, `${label}: the Sphere Rush started`);
    stepUntil(rusher.step, () => technique.phase === 'dash');
    assert.equal(rusher.fighter.body.vx, def.chargedTechniques.rasenRush.dashSpeed, label);
    assert.equal(def.chargedTechniques.rasenRush.dashSpeed, 1050);

    // A Dodge from standing still adds no movement and lasts as long.
    const dodge = dodgeFrom(character);
    assert.deepEqual(dodge, dodgeFrom(def), `${label}: the same Dodge, with no movement`);
    assert.equal(dodge.moved, 0);

    // At its own top speed the run clip plays at its own rate.
    const runner = makeFighter({ character });
    settledSpeed(runner.step, runner.fighter);
    assert.equal(runner.fighter.animator.anim.key, 'run');
    assert.equal(runner.fighter.animator.speed, 1, `${label}: the run clip's own rate at top speed`);
    assert.equal(runner.fighter.animator.anim.fps, def.animations.run.fps);
  }
});

test('the same Fighter speed serves player- and CPU-controlled fighters, with the tier each declares', () => {
  for (const [tier, speed] of SPEEDS) {
    const character = withSpeed(tier);
    const player = fighterWith(character, new PlayerController({ sample: () => ({ ...RIGHT }) }), 300);
    const ai = new TrainingAIController({ rng: () => 0.5 });
    ai.thinkTimer = Infinity; // no decisions of its own: just keep walking right
    ai.moveIntent = 1;
    const cpu = fighterWith(character, ai, 600);
    // Far away, so neither turns back toward the other.
    const decoy = makeFighter({ x: 1900 }).fighter;
    player.opponent = decoy;
    cpu.opponent = decoy;
    for (const fighter of [player, cpu]) {
      assert.ok(fighter instanceof Fighter);
      assert.equal(fighter.update, Fighter.prototype.update, 'no separate player or CPU movement');
      assert.equal(fighter.maxSpeed, speed);
      let top = 0;
      for (let i = 0; i < 60; i++) {
        fighter.update(DT, SIM_CTX);
        top = Math.max(top, fighter.body.vx);
      }
      assert.equal(top, speed, `${fighter.controller.kind} at Speed Power ${tier}`);
      assert.equal(fighter.body.vx, speed);
    }
  }
});

test('a fighter with no valid Speed Power falls back, logged, to the normal speed', () => {
  for (const [character, label] of [
    [{ ...def, powers: { jump: 2 } }, 'no speed tier'],
    [{ ...def, powers: { jump: 2, speed: 0 } }, 'an unknown tier'],
    [{ ...def, powers: { jump: 2, speed: '3' } }, 'a tier that is not a number'],
  ]) {
    const { value, warnings: logged } = warnings(() => getSpeedPowerTier(character));
    assert.equal(value, getPowerTier('speed', 2), label);
    assert.equal(logged.length, 1, `${label} is logged`);
    assert.match(logged[0], /Speed Power/);
    const built = warnings(() => makeFighter({ character }).fighter);
    assert.equal(built.value.maxSpeed, 330, `${label}: still a playable speed`);
    assert.equal(built.value.jumpVelocity, 920, `${label}: the jump is unaffected`);
  }
  assert.deepEqual(warnings(() => getMaxSpeed(def)).warnings, []);
});

// ---- Attack Powers ------------------------------------------------------------

test('Horizontal Knockback Power has exactly three tiers: 140, 180 and 220', () => {
  assert.deepEqual(HORIZONTAL_KNOCKBACK_POWER_TIERS.map((t) => [t.tier, t.name, t.description, t.knockbackX]), [
    [1, 'Horizontal Knockback Power 1', 'Light horizontal knockback.', 140],
    [2, 'Horizontal Knockback Power 2', 'Normal horizontal knockback.', 180],
    [3, 'Horizontal Knockback Power 3', 'Strong horizontal knockback.', 220],
  ]);
  for (const [tier, x] of [[1, 140], [2, 180], [3, 220]]) {
    assert.equal(getPowerTier('horizontalKnockback', tier).knockbackX, x);
    assert.equal(getHorizontalKnockback({ id: 'a', powers: { horizontalKnockback: tier } }), x);
  }
  assert.equal(getPowerTier('horizontalKnockback', 4), null);
});

test('Vertical Knockback Power has exactly three tiers: 480, 640 and 800', () => {
  assert.deepEqual(VERTICAL_KNOCKBACK_POWER_TIERS.map((t) => [t.tier, t.name, t.description, t.knockbackY]), [
    [1, 'Vertical Knockback Power 1', 'Light vertical knockback.', 480],
    [2, 'Vertical Knockback Power 2', 'Normal vertical knockback.', 640],
    [3, 'Vertical Knockback Power 3', 'Strong vertical knockback.', 800],
  ]);
  for (const [tier, y] of [[1, 480], [2, 640], [3, 800]]) {
    assert.equal(getPowerTier('verticalKnockback', tier).knockbackY, y);
    assert.equal(getVerticalKnockback({ id: 'a', powers: { verticalKnockback: tier } }), y, `tier ${tier} launches upward`);
  }
  assert.equal(getPowerTier('verticalKnockback', 0), null);
});

test('a negative Vertical Knockback tier is that tier\'s magnitude reversed: downward, with no tiers of its own', () => {
  // The table stays three positive magnitudes; there are no -1 / -2 / -3 rows.
  assert.deepEqual(VERTICAL_KNOCKBACK_POWER_TIERS.map((t) => t.tier), [1, 2, 3]);
  assert.ok(VERTICAL_KNOCKBACK_POWER_TIERS.every((t) => t.knockbackY > 0));
  for (const tier of [-1, -2, -3]) assert.equal(getPowerTier('verticalKnockback', tier), null, `no tier ${tier} row`);
  assert.equal(getPowerTier('verticalKnockback', 2), VERTICAL_KNOCKBACK_POWER_TIERS[1]);
  for (const [tier, y] of [[1, 480], [2, 640], [3, 800]]) {
    const up = { id: 'up', powers: { verticalKnockback: tier } };
    const down = { id: 'down', powers: { verticalKnockback: -tier } };
    const { value, warnings: logged } = warnings(() => [
      getAttackPowerTier(down, 'verticalKnockback'), getVerticalKnockback(down), createAttackDefinition(down).knockback,
    ]);
    assert.deepEqual(logged, [], `tier ${-tier} is valid data, not a malformed tier`);
    const [entry, knockbackY, knockback] = value;
    // Same tier entry as the positive declaration, opposite direction.
    assert.equal(entry, getPowerTier('verticalKnockback', tier));
    assert.equal(entry, getAttackPowerTier(up, 'verticalKnockback'));
    assert.equal(knockbackY, -y, `tier ${-tier} resolves to ${-y}`);
    assert.equal(getVerticalKnockback(up), y);
    assert.deepEqual(knockback, { x: 0, y: -y });
    assert.deepEqual(getAttackKnockback(down), { x: 0, y: -y });
  }
});

test('both knockback Powers are strictly increasing: 1 < 2 < 3', () => {
  for (const [table, key] of [[HORIZONTAL_KNOCKBACK_POWER_TIERS, 'knockbackX'], [VERTICAL_KNOCKBACK_POWER_TIERS, 'knockbackY']]) {
    const values = table.map((t) => t[key]);
    assert.ok(values.every((v) => v > 0));
    for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1], `${key} tier ${i + 1}`);
  }
});

test('attack knockback resolves each axis on its own: horizontal only, vertical only, both or neither', () => {
  const spec = (powers) => ({ id: 'probe', animation: 'ba1', powers });
  for (const [powers, knockback, label] of [
    [{ horizontalKnockback: 2 }, { x: 180, y: 0 }, 'horizontal only'],
    [{ verticalKnockback: 2 }, { x: 0, y: 640 }, 'vertical only'],
    [{ horizontalKnockback: 3, verticalKnockback: 1 }, { x: 220, y: 480 }, 'both'],
    [{ horizontalKnockback: 1, verticalKnockback: 3 }, { x: 140, y: 800 }, 'both, the other way'],
    [{ verticalKnockback: -1 }, { x: 0, y: -480 }, 'vertical only, downward'],
    [{ horizontalKnockback: 2, verticalKnockback: -2 }, { x: 180, y: -640 }, 'both, downward'],
    [{}, { x: 0, y: 0 }, 'neither'],
  ]) {
    assert.deepEqual(getAttackKnockback(spec(powers)), knockback, label);
    const atk = createAttackDefinition(spec(powers));
    assert.deepEqual(atk.knockback, knockback, `${label}, as an attack definition`);
    assert.ok(Object.isFrozen(atk) && Object.isFrozen(atk.knockback));
  }
  // An omitted axis is 0, not a default tier.
  assert.equal(getAttackPowerTier(spec({ verticalKnockback: 2 }), 'horizontalKnockback'), null);
  assert.equal(getHorizontalKnockback(spec({ verticalKnockback: 2 })), 0);
  assert.equal(getVerticalKnockback(spec({ horizontalKnockback: 2 })), 0);
  // No Powers at all: an explicit, bespoke knockback is kept as it is, and
  // without one the attack has none.
  assert.deepEqual(createAttackDefinition({ id: 'bespoke', knockback: { x: 420, y: 220 } }).knockback, { x: 420, y: 220 });
  assert.deepEqual(createAttackDefinition({ id: 'plain' }).knockback, { x: 0, y: 0 });
});

test('attack Powers resolve once, when the attack definition is created, and hits use that number', () => {
  const powers = { horizontalKnockback: 1, verticalKnockback: 1 };
  const atk = createAttackDefinition({
    id: 'probe', animation: 'ba1', startup: 0, active: DT, recovery: 0, damage: 1, hitstop: 0, powers,
  });
  // Later edits to the source data never reach the frozen definition.
  powers.horizontalKnockback = 3;
  assert.deepEqual(atk.knockback, { x: 140, y: 480 });
  const attacker = makeFighter({ x: 400 });
  const target = makeFighter({ x: 460, facing: -1 });
  new CombatSystem().applyHit(attacker.fighter, target.fighter, atk);
  assert.equal(target.fighter.body.vx, 140);
  assert.equal(target.fighter.body.vy, -480, 'a positive vertical Power launches upward');
  assert.equal(target.fighter.grounded, false);
});

// An unblocked hit from an attack with `powers` on `target`, through the real
// CombatSystem.applyHit; the attacker faces `facing`.
function hitWith(powers, { facing = 1, airborne = false, blocker = false } = {}) {
  const atk = createAttackDefinition({
    id: 'probe', animation: 'ba1', startup: 0, active: DT, recovery: 0, damage: 5, hitstun: 0.3, hitstop: 0, powers,
  });
  const attacker = makeFighter({ x: 500, facing });
  const target = makeFighter({
    x: 500 + 50 * facing, facing: -facing,
    character: blocker ? { ...def, defense: { type: 'block' } } : def,
  });
  if (airborne) {
    target.fighter.body.y = 500;
    target.fighter.body.vy = 0;
    target.fighter.body.grounded = false;
    target.fighter.body.ground = null;
  }
  if (blocker) target.fighter.combat.blocking = true;
  const event = new CombatSystem().applyHit(attacker.fighter, target.fighter, atk);
  return { atk, event, target };
}

test('an unblocked Vertical Knockback Power -2 hit drives the target downward: vy +640', () => {
  for (const facing of [1, -1]) {
    // A grounded target: knocked down into the floor, it stays on the ground.
    const grounded = hitWith({ verticalKnockback: -2 }, { facing });
    const body = grounded.target.fighter.body;
    assert.equal(grounded.event.type, 'hit');
    assert.equal(grounded.atk.knockback.y, -640);
    assert.equal(body.vy, 640, 'positive body vy: downward');
    assert.ok(body.vy > 0);
    assert.equal(Math.abs(body.vx), 0, 'no horizontal Power, no push');
    const floor = body.y;
    grounded.target.step();
    assert.equal(body.y, floor, 'never goes up, and never below the floor');
    assert.equal(body.grounded, true, 'back on the ground at once');

    // An airborne target falls faster and lands sooner than one that is not hit.
    const hit = hitWith({ verticalKnockback: -2 }, { facing, airborne: true });
    const plain = makeFighter({ x: 500 + 50 * facing, facing: -facing });
    Object.assign(plain.fighter.body, { y: 500, vy: 0, grounded: false, ground: null });
    assert.equal(hit.target.fighter.body.vy, 640);
    const startY = hit.target.fighter.body.y;
    hit.target.step();
    plain.step();
    assert.ok(hit.target.fighter.body.y > startY, 'moves down on the very next step');
    assert.ok(hit.target.fighter.body.y > plain.fighter.body.y, 'faster than falling on its own');
    const landHit = stepUntil(hit.target.step, (f) => f.grounded);
    const landPlain = stepUntil(plain.step, (f) => f.grounded);
    assert.ok(landHit < landPlain, 'lands sooner');
  }
});

test('Vertical Knockback Power -2 with Horizontal Knockback Power 2: pushed away and down; blocked, neither vertical', () => {
  for (const facing of [1, -1]) {
    const { target } = hitWith({ horizontalKnockback: 2, verticalKnockback: -2 }, { facing, airborne: true });
    assert.equal(target.fighter.body.vx, 180 * facing, 'away from the attacker');
    assert.equal(target.fighter.body.vy, 640, 'downward');
    // Vertical knockback, either way, needs an unblocked hit.
    const blocked = hitWith({ horizontalKnockback: 2, verticalKnockback: -2 }, { facing, blocker: true });
    assert.equal(blocked.event.type, 'block');
    assert.equal(blocked.target.fighter.body.vx, 90 * facing, 'half the push');
    assert.equal(blocked.target.fighter.body.vy, 0, 'no downward knockback on a block');
    assert.equal(blocked.target.fighter.grounded, true);
  }
});

test('positive Vertical Knockback tiers still launch upward: vy -480, -640, -800', () => {
  for (const [tier, y] of [[1, 480], [2, 640], [3, 800]]) {
    const { target } = hitWith({ verticalKnockback: tier });
    assert.equal(target.fighter.body.vy, -y, `tier ${tier}`);
    assert.equal(target.fighter.grounded, false, 'off the ground');
    const floor = STAGE.groundY;
    target.step();
    assert.ok(target.fighter.body.y < floor, 'rising');
  }
});

test('#0001\'s attacks resolve their knockback Powers; bespoke hits keep their own knockback', () => {
  const { fighter } = makeFighter();
  assert.deepEqual(fighter.attacks.ba1.knockback, { x: 180, y: 0 });
  assert.deepEqual(fighter.attacks.midairBa1.knockback, { x: 180, y: -640 }, 'pushed away and driven downward');
  assert.deepEqual(fighter.attacks.ba2.knockback, { x: 0, y: 640 });
  assert.deepEqual(fighter.attacks.midairBa2.knockback, { x: 0, y: 480 }, 'a lighter launch than ground BA2');
  assert.deepEqual(def.attacks.midairBa1.powers, { horizontalKnockback: 2, verticalKnockback: -2 });
  assert.deepEqual(def.attacks.midairBa2.powers, { verticalKnockback: 1 });
  assert.deepEqual(fighter.attacks.throw.knockback, { x: 0, y: 0 }, 'Throw has no melee hit');
  for (const id of ['ba1', 'midairBa1', 'ba2', 'midairBa2']) {
    assert.equal('knockback' in def.attacks[id], false, `${id}: its Powers are the only source`);
  }
  // Not migrated: the shuriken and the Sphere Rush hits are bespoke. The
  // shuriken has no knockback at all.
  assert.deepEqual(def.projectiles.shuriken.knockback, { x: 0, y: 0 });
  assert.deepEqual(fighter.projectileDefs.shuriken.knockback, { x: 0, y: 0 });
  assert.deepEqual(def.chargedTechniques.rasenRush.firstHit.knockback, { x: 0, y: 0 });
  assert.deepEqual(def.chargedTechniques.rasenRush.explosionHit.knockback, { x: 420, y: 220 });
  for (const hit of [def.projectiles.shuriken, def.chargedTechniques.rasenRush.firstHit, def.chargedTechniques.rasenRush.explosionHit]) {
    assert.equal('powers' in hit, false);
  }
});

test('malformed attack Power data: a bad tier is logged and gets the normal tier; a non-attack Power is logged and ignored', () => {
  for (const [powers, knockback, pattern, label] of [
    [{ horizontalKnockback: 7 }, { x: 180, y: 0 }, /Horizontal Knockback Power/, 'an unknown horizontal tier'],
    [{ verticalKnockback: '2' }, { x: 0, y: 640 }, /Vertical Knockback Power/, 'a vertical tier that is not a number'],
    // A signed tier must be a real number whose magnitude is a tier; anything
    // else is malformed as before: logged, the default tier, upward.
    [{ verticalKnockback: '-2' }, { x: 0, y: 640 }, /Vertical Knockback Power/, 'a negative vertical tier that is a string'],
    [{ verticalKnockback: -7 }, { x: 0, y: 640 }, /Vertical Knockback Power/, 'a negative vertical tier out of range'],
    [{ verticalKnockback: 0 }, { x: 0, y: 640 }, /Vertical Knockback Power/, 'vertical tier 0'],
    [{ verticalKnockback: -1.5 }, { x: 0, y: 640 }, /Vertical Knockback Power/, 'a fractional negative vertical tier'],
    [{ verticalKnockback: -Infinity }, { x: 0, y: 640 }, /Vertical Knockback Power/, 'an infinite negative vertical tier'],
    // Horizontal Knockback is never signed: direction is the hit's facing.
    [{ horizontalKnockback: -2 }, { x: 180, y: 0 }, /Horizontal Knockback Power/, 'a negative horizontal tier'],
    [{ jump: 2 }, { x: 0, y: 0 }, /"jump", which is not an attack Power/, 'a fighter Power on an attack'],
    [{ knockbak: 2 }, { x: 0, y: 0 }, /"knockbak", which is not an attack Power/, 'a misspelt Power'],
  ]) {
    const { value, warnings: logged } = warnings(() => createAttackDefinition({ id: 'probe', powers }));
    assert.deepEqual(value.knockback, knockback, label);
    assert.equal(logged.length, 1, `${label} is logged`);
    assert.match(logged[0], /Attack "probe"/);
    assert.match(logged[0], pattern);
  }
  // Powers and a raw knockback on one attack: two sources; the Powers win.
  const both = warnings(() => createAttackDefinition({ id: 'probe', powers: { verticalKnockback: 2 }, knockback: { x: 50, y: 0 } }));
  assert.deepEqual(both.value.knockback, { x: 0, y: 640 });
  assert.match(both.warnings.join('\n'), /both knockback Powers and a raw knockback/);
  // Valid data, and an omitted axis, never warn.
  assert.deepEqual(warnings(() => makeFighter()).warnings, []);
  assert.deepEqual(warnings(() => createAttackDefinition({ id: 'probe', powers: { horizontalKnockback: 2 } })).warnings, []);
  assert.deepEqual(warnings(() => createAttackDefinition({ id: 'probe', powers: { horizontalKnockback: 2, verticalKnockback: -2 } })).warnings, []);
});
