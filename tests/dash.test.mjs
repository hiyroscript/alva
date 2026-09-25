// Run with node --test tests/dash.test.mjs (no dependencies).
// Dash: #0001's dash frames and their registration, the horizontal press
// edges InputManager exposes (keyboard, touch, D-pad and stick alike), the
// double tap, what a Dash needs to start, what it costs, how it moves (and
// stops), its priority against attacks, Defense and Charge, and that it is
// movement only. Uses the real Fighter, InputManager and physics (see
// fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { StageCollision } from '../js/game/physics.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import { getMaxSpeed } from '../js/data/powers.js';
import { CONFIG } from '../js/config.js';
import {
  def, DT, BASE, SIM_CTX, fakeSprites, makeFighter, frameName, stageMap, duel,
} from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RIGHT = { right: true, rightPressed: true };
const LEFT = { left: true, leftPressed: true };
const DASH_STEPS = Math.round((def.animations.dash.frames.length / def.animations.dash.fps) / DT);
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

test('the two dash frames live in #0001\'s folder, are registered as a one-shot dash clip and preload with #0001', () => {
  const dir = readdirSync(ROOT + 'assets/characters/0001/');
  assert.deepEqual(dir.filter((n) => /^0001_dash\d\.png$/.test(n)).sort(), ['0001_dash1.png', '0001_dash2.png']);
  assert.deepEqual(readdirSync(ROOT).filter((n) => /dash/i.test(n)), [], 'none left at the repository root');
  const clip = def.animations.dash;
  assert.deepEqual(clip.frames, [`${BASE}dash1.png`, `${BASE}dash2.png`]);
  assert.equal(clip.loop, false, 'plays once');
  assert.equal(clip.fps, 10, 'its own rate');
  assert.equal(clip.sourceFacing, undefined, 'faces right, like the rest of #0001');
  const paths = characterFramePaths(def);
  for (const url of clip.frames) assert.ok(paths.includes(url), `${url} preloads`);
  // Drawn at 1x, unlike the upscaled rest of #0001: heightRatio fits its
  // tallest frame at one art pixel per file pixel against idle's height.
  const dash = clip.frames.map((u) => pngSize(ROOT + u.slice(2)));
  const idle = def.animations.idle.frames.map((u) => pngSize(ROOT + u.slice(2)));
  assert.deepEqual(dash, [{ w: 47, h: 41 }, { w: 48, h: 40 }]);
  const idleArtH = Math.max(...idle.map((s) => s.h / 16));
  assert.equal(idleArtH, 52);
  near(clip.heightRatio * idleArtH, Math.max(...dash.map((s) => s.h)), 'one art pixel per file pixel');
  const source = readFileSync(ROOT + 'js/data/characters.js', 'utf8');
  assert.match(source, /const DASH_FPS = 10;/);
});

test('movement data: dashSpeed about 1.8x the top speed, a 0.22 s double-tap window; the top speed itself untouched', () => {
  assert.equal(def.movement.dashTapWindow, 0.22);
  assert.equal(def.movement.dashSpeed, 600);
  const ratio = def.movement.dashSpeed / getMaxSpeed(def);
  assert.ok(ratio >= 1.6 && ratio <= 1.9, `${ratio}`);
  const { fighter } = makeFighter();
  assert.equal(fighter.maxSpeed, getMaxSpeed(def));
  near(fighter.dashDuration, 0.2, 'one pass of the clip');
});

// ---- Input ---------------------------------------------------------------------------

test('InputManager exposes leftPressed / rightPressed: one edge per press, from keys, touch, D-pad and stick alike', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code, repeat = false) => listeners[type]({ code, repeat, preventDefault() {} });
  const edges = () => {
    const f = input.sample();
    return [f.leftPressed, f.rightPressed];
  };
  assert.deepEqual(edges(), [false, false]);
  for (const [side, codes] of [['left', ['KeyA', 'ArrowLeft']], ['right', ['KeyD', 'ArrowRight']]]) {
    const want = side === 'left' ? [true, false] : [false, true];
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
  input.setTouch('right', true);
  assert.deepEqual(edges(), [false, true]);
  assert.deepEqual(edges(), [false, false]);
  input.setTouch('right', false);
  input.setTouch('right', true);
  assert.deepEqual(edges(), [false, true]);
  input.setTouch('right', false);
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
  assert.equal(input.sample().left, false);
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
    player.step(i % 200 < 100 ? { right: true } : { left: true });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.leftPressed, false);
    assert.equal(out.rightPressed, false);
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
  for (let i = 0; i < 30; i++) one.step(i === 0 ? RIGHT : { right: true });
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
  const window = Math.floor(def.movement.dashTapWindow / DT + 1e-9); // 13 steps
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

test('a Dash plays the real dash clip once, dash1 then dash2, then the fighter runs or stands', () => {
  const { fighter, step } = makeFighter();
  tap(step, RIGHT);
  step(RIGHT);
  const frames = [];
  let f = fighter;
  while (f.state === 'dash') {
    assert.equal(f.animator.anim.key, 'dash');
    frames.push(frameName(f));
    f = step({ right: true });
  }
  assert.equal(frames.length, DASH_STEPS, 'exactly one pass of the clip');
  assert.deepEqual([...new Set(frames)], ['0001_dash1.png', '0001_dash2.png']);
  assert.equal(frames.filter((n) => n === '0001_dash1.png').length, DASH_STEPS / 2);
  assert.equal(fighter.state, 'run', 'still holding right: running on');
  // Never a fast run: no run frame while dashing.
  assert.ok(frames.every((n) => !/run/.test(n)));
});

test('a Dash is movement only: no hitbox, damage, knockback or invulnerability, even straight through the opponent', () => {
  const d = duel({ gap: 120, pushboxes: true });
  d.tick(RIGHT);
  d.tick({});
  d.tick(RIGHT);
  assert.ok(d.attacker.dash);
  for (let i = 0; i < DASH_STEPS; i++) {
    assert.equal(d.attacker.combat.attack, null, 'no attack');
    assert.equal(d.attacker.combat.invulnerable, false, 'never invulnerable');
    assert.equal(d.attacker.combat.defenseAction, null);
    d.tick({ right: true });
  }
  assert.deepEqual(d.events, [], 'no hit of any kind');
  assert.equal(d.target.combat.knockback, 0);
  assert.equal(d.target.combat.stun, 0);
  // And it can be hit while dashing: the hit ends it.
  const hit = duel({ gap: 40, attackerFacing: -1, x: 540, pushboxes: true });
  hit.tick({}, RIGHT);
  hit.tick({}, {});
  hit.tick({ action1: true, action1Pressed: true }, RIGHT);
  assert.ok(hit.target.dash, 'the target dashes');
  hit.until(() => hit.events.length > 0);
  assert.equal(hit.events[0].type, 'hit');
  hit.tick();
  assert.equal(hit.target.dash, null, 'hitstun ends the Dash');
  assert.equal(hit.target.state, 'hitstun');
});

// ---- Gating ------------------------------------------------------------------------------

test('no Dash (and nothing spent) while airborne, attacking, stunned, bound, charging, already dashing, exhausted, short of stamina or without dash art', () => {
  const refused = (label, setup) => {
    const f = makeFighter(setup.options);
    setup.before?.(f);
    const before = f.fighter.combat.stamina;
    const wasDash = f.fighter.dash;
    setup.press(f);
    assert.equal(f.fighter.dash, wasDash, `${label}: no new Dash`);
    assert.ok(f.fighter.combat.stamina >= before - 1e-9, `${label}: nothing spent`);
  };
  refused('airborne', {
    before: (f) => { f.step({ jump: true, jumpPressed: true }); f.step(RIGHT); },
    press: (f) => f.step(RIGHT),
  });
  refused('attacking', {
    before: (f) => { f.step(RIGHT); f.step({ action1: true, action1Pressed: true }); },
    press: (f) => f.step(RIGHT),
  });
  refused('stunned', {
    before: (f) => { f.step(RIGHT); f.fighter.combat.stun = 0.3; },
    press: (f) => f.step(RIGHT),
  });
  refused('bound', {
    before: (f) => { f.step(RIGHT); f.fighter.combat.bind('rush'); },
    press: (f) => f.step(RIGHT),
  });
  refused('charging', {
    before: (f) => { for (let i = 0; i < 5; i++) f.step({ charge: true }); f.step({ charge: true, ...RIGHT }); },
    press: (f) => f.step({ charge: true, ...RIGHT }),
  });
  refused('already dashing', {
    before: (f) => { f.step(RIGHT); f.step(RIGHT); assert.ok(f.fighter.dash); f.step(RIGHT); },
    press: (f) => f.step(RIGHT),
  });
  refused('exhausted', {
    before: (f) => { f.fighter.combat.drainStamina(100); f.fighter.combat.regenStamina(60); f.step(RIGHT); },
    press: (f) => f.step(RIGHT),
  });
  refused('short of stamina', {
    before: (f) => { f.fighter.combat.setStamina(20); f.step(RIGHT); },
    press: (f) => f.step(RIGHT),
  });
  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    refused('no dash art', {
      options: { sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'dash')) },
      before: (f) => f.step(RIGHT),
      press: (f) => f.step(RIGHT),
    });
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.some((w) => /Dash has no animation frames/.test(w)), 'logged clearly');
});

test('a double tap that cannot Dash is used up, never queued for later', () => {
  const { fighter, step } = makeFighter();
  step({ action1: true, action1Pressed: true });
  step(RIGHT);
  step({});
  step(RIGHT); // the double tap, mid-attack: refused
  assert.equal(fighter.dash, null);
  while (fighter.combat.attack) step({ right: true });
  for (let i = 0; i < 20; i++) step({ right: true });
  assert.equal(fighter.dash, null, 'nothing happens once the attack is over');
  // The press after it is a fresh first tap, not a second.
  step({});
  step(RIGHT);
  assert.equal(fighter.dash, null);
});

// ---- Cost, movement and ending -----------------------------------------------------------

test('a Dash spends 25 exactly once as it starts, and bursts at dashSpeed for one pass of its clip', () => {
  const { fighter, step } = makeFighter();
  tap(step, RIGHT);
  const full = fighter.combat.stamina;
  assert.equal(full, 100);
  step(RIGHT);
  assert.equal(fighter.combat.stamina, 75, 'exactly 25, no refill on that step');
  assert.equal(fighter.body.vx, def.movement.dashSpeed, 'dash speed from the first step');
  const x0 = fighter.body.prevX;
  let n = 1;
  let x1 = fighter.body.x;
  while (fighter.dash) {
    const before = fighter.combat.stamina;
    step({});
    assert.ok(fighter.combat.stamina > before, 'refilling, never draining, while it dashes');
    if (fighter.dash) {
      assert.equal(fighter.body.vx, def.movement.dashSpeed, 'the speed is the Dash\'s, input or not');
      x1 = fighter.body.x;
    }
    n++;
  }
  assert.equal(n, DASH_STEPS + 1, 'over after one pass of the clip');
  near(x1 - x0, def.movement.dashSpeed * DT * DASH_STEPS, 'straight along the ground: 120 units in all');
  assert.ok(fighter.body.vx < def.movement.dashSpeed, 'then the normal movement slows it');
  assert.equal(fighter.grounded, true);
  // No top speed was changed on the way.
  assert.equal(fighter.maxSpeed, getMaxSpeed(def));
  for (let i = 0; i < 60; i++) step({ right: true });
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

test('Defense wins over a Dash on the same step; so does an attack; so does Charge', () => {
  // Defense and the second tap together: a Dodge, one cost only.
  const dodge = makeFighter();
  tap(dodge.step, RIGHT);
  dodge.step({ ...RIGHT, defense: true, defensePressed: true });
  assert.equal(dodge.fighter.state, 'defense');
  assert.equal(dodge.fighter.dash, null);
  assert.equal(dodge.fighter.combat.stamina, 75, 'the Dodge\'s 25 only');
  // An attack and the second tap together: the attack.
  const attack = makeFighter();
  tap(attack.step, RIGHT);
  attack.step({ ...RIGHT, action2: true, action2Pressed: true });
  assert.equal(attack.fighter.state, 'attack');
  assert.equal(attack.fighter.combat.attack.def.id, 'ba2');
  assert.equal(attack.fighter.dash, null);
  assert.equal(attack.fighter.combat.stamina, 100);
  // Charge pressed with the second tap: Charge, no Dash.
  const charge = makeFighter();
  tap(charge.step, RIGHT);
  charge.step({ ...RIGHT, charge: true, chargePressed: true });
  assert.equal(charge.fighter.dash, null);
  assert.equal(charge.fighter.state, 'charge');
  // And a Dash in progress rules out attacks, Dodges, jumps and Charge.
  const busy = makeFighter();
  tap(busy.step, RIGHT);
  busy.step(RIGHT);
  busy.step({ action1: true, action1Pressed: true, defense: true, defensePressed: true, jump: true, charge: true });
  assert.equal(busy.fighter.state, 'dash');
  assert.equal(busy.fighter.combat.attack, null);
  assert.equal(busy.fighter.combat.defenseAction, null);
  assert.equal(busy.fighter.grounded, true);
  assert.equal(busy.fighter.charging, false);
});
