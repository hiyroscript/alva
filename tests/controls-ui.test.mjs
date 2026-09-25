// Run with node --test tests/controls-ui.test.mjs (no dependencies).
// Touch controls and Help content for Basic Attacks 1 and 2 (BA1, BA2),
// Charge, Throw (the primary action) and Defense (#0001's Dodge) on a
// minimal fake DOM; layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  getBoundingClientRect() { return this.rect; }
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
const { ICONS } = await import('../js/ui/icons.js');

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
  assert.ok(tc.buttons.get('special').classList.contains('is-pending'), 'special stays reserved');
  assert.equal(tc.buttons.get('primary').classList.contains('is-pending'), false, 'Throw is live');
  assert.equal(tc.buttons.get('defense').classList.contains('is-pending'), false);
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

test('only the Special touch button is still reserved', () => {
  const { tc } = touchControls();
  const pending = [...tc.buttons].filter(([, b]) => b.classList.contains('is-pending')).map(([action]) => action);
  assert.deepEqual(pending, ['special']);
  const texts = tc.root.querySelectorAll('.tc-text').map((t) => t.textContent);
  assert.deepEqual(texts, ['C', 'T', 'D', 'BA1', 'BA2']);
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
  assert.equal(rows.Throw, false);
  assert.equal(rows.Primary, undefined);
  assert.equal(rows.Special, true);
  assert.equal(rows.Defense, false);
  assert.equal(rows.Block, undefined);
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
  assert.deepEqual(rows.filter((r) => r.reserved).map((r) => r.label), ['Special']);
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
  assert.match(notes, /only the dashed Special button is reserved/);
  assert.match(notes, /LB for Basic Attack 2/);
  assert.doesNotMatch(notes, /Action 2/);
});

test('the build notes say BA1, BA2 and Throw are available and only Special is reserved', () => {
  const text = buildHelp().querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(text, /Basic Attack 1/);
  assert.match(text, /Basic Attack 2/);
  assert.match(text, /on the ground and in the air/);
  assert.match(text, /BA1 \(action1\)/);
  assert.match(text, /BA2 \(action2\)/);
  assert.match(text, /jump, fall and land/);
  assert.match(text, /Only Special is still reserved/);
  assert.doesNotMatch(text, /Primary/);
  assert.match(text, /training CPU never attacks/);
  assert.doesNotMatch(text, /Action [12]/);
  assert.doesNotMatch(text, /idle and run animations\./);
});

// ---- Charge ---------------------------------------------------------------

// Lays the lower-left cluster out left to right, 50 px apart.
function layoutDpad(tc) {
  ['left', 'charge', 'right'].forEach((action, i) => {
    tc.buttons.get(action).rect = { left: i * 50, top: 0, width: 40, height: 40 };
  });
  return (action) => ({ clientX: ['left', 'charge', 'right'].indexOf(action) * 50 + 20, clientY: 20 });
}

test('the middle lower-left touch button is Charge: text C, labelled Charge, no Down arrow', () => {
  const { tc } = touchControls();
  const [left, middle, right] = tc.dpad.children;
  assert.equal(left, tc.buttons.get('left'));
  assert.equal(middle, tc.buttons.get('charge'));
  assert.equal(right, tc.buttons.get('right'));
  assert.equal(tc.dpad.children.length, 3, 'a replacement, not an extra button');
  assert.equal(tc.buttons.has('down'), false);

  assert.equal(middle.textContent, 'C');
  assert.equal(middle.querySelector('.tc-text').textContent, 'C');
  assert.equal(middle.getAttribute('aria-label'), 'Charge');
  assert.equal(middle.getAttribute('data-action'), 'charge');
  assert.ok(middle.classList.contains('tc-charge'));
  assert.equal(middle.classList.contains('tc-down'), false);
  assert.equal(middle.classList.contains('is-pending'), false);
  assert.notEqual(middle.innerHTML, ICONS.down);
  assert.doesNotMatch(middle.innerHTML, /<svg/);
  // Still part of the lower-left cluster, not the attack cluster.
  assert.ok(tc.dpad.classList.contains('tc-dpad'));
  assert.equal(tc.dpad.getAttribute('aria-label'), 'Movement and Charge');
  assert.equal(tc.actions.children.includes(middle), false);
});

test('holding C dispatches charge for the whole pointer hold', () => {
  const { tc, calls } = touchControls();
  const at = layoutDpad(tc);
  const b = tc.buttons.get('charge');
  tc.dpad.dispatch('pointerdown', { pointerId: 4, ...at('charge'), preventDefault() {} });
  assert.deepEqual(calls, [['charge', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  // Small thumb movement inside C keeps it held, with no repeat dispatches.
  for (const dx of [-6, 3, 8, 0]) {
    tc.dpad.dispatch('pointermove', { pointerId: 4, clientX: at('charge').clientX + dx, clientY: 22 });
    assert.ok(b.classList.contains('is-pressed'));
  }
  assert.deepEqual(calls, [['charge', true]]);
  tc.dpad.dispatch('pointerup', { pointerId: 4 });
  assert.deepEqual(calls, [['charge', true], ['charge', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('sliding Left → C → Right hands the hold from action to action', () => {
  const { tc, calls } = touchControls();
  const at = layoutDpad(tc);
  tc.dpad.dispatch('pointerdown', { pointerId: 1, ...at('left'), preventDefault() {} });
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('charge') });
  assert.deepEqual(calls, [['left', true], ['left', false], ['charge', true]]);
  assert.ok(tc.buttons.get('charge').classList.contains('is-pressed'));
  assert.equal(tc.buttons.get('left').classList.contains('is-pressed'), false);
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('right') });
  assert.deepEqual(calls.slice(3), [['charge', false], ['right', true]]);
  assert.equal(tc.buttons.get('charge').classList.contains('is-pressed'), false);
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('charge') });
  tc.dpad.dispatch('pointerup', { pointerId: 1 });
  assert.deepEqual(calls.slice(5), [['right', false], ['charge', true], ['charge', false]]);
  assert.equal(tc.counts.get('charge'), 0);
});

test('a cancelled or lost Charge pointer, or releaseAll(), never leaves Charge stuck', () => {
  for (const end of ['pointercancel', 'lostpointercapture']) {
    const { tc, calls } = touchControls();
    const at = layoutDpad(tc);
    tc.dpad.dispatch('pointerdown', { pointerId: 2, ...at('charge'), preventDefault() {} });
    tc.dpad.dispatch(end, { pointerId: 2 });
    assert.deepEqual(calls, [['charge', true], ['charge', false]], end);
    assert.equal(tc.buttons.get('charge').classList.contains('is-pressed'), false);
  }
  const { tc, calls } = touchControls();
  const at = layoutDpad(tc);
  tc.dpad.dispatch('pointerdown', { pointerId: 3, ...at('charge'), preventDefault() {} });
  tc.releaseAll();
  assert.deepEqual(calls, [['charge', true], ['charge', false]]);
  assert.equal(tc.buttons.get('charge').classList.contains('is-pressed'), false);
  // Disabling (pause, result screen) releases it too.
  tc.dpad.dispatch('pointerdown', { pointerId: 5, ...at('charge'), preventDefault() {} });
  tc.setEnabled(false);
  assert.deepEqual(calls.at(-1), ['charge', false]);
});

test('Charge works alongside BA1, BA2, Defense and Jump (multi-touch)', () => {
  for (const other of ['action1', 'action2', 'defense', 'jump']) {
    const { tc, calls } = touchControls();
    const at = layoutDpad(tc);
    tc.dpad.dispatch('pointerdown', { pointerId: 1, ...at('charge'), preventDefault() {} });
    tc.buttons.get(other).dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
    assert.deepEqual(calls, [['charge', true], [other, true]], other);
    tc.buttons.get(other).dispatch('pointerup', { pointerId: 2 });
    assert.deepEqual(calls.at(-1), [other, false]);
    assert.ok(tc.buttons.get('charge').classList.contains('is-pressed'), `Charge still held after ${other}`);
    assert.equal(tc.counts.get('charge'), 1);
    tc.dpad.dispatch('pointerup', { pointerId: 1 });
    assert.deepEqual(calls.at(-1), ['charge', false]);
  }
});

test('help lists Charge on S / ↓ in place of Down / drop through', () => {
  assert.equal(ACTION_LABELS.charge, 'Charge');
  assert.equal(ACTION_LABELS.down, undefined);
  assert.deepEqual(CONFIG.bindings.charge, ['KeyS', 'ArrowDown']);
  const help = buildHelp();
  const rows = help.querySelectorAll('tr').slice(1).map((tr) => ({
    label: tr.querySelector('th').children[0].textContent,
    reserved: !!tr.querySelector('th').querySelector('.tag'),
    keys: tr.querySelector('td').querySelectorAll('kbd').map((k) => k.textContent),
  }));
  assert.deepEqual(rows.map((r) => r.label).slice(0, 4), ['Move left', 'Move right', 'Charge', 'Jump']);
  const charge = rows.find((r) => r.label === 'Charge');
  assert.deepEqual(charge.keys, ['S', '↓']);
  assert.equal(charge.reserved, false);
  const text = help.textContent;
  assert.doesNotMatch(text, /drop through/i);
  assert.doesNotMatch(text, /crouch/i);
  assert.doesNotMatch(text, /Down \/ drop/);
  assert.doesNotMatch(text, /(Hold|Press) Down/);
});

test('the mobile diagram shows C for Charge between Left and Right', () => {
  const help = buildHelp();
  assert.equal(help.querySelector('.md-down'), null);
  const dot = help.querySelector('.md-charge');
  assert.ok(dot, 'Charge dot');
  assert.equal(dot.getAttribute('title'), 'Charge');
  const icon = dot.querySelector('.md-icon').innerHTML;
  assert.equal(icon, '<b>C</b>');
  assert.notEqual(icon, ICONS.down);
  const screen = help.querySelector('.md-screen').children;
  const order = screen.map((d) => d.getAttribute('title'));
  assert.deepEqual(order.slice(1, 4), ['Left', 'Charge', 'Right']);
  const diagram = help.querySelector('.mobile-diagram');
  assert.match(diagram.getAttribute('aria-label'), /Left, Charge and Right controls at the lower left/);
  assert.doesNotMatch(diagram.getAttribute('aria-label'), /Down/);
  const legend = help.querySelector('.md-legend').textContent;
  assert.match(legend, /Left · Charge · Right/);
  assert.doesNotMatch(legend, /Down/);
});

test('help explains that Charge is held, loops while held, and speeds up the charged cooldowns; no Health or Energy', () => {
  const help = buildHelp();
  const items = help.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Hold Charge \(S \/ ↓, or C on touch\) while grounded/);
  assert.match(items, /Charge must be held: release it to stop charging/);
  assert.match(items, /two-frame startup once, then loops its sustained pose/);
  assert.match(items, /own 5-second cooldown/);
  assert.match(items, /Charging makes both cooldowns recover twice as fast/);
  assert.doesNotMatch(help.textContent, /Energy|health/i, 'no Health or Energy anywhere in Help');
  const notes = help.querySelectorAll('.info-note').map((p) => p.textContent).join(' ');
  assert.match(notes, /down to Charge/);
  assert.match(notes, /C is Charge: hold it to charge/);
  const build = help.querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(build, /held Charge stance/);
});

test('help explains the Charged BA1 Clone Attack in the Charge & cooldowns card, with no new control row', () => {
  const help = buildHelp();
  const card = help.querySelectorAll('.info-card').find((c) => /Charge & cooldowns/.test(c.textContent));
  const items = card.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Hold Charge first, then press BA1 to summon a clone behind the opponent/);
  assert.match(items, /The clone appears .*, performs BA1 and disappears/);
  assert.match(items, /keeps charging for as long as you hold Charge/);
  assert.match(items, /Letting go of Charge as you press BA1 gives a normal BA1/);
  assert.match(items, /It starts the moment the move is used, hit or miss/);
  assert.match(items, /While it is cooling down, the charged press does nothing/);
  // The combo uses the existing Charge and BA1 controls.
  const rows = help.querySelectorAll('tr').map((tr) => tr.textContent);
  assert.ok(!rows.some((r) => /clone/i.test(r)), 'no control row for it');
});

// ---- Defense (#0001's Dodge) ---------------------------------------------

const CSS = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('the old Block touch slot is now Defense: reads exactly D, labelled Defense, no shield', () => {
  const { tc } = touchControls();
  assert.equal(tc.buttons.has('block'), false);
  const b = tc.buttons.get('defense');
  assert.equal(b.textContent, 'D');
  assert.equal(b.querySelector('.tc-text').textContent, 'D');
  assert.equal(b.getAttribute('aria-label'), 'Defense');
  assert.equal(b.getAttribute('data-action'), 'defense');
  assert.ok(b.classList.contains('tc-defense'));
  assert.equal(b.classList.contains('tc-block'), false);
  assert.equal(b.classList.contains('is-pending'), false);
  assert.doesNotMatch(b.innerHTML, /<svg/);
  assert.equal(b.querySelector('svg'), null);
  for (const word of ['Block', 'Dodge', 'DEF']) assert.doesNotMatch(b.textContent, new RegExp(word));
  // The shield icon is gone entirely; nothing else used it.
  assert.equal(ICONS.block, undefined);
  // Same place in the cluster: third of the staggered action buttons.
  assert.deepEqual(tc.actions.children.map((c) => c.getAttribute('data-action')),
    ['primary', 'special', 'defense', 'action1', 'action2', 'jump']);
});

test('the Defense touch button keeps the old Block coordinates', () => {
  assert.match(CSS, /\.tc-defense \{ right: calc\(var\(--tc-pitch\) \* 0\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
  assert.match(CSS, /\.md-defense \{ left: 85%; top: 54%; \}/);
  assert.doesNotMatch(CSS, /\.tc-block\b/);
  assert.doesNotMatch(CSS, /\.md-block\b/);
});

test('holding D dispatches defense on pointer down and releases it on pointer up', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('defense');
  b.dispatch('pointerdown', { pointerId: 6, preventDefault() {} });
  assert.deepEqual(calls, [['defense', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  b.dispatch('pointerup', { pointerId: 6 });
  assert.deepEqual(calls, [['defense', true], ['defense', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
  assert.ok(calls.every(([action]) => action === 'defense'), 'no block or dodge input');
  // Alongside a held direction, too.
  tc.assign(1, 'right');
  b.dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
  assert.deepEqual(calls.slice(2), [['right', true], ['defense', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['defense', false], ['right', false]]);
});

test('help lists Defense on L, never a generic Block control', () => {
  assert.equal(ACTION_LABELS.defense, 'Defense');
  assert.equal(ACTION_LABELS.block, undefined);
  assert.deepEqual(CONFIG.bindings.defense, ['KeyL']);
  assert.equal(CONFIG.bindings.block, undefined);
  const help = buildHelp();
  const rows = help.querySelectorAll('tr').slice(1).map((tr) => ({
    label: tr.querySelector('th').children[0].textContent,
    reserved: !!tr.querySelector('th').querySelector('.tag'),
    keys: tr.querySelector('td').querySelectorAll('kbd').map((k) => k.textContent),
  }));
  const defense = rows.find((r) => r.label === 'Defense');
  assert.ok(defense, 'Defense row');
  assert.deepEqual(defense.keys, ['L']);
  assert.equal(defense.reserved, false);
  assert.equal(rows.find((r) => r.label === 'Block'), undefined);
  assert.deepEqual(rows.map((r) => r.label).slice(4, 8), ['Throw', 'Special', 'Defense', 'Basic Attack 1']);
  assert.doesNotMatch(help.textContent, /\bblock\b/i, 'no Block anywhere in Help');
});

test('the mobile diagram shows D for Defense in the old Block spot and says #0001 dodges', () => {
  const help = buildHelp();
  assert.equal(help.querySelector('.md-block'), null);
  const dot = help.querySelector('.md-defense');
  assert.ok(dot, 'Defense dot');
  assert.equal(dot.getAttribute('title'), 'Defense');
  assert.equal(dot.querySelector('.md-icon').innerHTML, '<b>D</b>');
  assert.doesNotMatch(dot.querySelector('.md-icon').innerHTML, /<svg/);
  const order = help.querySelector('.md-screen').children.map((d) => d.getAttribute('title'));
  assert.deepEqual(order.slice(4, 8), ['Throw', 'Special', 'Defense', 'Basic Attack 1']);
  const label = help.querySelector('.mobile-diagram').getAttribute('aria-label');
  assert.match(label, /Throw \(T\), Special, Defense \(D\), Basic Attack 1/);
  assert.match(label, /#0001 uses Dodge as its Defense/);
  assert.doesNotMatch(label, /Block/);
  const legend = help.querySelector('.md-legend').textContent;
  assert.match(legend, /Special · D, BA1/);
  assert.match(legend, /#0001 uses Dodge as its Defense/);
});

test('help explains Defense, #0001\'s Dodge and the Charge release', () => {
  const help = buildHelp();
  const notes = help.querySelectorAll('.info-note').map((p) => p.textContent).join(' ');
  assert.match(notes, /RB \/ RT for Defense/);
  assert.match(notes, /D is Defense, which #0001 uses to Dodge/);
  const items = help.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Defense \(L, RB \/ RT, or D on touch\) is the shared defensive button/);
  assert.match(items, /#0001 dodges/);
  assert.match(items, /One press, one Dodge/);
  assert.match(items, /Holding Defense does not repeat it/);
  assert.match(items, /never takes chip damage/);
  assert.match(items, /Let go and #0001 shows its first Charge pose for a moment/);
  assert.match(items, /Jump, Throw and Defense \(Dodge\) take over from Charge at once/);
  const build = help.querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(build, /Defense is a ground and mid-air Dodge for #0001/);
  assert.doesNotMatch(build, /guard state/);
});

// ---- Throw (the primary action) -------------------------------------------

test('the old Primary touch slot is Throw: reads exactly T, labelled Throw, solid, dispatches primary', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('primary');
  assert.equal(b.textContent, 'T');
  assert.equal(b.querySelector('.tc-text').textContent, 'T');
  assert.equal(b.querySelector('svg'), null);
  assert.doesNotMatch(b.innerHTML, /<svg/);
  assert.equal(b.getAttribute('aria-label'), 'Throw');
  assert.equal(b.getAttribute('data-action'), 'primary');
  assert.ok(b.classList.contains('tc-throw'));
  assert.equal(b.classList.contains('tc-primary'), false);
  assert.equal(b.classList.contains('is-pending'), false, 'no dashed outline');
  for (const word of ['Primary', 'THROW', 'SH']) assert.doesNotMatch(b.textContent, new RegExp(word));
  // Still first in the cluster: the large upper-right button.
  assert.equal(tc.actions.children[0], b);
  b.dispatch('pointerdown', { pointerId: 3, preventDefault() {} });
  assert.deepEqual(calls, [['primary', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  b.dispatch('pointerup', { pointerId: 3 });
  assert.deepEqual(calls, [['primary', true], ['primary', false]]);
  // Alongside a held direction, too.
  tc.assign(1, 'right');
  b.dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
  assert.deepEqual(calls.slice(2), [['right', true], ['primary', true]]);
  tc.releaseAll();
  // The star icon is gone: nothing uses it any more.
  assert.equal(ICONS.primary, undefined);
  assert.ok(ICONS.special, 'Special keeps its icon');
});

test('the Throw touch button keeps the old Primary coordinates and size', () => {
  assert.match(CSS, /\.tc-throw \{\n  right: calc\(var\(--tc-pitch\) \* 0\.02\);\n  bottom: calc\(var\(--tc-pitch\) \* 1\.74\);\n  width: calc\(var\(--tc\) \* 1\.12\);\n  height: calc\(var\(--tc\) \* 1\.12\);/);
  assert.match(CSS, /\.md-throw \{ left: 88%; top: 27%; width: 12\.5%;/);
  assert.doesNotMatch(CSS, /\.tc-primary\b/);
  assert.doesNotMatch(CSS, /\.md-primary\b/);
});

test('help lists Throw on J, active, and only Special as reserved', () => {
  assert.equal(ACTION_LABELS.primary, 'Throw');
  assert.deepEqual(CONFIG.bindings.primary, ['KeyJ']);
  const help = buildHelp();
  const rows = help.querySelectorAll('tr').slice(1).map((tr) => ({
    label: tr.querySelector('th').children[0].textContent,
    reserved: !!tr.querySelector('th').querySelector('.tag'),
    keys: tr.querySelector('td').querySelectorAll('kbd').map((k) => k.textContent),
  }));
  const row = rows.find((r) => r.label === 'Throw');
  assert.ok(row, 'Throw row');
  assert.deepEqual(row.keys, ['J']);
  assert.equal(row.reserved, false);
  assert.equal(rows.find((r) => r.label === 'Primary'), undefined);
  assert.deepEqual(rows.filter((r) => r.reserved).map((r) => r.label), ['Special']);
  const text = help.textContent;
  assert.doesNotMatch(text, /Primary/, 'no player-facing Primary left');
  assert.match(text, /X \/ Square for Throw/);
  assert.match(text, /only the dashed Special button is reserved/);
});

test('the mobile diagram shows T for Throw in the upper-right slot', () => {
  const help = buildHelp();
  assert.equal(help.querySelector('.md-primary'), null);
  const dot = help.querySelector('.md-throw');
  assert.ok(dot, 'Throw dot');
  assert.equal(dot.getAttribute('title'), 'Throw');
  assert.equal(dot.querySelector('.md-icon').innerHTML, '<b>T</b>');
  const order = help.querySelector('.md-screen').children.map((d) => d.getAttribute('title'));
  assert.deepEqual(order.slice(4), ['Throw', 'Special', 'Defense', 'Basic Attack 1', 'Basic Attack 2', 'Jump']);
  const label = help.querySelector('.mobile-diagram').getAttribute('aria-label');
  assert.match(label, /Throw \(T\)/);
  assert.doesNotMatch(label, /Primary/);
  const legend = help.querySelector('.md-legend').textContent;
  assert.match(legend, /T, Special · D, BA1 · BA2 · Jump/);
  assert.match(legend, /Throw; #0001 throws a shuriken\./);
  assert.match(legend, /Defense; #0001 uses Dodge as its Defense\./);
});

test('help explains Throw and lists it in this build', () => {
  const help = buildHelp();
  const items = help.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Throw \(J, X \/ Square, or T on touch\) makes #0001 throw one shuriken per press/);
  assert.match(items, /flies straight the way #0001 was facing/);
  assert.match(items, /ground only/);
  const build = help.querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(build, /Throw \(the primary action\) throws an animated shuriken/);
  assert.match(build, /BA1/);
  assert.match(build, /BA2/);
  assert.match(build, /Charge/);
  assert.match(build, /Dodge/);
  assert.match(build, /Only Special is still reserved/);
  assert.match(build, /training CPU never attacks/);
  assert.doesNotMatch(build, /mid-air Throw/i);
});
