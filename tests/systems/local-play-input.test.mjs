// Run with node --test tests/systems/local-play-input.test.mjs (no dependencies).
// Local Play's two controllers (js/core/controller-manager.js,
// js/core/input-manager.js): Player 2's controller (the next active one
// that is not Player 1's), what Home's Local play needs (two supported,
// active, distinct controllers; two of the same model count as two), a
// session keeping both players on their own controller (a third or a
// fourth never taking a seat, a lost controller waited for and recognized
// when it comes back, an explicit reassignment), and two independent input
// pipelines on real Fighters: each player's own buttons, sticks, presses,
// profile and stale state, never merged, the keyboard and touch playing no
// Local Play fighter, either Pause once a frame, and the menus listening to
// the controller that owns them. Mocked pads only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter } from '../../js/data/characters.js';
import { resolveProfile } from '../../js/data/controller-profiles.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { DT, SIM_CTX, STAGE, fakeSpritesOf } from '../helpers/fighter-harness.mjs';
import { fakePad, setButton, padSource, stubWindow, PAD_IDS } from '../helpers/fake-gamepad.mjs';
import { CONFIG } from '../../js/config.js';

const ONE = getCharacter('0001');
const TWO = getCharacter('0002');

const { ControllerManager, MAX_CONTROLLERS } = await import('../../js/core/controller-manager.js');
const { InputManager } = await import('../../js/core/input-manager.js');

const manager = (pads, api) => new ControllerManager({ source: padSource(pads, api), target: null });

// A real ControllerManager and InputManager over `pads` with Local Play on
// (a session started), `poll()` one animation frame, `menus` the menu
// commands heard ([command, player]) and `pauses` the 'start' commands.
function localRig({ pads = [fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries })], profileFor = null } = {}) {
  const listeners = stubWindow();
  const controllers = manager(pads);
  const input = new InputManager(CONFIG.bindings, { controllers, ...(profileFor ? { profileFor } : {}) });
  const menus = [];
  input.onPadMenu((command, slot) => menus.push([command, slot]));
  assert.equal(controllers.startLocal(), true, 'a session on the two controllers');
  input.setLocalPlay(true);
  let now = 0;
  const poll = () => {
    now += 1000 / 60;
    input.pollGamepads(now);
  };
  poll();
  return { listeners, controllers, input, pads, poll, menus };
}

// Both players' real Fighters, each played by their own controller
// channel; frame() is one poll and one step of each.
function duel(rig, { p1 = ONE, p2 = TWO } = {}) {
  const make = (def, slot, x, facing) => new Fighter({
    def, sprites: fakeSpritesOf(def), stage: STAGE, slot, label: slot.toUpperCase(),
    controller: new PlayerController(rig.input.player(slot)), spawn: { x, facing },
  });
  const a = make(p1, 'p1', 700, 1);
  const b = make(p2, 'p2', 1100, -1);
  rig.input.setGameplayActive(true);
  const frame = () => {
    rig.poll();
    a.update(DT, SIM_CTX);
    b.update(DT, SIM_CTX);
  };
  for (let i = 0; i < 40; i++) frame();
  return { a, b, frame, settle: (n = 60) => { for (let i = 0; i < n; i++) frame(); } };
}

// ---- Assignment ---------------------------------------------------------------------

test('Player 2 is the next active supported controller that is not Player 1\'s; Local Play needs two of them', () => {
  const none = manager([]);
  assert.equal(none.localReady, false, 'no controller');
  const one = manager([fakePad()]);
  assert.equal(one.player2, null);
  assert.equal(one.localReady, false, 'one controller');
  // An unsupported device never counts.
  const withSwitch = manager([fakePad(), fakePad({ index: 1, id: PAD_IDS.switchPro })]);
  assert.equal(withSwitch.player2, null);
  assert.equal(withSwitch.localReady, false, 'a Nintendo pad is not a second controller');
  const generic = manager([fakePad({ id: PAD_IDS.generic }), fakePad({ index: 1 })]);
  assert.equal(generic.localReady, false, 'nor is an unidentified pad');
  const two = manager([fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries })]);
  assert.equal(two.localReady, true);
  assert.equal(two.player1.family, 'playstation');
  assert.equal(two.player2.family, 'xbox');
  assert.deepEqual(two.list.map((d) => [d.player1, d.player2]), [[true, false], [false, true]]);
  // Two of the same model are two devices.
  const twins = manager([fakePad(), fakePad({ index: 1 })]);
  assert.equal(twins.localReady, true);
  assert.notEqual(twins.player1.key, twins.player2.key);
  assert.equal(twins.player1.id, twins.player2.id);
  // Without the Gamepad API working, never.
  assert.equal(manager([fakePad(), fakePad({ index: 1 })], 'blocked').localReady, false);
});

test('more than two controllers: Player 1\'s chosen one is kept, Player 2 is the next, the four-controller limit and its warning stay', () => {
  const pads = [0, 1, 2, 3, 4].map((index) => fakePad({ index, id: index % 2 ? PAD_IDS.xboxSeries : PAD_IDS.dualsense }));
  const m = manager(pads);
  assert.equal(m.status, 'tooMany');
  assert.equal(m.list.filter((d) => d.active).length, MAX_CONTROLLERS);
  assert.equal(m.localReady, true, 'any two of the active ones');
  assert.equal(m.assignPlayer1('2:' + PAD_IDS.dualsense), true);
  assert.equal(m.player1.index, 2, 'the chosen Player 1');
  assert.equal(m.player2.index, 0, 'Player 2: the first other active controller');
  // The fifth, inactive, is never Player 2.
  assert.equal(m.list.find((d) => d.index === 4).player2, false);
});

// ---- The session ----------------------------------------------------------------

test('a session keeps each player on their own controller: a newly connected one never takes a seat', () => {
  const pads = [fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries })];
  const m = manager(pads);
  assert.equal(m.startLocal(), true);
  const [p1, p2] = [m.player1.key, m.player2.key];
  pads.unshift(fakePad({ index: 2, id: PAD_IDS.xboxOne }));
  m.refresh();
  assert.equal(m.player1.key, p1);
  assert.equal(m.player2.key, p2);
  assert.deepEqual(m.missingPlayers(), []);
  assert.deepEqual(m.spareControllers.map((d) => d.index), [2], 'the third is spare');
  m.endLocal();
  assert.equal(m.inLocal, false);
  assert.equal(m.startLocal.call(manager([fakePad()])), false, 'never on one controller');
});

test('a lost controller leaves its seat empty (no other controller takes it), and the same controller gets it back', () => {
  const ds = fakePad();
  const xb = fakePad({ index: 1, id: PAD_IDS.xboxSeries });
  const spare = fakePad({ index: 2, id: PAD_IDS.xboxOne });
  const pads = [ds, xb, spare];
  const m = manager(pads);
  m.startLocal();
  assert.equal(m.player2.index, 1);
  pads.splice(1, 1);
  m.refresh();
  assert.deepEqual(m.missingPlayers(), ['p2']);
  assert.equal(m.player2, null, 'Player 2 has no controller: the spare is not given it');
  assert.equal(m.player1.index, 0, 'Player 1 keeps theirs');
  // Back on another index (a new key), with the same id: recognized.
  pads.push(fakePad({ index: 3, id: PAD_IDS.xboxSeries }));
  m.refresh();
  assert.deepEqual(m.missingPlayers(), []);
  assert.equal(m.player2.index, 3);
  // Player 1 lost: never replaced by Player 2's controller or the spare.
  pads.splice(0, 1);
  m.refresh();
  assert.deepEqual(m.missingPlayers(), ['p1']);
  assert.equal(m.player1, null);
  assert.equal(m.player2.index, 3);
  pads.unshift(fakePad());
  m.refresh();
  assert.equal(m.player1.index, 0);
  assert.deepEqual(m.missingPlayers(), []);
});

test('two identical controllers: a lost one is not confused with the other, nor with an identical one already connected', () => {
  const a = fakePad();
  const b = fakePad({ index: 1 });
  const c = fakePad({ index: 2 });
  const pads = [a, b, c];
  const m = manager(pads);
  m.startLocal();
  assert.deepEqual([m.player1.index, m.player2.index], [0, 1]);
  pads.splice(1, 1);
  m.refresh();
  assert.deepEqual(m.missingPlayers(), ['p2']);
  assert.equal(m.player2, null, 'the third DualSense, connected before, never takes the seat by itself');
  pads.splice(1, 0, fakePad({ index: 1 }));
  m.refresh();
  assert.equal(m.player2.index, 1, 'the same controller back');
});

test('another controller takes a lost seat only explicitly, and never the other player\'s', () => {
  const pads = [fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries }), fakePad({ index: 2, id: PAD_IDS.xboxOne })];
  const m = manager(pads);
  m.startLocal();
  pads.splice(1, 1);
  m.refresh();
  assert.equal(m.assignLocal('p2', m.player1.key), false, 'one controller never plays both');
  assert.equal(m.assignLocal('p2', '2:' + PAD_IDS.xboxOne), true);
  assert.equal(m.player2.index, 2);
  assert.deepEqual(m.missingPlayers(), []);
  // Player 1's controller choice in a session never takes Player 2's.
  assert.equal(m.assignPlayer1(m.player2.key), false);
  m.endLocal();
  assert.equal(m.assignLocal('p2', m.player1.key), false, 'only in a session');
});

// ---- Two input pipelines ---------------------------------------------------------------

test('each player plays their own fighter: a jump on one controller never makes the other jump', () => {
  const rig = localRig();
  const { a, b, frame, settle } = duel(rig);
  assert.equal(a.body.grounded && b.body.grounded, true);
  setButton(rig.pads[0], 'south', true);
  frame();
  setButton(rig.pads[0], 'south', false);
  for (let i = 0; i < 6; i++) frame();
  assert.equal(a.body.grounded, false, 'Player 1 jumps');
  assert.equal(b.body.grounded, true, 'Player 2 does not');
  settle();
  setButton(rig.pads[1], 'south', true);
  frame();
  setButton(rig.pads[1], 'south', false);
  for (let i = 0; i < 6; i++) frame();
  assert.equal(b.body.grounded, false, 'Player 2 jumps');
  assert.equal(a.body.grounded, true, 'Player 1 does not');
});

test('both players move at once, each with their own stick, and their directions never mix', () => {
  const rig = localRig();
  const { a, b, frame } = duel(rig);
  const [ax, bx] = [a.body.x, b.body.x];
  rig.pads[0].axes = [1, 0, 0, 0];
  rig.pads[1].axes = [-1, 0, 0, 0];
  for (let i = 0; i < 20; i++) frame();
  assert.ok(a.body.x > ax + 20, 'Player 1 runs right');
  assert.ok(b.body.x < bx - 20, 'Player 2 runs left');
  rig.pads[0].axes = [0, 0, 0, 0];
  rig.pads[1].axes = [0, 0, 0, 0];
});

test('both players attack on the same frame, each with their own fighter\'s layout, and both attacks start', () => {
  const rig = localRig();
  const { a, b, frame } = duel(rig);
  setButton(rig.pads[0], 'west', true);
  setButton(rig.pads[1], 'west', true);
  frame();
  assert.ok(a.combat.attack, 'Player 1 attacks');
  assert.ok(b.combat.attack, 'Player 2 attacks');
  // Each the move its own fighter's Square makes.
  assert.equal(a.combat.attack.def.id, a.attackFor(pressedAction(ONE)));
  assert.equal(b.combat.attack.def.id, b.attackFor(pressedAction(TWO)));
  assert.ok(Object.hasOwn(a.attacks, a.combat.attack.def.id) && Object.hasOwn(b.attacks, b.combat.attack.def.id));
  setButton(rig.pads[0], 'west', false);
  setButton(rig.pads[1], 'west', false);
});

// The combat button Square makes on the ground for `def` (its recommended
// layout).
function pressedAction(def) {
  const profile = resolveProfile(def);
  const entry = Object.entries(profile.bindings).find(([id, binding]) => id.startsWith('ground:') && binding?.button === 'west' && !binding.modifier);
  return entry?.[0].slice('ground:'.length) ?? null;
}

test('each player\'s layout is their own fighter\'s, saved layouts included; the same fighter shares a layout but never a press', () => {
  // Player 2's fighter (#0002) has a saved layout: R3 + L1 for its Attack 3.
  const saved = { 'ground:attack3': { button: 'l1', modifier: 'r3', stick: null, direction: null, activation: 'press' } };
  const custom = (def) => resolveProfile(def, def?.id === TWO.id ? saved : null);
  const rig = localRig({ profileFor: custom });
  const { a, b, frame, settle } = duel(rig);
  setButton(rig.pads[1], 'r3', true);
  setButton(rig.pads[1], 'l1', true);
  frame();
  assert.equal(b.combat.attack?.def.id, b.attackFor('attack3'), 'Player 2\'s own saved layout');
  assert.equal(a.combat.attack, null, 'nothing for Player 1');
  setButton(rig.pads[1], 'r3', false);
  setButton(rig.pads[1], 'l1', false);
  settle(120);
  // The same buttons on Player 1's controller follow #0001's recommended
  // layout: L1 is its Shield, never #0002's Attack 3.
  setButton(rig.pads[0], 'r3', true);
  setButton(rig.pads[0], 'l1', true);
  frame();
  assert.notEqual(a.combat.attack?.def.id ?? null, a.attackFor('attack3'));
  setButton(rig.pads[0], 'r3', false);
  setButton(rig.pads[0], 'l1', false);
  // A mirror match: both #0001, one compiled profile, two resolvers.
  const mirror = localRig();
  const twin = duel(mirror, { p1: ONE, p2: ONE });
  assert.equal(mirror.input.channels.p1.resolver.compiled, mirror.input.channels.p2.resolver.compiled);
  assert.notEqual(mirror.input.channels.p1.resolver, mirror.input.channels.p2.resolver);
  setButton(mirror.pads[1], 'south', true);
  twin.frame();
  setButton(mirror.pads[1], 'south', false);
  for (let i = 0; i < 6; i++) twin.frame();
  assert.equal(twin.b.body.grounded, false);
  assert.equal(twin.a.body.grounded, true, 'the twin stays put');
});

test('a PlayStation and an Xbox controller play together, as do two of the same model', () => {
  for (const pads of [
    [fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries })],
    [fakePad({ id: PAD_IDS.xboxOne }), fakePad({ index: 1, id: PAD_IDS.xboxOne })],
    [fakePad(), fakePad({ index: 1 })],
  ]) {
    const rig = localRig({ pads });
    const { a, b, frame } = duel(rig);
    setButton(rig.pads[1], 'south', true);
    frame();
    setButton(rig.pads[1], 'south', false);
    for (let i = 0; i < 6; i++) frame();
    assert.deepEqual([a.body.grounded, b.body.grounded], [true, false], pads.map((p) => p.id).join(' + '));
  }
});

test('the keyboard and touch play no Local Play fighter', () => {
  const rig = localRig();
  const { a, b, frame } = duel(rig);
  const [ax, bx] = [a.body.x, b.body.x];
  const key = (type, code) => { for (const fn of rig.listeners[type] ?? []) fn({ code, repeat: false, preventDefault() {} }); };
  key('keydown', 'KeyD');
  key('keydown', 'KeyW');
  rig.input.setTouch('runRight', true);
  rig.input.setTouch('jump', true);
  rig.input.queueTouchMouvement(1);
  for (let i = 0; i < 20; i++) frame();
  assert.equal(a.body.x, ax);
  assert.equal(b.body.x, bx);
  assert.equal(a.body.grounded && b.body.grounded, true);
  key('keyup', 'KeyD');
  key('keyup', 'KeyW');
});

test('either player\'s Pause asks for the pause menu, once a frame however many press it', () => {
  const rig = localRig();
  duel(rig);
  rig.menus.length = 0;
  setButton(rig.pads[1], 'start', true);
  rig.poll();
  setButton(rig.pads[1], 'start', false);
  rig.poll();
  assert.deepEqual(rig.menus, [['start', 'p2']], 'Player 2 pauses');
  rig.menus.length = 0;
  setButton(rig.pads[0], 'start', true);
  setButton(rig.pads[1], 'start', true);
  rig.poll();
  assert.deepEqual(rig.menus, [['start', 'p1']], 'together: one request');
});

test('a held button never comes out after a pause, a lost focus or a reconnection', () => {
  const rig = localRig();
  const { a, b, frame } = duel(rig);
  // Held through a menu: stale when play comes back.
  rig.input.setGameplayActive(false);
  setButton(rig.pads[0], 'south', true);
  setButton(rig.pads[1], 'west', true);
  rig.poll();
  rig.input.setGameplayActive(true);
  for (let i = 0; i < 6; i++) frame();
  assert.equal(a.body.grounded, true, 'no jump from a menu press');
  assert.equal(b.combat.attack, null, 'no attack from a menu press');
  setButton(rig.pads[0], 'south', false);
  setButton(rig.pads[1], 'west', false);
  frame();
  // Focus lost and back while held.
  setButton(rig.pads[1], 'south', true);
  for (const fn of rig.listeners.blur ?? []) fn();
  rig.poll();
  for (const fn of rig.listeners.focus ?? []) fn();
  for (let i = 0; i < 6; i++) frame();
  assert.equal(b.body.grounded, true, 'nothing held across a lost focus');
  setButton(rig.pads[1], 'south', false);
  frame();
  // Player 2's controller lost and back with a button held: no attack.
  const xb = rig.pads.splice(1, 1)[0];
  frame();
  assert.deepEqual(rig.controllers.missingPlayers(), ['p2']);
  setButton(xb, 'west', true);
  rig.pads.push(xb);
  for (let i = 0; i < 6; i++) frame();
  assert.deepEqual(rig.controllers.missingPlayers(), []);
  assert.equal(b.combat.attack, null, 'a button held as it comes back is no press');
  setButton(xb, 'west', false);
  frame();
  setButton(xb, 'west', true);
  frame();
  assert.ok(b.combat.attack, 'a fresh press after it is');
});

// ---- Menus ---------------------------------------------------------------------------

test('menus listen to the controller that owns them, and each command says whose it was', () => {
  const rig = localRig();
  rig.input.setGameplayActive(false);
  rig.menus.length = 0;
  const tap = (pad, button) => {
    setButton(pad, button, true);
    rig.poll();
    setButton(pad, button, false);
    rig.poll();
  };
  tap(rig.pads[1], 'south');
  assert.deepEqual(rig.menus, [], 'Player 1\'s menus: Player 2\'s Cross does nothing');
  tap(rig.pads[0], 'south');
  assert.deepEqual(rig.menus, [['confirm', 'p1']]);
  rig.menus.length = 0;
  rig.input.setMenuOwner('p2');
  tap(rig.pads[0], 'east');
  tap(rig.pads[0], 'dpadDown');
  assert.deepEqual(rig.menus, [], 'Player 2\'s step: Player 1\'s controller is ignored');
  tap(rig.pads[1], 'dpadDown');
  tap(rig.pads[1], 'east');
  assert.deepEqual(rig.menus, [['down', 'p2'], ['back', 'p2']]);
  rig.menus.length = 0;
  rig.input.setMenuOwner('any');
  setButton(rig.pads[0], 'south', true);
  setButton(rig.pads[1], 'south', true);
  rig.poll();
  assert.deepEqual(rig.menus, [['confirm', 'p1']], 'a shared dialog: either, once a frame');
  // Local Play over: Player 1's menus again, Player 2's controller unread.
  setButton(rig.pads[0], 'south', false);
  setButton(rig.pads[1], 'south', false);
  rig.poll();
  rig.input.setLocalPlay(false);
  rig.controllers.endLocal();
  assert.equal(rig.input.menuOwner, 'p1');
  rig.menus.length = 0;
  tap(rig.pads[1], 'south');
  assert.deepEqual(rig.menus, []);
});

test('outside Local Play only Player 1\'s controller is read, as before', () => {
  const listeners = stubWindow();
  const pads = [fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries })];
  const controllers = manager(pads);
  const input = new InputManager(CONFIG.bindings, { controllers });
  assert.ok(listeners);
  const menus = [];
  input.onPadMenu((command, slot) => menus.push([command, slot]));
  let now = 0;
  const poll = () => { now += 16; input.pollGamepads(now); };
  poll();
  setButton(pads[1], 'south', true);
  poll();
  setButton(pads[0], 'south', true);
  poll();
  assert.deepEqual(menus, [['confirm', 'p1']]);
  assert.equal(input.localPlay, false);
  assert.equal(input.channels.p2.active, false, 'Player 2\'s controller is never read');
});
