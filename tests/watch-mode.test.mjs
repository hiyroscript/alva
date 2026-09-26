// Run with node --test tests/watch-mode.test.mjs (no dependencies).
// Watch Mode, Alva's CPU-vs-CPU spectator mode: the Home action, its setup
// (Difficulty → CPU 1 → CPU 2 → Stage) on the real ScreenManager and
// MenuNavigator with the real setup screens, its own selection apart from
// Quick Battle's, the real Battle with a combat AI on each side, and the
// Battle screen running it (loading, spectating, pause, restart, rematch,
// results, Change Stage) before a Quick Battle that behaves as before.
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

const { CONFIG } = await import('../js/config.js');
const { CHARACTERS } = await import('../js/data/characters.js');
const { DIFFICULTIES, DIFFICULTY_IDS, DEFAULT_DIFFICULTY, getDifficultyProfile } = await import('../js/data/difficulty.js');
const { MAPS, getMap } = await import('../js/data/maps.js');
const { ICONS } = await import('../js/ui/icons.js');
const { ConfirmDialog } = await import('../js/ui/overlays.js');
const { WATCH_SETUP, QUICK_BATTLE_SETUP } = await import('../js/ui/components.js');
const { ScreenManager } = await import('../js/core/screen-manager.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { mulberry32, deriveSeed } = await import('../js/core/utils.js');
const { HomeScreen } = await import('../js/screens/home-screen.js');
const { ModeSelectScreen } = await import('../js/screens/mode-select-screen.js');
const { DifficultySelectScreen } = await import('../js/screens/difficulty-select-screen.js');
const { CharacterSelectScreen } = await import('../js/screens/character-select-screen.js');
const { MapSelectScreen } = await import('../js/screens/map-select-screen.js');
const { WatchDifficultyScreen, WatchFighterScreen, WatchMapScreen } = await import('../js/screens/watch-screens.js');
const { BattleScreen } = await import('../js/screens/battle-screen.js');
const { Battle, BATTLE_MODES } = await import('../js/game/battle.js');
const { CombatAIController } = await import('../js/game/combat-ai.js');
const { PlayerController } = await import('../js/game/fighter-controller.js');

// A second available fighter, so CPU 1 and CPU 2 can differ.
const DEF_9999 = { ...DEF_0001, id: '9999', displayName: '#9999', rosterSlot: 5, available: true };
CHARACTERS.push(DEF_9999);

// Keyboard input (key() runs a keydown through every listener, menus first,
// as in the app) and gamepad menu commands (pad()). `sample` counts reads of
// Player 1's input: nobody may read it while spectating.
function fakeInput() {
  const keys = new Set();
  const pads = new Set();
  return {
    gameplayActive: false,
    lastDevice: 'keyboard',
    samples: 0,
    onKey(fn) { keys.add(fn); return () => keys.delete(fn); },
    onPadMenu(fn) { pads.add(fn); },
    key(code) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
      for (const fn of [...keys]) fn(e);
    },
    pad(cmd) { for (const fn of [...pads]) fn(cmd); },
    setGameplayActive(on) { this.gameplayActive = on; },
    flush: noop,
    sample() { this.samples++; return {}; },
  };
}

// The app on the real ScreenManager and MenuNavigator, with reduced motion
// so screens swap without timers: Home, Quick Battle's setup, Watch Mode's
// setup and the real Battle screen. Fighters load from `sets` (one fake
// sprite set per fighter); `loads` lists every load in order.
function boot({ sets = { '0001': fakeSprites(), '9999': fakeSprites() } } = {}) {
  const loads = [];
  const loading = {
    labels: [], progress: [], error: null,
    show(label) { this.labels.push(label); },
    hide: noop,
    setProgress(done, total) { this.progress.push([done, total]); },
    showError(message, opts) { this.error = { message, opts }; },
  };
  const app = {
    selection: {
      mode: 'quick-battle', difficulty: DEFAULT_DIFFICULTY, characterId: '0001', mapId: MAPS[0].id,
      watch: { difficulty: DEFAULT_DIFFICULTY, cpu1CharacterId: '0001', cpu2CharacterId: '0001', mapId: MAPS[0].id },
    },
    input: fakeInput(),
    device: { reducedMotion: true, blockedPortrait: false },
    audio: { play: noop },
    loading,
    sets,
    loads,
    loadCharacter(id, onProgress) {
      loads.push(id);
      onProgress?.(4, 4);
      return Promise.resolve(this.sets[id]);
    },
    getSprites: (id) => sets[id] ?? null,
    resets: [],
    resetCharacter(id) { this.resets.push(id); },
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  app.dialog = new ConfirmDialog(new Element('div'), app);
  const screens = {
    home: new HomeScreen(app),
    mode: new ModeSelectScreen(app),
    difficulty: new DifficultySelectScreen(app),
    character: new CharacterSelectScreen(app),
    map: new MapSelectScreen(app),
    watchDifficulty: new WatchDifficultyScreen(app),
    watchCpu1: new WatchFighterScreen(app, 1),
    watchCpu2: new WatchFighterScreen(app, 2),
    watchMap: new WatchMapScreen(app),
    battle: new BattleScreen(app),
  };
  for (const s of Object.values(screens)) app.screens.register(s);
  app.screens.go('home');
  return { app, screens };
}

// Lets the Battle screen's asynchronous load settle.
const settle = () => new Promise((resolve) => setImmediate(resolve));
const current = (app) => app.screens.current.id;
const cardOf = (screen, id) => screen.cards.find((c) => c.getAttribute('data-difficulty') === id);
const slotOf = (screen, id) => screen.roster.slots.find((s) => s._def?.id === id);
const mapCard = (screen, id) => screen.cards.find((c) => c._map.id === id);
const stepNames = (screen) => screen.el.querySelector('.steps').children.map((li) => li.querySelector('.step-name').textContent);
const byText = (root, text) => root.querySelectorAll('[data-nav]').find((b) => b.textContent === text);

// Home → Watch Mode → `difficulty` → `cpu1` → `cpu2` → `mapId`, by pointer,
// ending on Watch Mode's Select Stage.
function setUpWatch({ app, screens }, { difficulty = 'hard', cpu1 = DEF_9999, cpu2 = DEF_0001, mapId = MAPS[1].id } = {}) {
  screens.home.actions.watch.click();
  cardOf(screens.watchDifficulty, difficulty).click();
  screens.watchCpu1.confirm(cpu1);
  screens.watchCpu2.confirm(cpu2);
  mapCard(screens.watchMap, mapId).click();
  assert.equal(current(app), 'watch-map');
}

// …then starts it. `loads` lists only the Battle screen's loads (the
// rosters load every fighter for their portraits).
async function startWatch(booted, opts) {
  setUpWatch(booted, opts);
  booted.app.loads.length = 0;
  booted.screens.watchMap.start();
  await settle();
  return booted.screens.battle.battle;
}

// Home → Play → Quick Battle, straight through to its Battle.
async function startQuickBattle({ app, screens }, { difficulty = 'easy', fighter = DEF_0001 } = {}) {
  screens.home.actions.play.click();
  screens.mode.el.querySelector('.mode-card').click();
  cardOf(screens.difficulty, difficulty).click();
  screens.character.confirm(fighter);
  app.loads.length = 0;
  screens.map.start();
  await settle();
  assert.equal(current(app), 'battle');
  return screens.battle.battle;
}

// A Watch Mode Battle on a fake canvas, seeded with 1; `mode` and `seed`
// given as undefined reach Battle as undefined.
function makeBattle(opts = {}) {
  const { difficulty, p1Def = DEF_0001, p2Def = DEF_0001, input = fakeInput() } = opts;
  const mode = 'mode' in opts ? opts.mode : 'watch';
  const seed = 'seed' in opts ? opts.seed : 1;
  return new Battle({
    canvas: new Element('canvas'), map: getMap('desert'), mode,
    p1Def, p2Def, p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input, difficulty, seed,
  });
}

// Where both fighters are, what they do and the score, step by step.
function trace(battle, steps) {
  const out = [];
  battle.setPhase('fight');
  for (let i = 0; i < steps; i++) {
    battle.update(DT);
    const { p1, p2 } = battle;
    out.push([p1.body.x, p1.body.y, p1.state, p1.combat.launchPoint, p2.body.x, p2.body.y, p2.state, p2.combat.launchPoint,
      battle.score.p1, battle.score.p2].join());
  }
  return out;
}

// ---- Home ----------------------------------------------------------------------

test('Home: Watch Mode sits between Play and Practice Ground, styled like the secondary actions; Play stays the default', () => {
  const { app, screens } = boot();
  const home = screens.home;
  const { play, watch, practice, discover } = home.actions;
  assert.deepEqual(home.el.querySelectorAll('.home-action'), [play, watch, practice, discover], 'Play → Watch Mode → Practice Ground → Discover');
  assert.deepEqual(home.el.querySelector('.home-actions').children, [play, watch, practice, discover], 'in the DOM in that order');
  assert.ok(watch.html.includes('<span>Watch Mode</span>'));
  assert.ok(watch.html.includes(ICONS.right), 'the secondary actions\' chevron');
  assert.equal(watch.className, practice.className, 'the same outlined Home action as Practice Ground and Discover');
  assert.equal(watch.className, 'home-action');
  assert.equal(watch.tagName, 'BUTTON');
  assert.equal(watch.getAttribute('type'), 'button');
  assert.equal(watch.hasAttribute('data-nav'), true);
  assert.equal(watch.hasAttribute('data-nav-default'), false);
  assert.equal(watch.disabled, false);
  assert.equal(document.activeElement, play, 'Play is still focused by default');
  assert.deepEqual(app.nav.candidates(home.el), [play, watch, practice, discover], 'keyboard / gamepad reach all four, in order');
  // Practice Ground and Discover still open their screens (their stand-ins).
  assert.ok(practice.html.includes('<span>Practice Ground</span>'));
  assert.ok(discover.html.includes('<span>Discover</span>'));
  const src = readFileSync(new URL('../js/screens/home-screen.js', import.meta.url), 'utf8');
  assert.match(src, /practice\.addEventListener\('click', \(\) => app\.screens\.go\('practice'\)\)/);
  assert.match(src, /discover\.addEventListener\('click', \(\) => app\.screens\.go\('discover'\)\)/);
});

test('Watch Mode opens its own setup straight from Home, never Select Mode', () => {
  const { app, screens } = boot();
  let modeEntered = false;
  screens.mode.enter = () => { modeEntered = true; };
  screens.home.actions.watch.click();
  assert.equal(current(app), 'watch-difficulty');
  assert.deepEqual(app.screens.stack, ['home'], 'Back goes straight Home');
  assert.equal(modeEntered, false, 'Select Mode is never shown');
  assert.equal(document.documentElement.dataset.screen, 'watch-difficulty');
  assert.equal(document.activeElement, cardOf(screens.watchDifficulty, 'medium'), 'a fresh setup lands on Medium');
});

test('keyboard and gamepad reach Watch Mode on Home and open it', () => {
  const layOut = (home) => home.el.querySelectorAll('.home-action').forEach((b, i) => {
    b.rect = { left: 80, top: 370 + i * 60, width: 320, height: 52 };
  });
  // Keyboard: ↓ from Play, then J.
  let { app, screens } = boot();
  layOut(screens.home);
  app.input.key('ArrowDown');
  assert.equal(document.activeElement, screens.home.actions.watch);
  app.input.key('ArrowDown');
  assert.equal(document.activeElement, screens.home.actions.practice, 'Practice Ground under it');
  app.input.key('ArrowUp');
  app.input.key('KeyJ');
  assert.equal(current(app), 'watch-difficulty');
  // Esc comes back to Home.
  app.input.key('Escape');
  assert.equal(current(app), 'home');
  // Gamepad: D-pad down, then A.
  ({ app, screens } = boot());
  layOut(screens.home);
  app.input.pad('down');
  assert.equal(document.activeElement, screens.home.actions.watch);
  app.input.pad('confirm');
  assert.equal(current(app), 'watch-difficulty');
  app.input.pad('back');
  assert.equal(current(app), 'home');
  assert.equal(document.activeElement, screens.home.actions.play, 'Home focuses Play again');
});

// ---- Registration and setup screens ------------------------------------------------

test('the app registers the four Watch Mode screens, each with its own labelled section', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const expected = {
    'watch-difficulty': ['screen--difficulty', 'Watch Mode: select difficulty'],
    'watch-cpu1': ['screen--character', 'Watch Mode: select CPU 1'],
    'watch-cpu2': ['screen--character', 'Watch Mode: select CPU 2'],
    'watch-map': ['screen--map', 'Watch Mode: select stage'],
  };
  for (const [id, [cls, label]] of Object.entries(expected)) {
    const section = html.match(new RegExp(`<section[^>]*data-screen="${id}"[^>]*>`))?.[0];
    assert.ok(section, `index.html has ${id}`);
    assert.match(section, new RegExp(`class="screen screen--menu ${cls} screen--watch"`), 'the setup screens\' own styling');
    assert.match(section, new RegExp(`aria-label="${label}"`));
    assert.match(section, /\bhidden\b/);
  }
  for (const id of ['mode', 'difficulty', 'character', 'map', 'battle', 'practice', 'discover']) {
    assert.match(html, new RegExp(`data-screen="${id}"`), `${id} is still there`);
  }
  const src = readFileSync(new URL('../js/core/app.js', import.meta.url), 'utf8');
  for (const call of ['new WatchDifficultyScreen(this)', 'new WatchFighterScreen(this, 1)', 'new WatchFighterScreen(this, 2)', 'new WatchMapScreen(this)']) {
    assert.ok(src.includes(`s.register(${call});`), call);
  }
  assert.match(src, /watch: \{\s*difficulty: DEFAULT_DIFFICULTY,\s*cpu1CharacterId: firstFighter,\s*cpu2CharacterId: firstFighter,\s*mapId: MAPS\[0\]\.id,/,
    'Watch Mode starts on Medium, the first available fighter for both CPUs and the first stage');
  const { screens } = boot();
  assert.deepEqual(
    [screens.watchDifficulty, screens.watchCpu1, screens.watchCpu2, screens.watchMap].map((s) => s.id),
    ['watch-difficulty', 'watch-cpu1', 'watch-cpu2', 'watch-map'],
  );
});

test('Watch setup screens show Difficulty, CPU 1, CPU 2, Stage under "Watch Mode setup"; Quick Battle\'s header is unchanged', () => {
  const { screens } = boot();
  assert.deepEqual([...WATCH_SETUP.steps], ['Difficulty', 'CPU 1', 'CPU 2', 'Stage']);
  assert.deepEqual([...QUICK_BATTLE_SETUP.steps], ['Mode', 'Difficulty', 'Fighter', 'Stage']);
  const check = (screen, names, step, label) => {
    const list = screen.el.querySelector('.steps');
    assert.equal(list.getAttribute('aria-label'), label, screen.id);
    assert.deepEqual(stepNames(screen), names, screen.id);
    list.children.forEach((li, i) => {
      assert.equal(li.classList.contains('is-done'), i < step, `${screen.id} step ${i} done`);
      assert.equal(li.classList.contains('is-current'), i === step, `${screen.id} step ${i} current`);
      assert.equal(li.getAttribute('aria-current'), i === step ? 'step' : null);
      const num = li.querySelector('.step-num');
      if (i < step) assert.equal(num.innerHTML, ICONS.check, 'completed steps keep their check');
      else assert.equal(num.textContent, String(i + 1));
    });
  };
  const watch = [
    [screens.watchDifficulty, 0, 'Select Difficulty'],
    [screens.watchCpu1, 1, 'Select CPU 1'],
    [screens.watchCpu2, 2, 'Select CPU 2'],
    [screens.watchMap, 3, 'Select Stage'],
  ];
  for (const [screen, step, title] of watch) {
    check(screen, ['Difficulty', 'CPU 1', 'CPU 2', 'Stage'], step, 'Watch Mode setup');
    assert.equal(screen.el.querySelector('.kicker').textContent, 'Watch Mode');
    assert.equal(screen.el.querySelector('.screen-title').textContent, title);
    assert.equal(screen.el.querySelector('.screen-title').tagName, 'H1', 'one heading per screen');
    assert.equal(screen.el.querySelector('.btn-back').getAttribute('aria-label'), 'Back');
  }
  const quick = [[screens.mode, 0, 'Play'], [screens.difficulty, 1, 'Quick Battle'], [screens.character, 2, 'Quick Battle'], [screens.map, 3, 'Quick Battle']];
  for (const [screen, step, kicker] of quick) {
    check(screen, ['Mode', 'Difficulty', 'Fighter', 'Stage'], step, 'Quick Battle setup');
    assert.equal(screen.el.querySelector('.kicker').textContent, kicker);
  }
  assert.equal(screens.character.el.querySelector('.screen-title').textContent, 'Select Fighter');
  assert.ok(screens.map.startBtn.html.includes('<span>Confirm and start battle</span>'));
  assert.ok(screens.watchMap.startBtn.html.includes('<span>Confirm and watch battle</span>'));
});

test('Watch difficulty: the same four cards, one current level, every level chosen by pointer, keyboard and gamepad', () => {
  const { screens } = boot();
  const a = screens.watchDifficulty.cards;
  const b = screens.difficulty.cards;
  assert.deepEqual(a.map((c) => c._difficulty), [...DIFFICULTIES], 'the one difficulty table');
  assert.deepEqual(a.map((c) => c.getAttribute('aria-label')), b.map((c) => c.getAttribute('aria-label')));
  assert.deepEqual(a.map((c) => c.className), b.map((c) => c.className), 'the same cards');
  a.forEach((card, i) => {
    assert.notEqual(card.getAttribute('aria-describedby'), b[i].getAttribute('aria-describedby'), 'own description ids');
    assert.equal(card.querySelector('.difficulty-desc').id, card.getAttribute('aria-describedby'));
  });
  for (const id of DIFFICULTY_IDS) {
    for (const how of ['pointer', 'keyboard', 'gamepad']) {
      const booted = boot();
      const { app } = booted;
      booted.screens.home.actions.watch.click();
      const card = cardOf(booted.screens.watchDifficulty, id);
      if (how === 'pointer') card.click(1);
      else {
        card.focus();
        if (how === 'keyboard') app.input.key('KeyJ');
        else app.input.pad('confirm');
      }
      assert.equal(app.selection.watch.difficulty, id, `${how}: ${id}`);
      assert.equal(current(app), 'watch-cpu1', 'a level leads to Select CPU 1');
      assert.equal(app.selection.difficulty, DEFAULT_DIFFICULTY, 'Quick Battle\'s level is untouched');
      booted.screens.watchCpu1.onBack();
      const back = cardOf(booted.screens.watchDifficulty, id);
      assert.equal(document.activeElement, back, 'Back lands on the level chosen');
      assert.equal(back.getAttribute('aria-current'), 'true');
      assert.deepEqual(booted.screens.watchDifficulty.cards.filter((c) => c.classList.contains('is-current')), [back]);
    }
  }
});

// ---- The whole setup --------------------------------------------------------------

test('Home → Difficulty → CPU 1 → CPU 2 → Stage → Battle, and Back retraces every step with each choice kept', async () => {
  const booted = boot();
  const { app, screens } = booted;
  screens.home.actions.watch.click();
  assert.equal(current(app), 'watch-difficulty');
  cardOf(screens.watchDifficulty, 'brutal').click();
  assert.equal(current(app), 'watch-cpu1');
  assert.equal(document.activeElement, slotOf(screens.watchCpu1, '0001'), 'CPU 1 starts on the first available fighter');
  screens.watchCpu1.confirm(DEF_9999);
  assert.equal(current(app), 'watch-cpu2');
  screens.watchCpu2.confirm(DEF_0001);
  assert.equal(current(app), 'watch-map');
  mapCard(screens.watchMap, 'city').click();
  assert.deepEqual(app.screens.stack, ['home', 'watch-difficulty', 'watch-cpu1', 'watch-cpu2']);

  // Back, all the way Home, landing on each choice.
  screens.watchMap.onBack();
  assert.equal(current(app), 'watch-cpu2');
  assert.equal(document.activeElement, slotOf(screens.watchCpu2, '0001'));
  assert.ok(slotOf(screens.watchCpu2, '0001').classList.contains('is-selected'));
  screens.watchCpu2.el.querySelector('.btn-back').click();
  assert.equal(current(app), 'watch-cpu1');
  assert.equal(document.activeElement, slotOf(screens.watchCpu1, '9999'), 'CPU 1 keeps #9999');
  assert.equal(slotOf(screens.watchCpu1, '9999').getAttribute('aria-pressed'), 'true');
  app.input.key('Escape');
  assert.equal(current(app), 'watch-difficulty');
  assert.equal(document.activeElement, cardOf(screens.watchDifficulty, 'brutal'));
  app.input.pad('back');
  assert.equal(current(app), 'home');
  assert.deepEqual(app.selection.watch, { difficulty: 'brutal', cpu1CharacterId: '9999', cpu2CharacterId: '0001', mapId: 'city' },
    'every choice is kept after going Back');

  // Forward again: the stage kept too, then the battle.
  screens.home.actions.watch.click();
  cardOf(screens.watchDifficulty, 'brutal').click();
  screens.watchCpu1.confirm(DEF_9999);
  screens.watchCpu2.confirm(DEF_0001);
  assert.equal(document.activeElement, mapCard(screens.watchMap, 'city'), 'Select Stage lands on the stage chosen');
  const params = [];
  const enter = screens.battle.enter.bind(screens.battle);
  screens.battle.enter = (p) => { params.push(p); return enter(p); };
  screens.watchMap.startBtn.click();
  await settle();
  assert.equal(current(app), 'battle');
  assert.deepEqual(params, [{ mode: 'watch', mapId: 'city', cpu1CharacterId: '9999', cpu2CharacterId: '0001', difficulty: 'brutal' }],
    'the spectator flag, the stage, both fighters and the level');
  const battle = screens.battle.battle;
  assert.equal(battle.mode, 'watch');
  assert.equal(battle.map.id, 'city');
  screens.battle.exit();
});

test('CPU 1 and CPU 2 can be different fighters, or the same one', async () => {
  for (const [cpu1, cpu2] of [[DEF_9999, DEF_0001], [DEF_0001, DEF_9999], [DEF_0001, DEF_0001], [DEF_9999, DEF_9999]]) {
    const booted = boot();
    const battle = await startWatch(booted, { cpu1, cpu2 });
    assert.deepEqual([booted.app.selection.watch.cpu1CharacterId, booted.app.selection.watch.cpu2CharacterId], [cpu1.id, cpu2.id]);
    assert.deepEqual([battle.p1.def.id, battle.p2.def.id], [cpu1.id, cpu2.id], `${cpu1.id} vs ${cpu2.id}`);
    booted.screens.battle.exit();
  }
});

test('each roster is its own: distinct preview ids and headings, and no element id repeats on any setup screen', () => {
  const { screens } = boot();
  const cpu1 = screens.watchCpu1.roster;
  const cpu2 = screens.watchCpu2.roster;
  assert.notEqual(cpu1, cpu2);
  assert.notEqual(cpu1, screens.character.roster);
  assert.equal(cpu1.name.id, 'watch-cpu1-preview-name');
  assert.equal(cpu2.name.id, 'watch-cpu2-preview-name');
  assert.equal(screens.character.roster.name.id, 'preview-name', 'Quick Battle\'s id is unchanged');
  assert.equal(cpu1.previewPanel.getAttribute('aria-labelledby'), cpu1.name.id);
  assert.equal(cpu2.previewPanel.getAttribute('aria-labelledby'), cpu2.name.id);
  assert.notEqual(screens.watchCpu1.el.querySelector('.screen-title').textContent, screens.watchCpu2.el.querySelector('.screen-title').textContent);

  const ids = [];
  const walk = (n) => {
    if (!(n instanceof Element)) return;
    if (n.id) ids.push(n.id);
    n.children.forEach(walk);
  };
  for (const s of Object.values(screens)) walk(s.el);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repeated, [], 'no duplicate ids');
  // Every aria reference still points at an element on the same screen.
  for (const s of [screens.watchDifficulty, screens.watchCpu1, screens.watchCpu2]) {
    const own = [];
    const collect = (n) => { if (n instanceof Element) { if (n.id) own.push(n.id); n.children.forEach(collect); } };
    collect(s.el);
    for (const el of s.el.querySelectorAll('[aria-describedby], [aria-labelledby]')) {
      for (const attr of ['aria-describedby', 'aria-labelledby']) {
        const ref = el.getAttribute(attr);
        if (ref) assert.ok(own.includes(ref), `${s.id}: ${ref}`);
      }
    }
  }
});

test('locked roster slots stay locked on both Watch rosters, exactly as on Select Fighter', () => {
  const { screens } = boot();
  const shape = (roster) => roster.slots.map((s) => [s.tagName, s.className, s.getAttribute('aria-label'), s.hasAttribute('data-nav')]);
  for (const screen of [screens.watchCpu1, screens.watchCpu2]) {
    assert.deepEqual(shape(screen.roster), shape(screens.character.roster), screen.id);
    const locked = screen.roster.slots.filter((s) => !s._def?.available);
    assert.ok(locked.length > 0);
    for (const slot of locked) {
      assert.equal(slot.tagName, 'DIV', 'not a button');
      assert.equal(slot.hasAttribute('data-nav'), false, 'out of keyboard / gamepad navigation');
      assert.match(slot.getAttribute('aria-label'), /^Slot \d\d, locked$/);
    }
    assert.deepEqual(screen.roster.slots.filter((s) => s._def?.available).map((s) => s._def.id), ['0001', '9999']);
  }
});

// ---- Selection isolation -----------------------------------------------------------

test('Watch choices never touch Quick Battle\'s, and Quick Battle never touches Watch Mode\'s', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const quick = { difficulty: app.selection.difficulty, characterId: app.selection.characterId, mapId: app.selection.mapId };
  await startWatch(booted, { difficulty: 'brutal', cpu1: DEF_9999, cpu2: DEF_9999, mapId: 'city' });
  assert.deepEqual(
    { difficulty: app.selection.difficulty, characterId: app.selection.characterId, mapId: app.selection.mapId }, quick,
    'Quick Battle\'s difficulty, fighter and stage are untouched',
  );
  const watch = { ...app.selection.watch };
  assert.deepEqual(watch, { difficulty: 'brutal', cpu1CharacterId: '9999', cpu2CharacterId: '9999', mapId: 'city' });
  screens.battle.exit();
  app.screens.go('home', {}, { reset: true });

  // A Quick Battle with other choices.
  screens.home.actions.play.click();
  screens.mode.el.querySelector('.mode-card').click();
  cardOf(screens.difficulty, 'easy').click();
  assert.equal(document.activeElement, slotOf(screens.character, '0001'), 'Select Fighter shows Quick Battle\'s own fighter');
  screens.character.confirm(DEF_9999);
  assert.equal(document.activeElement, mapCard(screens.map, MAPS[0].id), 'and its own stage');
  mapCard(screens.map, MAPS[0].id).click();
  assert.deepEqual([app.selection.difficulty, app.selection.characterId, app.selection.mapId], ['easy', '9999', MAPS[0].id]);
  assert.deepEqual(app.selection.watch, watch, 'Watch Mode\'s choices are untouched');

  // And Watch Mode's screens still show its own.
  app.screens.go('home', {}, { reset: true });
  screens.home.actions.watch.click();
  assert.equal(document.activeElement, cardOf(screens.watchDifficulty, 'brutal'));
  cardOf(screens.watchDifficulty, 'brutal').click();
  assert.equal(document.activeElement, slotOf(screens.watchCpu1, '9999'));
});

test('stale Watch values fall back as Quick Battle\'s do: Medium, the first available fighter, the first stage', () => {
  const { app, screens } = boot();
  Object.assign(app.selection.watch, { difficulty: 'nightmare', cpu1CharacterId: 'gone', cpu2CharacterId: null, mapId: 'moon' });
  screens.home.actions.watch.click();
  assert.equal(document.activeElement, cardOf(screens.watchDifficulty, 'medium'));
  cardOf(screens.watchDifficulty, 'medium').click();
  assert.equal(app.selection.watch.difficulty, 'medium');
  assert.equal(document.activeElement, slotOf(screens.watchCpu1, '0001'));
  screens.watchCpu1.roster.confirm();
  assert.equal(app.selection.watch.cpu1CharacterId, '0001');
  assert.equal(document.activeElement, slotOf(screens.watchCpu2, '0001'));
  screens.watchCpu2.roster.confirm();
  assert.equal(app.selection.watch.cpu2CharacterId, '0001');
  assert.equal(app.selection.watch.mapId, MAPS[0].id, 'an unknown stage is the first one');
  assert.equal(document.activeElement, mapCard(screens.watchMap, MAPS[0].id));
});

// ---- The Battle -------------------------------------------------------------------

test('a Watch Mode Battle: the combat AI on both sides at the chosen level, each with its own fighter and label', () => {
  assert.deepEqual(Object.keys(BATTLE_MODES), ['quick-battle', 'watch']);
  for (const id of DIFFICULTY_IDS) {
    const battle = makeBattle({ difficulty: id, p1Def: DEF_9999, p2Def: DEF_0001 });
    assert.equal(battle.mode, 'watch');
    assert.ok(battle.p1.controller instanceof CombatAIController);
    assert.ok(battle.p2.controller instanceof CombatAIController);
    assert.ok(!(battle.p1.controller instanceof PlayerController));
    assert.notEqual(battle.p1.controller, battle.p2.controller, 'a controller each');
    assert.deepEqual([battle.difficulty, battle.p1.controller.difficulty, battle.p2.controller.difficulty], [id, id, id]);
    assert.equal(battle.p1.controller.profile, getDifficultyProfile(id));
    assert.equal(battle.p2.controller.profile, getDifficultyProfile(id), 'the same existing profile: no new AI levels');
    assert.equal(battle.p1.def.id, '9999');
    assert.equal(battle.p2.def.id, '0001');
    assert.deepEqual([battle.p1.label, battle.p2.label], ['CPU 1', 'CPU 2']);
    assert.deepEqual([battle.p1.slot, battle.p2.slot], ['p1', 'p2']);
    assert.equal(battle.p1.opponent, battle.p2);
    assert.equal(battle.p2.opponent, battle.p1);
    // The normal match rules.
    assert.equal(battle.pointsToWin, CONFIG.battle.pointsToWin);
    assert.equal(battle.timeLeft, CONFIG.battle.roundSeconds);
    assert.equal(battle.phase, 'intro');
  }
  for (const bad of [undefined, 'nightmare']) {
    const battle = makeBattle({ difficulty: bad });
    assert.deepEqual([battle.p1.controller.difficulty, battle.p2.controller.difficulty], ['medium', 'medium']);
  }
});

test('Quick Battle is unchanged: Player 1 against the CPU, tagged P1 and CPU', () => {
  for (const mode of [undefined, 'quick-battle', 'arcade']) {
    const input = fakeInput();
    const battle = makeBattle({ mode, difficulty: 'hard', input });
    assert.equal(battle.mode, 'quick-battle', `${mode}`);
    assert.ok(battle.p1.controller instanceof PlayerController);
    assert.equal(battle.p1.controller.input, input);
    assert.ok(battle.p2.controller instanceof CombatAIController);
    assert.equal(battle.p2.controller.difficulty, 'hard');
    assert.deepEqual([battle.p1.label, battle.p2.label], ['P1', 'CPU']);
  }
});

test('difficulty changes only how the CPUs think: both fighters are the same on every level', () => {
  const stats = (f) => [f.def, f.maxSpeed, f.jumpVelocity, f.combat.maxEnergy, f.combat.launchPoint, f.attacks, f.dashDuration];
  const base = makeBattle({ difficulty: 'easy' });
  for (const id of DIFFICULTY_IDS) {
    const battle = makeBattle({ difficulty: id });
    for (const side of ['p1', 'p2']) {
      assert.deepEqual(stats(battle[side]), stats(base[side]), `${id} ${side}`);
    }
  }
});

test('a seeded Watch battle is reproducible, and another seed plays differently', () => {
  const steps = Math.ceil(12 / DT);
  const a = trace(makeBattle({ seed: 11, difficulty: 'hard' }), steps);
  const b = trace(makeBattle({ seed: 11, difficulty: 'hard' }), steps);
  assert.deepEqual(a, b, 'the same seed, the same fight, step for step');
  const c = trace(makeBattle({ seed: 12, difficulty: 'hard' }), steps);
  assert.notDeepEqual(a, c, 'a different seed');
});

test('CPU 1 and CPU 2 never share one random sequence, mirror matches included', () => {
  for (const seed of [0, 1, 7, 42, 0xffff]) {
    const battle = makeBattle({ seed });
    const r1 = battle.p1.controller.rng;
    const r2 = battle.p2.controller.rng;
    assert.notEqual(r1, r2, 'two generators');
    const head = Array.from({ length: 8 }, r1);
    const window = Array.from({ length: 20000 }, r2);
    assert.ok(!head.some((v) => window.includes(v)), `seed ${seed}: CPU 2's sequence is not CPU 1's, not even shifted`);
    // The streams come from the battle's seed: the same seed, the same draws.
    const again = makeBattle({ seed });
    assert.deepEqual(Array.from({ length: 8 }, again.p1.controller.rng), head);
  }
  // Quick Battle's CPU keeps the seed's own stream, which Watch Mode's CPU 2
  // shares; CPU 1 has another one.
  assert.equal(deriveSeed(1234, 0), 1234);
  assert.notEqual(deriveSeed(1234, 1), 1234);
  const quick = makeBattle({ mode: 'quick-battle', seed: 5 });
  const watch = makeBattle({ seed: 5 });
  assert.deepEqual(Array.from({ length: 8 }, quick.p2.controller.rng), Array.from({ length: 8 }, watch.p2.controller.rng));
  assert.equal(mulberry32(deriveSeed(5, 0))(), mulberry32(5)());
});

test('in a seeded mirror match the two CPUs decide for themselves', () => {
  const battle = makeBattle({ seed: 3, difficulty: 'medium' });
  const samples = { p1: [], p2: [] };
  battle.setPhase('fight');
  for (let i = 0; i < Math.ceil(6 / DT); i++) {
    battle.update(DT);
    for (const side of ['p1', 'p2']) {
      const out = battle[side].controller.out;
      samples[side].push([out.left, out.right, out.jump, out.primary, out.action1, out.action2, out.defense, out.charge].join());
    }
  }
  // Were they one stream, the same position mirrored would bring the same
  // choice at the same moment; their inputs over six seconds differ.
  const mirrored = samples.p2.map((s) => {
    const [l, r, ...rest] = s.split(',');
    return [r, l, ...rest].join();
  });
  assert.notDeepEqual(samples.p1, mirrored);
  assert.notDeepEqual(battle.p1.controller.thinkTimer, battle.p2.controller.thinkTimer);
});

test('no seed: each battle takes its seed from the clock, so matches vary', () => {
  const now = Date.now;
  try {
    Date.now = () => 0x12345;
    const a = makeBattle({ seed: undefined });
    Date.now = () => 0x54321;
    const b = makeBattle({ seed: undefined });
    assert.deepEqual([a.seed, b.seed], [0x2345, 0x4321]);
    assert.notDeepEqual(Array.from({ length: 4 }, a.p1.controller.rng), Array.from({ length: 4 }, b.p1.controller.rng));
  } finally {
    Date.now = now;
  }
});

test('spectating: nothing reads gameplay input, and held buttons change nothing in a Watch battle', () => {
  const quiet = fakeInput();
  const steps = Math.ceil(8 / DT);
  const a = trace(makeBattle({ seed: 21, input: quiet }), steps);
  // Every button held and pressed, every step: were anyone reading it, the
  // fight would change.
  const all = fakeInput();
  const everything = {};
  for (const k of ['left', 'right', 'charge', 'jump', 'defense', 'primary', 'special', 'action1', 'action2']) {
    everything[k] = true;
    everything[`${k}Pressed`] = true;
  }
  all.sample = function () { this.samples++; return { ...everything }; };
  const b = trace(makeBattle({ seed: 21, input: all }), steps);
  assert.deepEqual(a, b);
  assert.equal(quiet.samples + all.samples, 0, 'Player 1\'s input is never sampled');
  // Quick Battle does read it.
  const quick = fakeInput();
  trace(makeBattle({ mode: 'quick-battle', input: quick }), 10);
  assert.ok(quick.samples > 0);
});

test('a full seeded Watch match plays out under the normal rules: first to 3 or time, then the usual winner', () => {
  const battle = makeBattle({ seed: 9, difficulty: 'brutal', p1Def: DEF_9999, p2Def: DEF_0001 });
  battle.setPhase('fight');
  let steps = 0;
  while (battle.phase !== 'result' && steps++ < Math.ceil((CONFIG.battle.roundSeconds + 10) / DT)) battle.update(DT);
  assert.equal(battle.phase, 'result', 'the match ends');
  const { outcome, reason } = battle.result;
  const { p1, p2 } = battle.score;
  if (reason === 'void') assert.equal(Math.max(p1, p2), CONFIG.battle.pointsToWin);
  else assert.ok(battle.timeLeft <= 0 && Math.max(p1, p2) < CONFIG.battle.pointsToWin);
  if (p1 !== p2) assert.equal(outcome, p1 > p2 ? 'p1' : 'p2');
  assert.ok(p1 + p2 > 0, `somebody scored (${p1} - ${p2})`);
});

// ---- The Battle screen --------------------------------------------------------------

test('entering Watch Mode loads each fighter once and builds the Battle, HUD and canvas label from both', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const battle = await startWatch(booted, { cpu1: DEF_9999, cpu2: DEF_0001, difficulty: 'hard' });
  assert.deepEqual(app.loads, ['9999', '0001'], 'both fighters, once each');
  assert.deepEqual(app.loading.labels, ['Loading #9999 and #0001']);
  assert.deepEqual(app.loading.progress.at(-1), [8, 8], 'one progress bar across both');
  assert.equal(battle.p1.sprites, app.sets['9999']);
  assert.equal(battle.p2.sprites, app.sets['0001']);
  assert.notEqual(battle.p1.sprites, battle.p2.sprites, 'two different sprite sets');
  assert.equal(battle.difficulty, 'hard');
  const { hud, canvas } = screens.battle;
  hud.update(battle);
  assert.deepEqual([hud.left.tag.textContent, hud.right.tag.textContent], ['CPU 1', 'CPU 2']);
  assert.deepEqual([hud.left.name.textContent, hud.right.name.textContent], ['#9999', '#0001']);
  assert.equal(hud.left.score.getAttribute('aria-label'), 'CPU 1: 0 of 3 points');
  assert.equal(hud.right.score.getAttribute('aria-label'), 'CPU 2: 0 of 3 points');
  assert.equal(hud.left.dots.length, CONFIG.battle.pointsToWin, 'the normal score dots');
  assert.equal(hud.timer.textContent, '5:00', 'the normal timer');
  assert.equal(canvas.getAttribute('aria-label'), 'Watch Mode battle: CPU 1, #9999, against CPU 2, #0001');
  assert.equal(canvas.getAttribute('role'), 'img');
  screens.battle.exit();
});

test('a mirror match loads its fighter once and both CPUs share the sprite set', async () => {
  const booted = boot();
  const battle = await startWatch(booted, { cpu1: DEF_0001, cpu2: DEF_0001 });
  assert.deepEqual(booted.app.loads, ['0001']);
  assert.deepEqual(booted.app.loading.labels, ['Loading #0001']);
  assert.equal(battle.p1.sprites, battle.p2.sprites);
  assert.equal(battle.p1.def, battle.p2.def);
  assert.notEqual(battle.p1.controller, battle.p2.controller);
  booted.screens.battle.exit();
});

test('a failed load of either CPU uses the loading error; Retry reloads that fighter and Back returns to the stage', async () => {
  for (const failing of ['9999', '0001']) {
    const booted = boot({ sets: { '0001': fakeSprites(), '9999': fakeSprites() } });
    const { app, screens } = booted;
    const good = app.sets[failing];
    app.sets[failing] = { usable: false };
    await startWatch(booted, { cpu1: DEF_9999, cpu2: DEF_0001 });
    assert.equal(screens.battle.battle, null, `${failing}: no battle`);
    const name = failing === '9999' ? '#9999' : '#0001';
    assert.equal(app.loading.error.message,
      `${name}'s sprite frames could not be loaded. Check your connection and that the files in assets/characters/${failing}/ exist.`);
    assert.equal(app.input.gameplayActive, false);
    assert.equal(screens.battle.touch.enabled, false);
    // Retry: only the failed fighter is dropped from the cache, then both load.
    app.sets[failing] = good;
    app.loading.error.opts.onRetry();
    await settle();
    assert.deepEqual(app.resets, [failing]);
    assert.ok(screens.battle.battle, 'the battle starts once both load');
    assert.deepEqual([screens.battle.battle.p1.def.id, screens.battle.battle.p2.def.id], ['9999', '0001']);
    screens.battle.exit();
  }
  // Both failing: one message naming both; Back is Watch Mode's Select Stage.
  const booted = boot({ sets: { '0001': { usable: false }, '9999': { usable: false } } });
  await startWatch(booted, { cpu1: DEF_9999, cpu2: DEF_0001 });
  assert.match(booted.app.loading.error.message, /^#9999's and #0001's sprite frames could not be loaded\. .*assets\/characters\/9999\/ and assets\/characters\/0001\/ exist\.$/);
  booted.app.loading.error.opts.onBack();
  assert.equal(current(booted.app), 'watch-map');
});

test('leaving while the fighters load never starts the abandoned battle', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const pending = [];
  setUpWatch(booted, { cpu1: DEF_9999, cpu2: DEF_0001 });
  app.loadCharacter = (id) => new Promise((resolve) => pending.push(() => resolve(app.sets[id])));
  screens.watchMap.start();
  assert.equal(pending.length, 2, 'both loads under way');
  app.screens.back(); // leave before they finish
  assert.equal(current(app), 'watch-map');
  for (const resolve of pending) resolve();
  await settle();
  assert.equal(screens.battle.battle, null, 'no stale battle');
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screens.battle.touch.enabled, false);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(current(app), 'watch-map');
});

test('spectating: no touch controls and no gameplay input, through pause, resume, restart and rematch; a Quick Battle turns them back on', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const screen = screens.battle;
  screen.touch.setEnabled(true); // as a previous Quick Battle left them
  await startWatch(booted);
  const off = () => {
    assert.equal(app.input.gameplayActive, false, 'no gameplay input');
    assert.equal(screen.touch.enabled, false, 'touch disabled');
    assert.equal(screen.touchRoot.hidden, true, 'touch controls hidden');
  };
  off();
  // Hidden outranks the touch layout's display: block on touch devices.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\nhtml\.is-touch \.touch-controls \{ display: block; \}\n(?:.*\n)*?html\.is-touch \.touch-controls\[hidden\] \{ display: none; \}/);
  assert.equal(screen.isRunning, true, 'the match runs');
  assert.ok(screen.el.classList.contains('is-watch'));
  // No fighter's own ability icons.
  assert.equal(screen.touch.buttons.get('primary').getAttribute('aria-label'), 'Throw');
  assert.equal(screen.touch.buttons.get('action1').getAttribute('aria-label'), 'Basic Attack 1');
  screen.pause();
  off();
  screen.resume();
  off();
  screen.restart();
  off();
  screen.battle.score.p1 = CONFIG.battle.pointsToWin;
  screen.finishBattle();
  off();
  screen.rematch();
  off();
  // Touch presses never reach the input while spectating.
  const touches = [];
  app.input.setTouch = (action, held) => touches.push([action, held]);
  screen.touch.buttons.get('jump').dispatch('pointerdown', { pointerId: 1, preventDefault: noop });
  assert.deepEqual(touches, []);
  screen.exit();

  app.screens.go('home', {}, { reset: true });
  await startQuickBattle(booted);
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.touchRoot.hidden, false);
  assert.ok(!screen.el.classList.contains('is-watch'));
  assert.equal(screen.touch.buttons.get('primary').getAttribute('aria-label'), 'Shuriken', 'Player 1\'s fighter again');
  screen.exit();
});

test('pause still works while spectating: P, Esc, gamepad Start and the HUD, with the Watch Mode kicker and the usual menu', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const screen = screens.battle;
  await startWatch(booted);
  const items = () => screen.pauseMenuView.querySelectorAll('[data-nav]').map((b) => b.textContent);

  app.input.key('KeyP');
  assert.equal(screen.paused, true, 'P pauses');
  assert.equal(screen.pauseMenuView.querySelector('.kicker').textContent, 'Watch Mode');
  assert.deepEqual(items(), ['Resume', 'Restart Battle', 'Help', 'Return to Home'], 'no fighter controls');
  assert.equal(screen.helpBtn.disabled, true, 'Help keeps its current state');
  assert.equal(document.activeElement.textContent, 'Resume');
  assert.deepEqual(app.nav.scopes, [screen.pauseScope]);
  app.input.key('KeyP');
  assert.equal(screen.paused, false, 'P resumes');

  app.input.key('Escape');
  assert.equal(screen.paused, true, 'Esc pauses');
  app.input.key('Escape');
  assert.equal(screen.paused, false, 'Esc resumes');

  app.input.pad('start');
  assert.equal(screen.paused, true, 'gamepad Start pauses');
  app.input.pad('start');
  assert.equal(screen.paused, false, 'gamepad Start resumes');

  screen.hud.pauseButton.click();
  assert.equal(screen.paused, true, 'the HUD pause button');
  byText(screen.pauseMenuView, 'Resume').click();
  assert.equal(screen.paused, false);
  assert.deepEqual(app.nav.scopes, []);

  // A paused match holds still.
  const battle = screen.battle;
  screen.update(0.5);
  const phaseTime = battle.phaseTime;
  screen.pause();
  screen.update(0.5);
  assert.equal(battle.phaseTime, phaseTime);
  screen.exit();
});

test('Restart Battle and Rematch keep both CPUs, their fighters, the level, the stage and the mode, and reset the AIs', async () => {
  const booted = boot();
  const { screens } = booted;
  const screen = screens.battle;
  const battle = await startWatch(booted, { difficulty: 'brutal', cpu1: DEF_9999, cpu2: DEF_0001, mapId: 'city' });
  const [ai1, ai2] = [battle.p1.controller, battle.p2.controller];
  const check = (what) => {
    assert.equal(screen.battle, battle, `${what}: the same battle`);
    assert.equal(battle.mode, 'watch');
    assert.deepEqual([battle.p1.controller, battle.p2.controller], [ai1, ai2], `${what}: the same two AIs, never a PlayerController`);
    assert.ok(battle.p1.controller instanceof CombatAIController);
    assert.deepEqual([ai1.difficulty, ai2.difficulty], ['brutal', 'brutal']);
    assert.deepEqual([battle.p1.def.id, battle.p2.def.id], ['9999', '0001']);
    assert.deepEqual([battle.p1.label, battle.p2.label], ['CPU 1', 'CPU 2']);
    assert.equal(battle.map.id, 'city');
    assert.equal(ai1.intent, null, `${what}: CPU 1 plans afresh`);
    assert.equal(ai2.intent, null, `${what}: CPU 2 plans afresh`);
    assert.deepEqual(battle.score, { p1: 0, p2: 0 });
    assert.equal(battle.phase, 'intro');
    assert.equal(screen.hud.left.tag.textContent, 'CPU 1');
  };
  const play = () => {
    battle.setPhase('fight');
    for (let i = 0; i < 180; i++) battle.update(DT);
  };
  play();
  screen.pause();
  byText(screen.pauseMenuView, 'Restart Battle').click();
  check('restart');
  assert.equal(screen.paused, false);
  play();
  battle.score.p2 = CONFIG.battle.pointsToWin;
  screen.finishBattle();
  byText(screen.resultOverlay, 'Rematch').click();
  check('rematch');
  assert.equal(screen.resultOverlay.hidden, true);
  // Gamepad Start on the result is Rematch too.
  battle.score.p1 = CONFIG.battle.pointsToWin;
  screen.finishBattle();
  booted.app.input.pad('start');
  check('rematch from Start');
  screen.exit();
});

test('results name CPU 1 and CPU 2 in Watch Mode; Quick Battle\'s wording is unchanged', async () => {
  const cases = [
    // [mode, winner, how, title, line]
    ['watch', 'p1', 'void', 'CPU 1 Wins', 'CPU 2 fell into the Void for the final point.'],
    ['watch', 'p2', 'void', 'CPU 2 Wins', 'CPU 1 fell into the Void for the final point.'],
    ['watch', 'p1', 'points', 'CPU 1 Wins', 'Time ran out. More points wins the match.'],
    ['watch', 'p2', 'time', 'CPU 2 Wins', 'Time ran out with the points level. Lower Launch Point wins.'],
    ['quick-battle', 'p1', 'void', 'Player 1 Wins', 'The CPU fell into the Void for the final point.'],
    ['quick-battle', 'p2', 'void', 'CPU Wins', 'Player 1 fell into the Void for the final point.'],
    ['quick-battle', 'p2', 'points', 'CPU Wins', 'Time ran out. More points wins the match.'],
  ];
  for (const [mode, winner, how, title, line] of cases) {
    const booted = boot();
    const screen = booted.screens.battle;
    const battle = mode === 'watch' ? await startWatch(booted) : await startQuickBattle(booted);
    const loser = winner === 'p1' ? 'p2' : 'p1';
    if (how === 'void') battle.score[winner] = CONFIG.battle.pointsToWin;
    else if (how === 'points') battle.score[winner] = 1;
    else battle[loser].combat.launchPoint = 50;
    assert.deepEqual(battle.result, { outcome: winner, reason: how });
    screen.finishBattle();
    assert.equal(screen.resultOverlay.hidden, false);
    assert.equal(screen.resultTitle.textContent, title, `${mode} ${winner} ${how}`);
    assert.equal(screen.resultSub.textContent, line);
    assert.equal(screen.resultKicker.textContent, how === 'void' ? 'K.O.' : 'Time over');
    assert.equal(screen.resultOverlay.getAttribute('aria-labelledby'), screen.resultTitle.id, 'the dialog is announced by its title');
    assert.doesNotMatch(screen.resultOverlay.textContent, mode === 'watch' ? /Player 1|The CPU/ : /CPU 1|CPU 2/);
    assert.equal(document.activeElement.textContent, 'Rematch');
    screen.exit();
  }
  // A draw still starts a fresh battle, with no dialog.
  const booted = boot();
  const battle = await startWatch(booted);
  battle.phase = 'result';
  booted.screens.battle.finishBattle();
  assert.equal(booted.screens.battle.resultOverlay.hidden, true);
  assert.equal(battle.phase, 'intro');
  booted.screens.battle.exit();
});

test('Change Stage returns to Watch Mode\'s Select Stage after a Watch battle, and to Quick Battle\'s after a Quick Battle', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const battle = await startWatch(booted, { mapId: 'city' });
  battle.score.p1 = CONFIG.battle.pointsToWin;
  screens.battle.finishBattle();
  byText(screens.battle.resultOverlay, 'Change Stage').click();
  assert.equal(current(app), 'watch-map');
  assert.equal(screens.battle.battle, null, 'the battle is over');
  assert.equal(document.activeElement, mapCard(screens.watchMap, 'city'), 'on the stage it was played on');
  assert.deepEqual(app.nav.scopes, []);
  // Another stage, and the rest of the setup kept.
  mapCard(screens.watchMap, 'desert').click();
  screens.watchMap.start();
  await settle();
  assert.equal(screens.battle.battle.map.id, 'desert');
  assert.equal(screens.battle.battle.mode, 'watch');
  assert.deepEqual([screens.battle.battle.p1.def.id, screens.battle.battle.p2.def.id], ['9999', '0001']);
  // Back from Watch Mode's stage still retraces its setup.
  app.screens.back();
  assert.equal(current(app), 'watch-map');
  app.screens.back();
  assert.equal(current(app), 'watch-cpu2');
  app.screens.go('home', {}, { reset: true });

  const quick = await startQuickBattle(booted);
  quick.score.p2 = CONFIG.battle.pointsToWin;
  screens.battle.finishBattle();
  byText(screens.battle.resultOverlay, 'Change Stage').click();
  assert.equal(current(app), 'map', 'Quick Battle\'s own Select Stage');
});

test('Return to Home after watching, then a Quick Battle behaves exactly as before', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const screen = screens.battle;
  await startWatch(booted, { cpu1: DEF_9999, cpu2: DEF_9999, difficulty: 'brutal' });
  screen.pause();
  byText(screen.pauseMenuView, 'Return to Home').click();
  assert.equal(app.dialog.root.hidden, false, 'confirmed first');
  app.dialog.okBtn.click();
  await settle();
  assert.equal(current(app), 'home');
  assert.deepEqual(app.screens.stack, []);
  assert.equal(screen.battle, null);
  assert.equal(document.activeElement, screens.home.actions.play);

  app.loads.length = 0;
  app.loading.labels.length = 0;
  const battle = await startQuickBattle(booted, { difficulty: 'easy' });
  assert.deepEqual(app.loads, ['0001'], 'one fighter loaded');
  assert.deepEqual(app.loading.labels, ['Loading #0001']);
  assert.equal(battle.mode, 'quick-battle');
  assert.ok(battle.p1.controller instanceof PlayerController);
  assert.ok(battle.p2.controller instanceof CombatAIController);
  assert.equal(battle.p2.controller.difficulty, 'easy', 'Quick Battle\'s level, not Watch Mode\'s');
  assert.deepEqual([battle.p1.def.id, battle.p2.def.id], ['0001', '0001'], 'the CPU plays Player 1\'s fighter');
  assert.equal(battle.p1.sprites, battle.p2.sprites);
  assert.deepEqual([battle.p1.label, battle.p2.label], ['P1', 'CPU']);
  assert.deepEqual([screen.hud.left.tag.textContent, screen.hud.right.tag.textContent], ['P1', 'CPU']);
  assert.equal(screen.canvas.getAttribute('aria-label'), 'Battle');
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  screen.pause();
  assert.equal(screen.pauseMenuView.querySelector('.kicker').textContent, 'Quick Battle');
  screen.exit();
});
