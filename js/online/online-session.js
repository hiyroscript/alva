// The player's time in Online Play, from the name screen to leaving a room
// (App.online; the screens in js/screens/online-screens.js and
// js/screens/online-battle-screen.js read it and listen to it).
//
// It owns:
//   - who the player is online: their name (chosen every time, the last one
//     remembered in the settings) and a random session id for this visit,
//     kept in memory only, so the server can tell a reconnect;
//   - the room they are in: its WebSocket (js/online/server-client.js
//     RoomLink), the room and both seats as the server last described them,
//     their seat (host or guest) and so their side (the host plays p1);
//   - the link to the other player (`peer`: js/online/room-relay.js), made
//     as soon as both seats are filled and connected, made again if it
//     drops while both are still there. It goes through the room, never
//     straight to the other browser, so neither player ever learns the
//     other's network address: each match packet is a { type: 'm' }
//     message on the room's socket, passed on by the room;
//   - measuring the trip to the other player while the link is open
//     (`delayProbe`, js/online/delay.js: pings through the room), for the match's
//     input delay;
//   - starting a match: the host's browser sends the start, with a seed it
//     draws and the input delay it chose from the trip it measured, once
//     both players are ready with their fighters and the peer link is open
//     (and again after a rematch both accepted). The room fills in who plays
//     what and sends the same start to both (`start`).
//
// Events (on(fn) → fn(type, detail)): 'room' (the room changed), 'peer'
// (the peer link's status changed), 'start' (a match starts: the start
// message), 'rematch' (both accepted one), 'closed' ({ reason }: the room
// is gone, 'host_left', 'expired' or 'lost'), 'error' ({ code }).

import { CONFIG } from '../config.js';
import { RoomServerClient } from './server-client.js';
import { roomRelay } from './room-relay.js';
import { DelayProbe } from './delay.js';
import { sessionId } from './rules.js';
import { listeners } from './transport.js';

// Reconnecting a dropped room socket: this many tries, this far apart (the
// room keeps a seat 15 s).
const RECONNECT_DELAYS_MS = Object.freeze([1000, 2500, 5000]);

const otherSeat = (seat) => (seat === 'host' ? 'guest' : 'host');

// The version a copy of the game plays online as: the game's, marked as one
// whose matches go through the room, so it never shares a room with an
// older copy that connected straight to the other browser ("Other
// version").
export const ONLINE_VERSION = `${CONFIG.version}+relay`;

export class OnlineSession {
  constructor({
    client = new RoomServerClient(), peerFactory = roomRelay, settings = null, version = ONLINE_VERSION,
    random = globalThis.crypto, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  } = {}) {
    this.client = client;
    this.peerFactory = peerFactory;
    this.settings = settings;
    this.version = version;
    this.random = random;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.sessionId = sessionId(random);
    this.name = settings?.onlineName ?? null;
    this.events = listeners();
    this.reset();
  }

  reset() {
    this.room = null;
    this.seat = null;
    this.token = null;
    this.players = { host: null, guest: null };
    this.link = null;
    this.peer = { status: 'idle', link: null, transport: null, reason: null };
    this.delayProbe?.stop();
    this.delayProbe = null;
    this.start = null;
    this.starting = false;
    this.rematchPending = false;
    this.reconnects = 0;
    this.leaving = false;
  }

  on(fn) {
    return this.events.on(fn);
  }

  emit(type, detail) {
    this.events.emit(type, detail);
  }

  get inRoom() {
    return !!this.room;
  }

  // This player's side of the match: the host is p1, the guest p2.
  get localSlot() {
    return this.seat === 'guest' ? 'p2' : 'p1';
  }

  get me() {
    return this.seat ? this.players[this.seat] : null;
  }

  get opponent() {
    return this.seat ? this.players[otherSeat(this.seat)] : null;
  }

  get isHost() {
    return this.seat === 'host';
  }

  // ---- The server ---------------------------------------------------------------

  // Whether the server answers at all (the name screen asks before the
  // lobby): throws an OnlineError ('unavailable', 'rate_limited', …).
  async probe() {
    return this.client.listRooms();
  }

  // Why the server cannot be used now (RoomServerClient.diagnose).
  diagnose() {
    return this.client.diagnose();
  }

  listRooms() {
    return this.client.listRooms();
  }

  async createRoom({ name, visibility, mode }) {
    const data = await this.client.createRoom({
      name, playerName: this.name, visibility, mode, session: this.sessionId, version: this.version,
    });
    this.enter(data);
    return data;
  }

  async joinRoom({ code, id }) {
    const data = await this.client.joinRoom({
      ...(code !== undefined ? { code } : { id }), playerName: this.name, session: this.sessionId, version: this.version,
    });
    this.enter(data);
    return data;
  }

  // Into the room the server gave a seat in.
  enter({ room, seat, token }) {
    if (this.inRoom) this.leaveRoom();
    this.reset();
    this.room = { ...room };
    this.seat = seat === 'guest' ? 'guest' : 'host';
    this.token = token;
    this.players[this.seat] = { name: this.name, fighterId: null, ready: false, connected: false, rematch: false };
    this.connect();
  }

  connect() {
    const link = this.client.openRoom(this.room.id, this.token);
    this.link = link;
    link.onMessage((m) => {
      if (this.link === link) this.handle(m);
    });
    link.onClose(() => {
      if (this.link === link) this.linkLost();
    });
  }

  // The room's socket dropped without the room closing: try again a few
  // times (the room keeps the seat for a while), then give up.
  linkLost() {
    if (this.leaving || !this.room) return;
    const delay = RECONNECT_DELAYS_MS[this.reconnects];
    if (delay === undefined) {
      this.teardown();
      this.emit('closed', { reason: 'lost' });
      return;
    }
    this.reconnects += 1;
    this.link = null;
    this.reconnectTimer = this.setTimer(() => {
      if (this.room && !this.leaving) this.connect();
    }, delay);
  }

  send(message) {
    return this.link?.send(message) ?? false;
  }

  handle(message) {
    switch (message.type) {
      case 'room':
        this.reconnects = 0;
        this.room = { ...this.room, ...message.room };
        if (message.you === 'host' || message.you === 'guest') this.seat = message.you;
        this.players = { host: message.players?.host ?? null, guest: message.players?.guest ?? null };
        if (!this.players.host?.ready || !this.players.guest?.ready) this.starting = false;
        this.emit('room', this.room);
        this.syncPeer();
        this.maybeStart();
        return;
      case 'm':
        // The other player's match packet, for the link.
        this.peer.link?.deliver?.(message.d);
        return;
      case 'start':
        this.starting = false;
        this.rematchPending = false;
        this.start = message;
        this.emit('start', message);
        return;
      case 'rematch':
        this.rematchPending = true;
        this.emit('rematch');
        this.maybeStart();
        return;
      case 'closed':
        this.teardown();
        this.emit('closed', { reason: message.reason ?? 'lost' });
        return;
      case 'error':
        this.starting = false;
        this.emit('error', { code: message.code });
        return;
      default:
    }
  }

  // ---- What the player does in the room --------------------------------------------

  pickFighter(fighterId) {
    if (this.me) {
      this.me.fighterId = fighterId;
      this.me.ready = false;
    }
    this.send({ type: 'fighter', fighterId });
    this.emit('room', this.room);
  }

  // Ready on or off, with this player's Automatic turn-around (the
  // setting goes to the start, so their fighter plays with it online too).
  setReady(ready) {
    if (this.me) this.me.ready = !!ready;
    this.send({ type: 'ready', ready: !!ready, turn: this.settings?.automaticTurnAround !== false });
    this.emit('room', this.room);
  }

  // Ready can be pressed: a fighter chosen, an opponent there, and the
  // peer link open.
  get canReady() {
    return !!this.me?.fighterId && !!this.opponent?.connected && this.peer.status === 'open';
  }

  requestRematch() {
    this.send({ type: 'rematch' });
  }

  // The match is over (or was left): the room is a room again.
  endMatch() {
    this.start = null;
    this.send({ type: 'end' });
  }

  // Leaves the room (the host's leaving closes it for both).
  leaveRoom() {
    if (!this.room) return;
    this.leaving = true;
    this.send({ type: 'leave' });
    this.teardown();
  }

  // Everything let go: the room's socket, the peer link, any reconnect.
  teardown() {
    this.clearTimer(this.reconnectTimer);
    const link = this.link;
    this.link = null;
    link?.close();
    this.closePeer();
    this.reset();
  }

  // ---- The peer link -----------------------------------------------------------------

  // After every change of the room: a link while both players are there,
  // none otherwise.
  syncPeer() {
    const both = !!this.players.host?.connected && !!this.players.guest?.connected;
    if (!both) {
      if (this.peer.status !== 'idle') this.closePeer();
      return;
    }
    if (this.peer.status === 'idle') this.startPeer();
  }

  startPeer() {
    this.closePeer({ quiet: true });
    const link = this.peerFactory({
      initiator: this.isHost,
      send: (d) => this.send({ type: 'm', d }),
      timeoutMs: CONFIG.online.connectTimeoutMs,
    });
    this.peer = { status: 'connecting', link, transport: null, reason: null };
    this.emit('peer', this.peer);
    link.start().then((transport) => {
      if (this.peer.link !== link) {
        transport.close();
        return;
      }
      this.peer = { status: 'open', link, transport, reason: null };
      // The trip to the other player, measured for the match's delay (the
      // host measures; both answer).
      this.delayProbe?.stop();
      this.delayProbe = new DelayProbe({ transport, measuring: this.isHost, setTimer: this.setTimer, clearTimer: this.clearTimer });
      transport.onClose(() => {
        if (this.peer.link !== link) return;
        this.peer = { status: 'idle', link: null, transport: null, reason: 'closed' };
        this.emit('peer', this.peer);
        if (this.room) this.syncPeer();
      });
      this.emit('peer', this.peer);
      this.maybeStart();
    }, (err) => {
      if (this.peer.link !== link) return;
      this.peer = { status: 'failed', link: null, transport: null, reason: err?.message ?? 'failed' };
      this.emit('peer', this.peer);
    });
  }

  closePeer({ quiet = false } = {}) {
    const { link, transport } = this.peer;
    this.peer = { status: 'idle', link: null, transport: null, reason: null };
    this.delayProbe?.stop();
    this.delayProbe = null;
    if (transport) transport.close();
    else link?.cancel?.();
    if (!quiet && (link || transport)) this.emit('peer', this.peer);
  }

  // Tries the link again after it failed.
  retryPeer() {
    if (!this.opponent?.connected) return;
    this.startPeer();
  }

  // ---- Starting a match ---------------------------------------------------------------

  // The host's browser starts a match once it can (see the top).
  maybeStart() {
    if (!this.isHost || this.starting || !this.link || this.peer.status !== 'open') return;
    const { host, guest } = this.players;
    if (!host?.fighterId || !guest?.fighterId || !guest.connected) return;
    const fresh = host.ready && guest.ready && this.room?.status !== 'playing';
    if (!fresh && !this.rematchPending) return;
    this.starting = true;
    this.send({ type: 'start', seed: this.drawSeed(), delay: this.matchDelay() });
  }

  // The input delay for the next match, from the trip measured to the other
  // player (js/online/delay.js); the game's default when too little was.
  matchDelay() {
    return this.delayProbe?.delay() ?? CONFIG.online.inputDelay;
  }

  drawSeed() {
    const word = new Uint32Array(1);
    if (this.random?.getRandomValues) this.random.getRandomValues(word);
    else word[0] = Math.floor(Math.random() * 0x100000000);
    return word[0] >>> 0;
  }
}
