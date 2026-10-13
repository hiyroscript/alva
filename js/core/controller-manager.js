// Controller connections: the physical controller manager.
//
// Purpose: find the game controllers the browser exposes, tell which are
// supported (js/core/gamepad-devices.js), keep at most MAX_CONTROLLERS of
// them active, assign one to Player 1, and read that one controller's
// buttons and sticks every frame. It never decides what a button does:
// the binding resolver (js/core/controller-resolver.js) and the menus do.
//
// Status (the Home controller button's indicator):
//   'connected'     one to MAX_CONTROLLERS supported controllers
//   'disconnected'  none (or no Gamepad API, or access to it blocked)
//   'tooMany'       more than MAX_CONTROLLERS supported controllers
//
// Order and assignment. Devices keep the order they were first seen in, so
// a controller connected later never displaces an earlier one: the first
// MAX_CONTROLLERS supported devices in that order are active, any further
// one stays inactive (no menus, no gameplay) until one of them goes.
// Player 1 is one active device, never several merged:
//   - the one the player chose (assignPlayer1) whenever it is connected,
//     so it gets Player 1 back as it reconnects (matched by its id);
//   - else the one that already has it;
//   - else the first active device in order, so a single controller
//     simply works and, if Player 1's controller is lost, the next one
//     connected takes over (the player may pick another at any time).
// Four detected controllers are a connection limit, not multiplayer: only
// Player 1's controller is ever read for play.
//
// The browser exposes a gamepad only after a button press on it, may stop
// updating it while the page is hidden, can lack the Gamepad API, or block
// it (a permissions policy throws on getGamepads). None of that throws
// here: the API state says what happened ('available', 'unavailable',
// 'blocked') and the device list is simply empty. refresh() really queries
// the browser again (the connections dialog's Reconnect); a physical
// connection is still up to the player.

import { PAD_BUTTONS, TRIGGERS, identifyController, cleanDeviceName, MODELS } from './gamepad-devices.js';

export const MAX_CONTROLLERS = 4;
export const CONTROLLER_STATUSES = Object.freeze(['connected', 'disconnected', 'tooMany']);

// A trigger counts as pressed from TRIGGER_PRESS of its travel and as let go
// below TRIGGER_RELEASE, so a trigger resting half way never flickers.
export const TRIGGER_PRESS = 0.5;
export const TRIGGER_RELEASE = 0.3;

// The browser's gamepads, or what went wrong reaching them.
function browserGamepads() {
  const nav = globalThis.navigator;
  if (!nav || typeof nav.getGamepads !== 'function') return { api: 'unavailable', pads: [] };
  try {
    return { api: 'available', pads: Array.from(nav.getGamepads() ?? []) };
  } catch {
    // A permissions policy (or a privacy setting) refusing access.
    return { api: 'blocked', pads: [] };
  }
}

// A finite axis value in [-1, 1].
const axis = (value) => (Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);

export class ControllerManager {
  // `source` returns { api, pads } (the browser's by default); `target`
  // receives the connection events (the window by default).
  constructor({ source = browserGamepads, target = globalThis.window } = {}) {
    this.source = source;
    this.api = 'available';
    this.devices = [];
    this.listeners = new Set();
    this.sequence = 0;
    this.order = new Map(); // device key -> first-seen sequence number
    this.signature = null;
    this.player1Key = null;
    // The id string of the controller the player chose for Player 1.
    this.preferredId = null;
    // Player 1's controller as last read: held buttons and the four axes.
    this.held = new Set();
    this.axes = [0, 0, 0, 0];
    this.triggerDown = new Set();
    // Whether the page can read controllers right now (false while it is
    // hidden or has lost focus: every button then reads as released).
    this.suspended = false;
    // The next poll reports no presses: whatever is held on a controller
    // just assigned, or as the page comes back, was pressed before.
    this.fresh = true;
    this.refresh();
    target?.addEventListener?.('gamepadconnected', () => this.refresh());
    target?.addEventListener?.('gamepaddisconnected', () => this.refresh());
  }

  // Calls `fn(manager)` after every change of devices, status or Player 1;
  // returns an unsubscribe.
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) fn(this);
  }

  // Queries the browser again: new controllers found, lost ones removed,
  // the order, the four-controller limit and Player 1 brought up to date.
  // Listeners hear about a real change. Returns the pads read (for poll).
  refresh({ force = false } = {}) {
    let read;
    try {
      read = this.source();
    } catch {
      read = { api: 'blocked', pads: [] };
    }
    const pads = (read?.pads ?? []).filter((p) => p && p.connected !== false);
    const api = read?.api ?? 'available';
    const signature = `${api}|${pads.map((p) => `${p.index}:${p.id}:${p.mapping}:${p.buttons?.length ?? 0}`).join('|')}`;
    if (signature !== this.signature || force) {
      const changed = signature !== this.signature;
      this.signature = signature;
      this.api = api;
      this.rebuild(pads);
      if (changed || force) this.emit();
    }
    return pads;
  }

  rebuild(pads) {
    const keys = new Set();
    const devices = pads.map((pad) => {
      const key = `${pad.index}:${pad.id}`;
      keys.add(key);
      if (!this.order.has(key)) this.order.set(key, this.sequence++);
      const info = identifyController(pad);
      return {
        key, index: pad.index, id: String(pad.id ?? ''),
        name: (info.model && MODELS[info.model].name) || cleanDeviceName(pad.id) || null,
        ...info,
        active: false, excess: false, player1: false,
      };
    });
    for (const key of [...this.order.keys()]) if (!keys.has(key)) this.order.delete(key);
    devices.sort((a, b) => this.order.get(a.key) - this.order.get(b.key));
    let n = 0;
    for (const d of devices) {
      if (!d.supported) continue;
      n++;
      d.active = n <= MAX_CONTROLLERS;
      d.excess = !d.active;
    }
    devices.forEach((d, i) => { d.slot = i + 1; });
    this.devices = devices;
    this.assign();
  }

  // Player 1: kept, recovered or the first active device (see the top).
  assign() {
    const active = this.devices.filter((d) => d.active);
    let p1 = this.preferredId !== null ? active.find((d) => d.id === this.preferredId) ?? null : null;
    if (!p1) p1 = active.find((d) => d.key === this.player1Key) ?? null;
    if (!p1) p1 = active[0] ?? null;
    const key = p1?.key ?? null;
    for (const d of this.devices) d.player1 = d.key === key;
    if (key !== this.player1Key) {
      this.player1Key = key;
      // A new Player 1 controller starts from nothing held, and what is
      // held on it already is no press.
      this.held = new Set();
      this.triggerDown = new Set();
      this.axes = [0, 0, 0, 0];
      this.fresh = true;
    }
  }

  // The device records, in order: { key, index, id, name, supported,
  // family, model, reason, active, excess, player1, slot }.
  get list() {
    return this.devices;
  }

  get supported() {
    return this.devices.filter((d) => d.supported);
  }

  get unsupported() {
    return this.devices.filter((d) => !d.supported);
  }

  get supportedCount() {
    return this.supported.length;
  }

  get status() {
    const n = this.supportedCount;
    if (n === 0) return 'disconnected';
    return n > MAX_CONTROLLERS ? 'tooMany' : 'connected';
  }

  // Player 1's device record, or null.
  get player1() {
    return this.devices.find((d) => d.player1) ?? null;
  }

  // The family Player 1's controller is ('playstation' / 'xbox'), or null.
  get family() {
    return this.player1?.family ?? null;
  }

  // Makes active device `key` Player 1's controller (remembered by its id,
  // so it gets Player 1 back when it reconnects). False for a device that
  // is not connected, supported and active.
  assignPlayer1(key) {
    const device = this.devices.find((d) => d.key === key);
    if (!device?.active) return false;
    this.preferredId = device.id;
    if (this.player1Key === key) return true;
    this.player1Key = key;
    for (const d of this.devices) d.player1 = d.key === key;
    this.held = new Set();
    this.triggerDown = new Set();
    this.axes = [0, 0, 0, 0];
    this.fresh = true;
    this.emit();
    return true;
  }

  // Every button released and the sticks centred until the page can read
  // controllers again (focus lost, page hidden).
  suspend() {
    this.suspended = true;
    this.held = new Set();
    this.triggerDown = new Set();
    this.axes = [0, 0, 0, 0];
  }

  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    this.fresh = true;
  }

  // Reads every controller (a cheap check for connections, every frame:
  // browsers only update gamepads through getGamepads) and Player 1's
  // buttons and sticks. Returns Player 1's state, { device, held, pressed,
  // axes }, `pressed` the buttons that went down since the last poll; or
  // null with no Player 1 controller (or while suspended).
  poll() {
    const pads = this.refresh();
    const device = this.player1;
    if (!device || this.suspended) return null;
    const pad = pads.find((p) => `${p.index}:${p.id}` === device.key);
    if (!pad) return null;
    const held = new Set();
    PAD_BUTTONS.forEach((button, i) => {
      const b = pad.buttons?.[i];
      if (!b) return;
      const value = Number.isFinite(b.value) ? b.value : (b.pressed ? 1 : 0);
      if (TRIGGERS.includes(button)) {
        const was = this.triggerDown.has(button);
        const down = was ? value >= TRIGGER_RELEASE || (b.pressed && value === 0) : value >= TRIGGER_PRESS || (b.pressed && value === 0);
        if (down) this.triggerDown.add(button);
        else this.triggerDown.delete(button);
        if (down) held.add(button);
      } else if (b.pressed || value > 0.5) {
        held.add(button);
      }
    });
    const pressed = this.fresh ? [] : [...held].filter((b) => !this.held.has(b));
    this.fresh = false;
    this.held = held;
    this.axes = [axis(pad.axes?.[0]), axis(pad.axes?.[1]), axis(pad.axes?.[2]), axis(pad.axes?.[3])];
    return { device, held, pressed, axes: this.axes };
  }
}
