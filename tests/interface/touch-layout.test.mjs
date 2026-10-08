// Run with node --test tests/interface/touch-layout.test.mjs (no dependencies).
// Custom touch layouts: the stable control ids of both schemes, the layout
// geometry (fractions of the touch-control area, sizes as scales, kept on
// screen), TouchControls applying a layout (the stylesheet's own layout
// untouched by default, every control moved and sized by id, a resize
// re-placing them, Reset back to the default) without changing a single
// input it sends (held buttons, Classic Left / C / Right sliding wherever
// they sit, the joystick's thresholds at any size, the Dash taps,
// multi-touch, the fighter's icons), and the layout editor (drag, select,
// keyboard / gamepad moving, size, reset, saved as it goes, each scheme on
// its own). On a minimal fake DOM whose boxes are set by hand; real layout
// and gestures still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEST_A, TEST_DISABLED, withTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { stylesheet } from '../helpers/stylesheet.mjs';

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
  dataset = {};
  html = '';
  style = {};
  hidden = false;
  disabled = false;
  inert = false;
  rect = { left: 0, top: 0, width: 40, height: 40 };
  captured = new Set();
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
  // Runs `type` here and up through the ancestors, as a bubbling event does.
  dispatch(type, event = {}) {
    const e = { target: this, preventDefault: noop, stopPropagation: noop, ...event };
    for (let n = this; n; n = n.parentNode) for (const fn of n.listeners?.get(type) || []) fn(e);
  }
  // Like HTMLElement.click() (and Enter / Space on a button), a click with
  // no pointer has detail 0; a pointer's click passes 1.
  click(detail = 0) {
    if (this.disabled) return;
    this.dispatch('click', { detail });
  }
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
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
  scrollIntoView() {}
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
}

globalThis.Node = Node;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: () => new Element('section'),
  addEventListener: noop,
  removeEventListener: noop,
};

const {
  TOUCH_CONTROL_IDS, TOUCH_SCALE, TOUCH_NUDGE, sanitizeTouchLayout, placeControl, normalizePoint, layoutArea, clampScale,
} = await import('../../js/core/touch-layout.js');
const { TouchControls } = await import('../../js/ui/touch-controls.js');
const { TouchLayoutEditor } = await import('../../js/ui/touch-layout-editor.js');
const { Settings, SETTINGS_KEY, MOBILE_CONTROLS } = await import('../../js/core/settings.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { setLanguage, localizeTree } = await import('../../js/localization/i18n.js');
const { getCharacter } = await import('../../js/data/characters.js');
const { ICONS } = await import('../../js/ui/icons.js');

const DEF_0001 = getCharacter('0001');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// A 1000 x 500 screen at the origin.
const SCREEN = { left: 0, top: 0, width: 1000, height: 500 };

// Touch controls wired to a recording input, on `scheme`, on the screen.
function touchControls(scheme = 'joystick', def = DEF_0001) {
  const calls = [];
  const input = {
    setTouch: (action, held) => calls.push([action, held]),
    queueTouchMouvement: (direction) => calls.push(['mouvement', direction]),
  };
  const root = new Element('div');
  root.rect = { ...SCREEN };
  const tc = new TouchControls(root, input, { scheme });
  if (def) tc.setCharacter(def);
  tc.setEnabled(true);
  return { tc, calls, root };
}

// Where each control sits by default in these checks (the stylesheet's
// places, roughly): the lower-left cluster at the left, the actions at the
// right. Returns the boxes it gave.
function layOut(tc, scheme = tc.scheme) {
  const boxes = {
    mouvementLeft: [90, 330, 40, 40],
    stick: [80, 360, 120, 120],
    mouvementRight: [170, 330, 40, 40],
    runLeft: [30, 420, 60, 60],
    runRight: [190, 420, 60, 60],
    extra_attack: [900, 250, 68, 68],
    transform: [800, 330, 60, 60],
    shield: [880, 330, 60, 60],
    attack1: [760, 420, 60, 60],
    attack2: [840, 420, 60, 60],
    attack3: [720, 330, 60, 60],
    attack4: [760, 250, 60, 60],
    attack5: [840, 250, 60, 60],
    jump: [920, 420, 60, 60],
  };
  for (const [id, node] of tc.getControlElements(scheme)) {
    const [left, top, width, height] = boxes[id];
    node.rect = { left, top, width, height };
  }
  return boxes;
}

const press = (b, pointerId, at = {}) => b.dispatch('pointerdown', { pointerId, button: 0, ...at });
const lift = (b, pointerId) => b.dispatch('pointerup', { pointerId });
const centre = (node) => ({ clientX: node.rect.left + node.rect.width / 2, clientY: node.rect.top + node.rect.height / 2 });

// ---- Control ids ------------------------------------------------------------------

test('every control of both schemes has a stable id, independent of its label', () => {
  assert.deepEqual([...TOUCH_CONTROL_IDS.joystick], [
    'mouvementLeft', 'stick', 'mouvementRight', 'extra_attack', 'transform', 'shield',
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump',
  ]);
  assert.deepEqual([...TOUCH_CONTROL_IDS.classic], [
    'runLeft', 'runRight', 'mouvementLeft', 'mouvementRight', 'extra_attack', 'transform', 'shield',
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump',
  ]);
  assert.deepEqual(Object.keys(TOUCH_CONTROL_IDS), [...MOBILE_CONTROLS], 'one list per Mobile Controls scheme');
  assert.ok(Object.isFrozen(TOUCH_CONTROL_IDS.joystick) && Object.isFrozen(TOUCH_CONTROL_IDS.classic));
  const { tc } = touchControls('joystick');
  // Each id is exactly the element on screen for it.
  const joystick = tc.getControlElements('joystick');
  assert.equal(joystick.get('stick'), tc.stick, 'the joystick itself, though it is no button');
  assert.equal(tc.controlElement('down'), null);
  assert.equal(joystick.get('mouvementLeft'), tc.mouvementButtons.get('mouvementLeft'));
  assert.equal(joystick.get('mouvementRight'), tc.mouvementButtons.get('mouvementRight'));
  const classic = tc.getControlElements('classic');
  for (const id of ['runLeft', 'runRight']) assert.equal(classic.get(id), tc.padButtons.get(id), id);
  for (const id of ['extra_attack', 'transform', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump']) {
    assert.equal(joystick.get(id), tc.actionButtons.get(id), `${id}: joystick`);
    assert.equal(classic.get(id), tc.actionButtons.get(id), `${id}: classic, the same element`);
  }
  for (const scheme of MOBILE_CONTROLS) {
    const nodes = [...tc.getControlElements(scheme).values()];
    assert.equal(new Set(nodes).size, nodes.length, `${scheme}: one element per id`);
    assert.ok(nodes.every(Boolean), `${scheme}: none missing`);
  }
  assert.equal(tc.controlElement('stick', 'classic'), null, 'not a Classic control');
  assert.equal(tc.controlElement('runLeft', 'joystick'), null, 'not a Joystick control');
  // Ids never follow the language; labels do.
  setLanguage('fr');
  try {
    localizeTree(tc.root);
    assert.equal(tc.mouvementButtons.get('mouvementLeft').getAttribute('aria-label'), 'Mouvement à gauche');
    assert.equal(tc.actionButtons.get('attack1').getAttribute('aria-label'), 'Direct');
    assert.equal(tc.getControlElements().get('mouvementLeft'), tc.mouvementButtons.get('mouvementLeft'));
    assert.deepEqual([...tc.getControlElements().keys()], [...TOUCH_CONTROL_IDS.joystick]);
  } finally {
    setLanguage('en');
    localizeTree(tc.root);
  }
  assert.equal(tc.actionButtons.get('attack1').getAttribute('aria-label'), 'Jab');
});

// ---- Geometry ----------------------------------------------------------------------

test('positions are fractions of the touch-control area, sizes are scales, and a control always stays whole on screen', () => {
  assert.deepEqual({ ...TOUCH_SCALE }, { min: 0.7, max: 1.8, step: 0.1 });
  assert.ok(TOUCH_NUDGE > 0 && TOUCH_NUDGE <= 0.05, 'a nudge is a small step');
  assert.equal(clampScale(0), 0.7);
  assert.equal(clampScale(1.23456), 1.23);
  assert.equal(clampScale(99), 1.8);
  // The area: the box inside its padding (safe areas and margin).
  const area = layoutArea({ left: 0, top: 0, width: 1000, height: 500 }, { top: 10, right: 40, bottom: 20, left: 60 });
  assert.deepEqual(area, { left: 60, top: 10, width: 900, height: 470 });
  // The stored centre, as long as the control fits there.
  assert.deepEqual(placeControl(area, { x: 0.5, y: 0.5, scale: 1 }, { width: 60, height: 60 }), { x: 510, y: 245 });
  // Pulled in so all of it (at its scale) stays inside.
  assert.deepEqual(placeControl(area, { x: 0, y: 1, scale: 1.5 }, { width: 60, height: 60 }), { x: 60 + 45, y: 480 - 45 });
  assert.deepEqual(placeControl(area, { x: 1, y: 0, scale: 1 }, { width: 100, height: 40 }), { x: 960 - 50, y: 10 + 20 });
  // Bigger than the area: centred in it rather than lost.
  assert.deepEqual(placeControl({ left: 0, top: 0, width: 50, height: 50 }, { x: 0, y: 0, scale: 1 }, { width: 80, height: 80 }), { x: 25, y: 25 });
  // And back to fractions.
  assert.deepEqual(normalizePoint(area, { x: 510, y: 245 }), { x: 0.5, y: 0.5 });
  assert.deepEqual(normalizePoint(area, { x: -99, y: 9999 }), { x: 0, y: 1 }, 'held to the area');
  assert.deepEqual(normalizePoint({ left: 0, top: 0, width: 0, height: 0 }, { x: 5, y: 5 }), { x: 0.5, y: 0.5 }, 'no area yet');
  // Resolution independent: one layout, two screens, the same relative place.
  const entry = { x: 0.25, y: 0.75, scale: 1 };
  const small = layoutArea({ left: 0, top: 0, width: 640, height: 360 });
  const large = layoutArea({ left: 0, top: 0, width: 1920, height: 1080 });
  assert.deepEqual(placeControl(small, entry, { width: 50, height: 50 }), { x: 160, y: 270 });
  assert.deepEqual(placeControl(large, entry, { width: 50, height: 50 }), { x: 480, y: 810 });
  // Sanitised values never hold pixels or extremes.
  assert.deepEqual(sanitizeTouchLayout('joystick', { stick: { x: 640, y: -2, scale: 0.01 } }), { stick: { x: 1, y: 0, scale: 0.7 } });
});

test('a stored layout keeps every numbered attack button by its codename, in the scheme\'s order, and drops any other id', () => {
  const at = (x) => ({ x, y: 0.5, scale: 1 });
  const stored = {
    attack5: at(0.5), jump: at(0.9), attack3: at(0.3), attack1: at(0.1), extra_attack: at(0.8), attack4: at(0.4), attack2: at(0.2),
    attack6: at(0.6), punch: at(0.7), Kick: at(0.1),
  };
  for (const scheme of MOBILE_CONTROLS) {
    const layout = sanitizeTouchLayout(scheme, stored);
    assert.deepEqual(Object.keys(layout), ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump'], scheme);
    assert.deepEqual(layout.attack5, at(0.5));
    // Round trip: what is saved is read back exactly.
    assert.deepEqual(sanitizeTouchLayout(scheme, JSON.parse(JSON.stringify(layout))), layout);
  }
});

// ---- Applying a layout ------------------------------------------------------------------

test('with no custom layout nothing is moved or sized: the stylesheet\'s own layout, exactly', () => {
  for (const scheme of MOBILE_CONTROLS) {
    const { tc } = touchControls(scheme);
    layOut(tc);
    tc.applyLayout();
    for (const [id, node] of tc.getControlElements()) {
      assert.equal(node.style.translate ?? '', '', `${scheme} ${id}: not moved`);
      assert.equal(node.style.scale ?? '', '', `${scheme} ${id}: not sized`);
      const place = tc.placements.get(id);
      assert.deepEqual(place.center, place.home, `${scheme} ${id}: where the stylesheet puts it`);
      assert.equal(place.scale, 1);
    }
  }
  // Nothing in the stylesheet's control geometry was touched for this.
  const css = stylesheet();
  assert.match(css, /\.tc-jump \{ right: 0; bottom: 0; \}/);
  assert.match(css, /--tc-stick: calc\(var\(--tc\) \* 1\.92\);/);
  assert.match(css.match(/\n\.touch-controls \{([^}]*)\}/)[1], /padding: max\(var\(--safe-t\), 6px\) max\(var\(--safe-r\), 6px\) max\(var\(--safe-b\), 6px\) max\(var\(--safe-l\), 6px\);/,
    'the area is the safe area less a margin');
});

test('a custom layout moves and sizes each control by id, kept on screen, and a resize re-places it', () => {
  const { tc, root } = touchControls('joystick');
  layOut(tc);
  tc.setLayout({
    stick: { x: 0.5, y: 0.5, scale: 1.5 },
    jump: { x: 1, y: 1, scale: 1.8 },
    mouvementLeft: { x: 0.1, y: 0.2, scale: 1 },
  });
  const stick = tc.stick;
  // Home centre (140, 420) → (500, 250), one and a half times the size.
  assert.equal(stick.style.translate, '360.0px -170.0px');
  assert.equal(stick.style.scale, '1.5');
  // Pushed into the corner as far as its (1.8x) size allows: 54 px from each edge.
  const jump = tc.actionButtons.get('jump');
  assert.equal(jump.style.translate, '-4.0px -4.0px');
  assert.equal(jump.style.scale, '1.8');
  assert.deepEqual(tc.placements.get('jump').center, { x: 946, y: 446 });
  // Moved without resizing: no scale written.
  const dashLeft = tc.mouvementButtons.get('mouvementLeft');
  assert.equal(dashLeft.style.translate, '-10.0px -250.0px');
  assert.equal(dashLeft.style.scale ?? '', '');
  // Everything else is left alone.
  for (const id of ['mouvementRight', 'extra_attack', 'transform', 'shield', 'attack1', 'attack2']) {
    assert.equal(tc.controlElement(id).style.translate, '', id);
  }
  // A new window size or orientation: the same fractions on the new screen.
  root.rect = { left: 0, top: 0, width: 800, height: 400 };
  tc.applyLayout();
  assert.equal(stick.style.translate, '260.0px -220.0px');
  assert.deepEqual(tc.placements.get('stick').center, { x: 400, y: 200 });
  // The safe area (the root's padding) is respected.
  globalThis.getComputedStyle = () => ({ paddingTop: '20px', paddingRight: '44px', paddingBottom: '10px', paddingLeft: '44px' });
  try {
    tc.applyLayout();
    assert.deepEqual(tc.area, { left: 44, top: 20, width: 712, height: 370 });
    assert.deepEqual(tc.placements.get('jump').center, { x: 756 - 54, y: 390 - 54 });
  } finally {
    delete globalThis.getComputedStyle;
  }
  // Hidden (nothing to measure): left alone, placed again once shown.
  root.rect = { left: 0, top: 0, width: 0, height: 0 };
  assert.equal(tc.applyLayout(), false);
  assert.equal(stick.style.translate, '');
  root.rect = { ...SCREEN };
  assert.equal(tc.applyLayout(), true);
  assert.equal(stick.style.translate, '360.0px -170.0px');
});

test('each scheme keeps its own layout, and switching schemes restores that scheme\'s', () => {
  const { tc } = touchControls('joystick');
  layOut(tc, 'joystick');
  tc.setLayout({ jump: { x: 0.5, y: 0.5, scale: 1 } }, 'joystick');
  tc.setLayout({ jump: { x: 0.2, y: 0.5, scale: 1.2 }, runLeft: { x: 0.5, y: 0.2, scale: 1 } }, 'classic');
  const jump = tc.actionButtons.get('jump');
  assert.equal(jump.style.translate, '-450.0px -200.0px', 'joystick\'s place');
  tc.setScheme('classic');
  layOut(tc, 'classic');
  tc.applyLayout();
  assert.equal(jump.style.translate, '-750.0px -200.0px', 'classic\'s own place for the same button');
  assert.equal(jump.style.scale, '1.2');
  assert.notEqual(tc.padButtons.get('runLeft').style.translate, '');
  tc.setScheme('joystick');
  layOut(tc, 'joystick');
  tc.applyLayout();
  assert.equal(jump.style.translate, '-450.0px -200.0px');
  assert.equal(jump.style.scale ?? '', '');
  assert.equal(tc.padButtons.get('runLeft').style.translate, '', 'the other scheme\'s controls are off screen and unset');
  assert.deepEqual(tc.getLayout('classic'), { runLeft: { x: 0.5, y: 0.2, scale: 1 }, jump: { x: 0.2, y: 0.5, scale: 1.2 } });
});

test('Reset (the empty layout) returns every control to its original place and size', () => {
  for (const scheme of MOBILE_CONTROLS) {
    const { tc } = touchControls(scheme);
    layOut(tc);
    const all = Object.fromEntries(TOUCH_CONTROL_IDS[scheme].map((id, i) => [id, { x: (i + 1) / 12, y: 0.3, scale: 1.4 }]));
    tc.setLayout(all);
    for (const [id, node] of tc.getControlElements()) assert.notEqual(node.style.translate, '', `${scheme} ${id} moved`);
    tc.setLayout({});
    for (const [id, node] of tc.getControlElements()) {
      assert.equal(node.style.translate, '', `${scheme} ${id}`);
      assert.equal(node.style.scale, '', `${scheme} ${id}`);
      assert.deepEqual(tc.placements.get(id).center, tc.placements.get(id).home);
    }
    assert.deepEqual(tc.getLayout(), {});
  }
});

// ---- Inputs never change ----------------------------------------------------------------

// Every control of the scheme moved somewhere else and resized.
function scatter(tc) {
  const layout = Object.fromEntries(TOUCH_CONTROL_IDS[tc.scheme].map((id, i) => [id, { x: 1 - (i + 0.5) / 11, y: 0.2 + (i % 3) * 0.25, scale: 0.8 + (i % 4) * 0.25 }]));
  tc.setLayout(layout);
  return layout;
}

test('a custom layout never changes what a button sends: every held action, both schemes', () => {
  for (const scheme of MOBILE_CONTROLS) {
    const { tc, calls } = touchControls(scheme);
    layOut(tc);
    scatter(tc);
    const held = ['extra_attack', 'transform', 'shield', 'attack1', 'attack2', 'jump'];
    held.forEach((action, i) => {
      const b = tc.buttons.get(action);
      assert.equal(b.getAttribute('data-action'), action, `${scheme}: ${action} keeps its codename`);
      press(b, 10 + i);
      assert.ok(b.classList.contains('is-pressed'), `${scheme}: ${action} pressed look`);
      lift(b, 10 + i);
    });
    assert.deepEqual(calls, held.flatMap((a) => [[a, true], [a, false]]), scheme);
    // Held for exactly the pointer's life, alongside another (multi-touch).
    calls.length = 0;
    press(tc.buttons.get('shield'), 1);
    press(tc.buttons.get('jump'), 2);
    lift(tc.buttons.get('jump'), 2);
    assert.ok(tc.buttons.get('shield').classList.contains('is-pressed'), 'Shield still held');
    tc.buttons.get('shield').dispatch('pointercancel', { pointerId: 1 });
    assert.deepEqual(calls, [['shield', true], ['jump', true], ['jump', false], ['shield', false]]);
  }
});

test('the joystick keeps its deadzone and engage line at any size, and its knob stays inside', () => {
  const { tc, calls } = touchControls('joystick');
  layOut(tc);
  tc.setLayout({ stick: { x: 0.3, y: 0.6, scale: 1.5 } });
  // As drawn: 1.5 times its 120 px base, 180 px across, centred on its new place.
  const place = tc.placements.get('stick');
  tc.stick.offsetWidth = 120;
  tc.stick.rect = { left: place.center.x - 90, top: place.center.y - 90, width: 180, height: 180 };
  const at = (x, y = 0) => ({ clientX: place.center.x + x, clientY: place.center.y + y });
  tc.stick.dispatch('pointerdown', { pointerId: 1, ...at(0.3 * 90) });
  assert.deepEqual(calls, [], 'inside the engage line of the bigger stick');
  tc.stick.dispatch('pointermove', { pointerId: 1, ...at(0.34 * 90) });
  assert.deepEqual(calls, [['runRight', true]], 'the same engage fraction, of its drawn radius');
  tc.stick.dispatch('pointermove', { pointerId: 1, ...at(0.25 * 90) });
  assert.deepEqual(calls, [['runRight', true]], 'still held above the deadzone');
  tc.stick.dispatch('pointermove', { pointerId: 1, ...at(0.2 * 90) });
  assert.deepEqual(calls.at(-1), ['runRight', false]);
  // Pushed far: the knob stops at its travel, drawn in the stick's own px.
  tc.stick.dispatch('pointermove', { pointerId: 1, ...at(-400) });
  assert.deepEqual(calls.at(-1), ['runLeft', true]);
  assert.ok(Math.abs(tc.knobOffset.x + 90 * 0.56) < 1e-9, 'travel in screen px');
  assert.equal(tc.knob.style.transform, `translate(${(-90 * 0.56 / 1.5).toFixed(1)}px, 0.0px)`, 'divided by the stick\'s scale');
  tc.stick.dispatch('pointerup', { pointerId: 1 });
  assert.deepEqual(calls.at(-1), ['runLeft', false]);
  assert.equal(tc.knob.style.transform, '');
});

test('the Dash buttons still ask for exactly one Dash per tap wherever they are', () => {
  const { tc, calls } = touchControls('joystick');
  layOut(tc);
  scatter(tc);
  press(tc.mouvementButtons.get('mouvementRight'), 1);
  lift(tc.mouvementButtons.get('mouvementRight'), 1);
  press(tc.mouvementButtons.get('mouvementLeft'), 2);
  tc.mouvementButtons.get('mouvementLeft').dispatch('pointermove', { pointerId: 2 });
  lift(tc.mouvementButtons.get('mouvementLeft'), 2);
  assert.deepEqual(calls, [['mouvement', 1], ['mouvement', -1]]);
  assert.equal(tc.pointers.size, 0, 'no held direction');
});

test('Classic Left / Right still slide into one another wherever they are placed', () => {
  const { tc, calls } = touchControls('classic');
  layOut(tc);
  // Rearranged and spread out: Right at the far left, C in the middle of
  // the screen, Left over on the right (their drawn boxes).
  tc.setLayout({ runRight: { x: 0.05, y: 0.8, scale: 1.3 }, runLeft: { x: 0.7, y: 0.8, scale: 1 } });
  for (const id of ['runLeft', 'runRight']) {
    const { center, size, scale } = tc.placements.get(id);
    const w = size.width * scale;
    tc.padButtons.get(id).rect = { left: center.x - w / 2, top: center.y - w / 2, width: w, height: w };
  }
  const at = (id) => centre(tc.padButtons.get(id));
  // A press on Left bubbles to the cluster, which captures the pointer.
  tc.padButtons.get('runLeft').dispatch('pointerdown', { pointerId: 1, ...at('runLeft') });
  assert.deepEqual(calls, [['runLeft', true]]);
  assert.ok(tc.dpad.hasPointerCapture(1), 'the cluster follows the thumb anywhere');
  // Across empty screen: the hold stays until the thumb reaches another.
  tc.dpad.dispatch('pointermove', { pointerId: 1, clientX: 560, clientY: at('runLeft').clientY });
  assert.deepEqual(calls, [['runLeft', true]], 'no button there: Left stays held');
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('runRight') });
  assert.deepEqual(calls, [['runLeft', true], ['runLeft', false], ['runRight', true]]);
  assert.ok(tc.buttons.get('runRight').classList.contains('is-pressed'));
  tc.dpad.dispatch('pointerup', { pointerId: 1 });
  assert.deepEqual(calls.at(-1), ['runRight', false]);
  assert.equal(tc.pointers.size, 0);
  // Two Run taps remain ordinary directional presses.
  calls.length = 0;
  for (const id of [2, 3]) {
    tc.padButtons.get('runRight').dispatch('pointerdown', { pointerId: id, ...at('runRight') });
    tc.dpad.dispatch('pointerup', { pointerId: id });
  }
  assert.deepEqual(calls, [['runRight', true], ['runRight', false], ['runRight', true], ['runRight', false]]);
  // A bigger C is hit wherever its bigger box reaches.
  calls.length = 0;
  const c = tc.padButtons.get('runRight').rect;
  tc.dpad.dispatch('pointerdown', { pointerId: 4, clientX: c.left + c.width * 0.95, clientY: c.top + c.height / 2 });
  assert.deepEqual(calls, [['runRight', true]]);
});

test('multi-touch still works with a custom layout: joystick, Shield, Punch and Jump at once', () => {
  const { tc, calls } = touchControls('joystick');
  layOut(tc);
  scatter(tc);
  const place = tc.placements.get('stick');
  const w = place.size.width * place.scale;
  tc.stick.rect = { left: place.center.x - w / 2, top: place.center.y - w / 2, width: w, height: w };
  tc.stick.dispatch('pointerdown', { pointerId: 1, clientX: place.center.x - w * 0.4, clientY: place.center.y });
  press(tc.buttons.get('shield'), 2);
  press(tc.buttons.get('attack1'), 3);
  press(tc.buttons.get('jump'), 4);
  lift(tc.buttons.get('jump'), 4);
  tc.stick.dispatch('pointerup', { pointerId: 1 });
  lift(tc.buttons.get('attack1'), 3);
  lift(tc.buttons.get('shield'), 2);
  assert.deepEqual(calls, [
    ['runLeft', true], ['shield', true], ['attack1', true], ['jump', true],
    ['jump', false], ['runLeft', false], ['attack1', false], ['shield', false],
  ]);
});

test('setCharacter still swaps the fighter\'s art and names in place, and never moves or resizes a button', () => {
  const { tc, calls } = touchControls('joystick', null);
  layOut(tc);
  tc.setLayout({ attack1: { x: 0.5, y: 0.3, scale: 1.3 }, jump: { x: 0.9, y: 0.4, scale: 0.8 }, attack3: { x: 0.2, y: 0.2, scale: 1.5 } });
  const attack1 = tc.buttons.get('attack1');
  const placed = () => ['attack1', 'jump', 'attack3'].map((id) => {
    const b = tc.buttons.get(id);
    return [b.style.translate, b.style.scale];
  });
  const before = placed();
  // What a button shows: the file of its sprite, or its glyph's markup.
  const look = (b) => b.querySelector('.tc-sprite-icon')?.getAttribute('src').split('/').pop() ?? b.innerHTML;
  assert.equal(attack1.getAttribute('aria-label'), 'Attack 1');
  assert.equal(look(attack1), ICONS.pip1, 'neutral before a fighter is named');
  tc.setCharacter(DEF_0001);
  assert.equal(attack1.getAttribute('aria-label'), 'Jab');
  assert.equal(look(attack1), '0001_attack1_4.png', 'a frame of #0001\'s own Jab');
  assert.equal(look(tc.buttons.get('jump')), ICONS.jump);
  assert.deepEqual(placed(), before, 'still where the player put them, at their sizes');
  press(attack1, 1);
  assert.deepEqual(calls, [['attack1', true]], 'still attack1');
  // And Attack 4 and Attack 5 are buttons of their own, named for
  // Unlimited Void and Hollow Purple, in slots 4 and 5, showing #0001's
  // hand sign and the purple sphere.
  for (const [id, label, slot, art] of [['attack4', 'Unlimited Void', '4', '0001_attack4_6.png'], ['attack5', 'Hollow Purple', '5', '0001_attack5_object_1.png']]) {
    const b = tc.buttons.get(id);
    assert.equal(b.hidden, false, id);
    assert.equal(b.getAttribute('aria-label'), label);
    assert.equal(b.getAttribute('data-slot'), slot);
    assert.equal(look(b), art);
  }
  press(tc.buttons.get('attack4'), 2);
  press(tc.buttons.get('attack5'), 3);
  assert.deepEqual(calls.slice(1), [['attack4', true], ['attack5', true]], 'each its own input');
  // #0002 (three numbered attacks, no Attack 4): its own art and jump, the
  // custom places and sizes kept.
  tc.releaseAll();
  tc.setCharacter(getCharacter('0002'));
  assert.deepEqual(['attack1', 'attack3', 'jump'].map((id) => look(tc.buttons.get(id))), ['0002_attack1_4.png', '0002_attack3_5.png', ICONS.jump]);
  assert.equal(tc.buttons.get('attack4').hidden, true);
  assert.deepEqual(placed(), before, 'a fighter change never moves or resizes a custom layout');
  assert.deepEqual(tc.getLayout(), {
    attack1: { x: 0.5, y: 0.3, scale: 1.3 }, jump: { x: 0.9, y: 0.4, scale: 0.8 }, attack3: { x: 0.2, y: 0.2, scale: 1.5 },
  });
});

test('gameplay touch buttons stay out of keyboard focus in battle; only the editor\'s copy is focusable', () => {
  const { tc } = touchControls('joystick');
  for (const scheme of MOBILE_CONTROLS) {
    for (const [id, node] of tc.getControlElements(scheme)) {
      assert.equal(node.hasAttribute('data-nav'), false, `${scheme} ${id}`);
      if (node.tagName === 'BUTTON') assert.equal(node.getAttribute('tabindex'), '-1', `${scheme} ${id}`);
      else assert.equal(node.getAttribute('tabindex'), null, `${scheme} ${id}`);
    }
  }
});

// ---- The editor --------------------------------------------------------------------

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

function memoryStorage() {
  const map = new Map();
  return { map, writes: 0, getItem: (k) => map.get(k) ?? null, setItem(k, v) { this.writes++; map.set(k, String(v)); } };
}

// The editor over a 1000 x 500 screen, controls laid out as layOut() puts
// them, settings in memory.
function editorApp() {
  const storage = memoryStorage();
  const app = {
    input: fakeInput(),
    audio: { play: noop },
    device: { reducedMotion: true },
    settings: new Settings(storage),
    selection: { characterId: '0001' },
    screens: { current: null },
  };
  app.nav = new MenuNavigator(app);
  const root = new Element('div');
  root.hidden = true;
  const editor = new TouchLayoutEditor(root, app);
  editor.touchRoot.rect = { ...SCREEN };
  for (const scheme of MOBILE_CONTROLS) layOut(editor.touch, scheme);
  const back = new Element('button');
  body.replaceChildren(root, back);
  return { app, editor, root, storage, back };
}

const saved = (storage) => JSON.parse(storage.map.get(SETTINGS_KEY) ?? 'null');

test('the editor opens on the scheme in use, as a modal with its own scope, the real controls focusable only here', () => withTestFighters([TEST_A, TEST_DISABLED], () => {
  const { app, editor, root, back } = editorApp();
  // Quick Battle's last pick, playable.
  app.selection.characterId = TEST_A.id;
  app.settings.set('mobileControls', 'classic');
  let closed = 0;
  back.focus();
  editor.open({ scheme: 'classic', returnFocus: back, onClose: () => closed++ });
  assert.equal(editor.isOpen, true);
  assert.equal(root.hidden, false);
  assert.equal(root.getAttribute('role'), 'dialog');
  assert.equal(root.getAttribute('aria-modal'), 'true');
  assert.equal(root.getAttribute('aria-labelledby'), 'touch-editor-title');
  assert.equal(root.querySelector('.touch-editor-title').textContent, 'Customize touch controls');
  assert.equal(editor.schemeLabel.textContent, 'Classic buttons layout');
  assert.equal(app.nav.scopes.at(-1), editor.scope);
  // The real controls, the scheme in use, never live.
  assert.equal(editor.touch.scheme, 'classic');
  assert.equal(editor.touch.enabled, false, 'nothing it does reaches gameplay');
  assert.ok(editor.touchRoot.classList.contains('touch-controls'));
  assert.equal(editor.touch.buttons.get('attack1').getAttribute('aria-label'), 'Attack 1', 'neutral even with a playable fighter selected');
  for (const [id, node] of editor.touch.getControlElements('classic')) {
    assert.equal(node.hasAttribute('data-nav'), true, id);
    assert.equal(node.getAttribute('tabindex'), '0', id);
    assert.equal(node.getAttribute('data-control'), id, `${id}: its stable id, never shown`);
  }
  assert.equal(editor.touch.stick.getAttribute('role'), 'button', 'the joystick, pressed like a button here');
  assert.equal(document.activeElement, editor.touch.padButtons.get('runLeft'), 'focus on the first control');
  // No control ids on show anywhere.
  assert.doesNotMatch(root.textContent, /runLeft|mouvement[LR]|extra_attack|attack\d/);
  // Nothing selected yet: the size controls wait.
  assert.equal(editor.nameEl.textContent, 'No control selected');
  assert.equal(editor.slider.disabled, true);
  assert.equal(editor.smaller.disabled, true);
  editor.doneButton.click();
  assert.equal(editor.isOpen, false);
  assert.equal(root.hidden, true);
  assert.equal(app.nav.scopes.includes(editor.scope), false);
  assert.equal(closed, 1);
  assert.equal(document.activeElement, back, 'focus back where it came from');
  // A pick that cannot be played (a disabled fighter, none at all) shows
  // the same neutral look.
  for (const id of [TEST_DISABLED.id, null]) {
    app.selection.characterId = id;
    editor.open({ scheme: 'classic', returnFocus: back });
    assert.equal(editor.touch.buttons.get('attack1').getAttribute('aria-label'), 'Attack 1', `${id}: neutral`);
    editor.doneButton.click();
  }
}));

test('the editor always uses neutral localized icons for every selection, scheme and reopening', () => {
  const { app, editor, storage } = editorApp();
  const icons = {
    extra_attack: ICONS.ring, transform: ICONS.transform, shield: ICONS.shield, jump: ICONS.jump,
    ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`attack${n}`, ICONS[`pip${n}`]])),
    mouvementLeft: ICONS.mouvementLeft, mouvementRight: ICONS.mouvementRight,
    runLeft: ICONS.left, runRight: ICONS.right,
  };
  const check = (language) => {
    assert.equal(editor.touchRoot.querySelectorAll('.tc-sprite-icon').length, 0);
    assert.equal(editor.touchRoot.dataset.attackButtons, '5');
    for (const [id, node] of editor.touch.getControlElements()) {
      assert.equal(node.hidden, false, `${id}: available to edit`);
      if (id === 'stick') {
        assert.deepEqual(node.children, [editor.touch.knob], 'universal joystick');
        continue;
      }
      assert.equal(node.innerHTML, icons[id], id);
      assert.equal(node.getAttribute('data-control'), id);
    }
    for (let n = 1; n <= 5; n++) {
      const node = editor.touch.actionButtons.get(`attack${n}`);
      assert.equal(node.getAttribute('data-slot'), String(n));
      assert.equal(node.getAttribute('aria-label'), `${language === 'fr' ? 'Attaque' : 'Attack'} ${n}`);
      assert.equal((node.innerHTML.match(/<circle /g) ?? []).length, n);
    }
    assert.equal(editor.touch.actionButtons.get('extra_attack').getAttribute('aria-label'),
      language === 'fr' ? 'Attaque supplémentaire' : 'Extra Attack');
    editor.select('attack5');
    assert.equal(editor.nameEl.textContent, language === 'fr' ? 'Attaque 5' : 'Attack 5');
  };
  try {
    for (const characterId of ['0001', '0002', null, '0001']) {
      app.selection.characterId = characterId;
      for (const scheme of ['joystick', 'classic', 'joystick']) {
        editor.open({ scheme });
        check('en');
        setLanguage('fr');
        localizeTree(editor.touchRoot);
        check('fr');
        setLanguage('en');
        localizeTree(editor.touchRoot);
        check('en');
        editor.close();
      }
    }
    assert.equal(storage.writes, 0, 'opening or switching selections never rewrites saved layouts');
  } finally {
    editor.close();
    setLanguage('en');
  }
});

test('dragging a control moves it on screen and saves once, as fractions, when the drag ends; a tap only selects', () => {
  const { app, editor, storage } = editorApp();
  editor.open({ scheme: 'joystick' });
  const jump = editor.touch.actionButtons.get('jump');
  const start = centre(jump); // (950, 450)
  const writes = storage.writes;
  jump.dispatch('pointerdown', { pointerId: 7, button: 0, ...start });
  assert.equal(editor.selected, 'jump');
  assert.ok(jump.classList.contains('is-editor-selected'), 'shown selected');
  assert.equal(editor.nameEl.textContent, 'Jump');
  assert.equal(editor.slider.disabled, false);
  jump.dispatch('pointermove', { pointerId: 7, clientX: start.clientX - 2, clientY: start.clientY });
  assert.equal(jump.style.translate ?? '', '', 'a wobble is not a drag');
  jump.dispatch('pointermove', { pointerId: 7, clientX: 500, clientY: 250 });
  assert.ok(editor.root.classList.contains('is-dragging'));
  assert.equal(jump.style.translate, '-450.0px -200.0px', 'the preview follows at once');
  assert.equal(storage.writes, writes, 'nothing saved mid-drag');
  jump.dispatch('pointermove', { pointerId: 7, clientX: 5000, clientY: -900 });
  assert.deepEqual(editor.touch.placements.get('jump').center, { x: 970, y: 30 }, 'never past the screen\'s edge');
  jump.dispatch('pointermove', { pointerId: 7, clientX: 500, clientY: 250 });
  jump.dispatch('pointerup', { pointerId: 7 });
  jump.dispatch('lostpointercapture', { pointerId: 7 });
  assert.equal(storage.writes, writes + 1, 'saved once, as the drag ends');
  assert.deepEqual(saved(storage).touchLayouts.joystick, { jump: { x: 0.5, y: 0.5, scale: 1 } });
  assert.deepEqual(saved(storage).touchLayouts.classic, {}, 'the other scheme untouched');
  assert.equal(editor.root.classList.contains('is-dragging'), false);
  // A tap: selected, nothing saved.
  const shield = editor.touch.actionButtons.get('shield');
  shield.dispatch('pointerdown', { pointerId: 8, button: 0, ...centre(shield) });
  shield.dispatch('pointerup', { pointerId: 8 });
  shield.click(1);
  assert.equal(editor.selected, 'shield');
  assert.equal(jump.classList.contains('is-editor-selected'), false);
  assert.equal(storage.writes, writes + 1);
  assert.equal(editor.moving, null, 'a pointer tap never starts keyboard moving');
  // A press on the screen away from every control clears the selection.
  editor.stage.dispatch('pointerdown', { pointerId: 9, button: 0 });
  assert.equal(editor.selected, null);
  editor.close();
  assert.deepEqual(app.settings.touchLayout('joystick'), { jump: { x: 0.5, y: 0.5, scale: 1 } });
});

test('keyboard and gamepad: Enter / A moves a control with the arrows in small steps, Back stops, Back again closes', () => {
  const { app, editor, storage, back } = editorApp();
  back.focus();
  editor.open({ scheme: 'joystick', returnFocus: back });
  const stick = editor.touch.stick;
  stick.focus();
  // Enter on the joystick (a plain element): starts moving it.
  stick.dispatch('keydown', { code: 'Enter', repeat: false });
  assert.equal(editor.moving, 'stick');
  assert.equal(editor.selected, 'stick');
  assert.ok(editor.root.classList.contains('is-moving'));
  assert.match(editor.live.textContent, /^Movement joystick: use the arrow keys or D-pad to move,/, 'announced');
  const home = { ...editor.touch.placements.get('stick').center };
  app.input.key('ArrowRight');
  app.nav.command('down', null); // D-pad
  const moved = editor.touch.placements.get('stick').center;
  assert.ok(Math.abs(moved.x - (home.x + TOUCH_NUDGE * 1000)) < 0.01, 'one small step right');
  assert.ok(Math.abs(moved.y - Math.min(home.y + TOUCH_NUDGE * 500, 500 - 60)) < 0.01, 'one small step down (kept on screen)');
  assert.equal(document.activeElement, stick, 'the arrows move the control, not the focus');
  const layout = saved(storage).touchLayouts.joystick.stick;
  assert.ok(layout.x > 0 && layout.x < 1 && layout.y > 0 && layout.y <= 1, 'saved as fractions');
  assert.equal(layout.scale, 1);
  // Back: stop moving, still in the editor.
  app.input.key('Escape');
  assert.equal(editor.moving, null);
  assert.equal(editor.isOpen, true);
  assert.match(editor.live.textContent, /placed/);
  app.input.key('ArrowLeft');
  assert.notEqual(document.activeElement, stick, 'arrows move the focus again');
  // Gamepad A on a button starts moving it; A again stops.
  const jump = editor.touch.actionButtons.get('jump');
  jump.focus();
  app.nav.command('confirm', null);
  assert.equal(editor.moving, 'jump');
  app.nav.command('left', null);
  jump.click(0);
  assert.equal(editor.moving, null);
  // Back again: closed, focus returned.
  app.nav.command('back', null);
  assert.equal(editor.isOpen, false);
  assert.equal(document.activeElement, back);
});

test('size: Smaller / Larger and the slider resize the selected control within the limits, its centre kept, saved each step', () => {
  const { editor, storage } = editorApp();
  editor.open({ scheme: 'classic' });
  const runRight = editor.touch.padButtons.get('runRight');
  runRight.dispatch('pointerdown', { pointerId: 1, button: 0, ...centre(runRight) });
  runRight.dispatch('pointerup', { pointerId: 1 });
  const home = { ...editor.touch.placements.get('runRight').center };
  editor.larger.click();
  assert.equal(runRight.style.scale, '1.1');
  assert.deepEqual(saved(storage).touchLayouts.classic.runRight.scale, 1.1);
  assert.equal(editor.sizeValue.textContent, '110%');
  assert.equal(editor.slider.getAttribute('aria-valuetext'), '110%');
  assert.equal(editor.slider.value, '110');
  assert.deepEqual(editor.touch.placements.get('runRight').center, home, 'grows round its centre');
  editor.slider.value = '150';
  editor.slider.dispatch('input');
  assert.equal(saved(storage).touchLayouts.classic.runRight.scale, 1.5);
  editor.slider.value = '900';
  editor.slider.dispatch('input');
  assert.equal(saved(storage).touchLayouts.classic.runRight.scale, 1.8, 'never past the largest size');
  for (let i = 0; i < 20; i++) editor.smaller.click();
  assert.equal(saved(storage).touchLayouts.classic.runRight.scale, 0.7, 'never below the smallest size');
  assert.equal(editor.smaller.disabled, false, 'at the limit it just holds (focus never falls off it)');
  // ← / → on the focused slider resize it too.
  editor.slider.focus();
  editor.app.nav.command('right', null);
  assert.equal(saved(storage).touchLayouts.classic.runRight.scale, 0.8);
  editor.app.nav.command('left', null);
  assert.equal(saved(storage).touchLayouts.classic.runRight.scale, 0.7);
  // The slider's range is the scale's.
  assert.deepEqual([editor.slider.getAttribute('min'), editor.slider.getAttribute('max'), editor.slider.getAttribute('step')], ['70', '180', '10']);
  assert.equal(editor.slider.getAttribute('aria-labelledby'), 'touch-editor-size-label touch-editor-name');
});

test('Reset to defaults puts only this scheme back on Alva\'s own layout, saved', () => {
  const { app, editor, storage } = editorApp();
  app.settings.setTouchLayout('joystick', { jump: { x: 0.4, y: 0.4, scale: 1.3 } });
  app.settings.setTouchLayout('classic', { runLeft: { x: 0.6, y: 0.4, scale: 1.2 }, attack2: { x: 0.2, y: 0.2, scale: 0.9 } });
  editor.open({ scheme: 'classic' });
  const runLeft = editor.touch.padButtons.get('runLeft');
  assert.notEqual(runLeft.style.translate, '', 'opened on the saved layout');
  editor.resetButton.click();
  for (const [id, node] of editor.touch.getControlElements('classic')) {
    assert.equal(node.style.translate, '', id);
    assert.equal(node.style.scale, '', id);
  }
  assert.deepEqual(saved(storage).touchLayouts.classic, {});
  assert.deepEqual(saved(storage).touchLayouts.joystick, { jump: { x: 0.4, y: 0.4, scale: 1.3 } }, 'Joystick keeps its own');
  assert.equal(editor.live.textContent, 'Layout reset to defaults.');
  editor.close();
  // The Joystick layout reopens as it was.
  editor.open({ scheme: 'joystick' });
  assert.notEqual(editor.touch.actionButtons.get('jump').style.translate, '');
  assert.equal(editor.touch.actionButtons.get('jump').style.scale, '1.3');
});

test('the editor saves as each change lands, through Settings only, and never stores pixels', () => {
  const code = read('js/ui/touch-layout-editor.js');
  assert.doesNotMatch(code, /localStorage|sessionStorage/);
  assert.match(code, /this\.app\.settings\.setTouchLayout\(this\.scheme, this\.layout\)/);
  assert.match(code, /this\.app\.settings\.resetTouchLayout\(this\.scheme\)/);
  const { editor, storage } = editorApp();
  editor.open({ scheme: 'joystick' });
  const attack2 = editor.touch.actionButtons.get('attack2');
  attack2.dispatch('pointerdown', { pointerId: 1, button: 0, ...centre(attack2) });
  attack2.dispatch('pointermove', { pointerId: 1, clientX: 123, clientY: 77 });
  attack2.dispatch('pointerup', { pointerId: 1 });
  const entry = saved(storage).touchLayouts.joystick.attack2;
  assert.deepEqual(Object.keys(entry), ['x', 'y', 'scale']);
  assert.ok(entry.x >= 0 && entry.x <= 1 && entry.y >= 0 && entry.y <= 1, 'fractions, not pixels');
  // A different screen: the same fractions land in the same relative place.
  editor.touchRoot.rect = { left: 0, top: 0, width: 2000, height: 1000 };
  editor.refresh();
  const { center } = editor.touch.placements.get('attack2');
  assert.ok(Math.abs(center.x / 2000 - entry.x) < 0.001 && Math.abs(center.y / 1000 - entry.y) < 0.001);
});

test('editor and dialog styles: the real controls always shown here, a selection ring, reduced motion respected', () => {
  const css = stylesheet();
  const rule = (selector) => css.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(rule('.touch-editor'), /position: fixed;/);
  assert.match(rule('.touch-editor'), /touch-action: none;/);
  assert.match(css, /\.touch-editor \.touch-controls \{ display: block; z-index: 1; \}/);
  assert.match(css, /\.touch-editor \.is-editor-selected \{ outline: 2px dashed var\(--accent-hi\); outline-offset: 4px; \}/);
  // The HUD sits above moved controls, so pause and More always take the press.
  assert.match(rule('.hud'), /z-index: 4;/);
  assert.match(rule('.touch-controls'), /z-index: 3;/);
  // Reduced motion: the global rule still ends every animation and transition.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \*, \*::before, \*::after \{\n    animation-duration: 0\.001ms !important;/);
});

test('legacy layouts discard Down alone and keep all other positions and scales, including in the editor', () => {
  for (const scheme of MOBILE_CONTROLS) {
    const kept = Object.fromEntries(TOUCH_CONTROL_IDS[scheme].map((id, i) => [id, { x: Math.round((0.1 + i * 0.02) * 100) / 100, y: 0.6, scale: 1.2 }]));
    const legacy = { ...kept, down: { x: 0.3, y: 0.4, scale: 1.7 } };
    assert.deepEqual(sanitizeTouchLayout(scheme, legacy), kept);
    const { tc } = touchControls(scheme);
    tc.setLayout(legacy);
    assert.deepEqual(tc.getLayout(), kept);
    assert.equal(tc.getControlElements().has('down'), false);
    assert.equal(tc.controlElement('down'), null);
    const { editor } = editorApp();
    editor.open({ scheme });
    assert.equal(editor.touch.getControlElements().has('down'), false);
    editor.close();
  }
});

test('Classic Mouvement controls move, resize, persist and reset independently while legacy layouts survive', () => {
  const { app, editor, storage } = editorApp();
  const legacy = { runLeft: { x: 0.2, y: 0.8, scale: 1.2 }, jump: { x: 0.8, y: 0.8, scale: 0.9 } };
  const joystick = { mouvementLeft: { x: 0.1, y: 0.5, scale: 1.4 } };
  app.settings.setTouchLayout('classic', legacy);
  app.settings.setTouchLayout('joystick', joystick);
  editor.open({ scheme: 'classic' });
  for (const [i, id] of ['mouvementLeft', 'mouvementRight'].entries()) {
    const node = editor.touch.controlElement(id);
    assert.equal(node.innerHTML, ICONS[id]);
    assert.equal(node.style.translate, '', 'new controls default without resetting old controls');
    node.dispatch('pointerdown', { pointerId: 40 + i, button: 0, ...centre(node) });
    node.dispatch('pointermove', { pointerId: 40 + i, clientX: 300 + i * 150, clientY: 220 });
    node.dispatch('pointerup', { pointerId: 40 + i });
    assert.equal(editor.selected, id);
    editor.slider.value = String(120 + i * 20);
    editor.slider.dispatch('input');
    assert.equal(saved(storage).touchLayouts.classic[id].scale, 1.2 + i * 0.2);
  }
  const layout = saved(storage).touchLayouts.classic;
  assert.deepEqual(layout.runLeft, legacy.runLeft);
  assert.deepEqual(layout.jump, legacy.jump);
  assert.deepEqual(saved(storage).touchLayouts.joystick, joystick);
  editor.close();
  app.settings = new Settings(storage);
  editor.open({ scheme: 'classic' });
  assert.deepEqual(editor.touch.getLayout(), layout);
  for (const id of ['mouvementLeft', 'mouvementRight']) assert.notEqual(editor.touch.controlElement(id).style.translate, '');
  editor.resetButton.click();
  for (const id of ['runLeft', 'runRight', 'mouvementLeft', 'mouvementRight']) {
    assert.equal(editor.touch.controlElement(id).style.translate, '');
    assert.equal(editor.touch.controlElement(id).style.scale, '');
  }
  assert.deepEqual(saved(storage).touchLayouts.classic, {});
  assert.deepEqual(saved(storage).touchLayouts.joystick, joystick);
  editor.close();
});
