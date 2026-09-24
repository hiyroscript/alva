// Unified gameplay input: keyboard + touch + gamepad merged into one
// pressed-state table. Uses held state (never keydown auto-repeat) and counts
// press edges so taps shorter than a simulation step are never lost.

import { ACTIONS } from '../config.js';

const PAD_DEADZONE = 0.45;

// Standard Gamepad mapping -> gameplay actions.
const PAD_BUTTONS = {
  0: 'jump',     // A / Cross
  2: 'primary',  // X / Square (Throw)
  3: 'special',  // Y / Triangle
  1: 'action1',  // B / Circle
  4: 'action2',  // LB
  5: 'defense',  // RB
  7: 'defense',  // RT
  12: 'jump',    // D-pad up
  13: 'charge',  // D-pad down (menus still read it as Down; see _padMenu)
  14: 'left',
  15: 'right',
};

export class InputManager {
  constructor(bindings) {
    this.bindings = bindings;
    this.codeToActions = new Map();
    for (const [action, codes] of Object.entries(bindings)) {
      for (const code of codes) {
        if (!this.codeToActions.has(code)) this.codeToActions.set(code, []);
        this.codeToActions.get(code).push(action);
      }
    }

    this.keys = new Set();
    this.touch = new Set();
    this.pad = new Set();
    this.state = {};
    for (const a of ACTIONS) this.state[a] = { held: false, presses: 0 };

    this.gameplayActive = false;
    this.lastDevice = 'keyboard';
    this.keyListeners = new Set();
    this.padMenuListener = null;
    this.padMenuState = { dir: null, nextRepeat: 0, buttons: new Set() };
    this.padConnected = false;

    // Reused per-step snapshot to avoid allocations in the sim loop.
    this.frame = {
      left: false, right: false, charge: false, jump: false, defense: false,
      primary: false, special: false, action1: false, action2: false,
      jumpPressed: false, chargePressed: false, primaryPressed: false,
      specialPressed: false, action1Pressed: false, action2Pressed: false,
      defensePressed: false,
    };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = () => this.clear();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
  }

  // Raw keydown subscription for menus / pause (returns an unsubscribe fn).
  onKey(listener) {
    this.keyListeners.add(listener);
    return () => this.keyListeners.delete(listener);
  }

  onPadMenu(listener) {
    this.padMenuListener = listener;
  }

  setGameplayActive(active) {
    this.gameplayActive = active;
    if (!active) this.clear();
  }

  _onKeyDown(e) {
    this.lastDevice = 'keyboard';
    const actions = this.codeToActions.get(e.code);
    if (this.gameplayActive && actions) {
      // Stop gameplay keys from scrolling or activating focused buttons.
      e.preventDefault();
    }
    if (!e.repeat) {
      this.keys.add(e.code);
      if (actions) for (const a of actions) this._refresh(a);
    }
    for (const fn of this.keyListeners) fn(e);
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
    const actions = this.codeToActions.get(e.code);
    if (actions) for (const a of actions) this._refresh(a);
  }

  _refresh(action) {
    const st = this.state[action];
    if (!st) return;
    let held = this.touch.has(action) || this.pad.has(action);
    if (!held) {
      for (const code of this.bindings[action] || []) {
        if (this.keys.has(code)) {
          held = true;
          break;
        }
      }
    }
    if (held && !st.held) st.presses++;
    st.held = held;
  }

  setTouch(action, held) {
    if (held) this.touch.add(action);
    else this.touch.delete(action);
    this.lastDevice = 'touch';
    this._refresh(action);
  }

  isHeld(action) {
    return this.state[action]?.held ?? false;
  }

  // True once per press edge.
  consume(action) {
    const st = this.state[action];
    if (!st || st.presses === 0) return false;
    st.presses = 0;
    return true;
  }

  // Drop buffered presses (e.g. after closing a menu with the same key).
  flush() {
    for (const st of Object.values(this.state)) st.presses = 0;
  }

  clear() {
    this.keys.clear();
    this.touch.clear();
    this.pad.clear();
    for (const st of Object.values(this.state)) {
      st.held = false;
      st.presses = 0;
    }
  }

  // Build the per-simulation-step input snapshot for Player 1.
  sample() {
    const f = this.frame;
    f.left = this.isHeld('left');
    f.right = this.isHeld('right');
    f.charge = this.isHeld('charge');
    f.jump = this.isHeld('jump');
    f.defense = this.isHeld('defense');
    f.primary = this.isHeld('primary');
    f.special = this.isHeld('special');
    f.action1 = this.isHeld('action1');
    f.action2 = this.isHeld('action2');
    f.jumpPressed = this.consume('jump');
    f.chargePressed = this.consume('charge');
    f.defensePressed = this.consume('defense');
    f.primaryPressed = this.consume('primary');
    f.specialPressed = this.consume('special');
    f.action1Pressed = this.consume('action1');
    f.action2Pressed = this.consume('action2');
    return f;
  }

  // Called once per animation frame.
  pollGamepads(now) {
    if (!this.padConnected || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;

    const next = new Set();
    pad.buttons.forEach((b, i) => {
      if ((b.pressed || b.value > 0.5) && PAD_BUTTONS[i]) next.add(PAD_BUTTONS[i]);
    });
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (ax < -PAD_DEADZONE) next.add('left');
    if (ax > PAD_DEADZONE) next.add('right');
    if (ay > PAD_DEADZONE) next.add('charge');

    let changed = false;
    for (const a of next) if (!this.pad.has(a)) changed = true;
    for (const a of this.pad) if (!next.has(a)) changed = true;
    if (changed) {
      this.lastDevice = 'gamepad';
      const prev = this.pad;
      this.pad = next;
      for (const a of new Set([...prev, ...next])) this._refresh(a);
    }

    this._padMenu(pad, ax, ay, now);
  }

  _padMenu(pad, ax, ay, now) {
    if (!this.padMenuListener) return;
    const pressed = (i) => pad.buttons[i]?.pressed;
    let dir = null;
    if (pressed(12) || ay < -PAD_DEADZONE) dir = 'up';
    else if (pressed(13) || ay > PAD_DEADZONE) dir = 'down';
    else if (pressed(14) || ax < -PAD_DEADZONE) dir = 'left';
    else if (pressed(15) || ax > PAD_DEADZONE) dir = 'right';

    const ms = this.padMenuState;
    if (dir !== ms.dir) {
      ms.dir = dir;
      if (dir) {
        ms.nextRepeat = now + 380;
        this.padMenuListener(dir);
      }
    } else if (dir && now >= ms.nextRepeat) {
      ms.nextRepeat = now + 130;
      this.padMenuListener(dir);
    }

    const edge = (i, name) => {
      const down = pressed(i);
      if (down && !ms.buttons.has(i)) this.padMenuListener(name);
      if (down) ms.buttons.add(i);
      else ms.buttons.delete(i);
    };
    edge(0, 'confirm');
    edge(1, 'back');
    edge(9, 'start');
  }
}
