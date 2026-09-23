// Run with node --test tests/charge.test.mjs (no dependencies).
// #0001 Charge: artwork registration, the startup-then-loop frame order, held
// (never toggled) input, grounded-only entry, movement lock, state priority,
// no combat effect, the gameplay Down -> Charge rename, and the Energy stat.
// Uses the real Fighter, CombatSystem, physics and InputManager (see
// fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { ACTIONS, CONFIG } from '../js/config.js';
import {
  def, DT, BASE, SIM_CTX, STAGE, fakeSprites, makeFighter, frameName, stepUntil, steps, duel,
} from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHARGE = { charge: true };
const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };
const JUMP = { jump: true, jumpPressed: true };
const CHARGE_FRAMES = ['0001_charge1.png', '0001_charge2.png', '0001_chargea.png', '0001_chargeb.png'];
const isChargeFrame = (name) => CHARGE_FRAMES.includes(name);

// The uploaded PNGs, byte for byte.
const SHA256 = {
  '0001_charge1.png': '82369588a62d1d1d93c85cae095b413f91b3fc880001a2084787442da93efbaf',
  '0001_charge2.png': '28739fdd884f5e271d5458118fe1ffbe2325f3bf53ebea3440672e46214534d0',
  '0001_chargea.png': 'f14f01451ab15056f0b57c0915d3bd4211e1760699f2067b010dcf1e95c47b21',
  '0001_chargeb.png': '8ba0b0c8f2ec29cb72b673531b7c87dac25d173c70447e9aa4e5105631a39e7c',
};

// Frames shown while stepping with `held`, one entry per step.
function record(step, held, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = step(held);
    out.push({ frame: frameName(f), state: f.state, anim: f.animator.anim.key });
  }
  return out;
}

// Consecutive duplicates removed, with how many steps each frame was shown.
function runs(log) {
  const out = [];
  for (const { frame } of log) {
    if (out.length && out.at(-1).frame === frame) out.at(-1).steps++;
    else out.push({ frame, steps: 1 });
  }
  return out;
}

// Holds Charge from idle until the sustained loop is showing.
function chargeIntoLoop(step, extra = {}) {
  stepUntil(step, (f) => f.animator.anim.key === 'chargeLoop', { ...CHARGE, ...extra });
}

// ---- Artwork ------------------------------------------------------------------

test('the four charge sprites live in the canonical #0001 folder, unchanged, and nowhere else', () => {
  const paths = characterFramePaths(def);
  for (const name of CHARGE_FRAMES) {
    const url = `./assets/characters/0001/${name}`;
    assert.ok(paths.includes(url), `${url} is preloaded`);
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + name), `no root copy of ${name}`);
    const bytes = readFileSync(ROOT + url.slice(2));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256[name], `${name} bytes are the upload`);
  }
  assert.deepEqual(readdirSync(ROOT).filter((n) => /charge/i.test(n)), []);
  const dir = readdirSync(ROOT + 'assets/characters/0001/').filter((n) => /charge/.test(n)).sort();
  assert.deepEqual(dir, CHARGE_FRAMES);
});

test('Charge is two clips: a non-looping startup and a looping sustain, with idle fallbacks', () => {
  const { chargeStart, chargeLoop } = def.animations;
  assert.deepEqual(chargeStart.frames, [`${BASE}charge1.png`, `${BASE}charge2.png`]);
  assert.deepEqual(chargeLoop.frames, [`${BASE}chargea.png`, `${BASE}chargeb.png`]);
  assert.equal(chargeStart.loop, false);
  assert.equal(chargeLoop.loop, true);
  assert.equal(chargeStart.fps, 10);
  assert.equal(chargeLoop.fps, chargeStart.fps);
  // The art is 52 art pixels tall, like the tallest idle frame.
  assert.equal(chargeStart.heightRatio, 1);
  assert.equal(chargeLoop.heightRatio, 1);
  for (const url of [...chargeStart.frames, ...chargeLoop.frames]) {
    assert.ok(url.startsWith('./assets/characters/0001/'), `${url} is relative and canonical`);
  }
  assert.deepEqual(def.animationFallbacks.chargeStart, { animation: 'idle', frame: 0 });
  assert.deepEqual(def.animationFallbacks.chargeLoop, { animation: 'idle', frame: 0 });
  // No crouch left over from the old Down action.
  assert.equal(def.animationFallbacks.crouch, undefined);
  assert.equal(def.animations.charge, undefined, 'one logical state, drawn by two clips');
});

test('Charge is a fighter state, never an attack or a combat action', () => {
  assert.ok(!COMBAT_ACTIONS.includes('charge'));
  assert.equal(def.actions.charge, undefined);
  for (const [id, atk] of Object.entries(def.attacks)) {
    assert.doesNotMatch(id, /charge/i);
    assert.doesNotMatch(atk.animation, /charge/i);
  }
  const { fighter } = makeFighter();
  assert.equal(fighter.chargeStartDuration, 2 / def.animations.chargeStart.fps);
  assert.equal(fighter.charging, false);
  assert.equal('crouching' in fighter, false);
});

// ---- Frame order ----------------------------------------------------------------

test('holding Charge plays charge1, charge2 once, then loops chargea / chargeb', () => {
  const { fighter, step } = makeFighter();
  const log = record(step, CHARGE, steps(5));
  assert.ok(log.every((s) => s.state === 'charge'), 'one logical state throughout');
  const shown = runs(log);
  assert.deepEqual(shown.slice(0, 6).map((r) => r.frame), [
    '0001_charge1.png', '0001_charge2.png',
    '0001_chargea.png', '0001_chargeb.png', '0001_chargea.png', '0001_chargeb.png',
  ]);
  // After the startup: only A and B, strictly alternating, many cycles.
  const loop = shown.slice(2);
  assert.ok(loop.length >= 40, `${loop.length} loop frames`);
  loop.forEach((r, i) => assert.equal(r.frame, i % 2 ? '0001_chargeb.png' : '0001_chargea.png', `loop frame ${i}`));
  assert.equal(shown.filter((r) => r.frame === '0001_charge1.png').length, 1, 'charge1 never repeats');
  assert.equal(shown.filter((r) => r.frame === '0001_charge2.png').length, 1, 'charge2 never repeats');

  // Each frame is on screen for one frame time (1 / fps), the startup for
  // exactly one pass of its clip, before the loop takes over.
  const frameSteps = Math.round(1 / def.animations.chargeStart.fps / DT);
  assert.equal(shown[0].steps, frameSteps);
  assert.equal(shown[1].steps, frameSteps);
  assert.equal(shown[0].steps + shown[1].steps, Math.round(fighter.chargeStartDuration / DT));
  assert.ok(log.slice(0, shown[0].steps + shown[1].steps).every((s) => s.anim === 'chargeStart'));
  assert.ok(log.slice(shown[0].steps + shown[1].steps).every((s) => s.anim === 'chargeLoop'));
  for (const r of loop.slice(1, -1)) assert.ok(Math.abs(r.steps - frameSteps) <= 1, `loop frame lasts ${r.steps} steps`);
});

test('releasing Charge leaves the state at once; nothing is latched', () => {
  const { fighter, step } = makeFighter();
  chargeIntoLoop(step);
  assert.equal(fighter.state, 'charge');
  assert.equal(fighter.charging, true);

  step();
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.charging, false);
  assert.equal(frameName(fighter), '0001_idle1.png');
  for (const s of record(step, {}, steps(1))) {
    assert.equal(s.state, 'idle');
    assert.ok(!isChargeFrame(s.frame), s.frame);
  }

  // Releasing with a direction held runs.
  const run = makeFighter();
  chargeIntoLoop(run.step, { right: true });
  stepUntil(run.step, (f) => f.state === 'run', { right: true }, 20);
  assert.ok(!isChargeFrame(frameName(run.fighter)));
});

test('every new Charge restarts from charge1, wherever the last one was released', () => {
  const { fighter, step } = makeFighter();
  for (const releaseOn of CHARGE_FRAMES) {
    stepUntil(step, (f) => frameName(f) === releaseOn, CHARGE);
    stepUntil(step, (f) => f.state !== 'charge');
    step(CHARGE);
    assert.equal(fighter.state, 'charge');
    assert.equal(frameName(fighter), '0001_charge1.png', `after releasing on ${releaseOn}`);
    assert.equal(fighter.animator.anim.key, 'chargeStart');
    assert.equal(fighter.animator.index, 0);
    stepUntil(step, (f) => f.state !== 'charge');
  }
  // Even a single released step in between restarts it.
  chargeIntoLoop(step);
  step();
  step(CHARGE);
  assert.equal(frameName(fighter), '0001_charge1.png');
});

// ---- Held input -------------------------------------------------------------------

test('Charge follows the held value: a tap does not latch, and the press edge alone does nothing', () => {
  const tap = makeFighter();
  tap.step({ charge: true, chargePressed: true });
  assert.equal(tap.fighter.state, 'charge');
  for (let i = 0; i < steps(1); i++) {
    tap.step();
    assert.equal(tap.fighter.state, 'idle');
    assert.equal(tap.fighter.charging, false);
  }

  // A second tap does not "toggle it off"; a hold is what charges.
  tap.step({ charge: true, chargePressed: true });
  tap.step(CHARGE);
  assert.equal(tap.fighter.state, 'charge');
  tap.step();
  assert.equal(tap.fighter.state, 'idle');

  const edgeOnly = makeFighter();
  for (let i = 0; i < steps(1); i++) {
    edgeOnly.step({ chargePressed: true });
    assert.notEqual(edgeOnly.fighter.state, 'charge');
  }

  // Holding without ever seeing a press edge still charges.
  const heldOnly = makeFighter();
  heldOnly.step(CHARGE);
  assert.equal(heldOnly.fighter.state, 'charge');
});

// ---- Grounded ---------------------------------------------------------------------

test('Charge is grounded: held in the air it keeps Jump / Fall, then charges after Land', () => {
  const { fighter, step } = makeFighter();
  step({ ...JUMP, ...CHARGE });
  const air = [];
  while (!fighter.grounded) {
    air.push({ state: fighter.state, frame: frameName(fighter) });
    step(CHARGE);
  }
  assert.ok(air.length > 20);
  assert.ok(air.every((s) => s.state === 'jump' || s.state === 'fall'));
  assert.ok(air.every((s) => !isChargeFrame(s.frame)), 'no charge art in the air');

  // Touchdown: Land plays its whole clip, then Charge starts from charge1.
  assert.equal(fighter.state, 'land');
  const landSteps = [];
  while (fighter.state === 'land') {
    landSteps.push(frameName(fighter));
    step(CHARGE);
  }
  assert.equal(landSteps.length, Math.round(fighter.landDuration / DT));
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
});

test('Charge holds its ground at a ledge edge, and falling never shows charge art', () => {
  const { fighter, step } = makeFighter({ x: 1080, y: 600 });
  // Charging locks movement, so a held direction cannot walk off the edge.
  for (let i = 0; i < steps(1); i++) step({ ...CHARGE, right: true });
  assert.equal(fighter.body.ground.id, 'ledge');
  assert.equal(fighter.state, 'charge');
  // Walk off, then hold Charge on the way down.
  stepUntil(step, (f) => !f.grounded, { right: true });
  while (!fighter.grounded) {
    assert.equal(fighter.state, 'fall');
    assert.ok(!isChargeFrame(frameName(fighter)));
    step(CHARGE);
  }
});

// ---- Movement -------------------------------------------------------------------

test('Charge locks horizontal movement: a run decelerates to a stop and stays put', () => {
  const { fighter, step } = makeFighter();
  const right = { right: true };
  stepUntil(step, (f) => f.body.vx >= def.movement.maxSpeed, right);

  let vx = fighter.body.vx;
  step({ ...CHARGE, ...right });
  assert.equal(fighter.state, 'charge', 'Charge outranks run immediately');
  assert.equal(fighter.moveDir, 0);
  assert.equal(frameName(fighter), '0001_charge1.png');
  // Normal ground deceleration, never acceleration.
  while (fighter.body.vx > 0) {
    assert.ok(Math.abs(fighter.body.vx - Math.max(0, vx - def.movement.deceleration * DT)) < 1e-9);
    vx = fighter.body.vx;
    step({ ...CHARGE, ...right });
  }
  const x = fighter.body.x;
  for (const held of [right, { left: true }, { left: true, right: true }]) {
    for (let i = 0; i < steps(0.5); i++) {
      step({ ...CHARGE, ...held });
      assert.equal(fighter.state, 'charge');
      assert.equal(fighter.body.vx, 0);
      assert.equal(fighter.body.x, x);
      assert.ok(isChargeFrame(frameName(fighter)), 'never a run frame');
    }
  }
  // Release: the held direction moves the fighter again.
  stepUntil(step, (f) => f.state === 'run', right, 20);
  assert.ok(fighter.body.vx > 0);
});

test('Charge changes no collider, hurtbox, gravity or jump data', () => {
  const { fighter, step } = makeFighter();
  const before = { halfW: fighter.body.halfW, height: fighter.body.height, y: fighter.body.y };
  for (let i = 0; i < steps(1); i++) step(CHARGE);
  assert.deepEqual({ halfW: fighter.body.halfW, height: fighter.body.height, y: fighter.body.y }, before);
  assert.deepEqual(def.hurtboxes, [
    { x: -15, y: -80, w: 30, h: 34 },
    { x: -17, y: -46, w: 34, h: 46 },
  ]);
  // A jump out of Charge follows exactly the same arc as one from idle.
  const plain = makeFighter();
  step({ ...CHARGE, ...JUMP });
  plain.step(JUMP);
  for (let i = 0; i < steps(1); i++) {
    for (const k of ['y', 'vy', 'grounded']) assert.equal(fighter.body[k], plain.fighter.body[k], `step ${i}: body.${k}`);
    step(CHARGE);
    plain.step();
  }
});

// ---- Priority -------------------------------------------------------------------

test('hitstun replaces Charge at once; Charge resumes from charge1 once the stun ends', () => {
  const { fighter, step } = makeFighter();
  chargeIntoLoop(step);
  fighter.combat.stun = 0.2;
  step(CHARGE);
  assert.equal(fighter.state, 'hitstun');
  assert.equal(fighter.charging, false);
  assert.equal(frameName(fighter), '0001_hurt.png');
  const n = stepUntil(step, (f) => f.state !== 'hitstun', CHARGE);
  assert.ok(n > 5, 'Charge never cancels hitstun');
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
});

test('a real hit on a charging fighter shows Hurt through the impact freeze, with full damage', () => {
  const { attacker, target, tick, events } = duel();
  for (let i = 0; i < steps(0.5); i++) tick({}, CHARGE);
  assert.equal(target.state, 'charge');
  tick(BA1, CHARGE);
  for (let i = 0; i < 60 && !events.length; i++) {
    assert.equal(target.state, 'charge', 'still charging until the hit');
    tick({}, CHARGE);
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'hit', 'Charge grants no guard');
  assert.equal(events[0].damage, 6, 'or armour');
  assert.equal(target.combat.health, 94);
  tick({}, CHARGE);
  assert.ok(target.combat.hitstop > 0 || target.combat.stun > 0);
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_hurt.png');
  assert.equal(attacker.combat.attack?.def.id, 'ba1');
});

for (const [name, press, id, first] of [['BA1', BA1, 'ba1', '0001_1ba1.png'], ['BA2', BA2, 'ba2', '0001_2ba1.png']]) {
  test(`${name} interrupts Charge without releasing it, then Charge restarts from charge1`, () => {
    const { fighter, step } = makeFighter();
    chargeIntoLoop(step);
    step({ ...CHARGE, ...press });
    assert.equal(fighter.state, 'attack');
    assert.equal(fighter.combat.attack.def.id, id);
    assert.equal(fighter.charging, false);
    assert.equal(frameName(fighter), first);
    const frames = [];
    while (fighter.state === 'attack') {
      frames.push(frameName(fighter));
      step(CHARGE);
    }
    const clip = def.animations[id].frames.map((u) => u.split('/').pop());
    assert.deepEqual(frames.filter((n, i, a) => n !== a[i - 1]), clip, `the whole ${name} clip plays`);
    assert.ok(frames.every((n) => !isChargeFrame(n)));
    assert.equal(fighter.state, 'charge');
    assert.equal(frameName(fighter), '0001_charge1.png');
  });
}

test('Jump interrupts Charge through the normal jump', () => {
  const { fighter, step } = makeFighter();
  chargeIntoLoop(step);
  step({ ...CHARGE, ...JUMP });
  assert.equal(fighter.grounded, false);
  assert.equal(fighter.state, 'jump');
  assert.equal(fighter.charging, false);
  assert.equal(frameName(fighter), '0001_jump1.png');
  stepUntil(step, (f) => f.body.vy > 0, CHARGE);
  assert.equal(fighter.state, 'fall');
});

test('Block outranks Charge when both are held; Charge follows when Block is released', () => {
  const { fighter, step } = makeFighter();
  step({ ...CHARGE, block: true });
  assert.equal(fighter.state, 'block');
  assert.equal(fighter.combat.blocking, true);
  assert.equal(fighter.charging, false);

  chargeIntoLoop(step);
  step({ ...CHARGE, block: true });
  assert.equal(fighter.state, 'block');
  step(CHARGE);
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
});

// ---- No combat effect -------------------------------------------------------------

test('charging next to an opponent creates no attack, hitbox, damage, hitstop or cooldown', () => {
  const { attacker, target, tick, events } = duel();
  const x = target.body.x;
  for (let i = 0; i < steps(3); i++) {
    tick(CHARGE);
    assert.equal(attacker.state, 'charge');
    assert.equal(attacker.combat.attack, null);
    assert.equal(attacker.combat.phase, null, 'no hitbox');
    assert.equal(attacker.combat.hitstop, 0);
    assert.equal(target.combat.hitstop, 0);
    assert.equal(target.combat.stun, 0);
    assert.equal(attacker.combat.cooldowns.size, 0);
  }
  assert.deepEqual(events, []);
  assert.equal(target.combat.health, 100);
  assert.equal(target.body.x, x, 'Charge pushes nobody');
});

// ---- Platforms ------------------------------------------------------------------

test('Charge on a one-way platform charges in place instead of dropping through', () => {
  const { fighter, step } = makeFighter({ x: 1000, y: 600 });
  assert.equal(fighter.body.ground.id, 'ledge');
  assert.equal(STAGE.platforms[0].dropThrough, true, 'a platform the CPU could drop through');
  step({ charge: true, chargePressed: true });
  for (let i = 0; i < steps(2); i++) {
    assert.equal(fighter.grounded, true);
    assert.equal(fighter.body.ground.id, 'ledge');
    assert.equal(fighter.body.y, 600);
    assert.equal(fighter.body.dropId, null, 'no drop-through started');
    assert.equal(fighter.state, 'charge');
    assert.ok(isChargeFrame(frameName(fighter)));
    step(i % 20 === 0 ? { charge: true, chargePressed: true } : CHARGE);
  }
});

// ---- Missing art ------------------------------------------------------------------

test('missing charge art holds a still idle frame; the fighter keeps working', () => {
  const noCharge = Object.keys(def.animations).filter((k) => !k.startsWith('charge'));
  const { fighter, step } = makeFighter({ sprites: fakeSprites(noCharge) });
  assert.equal(fighter.chargeStartDuration, 0);
  for (let i = 0; i < steps(1); i++) {
    step({ ...CHARGE, right: true });
    assert.equal(fighter.state, 'charge');
    assert.equal(fighter.animator.hold, 0);
    assert.equal(frameName(fighter), '0001_idle1.png');
    assert.equal(fighter.body.vx, 0);
  }
  step();
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.animator.hold, null);
  step(BA1);
  assert.equal(fighter.combat.attack?.def.id, 'ba1');

  // Only the loop missing: the startup plays, then the idle still.
  const noLoop = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'chargeLoop')) });
  const shown = runs(record(noLoop.step, CHARGE, steps(1))).map((r) => r.frame);
  assert.deepEqual(shown, ['0001_charge1.png', '0001_charge2.png', '0001_idle1.png']);
  assert.equal(noLoop.fighter.animator.hold, 0);

  // Only the startup missing: straight into the loop.
  const noStart = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'chargeStart')) });
  const loop = runs(record(noStart.step, CHARGE, steps(1))).map((r) => r.frame);
  assert.deepEqual(loop.slice(0, 4), ['0001_chargea.png', '0001_chargeb.png', '0001_chargea.png', '0001_chargeb.png']);

  // One startup frame failed to load: the rest still plays in order.
  const partial = fakeSprites();
  partial.animations.chargeStart.frames.pop();
  const one = makeFighter({ sprites: partial });
  assert.equal(one.fighter.chargeStartDuration, 1 / def.animations.chargeStart.fps);
  const seq = runs(record(one.step, CHARGE, steps(1))).map((r) => r.frame);
  assert.deepEqual(seq.slice(0, 3), ['0001_charge1.png', '0001_chargea.png', '0001_chargeb.png']);
});

// ---- Input ------------------------------------------------------------------------

test('the gameplay down action is now charge on S / ↓; menu Down is untouched', () => {
  assert.ok(ACTIONS.includes('charge'));
  assert.ok(!ACTIONS.includes('down'));
  assert.deepEqual(ACTIONS.slice(0, 4), ['left', 'right', 'charge', 'jump']);
  assert.deepEqual(CONFIG.bindings.charge, ['KeyS', 'ArrowDown']);
  assert.equal(CONFIG.bindings.down, undefined);
  assert.ok(!Object.values(CONFIG.bindings).flat().includes('KeyC'), 'no extra C key');
  assert.deepEqual(CONFIG.menuBindings.down, ['ArrowDown', 'KeyS']);
  assert.deepEqual(CONFIG.menuBindings.up, ['ArrowUp', 'KeyW']);
});

test('InputManager samples a held charge from S, ↓, D-pad down and the left stick', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code, repeat = false) => listeners[type]({ code, repeat, preventDefault() {} });

  const frame = input.sample();
  assert.ok('charge' in frame && 'chargePressed' in frame);
  for (const gone of ['down', 'downPressed', 'dropPressed']) assert.ok(!(gone in frame), `no ${gone} in the player sample`);

  for (const code of ['KeyS', 'ArrowDown']) {
    key('keydown', code);
    let f = input.sample();
    assert.equal(f.charge, true, code);
    assert.equal(f.chargePressed, true);
    // Held across steps; auto-repeat changes nothing.
    for (let i = 0; i < 5; i++) {
      if (i === 2) key('keydown', code, true);
      f = input.sample();
      assert.equal(f.charge, true);
      assert.equal(f.chargePressed, false);
    }
    key('keyup', code);
    assert.equal(input.sample().charge, false, `${code} released`);
  }

  // Both keys: releasing one keeps Charge held.
  key('keydown', 'KeyS');
  key('keydown', 'ArrowDown');
  key('keyup', 'KeyS');
  assert.equal(input.sample().charge, true);
  key('keyup', 'ArrowDown');
  assert.equal(input.sample().charge, false);

  listeners.gamepadconnected();
  const menu = [];
  input.onPadMenu((cmd) => menu.push(cmd));
  pad.buttons[13] = { pressed: true, value: 1 }; // D-pad down
  input.pollGamepads(0);
  assert.equal(input.sample().charge, true);
  assert.deepEqual(menu, ['down'], 'menus still read D-pad down as Down');
  pad.buttons[13] = { pressed: false, value: 0 };
  input.pollGamepads(1000);
  assert.equal(input.sample().charge, false);

  pad.axes[1] = 0.9; // left stick down
  input.pollGamepads(2000);
  assert.equal(input.sample().charge, true);
  assert.deepEqual(menu, ['down', 'down']);
  pad.axes[1] = 0;
  input.pollGamepads(3000);
  assert.equal(input.sample().charge, false);

  // Other pad mappings are unchanged.
  for (const [i, action] of [[0, 'jump'], [1, 'action1'], [4, 'action2'], [5, 'block'], [7, 'block'], [2, 'primary'], [3, 'special']]) {
    pad.buttons[i] = { pressed: true, value: 1 };
    input.pollGamepads(4000);
    const f = input.sample();
    assert.equal(f[action], true, `button ${i}`);
    assert.equal(f.charge, false);
    pad.buttons[i] = { pressed: false, value: 0 };
    input.pollGamepads(4000);
  }
});

// ---- Training CPU -----------------------------------------------------------------

test('the training CPU never charges or attacks, and still drops through platforms to follow', async () => {
  const { TrainingAIController } = await import('../js/game/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 300 < 150 ? { right: true } : { left: true, ...(i % 97 === 0 ? CHARGE : {}) });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.charge, false);
    assert.equal(out.chargePressed, false);
    assert.equal('down' in out, false);
    bot.step(out);
    assert.notEqual(bot.fighter.state, 'charge');
    assert.equal(bot.fighter.combat.attack, null);
  }

  // On the ledge with the player below: the CPU drops down, as before.
  const high = makeFighter({ x: 1000, y: 600, facing: -1 });
  const low = makeFighter({ x: 1000 });
  high.fighter.opponent = low.fighter;
  low.fighter.opponent = high.fighter;
  const follower = new TrainingAIController({ rng: () => 0.3 });
  const states = new Set();
  for (let i = 0; i < steps(3) && high.fighter.body.ground?.id !== '__floor'; i++) {
    low.step();
    high.step(follower.getInput(high.fighter, DT, SIM_CTX));
    states.add(high.fighter.state);
  }
  assert.equal(high.fighter.body.ground?.id, '__floor', 'dropped through the ledge');
  assert.ok(states.has('fall'));
  assert.ok(!states.has('charge'));
});

// ---- Energy -----------------------------------------------------------------------

test('every fighter starts with full Energy, and a reset refills it', () => {
  assert.equal(def.stats.energy, 100);
  const { fighter, step } = makeFighter();
  assert.equal(fighter.combat.maxEnergy, 100);
  assert.equal(fighter.combat.energy, 100);
  fighter.combat.energy = 30;
  assert.equal(fighter.combat.health, 100, 'energy is not health');
  step();
  assert.equal(fighter.combat.energy, 30);
  fighter.reset(STAGE);
  assert.equal(fighter.combat.energy, 100);
  assert.equal(fighter.combat.maxEnergy, 100);
  // A character without an energy stat still gets a full default meter.
  const plain = makeFighter({ character: { ...def, stats: { health: 100 } } });
  assert.equal(plain.fighter.combat.maxEnergy, 100);
  assert.equal(plain.fighter.combat.energy, 100);
});

test('nothing spends or restores Energy yet: charging, blocking, attacking and hits leave it full', () => {
  const full = (...fighters) => {
    for (const f of fighters) {
      assert.equal(f.combat.energy, 100);
      assert.equal(f.combat.maxEnergy, 100);
    }
  };
  // Charging and blocking for a while, then a blocked BA1.
  const guard = duel();
  const BLOCK = { block: true };
  for (let i = 0; i < steps(2); i++) guard.tick(CHARGE, BLOCK);
  full(guard.attacker, guard.target);
  guard.tick(BA1, BLOCK);
  for (let i = 0; i < 60 && !guard.events.length; i++) guard.tick({}, BLOCK);
  assert.equal(guard.events[0]?.type, 'block');
  full(guard.attacker, guard.target);

  // Clean BA1 and BA2 hits: dealing and taking damage change nothing.
  for (const press of [BA1, BA2]) {
    const { attacker, target, tick, until, events } = duel();
    tick(press);
    until(() => events.length > 0);
    until(() => !attacker.combat.attack && target.combat.stun <= 0);
    assert.ok(target.combat.health < 100);
    full(attacker, target);
  }
});
