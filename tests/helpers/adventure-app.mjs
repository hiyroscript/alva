// Adventure on a minimal fake DOM, for its screen and flow tests (imported
// by tests/interface/adventure.test.mjs and tests/integration/adventure.test.mjs;
// not a test file itself): the real ScreenManager, MenuNavigator, choice
// dialog, Perquisite cards, Select Mode, the level selector, Adventure's and
// Quick Battle's Select Fighter and the Battle screen, with Adventure's
// progress on a storage the test can keep (a fresh App reads it again).
// Layout and paint need real-browser checks.

import { fakeSprites, fakeSpritesOf } from './fighter-harness.mjs';

const noop = () => {};

class Node {
  parentNode = null;
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
const BOOLEAN_ATTRS = ['hidden', 'disabled', 'inert'];
export class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = { setProperty(name, value) { this[name] = value; } };
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  html = '';
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
  removeAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = false;
    else this.attrs.delete(name);
  }
  get id() { return this.getAttribute('id'); }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  get innerHTML() { return this.html; }
  get firstChild() { return this.children[0] ?? null; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, ...event }); }
  // `detail` 0 is a keyboard / gamepad activation, 1 a pointer press.
  click(detail = 1) {
    if (this.disabled) return;
    this.dispatch('click', { detail, preventDefault: noop });
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
  scrollBy() {}
  scrollIntoView() {}
  setPointerCapture() {}
  hasPointerCapture() { return false; }
  getContext() { return (this.ctx ??= fakeContext()); }
}

// Every drawing call is a no-op; state set on it is kept.
function fakeContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (key === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

const sections = new Map();
globalThis.Node = Node;
globalThis.Path2D = class {
  constructor() { return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop) }); }
};
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.requestAnimationFrame = noop;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  hidden: false,
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
  hasFocus: () => true,
};



const { getCharacter, playableCharacters } = await import('../../js/data/characters.js');
const { ConfirmDialog, ChoiceDialog } = await import('../../js/ui/overlays.js');
const { PerquisiteCards } = await import('../../js/ui/perquisite-cards.js');
const { Settings } = await import('../../js/core/settings.js');
const { AdventureProgress } = await import('../../js/core/adventure-progress.js');
const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { initialSelection } = await import('../../js/core/app.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { ModeSelectScreen } = await import('../../js/screens/mode-select-screen.js');
const { AdventureLevelScreen } = await import('../../js/screens/adventure-level-screen.js');
const { adventureFighterScreen } = await import('../../js/screens/adventure-setup.js');
const { DifficultySelectScreen } = await import('../../js/screens/difficulty-select-screen.js');
const { CharacterSelectScreen } = await import('../../js/screens/character-select-screen.js');
const { BattleScreen } = await import('../../js/screens/battle-screen.js');

export { body };

// A storage the test keeps between Apps (getItem / setItem, as the
// browser's).
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    writes: 0,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { this.writes++; map.set(k, String(v)); },
  };
}

// Keyboard input (key() runs a keydown through every listener, menus first,
// as in the app) and gamepad menu commands (pad()).
export function fakeInput() {
  const keys = new Set();
  const pads = new Set();
  return {
    gameplayActive: false,
    lastDevice: 'keyboard',
    onKey(fn) { keys.add(fn); return () => keys.delete(fn); },
    onPadMenu(fn) { pads.add(fn); },
    key(code) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
      for (const fn of [...keys]) fn(e);
    },
    pad(cmd) { for (const fn of [...pads]) fn(cmd); },
    setGameplayActive(on) { this.gameplayActive = on; },
    setMenuOwner: noop,
    flush: noop,
    sample: () => ({}),
  };
}

// The app with Adventure's screens, reduced motion so screens swap without
// timers, its progress on `storage` (a fresh one by default). Every playable
// fighter loads from one fake sprite set each.
export function boot({ storage = memoryStorage(), reducedMotion = true } = {}) {
  const sets = new Map();
  const spritesOf = (id) => {
    if (!sets.has(id)) sets.set(id, getCharacter(id) ? fakeSpritesOf(getCharacter(id)) : fakeSprites());
    return sets.get(id);
  };
  const app = {
    selection: initialSelection(),
    input: fakeInput(),
    settings: new Settings(null),
    adventure: new AdventureProgress(storage),
    storage,
    device: { reducedMotion, blockedPortrait: false },
    audio: { play: noop },
    loading: { show: noop, hide: noop, setProgress: noop, showError(message) { this.error = message; } },
    loadCharacter(id, onProgress) {
      onProgress?.(4, 4);
      return Promise.resolve(spritesOf(id));
    },
    getSprites: (id) => spritesOf(id),
    resetCharacter: noop,
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  app.dialog = new ConfirmDialog(new Element('div'), app);
  app.choiceDialog = new ChoiceDialog(new Element('div'), app);
  app.perquisiteCards = new PerquisiteCards(new Element('div'), app);
  const screens = {
    home: new HomeScreen(app),
    mode: new ModeSelectScreen(app),
    levels: new AdventureLevelScreen(app),
    fighter: adventureFighterScreen(app),
    difficulty: new DifficultySelectScreen(app),
    character: new CharacterSelectScreen(app),
    battle: new BattleScreen(app),
  };
  for (const s of Object.values(screens)) app.screens.register(s);
  app.screens.go('home');
  return { app, screens };
}

export const settle = () => new Promise((resolve) => setImmediate(resolve));
export async function settleAll(n = 6) {
  for (let i = 0; i < n; i++) await settle();
}
export const current = (app) => app.screens.current.id;
export const stepNames = (screen) => screen.el.querySelector('.steps').children.map((li) => li.querySelector('.step-name').textContent);
export const currentStep = (screen) => screen.el.querySelector('.steps').children.findIndex((li) => li.classList.contains('is-current'));
export const firstFighter = () => playableCharacters()[0];
