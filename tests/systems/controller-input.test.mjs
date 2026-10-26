// Run with node --test tests/systems/controller-input.test.mjs (no dependencies).
// The controller in play: Player 1's pad resolved through each fighter's
// own layout into the same control codenames a keyboard sends, on real
// Fighters (the combat engine still decides every move). The universal
// controls (R1 / RB Dashing, L1 / LB guarding); every #0001 and #0002
// default; the right stick as an input of its own (one press per push,
// deadzone, release, wobble, forward by facing, both sticks at once);
// combinations (modifier first, same-sample, never retroactive, never
// leaking into the Shield), on buttons and on sticks; stick directions at
// the deadzone boundaries and on diagonals, each read on its own stick; a
// ground press never coming out in the air; custom single, combination,
// directional, stick, hold-to-activate and continuous bindings, and every
// universal action remapped; menus never leaking into play, sticks
// included; a lost controller letting go of everything; and a fighter
// change switching layouts with nothing carried over. Mocked pads only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter } from '../../js/data/characters.js';
import { resolveProfile, sanitizeStoredProfile, HOLD_THRESHOLD } from '../../js/data/controller-profiles.js';
import { PAD_BUTTONS, DPAD_BUTTONS } from '../../js/core/gamepad-devices.js';
import {
  stickDirection, directionMet, directionHeld, sideMeets, sideOf, movementVector, RUN_THRESHOLD, DIRECTION_DEADZONE, STICK_RELEASE,
  DASH_AIM_THRESHOLD,
} from '../../js/core/controller-resolver.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { DT, SIM_CTX, STAGE, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { controllerRig, fakePad, setButton, PAD_IDS } from '../helpers/fake-gamepad.mjs';

const ONE = getCharacter('0001');
const TWO = getCharacter('0002');
const b = (button, { modifier = null, stick = null, direction = null, activation = 'press' } = {}) => ({ button, modifier, stick, direction, activation });
const flick = (direction, { stick = 'rightStick', modifier = null, activation = 'press' } = {}) => b(null, { modifier, stick, direction, activation });
// A profileFor giving `def`'s fighter `custom` (the rest recommended).
const customFor = (character, custom) => (def) => resolveProfile(def, def?.id === character.id ? custom : null);

// A real Fighter of `character` played by Player 1's controller: frame()
// is one animation frame (a poll) and one simulation step, as the game
// loop runs them.
async function padFighter(character, { x = 900, facing = 1, profileFor, pads } = {}) {
  const rig = await controllerRig({ ...(profileFor ? { profileFor } : {}), ...(pads ? { pads } : {}) });
  const fighter = new Fighter({
    def: character, sprites: fakeSpritesOf(character), stage: STAGE, slot: 0, label: 'P1',
    controller: new PlayerController(rig.input), spawn: { x, facing },
  });
  const frame = () => {
    rig.poll();
    fighter.update(DT, SIM_CTX);
    return fighter;
  };
  frame(); // its first step: its layout from here on
  const settle = (n = 60) => { for (let i = 0; i < n; i++) frame(); };
  // Holds `button` down / lets it go on Player 1's controller (whichever
  // pad that is now), without a frame passing.
  const down = (button) => setButton(rig.pads[0], button, true);
  const up = (button) => setButton(rig.pads[0], button, false);
  // Presses `buttons` together (one sample), steps once and reads what
  // started; holds them `hold` frames in all, then lets go.
  const press = (buttons, { hold = 1 } = {}) => {
    for (const button of buttons) down(button);
    frame();
    const started = { attack: fighter.combat.attack?.def.id ?? null, shield: fighter.combat.shielding, dash: fighter.dash?.direction ?? 0 };
    for (let i = 1; i < hold; i++) frame();
    for (const button of [...buttons].reverse()) up(button);
    return started;
  };
  const airborne = () => {
    press(['south']);
    for (let i = 0; i < 8; i++) frame();
    assert.equal(fighter.body.grounded, false, 'in the air');
  };
  // Pushes the right stick to [x, y] (one sample), steps once and reads
  // what started; holds it `hold` frames in all, then lets it back to the
  // middle and steps once more.
  const push = (x, y, { hold = 1 } = {}) => {
    rig.pads[0].axes[2] = x;
    rig.pads[0].axes[3] = y;
    frame();
    const started = {
      attack: fighter.combat.attack?.def.id ?? null, technique: fighter.technique?.action ?? null,
      summon: !!fighter.pendingSummon, dash: fighter.dash?.direction ?? 0,
    };
    for (let i = 1; i < hold; i++) frame();
    rig.pads[0].axes[2] = 0;
    rig.pads[0].axes[3] = 0;
    frame();
    return started;
  };
  return { ...rig, fighter, frame, settle, press, push, airborne, down, up };
}

// ---- Universal controls ------------------------------------------------------------------

test('the left stick runs left and right (past the run threshold only); the D-pad does not by default', async () => {
  const p = await padFighter(ONE);
  p.stick(0.9, 0);
  for (let i = 0; i < 20; i++) p.frame();
  assert.ok(p.fighter.body.vx > 300, 'running right');
  p.stick(-0.9, 0);
  for (let i = 0; i < 40; i++) p.frame();
  assert.ok(p.fighter.body.vx < -300, 'running left');
  p.stick(RUN_THRESHOLD - 0.01, 0);
  assert.equal(p.sample({ grounded: true, facing: 1, character: ONE }).runRight, false, 'inside the threshold: no run');
  p.stick(RUN_THRESHOLD + 0.01, 0);
  assert.equal(p.sample({ grounded: true, facing: 1, character: ONE }).runRight, true);
  p.stick(0, 0);
  p.press(['dpadRight']);
  assert.equal(p.sample({ grounded: true, facing: 1, character: ONE }).runRight, false);
  // The right stick moves nothing by default.
  p.rightStick(0.9, 0);
  assert.equal(p.sample({ grounded: true, facing: 1, character: ONE }).runRight, false, 'the right stick is free');
});

test('Cross / A jumps; held a little longer it is the higher jump, as the keyboard\'s is', async () => {
  const apex = async (holdFrames) => {
    const p = await padFighter(ONE);
    const y0 = p.fighter.body.y;
    let top = y0;
    p.down('south');
    for (let i = 0; i < 90; i++) {
      if (i === holdFrames) p.up('south');
      top = Math.min(top, p.frame().body.y);
    }
    return y0 - top;
  };
  const tap = await apex(1);
  const held = await apex(20);
  assert.ok(tap > 50, 'a jump');
  assert.ok(held > tap * 1.1, `the higher jump: ${held.toFixed(0)} over ${tap.toFixed(0)}`);
});

test('R1 / RB Dashes the way the stick points, else the way the fighter faces; in the air it is the air dash; held, it never repeats; L1 never Dashes', async () => {
  for (const [x, facing, want] of [[0.9, 1, 1], [-0.9, 1, -1], [0, 1, 1], [0, -1, -1], [DASH_AIM_THRESHOLD + 0.05, -1, 1], [DASH_AIM_THRESHOLD - 0.05, -1, -1]]) {
    const p = await padFighter(ONE, { facing });
    p.stick(x, 0);
    const started = p.press(['r1']);
    assert.equal(started.dash, want, `stick ${x}, facing ${facing}`);
    assert.equal(p.fighter.dash.air, false);
  }
  const p = await padFighter(ONE);
  p.airborne();
  p.stick(-0.9, 0);
  p.press(['r1']);
  assert.equal(p.fighter.dash?.air, true, 'the air dash');
  assert.equal(p.fighter.dash.direction, -1);
  // Held: one Dash per press, however long.
  const r = await padFighter(ONE);
  r.down('r1');
  let last = r.frame().dash;
  assert.ok(last);
  let dashes = 0;
  for (let i = 0; i < 90; i++) {
    const dash = r.frame().dash;
    if (dash && dash !== last) dashes++;
    last = dash;
  }
  assert.equal(dashes, 0, 'nothing repeats while nothing new is pressed');
  const q = await padFighter(ONE);
  assert.equal(q.press(['l1']).dash, 0, 'L1 / LB guards now');
});

test('a Dash flows into an attack: R1 then Square, two fingers, the Jab carrying the Dash\'s speed', async () => {
  const p = await padFighter(ONE);
  p.stick(0.9, 0);
  p.press(['r1']);
  for (let i = 0; i < 4; i++) p.frame();
  assert.equal(p.press(['west']).attack, 'attack1');
  assert.ok(p.fighter.body.vx > 500, `the Jab keeps the Dash's speed: ${p.fighter.body.vx.toFixed(0)}`);
});

test('L1 / LB held is the Shield on the ground, let go it drops; in the air a fresh press is the Deflect, never repeated by holding', async () => {
  const p = await padFighter(ONE);
  assert.equal(p.press(['l1'], { hold: 30 }).shield, true);
  assert.equal(p.fighter.combat.shielding, true, 'up while held');
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.shielding, false, 'down once let go');
  // The Shield never toggles: a tap is a tap.
  p.settle(20);
  p.press(['l1']);
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.shielding, false);
  // Circle is an attack now, never the Shield.
  p.settle(20);
  p.press(['east'], { hold: 10 });
  assert.equal(p.fighter.combat.shielding, false);
  // In the air.
  const q = await padFighter(ONE);
  q.airborne();
  q.down('l1');
  assert.equal(q.frame().combat.attack?.def.id, 'deflect');
  const first = q.fighter.combat.attack;
  let again = 0;
  for (let i = 0; i < 40; i++) {
    const atk = q.frame().combat.attack;
    if (atk && atk !== first && atk.def.id === 'deflect') again++;
  }
  assert.equal(again, 0, 'holding never Deflects again');
});

test('the guard and the attacks are on different hands: let go of L1 and Square strikes at once', async () => {
  const p = await padFighter(ONE);
  p.down('l1');
  for (let i = 0; i < 10; i++) p.frame();
  assert.equal(p.fighter.combat.shielding, true);
  p.up('l1');
  p.down('west');
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.attack?.def.id, 'attack1', 'the Jab the step the Shield drops');
});

test('Options / Menu asks for the pause menu, and never reaches the fighter', async () => {
  const p = await padFighter(ONE);
  const menu = [];
  p.input.onPadMenu((cmd) => menu.push(cmd));
  p.press(['start']);
  assert.deepEqual(menu, ['start']);
  const f = p.sample({ grounded: true, facing: 1, character: ONE });
  assert.equal(Object.entries(f).some(([k, v]) => v === true && k !== 'pressedOnGround'), false, 'nothing in the snapshot');
});

// ---- #0001 ------------------------------------------------------------------------------------

test('#0001 on the ground: Square Jab, Triangle High Kick, Circle Maximum Blue, R2 Red, L2 Unlimited Void, the right stick forward Hollow Purple', async () => {
  for (const [buttons, move] of [[['west'], 'attack1'], [['north'], 'extra_attack'], [['east'], 'attack3'], [['r2'], 'attack2']]) {
    const p = await padFighter(ONE);
    assert.equal(p.press(buttons).attack, move, buttons.join(' + '));
  }
  let p = await padFighter(ONE);
  p.press(['l2']);
  assert.equal(p.fighter.technique?.action, 'attack4', 'L2: Unlimited Void');
  // Forward is the way it faces: right facing right, left facing left;
  // the other way, nothing.
  for (const [facing, x, want] of [[1, 0.9, 'attack5'], [-1, -0.9, 'attack5'], [1, -0.9, null], [-1, 0.9, null]]) {
    p = await padFighter(ONE, { facing });
    assert.equal(p.push(x, 0).technique, want, `facing ${facing}, pushed ${x}`);
    assert.equal(p.fighter.facing, facing, 'it does not turn');
  }
});

test('#0001 in the air: Square Floating Straight, Triangle High Kick, Circle Blue, R2 Red Kick, L1 Deflect; L2 and the right stick nothing', async () => {
  for (const [buttons, move] of [
    [['west'], 'midair_attack1'], [['north'], 'extra_attack'], [['east'], 'midair_attack3'], [['r2'], 'midair_attack2'],
    [['l1'], 'deflect'], [['l2'], null],
  ]) {
    const p = await padFighter(ONE);
    p.airborne();
    assert.equal(p.press(buttons).attack, move, buttons.join(' + '));
  }
  const p = await padFighter(ONE);
  p.airborne();
  const started = p.push(0.9, 0);
  assert.equal(started.attack, null);
  assert.equal(started.technique, null, 'Hollow Purple is a ground cast');
});

// ---- Combinations ---------------------------------------------------------------------------

test('a combination\'s button never raises the Shield: not raised, not buffered, not raised when the modifier is let go; L1 first stays the Shield', async () => {
  // Maximum Blue moved to R3 + L1, Red to R2 + Square.
  const profileFor = customFor(ONE, { 'ground:attack3': b('l1', { modifier: 'r3' }) });
  const p = await padFighter(ONE, { profileFor });
  p.down('r3');
  p.frame();
  p.down('l1');
  p.frame();
  assert.equal(p.fighter.combat.attack?.def.id, 'attack3');
  assert.equal(p.fighter.combat.shielding, false);
  p.up('r3'); // R3 let go, L1 still held
  for (let i = 0; i < 60; i++) {
    p.frame();
    assert.equal(p.fighter.combat.shielding, false, 'the combination\'s L1 never raises the Shield');
  }
  p.up('l1');
  p.frame();
  // Pressed again: now the Shield.
  p.press(['l1'], { hold: 5 });
  assert.equal(p.fighter.combat.shielding, true);
  // L1 first, then R3: the Shield stays, no Maximum Blue.
  const q = await padFighter(ONE, { profileFor });
  q.down('l1');
  for (let i = 0; i < 3; i++) q.frame();
  q.down('r3');
  for (let i = 0; i < 20; i++) q.frame();
  assert.equal(q.fighter.combat.shielding, true);
  assert.equal(q.fighter.combat.attack, null);
  assert.equal(q.fighter.bufferedAttack, null, 'nothing kept for later either');
});

test('combinations are modifier first, read in the same sample, never read back into an earlier press, and nothing repeats or comes from a release', async () => {
  // Red on R2 + Square: R2 alone is nothing for it now.
  const profileFor = customFor(ONE, { 'ground:attack2': b('west', { modifier: 'r2' }) });
  // Same sample: R2 and Square together are Red.
  let p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['r2', 'west']).attack, 'attack2');
  // Square, then R2: the Jab, and nothing after.
  p = await padFighter(ONE, { profileFor });
  p.down('west');
  p.frame();
  assert.equal(p.fighter.combat.attack?.def.id, 'attack1');
  p.down('r2');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(p.frame().combat.attack?.def.id ?? null);
  assert.ok(!seen.has('attack2'), 'never Red after the fact');
  // Letting go of a modifier is no press.
  p = await padFighter(ONE, { profileFor });
  p.press(['r2'], { hold: 10 });
  p.frame();
  assert.equal(p.fighter.combat.attack, null);
  // A modifier let go before the button: the plain button.
  p = await padFighter(ONE, { profileFor });
  p.press(['r2'], { hold: 3 });
  assert.equal(p.press(['west']).attack, 'attack1');
  // A held attack button never repeats.
  p = await padFighter(ONE);
  p.down('west');
  let starts = 0;
  let before = null;
  for (let i = 0; i < 120; i++) {
    const atk = p.frame().combat.attack;
    if (atk && atk !== before) starts++;
    before = atk;
  }
  assert.equal(starts, 1, 'one Jab per press');
});

// ---- #0002 ------------------------------------------------------------------------------------

test('#0002 on the ground: Square One-Two, Triangle Rapid Kicks, Circle Spin Attack (on the run too), R2 Whirlwind', async () => {
  for (const [buttons, move] of [[['west'], 'attack1'], [['north'], 'attack2'], [['east'], 'attack3'], [['r2'], 'extra_attack']]) {
    const p = await padFighter(TWO);
    assert.equal(p.press(buttons).attack, move, buttons.join(' + '));
  }
  const p = await padFighter(TWO);
  p.stick(0.9, 0);
  p.settle(20);
  assert.equal(p.press(['east']).attack, 'attack3', 'the Spin Attack from a run, the stick still held');
});

test('#0002 in the air: Square Homing Attack whichever way the left stick points; the right stick up the Blue Tornado, down the Bounce Attack', async () => {
  // Any way, down included: Homing, starting the way the stick points (or
  // the fighter faces).
  for (const [x, y, facing, want] of [[-0.9, 0, 1, -1], [0.9, 0.2, -1, 1], [0, 0, 1, 1], [0, 0, -1, -1], [-0.9, -0.5, 1, -1], [0, 0.9, 1, 1]]) {
    const p = await padFighter(TWO, { facing });
    p.airborne();
    p.stick(x, y);
    const started = p.press(['west']);
    assert.equal(started.attack, 'midair_attack1', `stick ${x}, ${y}`);
    assert.equal(p.fighter.facing, want, `starts toward ${want}`);
  }
  let p = await padFighter(TWO);
  p.airborne();
  assert.equal(p.push(0, -0.9).attack, 'midair_attack3', 'the right stick up: the Blue Tornado');
  p = await padFighter(TWO);
  p.airborne();
  assert.equal(p.push(0, 0.9).attack, 'midair_attack2', 'the right stick down: the Bounce Attack');
  // On the ground the right stick up or down does nothing for #0002.
  p = await padFighter(TWO);
  assert.equal(p.push(0, -0.9).attack, null);
  assert.equal(p.push(0, 0.9).attack, null);
});

test('both sticks at once: the left stick keeps steering and fast-falling while the right stick plunges, each read on its own', async () => {
  const p = await padFighter(TWO);
  p.airborne();
  while (p.fighter.body.vy < 0) p.frame();
  // Left stick down-right (a fast fall and a drift), right stick down, in
  // one sample.
  p.pads[0].axes[0] = 0.7;
  p.pads[0].axes[1] = 0.7;
  p.pads[0].axes[2] = 0;
  p.pads[0].axes[3] = 0.95;
  p.poll();
  const f = p.input.sample({ grounded: false, facing: 1, character: TWO });
  assert.equal(f.attack2Pressed, true, 'the Bounce Attack from the right stick');
  assert.equal(f.runRight, true, 'the drift from the left stick');
  assert.equal(f.attack1Pressed, false);
  // The right stick's down is no Fast fall, the left stick's is.
  p.pads[0].axes[0] = 0;
  p.pads[0].axes[1] = 0;
  p.poll();
  assert.equal(p.input.sample({ grounded: false, facing: 1, character: TWO }).down, false, 'the right stick never fast-falls');
  p.pads[0].axes[1] = 0.9;
  p.poll();
  assert.equal(p.input.sample({ grounded: false, facing: 1, character: TWO }).down, true, 'the left stick does');
});

// ---- Stick inputs -------------------------------------------------------------------------------

test('a stick input is one press per push: past the deadzone, held without repeating, wobbling at the edge without pressing again, until it comes back under the release', async () => {
  const rig = await controllerRig();
  const air = { grounded: false, facing: 1, character: TWO };
  rig.sample(air);
  const pushed = (x, y) => {
    rig.rightStick(x, y);
    return rig.sample(air).attack3Pressed;
  };
  // Drift and a slight push: nothing.
  assert.equal(pushed(0.05, -0.2), false, 'drift');
  assert.equal(pushed(0, -(DIRECTION_DEADZONE - 0.02)), false, 'inside the deadzone');
  assert.equal(pushed(0, -(DIRECTION_DEADZONE + 0.02)), true, 'past it: one press');
  // Held, and wobbling, even sideways or back to the edge: no new press.
  for (const [x, y] of [[0, -1], [0.3, -0.9], [0.7, -0.6], [0, -(STICK_RELEASE + 0.05)], [0, -0.95]]) {
    assert.equal(pushed(x, y), false, `held at ${x}, ${y}`);
  }
  // Back under the release, then out again: a new press.
  assert.equal(pushed(0, -(STICK_RELEASE - 0.05)), false, 'let go');
  assert.equal(pushed(0, -0.9), true, 'a fresh push');
  // Rolled straight to another side without coming back: still the first push.
  rig.rightStick(0, 0);
  rig.sample(air);
  rig.rightStick(0, 0.9);
  assert.equal(rig.sample(air).attack2Pressed, true, 'down: the Bounce Attack');
  rig.rightStick(0.2, 0.8);
  rig.rightStick(0.1, -0.9);
  const f = rig.sample(air);
  assert.equal(f.attack3Pressed || f.attack2Pressed, false, 'rolled round to up without letting go: nothing new');
});

test('a stick input takes a modifier first, holds to activate, or stays held; a held stick through a reset waits to be let go', async () => {
  const custom = {
    'air:attack3': flick('up', { modifier: 'l2' }), // L2 + Right stick up: the Blue Tornado
    'air:attack1': flick('up'), // Right stick up alone: the Homing Attack
    'ground:attack2': flick('down', { activation: 'hold' }), // Right stick down held: the Rapid Kicks
    shield: flick('left', { activation: 'continuous' }), // Right stick left held: the Shield
  };
  const rig = await controllerRig({ profileFor: customFor(TWO, custom) });
  const air = { grounded: false, facing: 1, character: TWO };
  const ground = { grounded: true, facing: 1, character: TWO };
  rig.sample(air);
  rig.rightStick(0, -0.9);
  let f = rig.sample(air);
  assert.equal(f.attack1Pressed, true, 'alone: the Homing Attack');
  assert.equal(f.attack3Pressed, false);
  rig.rightStick(0, 0);
  rig.press('l2');
  rig.sample(air);
  rig.rightStick(0, -0.9);
  f = rig.sample(air);
  assert.equal(f.attack3Pressed, true, 'L2 held first: the Blue Tornado');
  assert.equal(f.attack1Pressed, false, 'and nothing else');
  rig.rightStick(0, 0);
  rig.press('l2', false);
  rig.sample(ground);
  // Hold to activate: a flick does nothing; held past the threshold, once.
  rig.rightStick(0, 0.9);
  assert.equal(rig.sample(ground).attack2Pressed, false, 'not yet');
  rig.rightStick(0, 0);
  for (let i = 0; i < 30; i++) assert.equal(rig.sample(ground).attack2Pressed, false, 'a flick is no hold');
  rig.rightStick(0, 0.9);
  let fired = 0;
  for (let i = 0; i < Math.ceil(HOLD_THRESHOLD * 60) + 30; i++) {
    rig.poll();
    if (rig.sample(ground).attack2Pressed) fired++;
  }
  assert.equal(fired, 1, 'held: once');
  rig.rightStick(0, 0);
  rig.sample(ground);
  // Continuous: the Shield held while the stick is (past the run threshold, as running reads it).
  rig.rightStick(-0.9, 0);
  f = rig.sample(ground);
  assert.equal(f.shield && f.shieldPressed, true, 'raised as it is pushed');
  rig.rightStick(-0.6, 0.5);
  assert.equal(rig.sample(ground).shield, true, 'held on a diagonal too');
  rig.rightStick(-(RUN_THRESHOLD - 0.05), 0);
  assert.equal(rig.sample(ground).shield, false, 'down once let in');
  // Held through a menu: stale until let go, as a button is.
  rig.rightStick(-0.9, 0);
  rig.sample(ground);
  rig.input.setGameplayActive(false);
  rig.poll();
  rig.input.setGameplayActive(true);
  rig.poll();
  f = rig.sample(ground);
  assert.equal(f.shield, false, 'the stick held as play resumed raises nothing');
  rig.rightStick(0, 0);
  rig.sample(ground);
  rig.rightStick(-0.9, 0);
  assert.equal(rig.sample(ground).shield, true, 'pushed again: the Shield');
});

test('a Dash on a stick goes the way the stick is pushed; with the right stick moving, the left stick is free for actions', async () => {
  let p = await padFighter(ONE, { profileFor: customFor(ONE, { dash: flick('horizontal') }), facing: 1 });
  assert.equal(p.push(-0.9, 0).dash, -1, 'pushed left: left, whatever the fighter faces');
  p.settle(30);
  assert.equal(p.push(0.9, 0).dash, 1);
  // The right stick moves; the left stick's down is an attack's input.
  const custom = { move: { source: 'rightStick' }, 'ground:attack5': b('r3'), 'ground:attack1': flick('down', { stick: 'leftStick' }), fastFall: b('dpadDown', { activation: 'continuous' }) };
  p = await padFighter(ONE, { profileFor: customFor(ONE, custom) });
  p.rightStick(0.9, 0);
  for (let i = 0; i < 20; i++) p.frame();
  assert.ok(p.fighter.body.vx > 300, 'the right stick runs');
  p.rightStick(0, 0);
  p.settle(30);
  p.stick(0, 0.9);
  p.frame();
  assert.equal(p.fighter.combat.attack?.def.id, 'attack1', 'the left stick down: the Jab');
});

test('a direction held with a button is read on its own stick: Right stick down + Square is never Left stick down + Square', async () => {
  const custom = { 'ground:attack3': b('west', { stick: 'rightStick', direction: 'down' }) };
  let p = await padFighter(ONE, { profileFor: customFor(ONE, custom) });
  p.rightStick(0, 0.9);
  assert.equal(p.press(['west']).attack, 'attack3', 'right stick down: Maximum Blue');
  p = await padFighter(ONE, { profileFor: customFor(ONE, custom) });
  p.stick(0, 0.9);
  assert.equal(p.press(['west']).attack, 'attack1', 'left stick down: still the Jab');
});

test('a directional press never doubles as a held stick input on its own step (Left stick down + Square beside the Fast fall)', async () => {
  const custom = { 'air:attack2': b('west', { stick: 'leftStick', direction: 'down' }) };
  for (const [x, y] of [[0, 0.9], [0.6, 0.6], [-0.5, 0.7]]) {
    const p = await padFighter(TWO, { profileFor: customFor(TWO, custom) });
    p.airborne();
    while (p.fighter.body.vy < 0) p.frame();
    p.stick(x, y);
    p.down('west');
    p.poll();
    const f = p.input.sample({ grounded: false, facing: 1, character: TWO });
    assert.equal(f.attack2Pressed, true, `stick ${x}, ${y}: Bounce`);
    assert.equal(f.attack1Pressed, false, 'not Homing');
    assert.equal(f.down, false, 'no fast fall on the same step');
  }
});

// ---- Every playable fighter ------------------------------------------------------------------

test('every playable fighter\'s recommended layout plays: each move\'s input, made on the pad in its place and facing either way, sends that move\'s button and nothing else', async () => {
  const { playableCharacters } = await import('../../js/data/characters.js');
  const { recommendedProfile, controllerActions } = await import('../../js/data/controller-profiles.js');
  const AXES = { up: [0, -0.95], down: [0, 0.95], left: [-0.95, 0], right: [0.95, 0] };
  for (const def of playableCharacters()) {
    const { bindings } = recommendedProfile(def);
    const moves = controllerActions(def).filter((a) => a.kind === 'attack');
    assert.ok(moves.length >= 4, `#${def.id}`);
    for (const a of moves) {
      for (const facing of [1, -1]) {
        const rig = await controllerRig();
        const context = { grounded: a.place === 'ground', facing, character: def };
        rig.sample(context);
        const b = bindings[a.id];
        if (b.button) rig.press(b.button);
        else {
          const side = b.direction === 'forward' ? (facing > 0 ? 'right' : 'left') : b.direction;
          rig.rightStick(...AXES[side]);
        }
        const f = rig.sample(context);
        const pressed = ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].filter((c) => f[`${c}Pressed`]);
        assert.deepEqual(pressed, [a.control], `#${def.id} ${a.id}, facing ${facing}`);
        assert.equal(a.place === 'ground' ? f.pressedOnGround : f.pressedInAir, true, `#${def.id} ${a.id}: made for its place`);
        assert.equal(f.jumpPressed || f.shieldPressed || f.mouvementLeftPressed || f.mouvementRightPressed || f.downPressed, false, `#${def.id} ${a.id}: no universal action with it`);
      }
    }
  }
});

test('every playable fighter shares one universal layout on the pad: the same inputs Jump, Dash, guard and fast-fall for all', async () => {
  const { playableCharacters } = await import('../../js/data/characters.js');
  for (const def of playableCharacters()) {
    const p = await padFighter(def);
    assert.equal(p.press(['r1']).dash, 1, `#${def.id}: R1 Dashes`);
    p.settle(30);
    assert.equal(p.press(['l1'], { hold: 10 }).shield, true, `#${def.id}: L1 guards`);
    p.settle(10);
    p.airborne();
    assert.equal(p.press(['l1']).attack, 'deflect', `#${def.id}: L1 Deflects in the air`);
    while (p.fighter.combat.attack) p.frame();
    while (p.fighter.body.vy < 0) p.frame();
    p.stick(0, 0.9);
    p.frame();
    assert.equal(p.fighter.fastFalling, true, `#${def.id}: the left stick down fast-falls`);
  }
});

// ---- Directions -------------------------------------------------------------------------------

test('directions: a deadzone, a dominant axis (exact diagonals read vertical), forward and back by facing, and thresholds that hold at their boundaries', () => {
  assert.equal(DIRECTION_DEADZONE, 0.5);
  assert.ok(STICK_RELEASE < DIRECTION_DEADZONE, 'a release below the press: no flicker at the edge');
  assert.equal(stickDirection(0, 0.49), null, 'inside the deadzone');
  assert.equal(stickDirection(0, 0.51), 'down');
  assert.equal(stickDirection(0.34, 0.34), null, 'a diagonal inside the deadzone');
  assert.equal(stickDirection(0.6, 0.6), 'down', 'exactly diagonal: vertical');
  assert.equal(stickDirection(0.61, 0.6), 'right');
  assert.equal(stickDirection(-0.6, 0.61), 'down');
  assert.equal(stickDirection(-0.9, -0.2), 'left');
  assert.equal(stickDirection(0.1, -0.8), 'up');
  assert.equal(directionMet(null, 0, 0), true, 'no direction: anywhere, neutral included');
  assert.equal(directionMet('horizontal', -0.8, 0.1), true);
  assert.equal(directionMet('horizontal', 0, 0), false, 'left-or-right is not neutral');
  assert.equal(directionMet('down', 0.6, 0.6), true);
  assert.equal(directionMet('forward', 0.9, 0, 1), true);
  assert.equal(directionMet('forward', 0.9, 0, -1), false, 'facing left, right is back');
  assert.equal(directionMet('back', 0.9, 0, -1), true);
  assert.equal(sideOf('forward', -1), 'left');
  assert.equal(sideMeets('forward', 'up', 1), false);
  assert.equal(directionHeld('down', 0, RUN_THRESHOLD + 0.01), true, 'the fast fall: past the run threshold');
  assert.equal(directionHeld('down', 0, RUN_THRESHOLD - 0.01), false);
  assert.equal(directionHeld('down', 0.9, 0.5), true, 'a fall held on a diagonal too');
  assert.equal(directionHeld('forward', -0.9, 0, -1), true);
  // The left stick or D-pad reads each axis apart: the D-pad's up never stops a run on the stick.
  assert.deepEqual(movementVector('leftStickDpad', new Set(['dpadUp']), [0.9, 0, 0, 0]), [0.9, -1]);
  assert.deepEqual(movementVector('leftStickDpad', new Set(['dpadLeft']), [0.9, 0.3, 0, 0]), [-1, 0.3]);
  assert.deepEqual(movementVector('rightStick', new Set(), [0.9, 0.1, -0.2, 0.8]), [-0.2, 0.8]);
});

// ---- A ground press never comes out in the air ------------------------------------------------

test('a ground press buffered through a recovery never comes out as the air move when the fighter leaves the ground (and vice versa)', () => {
  // Keyboard: the button is the button, wherever the fighter is when it
  // comes out (unchanged).
  const keyboard = makeFighter();
  keyboard.step({ attack1: true, attack1Pressed: true });
  keyboard.step({ attack2Pressed: true, jumpPressed: true, jump: true });
  let seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(keyboard.step({}).combat.attack?.def.id ?? null);
  // A controller's ground press: Red, or nothing; never the Red Kick.
  const pad = makeFighter();
  pad.step({ attack1: true, attack1Pressed: true, pressedOnGround: true });
  pad.step({ attack2Pressed: true, pressedOnGround: true, jumpPressed: true, jump: true });
  assert.equal(pad.fighter.bufferedAttack?.place, 'ground', 'kept for the ground only');
  seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(pad.step({}).combat.attack?.def.id ?? null);
  assert.ok(!seen.has('midair_attack2'), 'never the Red Kick');
  // An air press kept for the air never comes out on landing.
  const air = makeFighter();
  air.step({ jump: true, jumpPressed: true });
  for (let i = 0; i < 10; i++) air.step({ jump: true });
  air.step({ attack1Pressed: true, pressedInAir: true });
  air.step({ attack2Pressed: true, pressedInAir: true });
  seen = new Set();
  for (let i = 0; i < 120; i++) seen.add(air.step({}).combat.attack?.def.id ?? null);
  assert.ok(!seen.has('attack2'), 'never Red on landing');
});

// ---- Custom bindings ---------------------------------------------------------------------------

test('no controller input reaches the retired Transform: a binding saved for it is dropped, and no button or combination sends it', async () => {
  // A profile saved by an older Alva: Transform on R3 on the ground and
  // L2 + R3 in the air, beside a binding that still applies.
  const saved = sanitizeStoredProfile({
    'ground:transform': b('r3'), 'air:transform': b('r3', { modifier: 'l2' }), 'ground:attack1': b('r3'),
  });
  assert.deepEqual(saved, { 'ground:attack1': b('r3') });
  const profileFor = (def) => resolveProfile(def, def?.id === '0001' ? saved : null);
  const p = await padFighter(ONE, { profileFor });
  const seen = [];
  const sample = p.input.sample.bind(p.input);
  p.input.sample = (context) => {
    const out = sample(context);
    seen.push(Object.keys(out));
    return out;
  };
  // Its other binding plays as saved.
  p.settle();
  assert.equal(p.press(['r3']).attack, 'attack1', 'R3: the Jab, as saved');
  // Every button, alone and after L2, on the ground and in the air.
  for (const airborne of [false, true]) {
    for (const button of [...PAD_BUTTONS, ...DPAD_BUTTONS].filter((n) => n !== 'start' && n !== 'l2')) {
      for (const combo of [[button], ['l2', button]]) {
        p.settle();
        if (airborne) p.airborne();
        p.press(combo);
      }
    }
  }
  assert.ok(seen.length > 100);
  assert.ok(seen.every((keys) => !keys.includes('transform') && !keys.includes('transformPressed')), 'no sample ever carries it');
});

test('custom bindings: a single button, a combination, a direction on a stick, hold-to-activate and a continuous Shield on another button', async () => {
  const custom = {
    'ground:attack1': b('r3'), // single button
    'ground:attack2': b('west', { modifier: 'l2' }), // two buttons (L2 also casts the Void: allowed, with a warning)
    'ground:extra_attack': b('north', { stick: 'leftStick', direction: 'up' }), // directional
    'ground:attack3': b('select', { activation: 'hold' }), // hold to activate
    shield: b('dpadDown', { activation: 'continuous' }), // continuous, elsewhere
    deflect: b('dpadDown'),
    jump: b('north', { activation: 'continuous' }),
  };
  const profileFor = customFor(ONE, custom);
  let p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['r3']).attack, 'attack1', 'R3: the Jab');
  p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['west']).attack, null, 'Square alone: nothing now');
  p = await padFighter(ONE, { profileFor });
  p.stick(0, -0.9);
  assert.equal(p.press(['north']).attack, 'extra_attack', 'Left stick up + Triangle: the High Kick');
  p = await padFighter(ONE, { profileFor });
  p.stick(0, 0);
  assert.equal(p.press(['north']).attack, null, 'Triangle alone is now Jump');
  assert.equal(p.fighter.body.grounded, false);
  // Hold to activate: a tap does nothing; held past the threshold, once.
  p = await padFighter(ONE, { profileFor });
  p.press(['select'], { hold: 2 });
  p.settle(30);
  assert.equal(p.fighter.combat.attack, null, 'a tap: nothing');
  p = await padFighter(ONE, { profileFor });
  const frames = Math.ceil(HOLD_THRESHOLD / (1000 / 60 / 1000)) + 2;
  p.press(['select'], { hold: frames });
  assert.equal(p.fighter.combat.attack?.def.id, 'attack3', 'held: Maximum Blue');
  // The Shield, held on the D-pad's down; L1 now nothing.
  p = await padFighter(ONE, { profileFor });
  p.press(['dpadDown'], { hold: 20 });
  assert.equal(p.fighter.combat.shielding, true);
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.shielding, false);
  p.press(['l1'], { hold: 20 });
  assert.equal(p.fighter.combat.shielding, false, 'L1 is free now');
  // #0002 keeps its own layout: independent.
  const q = await padFighter(TWO, { profileFor });
  assert.equal(q.press(['east']).attack, 'attack3', '#0002: Circle is still its Spin Attack');
  // A Shield press never cuts that attack short: once it has played out.
  q.settle(60);
  assert.equal(q.press(['l1'], { hold: 10 }).shield, true, '#0002: L1 still its Shield');
});

test('every universal action can be moved, and the game then answers the new input only', async () => {
  const custom = {
    jump: b('east', { activation: 'continuous' }),
    dash: b('l2'),
    shield: b('r1', { activation: 'continuous' }),
    deflect: b('r2'),
    fastFall: flick('down', { activation: 'continuous' }),
    pause: b('select'),
    'ground:attack3': b('south'), 'ground:attack2': b('dpadUp'), 'ground:attack4': b('dpadLeft'), 'ground:attack5': b('dpadRight'),
    'air:attack3': b('south'), 'air:attack2': b('dpadUp'),
  };
  const profileFor = customFor(ONE, custom);
  let p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['south']).attack, 'attack3', 'Cross is Maximum Blue now, no jump');
  assert.equal(p.fighter.body.grounded, true);
  p = await padFighter(ONE, { profileFor });
  p.press(['east']);
  assert.equal(p.fighter.body.grounded, false, 'Circle jumps');
  p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['l2']).dash, 1, 'L2 Dashes');
  p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['r1']).dash, 0, 'R1 no longer does');
  assert.equal(p.press(['r1'], { hold: 10 }).shield, true, 'R1 held is the Shield');
  p = await padFighter(ONE, { profileFor });
  p.press(['east']);
  for (let i = 0; i < 6; i++) p.frame();
  assert.equal(p.press(['r2']).attack, 'deflect', 'R2 Deflects in the air');
  // The Fast fall on the right stick: the left stick's down is free.
  p.rightStick(0, 0.9);
  assert.equal(p.sample({ grounded: false, facing: 1, character: ONE }).down, true);
  p.rightStick(0, 0);
  p.stick(0, 0.9);
  assert.equal(p.sample({ grounded: false, facing: 1, character: ONE }).down, false);
  // Pause on Create; Options is nothing now.
  p = await padFighter(ONE, { profileFor });
  const menu = [];
  p.input.onPadMenu((cmd) => menu.push(cmd));
  p.press(['start']);
  assert.deepEqual(menu, []);
  p.press(['select']);
  assert.deepEqual(menu, ['start']);
});

// ---- Menus, devices and fighters ----------------------------------------------------------------

test('menus never leak into play: menu presses resolve nothing, and a button held as play starts is stale until let go', async () => {
  const p = await padFighter(ONE);
  p.input.setGameplayActive(false);
  p.press(['west']);
  p.press(['south']);
  p.push(0.9, 0);
  // Cross still held (it confirmed Resume) as play resumes.
  p.down('south');
  p.poll();
  p.input.setGameplayActive(true);
  for (let i = 0; i < 20; i++) p.frame();
  assert.equal(p.fighter.body.grounded, true, 'no jump from the Resume press');
  assert.equal(p.fighter.combat.attack, null, 'nothing from the menu');
  p.up('south');
  p.frame();
  p.press(['south']);
  assert.equal(p.fighter.body.grounded, false, 'a fresh press jumps');
});

test('a lost controller lets go of everything at once: no endless run, no stuck Shield, no Dash; another controller can take over', async () => {
  const pads = [fakePad(), fakePad({ id: PAD_IDS.xboxSeries, index: 1 })];
  const p = await padFighter(ONE, { pads });
  p.stick(0.9, 0);
  p.down('l1');
  for (let i = 0; i < 5; i++) p.frame();
  assert.equal(p.fighter.combat.shielding, true);
  pads.splice(0, 1); // Player 1's controller is gone: the Xbox pad takes over
  const f = p.frame();
  assert.equal(f.combat.shielding, false);
  const snapshot = p.sample({ grounded: true, facing: 1, character: ONE });
  assert.equal(snapshot.runRight || snapshot.shield || snapshot.mouvementRightPressed, false);
  assert.equal(p.controllers.player1.family, 'xbox');
  // The new Player 1 controller plays.
  assert.equal(p.press(['west']).attack, 'attack1');
  // None at all: keyboard stays (nothing thrown).
  pads.length = 0;
  p.frame();
  assert.equal(p.controllers.status, 'disconnected');
});

test('a fighter change switches layouts at once, nothing carried over: a press made for the last fighter never fires for the next', async () => {
  const rig = await controllerRig();
  const ground = (character) => ({ grounded: true, facing: 1, character });
  rig.sample(ground(ONE));
  // R2 on the ground: #0001's Red...
  rig.press('r2');
  assert.equal(rig.sample(ground(ONE)).attack2Pressed, true);
  rig.press('r2', false);
  rig.sample(ground(ONE));
  // ...Square pressed for #0001, the fighter changed before it is read.
  rig.press('west');
  let f = rig.sample(ground(TWO));
  assert.equal(f.attack1Pressed, false, 'the old fighter\'s press is gone');
  assert.equal(f.attack1, false, 'and the held Square is stale');
  rig.press('west', false);
  rig.sample(ground(TWO));
  // #0002's own layout from now on: R2 on the ground is its Whirlwind.
  rig.press('r2');
  f = rig.sample(ground(TWO));
  assert.equal(f.extra_attackPressed, true);
  assert.equal(f.attack2Pressed, false);
  assert.equal(f.pressedOnGround, true);
  // A right stick pushed for one fighter is stale for the next.
  rig.press('r2', false);
  rig.sample(ground(ONE));
  rig.rightStick(0.9, 0);
  rig.sample(ground(TWO));
  rig.poll();
  f = rig.sample(ground(ONE));
  assert.equal(f.attack5Pressed, false, 'pushed while #0002 played: no Hollow Purple');
});

test('Watch Mode and every menu: with play off, the controller sends nothing to any fighter', async () => {
  const rig = await controllerRig({ gameplay: false });
  for (const button of ['west', 'south', 'east', 'l1', 'r1']) {
    rig.press(button);
    const f = rig.sample({ grounded: true, facing: 1, character: ONE });
    assert.equal(Object.values(f).some((v) => v === true), false, button);
    rig.press(button, false);
  }
  rig.stick(0.9, 0.9);
  rig.rightStick(0, -0.9);
  assert.equal(rig.sample().runRight, false);
  assert.equal(Object.values(rig.sample({ grounded: false, facing: 1, character: TWO })).some((v) => v === true), false, 'no stick input either');
});
