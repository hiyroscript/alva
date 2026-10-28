// Run with node --test tests/integration/local-play.test.mjs (no dependencies).
// Local Play, whole: Home's Local play beside a half-width Play (always
// shown, open and glowing only with two supported controllers, live),
// Select local mode (Quick Battle only), Player 1's fighter, Player 2's
// fighter and the stage, each step owned by its player's controller (Back
// at every step, the same fighter twice, Random Stage, its own selection),
// then the Local Play battle: two players and no CPU, each with their own
// move HUD (Player 1's on the left, Player 2's on the right, each with its
// own controller's buttons), red and blue throughout, either controller
// pausing, a lost controller pausing the match until it is back, the
// winner by name, Rematch, Change fighters, Change stage and Return to home.
// Real ControllerManager, InputManager, MenuNavigator, screens and Battle
// on a minimal fake DOM with mocked pads; layout and paint, and real
// controllers, need a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeSprites, DT } from '../helpers/fighter-harness.mjs';
import { TEST_A, TEST_B, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { fakePad, setButton, padSource, PAD_IDS } from '../helpers/fake-gamepad.mjs';
import { stylesheet } from '../helpers/stylesheet.mjs';

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
  // As in a browser: a scripted click (a menu's confirm) has detail 0, a
  // pointer's click detail 1.
  click(detail = 0) {
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
const windowListeners = new Map();
globalThis.Node = Node;
globalThis.Path2D = class {
  constructor() { return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop) }); }
};
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); },
  removeEventListener: noop,
};
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

const { CONFIG } = await import('../../js/config.js');
const { MAPS } = await import('../../js/data/maps.js');
const { DEFAULT_DIFFICULTY } = await import('../../js/data/difficulty.js');
const { ConfirmDialog, ChoiceDialog } = await import('../../js/ui/overlays.js');
const { Settings } = await import('../../js/core/settings.js');
const { LOCAL_SETUP } = await import('../../js/ui/components.js');
const { setLanguage, localizeTree, t } = await import('../../js/localization/i18n.js');
const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { ControllerManager } = await import('../../js/core/controller-manager.js');
const { InputManager } = await import('../../js/core/input-manager.js');
const { App } = await import('../../js/core/app.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { ModeSelectScreen } = await import('../../js/screens/mode-select-screen.js');
const { DifficultySelectScreen } = await import('../../js/screens/difficulty-select-screen.js');
const { CharacterSelectScreen } = await import('../../js/screens/character-select-screen.js');
const { QuickCpuScreen } = await import('../../js/screens/quick-cpu-screen.js');
const { MapSelectScreen } = await import('../../js/screens/map-select-screen.js');
const { LocalModeSelectScreen, LocalFighterScreen, LocalMapScreen, LOCAL_MODES } = await import('../../js/screens/local-play-screens.js');
const { BattleScreen } = await import('../../js/screens/battle-screen.js');
const { Battle, BATTLE_MODES } = await import('../../js/game/battle.js');
const { getMap } = await import('../../js/data/maps.js');
const { getCharacter } = await import('../../js/data/characters.js');
const { CombatAIController } = await import('../../js/game/ai/combat-ai.js');
const { PlayerController } = await import('../../js/game/fighters/fighter-controller.js');

useTestFighters(TEST_A, TEST_B);

const DS = () => fakePad();
const XB = (index = 1) => fakePad({ index, id: PAD_IDS.xboxSeries });

// The app with real controllers and input over `pads` (a live list: push
// or splice to connect or disconnect), every screen Local Play passes
// through, and a frame loop: poll() is one animation frame (the
// controllers read, the menus or play fed), step() a frame and, in a
// running battle, one simulation step.
function boot({ pads = [] } = {}) {
  const sets = { 'test-a': fakeSprites(), 'test-b': fakeSprites() };
  const loading = {
    error: null,
    show: noop, hide: noop, setProgress: noop,
    showError(message, opts) { this.error = { message, opts }; },
  };
  const controllers = new ControllerManager({ source: padSource(pads), target: null });
  const input = new InputManager(CONFIG.bindings, { controllers });
  const app = {
    selection: {
      mode: 'quick-battle', playType: 'custom', difficulty: DEFAULT_DIFFICULTY, characterId: 'test-a', cpuCharacterId: 'test-a', mapId: MAPS[0].id,
      watch: { difficulty: DEFAULT_DIFFICULTY, cpu1CharacterId: 'test-a', cpu2CharacterId: 'test-a', mapId: MAPS[0].id },
      local: { mode: 'quick-battle', p1CharacterId: 'test-a', p2CharacterId: 'test-a', mapId: MAPS[0].id },
    },
    controllers,
    input,
    settings: new Settings(null),
    device: { reducedMotion: true, blockedPortrait: false, touchUI: false },
    audio: { play: noop },
    loading,
    loadCharacter: (id, onProgress) => { onProgress?.(1, 1); return Promise.resolve(sets[id] ?? null); },
    getSprites: (id) => sets[id] ?? null,
    resetCharacter: noop,
    startLocalPlay: App.prototype.startLocalPlay,
    endLocalPlay: App.prototype.endLocalPlay,
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  app.dialog = new ConfirmDialog(new Element('div'), app);
  app.choiceDialog = new ChoiceDialog(new Element('div'), app);
  const screens = {
    home: new HomeScreen(app),
    mode: new ModeSelectScreen(app),
    difficulty: new DifficultySelectScreen(app),
    character: new CharacterSelectScreen(app),
    quickCpu: new QuickCpuScreen(app),
    map: new MapSelectScreen(app),
    localMode: new LocalModeSelectScreen(app),
    localP1: new LocalFighterScreen(app, 1),
    localP2: new LocalFighterScreen(app, 2),
    localMap: new LocalMapScreen(app),
    battle: new BattleScreen(app),
  };
  for (const s of Object.values(screens)) app.screens.register(s);
  app.screens.go('home');
  let now = 0;
  const poll = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000 / 60;
      input.pollGamepads(now);
    }
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      poll();
      const screen = screens.battle;
      if (app.screens.current === screen && screen.isRunning) {
        screen.battle.update(DT);
        screen.syncAbilityHud();
      }
    }
  };
  // A press and release of `button` on `pad`, a frame each.
  const tap = (pad, button) => {
    setButton(pad, button, true);
    poll();
    setButton(pad, button, false);
    poll();
  };
  const key = (code) => {
    const e = { code, key: code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
    for (const fn of windowListeners.get('keydown') ?? []) fn(e);
    for (const fn of windowListeners.get('keyup') ?? []) fn(e);
  };
  poll();
  return { app, screens, pads, poll, step, tap, key };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const current = (app) => app.screens.current.id;
const slotOf = (screen, id) => screen.roster.slots.find((s) => s._def?.id === id);
const tileOf = (screen, id) => screen.tiles.find((c) => c._map.id === id);
const stepNames = (screen) => screen.el.querySelector('.steps').children.map((li) => li.querySelector('.step-name').textContent);
const note = (screen) => screen.el.querySelector('.local-turn');

// From Home with two controllers to the battle: every choice made on its
// own player's controller.
async function playLocal(booted, { p1 = TEST_A, p2 = TEST_B, mapId = MAPS[1].id } = {}) {
  const { app, screens, pads, tap } = booted;
  screens.home.actions.local.click();
  assert.equal(current(app), 'local-mode');
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p1');
  slotOf(screens.localP1, p1.id).focus();
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p2');
  slotOf(screens.localP2, p2.id).focus();
  tap(pads[1], 'south');
  assert.equal(current(app), 'local-map');
  tileOf(screens.localMap, mapId).focus();
  tap(pads[0], 'south');
  await settle();
  assert.equal(current(app), 'battle');
  return screens.battle.battle;
}

// ---- Home ------------------------------------------------------------------------

test('Home: Play is half its row and Local play the other half, always shown; it opens, and glows, only with two supported controllers', () => {
  const booted = boot();
  const { app, screens, pads, poll } = booted;
  const { play, local, watch } = screens.home.actions;
  const row = screens.home.el.querySelector('.home-actions-row');
  assert.ok(row.contains(play) && row.contains(local), 'one row');
  assert.equal(play.className, 'home-action home-action--primary', 'Play stays green');
  assert.ok(local.classNames.has('home-action') && !local.classNames.has('home-action--primary'), 'Local play: the secondary look, no green fill');
  assert.ok(local.html.includes('<span>Local play</span>'));
  const state = () => [local.disabled, local.classNames.has('is-ready')];
  assert.deepEqual(state(), [true, false], 'no controller');
  assert.equal(local.getAttribute('aria-describedby'), 'home-local-note');
  assert.equal(screens.home.localNote.textContent, 'Connect two controllers to play locally.');
  assert.equal(screens.home.localCell.getAttribute('title'), 'Connect two controllers to play locally.');
  pads.push(DS());
  poll();
  assert.deepEqual(state(), [true, false], 'one controller');
  pads.push(fakePad({ index: 1, id: PAD_IDS.switchPro }));
  poll();
  assert.deepEqual(state(), [true, false], 'an unsupported second device does not count');
  pads.push(XB(2));
  poll();
  assert.deepEqual(state(), [false, true], 'two: open, and glowing');
  assert.equal(local.hasAttribute('aria-describedby'), false);
  assert.equal(screens.home.localCell.getAttribute('title'), null);
  pads.pop();
  poll();
  assert.deepEqual(state(), [true, false], 'the second one gone: closed at once');
  pads.push(XB(2));
  poll();
  assert.deepEqual(state(), [false, true], 'and open again as it comes back');
  // Play still opens Select Mode.
  play.click();
  assert.equal(current(app), 'mode');
  app.screens.back();
  assert.equal(watch.disabled, false);
});

test('Home: the Local play press checks the controllers again, and never starts Local Play without two', () => {
  const { app, screens, pads, poll } = boot({ pads: [DS(), XB()] });
  const { local } = screens.home.actions;
  assert.equal(local.disabled, false);
  pads.pop(); // gone, with no frame since
  local.click();
  assert.equal(current(app), 'home');
  assert.equal(app.controllers.inLocal, false);
  assert.equal(local.disabled, true);
  pads.push(XB());
  poll();
  local.click();
  assert.equal(current(app), 'local-mode');
  assert.equal(app.controllers.inLocal, true);
  assert.equal(app.input.localPlay, true);
});

test('the stylesheet: two equal columns spanning the row, the Download button\'s glow on Local play once open, still with reduced motion', () => {
  const css = stylesheet();
  assert.match(css, /\.home-actions-row \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: inherit;/s);
  assert.match(css, /\.home-action--local\.is-ready \{ border-color: rgba\(47, 191, 99, 0\.6\); \}/, 'a green edge between pulses');
  assert.match(css, /\.home-action--local\.is-ready::after \{[^}]*border: 1px solid rgba\(47, 191, 99, 0\.6\);[^}]*box-shadow: 0 0 10px 1px rgba\(47, 191, 99, 0\.32\);[^}]*animation: home-download-glow 3\.2s ease-in-out infinite;/s,
    'the Download button\'s own border, glow and cadence');
  assert.match(css, /\.home-download::after \{[^}]*animation: home-download-glow 3\.2s/s, 'the same keyframes as Download');
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^]*\.home-action--local\.is-ready::after \{ animation: none; opacity: 0\.5; \}/);
  assert.doesNotMatch(css, /\.home-action--local[^{]*\{[^}]*background: var\(--action\)/, 'never a green fill');
  assert.match(css, /--player-1: #ff4d5e;/);
  assert.match(css, /--player-2: #3d9bff;/);
  assert.deepEqual(CONFIG.localPlay.colors, { p1: '#ff4d5e', p2: '#3d9bff' }, 'the canvas and the stylesheet share the two tones');
});

// ---- The setup ---------------------------------------------------------------------

test('Select local mode: Select Mode\'s own design, Quick Battle alone, no play type or difficulty, each player\'s controller named', () => {
  const { app, screens } = boot({ pads: [DS(), XB()] });
  screens.home.actions.local.click();
  const el = screens.localMode.el;
  assert.equal(el.querySelector('.screen-title').textContent, 'Select local mode');
  assert.equal(el.querySelector('.kicker').textContent, 'Local play');
  assert.equal(el.querySelectorAll('.mode-card').length, 1);
  assert.deepEqual(LOCAL_MODES.map((m) => m.id), ['quick-battle']);
  assert.equal(el.querySelector('.mode-name').textContent, 'Quick battle');
  assert.ok(el.querySelector('.mode-info'), 'Mode details');
  assert.ok(!/CPU|difficulty/i.test(el.querySelector('.mode-info').textContent), 'no CPU, no difficulty');
  assert.deepEqual(stepNames(screens.localMode), ['Player 1 fighter', 'Player 2 fighter', 'Stage']);
  assert.deepEqual(el.querySelectorAll('.local-device-name').map((n) => n.textContent), ['DualSense Wireless Controller', 'Xbox Wireless Controller']);
  // Back goes Home, which ends Local Play.
  screens.localMode.onBack();
  assert.equal(current(app), 'home');
  assert.equal(app.controllers.inLocal, false);
  assert.equal(app.input.localPlay, false);
});

test('the setup: Player 1\'s fighter on Player 1\'s controller, Player 2\'s on Player 2\'s, then the stage on Player 1\'s', () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { app, screens, pads, tap } = booted;
  screens.home.actions.local.click();
  tap(pads[1], 'south');
  assert.equal(current(app), 'local-mode', 'Player 2\'s Cross does nothing here');
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p1');
  const p1 = screens.localP1;
  assert.equal(p1.el.querySelector('.screen-title').textContent, 'Player 1 — select fighter');
  assert.equal(p1.el.querySelector('.screen-title-row').querySelector('.player-chip-tag').textContent, 'P1');
  assert.equal(p1.el.dataset.player, 'p1');
  assert.equal(note(p1).textContent, 'Player 1: use your controller to choose.');
  assert.deepEqual(stepNames(p1), ['Player 1 fighter', 'Player 2 fighter', 'Stage']);
  // The pointer, the keyboard and Player 2's controller choose nothing.
  slotOf(p1, TEST_B.id).click(1);
  slotOf(p1, TEST_B.id).click(0);
  p1.roster.confirm();
  assert.equal(current(app), 'local-character-p1');
  assert.equal(app.selection.local.p1CharacterId, 'test-a');
  slotOf(p1, TEST_B.id).focus();
  tap(pads[1], 'south');
  assert.equal(current(app), 'local-character-p1');
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p2', 'Player 1 confirms');
  assert.equal(app.selection.local.p1CharacterId, 'test-b');
  const p2 = screens.localP2;
  assert.equal(p2.el.querySelector('.screen-title').textContent, 'Player 2 — select fighter');
  assert.equal(p2.el.dataset.player, 'p2');
  assert.equal(note(p2).textContent, 'Player 2: use your controller to choose.');
  // Player 1 can no longer choose; Player 2 picks the same fighter.
  slotOf(p2, TEST_B.id).focus();
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p2');
  tap(pads[1], 'south');
  assert.equal(current(app), 'local-map', 'the same fighter for both: a mirror match');
  assert.deepEqual([app.selection.local.p1CharacterId, app.selection.local.p2CharacterId], ['test-b', 'test-b']);
  // Quick Battle's and Watch Mode's choices untouched.
  assert.deepEqual([app.selection.characterId, app.selection.cpuCharacterId, app.selection.difficulty, app.selection.playType],
    ['test-a', 'test-a', DEFAULT_DIFFICULTY, 'custom']);
  assert.equal(app.selection.watch.cpu1CharacterId, 'test-a');
  // The stage, on Player 1's controller: Random Stage only when chosen.
  const map = screens.localMap;
  assert.deepEqual(stepNames(map), ['Player 1 fighter', 'Player 2 fighter', 'Stage']);
  assert.equal(app.selection.local.mapId, MAPS[0].id, 'nothing drawn at random by itself');
  map.randomBtn.focus();
  tap(pads[1], 'south');
  assert.equal(app.selection.local.mapId, MAPS[0].id, 'Player 2\'s press rolls nothing');
  map.randomBtn.click(1);
  assert.equal(app.selection.local.mapId, MAPS[0].id, 'nor does the pointer');
  tap(pads[0], 'south');
  assert.ok(MAPS.some((m) => m.id === app.selection.local.mapId), 'Random Stage: a playable stage');
  assert.equal(current(app), 'local-map', 'and the players confirm it');
  tileOf(map, MAPS[2].id).click(1);
  map.start();
  assert.equal(current(app), 'local-map', 'the pointer starts nothing');
});

test('Back retraces every step on its own player\'s controller, every choice kept', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { app, screens, pads, tap } = booted;
  await playLocal(booted, { p1: TEST_B, p2: TEST_A, mapId: MAPS[2].id });
  screens.battle.leave(() => screens.battle.changeStage());
  assert.equal(current(app), 'local-map');
  tap(pads[1], 'east');
  assert.equal(current(app), 'local-map', 'Player 2\'s Back does nothing on Player 1\'s step');
  tap(pads[0], 'east');
  assert.equal(current(app), 'local-character-p2');
  tap(pads[0], 'east');
  assert.equal(current(app), 'local-character-p2', 'nor Player 1\'s on Player 2\'s');
  assert.equal(screens.localP2.roster.selectedId, 'test-a', 'Player 2\'s choice kept');
  tap(pads[1], 'east');
  assert.equal(current(app), 'local-character-p1');
  assert.equal(screens.localP1.roster.selectedId, 'test-b', 'Player 1\'s choice kept');
  tap(pads[0], 'east');
  assert.equal(current(app), 'local-mode');
  assert.equal(app.selection.local.mapId, MAPS[2].id, 'the stage kept');
  tap(pads[0], 'east');
  assert.equal(current(app), 'home');
  assert.equal(app.controllers.inLocal, false, 'Home ends Local Play');
});

test('a controller lost during the setup: the step waits, its choices kept, and goes on once it is back', () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { app, screens, pads, tap, poll } = booted;
  screens.home.actions.local.click();
  tap(pads[0], 'south');
  slotOf(screens.localP1, TEST_B.id).focus();
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p2');
  const p2 = screens.localP2;
  const ds = pads.shift();
  poll();
  assert.equal(note(p2).textContent, 'Player 1 controller disconnected. Reconnect it to continue.');
  assert.ok(note(p2).classNames.has('is-warning'));
  assert.equal(p2.roster.confirmBtn.disabled, true, 'nothing confirmed without both controllers');
  slotOf(p2, TEST_A.id).focus();
  tap(pads[0], 'south');
  assert.equal(current(app), 'local-character-p2', 'Player 2 waits too');
  assert.equal(app.selection.local.p1CharacterId, 'test-b', 'the choices so far kept');
  assert.equal(app.controllers.player2.family, 'xbox', 'nobody swapped seats');
  pads.unshift(ds);
  poll();
  assert.equal(note(p2).textContent, 'Player 2: use your controller to choose.');
  assert.equal(p2.roster.confirmBtn.disabled, false);
  tap(pads[1], 'south');
  assert.equal(current(app), 'local-map');
  // On Select local mode: it checks again before going on.
  booted.app.screens.go('home', {}, { reset: true });
  screens.home.actions.local.click();
  const xb = pads.pop();
  poll();
  screens.localMode.choose(LOCAL_MODES[0]);
  assert.equal(current(app), 'local-mode');
  assert.equal(note(screens.localMode).textContent, 'Player 2 controller disconnected. Reconnect it to continue.');
  pads.push(xb);
  poll();
  screens.localMode.choose(LOCAL_MODES[0]);
  assert.equal(current(app), 'local-character-p1');
});

// ---- The battle -------------------------------------------------------------------

test('the Local Play battle: two players on their own controllers, no CPU, P1 and P2, red and blue', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const battle = await playLocal(booted);
  const { app, screens } = booted;
  const screen = screens.battle;
  assert.equal(battle.mode, 'local');
  assert.deepEqual(Object.keys(BATTLE_MODES), ['quick-battle', 'watch', 'local']);
  for (const [f, slot] of [[battle.p1, 'p1'], [battle.p2, 'p2']]) {
    assert.ok(f.controller instanceof PlayerController, `${slot}: a player`);
    assert.ok(!(f.controller instanceof CombatAIController));
    assert.equal(f.controller.input, app.input.player(slot), `${slot}: its own controller`);
    assert.equal(f.controller.automaticTurnAround, app.settings.automaticTurnAround, 'both follow the Automatic turn-around setting');
  }
  assert.deepEqual([battle.p1.def.id, battle.p2.def.id], ['test-a', 'test-b']);
  assert.deepEqual([battle.p1.label, battle.p2.label], ['P1', 'P2']);
  assert.equal(battle.markerColor(battle.p1), CONFIG.localPlay.colors.p1, 'Player 1\'s marker red');
  assert.equal(battle.markerColor(battle.p2), CONFIG.localPlay.colors.p2, 'Player 2\'s blue');
  assert.ok(screen.el.classNames.has('is-local'));
  assert.equal(screen.touchRoot.hidden, true, 'no touch controls');
  assert.equal(screen.hud.left.tag.textContent, 'P1');
  assert.equal(screen.hud.right.tag.textContent, 'P2');
  assert.equal(screen.hud.right.wrap.getAttribute('aria-label'), 'Player 2');
  assert.equal(screen.pauseKicker.textContent, 'Local quick battle');
  assert.equal(app.input.menuOwner, 'any', 'either player drives the pause menu');
  // The same rules: points, clock and overtime.
  assert.equal(battle.pointsToWin, CONFIG.battle.pointsToWin);
  assert.equal(battle.roundSeconds, CONFIG.battle.matchSeconds);
  assert.equal(battle.overtimeSeconds, CONFIG.battle.overtimeSeconds);
});

test('both move HUDs: Player 1\'s bottom left, Player 2\'s bottom right, each its own fighter, controller and place', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const battle = await playLocal(booted);
  const { screens, pads, step } = booted;
  const screen = screens.battle;
  const [h1, h2] = [screen.abilityHud, screen.abilityHud2];
  assert.ok(screen.abilityRoot.classNames.has('ability-hud--p1'));
  assert.ok(screen.abilityRoot2.classNames.has('ability-hud--p2'));
  assert.deepEqual([h1.player, h2.player], ['p1', 'p2']);
  assert.deepEqual([h1.fighter, h2.fighter], [battle.p1, battle.p2]);
  assert.deepEqual([h1.root.hidden, h2.root.hidden], [false, false], 'both shown');
  assert.equal(h1.root.querySelector('.player-chip-tag').textContent, 'P1');
  assert.equal(h2.root.querySelector('.player-chip-tag').textContent, 'P2');
  assert.equal(h2.root.getAttribute('aria-label'), 'Player 2 abilities');
  // Each its own controller's glyphs: PlayStation and Xbox at once, never
  // the last device used.
  booted.key('KeyW');
  step(2);
  assert.equal(h1.root.querySelector('.ah-input').dataset.family, 'playstation');
  assert.equal(h2.root.querySelector('.ah-input').dataset.family, 'xbox');
  assert.deepEqual(battle.hudCooldownsFor, [battle.p1, battle.p2], 'both players\' cooldowns in their HUDs');
  // Player 1 jumps, Player 2 stays: each wheel follows its own fighter.
  battle.setPhase('fight');
  step(30);
  setButton(pads[0], 'south', true);
  step(8);
  setButton(pads[0], 'south', false);
  assert.equal(battle.p1.grounded, false);
  assert.equal(battle.p2.grounded, true);
  assert.deepEqual([h1.wheel.dataset.place, h2.wheel.dataset.place], ['air', 'ground']);
  // Under the Match Results, neither.
  battle.score.p2 = CONFIG.battle.pointsToWin;
  battle.finishMatch();
  step();
  screen.openResults();
  assert.deepEqual([h1.root.hidden, h2.root.hidden], [true, true]);
  screen.closeResults();
  assert.deepEqual([h1.root.hidden, h2.root.hidden], [false, false]);
  // Quick Battle keeps one (Player 1's, any device), Watch Mode none.
  const css = stylesheet();
  assert.match(css, /\.screen--battle\.is-local \.ability-hud--p1 \{[^}]*left: max\(var\(--safe-l\)[^}]*right: auto;/s, 'Player 1\'s on the left');
  assert.match(css, /html\.is-touch \.screen--battle\.is-local \.ability-hud:not\(\[hidden\]\) \{ display: block; \}/, 'shown on touch screens too');
  assert.match(css, /\.screen--battle\.is-local \.ability-hud \{ --ah-span: 36vw; \}/, 'each narrower, never meeting');
});

test('each player plays only their own fighter; the keyboard plays neither', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const battle = await playLocal(booted);
  const { pads, step, key } = booted;
  battle.setPhase('fight');
  step(30);
  const x = [battle.p1.body.x, battle.p2.body.x];
  pads[0].axes = [1, 0, 0, 0];
  pads[1].axes = [-1, 0, 0, 0];
  step(20);
  pads[0].axes = [0, 0, 0, 0];
  pads[1].axes = [0, 0, 0, 0];
  assert.ok(battle.p1.body.x > x[0] + 20 && battle.p2.body.x < x[1] - 20, 'both run at once, each their own way');
  step(30);
  const still = battle.p1.body.x;
  for (let i = 0; i < 10; i++) key('KeyD');
  step(10);
  assert.equal(battle.p1.body.x, still, 'the keyboard moves nobody');
  booted.app.input.setTouch('runRight', true);
  step(10);
  booted.app.input.setTouch('runRight', false);
  assert.equal(battle.p1.body.x, still, 'nor does touch');
});

test('either controller pauses; both at once open one pause menu; the world stops for both', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const battle = await playLocal(booted);
  const { app, screens, pads, step, tap } = booted;
  const screen = screens.battle;
  battle.setPhase('fight');
  step(5);
  tap(pads[1], 'start');
  assert.equal(screen.paused, true, 'Player 2 pauses');
  assert.equal(app.input.gameplayActive, false, 'no fighter takes input while paused');
  const t0 = battle.timeLeft;
  step(30);
  assert.equal(battle.timeLeft, t0, 'the clock stops');
  tap(pads[0], 'start');
  assert.equal(screen.paused, false, 'Player 1 resumes');
  step(2);
  setButton(pads[0], 'start', true);
  setButton(pads[1], 'start', true);
  step();
  assert.equal(screen.paused, true);
  assert.equal(app.nav.scopes.filter((s) => s === screen.pauseScope).length, 1, 'one pause menu');
  setButton(pads[0], 'start', false);
  setButton(pads[1], 'start', false);
  step(3);
  assert.equal(screen.paused, true, 'still open: nothing closed it again');
});

test('a controller lost mid-match pauses the whole match; nobody becomes a CPU or takes the seat; it resumes once back', async () => {
  const booted = boot({ pads: [DS(), XB(), fakePad({ index: 2, id: PAD_IDS.xboxOne })] });
  const battle = await playLocal(booted);
  const { app, screens, pads, step, tap } = booted;
  const screen = screens.battle;
  battle.setPhase('fight');
  step(5);
  const xb = pads.splice(1, 1)[0];
  step();
  assert.equal(screen.paused, true, 'paused at once');
  assert.equal(screen.connectionView.hidden, false);
  assert.equal(screen.pauseMenuView.hidden, true);
  assert.equal(screen.connectionTitle.textContent, 'Controller disconnected');
  assert.equal(screen.connectionMessage.textContent, 'Player 2 controller disconnected.');
  assert.equal(screen.connectionResume.disabled, true);
  const t0 = battle.timeLeft;
  const x0 = [battle.p1.body.x, battle.p2.body.x];
  step(30);
  assert.equal(battle.timeLeft, t0, 'the clock stops');
  assert.deepEqual([battle.p1.body.x, battle.p2.body.x], x0, 'both fighters stop');
  assert.ok(battle.p2.controller instanceof PlayerController, 'never a CPU');
  assert.equal(app.controllers.player2, null, 'the third controller does not take the seat by itself');
  assert.equal(screen.connectionSpares.children.length, 1, 'it may, explicitly');
  tap(pads[0], 'start');
  screen.resume();
  assert.equal(screen.paused, true, 'no resuming without both');
  // Back, with a button held: no attack comes of it.
  setButton(xb, 'west', true);
  pads.splice(1, 0, xb);
  step();
  assert.equal(app.controllers.player2.family, 'xbox');
  assert.equal(screen.connectionMessage.textContent, 'Both controllers are connected. Resume when you are ready.');
  assert.equal(screen.connectionResume.disabled, false);
  assert.equal(document.activeElement, screen.connectionResume);
  tap(pads[0], 'south');
  assert.equal(screen.paused, false, 'resumed through the usual Resume');
  assert.equal(screen.connectionView.hidden, true);
  step(5);
  assert.equal(battle.p2.combat.attack, null, 'the button held as it came back is no attack');
  setButton(xb, 'west', false);
});

test('a lost controller explicitly replaced by another: that one plays Player 2 from then on', async () => {
  const booted = boot({ pads: [DS(), XB(), fakePad({ index: 2, id: PAD_IDS.xboxOne })] });
  const battle = await playLocal(booted);
  const { app, screens, pads, step } = booted;
  battle.setPhase('fight');
  pads.splice(1, 1);
  step();
  const use = screens.battle.connectionSpares.children[0];
  assert.equal(use.textContent, 'Use Xbox One Controller for Player 2');
  use.click();
  assert.equal(app.controllers.player2.model, 'xboxOne');
  assert.equal(screens.battle.connectionResume.disabled, false);
});

test('the end, by name: PLAYER 2 WINS! in blue, the toast and the Match Results name the players; Rematch keeps everything', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const battle = await playLocal(booted);
  const { app, screens, step } = booted;
  const screen = screens.battle;
  battle.setPhase('fight');
  battle.score.p1 = 1;
  battle.score.p2 = CONFIG.battle.pointsToWin;
  battle.finishMatch();
  step();
  // As the screen's frame does once the match is over.
  screen.showFinal();
  screen.updateBanner();
  assert.equal(screen.bannerState, 'wins.p2');
  assert.equal(screen.bannerMain.textContent, 'PLAYER 2 WINS!');
  assert.equal(screen.toastText.textContent, 'Player 2 wins!');
  assert.equal(screen.toast.dataset.outcome, 'p2');
  assert.equal(screen.resultsLine.textContent, 'PLAYER 2 — WINNERPLAYER 1 — DEFEATED');
  assert.deepEqual(['p1', 'p2'].map((s) => screen.resultsTeams[s].name.textContent), ['Player 1', 'Player 2']);
  assert.deepEqual(['p1', 'p2'].map((s) => screen.statHeads[s].textContent), ['Player 1', 'Player 2']);
  assert.equal(screen.resultsTeams.p2.tag.textContent, 'P2');
  assert.equal(screen.finalBanner({ winner: null }), 'draw', 'a draw: DRAW, neutral');
  assert.equal(screen.finalBanner({ winner: 'p1' }), 'wins.p1');
  assert.doesNotMatch(screen.finalBanner({ winner: 'p1' }), /victory|defeat/);
  const css = stylesheet();
  assert.match(css, /\.battle-banner\[data-state="wins\.p1"\] \.banner-main \{ color: var\(--player-1\); \}/);
  assert.match(css, /\.battle-banner\[data-state="wins\.p2"\] \.banner-main \{ color: var\(--player-2\); \}/);
  // Rematch: the same fighters, stage, controllers; a fresh match.
  screen.rematch();
  const again = screen.battle;
  assert.equal(again.mode, 'local');
  assert.deepEqual(again.score, { p1: 0, p2: 0 });
  assert.equal(again.final, null);
  assert.deepEqual([again.p1.def.id, again.p2.def.id], ['test-a', 'test-b']);
  assert.ok(again.p1.controller instanceof PlayerController && again.p2.controller instanceof PlayerController);
  assert.equal(again.p2.controller.input, app.input.player('p2'));
  assert.equal(app.controllers.inLocal, true);
});

test('Change fighters and Change stage go to Local Play\'s own steps; Return to home ends Local Play and clears both HUDs', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { app, screens } = booted;
  await playLocal(booted);
  const screen = screens.battle;
  screen.leave(() => screen.changeFighters());
  assert.equal(current(app), 'local-character-p1', 'Player 1\'s fighter first');
  assert.equal(app.controllers.inLocal, true, 'the controllers kept');
  assert.equal(screen.abilityHud.fighter, null);
  assert.equal(screen.abilityHud2.fighter, null);
  app.screens.go('local-character-p2');
  app.screens.go('local-map');
  screens.localMap.start = MapSelectScreen.prototype.start;
  app.nav.commandSource = 'p1';
  screens.localMap.start();
  app.nav.commandSource = null;
  await settle();
  assert.equal(current(app), 'battle');
  screen.leave(() => screen.changeStage());
  assert.equal(current(app), 'local-map', 'Local Play\'s own Select Stage');
  app.screens.go('home', {}, { reset: true });
  assert.equal(app.controllers.inLocal, false);
  assert.equal(app.input.localPlay, false);
  assert.equal(app.input.menuOwner, 'p1');
  assert.equal(screen.abilityHud2.root.hidden, true);
});

test('Local Play\'s Battle keeps every rule: a hit is its dealer\'s, a fall scores for the other player, respawn, overtime; a mirror match stays two', () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { app, pads, poll } = booted;
  assert.equal(app.startLocalPlay(), true);
  const ONE = getCharacter('0001');
  const battle = new Battle({
    canvas: new Element('canvas'), map: getMap('desert'), mode: 'local', p1Def: ONE, p2Def: ONE,
    p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input: app.input, seed: 7,
  });
  app.input.setGameplayActive(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { poll(); battle.update(DT); } };
  battle.setPhase('fight');
  step(30);
  assert.notEqual(battle.p1.controller.input, battle.p2.controller.input, 'a mirror match: two pipelines');
  // Player 1 strikes Player 2 at close range: the damage is Player 1's.
  battle.p1.body.x = battle.p2.body.x - 34;
  battle.p1.facing = 1;
  step(2);
  setButton(pads[0], 'west', true);
  let steps = 0;
  while (battle.p2.combat.launchPoint === 0 && steps++ < 90) step();
  setButton(pads[0], 'west', false);
  assert.ok(battle.p2.combat.launchPoint > 0, 'Player 2 was hit');
  assert.equal(battle.p1.combat.launchPoint, 0, 'Player 1 was not');
  const stats = battle.stats.snapshot(battle.score);
  assert.ok(stats.p1.damageDealt > 0 && stats.p2.damageReceived > 0, 'credited to Player 1');
  assert.equal(stats.p2.damageDealt, 0);
  // Player 2 falls into the Void: Player 1's point, then Player 2 respawns.
  battle.p2.body.y = battle.stage.void.bottom + 400;
  step();
  assert.deepEqual(battle.score, { p1: 1, p2: 0 });
  assert.ok(battle.p2.lostToVoid);
  step(Math.ceil(CONFIG.battle.respawnSeconds / DT) + 2);
  assert.equal(battle.p2.lostToVoid, false, 'back after the usual wait');
  assert.ok(battle.p2.controller instanceof PlayerController, 'still Player 2\'s');
  // Level on points as the clock runs out: overtime, the Void closing in.
  battle.score.p2 = 1;
  battle.timeLeft = DT / 2;
  step();
  assert.equal(battle.overtime, true);
  step(30);
  assert.ok(battle.voidPressure > 0);
  app.endLocalPlay();
});

test('a battle of an unknown mode is refused, never played as Quick Battle; Local Play without two controllers is refused', async () => {
  const booted = boot({ pads: [DS()] });
  const { app, screens } = booted;
  app.screens.go('battle', { mode: 'locals', p1CharacterId: 'test-a', p2CharacterId: 'test-b' });
  await settle();
  assert.equal(screens.battle.battle, null);
  assert.equal(app.loading.error.message, t('battle.unknownMode'));
  app.loading.error = null;
  app.screens.go('battle', { mode: 'local', p1CharacterId: 'test-a', p2CharacterId: 'test-b' });
  await settle();
  assert.equal(screens.battle.battle, null);
  assert.equal(app.loading.error.message, t('local.needsControllers'));
});

test('Quick Battle is untouched: one player on every device against the CPU, one move HUD, Player 1\'s menus', async () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { app, screens } = booted;
  app.screens.go('battle', { mapId: MAPS[0].id, characterId: 'test-a', cpuCharacterId: 'test-b', difficulty: 'easy' });
  await settle();
  const battle = screens.battle.battle;
  assert.equal(battle.mode, 'quick-battle');
  assert.equal(battle.p1.controller.input, app.input, 'Player 1: keyboard, touch and its controller, as ever');
  assert.ok(battle.p2.controller instanceof CombatAIController);
  assert.equal(screens.battle.abilityHud.player, null);
  assert.equal(screens.battle.abilityHud2.root.hidden, true);
  assert.equal(screens.battle.el.classNames.has('is-local'), false);
  assert.equal(battle.markerColor(battle.p1), '#ffffff');
  assert.equal(app.input.menuOwner, 'p1');
  assert.equal(app.input.localPlay, false);
});

test('Local Play reads in French too, and follows a language change on the spot', () => {
  const booted = boot({ pads: [DS(), XB()] });
  const { screens, pads, tap } = booted;
  screens.home.actions.local.click();
  tap(pads[0], 'south');
  slotOf(screens.localP1, TEST_A.id).focus();
  tap(pads[0], 'south');
  setLanguage('fr');
  try {
    for (const s of Object.values(screens)) localizeTree(s.el);
    assert.match(t('home.local'), /^Jeu local$/);
    assert.equal(screens.localMode.el.querySelector('.screen-title').textContent, 'Choisir le mode local');
    assert.equal(screens.localP2.el.querySelector('.screen-title').textContent, 'Joueur 2 — choisir le combattant');
    assert.equal(note(screens.localP2).textContent, 'Joueur 2 : utilisez votre manette pour choisir.');
    assert.deepEqual(stepNames(screens.localP2), ['Combattant du joueur 1', 'Combattant du joueur 2', 'Arène']);
    assert.equal(screens.localP2.el.querySelector('.screen-title-row').querySelector('.player-chip-tag').textContent, 'J2');
    assert.equal(t('banner.playerWins', { n: 1 }), 'VICTOIRE DU JOUEUR 1 !');
  } finally {
    setLanguage('en');
    for (const s of Object.values(screens)) localizeTree(s.el);
  }
});

test('the code: one shared colour for each player, Local Play\'s screens registered and in the page', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const html = read('index.html');
  for (const id of ['local-mode', 'local-character-p1', 'local-character-p2', 'local-map']) assert.match(html, new RegExp(`data-screen="${id}"`));
  const app = read('js/core/app.js');
  assert.match(app, /s\.register\(new LocalModeSelectScreen\(this\)\);/);
  assert.match(app, /s\.register\(new LocalFighterScreen\(this, 1\)\);\s*s\.register\(new LocalFighterScreen\(this, 2\)\);\s*s\.register\(new LocalMapScreen\(this\)\);/);
  assert.equal(LOCAL_SETUP.steps.length, 3, 'three steps: no CPU, difficulty or play type');
  // No fighter's id special-cased, nor a second simulation.
  for (const path of ['js/screens/local-play-screens.js', 'js/ui/local-play.js']) {
    assert.doesNotMatch(read(path), /'00\d\d'/, path);
    assert.doesNotMatch(read(path), /new Battle\(|extends Arena/, path);
  }
});
