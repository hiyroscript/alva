// The Lobby: one Durable Object (a single named instance) that knows every
// open room. It hands out room ids and codes, serves the public rooms list,
// sends a joining player to the right room, and keeps the server inside
// Cloudflare's free plan (wrangler.toml explains the numbers):
//
//   - at most MAX_ROOMS rooms open at once: one more is refused as `full`;
//   - a daily request budget, counted here and reset at 00:00 UTC (the free
//     plan's own day): every request the Lobby handles, plus what each Room
//     reports it handled (WebSocket connections, messages at the 20 : 1
//     rate Cloudflare bills them, alarms). Once BUDGET_SHARE of
//     DAILY_REQUEST_LIMIT is spent, new rooms are refused as `full` while
//     the rooms already open play on;
//   - per address, at most CREATE_PER_MINUTE rooms created, JOIN_PER_MINUTE
//     joins and LIST_PER_MINUTE list reads a minute (`rate_limited`). The
//     addresses live in memory only, for that minute, and are never stored
//     or logged.
//
// Each room's own state (its two players, their sockets) is its Room's
// (server/src/room.js); the Lobby keeps its listing: id, code, name, host
// name, visibility, mode, players (1 or 2), status ('open', 'full',
// 'playing'), the game version, and when it was created and last active. A
// Room reports every change (POST /report), and its closing; a room that
// stops reporting is dropped by the Lobby's own alarm once it has been
// silent past the idle time. No account, cookie or identity is stored: a
// room's names go with it.
//
// Requests (from the Worker, server/src/index.js, or a Room):
//   GET  /rooms        the public rooms, newest first
//   POST /rooms        create: { name, playerName, visibility, mode, session, version }
//   POST /rooms/join   join: { code } or { id } (public rooms only), with { playerName, session, version }
//   POST /report       a Room's change: { id, players, status, closed, requests }

import {
  validName, validRoomName, validCode, validMode, validVisibility, validRoomId, validSession, validVersion,
  randomHex, randomCode,
} from './rules.js';
import { json, error, readJson, utcDay, numberVar } from './http.js';

const MINUTE = 60_000;
// How often the Lobby's alarm sweeps silent rooms and saves the budget.
const SWEEP_MS = MINUTE;
// A silent room is dropped this long after its idle time (its Room closes
// itself at the idle time; this is the backstop).
const SILENT_GRACE_MS = 5 * MINUTE;

export class Lobby {
  // `ctx` and `env` are the Durable Object's (or a test's fakes). `now` and
  // `random` are for tests.
  constructor(ctx, env, { now = () => Date.now(), random = globalThis.crypto } = {}) {
    this.ctx = ctx;
    this.env = env;
    this.now = now;
    this.random = random;
    this.maxRooms = numberVar(env.MAX_ROOMS, 50);
    this.dailyLimit = numberVar(env.DAILY_REQUEST_LIMIT, 100_000);
    this.budgetShare = numberVar(env.BUDGET_SHARE, 0.8);
    this.idleMs = numberVar(env.ROOM_IDLE_MINUTES, 10) * MINUTE;
    this.limits = {
      create: numberVar(env.CREATE_PER_MINUTE, 10),
      join: numberVar(env.JOIN_PER_MINUTE, 30),
      list: numberVar(env.LIST_PER_MINUTE, 120),
    };
    // Per address, per action: the times of its recent requests (memory
    // only).
    this.hits = new Map();
    this.rooms = null;
    this.budget = null;
    this.loaded = null;
  }

  // The stored rooms and budget, read once per wake-up.
  load() {
    this.loaded ??= (async () => {
      this.rooms = (await this.ctx.storage.get('rooms')) ?? {};
      this.budget = (await this.ctx.storage.get('budget')) ?? { day: utcDay(this.now()), used: 0 };
    })();
    return this.loaded;
  }

  // The rooms, and the budget with them (what the alarm would save anyway).
  saveRooms() {
    return this.ctx.storage.put({ rooms: this.rooms, budget: this.budget });
  }

  saveBudget() {
    return this.ctx.storage.put('budget', this.budget);
  }

  // Counts `n` requests against today's budget (a new UTC day starts it
  // again).
  spend(n = 1) {
    const day = utcDay(this.now());
    if (this.budget.day !== day) this.budget = { day, used: 0 };
    this.budget.used += Math.max(0, Number(n) || 0);
  }

  // Whether today's budget is spent past its share.
  get overBudget() {
    return this.budget.used >= this.dailyLimit * this.budgetShare;
  }

  get openRooms() {
    return Object.values(this.rooms);
  }

  // Whether `ip` may do `action` once more this minute (and counts it).
  allow(ip, action) {
    const key = `${action}:${ip || '?'}`;
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < MINUTE);
    if (recent.length >= this.limits[action]) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.forgetOldHits(t);
    return true;
  }

  forgetOldHits(t) {
    for (const [key, times] of this.hits) if (!times.some((at) => t - at < MINUTE)) this.hits.delete(key);
  }

  // A room's Durable Object.
  room(id) {
    return this.env.ROOM.get(this.env.ROOM.idFromName(id));
  }

  // An alarm is always due within a minute of any request, so the budget
  // counted in memory is saved even with no room open.
  async ensureAlarm() {
    if (this.alarmSet) return;
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(this.now() + SWEEP_MS);
    this.alarmSet = true;
  }

  async fetch(request) {
    await this.load();
    this.spend(1);
    const url = new URL(request.url);
    const ip = request.headers.get('x-alva-ip') ?? '';
    const route = `${request.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /rooms':
          return this.list(ip);
        case 'POST /rooms':
          return await this.create(await readJson(request), ip);
        case 'POST /rooms/join':
          return await this.join(await readJson(request), ip);
        case 'POST /report':
          return await this.report(await readJson(request, 4096));
        default:
          return error('not_found');
      }
    } finally {
      await this.ensureAlarm();
    }
  }

  // The public rooms (newest first), each with whether it can be joined
  // now: open, one player, and of this game version if the caller says
  // which.
  list(ip) {
    if (!this.allow(ip, 'list')) return error('rate_limited');
    const rooms = this.openRooms
      .filter((r) => r.visibility === 'public')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id, name: r.name, host: r.host, mode: r.mode, players: r.players, status: r.status,
        version: r.version, joinable: r.status === 'open' && r.players < 2,
      }));
    return json({ rooms });
  }

  async create(body, ip) {
    if (!body) return error('bad_request');
    const playerName = validName(body.playerName);
    if (!playerName) return error('invalid_name');
    const name = validRoomName(body.name);
    if (!name) return error('invalid_room_name');
    const mode = validMode(body.mode);
    if (!mode) return error('invalid_mode');
    const visibility = validVisibility(body.visibility);
    if (!visibility) return error('invalid_visibility');
    const session = validSession(body.session);
    const version = validVersion(body.version);
    if (!session || !version) return error('bad_request');
    if (!this.allow(ip, 'create')) return error('rate_limited');
    // The free plan's caps (see the top).
    if (this.openRooms.length >= this.maxRooms || this.overBudget) return error('full');

    const codes = new Set(this.openRooms.map((r) => r.code));
    let code = randomCode(this.random);
    for (let tries = 0; codes.has(code); tries++) {
      if (tries > 50) return error('full');
      code = randomCode(this.random);
    }
    const id = randomHex(10, this.random);
    const token = randomHex(16, this.random);
    const t = this.now();
    const record = { id, code, name, host: playerName, visibility, mode, players: 1, status: 'open', version, createdAt: t, lastActive: t };
    const res = await this.room(id).fetch('https://room/init', {
      method: 'POST',
      body: JSON.stringify({ id, code, name, mode, visibility, host: { name: playerName, token, session, version } }),
    });
    if (!res.ok) return error('full');
    this.rooms[id] = record;
    await this.saveRooms();
    return json({ room: publicRoom(record), seat: 'host', token });
  }

  async join(body, ip) {
    if (!body) return error('bad_request');
    if (!this.allow(ip, 'join')) return error('rate_limited');
    const playerName = validName(body.playerName);
    if (!playerName) return error('invalid_name');
    const session = validSession(body.session);
    const version = validVersion(body.version);
    if (!session || !version) return error('bad_request');
    let record = null;
    if (body.code !== undefined) {
      const code = validCode(body.code);
      if (!code) return error('invalid_code');
      record = this.openRooms.find((r) => r.code === code) ?? null;
    } else {
      const id = validRoomId(body.id);
      record = id ? this.rooms[id] ?? null : null;
      // Only a public room is joined from the list.
      if (record && record.visibility !== 'public') record = null;
    }
    if (!record) return error('room_not_found');
    if (record.version !== version) return error('version_mismatch');
    const token = randomHex(16, this.random);
    const res = await this.room(record.id).fetch('https://room/reserve', {
      method: 'POST',
      body: JSON.stringify({ name: playerName, token, session, version }),
    });
    const answer = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (answer.error === 'room_not_found') {
        delete this.rooms[record.id];
        await this.saveRooms();
      }
      return error(answer.error ?? 'room_not_found');
    }
    record.players = 2;
    record.status = 'full';
    record.lastActive = this.now();
    await this.saveRooms();
    return json({ room: publicRoom(record), seat: 'guest', token: answer.token ?? token });
  }

  // A Room's change, and the requests it handled since its last report.
  async report(body) {
    if (!body) return error('bad_request');
    this.spend(Math.min(10_000, Math.max(0, Number(body.requests) || 0)));
    const record = this.rooms[body.id];
    if (!record) return json({ ok: true });
    if (body.closed) delete this.rooms[body.id];
    else {
      if ([1, 2].includes(body.players)) record.players = body.players;
      if (['open', 'full', 'playing'].includes(body.status)) record.status = body.status;
      record.lastActive = this.now();
    }
    await this.saveRooms();
    return json({ ok: true });
  }

  // Every minute while anything is open: rooms silent well past their idle
  // time are dropped (their Room has closed or vanished), and the budget is
  // saved.
  async alarm() {
    await this.load();
    this.alarmSet = false;
    this.spend(1);
    const t = this.now();
    let changed = false;
    for (const r of this.openRooms) {
      if (t - r.lastActive > this.idleMs + SILENT_GRACE_MS) {
        delete this.rooms[r.id];
        changed = true;
      }
    }
    if (changed) await this.saveRooms();
    await this.saveBudget();
    this.forgetOldHits(t);
    if (this.openRooms.length) {
      await this.ctx.storage.setAlarm(t + SWEEP_MS);
      this.alarmSet = true;
    }
  }
}

// What a player is told about a room.
export function publicRoom(r) {
  return { id: r.id, code: r.code, name: r.name, host: r.host, visibility: r.visibility, mode: r.mode, players: r.players, status: r.status };
}
