// Run with node --test tests/fighter-animation.test.mjs (no dependencies).
// #0001 airborne/landing states on the real Fighter, physics and SpriteSet
// resolve logic. Sprite sets carry clip metadata only (no decoded PNGs), so
// scale, anchoring and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTERS, getCharacter, characterFramePaths } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { StageCollision } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { CONFIG } from '../js/config.js';

const def = getCharacter('0001');
const DT = CONFIG.sim.step;
const BASE = './assets/characters/0001/0001_';

// SpriteSet with the definition's clip metadata in place of decoded frames.
function fakeSprites(keys = Object.keys(def.animations)) {
  const set = new SpriteSet(def);
  for (const key of keys) {
    const anim = def.animations[key];
    set.animations[key] = {
      key, fps: anim.fps, loop: anim.loop !== false,
      frames: anim.frames.map((url) => ({ url })),
    };
  }
  set.usable = true;
  return set;
}

const STAGE = new StageCollision({
  groundLevel: 800,
  bounds: { left: 0, right: 2000 },
  platforms: [{ id: 'ledge', x: 900, y: 600, w: 200, h: 16 }],
  solids: [],
});

function makeFighter({ sprites = fakeSprites(), x = 500, y } = {}) {
  const input = {};
  const controller = { getInput: () => ({ ...input }) };
  const fighter = new Fighter({
    def, sprites, stage: STAGE, slot: 0, label: 'P1', controller,
    spawn: { x, y, facing: 1 },
  });
  const ctx = { stage: STAGE, gravity: CONFIG.sim.gravity };
  const step = (held = {}) => {
    for (const k of Object.keys(input)) delete input[k];
    Object.assign(input, held);
    fighter.update(DT, ctx);
    return fighter;
  };
  return { fighter, step };
}

const frameName = (f) => f.animator.frame?.url.split('/').pop();

// Steps until `pred` holds, returning the number of steps taken.
function stepUntil(step, pred, held, limit = 600) {
  for (let i = 1; i <= limit; i++) if (pred(step(held))) return i;
  throw new Error('condition never reached');
}

test('#0001 registers dedicated non-looping jump, fall and land clips', () => {
  const expected = {
    jump: [`${BASE}jump1.png`, `${BASE}jump2.png`],
    fall: [`${BASE}fall1.png`, `${BASE}fall2.png`],
    land: [`${BASE}land1.png`, `${BASE}land2.png`],
  };
  const paths = characterFramePaths(def);
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const [key, frames] of Object.entries(expected)) {
    const anim = def.animations[key];
    assert.deepEqual(anim.frames, frames, key);
    assert.equal(anim.loop, false, `${key} plays once`);
    assert.ok(anim.fps > 0);
    for (const url of frames) {
      assert.ok(paths.includes(url), `${url} is preloaded`);
      assert.ok(existsSync(root + url.slice(2)), `${url} exists`);
      assert.ok(!existsSync(root + url.split('/').pop()), `no root copy of ${url}`);
    }
    assert.deepEqual(def.animationFallbacks[key], { animation: 'idle', frame: 0 }, `${key} falls back to a still idle frame`);
  }
  assert.equal(def.animations.jump.fps, 10);
  assert.equal(def.animations.fall.fps, 10);
  assert.equal(def.animations.land.fps, 12);
  assert.equal(CHARACTERS.filter((c) => c.id === '0001').length, 1);
});

test('movement, collider and hurtbox data are unchanged', () => {
  assert.deepEqual(def.movement, {
    maxSpeed: 330, acceleration: 2600, deceleration: 3200, turnBoost: 1.6,
    airAcceleration: 1500, airDeceleration: 420, jumpVelocity: 920, gravityScale: 1,
    maxFallSpeed: 1500, coyoteTime: 0.08, jumpBuffer: 0.12, dropThroughTime: 0.28,
  });
  assert.deepEqual(def.collider, { width: 34, height: 80 });
  assert.deepEqual(def.pushbox, { width: 36 });
  assert.deepEqual(def.hurtboxes, [
    { x: -15, y: -80, w: 30, h: 34 },
    { x: -17, y: -46, w: 34, h: 46 },
  ]);
  assert.equal(CONFIG.sim.gravity, 2500);
});

test('a jump plays jump1, jump2, fall1, fall2, land1, land2, then idle', () => {
  const { fighter, step } = makeFighter();
  assert.equal(fighter.state, 'idle');

  step({ jump: true, jumpPressed: true });
  assert.equal(fighter.grounded, false);
  assert.ok(fighter.body.vy < 0);
  assert.equal(fighter.state, 'jump');
  assert.equal(frameName(fighter), '0001_jump1.png');

  stepUntil(step, (f) => frameName(f) === '0001_jump2.png');
  assert.equal(fighter.state, 'jump');
  // Long ascent: jump2 is held, the clip never cycles back to jump1.
  while (fighter.body.vy < 0) {
    assert.equal(fighter.state, 'jump');
    assert.equal(frameName(fighter), '0001_jump2.png');
    step();
  }

  assert.equal(fighter.state, 'fall');
  assert.equal(frameName(fighter), '0001_fall1.png');
  stepUntil(step, (f) => frameName(f) === '0001_fall2.png');
  while (!fighter.grounded) {
    assert.equal(fighter.state, 'fall');
    assert.equal(frameName(fighter), '0001_fall2.png');
    step();
  }

  assert.equal(fighter.body.landed, true);
  assert.equal(fighter.state, 'land');
  assert.equal(frameName(fighter), '0001_land1.png');

  const landSteps = [];
  while (fighter.state === 'land') {
    landSteps.push(frameName(fighter));
    step();
  }
  // Exactly one pass of the clip: frames / fps, not one simulation tick.
  const clip = def.animations.land;
  assert.equal(landSteps.length, Math.round(clip.frames.length / clip.fps / DT));
  assert.equal(landSteps[0], '0001_land1.png');
  assert.equal(landSteps.at(-1), '0001_land2.png');
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle1.png');
});

test('landing while holding a direction returns to run', () => {
  const { fighter, step } = makeFighter();
  const right = { right: true };
  step({ ...right, jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.state === 'land', right);
  stepUntil(step, (f) => f.state !== 'land', right);
  assert.equal(fighter.state, 'run');
});

test('the land state is visual only: the trajectory matches a fighter without land art', () => {
  const withLand = makeFighter();
  const without = makeFighter({ sprites: fakeSprites(['idle', 'run']) });
  const script = (i) => {
    if (i === 0 || i === 50 || i === 51) return { jump: true, jumpPressed: true, right: true };
    return i < 120 ? { right: true } : {};
  };
  const states = new Set();
  for (let i = 0; i < 200; i++) {
    const a = withLand.step(script(i));
    const b = without.step(script(i));
    states.add(a.state);
    for (const k of ['x', 'y', 'vx', 'vy', 'grounded', 'landed']) {
      assert.equal(a.body[k], b.body[k], `step ${i}: body.${k}`);
    }
    assert.equal(a.coyote, b.coyote);
    assert.equal(a.jumpBuffer, b.jumpBuffer);
  }
  assert.ok(states.has('land'));
});

test('jumping again immediately interrupts land and restarts the jump clip', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.state === 'land');
  assert.equal(frameName(fighter), '0001_land1.png');

  step({ jump: true, jumpPressed: true });
  assert.equal(fighter.grounded, false);
  assert.equal(fighter.state, 'jump');
  assert.equal(fighter.animator.index, 0);
  assert.equal(frameName(fighter), '0001_jump1.png');
});

test('a jump buffered before touchdown shows land for a single step', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 760);
  step({ jump: true, jumpPressed: true }); // buffered while airborne
  stepUntil(step, (f) => f.state === 'land');
  step();
  assert.equal(fighter.state, 'jump');
  assert.equal(frameName(fighter), '0001_jump1.png');
});

test('hitstun keeps priority over land', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 700);
  fighter.combat.stun = 1;
  stepUntil(step, (f) => f.grounded);
  assert.equal(fighter.body.landed, true);
  assert.equal(fighter.state, 'hitstun');
});

test('dropping through a platform uses fall, then lands', () => {
  const { fighter, step } = makeFighter({ x: 1000, y: 600 });
  assert.equal(fighter.body.ground.id, 'ledge');
  step({ down: true, downPressed: true });
  assert.equal(fighter.grounded, false);
  assert.equal(fighter.state, 'fall');
  assert.equal(frameName(fighter), '0001_fall1.png');
  stepUntil(step, (f) => f.grounded);
  assert.equal(fighter.body.ground.id, '__floor');
  assert.equal(fighter.state, 'land');
});

test('walking off a ledge uses fall, not jump', () => {
  const { fighter, step } = makeFighter({ x: 1080, y: 600 });
  stepUntil(step, (f) => !f.grounded, { right: true });
  assert.equal(fighter.state, 'fall');
});

test('without land art the fighter skips land; jump/fall hold an idle frame', () => {
  const { fighter, step } = makeFighter({ sprites: fakeSprites(['idle', 'run']) });
  assert.equal(fighter.landDuration, 0);
  step({ jump: true, jumpPressed: true });
  assert.equal(fighter.state, 'jump');
  assert.equal(fighter.animator.hold, 0);
  assert.equal(frameName(fighter), '0001_idle1.png');
  stepUntil(step, (f) => f.state === 'fall');
  assert.equal(frameName(fighter), '0001_idle1.png');
  stepUntil(step, (f) => f.grounded);
  assert.equal(fighter.body.landed, true);
  assert.equal(fighter.state, 'idle');
});

test('land duration follows the loaded clip, not a fixed frame count', () => {
  const sprites = fakeSprites();
  sprites.animations.land.frames.pop(); // e.g. land2 failed to load
  const { fighter, step } = makeFighter({ sprites });
  assert.equal(fighter.landDuration, 1 / def.animations.land.fps);
  step({ jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.state === 'land');
  const n = stepUntil(step, (f) => f.state !== 'land');
  assert.equal(n, Math.round(fighter.landDuration / DT));
});
