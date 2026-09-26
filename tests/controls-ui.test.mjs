// Run with node --test tests/controls-ui.test.mjs (no dependencies).
// The touch controls and Help content on a minimal fake DOM: the icon-based
// combat buttons (#0001's Shuriken, Punch and Kick from its mobileAbilities,
// the universal Shield), their character-aware refresh, the unchanged
// internal inputs behind them (primary, defense, action1, action2), Charge,
// the Help diagram and the page-zoom guard. Layout, paint and real gestures
// still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

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
const { ABILITY_ACTIONS, mobileAbility } = await import('../js/ui/mobile-abilities.js');
const { getCharacter } = await import('../js/data/characters.js');

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const CSS = read('styles.css');
const DEF_0001 = getCharacter('0001');

// Touch controls wired to a recording input; `def` is the fighter they
// present (#0001 unless given; null leaves them neutral).
function touchControls(def = DEF_0001) {
  const calls = [];
  const input = { setTouch: (action, held) => calls.push([action, held]) };
  const tc = new TouchControls(new Element('div'), input);
  if (def) tc.setCharacter(def);
  tc.setEnabled(true);
  return { tc, calls, input };
}

const press = (b, pointerId) => b.dispatch('pointerdown', { pointerId, preventDefault() {} });
const lift = (b, pointerId) => b.dispatch('pointerup', { pointerId });
// Everything a player could read on a touch button: its text, and any text
// inside its markup (an <svg> has none).
const visibleText = (b) => b.textContent + b.innerHTML.replace(/<[^>]*>/g, '');
const CODE_LABELS = /\b(T|D|BA1|BA2|A1|A2)\b/;

// ---- Ability icons ----------------------------------------------------------

test('the four ability icons are inline SVG glyphs in currentColor, hidden from assistive technology', () => {
  for (const name of ['shuriken', 'shield', 'punch', 'kick']) {
    const icon = ICONS[name];
    assert.equal(typeof icon, 'string', name);
    assert.match(icon, /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon( icon--fill)?">/, `${name}: the shared icon helper`);
    assert.match(icon, /<\/svg>$/);
    // No colours of their own: .icon strokes and .icon--fill fills in currentColor.
    assert.doesNotMatch(icon, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(fill|stroke)="(?!none)|style=/i, `${name}: no hard-coded colour`);
    assert.doesNotMatch(icon, /<(image|text|use)\b|href=|\.png/i, `${name}: a vector glyph, no image, text or external reference`);
    assert.doesNotMatch(icon.replace(/<[^>]*>/g, ''), /\S/, `${name}: no text, emoji or characters`);
  }
  // The throwing star, fist and leg are filled silhouettes; the shield is an outline.
  assert.match(ICONS.shuriken, /class="icon icon--fill"/);
  assert.match(ICONS.punch, /class="icon icon--fill"/);
  assert.match(ICONS.kick, /class="icon icon--fill"/);
  assert.match(ICONS.shield, /class="icon"/);
  // The shuriken's centre hole is cut out of the star.
  assert.match(ICONS.shuriken, /fill-rule="evenodd"/);
  // Four distinct glyphs, none of them an existing icon.
  const set = new Set(['shuriken', 'shield', 'punch', 'kick', 'special', 'jump'].map((n) => ICONS[n]));
  assert.equal(set.size, 6);
  // The shield icon that Defense once lost is back only as the universal Shield.
  assert.equal(ICONS.block, undefined);
});

test('no image assets for the ability glyphs: the controls never load a PNG', () => {
  for (const file of ['js/game/touch-controls.js', 'js/ui/mobile-abilities.js', 'js/ui/icons.js']) {
    assert.doesNotMatch(read(file), /\.png|\.jpg|\.svg['"]|new Image|<img/i, file);
  }
});

// ---- #0001's mobile abilities -----------------------------------------------

test('#0001 authors its mobile abilities as small, declarative UI data', () => {
  assert.deepEqual(DEF_0001.mobileAbilities, {
    primary: { label: 'Shuriken', icon: 'shuriken' },
    action1: { label: 'Punch', icon: 'punch' },
    action2: { label: 'Kick', icon: 'kick' },
  });
  // Every icon it names exists; the Shield is universal, not #0001's.
  for (const { icon } of Object.values(DEF_0001.mobileAbilities)) assert.ok(ICONS[icon], icon);
  assert.equal(DEF_0001.mobileAbilities.defense, undefined);
  assert.deepEqual([...ABILITY_ACTIONS], ['primary', 'action1', 'action2']);
  // UI only: no combat module reads it, and the controls never guess an
  // icon from attack data or animation names.
  const code = (file) => read(file).replace(/\/\/.*$/gm, '');
  for (const file of readdirSync(new URL('js/game/', ROOT))) {
    if (file === 'touch-controls.js') continue; // the UI that presents it
    assert.doesNotMatch(code(`js/game/${file}`), /mobileAbilities|mobile-abilities/, `${file} never reads mobileAbilities`);
  }
  for (const file of ['js/game/touch-controls.js', 'js/ui/mobile-abilities.js']) {
    assert.doesNotMatch(code(file), /\.(attacks|animations?|chargedActions|projectiles)\b|\bdef\.actions\b|'0001'|displayName/, `${file}: no inference, no fighter special case`);
  }
});

test('mobileAbility falls back safely: generic names and neutral glyphs, never a crash', () => {
  assert.deepEqual(mobileAbility(DEF_0001, 'primary'), { label: 'Shuriken', icon: ICONS.shuriken });
  assert.deepEqual(mobileAbility(DEF_0001, 'action1'), { label: 'Punch', icon: ICONS.punch });
  assert.deepEqual(mobileAbility(DEF_0001, 'action2'), { label: 'Kick', icon: ICONS.kick });
  for (const def of [null, undefined, {}, { mobileAbilities: {} }]) {
    assert.deepEqual(mobileAbility(def, 'primary'), { label: ACTION_LABELS.primary, icon: ICONS.ring });
    assert.deepEqual(mobileAbility(def, 'action1'), { label: ACTION_LABELS.action1, icon: ICONS.pip1 });
    assert.deepEqual(mobileAbility(def, 'action2'), { label: ACTION_LABELS.action2, icon: ICONS.pip2 });
  }
  // Half-authored: whatever is missing or unknown falls back on its own.
  const partial = { mobileAbilities: { primary: { label: 'Kunai' }, action1: { icon: 'nope', label: 'Jab' } } };
  assert.deepEqual(mobileAbility(partial, 'primary'), { label: 'Kunai', icon: ICONS.ring });
  assert.deepEqual(mobileAbility(partial, 'action1'), { label: 'Jab', icon: ICONS.pip1 });
  assert.deepEqual(mobileAbility(partial, 'action2'), { label: 'Basic Attack 2', icon: ICONS.pip2 });
  // The three fallbacks tell the buttons apart and never borrow #0001's look.
  const glyphs = ['ring', 'pip1', 'pip2'].map((n) => ICONS[n]);
  assert.equal(new Set(glyphs).size, 3);
  for (const g of glyphs) assert.ok(![ICONS.shuriken, ICONS.punch, ICONS.kick].includes(g));
});

// ---- Touch buttons: #0001 -----------------------------------------------------

test('#0001\'s Throw button shows the shuriken icon, labelled Shuriken, and still dispatches primary', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('primary');
  assert.equal(b.innerHTML, ICONS.shuriken);
  assert.match(b.innerHTML, /^<svg/);
  assert.equal(b.querySelector('.tc-text'), null);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no visible T');
  assert.doesNotMatch(visibleText(b), /\S/, 'icon only, no text beside it');
  assert.equal(b.getAttribute('aria-label'), 'Shuriken');
  assert.equal(b.getAttribute('data-action'), 'primary');
  assert.ok(b.classList.contains('tc-throw'), 'the same large upper-right slot');
  assert.ok(b.classList.contains('tc-ability'));
  assert.equal(b.classList.contains('is-pending'), false, 'solid, not reserved');
  assert.equal(tc.actions.children[0], b, 'still first in the cluster');
  press(b, 3);
  assert.deepEqual(calls, [['primary', true]]);
  assert.ok(b.classList.contains('is-pressed'), 'immediate press feedback');
  lift(b, 3);
  assert.deepEqual(calls, [['primary', true], ['primary', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
  // Alongside a held direction, too.
  tc.assign(1, 'right');
  press(b, 2);
  assert.deepEqual(calls.slice(2), [['right', true], ['primary', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['primary', false], ['right', false]]);
});

test('#0001\'s BA1 button shows the punch icon, labelled Punch, and still dispatches action1', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('action1');
  assert.equal(b.innerHTML, ICONS.punch);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no BA1 text');
  assert.doesNotMatch(visibleText(b), /\S/);
  assert.equal(b.getAttribute('aria-label'), 'Punch');
  assert.equal(b.getAttribute('data-action'), 'action1');
  assert.ok(b.classList.contains('tc-a1'));
  assert.equal(b.classList.contains('is-pending'), false);
  press(b, 7);
  assert.deepEqual(calls, [['action1', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  lift(b, 7);
  assert.deepEqual(calls, [['action1', true], ['action1', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('#0001\'s BA2 button shows the kick icon, labelled Kick, and still dispatches action2', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('action2');
  assert.equal(b.innerHTML, ICONS.kick);
  assert.notEqual(b.innerHTML, tc.buttons.get('action1').innerHTML, 'the kick is not the fist');
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no BA2 text');
  assert.doesNotMatch(visibleText(b), /\S/);
  assert.equal(b.getAttribute('aria-label'), 'Kick');
  assert.equal(b.getAttribute('data-action'), 'action2');
  assert.ok(b.classList.contains('tc-a2'));
  assert.equal(b.classList.contains('is-pending'), false);
  press(b, 9);
  assert.deepEqual(calls, [['action2', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  lift(b, 9);
  assert.deepEqual(calls, [['action2', true], ['action2', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('the Defense button is the universal Shield: shield icon, labelled Shield, sending defense', () => {
  const { tc } = touchControls();
  assert.equal(tc.buttons.has('block'), false);
  const b = tc.buttons.get('defense');
  assert.equal(b.innerHTML, ICONS.shield);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no visible D');
  assert.doesNotMatch(visibleText(b), /\S/);
  assert.equal(b.getAttribute('aria-label'), 'Shield');
  assert.equal(b.getAttribute('data-action'), 'defense');
  assert.ok(b.classList.contains('tc-defense'), 'the same slot');
  assert.ok(b.classList.contains('tc-ability'));
  assert.equal(b.classList.contains('tc-block'), false);
  assert.equal(b.classList.contains('is-pending'), false);
  // Universal: the same Shield whatever the fighter, or none.
  for (const def of [null, { id: 'x' }, { mobileAbilities: { defense: { label: 'Parry', icon: 'kick' } } }]) {
    const other = touchControls(def).tc.buttons.get('defense');
    assert.equal(other.innerHTML, ICONS.shield);
    assert.equal(other.getAttribute('aria-label'), 'Shield');
  }
});

test('holding Shield dispatches defense for exactly the pointer\'s lifetime, alongside a held direction', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('defense');
  press(b, 6);
  assert.deepEqual(calls, [['defense', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  // Another finger elsewhere does not lower it.
  press(tc.buttons.get('action1'), 8);
  lift(tc.buttons.get('action1'), 8);
  assert.deepEqual(calls.slice(1), [['action1', true], ['action1', false]]);
  assert.ok(b.classList.contains('is-pressed'), 'still held');
  lift(b, 6);
  assert.deepEqual(calls.at(-1), ['defense', false]);
  assert.equal(b.classList.contains('is-pressed'), false);
  assert.ok(calls.every(([action]) => ['defense', 'action1'].includes(action)), 'no shield, block or dodge input');
  // A cancelled pointer lowers it too: never stuck up.
  press(b, 4);
  b.dispatch('pointercancel', { pointerId: 4 });
  assert.deepEqual(calls.slice(-2), [['defense', true], ['defense', false]]);
  // Alongside a held direction (multi-touch).
  tc.assign(1, 'right');
  press(b, 2);
  assert.deepEqual(calls.slice(-2), [['right', true], ['defense', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(-2).sort(), [['defense', false], ['right', false]]);
});

test('the lower-right cluster keeps its order and slots; only Special is reserved; no letters remain', () => {
  const { tc } = touchControls();
  assert.deepEqual(tc.actions.children.map((c) => c.getAttribute('data-action')),
    ['primary', 'special', 'defense', 'action1', 'action2', 'jump']);
  assert.deepEqual(tc.actions.children.map((c) => [...c.classNames].find((n) => /^tc-(throw|special|defense|a1|a2|jump)$/.test(n))),
    ['tc-throw', 'tc-special', 'tc-defense', 'tc-a1', 'tc-a2', 'tc-jump']);
  const pending = [...tc.buttons].filter(([, b]) => b.classList.contains('is-pending')).map(([action]) => action);
  assert.deepEqual(pending, ['special']);
  assert.equal(tc.buttons.get('special').innerHTML, ICONS.special, 'Special keeps its star');
  assert.equal(tc.buttons.get('special').getAttribute('aria-label'), 'Special');
  assert.equal(tc.buttons.get('jump').innerHTML, ICONS.jump, 'Jump unchanged');
  assert.equal(tc.buttons.get('jump').getAttribute('aria-label'), 'Jump');
  // The combat glyphs share one larger-icon class; Special and Jump do not.
  assert.deepEqual(tc.actions.children.filter((c) => c.classList.contains('tc-ability')).map((c) => c.getAttribute('data-action')),
    ['primary', 'defense', 'action1', 'action2']);
  // The only text left on any touch button is Charge's C.
  assert.deepEqual(tc.root.querySelectorAll('.tc-text').map((t) => t.textContent), ['C']);
  for (const b of tc.actions.children) assert.doesNotMatch(visibleText(b), CODE_LABELS, b.getAttribute('data-action'));
  // No new controller inputs: the buttons send the same nine actions as before.
  assert.deepEqual([...tc.buttons.keys()].sort(),
    ['action1', 'action2', 'charge', 'defense', 'jump', 'left', 'primary', 'right', 'special']);
});

test('Punch and Kick work alongside a held direction and each other (multi-touch), and rapid taps each register', () => {
  const { tc, calls } = touchControls();
  tc.assign(1, 'left');
  press(tc.buttons.get('action2'), 2);
  assert.deepEqual(calls, [['left', true], ['action2', true]]);
  press(tc.buttons.get('action1'), 3);
  assert.deepEqual(calls.at(-1), ['action1', true]);
  lift(tc.buttons.get('action2'), 2);
  assert.deepEqual(calls.at(-1), ['action2', false]);
  assert.ok(tc.buttons.get('left').classList.contains('is-pressed'), 'the direction is still held');
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['action1', false], ['left', false]]);
  // Hold Right and tap Punch ten times fast: ten presses, Right never let go.
  const { tc: tc2, calls: log } = touchControls();
  tc2.assign(1, 'right');
  for (let i = 0; i < 10; i++) {
    press(tc2.buttons.get('action1'), 10 + i);
    lift(tc2.buttons.get('action1'), 10 + i);
  }
  assert.equal(log.filter(([a, held]) => a === 'action1' && held).length, 10);
  assert.equal(log.filter(([a, held]) => a === 'action1' && !held).length, 10);
  assert.ok(!log.some(([a, held]) => a === 'right' && !held), 'Right stays held');
  assert.ok(tc2.buttons.get('right').classList.contains('is-pressed'));
});

// ---- Character switching -------------------------------------------------

test('setCharacter swaps the fighter\'s icons and names in place, without rebuilding the controls or their input', () => {
  const { tc, calls, input } = touchControls();
  const before = { root: tc.root.children.slice(), buttons: new Map(tc.buttons), actions: tc.actions, dpad: tc.dpad, input: tc.input };
  const other = {
    id: '9998',
    mobileAbilities: {
      primary: { label: 'Kunai', icon: 'arrow' },
      action1: { label: 'Palm Strike', icon: 'up' },
      action2: { label: 'Sweep', icon: 'down' },
    },
  };
  tc.setCharacter(other);
  const b = (a) => tc.buttons.get(a);
  assert.deepEqual([b('primary').innerHTML, b('action1').innerHTML, b('action2').innerHTML], [ICONS.arrow, ICONS.up, ICONS.down]);
  assert.deepEqual(['primary', 'action1', 'action2'].map((a) => b(a).getAttribute('aria-label')), ['Kunai', 'Palm Strike', 'Sweep']);
  for (const a of ['primary', 'action1', 'action2']) {
    assert.doesNotMatch(b(a).innerHTML, new RegExp([ICONS.shuriken, ICONS.punch, ICONS.kick].map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')), `${a}: nothing of #0001 left`);
  }
  // Universal buttons untouched.
  assert.equal(b('defense').innerHTML, ICONS.shield);
  assert.equal(b('special').innerHTML, ICONS.special);
  assert.equal(b('jump').innerHTML, ICONS.jump);
  // The very same elements, clusters and input, the same data-actions.
  assert.deepEqual(tc.root.children, before.root);
  for (const [action, el] of before.buttons) {
    assert.equal(tc.buttons.get(action), el, action);
    assert.equal(el.getAttribute('data-action'), action);
  }
  assert.equal(tc.actions, before.actions);
  assert.equal(tc.dpad, before.dpad);
  assert.equal(tc.input, input);
  // Input still flows through the same internal actions.
  press(b('action1'), 5);
  lift(b('action1'), 5);
  press(b('primary'), 6);
  assert.deepEqual(calls, [['action1', true], ['action1', false], ['primary', true]]);
  // A fighter that authors nothing: neutral, never #0001's leftovers.
  tc.setCharacter({ id: '9997' });
  assert.deepEqual(['primary', 'action1', 'action2'].map((a) => [b(a).innerHTML, b(a).getAttribute('aria-label')]),
    [[ICONS.ring, 'Throw'], [ICONS.pip1, 'Basic Attack 1'], [ICONS.pip2, 'Basic Attack 2']]);
  // And back.
  tc.setCharacter(DEF_0001);
  assert.deepEqual(['primary', 'action1', 'action2'].map((a) => b(a).getAttribute('aria-label')), ['Shuriken', 'Punch', 'Kick']);
});

test('before any fighter is named the controls are usable and neutral; a held button survives a swap', () => {
  const { tc, calls } = touchControls(null);
  assert.deepEqual(['primary', 'action1', 'action2'].map((a) => tc.buttons.get(a).getAttribute('aria-label')),
    ['Throw', 'Basic Attack 1', 'Basic Attack 2']);
  const b = tc.buttons.get('action1');
  assert.equal(b.innerHTML, ICONS.pip1);
  press(b, 4);
  tc.setCharacter(DEF_0001);
  assert.ok(b.classList.contains('is-pressed'), 'still pressed after the icon changed');
  assert.equal(b.innerHTML, ICONS.punch);
  lift(b, 4);
  assert.deepEqual(calls, [['action1', true], ['action1', false]]);
});

// ---- Help: the desktop table -----------------------------------------------

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

test('Charge works alongside Punch, Kick, Shield and Jump (multi-touch)', () => {
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

test('help explains that Charge is held, loops while held, and speeds up the charged cooldowns; Energy by name, no Health', () => {
  const help = buildHelp();
  const items = help.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Hold Charge \(S \/ ↓, or C on touch\) while grounded/);
  assert.match(items, /Charge must be held: release it to stop charging/);
  assert.match(items, /two-frame startup once, then loops its sustained pose/);
  assert.match(items, /own 5-second cooldown/);
  assert.match(items, /Charging makes both cooldowns recover twice as fast/);
  assert.doesNotMatch(help.textContent, /health|stamina/i, 'no Health, and never the old Stamina, anywhere in Help');
  assert.match(items, /The bright purple bar above your fighter is Energy; it shows only while it is not full/);
  assert.match(items, /A Dash costs 15 of its 100, and every hit your Shield blocks costs 25/);
  assert.match(items, /You can still Dash or Shield with less left than that, but it empties the bar/);
  assert.match(items, /Blocking with less than 25 Energy left still works, but empties the bar/);
  assert.doesNotMatch(help.textContent, /segment/i, 'one bar, no segments');
  assert.match(items, /If Energy reaches zero, it turns gray and must fully refill before Shield and Dash become available again/);
  assert.match(items, /refills your Energy faster too/);
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


// ---- Help: the mobile diagram ---------------------------------------------

test('the mobile diagram draws the real icons, never T, D, BA1 or BA2', () => {
  const help = buildHelp();
  const diagram = help.querySelector('.mobile-diagram');
  const dots = Object.fromEntries(help.querySelector('.md-screen').children.map((d) => [d.getAttribute('title'), d.querySelector('.md-icon').innerHTML]));
  assert.deepEqual(Object.keys(dots), ['Pause', 'Left', 'Charge', 'Right', 'Shuriken', 'Special', 'Shield', 'Punch', 'Kick', 'Jump']);
  assert.equal(dots.Shuriken, ICONS.shuriken);
  assert.equal(dots.Special, ICONS.special);
  assert.equal(dots.Shield, ICONS.shield);
  assert.equal(dots.Punch, ICONS.punch);
  assert.equal(dots.Kick, ICONS.kick);
  assert.equal(dots.Jump, ICONS.jump);
  // #0001's own come from its mobileAbilities, exactly as the touch controls show them.
  const { tc } = touchControls();
  assert.equal(help.querySelector('.md-throw').querySelector('.md-icon').innerHTML, tc.buttons.get('primary').innerHTML);
  assert.equal(help.querySelector('.md-a1').querySelector('.md-icon').innerHTML, tc.buttons.get('action1').innerHTML);
  assert.equal(help.querySelector('.md-a2').querySelector('.md-icon').innerHTML, tc.buttons.get('action2').innerHTML);
  assert.equal(help.querySelector('.md-defense').querySelector('.md-icon').innerHTML, tc.buttons.get('defense').innerHTML);
  // Same slots as ever.
  for (const cls of ['md-throw', 'md-special', 'md-defense', 'md-a1', 'md-a2', 'md-jump']) assert.ok(help.querySelector(`.${cls}`), cls);
  assert.equal(help.querySelector('.md-primary'), null);
  assert.equal(help.querySelector('.md-block'), null);
  // No old abbreviations drawn anywhere in it.
  for (const icon of Object.values(dots)) {
    assert.doesNotMatch(icon, /<b>(T|D|BA1|BA2)<\/b>/);
  }
  assert.doesNotMatch(Object.values(dots).join(''), /<b>(?!C<)/, 'only Charge still reads a letter');
  const label = diagram.getAttribute('aria-label');
  for (const word of ['Shuriken', 'Special', 'Shield', 'Punch', 'Kick', 'Jump']) assert.match(label, new RegExp(word));
  assert.match(label, /Left, Charge and Right controls at the lower left/);
  assert.match(label, /Shuriken, Special, Shield, Punch, Kick and Jump staggered at the lower right/);
  assert.doesNotMatch(label, /\((T|D|BA1|BA2)\)|\b(Primary|primary|action1|action2|defense|Block|Dodge|Down)\b/);
});

test('the mobile legend and note describe the abilities, not code labels or internal names', () => {
  const help = buildHelp();
  const legend = help.querySelector('.md-legend').textContent;
  assert.match(legend, /Left · Charge · Right/);
  assert.match(legend, /Shuriken, Special, Shield, Punch, Kick and Jump/);
  assert.match(legend, /Throws #0001’s shuriken\./);
  assert.match(legend, /Hold it to keep #0001’s Shield up/);
  assert.match(legend, /Basic Attacks 1 and 2/);
  assert.match(legend, /Clone Attack or the Sphere Rush/);
  assert.match(legend, /Timer · Pause/);
  const card = help.querySelectorAll('.info-card').find((c) => /Mobile controls/.test(c.textContent));
  const note = card.querySelector('.info-note').textContent;
  assert.match(note, /C is Charge: hold it to charge/);
  assert.match(note, /Shuriken throws; hold Shield to keep it up/);
  assert.match(note, /Punch \(the fist\) and Kick \(the leg\) are Basic Attacks 1 and 2/);
  assert.match(note, /hold C first to turn them into the Clone Attack and the Sphere Rush/);
  assert.match(note, /Only the dashed Special button is reserved/);
  for (const text of [legend, note]) {
    assert.doesNotMatch(text, /\b(T|D|BA1|BA2)\b/, 'no code labels');
    assert.doesNotMatch(text, /\b(primary|action1|action2|defense)\b/, 'no internal names');
  }
  // Nor any "on touch" reference to the old letters anywhere in Help.
  assert.doesNotMatch(help.textContent, /\b(T|D|BA1|BA2) on touch\b|touch (T|D|BA1|BA2)\b/);
  assert.match(help.textContent, /or the Shuriken button on touch/);
  assert.match(help.textContent, /or the Shield button on touch/);
  assert.match(help.textContent, /Charge \+ BA1 \(Punch on touch\) = Clone Attack; Charge \+ BA2 \(Kick on touch\) = Sphere Rush/);
});

// ---- Help: Defense and Throw -------------------------------------------------

test('the Shield touch button keeps the old Defense / Block coordinates', () => {
  assert.match(CSS, /\.tc-defense \{ right: calc\(var\(--tc-pitch\) \* 0\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
  assert.match(CSS, /\.md-defense \{ left: 85%; top: 54%; \}/);
  assert.doesNotMatch(CSS, /\.tc-block\b/);
  assert.doesNotMatch(CSS, /\.md-block\b/);
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

test('help explains Defense, #0001\'s Shield, its Energy cost and lockout, and the Charge release', () => {
  const help = buildHelp();
  assert.doesNotMatch(help.textContent, /dodge|invulnerab/i, 'no Dodge left anywhere in Help');
  const notes = help.querySelectorAll('.info-note').map((p) => p.textContent).join(' ');
  assert.match(notes, /RB \/ RT for Defense/);
  assert.match(notes, /hold Shield to keep it up/);
  const items = help.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Defense \(L, RB \/ RT, or the Shield button on touch\) is the shared defensive button/);
  assert.match(items, /#0001 shields/);
  assert.match(items, /Defense — Hold to Shield\. Blocking a hit costs 25 Energy\./);
  assert.match(items, /a circle all round #0001, on the ground and in the air/);
  assert.match(items, /from either side: no Launch Point and no launch/);
  assert.match(items, /Holding it costs nothing, and neither does an attack that misses/);
  assert.match(items, /In the air he keeps falling/);
  assert.match(items, /If Energy reaches zero, it turns gray and must fully refill before Shield and Dash become available again/);
  assert.match(items, /Let go and #0001 shows its first Charge pose for a moment/);
  assert.match(items, /holding Defense raises the Shield instead/);
  assert.match(items, /A Shield blocks the sphere: no trap, no explosion/);
  const build = help.querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(build, /Defense is a held Shield for #0001, on the ground and in the air/);
  assert.doesNotMatch(build, /guard state/);
});

test('the Shuriken touch button keeps the old Throw / Primary coordinates and size', () => {
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
  assert.match(text, /Only the dashed Special button is reserved/);
});

test('help explains Throw and lists it in this build', () => {
  const help = buildHelp();
  const items = help.querySelectorAll('li').map((li) => li.textContent).join(' ');
  assert.match(items, /Throw \(J, X \/ Square, or the Shuriken button on touch\) makes #0001 throw one shuriken per press/);
  assert.match(items, /flies straight the way #0001 was facing/);
  assert.match(items, /ground only/);
  const build = help.querySelectorAll('.info-text').map((p) => p.textContent).join(' ');
  assert.match(build, /Throw \(the primary action\) throws an animated shuriken/);
  assert.match(build, /BA1/);
  assert.match(build, /BA2/);
  assert.match(build, /Charge/);
  assert.match(build, /Shield/);
  assert.match(build, /Only Special is still reserved/);
  assert.match(build, /training CPU never attacks/);
  assert.doesNotMatch(build, /mid-air Throw/i);
});

// ---- Page zoom and gestures -----------------------------------------------

test('the viewport disables page zoom for play, keeping viewport-fit=cover', () => {
  const html = read('index.html');
  const metas = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/g);
  assert.equal(metas.length, 1, 'one viewport meta');
  const content = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)[1];
  const tokens = content.split(',').map((t) => t.trim());
  for (const token of ['width=device-width', 'initial-scale=1', 'maximum-scale=1', 'user-scalable=no', 'viewport-fit=cover']) {
    assert.ok(tokens.includes(token), `${token} in "${content}"`);
  }
});

test('the gameplay surfaces and touch buttons keep touch-action: none; menus still scroll', () => {
  const rule = (selector) => {
    const m = CSS.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));
    assert.ok(m, `${selector} rule`);
    return m[2];
  };
  for (const selector of ['.screen--battle', '.battle-canvas', '.screen--practice', '.tc-btn', '.tc-dpad']) {
    assert.match(rule(selector), /touch-action: none;/, selector);
  }
  // The document never scrolls, and never selects text or shows a callout.
  assert.match(rule('html, body'), /overflow: hidden;/);
  assert.match(rule('body'), /user-select: none;/);
  assert.match(rule('body'), /-webkit-touch-callout: none;/);
  // Intentionally scrollable panels (Help, Discover, pause Help) still pan.
  assert.ok((CSS.match(/touch-action: pan-y;/g) || []).length >= 3, 'scroll panels keep pan-y');
  // Press feedback stays immediate: no animation on the buttons, only the
  // short transition they already had.
  assert.match(rule('.tc-btn'), /transition: transform 90ms ease-out/);
  assert.doesNotMatch(rule('.tc-btn'), /animation/);
  assert.match(CSS, /\.tc-ability \.icon \{ font-size: 1\.14em; \}/);
});

test('zoom prevention is declarative: no Touch Events, double-tap timers or blanket preventDefault', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
      else if (entry.name.endsWith('.js')) files.push(`${dir}${entry.name}`);
    }
  };
  walk('js/');
  for (const file of files) {
    const code = read(file);
    assert.doesNotMatch(code, /['"](touchstart|touchend|touchmove|gesturestart|gesturechange|dblclick)['"]/, `${file}: no Touch / gesture events`);
  }
  // The touch controls stay on Pointer Events.
  const touch = read('js/game/touch-controls.js');
  assert.match(touch, /'pointerdown'/);
  assert.match(touch, /setPointerCapture/);
});
