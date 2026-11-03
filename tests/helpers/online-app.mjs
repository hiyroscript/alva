// Online Play on a minimal fake DOM, for its screen tests (imported by
// tests/online/*.test.mjs; not a test file itself). One app with its real
// screens (Home, the online ones and the online battle), real input, menu
// navigation, dialogs and Battle, talking to the real room server's code
// (server/src: the Worker, the Lobby and the Rooms, on the fake Durable
// Objects of server/tests/fakes.mjs) through a fetch and a WebSocket that
// call it in process, and to the other player through in-memory peer links
// (js/online/transport.js). The other player is a headless OnlineSession
// on the same server, driven by the test, and plays its side of a match
// with its own LockstepSession and Battle.

import { fakeSprites, DT } from './fighter-harness.mjs';
import { padSource } from './fake-gamepad.mjs';
import { makeEnv, FakeSocket, ITCH } from '../../server/tests/fakes.mjs';
import worker from '../../server/src/index.js';

const noop = () => {};

class Node {
  parentNode = null;
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
const BOOLEAN_ATTRS = ['hidden', 'disabled', 'inert', 'readonly'];
export class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = { setProperty(name, value) { this[name] = value; } };
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  readonly = false;
  html = '';
  value = '';
  offsetWidth = 0;
  rect = { left: 0, top: 0, width: 40, height: 40 };
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    const names = new Set();
    this.classNames = names;
    this.classList = {
      add: (...n) => n.forEach((c) => names.add(c)),
      remove: (...n) => n.forEach((c) => names.delete(c)),
      contains: (c) => names.has(c),
      toggle: (c, on = !names.has(c)) => { on ? names.add(c) : names.delete(c); return on; },
    };
  }
  set className(v) { this.classNames.clear(); v.split(/\s+/).filter(Boolean).forEach((c) => this.classNames.add(c)); }
  get className() { return [...this.classNames].join(' '); }
  setAttribute(name, value) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = true;
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) return this[name] ? '' : null;
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = false;
    else this.attrs.delete(name);
  }
  get id() { return this.getAttribute('id'); }
  get type() { return this.getAttribute('type') ?? (this.tagName === 'INPUT' ? 'text' : undefined); }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  get innerHTML() { return this.html; }
  get firstChild() { return this.children[0] ?? null; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, preventDefault: noop, ...event }); }
  click(detail = 0) {
    if (this.disabled) return;
    this.dispatch('click', { detail, preventDefault: noop });
  }
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    globalThis.document.activeElement = this;
    this.dispatch('focus');
  }
  blur() { if (globalThis.document.activeElement === this) globalThis.document.activeElement = globalThis.document.body; }
  select() { this.selected = true; }
  // Typing into a field: its value, then its input event.
  type_(text) {
    this.value = text;
    this.dispatch('input');
  }
  matches(selector) {
    return selector.split(',').map((s) => s.trim()).some((s) => {
      if (s.startsWith('.')) return s.slice(1).split('.').every((c) => this.classNames.has(c));
      const attr = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (attr) return attr[2] === undefined ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2];
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches?.(selector)) return n;
    return null;
  }
  contains(el) {
    for (let n = el; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (n) => n.children.forEach((c) => {
      if (!(c instanceof Element)) return;
      if (c.matches(selector)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return this.rect; }
  scrollBy() {}
  scrollIntoView() {}
  setPointerCapture() {}
  hasPointerCapture() { return false; }
  getContext() { return (this.ctx ??= fakeContext()); }
}

function fakeContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (key === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

const sections = new Map();
export const windowListeners = new Map();
globalThis.Node = Node;
globalThis.Path2D = class {
  constructor() { return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop) }); }
};
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); },
  removeEventListener: noop,
};
globalThis.requestAnimationFrame = noop;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  hidden: false,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: (selector) => {
    const id = selector.match(/data-screen="([\w-]+)"/)?.[1];
    if (!sections.has(id)) sections.set(id, new Element('section'));
    return sections.get(id);
  },
  getElementById: () => new Element('div'),
  addEventListener: noop,
  removeEventListener: noop,
  hasFocus: () => true,
};

const { CONFIG } = await import('../../js/config.js');
const { MAPS } = await import('../../js/data/maps.js');
const { DEFAULT_DIFFICULTY } = await import('../../js/data/difficulty.js');
const { ConfirmDialog } = await import('../../js/ui/overlays.js');
const { Settings } = await import('../../js/core/settings.js');
const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { ControllerManager } = await import('../../js/core/controller-manager.js');
const { InputManager } = await import('../../js/core/input-manager.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const online = await import('../../js/screens/online-screens.js');
const { OnlineBattleScreen } = await import('../../js/screens/online-battle-screen.js');
const { OnlineSession, ONLINE_VERSION } = await import('../../js/online/online-session.js');
const { RoomServerClient } = await import('../../js/online/server-client.js');
const { memoryTransportPair } = await import('../../js/online/transport.js');
const { LockstepSession } = await import('../../js/online/lockstep.js');
const { readStart } = await import('../../js/online/match-setup.js');
const { Battle } = await import('../../js/game/battle.js');

export const SERVER_URL = 'https://alva-rooms.test.workers.dev';
export const settle = () => new Promise((resolve) => setImmediate(resolve));
export async function settleAll(n = 6) {
  for (let i = 0; i < n; i++) await settle();
}

// The room server, in process: its fetch (through the Worker's own entry,
// so its error handling too) and its WebSocket. Every request comes from
// `origin`, the page's (itch.io's game host by default).
export function backend(vars = {}, { origin = ITCH } = {}) {
  const made = makeEnv(vars, { start: Date.now() });
  const { env } = made;
  const fetchImpl = async (url, init = {}) => {
    const req = new Request(url, { ...init, headers: { ...(init.headers ?? {}), origin } });
    return worker.fetch(req, env);
  };
  // A WebSocket into a Room: what the client sends is the Room's message;
  // what the Room sends the client's, a tick later as on a real network.
  class FakeWebSocket {
    constructor(url) {
      this.readyState = 0;
      const m = url.match(/\/rooms\/([0-9a-f]+)\/ws\?token=([0-9a-f]+)/);
      const room = m ? env.ROOM.object(m[1]) : null;
      const seat = room?.state && ['host', 'guest'].find((n) => room.state.seats?.[n]?.token === m[2]);
      this.room = room;
      const client = this;
      this.server = new FakeSocket();
      this.server.send = (text) => {
        if (client.readyState !== 1) return;
        setImmediate(() => client.readyState === 1 && client.onmessage?.({ data: text }));
      };
      const close = this.server.close.bind(this.server);
      this.server.close = (code, reason) => {
        close(code, reason);
        setImmediate(() => client.closedByServer(code, reason));
      };
      setImmediate(async () => {
        if (!seat) {
          this.readyState = 3;
          this.onclose?.({ code: 1006, reason: '' });
          return;
        }
        this.readyState = 1;
        this.onopen?.();
        await room.connect(seat, this.server);
      });
    }
    send(text) {
      if (this.readyState !== 1) throw new Error('not open');
      if (text === 'ping') return;
      this.room.webSocketMessage(this.server, text);
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.server.readyState = 3;
      this.room.webSocketClose(this.server, 1000, 'bye', true);
    }
    closedByServer(code, reason) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.({ code, reason });
    }
  }
  return { ...made, fetchImpl, WebSocket: FakeWebSocket };
}

// Links for both players of a room, joined in memory in place of the
// room's relay (js/online/room-relay.js) so a test steps the match frame
// by frame: once both players' links have started, they resolve with the
// two ends of a pair (`hub.pair`, delivered by the test: the host's end is
// `a`). With `hub.fail`, every link fails ("Couldn't connect"). Tests of
// the relay itself use none (boot({ hub: null })).
export function peerHub() {
  const hub = { waiting: null, pair: null, pairs: [], fail: false, links: 0 };
  hub.factory = ({ initiator }) => {
    hub.links += 1;
    const link = {
      initiator,
      start() {
        return new Promise((resolve, reject) => {
          link.resolve = resolve;
          link.reject = reject;
          if (hub.fail) {
            queueMicrotask(() => reject(new Error('timeout')));
            return;
          }
          const other = hub.waiting;
          if (!other || other.initiator === initiator) {
            hub.waiting = link;
            return;
          }
          hub.waiting = null;
          const pair = memoryTransportPair();
          hub.pair = pair;
          hub.pairs.push(pair);
          const [host, guest] = initiator ? [link, other] : [other, link];
          queueMicrotask(() => {
            host.resolve(pair.a);
            guest.resolve(pair.b);
          });
        });
      },
      cancel() {
        if (hub.waiting === link) hub.waiting = null;
        link.reject?.(new Error('cancelled'));
      },
    };
    return link;
  };
  return hub;
}

// A session for the other player, on the same server and peer hub,
// without screens.
export function otherPlayer(server, hub, { name = 'Sam' } = {}) {
  const session = new OnlineSession({
    client: new RoomServerClient({ baseUrl: SERVER_URL, fetchImpl: server.fetchImpl, WebSocketImpl: server.WebSocket }),
    ...(hub ? { peerFactory: hub.factory } : {}),
    version: ONLINE_VERSION,
  });
  session.name = name;
  const events = [];
  session.on((type, detail) => events.push([type, detail]));
  return { session, events };
}

// The other player's side of a match: its own lockstep and Battle on its
// peer link, from the start the room sent, with `script(n)` its inputs
// (and, for a match through the room as the game plays it, its `clock` and
// `sendIntervalMs`).
export function otherSide(player, start, { script = () => null, clock, sendIntervalMs } = {}) {
  const setup = readStart(start);
  let n = 0;
  const lockstep = new LockstepSession({
    transport: player.session.peer.transport, localSlot: player.session.localSlot, match: setup.match,
    sampleLocal: () => script(n++),
    ...(clock ? { clock } : {}),
    ...(sendIntervalMs !== undefined ? { sendIntervalMs } : {}),
  });
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: setup.map, mode: 'online', p1Def: setup.p1Def, p2Def: setup.p2Def,
    p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input: lockstep.input, seed: setup.seed,
    automaticTurnAround: setup.automaticTurnAround, labels: setup.labels,
  });
  lockstep.attach(battle);
  const ends = [];
  lockstep.on((type, detail) => {
    if (type === 'end') ends.push(detail.reason);
  });
  return { lockstep, battle, ends };
}

// The app: Home, the online screens and the online battle, over `server`
// (`serverUrl` empty: none configured), its connectivity `online` (a fake that the
// test switches: connectivity.set(false)), the peer `hub`.
export function boot({ server = backend(), hub = peerHub(), serverUrl = SERVER_URL, settings = new Settings(null), isOnline = true } = {}) {
  // An earlier boot's input stops listening.
  windowListeners.clear();
  const loading = { error: null, show: noop, hide: noop, setProgress: noop, showError(message, opts) { this.error = { message, opts }; } };
  const controllers = new ControllerManager({ source: padSource([]), target: null });
  const input = new InputManager(CONFIG.bindings, { controllers });
  const listeners = new Set();
  const connectivity = {
    online: isOnline,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    set(on) {
      if (on === this.online) return;
      this.online = on;
      for (const fn of [...listeners]) fn(on);
    },
  };
  const app = {
    config: CONFIG,
    selection: {
      mode: 'quick-battle', playType: 'custom', difficulty: DEFAULT_DIFFICULTY, characterId: 'test-a', cpuCharacterId: 'test-a', mapId: MAPS[0].id,
      watch: { difficulty: DEFAULT_DIFFICULTY, cpu1CharacterId: 'test-a', cpu2CharacterId: 'test-a', mapId: MAPS[0].id },
      local: { mode: 'quick-battle', p1CharacterId: 'test-a', p2CharacterId: 'test-a', mapId: MAPS[0].id },
      online: { characterId: 'test-a' },
    },
    controllers,
    input,
    connectivity,
    settings,
    device: { reducedMotion: true, blockedPortrait: false, touchUI: false },
    audio: { play: noop },
    loading,
    loadCharacter: (id, onProgress) => { onProgress?.(1, 1); return Promise.resolve(fakeSprites()); },
    getSprites: () => fakeSprites(),
    resetCharacter: noop,
    startLocalPlay: () => false,
    endLocalPlay: noop,
  };
  app.online = new OnlineSession({
    client: new RoomServerClient({ baseUrl: serverUrl, fetchImpl: server.fetchImpl, WebSocketImpl: server.WebSocket }),
    ...(hub ? { peerFactory: hub.factory } : {}),
    settings,
  });
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  app.dialog = new ConfirmDialog(new Element('div'), app);
  app.createRoomDialog = new online.CreateRoomDialog(new Element('div'), app);
  const screens = {
    home: new HomeScreen(app),
    name: new online.OnlineNameScreen(app),
    lobby: new online.OnlineLobbyScreen(app),
    room: new online.OnlineRoomScreen(app),
    fighter: new online.OnlineFighterScreen(app),
    battle: new OnlineBattleScreen(app),
  };
  screens.room.revealMs = 0;
  for (const s of Object.values(screens)) app.screens.register(s);
  online.routeOnlineEvents(app);
  // The App's own: offline anywhere in Online Play ends it.
  connectivity.onChange((on) => {
    if (on || !app.screens.current?.id?.startsWith('online-')) return;
    app.online.leaveRoom();
    app.screens.go('home', {}, { reset: true });
    online.showNotice(app, 'offline');
  });
  app.screens.go('home');
  // The online battle's clock (its waits and its send interval): simulated
  // time, moved on by each frame, so a test runs a match as fast as it
  // likes. A test may set its own (screens.battle.lockstepClock).
  let simulated = 0;
  screens.battle.lockstepClock = () => simulated;
  // One animation frame of the online battle (and the other side's, and the
  // network between them).
  const frame = (other = null, dt = DT) => {
    simulated += dt * 1000;
    input.pollGamepads(performance.now());
    const screen = screens.battle;
    if (app.screens.current === screen) screen.update(dt);
    other?.lockstep.advance(dt);
    for (const pair of hub?.pairs ?? []) pair.deliver();
  };
  const key = (code) => {
    const e = { code, key: code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
    for (const fn of windowListeners.get('keydown') ?? []) fn(e);
    for (const fn of windowListeners.get('keyup') ?? []) fn(e);
  };
  return { app, screens, server, hub, connectivity, frame, key };
}

export const current = (app) => app.screens.current.id;
