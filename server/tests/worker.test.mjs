// Run with node --test server/tests/worker.test.mjs (no dependencies, no
// Cloudflare account). The Worker's door: /health, the allowed origins
// (itch.io's game hosts, the native apps and a local copy, from
// ALLOWED_ORIGINS), CORS on every reply and its preflight, the Origin of a
// WebSocket upgrade, the version rule (CURRENT_VERSION, 'dev' only from a
// computer's own address) and the routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { handle } from '../src/index.js';
import { parseOrigins, originAllowed } from '../src/http.js';
import { makeEnv, gameRequest, createBody, joinBody, VERSION, ITCH } from './fakes.mjs';

const wranglerToml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const wranglerOrigins = wranglerToml.match(/^ALLOWED_ORIGINS = "([^"]+)"/m)[1];
// /health's version fields when the asking page names no version.
const UNASKED = Object.freeze({ currentVersion: VERSION, versionAllowed: null });

test('/health: readable by any page, the Lobby asked too, and the asking origin and whether it is allowed', async () => {
  const { env } = makeEnv();
  const res = await handle(gameRequest('/health', { origin: null }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'alva-rooms', lobby: true, relay: true, open: true, closed: null, origin: null, originAllowed: false, ...UNASKED },
    'a browser\'s address bar: no origin');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const fromItch = await handle(gameRequest('/health'), env);
  assert.deepEqual(await fromItch.json(), { ok: true, service: 'alva-rooms', lobby: true, relay: true, open: true, closed: null, origin: 'https://html-classic.itch.zone', originAllowed: true, ...UNASKED });
  assert.equal(fromItch.headers.get('access-control-allow-origin'), '*');
  const elsewhere = await handle(gameRequest('/health', { origin: 'https://hiyroscript.github.io' }), env);
  assert.deepEqual(await elsewhere.json(), { ok: true, service: 'alva-rooms', lobby: true, relay: true, open: true, closed: null, origin: 'https://hiyroscript.github.io', originAllowed: false, ...UNASKED });
  // A Lobby that does not answer: not ok (503), and said.
  const broken = await handle(gameRequest('/health'), { ...env, LOBBY: { idFromName: () => 'x', get: () => ({ fetch: () => Promise.reject(new Error('down')) }) } });
  assert.equal(broken.status, 503);
  assert.deepEqual(await broken.json(), { ok: false, service: 'alva-rooms', lobby: false, relay: true, open: true, closed: null, origin: 'https://html-classic.itch.zone', originAllowed: true, ...UNASKED });
});

test('the allowed origins: itch.io\'s game hosts, the native apps and a local copy, nothing else', () => {
  const allowed = parseOrigins(wranglerOrigins);
  for (const origin of [
    'https://html-classic.itch.zone', 'https://html.itch.zone', 'https://v6p9d9t4.itch.zone', 'https://a.b.itch.zone',
    'http://localhost:8000', 'http://localhost', 'http://127.0.0.1:5500', 'HTTPS://HTML.ITCH.ZONE',
    // The desktop apps (macOS and Linux; Windows, on http and https) and
    // the Android app.
    'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'https://alva.app',
  ]) assert.ok(originAllowed(origin, allowed), origin);
  for (const origin of [
    'https://itch.zone.evil.com', 'https://evil-itch.zone', 'http://html.itch.zone', 'https://itch.io', 'https://html.itch.zone:8443',
    'https://localhost:8000', 'http://localhost.evil.com', 'http://localhost:8000.evil.com', 'null', '', undefined,
    'https://hiyroscript.github.io',
    // Nothing broader than the four native origins: no other scheme, host,
    // port or subdomain.
    'tauri://localhost:1430', 'tauri://evil.com', 'tauri://localhost.evil.com', 'http://tauri.localhost:8080', 'http://evil.tauri.localhost',
    'http://tauri.localhost.evil.com', 'http://alva.app', 'https://evil.alva.app', 'https://alva.app.evil.com', 'https://alva.app:444',
    'capacitor://localhost', 'file://',
  ]) assert.ok(!originAllowed(origin, allowed), String(origin));
});

test('the native apps\' origins reach every route, CORS and the room\'s WebSocket included', async () => {
  const { env } = makeEnv();
  for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'https://alva.app']) {
    const health = await (await handle(gameRequest(`/health?version=${VERSION}`, { origin }), env)).json();
    assert.equal(health.originAllowed, true, origin);
    assert.equal(health.versionAllowed, true, origin);
    const list = await handle(gameRequest('/rooms', { origin }), env);
    assert.equal(list.status, 200, origin);
    assert.equal(list.headers.get('access-control-allow-origin'), origin);
    const created = await handle(gameRequest('/rooms', { method: 'POST', body: createBody(), origin, ip: '198.51.100.1' }), env);
    assert.equal(created.status, 200, origin);
    const { room, token } = await created.json();
    const pre = await handle(gameRequest('/rooms/join', { method: 'OPTIONS', origin }), env);
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    // The upgrade reaches the room, which answers for the token (a wrong
    // one here, as Node has no WebSocketPair): not refused for its Origin.
    const ws = await handle(gameRequest(`/rooms/${room.id}/ws?token=${token.replace(/./, (c) => (c === '0' ? '1' : '0'))}`, { origin, headers: { upgrade: 'websocket' } }), env);
    assert.deepEqual(await ws.json(), { error: 'forbidden' }, `${origin}: the upgrade's Origin is allowed`);
  }
});

test('the version rule: only CURRENT_VERSION plays, \'dev\' only from a computer\'s own address', async () => {
  const { env } = makeEnv();
  assert.equal(wranglerToml.match(/^CURRENT_VERSION = "([^"]+)"/m)?.[1], JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
    'wrangler.toml\'s CURRENT_VERSION is package.json\'s');
  const outdated = async (res, what) => {
    assert.equal(res.status, 409, what);
    assert.deepEqual(await res.json(), { error: 'outdated' }, what);
  };
  // Another version, or none, from any allowed page: the list, creating
  // and joining all refused, and the refusal readable (the game's CORS).
  for (const origin of [ITCH, 'https://alva.app', 'tauri://localhost', 'http://localhost:8000']) {
    for (const version of ['0.9.9', '1.0.0+turn', '1.0.1', '0.1.0+turn', null]) {
      const list = await handle(gameRequest('/rooms', { origin, version }), env);
      await outdated(list, `list ${version} from ${origin}`);
      assert.equal(list.headers.get('access-control-allow-origin'), origin);
      await outdated(await handle(gameRequest('/rooms', { method: 'POST', origin, body: createBody({ version: version ?? undefined }) }), env), `create ${version}`);
      await outdated(await handle(gameRequest('/rooms/join', { method: 'POST', origin, body: joinBody({ code: 'ABCDE', version: version ?? undefined }) }), env), `join ${version}`);
    }
  }
  // 'dev' (the modules run from the repository): from localhost only.
  for (const origin of ['http://localhost:8000', 'http://127.0.0.1:5500', 'http://localhost']) {
    assert.equal((await handle(gameRequest('/rooms', { origin, version: 'dev' }), env)).status, 200, origin);
  }
  for (const origin of [ITCH, 'https://alva.app', 'tauri://localhost', 'http://tauri.localhost']) {
    await outdated(await handle(gameRequest('/rooms', { origin, version: 'dev' }), env), `dev from ${origin}`);
    await outdated(await handle(gameRequest('/rooms', { method: 'POST', origin, body: createBody({ version: 'dev' }) }), env), `dev create from ${origin}`);
  }
  // /health says it, for "Online play is unavailable" to explain.
  const health = (version, origin = ITCH) => handle(gameRequest(`/health?version=${encodeURIComponent(version)}`, { origin }), env).then((r) => r.json());
  assert.equal((await health(VERSION)).versionAllowed, true);
  assert.equal((await health('0.9.9')).versionAllowed, false);
  assert.equal((await health('dev')).versionAllowed, false);
  assert.equal((await health('dev', 'http://localhost:8000')).versionAllowed, true);
  assert.equal((await health(VERSION)).currentVersion, VERSION);
  // A dev room is for dev games: a release never joins one, nor the other
  // way round.
  const local = 'http://localhost:8000';
  const devRoom = await (await handle(gameRequest('/rooms', { method: 'POST', origin: local, body: createBody({ version: 'dev' }) }), env)).json();
  const releaseRoom = await (await handle(gameRequest('/rooms', { method: 'POST', body: createBody() }), env)).json();
  assert.equal((await (await handle(gameRequest('/rooms/join', { method: 'POST', body: joinBody({ code: devRoom.room.code }) }), env)).json()).error, 'version_mismatch');
  assert.equal((await (await handle(gameRequest('/rooms/join', { method: 'POST', origin: local, body: joinBody({ code: releaseRoom.room.code, version: 'dev' }) }), env)).json()).error, 'version_mismatch');
  // No CURRENT_VERSION at all: no release plays; dev from localhost still does.
  const bare = makeEnv({ CURRENT_VERSION: '' }).env;
  await outdated(await handle(gameRequest('/rooms'), bare), 'no current version');
  assert.equal((await handle(gameRequest('/rooms', { origin: local, version: 'dev' }), bare)).status, 200);
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
