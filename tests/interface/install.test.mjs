// Run with node --test tests/interface/install.test.mjs (no dependencies).
// Installing Alva as a web app: the installation state (js/core/
// web-app-install.js: the browser's own offer kept for a real press,
// appinstalled, running as an installed app, the platform the manual
// instructions are written for); the install dialog Home's Download button
// opens (js/ui/install-dialog.js: its modal semantics, focus, keyboard,
// controller and pointer handling, the native prompt accepted and declined,
// the manual instructions, the installed state, both languages); the web
// app manifest and its icons, all relative so a GitHub Pages sub-path works;
// and the Download icon's animation. On a minimal fake DOM and a fake
// browser window; the browsers' own installation UI needs real-browser
// verification (see docs/development/testing.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { stylesheet } from '../helpers/stylesheet.mjs';


// ---- Fake DOM ------------------------------------------------------------------

const noop = () => {};

class Node {
  parentNode = null;
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
const BOOLEAN_ATTRS = ['hidden', 'disabled', 'inert'];
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = {};
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  html = '';
  clientHeight = 0;
  offsetWidth = 0;
  scrollTop = 0;
  rect = { left: 0, top: 0, width: 40, height: 40 };
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
  click(detail = 1) {
    if (this.disabled) return;
    this.dispatch('click', { detail });
  }
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
    this.dispatch('focus');
  }
  blur() { if (document.activeElement === this) document.activeElement = document.body; }
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
  getBoundingClientRect() { return this.rect; }
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
}

const sections = new Map();
globalThis.Node = Node;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: (selector) => {
    const id = selector.match(/data-screen="([\w-]+)"/)?.[1];
    if (!sections.has(id)) sections.set(id, new Element('section'));
    return sections.get(id);
  },
  addEventListener: noop,
  removeEventListener: noop,
};

const { Settings } = await import('../../js/core/settings.js');
const { followSettings, onLanguageChange, localizeTree, setLanguage } = await import('../../js/localization/i18n.js');
const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { ICONS } = await import('../../js/ui/icons.js');
const { WebAppInstall, installPlatform, runningInstalled, INSTALL_PLATFORMS } = await import('../../js/core/web-app-install.js');
const { InstallDialog, INSTALL_INSTRUCTIONS } = await import('../../js/ui/install-dialog.js');

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// Keyboard and pad menu input, as the app delivers it.
function fakeInput() {
  const listeners = new Set();
  const padListeners = new Set();
  return {
    onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onPadMenu(fn) { padListeners.add(fn); },
    pad(cmd) { for (const fn of padListeners) fn(cmd); },
    key(code, extra = {}) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: noop, ...extra };
      for (const fn of [...listeners]) fn(e);
      return e;
    },
  };
}

// What browsers say of themselves.
const UA = Object.freeze({
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  other: 'SomeBrowser/1.0',
});

// A browser window: its events, its display mode (as matchMedia answers
// "(display-mode: …)") and its navigator.
function fakeWindow({ userAgent = UA.chrome, maxTouchPoints = 0, standalone = undefined, displayMode = 'browser' } = {}) {
  const listeners = new Map();
  const win = {
    displayMode,
    navigator: { userAgent, maxTouchPoints, standalone },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: noop,
    matchMedia(query) {
      const mode = query.match(/display-mode: ([\w-]+)/)?.[1];
      return { get matches() { return !!mode && win.displayMode === mode; }, addEventListener: noop };
    },
    fire(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
      return event;
    },
  };
  return win;
}

// A beforeinstallprompt event: prompt() settles with the player's choice
// (`outcome`), or rejects ('reject'), when its userChoice never settles;
// `legacy` returns nothing from prompt(), as older browsers did.
function installOffer(outcome = 'accepted', { legacy = false } = {}) {
  let choose;
  const e = {
    prevented: 0,
    prompted: 0,
    preventDefault() { this.prevented++; },
    userChoice: new Promise((resolve) => { choose = resolve; }),
    prompt() {
      this.prompted++;
      if (outcome === 'reject') return Promise.reject(new Error('NotAllowedError'));
      choose({ outcome, platform: 'web' });
      return legacy ? undefined : Promise.resolve({ outcome, platform: 'web' });
    },
  };
  return e;
}

// Home and its install dialog on the real ScreenManager and MenuNavigator,
// with the installation state of `win`.
function boot({ win = fakeWindow() } = {}) {
  const app = {
    input: fakeInput(),
    device: { reducedMotion: true },
    audio: { play: noop },
    settings: new Settings(memoryStorage()),
    selection: { characterId: null },
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const offSettings = followSettings(app.settings);
  app.install = new WebAppInstall(win);
  const root = new Element('div');
  root.hidden = true;
  app.installDialog = new InstallDialog(root, app);
  const home = new HomeScreen(app);
  body.replaceChildren(home.el, root);
  const offLanguage = onLanguageChange(() => localizeTree(body));
  app.screens.register(home);
  app.screens.go('home');
  const done = () => {
    offSettings();
    offLanguage();
    setLanguage('en');
  };
  return { app, home, dialog: app.installDialog, install: app.install, win, root, done };
}

const place = (node, left, top, width, height) => { node.rect = { left, top, width, height }; };
const shown = (node) => !node.hidden;
const textOf = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const buttonsShown = (dialog) => [dialog.notNowButton, dialog.addButton, dialog.gotItButton].filter(shown).map(textOf);

// ---- The installation state ------------------------------------------------------------

test('the platform the manual instructions are written for, from what the browser says of itself', () => {
  assert.deepEqual([...INSTALL_PLATFORMS].sort(), Object.keys(INSTALL_INSTRUCTIONS).sort(), 'instructions for every platform');
  for (const [ua, touch, want] of [
    [UA.iphone, 5, 'ios'], [UA.chromeIos, 5, 'ios'], [UA.mac, 5, 'ios'], [UA.mac, 0, 'desktop-safari'],
    [UA.android, 5, 'android'], [UA.samsung, 5, 'android-samsung'], [UA.firefoxAndroid, 5, 'android-firefox'],
    [UA.chrome, 0, 'desktop-chromium'], [UA.edge, 0, 'desktop-edge'], [UA.firefox, 0, 'desktop-firefox'],
    [UA.other, 0, 'other'], ['', 0, 'other'],
  ]) {
    assert.equal(installPlatform({ userAgent: ua, maxTouchPoints: touch }), want, `${ua.slice(0, 40)} (${touch})`);
  }
  assert.equal(installPlatform(), 'other');
});

test('running as an installed app: a standalone (or fullscreen) display mode, or iOS\'s navigator.standalone', () => {
  assert.equal(runningInstalled(fakeWindow()), false);
  for (const mode of ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']) {
    assert.equal(runningInstalled(fakeWindow({ displayMode: mode })), true, mode);
  }
  assert.equal(runningInstalled(fakeWindow({ userAgent: UA.iphone, standalone: true })), true);
  assert.equal(runningInstalled(fakeWindow({ userAgent: UA.iphone, standalone: false })), false);
  assert.equal(runningInstalled(null), false);
  assert.equal(runningInstalled({ navigator: {} }), false, 'no matchMedia at all');
});

test('the browser\'s offer is kept for a press of our own; accepted is not installed until appinstalled says so', async () => {
  const win = fakeWindow();
  const install = new WebAppInstall(win);
  const heard = [];
  install.onChange(() => heard.push([install.mode, install.status]));
  assert.equal(install.mode, 'manual', 'no offer yet');
  assert.equal(await install.install(), 'unavailable', 'nothing to prompt');
  const offer = win.fire('beforeinstallprompt', installOffer('accepted'));
  assert.equal(offer.prevented, 1, 'no mini-infobar: the offer is ours to use');
  assert.equal(install.mode, 'prompt');
  assert.equal(offer.prompted, 0, 'never prompted by itself');
  const pending = install.install();
  assert.equal(offer.prompted, 1, 'prompted at once, in the press\'s own task');
  assert.equal(install.status, 'prompting');
  assert.equal(await pending, 'accepted');
  assert.equal(install.status, 'accepted');
  assert.notEqual(install.mode, 'installed', 'not installed yet');
  assert.equal(await install.install(), 'unavailable', 'an offer is used once');
  win.fire('appinstalled');
  assert.equal(install.mode, 'installed');
  assert.equal(install.status, 'installed');
  assert.deepEqual(heard.at(-1), ['installed', 'installed']);
  win.fire('beforeinstallprompt', installOffer());
  assert.equal(install.mode, 'installed', 'no new offer once installed');
});

test('declined, refused or from an older browser: the game goes on and the dialog says how to install by hand', async () => {
  const win = fakeWindow();
  const install = new WebAppInstall(win);
  win.fire('beforeinstallprompt', installOffer('dismissed'));
  assert.equal(await install.install(), 'dismissed');
  assert.deepEqual([install.mode, install.status], ['manual', 'dismissed']);
  // The browser may offer again later, with a new event.
  win.fire('beforeinstallprompt', installOffer('accepted', { legacy: true }));
  assert.equal(install.mode, 'prompt');
  assert.equal(await install.install(), 'accepted', 'an older browser reports through userChoice');
  // A browser that refuses to prompt never leaves it hanging.
  const warn = console.warn;
  console.warn = noop;
  try {
    win.fire('beforeinstallprompt', installOffer('reject'));
    assert.equal(await install.install(), 'failed');
    assert.deepEqual([install.mode, install.status], ['manual', 'failed']);
  } finally { console.warn = warn; }
  // Running as the installed app: nothing to offer.
  const app = new WebAppInstall(fakeWindow({ displayMode: 'standalone' }));
  assert.equal(app.mode, 'installed');
  assert.equal(await app.install(), 'unavailable');
});

// ---- The Download button and its dialog ---------------------------------------------------

test('Download opens the install dialog over Home: a labelled modal with its own scope, Home inert, focus on Add to Home Screen', () => {
  const env = boot();
  try {
    const { app, home, dialog, root, win } = env;
    win.fire('beforeinstallprompt', installOffer());
    const download = home.downloadButton;
    assert.equal(download.disabled, false);
    assert.equal(download.getAttribute('aria-haspopup'), 'dialog');
    assert.ok(app.nav.candidates(home.el).includes(download), 'keyboard and controller reach it');
    download.focus();
    download.click();
    assert.equal(dialog.isOpen, true);
    assert.equal(root.hidden, false);
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-modal'), 'true');
    assert.equal(root.getAttribute('aria-labelledby'), 'install-dialog-title');
    assert.equal(root.getAttribute('aria-describedby'), 'install-dialog-body');
    assert.equal(dialog.title.getAttribute('id'), 'install-dialog-title');
    assert.equal(home.el.inert, true, 'Home inert beneath');
    assert.equal(app.nav.scopes.at(-1)?.el, root, 'its own navigation scope');
    assert.equal(app.screens.current, home, 'no screen change');
    assert.equal(dialog.view, 'prompt');
    assert.equal(textOf(dialog.title), 'Install Alva');
    assert.deepEqual(dialog.intro.children.map(textOf), [
      'Want quicker access to Alva?',
      'You can add Alva directly to your home screen and launch it just like an app, without opening your browser and searching for the game every time.',
      'Alva is a lightweight web app, so there’s no large game download or traditional app installation required. It uses very little additional storage.',
      'Add Alva to your home screen for a faster, more convenient way to play!',
    ]);
    assert.doesNotMatch(textOf(dialog.intro), /no storage|zero storage|0 (MB|KB)/i, 'never a false storage claim');
    assert.deepEqual(buttonsShown(dialog), ['Not Now', 'Add to Home Screen']);
    assert.equal(document.activeElement, dialog.addButton, 'the primary action takes focus');
    assert.equal(dialog.steps.hidden, true, 'no manual steps when the browser can install');
    // Not Now closes it, Home is back and focus is on Download again.
    dialog.notNowButton.click();
    assert.equal(dialog.isOpen, false);
    assert.equal(root.hidden, true);
    assert.equal(home.el.inert, false);
    assert.equal(app.nav.scopes.length, 0);
    assert.equal(document.activeElement, download);
    assert.equal(app.install.mode, 'prompt', 'the offer is kept for later');
  } finally { env.done(); }
});

test('Escape, controller Back, the close button and the dim around the panel each close it, focus back on Download', () => {
  const env = boot();
  try {
    const { app, home, dialog, root } = env;
    const download = home.downloadButton;
    for (const close of [
      () => app.input.key('Escape'),
      () => app.input.pad('back'),
      () => dialog.closeButton.click(),
      () => root.dispatch('click', { target: root }),
      () => dialog.gotItButton.click(),
    ]) {
      download.click();
      assert.equal(dialog.isOpen, true);
      close();
      assert.equal(dialog.isOpen, false);
      assert.equal(document.activeElement, download);
      assert.equal(home.el.inert, false);
      assert.equal(app.nav.scopes.length, 0, 'no scope left behind');
    }
    // Reopening never stacks scopes or listeners.
    download.click();
    download.click();
    assert.equal(app.nav.scopes.length, 1);
    dialog.close();
    // Home's own actions still work afterwards.
    assert.ok(app.nav.candidates(home.el).includes(home.actions.discover));
  } finally { env.done(); }
});

test('Add to Home Screen asks the browser for its own prompt; accepted, it waits for the browser before saying Alva is installed', async () => {
  const env = boot();
  try {
    const { home, dialog, win, install } = env;
    const offer = win.fire('beforeinstallprompt', installOffer('accepted'));
    home.downloadButton.click();
    dialog.addButton.click();
    assert.equal(offer.prompted, 1, 'the browser\'s own confirmation, from the press');
    await flush();
    assert.equal(dialog.view, 'waiting');
    assert.equal(textOf(dialog.status), 'Installing Alva…');
    assert.equal(dialog.status.getAttribute('role'), 'status');
    assert.equal(textOf(dialog.title), 'Install Alva', 'no success claimed yet');
    assert.deepEqual(buttonsShown(dialog), ['Got It']);
    assert.equal(document.activeElement, dialog.gotItButton, 'focus never left on a hidden button');
    win.fire('appinstalled');
    assert.equal(install.mode, 'installed');
    assert.equal(dialog.view, 'installed');
    assert.equal(textOf(dialog.title), 'Alva is installed!');
    assert.equal(textOf(dialog.message), 'Alva was added to your device. You can now launch it from your Home Screen or app list, just like an app.');
    assert.equal(dialog.status.hidden, true);
    assert.equal(dialog.intro.hidden, true);
    assert.ok(home.downloadButton.classList.contains('is-installed'), 'the Download button stops calling for attention');
    dialog.gotItButton.click();
    assert.equal(document.activeElement, home.downloadButton);
    home.downloadButton.click();
    assert.equal(dialog.view, 'installed', 'reopened: still installed, no prompt');
    dialog.close();
  } finally { env.done(); }
});

test('declined, the dialog stays usable: it says so and shows how to install later; nothing else changes', async () => {
  const env = boot({ win: fakeWindow({ userAgent: UA.chrome }) });
  try {
    const { app, home, dialog, win } = env;
    win.fire('beforeinstallprompt', installOffer('dismissed'));
    home.downloadButton.click();
    await dialog.requestInstall();
    assert.equal(dialog.isOpen, true);
    assert.equal(dialog.view, 'manual');
    assert.equal(textOf(dialog.status), 'Alva wasn’t installed. You can add it anytime.');
    assert.equal(dialog.steps.hidden, false);
    assert.equal(textOf(dialog.stepsHeading), 'How to install Alva');
    assert.match(textOf(dialog.stepsBody), /Install icon at the right of the address bar/);
    assert.deepEqual(buttonsShown(dialog), ['Got It']);
    assert.equal(document.activeElement, dialog.gotItButton);
    dialog.gotItButton.click();
    assert.equal(app.screens.current, home);
    assert.equal(home.downloadButton.classList.contains('is-installed'), false);
  } finally { env.done(); }
});

test('without a programmable prompt: Safari on an iPhone gets the four Add to Home Screen steps; other browsers their own way', () => {
  const env = boot({ win: fakeWindow({ userAgent: UA.iphone, maxTouchPoints: 5 }) });
  try {
    const { home, dialog } = env;
    home.downloadButton.click();
    assert.equal(dialog.view, 'manual');
    assert.equal(textOf(dialog.title), 'Install Alva');
    assert.equal(dialog.intro.hidden, false, 'the same explanation');
    assert.equal(textOf(dialog.stepsHeading), 'To add Alva to your Home Screen:');
    const list = dialog.stepsBody.querySelector('ol');
    assert.ok(list, 'numbered steps');
    assert.deepEqual(list.children.map(textOf), [
      'Open Alva in Safari.', 'Tap the Share button.', 'Select Add to Home Screen.', 'Confirm by tapping Add.',
    ]);
    assert.deepEqual(buttonsShown(dialog), ['Got It'], 'no Add button that could only fail');
    assert.equal(document.activeElement, dialog.gotItButton);
    dialog.close();
  } finally { env.done(); }
  for (const [ua, phrase] of [
    [UA.android, /Install app or Add to Home screen/],
    [UA.samsung, /Add page to, then Home screen/],
    [UA.firefoxAndroid, /Add app to Home screen/],
    [UA.edge, /Install this site as an app/],
    [UA.mac, /File, then Add to Dock/],
    [UA.firefox, /may not be able to install web apps/],
    [UA.other, /If your browser supports it/],
  ]) {
    const other = boot({ win: fakeWindow({ userAgent: ua }) });
    try {
      other.home.downloadButton.click();
      assert.match(textOf(other.dialog.stepsBody), phrase, ua);
      assert.doesNotMatch(textOf(other.dialog.root), /one tap|one-tap|every device/i, 'never promises one-tap installation');
      other.dialog.close();
    } finally { other.done(); }
  }
});

test('opened as the installed app, it says Alva is already installed and offers no prompt', () => {
  for (const win of [fakeWindow({ displayMode: 'standalone' }), fakeWindow({ userAgent: UA.iphone, maxTouchPoints: 5, standalone: true })]) {
    const env = boot({ win });
    try {
      const { home, dialog } = env;
      win.fire('beforeinstallprompt', installOffer());
      assert.ok(home.downloadButton.classList.contains('is-installed'));
      assert.equal(home.downloadButton.disabled, false, 'Download still opens the dialog');
      home.downloadButton.click();
      assert.equal(dialog.view, 'installed');
      assert.equal(textOf(dialog.title), 'Alva is already installed!');
      assert.equal(textOf(dialog.message), 'You can launch Alva directly from your Home Screen.');
      assert.deepEqual(buttonsShown(dialog), ['Got It']);
      assert.equal(dialog.steps.hidden, true);
      dialog.close();
      assert.equal(home.actions.discover.disabled, false, 'the rest of Home is untouched');
    } finally { env.done(); }
  }
});

test('Tab cycles inside the dialog; the controller moves between its buttons and confirms', async () => {
  const env = boot();
  try {
    const { app, home, dialog, root, win } = env;
    const offer = win.fire('beforeinstallprompt', installOffer('dismissed'));
    home.downloadButton.click();
    const tab = (shiftKey = false) => root.dispatch('keydown', { code: 'Tab', shiftKey, altKey: false, ctrlKey: false, metaKey: false });
    assert.equal(document.activeElement, dialog.addButton);
    tab();
    assert.equal(document.activeElement, dialog.closeButton, 'wraps round to the close button');
    tab();
    assert.equal(document.activeElement, dialog.notNowButton);
    tab(true);
    assert.equal(document.activeElement, dialog.closeButton, 'Shift+Tab goes back');
    tab(true);
    assert.equal(document.activeElement, dialog.addButton, 'and wraps the other way');
    // The D-pad between the two buttons, side by side; confirm presses.
    place(dialog.notNowButton, 400, 500, 200, 44);
    place(dialog.addButton, 620, 500, 200, 44);
    place(dialog.closeButton, 820, 200, 32, 32);
    place(home.downloadButton, 1200, 676, 40, 40);
    app.input.pad('left');
    assert.equal(document.activeElement, dialog.notNowButton);
    app.input.pad('right');
    assert.equal(document.activeElement, dialog.addButton);
    assert.ok(!app.nav.candidates(root).includes(home.downloadButton), 'Home stays out of reach');
    app.input.pad('confirm');
    assert.equal(offer.prompted, 1, 'Cross / A asks the browser');
    await flush();
    assert.equal(dialog.view, 'manual');
    dialog.close();
  } finally { env.done(); }
});

test('the dialog reads in French, and follows the language while open', () => {
  const env = boot({ win: fakeWindow({ userAgent: UA.iphone, maxTouchPoints: 5 }) });
  try {
    const { app, home, dialog } = env;
    app.settings.set('language', 'fr');
    assert.equal(home.downloadButton.getAttribute('aria-label'), 'Télécharger');
    assert.equal(home.downloadButton.getAttribute('title'), 'Installer Alva');
    home.downloadButton.click();
    assert.equal(textOf(dialog.title), 'Installer Alva');
    assert.equal(textOf(dialog.intro.children[0]), 'Envie d’accéder plus vite à Alva ?');
    assert.equal(textOf(dialog.stepsHeading), 'Pour ajouter Alva à votre écran d’accueil :');
    assert.deepEqual(dialog.stepsBody.querySelector('ol').children.map(textOf), [
      'Ouvrez Alva dans Safari.', 'Touchez le bouton Partager.', 'Choisissez Sur l’écran d’accueil.', 'Confirmez en touchant Ajouter.',
    ]);
    assert.deepEqual(buttonsShown(dialog), ['Compris']);
    assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Fermer');
    app.settings.set('language', 'en');
    assert.equal(textOf(dialog.title), 'Install Alva', 'follows the language while open');
    assert.equal(textOf(dialog.stepsBody.querySelector('ol').children[0]), 'Open Alva in Safari.');
    dialog.close();
  } finally { env.done(); }
  const env2 = boot();
  try {
    env2.win.fire('beforeinstallprompt', installOffer());
    env2.app.settings.set('language', 'fr');
    env2.home.downloadButton.click();
    assert.deepEqual(buttonsShown(env2.dialog), ['Pas maintenant', 'Ajouter à l’écran d’accueil']);
    env2.dialog.close();
  } finally { env2.done(); }
});

// ---- The manifest, its icons and the page ---------------------------------------------

// A PNG's width and height, from its header.
function pngSize(path) {
  const buf = readFileSync(new URL(path, ROOT));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${path} is a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('the web app manifest: valid, standalone, Alva\'s colours and icons, every URL relative so a sub-path works', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Alva');
  assert.equal(manifest.short_name, 'Alva');
  assert.equal(manifest.description, 'A browser-based platform fighting game.');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.background_color, '#050506');
  assert.equal(manifest.theme_color, '#050506');
  // Deployed at a GitHub Pages project sub-path, every URL stays inside it.
  const site = 'https://hiyroscript.github.io/alva/';
  const base = new URL('manifest.webmanifest', site);
  const scope = new URL(manifest.scope, base).href;
  assert.equal(scope, site);
  assert.equal(new URL(manifest.start_url, base).href, site, 'launches into Alva itself');
  assert.equal(new URL(manifest.id, base).href, site);
  const sizes = new Map();
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\/assets\/icons\/[\w-]+\.png$/, `${icon.src}: relative, never from the domain root`);
    assert.ok(new URL(icon.src, base).href.startsWith(site));
    assert.equal(icon.type, 'image/png');
    const path = icon.src.slice(2);
    assert.ok(existsSync(new URL(path, ROOT)), `${path} exists`);
    const [w, h] = pngSize(path);
    assert.equal(icon.sizes, `${w}x${h}`, `${path}: its real size`);
    sizes.set(`${icon.purpose}:${w}`, path);
  }
  for (const key of ['any:192', 'any:512', 'maskable:192', 'maskable:512']) assert.ok(sizes.has(key), key);
  assert.deepEqual(pngSize('assets/icons/apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(readdirSync(new URL('assets/icons/', ROOT)).sort(),
    ['alva-192.png', 'alva-512.png', 'alva-maskable-192.png', 'alva-maskable-512.png', 'apple-touch-icon.png']);
});

test('index.html links the manifest and the touch icon relatively, beside the existing web-app metadata; no service worker caches the game', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/assets\/icons\/apple-touch-icon\.png">/);
  assert.match(html, /<meta name="theme-color" content="#050506">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<div id="install-dialog" class="overlay dialog-overlay install-overlay" hidden><\/div>/);
  assert.match(read('js/core/app.js'), /this\.installDialog = new InstallDialog\(document\.getElementById\('install-dialog'\), this\);/);
  assert.doesNotMatch(html, /href="\/(?!\/)/, 'nothing from the domain root');
  const code = readdirSync(new URL('js/core/', ROOT)).map((f) => read(`js/core/${f}`)).join('\n') + read('js/main.js');
  assert.doesNotMatch(code, /serviceWorker\.register|caches\.open/, 'no offline cache to fill storage or serve a stale game');
  assert.equal(existsSync(new URL('sw.js', ROOT)), false);
  // No alert() or confirm() for installation.
  for (const file of ['js/ui/install-dialog.js', 'js/core/web-app-install.js', 'js/screens/home-screen.js']) {
    assert.doesNotMatch(read(file).replace(/^\s*\/\/.*$/gm, ''), /\b(alert|confirm)\(/, file);
  }
});

// ---- The Download icon -------------------------------------------------------------------

test('the Download icon: its arrow drops into its tray on a loop, a faint accent-green glow, paused under the dialog, still with reduced motion', () => {
  assert.match(ICONS.download, /<g class="icon-download-arrow"><path d="M12 3v12M7 10l5 5 5-5"\/><\/g>/, 'the same arrow, its own group');
  assert.match(ICONS.download, /<path class="icon-download-tray" d="M4 16v5h16v-5"\/>/, 'the same tray');
  const css = stylesheet();
  const arrow = css.match(/\n\.home-download \.icon-download-arrow \{([^}]*)\}/)?.[1] ?? '';
  const seconds = Number(arrow.match(/animation: home-download-arrow ([\d.]+)s/)?.[1]);
  assert.ok(seconds >= 2 && seconds <= 4, `a ${seconds} s cycle with its rest`);
  assert.match(arrow, /infinite/);
  assert.match(css, /@keyframes home-download-arrow \{[^@]*translateY\(-[\d.]+px\)[^@]*translateY\([\d.]+px\)/, 'up, then down into the tray');
  assert.match(css, /@keyframes home-download-glow \{[^@]*opacity: 0;[^@]*opacity: 1;/);
  const glow = css.match(/\n\.home-download::after \{([^}]*)\}/)?.[1] ?? '';
  assert.match(glow, /rgba\(47, 191, 99, /, 'the interface\'s one accent, green (--accent), restrained');
  assert.match(glow, /pointer-events: none;/, 'never in the way of a press');
  assert.doesNotMatch(css.match(/@keyframes home-download-arrow \{[\s\S]*?\n\}/)[0], /width|height|margin|top|left/, 'transforms only: no layout shift');
  assert.match(css, /\.screen--home\[inert\] \.home-download::after,\s*\.screen--home\[inert\] \.home-download \.icon-download-arrow \{ animation-play-state: paused; \}/);
  assert.match(css, /\.home-download\.is-installed::after,\s*\.home-download\.is-installed \.icon-download-arrow \{ animation: none; \}/);
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  assert.match(reduced, /\.home-download::after, \.home-download \.icon-download-arrow \{ animation: none; \}/);
  assert.match(css, /\.home-download:hover \{/);
  assert.match(css, /\.home-download:focus \{[^}]*box-shadow: var\(--focus-ring\)/);
});
