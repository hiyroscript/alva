// Run with node --test tests/systems/request-devices.test.mjs (no dependencies).
// The player's requests from every device: the keyboard, the touch controls
// and a game controller reach the Fighter through one InputManager as the
// same press edges, so Combo Assist, move cancellation and Run behave the
// same whichever is used. Each device's own semantics are kept: a key or a
// controller button held makes one press (never a stream of requests), a
// touch tap is one press, the stick and the Run keys and buttons only hold
// a direction. On a real InputManager over stubbed window events and a
// mocked pad, and a real Fighter (#0001: Jab, Red, Maximum Blue).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter } from '../../js/data/characters.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { DT, SIM_CTX, STAGE, fakeSpritesOf } from '../helpers/fighter-harness.mjs';
import { controllerRig } from '../helpers/fake-gamepad.mjs';

const ONE = getCharacter('0001');
const KEYS = { attack1: 'KeyU', attack3: 'KeyO', runRight: 'KeyD', runLeft: 'KeyA' };

// Player 1 on #0001 (Combo Assist on, Combat Assist off: no opponent near),
// with a way to press and hold each control on `device`.
async function devicePlayer(device) {
  const rig = await controllerRig();
  const fighter = new Fighter({
    def: ONE, sprites: fakeSpritesOf(ONE), stage: STAGE, slot: 'p1', label: 'P1',
    controller: new PlayerController(rig.input, { combatAssist: false }), spawn: { x: 900, facing: 1 },
  });
  const key = (type, code) => {
    for (const fn of rig.listeners[type] ?? []) fn({ code, key: code, repeat: false, preventDefault() {} });
  };
  // Holds (`on`) or lets go of `control` (attack1, attack3, runRight,
  // runLeft) on this device.
  const hold = (control, on) => {
    if (device === 'keyboard') key(on ? 'keydown' : 'keyup', KEYS[control]);
    else if (device === 'touch') rig.input.setTouch(control, on);
    else if (control === 'runRight' || control === 'runLeft') rig.stick(on ? (control === 'runRight' ? 1 : -1) : 0, 0);
    else if (control === 'attack1') rig.press('west', on);
    else {
      // Maximum Blue: R2 + Circle, the modifier first.
      if (on) rig.press('r2', true);
      rig.press('east', on);
      if (!on) rig.press('r2', false);
    }
  };
  const step = () => {
    rig.poll();
    fighter.update(DT, SIM_CTX);
    return fighter;
  };
  step();
  // A tap: down for one step, then let go.
  const tap = (control) => {
    hold(control, true);
    step();
    hold(control, false);
  };
  return { fighter, hold, step, tap };
}

const DEVICES = ['keyboard', 'touch', 'controller'];

test('every device: Attack 1 held through the Jab is one press (never a restart or a combo); pressed again during its cooldown it is Red', async () => {
  for (const device of DEVICES) {
    const p = await devicePlayer(device);
    p.hold('attack1', true);
    p.step();
    const jab = p.fighter.combat.attack;
    assert.equal(jab?.def.id, 'attack1', device);
    // Held on: the Jab plays out, and nothing follows from holding it.
    for (let i = 0; i < 60; i++) {
      p.step();
      if (p.fighter.combat.attack) assert.equal(p.fighter.combat.attack, jab, `${device}: held, the same Jab`);
    }
    assert.equal(p.fighter.combat.attack, null, `${device}: no repeated combo from a held button`);
    p.hold('attack1', false);
    p.step();
    // A fresh press while the Jab cools down: Red.
    p.fighter.combat.cooldowns.set('attack1', 0.4);
    p.tap('attack1');
    assert.equal(p.fighter.combat.attack?.def.id, 'attack2', `${device}: Combo Assist`);
  }
});

test('every device: a different attack pressed during the Jab cuts it into that attack; Run held and turned on that device never does', async () => {
  for (const device of DEVICES) {
    const p = await devicePlayer(device);
    p.hold('runRight', true);
    p.step();
    p.tap('attack1');
    const jab = p.fighter.combat.attack;
    assert.equal(jab?.def.id, 'attack1', device);
    p.hold('runRight', false);
    p.hold('runLeft', true);
    p.step();
    p.step();
    assert.equal(p.fighter.combat.attack, jab, `${device}: Run turned, the Jab plays on`);
    p.tap('attack3');
    assert.equal(p.fighter.combat.attack?.def.id, 'attack3', `${device}: cut into Maximum Blue`);
    assert.ok(p.fighter.combat.cooldowns.has('attack1'), `${device}: the Jab's cooldown`);
    // Run held on through Maximum Blue: never a cut.
    const blue = p.fighter.combat.attack;
    while (p.fighter.combat.attack === blue) p.step();
    assert.ok(blue.time >= blue.def.total - 1e-6, `${device}: played out`);
  }
});
