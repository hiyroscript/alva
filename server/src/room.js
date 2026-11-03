// A Room: one Durable Object per room, holding its two players' WebSockets
// (the host's and, once someone joins, the guest's). It carries what a room
// needs between them: who is there, each player's fighter and Ready, the
// host's start (with the seed it drew), rematches, leaving, and the match
// itself: each player's packets ({ type: 'm' }, the lockstep's input
// frames and hashes, js/online/lockstep.js) passed to the other player as
// they come.
//
// Privacy: the two browsers never connect to each other, so neither ever
// learns the other's network address (a direct WebRTC link would hand each
// one the other's IP address while it was set up). Everything goes through
// this room, and what a player receives names nobody's address: the room
// as it stands (names, fighters, Ready, connection), the start, and the
// other player's packets. WebRTC signalling is not passed on at all, so
// even an older copy of the game that tried a direct link cannot make one
// through it.
//
// The match's packets are what this room spends most of the free plan's
// requests on (incoming messages at Cloudflare's 20 : 1): the game sends
// at most CONFIG.online.sendIntervalMs apart (30 a second), and the room
// takes at most MATCH_RATE a second from a seat (MATCH_BURST at once),
// drops the rest, and closes a seat's socket that keeps sending far past
// it. A packet is never saved: the room's state is written as it changes,
// and its last activity at most once a minute while a match runs.
//
// Its sockets use the WebSocket Hibernation API (ctx.acceptWebSocket), so a
// room where nobody is sending anything costs no Durable Object duration;
// its state is saved in its storage so it survives hibernation. A plain
// "ping" from a client is answered with "pong" by Cloudflare itself (an
// auto-response) without waking the room.
//
// Lifecycle: the Lobby creates it (POST /init) with the host's seat, and
// reserves the guest's seat when someone joins (POST /reserve). Each player
// then connects (GET /ws?token=…). The room closes, telling whoever is still
// there why: when its host leaves ('host_left': a leave message, or the
// host's socket gone for SEAT_GRACE_MS without reconnecting), or after
// ROOM_IDLE_MINUTES with nothing happening ('expired'). A guest who leaves
// (or stays gone past the grace) frees the seat. Every change is reported to
// the Lobby, with the requests handled since the last report (counted for
// the daily budget: connections and alarms one each, incoming messages at
// Cloudflare's 20 : 1).
//
// Client → room messages (JSON):
//   { type: 'fighter', fighterId }            the player's fighter
//   { type: 'ready', ready, turn }            Ready on or off, with the player's Automatic turn-around
//   { type: 'start', seed, delay }            the host starts (both ready, fighters chosen), with the input delay its browser chose
//   { type: 'end' }                           the match is over: back to the room
//   { type: 'rematch' }                       this player wants a rematch
//   { type: 'm', d }                          a match packet for the other player
//   { type: 'leave' }                         leaving the room
// Room → client:
//   { type: 'room', room, you, players }      the room as it is now (after every change)
//   { type: 'start', match, seed, delay, p1, p2 }   a match starts (p1 the host, p2 the guest; the same delay for both)
//   { type: 'rematch' }                       both want a rematch: the host starts it
//   { type: 'm', d }                          the other player's match packet
//   { type: 'closed', reason }                the room is gone ('host_left', 'expired')
//   { type: 'error', code }

import { validFighterId, validDelay } from './rules.js';
import { json, error, readJson, numberVar } from './http.js';

const MINUTE = 60_000;
// How long a seat waits for its player to (re)connect.
export const SEAT_GRACE_MS = 15_000;
const MESSAGE_LIMIT = 16 * 1024;
// A match packet's largest size (the lockstep's are under 400 bytes).
const PACKET_LIMIT = 2048;
// Cloudflare bills incoming WebSocket messages at 20 : 1.
const MESSAGE_RATE = 1 / 20;
const SEATS = ['host', 'guest'];
// Match packets a seat may send: this many a second on average (the game
// sends at most 30, a hash a second, and a ping or two while measuring the
// trip), this many at once. A seat that keeps sending past it by a whole
// burst is closed ('too_fast').
export const MATCH_RATE = 45;
export const MATCH_BURST = 90;
// The requests handled since the last report to the Lobby that make it
// report again (a long match keeps the daily budget up to date).
const REPORT_EVERY = 50;

export class Room {
  constructor(ctx, env, { now = () => Date.now() } = {}) {
    this.ctx = ctx;
    this.env = env;
    this.now = now;
    this.idleMs = numberVar(env.ROOM_IDLE_MINUTES, 10) * MINUTE;
    this.state = null;
    this.loaded = null;
    // Requests handled since the last report to the Lobby.
    this.unreported = 0;
    // Each seat's allowance of match packets (memory only), and when the
    // room's last activity was last saved.
    this.buckets = {};
    this.activeSavedAt = 0;
    if (globalThis.WebSocketRequestResponsePair && ctx.setWebSocketAutoResponse) {
      ctx.setWebSocketAutoResponse(new globalThis.WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  load() {
    this.loaded ??= (async () => {
      this.state = (await this.ctx.storage.get('room')) ?? null;
    })();
    return this.loaded;
  }

  save() {
    return this.ctx.storage.put('room', this.state);
  }

  get lobby() {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
  }

  // ---- Requests ---------------------------------------------------------------------

  async fetch(request) {
    await this.load();
    this.unreported += 1;
    const url = new URL(request.url);
    switch (`${request.method} ${url.pathname}`) {
      case 'POST /init':
        return this.init(await readJson(request, 4096));
      case 'POST /reserve':
        return this.reserve(await readJson(request, 4096));
      case 'GET /ws':
        return this.upgrade(request, url.searchParams.get('token'));
      default:
        return error('not_found');
    }
  }

  async init(body) {
    if (!body?.id || !body.host?.token) return error('bad_request');
    const t = this.now();
    this.state = {
      id: body.id, code: body.code, name: body.name, mode: body.mode, visibility: body.visibility,
      status: 'open', match: 0, rematchAgreed: false, closed: false, createdAt: t, lastActive: t,
      seats: { host: seat(body.host, t), guest: null },
    };
    await this.save();
    await this.scheduleAlarm();
    return json({ ok: true });
  }

  async reserve(body) {
    const s = this.state;
    if (!s || s.closed) return error('room_not_found');
    if (!body?.token || !body.name) return error('bad_request');
    const guest = s.seats.guest;
    // The same visit joining again (a reload) gets its seat back.
    if (guest && guest.session === body.session) return json({ ok: true, token: guest.token });
    if (guest || s.status !== 'open') return error('room_full');
    if (body.version !== s.seats.host.version) return error('version_mismatch');
    s.seats.guest = seat(body, this.now());
    s.status = 'full';
    s.lastActive = this.now();
    await this.save();
    await this.scheduleAlarm();
    this.broadcast();
    return json({ ok: true, token: body.token });
  }

  // A player's WebSocket, for the seat whose token it brings.
  async upgrade(request, token) {
    const s = this.state;
    if (!s || s.closed) return error('room_not_found');
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return error('bad_request');
    const name = SEATS.find((n) => s.seats[n] && token && s.seats[n].token === token);
    if (!name) return error('forbidden');
    const pair = new globalThis.WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.connect(name, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // `socket` is now seat `name`'s (any older one of its closed).
  async connect(name, socket) {
    const s = this.state;
    for (const old of this.ctx.getWebSockets(name)) {
      if (old === socket) continue;
      try {
        old.close(4000, 'replaced');
      } catch {
        // Already closing.
      }
    }
    this.ctx.acceptWebSocket(socket, [name]);
    socket.serializeAttachment?.({ seat: name });
    const at = s.seats[name];
    at.connected = true;
    at.goneAt = null;
    s.lastActive = this.now();
    await this.save();
    this.broadcast();
    await this.report();
  }

  // ---- Messages ---------------------------------------------------------------------

  seatOf(ws) {
    return ws.deserializeAttachment?.()?.seat ?? SEATS.find((n) => this.ctx.getWebSockets(n).includes(ws)) ?? null;
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    this.unreported += MESSAGE_RATE;
    const s = this.state;
    const name = this.seatOf(ws);
    if (!s || s.closed || !name || !s.seats[name]) return;
    if (typeof raw !== 'string' || raw.length > MESSAGE_LIMIT) return this.send(ws, { type: 'error', code: 'too_large' });
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return this.send(ws, { type: 'error', code: 'bad_request' });
    }
    if (!message || typeof message !== 'object') return;
    s.lastActive = this.now();
    const me = s.seats[name];
    const otherName = name === 'host' ? 'guest' : 'host';
    if (message.type === 'm') return this.relayPacket(ws, name, otherName, message.d, raw.length);
    switch (message.type) {
      case 'fighter': {
        const id = validFighterId(message.fighterId);
        if (!id) return this.send(ws, { type: 'error', code: 'bad_request' });
        me.fighterId = id;
        me.ready = false;
        break;
      }
      case 'ready':
        if (message.ready && !me.fighterId) return this.send(ws, { type: 'error', code: 'bad_request' });
        me.ready = !!message.ready;
        me.turn = message.turn !== false;
        break;
      case 'start':
        return this.start(ws, name, message);
      case 'end':
        if (s.status === 'playing') s.status = s.seats.guest ? 'full' : 'open';
        for (const n of SEATS) if (s.seats[n]) s.seats[n].rematch = false;
        s.rematchAgreed = false;
        await this.save();
        this.broadcast();
        return this.report();
      case 'rematch': {
        me.rematch = true;
        const other = s.seats[otherName];
        if (other?.rematch && other.connected) {
          me.rematch = false;
          other.rematch = false;
          s.rematchAgreed = true;
          await this.save();
          this.broadcast();
          for (const n of SEATS) this.sendSeat(n, { type: 'rematch' });
          return;
        }
        break;
      }
      // WebRTC signalling (an older copy of the game's) is never passed on:
      // no player's address reaches the other.
      case 'signal':
        return;
      case 'leave':
        return name === 'host' ? this.close('host_left') : this.removeGuest();
      default:
        return this.send(ws, { type: 'error', code: 'bad_request' });
    }
    await this.save();
    this.broadcast();
  }

  // The host starts a match: both players there, ready (or a rematch both
  // agreed to), fighters chosen. The room fills in who plays what itself,
  // so a client can only bring the seed.
  async start(ws, name, message) {
    const s = this.state;
    const { host, guest } = s.seats;
    const seed = message.seed;
    const allowed = name === 'host' && guest?.connected && host.fighterId && guest.fighterId
      && ((host.ready && guest.ready && s.status !== 'playing') || s.rematchAgreed);
    if (!allowed || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return this.send(ws, { type: 'error', code: 'bad_request' });
    s.match += 1;
    s.status = 'playing';
    s.rematchAgreed = false;
    for (const n of SEATS) {
      s.seats[n].ready = false;
      s.seats[n].rematch = false;
    }
    await this.save();
    const side = (p) => ({ name: p.name, fighterId: p.fighterId, turn: p.turn !== false });
    // The host's chosen delay, for both (one out of range is left out: both
    // then play the game's own default).
    const delay = validDelay(message.delay);
    for (const n of SEATS) {
      this.sendSeat(n, { type: 'start', match: s.match, seed, ...(delay !== null ? { delay } : {}), p1: side(host), p2: side(guest) });
    }
    this.broadcast();
    await this.report();
  }

  // One match packet, to the other player only, never saved; past the
  // seat's allowance it is dropped, and a seat far past it is closed.
  async relayPacket(ws, name, otherName, d, size) {
    const left = this.allowance(name);
    if (left < -MATCH_BURST) {
      for (const own of this.ctx.getWebSockets(name)) this.closeSocket(own, 4008, 'too_fast');
      return;
    }
    if (left < 0 || size > PACKET_LIMIT || !d || typeof d !== 'object' || Array.isArray(d)) return;
    this.sendSeat(otherName, { type: 'm', d });
    const t = this.now();
    if (t - this.activeSavedAt >= MINUTE) {
      this.activeSavedAt = t;
      await this.save();
    }
    if (this.unreported >= REPORT_EVERY) await this.report();
  }

  // Seat `name`'s allowance of match packets after taking one: below zero
  // the packet is over it.
  allowance(name) {
    const t = this.now();
    const b = (this.buckets[name] ??= { tokens: MATCH_BURST, at: t });
    b.tokens = Math.min(MATCH_BURST, b.tokens + ((t - b.at) / 1000) * MATCH_RATE);
    b.at = t;
    b.tokens -= 1;
    return b.tokens;
  }

  async webSocketClose(ws) {
    await this.load();
    // Completes the closing handshake (a socket already closed ignores it).
    this.closeSocket(ws, 1000, 'closed');
    const s = this.state;
    const name = this.seatOf(ws);
    if (!s || s.closed || !name || !s.seats[name]) return;
    // Another socket of the same seat is still open (a reconnect replaced
    // this one): nothing changes.
    if (this.ctx.getWebSockets(name).some((other) => other !== ws && other.readyState !== 3)) return;
    s.seats[name].connected = false;
    s.seats[name].goneAt = this.now();
    await this.save();
    await this.scheduleAlarm();
    this.broadcast();
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  // ---- Time ---------------------------------------------------------------------------

  // The next moment something may need doing: a seat's grace running out,
  // or the room's idle time.
  async scheduleAlarm() {
    const s = this.state;
    if (!s || s.closed) return;
    const times = [s.lastActive + this.idleMs];
    for (const n of SEATS) {
      const p = s.seats[n];
      if (p && !p.connected) times.push((p.goneAt ?? s.lastActive) + SEAT_GRACE_MS);
    }
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  async alarm() {
    await this.load();
    this.unreported += 1;
    const s = this.state;
    if (!s || s.closed) return;
    const t = this.now();
    const { host, guest } = s.seats;
    if (!host.connected && t - (host.goneAt ?? s.createdAt) >= SEAT_GRACE_MS) return this.close('host_left');
    if (t - s.lastActive >= this.idleMs) return this.close('expired');
    if (guest && !guest.connected && t - (guest.goneAt ?? s.lastActive) >= SEAT_GRACE_MS) {
      await this.removeGuest();
      return;
    }
    await this.scheduleAlarm();
  }

  // ---- Changes -------------------------------------------------------------------------

  async removeGuest() {
    const s = this.state;
    for (const ws of this.ctx.getWebSockets('guest')) this.closeSocket(ws, 1000, 'left');
    s.seats.guest = null;
    s.status = 'open';
    s.rematchAgreed = false;
    if (s.seats.host) {
      s.seats.host.ready = false;
      s.seats.host.rematch = false;
    }
    s.lastActive = this.now();
    await this.save();
    this.broadcast();
    await this.report();
    await this.scheduleAlarm();
  }

  // The room ends: whoever is there is told why, the Lobby forgets it, and
  // its storage is cleared.
  async close(reason) {
    const s = this.state;
    if (!s || s.closed) return;
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { type: 'closed', reason });
      this.closeSocket(ws, 1000, reason);
    }
    s.closed = true;
    await this.report({ closed: true });
    await this.ctx.storage.deleteAlarm?.();
    await this.ctx.storage.deleteAll();
    this.state = { closed: true };
  }

  // The room as each player sees it (never anyone's token or session).
  snapshot(you) {
    const s = this.state;
    const show = (p) => (p ? {
      name: p.name, fighterId: p.fighterId ?? null, ready: !!p.ready, connected: !!p.connected, rematch: !!p.rematch,
    } : null);
    return {
      type: 'room',
      you,
      room: { id: s.id, code: s.code, name: s.name, mode: s.mode, visibility: s.visibility, status: s.status, match: s.match },
      players: { host: show(s.seats.host), guest: show(s.seats.guest) },
    };
  }

  broadcast() {
    if (!this.state || this.state.closed) return;
    for (const n of SEATS) this.sendSeat(n, this.snapshot(n));
  }

  sendSeat(name, message) {
    for (const ws of this.ctx.getWebSockets(name)) this.send(ws, message);
  }

  send(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The socket is closing; its close handler tidies up.
    }
  }

  closeSocket(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  // Tells the Lobby how the room stands, and the requests handled since
  // the last report.
  async report({ closed = false } = {}) {
    const s = this.state;
    if (!s?.id) return;
    const requests = Math.ceil(this.unreported);
    this.unreported = 0;
    const players = s.seats?.guest ? 2 : 1;
    try {
      await this.lobby.fetch('https://lobby/report', {
        method: 'POST',
        body: JSON.stringify({ id: s.id, players, status: s.status, closed: closed || s.closed, requests }),
      });
    } catch {
      // The Lobby's alarm drops a room that stops reporting.
    }
  }
}

// A seat for a player: { name, token, session, version } as the Lobby
// gave them, not connected yet (the grace starts now).
function seat(p, t) {
  return {
    name: p.name, token: p.token, session: p.session ?? null, version: p.version ?? null,
    fighterId: null, ready: false, turn: true, rematch: false, connected: false, goneAt: t,
  };
}
