// Run with node --test tests/integration/quick-battle.test.mjs (no dependencies).
// Quick Battle's two play types, on the real ScreenManager, MenuNavigator,
// setup screens, choice dialog and Battle screen:
//
//   Regular Play: Select Mode → Difficulty → Fighter → Battle (the CPU's
//                 fighter and the stage drawn at random)
//   Custom Play:  Select Mode → Difficulty → Fighter → CPU → Stage → Battle
//
// The choice dialog Quick Battle opens (pointer, keyboard, gamepad,
// dismissal), each route's progress steps and Back, the draw (only playable
// fighters, only MAPS stages, kept through Restart Battle and Rematch), the
// CPU's own fighter reaching the Battle beside Player 1's, and Change Stage
// after either. The fighters are mostly test-only (see
// tests/fighters/fixtures/test-fighters.mjs). On a minimal fake DOM; layout
// and paint still need real-browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeSprites, fakeSpritesOf } from '../helpers/fighter-harness.mjs';
import { TEST_A, TEST_SAMPLE, TEST_DISABLED, testFighter, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';

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


const { CHARACTERS, getCharacter, playableCharacters } = await import('../../js/data/characters.js');
const { DEFAULT_DIFFICULTY } = await import('../../js/data/difficulty.js');
const { MAPS } = await import('../../js/data/maps.js');
const { PRACTICE_MAP } = await import('../../js/data/practice-map.js');
const { ICONS } = await import('../../js/ui/icons.js');
const { ConfirmDialog, ChoiceDialog, InfoDialog } = await import('../../js/ui/overlays.js');
const { Settings } = await import('../../js/core/settings.js');
const { setLanguage, localizeTree, t } = await import('../../js/localization/i18n.js');
const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { initialSelection } = await import('../../js/core/app.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { ModeSelectScreen } = await import('../../js/screens/mode-select-screen.js');
const { DifficultySelectScreen } = await import('../../js/screens/difficulty-select-screen.js');
const { CharacterSelectScreen } = await import('../../js/screens/character-select-screen.js');
const { QuickCpuScreen } = await import('../../js/screens/quick-cpu-screen.js');
const { MapSelectScreen } = await import('../../js/screens/map-select-screen.js');
const { WatchDifficultyScreen, WatchFighterScreen, WatchMapScreen } = await import('../../js/screens/watch-screens.js');
const { BattleScreen } = await import('../../js/screens/battle-screen.js');
const { pickRandom, drawRegularPlay, quickBattleParams } = await import('../../js/screens/quick-battle-setup.js');
const { CombatAIController } = await import('../../js/game/ai/combat-ai.js');
const { PlayerController } = await import('../../js/game/fighters/fighter-controller.js');

// Beside #0001 and #0002: Test A (slot 09), #9999 (#0001's art under another
// id, slot 06), the sample fighter's different moves (slot 05) and a
// disabled fighter (slot 07) no route may pick.
const DEF_9999 = testFighter('9999', '#9999', 5);
useTestFighters(TEST_A, DEF_9999, TEST_SAMPLE, TEST_DISABLED);

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

// The app on the real ScreenManager and MenuNavigator, with reduced motion
// so screens swap without timers, its selection as the app starts it.
// Fighters load from one fake sprite set each; `loads` lists every load.
function boot() {
  const sets = {
    '0001': fakeSprites(), '0002': fakeSpritesOf(getCharacter('0002')), 'test-a': fakeSprites(),
    '9999': fakeSprites(), 'test-sample': fakeSpritesOf(TEST_SAMPLE),
  };
  const loads = [];
  const app = {
    selection: initialSelection(),
    input: fakeInput(),
    settings: new Settings(null),
    device: { reducedMotion: true, blockedPortrait: false },
    audio: { play: noop },
    loading: { labels: [], show(label) { this.labels.push(label); }, hide: noop, setProgress: noop, showError(message) { this.error = message; } },
    loads,
    loadCharacter(id, onProgress) {
      loads.push(id);
      onProgress?.(4, 4);
      return Promise.resolve(sets[id]);
    },
    getSprites: (id) => sets[id] ?? null,
    resetCharacter: noop,
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
    cpu: new QuickCpuScreen(app),
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

const settle = () => new Promise((resolve) => setImmediate(resolve));
const current = (app) => app.screens.current.id;
const card = (screens) => screens.mode.el.querySelector('.mode-card');
const cardOf = (screen, id) => screen.cards.find((c) => c.getAttribute('data-difficulty') === id);
const slotOf = (screen, id) => screen.roster.slots.find((s) => s._def?.id === id);
const mapCard = (screen, id) => screen.cards.find((c) => c._map.id === id);
const stepNames = (screen) => screen.el.querySelector('.steps').children.map((li) => li.querySelector('.step-name').textContent);
const currentStep = (screen) => screen.el.querySelector('.steps').children.findIndex((li) => li.classList.contains('is-current'));
const byText = (root, text) => root.querySelectorAll('[data-nav]').find((b) => b.textContent === text);
const choices = (app) => app.choiceDialog.options.querySelectorAll('[data-nav]');

// Runs `fn` with Math.random returning `values` in turn.
function withRandom(values, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => values[i++ % values.length];
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}
// The value that makes pickRandom choose `item` of `list`.
const toPick = (list, item) => (list.indexOf(item) + 0.5) / list.length;

// Home → Play → Quick Battle, its dialog open.
function openQuickBattle({ app, screens }) {
  screens.home.actions.play.click();
  assert.equal(current(app), 'mode');
  card(screens).click();
  assert.equal(app.choiceDialog.isOpen, true);
}

// …then `type` chosen, landing on Select Difficulty.
async function choose(booted, type) {
  booted.app.choiceDialog.buttonFor(type).click();
  await settle();
  assert.equal(current(booted.app), 'difficulty');
}

// Regular Play through to its Battle: `fighter` for Player 1, the draw
// steered to `cpu` and `mapId`.
async function startRegular(booted, { difficulty = 'hard', fighter = TEST_A, cpu = DEF_9999, mapId = 'city' } = {}) {
  const { app, screens } = booted;
  openQuickBattle(booted);
  await choose(booted, 'regular');
  cardOf(screens.difficulty, difficulty).click();
  app.loads.length = 0;
  withRandom([toPick(playableCharacters(), cpu), toPick(MAPS, MAPS.find((m) => m.id === mapId))], () => screens.character.confirm(fighter));
  await settle();
  assert.equal(current(app), 'battle');
  return screens.battle.battle;
}

// Custom Play through to its Battle.
async function startCustom(booted, { difficulty = 'hard', fighter = TEST_SAMPLE, cpu = TEST_A, mapId = 'city' } = {}) {
  const { app, screens } = booted;
  openQuickBattle(booted);
  await choose(booted, 'custom');
  cardOf(screens.difficulty, difficulty).click();
  screens.character.confirm(fighter);
  screens.cpu.confirm(cpu);
  mapCard(screens.map, mapId).click();
  app.loads.length = 0;
  screens.map.start();
  await settle();
  assert.equal(current(app), 'battle');
  return screens.battle.battle;
}

// ---- Registration ----------------------------------------------------------------

test('the app registers Select CPU after Select Fighter, with its own section, and starts Quick Battle on Regular Play', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const section = html.match(/<section[^>]*data-screen="quick-cpu"[^>]*>/)?.[0];
  assert.ok(section, 'index.html has Select CPU');
  assert.match(section, /class="screen screen--menu screen--character"/, 'Select Fighter\'s own styling');
  assert.match(section, /data-i18n-aria-label="screen\.quickCpu"/);
  assert.match(section, /aria-label="Select CPU"/);
  const at = (id) => html.indexOf(`data-screen="${id}"`);
  assert.ok(at('character') < at('quick-cpu') && at('quick-cpu') < at('map'), 'between Fighter and Stage');
  assert.match(html, /<div id="choice-dialog" class="overlay dialog-overlay choice-overlay" hidden><\/div>/, 'the dialog root beside the other overlays');
  const src = readFileSync(new URL('../../js/core/app.js', import.meta.url), 'utf8');
  const order = ['new CharacterSelectScreen(this)', 'new QuickCpuScreen(this)', 'new MapSelectScreen(this)'].map((c) => src.indexOf(`s.register(${c});`));
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(src, /this\.choiceDialog = new ChoiceDialog\(document\.getElementById\('choice-dialog'\), this\);/);
  const selection = initialSelection();
  assert.equal(selection.playType, 'regular');
  assert.equal(selection.cpuCharacterId, playableCharacters()[0].id, 'the CPU starts on the first playable fighter');
  assert.equal(selection.watch.cpu1CharacterId, selection.cpuCharacterId);
  assert.equal('cpuCharacterId' in selection.watch, false, 'Watch Mode keeps its own fighters');
});

// ---- The choice dialog --------------------------------------------------------------

test('Quick Battle opens a modal choice of Custom Play and Regular Play, Regular focused; nothing advances until one is chosen', async () => {
  const booted = boot();
  const { app, screens } = booted;
  openQuickBattle(booted);
  const dialog = app.choiceDialog;
  const root = dialog.root;
  assert.equal(current(app), 'mode', 'still Select Mode');
  assert.deepEqual(app.screens.stack, ['home']);
  assert.equal(root.hidden, false);
  assert.equal(root.getAttribute('role'), 'dialog', 'a choice, not an alert');
  assert.equal(root.getAttribute('aria-modal'), 'true');
  assert.equal(root.getAttribute('aria-labelledby'), dialog.title.id);
  assert.equal(dialog.title.textContent, 'How do you want to play?');
  assert.equal(dialog.kicker.textContent, 'Quick Battle');
  assert.deepEqual(choices(app).map((b) => b.textContent), ['Custom Play', 'Regular Play'], 'exactly the two choices');
  for (const b of choices(app)) {
    assert.equal(b.tagName, 'BUTTON');
    const desc = root.querySelectorAll('.choice-desc').find((p) => p.id === b.getAttribute('aria-describedby'));
    assert.ok(desc, `${b.textContent} is described`);
  }
  assert.match(dialog.buttonFor('regular').className, /btn--primary/);
  assert.equal(document.activeElement, dialog.buttonFor('regular'), 'focus enters on Regular Play');
  assert.equal(screens.mode.el.inert, true, 'the screen beneath is inert');
  assert.deepEqual(app.nav.scopes, [dialog.scope]);
  assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Close');
  assert.equal(dialog.closeButton.innerHTML, ICONS.close);
  await settle();
  assert.equal(current(app), 'mode', 'nothing chosen yet');
  // In French.
  setLanguage('fr');
  try {
    localizeTree(root);
    assert.deepEqual(choices(app).map((b) => b.textContent), ['Partie personnalisée', 'Partie classique']);
    assert.equal(dialog.title.textContent, 'Comment voulez-vous jouer ?');
    assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Fermer');
  } finally {
    setLanguage('en');
    localizeTree(root);
  }
  await choose(booted, 'regular');
  assert.equal(app.selection.playType, 'regular');
  assert.equal(root.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screens.mode.el.inert, true, 'Select Mode is behind now, as any screen left');
});

test('Escape, gamepad Back, the close button and a press around the panel dismiss it: still on Select Mode, focus back on Quick Battle, nothing chosen', async () => {
  const ways = {
    escape: (app) => app.input.key('Escape'),
    gamepad: (app) => app.input.pad('back'),
    close: (app) => app.choiceDialog.closeButton.click(),
    backdrop: (app) => app.choiceDialog.root.dispatch('click'),
  };
  for (const [how, dismiss] of Object.entries(ways)) {
    const booted = boot();
    const { app, screens } = booted;
    app.selection.playType = 'custom';
    openQuickBattle(booted);
    dismiss(app);
    await settle();
    assert.equal(app.choiceDialog.isOpen, false, how);
    assert.equal(app.choiceDialog.root.hidden, true, how);
    assert.equal(current(app), 'mode', `${how}: still Select Mode`);
    assert.deepEqual(app.screens.stack, ['home']);
    assert.equal(screens.mode.el.inert, false, `${how}: the screen is live again`);
    assert.equal(document.activeElement, card(screens), `${how}: focus back on Quick Battle`);
    assert.equal(app.selection.playType, 'custom', `${how}: neither play type chosen`);
    assert.deepEqual(app.nav.scopes, []);
    // A press inside the panel never dismisses it.
    card(screens).click();
    app.choiceDialog.options.dispatch('click');
    assert.equal(app.choiceDialog.isOpen, true);
    // And Escape now is Select Mode's own Back again, after a dismissal.
    app.input.key('Escape');
    app.input.key('Escape');
    await settle();
    assert.equal(current(app), 'home', `${how}: Back from Select Mode is Home`);
  }
});

test('keyboard and gamepad reach both choices and choose either', async () => {
  const layOut = (app) => {
    app.choiceDialog.closeButton.rect = { left: 680, top: 260, width: 40, height: 40 };
    app.choiceDialog.buttonFor('custom').rect = { left: 400, top: 330, width: 150, height: 44 };
    app.choiceDialog.buttonFor('regular').rect = { left: 570, top: 330, width: 150, height: 44 };
  };
  // Keyboard: ← to Custom Play, J.
  let booted = boot();
  openQuickBattle(booted);
  layOut(booted.app);
  booted.app.input.key('ArrowLeft');
  assert.equal(document.activeElement, booted.app.choiceDialog.buttonFor('custom'));
  booted.app.input.key('ArrowRight');
  assert.equal(document.activeElement, booted.app.choiceDialog.buttonFor('regular'));
  booted.app.input.key('ArrowUp');
  assert.equal(document.activeElement, booted.app.choiceDialog.closeButton, 'the close button above');
  booted.app.input.key('ArrowDown');
  booted.app.input.key('ArrowLeft');
  booted.app.input.key('KeyJ');
  await settle();
  assert.equal(current(booted.app), 'difficulty');
  assert.equal(booted.app.selection.playType, 'custom');
  // Gamepad: A on the default, Regular Play.
  booted = boot();
  openQuickBattle(booted);
  layOut(booted.app);
  booted.app.input.pad('confirm');
  await settle();
  assert.equal(booted.app.selection.playType, 'regular');
  assert.equal(current(booted.app), 'difficulty');
  // Gamepad: D-pad left, then A.
  booted = boot();
  openQuickBattle(booted);
  layOut(booted.app);
  booted.app.input.pad('left');
  booted.app.input.pad('confirm');
  await settle();
  assert.equal(booted.app.selection.playType, 'custom');
});

test('Back to Select Mode and Quick Battle again asks again, so the player can switch play type', async () => {
  const booted = boot();
  const { app, screens } = booted;
  openQuickBattle(booted);
  await choose(booted, 'custom');
  assert.deepEqual(stepNames(screens.difficulty), ['Mode', 'Difficulty', 'Fighter', 'CPU', 'Stage']);
  screens.difficulty.onBack();
  assert.equal(current(app), 'mode');
  assert.deepEqual(stepNames(screens.mode), ['Mode', 'Difficulty', 'Fighter', 'CPU', 'Stage'], 'Select Mode shows the path chosen');
  card(screens).click();
  assert.equal(app.choiceDialog.isOpen, true, 'asked again');
  await choose(booted, 'regular');
  assert.equal(app.selection.playType, 'regular');
  assert.deepEqual(stepNames(screens.difficulty), ['Mode', 'Difficulty', 'Fighter']);
  assert.deepEqual(app.screens.stack, ['home', 'mode']);
});

// ---- Regular Play -------------------------------------------------------------------

test('Regular Play: Mode → Difficulty → Fighter → Battle, the CPU\'s fighter and the stage drawn, Back retracing only the steps visited', async () => {
  const booted = boot();
  const { app, screens } = booted;
  openQuickBattle(booted);
  await choose(booted, 'regular');
  assert.deepEqual([stepNames(screens.difficulty), currentStep(screens.difficulty)], [['Mode', 'Difficulty', 'Fighter'], 1]);
  cardOf(screens.difficulty, 'hard').click();
  assert.equal(current(app), 'character');
  assert.deepEqual([stepNames(screens.character), currentStep(screens.character)], [['Mode', 'Difficulty', 'Fighter'], 2],
    'no CPU or Stage ahead');
  // Back: Fighter → Difficulty → Mode.
  screens.character.onBack();
  assert.equal(current(app), 'difficulty');
  screens.difficulty.onBack();
  assert.equal(current(app), 'mode');
  card(screens).click();
  await choose(booted, 'regular');
  cardOf(screens.difficulty, 'hard').click();
  // Confirming the fighter starts the Battle, drawing #9999 and City.
  const params = [];
  const enter = screens.battle.enter.bind(screens.battle);
  screens.battle.enter = (p) => { params.push(p); return enter(p); };
  let cpuEntered = false;
  let mapEntered = false;
  screens.cpu.enter = () => { cpuEntered = true; };
  screens.map.enter = () => { mapEntered = true; };
  app.loads.length = 0;
  withRandom([toPick(playableCharacters(), DEF_9999), toPick(MAPS, MAPS[1])], () => screens.character.confirm(TEST_A));
  await settle();
  assert.equal(current(app), 'battle');
  assert.equal(cpuEntered || mapEntered, false, 'Select CPU and Select Stage are skipped');
  assert.deepEqual(app.screens.stack, ['home', 'mode', 'difficulty', 'character']);
  assert.deepEqual(params, [{ mapId: MAPS[1].id, characterId: 'test-a', cpuCharacterId: '9999', difficulty: 'hard' }]);
  assert.deepEqual([app.selection.cpuCharacterId, app.selection.mapId], ['9999', MAPS[1].id], 'stored where the Battle screen reads');
  const battle = screens.battle.battle;
  assert.deepEqual([battle.p1.def.id, battle.p2.def.id], ['test-a', '9999']);
  assert.equal(battle.map.id, MAPS[1].id);
  assert.ok(battle.p1.controller instanceof PlayerController);
  assert.ok(battle.p2.controller instanceof CombatAIController);
  assert.equal(battle.p2.controller.difficulty, 'hard');
  assert.deepEqual(app.loads, ['test-a', '9999'], 'both fighters load');
  screens.battle.exit();
});

test('Regular Play draws only from the fighters playable now and from MAPS: never Practice Ground, never a locked fighter', () => {
  const playable = playableCharacters().map((d) => d.id);
  assert.ok(!playable.includes(TEST_DISABLED.id));
  assert.ok(CHARACTERS.includes(TEST_DISABLED), 'a locked fighter is in the roster');
  assert.ok(!MAPS.some((m) => m.id === PRACTICE_MAP.id), 'Practice Ground is no stage to draw');
  const drawn = { fighters: new Set(), maps: new Set() };
  for (let i = 0; i < 200; i++) {
    const selection = {};
    const r = i / 200;
    drawRegularPlay(selection, () => r);
    drawn.fighters.add(selection.cpuCharacterId);
    drawn.maps.add(selection.mapId);
  }
  // Both ends of the range too.
  for (const r of [0, 0.9999999999]) {
    const selection = {};
    drawRegularPlay(selection, () => r);
    drawn.fighters.add(selection.cpuCharacterId);
    drawn.maps.add(selection.mapId);
  }
  assert.deepEqual([...drawn.fighters].sort(), [...playable].sort(), 'every playable fighter can be drawn, and only they');
  assert.deepEqual([...drawn.maps].sort(), MAPS.map((m) => m.id).sort(), 'every stage, and only MAPS');
  // The helper itself: deterministic, and nothing from an empty list.
  assert.equal(pickRandom(['a', 'b', 'c'], () => 0.5), 'b');
  assert.equal(pickRandom(['a', 'b', 'c'], () => 0.99), 'c');
  assert.equal(pickRandom([], () => 0.5), null);
  // Nothing playable: no CPU is drawn, and the Battle refuses it.
  const selection = { characterId: 'test-a' };
  const all = CHARACTERS.splice(0);
  try {
    drawRegularPlay(selection, () => 0.5);
  } finally {
    CHARACTERS.push(...all);
  }
  assert.equal(selection.cpuCharacterId, null);
  assert.deepEqual(quickBattleParams({ ...selection, difficulty: 'easy' }),
    { mapId: selection.mapId, characterId: 'test-a', cpuCharacterId: null, difficulty: 'easy' });
});

test('Regular Play\'s Restart Battle and Rematch keep the drawn CPU and stage; a new setup draws again', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const screen = screens.battle;
  const battle = await startRegular(booted, { fighter: TEST_A, cpu: DEF_9999, mapId: 'city' });
  const keep = (what) => {
    assert.equal(screen.battle, battle, what);
    assert.deepEqual([battle.p1.def.id, battle.p2.def.id, battle.map.id], ['test-a', '9999', 'city'], what);
    assert.deepEqual([app.selection.cpuCharacterId, app.selection.mapId], ['9999', 'city'], what);
  };
  // Math.random would now draw something else: nothing may ask it.
  await withRandom([0.01], async () => {
    screen.pause();
    byText(screen.pauseMenuView, 'Restart Battle').click();
    keep('restart');
    battle.score.p2 = 3;
    screen.finishBattle();
    byText(screen.resultOverlay, 'Rematch').click();
    keep('rematch');
  });
  screen.exit();
  // A new Regular Play setup draws afresh.
  app.screens.go('home', {}, { reset: true });
  const next = await startRegular(booted, { fighter: TEST_A, cpu: TEST_SAMPLE, mapId: 'desert' });
  assert.deepEqual([next.p2.def.id, next.map.id], ['test-sample', 'desert']);
  screens.battle.exit();
});

// ---- Custom Play --------------------------------------------------------------------

test('Custom Play: Mode → Difficulty → Fighter → CPU → Stage → Battle; Back retraces each step with each choice kept', async () => {
  const booted = boot();
  const { app, screens } = booted;
  openQuickBattle(booted);
  await choose(booted, 'custom');
  cardOf(screens.difficulty, 'brutal').click();
  screens.character.confirm(TEST_SAMPLE);
  assert.equal(current(app), 'quick-cpu');
  assert.deepEqual([stepNames(screens.cpu), currentStep(screens.cpu)], [['Mode', 'Difficulty', 'Fighter', 'CPU', 'Stage'], 3]);
  assert.equal(screens.cpu.el.querySelector('.screen-title').textContent, 'Select CPU');
  assert.equal(screens.cpu.el.querySelector('.kicker').textContent, 'Quick Battle');
  screens.cpu.confirm(TEST_A);
  assert.equal(current(app), 'map');
  assert.deepEqual([stepNames(screens.map), currentStep(screens.map)], [['Mode', 'Difficulty', 'Fighter', 'CPU', 'Stage'], 4]);
  mapCard(screens.map, 'city').click();
  assert.deepEqual(app.screens.stack, ['home', 'mode', 'difficulty', 'character', 'quick-cpu']);
  assert.deepEqual([app.selection.characterId, app.selection.cpuCharacterId], ['test-sample', 'test-a'], 'two choices, kept apart');

  screens.map.onBack();
  assert.equal(current(app), 'quick-cpu', 'Stage → CPU');
  assert.equal(document.activeElement, slotOf(screens.cpu, 'test-a'), 'on the CPU chosen');
  app.input.key('Escape');
  assert.equal(current(app), 'character', 'CPU → Fighter');
  assert.equal(document.activeElement, slotOf(screens.character, 'test-sample'), 'on Player 1\'s fighter');
  app.input.pad('back');
  assert.equal(current(app), 'difficulty', 'Fighter → Difficulty');
  screens.difficulty.el.querySelector('.btn-back').click();
  assert.equal(current(app), 'mode', 'Difficulty → Mode');

  // Forward again, then the Battle.
  card(screens).click();
  await choose(booted, 'custom');
  cardOf(screens.difficulty, 'brutal').click();
  screens.character.confirm(TEST_SAMPLE);
  screens.cpu.confirm(TEST_A);
  assert.equal(document.activeElement, mapCard(screens.map, 'city'));
  const params = [];
  const enter = screens.battle.enter.bind(screens.battle);
  screens.battle.enter = (p) => { params.push(p); return enter(p); };
  screens.map.startBtn.click();
  await settle();
  assert.deepEqual(params, [{ mapId: 'city', characterId: 'test-sample', cpuCharacterId: 'test-a', difficulty: 'brutal' }]);
  screens.battle.exit();
});

test('Select Fighter, Select CPU and Watch Mode share profile stars and the action while keeping Confirm', () => {
  const { app, screens } = boot();
  app.selection.playType = 'custom';
  for (const screen of [screens.character, screens.cpu, screens.watchCpu1, screens.watchCpu2]) {
    app.screens.go(screen.id);
    const { roster } = screen;
    const slot = slotOf(screen, '0001');
    slot.focus();
    assert.equal(roster.status.hidden, true, screen.id);
    assert.equal(slot.getAttribute('aria-label'), '#0001, available', 'the regular accessible name');
    assert.ok(roster.previewPanel.contains(roster.confirmBtn), `${screen.id}: Confirm under the preview`);
    assert.equal(roster.confirmBtn.disabled, false);
    assert.equal(roster.rating.hidden, false);
    assert.equal(roster.stars.textContent, '★★★★★');
    assert.equal(roster.rating.getAttribute('aria-label'), 'Difficulty: 5 out of 5 stars');
    assert.equal(roster.rating.querySelector('.difficulty-rating-label'), null);
    assert.equal(roster.describeBtn.textContent, 'Read play style');
    assert.equal(roster.describeBtn.hidden, false);
    const info = roster.describeBtn.parentNode;
    assert.equal(info.children[1], roster.describeBtn);
    assert.equal(info.children[2], roster.confirmBtn);
    roster.preview(roster.slots[TEST_DISABLED.rosterSlot]);
    assert.equal(roster.status.textContent, 'Locked', screen.id);
  }
  // Confirming still picks the fighter and moves on.
  app.screens.go('character');
  slotOf(screens.character, '0002').click(0);
  assert.equal(app.selection.characterId, '0002');
  assert.equal(current(app), 'quick-cpu');
});

test('Select CPU is the shared roster on its own screen: its own preview id, the same locked slots, no disabled fighter', () => {
  const { app, screens } = boot();
  app.selection.playType = 'custom';
  assert.ok(screens.cpu instanceof CharacterSelectScreen);
  assert.notEqual(screens.cpu.roster, screens.character.roster);
  assert.equal(screens.cpu.roster.name.id, 'quick-cpu-preview-name');
  assert.equal(screens.cpu.roster.previewPanel.getAttribute('aria-labelledby'), 'quick-cpu-preview-name');
  const shape = (roster) => roster.slots.map((s) => [s.tagName, s.className, s.getAttribute('aria-label'), s.hasAttribute('data-nav')]);
  assert.deepEqual(shape(screens.cpu.roster), shape(screens.character.roster));
  const locked = slotOf(screens.cpu, TEST_DISABLED.id) ?? screens.cpu.roster.slots[TEST_DISABLED.rosterSlot];
  assert.equal(locked.hasAttribute('data-nav'), false);
  // A disabled fighter is never confirmed, and nothing moves on.
  app.screens.go('quick-cpu');
  const before = app.selection.cpuCharacterId;
  screens.cpu.confirm(TEST_DISABLED);
  assert.equal(app.selection.cpuCharacterId, before);
  assert.equal(current(app), 'quick-cpu');
  // A stale CPU choice is left alone, the roster landing on the first playable fighter.
  app.selection.cpuCharacterId = 'gone';
  screens.cpu.enter();
  screens.cpu.focusDefault();
  assert.equal(document.activeElement, slotOf(screens.cpu, playableCharacters()[0].id));
  assert.equal(app.selection.cpuCharacterId, 'gone');
  // No element id repeats across the setup screens.
  const ids = [];
  const walk = (n) => { if (n instanceof Element) { if (n.id) ids.push(n.id); n.children.forEach(walk); } };
  for (const s of Object.values(screens)) walk(s.el);
  walk(app.choiceDialog.root);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

test('Custom Play\'s Battle: two different fighters, Player 1 the player with the touch controls and Combat Assist, the CPU at the chosen level', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const screen = screens.battle;
  const battle = await startCustom(booted, { difficulty: 'easy', fighter: TEST_SAMPLE, cpu: TEST_A });
  assert.deepEqual([battle.p1.def.id, battle.p2.def.id], ['test-sample', 'test-a']);
  assert.notEqual(battle.p1.sprites, battle.p2.sprites, 'each its own art');
  assert.deepEqual(app.loads, ['test-sample', 'test-a'], 'both sprite sets load');
  assert.equal(app.loading.labels.at(-1), 'Loading Sample and Test A');
  assert.ok(battle.p1.controller instanceof PlayerController);
  assert.ok(battle.p2.controller instanceof CombatAIController);
  assert.equal(battle.p2.controller.difficulty, 'easy');
  assert.deepEqual([battle.p1.label, battle.p2.label], ['P1', 'CPU']);
  assert.deepEqual([screen.hud.left.name.textContent, screen.hud.right.name.textContent], ['Sample', 'Test A']);
  // Player 1's fighter on the touch controls, never the CPU's.
  assert.equal(screen.touch.buttons.get('extra_attack').getAttribute('aria-label'), 'Palm Strike');
  assert.equal(screen.touch.buttons.get('attack2').getAttribute('aria-label'), 'Attack 2');
  assert.equal(screen.touchRoot.hidden, false);
  assert.equal(app.input.gameplayActive, true);
  assert.deepEqual([battle.p1.combatAssistOn, battle.p2.combatAssistOn], [true, false], 'Combat Assist is Player 1\'s alone');
  screen.exit();

  // The same fighter on both sides: one load, one shared sprite set.
  app.screens.go('home', {}, { reset: true });
  const mirror = await startCustom(booted, { fighter: TEST_A, cpu: TEST_A });
  assert.deepEqual(app.loads, ['test-a']);
  assert.equal(mirror.p1.sprites, mirror.p2.sprites);
  screen.exit();

  // Swapped the other way round: the touch controls follow Player 1 again.
  app.screens.go('home', {}, { reset: true });
  await startCustom(booted, { fighter: TEST_A, cpu: TEST_SAMPLE });
  assert.equal(screen.touch.buttons.get('extra_attack').getAttribute('aria-label'), 'High Kick');
  screen.exit();
});

// ---- Change Stage -------------------------------------------------------------------

test('Change Stage after Regular Play opens Select Stage with both fighters and the level kept; Back from it is Select Fighter', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const battle = await startRegular(booted, { difficulty: 'brutal', fighter: TEST_A, cpu: DEF_9999, mapId: 'city' });
  battle.score.p1 = 3;
  screens.battle.finishBattle();
  byText(screens.battle.resultOverlay, 'Change Stage').click();
  assert.equal(current(app), 'map', 'a stage selector, never Select Fighter');
  assert.equal(screens.battle.battle, null);
  assert.deepEqual(app.screens.stack, ['home', 'mode', 'difficulty', 'character']);
  assert.deepEqual([stepNames(screens.map), currentStep(screens.map)], [['Mode', 'Difficulty', 'Fighter', 'Stage'], 3],
    'Regular Play\'s steps, the stage the one after Fighter');
  assert.equal(document.activeElement, mapCard(screens.map, 'city'), 'on the stage drawn');
  mapCard(screens.map, 'desert').click();
  screens.map.start();
  await settle();
  const again = screens.battle.battle;
  assert.deepEqual([again.p1.def.id, again.p2.def.id, again.map.id, again.difficulty], ['test-a', '9999', 'desert', 'brutal']);
  screens.battle.exit();
  // Back from that Select Stage: Select Fighter, whose confirm draws anew.
  app.screens.back();
  assert.equal(current(app), 'map');
  app.screens.back();
  assert.equal(current(app), 'character');
});

test('Change Stage after Custom Play and Watch Mode still goes back to their own Select Stage', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const battle = await startCustom(booted, { fighter: TEST_SAMPLE, cpu: TEST_A, mapId: 'city' });
  battle.score.p2 = 3;
  screens.battle.finishBattle();
  byText(screens.battle.resultOverlay, 'Change Stage').click();
  assert.equal(current(app), 'map');
  assert.deepEqual(app.screens.stack, ['home', 'mode', 'difficulty', 'character', 'quick-cpu']);
  assert.deepEqual([stepNames(screens.map), currentStep(screens.map)], [['Mode', 'Difficulty', 'Fighter', 'CPU', 'Stage'], 4]);
  screens.map.start();
  await settle();
  assert.deepEqual([screens.battle.battle.p1.def.id, screens.battle.battle.p2.def.id], ['test-sample', 'test-a']);
  screens.battle.exit();

  app.screens.go('home', {}, { reset: true });
  screens.home.actions.watch.click();
  cardOf(screens.watchDifficulty, 'hard').click();
  screens.watchCpu1.confirm(DEF_9999);
  screens.watchCpu2.confirm(TEST_A);
  mapCard(screens.watchMap, 'city').click();
  screens.watchMap.start();
  await settle();
  screens.battle.battle.score.p1 = 3;
  screens.battle.finishBattle();
  byText(screens.battle.resultOverlay, 'Change Stage').click();
  assert.equal(current(app), 'watch-map');
  assert.deepEqual(app.screens.stack, ['home', 'watch-difficulty', 'watch-cpu1', 'watch-cpu2']);
});

test('Quick Battle choices never touch Watch Mode\'s', async () => {
  const booted = boot();
  const { app } = booted;
  const watch = { ...app.selection.watch };
  await startCustom(booted, { fighter: TEST_SAMPLE, cpu: DEF_9999, difficulty: 'brutal' });
  booted.screens.battle.exit();
  app.screens.go('home', {}, { reset: true });
  await startRegular(booted, { cpu: TEST_SAMPLE });
  booted.screens.battle.exit();
  assert.deepEqual(app.selection.watch, watch);
});

test('every setup roster describes the preview in both languages without selecting or advancing, then restores focus', () => {
  const { app, screens } = boot();
  app.infoDialog = new InfoDialog(new Element('div'), app);
  for (const screen of [screens.character, screens.cpu, screens.watchCpu1, screens.watchCpu2]) {
    app.screens.go(screen.id);
    const { roster } = screen;
    const selection = JSON.stringify(app.selection);
    const selected = roster.selectedId;
    for (const language of ['en', 'fr']) {
      setLanguage(language);
      try {
        for (const [id, stars] of [['0002', '★★★☆☆'], ['0001', '★★★★★']]) {
          slotOf(screen, id).focus();
          localizeTree(screen.el);
          assert.equal(roster.stars.textContent, stars);
          assert.equal(roster.describeBtn.textContent, language === 'en' ? 'Read play style' : 'Lire le style de jeu');
          assert.equal(roster.describeBtn.getAttribute('aria-describedby'), roster.name.id);
          assert.match(roster.rating.getAttribute('aria-label'), language === 'en' ? /^Difficulty:/ : /^Difficulté :/);
          const scope = app.nav.scopeEl;
          roster.describeBtn.focus();
          app.nav.command('confirm', null);
          const dialog = app.infoDialog;
          assert.equal(dialog.isOpen, true);
          assert.equal(dialog.title.textContent, `#${id}`);
          assert.equal(dialog.body.textContent, t(`discover.fighter.${id}.playStyle`));
          assert.equal(screen.el.inert, true);
          assert.equal(document.activeElement, dialog.closeButton);
          if (id === '0002') app.nav.command('back', null);
          else dialog.closeButton.click();
          assert.equal(dialog.isOpen, false);
          assert.equal(screen.el.inert, false);
          assert.equal(app.nav.scopeEl, scope);
          assert.equal(document.activeElement, roster.describeBtn);
          assert.equal(roster.selectedId, selected);
          assert.equal(JSON.stringify(app.selection), selection);
          assert.equal(app.screens.current, screen);
        }
      } finally { setLanguage('en'); localizeTree(screen.el); }
    }
    // Clear previously displayed data for unrated, disabled and empty slots.
    for (const slot of [slotOf(screen, TEST_A.id), roster.slots[TEST_DISABLED.rosterSlot], roster.slots[20]]) {
      roster.preview(slot);
      assert.equal(roster.rating.hidden, true);
      assert.equal(roster.describeBtn.hidden, true);
      assert.equal(roster.stars.textContent, '');
      assert.equal(roster.describedFighter, null);
      roster.describe();
      assert.equal(app.infoDialog.isOpen, false);
    }
  }
});
