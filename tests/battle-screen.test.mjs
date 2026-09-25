// Run with node --test tests/battle-screen.test.mjs (no dependencies).
// Pause menu, the HUD (fighter cards with portrait, name, Knockback and the
// charged cooldown rings; timer and pause controls) and end-of-battle flow
// on a minimal fake DOM; layout/paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleScreen } from '../js/screens/battle-screen.js';
import { MenuNavigator } from '../js/core/menu-navigator.js';
import { ConfirmDialog } from '../js/ui/overlays.js';
import { readFileSync } from 'node:fs';
import { Battle } from '../js/game/battle.js';
import { CooldownTimers } from '../js/game/combat.js';
import { formatKnockback, formatCooldown } from '../js/game/hud.js';
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
// are the fighters' accumulated Knockback.
function fakeBattle({ p1 = 0, p2 = 0 } = {}) {
  const fighter = (knockback) => ({
    def: { displayName: '#0001', chargedActions: DEF_0001.chargedActions },
    combat: { knockback, chargedCooldowns: new CooldownTimers() },
  });
  const battle = {
    p1: fighter(p1), p2: fighter(p2), phase: 'fight', phaseTime: 1, timeLeft: 0.2, round: 1, restarts: 0,
    resize: () => false,
    render() {},
    frame() {},
    restart() {
      this.restarts++;
      for (const f of [this.p1, this.p2]) {
        f.combat.knockback = 0;
        f.combat.chargedCooldowns.clear();
      }
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

test('HUD: one glass card per fighter, portrait | divider | name over Knockback, then the cooldown rings; labelled timer, digits-only urgency', () => {
  const { screen } = setup();
  const battle = startBattle(screen, { p2: 40 });
  const { hud } = screen;
  hud.update(battle);
  for (const side of [hud.left, hud.right]) {
    assert.equal(side.root.classList.contains('glass'), true, 'semi-transparent glass');
    assert.deepEqual(side.root.children, [side.portrait, side.divider, side.info, side.cooldownRow]);
    assert.equal(side.portrait.tagName, 'CANVAS');
    assert.ok(side.portrait.classList.contains('hud-portrait'));
    assert.equal(side.portrait.getAttribute('aria-hidden'), 'true');
    assert.ok(side.divider.classList.contains('hud-divider'), 'one thin divider');
    assert.equal(side.root.querySelectorAll('.hud-divider').length, 1);
    const [tagRow, knockback] = side.info.children;
    assert.ok(tagRow.classList.contains('hud-tag'), 'name on top');
    assert.equal(tagRow.querySelector('.hud-name').textContent, '#0001', 'the character\'s displayName');
    assert.equal(knockback, side.knockback, 'Knockback under the name');
    assert.equal(side.root.querySelector('.hud-sub'), null);
    assert.equal(side.cooldownRow.querySelectorAll('.hud-cd').length, 2, 'Charged BA1 and Charged BA2');
    assert.deepEqual(side.cooldowns.map((c) => c.id), ['ba1Clone', 'rasenRush']);
    assert.deepEqual(side.cooldownRow.querySelectorAll('.hud-cd-name').map((n) => n.textContent), ['BA1', 'BA2']);
  }
  assert.deepEqual([hud.left.tag.textContent, hud.right.tag.textContent], ['P1', 'CPU']);
  assert.equal(hud.left.root.classList.contains('hud-p1'), true);
  assert.equal(hud.right.root.classList.contains('hud-p2'), true, 'the CPU card mirrors (see styles.css)');
  assert.equal(hud.left.knockbackValue.textContent, '0');
  assert.equal(hud.right.knockbackValue.textContent, '40');
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

test('HUD: no Health or Energy anywhere: no meter, bar, fill, label or maximum', () => {
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
  assert.ok(!all.some((n) => /health|energy/i.test(n.getAttribute('aria-label') ?? '')), 'no Health or Energy labels');
  for (const side of [hud.left, hud.right]) {
    for (const key of ['bar', 'fill', 'ghost', 'energy', 'energyFill']) assert.equal(key in side, false, `no ${key}`);
    // Knockback: labelled, a plain number with no maximum and no % sign.
    assert.equal(side.knockback.getAttribute('aria-label'), 'Knockback');
    assert.equal(side.knockback.getAttribute('aria-valuemax'), null);
    assert.equal(side.knockbackValue.textContent, '0', 'starts at 0');
    assert.doesNotMatch(side.root.textContent, /%|HP|\/100/);
  }
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /hud-bar|hud-energy|low-hp|--energy/, 'no Health / Energy styles left');
});

test('HUD: the Knockback number follows the fighter, touches the DOM only when it changes, and bind() resets it', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  hud.update(battle);
  const writes = [];
  const value = hud.left.knockbackValue;
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value), 'textContent').set;
  Object.defineProperty(value, 'textContent', {
    set(v) { writes.push(v); set.call(this, v); },
    get() { return this.children.map((c) => c.textContent).join(''); },
  });
  hud.update(battle);
  hud.update(battle);
  assert.deepEqual(writes, [], 'unchanged Knockback writes nothing');
  for (const [k, shown] of [[5, '5'], [27, '27'], [84, '84'], [143, '143'], [1234.4, '1234']]) {
    battle.p1.combat.knockback = k;
    hud.update(battle);
    assert.equal(value.textContent, shown);
  }
  assert.equal(hud.right.knockbackValue.textContent, '0', 'the other card is its own');
  assert.deepEqual(writes, ['5', '27', '84', '143', '1234']);
  hud.bind(battle.p1, battle.p2);
  hud.update(battle);
  assert.deepEqual(writes.at(-1), '1234', 'bind() clears the cached value');
  assert.equal(writes.length, 6);
  assert.equal(formatKnockback(0), '0');
  assert.equal(formatKnockback(99.6), '100');
});

test('HUD: a cooldown ring starts empty, is half full halfway, and is complete and ready at 0; its number counts down', () => {
  const { screen } = setup();
  const battle = startBattle(screen);
  const { hud } = screen;
  const cd = battle.p1.combat.chargedCooldowns;
  const [ba1, ba2] = hud.left.cooldowns;
  const ring = (c) => c.ring.style['--cd-progress'];
  hud.update(battle);
  for (const c of [ba1, ba2]) {
    assert.equal(ring(c), '1', 'ready: complete');
    assert.equal(c.value.textContent, '');
    assert.ok(c.root.classList.contains('is-ready'));
    assert.equal(c.root.getAttribute('role'), 'img');
  }
  assert.equal(ba1.root.getAttribute('aria-label'), 'Charged BA1 ready');
  assert.equal(ba2.root.getAttribute('aria-label'), 'Charged BA2 ready');

  cd.start('ba1Clone', 5);
  hud.update(battle);
  assert.equal(ba1.value.textContent, '5.0');
  assert.equal(ring(ba1), '0', 'just started: empty');
  assert.equal(ba1.root.classList.contains('is-ready'), false);
  assert.equal(ba1.root.getAttribute('aria-label'), 'Charged BA1 cooldown, 5.0 seconds remaining');
  assert.equal(ring(ba2), '1', 'Charged BA2 is its own');
  for (const [dt, shown, progress] of [[0.7, '4.3', '0.14'], [1.8, '2.5', '0.5'], [1.7, '0.8', '0.84']]) {
    cd.update(dt);
    hud.update(battle);
    assert.equal(ba1.value.textContent, shown);
    assert.equal(ring(ba1), progress, 'progress = 1 - remaining / duration');
    assert.equal(ba1.root.getAttribute('aria-label'), `Charged BA1 cooldown, ${shown} seconds remaining`);
  }
  cd.update(0.8);
  hud.update(battle);
  assert.equal(ring(ba1), '1', 'complete at ready');
  assert.equal(ba1.value.textContent, '');
  assert.ok(ba1.root.classList.contains('is-ready'));
  assert.equal(ba1.root.getAttribute('aria-label'), 'Charged BA1 ready');
  // Never 0.0 while it is still cooling down.
  assert.equal(formatCooldown(0.01), '0.1');
  assert.equal(formatCooldown(4.3), '4.3');
  assert.equal(formatCooldown(4.31), '4.4');
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

test('HUD: a real hit raises the Knockback shown, and a real Charged BA1 starts its ring at once; Charge fills it faster', () => {
  const { screen } = setup();
  const d = duel();
  const battle = { p1: d.attacker, p2: d.target, timeLeft: 99, round: 1 };
  const { hud } = screen;
  hud.bind(battle.p1, battle.p2);
  hud.update(battle);
  d.tick({ action1: true, action1Pressed: true });
  d.until(() => d.events.length > 0);
  hud.update(battle);
  assert.equal(hud.right.knockbackValue.textContent, '5');
  assert.equal(hud.left.knockbackValue.textContent, '0');
  d.until(() => !d.attacker.combat.attack && d.target.combat.stun <= 0);

  d.tick({ charge: true });
  d.tick({ charge: true, action1: true, action1Pressed: true });
  assert.equal(d.clones.length, 1);
  hud.update(battle);
  const [ba1, ba2] = hud.left.cooldowns;
  assert.equal(ba1.value.textContent, '5.0');
  assert.equal(ba1.ring.style['--cd-progress'], '0');
  assert.equal(ba2.ring.style['--cd-progress'], '1', 'Charged BA2 stays ready');
  assert.equal(hud.right.cooldowns[0].ring.style['--cd-progress'], '1', 'the CPU\'s rings do not move');
  // Half a second of Charge takes a whole second off.
  for (let i = 0; i < 30; i++) d.tick({ charge: true });
  hud.update(battle);
  assert.equal(ba1.value.textContent, '4.0');
  assert.equal(ba1.ring.style['--cd-progress'], '0.2');
});

test('HUD: a rematch shows 0 Knockback and ready rings again; on time the lower Knockback wins', () => {
  const { screen } = setup();
  const battle = startBattle(screen, { p1: 12, p2: 40 });
  battle.p1.combat.chargedCooldowns.start('rasenRush', 5);
  screen.hud.update(battle);
  battle.frame = () => { battle.phase = 'result'; battle.timeLeft = 0; };
  screen.update(1 / 60);
  assert.equal(battle.result.outcome, 'p1', 'less Knockback is better');
  assert.equal(screen.resultTitle.textContent, 'Player 1 Wins');

  byText(screen.resultOverlay.querySelectorAll('[data-nav]'), 'Rematch').click();
  for (const side of [screen.hud.left, screen.hud.right]) {
    assert.equal(side.knockbackValue.textContent, '0');
    assert.ok(side.cooldowns.every((c) => c.ring.style['--cd-progress'] === '1'));
  }
});

test('Quick Battle time-up compares accumulated Knockback: lower wins, equal draws; the Void always overrides it', () => {
  const result = (p1, p2, lost = {}) => {
    const battle = fakeBattle({ p1, p2 });
    battle.p1.lostToVoid = !!lost.p1;
    battle.p2.lostToVoid = !!lost.p2;
    return battle.result;
  };
  assert.deepEqual(result(42, 81), { outcome: 'p1', reason: 'time' });
  assert.deepEqual(result(81, 42), { outcome: 'p2', reason: 'time' });
  assert.deepEqual(result(0, 5), { outcome: 'p1', reason: 'time' });
  assert.deepEqual(result(37, 37), { outcome: 'draw', reason: 'time' });
  assert.deepEqual(result(0, 0), { outcome: 'draw', reason: 'time' });
  // A Void loss decides it, whatever the Knockback says.
  assert.deepEqual(result(0, 300, { p1: true }), { outcome: 'p2', reason: 'void' });
  assert.deepEqual(result(300, 0, { p2: true }), { outcome: 'p1', reason: 'void' });
  assert.deepEqual(result(10, 90, { p1: true, p2: true }), { outcome: 'draw', reason: 'void' });
  // The real getter reads Knockback and the Void only.
  const source = readFileSync(new URL('../js/game/battle.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /health|energy/i);
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
    assert.equal(screen.resultSub.textContent, 'Time ran out. Lower Knockback wins the round.');
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

test('a Void loss plays the K.O. banner, then the result menu names who fell', () => {
  const cases = [['p1', 'CPU Wins', 'Player 1 fell into the Void.'], ['p2', 'Player 1 Wins', 'The CPU fell into the Void.']];
  for (const [lost, title, sub] of cases) {
    const { app, screen } = setup();
    const battle = startBattle(screen);
    // The Battle defeats a fighter the Void takes: out of play. Its
    // Knockback (lower here) does not matter.
    battle[lost].lostToVoid = true;
    battle[lost === 'p1' ? 'p2' : 'p1'].combat.knockback = 120;
    battle.phase = 'ko';
    battle.phaseTime = 0.2;
    screen.update(1 / 60);
    assert.equal(screen.bannerState, 'ko');
    assert.equal(screen.bannerMain.textContent, 'K.O.');
    assert.equal(screen.bannerSub.textContent, 'VOID');
    assert.equal(screen.resultOverlay.hidden, true, 'the KO beat plays first');

    battle.frame = () => { battle.phase = 'result'; };
    screen.update(1 / 60);
    assert.deepEqual(battle.result, { outcome: lost === 'p1' ? 'p2' : 'p1', reason: 'void' });
    assert.equal(screen.resultOverlay.hidden, false);
    assert.equal(screen.resultKicker.textContent, 'K.O.');
    assert.equal(screen.resultTitle.textContent, title);
    assert.equal(screen.resultSub.textContent, sub);
    assert.deepEqual(app.nav.scopes, [screen.resultScope]);

    // The rematch runs to time over: the result reads as time over again.
    byText(screen.resultOverlay.querySelectorAll('[data-nav]'), 'Rematch').click();
    battle[lost].lostToVoid = false;
    battle.p2.combat.knockback = 40;
    battle.frame = () => { battle.phase = 'result'; };
    screen.update(1 / 60);
    assert.equal(screen.resultKicker.textContent, 'Time over');
    assert.equal(screen.resultTitle.textContent, 'Player 1 Wins');
    assert.equal(screen.resultSub.textContent, 'Time ran out. Lower Knockback wins the round.');
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
