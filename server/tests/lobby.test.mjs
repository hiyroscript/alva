// Run with node --test server/tests/lobby.test.mjs (no dependencies, no
// Cloudflare account). The Lobby through the Worker, on fake Durable
// Objects: creating rooms (validation, unique codes), the public list,
// joining by code and by id, the free plan's caps (MAX_ROOMS and the daily
// request budget, which a new UTC day resets), rate limiting per address,
// and the alarm that drops rooms that stopped reporting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index.js';
import { makeEnv, gameRequest, createBody, joinBody, VERSION } from './fakes.mjs';
import { CODE_ALPHABET } from '../src/rules.js';

const post = (env, path, body, opts) => handle(gameRequest(path, { method: 'POST', body, ...opts }), env);
const get = (env, path, opts) => handle(gameRequest(path, opts), env);
const body = async (res) => res.json();

test('creating a room: a public or private room with a code from the unambiguous alphabet, its host seated', async () => {
  const { env, room } = makeEnv();
  const res = await post(env, '/rooms', createBody());
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data.seat, 'host');
  assert.match(data.token, /^[0-9a-f]{32}$/);
  assert.match(data.room.id, /^[0-9a-f]{20}$/);
  assert.equal(data.room.code.length, 5);
  for (const c of data.room.code) assert.ok(CODE_ALPHABET.includes(c), `${c} is in the alphabet`);
  assert.doesNotMatch(data.room.code, /[01OIL]/, 'nothing ambiguous');
  assert.deepEqual({ ...data.room, id: undefined, code: undefined }, {
    id: undefined, code: undefined, name: "Chris's room", host: 'Chris', visibility: 'public', mode: 'quick-battle', players: 1, status: 'open',
  });
  // The Room knows its host, and nobody else.
  const r = room(data.room.id);
  assert.equal(r.state.seats.host.name, 'Chris');
  assert.equal(r.state.seats.guest, null);
  const priv = await body(await post(env, '/rooms', createBody({ visibility: 'private', name: 'Back room' })));
  assert.equal(priv.room.visibility, 'private');
});

test('every field is checked on the server: names, the room name, mode, visibility, session and version', async () => {
  const { env } = makeEnv();
  const cases = [
    [{ playerName: 'a' }, 'invalid_name'],
    [{ playerName: 'x'.repeat(17) }, 'invalid_name'],
    [{ playerName: '<b>hi</b>' }, 'invalid_name'],
    [{ playerName: 'Neo😎' }, 'invalid_name'],
    [{ playerName: 'ab\u0007c' }, 'invalid_name'],
    [{ playerName: 42 }, 'invalid_name'],
    [{ name: 'r' }, 'invalid_room_name'],
    [{ name: 'r'.repeat(25) }, 'invalid_room_name'],
    [{ mode: 'battle-royale' }, 'invalid_mode'],
    [{ visibility: 'hidden' }, 'invalid_visibility'],
    [{ session: 'not hex!' }, 'bad_request'],
    [{ version: undefined }, 'bad_request'],
  ];
  for (const [over, code] of cases) {
    const res = await post(env, '/rooms', createBody(over));
    assert.equal((await body(res)).error, code, JSON.stringify(over));
    assert.equal(res.status, 400);
  }
  // Names are cleaned the same way the game cleans them.
  const ok = await body(await post(env, '/rooms', createBody({ playerName: '  Zoë   d’Arc ', name: 'Zoë’s  room' })));
  assert.equal(ok.room.host, "Zoë d'Arc");
  assert.equal(ok.room.name, "Zoë's room");
  // A body that is not JSON, or too large.
  const bad = await handle(new Request('https://x.workers.dev/rooms', { method: 'POST', headers: { origin: 'https://html.itch.zone' }, body: '{' }), env);
  assert.equal((await body(bad)).error, 'bad_request');
  const big = await post(env, '/rooms', createBody({ name: 'r'.repeat(3000) }));
  assert.equal((await body(big)).error, 'bad_request');
});

test('codes are unique among open rooms, even when the random source repeats itself', async () => {
  const { env, lobby } = makeEnv();
  const first = await body(await post(env, '/rooms', createBody()));
  // Make the next code drawn the same as the first, then something else.
  const random = lobby().random;
  let calls = 0;
  const replay = [...first.room.code].map((c) => CODE_ALPHABET.indexOf(c));
  lobby().random = {
    getRandomValues(bytes) {
      if (bytes.length === 1 && calls < replay.length) bytes[0] = replay[calls++];
      else random.getRandomValues(bytes);
      return bytes;
    },
  };
  const second = await body(await post(env, '/rooms', createBody()));
  assert.notEqual(second.room.code, first.room.code);
  const codes = new Set();
  lobby().random = random;
  for (let i = 0; i < 30; i++) {
    const r = await body(await post(env, '/rooms', createBody(), { ip: `198.51.100.${i}` }));
    codes.add(r.room.code);
  }
  assert.equal(codes.size, 30);
});

test('the public list: public rooms only, newest first, joinable while open; private rooms never listed', async () => {
  const { env, clock } = makeEnv();
  assert.deepEqual(await body(await get(env, '/rooms')), { rooms: [] });
  const a = await body(await post(env, '/rooms', createBody({ name: 'First room' })));
  clock.now += 1000;
  await post(env, '/rooms', createBody({ name: 'Secret room', visibility: 'private' }));
  clock.now += 1000;
  const c = await body(await post(env, '/rooms', createBody({ name: 'Third room', playerName: 'Ana' })));
  const list = (await body(await get(env, '/rooms'))).rooms;
  assert.deepEqual(list.map((r) => r.name), ['Third room', 'First room']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['host', 'id', 'joinable', 'mode', 'name', 'players', 'status', 'version']);
  assert.equal(list[0].host, 'Ana');
  assert.equal(list[0].joinable, true);
  assert.ok(!list.some((r) => 'code' in r), 'a listed room never shows its code');
  // Full rooms stay listed, unjoinable.
  await post(env, '/rooms/join', joinBody({ id: c.room.id }));
  const after = (await body(await get(env, '/rooms'))).rooms;
  assert.deepEqual(after.map((r) => [r.name, r.players, r.joinable]), [['Third room', 2, false], ['First room', 1, true]]);
  assert.equal(a.room.status, 'open');
});

test('joining: by code in any case, by id for public rooms only; unknown, full and other-version rooms refused', async () => {
  const { env, room } = makeEnv();
  const pub = await body(await post(env, '/rooms', createBody()));
  const priv = await body(await post(env, '/rooms', createBody({ visibility: 'private' })));
  // A private room is never joined from the list.
  assert.equal((await body(await post(env, '/rooms/join', joinBody({ id: priv.room.id })))).error, 'room_not_found');
  // Its code works, typed in lowercase with a space.
  const lower = [...priv.room.code].map((c) => c.toLowerCase()).join('');
  const joined = await post(env, '/rooms/join', joinBody({ code: ` ${lower.slice(0, 2)} ${lower.slice(2)}` }));
  assert.equal(joined.status, 200);
  const j = await body(joined);
  assert.equal(j.seat, 'guest');
  assert.equal(j.room.players, 2);
  assert.equal(room(priv.room.id).state.seats.guest.name, 'Sam');
  // Now full.
  const third = await post(env, '/rooms/join', joinBody({ code: priv.room.code, playerName: 'Lee' }));
  assert.equal(third.status, 409);
  assert.equal((await body(third)).error, 'room_full');
  // Codes that are malformed, or no room's.
  assert.equal((await body(await post(env, '/rooms/join', joinBody({ code: 'AB0' })))).error, 'invalid_code');
  assert.equal((await body(await post(env, '/rooms/join', joinBody({ code: 'ZZZZZ' })))).error, 'room_not_found');
  assert.equal((await body(await post(env, '/rooms/join', joinBody({ id: 'f'.repeat(20) })))).error, 'room_not_found');
  // A different version of the game never shares a match.
  const other = await post(env, '/rooms/join', joinBody({ id: pub.room.id, version: '9.9.9' }));
  assert.equal((await body(other)).error, 'version_mismatch');
  assert.equal(VERSION, '0.1.0');
  // A bad name.
  assert.equal((await body(await post(env, '/rooms/join', joinBody({ id: pub.room.id, playerName: '' })))).error, 'invalid_name');
  // The same visit joining again (a reload) keeps its seat.
  const session = 'abcdef0123456789';
  const once = await body(await post(env, '/rooms/join', joinBody({ id: pub.room.id, session })));
  const again = await body(await post(env, '/rooms/join', joinBody({ id: pub.room.id, session })));
  assert.equal(again.token, once.token);
});

test('MAX_ROOMS: one room more than the cap is refused as full (503), and a closed room frees its place', async () => {
  const { env, room } = makeEnv({ MAX_ROOMS: '3' });
  const made = [];
  for (let i = 0; i < 3; i++) made.push(await body(await post(env, '/rooms', createBody())));
  const over = await post(env, '/rooms', createBody());
  assert.equal(over.status, 503);
  assert.deepEqual(await body(over), { error: 'full' });
  // Joining an open room still works at the cap.
  assert.equal((await post(env, '/rooms/join', joinBody({ code: made[0].room.code }))).status, 200);
  // A host leaving closes the room, and frees a place.
  const r = room(made[1].room.id);
  const { FakeSocket } = await import('./fakes.mjs');
  const ws = new FakeSocket();
  await r.connect('host', ws);
  await r.webSocketMessage(ws, JSON.stringify({ type: 'leave' }));
  assert.equal((await post(env, '/rooms', createBody())).status, 200);
});

test('the daily budget: past its share of the free plan\'s requests, new rooms are full; a new UTC day starts it again', async () => {
  const { env, clock, lobby } = makeEnv({ DAILY_REQUEST_LIMIT: '20', BUDGET_SHARE: '0.8' });
  const open = await body(await post(env, '/rooms', createBody()));
  // Every request the Lobby handles counts: list reads too.
  // The create request counts too: 15 spent with it, still under 16 (80% of 20).
  while (lobby().budget.used < 14) await get(env, '/rooms');
  assert.equal((await post(env, '/rooms', createBody())).status, 200, 'still under 16 (80% of 20)');
  const full = await post(env, '/rooms', createBody());
  assert.equal(full.status, 503);
  assert.equal((await body(full)).error, 'full');
  // Rooms already open play on: joining is fine.
  assert.equal((await post(env, '/rooms/join', joinBody({ code: open.room.code }))).status, 200);
  // A Room's reports add what it handled.
  const before = lobby().budget.used;
  await env.LOBBY.get('lobby').fetch('https://lobby/report', { method: 'POST', body: JSON.stringify({ id: open.room.id, players: 2, status: 'full', requests: 5 }) });
  assert.equal(lobby().budget.used, before + 6);
  // The free plan's day starts at 00:00 UTC.
  const tomorrow = new Date(clock.now);
  tomorrow.setUTCHours(24, 0, 1, 0);
  clock.now = tomorrow.getTime();
  assert.equal((await post(env, '/rooms', createBody())).status, 200);
  assert.ok(lobby().budget.used < 5);
  assert.equal(lobby().budget.day, tomorrow.toISOString().slice(0, 10));
});

test('the budget survives the Lobby waking from storage, and its alarm saves it', async () => {
  const { env, lobby, clock } = makeEnv();
  await post(env, '/rooms', createBody());
  for (let i = 0; i < 5; i++) await get(env, '/rooms');
  const used = lobby().budget.used;
  assert.ok(lobby().ctx.storage.alarm > clock.now, 'an alarm is due');
  await lobby().alarm();
  assert.equal((await lobby().ctx.storage.get('budget')).used, used + 1);
  // A fresh object (after eviction) reads it back.
  const { Lobby } = await import('../src/lobby.js');
  const woken = new Lobby(lobby().ctx, env, { now: () => clock.now });
  await woken.load();
  assert.equal(woken.budget.used, used + 1);
  assert.equal(Object.keys(woken.rooms).length, 1);
});

test('rate limiting: at most CREATE_PER_MINUTE rooms a minute from one address, others unaffected, and the minute passes', async () => {
  const { env, clock, lobby } = makeEnv({ CREATE_PER_MINUTE: '3' });
  for (let i = 0; i < 3; i++) assert.equal((await post(env, '/rooms', createBody())).status, 200);
  const limited = await post(env, '/rooms', createBody());
  assert.equal(limited.status, 429);
  assert.equal((await body(limited)).error, 'rate_limited');
  assert.equal((await post(env, '/rooms', createBody(), { ip: '192.0.2.44' })).status, 200, 'another address');
  clock.now += 61_000;
  assert.equal((await post(env, '/rooms', createBody())).status, 200, 'a minute later');
  // Addresses are never stored.
  const stored = JSON.stringify([...lobby().ctx.storage.data.values()]);
  assert.doesNotMatch(stored, /203\.0\.113\.7|192\.0\.2\.44/);
});

test('join attempts and list reads are limited too', async () => {
  const { env } = makeEnv({ JOIN_PER_MINUTE: '2', LIST_PER_MINUTE: '2' });
  for (let i = 0; i < 2; i++) await post(env, '/rooms/join', joinBody({ code: 'ZZZZZ' }));
  assert.equal((await body(await post(env, '/rooms/join', joinBody({ code: 'ZZZZZ' })))).error, 'rate_limited');
  await get(env, '/rooms');
  await get(env, '/rooms');
  assert.equal((await get(env, '/rooms')).status, 429);
});

test('cleanup: the Lobby\'s alarm drops a room that stopped reporting, past its idle time', async () => {
  const { env, clock, lobby } = makeEnv();
  const a = await body(await post(env, '/rooms', createBody()));
  clock.now += 9 * 60_000;
  await lobby().alarm();
  assert.ok(lobby().rooms[a.room.id], 'still within its idle time');
  clock.now += 7 * 60_000;
  await lobby().alarm();
  assert.equal(lobby().rooms[a.room.id], undefined, 'silent for over 15 minutes');
  assert.deepEqual((await body(await get(env, '/rooms'))).rooms, []);
});
