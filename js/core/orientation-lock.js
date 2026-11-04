// The landscape lock: on a touch device Alva turns itself to landscape and
// keeps it that way for the whole visit, putting the lock back whenever it
// is lost. There is no setting to turn it off.
//
// The lock is the Screen Orientation API's screen.orientation.lock
// ('landscape'). Most browsers grant it only to a page in fullscreen or to
// an installed app (runningInstalled in js/core/web-app-install.js), and
// fullscreen may only be asked for from a real press. So, on a touch device
// only (`isTouch`, the Device's touch UI):
//
//   - an installed app locks at once, and again on every occasion below;
//   - in a browser tab, the first press asks for fullscreen
//     (requestFullscreen on the whole page, browser UI hidden;
//     webkitRequestFullscreen where that is all there is), then locks. A
//     press is a keydown, a mouse's pointerdown or a touch's or pen's
//     pointerup: the events a browser lets ask for fullscreen (a touch's
//     pointerdown does not), all Pointer Events, as every touch input in
//     Alva is (no Touch Events). Leaving fullscreen (the player's swipe, switching apps) arms
//     the next press to go back into fullscreen and lock again.
//
// The lock is asked for again after every fullscreenchange, every return to
// the page (visibilitychange back to visible, pageshow, the page lifecycle's
// resume) and every orientation change (screen.orientation's change, the
// window's orientationchange), so whatever drops it, the game puts it back.
//
// It never throws and never shows anything. Where there is no lock() at all
// (Safari on iPhone and iPad) nothing is asked for, fullscreen included
// (it would be no use without the lock), and a refused or failed lock()
// (outside fullscreen, a browser that will not lock) is caught quietly. In
// either case the rotate overlay (html.is-portrait-blocked, see
// js/core/device.js) is the fallback: it asks the player to turn the device
// by hand. A lock that holds keeps the window landscape, so the overlay
// never shows. On a desktop or any other non-touch device nothing is
// locked and fullscreen is never asked for.

import { runningInstalled } from './web-app-install.js';

const GESTURES = Object.freeze(['pointerdown', 'pointerup', 'keydown']);

export class OrientationLock {
  // `win` and `doc` are the browser's (stand-ins in tests); `isTouch()`
  // whether the touch UI is in use; `installed(win)` whether Alva runs as
  // an installed app.
  constructor({ win = globalThis.window, doc = globalThis.document, isTouch = () => false, installed = runningInstalled } = {}) {
    this.win = win;
    this.doc = doc;
    this.isTouch = isTouch;
    this.installed = installed;
    // Whether the last lock() asked for was granted (false until one is,
    // and again once one fails or the page leaves fullscreen).
    this.locked = false;
    // Whether the next press should (re)enter fullscreen and lock.
    this.armed = false;
    this.started = false;
    this.onGesture = this.onGesture.bind(this);
    this.relock = this.relock.bind(this);
    this.onFullscreenChange = this.onFullscreenChange.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
  }

  // The orientation object with a lock(), or null where there is none.
  get orientation() {
    const o = this.win?.screen?.orientation;
    return o && typeof o.lock === 'function' ? o : null;
  }

  // Whether the lock can be asked for here at all.
  get supported() {
    return !!this.orientation;
  }

  // Whether this page is in fullscreen now.
  get fullscreen() {
    const d = this.doc;
    return !!(d?.fullscreenElement || d?.webkitFullscreenElement);
  }

  // Listens for everything that may lock or unlock, and locks at once
  // where that needs no press (an installed app). Returns this.
  start() {
    if (this.started) return this;
    this.started = true;
    const win = this.win;
    const doc = this.doc;
    try {
      this.arm();
      doc?.addEventListener?.('fullscreenchange', this.onFullscreenChange);
      doc?.addEventListener?.('webkitfullscreenchange', this.onFullscreenChange);
      doc?.addEventListener?.('visibilitychange', this.onVisibility);
      doc?.addEventListener?.('resume', this.relock);
      win?.addEventListener?.('pageshow', this.relock);
      win?.addEventListener?.('orientationchange', this.relock);
      this.orientation?.addEventListener?.('change', this.relock);
      this.relock();
    } catch {
      // Never in the game's way.
    }
    return this;
  }

  // The next press (re)enters fullscreen and locks; a no-op while armed.
  arm() {
    if (this.armed || !this.supported) return;
    this.armed = true;
    for (const type of GESTURES) this.win?.addEventListener?.(type, this.onGesture, { passive: true });
  }

  disarm() {
    if (!this.armed) return;
    this.armed = false;
    for (const type of GESTURES) this.win?.removeEventListener?.(type, this.onGesture, { passive: true });
  }

  // A real press: on a touch device, into fullscreen (unless already there,
  // or an installed app, which needs none), then the lock. On a non-touch
  // device it does nothing and stays armed, in case touch comes into use. A
  // touch's or pen's pointerdown waits for its pointerup, the event the
  // browser lets ask for fullscreen.
  onGesture(event) {
    if (event?.type === 'pointerdown' && event.pointerType && event.pointerType !== 'mouse') return;
    if (!this.wanted()) return;
    this.disarm();
    if (this.fullscreen || this.installed(this.win)) {
      this.lock();
      return;
    }
    this.enterFullscreen().then(() => this.lock(), () => {
      // Refused: the next press tries again; the rotate overlay meanwhile.
      this.locked = false;
      this.arm();
    });
  }

  // Whether the lock is wanted here: a touch device with the lock API.
  wanted() {
    try {
      return this.supported && !!this.isTouch();
    } catch {
      return false;
    }
  }

  // Asks for the whole page in fullscreen, browser UI hidden. Resolves
  // once granted; rejects where it is refused or not offered.
  enterFullscreen() {
    try {
      const root = this.doc?.documentElement;
      if (typeof root?.requestFullscreen === 'function') {
        return Promise.resolve(root.requestFullscreen({ navigationUI: 'hide' }));
      }
      if (typeof root?.webkitRequestFullscreen === 'function') {
        root.webkitRequestFullscreen();
        return Promise.resolve();
      }
    } catch (err) {
      return Promise.reject(err);
    }
    return Promise.reject(new Error('no fullscreen'));
  }

  // Asks for the landscape lock; a refusal is caught and only remembered
  // (`locked`), the rotate overlay standing in. Resolves to whether it was
  // granted.
  lock() {
    const o = this.wanted() ? this.orientation : null;
    if (!o) return Promise.resolve(false);
    let asked;
    try {
      asked = Promise.resolve(o.lock('landscape'));
    } catch (err) {
      asked = Promise.reject(err);
    }
    return asked.then(
      () => (this.locked = true),
      () => (this.locked = false),
    );
  }

  // Puts the lock back where it can be had without a press (fullscreen or
  // an installed app); elsewhere, the next press will.
  relock() {
    if (!this.wanted()) return;
    if (this.fullscreen || this.installed(this.win)) this.lock();
    else {
      this.locked = false;
      this.arm();
    }
  }

  onFullscreenChange() {
    this.relock();
  }

  onVisibility() {
    if (this.doc?.visibilityState === 'hidden') return;
    this.relock();
  }
}
