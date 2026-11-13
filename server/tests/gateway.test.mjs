// Run with node --test server/tests/gateway.test.mjs. The pages.dev gateway
// (server/gateway): every request reaches the Worker unchanged, so the
// Worker answers as at its own address (routes, origins, CORS, the caller's
// address for its limits), and a gateway that cannot reach the Worker says
// so in the shapes the game reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import gateway from '../gateway/public/_worker.js';
import worker from '../src/index.js';
import { RoomServerClient } from '../../js/online/server-client.js';
import { makeEnv, gameRequest, createBody, joinBody, VERSION } from './fakes.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const setting = (toml, key) => toml.match(new RegExp(`^${key} = "([^"]+)"`, 'm'))?.[1];

// The gateway in front of the real Worker, as Cloudflare wires it: the
// ROOMS service binding hands the request object itself to the Worker.
function wired(vars) {
  const { env } = makeEnv(vars);
  const seen = [];
  const ROOMS = { fetch: (request) => { seen.push(request); return worker.fetch(request, env); } };
  return { through: (request) => gateway.fetch(request, { ROOMS }), seen, env };
}

test('the request itself reaches the Worker, and its answer comes back as it is', async () => {
  const { through, seen, env } = wired();
  const request = gameRequest('/health');
  const res = await through(request);
  assert.equal(seen[0], request, 'the same request: method, headers, body and all');
  const direct = await worker.fetch(gameRequest('/health'), env);
  assert.equal(res.status, direct.status);
  assert.deepEqual(await res.json(), await direct.json());
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('through the gateway: rooms are made and joined, other origins refused, the caller\'s address kept', async () => {
  const { through } = wired({ CREATE_PER_MINUTE: '1' });
  const created = await through(gameRequest('/rooms', { method: 'POST', body: createBody() }));
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone');
  const { room } = await created.json();
  const joined = await through(gameRequest('/rooms/join', { method: 'POST', body: joinBody({ code: room.code }) }));
  assert.equal((await joined.json()).seat, 'guest');
  const listed = await (await through(gameRequest('/rooms'))).json();
  assert.equal(listed.rooms.length, 1);
  // The per-address limit still sees each caller's own address.
  const again = await through(gameRequest('/rooms', { method: 'POST', body: createBody() }));
  assert.deepEqual(await again.json(), { error: 'rate_limited' });
  const someoneElse = await through(gameRequest('/rooms', { method: 'POST', body: createBody(), ip: '198.51.100.9' }));
  assert.equal(someoneElse.status, 200);
  const evil = await through(gameRequest('/rooms', { origin: 'https://evil.example' }));
  assert.equal(evil.status, 403);
  assert.deepEqual(await evil.json(), { error: 'origin' });
});

test('a gateway that cannot reach the Worker answers server_error (ok: false), readable, and logged', async () => {
  const logged = [];
  const error = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    for (const env of [{}, undefined, { ROOMS: { fetch: () => Promise.reject(new Error('no such service')) } }]) {
      const res = await gateway.fetch(gameRequest('/rooms'), env);
      assert.equal(res.status, 502);
      assert.deepEqual(await res.json(), { ok: false, service: 'alva-online', error: 'server_error' });
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    }
  } finally {
    console.error = error;
  }
  assert.ok(logged.some((line) => line.includes('ROOMS service binding is missing')));
  assert.ok(logged.some((line) => line.includes('GET /rooms: the alva-rooms Worker did not answer')));
});

test('the game reads a broken gateway as "rooms not working", and a working one as the server', async () => {
  const broken = new RoomServerClient({ baseUrl: 'https://alva-online.pages.dev', fetchImpl: (url, init) => gateway.fetch(new Request(url, init), {}) });
  await assert.rejects(broken.listRooms({ version: VERSION }), { code: 'server_error' });
  assert.equal((await broken.diagnose({ version: VERSION })).code, 'server_error');
  const { through } = wired();
  const origin = 'https://html-classic.itch.zone';
  const working = new RoomServerClient({
    baseUrl: 'https://alva-online.pages.dev',
    fetchImpl: (url, init) => through(new Request(url, { ...init, headers: { ...init?.headers, origin, 'cf-connecting-ip': '203.0.113.7' } })),
  });
  assert.deepEqual(await working.listRooms({ version: VERSION }), []);
  assert.equal((await working.diagnose({ version: VERSION })).code, 'reachable');
  // Through the gateway too, another version is outdated.
  await assert.rejects(working.listRooms({ version: '0.9.0' }), { code: 'outdated' });
  assert.equal((await working.diagnose({ version: '0.9.0' })).code, 'outdated');
  assert.equal(working.roomSocketUrl('abc', 't'), 'wss://alva-online.pages.dev/rooms/abc/ws?token=t');
});

test('its configuration: a Pages project bound to the Worker by the Worker\'s own name', () => {
  const toml = read('../gateway/wrangler.toml');
  const workerToml = read('../wrangler.toml');
  assert.match(toml, /^\[\[services\]\]\nbinding = "ROOMS"\nservice = "alva-rooms"$/m);
  assert.equal(setting(workerToml, 'name'), 'alva-rooms', 'the binding names the Worker');
  assert.equal(setting(toml, 'compatibility_date'), setting(workerToml, 'compatibility_date'));
  const output = setting(toml, 'pages_build_output_dir');
  assert.ok(existsSync(new URL(`../gateway/${output}/_worker.js`, import.meta.url)), 'the script is in the output folder Pages serves');
  assert.doesNotMatch(toml, /^main = /m, 'a Pages project, not a second Worker');
  assert.equal(setting(toml, 'name'), 'alva-online');
});
