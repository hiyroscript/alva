// Run with node --test tests/controls-ui.test.mjs (no dependencies).
// Touch controls and Help content for Basic Attack 1 (BA1) on a minimal fake
// DOM; layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';

class Node {
  parentNode = null;
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  dataset = {};
  html = '';
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
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
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
  dispatch(type, event) { for (const fn of this.listeners.get(type) || []) fn(event); }
  setPointerCapture() {}
  querySelectorAll(selector) {
    const match = (n) => (selector.startsWith('.') ? n.classNames.has(selector.slice(1)) : n.tagName === selector.toUpperCase());
    const out = [];
    const walk = (n) => n.children.forEach((c) => {
      if (!(c instanceof Element)) return;
      if (match(c)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

globalThis.Node = Node;
globalThis.document = {
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
};

const { TouchControls } = await import('../js/game/touch-controls.js');
const { buildHelp } = await import('../js/ui/help-content.js');
const { ACTION_LABELS, CONFIG } = await import('../js/config.js');

function touchControls() {
  const calls = [];
  const input = { setTouch: (action, held) => calls.push([action, held]) };
  const tc = new TouchControls(new Element('div'), input);
  tc.setEnabled(true);
  return { tc, calls };
}

test('the action1 touch button reads BA1 and is labelled Basic Attack 1', () => {
  const { tc } = touchControls();
  const b = tc.buttons.get('action1');
  assert.equal(b.textContent, 'BA1');
  assert.equal(b.querySelector('.tc-text').textContent, 'BA1');
  assert.equal(b.getAttribute('aria-label'), 'Basic Attack 1');
  assert.equal(b.getAttribute('data-action'), 'action1');
  // Same slot as before, but no longer dashed/dimmed as reserved.
  assert.ok(b.classList.contains('tc-a1'));
  assert.equal(b.classList.contains('is-pending'), false);
  for (const reserved of ['primary', 'special', 'action2']) {
    assert.ok(tc.buttons.get(reserved).classList.contains('is-pending'), `${reserved} stays reserved`);
  }
  assert.equal(tc.buttons.get('block').classList.contains('is-pending'), false);
  assert.equal(tc.buttons.get('jump').classList.contains('is-pending'), false);
});

test('pressing BA1 still dispatches the internal action1 input', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('action1');
  b.dispatch('pointerdown', { pointerId: 7, preventDefault() {} });
  assert.deepEqual(calls, [['action1', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  b.dispatch('pointerup', { pointerId: 7 });
  assert.deepEqual(calls, [['action1', true], ['action1', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('BA1 works alongside a held direction (multi-touch)', () => {
  const { tc, calls } = touchControls();
  tc.assign(1, 'right');
  tc.buttons.get('action1').dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
  assert.deepEqual(calls, [['right', true], ['action1', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(2).sort(), [['action1', false], ['right', false]]);
});

test('help labels action1 Basic Attack 1 and no longer marks it Reserved', () => {
  assert.equal(ACTION_LABELS.action1, 'Basic Attack 1');
  assert.deepEqual(CONFIG.bindings.action1, ['KeyU']);
  const help = buildHelp();
  const rows = Object.fromEntries(help.querySelectorAll('tr').slice(1).map((tr) => {
    const th = tr.querySelector('th');
    return [th.children[0].textContent, !!th.querySelector('.tag')];
  }));
  assert.equal(rows['Basic Attack 1'], false);
  assert.equal(rows.Primary, true);
  assert.equal(rows.Special, true);
  assert.equal(rows['Action 2'], true);
  assert.equal(rows.Block, false);
  assert.equal(rows['Action 1'], undefined);
});

test('the mobile diagram shows BA1, not A1', () => {
  const help = buildHelp();
  const dot = help.querySelector('.md-a1');
  assert.equal(dot.getAttribute('title'), 'Basic Attack 1');
  assert.equal(dot.querySelector('.md-icon').innerHTML, '<b>BA1</b>');
  const diagram = help.querySelector('.mobile-diagram');
  assert.match(diagram.getAttribute('aria-label'), /Basic Attack 1/);
  assert.doesNotMatch(diagram.getAttribute('aria-label'), /Action 1/);
  const legend = help.querySelector('.md-legend').textContent;
  assert.match(legend, /BA1/);
  assert.doesNotMatch(legend, /Action 1/);
});

test('the build notes say BA1 is available and the others are reserved', () => {
  const text = buildHelp().querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(text, /Basic Attack 1/);
  assert.match(text, /jump, fall and land/);
  assert.match(text, /Primary, Special and Action 2 .* reserved/);
  assert.doesNotMatch(text, /Action 1/);
  assert.doesNotMatch(text, /idle and run animations\./);
});
