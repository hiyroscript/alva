// The link between the two browsers of an online match, as everything above
// it sees it: four calls and nothing else, so the lockstep (js/online/
// lockstep.js) never knows whether it runs over the relay's WebRTC
// DataChannel (js/online/peer.js), an in-memory pair in a test, or, one day,
// rollback netcode's own transport.
//
//   transport.send(message)    a plain object that survives JSON; may be
//                              lost or arrive out of order, never altered
//   transport.onMessage(fn)    fn(message) for each one that arrives
//   transport.close()          ends the link (both sides hear onClose)
//   transport.onClose(fn)      fn() once, when the link has ended
//   transport.open             whether messages can still be sent
//
// Nothing here is reliable on purpose: the match's input frames carry their
// own resends (LockstepSession), and a late frame is worth less than a new
// one.

// A minimal event list: on(fn) adds a listener and returns its removal;
// emit(...args) calls each in order.
export function listeners() {
  const fns = new Set();
  return {
    on(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    emit(...args) {
      for (const fn of [...fns]) fn(...args);
    },
    clear() {
      fns.clear();
    },
  };
}

// A transport around `sendRaw(text)`: messages go out as JSON and come in
// through deliver(text). close() calls `closeRaw` once. The WebRTC peer and
// the in-memory pair are both made of it.
export class MessageTransport {
  constructor({ sendRaw, closeRaw = () => {} }) {
    this.sendRaw = sendRaw;
    this.closeRaw = closeRaw;
    this.open = true;
    this.messages = listeners();
    this.closes = listeners();
  }

  send(message) {
    if (!this.open) return false;
    try {
      this.sendRaw(JSON.stringify(message));
      return true;
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

  // A message arrived as text: read it, or drop it if it is not JSON.
  deliver(text) {
    if (!this.open) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message && typeof message === 'object') this.messages.emit(message);
  }

  // The link ended from either side: once.
  ended() {
    if (!this.open) return;
    this.open = false;
    this.closes.emit();
    this.messages.clear();
    this.closes.clear();
  }

  close() {
    if (!this.open) return;
    try {
      this.closeRaw();
    } finally {
      this.ended();
    }
  }
}

// Two transports joined in memory, for tests: what one sends waits in the
// other's inbox until deliver() (all of it, in order) or deliverOne().
// `drop(message, from)` decides a message is lost ('a' or 'b' sent it);
// `hold` keeps everything in the inboxes, as a stalled network would.
export function memoryTransportPair({ drop = () => false } = {}) {
  const inbox = { a: [], b: [] };
  const pair = { hold: false, sent: { a: 0, b: 0 }, dropped: { a: 0, b: 0 } };
  const make = (self, other) => new MessageTransport({
    sendRaw(text) {
      pair.sent[self] += 1;
      if (drop(JSON.parse(text), self)) {
        pair.dropped[self] += 1;
        return;
      }
      inbox[other].push(text);
    },
    closeRaw() {
      queueMicrotask(() => pair[other].ended());
    },
  });
  pair.a = make('a', 'b');
  pair.b = make('b', 'a');
  pair.inbox = inbox;
  // Hands every waiting message to its receiver, in the order sent, until
  // nothing waits (a reply sent while delivering arrives too).
  pair.deliver = (limit = 10000) => {
    let n = 0;
    while (!pair.hold && (inbox.a.length || inbox.b.length) && n < limit) {
      for (const side of ['a', 'b']) {
        const queue = inbox[side].splice(0);
        for (const text of queue) {
          pair[side].deliver(text);
          n += 1;
        }
      }
    }
    return n;
  };
  return pair;
}
