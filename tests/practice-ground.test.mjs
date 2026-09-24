// Run with node --test tests/practice-ground.test.mjs (no dependencies).
// Practice Ground: the Home entry, the solo PracticeSession, its HUD, the
// Practice menu and the Change Fighter dialog, on a minimal fake DOM and a
// no-op Canvas; plus checks that Quick Battle keeps its CPU, timer and
// stages. Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeSprites, def as DEF_0001, DT } from './fighter-harness.mjs';

// ---- Fake DOM + Canvas -------------------------------------------------------

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
    if (name === 'id') return this.attrs.get('id') ?? null;
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  get id() { return this.getAttribute('id'); }
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
  // Like the real thing: disabled buttons ignore click(). `detail` 0 is a
  // keyboard / gamepad activation, 1 a pointer press.
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

// Counts constructions, so drawing can be shown to build no Path2D.
let path2dCount = 0;
class FakePath2D {
  constructor() {
    path2dCount++;
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop) });
  }
}

const docListeners = new Map();
const sections = new Map();
globalThis.Node = Node;
globalThis.Path2D = FakePath2D;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.ResizeObserver = class {
  static live = new Set();
  observe() { ResizeObserver.live.add(this); }
  disconnect() { ResizeObserver.live.delete(this); }
};
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
  addEventListener: (type, fn) => {
    if (!docListeners.has(type)) docListeners.set(type, new Set());
    docListeners.get(type).add(fn);
  },
  removeEventListener: (type, fn) => docListeners.get(type)?.delete(fn),
};

const { CONFIG } = await import('../js/config.js');
const { CHARACTERS, getCharacter } = await import('../js/data/characters.js');
const { MAPS, getMap } = await import('../js/data/maps.js');
const { PRACTICE_MAP } = await import('../js/data/practice-map.js');
const { createTheme } = await import('../js/stages/index.js');
const { PracticeTheme } = await import('../js/stages/practice-theme.js');
const { PracticeSession } = await import('../js/game/practice.js');
const { Battle } = await import('../js/game/battle.js');
const { HUD } = await import('../js/game/hud.js');
const { PlayerController, TrainingAIController } = await import('../js/game/fighter-controller.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { ICONS } = await import('../js/ui/icons.js');
const { HomeScreen } = await import('../js/screens/home-screen.js');
const { CharacterSelectScreen } = await import('../js/screens/character-select-screen.js');
const { PracticeGroundScreen, PRACTICE_DEFAULT_FIGHTER } = await import('../js/screens/practice-screen.js');

// A second available fighter (same art as #0001) so a swap to a different
// fighter can be checked. Registered before any roster is built.
const DEF_9999 = { ...DEF_0001, id: '9999', displayName: '#9999', rosterSlot: 5, available: true };
CHARACTERS.push(DEF_9999);

// No AI decision may ever be made while practising.
let aiInputs = 0;
const aiGetInput = TrainingAIController.prototype.getInput;
TrainingAIController.prototype.getInput = function (...args) {
  aiInputs++;
  return aiGetInput.apply(this, args);
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Gameplay input: `script` feeds one snapshot per simulation step; key()
// runs a keydown through every listener, menus first (as in the app).
function fakeInput() {
  const listeners = new Set();
  return {
    gameplayActive: false,
    lastDevice: 'keyboard',
    flushes: 0,
    script: [],
    listeners,
    onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onPadMenu: noop,
    setGameplayActive(on) { this.gameplayActive = on; },
    setTouch: noop,
    flush() { this.flushes++; },
    sample() { return this.script.shift() ?? {}; },
    key(code) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
      for (const fn of [...listeners]) fn(e);
      return e;
    },
  };
}

function fakeApp() {
  const loads = [];
  const sprites = new Map();
  const spritesFor = (id) => {
    if (!sprites.has(id)) sprites.set(id, fakeSprites());
    return sprites.get(id);
  };
  const app = {
    selection: { mode: 'quick-battle', characterId: '0001', mapId: MAPS[0].id },
    input: fakeInput(),
    device: { blockedPortrait: false, reducedMotion: false, noteKeyboard: noop },
    screens: { current: null, calls: [], go(...args) { this.calls.push(args); }, back: noop },
    loading: { labels: [], show(label) { this.labels.push(label); }, hide: noop, setProgress: noop, showError(message, opts) { this.error = { message, opts }; } },
    audio: { play: noop },
    dialog: { resolve: null },
    loadCharacter(id, onProgress) {
      loads.push(id);
      onProgress?.(1, 1);
      return Promise.resolve(spritesFor(id));
    },
    getSprites: spritesFor,
    resetCharacter: noop,
  };
  app.nav = new MenuNavigator(app);
  return { app, loads };
}

async function enterPractice() {
  const { app, loads } = fakeApp();
  const screen = new PracticeGroundScreen(app);
  app.screens.current = screen;
  await screen.enter();
  return { app, screen, loads };
}

const labels = (root) => root.querySelectorAll('[data-nav]').map((b) => b.textContent);
const slotFor = (screen, id) => screen.roster.slots.find((s) => s._def?.id === id);

// ---- Home ---------------------------------------------------------------------

test('Home: Practice Ground replaces Help & Credits, enabled, under Play, and opens Practice Ground directly', () => {
  const { app } = fakeApp();
  const home = new HomeScreen(app);
  const actions = home.el.querySelectorAll('.home-action');
  assert.equal(actions.length, 2);
  const [play, practice] = actions;
  assert.ok(play.html.includes('<span>Play</span>'));
  assert.ok(practice.html.includes('<span>Practice Ground</span>'));
  assert.ok(practice.html.includes(ICONS.right), 'keeps the Home chevron');
  assert.ok(!home.el.querySelectorAll('.home-action').some((b) => b.html.includes('Help')));
  assert.equal(practice.disabled, false);
  assert.equal(practice.hasAttribute('data-nav'), true);
  assert.deepEqual(app.nav.candidates(home.el), [play, practice], 'keyboard / gamepad reach it');

  practice.click();
  assert.deepEqual(app.screens.calls, [['practice']], 'no mode, fighter or stage select first');
  play.click();
  assert.deepEqual(app.screens.calls[1], ['mode'], 'Play still opens Select Mode');
});

// ---- Entering -----------------------------------------------------------------

test('a fresh entry always starts with #0001, whatever Quick Battle or an earlier visit chose', async () => {
  assert.equal(PRACTICE_DEFAULT_FIGHTER, '0001');
  const { app, loads } = fakeApp();
  app.selection.characterId = '9999';
  const screen = new PracticeGroundScreen(app);
  app.screens.current = screen;
  screen.characterId = '9999'; // as if an earlier visit swapped fighters
  await screen.enter();
  assert.deepEqual(loads, ['0001'], 'loaded through app.loadCharacter');
  assert.deepEqual(app.loading.labels, ['Loading #0001']);
  assert.equal(screen.session.player.def.id, '0001');
  assert.equal(screen.characterId, '0001');
  assert.equal(app.selection.characterId, '9999', 'Quick Battle\'s selection is untouched');
  // Control at once: no intro, countdown or lock.
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.session.player.inputLocked, false);
  assert.equal(screen.isRunning, true);
  assert.deepEqual(app.nav.scopes, []);
  const spawn = PRACTICE_MAP.spawnPoints[0];
  assert.equal(screen.session.player.body.x, spawn.x);
  assert.equal(screen.session.player.body.y, PRACTICE_MAP.groundLevel);
});

test('a failed load uses the loading error, and Back returns Home', async () => {
  const { app } = fakeApp();
  app.loadCharacter = () => Promise.resolve({ usable: false });
  const screen = new PracticeGroundScreen(app);
  await screen.enter();
  assert.equal(screen.session, null);
  assert.match(app.loading.error.message, /#0001's sprite frames could not be loaded/);
  app.loading.error.opts.onBack();
  assert.deepEqual(app.screens.calls, [['home', {}, { reset: true }]]);
});

// ---- The solo simulation ------------------------------------------------------

test('Practice Ground runs exactly one player-controlled fighter: no CPU, opponent or AI', async () => {
  const { screen } = await enterPractice();
  const { session } = screen;
  assert.equal(session.fighters.length, 1);
  assert.equal(session.fighters[0], session.player);
  assert.ok(session.player.controller instanceof PlayerController);
  assert.ok(session.fighters.every((f) => !(f.controller instanceof TrainingAIController)));
  assert.equal(session.player.opponent, null);
  assert.equal(session.primary, session.player);
  assert.equal(session.secondary, null);
  for (let i = 0; i < 120; i++) screen.update(DT);
  assert.equal(aiInputs, 0, 'no TrainingAIController ever runs');
  for (const file of ['../js/game/practice.js', '../js/screens/practice-screen.js']) {
    assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes('TrainingAIController'), `${file} never imports the training CPU`);
  }
});

test('the session has no countdown, round, timer or result, and runs indefinitely', async () => {
  const { screen } = await enterPractice();
  const { session } = screen;
  for (const key of ['phase', 'timeLeft', 'round', 'result', 'roundSeconds']) {
    assert.equal(key in session, false, `no ${key}`);
  }
  // Far longer than a Quick Battle round.
  let frames = 0;
  const frame = session.frame.bind(session);
  session.frame = (dt) => { frames++; frame(dt); };
  for (let i = 0; i < 60 * 120; i++) screen.update(DT);
  assert.equal(frames, 60 * 120);
  assert.equal(screen.isRunning, true);
  assert.equal(screen.session, session);
});

test('the camera follows the lone fighter with no secondary', async () => {
  const { screen } = await enterPractice();
  const { session } = screen;
  const calls = [];
  const { follow, snap } = session.camera;
  session.camera.follow = (...args) => { calls.push(['follow', ...args]); return follow.apply(session.camera, args); };
  session.camera.snap = (...args) => { calls.push(['snap', ...args]); return snap.apply(session.camera, args); };
  screen.update(DT); // first update also sizes the view
  assert.deepEqual(calls.map(([kind, p, s]) => [kind, p === session.player, s]), [['snap', true, null], ['follow', true, null]]);
});

test('moves that aim at an opponent fall back or miss with nobody there, without throwing', () => {
  const input = fakeInput();
  const session = new PracticeSession({ canvas: new Element('canvas'), map: PRACTICE_MAP, def: DEF_0001, sprites: fakeSprites(), input });
  const p = session.player;
  const run = (held, steps = 1) => {
    for (let i = 0; i < steps; i++) {
      input.script.push({ ...held });
      session.update(DT);
    }
  };
  const idle = (limit = 240) => {
    for (let i = 0; i < limit && (p.state !== 'idle' || p.technique || session.clones.length); i++) run({});
    assert.equal(p.state, 'idle');
  };

  // Charged BA1: no one to appear behind, so it is an ordinary BA1, free.
  run({ charge: true }, 10);
  assert.equal(p.state, 'charge');
  run({ charge: true, action1: true, action1Pressed: true });
  assert.equal(p.combat.attack?.def.id, 'ba1');
  assert.equal(session.clones.length, 0);
  assert.equal(p.combat.energy, p.combat.maxEnergy, 'no Energy spent on a clone that cannot appear');
  idle();

  // Charged BA2: the Sphere Rush forms, dashes, finds nobody and misses.
  run({ charge: true }, 10);
  run({ charge: true, action2: true, action2Pressed: true });
  const rush = p.technique;
  assert.ok(rush, 'the Sphere Rush starts');
  idle();
  assert.equal(rush.endReason, 'miss');
  assert.equal(rush.target, null);

  // Throw: the shuriken flies, hits nothing and expires.
  run({ primary: true, primaryPressed: true });
  let seen = 0;
  for (let i = 0; i < 180; i++) {
    run({});
    seen = Math.max(seen, session.projectiles.length);
  }
  assert.equal(seen, 1);
  assert.equal(session.projectiles.length, 0);

  // Movement, jumping, both BAs in the air and Dodges still work alone.
  run({ right: true }, 30);
  assert.ok(p.body.x > PRACTICE_MAP.spawnPoints[0].x);
  run({ jump: true, jumpPressed: true });
  run({}, 8);
  assert.equal(p.body.grounded, false);
  run({ action2: true, action2Pressed: true });
  assert.equal(p.combat.attack?.def.id, 'midairBa2');
  idle();
  run({ defense: true, defensePressed: true });
  assert.equal(p.state, 'defense');
  idle();
  assert.equal(p.combat.health, p.combat.maxHealth, 'nothing ever hits the lone fighter');

  // Rendering with a sized view draws only this fighter (the fake canvas
  // records nothing, but every path must run without throwing).
  session.resize();
  session.debug = true;
  session.frame(DT);
});

test('the bounds hold the fighter on the training floor', () => {
  const input = fakeInput();
  const session = new PracticeSession({ canvas: new Element('canvas'), map: PRACTICE_MAP, def: DEF_0001, sprites: fakeSprites(), input });
  const p = session.player;
  for (let i = 0; i < 60 * 12; i++) {
    input.script.push({ left: true });
    session.update(DT);
  }
  assert.equal(p.body.x - p.body.halfW, PRACTICE_MAP.bounds.left);
  for (let i = 0; i < 60 * 20; i++) {
    input.script.push({ right: true });
    session.update(DT);
  }
  assert.equal(p.body.x + p.body.halfW, PRACTICE_MAP.bounds.right);
  assert.equal(p.body.y, PRACTICE_MAP.groundLevel);
});

// ---- HUD ------------------------------------------------------------------------

test('HUD: only Player 1\'s panel and the More button; no CPU panel, round, timer or pause', async () => {
  const { screen } = await enterPractice();
  const { hud, hudRoot } = screen;
  assert.deepEqual(hudRoot.children, [hud.panel.root, hud.moreButton]);
  for (const cls of ['.hud-p2', '.hud-center', '.hud-time', '.hud-timer', '.hud-round', '.hud-pause']) {
    assert.deepEqual(hudRoot.querySelectorAll(cls), [], `no ${cls}`);
  }
  assert.ok(!hudRoot.querySelectorAll('button').some((b) => b.html === ICONS.pause), 'no pause icon');
  assert.equal(hudRoot.querySelectorAll('.hud-side').length, 1);
  assert.equal(hud.panel.tag.textContent, 'P1');
  assert.equal(hud.panel.name.textContent, '#0001');
  assert.equal(hud.panel.bar.getAttribute('aria-label'), 'Health');
  assert.equal(hud.panel.bar.getAttribute('aria-valuenow'), '100');
  assert.equal(hud.panel.energy.getAttribute('aria-label'), 'Energy');
  assert.equal(hud.panel.energy.getAttribute('aria-valuenow'), '100');

  screen.session.player.combat.health = 40;
  screen.session.player.combat.energy = 25;
  hud.update(screen.session);
  assert.equal(hud.panel.bar.getAttribute('aria-valuenow'), '40');
  assert.equal(hud.panel.energy.getAttribute('aria-valuenow'), '25');
});

test('the More button is a compact three-dots glass button labelled Practice menu', async () => {
  const { screen } = await enterPractice();
  const more = screen.hud.moreButton;
  assert.equal(more.tagName, 'BUTTON');
  assert.equal(more.getAttribute('type'), 'button');
  assert.equal(more.getAttribute('aria-label'), 'Practice menu');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.ok(more.classList.contains('glass'));
  assert.equal(more.html, ICONS.more);
  assert.equal(ICONS.more.match(/<circle /g).length, 3, 'three dots');
  assert.ok(ICONS.more.includes('aria-hidden="true"'));
});

// ---- Practice menu ------------------------------------------------------------

test('More freezes practice under a translucent menu with exactly Change Fighter and Return', async () => {
  const { app, screen } = await enterPractice();
  let frames = 0;
  screen.session.frame = () => { frames++; };
  screen.hud.moreButton.click();

  const { menuOverlay } = screen;
  assert.equal(screen.menuOpen, true);
  assert.equal(menuOverlay.hidden, false);
  assert.equal(menuOverlay.getAttribute('role'), 'dialog');
  assert.equal(menuOverlay.getAttribute('aria-modal'), 'true');
  assert.ok(menuOverlay.children[0].classList.contains('glass'));
  assert.deepEqual(labels(menuOverlay), ['Change Fighter', 'Return']);
  for (const hidden of ['Resume', 'Restart', 'Restart Battle', 'Help', 'Settings', 'Change Stage']) {
    assert.ok(!labels(menuOverlay).includes(hidden), `no ${hidden}`);
  }
  assert.equal(document.activeElement, screen.changeBtn);
  assert.deepEqual(app.nav.scopes, [screen.menuScope]);
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.equal(screen.hud.moreButton.getAttribute('aria-expanded'), 'true');
  assert.ok(screen.el.classList.contains('is-menu-open'));
  screen.update(DT);
  assert.equal(frames, 0, 'the simulation is frozen');

  // More again resumes.
  screen.hud.moreButton.click();
  assert.equal(screen.menuOpen, false);
  assert.equal(menuOverlay.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.hud.moreButton.getAttribute('aria-expanded'), 'false');
  assert.ok(app.input.flushes > 0, 'keys pressed in the menu are dropped');
  screen.update(DT);
  assert.equal(frames, 1);
});

test('Esc / P / gamepad Start open the menu; Esc / Back, P and Start close it; so does the dim', async () => {
  const { app, screen } = await enterPractice();
  app.input.key('Escape');
  assert.equal(screen.menuOpen, true, 'Esc opens');
  app.input.key('Escape');
  assert.equal(screen.menuOpen, false, 'Esc (menu Back) resumes');
  app.input.key('KeyP');
  assert.equal(screen.menuOpen, true, 'P opens');
  app.input.key('KeyP');
  assert.equal(screen.menuOpen, false, 'P resumes');

  app.nav.command('start');
  assert.equal(screen.menuOpen, true, 'Start opens');
  app.nav.command('start');
  assert.equal(screen.menuOpen, false, 'Start resumes');
  app.nav.command('start');
  app.nav.command('back');
  assert.equal(screen.menuOpen, false, 'gamepad Back resumes');

  screen.openMenu();
  screen.menuOverlay.children[0].click();
  assert.equal(screen.menuOpen, true, 'a press on the panel keeps it');
  screen.menuOverlay.click();
  assert.equal(screen.menuOpen, false, 'a press on the dim resumes');
  assert.deepEqual(app.nav.scopes, []);
});

test('the debug overlay key toggles the practice session\'s overlay', async () => {
  const { app, screen } = await enterPractice();
  app.input.key(CONFIG.debug.overlayKey);
  assert.equal(screen.session.debug, true);
  app.input.key(CONFIG.debug.overlayKey);
  assert.equal(screen.session.debug, false);
});

test('portrait lock and a hidden tab freeze practice behind the menu', async () => {
  const { app, screen } = await enterPractice();
  app.device.blockedPortrait = true;
  screen.onDeviceChange();
  assert.equal(screen.menuOpen, true);
  screen.resume();
  assert.equal(screen.menuOpen, true, 'stays frozen until landscape');
  app.device.blockedPortrait = false;
  screen.resume();
  assert.equal(screen.menuOpen, false);

  document.hidden = true;
  for (const fn of docListeners.get('visibilitychange')) fn();
  document.hidden = false;
  assert.equal(screen.menuOpen, true);
});

// ---- Change Fighter -----------------------------------------------------------

test('Change Fighter opens a large roster dialog over practice instead of navigating', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  screen.changeBtn.click();

  const { rosterOverlay } = screen;
  assert.deepEqual(app.screens.calls, [], 'no screen change');
  assert.equal(screen.rosterOpen, true);
  assert.equal(rosterOverlay.hidden, false);
  assert.equal(rosterOverlay.getAttribute('role'), 'dialog');
  assert.equal(rosterOverlay.getAttribute('aria-modal'), 'true');
  const titleId = rosterOverlay.getAttribute('aria-labelledby');
  const title = rosterOverlay.querySelectorAll('h2').find((h) => h.id === titleId);
  assert.equal(title.textContent, 'Change Fighter');
  assert.ok(screen.rosterDialog.classList.contains('glass'));
  assert.ok(rosterOverlay.contains(screen.roster.rosterPanel) && rosterOverlay.contains(screen.roster.previewPanel));

  // The menu stays open beneath, inert; focus is trapped in the dialog's scope.
  assert.equal(screen.menuOpen, true);
  assert.equal(screen.menuOverlay.inert, true);
  assert.equal(screen.hudRoot.inert, true);
  assert.deepEqual(app.nav.scopes, [screen.menuScope, screen.rosterScope]);
  assert.ok(!app.nav.candidates(rosterOverlay).includes(screen.changeBtn));
  screen.changeBtn.focus();
  assert.equal(document.activeElement, slotFor(screen, '0001'), 'nothing underneath takes focus');
  screen.hud.moreButton.click();
  assert.equal(screen.rosterOpen, true, 'More does nothing while the dialog is open');

  // The current fighter starts selected, previewed and focused.
  const current = slotFor(screen, '0001');
  assert.equal(document.activeElement, current);
  assert.ok(current.classList.contains('is-selected'));
  assert.equal(screen.roster.selectedId, '0001');
  assert.equal(screen.roster.name.textContent, '#0001');
});

test('the dialog shows the full configured roster; locked slots stay non-interactive', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  screen.openRoster();
  const { slots, grid } = screen.roster;
  assert.equal(slots.length, CONFIG.roster.totalSlots);
  assert.equal(grid.children.length, CONFIG.roster.totalSlots);
  const available = slots.filter((s) => s._def?.available);
  const locked = slots.filter((s) => !s._def?.available);
  assert.deepEqual(available.map((s) => s._def.id), ['0001', '9999']);
  assert.equal(locked.length, CONFIG.roster.totalSlots - 2);
  for (const s of locked) {
    assert.equal(s.tagName, 'DIV');
    assert.equal(s.hasAttribute('data-nav'), false);
    assert.ok(s.classList.contains('is-locked'));
  }
  for (const s of available) {
    assert.equal(s.tagName, 'BUTTON');
    assert.ok(s.hasAttribute('data-nav'));
  }
  const candidates = app.nav.candidates(screen.rosterOverlay);
  assert.ok(locked.every((s) => !candidates.includes(s)), 'locked slots stay out of navigation');
  assert.ok(available.every((s) => candidates.includes(s)));
  assert.ok(locked.every((s) => s.getAttribute('tabindex') === null), 'nor can Tab reach them');
});

test('Back from the dialog closes only the dialog and returns focus to Change Fighter', async () => {
  const { app, screen } = await enterPractice();
  const player = screen.session.player;
  screen.openMenu();
  screen.openRoster();
  slotFor(screen, '9999').click(); // pointer: selects, does not confirm
  assert.equal(screen.roster.selectedId, '9999');
  app.input.key('Escape');
  assert.equal(screen.rosterOpen, false);
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(screen.menuOpen, true, 'the menu stays');
  assert.equal(screen.menuOverlay.inert, false);
  assert.equal(document.activeElement, screen.changeBtn);
  assert.deepEqual(app.nav.scopes, [screen.menuScope]);
  assert.equal(screen.session.player, player, 'fighter unchanged');
  assert.equal(screen.characterId, '0001');

  // The header Back button does the same, and gamepad Back too.
  screen.openRoster();
  assert.equal(screen.roster.selectedId, '0001', 'reopening starts from the current fighter');
  screen.rosterDialog.querySelector('.btn-back').click();
  assert.equal(screen.rosterOpen, false);
  screen.openRoster();
  app.nav.command('back');
  assert.equal(screen.rosterOpen, false);
  app.nav.command('back');
  assert.equal(screen.menuOpen, false, 'Back from the menu resumes practice');
});

test('confirming a fighter swaps it in place and resumes practice', async () => {
  const { app, screen, loads } = await enterPractice();
  const { session } = screen;
  const input = app.input;
  const old = session.player;
  // Leave something of the old fighter behind: a Sphere Rush in progress,
  // a shuriken and a clone.
  for (let i = 0; i < 10; i++) { input.script.push({ charge: true }); session.update(DT); }
  input.script.push({ charge: true, action2: true, action2Pressed: true });
  session.update(DT);
  const rush = old.technique;
  assert.ok(rush);
  session.projectiles.push({ alive: true });
  session.clones.push({ alive: true });
  old.combat.health = 30;

  screen.openMenu();
  screen.openRoster();
  slotFor(screen, '9999').click(0); // keyboard / gamepad activation confirms at once
  await flush();

  assert.equal(screen.session, session, 'the same practice session');
  assert.deepEqual(app.screens.calls, [], 'never leaves Practice Ground');
  assert.equal(loads.at(-1), '9999', 'loaded through app.loadCharacter');
  const p = session.player;
  assert.notEqual(p, old);
  assert.equal(p.def.id, '9999');
  assert.deepEqual(session.fighters, [p]);
  assert.ok(p.controller instanceof PlayerController);
  assert.equal(p.body.x, PRACTICE_MAP.spawnPoints[0].x);
  assert.equal(p.body.y, PRACTICE_MAP.groundLevel);
  assert.equal(p.combat.health, p.combat.maxHealth);
  assert.equal(p.combat.energy, p.combat.maxEnergy);
  assert.equal(p.technique, null);
  assert.equal(rush.phase, 'done', 'the old technique ended');
  assert.equal(rush.endReason, 'destroy');
  assert.deepEqual(session.projectiles, []);
  assert.deepEqual(session.clones, []);
  assert.equal(screen.hud.panel.name.textContent, '#9999');
  assert.equal(screen.hud.panel.bar.getAttribute('aria-valuenow'), '100');

  assert.equal(screen.rosterOpen, false);
  assert.equal(screen.menuOpen, false);
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(screen.menuOverlay.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.isRunning, true);

  assert.equal(screen.characterId, '9999');
  assert.equal(app.selection.characterId, '0001', 'Quick Battle\'s fighter is untouched');

  // Leaving and coming back starts from #0001 again.
  screen.exit();
  await screen.enter();
  assert.equal(screen.session.player.def.id, '0001');
});

test('a failed fighter load keeps the current fighter and the dialog', async () => {
  const { app, screen } = await enterPractice();
  const player = screen.session.player;
  screen.openMenu();
  screen.openRoster();
  app.loadCharacter = () => Promise.resolve({ usable: false });
  slotFor(screen, '9999').click(0);
  await flush();
  assert.match(app.loading.error.message, /#9999's sprite frames could not be loaded/);
  assert.equal(screen.session.player, player);
  assert.equal(screen.rosterOpen, true);
  assert.equal(screen.swapping, false);
  app.loading.error.opts.onBack();
  assert.equal(document.activeElement, slotFor(screen, '9999'), 'back to choosing');
});

// ---- Leaving ------------------------------------------------------------------

test('Return goes Home, and leaving cleans up the session, input, scopes and listeners', async () => {
  const { app, screen } = await enterPractice();
  assert.equal(app.input.listeners.size, 2, 'menu navigator + practice keys');
  assert.equal(ResizeObserver.live.has(screen.resizeObserver), true);
  const session = screen.session;
  const player = session.player;
  screen.openMenu();
  screen.returnBtn.click();
  assert.deepEqual(app.screens.calls, [['home', {}, { reset: true }]]);

  screen.exit(); // the screen manager's swap
  assert.equal(screen.session, null);
  assert.deepEqual(session.fighters, []);
  assert.equal(player.technique, null);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screen.menuOpen, false);
  assert.equal(screen.rosterOpen, false);
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.equal(app.input.listeners.size, 1, 'practice key listener removed');
  assert.equal(ResizeObserver.live.has(screen.resizeObserver), false);
  assert.equal(docListeners.get('visibilitychange')?.has(screen.onVisibility) ?? false, false);
  screen.update(DT); // nothing runs underneath Home
});

test('leaving while the fighter dialog is open closes everything', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  screen.openRoster();
  screen.exit();
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(screen.menuOverlay.inert, false);
  assert.equal(screen.hudRoot.inert, false);
});

// ---- Stage --------------------------------------------------------------------

test('the training stage is its own map, outside MAPS and so outside Select Stage', () => {
  assert.deepEqual(MAPS.map((m) => m.id), ['desert', 'city']);
  assert.ok(!MAPS.includes(PRACTICE_MAP));
  assert.equal(getMap('practice'), null);
  assert.equal(PRACTICE_MAP.theme, 'practice');
  assert.deepEqual(PRACTICE_MAP.platforms, []);
  assert.deepEqual(PRACTICE_MAP.solids, []);
  assert.equal(PRACTICE_MAP.spawnPoints.length, 1);
  const { left, right } = PRACTICE_MAP.bounds;
  assert.ok(right - left >= 3000, 'a generous floor');
  const spawn = PRACTICE_MAP.spawnPoints[0].x;
  assert.ok(spawn > left && spawn < right);
});

test('the practice theme is registered and draws without building paths each frame', () => {
  const theme = createTheme(PRACTICE_MAP, {});
  assert.ok(theme instanceof PracticeTheme);
  assert.equal(theme.shadow.skew, 0);
  const ctx = fakeContext();
  const before = path2dCount;
  for (const x of [0, 1500, 4000 - 960]) {
    const view = { ctx, x, y: 480, w: 960, h: 540, scale: 1.333, pxW: 1280, pxH: 720 };
    theme.prepare(view);
    theme.update(DT, view);
    theme.drawBackground(ctx, view);
    theme.drawTerrain(ctx, view);
    theme.drawForeground(ctx, view);
  }
  assert.equal(path2dCount, before);
});

// ---- Quick Battle is unchanged --------------------------------------------------

test('Quick Battle still creates its CPU, round intro and 99-second timer', () => {
  const input = fakeInput();
  const battle = new Battle({
    canvas: new Element('canvas'), map: getMap('desert'),
    p1Def: DEF_0001, p2Def: DEF_0001, p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input,
  });
  assert.equal(battle.fighters.length, 2);
  assert.ok(battle.p1.controller instanceof PlayerController);
  assert.ok(battle.p2.controller instanceof TrainingAIController);
  assert.equal(battle.p2.label, 'CPU');
  assert.equal(battle.p1.opponent, battle.p2);
  assert.equal(battle.secondary, battle.p2);
  assert.equal(battle.phase, 'intro');
  assert.equal(battle.round, 1);
  assert.equal(battle.timeLeft, CONFIG.battle.roundSeconds);
  assert.equal(battle.p1.inputLocked, true, 'locked through the intro');
  for (let i = 0; i < Math.ceil(CONFIG.battle.introSeconds * 60) + 60; i++) battle.update(DT);
  assert.equal(battle.phase, 'fight');
  assert.ok(battle.timeLeft < CONFIG.battle.roundSeconds);

  const root = new Element('div');
  const hud = new HUD(root);
  hud.bind(battle.p1, battle.p2);
  hud.update(battle);
  assert.equal(root.children.length, 3);
  assert.equal(hud.right.tag.textContent, 'CPU');
  assert.equal(hud.roundLabel.textContent, 'ROUND 1');
  assert.equal(hud.timer.textContent, String(Math.ceil(battle.timeLeft)));
  assert.equal(hud.pauseButton.html, ICONS.pause);
});

test('Select Fighter still builds the full roster from the shared component and confirms into Select Stage', () => {
  const { app } = fakeApp();
  const select = new CharacterSelectScreen(app);
  select.enter();
  const { slots } = select.roster;
  assert.equal(slots.length, CONFIG.roster.totalSlots);
  assert.equal(select.roster.name.id, 'preview-name');
  assert.equal(select.roster.previewPanel.getAttribute('aria-labelledby'), 'preview-name');
  assert.ok(select.roster.selectedId === '0001');
  select.focusDefault();
  assert.equal(document.activeElement, slots[0]);
  slots.find((s) => s._def?.id === '9999').click(0);
  assert.equal(app.selection.characterId, '9999');
  assert.deepEqual(app.screens.calls, [['map']]);

  // Both rosters can share the page: no id is used twice.
  const practice = new PracticeGroundScreen(app);
  const ids = [];
  const collect = (n) => { if (n instanceof Element) { if (n.id) ids.push(n.id); n.children.forEach(collect); } };
  collect(select.el);
  collect(practice.el);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
  assert.equal(getCharacter('9999').displayName, '#9999');
});
