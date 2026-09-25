// Run with node --test tests/battle-screen.test.mjs (no dependencies).
// Pause menu, the HUD (fighter cards with portrait, name and Launch Point, the
// score dots under them; timer and pause controls) and end-of-battle flow
// on a minimal fake DOM; layout/paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleScreen } from '../js/screens/battle-screen.js';
import { MenuNavigator } from '../js/core/menu-navigator.js';
import { ConfirmDialog } from '../js/ui/overlays.js';
import { readFileSync } from 'node:fs';
import { Battle } from '../js/game/battle.js';
import { CombatState } from '../js/game/combat.js';
import { formatLaunchPoint, describeEnergy } from '../js/game/hud.js';
import { CONFIG } from '../js/config.js';
import { duel, def as DEF_0001 } from './fighter-harness.mjs';

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
  // Custom properties (the HUD's cooldown rings) land as plain keys.
  style = { setProperty(name, value) { this[name] = value; } };
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
  // A canvas's 2D context: records what is drawn into it.
  getContext() { return (this.ctx ??= { drawn: [], drawImage(img) { this.drawn.push(img); } }); }
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

// A stand-in for Battle that uses the real draw/winner rule. `p1` / `p2`
// are the fighters' Launch Point, `score` their points.
function fakeBattle({ p1 = 0, p2 = 0, score = { p1: 0, p2: 0 } } = {}) {
  const fighter = (launchPoint) => {
    const combat = new CombatState();
    combat.launchPoint = launchPoint;
    return { def: { displayName: '#0001', chargedActions: DEF_0001.chargedActions }, combat };
  };
  const battle = {
    p1: fighter(p1), p2: fighter(p2), phase: 'fight', phaseTime: 1, timeLeft: 0.2, round: 1, restarts: 0,
    score: { ...score }, pointsToWin: CONFIG.battle.pointsToWin,
    resize: () => false,
    render() {},
    frame() {},
    restart() {
      this.restarts++;
      for (const f of [this.p1, this.p2]) {
        f.combat.launchPoint = 0;
        f.combat.chargedCooldowns.clear();
      }
      this.score.p1 = 0;
      this.score.p2 = 0;
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

test('S and ↓ still move down through menus; gameplay Charge leaves menu Down alone', () => {
  const { app, screen } = setup();
  startBattle(screen);
  screen.pause();
  const items = pauseItems(screen);
  items.forEach((b, i) => { b.rect = { left: 0, top: i * 50, width: 300, height: 44 }; });
  const [resume, restart, , home] = items;
  assert.equal(document.activeElement, resume);
  const key = (code) => app.nav.onKey({ code, repeat: false, preventDefault() {} });
  key('KeyS');
  assert.equal(document.activeElement, restart);
  key('ArrowDown');
  assert.equal(document.activeElement, home, 'skips the disabled Help');
  key('KeyW');
  assert.equal(document.activeElement, restart);
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

test('HUD: one glass card per fighter, portrait | divider | name over Launch Point, three score dots beneath; labelled timer, digits-only urgency', () => {
  const { screen } = setup();
  const battle = startBattle(screen, { p2: 40 });
  const { hud } = screen;
  hud.update(battle);
  for (const side of [hud.left, hud.right]) {
    assert.equal(side.root.classList.contains('glass'), true, 'semi-transparent glass');
    assert.equal(side.root.children[0], side.portrait);
    assert.equal(side.root.children[1], side.divider);
    assert.equal(side.root.children[2], side.info);
    assert.equal(side.root.children.length, 4, 'and the Energy description, for screen readers only');
    assert.equal(side.root.children[3], side.energy);
    assert.ok(side.energy.classList.contains('hud-sr'));
    assert.equal(side.portrait.tagName, 'CANVAS');
    assert.ok(side.portrait.classList.contains('hud-portrait'));
    assert.equal(side.portrait.getAttribute('aria-hidden'), 'true');
    assert.ok(side.divider.classList.contains('hud-divider'), 'one thin divider');
    assert.equal(side.root.querySelectorAll('.hud-divider').length, 1);
    const [tagRow, launchPoint] = side.info.children;
    assert.ok(tagRow.classList.contains('hud-tag'), 'name on top');
    assert.equal(tagRow.querySelector('.hud-name').textContent, '#0001', 'the character\'s displayName');
    assert.equal(launchPoint, side.launchPoint, 'Launch Point under the name');
    assert.equal(side.root.querySelector('.hud-sub'), null);
    // No CAB cooldowns in the card any more: they are drawn under the
    // fighter itself (see fighter-status.test.mjs).
    for (const cls of ['.hud-cooldowns', '.hud-cd', '.hud-cd-ring', '.hud-cd-name']) {
      assert.deepEqual(side.wrap.querySelectorAll(cls), [], `no ${cls}`);
    }
    assert.equal('cooldowns' in side, false);
    assert.equal('cooldownRow' in side, false);
    assert.doesNotMatch(side.wrap.textContent, /CAB|BA1|BA2/);
    // The card, then exactly three score dots under it, all empty at first.
    assert.equal(side.wrap.children.length, 2);
    assert.equal(side.wrap.children[0], side.root);
    assert.equal(side.wrap.children[1], side.score);
    assert.ok(side.score.classList.contains('hud-score'));
    assert.equal(side.score.querySelectorAll('.hud-dot').length, 3);
    assert.equal(side.dots.length, CONFIG.battle.pointsToWin);
    assert.ok(side.dots.every((d) => !d.classList.contains('is-filled')));
  }
  assert.deepEqual([hud.left.tag.textContent, hud.right.tag.textContent], ['P1', 'CPU']);
  assert.equal(hud.left.root.classList.contains('hud-p1'), true);
  assert.equal(hud.right.root.classList.contains('hud-p2'), true, 'the CPU card mirrors (see styles.css)');
  assert.equal(hud.left.launchPointValue.textContent, '0');
  assert.equal(hud.right.launchPointValue.textContent, '40');
  assert.equal(hud.timeButton.parentNode.classList.contains('glass'), true);
  assert.equal(hud.pauseButton.parentNode, hud.timeButton.parentNode);

  battle.timeLeft = 86.2;
  hud.update(battle);
  assert.equal(hud.timer.textContent, '87');
  assert.equal(hud.timeButton.getAttribute('aria-label'), 'Pause game, 87 seconds remaining');
  assert.equal(hud.timer.classList.contains('is-urgent'), false);

  battle.timeLeft = 0.4;
  hud.update(battle);
  assert.equal(hud.timeButton.getAttribute('aria-label'), 'Pause game, 1 second remaining');
  assert.equal(hud.timer.classList.contains('is-urgent'), true);
  assert.equal(hud.timeButton.classList.contains('is-urgent'), false, 'the holder itself never changes');
});

test('HUD: the cards sit in the inner columns, either side of the timer, their portraits facing it', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  const [left, center, right] = screen.hudRoot.children;
  assert.equal(left, hud.left.wrap);
  assert.ok(center.classList.contains('hud-center'));
  assert.equal(right, hud.right.wrap);
  assert.ok(left.classList.contains('hud-fighter--p1') && right.classList.contains('hud-fighter--p2'));
  // Facing the centre, whatever the fighters' own facing in play.
  battle.p1.facing = -1;
  battle.p2.facing = 1;
  hud.bind(battle.p1, battle.p2);
  assert.equal(hud.left.portrait.dataset.facing, 'right', 'Player 1 faces the timer');
  assert.equal(hud.right.portrait.dataset.facing, 'left', 'the CPU faces the timer');
  // #0001's art faces right: only the CPU's portrait is mirrored.
  assert.equal(hud.left.portrait.classList.contains('is-mirrored'), false);
  assert.equal(hud.right.portrait.classList.contains('is-mirrored'), true);
  // Art drawn facing left is mirrored on the other side instead.
  const leftFacing = { ...battle.p1, def: { ...battle.p1.def, sourceFacing: -1 } };
  hud.bind(leftFacing, leftFacing);
  assert.equal(hud.left.portrait.classList.contains('is-mirrored'), true);
  assert.equal(hud.right.portrait.classList.contains('is-mirrored'), false);
  assert.deepEqual([hud.left.portrait.dataset.facing, hud.right.portrait.dataset.facing], ['right', 'left']);
  // The rules behind the layout (a real browser still has to show it).
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
  };
  assert.match(rule('.hud'), /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(rule('.hud-fighter--p1'), /justify-self:\s*end/, 'Player 1 hugs the centre');
  assert.match(rule('.hud-fighter--p2'), /justify-self:\s*start/, 'so does the CPU');
  assert.match(rule('.hud-portrait.is-mirrored'), /transform:\s*scaleX\(-1\)/);
  assert.match(rule('.hud-dot'), /border-radius:\s*50%/, 'CSS circles, no image');
  assert.match(rule('.hud-dot.is-filled'), /background:/);
  assert.doesNotMatch(css, /hud-cooldowns|hud-cd|--cd-/, 'no card cooldown styles left');
});

test('HUD: a point fills the scorer\'s next dot at once, and only its own; a rematch empties them', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  const filled = (side) => side.dots.map((d) => (d.classList.contains('is-filled') ? '●' : '○')).join(' ');
  hud.update(battle);
  assert.deepEqual([filled(hud.left), filled(hud.right)], ['○ ○ ○', '○ ○ ○']);
  assert.equal(hud.left.score.getAttribute('aria-label'), 'Player 1: 0 of 3 points');
  assert.equal(hud.left.score.getAttribute('role'), 'img');
  battle.score.p1 = 1;
  hud.update(battle);
  assert.deepEqual([filled(hud.left), filled(hud.right)], ['● ○ ○', '○ ○ ○']);
  assert.equal(hud.left.score.getAttribute('aria-label'), 'Player 1: 1 of 3 points');
  battle.score.p2 = 1;
  battle.score.p1 = 2;
  hud.update(battle);
  assert.deepEqual([filled(hud.left), filled(hud.right)], ['● ● ○', '● ○ ○']);
  assert.equal(hud.right.score.getAttribute('aria-label'), 'CPU: 1 of 3 points');
  battle.score.p1 = 3;
  hud.update(battle);
  assert.deepEqual([filled(hud.left), filled(hud.right)], ['● ● ●', '● ○ ○']);
  battle.restart();
  hud.update(battle);
  assert.deepEqual([filled(hud.left), filled(hud.right)], ['○ ○ ○', '○ ○ ○']);
});

test('HUD: no Health anywhere, and no Energy meter on the card: no bar, fill, label or maximum', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  hud.update(battle);
  const root = screen.hudRoot;
  for (const cls of ['.hud-bar', '.hud-bar-fill', '.hud-bar-ghost', '.hud-energy', '.hud-energy-fill']) {
    assert.deepEqual(root.querySelectorAll(cls), [], `no ${cls}`);
  }
  const all = root.querySelectorAll('div').concat(root.querySelectorAll('span'));
  assert.ok(!all.some((n) => n.getAttribute('role') === 'meter'), 'no meters');
  assert.ok(!all.some((n) => /health|energy/i.test(n.getAttribute('aria-label') ?? '')), 'no Health or Energy meter labels');
  for (const side of [hud.left, hud.right]) {
    for (const key of ['bar', 'fill', 'ghost', 'energyFill', 'energyBar', 'stamina']) assert.equal(key in side, false, `no ${key}`);
    // Energy is drawn over the fighter; the card only describes it, to
    // screen readers, by name.
    assert.equal(side.energy.textContent, 'Energy 100 of 100');
    assert.ok(side.energy.classList.contains('hud-sr'));
    assert.doesNotMatch(side.energy.textContent, /stamina/i);
    // Launch Point: labelled, a plain number with no maximum and no % sign.
    assert.equal(side.launchPoint.getAttribute('aria-label'), 'Launch Point');
    assert.equal(side.launchPoint.getAttribute('aria-valuemax'), null);
    assert.equal(side.launchPointValue.textContent, '0', 'starts at 0');
    assert.doesNotMatch(side.root.textContent, /%|HP|\/100/);
  }
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /hud-bar|hud-energy|low-hp|--energy/, 'no Health / Energy styles left');
});

test('HUD: the Launch Point number follows the fighter, touches the DOM only when it changes, and bind() resets it', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  hud.update(battle);
  const writes = [];
  const value = hud.left.launchPointValue;
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value), 'textContent').set;
  Object.defineProperty(value, 'textContent', {
    set(v) { writes.push(v); set.call(this, v); },
    get() { return this.children.map((c) => c.textContent).join(''); },
  });
  hud.update(battle);
  hud.update(battle);
  assert.deepEqual(writes, [], 'unchanged Launch Point writes nothing');
  for (const [k, shown] of [[5, '5'], [27, '27'], [84, '84'], [143, '143'], [1234.4, '1234']]) {
    battle.p1.combat.launchPoint = k;
    hud.update(battle);
    assert.equal(value.textContent, shown);
  }
  assert.equal(hud.right.launchPointValue.textContent, '0', 'the other card is its own');
  assert.deepEqual(writes, ['5', '27', '84', '143', '1234']);
  hud.bind(battle.p1, battle.p2);
  hud.update(battle);
  assert.deepEqual(writes.at(-1), '1234', 'bind() clears the cached value');
  assert.equal(writes.length, 6);
  assert.equal(formatLaunchPoint(0), '0');
  assert.equal(formatLaunchPoint(99.6), '100');
});

test('HUD: the card describes Energy to screen readers in steps of 5, exhausted included, never as Stamina', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  const c = battle.p1.combat;
  hud.update(battle);
  assert.equal(hud.left.energy.textContent, 'Energy 100 of 100');
  c.spendEnergy(25);
  c.regenEnergy(1.2);
  hud.update(battle);
  assert.equal(hud.left.energy.textContent, 'Energy 75 of 100');
  c.spendEnergy(76.2);
  hud.update(battle);
  assert.equal(hud.left.energy.textContent, 'Energy exhausted, refilling: 0 of 100');
  c.regenEnergy(41);
  hud.update(battle);
  assert.equal(hud.left.energy.textContent, 'Energy exhausted, refilling: 40 of 100');
  c.refillEnergy();
  assert.equal(describeEnergy(c), 'Energy 100 of 100');
  assert.equal(hud.right.energy.textContent, 'Energy 100 of 100', 'the other card is its own');
});

test('HUD: the portrait is the character\'s own crop from its sprites, with nothing about #0001 in the HUD itself', () => {
  const { screen } = setup();
  const battle = fakeBattle();
  const crop = { width: 22, height: 22 };
  let made = 0;
  battle.p1.sprites = { makePortrait: () => { made++; return crop; } };
  screen.hud.bind(battle.p1, battle.p2);
  const { portrait } = screen.hud.left;
  assert.equal(made, 1);
  assert.deepEqual([portrait.getAttribute('width'), portrait.width], ['1', 22]);
  assert.equal(portrait.height, 22);
  assert.deepEqual(portrait.ctx.drawn, [crop]);
  assert.ok(screen.hud.left.root.classList.contains('has-portrait'));
  assert.equal(screen.hud.right.root.classList.contains('has-portrait'), false, 'no art, no portrait (and no crash)');
  // Rebinding the same art does not redraw it.
  screen.hud.bind(battle.p1, battle.p2);
  assert.equal(made, 1);
  const code = readFileSync(new URL('../js/game/hud.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /assets\/|0001|ba1Clone|rasenRush/, 'data-driven: no character paths or ids');
  const source = code;
  assert.match(source, /paintPortrait/, 'the shared portrait painter, as the roster uses');
});

test('HUD: a real hit raises the Launch Point shown on the target\'s card only', () => {
  const { screen } = setup();
  const d = duel();
  const battle = { p1: d.attacker, p2: d.target, timeLeft: 99, round: 1, score: { p1: 0, p2: 0 } };
  const { hud } = screen;
  hud.bind(battle.p1, battle.p2);
  hud.update(battle);
  d.tick({ action1: true, action1Pressed: true });
  d.until(() => d.events.length > 0);
  hud.update(battle);
  assert.equal(hud.right.launchPointValue.textContent, '5');
  assert.equal(hud.left.launchPointValue.textContent, '0');
});

test('HUD: a rematch shows 0 Launch Point and empty dots again; on time and level on points the lower Launch Point wins', () => {
  const { screen } = setup();
  const battle = startBattle(screen, { p1: 12, p2: 40, score: { p1: 1, p2: 1 } });
  screen.hud.update(battle);
  battle.frame = () => { battle.phase = 'result'; battle.timeLeft = 0; };
  screen.update(1 / 60);
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'time' }, 'lower Launch Point is better');
  assert.equal(screen.resultTitle.textContent, 'Player 1 Wins');

  byText(screen.resultOverlay.querySelectorAll('[data-nav]'), 'Rematch').click();
  for (const side of [screen.hud.left, screen.hud.right]) {
    assert.equal(side.launchPointValue.textContent, '0');
    assert.ok(side.dots.every((d) => !d.classList.contains('is-filled')));
  }
});

test('Quick Battle result: points first (3 wins at once, or more on time), then lower Launch Point, then a draw', () => {
  const result = (p1, p2, score) => fakeBattle({ p1, p2, score }).result;
  // Level on points at time: Launch Point decides.
  assert.deepEqual(result(42, 81, { p1: 0, p2: 0 }), { outcome: 'p1', reason: 'time' });
  assert.deepEqual(result(81, 42, { p1: 1, p2: 1 }), { outcome: 'p2', reason: 'time' });
  assert.deepEqual(result(0, 5, { p1: 2, p2: 2 }), { outcome: 'p1', reason: 'time' });
  assert.deepEqual(result(37, 37, { p1: 1, p2: 1 }), { outcome: 'draw', reason: 'time' });
  assert.deepEqual(result(0, 0, { p1: 0, p2: 0 }), { outcome: 'draw', reason: 'time' });
  // More points wins on time, whatever the Launch Point says.
  assert.deepEqual(result(300, 0, { p1: 1, p2: 0 }), { outcome: 'p1', reason: 'points' });
  assert.deepEqual(result(0, 300, { p1: 0, p2: 2 }), { outcome: 'p2', reason: 'points' });
  // Three points: the match is won, by K.O.
  assert.deepEqual(result(90, 0, { p1: 3, p2: 2 }), { outcome: 'p1', reason: 'void' });
  assert.deepEqual(result(0, 90, { p1: 0, p2: 3 }), { outcome: 'p2', reason: 'void' });
  const source = readFileSync(new URL('../js/game/battle.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /health|\.energy\b/i, 'results never read Health or Energy');
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
    assert.equal(screen.resultSub.textContent, 'Time ran out with the points level. Lower Launch Point wins.');
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

test('the third point plays the K.O. banner with the dots filled, then the result menu names who fell', () => {
  const cases = [['p1', 'CPU Wins', 'Player 1 fell into the Void for the final point.'], ['p2', 'Player 1 Wins', 'The CPU fell into the Void for the final point.']];
  for (const [lost, title, sub] of cases) {
    const { app, screen } = setup();
    const battle = startBattle(screen);
    const won = lost === 'p1' ? 'p2' : 'p1';
    // The Battle scored the winner's third point and took the loser out:
    // its Launch Point (lower here) does not matter.
    battle.score[won] = 3;
    battle.score[lost] = 2;
    battle[lost].lostToVoid = true;
    battle[won].combat.launchPoint = 120;
    battle.phase = 'ko';
    battle.phaseTime = 0.2;
    screen.update(1 / 60);
    assert.equal(screen.bannerState, 'ko');
    assert.equal(screen.bannerMain.textContent, 'K.O.');
    assert.equal(screen.bannerSub.textContent, 'VOID');
    assert.equal(screen.resultOverlay.hidden, true, 'the KO beat plays first');
    const side = won === 'p1' ? screen.hud.left : screen.hud.right;
    assert.ok(side.dots.every((d) => d.classList.contains('is-filled')), 'with all three dots already filled');

    battle.frame = () => { battle.phase = 'result'; };
    screen.update(1 / 60);
    assert.deepEqual(battle.result, { outcome: won, reason: 'void' });
    assert.equal(screen.resultOverlay.hidden, false);
    assert.equal(screen.resultKicker.textContent, 'K.O.');
    assert.equal(screen.resultTitle.textContent, title);
    assert.equal(screen.resultSub.textContent, sub);
    assert.deepEqual(app.nav.scopes, [screen.resultScope]);

    // The rematch starts from 0 points and runs to time over: ahead on
    // points, the result reads as time over by points.
    byText(screen.resultOverlay.querySelectorAll('[data-nav]'), 'Rematch').click();
    assert.deepEqual(battle.score, { p1: 0, p2: 0 });
    battle[lost].lostToVoid = false;
    battle.score.p1 = 1;
    battle.frame = () => { battle.phase = 'result'; };
    screen.update(1 / 60);
    assert.equal(screen.resultKicker.textContent, 'Time over');
    assert.equal(screen.resultTitle.textContent, 'Player 1 Wins');
    assert.equal(screen.resultSub.textContent, 'Time ran out. More points wins the match.');
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

const outlineOnly = (b) => b.classList.contains('is-outline-only');

test('only Restart Battle and Return to Home drop their fill in the pause menu', () => {
  const { screen } = setup();
  const [resume, restart, help, home] = pauseItems(screen);
  assert.equal(outlineOnly(restart), true);
  assert.equal(outlineOnly(home), true);
  assert.equal(outlineOnly(resume), false);
  assert.equal(resume.classList.contains('is-primary'), true);
  assert.equal(outlineOnly(help), false);
  for (const b of screen.resultOverlay.querySelectorAll('[data-nav]')) {
    assert.equal(outlineOnly(b), false, `${b.textContent} keeps its fill states`);
  }
});

test('Keep Playing is outline-only for Return to Home? alone', async () => {
  const { app, screen } = setup();
  startBattle(screen);
  screen.pause();
  const { cancelBtn, okBtn } = app.dialog;
  assert.equal(outlineOnly(cancelBtn), false);

  const home = byText(pauseItems(screen), 'Return to Home');
  home.focus();
  home.click();
  assert.equal(cancelBtn.textContent, 'Keep Playing');
  assert.equal(outlineOnly(cancelBtn), true);
  assert.equal(document.activeElement, cancelBtn);
  assert.equal(okBtn.textContent, 'Return Home');
  assert.equal(okBtn.classList.contains('btn--primary'), true);
  assert.equal(outlineOnly(okBtn), false);

  cancelBtn.click();
  await Promise.resolve();
  assert.equal(document.activeElement, home, 'focus returns to Return to Home');
  assert.equal(screen.paused, true);

  // A dialog opened without the option must not inherit the class.
  const pending = app.dialog.open({ title: 'Other', message: 'Another confirmation' });
  assert.equal(cancelBtn.textContent, 'Cancel');
  assert.equal(outlineOnly(cancelBtn), false);
  cancelBtn.click();
  assert.equal(await pending, false);
});
