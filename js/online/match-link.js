// The link between the two browsers of an online match: through a TURN
// relay, never directly (docs/gameplay/online-play.md, "Transport"). The
// room hands each player the relay's servers ({ type: 'relay' }), and the
// two browsers connect through it with a relay-only WebRTC DataChannel
// (js/online/peer.js), so neither ever learns the other's address and the
// match has about the delay of a direct link. The WebRTC signalling goes
// through the room, scrubbed on both ends (js/online/privacy.js).
//
// There is no other way: with no relay's servers to be had, or the link
// not open within CONFIG.online.connectTimeoutMs, start() rejects and the
// player is told "Couldn't connect to your opponent" (and may try again).

import { webRtcPeer } from './peer.js';

// The link OnlineSession makes for a room (tests give their own).
// `sendSignal(data)`: WebRTC signalling to the room for the other player;
// `requestRelay()`: resolves with the relay's servers, or rejects when
// there are none. handleSignal(data) is the room's, for this link. start()
// resolves with the transport once the link is open.
export function matchLink({ initiator, sendSignal, requestRelay, timeoutMs, makePeer = webRtcPeer }) {
  let peer = null;
  let stopped = false;
  // The other side's signalling that came before this side's link existed
  // (its relay's servers still being asked for).
  const early = [];

  return {
    async start() {
      const iceServers = await requestRelay();
      if (stopped) throw new Error('cancelled');
      peer = makePeer({ initiator, sendSignal, iceServers, timeoutMs });
      const opened = peer.start();
      for (const data of early.splice(0)) peer.handleSignal?.(data);
      return opened;
    },
    handleSignal(data) {
      if (peer) peer.handleSignal?.(data);
      else if (!stopped && early.length < 64) early.push(data);
    },
    cancel() {
      stopped = true;
      early.length = 0;
      peer?.cancel?.();
    },
  };
}
