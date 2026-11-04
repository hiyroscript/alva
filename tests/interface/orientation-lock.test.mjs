// Run with node --test tests/interface/orientation-lock.test.mjs (no dependencies).
// The landscape lock (js/core/orientation-lock.js): on a touch device the
// first press goes fullscreen and locks to landscape, an installed app
// locks at once, the lock is asked for again after fullscreenchange,
// visibilitychange, pageshow and an orientation change, leaving fullscreen
// arms the next press, nothing happens on a desktop, and a refused lock(),
// a refused fullscreen or no API at all never throws and leaves the rotate
// overlay (html.is-portrait-blocked, js/core/device.js) as the fallback.
// On a fake window, document, fullscreen and Screen Orientation API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OrientationLock } from '../../js/core/orientation-lock.js';

class Target {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type, event = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, ...event });
  }
  count(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

// A browser: `lock` false for no Screen Orientation lock() (iOS Safari),
// `lockRejects` for a lock() that refuses, `fullscreen` false for no
// requestFullscreen, `fullscreenRejects` for one that refuses, `installed`
// for an installed app's display mode.
function browser({ lock = true, lockRejects = false, fullscreen = true, fullscreenRejects = false, installed = false } = {}) {
  const win = new Target();
  const doc = new Target();
  const orientation = new Target();
  const calls = { lock: [], fullscreen: [] };
  doc.visibilityState = 'visible';
  doc.fullscreenElement = null;
  doc.documentElement = {};
  if (fullscreen) {
    doc.documentElement.requestFullscreen = (options) => {
      calls.fullscreen.push(options);
      if (fullscreenRejects) return Promise.reject(new Error('denied'));
      doc.fullscreenElement = doc.documentElement;
      doc.dispatch('fullscreenchange');
      return Promise.resolve();
    };
  }
  if (lock) {
    orientation.lock = (type) => {
      calls.lock.push(type);
      return lockRejects ? Promise.reject(new DOMException('not allowed', 'NotSupportedError')) : Promise.resolve();
    };
  }
  orientation.type = 'portrait-primary';
  win.screen = { orientation };
  win.matchMedia = (q) => ({ matches: installed && q === '(display-mode: standalone)' });
  return { win, doc, orientation, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function started(b, { touch = true } = {}) {
  const state = { touch };
  const lock = new OrientationLock({ win: b.win, doc: b.doc, isTouch: () => state.touch }).start();
  return { lock, state };
}

test('on a touch device the first press goes fullscreen, browser UI hidden, then locks to landscape', async () => {
  const b = browser();
  const { lock } = started(b);
  await settle();
  assert.deepEqual(b.calls.fullscreen, [], 'nothing before a press: a browser tab needs one');
  assert.deepEqual(b.calls.lock, []);
  assert.equal(lock.locked, false);
  b.win.dispatch('pointerup', { pointerType: 'touch' });
  await settle();
  assert.deepEqual(b.calls.fullscreen, [{ navigationUI: 'hide' }]);
  assert.ok(b.calls.lock.length >= 1);
  assert.ok(b.calls.lock.every((t) => t === 'landscape'));
  assert.equal(lock.locked, true);
  // Once: later presses ask for nothing more.
  const asked = b.calls.lock.length;
  b.win.dispatch('pointerup', { pointerType: 'touch' });
  b.win.dispatch('keydown');
  await settle();
  assert.equal(b.calls.fullscreen.length, 1);
  assert.equal(b.calls.lock.length, asked);
  assert.equal(b.win.count('pointerdown') + b.win.count('pointerup') + b.win.count('keydown'), 0, 'its press listeners are gone');
});

test('a touch\'s pointerup, a mouse\'s pointerdown or a keydown counts as the first press; a touch\'s pointerdown waits for its pointerup', async () => {
  const b = browser();
  started(b);
  b.win.dispatch('pointerdown', { pointerType: 'touch' });
  await settle();
  assert.deepEqual(b.calls.fullscreen, [], 'a touch\'s pointerdown cannot ask for fullscreen');
  b.win.dispatch('pointerup', { pointerType: 'touch' });
  await settle();
  assert.equal(b.calls.fullscreen.length, 1, 'its pointerup does');
  for (const type of ['pointerdown', 'keydown']) {
    const b = browser();
    const { lock } = started(b);
    b.win.dispatch(type);
    await settle();
    assert.equal(b.calls.fullscreen.length, 1, type);
    assert.equal(lock.locked, true, type);
  }
});

test('the webkit-prefixed fullscreen is used where it is the only one', async () => {
  const b = browser({ fullscreen: false });
  let asked = 0;
  b.doc.documentElement.webkitRequestFullscreen = () => {
    asked += 1;
    b.doc.webkitFullscreenElement = b.doc.documentElement;
    b.doc.dispatch('webkitfullscreenchange');
  };
  const { lock } = started(b);
  b.win.dispatch('pointerdown');
  await settle();
  assert.equal(asked, 1);
  assert.equal(lock.locked, true);
});

test('an installed app locks at once, with no fullscreen and no press', async () => {
  const b = browser({ installed: true });
  const { lock } = started(b);
  await settle();
  assert.deepEqual(b.calls.lock, ['landscape']);
  assert.deepEqual(b.calls.fullscreen, []);
  assert.equal(lock.locked, true);
});

test('a desktop (no touch UI) is never locked and never goes fullscreen', async () => {
  const b = browser();
  const { lock } = started(b, { touch: false });
  for (const type of ['pointerdown', 'pointerup', 'keydown']) b.win.dispatch(type);
  b.doc.dispatch('visibilitychange');
  b.doc.dispatch('fullscreenchange');
  b.orientation.dispatch('change');
  await settle();
  assert.deepEqual(b.calls.fullscreen, []);
  assert.deepEqual(b.calls.lock, []);
  assert.equal(lock.locked, false);
  // An installed app on a desktop too.
  const app = browser({ installed: true });
  started(app, { touch: false });
  await settle();
  assert.deepEqual(app.calls.lock, []);
});

test('a device that turns out to be touch locks from its next press', async () => {
  const b = browser();
  const { lock, state } = started(b, { touch: false });
  b.win.dispatch('pointerdown', { pointerType: 'mouse' });
  await settle();
  assert.deepEqual(b.calls.lock, [], 'a mouse press on a desktop: nothing');
  state.touch = true;
  b.win.dispatch('pointerup', { pointerType: 'touch' });
  await settle();
  assert.equal(b.calls.fullscreen.length, 1);
  assert.equal(lock.locked, true);
});

test('the lock is asked for again after visibilitychange, fullscreenchange, pageshow, resume and an orientation change', async () => {
  const b = browser();
  started(b);
  b.win.dispatch('pointerdown');
  await settle();
  const again = (fire) => {
    const before = b.calls.lock.length;
    fire();
    return b.calls.lock.length - before;
  };
  assert.equal(again(() => b.doc.dispatch('visibilitychange')), 1, 'back to visible');
  b.doc.visibilityState = 'hidden';
  assert.equal(again(() => b.doc.dispatch('visibilitychange')), 0, 'not while hidden');
  b.doc.visibilityState = 'visible';
  assert.equal(again(() => b.doc.dispatch('fullscreenchange')), 1);
  assert.equal(again(() => b.win.dispatch('pageshow')), 1);
  assert.equal(again(() => b.doc.dispatch('resume')), 1);
  assert.equal(again(() => b.orientation.dispatch('change')), 1);
  assert.equal(again(() => b.win.dispatch('orientationchange')), 1);
});

test('leaving fullscreen (switching apps) arms the next press to go back into fullscreen and lock', async () => {
  const b = browser();
  const { lock } = started(b);
  b.win.dispatch('pointerdown');
  await settle();
  assert.equal(lock.locked, true);
  // The browser drops fullscreen, and the lock with it, as the page hides.
  b.doc.fullscreenElement = null;
  b.doc.dispatch('fullscreenchange');
  b.doc.visibilityState = 'hidden';
  b.doc.dispatch('visibilitychange');
  b.doc.visibilityState = 'visible';
  b.doc.dispatch('visibilitychange');
  await settle();
  assert.equal(lock.locked, false, 'no lock outside fullscreen: the rotate overlay may show meanwhile');
  b.win.dispatch('pointerup', { pointerType: 'touch' });
  await settle();
  assert.equal(b.calls.fullscreen.length, 2, 'back into fullscreen on the next press');
  assert.equal(lock.locked, true, 'and locked again');
});

test('a refused lock() never throws and leaves the rotate overlay as the fallback', async () => {
  const b = browser({ lockRejects: true });
  const { lock } = started(b);
  b.win.dispatch('pointerdown');
  await settle();
  b.doc.dispatch('visibilitychange');
  b.orientation.dispatch('change');
  await settle();
  assert.ok(b.calls.lock.length >= 1, 'asked for');
  assert.equal(lock.locked, false);
});

test('a lock() that throws at once is caught too', async () => {
  const b = browser();
  b.orientation.lock = () => { throw new Error('boom'); };
  const { lock } = started(b);
  b.win.dispatch('pointerdown');
  await settle();
  assert.equal(lock.locked, false);
});

test('a refused fullscreen never throws, and the next press tries again', async () => {
  const b = browser({ fullscreenRejects: true });
  const { lock } = started(b);
  b.win.dispatch('pointerdown');
  await settle();
  assert.equal(b.calls.fullscreen.length, 1);
  assert.equal(lock.locked, false);
  b.win.dispatch('pointerdown');
  await settle();
  assert.equal(b.calls.fullscreen.length, 2);
});

test('with no lock() at all (iOS Safari) nothing is asked for, fullscreen included, and nothing throws', async () => {
  const b = browser({ lock: false });
  const { lock } = started(b);
  for (const type of ['pointerdown', 'pointerup', 'keydown']) b.win.dispatch(type);
  b.doc.dispatch('visibilitychange');
  await settle();
  assert.deepEqual(b.calls.fullscreen, []);
  assert.equal(lock.supported, false);
  assert.equal(lock.locked, false);
  // No screen at all, no document listeners: still fine.
  assert.doesNotThrow(() => new OrientationLock({ win: {}, doc: {}, isTouch: () => true }).start());
  assert.doesNotThrow(() => new OrientationLock({ win: undefined, doc: undefined, isTouch: () => true }).start().relock());
});

test('the rotate overlay stays the fallback, the manifest asks for landscape and the page has no conflicting meta tag', () => {
  const device = readFileSync(new URL('../../js/core/device.js', import.meta.url), 'utf8');
  assert.match(device, /is-portrait-blocked/, 'the Device still shows the rotate overlay on a touch device held upright');
  const manifest = JSON.parse(readFileSync(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.orientation, 'landscape');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="rotate-overlay"/);
  assert.doesNotMatch(html, /<meta[^>]+(screen-orientation|x5-orientation|orientation)[^>]*portrait/i);
  const app = readFileSync(new URL('../../js/core/app.js', import.meta.url), 'utf8');
  assert.match(app, /new OrientationLock\(/, 'the App starts the lock');
});

test('with the real Device: a refused lock leaves the rotate overlay up; a lock that turns the window hides it', async () => {
  const { Device } = await import('../../js/core/device.js');
  for (const refuse of [true, false]) {
    const b = browser({ lockRejects: refuse });
    const classes = new Set();
    const doc = Object.assign(b.doc, {
      documentElement: Object.assign(b.doc.documentElement, {
        classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
      }),
    });
    const win = Object.assign(b.win, {
      innerWidth: 390, innerHeight: 844,
      matchMedia: (q) => ({ matches: q === '(pointer: coarse)' || q === '(any-pointer: coarse)' || q === '(hover: none)', addEventListener() {} }),
    });
    // The real lock turns the window: landscape from then on.
    const realLock = b.orientation.lock;
    b.orientation.lock = (type) => realLock(type).then(() => {
      Object.assign(win, { innerWidth: 844, innerHeight: 390 });
      win.dispatch('resize');
    });
    const saved = { window: globalThis.window, document: globalThis.document };
    globalThis.window = win;
    globalThis.document = doc;
    try {
      const device = new Device().init();
      assert.equal(classes.has('is-portrait-blocked'), true, 'a phone held upright: the overlay, before any press');
      const lock = new OrientationLock({ win, doc, isTouch: () => device.touchUI }).start();
      win.dispatch('pointerdown', { pointerType: 'touch' });
      win.dispatch('pointerup', { pointerType: 'touch' });
      await settle();
      await settle();
      assert.equal(lock.locked, !refuse);
      assert.equal(classes.has('is-portrait-blocked'), refuse, refuse ? 'refused: the overlay stays, the fallback' : 'locked: never the overlay');
    } finally {
      globalThis.window = saved.window;
      globalThis.document = saved.document;
    }
  }
});
