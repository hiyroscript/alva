// Run with node --test tests/discover.test.mjs (no dependencies).
// Discover: its registration, Home → Discover → Back through the real
// ScreenManager, the Power / Launch / Passives tabs, the Power page built
// from the Power registry alone (Jump Power and Speed Power), the Launch page
// built from the launch registry alone (Launch Point, the Base Launch values
// 0-3 and their formula, and every Directional Launch), both with no tuning
// numbers and no fighter, attack or character information of any kind, the
// intentionally empty Passives page, and
// keyboard / gamepad menu navigation through the real MenuNavigator, on a
// minimal fake DOM. Layout and paint still need real-browser verification.
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
const {
  BASE_LAUNCH_VALUES, BASE_LAUNCH_DESCRIPTIONS, BASE_LAUNCH_SUMMARY, LAUNCH_FORMULA, LAUNCH_POINT_SUMMARY,
  DIRECTIONAL_LAUNCHES, DIRECTIONAL_LAUNCH_SUMMARY,
} = await import('../js/data/launch.js');
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
  place(discover.el.querySelector('.btn-back'), 40, 20, 90, 44);
  discover.sections.forEach((s, i) => place(s.tab, 40, 110 + i * 48, 180, 44));
  for (const s of discover.sections) place(s.panel, 270, 110, 960, 590);
}

// The narrow layout: the rail runs across the top, the page below it.
function layOutNarrow(discover) {
  place(discover.el.querySelector('.btn-back'), 16, 20, 90, 44);
  discover.sections.forEach((s, i) => place(s.tab, 16 + i * 156, 110, 152, 40));
  for (const s of discover.sections) place(s.panel, 16, 170, 468, 600);
}

function layOutHome(home) {
  home.el.querySelectorAll('.home-action').forEach((b, i) => place(b, 80, 370 + i * 60, 320, 52));
}

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
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
  const { power, launch, passives } = sectionsOf(discover);
  for (const last of [launch, passives]) {
    home.el.querySelectorAll('.home-action')[2].click();
    last.tab.click();
    assert.deepEqual(selected(discover), [last.id]);
    app.screens.back();
    home.el.querySelectorAll('.home-action')[2].click();
    assert.deepEqual(selected(discover), ['power']);
    assert.equal(power.panel.hidden, false);
    assert.equal(launch.panel.hidden, true);
    assert.equal(passives.panel.hidden, true);
    app.screens.back();
  }
});

// ---- Tabs -----------------------------------------------------------------------

test('Power, Launch and Passives are real, labelled tabs; Power is selected by default', () => {
  const { app, home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const rail = discover.el.querySelector('.discover-rail');
  assert.equal(rail.getAttribute('role'), 'tablist');
  assert.equal(rail.getAttribute('aria-label'), 'Discover sections');
  assert.equal(rail.getAttribute('aria-orientation'), 'vertical');
  assert.deepEqual(rail.children, discover.sections.map((s) => s.tab), 'Power, then Launch, then Passives');
  assert.deepEqual(discover.sections.map((s) => [s.id, s.tab.textContent]), [
    ['power', 'Power'], ['launch', 'Launch'], ['passives', 'Passives'],
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
    assert.equal(panel.getAttribute('tabindex'), '0');
    assert.equal(panel.id, `discover-panel-${id}`);
    assert.equal(tab.id, `discover-tab-${id}`);
  }
  // The third section was Conditions: renamed through and through, no id
  // or label of it left.
  assert.doesNotMatch(text(discover.el), /condition/i);
  for (const { id, tab, panel } of discover.sections) {
    for (const s of [id, tab.id, panel.id, tab.getAttribute('aria-controls'), tab.textContent]) {
      assert.doesNotMatch(s, /condition/i, s);
    }
  }
  const { power, launch, passives } = sectionsOf(discover);
  assert.equal(power.tab.getAttribute('aria-selected'), 'true');
  assert.equal(power.tab.classList.contains('is-active'), true);
  assert.equal(power.tab.getAttribute('tabindex'), '0');
  assert.equal(power.panel.hidden, false);
  for (const other of [launch, passives]) {
    assert.equal(other.tab.getAttribute('aria-selected'), 'false');
    assert.equal(other.tab.classList.contains('is-active'), false);
    assert.equal(other.tab.getAttribute('tabindex'), '-1', 'roving tabindex');
    assert.equal(other.panel.hidden, true);
  }
  assert.deepEqual(app.nav.candidates(discover.el).filter((c) => c.getAttribute('role') === 'tabpanel'), [power.panel]);
});

test('Launch and Passives are selectable by click and by focus; a hidden page takes no focus', () => {
  const { app, home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const { power, launch, passives } = sectionsOf(discover);

  launch.tab.click();
  assert.deepEqual(selected(discover), ['launch']);
  assert.equal(launch.tab.getAttribute('tabindex'), '0');
  assert.equal(launch.panel.hidden, false);
  assert.equal(power.panel.hidden, true);
  assert.equal(passives.panel.hidden, true);

  passives.tab.click();
  assert.deepEqual(selected(discover), ['passives']);
  assert.equal(passives.tab.getAttribute('tabindex'), '0');
  assert.equal(power.tab.getAttribute('tabindex'), '-1');
  assert.equal(passives.panel.hidden, false);
  assert.equal(power.panel.hidden, true);
  const candidates = app.nav.candidates(discover.el);
  assert.ok(!candidates.includes(power.panel), 'the hidden Power page is out of navigation');
  assert.ok(candidates.includes(passives.panel));
  const before = document.activeElement;
  power.panel.focus();
  assert.equal(document.activeElement, before, 'the hidden Power page cannot take focus');

  // Keyboard / gamepad focus selects (automatic activation).
  launch.tab.focus();
  assert.deepEqual(selected(discover), ['launch']);
  assert.equal(launch.panel.hidden, false);
  assert.equal(passives.panel.hidden, true);
  power.tab.focus();
  assert.deepEqual(selected(discover), ['power']);
  assert.equal(power.panel.hidden, false);
  assert.equal(launch.panel.hidden, true);
  assert.equal(passives.panel.hidden, true);
});

// ---- Power ------------------------------------------------------------------------

test('the Power page lists every registry Power, in order, each with its three tiers: Jump Power and Speed Power only', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const page = discover.sections[0].panel;
  assert.equal(text(page.querySelector('.discover-page-title')), 'Power');
  const entries = page.querySelectorAll('.discover-entry');
  assert.equal(entries.length, POWERS.length, 'one entry per Power');
  assert.deepEqual(entries.map((e) => text(e.querySelector('.discover-entry-title'))), [
    'Jump Power', 'Speed Power',
  ], 'shown uppercase by CSS');
  assert.deepEqual(entries.map((e) => text(e.querySelector('.discover-entry-text'))), [
    'Controls how high a normal jump goes. Higher tiers jump higher.',
    'Controls maximum movement speed. Higher tiers move faster.',
  ]);
  assert.doesNotMatch(everything(page), /launch|knockback/i, 'Launch is not a Power');

  entries.forEach((entry, i) => {
    const power = POWERS[i];
    const title = entry.querySelector('.discover-entry-title');
    assert.equal(title.tagName, 'H3');
    assert.equal(entry.getAttribute('aria-labelledby'), title.id);
    assert.equal(text(title), power.name);
    assert.equal(text(entry.querySelector('.discover-entry-text')), power.summary);

    const list = entry.querySelector('.discover-tiers');
    assert.equal(list.tagName, 'OL');
    assert.equal(list.getAttribute('aria-label'), `${power.name} tiers`);
    const rows = list.querySelectorAll('.discover-tier');
    assert.equal(rows.length, 3, `${power.name}: exactly three tiers`);
    assert.deepEqual(rows.map((r) => [r.dataset.tier, text(r.querySelector('.discover-tier-name')), text(r.querySelector('.discover-tier-desc'))]),
      power.tiers.map((t) => [String(t.tier), t.name, t.description]), `${power.name}: straight from its tier table`);
    // Every row the same: nothing singled out.
    assert.ok(rows.every((r) => r.className === 'discover-tier'), `${power.name}: no row is marked`);
    // The meter is decoration: n rising bars, the first `tier` filled.
    rows.forEach((row, j) => {
      const meter = row.querySelector('.discover-meter');
      assert.equal(meter.getAttribute('aria-hidden'), 'true');
      assert.equal(meter.children.length, 3);
      assert.equal(meter.children.filter((b) => b.classList.contains('is-on')).length, j + 1);
    });
  });

  // The Jump Power rows, spelled out.
  assert.deepEqual(entries[0].querySelectorAll('.discover-tier').map((r) => [text(r.querySelector('.discover-tier-name')), text(r.querySelector('.discover-tier-desc'))]), [
    ['Jump Power 1', 'Very low jump.'],
    ['Jump Power 2', 'Normal jump.'],
    ['Jump Power 3', 'Slightly higher jump.'],
  ]);
  assert.deepEqual(entries[0].querySelectorAll('.discover-tier').map((r) => r.dataset.tier), JUMP_POWER_TIERS.map((t) => String(t.tier)));
});

test('the Power page shows no tuning numbers and nothing interactive', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const page = discover.sections[0].panel;
  const numbers = new Set(POWERS.flatMap((p) => p.tiers.flatMap((t) => Object.values(t).filter((v) => typeof v === 'number' && v > 3))));
  assert.deepEqual([...numbers].sort((a, b) => a - b), [270, 330, 360, 650, 920, 1000]);
  for (const n of numbers) assert.ok(!everything(page).includes(String(n)), `no raw ${n}`);
  assert.deepEqual(page.querySelectorAll('button').concat(page.querySelectorAll('[data-nav]')), []);
});

// ---- Launch ---------------------------------------------------------------------

test('the Launch page explains Launch Point, then Base Launch 0-3 and its formula, then every Directional Launch', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
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

  // Launch Point: starts at 0, grows with damage, launches harder, resets.
  const lp = text(entries[0]);
  assert.match(lp, /starts at 0/);
  assert.match(lp, /damage taken is added/);
  assert.match(lp, /the higher it is, the harder the launch/);
  assert.match(lp, /resets to 0/);
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
  // Not a Power: no Power wording or tiers here.
  assert.doesNotMatch(text(page), /\bPower\b|\btiers?\b/i);
});

test('the Launch page carries none of the old Knockback system: no Low / Mid / High, growth or accumulated Knockback', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
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

test('the Launch page shows no tuning numbers, no fighter or attack, and nothing interactive', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const { launch } = sectionsOf(discover);
  launch.tab.click();
  const page = launch.panel;
  // The only numbers are the Base Launch values themselves.
  assert.doesNotMatch(text(page), /[4-9]|\d{2,}/, 'no velocities or other tuning values');
  assert.doesNotMatch(everything(page), /#0001|\bBA\d|Basic Attack|mid-?air|Throw|shuriken|Sphere|Rush|clone/i, 'no fighter or attack is named');
  assert.deepEqual(page.querySelectorAll('button').concat(page.querySelectorAll('[data-nav]')), []);
});

test('Discover names no fighter: no roster, ownership or character data anywhere', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const names = CHARACTERS.filter((c) => c.available).map((c) => c.displayName);
  assert.ok(names.includes('#0001'));
  for (const section of discover.sections) {
    section.tab.click();
    // Visible text, attributes (hidden accessible names included) and markup.
    const all = everything(discover.el);
    for (const name of names) assert.ok(!all.includes(name), `${section.id}: no ${name}`);
    assert.doesNotMatch(all, /#\d{4}/, `${section.id}: no character id`);
    assert.doesNotMatch(all, /\bFighters?\b|Used by|\broster\b/i, `${section.id}: no ownership labels`);
  }
  const page = discover.sections[0].panel;
  for (const gone of ['.discover-owners', '.discover-tier-users', '.discover-tier-check', '.is-used', 'dl']) {
    assert.deepEqual(page.querySelectorAll(gone), [], `no ${gone}`);
  }

  // Structurally: the screen builds its Power content from the Power
  // registry and its Launch content from the launch registry alone, never
  // from the roster or any attack.
  const source = readFileSync(new URL('../js/screens/discover-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /characters\.js|\bCHARACTERS\b|getCharacter\b/);
  assert.doesNotMatch(source, /getFighterPowerTier|fighterTiers|displayName|\.powers\b|\.attacks\b|\.baseLaunch\b|\.directionalLaunch\b/);
  assert.doesNotMatch(source, /knockback/i, 'no trace of the old Knockback page');
  assert.doesNotMatch(source, /'Fighters'|Used by|is-used/);
  assert.match(source, /import \{ POWERS \} from '\.\.\/data\/powers\.js';/);
  assert.match(source, /\bBASE_LAUNCH_VALUES\b[^;]*\bDIRECTIONAL_LAUNCHES\b[^;]*\} from '\.\.\/data\/launch\.js';/);
  // And the ownership styles are gone with it.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.discover-(owners|tier-users|tier-check|label)\b|\.discover-tier\.is-used/);
});

test('the Power and Launch pages stay the same as the roster grows', () => {
  const render = () => {
    const { home, discover } = boot();
    home.el.querySelectorAll('.home-action')[2].click();
    const { power, launch } = sectionsOf(discover);
    return everything(power.panel) + everything(launch.panel);
  };
  const before = render();
  const extra = {
    ...CHARACTERS[0], id: '9998', displayName: '#9998', rosterSlot: 7, available: true, powers: { jump: 3, speed: 1 },
    attacks: { ...CHARACTERS[0].attacks, ba1: { ...CHARACTERS[0].attacks.ba1, baseLaunch: 3, directionalLaunch: 'vertical' } },
  };
  CHARACTERS.push(extra);
  try {
    const after = render();
    assert.equal(after, before, 'another fighter, on other tiers and launches, changes nothing');
    assert.ok(!after.includes('#9998'));
  } finally {
    CHARACTERS.splice(CHARACTERS.indexOf(extra), 1);
  }
});

// ---- Passives -----------------------------------------------------------------

test('Passives is intentionally empty: no cards, placeholder or invented copy', () => {
  const { home, discover } = boot();
  home.el.querySelectorAll('.home-action')[2].click();
  const { passives } = sectionsOf(discover);
  passives.tab.click();
  assert.equal(passives.panel.hidden, false);
  assert.deepEqual(passives.panel.children, []);
  assert.equal(passives.panel.textContent, '');
  assert.equal(passives.panel.innerHTML, '');
  const source = readFileSync(new URL('../js/screens/discover-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /coming soon/i);
  assert.doesNotMatch(text(discover.el), /coming soon|placeholder|tbd/i);
});

// ---- Keyboard / gamepad navigation --------------------------------------------

test('keyboard and gamepad reach Discover from Home and every control on it (wide layout)', () => {
  const { app, home, discover, plays } = boot();
  layOutHome(home);
  layOutWide(discover);
  const { power, launch, passives } = sectionsOf(discover);
  const back = discover.el.querySelector('.btn-back');

  // Home: Play → Practice Ground → Discover, then confirm (J / A).
  app.input.key('ArrowDown');
  app.input.key('ArrowDown');
  assert.ok(document.activeElement.html.includes('<span>Discover</span>'));
  app.input.key('KeyJ');
  assert.equal(app.screens.current, discover);
  assert.equal(document.activeElement, power.tab);

  app.input.key('ArrowDown');
  assert.equal(document.activeElement, launch.tab);
  assert.deepEqual(selected(discover), ['launch']);
  app.input.key('ArrowDown');
  assert.equal(document.activeElement, passives.tab);
  assert.deepEqual(selected(discover), ['passives']);
  app.input.key('ArrowUp');
  assert.equal(document.activeElement, launch.tab);
  assert.deepEqual(selected(discover), ['launch']);

  // Into the Launch page and back: leaving toward the rail lands on the
  // open tab, never on another one, so the page never switches underneath.
  app.nav.command('right', null);
  assert.equal(document.activeElement, launch.panel);
  app.nav.command('left', null);
  assert.equal(document.activeElement, launch.tab);
  assert.deepEqual(selected(discover), ['launch']);
  app.input.key('ArrowUp');
  assert.equal(document.activeElement, power.tab);
  assert.deepEqual(selected(discover), ['power']);

  // Into the page and back: leaving toward the rail lands on the open tab,
  // never on Launch, so the page never switches underneath.
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
    const { power, launch, passives } = sectionsOf(discover);
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, launch.tab);
    assert.deepEqual(selected(discover), ['launch']);
    app.input.key('ArrowRight');
    assert.equal(document.activeElement, passives.tab);
    assert.deepEqual(selected(discover), ['passives']);
    app.input.key('ArrowLeft');
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
