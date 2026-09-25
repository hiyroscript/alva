// Run with node --test tests/defense.test.mjs (no dependencies).
// Defense, the shared defensive input (L / RB / RT / touch D), and #0001's
// Shield, the way #0001 defends: artwork registration (the real uploaded
// frames), the held ground and mid-air Shield, its poses, physics, priority,
// the 25-Energy cost of each blocked hit (and nothing else), full-circle
// blocking on the fighter's own hurtboxes, the low-Energy and exhaustion
// rules, missing-art safety, the Shield's black-and-red circle and the
// training CPU. Uses the real Fighter, CombatSystem, physics and InputManager
// (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { CombatState, CombatSystem, createDefenseDefinition, resolveEnergy } from '../js/game/combat.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import {
  SHIELD_SHAPE, SHIELD_STYLE, drawShield, shieldCenter, shieldOutline, shieldRadius,
} from '../js/game/shield-fx.js';
import { EDGE_RED } from '../js/core/organic-edge.js';
import { energyBarState, ENERGY_STYLE } from '../js/game/fighter-status.js';
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
const RIGHT = { right: true };
const SHIELD_FPS = 12;
const POSE = steps(1 / SHIELD_FPS); // simulation steps the raise / lower pose shows
const COST = 25;
// #0001 with no Energy refill, so a run of blocks lands on exact values.
const NO_REGEN = { ...def, energy: { ...def.energy, regen: 0, chargeRegen: 0 } };

// The uploaded PNGs, byte for byte, and their one-frame roles.
const SHIELD_FILES = {
  shieldStart: ['0001_prepshield.png', '22d75fa92e2b8cf8aedbee896abeea1c86f3f81aa3285c83bf6ddd7be5b8fd51', 51],
  shield: ['0001_shielding.png', '9e3dd8d262e8d49e27b0efc4b57e14d4055c8b8ea010ee536131889d8ca6f6f4', 47],
  shieldRelease: ['0001_releaseblock.png', 'b8e9dbb389de4440aac9f3d8459469b7696355bc7aceb9a13ee9593b66cea554', 45],
  midairShield: ['0001_midairshielding.png', '534a78c7430b69fedacc383afb2fa3906518e5e05b791d38eed32bb2ba0277ee', 49],
};

// A PNG's pixel size, from its header.
const pngSize = (path) => {
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

// Steps a duel with the target holding Defense until the attacker's attack
// has connected (or `limit` steps pass), the attack pressed on the first.
function blockedAttack(d, press = BA1, targetHeld = HOLD, limit = 60) {
  const before = d.events.length;
  d.tick(press, targetHeld);
  for (let i = 0; i < limit && d.events.length === before; i++) d.tick({}, targetHeld);
  return d.events.slice(before);
}

// ---- Artwork ------------------------------------------------------------------

test('the four uploaded Shield frames live in the canonical #0001 folder, unchanged, and nowhere else', () => {
  const paths = characterFramePaths(def);
  for (const [key, [name, sha, height]] of Object.entries(SHIELD_FILES)) {
    const url = `./assets/characters/0001/${name}`;
    assert.deepEqual(def.animations[key].frames, [url], `${key} is ${name}`);
    assert.ok(paths.includes(url), `${url} is preloaded`);
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + name), `no root copy of ${name}`);
    const bytes = readFileSync(ROOT + url.slice(2));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${name} bytes are the upload`);
    assert.equal(pngSize(ROOT + url.slice(2))[1], height, `${name} is ${height} px tall`);
  }
  // Only the files the repository really has: nothing invented.
  const dir = readdirSync(ROOT + 'assets/characters/0001/').filter((n) => /shield|block/.test(n)).sort();
  assert.deepEqual(dir, Object.values(SHIELD_FILES).map(([n]) => n).sort());
  assert.deepEqual(readdirSync(ROOT).filter((n) => /^0001_.*\.png$/i.test(n)), []);
});

test('Shield clips are single held frames at 1x, sized against idle\'s 52 art pixels, with no fallback', () => {
  for (const [key, [, , height]] of Object.entries(SHIELD_FILES)) {
    const clip = def.animations[key];
    assert.equal(clip.frames.length, 1, `${key}: one frame, no invented in-betweens`);
    assert.equal(clip.fps, SHIELD_FPS, key);
    assert.equal(clip.loop, false, key);
    assert.equal(clip.heightRatio, height / 52, `${key}: one art pixel per file pixel`);
    assert.equal(clip.sourceFacing, undefined, `${key} faces right like the rest of #0001`);
    assert.equal(def.animationFallbacks[key], undefined, `${key} never borrows other art`);
  }
  // The mid-air art is only the held shielding pose: no raise or lower clip.
  assert.equal(def.animations.midairShieldStart, undefined);
  assert.equal(def.animations.midairShieldRelease, undefined);
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
  step(DEFENSE);
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
    step(JUMP);
    step(DEFENSE);
    assert.equal(fighter.animator.anim.key, 'midairShield');
    assert.equal(fighter.spriteFlip, facing === -1, 'mirrored only when facing left, like idle');
  }
});

// ---- Character data -----------------------------------------------------------

test('#0001 defends with a Shield: typed data, no Dodge fields, no chip-damage stat', () => {
  assert.deepEqual(def.defense, {
    type: 'shield',
    groundAnimation: 'shield',
    groundStartAnimation: 'shieldStart',
    groundReleaseAnimation: 'shieldRelease',
    airAnimation: 'midairShield',
  });
  const { fighter } = makeFighter();
  assert.equal(fighter.defense.type, 'shield');
  assert.ok(Object.isFrozen(fighter.defense));
  assert.equal(def.stats.blockDamageScale, undefined);
  assert.equal(def.energy.shieldHitCost, COST);
  assert.equal('blockDrain' in def.energy, false, 'no drain while held');
  assert.equal('dodgeCost' in def.energy, false);
  // Generic: typed, so a future fighter may defend another way; none at all
  // is fine; an unknown type is refused.
  assert.equal(createDefenseDefinition(undefined), null);
  assert.equal(createDefenseDefinition({ type: 'shield' }).groundAnimation, null);
  assert.throws(() => createDefenseDefinition({ type: 'dodge' }), /Unknown defense type/);
  assert.throws(() => createDefenseDefinition({ type: 'block' }), /Unknown defense type/);
  const none = makeFighter({ character: { ...def, defense: undefined } });
  assert.equal(none.fighter.defense, null);
  none.step(DEFENSE);
  assert.equal(none.fighter.combat.shielding, false);
  assert.equal(none.fighter.state, 'idle');
});

test('the Shield is a Defense state, never an attack or combat action', () => {
  assert.ok(!COMBAT_ACTIONS.includes('defense'));
  assert.equal(def.actions.defense, undefined);
  for (const id of Object.keys(def.attacks)) assert.doesNotMatch(id, /shield|dodge/i);
  const { fighter, step } = makeFighter();
  step(DEFENSE);
  for (let i = 0; i < 20; i++) step(HOLD);
  assert.equal(fighter.combat.attack, null, 'no attack, hitbox or hasHit');
  assert.equal(fighter.combat.cooldowns.size, 0, 'no cooldown entry');
  assert.equal(fighter.combat.chargedCooldowns.size, 0);
});

// ---- Input ---------------------------------------------------------------------

test('the generic input is defense on L; no block or dodge action', () => {
  assert.ok(ACTIONS.includes('defense'));
  for (const name of ['block', 'dodge', 'shield']) assert.ok(!ACTIONS.includes(name), `no ${name} action`);
  assert.deepEqual(CONFIG.bindings.defense, ['KeyL']);
  assert.equal(ACTION_LABELS.defense, 'Defense');
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
  assert.ok(!('block' in frame) && !('shield' in frame));

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
});

// ---- Ground Shield ----------------------------------------------------------------

test('Defense held on the ground: the Shield goes up at once, raises on prepshield, then holds shielding', () => {
  const { fighter, step } = makeFighter();
  step(DEFENSE);
  assert.equal(fighter.combat.shielding, true, 'up on the press step');
  assert.equal(fighter.state, 'shield');
  assert.equal(fighter.animator.anim.key, 'shieldStart');
  const frames = [frameName(fighter)];
  for (let i = 0; i < steps(2); i++) {
    step(HOLD);
    assert.equal(fighter.combat.shielding, true);
    assert.equal(fighter.state, 'shield');
    frames.push(frameName(fighter));
  }
  assert.equal(frames.filter((n) => n === '0001_prepshield.png').length, POSE, 'the raise pose for one frame');
  assert.deepEqual([...new Set(frames)], ['0001_prepshield.png', '0001_shielding.png']);
  assert.equal(frames.at(-1), '0001_shielding.png', 'held for as long as Defense is');
  // Held without a fresh press it still goes up (a held input, not a tap).
  const held = makeFighter();
  held.step(HOLD);
  assert.equal(held.fighter.combat.shielding, true);
});

test('releasing Defense lowers the Shield at once: releaseblock for one frame, then idle', () => {
  const { fighter, step } = makeFighter();
  step(DEFENSE);
  for (let i = 0; i < 20; i++) step(HOLD);
  const frames = [];
  step();
  assert.equal(fighter.combat.shielding, false, 'down on the release step');
  while (fighter.state === 'shieldRelease') {
    frames.push(frameName(fighter));
    step();
  }
  assert.deepEqual([...new Set(frames)], ['0001_releaseblock.png']);
  assert.equal(frames.length, POSE, 'the lower pose for one frame');
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle1.png');
  // Moving straight away still works: the pose is visual only.
  const quick = makeFighter();
  quick.step(DEFENSE);
  for (let i = 0; i < 10; i++) quick.step(HOLD);
  const x = quick.fighter.body.x;
  for (let i = 0; i < 10; i++) quick.step(RIGHT);
  assert.ok(quick.fighter.body.x > x);
});

test('holding the Shield costs nothing: 3 s held at full stays at 100, and a low bar keeps refilling', () => {
  const { fighter, step } = makeFighter();
  step(DEFENSE);
  for (let i = 0; i < steps(3); i++) {
    step(HOLD);
    assert.equal(fighter.combat.energy, 100);
  }
  assert.equal(fighter.combat.shielding, true);
  const low = makeFighter();
  low.fighter.combat.setEnergy(60);
  low.step(DEFENSE);
  for (let i = 0; i < steps(1) - 1; i++) low.step(HOLD);
  assert.ok(Math.abs(low.fighter.combat.energy - 72) < 1e-6, `regen carries on while held (${low.fighter.combat.energy})`);
  assert.equal(low.fighter.combat.shielding, true);
});

test('a grounded Shield holds the fighter in place: no walking, Dash, jump or turning', () => {
  const { fighter, step } = makeFighter();
  const plain = makeFighter();
  stepUntil(step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  stepUntil(plain.step, (f) => f.body.vx >= f.maxSpeed, RIGHT);
  // Holding right with the Shield up slows exactly like letting go.
  step({ ...DEFENSE, ...RIGHT });
  plain.step();
  for (let i = 0; i < 20; i++) {
    assert.equal(fighter.body.vx, plain.fighter.body.vx, `step ${i}: vx`);
    assert.equal(fighter.body.x, plain.fighter.body.x, `step ${i}: x`);
    step({ ...HOLD, ...RIGHT });
    plain.step();
  }
  assert.equal(fighter.body.vx, 0, 'stopped');
  const x = fighter.body.x;
  for (let i = 0; i < 30; i++) step({ ...HOLD, left: true });
  assert.equal(fighter.body.x, x, 'no walking');
  assert.equal(fighter.facing, 1, 'no turning');
  // No Dash: a double tap while shielding starts nothing and costs nothing.
  step({ ...HOLD, right: true, rightPressed: true });
  step(HOLD);
  step({ ...HOLD, right: true, rightPressed: true });
  assert.equal(fighter.dash, null);
  assert.equal(fighter.combat.energy, 100);
  // No jump.
  step({ ...HOLD, ...JUMP });
  for (let i = 0; i < 5; i++) step(HOLD);
  assert.equal(fighter.grounded, true);
  assert.equal(fighter.state, 'shield');
  // Let go and everything works again.
  step();
  step(JUMP);
  assert.equal(fighter.grounded, false);
});

// ---- Mid-air Shield --------------------------------------------------------------

for (const [when, setup] of [
  ['rising', (step) => { step(JUMP); step(); }],
  ['falling', (step) => { step(JUMP); stepUntil(step, (f) => f.body.vy > 0 && f.body.y < 700); }],
]) {
  test(`Defense while ${when} holds midairshielding at once, and gravity keeps working`, () => {
    const { fighter, step } = makeFighter();
    const plain = makeFighter();
    setup(step);
    setup(plain.step);
    step(DEFENSE);
    plain.step();
    assert.equal(fighter.combat.shielding, true);
    assert.equal(fighter.state, 'shield');
    assert.equal(fighter.animator.anim.key, 'midairShield', 'no raise pose in the air');
    assert.equal(frameName(fighter), '0001_midairshielding.png');
    // The exact trajectory of the same jump with no input: no hover or lift.
    for (let i = 0; i < 12 && !fighter.grounded; i++) {
      assert.equal(fighter.body.y, plain.fighter.body.y, `step ${i}: y`);
      assert.equal(fighter.body.vy, plain.fighter.body.vy, `step ${i}: vy`);
      assert.equal(frameName(fighter), '0001_midairshielding.png');
      step(HOLD);
      plain.step();
    }
    // Released in the air: straight back to the airborne clip, no lower pose.
    step();
    assert.equal(fighter.combat.shielding, false);
    assert.ok(['jump', 'fall'].includes(fighter.state), fighter.state);
    assert.ok(['jump', 'fall'].includes(fighter.animator.anim.key));
  });
}

test('a mid-air Shield keeps horizontal momentum under the normal air drag, without steering', () => {
  const { fighter, step } = makeFighter();
  const plain = makeFighter();
  for (const r of [step, plain.step]) {
    stepUntil(r, (f) => f.body.vx >= f.maxSpeed, RIGHT);
    r({ ...JUMP, ...RIGHT });
    r(RIGHT);
  }
  step({ ...DEFENSE, ...RIGHT });
  plain.step();
  for (let i = 0; i < 15; i++) {
    assert.equal(fighter.body.vx, plain.fighter.body.vx, `step ${i}: vx`);
    assert.equal(fighter.body.x, plain.fighter.body.x, `step ${i}: x`);
    step({ ...HOLD, ...RIGHT });
    plain.step();
  }
  assert.ok(fighter.body.vx > fighter.maxSpeed / 2, 'momentum carries on');
  assert.equal(fighter.grounded, false);
});

test('landing with the Shield up holds the grounded shielding pose: no raise pose, no Land', () => {
  const { fighter, step } = makeFighter();
  step(JUMP);
  step();
  step(DEFENSE);
  const states = [];
  const frames = [];
  while (!fighter.grounded) {
    step(HOLD);
    states.push(fighter.state);
    frames.push(frameName(fighter));
  }
  for (let i = 0; i < 10; i++) {
    step(HOLD);
    states.push(fighter.state);
    frames.push(frameName(fighter));
  }
  assert.ok(states.every((s) => s === 'shield'), states.join());
  assert.ok(!frames.includes('0001_prepshield.png'), 'already up: not raised again');
  assert.equal(frames.at(-1), '0001_shielding.png');
});

// ---- Priority --------------------------------------------------------------------

test('Defense held wins over a new attack; an attack already playing is never cut short', () => {
  for (const press of [BA1, BA2, { primary: true, primaryPressed: true }]) {
    const { fighter, step } = makeFighter();
    step({ ...press, ...DEFENSE });
    assert.equal(fighter.combat.attack, null, 'no attack while Defense is held');
    assert.equal(fighter.combat.shielding, true);
    step({ ...press, ...HOLD });
    assert.equal(fighter.combat.attack, null, 'nor pressed while shielding');
    assert.equal(fighter.combat.shielding, true);
    // Let go of Defense first: then the attack starts.
    step(press);
    assert.ok(fighter.combat.attack, 'the attack after the release');
    assert.equal(fighter.combat.shielding, false);
  }
  // An attack in progress plays out; the Shield only rises once it ends.
  const { fighter, step } = makeFighter();
  step(BA2);
  const total = fighter.combat.attack.def.total;
  for (let i = 1; i < steps(total); i++) {
    step(HOLD);
    assert.equal(fighter.combat.attack?.def.id, 'ba2', 'unchanged');
    assert.equal(fighter.combat.shielding, false, 'never both');
  }
  step(HOLD);
  assert.equal(fighter.combat.attack, null);
  assert.equal(fighter.combat.shielding, true, 'up the step the attack ends');
});

test('no Shield while stunned, bound or performing a charged technique', () => {
  const stunned = makeFighter();
  stunned.fighter.combat.stun = 0.2;
  stunned.step(DEFENSE);
  assert.equal(stunned.fighter.combat.shielding, false);
  assert.equal(stunned.fighter.state, 'hitstun');
  stepUntil(stunned.step, (f) => f.combat.stun <= 0, HOLD);
  assert.equal(stunned.fighter.combat.shielding, true, 'held Defense raises it once the stun is over');

  const bound = makeFighter();
  const token = {};
  bound.fighter.combat.bind(token);
  for (let i = 0; i < 10; i++) bound.step(DEFENSE);
  assert.equal(bound.fighter.combat.shielding, false);
  assert.equal(bound.fighter.state, 'bound');
  bound.fighter.combat.unbind(token);
  bound.step(HOLD);
  assert.equal(bound.fighter.combat.shielding, true);

  const rush = makeFighter();
  for (let i = 0; i < 10; i++) rush.step({ charge: true });
  rush.step({ charge: true, ...BA2 });
  assert.ok(rush.fighter.technique);
  rush.step(HOLD);
  assert.equal(rush.fighter.combat.shielding, false);
  assert.ok(rush.fighter.technique, 'the technique goes on');
});

// ---- Blocking (real hitboxes via CombatSystem) ------------------------------------

test('each blocked hit costs exactly 25 Energy: 100 -> 75 -> 50 -> 25 -> 0, and the fourth still blocks', () => {
  const d = duel({ targetCharacter: NO_REGEN });
  d.tick({}, DEFENSE);
  const trail = [];
  for (const expected of [75, 50, 25, 0]) {
    const [event, ...rest] = blockedAttack(d);
    assert.deepEqual(rest, [], 'one event per attack');
    assert.equal(event.type, 'block');
    assert.equal(event.move, 'ba1');
    assert.equal(event.damage, 0, 'no Launch Point');
    assert.equal(event.energyCost, COST);
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
  assert.deepEqual(trail, [75, 50, 25, 0]);
  // The fourth emptied it: exhausted, the Shield dropped, the bar gray.
  assert.equal(d.target.combat.energyExhausted, true);
  assert.equal(d.target.combat.shielding, false);
  assert.equal(energyBarState(d.target).color, ENERGY_STYLE.exhausted);
  // Still holding Defense: it stays down, and the next hit lands in full.
  const [hit] = blockedAttack(d);
  assert.equal(hit.type, 'hit');
  assert.equal(hit.damage, 5);
  assert.equal(d.target.combat.launchPoint, 5);
});

test('a blocked hit shows no hurt pose: the Shield holds through the freeze and the blockstun, held or not', () => {
  const d = duel();
  d.tick({}, DEFENSE);
  const [event] = blockedAttack(d);
  assert.equal(event.type, 'block');
  const blockstun = def.attacks.ba1.blockstun;
  assert.ok(Math.abs(d.target.combat.shieldStun - blockstun) < 1e-9, 'blockstun, held in the Shield');
  // Defense let go at once: the Shield stays up until the freeze and the
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
  assert.ok(Math.abs(up - steps(def.attacks.ba1.hitstop + blockstun)) <= 1, `held ${up} steps`);
  assert.equal(d.target.combat.shieldStun, 0);
  assert.equal(d.target.state, 'shieldRelease');
  // Unable to act while held there.
  const d2 = duel();
  d2.tick({}, DEFENSE);
  blockedAttack(d2);
  d2.tick({}, { ...JUMP });
  assert.equal(d2.target.grounded, true, 'no jump out of blockstun');
});

test('the Shield blocks from every side: an attack from behind is blocked just the same', () => {
  // The target faces away from the attacker.
  const d = duel({ targetFacing: 1 });
  d.tick({}, DEFENSE);
  const [event] = blockedAttack(d, BA2);
  assert.equal(d.target.facing, 1, 'still facing away');
  assert.equal(event.type, 'block');
  assert.equal(event.damage, 0);
  assert.equal(d.target.combat.energy, 75);
  assert.equal(d.target.body.vy, 0, 'BA2 launched nothing');
  assert.equal(d.target.grounded, true);
});

test('a mid-air Shield blocks too: no launch, and the fighter keeps falling', () => {
  const d = duel({ gap: 40 });
  d.tick(JUMP, JUMP);
  d.tick({}, DEFENSE);
  const [event] = blockedAttack(d, BA1);
  assert.equal(event.type, 'block');
  assert.equal(event.move, 'midairBa1');
  assert.equal(d.target.combat.launchPoint, 0);
  assert.equal(d.target.combat.energy, 75);
  const vy = d.target.body.vy;
  while (d.target.combat.hitstop > 0) d.tick({}, HOLD);
  d.tick({}, HOLD);
  assert.ok(d.target.body.vy > vy, 'gravity still pulls');
  assert.equal(d.target.state, 'shield');
  assert.equal(d.target.animator.anim.key, 'midairShield');
});

test('a missed attack costs nothing: no hit, no block event, no Energy', () => {
  const d = duel({ gap: 120 });
  d.tick({}, DEFENSE);
  d.tick(BA1, HOLD);
  while (d.attacker.combat.attack) d.tick({}, HOLD);
  d.tick(BA2, HOLD);
  while (d.attacker.combat.attack) d.tick({}, HOLD);
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.energy, 100);
  assert.equal(d.target.combat.shielding, true);
});

test('blocking uses the fighter\'s own hurtboxes, never the bigger circle drawn round it', () => {
  // BA1's fist ends 40 units in front of the attacker; at a gap of 60 it is
  // well inside the drawn Shield (radius ~55 round the target's middle, ~50
  // where its waves lean in furthest) but short of the target's hurtboxes:
  // nothing happens.
  const d = duel({ gap: 60 });
  const reach = def.attacks.ba1.hitbox.x + def.attacks.ba1.hitbox.w;
  assert.ok(60 - reach < shieldRadius(def) * (1 - SHIELD_SHAPE.amp), 'inside the circle, wherever its edge is');
  assert.ok(reach < 60 + Math.min(...def.hurtboxes.map((h) => h.x)), 'short of the hurtboxes');
  d.tick({}, DEFENSE);
  d.tick(BA1, HOLD);
  while (d.attacker.combat.attack) d.tick({}, HOLD);
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.energy, 100);
});

test('with less than 25 Energy the Shield still goes up and blocks; that block takes all that is left, grays the bar and drops the Shield', () => {
  const d = duel({ targetCharacter: NO_REGEN });
  d.target.combat.setEnergy(10);
  assert.equal(d.target.combat.canShield(), true, 'not exhausted: any Energy will do');
  d.tick({}, DEFENSE);
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
  // Still holding Defense: locked until the bar is full again, and the next
  // hit lands in full.
  while (d.attacker.combat.attack || d.attacker.combat.cooldowns.size) d.tick({}, HOLD);
  const [hit] = blockedAttack(d);
  assert.equal(hit.type, 'hit');
  assert.equal(d.target.combat.launchPoint, 5);
  // Exhausted, attacks work normally even with Defense held.
  const low = makeFighter();
  low.fighter.combat.setEnergy(0);
  low.step({ ...HOLD, ...BA1 });
  assert.equal(low.fighter.combat.shielding, false);
  assert.equal(low.fighter.combat.attack?.def.id, 'ba1');
});

test('a block that leaves some Energy keeps the Shield up; the one that empties it drops it, and a later hit, even on the same step, lands in full', () => {
  const d = duel({ targetCharacter: NO_REGEN });
  d.tick({}, DEFENSE);
  d.target.combat.setEnergy(40);
  const [event] = blockedAttack(d);
  assert.equal(event.type, 'block');
  assert.equal(event.energyCost, COST);
  assert.equal(d.target.combat.energy, 15);
  assert.equal(d.target.combat.energyExhausted, false);
  assert.equal(d.target.combat.shielding, true, 'still up on 15');
  while (d.attacker.combat.attack || d.attacker.combat.cooldowns.size) d.tick({}, HOLD);
  const [second] = blockedAttack(d);
  assert.deepEqual([second.type, second.energyCost], ['block', 15]);
  assert.deepEqual([d.target.combat.energy, d.target.combat.energyExhausted, d.target.combat.shielding], [0, true, false]);
  // Two hits resolved on one step: 25 blocks the first, the second lands.
  const system = new CombatSystem();
  const { fighter: target } = makeFighter({ x: 544, facing: -1 });
  const { fighter: attacker } = makeFighter();
  target.combat.setEnergy(COST);
  target.combat.shielding = true;
  const first = system.applyHit(attacker, target, attacker.attacks.ba1);
  const next = system.applyHit(attacker, target, attacker.attacks.ba1);
  assert.deepEqual([first.type, next.type], ['block', 'hit']);
  assert.deepEqual([first.energyCost, next.energyCost], [COST, 0]);
  assert.equal(target.combat.energy, 0);
  assert.equal(target.combat.energyExhausted, true);
  assert.equal(target.combat.launchPoint, 5, 'only the second hit counts');
});

test('exhausted: no Shield (and no Dash) through 1, 25, 50, 75 and 99; both back at exactly 100', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  c.setEnergy(0);
  assert.equal(c.energyExhausted, true);
  for (const mark of [1, 25, 50, 75, 99]) {
    while (c.energy < mark) c.updateEnergy(DT, false);
    step(DEFENSE);
    assert.equal(c.shielding, false, `no Shield at ${c.energy.toFixed(1)}`);
    assert.equal(fighter.tryDash(1), false, `no Dash at ${c.energy.toFixed(1)}`);
    assert.equal(energyBarState(fighter).color, ENERGY_STYLE.exhausted, 'gray');
    step();
  }
  while (c.energy < 100) c.updateEnergy(DT, false);
  assert.equal(c.energyExhausted, false);
  assert.equal(energyBarState(fighter).visible, false, 'full: the meter is gone');
  step(DEFENSE);
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
    tick(BA1, DEFENSE);
    assert.equal(target.combat.shielding, false);
    assert.equal(target.state, 'idle', 'no idle-as-shield');
    for (let i = 0; i < 30 && !events.length; i++) tick({}, HOLD);
    assert.equal(events[0].type, 'hit');
    assert.equal(target.combat.launchPoint, 5);
    while (attacker.combat.attack) tick({}, HOLD);
    assert.equal(warnings.filter((w) => /Shield "shield" has no animation frames/.test(w)).length, 1, 'once');

    // Only the air clip missing: the ground Shield works, the air one is refused.
    const noAir = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'midairShield')) });
    noAir.step(DEFENSE);
    assert.equal(noAir.fighter.combat.shielding, true);
    noAir.step();
    noAir.step(JUMP);
    noAir.step(HOLD);
    assert.equal(noAir.fighter.combat.shielding, false);
    assert.ok(warnings.some((w) => /Shield "midairShield" has no animation frames/.test(w)));
    // Without its raise or lower pose the held Shield still works, just
    // without those poses.
    const bare = makeFighter({ sprites: fakeSprites(Object.keys(def.animations).filter((k) => !/shield(Start|Release)/.test(k))) });
    bare.step(DEFENSE);
    assert.equal(bare.fighter.animator.anim.key, 'shield');
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
  step(DEFENSE);
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
  step(DEFENSE);
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
  step(DEFENSE);
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
  step(DEFENSE);
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
  assert.match(arena, /import \{ drawShield \} from '\.\/shield-fx\.js';/);
  for (const name of ['shieldRadius', 'shieldOutline', 'SHIELD_SHAPE']) {
    for (const f of ['combat.js', 'physics.js', 'character.js', 'charged-technique.js', 'projectile.js', 'clone.js']) {
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
  const { Battle } = await import('../js/game/battle.js');
  const { getMap } = await import('../js/data/maps.js');
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

test('the training CPU never presses Defense and never shields', async () => {
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
    bot.step(out);
    assert.equal(bot.fighter.combat.shielding, false);
    assert.notEqual(bot.fighter.state, 'shield');
    assert.equal(bot.fighter.combat.attack, null);
  }
});

test('CombatState starts with the Shield down and nothing held; resolveEnergy carries the Shield\'s cost', () => {
  const c = new CombatState();
  assert.equal(c.shielding, false);
  assert.equal(c.shieldStun, 0);
  assert.equal(c.energySpec.shieldHitCost, COST);
  assert.equal(resolveEnergy({ shieldHitCost: 10 }).shieldHitCost, 10);
  assert.equal(BASE, './assets/characters/0001/0001_');
});
