// Run with node --test tests/online/itch-hosts.test.mjs (no dependencies:
// it never builds). The itch.io release's rule about other hosts
// (tools/itch/hosts.mjs, applied by tools/itch/validate.mjs): the credits'
// links and, once Online Play has one, the room server's single host (and
// its WebSocket form) are allowed; every other host stays refused, a
// WebSocket one included. And the room server (server/) is development-only:
// never copied into the release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hostProblems, serverOrigins, openedLinks } from '../../tools/itch/hosts.mjs';
import { DEVELOPMENT_ONLY, isDevelopmentOnly, COPIED_FILES, COPIED_DIRS, pageParts, moduleOrder } from '../../tools/itch/release.mjs';
import { CONFIG } from '../../js/config.js';

const ROOT = new URL('../../', import.meta.url);
// The links the player opens: the credits' and the Releases page.
const credits = openedLinks(readFileSync(new URL('js/ui/credits.js', ROOT), 'utf8'));
const SERVER = 'https://alva-rooms.someone.workers.dev';

test('with no server configured, only the credits\' links pass: every other host fails', () => {
  assert.ok(credits.size > 0);
  const link = [...credits][0];
  assert.deepEqual(hostProblems(`a credit: "${link}"`, 'game.js', { approved: credits }), []);
  for (const other of ['https://evil.example/x.js', 'http://cdn.example.com/lib.js', 'wss://evil.example/socket', SERVER]) {
    const problems = hostProblems(`load("${other}")`, 'game.js', { approved: credits, serverUrl: '' });
    assert.equal(problems.length, 1, other);
    assert.match(problems[0], /another host/);
  }
});

test('with a server configured, its one host and its WebSocket form pass, and nothing else does', () => {
  assert.deepEqual(serverOrigins(SERVER), [SERVER, 'wss://alva-rooms.someone.workers.dev']);
  assert.deepEqual(serverOrigins('http://localhost:8787/'), ['http://localhost:8787', 'ws://localhost:8787']);
  for (const fine of [SERVER, `${SERVER}/rooms`, `${SERVER}/health`, 'wss://alva-rooms.someone.workers.dev/rooms/abc/ws?token=1']) {
    assert.deepEqual(hostProblems(`"${fine}"`, 'game.js', { approved: credits, serverUrl: SERVER }), [], fine);
  }
  for (const other of [
    'https://alva-rooms.someone.workers.dev.evil.com/x', 'https://evil.workers.dev/rooms', 'http://alva-rooms.someone.workers.dev/rooms',
    'ws://alva-rooms.someone.workers.dev/rooms', 'wss://evil.example/socket', 'https://example.com/',
  ]) {
    assert.equal(hostProblems(`"${other}"`, 'game.js', { approved: credits, serverUrl: SERVER }).length, 1, other);
  }
  // A malformed or non-web server address allows nothing.
  for (const bad of ['not a url', 'ftp://files.example', 'javascript:alert(1)', '  ']) assert.deepEqual(serverOrigins(bad), [], bad);
});

test('the configured server: its host and its wss form pass; another host, the same host over http or ws, or a look-alike never do', () => {
  const configured = CONFIG.online.serverUrl;
  const { host } = new URL(configured);
  const options = { approved: credits, serverUrl: configured };
  for (const fine of [configured, `${configured}/rooms`, `wss://${host}/rooms/abc/ws?token=1`]) {
    assert.deepEqual(hostProblems(`"${fine}"`, 'game.js', options), [], fine);
  }
  for (const other of [`http://${host}/rooms`, `ws://${host}/rooms`, `https://${host}.evil.example/`, 'https://evil.workers.dev/rooms', 'https://example.com/']) {
    assert.equal(hostProblems(`"${other}"`, 'game.js', options).length, 1, other);
  }
});

test('the game\'s own code names no other host, and builds its WebSocket address from the server\'s', () => {
  const { entry } = pageParts();
  for (const file of moduleOrder(entry)) {
    const text = readFileSync(new URL(file, ROOT), 'utf8');
    assert.deepEqual(hostProblems(text, file, { approved: credits, serverUrl: CONFIG.online.serverUrl }), [], file);
  }
  const page = readFileSync(new URL('index.html', ROOT), 'utf8');
  assert.deepEqual(hostProblems(page, 'index.html', { approved: credits }), []);
});

test('the room server is development-only: never copied into the release, and the validation refuses it', () => {
  for (const path of ['server/src/index.js', 'server/package.json', 'server/wrangler.toml', 'server/tests/lobby.test.mjs', 'server/node_modules/x/y.js', '.wrangler/state/x']) {
    assert.ok(isDevelopmentOnly(path), path);
  }
  assert.ok(DEVELOPMENT_ONLY.length >= 4);
  for (const copied of [...COPIED_FILES, ...COPIED_DIRS]) assert.equal(isDevelopmentOnly(copied), false, copied);
  assert.ok(![...COPIED_FILES, ...COPIED_DIRS].some((f) => f.startsWith('server')));
  // The page loads nothing from it, and no module of the game imports it.
  const { entry } = pageParts();
  assert.ok(!moduleOrder(entry).some((m) => m.startsWith('server/')));
  // The validation uses the same list.
  assert.match(readFileSync(new URL('tools/itch/validate.mjs', ROOT), 'utf8'), /DEVELOPMENT_ONLY\.some/);
});
