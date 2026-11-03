// Run with node --test server/tests/room.test.mjs (no dependencies, no
// Cloudflare account). A Room on fake Durable Objects and sockets: seats by
// token, the room as each player sees it, fighters and Ready, the host's
// start (filled in by the room itself), rematches, the match's packets
// passed to the other player (and WebRTC signalling never), a guest leaving, the host leaving (the room
// closes and says why), reconnecting within the grace, the alarms that
// close a room left idle or free a seat left empty, and its reports to the
// Lobby.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index.js';
import { SEAT_GRACE_MS } from '../src/room.js';
import { makeEnv, gameRequest, createBody, joinBody, FakeSocket } from './fakes.mjs';

const post = async (env, path, body) => (await handle(gameRequest(path, { method: 'POST', body }), env)).json();

// A room with its host (and, unless `guest` is false, a guest) connected.
async function roomWithPlayers({ guest = true, vars } = {}) {
  const made = makeEnv(vars);
  const { env, room, lobby } = made;
  const created = await post(env, '/rooms', createBody());
  const r = room(created.room.id);
  const host = new FakeSocket();
  await r.connect('host', host);
  let guestWs = null;
  let joined = null;
  if (guest) {
    joined = await post(env, '/rooms/join', joinBody({ code: created.room.code }));
    guestWs = new FakeSocket();
    await r.connect('guest', guestWs);
  }
  const say = (ws, message) => r.webSocketMessage(ws, JSON.stringify(message));
  return { ...made, env, r, host, guest: guestWs, created, joined, say, lobby };
}

test('each player connects to their own seat with their token; a wrong token is refused', async () => {
  const { env, room } = makeEnv();
  const created = await post(env, '/rooms', createBody());
  const ws = (token) => handle(gameRequest(`/rooms/${created.room.id}/ws?token=${token}`, { headers: { upgrade: 'websocket' } }), env);
  assert.equal((await ws('0'.repeat(32))).status, 403, 'not a seat\'s token');
  assert.equal((await ws(created.token).catch((e) => e)).message !== undefined, true, 'the right token reaches the upgrade (WebSocketPair is Cloudflare\'s)');
  // Without the upgrade header, or to a room that does not exist.
  assert.equal((await handle(gameRequest(`/rooms/${created.room.id}/ws?token=${created.token}`), env)).status, 400);
  assert.equal((await handle(gameRequest(`/rooms/${'e'.repeat(20)}/ws?token=x`, { headers: { upgrade: 'websocket' } }), env)).status, 404);
  assert.equal((await handle(gameRequest('/rooms/not-an-id/ws', { headers: { upgrade: 'websocket' } }), env)).status, 404);
  // With a fake socket pair, the upgrade answers 101 with the client end.
  globalThis.WebSocketPair = class { constructor() { this[0] = new FakeSocket(); this[1] = new FakeSocket(); } };
  const OriginalResponse = globalThis.Response;
  globalThis.Response = class extends OriginalResponse {
    constructor(bodyInit, init = {}) {
      if (init.status === 101) {
        super(null, { status: 200 });
        Object.defineProperty(this, 'status', { value: 101 });
        this.webSocket = init.webSocket;
        return;
      }
      super(bodyInit, init);
    }
  };
  try {
    const res = await ws(created.token);
    assert.equal(res.status, 101);
    assert.ok(res.webSocket instanceof FakeSocket);
    assert.equal(room(created.room.id).state.seats.host.connected, true);
  } finally {
    globalThis.Response = OriginalResponse;
    delete globalThis.WebSocketPair;
  }
});

test('the room as each player sees it: names, fighters, Ready, connection; never a token or a session', async () => {
  const { host, guest, created } = await roomWithPlayers();
  const view = guest.last;
  assert.equal(view.type, 'room');
  assert.equal(view.you, 'guest');
  assert.equal(host.last.you, 'host');
  assert.deepEqual(view.room, { ...view.room, id: created.room.id, code: created.room.code, status: 'full', mode: 'quick-battle' });
  assert.deepEqual(view.players.host, { name: 'Chris', fighterId: null, ready: false, connected: true, rematch: false });
  assert.equal(view.players.guest.name, 'Sam');
  assert.doesNotMatch(JSON.stringify([...host.sent, ...guest.sent]), /token|session/);
});

test('fighters and Ready: Ready needs a fighter, a new fighter clears Ready; both see every change', async () => {
  const { host, guest, say } = await roomWithPlayers();
  await say(host, { type: 'ready', ready: true });
  assert.deepEqual(host.last, { type: 'error', code: 'bad_request' });
  await say(host, { type: 'fighter', fighterId: '0001' });
  await say(host, { type: 'ready', ready: true, turn: false });
  assert.equal(guest.last.players.host.ready, true);
  assert.equal(guest.last.players.host.fighterId, '0001');
  await say(host, { type: 'fighter', fighterId: '0002' });
  assert.equal(guest.last.players.host.ready, false, 'changing fighter un-readies');
  await say(host, { type: 'fighter', fighterId: '../../etc' });
  assert.equal(host.last.code, 'bad_request');
});

test('the start: only the host, only with both ready; the room fills in the players itself; then playing, and back', async () => {
  const { host, guest, say, lobby, created } = await roomWithPlayers();
  await say(host, { type: 'fighter', fighterId: '0001' });
  await say(guest, { type: 'fighter', fighterId: '0003' });
  await say(host, { type: 'ready', ready: true, turn: false });
  await say(host, { type: 'start', seed: 99 });
  assert.equal(host.last.code, 'bad_request', 'the guest is not ready yet');
  await say(guest, { type: 'ready', ready: true });
  await say(guest, { type: 'start', seed: 99 });
  assert.equal(guest.last.code, 'bad_request', 'only the host starts');
  await say(host, { type: 'start', seed: -1 });
  assert.equal(host.last.code, 'bad_request', 'a seed is a 32-bit whole number');
  await say(host, { type: 'start', seed: 123456, p1: { name: 'Hacker', fighterId: 'x' } });
  const [hs] = host.of('start');
  const [gs] = guest.of('start');
  assert.deepEqual(hs, gs, 'both get the same start');
  assert.deepEqual(hs, {
    type: 'start', match: 1, seed: 123456,
    p1: { name: 'Chris', fighterId: '0001', turn: false },
    p2: { name: 'Sam', fighterId: '0003', turn: true },
  });
  assert.equal(guest.last.room.status, 'playing');
  assert.equal(guest.last.players.host.ready, false, 'Ready is spent');
  assert.equal(lobby().rooms[created.room.id].status, 'playing', 'reported');
  await say(guest, { type: 'end' });
  assert.equal(host.last.room.status, 'full');
  assert.equal(lobby().rooms[created.room.id].status, 'full');
});

test('a rematch: both must accept; then the host starts the next match without Ready', async () => {
  const { host, guest, say } = await roomWithPlayers();
  await say(host, { type: 'fighter', fighterId: '0001' });
  await say(guest, { type: 'fighter', fighterId: '0001' });
  await say(host, { type: 'ready', ready: true });
  await say(guest, { type: 'ready', ready: true });
  await say(host, { type: 'start', seed: 1 });
  await say(host, { type: 'start', seed: 2 });
  assert.equal(host.last.code, 'bad_request', 'no second start without a rematch');
  await say(guest, { type: 'rematch' });
  assert.equal(host.last.players.guest.rematch, true, 'the host sees the guest wants one');
  assert.equal(host.of('rematch').length, 0);
  await say(host, { type: 'rematch' });
  assert.equal(host.of('rematch').length, 1);
  assert.equal(guest.of('rematch').length, 1);
  await say(host, { type: 'start', seed: 2 });
  assert.equal(guest.of('start').at(-1).match, 2);
  assert.equal(guest.of('start').at(-1).seed, 2);
});

test('a match packet goes to the other player only, as it came; signalling never; anything else unknown is refused', async () => {
  const { host, guest, say } = await roomWithPlayers();
  const before = host.sent.length;
  await say(host, { type: 'm', d: { t: 'in', m: 1, s: 3, f: [0, 5], a: 2 } });
  assert.deepEqual(guest.last, { type: 'm', d: { t: 'in', m: 1, s: 3, f: [0, 5], a: 2 } });
  assert.equal(host.sent.length, before, 'never echoed');
  await say(guest, { type: 'm', d: { t: 'hash', m: 1, s: 60, h: 'abc' } });
  assert.deepEqual(host.last, { type: 'm', d: { t: 'hash', m: 1, s: 60, h: 'abc' } });
  // A packet that is not an object, or too large, is dropped.
  const guestBefore = guest.sent.length;
  for (const d of [null, 'text', [1, 2], { f: 'x'.repeat(3000) }]) await say(host, { type: 'm', d });
  assert.equal(guest.sent.length, guestBefore);
  // WebRTC signalling (an older copy's) is never passed on: no address
  // could reach the other player through it.
  await say(host, { type: 'signal', data: { kind: 'offer', sdp: { type: 'offer', sdp: 'v=0…' } } });
  await say(guest, { type: 'signal', data: { kind: 'ice', candidate: { candidate: 'candidate:1 1 udp 1 203.0.113.50 5 typ srflx' } } });
  assert.equal(guest.of('signal').length + host.of('signal').length, 0);
  await say(host, { type: 'input', frames: [1, 2, 3] });
  assert.deepEqual(host.last, { type: 'error', code: 'bad_request' }, 'only the room\'s own kinds');
  await say(host, 'x'.repeat(20000));
  assert.equal(host.last.code, 'too_large');
  const r = await roomWithPlayers();
  await r.r.webSocketMessage(r.host, '{nope');
  assert.equal(r.host.last.code, 'bad_request');
});

test('a guest leaving frees the seat; the host sees an empty seat and the room is open again', async () => {
  const { host, guest, say, lobby, created } = await roomWithPlayers();
  await say(guest, { type: 'leave' });
  assert.equal(guest.closed?.code, 1000);
  assert.equal(host.last.players.guest, null);
  assert.equal(host.last.room.status, 'open');
  assert.equal(lobby().rooms[created.room.id].players, 1);
  assert.equal(lobby().rooms[created.room.id].status, 'open');
});

test('the host leaving closes the room: the guest is told why, the Lobby forgets it, its storage is cleared', async () => {
  const { host, guest, say, lobby, created, env, r } = await roomWithPlayers();
  await say(host, { type: 'leave' });
  assert.deepEqual(guest.of('closed'), [{ type: 'closed', reason: 'host_left' }]);
  assert.equal(guest.closed?.code, 1000);
  assert.equal(lobby().rooms[created.room.id], undefined);
  assert.equal(r.ctx.storage.data.size, 0);
  const late = await post(env, '/rooms/join', joinBody({ code: created.room.code }));
  assert.equal(late.error, 'room_not_found');
});

test('a lost connection: the seat waits SEAT_GRACE_MS for a reconnect, then the guest\'s frees, the host\'s closes the room', async () => {
  const a = await roomWithPlayers();
  a.guest.readyState = 3;
  await a.r.webSocketClose(a.guest, 1006, '', false);
  assert.equal(a.host.last.players.guest.connected, false);
  assert.ok(a.r.ctx.storage.alarm <= a.clock.now + SEAT_GRACE_MS);
  // Back in time: the seat is still theirs.
  a.clock.now += SEAT_GRACE_MS - 1000;
  const back = new FakeSocket();
  await a.r.connect('guest', back);
  assert.equal(a.host.last.players.guest.connected, true);
  await a.r.alarm();
  assert.ok(a.r.state.seats.guest, 'kept');
  // Gone for good.
  back.readyState = 3;
  await a.r.webSocketClose(back);
  a.clock.now += SEAT_GRACE_MS;
  await a.r.alarm();
  assert.equal(a.r.state.seats.guest, null);
  assert.equal(a.host.last.players.guest, null);

  const b = await roomWithPlayers();
  b.host.readyState = 3;
  await b.r.webSocketClose(b.host);
  b.clock.now += SEAT_GRACE_MS;
  await b.r.alarm();
  assert.deepEqual(b.guest.of('closed'), [{ type: 'closed', reason: 'host_left' }]);
  assert.equal(b.lobby().rooms[b.created.room.id], undefined);
});

test('a reconnect replaces the seat\'s old socket', async () => {
  const { r, host, guest } = await roomWithPlayers();
  const again = new FakeSocket();
  await r.connect('host', again);
  assert.equal(host.closed?.code, 4000);
  assert.equal(guest.last.players.host.connected, true);
});

test('a host who never connects: the room closes once the grace is over', async () => {
  const { env, room, clock, lobby } = makeEnv();
  const created = await post(env, '/rooms', createBody());
  const r = room(created.room.id);
  clock.now += SEAT_GRACE_MS;
  await r.alarm();
  assert.equal(r.state.closed, true);
  assert.equal(lobby().rooms[created.room.id], undefined);
});

test('a room with no activity for ROOM_IDLE_MINUTES closes itself ("expired")', async () => {
  const { r, host, guest, clock, say } = await roomWithPlayers();
  clock.now += 5 * 60_000;
  await say(host, { type: 'fighter', fighterId: '0001' });
  clock.now += 9 * 60_000;
  await r.alarm();
  assert.equal(guest.of('closed').length, 0, 'active five minutes in');
  clock.now += 60_000;
  await r.alarm();
  assert.deepEqual(guest.of('closed'), [{ type: 'closed', reason: 'expired' }]);
  assert.deepEqual(host.of('closed'), [{ type: 'closed', reason: 'expired' }]);
});

test('a Room reports the requests it handled: connections and alarms one each, messages at 20 : 1', async () => {
  const { r, host, say, lobby } = await roomWithPlayers();
  const before = lobby().budget.used;
  for (let i = 0; i < 40; i++) await say(host, { type: 'fighter', fighterId: '0001' });
  await r.alarm();
  await say(host, { type: 'end' });
  // The report itself, plus 41 messages / 20 and the alarm.
  assert.equal(lobby().budget.used, before + 1 + Math.ceil(41 / 20 + 1));
});
