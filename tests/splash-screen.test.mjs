// Run with node --test tests/splash-screen.test.mjs (no dependencies).
// Lifecycle checks only; layout/paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SplashScreen } from '../js/screens/splash-screen.js';
import { CONFIG } from '../js/config.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
class Element {
  children = [];
  dataset = {};
  style = {};
  animations = [];
  replaceChildren(...children) { this.children = children; }
  animate(keyframes) {
    const done = deferred();
    const animation = { keyframes, finished: done.promise, finish: done.resolve, cancel: () => done.reject(new Error('cancelled')) };
    this.animations.push(animation);
    return animation;
  }
}
function image(decode = () => Promise.resolve()) {
  const img = new Element();
  img.decode = decode;
  return img;
}
function setup(loadImage, reduced = false) {
  const root = new Element();
  globalThis.document = { querySelector: () => root, createElement: () => new Element() };
  const calls = [];
  const app = { assets: { loadImage }, device: { reducedMotion: reduced }, screens: { go: (...args) => calls.push(args) } };
  const splash = new SplashScreen(app);
  return { splash, calls, root };
}
function fakeDelays(splash) {
  const delays = [];
  splash.delay = (run, ms) => new Promise(resolve => {
    run.cancelDelay = () => resolve(false);
    delays.push({ ms, finish: () => resolve(splash.active(run)) });
  });
  return delays;
}

test('both loads and both decodes gate the ordered sequence and single Home navigation', async () => {
  const first = deferred(), second = deferred(), decode = deferred();
  const hs = image(), alva = image(() => decode.promise);
  const { splash, calls } = setup(url => url === './hs.jpg' ? first.promise : second.promise);
  const delays = fakeDelays(splash);
  splash.enter();
  first.resolve(hs); await flush();
  assert.equal(splash.stage.children.length, 0);
  second.resolve(alva); await flush();
  assert.equal(splash.stage.children.length, 0);
  decode.resolve(); await flush();
  assert.deepEqual(splash.stage.children, [hs]);
  assert.equal(calls.length, 0);
  const credit = splash.credit;
  assert.equal(credit.textContent, 'a game by hiyroscript');
  assert.equal(credit.animations.length, 1);
  assert.deepEqual(credit.animations[0].keyframes, hs.animations[0].keyframes);
  assert.deepEqual(hs.animations[1].keyframes.map(k => k.transform),
    [`scale(${CONFIG.splash.zoomFrom})`, `scale(${CONFIG.splash.zoomTo})`]);
  hs.animations.forEach(a => a.finish()); await flush();
  assert.deepEqual(splash.stage.children, [hs]); // Still waiting on the credit fade.
  credit.animations.forEach(a => a.finish()); await flush();
  assert.equal(splash.stage.children.length, 0);
  assert.equal(delays[0].ms, CONFIG.splash.betweenImages);
  delays.shift().finish(); await flush();
  assert.deepEqual(splash.stage.children, [alva]);
  assert.equal(credit.animations.length, 1); // The credit only accompanies hs.jpg.
  alva.animations.forEach(a => a.finish()); await flush();
  assert.equal(splash.stage.children.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(delays[0].ms, CONFIG.splash.finalBlackHold);
  const run = splash.run;
  delays.shift().finish(); await flush();
  splash.finish(run);
  assert.deepEqual(calls, [['home', {}, { reset: true }]]);
});

test('exit while loading and reentry discard stale work; exit cancels animations', async () => {
  const old = deferred(); let current = false;
  const hs = image(), alva = image();
  const { splash, calls } = setup(url => current ? Promise.resolve(url === './hs.jpg' ? hs : alva) : old.promise);
  splash.enter(); splash.exit(); current = true; splash.enter();
  await flush();
  const run = splash.run;
  old.resolve(image()); await flush();
  assert.equal(splash.run, run);
  assert.deepEqual(splash.stage.children, [hs]);
  splash.exit(); await flush();
  assert.equal(splash.stage.children.length, 0);
  assert.equal(calls.length, 0);
});

test('reduced motion uses holds without animation; real pending timer is cleared on exit', async () => {
  const hs = image(), alva = image();
  const { splash, calls } = setup(url => Promise.resolve(url === './hs.jpg' ? hs : alva), true);
  const delays = fakeDelays(splash);
  splash.enter(); await flush();
  assert.equal(hs.style.opacity, '1');
  assert.equal(splash.credit.style.opacity, '1');
  assert.equal(hs.animations.length, 0);
  assert.equal(splash.credit.animations.length, 0);
  assert.equal(delays[0].ms, CONFIG.splash.reducedMotionHold);
  delays.shift().finish(); await flush();
  assert.equal(splash.stage.children.length, 0);
  assert.equal(splash.credit.style.opacity, '');
  delays.shift().finish(); await flush();
  assert.deepEqual(splash.stage.children, [alva]);
  assert.equal(splash.credit.style.opacity, '');
  assert.equal(alva.animations.length, 0);
  splash.exit(); await flush();
  assert.equal(calls.length, 0);
  const real = setup(() => Promise.resolve(image()), true);
  real.splash.enter(); await flush();
  const pending = real.splash.run;
  assert.equal(typeof pending.cancelDelay, 'function');
  real.splash.exit(); await flush();
  assert.equal(real.calls.length, 0);
});

test('null, rejected load, and rejected decode skip the whole intro cleanly', async () => {
  const original = console.error; const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    for (const load of [() => Promise.resolve(null), () => Promise.reject(new Error('load')), () => Promise.resolve(image(() => Promise.reject(new Error('decode'))))]) {
      const { splash, calls } = setup(load);
      splash.enter(); await flush();
      assert.equal(splash.stage.children.length, 0);
      assert.deepEqual(calls, [['home', {}, { reset: true }]]);
    }
    assert.equal(errors.length, 3);
  } finally { console.error = original; }
});
