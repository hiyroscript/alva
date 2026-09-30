// Run with node --test tests/settings.test.mjs (no dependencies).
// Settings: the versioned settings store (schema 2: language, Mobile
// Controls and each scheme's custom touch layout; the version 1 migration;
// the safe fallback for missing, corrupt, foreign or blocked storage), the
// first-launch language chooser, Home's Settings gear, and the Settings
// dialog it opens over Home (modal semantics, its navigation scope, focus,
// exactly the Language and Controls sections, both choices saved at once),
// plus what the Settings screen and Help left behind: nothing. On a minimal
// fake DOM; layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

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

const {
  Settings, SETTINGS_KEY, SETTINGS_VERSION, DEFAULT_SETTINGS, LANGUAGES, DEFAULT_LANGUAGE, MOBILE_CONTROLS, DEFAULT_MOBILE_CONTROLS,
  readSettings,
} = await import('../js/core/settings.js');
const { t, followSettings, onLanguageChange, localizeTree, getLanguage, setLanguage } = await import('../js/core/i18n.js');
const { ScreenManager, Screen } = await import('../js/core/screen-manager.js');
const { App } = await import('../js/core/app.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { HomeScreen } = await import('../js/screens/home-screen.js');
const { SettingsDialog } = await import('../js/ui/settings-dialog.js');
const { LanguageDialog } = await import('../js/ui/language-dialog.js');
const { TouchLayoutEditor } = await import('../js/ui/touch-layout-editor.js');
const { ICONS } = await import('../js/ui/icons.js');
const creditsModule = await import('../js/ui/credits.js');
const { CREDITS, creditsText } = creditsModule;
const { CONFIG } = await import('../js/config.js');
const { CHARACTERS } = await import('../js/data/characters.js');
const { TEST_A, withTestFighters } = await import('./test-fighters.mjs');

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

// Every .js file under js/.
function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
      else if (entry.name.endsWith('.js')) files.push(`${dir}${entry.name}`);
    }
  };
  walk('js/');
  return files;
}

// A localStorage stand-in: a Map, or one that throws on every call.
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    writes: 0,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { this.writes++; map.set(k, String(v)); },
  };
}
const blockedStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
};
const stored = (storage) => JSON.parse(storage.map.get(SETTINGS_KEY));

// Keyboard input: key() runs a keydown through every listener, as the app does.
function fakeInput() {
  const listeners = new Set();
  return {
    onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onPadMenu: noop,
    key(code) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
      for (const fn of [...listeners]) fn(e);
      return e;
    },
  };
}

// Home, the Settings dialog and the touch layout editor on the real
// ScreenManager and MenuNavigator, starting on Home, with settings kept in
// `storage` and the language following them as App wires it. Reduced
// motion, so screens swap without timers.
function boot(storage = memoryStorage()) {
  const app = {
    input: fakeInput(),
    device: { reducedMotion: true },
    audio: { play: noop },
    settings: new Settings(storage),
    selection: { characterId: null },
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const offSettings = followSettings(app.settings);
  const home = new HomeScreen(app);
  const dialogRoot = new Element('div');
  const editorRoot = new Element('div');
  app.settingsDialog = new SettingsDialog(dialogRoot, app);
  app.touchEditor = new TouchLayoutEditor(editorRoot, app);
  body.replaceChildren(home.el, dialogRoot, editorRoot);
  const offLanguage = onLanguageChange(() => localizeTree(body));
  app.screens.register(home);
  app.screens.go('home');
  const dialog = app.settingsDialog;
  // Put the language back for the next test.
  const done = () => {
    offSettings();
    offLanguage();
    setLanguage('en');
  };
  return { app, home, dialog, storage, done };
}

const place = (el, left, top, width, height) => { el.rect = { left, top, width, height }; };
const languageNamed = (dialog, language) => dialog.languageOptions.find((o) => o.getAttribute('data-language') === language);
const schemeNamed = (dialog, scheme) => dialog.schemeOptions.find((o) => o.getAttribute('data-mobile-controls') === scheme);
const checked = (options) => options.map((o) => o.getAttribute('aria-checked'));

// ---- The settings store ---------------------------------------------------------

test('schema 2: language (unchosen), Mobile Controls (Joystick) and an empty custom layout per scheme by default', () => {
  assert.equal(SETTINGS_KEY, 'alva.settings');
  assert.equal(SETTINGS_VERSION, 2);
  assert.deepEqual([...LANGUAGES], ['en', 'fr']);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.deepEqual([...MOBILE_CONTROLS], ['joystick', 'classic']);
  assert.equal(DEFAULT_MOBILE_CONTROLS, 'joystick');
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), {
    language: null, mobileControls: 'joystick', touchLayouts: { joystick: {}, classic: {} },
  });
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS) && Object.isFrozen(DEFAULT_SETTINGS.touchLayouts));
  const storage = memoryStorage();
  const settings = new Settings(storage);
  assert.equal(settings.languageChosen, false, 'a fresh device has no language choice yet');
  assert.equal(settings.language, 'en', 'English is used meanwhile, but it is not a choice');
  assert.equal(settings.get('language'), null);
  assert.equal(settings.mobileControls, 'joystick');
  assert.deepEqual(settings.touchLayout('joystick'), {});
  assert.deepEqual(settings.touchLayout('classic'), {});
  assert.equal(storage.writes, 0, 'nothing written just by reading');
});

test('choosing English or French is saved as a real choice; a reload keeps it', () => {
  for (const language of ['en', 'fr']) {
    const storage = memoryStorage();
    const settings = new Settings(storage);
    const heard = [];
    settings.onChange((name, value) => heard.push([name, value]));
    assert.equal(settings.set('language', language), true);
    assert.equal(settings.languageChosen, true, `${language}: chosen`);
    assert.equal(settings.language, language);
    assert.deepEqual(heard, [['language', language]]);
    assert.deepEqual(stored(storage), {
      version: 2, language, mobileControls: 'joystick', touchLayouts: { joystick: {}, classic: {} },
    });
    assert.deepEqual([...storage.map.keys()], [SETTINGS_KEY], 'one key, nothing scattered');
    const again = new Settings(storage);
    assert.equal(again.languageChosen, true, `${language}: a returning player`);
    assert.equal(again.language, language);
  }
  // Choosing English on purpose is not the same as English by default.
  const storage = memoryStorage();
  new Settings(storage).set('language', 'en');
  assert.equal(new Settings(storage).languageChosen, true);
  assert.equal(new Settings(memoryStorage()).languageChosen, false);
});

test('a Mobile Controls choice is saved in the same object and read back', () => {
  const storage = memoryStorage();
  const settings = new Settings(storage);
  const heard = [];
  const off = settings.onChange((name, value) => heard.push([name, value]));
  assert.equal(settings.set('mobileControls', 'classic'), true);
  assert.equal(settings.mobileControls, 'classic');
  assert.equal(stored(storage).mobileControls, 'classic');
  assert.deepEqual(heard, [['mobileControls', 'classic']]);
  // Setting the same value again is no change: nothing written or announced.
  const writes = storage.writes;
  settings.set('mobileControls', 'classic');
  assert.equal(storage.writes, writes);
  assert.equal(heard.length, 1);
  off();
  settings.mobileControls = 'joystick';
  assert.equal(heard.length, 1, 'unsubscribed');
  settings.set('mobileControls', 'classic');
  assert.equal(new Settings(storage).mobileControls, 'classic');
});

test('version 1 settings migrate: the Joystick / Classic choice survives, the language is still to be chosen', () => {
  for (const scheme of ['joystick', 'classic']) {
    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 1, mobileControls: scheme }) });
    const settings = new Settings(storage);
    assert.equal(settings.mobileControls, scheme, `${scheme} kept`);
    assert.equal(settings.languageChosen, false, 'the chooser still shows once after the update');
    assert.deepEqual(settings.touchLayout('joystick'), {});
    assert.deepEqual(settings.touchLayout('classic'), {});
    // The next save writes the new schema, the choice still there.
    settings.set('language', 'fr');
    assert.deepEqual(stored(storage), { version: 2, language: 'fr', mobileControls: scheme, touchLayouts: { joystick: {}, classic: {} } });
  }
  // A version 1 object never had a language or layouts: any found are ignored.
  assert.deepEqual(readSettings({ version: 1, mobileControls: 'classic', language: 'fr', touchLayouts: { classic: { jump: { x: 0.5, y: 0.5, scale: 1 } } } }),
    { language: null, mobileControls: 'classic', touchLayouts: { joystick: {}, classic: {} } });
  // And its own value is still checked.
  assert.equal(readSettings({ version: 1, mobileControls: 'dpad' }).mobileControls, 'joystick');
});

test('unknown values are refused and never stored', () => {
  const storage = memoryStorage();
  const settings = new Settings(storage);
  for (const bad of ['Joystick', 'buttons', '', null, undefined, 1, {}]) {
    assert.equal(settings.set('mobileControls', bad), false, String(bad));
  }
  for (const bad of ['EN', 'de', 'french', '', null, undefined, 0, {}]) {
    assert.equal(settings.set('language', bad), false, `language ${String(bad)}`);
  }
  assert.equal(settings.set('volume', 3), false, 'no such setting');
  assert.equal(settings.set('touchLayouts', {}), false, 'layouts have their own setter');
  assert.equal(settings.setTouchLayout('dpad', {}), false, 'no such scheme');
  assert.equal(settings.mobileControls, 'joystick');
  assert.equal(settings.languageChosen, false);
  assert.equal(storage.writes, 0);
});

test('missing, corrupt, foreign or invalid stored settings fall back safely, value by value', () => {
  const load = (raw) => new Settings(memoryStorage(raw === undefined ? {} : { [SETTINGS_KEY]: raw }));
  const defaults = (settings, why) => {
    assert.equal(settings.mobileControls, 'joystick', why);
    assert.equal(settings.languageChosen, false, why);
    assert.deepEqual(settings.touchLayout('joystick'), {}, why);
  };
  defaults(load(undefined), 'nothing stored');
  defaults(load('{not json'), 'corrupt JSON');
  defaults(load('null'), 'null');
  defaults(load('"classic"'), 'not an object');
  defaults(load('[]'), 'an array');
  defaults(load(JSON.stringify({ mobileControls: 'classic', language: 'fr' })), 'no version');
  defaults(load(JSON.stringify({ version: 3, mobileControls: 'classic', language: 'fr' })), 'a future version');
  defaults(load(JSON.stringify({ version: '2', mobileControls: 'classic', language: 'fr' })), 'a version that is not a number');
  // Within version 2, each value on its own.
  const partial = load(JSON.stringify({ version: 2, language: 'de', mobileControls: 'classic', touchLayouts: 'big' }));
  assert.equal(partial.languageChosen, false, 'an unknown language is no choice');
  assert.equal(partial.mobileControls, 'classic', 'a valid neighbour is kept');
  assert.deepEqual(partial.touchLayout('classic'), {});
  const other = load(JSON.stringify({ version: 2, language: 'fr', mobileControls: 'CLASSIC' }));
  assert.equal(other.language, 'fr');
  assert.equal(other.mobileControls, 'joystick');
  // A bad stored value is replaced cleanly by the next choice.
  const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
  new Settings(storage).set('mobileControls', 'classic');
  assert.deepEqual(stored(storage), { version: 2, language: null, mobileControls: 'classic', touchLayouts: { joystick: {}, classic: {} } });
});

test('custom layouts are checked: malformed objects, unknown ids, non-finite coordinates and out-of-range scales never get through', () => {
  const raw = {
    version: 2, language: 'en', mobileControls: 'classic',
    touchLayouts: {
      joystick: {
        stick: { x: 0.2, y: 0.8, scale: 1.25 },
        jump: { x: 1.7, y: -3, scale: 9 }, // pulled onto the edges and the largest size
        shield: { x: 0.5, y: 0.5, scale: 0.1 }, // the smallest size
        attack1: { x: Infinity, y: 0.5, scale: 1 }, // dropped
        attack2: { x: 0.5, y: Number.NaN, scale: 1 }, // (NaN is null in JSON) dropped
        transform: { x: '0.5', y: 0.5, scale: 1 }, // dropped
        extra_attack: { x: 0.5, y: 0.5 }, // no scale: dropped
        runLeft: { x: 0.5, y: 0.5, scale: 1 }, // not a joystick control: dropped
        __proto__: { x: 0.5, y: 0.5, scale: 1 },
        charge: [0.5, 0.5, 1], // dropped
        mouvementLeft: null, // dropped
      },
      classic: 'not a layout',
      extra: { jump: { x: 0.5, y: 0.5, scale: 1 } },
    },
  };
  const settings = new Settings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify(raw) }));
  assert.deepEqual(settings.touchLayout('joystick'), {
    stick: { x: 0.2, y: 0.8, scale: 1.25 },
    shield: { x: 0.5, y: 0.5, scale: 0.7 },
    jump: { x: 1, y: 0, scale: 1.8 },
  });
  assert.deepEqual(Object.keys(settings.touchLayout('joystick')), ['stick', 'shield', 'jump'], 'in the scheme\'s own order');
  assert.deepEqual(settings.touchLayout('classic'), {});
  assert.deepEqual(Object.keys(settings.get('touchLayouts')), ['joystick', 'classic'], 'no other scheme is kept');
  assert.deepEqual(settings.touchLayout('extra'), {});
  // Setting one checks it the same way.
  settings.setTouchLayout('classic', { runLeft: { x: -1, y: 2, scale: 0 }, stick: { x: 0.5, y: 0.5, scale: 1 }, jump: 'x' });
  assert.deepEqual(settings.touchLayout('classic'), { runLeft: { x: 0, y: 1, scale: 0.7 } });
  // A copy each time: changing it changes nothing stored.
  settings.touchLayout('classic').runLeft.x = 0.9;
  assert.equal(settings.touchLayout('classic').runLeft.x, 0);
});

test('custom positions and sizes round-trip, each scheme on its own, and Reset empties only that scheme', () => {
  const storage = memoryStorage();
  const settings = new Settings(storage);
  const heard = [];
  settings.onChange((name, value) => heard.push([name, value]));
  const joystick = { stick: { x: 0.31, y: 0.72, scale: 1.4 }, jump: { x: 0.9, y: 0.4, scale: 0.8 } };
  const classic = { runRight: { x: 0.12, y: 0.55, scale: 1.1 } };
  assert.equal(settings.setTouchLayout('joystick', joystick), true);
  assert.equal(settings.setTouchLayout('classic', classic), true);
  assert.deepEqual(heard.map(([name, value]) => [name, value.scheme]), [['touchLayouts', 'joystick'], ['touchLayouts', 'classic']]);
  const again = new Settings(storage);
  assert.deepEqual(again.touchLayout('joystick'), joystick);
  assert.deepEqual(again.touchLayout('classic'), classic);
  assert.deepEqual(stored(storage).touchLayouts, { joystick, classic });
  // Independent: changing one leaves the other as it was.
  again.setTouchLayout('classic', { runRight: { x: 0.2, y: 0.5, scale: 1 } });
  assert.deepEqual(new Settings(storage).touchLayout('joystick'), joystick);
  // The same layout again is no change.
  const writes = storage.writes;
  again.setTouchLayout('joystick', joystick);
  assert.equal(storage.writes, writes);
  // Reset: that scheme only.
  assert.equal(again.resetTouchLayout('joystick'), true);
  const after = new Settings(storage);
  assert.deepEqual(after.touchLayout('joystick'), {});
  assert.deepEqual(after.touchLayout('classic'), { runRight: { x: 0.2, y: 0.5, scale: 1 } });
  // Switching schemes keeps each one's layout.
  after.set('mobileControls', 'classic');
  after.set('mobileControls', 'joystick');
  assert.deepEqual(after.touchLayout('classic'), { runRight: { x: 0.2, y: 0.5, scale: 1 } });
});

test('blocked or absent storage never breaks the game: defaults, and choices last for the visit', () => {
  for (const storage of [blockedStorage, null]) {
    const settings = new Settings(storage);
    assert.equal(settings.mobileControls, 'joystick');
    assert.equal(settings.languageChosen, false);
    assert.equal(settings.set('mobileControls', 'classic'), true);
    assert.equal(settings.set('language', 'fr'), true);
    assert.equal(settings.setTouchLayout('classic', { jump: { x: 0.5, y: 0.5, scale: 1.2 } }), true);
    assert.equal(settings.mobileControls, 'classic', 'kept in memory');
    assert.equal(settings.language, 'fr');
    assert.equal(settings.languageChosen, true);
    assert.deepEqual(settings.touchLayout('classic'), { jump: { x: 0.5, y: 0.5, scale: 1.2 } });
  }
  // The default store is the browser's localStorage; none at all, or one
  // whose accessor throws, is no store.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stub = (desc) => Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...desc });
  try {
    const browser = memoryStorage();
    stub({ value: browser });
    new Settings().set('mobileControls', 'classic');
    assert.equal(stored(browser).mobileControls, 'classic');
    stub({ value: undefined });
    assert.equal(new Settings().storage, null);
    assert.equal(new Settings().mobileControls, 'joystick');
    stub({ get() { throw new Error('SecurityError'); } });
    assert.equal(new Settings().storage, null);
    assert.equal(new Settings().mobileControls, 'joystick');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
});

test('only the settings module touches localStorage or sessionStorage', () => {
  const users = sourceFiles().filter((f) => /localStorage|sessionStorage/.test(read(f)));
  assert.deepEqual(users, ['js/core/settings.js']);
  assert.doesNotMatch(read('js/core/settings.js'), /sessionStorage/);
});

// ---- First launch -----------------------------------------------------------------

function languageApp(storage = memoryStorage()) {
  const app = { input: fakeInput(), device: { reducedMotion: true }, audio: { play: noop }, settings: new Settings(storage) };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const root = new Element('div');
  root.hidden = true;
  app.languageDialog = new LanguageDialog(root, app);
  return { app, root, dialog: app.languageDialog, storage };
}

test('first launch asks once for English or Français, after the intro; a returning player is never asked', async () => {
  const { app, root, dialog, storage } = languageApp();
  let chosen = null;
  const waiting = dialog.ensureChosen().then((language) => { chosen = language; });
  assert.equal(root.hidden, false, 'shown to a new player');
  assert.equal(app.screens.current, null, 'dialog does not navigate; App owns startup ordering');
  // Modal, labelled in both languages at once, with exactly two choices.
  assert.equal(root.getAttribute('role'), 'dialog');
  assert.equal(root.getAttribute('aria-modal'), 'true');
  const title = root.querySelector('.language-title');
  assert.equal(root.getAttribute('aria-labelledby'), title.getAttribute('id'));
  assert.equal(title.textContent, 'Language · Langue');
  assert.equal(root.querySelector('.language-prompt').textContent, 'Choose your language · Choisissez votre langue');
  assert.deepEqual(dialog.options.map((o) => o.textContent), ['English', 'Français']);
  assert.deepEqual(dialog.options.map((o) => o.getAttribute('lang')), ['en', 'fr']);
  for (const option of dialog.options) {
    assert.equal(option.tagName, 'BUTTON');
    assert.equal(option.hasAttribute('data-nav'), true, 'keyboard and gamepad reach it');
  }
  // Its own navigation scope: arrows move between the two, Back goes nowhere.
  assert.equal(app.nav.scopes.at(-1), dialog.scope);
  assert.ok(root.contains(document.activeElement), 'focus is inside');
  dialog.options.forEach((o, i) => place(o, 100 + i * 220, 200, 200, 50));
  dialog.options[0].focus();
  app.input.key('ArrowRight');
  assert.equal(document.activeElement, dialog.options[1]);
  app.input.key('Escape');
  assert.equal(root.hidden, false, 'a language is required');
  // Choosing: saved through Settings, the scope removed, focus out of it.
  document.activeElement.click();
  await waiting;
  assert.equal(chosen, 'fr');
  assert.equal(root.hidden, true);
  assert.equal(app.nav.scopes.includes(dialog.scope), false);
  assert.equal(root.contains(document.activeElement), false);
  assert.equal(stored(storage).language, 'fr');
  // The next launch on this device goes straight on.
  const again = languageApp(storage);
  const language = await again.dialog.ensureChosen();
  assert.equal(language, 'fr');
  assert.equal(again.root.hidden, true, 'never shown again');
  assert.deepEqual(again.app.nav.scopes, []);
});

test('the language chooser saves through the Settings store only, even when storage is blocked', async () => {
  const code = read('js/ui/language-dialog.js');
  assert.match(code, /this\.app\.settings\.set\('language', language\)/);
  assert.doesNotMatch(code, /localStorage|sessionStorage|setItem/);
  const { app, dialog } = languageApp(blockedStorage);
  const waiting = dialog.ensureChosen();
  dialog.optionFor('en').click();
  assert.equal(await waiting, 'en');
  assert.equal(app.settings.languageChosen, true, 'kept for this visit');
  assert.equal(app.settings.language, 'en');
});

test('App.start enters splash directly; language selection belongs to the continuation', () => {
  const start = App.prototype.start.toString();
  assert.match(start, /s\.go\('splash'\)/);
  assert.doesNotMatch(start, /ensureChosen|languageDialog/);
});

// Application startup uses the real mandatory dialog and navigation reset.
test('post-splash continuation enters Home once, asks there, then restores focus without replaying onboarding', async () => {
  for (const language of ['en', 'fr']) {
    const { app, dialog, root } = languageApp();
    const unfollow = followSettings(app.settings);
    const splash = new Screen(app, 'splash');
    splash.navigable = false;
    const home = new Screen(app, 'home');
    let entries = 0;
    home.enter = () => {
      entries++;
      assert.equal(dialog.isOpen, false);
    };
    let focuses = 0;
    home.focusDefault = () => { focuses++; };
    app.screens.register(splash);
    app.screens.register(home);
    app.screens.go('splash');
    assert.equal(root.hidden, true);
    assert.deepEqual(app.nav.scopes, []);
    const waiting = App.prototype.continueAfterSplash.call(app, () => app.screens.current === splash);
    await Promise.resolve();
    assert.equal(entries, 1);
    assert.equal(app.screens.current, home);
    assert.equal(home.el.hidden, false);
    assert.equal(home.el.inert, true);
    assert.equal(root.hidden, false);
    dialog.scope.onBack();
    dialog.choose('invalid');
    assert.equal(entries, 1);
    assert.equal(dialog.isOpen, true);
    dialog.choose(language);
    dialog.choose(language);
    await waiting;
    assert.equal(entries, 1);
    assert.equal(getLanguage(), language);
    assert.equal(home.el.inert, false);
    assert.equal(focuses, 2, 'Home focus restored after choosing');
    assert.deepEqual(app.nav.scopes, []);
    assert.equal(app.screens.current, home);
    assert.deepEqual(app.screens.stack, []);
    assert.equal(app.screens.back(), false);
    app.screens.go('home', {}, { reset: true });
    assert.equal(dialog.isOpen, false, 'revisiting Home does not ask again');
    await dialog.ensureChosen();
    assert.equal(root.hidden, true);
    unfollow();
  }
  setLanguage('en');
});

test('returning player continues directly without opening or focusing the language dialog', async () => {
  const { app, dialog, root } = languageApp(memoryStorage({
    [SETTINGS_KEY]: JSON.stringify({ version: SETTINGS_VERSION, language: 'fr' }),
  }));
  dialog.open = () => assert.fail('returning player must never open the chooser');
  const focus = document.activeElement;
  const calls = [];
  app.screens.go = (...args) => calls.push(args);
  await App.prototype.continueAfterSplash.call(app, () => true);
  assert.deepEqual(calls, [['home', {}, { reset: true }]]);
  assert.equal(root.hidden, true);
  assert.equal(document.activeElement, focus);
  assert.deepEqual(app.nav.scopes, []);
});

test('stale continuation cannot enter Home or open the chooser', async () => {
  const { app, root } = languageApp();
  app.screens.go = () => assert.fail('stale splash must not navigate');
  await App.prototype.continueAfterSplash.call(app, () => false);
  assert.equal(root.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
});

test('choosing after navigation does not restore focus to an inactive Home', async () => {
  const { app, dialog } = languageApp();
  const home = new Screen(app, 'home');
  app.screens.current = home;
  home.focusDefault = () => assert.fail('inactive Home must not receive focus');
  const waiting = dialog.ensureChosen();
  app.screens.current = null;
  dialog.choose('fr');
  await waiting;
  assert.equal(home.el.inert, true);
  assert.equal(dialog.background, null);
});

// ---- Home's Settings gear ------------------------------------------------------------

test('Home has four menu actions and a separate Settings gear in the top right corner', () => {
  const { home, done } = boot();
  try {
    assert.deepEqual(Object.keys(home.actions), ['play', 'watch', 'practice', 'discover']);
    assert.deepEqual(home.el.querySelectorAll('.home-action'), Object.values(home.actions));
    assert.ok(!home.el.querySelectorAll('.home-action').some((b) => /Settings/.test(b.html)), 'no Settings action any more');
    const gear = home.settingsButton;
    assert.equal(gear.tagName, 'BUTTON');
    assert.equal(gear.getAttribute('type'), 'button');
    assert.ok(gear.classList.contains('home-settings'));
    assert.equal(gear.hasAttribute('data-nav'), true, 'keyboard and gamepad reach it');
    assert.equal(gear.getAttribute('aria-label'), 'Settings');
    assert.equal(gear.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(gear.innerHTML, ICONS.settings, 'the gear glyph, no text');
    assert.equal(home.el.querySelector('.home-actions').children.includes(gear), false, 'not in the menu');
    assert.equal(gear.parentNode, home.el, 'Home chrome');
    // The glyph: the shared inline SVG style, in currentColor.
    assert.match(ICONS.settings, /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">/);
    assert.doesNotMatch(ICONS.settings, /#[0-9a-f]{3,8}\b|rgba?\(|\b(fill|stroke)="|<(image|text|use)\b|href=/i);
    // Placed by CSS in the top right, inside the safe area.
    const css = read('styles.css');
    const rule = css.match(/\n\.home-settings \{([^}]*)\}/)?.[1] ?? '';
    assert.match(rule, /position: absolute;/);
    assert.match(rule, /top: max\(var\(--safe-t\), /);
    assert.match(rule, /right: max\(var\(--safe-r\), /);
  } finally {
    done();
  }
});

// Play is Home's default only while a fighter is playable: a test-only one
// (see test-fighters.mjs) here.
test('keyboard and gamepad reach the gear from Home\'s menu', () => withTestFighters([TEST_A], () => {
  const { app, home, done } = boot();
  try {
    Object.values(home.actions).forEach((b, i) => place(b, 80, 300 + i * 50, 320, 44));
    place(home.settingsButton, 1180, 20, 44, 44);
    assert.equal(document.activeElement, home.actions.play, 'Play is still the default');
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, home.settingsButton, '→ from the menu');
    app.input.key('ArrowLeft');
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, home.settingsButton, '↑ from Play');
    app.nav.command('confirm', null); // gamepad A
    assert.equal(app.settingsDialog.isOpen, true);
  } finally {
    done();
  }
}));

// ---- The Settings dialog ----------------------------------------------------------------

test('the gear opens the Settings dialog over Home: no screen change, a modal with its own scope, focus inside', () => {
  const { app, home, dialog, done } = boot();
  try {
    const scopes = app.nav.scopes.length;
    home.settingsButton.click();
    assert.equal(app.screens.current, home, 'still on Home');
    assert.equal(home.el.hidden, false, 'Home stays visible behind');
    assert.equal(document.documentElement.dataset.screen, 'home');
    assert.equal(dialog.root.hidden, false);
    assert.equal(dialog.root.getAttribute('role'), 'dialog');
    assert.equal(dialog.root.getAttribute('aria-modal'), 'true');
    const title = dialog.root.querySelector('.settings-title');
    assert.equal(dialog.root.getAttribute('aria-labelledby'), title.getAttribute('id'));
    assert.equal(title.textContent, 'Settings');
    assert.equal(title.tagName, 'H2');
    assert.equal(app.nav.scopes.length, scopes + 1);
    assert.equal(app.nav.scopes.at(-1), dialog.scope, 'its own navigation scope');
    assert.equal(app.nav.scopeEl, dialog.root);
    assert.equal(home.el.inert, true, 'nothing behind it can be reached');
    assert.equal(document.activeElement, languageNamed(dialog, 'en'), 'focus lands on the language in use');
    // The panel is translucent glass over a dim, not an opaque screen.
    assert.ok(dialog.panel.classList.contains('glass') && dialog.panel.classList.contains('glass--panel'));
    const css = read('styles.css');
    assert.match(css.match(/\n\.settings-overlay \{([^}]*)\}/)?.[1] ?? '', /background: rgba\(0, 0, 0, 0\.\d+\);/);
    assert.match(css.match(/\n\.settings-body \{([^}]*)\}/)?.[1] ?? '', /overflow-y: auto;[\s\S]*touch-action: pan-y;/, 'it scrolls on its own');
  } finally {
    done();
  }
});

test('Esc, gamepad Back, the close button and the dim around the panel close it; focus returns to the gear', () => {
  const { app, home, dialog, done } = boot();
  try {
    const closers = [
      ['Escape', () => app.input.key('Escape')],
      ['gamepad Back', () => app.nav.command('back', null)],
      ['close button', () => dialog.closeButton.click()],
      ['the dim', () => dialog.root.dispatch('click', { target: dialog.root })],
    ];
    for (const [name, close] of closers) {
      home.settingsButton.click();
      assert.equal(dialog.isOpen, true, name);
      close();
      assert.equal(dialog.isOpen, false, name);
      assert.equal(dialog.root.hidden, true, name);
      assert.equal(app.nav.scopes.includes(dialog.scope), false, `${name}: exactly its scope is gone`);
      assert.equal(home.el.inert, false, `${name}: Home is back`);
      assert.equal(document.activeElement, home.settingsButton, `${name}: focus on the gear`);
      assert.equal(app.screens.current, home, `${name}: still Home`);
    }
    // A press inside the panel never closes it.
    home.settingsButton.click();
    dialog.root.dispatch('click', { target: dialog.panel });
    dialog.root.dispatch('click', { target: dialog.languageOptions[1] });
    assert.equal(dialog.isOpen, true);
    // The close button is labelled.
    assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Close settings');
    assert.equal(dialog.closeButton.hasAttribute('data-nav'), true);
    dialog.close();
  } finally {
    done();
  }
});

test('exactly two sections, Language and Controls, and nothing else', () => {
  const { dialog, done } = boot();
  try {
    const found = dialog.root.querySelectorAll('.settings-section');
    assert.deepEqual(found.map((s) => s.getAttribute('data-settings-section')), ['language', 'controls']);
    assert.deepEqual(found.map((s) => s.tagName), ['SECTION', 'SECTION']);
    assert.deepEqual(found.map((s) => s.querySelector('.settings-group-title').textContent), ['Language', 'Controls']);
    for (const section of found) {
      const heading = section.querySelector('.settings-group-title');
      assert.equal(section.getAttribute('aria-labelledby'), heading.getAttribute('id'));
    }
    assert.doesNotMatch(dialog.root.textContent, /Audio|Sound|Volume|Graphics|Difficulty|Account/i);
  } finally {
    done();
  }
});

test('Language: English and Français as two radio buttons; picking one saves it, the dialog stays and switches at once', () => {
  const { app, home, dialog, storage, done } = boot();
  try {
    home.settingsButton.click();
    const group = dialog.root.querySelector('.settings-languages');
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.equal(group.getAttribute('aria-labelledby'), 'settings-language-title');
    assert.deepEqual(dialog.languageOptions.map((o) => o.querySelector('.settings-language-name').textContent), ['English', 'Français']);
    for (const option of dialog.languageOptions) {
      assert.equal(option.tagName, 'BUTTON');
      assert.equal(option.getAttribute('role'), 'radio');
      assert.equal(option.hasAttribute('data-nav'), true);
    }
    assert.deepEqual(checked(dialog.languageOptions), ['true', 'false'], 'English, the language in use');
    languageNamed(dialog, 'fr').click();
    assert.equal(app.settings.language, 'fr');
    assert.equal(stored(storage).language, 'fr', 'saved at once');
    assert.deepEqual(checked(dialog.languageOptions), ['false', 'true']);
    assert.ok(languageNamed(dialog, 'fr').classList.contains('is-current'));
    assert.equal(dialog.isOpen, true, 'the dialog stays open');
    assert.equal(document.documentElement.lang, 'fr');
    // Everything visible in it follows at once.
    assert.equal(dialog.root.querySelector('.settings-title').textContent, 'Paramètres');
    assert.deepEqual(dialog.root.querySelectorAll('.settings-group-title').map((h) => h.textContent), ['Langue', 'Commandes']);
    assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Fermer les paramètres');
    assert.equal(schemeNamed(dialog, 'classic').querySelector('.settings-option-name').children[0].textContent, 'Boutons classiques');
    assert.equal(dialog.customizeNote.textContent, 'Déplacez et redimensionnez chaque commande de la disposition Joystick.');
    // And behind it, Home: the gear, the tagline, the menu's name.
    assert.equal(home.settingsButton.getAttribute('aria-label'), 'Paramètres');
    assert.equal(home.el.querySelector('.home-lede').textContent, 'Un projet de fan, fait avec cœur.');
    assert.equal(home.el.querySelector('.home-actions').getAttribute('aria-label'), 'Menu principal');
    // Back to English, the same way.
    languageNamed(dialog, 'en').click();
    assert.equal(dialog.root.querySelector('.settings-title').textContent, 'Settings');
    assert.equal(home.settingsButton.getAttribute('aria-label'), 'Settings');
    assert.equal(document.documentElement.lang, 'en');
  } finally {
    done();
  }
});

test('Controls: Joystick and Classic Buttons stay two radio cards, saved at once; Customize opens the editor', () => {
  const { app, home, dialog, storage, done } = boot();
  try {
    home.settingsButton.click();
    const group = dialog.root.querySelector('.settings-options');
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.equal(group.getAttribute('aria-labelledby'), 'settings-mobile-title');
    assert.equal(dialog.root.querySelector('.settings-subtitle').textContent, 'Mobile Controls');
    const names = dialog.schemeOptions.map((o) => o.querySelector('.settings-option-name').children[0].textContent);
    assert.deepEqual(names, ['Joystick', 'Classic Buttons']);
    for (const option of dialog.schemeOptions) {
      assert.equal(option.getAttribute('role'), 'radio');
      assert.equal(option.hasAttribute('data-nav'), true);
      const desc = dialog.root.querySelectorAll('.settings-option-desc').find((d) => d.getAttribute('id') === option.getAttribute('aria-describedby'));
      assert.ok(desc, 'described by its line');
    }
    const [joystick, classic] = dialog.schemeOptions;
    assert.match(joystick.textContent, /Default/, 'the default is marked');
    assert.doesNotMatch(classic.textContent, /Default/);
    assert.deepEqual(checked(dialog.schemeOptions), ['true', 'false']);
    classic.click();
    assert.equal(app.settings.mobileControls, 'classic');
    assert.deepEqual(checked(dialog.schemeOptions), ['false', 'true']);
    assert.equal(stored(storage).mobileControls, 'classic');
    assert.equal(dialog.isOpen, true);
    assert.equal(dialog.customizeNote.textContent, 'Move and resize every control of the Classic Buttons layout.');
    // Reopened on a new visit (the same device): Classic Buttons, checked.
    const again = boot(storage);
    again.home.settingsButton.click();
    assert.deepEqual(checked(again.dialog.schemeOptions), ['false', 'true']);
    again.done();

    // Customize touch controls: the editor, a second modal layer on top.
    const customize = dialog.customizeButton;
    assert.equal(customize.getAttribute('aria-haspopup'), 'dialog');
    assert.match(customize.html, /<span>Customize touch controls<\/span>/);
    customize.focus();
    customize.click();
    assert.equal(app.touchEditor.isOpen, true);
    assert.equal(app.touchEditor.scheme, 'classic', 'the scheme in use');
    assert.equal(app.nav.scopes.at(-1), app.touchEditor.scope, 'on top of the Settings scope');
    assert.equal(app.nav.scopes.at(-2), dialog.scope);
    assert.equal(dialog.root.inert, true, 'Settings waits beneath it');
    app.input.key('Escape');
    assert.equal(app.touchEditor.isOpen, false, 'Back leaves the editor first');
    assert.equal(dialog.isOpen, true);
    assert.equal(dialog.root.inert, false);
    assert.equal(document.activeElement, customize, 'focus back on Customize');
    app.input.key('Escape');
    assert.equal(dialog.isOpen, false);
    assert.equal(document.activeElement, home.settingsButton);
  } finally {
    done();
  }
});

test('keyboard and gamepad move through the dialog and choose in it, and navigation never escapes behind it', () => {
  const { app, home, dialog, done } = boot();
  try {
    Object.values(home.actions).forEach((b, i) => place(b, 80, 300 + i * 50, 320, 44));
    place(home.settingsButton, 1180, 20, 44, 44);
    place(dialog.closeButton, 900, 60, 44, 44);
    dialog.languageOptions.forEach((o, i) => place(o, 300 + i * 320, 180, 300, 50));
    dialog.schemeOptions.forEach((o, i) => place(o, 300 + i * 320, 300, 300, 160));
    place(dialog.customizeButton, 300, 480, 300, 44);
    home.settingsButton.click();
    assert.equal(document.activeElement, languageNamed(dialog, 'en'));
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, languageNamed(dialog, 'fr'));
    assert.equal(app.settings.language, 'en', 'moving is not choosing');
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, schemeNamed(dialog, 'classic'));
    app.nav.command('confirm', null); // gamepad A
    assert.equal(app.settings.mobileControls, 'classic');
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, dialog.customizeButton);
    // Never out to Home's menu, far to the left.
    for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowDown']) app.input.key(key);
    assert.ok(dialog.root.contains(document.activeElement));
    for (const item of Object.values(home.actions)) assert.equal(app.nav.inScope(item), false);
    app.input.key('ArrowUp');
    app.input.key('ArrowUp');
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, dialog.closeButton);
    app.input.key('KeyJ');
    assert.equal(dialog.isOpen, false);
    assert.equal(document.activeElement, home.settingsButton);
  } finally {
    done();
  }
});

// ---- The Settings screen, Help: gone; credits stay ----------------------------------

test('Settings is no longer a screen: no module, section, registration, navigation or styles left', () => {
  assert.equal(existsSync(new URL('js/screens/settings-screen.js', ROOT)), false);
  const html = read('index.html');
  assert.doesNotMatch(html, /data-screen="settings"|screen--settings/);
  assert.match(html, /<div id="settings-dialog" class="overlay settings-overlay" hidden><\/div>/);
  assert.match(html, /<div id="touch-editor" class="touch-editor" hidden><\/div>/);
  assert.match(html, /<div id="language-dialog" class="overlay language-overlay" hidden><\/div>/);
  const app = read('js/core/app.js');
  assert.doesNotMatch(app, /SettingsScreen|settings-screen/);
  assert.match(app, /this\.settings = new Settings\(\);/);
  assert.match(app, /this\.settingsDialog = new SettingsDialog\(document\.getElementById\('settings-dialog'\), this\);/);
  for (const file of sourceFiles()) {
    assert.doesNotMatch(read(file), /screens\.go\('settings'\)|SettingsScreen|settings-screen/, file);
  }
  const css = read('styles.css');
  assert.doesNotMatch(css, /\.settings-layout|\.screen--settings|\.settings-group \{/);
});

test('Help is removed from the game: no Help screen, module, section or registration', () => {
  assert.equal(existsSync(new URL('js/ui/help-content.js', ROOT)), false);
  assert.equal(existsSync(new URL('js/screens/help-credits-screen.js', ROOT)), false);
  const html = read('index.html');
  assert.doesNotMatch(html, /data-screen="help"|screen--help|Help and credits/);
  assert.doesNotMatch(read('js/core/app.js'), /HelpCredits|help-credits|help-content/);
  for (const file of sourceFiles()) {
    const code = read(file);
    assert.doesNotMatch(code, /help-content|help-credits|buildHelp|buildCredits|helpOpen|openHelp|closeHelp|pauseHelp/, file);
  }
  // Its styles went with it.
  const css = read('styles.css');
  assert.doesNotMatch(css, /\.help-layout|\.tab-panel|\.info-card|\.controls-table|\.mobile-diagram|\.md-[a-z]|pause-help|\.is-help|screen--help/);
});

test('the Home credits still roll: both copies, the second hidden, every credit unchanged in English', () => {
  const credits = creditsText();
  assert.deepEqual(credits.map((g) => g.title), [
    CONFIG.title, 'Original work', '#0001 sprite source', '#0002 sprite source', 'Rights', 'Project',
  ]);
  assert.equal(credits[0].lead, `Created by ${CONFIG.developer}`);
  assert.deepEqual(credits[2].lines, [
    'Original sprite material from Jump Ultimate Stars',
    'The Spriters Resource',
    'Source sheet uploaded by Dazz',
    'Contributor: FRET',
  ]);
  assert.deepEqual(credits[3].lines, ['Sprite sheet by thespriteanimations on DeviantArt']);
  assert.equal(CREDITS.length, credits.length);
  assert.match(read('js/screens/home-screen.js'), /import \{ CREDITS, creditLabel, creditLink \} from '\.\.\/ui\/credits\.js';/);

  const { home, done } = boot();
  try {
    const region = home.el.querySelector('.home-credits-col');
    assert.equal(region.getAttribute('role'), 'region');
    assert.match(region.getAttribute('aria-label'), /^Credits/);
    const seqs = home.el.querySelectorAll('.home-credits-seq');
    assert.equal(seqs.length, 2, 'the roll holds the credits twice, for its loop');
    assert.equal(seqs[0].getAttribute('aria-hidden'), null, 'announced once');
    assert.equal(seqs[1].getAttribute('aria-hidden'), 'true');
    for (const seq of seqs) {
      const groups = seq.querySelectorAll('.home-credit');
      assert.deepEqual(groups.map((g) => g.querySelector('.home-credit-title').textContent), credits.map((g) => g.title));
      const lines = seq.querySelectorAll('.home-credit-line').map((p) => p.textContent);
      assert.deepEqual(lines, credits.flatMap((g) => g.lines));
      assert.equal(seq.querySelector('.home-credit-lead').textContent, credits[0].lead);
    }
  } finally {
    done();
  }
});

test('in French the credits translate but proper names stay', () => {
  setLanguage('fr');
  try {
    const credits = creditsText();
    assert.equal(credits[0].title, CONFIG.title);
    assert.equal(credits[0].lead, `Créé par ${CONFIG.developer}`);
    assert.equal(credits[1].title, 'Création originale');
    assert.ok(credits[2].lines[0].includes('Jump Ultimate Stars'));
    assert.equal(credits[2].lines[1], 'The Spriters Resource');
    assert.ok(credits[2].lines[2].includes('Dazz'));
    assert.ok(credits[2].lines[3].includes('FRET'));
    assert.equal(credits[3].title, 'Source des sprites de #0002');
    assert.ok(credits[3].lines[0].includes('thespriteanimations') && credits[3].lines[0].includes('DeviantArt'));
    assert.equal(credits[4].title, 'Droits');
    assert.equal(getLanguage(), 'fr');
  } finally {
    setLanguage('en');
  }
  assert.equal(t('credits.rights.title'), 'Rights');
});

// Every name a removed fighter's art was credited with: none of it applies
// now. (DeviantArt, where the first #0002's sheet came from, is where the
// new #0002's sheet was published too: credited again, by its own artist.)
const RETIRED_CREDITS = [
  'Slender', 'Eric Knudsen', 'Victor Surge', 'Something Awful', 'XmayGrrr', 'Jus Sheet', 'renatoooferreiraaa',
  'Dazz & Fret',
];

test('the credits name only fighters that exist: a sprite group for each, #0001\'s unchanged, and nothing of a removed fighter is left', () => {
  const names = new Set(CHARACTERS.map((c) => c.displayName));
  for (const language of ['en', 'fr']) {
    setLanguage(language);
    try {
      const credits = creditsText();
      const text = credits.flatMap((g) => [g.title, g.lead ?? '', ...g.lines]).join('\n');
      for (const name of text.match(/#\d{4}\b/g) ?? []) assert.ok(names.has(name), `${language}: ${name} is no fighter`);
      assert.equal(credits.filter((g) => /#\d{4}/.test(g.title)).length, CHARACTERS.length, `${language}: one sprite source group per fighter`);
      for (const name of RETIRED_CREDITS) assert.ok(!text.includes(name), `${language}: ${name}`);
      assert.doesNotMatch(text, /2009/);
    } finally {
      setLanguage('en');
    }
  }
  // Gone from the data and its translations too.
  assert.deepEqual(CREDITS.map((g) => g.title), [
    'brand.title', 'credits.original.title', 'credits.sprites.title', 'credits.sprites0002.title', 'credits.rights.title',
    'credits.project.title',
  ]);
  // One linked line: #0002's sheet, on its DeviantArt page.
  const links = CREDITS.flatMap((g) => g.lines || []).filter((line) => line?.href);
  assert.equal(links.length, 1);
  assert.match(links[0].href, /^https:\/\/www\.deviantart\.com\/thespriteanimations\/art\/[\w-]*1350194762$/);
  assert.doesNotMatch(read('js/ui/credits.js'), /slender|sprites000[13]|Dazz & Fret/i);
  assert.doesNotMatch(read('js/core/i18n.js'), /credits\.\d|credits\.sprites000[13]|slender|XmayGrrr/i);
  // #0001's attribution is all still there, unchanged, and the notices after it.
  const credits = creditsText();
  const at = credits.findIndex((g) => g.title === '#0001 sprite source');
  assert.deepEqual(credits[at].lines, [
    'Original sprite material from Jump Ultimate Stars', 'The Spriters Resource', 'Source sheet uploaded by Dazz', 'Contributor: FRET',
  ]);
  assert.deepEqual(credits.slice(at + 1).map((g) => g.title), ['#0002 sprite source', 'Rights', 'Project']);
});

test('a credit line may still link to its source, accessibly, from the Home roll', () => {
  // A linked line, added for this check only: the address is data, its
  // label a translation key like any line's.
  const href = 'https://example.com/source-page';
  const group = { title: 'credits.sprites.title', lines: [{ label: 'credits.sprites.site', href }] };
  CREDITS.splice(CREDITS.length - 2, 0, group);
  const { home, done } = boot();
  try {
    // Only the line added here (#0002's own linked credit is left aside).
    const [first, copy] = home.el.querySelectorAll('.home-credits-seq')
      .map((seq) => seq.querySelectorAll('.home-credit-link').filter((a) => a.getAttribute('href') === href));
    assert.equal(first.length, 1);
    assert.equal(copy.length, 1);
    for (const a of [first[0], copy[0]]) {
      assert.equal(a.tagName, 'A');
      assert.equal(a.getAttribute('href'), href);
      assert.equal(a.getAttribute('target'), '_blank');
      assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(a.textContent, 'The Spriters Resource', 'a descriptive name, not a bare address');
      assert.equal(a.getAttribute('data-i18n'), 'credits.sprites.site', 'it follows the language');
      assert.ok(a.parentNode.classList.contains('home-credit-line'));
    }
    assert.equal(first[0].getAttribute('tabindex'), null, 'reachable by Tab');
    assert.equal(copy[0].getAttribute('tabindex'), '-1', 'the hidden copy\'s never is');
    assert.ok(home.creditLinks.includes(first[0]) && !home.creditLinks.includes(copy[0]));
    setLanguage('fr');
    localizeTree(home.el);
    assert.equal(first[0].getAttribute('href'), href, 'the address never translates');
  } finally {
    setLanguage('en');
    done();
    CREDITS.splice(CREDITS.indexOf(group), 1);
  }
});

test('English and French credits keep the same structure, and French keeps every proper name', () => {
  const en = creditsText();
  setLanguage('fr');
  let fr;
  try {
    fr = creditsText();
  } finally {
    setLanguage('en');
  }
  assert.deepEqual(fr.map((g) => [g.lead === null, g.lines.length]), en.map((g) => [g.lead === null, g.lines.length]));
  const at = en.findIndex((g) => g.title === '#0001 sprite source');
  for (const name of ['Jump Ultimate Stars', 'The Spriters Resource', 'Dazz', 'FRET']) {
    assert.ok(fr[at].lines.join(' ').includes(name), `fr: ${name}`);
  }
});
