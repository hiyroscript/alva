// Fake game controllers for the input tests: Gamepad-API-shaped pads (the
// standard mapping, 17 buttons, four axes) that a test presses by
// normalized button name, and a rig wiring them into a real
// ControllerManager and InputManager on stub window / document objects.
// Mocked devices only: real PlayStation and Xbox hardware still needs a
// browser check (docs/development/testing.md).

import { CONFIG } from '../../js/config.js';
import { PAD_BUTTONS } from '../../js/core/gamepad-devices.js';

// Real id strings, as browsers report them.
export const PAD_IDS = Object.freeze({
  dualsense: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  dualshock4: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  dualshock4Firefox: '54c-9cc-Wireless Controller',
  dualsenseSafari: 'DualSense Wireless Controller',
  xboxSeries: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  xboxOne: 'Xbox One Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
  xinput: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  switchPro: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
  generic: 'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0006)',
  wireless: 'Wireless Controller',
});

export const BUTTON_INDEX = Object.freeze(Object.fromEntries(PAD_BUTTONS.map((b, i) => [b, i])));

// One fake pad: `id` (a DualSense by default), Gamepad API `index`.
export function fakePad({ id = PAD_IDS.dualsense, index = 0, mapping = 'standard' } = {}) {
  return {
    id, index, mapping, connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
}

// Sets `button` (a normalized name) down or up on `pad`.
export function setButton(pad, button, down = true, value = down ? 1 : 0) {
  pad.buttons[BUTTON_INDEX[button]] = { pressed: down, value };
}

// A Gamepad API stand-in over `pads` (holes allowed, as browsers give).
export const padSource = (pads, api = 'available') => () => ({ api, pads: [...pads] });

// Window and document stubs the InputManager listens on; returns their
// listeners by event type.
export function stubWindow() {
  const listeners = {};
  globalThis.window = {
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    removeEventListener() {},
  };
  globalThis.document = { addEventListener: (type, fn) => { (listeners[`document:${type}`] ??= []).push(fn); }, hidden: false };
  return listeners;
}

// A real ControllerManager and InputManager over `pads`, in play (or in
// the menus with `gameplay: false`), polled once so Player 1's pad is
// assigned. press(button, down), stick(x, y) (the left stick) and
// rightStick(x, y) poll after changing it; sample(context) is Player 1's
// snapshot.
export async function controllerRig({ pads = [fakePad()], gameplay = true, profileFor = null } = {}) {
  const listeners = stubWindow();
  const { ControllerManager } = await import('../../js/core/controller-manager.js');
  const { InputManager } = await import('../../js/core/input-manager.js');
  const controllers = new ControllerManager({ source: padSource(pads), target: null });
  const input = new InputManager(CONFIG.bindings, { controllers, ...(profileFor ? { profileFor } : {}) });
  input.setGameplayActive(gameplay);
  let now = 0;
  const poll = (ms = 1000 / 60) => {
    now += ms;
    input.pollGamepads(now);
  };
  poll();
  // Play's first sample, as a match's first step takes it (presses before
  // it are stale: they were made in a menu).
  if (gameplay) input.sample();
  const pad = pads[0];
  return {
    listeners, controllers, input, pads, pad, poll,
    get now() { return now; },
    press(button, down = true, target = pad) {
      setButton(target, button, down);
      poll();
    },
    stick(x, y, target = pad) {
      target.axes[0] = x;
      target.axes[1] = y;
      poll();
    },
    rightStick(x, y, target = pad) {
      target.axes[2] = x;
      target.axes[3] = y;
      poll();
    },
    sample: (context) => input.sample(context),
  };
}
