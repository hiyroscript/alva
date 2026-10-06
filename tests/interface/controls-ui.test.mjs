// Run with node --test tests/interface/controls-ui.test.mjs (no dependencies).
// The touch controls on a minimal fake DOM, in both Mobile Controls schemes:
// the combat buttons drawn with frames of the fighter's own art (#0001's
// High Kick, Jab, Red, Maximum Blue, Unlimited Void and Hollow Purple from
// its mobileAbilities; #0002's too), the glyphs that stay (universal Jump, Shield,
// Transform's star, the directions), the neutral fallbacks, their
// character-aware refresh in place, the control codenames behind them
// (extra_attack, shield, jump, attack1 to attack5), Classic Buttons' Left / Right cluster
// (runLeft / runRight), the Joystick scheme's stick (a plain base
// and knob: deadzone, release, crossing the centre, multi-touch), its
// single-tap Left mouvement / Right mouvement Dash buttons (mouvementLeft /
// mouvementRight) and switching
// schemes, the desktop bindings and the page-zoom guard. Layout, paint and
// real gestures still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stylesheet } from '../helpers/stylesheet.mjs';

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
  removeAttribute(name) { this.attrs.delete(name); }
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

const { TouchControls, JOYSTICK, joystickDirection } = await import('../../js/ui/touch-controls.js');
const { ACTION_LABELS, CONFIG } = await import('../../js/config.js');
const { ICONS } = await import('../../js/ui/icons.js');
const { ABILITY_ACTIONS, SPRITE_BUTTONS, abilityPresence, jumpArt, mobileAbility, previewFrame } = await import('../../js/ui/mobile-abilities.js');
const { getCharacter } = await import('../../js/data/characters.js');
const { setLanguage, localizeTree } = await import('../../js/localization/i18n.js');
const { SAMPLE_FIGHTER } = await import('../fighters/fixtures/sample-fighter.mjs');
const { TEST_MOVELESS } = await import('../fighters/fixtures/test-fighters.mjs');
const { LOADOUT_CASES, WITH_EXTRA } = await import('../fighters/fixtures/loadout-fighters.mjs');
const { attackSlots } = await import('../../js/ui/touch-controls.js');

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const CSS = stylesheet();
// #0001's definition (disabled in the roster, but the touch controls present
// any definition they are given), and two test-only fighters built from it:
// one with no moves at all, and one with its own three buttons and no
// Transform (left out of its actions).
const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const MOVELESS = TEST_MOVELESS;
const NUMBERED = ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'];
const NO_TRANSFORM = {
  ...DEF_0001,
  id: 'test-no-transform',
  displayName: 'No Transform',
  actions: { extra_attack: 'extra_attack', attack1: DEF_0001.actions.attack1, attack2: DEF_0001.actions.attack2 },
  mobileAbilities: {
    extra_attack: { label: 'Palm Strike', preview: { animation: 'attack2', frame: 1 } },
    attack1: { label: 'Punch', preview: { animation: 'attack1', frame: 1 }, previews: { air: { animation: 'midair_attack1', frame: 2 } } },
    attack2: { label: 'Kick', preview: { animation: 'attack2', frame: 4 }, previews: { air: { animation: 'midair_attack2', frame: 1 } } },
  },
};

// The file a button's sprite shows (its one decorative <img>), or null.
const spriteOf = (b) => b.querySelector('.tc-sprite-icon');
const file = (url) => url.split('/').pop();
// What a touch button shows: the file of the frame of fighter art it is
// drawn with, or else its glyph's markup.
const look = (b) => (spriteOf(b) ? file(spriteOf(b).getAttribute('src')) : b.innerHTML);
// #0001's and #0002's button art, frame by frame.
const ART_0001 = {
  extra_attack: '0001_extra_attack_3.png', attack1: '0001_attack1_4.png', attack2: '0001_attack2_object_1.png',
  attack3: '0001_attack3_object_1.png', attack4: '0001_attack4_6.png', attack5: '0001_attack5_object_1.png', jump: ICONS.jump,
};
const ART_0002 = {
  extra_attack: '0002_extra_attack_object_3.png', attack1: '0002_attack1_4.png', attack2: '0002_attack2_2.png',
  attack3: '0002_attack3_5.png', jump: ICONS.jump,
};
const sprite = (def, action) => ({
  url: def[def.mobileAbilities[action].preview.collection ?? 'animations'][def.mobileAbilities[action].preview.animation].frames[def.mobileAbilities[action].preview.frame],
  animation: def.mobileAbilities[action].preview.animation,
  frame: def.mobileAbilities[action].preview.frame,
  mirrored: false,
});

function captureWarnings(fn) {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

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
const CODE_LABELS = /\b(T|D|attack1|attack2|A1|A2)\b/;

// ---- Glyphs and art ----------------------------------------------------------

test('the glyphs that stay are inline SVG in currentColor, hidden from assistive technology; the old fighter glyphs are gone', () => {
  for (const name of ['shield', 'transform', 'jump', 'left', 'right', 'tornado', 'ring', 'pip1', 'pip2', 'pip3', 'pip4', 'pip5']) {
    const icon = ICONS[name];
    assert.equal(typeof icon, 'string', name);
    assert.match(icon, /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon( icon--fill)?">/, `${name}: the shared icon helper`);
    assert.match(icon, /<\/svg>$/);
    // No colours of their own: .icon strokes and .icon--fill fills in currentColor.
    assert.doesNotMatch(icon, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(fill|stroke)="(?!none)|style=/i, `${name}: no hard-coded colour`);
    assert.doesNotMatch(icon, /<(image|text|use)\b|href=|\.png/i, `${name}: a vector glyph, no image, text or external reference`);
    assert.doesNotMatch(icon.replace(/<[^>]*>/g, ''), /\S/, `${name}: no text, emoji or characters`);
  }
  // The universal Shield is an outline; Transform's star is filled.
  assert.match(ICONS.shield, /class="icon"/);
  assert.match(ICONS.transform, /class="icon icon--fill"/);
  // The white glyphs of fighters' own moves are gone: their buttons show the
  // fighters' own art now (see below), and nothing else drew them.
  for (const gone of ['shuriken', 'punch', 'kick', 'spin', 'block']) assert.equal(ICONS[gone], undefined, gone);
  const code = readdirSync(new URL('js/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => read(`js/${f}`)).join('\n');
  assert.doesNotMatch(code, /ICONS\.(shuriken|punch|kick|spin)\b|icon: '(shuriken|punch|kick|spin)'/);
});

test('fighter art is one real image element per button, never image markup or an asset path written in the UI', () => {
  for (const file of ['js/ui/touch-controls.js', 'js/ui/mobile-abilities.js', 'js/ui/icons.js']) {
    const code = read(file);
    assert.doesNotMatch(code, /\.png|\.jpg|\.svg['"]|new Image|<img/i, `${file}: no path, no markup`);
  }
  // The <img> is built as an element, its source set as an attribute.
  assert.match(read('js/ui/touch-controls.js'), /el\('img', \{ class: 'tc-sprite-icon', alt: '', 'aria-hidden': 'true'/);
  // In the stylesheet: its own colours (no tint, no currentColor), fitted
  // whole inside the round button, aspect kept, crisp, and never in the way
  // of the button's own pointer handling or size.
  const rule = CSS.match(/(^|\n)\.tc-sprite-icon \{([^}]*)\}/)[2];
  for (const decl of ['position: absolute;', 'inset: 0;', 'width: 70%;', 'height: 70%;', 'margin: auto;', 'object-fit: contain;', 'image-rendering: pixelated;', 'pointer-events: none;']) {
    assert.ok(rule.includes(decl), decl);
  }
  assert.doesNotMatch(rule, /currentColor|brightness|invert|grayscale|sepia|hue-rotate|saturate|mask|color:/, 'never recoloured');
  assert.match(CSS, /\.tc-sprite-icon\.is-mirrored \{ transform: scaleX\(-1\); \}/);
  // The buttons keep their own size: nothing sized for the art.
  const btn = CSS.match(/(^|\n)\.tc-btn \{([^}]*)\}/)[2];
  assert.match(btn, /width: var\(--tc\);/);
  assert.match(btn, /height: var\(--tc\);/);
  assert.match(btn, /position: relative;/, 'the image is placed inside the button itself');
});

// ---- #0001's mobile abilities -----------------------------------------------

test('#0001 authors its touch buttons as small, declarative UI data: a name and a frame of its own art each', () => {
  assert.deepEqual(DEF_0001.mobileAbilities, {
    extra_attack: { label: 'High Kick', preview: { animation: 'extra_attack', frame: 2 } },
    attack1: { label: 'Jab', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: {
      label: 'Red',
      preview: { collection: 'projectileAnimations', animation: 'attack2_object', frame: 0 },
      previews: { air: { animation: 'midair_attack2', frame: 3 } },
    },
    attack3: {
      label: 'Maximum Blue',
      preview: { collection: 'projectileAnimations', animation: 'attack3_object', frame: 0 },
      previews: { air: { animation: 'midair_attack3', frame: 1 } },
    },
    attack4: { label: 'Unlimited Void', preview: { animation: 'attack4_cast', frame: 5 } },
    attack5: { label: 'Hollow Purple', preview: { collection: 'projectileAnimations', animation: 'attack5_object', frame: 0 } },
  });
  // Each names a clip it has (a projectile's own, for the orbs) and a
  // frame of that clip, counted from 0 (as visual.portrait counts): never a
  // path of its own.
  for (const [action, own] of Object.entries(DEF_0001.mobileAbilities)) {
    const clip = DEF_0001[own.preview.collection ?? 'animations'][own.preview.animation];
    assert.ok(clip, `${action}: a clip of #0001's`);
    assert.ok(Number.isInteger(own.preview.frame) && own.preview.frame >= 0 && own.preview.frame < clip.frames.length, `${action}: one of its frames`);
    assert.equal(file(clip.frames[own.preview.frame]), ART_0001[action], action);
    assert.ok(Object.keys(own.preview).every((k) => ['collection', 'animation', 'frame'].includes(k)), `${action}: no path written twice`);
  }
  assert.equal(DEF_0001.visual.portrait.frame, 0, 'frames are counted from 0, as the portrait\'s');
  // The frame that reads as the move, by its own timing: the High Kick's
  // and the Jab's live frames, the orb each projectile button throws (the
  // projectile's own art), and Unlimited Void's hand sign, the last pose of
  // its cast.
  const at = (atk, time) => Math.round(time * DEF_0001.animations[atk.animation].fps);
  const live = (id) => {
    const atk = DEF_0001.attacks[id];
    const frame = DEF_0001.mobileAbilities[id].preview.frame;
    return frame >= at(atk, atk.startup) && frame < at(atk, atk.startup + atk.active);
  };
  assert.ok(live('extra_attack'), 'the kick, live');
  assert.ok(live('attack1'), 'the Jab, live');
  for (const id of ['attack2', 'attack3']) {
    assert.equal(DEF_0001.mobileAbilities[id].preview.animation, DEF_0001.attacks[id].projectile.id, `${id}: the orb it throws`);
  }
  assert.equal(DEF_0001.mobileAbilities.attack5.preview.animation, DEF_0001.techniques.attack5.projectile.id, 'the sphere Hollow Purple releases');
  const voidCast = DEF_0001.animations[DEF_0001.techniques.attack4.castAnimation];
  assert.equal(DEF_0001.mobileAbilities.attack4.preview.animation, DEF_0001.techniques.attack4.castAnimation);
  assert.equal(DEF_0001.mobileAbilities.attack4.preview.frame, voidCast.frames.length - 1, 'the hand sign that ends the cast');
  // The Shield is universal, not #0001's; no Transform of its own yet, so
  // its Transform button stays reserved.
  assert.equal(DEF_0001.mobileAbilities.shield, undefined);
  assert.equal(DEF_0001.mobileAbilities.transform, undefined);
  assert.deepEqual([...ABILITY_ACTIONS], ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  assert.deepEqual([...SPRITE_BUTTONS], ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'], 'Transform and Jump keep their glyphs');
  // UI only: no combat module reads it, and the controls never guess art
  // from attack data or file names.
  const code = (file) => read(file).replace(/\/\/.*$/gm, '');
  // (The touch controls that present it are UI: js/ui/touch-controls.js.)
  for (const file of readdirSync(new URL('js/game/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(code(`js/game/${file}`), /mobileAbilities|mobile-abilities|preview/, `${file} never reads mobileAbilities`);
  }
  for (const file of ['js/ui/touch-controls.js', 'js/ui/mobile-abilities.js']) {
    assert.doesNotMatch(code(file), /\.(summons|techniques|projectiles)\b|'000\d'|#000\d|displayName/, `${file}: no inference, no fighter special case`);
  }
  assert.doesNotMatch(code('js/ui/touch-controls.js'), /\.animations?\b|\.preview\b/, 'the controls draw what they are given');
  // Whether a button exists at all comes from the fighter's `actions` (the
  // data combat and the CPU go by), read in one place, abilityPresence; the
  // frame a button shows from its own clip, read in one place, previewFrame:
  // never its name.
  const abilities = code('js/ui/mobile-abilities.js');
  const presence = abilities.match(/export function abilityPresence\([^]*?\n\}\n/)[0];
  const preview = abilities.match(/export function previewFrame\([^]*?\n\}\n/)[0];
  assert.match(presence, /def\?\.actions/);
  assert.match(abilities, /export function abilityMove/, 'loadout resolution is centralized alongside presence');
  assert.match(preview, /def\[collection\]/);
  assert.doesNotMatch(abilities.replace(preview, ''), /\.animations\b/, 'animations: read in previewFrame only');
  assert.doesNotMatch(code('js/ui/touch-controls.js'), /\bdef\??\.actions\b/);
});

test('mobileAbility gives each button its name, its frame of fighter art and a neutral glyph to fall back on, never a crash', () => {
  for (const [action, label, glyph] of [
    ['extra_attack', 'High Kick', ICONS.ring], ['attack1', 'Jab', ICONS.pip1], ['attack2', 'Red', ICONS.pip2],
    ['attack3', 'Maximum Blue', ICONS.pip3], ['attack4', 'Unlimited Void', ICONS.pip4], ['attack5', 'Hollow Purple', ICONS.pip5],
  ]) {
    assert.deepEqual(mobileAbility(DEF_0001, action), { label, sprite: sprite(DEF_0001, action), icon: glyph, pending: false }, action);
  }
  assert.equal(mobileAbility(NO_TRANSFORM, 'attack5'), null, 'no button for an attack a fighter leaves out');
  assert.deepEqual(mobileAbility(DEF_0001, 'transform'), { label: 'Transform', sprite: null, icon: ICONS.transform, pending: true });
  assert.deepEqual(jumpArt(DEF_0001), { sprite: null, icon: ICONS.jump });
  for (const def of [null, undefined, {}, { mobileAbilities: {} }]) {
    assert.deepEqual(mobileAbility(def, 'extra_attack'), { label: ACTION_LABELS.extra_attack, sprite: null, icon: ICONS.ring, pending: false });
    assert.deepEqual(mobileAbility(def, 'attack1'), { label: ACTION_LABELS.attack1, sprite: null, icon: ICONS.pip1, pending: false });
    assert.deepEqual(mobileAbility(def, 'attack2'), { label: ACTION_LABELS.attack2, sprite: null, icon: ICONS.pip2, pending: false });
    assert.deepEqual(mobileAbility(def, 'transform'), { label: 'Transform', sprite: null, icon: ICONS.transform, pending: true }, 'reserved until a fighter presents one');
    assert.deepEqual(jumpArt(def), { sprite: null, icon: ICONS.jump }, 'the jump arrow');
  }
  // Half-authored: whatever is missing or unknown falls back on its own. A
  // combat button never takes a glyph from the data (only art), and a
  // fighter's own Transform may have its own glyph.
  const partial = {
    id: 'partial',
    animations: { idle: { frames: ['./a.png', './b.png'] } },
    mobileAbilities: {
      extra_attack: { label: 'Kunai' }, attack1: { icon: 'up', label: 'Jab' }, transform: { label: 'Awaken' },
      attack2: { label: 'Sweep', preview: { animation: 'idle', frame: 1 } },
    },
  };
  assert.deepEqual(mobileAbility(partial, 'extra_attack'), { label: 'Kunai', sprite: null, icon: ICONS.ring, pending: false });
  assert.deepEqual(mobileAbility(partial, 'attack1'), { label: 'Jab', sprite: null, icon: ICONS.pip1, pending: false });
  assert.deepEqual(mobileAbility(partial, 'attack2'), {
    label: 'Sweep', sprite: { url: './b.png', animation: 'idle', frame: 1, mirrored: false }, icon: ICONS.pip2, pending: false,
  });
  assert.deepEqual(mobileAbility(partial, 'transform'), { label: 'Awaken', sprite: null, icon: ICONS.transform, pending: false }, 'its own Transform: no longer reserved');
  assert.equal(mobileAbility({ mobileAbilities: { transform: { label: 'Awaken', icon: 'up' } } }, 'transform').icon, ICONS.up, 'its own Transform glyph');
  for (const n of [3, 4, 5]) {
    assert.deepEqual(mobileAbility(null, `attack${n}`), { label: `Attack ${n}`, sprite: null, icon: ICONS[`pip${n}`], pending: false });
  }
  // A clip drawn facing left is shown turned to face right.
  const left = { id: 'left', sourceFacing: -1, animations: { attack1: { frames: ['./j.png'] } }, mobileAbilities: { attack1: { preview: { animation: 'attack1', frame: 0 } } } };
  assert.equal(previewFrame(left, 'attack1').mirrored, true);
  assert.equal(previewFrame({ ...left, animations: { attack1: { frames: ['./j.png'], sourceFacing: 1 } } }, 'attack1').mirrored, false);
  // The neutral glyphs tell the buttons apart.
  const glyphs = ['ring', 'pip1', 'pip2', 'pip3', 'pip4', 'pip5'].map((n) => ICONS[n]);
  assert.equal(new Set(glyphs).size, 6);
});

test('a preview naming no frame is shown as its neutral glyph, reported once, its name kept: never a crash', () => {
  const broken = {
    ...DEF_0001,
    id: 'test-broken-preview',
    mobileAbilities: {
      ...DEF_0001.mobileAbilities,
      attack1: { label: 'Jab', preview: { animation: 'attack1', frame: 9 } },
      attack2: { label: 'Red', preview: { animation: 'nope', frame: 0 } },
      attack3: { label: 'Maximum Blue', preview: { animation: 'attack3', frame: '2' } },
      jump: { preview: { animation: 'jump', frame: -1 } },
    },
  };
  let tc;
  let calls;
  const warnings = captureWarnings(() => {
    ({ tc, calls } = touchControls(broken));
    tc.setCharacter(broken);
  });
  assert.equal(warnings.length, 3, warnings.join('\n'));
  assert.ok(warnings.every((w) => /test-broken-preview's (attack1|attack2|attack3|jump) button preview names no frame/.test(w)));
  const b = (a) => tc.buttons.get(a);
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'jump'].map((a) => [look(b(a)), b(a).getAttribute('aria-label')]), [
    [ICONS.pip1, 'Jab'], [ICONS.pip2, 'Red'], [ICONS.pip3, 'Maximum Blue'], [ICONS.jump, 'Jump'],
  ]);
  assert.equal(look(b('extra_attack')), ART_0001.extra_attack, 'the rest still show their art');
  // Every one still works, as its own control.
  for (const [i, action] of ['attack1', 'attack2', 'attack3', 'jump'].entries()) {
    press(b(action), i + 1);
    lift(b(action), i + 1);
  }
  assert.deepEqual(calls, ['attack1', 'attack2', 'attack3', 'jump'].flatMap((a) => [[a, true], [a, false]]));
});

test('a sprite whose file fails to load falls back to its glyph, keeping its name and input, and is not tried again', () => {
  const { tc, calls } = touchControls(DEF_0001);
  const b = tc.buttons.get('attack3');
  const img = spriteOf(b);
  assert.equal(look(b), ART_0001.attack3);
  let warnings = captureWarnings(() => img.dispatch('error', {}));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /0001_attack3_object_1\.png" failed to load/);
  assert.equal(spriteOf(b), null, 'the broken image is gone');
  assert.equal(b.innerHTML, ICONS.pip3, 'its neutral glyph instead');
  assert.equal(b.getAttribute('aria-label'), 'Maximum Blue', 'its name kept');
  assert.equal(b.getAttribute('data-action'), 'attack3');
  assert.equal(b.hidden, false);
  press(b, 4);
  lift(b, 4);
  assert.deepEqual(calls, [['attack3', true], ['attack3', false]], 'and its input');
  // The same fighter again: the glyph stays (no broken image comes back);
  // other fighters' art still shows; an error from an old source after its
  // image moved on is not this one's.
  warnings = captureWarnings(() => tc.setCharacter(DEF_0001));
  assert.deepEqual(warnings, [], 'reported once');
  assert.equal(b.innerHTML, ICONS.pip3);
  assert.equal(look(tc.buttons.get('attack1')), ART_0001.attack1);
  tc.setCharacter(DEF_0002);
  assert.equal(look(b), ART_0002.attack3);
  const fresh = spriteOf(b);
  fresh.complete = false;
  captureWarnings(() => fresh.dispatch('error', {}));
  assert.equal(look(b), ART_0002.attack3, 'still loading its new source: kept');
});

// ---- Touch buttons: a fighter that is not #0001 ----------------------------------

test('another fighter presents its own buttons: its Transform is a real button, a button it leaves out is neutral', () => {
  for (const scheme of ['joystick', 'classic']) {
    const { tc, calls } = touchControls(SAMPLE_FIGHTER, { scheme });
    const b = (a) => tc.buttons.get(a);
    // Its own art (frames of its own clips), its own Transform glyph, the
    // neutral pips where it presents nothing, and the jump arrow: it has no
    // jump frame of its own.
    assert.deepEqual(['extra_attack', 'transform', 'attack1', 'attack2', 'jump'].map((a) => [a, b(a).getAttribute('aria-label'), look(b(a))]), [
      ['extra_attack', 'Palm Strike', '0001_attack1_4.png'],
      ['transform', 'Awakening', ICONS.up],
      ['attack1', 'Jab', '0001_midair_attack3_2.png'],
      ['attack2', ACTION_LABELS.attack2, ICONS.pip2],
      ['jump', 'Jump', ICONS.jump],
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
    assert.equal(b('extra_attack').getAttribute('aria-label'), 'High Kick');
    assert.deepEqual([look(b('extra_attack')), look(b('jump'))], [ART_0001.extra_attack, ART_0001.jump], 'and #0001\'s art');
  }
});

// ---- Touch buttons: a fighter with no moves ----------------------------------------

test('abilityPresence reads the fighter\'s actions: implemented, reserved (null) or absent (left out)', () => {
  // #0001: attack1 to attack5 are buttons of its own; Transform is reserved.
  assert.deepEqual(ABILITY_ACTIONS.map((a) => abilityPresence(DEF_0001, a)), [
    'implemented', 'reserved', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented',
  ]);
  // A fighter with no moves: every one is left out of its (empty) actions.
  assert.deepEqual(MOVELESS.actions, {});
  assert.deepEqual(ABILITY_ACTIONS.map((a) => abilityPresence(MOVELESS, a)), ABILITY_ACTIONS.map(() => 'absent'));
  assert.deepEqual(ABILITY_ACTIONS.map((a) => abilityPresence(SAMPLE_FIGHTER, a)), [
    'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'absent', 'absent',
  ]);
  // Nothing to go by: every button stays, Transform reserved.
  for (const def of [null, undefined, {}, { mobileAbilities: {} }]) {
    assert.deepEqual(ABILITY_ACTIONS.map((a) => abilityPresence(def, a)), [
      'implemented', 'reserved', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented',
    ]);
  }
  // A move mapped to null is reserved, whichever button it is.
  assert.equal(abilityPresence({ actions: { extra_attack: null } }, 'extra_attack'), 'reserved');
  assert.equal(abilityPresence({ actions: { extra_attack: null } }, 'attack1'), 'absent');
  // An absent ability has nothing to present, not even a neutral glyph or a
  // reserved star.
  for (const action of ABILITY_ACTIONS) assert.equal(mobileAbility(MOVELESS, action), null, action);
});

test('a fighter with no moves has no ability buttons: all seven hidden, unnamed, blank, never dashed; Shield and Jump stay', () => {
  for (const scheme of ['joystick', 'classic']) {
    const { tc } = touchControls(MOVELESS, { scheme });
    const b = (a) => tc.buttons.get(a);
    for (const action of ABILITY_ACTIONS) {
      const btn = b(action);
      assert.equal(btn.hidden, true, `${scheme} ${action}: hidden`);
      assert.equal(btn.getAttribute('aria-label'), null, `${action}: no accessible name`);
      assert.equal(btn.getAttribute('data-i18n-aria-label'), null, `${action}: nor a mark that would name it again`);
      assert.equal(btn.innerHTML, '', `${action}: no glyph, neutral or not`);
      assert.equal(btn.classList.contains('is-pending'), false, `${action}: not a dashed "coming soon" button`);
      assert.equal(btn.getAttribute('tabindex'), '-1', `${action}: never in the Tab order`);
      // Still the same element, codename unchanged.
      assert.equal(btn.getAttribute('data-action'), action);
      assert.ok(btn.classList.contains(`tc-${action}`));
    }
    assert.equal(tc.actions.children[0], b('extra_attack'));
    // The universal controls stay, named, whatever the fighter has.
    assert.deepEqual(['shield', 'jump'].map((a) => [a, b(a).hidden ?? false, b(a).getAttribute('aria-label')]), [
      ['shield', false, 'Shield'],
      ['jump', false, 'Jump'],
    ], scheme);
  }
  // The rule that hides them is in the stylesheet: their places kept, nothing drawn or hit.
  assert.match(CSS, /\.tc-btn\[hidden\] \{ visibility: hidden; \}/);
});

test('the hidden ability buttons dispatch nothing: no press, no assistive click', async () => {
  const { tc, calls } = touchControls(MOVELESS);
  for (const [i, action] of ABILITY_ACTIONS.entries()) {
    const btn = tc.buttons.get(action);
    press(btn, i + 1);
    lift(btn, i + 1);
    tc.root.dispatch('click', { target: { closest: () => btn }, detail: 0 });
    assert.equal(btn.classList.contains('is-pressed'), false, action);
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(calls, []);
  // Jump still works as ever.
  press(tc.buttons.get('jump'), 9);
  lift(tc.buttons.get('jump'), 9);
  assert.deepEqual(calls, [['jump', true], ['jump', false]]);
});

test('switching #0001 -> no moves -> #0001 hides and restores the very same buttons; a held one is let go', () => {
  for (const scheme of ['joystick', 'classic']) {
    const { tc, calls } = touchControls(DEF_0001, { scheme });
    const els = ABILITY_ACTIONS.map((a) => tc.buttons.get(a));
    const looks = () => els.map((btn) => [btn.hidden ?? false, btn.getAttribute('aria-label'), look(btn), btn.classList.contains('is-pending')]);
    const own = [
      [false, 'High Kick', ART_0001.extra_attack, false],
      [false, 'Transform', ICONS.transform, true],
      [false, 'Jab', ART_0001.attack1, false],
      [false, 'Red', ART_0001.attack2, false],
      [false, 'Maximum Blue', ART_0001.attack3, false],
      [false, 'Unlimited Void', ART_0001.attack4, false],
      [false, 'Hollow Purple', ART_0001.attack5, false],
    ];
    const images = els.map(spriteOf);
    assert.deepEqual(looks(), own);
    press(els[0], 7);
    press(els[2], 8);
    assert.deepEqual(calls, [['extra_attack', true], ['attack1', true]]);
    tc.setCharacter(MOVELESS);
    assert.deepEqual(calls.slice(2).sort(), [['attack1', false], ['extra_attack', false]], 'both holds end as they go');
    assert.deepEqual(looks(), ABILITY_ACTIONS.map(() => [true, null, '', false]));
    tc.setCharacter(DEF_0001);
    assert.deepEqual(ABILITY_ACTIONS.map((a) => tc.buttons.get(a)), els, 'the same elements');
    assert.deepEqual(looks(), own);
    assert.deepEqual(els.map(spriteOf), images, 'and the same images in them');
    assert.equal(els[0].getAttribute('data-i18n-aria-label'), 'ability.0001.extra_attack');
    press(els[3], 9);
    assert.deepEqual(calls.at(-1), ['attack2', true], 'and they work again');
    lift(els[3], 9);
    tc.setCharacter(MOVELESS);
    assert.ok(els.every((btn) => btn.hidden), `${scheme}: hidden again`);
    assert.ok(els.every((btn) => btn.getAttribute('aria-label') === null), 'no stale High Kick, Jab, Red, Maximum Blue, Unlimited Void or Hollow Purple');
  }
});

// ---- Touch buttons: its own three and no Transform ---------------------------------

test('a fighter that leaves Transform out presents its own three buttons, and its Transform has none', () => {
  assert.deepEqual(ABILITY_ACTIONS.map((a) => abilityPresence(NO_TRANSFORM, a)), [
    'implemented', 'absent', 'implemented', 'implemented', 'absent', 'absent', 'absent',
  ]);
  assert.equal(mobileAbility(NO_TRANSFORM, 'transform'), null);
  for (const scheme of ['joystick', 'classic']) {
    const { tc, calls } = touchControls(NO_TRANSFORM, { scheme });
    const b = (a) => tc.buttons.get(a);
    assert.deepEqual(ABILITY_ACTIONS.map((a) => [a, b(a).hidden ?? false, b(a).getAttribute('aria-label'), look(b(a))]), [
      ['extra_attack', false, 'Palm Strike', '0001_attack2_2.png'],
      ['transform', true, null, ''],
      ['attack1', false, 'Punch', '0001_attack1_2.png'],
      ['attack2', false, 'Kick', '0001_attack2_5.png'],
      ['attack3', true, null, ''],
      ['attack4', true, null, ''],
      ['attack5', true, null, ''],
    ], scheme);
    assert.deepEqual([...tc.buttons].filter(([, el]) => el.classList.contains('is-pending')), [], `${scheme}: nothing dashed`);
    // A name only the fighter's data has: shown as authored, marked plain
    // (no key to translate it by).
    assert.equal(b('extra_attack').getAttribute('data-i18n-aria-label'), '');
    // The buttons send the universal codenames; the hidden one sends nothing.
    for (const [i, action] of ABILITY_ACTIONS.entries()) {
      press(b(action), i + 1);
      lift(b(action), i + 1);
    }
    assert.deepEqual(calls, [['extra_attack', true], ['extra_attack', false], ['attack1', true], ['attack1', false], ['attack2', true], ['attack2', false]]);
    // #0001 -> this one -> no moves -> this one: the same elements, each fighter's own look.
    tc.setCharacter(DEF_0001);
    assert.deepEqual([b('extra_attack').getAttribute('aria-label'), b('transform').hidden ?? false], ['High Kick', false]);
    tc.setCharacter(NO_TRANSFORM);
    assert.equal(look(b('extra_attack')), '0001_attack2_2.png');
    assert.equal(b('transform').hidden, true);
    tc.setCharacter(MOVELESS);
    assert.ok(ABILITY_ACTIONS.every((a) => b(a).hidden));
    tc.setCharacter(NO_TRANSFORM);
    assert.deepEqual(ABILITY_ACTIONS.map((a) => b(a).hidden ?? false), [false, true, false, false, true, true, true], scheme);
    assert.equal(b('attack2').getAttribute('aria-label'), 'Kick');
  }
  // In French: names the translations do not know stay as authored.
  const { tc } = touchControls(NO_TRANSFORM);
  setLanguage('fr');
  try {
    localizeTree(tc.root);
    assert.deepEqual(['extra_attack', 'attack1', 'attack2'].map((a) => tc.buttons.get(a).getAttribute('aria-label')), ['Palm Strike', 'Punch', 'Kick']);
    assert.equal(tc.buttons.get('transform').getAttribute('aria-label'), null);
  } finally {
    setLanguage('en');
  }
});

test('a language change never names the hidden buttons again', () => {
  const { tc } = touchControls(MOVELESS);
  setLanguage('fr');
  try {
    localizeTree(tc.root);
    for (const action of ABILITY_ACTIONS) assert.equal(tc.buttons.get(action).getAttribute('aria-label'), null, action);
    tc.setCharacter(DEF_0001);
    assert.equal(tc.buttons.get('extra_attack').getAttribute('aria-label'), 'Coup de pied haut');
    assert.equal(tc.buttons.get('attack1').getAttribute('aria-label'), 'Direct');
  } finally {
    setLanguage('en');
  }
});

test('the touch layout editor keeps absent buttons on show, neutral, so every fighter\'s layout can place them', () => {
  const tc = new TouchControls(new Element('div'), { setTouch() {}, queueTouchMouvement() {} }, { scheme: 'joystick', showAbsent: true });
  tc.setCharacter(MOVELESS);
  const b = (a) => tc.buttons.get(a);
  assert.deepEqual(ABILITY_ACTIONS.map((a) => [a, b(a).hidden, b(a).getAttribute('aria-label'), b(a).innerHTML]), [
    ['extra_attack', false, ACTION_LABELS.extra_attack, ICONS.ring],
    ['transform', false, 'Transform', ICONS.transform],
    ['attack1', false, ACTION_LABELS.attack1, ICONS.pip1],
    ['attack2', false, ACTION_LABELS.attack2, ICONS.pip2],
    ['attack3', false, ACTION_LABELS.attack3, ICONS.pip3],
    ['attack4', false, ACTION_LABELS.attack4, ICONS.pip4],
    ['attack5', false, ACTION_LABELS.attack5, ICONS.pip5],
  ]);
  // Every numbered attack button in its own slot, so each can be placed.
  assert.deepEqual(NUMBERED.map((a) => b(a).getAttribute('data-slot')), ['1', '2', '3', '4', '5']);
  assert.match(read('js/ui/touch-layout-editor.js'), /this\.touch = new TouchControls\(.*\{ showAbsent: true \}\);/);
  // With #0001 picked: its own art on every move it has (all five
  // numbered attacks and the extra attack), its Transform reserved.
  tc.setCharacter(DEF_0001);
  const own = ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump'];
  assert.deepEqual(own.map((a) => look(b(a))), own.map((a) => ART_0001[a]));
  assert.deepEqual([look(b('transform')), b('transform').classList.contains('is-pending')], [ICONS.transform, true]);
  // #0002 lacks Attack 4 and 5: both neutral and placeable.
  tc.setCharacter(DEF_0002);
  assert.deepEqual(['attack4', 'attack5'].map((a) => [b(a).hidden, look(b(a))]), [[false, ICONS.pip4], [false, ICONS.pip5]]);
  assert.equal(look(b('attack3')), ART_0002.attack3);
});

test('#0002\'s buttons show its own art: the Whirlwind, the One-Two, the Rapid Kicks, the Spin and its jump; it has no Attack 4 or 5', () => {
  for (const scheme of ['joystick', 'classic']) {
    const { tc, calls } = touchControls(DEF_0002, { scheme });
    const b = (a) => tc.buttons.get(a);
    for (const [action, label] of [['extra_attack', 'Whirlwind'], ['attack1', 'One-Two'], ['attack2', 'Rapid Kicks'], ['attack3', 'Spin Attack']]) {
      assertArt(b(action), DEF_0002, action, label);
      assert.equal(look(b(action)), ART_0002[action], `${scheme} ${action}`);
    }
    assert.deepEqual(['attack4', 'attack5'].map((a) => [b(a).hidden, b(a).getAttribute('aria-label'), b(a).children.length]), [[true, null, 0], [true, null, 0]], 'hidden, nothing in them');
    assert.deepEqual(NUMBERED.map((a) => b(a).getAttribute('data-slot')), ['1', '2', '3', null, null]);
    assert.deepEqual([look(b('shield')), look(b('transform')), b('transform').classList.contains('is-pending')], [ICONS.shield, ICONS.transform, true]);
    for (const [i, a] of ['extra_attack', 'attack1', 'attack2', 'attack3'].entries()) {
      press(b(a), i + 1);
      lift(b(a), i + 1);
    }
    assert.deepEqual(calls, ['extra_attack', 'attack1', 'attack2', 'attack3'].flatMap((a) => [[a, true], [a, false]]));
  }
});

test('the movement controls, Shield and Transform look exactly as before, whatever the fighter, in both schemes', () => {
  const glyphs = (tc) => ({
    pad: [...tc.padButtons.values()].map((b) => [b.getAttribute('data-action'), b.innerHTML, b.getAttribute('aria-label')]),
    dash: [...tc.mouvementButtons.values()].map((b) => [b.innerHTML, b.getAttribute('aria-label')]),
    stick: [tc.stick.children.length, tc.knob.children.length],
    shield: [tc.actionButtons.get('shield').innerHTML, tc.actionButtons.get('shield').getAttribute('aria-label')],
    transform: [tc.actionButtons.get('transform').innerHTML, tc.actionButtons.get('transform').classList.contains('is-pending')],
  });
  const expected = {
    pad: [['runLeft', ICONS.left, 'Move left'], ['runRight', ICONS.right, 'Move right']],
    dash: [[ICONS.left, 'Left mouvement'], [ICONS.right, 'Right mouvement']],
    stick: [1, 0],
    shield: [ICONS.shield, 'Shield'],
    transform: [ICONS.transform, true],
  };
  for (const scheme of ['joystick', 'classic']) {
    const { tc } = touchControls(null, { scheme });
    assert.deepEqual(glyphs(tc), expected, `${scheme}: neutral`);
    for (const def of [DEF_0001, DEF_0002, SAMPLE_FIGHTER, MOVELESS, DEF_0001]) {
      tc.setCharacter(def);
      const now = glyphs(tc);
      if (def === SAMPLE_FIGHTER) {
        // A fighter with a Transform of its own presents it (its own glyph),
        // as ever.
        assert.deepEqual(now.transform, [ICONS.up, false]);
        now.transform = expected.transform;
      } else if (def === MOVELESS) {
        // One with no Transform at all hides it, as ever.
        assert.deepEqual([now.transform, tc.actionButtons.get('transform').hidden], [['', false], true]);
        now.transform = expected.transform;
      }
      assert.deepEqual(now, expected, `${scheme}: ${def.id}`);
      for (const node of [...tc.padButtons.values(), ...tc.mouvementButtons.values(), tc.stick, tc.actionButtons.get('shield'), tc.actionButtons.get('transform')]) {
        assert.equal(node.querySelector('.tc-sprite-icon'), null, `${scheme}: ${def.id}: no fighter art on ${node.getAttribute('data-action') ?? node.className}`);
      }
    }
  }
});

test('every button\'s accessible name, in English and French, for both fighters: on the button, never on its art', () => {
  const NAMES = {
    '0001': {
      en: ['High Kick', 'Transform', 'Shield', 'Jab', 'Red', 'Maximum Blue', 'Unlimited Void', 'Hollow Purple', 'Jump'],
      fr: ['Coup de pied haut', 'Transformation', 'Bouclier', 'Direct', 'Rouge', 'Bleu maximal', 'Vide infini', 'Violet creux', 'Saut'],
    },
    '0002': {
      en: ['Whirlwind', 'Transform', 'Shield', 'One-Two', 'Rapid Kicks', 'Spin Attack', null, null, 'Jump'],
      fr: ['Tourbillon', 'Transformation', 'Bouclier', 'Un-deux', 'Coups de pied rapides', 'Attaque tournoyante', null, null, 'Saut'],
    },
  };
  for (const def of [DEF_0001, DEF_0002]) {
    const { tc } = touchControls(def);
    const names = () => tc.actions.children.map((b) => b.getAttribute('aria-label'));
    assert.deepEqual(names(), NAMES[def.id].en, `#${def.id} in English`);
    setLanguage('fr');
    try {
      localizeTree(tc.root);
      assert.deepEqual(names(), NAMES[def.id].fr, `#${def.id} in French`);
      // A fighter change in French names them in French at once.
      tc.setCharacter(def.id === '0001' ? DEF_0002 : DEF_0001);
      tc.setCharacter(def);
      assert.deepEqual(names(), NAMES[def.id].fr);
    } finally {
      setLanguage('en');
      localizeTree(tc.root);
    }
    assert.deepEqual(names(), NAMES[def.id].en);
    for (const b of tc.actions.children) {
      const img = spriteOf(b);
      if (img) assert.deepEqual([img.getAttribute('alt'), img.getAttribute('aria-hidden'), img.getAttribute('aria-label')], ['', 'true', null]);
    }
  }
});

test('multi-touch on the art buttons: a held direction, Attack 3, Jump, Shield and Kick at once, each its own input', () => {
  for (const scheme of ['joystick', 'classic']) {
    const { tc, calls } = touchControls(DEF_0001, { scheme });
    tc.assign(1, 'runRight');
    press(tc.buttons.get('attack3'), 2);
    press(tc.buttons.get('jump'), 3);
    press(tc.buttons.get('shield'), 4);
    press(tc.buttons.get('attack2'), 5);
    assert.deepEqual(calls, [['runRight', true], ['attack3', true], ['jump', true], ['shield', true], ['attack2', true]], scheme);
    for (const a of ['attack3', 'jump', 'shield', 'attack2']) assert.ok(tc.buttons.get(a).classList.contains('is-pressed'), a);
    lift(tc.buttons.get('jump'), 3);
    assert.deepEqual(calls.at(-1), ['jump', false]);
    assert.ok(tc.buttons.get('attack3').classList.contains('is-pressed'), 'the others still held');
    // A fighter change mid-hold keeps the hold of a button it still has.
    tc.setCharacter(DEF_0002);
    assert.ok(tc.buttons.get('attack3').classList.contains('is-pressed'));
    assert.equal(look(tc.buttons.get('attack3')), ART_0002.attack3);
    tc.releaseAll();
    assert.deepEqual(calls.slice(-4).map(([a, held]) => [a, held]).sort(), [['attack2', false], ['attack3', false], ['runRight', false], ['shield', false]]);
  }
});

// ---- Touch buttons: #0001 -----------------------------------------------------

// Exactly one child: the decorative image of `def`'s frame for `action`, in
// its own colours (no glyph, no text beside it), the button named and sending
// its control.
function assertArt(b, def, action, label) {
  assert.equal(b.children.length, 1, `${action}: one child`);
  const img = spriteOf(b);
  assert.equal(img, b.children[0]);
  assert.equal(img.tagName, 'IMG');
  assert.equal(img.getAttribute('src'), def[def.mobileAbilities[action].preview.collection ?? 'animations'][def.mobileAbilities[action].preview.animation].frames[def.mobileAbilities[action].preview.frame]);
  assert.equal(img.getAttribute('alt'), '', 'decorative');
  assert.equal(img.getAttribute('aria-hidden'), 'true');
  assert.equal(img.getAttribute('draggable'), 'false');
  assert.equal(img.getAttribute('aria-label'), null, 'the name is the button\'s');
  assert.equal(img.classList.contains('icon'), false, 'never a currentColor glyph');
  assert.ok(b.classList.contains('has-sprite'));
  assert.equal(b.innerHTML, '', 'no glyph beside it');
  assert.doesNotMatch(visibleText(b), /\S/, 'no text');
  assert.equal(b.getAttribute('aria-label'), label);
  assert.equal(b.getAttribute('data-action'), action);
}

test('#0001\'s extra attack button shows its High Kick, labelled High Kick, and still dispatches extra_attack', () => {
  const { tc, calls } = touchControls();
  const b = tc.buttons.get('extra_attack');
  assertArt(b, DEF_0001, 'extra_attack', 'High Kick');
  assert.equal(look(b), '0001_extra_attack_3.png', 'the kick at full height');
  assert.equal(b.querySelector('.tc-text'), null);
  assert.doesNotMatch(visibleText(b), CODE_LABELS, 'no visible T');
  assert.ok(b.classList.contains('tc-extra_attack'), 'the same large upper-right slot');
  assert.ok(b.classList.contains('tc-ability'));
  assert.equal(b.classList.contains('is-pending'), false, 'solid, not reserved');
  assert.equal(tc.actions.children[0], b, 'still first in the cluster');
  press(b, 3);
  assert.deepEqual(calls, [['extra_attack', true]]);
  assert.ok(b.classList.contains('is-pressed'), 'immediate press feedback');
  lift(b, 3);
  assert.deepEqual(calls, [['extra_attack', true], ['extra_attack', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
  // Alongside a held direction, too.
  tc.assign(1, 'runRight');
  press(b, 2);
  assert.deepEqual(calls.slice(2), [['runRight', true], ['extra_attack', true]]);
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['extra_attack', false], ['runRight', false]]);
});

test('#0001\'s numbered buttons show its Jab, its three orbs and its hand sign, each still dispatching its own control', () => {
  const { tc, calls } = touchControls();
  const named = [['attack1', 'Jab'], ['attack2', 'Red'], ['attack3', 'Maximum Blue'], ['attack4', 'Unlimited Void'], ['attack5', 'Hollow Purple']];
  for (const [i, [action, label]] of named.entries()) {
    const b = tc.buttons.get(action);
    assertArt(b, DEF_0001, action, label);
    assert.equal(look(b), ART_0001[action]);
    assert.doesNotMatch(visibleText(b), CODE_LABELS, `no ${action} text`);
    assert.ok(b.classList.contains(`tc-${action}`));
    assert.equal(b.classList.contains('is-pending'), false);
    press(b, 7 + i);
    assert.deepEqual(calls.at(-1), [action, true]);
    assert.ok(b.classList.contains('is-pressed'));
    lift(b, 7 + i);
    assert.deepEqual(calls.at(-1), [action, false]);
    assert.equal(b.classList.contains('is-pressed'), false);
  }
  // Five different pictures: the button previews the move.
  assert.equal(new Set(NUMBERED.map((a) => look(tc.buttons.get(a)))).size, 5);
  // Red, Maximum Blue and Hollow Purple show the very orb each one throws.
  for (const [action, id] of [['attack2', 'attack2_object'], ['attack3', 'attack3_object'], ['attack5', 'attack5_object']]) {
    assert.ok(DEF_0001.projectileAnimations[id].frames.includes(spriteOf(tc.buttons.get(action)).getAttribute('src')), action);
  }
});

test('Jump always shows the universal arrow, named Jump in either language, and is still the jump control', () => {
  const { tc, calls } = touchControls(null);
  const b = tc.buttons.get('jump');
  assert.equal(b.innerHTML, ICONS.jump, 'the jump arrow before a fighter is named');
  tc.setCharacter(DEF_0001);
  assert.equal(look(b), ICONS.jump);
  assert.equal(b.getAttribute('aria-label'), 'Jump');
  assert.equal(spriteOf(b), null);
  assert.equal(b.getAttribute('data-i18n-aria-label'), 'control.jump', 'its universal name, translated');
  tc.setCharacter(DEF_0002);
  assert.equal(look(b), ICONS.jump, 'another fighter, the same arrow');
  assert.equal(tc.buttons.get('jump'), b, 'the same button');
  tc.setCharacter(SAMPLE_FIGHTER);
  assert.equal(b.innerHTML, ICONS.jump, 'the universal arrow');
  tc.setCharacter(MOVELESS);
  assert.equal(b.hidden ?? false, false, 'Jump is always there');
  setLanguage('fr');
  try {
    tc.setCharacter(DEF_0001);
    localizeTree(tc.root);
    assert.equal(b.getAttribute('aria-label'), 'Saut');
  } finally {
    setLanguage('en');
    localizeTree(tc.root);
  }
  press(b, 1);
  lift(b, 1);
  assert.deepEqual(calls, [['jump', true], ['jump', false]]);
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
  press(tc.buttons.get('attack1'), 8);
  lift(tc.buttons.get('attack1'), 8);
  assert.deepEqual(calls.slice(1), [['attack1', true], ['attack1', false]]);
  assert.ok(b.classList.contains('is-pressed'), 'still held');
  lift(b, 6);
  assert.deepEqual(calls.at(-1), ['shield', false]);
  assert.equal(b.classList.contains('is-pressed'), false);
  assert.ok(calls.every(([action]) => ['shield', 'attack1'].includes(action)), 'no shield, block or dodge input');
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
    ['extra_attack', 'transform', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump']);
  assert.deepEqual(tc.actions.children.map((c) => [...c.classNames].find((n) => /^tc-(extra_attack|transform|shield|attack\d|jump)$/.test(n))),
    ['tc-extra_attack', 'tc-transform', 'tc-shield', 'tc-attack1', 'tc-attack2', 'tc-attack3', 'tc-attack4', 'tc-attack5', 'tc-jump']);
  // #0001 shows attack1 to attack5 in slots 1 to 5 (Jab, Red, Maximum
  // Blue, Unlimited Void, Hollow Purple).
  assert.deepEqual(NUMBERED.map((a) => [a, tc.buttons.get(a).hidden, tc.buttons.get(a).getAttribute('data-slot')]), [
    ['attack1', false, '1'], ['attack2', false, '2'], ['attack3', false, '3'], ['attack4', false, '4'], ['attack5', false, '5'],
  ]);
  assert.deepEqual(['attack4', 'attack5'].map((a) => tc.buttons.get(a).getAttribute('aria-label')), ['Unlimited Void', 'Hollow Purple']);
  assert.equal(tc.root.dataset.attackButtons, '5');
  const pending = [...tc.buttons].filter(([, b]) => b.classList.contains('is-pending')).map(([action]) => action);
  assert.deepEqual(pending, ['transform']);
  assert.equal(tc.buttons.get('transform').innerHTML, ICONS.transform, 'Transform keeps its star');
  assert.equal(tc.buttons.get('transform').getAttribute('aria-label'), 'Transform');
  assert.equal(look(tc.buttons.get('jump')), ART_0001.jump, 'Jump: the universal arrow');
  assert.equal(tc.buttons.get('jump').getAttribute('aria-label'), 'Jump');
  // The combat glyphs share one larger-icon class; Transform and Jump do not.
  assert.deepEqual(tc.actions.children.filter((c) => c.classList.contains('tc-ability')).map((c) => c.getAttribute('data-action')),
    ['extra_attack', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  // No text on any touch button: every one is a glyph.
  assert.deepEqual(tc.root.querySelectorAll('.tc-text'), []);
  for (const b of tc.dpad.children) assert.equal(b.textContent, '', b.getAttribute('data-action'));
  for (const b of tc.actions.children) assert.doesNotMatch(visibleText(b), CODE_LABELS, b.getAttribute('data-action'));
  // The buttons send the controls' own codenames: every held control but
  // the mouvement requests.
  assert.deepEqual([...tc.buttons.keys()].sort(), [
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack', 'jump', 'runLeft', 'runRight', 'shield', 'transform',
  ]);
});

test('Attack 1 and Attack 2 work alongside a held direction and each other (multi-touch), and rapid taps each register', () => {
  const { tc, calls } = touchControls();
  tc.assign(1, 'runLeft');
  press(tc.buttons.get('attack2'), 2);
  assert.deepEqual(calls, [['runLeft', true], ['attack2', true]]);
  press(tc.buttons.get('attack1'), 3);
  assert.deepEqual(calls.at(-1), ['attack1', true]);
  lift(tc.buttons.get('attack2'), 2);
  assert.deepEqual(calls.at(-1), ['attack2', false]);
  assert.ok(tc.buttons.get('runLeft').classList.contains('is-pressed'), 'the direction is still held');
  tc.releaseAll();
  assert.deepEqual(calls.slice(4).sort(), [['attack1', false], ['runLeft', false]]);
  // Hold Right and tap Punch ten times fast: ten presses, Right never let go.
  const { tc: tc2, calls: log } = touchControls();
  tc2.assign(1, 'runRight');
  for (let i = 0; i < 10; i++) {
    press(tc2.buttons.get('attack1'), 10 + i);
    lift(tc2.buttons.get('attack1'), 10 + i);
  }
  assert.equal(log.filter(([a, held]) => a === 'attack1' && held).length, 10);
  assert.equal(log.filter(([a, held]) => a === 'attack1' && !held).length, 10);
  assert.ok(!log.some(([a, held]) => a === 'runRight' && !held), 'Right stays held');
  assert.ok(tc2.buttons.get('runRight').classList.contains('is-pressed'));
});

// ---- Character switching -------------------------------------------------

test('setCharacter swaps the fighter\'s art and names in place, without rebuilding the controls or their input', () => {
  const { tc, calls, input } = touchControls();
  const before = { root: tc.root.children.slice(), buttons: new Map(tc.buttons), actions: tc.actions, dpad: tc.dpad, input: tc.input };
  const images = new Map([...SPRITE_BUTTONS].filter((a) => !tc.buttons.get(a).hidden).map((a) => [a, spriteOf(tc.buttons.get(a))]));
  tc.setCharacter(DEF_0002);
  const b = (a) => tc.buttons.get(a);
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'jump'].map((a) => look(b(a))), ['extra_attack', 'attack1', 'attack2', 'attack3', 'jump'].map((a) => ART_0002[a]));
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3'].map((a) => b(a).getAttribute('aria-label')), ['Whirlwind', 'One-Two', 'Rapid Kicks', 'Spin Attack']);
  for (const [a, img] of images) {
    if (b(a).hidden) continue;
    assert.equal(spriteOf(b(a)), img, `${a}: the same image, its source swapped`);
    assert.doesNotMatch(img.getAttribute('src'), /\/0001_/, `${a}: nothing of #0001 left`);
  }
  assert.equal(b('attack4').hidden, true, 'no Attack 4 of its own');
  // Universal and glyph buttons untouched.
  assert.equal(b('shield').innerHTML, ICONS.shield);
  assert.equal(b('transform').innerHTML, ICONS.transform);
  assert.ok(b('transform').classList.contains('is-pending'));
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
  press(b('attack1'), 5);
  lift(b('attack1'), 5);
  press(b('extra_attack'), 6);
  assert.deepEqual(calls, [['attack1', true], ['attack1', false], ['extra_attack', true]]);
  // A fighter that authors nothing: neutral, never another fighter's leftovers.
  tc.setCharacter({ id: '9997' });
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'jump'].map((a) => [look(b(a)), b(a).getAttribute('aria-label')]),
    [[ICONS.ring, 'Extra Attack'], [ICONS.pip1, 'Attack 1'], [ICONS.pip2, 'Attack 2'], [ICONS.jump, 'Jump']]);
  assert.ok(SPRITE_BUTTONS.every((a) => spriteOf(b(a)) === null), 'no image left behind');
  // And back.
  tc.setCharacter(DEF_0001);
  assert.deepEqual(['extra_attack', 'attack1', 'attack2'].map((a) => b(a).getAttribute('aria-label')), ['High Kick', 'Jab', 'Red']);
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'jump'].map((a) => look(b(a))), ['extra_attack', 'attack1', 'attack2', 'jump'].map((a) => ART_0001[a]));
  assert.equal(spriteOf(b('attack1')), images.get('attack1'), 'its image again, re-used');
});

test('before any fighter is named the controls are usable and neutral; a held button survives a swap', () => {
  const { tc, calls } = touchControls(null);
  assert.deepEqual(['extra_attack', 'attack1', 'attack2'].map((a) => tc.buttons.get(a).getAttribute('aria-label')),
    ['Extra Attack', 'Attack 1', 'Attack 2']);
  const b = tc.buttons.get('attack1');
  assert.equal(b.innerHTML, ICONS.pip1);
  press(b, 4);
  tc.setCharacter(DEF_0001);
  assert.ok(b.classList.contains('is-pressed'), 'still pressed after its art changed');
  assert.equal(look(b), ART_0001.attack1);
  lift(b, 4);
  assert.deepEqual(calls, [['attack1', true], ['attack1', false]]);
});

// ---- Desktop controls ---------------------------------------------------------

test('keyboard bindings are unchanged by the touch layouts, keyed by control codename', () => {
  assert.deepEqual({ ...CONFIG.bindings }, {
    runLeft: ['KeyA', 'ArrowLeft'],
    runRight: ['KeyD', 'ArrowRight'],
    down: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    extra_attack: ['KeyJ'],
    transform: ['KeyK'],
    shield: ['KeyL'],
    attack1: ['KeyU'],
    attack2: ['KeyI'],
    attack3: ['KeyO'],
    attack4: ['KeyM'],
    attack5: ['Comma'],
    pause: ['Escape', 'KeyP'],
  });
  assert.deepEqual({ ...ACTION_LABELS }, {
    runLeft: 'Move left', runRight: 'Move right', down: 'Down', jump: 'Jump', extra_attack: 'Extra Attack', transform: 'Transform',
    shield: 'Shield', attack1: 'Attack 1', attack2: 'Attack 2', attack3: 'Attack 3', attack4: 'Attack 4', attack5: 'Attack 5',
    pause: 'Pause',
  });
  // No Block or dash key: Dash stays a double tap on the keyboard, and the
  // mouvement buttons are touch-only. No retired name survives as an alias.
  for (const name of [
    'block', 'dash', 'dashLeft', 'dashRight', 'mouvementLeft', 'mouvementRight',
    'left', 'right', 'primary', 'special', 'defense', 'action1', 'action2',
  ]) {
    assert.equal(CONFIG.bindings[name], undefined, name);
    assert.equal(ACTION_LABELS[name], undefined, name);
  }
});

// ---- Classic Buttons: Down ------------------------------------------------

// Lays the lower-left cluster out left to right, 50 px apart.
function layoutDpad(tc) {
  ['runLeft', 'runRight'].forEach((action, i) => {
    tc.buttons.get(action).rect = { left: i * 50, top: 0, width: 40, height: 40 };
  });
  return (action) => ({ clientX: ['runLeft', 'runRight'].indexOf(action) * 50 + 20, clientY: 20 });
}

test('neither layout creates Down, including detached controls and lookup', () => {
  for (const scheme of ['classic', 'joystick']) {
    const { tc } = touchControls(DEF_0001, { scheme });
    assert.equal(tc.buttons.has('down'), false);
    assert.equal(tc.padButtons.has('down'), false);
    assert.equal(tc.controlElement('down', scheme), null);
    assert.ok(tc.allButtons.every((b) => b.getAttribute('data-action') !== 'down'));
    assert.deepEqual(actionsOf(tc.dpad), ['runLeft', 'runRight']);
    assert.equal(tc.joystick.children.length, 3);
  }
});

test('holding Right dispatches down for the whole pointer hold', () => {
  const { tc, calls } = touchControls();
  const at = layoutDpad(tc);
  const b = tc.buttons.get('runRight');
  tc.dpad.dispatch('pointerdown', { pointerId: 4, ...at('runRight'), preventDefault() {} });
  assert.deepEqual(calls, [['runRight', true]]);
  assert.ok(b.classList.contains('is-pressed'));
  // Small thumb movement inside it keeps it held, with no repeat dispatches.
  for (const dx of [-6, 3, 8, 0]) {
    tc.dpad.dispatch('pointermove', { pointerId: 4, clientX: at('runRight').clientX + dx, clientY: 22 });
    assert.ok(b.classList.contains('is-pressed'));
  }
  assert.deepEqual(calls, [['runRight', true]]);
  tc.dpad.dispatch('pointerup', { pointerId: 4 });
  assert.deepEqual(calls, [['runRight', true], ['runRight', false]]);
  assert.equal(b.classList.contains('is-pressed'), false);
});

test('sliding Left → Right → Left transfers the same pointer without lifting', () => {
  const { tc, calls } = touchControls();
  const at = layoutDpad(tc);
  tc.dpad.dispatch('pointerdown', { pointerId: 1, ...at('runLeft'), preventDefault() {} });
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('runRight') });
  assert.equal(tc.buttons.get('runLeft').classList.contains('is-pressed'), false);
  assert.ok(tc.buttons.get('runRight').classList.contains('is-pressed'));
  tc.dpad.dispatch('pointermove', { pointerId: 1, ...at('runLeft') });
  tc.dpad.dispatch('pointerup', { pointerId: 1 });
  assert.deepEqual(calls, [['runLeft', true], ['runLeft', false], ['runRight', true], ['runRight', false], ['runLeft', true], ['runLeft', false]]);
});

test('a cancelled or lost Right pointer, or releaseAll(), never leaves Right stuck', () => {
  for (const end of ['pointercancel', 'lostpointercapture']) {
    const { tc, calls } = touchControls();
    const at = layoutDpad(tc);
    tc.dpad.dispatch('pointerdown', { pointerId: 2, ...at('runRight'), preventDefault() {} });
    tc.dpad.dispatch(end, { pointerId: 2 });
    assert.deepEqual(calls, [['runRight', true], ['runRight', false]], end);
    assert.equal(tc.buttons.get('runRight').classList.contains('is-pressed'), false);
  }
  const { tc, calls } = touchControls();
  const at = layoutDpad(tc);
  tc.dpad.dispatch('pointerdown', { pointerId: 3, ...at('runRight'), preventDefault() {} });
  tc.releaseAll();
  assert.deepEqual(calls, [['runRight', true], ['runRight', false]]);
  assert.equal(tc.buttons.get('runRight').classList.contains('is-pressed'), false);
  // Disabling (pause, result screen) releases it too.
  tc.dpad.dispatch('pointerdown', { pointerId: 5, ...at('runRight'), preventDefault() {} });
  tc.setEnabled(false);
  assert.deepEqual(calls.at(-1), ['runRight', false]);
});

test('Right works alongside every attack, Shield and Jump (multi-touch), each its own input', () => {
  for (const other of ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'shield', 'jump']) {
    const { tc, calls } = touchControls();
    const at = layoutDpad(tc);
    tc.dpad.dispatch('pointerdown', { pointerId: 1, ...at('runRight'), preventDefault() {} });
    tc.buttons.get(other).dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
    assert.deepEqual(calls, [['runRight', true], [other, true]], other);
    tc.buttons.get(other).dispatch('pointerup', { pointerId: 2 });
    assert.deepEqual(calls.at(-1), [other, false]);
    assert.ok(tc.buttons.get('runRight').classList.contains('is-pressed'), `Right still held after ${other}`);
    assert.equal(tc.counts.get('runRight'), 1);
    tc.dpad.dispatch('pointerup', { pointerId: 1 });
    assert.deepEqual(calls.at(-1), ['runRight', false]);
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

test('Classic Buttons is the original layout: Left / Right at the lower left, the actions at the lower right', () => {
  const { tc } = touchControls(DEF_0001, { scheme: 'classic' });
  assert.deepEqual(tc.root.children, [tc.dpad, tc.actions]);
  assert.deepEqual(actionsOf(tc.dpad), ['runLeft', 'runRight']);
  assert.deepEqual(tc.dpad.children.map((b) => b.getAttribute('aria-label')), ['Move left', 'Move right']);
  assert.equal(tc.dpad.getAttribute('aria-label'), 'Movement');
  assert.deepEqual(actionsOf(tc.actions), ['extra_attack', 'transform', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump']);
  assert.equal(tc.buttons.has('down'), false);
  // Nothing of the Joystick scheme is on screen.
  assert.equal(tc.root.querySelectorAll('.tc-stick').length, 0);
  assert.equal(tc.root.querySelectorAll('.tc-dash').length, 0);
  assert.equal(tc.root.querySelectorAll('.tc-stick-down').length, 0);
  // Left and Right are ordinary held directions: a Dash still needs two taps.
  const { tc: tc2, calls } = touchControls(DEF_0001, { scheme: 'classic' });
  const at = layoutDpad(tc2);
  tc2.dpad.dispatch('pointerdown', { pointerId: 1, ...at('runRight'), preventDefault() {} });
  tc2.dpad.dispatch('pointerup', { pointerId: 1 });
  tc2.dpad.dispatch('pointerdown', { pointerId: 2, ...at('runRight'), preventDefault() {} });
  tc2.dpad.dispatch('pointerup', { pointerId: 2 });
  assert.deepEqual(calls, [['runRight', true], ['runRight', false], ['runRight', true], ['runRight', false]], 'two taps are two presses, no Dash request');
});

test('the Joystick scheme: a movement joystick between Left mouvement and Right mouvement', () => {
  const { tc } = touchControls(DEF_0001, { scheme: 'joystick' });
  assert.deepEqual(tc.root.children, [tc.joystick, tc.actions]);
  const [mouvementLeft, stick, mouvementRight] = tc.joystick.children;
  assert.equal(tc.joystick.children.length, 3);
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
  // The old cluster is gone from the screen.
  assert.equal(tc.root.querySelectorAll('.tc-dpad').length, 0);
  assert.deepEqual(tc.root.querySelectorAll('.tc-text'), [], 'no letter anywhere');
  assert.equal(tc.buttons.has('down'), false);
  // The same held inputs, no left / right buttons: the stick holds those.
  assert.deepEqual([...tc.buttons.keys()].sort(), ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack', 'jump', 'shield', 'transform']);
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

test('up and down move the knob only: never Jump or Down; the knob stays inside the base', () => {
  const { tc, calls, down, move, end } = joystickControls();
  down(0, -90);
  move(5, 95);
  move(-10, -200);
  assert.deepEqual(calls, [], 'no Jump, no Down, no direction');
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

test('the joystick works alongside Jump, every attack, Shield, the extra attack and Transform (multi-touch)', () => {
  for (const other of ['jump', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'shield', 'extra_attack', 'transform']) {
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
  press(tc.buttons.get('shield'), 2);
  press(tc.buttons.get('attack1'), 3);
  press(tc.buttons.get('jump'), 4);
  end();
  lift(tc.buttons.get('jump'), 4);
  lift(tc.buttons.get('attack1'), 3);
  lift(tc.buttons.get('shield'), 2);
  assert.deepEqual(calls, [
    ['runLeft', true], ['shield', true], ['attack1', true], ['jump', true],
    ['runLeft', false], ['jump', false], ['attack1', false], ['shield', false],
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

test('assistive technology: activating a Dash button asks for one Dash; activating Down or Attack 3 taps it', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const click = (target) => tc.root.dispatch('click', { detail: 0, target: { closest: () => target } });
  click(tc.mouvementButtons.get('mouvementLeft'));
  assert.deepEqual(calls, [['mouvement', -1]]);
  click(tc.buttons.get('shield'));
  assert.deepEqual(calls.at(-1), ['shield', true]);
  click(tc.buttons.get('attack3'));
  assert.deepEqual(calls.at(-1), ['attack3', true]);
});

// ---- Joystick: Down left of the stick --------------------------------------------

test('the Joystick scheme\'s Shield button is held for exactly the pointer\'s lifetime and never sticks', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const down = tc.buttons.get('shield');
  press(down, 1);
  assert.deepEqual(calls, [['shield', true]]);
  assert.ok(down.classList.contains('is-pressed'));
  press(tc.buttons.get('attack2'), 2); // Shield + Kick: two separate inputs
  lift(tc.buttons.get('attack2'), 2);
  assert.deepEqual(calls.slice(1), [['attack2', true], ['attack2', false]]);
  assert.ok(down.classList.contains('is-pressed'), 'still held after Kick');
  assert.equal(tc.counts.get('shield'), 1);
  lift(down, 1);
  assert.deepEqual(calls.at(-1), ['shield', false]);
  for (const end of ['pointercancel', 'lostpointercapture']) {
    press(down, 3);
    down.dispatch(end, { pointerId: 3 });
    assert.deepEqual(calls.at(-1), ['shield', false], end);
  }
  press(down, 4);
  tc.setEnabled(false);
  assert.deepEqual(calls.at(-1), ['shield', false]);
  assert.equal(down.classList.contains('is-pressed'), false);
});

// ---- Switching schemes -----------------------------------------------------------

test('switching schemes lets go of everything first: no direction, Jump or Shield left down', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  tc.stick.rect = { left: 0, top: 100, width: 200, height: 200 };
  tc.stick.dispatch('pointerdown', { pointerId: 1, clientX: 180, clientY: 200, preventDefault() {} });
  for (const [action, id] of [['jump', 3], ['shield', 4]]) press(tc.buttons.get(action), id);
  press(tc.mouvementButtons.get('mouvementLeft'), 5);
  const down = calls.length;
  tc.setScheme('classic');
  assert.deepEqual(calls.slice(down).sort(), [['jump', false], ['runRight', false], ['shield', false]]);
  assert.equal(tc.pointers.size, 0);
  assert.ok([...tc.counts.values()].every((n) => n === 0));
  assert.deepEqual(tc.knobOffset, { x: 0, y: 0 }, 'the stick recentred');
  assert.equal(tc.stickPointer, null);
  assert.ok(tc.allButtons.every((b) => !b.classList.contains('is-pressed')), 'no pressed look left anywhere');
  // Late ends from the old layout's pointers change nothing.
  tc.stick.dispatch('pointerup', { pointerId: 1 });
  lift(tc.buttons.get('jump'), 3);
  assert.equal(calls.length, down + 3);

  // And back: both held Classic directions are let go too.
  const at = layoutDpad(tc);
  tc.dpad.dispatch('pointerdown', { pointerId: 6, ...at('runLeft'), preventDefault() {} });
  tc.dpad.dispatch('pointerdown', { pointerId: 7, ...at('runRight'), preventDefault() {} });
  tc.setScheme('joystick');
  assert.deepEqual(calls.slice(-2).sort(), [['runLeft', false], ['runRight', false]]);
  assert.equal(tc.padButtons.get('runLeft').classList.contains('is-pressed'), false);
  // Even re-applying the same scheme releases.
  press(tc.buttons.get('attack1'), 8);
  tc.setScheme('joystick');
  assert.deepEqual(calls.at(-1), ['attack1', false]);
});

test('a scheme switch keeps the fighter\'s combat buttons and Jump: the same elements, art and names', () => {
  const { tc, calls } = touchControls(DEF_0001, { scheme: 'joystick' });
  const before = new Map(tc.actionButtons);
  const images = new Map([...before].map(([a, b]) => [a, spriteOf(b)]));
  for (const scheme of ['classic', 'joystick', 'classic']) {
    tc.setScheme(scheme);
    for (const [action, b] of before) {
      assert.equal(tc.buttons.get(action), b, `${scheme}: ${action}`);
      assert.equal(spriteOf(b), images.get(action), `${scheme}: ${action}'s same image`);
    }
    assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump'].map((a) => [tc.buttons.get(a).getAttribute('aria-label'), look(tc.buttons.get(a))]),
      [['High Kick', ART_0001.extra_attack], ['Jab', ART_0001.attack1], ['Red', ART_0001.attack2], ['Maximum Blue', ART_0001.attack3],
        ['Unlimited Void', ART_0001.attack4], ['Hollow Purple', ART_0001.attack5], ['Jump', ART_0001.jump]]);
    assert.deepEqual(['shield', 'transform'].map((a) => tc.buttons.get(a).innerHTML), [ICONS.shield, ICONS.transform]);
    assert.equal(tc.actions.children[0], before.get('extra_attack'));
  }
  // setCharacter still works in either layout, and never moves a button.
  tc.setScheme('joystick');
  tc.setCharacter(null);
  assert.equal(tc.buttons.get('extra_attack').getAttribute('aria-label'), 'Extra Attack');
  assert.equal(tc.joystick.children[0], tc.mouvementButtons.get('mouvementLeft'));
  assert.deepEqual(actionsOf(tc.actions).at(-1), 'jump');
  press(tc.buttons.get('extra_attack'), 1);
  assert.deepEqual(calls, [['extra_attack', true]]);
});

test('the Joystick layout\'s geometry: the stick at the lower left with Dash buttons above its top corners', () => {
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
  assert.doesNotMatch(CSS, /--tc-down|--tc-stick-left|\.tc-stick-down/);
  assert.match(stick, /left: 0;/);
  assert.match(rule('.tc-joystick'), /width: var\(--tc-stick\);/);
  // Dash buttons: small, above the stick (whose top is at 1.92 --tc), at its left and right.
  assert.match(CSS, /--tc-stick: calc\(var\(--tc\) \* 1\.92\);/);
  assert.match(rule('.tc-dash'), /bottom: calc\(var\(--tc\) \* 1\.82\);/);
  assert.match(rule('.tc-dash'), /width: var\(--tc-dash\);/);
  assert.match(CSS, /--tc-dash: calc\(var\(--tc\) \* 0\.62\);/);
  assert.match(rule('.tc-dash-left'), /left: calc\(var\(--tc\) \* -0\.03\);/);
  assert.match(rule('.tc-dash-right'), /right: calc\(var\(--tc\) \* -0\.03\);/);
  // The lower-right cluster no longer rises: it sits exactly where Classic
  // Buttons has it, untouched.
  assert.doesNotMatch(CSS, /\.is-joystick \.tc-actions/);
  assert.match(CSS, /\.tc-jump \{ right: 0; bottom: 0; \}/);
  assert.match(CSS, /\.tc-attack\[data-slot="2"\] \{ right: var\(--tc-pitch\); bottom: 0; \}/);
  assert.match(CSS, /\.tc-attack\[data-slot="1"\] \{ right: calc\(var\(--tc-pitch\) \* 2\); bottom: 0; \}/);
  assert.match(CSS, /\.tc-transform \{ right: calc\(var\(--tc-pitch\) \* 1\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
});

// ---- Button geometry -----------------------------------------------------------

test('the Shield touch button keeps the old Defense / Block coordinates', () => {
  assert.match(CSS, /\.tc-shield \{ right: calc\(var\(--tc-pitch\) \* 0\.5\); bottom: calc\(var\(--tc-pitch\) \* 0\.87\); \}/);
  assert.doesNotMatch(CSS, /\.tc-(block|defense)\b/);
});

test('the Shuriken touch button keeps the old Throw / Primary coordinates and size', () => {
  assert.match(CSS, /\.tc-extra_attack \{\n  right: calc\(var\(--tc-pitch\) \* 0\.02\);\n  bottom: calc\(var\(--tc-pitch\) \* 1\.74\);\n  width: calc\(var\(--tc\) \* 1\.12\);\n  height: calc\(var\(--tc\) \* 1\.12\);/);
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
  const touch = read('js/ui/touch-controls.js');
  assert.match(touch, /'pointerdown'/);
  assert.match(touch, /setPointerCapture/);
});

// ---- Numbered attack buttons: the loadout matrix ---------------------------------------

test('each fighter shows exactly its own numbered attack buttons, in deterministic slots: Cases A to F', () => {
  for (const c of LOADOUT_CASES) {
    for (const scheme of ['joystick', 'classic']) {
      const { tc, calls } = touchControls(c.def, { scheme });
      const shown = NUMBERED.filter((a) => !tc.buttons.get(a).hidden);
      assert.deepEqual(shown, c.buttons, `Case ${c.name} (${scheme}): its buttons`);
      // Slots 1, 2, then 3, 4, 5 for the rest in order, whatever kind of
      // move each is (a summon and a technique included).
      assert.deepEqual(shown.map((a) => tc.buttons.get(a).getAttribute('data-slot')), shown.map((_, i) => String(i + 1)), `Case ${c.name}`);
      for (const a of NUMBERED.filter((n) => !c.buttons.includes(n))) {
        assert.equal(tc.buttons.get(a).getAttribute('data-slot'), null, `Case ${c.name}: ${a} has no slot`);
        assert.equal(tc.buttons.get(a).getAttribute('aria-label'), null, `Case ${c.name}: ${a} has no name`);
      }
      assert.equal(tc.root.dataset.attackButtons, String(c.buttons.length));
      // Named and glyphed neutrally (it authors no mobileAbilities), and
      // each sends its own codename.
      for (const [i, a] of shown.entries()) {
        const b = tc.buttons.get(a);
        assert.equal(b.getAttribute('aria-label'), ACTION_LABELS[a], a);
        assert.equal(b.innerHTML, ICONS[`pip${a.slice(6)}`], a);
        press(b, 20 + i);
        lift(b, 20 + i);
      }
      assert.deepEqual(calls, shown.flatMap((a) => [[a, true], [a, false]]), `Case ${c.name}: only its buttons send anything`);
    }
  }
  assert.deepEqual([...attackSlots((a) => ['attack5'].includes(a))], [['attack1', 1], ['attack2', 2], ['attack5', 3]]);
  assert.deepEqual([...attackSlots(() => true)].map(([, slot]) => slot), [1, 2, 3, 4, 5]);
});

test('a summon or technique is a button of its own, pressed like any other: Case E\'s attack3 and attack4', () => {
  const E = LOADOUT_CASES.find((c) => c.name === 'E').def;
  const { tc, calls } = touchControls(E);
  const kids = tc.actions.children.slice();
  for (const [i, a] of ['attack3', 'attack4'].entries()) {
    const b = tc.buttons.get(a);
    assert.equal(b.hidden, false, a);
    assert.equal(b.getAttribute('data-slot'), String(i + 3));
    press(b, 10 + i);
    lift(b, 10 + i);
  }
  assert.deepEqual(calls, [['attack3', true], ['attack3', false], ['attack4', true], ['attack4', false]], 'its own codenames, nothing held with them');
  assert.deepEqual(tc.actions.children, kids, 'no element swapped in or out');
});

test('five attack buttons and the extra attack work together, multi-touch included, beside Shield and Jump', () => {
  const { tc, calls } = touchControls(WITH_EXTRA, { scheme: 'joystick' });
  const all = ['extra_attack', ...NUMBERED, 'shield', 'jump'];
  for (const a of all) assert.equal(tc.buttons.get(a).hidden ?? false, false, `${a} on show`);
  assert.equal(tc.buttons.get('extra_attack').getAttribute('aria-label'), ACTION_LABELS.extra_attack);
  assert.deepEqual(NUMBERED.map((a) => tc.buttons.get(a).getAttribute('data-slot')), ['1', '2', '3', '4', '5']);
  // Every one held at once, each by its own pointer, then let go one by one.
  all.forEach((a, i) => press(tc.buttons.get(a), 40 + i));
  assert.deepEqual(calls.map(([a]) => a), all);
  assert.ok(all.every((a) => tc.buttons.get(a).classList.contains('is-pressed')));
  all.forEach((a, i) => lift(tc.buttons.get(a), 40 + i));
  assert.deepEqual(calls.slice(all.length), all.map((a) => [a, false]));
  // Switching to #0002 (three numbered attacks) hides only attack4 and
  // attack5; switching to #0001 shows all five again.
  tc.setCharacter(DEF_0002);
  assert.deepEqual(NUMBERED.map((a) => tc.buttons.get(a).hidden ?? false), [false, false, false, true, true]);
  assert.deepEqual(NUMBERED.map((a) => tc.buttons.get(a).getAttribute('data-slot')), ['1', '2', '3', null, null]);
  assert.equal(tc.root.dataset.attackButtons, '3');
  tc.setCharacter(DEF_0001);
  assert.deepEqual(NUMBERED.map((a) => tc.buttons.get(a).hidden ?? false), [false, false, false, false, false]);
  assert.equal(tc.root.dataset.attackButtons, '5');
});

test('the numbered attack slots are a honeycomb round Transform and Shield: no two buttons of the cluster overlap', () => {
  // Centres and radii, in units of --tc (a button is 1 across, the extra
  // attack 1.12, and a pitch is 1.17: --tc plus a 0.17 gap), from the
  // stylesheet's own rules.
  const PITCH = 1.17;
  const place = (selector) => {
    const rule = CSS.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    const k = (side) => {
      const v = rule.match(new RegExp(`${side}: ([^;]+);`))?.[1];
      assert.ok(v, `${selector} ${side}`);
      if (v === '0') return 0;
      if (v === 'var(--tc-pitch)') return PITCH;
      return Number(v.match(/var\(--tc-pitch\) \* ([\d.]+)/)[1]) * PITCH;
    };
    return { right: k('right'), bottom: k('bottom') };
  };
  const buttons = {
    jump: { ...place('.tc-jump'), size: 1 },
    shield: { ...place('.tc-shield'), size: 1 },
    transform: { ...place('.tc-transform'), size: 1 },
    extra_attack: { ...place('.tc-extra_attack'), size: 1.12 },
  };
  for (const n of [1, 2, 3, 4, 5]) buttons[`slot${n}`] = { ...place(`.tc-attack[data-slot="${n}"]`), size: 1 };
  const entries = Object.entries(buttons).map(([name, b]) => [name, { x: -(b.right + b.size / 2), y: -(b.bottom + b.size / 2), r: b.size / 2 }]);
  for (const [i, [a, p]] of entries.entries()) {
    for (const [b, q] of entries.slice(i + 1)) {
      const gap = Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r;
      assert.ok(gap > 0.05, `${a} and ${b} are ${gap.toFixed(3)} --tc apart`);
    }
  }
  // Slots 1 and 2 are where attack1 and attack2 have always been.
  assert.deepEqual(place('.tc-attack[data-slot="1"]'), { right: 2 * PITCH, bottom: 0 });
  assert.deepEqual(place('.tc-attack[data-slot="2"]'), { right: PITCH, bottom: 0 });
  // The cluster widens for a third button, never past half a pitch.
  assert.match(CSS, /\.touch-controls\[data-attack-buttons="3"\] \.tc-actions,/);
});

test('ground/air previews follow each loadout and reuse images, buttons and simultaneous held inputs', () => {
  const expected = {
    '0001': { attack1: '0001_midair_attack1_4.png', attack2: '0001_midair_attack2_4.png', attack3: '0001_midair_attack3_2.png' },
    '0002': { attack1: '0002_midair_attack1_1.png', attack2: '0002_midair_attack2_5.png', attack3: '0002_midair_attack3_3.png' },
  };
  for (const def of [DEF_0001, DEF_0002]) for (const scheme of ['classic', 'joystick']) {
    const { tc, calls } = touchControls(def, { scheme });
    const before = new Map([...tc.actionButtons].map(([a, b]) => [a, { button: b, image: spriteOf(b), look: look(b) }]));
    press(tc.buttons.get('attack1'), 1);
    press(tc.buttons.get('jump'), 2);
    press(tc.buttons.get('shield'), 3);
    const held = [...calls];
    tc.setAirborne(true);
    for (const [action, file] of Object.entries(expected[def.id])) {
      const b = tc.buttons.get(action);
      assert.equal(look(b), file);
      assert.equal(b, before.get(action).button);
      assert.equal(spriteOf(b), before.get(action).image);
      assert.equal(b.getAttribute('data-action'), action);
      assert.equal(b.getAttribute('aria-disabled'), null);
      assert.ok(b.getAttribute('aria-label').length > 0);
    }
    assert.equal(look(tc.buttons.get('jump')), ICONS.jump);
    assert.deepEqual(calls, held, 'no release or synthetic input on takeoff');
    // A repeated state must not even enter the DOM presentation path.
    const show = tc.showArt;
    tc.showArt = () => assert.fail('unchanged state wrote artwork');
    for (let i = 0; i < 60; i++) tc.setAirborne(true);
    tc.showArt = show;
    tc.setAirborne(false);
    for (const [action, old] of before) assert.equal(look(tc.actionButtons.get(action)), old.look, `landing restores ${action}`);
    assert.deepEqual(calls, held);
    tc.releaseAll();
    assert.deepEqual(calls.slice(held.length).sort(), [['attack1', false], ['jump', false], ['shield', false]]);
  }
});

test('ground-only abilities stay recognizable but inactive in the air, including the Whirlwind tornado', () => {
  for (const [def, actions] of [[DEF_0001, ['attack4', 'attack5']], [DEF_0002, ['extra_attack']]]) {
    const { tc } = touchControls(def);
    const art = actions.map((a) => look(tc.buttons.get(a)));
    tc.setAirborne(true);
    actions.forEach((a, i) => {
      const b = tc.buttons.get(a);
      assert.equal(look(b), art[i]);
      assert.equal(b.hidden, false);
      assert.equal(b.getAttribute('aria-disabled'), 'true');
      assert.ok(b.classList.contains('is-unavailable'));
    });
    tc.setAirborne(false);
    actions.forEach((a) => assert.equal(tc.buttons.get(a).getAttribute('aria-disabled'), null));
  }
  const { tc } = touchControls(DEF_0002);
  const b = tc.buttons.get('extra_attack');
  assert.equal(spriteOf(b).getAttribute('src'), DEF_0002.projectileAnimations.extra_attack_object.frames[2]);
  captureWarnings(() => spriteOf(b).dispatch('error'));
  assert.equal(look(b), ICONS.tornado);
  assert.equal(b.getAttribute('aria-label'), 'Whirlwind');
  tc.setAirborne(true);
  assert.equal(look(b), ICONS.tornado);
  assert.equal(b.getAttribute('aria-disabled'), 'true');
});

test('air move names remain localized through language changes, landing and fighter switches', () => {
  const { tc } = touchControls(DEF_0002);
  tc.setAirborne(true);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => tc.buttons.get(a).getAttribute('aria-label')), ['Homing Attack', 'Bounce Attack', 'Blue Tornado']);
  setLanguage('fr');
  try {
    localizeTree(tc.root);
    assert.equal(tc.buttons.get('attack3').getAttribute('aria-label'), 'Tornade bleue');
    tc.setAirborne(false);
    assert.equal(tc.buttons.get('attack3').getAttribute('aria-label'), 'Attaque tournoyante');
    tc.setAirborne(true);
    // A fighter change starts on the ground: #0001's own ground name, in
    // French, until the next airborne refresh names its mid-air one.
    tc.setCharacter(DEF_0001);
    assert.equal(tc.buttons.get('attack1').getAttribute('aria-label'), 'Direct');
    tc.setAirborne(true);
    assert.equal(tc.buttons.get('attack1').getAttribute('aria-label'), 'Direct flottant');
    assert.equal(look(tc.buttons.get('jump')), ICONS.jump);
  } finally { setLanguage('en'); }
});

test('a future fighter uses its own mapped air preview, or a fallback if missing, never an unrelated ground frame', () => {
  const def = {
    ...DEF_0001, id: 'future',
    actions: { attack1: { ground: 'attack1', air: 'midair_attack2' } },
    mobileAbilities: { attack1: { label: 'Ground', previews: { ground: { animation: 'attack1', frame: 0 }, air: { animation: 'midair_attack2', frame: 2 } } } },
  };
  assert.equal(previewFrame(def, 'attack1', true).url, def.animations.midair_attack2.frames[2]);
  const { tc } = touchControls(def);
  tc.setAirborne(true);
  const b = tc.buttons.get('attack1');
  captureWarnings(() => spriteOf(b).dispatch('error'));
  assert.equal(look(b), ICONS.pip1);
  tc.setAirborne(false);
  assert.equal(look(b), '0001_attack1_1.png');
  delete def.mobileAbilities.attack1.previews.air;
  tc.setAirborne(true);
  assert.equal(look(b), ICONS.pip1);
});
