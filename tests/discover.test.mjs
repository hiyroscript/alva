// Run with node --test tests/discover.test.mjs (no dependencies).
// Discover: its registration, Home → Discover → Back through the real
// ScreenManager, the Power / Conditions tabs, the Power page built from the
// Jump Power tier data (with #0001 on Jump Power 2), the intentionally empty
// Conditions page, and keyboard / gamepad menu navigation through the real
// MenuNavigator, on a minimal fake DOM. Layout and paint still need
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const { ScreenManager } = await import('../js/core/screen-manager.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { HomeScreen } = await import('../js/screens/home-screen.js');
const { DiscoverScreen } = await import('../js/screens/discover-screen.js');
const { POWERS, JUMP_POWER_TIERS } = await import('../js/data/powers.js');
const { CHARACTERS } = await import('../js/data/characters.js');

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

// Home and Discover on the real ScreenManager and MenuNavigator, starting
// on Home. Reduced motion, so screens swap without timers.
function boot() {
  const plays = [];
  const app = {
    input: fakeInput(),
    device: { reducedMotion: true },
    audio: { play: (name) => plays.push(name) },
  };
  app.screens = new ScreenManager(app);
  app.nav = new MenuNavigator(app);
  const home = new HomeScreen(app);
  const discover = new DiscoverScreen(app);
  app.screens.register(home);
  app.screens.register(discover);
  app.screens.go('home');
  return { app, home, discover, plays };
}

const place = (el, left, top, width, height) => { el.rect = { left, top, width, height }; };

// A wide landscape layout: Back over a rail down the left, the page beside it.
function layOutWide(discover) {
  const [power, conditions] = discover.sections;
  place(discover.el.querySelector('.btn-back'), 40, 20, 90, 44);
  place(power.tab, 40, 110, 180, 44);
  place(conditions.tab, 40, 158, 180, 44);
  for (const s of discover.sections) place(s.panel, 270, 110, 960, 590);
}

// The narrow layout: the rail runs across the top, the page below it.
function layOutNarrow(discover) {
  const [power, conditions] = discover.sections;
  place(discover.el.querySelector('.btn-back'), 16, 20, 90, 44);
  place(power.tab, 16, 110, 230, 40);
  place(conditions.tab, 250, 110, 230, 40);
  for (const s of discover.sections) place(s.panel, 16, 170, 468, 600);
}

function layOutHome(home) {
  home.el.querySelectorAll('.home-action').forEach((b, i) => place(b, 80, 370 + i * 60, 320, 52));
}

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const selected = (discover) => discover.sections.filter((s) => s.tab.getAttribute('aria-selected') === 'true').map((s) => s.id);

// ---- Registration ---------------------------------------------------------------

test('Discover is a registered screen with its own labelled section', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const section = html.match(/<section[^>]*data-screen="discover"[^>]*>/)?.[0];
  assert.ok(section, 'index.html has the Discover section');
  assert.match(section, /aria-label="Discover"/);
  assert.match(section, /class="screen screen--menu screen--discover"/);
  assert.match(section, /\bhidden\b/);

  const app = readFileSync(new URL('../js/core/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ DiscoverScreen \} from '\.\.\/screens\/discover-screen\.js';/);
  assert.match(app, /s\.register\(new DiscoverScreen\(this\)\);/);

  const { discover, app: fake } = boot();
  assert.equal(discover.id, 'discover');
  assert.equal(fake.screens.get('discover'), discover);
  assert.equal(discover.el, sections.get('discover'));
  assert.equal(discover.navigable, true);
  assert.equal(discover.el.hidden, true, 'hidden until opened');
});

// ---- Home ⇄ Discover ------------------------------------------------------------

test('Home → Discover opens on Power; Back returns Home', () => {
  const { app, home, discover } = boot();
  const button = home.el.querySelectorAll('.home-action')[2];
  assert.ok(button.html.includes('<span>Discover</span>'));
  button.click();
  assert.equal(app.screens.current, discover);
  assert.equal(discover.el.hidden, false);
  assert.equal(home.el.hidden, true);
  assert.equal(document.documentElement.dataset.screen, 'discover');
  assert.deepEqual(selected(discover), ['power']);
  assert.equal(document.activeElement, discover.sections[0].tab, 'focus starts on Power');

  // The header's Back button, with Alva's back icon and a meaningful name.
  const back = discover.el.querySelector('.btn-back');
  assert.equal(back.getAttribute('aria-label'), 'Back');
  assert.equal(back.hasAttribute('data-nav'), true);
  back.click();
  assert.equal(app.screens.current, home);
  assert.equal(discover.el.hidden, true);
  assert.equal(discover.el.inert, true);
  assert.ok(document.activeElement.html.includes('<span>Play</span>'), 'Home focuses Play (its default) again');
});

test('Esc, Backspace and gamepad Back leave Discover for Home', () => {
  for (const code of ['Escape', 'Backspace', 'KeyK']) {
    const { app, home, discover } = boot();
    home.el.querySelectorAll('.home-action')[2].click();
    assert.equal(app.screens.current, discover);
    app.input.key(code);
    assert.equal(app.screens.current, home, code);
  }
  const { app, home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  app.nav.command('back', null); // what onPadMenu sends for B / Circle
  assert.equal(app.screens.current, home);
  assert.equal(discover.el.hidden, true);
});

test('every visit opens on Power, whatever the last one left open', () => {
  const { app, home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  discover.sections[1].tab.click();
  assert.deepEqual(selected(discover), ['conditions']);
  app.screens.back();
  home.el.querySelectorAll('.home-action')[2].click();
  assert.deepEqual(selected(discover), ['power']);
  assert.equal(discover.sections[0].panel.hidden, false);
  assert.equal(discover.sections[1].panel.hidden, true);
});

// ---- Tabs -----------------------------------------------------------------------

test('Power and Conditions are real, labelled tabs; Power is selected by default', () => {
  const { app, home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const rail = discover.el.querySelector('.discover-rail');
  assert.equal(rail.getAttribute('role'), 'tablist');
  assert.equal(rail.getAttribute('aria-label'), 'Discover sections');
  assert.equal(rail.getAttribute('aria-orientation'), 'vertical');
  assert.deepEqual(rail.children, discover.sections.map((s) => s.tab), 'Power first, then Conditions');
  assert.deepEqual(discover.sections.map((s) => [s.id, s.tab.textContent]), [['power', 'Power'], ['conditions', 'Conditions']]);

  for (const { id, tab, panel } of discover.sections) {
    assert.equal(tab.tagName, 'BUTTON');
    assert.equal(tab.getAttribute('type'), 'button');
    assert.equal(tab.getAttribute('role'), 'tab');
    assert.equal(tab.hasAttribute('data-nav'), true, 'reached by keyboard / gamepad');
    assert.equal(tab.hasAttribute('data-nav-no-hover-focus'), true, 'mouse hover is only a preview');
    assert.equal(tab.getAttribute('aria-controls'), panel.id);
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    assert.equal(panel.getAttribute('tabindex'), '0');
    assert.equal(panel.id, `discover-panel-${id}`);
  }
  const [power, conditions] = discover.sections;
  assert.equal(power.tab.getAttribute('aria-selected'), 'true');
  assert.equal(power.tab.classList.contains('is-active'), true);
  assert.equal(power.tab.getAttribute('tabindex'), '0');
  assert.equal(power.panel.hidden, false);
  assert.equal(conditions.tab.getAttribute('aria-selected'), 'false');
  assert.equal(conditions.tab.classList.contains('is-active'), false);
  assert.equal(conditions.tab.getAttribute('tabindex'), '-1', 'roving tabindex');
  assert.equal(conditions.panel.hidden, true);
  assert.deepEqual(app.nav.candidates(discover.el).filter((c) => c.getAttribute('role') === 'tabpanel'), [power.panel]);
});

test('Conditions is selectable by click and by focus; the hidden page takes no focus', () => {
  const { app, home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const [power, conditions] = discover.sections;

  conditions.tab.click();
  assert.deepEqual(selected(discover), ['conditions']);
  assert.equal(conditions.tab.getAttribute('tabindex'), '0');
  assert.equal(power.tab.getAttribute('tabindex'), '-1');
  assert.equal(conditions.panel.hidden, false);
  assert.equal(power.panel.hidden, true);
  const candidates = app.nav.candidates(discover.el);
  assert.ok(!candidates.includes(power.panel), 'the hidden Power page is out of navigation');
  assert.ok(candidates.includes(conditions.panel));
  const before = document.activeElement;
  power.panel.focus();
  assert.equal(document.activeElement, before, 'the hidden Power page cannot take focus');

  // Keyboard / gamepad focus selects (automatic activation).
  power.tab.focus();
  assert.deepEqual(selected(discover), ['power']);
  assert.equal(power.panel.hidden, false);
  assert.equal(conditions.panel.hidden, true);
});

// ---- Power ------------------------------------------------------------------------

test('the Power page explains Jump Power and lists its three tiers from the tier table', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const page = discover.sections[0].panel;
  assert.equal(text(page.querySelector('.discover-page-title')), 'Power');
  const entries = page.querySelectorAll('.discover-entry');
  assert.equal(entries.length, POWERS.length, 'one entry per Power');
  const [jump] = entries;
  const title = jump.querySelector('.discover-entry-title');
  assert.equal(title.tagName, 'H3');
  assert.equal(text(title), 'Jump Power', 'shown uppercase as JUMP POWER by CSS');
  assert.equal(jump.getAttribute('aria-labelledby'), title.id);
  assert.equal(text(jump.querySelector('.discover-entry-text')),
    'Controls how high a fighter’s normal jump goes. Higher tiers jump higher.');

  const list = jump.querySelector('.discover-tiers');
  assert.equal(list.tagName, 'OL');
  assert.equal(list.getAttribute('aria-label'), 'Jump Power tiers');
  const rows = list.querySelectorAll('.discover-tier');
  assert.deepEqual(rows.map((r) => [text(r.querySelector('.discover-tier-name')), text(r.querySelector('.discover-tier-desc'))]), [
    ['Jump Power 1', 'Very low jump.'],
    ['Jump Power 2', 'Normal jump.'],
    ['Jump Power 3', 'Slightly higher jump.'],
  ]);
  assert.deepEqual(rows.map((r) => [r.dataset.tier, text(r.querySelector('.discover-tier-name'))]),
    JUMP_POWER_TIERS.map((t) => [String(t.tier), t.name]), 'straight from JUMP_POWER_TIERS');
  // The meter is decoration: n rising bars, the first `tier` filled.
  rows.forEach((row, i) => {
    const meter = row.querySelector('.discover-meter');
    assert.equal(meter.getAttribute('aria-hidden'), 'true');
    assert.equal(meter.children.length, 3);
    assert.equal(meter.children.filter((b) => b.classList.contains('is-on')).length, i + 1);
  });

  // A reference for players: no physics constants, and nothing interactive
  // inside the page itself.
  for (const n of ['650', '920', '1000']) assert.ok(!text(page).includes(n), `no raw ${n}`);
  assert.deepEqual(page.querySelectorAll('button').concat(page.querySelectorAll('[data-nav]')), []);
});

test('#0001 is identified with Jump Power 2, and only there', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const page = discover.sections[0].panel;
  const rows = page.querySelectorAll('.discover-tier');
  assert.deepEqual(rows.map((r) => r.classList.contains('is-used')), [false, true, false]);
  assert.deepEqual(rows.map((r) => r.querySelector('.discover-tier-users') && text(r.querySelector('.discover-tier-users'))), [
    null, 'Used by #0001', null,
  ]);
  // Not by colour alone: the row says so in words, beside a check mark.
  assert.ok(rows[1].querySelector('.discover-tier-check').html.includes('<svg'));

  const owners = page.querySelector('.discover-owners');
  assert.equal(text(owners.querySelector('.discover-label')), 'Fighters');
  const list = owners.querySelector('dl');
  assert.deepEqual(list.children.map((c) => [c.tagName, text(c)]), [['DT', '#0001'], ['DD', 'Jump Power 2']]);
});

test('the Power page follows the data: a fighter declaring another tier shows up under it', () => {
  const extra = { ...CHARACTERS[0], id: '9998', displayName: '#9998', rosterSlot: 7, available: true, powers: { jump: 3 } };
  CHARACTERS.push(extra);
  try {
    const { home, discover } = boot();
    home.el.querySelectorAll('.home-action')[2].click();
    const page = discover.sections[0].panel;
    const rows = page.querySelectorAll('.discover-tier');
    assert.deepEqual(rows.map((r) => r.querySelector('.discover-tier-users') && text(r.querySelector('.discover-tier-users'))), [
      null, 'Used by #0001', 'Used by #9998',
    ]);
    assert.deepEqual(page.querySelector('dl').children.map(text), ['#0001', 'Jump Power 2', '#9998', 'Jump Power 3']);
  } finally {
    CHARACTERS.splice(CHARACTERS.indexOf(extra), 1);
  }
});

// ---- Conditions ---------------------------------------------------------------

test('Conditions is intentionally empty: no cards, placeholder or invented copy', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const conditions = discover.sections[1];
  conditions.tab.click();
  assert.equal(conditions.panel.hidden, false);
  assert.deepEqual(conditions.panel.children, []);
  assert.equal(conditions.panel.textContent, '');
  assert.equal(conditions.panel.innerHTML, '');
  const source = readFileSync(new URL('../js/screens/discover-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /coming soon/i);
  assert.doesNotMatch(text(discover.el), /coming soon|placeholder|tbd/i);
});

// ---- Keyboard / gamepad navigation --------------------------------------------

test('keyboard and gamepad reach Discover from Home and every control on it (wide layout)', () => {
  const { app, home, discover, plays } = boot();
  layOutHome(home);
  layOutWide(discover);
  const [power, conditions] = discover.sections;
  const back = discover.el.querySelector('.btn-back');

  // Home: Play → Practice Ground → Discover, then confirm (J / A).
  app.input.key('ArrowDown');
  app.input.key('ArrowDown');
  assert.ok(document.activeElement.html.includes('<span>Discover</span>'));
  app.input.key('KeyJ');
  assert.equal(app.screens.current, discover);
  assert.equal(document.activeElement, power.tab);

  app.input.key('ArrowDown');
  assert.equal(document.activeElement, conditions.tab);
  assert.deepEqual(selected(discover), ['conditions']);
  app.input.key('ArrowUp');
  assert.equal(document.activeElement, power.tab);
  assert.deepEqual(selected(discover), ['power']);

  // Into the page and back: leaving toward the rail lands on the open tab,
  // never on Conditions, so the page never switches underneath.
  app.nav.command('right', null);
  assert.equal(document.activeElement, power.panel);
  app.nav.command('left', null);
  assert.equal(document.activeElement, power.tab);
  assert.deepEqual(selected(discover), ['power']);
  app.nav.command('right', null);
  app.nav.command('up', null);
  assert.equal(document.activeElement, power.tab);

  app.input.key('ArrowUp');
  assert.equal(document.activeElement, back);
  app.input.key('ArrowDown');
  assert.equal(document.activeElement, power.tab);
  assert.ok(plays.includes('move'));

  // Confirm on Back goes Home.
  app.input.key('ArrowUp');
  app.input.key('KeyJ');
  assert.equal(app.screens.current, home);
});

test('↑ / ↓ scroll a long page while it can scroll, then move on', () => {
  const { app, home, discover } = boot();
  layOutWide(discover);
  home.el.querySelectorAll('.home-action')[2].click();
  const [power] = discover.sections;
  Object.assign(power.panel, { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

  app.nav.command('right', null);
  assert.equal(document.activeElement, power.panel);
  app.input.key('ArrowDown');
  assert.equal(document.activeElement, power.panel);
  assert.equal(power.panel.scrollTop, 160);
  for (let i = 0; i < 5; i++) app.input.key('ArrowDown');
  assert.equal(power.panel.scrollTop, 600, 'stops at the end');
  assert.equal(document.activeElement, power.panel, 'nothing below: focus stays');
  for (let i = 0; i < 4; i++) app.input.key('ArrowUp');
  assert.equal(power.panel.scrollTop, 0);
  assert.equal(document.activeElement, power.panel);
  app.input.key('ArrowUp');
  assert.equal(document.activeElement, power.tab, 'at the top, ↑ leaves for the open tab');
});

test('narrow layout: the rail runs across the top and arrows follow it', () => {
  window.matchMedia = () => ({ matches: true, addEventListener: noop });
  try {
    const { app, home, discover } = boot();
    layOutNarrow(discover);
    home.el.querySelectorAll('.home-action')[2].click();
    assert.equal(discover.el.querySelector('.discover-rail').getAttribute('aria-orientation'), 'horizontal');
    const [power, conditions] = discover.sections;
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, conditions.tab);
    assert.deepEqual(selected(discover), ['conditions']);
    app.input.key('ArrowLeft');
    assert.equal(document.activeElement, power.tab);
    app.input.key('ArrowDown');
    assert.equal(document.activeElement, power.panel);
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, power.tab);
    app.input.key('ArrowUp');
    assert.equal(document.activeElement, discover.el.querySelector('.btn-back'));
  } finally {
    window.matchMedia = () => ({ matches: false, addEventListener: noop });
  }
});
