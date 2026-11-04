// Run with node --test tests/interface/screen-guard.test.mjs (no dependencies).
// The small-screen block (js/core/screen-guard.js): the size check from
// the usable viewport (visualViewport, the browser tab's minimum against
// the installed app's, common phones, tablets and desktops in both modes,
// the portrait line), the overlay shown and removed as the screen is
// resized or turned, its focus, its Download Alva button through the
// existing installation (the browser's prompt accepted, declined and
// refused, the iOS and other how-tos, already installed, nothing to install
// with), a controller's Cross / A, the strings in every language, the game
// taking no input while it shows, and its stylesheet. On a minimal fake DOM
// and a fake browser window; the real look needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stylesheet } from '../helpers/stylesheet.mjs';

// ---- Fake DOM ------------------------------------------------------------------

const noop = () => {};

class Node {
  parentNode = null;
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === document.body;
  }
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
const BOOLEAN_ATTRS = ['hidden', 'disabled'];
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = {};
  dataset = {};
  hidden = false;
  disabled = false;
  html = '';
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    const names = new Set();
    this.classNames = names;
    this.classList = {
      add: (...n) => n.forEach((c) => names.add(c)),
      remove: (...n) => n.forEach((c) => names.delete(c)),
      contains: (c) => names.has(c),
      toggle: (c, on = !names.has(c)) => { on ? names.add(c) : names.delete(c); return on; },
    };
  }
  set className(v) { this.classNames.clear(); v.split(/\s+/).filter(Boolean).forEach((c) => this.classNames.add(c)); }
  get className() { return [...this.classNames].join(' '); }
  setAttribute(name, value) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = true;
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) return this[name] ? '' : null;
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = false;
    else this.attrs.delete(name);
  }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  get innerHTML() { return this.html; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, preventDefault: noop, ...event }); }
  click() {
    if (this.disabled) return;
    this.dispatch('click');
  }
  focus() {
    if (this.disabled || this.closest('[hidden]')) return;
    const before = document.activeElement;
    document.activeElement = this;
    if (before !== this) document.fire('focusin', { target: this });
  }
  matches(selector) {
    return selector.split(',').map((s) => s.trim()).some((s) => {
      if (s.startsWith('.')) return this.classNames.has(s.slice(1));
      const attr = s.match(/^\[([\w-]+)\]$/);
      if (attr) return this.hasAttribute(attr[1]);
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches?.(selector)) return n;
    return null;
  }
  contains(el) {
    for (let n = el; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (n) => n.children.forEach((c) => {
      if (!(c instanceof Element)) return;
      if (c.matches(selector)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const docListeners = new Map();
globalThis.Node = Node;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: () => null,
  addEventListener(type, fn) {
    if (!docListeners.has(type)) docListeners.set(type, []);
    docListeners.get(type).push(fn);
  },
  removeEventListener: noop,
  fire(type, event = {}) { for (const fn of docListeners.get(type) ?? []) fn(event); },
};

const { CONFIG } = await import('../../js/config.js');
const { ScreenGuard, screenVerdict, screenLimits, viewportSize } = await import('../../js/core/screen-guard.js');
const { WebAppInstall, INSTALL_INSTRUCTIONS } = await import('../../js/core/web-app-install.js');
const { InputManager } = await import('../../js/core/input-manager.js');
const { setLanguage, t, STRINGS, LANGUAGES } = await import('../../js/localization/i18n.js');

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

// A browser window of `width` x `height` CSS px (its visualViewport the
// same unless `visual` says otherwise), standalone or in a tab.
function fakeWindow({ width = 932, height = 430, standalone = false, visual = true, userAgent = UA.iphone } = {}) {
  const listeners = new Map();
  const vvListeners = [];
  const frames = [];
  const win = {
    innerWidth: width,
    innerHeight: height,
    pads: [],
    navigator: { userAgent, maxTouchPoints: 5, getGamepads: () => win.pads },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: noop,
    matchMedia(query) {
      const mode = query.match(/display-mode: ([\w-]+)/)?.[1];
      return { get matches() { return mode === 'standalone' && win.standalone; }, addEventListener: noop };
    },
    standalone,
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame: noop,
    // Runs the frames waiting.
    frame() { for (const fn of frames.splice(0)) fn(0); },
    fire(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
      if (type === 'resize') for (const fn of vvListeners) fn(event);
    },
    // The window resized (and its visible area with it).
    resize(w, h) {
      win.innerWidth = w;
      win.innerHeight = h;
      if (win.visualViewport) Object.assign(win.visualViewport, { width: w, height: h });
      win.fire('resize');
    },
  };
  if (visual) {
    win.visualViewport = {
      width, height, scale: 1,
      addEventListener(type, fn) { if (type === 'resize') vvListeners.push(fn); },
    };
  }
  return win;
}

// A guard on `win` with a real WebAppInstall, started.
function guarded(options = {}) {
  const win = fakeWindow(options);
  // One page, one guard: the last test's is gone with its listeners.
  body.replaceChildren();
  docListeners.clear();
  document.activeElement = body;
  const install = options.noInstall ? null : new WebAppInstall(win);
  const guard = new ScreenGuard({ win, doc: document, install }).start();
  return { win, guard, install };
}

// A beforeinstallprompt event answered with `outcome` ('reject': refused).
function installOffer(outcome = 'accepted') {
  return {
    preventDefault: noop,
    userChoice: Promise.resolve({ outcome }),
    prompt() {
      if (outcome === 'reject') return Promise.reject(new Error('NotAllowedError'));
      return Promise.resolve({ outcome });
    },
  };
}

// ---- The size check -------------------------------------------------------------

// Landscape viewports (CSS px) of common devices: a phone's browser tab
// (Safari or Chrome, with its address bar and toolbars), the same phone
// running Alva as an installed app, tablets and desktop windows in a tab.
const PHONES = [
  // name, browser tab, installed app
  ['iPhone SE', [667, 326], [667, 375]],
  ['iPhone 13 mini', [812, 326], [812, 375]],
  ['iPhone 15', [852, 342], [852, 393]],
  ['iPhone 15 Pro Max', [932, 382], [932, 430]],
  ['iPhone 16 Pro Max', [956, 392], [956, 440]],
  ['Pixel 7', [915, 332], [915, 388]],
  ['Pixel 8 Pro', [998, 368], [998, 424]],
  ['Galaxy S24 Ultra', [932, 330], [932, 388]],
];
const BIG = [
  ['iPad mini', [1133, 694]], ['iPad mini upright', [744, 1070]], ['iPad Pro 13', [1376, 954]],
  ['Galaxy Tab S9', [1280, 730]], ['laptop', [1280, 631]], ['laptop 1366', [1366, 657]], ['desktop', [1920, 969]],
];

test('the minimum screen is configuration: a taller one in a browser tab than as an installed app, the same width', () => {
  assert.deepEqual(CONFIG.screen, { browser: { minWidth: 640, minHeight: 400 }, installed: { minWidth: 640, minHeight: 360 } });
  assert.equal(screenLimits(false), CONFIG.screen.browser);
  assert.equal(screenLimits(true), CONFIG.screen.installed);
  // The limits read are the ones given.
  const limits = { browser: { minWidth: 100, minHeight: 100 }, installed: { minWidth: 50, minHeight: 50 } };
  assert.equal(screenVerdict({ width: 99, height: 200 }, { limits }).fits, false);
  assert.equal(screenVerdict({ width: 60, height: 60 }, { installed: true, limits }).fits, true);
});

test('every phone in a browser tab is refused; installed, every phone 360 px tall or more in landscape passes', () => {
  for (const [name, tab, app] of PHONES) {
    const [tw, th] = tab;
    const [aw, ah] = app;
    assert.equal(screenVerdict({ width: tw, height: th }).fits, false, `${name} in a tab (${tw}x${th})`);
    assert.equal(screenVerdict({ width: aw, height: ah }, { installed: true }).fits, true, `${name} installed (${aw}x${ah})`);
    // The browser-tab vs installed difference is the mode, not only the size:
    // the same installed size in a tab is refused when it is under 400 px.
    if (ah < 400) assert.equal(screenVerdict({ width: aw, height: ah }).fits, false, `${name}: ${aw}x${ah} in a tab`);
  }
  // A small phone stays refused even installed.
  assert.equal(screenVerdict({ width: 740, height: 336 }, { installed: true }).fits, false, 'Galaxy S8, installed');
});

test('tablets and desktop windows always pass, in a tab or installed', () => {
  for (const [name, [width, height]] of BIG) {
    for (const installed of [false, true]) {
      assert.equal(screenVerdict({ width, height }, { installed }).fits, true, `${name} ${width}x${height}${installed ? ' installed' : ''}`);
    }
  }
});

test('a phone held upright that would fit turned sideways is asked to rotate; one too small either way is not', () => {
  // Installed iPhone 15 upright: 393 wide, 852 tall. Turned, 852 x 393 fits.
  assert.deepEqual(screenVerdict({ width: 393, height: 852 }, { installed: true }), { fits: false, portrait: true, rotate: true });
  // In a tab, turned it would still be under 400 px tall: no rotate line.
  assert.deepEqual(screenVerdict({ width: 390, height: 664 }), { fits: false, portrait: true, rotate: false });
  // Too small turned or not (an iPhone SE installed upright: 375 x 667
  // turned is 667 x 375, fits; a 320 x 568 phone turned is 568 x 320, never).
  assert.equal(screenVerdict({ width: 375, height: 667 }, { installed: true }).rotate, true);
  assert.equal(screenVerdict({ width: 320, height: 568 }, { installed: true }).rotate, false);
  // A landscape screen that is too small is never asked to rotate.
  assert.deepEqual(screenVerdict({ width: 932, height: 382 }), { fits: false, portrait: false, rotate: false });
  // Fitting, nothing to say.
  assert.equal(screenVerdict({ width: 1024, height: 768 }).rotate, false);
});

test('the usable viewport is the visible area: visualViewport where there is one, its zoom undone, else the window', () => {
  assert.deepEqual(viewportSize({ innerWidth: 1000, innerHeight: 600, visualViewport: { width: 932, height: 382, scale: 1 } }), { width: 932, height: 382 });
  assert.deepEqual(viewportSize({ innerWidth: 1000, innerHeight: 600, visualViewport: { width: 466, height: 191, scale: 2 } }), { width: 932, height: 382 });
  assert.deepEqual(viewportSize({ innerWidth: 1000.4, innerHeight: 599.6 }), { width: 1000, height: 600 });
  assert.deepEqual(viewportSize({ innerWidth: 1000, innerHeight: 600, visualViewport: { width: 0, height: 0 } }), { width: 1000, height: 600 });
  // The user agent is never read.
  assert.doesNotMatch(read('js/core/screen-guard.js'), /userAgent/);
});

// ---- The overlay ------------------------------------------------------------------

test('the block shows at start on a phone\'s browser tab, over everything, on its own, with its title, text and button', () => {
  const { guard, win } = guarded({ width: 932, height: 382 });
  assert.equal(guard.blocked, true);
  assert.equal(body.children.at(-1), guard.root, 'appended to the page by itself');
  assert.equal(guard.root.hidden, false);
  assert.equal(guard.root.getAttribute('role'), 'alertdialog');
  assert.equal(guard.root.getAttribute('aria-modal'), 'true');
  assert.equal(guard.title.textContent, 'Alva cannot be played on this screen');
  assert.equal(guard.body.textContent, 'Because we want the best gameplay experience for you, Alva isn’t playable on a small screen. Please try downloading Alva as a web app and launching it again to see if Alva accepts the screen size. Otherwise, please try running Alva on a bigger screen, preferably a tablet or a desktop device.');
  assert.equal(guard.download.textContent, 'Download Alva');
  assert.equal(guard.rotate.hidden, true, 'landscape: no rotate line');
  assert.equal(document.activeElement, guard.download, 'its button focused for keyboard and controller');
  assert.ok(document.documentElement.classList.contains('is-screen-blocked'));
  // Its own resize listener, on the window it was given.
  win.resize(1280, 800);
  assert.equal(guard.blocked, false);
  assert.equal(document.documentElement.classList.contains('is-screen-blocked'), false);
  // The same phone installed plays.
  const app = guarded({ width: 932, height: 430, standalone: true });
  assert.equal(app.guard.blocked, false);
  assert.equal(app.guard.root.hidden, true);
});

test('the block follows every resize and orientation change: shown when the screen gets too small, gone when it fits again, each change heard once', () => {
  const { guard, win } = guarded({ width: 932, height: 430, standalone: true });
  const heard = [];
  guard.onChange((blocked) => heard.push(blocked));
  const before = new Element('button');
  body.append(before);
  before.focus();
  assert.equal(guard.blocked, false);
  // Smaller mid-match (a keyboard-free resize): blocked.
  win.resize(932, 330);
  assert.equal(guard.blocked, true);
  assert.equal(guard.root.hidden, false);
  assert.equal(document.activeElement, guard.download);
  // Another small size: no second announcement.
  win.resize(900, 320);
  assert.deepEqual(heard, [true]);
  // Big enough again: gone, focus back where it was.
  win.resize(932, 430);
  assert.equal(guard.blocked, false);
  assert.equal(guard.root.hidden, true);
  assert.equal(document.activeElement, before);
  assert.deepEqual(heard, [true, false]);
  // Turned upright: blocked with the rotate line; turned back: gone.
  win.resize(430, 932);
  win.fire('orientationchange');
  assert.equal(guard.blocked, true);
  assert.equal(guard.rotate.hidden, false, 'asked to turn the device');
  assert.equal(guard.rotate.textContent, 'Turn your device sideways: Alva may fit in landscape.');
  win.resize(932, 430);
  win.fire('orientationchange');
  assert.equal(guard.blocked, false);
  assert.equal(guard.rotate.hidden, true);
  // The visible area alone shrinking (visualViewport) counts too.
  win.visualViewport.height = 300;
  win.fire('resize');
  assert.equal(guard.blocked, true);
});

test('while blocked, focus never leaves the block; while typing, an on-screen keyboard never blocks', async () => {
  const { guard, win } = guarded({ width: 932, height: 382 });
  const outside = new Element('button');
  body.append(outside);
  outside.focus();
  assert.equal(document.activeElement, guard.download, 'pulled back inside');
  // Unblocked, a text field focused and the keyboard up: no block.
  win.resize(1024, 768);
  const field = new Element('input');
  field.type = 'text';
  body.append(field);
  field.focus();
  win.resize(1024, 300);
  assert.equal(guard.blocked, false, 'the keyboard, not the screen');
  // The field let go (keyboard down): measured again.
  document.activeElement = body;
  document.fire('focusout', { target: field });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(guard.blocked, true, 'still too small once the keyboard is gone');
});

test('the overlay needs nothing of the game: no App, screen, battle or menu', () => {
  const code = read('js/core/screen-guard.js');
  for (const name of ['screens', 'battle', 'app.', 'MenuNavigator', 'ScreenManager']) {
    assert.doesNotMatch(code.replace(/^\/\/.*$/gm, ''), new RegExp(name.replace('.', '\\.')), name);
  }
  // main.js starts it before the App, and on its own.
  const main = read('js/main.js');
  assert.ok(main.indexOf('new ScreenGuard') < main.indexOf('new App'), 'started first');
  assert.match(main, /new App\(\{ install, screenGuard \}\)/);
  // With no installation at all it still shows and explains.
  const { guard } = guarded({ width: 600, height: 300, noInstall: true });
  assert.equal(guard.blocked, true);
});

// ---- Download Alva ----------------------------------------------------------------

test('Download Alva on Chromium: the browser\'s own prompt, from that press, and what came of it', async () => {
  for (const [outcome, key, steps] of [
    ['accepted', 'screenBlock.accepted', false],
    ['dismissed', 'install.status.dismissed', false],
    ['reject', 'install.status.failed', true],
  ]) {
    const { guard, win, install } = guarded({ width: 915, height: 332, userAgent: UA.android });
    win.fire('beforeinstallprompt', installOffer(outcome));
    assert.equal(install.canPrompt, true);
    const warn = console.warn;
    console.warn = noop;
    try {
      const pending = guard.requestDownload();
      assert.equal(guard.status.textContent, t('install.status.prompting'), 'while the prompt is up');
      assert.equal(await pending, outcome === 'reject' ? 'failed' : outcome);
    } finally {
      console.warn = warn;
    }
    assert.equal(guard.status.hidden, false);
    assert.equal(guard.status.getAttribute('data-i18n'), key, outcome);
    assert.equal(guard.steps.hidden, !steps, `${outcome}: the how-to ${steps ? 'as well' : 'not needed'}`);
  }
});

test('Download Alva on iOS Safari (no prompt): the existing Add to Home Screen steps', async () => {
  const { guard } = guarded({ width: 852, height: 342, userAgent: UA.iphone });
  guard.download.click();
  await flush();
  assert.equal(guard.steps.hidden, false);
  assert.equal(guard.stepsHeading.getAttribute('data-i18n'), INSTALL_INSTRUCTIONS.ios.heading);
  const items = guard.stepsBody.querySelectorAll('li');
  assert.deepEqual(items.map((li) => li.getAttribute('data-i18n')), INSTALL_INSTRUCTIONS.ios.steps);
  assert.equal(items[2].textContent, 'Select Add to Home Screen.');
});

test('Download Alva explains instead of doing nothing: already installed, or a browser that cannot install', async () => {
  // Installed, and still too small.
  const installed = guarded({ width: 740, height: 336, standalone: true });
  assert.equal(installed.guard.blocked, true);
  assert.equal(await installed.guard.requestDownload(), 'installed');
  assert.equal(installed.guard.status.textContent, 'Alva is already installed, but this screen is still too small for it. Please try a bigger screen, preferably a tablet or a desktop device.');
  // Firefox: it cannot install web apps, and says so.
  const firefox = guarded({ width: 600, height: 380, userAgent: UA.firefox });
  assert.equal(await firefox.guard.requestDownload(), 'manual');
  assert.equal(firefox.guard.stepsBody.querySelector('p').getAttribute('data-i18n'), 'install.unavailable');
  // No installation state at all.
  const none = guarded({ width: 600, height: 300, noInstall: true });
  assert.equal(await none.guard.requestDownload(), 'unavailable');
  assert.equal(none.guard.status.getAttribute('data-i18n'), 'install.unavailable');
  // Shown afresh: last time's answer is gone.
  none.win.resize(1280, 800);
  none.win.resize(600, 300);
  assert.equal(none.guard.status.hidden, true);
});

test('a controller\'s Cross / A presses Download Alva, once per press, never a press already down', async () => {
  const { guard, win } = guarded({ width: 932, height: 382, userAgent: UA.iphone });
  let pressed = 0;
  guard.download.addEventListener('click', () => pressed++);
  const pad = { connected: true, buttons: [{ pressed: true }] };
  win.pads = [pad];
  win.frame();
  assert.equal(pressed, 0, 'already down as the block appeared');
  pad.buttons[0].pressed = false;
  win.frame();
  pad.buttons[0].pressed = true;
  win.frame();
  win.frame();
  assert.equal(pressed, 1, 'one press');
  await flush();
  assert.equal(guard.steps.hidden, false);
  // Gone: no more polling.
  win.resize(1280, 800);
  pad.buttons[0].pressed = false;
  win.frame();
  pad.buttons[0].pressed = true;
  win.frame();
  assert.equal(pressed, 1);
});

// ---- Strings, input, style ----------------------------------------------------------

test('the block\'s words are translation keys in every language Alva supports, and follow it', () => {
  const keys = ['screenBlock.title', 'screenBlock.body', 'screenBlock.rotate', 'screenBlock.download', 'screenBlock.installed', 'screenBlock.accepted'];
  for (const language of LANGUAGES) {
    for (const key of keys) assert.ok(typeof STRINGS[language][key] === 'string' && STRINGS[language][key], `${language}: ${key}`);
  }
  // None hard-coded.
  const code = read('js/core/screen-guard.js');
  assert.doesNotMatch(code, /cannot be played|Download Alva'|preferably a tablet/);
  const { guard } = guarded({ width: 932, height: 382 });
  setLanguage('fr');
  try {
    assert.equal(guard.title.textContent, 'Alva ne peut pas être joué sur cet écran');
    assert.equal(guard.download.textContent, 'Télécharger Alva');
  } finally {
    setLanguage('en');
  }
  assert.equal(guard.title.textContent, 'Alva cannot be played on this screen');
});

test('while blocked the game takes no input: no key reaches play or the menus, no controller either', () => {
  let blocked = false;
  const listeners = new Map();
  const saved = { add: globalThis.window.addEventListener };
  globalThis.window.addEventListener = (type, fn) => listeners.set(type, fn);
  try {
    let polled = 0;
    const controllers = { poll: () => { polled++; return null; }, pollPlayers: () => { polled++; return { p1: null }; }, suspend: noop, resume: noop, onChange: noop };
    const input = new InputManager(CONFIG.bindings, { controllers, blocked: () => blocked });
    const heard = [];
    input.onKey((e) => heard.push(e.code));
    const key = (code) => listeners.get('keydown')({ code, repeat: false, preventDefault: noop });
    key('KeyJ');
    assert.deepEqual(heard, ['KeyJ']);
    blocked = true;
    key('Enter');
    key('KeyP');
    assert.deepEqual(heard, ['KeyJ'], 'nothing while blocked');
    assert.equal(input.keys.has('KeyP'), false, 'nothing held');
    input.pollGamepads(16);
    assert.equal(polled, 0, 'no controller read for play or menus');
    blocked = false;
    input.pollGamepads(32);
    assert.equal(polled, 1);
    key('KeyP');
    assert.deepEqual(heard, ['KeyJ', 'KeyP']);
  } finally {
    globalThis.window.addEventListener = saved.add;
  }
  // The App wires it, lets go of everything and lets the screen hold its match.
  const app = read('js/core/app.js');
  assert.match(app, /blocked: \(\) => !!this\.screenGuard\?\.blocked/);
  assert.match(app, /this\.screenGuard\?\.onChange\(\(blocked\) => \{[^}]*this\.input\.suspend\(\);[^}]*onScreenBlocked/);
  // Online, pause does nothing (the match runs on, never desyncs); Practice
  // Ground opens its menu.
  assert.match(read('js/screens/online-battle-screen.js'), /\n  pause\(\) \{\}/);
  assert.match(read('js/screens/practice-screen.js'), /onScreenBlocked\(\) \{[^}]*this\.openMenu\(\);/);
});

test('the block is solid black over everything, centred white text in Alva\'s type, and fits a tiny screen', () => {
  const css = stylesheet();
  const rule = css.match(/\n\.screen-block \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /position: fixed;/);
  assert.match(rule, /inset: 0;/);
  assert.match(rule, /background: #000;/);
  assert.match(rule, /color: #fff;/);
  assert.match(rule, /font-family: var\(--font\);/);
  assert.match(rule, /text-align: center;/);
  assert.match(rule, /overflow-y: auto;/, 'scrolls on its own when the screen cannot hold it');
  const z = Number(rule.match(/z-index: (\d+);/)[1]);
  const others = [...css.matchAll(/z-index: (\d+);/g)].map((m) => Number(m[1])).filter((n) => n !== z);
  assert.ok(others.every((n) => n < z), 'above every other layer');
  // The navigator raises stacked dialogs from 60 a step at a time: never near it.
  assert.ok(z > 1e9);
  assert.match(css, /\.screen-block\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.screen-block-download:focus-visible/, 'a visible focus ring for keyboard and controller');
});
