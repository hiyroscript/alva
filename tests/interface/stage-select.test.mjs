// Run with node --test tests/interface/stage-select.test.mjs (no dependencies).
// Select Stage's 24-slot roster and Random Stage, on a minimal fake DOM:
// the slots (the playable stages first, reserved placeholders after them,
// growing with the registry), selection and confirmation, Quick Battle's
// and Watch Mode's separate choices, Random Stage (playable stages only,
// every one equally likely, never starting the battle), the details panel
// and the live preview with its own hazards. Layout and paint still need
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';

class Node {
  parentNode = null;
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
const BOOLEAN_ATTRS = ['hidden', 'disabled', 'inert'];
// A 2D context that accepts any drawing.
const context = () => new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = { setProperty() {} };
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  width = 0;
  height = 0;
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    const names = new Set();
    this.classList = {
      add: (...n) => n.forEach((c) => names.add(c)),
      remove: (...n) => n.forEach((c) => names.delete(c)),
      contains: (c) => names.has(c),
      toggle: (c, on = !names.has(c)) => { on ? names.add(c) : names.delete(c); return on; },
    };
    this.classNames = names;
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
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.html = ''; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  // A pointer press (detail 1) or a keyboard / controller one (detail 0).
  click(detail = 1) {
    if (this.disabled) return;
    for (const fn of this.listeners.get('click') || []) fn({ target: this, detail, preventDefault() {} });
  }
  focus() {
    document.activeElement = this;
    for (const fn of this.listeners.get('focus') || []) fn({ target: this });
  }
  matches(selector) {
    return selector.split(',').map((s) => s.trim()).some((s) => {
      if (s.startsWith('.')) return this.classNames.has(s.slice(1));
      const attr = s.match(/^\[([\w-]+)\]$/);
      if (attr) return this.hasAttribute(attr[1]);
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n instanceof Element && n.matches(selector)) return n;
    return null;
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
  getBoundingClientRect() { return { left: 0, top: 0, width: 160, height: 100 }; }
  getContext() { return (this.ctx ??= context()); }
  scrollIntoView() { this.scrolledIntoView = (this.scrolledIntoView ?? 0) + 1; }
}

globalThis.Node = Node;
globalThis.window = { devicePixelRatio: 1 };
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const frames = [];
globalThis.requestAnimationFrame = (fn) => frames.push(fn);
const flushFrames = () => {
  while (frames.length) frames.shift()();
};
const screens = new Map();
globalThis.document = {
  activeElement: null,
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: (sel) => {
    const id = sel.match(/data-screen="([\w-]+)"/)?.[1];
    if (!screens.has(id)) screens.set(id, new Element('section'));
    return screens.get(id);
  },
  addEventListener() {},
  removeEventListener() {},
};

const { MAPS, getMap, stageSlots } = await import('../../js/data/maps.js');
const { PRACTICE_MAP } = await import('../../js/data/practice-map.js');
const { CONFIG } = await import('../../js/config.js');
const { MapSelectScreen } = await import('../../js/screens/map-select-screen.js');
const { WatchMapScreen } = await import('../../js/screens/watch-screens.js');
const { randomStage, drawRegularPlay, pickRandom } = await import('../../js/screens/quick-battle-setup.js');
const { setLanguage, t } = await import('../../js/localization/i18n.js');

function makeApp({ reducedMotion = false } = {}) {
  const went = [];
  const app = {
    device: { reducedMotion },
    selection: {
      playType: 'custom', characterId: '0001', cpuCharacterId: '0002', difficulty: 'medium', mapId: 'desert',
      watch: { difficulty: 'hard', cpu1CharacterId: '0001', cpu2CharacterId: '0003', mapId: 'desert' },
    },
    screens: { go: (...args) => went.push(args), back() {}, stack: [] },
  };
  return { app, went };
}

// A screen for a fresh app, entered, with its preview frames run.
function setup(opts = {}, { Screen = MapSelectScreen, random } = {}) {
  screens.clear();
  const { app, went } = makeApp(opts);
  const screen = Screen === MapSelectScreen ? new MapSelectScreen(app, { random }) : new Screen(app);
  if (random) screen.random = random;
  screen.enter();
  flushFrames();
  return { app, went, screen };
}

const label = (el) => el.getAttribute('aria-label');

// ---- The roster --------------------------------------------------------------

test('the roster has exactly 24 slots: Desert, City and Asperitas first, then 21 reserved placeholders', () => {
  assert.equal(CONFIG.stageRoster.totalSlots, 24);
  const { screen } = setup();
  assert.equal(screen.slots.length, 24);
  assert.deepEqual(screen.slots.map((s) => s.querySelector('.stage-tile-num').textContent), Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0')));
  assert.deepEqual(screen.tiles.map((t) => t._map.id), ['desert', 'city', 'asperitas']);
  assert.deepEqual(screen.slots.slice(0, 3).map((t) => t._map?.id), ['desert', 'city', 'asperitas'], 'slots 01, 02 and 03');
  const locked = screen.slots.slice(3);
  assert.equal(locked.length, 21);
  for (const tile of locked) {
    assert.equal(tile._map, null);
    assert.ok(tile.classList.contains('is-locked'));
    assert.equal(tile.tagName, 'DIV', 'not a button');
    assert.equal(tile.hasAttribute('data-nav'), false, 'never focused, hovered into or navigated to');
    assert.equal(tile.getAttribute('role'), 'img');
    assert.equal(tile.listeners.size, 0, 'nothing to press');
    assert.ok(tile.querySelector('.stage-tile-lock'), 'a lock');
  }
  assert.equal(label(locked[0]), 'Slot 04, unavailable');
  for (const tile of screen.tiles) {
    assert.equal(tile.tagName, 'BUTTON');
    assert.ok(tile.hasAttribute('data-nav'));
    assert.ok(tile.querySelector('.stage-tile-thumb'), 'a thumbnail');
    assert.ok(tile.querySelector('.stage-tile-name').textContent.length > 0);
  }
  assert.equal(label(screen.tiles[2]), 'Asperitas. Above the clouds, beyond the horizon');
  // Every slot is a list item of the one roster grid.
  assert.equal(screen.grid.children.length, 24);
  assert.equal(screen.grid.getAttribute('role'), 'list');
  // Random Stage is apart from the 24 slots.
  assert.ok(!screen.slots.includes(screen.randomBtn));
  assert.ok(!screen.grid.querySelectorAll('[data-nav]').includes(screen.randomBtn));
});

test('the counter reads the real registry: 3 available / 24 slots, in English and French', () => {
  const { screen } = setup();
  assert.equal(screen.countEl.textContent, '3 available / 24 slots');
  setLanguage('fr');
  try {
    screen.localize();
    assert.equal(screen.countEl.textContent, '3 disponibles / 24 emplacements');
    assert.equal(screen.infoName.textContent, 'Désert');
    assert.equal(t('map.random'), 'Arène aléatoire');
    assert.equal(t('map.locked', { num: '04' }), 'Emplacement 04, indisponible');
    assert.equal(t('map.asperitas.trait.hazards'), '2 nuages instables');
  } finally {
    setLanguage('en');
  }
  screen.localize();
  // The button's label follows the language like every marked label.
  assert.equal(screen.randomBtn.getAttribute('data-i18n-span'), 'map.random');
  assert.ok(screen.randomBtn.html.includes('Random Stage'));
});

test('a new stage in the registry fills the next slot by itself; the roster grows only past 24', () => {
  const slots = stageSlots();
  assert.equal(slots.length, 24);
  assert.equal(slots.filter((s) => s.map).length, MAPS.length);
  const future = (n) => Array.from({ length: n }, (_, i) => ({ id: `future-${i}` }));
  const four = stageSlots([...MAPS, ...future(1)]);
  assert.equal(four.length, 24);
  assert.equal(four[3].map.id, 'future-0');
  assert.equal(four.filter((s) => !s.map).length, 20);
  const many = stageSlots(future(30));
  assert.equal(many.length, 30, 'never fewer slots than stages');
  assert.ok(many.every((s) => s.map));
  // And the screen builds from the registry: one more stage, one more tile.
  MAPS.push({ ...getMap('desert'), id: 'future-stage', name: 'Future', tagline: 'Soon' });
  try {
    const { screen } = setup();
    assert.equal(screen.tiles.length, 4);
    assert.equal(screen.slots[3]._map.id, 'future-stage');
    assert.equal(screen.slots.length, 24);
    assert.equal(screen.countEl.textContent, '4 available / 24 slots');
  } finally {
    MAPS.pop();
  }
  assert.ok(!MAPS.some((m) => m.id === 'future-stage'));
});

// ---- Selecting and confirming ---------------------------------------------------

test('a pointer press selects a stage (and its preview); a second press, or a keyboard / controller press, starts the battle', () => {
  const { app, went, screen } = setup();
  const [desert, city, asperitas] = screen.tiles;
  assert.equal(app.selection.mapId, 'desert');
  assert.equal(desert.getAttribute('aria-pressed'), 'true');
  city.click(1);
  assert.equal(app.selection.mapId, 'city', 'the stored stage id');
  assert.deepEqual(screen.tiles.map((t) => t.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  assert.ok(city.classList.contains('is-selected') && !desert.classList.contains('is-selected'));
  assert.equal(screen.heroMap, getMap('city'));
  assert.equal(went.length, 0, 'not started yet');
  city.click(1);
  assert.deepEqual(went.pop(), ['battle', { mapId: 'city', characterId: '0001', cpuCharacterId: '0002', difficulty: 'medium' }]);
  // Keyboard or controller: select and confirm at once.
  asperitas.click(0);
  assert.equal(app.selection.mapId, 'asperitas');
  assert.deepEqual(went.pop(), ['battle', { mapId: 'asperitas', characterId: '0001', cpuCharacterId: '0002', difficulty: 'medium' }]);
  // Confirm starts the selected stage normally.
  screen.startBtn.click();
  assert.deepEqual(went.pop()[1].mapId, 'asperitas');
  // A placeholder can never be selected or started.
  screen.activate(screen.slots[10], { detail: 0 });
  assert.equal(went.length, 0);
  assert.equal(app.selection.mapId, 'asperitas');
});

test('highlighting a tile previews it (the live preview and the details); leaving the grid shows the selected stage again', () => {
  const { app, screen } = setup();
  screen.tiles[2].focus();
  flushFrames();
  assert.equal(screen.heroMap, getMap('asperitas'));
  assert.equal(screen.hero.map, getMap('asperitas'), 'the large preview draws it');
  assert.equal(label(screen.heroEl), 'Asperitas stage preview');
  assert.equal(screen.infoName.textContent, 'Asperitas');
  assert.equal(screen.infoTag.textContent, 'Above the clouds, beyond the horizon');
  assert.equal(screen.infoBadge.hidden, true, 'highlighted, not selected');
  assert.equal(app.selection.mapId, 'desert', 'highlighting selects nothing');
  // The details call Asperitas's two upper clouds hazards.
  const traits = screen.traits.children.map((d) => [d.children[0].textContent, d.children[1].textContent, d.classNames.has('is-hazard')]);
  assert.deepEqual(traits, [
    ['Terrain', 'Floating clouds', false],
    ['Platforms', '2 moving cloud platforms', false],
    ['Hazards', '2 shifting cloud hazards', true],
    ['Obstacles', 'None', false],
    ['Light', 'Daylight', false],
  ]);
  screen.startBtn.focus();
  flushFrames();
  assert.equal(screen.heroMap, getMap('desert'));
  assert.equal(screen.infoBadge.hidden, false, 'the selected stage');
  assert.ok(!screen.traits.children.some((d) => d.dataset?.trait === 'hazards' || d.getAttribute('data-trait') === 'hazards'), 'Desert has no hazards');
});

test('the preview runs Asperitas\'s hazards in a world of its own; thumbnails stay still', () => {
  const { screen } = setup();
  screen.tiles[2].focus();
  flushFrames();
  const sim = screen.hero.sim;
  assert.ok(sim, 'its own stage and hazards');
  assert.equal(sim.hazards.controllers.length, 2);
  const c = sim.hazards.controllers[0];
  const start = { x: c.platform.x, y: c.platform.y, history: c.history.length };
  for (let i = 0; i < 60 * 20; i++) screen.hero.render(1 / 60);
  assert.ok(c.history.length > start.history, 'its clouds change state');
  assert.notDeepEqual({ x: c.platform.x, y: c.platform.y }, { x: start.x, y: start.y }, 'and move');
  // The map itself is never written, and thumbnails run nothing.
  assert.equal(getMap('asperitas').platforms[0].x, 1290);
  for (const tile of screen.tiles) assert.equal(tile._preview.sim, null, `${tile._map.id} thumbnail`);
  // Reduced motion: the preview holds the clouds where the map starts them.
  const still = setup({ reducedMotion: true }).screen;
  still.tiles[2].focus();
  flushFrames();
  assert.equal(still.hero.sim, null);
});

test('Quick Battle and Watch Mode keep separate stage choices, and each starts its own battle', () => {
  const quick = setup();
  const watch = setup({}, { Screen: WatchMapScreen });
  // Both screens on one app's selections.
  const app = quick.app;
  watch.screen.selection = () => app.selection.watch;
  quick.screen.tiles[1].click(1);
  watch.screen.tiles[2].click(1);
  assert.equal(app.selection.mapId, 'city');
  assert.equal(app.selection.watch.mapId, 'asperitas');
  watch.screen.select(getMap('asperitas'));
  assert.equal(app.selection.mapId, 'city', 'Watch Mode leaves Quick Battle\'s stage alone');
  quick.screen.pickRandom();
  assert.equal(app.selection.watch.mapId, 'asperitas', 'and the other way round');
  watch.screen.selection = () => watch.app.selection.watch;
  watch.app.selection.watch.mapId = 'asperitas';
  watch.screen.startBtn.click();
  assert.deepEqual(watch.went.pop(), ['battle', { mode: 'watch', mapId: 'asperitas', cpu1CharacterId: '0001', cpu2CharacterId: '0003', difficulty: 'hard' }]);
});

// ---- Random Stage -----------------------------------------------------------------

test('Random Stage picks a playable stage, highlights and previews it, and never starts the battle', () => {
  const values = [0.9, 0.1, 0.5];
  const { app, went, screen } = setup({}, { random: () => values.shift() });
  screen.randomBtn.focus();
  screen.randomBtn.click(1);
  flushFrames();
  assert.equal(app.selection.mapId, 'asperitas');
  assert.ok(screen.tiles[2].classList.contains('is-selected'));
  assert.equal(screen.tiles[2].getAttribute('aria-pressed'), 'true');
  assert.equal(screen.heroMap, getMap('asperitas'));
  assert.equal(screen.hero.map, getMap('asperitas'));
  assert.equal(screen.infoBadge.hidden, false);
  assert.ok(screen.tiles[2].scrolledIntoView > 0, 'brought into view');
  assert.equal(document.activeElement, screen.randomBtn, 'still on Random Stage, to roll again');
  assert.equal(went.length, 0, 'never starts the battle');
  // A keyboard or controller press is the same: still no battle.
  screen.randomBtn.click(0);
  assert.equal(app.selection.mapId, 'desert');
  screen.randomBtn.click(0);
  assert.equal(app.selection.mapId, 'city');
  assert.equal(went.length, 0);
  // Confirming afterwards starts the stage it chose.
  screen.startBtn.click();
  assert.equal(went.pop()[1].mapId, 'city');
});

test('Random Stage draws only real playable stages, each equally likely: never Practice Ground or a placeholder', () => {
  const counts = new Map();
  const n = 3000;
  for (let i = 0; i < n; i++) {
    const map = randomStage(() => (i + 0.5) / n);
    assert.ok(MAPS.includes(map));
    assert.notEqual(map, PRACTICE_MAP);
    counts.set(map.id, (counts.get(map.id) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), MAPS.map((m) => m.id).sort(), 'every stage reachable');
  for (const [id, c] of counts) assert.equal(c, n / MAPS.length, `${id}: ${c}`);
  // The edges of [0, 1) stay inside the list.
  assert.equal(randomStage(() => 0), MAPS[0]);
  assert.equal(randomStage(() => 0.9999999), MAPS.at(-1));
  assert.equal(randomStage(() => 0.5, []), null);
  assert.equal(pickRandom(MAPS, () => 0.5), MAPS[1]);
  // Regular Play's own draw goes through the same pick.
  const sel = {};
  drawRegularPlay(sel, () => 0.99);
  assert.equal(sel.mapId, MAPS.at(-1).id);
  // From the screen, with Math.random, only stages ever come out.
  const { app, screen } = setup();
  for (let i = 0; i < 200; i++) {
    screen.pickRandom();
    assert.ok(getMap(app.selection.mapId));
  }
});
