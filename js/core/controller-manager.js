// Controller connections: the physical controller manager.
//
// Purpose: find the game controllers the browser exposes, tell which are
// supported (js/core/gamepad-devices.js), keep at most MAX_CONTROLLERS of
// them active, assign one to Player 1 (and, for Local Play, another to
// Player 2), and read each player's controller's buttons and sticks every
// frame. It never decides what a button does: the binding resolver
// (js/core/controller-resolver.js) and the menus do.
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
// Player 2 is the first other active device in order: the controller Local
// Play would give the second player (Home's Local play opens only while
// there is one, see localReady). Two controllers of the same model are two
// devices: each is told apart by its Gamepad API index as well as its id.
//
// A Local Play session (startLocal ... endLocal) freezes both assignments:
// Player 1 and Player 2 keep their own controller for the whole session,
// and a controller connected meanwhile (a third, a fourth) never takes
// either seat. A player whose controller is lost has none (missingPlayers)
// until that same controller comes back: the same device (index and id),
// or a device with its id that was not connected when it was lost. Nothing
// else takes the seat but an explicit assignLocal. Outside a session only
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

// The players a controller can be assigned to.
export const PLAYER_SLOTS = Object.freeze(['p1', 'p2']);

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

// One player's controller as last read: held buttons, the four axes and the
// triggers past their threshold. `fresh`: the next read reports no presses
// (whatever is held on a controller just assigned, or as the page comes
// back, was pressed before).
const blankReading = () => ({ held: new Set(), axes: [0, 0, 0, 0], triggerDown: new Set(), fresh: true });

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
    this.player2Key = null;
    // The id string (and key) of the controller the player chose for
    // Player 1.
    this.preferredId = null;
    this.preferredKey = null;
    // The Local Play session, or null: each player's seat, { key, id,
    // lost }, `lost` the device keys connected when its controller went
    // (null while it is connected).
    this.local = null;
    // Each player's controller as last read (see blankReading).
    this.readings = { p1: blankReading(), p2: blankReading() };
    // Whether the page can read controllers right now (false while it is
    // hidden or has lost focus: every button then reads as released).
    this.suspended = false;
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
        active: false, excess: false, player1: false, player2: false,
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

  // Player 1 and Player 2: kept, recovered or the first active devices
  // (see the top); in a Local Play session, each player's own.
  assign() {
    const active = this.devices.filter((d) => d.active);
    let p1;
    let p2;
    if (this.local) {
      // Each player's own controller first, then a lost one recovered.
      const own = (slot) => active.find((d) => d.key === this.local[slot].key) ?? null;
      p1 = own('p1');
      p2 = own('p2');
      if (p2 === p1) p2 = null;
      p1 ??= this.recover('p1', active, p2);
      p2 ??= this.recover('p2', active, p1);
      this.takeSeat('p1', p1);
      this.takeSeat('p2', p2);
    } else {
      // The chosen device itself first: another controller of the same
      // model shares its id.
      const chosen = (d) => d.id === this.preferredId;
      p1 = this.preferredId !== null
        ? active.find((d) => chosen(d) && d.key === this.preferredKey) ?? active.find(chosen) ?? null
        : null;
      if (!p1) p1 = active.find((d) => d.key === this.player1Key) ?? null;
      if (!p1) p1 = active[0] ?? null;
      p2 = active.find((d) => d !== p1) ?? null;
    }
    this.setPlayers(p1?.key ?? null, p2?.key ?? null);
  }

  // In a session, `slot`'s lost controller come back: a device with its id
  // that was not connected when it was lost (never `other`, the other
  // player's), or null.
  recover(slot, active, other) {
    const seat = this.local[slot];
    if (!seat.lost) return null;
    return active.find((d) => d !== other && d.id === seat.id && !seat.lost.has(d.key)) ?? null;
  }

  // `slot`'s seat on `device`, or, without one, lost: the devices
  // connected as it went are remembered (see recover).
  takeSeat(slot, device) {
    const seat = this.local[slot];
    if (device) {
      seat.key = device.key;
      seat.lost = null;
    } else if (!seat.lost) {
      seat.lost = new Set(this.devices.map((d) => d.key));
    }
  }

  // Marks Player 1's and Player 2's devices. A player whose controller
  // changed starts from nothing held, and what is held on the new one
  // already is no press.
  setPlayers(p1Key, p2Key) {
    for (const d of this.devices) {
      d.player1 = d.key === p1Key;
      d.player2 = d.key === p2Key;
    }
    if (p1Key !== this.player1Key) {
      this.player1Key = p1Key;
      this.readings.p1 = blankReading();
    }
    if (p2Key !== this.player2Key) {
      this.player2Key = p2Key;
      this.readings.p2 = blankReading();
    }
  }

  // The device records, in order: { key, index, id, name, supported,
  // family, model, reason, active, excess, player1, player2, slot }.
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

  // Player 2's device record (see the top), or null.
  get player2() {
    return this.devices.find((d) => d.player2) ?? null;
  }

  // `slot`'s ('p1' / 'p2') device record, or null.
  playerDevice(slot) {
    return slot === 'p2' ? this.player2 : slot === 'p1' ? this.player1 : null;
  }

  // The family Player 1's controller is ('playstation' / 'xbox'), or null.
  get family() {
    return this.player1?.family ?? null;
  }

  // Whether Local Play can be played: the Gamepad API answering, and two
  // distinct active supported controllers, one for each player (more may
  // be connected). In a session: both players' own controllers connected.
  get localReady() {
    return this.api === 'available' && !!this.player1 && !!this.player2;
  }

  // ---- Local Play ---------------------------------------------------------------

  // Starts a Local Play session on the two controllers assigned now (see
  // the top), keeping Player 1's own. False, and nothing changes, without
  // two. A session already running is kept as it is.
  startLocal() {
    if (this.local) return true;
    if (!this.localReady) return false;
    const seat = (d) => ({ key: d.key, id: d.id, lost: null });
    this.local = { p1: seat(this.player1), p2: seat(this.player2) };
    this.emit();
    return true;
  }

  // Ends the session: the usual assignment rules again (Player 1's chosen
  // controller first).
  endLocal() {
    if (!this.local) return;
    this.local = null;
    this.assign();
    this.emit();
  }

  get inLocal() {
    return !!this.local;
  }

  // The session's players whose controller is lost, in order ([] outside
  // a session).
  missingPlayers() {
    if (!this.local) return [];
    return PLAYER_SLOTS.filter((slot) => !this.playerDevice(slot));
  }

  // The active controllers a lost seat may be explicitly given (every
  // active one that is neither player's), in order.
  get spareControllers() {
    return this.devices.filter((d) => d.active && !d.player1 && !d.player2);
  }

  // Explicitly seats `slot` on active device `key` for the rest of the
  // session (a lost controller replaced by another the players chose).
  // False outside a session, or for a device that is not active, or is
  // the other player's.
  assignLocal(slot, key) {
    if (!this.local || !PLAYER_SLOTS.includes(slot)) return false;
    const device = this.devices.find((d) => d.key === key);
    const other = this.playerDevice(slot === 'p1' ? 'p2' : 'p1');
    if (!device?.active || device === other) return false;
    this.local[slot] = { key: device.key, id: device.id, lost: null };
    this.assign();
    this.emit();
    return true;
  }

  // Makes active device `key` Player 1's controller (remembered by its id,
  // so it gets Player 1 back when it reconnects). False for a device that
  // is not connected, supported and active.
  // In a Local Play session Player 2's controller is refused: one device
  // never plays both.
  assignPlayer1(key) {
    const device = this.devices.find((d) => d.key === key);
    if (!device?.active) return false;
    if (this.local && device.player2) return false;
    this.preferredId = device.id;
    this.preferredKey = device.key;
    if (this.player1Key === key) return true;
    if (this.local) this.local.p1 = { key: device.key, id: device.id, lost: null };
    this.assign();
    this.emit();
    return true;
  }

  // Every button released and the sticks centred until the page can read
  // controllers again (focus lost, page hidden).
  suspend() {
    this.suspended = true;
    for (const slot of PLAYER_SLOTS) {
      const r = this.readings[slot];
      r.held = new Set();
      r.triggerDown = new Set();
      r.axes = [0, 0, 0, 0];
    }
  }

  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    for (const slot of PLAYER_SLOTS) this.readings[slot].fresh = true;
  }

  // Reads every controller (a cheap check for connections, every frame:
  // browsers only update gamepads through getGamepads) and Player 1's
  // buttons and sticks. Returns Player 1's state, { device, held, pressed,
  // axes }, `pressed` the buttons that went down since the last poll; or
  // null with no Player 1 controller (or while suspended).
  poll() {
    return this.read('p1', this.refresh());
  }

  // Like poll(), for both players at once on one look at the browser:
  // { p1, p2 }, each a state or null. Player 2's controller is read only
  // with `p2` (Local Play): otherwise it is null.
  pollPlayers({ p2 = false } = {}) {
    const pads = this.refresh();
    return { p1: this.read('p1', pads), p2: p2 ? this.read('p2', pads) : null };
  }

  // `slot`'s controller among `pads`: its state, or null.
  read(slot, pads) {
    const device = this.playerDevice(slot);
    if (!device || this.suspended) return null;
    const pad = pads.find((p) => `${p.index}:${p.id}` === device.key);
    if (!pad) return null;
    const r = this.readings[slot];
    const held = new Set();
    PAD_BUTTONS.forEach((button, i) => {
      const b = pad.buttons?.[i];
      if (!b) return;
      const value = Number.isFinite(b.value) ? b.value : (b.pressed ? 1 : 0);
      if (TRIGGERS.includes(button)) {
        const was = r.triggerDown.has(button);
        const down = was ? value >= TRIGGER_RELEASE || (b.pressed && value === 0) : value >= TRIGGER_PRESS || (b.pressed && value === 0);
        if (down) r.triggerDown.add(button);
        else r.triggerDown.delete(button);
        if (down) held.add(button);
      } else if (b.pressed || value > 0.5) {
        held.add(button);
      }
    });
    const pressed = r.fresh ? [] : [...held].filter((b) => !r.held.has(b));
    r.fresh = false;
    r.held = held;
    r.axes = [axis(pad.axes?.[0]), axis(pad.axes?.[1]), axis(pad.axes?.[2]), axis(pad.axes?.[3])];
    return { device, held, pressed, axes: r.axes };
  }
}
