// Run with node --test tests/defense.test.mjs (no dependencies).
// Defense, the shared defensive input (L / RB / RT / touch D), and #0001's
// Dodge, the way #0001 defends: artwork registration, the block -> defense
// input rename, one press = one Dodge, ground vs mid-air selection, physics,
// facing, priority, invulnerability against real BA1 / BA2 hitboxes, no chip
// damage, missing-art safety and the Block-type architecture kept for future
// characters. Uses the real Fighter, CombatSystem, physics and InputManager
// (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { createDefenseDefinition, worldBox as worldBoxOf } from '../js/game/combat.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { ACTIONS, ACTION_LABELS, CONFIG } from '../js/config.js';
import {
  def, DT, BASE, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil, steps, duel,
} from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFENSE = { defense: true, defensePressed: true };
const HOLD = { defense: true };
const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };
const JUMP = { jump: true, jumpPressed: true };
const DODGE_FPS = 12;
const FRAME = steps(1 / DODGE_FPS); // simulation steps per Dodge frame
const GROUND = ['0001_dodge1.png', '0001_dodge2.png', '0001_dodge3.png'];
const AIR = ['0001_midairdodge1.png', '0001_midairdodge2.png', '0001_midairdodge3.png'];

// The uploaded PNGs, byte for byte. dodge3 is the same image as charge1.
const SHA256 = {
  '0001_dodge1.png': '7ab17842e0b3d5e971bf3a725b5e8f8413355b9de6a1ef0b7d392542f6c09ccf',
  '0001_dodge2.png': '684dcf779453fe42f274aeee4bf9b739c70fd779aa50aaf0f669cf74686e22e0',
  '0001_dodge3.png': '82369588a62d1d1d93c85cae095b413f91b3fc880001a2084787442da93efbaf',
  '0001_midairdodge1.png': '7c43f31a3fd9f42bcc261790c354b3bb8f7afbf0477f7373da2056bb0b8e7247',
  '0001_midairdodge2.png': '113950ec332eea29d7ef300a1b2b03920622bc6fec5163e6b9e7db5e311a2603',
  '0001_midairdodge3.png': '190219510e3d8c56db6eb097d92540cd7fb958bf0406a56be64c8dd468d55c8c',
};

// Every step of one Dodge, from the press until the fighter leaves it.
function recordDodge(step, press = DEFENSE, held = {}) {
  const log = [];
  let f = step(press);
  while (f.state === 'defense') {
    const d = f.combat.defenseAction;
    log.push({
      frame: frameName(f), anim: f.animator.anim.key, move: d.def.animation, phase: f.combat.defensePhase,
      invulnerable: f.combat.invulnerable, grounded: f.grounded, facing: f.facing,
      y: f.body.y, vy: f.body.vy, x: f.body.x, vx: f.body.vx,
    });
    f = step(held);
  }
  return log;
}

// Consecutive duplicates removed: the order frames were shown in.
const sequence = (log) => log.map((s) => s.frame).filter((n, i, a) => n !== a[i - 1]);

// ---- Artwork ------------------------------------------------------------------

test('the six Dodge sprites live in the canonical #0001 folder, unchanged, and nowhere else', () => {
  const paths = characterFramePaths(def);
  for (const [name, sha] of Object.entries(SHA256)) {
    const url = `./assets/characters/0001/${name}`;
    assert.ok(paths.includes(url), `${url} is preloaded`);
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + name), `no root copy of ${name}`);
    const bytes = readFileSync(ROOT + url.slice(2));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${name} bytes are the upload`);
  }
  assert.deepEqual(readdirSync(ROOT).filter((n) => /dodge/i.test(n)), []);
  const dir = readdirSync(ROOT + 'assets/characters/0001/').filter((n) => /dodge/.test(n)).sort();
  assert.deepEqual(dir, [...GROUND, ...AIR]);
  // dodge3 shares charge1's bytes but keeps its own name and role.
  assert.ok(existsSync(ROOT + 'assets/characters/0001/0001_charge1.png'));
  assert.ok(def.animations.dodge.frames.includes(`${BASE}dodge3.png`));
});

test('dodge and midairDodge are three-frame, play-once clips at 12 fps with no fallback', () => {
  const { dodge, midairDodge } = def.animations;
  assert.deepEqual(dodge.frames, GROUND.map((n) => `./assets/characters/0001/${n}`));
  assert.deepEqual(midairDodge.frames, AIR.map((n) => `./assets/characters/0001/${n}`));
  for (const [key, clip] of Object.entries({ dodge, midairDodge })) {
    assert.equal(clip.frames.length, 3, key);
    assert.equal(clip.fps, DODGE_FPS, key);
    assert.equal(clip.loop, false, `${key} plays once`);
    assert.ok(clip.heightRatio > 0.9 && clip.heightRatio <= 1, `${key} heightRatio`);
    // Like attacks, a Dodge never borrows other art.
    assert.equal(def.animationFallbacks[key], undefined, key);
  }
  // #0001's old Block presentation is gone.
  assert.equal(def.animationFallbacks.block, undefined);
  assert.equal(def.animations.block, undefined);
});

// ---- Source orientation (Mid-Air Dodge art faces left) -------------------------

test('#0001 art faces right, except the mid-air Dodge clip, which overrides it', () => {
  assert.equal(def.sourceFacing, 1, 'the character default stays right-facing');
  assert.equal(def.animations.midairDodge.sourceFacing, -1);
  // Every other clip, ground Dodge included, inherits the default.
  for (const [key, anim] of Object.entries(def.animations)) {
    if (key !== 'midairDodge') assert.equal(anim.sourceFacing, undefined, key);
  }
});

test('SpriteSet.build keeps each clip\'s own source orientation', (t) => {
  // Stand-in images: no canvas in Node, so frames take the raw-size fallback.
  // Orientation is animation metadata and does not depend on the pixels.
  t.mock.method(console, 'warn', () => {});
  const set = SpriteSet.build(def, () => ({ naturalWidth: 64, naturalHeight: 128 }));
  assert.equal(set.usable, true);
  assert.equal(set.animations.idle.sourceFacing, 1);
  assert.equal(set.animations.dodge.sourceFacing, 1);
  assert.equal(set.animations.midairDodge.sourceFacing, -1);
  for (const [key, anim] of Object.entries(set.animations)) {
    assert.equal(anim.sourceFacing, key === 'midairDodge' ? -1 : 1, key);
    for (const frame of anim.frames) assert.equal(frame.sourceFacing, undefined, `${key}: per clip, not per frame`);
  }
  // A character whose art faces left by default passes that on too.
  const leftArt = SpriteSet.build({ ...def, sourceFacing: -1 }, () => ({ naturalWidth: 64, naturalHeight: 128 }));
  assert.equal(leftArt.animations.idle.sourceFacing, -1);
  assert.equal(leftArt.animations.midairDodge.sourceFacing, -1);
});

test('the render flip follows the playing clip: mid-air Dodge mirrors opposite to Idle', () => {
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ facing });
    assert.equal(fighter.animator.anim.key, 'idle');
    assert.equal(fighter.spriteFlip, facing === -1, `idle, facing ${facing}`);
    step(JUMP);
    step(DEFENSE);
    assert.equal(fighter.animator.anim.key, 'midairDodge');
    assert.equal(fighter.facing, facing, 'logical facing is untouched');
    // Left-facing art: mirrored for a right-facing fighter, drawn as is for a left one.
    assert.equal(fighter.spriteFlip, facing === 1, `midairDodge, facing ${facing}`);
    while (fighter.state === 'defense') {
      assert.equal(fighter.spriteFlip, facing === 1);
      assert.equal(fighter.facing, facing);
      step();
    }
    // Back on a right-facing clip, the usual rule again.
    assert.equal(fighter.spriteFlip, facing === -1);
    // The ground Dodge is right-facing art like the rest.
    stepUntil(step, (f) => f.grounded && f.state === 'idle');
    step(DEFENSE);
    assert.equal(fighter.animator.anim.key, 'dodge');
    assert.equal(fighter.spriteFlip, facing === -1, `dodge, facing ${facing}`);
  }
});

test('the orientation override is visual only: boxes and motion follow the fighter\'s facing', () => {
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ facing });
    const plain = makeFighter({ facing });
    const held = facing === 1 ? { right: true } : { left: true };
    for (const r of [step, plain.step]) {
      r(held);
      r({ ...JUMP, ...held });
      r(held);
    }
    step({ ...DEFENSE, ...held });
    plain.step(held);
    assert.equal(fighter.animator.anim.key, 'midairDodge');
    assert.ok(fighter.body.vx * facing > 0, 'still moving the way it faces');
    // Hurtboxes use the logical facing, whatever way the art is drawn.
    const box = worldBoxOf(fighter, def.hurtboxes[1]);
    assert.equal(box.x, facing > 0 ? fighter.body.x + def.hurtboxes[1].x : fighter.body.x - def.hurtboxes[1].x - def.hurtboxes[1].w);
  }
});

// ---- Character data -----------------------------------------------------------

test('#0001 defends with a Dodge whose phases are whole frames of each clip', () => {
  assert.equal(def.defense.type, 'dodge');
  assert.equal(def.defense.ground.animation, 'dodge');
  assert.equal(def.defense.air.animation, 'midairDodge');
  const { fighter } = makeFighter();
  assert.equal(fighter.defense.type, 'dodge');
  for (const side of ['ground', 'air']) {
    const move = fighter.defense[side];
    const clip = def.animations[move.animation];
    assert.ok(Math.abs(move.total - clip.frames.length / clip.fps) < 1e-9, `${side} lasts one pass of its clip`);
    for (const phase of ['startup', 'invulnerable', 'recovery']) {
      const frames = move[phase] * clip.fps;
      assert.ok(Math.abs(frames - Math.round(frames)) < 1e-9, `${side} ${phase} is whole frames`);
    }
    assert.ok(move.invulnerable > 0, `${side} has an evasive window`);
    assert.ok(move.invulnerable < move.total, `${side} is not invulnerable throughout`);
    assert.ok(move.recovery > 0, `${side} ends vulnerable`);
  }
  // Ground: dodge2 only (the side-on lean). Air: midairdodge1-2 (the
  // afterimage frames); midairdodge3 is solid again.
  assert.deepEqual([fighter.defense.ground.startup, fighter.defense.ground.invulnerable, fighter.defense.ground.recovery],
    [1 / 12, 1 / 12, 1 / 12]);
  assert.deepEqual([fighter.defense.air.startup, fighter.defense.air.invulnerable, fighter.defense.air.recovery],
    [0, 2 / 12, 1 / 12]);
  // Not a Block: no chip-damage stat for #0001.
  assert.equal(def.stats.blockDamageScale, undefined);
});

test('a Dodge is a Defense action, never an attack or a combat action', () => {
  assert.ok(!COMBAT_ACTIONS.includes('defense'));
  assert.ok(!COMBAT_ACTIONS.includes('dodge'));
  assert.equal(def.actions.defense, undefined);
  for (const [id, atk] of Object.entries(def.attacks)) {
    assert.doesNotMatch(id, /dodge/i);
    assert.doesNotMatch(atk.animation, /dodge/i);
  }
  const { fighter, step } = makeFighter();
  step(DEFENSE);
  assert.equal(fighter.combat.attack, null, 'no attack, hitbox or hasHit');
  assert.equal(fighter.combat.phase, null);
  while (fighter.state === 'defense') step();
  assert.equal(fighter.combat.cooldowns.size, 0, 'no cooldown entry');
});

// ---- Input rename -------------------------------------------------------------

test('the generic input is defense on L; block is gone from the gameplay actions', () => {
  assert.ok(ACTIONS.includes('defense'));
  assert.ok(!ACTIONS.includes('block'));
  assert.ok(!ACTIONS.includes('dodge'), 'the shared action is not named after one mechanic');
  assert.deepEqual(CONFIG.bindings.defense, ['KeyL']);
  assert.equal(CONFIG.bindings.block, undefined);
  assert.equal(ACTION_LABELS.defense, 'Defense');
  assert.equal(ACTION_LABELS.block, undefined);
  assert.deepEqual(ACTIONS, ['left', 'right', 'charge', 'jump', 'primary', 'special', 'defense', 'action1', 'action2', 'pause']);
});

test('InputManager exposes defense / defensePressed from L, RB and RT; other pad buttons are unchanged', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code) => listeners[type]({ code, repeat: false, preventDefault() {} });

  const frame = input.sample();
  assert.ok('defense' in frame && 'defensePressed' in frame);
  assert.ok(!('block' in frame) && !('blockPressed' in frame));

  key('keydown', 'KeyL');
  let f = input.sample();
  assert.equal(f.defense, true);
  assert.equal(f.defensePressed, true);
  f = input.sample();
  assert.equal(f.defense, true, 'held');
  assert.equal(f.defensePressed, false, 'one press edge per press');
  key('keyup', 'KeyL');
  assert.equal(input.sample().defense, false);

  listeners.gamepadconnected();
  const button = (i, down) => {
    pad.buttons[i] = { pressed: down, value: down ? 1 : 0 };
    input.pollGamepads(0);
  };
  for (const i of [5, 7]) { // RB, RT
    button(i, true);
    f = input.sample();
    assert.equal(f.defense, true, `button ${i}`);
    assert.equal(f.defensePressed, true, `button ${i}`);
    button(i, false);
    assert.equal(input.sample().defense, false);
  }
  for (const [i, action] of [[0, 'jump'], [1, 'action1'], [4, 'action2'], [13, 'charge'], [2, 'primary'], [3, 'special']]) {
    button(i, true);
    f = input.sample();
    assert.equal(f[action], true, `button ${i} -> ${action}`);
    assert.equal(f.defense, false, `button ${i} is not Defense`);
    button(i, false);
  }
  pad.axes[1] = 0.9; // left stick down is still Charge
  input.pollGamepads(0);
  assert.equal(input.sample().charge, true);
});

// ---- Ground Dodge -------------------------------------------------------------

test('one Defense press on the ground plays dodge1, dodge2, dodge3 once, then idle', () => {
  const { fighter, step } = makeFighter();
  assert.equal(fighter.state, 'idle');
  step(DEFENSE);
  assert.equal(fighter.state, 'defense');
  assert.equal(fighter.combat.defenseAction.type, 'dodge');
  assert.equal(fighter.combat.defenseAction.def.animation, 'dodge');
  assert.equal(fighter.animator.anim.key, 'dodge');
  assert.equal(frameName(fighter), '0001_dodge1.png');

  const { fighter: f2, step: step2 } = makeFighter();
  const log = recordDodge(step2);
  assert.deepEqual(sequence(log), GROUND, 'no loop back to dodge1');
  assert.equal(log.length, steps(3 / DODGE_FPS), 'exactly one pass of the clip');
  assert.ok(log.every((s) => s.anim === 'dodge' && s.move === 'dodge'));
  assert.equal(f2.state, 'idle');
  assert.equal(frameName(f2), '0001_idle1.png');
  assert.equal(f2.combat.defenseAction, null);
  assert.equal(f2.combat.blocking, false, 'never a guard');
});

test('holding Defense does not repeat the Dodge; a new press starts a new one from dodge1', () => {
  const { fighter, step } = makeFighter();
  const log = recordDodge(step, DEFENSE, HOLD);
  assert.deepEqual(sequence(log), GROUND);
  // Hold for much longer than the clip: one Dodge only, then idle.
  for (let i = 0; i < steps(2); i++) {
    step(HOLD);
    assert.equal(fighter.state, 'idle');
    assert.equal(fighter.combat.defenseAction, null);
    assert.equal(fighter.combat.invulnerable, false);
  }
  // Release (nothing special), then press again.
  step();
  assert.equal(fighter.state, 'idle');
  const again = recordDodge(step, DEFENSE, HOLD);
  assert.equal(again[0].frame, '0001_dodge1.png');
  assert.deepEqual(sequence(again), GROUND);
  // A press right as one Dodge ends starts the next straight away.
  step(DEFENSE);
  stepUntil(step, (f) => f.combat.defenseAction === null, HOLD);
  step(DEFENSE);
  assert.equal(fighter.state, 'defense');
  assert.equal(frameName(fighter), '0001_dodge1.png');
});

test('a ground Dodge adds no displacement: velocity decays exactly as with no input', () => {
  const { fighter, step } = makeFighter();
  const plain = makeFighter();
  const right = { right: true };
  stepUntil(step, (f) => f.body.vx >= f.maxSpeed, right);
  stepUntil(plain.step, (f) => f.body.vx >= f.maxSpeed, right);
  assert.equal(fighter.body.x, plain.fighter.body.x);
  // Holding right through the Dodge changes nothing: the lock matches letting go.
  const log = recordDodge(step, { ...DEFENSE, ...right }, right);
  plain.step();
  for (const [i, s] of log.entries()) {
    assert.equal(s.x, plain.fighter.body.x, `step ${i}: x`);
    assert.equal(s.vx, plain.fighter.body.vx, `step ${i}: vx`);
    assert.equal(s.grounded, true);
    plain.step();
  }
  assert.ok(log.at(-1).vx < log[0].vx, 'slowed under normal deceleration');
  // Standing still, a Dodge moves nobody.
  const still = makeFighter();
  const x = still.fighter.body.x;
  for (const s of recordDodge(still.step, DEFENSE, { left: true })) assert.equal(s.x, x);
});

test('facing locks for the whole Dodge, then follows input again', () => {
  const { fighter, step } = makeFighter({ facing: 1 });
  const left = { left: true };
  const log = recordDodge(step, { ...DEFENSE, ...left }, left);
  assert.ok(log.every((s) => s.facing === 1), 'no mirror flip mid-Dodge');
  stepUntil(step, (f) => f.facing === -1, left, 20);

  // Nor does it turn toward an opponent that crosses behind it.
  const me = makeFighter({ x: 500, facing: 1 });
  const foe = makeFighter({ x: 700 });
  me.fighter.opponent = foe.fighter;
  me.step(DEFENSE);
  foe.fighter.body.x = 300;
  while (me.fighter.state === 'defense') {
    assert.equal(me.fighter.facing, 1);
    me.step();
  }
  for (let i = 0; i < 30; i++) me.step();
  assert.equal(me.fighter.facing, 1, 'nor afterwards: only its own movement turns it');
});

// ---- Mid-air Dodge --------------------------------------------------------------

for (const [when, setup] of [
  ['rising', (step) => { step(JUMP); step(); }],
  ['falling', (step) => { step(JUMP); stepUntil(step, (f) => f.body.vy > 0 && f.body.y < 700); }],
]) {
  test(`Defense while ${when} plays midairdodge1-3 once, and gravity keeps working`, () => {
    const { fighter, step } = makeFighter();
    const plain = makeFighter();
    setup(step);
    setup(plain.step);
    assert.equal(fighter.grounded, false);
    assert.equal(fighter.state, when === 'rising' ? 'jump' : 'fall');
    const log = recordDodge(step);
    assert.equal(log[0].frame, '0001_midairdodge1.png');
    assert.deepEqual(sequence(log), AIR);
    assert.equal(log.length, steps(3 / DODGE_FPS));
    assert.ok(log.every((s) => s.anim === 'midairDodge' && !s.grounded));
    // The exact trajectory of the same jump without a Dodge: no hover, lift,
    // spike or drift.
    for (const [i, s] of log.entries()) {
      plain.step();
      assert.equal(s.y, plain.fighter.body.y, `step ${i}: y`);
      assert.equal(s.vy, plain.fighter.body.vy, `step ${i}: vy`);
      assert.equal(s.x, plain.fighter.body.x, `step ${i}: x`);
    }
    assert.ok(log.at(-1).vy > log[0].vy, 'still accelerating downward');
    assert.ok(['jump', 'fall'].includes(fighter.state));
  });
}

test('a mid-air Dodge keeps its horizontal momentum under the normal air drag', () => {
  const right = { right: true };
  const { fighter, step } = makeFighter();
  const plain = makeFighter();
  for (const r of [step, plain.step]) {
    stepUntil(r, (f) => f.body.vx >= f.maxSpeed, right);
    r({ ...JUMP, ...right });
    r(right);
  }
  // Holding right is ignored during the Dodge, like letting go of it.
  const log = recordDodge(step, { ...DEFENSE, ...right }, right);
  plain.step();
  for (const [i, s] of log.entries()) {
    assert.equal(s.vx, plain.fighter.body.vx, `step ${i}: vx`);
    assert.equal(s.x, plain.fighter.body.x, `step ${i}: x`);
    plain.step();
  }
  assert.ok(log.at(-1).vx > fighter.maxSpeed / 2, 'momentum carries on');
  assert.equal(fighter.grounded, false);
});

test('landing during a mid-air Dodge finishes the mid-air clip; no ground Dodge, no Land midway', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 760);
  const states = [];
  const log = recordDodge(step);
  assert.equal(log[0].grounded, false);
  assert.ok(log.some((s) => s.grounded), 'landed during the Dodge');
  for (const s of log) {
    assert.equal(s.move, 'midairDodge');
    assert.equal(s.anim, 'midairDodge');
    assert.ok(AIR.includes(s.frame), s.frame);
  }
  assert.deepEqual(sequence(log), AIR, 'all three mid-air frames finish');
  assert.equal(log.length, steps(3 / DODGE_FPS), 'the Dodge runs its full length');
  // Touchdown happened mid-Dodge: straight back to a grounded state.
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.state, 'idle');
  for (let i = 0; i < 10; i++) states.push(step().state);
  assert.ok(!states.includes('land') && !states.includes('defense'), states.join());
});

test('Defense pressed on the ground with Jump dodges on the ground; the jump never launches', () => {
  const { fighter, step } = makeFighter();
  const log = recordDodge(step, { ...DEFENSE, ...JUMP }, { jump: true });
  assert.equal(log[0].move, 'dodge');
  assert.ok(log.every((s) => s.grounded), 'Dodge owns the step');
  for (let i = 0; i < 20; i++) {
    step({ jump: true });
    assert.equal(fighter.grounded, true, 'the buffered jump expired during the Dodge');
  }
  // A fresh Jump press afterwards jumps normally.
  step(JUMP);
  assert.equal(fighter.grounded, false);
});

// ---- Priority ---------------------------------------------------------------------

test('an attack pressed with Defense wins; Defense during an attack does nothing', () => {
  for (const [press, id] of [[BA1, 'ba1'], [BA2, 'ba2']]) {
    const { fighter, step } = makeFighter();
    step({ ...press, ...DEFENSE });
    const atk = fighter.combat.attack.def;
    assert.equal(atk.id, id);
    assert.equal(fighter.combat.defenseAction, null, 'never both');
    // Presses while the attack plays are ignored, not buffered.
    for (let i = 1; i < steps(atk.total); i++) {
      step(i % 3 ? HOLD : DEFENSE);
      assert.equal(fighter.combat.attack?.def.id, id, 'the attack plays out unchanged');
      assert.equal(fighter.combat.defenseAction, null);
      assert.notEqual(fighter.state, 'defense');
    }
    // It ends; holding Defense afterwards starts nothing, a new press dodges.
    step(HOLD);
    assert.equal(fighter.combat.attack, null);
    assert.equal(fighter.state, 'idle');
    step(DEFENSE);
    assert.equal(fighter.state, 'defense');
  }
  // Mid-air too.
  const air = makeFighter();
  air.step(JUMP);
  air.step({ ...BA1, ...DEFENSE });
  assert.equal(air.fighter.combat.attack.def.id, 'midairBa1');
  assert.equal(air.fighter.combat.defenseAction, null);
});

test('no attack starts during a Dodge; hitstun blocks a Dodge from starting', () => {
  const { fighter, step } = makeFighter();
  step(DEFENSE);
  for (let i = 1; i < steps(3 / DODGE_FPS); i++) {
    step(BA1);
    assert.equal(fighter.state, 'defense');
    assert.equal(fighter.combat.attack, null);
  }
  // Once it has ended, BA1 works at once.
  step(BA1);
  assert.equal(fighter.combat.attack?.def.id, 'ba1');
  const stunned = makeFighter();
  stunned.fighter.combat.stun = 0.2;
  stunned.step(DEFENSE);
  assert.equal(stunned.fighter.state, 'hitstun');
  assert.equal(stunned.fighter.combat.defenseAction, null);
  stepUntil(stunned.step, (f) => f.state !== 'hitstun', HOLD);
  assert.equal(stunned.fighter.state, 'idle', 'the press is not buffered through the stun');
});

// ---- Invulnerability (real hitboxes via CombatSystem) ---------------------------

test('the invulnerable steps sit on the evasive frames: dodge2, and midairdodge1-2', () => {
  const cases = {
    dodge: { evasive: [GROUND[1]], setup: () => {} },
    midairDodge: { evasive: AIR.slice(0, 2), setup: (step) => { step(JUMP); step(); } },
  };
  for (const [key, { evasive, setup }] of Object.entries(cases)) {
    const { step } = makeFighter();
    setup(step);
    const log = recordDodge(step);
    assert.equal(log[0].move, key);
    const invulnerable = log.filter((s) => s.invulnerable);
    assert.equal(invulnerable.length, FRAME * evasive.length, `${key}: exactly the evasive frame time`);
    assert.ok(invulnerable.length < log.length, `${key}: never the whole Dodge`);
    // As with attack phases, the window may trail the art by one step.
    const off = invulnerable.filter((s) => !evasive.includes(s.frame));
    assert.ok(off.length <= 1, `${key}: invulnerable on ${off.map((s) => s.frame)}`);
    const exposed = log.filter((s) => evasive.includes(s.frame) && !s.invulnerable);
    assert.ok(exposed.length <= 1, `${key}: evasive art shown while vulnerable`);
    // The last frame is recovery: vulnerable for all but that one trailing step.
    const last = log.filter((s) => s.frame === (key === 'dodge' ? GROUND : AIR)[2]);
    assert.ok(last.filter((s) => s.invulnerable).length <= 1);
    assert.equal(log.at(-1).phase, 'recovery');
  }
});

// Ticks the duel until the attacker's attack ends (or, with untilHit, until it
// connects), pressing Defense for the target on tick `at`, relative to the
// attack press at 0 (negative: the Dodge starts first).
function exchange({ attack = BA1, at = 0, setup, untilHit = false } = {}) {
  const d = duel();
  setup?.(d);
  const log = [];
  const pre = Math.max(0, -at);
  for (let i = 0; i < pre; i++) d.tick({}, i === pre + at ? DEFENSE : {});
  for (let i = 0; ; i++) {
    const before = d.events.length;
    d.tick(i === 0 ? attack : {}, i === at ? DEFENSE : {});
    const atk = d.attacker.combat.attack;
    log.push({
      i, phase: d.attacker.combat.phase, hit: d.events.length > before,
      targetPhase: d.target.combat.defensePhase, hasHit: atk?.hasHit ?? null,
    });
    if (!atk || (untilHit && d.events.length)) break;
  }
  return { ...d, log };
}

test('a BA1 whose active frame meets dodge2 passes clean through', () => {
  const { attacker, target, events, log } = exchange({ attack: BA1, at: 0 });
  const active = log.filter((s) => s.phase === 'active');
  assert.equal(active.length, FRAME);
  assert.ok(active.every((s) => s.targetPhase === 'invulnerable'), 'overlaps the evasive frame');
  assert.deepEqual(events, [], 'no hit and no block event');
  assert.ok(log.every((s) => !s.hasHit), 'the attack is not used up');
  assert.equal(target.combat.knockback, 0, 'no Knockback added');
  assert.equal(target.combat.stun, 0);
  assert.equal(target.combat.hitstop, 0);
  assert.equal(attacker.combat.hitstop, 0, 'no impact freeze either side');
  assert.equal(target.body.vx, 0, 'no knockback');
  assert.equal(target.combat.blocking, false);
});

test('a mid-air BA1 passes through the afterimage frames of a mid-air Dodge', () => {
  const { target, events, log } = exchange({
    attack: BA1, at: FRAME,
    setup: (d) => d.tick(JUMP, JUMP),
  });
  assert.equal(target.grounded, false);
  const active = log.filter((s) => s.phase === 'active');
  assert.ok(active.length > 0);
  assert.ok(active.every((s) => s.targetPhase === 'invulnerable'));
  assert.deepEqual(events, []);
  assert.equal(target.combat.knockback, 0);
});

test('an attack still active after the evasive frame connects then, as a normal hit', () => {
  // Ground BA2 is active for two frames; the Dodge covers only the first.
  const { target, events, log } = exchange({ attack: BA2, at: FRAME * 2 });
  const hit = log.find((s) => s.hit);
  assert.ok(hit, 'the kick connects');
  const passed = log.filter((s) => s.phase === 'active' && s.i < hit.i);
  assert.ok(passed.length >= FRAME - 1, 'passed through during the invulnerable frame first');
  assert.ok(passed.every((s) => s.targetPhase === 'invulnerable'));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'hit');
  assert.equal(events[0].damage, 10);
  assert.equal(target.combat.knockback, 10);
});

for (const [when, at] of [['startup', FRAME], ['recovery', -FRAME]]) {
  test(`a hit during the Dodge's ${when} lands in full and cancels the Dodge`, () => {
    const d = exchange({ attack: BA1, at, untilHit: true });
    const hit = d.log.find((s) => s.hit);
    assert.equal(hit.targetPhase, null, 'the hit cleared the Dodge');
    // How far into the Dodge the hit landed: before or after dodge2.
    const into = (hit.i - at) * DT;
    const move = d.target.defense.ground;
    if (when === 'startup') assert.ok(into < move.startup, `struck ${into}s in`);
    else assert.ok(into >= move.startup + move.invulnerable - 1e-9 && into < move.total, `struck ${into}s in`);
    assert.ok(hit, 'hit');
    assert.equal(d.events.length, 1);
    assert.equal(d.events[0].type, 'hit', 'never a block');
    assert.equal(d.events[0].damage, 5, 'full damage, no chip scaling');
    assert.equal(d.target.combat.knockback, 5);
    assert.equal(d.target.combat.defenseAction, null, 'hitstun takes over');
    d.tick();
    assert.equal(d.target.state, 'hitstun');
    assert.equal(frameName(d.target), '0001_hurt.png');
    // Hitstun, not blockstun; full knockback once the freeze ends.
    assert.ok(Math.abs(d.target.combat.stun - def.attacks.ba1.hitstun) < 1e-9);
    while (d.target.combat.hitstop > 0) d.tick();
    d.tick();
    assert.ok(d.target.body.vx > 0, 'knocked back');
    // The cancelled Dodge never comes back after the stun.
    const states = [];
    while (d.target.combat.stun > 0) {
      d.tick();
      states.push(d.target.state);
    }
    d.tick();
    states.push(d.target.state);
    assert.ok(!states.includes('defense'), states.join());
  });
}

test('holding Defense is no guard: #0001 takes full hits with no chip damage', () => {
  // Held without a new press: no Dodge, and no Block either.
  const { attacker, target, tick, until, events } = duel();
  for (let i = 0; i < 10; i++) tick({}, HOLD);
  assert.equal(target.state, 'idle', 'no guard pose');
  tick(BA1, HOLD);
  until(() => events.length > 0);
  assert.equal(events[0].type, 'hit');
  assert.equal(events[0].damage, def.attacks.ba1.damage);
  assert.equal(target.combat.knockback, 5, 'not the old 15% chip damage');
  assert.equal(target.combat.blocking, false);
  assert.ok(Math.abs(target.combat.stun - def.attacks.ba1.hitstun) < 1e-9, 'hitstun, not blockstun');
  while (attacker.combat.attack) tick({}, HOLD);

  // Nor does holding it lock movement or ever show a block state.
  const { fighter, step } = makeFighter();
  for (let i = 0; i < steps(1); i++) {
    step({ ...HOLD, right: true });
    assert.notEqual(fighter.state, 'block');
    assert.equal(fighter.combat.blocking, false);
  }
  assert.equal(fighter.state, 'run');
});

test('a Dodge changes no Knockback and starts no cooldown', () => {
  const { attacker, target, events, log } = exchange({ attack: BA1, at: 0 });
  assert.ok(log.length > 0);
  assert.deepEqual(events, []);
  for (const f of [attacker, target]) {
    assert.equal(f.combat.knockback, 0);
    assert.equal(f.combat.chargedCooldowns.size, 0);
  }
});

// ---- Missing art ----------------------------------------------------------------

test('missing Dodge art refuses the Dodge: no invisible invulnerability', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    const noDodge = Object.keys(def.animations).filter((k) => !/dodge/i.test(k));
    const { attacker, target, tick, until, events } = duel({ targetSprites: fakeSprites(noDodge) });
    tick(BA1, DEFENSE);
    assert.equal(target.combat.defenseAction, null);
    assert.equal(target.state, 'idle', 'no idle-as-dodge');
    assert.equal(target.combat.invulnerable, false);
    until(() => events.length > 0);
    assert.equal(events[0].type, 'hit', 'the attack lands normally');
    assert.equal(target.combat.knockback, 5);
    while (attacker.combat.attack) tick();

    // Only the mid-air clip missing: ground Dodges still work, air ones are refused.
    const noAir = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'midairDodge')) });
    noAir.step(DEFENSE);
    assert.equal(noAir.fighter.animator.anim.key, 'dodge');
    stepUntil(noAir.step, (f) => f.state !== 'defense');
    noAir.step(JUMP);
    noAir.step(DEFENSE);
    assert.equal(noAir.fighter.combat.defenseAction, null);
    assert.equal(noAir.fighter.state, 'jump');
    assert.ok(warnings.some((w) => /Dodge "midairDodge" has no animation frames/.test(w)));
  } finally {
    console.warn = warn;
  }
});

// ---- Architecture: Defense types ------------------------------------------------

test('Defense stays generic: a Block-type character guards, one without Defense does nothing', () => {
  const blocker = { ...def, defense: { type: 'block' }, stats: { ...def.stats, blockDamageScale: 0.15 } };
  const { attacker, target, tick, events } = duel({ targetCharacter: blocker });
  tick({}, DEFENSE);
  assert.equal(target.combat.blocking, true);
  assert.equal(target.state, 'block');
  assert.equal(target.combat.defenseAction, null, 'a Block never dodges');
  tick(BA1, HOLD);
  for (let i = 0; i < 60 && !events.length; i++) tick({}, HOLD);
  assert.equal(events[0].type, 'block');
  assert.ok(Math.abs(events[0].damage - 5 * 0.15) < 1e-9, 'chip damage');
  assert.ok(Math.abs(target.combat.knockback - 5 * 0.15) < 1e-9, 'added to Knockback, like any damage');
  assert.ok(Math.abs(target.combat.stun - def.attacks.ba1.blockstun) < 1e-9, 'blockstun');
  while (attacker.combat.attack) tick({}, HOLD);

  const none = makeFighter({ character: { ...def, defense: undefined } });
  assert.equal(none.fighter.defense, null);
  none.step(DEFENSE);
  assert.equal(none.fighter.state, 'idle');
  assert.equal(none.fighter.combat.blocking, false);
  assert.equal(none.fighter.combat.defenseAction, null);

  assert.equal(createDefenseDefinition(undefined), null);
  assert.equal(createDefenseDefinition({ type: 'block' }).type, 'block');
  assert.equal(createDefenseDefinition(def.defense).type, 'dodge');
  assert.throws(() => createDefenseDefinition({ type: 'parry' }), /Unknown defense type/);
});

// ---- Training CPU -----------------------------------------------------------------

test('the training CPU never presses Defense and never dodges', async () => {
  const { TrainingAIController } = await import('../js/game/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 300 < 150 ? { right: true, ...(i % 50 === 0 ? DEFENSE : {}) } : { left: true });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.defense, false);
    assert.equal(out.defensePressed, false);
    assert.equal('block' in out, false);
    bot.step(out);
    assert.notEqual(bot.fighter.state, 'defense');
    assert.equal(bot.fighter.combat.defenseAction, null);
    assert.equal(bot.fighter.combat.attack, null);
  }
});
