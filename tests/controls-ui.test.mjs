// Run with node --test tests/controls-ui.test.mjs (no dependencies).
// The touch controls on a minimal fake DOM, in both Mobile Controls schemes:
// the icon-based combat buttons (#0001's Shuriken, Punch and Kick from its
// mobileAbilities, the universal Shield), their character-aware refresh, the
// control codenames behind them (uniqueba, shield, ba1, ba2), Classic
// Buttons' Left / C / Right cluster (runLeft / charge / runRight) exactly as
// before,
// the Joystick scheme's stick (a plain base and knob: deadzone, release,
// crossing the centre, multi-touch), its single-tap Left mouvement / Right
// mouvement Dash buttons (mouvementLeft / mouvementRight) and its
// down-arrow Charge to the left of the stick, switching schemes, the
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
const { SAMPLE_FIGHTER } = await import('./sample-fighter.mjs');

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const CSS = read('styles.css');
const DEF_0001 = getCharacter('0001');

// Touch controls wired to a recording input; `def` is the fighter they
// present (#0001 unless given; null leaves them neutral) and `scheme` their
// layout (Classic Buttons here, the layout these checks were written for;
// the Joystick tests below ask for theirs). Mouvement (Dash) requests are
// recorded as ['mouvement', direction].
function touchControls(def = DEF_0001, { scheme = 'classic' } = {}) {
  const calls = [];
  const input = {
    setTouch: (action, held) => calls.push([action, held]),
    queueTouchMouvement: (direction) => calls.push(['mouvement', direction]),
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
  const set = new Set(['shuriken', 'shield', 'punch', 'kick', 'transform', 'jump'].map((n) => ICONS[n]));
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
    uniqueba: { label: 'Shuriken', icon: 'shuriken' },
    ba1: { label: 'Punch', icon: 'punch' },
    ba2: { label: 'Kick', icon: 'kick' },
  });
  // Every icon it names exists; the Shield is universal, not #0001's.
  for (const { icon } of Object.values(DEF_0001.mobileAbilities)) assert.ok(ICONS[icon], icon);
  assert.equal(DEF_0001.mobileAbilities.shield, undefined);
  // No Transform of its own yet: its Transform button stays reserved.
  assert.equal(DEF_0001.mobileAbilities.transform, undefined);
  assert.deepEqual([...ABILITY_ACTIONS], ['uniqueba', 'transform', 'ba1', 'ba2']);
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
  assert.deepEqual(mobileAbility(DEF_0001, 'uniqueba'), { label: 'Shuriken', icon: ICONS.shuriken, pending: false });
  assert.deepEqual(mobileAbility(DEF_0001, 'ba1'), { label: 'Punch', icon: ICONS.punch, pending: false });
  assert.deepEqual(mobileAbility(DEF_0001, 'ba2'), { label: 'Kick', icon: ICONS.kick, pending: false });
  assert.deepEqual(mobileAbility(DEF_0001, 'transform'), { label: 'Transform', icon: ICONS.transform, pending: true });
  for (const def of [null, undefined, {}, { mobileAbilities: {} }]) {
    assert.deepEqual(mobileAbility(def, 'uniqueba'), { label: ACTION_LABELS.uniqueba, icon: ICONS.ring, pending: false });
    assert.deepEqual(mobileAbility(def, 'ba1'), { label: ACTION_LABELS.ba1, icon: ICONS.pip1, pending: false });
    assert.deepEqual(mobileAbility(def, 'ba2'), { label: ACTION_LABELS.ba2, icon: ICONS.pip2, pending: false });
    assert.deepEqual(mobileAbility(def, 'transform'), { label: 'Transform', icon: ICONS.transform, pending: true }, 'reserved until a fighter presents one');
  }
  // Half-authored: whatever is missing or unknown falls back on its own.
  const partial = { mobileAbilities: { uniqueba: { label: 'Kunai' }, ba1: { icon: 'nope', label: 'Jab' }, transform: { label: 'Awaken' } } };
  assert.deepEqual(mobileAbility(partial, 'uniqueba'), { label: 'Kunai', icon: ICONS.ring, pending: false });
  assert.deepEqual(mobileAbility(partial, 'ba1'), { label: 'Jab', icon: ICONS.pip1, pending: false });
  assert.deepEqual(mobileAbility(partial, 'ba2'), { label: 'Basic Attack 2', icon: ICONS.pip2, pending: false });
  assert.deepEqual(mobileAbility(partial, 'transform'), { label: 'Awaken', icon: ICONS.transform, pending: false }, 'its own Transform: no longer reserved');
  // The three fallbacks tell the buttons apart and never borrow #0001's look.
  const glyphs = ['ring', 'pip1', 'pip2'].map((n) => ICONS[n]);
  assert.equal(new Set(glyphs).size, 3);
  for (const g of glyphs) assert.ok(![ICONS.shuriken, ICONS.punch, ICONS.kick].includes(g));
});

// ---- Touch buttons: a fighter that is not #0001 ----------------------------------

test('another fighter presents its own buttons: its Transform is a real button, a button it leaves out is neutral', () => {
  for (const scheme of ['joystick', 'classic']) {
    const { tc, calls } = touchControls(SAMPLE_FIGHTER, { scheme });
    const b = (a) => tc.buttons.get(a);
    assert.deepEqual(['uniqueba', 'transform', 'ba1', 'ba2'].map((a) => [a, b(a).getAttribute('aria-label'), b(a).innerHTML]), [
      ['uniqueba', 'Palm Strike', ICONS.arrow],
      ['transform', 'Awakening', ICONS.up],
      ['ba1', 'Jab', ICONS.punch],
      ['ba2', ACTION_LABELS.ba2, ICONS.pip2],
    ], scheme);
    assert.equal(b('transform').classList.contains('is-pending'), false, `${scheme}: its own Transform, not reserved`);
    assert.deepEqual([...tc.buttons].filter(([, el]) => el.classList.contains('is-pending')), [], `${scheme}: nothing reserved`);
    // The same elements and codenames whatever it looks like.
    press(b('transform'), 1);
    lift(b('transform'), 1);
    assert.deepEqual(calls, [['transform', true], ['transform', false]]);
    // Back to #0001, which has no Transform: the neutral star, reserved again.
    tc.setCharacter(DEF_0001);
    assert.equal(b('transform').getAttribute('aria-label'), 'Transform');
    assert.equal(b('transform').innerHTML, ICONS.transform);
    assert.ok(b('transform').classList.contains('is-pending'), `${scheme}: reserved for #0001`);
    assert.equal(b('uniqueba').getAttribute('aria-label'), 'Shuriken');
  }
});

// ---- Touch buttons: #0001 -----------------------------------------------------

test('#0001\'s Throw button shows the shuriken icon, labelled Shuriken, and still dispatches uniqueba', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('uniqueba');
  assert.equal(b.innerHTML, ICONS.shuriken);
  assert.match(b.innerHTML, /^<svg/);
  assert.equal(b.querySelector('.tc-text'), null);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no visible T');
  assert.doesNotMatch(visibleText(b), /\S/, 'icon only, no text beside it');
  assert.equal(b.getAttribute('aria-label'), 'Shuriken');
  assert.equal(b.getAttribute('data-action'), 'uniqueba');
  assert.ok(b.classList.contains('tc-uniqueba'), 'the same large upper-right slot');
  assert.ok(b.classList.contains('tc-ability'));
  assert.equal(b.classList.contains('is-pending'), false, 'solid, not reserved');
  assert.equal(tc.actions.children[0], b, 'still first in the cluster');
  press(b, 3);
  assert.deepEqual(calls, [['uniqueba', true]]);
  assert.ok(b.classList.contains('is-pressed'), 'immediate press feedback');
  lift(b, 3);
  assert.deepEqual(calls, [['uniqueba', true], ['uniqueba', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
  // Alongside a held direction, too.
  tc.assign(1, 'runRight');
  press(b, 2);
  assert.deepEqual(calls.slice(2), [['runRight', true], ['uniqueba', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['runRight', false], ['uniqueba', false]]);
});

test('#0001\'s BA1 button shows the punch icon, labelled Punch, and still dispatches ba1', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('ba1');
  assert.equal(b.innerHTML, ICONS.punch);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no BA1 text');
  assert.doesNotMatch(visibleText(b), /\S/);
  assert.equal(b.getAttribute('aria-label'), 'Punch');
  assert.equal(b.getAttribute('data-action'), 'ba1');
  assert.ok(b.classList.contains('tc-ba1'));
  assert.equal(b.classList.contains('is-pending'), false);
  press(b, 7);
  assert.deepEqual(calls, [['ba1', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  lift(b, 7);
  assert.deepEqual(calls, [['ba1', true], ['ba1', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('#0001\'s BA2 button shows the kick icon, labelled Kick, and still dispatches ba2', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('ba2');
  assert.equal(b.innerHTML, ICONS.kick);
  assert.notEqual(b.innerHTML, tc.buttons.get('ba1').innerHTML, 'the kick is not the fist');
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no BA2 text');
  assert.doesNotMatch(visibleText(b), /\S/);
  assert.equal(b.getAttribute('aria-label'), 'Kick');
  assert.equal(b.getAttribute('data-action'), 'ba2');
  assert.ok(b.classList.contains('tc-ba2'));
  assert.equal(b.classList.contains('is-pending'), false);
  press(b, 9);
  assert.deepEqual(calls, [['ba2', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  lift(b, 9);
  assert.deepEqual(calls, [['ba2', true], ['ba2', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('the Shield button is the universal Shield: shield icon, labelled Shield, sending shield', () => {
  const { tc } = touchControls();
  assert.equal(tc.buttons.has('block'), false);
  const b = tc.buttons.get('shield');
  assert.equal(b.innerHTML, ICONS.shield);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no visible D');
  assert.doesNotMatch(visibleText(b), /\S/);
  assert.equal(b.getAttribute('aria-label'), 'Shield');
  assert.equal(b.getAttribute('data-action'), 'shield');
  assert.ok(b.classList.contains('tc-shield'), 'the same slot');
  assert.ok(b.classList.contains('tc-ability'));
  assert.equal(b.classList.contains('tc-block'), false);
  assert.equal(b.classList.contains('is-pending'), false);
  // Universal: the same Shield whatever the fighter, or none.
  for (const def of [null, { id: 'x' }, { mobileAbilities: { shield: { label: 'Parry', icon: 'kick' } } }]) {
    const other = touchControls(def).tc.buttons.get('shield');
    assert.equal(other.innerHTML, ICONS.shield);
    assert.equal(other.getAttribute('aria-label'), 'Shield');
  }
});

test('holding Shield dispatches shield for exactly the pointer\'s lifetime, alongside a held direction', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('shield');
  press(b, 6);
  assert.deepEqual(calls, [['shield', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  // Another finger elsewhere does not lower it.
  press(tc.buttons.get('ba1'), 8);
  lift(tc.buttons.get('ba1'), 8);
  assert.deepEqual(calls.slice(1), [['ba1', true], ['ba1', false]]);
  assert.ok(b.classList.contains('is-pressed'), 'still held');
  lift(b, 6);
  assert.deepEqual(calls.at(-1), ['shield', false]);
  assert.equal(b.classList.contains('is-pressed'), false);
  assert.ok(calls.every(([action]) => ['shield', 'ba1'].includes(action)), 'no shield, block or dodge input');
  // A cancelled pointer lowers it too: never stuck up.
  press(b, 4);
  b.dispatch('pointercancel', { pointerId: 4 });
  assert.deepEqual(calls.slice(-2), [['shield', true], ['shield', false]]);
  // Alongside a held direction (multi-touch).
  tc.assign(1, 'runRight');
  press(b, 2);
  assert.deepEqual(calls.slice(-2), [['runRight', true], ['shield', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(-2).sort(), [['runRight', false], ['shield', false]]);
});

test('the lower-right cluster keeps its order and slots; only Transform is reserved; no letters remain', () => {
  const { tc } = touchControls();
  assert.deepEqual(tc.actions.children.map((c) => c.getAttribute('data-action')),
    ['uniqueba', 'transform', 'shield', 'ba1', 'ba2', 'jump']);
  assert.deepEqual(tc.actions.children.map((c) => [...c.classNames].find((n) => /^tc-(uniqueba|transform|shield|ba1|ba2|jump)$/.test(n))),
    ['tc-uniqueba', 'tc-transform', 'tc-shield', 'tc-ba1', 'tc-ba2', 'tc-jump']);
  const pending = [...tc.buttons].filter(([, b]) => b.classList.contains('is-pending')).map(([action]) => action);
  assert.deepEqual(pending, ['transform']);
  assert.equal(tc.buttons.get('transform').innerHTML, ICONS.transform, 'Transform keeps its star');
  assert.equal(tc.buttons.get('transform').getAttribute('aria-label'), 'Transform');
  assert.equal(tc.buttons.get('jump').innerHTML, ICONS.jump, 'Jump unchanged');
  assert.equal(tc.buttons.get('jump').getAttribute('aria-label'), 'Jump');
  // The combat glyphs share one larger-icon class; Transform and Jump do not.
  assert.deepEqual(tc.actions.children.filter((c) => c.classList.contains('tc-ability')).map((c) => c.getAttribute('data-action')),
    ['uniqueba', 'shield', 'ba1', 'ba2']);
  // The only text left on any touch button is Charge's C.
  assert.deepEqual(tc.root.querySelectorAll('.tc-text').map((t) => t.textContent), ['C']);
  for (const b of tc.actions.children) assert.doesNotMatch(visibleText(b), CODE_LABELS, b.getAttribute('data-action'));
  // No new controller inputs: the buttons send the same nine actions as
  // before, by their codenames.
  assert.deepEqual([...tc.buttons.keys()].sort(),
    ['ba1', 'ba2', 'charge', 'jump', 'runLeft', 'runRight', 'shield', 'transform', 'uniqueba']);
});

test('Punch and Kick work alongside a held direction and each other (multi-touch), and rapid taps each register', () => {
  const { tc, calls } = touchControls();
  tc.assign(1, 'runLeft');
  press(tc.buttons.get('ba2'), 2);
  assert.deepEqual(calls, [['runLeft', true], ['ba2', true]]);
  press(tc.buttons.get('ba1'), 3);
  assert.deepEqual(calls.at(-1), ['ba1', true]);
  lift(tc.buttons.get('ba2'), 2);
  assert.deepEqual(calls.at(-1), ['ba2', false]);
  assert.ok(tc.buttons.get('runLeft').classList.contains('is-pressed'), 'the direction is still held');
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['ba1', false], ['runLeft', false]]);
  // Hold Right and tap Punch ten times fast: ten presses, Right never let go.
  const { tc: tc2, calls: log } = touchControls();
  tc2.assign(1, 'runRight');
  for (let i = 0; i < 10; i++) {
    press(tc2.buttons.get('ba1'), 10 + i);
    lift(tc2.buttons.get('ba1'), 10 + i);
  }
  assert.equal(log.filter(([a, held]) => a === 'ba1' && held).length, 10);
  assert.equal(log.filter(([a, held]) => a === 'ba1' && !held).length, 10);
  assert.ok(!log.some(([a, held]) => a === 'runRight' && !held), 'Right stays held');
  assert.ok(tc2.buttons.get('runRight').classList.contains('is-pressed'));
});

// ---- Character switching -------------------------------------------------

test('setCharacter swaps the fighter\'s icons and names in place, without rebuilding the controls or their input', () => {
  const { tc, calls, input } = touchControls();
  const before = { root: tc.root.children.slice(), buttons: new Map(tc.buttons), actions: tc.actions, dpad: tc.dpad, input: tc.input };
  const other = {
    id: '9998',
    mobileAbilities: {
      uniqueba: { label: 'Kunai', icon: 'arrow' },
      ba1: { label: 'Palm Strike', icon: 'up' },
      ba2: { label: 'Sweep', icon: 'down' },
    },
  };
  tc.setCharacter(other);
  const b = (a) => tc.buttons.get(a);
  assert.deepEqual([b('uniqueba').innerHTML, b('ba1').innerHTML, b('ba2').innerHTML], [ICONS.arrow, ICONS.up, ICONS.down]);
  assert.deepEqual(['uniqueba', 'ba1', 'ba2'].map((a) => b(a).getAttribute('aria-label')), ['Kunai', 'Palm Strike', 'Sweep']);
  for (const a of ['uniqueba', 'ba1', 'ba2']) {
    assert.doesNotMatch(b(a).innerHTML, new RegExp([ICONS.shuriken, ICONS.punch, ICONS.kick].map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')), `${a}: nothing of #0001 left`);
  }
  // Universal buttons untouched.
  assert.equal(b('shield').innerHTML, ICONS.shield);
  assert.equal(b('transform').innerHTML, ICONS.transform);
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
  press(b('ba1'), 5);
  lift(b('ba1'), 5);
  press(b('uniqueba'), 6);
  assert.deepEqual(calls, [['ba1', true], ['ba1', false], ['uniqueba', true]]);
  // A fighter that authors nothing: neutral, never #0001's leftovers.
  tc.setCharacter({ id: '9997' });
  assert.deepEqual(['uniqueba', 'ba1', 'ba2'].map((a) => [b(a).innerHTML, b(a).getAttribute('aria-label')]),
    [[ICONS.ring, 'Unique Basic Attack'], [ICONS.pip1, 'Basic Attack 1'], [ICONS.pip2, 'Basic Attack 2']]);
  // And back.
  tc.setCharacter(DEF_0001);
  assert.deepEqual(['uniqueba', 'ba1', 'ba2'].map((a) => b(a).getAttribute('aria-label')), ['Shuriken', 'Punch', 'Kick']);
});

test('before any fighter is named the controls are usable and neutral; a held button survives a swap', () => {
  const { tc, calls } = touchControls(null);
  assert.deepEqual(['uniqueba', 'ba1', 'ba2'].map((a) => tc.buttons.get(a).getAttribute('aria-label')),
    ['Unique Basic Attack', 'Basic Attack 1', 'Basic Attack 2']);
  const b = tc.buttons.get('ba1');
  assert.equal(b.innerHTML, ICONS.pip1);
  press(b, 4);
  tc.setCharacter(DEF_0001);
  assert.ok(b.classList.contains('is-pressed'), 'still pressed after the icon changed');
  assert.equal(b.innerHTML, ICONS.punch);
  lift(b, 4);
  assert.deepEqual(calls, [['ba1', true], ['ba1', false]]);
});

// ---- Desktop controls ---------------------------------------------------------

test('keyboard bindings are unchanged by the touch layouts, keyed by control codename', () => {
  assert.deepEqual({ ...CONFIG.bindings }, {
    runLeft: ['KeyA', 'ArrowLeft'],
    runRight: ['KeyD', 'ArrowRight'],
    charge: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    uniqueba: ['KeyJ'],
    transform: ['KeyK'],
    shield: ['KeyL'],
    ba1: ['KeyU'],
    ba2: ['KeyI'],
    pause: ['Escape', 'KeyP'],
  });
  assert.deepEqual({ ...ACTION_LABELS }, {
    runLeft: 'Move left', runRight: 'Move right', charge: 'Charge', jump: 'Jump', uniqueba: 'Unique Basic Attack', transform: 'Transform',
    shield: 'Shield', ba1: 'Basic Attack 1', ba2: 'Basic Attack 2', pause: 'Pause',
  });
  // No Down, Block or dash key: Dash stays a double tap on the keyboard, and
  // the mouvement buttons are touch-only. No retired name survives as an alias.
  for (const name of [
    'down', 'block', 'dash', 'dashLeft', 'dashRight', 'mouvementLeft', 'mouvementRight',
    'left', 'right', 'primary', 'special', 'defense', 'action1', 'action2',
  ]) {
    assert.equal(CONFIG.bindings[name], undefined, name);
    assert.equal(ACTION_LABELS[name], undefined, name);
  }
});

// ---- Classic Buttons: Charge ------------------------------------------------

// Lays the lower-left cluster out left to right, 50 px apart.
function layoutDpad(tc) {
  ['runLeft', 'charge', 'runRight'].forEach((action, i) => {
    tc.buttons.get(action).rect = { left: i * 50, top: 0, width: 40, height: 40 };
  });
  return (action) => ({ clientX: ['runLeft', 'charge', 'runRight'].indexOf(action) * 50 + 20, clientY: 20 });
}

test('the middle lower-left touch button is Charge: text C, labelled Charge, no Down arrow', () => {
  const { tc } = touchControls();
  const [left, middle, right] = tc.dpad.children;
  assert.equal(left, tc.buttons.get('runLeft'));
  assert.equal(middle, tc.buttons.get('charge'));
  assert.equal(right, tc.buttons.get('runRight'));
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
  tc.dpad.dispatch('pointerdown', { pointerId: 1, ...at('runLeft'), preventDefault() {} });
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('charge') });
  assert.deepEqual(calls, [['runLeft', true], ['runLeft', false], ['charge', true]]);
  assert.ok(tc.buttons.get('charge').classList.contains('is-pressed'));
  assert.equal(tc.buttons.get('runLeft').classList.contains('is-pressed'), false);
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('runRight') });
  assert.deepEqual(calls.slice(3), [['charge', false], ['runRight', true]]);
  assert.equal(tc.buttons.get('charge').classList.contains('is-pressed'), false);
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('charge') });
  tc.dpad.dispatch('pointerup', { pointerId: 1 });
  assert.deepEqual(calls.slice(5), [['runRight', false], ['charge', true], ['charge', false]]);
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
  for (const other of ['ba1', 'ba2', 'shield', 'jump']) {
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
  const input = { setTouch() {}, queueTouchMouvement() {} };
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
  assert.deepEqual(actionsOf(tc.dpad), ['runLeft', 'charge', 'runRight']);
  assert.deepEqual(tc.dpad.children.map((b) => b.getAttribute('aria-label')), ['Move left', 'Charge', 'Move right']);
  assert.equal(tc.dpad.getAttribute('aria-label'), 'Movement and Charge');
  assert.deepEqual(actionsOf(tc.actions), ['uniqueba', 'transform', 'shield', 'ba1', 'ba2', 'jump']);
  assert.equal(tc.buttons.get('charge').textContent, 'C');
  // Nothing of the Joystick scheme is on screen.
  assert.equal(tc.root.querySelectorAll('.tc-stick').length, 0);
  assert.equal(tc.root.querySelectorAll('.tc-dash').length, 0);
  assert.equal(tc.root.querySelectorAll('.tc-charge-down').length, 0);
  // Left and Right are ordinary held directions: a Dash still needs two taps.
  const { tc: tc2, calls } = touchControls(DEF_0001, { scheme: 'classic' });
  const at = layoutDpad(tc2);
  tc2.dpad.dispatch('pointerdown', { pointerId: 1, ...at('runRight'), preventDefault() {} });
  tc2.dpad.dispatch('pointerup', { pointerId: 1 });
  tc2.dpad.dispatch('pointerdown', { pointerId: 2, ...at('runRight'), preventDefault() {} });
  tc2.dpad.dispatch('pointerup', { pointerId: 2 });
  assert.deepEqual(calls, [['runRight', true], ['runRight', false], ['runRight', true], ['runRight', false]], 'two taps are two presses, no Dash request');
});

test('the Joystick scheme: Charge (a down arrow), then a movement joystick between Left mouvement and Right mouvement', () => {
  const { tc } = touchControls(DEF_0001, { scheme: 'joystick' });
  assert.deepEqual(tc.root.children, [tc.joystick, tc.actions]);
  const [charge, mouvementLeft, stick, mouvementRight] = tc.joystick.children;
  assert.equal(tc.joystick.children.length, 4);
  assert.equal(stick, tc.stick);
  assert.equal(stick.getAttribute('role'), 'group');
  assert.equal(stick.getAttribute('aria-label'), 'Movement joystick');
  // A plain base and knob: no arrows (or anything else) inside the stick.
  assert.deepEqual(stick.children, [tc.knob]);
  assert.equal(stick.querySelectorAll('.tc-stick-arrow').length, 0);
  assert.equal(stick.innerHTML, '');
  // The Dash buttons, mouvementLeft and mouvementRight: real buttons with
  // exactly these names, spelling kept, and the readable arrow glyphs.
  for (const [b, name, icon, side, control] of [
    [mouvementLeft, 'Left mouvement', ICONS.left, 'left', 'mouvementLeft'],
    [mouvementRight, 'Right mouvement', ICONS.right, 'right', 'mouvementRight'],
  ]) {
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.getAttribute('type'), 'button');
    assert.equal(b.getAttribute('aria-label'), name);
    assert.equal(b.innerHTML, icon);
    assert.ok(b.classList.contains('tc-btn'));
    assert.ok(b.classList.contains(`tc-dash-${side}`));
    assert.equal(b.getAttribute('data-action'), null, 'not a held action');
    assert.equal(b.getAttribute('data-mouvement'), control);
    assert.equal(tc.mouvementButtons.get(control), b);
  }
  assert.deepEqual([...tc.mouvementButtons.keys()], ['mouvementLeft', 'mouvementRight'], 'mouvement, as written');
  assert.doesNotMatch(mouvementLeft.getAttribute('aria-label') + mouvementRight.getAttribute('aria-label'), /movement/, 'mouvement, as written');
  // The old cluster is gone from the screen, C included.
  assert.equal(tc.root.querySelectorAll('.tc-dpad').length, 0);
  assert.deepEqual(tc.root.querySelectorAll('.tc-text'), [], 'no C anywhere');
  // Charge sits to the left of the stick, not under Jump: the down arrow,
  // announced as Charge, sending the same held charge.
  assert.deepEqual(actionsOf(tc.actions), ['uniqueba', 'transform', 'shield', 'ba1', 'ba2', 'jump'], 'nothing under Jump');
  assert.equal(charge, tc.buttons.get('charge'));
  assert.equal(charge.getAttribute('data-action'), 'charge');
  assert.ok(charge.classList.contains('tc-btn'));
  assert.equal(charge.innerHTML, ICONS.down);
  assert.equal(charge.getAttribute('aria-label'), 'Charge', 'Charge, not Down');
  assert.ok(charge.classList.contains('tc-charge-down'));
  assert.equal(charge.tagName, 'BUTTON');
  // The same seven held inputs, no left / right buttons: the stick holds those.
  assert.deepEqual([...tc.buttons.keys()].sort(), ['ba1', 'ba2', 'charge', 'jump', 'shield', 'transform', 'uniqueba']);
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
  assert.equal(joystickDirection(0.34), 'runRight');
  assert.equal(joystickDirection(-0.34), 'runLeft');
  assert.equal(joystickDirection(0.3, 'runRight'), 'runRight', 'held until back in the deadzone');
  assert.equal(joystickDirection(0.2, 'runRight'), null);
  assert.equal(joystickDirection(-0.3, 'runLeft'), 'runLeft');
  assert.equal(joystickDirection(-0.2, 'runLeft'), null);
  assert.equal(joystickDirection(-0.5, 'runRight'), 'runLeft', 'straight across');
  assert.equal(joystickDirection(0.3, 'runLeft'), null, 'crossing drops the old direction');
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
  assert.deepEqual(calls, [['runRight', true]]);
  assert.ok(tc.stick.classList.contains('is-right'));
  for (const x of [60, 45, 30, 26]) move(x, 12);
  assert.deepEqual(calls, [['runRight', true]], 'no repeat presses while it stays out');
  move(10);
  assert.deepEqual(calls, [['runRight', true], ['runRight', false]], 'back in the deadzone: released');
  assert.equal(tc.stick.classList.contains('is-right'), false);
  move(-50);
  assert.deepEqual(calls.at(-1), ['runLeft', true]);
  assert.ok(tc.stick.classList.contains('is-left'));
  end();
  assert.deepEqual(calls.at(-1), ['runLeft', false]);
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
  assert.deepEqual(calls, [['runRight', true], ['runRight', false], ['runLeft', true]], 'in one move');
  assert.ok(tc.stick.classList.contains('is-left'));
  assert.equal(tc.stick.classList.contains('is-right'), false);
  move(0);
  move(70);
  assert.deepEqual(calls.slice(3), [['runLeft', false], ['runRight', true]], 'or through the centre');
  assert.equal(tc.counts.get('runLeft'), 0);
  assert.equal(tc.counts.get('runRight'), 1);
  end();
  assert.deepEqual(calls.at(-1), ['runRight', false]);
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
  assert.deepEqual(calls, [['runRight', true]], 'pushed all the way: the same digital Right');
  move(30, 90);
  assert.ok(Math.hypot(tc.knobOffset.x, tc.knobOffset.y) <= travel + 1e-9);
  end();
});

test('cancelling, losing capture, disabling or releaseAll() always recentres and lets go', () => {
  for (const type of ['pointercancel', 'lostpointercapture', 'pointerup']) {
    const { tc, calls, down, end } = joystickControls();
    down(70, 20);
    end(type);
    assert.deepEqual(calls, [['runRight', true], ['runRight', false]], type);
    assert.deepEqual(tc.knobOffset, { x: 0, y: 0 });
    assert.equal(tc.stickPointer, null);
  }
  for (const stop of [(tc) => tc.setEnabled(false), (tc) => tc.releaseAll()]) {
    const { tc, calls, down, move } = joystickControls();
    down(-70);
    stop(tc);
    assert.deepEqual(calls, [['runLeft', true], ['runLeft', false]]);
    assert.deepEqual(tc.knobOffset, { x: 0, y: 0 });
    assert.equal(tc.stick.classList.contains('is-active'), false);
    // The thumb still on the glass steers nothing until it lands again.
    move(-80);
    assert.deepEqual(calls, [['runLeft', true], ['runLeft', false]]);
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
  assert.deepEqual(calls, [['runRight', true]]);
  assert.equal(tc.stickPointer, 1);
  end('pointerup', 1);
  assert.deepEqual(calls, [['runRight', true], ['runRight', false]]);
});

test('the joystick works alongside Jump, Punch, Kick, Shield, Shuriken, Transform and Charge (multi-touch)', () => {
  for (const other of ['jump', 'ba1', 'ba2', 'shield', 'uniqueba', 'transform', 'charge']) {
    const { tc, calls, down, end } = joystickControls();
    down(70);
    const b = tc.buttons.get(other);
    press(b, 9);
    assert.deepEqual(calls, [['runRight', true], [other, true]], other);
    assert.ok(b.classList.contains('is-pressed'), `${other}: pressed feedback`);
    lift(b, 9);
    assert.deepEqual(calls.at(-1), [other, false]);
    assert.equal(tc.counts.get('runRight'), 1, `${other}: Right still held`);
    assert.ok(tc.stick.classList.contains('is-right'));
    end();
    assert.deepEqual(calls.at(-1), ['runRight', false]);
  }
  // Several at once, in any order of release.
  const { tc, calls, down, end } = joystickControls();
  down(-70);
  press(tc.buttons.get('charge'), 2);
  press(tc.buttons.get('ba1'), 3);
  press(tc.buttons.get('jump'), 4);
  end();
  lift(tc.buttons.get('jump'), 4);
  lift(tc.buttons.get('ba1'), 3);
  lift(tc.buttons.get('charge'), 2);
  assert.deepEqual(calls, [
    ['runLeft', true], ['charge', true], ['ba1', true], ['jump', true],
    ['runLeft', false], ['jump', false], ['ba1', false], ['charge', false],
  ]);
});

// ---- Joystick: Dash buttons ----------------------------------------------------

test('one tap of Left mouvement / Right mouvement asks for exactly one Dash, and holds nothing', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const left = tc.mouvementButtons.get('mouvementLeft');
  const right = tc.mouvementButtons.get('mouvementRight');
  press(right, 1);
  assert.deepEqual(calls, [['mouvement', 1]], 'one request, the moment it goes down');
  assert.ok(right.classList.contains('is-pressed'), 'pressed at once');
  // Held down: no more requests, and no direction held.
  right.dispatch('pointermove', { pointerId: 1 });
  lift(right, 1);
  assert.deepEqual(calls, [['mouvement', 1]]);
  assert.equal(right.classList.contains('is-pressed'), false);
  assert.ok(!calls.some(([a]) => a === 'runLeft' || a === 'runRight'), 'never a held Left or Right');
  assert.equal(tc.pointers.size, 0);
  assert.equal(tc.counts.get('runRight') ?? 0, 0);
  press(left, 2);
  left.dispatch('pointercancel', { pointerId: 2 });
  assert.deepEqual(calls, [['mouvement', 1], ['mouvement', -1]]);
  assert.equal(left.classList.contains('is-pressed'), false, 'a cancelled pointer lets go too');
  // Each tap is its own request (whether it Dashes is the fighter's call).
  for (let i = 0; i < 3; i++) {
    press(right, 10 + i);
    lift(right, 10 + i);
  }
  assert.deepEqual(calls.slice(2), [['mouvement', 1], ['mouvement', 1], ['mouvement', 1]]);
  // Alongside the joystick, from another finger.
  tc.stick.rect = { left: 0, top: 100, width: 200, height: 200 };
  tc.stick.dispatch('pointerdown', { pointerId: 20, clientX: 30, clientY: 200, preventDefault() {} });
  press(right, 21);
  assert.deepEqual(calls.slice(5), [['runLeft', true], ['mouvement', 1]]);
  assert.equal(tc.counts.get('runLeft'), 1, 'the stick\'s Left is untouched by the tap');
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
  click(tc.mouvementButtons.get('mouvementLeft'));
  assert.deepEqual(calls, [['mouvement', -1]]);
  click(tc.buttons.get('charge'));
  assert.deepEqual(calls.at(-1), ['charge', true]);
});

// ---- Joystick: Charge left of the stick ------------------------------------------

test('the down-arrow Charge is held for exactly the pointer\'s lifetime and never sticks', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const charge = tc.buttons.get('charge');
  press(charge, 1);
  assert.deepEqual(calls, [['charge', true]]);
  assert.ok(charge.classList.contains('is-pressed'));
  press(tc.buttons.get('ba2'), 2); // Charge + Kick
  lift(tc.buttons.get('ba2'), 2);
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

test('switching schemes lets go of everything first: no direction, Charge, Jump or Shield left down', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  tc.stick.rect = { left: 0, top: 100, width: 200, height: 200 };
  tc.stick.dispatch('pointerdown', { pointerId: 1, clientX: 180, clientY: 200, preventDefault() {} });
  for (const [action, id] of [['charge', 2], ['jump', 3], ['shield', 4]]) press(tc.buttons.get(action), id);
  press(tc.mouvementButtons.get('mouvementLeft'), 5);
  const down = calls.length;
  tc.setScheme('classic');
  assert.deepEqual(calls.slice(down).sort(), [['charge', false], ['jump', false], ['runRight', false], ['shield', false]]);
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
  tc.dpad.dispatch('pointerdown', { pointerId: 6, ...at('runLeft'), preventDefault() {} });
  tc.dpad.dispatch('pointerdown', { pointerId: 7, ...at('charge'), preventDefault() {} });
  tc.setScheme('joystick');
  assert.deepEqual(calls.slice(-2).sort(), [['charge', false], ['runLeft', false]]);
  assert.equal(tc.padButtons.get('runLeft').classList.contains('is-pressed'), false);
  // Even re-applying the same scheme releases.
  press(tc.buttons.get('ba1'), 8);
  tc.setScheme('joystick');
  assert.deepEqual(calls.at(-1), ['ba1', false]);
});

test('a scheme switch keeps the fighter\'s combat buttons: the same elements, icons and names', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const before = new Map(tc.actionButtons);
  for (const scheme of ['classic', 'joystick', 'classic']) {
    tc.setScheme(scheme);
    for (const [action, b] of before) assert.equal(tc.buttons.get(action), b, `${scheme}: ${action}`);
    assert.deepEqual(['uniqueba', 'ba1', 'ba2'].map((a) => [tc.buttons.get(a).getAttribute('aria-label'), tc.buttons.get(a).innerHTML]),
      [['Shuriken', ICONS.shuriken], ['Punch', ICONS.punch], ['Kick', ICONS.kick]]);
    assert.equal(tc.actions.children[0], before.get('uniqueba'));
  }
  // setCharacter still works in either layout, and never moves a button.
  tc.setScheme('joystick');
  tc.setCharacter(null);
  assert.equal(tc.buttons.get('uniqueba').getAttribute('aria-label'), 'Unique Basic Attack');
  assert.equal(tc.joystick.children[0], tc.buttons.get('charge'));
  assert.deepEqual(actionsOf(tc.actions).at(-1), 'jump');
  press(tc.buttons.get('uniqueba'), 1);
  assert.deepEqual(calls, [['uniqueba', true]]);
});

test('the Joystick layout\'s geometry: Charge in the old lower-left corner, the stick one gap to its right with Dash buttons above its top corners', () => {
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
  // No arrows drawn on the base.
  assert.doesNotMatch(CSS, /\.tc-stick-arrow/);
  // The stick starts past Charge and one gap; the cluster is that much wider.
  assert.match(CSS, /--tc-stick-left: calc\(var\(--tc-charge\) \+ var\(--tc-gap\)\);/);
  assert.match(stick, /left: var\(--tc-stick-left\);/);
  assert.match(rule('.tc-joystick'), /width: calc\(var\(--tc-stick-left\) \+ var\(--tc-stick\)\);/);
  // Dash buttons: small, above the stick (whose top is at 1.92 --tc), at its left and right.
  assert.match(CSS, /--tc-stick: calc\(var\(--tc\) \* 1\.92\);/);
  assert.match(rule('.tc-dash'), /bottom: calc\(var\(--tc\) \* 1\.82\);/);
  assert.match(rule('.tc-dash'), /width: var\(--tc-dash\);/);
  assert.match(CSS, /--tc-dash: calc\(var\(--tc\) \* 0\.62\);/);
  assert.match(rule('.tc-dash-left'), /left: calc\(var\(--tc-stick-left\) - var\(--tc\) \* 0\.03\);/);
  assert.match(rule('.tc-dash-right'), /right: calc\(var\(--tc\) \* -0\.03\);/);
  // Charge: at the cluster's left edge, level with the stick's centre.
  const charge = rule('.tc-charge-down');
  assert.match(charge, /position: absolute;/);
  assert.match(charge, /left: 0;/);
  assert.match(charge, /bottom: calc\(\(var\(--tc-stick\) - var\(--tc-charge\)\) \/ 2\);/);
  assert.match(charge, /width: var\(--tc-charge\);/);
  // Clear of the Left mouvement button above it (in --tc: Charge spans x
  // 0-0.8, y 0.56-1.36; Left mouvement starts at x 0.94, y 1.82).
  const [chargeTop, dashBottom, chargeRight, dashLeft] = [(1.92 - 0.8) / 2 + 0.8, 1.82, 0.8, 0.8 + 0.17 - 0.03];
  assert.ok(chargeTop < dashBottom && chargeRight < dashLeft);
  // The lower-right cluster no longer rises: it sits exactly where Classic
  // Buttons has it, untouched.
  assert.doesNotMatch(CSS, /\.is-joystick \.tc-actions/);
  assert.match(CSS, /\.tc-jump \{ right: 0; bottom: 0; \}/);
  assert.match(CSS, /\.tc-ba2 \{ right: var\(--tc-pitch\); bottom: 0; \}/);
  assert.match(CSS, /\.tc-ba1 \{ right: calc\(var\(--tc-pitch\) \* 2\); bottom: 0; \}/);
  assert.match(CSS, /\.tc-transform \{ right: calc\(var\(--tc-pitch\) \* 1\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
});

// ---- Button geometry -----------------------------------------------------------

test('the Shield touch button keeps the old Defense / Block coordinates', () => {
  assert.match(CSS, /\.tc-shield \{ right: calc\(var\(--tc-pitch\) \* 0\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
  assert.doesNotMatch(CSS, /\.tc-(block|defense)\b/);
});

test('the Shuriken touch button keeps the old Throw / Primary coordinates and size', () => {
  assert.match(CSS, /\.tc-uniqueba \{\n  right: calc\(var\(--tc-pitch\) \* 0\.02\);\n  bottom: calc\(var\(--tc-pitch\) \* 1\.74\);\n  width: calc\(var\(--tc\) \* 1\.12\);\n  height: calc\(var\(--tc\) \* 1\.12\);/);
  assert.doesNotMatch(CSS, /\.tc-(primary|throw|special|a1|a2)\b/);
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
