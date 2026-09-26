// Run with node --test tests/controls-ui.test.mjs (no dependencies).
// The touch controls on a minimal fake DOM, in both Mobile Controls schemes:
// the icon-based combat buttons (#0001's Shuriken, Punch and Kick from its
// mobileAbilities, the universal Shield), their character-aware refresh, the
// unchanged internal inputs behind them (primary, defense, action1,
// action2), Classic Buttons' Left / C / Right cluster exactly as before,
// the Joystick scheme's stick (deadzone, release, crossing the centre,
// multi-touch), its single-tap Left mouvement / Right mouvement Dash
// buttons and its down-arrow Charge under Jump, switching schemes, the
// unchanged desktop bindings and the page-zoom guard. Layout, paint and
// real gestures still need real-browser verification.
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
  style = {};
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

const { TouchControls, JOYSTICK, joystickDirection } = await import('../js/game/touch-controls.js');
const { ACTION_LABELS, CONFIG } = await import('../js/config.js');
const { ICONS } = await import('../js/ui/icons.js');
const { ABILITY_ACTIONS, mobileAbility } = await import('../js/ui/mobile-abilities.js');
const { getCharacter } = await import('../js/data/characters.js');

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const CSS = read('styles.css');
const DEF_0001 = getCharacter('0001');

// Touch controls wired to a recording input; `def` is the fighter they
// present (#0001 unless given; null leaves them neutral) and `scheme` their
// layout (Classic Buttons here, the layout these checks were written for;
// the Joystick tests below ask for theirs). Dash requests are recorded as
// ['dash', direction].
function touchControls(def = DEF_0001, { scheme = 'classic' } = {}) {
  const calls = [];
  const input = {
    setTouch: (action, held) => calls.push([action, held]),
    queueTouchDash: (direction) => calls.push(['dash', direction]),
  };
  const tc = new TouchControls(new Element('div'), input, { scheme });
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

// ---- Desktop controls ---------------------------------------------------------

test('keyboard bindings and action names are unchanged by the touch layouts', () => {
  assert.deepEqual({ ...CONFIG.bindings }, {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    charge: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    primary: ['KeyJ'],
    special: ['KeyK'],
    defense: ['KeyL'],
    action1: ['KeyU'],
    action2: ['KeyI'],
    pause: ['Escape', 'KeyP'],
  });
  assert.deepEqual({ ...ACTION_LABELS }, {
    left: 'Move left', right: 'Move right', charge: 'Charge', jump: 'Jump', primary: 'Throw', special: 'Special',
    defense: 'Defense', action1: 'Basic Attack 1', action2: 'Basic Attack 2', pause: 'Pause',
  });
  // No Down, Block or dash key: Dash stays a double tap on the keyboard.
  for (const name of ['down', 'block', 'dash', 'dashLeft', 'dashRight']) {
    assert.equal(CONFIG.bindings[name], undefined, name);
    assert.equal(ACTION_LABELS[name], undefined, name);
  }
});

// ---- Classic Buttons: Charge ------------------------------------------------

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

// ---- Schemes -------------------------------------------------------------------

const actionsOf = (cluster) => cluster.children.map((c) => c.getAttribute('data-action'));

test('Joystick is the default scheme; setScheme switches layouts and anything unknown is the Joystick', () => {
  const input = { setTouch() {}, queueTouchDash() {} };
  const tc = new TouchControls(new Element('div'), input);
  assert.equal(tc.scheme, 'joystick', 'a player who never chose');
  assert.equal(tc.root.dataset.scheme, 'joystick');
  assert.ok(tc.root.classList.contains('is-joystick'));
  assert.equal(tc.root.classList.contains('is-classic'), false);
  tc.setScheme('classic');
  assert.equal(tc.scheme, 'classic');
  assert.equal(tc.root.dataset.scheme, 'classic');
  assert.ok(tc.root.classList.contains('is-classic'));
  assert.equal(tc.root.classList.contains('is-joystick'), false);
  for (const bad of ['dpad', '', null, undefined, 'Classic']) {
    tc.setScheme('classic');
    tc.setScheme(bad);
    assert.equal(tc.scheme, 'joystick', String(bad));
  }
  assert.equal(new TouchControls(new Element('div'), input, { scheme: 'classic' }).scheme, 'classic');
});

test('Classic Buttons is the original layout exactly: Left / C / Right at the lower left, the six actions at the lower right', () => {
  const { tc } = touchControls(DEF_0001, { scheme: 'classic' });
  assert.deepEqual(tc.root.children, [tc.dpad, tc.actions]);
  assert.deepEqual(actionsOf(tc.dpad), ['left', 'charge', 'right']);
  assert.deepEqual(tc.dpad.children.map((b) => b.getAttribute('aria-label')), ['Move left', 'Charge', 'Move right']);
  assert.equal(tc.dpad.getAttribute('aria-label'), 'Movement and Charge');
  assert.deepEqual(actionsOf(tc.actions), ['primary', 'special', 'defense', 'action1', 'action2', 'jump'], 'no Charge under Jump');
  assert.equal(tc.buttons.get('charge').textContent, 'C');
  // Nothing of the Joystick scheme is on screen.
  assert.equal(tc.root.querySelectorAll('.tc-stick').length, 0);
  assert.equal(tc.root.querySelectorAll('.tc-dash').length, 0);
  assert.equal(tc.root.querySelectorAll('.tc-charge-down').length, 0);
  // Left and Right are ordinary held directions: a Dash still needs two taps.
  const { tc: tc2, calls } = touchControls(DEF_0001, { scheme: 'classic' });
  const at = layoutDpad(tc2);
  tc2.dpad.dispatch('pointerdown', { pointerId: 1, ...at('right'), preventDefault() {} });
  tc2.dpad.dispatch('pointerup', { pointerId: 1 });
  tc2.dpad.dispatch('pointerdown', { pointerId: 2, ...at('right'), preventDefault() {} });
  tc2.dpad.dispatch('pointerup', { pointerId: 2 });
  assert.deepEqual(calls, [['right', true], ['right', false], ['right', true], ['right', false]], 'two taps are two presses, no Dash request');
});

test('the Joystick scheme: a movement joystick between Left mouvement and Right mouvement, and Charge (a down arrow) under Jump', () => {
  const { tc } = touchControls(DEF_0001, { scheme: 'joystick' });
  assert.deepEqual(tc.root.children, [tc.joystick, tc.actions]);
  const [dashLeft, stick, dashRight] = tc.joystick.children;
  assert.equal(stick, tc.stick);
  assert.equal(stick.getAttribute('role'), 'group');
  assert.equal(stick.getAttribute('aria-label'), 'Movement joystick');
  assert.ok(stick.children.includes(tc.knob));
  // The Dash buttons: real buttons with exactly these names, spelling kept,
  // and the readable arrow glyphs.
  for (const [b, name, icon, side] of [[dashLeft, 'Left mouvement', ICONS.left, 'left'], [dashRight, 'Right mouvement', ICONS.right, 'right']]) {
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.getAttribute('type'), 'button');
    assert.equal(b.getAttribute('aria-label'), name);
    assert.equal(b.innerHTML, icon);
    assert.ok(b.classList.contains('tc-btn'));
    assert.ok(b.classList.contains(`tc-dash-${side}`));
    assert.equal(b.getAttribute('data-action'), null, 'not a held action');
    assert.equal(tc.dashButtons.get(side), b);
  }
  assert.doesNotMatch(dashLeft.getAttribute('aria-label') + dashRight.getAttribute('aria-label'), /movement/, 'mouvement, as written');
  // The old cluster is gone from the screen, C included.
  assert.equal(tc.root.querySelectorAll('.tc-dpad').length, 0);
  assert.deepEqual(tc.root.querySelectorAll('.tc-text'), [], 'no C anywhere');
  // Charge sits right after Jump in the lower-right cluster: the down arrow,
  // announced as Charge, sending the same held charge.
  assert.deepEqual(actionsOf(tc.actions), ['primary', 'special', 'defense', 'action1', 'action2', 'jump', 'charge']);
  const charge = tc.actions.children.at(-1);
  assert.equal(charge, tc.buttons.get('charge'));
  assert.equal(charge.innerHTML, ICONS.down);
  assert.equal(charge.getAttribute('aria-label'), 'Charge', 'Charge, not Down');
  assert.ok(charge.classList.contains('tc-charge-down'));
  assert.equal(charge.tagName, 'BUTTON');
  // The same seven held inputs, no left / right buttons: the stick holds those.
  assert.deepEqual([...tc.buttons.keys()].sort(), ['action1', 'action2', 'charge', 'defense', 'jump', 'primary', 'special']);
});

// ---- Joystick: steering --------------------------------------------------------

// The stick's base laid out 200 px wide with its centre at (100, 200): a
// radius of 100, so offsets read as hundredths of it.
function joystickControls() {
  const made = touchControls(DEF_0001, { scheme: 'joystick' });
  made.tc.stick.rect = { left: 0, top: 100, width: 200, height: 200 };
  const at = (x, y = 0) => ({ clientX: 100 + x, clientY: 200 + y });
  const down = (x, y = 0, pointerId = 1) => made.tc.stick.dispatch('pointerdown', { pointerId, ...at(x, y), preventDefault() {} });
  const move = (x, y = 0, pointerId = 1) => made.tc.stick.dispatch('pointermove', { pointerId, ...at(x, y) });
  const end = (type = 'pointerup', pointerId = 1) => made.tc.stick.dispatch(type, { pointerId });
  return { ...made, down, move, end };
}

test('joystick thresholds: a deadzone round the centre, a little hysteresis, sideways only', () => {
  assert.deepEqual({ ...JOYSTICK }, { deadzone: 0.24, engage: 0.34, travel: 0.56 });
  assert.equal(joystickDirection(0), null);
  assert.equal(joystickDirection(0.3), null, 'inside the engage line: nothing');
  assert.equal(joystickDirection(0.34), 'right');
  assert.equal(joystickDirection(-0.34), 'left');
  assert.equal(joystickDirection(0.3, 'right'), 'right', 'held until back in the deadzone');
  assert.equal(joystickDirection(0.2, 'right'), null);
  assert.equal(joystickDirection(-0.3, 'left'), 'left');
  assert.equal(joystickDirection(-0.2, 'left'), null);
  assert.equal(joystickDirection(-0.5, 'right'), 'left', 'straight across');
  assert.equal(joystickDirection(0.3, 'left'), null, 'crossing drops the old direction');
});

test('the joystick holds Right past the deadzone and lets go back inside it; small movements never drift', () => {
  const { tc, calls, down, move, end } = joystickControls();
  down(10, 4);
  assert.deepEqual(calls, [], 'a thumb near the centre holds nothing');
  assert.ok(tc.stick.classList.contains('is-active'));
  assert.deepEqual(tc.knobOffset, { x: 10, y: 4 }, 'the knob follows it all the same');
  for (const x of [-20, 18, 30, -30]) move(x);
  assert.deepEqual(calls, [], 'wobbling round the centre: still nothing');
  move(50);
  assert.deepEqual(calls, [['right', true]]);
  assert.ok(tc.stick.classList.contains('is-right'));
  for (const x of [60, 45, 30, 26]) move(x, 12);
  assert.deepEqual(calls, [['right', true]], 'no repeat presses while it stays out');
  move(10);
  assert.deepEqual(calls, [['right', true], ['right', false]], 'back in the deadzone: released');
  assert.equal(tc.stick.classList.contains('is-right'), false);
  move(-50);
  assert.deepEqual(calls.at(-1), ['left', true]);
  assert.ok(tc.stick.classList.contains('is-left'));
  end();
  assert.deepEqual(calls.at(-1), ['left', false]);
  assert.deepEqual(tc.knobOffset, { x: 0, y: 0 }, 'recentred');
  assert.equal(tc.knob.style.transform, '');
  assert.equal(tc.stick.classList.contains('is-active'), false);
  assert.equal(tc.stick.classList.contains('is-left'), false);
  assert.equal(tc.pointers.size, 0);
});

test('crossing the centre releases the old direction before holding the new one', () => {
  const { tc, calls, down, move, end } = joystickControls();
  down(60);
  move(-60);
  assert.deepEqual(calls, [['right', true], ['right', false], ['left', true]], 'in one move');
  assert.ok(tc.stick.classList.contains('is-left'));
  assert.equal(tc.stick.classList.contains('is-right'), false);
  move(0);
  move(70);
  assert.deepEqual(calls.slice(3), [['left', false], ['right', true]], 'or through the centre');
  assert.equal(tc.counts.get('left'), 0);
  assert.equal(tc.counts.get('right'), 1);
  end();
  assert.deepEqual(calls.at(-1), ['right', false]);
});

test('up and down move the knob only: never Jump or Charge; the knob stays inside the base', () => {
  const { tc, calls, down, move, end } = joystickControls();
  down(0, -90);
  move(5, 95);
  move(-10, -200);
  assert.deepEqual(calls, [], 'no Jump, no Charge, no direction');
  const travel = 100 * JOYSTICK.travel;
  assert.ok(Math.abs(Math.hypot(tc.knobOffset.x, tc.knobOffset.y) - travel) < 1e-9, 'clamped to its travel');
  move(300, 0);
  assert.ok(Math.abs(tc.knobOffset.x - travel) < 1e-9 && tc.knobOffset.y === 0, 'straight right, at its travel');
  assert.equal(tc.knob.style.transform, `translate(${travel.toFixed(1)}px, 0.0px)`);
  assert.deepEqual(calls, [['right', true]], 'pushed all the way: the same digital Right');
  move(30, 90);
  assert.ok(Math.hypot(tc.knobOffset.x, tc.knobOffset.y) <= travel + 1e-9);
  end();
});

test('cancelling, losing capture, disabling or releaseAll() always recentres and lets go', () => {
  for (const type of ['pointercancel', 'lostpointercapture', 'pointerup']) {
    const { tc, calls, down, end } = joystickControls();
    down(70, 20);
    end(type);
    assert.deepEqual(calls, [['right', true], ['right', false]], type);
    assert.deepEqual(tc.knobOffset, { x: 0, y: 0 });
    assert.equal(tc.stickPointer, null);
  }
  for (const stop of [(tc) => tc.setEnabled(false), (tc) => tc.releaseAll()]) {
    const { tc, calls, down, move } = joystickControls();
    down(-70);
    stop(tc);
    assert.deepEqual(calls, [['left', true], ['left', false]]);
    assert.deepEqual(tc.knobOffset, { x: 0, y: 0 });
    assert.equal(tc.stick.classList.contains('is-active'), false);
    // The thumb still on the glass steers nothing until it lands again.
    move(-80);
    assert.deepEqual(calls, [['left', true], ['left', false]]);
  }
  // Disabled (paused, over): a press does nothing at all.
  const { tc, calls, down } = joystickControls();
  tc.setEnabled(false);
  down(80);
  assert.deepEqual(calls, []);
  assert.equal(tc.stickPointer, null);
});

test('one thumb steers: a second pointer on the stick is ignored, and another pointer ending changes nothing', () => {
  const { tc, calls, down, move, end } = joystickControls();
  down(70, 0, 1);
  down(-70, 0, 2);
  move(-70, 0, 2);
  end('pointerup', 2);
  assert.deepEqual(calls, [['right', true]]);
  assert.equal(tc.stickPointer, 1);
  end('pointerup', 1);
  assert.deepEqual(calls, [['right', true], ['right', false]]);
});

test('the joystick works alongside Jump, Punch, Kick, Shield, Shuriken, Special and Charge (multi-touch)', () => {
  for (const other of ['jump', 'action1', 'action2', 'defense', 'primary', 'special', 'charge']) {
    const { tc, calls, down, end } = joystickControls();
    down(70);
    const b = tc.buttons.get(other);
    press(b, 9);
    assert.deepEqual(calls, [['right', true], [other, true]], other);
    assert.ok(b.classList.contains('is-pressed'), `${other}: pressed feedback`);
    lift(b, 9);
    assert.deepEqual(calls.at(-1), [other, false]);
    assert.equal(tc.counts.get('right'), 1, `${other}: Right still held`);
    assert.ok(tc.stick.classList.contains('is-right'));
    end();
    assert.deepEqual(calls.at(-1), ['right', false]);
  }
  // Several at once, in any order of release.
  const { tc, calls, down, end } = joystickControls();
  down(-70);
  press(tc.buttons.get('charge'), 2);
  press(tc.buttons.get('action1'), 3);
  press(tc.buttons.get('jump'), 4);
  end();
  lift(tc.buttons.get('jump'), 4);
  lift(tc.buttons.get('action1'), 3);
  lift(tc.buttons.get('charge'), 2);
  assert.deepEqual(calls, [
    ['left', true], ['charge', true], ['action1', true], ['jump', true],
    ['left', false], ['jump', false], ['action1', false], ['charge', false],
  ]);
});

// ---- Joystick: Dash buttons ----------------------------------------------------

test('one tap of Left mouvement / Right mouvement asks for exactly one Dash, and holds nothing', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const left = tc.dashButtons.get('left');
  const right = tc.dashButtons.get('right');
  press(right, 1);
  assert.deepEqual(calls, [['dash', 1]], 'one request, the moment it goes down');
  assert.ok(right.classList.contains('is-pressed'), 'pressed at once');
  // Held down: no more requests, and no direction held.
  right.dispatch('pointermove', { pointerId: 1 });
  lift(right, 1);
  assert.deepEqual(calls, [['dash', 1]]);
  assert.equal(right.classList.contains('is-pressed'), false);
  assert.ok(!calls.some(([a]) => a === 'left' || a === 'right'), 'never a held Left or Right');
  assert.equal(tc.pointers.size, 0);
  assert.equal(tc.counts.get('right') ?? 0, 0);
  press(left, 2);
  left.dispatch('pointercancel', { pointerId: 2 });
  assert.deepEqual(calls, [['dash', 1], ['dash', -1]]);
  assert.equal(left.classList.contains('is-pressed'), false, 'a cancelled pointer lets go too');
  // Each tap is its own request (whether it Dashes is the fighter's call).
  for (let i = 0; i < 3; i++) {
    press(right, 10 + i);
    lift(right, 10 + i);
  }
  assert.deepEqual(calls.slice(2), [['dash', 1], ['dash', 1], ['dash', 1]]);
  // Alongside the joystick, from another finger.
  tc.stick.rect = { left: 0, top: 100, width: 200, height: 200 };
  tc.stick.dispatch('pointerdown', { pointerId: 20, clientX: 30, clientY: 200, preventDefault() {} });
  press(right, 21);
  assert.deepEqual(calls.slice(5), [['left', true], ['dash', 1]]);
  assert.equal(tc.counts.get('left'), 1, 'the stick\'s Left is untouched by the tap');
  // Disabled: nothing.
  tc.setEnabled(false);
  assert.equal(right.classList.contains('is-pressed'), false, 'disabling clears the pressed look');
  const before = calls.length;
  press(left, 30);
  assert.equal(calls.length, before + 0);
});

test('assistive technology: activating a Dash button asks for one Dash; activating Charge taps it', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const click = (target) => tc.root.dispatch('click', { detail: 0, target: { closest: () => target } });
  click(tc.dashButtons.get('left'));
  assert.deepEqual(calls, [['dash', -1]]);
  click(tc.buttons.get('charge'));
  assert.deepEqual(calls.at(-1), ['charge', true]);
});

// ---- Joystick: Charge under Jump -------------------------------------------------

test('the down-arrow Charge is held for exactly the pointer\'s lifetime and never sticks', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const charge = tc.buttons.get('charge');
  press(charge, 1);
  assert.deepEqual(calls, [['charge', true]]);
  assert.ok(charge.classList.contains('is-pressed'));
  press(tc.buttons.get('action2'), 2); // Charge + Kick
  lift(tc.buttons.get('action2'), 2);
  assert.ok(charge.classList.contains('is-pressed'), 'still held after Kick');
  assert.equal(tc.counts.get('charge'), 1);
  lift(charge, 1);
  assert.deepEqual(calls.at(-1), ['charge', false]);
  for (const end of ['pointercancel', 'lostpointercapture']) {
    press(charge, 3);
    charge.dispatch(end, { pointerId: 3 });
    assert.deepEqual(calls.at(-1), ['charge', false], end);
  }
  press(charge, 4);
  tc.setEnabled(false);
  assert.deepEqual(calls.at(-1), ['charge', false]);
  assert.equal(charge.classList.contains('is-pressed'), false);
});

// ---- Switching schemes -----------------------------------------------------------

test('switching schemes lets go of everything first: no direction, Charge, Jump or Defense left down', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  tc.stick.rect = { left: 0, top: 100, width: 200, height: 200 };
  tc.stick.dispatch('pointerdown', { pointerId: 1, clientX: 180, clientY: 200, preventDefault() {} });
  for (const [action, id] of [['charge', 2], ['jump', 3], ['defense', 4]]) press(tc.buttons.get(action), id);
  press(tc.dashButtons.get('left'), 5);
  const down = calls.length;
  tc.setScheme('classic');
  assert.deepEqual(calls.slice(down).sort(), [['charge', false], ['defense', false], ['jump', false], ['right', false]]);
  assert.equal(tc.pointers.size, 0);
  assert.ok([...tc.counts.values()].every((n) => n === 0));
  assert.deepEqual(tc.knobOffset, { x: 0, y: 0 }, 'the stick recentred');
  assert.equal(tc.stickPointer, null);
  assert.ok(tc.allButtons.every((b) => !b.classList.contains('is-pressed')), 'no pressed look left anywhere');
  // Late ends from the old layout's pointers change nothing.
  tc.stick.dispatch('pointerup', { pointerId: 1 });
  lift(tc.buttons.get('jump'), 3);
  assert.equal(calls.length, down + 4);

  // And back: a held Classic direction and C are let go too.
  const at = layoutDpad(tc);
  tc.dpad.dispatch('pointerdown', { pointerId: 6, ...at('left'), preventDefault() {} });
  tc.dpad.dispatch('pointerdown', { pointerId: 7, ...at('charge'), preventDefault() {} });
  tc.setScheme('joystick');
  assert.deepEqual(calls.slice(-2).sort(), [['charge', false], ['left', false]]);
  assert.equal(tc.padButtons.get('left').classList.contains('is-pressed'), false);
  // Even re-applying the same scheme releases.
  press(tc.buttons.get('action1'), 8);
  tc.setScheme('joystick');
  assert.deepEqual(calls.at(-1), ['action1', false]);
});

test('a scheme switch keeps the fighter\'s combat buttons: the same elements, icons and names', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const before = new Map(tc.actionButtons);
  for (const scheme of ['classic', 'joystick', 'classic']) {
    tc.setScheme(scheme);
    for (const [action, b] of before) assert.equal(tc.buttons.get(action), b, `${scheme}: ${action}`);
    assert.deepEqual(['primary', 'action1', 'action2'].map((a) => [tc.buttons.get(a).getAttribute('aria-label'), tc.buttons.get(a).innerHTML]),
      [['Shuriken', ICONS.shuriken], ['Punch', ICONS.punch], ['Kick', ICONS.kick]]);
    assert.equal(tc.actions.children[0], before.get('primary'));
  }
  // setCharacter still works in either layout, and never moves a button.
  tc.setScheme('joystick');
  tc.setCharacter(null);
  assert.equal(tc.buttons.get('primary').getAttribute('aria-label'), 'Throw');
  assert.deepEqual(actionsOf(tc.actions).at(-1), 'charge');
  press(tc.buttons.get('primary'), 1);
  assert.deepEqual(calls, [['primary', true]]);
});

test('the Joystick layout\'s geometry: the stick in the old lower-left corner, Dash buttons above its top corners, Charge under Jump', () => {
  const rule = (selector) => CSS.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';
  // The same corner as the Classic cluster, safe areas included.
  assert.match(rule('.tc-dpad'), /left: calc\(max\(var\(--safe-l\), 12px\) \+ 1\.4vw\);/);
  assert.match(rule('.tc-joystick'), /left: calc\(max\(var\(--safe-l\), 12px\) \+ 1\.4vw\);/);
  assert.match(rule('.tc-cluster'), /bottom: var\(--tc-bottom\);/);
  assert.match(CSS, /--tc-bottom: calc\(max\(var\(--safe-b\), 10px\) \+ 1\.6vh\);/);
  // A round, translucent base that takes the pointer and never scrolls or zooms.
  const stick = rule('.tc-stick');
  assert.match(stick, /border-radius: 50%;/);
  assert.match(stick, /touch-action: none;/);
  assert.match(stick, /pointer-events: auto;/);
  assert.match(rule('.tc-stick-knob'), /pointer-events: none;/);
  // Dash buttons: small, above the stick (whose top is at 1.92 --tc), at its left and right.
  assert.match(CSS, /--tc-stick: calc\(var\(--tc\) \* 1\.92\);/);
  assert.match(rule('.tc-dash'), /bottom: calc\(var\(--tc\) \* 1\.82\);/);
  assert.match(rule('.tc-dash'), /width: var\(--tc-dash\);/);
  assert.match(CSS, /--tc-dash: calc\(var\(--tc\) \* 0\.62\);/);
  assert.match(rule('.tc-dash-left'), /left: /);
  assert.match(rule('.tc-dash-right'), /right: /);
  // Charge: centred under Jump (right: 0, bottom: 0), one gap below it; the
  // cluster rises by exactly that much in the Joystick layout only.
  assert.match(rule('.tc-charge-down'), /right: calc\(\(var\(--tc\) - var\(--tc-charge\)\) \/ 2\);/);
  assert.match(rule('.tc-charge-down'), /bottom: calc\(-1 \* \(var\(--tc-charge\) \+ var\(--tc-gap\)\)\);/);
  assert.match(CSS, /\.touch-controls\.is-joystick \.tc-actions \{ bottom: calc\(var\(--tc-bottom\) \+ var\(--tc-charge\) \+ var\(--tc-gap\)\); \}/);
  // The rest of the lower-right cluster is untouched.
  assert.match(CSS, /\.tc-jump \{ right: 0; bottom: 0; \}/);
  assert.match(CSS, /\.tc-a2 \{ right: var\(--tc-pitch\); bottom: 0; \}/);
  assert.match(CSS, /\.tc-a1 \{ right: calc\(var\(--tc-pitch\) \* 2\); bottom: 0; \}/);
  assert.match(CSS, /\.tc-special \{ right: calc\(var\(--tc-pitch\) \* 1\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
});

// ---- Button geometry -----------------------------------------------------------

test('the Shield touch button keeps the old Defense / Block coordinates', () => {
  assert.match(CSS, /\.tc-defense \{ right: calc\(var\(--tc-pitch\) \* 0\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
  assert.doesNotMatch(CSS, /\.tc-block\b/);
});

test('the Shuriken touch button keeps the old Throw / Primary coordinates and size', () => {
  assert.match(CSS, /\.tc-throw \{\n  right: calc\(var\(--tc-pitch\) \* 0\.02\);\n  bottom: calc\(var\(--tc-pitch\) \* 1\.74\);\n  width: calc\(var\(--tc\) \* 1\.12\);\n  height: calc\(var\(--tc\) \* 1\.12\);/);
  assert.doesNotMatch(CSS, /\.tc-primary\b/);
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
  for (const selector of ['.screen--battle', '.battle-canvas', '.screen--practice', '.tc-btn', '.tc-dpad', '.tc-stick']) {
    assert.match(rule(selector), /touch-action: none;/, selector);
  }
  // The document never scrolls, and never selects text or shows a callout.
  assert.match(rule('html, body'), /overflow: hidden;/);
  assert.match(rule('body'), /user-select: none;/);
  assert.match(rule('body'), /-webkit-touch-callout: none;/);
  // Intentionally scrollable panels (the fighter roster, Discover) still pan.
  assert.ok((CSS.match(/touch-action: pan-y;/g) || []).length >= 2, 'scroll panels keep pan-y');
  assert.match(rule('.roster-scroll'), /touch-action: pan-y;/);
  assert.match(rule('.discover-panel'), /touch-action: pan-y;/);
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
