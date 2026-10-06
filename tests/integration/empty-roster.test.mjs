// Run with node --test tests/integration/empty-roster.test.mjs (no dependencies).
// The roster as it ships: #0001 and #0002, both whole and playable. The
// fighter that held slot 03 is gone (definition, art, tests, translations,
// credits), and so is the one that held slot 02 before the new #0002 took
// its place. And the empty roster, which the game still handles for the day
// no fighter is playable: with every shipped fighter disabled for the
// length of a test (`withoutFighters`), every route that would start a
// match refuses rather than falling back to a disabled or missing fighter:
// startup, the roster, Select Fighter and Watch Mode's CPU screens,
// Practice Ground and Home (the Battle screen's own refusals are in
// battle-screen.test.mjs). Nothing here registers a test fighter except to
// show that one becoming playable reopens Home. On a minimal fake DOM;
// layout and paint still need real-browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { def as HARNESS_DEF, makeFighter } from '../helpers/fighter-harness.mjs';
import { TEST_A, REMOVED_IDS as REMOVED, withTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { stylesheet } from '../helpers/stylesheet.mjs';

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
  // Custom properties (the HUD's cooldown rings) land as plain keys.
  style = { setProperty(name, value) { this[name] = value; } };
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
  removeAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = false;
    else this.attrs.delete(name);
  }
  get id() { return this.getAttribute('id'); }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  get innerHTML() { return this.html; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.html = ''; this.append(...nodes); }
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

const { CONFIG } = await import('../../js/config.js');
const charactersModule = await import('../../js/data/characters.js');
const { CHARACTERS, getCharacter, getPlayableCharacter, isPlayable, playableCharacters, characterFramePaths } = charactersModule;
const { STRINGS, setLanguage, localizeTree } = await import('../../js/localization/i18n.js');
const { ICONS } = await import('../../js/ui/icons.js');
const { CREDITS, creditsText } = await import('../../js/ui/credits.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { Settings } = await import('../../js/core/settings.js');
const { App, initialSelection } = await import('../../js/core/app.js');
const { FighterRoster } = await import('../../js/ui/fighter-roster.js');
const { HomeScreen, MATCH_ACTIONS } = await import('../../js/screens/home-screen.js');
const { CharacterSelectScreen } = await import('../../js/screens/character-select-screen.js');
const { WatchFighterScreen } = await import('../../js/screens/watch-screens.js');
const { PracticeGroundScreen, practiceDefaultFighter } = await import('../../js/screens/practice-screen.js');

const ROOT = new URL('../../', import.meta.url);
const exists = (path) => existsSync(new URL(path, ROOT));
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const SHIPPED = [DEF_0001, DEF_0002];

// Runs `fn` (sync or async) with every shipped fighter disabled, so nothing
// is playable, and enables them again afterwards whatever happens.
function withoutFighters(fn) {
  return async (...args) => {
    for (const def of SHIPPED) def.available = false;
    try {
      return await fn(...args);
    } finally {
      for (const def of SHIPPED) def.available = true;
    }
  };
}

// The app as the screens see it: loads and sprite reads are recorded (none
// may happen), and so is every navigation and loading overlay call.
function fakeApp() {
  const loads = [];
  const reads = [];
  const app = {
    selection: {
      mode: 'quick-battle', difficulty: 'medium', characterId: null, mapId: 'desert',
      watch: { difficulty: 'medium', cpu1CharacterId: null, cpu2CharacterId: null, mapId: 'desert' },
    },
    input: {
      gameplayActive: false, lastDevice: 'keyboard',
      onKey: () => noop, onPadMenu: noop, setGameplayActive(on) { this.gameplayActive = on; }, setTouch: noop, flush: noop,
    },
    settings: new Settings(null),
    device: { blockedPortrait: false, reducedMotion: true, noteKeyboard: noop },
    screens: { current: null, calls: [], go(...args) { this.calls.push(args); }, back: noop },
    loading: {
      labels: [], errors: [],
      show(label) { this.labels.push(label); }, hide: noop, setProgress: noop,
      showError(message, opts) { this.errors.push({ message, opts }); },
    },
    audio: { play: noop },
    dialog: { resolve: null },
    settingsDialog: { opened: 0, open() { this.opened++; } },
    loadCharacter(id) { loads.push(id); return Promise.resolve(null); },
    getSprites(id) { reads.push(id); return null; },
    resetCharacter: noop,
  };
  app.nav = new MenuNavigator(app);
  return { app, loads, reads };
}

// ---- The data -------------------------------------------------------------------

test('the roster ships #0001 and #0002, both whole and playable', () => {
  assert.deepEqual(CHARACTERS.map((c) => c.id), ['0001', '0002']);
  assert.equal(DEF_0001.id, '0001');
  assert.equal(DEF_0001.displayName, '#0001');
  assert.equal(DEF_0001.rosterSlot, 0, 'slot 01');
  assert.equal(DEF_0001.available, true);
  assert.equal(isPlayable(DEF_0001), true);
  assert.equal(getPlayableCharacter('0001'), DEF_0001);
  assert.equal(DEF_0002.displayName, '#0002');
  assert.equal(DEF_0002.rosterSlot, 1, 'slot 02');
  assert.equal(isPlayable(DEF_0002), true);
  assert.equal(getPlayableCharacter('0002'), DEF_0002);
  assert.deepEqual(playableCharacters(), [DEF_0001, DEF_0002]);
  // Whole: five numbered attacks (three ordinary, with their mid-air
  // versions, and two techniques) and the High Kick.
  assert.deepEqual(Object.keys(DEF_0001.attacks).sort(),
    ['attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3']);
  assert.deepEqual(DEF_0001.actions.attack4, { type: 'technique', id: 'attack4' });
  assert.deepEqual(DEF_0001.actions.attack5, { type: 'technique', id: 'attack5' });
  assert.ok(DEF_0001.techniques.attack4.burst && DEF_0001.techniques.attack5.projectile, 'Unlimited Void and Hollow Purple');
  assert.deepEqual(Object.keys(DEF_0001.projectiles).sort(), ['attack2_object', 'attack3_object', 'attack5_object']);
  assert.equal(DEF_0001.defense.type, 'shield');
  assert.ok(DEF_0001.animations.mouvment && DEF_0001.animations.midair_mouvment, 'its Dash and air dash (their art: the movement itself is universal)');
  assert.equal(DEF_0001.movement, undefined, 'no movement of its own');
  assert.deepEqual(DEF_0001.abilityNames, {
    extra_attack: 'High Kick', attack1: 'Jab', midair_attack1: 'Floating Straight', attack2: 'Red', midair_attack2: 'Red Kick',
    attack3: 'Maximum Blue', midair_attack3: 'Blue', attack4: 'Unlimited Void', attack5: 'Hollow Purple',
  });
  // Its attack buttons: a name and artwork for each; Jump is universal.
  assert.deepEqual(Object.keys(DEF_0001.mobileAbilities), ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  for (const own of Object.values(DEF_0001.mobileAbilities)) {
    assert.ok(DEF_0001[own.preview.collection ?? 'animations'][own.preview.animation].frames[own.preview.frame]);
  }
  assert.ok(DEF_0001.hurtboxes.length > 0 && DEF_0001.collider && DEF_0001.energy && DEF_0001.launchReaction);
  // Every frame it names is on disk.
  const paths = characterFramePaths(DEF_0001);
  assert.ok(paths.length >= 70);
  for (const path of paths) assert.ok(exists(path.replace('./', '')), path);
  // Its French ability names and its sprite credits.
  assert.equal(STRINGS.fr['ability.0001.attack1'], 'Direct');
  assert.equal(STRINGS.fr['ability.0001.attack4'], 'Vide infini');
  assert.equal(STRINGS.fr['ability.0001.attack5'], 'Violet creux');
  assert.equal(STRINGS.en['credits.sprites0001.title'], '#0001 sprite source');
});

test('#0001 is every default: Quick Battle, both Watch Mode CPUs and Practice Ground; both fighters are preloaded', async () => {
  const selection = initialSelection();
  assert.equal(selection.characterId, '0001');
  assert.equal(selection.watch.cpu1CharacterId, '0001');
  assert.equal(selection.watch.cpu2CharacterId, '0001');
  assert.equal(practiceDefaultFighter(), DEF_0001);
  const asked = [];
  App.prototype.preloadFighters.call({ loadCharacter: (id) => asked.push(id) });
  assert.deepEqual(asked, ['0001', '0002']);
  // Home opens every match action, with no note.
  const { app } = fakeApp();
  const home = new HomeScreen(app);
  home.enter();
  for (const id of MATCH_ACTIONS) assert.equal(home.actions[id].disabled, false, id);
  assert.equal(home.el.querySelector('.home-note').hidden, true);
  // The roster offers slots 01 and 02 and selects the first.
  const roster = new FighterRoster(app, { host: new Element('section'), onConfirm: noop });
  assert.equal(roster.slots[0]._def, DEF_0001);
  assert.equal(roster.slots[1]._def, DEF_0002);
  for (const slot of roster.slots.slice(0, 2)) {
    assert.ok(!slot.classList.contains('is-locked'), 'open');
    assert.equal(slot.hasAttribute('data-nav'), true);
  }
  assert.ok(roster.slots.slice(2).every((slot) => slot.classList.contains('is-locked')), 'the rest are locked');
  roster.show('0001');
  assert.equal(roster.selectedId, '0001');
  assert.equal(roster.confirmBtn.disabled, false);
});

test('the engine and its tests build #0001 from its definition, disabled or not', withoutFighters(() => {
  assert.equal(HARNESS_DEF, DEF_0001, 'the combat tests\' fighter is the real #0001, even disabled');
  const { fighter } = makeFighter();
  assert.equal(fighter.def, DEF_0001);
  assert.equal(fighter.combat.launchPoint, 0);
}));

test('the removed fighters are gone: no definition, art, tests, helpers, or icon', () => {
  // Slot 02's first fighter left none of its files behind: the new #0002's
  // folder holds only codename files, none under the old one's names.
  for (const name of ['0002_fall.png', '0002_hurt.png', '0002_jump.png', '0002_land.png', '0002_midairhurt.png']) {
    assert.equal(exists(`assets/characters/0002/${name}`), false, name);
  }
  const testFiles = readdirSync(new URL('tests/', ROOT), { recursive: true }).map((f) => f.split('/').pop());
  for (const id of REMOVED) {
    assert.equal(getCharacter(id), null, id);
    assert.equal(getPlayableCharacter(id), null, id);
    assert.ok(!CHARACTERS.some((c) => c.id === id || c.displayName === `#${id}`), id);
    assert.equal(exists(`assets/characters/${id}/`), false, `assets/characters/${id}/`);
    assert.equal(exists(`js/data/characters/${id}.js`), false, `js/data/characters/${id}.js`);
    assert.equal(exists(`tests/fighters/${id}/`), false, `tests/fighters/${id}/`);
    assert.ok(!testFiles.includes(`fighter-${id}.test.mjs`), `fighter-${id}.test.mjs`);
  }
  assert.ok(!testFiles.includes('real-art.mjs'), 'their art helpers, with nothing left to use them');
  // Their scaffolding, not kept for later.
  for (const name of ['TEMPORARY_BASELINE', 'WORLD_PER_ART_0001']) assert.equal(name in charactersModule, false, name);
  const scaffolding = new RegExp(`${REMOVED.map((id) => `BASE_${id}|FPS_${id}`).join('|')}|IDLE_ART_|TEMPORARY_BASELINE|WORLD_PER_ART|const numbered`);
  const definitions = ['js/data/characters.js', ...readdirSync(new URL('js/data/characters/', ROOT)).map((f) => `js/data/characters/${f}`)];
  for (const file of definitions) assert.doesNotMatch(read(file), scaffolding, file);
  assert.equal('palm' in ICONS, false, 'the palm glyph only they used');
});

test('no translation or credit is left for the removed fighters, in either language', () => {
  for (const language of ['en', 'fr']) {
    const keys = Object.keys(STRINGS[language]);
    for (const id of REMOVED) {
      assert.deepEqual(keys.filter((k) => k.includes(id)), [], `${language}: ${id}`);
    }
    const text = Object.values(STRINGS[language]).filter((v) => typeof v === 'string').join('\n');
    for (const id of REMOVED) assert.ok(!text.includes(`#${id}`), `${language}: #${id}`);
    assert.doesNotMatch(text, /Palm Strike|Frappe de paume|Dazz & Fret/, language);
    setLanguage(language);
    try {
      const credits = creditsText();
      assert.ok(!credits.some((g) => REMOVED.some((id) => g.title.includes(id))), `${language}: no sprite credit group for them`);
      assert.equal(credits.filter((g) => /#0001/.test(g.title)).length, 1, `${language}: #0001's stays`);
    } finally {
      setLanguage('en');
    }
  }
  assert.ok(!CREDITS.some((g) => REMOVED.some((id) => g.title.includes(id))));
});

// ---- Startup -----------------------------------------------------------------------

test('with nothing playable, startup names no fighter for Quick Battle or Watch Mode, and preloads none', withoutFighters(async () => {
  const selection = initialSelection();
  assert.equal(selection.characterId, null);
  assert.equal(selection.watch.cpu1CharacterId, null);
  assert.equal(selection.watch.cpu2CharacterId, null);
  assert.equal(selection.mapId, 'desert', 'the rest of the setup is as ever');
  // Preloading asks for no fighter at all.
  const asked = [];
  App.prototype.preloadFighters.call({ loadCharacter: (id) => asked.push(id) });
  assert.deepEqual(asked, []);
  assert.match(App.prototype.start.toString(), /this\.preloadFighters\(\)/);
  assert.match(read('js/core/app.js'), /this\.selection = initialSelection\(\);/);
  // And a fighter that cannot be played is never loaded, however it is asked for.
  const loaded = [];
  const app = {
    spriteSets: new Map(), spritePromises: new Map(),
    assets: { loadAll: (urls) => { loaded.push(...urls); return Promise.resolve({ failed: [] }); } },
  };
  for (const id of ['0001', '0002', ...REMOVED, null, undefined, 'no-such-fighter']) {
    assert.equal(await App.prototype.loadCharacter.call(app, id), null, String(id));
  }
  assert.deepEqual(loaded, [], 'no frame requested');
  assert.equal(app.spriteSets.size + app.spritePromises.size, 0);
}));

// ---- The roster ----------------------------------------------------------------------

test('with nothing playable, the roster renders every slot locked, disabled #0001\'s and #0002\'s included, selects nothing and never loads a preview', withoutFighters(() => {
  const { app, loads, reads } = fakeApp();
  const host = new Element('section');
  const confirmed = [];
  const roster = new FighterRoster(app, { host, onConfirm: (def) => confirmed.push(def) });
  const { slots } = roster;
  assert.equal(slots.length, CONFIG.roster.totalSlots);
  for (const slot of slots) {
    assert.equal(slot.tagName, 'DIV');
    assert.ok(slot.classList.contains('is-locked'));
    assert.equal(slot.hasAttribute('data-nav'), false, 'never focused, hovered into or tabbed to');
  }
  assert.equal(slots[0]._def, DEF_0001, 'slot 01 still holds #0001');
  assert.equal(slots[1]._def, DEF_0002, 'slot 02 still holds #0002');
  assert.equal(slots[0].getAttribute('aria-label'), 'Slot 01, locked');
  assert.equal(slots[0].querySelector('.slot-name'), null, 'nothing names it');

  for (const id of ['0001', '0002', ...REMOVED, null, 'no-such-fighter']) {
    assert.equal(roster.show(id), null, `${id}: no slot to focus`);
    assert.equal(roster.selectedId, null, `${id}: nothing selected`);
    assert.ok(!slots.some((s) => s.classList.contains('is-selected')));
    assert.equal(roster.confirmBtn.disabled, true, 'Confirm stays disabled');
    assert.equal(roster.confirmBtn.textContent, 'No fighters available');
    assert.equal(roster.focusSelected(), false, 'the host focuses its own control instead');
  }
  // The preview is the locked first slot's: no fighter's art.
  assert.equal(roster.status.textContent, 'Locked');
  assert.equal(roster.name.textContent, 'Slot 01');
  assert.ok(host.classList.contains('is-locked-preview'));
  assert.equal(roster.previewSprites, null);
  assert.deepEqual(loads, [], 'no portrait or preview loaded');
  assert.deepEqual(reads, []);
  // Nothing promotes the locked #0001 slot into a selection or a confirm.
  roster.select(slots[0]);
  roster.activate(slots[0], { detail: 0 });
  roster.confirm();
  roster.confirmBtn.click();
  assert.equal(roster.selectedId, null);
  assert.deepEqual(confirmed, []);
  // Keyboard, gamepad and pointer find nothing to move to in the grid.
  assert.deepEqual(app.nav.candidates(roster.rosterPanel), []);
  assert.deepEqual(app.nav.candidates(roster.previewPanel), [], 'the disabled Confirm neither');
}));

test('Select Fighter and Watch Mode\'s CPU screens open on the locked roster: focus on Back, nothing to confirm', withoutFighters(() => {
  for (const make of [(app) => new CharacterSelectScreen(app), (app) => new WatchFighterScreen(app, 1), (app) => new WatchFighterScreen(app, 2)]) {
    const { app, loads } = fakeApp();
    // A stale pick of disabled #0001 changes nothing.
    app.selection.characterId = '0001';
    app.selection.watch.cpu1CharacterId = '0001';
    app.selection.watch.cpu2CharacterId = REMOVED[0];
    const screen = make(app);
    screen.enter();
    assert.equal(screen.defaultSlot, null);
    screen.focusDefault();
    assert.equal(document.activeElement, screen.el.querySelector('.btn-back'), `${screen.id}: focus on Back`);
    assert.equal(screen.roster.selectedId, null);
    screen.confirm(DEF_0001);
    assert.deepEqual(app.screens.calls, [], `${screen.id}: no step forward`);
    assert.equal(screen.chosenId, screen.key === 'characterId' ? '0001' : app.selection.watch[screen.key], 'the stale pick is left alone, never used');
    assert.deepEqual(loads, []);
  }
}));

// ---- Practice Ground -------------------------------------------------------------------

test('Practice Ground never starts disabled #0001: no default fighter, no load, the unavailable error and Back Home', withoutFighters(async () => {
  assert.equal(practiceDefaultFighter(), null);
  assert.doesNotMatch(read('js/screens/practice-screen.js'), /'0001'|PRACTICE_DEFAULT_FIGHTER/);
  const { app, loads } = fakeApp();
  const screen = new PracticeGroundScreen(app);
  app.screens.current = screen;
  await screen.enter();
  assert.equal(screen.session, null);
  assert.equal(screen.characterId, null);
  assert.deepEqual(loads, []);
  assert.deepEqual(app.loading.labels, [], 'not even a loading label');
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.equal(app.loading.errors.length, 1);
  const [{ message, opts }] = app.loading.errors;
  assert.equal(message, 'This session cannot start: a fighter it needs is not available.');
  assert.equal(opts.title, 'common.fighterUnavailable');
  assert.equal(opts.onRetry, undefined);
  opts.onBack();
  assert.deepEqual(app.screens.calls, [['home', {}, { reset: true }]]);
  // Nothing opens over it, and a swap to #0001 (or a removed id) is refused.
  screen.openMenu();
  assert.equal(screen.menuOpen, false);
  for (const def of [DEF_0001, null, ...REMOVED.map((id) => ({ id }))]) {
    await screen.changeFighter(def);
    await screen.selectCpu(def);
  }
  assert.deepEqual(loads, []);
  screen.exit();
}));

// ---- Home ------------------------------------------------------------------------------

test('with nothing playable, Home closes Play, Watch Mode and Practice Ground and says why; Discover, Settings and the credits stay open', withoutFighters(() => {
  const { app } = fakeApp();
  const home = new HomeScreen(app);
  app.screens.current = home;
  home.enter();
  const note = home.el.querySelector('.home-note');
  assert.deepEqual(MATCH_ACTIONS, ['play', 'watch', 'practice']);
  for (const id of MATCH_ACTIONS) {
    const button = home.actions[id];
    assert.equal(button.disabled, true, id);
    assert.equal(button.getAttribute('aria-describedby'), 'home-no-fighters', `${id}: described by the note`);
  }
  assert.equal(note.getAttribute('id'), 'home-no-fighters');
  assert.equal(note.hidden, false);
  assert.equal(note.getAttribute('role'), 'status');
  assert.equal(note.textContent, 'No fighters available');
  assert.equal(note.getAttribute('data-i18n'), 'common.noFighters');
  assert.ok(home.el.querySelector('.home-intro').classList.contains('has-note'), 'room made for it');
  assert.equal(home.actions.discover.disabled, false);
  assert.equal(home.actions.discover.hasAttribute('aria-describedby'), false);
  // Keyboard and gamepad skip the closed actions: Discover leads.
  assert.deepEqual(app.nav.candidates(home.el), [home.actions.discover, home.settingsButton]);
  home.focusDefault();
  assert.equal(document.activeElement, home.actions.discover);
  // A press on a closed action goes nowhere, even one that gets past its
  // disabled state; Discover and Settings work as ever.
  for (const id of MATCH_ACTIONS) {
    home.actions[id].click();
    home.actions[id].disabled = false;
    home.actions[id].click();
  }
  assert.deepEqual(app.screens.calls, []);
  home.actions.discover.click();
  assert.deepEqual(app.screens.calls, [['discover']]);
  home.settingsButton.click();
  assert.equal(app.settingsDialog.opened, 1);
  assert.equal(home.el.querySelectorAll('.home-credits-seq').length, 2, 'the credits still roll');
  // The note follows the language.
  setLanguage('fr');
  try {
    localizeTree(home.el);
    assert.equal(note.textContent, 'Aucun combattant disponible');
  } finally {
    setLanguage('en');
  }
  assert.match(stylesheet(), /\.home-action:disabled \{/);
  assert.match(stylesheet(), /\.home-note\[hidden\] \{ display: none; \}/);
}));

test('with nothing playable, a fighter becoming playable reopens Home\'s match actions, and losing it closes them again: no hack to undo', withoutFighters(async () => {
  const { app } = fakeApp();
  const home = new HomeScreen(app);
  await withTestFighters([TEST_A], () => {
    home.enter();
    for (const id of MATCH_ACTIONS) {
      assert.equal(home.actions[id].disabled, false, id);
      assert.equal(home.actions[id].hasAttribute('aria-describedby'), false, id);
    }
    assert.equal(home.el.querySelector('.home-note').hidden, true);
    assert.deepEqual(initialSelection().characterId, TEST_A.id, 'the first playable fighter');
    assert.equal(practiceDefaultFighter(), TEST_A);
    home.focusDefault();
    assert.equal(document.activeElement, home.actions.play, 'Play is the default again');
    home.actions.play.click();
    assert.deepEqual(app.screens.calls, [['mode']]);
  });
  home.enter();
  assert.ok(MATCH_ACTIONS.every((id) => home.actions[id].disabled));
  assert.equal(home.el.querySelector('.home-note').hidden, false);
  assert.deepEqual(CHARACTERS.map((c) => c.id), ['0001', '0002'], 'the test fighter is gone again');
}));
