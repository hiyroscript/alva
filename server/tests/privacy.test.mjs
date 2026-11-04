// Run with node --test server/tests/privacy.test.mjs. No player's network
// address reaches anyone: the WebRTC signalling a Room passes on is
// scrubbed of every address but the relay's (the server's copy of the
// rules and the game's give the same answers), each player gets the
// relay's servers and nothing more, no room is made without a relay, no
// match packet goes through the room, nothing the server answers, stores
// or sends a player holds an address, the Lobby counts callers by a salted
// hash, and Cloudflare's per-request logs are off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as server from '../src/privacy.js';
import * as game from '../../js/online/privacy.js';
import { callerKey } from '../src/privacy.js';
import { handle } from '../src/index.js';
import { makeEnv, gameRequest, createBody, joinBody, FakeSocket, NO_RELAY } from './fakes.mjs';

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

// Addresses a real browser would put in its signalling: its own public
// address, its local one, an mDNS name, and the relay's (Cloudflare's).
const MDNS = '3f2a9c1e-7b1d-4c2e-9d3a-0e5b6c7d8e9f.local';
const RELAY_IP = '198.51.100.7';

const HOST = `candidate:1 1 udp 2122260223 ${MDNS} 50123 typ host generation 0 ufrag abcd network-id 1`;
const HOST_LOCAL = `candidate:2 1 udp 2122260223 ${LOCAL_IP} 50124 typ host generation 0`;
const SRFLX = `candidate:3 1 udp 1686052607 ${HOST_IP} 61212 typ srflx raddr ${LOCAL_IP} rport 50123 generation 0 ufrag abcd`;
const PRFLX = `candidate:4 1 udp 1853824767 ${HOST_IP} 61213 typ prflx raddr ${LOCAL_IP} rport 50123`;
const HOST_V6 = `candidate:5 1 udp 2122262783 ${V6} 50125 typ host generation 0`;
const RELAY = `candidate:6 1 udp 41885439 ${RELAY_IP} 30000 typ relay raddr ${HOST_IP} rport 61212 generation 0 ufrag abcd network-cost 999`;
const RELAY_TCP = `candidate:7 1 tcp 25108223 ${RELAY_IP} 30001 typ relay raddr ${HOST_IP} rport 9 tcptype passive generation 0`;

const SDP = [
  'v=0',
  `o=- 4611731400430051336 2 IN IP4 ${HOST_IP}`,
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 61212 UDP/DTLS/SCTP webrtc-datachannel',
  `c=IN IP4 ${HOST_IP}`,
  `a=rtcp:61212 IN IP4 ${HOST_IP}`,
  `a=${HOST}`, `a=${SRFLX}`, `a=${RELAY}`, `a=${HOST_V6}`, `a=${PRFLX}`, `a=${RELAY_TCP}`,
  'a=ice-ufrag:abcd',
  'a=ice-pwd:0123456789abcdefghijklmn',
  'a=fingerprint:sha-256 AA:BB:CC',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  '',
].join('\r\n');


test('a candidate passes only as a relay candidate, with its related address (the player\'s own) blanked', () => {
  for (const scrub of [server.scrubCandidateLine, game.scrubCandidateLine]) {
    for (const line of [HOST, HOST_LOCAL, SRFLX, PRFLX, HOST_V6, `a=${SRFLX}`, '', 'nonsense', 'candidate:1 1 udp 1 1.2.3.4 5 typ', null, 42]) {
      assert.equal(scrub(line), null, String(line));
    }
    assert.equal(scrub(RELAY), `candidate:6 1 udp 41885439 ${RELAY_IP} 30000 typ relay raddr 0.0.0.0 rport 0 generation 0 ufrag abcd network-cost 999`);
    assert.equal(scrub(`a=${RELAY_TCP}`), `a=candidate:7 1 tcp 25108223 ${RELAY_IP} 30001 typ relay raddr 0.0.0.0 rport 0 tcptype passive generation 0`);
    assert.equal(scrub(`candidate:8 1 udp 1 ${RELAY_IP} 3 typ relay`), `candidate:8 1 udp 1 ${RELAY_IP} 3 typ relay`, 'no related address: nothing to blank');
    assert.equal(scrub(`${RELAY} ${'x'.repeat(1100)}`), null, 'too long');
  }
});

test('an offer or answer keeps no address but the relay\'s: candidates scrubbed, connection and origin lines blanked', () => {
  for (const scrub of [server.scrubSdp, game.scrubSdp]) {
    const out = scrub(SDP);
    holdsNone(out, 'the SDP');
    assert.ok(out.includes(RELAY_IP), 'the relay candidates stay');
    const lines = out.split('\r\n');
    assert.deepEqual(lines.filter((l) => l.startsWith('a=candidate:')).map((l) => l.split(' ')[0]), ['a=candidate:6', 'a=candidate:7']);
    assert.ok(lines.includes('c=IN IP4 0.0.0.0'));
    assert.ok(lines.includes('a=rtcp:61212 IN IP4 0.0.0.0'));
    assert.ok(lines.includes('o=- 4611731400430051336 2 IN IP4 127.0.0.1'));
    // Everything that makes the connection stays as it was.
    for (const kept of ['a=ice-ufrag:abcd', 'a=ice-pwd:0123456789abcdefghijklmn', 'a=fingerprint:sha-256 AA:BB:CC', 'a=mid:0', 'a=sctp-port:5000']) assert.ok(lines.includes(kept), kept);
    assert.equal(scrub(SDP.replaceAll('\r\n', '\n')), out.replaceAll('\r\n', '\n'), 'either line ending');
    assert.equal(scrub(`c=IN IP6 ${V6}`), 'c=IN IP6 ::');
    assert.equal(scrub('x'.repeat(13 * 1024)), null, 'too long');
  }
});

test('a signalling message passes scrubbed, or not at all; the game\'s copy of the rules gives the same answers', () => {
  const messages = [
    { kind: 'offer', sdp: { type: 'offer', sdp: SDP } },
    { kind: 'answer', sdp: { type: 'answer', sdp: SDP } },
    { kind: 'offer', sdp: { type: 'answer', sdp: SDP } },
    { kind: 'offer', sdp: { type: 'offer' } },
    { kind: 'ice', candidate: { candidate: SRFLX, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'abcd' } },
    { kind: 'ice', candidate: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 } },
    { kind: 'ice', candidate: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'abcd', extra: HOST_IP } },
    { kind: 'ice', candidate: { candidate: '', sdpMid: '0' } },
    { kind: 'ice', candidate: null },
    { kind: 'ice', candidate: 'text' },
    { kind: 'retry', note: HOST_IP },
    { kind: 'chat', text: HOST_IP },
    { kind: 'ice', candidate: { candidate: RELAY, sdpMid: 'x'.repeat(40), sdpMLineIndex: 99, usernameFragment: 7 } },
    null, 'offer', [],
  ];
  for (const m of messages) {
    const out = server.scrubSignal(m);
    assert.deepEqual(game.scrubSignal(m), out, JSON.stringify(m)?.slice(0, 60));
    holdsNone(out, JSON.stringify(m)?.slice(0, 60));
  }
  assert.equal(server.scrubSignal(messages[4]), null, 'a server-reflexive candidate: dropped');
  assert.equal(server.scrubSignal(messages[5]), null, 'a host candidate: dropped');
  assert.deepEqual(server.scrubSignal(messages[6]), {
    kind: 'ice', candidate: { candidate: server.scrubCandidateLine(RELAY), sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'abcd' },
  }, 'a relay candidate, with nothing it did not need');
  assert.deepEqual(server.scrubSignal(messages[7]), { kind: 'ice', candidate: { candidate: '', sdpMid: '0' } });
  assert.deepEqual(server.scrubSignal(messages[8]), { kind: 'ice', candidate: null });
  assert.deepEqual(server.scrubSignal(messages[10]), { kind: 'retry' });
  assert.equal(server.scrubSignal(messages[11]), null, 'an unknown kind');
  assert.equal(server.scrubSignal(messages[2]), null, 'an offer that says it is an answer');
  // Both files hold the same rules, line for line (only their headers differ).
  const body = (file) => readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter((l) => !l.startsWith('//'));
  const shared = (lines) => lines.slice(lines.findIndex((l) => l.startsWith('export function scrubCandidateLine')), lines.findIndex((l) => l.startsWith('function where')));
  assert.deepEqual(shared(body('../../js/online/privacy.js')), shared(body('../src/privacy.js')));
});


test('no match packet goes through the room: the match is the relay\'s alone', async () => {
  const { host, guest, say } = await room();
  await say(host, { type: 'm', d: packet(3) });
  assert.equal(guest.of('m').length, 0);
  assert.deepEqual(host.last, { type: 'error', code: 'bad_request' });
});

test('a Room passes the other player WebRTC signalling only scrubbed: no address but the relay\'s', async () => {
  const { host, guest, say } = await room();
  const before = guest.sent.length;
  await say(host, { type: 'signal', data: { kind: 'ice', candidate: { candidate: SRFLX, sdpMid: '0', sdpMLineIndex: 0 } } });
  await say(host, { type: 'signal', data: { kind: 'ice', candidate: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 } } });
  await say(host, { type: 'signal', data: { kind: 'chat', text: 'hi' } });
  assert.equal(guest.sent.length, before, 'nothing of those reached the guest');
  await say(host, { type: 'signal', data: { kind: 'offer', sdp: { type: 'offer', sdp: SDP } } });
  await say(host, { type: 'signal', data: { kind: 'ice', candidate: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 } } });
  const passed = guest.of('signal');
  assert.equal(passed.length, 2);
  assert.ok(passed[0].data.sdp.sdp.includes(RELAY_IP));
  assert.ok(passed[1].data.candidate.candidate.endsWith('raddr 0.0.0.0 rport 0 generation 0 ufrag abcd network-cost 999'));
  holdsNone(guest.sent, 'what the guest was sent');
  holdsNone([MDNS, LOCAL_IP].map((x) => JSON.stringify(guest.sent).includes(x)) .filter(Boolean), 'no local address or mDNS name');
  assert.equal(host.of('signal').length, 0, 'never echoed back');
});

test('the relay\'s servers go to the player who asks, only with the other seat taken, a few at a time', async () => {
  const { host, guest, say, clock } = await room();
  await say(host, { type: 'relay' });
  assert.deepEqual(host.of('relay').at(-1), { type: 'relay', iceServers: [{ urls: ['turn:relay1.example.com:3478', 'turns:relay1.example.com:443'], username: 'alva-user', credential: 'alva-secret' }] }, 'TURN addresses only');
  assert.equal(guest.of('relay').length, 0, 'only to who asked');
  for (let i = 0; i < 10; i++) await say(host, { type: 'relay' });
  assert.deepEqual(host.of('relay').at(-1), { type: 'relay', error: 'rate_limited' }, 'ten in ten minutes: the eleventh is refused');
  clock.now += 10 * 60_000;
  await say(host, { type: 'relay' });
  assert.ok(host.of('relay').at(-1).iceServers, 'again once the window has passed');
  // Alone in the room: none.
  const alone = makeEnv();
  const created = await (await handle(gameRequest('/rooms', { method: 'POST', body: createBody() }), alone.env)).json();
  const ws = new FakeSocket();
  await alone.room(created.room.id).connect('host', ws);
  await alone.room(created.room.id).webSocketMessage(ws, JSON.stringify({ type: 'relay' }));
  assert.deepEqual(ws.of('relay').at(-1), { type: 'relay', error: 'bad_request' });
  // Half set up is none.
  assert.equal((await import('../src/privacy.js')).relayServers({ TURN_URLS: 'turn:a:3478', TURN_USERNAME: 'u' }).length, 0);
  assert.equal((await import('../src/privacy.js')).relayServers({ TURN_URLS: 'stun:a:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' }).length, 0);
});

test('without a relay no room is made or joined, and /health says so; a room still asking is told relay_unavailable', async () => {
  const { env } = makeEnv(NO_RELAY);
  for (const [path, body] of [['/rooms', createBody()], ['/rooms/join', joinBody({ code: 'ABCDE' })]]) {
    const res = await handle(gameRequest(path, { method: 'POST', body }), env);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'relay_unavailable' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://html-classic.itch.zone', 'readable by the game');
  }
  assert.equal((await handle(gameRequest('/rooms'), env)).status, 200, 'the list still reads');
  const health = await (await handle(gameRequest('/health'), env)).json();
  assert.equal(health.relay, false);
  assert.equal(health.ok, true, 'the server itself is up');
  assert.equal((await (await handle(gameRequest('/health'), makeEnv().env)).json()).relay, true);
  // A room made while there was one, after it was taken away.
  const { host, say, env: roomEnv } = await room();
  Object.assign(roomEnv, NO_RELAY);
  await say(host, { type: 'relay' });
  assert.deepEqual(host.of('relay').at(-1), { type: 'relay', error: 'relay_unavailable' });
});

test('nothing the server answers, stores, lists or sends a player holds an address, through a whole room: relay, signalling, matches', async () => {
  const { host, guest, say, r, created, joined, lobby, env } = await room();
  holdsNone([created, joined], 'the create and join answers');
  await say(host, { type: 'fighter', fighterId: '0001' });
  await say(guest, { type: 'fighter', fighterId: '0003' });
  await say(host, { type: 'ready', ready: true, turn: true });
  await say(guest, { type: 'ready', ready: true, turn: false });
  await say(host, { type: 'relay' });
  await say(guest, { type: 'relay' });
  await say(host, { type: 'signal', data: { kind: 'offer', sdp: { type: 'offer', sdp: SDP } } });
  await say(guest, { type: 'signal', data: { kind: 'answer', sdp: { type: 'answer', sdp: SDP } } });
  for (const c of [HOST, HOST_LOCAL, SRFLX, PRFLX, HOST_V6, RELAY]) await say(host, { type: 'signal', data: { kind: 'ice', candidate: { candidate: c, sdpMid: '0', sdpMLineIndex: 0 } } });
  await say(host, { type: 'start', seed: 7, delay: 3 });
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

test('wrangler.toml keeps Cloudflare\'s per-request logs (which hold callers\' addresses) off', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^\[observability\.logs\]\ninvocation_logs = false$/m);
});
