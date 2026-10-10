import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../js/config.js';
import { InputManager } from '../../js/core/input-manager.js';
import { makeFighter } from '../helpers/fighter-harness.mjs';

function device() {
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  const input = new InputManager(CONFIG.bindings);
  input.padConnected = true;
  input.setGameplayActive(true);
  const key = (code, down, repeat = false) => input[down ? '_onKeyDown' : '_onKeyUp']({ code, repeat, preventDefault() {} });
  const button = (i, down) => { pad.buttons[i] = { pressed: down, value: Number(down) }; input.pollGamepads(0); };
  return { input, pad, key, button };
}

for (const airborne of [false, true]) {
  test(`keyboard, touch Run and gamepad flicks never Dash (airborne=${airborne})`, () => {
    for (const source of ['keyboard', 'touch', 'dpad', 'stick']) {
      const { input, pad, key, button } = device();
      const { fighter, step } = makeFighter();
      if (airborne) step({ jump: true, jumpPressed: true });
      for (const side of [1, 1, 1, -1, -1, 1, -1, 1]) {
        const action = side > 0 ? 'runRight' : 'runLeft';
        for (const down of [true, false]) {
          if (source === 'keyboard') key(side > 0 ? 'KeyD' : 'KeyA', down);
          if (source === 'touch') input.setTouch(action, down);
          if (source === 'dpad') button(side > 0 ? 15 : 14, down);
          if (source === 'stick') { pad.axes[0] = down ? side : 0; input.pollGamepads(0); }
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
      const { input, key, button } = device();
      const { fighter, step } = makeFighter();
      if (airborne) step({ jump: true, jumpPressed: true });
      if (source === 'keyboard') key(side < 0 ? 'KeyQ' : 'KeyE', true);
      if (source === 'gamepad') { button(side < 0 ? 14 : 15, true); button(8, true); }
      if (source === 'touch') input.queueTouchMouvement(side);
      const frame = input.sample();
      assert.equal(frame[side < 0 ? 'mouvementLeftPressed' : 'mouvementRightPressed'], true);
      step(frame);
      assert.equal(fighter.dash?.direction, side);
      assert.equal(fighter.dash?.air, airborne);
      const dash = fighter.dash;
      for (let i = 0; i < 90; i++) {
        if (source === 'keyboard') key(side < 0 ? 'KeyQ' : 'KeyE', true, true);
        input.pollGamepads(i);
        const next = input.sample();
        assert.equal(next.mouvementLeftPressed || next.mouvementRightPressed, false);
        step(next);
        assert.ok(!fighter.dash || fighter.dash === dash, 'holding cannot start another Dash');
      }
    });
  }
}

test('gamepad modifier preserves Jump, Shield, attacks, Start and menu mappings', () => {
  const { input, button } = device();
  const menu = [];
  input.onPadMenu((command) => menu.push(command));
  button(8, true);
  for (const [i, action] of [[0, 'jump'], [5, 'shield'], [1, 'attack1'], [4, 'attack2'], [6, 'attack3'], [10, 'attack4'], [11, 'attack5'], [2, 'extra_attack']]) {
    button(i, true);
    assert.equal(input.sample()[`${action}Pressed`], true, action);
    button(i, false);
  }
  button(9, true);
  assert.ok(menu.includes('start'));
  assert.ok(menu.includes('confirm'));
  assert.ok(menu.includes('back'));
  button(14, true);
  assert.ok(menu.includes('left'));
});

test('short keyboard taps survive sampling, releases re-arm, opposing requests cancel, and deactivation clears requests', () => {
  const { input, key, pad, button } = device();
  key('KeyQ', true); key('KeyQ', false);
  assert.equal(input.sample().mouvementLeftPressed, true);
  assert.equal(input.sample().mouvementLeftPressed, false);
  key('KeyQ', true); key('KeyE', true);
  const { fighter, step } = makeFighter();
  step(input.sample());
  assert.equal(fighter.dash, null);
  input.clear();
  button(15, true); button(8, true);
  assert.equal(input.sample().mouvementRightPressed, true);
  button(8, false); button(8, true);
  assert.equal(input.sample().mouvementRightPressed, true);
  pad.connected = false; input.pollGamepads(0);
  assert.equal(input.isHeld('runRight'), false);
  for (const clear of [() => input.flush(), () => input.clear(), () => input.setGameplayActive(false)]) {
    key('KeyQ', false); key('KeyQ', true);
    input.queueTouchMouvement(1);
    clear();
    const f = input.sample();
    assert.equal(f.mouvementLeftPressed || f.mouvementRightPressed, false);
  }
});

test('K and Y/Triangle generate no gameplay action; keyboard and gamepad menu Back still work', () => {
  const { input, key, button } = device();
  const before = { ...input.sample() };
  const menuKeys = [];
  input.onKey((event) => { if (CONFIG.menuBindings.back.includes(event.code)) menuKeys.push(event.code); });
  key('KeyK', true);
  assert.deepEqual(input.sample(), before, 'K produces neither a held action nor a press edge');
  key('KeyK', false);
  assert.deepEqual(menuKeys, ['KeyK'], 'K still reaches independent menu navigation');
  const menu = [];
  input.onPadMenu((command) => menu.push(command));
  for (let press = 0; press < 2; press++) {
    button(3, true);
    assert.deepEqual(input.sample(), before, 'Y/Triangle is unassigned, including repeated presses');
    assert.deepEqual([...input.pad], []);
    assert.equal(Object.hasOwn(input.state, 'transform'), false);
    button(3, false);
    assert.deepEqual(input.sample(), before);
  }
  assert.deepEqual(menu, []);
  button(1, true);
  assert.equal(input.sample().attack1Pressed, true, 'B/Circle retains Attack 1');
  assert.deepEqual(menu, ['back'], 'B/Circle retains menu Back');
});
