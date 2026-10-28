// Run with node --test tests/interface/controller-ui.test.mjs (no dependencies).
// The controller interface: Home's controller button and its connection
// indicator; Controller Connections (counts, devices, Player 1, unsupported
// devices, the four-controller warning, Reconnect, live updates); the
// circular controller cursor (hover, confirm, scope, hiding, D-pad
// following); Settings › Controls › Controller controls, its roster, each
// fighter's editor (categories, names, descriptions, family names, save,
// cancel, restore, conflicts) and the binding dialog (capture, retry,
// cancel, menus kept out); in English and French. Real modules on a minimal
// fake DOM with mocked controllers: layout and paint still need a real
// browser (docs/development/testing.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  scrollHeight = 0;
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
  get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
  get firstElementChild() { return this.children.find((c) => c instanceof Element) ?? null; }
  get lastChild() { return this.children.at(-1) ?? null; }
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
  click(detail = 0) {
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
      const value = s.match(/^\[([\w-]+)="([^"]*)"\]$/);
      if (value) return this.getAttribute(value[1]) === value[2];
      const attr = s.match(/^([a-z]*)\[([\w-]+)\]$/);
      if (attr) return (!attr[1] || this.tagName === attr[1].toUpperCase()) && this.hasAttribute(attr[2]);
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
  getContext() { return { clearRect: noop, drawImage: noop, fillRect: noop, imageSmoothingEnabled: false }; }
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
}

const sections = new Map();
const docListeners = new Map();
globalThis.Node = Node;
const winListeners = new Map();
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  addEventListener: (type, fn) => { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); },
  removeEventListener: noop,
};
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
const body = new Element('body');
let pointAt = null; // what elementFromPoint finds
globalThis.document = {
  body,
  hidden: false,
  activeElement: body,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  elementFromPoint: () => pointAt,
  querySelector: (selector) => {
    const id = selector.match(/data-screen="([\w-]+)"/)?.[1];
    if (!sections.has(id)) sections.set(id, new Element('section'));
    return sections.get(id);
  },
  addEventListener: (type, fn) => { if (!docListeners.has(type)) docListeners.set(type, []); docListeners.get(type).push(fn); },
  removeEventListener: noop,
};

const { Settings } = await import('../../js/core/settings.js');
const { followSettings, onLanguageChange, localizeTree, setLanguage, t } = await import('../../js/localization/i18n.js');
const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { InputManager } = await import('../../js/core/input-manager.js');
const { ControllerManager } = await import('../../js/core/controller-manager.js');
const { resolveProfile } = await import('../../js/data/controller-profiles.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { SettingsDialog } = await import('../../js/ui/settings-dialog.js');
const { ConfirmDialog, InfoDialog } = await import('../../js/ui/overlays.js');
const { ControllerDialog } = await import('../../js/ui/controller-dialog.js');
const { ControllerControls } = await import('../../js/ui/controller-editor.js');
const { CONFIG } = await import('../../js/config.js');
const { getCharacter, playableCharacters } = await import('../../js/data/characters.js');
const { fakePad, setButton, padSource, PAD_IDS } = await import('../helpers/fake-gamepad.mjs');
const { stylesheet } = await import('../helpers/stylesheet.mjs');
const { highlight, diagramSVG } = await import('../../js/ui/controller-glyphs.js');

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem(k, v) { map.set(k, String(v)); } };
}

// Home, Settings, Controller Connections and Controller controls on the
// real navigator, InputManager and ControllerManager, over `pads` (none by
// default), as App wires them. poll() is one animation frame.
function boot({ pads = [], api = 'available', storage = memoryStorage() } = {}) {
  // A fresh page: the last test's managers hear nothing more.
  winListeners.clear();
  docListeners.clear();
  document.activeElement = body;
  const settings = new Settings(storage);
  const controllers = new ControllerManager({ source: padSource(pads, api), target: null });
  const input = new InputManager(CONFIG.bindings, {
    controllers, profileFor: (def) => resolveProfile(def, def ? settings.controllerProfile(def.id) : null),
  });
  const app = {
    input, controllers, settings,
    device: { reducedMotion: true },
    audio: { play: noop },
    selection: { characterId: '0002', mode: 'quick-battle' },
    loadCharacter: () => Promise.resolve(null),
    getSprites: () => null,
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const offSettings = followSettings(settings);
  const home = new HomeScreen(app);
  const roots = Object.fromEntries(['settings', 'confirm', 'controller', 'roster', 'editor', 'binding', 'info'].map((k) => [k, new Element('div')]));
  app.settingsDialog = new SettingsDialog(roots.settings, app);
  app.dialog = new ConfirmDialog(roots.confirm, app);
  roots.info.hidden = true;
  app.infoDialog = new InfoDialog(roots.info, app);
  app.controllerDialog = new ControllerDialog(roots.controller, app);
  app.controllerControls = new ControllerControls(app, { roster: roots.roster, editor: roots.editor, binding: roots.binding });
  body.replaceChildren(home.el, ...Object.values(roots));
  const offLanguage = onLanguageChange(() => localizeTree(body));
  app.screens.register(home);
  app.screens.go('home');
  let now = 0;
  const poll = () => input.pollGamepads((now += 16));
  poll();
  const key = (code) => {
    const e = { code, key: code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
    for (const fn of winListeners.get('keydown') ?? []) fn(e);
  };
  const done = () => {
    offSettings();
    offLanguage();
    setLanguage('en');
    pointAt = null;
  };
  return { app, home, settings, controllers, input, pads, storage, roots, poll, key, done };
}

const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
// Whether `node` reads `phrase` (the fake DOM keeps no spacing between
// elements, so spaces are ignored).
const reads = (node, phrase) => node.textContent.replace(/\s+/g, '').includes(phrase.replace(/\s+/g, ''));
const press = (env, button, pad = env.pads[0]) => {
  setButton(pad, button, true);
  env.poll();
  setButton(pad, button, false);
  env.poll();
};

// ---- Home ----------------------------------------------------------------------------------

test('Home\'s controller button is open, keeps its picture, and its indicator follows the connections live: red, green, orange', () => {
  const pads = [];
  const env = boot({ pads });
  try {
    const button = env.home.controllerButton;
    const [, middle] = env.home.utilityButtons.children;
    assert.equal(middle, button, 'the middle of the three buttons');
    assert.equal(button.disabled, false);
    assert.equal(button.hasAttribute('data-nav'), true);
    assert.equal(button.querySelector('img').getAttribute('src'), 'controller.PNG', 'its original picture');
    const badge = env.home.controllerStatus;
    const status = () => [...badge.classNames].filter((c) => c.startsWith('controller-badge--'));
    assert.deepEqual(status(), ['controller-badge--disconnected']);
    assert.equal(button.getAttribute('aria-label'), 'Controller connections: Disconnected');
    assert.equal(badge.getAttribute('aria-hidden'), 'true', 'the words are in the button\'s name');
    pads.push(fakePad());
    env.poll();
    assert.deepEqual(status(), ['controller-badge--connected'], 'one status at a time');
    assert.equal(button.getAttribute('aria-label'), 'Controller connections: Connected');
    for (let i = 1; i < 5; i++) pads.push(fakePad({ index: i, id: PAD_IDS.xboxSeries }));
    env.poll();
    assert.deepEqual(status(), ['controller-badge--tooMany']);
    assert.equal(button.getAttribute('aria-label'), 'Controller connections: Too many controllers');
    env.settings.set('language', 'fr');
    assert.equal(button.getAttribute('aria-label'), 'Connexions des manettes : Trop de manettes');
    pads.length = 0;
    env.poll();
    assert.equal(button.getAttribute('aria-label'), 'Connexions des manettes : Déconnectée');
    // Its styles: green with a check, red with a cross, orange with an
    // exclamation mark, bottom right of the button.
    const css = stylesheet();
    for (const s of ['connected', 'disconnected', 'tooMany']) assert.match(css, new RegExp(`\\.controller-badge--${s}`));
    assert.match(css, /\.controller-badge \{[^}]*position: absolute;[^}]*right: -4px;[^}]*bottom: -4px;/);
  } finally { env.done(); }
});

test('the controller button opens Controller Connections over Home; Back closes it and focus returns to the button', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    env.home.controllerButton.focus();
    env.home.controllerButton.click();
    const dialog = env.app.controllerDialog;
    assert.equal(dialog.isOpen, true);
    assert.equal(env.roots.controller.hidden, false);
    assert.equal(env.roots.controller.getAttribute('role'), 'dialog');
    assert.equal(env.roots.controller.getAttribute('aria-modal'), 'true');
    assert.equal(env.home.el.inert, true, 'Home inert beneath');
    assert.equal(env.app.nav.scopeEl, env.roots.controller);
    env.key('Escape');
    assert.equal(dialog.isOpen, false);
    assert.equal(document.activeElement, env.home.controllerButton);
    assert.equal(env.home.el.inert, false);
    // Circle / B closes it too.
    env.home.controllerButton.click();
    press(env, 'east');
    assert.equal(dialog.isOpen, false);
  } finally { env.done(); }
});

// ---- Controller Connections --------------------------------------------------------------

test('Controller Connections lists each supported controller with its status and assignment, and Player 1 can be changed', () => {
  const pads = [fakePad(), fakePad({ index: 1, id: PAD_IDS.xboxSeries })];
  const env = boot({ pads });
  try {
    env.app.controllerDialog.open();
    const root = env.roots.controller;
    assert.ok(reads(root, 'Status: Connected'));
    assert.ok(reads(root, '2 controllers connected'));
    assert.ok(reads(root, 'Up to 4 controllers can be connected.'));
    const items = root.querySelectorAll('.controller-device');
    assert.equal(items.length, 2);
    assert.ok(reads(items[0], 'Controller 1 — DualSense Wireless Controller'));
    assert.ok(reads(items[0], 'Status Connected'));
    assert.ok(reads(items[0], 'Assignment Player 1'));
    assert.ok(reads(items[1], 'Controller 2 — Xbox Wireless Controller'));
    assert.ok(reads(items[1], 'Assignment Available'));
    assert.equal(items[0].querySelector('.controller-use'), null, 'Player 1 needs no button');
    const use = items[1].querySelector('.controller-use');
    assert.equal(use.getAttribute('aria-label'), 'Use controller 2 for Player 1');
    use.click();
    assert.equal(env.controllers.player1.family, 'xbox');
    const after = root.querySelectorAll('.controller-device');
    assert.ok(reads(after[1], 'Assignment Player 1'));
    assert.ok(reads(after[0], 'Assignment Available'));
    assert.equal(text(root.querySelector('.controller-announcer')), 'Controller 2 now controls Player 1.');
    assert.ok(root.contains(document.activeElement), 'focus stays in the dialog');
    // Only Player 1's controller navigates: the other one's buttons do nothing.
    const scopes = env.app.nav.scopes.length;
    press(env, 'east', pads[0]);
    assert.equal(env.app.controllerDialog.isOpen, true, 'the DualSense is no longer Player 1');
    assert.equal(env.app.nav.scopes.length, scopes);
    press(env, 'east', pads[1]);
    assert.equal(env.app.controllerDialog.isOpen, false);
  } finally { env.done(); }
});

test('the dialog warns past four controllers, lists unsupported devices with why, and updates live as controllers come and go', () => {
  const pads = [0, 1, 2, 3, 4].map((index) => fakePad({ index }));
  pads.push(fakePad({ index: 5, id: PAD_IDS.switchPro }), fakePad({ index: 6, id: PAD_IDS.dualsense, mapping: '' }));
  const env = boot({ pads });
  try {
    env.app.controllerDialog.open();
    const root = env.roots.controller;
    assert.equal(root.dataset.status, 'tooMany');
    const warning = root.querySelector('.controller-warning');
    assert.equal(warning.hidden, false);
    assert.equal(warning.getAttribute('role'), 'alert');
    assert.ok(reads(warning, 'Too many controllers connected'));
    assert.ok(reads(warning, 'ALVA supports up to four connected controllers. Disconnect an extra controller to remove this warning.'));
    const items = root.querySelectorAll('.controller-device');
    assert.ok(reads(items[4], 'Connected, inactive'));
    assert.ok(reads(items[4], 'Inactive (over the limit)'));
    assert.equal(items[4].querySelector('.controller-use'), null, 'an inactive controller cannot be chosen');
    const unsupported = root.querySelector('.controller-list--unsupported');
    assert.equal(unsupported.hidden, false);
    assert.ok(reads(unsupported, 'Nintendo controllers are not supported.'));
    assert.ok(reads(unsupported, 'standard button layout'));
    // A controller disconnected while the dialog is open.
    pads.splice(4);
    env.poll();
    assert.equal(root.dataset.status, 'connected');
    assert.equal(warning.hidden, true);
    assert.equal(root.querySelectorAll('.controller-device').length, 4);
    pads.length = 0;
    env.poll();
    assert.equal(root.dataset.status, 'disconnected');
    assert.ok(reads(root, 'No controller connected'));
    assert.ok(reads(root, 'press any button on it'));
  } finally { env.done(); }
});

test('Reconnect really queries the browser again: a controller exposed after a press appears, the count, indicator and list update, and it says so', () => {
  const pads = [];
  const env = boot({ pads });
  try {
    env.app.controllerDialog.open();
    const reconnect = env.roots.controller.querySelector('.controller-reconnect');
    assert.equal(reconnect.hasAttribute('data-nav'), true);
    assert.match(reconnect.html, /<span>Reconnect<\/span>/);
    assert.match(reconnect.html, /class="icon/, 'its refresh icon');
    reconnect.click();
    assert.equal(text(env.roots.controller.querySelector('.controller-announcer')),
      'Controllers refreshed: no controller found. Press a button on your controller, then try again.');
    pads.push(fakePad());
    reconnect.click();
    assert.equal(env.home.controllerStatus.classList.contains('controller-badge--connected'), true, 'the indicator too');
    assert.equal(env.roots.controller.querySelectorAll('.controller-device').length, 1);
    assert.equal(text(env.roots.controller.querySelector('.controller-announcer')), 'Controllers refreshed: 1 controller connected.');
    assert.equal(env.app.screens.current, env.home, 'nothing reloads');
  } finally { env.done(); }
});

test('no Gamepad API, or access blocked: the dialog says so, and nothing throws', () => {
  for (const api of ['unavailable', 'blocked']) {
    const env = boot({ api });
    try {
      env.app.controllerDialog.open();
      const note = env.roots.controller.querySelector('.controller-api-note');
      assert.equal(note.hidden, false, api);
      assert.equal(text(note), t(`controller.api.${api}`));
      assert.equal(env.home.controllerStatus.classList.contains('controller-badge--disconnected'), true);
    } finally { env.done(); }
  }
});

// ---- The cursor ---------------------------------------------------------------------------

test('the left stick shows the circular cursor in menus; it focuses what it hovers, Cross clicks it, never outside the active scope', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    const cursor = env.app.nav.cursor;
    assert.equal(cursor.visible, false, 'hidden until the stick moves');
    const target = env.home.el.querySelector('.home-why-alva');
    target.rect = { left: 600, top: 340, width: 300, height: 50 };
    pointAt = target;
    env.pads[0].axes = [0.9, 0, 0, 0];
    env.poll();
    assert.equal(cursor.visible, true);
    assert.ok(cursor.el.classList.contains('is-visible'));
    assert.equal(cursor.el.getAttribute('aria-hidden'), 'true');
    const x = cursor.x;
    env.poll();
    assert.ok(cursor.x > x, 'it moves the way the stick points');
    assert.equal(document.activeElement, target, 'hovering focuses, as a mouse does');
    assert.ok(cursor.el.classList.contains('is-hover'));
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    let opened = 0;
    target.addEventListener('click', () => opened++);
    press(env, 'south');
    assert.equal(opened, 1, 'Cross / A activates what the cursor is on');
    assert.equal(env.app.infoDialog.isOpen, true, 'the story opens through the real controller input');
    press(env, 'east');
    assert.equal(env.app.infoDialog.isOpen, false, 'Circle / B closes the story');
    assert.equal(document.activeElement, target);
    // Over a dialog, the item beneath it is out of scope: never clicked.
    env.app.controllerDialog.open();
    pointAt = env.home.actions.play;
    let leaked = 0;
    env.home.actions.play.addEventListener('click', () => leaked++);
    env.pads[0].axes = [0.5, 0.5, 0, 0];
    env.poll();
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    press(env, 'south');
    assert.equal(leaked, 0, 'nothing passes through a dialog');
  } finally { env.done(); }
});

test('the cursor hides for the keyboard, the mouse and play, and follows the D-pad focus', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    const cursor = env.app.nav.cursor;
    env.pads[0].axes = [0.9, 0, 0, 0];
    env.poll();
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    assert.equal(cursor.visible, true);
    env.key('ArrowDown');
    assert.equal(cursor.visible, false, 'the keyboard hides it');
    env.pads[0].axes = [0.9, 0, 0, 0];
    env.poll();
    for (const fn of docListeners.get('pointermove') ?? []) fn({ pointerType: 'mouse', movementX: 3, movementY: 0 });
    assert.equal(cursor.visible, false, 'the mouse hides it');
    env.poll();
    assert.equal(cursor.visible, true);
    env.pads[0].axes = [0, 0, 0, 0];
    // The D-pad moves focus, and the cursor glides after it.
    Object.values(env.home.actions).forEach((b, i) => { b.rect = { left: 80, top: 300 + i * 60, width: 320, height: 44 }; });
    env.home.actions.play.focus();
    setButton(env.pads[0], 'dpadDown', true);
    env.poll();
    setButton(env.pads[0], 'dpadDown', false);
    for (let i = 0; i < 20; i++) env.poll();
    assert.equal(document.activeElement, env.home.actions.watch);
    assert.equal(Math.round(cursor.x), 240);
    assert.equal(Math.round(cursor.y), 382);
    env.input.setGameplayActive(true);
    assert.equal(cursor.visible, false, 'play has no cursor');
  } finally { env.done(); }
});

// ---- Settings › Controls › Controller controls --------------------------------------------

test('Settings › Controls has a Controller controls subsection beside the unchanged Mobile controls', () => {
  const env = boot();
  try {
    const dialog = env.app.settingsDialog;
    const panel = dialog.sections.controls;
    assert.ok(panel.contains(dialog.schemeOptions[0]), 'Mobile controls kept');
    const group = panel.querySelector('.settings-controller-group');
    assert.equal(text(group.querySelector('.settings-subtitle')), 'Controller controls');
    assert.equal(text(group.querySelector('.settings-group-note')),
      'Customize your controller controls for each character individually. Default layouts are designed for comfort and each character’s unique abilities.');
    assert.equal(dialog.controllerButton.getAttribute('aria-haspopup'), 'dialog');
    assert.match(dialog.controllerButton.html, /<span>Customize controller controls<\/span>/);
    env.settings.set('language', 'fr');
    assert.equal(text(group.querySelector('.settings-subtitle')), 'Commandes de la manette');
  } finally { env.done(); }
});

test('Customize controller controls opens the fighter roster: 48 slots, locked ones never open, and choosing never changes the fighter played', async () => {
  const env = boot();
  try {
    env.home.settingsButton.click();
    env.app.settingsDialog.showSection('controls');
    env.app.settingsDialog.controllerButton.click();
    const controls = env.app.controllerControls;
    assert.equal(controls.roster.isOpen, true);
    assert.equal(env.roots.settings.inert, true, 'Settings inert beneath');
    assert.equal(env.app.nav.scopeEl, env.roots.roster);
    const slots = controls.roster.roster.slots;
    assert.equal(slots.length, CONFIG.roster.totalSlots);
    const locked = slots.filter((s) => s.classList.contains('is-locked'));
    assert.equal(locked.length, CONFIG.roster.totalSlots - playableCharacters().length);
    for (const slot of locked) assert.equal(slot.hasAttribute('data-nav'), false, 'a locked slot is no stop');
    controls.edit({ ...getCharacter('0001'), available: false });
    assert.equal(controls.editor.isOpen, false, 'an unplayable fighter has no editor');
    const one = slots.find((s) => s._def?.id === '0001');
    one.click(0);
    assert.equal(controls.editor.isOpen, true);
    assert.equal(controls.editor.def.id, '0001');
    assert.equal(env.app.selection.characterId, '0002', 'the selection is untouched');
    assert.equal(env.roots.roster.inert, true);
    // Back out, layer by layer.
    env.key('Escape');
    assert.equal(controls.editor.isOpen, false);
    assert.equal(controls.roster.isOpen, true);
    env.key('Escape');
    assert.equal(controls.roster.isOpen, false);
    assert.equal(env.roots.settings.inert, false);
    assert.equal(document.activeElement, env.app.settingsDialog.controllerButton, 'focus back on the button');
  } finally { env.done(); }
});

// ---- The editor ----------------------------------------------------------------------------

function openEditor(env, id) {
  env.home.settingsButton.click();
  env.app.settingsDialog.showSection('controls');
  env.app.settingsDialog.controllerButton.click();
  env.app.controllerControls.edit(getCharacter(id));
  return env.app.controllerControls.editor;
}
const rows = (editor) => editor.list.querySelectorAll('.controller-row');
const nameOf = (r) => text(r.querySelector('.controller-row-name').children[0]);
const row = (editor, id) => editor.list.querySelector(`[data-action="${id}"]`);

test('#0001\'s editor: its portrait, name and family, every action by category with its real name, a line on it, its input and activation', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    const editor = openEditor(env, '0001');
    assert.equal(text(editor.name), '#0001');
    assert.equal(text(editor.familyLine), 'PlayStation buttons, from your controller.');
    assert.equal(editor.familyButton.hidden, true, 'with a controller, its family');
    assert.deepEqual(editor.list.querySelectorAll('.controller-category-title').map(text),
      ['Movement', 'Defense', 'Ground attacks', 'Aerial attacks', 'Special abilities', 'Other']);
    const names = rows(editor).map(nameOf);
    assert.deepEqual(names, [
      'Movement', 'Jump', 'Dash / air dash', 'Fast fall', 'Shield', 'Deflect',
      'Jab', 'Red', 'Maximum Blue', 'High Kick', 'Floating Straight', 'Red Kick', 'Blue', 'High Kick',
      'Unlimited Void', 'Hollow Purple', 'Pause',
    ]);
    assert.deepEqual(rows(editor).slice(14, 16).map((r) => text(r.querySelector('.controller-place'))), ['Ground', 'Ground']);
    assert.equal(row(editor, 'ground:attack2').querySelector('.controller-place'), null, 'Red: an ordinary ground attack, no place tag');
    const red = row(editor, 'ground:attack2');
    assert.equal(text(red.querySelector('.controller-row-desc')), 'Fires a repelling projectile that pushes enemies away and turns projectiles around.');
    assert.equal(text(red.querySelector('.controller-chip')), 'R2');
    assert.equal(text(red.querySelector('.controller-row-activation')), 'Press');
    assert.equal(red.getAttribute('aria-label'), 'Change binding: Red. R2, Press.');
    assert.equal(text(row(editor, 'shield').querySelector('.controller-chip')), 'L1');
    assert.equal(text(row(editor, 'shield').querySelector('.controller-row-activation')), 'Hold');
    assert.equal(text(row(editor, 'deflect').querySelector('.controller-chip')), 'L1');
    assert.equal(text(row(editor, 'dash').querySelector('.controller-chip')), 'R1');
    assert.equal(text(row(editor, 'jump').querySelector('.controller-row-activation')), 'Press (with Down held on the ground: Super Jump)');
    assert.equal(text(row(editor, 'fastFall').querySelector('.controller-chip')), 'Left stick down');
    assert.equal(text(row(editor, 'air:attack3').querySelector('.controller-chip')), 'Circle');
    const purple = row(editor, 'ground:attack5');
    assert.equal(text(purple.querySelector('.controller-chip')), 'Right stick forward', 'the right stick, named');
    assert.equal(text(purple.querySelector('.controller-row-activation')), 'Push');
    assert.equal(text(editor.layoutTag), 'Recommended layout');
    assert.equal(editor.provisional.hidden, true, 'a designed layout');
    assert.equal(text(editor.conflicts), 'No conflicts.');
    assert.equal(editor.saveButton.disabled, true, 'nothing to save yet');
  } finally { env.done(); }
});

test('#0002\'s editor in Xbox names: the right stick down is the Bounce Attack, up the Blue Tornado; with no controller the player picks the names', () => {
  const env = boot({ pads: [fakePad({ id: PAD_IDS.xboxSeries })] });
  try {
    const editor = openEditor(env, '0002');
    assert.equal(text(editor.familyLine), 'Xbox buttons, from your controller.');
    assert.equal(text(row(editor, 'air:attack2').querySelector('.controller-chip')), 'Right stick down');
    assert.equal(nameOf(row(editor, 'air:attack2')), 'Bounce Attack');
    assert.equal(text(row(editor, 'air:attack3').querySelector('.controller-chip')), 'Right stick up');
    assert.equal(text(row(editor, 'ground:attack3').querySelector('.controller-chip')), 'B');
    assert.equal(text(row(editor, 'ground:extra_attack').querySelector('.controller-chip')), 'RT');
    assert.equal(text(row(editor, 'dash').querySelector('.controller-chip')), 'RB');
    assert.equal(text(row(editor, 'shield').querySelector('.controller-chip')), 'LB');
    assert.equal(text(row(editor, 'air:attack3').querySelector('.controller-row-desc')), 'Spins upward into a tornado, carrying opponents into the air.');
    assert.equal(row(editor, 'air:attack4'), null, 'no slot it lacks');
  } finally { env.done(); }
  const none = boot();
  try {
    const editor = openEditor(none, '0002');
    assert.equal(text(editor.familyLine), 'No controller connected: showing PlayStation buttons.');
    assert.equal(editor.familyButton.hidden, false);
    editor.familyButton.click();
    assert.equal(text(editor.familyLine), 'No controller connected: showing Xbox buttons.');
    assert.equal(text(row(editor, 'jump').querySelector('.controller-chip')), 'A');
  } finally { none.done(); }
});

// The art beside a row's name: { url, mirrored } of its image, 'glyph'
// for its fallback glyph, or null for no art at all.
function rowArtOf(r) {
  const frame = r.querySelector('.controller-row-art');
  if (!frame) return null;
  if (frame.classList.contains('is-glyph')) return 'glyph';
  const img = frame.querySelector('.controller-row-sprite');
  return { url: img.getAttribute('src'), mirrored: img.classList.contains('is-mirrored') };
}

test('every move row shows its own artwork beside its name, the touch button\'s frame for the ground or the air: #0001 and #0002', () => {
  const expected = {
    '0001': {
      'ground:attack1': 'attack1_4', 'ground:extra_attack': 'extra_attack_4', 'air:attack1': 'midair_attack1_4',
      'air:attack2': 'midair_attack2_4', 'air:attack3': 'midair_attack3_2', 'air:extra_attack': 'extra_attack_4',
      'ground:attack2': 'attack2_object_1', 'ground:attack3': 'attack3_object_1', 'ground:attack4': 'attack4_6',
      'ground:attack5': 'attack5_object_1',
    },
    '0002': {
      'ground:attack1': 'attack1_4', 'ground:attack2': 'attack2_2', 'ground:attack3': 'attack3_5',
      'air:attack1': 'midair_attack1_1', 'air:attack2': 'midair_attack2_5', 'air:attack3': 'midair_attack3_3',
      'ground:extra_attack': 'extra_attack_object_3',
    },
  };
  for (const [id, arts] of Object.entries(expected)) {
    const env = boot();
    try {
      const editor = openEditor(env, id);
      const moves = rows(editor).filter((r) => /^(ground|air):/.test(r.getAttribute('data-action')));
      assert.deepEqual(moves.map((r) => r.getAttribute('data-action')).sort(), Object.keys(arts).sort(), `#${id}: every move row`);
      for (const [action, frame] of Object.entries(arts)) {
        const r = row(editor, action);
        const art = rowArtOf(r);
        assert.deepEqual(art, { url: `./assets/characters/${id}/${id}_${frame}.png`, mirrored: false }, `#${id} ${action}`);
        // Beside its name, before it, decorative only: the row keeps its
        // name, description, binding, label and description link.
        const textCol = r.querySelector('.controller-row-text');
        assert.ok(textCol.classList.contains('has-art'));
        assert.equal(textCol.children[0], r.querySelector('.controller-row-art'), 'the art comes first, beside the name');
        assert.equal(r.querySelector('.controller-row-art').getAttribute('aria-hidden'), 'true');
        assert.equal(r.querySelector('.controller-row-sprite').getAttribute('alt'), '');
        assert.match(r.getAttribute('aria-label'), new RegExp(`^Change binding: ${nameOf(r)}\\. `));
        assert.ok(r.querySelector('.controller-chip'), 'its binding is still shown');
        assert.ok(!r.querySelector('.controller-row-binding').querySelector('.controller-row-art'), 'never over the binding');
      }
      // Movement, Defense and Pause keep their presentation: no art.
      for (const action of ['move', 'jump', 'dash', 'fastFall', 'shield', 'deflect', 'pause']) {
        assert.equal(rowArtOf(row(editor, action)), null, `#${id} ${action}`);
        assert.ok(!row(editor, action).querySelector('.controller-row-text').classList.contains('has-art'));
      }
    } finally { env.done(); }
  }
  // The binding and the art are one row: #0001's Red reads
  // "[art] Red — R2".
  const env = boot({ pads: [fakePad()] });
  try {
    const red = row(openEditor(env, '0001'), 'ground:attack2');
    assert.equal(nameOf(red), 'Red');
    assert.equal(text(red.querySelector('.controller-chip')), 'R2');
    assert.equal(red.getAttribute('aria-label'), 'Change binding: Red. R2, Press.');
  } finally { env.done(); }
});

test('move art mirrors where its clip faces left, falls back to its glyph when it has no frame or fails to load, and reads the same in French', () => {
  const c1 = getCharacter('0001');
  const variant = {
    ...c1, id: 'art-check', displayName: 'Art check', available: false, rosterSlot: null,
    animations: { ...c1.animations, attack1: { ...c1.animations.attack1, sourceFacing: -1 } },
    mobileAbilities: { ...c1.mobileAbilities, extra_attack: { label: 'High Kick', preview: { animation: 'no_such_clip', frame: 0 } } },
  };
  const env = boot();
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(String(msg));
  try {
    openEditor(env, '0001');
    const editor = env.app.controllerControls.editor;
    editor.close();
    editor.open(variant);
    assert.deepEqual(rowArtOf(row(editor, 'ground:attack1')), { url: './assets/characters/0001/0001_attack1_4.png', mirrored: true },
      'its clip faces left: mirrored, so it faces right as the buttons read');
    assert.equal(rowArtOf(row(editor, 'air:attack1')).mirrored, false, 'the mid-air clip is its own');
    // No frame to show: the touch button's own glyph (the ring).
    const kick = row(editor, 'ground:extra_attack');
    assert.equal(rowArtOf(kick), 'glyph');
    assert.match(kick.querySelector('.controller-row-art').innerHTML, /<svg/);
    assert.equal(nameOf(kick), 'High Kick', 'its name unchanged');
    // A file that fails to load: its glyph at once, and never tried again.
    const jab = row(editor, 'ground:attack1');
    jab.querySelector('.controller-row-sprite').dispatch('error');
    assert.equal(rowArtOf(jab), 'glyph');
    assert.ok(warnings.some((w) => w.includes('0001_attack1_4.png')), 'reported');
    editor.renderList();
    assert.equal(rowArtOf(row(editor, 'ground:attack1')), 'glyph', 'still the glyph after a re-render');
    assert.equal(rowArtOf(row(editor, 'air:attack1')).url, './assets/characters/0001/0001_midair_attack1_4.png', 'other art unaffected');
    editor.close();
    // In French: the same art, the names and labels in French.
    env.settings.set('language', 'fr');
    const fr = openEditor(env, '0001');
    const jabFr = row(fr, 'ground:attack1');
    assert.deepEqual(rowArtOf(row(fr, 'ground:attack2')), { url: './assets/characters/0001/0001_attack2_object_1.png', mirrored: false });
    assert.equal(nameOf(jabFr), 'Direct', 'the French name beside the same art');
    assert.equal(rowArtOf(jabFr), 'glyph', 'the file that failed is still not tried again');
    assert.match(jabFr.getAttribute('aria-label'), /^Modifier la commande : Direct\. /);
  } finally {
    console.warn = warn;
    env.done();
  }
});

test('the move art is a fixed square beside the name, crisp and responsive, and never pushes the binding aside', () => {
  const css = stylesheet();
  const rule = (selector) => css.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(rule('.controller-row-text.has-art'), /grid-template-columns: var\(--controller-art\) minmax\(0, 1fr\);/);
  const art = rule('.controller-row-art');
  assert.match(art, /width: var\(--controller-art\);/);
  assert.match(art, /height: var\(--controller-art\);/);
  assert.match(art, /overflow: hidden;/);
  const sprite = rule('.controller-row-sprite');
  assert.match(sprite, /object-fit: contain;/);
  assert.match(sprite, /image-rendering: pixelated;/);
  assert.match(css, /\.controller-row-sprite\.is-mirrored \{ transform: scaleX\(-1\); \}/);
  assert.match(css, /\.controller-row \{ --controller-art: 40px; \}/);
  assert.match(css, /@media \(max-width: 560px\) \{\s*\.controller-row \{[^}]*--controller-art: 34px;/);
  assert.match(css, /@media \(max-height: 520px\) \{\s*\.controller-row \{[^}]*--controller-art: 30px;/);
  // The row's own columns are unchanged: the art lives inside the name's.
  assert.match(css, /\n\.controller-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto;/);
});

test('a binding changed in text (no controller needed), saved for that fighter alone; Cancel asks before discarding', async () => {
  const env = boot();
  try {
    const editor = openEditor(env, '0002');
    row(editor, 'jump').click();
    const binding = env.app.controllerControls.binding;
    assert.equal(binding.isOpen, true);
    assert.equal(env.roots.editor.inert, true);
    assert.equal(text(binding.listenText), 'No controller connected: choose the input below.');
    // Button: Cross -> Circle -> Square -> Triangle.
    const cycler = binding.fields.button.button;
    cycler.focus();
    env.key('ArrowRight');
    env.key('ArrowRight');
    env.key('ArrowRight');
    assert.equal(text(binding.detected), 'Binding: Triangle · Press (with Down held on the ground: Super Jump)');
    // Triangle on the ground is the Rapid Kicks: an error, Confirm off.
    assert.match(text(binding.conflicts), /Jump and Rapid Kicks use the same input \(Triangle\)\./);
    assert.equal(binding.confirmButton.disabled, true);
    env.key('ArrowRight'); // L1: the guard's
    env.key('ArrowRight'); // R1: the Dash's
    env.key('ArrowRight'); // L2: free
    assert.equal(text(binding.detected), 'Binding: L2 · Press (with Down held on the ground: Super Jump)');
    assert.equal(binding.confirmButton.disabled, false);
    binding.confirmButton.click();
    assert.equal(binding.isOpen, false);
    assert.equal(text(row(editor, 'jump').querySelector('.controller-chip')), 'L2');
    assert.equal(text(editor.layoutTag), 'Custom layout');
    assert.equal(editor.saveButton.disabled, false);
    // Cancel with a change asks first; keeping on edits.
    editor.cancelButton.click();
    assert.equal(env.app.dialog.resolve !== null, true, 'asks');
    env.app.dialog.cancelBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(editor.isOpen, true);
    editor.saveButton.click();
    assert.equal(editor.isOpen, false);
    const stored = JSON.parse(env.storage.map.get('alva.settings')).controllerProfiles;
    assert.deepEqual(Object.keys(stored), ['0002'], 'saved under its id alone');
    assert.deepEqual(stored['0002'].jump, { button: 'l2', modifier: null, stick: null, direction: null, activation: 'continuous' });
    assert.equal(env.settings.controllerProfile('0001'), null, '#0001 untouched');
    // It plays that way at once (the next sample reads it).
    const profile = env.input.compiledFor(getCharacter('0002'));
    assert.equal(profile.entries.find((e) => e.id === 'jump').button, 'l2');
  } finally { env.done(); }
});

test('Restore defaults asks, then puts that fighter alone back on its recommended layout', async () => {
  const storage = memoryStorage({
    'alva.settings': JSON.stringify({
      version: 4, language: 'en', mobileControls: 'joystick', touchLayouts: {}, combatAssist: true,
      controllerProfiles: {
        '0001': { jump: { button: 'north', modifier: null, direction: null, activation: 'continuous' }, 'ground:extra_attack': { button: 'south', modifier: null, direction: null, activation: 'press' } },
        '0002': { jump: { button: 'l2', modifier: null, direction: null, activation: 'continuous' } },
      },
    }),
  });
  const env = boot({ storage });
  try {
    const editor = openEditor(env, '0001');
    assert.equal(text(row(editor, 'jump').querySelector('.controller-chip')), 'Triangle', 'loaded after a restart');
    assert.equal(text(editor.layoutTag), 'Custom layout');
    editor.restoreButton.click();
    assert.ok(Number(env.roots.confirm.style.zIndex) > Number(env.roots.editor.style.zIndex), 'the confirmation above the editor');
    assert.equal(env.roots.editor.inert, true, 'the editor inert beneath it');
    assert.equal(text(env.app.dialog.title), 'Restore recommended controls?');
    env.app.dialog.okBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(text(row(editor, 'jump').querySelector('.controller-chip')), 'Cross');
    assert.equal(env.settings.controllerProfile('0001'), null);
    assert.deepEqual(env.settings.controllerProfile('0002').jump.button, 'l2', '#0002 keeps its own');
    assert.equal(text(editor.announcer), '#0001’s recommended controls restored.');
  } finally { env.done(); }
});

// ---- Capturing a binding ---------------------------------------------------------------------

test('the binding dialog listens to the controller: a combination, a direction, retry and cancel; the menus behind hear nothing', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    const editor = openEditor(env, '0001');
    const menu = [];
    const nav = env.app.nav.padCommand.bind(env.app.nav);
    env.app.nav.padCommand = (cmd) => { menu.push(cmd); return nav(cmd); };
    row(editor, 'ground:attack2').click();
    const binding = env.app.controllerControls.binding;
    assert.equal(text(binding.listenText), 'Press your preferred button or combination, or push a stick');
    assert.ok(binding.listen.classList.contains('is-listening'));
    // L2 held, then Circle (back, in a menu), then both let go.
    setButton(env.pads[0], 'l2', true);
    env.poll();
    setButton(env.pads[0], 'east', true);
    env.poll();
    setButton(env.pads[0], 'east', false);
    setButton(env.pads[0], 'l2', false);
    env.poll();
    assert.deepEqual(menu, [], 'no menu command while listening');
    assert.equal(binding.isOpen, true, 'Circle did not close it');
    assert.equal(text(binding.detected), 'Binding: L2 + Circle · Modifier + press');
    assert.equal(text(binding.listenText), 'Input detected. Confirm it, or retry.');
    // Retry: Down + Triangle.
    binding.retryButton.click();
    env.pads[0].axes = [0, 0.9, 0, 0];
    env.poll();
    press(env, 'north');
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    assert.equal(text(binding.detected), 'Binding: Left stick down + Triangle · Press');
    // Retry: the right stick held down, then Square: the direction is the
    // right stick's, named so.
    binding.retryButton.click();
    env.pads[0].axes = [0, 0, 0, 0.9];
    env.poll();
    press(env, 'west');
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    assert.equal(text(binding.detected), 'Binding: Right stick down + Square · Press');
    // Cancel keeps the binding as it was.
    binding.cancelButton.click();
    assert.equal(text(row(editor, 'ground:attack2').querySelector('.controller-chip')), 'R2');
    // After capture the controller drives the menus again.
    row(editor, 'shield').click();
    press(env, 'r1');
    assert.equal(text(binding.detected), 'Binding: R1 · Hold', 'the Shield stays held');
    assert.match(text(binding.conflicts), /Dash \/ air dash and Shield use the same input \(R1\)\./, 'R1 Dashes');
    assert.equal(binding.confirmButton.disabled, true);
    binding.retryButton.click();
    press(env, 'r3');
    assert.equal(text(binding.detected), 'Binding: R3 · Hold');
    press(env, 'south');
    assert.equal(binding.isOpen, false, 'Cross confirmed it');
    assert.equal(text(row(editor, 'shield').querySelector('.controller-chip')), 'R3');
  } finally { env.done(); }
});

test('capturing Fast fall takes a stick direction alone; capturing Movement takes the stick or pad used', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    const editor = openEditor(env, '0002');
    row(editor, 'fastFall').click();
    const binding = env.app.controllerControls.binding;
    env.pads[0].axes = [0, -0.9, 0, 0];
    env.poll();
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    assert.equal(text(binding.detected), 'Binding: Left stick up · Hold');
    binding.cancelButton.click();
    row(editor, 'move').click();
    assert.equal(text(binding.listenText), 'Move the stick or D-pad you want to move with');
    setButton(env.pads[0], 'dpadLeft', true);
    env.poll();
    setButton(env.pads[0], 'dpadLeft', false);
    env.poll();
    assert.equal(text(binding.detected), 'Binding: D-pad · —');
    binding.confirmButton.click();
    assert.equal(text(row(editor, 'move').querySelector('.controller-chip')), 'D-pad');
  } finally { env.done(); }
});

test('capturing a stick input: either stick pushed and let go is the input itself, a button held through it its modifier; the diagram lights that stick', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    const editor = openEditor(env, '0001');
    row(editor, 'ground:attack3').click();
    const binding = env.app.controllerControls.binding;
    // The right stick up and back: Maximum Blue on it.
    env.pads[0].axes = [0, 0, 0, -0.9];
    env.poll();
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    assert.equal(text(binding.detected), 'Binding: Right stick up · Push');
    // L2 held, then the right stick left and back: L2 + Right stick left.
    binding.retryButton.click();
    setButton(env.pads[0], 'l2', true);
    env.poll();
    env.pads[0].axes = [0, 0, -0.9, 0];
    env.poll();
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    setButton(env.pads[0], 'l2', false);
    env.poll();
    assert.equal(text(binding.detected), 'Binding: L2 + Right stick left · Modifier + push');
    // Drift never counts: a stick resting off centre and a tap of Triangle is Triangle.
    binding.retryButton.click();
    env.pads[0].axes = [0, 0, 0.2, 0.2];
    env.poll();
    press(env, 'north');
    env.pads[0].axes = [0, 0, 0, 0];
    env.poll();
    assert.equal(text(binding.detected), 'Binding: Triangle · Press');
    binding.cancelButton.click();
    // In text, with no controller: the stick alone, its stick and its direction.
    row(editor, 'ground:attack4').click();
    binding.stopListening();
    const fields = binding.fields;
    assert.equal(fields.direction.row.hidden, true, 'no direction to choose without a stick');
    fields.button.button.focus();
    env.key('ArrowLeft'); // L2 -> R1 ... back to "None (stick only)"
    while (fields.button.current !== null) env.key('ArrowLeft');
    assert.equal(text(fields.button.value), 'None (stick only)');
    assert.equal(fields.direction.row.hidden, false);
    assert.equal(fields.stick.current, 'rightStick', 'the right stick, by default');
    fields.direction.button.focus();
    while (fields.direction.current !== 'down') env.key('ArrowRight');
    assert.equal(text(binding.detected), 'Binding: Right stick down · Push');
    binding.confirmButton.click();
    assert.equal(text(row(editor, 'ground:attack4').querySelector('.controller-chip')), 'Right stick down');
  } finally { env.done(); }
});

// A stand-in for the diagram's SVG: its buttons and its sticks (each with
// its arrow), found by their data attributes as highlight() looks for them.
function fakeDiagram() {
  const classes = () => {
    const set = new Set();
    return { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)), contains: (c) => set.has(c), set };
  };
  const node = (attr, value) => ({ attr, value, classList: classes(), arrow: attr === 'stick' && value !== 'dpad' ? { textContent: '' } : null, querySelector() { return this.arrow; } });
  const nodes = [
    ...['south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'].map((b) => node('button', b)),
    node('stick', 'leftStick'), node('stick', 'rightStick'), node('stick', 'dpad'),
  ];
  return {
    of: (attr, value) => nodes.find((n) => n.attr === attr && n.value === value),
    querySelector(sel) {
      const m = sel.match(/\[data-pad-(button|stick)="(\w+)"\]/);
      return nodes.find((n) => n.attr === m[1] && n.value === m[2]) ?? null;
    },
    querySelectorAll(sel) {
      if (sel === '.pad-arrow') return nodes.filter((n) => n.arrow).map((n) => n.arrow);
      return nodes.filter((n) => [...n.classList.set].some((c) => sel.includes(`.${c}`)));
    },
  };
}

test('the diagram lights either stick on its own, with its direction: the right stick never shown as the left', () => {
  assert.match(diagramSVG('playstation'), /data-pad-stick="leftStick"/);
  assert.match(diagramSVG('playstation'), /data-pad-stick="rightStick"/);
  const svg = fakeDiagram();
  const b = (button, extra = {}) => ({ button, modifier: null, stick: null, direction: null, activation: 'press', ...extra });
  highlight(svg, b(null, { stick: 'rightStick', direction: 'up' }));
  assert.ok(svg.of('stick', 'rightStick').classList.contains('is-on'), 'a stick input: the right stick lit as the input');
  assert.ok(svg.of('stick', 'rightStick').classList.contains('is-dir'));
  assert.equal(svg.of('stick', 'rightStick').arrow.textContent, '↑');
  assert.ok(!svg.of('stick', 'leftStick').classList.contains('is-dir'), 'never the left stick');
  assert.equal(svg.of('stick', 'leftStick').arrow.textContent, '');
  // A direction held with a button: the button lit, the stick marked with its arrow.
  highlight(svg, b('west', { modifier: 'r2', stick: 'leftStick', direction: 'down' }));
  assert.ok(svg.of('button', 'west').classList.contains('is-on'));
  assert.ok(svg.of('button', 'r2').classList.contains('is-mod'));
  assert.ok(svg.of('stick', 'leftStick').classList.contains('is-dir'));
  assert.ok(!svg.of('stick', 'leftStick').classList.contains('is-on'), 'the stick is a condition, not the input');
  assert.equal(svg.of('stick', 'leftStick').arrow.textContent, '↓');
  assert.ok(!svg.of('stick', 'rightStick').classList.contains('is-dir'), 'the last binding is cleared');
  assert.equal(svg.of('stick', 'rightStick').arrow.textContent, '');
  // Forward, without a fighter to face: »; the D-pad's sides by its buttons.
  highlight(svg, b(null, { stick: 'rightStick', direction: 'forward' }));
  assert.equal(svg.of('stick', 'rightStick').arrow.textContent, '»');
  highlight(svg, b('west', { stick: 'dpad', direction: 'horizontal' }));
  assert.ok(svg.of('stick', 'dpad').classList.contains('is-dir'));
  assert.ok(svg.of('button', 'dpadLeft').classList.contains('is-side') && svg.of('button', 'dpadRight').classList.contains('is-side'));
  // Movement: the source.
  highlight(svg, { source: 'rightStick' });
  assert.ok(svg.of('stick', 'rightStick').classList.contains('is-dir'));
  assert.ok(!svg.of('stick', 'leftStick').classList.contains('is-dir'));
});

// ---- Languages ------------------------------------------------------------------------------

test('the editor, the binding dialog and Controller Connections read in French', () => {
  const env = boot({ pads: [fakePad()] });
  try {
    env.settings.set('language', 'fr');
    env.app.controllerDialog.open();
    assert.ok(reads(env.roots.controller, 'Connexions des manettes'));
    assert.ok(reads(env.roots.controller, '1 manette connectée'));
    assert.ok(reads(env.roots.controller, 'Attribution Joueur 1'));
    env.app.controllerDialog.close();
    const editor = openEditor(env, '0001');
    assert.equal(text(editor.familyLine), 'Boutons PlayStation, d’après votre manette.');
    assert.equal(nameOf(row(editor, 'ground:attack1')), 'Direct');
    assert.equal(text(row(editor, 'ground:attack1').querySelector('.controller-chip')), 'Carré');
    assert.equal(text(row(editor, 'ground:attack2').querySelector('.controller-row-desc')),
      'Tire un projectile répulsif qui repousse les ennemis et renvoie les projectiles.');
    assert.equal(text(row(editor, 'fastFall').querySelector('.controller-chip')), 'Joystick gauche vers le bas');
    assert.deepEqual(editor.list.querySelectorAll('.controller-category-title').map(text),
      ['Déplacement', 'Défense', 'Attaques au sol', 'Attaques aériennes', 'Capacités spéciales', 'Autres']);
  } finally { env.done(); }
});

test('the controller stylesheet: the dialogs over Settings share one layer (the dialog stack orders them), a responsive editor, a cursor that never takes the pointer', () => {
  const css = stylesheet();
  const [, selectors, body] = css.match(/\n(\.dialog-overlay,[^{]*)\{([^}]*)\}/);
  for (const overlay of ['settings-overlay', 'controller-overlay', 'controller-roster-overlay', 'controller-editor-overlay', 'binding-overlay']) {
    assert.match(selectors, new RegExp(`\\.${overlay}\\b`), overlay);
    assert.doesNotMatch(css, new RegExp(`(?<!,)\\n\\.${overlay} \\{[^}]*z-index`), `${overlay} has no fixed place of its own`);
  }
  assert.match(body, /z-index: 60;/);
  assert.match(body, /background: var\(--scrim\);/);
  assert.match(css, /\.controller-cursor \{[^}]*pointer-events: none;/);
  assert.match(css, /@media \(max-width: 760px\)[^{]*\{[^}]*\.controller-editor-body \{ grid-template-columns: 1fr;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  for (const id of ['controller-dialog', 'controller-roster', 'controller-editor', 'binding-dialog']) assert.match(html, new RegExp(`id="${id}"`));
});
