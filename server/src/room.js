// A Room: one Durable Object per room, holding its two players' WebSockets
// (the host's and, once someone joins, the guest's). It relays only what a
// room needs between them: who is there, each player's fighter and Ready,
// the host's start (with the seed it drew), rematches, leaving, and the
// WebRTC signalling (offer, answer, ICE candidates) that lets the two
// browsers connect to each other. The match itself never comes through
// here: its inputs go between the two browsers (js/online/lockstep.js),
// through a TURN relay, so a match costs the server a handful of
// messages, not sixty a second.
//
// Privacy (server/src/privacy.js): no player ever learns another's
// network address. Each player's browser connects only through the relay,
// with credentials this room hands it ('relay'), and every signalling
// message is scrubbed of addresses before it is passed on. What a player
// sees of the other is their name, fighter, Ready and connection, never a
// token, a session or an address.
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
//   { type: 'start', seed }                   the host starts (both ready, fighters chosen)
//   { type: 'end' }                           the match is over: back to the room
//   { type: 'rematch' }                       this player wants a rematch
//   { type: 'signal', data }                  WebRTC signalling for the other player (scrubbed)
//   { type: 'relay' }                         relay credentials for this player's next peer link
//   { type: 'leave' }                         leaving the room
// Room → client:
//   { type: 'room', room, you, players }      the room as it is now (after every change)
//   { type: 'start', match, seed, p1, p2 }    a match starts (p1 the host, p2 the guest)
//   { type: 'rematch' }                       both want a rematch: the host starts it
//   { type: 'signal', data }                  the other player's signalling, with no address but the relay's
//   { type: 'relay', iceServers }             this player's relay (TURN) servers, or { type: 'relay', error }
//   { type: 'closed', reason }                the room is gone ('host_left', 'expired')
//   { type: 'error', code }

import { validFighterId } from './rules.js';
import { json, error, readJson, numberVar } from './http.js';
import { scrubSignal, hasRelay, relayServers } from './privacy.js';

const MINUTE = 60_000;
// How long a seat waits for its player to (re)connect.
export const SEAT_GRACE_MS = 15_000;
const MESSAGE_LIMIT = 16 * 1024;
// Cloudflare bills incoming WebSocket messages at 20 : 1.
const MESSAGE_RATE = 1 / 20;
const SEATS = ['host', 'guest'];
// Relay credentials a seat may ask for: this many in this long (a new
// peer link, a retry, a reconnect each ask once).
const RELAY_PER_WINDOW = 10;
const RELAY_WINDOW_MS = 10 * MINUTE;

export class Room {
  // `now` and `fetch` (the TURN service's) are for tests.
  constructor(ctx, env, { now = () => Date.now(), fetch = globalThis.fetch?.bind(globalThis) } = {}) {
    this.ctx = ctx;
    this.env = env;
    this.now = now;
    this.fetchImpl = fetch;
    this.idleMs = numberVar(env.ROOM_IDLE_MINUTES, 10) * MINUTE;
    this.state = null;
    this.loaded = null;
    // Requests handled since the last report to the Lobby.
    this.unreported = 0;
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
      case 'signal': {
        // Nothing that could name an address is passed on.
        const data = scrubSignal(message.data);
        if (!data) return;
        this.sendSeat(otherName, { type: 'signal', data });
        return;
      }
      case 'relay':
        return this.relay(ws, name);
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
    for (const n of SEATS) this.sendSeat(n, { type: 'start', match: s.match, seed, p1: side(host), p2: side(guest) });
    this.broadcast();
    await this.report();
  }

  // Relay credentials for this player's next peer link: only with the other
  // seat taken, at most RELAY_PER_WINDOW per RELAY_WINDOW_MS, and only to
  // this player. Without a TURN key (or with the service failing) the
  // player is told 'relay_unavailable', and no link is made at all.
  async relay(ws, name) {
    const s = this.state;
    const me = s.seats[name];
    if (!s.seats[name === 'host' ? 'guest' : 'host']) return this.send(ws, { type: 'relay', error: 'bad_request' });
    const t = this.now();
    me.relayAt = (me.relayAt ?? []).filter((at) => t - at < RELAY_WINDOW_MS);
    if (me.relayAt.length >= RELAY_PER_WINDOW) return this.send(ws, { type: 'relay', error: 'rate_limited' });
    me.relayAt.push(t);
    await this.save();
    if (!hasRelay(this.env)) return this.send(ws, { type: 'relay', error: 'relay_unavailable' });
    try {
      this.send(ws, { type: 'relay', iceServers: await relayServers(this.env, this.fetchImpl) });
    } catch (err) {
      console.error('[alva-rooms] the TURN service gave no relay credentials:', err?.message ?? err);
      this.send(ws, { type: 'relay', error: 'relay_unavailable' });
    }
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
