// Run with node --test server/tests/privacy.test.mjs. No player's network
// address reaches anyone: the match goes through its Room (the two
// browsers never connect to each other), WebRTC signalling is never passed
// on, nothing the server answers, stores or sends a player holds an
// address, the Lobby counts callers by a salted hash, and Cloudflare's
// per-request logs are off. Also: the room's share of the match traffic,
// its allowance per seat, and what a long match spends of the daily
// budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callerKey } from '../src/privacy.js';
import { MATCH_RATE, MATCH_BURST } from '../src/room.js';
import { handle } from '../src/index.js';
import { makeEnv, gameRequest, createBody, joinBody, FakeSocket } from './fakes.mjs';

// Addresses that must never reach anyone: each player's public, local and
// IPv6 ones.
const HOST_IP = '203.0.113.50';
const GUEST_IP = '198.51.100.23';
const LOCAL_IP = '192.168.1.20';
const V6 = '2001:db8::5';
const SECRETS = [HOST_IP, GUEST_IP, LOCAL_IP, V6];
const holdsNone = (value, what) => {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `${what} holds ${secret}`);
};

// A room with both players connected, from their own addresses, every
// message they are sent kept.
async function room(vars) {
  const made = makeEnv(vars);
  const { env } = made;
  const post = async (path, body, ip) => handle(gameRequest(path, { method: 'POST', body, ip }), env);
  const created = await (await post('/rooms', createBody(), HOST_IP)).json();
  const r = made.room(created.room.id);
  const host = new FakeSocket();
  await r.connect('host', host);
  const joined = await (await post('/rooms/join', joinBody({ code: created.room.code }), GUEST_IP)).json();
  const guest = new FakeSocket();
  await r.connect('guest', guest);
  const say = (ws, m) => r.webSocketMessage(ws, JSON.stringify(m));
  return { ...made, r, host, guest, say, created, joined };
}

const packet = (s) => ({ t: 'in', m: 1, s, f: [0, 0, 4], a: s - 1 });

test('the match goes through the room: each packet to the other player only, nothing else with it', async () => {
  const { host, guest, say } = await room();
  await say(host, { type: 'm', d: packet(3) });
  await say(guest, { type: 'm', d: packet(4) });
  assert.deepEqual(guest.of('m'), [{ type: 'm', d: packet(3) }]);
  assert.deepEqual(host.of('m'), [{ type: 'm', d: packet(4) }]);
});

test('WebRTC signalling is never passed on, whatever it carries', async () => {
  const { host, guest, say } = await room();
  const offer = { kind: 'offer', sdp: { type: 'offer', sdp: `v=0\r\nc=IN IP4 ${HOST_IP}\r\na=candidate:1 1 udp 1 ${HOST_IP} 5 typ srflx raddr ${LOCAL_IP} rport 6\r\n` } };
  await say(host, { type: 'signal', data: offer });
  await say(host, { type: 'signal', data: { kind: 'ice', candidate: { candidate: `candidate:2 1 udp 1 ${V6} 5 typ host` } } });
  await say(guest, { type: 'signal', data: { kind: 'answer', sdp: { type: 'answer', sdp: `v=0\r\nc=IN IP4 ${GUEST_IP}\r\n` } } });
  assert.equal(guest.of('signal').length + host.of('signal').length, 0);
  holdsNone([host.sent, guest.sent], 'what the players were sent');
});

test('nothing the server answers, stores, lists or sends a player holds an address, through a whole room and match', async () => {
  const { host, guest, say, r, created, joined, lobby, env } = await room();
  holdsNone([created, joined], 'the create and join answers');
  await say(host, { type: 'fighter', fighterId: '0001' });
  await say(guest, { type: 'fighter', fighterId: '0003' });
  await say(host, { type: 'ready', ready: true, turn: true });
  await say(guest, { type: 'ready', ready: true, turn: false });
  await say(host, { type: 'start', seed: 7 });
  for (let s = 1; s < 40; s++) {
    await say(host, { type: 'm', d: packet(s) });
    await say(guest, { type: 'm', d: packet(s) });
  }
  await say(host, { type: 'end' });
  await say(host, { type: 'rematch' });
  await say(guest, { type: 'rematch' });
  holdsNone([host.sent, guest.sent], 'what the players were sent');
  holdsNone([...r.ctx.storage.data.entries()], 'the room\'s storage');
  holdsNone([...lobby().ctx.storage.data.entries()], 'the Lobby\'s storage');
  holdsNone([...lobby().hits.keys()], 'the Lobby\'s counts');
  const listed = await (await handle(gameRequest('/rooms', { ip: HOST_IP }), env)).json();
  holdsNone(listed, 'the public list');
  // A player sees the other's name, fighter, Ready, Rematch and connection:
  // never a token, a session or an address.
  const snapshot = guest.of('room').at(-1);
  assert.deepEqual(Object.keys(snapshot.players.host).sort(), ['connected', 'fighterId', 'name', 'ready', 'rematch']);
  assert.ok(!JSON.stringify(guest.sent).includes(created.token), 'never the host\'s token');
  assert.ok(!JSON.stringify(host.sent).includes(joined.token), 'never the guest\'s token');
});

test('the Lobby counts callers by a salted hash: no address in its memory or its storage', async () => {
  const { env, lobby } = makeEnv();
  for (const ip of [HOST_IP, GUEST_IP, V6]) {
    await handle(gameRequest('/rooms', { ip }), env);
    await handle(gameRequest('/rooms', { method: 'POST', body: createBody(), ip }), env);
  }
  const l = lobby();
  assert.equal(l.hits.size, 6, 'two actions for each of three callers');
  holdsNone([...l.hits.keys()], 'the Lobby\'s counts');
  holdsNone([...l.ctx.storage.data.entries()], 'the Lobby\'s storage');
  // The same caller is the same key under one salt, another under another.
  const a = callerKey(HOST_IP, 'salt-1');
  assert.equal(callerKey(HOST_IP, 'salt-1'), a);
  assert.notEqual(callerKey(HOST_IP, 'salt-2'), a);
  assert.notEqual(callerKey(GUEST_IP, 'salt-1'), a);
  assert.match(a, /^[0-9a-f]{16}$/);
  // Across many callers, no two share a count.
  const keys = new Set();
  for (let i = 0; i < 20000; i++) keys.add(callerKey(`10.${i >> 8}.${i & 255}.${i % 7}`, 'salt-1'));
  assert.equal(keys.size, 20000);
});

test('a packet is never saved: the room writes its last activity at most once a minute while a match runs', async () => {
  const { host, say, r, clock } = await room();
  const writes = r.ctx.storage.writes;
  for (let s = 1; s <= 100; s++) {
    clock.now += 50;
    await say(host, { type: 'm', d: packet(s) });
  }
  assert.ok(r.ctx.storage.writes - writes <= 1, `${r.ctx.storage.writes - writes} writes for 100 packets over 5 s`);
  clock.now += 60_000;
  await say(host, { type: 'm', d: packet(101) });
  assert.equal(r.state.lastActive, clock.now, 'a match keeps the room active');
  assert.equal((await r.ctx.storage.get('room')).lastActive, clock.now, 'saved again after a minute');
});

test('a seat\'s allowance: the game\'s 20 a second pass, a flood is cut, and a seat flooding on is closed', async () => {
  const { host, guest, say, clock } = await room();
  // The game's rate, with a hash a second, for 10 s: every packet passes.
  for (let i = 0; i < 210; i++) {
    clock.now += 1000 / 21;
    await say(host, { type: 'm', d: packet(i) });
  }
  assert.equal(guest.of('m').length, 210);
  // A flood in one moment: about a burst's worth passes (the allowance
  // was nearly full), the rest is dropped.
  const passed = guest.of('m').length;
  for (let i = 0; i < MATCH_BURST + 30; i++) await say(host, { type: 'm', d: packet(i) });
  const flood = guest.of('m').length - passed;
  assert.ok(flood >= MATCH_BURST - 2 && flood <= MATCH_BURST, `${flood} of the flood passed`);
  assert.equal(host.closed, null, 'not closed yet');
  for (let i = 0; i < 40; i++) await say(host, { type: 'm', d: packet(i) });
  assert.deepEqual(host.closed, { code: 4008, reason: 'too_fast' }, 'a whole burst past it: its socket is closed');
  assert.equal(guest.of('m').length - passed, flood, 'nothing more passed');
  assert.equal(guest.closed, null, 'the other player keeps theirs');
  assert.ok(MATCH_RATE >= 21, 'the game\'s own rate fits');
});

test('a long match keeps the Lobby\'s daily budget up to date: a report every 50 requests\' worth of packets', async () => {
  const { host, guest, say, lobby, clock } = await room();
  const before = lobby().budget.used;
  // 50 s of a match: 20 packets a second from each player, 2,000 in all.
  for (let i = 0; i < 1000; i++) {
    clock.now += 50;
    await say(host, { type: 'm', d: packet(i) });
    await say(guest, { type: 'm', d: packet(i) });
    // Reported during the match, not only at its end.
    if (i === 600) assert.ok(lobby().budget.used - before >= 50, 'reported as it goes');
  }
  // The match's end reports what is left.
  await say(host, { type: 'end' });
  const spent = lobby().budget.used - before;
  // 2,001 messages at 20 : 1 are 101 requests, plus the reports themselves.
  assert.ok(spent >= 101 && spent <= 106, `${spent} requests counted`);
});

test('wrangler.toml keeps Cloudflare\'s per-request logs (which hold callers\' addresses) off', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^\[observability\.logs\]\ninvocation_logs = false$/m);
});
