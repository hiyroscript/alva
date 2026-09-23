// Run with node --test tests/controls-ui.test.mjs (no dependencies).
// Touch controls and Help content for Basic Attacks 1 and 2 (BA1, BA2) on a
// minimal fake DOM; layout and paint still need real-browser verification.
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
  for (const reserved of ['primary', 'special']) {
    assert.ok(tc.buttons.get(reserved).classList.contains('is-pending'), `${reserved} stays reserved`);
  }
  assert.equal(tc.buttons.get('block').classList.contains('is-pending'), false);
  assert.equal(tc.buttons.get('jump').classList.contains('is-pending'), false);
});

test('the action2 touch button reads BA2 and is labelled Basic Attack 2', () => {
  const { tc } = touchControls();
  const b = tc.buttons.get('action2');
  assert.equal(b.textContent, 'BA2');
  assert.equal(b.querySelector('.tc-text').textContent, 'BA2');
  assert.equal(b.getAttribute('aria-label'), 'Basic Attack 2');
  assert.equal(b.getAttribute('data-action'), 'action2');
  // Same slot as before, but no longer dashed/dimmed as reserved.
  assert.ok(b.classList.contains('tc-a2'));
  assert.equal(b.classList.contains('is-pending'), false);
});

test('only Primary and Special touch buttons are still reserved', () => {
  const { tc } = touchControls();
  const pending = [...tc.buttons].filter(([, b]) => b.classList.contains('is-pending')).map(([action]) => action);
  assert.deepEqual(pending.sort(), ['primary', 'special']);
  const texts = tc.root.querySelectorAll('.tc-text').map((t) => t.textContent);
  assert.deepEqual(texts, ['BA1', 'BA2']);
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

test('pressing BA2 dispatches the internal action2 input', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('action2');
  b.dispatch('pointerdown', { pointerId: 9, preventDefault() {} });
  assert.deepEqual(calls, [['action2', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  b.dispatch('pointerup', { pointerId: 9 });
  assert.deepEqual(calls, [['action2', true], ['action2', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
  assert.ok(calls.every(([action]) => action === 'action2'), 'no new ba2 input');
});

test('BA2 works alongside a held direction, and alongside BA1 (multi-touch)', () => {
  const { tc, calls } = touchControls();
  tc.assign(1, 'left');
  tc.buttons.get('action2').dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
  assert.deepEqual(calls, [['left', true], ['action2', true]]);
  tc.buttons.get('action1').dispatch('pointerdown', { pointerId: 3, preventDefault() {} });
  assert.deepEqual(calls.at(-1), ['action1', true]);
  tc.buttons.get('action2').dispatch('pointerup', { pointerId: 2 });
  assert.deepEqual(calls.at(-1), ['action2', false]);
  assert.ok(tc.buttons.get('left').classList.contains('is-pressed'), 'the direction is still held');
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['action1', false], ['left', false]]);
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
  assert.equal(rows.Block, false);
  assert.equal(rows['Action 1'], undefined);
});

test('help labels action2 Basic Attack 2 and no longer marks it Reserved', () => {
  assert.equal(ACTION_LABELS.action2, 'Basic Attack 2');
  assert.deepEqual(CONFIG.bindings.action2, ['KeyI']);
  const help = buildHelp();
  const rows = help.querySelectorAll('tr').slice(1).map((tr) => {
    const th = tr.querySelector('th');
    return { label: th.children[0].textContent, reserved: !!th.querySelector('.tag'), keys: tr.querySelector('td').textContent };
  });
  const ba2 = rows.find((r) => r.label === 'Basic Attack 2');
  assert.ok(ba2, 'Basic Attack 2 row');
  assert.equal(ba2.reserved, false);
  assert.equal(ba2.keys, 'I');
  assert.equal(rows.find((r) => r.label === 'Basic Attack 1').keys, 'U');
  assert.equal(rows.find((r) => r.label === 'Action 2'), undefined);
  assert.deepEqual(rows.filter((r) => r.reserved).map((r) => r.label), ['Primary', 'Special']);
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

test('the mobile diagram shows BA2, not A2', () => {
  const help = buildHelp();
  const dot = help.querySelector('.md-a2');
  assert.equal(dot.getAttribute('title'), 'Basic Attack 2');
  assert.equal(dot.querySelector('.md-icon').innerHTML, '<b>BA2</b>');
  const diagram = help.querySelector('.mobile-diagram');
  assert.match(diagram.getAttribute('aria-label'), /Basic Attack 2 \(BA2\)/);
  assert.doesNotMatch(diagram.getAttribute('aria-label'), /Action 2/);
  const legend = help.querySelector('.md-legend').textContent;
  assert.match(legend, /BA1 · BA2/);
  assert.doesNotMatch(legend, /Action 2/);
  const notes = help.querySelectorAll('.info-note').map((p) => p.textContent).join(' ');
  assert.match(notes, /dashed Primary and Special buttons are reserved/);
  assert.match(notes, /LB for Basic Attack 2/);
  assert.doesNotMatch(notes, /Action 2/);
});

test('the build notes say BA1 and BA2 are available and Primary and Special are reserved', () => {
  const text = buildHelp().querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(text, /Basic Attack 1/);
  assert.match(text, /Basic Attack 2/);
  assert.match(text, /on the ground and in the air/);
  assert.match(text, /BA1 \(action1\)/);
  assert.match(text, /BA2 \(action2\)/);
  assert.match(text, /jump, fall and land/);
  assert.match(text, /Primary and Special .* reserved/);
  assert.match(text, /training CPU never attacks/);
  assert.doesNotMatch(text, /Action [12]/);
  assert.doesNotMatch(text, /idle and run animations\./);
});
