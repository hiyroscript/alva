// Run with node --test server/tests/safeguards.test.mjs. The relay's
// safeguards (server/src/lobby.js, wrangler.toml): at most MAX_MATCHES
// rooms with both players at once (a host waiting alone counts for
// nothing), the monthly safety stop that closes Online play until the next
// month once the month's estimated relay use reaches RELAY_MONTHLY_GB, at
// most RELAY_PASSWORDS_PER_HOUR relay passwords an hour, ONLINE_OPEN,
// the switch that closes Online play, and a release replacing the version
// rooms were made for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { Lobby } from '../src/lobby.js';
import { makeEnv, gameRequest, createBody, joinBody, FakeSocket } from './fakes.mjs';

const HOUR = 3_600_000;
const post = (env, path, body, ip = '203.0.113.7') => handle(gameRequest(path, { method: 'POST', body, ip }), env);
const answer = async (res) => ({ status: res.status, ...(await res.json()) });

// A room made by its own host (each from an address of its own, so the
// per-minute limits stay out of the way).
let hosts = 0;
async function makeRoom(env) {
  hosts += 1;
  return (await post(env, '/rooms', createBody(), `10.1.${hosts >> 8}.${hosts & 255}`)).json();
}

async function joinRoom(env, created) {
  hosts += 1;
  return answer(await post(env, '/rooms/join', joinBody({ code: created.room.code }), `10.2.${hosts >> 8}.${hosts & 255}`));
}

// A room with both players connected to it.
async function pairedRoom(made) {
  const created = await makeRoom(made.env);
  const joined = await joinRoom(made.env, created);
  assert.equal(joined.status, 200);
  const r = made.room(created.room.id);
  const host = new FakeSocket();
  const guest = new FakeSocket();
  await r.connect('host', host);
  await r.connect('guest', guest);
  const say = (ws, m) => r.webSocketMessage(ws, JSON.stringify(m));
  return { created, r, host, guest, say };
}

test('at most MAX_MATCHES rooms with both players at once: one more join is "full", a host waiting alone counts for nothing', async () => {
  const made = makeEnv();
  const { env } = made;
  const rooms = [];
  for (let i = 0; i < 10; i++) rooms.push(await pairedRoom(made));
  const waiting = await makeRoom(env);
  assert.ok(waiting.room, 'a host may still open a room and wait');
  const refused = await joinRoom(env, waiting);
  assert.deepEqual(refused, { status: 503, error: 'full' }, 'the eleventh match: Servers are full right now');
  assert.equal(made.room(waiting.room.id).state.seats.guest, null, 'nobody was seated');
  // Others may still look at the list and open rooms.
  assert.equal((await handle(gameRequest('/rooms'), env)).status, 200);
  assert.ok((await makeRoom(env)).room);
  // A player leaving one of the ten frees a place.
  const { say, guest } = rooms[0];
  await say(guest, { type: 'leave' });
  assert.equal((await joinRoom(env, waiting)).status, 200, 'a place opened');
  assert.deepEqual(await joinRoom(env, await makeRoom(env)), { status: 503, error: 'full' }, 'and is taken again');
  // A room ending frees one too.
  await rooms[1].say(rooms[1].host, { type: 'leave' });
  assert.equal((await joinRoom(env, await makeRoom(env))).status, 200);
});

test('two joins at once for the last place: only one gets it', async () => {
  const made = makeEnv({ MAX_MATCHES: '3' });
  for (let i = 0; i < 2; i++) await pairedRoom(made);
  const a = await makeRoom(made.env);
  const b = await makeRoom(made.env);
  const both = await Promise.all([joinRoom(made.env, a), joinRoom(made.env, b)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 503]);
  assert.equal(made.lobby().matches, 3);
});

test('the month\'s relay use is counted from the time rooms spend with both players, and saved', async () => {
  const made = makeEnv();
  const { env, clock, lobby } = made;
  await makeRoom(env);
  clock.now += 100 * HOUR;
  await handle(gameRequest('/rooms'), env);
  assert.equal(lobby().relay.seconds, 0, 'a host waiting alone uses no relay');
  await pairedRoom(made);
  await pairedRoom(made);
  clock.now += 2 * HOUR;
  await handle(gameRequest('/rooms'), env);
  assert.equal(Math.round(lobby().relay.seconds), 4 * 3600, 'two matches for two hours');
  assert.equal(lobby().relayGb.toFixed(2), '0.80', 'at 0.2 GB a match-hour');
  // A restarted Lobby goes on from what it saved, counting the time it was
  // asleep too.
  await makeRoom(env);
  clock.now += HOUR;
  const restarted = new Lobby(lobby().ctx, env, { now: () => clock.now });
  env.LOBBY.objects.set('lobby', restarted);
  await handle(gameRequest('/rooms'), env);
  assert.equal(Math.round(restarted.relay.seconds), 6 * 3600);
});

test('the monthly safety stop: once the month\'s estimate reaches RELAY_MONTHLY_GB, Online play is closed until the next month', async () => {
  // 1 GB at 0.2 GB a match-hour: five match-hours.
  const made = makeEnv({ RELAY_MONTHLY_GB: '1' });
  const { env, clock, lobby } = made;
  clock.now = Date.UTC(2026, 10, 20, 12);
  const open = await pairedRoom(made);
  const waiting = await makeRoom(env);
  clock.now += 5 * HOUR + 1000;
  for (const res of [
    await handle(gameRequest('/rooms'), env),
    await post(env, '/rooms', createBody()),
    await post(env, '/rooms/join', joinBody({ code: waiting.room.code })),
  ]) {
    assert.deepEqual(await answer(res), { status: 503, error: 'month_limit' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone', 'readable by the game');
  }
  const health = await (await handle(gameRequest('/health'), env)).json();
  assert.equal(health.open, false);
  assert.equal(health.closed, 'month_limit');
  assert.equal(health.ok, true, 'the server itself is up');
  // A room still open closes at its next relay password, telling both why.
  const before = made.turn.requests.length;
  await open.say(open.host, { type: 'relay' });
  assert.equal(made.turn.requests.length, before, 'no password handed out');
  for (const ws of [open.host, open.guest]) {
    assert.deepEqual(ws.of('closed'), [{ type: 'closed', reason: 'month_limit' }]);
    assert.equal(ws.readyState, 3);
  }
  assert.equal(lobby().rooms[open.created.room.id], undefined, 'the Lobby forgot it');
  // Still closed later in the month; open again on the 1st (UTC), counted
  // from nothing.
  clock.now = Date.UTC(2026, 10, 30, 23, 59);
  assert.equal((await handle(gameRequest('/rooms'), env)).status, 503);
  clock.now = Date.UTC(2026, 11, 1, 0, 0, 1);
  assert.equal((await handle(gameRequest('/rooms'), env)).status, 200);
  assert.ok(lobby().relay.seconds < 10, 'a new month starts from nothing');
  assert.equal(lobby().relay.month, '2026-12');
});

test('a room in use reports to the Lobby every two minutes, so it keeps counting while its players are there', async () => {
  const made = makeEnv();
  const { env, clock, lobby } = made;
  const { say, host, created } = await pairedRoom(made);
  // Twenty minutes of picking fighters, with no match.
  for (let minute = 1; minute <= 20; minute++) {
    clock.now += 60_000;
    await say(host, { type: 'fighter', fighterId: minute % 2 ? '0001' : '0003' });
    await lobby().alarm();
  }
  assert.ok(lobby().rooms[created.room.id], 'still listed');
  assert.equal(lobby().matches, 1);
  assert.equal(Math.round(lobby().relay.seconds / 60), 20, 'twenty minutes counted');
});

test('a new month counts only its own part of the time since the last count', async () => {
  const made = makeEnv();
  const { env, clock, lobby } = made;
  clock.now = Date.UTC(2026, 10, 30, 23);
  await pairedRoom(made);
  clock.now = Date.UTC(2026, 11, 1, 1);
  await handle(gameRequest('/rooms'), env);
  assert.equal(lobby().relay.month, '2026-12');
  assert.equal(Math.round(lobby().relay.seconds), 3600, 'one hour of December, not two');
});

test('at most RELAY_PASSWORDS_PER_HOUR relay passwords an hour, server-wide', async () => {
  const made = makeEnv({ RELAY_PASSWORDS_PER_HOUR: '3' });
  const { clock, turn } = made;
  clock.now = Date.UTC(2026, 10, 3, 12);
  const a = await pairedRoom(made);
  const b = await pairedRoom(made);
  await a.say(a.host, { type: 'relay' });
  await a.say(a.guest, { type: 'relay' });
  await b.say(b.host, { type: 'relay' });
  assert.equal(turn.requests.length, 3);
  await b.say(b.guest, { type: 'relay' });
  assert.deepEqual(b.guest.of('relay').at(-1), { type: 'relay', error: 'full' }, 'the fourth this hour');
  assert.equal(turn.requests.length, 3, 'not asked of Cloudflare');
  assert.equal(b.guest.of('closed').length, 0, 'the room stays open: the player may try again');
  clock.now = Date.UTC(2026, 10, 3, 13);
  await b.say(b.guest, { type: 'relay' });
  assert.ok(b.guest.of('relay').at(-1).iceServers, 'the next hour');
  assert.equal(turn.requests.length, 4);
});

test('ONLINE_OPEN "false" closes Online play: no list, no room, no join, and a room still open closes', async () => {
  const made = makeEnv();
  const { env } = made;
  const open = await pairedRoom(made);
  const waiting = await makeRoom(env);
  env.ONLINE_OPEN = 'false';
  for (const res of [
    await handle(gameRequest('/rooms'), env),
    await post(env, '/rooms', createBody()),
    await post(env, '/rooms/join', joinBody({ code: waiting.room.code })),
  ]) {
    assert.deepEqual(await answer(res), { status: 503, error: 'closed' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone', 'readable by the game');
  }
  const health = await (await handle(gameRequest('/health'), env)).json();
  assert.deepEqual([health.ok, health.open, health.closed], [true, false, 'closed']);
  // The open room: its next relay password is refused, and it closes.
  await open.say(open.host, { type: 'relay' });
  for (const ws of [open.host, open.guest]) assert.deepEqual(ws.of('closed'), [{ type: 'closed', reason: 'closed' }]);
  // The waiting one closes when its host (re)connects.
  const ws = new FakeSocket();
  await made.room(waiting.room.id).connect('host', ws);
  assert.deepEqual(ws.of('closed'), [{ type: 'closed', reason: 'closed' }]);
  assert.equal(made.lobby().rooms[waiting.room.id], undefined);
  // Opened again: everything works.
  env.ONLINE_OPEN = 'true';
  assert.equal((await handle(gameRequest('/rooms'), env)).status, 200);
  assert.ok((await makeRoom(env)).room);
  for (const off of ['false', 'FALSE', ' off ', 'no', '0']) {
    env.ONLINE_OPEN = off;
    assert.equal((await handle(gameRequest('/rooms'), env)).status, 503, JSON.stringify(off));
  }
  for (const on of ['true', 'yes', '1', undefined]) {
    env.ONLINE_OPEN = on;
    assert.equal((await handle(gameRequest('/rooms'), env)).status, 200, JSON.stringify(on));
  }
});

test('wrangler.toml: 10 matches at once, a safety stop under half the free 1,000 GB at the estimate\'s high end, an hourly password cap, Online play open; the code\'s defaults the same', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const value = (name) => toml.match(new RegExp(`^${name} = "([^"]*)"$`, 'm'))?.[1];
  assert.equal(value('MAX_MATCHES'), '10');
  assert.equal(value('ONLINE_OPEN'), 'true');
  assert.ok(Number(value('RELAY_MONTHLY_GB')) <= 500, 'two calendar months together stay inside 1,000 GB');
  assert.ok(Number(value('RELAY_GB_PER_HOUR')) >= 0.2, 'the high end of the estimate (0.1 to 0.2 GB a match-hour)');
  assert.ok(Number(value('RELAY_PASSWORDS_PER_HOUR')) > 0);
  const lobby = new Lobby({ storage: null }, {});
  assert.deepEqual(
    [lobby.maxMatches, lobby.gbPerHour, lobby.monthlyGb, lobby.passwordsPerHour],
    ['MAX_MATCHES', 'RELAY_GB_PER_HOUR', 'RELAY_MONTHLY_GB', 'RELAY_PASSWORDS_PER_HOUR'].map((n) => Number(value(n))),
  );
  // ExpressTURN is gone: the relay's key is Cloudflare's.
  assert.doesNotMatch(toml, /expressturn|TURN_URLS|TURN_USERNAME|TURN_CREDENTIAL/i);
  assert.match(toml, /TURN_KEY_ID/);
  assert.match(toml, /TURN_KEY_API_TOKEN/);
});

test('a release replaces the version: an open room of the old one closes as outdated, at its next connection or relay request', async () => {
  const made = makeEnv();
  const { env } = made;
  const open = await pairedRoom(made);
  const waiting = await makeRoom(env);
  // The release: the server now plays with 1.0.1 (wrangler.toml's
  // CURRENT_VERSION, deployed last).
  env.CURRENT_VERSION = '1.0.1';
  // The open room: its next relay request closes it, both players told.
  await open.say(open.host, { type: 'relay' });
  for (const ws of [open.host, open.guest]) assert.deepEqual(ws.of('closed'), [{ type: 'closed', reason: 'outdated' }]);
  // The waiting one closes when its host reconnects (a deploy drops every
  // room's sockets), and the Lobby forgets it.
  const ws = new FakeSocket();
  await made.room(waiting.room.id).connect('host', ws);
  assert.deepEqual(ws.of('closed'), [{ type: 'closed', reason: 'outdated' }]);
  assert.equal(made.lobby().rooms[waiting.room.id], undefined);
  // The old version is refused everywhere; the new one plays.
  assert.deepEqual(await answer(await handle(gameRequest('/rooms'), env)), { status: 409, error: 'outdated' });
  assert.equal((await handle(gameRequest('/rooms', { version: '1.0.1' }), env)).status, 200);
  assert.equal((await post(env, '/rooms', createBody({ version: '1.0.1' }), '10.9.0.1')).status, 200);
});
