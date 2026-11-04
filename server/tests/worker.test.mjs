// Run with node --test server/tests/worker.test.mjs (no dependencies, no
// Cloudflare account). The Worker's door: /health, the allowed origins
// (itch.io's game hosts and a local copy, from ALLOWED_ORIGINS), CORS on
// every reply and its preflight, the Origin of a WebSocket upgrade, and
// the routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { handle } from '../src/index.js';
import { parseOrigins, originAllowed } from '../src/http.js';
import { makeEnv, gameRequest, createBody } from './fakes.mjs';

const wranglerOrigins = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/^ALLOWED_ORIGINS = "([^"]+)"/m)[1];

test('/health: readable by any page, the Lobby asked too, and the asking origin and whether it is allowed', async () => {
  const { env } = makeEnv();
  const res = await handle(gameRequest('/health', { origin: null }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'alva-rooms', lobby: true, relay: true, origin: null, originAllowed: false },
    'a browser\'s address bar: no origin');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const fromItch = await handle(gameRequest('/health'), env);
  assert.deepEqual(await fromItch.json(), { ok: true, service: 'alva-rooms', lobby: true, relay: true, origin: 'https://html-classic.itch.zone', originAllowed: true });
  assert.equal(fromItch.headers.get('access-control-allow-origin'), '*');
  const elsewhere = await handle(gameRequest('/health', { origin: 'https://hiyroscript.github.io' }), env);
  assert.deepEqual(await elsewhere.json(), { ok: true, service: 'alva-rooms', lobby: true, relay: true, origin: 'https://hiyroscript.github.io', originAllowed: false });
  // A Lobby that does not answer: not ok (503), and said.
  const broken = await handle(gameRequest('/health'), { ...env, LOBBY: { idFromName: () => 'x', get: () => ({ fetch: () => Promise.reject(new Error('down')) }) } });
  assert.equal(broken.status, 503);
  assert.deepEqual(await broken.json(), { ok: false, service: 'alva-rooms', lobby: false, relay: true, origin: 'https://html-classic.itch.zone', originAllowed: true });
});

test('the allowed origins: itch.io\'s game hosts and a local copy, nothing else', () => {
  const allowed = parseOrigins(wranglerOrigins);
  for (const origin of [
    'https://html-classic.itch.zone', 'https://html.itch.zone', 'https://v6p9d9t4.itch.zone', 'https://a.b.itch.zone',
    'http://localhost:8000', 'http://localhost', 'http://127.0.0.1:5500', 'HTTPS://HTML.ITCH.ZONE',
  ]) assert.ok(originAllowed(origin, allowed), origin);
  for (const origin of [
    'https://itch.zone.evil.com', 'https://evil-itch.zone', 'http://html.itch.zone', 'https://itch.io', 'https://html.itch.zone:8443',
    'https://localhost:8000', 'http://localhost.evil.com', 'http://localhost:8000.evil.com', 'null', '', undefined,
    'https://hiyroscript.github.io',
  ]) assert.ok(!originAllowed(origin, allowed), String(origin));
});

test('every API route refuses another origin, or none; the game\'s gets CORS headers and a preflight', async () => {
  const { env } = makeEnv();
  for (const origin of ['https://evil.example', null]) {
    for (const [path, method] of [['/rooms', 'GET'], ['/rooms', 'POST'], ['/rooms/join', 'POST']]) {
      const res = await handle(gameRequest(path, { method, origin, body: method === 'POST' ? createBody() : undefined }), env);
      assert.equal(res.status, 403, `${method} ${path} from ${origin}`);
      assert.deepEqual(await res.json(), { error: 'origin' });
      // The refusal itself is readable, so the game can say why.
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    }
  }
  const list = await handle(gameRequest('/rooms', { origin: 'http://localhost:8000' }), env);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('access-control-allow-origin'), 'http://localhost:8000');
  assert.equal(list.headers.get('vary'), 'Origin');
  const pre = await handle(gameRequest('/rooms', { method: 'OPTIONS' }), env);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(pre.headers.get('access-control-allow-headers'), 'content-type');
  const created = await handle(gameRequest('/rooms', { method: 'POST', body: createBody() }), env);
  assert.equal(created.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone');
  // Errors carry them too, so the game can read the code.
  const bad = await handle(gameRequest('/rooms', { method: 'POST', body: createBody({ playerName: '' }) }), env);
  assert.equal(bad.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone');
});

test('a WebSocket upgrade from another origin is refused before it reaches any room', async () => {
  const { env } = makeEnv();
  const created = await (await handle(gameRequest('/rooms', { method: 'POST', body: createBody() }), env)).json();
  const res = await handle(gameRequest(`/rooms/${created.room.id}/ws?token=${created.token}`, { origin: 'https://evil.example', headers: { upgrade: 'websocket' } }), env);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'origin' });
});

test('unknown routes are 404, and nothing breaks the Worker', async () => {
  const { env } = makeEnv();
  assert.equal((await handle(gameRequest('/admin'), env)).status, 404);
  assert.equal((await handle(gameRequest('/rooms', { method: 'DELETE' }), env)).status, 404);
  // An unexpected failure: answered as server_error, with the game's CORS
  // headers so it can read it, and logged.
  const logged = [];
  const error = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const broken = await worker.fetch(gameRequest('/rooms'), { ...env, LOBBY: null });
    assert.equal(broken.status, 500);
    assert.deepEqual(await broken.json(), { error: 'server_error' });
    assert.equal(broken.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone');
    const elsewhere = await worker.fetch(gameRequest('/rooms', { origin: 'https://evil.example' }), { ...env, LOBBY: null, ALLOWED_ORIGINS: null });
    assert.equal(elsewhere.status, 403, 'an origin refused before anything can fail');
  } finally {
    console.error = error;
  }
  assert.ok(logged.some((line) => line.includes('GET /rooms failed')), 'logged for the dashboard');
});

test('wrangler.toml turns the logs on (Workers Logs), for the dashboard', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^\[observability\]\nenabled = true$/m);
});

test('wrangler.toml gives the Worker no public address: the gateway (a service binding) is its address', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^workers_dev = false$/m);
  assert.match(toml, /^preview_urls = false$/m);
  assert.doesNotMatch(toml, /^routes? = /m);
});
