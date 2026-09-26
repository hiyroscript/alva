// Launch bounce (js/game/launch-bounce.js): a hard combat launch that drives
// its fighter into stage geometry rebounds off it, and may ricochet on,
// while ordinary movement still stops dead against the same surfaces.
// Uses the real Fighter, physics, CombatSystem and hit effects (see
// fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StageCollision, createBody, stepBody } from '../js/game/physics.js';
import { CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { LAUNCH_BOUNCE, resolveLaunchBounce, startLaunch, bounceLaunch } from '../js/game/launch-bounce.js';
import { HitEffects, HIT_FX, launchIsLethal } from '../js/game/hit-fx.js';
import { LAUNCH_UNIT_SPEED } from '../js/data/launch.js';
import { getMap } from '../js/data/maps.js';
import { CONFIG } from '../js/config.js';
import { def, DT, makeFighter, duel, stageMap, fakeSprites, frameName } from './fighter-harness.mjs';

const G = CONFIG.sim.gravity;
const B = LAUNCH_BOUNCE;
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const HALF = def.collider.width / 2;
const HEIGHT = def.collider.height;
const FLOOR = 800; // the test stages' main floor top
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// A private stage in the maps' schema (never the shared one).
const stageWith = (opts = {}) => new StageCollision(stageMap(opts));

// A wall standing on the floor: its left face at `x`, 200 tall.
const wallAt = (id, x, w = 60) => ({ id, x, y: FLOOR - 200, w, h: 200 });

// Launches `fighter` through the real CombatSystem.applyHit (so its launch
// sequence starts in Fighter.takeHit, exactly as any hit's does): a hit with
// no damage whose launch is `speed` world units per second along
// `direction` (travelling toward `facing` when horizontal), plus `hitstun`
// of its own. Returns the hit's event.
function launch(fighter, { speed, direction = 'horizontal', facing = 1, hitstun = 0.3 }) {
  fighter.combat.launchPoint = speed / LAUNCH_UNIT_SPEED;
  const hit = createAttackDefinition({
    id: 'testLaunch', damage: 0, baseLaunch: 1, directionalLaunch: direction, hitstun, hitstop: 0,
  });
  return new CombatSystem().applyHit(fighter, fighter, hit, { facing, detached: true });
}

// Puts `fighter` in the air at (x, y), at rest.
function lift(fighter, x, y) {
  Object.assign(fighter.body, { x, y, prevX: x, prevY: y, vx: 0, vy: 0, grounded: false, ground: null });
}

// Steps until `pred` holds (fails instead of hanging), logging every step.
function run(step, pred, held = {}, limit = 600) {
  const log = [];
  for (let i = 0; i < limit; i++) {
    const f = step(held);
    log.push({ x: f.body.x, y: f.body.y, vx: f.body.vx, vy: f.body.vy, bounce: f.bounce, state: f.state });
    if (pred(f)) return log;
  }
  throw new Error('condition never reached');
}

// The rebounds in a step log.
const bounces = (log) => log.filter((s) => s.bounce).map((s) => s.bounce);

// Whether `body` overlaps any of `stage`'s solids (embedded in geometry).
const embedded = (body, stage) => stage.solids.some((s) =>
  body.x + body.halfW > s.x + 1e-6 && body.x - body.halfW < s.x + s.w - 1e-6 &&
  body.y > s.y + 1e-6 && body.y - body.height < s.y + s.h - 1e-6);

// ---- Settings -------------------------------------------------------------------

test('bounce settings are data: one global table, any field overridable per character, unknown ones logged', () => {
  assert.deepEqual(B, {
    enabled: true, minImpactSpeed: 500, wallRestitution: 0.72, floorRestitution: 0.6, ceilingRestitution: 0.65,
    maxBounces: 5, stun: 0.2, hitstop: 0.05, hitstopSpeed: 1200,
  });
  assert.ok(Object.isFrozen(B));
  // Every restitution loses energy, so no ricochet can go on forever.
  for (const k of ['wallRestitution', 'floorRestitution', 'ceilingRestitution']) assert.ok(B[k] > 0 && B[k] < 1, k);
  assert.deepEqual(resolveLaunchBounce(undefined), B);
  assert.equal(resolveLaunchBounce({ wallRestitution: 0.5 }).wallRestitution, 0.5);
  assert.equal(resolveLaunchBounce({ wallRestitution: 0.5 }).floorRestitution, B.floorRestitution);
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  try {
    assert.equal(resolveLaunchBounce({ bouncy: true }, 'Character "x"').bouncy, undefined);
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Character "x" declares unknown launchBounce field "bouncy"/);
  // #0001 uses the global table, resolved once on its fighter.
  assert.equal(def.launchBounce, undefined);
  const { fighter } = makeFighter();
  assert.deepEqual(fighter.launchBounce, B);
  assert.equal(fighter.launch, null, 'no launch sequence until a launching hit');
});

test('physics stays generic: it stops the body and reports what it stopped, and never bounces or knows why', () => {
  const stage = stageWith({ solids: [wallAt('wall', 600), { id: 'roof', x: 300, y: 560, w: 100, h: 40 }] });
  // A side: the solid on the right stops vx and reports it.
  const side = createBody({ x: 600 - HALF - 4, y: FLOOR, width: 34, height: 80 });
  Object.assign(side, { grounded: true, vx: 900 });
  stepBody(side, DT, stage, G);
  assert.equal(side.wall, 1);
  assert.equal(side.vx, 0, 'stopped dead');
  assert.equal(side.impactVx, 900, 'the speed it stopped');
  // A landing reports the fall it stopped.
  const land = createBody({ x: 1000, y: FLOOR - 10, width: 34, height: 80 });
  land.vy = 1200;
  stepBody(land, DT, stage, G);
  assert.equal(land.landed, true);
  assert.equal(land.vy, 0);
  assert.ok(close(land.impactVy, 1200 + G * DT), 'gravity of this step included');
  // Resting on the ground stops nothing.
  stepBody(land, DT, stage, G);
  assert.equal(land.impactVy, 0);
  // A ceiling reports the rise it stopped.
  const up = createBody({ x: 350, y: 600 + HEIGHT + 5, width: 34, height: 80 });
  up.vy = -900;
  stepBody(up, DT, stage, G);
  assert.equal(up.bonked, true);
  assert.equal(up.vy, 0);
  assert.ok(close(up.impactVy, -900 + G * DT));
  // Nothing in physics knows about launches, stun, attacks or characters.
  const code = readFileSync(new URL('../js/game/physics.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /launch|stun|attack|combat|restitution|bounce|0001|character/i);
});

// ---- Ordinary movement never bounces ------------------------------------------------

test('a fighter walking or running into a wall simply stops', () => {
  const stage = stageWith({ solids: [wallAt('wall', 700)] });
  const { fighter, step } = makeFighter({ stage, x: 500 });
  const log = run(step, (f) => f.body.wall === 1, { right: true }, 200);
  assert.ok(Math.max(...log.map((s) => s.vx)) > 300, 'at full speed');
  for (let i = 0; i < 30; i++) {
    step({ right: true });
    assert.equal(fighter.body.vx, 0, 'pressed against the wall: stopped');
    assert.equal(fighter.body.x, 700 - HALF);
    assert.equal(fighter.bounce, null);
  }
  assert.equal(bounces(log).length, 0);
  assert.equal(fighter.launch, null);
});

test('a fighter jumping into a ceiling simply bonks and falls', () => {
  const stage = stageWith({ solids: [{ id: 'roof', x: 400, y: 640, w: 200, h: 40 }] });
  const { fighter, step } = makeFighter({ stage, x: 500 });
  step(P('jump'));
  const log = run(step, (f) => f.body.bonked, { jump: true }, 60);
  assert.equal(fighter.body.vy, 0, 'bonked: its rise stopped');
  assert.ok(fighter.body.impactVy < -500, 'hard enough that a launch would have rebounded');
  assert.equal(fighter.bounce, null);
  run(step, (f) => f.grounded, {}, 120);
  assert.equal(bounces(log).length, 0);
  assert.equal(fighter.state === 'land' || fighter.state === 'idle', true);
});

test('a hard fall that no launch drove, and an upward launch falling back, land normally', () => {
  // From high up, simply falling.
  const { fighter, step } = makeFighter({ x: 300 });
  lift(fighter, 300, 200);
  const log = run(step, (f) => f.grounded);
  assert.ok(fighter.body.impactVy > 1000);
  assert.equal(bounces(log).length, 0);
  assert.equal(fighter.state, 'land');
  // Launched straight up hard: it comes back down just as fast, and lands:
  // gravity alone never bounces anyone.
  const up = makeFighter({ x: 300 });
  launch(up.fighter, { speed: 1400, direction: 'vertical' });
  const upLog = run(up.step, (f) => f.grounded);
  assert.ok(up.fighter.body.impactVy > 1000, 'fast into the floor');
  assert.equal(bounces(upLog).length, 0);
  assert.equal(up.fighter.grounded, true);
});

// ---- Walls ------------------------------------------------------------------------

test('a weak launch into a wall stops there like any collision', () => {
  const stage = stageWith({ solids: [wallAt('wall', 600)] });
  const { fighter, step } = makeFighter({ stage, x: 600 - HALF - 30 });
  launch(fighter, { speed: 420 });
  const log = run(step, (f) => f.body.wall === 1, {}, 60);
  const at = log.at(-1);
  assert.ok(fighter.body.impactVx > 0 && fighter.body.impactVx < B.minImpactSpeed, 'below the threshold');
  assert.equal(at.vx, 0, 'stopped dead');
  assert.equal(at.bounce, null);
  assert.equal(fighter.launch.headingX, 0, 'that wall spent the launch');
  for (let i = 0; i < 20; i++) assert.equal(step().body.vx, 0);
});

test('a strong horizontal launch into a wall rebounds: reversed, scaled by the wall\'s restitution', () => {
  for (const facing of [1, -1]) {
    // A wall 40 units ahead, whichever way it faces.
    const wallX = facing > 0 ? 640 : 360 - 60;
    const stage = stageWith({ solids: [wallAt('wall', wallX)] });
    const { fighter, step } = makeFighter({ stage, x: 500, facing: -facing });
    launch(fighter, { speed: 1400, facing });
    const log = run(step, (f) => !!f.bounce, {}, 60);
    const impact = fighter.body.impactVx;
    assert.equal(Math.sign(impact), facing, 'into the wall');
    assert.ok(Math.abs(impact) > B.minImpactSpeed);
    assert.ok(close(fighter.body.vx, -impact * B.wallRestitution), 'reversed, restitution applied');
    assert.deepEqual(
      { normalX: fighter.bounce.normalX, normalY: fighter.bounce.normalY, bounces: fighter.bounce.bounces },
      { normalX: -facing, normalY: 0, bounces: 1 },
    );
    assert.ok(close(fighter.bounce.speed, Math.abs(impact)));
    assert.equal(fighter.bounce.x, facing > 0 ? wallX : wallX + 60, 'struck at the wall\'s face');
    assert.equal(fighter.launch.headingX, -facing, 'the launch now carries it away from the wall');
    assert.equal(log.length < 10, true);
    // It travels back away from the wall.
    const x0 = fighter.body.x;
    while (fighter.combat.hitstop > 0) step();
    for (let i = 0; i < 10; i++) step();
    assert.ok((fighter.body.x - x0) * facing < -50, 'flies back across the stage');
    assert.equal(embedded(fighter.body, stage), false);
  }
});

test('a diagonal impact on a wall reflects only what crossed it: the rest of the trajectory carries on', () => {
  const stage = stageWith({ solids: [{ id: 'wall', x: 640, y: 200, w: 60, h: 600 }] });
  // The same launch with and without bouncing: identical but for vx.
  const make = (character) => {
    const { fighter, step } = makeFighter({ stage, x: 500, character });
    lift(fighter, 500, 500);
    fighter.steerHeld = { x: 0, y: 1 }; // held down as it lands: bent 15 degrees downward
    const e = launch(fighter, { speed: 1600 });
    assert.ok(e.finalLaunch.y > 300 && e.finalLaunch.x > 1500, 'a down-right launch');
    run(step, (f) => f.body.wall === 1, {}, 60);
    return fighter;
  };
  const bounced = make(def);
  const plain = make({ ...def, launchBounce: { enabled: false } });
  assert.equal(plain.body.vx, 0, 'without bouncing, stopped');
  assert.equal(plain.bounce, null);
  assert.ok(close(bounced.body.vx, -bounced.body.impactVx * B.wallRestitution), 'x reflected');
  assert.equal(bounced.body.vy, plain.body.vy, 'y exactly as it would have been');
  assert.ok(bounced.body.vy > 300, 'still flying mostly as it was: down, now away from the wall');
  assert.equal(bounced.body.x, plain.body.x);
  assert.equal(bounced.body.y, plain.body.y);
});

test('a glancing contact (mostly along a wall) never rebounds hard: only the speed across it counts', () => {
  const stage = stageWith({ solids: [{ id: 'wall', x: 520, y: 100, w: 60, h: 700 }] });
  const { fighter, step } = makeFighter({ stage, x: 500 - 4 });
  lift(fighter, 520 - HALF - 2, 400);
  launch(fighter, { speed: 2400, direction: 'reverseVertical' });
  fighter.body.vx = 200; // a little sideways drift into the wall
  const log = run(step, (f) => f.body.wall === 1, {}, 30);
  assert.equal(bounces(log).length, 0);
  assert.equal(fighter.body.vx, 0, 'the drift is stopped');
  assert.ok(fighter.body.vy > 1000, 'the fall carries on (at the body\'s maxFall)');
});

test('multiple bounces: wall to wall, each rebound weaker, until the launch runs out', () => {
  // A corridor on the ground: walls at 500-560 and 900-960.
  const stage = stageWith({ solids: [wallAt('west', 500), wallAt('east', 900)] });
  const { fighter, step } = makeFighter({ stage, x: 700 });
  launch(fighter, { speed: 2400 });
  const log = run(step, (f) => f.launch === null, {}, 600);
  const hits = bounces(log);
  assert.ok(hits.length >= 2, `ricochets (${hits.length})`);
  assert.deepEqual(hits.slice(0, 2).map((b) => b.normalX), [-1, 1], 'east wall, then west wall');
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].speed < hits[i - 1].speed, 'every rebound weaker');
  assert.ok(hits.length <= B.maxBounces);
  // Then it is simply stopped on the ground, back in ordinary play.
  for (let i = 0; i < 60; i++) step();
  assert.equal(fighter.body.vx, 0);
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.launch, null);
  assert.equal(embedded(fighter.body, stage), false);
});

test('bounce decay: however hard the launch, the ricochet dies away below the threshold and normal physics resumes', () => {
  // A tight corridor and a launch far past anything in play.
  const stage = stageWith({ solids: [wallAt('west', 500), wallAt('east', 760)] });
  const { fighter, step } = makeFighter({ stage, x: 660 });
  launch(fighter, { speed: 5000 });
  const log = run(step, (f) => f.launch === null, {}, 900);
  const hits = bounces(log);
  assert.ok(hits.length >= 3, `bounces ${hits.length}`);
  assert.ok(hits.length <= B.maxBounces, 'never past the safety cap');
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].speed < hits[i - 1].speed);
  // After the last rebound nothing more bounces: the fighter comes to rest.
  for (let i = 0; i < 120; i++) {
    step();
    assert.equal(fighter.bounce, null);
  }
  assert.equal(fighter.body.vx, 0);
  assert.equal(fighter.state, 'idle');
});

test('the safety cap: past maxBounces, a surface is an ordinary stop until the fighter has recovered', () => {
  // Rebounds that lose nothing would go on forever; the cap stops them.
  const character = { ...def, launchBounce: { wallRestitution: 1, maxBounces: 3 } };
  const stage = stageWith({ solids: [wallAt('west', 500), wallAt('east', 760)] });
  const { fighter, step } = makeFighter({ stage, x: 660, character });
  launch(fighter, { speed: 3000, hitstun: 2 });
  const log = run(step, (f) => f.body.vx === 0 && f.combat.hitstop <= 0, {}, 600);
  assert.equal(bounces(log).length, 3);
  assert.ok(Math.abs(fighter.body.impactVx) > B.minImpactSpeed, 'stopped although it was fast');
  assert.equal(fighter.launch.bounces, 3, 'still in its sequence, its rebounds spent');
  // Launched again before it has recovered: still no rebound.
  launch(fighter, { speed: 3000, facing: -1, hitstun: 2 });
  assert.equal(fighter.launch.bounces, 3);
  run(step, (f) => f.body.wall === -1, {}, 60);
  assert.equal(fighter.bounce, null);
  assert.equal(fighter.body.vx, 0);
  // Recovered (grounded, its stun over), it rebounds again.
  run(step, (f) => f.launch === null, {}, 300);
  launch(fighter, { speed: 3000 });
  assert.equal(fighter.launch.bounces, 0);
  run(step, (f) => !!f.bounce, {}, 60);
});

// ---- Floors and ceilings ------------------------------------------------------------

test('a strong downward launch rebounds off the floor, and is not a landing', () => {
  const { fighter, step } = makeFighter({ x: 300 });
  lift(fighter, 300, FLOOR - 150);
  launch(fighter, { speed: 1400, direction: 'reverseVertical' });
  fighter.airJumps = 0; // spent (the hit gave it back)
  const log = run(step, (f) => !!f.bounce);
  const impact = fighter.body.impactVy;
  assert.ok(impact > 1400, 'the launch and the fall');
  assert.ok(close(fighter.body.vy, -impact * B.floorRestitution), 'upward, restitution applied');
  assert.equal(fighter.body.y, FLOOR, 'struck at the floor, never through it');
  assert.equal(fighter.grounded, false, 'airborne again at once');
  assert.equal(fighter.body.landed, false);
  assert.deepEqual([fighter.bounce.normalX, fighter.bounce.normalY], [0, -1]);
  assert.notEqual(fighter.state, 'land', 'no Land pose');
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_midairhurt.png');
  assert.equal(fighter.airJumps, 0, 'no landing gives the air jump back');
  assert.equal(fighter.canAct(), false, 'not grounded neutral');
  assert.equal(log.every((s) => s.y <= FLOOR), true);
  // It rises off the floor, then comes back down and lands: one rebound
  // for one spike.
  while (fighter.combat.hitstop > 0) step();
  step();
  assert.ok(fighter.body.y < FLOOR, 'rising');
  const rest = run(step, (f) => f.grounded);
  assert.equal(bounces(rest).length, 0, 'falling back, it lands');
});

test('a strong upward launch rebounds off a ceiling, downward', () => {
  const stage = stageWith({ solids: [{ id: 'roof', x: 400, y: 600, w: 200, h: 40 }] });
  const { fighter, step } = makeFighter({ stage, x: 500 });
  launch(fighter, { speed: 1500, direction: 'vertical' });
  run(step, (f) => !!f.bounce, {}, 30);
  const impact = fighter.body.impactVy;
  assert.ok(impact < -1200, 'hard into the ceiling');
  assert.ok(close(fighter.body.vy, -impact * B.ceilingRestitution), 'now downward');
  assert.ok(fighter.body.vy > 0);
  assert.deepEqual([fighter.bounce.normalX, fighter.bounce.normalY], [0, 1]);
  assert.equal(fighter.body.y - HEIGHT, 640, 'head at the ceiling, never inside it');
  assert.equal(fighter.launch.headingY, 1, 'the launch now drives it downward');
});

test('a corner: both axes rebound once, on the same step, deterministically, with nothing embedded', () => {
  // The floor and a wall standing on it meet at (640, 800).
  const stage = stageWith({ solids: [wallAt('wall', 640)] });
  const { fighter, step } = makeFighter({ stage, x: 500 });
  lift(fighter, 640 - HALF - 5, FLOOR - 5);
  fighter.body.vx = 900;
  fighter.body.vy = 900;
  fighter.launch = startLaunch({ x: 900, y: 900 });
  fighter.combat.stun = 0.5;
  step();
  const b = fighter.bounce;
  assert.ok(b, 'rebounded');
  assert.deepEqual([b.normalX, b.normalY], [-1, -1], 'off the wall and the floor at once');
  assert.equal(b.bounces, 1, 'one impact');
  assert.ok(fighter.body.impactVx > 850 && fighter.body.impactVy > 900, 'fast into both');
  assert.ok(close(fighter.body.vx, -fighter.body.impactVx * B.wallRestitution));
  assert.ok(close(fighter.body.vy, -fighter.body.impactVy * B.floorRestitution));
  assert.equal(fighter.body.x, 640 - HALF);
  assert.equal(fighter.body.y, FLOOR);
  assert.equal(embedded(fighter.body, stage), false);
  // It leaves the corner up and to the left, and never strikes it again at once.
  const at = { x: fighter.body.x, y: fighter.body.y };
  while (fighter.combat.hitstop > 0) step();
  for (let i = 0; i < 5; i++) {
    step();
    assert.equal(fighter.bounce, null);
  }
  assert.ok(fighter.body.x < at.x && fighter.body.y < at.y);
});

// ---- One-way platforms, the main floor and the Void ------------------------------------

test('one-way platforms: launched up through one never bounces off its underside; driven down onto its top, it rebounds', () => {
  const stage = stageWith({ platforms: [{ id: 'deck', x: 400, y: 600, w: 200, h: 16 }] });
  const up = makeFighter({ stage, x: 500 });
  launch(up.fighter, { speed: 1600, direction: 'vertical' });
  const upLog = run(up.step, (f) => f.body.vy >= 0, {}, 60);
  assert.ok(Math.min(...upLog.map((s) => s.y)) < 600 - 100, 'straight up through it');
  assert.equal(bounces(upLog).length, 0);
  // Coming back down it lands on the deck: no drive downward, an ordinary landing.
  const down = run(up.step, (f) => f.grounded, {}, 120);
  assert.equal(bounces(down).length, 0);
  assert.equal(up.fighter.body.ground.id, 'deck');

  // Spiked onto its top from above: a rebound, off a platform still one-way.
  const spike = makeFighter({ stage, x: 500 });
  lift(spike.fighter, 500, 450);
  launch(spike.fighter, { speed: 1500, direction: 'reverseVertical' });
  run(spike.step, (f) => !!f.bounce, {}, 30);
  assert.equal(spike.fighter.body.y, 600, 'on the deck\'s top');
  assert.ok(spike.fighter.body.vy < -800);
  assert.equal(spike.fighter.grounded, false);
  assert.equal(stage.platforms[0].oneWay, true);
});

test('the main floor\'s cliff face is geometry: a launch into it rebounds, but past the ledge there is nothing to bounce off', () => {
  const stage = stageWith();
  // Off stage, below the ledge (feet 200 under the top), launched back at the cliff.
  const cliff = makeFighter({ stage, x: 2150 });
  lift(cliff.fighter, 2150, FLOOR + 200);
  launch(cliff.fighter, { speed: 1800, facing: -1 });
  run(cliff.step, (f) => !!f.bounce, {}, 30);
  assert.equal(cliff.fighter.bounce.normalX, 1, 'off the right cliff face');
  assert.equal(cliff.fighter.body.x, 2000 + HALF);
  assert.ok(cliff.fighter.body.vx > 1000, 'back out, away from the stage');
});

test('the Void is not geometry: a launch past the ledge flies straight into it, with no invisible bounce anywhere', () => {
  const stage = stageWith();
  const { fighter, step } = makeFighter({ stage, x: 1900 });
  launch(fighter, { speed: 2600 });
  const log = run(step, (f) => stage.inVoid(f.body), {}, 300);
  assert.equal(bounces(log).length, 0);
  assert.ok(log.every((s, i) => i === 0 || s.x > log[i - 1].x), 'never turned back');
  assert.ok(fighter.body.x > stage.void.right, 'crossed the kill line');
});

// ---- Launch Point, hits and sequences ---------------------------------------------------

// A duel whose target stands just in front of a wall behind it, 30 units away.
function wallDuel(opts = {}) {
  const x = 500;
  const gap = 40;
  const stage = stageWith({ solids: [wallAt('wall', x + gap + HALF + 30)] });
  return { stage, ...duel({ gap, stage, x, ...opts }) };
}

// Ticks a duel until the target has rebounded or `limit` steps pass; the rebound or null.
function tickForBounce(d, limit = 90, held = {}, targetHeld = {}) {
  for (let i = 0; i < limit; i++) {
    d.tick(held, targetHeld);
    if (d.target.bounce) return d.target.bounce;
  }
  return null;
}

test('Launch Point decides it: the same punch into the same wall stops a fresh target and rebounds a battered one', () => {
  const results = [];
  for (const lp of [0, 20, 40, 60, 100, 160]) {
    const d = wallDuel();
    d.target.combat.launchPoint = lp;
    d.tick(P('action1'));
    const b = tickForBounce(d);
    assert.equal(d.events[0].move, 'ba1');
    results.push({ lp, bounced: !!b, speed: b?.speed ?? 0 });
  }
  assert.deepEqual(results.map((r) => r.bounced), [false, false, false, true, true, true]);
  for (let i = 4; i < results.length; i++) assert.ok(results[i].speed > results[i - 1].speed, 'harder, the higher it is');
});

test('a Shield blocks the launch, so nothing rebounds, however high the Launch Point', () => {
  const d = wallDuel();
  d.target.combat.launchPoint = 300;
  d.tick({}, { defense: true });
  d.tick(P('action1'), { defense: true });
  const b = tickForBounce(d, 60, {}, { defense: true });
  assert.equal(d.events[0].type, 'block');
  assert.equal(b, null);
  assert.equal(d.target.launch, null);
  assert.equal(d.target.body.vx, 0);
});

test('a rebounding fighter can be hit again: the new launch replaces the old one, its rebounds counting on until it recovers', () => {
  const stage = stageWith({ solids: [wallAt('wall', 600)] });
  const { fighter, step } = makeFighter({ stage, x: 540 });
  launch(fighter, { speed: 1600 });
  run(step, (f) => !!f.bounce, {}, 30);
  assert.equal(fighter.launch.bounces, 1);
  assert.ok(fighter.body.vx < 0);
  // A fresh launch upward, mid-rebound.
  const e = launch(fighter, { speed: 1300, direction: 'vertical' });
  assert.deepEqual(fighter.launch, { headingX: 0, headingY: -1, bounces: 1 }, 'the new heading; the rebound still counts');
  assert.equal(fighter.body.vx, e.finalLaunch.x, 'the new hit\'s velocity, not a mix');
  assert.equal(fighter.body.vy, -1300);
  // A hit that launches nothing leaves the sequence as it is.
  const seq = fighter.launch;
  new CombatSystem().applyHit(fighter, fighter, createAttackDefinition({ id: 'tap', damage: 1, hitstop: 0 }), { detached: true });
  assert.equal(fighter.launch, seq);
});

test('a rebound keeps the fighter stunned while it flies off the surface, then control returns as usual', () => {
  const stage = stageWith({ solids: [wallAt('wall', 600)] });
  const { fighter, step } = makeFighter({ stage, x: 560 });
  launch(fighter, { speed: 700, hitstun: 0.02 });
  // Almost no stun of its own: the rebound's keeps it helpless.
  run(step, (f) => !!f.bounce, {}, 30);
  assert.ok(fighter.combat.stun >= B.stun - 1e-9, 'at least the rebound\'s stun');
  assert.equal(fighter.canAct(), false);
  assert.equal(fighter.state, 'hitstun');
  // Held left (away from the wall) or not, nothing changes until it is over.
  const steps = Math.round(B.stun / DT) - 1;
  for (let i = 0; i < steps; i++) {
    step({ left: true, ...(i === 3 ? P('action1') : {}) });
    assert.equal(fighter.combat.attack, null, 'cannot attack while it flies off');
  }
  // Grounded and free: the launch is over, and normal movement resumes.
  run(step, (f) => f.canAct() && f.launch === null, {}, 60);
  step({ ...P('action1') });
  assert.equal(fighter.combat.attack?.def.id, 'ba1');
});

test('acting again ends the launch: a fighter that has recovered stops against a wall like anyone', () => {
  const stage = stageWith({ solids: [{ id: 'wall', x: 1000, y: 200, w: 60, h: 600 }] });
  const { fighter, step } = makeFighter({ stage, x: 300 });
  lift(fighter, 300, 500);
  launch(fighter, { speed: 1300, hitstun: 0.05 });
  run(step, (f) => f.combat.stun <= 0, {}, 60);
  assert.ok(fighter.launch, 'still flying in it');
  step(P('jump')); // the air jump: it acts
  assert.equal(fighter.launch, null);
  run(step, (f) => f.body.wall === 1, {}, 60);
  assert.ok(fighter.body.impactVx > B.minImpactSpeed, 'as fast as a launch that would rebound');
  assert.equal(fighter.body.vx, 0);
  assert.equal(fighter.bounce, null);
});

test('a hard rebound freezes the fighter at the surface for a moment; a soft one does not', () => {
  const stage = stageWith({ solids: [wallAt('wall', 600)] });
  const hard = makeFighter({ stage, x: 560 });
  launch(hard.fighter, { speed: 2000 });
  run(hard.step, (f) => !!f.bounce, {}, 30);
  assert.ok(hard.fighter.bounce.speed >= B.hitstopSpeed);
  assert.ok(close(hard.fighter.combat.hitstop, B.hitstop));
  const at = hard.fighter.body.x;
  let frozen = 0;
  while (hard.fighter.combat.hitstop > 0 || hard.fighter.body.x === at) {
    hard.step();
    if (hard.fighter.body.x !== at) break;
    frozen++;
    assert.equal(hard.fighter.body.prevX, at, 'drawn still at the wall, not between two steps');
  }
  assert.equal(frozen, 2, 'fly, impact, pause, rebound');
  const soft = makeFighter({ stage, x: 560 });
  launch(soft.fighter, { speed: 800 });
  run(soft.step, (f) => !!f.bounce, {}, 30);
  assert.ok(soft.fighter.bounce.speed < B.hitstopSpeed);
  assert.equal(soft.fighter.combat.hitstop, 0);
});

test('a character may turn bouncing off: its launches stop at walls as before', () => {
  const stage = stageWith({ solids: [wallAt('wall', 600)] });
  const { fighter, step } = makeFighter({ stage, x: 540, character: { ...def, launchBounce: { enabled: false } } });
  launch(fighter, { speed: 2000 });
  const log = run(step, (f) => f.body.wall === 1, {}, 30);
  assert.equal(bounces(log).length, 0);
  assert.equal(fighter.body.vx, 0);
});

test('deterministic: the same launch into the same geometry rebounds identically, step for step', () => {
  const trace = () => {
    const stage = stageWith({ solids: [wallAt('west', 400), wallAt('east', 900), { id: 'roof', x: 380, y: 420, w: 600, h: 40 }] });
    const { fighter, step } = makeFighter({ stage, x: 650 });
    lift(fighter, 650, 700);
    fighter.steerHeld = { x: 1, y: -1 };
    launch(fighter, { speed: 3000, facing: -1, direction: 'horizontal' });
    return run(step, (f) => f.launch === null, {}, 900).map((s) => [s.x, s.y, s.vx, s.vy, s.bounce && { ...s.bounce }]);
  };
  const a = trace();
  assert.ok(a.filter((s) => s[4]).length >= 2, 'a real ricochet');
  assert.deepEqual(trace(), a);
});

test('a ricochet passes through the fighter in its way: pushboxes never pin it in front of an attacker', () => {
  // The target rebounds off a wall straight back at a standing opponent.
  const stage = stageWith({ solids: [wallAt('wall', 800)] });
  const d = duel({ gap: 200, stage, x: 560, pushboxes: true, targetFacing: 1 });
  const a0 = d.attacker.body.x;
  launch(d.target, { speed: 1400 });
  let passed = false;
  for (let i = 0; i < 120; i++) {
    d.tick();
    if (d.target.ricocheting && d.target.body.x < d.attacker.body.x) passed = true;
    if (passed && !d.target.ricocheting) break;
  }
  assert.ok(passed, 'it flew past the other fighter');
  assert.equal(d.attacker.body.x, a0, 'without shoving it');
  assert.equal(d.target.ricocheting, false, 'until its launch was over');
  // An ordinary launch (no rebound yet) is still stopped by pushboxes.
  const e = duel({ gap: 36, stage: stageWith(), x: 560, pushboxes: true });
  launch(e.target, { speed: 900, facing: -1 });
  e.tick();
  assert.ok(e.target.body.x - e.attacker.body.x >= def.pushbox.width - 1e-9, 'kept apart');
});

test('no wall loop: punching a battered opponent into a wall over and over ends within a few hits', () => {
  // Each hit sends the target into the wall; its rebound brings it straight
  // back into the attacker's reach, still stunned. Only the rebound cap
  // (counted until it recovers) and the pass-through end it.
  const longest = (lp, chase) => {
    const stage = stageWith({ solids: [wallAt('wall', 700)] });
    const d = duel({ gap: 40, stage, x: 700 - HALF - 30 - 40, pushboxes: true });
    d.target.combat.launchPoint = lp;
    let combo = 0;
    let best = 0;
    let free = false;
    for (let t = 0; t < 60 * 6; t++) {
      const held = t % 2 === 0 ? P('action1') : {};
      if (chase && d.target.body.x > d.attacker.body.x + 30) held.right = true;
      const before = d.events.length;
      d.tick(held);
      if (d.events.slice(before).some((e) => e.type === 'hit')) {
        combo = free ? 1 : combo + 1;
        best = Math.max(best, combo);
        free = false;
      } else if (d.target.canAct()) {
        free = true;
      }
    }
    return best;
  };
  for (const lp of [60, 70, 90, 120, 150]) {
    for (const chase of [false, true]) {
      const n = longest(lp, chase);
      assert.ok(n <= B.maxBounces + 2, `from ${lp}${chase ? ', chasing' : ''}: ${n} hits`);
    }
  }
});

// ---- Every source of launch -------------------------------------------------------

test('projectiles: the shuriken never launches, so it never makes anyone rebound', () => {
  const x = 500;
  const stage = stageWith({ solids: [wallAt('wall', x + 200 + HALF + 10)] });
  const d = duel({ gap: 200, stage, x });
  d.target.combat.launchPoint = 400;
  d.tick(P('primary'));
  const b = tickForBounce(d, 90);
  assert.equal(d.events[0].move, 'shuriken');
  assert.equal(b, null);
  assert.equal(d.target.launch, null);
});

test('a clone\'s punch launches through the same system: a battered target rebounds off a wall', () => {
  // The target faces the owner; the clone appears behind it and punches it
  // forward, into a wall between the two.
  const x = 300;
  const stage = stageWith({ solids: [wallAt('wall', 600, 40)] });
  const d = duel({ gap: 420, stage, x });
  d.target.combat.launchPoint = 100;
  d.tick({ charge: true });
  d.tick({ charge: true, ...P('action1') });
  assert.equal(d.clones.length, 1, 'a clone');
  const b = tickForBounce(d, 120, { charge: true });
  assert.ok(d.events.some((e) => e.summon && e.type === 'hit'), 'the clone hit');
  assert.ok(b, 'rebounded');
  assert.equal(b.normalX, 1, 'off the wall\'s far face');
  assert.ok(d.target.body.vx > 0, 'back toward the clone');
});

test('the Sphere Rush explosion launches through the same system: into a nearby wall, it rebounds', () => {
  const x = 500;
  const stage = stageWith({ solids: [wallAt('wall', 800)] });
  const d = duel({ gap: 140, stage, x, pushboxes: true });
  d.target.combat.launchPoint = 60;
  d.tick({ charge: true });
  d.tick({ charge: true, ...P('action2') });
  const t = d.attacker.technique;
  assert.ok(t, 'the Sphere Rush started');
  let b = null;
  for (let i = 0; i < 400 && !b; i++) {
    d.tick();
    b = d.target.bounce;
  }
  const blast = d.events.find((e) => e.move === 'explosionHit' || e.launchSpeed > 0);
  assert.ok(blast, 'the explosion launched it');
  assert.ok(blast.finalLaunch.x > 2000, 'sideways, along the rush');
  assert.ok(b, 'rebounded');
  assert.equal(b.normalX, -1);
  assert.ok(d.target.body.vx < -1000, 'hard back across the stage');
});

// ---- Real stages and the effects --------------------------------------------------

async function realBattle(mapId) {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../js/game/battle.js');
  const sprites = fakeSprites();
  const script = { held: {}, once: {} };
  const input = {
    flush() {},
    sample() {
      const out = { ...script.held, ...script.once };
      script.once = {};
      return out;
    },
  };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.p2.controller = null;
  battle.setPhase('fight');
  return { battle, script };
}

test('Desert: a hard punch drives the opponent into a rock outcrop and it rebounds, with sparks and a shake at the rock', async () => {
  const { battle, script } = await realBattle('desert');
  const rock = battle.stage.solids.find((s) => s.id === 'rock-east');
  const { p1, p2 } = battle;
  p2.body.x = p2.body.prevX = rock.x - HALF - 40;
  p1.body.x = p1.body.prevX = p2.body.x - 40;
  p1.facing = 1;
  p2.combat.launchPoint = 140;
  script.once = P('action1');
  let b = null;
  for (let i = 0; i < 60 && !b; i++) {
    battle.update(DT);
    b = p2.bounce;
  }
  assert.ok(b, 'rebounded off the rock');
  assert.equal(b.x, rock.x);
  assert.ok(p2.body.vx < 0);
  const spark = battle.fx.sparks.at(-1);
  assert.equal(spark.x, rock.x, 'sparks where it struck');
  assert.ok(spark.dx < 0, 'thrown off the rock');
  assert.ok(battle.fx.shake.amp > 0);
});

test('the effects: a hard rebound shakes a little and throws sparks off the surface; a soft one only sparks', () => {
  const fx = new HitEffects();
  fx.takeBounce({ x: 10, y: 20, normalX: -1, normalY: 0, speed: 2400, bounces: 1 });
  assert.equal(fx.sparks.length, 1);
  assert.deepEqual([fx.sparks[0].dx, fx.sparks[0].dy], [-1, 0]);
  assert.ok(fx.shake.amp > 0 && fx.shake.amp <= HIT_FX.bounce.max);
  assert.equal(fx.flashes.size, 0, 'a surface is not a hit: no flash');
  const soft = new HitEffects();
  soft.takeBounce({ x: 0, y: 0, normalX: 0, normalY: -1, speed: 600, bounces: 1 });
  assert.equal(soft.sparks.length, 1);
  assert.equal(soft.shake.amp, 0);
  const still = new HitEffects({ reducedMotion: true });
  still.takeBounce({ x: 0, y: 0, normalX: 1, normalY: 0, speed: 3000, bounces: 1 });
  assert.equal(still.shake.amp, 0, 'reduced motion: no shake');
  assert.equal(still.sparks.length, 1);
});

test('the lethal-launch slow motion sees rebounds: a wall that turns a launch back toward the Void makes it lethal', () => {
  // Off the right ledge, a floating block between the fighter and the stage,
  // the right Void 450 behind it and none below for a long way.
  const map = stageMap({ solids: [{ id: 'block', x: 2250, y: 400, w: 60, h: 600 }] });
  map.voidBounds = { ...map.voidBounds, right: 2000 + 900, bottom: FLOOR + 4000 };
  const stage = new StageCollision(map);
  const verdict = (character) => {
    const { fighter } = makeFighter({ stage, x: 2450, character });
    lift(fighter, 2450, FLOOR);
    const e = launch(fighter, { speed: 2000, facing: -1, hitstun: 0.3 });
    return launchIsLethal(e, stage, G, DT);
  };
  assert.equal(verdict({ ...def, launchBounce: { enabled: false } }), false, 'stopped at the block, it drifts down');
  assert.equal(verdict(def), true, 'rebounded off it, it flies into the Void');
});
