// Run with node --test tests/systems/controller-input.test.mjs (no dependencies).
// The controller in play: Player 1's pad resolved through each fighter's
// own layout into the same control codenames a keyboard sends, on real
// Fighters (the combat engine still decides every move). The universal
// controls; every #0001 and #0002 default; combinations (modifier first,
// same-sample, never retroactive, never leaking into the Shield); stick
// directions at the deadzone boundaries and on diagonals; a ground press
// never coming out in the air; custom single, combination, directional,
// hold-to-activate and continuous bindings; menus never leaking into play;
// a lost controller letting go of everything; and a fighter change
// switching layouts with nothing carried over. Mocked pads only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter } from '../../js/data/characters.js';
import { resolveProfile, HOLD_THRESHOLD } from '../../js/data/controller-profiles.js';
import {
  stickDirection, directionMet, directionHeld, RUN_THRESHOLD, DIRECTION_DEADZONE, DASH_AIM_THRESHOLD,
} from '../../js/core/controller-resolver.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { DT, SIM_CTX, STAGE, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { controllerRig, fakePad, setButton, PAD_IDS } from '../helpers/fake-gamepad.mjs';

const ONE = getCharacter('0001');
const TWO = getCharacter('0002');
const b = (button, { modifier = null, direction = null, activation = 'press' } = {}) => ({ button, modifier, direction, activation });

// A real Fighter of `character` played by Player 1's controller: frame()
// is one animation frame (a poll) and one simulation step, as the game
// loop runs them.
async function padFighter(character, { x = 900, facing = 1, profileFor, pads } = {}) {
  const rig = await controllerRig({ ...(profileFor ? { profileFor } : {}), ...(pads ? { pads } : {}) });
  const fighter = new Fighter({
    def: character, sprites: fakeSpritesOf(character), stage: STAGE, slot: 0, label: 'P1',
    controller: new PlayerController(rig.input, { combatAssist: false }), spawn: { x, facing },
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
  return { ...rig, fighter, frame, settle, press, airborne, down, up };
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

test('L1 / LB Dashes the way the stick points, else the way the fighter faces; in the air it is the air dash; held, it never repeats', async () => {
  for (const [x, facing, want] of [[0.9, 1, 1], [-0.9, 1, -1], [0, 1, 1], [0, -1, -1], [DASH_AIM_THRESHOLD + 0.05, -1, 1], [DASH_AIM_THRESHOLD - 0.05, -1, -1]]) {
    const p = await padFighter(ONE, { facing });
    p.stick(x, 0);
    const started = p.press(['l1']);
    assert.equal(started.dash, want, `stick ${x}, facing ${facing}`);
    assert.equal(p.fighter.dash.air, false);
  }
  const p = await padFighter(ONE);
  p.airborne();
  p.stick(-0.9, 0);
  p.press(['l1']);
  assert.equal(p.fighter.dash?.air, true, 'the air dash');
  assert.equal(p.fighter.dash.direction, -1);
  // Held: one Dash per press, however long.
  const r = await padFighter(ONE);
  r.down('l1');
  let last = r.frame().dash;
  assert.ok(last);
  let dashes = 0;
  for (let i = 0; i < 90; i++) {
    const dash = r.frame().dash;
    if (dash && dash !== last) dashes++;
    last = dash;
  }
  assert.equal(dashes, 0, 'nothing repeats while nothing new is pressed');
});

test('Circle / B held is the Shield on the ground, let go it drops; in the air a fresh press is the Deflect, never repeated by holding', async () => {
  const p = await padFighter(ONE);
  assert.equal(p.press(['east'], { hold: 30 }).shield, true);
  assert.equal(p.fighter.combat.shielding, true, 'up while held');
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.shielding, false, 'down once let go');
  // The Shield never toggles: a tap is a tap.
  p.settle(20);
  p.press(['east']);
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.shielding, false);
  // In the air.
  const q = await padFighter(ONE);
  q.airborne();
  q.down('east');
  assert.equal(q.frame().combat.attack?.def.id, 'deflect');
  const first = q.fighter.combat.attack;
  let again = 0;
  for (let i = 0; i < 40; i++) {
    const atk = q.frame().combat.attack;
    if (atk && atk !== first && atk.def.id === 'deflect') again++;
  }
  assert.equal(again, 0, 'holding never Deflects again');
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

test('#0001 on the ground: Square Jab, Triangle High Kick, R2 + Square Red, R2 + Circle Maximum Blue, L2 + Triangle Unlimited Void, R2 + Triangle Hollow Purple', async () => {
  for (const [buttons, move] of [
    [['west'], 'attack1'], [['north'], 'extra_attack'], [['r2', 'west'], 'attack2'], [['r2', 'east'], 'attack3'],
  ]) {
    const p = await padFighter(ONE);
    assert.equal(p.press(buttons).attack, move, buttons.join(' + '));
  }
  for (const [buttons, technique] of [[['l2', 'north'], 'attack4'], [['r2', 'north'], 'attack5']]) {
    const p = await padFighter(ONE);
    p.press(buttons);
    assert.equal(p.fighter.technique?.action, technique, `${buttons.join(' + ')}: the technique on ${technique}`);
    assert.notEqual(p.fighter.combat.attack?.def.id, 'extra_attack', 'never the High Kick');
  }
});

test('#0001 in the air: Square Floating Straight, Triangle Red Kick, R1 Blue, L2 + Square High Kick, Circle Deflect; R2 + Circle nothing', async () => {
  for (const [buttons, move] of [
    [['west'], 'midair_attack1'], [['north'], 'midair_attack2'], [['r1'], 'midair_attack3'],
    [['l2', 'west'], 'extra_attack'], [['east'], 'deflect'], [['r2', 'east'], null], [['r2', 'west'], null],
  ]) {
    const p = await padFighter(ONE);
    p.airborne();
    assert.equal(p.press(buttons).attack, move, buttons.join(' + '));
  }
});

test('R2 + Circle is Maximum Blue, never the Shield: not raised, not buffered, not raised when R2 is let go; Circle first stays the Shield', async () => {
  const p = await padFighter(ONE);
  p.down('r2');
  p.frame();
  p.down('east');
  p.frame();
  assert.equal(p.fighter.combat.attack?.def.id, 'attack3');
  assert.equal(p.fighter.combat.shielding, false);
  p.up('r2'); // R2 let go, Circle still held
  for (let i = 0; i < 60; i++) {
    p.frame();
    assert.equal(p.fighter.combat.shielding, false, 'the combination\'s Circle never raises the Shield');
  }
  p.up('east');
  p.frame();
  // Pressed again: now the Shield.
  p.press(['east'], { hold: 5 });
  assert.equal(p.fighter.combat.shielding, true);
  // Circle first, then R2: the Shield stays, no Maximum Blue.
  const q = await padFighter(ONE);
  q.down('east');
  for (let i = 0; i < 3; i++) q.frame();
  q.down('r2');
  for (let i = 0; i < 20; i++) q.frame();
  assert.equal(q.fighter.combat.shielding, true);
  assert.equal(q.fighter.combat.attack, null);
  assert.equal(q.fighter.bufferedAttack, null, 'nothing kept for later either');
});

test('combinations are modifier first, read in the same sample, never read back into an earlier press, and nothing repeats or comes from a release', async () => {
  // Same sample: R2 and Square together are Red.
  let p = await padFighter(ONE);
  assert.equal(p.press(['r2', 'west']).attack, 'attack2');
  // Square, then R2: the Jab, and nothing after.
  p = await padFighter(ONE);
  p.down('west');
  p.frame();
  assert.equal(p.fighter.combat.attack?.def.id, 'attack1');
  p.down('r2');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(p.frame().combat.attack?.def.id ?? null);
  assert.ok(!seen.has('attack2'), 'never Red after the fact');
  // Letting go of a modifier is no press.
  p = await padFighter(ONE);
  p.press(['r2'], { hold: 10 });
  p.frame();
  assert.equal(p.fighter.combat.attack, null);
  // A modifier let go before the button: the plain button.
  p = await padFighter(ONE);
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

test('#0002 on the ground: Square One-Two, Triangle Rapid Kicks, R1 Spin Attack, R2 + Triangle Whirlwind', async () => {
  for (const [buttons, move] of [[['west'], 'attack1'], [['north'], 'attack2'], [['r1'], 'attack3'], [['r2', 'north'], 'extra_attack']]) {
    const p = await padFighter(TWO);
    assert.equal(p.press(buttons).attack, move, buttons.join(' + '));
  }
});

test('#0002 in the air: R1 Blue Tornado (the Spin Attack\'s button, never both), Square Homing Attack any way but down, Down + Square Bounce Attack', async () => {
  let p = await padFighter(TWO);
  p.airborne();
  assert.equal(p.press(['r1']).attack, 'midair_attack3');
  // Left, right or neutral: Homing, starting the way the stick points (or
  // the fighter faces).
  for (const [x, y, facing, want] of [[-0.9, 0, 1, -1], [0.9, 0.2, -1, 1], [0, 0, 1, 1], [0, 0, -1, -1], [-0.9, -0.5, 1, -1]]) {
    p = await padFighter(TWO, { facing });
    p.airborne();
    p.stick(x, y);
    const started = p.press(['west']);
    assert.equal(started.attack, 'midair_attack1', `stick ${x}, ${y}`);
    assert.equal(p.fighter.facing, want, `starts toward ${want}`);
  }
  // Down: Bounce, never Homing, and no separate fast fall on that step.
  for (const [x, y] of [[0, 0.9], [0.6, 0.6], [-0.5, 0.7]]) {
    p = await padFighter(TWO);
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

// ---- Directions -------------------------------------------------------------------------------

test('directions: a deadzone, a dominant axis (exact diagonals read vertical), and thresholds that hold at their boundaries', () => {
  assert.equal(DIRECTION_DEADZONE, 0.5);
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
  assert.equal(directionHeld('down', 0, RUN_THRESHOLD + 0.01), true, 'the fast fall: past the run threshold');
  assert.equal(directionHeld('down', 0, RUN_THRESHOLD - 0.01), false);
  assert.equal(directionHeld('down', 0.9, 0.5), true, 'a fall held on a diagonal too');
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

test('custom bindings: a single button, a combination, a direction, hold-to-activate and a continuous Shield on another button', async () => {
  const custom = {
    'ground:attack1': b('r1'), // single button
    'ground:attack2': b('west', { modifier: 'l1' }), // two buttons (L1 also Dashes: allowed, with a warning)
    'ground:extra_attack': b('north', { direction: 'up' }), // directional
    'ground:attack3': b('r3', { activation: 'hold' }), // hold to activate
    shield: b('l2', { activation: 'continuous' }), // continuous, elsewhere
    jump: b('north', { activation: 'continuous' }),
  };
  const profileFor = (def) => resolveProfile(def, def?.id === '0001' ? custom : null);
  let p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['r1']).attack, 'attack1', 'R1: the Jab');
  p = await padFighter(ONE, { profileFor });
  assert.equal(p.press(['west']).attack, null, 'Square alone: nothing now');
  p = await padFighter(ONE, { profileFor });
  p.stick(0, -0.9);
  assert.equal(p.press(['north']).attack, 'extra_attack', 'Up + Triangle: the High Kick');
  p = await padFighter(ONE, { profileFor });
  p.stick(0, 0);
  assert.equal(p.press(['north']).attack, null, 'Triangle alone is now Jump');
  assert.equal(p.fighter.body.grounded, false);
  // Hold to activate: a tap does nothing; held past the threshold, once.
  p = await padFighter(ONE, { profileFor });
  p.press(['r3'], { hold: 2 });
  p.settle(30);
  assert.equal(p.fighter.combat.attack, null, 'a tap: nothing');
  p = await padFighter(ONE, { profileFor });
  const frames = Math.ceil(HOLD_THRESHOLD / (1000 / 60 / 1000)) + 2;
  p.press(['r3'], { hold: frames });
  assert.equal(p.fighter.combat.attack?.def.id, 'attack3', 'held: Maximum Blue');
  // The Shield, held on L2.
  p = await padFighter(ONE, { profileFor });
  p.press(['l2'], { hold: 20 });
  assert.equal(p.fighter.combat.shielding, true);
  p.frame();
  p.frame();
  assert.equal(p.fighter.combat.shielding, false);
  // #0002 keeps its own layout: independent.
  const q = await padFighter(TWO, { profileFor });
  assert.equal(q.press(['r1']).attack, 'attack3', '#0002: R1 is still its Spin Attack');
});

// ---- Menus, devices and fighters ----------------------------------------------------------------

test('menus never leak into play: menu presses resolve nothing, and a button held as play starts is stale until let go', async () => {
  const p = await padFighter(ONE);
  p.input.setGameplayActive(false);
  p.press(['west']);
  p.press(['south']);
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
  p.down('east');
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
  // R1 on the ground: nothing for #0001 (Blue is air-only)...
  rig.press('r1');
  assert.equal(rig.sample(ground(ONE)).attack3Pressed, false);
  rig.press('r1', false);
  rig.sample(ground(ONE));
  // ...Square pressed for #0001, the fighter changed before it is read.
  rig.press('west');
  let f = rig.sample(ground(TWO));
  assert.equal(f.attack1Pressed, false, 'the old fighter\'s press is gone');
  assert.equal(f.attack1, false, 'and the held Square is stale');
  rig.press('west', false);
  rig.sample(ground(TWO));
  // #0002's own layout from now on: R1 on the ground is its Spin Attack.
  rig.press('r1');
  f = rig.sample(ground(TWO));
  assert.equal(f.attack3Pressed, true);
  assert.equal(f.pressedOnGround, true);
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
  assert.equal(rig.sample().runRight, false);
});
