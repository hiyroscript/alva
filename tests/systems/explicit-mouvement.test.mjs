import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../js/config.js';
import { InputManager } from '../../js/core/input-manager.js';
import { ControllerManager } from '../../js/core/controller-manager.js';
import { makeFighter } from '../helpers/fighter-harness.mjs';
import { fakePad, setButton, padSource, stubWindow } from '../helpers/fake-gamepad.mjs';

// Keyboard, touch and a DualSense on its recommended layout, in play.
function device() {
  stubWindow();
  const pad = fakePad();
  const pads = [pad];
  const input = new InputManager(CONFIG.bindings, { controllers: new ControllerManager({ source: padSource(pads), target: null }) });
  input.setGameplayActive(true);
  let now = 0;
  const poll = () => input.pollGamepads((now += 16));
  poll();
  input.sample();
  const key = (code, down, repeat = false) => input[down ? '_onKeyDown' : '_onKeyUp']({ code, repeat, preventDefault() {} });
  const button = (name, down) => { setButton(pad, name, down); poll(); };
  const stick = (x) => { pad.axes[0] = x; poll(); };
  return { input, pad, pads, key, button, stick, poll };
}

for (const airborne of [false, true]) {
  test(`keyboard, touch Run and gamepad flicks never Dash (airborne=${airborne})`, () => {
    for (const source of ['keyboard', 'touch', 'dpad', 'stick']) {
      const { input, key, button, stick } = device();
      const { fighter, step } = makeFighter();
      if (airborne) step({ jump: true, jumpPressed: true });
      for (const side of [1, 1, 1, -1, -1, 1, -1, 1]) {
        const action = side > 0 ? 'runRight' : 'runLeft';
        for (const down of [true, false]) {
          if (source === 'keyboard') key(side > 0 ? 'KeyD' : 'KeyA', down);
          if (source === 'touch') input.setTouch(action, down);
          if (source === 'dpad') button(side > 0 ? 'dpadRight' : 'dpadLeft', down);
          if (source === 'stick') stick(down ? side : 0);
          const frame = input.sample();
          assert.equal(frame.mouvementLeftPressed || frame.mouvementRightPressed, false);
          step(frame);
          assert.equal(fighter.dash, null, source);
        }
      }
    }
  });

  for (const side of [-1, 1]) for (const source of ['keyboard', 'gamepad', 'touch']) {
    test(`${source} explicitly Dashes ${side}, once per press (airborne=${airborne})`, () => {
      const { input, key, button, stick, poll } = device();
      const { fighter, step } = makeFighter();
      if (airborne) step({ jump: true, jumpPressed: true });
      if (source === 'keyboard') key(side < 0 ? 'KeyQ' : 'KeyE', true);
      // The Dash button (L1 / LB), the stick pointing the way.
      if (source === 'gamepad') { stick(side); button('l1', true); }
      if (source === 'touch') input.queueTouchMouvement(side);
      const frame = input.sample();
      assert.equal(frame[side < 0 ? 'mouvementLeftPressed' : 'mouvementRightPressed'], true);
      step(frame);
      assert.equal(fighter.dash?.direction, side);
      assert.equal(fighter.dash?.air, airborne);
      const dash = fighter.dash;
      for (let i = 0; i < 90; i++) {
        if (source === 'keyboard') key(side < 0 ? 'KeyQ' : 'KeyE', true, true);
        poll();
        const next = input.sample();
        assert.equal(next.mouvementLeftPressed || next.mouvementRightPressed, false);
        step(next);
        assert.ok(!fighter.dash || fighter.dash === dash, 'holding cannot start another Dash');
      }
    });
  }
}

test('the Dash button leaves Jump, the Shield, Pause and the menu buttons as they are', () => {
  const { input, button, poll } = device();
  const menu = [];
  input.onPadMenu((command) => menu.push(command));
  button('l1', true);
  input.sample();
  for (const [name, field] of [['south', 'jumpPressed'], ['east', 'shieldPressed']]) {
    button(name, true);
    assert.equal(input.sample()[field], true, name);
    button(name, false);
    input.sample();
  }
  // Options / Menu pauses in play...
  button('start', true);
  assert.deepEqual(menu, ['start']);
  button('start', false);
  button('l1', false);
  // ...and the menus keep their own buttons.
  input.setGameplayActive(false);
  poll();
  for (const [name, command] of [['south', 'confirm'], ['east', 'back'], ['start', 'start'], ['dpadLeft', 'left']]) {
    button(name, true);
    button(name, false);
    assert.equal(menu.at(-1), command, name);
  }
});

test('short keyboard taps survive sampling, releases re-arm, opposing requests cancel, and deactivation clears requests', () => {
  const { input, key, button, stick, pads, poll } = device();
  key('KeyQ', true); key('KeyQ', false);
  assert.equal(input.sample().mouvementLeftPressed, true);
  assert.equal(input.sample().mouvementLeftPressed, false);
  key('KeyQ', true); key('KeyE', true);
  const { fighter, step } = makeFighter();
  step(input.sample());
  assert.equal(fighter.dash, null);
  input.clear();
  stick(1); button('l1', true);
  assert.equal(input.sample().mouvementRightPressed, true);
  button('l1', false); button('l1', true);
  assert.equal(input.sample().mouvementRightPressed, true);
  assert.equal(input.sample().runRight, true);
  // The controller lost: nothing stays held.
  pads.length = 0; poll();
  assert.equal(input.sample().runRight, false);
  for (const clear of [() => input.flush(), () => input.clear(), () => input.setGameplayActive(false)]) {
    key('KeyQ', false); key('KeyQ', true);
    input.queueTouchMouvement(1);
    clear();
    const f = input.sample();
    assert.equal(f.mouvementLeftPressed || f.mouvementRightPressed, false);
  }
});
