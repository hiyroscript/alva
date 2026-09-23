// Run with node --test tests/battle-screen.test.mjs (no dependencies).
// Pause menu, HUD pause controls and end-of-battle flow on a minimal fake
// DOM; layout/paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleScreen } from '../js/screens/battle-screen.js';
import { MenuNavigator } from '../js/core/menu-navigator.js';
import { ConfirmDialog } from '../js/ui/overlays.js';
import { Battle } from '../js/game/battle.js';

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
  rect = { left: 0, top: 0, width: 40, height: 40 };
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    const names = new Set();
    this.classList = {
      add: (...n) => n.forEach(c => names.add(c)),
      remove: (...n) => n.forEach(c => names.delete(c)),
      contains: (c) => names.has(c),
      toggle: (c, on = !names.has(c)) => { on ? names.add(c) : names.delete(c); return on; },
    };
    this.classNames = names;
  }
  set className(v) { this.classNames.clear(); v.split(/\s+/).filter(Boolean).forEach(c => this.classNames.add(c)); }
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
  get textContent() { return this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  // Like the real thing: disabled buttons ignore click() and focus().
  click() {
    if (this.disabled) return;
    for (const fn of this.listeners.get('click') || []) fn({ target: this, detail: 1, preventDefault() {} });
  }
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
  }
  blur() { if (document.activeElement === this) document.activeElement = document.body; }
  matches(selector) {
    return selector.split(',').map(s => s.trim()).some((s) => {
      if (s.startsWith('.')) return this.classNames.has(s.slice(1));
      const attr = s.match(/^\[([\w-]+)\]$/);
      if (attr) return this.hasAttribute(attr[1]);
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches(selector)) return n;
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
}

function setup() {
  const body = new Element('body');
  const screenEl = new Element('section');
  const dialogRoot = new Element('div');
  globalThis.Node = Node;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.document = {
    body,
    activeElement: body,
    hidden: false,
    documentElement: new Element('html'),
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new Text(text),
    querySelector: () => screenEl,
    addEventListener() {},
    removeEventListener() {},
  };
  const app = {
    input: {
      gameplayActive: true,
      lastDevice: 'keyboard',
      onKey: () => () => {},
      onPadMenu() {},
      setGameplayActive(on) { this.gameplayActive = on; },
      flush() {},
    },
    device: { blockedPortrait: false, reducedMotion: false },
    screens: { current: null, back() {}, go() {} },
    loading: { hide() {} },
    audio: { play() {} },
  };
  app.nav = new MenuNavigator(app);
  app.dialog = new ConfirmDialog(dialogRoot, app);
  const screen = new BattleScreen(app);
  app.screens.current = screen;
  return { app, screen };
}

// A stand-in for Battle that uses the real draw/winner rule.
function fakeBattle({ p1 = 100, p2 = 100 } = {}) {
  const fighter = (health) => ({ def: { displayName: '#0001' }, combat: { health, maxHealth: 100 } });
  const battle = {
    p1: fighter(p1), p2: fighter(p2), phase: 'fight', phaseTime: 1, timeLeft: 0.2, round: 1, restarts: 0,
    resize: () => false,
    render() {},
    frame() {},
    restart() {
      this.restarts++;
      this.p1.combat.health = this.p2.combat.health = 100;
      this.timeLeft = 99;
      this.phase = 'intro';
      this.phaseTime = 0;
    },
  };
  Object.defineProperty(battle, 'result', Object.getOwnPropertyDescriptor(Battle.prototype, 'result'));
  return battle;
}

function startBattle(screen, opts) {
  const battle = fakeBattle(opts);
  screen.battle = battle;
  screen.needsResize = false;
  screen.hud.bind(battle.p1, battle.p2);
  screen.touch.setEnabled(true);
  return battle;
}

const pauseItems = (screen) => screen.pauseMenuView.querySelectorAll('[data-nav]');
const byText = (items, text) => items.find(b => b.textContent === text);

test('pause Help is visible but disabled, and navigation skips it', () => {
  const { app, screen } = setup();
  startBattle(screen);
  screen.pause();
  const items = pauseItems(screen);
  assert.deepEqual(items.map(b => b.textContent), ['Resume', 'Restart Battle', 'Help', 'Return to Home']);
  const [resume, restart, help, home] = items;
  assert.equal(help.disabled, true);
  assert.equal(help.hidden, false);
  assert.equal(document.activeElement, resume);
  assert.deepEqual(app.nav.candidates(screen.pauseOverlay), [resume, restart, home]);

  items.forEach((b, i) => { b.rect = { left: 0, top: i * 50, width: 300, height: 44 }; });
  restart.focus();
  app.nav.move('down', screen.pauseOverlay);
  assert.equal(document.activeElement, home);
  app.nav.move('up', screen.pauseOverlay);
  assert.equal(document.activeElement, restart);

  help.focus();
  assert.equal(document.activeElement, restart, 'disabled Help never takes focus');
  help.click();
  assert.equal(screen.helpOpen, false);
  assert.equal(screen.pauseHelpView.hidden, true);
});

test('leaving the Help view focuses a live pause item, not a positional index', () => {
  const { screen } = setup();
  startBattle(screen);
  screen.pause();
  const [resume, , help] = pauseItems(screen);
  screen.openHelp();
  screen.closeHelp();
  assert.equal(document.activeElement, resume, 'falls back to Resume while Help is disabled');

  help.disabled = false; // how Help comes back later
  screen.openHelp();
  screen.closeHelp();
  assert.equal(document.activeElement, help);
});

test('pause dialog shows Quick Battle without the stage name', () => {
  const { screen } = setup();
  const kicker = screen.pauseMenuView.querySelector('.kicker');
  assert.equal(kicker.textContent, 'Quick Battle');
});

test('timer and pause halves both run the one pause path, once', () => {
  const { app, screen } = setup();
  startBattle(screen);
  let calls = 0;
  const pause = screen.pause;
  screen.pause = function () { calls++; return pause.call(this); };
  const { timeButton, pauseButton } = screen.hud;
  for (const b of [timeButton, pauseButton]) {
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.getAttribute('type'), 'button');
  }
  assert.equal(pauseButton.getAttribute('aria-label'), 'Pause');

  timeButton.click();
  assert.equal(calls, 1);
  assert.equal(screen.paused, true);
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.deepEqual(app.nav.scopes, [screen.pauseScope]);
  assert.equal(document.activeElement.textContent, 'Resume');

  timeButton.click();
  pauseButton.click();
  assert.equal(calls, 3);
  assert.deepEqual(app.nav.scopes, [screen.pauseScope], 'repeat presses add no scopes');

  screen.resume();
  assert.equal(screen.paused, false);
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.deepEqual(app.nav.scopes, []);
  pauseButton.click();
  assert.equal(calls, 4);
  assert.equal(screen.paused, true);
  assert.deepEqual(app.nav.scopes, [screen.pauseScope]);
});

test('HUD: glass panels without subtitle rows, labelled timer, digits-only urgency', () => {
  const { screen } = setup();
  const battle = startBattle(screen, { p2: 40 });
  const { hud } = screen;
  for (const side of [hud.left, hud.right]) {
    assert.equal(side.root.classList.contains('glass'), true);
    assert.equal(side.root.children.length, 2, 'name row and health bar only');
    assert.equal(side.root.querySelector('.hud-sub'), null);
  }
  assert.equal(hud.timeButton.parentNode.classList.contains('glass'), true);
  assert.equal(hud.pauseButton.parentNode, hud.timeButton.parentNode);

  battle.timeLeft = 86.2;
  hud.update(battle);
  assert.equal(hud.timer.textContent, '87');
  assert.equal(hud.timeButton.getAttribute('aria-label'), 'Pause game, 87 seconds remaining');
  assert.equal(hud.timer.classList.contains('is-urgent'), false);
  assert.equal(hud.right.bar.getAttribute('role'), 'meter');
  assert.equal(hud.right.bar.getAttribute('aria-valuenow'), '40');

  battle.timeLeft = 0.4;
  hud.update(battle);
  assert.equal(hud.timeButton.getAttribute('aria-label'), 'Pause game, 1 second remaining');
  assert.equal(hud.timer.classList.contains('is-urgent'), true);
  assert.equal(hud.timeButton.classList.contains('is-urgent'), false, 'the holder itself never changes');
});

test('a draw opens no result dialog and starts a fresh battle', () => {
  const { app, screen } = setup();
  const battle = startBattle(screen);
  battle.frame = () => { battle.phase = 'result'; battle.timeLeft = 0; };
  screen.update(1 / 60);

  assert.equal(battle.result.outcome, 'draw');
  assert.equal(battle.restarts, 1);
  assert.equal(battle.phase, 'intro');
  assert.equal(screen.resultOverlay.hidden, true);
  assert.equal(screen.resultTitle.textContent, '');
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screen.paused, false);
  assert.equal(screen.isRunning, true);
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.hud.timer.textContent, '99');
  assert.equal(screen.bannerState, null);

  let frames = 0;
  battle.frame = () => { frames++; };
  screen.update(1 / 60);
  assert.equal(frames, 1, 'the new battle keeps running');
  assert.equal(battle.restarts, 1);
});

test('a winner still gets the result menu', () => {
  for (const [opts, title] of [[{ p2: 40 }, 'Player 1 Wins'], [{ p1: 30 }, 'CPU Wins']]) {
    const { app, screen } = setup();
    const battle = startBattle(screen, opts);
    battle.frame = () => { battle.phase = 'result'; battle.timeLeft = 0; };
    screen.update(1 / 60);

    assert.equal(battle.restarts, 0);
    assert.equal(screen.resultOverlay.hidden, false);
    assert.equal(screen.resultTitle.textContent, title);
    assert.equal(screen.resultSub.textContent, 'Time ran out. Remaining health decides the round.');
    assert.deepEqual(app.nav.scopes, [screen.resultScope]);
    assert.equal(document.activeElement.textContent, 'Rematch');
    assert.equal(app.input.gameplayActive, false);
    assert.equal(screen.touch.enabled, false);

    screen.update(1 / 60);
    assert.equal(battle.restarts, 0, 'the result menu waits for the player');
    screen.hud.timeButton.click();
    assert.equal(screen.paused, false, 'no pause over the result menu');

    byText(screen.resultOverlay.querySelectorAll('[data-nav]'), 'Rematch').click();
    assert.equal(battle.restarts, 1);
    assert.equal(screen.resultOverlay.hidden, true);
    assert.deepEqual(app.nav.scopes, []);
    assert.equal(app.input.gameplayActive, true);
  }
});

test('cancelling Return to Home keeps the pause menu and its focus', async () => {
  const { app, screen } = setup();
  startBattle(screen);
  screen.pause();
  const home = byText(pauseItems(screen), 'Return to Home');
  assert.equal(app.dialog.root.children[0].classList.contains('glass'), true);
  home.focus();
  home.click();
  assert.equal(app.dialog.root.hidden, false);
  assert.equal(document.activeElement, app.dialog.cancelBtn);
  assert.equal(app.nav.scopes.length, 2);

  app.dialog.cancelBtn.click();
  await Promise.resolve();
  assert.equal(app.dialog.root.hidden, true);
  assert.equal(document.activeElement, home);
  assert.deepEqual(app.nav.scopes, [screen.pauseScope]);
  assert.equal(screen.paused, true);
});
