// Run with node --test tests/systems/controller-devices.test.mjs (no dependencies).
// Controller connections: which devices are PlayStation or Xbox controllers
// (conservatively: never a guess), their buttons' names in each family, and
// the connection manager: zero, one, four and five supported controllers,
// unsupported devices, disconnection and reconnection, Player 1's
// assignment and switching it, a real refresh, no Gamepad API, blocked
// access, a controller exposed only after a press, focus loss and the
// triggers' threshold. Mocked devices only (tests/helpers/fake-gamepad.mjs):
// real hardware still needs a browser check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identifyController, parseVendorProduct, cleanDeviceName, buttonCode, buttonLabelKey, buttonGlyph, PAD_BUTTONS, FAMILIES,
} from '../../js/core/gamepad-devices.js';
import { ControllerManager, MAX_CONTROLLERS, CONTROLLER_STATUSES, TRIGGER_PRESS, TRIGGER_RELEASE } from '../../js/core/controller-manager.js';
import { fakePad, setButton, padSource, PAD_IDS } from '../helpers/fake-gamepad.mjs';

// ---- Identification -----------------------------------------------------------------

test('the supported families are PlayStation and Xbox, read through the standard mapping\'s sixteen buttons', () => {
  assert.deepEqual([...FAMILIES], ['playstation', 'xbox']);
  assert.deepEqual([...PAD_BUTTONS], [
    'south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3',
    'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
  ]);
});

test('DualShock 4, DualSense and Xbox One / Series / XInput pads are identified across browsers\' id strings', () => {
  const cases = [
    [PAD_IDS.dualsense, 'playstation', 'dualsense'],
    [PAD_IDS.dualsenseSafari, 'playstation', 'dualsense'],
    [PAD_IDS.dualshock4, 'playstation', 'dualshock4'],
    [PAD_IDS.dualshock4Firefox, 'playstation', 'dualshock4'],
    ['054c-0ce6-DualSense Wireless Controller', 'playstation', 'dualsense'],
    ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)', 'playstation', 'dualshock4'],
    ['DualSense Edge Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0df2)', 'playstation', 'dualsenseEdge'],
    [PAD_IDS.xboxSeries, 'xbox', 'xboxSeries'],
    [PAD_IDS.xboxOne, 'xbox', 'xboxOne'],
    ['45e-b12-Xbox Wireless Controller', 'xbox', 'xboxSeries'],
    ['Xbox Wireless Controller', 'xbox', 'xbox'],
    [PAD_IDS.xinput, 'xbox', 'xbox'],
    ['Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', 'xbox', 'xbox360'],
    // A Sony / Microsoft pad nothing more is known of keeps its family.
    ['Unknown (STANDARD GAMEPAD Vendor: 054c Product: 1234)', 'playstation', 'playstation'],
    ['Unknown (STANDARD GAMEPAD Vendor: 045e Product: 1234)', 'xbox', 'xbox'],
  ];
  for (const [id, family, model] of cases) {
    const info = identifyController(fakePad({ id }));
    assert.deepEqual(info, { supported: true, family, model, reason: null }, id);
  }
});

test('identification is conservative: Nintendo and generic pads, a bare "Wireless Controller" and a non-standard layout are never given a layout', () => {
  assert.deepEqual(identifyController(fakePad({ id: PAD_IDS.switchPro })), { supported: false, family: null, model: null, reason: 'nintendo' });
  assert.equal(identifyController(fakePad({ id: 'Joy-Con (L)' })).reason, 'nintendo');
  assert.equal(identifyController(fakePad({ id: PAD_IDS.generic })).reason, 'unidentified');
  // Every DualShock 4 on Safari / Firefox is called this, but so are many
  // other pads: no vendor, no family.
  assert.equal(identifyController(fakePad({ id: PAD_IDS.wireless })).reason, 'unidentified');
  assert.equal(identifyController(fakePad({ id: '' })).reason, 'unidentified');
  assert.equal(identifyController({}).reason, 'unidentified');
  // A supported family the browser does not map to the standard layout.
  const odd = identifyController(fakePad({ id: PAD_IDS.dualsense, mapping: '' }));
  assert.deepEqual(odd, { supported: false, family: 'playstation', model: 'dualsense', reason: 'layout' });
  const short = fakePad({ id: PAD_IDS.xboxSeries });
  short.buttons.length = 10;
  assert.equal(identifyController(short).reason, 'layout');
  // A text naming the other family never overrides the vendor id.
  assert.equal(identifyController(fakePad({ id: 'Xbox Pad (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' })).family, 'playstation');
});

test('vendor and product ids and the device name are read from Chrome and Firefox ids', () => {
  assert.deepEqual(parseVendorProduct(PAD_IDS.dualsense), { vendor: 0x054c, product: 0x0ce6 });
  assert.deepEqual(parseVendorProduct(PAD_IDS.dualshock4Firefox), { vendor: 0x054c, product: 0x09cc });
  assert.equal(parseVendorProduct(PAD_IDS.dualsenseSafari), null);
  assert.equal(cleanDeviceName(PAD_IDS.dualsense), 'DualSense Wireless Controller');
  assert.equal(cleanDeviceName(PAD_IDS.dualshock4Firefox), 'Wireless Controller');
  assert.equal(cleanDeviceName(PAD_IDS.xinput), 'Xbox 360 Controller');
});

test('buttons go by position and read in their own family\'s names: Cross / A, Circle / B, Square / X, Triangle / Y, L1 / LB ... Options / Menu', () => {
  const table = {
    south: ['pad.playstation.south', 'A'], east: ['pad.playstation.east', 'B'], west: ['pad.playstation.west', 'X'],
    north: ['pad.playstation.north', 'Y'], l1: ['L1', 'LB'], r1: ['R1', 'RB'], l2: ['L2', 'LT'], r2: ['R2', 'RT'],
    l3: ['L3', 'LS'], r3: ['R3', 'RS'], start: ['Options', 'Menu'],
  };
  for (const [button, [ps, xbox]] of Object.entries(table)) {
    const psName = buttonCode('playstation', button) ?? buttonLabelKey('playstation', button);
    assert.equal(psName, ps, `PlayStation ${button}`);
    assert.equal(buttonCode('xbox', button), xbox, `Xbox ${button}`);
  }
  assert.equal(buttonLabelKey('xbox', 'select'), 'pad.xbox.select', 'View is a word');
  assert.equal(buttonCode('playstation', 'select'), 'Create');
  assert.equal(buttonCode('playstation', 'select', 'dualshock4'), 'Share');
  assert.equal(buttonCode('xbox', 'start', 'xbox360'), 'Start');
  assert.equal(buttonLabelKey('xbox', 'dpadDown'), 'pad.dpadDown');
  assert.equal(buttonGlyph('playstation', 'south'), '✕');
  assert.equal(buttonGlyph('xbox', 'south'), 'A');
  assert.equal(buttonGlyph('xbox', 'r2'), 'RT');
});

// ---- Connections -----------------------------------------------------------------------

const manager = (pads, api = 'available') => new ControllerManager({ source: padSource(pads, api), target: null });

test('zero controllers: disconnected, no Player 1, nothing read', () => {
  const m = manager([]);
  assert.deepEqual([...CONTROLLER_STATUSES], ['connected', 'disconnected', 'tooMany']);
  assert.equal(m.status, 'disconnected');
  assert.equal(m.supportedCount, 0);
  assert.equal(m.player1, null);
  assert.equal(m.poll(), null);
});

test('one supported controller is connected and Player 1\'s; four are connected, the first Player 1, the others available', () => {
  const one = manager([fakePad()]);
  assert.equal(one.status, 'connected');
  assert.equal(one.player1.family, 'playstation');
  assert.equal(one.player1.name, 'DualSense Wireless Controller');
  assert.equal(one.family, 'playstation');
  const pads = [fakePad(), fakePad({ id: PAD_IDS.xboxSeries, index: 1 }), fakePad({ index: 2 }), fakePad({ id: PAD_IDS.xinput, index: 3 })];
  const four = manager(pads);
  assert.equal(MAX_CONTROLLERS, 4);
  assert.equal(four.status, 'connected');
  assert.equal(four.supportedCount, 4);
  assert.deepEqual(four.list.map((d) => [d.slot, d.active, d.player1]), [[1, true, true], [2, true, false], [3, true, false], [4, true, false]]);
});

test('a fifth supported controller is too many: detected, inactive, and the first four stay usable', () => {
  const pads = [0, 1, 2, 3, 4].map((index) => fakePad({ index, id: index % 2 ? PAD_IDS.xboxSeries : PAD_IDS.dualsense }));
  const m = manager(pads);
  assert.equal(m.status, 'tooMany');
  assert.equal(m.supportedCount, 5);
  assert.deepEqual(m.list.map((d) => d.active), [true, true, true, true, false]);
  assert.equal(m.list[4].excess, true);
  assert.equal(m.assignPlayer1(m.list[4].key), false, 'an inactive controller can never be Player 1');
  // One of the first four goes: the fifth becomes active (the order holds).
  pads.splice(1, 1);
  m.refresh();
  assert.equal(m.status, 'connected');
  assert.deepEqual(m.list.map((d) => [d.index, d.active]), [[0, true], [2, true], [3, true], [4, true]]);
});

test('unsupported devices are listed with their reason, never counted, never Player 1', () => {
  const m = manager([fakePad({ id: PAD_IDS.switchPro }), fakePad({ id: PAD_IDS.generic, index: 1 })]);
  assert.equal(m.status, 'disconnected');
  assert.deepEqual(m.unsupported.map((d) => d.reason), ['nintendo', 'unidentified']);
  assert.equal(m.player1, null);
  // Six devices, four supported: still connected, not too many.
  const mixed = manager([
    fakePad({ id: PAD_IDS.switchPro }), fakePad({ index: 1 }), fakePad({ index: 2 }), fakePad({ index: 3 }),
    fakePad({ index: 4 }), fakePad({ id: PAD_IDS.generic, index: 5 }),
  ]);
  assert.equal(mixed.status, 'connected');
  assert.equal(mixed.player1.index, 1);
});

test('disconnection and reconnection: Player 1 falls to the next controller, and the chosen one gets it back', () => {
  const ds = fakePad({ index: 0 });
  const xb = fakePad({ id: PAD_IDS.xboxSeries, index: 1 });
  const pads = [ds, xb];
  const m = manager(pads);
  const heard = [];
  m.onChange(() => heard.push(m.status));
  assert.equal(m.assignPlayer1(m.list[1].key), true, 'the player picks the Xbox pad');
  assert.equal(m.player1.family, 'xbox');
  assert.equal(heard.length, 1, 'listeners hear the switch');
  pads.splice(1, 1); // the Xbox pad goes
  m.refresh();
  assert.equal(m.player1.family, 'playstation', 'the next one takes over');
  pads.push({ ...fakePad({ id: PAD_IDS.xboxSeries, index: 3 }) }); // back, under another index
  m.refresh();
  assert.equal(m.player1.family, 'xbox', 'the chosen controller is Player 1 again');
  pads.length = 0;
  m.refresh();
  assert.equal(m.status, 'disconnected');
  assert.equal(m.player1, null);
  assert.deepEqual(heard.slice(-1), ['disconnected']);
});

test('Player 1\'s buttons and sticks are read every poll, with press edges; other controllers never are', () => {
  const ds = fakePad();
  const xb = fakePad({ id: PAD_IDS.xboxSeries, index: 1 });
  const m = manager([ds, xb]);
  m.poll(); // the first poll reports no presses (what is held was pressed before)
  setButton(xb, 'south');
  assert.deepEqual(m.poll().pressed, [], 'the second controller is not read');
  setButton(ds, 'south');
  ds.axes = [0.5, -0.25, 0, 1];
  let s = m.poll();
  assert.deepEqual(s.pressed, ['south']);
  assert.deepEqual([...s.held], ['south']);
  assert.deepEqual(s.axes, [0.5, -0.25, 0, 1]);
  assert.deepEqual(m.poll().pressed, [], 'held: no new edge');
  setButton(ds, 'south', false);
  assert.deepEqual([...m.poll().held], []);
  // Switching Player 1: the new controller's held buttons are no press.
  m.assignPlayer1(m.list[1].key);
  s = m.poll();
  assert.deepEqual(s.pressed, []);
  assert.deepEqual([...s.held], ['south']);
});

test('the triggers press at half travel and let go below a third (no flicker), and a digital-only trigger still counts', () => {
  const pad = fakePad();
  const m = manager([pad]);
  m.poll();
  const r2 = (value, pressed = value > 0) => { pad.buttons[7] = { pressed, value }; return m.poll().held.has('r2'); };
  assert.equal(TRIGGER_PRESS, 0.5);
  assert.equal(TRIGGER_RELEASE, 0.3);
  assert.equal(r2(0.4), false);
  assert.equal(r2(0.55), true);
  assert.equal(r2(0.35), true, 'still held above the release point');
  assert.equal(r2(0.2), false);
  assert.equal(r2(0, true), true, 'a trigger reported as a plain button');
});

test('Reconnect is a real refresh: it re-reads the browser and reports even an unchanged state', () => {
  const pads = [];
  const m = manager(pads);
  let heard = 0;
  m.onChange(() => heard++);
  m.refresh();
  assert.equal(heard, 0, 'nothing changed');
  m.refresh({ force: true });
  assert.equal(heard, 1, 'a forced refresh always reports');
  // A controller exposed only now (after a press, as browsers do).
  pads.push(fakePad());
  m.refresh();
  assert.equal(m.status, 'connected');
  assert.equal(heard, 2);
});

test('no Gamepad API, or access blocked by the browser: disconnected, explained, never thrown', () => {
  const none = new ControllerManager({ source: () => ({ api: 'unavailable', pads: [] }), target: null });
  assert.equal(none.api, 'unavailable');
  assert.equal(none.status, 'disconnected');
  const blocked = new ControllerManager({ source: () => { throw new Error('SecurityError'); }, target: null });
  assert.equal(blocked.api, 'blocked');
  assert.equal(blocked.status, 'disconnected');
  assert.equal(blocked.poll(), null);
  // The default source: a navigator without getGamepads, or one that throws.
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    assert.equal(new ControllerManager({ target: null }).api, 'unavailable');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads() { throw new Error('denied'); } } });
    assert.equal(new ControllerManager({ target: null }).api, 'blocked');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [null, fakePad({ index: 1 }), null] } });
    assert.equal(new ControllerManager({ target: null }).status, 'connected', 'holes in the list are skipped');
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
  }
});

test('connection events trigger a refresh; focus loss releases everything until the page is back', () => {
  const listeners = {};
  const pads = [];
  const m = new ControllerManager({ source: padSource(pads), target: { addEventListener: (type, fn) => { listeners[type] = fn; } } });
  pads.push(fakePad());
  listeners.gamepadconnected();
  assert.equal(m.status, 'connected');
  m.poll();
  setButton(pads[0], 'east');
  assert.deepEqual(m.poll().pressed, ['east']);
  m.suspend();
  assert.equal(m.poll(), null, 'nothing read while suspended');
  m.resume();
  const back = m.poll();
  assert.deepEqual(back.pressed, [], 'a button held through the focus loss is no new press');
  assert.ok(back.held.has('east'));
  pads.length = 0;
  listeners.gamepaddisconnected();
  assert.equal(m.status, 'disconnected');
});
