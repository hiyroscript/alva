// The game's side of the room server (server/, docs/development/
// online-server.md): its HTTP calls and a room's WebSocket, and nothing the
// match itself sends (that goes peer to peer).
//
// Every failure is an OnlineError whose `code` the screens translate: the
// server's own codes ('full', 'invalid_name', 'room_not_found',
// 'room_full', 'rate_limited', 'version_mismatch', …) or 'unavailable' when
// the server cannot be reached at all: no address configured
// (CONFIG.online.serverUrl empty), the network failing, a timeout, or an
// answer that is not the server's. "Servers are full" and "Online play is
// unavailable" are told apart this way.

import { CONFIG } from '../config.js';
import { listeners } from './transport.js';

const TIMEOUT_MS = 8000;
// How often an idle room socket says it is still there ("ping" is
// answered by the server without waking the room).
const KEEPALIVE_MS = 30_000;

export class OnlineError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// `url` with no trailing slash.
const trimmed = (url) => String(url ?? '').trim().replace(/\/+$/, '');

export class RoomServerClient {
  constructor({
    baseUrl = CONFIG.online.serverUrl, fetchImpl = globalThis.fetch?.bind(globalThis), WebSocketImpl = globalThis.WebSocket,
    timeoutMs = TIMEOUT_MS,
  } = {}) {
    this.baseUrl = trimmed(baseUrl);
    this.fetch = fetchImpl;
    this.WebSocket = WebSocketImpl;
    this.timeoutMs = timeoutMs;
  }

  // Whether the game has a server to talk to at all.
  get configured() {
    return !!this.baseUrl && typeof this.fetch === 'function';
  }

  async request(path, { method = 'GET', body } = {}) {
    if (!this.configured) throw new OnlineError('unavailable');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      });
    } catch {
      throw new OnlineError('unavailable');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new OnlineError(typeof data?.error === 'string' ? data.error : 'unavailable');
    if (!data || typeof data !== 'object') throw new OnlineError('unavailable');
    return data;
  }

  health() {
    return this.request('/health');
  }

  // Why the server could not be used, for "Online play is unavailable"
  // to say: 'not_configured' (no address), 'unreachable' (no answer at all:
  // down, blocked, or not deployed), 'origin' (it answers, but this page's
  // origin is not one it accepts), 'server_error' (it answers, its Lobby
  // does not), 'relay' (it answers, but has no relay for private
  // connections, so it makes no room) or 'reachable' (it answers and would
  // accept this page).
  // `origin` is this page's, as the server saw it when it says. Never
  // throws.
  async diagnose() {
    const page = globalThis.location?.origin ?? null;
    if (!this.configured) return { code: 'not_configured', origin: page };
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}/health`, { signal: controller?.signal });
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return { code: 'unreachable', origin: page };
      const origin = typeof data.origin === 'string' ? data.origin : page;
      if (data.originAllowed === false) return { code: 'origin', origin };
      if (data.ok === false || data.lobby === false) return { code: 'server_error', origin };
      if (data.relay === false) return { code: 'relay', origin };
      return { code: 'reachable', origin };
    } catch {
      return { code: 'unreachable', origin: page };
    } finally {
      clearTimeout(timer);
    }
  }

  async listRooms() {
    const data = await this.request('/rooms');
    return Array.isArray(data.rooms) ? data.rooms : [];
  }

  createRoom(body) {
    return this.request('/rooms', { method: 'POST', body });
  }

  joinRoom(body) {
    return this.request('/rooms/join', { method: 'POST', body });
  }

  // The room's WebSocket address: the server's own, its scheme http read as
  // ws and https as wss.
  roomSocketUrl(id, token) {
    return `${this.baseUrl.replace(/^http/, 'ws')}/rooms/${encodeURIComponent(id)}/ws?token=${encodeURIComponent(token)}`;
  }

  openRoom(id, token) {
    return new RoomLink(this.roomSocketUrl(id, token), this.WebSocket);
  }
}

// A room's WebSocket: JSON messages in and out, messages sent before it
// opens kept until it does, a keepalive while it is idle. onMessage(fn),
// onClose(fn(code, reason)); close() is final.
export class RoomLink {
  constructor(url, WebSocketImpl = globalThis.WebSocket) {
    this.messages = listeners();
    this.closes = listeners();
    this.queue = [];
    this.closed = false;
    if (typeof WebSocketImpl !== 'function') {
      queueMicrotask(() => this.ended(1006, 'unsupported'));
      return;
    }
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      queueMicrotask(() => this.ended(1006, 'unsupported'));
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      for (const text of this.queue.splice(0)) ws.send(text);
      this.keepalive = setInterval(() => {
        try {
          ws.send('ping');
        } catch {
          // Closing.
        }
      }, KEEPALIVE_MS);
      // Never what keeps a process alive (a test's), where timers can say so.
      this.keepalive?.unref?.();
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      let message;
      try {
        message = JSON.parse(e.data);
      } catch {
        return;
      }
      if (message && typeof message === 'object') this.messages.emit(message);
    };
    ws.onclose = (e) => this.ended(e?.code ?? 1006, e?.reason ?? '');
    ws.onerror = () => {};
  }

  onMessage(fn) {
    return this.messages.on(fn);
  }

  onClose(fn) {
    return this.closes.on(fn);
  }

  send(message) {
    if (this.closed) return false;
    const text = JSON.stringify(message);
    if (this.ws?.readyState === 1) this.ws.send(text);
    else this.queue.push(text);
    return true;
  }

  ended(code, reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.keepalive);
    this.closes.emit(code, reason);
    this.messages.clear();
    this.closes.clear();
  }

  close() {
    if (this.closed) return;
    try {
      this.ws?.close(1000, 'bye');
    } catch {
      // Closing already.
    }
    this.ended(1000, 'bye');
  }
}
