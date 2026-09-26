// Run with node --test tests/difficulty.test.mjs (no dependencies).
// Quick Battle's Select Difficulty step: the four levels and their profiles
// (js/data/difficulty.js), the Select Difficulty screen between Select Mode
// and Select Fighter on the real ScreenManager and MenuNavigator (pointer,
// keyboard and gamepad), the four-step setup header, and the chosen level
// reaching the Battle's CPU and surviving restarts, rematches and respawns.
// On a minimal fake DOM; layout and paint still need real-browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeSprites, def as DEF_0001, DT } from './fighter-harness.mjs';

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
};

const { CONFIG } = await import('../js/config.js');
const {
  DIFFICULTIES, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, CAPABILITY, resolveDifficulty, getDifficulty, getDifficultyProfile,
} = await import('../js/data/difficulty.js');
const { MAPS, getMap } = await import('../js/data/maps.js');
const { ICONS } = await import('../js/ui/icons.js');
const { Screen, ScreenManager } = await import('../js/core/screen-manager.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { ModeSelectScreen } = await import('../js/screens/mode-select-screen.js');
const { DifficultySelectScreen } = await import('../js/screens/difficulty-select-screen.js');
const { CharacterSelectScreen } = await import('../js/screens/character-select-screen.js');
const { MapSelectScreen } = await import('../js/screens/map-select-screen.js');
const { BattleScreen } = await import('../js/screens/battle-screen.js');
const { Battle } = await import('../js/game/battle.js');
const { CombatAIController } = await import('../js/game/combat-ai.js');
const { mulberry32 } = await import('../js/core/utils.js');

// Keyboard input (key() runs a keydown through every listener, menus first,
// as in the app) and gamepad menu commands (pad()).
function fakeInput() {
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
    flush: noop,
    sample: () => ({}),
  };
}

// The Quick Battle setup screens on the real ScreenManager and
// MenuNavigator, with reduced motion so screens swap without timers. The
// Battle screen is a stand-in that records what it was asked to start.
class BattleStub extends Screen {
  constructor(app) {
    super(app, 'battle');
    this.navigable = false;
    this.started = [];
  }

  enter(params) {
    if (!params?.fromBack) this.started.push(params);
  }
}

function boot() {
  const app = {
    selection: { mode: 'quick-battle', difficulty: DEFAULT_DIFFICULTY, characterId: '0001', mapId: MAPS[0].id },
    input: fakeInput(),
    device: { reducedMotion: true, blockedPortrait: false },
    audio: { play: noop },
    dialog: { resolve: null },
    loading: { show: noop, hide: noop, setProgress: noop },
    loadCharacter: () => Promise.resolve(fakeSprites()),
    getSprites: () => fakeSprites(),
    resetCharacter: noop,
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const screens = {
    mode: new ModeSelectScreen(app),
    difficulty: new DifficultySelectScreen(app),
    character: new CharacterSelectScreen(app),
    map: new MapSelectScreen(app),
    battle: new BattleStub(app),
  };
  for (const s of Object.values(screens)) app.screens.register(s);
  app.screens.go('mode');
  return { app, screens };
}

const cardOf = (screen, id) => screen.cards.find((c) => c.getAttribute('data-difficulty') === id);
const current = (app) => app.screens.current.id;

// ---- Data ---------------------------------------------------------------------

test('exactly four levels, ascending, with Medium the default', () => {
  assert.deepEqual(DIFFICULTY_IDS, ['easy', 'medium', 'hard', 'brutal']);
  assert.equal(DEFAULT_DIFFICULTY, 'medium');
  assert.deepEqual(DIFFICULTIES.map((d) => [d.index, d.level, d.name]), [
    ['01', 1, 'Easy'], ['02', 2, 'Medium'], ['03', 3, 'Hard'], ['04', 4, 'Brutal'],
  ]);
  for (const d of DIFFICULTIES) {
    assert.ok(d.description.length > 10 && d.description.length < 48, `${d.name}: short line`);
    assert.ok(Object.isFrozen(d) && Object.isFrozen(d.profile), 'frozen');
  }
});

test('anything that is not one of the four resolves to Medium, in one place', () => {
  for (const id of DIFFICULTY_IDS) assert.equal(resolveDifficulty(id), id);
  for (const bad of [undefined, null, '', 'Brutal', 'insane', 0, {}]) {
    assert.equal(resolveDifficulty(bad), 'medium');
    assert.equal(getDifficulty(bad).id, 'medium');
    assert.equal(getDifficultyProfile(bad), getDifficulty('medium').profile);
  }
});

test('profiles are ordered: no trait is ever better on a lower level', () => {
  const profiles = DIFFICULTY_IDS.map(getDifficultyProfile);
  for (const [trait, better] of Object.entries(CAPABILITY)) {
    for (let i = 1; i < profiles.length; i++) {
      const lo = [].concat(profiles[i - 1][trait]);
      const hi = [].concat(profiles[i][trait]);
      lo.forEach((v, k) => {
        const cmp = (hi[k] - v) * better;
        assert.ok(cmp >= 0, `${trait}: ${DIFFICULTY_IDS[i]} is no worse than ${DIFFICULTY_IDS[i - 1]}`);
      });
    }
  }
  // The traits that define the levels strictly improve at every step.
  for (const trait of ['react', 'think', 'lapse', 'noise', 'guard', 'punish']) {
    for (let i = 1; i < profiles.length; i++) {
      const lo = [].concat(profiles[i - 1][trait]);
      const hi = [].concat(profiles[i][trait]);
      assert.ok(lo.every((v, k) => (hi[k] - v) * CAPABILITY[trait] > 0), `${trait} improves from ${DIFFICULTY_IDS[i - 1]}`);
    }
  }
  const brutal = getDifficultyProfile('brutal');
  assert.ok(brutal.react[0] >= 3 * CONFIG.sim.step, 'even Brutal needs a few frames to react');
  assert.ok(brutal.lapse > 0 && brutal.noise > 0, 'even Brutal is not perfect');
  assert.ok(getDifficultyProfile('easy').react[0] > 0.25, 'Easy is usually too late even for BA2\'s startup');
});

test('a profile holds perception and judgement only: nothing a fighter is made of', () => {
  const fighterStats = ['damage', 'speed', 'maxSpeed', 'jump', 'jumpVelocity', 'gravity', 'energy', 'dashCost', 'cooldown', 'hitstun',
    'startup', 'recovery', 'launch', 'baseLaunch', 'hitbox', 'hurtbox', 'respawn', 'score', 'invulnerable'];
  for (const d of DIFFICULTIES) {
    assert.deepEqual(Object.keys(d.profile).sort(), Object.keys(CAPABILITY).sort(), `${d.id}: only AI traits`);
    for (const k of Object.keys(d.profile)) assert.ok(!fighterStats.includes(k), k);
  }
  const src = readFileSync(new URL('../js/game/character.js', import.meta.url), 'utf8') +
    readFileSync(new URL('../js/game/combat.js', import.meta.url), 'utf8');
  assert.ok(!/difficulty/i.test(src), 'Fighter and combat never read a difficulty');
});

// ---- The app and the screen ----------------------------------------------------

test('the app starts Quick Battle on Medium and registers Select Difficulty between Mode and Fighter', () => {
  const app = readFileSync(new URL('../js/core/app.js', import.meta.url), 'utf8');
  assert.match(app, /difficulty: DEFAULT_DIFFICULTY/);
  const order = ['ModeSelectScreen', 'DifficultySelectScreen', 'CharacterSelectScreen', 'MapSelectScreen']
    .map((name) => app.indexOf(`s.register(new ${name}(this))`));
  assert.ok(order.every((i) => i > 0), 'all registered');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in setup order');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (screen) => html.indexOf(`data-screen="${screen}"`);
  assert.ok(at('mode') < at('difficulty') && at('difficulty') < at('character'), 'its section sits between Mode and Fighter');
  assert.match(html, /class="screen screen--menu screen--difficulty" data-screen="difficulty" aria-label="Select difficulty" hidden/);
});

test('Select Mode → Select Difficulty → Select Fighter → Select Stage → Battle, and Back retraces the steps', async () => {
  const { app, screens } = boot();
  assert.equal(current(app), 'mode');
  screens.mode.el.querySelector('.mode-card').click();
  assert.equal(current(app), 'difficulty', 'Quick Battle leads to Select Difficulty');
  assert.equal(app.selection.mode, 'quick-battle');
  cardOf(screens.difficulty, 'hard').click();
  assert.equal(app.selection.difficulty, 'hard');
  assert.equal(current(app), 'character', 'a level leads to Select Fighter');
  // Back from Fighter is Difficulty (on the level chosen), and Back again Mode.
  screens.character.onBack();
  assert.equal(current(app), 'difficulty');
  assert.equal(document.activeElement, cardOf(screens.difficulty, 'hard'));
  screens.difficulty.onBack();
  assert.equal(current(app), 'mode');
  // Forward again to the end.
  screens.mode.el.querySelector('.mode-card').click();
  cardOf(screens.difficulty, 'brutal').click();
  screens.character.confirm(DEF_0001);
  assert.equal(current(app), 'map');
  screens.map.onBack();
  assert.equal(current(app), 'character', 'Back from Stage is still Fighter');
  screens.character.confirm(DEF_0001);
  screens.map.start();
  assert.equal(current(app), 'battle');
  assert.deepEqual(screens.battle.started, [{ mapId: MAPS[0].id, characterId: '0001', difficulty: 'brutal' }]);
  // The header's Back and Esc are the same navigation.
  const { app: app2, screens: s2 } = boot();
  s2.mode.el.querySelector('.mode-card').click();
  s2.difficulty.el.querySelector('.btn-back').click();
  assert.equal(current(app2), 'mode');
  s2.mode.el.querySelector('.mode-card').click();
  app2.input.key('Escape');
  assert.equal(current(app2), 'mode');
});

test('every level can be chosen by pointer, keyboard and gamepad', () => {
  for (const id of DIFFICULTY_IDS) {
    // Pointer.
    let { app, screens } = boot();
    screens.mode.el.querySelector('.mode-card').click();
    cardOf(screens.difficulty, id).click(1);
    assert.deepEqual([app.selection.difficulty, current(app)], [id, 'character'], `pointer: ${id}`);
    // Keyboard: focus it, confirm with J (Enter and Space are the button's own).
    ({ app, screens } = boot());
    screens.mode.el.querySelector('.mode-card').click();
    cardOf(screens.difficulty, id).focus();
    app.input.key('KeyJ');
    assert.deepEqual([app.selection.difficulty, current(app)], [id, 'character'], `keyboard: ${id}`);
    // Gamepad A.
    ({ app, screens } = boot());
    screens.mode.el.querySelector('.mode-card').click();
    cardOf(screens.difficulty, id).focus();
    app.input.pad('confirm');
    assert.deepEqual([app.selection.difficulty, current(app)], [id, 'character'], `gamepad: ${id}`);
  }
});

test('arrows and the D-pad move between the levels in a row, and in the 2 x 2 grid', () => {
  const { app, screens } = boot();
  screens.mode.el.querySelector('.mode-card').click();
  const cards = DIFFICULTY_IDS.map((id) => cardOf(screens.difficulty, id));
  const back = screens.difficulty.el.querySelector('.btn-back');
  back.rect = { left: 40, top: 20, width: 90, height: 44 };
  // Desktop: one row.
  cards.forEach((c, i) => { c.rect = { left: 40 + i * 300, top: 200, width: 280, height: 360 }; });
  cards[1].focus();
  app.input.key('ArrowRight');
  assert.equal(document.activeElement, cards[2]);
  app.input.pad('right');
  assert.equal(document.activeElement, cards[3]);
  app.input.key('ArrowLeft');
  assert.equal(document.activeElement, cards[2]);
  app.input.key('ArrowUp');
  assert.equal(document.activeElement, back, 'up reaches Back');
  // Narrow: two by two.
  cards.forEach((c, i) => { c.rect = { left: 16 + (i % 2) * 240, top: 120 + Math.floor(i / 2) * 200, width: 230, height: 190 }; });
  cards[0].focus();
  app.input.key('ArrowDown');
  assert.equal(document.activeElement, cards[2], 'Hard under Easy');
  app.input.key('ArrowRight');
  assert.equal(document.activeElement, cards[3], 'Brutal beside Hard');
  app.input.pad('up');
  assert.equal(document.activeElement, cards[1], 'Medium over Brutal');
});

test('a fresh Quick Battle lands on Medium; coming back lands on the level chosen', () => {
  const { app, screens } = boot();
  screens.mode.el.querySelector('.mode-card').click();
  const medium = cardOf(screens.difficulty, 'medium');
  assert.equal(document.activeElement, medium, 'Medium focused by default');
  assert.ok(medium.classList.contains('is-current'));
  assert.equal(medium.getAttribute('aria-current'), 'true');
  assert.deepEqual(screens.difficulty.cards.filter((c) => c.classList.contains('is-current')), [medium], 'one current level');
  cardOf(screens.difficulty, 'easy').click();
  screens.character.onBack();
  const easy = cardOf(screens.difficulty, 'easy');
  assert.equal(document.activeElement, easy);
  assert.ok(easy.classList.contains('is-current') && !medium.classList.contains('is-current'));
  assert.equal(medium.getAttribute('aria-current'), 'false');
  // A stale value falls back to Medium here too.
  app.selection.difficulty = 'nightmare';
  screens.difficulty.enter();
  screens.difficulty.focusDefault();
  assert.equal(document.activeElement, medium);
  medium.click();
  assert.equal(app.selection.difficulty, 'medium');
});

test('each card: its index, a four-bar scale with one to four lit, its name and line, named without relying on colour', () => {
  const { screens } = boot();
  const screen = screens.difficulty;
  assert.equal(screen.el.querySelector('.screen-title').textContent, 'Select Difficulty');
  assert.equal(screen.el.querySelector('.kicker').textContent, 'Quick Battle');
  const group = screen.el.querySelector('.difficulty-scale');
  assert.equal(group.getAttribute('aria-label'), 'Difficulty');
  assert.deepEqual(group.children, screen.cards, 'Easy to Brutal, in order');
  for (const d of DIFFICULTIES) {
    const card = cardOf(screen, d.id);
    assert.equal(card.tagName, 'BUTTON');
    assert.ok(card.hasAttribute('data-nav'), 'menu-navigable');
    assert.equal(card.querySelector('.difficulty-index').textContent, d.index);
    const bars = card.querySelector('.difficulty-bars').children;
    assert.equal(bars.length, 4);
    assert.equal(bars.filter((b) => b.classList.contains('is-on')).length, d.level, `${d.name}: ${d.level} lit`);
    assert.deepEqual(bars.map((b) => b.classList.contains('is-on')), [0, 1, 2, 3].map((i) => i < d.level), 'lit from the first');
    assert.equal(card.querySelector('.difficulty-name').textContent, d.name);
    assert.equal(card.getAttribute('aria-label'), `${d.name}, level ${d.level} of 4`);
    const desc = card.querySelector('.difficulty-desc');
    assert.equal(desc.textContent, d.description);
    assert.equal(card.getAttribute('aria-describedby'), desc.id);
    assert.equal(card.querySelector('.difficulty-current').innerHTML, `${ICONS.check}<span>Current</span>`, 'the current level is labelled, not just tinted');
  }
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.difficulty-bars i\.is-on \{ background: var\(--accent\)/, 'lit bars in Alva\'s accent');
  assert.match(css, /\.screen--difficulty \.btn-back,/, 'Back shaped like the other setup screens');
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'a 2 x 2 grid on narrow screens');
});

test('the setup header has four steps, marked on each setup screen', () => {
  const { screens } = boot();
  const expected = { mode: 0, difficulty: 1, character: 2, map: 3 };
  for (const [id, step] of Object.entries(expected)) {
    const items = screens[id].el.querySelector('.steps').children;
    assert.deepEqual(items.map((li) => li.querySelector('.step-name').textContent), ['Mode', 'Difficulty', 'Fighter', 'Stage'], id);
    items.forEach((li, i) => {
      assert.equal(li.classList.contains('is-done'), i < step, `${id} step ${i} done`);
      assert.equal(li.classList.contains('is-current'), i === step, `${id} step ${i} current`);
      assert.equal(li.getAttribute('aria-current'), i === step ? 'step' : null);
      const num = li.querySelector('.step-num');
      if (i < step) assert.equal(num.innerHTML, ICONS.check, 'completed steps show a check');
      else assert.equal(num.textContent, String(i + 1));
    });
  }
});

// ---- The level reaches the CPU ------------------------------------------------------

function quickBattle(difficulty, seed = 1) {
  const input = { flush: noop, sample: () => ({}) };
  const sprites = fakeSprites();
  return new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'),
    p1Def: DEF_0001, p2Def: DEF_0001, p1Sprites: sprites, p2Sprites: sprites, input, difficulty, seed,
  });
}

test('the Battle\'s CPU plays the chosen level, and keeps it through restarts, rematches and respawns', () => {
  for (const id of DIFFICULTY_IDS) {
    const battle = quickBattle(id);
    const ai = battle.p2.controller;
    assert.ok(ai instanceof CombatAIController);
    assert.deepEqual([battle.difficulty, ai.difficulty], [id, id]);
    assert.equal(ai.profile, getDifficultyProfile(id));
    battle.setPhase('fight');
    for (let i = 0; i < 120; i++) battle.update(DT);
    battle.restart();
    assert.equal(battle.p2.controller, ai, 'the same controller after a restart');
    assert.equal(ai.difficulty, id);
    assert.equal(ai.intent, null, 'nothing planned carries over');
    // A fall and a respawn.
    battle.setPhase('fight');
    Object.assign(battle.p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
    for (let i = 0; i < Math.ceil(CONFIG.battle.respawnSeconds / DT) + 30; i++) battle.update(DT);
    assert.equal(battle.p2.lostToVoid, false, 'back in play');
    assert.deepEqual([battle.p2.controller, ai.difficulty], [ai, id]);
  }
  for (const bad of [undefined, 'nightmare']) {
    const battle = quickBattle(bad);
    assert.deepEqual([battle.difficulty, battle.p2.controller.difficulty], ['medium', 'medium']);
  }
});

test('the Battle screen hands the selected level to its Battle, and a rematch or restart keeps it', async () => {
  const input = fakeInput();
  const app = {
    selection: { mode: 'quick-battle', difficulty: 'brutal', characterId: '0001', mapId: MAPS[0].id },
    input,
    device: { reducedMotion: true, blockedPortrait: false },
    audio: { play: noop },
    dialog: { resolve: null },
    loading: { show: noop, hide: noop, setProgress: noop, showError: noop },
    loadCharacter: () => Promise.resolve(fakeSprites()),
    screens: { current: null, back: noop, go: noop },
  };
  app.nav = new MenuNavigator(app);
  const screen = new BattleScreen(app);
  app.screens.current = screen;
  await screen.enter({ mapId: MAPS[0].id, characterId: '0001', difficulty: 'brutal' });
  const battle = screen.battle;
  assert.equal(battle.difficulty, 'brutal');
  assert.equal(battle.p2.controller.difficulty, 'brutal');
  screen.restart();
  assert.equal(screen.battle, battle);
  assert.equal(battle.p2.controller.difficulty, 'brutal', 'Restart Battle keeps it');
  screen.rematch();
  assert.equal(battle.p2.controller.difficulty, 'brutal', 'Rematch keeps it');
  screen.exit();
  // Entered without params (a retry after a failed load), the selection decides.
  app.selection.difficulty = 'easy';
  await screen.enter();
  assert.equal(screen.battle.difficulty, 'easy');
  screen.exit();
});

test('a higher level beats a lower one: Brutal against Easy, seeded', () => {
  // Easy drives Player 1 through a second controller.
  const battle = quickBattle('brutal', 7);
  battle.p1.controller = new CombatAIController({ difficulty: 'easy', rng: mulberry32(3) });
  battle.setPhase('fight');
  let steps = 0;
  while (battle.phase !== 'result' && steps++ < Math.ceil(110 / DT)) battle.update(DT);
  assert.equal(battle.result.outcome, 'p2', `Brutal wins (${battle.score.p1} - ${battle.score.p2})`);
  assert.ok(battle.score.p2 > battle.score.p1);
});
