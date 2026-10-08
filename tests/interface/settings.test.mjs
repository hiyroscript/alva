// Run with node --test tests/interface/settings.test.mjs (no dependencies).
// Settings: the versioned settings store (schema 3: language, Mobile
// Controls, each scheme's custom touch layout and Combat Assist; the
// version 1 and 2 migrations; the safe fallback for missing, corrupt,
// foreign or blocked storage), the first-launch language chooser, Home's
// Settings gear, and the Settings dialog it opens over Home (modal
// semantics, its navigation scope, focus, exactly the Language, Controls
// and Combat sections, every choice saved at once),
// plus the unavailable Help / Controller / Download placeholders. On a minimal
// fake DOM; layout and paint still need real-browser verification.
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

const {
  Settings, SETTINGS_KEY, SETTINGS_VERSION, DEFAULT_SETTINGS, LANGUAGES, DEFAULT_LANGUAGE, MOBILE_CONTROLS, DEFAULT_MOBILE_CONTROLS,
  DEFAULT_COMBAT_ASSIST, readSettings,
} = await import('../../js/core/settings.js');
const { t, followSettings, onLanguageChange, localizeTree, getLanguage, setLanguage } = await import('../../js/localization/i18n.js');
const { ScreenManager, Screen } = await import('../../js/core/screen-manager.js');
const { App } = await import('../../js/core/app.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { SettingsDialog, SETTINGS_SECTIONS } = await import('../../js/ui/settings-dialog.js');
const { LanguageDialog } = await import('../../js/ui/language-dialog.js');
const { TouchLayoutEditor } = await import('../../js/ui/touch-layout-editor.js');
const { ICONS } = await import('../../js/ui/icons.js');
const { ENERGY_STYLE } = await import('../../js/game/rendering/fighter-status.js');
const creditsModule = await import('../../js/ui/credits.js');
const { CREDITS, creditsText } = creditsModule;
const { CONFIG } = await import('../../js/config.js');
const { CHARACTERS } = await import('../../js/data/characters.js');
const { TEST_A, withTestFighters } = await import('../fighters/fixtures/test-fighters.mjs');

const ROOT = new URL('../../', import.meta.url);
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
  const padListeners = new Set();
  return {
    onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onPadMenu(fn) { padListeners.add(fn); },
    pad(cmd) { for (const fn of padListeners) fn(cmd); },
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
const assistNamed = (dialog, on) => dialog.assistOptions.find((o) => o.getAttribute('data-combat-assist') === (on ? 'on' : 'off'));
const checked = (options) => options.map((o) => o.getAttribute('aria-checked'));

// ---- The settings store ---------------------------------------------------------

test('schema 3: language (unchosen), Mobile Controls (Joystick), an empty custom layout per scheme and Combat Assist on by default', () => {
  assert.equal(SETTINGS_KEY, 'alva.settings');
  assert.equal(SETTINGS_VERSION, 3);
  assert.equal(DEFAULT_COMBAT_ASSIST, true);
  assert.deepEqual([...LANGUAGES], ['en', 'fr']);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.deepEqual([...MOBILE_CONTROLS], ['joystick', 'classic']);
  assert.equal(DEFAULT_MOBILE_CONTROLS, 'joystick');
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), {
    language: null, mobileControls: 'joystick', touchLayouts: { joystick: {}, classic: {} }, combatAssist: true,
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
  assert.equal(settings.combatAssist, true, 'Combat Assist is on for a new player');
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
      version: 3, language, mobileControls: 'joystick', touchLayouts: { joystick: {}, classic: {} }, combatAssist: true,
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
    assert.equal(settings.combatAssist, true, 'Combat Assist on');
    // The next save writes the new schema, the choice still there.
    settings.set('language', 'fr');
    assert.deepEqual(stored(storage), {
      version: 3, language: 'fr', mobileControls: scheme, touchLayouts: { joystick: {}, classic: {} }, combatAssist: true,
    });
  }
  // A version 1 object never had a language, layouts or Combat Assist: any
  // found are ignored.
  assert.deepEqual(readSettings({
    version: 1, mobileControls: 'classic', language: 'fr', touchLayouts: { classic: { jump: { x: 0.5, y: 0.5, scale: 1 } } }, combatAssist: false,
  }), { language: null, mobileControls: 'classic', touchLayouts: { joystick: {}, classic: {} }, combatAssist: true });
  // And its own value is still checked.
  assert.equal(readSettings({ version: 1, mobileControls: 'dpad' }).mobileControls, 'joystick');
});

test('version 2 settings migrate: language, Mobile Controls and both custom layouts survive, and Combat Assist is on', () => {
  const joystick = { jump: { x: 0.8, y: 0.7, scale: 1.2 } };
  const classic = { shield: { x: 0.6, y: 0.75, scale: 0.9 } };
  const v2 = { version: 2, language: 'fr', mobileControls: 'classic', touchLayouts: { joystick, classic } };
  const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify(v2) });
  const settings = new Settings(storage);
  assert.equal(settings.language, 'fr');
  assert.equal(settings.languageChosen, true, 'a chosen language stays chosen: no chooser after the update');
  assert.equal(settings.mobileControls, 'classic');
  assert.deepEqual(settings.touchLayout('joystick'), joystick);
  assert.deepEqual(settings.touchLayout('classic'), classic);
  assert.equal(settings.combatAssist, true);
  assert.equal(storage.writes, 0, 'nothing written just by reading');
  // The next save writes schema 3 with all of it.
  settings.set('mobileControls', 'joystick');
  assert.deepEqual(stored(storage), {
    version: 3, language: 'fr', mobileControls: 'joystick', touchLayouts: { joystick, classic }, combatAssist: true,
  });
  // An unchosen language stays unchosen, and a version 2 object never had
  // Combat Assist: whatever it holds under that name, it is on.
  for (const odd of [false, 'off', 0, null]) {
    assert.deepEqual(readSettings({ version: 2, language: null, mobileControls: 'joystick', combatAssist: odd }),
      { language: null, mobileControls: 'joystick', touchLayouts: { joystick: {}, classic: {} }, combatAssist: true }, String(odd));
  }
  // Its own values are still checked, each on its own.
  assert.deepEqual(readSettings({ version: 2, language: 'de', mobileControls: 'classic', touchLayouts: 'big' }),
    { language: null, mobileControls: 'classic', touchLayouts: { joystick: {}, classic: {} }, combatAssist: true });
});

test('Combat Assist is a real boolean: saved, announced and read back; anything else is refused or falls back to on', () => {
  const storage = memoryStorage();
  const settings = new Settings(storage);
  const heard = [];
  settings.onChange((name, value) => heard.push([name, value]));
  assert.equal(settings.set('combatAssist', false), true);
  assert.equal(settings.combatAssist, false);
  assert.deepEqual(heard, [['combatAssist', false]]);
  assert.deepEqual(stored(storage), {
    version: 3, language: null, mobileControls: 'joystick', touchLayouts: { joystick: {}, classic: {} }, combatAssist: false,
  });
  assert.equal(new Settings(storage).combatAssist, false, 'off survives a reload');
  // The same value again is no change: nothing written or announced.
  const writes = storage.writes;
  settings.combatAssist = false;
  assert.equal(storage.writes, writes);
  assert.equal(heard.length, 1);
  settings.combatAssist = true;
  assert.deepEqual(heard, [['combatAssist', false], ['combatAssist', true]]);
  assert.equal(new Settings(storage).combatAssist, true, 'on survives a reload');
  // Never anything but a boolean.
  for (const bad of ['true', 'false', 'on', 'off', 0, 1, null, undefined, {}, []]) {
    assert.equal(settings.set('combatAssist', bad), false, String(bad));
  }
  assert.equal(settings.combatAssist, true);
  assert.equal(heard.length, 2);
  // A stored value that is not a boolean is on, its neighbours kept.
  for (const bad of ['false', 0, null, 'off', {}]) {
    const loaded = new Settings(memoryStorage({
      [SETTINGS_KEY]: JSON.stringify({ version: 3, language: 'fr', mobileControls: 'classic', combatAssist: bad }),
    }));
    assert.equal(loaded.combatAssist, true, JSON.stringify(bad));
    assert.equal(loaded.language, 'fr');
    assert.equal(loaded.mobileControls, 'classic');
  }
  for (const value of [true, false]) {
    const loaded = new Settings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ version: 3, combatAssist: value }) }));
    assert.equal(loaded.combatAssist, value, String(value));
  }
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
  defaults(load(JSON.stringify({ version: 4, mobileControls: 'classic', language: 'fr', combatAssist: false })), 'a future version');
  defaults(load(JSON.stringify({ version: '3', mobileControls: 'classic', language: 'fr' })), 'a version that is not a number');
  for (const raw of [undefined, '{not json', '[]', JSON.stringify({ version: 4, combatAssist: false })]) {
    assert.equal(load(raw).combatAssist, true, `Combat Assist on: ${raw}`);
  }
  // Within version 3, each value on its own.
  const partial = load(JSON.stringify({ version: 3, language: 'de', mobileControls: 'classic', touchLayouts: 'big', combatAssist: 'no' }));
  assert.equal(partial.languageChosen, false, 'an unknown language is no choice');
  assert.equal(partial.mobileControls, 'classic', 'a valid neighbour is kept');
  assert.deepEqual(partial.touchLayout('classic'), {});
  assert.equal(partial.combatAssist, true);
  const other = load(JSON.stringify({ version: 3, language: 'fr', mobileControls: 'CLASSIC', combatAssist: false }));
  assert.equal(other.combatAssist, false);
  assert.equal(other.language, 'fr');
  assert.equal(other.mobileControls, 'joystick');
  // A bad stored value is replaced cleanly by the next choice.
  const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
  new Settings(storage).set('mobileControls', 'classic');
  assert.deepEqual(stored(storage), {
    version: 3, language: null, mobileControls: 'classic', touchLayouts: { joystick: {}, classic: {} }, combatAssist: true,
  });
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
        down: [0.5, 0.5, 1], // not { x, y, scale }: dropped
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

test('Home has four menu actions and a top-right Help, Controller, Settings group', () => {
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
    const group = home.el.querySelector('.home-utility-buttons');
    assert.equal(group.parentNode, home.el, 'Home chrome');
    assert.equal(gear.parentNode, group);
    assert.deepEqual(group.children.map((button) => button.className), ['home-help', 'home-controller', 'home-settings']);
    const [help, controller] = group.children;
    assert.equal(help.innerHTML, ICONS.help);
    assert.match(ICONS.help, /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">/);
    const img = controller.querySelector('img');
    assert.equal(img.getAttribute('src'), 'controller.PNG');
    assert.ok(existsSync(new URL(img.getAttribute('src'), ROOT)));
    assert.equal(img.getAttribute('alt'), '');
    assert.equal(img.getAttribute('aria-hidden'), 'true');
    // The glyph: the shared inline SVG style, in currentColor.
    assert.match(ICONS.settings, /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">/);
    assert.doesNotMatch(ICONS.settings, /#[0-9a-f]{3,8}\b|rgba?\(|\b(fill|stroke)="|<(image|text|use)\b|href=/i);
    // Placed by CSS in the top right, inside the safe area.
    const css = stylesheet();
    const rule = css.match(/\n\.home-utility-buttons \{([^}]*)\}/)?.[1] ?? '';
    assert.match(rule, /position: absolute;/);
    assert.match(rule, /top: max\(var\(--safe-t\), /);
    assert.match(rule, /right: max\(var\(--safe-r\), /);
    assert.match(rule, /display: flex;/);
    assert.match(rule, /gap: 8px;/);
    assert.match(css, /\.home-controller img \{[^}]*object-fit: contain;/);
  } finally {
    done();
  }
});

test('Help, Controller and Download are localized, unavailable and inert, without displacing Settings navigation', () => {
  const { app, home, dialog, storage, done } = boot();
  try {
    const [help, controller, settings] = home.utilityButtons.children;
    const download = home.el.querySelector('.home-download');
    const before = storage.writes;
    const focus = document.activeElement;
    for (const button of [help, controller, download]) {
      assert.equal(button.tagName, 'BUTTON');
      assert.equal(button.getAttribute('type'), 'button');
      assert.equal(button.disabled, true, 'native unavailable semantics');
      assert.equal(button.hasAttribute('data-nav'), false);
      assert.equal(app.nav.candidates(home.el).includes(button), false);
      assert.equal(button.listeners.size, 0, 'no activation or focus handlers');
      button.click();
      button.click(0); // keyboard / gamepad-style activation
      button.dispatch('click'); // even a stale synthetic event has no action
      button.focus();
      assert.equal(document.activeElement, focus);
      assert.equal(app.screens.current, home);
      assert.equal(dialog.isOpen, false);
      assert.equal(app.nav.scopes.length, 0);
    }
    assert.equal(storage.writes, before);
    assert.equal(app.nav.candidates(home.el).at(-1), settings);
    for (const [language, names, downloadLabel] of [
      ['en', ['Help', 'Controller', 'Settings'], 'Download'],
      ['fr', ['Aide', 'Manette', 'Paramètres'], 'Télécharger'],
      ['en', ['Help', 'Controller', 'Settings'], 'Download'],
    ]) {
      app.settings.set('language', language);
      assert.deepEqual(home.utilityButtons.children.map((b) => b.getAttribute('aria-label')), names);
      assert.equal(download.getAttribute('aria-label'), downloadLabel);
    }
  } finally {
    done();
  }
});

test('Home footer keeps its attribution and contains one decorative Download icon button', () => {
  const { home, done } = boot();
  try {
    const footer = home.el.querySelector('.home-footer');
    const buttons = home.el.querySelectorAll('.home-download');
    assert.equal(buttons.length, 1);
    const [download] = buttons;
    assert.equal(download.parentNode, footer);
    assert.deepEqual(footer.children.map((node) => node.tagName), ['SPAN', 'BUTTON']);
    assert.equal(footer.children[0].textContent, t('home.by', { developer: CONFIG.developer }));
    assert.equal(download.innerHTML, ICONS.download);
    assert.match(ICONS.download, /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">/);
    assert.doesNotMatch(ICONS.download, /#[0-9a-f]{3,8}\b|rgba?\(|\b(fill|stroke)="|<(image|text|use)\b|href=/i);
    assert.equal(download.hasAttribute('aria-haspopup'), false);
    assert.equal(download.hasAttribute('href'), false);
  } finally { done(); }
});

// Play is Home's default only while a fighter is playable: a test-only one
// (see tests/fighters/fixtures/test-fighters.mjs) here.
test('keyboard and gamepad reach the gear from Home\'s menu', () => withTestFighters([TEST_A], () => {
  const { app, home, done } = boot();
  try {
    Object.values(home.actions).forEach((b, i) => place(b, 80, 300 + i * 50, 320, 44));
    place(home.settingsButton, 1180, 20, 44, 44);
    place(home.utilityButtons.children[0], 1076, 20, 44, 44);
    place(home.utilityButtons.children[1], 1128, 20, 44, 44);
    assert.equal(document.activeElement, home.actions.play, 'Play is still the default');
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, home.settingsButton, '→ from the menu');
    app.input.key('ArrowLeft');
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, home.settingsButton, '↑ from Play');
    app.input.pad('left');
    assert.ok(Object.values(home.actions).includes(document.activeElement), 'D-pad skips the placeholders');
    app.input.pad('right');
    assert.equal(document.activeElement, home.settingsButton, 'D-pad reaches Settings');
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
    assert.equal(document.activeElement, dialog.tabs[0], 'focus lands on the Language tab');
    // The panel is translucent glass over a dim, not an opaque screen.
    assert.ok(dialog.panel.classList.contains('glass') && dialog.panel.classList.contains('glass--panel'));
    const css = stylesheet();
    assert.match(css.match(/\n\.settings-overlay \{([^}]*)\}/)?.[1] ?? '', /background: rgba\(0, 0, 0, 0\.\d+\);/);
    assert.match(css.match(/\n\.settings-section \{([^}]*)\}/)?.[1] ?? '', /overflow-y: auto;[\s\S]*touch-action: pan-y;/, 'it scrolls on its own');
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

test('exactly three sections, Language, Controls and Combat, and nothing else', () => {
  const { dialog, done } = boot();
  try {
    const found = dialog.root.querySelectorAll('.settings-section');
    assert.deepEqual(found.map((s) => s.getAttribute('data-settings-section')), ['language', 'controls', 'combat']);
    assert.deepEqual(found.map((s) => s.tagName), ['SECTION', 'SECTION', 'SECTION']);
    assert.deepEqual(found.map((s) => s.querySelector('.settings-group-title').textContent), ['Language', 'Controls', 'Combat']);
    for (const section of found) {
      const category = dialog.categories.find(({ panel }) => panel === section);
      assert.equal(section.getAttribute('aria-labelledby'), category.tab.getAttribute('id'));
      assert.equal(section.getAttribute('role'), 'tabpanel');
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
    assert.equal(dialog.activeSection, 'language');
    assert.deepEqual(dialog.tabs.map((tab) => tab.textContent), ['Langue', 'Commandes', 'Combat']);
    assert.equal(dialog.tablist.getAttribute('aria-label'), 'Catégories des paramètres');
    // Everything visible in it follows at once.
    assert.equal(dialog.root.querySelector('.settings-title').textContent, 'Paramètres');
    assert.deepEqual(dialog.root.querySelectorAll('.settings-group-title').map((h) => h.textContent), ['Langue', 'Commandes', 'Combat']);
    assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Fermer les paramètres');
    assert.equal(schemeNamed(dialog, 'classic').querySelector('.settings-option-name').children[0].textContent, 'Boutons classiques');
    assert.equal(dialog.customizeNote.textContent, 'Joystick : déplacez et redimensionnez chaque commande.');
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
    dialog.tabs[1].click();
    const group = dialog.root.querySelector('.settings-options');
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.equal(group.getAttribute('aria-labelledby'), 'settings-mobile-title');
    assert.equal(dialog.root.querySelector('.settings-subtitle').textContent, 'Mobile controls');
    const names = dialog.schemeOptions.map((o) => o.querySelector('.settings-option-name').children[0].textContent);
    assert.deepEqual(names, ['Joystick', 'Classic buttons']);
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
    assert.equal(dialog.customizeNote.textContent, 'Classic buttons: move and resize each control.');
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
    assert.equal(dialog.activeSection, 'controls');
    assert.equal(dialog.sections.controls.hidden, false);
    assert.equal(document.activeElement, customize, 'focus back on Customize');
    app.input.key('Escape');
    assert.equal(dialog.isOpen, false);
    assert.equal(document.activeElement, home.settingsButton);
  } finally {
    done();
  }
});

test('both layouts keep localized copy, editor labels and saved choices across language switches', () => {
  const { app, home, dialog, storage, done } = boot();
  try {
    home.settingsButton.click();
    for (const language of ['en', 'fr', 'en']) {
      dialog.showSection('language');
      languageNamed(dialog, language).click();
      dialog.showSection('controls');
      for (const scheme of ['joystick', 'classic']) {
        schemeNamed(dialog, scheme).click();
        const name = t(`settings.scheme.${scheme}`);
        assert.equal(dialog.customizeNote.textContent, language === 'en'
          ? `${name}: move and resize each control.`
          : `${name} : déplacez et redimensionnez chaque commande.`);
        app.settings.setTouchLayout(scheme, { jump: { x: 0.8, y: 0.7, scale: 1.2 } });
        assert.equal(dialog.customTag.hidden, false);
        assert.equal(dialog.customTag.textContent, language === 'en' ? 'Custom layout' : 'Disposition personnalisée');
        dialog.customizeButton.click();
        const editor = app.touchEditor;
        assert.equal(editor.schemeLabel.textContent, language === 'en' ? `${name} layout` : `Disposition : ${name}`);
        assert.equal(editor.root.querySelector('.touch-editor-title').textContent, t('settings.customize'));
        assert.equal(editor.root.querySelector('.touch-editor-size-label').textContent, language === 'en' ? 'Size' : 'Taille');
        assert.equal(editor.nameEl.textContent, t('editor.none'));
        assert.equal(editor.smaller.getAttribute('aria-label'), language === 'en' ? 'Smaller' : 'Réduire');
        assert.equal(editor.larger.getAttribute('aria-label'), language === 'en' ? 'Larger' : 'Agrandir');
        const id = scheme === 'joystick' ? 'mouvementLeft' : 'runLeft';
        const controlName = t(scheme === 'joystick' ? 'touch.mouvementLeft' : 'control.runLeft');
        editor.startMoving(id);
        assert.equal(editor.nameEl.textContent, controlName);
        assert.equal(editor.live.textContent, t('editor.moving', { name: controlName }));
        editor.stopMoving();
        assert.equal(editor.live.textContent, t('editor.placed', { name: controlName }));
        editor.doneButton.click();
        assert.equal(document.activeElement, dialog.customizeButton);
        const reloaded = new Settings(storage);
        assert.equal(reloaded.language, language);
        assert.equal(reloaded.mobileControls, scheme);
        assert.deepEqual(reloaded.touchLayout(scheme).jump, { x: 0.8, y: 0.7, scale: 1.2 });
      }
    }
  } finally {
    done();
  }
});

test('the selected Shield label keeps its standard translated name and appearance in both layouts', () => {
  const { app, home, dialog, done } = boot();
  try {
    home.settingsButton.click();
    dialog.showSection('controls');
    const editor = app.touchEditor;
    for (const scheme of ['joystick', 'classic']) {
      schemeNamed(dialog, scheme).click();
      dialog.customizeButton.click();
      for (const [language, label] of [['en', 'Shield'], ['fr', 'Bouclier'], ['en', 'Shield']]) {
        app.settings.set('language', language);
        editor.select('shield');
        assert.equal(editor.nameEl.textContent, label);
        assert.equal(editor.nameOf('shield'), label);
        assert.equal(editor.nameEl.className, 'touch-editor-name');
        assert.equal(editor.controlNode('shield').getAttribute('aria-label'), label);
      }
      editor.close();
    }
    const normal = stylesheet().match(/\n\.touch-editor-name \{([^}]*)\}/)?.[1] ?? '';
    assert.match(normal, /font-weight: 600;/);
    assert.match(normal, /color: var\(--text-strong\);/);
  } finally {
    done();
  }
});

test('Settings and the editor preserve translation case, including the shared kicker override', () => {
  const css = stylesheet();
  const rule = (selector) => css.match(new RegExp(`\\n${selector.replaceAll('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
  for (const selector of ['.settings-group-title', '.settings-option-tag', '.touch-editor-size-label', '.touch-editor-scheme']) {
    assert.match(rule(selector), /text-transform: none;/, selector);
  }
  assert.doesNotMatch(read('css/settings.css'), /text-transform: (uppercase|capitalize);/);
  assert.match(rule('.kicker'), /text-transform: uppercase;/, 'shared branding stays unchanged');
});

test('Combat: Combat Assist On (the default) and Off as two radio buttons, saved at once, in English and French', () => {
  const { app, home, dialog, storage, done } = boot();
  try {
    home.settingsButton.click();
    dialog.tabs[2].click();
    const section = dialog.sections.combat;
    assert.equal(section.getAttribute('data-settings-section'), 'combat');
    assert.equal(section.querySelector('.settings-subtitle').textContent, 'Combat assist');
    const desc = section.querySelector('.settings-group-note');
    assert.equal(desc.textContent, 'Automatically closes a short gap before a melee attack. Never uses energy and never affects ranged attacks.');
    // Its line says it is melee only and costs no energy.
    assert.match(desc.textContent, /melee/);
    assert.match(desc.textContent, /energy/);
    const energy = desc.querySelector('.settings-energy');
    assert.equal(energy.tagName, 'STRONG');
    assert.equal(energy.textContent, 'energy');
    const emphasis = stylesheet().match(/\n\.settings-energy \{([^}]*)\}/)?.[1] ?? '';
    assert.match(emphasis, /font-weight: 700;/);
    assert.equal(emphasis.match(/color: (#[\da-f]+);/)?.[1], ENERGY_STYLE.fill);
    const group = section.querySelector('.settings-choices');
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.equal(group.getAttribute('aria-labelledby'), 'settings-assist-title');
    assert.equal(section.querySelector('.settings-subtitle').getAttribute('id'), 'settings-assist-title');
    assert.equal(group.getAttribute('aria-describedby'), desc.getAttribute('id'));
    const [on, off] = dialog.assistOptions;
    assert.deepEqual(dialog.assistOptions.map((o) => o.getAttribute('data-combat-assist')), ['on', 'off']);
    for (const option of dialog.assistOptions) {
      assert.equal(option.tagName, 'BUTTON');
      assert.equal(option.getAttribute('role'), 'radio');
      assert.equal(option.hasAttribute('data-nav'), true);
      assert.ok(group.contains(option));
    }
    assert.match(on.textContent, /^On/);
    assert.match(on.textContent, /Default/, 'On is marked as the default');
    assert.doesNotMatch(off.textContent, /Default/);
    assert.match(off.textContent, /^Off/);
    // A new player: On, checked.
    assert.deepEqual(checked(dialog.assistOptions), ['true', 'false']);
    assert.ok(on.classList.contains('is-current'));
    // Off: saved at once, shown at once, and the dialog stays.
    off.click();
    assert.equal(app.settings.combatAssist, false);
    assert.equal(stored(storage).combatAssist, false, 'saved at once');
    assert.deepEqual(checked(dialog.assistOptions), ['false', 'true']);
    assert.ok(off.classList.contains('is-current') && !on.classList.contains('is-current'));
    assert.equal(dialog.isOpen, true, 'the dialog stays open');
    // Nothing else changed.
    assert.equal(app.settings.mobileControls, 'joystick');
    assert.equal(app.settings.languageChosen, false);
    // A change made elsewhere shows while the dialog is open.
    app.settings.combatAssist = true;
    assert.deepEqual(checked(dialog.assistOptions), ['true', 'false']);
    off.click();
    // In French, through Language and back to Combat.
    dialog.tabs[0].click();
    languageNamed(dialog, 'fr').click();
    dialog.tabs[2].click();
    assert.equal(section.querySelector('.settings-group-title').textContent, 'Combat');
    assert.equal(section.querySelector('.settings-subtitle').textContent, 'Assistance au combat');
    assert.equal(desc.textContent,
      'Comble automatiquement un court écart avant une attaque au corps à corps. Ne consomme jamais d’énergie et n’agit jamais sur les attaques à distance.');
    assert.equal(energy.textContent, 'énergie');
    assert.match(on.textContent, /^Activée/);
    assert.match(on.textContent, /Par défaut/);
    assert.match(off.textContent, /^Désactivée/);
    assert.deepEqual(checked(dialog.assistOptions), ['false', 'true']);
    app.settings.set('language', 'en');
    assert.equal(energy.textContent, 'energy');
    assert.match(desc.textContent, /Never uses energy and never affects/);
    // Reopened on a new visit (the same device): Off, checked.
    const again = boot(storage);
    again.home.settingsButton.click();
    assert.deepEqual(checked(again.dialog.assistOptions), ['false', 'true']);
    again.done();
  } finally {
    done();
  }
});

test('keyboard and gamepad navigate tabs, visible settings and Close inside the dialog', () => {
  const { app, home, dialog, done } = boot();
  try {
    dialog.tabs.forEach((tab, i) => place(tab, 300 + i * 200, 100, 180, 44));
    place(dialog.closeButton, 900, 40, 44, 44);
    dialog.languageOptions.forEach((o, i) => place(o, 300 + i * 320, 180, 300, 50));
    dialog.schemeOptions.forEach((o, i) => place(o, 300 + i * 320, 220, 300, 160));
    place(dialog.customizeButton, 300, 400, 300, 44);
    dialog.assistOptions.forEach((o, i) => place(o, 300 + i * 320, 220, 300, 50));
    home.settingsButton.click();
    assert.equal(document.activeElement, dialog.tabs[0]);
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, languageNamed(dialog, 'en'));
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, languageNamed(dialog, 'fr'));
    assert.equal(app.settings.language, 'en', 'moving among settings is not choosing');
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, dialog.tabs[0], 'returns to its own tab');
    app.input.key('ArrowRight');
    assert.equal(dialog.activeSection, 'controls');
    assert.equal(document.activeElement, dialog.tabs[1]);
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, schemeNamed(dialog, 'joystick'));
    app.input.key('ArrowRight');
    app.input.pad('confirm');
    assert.equal(app.settings.mobileControls, 'classic');
    app.input.key('ArrowLeft');
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, dialog.customizeButton);
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, dialog.customizeButton, 'cannot enter hidden Combat');
    app.input.key('ArrowUp');
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, dialog.tabs[1]);
    app.input.pad('right');
    assert.equal(dialog.activeSection, 'combat');
    app.input.pad('down');
    assert.equal(document.activeElement, assistNamed(dialog, true));
    app.input.pad('right');
    assert.equal(app.settings.combatAssist, true);
    app.input.pad('confirm');
    assert.equal(app.settings.combatAssist, false);
    app.input.key('ArrowLeft');
    app.input.key('KeyJ');
    assert.equal(app.settings.combatAssist, true, 'keyboard confirm also chooses');
    app.input.pad('up');
    assert.equal(document.activeElement, dialog.tabs[2]);
    app.input.pad('right');
    assert.equal(dialog.activeSection, 'language', 'wraps after the last tab');
    app.input.pad('left');
    assert.equal(dialog.activeSection, 'combat', 'wraps before the first tab');
    assert.equal(app.screens.current, home);
    assert.ok(dialog.root.contains(document.activeElement));
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, dialog.closeButton);
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, dialog.tabs[2]);
    app.input.key('ArrowUp');
    app.input.key('KeyJ');
    assert.equal(dialog.isOpen, false);
    assert.equal(document.activeElement, home.settingsButton);
  } finally { done(); }
});

test('tabs expose one panel, roving tabindex and valid focus; switching does not write or reset settings', () => {
  const { app, home, dialog, storage, done } = boot();
  try {
    home.settingsButton.click();
    assert.equal(dialog.tablist.getAttribute('role'), 'tablist');
    assert.equal(dialog.tablist.getAttribute('aria-orientation'), 'horizontal');
    assert.deepEqual(dialog.tabs.map((tab) => tab.textContent), ['Language', 'Controls', 'Combat']);
    assert.equal(dialog.activeSection, 'language');
    app.settings.set('mobileControls', 'classic');
    app.settings.set('combatAssist', false);
    app.settings.setTouchLayout('classic', { jump: { x: 0.8, y: 0.7, scale: 1.2 } });
    const before = stored(storage);
    const writes = storage.writes;
    for (const current of dialog.categories) {
      current.tab.click();
      assert.equal(document.activeElement, current.tab);
      assert.equal(current.tab.tagName, 'BUTTON');
      assert.equal(current.tab.getAttribute('role'), 'tab');
      assert.equal(current.tab.hasAttribute('data-nav-no-hover-focus'), true);
      const candidates = app.nav.candidates(dialog.root);
      for (const category of dialog.categories) {
        const on = category === current;
        assert.equal(category.panel.hidden, !on);
        assert.equal(category.tab.getAttribute('aria-selected'), String(on));
        assert.equal(category.tab.getAttribute('tabindex'), on ? '0' : '-1');
        assert.equal(category.tab.classList.contains('is-active'), on);
        assert.equal(category.tab.getAttribute('aria-controls'), category.panel.getAttribute('id'));
        if (!on) assert.ok(!candidates.some((item) => category.panel.contains(item)), 'hidden controls excluded');
      }
      assert.deepEqual(stored(storage), before);
      assert.equal(storage.writes, writes);
      current.panel.scrollTop = 120;
    }
    dialog.tabs[1].click();
    assert.equal(dialog.sections.controls.scrollTop, 0, 'section restarts at top');
    dialog.customizeButton.focus();
    dialog.showSection('language');
    assert.equal(document.activeElement, dialog.tabs[0], 'focus leaves the hidden panel');
    dialog.tabs[2].click();
    dialog.close();
    home.settingsButton.click();
    assert.equal(dialog.activeSection, 'language', 'every opening starts on Language');
    assert.equal(document.activeElement, dialog.tabs[0]);
    assert.deepEqual(stored(storage), before);
    assert.match(stylesheet(), /\.settings-section\[hidden\]\s*\{\s*display: none;/);
  } finally { done(); }
});

test('Tab and Shift+Tab wrap within visible controls, and closing removes its scope only once', () => {
  const { app, home, dialog, done } = boot();
  try {
    home.settingsButton.click();
    dialog.tabs[1].click();
    let prevented = 0;
    const tab = (shiftKey) => dialog.root.dispatch('keydown', { key: 'Tab', shiftKey, preventDefault: () => prevented++ });
    dialog.customizeButton.focus();
    tab(false);
    assert.equal(document.activeElement, dialog.closeButton);
    tab(true);
    assert.equal(document.activeElement, dialog.customizeButton);
    assert.equal(prevented, 2);
    dialog.tabs[1].focus();
    tab(false);
    assert.equal(prevented, 2, 'ordinary Tab movement remains native');
    let pops = 0;
    const pop = app.nav.popScope.bind(app.nav);
    app.nav.popScope = (scope) => { pops++; pop(scope); };
    dialog.open();
    assert.equal(app.nav.scopes.length, 1, 'opening twice does not duplicate scopes');
    dialog.close();
    dialog.close();
    assert.equal(pops, 1);
  } finally { done(); }
});

test('another configured section gets a tab, panel and directional navigation without algorithm changes', () => {
  const control = new Element('button');
  control.setAttribute('data-nav', '');
  SETTINGS_SECTIONS.push({ id: 'test-section', label: 'settings.title', build: () => [control] });
  const { app, home, dialog, done } = boot();
  try {
    home.settingsButton.click();
    assert.equal(dialog.tabs.length, 4);
    app.input.pad('left');
    assert.equal(dialog.activeSection, 'test-section');
    assert.equal(dialog.currentSection.panel.hidden, false);
    assert.equal(dialog.currentSection.tab.getAttribute('aria-controls'), 'settings-panel-test-section');
    app.input.pad('down');
    assert.equal(document.activeElement, control);
    app.input.pad('up');
    assert.equal(document.activeElement, dialog.tabs[3]);
    app.input.pad('right');
    assert.equal(dialog.activeSection, 'language');
  } finally {
    SETTINGS_SECTIONS.pop();
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
  const css = stylesheet();
  assert.doesNotMatch(css, /\.settings-layout|\.screen--settings|\.settings-group \{/);
});

test('Help remains a placeholder: no Help screen, module, section or registration', () => {
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
  const css = stylesheet();
  assert.doesNotMatch(css, /\.help-layout|\.tab-panel|\.info-card|\.controls-table|\.mobile-diagram|\.md-[a-z]|pause-help|\.is-help|screen--help/);
});

test('the Home credits still roll: both copies, the second hidden, every credit unchanged in English', () => {
  const credits = creditsText();
  assert.deepEqual(credits.map((g) => g.title), [
    CONFIG.title, 'Original work', '#0001 sprite source', '#0002 sprite source', 'Rights', 'Project',
  ]);
  assert.equal(credits[0].lead, `Created by ${CONFIG.developer}`);
  assert.deepEqual(credits[2].lines, ['Sprite sheet by Finhj on DeviantArt', 'Sheet credits: ZetrasBlack, R0B4N']);
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
    assert.equal(credits[2].title, 'Source des sprites de #0001');
    assert.ok(credits[2].lines[0].includes('Finhj') && credits[2].lines[0].includes('DeviantArt'));
    assert.ok(credits[2].lines[1].includes('ZetrasBlack') && credits[2].lines[1].includes('R0B4N'));
    assert.equal(credits[3].title, 'Source des sprites de #0002');
    assert.ok(credits[3].lines[0].includes('thespriteanimations') && credits[3].lines[0].includes('DeviantArt'));
    assert.equal(credits[4].title, 'Droits');
    assert.equal(getLanguage(), 'fr');
  } finally {
    setLanguage('en');
  }
  assert.equal(t('credits.rights.title'), 'Rights');
});

// Every name a removed or replaced fighter's art was credited with (the
// first #0001's included): none of it applies now. (DeviantArt, where the
// first #0002's sheet came from, is where the new #0002's and #0001's
// sheets were published too: credited again, by their own artists.)
const RETIRED_CREDITS = [
  'Slender', 'Eric Knudsen', 'Victor Surge', 'Something Awful', 'XmayGrrr', 'Jus Sheet', 'renatoooferreiraaa',
  'Dazz', 'FRET', 'Jump Ultimate Stars', 'Spriters Resource',
];

test('the credits name only fighters that exist: a sprite group for each, #0001\'s its own sheet\'s, and nothing of a removed or replaced fighter is left', () => {
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
    'brand.title', 'credits.original.title', 'credits.sprites0001.title', 'credits.sprites0002.title', 'credits.rights.title',
    'credits.project.title',
  ]);
  // Two linked lines: #0001's and #0002's sheets, each on its DeviantArt
  // page (#0001's by the deviation's number alone, naming nothing).
  const links = CREDITS.flatMap((g) => g.lines || []).filter((line) => line?.href);
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://www.deviantart.com/finhj/art/1084627848');
  assert.match(links[1].href, /^https:\/\/www\.deviantart\.com\/thespriteanimations\/art\/[\w-]*1350194762$/);
  assert.doesNotMatch(read('js/ui/credits.js'), /slender|sprites0003|credits\.sprites\.|Dazz|FRET/i);
  for (const file of ['js/localization/i18n.js', 'js/localization/strings/en.js', 'js/localization/strings/fr.js']) {
    assert.doesNotMatch(read(file), /credits\.\d|credits\.sprites0003|credits\.sprites\.|slender|XmayGrrr/i, file);
  }
  // #0001's attribution: its sheet's artist and the credits the sheet
  // gives, then the notices after it.
  const credits = creditsText();
  const at = credits.findIndex((g) => g.title === '#0001 sprite source');
  assert.deepEqual(credits[at].lines, ['Sprite sheet by Finhj on DeviantArt', 'Sheet credits: ZetrasBlack, R0B4N']);
  assert.deepEqual(credits.slice(at + 1).map((g) => g.title), ['#0002 sprite source', 'Rights', 'Project']);
});

test('a credit line may still link to its source, accessibly, from the Home roll', () => {
  // A linked line, added for this check only: the address is data, its
  // label a translation key like any line's.
  const href = 'https://example.com/source-page';
  const group = { title: 'credits.sprites0001.title', lines: [{ label: 'credits.sprites0001.sheet', href }] };
  CREDITS.splice(CREDITS.length - 2, 0, group);
  const { home, done } = boot();
  try {
    // Only the line added here (#0001's and #0002's own linked credits are
    // left aside).
    const [first, copy] = home.el.querySelectorAll('.home-credits-seq')
      .map((seq) => seq.querySelectorAll('.home-credit-link').filter((a) => a.getAttribute('href') === href));
    assert.equal(first.length, 1);
    assert.equal(copy.length, 1);
    for (const a of [first[0], copy[0]]) {
      assert.equal(a.tagName, 'A');
      assert.equal(a.getAttribute('href'), href);
      assert.equal(a.getAttribute('target'), '_blank');
      assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(a.textContent, 'Sprite sheet by Finhj on DeviantArt', 'a descriptive name, not a bare address');
      assert.equal(a.getAttribute('data-i18n'), 'credits.sprites0001.sheet', 'it follows the language');
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
  for (const name of ['Finhj', 'DeviantArt', 'ZetrasBlack', 'R0B4N']) {
    assert.ok(fr[at].lines.join(' ').includes(name), `fr: ${name}`);
  }
});

test('both settings previews show directional Mouvement icons and retain their control structures', () => {
  const { dialog, done } = boot();
  try {
    const classic = dialog.root.querySelector('.settings-preview--classic');
    const joystick = dialog.root.querySelector('.settings-preview--joystick');
    assert.equal(classic.children.length, 4);
    assert.deepEqual(classic.children.map((node) => node.innerHTML), [ICONS.mouvementLeft, ICONS.mouvementRight, ICONS.left, ICONS.right]);
    assert.equal(classic.querySelectorAll('.sp-dash').length, 2);
    assert.equal(classic.querySelectorAll('.sp-pad').length, 2);
    assert.equal(joystick.children.length, 3);
    assert.deepEqual(joystick.children.map((node) => node.className), ['sp-dash sp-dash--left', 'sp-stick', 'sp-dash sp-dash--right']);
    assert.equal(joystick.querySelector('.sp-dash--left').innerHTML, ICONS.mouvementLeft);
    assert.equal(joystick.querySelector('.sp-dash--right').innerHTML, ICONS.mouvementRight);
    const stick = joystick.querySelector('.sp-stick');
    assert.equal(stick.innerHTML, '');
    assert.equal(stick.children.length, 1);
    assert.equal(stick.children[0].className, 'sp-knob');
    assert.equal(stick.children[0].children.length, 0);
    assert.equal(stick.children[0].innerHTML, '');
    assert.equal(joystick.getAttribute('aria-hidden'), 'true');
  } finally { done(); }
});
