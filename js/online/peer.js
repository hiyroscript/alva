// The two browsers of an online match, connected to each other through a
// TURN relay: a WebRTC DataChannel, which becomes the match's transport
// (js/online/transport.js). The room server only introduces them: the
// offer, the answer and the ICE candidates go through the room's WebSocket
// as 'signal' messages, and from then on nothing of the match touches the
// room server.
//
// Privacy (js/online/privacy.js): the link is relay-only
// (iceTransportPolicy 'relay', with the TURN credentials the room handed
// this player), so this browser never offers the other one a way to reach
// it but the relay, and neither ever learns the other's IP address. Every
// signalling message is scrubbed before it is sent, and what comes in is
// scrubbed too. With no relay to use the link is not made ('relay'): it
// never falls back to a direct connection.
//
// The room's host makes the offer; the guest answers. The channel is
// unordered with no retransmissions (a datagram, as UDP is): the lockstep
// resends what matters itself, and a late frame is worth less than a new
// one. A link that is not open within CONFIG.online.connectTimeoutMs fails
// ("Couldn't connect to your opponent").

import { CONFIG } from '../config.js';
import { MessageTransport } from './transport.js';
import { scrubSignal, relayOnly } from './privacy.js';

export const CHANNEL_LABEL = 'alva';
export const CHANNEL_OPTIONS = Object.freeze({ ordered: false, maxRetransmits: 0 });

// One attempt at a peer link. `initiator`: this side offers (the host).
// `sendSignal(data)`: hands a signalling message to the room for the other
// player; the room's replies come back through handleSignal(data).
// `iceServers`: this player's relay (TURN) servers, from the room. start()
// resolves with the transport once the channel is open, or rejects
// ('relay' with no relay to use, 'timeout', 'failed', 'unsupported',
// 'cancelled').
export class PeerLink {
  constructor({
    initiator, sendSignal, iceServers = [], timeoutMs = CONFIG.online.connectTimeoutMs,
    RTCPeerConnection = globalThis.RTCPeerConnection, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  }) {
    this.initiator = !!initiator;
    this.sendSignal = sendSignal;
    this.iceServers = relayOnly(iceServers);
    this.timeoutMs = timeoutMs;
    this.RTC = RTCPeerConnection;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pc = null;
    this.channel = null;
    this.transport = null;
    this.pendingIce = [];
    this.settled = false;
  }

  start() {
    this.promise ??= new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      if (typeof this.RTC !== 'function') {
        this.fail('unsupported');
        return;
      }
      // Never without a relay: no direct connection is ever tried.
      if (!this.iceServers.length) {
        this.fail('relay');
        return;
      }
      this.timer = this.setTimer(() => this.fail('timeout'), this.timeoutMs);
      try {
        this.pc = new this.RTC({ iceServers: this.iceServers.map((s) => ({ ...s, urls: [...s.urls] })), iceTransportPolicy: 'relay' });
      } catch {
        this.fail('unsupported');
        return;
      }
      // Only relay candidates go out, scrubbed (a browser gathering others
      // anyway would have them dropped here).
      this.pc.onicecandidate = (e) => this.send({ kind: 'ice', candidate: e.candidate ? toJSON(e.candidate) : null });
      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        if (state === 'failed' || state === 'closed') {
          if (this.transport) this.transport.ended();
          else this.fail('failed');
        }
      };
      if (this.initiator) {
        this.attach(this.pc.createDataChannel(CHANNEL_LABEL, { ...CHANNEL_OPTIONS }));
        this.offer();
      } else {
        this.pc.ondatachannel = (e) => this.attach(e.channel);
      }
    });
    return this.promise;
  }

  async offer() {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (!this.send({ kind: 'offer', sdp: toJSON(this.pc.localDescription) })) this.fail('failed');
    } catch {
      this.fail('failed');
    }
  }

  // A signalling message for the other player, scrubbed; false when
  // nothing of it may go.
  send(data) {
    const clean = scrubSignal(data);
    if (!clean) return false;
    this.sendSignal(clean);
    return true;
  }

  // A signalling message from the other player, through the room (scrubbed
  // again: only the other side's relay is ever taken as a way to it).
  async handleSignal(raw) {
    if (!this.pc || this.settled && !this.transport) return;
    const data = scrubSignal(raw);
    if (!data) return;
    try {
      if (data?.kind === 'offer' && !this.initiator) {
        await this.pc.setRemoteDescription(data.sdp);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        if (!this.send({ kind: 'answer', sdp: toJSON(this.pc.localDescription) })) throw new Error('answer');
        await this.flushIce();
      } else if (data?.kind === 'answer' && this.initiator) {
        await this.pc.setRemoteDescription(data.sdp);
        await this.flushIce();
      } else if (data?.kind === 'ice') {
        if (!data.candidate) return;
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(data.candidate);
        else this.pendingIce.push(data.candidate);
      }
    } catch {
      // A candidate that does not apply is skipped; a broken offer or
      // answer leaves the link to time out.
    }
  }

  async flushIce() {
    const queued = this.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        // Skipped.
      }
    }
  }

  attach(channel) {
    this.channel = channel;
    channel.onopen = () => {
      if (this.settled) return;
      this.settled = true;
      this.clearTimer(this.timer);
      this.transport = new MessageTransport({
        sendRaw: (text) => channel.send(text),
        closeRaw: () => this.teardown(),
      });
      this.resolve(this.transport);
    };
    channel.onmessage = (e) => this.transport?.deliver(typeof e.data === 'string' ? e.data : '');
    channel.onclose = () => {
      if (this.transport) this.transport.ended();
      else this.fail('failed');
    };
  }

  fail(reason) {
    if (this.settled) return;
    this.settled = true;
    this.clearTimer?.(this.timer);
    this.teardown();
    this.reject?.(new Error(reason));
  }

  cancel() {
    if (this.transport) this.transport.close();
    else this.fail('cancelled');
  }

  teardown() {
    try {
      this.channel?.close();
    } catch {
      // Closed already.
    }
    try {
      this.pc?.close();
    } catch {
      // Closed already.
    }
  }
}

// A description or candidate as plain JSON (it goes through the room).
function toJSON(value) {
  if (!value) return null;
  if (typeof value.toJSON === 'function') return value.toJSON();
  return { ...value };
}

// What OnlineSession uses to make a link by default (tests give their own).
export const webRtcPeer = (options) => new PeerLink(options);
