// Run with node --test tests/settings.test.mjs (no dependencies).
// Settings: the versioned settings store (Joystick by default, persistence,
// and the safe fallback for missing, corrupt, foreign or blocked storage),
// its registration, Home → Settings → Back through the real ScreenManager
// and MenuNavigator, the Mobile Controls choice (exactly Joystick and
// Classic Buttons), and what the removal of Help left behind: no Help
// screen or module anywhere, and the Home credits roll intact. On a minimal
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
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, ...event }); }
  click(detail = 1) {
    if (this.disabled) return;
    this.dispatch('click', { detail, preventDefault: noop });
  }
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
    this.dispatch('focus');
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
  getBoundingClientRect() { return this.rect; }
  scrollIntoView() {}
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
  Settings, SETTINGS_KEY, SETTINGS_VERSION, DEFAULT_SETTINGS, MOBILE_CONTROLS, MOBILE_CONTROLS_LABELS, DEFAULT_MOBILE_CONTROLS,
} = await import('../js/core/settings.js');
const { ScreenManager } = await import('../js/core/screen-manager.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { HomeScreen } = await import('../js/screens/home-screen.js');
const { SettingsScreen } = await import('../js/screens/settings-screen.js');
const { CREDITS } = await import('../js/ui/credits.js');
const { CONFIG } = await import('../js/config.js');

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

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

// Home and Settings on the real ScreenManager and MenuNavigator, starting on
// Home, with settings kept in `storage`. Reduced motion, so screens swap
// without timers.
function boot(storage = memoryStorage()) {
  const app = {
    input: fakeInput(),
    device: { reducedMotion: true },
    audio: { play: noop },
    settings: new Settings(storage),
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const home = new HomeScreen(app);
  const settings = new SettingsScreen(app);
  app.screens.register(home);
  app.screens.register(settings);
  app.screens.go('home');
  return { app, home, settings, storage };
}

const place = (el, left, top, width, height) => { el.rect = { left, top, width, height }; };
const optionNamed = (screen, scheme) => screen.options.find((o) => o.getAttribute('data-mobile-controls') === scheme);

// ---- The settings store ---------------------------------------------------------

test('Mobile Controls has exactly two choices, Joystick and Classic Buttons, and Joystick is the default', () => {
  assert.deepEqual([...MOBILE_CONTROLS], ['joystick', 'classic']);
  assert.deepEqual({ ...MOBILE_CONTROLS_LABELS }, { joystick: 'Joystick', classic: 'Classic Buttons' });
  assert.equal(DEFAULT_MOBILE_CONTROLS, 'joystick');
  assert.deepEqual({ ...DEFAULT_SETTINGS }, { mobileControls: 'joystick' });
  // A player who never chose gets the Joystick.
  const storage = memoryStorage();
  const settings = new Settings(storage);
  assert.equal(settings.mobileControls, 'joystick');
  assert.equal(storage.writes, 0, 'nothing written just by reading');
});

test('a choice is saved as one small versioned object under one key, and a reload keeps it', () => {
  assert.equal(SETTINGS_KEY, 'alva.settings');
  assert.equal(SETTINGS_VERSION, 1);
  const storage = memoryStorage();
  const settings = new Settings(storage);
  const heard = [];
  const off = settings.onChange((name, value) => heard.push([name, value]));
  assert.equal(settings.set('mobileControls', 'classic'), true);
  assert.equal(settings.mobileControls, 'classic');
  assert.deepEqual(JSON.parse(storage.map.get(SETTINGS_KEY)), { version: 1, mobileControls: 'classic' });
  assert.deepEqual([...storage.map.keys()], [SETTINGS_KEY], 'one key, nothing scattered');
  assert.deepEqual(heard, [['mobileControls', 'classic']]);
  // Setting the same value again is no change: nothing written or announced.
  const writes = storage.writes;
  settings.set('mobileControls', 'classic');
  assert.equal(storage.writes, writes);
  assert.equal(heard.length, 1);
  off();
  settings.mobileControls = 'joystick';
  assert.equal(heard.length, 1, 'unsubscribed');
  // Reopening ALVA reads it back.
  settings.set('mobileControls', 'classic');
  assert.equal(new Settings(storage).mobileControls, 'classic');
});

test('unknown values are refused and never stored', () => {
  const storage = memoryStorage();
  const settings = new Settings(storage);
  for (const bad of ['Joystick', 'buttons', '', null, undefined, 1, {}]) {
    assert.equal(settings.set('mobileControls', bad), false, String(bad));
    assert.equal(settings.mobileControls, 'joystick');
  }
  assert.equal(settings.set('volume', 3), false, 'no such setting');
  assert.equal(storage.writes, 0);
});

test('missing, corrupt, foreign or invalid stored settings fall back to Joystick', () => {
  const stored = (raw) => new Settings(memoryStorage(raw === undefined ? {} : { [SETTINGS_KEY]: raw })).mobileControls;
  assert.equal(stored(undefined), 'joystick', 'nothing stored');
  assert.equal(stored('{not json'), 'joystick', 'corrupt JSON');
  assert.equal(stored('null'), 'joystick');
  assert.equal(stored('"classic"'), 'joystick', 'not an object');
  assert.equal(stored('[]'), 'joystick');
  assert.equal(stored(JSON.stringify({ mobileControls: 'classic' })), 'joystick', 'no version');
  assert.equal(stored(JSON.stringify({ version: 2, mobileControls: 'classic' })), 'joystick', 'another version');
  assert.equal(stored(JSON.stringify({ version: 1, mobileControls: 'dpad' })), 'joystick', 'not one of the choices');
  assert.equal(stored(JSON.stringify({ version: 1, mobileControls: 'CLASSIC' })), 'joystick');
  assert.equal(stored(JSON.stringify({ version: 1 })), 'joystick', 'the setting missing');
  assert.equal(stored(JSON.stringify({ version: 1, mobileControls: 'classic', extra: true })), 'classic', 'a valid one is kept');
  // A bad stored value is replaced cleanly by the next choice.
  const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
  new Settings(storage).set('mobileControls', 'classic');
  assert.deepEqual(JSON.parse(storage.map.get(SETTINGS_KEY)), { version: 1, mobileControls: 'classic' });
});

test('blocked or absent storage never breaks the game: Joystick, and choices last for the visit', () => {
  for (const storage of [blockedStorage, null]) {
    const settings = new Settings(storage);
    assert.equal(settings.mobileControls, 'joystick');
    assert.equal(settings.set('mobileControls', 'classic'), true);
    assert.equal(settings.mobileControls, 'classic', 'kept in memory');
  }
  // The default store is the browser's localStorage; none at all, or one
  // whose accessor throws, is no store.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stub = (desc) => Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...desc });
  try {
    const browser = memoryStorage();
    stub({ value: browser });
    new Settings().set('mobileControls', 'classic');
    assert.deepEqual(JSON.parse(browser.map.get(SETTINGS_KEY)), { version: 1, mobileControls: 'classic' });
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
  // Only the settings module touches storage.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
      else if (entry.name.endsWith('.js')) files.push(`${dir}${entry.name}`);
    }
  };
  walk('js/');
  const users = files.filter((f) => /localStorage|sessionStorage/.test(read(f)));
  assert.deepEqual(users, ['js/core/settings.js']);
});

// ---- Registration -------------------------------------------------------------------

test('Settings is a registered screen with its own labelled section, and the app keeps one Settings store', () => {
  const html = read('index.html');
  const section = html.match(/<section[^>]*data-screen="settings"[^>]*>/)?.[0];
  assert.ok(section, 'index.html has the Settings section');
  assert.match(section, /aria-label="Settings"/);
  assert.match(section, /class="screen screen--menu screen--settings"/);
  assert.match(section, /\bhidden\b/);
  const app = read('js/core/app.js');
  assert.match(app, /import \{ SettingsScreen \} from '\.\.\/screens\/settings-screen\.js';/);
  assert.match(app, /s\.register\(new SettingsScreen\(this\)\);/);
  assert.match(app, /this\.settings = new Settings\(\);/);
  const { settings, app: fake } = boot();
  assert.equal(settings.id, 'settings');
  assert.equal(fake.screens.get('settings'), settings);
  assert.equal(settings.navigable, true);
  assert.equal(settings.el.hidden, true, 'hidden until opened');
});

// ---- Home ⇄ Settings ------------------------------------------------------------------

test('Home → Settings shows the Mobile Controls choice; Back returns Home', () => {
  const { app, home, settings } = boot();
  const button = home.actions.settings;
  assert.ok(button.html.includes('<span>Settings</span>'));
  assert.equal(button.getAttribute('data-home-action'), 'settings');
  button.click();
  assert.equal(app.screens.current, settings);
  assert.equal(settings.el.hidden, false);
  assert.equal(home.el.hidden, true);
  assert.equal(document.documentElement.dataset.screen, 'settings');
  assert.equal(settings.el.querySelector('.screen-title').textContent, 'Settings');
  assert.equal(settings.el.querySelector('.settings-group-title').textContent, 'Mobile Controls');
  assert.equal(document.activeElement, optionNamed(settings, 'joystick'), 'focus lands on the layout in use');

  const back = settings.el.querySelector('.btn-back');
  assert.equal(back.getAttribute('aria-label'), 'Back');
  back.click();
  assert.equal(app.screens.current, home);
  assert.equal(settings.el.hidden, true);
  assert.ok(document.activeElement.html.includes('<span>Play</span>'), 'Home focuses Play again');
  // Esc and gamepad Back leave it too.
  home.actions.settings.click();
  app.input.key('Escape');
  assert.equal(app.screens.current, home);
  home.actions.settings.click();
  app.nav.command('back', null);
  assert.equal(app.screens.current, home);
});

test('the choice is two real radio buttons named Joystick and Classic Buttons, and picking one saves it', () => {
  const { app, home, settings, storage } = boot();
  home.actions.settings.click();
  const group = settings.el.querySelector('.settings-options');
  assert.equal(group.getAttribute('role'), 'radiogroup');
  assert.equal(group.getAttribute('aria-labelledby'), settings.el.querySelector('.settings-group-title').getAttribute('id'));
  assert.equal(settings.options.length, 2, 'exactly two choices');
  const names = settings.options.map((o) => o.querySelector('.settings-option-name').children[0].textContent);
  assert.deepEqual(names, ['Joystick', 'Classic Buttons']);
  for (const option of settings.options) {
    assert.equal(option.tagName, 'BUTTON');
    assert.equal(option.getAttribute('type'), 'button');
    assert.equal(option.getAttribute('role'), 'radio');
    assert.equal(option.hasAttribute('data-nav'), true, 'reached by keyboard / gamepad');
    const desc = settings.el.querySelectorAll('.settings-option-desc').find((d) => d.getAttribute('id') === option.getAttribute('aria-describedby'));
    assert.ok(desc, 'described by its line');
  }
  const [joystick, classic] = settings.options;
  assert.match(joystick.textContent, /Default/, 'the default is marked');
  assert.doesNotMatch(classic.textContent, /Default/);
  assert.deepEqual(settings.options.map((o) => o.getAttribute('aria-checked')), ['true', 'false']);
  assert.ok(joystick.classList.contains('is-current'));

  classic.click();
  assert.equal(app.settings.mobileControls, 'classic');
  assert.deepEqual(settings.options.map((o) => o.getAttribute('aria-checked')), ['false', 'true']);
  assert.ok(classic.classList.contains('is-current'));
  assert.equal(joystick.classList.contains('is-current'), false);
  assert.equal(app.screens.current, settings, 'the screen stays open');
  assert.deepEqual(JSON.parse(storage.map.get(SETTINGS_KEY)), { version: 1, mobileControls: 'classic' });

  // Reopened (a new visit, the same device): Classic Buttons, checked and focused.
  const again = boot(storage);
  again.home.actions.settings.click();
  assert.deepEqual(again.settings.options.map((o) => o.getAttribute('aria-checked')), ['false', 'true']);
  assert.equal(document.activeElement, optionNamed(again.settings, 'classic'));
  optionNamed(again.settings, 'joystick').click();
  assert.equal(new Settings(storage).mobileControls, 'joystick', 'and back again');
});

test('keyboard and gamepad reach Settings from Home and switch the layout', () => {
  const { app, home, settings } = boot();
  Object.values(home.actions).forEach((b, i) => place(b, 80, 300 + i * 50, 320, 44));
  place(settings.el.querySelector('.btn-back'), 40, 20, 90, 44);
  settings.options.forEach((o, i) => place(o, 40 + i * 420, 160, 400, 200));

  // Down through Home by name, whatever the menu's length, to Settings.
  assert.equal(document.activeElement, home.actions.play);
  const order = Object.values(home.actions);
  for (let i = 1; i < order.indexOf(home.actions.settings) + 1; i++) {
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, order[i]);
  }
  assert.equal(document.activeElement, home.actions.settings);
  app.input.key('KeyJ');
  assert.equal(app.screens.current, settings);

  const joystick = optionNamed(settings, 'joystick');
  const classic = optionNamed(settings, 'classic');
  assert.equal(document.activeElement, joystick);
  app.input.key('ArrowRight');
  assert.equal(document.activeElement, classic);
  assert.equal(app.settings.mobileControls, 'joystick', 'moving is not choosing');
  app.nav.command('confirm', null); // gamepad A
  assert.equal(app.settings.mobileControls, 'classic');
  app.input.key('ArrowLeft');
  app.nav.command('confirm', null);
  assert.equal(app.settings.mobileControls, 'joystick');
  app.input.key('ArrowUp');
  assert.equal(document.activeElement, settings.el.querySelector('.btn-back'));
  app.input.key('KeyJ');
  assert.equal(app.screens.current, home);
});

// ---- Help is gone; credits stay ---------------------------------------------------

test('Help is removed from the game: no Help screen, module, section or registration', () => {
  assert.equal(existsSync(new URL('js/ui/help-content.js', ROOT)), false);
  assert.equal(existsSync(new URL('js/screens/help-credits-screen.js', ROOT)), false);
  const html = read('index.html');
  assert.doesNotMatch(html, /data-screen="help"|screen--help|Help and credits/);
  assert.doesNotMatch(read('js/core/app.js'), /HelpCredits|help-credits|help-content/);
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
      else if (entry.name.endsWith('.js')) files.push(`${dir}${entry.name}`);
    }
  };
  walk('js/');
  for (const file of files) {
    const code = read(file);
    assert.doesNotMatch(code, /help-content|help-credits|buildHelp|buildCredits|helpOpen|openHelp|closeHelp|pauseHelp/, file);
  }
  // Its styles went with it.
  const css = read('styles.css');
  assert.doesNotMatch(css, /\.help-layout|\.tab-panel|\.info-card|\.controls-table|\.mobile-diagram|\.md-[a-z]|pause-help|\.is-help|screen--help/);
});

test('the Home credits still roll: both copies, the second hidden, every credit unchanged', () => {
  assert.deepEqual(CREDITS.map((g) => g.title), [CONFIG.title, 'Original work', '#0001 sprite source', 'Rights', 'Project']);
  assert.equal(CREDITS[0].lead, `Created by ${CONFIG.developer}`);
  assert.deepEqual(CREDITS[2].lines, [
    'Original sprite material from Jump Ultimate Stars',
    'The Spriters Resource',
    'Source sheet uploaded by Dazz',
    'Contributor: FRET',
  ]);
  assert.match(read('js/screens/home-screen.js'), /import \{ CREDITS \} from '\.\.\/ui\/credits\.js';/);

  const { home } = boot();
  const region = home.el.querySelector('.home-credits-col');
  assert.equal(region.getAttribute('role'), 'region');
  assert.match(region.getAttribute('aria-label'), /^Credits/);
  const seqs = home.el.querySelectorAll('.home-credits-seq');
  assert.equal(seqs.length, 2, 'the roll holds the credits twice, for its loop');
  assert.equal(seqs[0].getAttribute('aria-hidden'), null, 'announced once');
  assert.equal(seqs[1].getAttribute('aria-hidden'), 'true');
  for (const seq of seqs) {
    const groups = seq.querySelectorAll('.home-credit');
    assert.deepEqual(groups.map((g) => g.querySelector('.home-credit-title').textContent), CREDITS.map((g) => g.title));
    const lines = seq.querySelectorAll('.home-credit-line').map((p) => p.textContent);
    assert.deepEqual(lines, CREDITS.flatMap((g) => g.lines || []));
    assert.equal(seq.querySelector('.home-credit-lead').textContent, CREDITS[0].lead);
  }
});
