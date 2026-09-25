// Run with node --test tests/charge.test.mjs (no dependencies).
// #0001 Charge: artwork registration, the startup-then-loop frame order, the
// voluntary-release pose, held (never toggled) input, grounded-only entry,
// movement lock, state priority (interruptions skip the release pose), no
// combat effect, the gameplay Down -> Charge rename, and Charge's faster
// recovery of the charged-action cooldowns.
// Charged BA1 (the Clone Attack) is covered in detail by clone.test.mjs.
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
const DEFENSE = { defense: true, defensePressed: true };
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

// Steps one Charge frame-time lasts: how long the release pose shows.
const RELEASE_STEPS = Math.round(1 / def.animations.chargeRelease.fps / DT);

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

test('the release pose is its own one-frame clip reusing charge1, lasting one Charge frame-time', () => {
  const { chargeRelease, chargeStart } = def.animations;
  assert.deepEqual(chargeRelease.frames, [`${BASE}charge1.png`], 'the real charge1, not a copy');
  assert.equal(chargeRelease.frames[0], chargeStart.frames[0]);
  assert.equal(chargeRelease.fps, chargeStart.fps);
  assert.equal(chargeRelease.loop, false);
  assert.equal(chargeRelease.heightRatio, 1);
  const { fighter } = makeFighter();
  assert.equal(fighter.chargeReleaseDuration, 1 / chargeStart.fps);
  assert.equal(RELEASE_STEPS, 6, 'one 10 fps frame at 60 Hz');
  // No duplicated PNG: exactly the four charge files exist.
  assert.deepEqual(readdirSync(ROOT + 'assets/characters/0001/').filter((n) => /charge/.test(n)).sort(), CHARGE_FRAMES);
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

test('voluntarily releasing Charge shows charge1 for one Charge frame-time, then idle', () => {
  const { fighter, step } = makeFighter();
  chargeIntoLoop(step);
  assert.equal(fighter.state, 'charge');
  assert.equal(fighter.charging, true);
  const held = frameName(fighter);
  assert.match(held, /^0001_charge[ab]\.png$/);

  const log = record(step, {}, steps(1));
  const shown = runs([{ frame: held }, ...log]);
  assert.deepEqual(shown.slice(0, 3).map((r) => r.frame), [held, '0001_charge1.png', '0001_idle1.png']);
  assert.equal(shown[1].steps, RELEASE_STEPS, 'exactly one Charge frame-time');
  assert.ok(log.slice(0, RELEASE_STEPS).every((s) => s.state === 'chargeRelease' && s.anim === 'chargeRelease'));
  // Charging ended on the release step: the pose is visual only.
  assert.equal(fighter.charging, false);
  for (const s of log.slice(RELEASE_STEPS)) {
    assert.equal(s.state, 'idle');
    assert.ok(!isChargeFrame(s.frame), s.frame);
  }
});

test('the release pose never freezes movement: a held direction moves at once, then runs', () => {
  const { fighter, step } = makeFighter();
  chargeIntoLoop(step);
  const x = fighter.body.x;
  const plain = makeFighter();
  const right = { right: true };
  const states = [];
  for (let i = 0; i < 20; i++) {
    step(right);
    plain.step(right);
    states.push(fighter.state);
    // The same acceleration as a fighter starting from idle.
    assert.equal(fighter.body.vx, plain.fighter.body.vx, `step ${i}: vx`);
  }
  assert.deepEqual(states.slice(0, RELEASE_STEPS), Array(RELEASE_STEPS).fill('chargeRelease'));
  assert.ok(fighter.body.x > x, 'moved during the release pose');
  assert.equal(fighter.state, 'run');
  assert.ok(!isChargeFrame(frameName(fighter)));
});

test('releasing during any Charge frame plays the same charge1 release pose', () => {
  for (const releaseOn of CHARGE_FRAMES) {
    const { fighter, step } = makeFighter();
    stepUntil(step, (f) => frameName(f) === releaseOn, CHARGE);
    assert.equal(fighter.state, 'charge');
    const log = record(step, {}, RELEASE_STEPS + 2);
    for (const s of log.slice(0, RELEASE_STEPS)) {
      assert.equal(s.state, 'chargeRelease', `after ${releaseOn}`);
      assert.equal(s.anim, 'chargeRelease');
      assert.equal(s.frame, '0001_charge1.png');
    }
    assert.equal(log[RELEASE_STEPS].state, 'idle', `normal state resumes after ${releaseOn}`);
    assert.equal(log[RELEASE_STEPS].frame, '0001_idle1.png');
  }
});

test('every new Charge restarts from charge1, wherever the last one was released', () => {
  const { fighter, step } = makeFighter();
  for (const releaseOn of CHARGE_FRAMES) {
    stepUntil(step, (f) => frameName(f) === releaseOn, CHARGE);
    stepUntil(step, (f) => f.state !== 'charge');
    // Holding Charge again during the release pose wins at once.
    assert.equal(fighter.state, 'chargeRelease');
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
  assert.equal(fighter.animator.anim.key, 'chargeStart');
  // Once the release pose has ended, too.
  step();
  stepUntil(step, (f) => f.state === 'idle');
  step(CHARGE);
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
});

// ---- Held input -------------------------------------------------------------------

test('Charge follows the held value: a tap does not latch, and the press edge alone does nothing', () => {
  const tap = makeFighter();
  tap.step({ charge: true, chargePressed: true });
  assert.equal(tap.fighter.state, 'charge');
  for (let i = 0; i < steps(1); i++) {
    tap.step();
    // Only the brief release pose, then idle: never a latched Charge.
    assert.equal(tap.fighter.state, i < RELEASE_STEPS ? 'chargeRelease' : 'idle');
    assert.equal(tap.fighter.charging, false);
  }

  // A second tap does not "toggle it off"; a hold is what charges.
  tap.step({ charge: true, chargePressed: true });
  tap.step(CHARGE);
  assert.equal(tap.fighter.state, 'charge');
  tap.step();
  assert.equal(tap.fighter.state, 'chargeRelease');
  assert.equal(tap.fighter.charging, false);

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
  stepUntil(step, (f) => f.body.vx >= f.maxSpeed, right);

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

  // Letting go during the stun: the stun ends straight into idle, with no
  // release pose, because the hit (not the player) ended that Charge.
  const hurt = makeFighter();
  chargeIntoLoop(hurt.step);
  hurt.fighter.combat.stun = 0.2;
  hurt.step(CHARGE);
  const after = [];
  for (let i = 0; i < steps(0.5); i++) after.push(hurt.step().state);
  assert.ok(!after.includes('chargeRelease'), after.join());
  assert.equal(after.at(-1), 'idle');
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
  assert.equal(events[0].damage, 5, 'or armour');
  assert.equal(target.combat.launchPoint, 5);
  assert.match(frameName(target), /^0001_charge[ab]\.png$/, 'still the loop at impact');
  tick({}, CHARGE);
  assert.ok(target.combat.hitstop > 0 || target.combat.stun > 0);
  assert.equal(target.state, 'hitstun');
  assert.equal(frameName(target), '0001_hurt.png', 'chargea / chargeb -> Hurt, never charge1 first');
  assert.equal(attacker.combat.attack?.def.id, 'ba1');
  // Released through the stun: no release pose once it ends.
  const states = [];
  while (target.combat.stun > 0 || target.combat.hitstop > 0) {
    tick();
    states.push(target.state);
  }
  tick();
  states.push(target.state);
  assert.ok(!states.includes('chargeRelease'), states.join());
});

test('BA2 while already charging, Charge still held, starts the Charged BA2 Sphere Rush with no release pose', () => {
  const { attacker: fighter, tick, clones } = duel();
  const step = (held) => {
    tick(held);
    return fighter;
  };
  chargeIntoLoop(step);
  step({ ...CHARGE, ...BA2 });
  assert.equal(fighter.state, 'technique');
  assert.equal(fighter.technique.def.id, 'rasenRush');
  assert.equal(fighter.combat.attack, null, 'not the normal BA2');
  assert.equal(fighter.charging, false);
  assert.equal(frameName(fighter), '0001_rasen1.png', 'straight into the technique, no charge1 release pose');
  const states = [];
  while (fighter.technique) states.push(step(CHARGE).state);
  assert.ok(!states.includes('chargeRelease') && !states.includes('charge'), states.join());
  // Charge held right through it does not restart Charge by itself: it has
  // to be let go and held again.
  for (let i = 0; i < 10; i++) assert.notEqual(step(CHARGE).state, 'charge');
  step();
  assert.equal(step(CHARGE).state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
  assert.equal(clones.length, 0, 'the Sphere Rush is no summon');
  assert.ok(fighter.combat.chargedCooldowns.active('rasenRush'), 'its cooldown was spent');
  assert.equal(fighter.combat.chargedCooldowns.active('ba1Clone'), false, 'and only its own');
});

test('without its art, Charged BA2 falls back to BA2, which interrupts Charge; Charge then restarts from charge1', (t) => {
  t.mock.method(console, 'warn', () => {});
  const { attacker: fighter, tick, clones } = duel({
    attackerSprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'rasenDash')),
  });
  const step = (held) => {
    tick(held);
    return fighter;
  };
  chargeIntoLoop(step);
  step({ ...CHARGE, ...BA2 });
  assert.equal(fighter.state, 'attack');
  assert.equal(fighter.combat.attack.def.id, 'ba2');
  assert.equal(fighter.technique, null);
  assert.equal(fighter.charging, false);
  assert.equal(frameName(fighter), '0001_2ba1.png');
  const frames = [];
  while (fighter.state === 'attack') {
    frames.push(frameName(fighter));
    step(CHARGE);
  }
  const clip = def.animations.ba2.frames.map((u) => u.split('/').pop());
  assert.deepEqual(frames.filter((n, i, a) => n !== a[i - 1]), clip, 'the whole BA2 clip plays');
  assert.ok(frames.every((n) => !isChargeFrame(n)));
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
  assert.equal(clones.length, 0);
  assert.equal(fighter.combat.chargedCooldowns.size, 0, 'no cooldown for a technique that never started');
});

test('BA1 while already charging, Charge still held, summons a clone: the owner stays in Charge', () => {
  const { attacker: fighter, tick, clones } = duel();
  const step = (held) => {
    tick(held);
    return fighter;
  };
  chargeIntoLoop(step);
  const loopFrame = frameName(fighter);
  step({ ...CHARGE, ...BA1 });
  assert.equal(clones.length, 1, 'the Charged BA1 Clone Attack');
  assert.equal(fighter.combat.chargedCooldowns.remaining('ba1Clone'), 5, 'its 5-second cooldown starts');
  // The owner neither attacks nor releases: the Charge loop just carries on.
  assert.equal(fighter.state, 'charge');
  assert.equal(fighter.charging, true);
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.animator.anim.key, 'chargeLoop');
  assert.match(frameName(fighter), /^0001_charge[ab]\.png$/);
  assert.match(loopFrame, /^0001_charge[ab]\.png$/);
  const states = new Set();
  for (let i = 0; i < steps(1); i++) states.add(step(CHARGE).state);
  assert.deepEqual([...states], ['charge'], 'no BA1 and no release pose');
});

for (const [name, press, id, first] of [['BA1', BA1, 'ba1', '0001_1ba1.png'], ['BA2', BA2, 'ba2', '0001_2ba1.png']]) {
  test(`letting go of Charge on the step ${name} is pressed starts ${name} at once, with no release pose`, () => {
    const { attacker: fighter, tick, clones } = duel();
    const step = (held = {}) => {
      tick(held);
      return fighter;
    };
    chargeIntoLoop(step);
    step(press);
    assert.equal(fighter.state, 'attack');
    assert.equal(fighter.combat.attack.def.id, id);
    assert.equal(frameName(fighter), first);
    const states = [];
    while (fighter.state === 'attack') states.push(step().state);
    // The attack ended Charge, so its end goes straight to idle.
    assert.ok(!states.includes('chargeRelease'), states.join());
    assert.equal(fighter.state, 'idle');
    // Not a charged action: no clone and no charged cooldown.
    assert.equal(clones.length, 0);
    assert.equal(fighter.combat.chargedCooldowns.size, 0);
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

  // Letting go of Charge on the jump step: straight into Jump, no release pose.
  const other = makeFighter();
  chargeIntoLoop(other.step);
  other.step(JUMP);
  assert.equal(other.fighter.state, 'jump');
  assert.equal(frameName(other.fighter), '0001_jump1.png');
  const states = [];
  while (!other.fighter.grounded || other.fighter.state === 'land') states.push(other.step().state);
  assert.ok(!states.includes('chargeRelease'), states.join());
});

test('held Defense interrupts Charge with the Shield at once; a held Charge restarts from charge1 after it', () => {
  const { fighter, step } = makeFighter();
  chargeIntoLoop(step);
  step({ ...CHARGE, ...DEFENSE });
  assert.equal(fighter.state, 'shield');
  assert.equal(fighter.combat.shielding, true);
  assert.equal(fighter.animator.anim.key, 'shieldStart');
  assert.equal(frameName(fighter), '0001_prepshield.png', 'no release pose first');
  assert.equal(fighter.charging, false);
  // Held together, the Shield keeps outranking Charge.
  for (let i = 0; i < steps(1); i++) {
    step({ ...CHARGE, defense: true });
    assert.equal(fighter.state, 'shield');
    assert.equal(fighter.charging, false, 'no Charge stance under the Shield');
  }
  // Defense let go, Charge still held: a fresh Charge from charge1, not the
  // loop and not the Shield's lower pose.
  step(CHARGE);
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
  assert.equal(fighter.animator.anim.key, 'chargeStart');

  // Pressing Defense with Charge from idle shields; Charge waits for Defense.
  const both = makeFighter();
  both.step({ ...CHARGE, ...DEFENSE });
  assert.equal(both.fighter.state, 'shield');
  for (let i = 0; i < 20; i++) both.step({ ...CHARGE, defense: true });
  assert.equal(both.fighter.state, 'shield');
  both.step(CHARGE);
  assert.equal(both.fighter.state, 'charge');
  assert.equal(frameName(both.fighter), '0001_charge1.png');
});

test('letting go of Charge on the step Defense is pressed shields at once; no Charge release pose', () => {
  for (const releaseOn of CHARGE_FRAMES) {
    const { fighter, step } = makeFighter();
    stepUntil(step, (f) => frameName(f) === releaseOn, CHARGE);
    step(DEFENSE); // charge: false and defensePressed: true on the same step
    assert.equal(fighter.state, 'shield', `after ${releaseOn}`);
    assert.equal(frameName(fighter), '0001_prepshield.png');
    const states = [fighter.state];
    for (let i = 0; i < steps(0.5); i++) states.push(step({ defense: true }).state);
    for (let i = 0; i < steps(0.5); i++) states.push(step().state);
    assert.ok(!states.includes('chargeRelease'), states.join());
    assert.ok(!states.includes('charge'));
    assert.equal(fighter.state, 'idle', 'normal state selection after the Shield');
  }
});

test('exhausted, held Defense raises no Shield and leaves Charge alone; any Energy left still raises it', () => {
  const { fighter, step } = makeFighter();
  fighter.combat.setEnergy(0);
  fighter.combat.regenEnergy(60);
  assert.equal(fighter.combat.energyExhausted, true);
  for (let i = 0; i < 10; i++) step({ ...CHARGE, defense: true });
  assert.equal(fighter.combat.shielding, false);
  assert.equal(fighter.state, 'charge');
  assert.equal(fighter.charging, true);
  const low = makeFighter();
  low.fighter.combat.setEnergy(5);
  low.step({ ...CHARGE, defense: true, defensePressed: true });
  assert.equal(low.fighter.combat.shielding, true, 'less than a block costs, but not exhausted');
  assert.equal(low.fighter.charging, false);
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
  assert.equal(target.combat.launchPoint, 0);
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
  for (const [i, action] of [[0, 'jump'], [1, 'action1'], [4, 'action2'], [5, 'defense'], [7, 'defense'], [2, 'primary'], [3, 'special']]) {
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
    assert.equal('block' in out, false);
    bot.step(out);
    assert.notEqual(bot.fighter.state, 'charge');
    assert.notEqual(bot.fighter.state, 'chargeRelease');
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

// ---- Charged cooldowns: Charge recovers them faster -------------------------------

// Seconds left on `id` for `fighter`.
const left = (fighter, id = 'rasenRush') => fighter.combat.chargedCooldowns.remaining(id);

// A fresh fighter with a 5-second `id` cooldown just started.
function cooling(id = 'rasenRush', opts) {
  const f = makeFighter(opts);
  f.fighter.combat.chargedCooldowns.start(id, 5);
  return f;
}

test('the charged cooldowns recover at 2x while Charging: data-driven, from the character', () => {
  assert.equal(def.stats.chargedCooldownRate, 2);
  const { fighter } = makeFighter();
  assert.equal(fighter.chargedCooldownRate, 2);
  const plain = makeFighter({ character: { ...def, stats: {} } });
  assert.equal(plain.fighter.chargedCooldownRate, 1, 'no rate declared: no faster recovery');
});

test('a 5 s charged cooldown: about 4 s left after 1 s not charging, about 3 s after 1 s of Charge', () => {
  const idle = cooling();
  for (let i = 0; i < steps(1); i++) idle.step();
  assert.ok(Math.abs(left(idle.fighter) - 4) < 1e-6, `idle: ${left(idle.fighter)}`);

  const charged = cooling();
  for (let i = 0; i < steps(1); i++) charged.step(CHARGE);
  assert.equal(charged.fighter.state, 'charge');
  // Charge's first step starts the stance; every step after it recovers two.
  assert.ok(Math.abs(left(charged.fighter) - 3) <= 2 * DT, `charging: ${left(charged.fighter)}`);

  // Charged for the whole cooldown it is ready in about 2.5 s instead of 5.
  const full = cooling();
  const n = stepUntil(full.step, (f) => !f.combat.chargedCooldowns.active('rasenRush'), CHARGE);
  assert.ok(Math.abs(n * DT - 2.5) <= 2 * DT, `${n} steps`);
  const rest = cooling();
  const m = stepUntil(rest.step, (f) => !f.combat.chargedCooldowns.active('rasenRush'));
  assert.ok(Math.abs(m * DT - 5) <= DT, `${m} steps`);
});

test('Charge only speeds it while really in the Charge stance: never at once, and not while running, jumping or attacking', () => {
  // Starting to Charge takes nothing off by itself.
  const start = cooling();
  start.step(CHARGE);
  assert.equal(start.fighter.charging, true);
  assert.ok(Math.abs(left(start.fighter) - (5 - DT)) < 1e-9, 'one normal step, no instant reset');
  // Running, jumping and attacking, the last two with Charge held all along:
  // every step not continuing a real Charge (Fighter.charging) recovers at 1x.
  for (const [label, held] of [
    ['running', () => ({ right: true })],
    ['jumping with Charge held', (i) => ({ ...CHARGE, jump: true, jumpPressed: i % 45 === 0 })],
    ['attacking with Charge held', (i) => ({ ...CHARGE, action1: true, action1Pressed: i % 20 === 0 })],
  ]) {
    const f = cooling();
    const states = new Set();
    let normal = 0;
    for (let i = 0; i < steps(1); i++) {
      const before = left(f.fighter);
      const charging = f.fighter.charging;
      f.step(held(i));
      states.add(f.fighter.state);
      if (charging) continue;
      assert.ok(Math.abs(before - left(f.fighter) - DT) < 1e-9, `${label}, step ${i}: ${before} -> ${left(f.fighter)}`);
      normal++;
    }
    assert.ok(normal > steps(0.5), `${label}: ${normal} steps checked`);
    assert.ok(states.has(label.startsWith('running') ? 'run' : label.startsWith('jumping') ? 'jump' : 'attack'), [...states].join());
  }
});

test('a charged technique is no Charge, even with Charge held right through it', () => {
  // The Sphere Rush starts its own cooldown; watch Charged BA1's meanwhile.
  const d = duel();
  d.attacker.combat.chargedCooldowns.start('ba1Clone', 5);
  d.tick(CHARGE);
  d.tick(CHARGE);
  d.tick({ ...CHARGE, ...BA2 });
  assert.ok(d.attacker.technique, 'the Sphere Rush started');
  const before = left(d.attacker, 'ba1Clone');
  let n = 0;
  while (d.attacker.technique && n < steps(1)) {
    d.tick(CHARGE);
    n++;
  }
  assert.equal(n, steps(1));
  assert.ok(Math.abs(before - left(d.attacker, 'ba1Clone') - 1) < 1e-6, 'normal rate through the technique');
});

test('letting go of Charge is no sustained Charge: the release pose and after recover at the normal rate', () => {
  const { fighter, step } = cooling();
  chargeIntoLoop(step);
  step();
  assert.equal(fighter.state, 'chargeRelease');
  const released = left(fighter);
  for (let i = 0; i < steps(1); i++) step();
  assert.ok(Math.abs(released - left(fighter) - 1) < 1e-6, `${released} -> ${left(fighter)}`);
});

test('a hit or its freeze stops the faster recovery at once', () => {
  const d = duel();
  d.target.combat.chargedCooldowns.start('rasenRush', 5);
  for (let i = 0; i < steps(0.5); i++) d.tick({}, CHARGE);
  d.tick(BA1, CHARGE);
  d.until(() => d.events.length > 0);
  const hit = left(d.target);
  let n = 0;
  while (d.target.combat.stun > 0 || d.target.combat.hitstop > 0) {
    d.tick({}, CHARGE);
    n++;
  }
  assert.ok(n > 5);
  assert.ok(Math.abs(hit - left(d.target) - n * DT) < 1e-6, 'normal rate while hit');
});

test('a cooldown never goes below 0 and is simply ready, and the recovery is deterministic', () => {
  const { fighter, step } = cooling();
  fighter.combat.chargedCooldowns.start('rasenRush', 0.05);
  for (let i = 0; i < 30; i++) {
    step(CHARGE);
    assert.ok(left(fighter) >= 0);
  }
  assert.equal(fighter.combat.chargedCooldowns.active('rasenRush'), false);
  assert.equal(left(fighter), 0);
  assert.equal(fighter.combat.chargedCooldowns.progress('rasenRush'), 1);
  // Two identical runs recover identically, step for step.
  const run = () => {
    const f = cooling();
    const out = [];
    for (let i = 0; i < steps(2); i++) {
      f.step(i % 50 < 30 ? CHARGE : {});
      out.push(left(f.fighter));
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('charging, releasing, shielding, attacking and hits start no charged cooldown: only the charged actions do', () => {
  const none = (...fighters) => {
    for (const f of fighters) assert.equal(f.combat.chargedCooldowns.size, 0);
  };
  // Charging and releasing for a while, then repeated ground and mid-air
  // Shields, then a BA1 the target's Shield blocks.
  const guard = duel();
  for (let i = 0; i < steps(2); i++) guard.tick(i % 40 < 30 ? CHARGE : {}, i % 40 < 30 ? CHARGE : {});
  none(guard.attacker, guard.target);
  for (let i = 0; i < steps(2); i++) {
    const press = i % 20 < 12 ? { defense: true, defensePressed: i % 20 === 0 } : i === 70 ? JUMP : {};
    guard.tick(press, press);
  }
  none(guard.attacker, guard.target);
  while (!guard.target.grounded || guard.target.state !== 'idle') guard.tick();
  assert.equal(guard.target.body.x - guard.attacker.body.x, 44, 'still in BA1 range');
  guard.tick(BA1, DEFENSE);
  while (guard.attacker.combat.attack) guard.tick({}, { defense: true });
  assert.deepEqual(guard.events.map((e) => e.type), ['block'], 'the BA1 was Shielded');
  none(guard.attacker, guard.target);

  // Clean BA1 and BA2 hits: dealing and taking hits start none either.
  for (const press of [BA1, BA2]) {
    const { attacker, target, tick, until, events } = duel();
    tick(press);
    until(() => events.length > 0);
    until(() => !attacker.combat.attack && target.combat.stun <= 0);
    assert.ok(target.combat.launchPoint > 0);
    none(attacker, target);
  }
});
