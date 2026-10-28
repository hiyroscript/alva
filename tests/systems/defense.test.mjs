// Run with node --test tests/systems/defense.test.mjs (no dependencies).
// `shield`, the shared defensive input (L / RB / RT / the touch Shield
// button), and #0001's Shield (Infinity), what its `defense` entry makes of
// it on the ground: artwork registration, the held Shield (never one in the
// air, for #0001 or #0002: there the button is the Deflect, see
// deflect.test.mjs), its poses
// (and a Shield's raise and lower poses, on a test variant that has them),
// physics, priority, the Energy cost of each blocked hit (and nothing
// else), full-circle blocking on the fighter's own hurtboxes, the
// low-Energy and exhaustion rules, missing-art safety, the Shield's
// black-and-red circle and the training CPU. And the Shield holding its
// fighter still (A to M below): raised standing or at a run (the run
// stopped on that step), either direction, let go and running again,
// jumped out of, in blockstun, under a block's push and a pull's drag, on
// a moving cloud, for every playable fighter (#0006's ensemble included),
// for the CPU, from the keyboard, touch and a controller alike, and at
// any frame rate; its ring waving at the Arena's own pace. The stall a
// Shield may put on a blow it blocks is in hit-effects.test.mjs. Uses the
// real Fighter, CombatSystem, physics and InputManager (see
// tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths, getCharacter, playableCharacters } from '../../js/data/characters.js';
import { COMBAT_ACTIONS } from '../../js/game/fighters/fighter.js';
import { createDefenseDefinition } from '../../js/game/combat/defense.js';
import { BLOCK_ENERGY_COST, CombatState, resolveEnergy } from '../../js/game/combat/combat-state.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { SpriteSet } from '../../js/game/rendering/sprite-normalizer.js';
import {
  SHIELD_SHAPE, SHIELD_STYLE, drawShield, shieldCenter, shieldOutline, shieldRadius,
} from '../../js/game/rendering/shield-fx.js';
import { fighterParts } from '../../js/game/rendering/ensemble.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { stepInTravel } from '../../js/game/fighters/movement.js';
import { StageCollision } from '../../js/game/physics.js';
import { BASE_FIGHTER_MOVEMENT } from '../../js/data/movement.js';
import { EDGE_RED } from '../../js/core/organic-edge.js';
import { energyBarState, ENERGY_STYLE } from '../../js/game/rendering/fighter-status.js';
import { ACTIONS, ACTION_LABELS, CONFIG } from '../../js/config.js';
import {
  def, DT, BASE, MOVEMENT, STAGE, SIM_CTX, fakeSprites, fakeSpritesOf, makeFighter, frameName, probeHit, stepUntil, steps, duel,
} from '../helpers/fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHIELD = { shield: true, shieldPressed: true };
const HOLD = { shield: true };
const ATTACK1 = { attack1: true, attack1Pressed: true };
const ATTACK2 = { attack2: true, attack2Pressed: true };
const KICK = { extra_attack: true, extra_attackPressed: true };
const JUMP = { jump: true, jumpPressed: true };
const RIGHT = { runRight: true };
const SHIELD_FPS = 12;
const POSE = steps(1 / SHIELD_FPS); // simulation steps the raise / lower pose shows
// What each block costs (every fighter's Shield, a perfect block's
// included), and #0001's refill rate.
const COST = BLOCK_ENERGY_COST;
const REGEN = def.energy.regen;
// #0001 with no Energy refill, so a run of blocks lands on exact values.
const NO_REGEN = { ...def, energy: { ...def.energy, regen: 0 } };
// #0001's Shield frame and its height in art pixels (its idle is 63): the
// held guard, on the ground (there is no Shield in the air). It has no raise
// or lower pose.
const SHIELD_FILES = {
  shielding: ['0001_shielding_1.png', 55],
};
// A test-only variant of #0001 whose Shield also has the optional raise
// and lower poses on the ground (prepshield, releaseshield), each one frame
// at SHIELD_FPS. Its art is metadata only (the fake sprites never load it).
const pose = (codename) => ({ frames: [`./assets/characters/test/test_${codename}_1.png`], fps: SHIELD_FPS, loop: false });
const RAISING = {
  ...def,
  id: 'test-raising',
  animations: { ...def.animations, prepshield: pose('prepshield'), releaseshield: pose('releaseshield') },
  defense: { ...def.defense, groundStartAnimation: 'prepshield', groundReleaseAnimation: 'releaseshield' },
};
const raising = (opts = {}) => makeFighter({ character: RAISING, ...opts });

// A PNG's pixel size, from its header.
const pngSize = (path) => {
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

// Steps a duel with the target holding Shield until the attacker's attack
// has connected (or `limit` steps pass), the attack pressed on the first.
// Raises the target's Shield and holds it past its perfect window: the
// blocks after it are ordinary ones (see the perfect Shield tests).
function raiseShield(d) {
  d.tick({}, SHIELD);
  for (let i = 0; i < steps(def.defense.perfectWindow) + 2; i++) d.tick({}, HOLD);
}

function blockedAttack(d, press = ATTACK1, targetHeld = HOLD, limit = 60) {
  const before = d.events.length;
  d.tick(press, targetHeld);
  for (let i = 0; i < limit && d.events.length === before; i++) d.tick({}, targetHeld);
  return d.events.slice(before);
}

// ---- Artwork ------------------------------------------------------------------

test('#0001\'s Shield frame lives in the canonical #0001 folder, and nowhere else; no air Shield art', () => {
  const paths = characterFramePaths(def);
  for (const [key, [name, height]] of Object.entries(SHIELD_FILES)) {
    const url = `./assets/characters/0001/${name}`;
    assert.deepEqual(def.animations[key].frames, [url], `${key} is ${name}`);
    assert.ok(paths.includes(url), `${url} is preloaded`);
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + name), `no root copy of ${name}`);
    assert.equal(pngSize(ROOT + url.slice(2))[1], height, `${name} is ${height} px tall`);
  }
  // Only the files the repository really has: nothing invented.
  const dir = readdirSync(ROOT + 'assets/characters/0001/').filter((n) => /shield|block/.test(n)).sort();
  assert.ok(!dir.some((n) => /block/.test(n)), 'nothing named block');
  assert.deepEqual(dir, Object.values(SHIELD_FILES).map(([n]) => n).sort());
  assert.deepEqual(readdirSync(ROOT).filter((n) => /^0001_.*\.png$/i.test(n)), []);
});

test('Shield clips are single held frames at 1x, sized against idle\'s 63 art pixels, with no fallback', () => {
  for (const [key, [, height]] of Object.entries(SHIELD_FILES)) {
    const clip = def.animations[key];
    assert.equal(clip.frames.length, 1, `${key}: one frame, no invented in-betweens`);
    assert.equal(clip.fps, SHIELD_FPS, key);
    assert.equal(clip.loop, false, key);
    assert.equal(clip.heightRatio, height / 63, `${key}: one art pixel per file pixel`);
    assert.equal(clip.sourceFacing, undefined, `${key} faces right like the rest of #0001`);
    assert.equal(def.animationFallbacks[key], undefined, `${key} never borrows other art`);
  }
  // No raise or lower pose (none was supplied), and nothing for the air,
  // where there is no Shield.
  for (const key of ['prepshield', 'releaseshield', 'midair_prepshield', 'midair_releaseshield']) {
    assert.equal(def.animations[key], undefined, key);
  }
});

test('Dodge is gone: no Dodge clip, frame, move or fighter state is registered', () => {
  for (const key of Object.keys(def.animations)) assert.doesNotMatch(key, /dodge/i, key);
  for (const url of characterFramePaths(def)) assert.doesNotMatch(url, /dodge/i, url);
  assert.doesNotMatch(JSON.stringify(def.defense), /dodge|invulnerable|startup|recovery/i);
  const { fighter, step } = makeFighter();
  for (const key of ['defenseAction', 'defensePhase', 'invulnerable', 'blocking', 'blockDamageScale']) {
    assert.equal(key in fighter.combat, false, `no combat.${key}`);
  }
  assert.equal(typeof fighter.tryDefense, 'undefined');
  const seen = new Set();
  step(SHIELD);
  for (let i = 0; i < 30; i++) seen.add(step(HOLD).state);
  for (let i = 0; i < 30; i++) seen.add(step().state);
  assert.ok(!seen.has('defense') && !seen.has('block'), [...seen].join());
});

test('SpriteSet.build keeps every Shield clip right-facing', (t) => {
  t.mock.method(console, 'warn', () => {});
  const set = SpriteSet.build(def, () => ({ naturalWidth: 64, naturalHeight: 128 }));
  for (const key of Object.keys(SHIELD_FILES)) assert.equal(set.animations[key].sourceFacing, 1, key);
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ facing });
    step(SHIELD);
    assert.equal(fighter.animator.anim.key, 'shielding');
    assert.equal(fighter.spriteFlip, facing === -1, 'mirrored only when facing left, like idle');
  }
});

// ---- Character data -----------------------------------------------------------

test('#0001 defends with a Shield: typed data, no Dodge fields, no chip-damage stat', () => {
  assert.deepEqual(def.defense, {
    type: 'shield',
    groundAnimation: 'shielding',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
    stall: 0.25,
  });
  const { fighter } = makeFighter();
  assert.equal(fighter.defense.type, 'shield');
  assert.ok(Object.isFrozen(fighter.defense));
  assert.equal(def.stats?.blockDamageScale, undefined);
  assert.equal(fighter.energyDef.shieldHitCost, COST);
  assert.equal('shieldHitCost' in def.energy, false, 'never a fighter\'s own');
  assert.equal('blockDrain' in def.energy, false, 'no drain while held');
  assert.equal('dodgeCost' in def.energy, false);
  // Generic: typed, so a future fighter may defend another way; none at all
  // is fine; an unknown type is refused.
  assert.equal(createDefenseDefinition(undefined), null);
  assert.equal(createDefenseDefinition({ type: 'shield' }).groundAnimation, null);
  assert.equal(createDefenseDefinition({ type: 'shield' }).stall, 0, 'no stall unless authored');
  // No Shield in the air: its fields are gone, and naming one is refused.
  for (const field of ['airAnimation', 'slowFallSpeed', 'slowFallBrake']) {
    assert.equal(field in createDefenseDefinition({ type: 'shield' }), false, field);
    assert.throws(() => createDefenseDefinition({ type: 'shield', [field]: null }), /no Shield in the air/, field);
  }
  assert.throws(() => createDefenseDefinition({ ...def.defense, airAnimation: 'shielding' }), /airAnimation/);
  assert.throws(() => createDefenseDefinition({ type: 'dodge' }), /Unknown defense type/);
  assert.throws(() => createDefenseDefinition({ type: 'block' }), /Unknown defense type/);
  const none = makeFighter({ character: { ...def, defense: undefined } });
  assert.equal(none.fighter.defense, null);
  none.step(SHIELD);
  assert.equal(none.fighter.combat.shielding, false);
  assert.equal(none.fighter.state, 'idle');
});

test('the Shield is a held-state control (its `defense`), never an attack or combat action', () => {
  assert.ok(!COMBAT_ACTIONS.includes('shield'));
  assert.equal(def.actions.shield, undefined);
  for (const id of Object.keys(def.attacks)) assert.doesNotMatch(id, /shield|dodge/i);
  const { fighter, step } = makeFighter();
  step(SHIELD);
  for (let i = 0; i < 20; i++) step(HOLD);
  assert.equal(fighter.combat.attack, null, 'no attack, hitbox or hasHit');
  assert.equal(fighter.combat.cooldowns.size, 0, 'no cooldown entry');
  assert.equal(fighter.combat.abilityCooldowns.size, 0);
});

// ---- Input ---------------------------------------------------------------------

test('the shared input is shield on L; no block, dodge or defense action', () => {
  assert.ok(ACTIONS.includes('shield'));
  for (const name of ['block', 'dodge', 'defense']) assert.ok(!ACTIONS.includes(name), `no ${name} action`);
  assert.deepEqual(CONFIG.bindings.shield, ['KeyL']);
  assert.equal(CONFIG.bindings.defense, undefined, 'no alias for the retired name');
  assert.equal(ACTION_LABELS.shield, 'Shield');
  assert.deepEqual(ACTIONS, [
    'runLeft', 'runRight', 'down', 'jump', 'extra_attack', 'shield',
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'pause',
  ]);
});

test('InputManager exposes shield / shieldPressed from L and the controller\'s L1 / LB; other pad buttons are not the Shield', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code) => listeners[type]({ code, repeat: false, preventDefault() {} });

  const frame = input.sample();
  assert.ok('shield' in frame && 'shieldPressed' in frame);
  assert.ok(!('block' in frame) && !('defense' in frame) && !('defensePressed' in frame));

  key('keydown', 'KeyL');
  let f = input.sample();
  assert.equal(f.shield, true);
  assert.equal(f.shieldPressed, true);
  f = input.sample();
  assert.equal(f.shield, true, 'held');
  assert.equal(f.shieldPressed, false, 'one press edge per press');
  key('keyup', 'KeyL');
  assert.equal(input.sample().shield, false);

  // A controller: L1 / LB, held, is the Shield (the universal default),
  // one press edge per press; Circle / B, RB / RT and every other default
  // button are not.
  const { controllerRig } = await import('../helpers/fake-gamepad.mjs');
  const rig = await controllerRig();
  rig.press('l1');
  f = rig.sample();
  assert.equal(f.shield, true, 'L1 / LB');
  assert.equal(f.shieldPressed, true);
  f = rig.sample();
  assert.equal(f.shield, true, 'held');
  assert.equal(f.shieldPressed, false, 'one press edge per press');
  rig.press('l1', false);
  assert.equal(rig.sample().shield, false);
  for (const [button, action] of [['south', 'jump'], ['r1', null], ['r2', null], ['east', null], ['north', null]]) {
    rig.press(button);
    f = rig.sample();
    if (action) assert.equal(f[action], true, `${button} -> ${action}`);
    assert.equal(f.shield, false, `${button} is not Shield`);
    rig.press(button, false);
    rig.sample();
  }
});

// ---- Ground Shield ----------------------------------------------------------------

test('Shield held on the ground goes up at once, holding shielding; with a raise pose it opens on it', () => {
  // #0001: no raise pose, straight into the held guard.
  const own = makeFighter();
  own.step(SHIELD);
  assert.equal(own.fighter.combat.shielding, true, 'up on the press step');
  assert.equal(own.fighter.state, 'shield');
  assert.equal(frameName(own.fighter), '0001_shielding_1.png');
  // A Shield with a raise pose shows it for one frame first.
  const { fighter, step } = raising();
  step(SHIELD);
  assert.equal(fighter.combat.shielding, true, 'up on the press step');
  assert.equal(fighter.state, 'shield');
  assert.equal(fighter.animator.anim.key, 'prepshield');
  const frames = [frameName(fighter)];
  for (let i = 0; i < steps(2); i++) {
    step(HOLD);
    assert.equal(fighter.combat.shielding, true);
    assert.equal(fighter.state, 'shield');
    frames.push(frameName(fighter));
  }
  assert.equal(frames.filter((n) => n === 'test_prepshield_1.png').length, POSE, 'the raise pose for one frame');
  assert.deepEqual([...new Set(frames)], ['test_prepshield_1.png', '0001_shielding_1.png']);
  assert.equal(frames.at(-1), '0001_shielding_1.png', 'held for as long as Shield is');
  // Held without a fresh press it still goes up (a held input, not a tap).
  const held = makeFighter();
  held.step(HOLD);
  assert.equal(held.fighter.combat.shielding, true);
});

test('releasing Shield lowers the Shield at once: straight to idle, or the lower pose for one frame first', () => {
  // #0001: no lower pose.
  const own = makeFighter();
  own.step(SHIELD);
  for (let i = 0; i < 20; i++) own.step(HOLD);
  own.step();
  assert.equal(own.fighter.combat.shielding, false);
  assert.equal(own.fighter.state, 'idle');
  // A Shield with a lower pose shows it for one frame.
  const { fighter, step } = raising();
  step(SHIELD);
  for (let i = 0; i < 20; i++) step(HOLD);
  const frames = [];
  step();
  assert.equal(fighter.combat.shielding, false, 'down on the release step');
  while (fighter.state === 'shieldRelease') {
    frames.push(frameName(fighter));
    step();
  }
  assert.deepEqual([...new Set(frames)], ['test_releaseshield_1.png']);
  assert.equal(frames.length, POSE, 'the lower pose for one frame');
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle_1.png');
  // Moving straight away still works: the pose is visual only.
  const quick = makeFighter();
  quick.step(SHIELD);
  for (let i = 0; i < 10; i++) quick.step(HOLD);
  const x = quick.fighter.body.x;
  for (let i = 0; i < 10; i++) quick.step(RIGHT);
  assert.ok(quick.fighter.body.x > x);
});

test('holding the Shield costs nothing: 3 s held at full stays at 100, and a low bar keeps refilling', () => {
  const { fighter, step } = makeFighter();
  step(SHIELD);
  for (let i = 0; i < steps(3); i++) {
    step(HOLD);
    assert.equal(fighter.combat.energy, 100);
  }
  assert.equal(fighter.combat.shielding, true);
  const low = makeFighter();
  low.fighter.combat.setEnergy(60);
  low.step(SHIELD);
  for (let i = 0; i < steps(1) - 1; i++) low.step(HOLD);
  assert.ok(Math.abs(low.fighter.combat.energy - (60 + REGEN)) < 1e-6, `regen carries on while held (${low.fighter.combat.energy})`);
  assert.equal(low.fighter.combat.shielding, true);
});

// ---- The Shield holds still ------------------------------------------------------
// A raised ground Shield plants its fighter: no direction held walks or
// runs it, on any device or for the CPU, and it only turns. Raised at a run
// it stops the run on its very step; let go, the run starts again from
// rest. What other mechanics do to the body (a block's push, a pull, a
// moving platform) still happens to it.

const LEFT = { runLeft: true };
const BOTH = { runLeft: true, runRight: true };

// The Battle and the maps, loaded once a canvas Path2D stand-in is there.
async function battleModules() {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const [{ Battle }, { getMap }] = await Promise.all([import('../../js/game/battle.js'), import('../../js/data/maps.js')]);
  return { Battle, getMap };
}

// Steps harness `h` ({ fighter, step }) `n` times with `held`, the Shield
// up throughout, asserting the fighter neither moves nor gains a speed on
// any of them (on static ground).
function holdsStill(h, held, n, what) {
  const { fighter, step } = h;
  const x = fighter.body.x;
  for (let i = 0; i < n; i++) {
    step(held);
    assert.equal(fighter.combat.shielding, true, `${what}: still up (step ${i})`);
    assert.equal(fighter.body.vx, 0, `${what}: no speed (step ${i})`);
    assert.equal(fighter.body.x, x, `${what}: not a unit moved (step ${i})`);
  }
}

test('A: raised standing, the Shield holds its fighter still: Left or Right held for seconds walks it nowhere, and only turns it', () => {
  const h = makeFighter();
  h.step(SHIELD);
  assert.equal(h.fighter.combat.shielding, true);
  holdsStill(h, { ...HOLD, ...RIGHT }, steps(2), 'Right held');
  assert.equal(h.fighter.facing, 1);
  holdsStill(h, { ...HOLD, ...LEFT }, steps(2), 'Left held');
  assert.equal(h.fighter.facing, -1, 'turned to face it, where it stands');
  holdsStill(h, { ...HOLD, ...BOTH }, 30, 'both held');
  // Its held Shield pose throughout: no run and no walk of its own.
  assert.equal(h.fighter.state, 'shield');
  assert.equal(h.fighter.animator.anim.key, def.defense.groundAnimation);
  assert.equal(h.fighter.moveDir, 0, 'no locomotion asked of the run');
  // Nothing is left to walk with: no walking speed, no walking state.
  assert.equal('shieldWalkSpeed' in BASE_FIGHTER_MOVEMENT, false);
  assert.equal(Object.keys(BASE_FIGHTER_MOVEMENT).some((k) => /shield/i.test(k)), false, 'no Shield movement value at all');
  assert.equal('shieldWalking' in h.fighter, false);
});

test('B: raised at a run, the Shield stops the run on its very step, never a slide; the run still held walks it nowhere', () => {
  const h = makeFighter();
  stepUntil(h.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  const x = h.fighter.body.x;
  h.step({ ...SHIELD, ...RIGHT });
  assert.equal(h.fighter.combat.shielding, true, 'up on the press step');
  assert.equal(h.fighter.body.vx, 0, 'stopped on that very step');
  assert.equal(h.fighter.body.x, x, 'not a unit on from where it went up');
  assert.equal(h.fighter.state, 'shield');
  holdsStill(h, { ...HOLD, ...RIGHT }, steps(1), 'the run held on');
  // Running left, the direction held since long before the press: the same.
  const back = makeFighter({ x: 900, facing: -1 });
  for (let i = 0; i < 30; i++) back.step(LEFT);
  assert.equal(back.fighter.body.vx, -MOVEMENT.maxSpeed);
  back.step({ ...SHIELD, ...LEFT });
  assert.equal(back.fighter.body.vx, 0);
  holdsStill(back, { ...HOLD, ...LEFT }, 30, 'the leftward run held on');
  // A Dash's burst, above top speed: the Shield held through the Dash goes
  // up the step it ends, and the burst stops there.
  const dash = makeFighter();
  dash.step({ ...RIGHT, mouvementRightPressed: true });
  assert.ok(dash.fighter.dash, 'dashing');
  let burst = 0;
  while (dash.fighter.dash) {
    burst = dash.fighter.body.vx;
    dash.step({ ...HOLD, ...RIGHT });
  }
  assert.ok(burst > MOVEMENT.maxSpeed, `a burst (${burst})`);
  assert.equal(dash.fighter.combat.shielding, true, 'up the step the Dash ended');
  assert.equal(dash.fighter.body.vx, 0, 'the burst stopped');
  holdsStill(dash, { ...HOLD, ...RIGHT }, 20, 'after the Dash');
});

test('B: a Shield press that raises nothing stops nothing: stunned, exhausted, mid-Dash or without its art, the speed goes on', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const run = (h) => stepUntil(h.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
    const noArt = fakeSprites(Object.keys(def.animations).filter((k) => !/shield/i.test(k)));
    const cases = [
      ['stunned', {}, (h) => { run(h); h.fighter.combat.stun = 0.3; }],
      ['exhausted', {}, (h) => { run(h); h.fighter.combat.setEnergy(0); }],
      ['mid-Dash', {}, (h) => { h.step({ ...RIGHT, mouvementRightPressed: true }); h.step(RIGHT); }],
      ['without its art', { sprites: noArt }, run],
    ];
    for (const [what, opts, setup] of cases) {
      // Twice, on the same inputs but for the Shield: the same speed and
      // place on every step.
      const shielded = makeFighter(opts);
      const plain = makeFighter(opts);
      setup(shielded);
      setup(plain);
      for (let i = 0; i < 4; i++) {
        shielded.step(i === 0 ? SHIELD : HOLD);
        plain.step();
        assert.equal(shielded.fighter.combat.shielding, false, `${what}: no Shield`);
        assert.equal(shielded.fighter.body.vx, plain.fighter.body.vx, `${what}: the speed it had (step ${i})`);
        assert.equal(shielded.fighter.body.x, plain.fighter.body.x, `${what}: where it would be`);
      }
      assert.ok(plain.fighter.body.vx > 0, `${what}: still moving`);
    }
  } finally {
    console.warn = warn;
  }
});

test('B: speed an outside force gave it is not stopped: a pull\'s drag runs down behind the Shield it raises', () => {
  // Drawn in by a pull (the drag pullToward sets), then the Shield raised:
  // the drag is the pull's, not the fighter's own, so it runs down under
  // the normal deceleration; the pull draws it no further.
  const pulled = makeFighter({ x: 600, facing: -1 });
  const owner = makeFighter({ x: 300 });
  pulled.fighter.opponent = owner.fighter;
  owner.fighter.opponent = pulled.fighter;
  pulled.step();
  const pull = { radius: 600, speed: 360, offset: { x: 0, y: 0 } };
  const shot = { alive: true, owner: owner.fighter, x: 400, y: pulled.fighter.body.y - 40, direction: 1, def: { pull } };
  applyPulls([owner.fighter, pulled.fighter], [shot], DT);
  assert.equal(pulled.fighter.body.vx, -pull.speed, 'dragged');
  pulled.step({ ...SHIELD, ...RIGHT });
  assert.equal(pulled.fighter.combat.shielding, true);
  assert.equal(pulled.fighter.body.vx, -pull.speed + MOVEMENT.deceleration * DT, 'running down, not stopped dead');
  applyPulls([owner.fighter, pulled.fighter], [shot], DT);
  assert.equal(pulled.fighter.body.vx, -pull.speed + MOVEMENT.deceleration * DT, 'a raised Shield is drawn no further');
  let n = 0;
  while (pulled.fighter.body.vx !== 0 && n++ < 30) pulled.step({ ...HOLD, ...RIGHT });
  assert.ok(n < 10, 'soon at rest');
  holdsStill(pulled, { ...HOLD, ...RIGHT }, 20, 'once the drag is spent');
});

test('C: directions changed again and again behind the Shield never move it; each only turns it, and no Dash starts', () => {
  const h = makeFighter();
  h.step(SHIELD);
  const x = h.fighter.body.x;
  const taps = [RIGHT, LEFT, {}, LEFT, RIGHT, BOTH, RIGHT, {}, LEFT, LEFT, RIGHT, BOTH, {}];
  for (let round = 0; round < 12; round++) {
    for (const [i, dir] of taps.entries()) {
      const prev = taps[i - 1] ?? {};
      // Fresh presses too (the run's own press edges), as a player mashing
      // the directions makes them.
      const edges = { runLeftPressed: !!dir.runLeft && !prev.runLeft, runRightPressed: !!dir.runRight && !prev.runRight };
      const facing = h.fighter.facing;
      h.step({ ...HOLD, ...dir, ...edges });
      assert.equal(h.fighter.combat.shielding, true, 'turning never drops it');
      assert.equal(h.fighter.body.vx, 0, `round ${round}, step ${i}: no speed`);
      assert.equal(h.fighter.body.x, x, `round ${round}, step ${i}: not a unit moved`);
      const want = (dir.runRight ? 1 : 0) - (dir.runLeft ? 1 : 0);
      assert.equal(h.fighter.facing, want || facing, 'faces the way held; with none (or both), the way it did');
    }
  }
  // No Dash behind it either: one asked for starts nothing and costs nothing.
  h.step({ ...HOLD, ...RIGHT, mouvementRightPressed: true });
  h.step({ ...HOLD, ...LEFT, mouvementLeftPressed: true });
  assert.equal(h.fighter.dash, null);
  assert.equal(h.fighter.combat.energy, 100);
  assert.equal(h.fighter.body.x, x);
});

test('D: let go with the direction still held, it runs again from rest, exactly as a run from a standstill does', () => {
  const h = makeFighter();
  h.step({ ...SHIELD, ...RIGHT });
  holdsStill(h, { ...HOLD, ...RIGHT }, 20, 'held');
  const plain = makeFighter();
  const x = h.fighter.body.x;
  const px = plain.fighter.body.x;
  for (let i = 0; i < 20; i++) {
    h.step(RIGHT);
    plain.step(RIGHT);
    assert.equal(h.fighter.combat.shielding, false, 'down from the release step');
    assert.equal(h.fighter.body.vx, plain.fighter.body.vx, `step ${i}: the run's own acceleration`);
    assert.equal(h.fighter.body.x - x, plain.fighter.body.x - px);
  }
  assert.equal(h.fighter.body.vx, MOVEMENT.maxSpeed, 'up to the full run');
  assert.equal(h.fighter.state, 'run');
});

test('E: Jump jumps straight out of the Shield: it drops, no walk goes up with it, and the air steers as ever', () => {
  const h = makeFighter();
  stepUntil(h.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  h.step({ ...SHIELD, ...RIGHT });
  holdsStill(h, { ...HOLD, ...RIGHT }, 20, 'Right held');
  const x = h.fighter.body.x;
  // Beside it, the same jump from a standstill with nothing held.
  const plain = makeFighter({ x });
  h.step({ ...HOLD, ...RIGHT, ...JUMP });
  plain.step(JUMP);
  assert.equal(h.fighter.grounded, false, 'jumped out of it');
  assert.equal(h.fighter.combat.shielding, false, 'the Shield dropped');
  assert.ok(h.fighter.body.vy < 0);
  assert.equal(h.fighter.body.vy, plain.fighter.body.vy, 'the normal jump');
  assert.equal(h.fighter.body.vx, 0, 'straight up: nothing carried from behind the Shield');
  assert.equal(h.fighter.body.x, x);
  // From there the air steers it exactly as it steers that jump; the
  // Shield still held does nothing there (no Shield in the air, and no
  // Deflect without a fresh press).
  for (let i = 0; i < 15; i++) {
    h.step({ ...HOLD, ...RIGHT });
    plain.step(RIGHT);
    assert.equal(h.fighter.combat.shielding, false);
    assert.equal(h.fighter.combat.attack, null, 'no Deflect');
    assert.equal(h.fighter.body.vx, plain.fighter.body.vx, `step ${i}: the air's own steering`);
    assert.equal(h.fighter.body.x, plain.fighter.body.x);
    assert.equal(h.fighter.body.y, plain.fighter.body.y);
  }
  assert.ok(h.fighter.body.vx > 0, 'steering on');
});

test('F: in blockstun the Shield holds still and a jump waits in its buffer; once the stun is over it still walks nowhere', () => {
  // A block in play first: the stun holds it up, no walk, no jump.
  const d = duel();
  raiseShield(d);
  assert.equal(def.attacks.attack1.blockPush ?? 0, 0, 'a blow with no push: nothing else moves it');
  const x = d.target.body.x;
  const [event] = blockedAttack(d, ATTACK1, { ...HOLD, ...LEFT });
  assert.equal(event.type, 'block');
  assert.ok(d.target.combat.shieldStun > 0, 'blocked: in blockstun');
  let n = 0;
  while ((d.target.combat.shieldStun > 0 || d.target.combat.hitstop > 0) && n++ < 120) {
    d.tick({}, { ...HOLD, ...(n % 6 < 3 ? LEFT : RIGHT) });
    assert.equal(d.target.body.vx, 0);
    assert.equal(d.target.body.x, x, 'still in blockstun');
  }
  for (let i = 0; i < 30; i++) {
    d.tick({}, { ...HOLD, ...RIGHT });
    assert.equal(d.target.combat.shielding, true);
    assert.equal(d.target.body.x, x, 'still once the stun is over');
  }

  // A long blockstun (a bespoke blow): a Jump pressed early is gone by the
  // time it ends; one pressed within the jump buffer of its end jumps the
  // first step it is over, never before.
  const block = probeHit({ id: 'testBlock', damage: 0, hitstun: 0.2, blockstun: 0.5, hitstop: 0 });
  for (const late of [false, true]) {
    const t = makeFighter({ x: 540, facing: -1 });
    const a = makeFighter({ x: 500 });
    t.fighter.opponent = a.fighter;
    a.fighter.opponent = t.fighter;
    t.step(SHIELD);
    for (let i = 0; i < steps(def.defense.perfectWindow) + 2; i++) t.step(HOLD);
    assert.equal(new CombatSystem().applyHit(a.fighter, t.fighter, block, { facing: 1 }).type, 'block');
    const tx = t.fighter.body.x;
    let pressed = false;
    let stunned = 0;
    for (let i = 0; i < 60 && t.fighter.grounded; i++) {
      const press = !pressed && (late ? t.fighter.combat.shieldStun <= MOVEMENT.jumpBuffer - 2 * DT : true);
      pressed ||= press;
      t.step({ ...HOLD, ...(i % 4 < 2 ? RIGHT : LEFT), ...(press ? JUMP : {}) });
      if (t.fighter.combat.shieldStun > 0) {
        stunned++;
        assert.equal(t.fighter.grounded, true, 'no jump out of blockstun');
        assert.equal(t.fighter.body.x, tx, 'no walk in blockstun');
      }
    }
    assert.ok(stunned > steps(0.4), 'held through the stun');
    if (late) {
      assert.equal(t.fighter.grounded, false, 'the press waited in the buffer and jumped as the stun ended');
      assert.equal(t.fighter.body.vx, 0, 'straight up');
    } else {
      assert.equal(t.fighter.grounded, true, 'an early press is gone: no jump');
      assert.equal(t.fighter.combat.shielding, true);
      assert.equal(t.fighter.body.x, tx, 'and no walk after the stun');
    }
  }
});

test('G: a block\'s push still shoves the Shield and runs down under the normal deceleration; a direction held adds nothing', () => {
  // #0003's Chakra Punch shoves a Shield it meets (`blockPush`).
  const C3 = getCharacter('0003');
  const push = C3.attacks.attack1.blockPush;
  assert.ok(push > 0 && push < MOVEMENT.maxSpeed, `a push (${push})`);
  const shove = (held) => {
    const d = duel({ attackerCharacter: C3, attackerSprites: fakeSpritesOf(C3) });
    raiseShield(d);
    const x0 = d.target.body.x;
    const [event] = blockedAttack(d, ATTACK1, { ...HOLD, ...held });
    assert.equal(event.type, 'block', 'blocked');
    assert.equal(d.target.combat.launchPoint, 0);
    assert.equal(d.target.body.vx, push, 'shoved away from the blow at its push');
    const log = [];
    let slowed = 0;
    for (let i = 0; i < 40; i++) {
      const vx = d.target.body.vx;
      d.tick({}, { ...HOLD, ...held });
      assert.equal(d.target.combat.shielding, true);
      // Frozen in the impact it keeps its speed; after, it slows by the
      // ground's deceleration a step, whatever is held.
      const v = d.target.body.vx;
      const slow = Math.max(0, vx - MOVEMENT.deceleration * DT);
      assert.ok(v === vx || Math.abs(v - slow) < 1e-9, `step ${i}: ${vx} → ${v}`);
      if (v < vx) slowed++;
      log.push([d.target.body.x, v]);
    }
    assert.equal(slowed, Math.ceil(push / (MOVEMENT.deceleration * DT)), 'slowed step by step until spent');
    assert.equal(d.target.body.vx, 0, 'the push spent');
    assert.ok(d.target.body.x - x0 > 10, `shoved back ${d.target.body.x - x0} units`);
    return log;
  };
  const still = shove({});
  // Held toward the blow or away from it: the very same push, step for step.
  assert.deepEqual(shove(LEFT), still);
  assert.deepEqual(shove(RIGHT), still);
});

test('H: on a moving cloud the Shield rides it as anyone does, and a direction held walks it nowhere along it', async () => {
  const { getMap } = await battleModules();
  const { PlatformHazards } = await import('../../js/game/platform-hazards.js');
  const { HAZARD_STATES: S } = await import('../../js/data/platform-hazards.js');
  const stage = new StageCollision(getMap('asperitas'));
  const hazards = new PlatformHazards(stage, { seed: 1 });
  // Every cloud held still, then the left one sent drifting right.
  for (const c of hazards.controllers) Object.assign(c, { state: S.idle, time: 0, duration: 60 });
  const cloud = hazards.get('asperitas-cloud-left');
  const p = cloud.platform;
  const h = makeFighter({ stage, x: p.x + p.w / 2, y: p.y - 0.5 });
  assert.equal(h.fighter.body.ground, p);
  const tick = (held) => {
    hazards.update(DT, [h.fighter]);
    return h.step(held);
  };
  tick(SHIELD);
  Object.assign(cloud, { state: S.horizontal, from: { x: p.x, y: p.y }, to: { x: p.x + 120, y: p.y }, time: 0, duration: 2 });
  const gap = h.fighter.body.x - p.x;
  for (let i = 0; i < 100; i++) {
    tick({ ...HOLD, ...(i % 40 < 20 ? LEFT : RIGHT) });
    assert.equal(h.fighter.combat.shielding, true);
    assert.equal(h.fighter.body.ground, p, 'on the cloud');
    assert.equal(h.fighter.body.y, p.y);
    assert.equal(h.fighter.body.vx, 0, 'no walking of its own');
    assert.ok(Math.abs(h.fighter.body.x - p.x - gap) < 1e-6, `step ${i}: carried exactly, not a unit along it`);
  }
  assert.ok(p.x > cloud.from.x + 60, 'the cloud really moved, the fighter with it');
  // Let go: it runs along the cloud as ever.
  for (let i = 0; i < 10; i++) tick(RIGHT);
  assert.ok(h.fighter.body.x - p.x > gap + 20, 'runs along it again');
});

// Every playable fighter whose `defense` is a ground Shield with its art.
const SHIELDED = playableCharacters().filter((c) => c.defense?.type === 'shield' && c.defense.groundAnimation);

test('I: the whole roster has a ground Shield to hold still behind, #0006 (an ensemble) among them', () => {
  assert.ok(SHIELDED.length >= 6, SHIELDED.map((c) => c.id).join(', '));
  assert.ok(SHIELDED.some((c) => c.id === '0006' && c.ensemble));
});

for (const c of SHIELDED) {
  test(`I: #${c.id}: raised at a run it stops dead, and holds still whatever is held, in its own held Shield pose`, () => {
    const h = makeFighter({ character: c, sprites: fakeSpritesOf(c) });
    stepUntil(h.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
    const x = h.fighter.body.x;
    h.step({ ...SHIELD, ...RIGHT });
    assert.equal(h.fighter.combat.shielding, true);
    assert.equal(h.fighter.body.vx, 0, 'stopped on the press step');
    assert.equal(h.fighter.body.x, x);
    holdsStill(h, { ...HOLD, ...RIGHT }, 30, 'Right held');
    holdsStill(h, { ...HOLD, ...LEFT }, 30, 'Left held');
    assert.equal(h.fighter.facing, -1, 'turned');
    assert.equal(h.fighter.animator.anim.key, c.defense.groundAnimation);
    if (!c.ensemble) return;
    // An ensemble: every member in its own held Shield pose, gathered round
    // the one planted body, and the group settles there, drawn still.
    const members = h.fighter.animator.members;
    assert.ok(members.length > 1);
    for (const m of members) assert.equal(m.animator.anim?.key, c.defense.groundAnimation, `${m.id} holds its Shield`);
    const drawn = () => {
      h.fighter.interpolate(1);
      return fighterParts(h.fighter).map((part) => [part.x, part.y]);
    };
    for (let i = 0; i < 60; i++) h.step({ ...HOLD, ...LEFT });
    const settled = drawn();
    for (let i = 0; i < 30; i++) {
      h.step({ ...HOLD, ...(i % 10 < 5 ? LEFT : BOTH) });
      assert.deepEqual(drawn(), settled, `step ${i}: the group drawn where it stands`);
    }
    assert.equal(h.fighter.body.x, x);
  });
}

test('J: the CPU\'s inputs obey the same rule: its Shield held with a run held walks it nowhere', async () => {
  const { Executor } = await import('../../js/game/ai/cpu-intelligence/executor.js');
  const ex = new Executor();
  const h = makeFighter();
  stepUntil(h.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  const x = h.fighter.body.x;
  for (let i = 0; i < steps(2); i++) {
    ex.begin(i * DT);
    ex.shield(h.fighter.body.grounded);
    ex.dir(i % 40 < 20 ? 1 : -1);
    const out = ex.finish(h.fighter, STAGE);
    assert.ok(out.shield && (out.runLeft || out.runRight), 'its snapshot holds the Shield and a run');
    h.step({ ...out });
    assert.equal(h.fighter.combat.shielding, true);
    assert.equal(h.fighter.body.vx, 0, `step ${i}: no speed`);
    assert.equal(h.fighter.body.x, x, `step ${i}: not a unit moved`);
  }
  // Let go of the Shield: its run moves it again.
  ex.begin(steps(2) * DT);
  ex.dir(1);
  for (let i = 0; i < 10; i++) h.step({ ...ex.finish(h.fighter, STAGE) });
  assert.ok(h.fighter.body.x > x + 20, 'moving again');
});

test('J: CPUs fighting raise their Shields and hold still behind them, then lower them, move and attack again: never stuck', async () => {
  const { Battle, getMap } = await battleModules();
  let stints = 0;
  let shielders = 0;
  let movers = 0;
  for (const c of SHIELDED) {
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'watch', seed: 7, difficulty: 'hard',
      p1Def: c, p2Def: c, p1Sprites: fakeSpritesOf(c), p2Sprites: fakeSpritesOf(c),
      input: { flush() {}, sample: () => ({}) },
    });
    battle.setPhase('fight');
    const watch = new Map();
    let n = 0;
    for (const f of battle.fighters) {
      const w = { stint: 0, longest: 0, stints: 0, ends: [], acted: -1, movedAfter: false };
      watch.set(f, w);
      const update = f.update.bind(f);
      f.update = (dt, ctx) => {
        const was = f.combat.shielding;
        const vx = f.body.vx;
        const x = f.body.x;
        update(dt, ctx);
        if (f.combat.shielding && was) {
          // Behind the Shield it never speeds up of its own (a block's push
          // only runs down), whatever its CPU holds.
          assert.ok(Math.abs(f.body.vx) <= Math.abs(vx) + 1e-9, `#${c.id}: ${vx} → ${f.body.vx} behind its Shield`);
          if (vx === 0) assert.equal(f.body.x, x, `#${c.id}: still, ${f.controller.out.runLeft || f.controller.out.runRight ? 'a run held' : 'nothing held'}`);
        }
        if (f.combat.shielding) {
          w.stint += dt;
          w.longest = Math.max(w.longest, w.stint);
        } else if (was) {
          w.stints++;
          w.stint = 0;
          w.ends.push(n);
        }
        // Doing something with its Shield down: a move, a run, a jump, a
        // Dash, a technique.
        const running = f.body.grounded && Math.abs(f.body.vx) > 100;
        if (!f.combat.shielding && (f.combat.attack || f.technique || f.dash || !f.body.grounded || running)) w.acted = n;
        if (w.ends.length && !f.combat.shielding && running) w.movedAfter = true;
      };
    }
    for (; n < steps(25) && battle.phase === 'fight'; n++) battle.update(DT);
    for (const w of watch.values()) {
      stints += w.stints;
      assert.ok(w.longest < 4, `#${c.id}: never stuck behind its Shield (longest ${w.longest.toFixed(2)} s)`);
      // Every Shield it lowered with time left to act, it acted after.
      const last = w.ends.filter((e) => e < n - steps(2)).at(-1);
      if (last != null) assert.ok(w.acted > last, `#${c.id}: acts again after lowering its Shield`);
      if (w.stints) {
        shielders++;
        if (w.movedAfter) movers++;
      }
    }
  }
  assert.ok(stints >= SHIELDED.length, `the CPUs really shielded (${stints} times)`);
  // A CPU holding a spot may fight on from it, but most run again.
  assert.ok(movers > shielders / 2, `${movers} of the ${shielders} CPUs that shielded ran again after`);
});

test('L: keyboard, touch and a controller all reach the same Fighter: each holds still behind its Shield, step for step alike', async () => {
  const { controllerRig } = await import('../helpers/fake-gamepad.mjs');
  const { PlayerController } = await import('../../js/game/fighters/fighter-controller.js');
  const { Fighter } = await import('../../js/game/fighters/fighter.js');
  // Each device's way of holding (or letting go of) Right, Left and Shield.
  const devices = {
    keyboard: (rig) => {
      const key = (code, down) => rig.listeners[down ? 'keydown' : 'keyup'][0]({ code, repeat: false, preventDefault() {} });
      return { right: (d) => key('KeyD', d), left: (d) => key('KeyA', d), shield: (d) => key('KeyL', d) };
    },
    touch: (rig) => ({
      right: (d) => rig.input.setTouch('runRight', d), left: (d) => rig.input.setTouch('runLeft', d), shield: (d) => rig.input.setTouch('shield', d),
    }),
    controller: (rig) => ({
      right: (d) => rig.stick(d ? 0.9 : 0, 0), left: (d) => rig.stick(d ? -0.9 : 0, 0), shield: (d) => rig.press('l1', d),
    }),
  };
  // Run right, raise the Shield with Right still held, hold, turn to Left,
  // let go of the Shield with Left held.
  const script = [
    [20, { right: true }], [1, { shield: true }], [30, {}], [1, { right: false }], [1, { left: true }], [30, {}], [1, { shield: false }], [15, {}],
  ];
  const logs = {};
  for (const [name, make] of Object.entries(devices)) {
    const rig = await controllerRig();
    const hands = make(rig);
    const fighter = new Fighter({
      def, sprites: fakeSprites(), stage: STAGE, slot: 0, label: 'P1', controller: new PlayerController(rig.input), spawn: { x: 500, facing: 1 },
    });
    const log = [];
    for (const [n, change] of script) {
      for (const [k, d] of Object.entries(change)) hands[k](d);
      for (let i = 0; i < n; i++) {
        rig.poll();
        fighter.update(DT, SIM_CTX);
        log.push([fighter.body.x, fighter.body.vx, fighter.facing, fighter.combat.shielding]);
      }
    }
    logs[name] = log;
    // Behind the Shield (steps 20 to 82): still, whatever was held.
    const behind = log.slice(20, 83);
    assert.ok(behind.every((s) => s[3]), `${name}: the Shield up throughout`);
    assert.ok(behind.every((s) => s[0] === behind[0][0] && s[1] === 0), `${name}: not a unit moved`);
    assert.equal(log[19][1], MOVEMENT.maxSpeed, `${name}: ran first`);
    assert.equal(behind.at(-1)[2], -1, `${name}: turned`);
    assert.equal(log.at(-1)[1], -MOVEMENT.maxSpeed, `${name}: running left once it is down`);
  }
  assert.deepEqual(logs.touch, logs.keyboard, 'touch, as the keyboard');
  assert.deepEqual(logs.controller, logs.keyboard, 'a controller, as the keyboard');
});

test('M: the frame rate never changes it: at 30, 60 and 144 fps the Shield stops and holds the fighter on the same fixed steps', async () => {
  const { Battle, getMap } = await battleModules();
  // Player 1's inputs by fixed step: a run, the Shield raised at it and
  // held while the direction swaps, then let go running the other way.
  const at = (n) => {
    if (n < 30) return { runRight: true };
    if (n < 150) return { shield: true, shieldPressed: n === 30, ...((n >> 4) % 2 ? { runLeft: true } : { runRight: true }) };
    return { runLeft: true };
  };
  const paced = (fps) => {
    let n = 0;
    const input = { flush() {}, sample: () => at(n++) };
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input,
    });
    battle.p2.controller = null;
    battle.setPhase('fight');
    const log = [];
    const update = battle.update.bind(battle);
    battle.update = (dt) => {
      update(dt);
      const f = battle.p1;
      log.push([f.body.x, f.body.vx, f.facing, f.combat.shielding]);
    };
    for (let t = 0; t < 3.5; t += 1 / fps) battle.frame(1 / fps);
    return log;
  };
  const runs = [30, 60, 144].map(paced);
  const n = 200;
  for (const log of runs) assert.ok(log.length >= n, `${log.length} steps`);
  assert.deepEqual(runs[0].slice(0, n), runs[1].slice(0, n), '30 and 60 fps');
  assert.deepEqual(runs[2].slice(0, n), runs[1].slice(0, n), '144 and 60 fps');
  const log = runs[1];
  assert.ok(log[29][1] > 0, 'running');
  const behind = log.slice(30, 150);
  assert.ok(behind.every((s) => s[3] && s[1] === 0 && s[0] === log[29][0]), 'stopped on the raise step and held there');
  assert.ok(log[199][1] < 0, 'running the other way once it is down');
});

// ---- No Shield in the air --------------------------------------------------------

for (const id of ['0001', '0002']) {
  for (const [when, setup] of [
    ['rising', (step) => { step(JUMP); step(); }],
    ['falling', (step) => { step({ ...JUMP, down: true, downPressed: true }); stepUntil(step, (f) => f.body.vy > 0 && f.body.y < 700); }],
  ]) {
    test(`#${id}: Shield held while ${when} never goes up; the arc is exactly the plain one (no slow fall)`, () => {
      const character = getCharacter(id);
      const { fighter, step } = makeFighter({ character });
      const plain = makeFighter({ character });
      setup(step);
      setup(plain.step);
      for (let i = 0; i < 20 && !fighter.grounded; i++) {
        step(HOLD);
        plain.step();
        assert.equal(fighter.combat.shielding, false, `step ${i}: no Shield`);
        assert.equal(fighter.shieldAllowed(), false, `step ${i}: none allowed in the air`);
        assert.ok(['jump', 'fall'].includes(fighter.state), `step ${i}: ${fighter.state}`);
        assert.equal(fighter.combat.attack, null, `step ${i}: holding starts nothing`);
        assert.equal(fighter.body.y, plain.fighter.body.y, `step ${i}: y`);
        assert.equal(fighter.body.vy, plain.fighter.body.vy, `step ${i}: vy`);
      }
      assert.equal(fighter.combat.energy, 100, 'nothing paid');
    });
  }
}

test('Shield held through a landing goes up on the ground, opening on its raise pose', () => {
  const { fighter, step } = raising();
  step(JUMP);
  step();
  const states = [];
  const frames = [];
  while (!fighter.grounded) {
    step(HOLD);
    states.push(fighter.state);
  }
  assert.ok(!states.includes('shield'), 'never up in the air');
  for (let i = 0; i < 10; i++) {
    step(HOLD);
    states.push(fighter.state);
    frames.push(frameName(fighter));
  }
  assert.equal(fighter.combat.shielding, true, 'up on the ground');
  assert.equal(states.at(-1), 'shield');
  assert.ok(frames.includes('test_prepshield_1.png'), 'raised on the ground: its raise pose');
  assert.equal(frames.at(-1), '0001_shielding_1.png');
});

// ---- Priority --------------------------------------------------------------------

test('Shield held wins over a new attack; an attack already playing is never cut short', () => {
  for (const press of [ATTACK1, ATTACK2, { extra_attack: true, extra_attackPressed: true }]) {
    const { fighter, step } = makeFighter();
    step({ ...press, ...SHIELD });
    assert.equal(fighter.combat.attack, null, 'no attack while Shield is held');
    assert.equal(fighter.combat.shielding, true);
    step({ ...press, ...HOLD });
    assert.equal(fighter.combat.attack, null, 'nor pressed while shielding');
    assert.equal(fighter.combat.shielding, true);
    // Let go of Shield first: then the attack starts.
    step(press);
    assert.ok(fighter.combat.attack, 'the attack after the release');
    assert.equal(fighter.combat.shielding, false);
  }
  // An attack in progress plays out; the Shield only rises once it ends.
  const { fighter, step } = makeFighter();
  step(ATTACK2);
  const total = fighter.combat.attack.def.total;
  for (let i = 1; i < steps(total); i++) {
    step(HOLD);
    assert.equal(fighter.combat.attack?.def.id, 'attack2', 'unchanged');
    assert.equal(fighter.combat.shielding, false, 'never both');
  }
  step(HOLD);
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.combat.shielding, true, 'up the step the attack ends');
});

test('no Shield while stunned, paralyzed or performing a technique', () => {
  const stunned = makeFighter();
  stunned.fighter.combat.stun = 0.2;
  stunned.step(SHIELD);
  assert.equal(stunned.fighter.combat.shielding, false);
  assert.equal(stunned.fighter.state, 'hitstun');
  stepUntil(stunned.step, (f) => f.combat.stun <= 0, HOLD);
  assert.equal(stunned.fighter.combat.shielding, true, 'held Shield raises it once the stun is over');

  const held = makeFighter();
  held.fighter.combat.paralyze(10 * DT);
  for (let i = 0; i < 9; i++) held.step(SHIELD);
  assert.equal(held.fighter.combat.shielding, false);
  assert.equal(held.fighter.state, 'bound');
  held.step(HOLD);
  held.step(HOLD);
  assert.equal(held.fighter.combat.shielding, true, 'held Shield raises it once the paralysis is over');

  const cast = makeFighter();
  for (let i = 0; i < 10; i++) cast.step({});
  cast.step({ attack4: true, attack4Pressed: true });
  assert.ok(cast.fighter.technique);
  cast.step(HOLD);
  assert.equal(cast.fighter.combat.shielding, false);
  assert.ok(cast.fighter.technique, 'the technique goes on');
});

// ---- Blocking (real hitboxes via CombatSystem) ------------------------------------

test('each blocked hit costs exactly 15: 100 -> 85 -> 70 -> 55 -> 40 -> 25 -> 10 -> 0, and the last still blocks', () => {
  assert.equal(COST, 15);
  const d = duel({ targetCharacter: NO_REGEN });
  raiseShield(d);
  const trail = [];
  const x0 = d.attacker.body.x;
  for (const expected of [85, 70, 55, 40, 25, 10, 0]) {
    // Each Jab steps in a little (the shared Step-in): back to the same
    // spacing for every one (this duel has no pushboxes to stop it).
    d.attacker.body.x = x0;
    const [event, ...rest] = blockedAttack(d);
    assert.deepEqual(rest, [], 'one event per attack');
    assert.equal(event.type, 'block');
    assert.equal(event.move, 'attack1');
    assert.equal(event.damage, 0, 'no Launch Point');
    assert.equal(event.energyCost, expected ? COST : 10, 'its cost, or the last 10 it had');
    assert.equal(event.launchStrength, 0);
    assert.deepEqual({ ...event.finalLaunch }, { x: 0, y: 0 });
    assert.equal(d.target.combat.energy, expected);
    assert.equal(d.target.combat.launchPoint, 0);
    assert.equal(d.target.body.vx, 0, 'no launch');
    assert.equal(d.target.body.vy, 0);
    assert.equal(d.target.combat.stun, 0, 'no hitstun');
    assert.ok(d.target.combat.hitstop > 0, 'the hit\'s freeze');
    assert.ok(d.attacker.combat.hitstop > 0, 'the attacker feels the impact');
    trail.push(d.target.combat.energy);
    while (d.attacker.combat.attack || d.attacker.combat.cooldowns.size) d.tick({}, HOLD);
  }
  assert.deepEqual(trail, [85, 70, 55, 40, 25, 10, 0]);
  // The last emptied it: exhausted, the Shield dropped, the bar gray.
  assert.equal(d.target.combat.energyExhausted, true);
  assert.equal(d.target.combat.shielding, false);
  assert.equal(energyBarState(d.target).color, ENERGY_STYLE.exhausted);
  // Still holding Shield: it stays down, and the next hit lands in full.
  const [hit] = blockedAttack(d);
  assert.equal(hit.type, 'hit');
  assert.equal(hit.damage, def.attacks.attack1.damage);
  assert.equal(d.target.combat.launchPoint, def.attacks.attack1.damage);
});

test('a blocked hit shows no hurt pose: the Shield holds through the freeze and the blockstun, held or not', () => {
  const d = duel();
  raiseShield(d);
  const [event] = blockedAttack(d);
  assert.equal(event.type, 'block');
  const blockstun = def.attacks.attack1.blockstun;
  assert.ok(Math.abs(d.target.combat.shieldStun - blockstun) < 1e-9, 'blockstun, held in the Shield');
  // Shield let go at once: the Shield stays up until the freeze and the
  // blockstun are over, never a hurt pose.
  const states = [];
  let up = 0;
  for (let i = 0; i < 60; i++) {
    d.tick();
    states.push(d.target.state);
    if (d.target.combat.shielding) up++;
    else break;
  }
  assert.ok(!states.includes('hitstun'), states.join());
  assert.ok(Math.abs(up - steps(def.attacks.attack1.hitstop + blockstun)) <= 1, `held ${up} steps`);
  assert.equal(d.target.combat.shieldStun, 0);
  assert.equal(d.target.state, 'idle', 'no lower pose: straight back to its stance');
  // Unable to act while held there.
  const d2 = duel();
  d2.tick({}, SHIELD);
  blockedAttack(d2);
  d2.tick({}, { ...JUMP });
  assert.equal(d2.target.grounded, true, 'no jump out of blockstun');
});

test('the Shield blocks from every side: an attack from behind is blocked just the same', () => {
  // The target faces away from the attacker.
  const d = duel({ targetFacing: 1 });
  raiseShield(d);
  const [event] = blockedAttack(d, KICK);
  assert.equal(d.target.facing, 1, 'still facing away');
  assert.equal(event.type, 'block');
  assert.equal(event.damage, 0);
  assert.equal(d.target.combat.energy, 100 - COST);
  assert.equal(d.target.body.vy, 0, 'the High Kick launched nothing');
  assert.equal(d.target.grounded, true);
});

test('in the air nothing is blocked: Shield held there, a blow lands in full', () => {
  // Both in the air; #0001's Red Kick locks on to the target holding
  // Shield (no fresh press, so no Deflect either) and strikes it.
  const d = duel({ gap: 40 });
  d.tick(JUMP, JUMP);
  for (let i = 0; i < 3; i++) d.tick({}, HOLD);
  assert.equal(d.target.grounded, false);
  const [event] = blockedAttack(d, ATTACK2);
  assert.equal(event.type, 'hit');
  assert.equal(event.move, 'midair_attack2');
  assert.equal(d.target.combat.launchPoint, def.attacks.midair_attack2.damage);
  assert.equal(d.target.combat.energy, 100, 'no Shield paid for it');
  assert.equal(d.target.combat.shielding, false);
});

test('a missed attack costs nothing: no hit, no block event, no Energy', () => {
  const d = duel({ gap: 120 });
  d.tick({}, SHIELD);
  d.tick(ATTACK1, HOLD);
  while (d.attacker.combat.attack) d.tick({}, HOLD);
  d.tick(KICK, HOLD);
  while (d.attacker.combat.attack) d.tick({}, HOLD);
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.energy, 100);
  assert.equal(d.target.combat.shielding, true);
});

test('blocking uses the fighter\'s own hurtboxes, never the bigger circle drawn round it', () => {
  // attack1's fist ends 46 units in front of the attacker, past its Step-in;
  // at a gap where it
  // stops 4 units short of the target's hurtboxes it is well inside the
  // drawn Shield (radius ~66 round the target's middle) but touches
  // nothing: nothing happens.
  // Its reach as it strikes: the box, and the Step-in that carries it there.
  const lunge = stepInTravel(createAttackDefinition({ ...def.attacks.attack1, id: 'attack1' }), BASE_FIGHTER_MOVEMENT, DT);
  const reach = def.attacks.attack1.hitbox.x + def.attacks.attack1.hitbox.w + lunge;
  const gap = reach - Math.min(...def.hurtboxes.map((h) => h.x)) + 4;
  const d = duel({ gap });
  assert.ok(gap - reach < shieldRadius(def) * (1 - SHIELD_SHAPE.amp), 'inside the circle, wherever its edge is');
  assert.ok(reach < gap + Math.min(...def.hurtboxes.map((h) => h.x)), 'short of the hurtboxes');
  d.tick({}, SHIELD);
  d.tick(ATTACK1, HOLD);
  while (d.attacker.combat.attack) d.tick({}, HOLD);
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.energy, 100);
});

test('with less Energy than a block costs the Shield still goes up and blocks; that block takes all that is left, grays the bar and drops the Shield', () => {
  const d = duel({ targetCharacter: NO_REGEN });
  d.target.combat.setEnergy(10);
  assert.equal(d.target.combat.canShield(), true, 'not exhausted: any Energy will do');
  raiseShield(d);
  assert.equal(d.target.combat.shielding, true);
  assert.equal(d.target.state, 'shield');
  const [event] = blockedAttack(d);
  assert.equal(event.type, 'block', 'the block stands');
  assert.equal(event.damage, 0);
  assert.equal(event.energyCost, 10, 'all it had, never below 0');
  assert.equal(d.target.combat.launchPoint, 0);
  assert.deepEqual([d.target.combat.energy, d.target.combat.energyExhausted], [0, true]);
  assert.equal(energyBarState(d.target).color, ENERGY_STYLE.exhausted, 'gray');
  assert.equal(d.target.combat.shielding, false, 'dropped at once');
  assert.equal(d.target.combat.shieldStun, 0);
  // Still holding Shield: locked until the bar is full again, and the next
  // hit lands in full.
  while (d.attacker.combat.attack || d.attacker.combat.cooldowns.size) d.tick({}, HOLD);
  const [hit] = blockedAttack(d);
  assert.equal(hit.type, 'hit');
  assert.equal(d.target.combat.launchPoint, def.attacks.attack1.damage);
  // Exhausted, attacks work normally even with Shield held.
  const low = makeFighter();
  low.fighter.combat.setEnergy(0);
  low.step({ ...HOLD, ...ATTACK1 });
  assert.equal(low.fighter.combat.shielding, false);
  assert.equal(low.fighter.combat.attack?.def.id, 'attack1');
});

test('a block that leaves some Energy keeps the Shield up; the one that empties it drops it, and a later hit, even on the same step, lands in full', () => {
  const d = duel({ targetCharacter: NO_REGEN });
  raiseShield(d);
  d.target.combat.setEnergy(COST + 10);
  const [event] = blockedAttack(d);
  assert.equal(event.type, 'block');
  assert.equal(event.energyCost, COST);
  assert.equal(d.target.combat.energy, 10);
  assert.equal(d.target.combat.energyExhausted, false);
  assert.equal(d.target.combat.shielding, true, 'still up on 10');
  while (d.attacker.combat.attack || d.attacker.combat.cooldowns.size) d.tick({}, HOLD);
  const [second] = blockedAttack(d);
  assert.deepEqual([second.type, second.energyCost], ['block', 10]);
  assert.deepEqual([d.target.combat.energy, d.target.combat.energyExhausted, d.target.combat.shielding], [0, true, false]);
  // Two hits resolved on one step: the last of its Energy blocks the first,
  // the second lands.
  const system = new CombatSystem();
  const { fighter: target } = makeFighter({ x: 544, facing: -1 });
  const { fighter: attacker } = makeFighter();
  target.combat.setEnergy(COST);
  target.combat.shielding = true;
  const first = system.applyHit(attacker, target, attacker.attacks.attack1);
  const next = system.applyHit(attacker, target, attacker.attacks.attack1);
  assert.deepEqual([first.type, next.type], ['block', 'hit']);
  assert.deepEqual([first.energyCost, next.energyCost], [COST, 0]);
  assert.equal(target.combat.energy, 0);
  assert.equal(target.combat.energyExhausted, true);
  assert.equal(target.combat.launchPoint, def.attacks.attack1.damage, 'only the second hit counts');
});

test('exhausted: no Shield (and no Dash) through 1, 25, 50, 75 and 99; both back at exactly 100', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(0);
  assert.equal(c.energyExhausted, true);
  for (const mark of [1, 25, 50, 75, 99]) {
    while (c.energy < mark) c.updateEnergy(DT, false);
    step(SHIELD);
    assert.equal(c.shielding, false, `no Shield at ${c.energy.toFixed(1)}`);
    assert.equal(fighter.tryDash(1), false, `no Dash at ${c.energy.toFixed(1)}`);
    assert.equal(energyBarState(fighter).color, ENERGY_STYLE.exhausted, 'gray');
    step();
  }
  while (c.energy < 100) c.updateEnergy(DT, false);
  assert.equal(c.energyExhausted, false);
  assert.equal(energyBarState(fighter).visible, false, 'full: the meter is gone');
  step(SHIELD);
  assert.equal(c.shielding, true, 'Shield');
  step();
  while (fighter.state !== 'idle') step();
  assert.equal(fighter.tryDash(1), true, 'Dash');
});

// ---- Missing art ------------------------------------------------------------------

test('missing Shield art refuses the Shield (warned once), and the attack lands normally', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    const noShield = Object.keys(def.animations).filter((k) => !/shield/i.test(k));
    const { attacker, target, tick, until, events } = duel({ targetSprites: fakeSprites(noShield) });
    tick(ATTACK1, SHIELD);
    assert.equal(target.combat.shielding, false);
    assert.equal(target.state, 'idle', 'no idle-as-shield');
    for (let i = 0; i < 30 && !events.length; i++) tick({}, HOLD);
    assert.equal(events[0].type, 'hit');
    assert.equal(target.combat.launchPoint, def.attacks.attack1.damage);
    while (attacker.combat.attack) tick({}, HOLD);
    assert.equal(warnings.filter((w) => /Shield "shielding" has no animation frames/.test(w)).length, 1, 'once');

    // Without its raise or lower pose the held Shield still works, just
    // without those poses.
    const bare = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => !/^(prep|release)shield$/.test(k))) });
    bare.step(SHIELD);
    assert.equal(bare.fighter.animator.anim.key, 'shielding');
    bare.step();
    assert.equal(bare.fighter.state, 'idle');
  } finally {
    console.warn = warn;
  }
});

// ---- The Shield's look --------------------------------------------------------------

test('the Shield\'s outline is a closed wavy circle: mean radius on target, clearly wavy but bounded waves', () => {
  const r = shieldRadius(def);
  // Clearly readable in play (the old 4.5 % was all but invisible), never
  // spiky: the waves' weights add up to 1, so `amp` is the most it leans.
  assert.ok(SHIELD_SHAPE.amp >= 0.09 && SHIELD_SHAPE.amp <= 0.11, `${SHIELD_SHAPE.amp}`);
  assert.ok(Math.abs(SHIELD_SHAPE.waves.reduce((sum, [, , w]) => sum + w, 0) - 1) < 1e-9);
  for (const [k] of SHIELD_SHAPE.waves) assert.ok(Number.isInteger(k) && k >= 2, 'whole waves round the circle, never a pulse (k 0)');
  assert.ok(r >= 0.6 * def.visual.height && r <= 0.7 * def.visual.height, `${r}`);
  assert.ok(r > def.visual.height / 2, 'reaches past the head and the feet');
  for (const time of [0, 0.7, 3.2]) {
    const pts = shieldOutline(100, 200, r, time);
    assert.equal(pts.length, SHIELD_SHAPE.points * 2);
    const radii = [];
    for (let i = 0; i < pts.length; i += 2) radii.push(Math.hypot(pts[i] - 100, pts[i + 1] - 200));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    assert.ok(Math.abs(mean - r) < 1e-6, `mean radius ${mean}`);
    const spread = Math.max(...radii) - Math.min(...radii);
    assert.ok(spread > 0.1 * r, `visibly wavy, not a ruled circle: ${spread}`);
    for (const d of radii) assert.ok(Math.abs(d - r) <= SHIELD_SHAPE.amp * r + 1e-9, 'never spiky');
    // Evenly round: consecutive points turn by one step every time.
    const angle = (i) => Math.atan2(pts[i * 2 + 1] - 200, pts[i * 2] - 100);
    const stepAngle = (Math.PI * 2) / SHIELD_SHAPE.points;
    for (let i = 1; i < SHIELD_SHAPE.points; i++) {
      const turn = (angle(i) - angle(i - 1) + Math.PI * 4) % (Math.PI * 2);
      assert.ok(Math.abs(turn - stepAngle) < 1e-9);
    }
  }
  // It drifts with time, slowly; with reduced motion it holds its wavy shape.
  assert.notDeepEqual(shieldOutline(0, 0, r, 0), shieldOutline(0, 0, r, 1));
  const still = shieldOutline(0, 0, r, 5, true);
  assert.deepEqual(still, shieldOutline(0, 0, r, 0, true));
  assert.deepEqual(still, shieldOutline(0, 0, r, 0));
  for (const [, speed] of SHIELD_SHAPE.waves) assert.ok(Math.abs(speed) <= 1, 'a slow drift, never a pulse');
  // Over a few seconds the edge clearly moves, but smoothly: frame to frame
  // (60 Hz) no point jumps, and the mean radius (the circle's size) never
  // swells or shrinks as it goes.
  const radiiAt = (time) => {
    const pts = shieldOutline(0, 0, r, time);
    return Array.from({ length: SHIELD_SHAPE.points }, (_, i) => Math.hypot(pts[i * 2], pts[i * 2 + 1]));
  };
  let moved = 0;
  let jitter = 0;
  for (let time = 0; time < 6; time += DT) {
    const [a, b] = [radiiAt(time), radiiAt(time + DT)];
    jitter = Math.max(jitter, ...a.map((v, i) => Math.abs(b[i] - v)));
    const mean = b.reduce((x, y) => x + y, 0) / b.length;
    assert.ok(Math.abs(mean - r) < 1e-6, 'never a uniform pulse');
  }
  const [first, later] = [radiiAt(0), radiiAt(3)];
  moved = Math.max(...first.map((v, i) => Math.abs(later[i] - v)));
  assert.ok(moved > 0.1 * r, `visibly drifting over 3 s: ${moved}`);
  assert.ok(jitter < 0.01 * r, `smooth, never jittery: ${jitter} a frame`);
});

test('the Shield follows its fighter\'s body centre, sized by its visual height, not the frame on screen', () => {
  const { fighter, step } = makeFighter();
  step(SHIELD);
  fighter.renderX = 321;
  fighter.renderY = 654;
  assert.deepEqual(shieldCenter(fighter), [321, 654 - def.visual.height / 2]);
  assert.deepEqual(shieldCenter(fighter, false), [fighter.body.x, fighter.body.y - def.visual.height / 2]);
  const before = shieldRadius(fighter.def);
  for (let i = 0; i < 10; i++) step(HOLD);
  assert.equal(shieldRadius(fighter.def), before, 'the raise and hold poses never resize it');
});

// A 2D context that records every call with the styles in force at the time.
function recorder() {
  const calls = [];
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => stack.push({ ...state });
      if (k === 'restore') return () => Object.assign(state, stack.pop());
      return (...args) => calls.push({ fn: k, args, fill: state.fillStyle, stroke: state.strokeStyle, lineWidth: state.lineWidth });
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, calls };
}

test('the Shield is black and red, the fighter visible through it: faint black inside, black rim, thin red line', () => {
  const { fighter, step } = makeFighter();
  const view = { x: 0, y: 0, scale: 1.5, dpr: 2 };
  const none = recorder();
  assert.equal(drawShield(none.ctx, fighter, view, 'interior'), false);
  assert.equal(drawShield(none.ctx, fighter, view, 'rim'), false);
  assert.deepEqual(none.calls, [], 'no Shield, nothing drawn');
  step(SHIELD);
  const inside = recorder();
  assert.equal(drawShield(inside.ctx, fighter, view, 'interior'), true);
  const fills = inside.calls.filter((c) => c.fn === 'fill');
  assert.equal(fills.length, 1);
  assert.equal(fills[0].fill, SHIELD_STYLE.interior);
  const alpha = Number(SHIELD_STYLE.interior.match(/rgba\(0, 0, 0, ([\d.]+)\)/)[1]);
  assert.ok(alpha > 0 && alpha <= 0.25, 'barely-there black: the fighter stays visible');
  assert.equal(inside.calls.filter((c) => c.fn === 'stroke').length, 0);
  const rim = recorder();
  drawShield(rim.ctx, fighter, view, 'rim');
  const strokes = rim.calls.filter((c) => c.fn === 'stroke');
  assert.deepEqual(strokes.map((c) => c.stroke), [SHIELD_STYLE.rim, SHIELD_STYLE.accent]);
  assert.equal(SHIELD_STYLE.rim, '#000000');
  assert.equal(SHIELD_STYLE.accent, EDGE_RED, 'the Void\'s red');
  assert.equal(rim.calls.filter((c) => c.fn === 'fill').length, 0, 'the rim never fills over the fighter');
  // Widths in CSS pixels whatever the zoom: world units x scale / dpr.
  const css = (c) => (c.lineWidth * view.scale) / view.dpr;
  assert.ok(Math.abs(css(strokes[0]) - SHIELD_STYLE.rimWidth) < 1e-9);
  assert.ok(Math.abs(css(strokes[1]) - SHIELD_STYLE.accentWidth) < 1e-9);
  assert.ok(SHIELD_STYLE.accentWidth <= 2 && SHIELD_STYLE.accentWidth < SHIELD_STYLE.rimWidth, 'thin red');
  // No green anywhere in it.
  for (const color of Object.values(SHIELD_STYLE).filter((v) => typeof v === 'string')) {
    assert.doesNotMatch(color, /#[0-9a-f]{2}[89a-f][0-9a-f][0-4][0-9a-f]/i, color);
  }
});

// The paths `calls` traced, each with the colour it was stroked or filled in:
// [{ fn: 'stroke' | 'fill', color, lineWidth, pts: [[x, y], ...] }].
function tracedPaths(calls) {
  const paths = [];
  let pts = [];
  for (const c of calls) {
    if (c.fn === 'beginPath') pts = [];
    else if (c.fn === 'moveTo' || c.fn === 'lineTo') pts.push(c.args);
    else if (c.fn === 'stroke' || c.fn === 'fill') {
      paths.push({ fn: c.fn, color: c.fn === 'stroke' ? c.stroke : c.fill, lineWidth: c.lineWidth, pts });
    }
  }
  return paths;
}

test('the red line sits on the outside of the black rim, flush with its outer edge, locked to the same waves', () => {
  const { fighter, step } = makeFighter();
  step(SHIELD);
  const [cx, cy] = shieldCenter(fighter);
  const r = shieldRadius(def);
  for (const view of [{ x: 0, y: 0, scale: 1.5, dpr: 2 }, { x: 0, y: 0, scale: 0.8, dpr: 1 }]) {
    for (const time of [0, 1.3, 4.7]) {
      const { ctx, calls } = recorder();
      drawShield(ctx, fighter, view, 'rim', time);
      const [black, red] = tracedPaths(calls);
      assert.deepEqual([black.color, red.color], [SHIELD_STYLE.rim, EDGE_RED], 'black first, the red over it');
      // The black rim is the primary outline itself.
      assert.deepEqual(black.pts.flat(), shieldOutline(cx, cy, r, time));
      assert.equal(red.pts.length, black.pts.length);
      const halfBlack = black.lineWidth / 2;
      const halfRed = red.lineWidth / 2;
      for (let i = 0; i < black.pts.length; i++) {
        const [bx, by] = black.pts[i];
        const [rx, ry] = red.pts[i];
        const db = Math.hypot(bx - cx, by - cy);
        const dr = Math.hypot(rx - cx, ry - cy);
        // Same angle round the centre: the red rides the black's own wave.
        const cross = (bx - cx) * (ry - cy) - (by - cy) * (rx - cx);
        assert.ok(Math.abs(cross) < 1e-6 * db * dr, 'on the same ray, locked to the black');
        assert.ok(dr > db, `outside the primary outline at point ${i}`);
        // Its whole width in the black's outer half: none of it inside the
        // rim's centre line, and its outer edge flush with the black's.
        assert.ok(dr - halfRed >= db - 1e-9, 'never reaching the inner half');
        // (The red is traced at radius + outset through the same waves, so
        // they lean it out by up to amp x outset more: a tenth of a pixel.)
        const slack = SHIELD_SHAPE.amp * (halfBlack - halfRed) + 1e-9;
        assert.ok(Math.abs(dr + halfRed - (db + halfBlack)) <= slack, 'flush with the outer edge');
      }
    }
  }
});

test('the Shield\'s drawn waves follow the drift clock, and hold still with reduced motion', () => {
  const { fighter, step } = makeFighter();
  step(SHIELD);
  const view = { x: 0, y: 0, scale: 1.2, dpr: 1 };
  const drawn = (time, reducedMotion) => {
    const { ctx, calls } = recorder();
    drawShield(ctx, fighter, view, 'interior', time, reducedMotion);
    drawShield(ctx, fighter, view, 'rim', time, reducedMotion);
    return tracedPaths(calls).map((p) => p.pts.flat());
  };
  assert.notDeepEqual(drawn(0, false), drawn(0.5, false), 'moving');
  assert.notDeepEqual(drawn(2, false), drawn(2 + DT, false), 'every frame');
  assert.deepEqual(drawn(0.5, true), drawn(0, true), 'reduced motion: frozen');
  assert.deepEqual(drawn(9, true), drawn(0, false), 'frozen on the wavy shape at 0');
  // Frozen and still wavy, red still outside.
  const [interior, black, red] = drawn(3, true);
  assert.deepEqual(interior, black, 'the interior fills exactly the rim\'s shape');
  const [cx, cy] = shieldCenter(fighter);
  const radii = (pts) => Array.from({ length: pts.length / 2 }, (_, i) => Math.hypot(pts[i * 2] - cx, pts[i * 2 + 1] - cy));
  const b = radii(black);
  assert.ok(Math.max(...b) - Math.min(...b) > 0.1 * shieldRadius(def), 'still wavy');
  radii(red).forEach((d, i) => assert.ok(d > b[i]));
});

test('K: the ring waves at the Arena\'s own pace, a direction held or not: no faster waves, the interior and rim on one wave', async () => {
  // Shield walking's faster waves are gone, and with them any clock of the
  // ring's own: what the module offers is the look and its geometry.
  const fx = await import('../../js/game/rendering/shield-fx.js');
  assert.deepEqual(Object.keys(fx).sort(), ['SHIELD_SHAPE', 'SHIELD_STYLE', 'drawShield', 'shieldCenter', 'shieldOutline', 'shieldRadius']);
  const still = makeFighter();
  const held = makeFighter();
  still.step(SHIELD);
  held.step({ ...SHIELD, ...RIGHT });
  const view = { x: 0, y: 0, scale: 1.2, dpr: 1 };
  const drawn = (fighter, time, reducedMotion = false) => {
    const { ctx, calls } = recorder();
    // As the Arena draws them: the interior, then (over the sprite) the rim.
    assert.equal(drawShield(ctx, fighter, view, 'interior', time, reducedMotion), true);
    assert.equal(drawShield(ctx, fighter, view, 'rim', time, reducedMotion), true);
    return tracedPaths(calls).map((p) => p.pts.flat());
  };
  const [cx, cy] = shieldCenter(still.fighter);
  for (const time of [0, 0.7, 2.5, 9.25]) {
    for (let i = 0; i < 10; i++) {
      still.step(HOLD);
      held.step({ ...HOLD, ...(i % 2 ? LEFT : RIGHT) });
    }
    const a = drawn(still.fighter, time);
    const b = drawn(held.fighter, time);
    assert.deepEqual(b, a, `${time}: the same waves, whatever is held`);
    assert.deepEqual(a[1], shieldOutline(cx, cy, shieldRadius(def), time), 'the outline at the Arena\'s own time');
    assert.deepEqual(a[0], a[1], 'the interior fills exactly the rim\'s shape, drawn apart');
    assert.deepEqual(drawn(held.fighter, time), b, 'drawn again at that time: the very same, no clock of its own');
  }
  // Moving with the Arena's clock, and still with reduced motion, held or not.
  assert.notDeepEqual(drawn(held.fighter, 1), drawn(held.fighter, 1 + DT));
  assert.deepEqual(drawn(held.fighter, 5, true), drawn(still.fighter, 0, true));
});

test('no gameplay code reads the Shield\'s look: only the Arena\'s renderer imports it', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js')) files.push(path);
    }
  };
  walk(`${ROOT}js`);
  const importers = files.filter((f) => /from '[^']*shield-fx\.js'/.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(ROOT.length));
  assert.deepEqual(importers, ['js/game/arena.js']);
  // And the Arena only draws it.
  const arena = readFileSync(`${ROOT}js/game/arena.js`, 'utf8');
  assert.match(arena, /import \{ drawShield \} from '\.\/rendering\/shield-fx\.js';/);
  const simulation = [
    'combat/combat.js', 'combat/attacks.js', 'combat/combat-state.js', 'combat/defense.js', 'physics.js',
    'fighters/fighter.js', 'fighters/movement.js', 'combat/technique.js', 'combat/projectile.js', 'combat/summon.js',
  ];
  for (const name of ['shieldRadius', 'shieldOutline', 'SHIELD_SHAPE']) {
    for (const f of simulation) {
      assert.doesNotMatch(readFileSync(`${ROOT}js/game/${f}`, 'utf8'), new RegExp(name), `${f} never uses ${name}`);
    }
  }
});

test('in a real render the Shield wraps its fighter: interior behind the sprite, rim in front, all under the Void and the status', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../../js/game/battle.js');
  const { getMap } = await import('../../js/data/maps.js');
  const sprites = fakeSprites();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p2.controller = null;
  const { ctx, calls } = recorder();
  battle.ctx = ctx;
  const mark = (name) => () => calls.push({ fn: name, args: [] });
  battle.theme = {
    prepare() {}, update() {}, drawBackground: mark('background'), drawTerrain: mark('terrain'),
    drawForeground: mark('foreground'), drawVoid: mark('void'), shadow: { alpha: 0.3, skew: 0, stretch: 1 },
  };
  const { p1 } = battle;
  Object.assign(battle.view, { ctx, pxW: 1280, pxH: 720, scale: 1.2, x: p1.body.x - 533, y: p1.body.y - 420, w: 1066, h: 600 });
  battle.pxPerArt = 2;
  battle.setPhase('fight');
  // Frames that record which fighter they belong to.
  for (const f of [battle.p1, battle.p2]) {
    Object.defineProperty(f.animator, 'frame', { get: () => ({ canvas: f.label, artW: 30, artH: 50, anchorArtX: 15 }) });
  }
  const render = () => {
    calls.length = 0;
    battle.render();
    return calls;
  };
  let drawn = render();
  assert.ok(!drawn.some((c) => c.fill === SHIELD_STYLE.interior || c.stroke === SHIELD_STYLE.accent), 'no Shield while it is down');
  p1.combat.shielding = true;
  drawn = render();
  const at = (pred) => drawn.findIndex(pred);
  const interior = at((c) => c.fn === 'fill' && c.fill === SHIELD_STYLE.interior);
  const sprite = at((c) => c.fn === 'drawImage' && c.args[0] === p1.label);
  const rim = at((c) => c.fn === 'stroke' && c.stroke === SHIELD_STYLE.rim);
  const accent = at((c) => c.fn === 'stroke' && c.stroke === SHIELD_STYLE.accent);
  const cpuSprite = at((c) => c.fn === 'drawImage' && c.args[0] === battle.p2.label);
  assert.ok(cpuSprite < interior, 'the CPU behind, as always');
  assert.ok(interior < sprite && sprite < rim && rim < accent, 'interior, sprite, rim, red line');
  assert.ok(accent < at((c) => c.fn === 'void'), 'swallowed by the Void like everything on the stage');
  assert.ok(accent < at((c) => c.fn === 'fillText' && c.args[0] === p1.label), 'never over the name tags or status');
  assert.equal(drawn.filter((c) => c.fill === SHIELD_STYLE.interior).length, 1, 'only the shielding fighter');
});

// ---- Training CPU -----------------------------------------------------------------

test('the training CPU never presses Shield and never shields', async () => {
  const { TrainingAIController } = await import('../../js/game/fighters/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 300 < 150 ? { runRight: true, ...(i % 50 === 0 ? SHIELD : {}) } : { runLeft: true });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.shield, false);
    assert.equal(out.shieldPressed, false);
    bot.step(out);
    assert.equal(bot.fighter.combat.shielding, false);
    assert.notEqual(bot.fighter.state, 'shield');
    assert.equal(bot.fighter.combat.attack, null);
  }
});

test('CombatState starts with the Shield down and nothing held; resolveEnergy carries the Shield\'s one cost', () => {
  const c = new CombatState();
  assert.equal(c.shielding, false);
  assert.equal(c.shieldStun, 0);
  assert.equal(c.energySpec.shieldHitCost, 15, 'the one cost');
  assert.throws(() => resolveEnergy({ shieldHitCost: 10 }), /shieldHitCost 10: it is 15 for every fighter/);
  assert.equal(resolveEnergy(def.energy).shieldHitCost, COST, '#0001\'s is everyone\'s');
  assert.equal(BASE, './assets/characters/0001/0001_');
});

// ---- Perfect Shield ---------------------------------------------------------------

test('a Shield raised just before the hit blocks perfectly: no blockstun, free to answer at once, for the same 15 as any block', () => {
  const d = duel({ targetCharacter: NO_REGEN });
  // The Jab lands 8 steps after its press: raise the Shield 6 steps before.
  d.tick(ATTACK1);
  d.tick();
  d.tick({}, SHIELD);
  for (let i = 0; i < 20 && !d.events.length; i++) d.tick({}, HOLD);
  const [e] = d.events;
  assert.equal(e.type, 'block');
  assert.equal(e.perfect, true);
  assert.equal(e.energyCost, COST, 'never free, never a discount');
  assert.equal(d.target.combat.energy, 100 - COST, 'nothing given back');
  assert.equal(d.target.combat.shieldStun, 0, 'no blockstun');
  assert.ok(d.target.combat.hitstop > 0, 'the impact still freezes both');
  // Let go once the freeze is over: straight into its own punch, while the
  // attacker is still recovering from its blocked one.
  while (d.target.combat.hitstop > 0) d.tick({}, HOLD);
  d.tick({}, ATTACK1);
  assert.equal(d.target.combat.attack?.def.id, 'attack1');
  assert.ok(d.attacker.combat.attack, 'the attacker still in its recovery');
});

test('only a fresh raise is perfect: held long, or tapped again too soon after lowering, it is an ordinary block', () => {
  // `before` runs first; then the punch is pressed. With `raise`, the
  // Shield goes up 4 steps after the press (inside the perfect window of
  // the punch landing); without, whatever `before` raised is held on.
  const block = (before, raise) => {
    const d = duel({ targetCharacter: NO_REGEN });
    before(d);
    const count = d.events.length;
    const wait = raise ? {} : HOLD;
    d.tick(ATTACK1, wait);
    for (let i = 0; i < 3; i++) d.tick({}, wait);
    if (raise) d.tick({}, SHIELD);
    for (let i = 0; i < 20 && d.events.length === count; i++) d.tick({}, HOLD);
    return d.events.at(-1);
  };
  const held = block((d) => {
    d.tick({}, SHIELD);
    for (let i = 0; i < 10; i++) d.tick({}, HOLD);
  }, false);
  assert.equal(held.type, 'block');
  assert.equal(held.perfect, false, 'up long before the hit');
  assert.equal(held.energyCost, COST);
  // Lowered and raised again within perfectRearm: no fresh window.
  const tapped = block((d) => {
    for (let i = 0; i < 3; i++) d.tick({}, HOLD);
    d.tick({}, {});
  }, true);
  assert.equal(tapped.type, 'block');
  assert.equal(tapped.perfect, false, 'tapping Shield never keeps a window open');
  // Down long enough first: fresh again.
  const fresh = block((d) => {
    for (let i = 0; i < 3; i++) d.tick({}, HOLD);
    for (let i = 0; i < steps(def.defense.perfectRearm) + 1; i++) d.tick({}, {});
  }, true);
  assert.equal(fresh.perfect, true);
  // Perfect or not, a block costs the same.
  assert.deepEqual([held.energyCost, tapped.energyCost, fresh.energyCost], [COST, COST, COST]);
  // A hit is never perfect.
  const hit = duel();
  hit.tick(ATTACK1);
  hit.until(() => hit.events.length > 0, 20);
  assert.equal(hit.events[0].perfect, false);
});
