// Whether this device is online, for Online Play (App.connectivity): Home's
// Online play button opens only while it is, and going offline anywhere in
// Online Play ends it ("Connection lost", back to Home).
//
// It follows the browser's own idea (navigator.onLine) and its `online` /
// `offline` events, live. That idea is optimistic (a connection that is up
// but reaches nothing still counts as online), so "online" here only means
// "worth trying": the room server's own answer decides whether Online Play
// is really available. A browser with no idea at all counts as online.
// Tests give their own window and navigator.

export class Connectivity {
  constructor(win = globalThis.window, nav = globalThis.navigator) {
    this.nav = nav;
    this.listeners = new Set();
    this.online = this.read();
    const update = () => {
      const next = this.read();
      if (next === this.online) return;
      this.online = next;
      for (const fn of [...this.listeners]) fn(next);
    };
    win?.addEventListener?.('online', update);
    win?.addEventListener?.('offline', update);
  }

  read() {
    return this.nav?.onLine !== false;
  }

  // fn(online) after every change; returns the removal.
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
