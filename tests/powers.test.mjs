// Run with node --test tests/powers.test.mjs (no dependencies).
// The Power system (js/data/powers.js): the Jump Power tier table, its
// resolvers, #0001's Jump Power 2, and the shared Fighter jump taking its
// strength from the tier for player and CPU fighters alike, while gravity,
// falling, coyote time, the jump buffer, knockback and every other movement
// stat stay independent of it. Runs the real Fighter, physics and combat
// (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POWERS, JUMP_POWER_TIERS, getPower, getPowerTier, getFighterPowerTier, getJumpPowerTier, getJumpVelocity,
} from '../js/data/powers.js';
import { CHARACTERS } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { PlayerController, TrainingAIController } from '../js/game/fighter-controller.js';
import { CONFIG } from '../js/config.js';
import { def, DT, STAGE, SIM_CTX, fakeSprites, makeFighter, stepUntil } from './fighter-harness.mjs';

const JUMP = { jump: true, jumpPressed: true };
// One step with gravity switched off: the velocity the jump itself set,
// before any gravity is integrated.
const NO_GRAVITY = { stage: STAGE, gravity: 0 };

// #0001 with another Jump Power tier and nothing else changed.
const withJump = (tier) => ({ ...def, powers: { ...def.powers, jump: tier } });

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

// ---- The tier table ------------------------------------------------------------

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

test('POWERS is the one registry of Power types: Jump Power, frozen, with a valid default tier', () => {
  assert.deepEqual(POWERS.map((p) => p.id), ['jump']);
  const jump = getPower('jump');
  assert.equal(jump.name, 'Jump Power');
  assert.equal(jump.tiers, JUMP_POWER_TIERS);
  assert.match(jump.summary, /how high a fighter’s normal jump goes/);
  assert.match(jump.summary, /Higher tiers jump higher/);
  assert.equal(getPowerTier('jump', jump.defaultTier), JUMP_POWER_TIERS[1], 'the default is the normal jump');
  for (const power of POWERS) {
    assert.ok(power.id && power.name && power.summary);
    assert.deepEqual(power.tiers.map((t) => t.tier), power.tiers.map((_, i) => i + 1), `${power.id} tiers count up from 1`);
    assert.ok(Object.isFrozen(power) && Object.isFrozen(power.tiers) && power.tiers.every(Object.isFrozen));
  }
  assert.ok(Object.isFrozen(POWERS));
  assert.equal(getPower('nope'), null);
});

// ---- #0001 ------------------------------------------------------------------------

test('#0001 declares Jump Power 2, which resolves to its original 920', () => {
  assert.deepEqual(def.powers, { jump: 2 });
  assert.equal(getJumpPowerTier(def), getPowerTier('jump', 2));
  assert.equal(getFighterPowerTier(def, 'jump').name, 'Jump Power 2');
  assert.equal(getJumpVelocity(def), 920);
  assert.equal('jumpVelocity' in def.movement, false, 'the tier is the only source of the jump strength');
  // Every roster fighter owns a valid tier of every Power.
  for (const character of CHARACTERS) {
    for (const power of POWERS) {
      assert.ok(power.tiers.some((t) => t.tier === character.powers?.[power.id]), `${character.displayName} ${power.name}`);
    }
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

test('fighters configured with tier 1 or tier 3 receive that tier\'s jump', () => {
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

test('the tier changes nothing but the jump\'s initial speed: gravity, fall speed and movement stats are shared', () => {
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

test('coyote time and the jump buffer work the same for every tier', () => {
  const coyoteSteps = Math.floor(def.movement.coyoteTime / DT);
  const bufferSteps = Math.floor(def.movement.jumpBuffer / DT);
  for (const tier of [1, 2, 3]) {
    const velocity = getPowerTier('jump', tier).jumpVelocity;
    const character = withJump(tier);

    // Walk off the ledge, then jump while coyote time remains.
    const ledge = makeFighter({ character, x: 1000, y: 600 });
    assert.equal(ledge.fighter.body.ground.id, 'ledge');
    stepUntil(ledge.step, (f) => !f.grounded, { right: true });
    for (let i = 0; i < coyoteSteps - 1; i++) ledge.step({ right: true });
    ledge.fighter.controller = { getInput: () => JUMP };
    ledge.fighter.update(DT, NO_GRAVITY);
    assert.equal(ledge.fighter.body.vy, -velocity, `tier ${tier}: a coyote-time jump`);

    // Past coyote time, the same press does not jump.
    const late = makeFighter({ character, x: 1000, y: 600 });
    stepUntil(late.step, (f) => !f.grounded, { right: true });
    for (let i = 0; i < coyoteSteps + 2; i++) late.step({ right: true });
    const vy = late.fighter.body.vy;
    late.fighter.controller = { getInput: () => JUMP };
    late.fighter.update(DT, NO_GRAVITY);
    assert.equal(late.fighter.body.vy, vy, `tier ${tier}: no jump after coyote time`);

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
      assert.equal(!run.fighter.grounded, jumps, `tier ${tier}: pressed ${early} steps before landing`);
      if (jumps) assert.equal(run.fighter.body.vy, -velocity + CONFIG.sim.gravity * def.movement.gravityScale * DT);
    }
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
