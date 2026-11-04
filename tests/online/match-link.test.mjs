// The match link (js/online/match-link.js): the relay's servers asked of
// the room, then the relay-only WebRTC link; no relay or no link, no match
// ("Couldn't connect"). Then through the real room server's code: the
// relay's servers from the room, the signalling through it, the shortest
// delay for a trip this short, and a match played over the relay in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_A, TEST_B, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { backend, otherPlayer, otherSide, settle, settleAll } from '../helpers/online-app.mjs';
import { NO_RELAY } from '../../server/tests/fakes.mjs';

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
async function roomOfTwo(vars) {
  const server = backend(vars);
  const relay = fakeRelayPeers();
  const host = otherPlayer(server, null, { name: 'Ana' });
  const guest = otherPlayer(server, null, { name: 'Sam' });
  for (const p of [host, guest]) p.session.peerFactory = (o) => matchLink({ ...o, makePeer: relay.makePeer });
  await host.session.createRoom({ name: "Ana's room", visibility: 'public', mode: 'quick-battle' });
  await guest.session.joinRoom({ code: host.session.room.code });
  await settleAll(16);
  return { server, relay, host, guest };
}

test('through the real room: each player gets the relay\'s servers from it, the signalling goes through it, the link opens', async () => {
  const { relay, host, guest } = await roomOfTwo();
  assert.equal(relay.made.length, 2, 'both players made a relay link');
  for (const m of relay.made) {
    assert.deepEqual(m.iceServers, [{ urls: ['turn:relay1.example.com:3478', 'turns:relay1.example.com:443'], username: 'alva-user', credential: 'alva-secret' }]);
  }
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
