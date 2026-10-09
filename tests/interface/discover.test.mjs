// Run with node --test tests/interface/discover.test.mjs (no dependencies).
// Discover: its registration, Home → Discover → Back through the real
// ScreenManager, the Fighters / Movement / Launch tabs (Fighters
// first and open on every visit); the Fighters page: the roster browsed
// read-only in roster order, each fighter's one difficulty rating as stars
// shared by every roster, the Read play style button and its
// modal dialog, locked and unrated fighters, the empty roster, French; the
// Movement page built from the universal movement registry alone (the run,
// the jumps, the fast fall, the Dash and the air dash every fighter shares)
// and the Launch page built from the launch registry alone (Launch Point,
// the Base Launch values 0-3 and their formula, and every Directional
// Launch), both with no tuning numbers and no fighter, attack or character
// information of any kind, and the same however the roster grows; and
// keyboard / gamepad menu navigation
// through the real MenuNavigator, wide and narrow, on a minimal fake DOM.
// Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEST_A, TEST_DISABLED, withTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { stylesheet } from '../helpers/stylesheet.mjs';

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
  style = {};
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  html = '';
  scrollTop = 0;
  scrollHeight = 0;
  clientHeight = 0;
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
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, ...event }); }
  click(detail = 1) {
    if (this.disabled) return;
    this.dispatch('click', { detail, preventDefault: noop });
  }
  // Like the real thing: nothing inside a hidden or inert subtree takes focus.
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
    this.dispatch('focus');
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
  scrollBy({ top = 0 } = {}) { this.scrollTop = Math.max(0, Math.min(this.scrollTop + top, this.scrollHeight - this.clientHeight)); }
  scrollIntoView() {}
  hasPointerCapture() { return false; }
  // A canvas's drawing context: the preview only clears and draws.
  getContext() { return { clearRect: noop, drawImage: noop, fillRect: noop, imageSmoothingEnabled: false }; }
}

const sections = new Map();
globalThis.Node = Node;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
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

const { ScreenManager } = await import('../../js/core/screen-manager.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { HomeScreen } = await import('../../js/screens/home-screen.js');
const { DiscoverScreen } = await import('../../js/screens/discover-screen.js');
const { InfoDialog } = await import('../../js/ui/overlays.js');
const { FighterRoster } = await import('../../js/ui/fighter-roster.js');
const { setLanguage, localizeTree, STRINGS } = await import('../../js/localization/i18n.js');
const { MOVEMENT_GUIDE, MOVEMENT_SUMMARY, BASE_FIGHTER_MOVEMENT } = await import('../../js/data/movement.js');
const {
  BASE_LAUNCH_VALUES, BASE_LAUNCH_DESCRIPTIONS, BASE_LAUNCH_SUMMARY, LAUNCH_FORMULA, LAUNCH_POINT_SUMMARY,
  DIRECTIONAL_LAUNCHES, DIRECTIONAL_LAUNCH_SUMMARY,
} = await import('../../js/data/launch.js');
const { CHARACTERS, playableCharacters } = await import('../../js/data/characters.js');
const { getFighterProfile } = await import('../../js/data/fighter-profiles.js');

// Keyboard input: key() runs a keydown through every listener, as the app does.
function fakeInput() {
  const listeners = new Set();
  return {
    onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onPadMenu: noop,
    key(code) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
      for (const fn of [...listeners]) fn(e);
      return e;
    },
  };
}

// Home and Discover on the real ScreenManager and MenuNavigator, with the
// real information dialog, starting on Home. Reduced motion, so screens swap
// without timers. Fighter art never loads here (the preview stays blank).
function boot() {
  const plays = [];
  const loads = [];
  const app = {
    input: fakeInput(),
    device: { reducedMotion: true },
    audio: { play: (name) => plays.push(name) },
    loadCharacter(id) { loads.push(id); return Promise.resolve(null); },
    getSprites: () => null,
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const infoRoot = new Element('div');
  infoRoot.hidden = true; // as index.html ships it
  app.infoDialog = new InfoDialog(infoRoot, app);
  const home = new HomeScreen(app);
  const discover = new DiscoverScreen(app);
  app.screens.register(home);
  app.screens.register(discover);
  app.screens.go('home');
  return { app, home, discover, plays, loads };
}

const place = (el, left, top, width, height) => { el.rect = { left, top, width, height }; };

// The Fighters page's controls: the roster's slots in a grid of `cols`
// from (x, y), each `size` square, and the play-style button.
function layOutFighters(discover, { x, y, cols, size, button }) {
  discover.browser.slots.forEach((s, i) => place(s, x + (i % cols) * (size + 8), y + Math.floor(i / cols) * (size + 8), size, size));
  place(discover.browser.describeBtn, ...button);
}

// A wide landscape layout: Back over a rail down the left, the page beside
// it; on Fighters, the roster beside its preview, the play-style button at
// the preview's right.
function layOutWide(discover) {
  place(discover.el.querySelector('.btn-back'), 40, 20, 90, 44);
  discover.sections.forEach((s, i) => place(s.tab, 40, 110 + i * 48, 180, 44));
  for (const s of discover.sections) place(s.panel, 270, 110, 960, 590);
  layOutFighters(discover, { x: 280, y: 140, cols: 8, size: 72, button: [1080, 600, 150, 32] });
}

// The narrow layout: the rail runs across the top, the page below it; on
// Fighters, the roster over its preview.
function layOutNarrow(discover) {
  place(discover.el.querySelector('.btn-back'), 16, 20, 90, 44);
  discover.sections.forEach((s, i) => place(s.tab, 16 + i * 118, 110, 114, 44));
  for (const s of discover.sections) place(s.panel, 16, 170, 468, 800);
  layOutFighters(discover, { x: 16, y: 190, cols: 6, size: 68, button: [300, 900, 180, 32] });
}

function layOutHome(home) {
  home.el.querySelectorAll('.home-action').forEach((b, i) => place(b, 80, 370 + i * 60, 320, 52));
}

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
// What has focus, named briefly: a deep diff of two elements says nothing.
const describe = (el) => (el ? [el.tagName, el.id, el.className, el._def?.id, el.textContent.slice(0, 30)].filter(Boolean).join(' ') : String(el));
function assertFocus(el, message = 'focus') {
  const active = document.activeElement;
  assert.ok(active === el, `${message}: expected ${describe(el)}, got ${describe(active)}`);
}
// Everything a subtree could say: its text, every attribute and dataset
// value (hidden accessible names included) and any raw markup.
function everything(el) {
  const out = [];
  const walk = (n) => {
    if (!(n instanceof Element)) {
      out.push(n.textContent);
      return;
    }
    out.push(...n.attrs.values(), ...Object.values(n.dataset), n.html);
    n.children.forEach(walk);
  };
  walk(el);
  return out.join(' ');
}
const selected = (discover) => discover.sections.filter((s) => s.tab.getAttribute('aria-selected') === 'true').map((s) => s.id);
// Discover's sections by id.
const sectionsOf = (discover) => Object.fromEntries(discover.sections.map((s) => [s.id, s]));
// The Fighters page's slot for fighter `id`.
const slotOf = (discover, id) => discover.browser.slots.find((s) => s._def?.id === id);
// Opens Discover from Home.
function openDiscover() {
  const booted = boot();
  booted.home.actions.discover.click();
  return booted;
}

// ---- Registration ---------------------------------------------------------------

test('Discover is a registered screen with its own labelled section', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const section = html.match(/<section[^>]*data-screen="discover"[^>]*>/)?.[0];
  assert.ok(section, 'index.html has the Discover section');
  assert.match(section, /aria-label="Discover"/);
  assert.match(section, /class="screen screen--menu screen--discover"/);
  assert.match(section, /\bhidden\b/);

  const app = readFileSync(new URL('../../js/core/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ DiscoverScreen \} from '\.\.\/screens\/discover-screen\.js';/);
  assert.match(app, /s\.register\(new DiscoverScreen\(this\)\);/);
  // The play-style dialog is a global overlay of its own, like the choice dialog.
  assert.match(html, /<div id="info-dialog" class="overlay dialog-overlay info-overlay" hidden><\/div>/);
  assert.match(app, /this\.infoDialog = new InfoDialog\(document\.getElementById\('info-dialog'\), this\);/);

  const { discover, app: fake } = boot();
  assert.equal(discover.id, 'discover');
  assert.equal(fake.screens.get('discover'), discover);
  assert.equal(discover.el, sections.get('discover'));
  assert.equal(discover.navigable, true);
  assert.equal(discover.el.hidden, true, 'hidden until opened');
});

// ---- Home ⇄ Discover ------------------------------------------------------------

// Discover needs no fighter, but Home only offers Play (its default) while
// one is playable: a test-only one (see tests/fighters/fixtures/test-fighters.mjs) where it matters.
test('Home → Discover opens on Fighters; Back returns Home', () => withTestFighters([TEST_A], () => {
  const { app, home, discover } = boot();
  const button = home.actions.discover;
  assert.ok(button.html.includes('<span>Discover</span>'));
  button.click();
  assert.equal(app.screens.current, discover);
  assert.equal(discover.el.hidden, false);
  assert.equal(home.el.hidden, true);
  assert.equal(document.documentElement.dataset.screen, 'discover');
  assert.deepEqual(selected(discover), ['fighters']);
  assertFocus(discover.sections[0].tab, 'focus starts on Fighters');

  // The header's Back button, with Alva's back icon and a meaningful name.
  const back = discover.el.querySelector('.btn-back');
  assert.equal(back.getAttribute('aria-label'), 'Back');
  assert.equal(back.hasAttribute('data-nav'), true);
  back.click();
  assert.equal(app.screens.current, home);
  assert.equal(discover.el.hidden, true);
  assert.equal(discover.el.inert, true);
  assert.ok(document.activeElement.html.includes('<span>Play</span>'), 'Home focuses Play (its default) again');
}));

// Every shipped fighter disabled for `fn` only: nothing is playable.
function withoutFighters(fn) {
  const shipped = CHARACTERS.filter((c) => c.available);
  for (const c of shipped) c.available = false;
  try {
    return fn();
  } finally {
    for (const c of shipped) c.available = true;
  }
}

test('with no playable fighter Discover still opens from Home on Fighters, says so, and Back returns to it', () => withoutFighters(() => {
  const { app, home, discover, loads } = boot();
  const { play, watch, practice } = home.actions;
  assert.deepEqual([play, watch, practice].map((b) => b.disabled), [true, true, true], 'only the match actions close');
  assert.equal(home.actions.discover.disabled, false);
  assertFocus(home.actions.discover, 'the first open action is the default');
  app.input.key('KeyJ');
  assert.equal(app.screens.current, discover);
  assert.deepEqual(selected(discover), ['fighters']);
  assert.deepEqual(loads, [], 'nothing loads');

  // Every slot locked, nothing selected; the preview shows the first one,
  // Locked, with no rating and no play-style button; a line says why.
  const { browser } = discover;
  assert.equal(browser.selectedId, null);
  assert.ok(browser.slots.every((s) => s.tagName === 'DIV' && !s.hasAttribute('data-nav')));
  assert.equal(browser.status.hidden, false);
  assert.equal(browser.status.textContent, 'Locked');
  assert.equal(browser.name.textContent, 'Slot 01');
  assert.equal(browser.rating.hidden, true);
  assert.equal(browser.describeBtn.hidden, true);
  assert.equal(browser.empty.hidden, false);
  assert.equal(browser.empty.textContent, 'No fighters to show yet.');
  assert.equal(browser.focusSelected(), false);
  // Nothing in the page to move to, and nothing to describe.
  layOutWide(discover);
  app.nav.command('right', null);
  assertFocus(discover.sections[0].tab);
  browser.describe();
  assert.equal(app.infoDialog.isOpen, false);

  discover.el.querySelector('.btn-back').click();
  assert.equal(app.screens.current, home);
  assertFocus(home.actions.discover);
}));

test('Esc, Backspace and gamepad Back leave Discover for Home', () => {
  for (const code of ['Escape', 'Backspace', 'KeyK']) {
    const { app, home, discover } = boot();
    home.actions.discover.click();
    assert.equal(app.screens.current, discover);
    app.input.key(code);
    assert.equal(app.screens.current, home, code);
  }
  const { app, home, discover } = boot();
  home.actions.discover.click();
  app.nav.command('back', null); // what onPadMenu sends for B / Circle
  assert.equal(app.screens.current, home);
  assert.equal(discover.el.hidden, true);
});

test('every visit opens on Fighters, whatever the last one left open', () => {
  const { app, home, discover } = boot();
  const { fighters, movement, launch } = sectionsOf(discover);
  for (const last of [movement, launch]) {
    home.actions.discover.click();
    last.tab.click();
    assert.deepEqual(selected(discover), [last.id]);
    app.screens.back();
    home.actions.discover.click();
    assert.deepEqual(selected(discover), ['fighters']);
    assert.equal(fighters.panel.hidden, false);
    for (const other of [movement, launch]) assert.equal(other.panel.hidden, true);
    assertFocus(fighters.tab);
    app.screens.back();
  }
});

// ---- Tabs -----------------------------------------------------------------------

test('Fighters, Movement and Launch are real, labelled tabs, in that order; Fighters is selected by default', () => {
  const { app, discover } = openDiscover();
  const rail = discover.el.querySelector('.discover-rail');
  assert.equal(rail.getAttribute('role'), 'tablist');
  assert.equal(rail.getAttribute('aria-label'), 'Discover sections');
  assert.equal(rail.getAttribute('aria-orientation'), 'vertical');
  assert.equal(discover.sections.length, 3, 'exactly three sections');
  assert.deepEqual(rail.children, discover.sections.map((s) => s.tab), 'Fighters, Movement, then Launch');
  assert.deepEqual(discover.sections.map((s) => [s.id, s.tab.textContent]), [
    ['fighters', 'Fighters'], ['movement', 'Movement'], ['launch', 'Launch'],
  ]);

  for (const { id, tab, panel } of discover.sections) {
    assert.equal(tab.tagName, 'BUTTON');
    assert.equal(tab.getAttribute('type'), 'button');
    assert.equal(tab.getAttribute('role'), 'tab');
    assert.equal(tab.hasAttribute('data-nav'), true, 'reached by keyboard / gamepad');
    assert.equal(tab.hasAttribute('data-nav-no-hover-focus'), true, 'mouse hover is only a preview');
    assert.equal(tab.getAttribute('aria-controls'), panel.id);
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    assert.equal(panel.id, `discover-panel-${id}`);
    assert.equal(tab.id, `discover-tab-${id}`);
  }
  // The reference pages are navigation stops of their own (a gamepad
  // scrolls them); the Fighters page has its own controls instead, so it is
  // no stop and no Tab stop itself.
  const { fighters, movement, launch } = sectionsOf(discover);
  for (const page of [movement, launch]) {
    assert.equal(page.panel.getAttribute('tabindex'), '0');
    assert.equal(page.panel.hasAttribute('data-nav'), true);
  }
  assert.equal(fighters.panel.getAttribute('tabindex'), null);
  assert.equal(fighters.panel.hasAttribute('data-nav'), false);

  // The third section was Conditions: renamed through and through, no id
  // or label of it left.
  assert.doesNotMatch(text(discover.el), /condition/i);
  for (const { id, tab, panel } of discover.sections) {
    for (const s of [id, tab.id, panel.id, tab.getAttribute('aria-controls'), tab.textContent]) {
      assert.doesNotMatch(s, /condition/i, s);
    }
  }
  assert.equal(fighters.tab.getAttribute('aria-selected'), 'true');
  assert.equal(fighters.tab.classList.contains('is-active'), true);
  assert.equal(fighters.tab.getAttribute('tabindex'), '0');
  assert.equal(fighters.panel.hidden, false);
  for (const other of [movement, launch]) {
    assert.equal(other.tab.getAttribute('aria-selected'), 'false');
    assert.equal(other.tab.classList.contains('is-active'), false);
    assert.equal(other.tab.getAttribute('tabindex'), '-1', 'roving tabindex');
    assert.equal(other.panel.hidden, true);
  }
  assert.deepEqual(app.nav.candidates(discover.el).filter((c) => c.getAttribute('role') === 'tabpanel'), [], 'no page is a stop on Fighters');
});

test('every section is selectable by click and by focus, with one roving tab stop; a hidden page takes no focus', () => {
  const { app, discover } = openDiscover();
  const { fighters, movement, launch } = sectionsOf(discover);
  const only = (on) => {
    assert.deepEqual(selected(discover), [on.id]);
    for (const s of discover.sections) {
      assert.equal(s.panel.hidden, s !== on, s.id);
      assert.equal(s.tab.getAttribute('tabindex'), s === on ? '0' : '-1', s.id);
    }
  };

  launch.tab.click();
  only(launch);
  const candidates = app.nav.candidates(discover.el);
  assert.ok(!candidates.includes(movement.panel), 'the hidden Movement page is out of navigation');
  assert.ok(!candidates.includes(slotOf(discover, '0001')), 'the hidden Fighters page too');
  assert.ok(candidates.includes(launch.panel));
  const before = document.activeElement;
  movement.panel.focus();
  slotOf(discover, '0001').focus();
  assertFocus(before, 'a hidden page cannot take focus');

  // Keyboard / gamepad focus selects (automatic activation).
  launch.tab.focus();
  only(launch);
  movement.tab.focus();
  only(movement);
  fighters.tab.focus();
  only(fighters);
  fighters.tab.click();
  only(fighters);
});

// ---- Fighters -------------------------------------------------------------------

test('the Fighters page is the roster in roster order, in the Select Fighter roster\'s look, with locked slots kept locked', () => withTestFighters([TEST_A, TEST_DISABLED], () => {
  const { discover, loads } = openDiscover();
  const { fighters } = sectionsOf(discover);
  const page = fighters.panel;
  // Labelled by its tab; no page title repeating the roster panel's own.
  assert.equal(page.getAttribute('aria-labelledby'), fighters.tab.id);
  assert.equal(page.querySelector('.discover-page-title'), null);
  assert.equal(text(page.querySelector('.panel-title')), 'Roster');
  const { browser } = discover;
  assert.ok(page.contains(browser.rosterPanel) && page.contains(browser.previewPanel));

  // The same grid as any roster: every slot, the playable fighters in
  // their roster slots, everything else a locked placeholder.
  const roster = new FighterRoster(boot().app, { onConfirm: noop });
  roster.show('0001');
  const shape = (r) => r.slots.map((s) => [s.tagName, s.className, s._def?.id ?? null, s.hasAttribute('data-nav')]);
  assert.deepEqual(shape(browser), shape(roster));
  const order = browser.slots.filter((s) => s.tagName === 'BUTTON').map((s) => s._def.id);
  assert.deepEqual(order, [...playableCharacters()].sort((a, b) => a.rosterSlot - b.rosterSlot).map((d) => d.id));
  assert.deepEqual(order, ['0001', '0002', 'test-a'], '#0001 and #0002 first, as on Select Fighter');
  assert.equal(browser.slots[0].querySelector('.slot-name').textContent, '#0001');
  assert.equal(browser.slots[1].querySelector('.slot-name').textContent, '#0002');
  assert.deepEqual(loads.sort(), ['0001', '0002', 'test-a'], 'only playable fighters load, for their portraits');

  // A disabled fighter is a locked slot: no button, no focus, no preview
  // on a press, never selected.
  const locked = browser.slots[TEST_DISABLED.rosterSlot];
  assert.equal(locked.tagName, 'DIV');
  assert.equal(locked.hasAttribute('data-nav'), false);
  assert.equal(locked.getAttribute('aria-label'), 'Slot 07, locked');
  locked.click();
  assert.equal(browser.selectedId, '0001');
  assert.ok(!loads.includes(TEST_DISABLED.id));
}));

test('focusing or pressing a fighter previews and selects it; nothing confirms and nothing starts', () => {
  const { app, discover } = openDiscover();
  const { browser } = discover;
  const [first, second] = [slotOf(discover, '0001'), slotOf(discover, '0002')];
  assert.equal(browser.selectedId, '0001', 'the first fighter is selected on entry');
  assert.equal(browser.name.textContent, '#0001');

  second.focus();
  assert.equal(browser.name.textContent, '#0002', 'focus previews');
  assert.equal(browser.rating.getAttribute('aria-label'), 'Difficulty: 3 out of 5 stars');
  // Mouse, touch, keyboard and gamepad presses alike, again and again: only select.
  for (const detail of [1, 1, 0, 0]) {
    second.click(detail);
    assert.equal(app.screens.current, discover);
    assert.equal(browser.selectedId, '0002');
  }
  assert.equal(second.getAttribute('aria-pressed'), 'true');
  assert.equal(first.getAttribute('aria-pressed'), 'false');
  // A press without focus (some browsers do not focus a pressed button)
  // still previews it.
  first.click(1);
  assert.equal(browser.selectedId, '0001');
  assert.equal(browser.name.textContent, '#0001');

  // No Confirm, no start action of any kind.
  assert.equal(browser.confirmBtn, null);
  assert.deepEqual(discover.el.querySelectorAll('.btn--confirm'), []);
  const buttons = sectionsOf(discover).fighters.panel.querySelectorAll('button');
  assert.ok(buttons.every((b) => b.classList.contains('slot') || b === browser.describeBtn), 'only fighters and the play-style button');
  assert.doesNotMatch(everything(sectionsOf(discover).fighters.panel), /Confirm|\bStart|battle|roster\.(confirm|none)/i);

  // The page comes back on the fighter last browsed.
  second.click(0);
  app.screens.back();
  app.screens.go('discover');
  assert.equal(browser.selectedId, '0002');
  assert.equal(browser.name.textContent, '#0002');
});

test('the preview shows the shared difficulty rating as stars: #0001 ★★★★★, #0002 ★★★☆☆', () => {
  const { discover } = openDiscover();
  const { browser } = discover;
  const check = (id, stars, filled, label) => {
    slotOf(discover, id).focus();
    const { rating } = browser;
    assert.equal(rating.hidden, false, id);
    assert.equal(rating.getAttribute('role'), 'img');
    assert.equal(rating.getAttribute('aria-label'), label);
    assert.equal(rating.dataset.rating, String(filled));
    const shown = rating.querySelectorAll('.difficulty-star');
    assert.equal(shown.length, 5, 'every position of the scale shows');
    assert.equal(shown.map((s) => s.textContent).join(''), stars);
    assert.equal(shown.filter((s) => s.classList.contains('is-filled')).length, filled);
    assert.equal(rating.querySelector('.difficulty-stars').getAttribute('aria-hidden'), 'true', 'the name stands for the stars');
    // One informational rating: no star is a control or a stop.
    for (const s of shown) {
      assert.equal(s.tagName, 'SPAN');
      assert.equal(s.hasAttribute('data-nav') || s.hasAttribute('tabindex') || s.hasAttribute('role'), false);
    }
    assert.ok(!rating.hasAttribute('data-nav') && !rating.hasAttribute('tabindex'));
    // In the status badge's place: the badge is hidden, and no "Available" anywhere.
    assert.equal(browser.status.hidden, true);
    assert.equal(rating.parentNode, browser.status.parentNode, 'on the status row');
    assert.ok(!everything(browser.previewPanel).includes('Available'));
    assert.ok(!/available/i.test(everything(discover.el)), 'nor in any fighter\'s name on this page');
  };
  check('0001', '★★★★★', 5, 'Difficulty: 5 out of 5 stars');
  check('0002', '★★★☆☆', 3, 'Difficulty: 3 out of 5 stars');
  assert.equal(getFighterProfile('0001').difficulty, 5);
  assert.equal(getFighterProfile('0002').difficulty, 3);

  // The shared rating has no availability dot; slot strings stay unchanged.
  assert.ok(!browser.rating.classList.contains('status-badge'));
  const css = stylesheet();
  assert.match(css, /\.status-badge::before \{ content: ""; width: 6px; height: 6px; border-radius: 50%;/);
  assert.doesNotMatch(css, /\.difficulty-(rating|star|stars)[^{]*::before/);
  assert.equal(STRINGS.en['roster.available'], '{name}, available');
  assert.equal(STRINGS.en['roster.statusAvailable'], 'Available');
  // Each fighter's slot is named for this page: its name and rating.
  assert.equal(slotOf(discover, '0001').getAttribute('aria-label'), '#0001, difficulty 5 out of 5');
  assert.equal(slotOf(discover, '0002').getAttribute('aria-label'), '#0002, difficulty 3 out of 5');
});

test('a playable fighter with no profile shows Not rated and nothing to describe; a locked slot keeps Locked', () => withTestFighters([TEST_A], () => {
  const { discover, app } = openDiscover();
  const { browser } = discover;
  assert.equal(getFighterProfile(TEST_A.id), null);
  slotOf(discover, TEST_A.id).focus();
  assert.equal(browser.status.hidden, false);
  assert.equal(browser.status.textContent, 'Not rated');
  assert.ok(browser.status.classList.contains('is-unrated'));
  assert.equal(browser.rating.hidden, true);
  assert.equal(browser.describeBtn.hidden, true);
  assert.equal(slotOf(discover, TEST_A.id).getAttribute('aria-label'), 'Test A');
  browser.describe();
  assert.equal(app.infoDialog.isOpen, false);

  browser.preview(browser.slots[20]);
  assert.equal(browser.status.textContent, 'Locked');
  assert.equal(browser.name.textContent, 'Slot 21');
  assert.equal(browser.rating.hidden, true);
  assert.equal(browser.describeBtn.hidden, true);
  assert.equal(browser.empty.hidden, true, 'the empty-roster line only while nothing is playable');
}));

test('Read play style is a real, underlined text button at the bottom-right of the information area, announcing a dialog', () => {
  const { discover, app } = openDiscover();
  const { browser } = discover;
  const button = browser.describeBtn;
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.textContent, 'Read play style');
  assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(button.getAttribute('aria-describedby'), browser.name.id, 'it says whose');
  assert.equal(button.hasAttribute('data-nav'), true, 'reached by keyboard and gamepad');
  assert.equal(button.hidden, false);
  assert.ok(app.nav.candidates(discover.el).includes(button));
  // The action has its own row after the name, separate from the stars.
  const info = button.parentNode;
  assert.ok(info.classList.contains('preview-info'));
  assert.ok(info.classList.contains('preview-info--no-confirm'));
  assert.equal(info.querySelector('.btn--confirm'), null, 'no empty Confirm placeholder');
  assert.equal(info.children[1], button);
  assert.ok(info.children[0].contains(browser.name));
  assert.ok(info.children[0].contains(browser.rating));
  assert.equal(browser.rating.querySelector('.difficulty-rating-label'), null);

  const css = stylesheet();
  const rule = css.match(/\n\.text-action \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /text-decoration: underline;/, 'underlined, so it reads as interactive');
  assert.match(rule, /margin-left: auto;/, 'pushed to the far right');
  assert.match(rule, /font-size: 11px;/);
  assert.match(css, /\.play-style-action \{[^}]*justify-self: end;/);
  assert.match(rule, /min-height: 32px;/, 'a comfortable press area');
  assert.match(css, /html:not\(\.is-pointer-input\) \.text-action:focus \{[^}]*box-shadow: var\(--focus-ring\);/, 'the usual keyboard / gamepad ring');
  assert.match(css, /\.preview-status-row \{[^}]*flex-wrap: wrap;[^}]*justify-content: space-between;/, 'wraps cleanly on narrow previews');
  assert.match(css, /\.preview-status-row > \[hidden\]/, 'hidden parts of the row stay hidden');
  assert.match(css, /\.preview-info--no-confirm \{ row-gap: clamp\(16px, 4vh, 40px\); \}/);
  assert.match(css, /@media \(max-height: 560px\) \{\s*\.preview-info\.preview-info--no-confirm \{ row-gap: clamp\(12px, 3vh, 18px\); \}/);
});

test('the no-Confirm layout follows the roster hook; Confirm-enabled rosters keep their structure and activation', () => {
  const { app } = boot();
  const confirmed = [];
  const roster = new FighterRoster(app, { onConfirm: (def) => confirmed.push(def.id) });
  roster.show('0001');
  const info = roster.previewPanel.querySelector('.preview-info');
  assert.equal(info.className, 'preview-info');
  assert.deepEqual(info.children, [info.querySelector('.preview-head'), roster.describeBtn, roster.confirmBtn]);
  assert.equal(roster.confirmBtn.disabled, false);
  roster.confirmBtn.click();
  roster.slots[1].click(1); // pointer selects first, Confirm takes focus
  assert.equal(roster.selectedId, '0002');
  assertFocus(roster.confirmBtn);
  assert.deepEqual(confirmed, ['0001']);
  roster.slots[1].click(1);
  roster.slots[0].click(0); // keyboard / gamepad confirms immediately
  assert.deepEqual(confirmed, ['0001', '0002', '0001']);

  class ReadOnlyRoster extends FighterRoster {
    buildConfirm() { return null; }
    updateConfirm() {}
  }
  const readOnly = new ReadOnlyRoster(app, { onConfirm: null });
  readOnly.show('0001');
  assert.ok(readOnly.previewPanel.querySelector('.preview-info').classList.contains('preview-info--no-confirm'),
    'any roster without Confirm, independent of Discover or a fighter id');
});

test('the play-style dialog: role dialog, modal, titled with the fighter\'s name, its own description, focus inside, the screen inert', () => {
  const { discover, app } = openDiscover();
  const { browser } = discover;
  const dialog = app.infoDialog;
  const root = dialog.root;
  assert.equal(root.getAttribute('role'), 'dialog', 'informational, never an alertdialog');
  assert.equal(root.getAttribute('aria-modal'), 'true');
  assert.equal(root.getAttribute('aria-labelledby'), dialog.title.id);
  assert.equal(root.getAttribute('aria-describedby'), dialog.body.id);
  assert.equal(root.hidden, true);

  const read = (id) => {
    slotOf(discover, id).focus();
    browser.describeBtn.click();
    assert.equal(dialog.isOpen, true);
    assert.equal(root.hidden, false);
    const shown = { title: dialog.title.textContent, kicker: dialog.kicker.textContent, body: dialog.body.textContent };
    assertFocus(dialog.closeButton, 'focus moves into the dialog');
    assert.equal(dialog.closeButton.getAttribute('aria-label'), 'Close');
    assert.equal(discover.el.inert, true, 'the screen beneath is inert');
    assert.equal(app.nav.scopeEl, root, 'its own navigation scope');
    dialog.closeButton.click();
    assert.equal(dialog.isOpen, false);
    assert.equal(root.hidden, true);
    assert.equal(discover.el.inert, false);
    assertFocus(browser.describeBtn, 'focus returns to the button that opened it');
    return shown;
  };
  const one = read('0001');
  const two = read('0002');
  assert.deepEqual(one, { title: '#0001', kicker: 'Play style', body: STRINGS.en['discover.fighter.0001.playStyle'] });
  assert.deepEqual(two, { title: '#0002', kicker: 'Play style', body: STRINGS.en['discover.fighter.0002.playStyle'] });
  assert.notEqual(one.body, two.body);
  assert.match(one.body, /^A space-control and setup fighter/);
  assert.match(two.body, /^A momentum-driven rushdown and aerial-chase fighter/);
});

test('Escape, gamepad Back, the Close button and a press on the dim close the dialog, focus back on its opener; Back never leaves Discover', () => {
  const ways = {
    escape: (app) => app.input.key('Escape'),
    backspace: (app) => app.input.key('Backspace'),
    gamepadBack: (app) => app.nav.command('back', null),
    close: (app) => app.infoDialog.closeButton.click(),
    dim: (app) => app.infoDialog.root.dispatch('click'),
  };
  for (const [how, close] of Object.entries(ways)) {
    const { discover, app } = openDiscover();
    const opener = discover.browser.describeBtn;
    opener.focus();
    app.nav.command('confirm', null); // a gamepad A / keyboard J on the button
    assert.equal(app.infoDialog.isOpen, true, how);
    close(app);
    assert.equal(app.infoDialog.isOpen, false, how);
    assert.equal(app.screens.current, discover, `${how}: still on Discover`);
    assert.equal(discover.el.inert, false, how);
    assertFocus(opener, `${how}: focus back on the opener`);
    assert.deepEqual(app.nav.scopes, [], `${how}: its scope is gone`);
  }
  // A press inside the panel is not a press on the dim.
  const { app, discover } = openDiscover();
  discover.browser.describeBtn.click();
  app.infoDialog.body.dispatch('click');
  assert.equal(app.infoDialog.isOpen, true);
});

test('keyboard and gamepad stay inside the open dialog: arrows keep focus on Close, confirm closes it', () => {
  const { discover, app } = openDiscover();
  layOutWide(discover);
  place(app.infoDialog.closeButton, 600, 300, 40, 40);
  discover.browser.describeBtn.focus();
  app.input.key('KeyJ');
  assert.equal(app.infoDialog.isOpen, true);
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) {
    app.input.key(key);
    assertFocus(app.infoDialog.closeButton, key);
  }
  assert.ok(!app.nav.candidates(app.nav.scopeEl).includes(discover.browser.describeBtn), 'Discover is out of reach');
  app.input.key('KeyJ');
  assert.equal(app.infoDialog.isOpen, false);
  assertFocus(discover.browser.describeBtn);
});

test('Tab and Shift+Tab stay on the informational dialog Close control', () => {
  const { app, discover } = openDiscover();
  discover.browser.describeBtn.click();
  for (const shiftKey of [false, true]) {
    let prevented = false;
    app.infoDialog.root.dispatch('keydown', {
      code: 'Tab', shiftKey, preventDefault: () => { prevented = true; },
    });
    assert.equal(prevented, true);
    assertFocus(app.infoDialog.closeButton);
    assert.equal(app.infoDialog.isOpen, true);
  }
  app.infoDialog.close();
  assertFocus(discover.browser.describeBtn);
});

test('the Fighters page in French: tab, title, rating, button, slot names and the dialog all follow the language', () => {
  const { discover, app } = openDiscover();
  const { browser } = discover;
  const all = [discover.el, app.infoDialog.root];
  slotOf(discover, '0001').focus();
  browser.describeBtn.click();
  setLanguage('fr');
  try {
    for (const root of all) localizeTree(root);
    assert.equal(sectionsOf(discover).fighters.tab.textContent, 'Combattants');
    assert.equal(text(sectionsOf(discover).fighters.panel.querySelector('.panel-title')), 'Combattants');
    assert.equal(browser.rating.getAttribute('aria-label'), 'Difficulté : 5 étoiles sur 5');
    assert.equal(browser.rating.querySelector('.difficulty-rating-label'), null);
    assert.equal(browser.describeBtn.textContent, 'Lire le style de jeu');
    assert.equal(slotOf(discover, '0002').getAttribute('aria-label'), '#0002, difficulté 3 sur 5');
    assert.equal(app.infoDialog.kicker.textContent, 'Style de jeu');
    assert.equal(app.infoDialog.title.textContent, '#0001', 'a fighter\'s name is its own in every language');
    assert.equal(app.infoDialog.body.textContent, STRINGS.fr['discover.fighter.0001.playStyle']);
    assert.match(app.infoDialog.body.textContent, /^Un combattant de contrôle de l’espace/);
    assert.equal(app.infoDialog.closeButton.getAttribute('aria-label'), 'Fermer');
    app.infoDialog.close();
    slotOf(discover, '0002').focus();
    assert.equal(browser.rating.getAttribute('aria-label'), 'Difficulté : 3 étoiles sur 5');
    browser.describeBtn.click();
    assert.match(app.infoDialog.body.textContent, /^Un combattant de pression offensive/);
    app.infoDialog.close();
  } finally {
    setLanguage('en');
    for (const root of all) localizeTree(root);
  }
  assert.equal(browser.describeBtn.textContent, 'Read play style');
  assert.equal(browser.rating.getAttribute('aria-label'), 'Difficulty: 3 out of 5 stars');
});

// ---- Movement ----------------------------------------------------------------------

test('the Movement page is one entry: universal movement, then every move of it in registry order, no tiers', () => {
  const { discover } = openDiscover();
  const page = sectionsOf(discover).movement.panel;
  assert.equal(text(page.querySelector('.discover-page-title')), 'Movement');
  const entries = page.querySelectorAll('.discover-entry');
  assert.equal(entries.length, 1, 'one entry: movement is one thing, shared');
  const [entry] = entries;
  const title = entry.querySelector('.discover-entry-title');
  assert.equal(title.tagName, 'H3');
  assert.equal(entry.getAttribute('aria-labelledby'), title.id);
  assert.equal(text(title), 'Universal movement');
  const paragraphs = entry.querySelectorAll('p');
  assert.equal(paragraphs.length, 2, 'introduction followed by one detailed paragraph');
  assert.equal(text(paragraphs[0]), MOVEMENT_SUMMARY);
  assert.equal(paragraphs[0].parentNode, paragraphs[1].parentNode);
  assert.deepEqual(paragraphs[0].parentNode.children, [title, ...paragraphs]);
  assert.deepEqual(paragraphs[1].querySelectorAll('strong').map(text), MOVEMENT_GUIDE.map((m) => m.name));
  assert.equal(text(paragraphs[1]), MOVEMENT_GUIDE.map((m) => `${m.name}. ${m.description}`).join(' '));
  for (const selector of ['ul', 'li', '.discover-tiers', '.discover-tier', '.discover-mark', '.discover-meter']) {
    assert.deepEqual(page.querySelectorAll(selector), [], `no ${selector} holders or markers`);
  }
  assert.doesNotMatch(everything(page), /\bPower\b|\btiers?\b|launch|knockback/i, 'no Powers, tiers or Launch here');
});

test('the Movement page shows no tuning numbers and nothing interactive', () => {
  const { discover } = openDiscover();
  const page = sectionsOf(discover).movement.panel;
  assert.doesNotMatch(text(page), /\d/, 'no number at all');
  for (const value of Object.values(BASE_FIGHTER_MOVEMENT)) {
    if (value > 9) assert.ok(!everything(page).includes(String(value)), `no raw ${value}`);
  }
  assert.deepEqual(page.querySelectorAll('button').concat(page.querySelectorAll('[data-nav]')), []);
});

test('Movement paragraphs and Launch labels follow English and French, including switching back', () => {
  const { discover } = openDiscover();
  const { movement, launch } = sectionsOf(discover);
  try {
    for (const lang of ['en', 'fr', 'en']) {
      setLanguage(lang);
      localizeTree(discover.el);
      const strings = STRINGS[lang];
      assert.deepEqual(discover.tabs.map(text), ['fighters', 'movement', 'launch'].map((id) => strings[`discover.${id}`]));
      assert.equal(discover.rail.getAttribute('aria-label'), strings['discover.sections']);
      assert.equal(text(movement.panel.querySelector('.discover-page-title')), strings['discover.movement']);
      assert.equal(text(movement.panel.querySelector('.discover-entry-title')), strings['discover.movementTitle']);
      const paragraphs = movement.panel.querySelectorAll('p');
      assert.deepEqual(paragraphs.map(text), [strings['movement.summary'],
        MOVEMENT_GUIDE.map((m) => `${strings[`movement.${m.id}.name`]}. ${strings[`movement.${m.id}.description`]}`).join(' ')]);
      assert.equal(paragraphs[1].querySelectorAll('strong').length, 6);
      assert.deepEqual(launch.panel.querySelectorAll('.discover-entry-title').map(text),
        ['launchPointTitle', 'baseLaunchTitle', 'directionalLaunchTitle'].map((key) => strings[`discover.${key}`]));
      assert.deepEqual(launch.panel.querySelectorAll('.discover-tier-name').slice(4).map(text),
        DIRECTIONAL_LAUNCHES.map((d) => strings[`launch.direction.${d.id ?? 'none'}.name`]));
    }
  } finally {
    setLanguage('en');
  }
});

test('Discover uses authored capitalization and readable Movement width, without changing shared roster styles', () => {
  const css = readFileSync(new URL('../../css/discover.css', import.meta.url), 'utf8');
  for (const selector of ['discover-tab', 'discover-page-title', 'discover-entry-title', 'discover-tier-name']) {
    const rule = css.match(new RegExp(`\\.${selector} \\{[^}]*\\}`))[0];
    assert.match(rule, /text-transform: none;/, selector);
  }
  assert.match(css, /\.screen--discover \.panel-title,\s*\.screen--discover \.status-badge,\s*\.info-panel \.kicker\[data-i18n="discover.playStyleTitle"\] \{ text-transform: none; \}/);
  assert.match(css, /\.discover-page--movement \.discover-entry \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.discover-page--movement \.discover-entry-text \{ max-width: 72ch; \}/);
  assert.doesNotMatch(css, /\.discover-mark/);
  const all = stylesheet();
  assert.match(all, /\n\.panel-title \{[^}]*text-transform: uppercase;/);
  assert.match(all, /\n\.status-badge \{[^}]*text-transform: uppercase;/);
});

// ---- Launch ---------------------------------------------------------------------

test('the Launch page explains Launch Point, then Base Launch 0-3 and its formula, then every Directional Launch', () => {
  const { discover } = openDiscover();
  const { launch } = sectionsOf(discover);
  launch.tab.click();
  const page = launch.panel;
  assert.equal(text(page.querySelector('.discover-page-title')), 'Launch');
  const entries = page.querySelectorAll('.discover-entry');
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((e) => text(e.querySelector('.discover-entry-title'))), ['Launch Point', 'Base Launch', 'Directional Launch']);
  assert.deepEqual(entries.map((e) => text(e.querySelector('.discover-entry-text'))), [
    LAUNCH_POINT_SUMMARY, BASE_LAUNCH_SUMMARY, DIRECTIONAL_LAUNCH_SUMMARY,
  ]);
  for (const entry of entries) {
    const title = entry.querySelector('.discover-entry-title');
    assert.equal(title.tagName, 'H3');
    assert.equal(entry.getAttribute('aria-labelledby'), title.id);
  }

  // Launch Point: damage, recovery with the block exception, launch and respawn.
  const lp = text(entries[0]);
  assert.match(lp, /starts at 0/);
  assert.match(lp, /Each unblocked hit adds its damage and restarts recovery/);
  assert.match(lp, /after 2 seconds.*drops by 1 every following 0\.5 seconds, down to 0/);
  assert.match(lp, /first point at 2\.5 seconds/);
  assert.match(lp, /Blocks do not restart recovery/);
  assert.match(lp, /Higher Launch Point means a harder launch/);
  assert.match(lp, /Respawning resets it to 0/);
  assert.equal(entries[0].querySelector('.discover-tiers'), null, 'explained, not listed');

  // Base Launch: the four literal values, each marked with the number itself,
  // and the formula they follow.
  const values = entries[1].querySelector('.discover-tiers');
  assert.equal(values.tagName, 'OL');
  assert.equal(values.getAttribute('aria-label'), 'Base Launch values');
  const rows = values.querySelectorAll('.discover-tier');
  assert.deepEqual(rows.map((r) => [r.dataset.value, text(r.querySelector('.discover-tier-name')), text(r.querySelector('.discover-tier-desc'))]), [
    ['0', 'Base Launch 0', 'No launch. The Launch Point is multiplied by zero.'],
    ['1', 'Base Launch 1', 'Normal launch. Uses the Launch Point once.'],
    ['2', 'Base Launch 2', 'Double launch. Uses twice the Launch Point.'],
    ['3', 'Base Launch 3', 'Triple launch. Uses three times the Launch Point.'],
  ]);
  assert.deepEqual(rows.map((r) => r.dataset.value), BASE_LAUNCH_VALUES.map(String), 'straight from the registry');
  assert.deepEqual(rows.map((r) => text(r.querySelector('.discover-tier-desc'))), BASE_LAUNCH_VALUES.map((v) => BASE_LAUNCH_DESCRIPTIONS[v]));
  rows.forEach((row, j) => {
    const marker = row.querySelector('.discover-value');
    assert.equal(marker.getAttribute('aria-hidden'), 'true', 'the name says it too');
    assert.equal(text(marker), String(j), 'a numeric marker, not a meter');
    assert.equal(row.querySelector('.discover-meter'), null);
  });
  assert.ok(rows.every((r) => r.className === 'discover-tier'), 'no value is marked');
  const formula = entries[1].querySelector('.discover-formula');
  assert.equal(text(formula), LAUNCH_FORMULA);
  assert.equal(LAUNCH_FORMULA, 'Launch strength = Base Launch × Launch Point');

  // Directional Launch: none, sideways, upward and downward.
  const directions = entries[2].querySelector('.discover-tiers');
  assert.equal(directions.tagName, 'UL');
  assert.equal(directions.getAttribute('aria-label'), 'Directional Launch directions');
  const dirRows = directions.querySelectorAll('.discover-tier');
  assert.deepEqual(dirRows.map((r) => [r.dataset.direction, text(r.querySelector('.discover-tier-name')), text(r.querySelector('.discover-tier-desc'))]), [
    ['none', 'None', 'The hit deals damage but causes no directional launch.'],
    ['horizontal', 'Horizontal', 'Launches in the direction the hit is traveling.'],
    ['vertical', 'Vertical', 'Launches upward.'],
    ['reverseVertical', 'Reverse vertical', 'Launches downward.'],
  ]);
  assert.deepEqual(dirRows.map((r) => r.dataset.direction), DIRECTIONAL_LAUNCHES.map((d) => d.id ?? 'none'));
  for (const row of dirRows) assert.equal(row.querySelector('.discover-direction').getAttribute('aria-hidden'), 'true');
  // No Power (retired) wording or tiers here.
  assert.doesNotMatch(text(page), /\bPower\b|\btiers?\b/i);
});

test('the Launch page carries none of the old Knockback system: no Low / Mid / High, growth or accumulated Knockback', () => {
  const { discover } = openDiscover();
  const { launch } = sectionsOf(discover);
  launch.tab.click();
  const all = everything(launch.panel);
  assert.doesNotMatch(all, /\b(Low|Mid|High)\b/, 'no old levels');
  assert.doesNotMatch(all, /knockback/i, 'no Knockback, growth or accumulated Knockback');
  assert.doesNotMatch(all, /growth|bonus/i);
  for (const gone of ['low', 'mid', 'high', 'reversed']) {
    assert.ok(launch.panel.querySelectorAll('.discover-tier').every((r) => r.dataset.level === undefined && r.dataset.direction !== gone));
  }
});

test('the Launch page shows only Base Launch and recovery numbers, no fighter or attack, and nothing interactive', () => {
  const { discover } = openDiscover();
  const { launch } = sectionsOf(discover);
  launch.tab.click();
  const page = launch.panel;
  // The Base Launch values and the recovery rule, never velocity tuning.
  assert.deepEqual([...new Set(text(page).match(/\d+(?:\.\d+)?/g))].sort(), ['0', '0.5', '1', '2', '2.5', '3']);
  assert.doesNotMatch(everything(page), /#0001|\battack\s?\d|extra.attack|mid-?air|Throw|shuriken|Sphere|Rush|clone/i, 'no fighter or attack is named');
  assert.deepEqual(page.querySelectorAll('button').concat(page.querySelectorAll('[data-nav]')), []);
});

// ---- Roster independence: Movement and Launch -------------------------

test('only the Fighters page names fighters: Movement and Launch carry no roster, ownership or character data', () => {
  const { discover } = openDiscover();
  // Every definition's name, playable or not.
  const names = CHARACTERS.map((c) => c.displayName);
  assert.ok(names.includes('#0001'));
  const { fighters, movement, launch } = sectionsOf(discover);
  for (const section of [movement, launch]) {
    // Visible text, attributes (hidden accessible names included) and markup.
    const all = everything(section.panel);
    for (const name of names) assert.ok(!all.includes(name), `${section.id}: no ${name}`);
    assert.doesNotMatch(all, /#\d{4}/, `${section.id}: no character id`);
    assert.doesNotMatch(all, /\bFighters?\b|Used by|\broster\b|difficult|play style/i, `${section.id}: no ownership labels`);
    for (const gone of ['.discover-owners', '.discover-tier-users', '.discover-tier-check', '.is-used', 'dl', '.slot', '.difficulty-rating']) {
      assert.deepEqual(section.panel.querySelectorAll(gone), [], `${section.id}: no ${gone}`);
    }
  }
  // The Fighters page, and it alone, does.
  assert.ok(everything(fighters.panel).includes('#0001') && everything(fighters.panel).includes('#0002'));

  // Structurally: the Movement page is built from the movement registry and
  // the Launch page from the launch registry alone, never from the roster,
  // a profile or any attack; only the Fighters page reads fighters, through
  // the fighter browser.
  const source = readFileSync(new URL('../../js/screens/discover-screen.js', import.meta.url), 'utf8');
  const body = (name) => source.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  for (const name of ['buildMovementPage', 'buildLaunchPage']) {
    const code = body(name);
    assert.ok(code, `${name} takes nothing: it reads only its registry`);
    assert.doesNotMatch(code, /CHARACTERS|getCharacter|playable|browser|profile|displayName|\.attacks\b|\.baseLaunch\b|\.directionalLaunch\b|screen/, name);
  }
  assert.match(body('buildMovementPage'), /MOVEMENT_GUIDE/);
  assert.match(body('buildLaunchPage'), /BASE_LAUNCH_VALUES[\s\S]*DIRECTIONAL_LAUNCHES/);
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /characters\.js|fighter-profiles\.js|\bCHARACTERS\b|getCharacter\b/, 'the screen itself never imports the roster');
  assert.doesNotMatch(code, /'0001'|'0002'|#0001|#0002/, 'no fighter id in the screen');
  assert.match(source, /import \{ FighterBrowser \} from '\.\.\/ui\/fighter-browser\.js';/);
  assert.doesNotMatch(source, /getFighterPowerTier|fighterTiers|\.powers\b/);
  assert.doesNotMatch(source, /knockback/i, 'no trace of the old Knockback page');
  assert.doesNotMatch(source, /Used by|is-used/);
  assert.match(source, /import \{ MOVEMENT_GUIDE \} from '\.\.\/data\/movement\.js';/);
  assert.doesNotMatch(source, /powers\.js|POWERS/, 'no Powers: they are retired');
  assert.match(source, /\bBASE_LAUNCH_VALUES\b[^;]*\bDIRECTIONAL_LAUNCHES\b[^;]*\} from '\.\.\/data\/launch\.js';/);
  // The browser names no fighter either: it reads them from the registry
  // and the profiles.
  const browserSource = readFileSync(new URL('../../js/ui/fighter-browser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(browserSource.replace(/^\s*\/\/.*$/gm, ''), /'0001'|'0002'|#000\d|=== '\d{4}'/);
  // And the ownership styles are gone with it.
  const css = stylesheet();
  assert.doesNotMatch(css, /\.discover-(owners|tier-users|tier-check|label)\b|\.discover-tier\.is-used/);
});

test('the Movement and Launch pages stay the same as the roster grows; the Fighters page grows with it', () => {
  const render = () => {
    const { discover } = openDiscover();
    const { fighters, movement, launch } = sectionsOf(discover);
    return { reference: everything(movement.panel) + everything(launch.panel), fighters: everything(fighters.panel) };
  };
  const before = render();
  const extra = {
    ...CHARACTERS[0], id: '9998', displayName: '#9998', rosterSlot: 7, available: true,
    attacks: { ...CHARACTERS[0].attacks, attack1: { ...CHARACTERS[0].attacks.attack1, baseLaunch: 3, directionalLaunch: 'vertical' } },
  };
  CHARACTERS.push(extra);
  try {
    const after = render();
    assert.equal(after.reference, before.reference, 'another fighter, with other launches, changes nothing');
    assert.ok(!after.reference.includes('#9998'));
    assert.ok(!before.fighters.includes('#9998') && after.fighters.includes('#9998'), 'the new fighter is on the Fighters page');
  } finally {
    CHARACTERS.splice(CHARACTERS.indexOf(extra), 1);
  }
});

test('Passives has no tab, panel, registration or unused translation', () => {
  const { discover } = openDiscover();
  assert.doesNotMatch(everything(discover.el), /passives/i);
  const source = readFileSync(new URL('../../js/screens/discover-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /passives/i);
  for (const lang of ['en', 'fr']) {
    assert.equal(STRINGS[lang]['discover.passives'], undefined);
    assert.equal(STRINGS[lang]['discover.movementList'], undefined);
  }
});

// ---- Keyboard / gamepad navigation --------------------------------------------

test('keyboard and gamepad reach Discover from Home and every control on it (wide layout)', () => withTestFighters([TEST_A], () => {
  const { app, home, discover, plays } = boot();
  layOutHome(home);
  layOutWide(discover);
  const { fighters, movement, launch } = sectionsOf(discover);
  const back = discover.el.querySelector('.btn-back');
  const { browser } = discover;

  // Home: Play → Watch Mode → Practice Ground → Discover, then confirm (J / A).
  assertFocus(home.actions.play);
  app.input.key('ArrowDown');
  assertFocus(home.actions.watch);
  app.input.key('ArrowDown');
  assertFocus(home.actions.practice);
  app.input.key('ArrowDown');
  assert.ok(document.activeElement.html.includes('<span>Discover</span>'));
  app.input.key('KeyJ');
  assert.equal(app.screens.current, discover);
  assertFocus(fighters.tab);

  // Down the rail through all three tabs and back up.
  for (const [key, to] of [['ArrowDown', movement], ['ArrowDown', launch], ['ArrowUp', movement], ['ArrowUp', fighters]]) {
    app.input.key(key);
    assertFocus(to.tab, `${key} → ${to.id}`);
    assert.deepEqual(selected(discover), [to.id]);
  }

  // Into the Fighters page: the selected fighter, then along the roster to
  // the play-style button.
  app.input.key('ArrowRight');
  assertFocus(slotOf(discover, '0001'), 'the selected fighter, not just the nearest control');
  app.input.key('ArrowRight');
  assertFocus(slotOf(discover, '0002'));
  assert.equal(browser.name.textContent, '#0002');
  app.input.key('ArrowDown');
  assertFocus(slotOf(discover, TEST_A.id));
  assert.equal(browser.describeBtn.hidden, true, 'nothing to describe for an unrated fighter');
  app.input.key('ArrowUp');
  app.input.key('ArrowRight');
  assertFocus(slotOf(discover, '0002'));
  app.input.key('ArrowRight');
  assertFocus(browser.describeBtn);
  // Confirm (J / A) opens the description; Back (K / B) closes it, back on the button.
  app.input.key('KeyJ');
  assert.equal(app.infoDialog.isOpen, true);
  assert.equal(app.infoDialog.title.textContent, '#0002');
  app.input.key('KeyK');
  assert.equal(app.infoDialog.isOpen, false);
  assert.equal(app.screens.current, discover);
  assertFocus(browser.describeBtn);

  // ← from the button goes back into the roster.
  app.input.key('ArrowLeft');
  assert.ok(browser.slots.includes(document.activeElement), 'back to a fighter');

  // Leaving the page toward the rail lands on the open tab, never on
  // another one, so the page never switches underneath, even from a row
  // that lines up with Movement or Launch.
  slotOf(discover, '0002').focus();
  app.input.key('ArrowLeft');
  assertFocus(slotOf(discover, '0001'));
  app.input.key('ArrowLeft');
  assertFocus(fighters.tab);
  assert.deepEqual(selected(discover), ['fighters']);
  slotOf(discover, TEST_A.id).focus();
  app.input.key('ArrowLeft');
  assertFocus(fighters.tab);
  assert.deepEqual(selected(discover), ['fighters']);
  // Confirm on a fighter only selects it: still Discover, still Fighters.
  app.input.key('ArrowRight');
  app.input.key('KeyJ');
  assert.equal(app.screens.current, discover);
  assert.deepEqual(selected(discover), ['fighters']);

  // Into the Launch page and back: leaving toward the rail lands on the
  // open tab, never on another one, so the page never switches underneath.
  launch.tab.focus();
  app.nav.command('right', null);
  assertFocus(launch.panel);
  app.nav.command('left', null);
  assertFocus(launch.tab);
  assert.deepEqual(selected(discover), ['launch']);
  app.input.key('ArrowUp');
  assertFocus(movement.tab);
  assert.deepEqual(selected(discover), ['movement']);
  app.nav.command('right', null);
  assertFocus(movement.panel);
  app.nav.command('left', null);
  assertFocus(movement.tab);
  assert.deepEqual(selected(discover), ['movement']);
  app.nav.command('right', null);
  app.nav.command('up', null);
  assertFocus(movement.tab);

  app.input.key('ArrowUp');
  assertFocus(fighters.tab);
  app.input.key('ArrowUp');
  assertFocus(back);
  app.input.key('ArrowDown');
  assertFocus(fighters.tab);
  assert.ok(plays.includes('move'));

  // Confirm on Back goes Home.
  app.input.key('ArrowUp');
  app.input.key('KeyJ');
  assert.equal(app.screens.current, home);
}));

test('↑ / ↓ scroll a long page while it can scroll, then move on', () => {
  const { app, discover } = openDiscover();
  layOutWide(discover);
  const { movement } = sectionsOf(discover);
  movement.tab.focus();
  Object.assign(movement.panel, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

  app.nav.command('right', null);
  assertFocus(movement.panel);
  app.input.key('ArrowDown');
  assertFocus(movement.panel);
  assert.equal(movement.panel.scrollTop, 160);
  for (let i = 0; i < 5; i++) app.input.key('ArrowDown');
  assert.equal(movement.panel.scrollTop, 600, 'stops at the end');
  assertFocus(movement.panel, 'nothing below: focus stays');
  for (let i = 0; i < 4; i++) app.input.key('ArrowUp');
  assert.equal(movement.panel.scrollTop, 0);
  assertFocus(movement.panel);
  app.input.key('ArrowUp');
  assertFocus(movement.tab, 'at the top, ↑ leaves for the open tab');
});

test('narrow layout: the rail runs across the top, arrows follow all three tabs, and ↓ enters the Fighters page', () => {
  window.matchMedia = () => ({ matches: true, addEventListener: noop });
  try {
    const { app, discover } = openDiscover();
    layOutNarrow(discover);
    assert.equal(discover.el.querySelector('.discover-rail').getAttribute('aria-orientation'), 'horizontal');
    const { fighters, movement, launch } = sectionsOf(discover);
    for (const [key, to] of [['ArrowRight', movement], ['ArrowRight', launch], ['ArrowLeft', movement], ['ArrowLeft', fighters]]) {
      app.input.key(key);
      assertFocus(to.tab, `${key} → ${to.id}`);
      assert.deepEqual(selected(discover), [to.id]);
    }
    app.input.key('ArrowDown');
    assertFocus(slotOf(discover, '0001'));
    app.input.key('ArrowRight');
    assertFocus(slotOf(discover, '0002'));
    // Up from the roster's top row: the open tab, even under another one.
    app.input.key('ArrowUp');
    assertFocus(fighters.tab);
    assert.deepEqual(selected(discover), ['fighters']);
    app.input.key('ArrowUp');
    assertFocus(discover.el.querySelector('.btn-back'));

    // A reference page below its tab, and back.
    movement.tab.focus();
    app.input.key('ArrowDown');
    assertFocus(movement.panel);
    app.input.key('ArrowUp');
    assertFocus(movement.tab);
  } finally {
    window.matchMedia = () => ({ matches: false, addEventListener: noop });
  }
});

test('the narrow rail fits three sections: it scrolls sideways rather than clip, never shrinks a tab below a touch target, and the page never scrolls sideways', () => {
  const css = readFileSync(new URL('../../css/discover.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /four sections|passives/i, 'no obsolete section scaffolding');
  const narrow = css.slice(css.indexOf('@media (max-width: 600px) and (min-height: 441px)'));
  const rail = narrow.match(/\.discover-rail \{[^}]*\}/)[0];
  assert.match(rail, /overflow-x: auto;/);
  assert.match(rail, /min-width: 0;/);
  const tab = narrow.match(/\.discover-tab \{[^}]*\}/)[0];
  assert.match(tab, /min-height: 44px;/, 'a full touch target');
  assert.match(tab, /flex: 1 0 auto;/, 'tabs share the row but never shrink below their label');
  assert.match(tab, /white-space: nowrap;/);
  assert.match(css, /\.discover-tab \{[^}]*min-height: 44px;/, 'and on the wide rail');
  // The Fighters page fills its panel; the roster scrolls in its own panel.
  assert.match(css, /\.discover-panel--fighters \{ overflow: hidden;/);
  assert.match(css, /\.discover-fighters \{[^}]*height: 100%;[^}]*min-height: 0;/);
  // The rail's breakpoint is the one the screen tracks.
  const source = readFileSync(new URL('../../js/screens/discover-screen.js', import.meta.url), 'utf8');
  const query = source.match(/const NARROW_QUERY = '([^']+)'/)[1];
  assert.ok(css.includes(`@media ${query} {`));
});
