// The peer link keeps the player's address to themselves
// (js/online/peer.js, js/online/privacy.js): it connects relay-only, with
// TURN servers alone, never without them; it sends only scrubbed relay
// candidates and descriptions, and takes only the other side's relay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerLink } from '../../js/online/peer.js';

const PUBLIC_IP = '203.0.113.50';
const LOCAL_IP = '192.168.1.20';
const RELAY_IP = '198.51.100.7';
const SRFLX = `candidate:3 1 udp 1686052607 ${PUBLIC_IP} 61212 typ srflx raddr ${LOCAL_IP} rport 50123 generation 0`;
const HOST = `candidate:1 1 udp 2122260223 ${LOCAL_IP} 50123 typ host generation 0`;
const RELAY = `candidate:6 1 udp 41885439 ${RELAY_IP} 30000 typ relay raddr ${PUBLIC_IP} rport 61212 generation 0`;
const OFFER_SDP = `v=0\r\no=- 1 2 IN IP4 ${PUBLIC_IP}\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 ${PUBLIC_IP}\r\na=${SRFLX}\r\na=${RELAY}\r\na=mid:0\r\n`;
const TURN = [
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'stun:x'], username: 'u', credential: 'c' },
];

// A stand-in for the browser's RTCPeerConnection: what it was made with,
// and what was added to it.
function fakeRtc() {
  const made = [];
  class FakePeerConnection {
    constructor(config) {
      this.config = config;
      this.added = [];
      this.remoteDescription = null;
      made.push(this);
    }
    createDataChannel() {
      return { send() {}, close() {} };
    }
    async createOffer() {
      return { type: 'offer', sdp: OFFER_SDP };
    }
    async createAnswer() {
      return { type: 'answer', sdp: OFFER_SDP.replace('o=- 1', 'o=- 2') };
    }
    async setLocalDescription(d) {
      this.localDescription = d;
    }
    async setRemoteDescription(d) {
      this.remoteDescription = d;
    }
    async addIceCandidate(c) {
      this.added.push(c);
    }
    close() {}
  }
  return { made, FakePeerConnection };
}

const settle = () => new Promise((r) => setImmediate(r));

test('relay-only, with the TURN servers alone: never STUN, never a direct link', async () => {
  const { made, FakePeerConnection } = fakeRtc();
  const sent = [];
  const link = new PeerLink({ initiator: true, sendSignal: (d) => sent.push(d), iceServers: TURN, RTCPeerConnection: FakePeerConnection, setTimer: () => 0, clearTimer() {} });
  link.start();
  await settle();
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].config, { iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' }], iceTransportPolicy: 'relay' });
  // Without a TURN server, no connection at all.
  for (const iceServers of [[], undefined, [{ urls: ['stun:stun.cloudflare.com:3478'] }], [{ urls: ['turn:t.example:3478'] }]]) {
    const before = made.length;
    const bare = new PeerLink({ initiator: true, sendSignal() {}, iceServers, RTCPeerConnection: FakePeerConnection, setTimer: () => 0, clearTimer() {} });
    await assert.rejects(bare.start(), /relay/, JSON.stringify(iceServers));
    assert.equal(made.length, before, 'no RTCPeerConnection made');
  }
});

test('what this browser sends: its offer scrubbed, only relay candidates, with no address of its own', async () => {
  const { made, FakePeerConnection } = fakeRtc();
  const sent = [];
  const link = new PeerLink({ initiator: true, sendSignal: (d) => sent.push(d), iceServers: TURN, RTCPeerConnection: FakePeerConnection, setTimer: () => 0, clearTimer() {} });
  link.start();
  await settle();
  const pc = made[0];
  pc.onicecandidate({ candidate: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0, toJSON() { return { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 }; } } });
  pc.onicecandidate({ candidate: { candidate: SRFLX, sdpMid: '0', sdpMLineIndex: 0 } });
  pc.onicecandidate({ candidate: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 } });
  pc.onicecandidate({ candidate: null });
  assert.equal(sent.length, 3, 'the offer, the relay candidate, and the end of candidates');
  assert.equal(sent[0].kind, 'offer');
  assert.equal(sent[1].candidate.candidate, `candidate:6 1 udp 41885439 ${RELAY_IP} 30000 typ relay raddr 0.0.0.0 rport 0 generation 0`);
  assert.deepEqual(sent[2], { kind: 'ice', candidate: null });
  const text = JSON.stringify(sent);
  assert.ok(!text.includes(PUBLIC_IP) && !text.includes(LOCAL_IP), 'no address of this player\'s anywhere');
  assert.ok(text.includes(RELAY_IP));
});

test('what this browser takes: the other side\'s relay only', async () => {
  const { made, FakePeerConnection } = fakeRtc();
  const sent = [];
  const link = new PeerLink({ initiator: false, sendSignal: (d) => sent.push(d), iceServers: TURN, RTCPeerConnection: FakePeerConnection, setTimer: () => 0, clearTimer() {} });
  link.start();
  await link.handleSignal({ kind: 'offer', sdp: { type: 'offer', sdp: OFFER_SDP } });
  const pc = made[0];
  assert.ok(!pc.remoteDescription.sdp.includes(PUBLIC_IP), 'the offer taken scrubbed');
  assert.ok(!pc.remoteDescription.sdp.includes('typ srflx'));
  assert.equal(sent[0].kind, 'answer');
  assert.ok(!JSON.stringify(sent).includes(PUBLIC_IP), 'the answer sent scrubbed');
  await link.handleSignal({ kind: 'ice', candidate: { candidate: SRFLX, sdpMid: '0', sdpMLineIndex: 0 } });
  await link.handleSignal({ kind: 'ice', candidate: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 } });
  await link.handleSignal({ kind: 'ice', candidate: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 } });
  await link.handleSignal({ kind: 'chat', text: 'hi' });
  assert.deepEqual(pc.added.map((c) => c.candidate.split(' ')[7]), ['relay'], 'only the relay candidate added');
});
