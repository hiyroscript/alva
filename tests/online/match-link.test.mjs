// The match link (js/online/match-link.js): the relay's servers asked of
// the room, then the relay-only WebRTC link; no relay or no link, no match
// ("Couldn't connect"). Then through the real room server's code: the
// relay's servers from the room, the signalling through it, the shortest
// delay for a trip this short, and a match played over the relay in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_A, TEST_B, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { backend, otherPlayer, otherSide, settle, settleAll } from '../helpers/online-app.mjs';
import { NO_RELAY, relayFor } from '../../server/tests/fakes.mjs';

const { matchLink } = await import('../../js/online/match-link.js');
const { memoryTransportPair } = await import('../../js/online/transport.js');
const { battleHash } = await import('../../js/online/state-hash.js');
const { CONFIG } = await import('../../js/config.js');

useTestFighters(TEST_A, TEST_B);

// A stand-in for the relay's WebRTC link: the host's offers through the
// room, and the guest's, once that offer reaches it, joins it in memory.
// With `fail`, every link fails as one that cannot connect does.
function fakeRelayPeers() {
  const hub = { offering: null, pairs: [], made: [], fail: false };
  hub.makePeer = ({ initiator, sendSignal, iceServers }) => {
    hub.made.push({ initiator, iceServers });
    const link = {
      start() {
        return new Promise((resolve, reject) => {
          link.resolve = resolve;
          link.reject = reject;
          if (hub.fail) {
            queueMicrotask(() => reject(new Error('timeout')));
            return;
          }
          if (initiator) {
            hub.offering = link;
            queueMicrotask(() => sendSignal({ kind: 'offer', sdp: { type: 'offer', sdp: 'v=0' } }));
          }
        });
      },
      handleSignal(data) {
        if (initiator || data?.kind !== 'offer' || !hub.offering) return;
        const host = hub.offering;
        hub.offering = null;
        const pair = memoryTransportPair();
        hub.pairs.push(pair);
        queueMicrotask(() => {
          host.resolve(pair.a);
          link.resolve(pair.b);
        });
      },
      cancel() {
        link.reject?.(new Error('cancelled'));
      },
    };
    return link;
  };
  return hub;
}

const SERVERS = [{ urls: ['turn:relay.example:3478'], username: 'u', credential: 'c' }];

test('the link: the relay\'s servers first, then the relay-only link; the other side\'s early signalling kept for it', async () => {
  const relay = fakeRelayPeers();
  let answer;
  const guest = matchLink({
    initiator: false, sendSignal: () => {}, requestRelay: () => new Promise((resolve) => { answer = resolve; }), makePeer: relay.makePeer,
  });
  const opening = guest.start();
  // The host's offer arrives before this side's relay servers: kept.
  relay.offering = { resolve() {}, reject() {} };
  guest.handleSignal({ kind: 'offer', sdp: { type: 'offer', sdp: 'v=0' } });
  assert.equal(relay.made.length, 0, 'no link before the relay\'s servers');
  answer(SERVERS);
  const transport = await opening;
  assert.deepEqual(relay.made, [{ initiator: false, iceServers: SERVERS }]);
  assert.equal(transport.open, true, 'the early offer was handed on, and the link opened');
});

test('no relay\'s servers, or a link that cannot be made, or a cancel: no link at all', async () => {
  const relay = fakeRelayPeers();
  const none = matchLink({ initiator: true, sendSignal: () => {}, requestRelay: () => Promise.reject(new Error('relay_unavailable')), makePeer: relay.makePeer });
  await assert.rejects(none.start(), /relay_unavailable/);
  assert.equal(relay.made.length, 0, 'never a link without the relay');
  relay.fail = true;
  const failing = matchLink({ initiator: true, sendSignal: () => {}, requestRelay: async () => SERVERS, makePeer: relay.makePeer });
  await assert.rejects(failing.start(), /timeout/);
  let answer;
  const cancelled = matchLink({ initiator: true, sendSignal: () => {}, requestRelay: () => new Promise((resolve) => { answer = resolve; }), makePeer: relay.makePeer });
  const opening = cancelled.start();
  cancelled.cancel();
  answer(SERVERS);
  await assert.rejects(opening, /cancelled/);
  assert.equal(relay.made.length, 1, 'only the failing one was made');
});

// Two players in a room on the real server code, their links the game's own
// (matchLink) over a stand-in for WebRTC.
async function roomOfTwo(vars, { now } = {}) {
  const server = backend(vars);
  const relay = fakeRelayPeers();
  const host = otherPlayer(server, null, { name: 'Ana' });
  const guest = otherPlayer(server, null, { name: 'Sam' });
  for (const p of [host, guest]) {
    p.session.peerFactory = (o) => matchLink({ ...o, makePeer: relay.makePeer });
    if (now) p.session.now = now;
  }
  await host.session.createRoom({ name: "Ana's room", visibility: 'public', mode: 'quick-battle' });
  await guest.session.joinRoom({ code: host.session.room.code });
  await settleAll(16);
  return { server, relay, host, guest };
}

test('through the real room: each player gets the relay\'s servers from it, the signalling goes through it, the link opens', async () => {
  const { relay, host, guest } = await roomOfTwo();
  assert.equal(relay.made.length, 2, 'both players made a relay link');
  // Each with a password of its own from Cloudflare's TURN service.
  const given = relay.made.map((m) => m.iceServers).sort((x, y) => x[0].username.localeCompare(y[0].username));
  assert.deepEqual(given, [relayFor(1), relayFor(2)]);
  assert.equal(host.session.peer.status, 'open');
  assert.equal(guest.session.peer.status, 'open');
  // Every frame goes at once over the relay, so a short trip gets the
  // shortest delay.
  for (let i = 0; i < 6; i++) {
    host.session.delayProbe.ping();
    relay.pairs[0].deliver();
    await settle();
  }
  assert.equal(host.session.matchDelay(), CONFIG.online.inputDelayRange.min);
});

test('the relay gone after the room was made: the link fails ("Couldn\'t connect"), and no other way is tried', async () => {
  const server = backend();
  const relay = fakeRelayPeers();
  const host = otherPlayer(server, null, { name: 'Ana' });
  const guest = otherPlayer(server, null, { name: 'Sam' });
  for (const p of [host, guest]) p.session.peerFactory = (o) => matchLink({ ...o, makePeer: relay.makePeer });
  await host.session.createRoom({ name: "Ana's room", visibility: 'public', mode: 'quick-battle' });
  Object.assign(server.env, NO_RELAY);
  // Joining needs a relay too: the guest is refused.
  await assert.rejects(guest.session.joinRoom({ code: host.session.room.code }), (err) => err.code === 'relay_unavailable');
});

test('a match over the relay: both sides step together, the same world on both', async () => {
  const { relay, host, guest } = await roomOfTwo();
  host.session.pickFighter(TEST_A.id);
  guest.session.pickFighter(TEST_B.id);
  await settleAll();
  for (let i = 0; i < 6; i++) {
    host.session.delayProbe.ping();
    relay.pairs[0].deliver();
    await settle();
  }
  host.session.setReady(true);
  guest.session.setReady(true);
  await settleAll(10);
  assert.ok(host.session.start && guest.session.start);
  assert.equal(host.session.start.delay, CONFIG.online.inputDelayRange.min, 'the delay chosen for the relay');
  assert.equal(guest.session.start.delay, host.session.start.delay);
  const a = otherSide(host, host.session.start, { script: (n) => (n % 40 < 20 ? { runRight: true } : null) });
  const b = otherSide(guest, guest.session.start, { script: (n) => (n % 30 < 10 ? { runLeft: true } : null) });
  for (let i = 0; i < 400; i++) {
    a.lockstep.advance(1 / 60);
    b.lockstep.advance(1 / 60);
    for (const pair of relay.pairs) pair.deliver();
  }
  assert.ok(a.lockstep.next > 380 && b.lockstep.next > 380, `both ran (${a.lockstep.next}, ${b.lockstep.next})`);
  assert.equal(a.lockstep.delay, host.session.start.delay);
  assert.equal(a.ends.length + b.ends.length, 0, 'no desync, no timeout');
  while (a.lockstep.next !== b.lockstep.next) {
    (a.lockstep.next < b.lockstep.next ? a : b).lockstep.advance(1 / 60);
    for (const pair of relay.pairs) pair.deliver();
  }
  assert.equal(battleHash(a.battle), battleHash(b.battle));
});

test('between matches, a link older than linkRenewMs is made again, with new passwords; the trip measured is kept; never during a match', async () => {
  let now = 1_000_000;
  const { server, relay, host, guest } = await roomOfTwo(undefined, { now: () => now });
  assert.equal(relay.made.length, 2);
  for (let i = 0; i < 6; i++) {
    host.session.delayProbe.ping();
    relay.pairs[0].deliver();
    await settle();
  }
  const measured = [...host.session.delayProbe.samples];
  // Younger than linkRenewMs: kept.
  now += CONFIG.online.linkRenewMs - 60_000;
  guest.session.pickFighter(TEST_B.id);
  await settleAll(16);
  assert.equal(relay.made.length, 2, 'not yet');
  // Older: the host's browser makes it again, and the guest's follows.
  now += 2 * 60_000;
  guest.session.pickFighter(TEST_A.id);
  await settleAll(30);
  assert.equal(relay.made.length, 4, 'a new link on each side');
  assert.equal(relay.pairs.length, 2);
  assert.equal(host.session.peer.status, 'open');
  assert.equal(guest.session.peer.status, 'open');
  assert.equal(relay.pairs[0].a.open, false, 'the old link closed');
  const renewed = relay.made.slice(2).map((m) => m.iceServers[0].username).sort();
  assert.deepEqual(renewed, ['user-3', 'user-4'], 'each with a new password');
  assert.equal(server.turn.requests.length, 4);
  assert.deepEqual(host.session.delayProbe.samples, measured, 'the trip measured is kept');
  assert.equal(host.session.matchDelay(), CONFIG.online.inputDelayRange.min, 'the next match need not wait for new pings');
  // During a match: never.
  host.session.pickFighter(TEST_A.id);
  guest.session.pickFighter(TEST_B.id);
  await settleAll();
  host.session.setReady(true);
  guest.session.setReady(true);
  await settleAll(10);
  assert.ok(host.session.start, 'a match started');
  now += CONFIG.online.linkRenewMs + 60_000;
  guest.session.send({ type: 'rematch' });
  await settleAll(16);
  assert.equal(relay.made.length, 4, 'not during the match');
  // Once it is over: made again.
  host.session.endMatch();
  guest.session.endMatch();
  await settleAll(30);
  assert.equal(relay.made.length, 6);
  assert.equal(host.session.peer.status, 'open');
  assert.equal(guest.session.peer.status, 'open');
});

test('this hour\'s relay passwords all handed out: the link fails as \'full\' ("Servers are full")', async () => {
  const { host, guest } = await roomOfTwo({ RELAY_PASSWORDS_PER_HOUR: '1' });
  const reasons = [host, guest].map((p) => p.session.peer.reason).filter(Boolean);
  assert.deepEqual(reasons, ['full'], 'one player got the hour\'s one password, the other was told full');
});
