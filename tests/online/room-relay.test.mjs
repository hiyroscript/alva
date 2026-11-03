// The match goes through the room, never straight to the other browser
// (js/online/room-relay.js, server/src/room.js): two sessions on the real
// room server code connect through their room, play a match there in
// lockstep, never make a WebRTC connection and never send signalling, and
// what each receives names nobody's address. The transport itself, too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_A, TEST_B, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { backend, otherPlayer, otherSide, settle, settleAll } from '../helpers/online-app.mjs';

const { RelayTransport, roomRelay } = await import('../../js/online/room-relay.js');
const { battleHash } = await import('../../js/online/state-hash.js');
const { CONFIG } = await import('../../js/config.js');

useTestFighters(TEST_A, TEST_B);

test('the relay transport: what it sends goes to the room, what the room hands it arrives, closing ends both', () => {
  const sent = [];
  const t = new RelayTransport((d) => sent.push(d));
  const got = [];
  let closed = 0;
  t.onMessage((m) => got.push(m));
  t.onClose(() => { closed += 1; });
  assert.equal(t.send({ t: 'in', s: 1 }), true);
  assert.deepEqual(sent, [{ t: 'in', s: 1 }]);
  t.receive({ t: 'in', s: 2 });
  t.receive('not a packet');
  t.receive(null);
  assert.deepEqual(got, [{ t: 'in', s: 2 }]);
  // The room's socket down: the send is lost, as on any network.
  const down = new RelayTransport(() => false);
  assert.equal(down.send({ t: 'in' }), false);
  t.close();
  t.close();
  assert.equal(closed, 1);
  assert.equal(t.open, false);
  assert.equal(t.send({ t: 'in' }), false);
  t.receive({ t: 'in', s: 3 });
  assert.equal(got.length, 1);
  // The link a session makes: open at once.
  const link = roomRelay({ send: () => true });
  return link.start().then((transport) => {
    assert.equal(transport.open, true);
    link.cancel();
    assert.equal(transport.open, false);
  });
});

// Two players in one room on the real server code, with the room's relay
// (no test hub): every message each one's socket sends is kept.
async function roomOfTwo() {
  const server = backend();
  const host = otherPlayer(server, null, { name: 'Ana' });
  const guest = otherPlayer(server, null, { name: 'Sam' });
  const sent = { host: [], guest: [] };
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    const send = p.session.send.bind(p.session);
    p.session.send = (m) => {
      sent[name].push(m);
      return send(m);
    };
  }
  const received = { host: [], guest: [] };
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    const handle = p.session.handle.bind(p.session);
    p.session.handle = (m) => {
      received[name].push(m);
      return handle(m);
    };
  }
  await host.session.createRoom({ name: "Ana's room", visibility: 'public', mode: 'quick-battle' });
  await guest.session.joinRoom({ code: host.session.room.code });
  await settleAll(10);
  return { server, host, guest, sent, received };
}

test('both players connect through their room: no WebRTC connection, no signalling', async () => {
  const made = [];
  const saved = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = class { constructor() { made.push(this); } };
  try {
    const { host, guest, sent } = await roomOfTwo();
    assert.equal(host.session.peer.status, 'open');
    assert.equal(guest.session.peer.status, 'open');
    assert.equal(made.length, 0, 'no RTCPeerConnection, ever');
    assert.equal([...sent.host, ...sent.guest].filter((m) => m.type === 'signal').length, 0, 'no signalling sent');
    // A packet each way, through the room.
    const got = { host: [], guest: [] };
    host.session.peer.transport.onMessage((m) => got.host.push(m));
    guest.session.peer.transport.onMessage((m) => got.guest.push(m));
    host.session.peer.transport.send({ t: 'in', m: 1, s: 5, f: [1], a: 4 });
    guest.session.peer.transport.send({ t: 'hash', m: 1, s: 60, h: 'x' });
    await settleAll();
    assert.deepEqual(got.guest, [{ t: 'in', m: 1, s: 5, f: [1], a: 4 }]);
    assert.deepEqual(got.host, [{ t: 'hash', m: 1, s: 60, h: 'x' }]);
  } finally {
    if (saved) globalThis.RTCPeerConnection = saved;
    else delete globalThis.RTCPeerConnection;
  }
});

test('a match through the room: both sides step together, the same world on both, and nothing received names an address', async () => {
  const { host, guest, received, server } = await roomOfTwo();
  host.session.pickFighter(TEST_A.id);
  guest.session.pickFighter(TEST_B.id);
  await settleAll();
  // In the room, the host's browser measures the trip to the other player
  // through the room (its pings, answered at once).
  for (let i = 0; i < 6; i++) {
    host.session.delayProbe.ping();
    await settleAll();
  }
  assert.ok(host.session.delayProbe.samples.length >= 4, 'round trips measured through the room');
  host.session.setReady(true);
  guest.session.setReady(true);
  await settleAll(10);
  assert.ok(host.session.start && guest.session.start, 'the match started for both');
  // Next door (the test's room answers in a millisecond): the shortest
  // delay, the same in both starts.
  assert.equal(host.session.start.delay, CONFIG.online.inputDelayRange.min);
  assert.equal(guest.session.start.delay, host.session.start.delay);
  // Both as the game plays: a packet at most every CONFIG.online.
  // sendIntervalMs, on a clock that goes on with the frames.
  let now = 0;
  const asPlayed = { clock: () => now, sendIntervalMs: CONFIG.online.sendIntervalMs };
  const a = otherSide(host, host.session.start, { ...asPlayed, script: (n) => (n % 40 < 20 ? { runRight: true } : null) });
  const b = otherSide(guest, guest.session.start, { ...asPlayed, script: (n) => (n % 30 < 10 ? { runLeft: true } : null) });
  const packetsBefore = received.guest.filter((m) => m.type === 'm').length;
  for (let i = 0; i < 400; i++) {
    // The room's time goes on as the frames do (its allowance per seat
    // refills with it).
    now += 1000 / 60;
    server.clock.now += 1000 / 60;
    a.lockstep.advance(1 / 60);
    b.lockstep.advance(1 / 60);
    // The room's sockets deliver a tick later, as a network would.
    await settle();
    await settle();
  }
  assert.ok(a.lockstep.next > 300 && b.lockstep.next > 300, `both ran (${a.lockstep.next}, ${b.lockstep.next})`);
  assert.equal(a.lockstep.delay, host.session.start.delay, 'both step with the chosen delay');
  assert.equal(b.lockstep.delay, host.session.start.delay);
  assert.equal(a.ends.length + b.ends.length, 0, 'no desync, no timeout');
  // Compare at the same step.
  // The game's rate: about 30 packets a second from each, well inside the
  // room's allowance (none dropped, no socket closed).
  const packets = received.guest.filter((m) => m.type === 'm').length - packetsBefore;
  assert.ok(packets > 185 && packets < 215, `${packets} packets from the host in 400 frames (about 6.7 s)`);
  while (a.lockstep.next !== b.lockstep.next) {
    now += 1000 / 60;
    server.clock.now += 1000 / 60;
    (a.lockstep.next < b.lockstep.next ? a : b).lockstep.advance(1 / 60);
    await settle();
    await settle();
  }
  assert.equal(battleHash(a.battle), battleHash(b.battle), 'the same world on both sides');
  // Everything each received came from the room, and the room names no
  // address: the test server saw callers from 203.0.113.7.
  const text = JSON.stringify(received);
  assert.ok(received.guest.filter((m) => m.type === 'm').length > 50, 'the host\'s packets reached the guest');
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(text), 'no IP address in anything received');
  assert.ok(server.env, 'on the real server code');
});
