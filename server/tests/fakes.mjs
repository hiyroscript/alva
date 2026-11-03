// Stand-ins for what Cloudflare gives the room server, so its Lobby, Rooms
// and Worker run under `node --test` with no account and no network
// (imported by the *.test.mjs files beside it; not a test file itself):
// Durable Object storage (values copied as storage copies them) with its
// alarm, the state object with hibernatable WebSockets and their tags,
// sockets that record what they are sent, and namespaces that hand out one
// object per name, wired to each other as in production.

import { Lobby } from '../src/lobby.js';
import { Room } from '../src/room.js';

const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class FakeStorage {
  constructor() {
    this.data = new Map();
    this.alarm = null;
    this.writes = 0;
  }

  async get(key) {
    return copy(this.data.get(key));
  }

  async put(key, value) {
    const entries = typeof key === 'object' ? Object.entries(key) : [[key, value]];
    for (const [k, v] of entries) {
      this.data.set(k, copy(v));
      this.writes += 1;
    }
  }

  async delete(key) {
    return this.data.delete(key);
  }

  async deleteAll() {
    this.data.clear();
  }

  async getAlarm() {
    return this.alarm;
  }

  async setAlarm(at) {
    this.alarm = at;
  }

  async deleteAlarm() {
    this.alarm = null;
  }
}

export class FakeSocket {
  constructor() {
    this.sent = [];
    this.readyState = 1;
    this.closed = null;
    this.attachment = null;
  }

  send(text) {
    if (this.readyState !== 1) throw new Error('closed');
    this.sent.push(JSON.parse(text));
  }

  close(code, reason) {
    if (this.readyState === 3) throw new Error('already closed');
    this.readyState = 3;
    this.closed = { code, reason };
  }

  serializeAttachment(value) {
    this.attachment = copy(value);
  }

  deserializeAttachment() {
    return copy(this.attachment);
  }

  // The messages of `type` it was sent.
  of(type) {
    return this.sent.filter((m) => m.type === type);
  }

  get last() {
    return this.sent.at(-1);
  }
}

export class FakeState {
  constructor() {
    this.storage = new FakeStorage();
    this.sockets = [];
  }

  acceptWebSocket(ws, tags = []) {
    this.sockets.push({ ws, tags });
  }

  getWebSockets(tag) {
    return this.sockets.filter((s) => s.ws.readyState !== 3 && (tag === undefined || s.tags.includes(tag))).map((s) => s.ws);
  }

  blockConcurrencyWhile(fn) {
    return fn();
  }
}

// A namespace whose objects are made by `make(state, name)`, one per name.
export class FakeNamespace {
  constructor(make) {
    this.make = make;
    this.objects = new Map();
  }

  idFromName(name) {
    return name;
  }

  get(id) {
    if (!this.objects.has(id)) this.objects.set(id, this.make(new FakeState(), id));
    const object = this.objects.get(id);
    return { fetch: (url, init) => object.fetch(new Request(url, init)), object };
  }

  object(id) {
    return this.get(id).object;
  }
}

// Cloudflare's TURN service as a test sees it: every request it was sent
// (`turn.requests`), answered with credentials in the service's own shape,
// or failing while `turn.fail` is set.
export function fakeTurn() {
  const turn = { requests: [], fail: false, issued: 0 };
  turn.fetch = async (url, init = {}) => {
    turn.requests.push({ url: String(url), method: init.method, headers: { ...init.headers }, body: init.body ? JSON.parse(init.body) : null });
    if (turn.fail) return new Response('{"error":"down"}', { status: 503 });
    turn.issued += 1;
    return new Response(JSON.stringify({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
        {
          urls: [
            'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp',
            'turn:turn.cloudflare.com:3478?transport=tcp', 'turn:turn.cloudflare.com:80?transport=tcp',
            'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp',
          ],
          username: `user-${turn.issued}`,
          credential: `secret-${turn.issued}`,
        },
      ],
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  return turn;
}

// The server's environment: its variables (wrangler.toml's, overridden by
// `vars`; a TURN key is set unless `vars` empties it), a Lobby namespace and
// a Room namespace wired together, one clock (`clock.now`, milliseconds), a
// seeded source of random bytes and a fake TURN service (`turn`).
export function makeEnv(vars = {}, { start = Date.UTC(2026, 10, 3, 12) } = {}) {
  const clock = { now: start };
  const now = () => clock.now;
  let seed = 7;
  const random = {
    getRandomValues(bytes) {
      for (let i = 0; i < bytes.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        bytes[i] = seed >>> 24;
      }
      return bytes;
    },
  };
  const env = {
    ALLOWED_ORIGINS: 'https://html-classic.itch.zone,https://html.itch.zone,https://*.itch.zone,http://localhost:*,http://127.0.0.1:*',
    MAX_ROOMS: '50', DAILY_REQUEST_LIMIT: '100000', BUDGET_SHARE: '0.8', ROOM_IDLE_MINUTES: '10',
    CREATE_PER_MINUTE: '10', JOIN_PER_MINUTE: '30', LIST_PER_MINUTE: '120',
    TURN_KEY_ID: 'test-turn-key', TURN_KEY_API_TOKEN: 'test-turn-token',
    ...vars,
  };
  const turn = fakeTurn();
  env.LOBBY = new FakeNamespace((state) => new Lobby(state, env, { now, random }));
  env.ROOM = new FakeNamespace((state) => new Room(state, env, { now, fetch: turn.fetch }));
  return { env, clock, turn, lobby: () => env.LOBBY.object('lobby'), room: (id) => env.ROOM.object(id) };
}

export const ITCH = 'https://html-classic.itch.zone';
export const VERSION = '0.1.0';

// A request to the Worker from the game (an allowed origin by default).
export function gameRequest(path, { method = 'GET', body, origin = ITCH, ip = '203.0.113.7', headers = {} } = {}) {
  return new Request(`https://alva-rooms.example.workers.dev${path}`, {
    method,
    headers: { ...(origin ? { origin } : {}), 'cf-connecting-ip': ip, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let sessions = 0;
export const newSession = () => (++sessions).toString(16).padStart(16, 'a');

export const createBody = (over = {}) => ({
  name: "Chris's room", playerName: 'Chris', visibility: 'public', mode: 'quick-battle', session: newSession(), version: VERSION, ...over,
});

export const joinBody = (over = {}) => ({ playerName: 'Sam', session: newSession(), version: VERSION, ...over });
