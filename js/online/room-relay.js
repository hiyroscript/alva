// The link between the two browsers of an online match: through their room
// on the room server, never directly. Each match packet (the lockstep's
// input frames, acknowledgements and hashes, js/online/lockstep.js) goes
// over this player's room WebSocket as { type: 'm', d } and the room passes
// it to the other player (server/src/room.js), so the two browsers never
// connect to each other and neither ever learns the other's network
// address (a direct WebRTC link would hand each the other's IP address
// while it was set up). Nothing else changes for the match: it sees the
// usual transport (js/online/transport.js).
//
// What it costs: the room server's free plan counts every packet it
// receives, so the match sends at most every CONFIG.online.sendIntervalMs
// (30 a second), and each match's input delay is long enough for a packet
// to reach the other player through the server before its step is due
// (js/online/delay.js measures the trip and chooses it). Their settings
// are in js/config.js; the numbers behind them in
// docs/development/online-server.md ("Staying on the free plan").

import { listeners } from './transport.js';

// A transport whose messages go through `send(d)` (to the room, for the
// other player) and come in through receive(d) (the room's { type: 'm' }).
// Like any transport it may lose a message (the room's socket reconnecting,
// the room dropping a packet over its allowance): the lockstep resends.
export class RelayTransport {
  constructor(send) {
    this.sendToRoom = send;
    this.open = true;
    this.messages = listeners();
    this.closes = listeners();
  }

  send(message) {
    if (!this.open) return false;
    try {
      return this.sendToRoom(message) !== false;
    } catch {
      return false;
    }
  }

  onMessage(fn) {
    return this.messages.on(fn);
  }

  onClose(fn) {
    return this.closes.on(fn);
  }

  receive(message) {
    if (this.open && message && typeof message === 'object') this.messages.emit(message);
  }

  close() {
    this.ended();
  }

  ended() {
    if (!this.open) return;
    this.open = false;
    this.closes.emit();
    this.messages.clear();
    this.closes.clear();
  }
}

// The link OnlineSession makes for a room (tests give their own): open at
// once, as the room is already there. `send(d)` hands a packet to the
// room; deliver(d) is the other player's, from the room.
export function roomRelay({ send }) {
  const transport = new RelayTransport(send);
  return {
    start: () => Promise.resolve(transport),
    deliver: (d) => transport.receive(d),
    cancel: () => transport.close(),
  };
}
