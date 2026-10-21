// Unified held controls and press edges from keyboard, touch and the
// controller, merged into one snapshot per simulation step.
//
// Keyboard and touch work as they always have (CONFIG.bindings, the touch
// controls). Player 1's game controller (js/core/controller-manager.js:
// a supported PlayStation or Xbox pad, one of up to four connected) has two
// jobs, never both at once:
//
//   in play   its buttons are resolved, for the fighter being played and
//             where it is (on the ground or in the air), through that
//             fighter's controller profile (js/data/controller-profiles.js,
//             the player's own layout or the recommended one) into the same
//             control codenames a keyboard sends (js/core/controller-
//             resolver.js). Its Pause binding asks for the pause menu.
//   in menus  it navigates: the D-pad moves focus, the left stick moves the
//             circular cursor, the right stick scrolls, Cross / A confirms,
//             Circle / B goes back and Options / Menu is Start, whatever
//             the gameplay layout says (onPadMenu, onPadCursor).
//
// Mouvement is explicit: Q/E, a Dash binding (the stick's way, or the
// fighter's facing), or either touch layout's movement buttons. Requests
// last one sample; Run never requests a Dash. Nothing a menu did reaches
// play: every button (and the stick) held as play starts is stale until let
// go, and a lost controller lets go of everything at once.

import { COMBAT_BUTTONS } from '../config.js';
import { HELD_CONTROLS, blankInput } from '../game/fighters/fighter-controller.js';
import { ControllerManager } from './controller-manager.js';
import { ControllerResolver, compileProfile } from './controller-resolver.js';
import { resolveProfile } from '../data/controller-profiles.js';

const MOUVEMENT_CONTROLS = ['mouvementLeft', 'mouvementRight'];

// D-pad focus movement in menus: the first step at once, then a repeat
// after MENU_REPEAT_DELAY and every MENU_REPEAT while held (milliseconds).
const MENU_REPEAT_DELAY = 380;
const MENU_REPEAT = 130;
const MENU_DIRECTIONS = Object.freeze([['dpadUp', 'up'], ['dpadDown', 'down'], ['dpadLeft', 'left'], ['dpadRight', 'right']]);
// The fixed menu buttons: Cross / A confirms, Circle / B goes back,
// Options / Menu is Start.
const MENU_BUTTONS = Object.freeze([['south', 'confirm'], ['east', 'back'], ['start', 'start']]);

// A sample with no fighter: on the ground, facing right, universal
// actions only.
const NO_FIGHTER = Object.freeze({ grounded: true, facing: 1, character: null });
const NO_CHARACTER = Symbol('no character');

export class InputManager {
  // `controllers`: the connection manager (one of its own by default).
  // `profileFor(def)`: the controller profile `def` plays with (the
  // recommended one by default; App gives the player's saved ones).
  constructor(bindings, { controllers = null, profileFor = null } = {}) {
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
    this.state = {};
    for (const a of [...HELD_CONTROLS, 'pause', ...MOUVEMENT_CONTROLS]) this.state[a] = { held: false, presses: 0 };
    // The Dash a touch mouvement button asked for since the last sample:
    // 1 right, -1 left, 0 none (see queueTouchMouvement).
    this.touchMouvement = 0;

    this.gameplayActive = false;
    this.lastDevice = 'keyboard';
    this.keyListeners = new Set();
    this.padMenuListener = null;
    this.padCursorListener = null;
    this.captureListener = null;
    this.padMenuState = { dir: null, nextRepeat: 0 };

    // Player 1's controller and its resolver.
    this.controllers = controllers ?? new ControllerManager();
    this.resolver = new ControllerResolver();
    this.profileFor = profileFor ?? ((def) => resolveProfile(def));
    this.profiles = new Map();
    this.padActive = false;
    this.padReset = false;
    this.lastPoll = null;
    this.player1Key = this.controllers.player1?.key ?? null;
    this.controllers.onChange(() => {
      const key = this.controllers.player1?.key ?? null;
      if (key === this.player1Key) return;
      // Player 1's controller changed (or was lost): let go of everything
      // the old one held; the new one's held buttons are stale.
      this.player1Key = key;
      this.resolver.release();
      this.padMenuState.dir = null;
      this.padReset = true;
    });

    // Reused per-step snapshot to avoid allocations in the sim loop: every
    // held control and its press edge, the Dash requests and where the
    // controller's combat presses were made (see blankInput). Never
    // `dropPressed`, the training CPU's own drop: a player's drop is a fresh
    // Down press (downPressed), whatever the device.
    const { dropPressed, ...frame } = blankInput();
    this.frame = frame;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    // Focus lost or the page hidden: nothing stays held, from any device.
    window.addEventListener('blur', () => this.suspend());
    window.addEventListener('focus', () => this.resumeDevices());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend();
      else this.resumeDevices();
    });
  }

  // Raw keydown subscription for menus / pause (returns an unsubscribe fn).
  onKey(listener) {
    this.keyListeners.add(listener);
    return () => this.keyListeners.delete(listener);
  }

  // The controller's menu commands: 'up' / 'down' / 'left' / 'right'
  // (D-pad), 'confirm', 'back' and 'start'; in play, 'start' from the
  // Pause binding.
  onPadMenu(listener) {
    this.padMenuListener = listener;
  }

  // The menu cursor's stick each frame in menus: listener({ x, y, scroll },
  // dt seconds), or listener(null) when the controller is gone.
  onPadCursor(listener) {
    this.padCursorListener = listener;
  }

  // Sends Player 1's controller to `listener(state)` every frame instead of
  // the menus and play (binding capture), until the returned stop function
  // is called.
  startCapture(listener) {
    this.captureListener = listener;
    return () => {
      if (this.captureListener === listener) this.captureListener = null;
    };
  }

  setGameplayActive(active) {
    this.gameplayActive = active;
    this.clear();
    // Play has no cursor.
    if (active) this.padCursorListener?.(null, 0);
  }

  // The player's controller profiles changed: re-read them on the next
  // sample.
  invalidateProfiles() {
    this.profiles.clear();
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
    let held = this.touch.has(action);
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

  // One Dash toward `direction` (1 right, -1 left), asked for by a single
  // tap of a touch mouvement button (mouvementLeft / mouvementRight). It
  // reaches the next sample only, as mouvementLeftPressed /
  // mouvementRightPressed, and is gone after it: nothing is held, and
  // runLeft / runRight see no press. The latest request wins. Whether a Dash
  // actually starts is Fighter.tryMouvment's call.
  queueTouchMouvement(direction) {
    if (direction !== 1 && direction !== -1) return;
    this.touchMouvement = direction;
    this.lastDevice = 'touch';
  }

  // Discard an unsampled touch request when its controls are deactivated.
  clearTouchMouvement() {
    this.touchMouvement = 0;
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

  // Drop buffered presses (e.g. after closing a menu with the same key):
  // the keyboard's and touch's, and the controller's unresolved ones.
  flush() {
    for (const st of Object.values(this.state)) st.presses = 0;
    this.touchMouvement = 0;
    this.resolver.flush();
  }

  // Lets go of every key and touch control, and makes every controller
  // button held now stale (see ControllerResolver.reset).
  clear() {
    this.keys.clear();
    this.touch.clear();
    for (const st of Object.values(this.state)) {
      st.held = false;
      st.presses = 0;
    }
    this.touchMouvement = 0;
    this.resolver.reset();
  }

  // Focus lost or page hidden: everything let go, the controller included,
  // until the page has it back.
  suspend() {
    this.clear();
    this.controllers.suspend();
    this.resolver.release();
    this.padMenuState.dir = null;
  }

  resumeDevices() {
    this.controllers.resume();
    this.padReset = true;
  }

  // The compiled controller profile for fighter `def` (null: universal
  // actions only), read once until invalidateProfiles.
  compiledFor(def) {
    const key = def ?? NO_CHARACTER;
    let compiled = this.profiles.get(key);
    if (!compiled) {
      compiled = compileProfile(this.profileFor(def ?? null));
      this.profiles.set(key, compiled);
    }
    return compiled;
  }

  // Build the per-simulation-step input snapshot for Player 1: every held
  // control (runLeft ... attack5) and its press edge, the Dash requests
  // (Q / E, a touch movement button, the controller's Dash), and where the
  // controller's combat presses were made. `context` is the fighter as it
  // is now ({ grounded, facing, character }): the controller resolves for
  // it, with its fighter's own profile.
  sample(context = NO_FIGHTER) {
    const f = this.frame;
    const pad = this.controllerFrame(context);
    let ownPress = false;
    for (const control of HELD_CONTROLS) {
      f[control] = this.isHeld(control) || !!pad?.held[control];
      const pressed = this.consume(control);
      if (pressed && COMBAT_BUTTONS.includes(control)) ownPress = true;
      f[`${control}Pressed`] = pressed || !!pad?.pressed[control];
    }
    // Consume both even when a touch request is also queued.
    const left = this.consume('mouvementLeft');
    const right = this.consume('mouvementRight');
    f.mouvementLeftPressed = left || this.touchMouvement === -1 || pad?.dash === -1;
    f.mouvementRightPressed = right || this.touchMouvement === 1 || pad?.dash === 1;
    this.touchMouvement = 0;
    // A keyboard or touch combat press in the same sample makes no claim
    // about where the presses are for.
    const place = ownPress ? null : pad?.place ?? null;
    f.pressedOnGround = place === 'ground';
    f.pressedInAir = place === 'air';
    return f;
  }

  // The controller's part of a sample, or null when it has none (not in
  // play, or no controller).
  controllerFrame(context) {
    if (!this.gameplayActive) return null;
    const ctx = context ?? NO_FIGHTER;
    this.resolver.setProfile(this.compiledFor(ctx.character ?? null));
    return this.resolver.resolve(ctx);
  }

  // Called once per animation frame (`now` in milliseconds): reads Player
  // 1's controller and hands it to play, the menus or a binding capture.
  pollGamepads(now) {
    const dt = this.lastPoll === null ? 0 : Math.max(0, Math.min(0.1, (now - this.lastPoll) / 1000));
    this.lastPoll = now;
    const state = this.controllers.poll();
    if (!state) {
      if (this.padActive) {
        this.padActive = false;
        this.resolver.release();
        this.padMenuState.dir = null;
        this.padCursorListener?.(null, dt);
      }
      return;
    }
    this.padActive = true;
    if (state.pressed.length || state.axes.some((a) => Math.abs(a) > 0.5)) this.lastDevice = 'gamepad';
    const seconds = now / 1000;
    if (this.captureListener) {
      this.resolver.record({ held: state.held, pressed: [], axes: state.axes }, seconds, { gameplay: false });
      this.padMenuState.dir = null;
      this.captureListener(state);
      return;
    }
    if (this.gameplayActive) {
      const { pause } = this.resolver.record(state, seconds, { gameplay: true });
      if (this.padReset) {
        this.padReset = false;
        this.resolver.reset();
      }
      this.padMenuState.dir = null;
      if (pause) this.padMenuListener?.('start');
      return;
    }
    // Menus: the held buttons are kept up to date (so play, when it
    // starts, finds them stale), never resolved.
    this.resolver.record({ held: state.held, pressed: [], axes: state.axes }, seconds, { gameplay: false });
    if (this.padReset) {
      this.padReset = false;
      this.resolver.reset();
    }
    this._padMenu(state, now, dt);
  }

  _padMenu(state, now, dt) {
    const { held, pressed, axes } = state;
    const listener = this.padMenuListener;
    let dir = null;
    for (const [button, name] of MENU_DIRECTIONS) {
      if (held.has(button)) {
        dir = name;
        break;
      }
    }
    const ms = this.padMenuState;
    if (dir !== ms.dir) {
      ms.dir = dir;
      if (dir) {
        ms.nextRepeat = now + MENU_REPEAT_DELAY;
        listener?.(dir);
      }
    } else if (dir && now >= ms.nextRepeat) {
      ms.nextRepeat = now + MENU_REPEAT;
      listener?.(dir);
    }
    for (const [button, command] of MENU_BUTTONS) {
      if (pressed.includes(button)) listener?.(command);
    }
    this.padCursorListener?.({ x: axes[0], y: axes[1], scroll: axes[3] }, dt);
  }
}
