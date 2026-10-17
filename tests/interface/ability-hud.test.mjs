// Run with node --test tests/interface/ability-hud.test.mjs (no dependencies).
// The ability HUD (js/ui/ability-hud.js) and the read-only move status it
// reads (js/game/combat/move-status.js), on a minimal fake DOM with real
// fighters: which moves each row shows, their art and inputs, the
// ground / air wheel, and cooldowns read from the combat state alone.
// Layout and paint are checked in a real browser (docs/development/testing.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DT, makeFighter, fakeSpritesOf } from '../helpers/fighter-harness.mjs';
import { COMBAT_BUTTONS, CONFIG } from '../../js/config.js';
import { getCharacter } from '../../js/data/characters.js';
import { previewFrame } from '../../js/data/ability-preview.js';
import { resolveProfile } from '../../js/data/controller-profiles.js';
import { formatCooldown } from '../../js/game/rendering/fighter-status.js';
import { abilityGroups, abilityStatus, moveCooldown } from '../../js/game/combat/move-status.js';
import { AbilityHUD, abilityInput, keyCapLabel } from '../../js/ui/ability-hud.js';
import { BattleScreen } from '../../js/screens/battle-screen.js';
import { PracticeGroundScreen } from '../../js/screens/practice-screen.js';
import { Arena } from '../../js/game/arena.js';
import { Settings } from '../../js/core/settings.js';
import { setLanguage } from '../../js/localization/i18n.js';
import { stylesheet } from '../helpers/stylesheet.mjs';

const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const DEF_0003 = getCharacter('0003');
const ROOT = new URL('../../', import.meta.url);

// ---- A minimal DOM -------------------------------------------------------------

class Node { parentNode = null; }
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = { props: {}, setProperty(name, value) { this.props[name] = value; } };
  dataset = {};
  hidden = false;
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
  setAttribute(name, value) { if (name === 'hidden') this.hidden = true; else this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  removeAttribute(name) { this.attrs.delete(name); }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent ?? '').join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  get innerHTML() { return this.html ?? ''; }
  get isConnected() { return true; }
  get offsetWidth() { return 0; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.html = ''; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type) { for (const fn of this.listeners.get(type) ?? []) fn({ target: this }); }
  querySelectorAll(cls) {
    const out = [];
    const walk = (n) => n.children.forEach((c) => {
      if (!(c instanceof Element)) return;
      if (c.classNames.has(cls.slice(1))) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  querySelector(cls) { return this.querySelectorAll(cls)[0] ?? null; }
}
globalThis.Node = Node;
globalThis.document = {
  body: new Element('body'),
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  addEventListener() {},
  removeEventListener() {},
};
setLanguage('en');

// An InputManager stand-in: the device last used, the keyboard bindings,
// Player 1's pad and the profile each fighter plays with.
function fakeInput({ device = 'keyboard', family = 'playstation', model = 'dualsense', stored = {} } = {}) {
  return {
    lastDevice: device,
    bindings: CONFIG.bindings,
    controllers: { player1: family ? { family, model, key: 'pad' } : null },
    profileFor: (def) => resolveProfile(def, def ? stored[def.id] ?? null : null),
  };
}

function hudFor(def, opts = {}) {
  const input = fakeInput(opts);
  const settings = new Settings(null);
  const hud = new AbilityHUD(new Element('div'), { input, settings });
  const { fighter, step } = makeFighter({ character: def, sprites: fakeSpritesOf(def) });
  hud.bind(fighter);
  hud.setVisible(true);
  hud.update(fighter);
  return { hud, fighter, step, input, settings };
}

const tiles = (hud, place) => hud.rows[place].tiles;
const moves = (hud, place) => tiles(hud, place).map((t) => t.entry.move);
const tileOf = (hud, place, move) => tiles(hud, place).find((t) => t.entry.move === move);
const chips = (tile) => tile.input.children.map((c) => c.textContent);
const air = (fighter, on = true) => { fighter.body.grounded = !on; };

// ---- Which moves, in which row ---------------------------------------------------

test('each fighter\'s rows come from its loadout: every real move once, ground-only moves never in the air, nothing else', () => {
  const groups = (def) => {
    const g = abilityGroups(def);
    return { ground: g.ground.map((e) => e.move), air: g.air.map((e) => e.move) };
  };
  assert.deepEqual(groups(DEF_0001), {
    ground: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'],
    air: ['midair_attack1', 'midair_attack2', 'midair_attack3', 'extra_attack'],
  }, '#0001: Unlimited Void and Hollow Purple stay on the ground; the High Kick floats');
  assert.deepEqual(groups(DEF_0002), {
    ground: ['attack1', 'attack2', 'attack3', 'extra_attack'],
    air: ['midair_attack1', 'midair_attack2', 'midair_attack3'],
  }, '#0002: the Whirlwind is the ground\'s');
  assert.deepEqual(groups(DEF_0003), {
    ground: ['attack1', 'attack2', 'attack3', 'attack4', 'extra_attack'],
    air: ['midair_attack1', 'midair_attack2'],
  }, '#0003: its techniques and its Haymaker are the ground\'s');
  // Every row is a combat button the fighter really has: the retired
  // Transform is nobody's.
  for (const def of [DEF_0001, DEF_0002, DEF_0003, getCharacter('0004')]) {
    assert.equal(Object.hasOwn(def.actions, 'transform'), false, `#${def.id}: no Transform`);
    for (const e of [...abilityGroups(def).ground, ...abilityGroups(def).air]) {
      assert.ok(COMBAT_BUTTONS.includes(e.action) && Object.hasOwn(def.actions, e.action), `#${def.id}: ${e.action}`);
    }
  }
  // A fighter nobody has made: two attacks, no extra, nothing else.
  const two = { ...DEF_0002, id: 'test-two', actions: { attack1: DEF_0002.actions.attack1, attack2: DEF_0002.actions.attack2 } };
  assert.deepEqual(groups(two), { ground: ['attack1', 'attack2'], air: ['midair_attack1', 'midair_attack2'] }, 'no empty slots for missing buttons');
  assert.equal(readFileSync(new URL('js/ui/ability-hud.js', ROOT), 'utf8').match(/'000\d'/), null, 'no fighter named in the HUD');
  assert.equal(readFileSync(new URL('js/game/combat/move-status.js', ROOT), 'utf8').match(/'000\d'/), null, 'nor in the status it reads');
});

// ---- The wheel ---------------------------------------------------------------------

test('grounded: the ground row is the current one on top; airborne: the air row; the other always shows beneath', () => {
  const { hud, fighter } = hudFor(DEF_0001);
  assert.equal(hud.wheel.dataset.place, 'ground');
  assert.ok(hud.rows.ground.el.classList.contains('is-current'));
  assert.equal(hud.rows.air.el.classList.contains('is-current'), false);
  assert.equal(hud.rows.ground.el.getAttribute('aria-label'), 'Ground moves, current');
  assert.equal(hud.rows.air.el.getAttribute('aria-label'), 'Air moves, once airborne');
  for (const place of ['ground', 'air']) assert.equal(hud.rows[place].el.hidden, false, `${place}: never hidden for being inactive`);
  air(fighter);
  hud.update(fighter);
  assert.equal(hud.wheel.dataset.place, 'air', 'the rows swap');
  assert.ok(hud.rows.air.el.classList.contains('is-current'));
  assert.equal(hud.rows.ground.el.getAttribute('aria-label'), 'Ground moves, after landing');
  air(fighter, false);
  hud.update(fighter);
  assert.equal(hud.wheel.dataset.place, 'ground', 'and back on landing');
});

test('rapid jumps and landings: the wheel follows the latest place, nothing queued, no tile rebuilt', () => {
  const { hud, fighter } = hudFor(DEF_0002);
  const before = [...tiles(hud, 'ground'), ...tiles(hud, 'air')].map((t) => t.el);
  const seen = [];
  for (let i = 0; i < 25; i++) {
    air(fighter, i % 3 !== 0);
    hud.update(fighter);
    seen.push(hud.wheel.dataset.place);
    assert.equal(hud.wheel.dataset.place, fighter.grounded ? 'ground' : 'air', `step ${i}`);
  }
  assert.deepEqual([...tiles(hud, 'ground'), ...tiles(hud, 'air')].map((t) => t.el), before, 'the same tiles throughout');
  assert.equal(hud.wheel.children.length, 2, 'two rows, never more');
  // The swap is the stylesheet's transition on the wheel's one attribute:
  // retargeted from wherever it is, never queued, at once with reduced motion.
  const css = stylesheet();
  assert.match(css, /\.ah-wheel\[data-place="ground"\] \.ah-row--ground/);
  assert.match(css, /\.ah-row \{[^}]*transition:[^}]*transform var\(--ah-swap\)/s);
  assert.match(css, /--ah-swap: 320ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ah-row, \.ah-cd, \.ah-sprite \{ transition: none; \}/);
  assert.doesNotMatch(readFileSync(new URL('js/ui/ability-hud.js', ROOT), 'utf8'), /setTimeout|setInterval|requestAnimationFrame/, 'no timers of its own');
});

// ---- Art ---------------------------------------------------------------------------

test('every tile shows its own move\'s art: the preview frame, the air artwork for a distinct air move', () => {
  for (const def of [DEF_0001, DEF_0002, DEF_0003]) {
    const { hud } = hudFor(def);
    for (const place of ['ground', 'air']) {
      for (const tile of tiles(hud, place)) {
        const want = previewFrame(def, tile.entry.action, place === 'air');
        const img = tile.art.children[0];
        assert.ok(want, `#${def.id} ${tile.entry.move}: has art`);
        assert.equal(img?.getAttribute('src'), want.url, `#${def.id} ${place} ${tile.entry.move}`);
        assert.equal(img.classList.contains('is-mirrored'), !!want.mirrored);
      }
    }
  }
  const { hud } = hudFor(DEF_0001);
  const src = (place, move) => tileOf(hud, place, move).art.children[0].getAttribute('src');
  assert.match(src('ground', 'attack2'), /0001_attack2_object_1\.png$/, 'Red: its orb');
  assert.match(src('ground', 'attack3'), /0001_attack3_object_1\.png$/, 'Maximum Blue: its orb');
  assert.match(src('air', 'midair_attack2'), /0001_midair_attack2_4\.png$/, 'the Red Kick: its own frame, never Red\'s');
  assert.match(src('air', 'midair_attack3'), /0001_midair_attack3_2\.png$/, 'Blue: its own frame');
});

test('missing art: a neutral glyph, never a broken image; a frame that fails to load falls back once', () => {
  const noArt = {
    ...DEF_0002, id: 'test-no-art',
    mobileAbilities: { ...DEF_0002.mobileAbilities, attack1: { label: 'One-Two', preview: { animation: 'attack1', frame: 99 } } },
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { hud } = hudFor(noArt);
    const tile = tileOf(hud, 'ground', 'attack1');
    assert.equal(tile.art.children.length, 0, 'no image');
    assert.match(tile.art.innerHTML, /<svg/, 'the neutral glyph');
    const kick = tileOf(hud, 'ground', 'attack2');
    const img = kick.art.children[0];
    img.dispatch('error');
    assert.match(kick.art.innerHTML, /<svg/, 'a failed frame shows the glyph');
  } finally {
    console.warn = warn;
  }
});

// ---- Inputs ------------------------------------------------------------------------

test('keyboard: each tile shows its button\'s key from CONFIG.bindings, the comma included', () => {
  assert.equal(keyCapLabel('KeyU'), 'U');
  assert.equal(keyCapLabel('Comma'), ',');
  assert.equal(keyCapLabel('Digit7'), '7');
  assert.equal(keyCapLabel('ArrowDown'), '↓');
  const { hud } = hudFor(DEF_0001);
  for (const place of ['ground', 'air']) {
    for (const tile of tiles(hud, place)) {
      assert.deepEqual(chips(tile), [keyCapLabel(CONFIG.bindings[tile.entry.action][0])], `${place} ${tile.entry.move}`);
      assert.equal(tile.input.dataset.device, 'keyboard');
    }
  }
  assert.deepEqual(chips(tileOf(hud, 'ground', 'attack5')), [',']);
  assert.deepEqual(chips(tileOf(hud, 'ground', 'extra_attack')), ['J']);
  // Bindings are read, never hard-coded.
  const shown = abilityInput({ device: 'keyboard', action: 'attack1', bindings: { attack1: ['KeyZ'] } });
  assert.deepEqual(shown.parts.map((p) => p.glyph), ['Z']);
});

test('controller: the fighter\'s resolved profile, per place, modifiers and directions included, in its family\'s glyphs', () => {
  const ps = hudFor(DEF_0001, { device: 'gamepad', family: 'playstation' }).hud;
  assert.deepEqual(chips(tileOf(ps, 'ground', 'attack1')), ['□'], 'the Jab: Square');
  assert.deepEqual(chips(tileOf(ps, 'ground', 'attack2')), ['R2', '+', '□'], 'Red: R2 + Square');
  assert.deepEqual(chips(tileOf(ps, 'ground', 'attack3')), ['R2', '+', '○'], 'Maximum Blue: R2 + Circle');
  assert.deepEqual(chips(tileOf(ps, 'ground', 'attack4')), ['L2', '+', '△'], 'Unlimited Void: L2 + Triangle');
  assert.deepEqual(chips(tileOf(ps, 'ground', 'attack5')), ['R2', '+', '△'], 'Hollow Purple: R2 + Triangle');
  assert.deepEqual(chips(tileOf(ps, 'air', 'midair_attack3')), ['R1'], 'Blue: R1 in the air');
  assert.deepEqual(chips(tileOf(ps, 'air', 'extra_attack')), ['L2', '+', '□'], 'the High Kick in the air: its own air input');
  assert.equal(tileOf(ps, 'ground', 'attack2').el.getAttribute('aria-label'), 'Red: R2 + Square. Ready');
  const xbox = hudFor(DEF_0001, { device: 'gamepad', family: 'xbox', model: 'xboxSeries' }).hud;
  assert.deepEqual(chips(tileOf(xbox, 'ground', 'attack2')), ['RT', '+', 'X'], 'the Xbox names');
  assert.deepEqual(chips(tileOf(xbox, 'ground', 'attack4')), ['LT', '+', 'Y']);
  assert.deepEqual(chips(tileOf(xbox, 'ground', 'attack3')), ['RT', '+', 'B']);
  // #0002's Bounce Attack is Down + Square, never a plain Square.
  const two = hudFor(DEF_0002, { device: 'gamepad', family: 'playstation' }).hud;
  assert.deepEqual(chips(tileOf(two, 'air', 'midair_attack2')), ['↓', '+', '□']);
  assert.deepEqual(chips(tileOf(two, 'air', 'midair_attack1')), ['□']);
  assert.match(tileOf(two, 'air', 'midair_attack2').el.getAttribute('aria-label'), /Left stick down \+ Square/);
  const twoX = hudFor(DEF_0002, { device: 'gamepad', family: 'xbox' }).hud;
  assert.deepEqual(chips(tileOf(twoX, 'air', 'midair_attack2')), ['↓', '+', 'X']);
});

test('a saved layout shows as the player set it, a hold included; a change of it redraws the inputs', () => {
  const stored = { '0001': { 'ground:attack1': { button: 'r1', modifier: null, direction: null, activation: 'hold' } } };
  const { hud, fighter, input, settings } = hudFor(DEF_0001, { device: 'gamepad', stored });
  const jab = tileOf(hud, 'ground', 'attack1');
  assert.deepEqual(chips(jab), ['R1', 'Hold']);
  assert.match(jab.el.getAttribute('aria-label'), /R1 \(Hold to activate\)/);
  assert.ok(jab.el.classList.contains('is-long-input'), 'a slightly wider tile, never tiny text');
  stored['0001']['ground:attack1'] = { button: 'south', modifier: 'l1', direction: null, activation: 'press' };
  settings.emit?.('controllerProfiles', { id: '0001' });
  hud.invalidate();
  hud.update(fighter);
  assert.deepEqual(chips(jab), ['L1', '+', '✕']);
  assert.equal(input.lastDevice, 'gamepad');
});

test('the device last used decides: a pad\'s presses show its inputs, a key brings the keycaps back; nothing is rebuilt', () => {
  const { hud, fighter, input } = hudFor(DEF_0001, { device: 'keyboard' });
  const tile = tileOf(hud, 'ground', 'attack2');
  const node = tile.el;
  assert.deepEqual(chips(tile), ['I']);
  input.lastDevice = 'gamepad';
  hud.update(fighter);
  assert.deepEqual(chips(tile), ['R2', '+', '□']);
  input.controllers.player1 = { family: 'xbox', model: 'xboxOne', key: 'pad2' };
  hud.update(fighter);
  assert.deepEqual(chips(tile), ['RT', '+', 'X'], 'the pad\'s own family');
  input.lastDevice = 'keyboard';
  hud.update(fighter);
  assert.deepEqual(chips(tile), ['I']);
  assert.equal(tileOf(hud, 'ground', 'attack2').el, node, 'the same tile');
  // A connected pad alone proves nothing: only InputManager.lastDevice counts.
  const src = readFileSync(new URL('js/ui/ability-hud.js', ROOT), 'utf8');
  assert.match(src, /input\?\.lastDevice === 'gamepad'/);
});

// ---- Cooldowns ---------------------------------------------------------------------

test('a special cooldown shows its sweep and seconds from the combat state, and runs on through the wheel\'s swaps', () => {
  const { hud, fighter, step } = hudFor(DEF_0001);
  step({ attack5: true, attack5Pressed: true });
  hud.update(fighter);
  const tile = tileOf(hud, 'ground', 'attack5');
  assert.equal(tile.el.dataset.state, 'cooling');
  assert.equal(tile.seconds.textContent, '5.0');
  for (let i = 0; i < 30; i++) step({});
  const timers = fighter.combat.abilityCooldowns;
  const left = timers.remaining('attack5');
  air(fighter);
  hud.update(fighter);
  assert.equal(hud.wheel.dataset.place, 'air');
  assert.equal(timers.remaining('attack5'), left, 'a swap never touches the timer');
  assert.equal(tile.seconds.textContent, formatCooldown(left), 'still shown, in the row beneath');
  assert.equal(tile.el.dataset.state, 'cooling');
  air(fighter, false);
  hud.update(fighter);
  assert.equal(tile.seconds.textContent, formatCooldown(left), 'exact on landing');
  assert.ok(Math.abs(Number(tile.el.style.props['--ah-progress']) - timers.progress('attack5')) <= 0.005, 'the sweep is the timer\'s progress');
  // The status helper reads the same store, never a copy.
  const status = moveCooldown(fighter, 'attack5', 'technique');
  assert.deepEqual([status.remaining, status.duration, status.cooling, status.special], [left, 5, true, true]);
});

test('a cooldown over clears the overlay and the seconds, with a brief highlight; the 0.5 s repeat delay is only a faint sweep', () => {
  const { hud, fighter, step } = hudFor(DEF_0001);
  step({ attack4: true, attack4Pressed: true });
  hud.update(fighter);
  const tile = tileOf(hud, 'ground', 'attack4');
  assert.equal(tile.seconds.textContent, '3.0');
  while (fighter.combat.abilityCooldowns.active('attack4')) step({});
  hud.update(fighter);
  assert.equal(tile.el.dataset.state, 'ready');
  assert.equal(tile.seconds.textContent, '');
  assert.equal(tile.el.style.props['--ah-progress'], '1');
  assert.ok(tile.el.classList.contains('is-recovered'), 'a quiet highlight');
  tile.el.dispatch('animationend');
  assert.equal(tile.el.classList.contains('is-recovered'), false);
  // The Jab: only the repeat delay.
  step({ attack1: true, attack1Pressed: true });
  while (fighter.combat.attack) step({});
  hud.update(fighter);
  const jab = tileOf(hud, 'ground', 'attack1');
  assert.equal(jab.el.dataset.state, 'repeat', 'momentarily cooling');
  assert.equal(jab.seconds.textContent, '', 'no number on every punch');
  for (let i = 0; i < Math.round(0.5 / DT); i++) step({});
  hud.update(fighter);
  assert.equal(jab.el.dataset.state, 'ready');
  assert.equal(jab.el.classList.contains('is-recovered'), false, 'no highlight for the repeat delay');
});

test('a move spent for this airtime, or in free fall, looks unavailable, never like a cooldown', () => {
  const { hud, fighter } = hudFor(DEF_0001);
  air(fighter);
  fighter.airAttacks.set('midair_attack2', 1);
  hud.update(fighter);
  const kick = tileOf(hud, 'air', 'midair_attack2');
  assert.equal(kick.el.dataset.state, 'restricted');
  assert.equal(kick.el.dataset.restriction, 'airUses');
  assert.equal(kick.seconds.textContent, '', 'no countdown that does not exist');
  assert.match(kick.el.getAttribute('aria-label'), /Used up until you land/);
  assert.equal(tileOf(hud, 'air', 'midair_attack1').el.dataset.state, 'ready', 'twice per airtime: one left');
  fighter.freeFall = true;
  hud.update(fighter);
  assert.equal(tileOf(hud, 'air', 'midair_attack1').el.dataset.restriction, 'freeFall');
  assert.equal(tileOf(hud, 'ground', 'attack1').el.dataset.state, 'ready', 'the ground row is what comes after landing');
  fighter.freeFall = false;
  fighter.airAttacks.clear();
  air(fighter, false);
  hud.update(fighter);
  assert.equal(kick.el.dataset.state, 'ready');
  // The status says why, apart from any cooldown.
  air(fighter);
  fighter.airAttacks.set('midair_attack3', 1);
  const s = abilityStatus(fighter, abilityGroups(fighter.def).air.find((e) => e.move === 'midair_attack3'), 'air');
  assert.deepEqual([s.restriction, s.cooldown.cooling, s.ready], ['airUses', false, false]);
  assert.match(stylesheet(), /\.ah-tile\[data-state="restricted"\] \{ border-style: dashed;/);
});

test('a fighter swap replaces the whole moveset and its timers; clearing leaves nothing behind', () => {
  const { hud, fighter } = hudFor(DEF_0001);
  fighter.combat.abilityCooldowns.start('attack5', 5);
  hud.update(fighter);
  const other = makeFighter({ character: DEF_0003, sprites: fakeSpritesOf(DEF_0003) }).fighter;
  hud.update(other);
  assert.equal(hud.fighter, other);
  assert.deepEqual(moves(hud, 'ground'), ['attack1', 'attack2', 'attack3', 'attack4', 'extra_attack']);
  assert.deepEqual(moves(hud, 'air'), ['midair_attack1', 'midair_attack2']);
  assert.ok(tiles(hud, 'ground').every((t) => t.el.dataset.state === 'ready'), 'nothing of the old fighter\'s timers');
  assert.equal(hud.root.style.props['--ah-count'], '5');
  hud.clear();
  assert.equal(hud.fighter, null);
  assert.equal(hud.root.hidden, true);
  assert.deepEqual([tiles(hud, 'ground').length, tiles(hud, 'air').length], [0, 0]);
});

// ---- Where it shows ----------------------------------------------------------------

test('the screens show it for the player only: Quick Battle and Practice Ground, never Watch Mode or a result', () => {
  const p1 = makeFighter({ character: DEF_0002, sprites: fakeSpritesOf(DEF_0002) }).fighter;
  const hud = new AbilityHUD(new Element('div'), { input: fakeInput() });
  const screen = { abilityHud: hud, app: { device: { touchUI: false } } };
  const sync = BattleScreen.prototype.syncAbilityHud;
  screen.mode = 'quick-battle';
  screen.battle = { p1, phase: 'fight', hudCooldownsFor: null };
  sync.call(screen);
  assert.equal(hud.root.hidden, false);
  assert.equal(screen.battle.hudCooldownsFor, p1, 'the rings over Player 1 step aside for it');
  screen.battle.phase = 'result';
  sync.call(screen);
  assert.equal(hud.root.hidden, true, 'no HUD over the result menu');
  assert.equal(screen.battle.hudCooldownsFor, null, 'and the rings are back');
  hud.clear();
  screen.mode = 'watch';
  screen.battle = { p1, phase: 'fight', hudCooldownsFor: null };
  sync.call(screen);
  assert.equal(hud.root.hidden, true, 'Watch Mode: nobody plays');
  assert.equal(hud.fighter, null);
  assert.equal(screen.battle.hudCooldownsFor, null);
  // A touch screen keeps its touch controls: the rings stay over the fighter.
  screen.mode = 'quick-battle';
  screen.app.device.touchUI = true;
  sync.call(screen);
  assert.equal(screen.battle.hudCooldownsFor, null);
  // Practice Ground follows its player through a swap.
  const practice = { abilityHud: new AbilityHUD(new Element('div'), { input: fakeInput() }), app: { device: { touchUI: false } } };
  practice.session = { player: p1, hudCooldownsFor: null };
  PracticeGroundScreen.prototype.syncAbilityHud.call(practice);
  assert.equal(practice.abilityHud.fighter, p1);
  assert.equal(practice.session.hudCooldownsFor, p1);
  const swapped = makeFighter({ character: DEF_0001, sprites: fakeSpritesOf(DEF_0001) }).fighter;
  practice.session.player = swapped;
  PracticeGroundScreen.prototype.syncAbilityHud.call(practice);
  assert.equal(practice.abilityHud.fighter, swapped);
  assert.deepEqual(practice.abilityHud.rows.ground.tiles.map((t) => t.entry.move), ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']);
});

test('the stylesheet: bottom-right in the safe area, hidden on touch screens and under pause, menus and rosters; never in the pointer\'s way', () => {
  const css = stylesheet();
  assert.match(css, /\.ability-hud \{[^}]*right: max\(var\(--safe-r\)[^}]*bottom: max\(var\(--safe-b\)[^}]*pointer-events: none;/s);
  assert.match(css, /html\.is-touch \.ability-hud \{ display: none; \}/);
  assert.match(css, /\.is-paused \.ability-hud,\s*\.is-menu-open \.ability-hud,\s*\.is-roster-open \.ability-hud,\s*\.is-cpu-roster-open \.ability-hud \{\s*opacity: 0;\s*visibility: hidden;/);
  assert.match(css, /--ah-tile: min\(clamp\([^)]*\), calc\(44vw \/ var\(--ah-count\)/, 'never wider than the screen allows, however many moves');
  assert.match(css, /grid-template-rows: var\(--ah-art-h\) 1px var\(--ah-input-h\);/, 'art, a 1px divider, the input');
  assert.match(css, /image-rendering: pixelated;/);
  // Nothing in it takes focus.
  const src = readFileSync(new URL('js/ui/ability-hud.js', ROOT), 'utf8');
  assert.doesNotMatch(src, /tabindex|'button'|<button/);
});

test('the arena skips the world-space rings of the fighter the HUD shows, and only that fighter\'s', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, name) => (name in ctx_props ? ctx_props[name] : (...args) => calls.push([name, ...args])), set: () => true });
  const ctx_props = {};
  const make = (def) => {
    const f = makeFighter({ character: def, sprites: fakeSpritesOf(def) }).fighter;
    f.combat.abilityCooldowns.start(Object.keys(def.techniques)[0], 3);
    return f;
  };
  const [shown, other] = [make(DEF_0001), make(DEF_0003)];
  const arena = Object.create(Arena.prototype);
  Object.assign(arena, {
    ctx, view: { pxW: 1000, pxH: 600, scale: 1, dpr: 1 }, hudCooldownsFor: shown,
    markerAnchor: () => [500, 100, 300], energyBarRect: () => ({ x: 0, y: 0, w: 10, h: 2 }),
  });
  const arcs = (f) => {
    calls.length = 0;
    Arena.prototype.drawStatus.call(arena, [f]);
    return calls.filter(([name]) => name === 'arc').length;
  };
  assert.equal(arcs(shown), 0, 'the HUD carries its cooldowns');
  assert.ok(arcs(other) > 0, 'the other fighter keeps its rings');
  arena.hudCooldownsFor = null;
  assert.ok(arcs(shown) > 0, 'without the HUD, its rings are back');
});
