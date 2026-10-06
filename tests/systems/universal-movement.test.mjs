// Run with node --test tests/systems/universal-movement.test.mjs (no dependencies).
// Universal movement (js/data/movement.js): every fighter runs, turns,
// jumps, triple-jumps, fast-falls, Dashes and air dashes on exactly the same
// numbers, and character identity can never change them. Checked three
// ways: the values themselves (one frozen object, nothing in any
// definition, the registry refusing a definition that tries), the runtime
// behaviour of every playable fighter field by field, and identical input
// traces giving identical trajectories for #0001 and #0002. Then the triple
// jump, for more than one fighter. Runs the real Fighter, physics and
// combat (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  BASE_FIGHTER_MOVEMENT, MOVEMENT_FIELDS, movementProblems, assertUniversalMovement,
} from '../../js/data/movement.js';
import { CHARACTERS, getCharacter, playableCharacters } from '../../js/data/characters.js';
import { StageCollision } from '../../js/game/physics.js';
import { CONFIG } from '../../js/config.js';
import { DT, MOVEMENT, harnessFor, stageMap, steps } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const JUMP = P('jump');
const RIGHT = { runRight: true };
const LEFT = { runLeft: true };
const G = CONFIG.sim.gravity;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Every fighter the game can be played with, and the sample fighter (a
// definition that is neither of them, with no Dash or air dash art: a
// capability its art decides, see codename_rule), each through its own
// harness.
const PLAYABLE = playableCharacters();
const ROSTER = [...PLAYABLE, SAMPLE_FIGHTER];

// ---- The values ------------------------------------------------------------------------

test('one frozen set of movement values, the faster baseline: a quick run, a short sharp Dash, the triple jump', () => {
  const mv = BASE_FIGHTER_MOVEMENT;
  assert.ok(Object.isFrozen(mv));
  assert.deepEqual(MOVEMENT_FIELDS, Object.keys(mv));
  for (const [field, value] of Object.entries(mv)) {
    assert.ok(Number.isFinite(value) && value > 0, `${field}: a positive number`);
  }
  assert.ok(mv.maxSpeed >= 400 && mv.maxSpeed < 450, `top speed in the low 400s (${mv.maxSpeed})`);
  const toTop = mv.maxSpeed / mv.acceleration;
  assert.ok(toTop >= 0.06 && toTop <= 0.09, `rest to top speed in 60-90 ms (${(toTop * 1000).toFixed(0)})`);
  assert.ok(mv.dashSpeed >= 1200 && mv.dashSpeed <= 1300 && mv.airDashSpeed === mv.dashSpeed);
  assert.ok(mv.dashDuration < 0.2 && mv.airDashDuration < 0.2, 'shorter and sharper than the old 0.2 s');
  assert.ok(mv.dashCancelTime > 0 && mv.dashCancelTime < mv.dashDuration, 'a moment of commitment, then a cancel window');
  assert.equal(mv.airJumps, 2, 'the triple jump: a ground jump and two air jumps');
  assert.equal(mv.airDashUses, 1);
  // Overspeed: holding on keeps speed longest, letting go brakes, pressing
  // back turns hardest.
  assert.ok(mv.overspeedHoldDeceleration < mv.overspeedDeceleration);
  assert.ok(mv.acceleration * mv.turnBoost > mv.overspeedDeceleration);
  // Launches still run down at the rates Launch Point was tuned against.
  assert.deepEqual([mv.hitstunFriction, mv.hitstunAirDrag], [1600, 210]);
});

test('no fighter definition declares movement, Powers or any movement field: the registry refuses one that does', () => {
  for (const def of [...CHARACTERS, SAMPLE_FIGHTER]) {
    assert.deepEqual(movementProblems(def), [], def.displayName);
    assert.equal('movement' in def, false, `${def.displayName}: no movement profile`);
    assert.equal('powers' in def, false, `${def.displayName}: no Powers`);
  }
  const base = getCharacter('0002');
  const faster = { ...base, movement: { maxSpeed: 999 } };
  assert.throws(() => assertUniversalMovement(faster), /declares `movement`: movement is universal/);
  assert.throws(() => assertUniversalMovement({ ...base, powers: { speed: 3 } }), /Jump Power and Speed Power are retired/);
  assert.throws(() => assertUniversalMovement({ ...base, dashSpeed: 2000 }), /declares `dashSpeed`/);
  assert.match(movementProblems({ ...base, movement: {}, airJumps: 3 }).join(' '), /movement.*airJumps/);
  // The Powers module is gone, and nothing reads a definition's movement.
  assert.equal(existsSync(new URL('../../js/data/powers.js', import.meta.url)), false);
  for (const file of ['js/game/fighters/fighter.js', 'js/game/fighters/movement.js', 'js/game/ai/combat-ai.js', 'js/game/ai/moveset.js', 'js/game/rendering/hit-fx.js']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(source, /def\??\.movement|\.powers\b|powers\.js|getMaxSpeed|getJumpVelocity/, file);
  }
});

test('a definition that declares movement anyway changes nothing: the Fighter only ever reads the universal values', () => {
  const base = getCharacter('0001');
  const sneaky = { ...base, movement: { ...MOVEMENT, maxSpeed: 900, dashSpeed: 3000, airJumps: 9 }, powers: { speed: 3, jump: 3 } };
  const plain = harnessFor(base).makeFighter();
  const other = harnessFor(sneaky).makeFighter();
  assert.equal(other.fighter.movement, BASE_FIGHTER_MOVEMENT);
  for (let i = 0; i < 40; i++) {
    const held = i < 25 ? RIGHT : i === 30 ? JUMP : {};
    plain.step(held);
    other.step(held);
    assert.deepEqual([other.fighter.body.x, other.fighter.body.vx], [plain.fighter.body.x, plain.fighter.body.vx], `step ${i}`);
  }
  assert.equal(other.fighter.airJumps, MOVEMENT.airJumps);
});

test('every fighter is built on the very same values; every playable one has the Dash and the air dash', () => {
  for (const c of PLAYABLE) {
    for (const clip of ['mouvment', 'midair_mouvment']) {
      assert.ok(c.animations[clip]?.frames.length > 0, `${c.displayName}: its ${clip} art, so it has the universal ${clip === 'mouvment' ? 'Dash' : 'air dash'}`);
    }
  }
  for (const c of PLAYABLE) {
    const { fighter } = harnessFor(c).makeFighter();
    assert.equal(fighter.movement, BASE_FIGHTER_MOVEMENT, c.displayName);
    assert.equal(fighter.maxSpeed, MOVEMENT.maxSpeed);
    assert.equal(fighter.jumpVelocity, MOVEMENT.jumpVelocity);
    assert.equal(fighter.airJumps, MOVEMENT.airJumps);
    assert.equal(fighter.airDashUses, MOVEMENT.airDashUses);
    assert.equal(fighter.dashDuration, MOVEMENT.dashDuration, `${c.displayName}: the Dash's length, whatever its clip`);
    assert.equal(fighter.airDashDuration, MOVEMENT.airDashDuration);
    assert.equal(fighter.body.gravityScale, MOVEMENT.gravityScale);
    assert.equal(fighter.body.maxFall, MOVEMENT.maxFallSpeed);
  }
});

// ---- Runtime, field by field ------------------------------------------------------------

// What every fighter does, measured: the same for each, and as the values say.
function measure(c) {
  const { makeFighter } = harnessFor(c);
  const out = {};
  {
    const { fighter, step } = makeFighter();
    let n = 0;
    while (fighter.body.vx < fighter.maxSpeed && n < 60) { step(RIGHT); n++; }
    out.toTop = n;
    out.top = fighter.body.vx;
    for (let i = 0; i < 10; i++) step(RIGHT);
    out.held = fighter.body.vx;
    const turn = [];
    while (fighter.body.vx > -fighter.maxSpeed && turn.length < 60) turn.push(step(LEFT).body.vx);
    out.turn = turn;
    let stop = 0;
    while (fighter.body.vx !== 0 && stop < 60) { step({}); stop++; }
    out.stop = stop;
  }
  {
    // Air: steering from a standing jump, then the fast fall.
    const { fighter, step } = makeFighter();
    step(JUMP);
    const air = [];
    for (let i = 0; i < 8; i++) air.push(step(RIGHT).body.vx);
    out.air = air;
    while (fighter.body.vy < 0) step({});
    const fall = [];
    for (let i = 0; i < 6 && !fighter.grounded; i++) fall.push(step({ down: true }).body.vy);
    out.fastFall = fall;
  }
  {
    // The jump, both air jumps and a fourth press that does nothing.
    const { fighter, step } = makeFighter();
    const y0 = fighter.body.y;
    step(JUMP);
    out.jumpVy = fighter.body.vy;
    const heights = [];
    let from = y0;
    for (let jump = 0; jump < 4; jump++) {
      let top = fighter.body.y;
      while (fighter.body.vy < 0) top = Math.min(top, step({}).body.y);
      heights.push(+(from - top).toFixed(6));
      from = fighter.body.y;
      step(JUMP);
    }
    out.jumps = heights;
    out.airJumpsLeft = fighter.airJumps;
  }
  if (c.animations.mouvment && c.animations.midair_mouvment) {
    // The Dash and the air dash: speed, length, distance.
    const { fighter, step } = makeFighter();
    step({ ...RIGHT, runRightPressed: true });
    step({});
    const x = fighter.body.x;
    step({ ...RIGHT, runRightPressed: true });
    out.dashSpeed = fighter.body.vx;
    let n = 1;
    while (fighter.dash) { step({}); n++; }
    out.dashSteps = n;
    out.dashDistance = +(fighter.body.x - x).toFixed(6);
    const air = makeFighter();
    air.step(JUMP);
    while (air.fighter.body.vy < 0) air.step({});
    air.step({ mouvementRightPressed: true });
    out.airDashSpeed = air.fighter.body.vx;
    let m = 1;
    while (air.fighter.dash) { air.step({}); m++; }
    out.airDashSteps = m;
    air.step({ mouvementRightPressed: true });
    out.secondAirDash = !!air.fighter.dash;
  }
  return out;
}

test('every fighter runs, turns, stops, steers, falls, jumps and Dashes identically, exactly as the values say', () => {
  const runs = PLAYABLE.map(measure);
  for (let i = 1; i < runs.length; i++) assert.deepEqual(runs[i], runs[0], `${PLAYABLE[i].displayName} moves as ${PLAYABLE[0].displayName} does`);
  // A fighter that is neither, with no Dash art: everything else the same.
  const sample = measure(SAMPLE_FIGHTER);
  const { dashSpeed, dashSteps, dashDistance, airDashSpeed, airDashSteps, secondAirDash, ...rest } = runs[0];
  assert.deepEqual(sample, rest, 'the sample fighter, wherever it has the art');
  const r = runs[0];
  const mv = MOVEMENT;
  assert.equal(r.toTop, Math.ceil(mv.maxSpeed / (mv.acceleration * DT) - 1e-9), 'to top speed at the acceleration');
  assert.equal(r.top, mv.maxSpeed);
  assert.equal(r.held, mv.maxSpeed, 'held: stays at top speed');
  assert.ok(close(r.turn[0], mv.maxSpeed - mv.acceleration * mv.turnBoost * DT), 'a turn brakes at acceleration x turnBoost');
  assert.ok(r.turn.length >= 5 && r.turn.length <= 8, `a full turn in ${r.turn.length} steps`);
  assert.equal(r.stop, Math.ceil(mv.maxSpeed / (mv.deceleration * DT) - 1e-9), 'a stop at the deceleration');
  assert.ok(close(r.air[0], mv.airAcceleration * DT), 'air acceleration');
  assert.ok(r.fastFall.every((v, i) => i === 0 || v - r.fastFall[i - 1] <= (mv.fastFallAcceleration + G) * DT + 1e-9));
  assert.ok(close(r.jumpVy, -mv.jumpVelocity + G * DT), 'the jump\'s own speed');
  const jump = (mv.jumpVelocity ** 2) / (2 * G);
  const airJump = ((mv.jumpVelocity * mv.airJumpRatio) ** 2) / (2 * G);
  assert.ok(Math.abs(r.jumps[0] - jump) < 10, `the jump: ${r.jumps[0]} vs ${jump.toFixed(1)}`);
  assert.ok(Math.abs(r.jumps[1] - airJump) < 8 && Math.abs(r.jumps[2] - airJump) < 8, `both air jumps the same height: ${r.jumps}`);
  assert.ok(r.jumps[3] <= 0, 'a fourth jump does nothing: it only falls on');
  assert.equal(r.airJumpsLeft, 0);
  assert.equal(r.dashSpeed, mv.dashSpeed);
  assert.equal(r.dashSteps, steps(mv.dashDuration) + 1, 'the Dash lasts its universal length');
  assert.ok(Math.abs(r.dashDistance - mv.dashSpeed * mv.dashDuration) < mv.dashSpeed * DT * 1.5, `its reach (${r.dashDistance})`);
  assert.equal(r.airDashSpeed, mv.airDashSpeed);
  assert.equal(r.airDashSteps, steps(mv.airDashDuration) + 1);
  assert.equal(r.secondAirDash, false, 'one air dash per airtime');
});

test('coyote time, the jump buffer and the combat input buffer are the same lengths for every fighter', () => {
  const coyote = Math.floor(MOVEMENT.coyoteTime / DT);
  const timings = ROSTER.map((c) => {
    const { makeFighter } = harnessFor(c);
    // Off a platform's edge: the last step a ground jump still comes out.
    const ledge = (late) => {
      const { fighter, step } = makeFighter({ x: 1080, y: 600 });
      while (fighter.grounded) step(RIGHT);
      for (let i = 0; i < late; i++) step(RIGHT);
      step({ ...RIGHT, ...JUMP });
      return fighter.airJumps === MOVEMENT.airJumps && fighter.body.vy < 0;
    };
    // Jump pressed before touchdown: the earliest that still jumps.
    const buffered = (early) => {
      const { fighter, step } = makeFighter();
      step(JUMP);
      fighter.airJumps = 0;
      while (fighter.body.vy < 0 || fighter.body.y < 800 - 4 - early * 20) step({});
      let n = 0;
      while (!fighter.grounded) { step(n === 0 ? JUMP : {}); n++; }
      step({});
      return fighter.body.vy < 0;
    };
    // An attack pressed during a Dash's first steps comes out once it may.
    const { fighter, step } = makeFighter();
    step({ ...RIGHT, runRightPressed: true });
    step({});
    step({ ...RIGHT, runRightPressed: true });
    step(P('attack1'));
    let n = 0;
    while (!fighter.combat.attack && n < 30) { step({}); n++; }
    return { coyote: [ledge(coyote - 1), ledge(coyote + 2)], buffered: [buffered(1), buffered(2)], attackAfter: n };
  });
  for (const t of timings) assert.deepEqual(t, timings[0]);
  assert.deepEqual(timings[0].coyote, [true, false], 'coyote time');
  assert.deepEqual(timings[0].buffered, [true, true], 'the jump buffer');
  assert.equal(timings[0].attackAfter, Math.ceil(MOVEMENT.dashCancelTime / DT) - 1, 'the attack buffered through the Dash\'s commitment');
});

// ---- Identical traces ------------------------------------------------------------------

// A movement-only script (no attack, Shield or Deflect): running both
// ways, turns, a tap jump, a higher jump, both air jumps, steering in the
// air, a fast fall, Dashes (held on, let go, reversed), a Dash cut short by
// a jump, an air dash and its run-on, on a wide floor where no edge or wall
// is ever reached (a body's width is the fighter's own, its locomotion is
// not).
function script(i) {
  const k = i % 240;
  return {
    runRight: (k < 40) || (k > 90 && k < 130) || (k > 170 && k < 200),
    runLeft: (k >= 45 && k < 80) || (k >= 205 && k < 230),
    runRightPressed: k === 0 || k === 91 || k === 94 || k === 171 || k === 173,
    runLeftPressed: k === 45 || k === 205,
    jump: k === 20 || (k >= 60 && k < 75) || k === 85 || k === 88 || k === 100 || k === 150,
    jumpPressed: k === 20 || k === 60 || k === 85 || k === 88 || k === 100 || k === 150,
    down: k > 140 && k < 150,
    mouvementLeftPressed: k === 155,
    mouvementRightPressed: k === 210,
  };
}

test('identical inputs give #0001 and #0002 the identical trajectory, step for step', () => {
  const stage = new StageCollision(stageMap({ left: -4000, right: 6000 }));
  const trace = (c) => {
    const { fighter, step } = harnessFor(c).makeFighter({ stage, x: 1000 });
    const out = [];
    for (let i = 0; i < 720; i++) {
      const f = step(script(i));
      out.push([f.body.x, f.body.y, f.body.vx, f.body.vy, f.grounded, f.airJumps, f.airDashes, f.dash?.time ?? null, f.burst].join(','));
    }
    return { out, energy: fighter.combat.energy };
  };
  const one = trace(getCharacter('0001'));
  const two = trace(getCharacter('0002'));
  const first = one.out.findIndex((row, i) => row !== two.out[i]);
  assert.equal(first, -1, `they part at step ${first}: ${one.out[first]} vs ${two.out[first]}`);
  // The script really moved: it ran, jumped, Dashed and air dashed.
  const xs = one.out.map((r) => +r.split(',')[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 800);
  assert.ok(one.out.some((r) => r.split(',')[7] !== ''), 'it Dashed');
  assert.ok(one.out.some((r, i) => +r.split(',')[5] === 0 && i > 0), 'it used both air jumps');
});

// ---- The triple jump ----------------------------------------------------------------------

for (const c of ROSTER) {
  const { makeFighter, duel } = harnessFor(c);

  test(`${c.displayName}'s triple jump: the ground jump and two air jumps succeed, a fourth fails; landing gives both back`, () => {
    const { fighter, step } = makeFighter();
    const results = [];
    for (let n = 0; n < 4; n++) {
      if (n) while (fighter.body.vy < 0) step({});
      const vy = fighter.body.vy;
      step(JUMP);
      results.push(fighter.body.vy < vy - 1 && fighter.body.vy < 0);
    }
    assert.deepEqual(results, [true, true, true, false], 'ground jump, air jump 1, air jump 2, then nothing');
    assert.equal(fighter.airJumps, 0);
    while (!fighter.grounded) step({});
    assert.equal(fighter.airJumps, 2, 'landing restores both');
    // A walk off an edge keeps both: past coyote time each press is one.
    const off = makeFighter({ x: 1080, y: 600 });
    while (off.fighter.grounded) off.step(RIGHT);
    for (let i = 0; i < steps(MOVEMENT.coyoteTime) + 2; i++) off.step(RIGHT);
    off.step(JUMP);
    assert.equal(off.fighter.airJumps, 1);
    while (off.fighter.body.vy < 0) off.step({});
    off.step(JUMP);
    assert.equal(off.fighter.airJumps, 0);
    assert.ok(off.fighter.body.vy < 0);
  });

  test(`${c.displayName}: a hit restores both air jumps, however many were spent`, () => {
    const d = duel({ gap: 44 });
    for (const f of [d.attacker, d.target]) {
      f.body.y = 700;
      f.body.grounded = false;
      f.body.ground = null;
    }
    d.target.airJumps = 0;
    const press = Object.keys(c.actions).find((a) => c.actions[a]?.air && d.attacker.attacks[c.actions[a].air]?.hitbox);
    d.tick(P(press));
    d.until(() => d.events.some((e) => e.type === 'hit'), 40);
    assert.equal(d.target.airJumps, 2);
  });
}

test('#0002\'s Homing Attack springs off its target with both air jumps back', () => {
  const two = getCharacter('0002');
  const d = harnessFor(two).duel({ gap: 120 });
  for (const f of [d.attacker, d.target]) {
    f.body.y = 640;
    f.body.grounded = false;
    f.body.ground = null;
  }
  d.attacker.airJumps = 0;
  d.tick(P('attack1'));
  d.until(() => d.events.some((e) => e.move === 'midair_attack1'), 60);
  assert.equal(d.attacker.airJumps, 2);
});
