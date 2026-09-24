// Run with node --test tests/fighter-animation.test.mjs (no dependencies).
// #0001 animation registration plus airborne, landing and hurt states on the
// real Fighter, physics and SpriteSet resolve logic (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTERS, characterFramePaths } from '../js/data/characters.js';
import { CONFIG } from '../js/config.js';
import { getJumpVelocity, getMaxSpeed } from '../js/data/powers.js';
import { def, DT, BASE, fakeSprites, makeFighter, frameName, stepUntil } from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

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

const NEW_CLIPS = {
  hurt: [`${BASE}hurt.png`],
  midairHurt: [`${BASE}midairhurt.png`],
  ba1: [`${BASE}1ba1.png`, `${BASE}1ba2.png`, `${BASE}1ba3.png`, `${BASE}1ba4.png`],
  // Mid-air BA1 is the three-frame kunai slash, drawn as midair2ba1-3.
  midairBa1: [`${BASE}midair2ba1.png`, `${BASE}midair2ba2.png`, `${BASE}midair2ba3.png`],
};

test('#0001 registers hurt, mid-air hurt and both Basic Attack 1 clips', () => {
  const paths = characterFramePaths(def);
  for (const [key, frames] of Object.entries(NEW_CLIPS)) {
    const anim = def.animations[key];
    assert.ok(anim, `${key} is registered`);
    // Exact, ordered frame lists: the trailing number is the frame number.
    assert.deepEqual(anim.frames, frames, key);
    assert.equal(anim.loop, false, `${key} plays once`);
    assert.ok(anim.fps > 0, `${key} has a positive fps`);
    for (const url of frames) {
      assert.ok(paths.includes(url), `${url} is preloaded`);
      assert.ok(url.startsWith('./assets/characters/0001/'), `${url} is relative and canonical`);
      assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
      assert.ok(!existsSync(ROOT + url.split('/').pop()), `no root copy of ${url}`);
    }
  }
  assert.equal(def.animations.ba1.frames.length, 4);
  assert.equal(def.animations.midairBa1.frames.length, 3);
  assert.equal(def.animations.ba1.fps, 12);
  assert.equal(def.animations.midairBa1.fps, 12);
  // Hurt art that fails to load holds a still idle frame.
  assert.deepEqual(def.animationFallbacks.hurt, { animation: 'idle', frame: 0 });
  assert.deepEqual(def.animationFallbacks.midairHurt, { animation: 'idle', frame: 0 });
});

test('#0001 registers both Basic Attack 2 clips from the canonical asset folder', () => {
  const expected = {
    ba2: Array.from({ length: 7 }, (_, i) => `${BASE}2ba${i + 1}.png`),
    // Mid-air BA2 is the five-frame airborne kick, drawn as midair1ba1-5.
    midairBa2: Array.from({ length: 5 }, (_, i) => `${BASE}midair1ba${i + 1}.png`),
  };
  const paths = characterFramePaths(def);
  for (const [key, frames] of Object.entries(expected)) {
    const anim = def.animations[key];
    assert.ok(anim, `${key} is registered`);
    // Exact, ordered frame lists: the trailing number is the frame number.
    assert.deepEqual(anim.frames, frames, key);
    assert.equal(anim.loop, false, `${key} plays once`);
    assert.equal(anim.fps, 12, `${key} plays at BA2's 12 fps`);
    for (const url of frames) {
      assert.ok(paths.includes(url), `${url} is preloaded`);
      assert.ok(url.startsWith('./assets/characters/0001/'), `${url} is relative and canonical`);
      assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
      assert.ok(!existsSync(ROOT + url.split('/').pop()), `no root copy of ${url}`);
    }
    // Attacks never fall back to other art.
    assert.equal(def.animationFallbacks[key], undefined);
  }
  const dir = readdirSync(ROOT + 'assets/characters/0001/');
  assert.deepEqual(dir.filter((n) => /^0001_2ba\d\.png$/.test(n)).sort(), expected.ba2.map((u) => u.split('/').pop()));
  assert.deepEqual(dir.filter((n) => /^0001_midair1ba\d\.png$/.test(n)).sort(), expected.midairBa2.map((u) => u.split('/').pop()));
  assert.deepEqual(dir.filter((n) => /^0001_midair2ba\d\.png$/.test(n)).sort(), NEW_CLIPS.midairBa1.map((u) => u.split('/').pop()));
});

test('the misspelled 2ab frame names are gone for good', () => {
  for (const url of characterFramePaths(def)) assert.doesNotMatch(url, /2ab/i, url);
  for (const dir of ['', 'assets/characters/0001/']) {
    for (const name of readdirSync(ROOT + dir)) assert.doesNotMatch(name, /2ab/i, `${dir}${name}`);
  }
  const sources = (dir) => readdirSync(ROOT + dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : []);
  for (const file of sources('js/')) assert.doesNotMatch(readFileSync(ROOT + file, 'utf8'), /\b\d{4}_(midair)?2ab/i, file);
});

test('the third ground BA1 frame is exactly 0001_1ba3.png, with no U+FFFC anywhere', () => {
  const OBJ = '\uFFFC';
  assert.equal(def.animations.ba1.frames[2], './assets/characters/0001/0001_1ba3.png');
  assert.equal(def.animations.ba1.frames[2].split('/').pop(), '0001_1ba3.png');
  for (const url of characterFramePaths(def)) assert.ok(!url.includes(OBJ), `${url} is clean`);
  for (const dir of ['', 'assets/characters/0001/']) {
    for (const name of readdirSync(ROOT + dir)) assert.ok(!name.includes(OBJ), `${dir}${name} is clean`);
  }
  assert.ok(readdirSync(ROOT + 'assets/characters/0001/').includes('0001_1ba3.png'));
  // No character frames are left at the repository root.
  assert.deepEqual(readdirSync(ROOT).filter((n) => /^0001_.*\.png$/i.test(n)), []);
});

test('movement, collider and hurtbox data are unchanged', () => {
  // The jump's strength and the top speed moved to the Power system
  // (js/data/powers.js): movement keeps every other stat, and no raw
  // jumpVelocity or maxSpeed can drift from the tiers that now decide them.
  assert.deepEqual(def.movement, {
    acceleration: 2600, deceleration: 3200, turnBoost: 1.6,
    airAcceleration: 1500, airDeceleration: 420, gravityScale: 1,
    maxFallSpeed: 1500, coyoteTime: 0.08, jumpBuffer: 0.12, dropThroughTime: 0.28,
  });
  assert.deepEqual(def.powers, { jump: 2, speed: 2 });
  assert.equal(getJumpVelocity(def), 920, 'Jump Power 2 is the original jump');
  assert.equal(getMaxSpeed(def), 330, 'Speed Power 2 is the original top speed');
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
  assert.equal(frameName(fighter), '0001_hurt.png');
});

test('grounded hitstun shows 0001_hurt.png, then idle resumes', () => {
  const { fighter, step } = makeFighter();
  fighter.combat.stun = 0.22;
  step();
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_hurt.png');
  const n = stepUntil(step, (f) => f.state !== 'hitstun');
  assert.equal(n + 1, Math.ceil(0.22 / DT)); // the stun, not a single tick
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle1.png');
});

test('hitstun takes priority over run, and run resumes when it ends', () => {
  const { fighter, step } = makeFighter();
  const right = { right: true };
  stepUntil(step, (f) => f.state === 'run', right);
  fighter.combat.stun = 0.2;
  step(right);
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_hurt.png');
  stepUntil(step, (f) => f.state !== 'hitstun', right);
  stepUntil(step, (f) => f.state === 'run', right, 30);
});

test('airborne hitstun shows 0001_midairhurt.png, switching to 0001_hurt.png on landing', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  stepUntil(step, (f) => f.body.vy > 0 && f.body.y > 700);
  fighter.combat.stun = 1;
  step();
  assert.equal(fighter.grounded, false);
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_midairhurt.png');
  while (!fighter.grounded) {
    assert.equal(frameName(fighter), '0001_midairhurt.png');
    step();
  }
  // Still stunned on the ground: the grounded hurt pose, never land.
  assert.equal(fighter.state, 'hitstun');
  assert.equal(frameName(fighter), '0001_hurt.png');
  stepUntil(step, (f) => f.state !== 'hitstun');
  assert.equal(fighter.state, 'idle');
});

test('hitstun ending mid-air resumes jump or fall', () => {
  const { fighter, step } = makeFighter();
  step({ jump: true, jumpPressed: true });
  step();
  fighter.combat.stun = 0.1;
  step();
  assert.equal(frameName(fighter), '0001_midairhurt.png');
  stepUntil(step, (f) => f.state !== 'hitstun');
  assert.equal(fighter.grounded, false);
  assert.ok(['jump', 'fall'].includes(fighter.state));
  assert.equal(frameName(fighter), `0001_${fighter.state}1.png`);
});

test('the hurt poses are visual only: hitstun movement matches a fighter without hurt art', () => {
  const withHurt = makeFighter();
  const without = makeFighter({ sprites: fakeSprites(['idle', 'run', 'jump', 'fall', 'land']) });
  for (let i = 0; i < 160; i++) {
    const held = i === 0 ? { jump: true, jumpPressed: true, right: true } : { right: true };
    if (i === 20 || i === 90) for (const r of [withHurt, without]) r.fighter.combat.stun = 0.3;
    const a = withHurt.step(held);
    const b = without.step(held);
    for (const k of ['x', 'y', 'vx', 'vy', 'grounded', 'landed']) {
      assert.equal(a.body[k], b.body[k], `step ${i}: body.${k}`);
    }
    assert.equal(a.state, b.state);
  }
});

test('missing hurt art holds a still idle frame instead of crashing', () => {
  const { fighter, step } = makeFighter({ sprites: fakeSprites(['idle', 'run', 'jump', 'fall', 'land']) });
  fighter.combat.stun = 0.3;
  step();
  assert.equal(fighter.state, 'hitstun');
  assert.equal(fighter.animator.hold, 0);
  assert.equal(frameName(fighter), '0001_idle1.png');
  step({ jump: true, jumpPressed: true }); // stunned: no jump
  assert.equal(fighter.grounded, true);
  stepUntil(step, (f) => f.state !== 'hitstun');
  assert.equal(fighter.state, 'idle');
  assert.equal(fighter.animator.hold, null);

  // Airborne, too.
  const air = makeFighter({ sprites: fakeSprites(['idle', 'run', 'jump', 'fall', 'land']) });
  air.step({ jump: true, jumpPressed: true });
  air.fighter.combat.stun = 0.3;
  air.step();
  assert.equal(air.fighter.state, 'hitstun');
  assert.equal(frameName(air.fighter), '0001_idle1.png');
  assert.equal(air.fighter.animator.hold, 0);
});

test('Charge on a platform charges in place: the old Down drop-through is gone', () => {
  const { fighter, step } = makeFighter({ x: 1000, y: 600 });
  assert.equal(fighter.body.ground.id, 'ledge');
  step({ charge: true, chargePressed: true });
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.body.ground.id, 'ledge');
  assert.equal(fighter.body.dropId, null);
  assert.equal(fighter.state, 'charge');
  assert.equal(frameName(fighter), '0001_charge1.png');
  for (let i = 0; i < 60; i++) step({ charge: true });
  assert.equal(fighter.body.ground.id, 'ledge');
  assert.equal(fighter.state, 'charge');
  // The removed gameplay action does nothing if something still sends it.
  step({ down: true, downPressed: true });
  assert.equal(fighter.body.ground.id, 'ledge');
});

test('the training CPU\'s platform drop still uses fall, then lands', () => {
  const { fighter, step } = makeFighter({ x: 1000, y: 600 });
  step({ dropPressed: true });
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
