// Run with node --test tests/systems/dash.test.mjs (no dependencies).
// Dash: #0001's mouvment frames (its Dash art) and their registration, the horizontal press
// edges InputManager exposes (keyboard, touch, D-pad and stick alike), the
// double tap, what a Dash needs to start, what it costs, how it moves (and
// stops), its priority against attacks and the Shield (Down held never
// stops one), and that it is movement only. Also the one-tap request of the Joystick touch layout's
// Dash buttons (InputManager.queueTouchMouvement → mouvementLeftPressed /
// mouvementRightPressed), which goes through the same tryDash and its rules.
// Uses the real Fighter, InputManager and physics (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../../js/data/characters.js';
import { StageCollision } from '../../js/game/physics.js';
import { TrainingAIController } from '../../js/game/fighters/fighter-controller.js';
import { CONFIG } from '../../js/config.js';
import {
  def, DT, BASE, MOVEMENT, SIM_CTX, fakeSprites, makeFighter, frameName, stageMap, duel,
} from '../helpers/fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RIGHT = { runRight: true, runRightPressed: true };
const LEFT = { runLeft: true, runLeftPressed: true };
const DASH_STEPS = Math.round(MOVEMENT.dashDuration / DT);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} vs ${b}`);

// A tap: pressed on one step, released on the next.
const tap = (step, press) => {
  step(press);
  return step({});
};
// A double tap of `press`, the second press `gap` steps after the first.
const doubleTap = (step, press = RIGHT, gap = 2) => {
  step(press);
  for (let i = 1; i < gap; i++) step({});
  return step(press);
};

// The width and height of a PNG, from its header.
function pngSize(path) {
  const buf = readFileSync(path);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---- The art ------------------------------------------------------------------------

test('the one mouvment frame lives in #0001\'s folder, is registered as a one-shot mouvment clip and preloads with #0001', () => {
  const dir = readdirSync(ROOT + 'assets/characters/0001/');
  assert.deepEqual(dir.filter((n) => /^0001_mouvment_\d\.png$/.test(n)).sort(), ['0001_mouvment_1.png']);
  assert.deepEqual(readdirSync(ROOT).filter((n) => /dash|mouvment/i.test(n)), [], 'none left at the repository root');
  assert.equal(def.animations.dash, undefined, 'the clip is mouvment, never dash');
  const clip = def.animations.mouvment;
  assert.deepEqual(clip.frames, [`${BASE}mouvment_1.png`]);
  assert.equal(clip.loop, false, 'plays once');
  assert.equal(clip.fps, 6, 'its own rate: one frame held across the whole Dash');
  assert.equal(clip.sourceFacing, undefined, 'faces right, like the rest of #0001');
  const paths = characterFramePaths(def);
  for (const url of clip.frames) assert.ok(paths.includes(url), `${url} preloads`);
  // Drawn at 1x like the rest of #0001: heightRatio fits its frame at one
  // art pixel per file pixel against idle's height.
  const dash = clip.frames.map((u) => pngSize(ROOT + u.slice(2)));
  const idle = def.animations.idle.frames.map((u) => pngSize(ROOT + u.slice(2)));
  assert.deepEqual(dash, [{ w: 61, h: 40 }]);
  const idleArtH = Math.max(...idle.map((s) => s.h));
  assert.equal(idleArtH, 63);
  near(clip.heightRatio * idleArtH, Math.max(...dash.map((s) => s.h)), 'one art pixel per file pixel');
});

test('movement data: the universal Dash, 1250 (about 3x the top speed) for a sixth of a second, about 208 units, a 0.22 s double-tap window', () => {
  assert.equal(MOVEMENT.dashTapWindow, 0.22);
  assert.equal(MOVEMENT.dashSpeed, 1250);
  const ratio = MOVEMENT.dashSpeed / MOVEMENT.maxSpeed;
  assert.ok(ratio >= 2.8 && ratio <= 3.1, `${ratio}`);
  const { fighter } = makeFighter();
  assert.equal(fighter.maxSpeed, MOVEMENT.maxSpeed);
  near(fighter.dashDuration, 1 / 6, 'the universal length, whatever the clip');
  assert.equal(DASH_STEPS, 10);
  // One pass of the clip across it: the clip's own pass matches.
  const clip = def.animations.mouvment;
  near(clip.frames.length / clip.fps, fighter.dashDuration);
  const reach = MOVEMENT.dashSpeed * fighter.dashDuration;
  assert.ok(Math.abs(reach - 208) < 1, 'about 208 units');
});

// ---- Input ---------------------------------------------------------------------------

test('InputManager exposes runLeftPressed / runRightPressed: one edge per press, from keys, touch, D-pad and stick alike', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code, repeat = false) => listeners[type]({ code, repeat, preventDefault() {} });
  const edges = () => {
    const f = input.sample();
    return [f.runLeftPressed, f.runRightPressed];
  };
  assert.deepEqual(edges(), [false, false]);
  for (const [side, codes] of [['runLeft', ['KeyA', 'ArrowLeft']], ['runRight', ['KeyD', 'ArrowRight']]]) {
    const want = side === 'runLeft' ? [true, false] : [false, true];
    for (const code of codes) {
      key('keydown', code);
      assert.deepEqual(edges(), want, `${code}: the first press is an edge`);
      key('keydown', code, true); // auto-repeat
      assert.deepEqual(edges(), [false, false], `${code}: holding is not`);
      assert.equal(input.sample()[side], true, 'still held');
      key('keyup', code);
      key('keydown', code);
      assert.deepEqual(edges(), want, `${code}: release and press again: a new edge`);
      key('keyup', code);
      input.sample();
    }
  }
  // Touch buttons.
  input.setTouch('runRight', true);
  assert.deepEqual(edges(), [false, true]);
  assert.deepEqual(edges(), [false, false]);
  input.setTouch('runRight', false);
  input.setTouch('runRight', true);
  assert.deepEqual(edges(), [false, true]);
  input.setTouch('runRight', false);
  // D-pad left / right.
  listeners.gamepadconnected();
  const button = (i, down) => {
    pad.buttons[i] = { pressed: down, value: down ? 1 : 0 };
    input.pollGamepads(0);
  };
  button(14, true);
  assert.deepEqual(edges(), [true, false]);
  input.pollGamepads(0);
  assert.deepEqual(edges(), [false, false], 'held: no more edges');
  button(14, false);
  button(15, true);
  assert.deepEqual(edges(), [false, true]);
  button(15, false);
  // The left stick: crossing from neutral into the held zone is one edge;
  // holding it there is none; back near neutral and out again is another.
  const stick = (x) => {
    pad.axes[0] = x;
    input.pollGamepads(0);
  };
  stick(-0.9);
  assert.deepEqual(edges(), [true, false]);
  stick(-0.95);
  stick(-0.8);
  assert.deepEqual(edges(), [false, false]);
  stick(0.1);
  assert.equal(input.sample().runLeft, false);
  stick(-0.9);
  assert.deepEqual(edges(), [true, false]);
  stick(0);
  // flush() drops them like any other buffered press.
  key('keydown', 'KeyD');
  input.flush();
  assert.deepEqual(edges(), [false, false]);
  key('keyup', 'KeyD');
});

test('neutral and CPU inputs carry the new fields, always false; the training CPU never dashes', () => {
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 200 < 100 ? { runRight: true } : { runLeft: true });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.runLeftPressed, false);
    assert.equal(out.runRightPressed, false);
    bot.step(out);
    assert.equal(bot.fighter.dash, null);
    assert.notEqual(bot.fighter.state, 'dash');
  }
  const locked = makeFighter();
  locked.fighter.inputLocked = true;
  doubleTap(locked.step);
  assert.equal(locked.fighter.dash, null, 'a locked fighter reads neutral input');
});

// ---- The double tap -------------------------------------------------------------------

test('one press never dashes; two presses of the same direction inside the window do, facing that way at once', () => {
  const one = makeFighter();
  for (let i = 0; i < 30; i++) one.step(i === 0 ? RIGHT : { runRight: true });
  assert.equal(one.fighter.dash, null, 'a held run is not a Dash');
  assert.notEqual(one.fighter.state, 'dash');
  // Right, released, right again: a Dash to the right.
  const { fighter, step } = makeFighter({ facing: -1 });
  tap(step, RIGHT);
  step(RIGHT);
  assert.ok(fighter.dash);
  assert.equal(fighter.dash.direction, 1);
  assert.equal(fighter.facing, 1, 'faces the Dash at once');
  assert.equal(fighter.state, 'dash');
  // Left twice: to the left, even while facing right.
  const left = makeFighter({ facing: 1 });
  tap(left.step, LEFT);
  left.step(LEFT);
  assert.equal(left.fighter.dash?.direction, -1);
  assert.equal(left.fighter.facing, -1);
  // No release needed if the input gives two clean press edges.
  const quick = makeFighter();
  quick.step(RIGHT);
  quick.step(RIGHT);
  assert.ok(quick.fighter.dash);
});

test('the window: the second press up to 0.22 s after the first dashes, any later does not', () => {
  const window = Math.floor(MOVEMENT.dashTapWindow / DT + 1e-9); // 13 steps
  const inside = makeFighter();
  doubleTap(inside.step, RIGHT, window);
  assert.ok(inside.fighter.dash, `${window} steps apart`);
  const outside = makeFighter();
  doubleTap(outside.step, RIGHT, window + 1);
  assert.equal(outside.fighter.dash, null, `${window + 1} steps apart`);
  // The late press starts a new double tap of its own.
  outside.step({});
  outside.step(RIGHT);
  assert.ok(outside.fighter.dash);
});

test('opposite directions never make a double tap: left then right, right then left', () => {
  for (const [first, second] of [[LEFT, RIGHT], [RIGHT, LEFT]]) {
    const { fighter, step } = makeFighter();
    tap(step, first);
    step(second);
    assert.equal(fighter.dash, null);
    // The second press replaced the first: its own double tap still works.
    step({});
    step(second);
    assert.ok(fighter.dash);
    assert.equal(fighter.dash.direction, second === RIGHT ? 1 : -1);
  }
  // Both at once cancels the tap waiting.
  const both = makeFighter();
  both.step(RIGHT);
  both.step({ ...RIGHT, ...LEFT });
  both.step(RIGHT);
  assert.equal(both.fighter.dash, null);
});

test('a Dash plays the real mouvment clip once, its one leap held throughout, then the fighter runs or stands', () => {
  const { fighter, step } = makeFighter();
  tap(step, RIGHT);
  step(RIGHT);
  const frames = [];
  let f = fighter;
  while (f.state === 'dash') {
    assert.equal(f.animator.anim.key, 'mouvment');
    frames.push(frameName(f));
    f = step({ runRight: true });
  }
  assert.equal(frames.length, DASH_STEPS, 'exactly one pass of the clip');
  assert.deepEqual([...new Set(frames)], ['0001_mouvment_1.png']);
  assert.equal(fighter.state, 'run', 'still holding right: running on');
  // Never a fast run: no run frame while dashing.
  assert.ok(frames.every((n) => !/run/.test(n)));
});

test('a Dash is movement only: no hitbox, damage, launch or invulnerability, even straight through the opponent', () => {
  const d = duel({ gap: 120, pushboxes: true });
  d.tick(RIGHT);
  d.tick({});
  d.tick(RIGHT);
  assert.ok(d.attacker.dash);
  for (let i = 0; i < DASH_STEPS; i++) {
    assert.equal(d.attacker.combat.attack, null, 'no attack');
    assert.equal('invulnerable' in d.attacker.combat, false, 'no invulnerability of any kind');
    assert.equal(d.attacker.combat.shielding, false);
    d.tick({ runRight: true });
  }
  assert.deepEqual(d.events, [], 'no hit of any kind');
  assert.equal(d.target.combat.launchPoint, 0);
  assert.equal(d.target.combat.stun, 0);
  // And it can be hit while dashing: the hit ends it.
  const hit = duel({ gap: 40, attackerFacing: -1, x: 540, pushboxes: true });
  hit.tick({}, RIGHT);
  hit.tick({}, {});
  hit.tick({ attack1: true, attack1Pressed: true }, RIGHT);
  assert.ok(hit.target.dash, 'the target dashes');
  hit.until(() => hit.events.length > 0);
  assert.equal(hit.events[0].type, 'hit');
  hit.tick();
  assert.equal(hit.target.dash, null, 'hitstun ends the Dash');
  assert.equal(hit.target.state, 'hitstun');
});

// ---- Gating ------------------------------------------------------------------------------

test('no Dash (and nothing spent) while attacking, stunned, paralyzed, shielding, already dashing, exhausted or without mouvment art; airborne, the double tap is the air dash', () => {
  const refused = (label, setup) => {
    const f = makeFighter(setup.options);
    setup.before?.(f);
    const before = f.fighter.combat.energy;
    const wasDash = f.fighter.dash;
    setup.press(f);
    assert.equal(f.fighter.dash, wasDash, `${label}: no new Dash`);
    assert.ok(f.fighter.combat.energy >= before - 1e-9, `${label}: nothing spent`);
  };
  // Airborne, the same double tap is the fighter's air dash, never a Dash
  // (see air-mouvment.test.mjs): its own clip and speed.
  const aloft = makeFighter();
  aloft.step({ jump: true, jumpPressed: true });
  aloft.step(RIGHT);
  aloft.step({});
  aloft.step(RIGHT);
  assert.equal(aloft.fighter.dash?.air, true, 'airborne: the air dash');
  assert.equal(aloft.fighter.dash.animation, 'midair_mouvment');
  assert.equal(aloft.fighter.dash.speed, MOVEMENT.airDashSpeed);
  assert.equal(aloft.fighter.tryDash(1), false, 'tryDash itself is the ground\'s');
  refused('attacking', {
    before: (f) => { f.step(RIGHT); f.step({ attack1: true, attack1Pressed: true }); },
    press: (f) => f.step(RIGHT),
  });
  refused('stunned', {
    before: (f) => { f.step(RIGHT); f.fighter.combat.stun = 0.3; },
    press: (f) => f.step(RIGHT),
  });
  refused('paralyzed', {
    before: (f) => { f.step(RIGHT); f.fighter.combat.paralyze(1); },
    press: (f) => f.step(RIGHT),
  });
  refused('shielding', {
    before: (f) => { f.step({ shield: true, shieldPressed: true }); f.step({ shield: true, ...RIGHT }); },
    press: (f) => f.step({ shield: true, ...RIGHT }),
  });
  refused('holding Shield on the tap', {
    before: (f) => f.step(RIGHT),
    press: (f) => f.step({ shield: true, shieldPressed: true, ...RIGHT }),
  });
  refused('already dashing', {
    before: (f) => { f.step(RIGHT); f.step(RIGHT); assert.ok(f.fighter.dash); f.step(RIGHT); },
    press: (f) => f.step(RIGHT),
  });
  refused('exhausted', {
    before: (f) => { f.fighter.combat.setEnergy(0); f.fighter.combat.regenEnergy(60); f.step(RIGHT); },
    press: (f) => f.step(RIGHT),
  });
  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    refused('no mouvment art', {
      options: { sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'mouvment')) },
      before: (f) => f.step(RIGHT),
      press: (f) => f.step(RIGHT),
    });
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.some((w) => /Dash has no mouvment animation frames/.test(w)), 'logged clearly');
});

test('short of Energy a Dash still happens, but takes all that is left: the bar is empty, gray, and locks the next one until full', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  tap(step, RIGHT);
  c.setEnergy(10);
  step(RIGHT);
  assert.ok(fighter.dash, 'a Dash on 10 Energy');
  assert.equal(fighter.body.vx, MOVEMENT.dashSpeed, 'the full burst, not a weaker one');
  assert.deepEqual([c.energy, c.energyExhausted], [0, true]);
  while (fighter.dash) step({});
  for (let i = 0; i < 10; i++) step({});
  tap(step, RIGHT);
  step(RIGHT);
  assert.equal(fighter.dash, null, 'exhausted: no Dash until full again');
  // Exactly its cost left empties it too.
  const exact = makeFighter();
  tap(exact.step, RIGHT);
  exact.fighter.combat.setEnergy(def.energy.dashCost);
  exact.step(RIGHT);
  assert.ok(exact.fighter.dash);
  assert.deepEqual([exact.fighter.combat.energy, exact.fighter.combat.energyExhausted], [0, true]);
  // With more left, only its cost goes.
  const plenty = makeFighter();
  tap(plenty.step, RIGHT);
  plenty.fighter.combat.setEnergy(40);
  plenty.step(RIGHT);
  assert.deepEqual([plenty.fighter.combat.energy, plenty.fighter.combat.energyExhausted], [40 - def.energy.dashCost, false]);
});

test('a double tap that cannot Dash is used up, never queued for later', () => {
  const { fighter, step } = makeFighter();
  step({ attack1: true, attack1Pressed: true });
  step(RIGHT);
  step({});
  step(RIGHT); // the double tap, mid-attack: refused
  assert.equal(fighter.dash, null);
  while (fighter.combat.attack) step({ runRight: true });
  for (let i = 0; i < 20; i++) step({ runRight: true });
  assert.equal(fighter.dash, null, 'nothing happens once the attack is over');
  // The press after it is a fresh first tap, not a second.
  step({});
  step(RIGHT);
  assert.equal(fighter.dash, null);
});

// ---- Cost, movement and ending -----------------------------------------------------------

test('a Dash spends its cost (12) exactly once as it starts, and bursts at dashSpeed for one pass of its clip', () => {
  const { fighter, step } = makeFighter();
  tap(step, RIGHT);
  const full = fighter.combat.energy;
  assert.equal(full, 100);
  step(RIGHT);
  assert.equal(def.energy.dashCost, 12);
  assert.equal(fighter.combat.energy, 88, 'exactly 12, no refill on that step');
  assert.equal(fighter.body.vx, MOVEMENT.dashSpeed, 'dash speed from the first step');
  const x0 = fighter.body.prevX;
  let n = 1;
  let x1 = fighter.body.x;
  while (fighter.dash) {
    const before = fighter.combat.energy;
    step({});
    assert.ok(fighter.combat.energy > before, 'refilling, never draining, while it dashes');
    if (fighter.dash) {
      assert.equal(fighter.body.vx, MOVEMENT.dashSpeed, 'the speed is the Dash\'s, input or not');
      x1 = fighter.body.x;
    }
    n++;
  }
  assert.equal(n, DASH_STEPS + 1, 'over after one pass of the clip');
  near(x1 - x0, MOVEMENT.dashSpeed * DT * DASH_STEPS, 'straight along the ground');
  assert.ok(Math.abs(x1 - x0 - 208) < 1, 'about 208 units in all');
  assert.ok(fighter.body.vx < MOVEMENT.dashSpeed, 'then the normal movement slows it');
  assert.ok(fighter.body.vx > MOVEMENT.maxSpeed, 'carrying its burst on, never reset');
  assert.equal(fighter.grounded, true);
  // No top speed was changed on the way.
  assert.equal(fighter.maxSpeed, MOVEMENT.maxSpeed);
  for (let i = 0; i < 60; i++) step({ runRight: true });
  near(fighter.body.vx, fighter.maxSpeed, 'running settles back at the normal top speed');
});

test('a solid stops a Dash where it stands; walking off a ledge ends it, and the fighter falls', () => {
  const walled = new StageCollision(stageMap({ solids: [{ id: 'crate', x: 640, y: 700, w: 60, h: 100 }] }));
  const w = makeFighter({ x: 560, stage: walled });
  tap(w.step, RIGHT);
  w.step(RIGHT);
  assert.ok(w.fighter.dash);
  for (let i = 0; i < DASH_STEPS && w.fighter.dash; i++) w.step({});
  assert.equal(w.fighter.dash, null);
  assert.equal(w.fighter.body.x, 640 - w.fighter.body.halfW, 'against the crate, never through it');
  assert.equal(w.fighter.body.vx, 0);

  const edge = makeFighter({ x: 1960 });
  tap(edge.step, RIGHT);
  edge.step(RIGHT);
  assert.ok(edge.fighter.dash);
  let steps = 0;
  while (edge.fighter.grounded && steps++ < DASH_STEPS) edge.step({});
  assert.equal(edge.fighter.grounded, false, 'off the ledge');
  assert.equal(edge.fighter.dash, null, 'the Dash ended as the ground went');
  assert.ok(['jump', 'fall'].includes(edge.fighter.state));
  assert.ok(edge.fighter.body.vx > 0, 'falling on with its speed');
});

// ---- Priority -------------------------------------------------------------------------------

test('Shield wins over a Dash on the same step; so does an attack; Down held never does', () => {
  // Shield and the second tap together: the Shield, and nothing spent.
  const shield = makeFighter();
  tap(shield.step, RIGHT);
  shield.step({ ...RIGHT, shield: true, shieldPressed: true });
  assert.equal(shield.fighter.state, 'shield');
  assert.equal(shield.fighter.combat.shielding, true);
  assert.equal(shield.fighter.dash, null);
  assert.equal(shield.fighter.combat.energy, 100, 'raising the Shield is free');
  // An attack and the second tap together: the attack.
  const attack = makeFighter();
  tap(attack.step, RIGHT);
  attack.step({ ...RIGHT, attack2: true, attack2Pressed: true });
  assert.equal(attack.fighter.state, 'attack');
  assert.equal(attack.fighter.combat.attack.def.id, 'attack2');
  assert.equal(attack.fighter.dash, null);
  assert.equal(attack.fighter.combat.energy, 100);
  // Down pressed and held through the double tap: only a direction, so
  // the Dash comes out all the same, and costs what it always does.
  const down = makeFighter();
  down.step({ ...RIGHT, down: true, downPressed: true });
  down.step({ down: true });
  down.step({ ...RIGHT, down: true });
  assert.ok(down.fighter.dash, 'a Dash with Down held');
  assert.equal(down.fighter.state, 'dash');
  assert.equal(down.fighter.combat.energy, 100 - def.energy.dashCost);
  // And a Dash in progress rules out attacks, the Shield and jumps; Down
  // does nothing to it.
  const busy = makeFighter();
  tap(busy.step, RIGHT);
  busy.step(RIGHT);
  busy.step({ attack1: true, attack1Pressed: true, shield: true, shieldPressed: true, jump: true, down: true });
  assert.equal(busy.fighter.state, 'dash');
  assert.equal(busy.fighter.combat.attack, null);
  assert.equal(busy.fighter.combat.shielding, false);
  assert.equal(busy.fighter.grounded, true);
});

// ---- A Dash asked for in one tap (the Joystick layout's Dash buttons) ------------

const MOUVEMENT_RIGHT = { mouvementRightPressed: true };
const MOUVEMENT_LEFT = { mouvementLeftPressed: true };

test('InputManager.queueTouchMouvement is a one-sample request: never a held direction or a press edge', async () => {
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, hidden: false };
  const { InputManager } = await import('../../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const f0 = input.sample();
  assert.equal(f0.mouvementLeftPressed, false);
  assert.equal(f0.mouvementRightPressed, false);
  const pick = (f) => ({
    mouvementLeft: f.mouvementLeftPressed, mouvementRight: f.mouvementRightPressed,
    runLeft: f.runLeft, runRight: f.runRight, runLeftPressed: f.runLeftPressed, runRightPressed: f.runRightPressed,
  });
  input.queueTouchMouvement(1);
  assert.equal(input.lastDevice, 'touch');
  assert.deepEqual(pick(input.sample()),
    { mouvementLeft: false, mouvementRight: true, runLeft: false, runRight: false, runLeftPressed: false, runRightPressed: false });
  assert.deepEqual(pick(input.sample()),
    { mouvementLeft: false, mouvementRight: false, runLeft: false, runRight: false, runLeftPressed: false, runRightPressed: false }, 'gone after one sample');
  input.queueTouchMouvement(-1);
  assert.deepEqual(pick(input.sample()),
    { mouvementLeft: true, mouvementRight: false, runLeft: false, runRight: false, runLeftPressed: false, runRightPressed: false });
  assert.equal(input.isHeld('runLeft'), false);
  // The latest request wins; never both.
  input.queueTouchMouvement(-1);
  input.queueTouchMouvement(1);
  const both = input.sample();
  assert.deepEqual([both.mouvementLeftPressed, both.mouvementRightPressed], [false, true]);
  // Anything but 1 or -1 is ignored.
  for (const bad of [0, 2, -2, 'mouvementRight', null, undefined, NaN]) {
    input.queueTouchMouvement(bad);
    const f = input.sample();
    assert.deepEqual([f.mouvementLeftPressed, f.mouvementRightPressed], [false, false], String(bad));
  }
  // flush() (a menu closing, a respawn) and clear() (blur, pause) drop it.
  input.queueTouchMouvement(1);
  input.flush();
  assert.equal(input.sample().mouvementRightPressed, false);
  input.queueTouchMouvement(-1);
  input.clear();
  assert.equal(input.sample().mouvementLeftPressed, false);
  // Alongside a held touch direction it leaves that direction alone.
  input.setTouch('runLeft', true);
  input.sample();
  input.queueTouchMouvement(1);
  const f = input.sample();
  assert.deepEqual([f.runLeft, f.runLeftPressed, f.runRight, f.runRightPressed, f.mouvementRightPressed], [true, false, false, false, true]);
  input.setTouch('runLeft', false);
});

test('every controller\'s input carries the request fields, false unless asked', async () => {
  const { blankInput } = await import('../../js/game/fighters/fighter-controller.js');
  const blank = blankInput();
  assert.equal(blank.mouvementLeftPressed, false);
  assert.equal(blank.mouvementRightPressed, false);
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 600; i++) {
    player.step(i % 200 < 100 ? { runRight: true } : { runLeft: true });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.mouvementLeftPressed, false);
    assert.equal(out.mouvementRightPressed, false);
    bot.step(out);
  }
  const source = readFileSync(ROOT + 'js/game/ai/combat-ai.js', 'utf8');
  assert.doesNotMatch(source, /dash(Left|Right)Pressed|queueTouchMouvement/, 'the combat AI still dashes by double tap only');
});

test('one request Dashes at once through tryDash: no double tap, no held direction, the same cost, speed, clip and facing', () => {
  for (const [held, direction] of [[MOUVEMENT_RIGHT, 1], [MOUVEMENT_LEFT, -1]]) {
    const { fighter, step } = makeFighter({ facing: -direction });
    const calls = [];
    const tryDash = fighter.tryDash.bind(fighter);
    fighter.tryDash = (...args) => { calls.push(args[0]); return tryDash(...args); };
    step(held);
    assert.deepEqual(calls, [direction], 'the same tryDash as a double tap');
    assert.ok(fighter.dash, 'one step, one request');
    assert.equal(fighter.dash.direction, direction);
    assert.equal(fighter.facing, direction, 'faces the Dash at once');
    assert.equal(fighter.state, 'dash');
    assert.equal(fighter.animator.anim.key, 'mouvment');
    assert.equal(frameName(fighter), '0001_mouvment_1.png', 'the clip from its first frame');
    assert.equal(fighter.body.vx, direction * MOVEMENT.dashSpeed);
    assert.equal(fighter.combat.energy, 100 - def.energy.dashCost, 'exactly the Dash cost');
    // It runs its one pass of the clip, then the fighter stands.
    let n = 1;
    while (fighter.dash) {
      step({});
      n++;
    }
    assert.equal(n, DASH_STEPS + 1);
    assert.equal(fighter.dashTap, null, 'never a waiting first tap');
  }
});

test('a request is not a direction press: it never pairs with a tap before it or after it', () => {
  // A first tap waiting, then a request that is refused (Shield held): the
  // tap is forgotten, so the next Right press is a first tap again.
  const { fighter, step } = makeFighter();
  step(RIGHT);
  assert.ok(fighter.dashTap, 'a first tap waiting');
  step({ ...MOUVEMENT_RIGHT, shield: true, shieldPressed: true });
  assert.equal(fighter.dash, null, 'refused while Shield is held');
  assert.equal(fighter.dashTap, null, 'and the waiting tap is gone');
  step({});
  step(RIGHT);
  assert.equal(fighter.dash, null, 'one Right press after it is only a first tap');
  // A request with this step's own Right press: that press is not a tap.
  const same = makeFighter();
  same.step({ ...RIGHT, ...MOUVEMENT_LEFT });
  assert.equal(same.fighter.dash?.direction, -1, 'the request\'s own direction');
  assert.equal(same.fighter.dashTap, null);
  // Both directions at once ask for nothing (and spend nothing).
  const both = makeFighter();
  both.step({ ...MOUVEMENT_LEFT, ...MOUVEMENT_RIGHT });
  assert.equal(both.fighter.dash, null);
  assert.equal(both.fighter.combat.energy, 100);
  // The keyboard double tap is unchanged beside it.
  const keys = makeFighter();
  tap(keys.step, RIGHT);
  keys.step(RIGHT);
  assert.ok(keys.fighter.dash);
});

test('a request obeys every Dash rule: no Dash (and nothing spent) attacking, stunned, paralyzed, shielding, dashing, exhausted or without art; airborne it is the air dash', () => {
  const refused = (label, setup) => {
    const f = makeFighter(setup.options);
    setup.before?.(f);
    const before = f.fighter.combat.energy;
    const wasDash = f.fighter.dash;
    setup.press(f);
    assert.equal(f.fighter.dash, wasDash, `${label}: no new Dash`);
    assert.ok(f.fighter.combat.energy >= before - 1e-9, `${label}: nothing spent`);
  };
  const aloft = makeFighter();
  aloft.step({ jump: true, jumpPressed: true });
  aloft.step({});
  aloft.step(MOUVEMENT_RIGHT);
  assert.equal(aloft.fighter.dash?.air, true, 'airborne: the air dash');
  refused('attacking', {
    before: (f) => f.step({ attack1: true, attack1Pressed: true }),
    press: (f) => f.step(MOUVEMENT_RIGHT),
  });
  refused('stunned', {
    before: (f) => { f.fighter.combat.stun = 0.3; },
    press: (f) => f.step(MOUVEMENT_RIGHT),
  });
  refused('paralyzed', {
    before: (f) => f.fighter.combat.paralyze(1),
    press: (f) => f.step(MOUVEMENT_RIGHT),
  });
  refused('shielding', {
    before: (f) => f.step({ shield: true, shieldPressed: true }),
    press: (f) => f.step({ shield: true, ...MOUVEMENT_RIGHT }),
  });
  refused('holding Shield on the request', {
    press: (f) => f.step({ shield: true, shieldPressed: true, ...MOUVEMENT_RIGHT }),
  });
  refused('already dashing', {
    before: (f) => { f.step(MOUVEMENT_RIGHT); assert.ok(f.fighter.dash); f.step({}); },
    press: (f) => f.step(MOUVEMENT_RIGHT),
  });
  refused('exhausted', {
    before: (f) => { f.fighter.combat.setEnergy(0); f.fighter.combat.regenEnergy(60); f.step({}); },
    press: (f) => f.step(MOUVEMENT_RIGHT),
  });
  refused('locked input (intro, time-up)', {
    before: (f) => { f.fighter.inputLocked = true; },
    press: (f) => f.step(MOUVEMENT_RIGHT),
  });
  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    refused('no mouvment art', {
      options: { sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'mouvment')) },
      press: (f) => f.step(MOUVEMENT_RIGHT),
    });
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.some((w) => /Dash has no mouvment animation frames/.test(w)));
  // A refused request is used up, never queued for later.
  const { fighter, step } = makeFighter();
  step({ attack1: true, attack1Pressed: true });
  step(MOUVEMENT_RIGHT);
  while (fighter.combat.attack) step({});
  for (let i = 0; i < 20; i++) step({});
  assert.equal(fighter.dash, null);
});

test('a request short of Energy empties the bar like any Dash; walls and ledges end it; attacks and the Shield win the step, Down never does', () => {
  const low = makeFighter();
  low.fighter.combat.setEnergy(10);
  low.step(MOUVEMENT_RIGHT);
  assert.ok(low.fighter.dash);
  assert.deepEqual([low.fighter.combat.energy, low.fighter.combat.energyExhausted], [0, true]);

  const walled = new StageCollision(stageMap({ solids: [{ id: 'crate', x: 640, y: 700, w: 60, h: 100 }] }));
  const w = makeFighter({ x: 560, stage: walled });
  w.step(MOUVEMENT_RIGHT);
  for (let i = 0; i < DASH_STEPS && w.fighter.dash; i++) w.step({});
  assert.equal(w.fighter.dash, null);
  assert.equal(w.fighter.body.x, 640 - w.fighter.body.halfW, 'against the crate, never through it');

  const edge = makeFighter({ x: 1960 });
  edge.step(MOUVEMENT_RIGHT);
  let steps = 0;
  while (edge.fighter.grounded && steps++ < DASH_STEPS) edge.step({});
  assert.equal(edge.fighter.grounded, false, 'off the ledge');
  assert.equal(edge.fighter.dash, null);

  const attack = makeFighter();
  attack.step({ ...MOUVEMENT_RIGHT, attack2: true, attack2Pressed: true });
  assert.equal(attack.fighter.state, 'attack');
  assert.equal(attack.fighter.dash, null);
  const shield = makeFighter();
  shield.step({ ...MOUVEMENT_RIGHT, shield: true, shieldPressed: true });
  assert.equal(shield.fighter.combat.shielding, true);
  assert.equal(shield.fighter.dash, null);
  for (const held of [{ down: true, downPressed: true }, { down: true }]) {
    const down = makeFighter();
    for (let i = 0; i < 5; i++) down.step({ down: true });
    down.step({ ...MOUVEMENT_RIGHT, ...held });
    assert.ok(down.fighter.dash, 'Down pressed or held: the Dash all the same');
  }
});

test('end to end: a Right mouvement tap through the real InputManager and PlayerController Dashes once', async () => {
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, hidden: false };
  const { InputManager } = await import('../../js/core/input-manager.js');
  const { PlayerController } = await import('../../js/game/fighters/fighter-controller.js');
  const { Fighter } = await import('../../js/game/fighters/fighter.js');
  const { STAGE } = await import('../helpers/fighter-harness.mjs');
  const input = new InputManager(CONFIG.bindings);
  const fighter = new Fighter({
    def, sprites: fakeSprites(), stage: STAGE, slot: 0, label: 'P1',
    controller: new PlayerController(input), spawn: { x: 500, facing: -1 },
  });
  fighter.update(DT, SIM_CTX);
  input.queueTouchMouvement(1);
  fighter.update(DT, SIM_CTX);
  assert.equal(fighter.dash?.direction, 1);
  assert.equal(fighter.combat.energy, 100 - def.energy.dashCost);
  const dashes = [];
  for (let i = 0; i < 40; i++) {
    fighter.update(DT, SIM_CTX);
    if (fighter.dash && fighter.dash.time === 0) dashes.push(i);
  }
  assert.deepEqual(dashes, [], 'one tap, one Dash: nothing repeats');
  assert.equal(input.isHeld('runRight'), false);
});
