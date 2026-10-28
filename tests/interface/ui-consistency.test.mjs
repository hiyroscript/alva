// Run with node --test tests/interface/ui-consistency.test.mjs (no dependencies).
// The interface's shared contracts, everywhere at once: sentence case in
// every label (English and French; ALVA, CPU, P1 and the round banners
// excepted) with no case transform in the stylesheet; hover only for a real
// pointer (or the controller cursor) and the focus ring only for keyboard
// and controller navigation, kept apart by the input modality; one glass
// and one dim for every dialog; the Home Play button's 3 px corners on every
// rectangular menu control; and the dialog stack (each dialog opened over
// another above it, only the top one live, focus back where it belongs).
// Real modules on a minimal fake DOM: paint and computed styles still need
// a real browser (docs/development/testing.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stylesheet } from '../helpers/stylesheet.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

// ---- Fake DOM ------------------------------------------------------------------

const noop = () => {};
class Element {
  children = [];
  parentNode = null;
  attrs = new Map();
  listeners = new Map();
  style = {};
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  rect = { left: 0, top: 0, width: 40, height: 40 };
  constructor(tag = 'div') {
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
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } return this; }
  setAttribute(name, value) {
    if (['hidden', 'disabled', 'inert'].includes(name)) this[name] = true;
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (['hidden', 'disabled', 'inert'].includes(name)) return this[name] ? '' : null;
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
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
    const walk = (n) => n.children.forEach((c) => { if (c.matches(selector)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() { return this.rect; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
  }
  blur() { if (document.activeElement === this) document.activeElement = document.body; }
  click() {}
  scrollIntoView() {}
}

const docListeners = new Map();
const body = new Element('body');
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: noop };
globalThis.document = {
  body,
  activeElement: body,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  addEventListener: (type, fn) => { if (!docListeners.has(type)) docListeners.set(type, []); docListeners.get(type).push(fn); },
  elementFromPoint: () => null,
};
const fire = (type, event) => { for (const fn of docListeners.get(type) ?? []) fn(event); };
const html = document.documentElement;

const { MenuNavigator, LAYER_BASE } = await import('../../js/core/menu-navigator.js');
const { EN } = await import('../../js/localization/strings/en.js');
const { FR } = await import('../../js/localization/strings/fr.js');

// A navigator over one navigable screen, with the input hooks it listens to.
function navigator() {
  docListeners.clear();
  document.activeElement = body;
  const hooks = {};
  const screen = { el: new Element('section'), navigable: true, onCommand: () => false, onBack: noop };
  const app = {
    input: {
      onKey: (fn) => { hooks.key = fn; },
      onPadMenu: (fn) => { hooks.pad = fn; },
      onPadCursor: (fn) => { hooks.cursor = fn; },
    },
    screens: { current: screen },
    audio: { play: noop },
  };
  const nav = new MenuNavigator(app);
  return { nav, app, screen, hooks };
}

// A top-level dialog overlay with one default button.
function dialog() {
  const root = new Element('div');
  const button = new Element('button');
  button.setAttribute('data-nav', '');
  button.setAttribute('data-nav-default', '');
  root.append(button);
  body.append(root);
  return { root, button, scope: { el: root, onBack: noop } };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---- 1. Capitalization -----------------------------------------------------------

// Labels the interface shows as they are written: the brand, the CPU and
// Player 1's tag, the round banners and the final announcement (READY,
// ROUND 1, FIGHT, VICTORY!...), and the Match Results' heading and outcome
// lines (MATCH RESULTS, TEAM I — WINNER...), announced like the banners.
const UPPERCASE_ALLOWED = (key, value) =>
  key.startsWith('banner.') || key === 'results.title' || key.startsWith('results.line.')
  || ['brand.title', 'slot.p1', 'slot.cpu', 'slot.cpu1', 'slot.cpu2', 'step.opponent'].includes(key)
  || /^(ALVA|CPU( \d| \{n\})?|P1|J1)$/.test(value);

test('no ordinary interface string is written in capitals, in English or French: only ALVA, CPU, P1 and the round banners', () => {
  for (const [name, strings] of [['en', EN], ['fr', FR]]) {
    for (const [key, value] of Object.entries(strings)) {
      if (typeof value !== 'string' || UPPERCASE_ALLOWED(key, value)) continue;
      const letters = value.replace(/\{[^}]*\}/g, '').replace(/[^\p{L}]/gu, '');
      if (letters.length < 2) continue;
      assert.notEqual(letters, letters.toUpperCase(), `${name} ${key}: "${value}"`);
    }
  }
  for (const key of ['banner.ready', 'banner.round', 'banner.fight', 'banner.overtime', 'banner.victory', 'banner.defeat', 'banner.game',
    'results.title', 'results.line.p1.winner', 'results.line.draw']) {
    const caps = (value) => value.replace(/\{[^}]*\}/g, '');
    assert.equal(caps(EN[key]), caps(EN[key]).toUpperCase(), `${key} keeps its announcement capitals`);
    assert.equal(caps(FR[key]), caps(FR[key]).toUpperCase(), `${key} keeps its announcement capitals in French`);
  }
  assert.equal(EN['brand.title'], 'ALVA');
  assert.equal(EN['slot.p1'], 'P1');
  assert.equal(EN['slot.cpu'], 'CPU');
  // The HUD's round line is an ordinary label, not the banner.
  assert.equal(EN['hud.round'], 'Round {n}');
  assert.equal(EN['hud.overtime'], 'Overtime');
  assert.equal(FR['hud.overtime'], 'Prolongation');
  assert.equal(EN['abilityHud.holdShort'], 'Hold');
});

test('menu labels, titles and buttons are in sentence case', () => {
  const expected = {
    'map.stages': 'Stages', 'roster.panel': 'Roster', 'character.title': 'Select fighter', 'result.changeStage': 'Change stage',
    'practice.changeFighter': 'Change fighter', 'practice.changeCpu': 'Change CPU', 'pause.restart': 'Restart battle',
    'pause.home': 'Return to home', 'confirmHome.title': 'Return to home?', 'confirmHome.cancel': 'Keep playing',
    'map.random': 'Random stage', 'setup.quickBattle': 'Quick battle', 'setup.watch': 'Watch mode',
    'practice.title': 'Practice ground', 'home.watch': 'Watch mode', 'home.practice': 'Practice ground',
    'team.p1': 'Team I', 'team.p2': 'Team II', 'toast.view': 'View match results', 'results.changeFighters': 'Change fighters',
    'results.home': 'Return to home screen', 'stats.damageDealt': 'Total damage dealt',
    'mode.title': 'Select mode', 'difficulty.title': 'Select difficulty', 'map.title': 'Select stage',
    'quickPlay.custom.name': 'Custom play', 'quickPlay.regular.name': 'Regular play', 'howToPlay.title': 'How to play',
    'install.add': 'Add to home screen', 'install.notNow': 'Not now', 'install.gotIt': 'Got it', 'control.extra_attack': 'Extra attack',
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(EN[key], value, key);
  // Names whose capitals are part of them stay: game terms, devices,
  // fighters' own ability names, product names. Any other word after the
  // first in a short label is lowercase.
  const PROPER = new Set(['Alva', 'ALVA', 'CPU', 'Player', 'Launch', 'Point', 'Base', 'Directional', 'Void', 'Shield',
    'Deflect', 'Dash', 'Energy', 'Attack', 'PlayStation', 'Xbox', 'Nintendo', 'Bluetooth', 'Safari', 'Chrome', 'Edge',
    'Firefox', 'Enter', 'Esc', 'A', 'D-pad', 'Run', 'Discover', 'Settings', 'Quick', 'Watch', 'Practice', 'Custom',
    'Regular', 'Combat', 'Mobile', 'Controls', 'Movement', 'Launch', 'Fighters', 'Up', 'Down', 'Page',
    // The Mash Combo, a game term like the Shield or the Dash.
    'Mash', 'Combo',
    // The teams' Roman numerals (Team I, Team II), and game terms counted in
    // the Match Results (Perfect Shields, Successful Deflects).
    'I', 'II', 'Shields', 'Deflects']);
  for (const [key, value] of Object.entries(EN)) {
    if (typeof value !== 'string' || UPPERCASE_ALLOWED(key, value) || key.startsWith('ability.') || key.startsWith('credits.')) continue;
    if (/[.!?…:]/.test(value) || value.split(' ').length > 5) continue; // sentences and prose
    const later = value.replace(/\{[^}]*\}/g, '').split(/\s+/).slice(1).filter((w) => /^\p{Lu}/u.test(w));
    for (const word of later) {
      if (/^#|\d/.test(word) || PROPER.has(word.replace(/[^\p{L}-]/gu, ''))) continue;
      assert.fail(`${key}: "${value}" capitalizes "${word}"`);
    }
  }
});

test('French keeps its own conventions: sentence case, spaced punctuation, the mode named in lowercase', () => {
  assert.equal(FR['setup.watch'], 'Mode spectateur');
  assert.match(FR['screen.watchMap'], /^Mode spectateur\s:/u);
  assert.equal(FR['result.changeStage'], 'Changer d’arène');
  assert.equal(FR['practice.changeFighter'], 'Changer de combattant');
  for (const [key, value] of Object.entries(FR)) {
    if (typeof value !== 'string' || key.startsWith('banner.')) continue;
    assert.doesNotMatch(value, /Mode Spectateur/, key);
  }
});

test('the stylesheet never changes a label\'s case: no uppercase or capitalize transform anywhere', () => {
  for (const file of readdirSync(new URL('css/', ROOT))) {
    assert.doesNotMatch(read(`css/${file}`), /text-transform:\s*(uppercase|capitalize)/, file);
  }
  // Nor does the page set a case anywhere else: no script uppercases a label.
  const scripts = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? scripts(`${dir}${d.name}/`) : d.name.endsWith('.js') ? [`${dir}${d.name}`] : []);
  for (const file of scripts('js/')) assert.doesNotMatch(read(file), /toUpperCase|toLocaleUpperCase/, file);
});

// ---- 2. Hover, focus and selection --------------------------------------------------

// Every rule in the stylesheet, as [selectors, declarations], @media blocks
// opened up.
function rules(css) {
  const out = [];
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@(media|supports)[^{]*\{/g, '');
  for (const match of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([match[1].trim(), match[2]]);
  return out;
}

test('a hover look needs a real pointer: every :hover is off for touch input, and the controller cursor has the same look', () => {
  const css = stylesheet();
  let hovers = 0;
  for (const [selectors, body] of rules(css)) {
    // Outline-only actions keep no fill in any state: not a hover look.
    if (body.trim() === 'background: transparent;') continue;
    for (const selector of selectors.split(',').map((s) => s.trim())) {
      if (!/:hover/.test(selector.replace(/:not\(:hover\)/g, ''))) continue;
      hovers += 1;
      assert.match(selector, /^:where\(html:not\(\.is-touch-input\)\) /, selector);
    }
  }
  assert.ok(hovers > 30, 'every control\'s hover is covered');
  for (const control of ['btn', 'btn-back', 'pause-btn-item', 'home-action', 'mode-card', 'difficulty-card', 'settings-tab',
    'settings-option', 'settings-language', 'language-option', 'controller-row', 'cycler', 'discover-tab', 'dialog-close']) {
    assert.match(css, new RegExp(`\\.${control}(\\.[\\w-]+)?\\.is-cursor-target`), `${control}: the cursor's hover look`);
  }
  // Disabled buttons never take a hover look.
  assert.match(css, /\.btn:enabled:hover/);
  assert.match(css, /\.btn--primary:enabled:hover/);
});

test('the focus ring is for keyboard and controller navigation only: every ring rule is off for pointer input', () => {
  const css = stylesheet();
  let rings = 0;
  for (const [selectors, body] of rules(css)) {
    if (!/var\(--focus-ring/.test(body)) continue;
    for (const selector of selectors.split(',').map((s) => s.trim())) {
      if (!/:focus\b/.test(selector)) continue;
      rings += 1;
      assert.match(selector, /^:where\(html:not\(\.is-pointer-input\)\) /, selector);
    }
  }
  assert.ok(rings > 20);
  // Selection is its own state: never a hover or focus look.
  assert.match(css, /\.settings-language\.is-current, \.settings-choice\.is-current \{[^}]*border-color/);
  assert.match(css, /\.stage-tile\.is-selected \.stage-tile-check \{ display: grid; \}/);
});

test('the input modality: the page starts with no ring; keys and controllers show it; a mouse hides it; a finger turns hover off', () => {
  html.classList.remove('is-pointer-input', 'is-touch-input');
  const { hooks } = navigator();
  assert.ok(html.classList.contains('is-pointer-input'), 'nothing looks focused as a page opens');
  assert.equal(html.classList.contains('is-touch-input'), false);
  hooks.key({ code: 'ArrowDown', key: 'ArrowDown', preventDefault: noop });
  assert.equal(html.classList.contains('is-pointer-input'), false, 'keyboard: the ring shows');
  assert.equal(html.dataset.input, 'keyboard');
  fire('pointermove', { pointerType: 'mouse', movementX: 3, movementY: 0 });
  assert.ok(html.classList.contains('is-pointer-input'), 'the mouse moving hides it again');
  hooks.pad('down');
  assert.equal(html.classList.contains('is-pointer-input'), false, 'a controller shows it');
  assert.equal(html.dataset.input, 'gamepad');
  fire('pointerdown', { pointerType: 'touch' });
  assert.ok(html.classList.contains('is-pointer-input') && html.classList.contains('is-touch-input'), 'touch: no ring, no hover');
  fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(html.classList.contains('is-touch-input'), false, 'a mouse press brings hover back');
  hooks.key({ code: 'ShiftLeft', key: 'Shift', preventDefault: noop });
  assert.ok(html.classList.contains('is-pointer-input'), 'a modifier alone is not navigation');
});

test('focus moved by script never looks like a hover or a keyboard focus', () => {
  const { nav } = navigator();
  const { root, button, scope } = dialog();
  nav.pushScope(scope);
  nav.focusFirst(root);
  assert.equal(document.activeElement, button, 'the default control still takes focus, for keys and pads');
  assert.ok(html.classList.contains('is-pointer-input'), 'and shows no ring until a key or controller is used');
  nav.popScope(scope);
});

// ---- 3. Glass ----------------------------------------------------------------------------

// Every dialog panel class, and the dialogs' sources.
const PANELS = ['dialog-panel', 'pause-panel', 'results-panel', 'settings-panel', 'language-panel', 'controller-editor-panel', 'practice-roster-dialog'];
const DIALOG_SOURCES = ['js/ui/overlays.js', 'js/ui/controller-dialog.js', 'js/ui/settings-dialog.js', 'js/ui/language-dialog.js',
  'js/ui/install-dialog.js', 'js/ui/controller-editor.js', 'js/screens/battle-screen.js', 'js/screens/practice-screen.js'];

test('every dialog panel is the shared glass panel: Controller connections\' look', () => {
  let panels = 0;
  for (const file of DIALOG_SOURCES) {
    for (const match of read(file).matchAll(/class: '([^']*)'/g)) {
      const classes = match[1].split(' ');
      if (!classes.some((c) => PANELS.includes(c))) continue;
      panels += 1;
      assert.ok(classes.includes('glass') && classes.includes('glass--panel'), `${file}: ${match[1]}`);
    }
  }
  assert.ok(panels >= 13, `all the dialogs (${panels})`);
});

test('no dialog\'s own rule replaces the glass with another fill, opacity or blur', () => {
  const css = stylesheet();
  for (const [selectors, body] of rules(css)) {
    if (/\.glass/.test(selectors)) continue;
    if (!PANELS.some((panel) => new RegExp(`\\.${panel}(?![\\w-])(?![^,]*\\s)`).test(selectors))) continue;
    assert.doesNotMatch(body, /(^|;)\s*(background|opacity|backdrop-filter|-webkit-backdrop-filter):/, selectors);
  }
  assert.doesNotMatch(css, /controller-roster-dialog\.glass/);
  assert.doesNotMatch(css, /practice-menu-panel\.glass--panel/);
});

test('the glass: a translucent fill, a sheen, an edge and shadows, a blur where supported and a denser fill where not', () => {
  const css = stylesheet();
  const panel = css.match(/\n\.glass--panel \{([^}]*)\}/)[1];
  assert.match(panel, /background: var\(--glass-sheen\), var\(--glass-fill-panel\);/, 'the fallback');
  const blurred = css.match(/@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\) \{\s*\.glass--panel \{([^}]*)\}/)[1];
  assert.match(blurred, /background: var\(--glass-sheen\), var\(--glass-fill-blur\);/);
  assert.match(blurred, /backdrop-filter: blur\(12px\)/);
  const alpha = (token) => Number(css.match(new RegExp(`${token}: rgba\\(10, 11, 13, ([\\d.]+)\\)`))[1]);
  assert.ok(alpha('--glass-fill-panel') > alpha('--glass-fill-blur'), 'denser without the blur');
  assert.ok(alpha('--glass-fill-blur') < 1, 'translucent: what is beneath shows through');
  assert.match(css.match(/\n\.glass \{([^}]*)\}/)[1], /border: 1px solid var\(--glass-edge\);/);
});

test('one dim for every dialog: the shared scrim, perceptible, never black', () => {
  const css = stylesheet();
  const scrim = Number(css.match(/--scrim: rgba\(0, 0, 0, ([\d.]+)\);/)[1]);
  assert.ok(scrim > 0.2 && scrim < 0.6);
  const [, overlays, body] = css.match(/\n(\.dialog-overlay,[^{]*)\{([^}]*)\}/);
  for (const overlay of ['dialog-overlay', 'controller-overlay', 'settings-overlay', 'language-overlay',
    'controller-roster-overlay', 'controller-editor-overlay', 'binding-overlay']) {
    assert.match(overlays, new RegExp(`\\.${overlay}\\b`), overlay);
  }
  assert.match(body, /background: var\(--scrim\);/);
  for (const overlay of ['pause-overlay', 'practice-menu-overlay', 'practice-roster-overlay']) {
    assert.match(css, new RegExp(`\\n\\.${overlay} \\{[^}]*background: var\\(--scrim\\);`), overlay);
  }
  // The Match Results pause nothing: the battle plays on behind them,
  // undimmed.
  assert.match(css, /\n\.results-overlay \{[^}]*background: transparent;/);
  assert.doesNotMatch(css, /\.language-overlay \{[^}]*background: #000/, 'the first-launch chooser no longer blacks Home out');
});

// ---- 4. Corners ----------------------------------------------------------------------------

test('every rectangular menu control has the Home Play button\'s 3 px corners; circles stay circles', () => {
  const css = stylesheet();
  assert.match(css, /--radius-menu: 3px;/);
  const radius = (selector) => css.match(new RegExp(`\\n${selector.replace(/\./g, '\\.')} \\{[^}]*border-radius: ([^;]+);`))?.[1];
  for (const control of ['.home-action', '.btn', '.btn-back', '.pause-btn-item', '.mode-card', '.mode-cta', '.difficulty-card',
    '.slot', '.stage-tile', '.settings-language, .settings-choice', '.settings-option', '.language-option', '.cycler',
    '.controller-row', '.touch-editor-step', '.dialog-panel', '.pause-panel', '.results-panel', '.practice-roster-dialog', '.settings-panel',
    '.language-panel', '.controller-editor-panel', '.text-action']) {
    assert.equal(radius(control), 'var(--radius-menu)', control);
  }
  assert.match(css, /\n\.settings-close,\n\.dialog-close,\n\.dialog-settings \{[^}]*border-radius: var\(--radius-menu\);/);
  // Tabs keep their open edge, with the same corners.
  assert.equal(radius('.settings-tab'), 'var(--radius-menu) var(--radius-menu) 0 0');
  // No menu control is left on the larger radii.
  assert.doesNotMatch(css.replace(/:root \{[^}]*\}/, ''), /var\(--radius-(md|lg|sm)\)/);
  for (const round of ['.controller-cursor-ring,\n.controller-cursor-dot', '.hud-dot', '.step-num', '.slot-check', '.stage-tile-check']) {
    assert.match(css, new RegExp(`\\n${round.replace(/\./g, '\\.')} \\{[^}]*border-radius: 50%;`), round);
  }
  assert.match(css, /\.settings-option-current \{[^}]*border-radius: var\(--radius-pill\);/, 'pills stay pills');
});

// ---- 5. The dialog stack --------------------------------------------------------------------

test('each dialog opened over another is above it; only the top one is live; closing one by one restores each', async () => {
  const { nav, screen } = navigator();
  const settings = dialog();
  const roster = dialog();
  const editor = dialog();
  const confirm = dialog();
  const z = (d) => Number(d.root.style.zIndex);

  nav.pushScope(settings.scope);
  settings.button.focus();
  assert.equal(z(settings), LAYER_BASE);
  assert.equal(screen.el.inert, true, 'the screen beneath is out of reach');

  nav.pushScope(roster.scope);
  roster.button.focus();
  nav.pushScope(editor.scope);
  editor.button.focus();
  nav.pushScope(confirm.scope);
  confirm.button.focus();
  assert.ok(z(confirm) > z(editor) && z(editor) > z(roster) && z(roster) > z(settings), 'newest on top, in open order');
  assert.equal(nav.scopeEl, confirm.root, 'commands reach the top one alone');
  for (const below of [settings, roster, editor]) assert.equal(below.root.inert, true, 'everything beneath is inert');
  assert.equal(confirm.root.inert, false);

  // The confirmation closes: the editor is live again, with its focus back.
  confirm.root.hidden = true;
  nav.popScope(confirm.scope);
  assert.equal(confirm.root.style.zIndex, '', 'no stacking style left behind');
  assert.equal(editor.root.inert, false);
  assert.equal(roster.root.inert, true, 'the roster is still beneath the editor');
  await flush();
  assert.equal(document.activeElement, editor.button, 'focus goes back into the editor');

  for (const d of [editor, roster, settings]) {
    d.root.hidden = true;
    nav.popScope(d.scope);
  }
  assert.deepEqual(nav.scopes, []);
  assert.equal(screen.el.inert, false, 'the whole chain closed: the screen is live again');
  assert.equal(settings.root.inert, false);
  for (const d of [settings, roster, editor, confirm]) assert.equal(d.root.style.zIndex, '');
});

test('closing a child never closes its parent; Back reaches the top dialog only', () => {
  const { nav } = navigator();
  const parent = dialog();
  const child = dialog();
  const backs = [];
  parent.scope.onBack = () => backs.push('parent');
  child.scope.onBack = () => {
    backs.push('child');
    child.root.hidden = true;
    nav.popScope(child.scope);
  };
  nav.pushScope(parent.scope);
  nav.pushScope(child.scope);
  nav.command('back');
  assert.deepEqual(backs, ['child']);
  assert.equal(nav.scopeEl, parent.root, 'the parent is the live dialog again');
  assert.equal(parent.root.hidden, false);
  nav.command('back');
  assert.deepEqual(backs, ['child', 'parent']);
});

test('a dialog hidden without closing its scope never keeps the navigation or the screen inert', () => {
  const { nav, screen } = navigator();
  const stale = dialog();
  nav.pushScope(stale.scope);
  assert.equal(screen.el.inert, true);
  stale.root.hidden = true;
  assert.equal(nav.scopeEl, screen.el, 'the hidden dialog is dropped');
  assert.equal(screen.el.inert, false);
  assert.equal(stale.root.style.zIndex, '');
});

test('a dialog inside the screen (the pause menu) stacks in it and leaves the screen live; a confirmation over it is above', () => {
  const { nav, screen } = navigator();
  const pause = new Element('div');
  screen.el.append(pause);
  const pauseScope = { el: pause, onBack: noop };
  nav.pushScope(pauseScope);
  assert.equal(screen.el.inert, false, 'the screen holds the live dialog');
  assert.equal(pause.style.zIndex, undefined, 'its own stylesheet places it in the screen');
  const confirm = dialog();
  nav.pushScope(confirm.scope);
  assert.equal(screen.el.inert, true, 'the confirmation is above the whole screen, pause menu included');
  assert.equal(pause.inert, true);
  confirm.root.hidden = true;
  nav.popScope(confirm.scope);
  assert.equal(screen.el.inert, false);
  assert.equal(pause.inert, false);
  nav.popScope(pauseScope);
});

test('the dialog stack replaces the old raised confirmation and every dialog\'s own inert bookkeeping', () => {
  const css = stylesheet();
  assert.doesNotMatch(css, /is-raised/);
  for (const file of ['js/ui/controller-editor.js', 'js/ui/settings-dialog.js', 'js/ui/overlays.js', 'js/ui/language-dialog.js']) {
    const src = read(file);
    assert.doesNotMatch(src, /is-raised/, file);
    assert.doesNotMatch(src, /\.inert = /, `${file} leaves inert to the dialog stack`);
  }
});

test('the controller cursor\'s hover look leaves the item beneath a dialog as it opens', () => {
  const { nav } = navigator();
  const below = dialog();
  nav.pushScope(below.scope);
  const cursor = nav.cursor;
  cursor.visible = true;
  cursor.setTarget(below.button);
  assert.ok(below.button.classList.contains('is-cursor-target'));
  const above = dialog();
  nav.pushScope(above.scope);
  assert.equal(below.button.classList.contains('is-cursor-target'), false, 'nothing beneath keeps the hover look');
  cursor.hide();
});
