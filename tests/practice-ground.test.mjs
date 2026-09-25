// Run with node --test tests/practice-ground.test.mjs (no dependencies).
// Practice Ground: the Home entry, the PracticeSession (with its default
// training-dummy CPU, or solo once that is disabled, its "+N" damage
// numbers and its 2-second Void respawns back to 0 Knockback), its HUD (a
// card for Player 1 and one for the CPU), the Practice menu and the Change
// Fighter and CPU dialogs, on a minimal fake DOM and a no-op Canvas; plus
// checks that Quick Battle keeps its CPU, timer and stages. Layout and paint
// still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeSprites, def as DEF_0001, DT } from './fighter-harness.mjs';

// ---- Fake DOM + Canvas -------------------------------------------------------

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
  // Custom properties (the HUD's cooldown rings) land as plain keys.
  style = { setProperty(name, value) { this[name] = value; } };
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  html = '';
  scrollTop = 0;
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
  setAttribute(name, value) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = true;
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) return this[name] ? '' : null;
    if (name === 'id') return this.attrs.get('id') ?? null;
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  get id() { return this.getAttribute('id'); }
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
  removeEventListener() {}
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn({ target: this, ...event }); }
  // Like the real thing: disabled buttons ignore click(). `detail` 0 is a
  // keyboard / gamepad activation, 1 a pointer press.
  click(detail = 1) {
    if (this.disabled) return;
    this.dispatch('click', { detail, preventDefault: noop });
  }
  focus() {
    if (this.disabled || this.closest('[hidden], [inert]')) return;
    document.activeElement = this;
    this.dispatch('focus');
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
  scrollBy() {}
  scrollIntoView() {}
  setPointerCapture() {}
  getContext() { return (this.ctx ??= fakeContext()); }
}

// Every drawing call is a no-op; state set on it is kept.
function fakeContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (key === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

// Counts constructions, so drawing can be shown to build no Path2D.
let path2dCount = 0;
class FakePath2D {
  constructor() {
    path2dCount++;
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop) });
  }
}

const docListeners = new Map();
const sections = new Map();
globalThis.Node = Node;
globalThis.Path2D = FakePath2D;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.ResizeObserver = class {
  static live = new Set();
  observe() { ResizeObserver.live.add(this); }
  disconnect() { ResizeObserver.live.delete(this); }
};
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  hidden: false,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: (selector) => {
    const id = selector.match(/data-screen="([\w-]+)"/)?.[1];
    if (!sections.has(id)) sections.set(id, new Element('section'));
    return sections.get(id);
  },
  addEventListener: (type, fn) => {
    if (!docListeners.has(type)) docListeners.set(type, new Set());
    docListeners.get(type).add(fn);
  },
  removeEventListener: (type, fn) => docListeners.get(type)?.delete(fn),
};

const { CONFIG } = await import('../js/config.js');
const { CHARACTERS, getCharacter } = await import('../js/data/characters.js');
const { MAPS, getMap } = await import('../js/data/maps.js');
const { PRACTICE_MAP } = await import('../js/data/practice-map.js');
const { createTheme } = await import('../js/stages/index.js');
const { PracticeTheme } = await import('../js/stages/practice-theme.js');
const { PracticeSession, formatDamage } = await import('../js/game/practice.js');
const { Fighter } = await import('../js/game/character.js');
const { FighterRoster } = await import('../js/ui/fighter-roster.js');
const { Battle } = await import('../js/game/battle.js');
const { HUD } = await import('../js/game/hud.js');
const { PlayerController, TrainingAIController } = await import('../js/game/fighter-controller.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { ICONS } = await import('../js/ui/icons.js');
const { HomeScreen } = await import('../js/screens/home-screen.js');
const { CharacterSelectScreen } = await import('../js/screens/character-select-screen.js');
const { PracticeGroundScreen, PRACTICE_DEFAULT_FIGHTER } = await import('../js/screens/practice-screen.js');

// A second available fighter (same art as #0001) so a swap to a different
// fighter can be checked. Registered before any roster is built.
const DEF_9999 = { ...DEF_0001, id: '9999', displayName: '#9999', rosterSlot: 5, available: true };
CHARACTERS.push(DEF_9999);

// No AI decision may ever be made while practising.
let aiInputs = 0;
const aiGetInput = TrainingAIController.prototype.getInput;
TrainingAIController.prototype.getInput = function (...args) {
  aiInputs++;
  return aiGetInput.apply(this, args);
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Gameplay input: `script` feeds one snapshot per simulation step; key()
// runs a keydown through every listener, menus first (as in the app).
function fakeInput() {
  const listeners = new Set();
  return {
    gameplayActive: false,
    lastDevice: 'keyboard',
    flushes: 0,
    script: [],
    listeners,
    onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onPadMenu: noop,
    setGameplayActive(on) { this.gameplayActive = on; },
    setTouch: noop,
    flush() { this.flushes++; },
    sample() { return this.script.shift() ?? {}; },
    key(code) {
      const e = { code, repeat: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: noop };
      for (const fn of [...listeners]) fn(e);
      return e;
    },
  };
}

function fakeApp() {
  const loads = [];
  const sprites = new Map();
  const spritesFor = (id) => {
    if (!sprites.has(id)) sprites.set(id, fakeSprites());
    return sprites.get(id);
  };
  const app = {
    selection: { mode: 'quick-battle', characterId: '0001', mapId: MAPS[0].id },
    input: fakeInput(),
    device: { blockedPortrait: false, reducedMotion: false, noteKeyboard: noop },
    screens: { current: null, calls: [], go(...args) { this.calls.push(args); }, back: noop },
    loading: { labels: [], show(label) { this.labels.push(label); }, hide: noop, setProgress: noop, showError(message, opts) { this.error = { message, opts }; } },
    audio: { play: noop },
    dialog: { resolve: null },
    loadCharacter(id, onProgress) {
      loads.push(id);
      onProgress?.(1, 1);
      return Promise.resolve(spritesFor(id));
    },
    getSprites: spritesFor,
    resetCharacter: noop,
  };
  app.nav = new MenuNavigator(app);
  return { app, loads };
}

async function enterPractice() {
  const { app, loads } = fakeApp();
  const screen = new PracticeGroundScreen(app);
  app.screens.current = screen;
  await screen.enter();
  return { app, screen, loads };
}

const labels = (root) => root.querySelectorAll('[data-nav]').map((b) => b.textContent);
const slotFor = (screen, id) => screen.roster.slots.find((s) => s._def?.id === id);
const cpuSlotFor = (screen, id) => screen.cpuRoster.slots.find((s) => s._def?.id === id);
// The CPU is on from the start, so the menu offers Change CPU.
const PRACTICE_MENU = ['Change Fighter', 'Change CPU', 'Return'];
// Simulation steps in a Void respawn wait.
const RESPAWN_STEPS = Math.round(CONFIG.battle.respawnSeconds / DT);

// Practice with its default CPU disabled the player's way (the menu, the CPU
// dialog, Disable CPU), then resumed: solo practice.
async function enterSoloPractice() {
  const entered = await enterPractice();
  const { screen } = entered;
  screen.openMenu();
  screen.cpuBtn.click();
  screen.disableCpuBtn.click();
  screen.resume();
  assert.equal(screen.session.cpu, null);
  assert.equal(screen.isRunning, true);
  return entered;
}

// Through the Practice menu and the CPU dialog, like the player: puts `id`
// on the stage as the practice CPU and resumes.
async function enableCpu(screen, id = '9999') {
  screen.openMenu();
  screen.cpuBtn.click();
  cpuSlotFor(screen, id).click(0);
  await flush();
  return screen.session.cpu;
}

// A practice session on a fake canvas, with a CPU (#9999) by default. `run`
// feeds one input snapshot per step; `events` collects every hit the
// CombatSystem resolved and `numbers` every damage number that appeared.
function practiceSession({ cpu = true } = {}) {
  const input = fakeInput();
  const session = new PracticeSession({ canvas: new Element('canvas'), map: PRACTICE_MAP, def: DEF_0001, sprites: fakeSprites(), input });
  if (cpu) session.setCPU(DEF_9999, fakeSprites());
  const events = [];
  const numbers = [];
  const run = (held = {}, steps = 1) => {
    for (let i = 0; i < steps; i++) {
      // This step's input only, like held state: a fighter out of play
      // (waiting to respawn) reads none, and none is left queued for it.
      input.script.length = 0;
      input.script.push({ ...held });
      session.update(DT);
      events.push(...session.combat.events);
      numbers.push(...session.damageNumbers.filter((d) => d.age === 0));
    }
  };
  // Steps with no input until `pred` holds; fails instead of hanging.
  const until = (pred, limit = 600) => {
    for (let i = 0; i < limit && !pred(); i++) run();
    assert.ok(pred(), 'condition never reached');
  };
  return { session, input, run, until, events, numbers };
}

// ---- Home ---------------------------------------------------------------------

test('Home: Play, Practice Ground, then Discover; Practice Ground and Discover open directly', () => {
  const { app } = fakeApp();
  const home = new HomeScreen(app);
  const actions = home.el.querySelectorAll('.home-action');
  assert.equal(actions.length, 3);
  const [play, practice, discover] = actions;
  assert.ok(play.html.includes('<span>Play</span>'));
  assert.ok(practice.html.includes('<span>Practice Ground</span>'));
  assert.ok(discover.html.includes('<span>Discover</span>'));
  // Discover matches Practice Ground: the same outlined action and chevron.
  for (const action of [practice, discover]) {
    assert.ok(action.html.includes(ICONS.right), 'keeps the Home chevron');
    assert.equal(action.className, 'home-action');
    assert.equal(action.disabled, false);
    assert.equal(action.hasAttribute('data-nav'), true);
  }
  assert.ok(!home.el.querySelectorAll('.home-action').some((b) => b.html.includes('Help')));
  assert.deepEqual(app.nav.candidates(home.el), [play, practice, discover], 'keyboard / gamepad reach them, in order');
  assert.equal(home.el.querySelector('.home-actions').children.at(-1), discover, 'Discover sits directly under Practice Ground');

  practice.click();
  assert.deepEqual(app.screens.calls, [['practice']], 'no mode, fighter or stage select first');
  discover.click();
  assert.deepEqual(app.screens.calls[1], ['discover'], 'Discover opens the Discover screen');
  play.click();
  assert.deepEqual(app.screens.calls[2], ['mode'], 'Play still opens Select Mode');
});

// ---- Entering -----------------------------------------------------------------

test('a fresh entry always starts with #0001, whatever Quick Battle or an earlier visit chose', async () => {
  assert.equal(PRACTICE_DEFAULT_FIGHTER, '0001');
  const { app, loads } = fakeApp();
  app.selection.characterId = '9999';
  const screen = new PracticeGroundScreen(app);
  app.screens.current = screen;
  screen.characterId = '9999'; // as if an earlier visit swapped fighters
  await screen.enter();
  assert.deepEqual(loads, ['0001'], 'loaded through app.loadCharacter, once for both fighters');
  assert.deepEqual(app.loading.labels, ['Loading #0001']);
  assert.equal(screen.session.player.def.id, '0001');
  assert.equal(screen.session.cpu.def.id, '0001', 'the default CPU is the default fighter');
  assert.equal(screen.session.cpu.sprites, screen.session.player.sprites, 'sharing its one sprite set');
  assert.equal(screen.characterId, '0001');
  assert.equal(app.selection.characterId, '9999', 'Quick Battle\'s selection is untouched');
  // Control at once: no intro, countdown or lock.
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.session.player.inputLocked, false);
  assert.equal(screen.isRunning, true);
  assert.deepEqual(app.nav.scopes, []);
  const spawn = PRACTICE_MAP.spawnPoints[0];
  assert.equal(screen.session.player.body.x, spawn.x);
  assert.equal(screen.session.player.body.y, PRACTICE_MAP.mainStage.top);
});

test('a failed load uses the loading error, and Back returns Home', async () => {
  const { app } = fakeApp();
  app.loadCharacter = () => Promise.resolve({ usable: false });
  const screen = new PracticeGroundScreen(app);
  await screen.enter();
  assert.equal(screen.session, null);
  assert.match(app.loading.error.message, /#0001's sprite frames could not be loaded/);
  app.loading.error.opts.onBack();
  assert.deepEqual(app.screens.calls, [['home', {}, { reset: true }]]);
});

// ---- The solo simulation ------------------------------------------------------

test('Practice Ground starts with Player 1 and the default CPU: two fighters, paired and framed, and no AI', async () => {
  const { screen } = await enterPractice();
  const { session } = screen;
  const { player, cpu } = session;
  for (const key of ['infiniteEnergy', 'setInfiniteEnergy', 'refillEnergy', 'reviveCPU']) {
    assert.equal(key in session, false, `no ${key}`);
  }
  assert.equal(player.combat.knockback, 0);
  assert.equal(session.fighters.length, 2);
  assert.deepEqual(session.fighters, [player, cpu]);
  assert.ok(player.controller instanceof PlayerController);
  assert.equal(cpu.def.id, PRACTICE_DEFAULT_FIGHTER);
  assert.equal(cpu.controller, null, 'the training dummy: no controller');
  assert.deepEqual([cpu.slot, cpu.label], ['p2', 'CPU']);
  assert.equal(cpu.combat.knockback, 0);
  assert.deepEqual([cpu.body.x, cpu.facing], [PRACTICE_MAP.spawnPoints[1].x, -1]);
  assert.ok(session.fighters.every((f) => !(f.controller instanceof TrainingAIController)));
  assert.equal(player.opponent, cpu);
  assert.equal(cpu.opponent, player);
  assert.equal(session.primary, player);
  assert.equal(session.secondary, cpu, 'the camera\'s secondary fighter');
  for (let i = 0; i < 120; i++) screen.update(DT);
  assert.equal(aiInputs, 0, 'no TrainingAIController ever runs');
  for (const file of ['../js/game/practice.js', '../js/screens/practice-screen.js']) {
    assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes('TrainingAIController'), `${file} never imports the training CPU`);
  }
});

test('the session has no countdown, round, timer or result, and runs indefinitely', async () => {
  const { screen } = await enterPractice();
  const { session } = screen;
  for (const key of ['phase', 'timeLeft', 'round', 'result', 'roundSeconds']) {
    assert.equal(key in session, false, `no ${key}`);
  }
  // Far longer than a Quick Battle round.
  let frames = 0;
  const frame = session.frame.bind(session);
  session.frame = (dt) => { frames++; frame(dt); };
  for (let i = 0; i < 60 * 120; i++) screen.update(DT);
  assert.equal(frames, 60 * 120);
  assert.equal(screen.isRunning, true);
  assert.equal(screen.session, session);
});

test('the camera frames Player 1 and the CPU from the start, and the lone fighter once the CPU is disabled', async () => {
  const watch = (session) => {
    const calls = [];
    const { follow, snap } = session.camera;
    session.camera.follow = (...args) => { calls.push(['follow', ...args]); return follow.apply(session.camera, args); };
    session.camera.snap = (...args) => { calls.push(['snap', ...args]); return snap.apply(session.camera, args); };
    return calls;
  };
  const { screen } = await enterPractice();
  const { session } = screen;
  const calls = watch(session);
  screen.update(DT); // first update also sizes the view
  assert.deepEqual(calls.map(([kind, p, s]) => [kind, p, s]), [['snap', session.player, session.cpu], ['follow', session.player, session.cpu]]);

  const solo = (await enterSoloPractice()).screen;
  const soloCalls = watch(solo.session);
  solo.update(DT);
  assert.deepEqual(soloCalls.map(([kind, p, s]) => [kind, p === solo.session.player, s]), [['snap', true, null], ['follow', true, null]]);
});

test('moves that aim at an opponent fall back or miss with nobody there, without throwing', () => {
  const input = fakeInput();
  const session = new PracticeSession({ canvas: new Element('canvas'), map: PRACTICE_MAP, def: DEF_0001, sprites: fakeSprites(), input });
  const p = session.player;
  const run = (held, steps = 1) => {
    for (let i = 0; i < steps; i++) {
      input.script.push({ ...held });
      session.update(DT);
    }
  };
  const idle = (limit = 240) => {
    for (let i = 0; i < limit && (p.state !== 'idle' || p.technique || session.clones.length); i++) run({});
    assert.equal(p.state, 'idle');
  };

  // Charged BA1: no one to appear behind, so it is an ordinary BA1, free.
  run({ charge: true }, 10);
  assert.equal(p.state, 'charge');
  run({ charge: true, action1: true, action1Pressed: true });
  assert.equal(p.combat.attack?.def.id, 'ba1');
  assert.equal(session.clones.length, 0);
  assert.equal(p.combat.chargedCooldowns.active('ba1Clone'), false, 'no cooldown spent on a clone that cannot appear');
  idle();

  // Charged BA2: the Sphere Rush forms, dashes, finds nobody and misses.
  run({ charge: true }, 10);
  run({ charge: true, action2: true, action2Pressed: true });
  const rush = p.technique;
  assert.ok(rush, 'the Sphere Rush starts');
  idle();
  assert.equal(rush.endReason, 'miss');
  assert.equal(rush.target, null);

  // Throw: the shuriken flies, hits nothing and expires.
  run({ primary: true, primaryPressed: true });
  let seen = 0;
  for (let i = 0; i < 180; i++) {
    run({});
    seen = Math.max(seen, session.projectiles.length);
  }
  assert.equal(seen, 1);
  assert.equal(session.projectiles.length, 0);

  // Movement, jumping, both BAs in the air and Dodges still work alone.
  run({ right: true }, 30);
  assert.ok(p.body.x > PRACTICE_MAP.spawnPoints[0].x);
  run({ jump: true, jumpPressed: true });
  run({}, 8);
  assert.equal(p.body.grounded, false);
  run({ action2: true, action2Pressed: true });
  assert.equal(p.combat.attack?.def.id, 'midairBa2');
  idle();
  run({ defense: true, defensePressed: true });
  assert.equal(p.state, 'defense');
  idle();
  assert.equal(p.combat.knockback, 0, 'nothing ever hits the lone fighter');

  // Rendering with a sized view draws only this fighter (the fake canvas
  // records nothing, but every path must run without throwing).
  session.resize();
  session.debug = true;
  session.frame(DT);
});

test('no walls hold the fighter: it runs off either edge of the training block, falls, and the Void puts it back at its spawn 2 s later', () => {
  const input = fakeInput();
  const session = new PracticeSession({ canvas: new Element('canvas'), map: PRACTICE_MAP, def: DEF_0001, sprites: fakeSprites(), input });
  const p = session.player;
  const { left, right, top } = PRACTICE_MAP.mainStage;
  const [spawn] = PRACTICE_MAP.spawnPoints;
  for (const dir of ['left', 'right']) {
    let pastEdge = false;
    let fell = false;
    for (let i = 0; i < 60 * 10 && !p.lostToVoid; i++) {
      input.script.push({ [dir]: true });
      session.update(DT);
      const b = p.body;
      if (dir === 'left' ? b.x + b.halfW < left : b.x - b.halfW > right) pastEdge = true;
      if (b.y > top + 200) fell = true;
    }
    assert.ok(pastEdge, `ran clear past the ${dir} edge: no wall there`);
    assert.ok(fell, 'and fell below the block');
    assert.ok(p.lostToVoid, 'until the Void took it');
    input.script.length = 0;
    // Out of play for the whole wait, then back at its spawn, still.
    for (let i = 1; i < RESPAWN_STEPS; i++) {
      session.update(DT);
      assert.equal(p.lostToVoid, true, `still out after ${i} steps`);
    }
    session.update(DT);
    assert.equal(p.lostToVoid, false, 'back after exactly 2 s');
    assert.equal(session.player, p, 'the same fighter');
    assert.deepEqual([p.body.x, p.body.y, p.body.vx, p.body.vy, p.body.grounded], [spawn.x, top, 0, 0, true]);
  }
});

test('the Void never ends practice: a fighter in it is out for 2 s, then back at its spawn, and nothing keeps hold of or aims at it', () => {
  const { session, run, until } = practiceSession();
  const { player, cpu } = session;
  const v = PRACTICE_MAP.voidBounds;
  const { top } = PRACTICE_MAP.mainStage;
  const [p1Spawn, cpuSpawn] = PRACTICE_MAP.spawnPoints;
  // Player 1, a shuriken of its in flight, is carried just past the Void's
  // fixed line: its next step takes it out of play, its own shuriken gone.
  player.combat.knockback = 70;
  player.combat.chargedCooldowns.start('rasenRush', 5);
  player.combat.chargedCooldowns.start('ba1Clone', 2);
  run({ primary: true, primaryPressed: true });
  until(() => session.projectiles.length === 1);
  Object.assign(player.body, { x: v.left - 2, y: 1200, vx: -300, vy: 900, grounded: false, ground: null });
  run();
  assert.equal(player.lostToVoid, true);
  assert.deepEqual(session.inPlay, [cpu], 'out of play: not updated, hit or drawn');
  assert.deepEqual(session.cameraTargets, [cpu, null], 'the camera follows the CPU meanwhile');
  assert.deepEqual(session.projectiles, [], 'its shuriken went with it');
  assert.equal(player.combat.knockback, 70, 'its Knockback stays until it is back');
  for (const key of ['score', 'points']) assert.equal(key in session, false, `no ${key}: practice scores nothing`);
  // Two seconds later: back, still, in a fresh training state.
  run({}, RESPAWN_STEPS - 1);
  assert.equal(player.lostToVoid, true, 'not a step early');
  run();
  assert.equal(player.lostToVoid, false);
  assert.equal(session.player, player);
  assert.deepEqual(
    [player.body.x, player.body.y, player.body.vx, player.body.vy, player.body.grounded],
    [p1Spawn.x, top, 0, 0, true],
  );
  assert.equal(player.combat.attack, null, 'no attack survives it');
  assert.equal(player.combat.knockback, 0, 'a fresh 0');
  assert.equal(player.combat.chargedCooldowns.size, 0, 'charged cooldowns cleared: ready again');
  assert.equal(player.combat.stamina, player.combat.maxStamina, 'full stamina');
  assert.equal(player.combat.stun, 0);
  assert.equal(player.combat.hitstop, 0);
  assert.deepEqual(session.fighters, [player, cpu]);
  assert.equal(player.opponent, cpu);

  // The CPU, caught in Player 1's Sphere Rush, falls into the Void while
  // bound: the rush holding it ends, its damage numbers go, and 2 s later
  // it is back at its own spawn, free.
  run({}, 60);
  run({ charge: true }, 10);
  run({ charge: true, action2: true, action2Pressed: true });
  const rush = player.technique;
  until(() => rush.hitConfirmed, 120);
  run({}, 30); // the first tick: +1 over it
  assert.ok(cpu.combat.immobilized);
  assert.ok(session.damageNumbers.some((d) => d.target === cpu && d.text === '+1'));
  cpu.combat.knockback += 60;
  Object.assign(cpu.body, { y: v.bottom + cpu.body.height, grounded: false, ground: null });
  run();
  assert.equal(cpu.lostToVoid, true);
  assert.equal(player.technique, null, 'the rush holding it ended');
  assert.equal(rush.endReason, 'released');
  assert.equal(rush.target, null);
  assert.equal(cpu.combat.immobilized, false);
  assert.ok(!session.damageNumbers.some((d) => d.target === cpu));
  assert.equal(session.secondary, null, 'Player 1 framed alone meanwhile');
  run({}, RESPAWN_STEPS);
  assert.equal(cpu.lostToVoid, false);
  assert.deepEqual([cpu.body.x, cpu.body.y, cpu.body.grounded, cpu.facing], [cpuSpawn.x, top, true, cpuSpawn.facing]);
  assert.equal(cpu.combat.knockback, 0, 'the CPU back to 0 Knockback too');
  assert.deepEqual(session.fighters, [player, cpu]);
  run({}, 30);
  assert.equal(cpu.body.x, cpuSpawn.x, 'standing still again');
  // No tick from the ended rush ever reaches it.
  run({}, 120);
  assert.equal(cpu.combat.knockback, 0);
  // Practice simply carries on: Player 1 can fight the CPU again.
  assert.equal(session.cpu, cpu);
  assert.equal(player.canAct(), true);
});

test('Player 1 and the CPU each wait out their own 2 s when both fall in', () => {
  const { session, run } = practiceSession();
  const { player, cpu } = session;
  const v = PRACTICE_MAP.voidBounds;
  Object.assign(player.body, { y: v.bottom + 200, grounded: false, ground: null });
  run();
  run({}, 30);
  Object.assign(cpu.body, { y: v.bottom + 200, grounded: false, ground: null });
  run();
  assert.deepEqual([player.lostToVoid, cpu.lostToVoid], [true, true]);
  assert.deepEqual(session.inPlay, []);
  run({}, RESPAWN_STEPS - 32);
  assert.deepEqual([player.lostToVoid, cpu.lostToVoid], [true, true]);
  run();
  assert.deepEqual([player.lostToVoid, cpu.lostToVoid], [false, true], 'Player 1 first: it fell first');
  run({}, 30);
  assert.equal(cpu.lostToVoid, true, 'the CPU fell 31 steps later');
  run();
  assert.deepEqual([player.lostToVoid, cpu.lostToVoid], [false, false]);
  assert.deepEqual(session.inPlay, [player, cpu]);
});

// ---- HUD ------------------------------------------------------------------------

test('HUD: Player 1\'s card, the More button and the CPU\'s card; no score dots, round, timer, pause or cooldown rings', async () => {
  const { screen } = await enterPractice();
  const { hud, hudRoot } = screen;
  const { panel, cpuPanel } = hud;
  assert.deepEqual(hudRoot.children.map((c) => c === panel.wrap ? 'p1' : c === hud.moreButton ? 'more' : c === cpuPanel.wrap ? 'cpu' : '?'), ['p1', 'more', 'cpu']);
  for (const cls of ['.hud-center', '.hud-time', '.hud-timer', '.hud-round', '.hud-pause']) {
    assert.deepEqual(hudRoot.querySelectorAll(cls), [], `no ${cls}`);
  }
  assert.ok(!hudRoot.querySelectorAll('button').some((b) => b.html === ICONS.pause), 'no pause icon');
  assert.equal(hudRoot.querySelectorAll('.hud-side').length, 2);
  // Practice has no points: no score dots on either card.
  assert.deepEqual(hudRoot.querySelectorAll('.hud-score'), []);
  assert.deepEqual(hudRoot.querySelectorAll('.hud-dot'), []);
  // The same cards as Quick Battle's: portrait | name over Knockback. No
  // cooldown rings (they are under the fighters now), Health or Energy.
  for (const [card, tag, side] of [[panel, 'P1', 'hud-p1'], [cpuPanel, 'CPU', 'hud-p2']]) {
    assert.equal(card.wrap.hidden, false);
    assert.ok(card.root.classList.contains(side));
    assert.equal(card.root.children[0], card.portrait);
    assert.equal(card.root.children[1], card.divider);
    assert.equal(card.root.children[2], card.info);
    assert.equal(card.tag.textContent, tag);
    assert.equal(card.name.textContent, '#0001');
    assert.equal(card.knockback.getAttribute('aria-label'), 'Knockback');
    assert.equal(card.knockbackValue.textContent, '0');
    assert.equal(card.root.classList.contains('has-portrait'), false, 'the fake art has no portrait (and no crash)');
  }
  assert.equal(panel.portrait.dataset.facing, 'right', 'Player 1\'s portrait faces the centre');
  assert.equal(cpuPanel.portrait.dataset.facing, 'left', 'and so does the CPU\'s');
  assert.equal(cpuPanel.portrait.classList.contains('is-mirrored'), true);
  for (const cls of ['.hud-cooldowns', '.hud-cd', '.hud-cd-ring', '.hud-bar', '.hud-energy', '.hud-bar-fill', '.hud-energy-fill']) {
    assert.deepEqual(hudRoot.querySelectorAll(cls), [], `no ${cls}`);
  }
  assert.ok(!hudRoot.querySelectorAll('[aria-label]').some((n) => /health|energy/i.test(n.getAttribute('aria-label'))));
  assert.doesNotMatch(hudRoot.textContent, /energy/i);

  // Each card follows its own fighter's Knockback: the CPU's number moves
  // when it takes damage, alongside the floating "+N".
  const { player, cpu } = screen.session;
  player.combat.knockback = 40;
  cpu.combat.knockback = 17;
  hud.update(screen.session);
  assert.equal(panel.knockbackValue.textContent, '40');
  assert.equal(cpuPanel.knockbackValue.textContent, '17');
});

test('HUD: the CPU card follows real hits, rebinds when the CPU changes and goes when it is disabled', async () => {
  const { app, screen } = await enterPractice();
  const { hud, session } = screen;
  const cpuPanel = hud.cpuPanel;
  // Walk up to the CPU and hit it with BA1: its card reads 5.
  const step = (held = {}) => {
    app.input.script.push(held);
    session.update(DT);
    hud.update(session);
  };
  for (let i = 0; i < 300 && session.cpu.body.x - session.player.body.x > 60; i++) step({ right: true });
  for (let i = 0; i < 30; i++) step();
  step({ action1: true, action1Pressed: true });
  for (let i = 0; i < 30; i++) step();
  assert.equal(session.cpu.combat.knockback, 5);
  assert.equal(cpuPanel.knockbackValue.textContent, '5');
  assert.ok(session.damageNumbers.some((d) => d.text === '+5'), 'the floating number too');

  // Change CPU: the card is the new fighter's.
  const cpu = await enableCpu(screen, '9999');
  assert.equal(cpuPanel.name.textContent, '#9999');
  assert.equal(cpuPanel.knockbackValue.textContent, '0');
  assert.equal(hud.cpu, cpu);
  assert.equal(cpuPanel.wrap.hidden, false);

  // Disable CPU: the card goes cleanly; Player 1's stays.
  screen.openMenu();
  screen.cpuBtn.click();
  screen.disableCpuBtn.click();
  assert.equal(cpuPanel.wrap.hidden, true);
  assert.equal(hud.cpu, null);
  assert.equal(hud.panel.wrap.hidden, false);
  screen.resume();
  screen.update(DT);
  assert.equal(cpuPanel.wrap.hidden, true, 'and stays gone');
  // Enabling one again brings it back.
  await enableCpu(screen, '0001');
  assert.equal(cpuPanel.wrap.hidden, false);
  assert.equal(cpuPanel.name.textContent, '#0001');
});

test('the More button is a compact three-dots glass button labelled Practice menu', async () => {
  const { screen } = await enterPractice();
  const more = screen.hud.moreButton;
  assert.equal(more.tagName, 'BUTTON');
  assert.equal(more.getAttribute('type'), 'button');
  assert.equal(more.getAttribute('aria-label'), 'Practice menu');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.ok(more.classList.contains('glass'));
  assert.equal(more.html, ICONS.more);
  assert.equal(ICONS.more.match(/<circle /g).length, 3, 'three dots');
  assert.ok(ICONS.more.includes('aria-hidden="true"'));
});

test('layout: More sits in the HUD\'s centre column, a little below Quick Battle\'s timer, and the menu opens under it', () => {
  // Layout itself needs a real browser; this pins down the rules behind it.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
  };
  // The practice HUD keeps the battle HUD's three columns (P1 | centre |
  // CPU), so its centre column is where .hud-center sits in Quick Battle,
  // and both cards hug it from either side.
  assert.match(rule('.hud'), /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.equal(rule('.practice-hud'), null, 'no column override');
  assert.match(rule('.hud-fighter--p1'), /justify-self:\s*end/);
  assert.match(rule('.hud-fighter--p2'), /justify-self:\s*start/);
  assert.match(rule('.hud-fighter[hidden]'), /display:\s*none/, 'a hidden CPU card takes no room');
  const more = rule('.practice-more');
  assert.match(more, /justify-self:\s*center/);
  assert.match(more, /margin-top:\s*var\(--more-drop\)/);
  const drop = rule('.screen--practice').match(/--more-drop:\s*clamp\((\d+)px,\s*[\d.]+vh,\s*(\d+)px\)/);
  assert.ok(drop, 'a responsive drop');
  assert.deepEqual([Number(drop[1]), Number(drop[2])], [8, 14]);
  const menu = rule('.practice-menu-overlay');
  assert.match(menu, /place-items:\s*start center/);
  assert.match(menu, /var\(--more-drop\)\s*\+\s*var\(--more\)/, 'just under the lowered button');
  // Quick Battle's centre control is untouched.
  assert.match(rule('.hud-center'), /width:\s*clamp\(64px, 8\.4vw, 92px\)/);
});

// ---- Practice menu ------------------------------------------------------------

test('More freezes practice under a translucent menu: Change Fighter, Change CPU, Return (no Infinite Energy)', async () => {
  const { app, screen } = await enterPractice();
  let frames = 0;
  screen.session.frame = () => { frames++; };
  screen.hud.moreButton.click();

  const { menuOverlay } = screen;
  assert.equal(screen.menuOpen, true);
  assert.equal(menuOverlay.hidden, false);
  assert.equal(menuOverlay.getAttribute('role'), 'dialog');
  assert.equal(menuOverlay.getAttribute('aria-modal'), 'true');
  assert.ok(menuOverlay.children[0].classList.contains('glass'));
  assert.deepEqual(labels(menuOverlay), PRACTICE_MENU);
  assert.deepEqual(app.nav.candidates(menuOverlay), [screen.changeBtn, screen.cpuBtn, screen.returnBtn]);
  for (const hidden of ['Resume', 'Restart', 'Restart Battle', 'Help', 'Settings', 'Change Stage', 'Allow infinite energy', 'Revoke infinite energy']) {
    assert.ok(!labels(menuOverlay).includes(hidden), `no ${hidden}`);
  }
  assert.ok(!menuOverlay.textContent.match(/energy/i), 'no Energy anywhere in the menu');
  assert.equal('energyBtn' in screen, false);
  assert.equal('toggleInfiniteEnergy' in screen, false);
  // The shared menu-button look: Change Fighter green, CPU plain, Return
  // outlined.
  for (const b of [screen.cpuBtn]) {
    assert.equal(b.tagName, 'BUTTON');
    assert.ok(b.classList.contains('pause-btn-item'));
    assert.ok(!b.classList.contains('is-primary') && !b.classList.contains('is-outline-only'));
  }
  assert.equal(document.activeElement, screen.changeBtn);
  assert.deepEqual(app.nav.scopes, [screen.menuScope]);
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.equal(screen.hud.moreButton.getAttribute('aria-expanded'), 'true');
  assert.ok(screen.el.classList.contains('is-menu-open'));
  screen.update(DT);
  assert.equal(frames, 0, 'the simulation is frozen');

  // More again resumes.
  screen.hud.moreButton.click();
  assert.equal(screen.menuOpen, false);
  assert.equal(menuOverlay.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.hud.moreButton.getAttribute('aria-expanded'), 'false');
  assert.ok(app.input.flushes > 0, 'keys pressed in the menu are dropped');
  screen.update(DT);
  assert.equal(frames, 1);
});

test('Esc / P / gamepad Start open the menu; Esc / Back, P and Start close it; so does the dim', async () => {
  const { app, screen } = await enterPractice();
  app.input.key('Escape');
  assert.equal(screen.menuOpen, true, 'Esc opens');
  app.input.key('Escape');
  assert.equal(screen.menuOpen, false, 'Esc (menu Back) resumes');
  app.input.key('KeyP');
  assert.equal(screen.menuOpen, true, 'P opens');
  app.input.key('KeyP');
  assert.equal(screen.menuOpen, false, 'P resumes');

  app.nav.command('start');
  assert.equal(screen.menuOpen, true, 'Start opens');
  app.nav.command('start');
  assert.equal(screen.menuOpen, false, 'Start resumes');
  app.nav.command('start');
  app.nav.command('back');
  assert.equal(screen.menuOpen, false, 'gamepad Back resumes');

  screen.openMenu();
  screen.menuOverlay.children[0].click();
  assert.equal(screen.menuOpen, true, 'a press on the panel keeps it');
  screen.menuOverlay.click();
  assert.equal(screen.menuOpen, false, 'a press on the dim resumes');
  assert.deepEqual(app.nav.scopes, []);
});

test('the debug overlay key toggles the practice session\'s overlay', async () => {
  const { app, screen } = await enterPractice();
  app.input.key(CONFIG.debug.overlayKey);
  assert.equal(screen.session.debug, true);
  app.input.key(CONFIG.debug.overlayKey);
  assert.equal(screen.session.debug, false);
});

test('portrait lock and a hidden tab freeze practice behind the menu', async () => {
  const { app, screen } = await enterPractice();
  app.device.blockedPortrait = true;
  screen.onDeviceChange();
  assert.equal(screen.menuOpen, true);
  screen.resume();
  assert.equal(screen.menuOpen, true, 'stays frozen until landscape');
  app.device.blockedPortrait = false;
  screen.resume();
  assert.equal(screen.menuOpen, false);

  document.hidden = true;
  for (const fn of docListeners.get('visibilitychange')) fn();
  document.hidden = false;
  assert.equal(screen.menuOpen, true);
});

// ---- Change Fighter -----------------------------------------------------------

test('Change Fighter opens a large roster dialog over practice instead of navigating', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  screen.changeBtn.click();

  const { rosterOverlay } = screen;
  assert.deepEqual(app.screens.calls, [], 'no screen change');
  assert.equal(screen.rosterOpen, true);
  assert.equal(rosterOverlay.hidden, false);
  assert.equal(rosterOverlay.getAttribute('role'), 'dialog');
  assert.equal(rosterOverlay.getAttribute('aria-modal'), 'true');
  const titleId = rosterOverlay.getAttribute('aria-labelledby');
  const title = rosterOverlay.querySelectorAll('h2').find((h) => h.id === titleId);
  assert.equal(title.textContent, 'Change Fighter');
  assert.ok(screen.rosterDialog.classList.contains('glass'));
  assert.ok(rosterOverlay.contains(screen.roster.rosterPanel) && rosterOverlay.contains(screen.roster.previewPanel));

  // The menu stays open beneath, inert; focus is trapped in the dialog's scope.
  assert.equal(screen.menuOpen, true);
  assert.equal(screen.menuOverlay.inert, true);
  assert.equal(screen.hudRoot.inert, true);
  assert.deepEqual(app.nav.scopes, [screen.menuScope, screen.rosterScope]);
  assert.ok(!app.nav.candidates(rosterOverlay).includes(screen.changeBtn));
  screen.changeBtn.focus();
  assert.equal(document.activeElement, slotFor(screen, '0001'), 'nothing underneath takes focus');
  screen.hud.moreButton.click();
  assert.equal(screen.rosterOpen, true, 'More does nothing while the dialog is open');

  // The current fighter starts selected, previewed and focused.
  const current = slotFor(screen, '0001');
  assert.equal(document.activeElement, current);
  assert.ok(current.classList.contains('is-selected'));
  assert.equal(screen.roster.selectedId, '0001');
  assert.equal(screen.roster.name.textContent, '#0001');
});

test('the dialog shows the full configured roster; locked slots stay non-interactive', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  screen.openRoster();
  const { slots, grid } = screen.roster;
  assert.equal(slots.length, CONFIG.roster.totalSlots);
  assert.equal(grid.children.length, CONFIG.roster.totalSlots);
  const available = slots.filter((s) => s._def?.available);
  const locked = slots.filter((s) => !s._def?.available);
  assert.deepEqual(available.map((s) => s._def.id), ['0001', '9999']);
  assert.equal(locked.length, CONFIG.roster.totalSlots - 2);
  for (const s of locked) {
    assert.equal(s.tagName, 'DIV');
    assert.equal(s.hasAttribute('data-nav'), false);
    assert.ok(s.classList.contains('is-locked'));
  }
  for (const s of available) {
    assert.equal(s.tagName, 'BUTTON');
    assert.ok(s.hasAttribute('data-nav'));
  }
  const candidates = app.nav.candidates(screen.rosterOverlay);
  assert.ok(locked.every((s) => !candidates.includes(s)), 'locked slots stay out of navigation');
  assert.ok(available.every((s) => candidates.includes(s)));
  assert.ok(locked.every((s) => s.getAttribute('tabindex') === null), 'nor can Tab reach them');
});

test('Back from the dialog closes only the dialog and returns focus to Change Fighter', async () => {
  const { app, screen } = await enterPractice();
  const player = screen.session.player;
  screen.openMenu();
  screen.openRoster();
  slotFor(screen, '9999').click(); // pointer: selects, does not confirm
  assert.equal(screen.roster.selectedId, '9999');
  app.input.key('Escape');
  assert.equal(screen.rosterOpen, false);
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(screen.menuOpen, true, 'the menu stays');
  assert.equal(screen.menuOverlay.inert, false);
  assert.equal(document.activeElement, screen.changeBtn);
  assert.deepEqual(app.nav.scopes, [screen.menuScope]);
  assert.equal(screen.session.player, player, 'fighter unchanged');
  assert.equal(screen.characterId, '0001');

  // The header Back button does the same, and gamepad Back too.
  screen.openRoster();
  assert.equal(screen.roster.selectedId, '0001', 'reopening starts from the current fighter');
  screen.rosterDialog.querySelector('.btn-back').click();
  assert.equal(screen.rosterOpen, false);
  screen.openRoster();
  app.nav.command('back');
  assert.equal(screen.rosterOpen, false);
  app.nav.command('back');
  assert.equal(screen.menuOpen, false, 'Back from the menu resumes practice');
});

test('confirming a fighter swaps it in place and resumes practice', async () => {
  const { app, screen, loads } = await enterPractice();
  const { session } = screen;
  const input = app.input;
  const old = session.player;
  // Leave something of the old fighter behind: a Sphere Rush in progress,
  // a shuriken and a clone.
  for (let i = 0; i < 10; i++) { input.script.push({ charge: true }); session.update(DT); }
  input.script.push({ charge: true, action2: true, action2Pressed: true });
  session.update(DT);
  const rush = old.technique;
  assert.ok(rush);
  session.projectiles.push({ alive: true });
  session.clones.push({ alive: true });
  old.combat.knockback = 30;
  assert.ok(old.combat.chargedCooldowns.active('rasenRush'));

  screen.openMenu();
  screen.openRoster();
  slotFor(screen, '9999').click(0); // keyboard / gamepad activation confirms at once
  await flush();

  assert.equal(screen.session, session, 'the same practice session');
  assert.deepEqual(app.screens.calls, [], 'never leaves Practice Ground');
  assert.equal(loads.at(-1), '9999', 'loaded through app.loadCharacter');
  const p = session.player;
  assert.notEqual(p, old);
  assert.equal(p.def.id, '9999');
  assert.deepEqual(session.fighters, [p, session.cpu], 'the CPU stays');
  assert.ok(p.controller instanceof PlayerController);
  assert.equal(p.body.x, PRACTICE_MAP.spawnPoints[0].x);
  assert.equal(p.body.y, PRACTICE_MAP.mainStage.top);
  assert.equal(p.combat.knockback, 0, 'a fresh 0');
  assert.equal(p.combat.chargedCooldowns.size, 0, 'no charged cooldowns');
  assert.equal(p.technique, null);
  assert.equal(rush.phase, 'done', 'the old technique ended');
  assert.equal(rush.endReason, 'destroy');
  assert.deepEqual(session.projectiles, []);
  assert.deepEqual(session.clones, []);
  assert.equal(screen.hud.panel.name.textContent, '#9999');
  assert.equal(screen.hud.panel.knockbackValue.textContent, '0');
  assert.equal(screen.hud.cpuPanel.name.textContent, '#0001', 'the CPU card is unchanged');

  assert.equal(screen.rosterOpen, false);
  assert.equal(screen.menuOpen, false);
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(screen.menuOverlay.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.isRunning, true);

  assert.equal(screen.characterId, '9999');
  assert.equal(app.selection.characterId, '0001', 'Quick Battle\'s fighter is untouched');

  // Leaving and coming back starts from #0001 again.
  screen.exit();
  await screen.enter();
  assert.equal(screen.session.player.def.id, '0001');
});

test('a failed fighter load keeps the current fighter and the dialog', async () => {
  const { app, screen } = await enterPractice();
  const player = screen.session.player;
  screen.openMenu();
  screen.openRoster();
  app.loadCharacter = () => Promise.resolve({ usable: false });
  slotFor(screen, '9999').click(0);
  await flush();
  assert.match(app.loading.error.message, /#9999's sprite frames could not be loaded/);
  assert.equal(screen.session.player, player);
  assert.equal(screen.rosterOpen, true);
  assert.equal(screen.swapping, false);
  app.loading.error.opts.onBack();
  assert.equal(document.activeElement, slotFor(screen, '9999'), 'back to choosing');
});

// ---- Practice CPU ---------------------------------------------------------------

test('Enable CPU (once the CPU is disabled) opens a second shared roster in its own glass dialog, titled Select CPU, with no Disable CPU', async () => {
  const { app, screen } = await enterSoloPractice();
  screen.openMenu();
  assert.equal(screen.cpuBtn.textContent, 'Enable CPU');
  screen.cpuBtn.click();

  const overlay = screen.cpuRosterOverlay;
  assert.deepEqual(app.screens.calls, [], 'never leaves Practice Ground');
  assert.equal(screen.cpuRosterOpen, true);
  assert.equal(screen.rosterOpen, false, 'Change Fighter\'s dialog stays shut');
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.equal(overlay.getAttribute('aria-modal'), 'true');
  const titleId = overlay.getAttribute('aria-labelledby');
  assert.equal(titleId, 'practice-cpu-roster-title');
  const title = overlay.querySelectorAll('h2').find((h) => h.id === titleId);
  assert.equal(title.textContent, 'Select CPU');
  assert.equal(overlay.querySelector('.kicker').textContent, 'Practice Ground');

  // Another instance of the same roster, in the same large glass dialog.
  assert.ok(screen.cpuRoster instanceof FighterRoster);
  assert.notEqual(screen.cpuRoster, screen.roster);
  assert.ok(overlay.classList.contains('practice-roster-overlay'));
  for (const cls of ['practice-roster-dialog', 'glass']) assert.ok(screen.cpuRosterDialog.classList.contains(cls));
  assert.ok(overlay.contains(screen.cpuRoster.rosterPanel) && overlay.contains(screen.cpuRoster.previewPanel));
  assert.equal(screen.cpuRoster.slots.length, CONFIG.roster.totalSlots);
  assert.equal(screen.cpuRoster.selectedId, '0001');

  // No CPU yet, so nothing to disable.
  assert.equal(screen.disableCpuBtn.hidden, true);
  assert.equal(screen.disableCpuBtn.disabled, true);
  assert.ok(!app.nav.candidates(overlay).includes(screen.disableCpuBtn));

  // Frozen, input and touch off, the menu and HUD inert beneath, focus in
  // the dialog's own scope, starting on the player's fighter.
  assert.equal(screen.isRunning, false);
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.equal(screen.menuOpen, true);
  assert.equal(screen.menuOverlay.inert, true);
  assert.equal(screen.hudRoot.inert, true);
  assert.ok(screen.el.classList.contains('is-cpu-roster-open'));
  assert.deepEqual(app.nav.scopes, [screen.menuScope, screen.cpuRosterScope]);
  const candidates = app.nav.candidates(overlay);
  assert.ok(candidates.includes(screen.cpuRosterBack));
  assert.ok(!candidates.some((c) => screen.menuOverlay.contains(c) || screen.rosterOverlay.contains(c)));
  const current = cpuSlotFor(screen, '0001');
  assert.equal(document.activeElement, current);
  assert.equal(screen.cpuRoster.selectedId, '0001');
  screen.cpuBtn.focus();
  assert.equal(document.activeElement, current, 'nothing underneath takes focus');
  screen.hud.moreButton.click();
  app.input.key('KeyP');
  screen.openRoster();
  assert.equal(screen.cpuRosterOpen, true, 'More, P and Change Fighter do nothing meanwhile');
  assert.equal(screen.rosterOpen, false);
  assert.equal(screen.menuOpen, true);

  // Only this dialog's preview animates; the stage stays still.
  let previews = 0;
  let otherPreviews = 0;
  let frames = 0;
  screen.cpuRoster.update = () => { previews++; };
  screen.roster.update = () => { otherPreviews++; };
  screen.session.frame = () => { frames++; };
  screen.update(DT);
  assert.deepEqual([previews, otherPreviews, frames], [1, 0, 0]);
});

test('both Practice rosters keep unique ids and their own aria-labelledby links', async () => {
  const { screen } = await enterPractice();
  const ids = [];
  const collect = (n) => { if (n instanceof Element) { if (n.id) ids.push(n.id); n.children.forEach(collect); } };
  collect(screen.el);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
  assert.equal(screen.roster.name.id, 'practice-preview-name');
  assert.equal(screen.cpuRoster.name.id, 'practice-cpu-preview-name');
  assert.equal(screen.roster.previewPanel.getAttribute('aria-labelledby'), 'practice-preview-name');
  assert.equal(screen.cpuRoster.previewPanel.getAttribute('aria-labelledby'), 'practice-cpu-preview-name');
  assert.equal(screen.rosterOverlay.getAttribute('aria-labelledby'), 'practice-roster-title');
  assert.equal(screen.cpuRosterOverlay.getAttribute('aria-labelledby'), 'practice-cpu-roster-title');
  assert.equal(screen.cpuRosterTitle.id, 'practice-cpu-roster-title');
  assert.ok(!screen.rosterOverlay.contains(screen.cpuRoster.grid) && !screen.cpuRosterOverlay.contains(screen.roster.grid));
  // The More button keeps its contract.
  const more = screen.hud.moreButton;
  assert.equal(more.getAttribute('aria-label'), 'Practice menu');
  assert.equal(more.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
});

test('selecting a CPU loads it and puts it on the stage as a p2 / CPU training dummy facing Player 1', async () => {
  const { app, screen, loads } = await enterSoloPractice();
  const { session } = screen;
  const player = session.player;
  const cpu = await enableCpu(screen, '9999');

  assert.equal(loads.at(-1), '9999', 'loaded through app.loadCharacter');
  assert.equal(app.loading.labels.at(-1), 'Loading #9999');
  assert.deepEqual(app.screens.calls, []);
  assert.equal(screen.session, session, 'the same practice session');
  assert.ok(cpu instanceof Fighter);
  assert.equal(cpu.def.id, '9999');
  assert.equal(cpu.sprites, app.getSprites('9999'));
  assert.equal(cpu.slot, 'p2');
  assert.equal(cpu.label, 'CPU');
  assert.equal(cpu.controller, null, 'no controller at all: neutral input');
  assert.equal(session.player, player, 'Player 1 untouched');
  assert.deepEqual(session.fighters, [player, cpu]);
  assert.equal(player.opponent, cpu);
  assert.equal(cpu.opponent, player);
  assert.equal(session.primary, player);
  assert.equal(session.secondary, cpu);
  assert.equal(cpu.body.x, PRACTICE_MAP.spawnPoints[1].x);
  assert.equal(cpu.body.y, PRACTICE_MAP.mainStage.top);
  assert.equal(cpu.facing, -1, 'facing Player 1');
  assert.equal(cpu.combat.knockback, 0, 'a fresh CPU starts at 0');

  // The dialog and menu close and practice resumes; the menu now offers
  // Change CPU.
  assert.equal(screen.cpuRosterOpen, false);
  assert.equal(screen.cpuRosterOverlay.hidden, true);
  assert.equal(screen.menuOpen, false);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screen.isRunning, true);
  assert.equal(app.input.gameplayActive, true);
  assert.equal(screen.touch.enabled, true);
  assert.equal(screen.cpuBtn.textContent, 'Change CPU');
  assert.equal(app.selection.characterId, '0001', 'Quick Battle\'s selection is untouched');

  // Its own card on the right again, beside Player 1's.
  assert.equal(screen.hud.cpuPanel.wrap.hidden, false);
  assert.equal(screen.hud.cpuPanel.name.textContent, '#9999');
  assert.equal(screen.hud.cpuPanel.tag.textContent, 'CPU');
  assert.equal(screen.hud.panel.name.textContent, '#0001');

  // The Arena's own camera frames both: the CPU is the secondary fighter.
  const calls = [];
  const { follow, snap } = session.camera;
  session.camera.follow = (...args) => { calls.push(['follow', ...args]); return follow.apply(session.camera, args); };
  session.camera.snap = (...args) => { calls.push(['snap', ...args]); return snap.apply(session.camera, args); };
  screen.update(DT);
  assert.deepEqual(calls.map(([kind, p, s]) => [kind, p, s]), [['snap', player, cpu], ['follow', player, cpu]]);
  // Rendering both fighters, markers and the debug overlay runs cleanly.
  session.debug = true;
  session.frame(DT);
});

test('the practice CPU never acts on its own: no movement, jump, attack, charge, Defense or AI, however long it stands', async () => {
  const { app, screen } = await enterPractice();
  const cpu = await enableCpu(screen, '0001');
  const { session } = screen;
  const aiBefore = aiInputs;
  const spawnX = cpu.body.x;
  const states = new Set();
  for (let i = 0; i < 60 * 30; i++) {
    screen.update(DT);
    states.add(cpu.state);
    const c = cpu.combat;
    if (cpu.body.x !== spawnX || cpu.body.y !== PRACTICE_MAP.mainStage.top || !cpu.body.grounded || cpu.moveDir !== 0 ||
        c.attack || c.defenseAction || c.blocking || cpu.charging || cpu.technique || cpu.releases.length || cpu.summons.length) {
      assert.fail(`the CPU acted on step ${i}: ${cpu.state}`);
    }
  }
  assert.deepEqual([...states], ['idle']);
  assert.equal(cpu.combat.lastIntent, null, 'no combat button was ever pressed');
  assert.equal(cpu.combat.chargedCooldowns.size, 0);
  assert.equal(cpu.combat.cooldowns.size, 0);
  assert.deepEqual(session.projectiles, []);
  assert.deepEqual(session.clones, []);
  assert.equal(aiInputs, aiBefore, 'no training AI ever runs');

  // Player 1's input moves Player 1 only.
  const x = session.player.body.x;
  for (let i = 0; i < 30; i++) {
    app.input.script.push({ left: true });
    session.update(DT);
  }
  assert.ok(session.player.body.x < x);
  assert.equal(cpu.body.x, spawnX);
  assert.equal(cpu.facing, -1, 'still turned toward Player 1');
});

test('Player 1\'s attacks hit the CPU through the real CombatSystem, and it reacts like any fighter', () => {
  const { session, run, until, events, numbers } = practiceSession();
  const { player, cpu } = session;
  // Walk up to the CPU: pushboxes stop Player 1 at its side.
  for (let i = 0; i < 300 && cpu.body.x - player.body.x > 60; i++) run({ right: true });
  run({}, 30);
  const gap = cpu.body.x - player.body.x;
  assert.ok(gap >= (player.def.pushbox.width + cpu.def.pushbox.width) / 2 - 1 && gap < 60, `side by side (${gap})`);
  assert.equal(player.facing, 1);
  assert.equal(cpu.facing, -1);

  assert.equal(cpu.combat.knockback, 0);
  run({ action1: true, action1Pressed: true });
  until(() => events.length > 0, 30);
  const [hit] = events;
  assert.equal(hit.type, 'hit');
  assert.equal(hit.attacker, player);
  assert.equal(hit.target, cpu);
  assert.equal(hit.damage, player.attacks.ba1.damage);
  assert.deepEqual([hit.projectile, hit.summon, hit.technique], [null, null, null]);
  assert.equal(cpu.combat.knockback, hit.damage, 'its Knockback builds up');
  assert.ok(cpu.combat.stun > 0, 'hitstun');
  run(); // the reaction shows from the CPU's next update
  assert.equal(cpu.state, 'hitstun');
  assert.equal(cpu.animator.anim.key, 'hurt');
  // Its number, straight from the resolved event.
  assert.deepEqual(numbers.map((d) => [d.target, d.damage, d.text]), [[cpu, hit.damage, `+${hit.damage}`]]);
  assert.equal(numbers[0].text, '+5');
  // Knocked back, then idle again, never hitting back.
  const x = cpu.body.x;
  run({}, 40);
  assert.ok(cpu.body.x > x, 'knockback');
  assert.equal(cpu.state, 'idle');
  assert.equal(player.combat.knockback, 0);
  assert.equal(events.length, 1);
});

test('Player 1\'s BA2 launches the CPU straight up (High vertical Knockback), then gravity brings it down', () => {
  const { session, run, until, events, numbers } = practiceSession();
  const { player, cpu } = session;
  for (let i = 0; i < 300 && cpu.body.x - player.body.x > 60; i++) run({ right: true });
  run({}, 30);
  const groundY = cpu.body.y;
  const startX = cpu.body.x;
  assert.equal(cpu.grounded, true);

  run({ action2: true, action2Pressed: true });
  until(() => events.length > 0, 30);
  const [hit] = events;
  assert.equal(hit.type, 'hit');
  assert.equal(hit.target, cpu);
  assert.equal(hit.damage, player.attacks.ba2.damage);
  assert.equal(numbers[0].text, '+10');
  // At impact: launched upward, not pushed sideways, scaled by the 10 it
  // added (its Knockback affects its launch though Practice shows no panel
  // for it).
  assert.ok(cpu.body.vx === 0, 'no sideways push');
  assert.equal(cpu.combat.knockback, 10);
  assert.equal(cpu.body.vy, -player.attacks.ba2.knockback.y * 1.1);
  assert.equal(cpu.grounded, false);
  let top = groundY;
  for (let i = 0; i < 120 && !cpu.grounded; i++) {
    run();
    top = Math.min(top, cpu.body.y);
  }
  assert.ok(top < groundY, 'it left the ground');
  assert.equal(cpu.grounded, true, 'and came back down');
  assert.equal(cpu.body.y, groundY);
  assert.equal(cpu.body.x, startX, 'straight up and down');
  run({}, 40);
  assert.equal(cpu.state, 'idle');
  assert.equal(events.length, 1);
});

test('shuriken, clone and Sphere Rush hits on the CPU each float their own resolved damage', () => {
  // Throw: the shuriken flies from Player 1's spawn into the CPU.
  {
    const { session, run, until, events, numbers } = practiceSession();
    run({ primary: true, primaryPressed: true });
    until(() => events.length > 0, 120);
    const [hit] = events;
    assert.ok(hit.projectile, 'a projectile hit');
    assert.equal(hit.target, session.cpu);
    assert.equal(hit.damage, hit.projectile.def.damage);
    assert.deepEqual(numbers.map((d) => [d.damage, d.text]), [[1, '+1']]);
  }
  // Charged BA1: the clone appears behind the CPU (its cooldown started as
  // usual) and strikes it.
  {
    const { session, run, until, events, numbers } = practiceSession();
    const { player, cpu } = session;
    run({ charge: true }, 10);
    run({ charge: true, action1: true, action1Pressed: true });
    assert.equal(session.clones.length, 1);
    assert.equal(session.clones[0].target, cpu);
    assert.ok(player.combat.chargedCooldowns.active('ba1Clone'), 'its cooldown started');
    until(() => events.length > 0, 180);
    const [hit] = events;
    assert.equal(hit.summon, session.clones[0] ?? hit.summon);
    assert.ok(hit.summon);
    assert.equal(hit.attacker, player);
    assert.equal(hit.target, cpu);
    assert.deepEqual(numbers.map((d) => d.text), ['+5']);
  }
  // Charged BA2: the Sphere Rush catches the CPU, ticks +1 three times,
  // then explodes on it for +15.
  {
    const { session, run, until, events, numbers } = practiceSession();
    const { player, cpu } = session;
    run({ charge: true }, 10);
    run({ charge: true, action2: true, action2Pressed: true });
    const rush = player.technique;
    assert.ok(rush);
    until(() => rush.hitConfirmed, 120);
    assert.equal(rush.target, cpu);
    assert.ok(cpu.combat.immobilized, 'bound');
    until(() => !player.technique, 400);
    assert.ok(events.every((e) => e.technique === rush && e.target === cpu));
    const damages = events.map((e) => e.damage);
    assert.deepEqual(damages, [0, 1, 1, 1, 15]);
    // The contact adds nothing, so it floats nothing.
    assert.deepEqual(numbers.map((d) => d.text), ['+1', '+1', '+1', '+15']);
  }
});

test('damage numbers: positive "+N" red text over the CPU\'s head that follows it, stacks, and fades within a second', () => {
  assert.equal(formatDamage(5), '+5');
  assert.equal(formatDamage(15), '+15');
  assert.equal(formatDamage(1), '+1');
  assert.equal(formatDamage(2.5), '+2.5');
  assert.equal(formatDamage(4 * 0.2), '+0.8', 'no float noise');
  assert.equal(formatDamage(1 / 3), '+0.33');

  const { session, run, until, events } = practiceSession();
  const { player, cpu } = session;
  // Only hits on the CPU with damage count; several in one step all show,
  // stacked.
  session.combat.events.push(
    { type: 'hit', attacker: player, target: cpu, damage: 6 },
    { type: 'hit', attacker: player, target: player, damage: 9 },
    { type: 'block', attacker: player, target: cpu, damage: 0 },
    { type: 'hit', attacker: player, target: cpu, damage: 2.5 },
  );
  session.updateDamageNumbers(0);
  assert.deepEqual(session.damageNumbers.map((d) => [d.text, d.stack]), [['+6', 0], ['+2.5', 1]]);
  // Once a number has had a moment to rise, its row is free again.
  session.combat.events.length = 0;
  session.updateDamageNumbers(0.1);
  session.combat.events.push({ type: 'hit', attacker: player, target: cpu, damage: 4 });
  session.updateDamageNumbers(0);
  assert.deepEqual(session.damageNumbers.map((d) => [d.text, d.stack]), [['+6', 0], ['+2.5', 1], ['+4', 2]]);
  session.combat.events.length = 0;
  session.updateDamageNumbers(0.15);
  session.combat.events.push({ type: 'hit', attacker: player, target: cpu, damage: 8 });
  session.updateDamageNumbers(0);
  assert.deepEqual(session.damageNumbers.map((d) => [d.text, d.stack]), [['+6', 0], ['+2.5', 1], ['+4', 2], ['+8', 0]]);
  session.combat.events.length = 0;
  session.damageNumbers.length = 0;

  // A real hit, drawn on a sized 1280 x 720 canvas at a real art scale (the
  // fake art is 1 px tall), with both fighters in view.
  session.canvas.rect = { left: 0, top: 0, width: 1280, height: 720 };
  player.sprites.refArtHeight = 60;
  player.sprites.worldPerArt = player.def.visual.height / 60;
  session.resize();
  assert.ok(session.view.w > 600 && session.view.w < 1600, `a real view (${session.view.w} units wide)`);
  const drawn = [];
  session.ctx.fillText = (text, x, y) => drawn.push({ text, x, y, fill: session.ctx.fillStyle, alpha: session.ctx.globalAlpha });
  run({ primary: true, primaryPressed: true });
  until(() => events.length > 0, 120);
  const draw = () => {
    drawn.length = 0;
    session.render();
    return drawn.find((d) => d.text === '+1');
  };
  const first = draw();
  assert.ok(first, 'drawn');
  assert.match(first.fill, /^#ff/i, 'red');
  assert.equal(first.alpha, 1);
  const [x, tagTop] = session.markerAnchor(cpu);
  assert.equal(first.x, Math.round(x), 'centred over the CPU');
  assert.ok(first.y < tagTop, 'above its head and name tag');
  const tag = drawn.find((d) => d.text === 'CPU');
  assert.ok(tag && first.y < tag.y, 'above the CPU label');
  // It follows the CPU as it moves.
  cpu.renderX += 50;
  const moved = draw();
  assert.equal(moved.x, Math.round(session.markerAnchor(cpu)[0]));
  assert.ok(moved.x > first.x);
  cpu.renderX -= 50;
  // It rises, fades and is gone within about a second.
  let steps = 0;
  while (session.damageNumbers.length && steps < 120) { run(); steps++; }
  assert.ok(steps >= 0.6 * 60 && steps <= 1.0 * 60, `lasts ${steps} steps`);
  session.damageNumbers.push({ target: cpu, damage: 1, text: '+1', age: 0.7, stack: 0 });
  const late = draw();
  assert.ok(late.y < first.y, 'drifted up');
  assert.ok(late.alpha < 1, 'fading');
});

test('the CPU is never knocked out: at any Knockback it keeps taking hits, with nothing to revive', () => {
  const { session, run, until, events, numbers } = practiceSession();
  const { cpu } = session;
  cpu.combat.knockback = 500;
  run({ primary: true, primaryPressed: true });
  until(() => events.length > 0, 120);
  assert.equal(cpu.combat.knockback, 501);
  assert.equal(numbers.at(-1).text, '+1', 'the number is what the hit added');
  until(() => cpu.combat.stun <= 0 && cpu.combat.hitstop <= 0, 120);
  assert.equal(cpu.canAct(), true, '500 Knockback never stops it');
  // ...and can be hit again.
  run({}, 30);
  run({ primary: true, primaryPressed: true });
  until(() => events.length > 1, 120);
  assert.equal(events[1].target, cpu);
  assert.equal(cpu.combat.knockback, 502);
});

test('Change CPU replaces the CPU in place and leaves Player 1 alone', async () => {
  const { app, screen, loads } = await enterPractice();
  const { session } = screen;
  const old = await enableCpu(screen, '9999');
  const player = session.player;
  player.combat.knockback = 50;
  old.combat.knockback = 40;
  session.damageNumbers.push({ target: old, damage: 5, text: '+5', age: 0, stack: 0 });

  screen.openMenu();
  assert.equal(screen.cpuBtn.textContent, 'Change CPU');
  screen.cpuBtn.click();
  assert.equal(screen.cpuRosterTitle.textContent, 'Change CPU');
  assert.equal(screen.cpuRoster.selectedId, '9999', 'the current CPU starts selected');
  assert.equal(document.activeElement, cpuSlotFor(screen, '9999'));

  // Disable CPU: a real button right beside Back, reachable by keys and pads.
  const disable = screen.disableCpuBtn;
  assert.equal(disable.tagName, 'BUTTON');
  assert.equal(disable.getAttribute('type'), 'button');
  assert.equal(disable.textContent, 'Disable CPU');
  assert.equal(disable.hidden, false);
  assert.equal(disable.disabled, false);
  assert.ok(disable.hasAttribute('data-nav'));
  assert.deepEqual(disable.parentNode.children, [screen.cpuRosterBack, disable]);
  assert.ok(app.nav.candidates(screen.cpuRosterOverlay).includes(disable));
  screen.cpuRosterBack.rect = { left: 0, top: 0, width: 90, height: 40 };
  disable.rect = { left: 100, top: 0, width: 120, height: 40 };
  screen.cpuRosterBack.focus();
  app.nav.command('right');
  assert.equal(document.activeElement, disable);

  cpuSlotFor(screen, '0001').click(0);
  await flush();
  const cpu = session.cpu;
  assert.equal(loads.at(-1), '0001');
  assert.notEqual(cpu, old);
  assert.equal(cpu.def.id, '0001');
  assert.equal(cpu.label, 'CPU');
  assert.equal(cpu.body.x, PRACTICE_MAP.spawnPoints[1].x);
  assert.equal(cpu.combat.knockback, 0, 'the new CPU starts at 0');
  assert.equal(session.player, player, 'Player 1 untouched');
  assert.equal(player.combat.knockback, 50);
  assert.deepEqual(session.fighters, [player, cpu]);
  assert.equal(player.opponent, cpu);
  assert.equal(cpu.opponent, player);
  assert.equal(old.opponent, null);
  assert.equal(session.secondary, cpu);
  assert.deepEqual(session.damageNumbers, [], 'the old CPU\'s numbers go with it');
  assert.equal(screen.menuOpen, false);
  assert.equal(screen.cpuBtn.textContent, 'Change CPU');
});

test('Disable CPU removes the CPU and every reference to it, then waits, frozen, in the menu', async () => {
  const { app, screen } = await enterPractice();
  const { session } = screen;
  const input = app.input;
  const cpu = await enableCpu(screen, '9999');
  const player = session.player;
  // Catch the CPU in a Sphere Rush (bound, the sphere on it, a number over
  // it), with a clone summoned at it and a shuriken of Player 1's in flight.
  for (let i = 0; i < 10; i++) { input.script.push({ charge: true }); session.update(DT); }
  input.script.push({ charge: true, action2: true, action2Pressed: true });
  session.update(DT);
  const rush = player.technique;
  for (let i = 0; i < 120 && !rush.hitConfirmed; i++) session.update(DT);
  for (let i = 0; i < 30; i++) session.update(DT); // its first tick
  assert.equal(rush.target, cpu);
  assert.ok(cpu.combat.isBoundBy(rush));
  assert.equal(session.damageNumbers.length, 1);
  const stray = { alive: true, owner: player, target: cpu };
  const shuriken = { alive: true, owner: player };
  session.clones.push(stray);
  session.projectiles.push(shuriken);

  screen.openMenu();
  screen.cpuBtn.click();
  let frames = 0;
  session.frame = () => { frames++; };
  let renders = 0;
  const render = session.render.bind(session);
  session.render = () => { renders++; render(); };
  screen.disableCpuBtn.click();

  assert.equal(session.cpu, null);
  assert.deepEqual(session.fighters, [player]);
  assert.equal(session.secondary, null);
  assert.equal(player.opponent, null);
  assert.equal(cpu.opponent, null);
  assert.equal(player.technique, null, 'the technique holding the CPU ends');
  assert.equal(rush.endReason, 'released');
  assert.equal(rush.target, null);
  assert.equal(cpu.combat.immobilized, false);
  assert.ok(!session.clones.includes(stray), 'the clone aimed at it goes');
  assert.ok(session.projectiles.includes(shuriken), 'Player 1\'s shuriken flies on');
  assert.deepEqual(session.damageNumbers, []);
  const refs = [
    ...session.fighters.flatMap((f) => [f, f.opponent, f.technique?.target]),
    ...session.fighters.flatMap((f) => f.summons.map((s) => s.target)),
    ...session.clones.flatMap((c) => [c.owner, c.target]),
    ...session.projectiles.map((p) => p.owner),
  ];
  assert.ok(!refs.includes(cpu), 'nothing refers to the CPU');
  session.clones.length = 0; // the stand-ins above have no art to draw
  session.projectiles.length = 0;

  // Back in the menu, still frozen, on Enable CPU; the still stage redrawn.
  assert.equal(screen.cpuRosterOpen, false);
  assert.equal(screen.cpuRosterOverlay.hidden, true);
  assert.equal(screen.menuOpen, true);
  assert.equal(screen.menuOverlay.inert, false);
  assert.equal(screen.hudRoot.inert, false);
  assert.deepEqual(app.nav.scopes, [screen.menuScope]);
  assert.equal(screen.cpuBtn.textContent, 'Enable CPU');
  assert.equal(document.activeElement, screen.cpuBtn);
  assert.equal(screen.isRunning, false);
  assert.equal(input.gameplayActive, false);
  assert.equal(renders, 1);
  screen.update(DT);
  assert.equal(frames, 0, 'paused until the player resumes');

  // Opening the dialog again: Select CPU, and no Disable CPU.
  screen.cpuBtn.click();
  assert.equal(screen.cpuRosterTitle.textContent, 'Select CPU');
  assert.equal(screen.disableCpuBtn.hidden, true);
  screen.disableCpuBtn.click();
  assert.equal(screen.cpuRosterOpen, true, 'a hidden, disabled button does nothing');
  screen.cpuRosterBack.click();

  // Solo practice again: a Charged BA1 is an ordinary BA1, for free, and the
  // camera follows Player 1 alone.
  session.frame = Object.getPrototypeOf(session).frame.bind(session);
  screen.resume();
  assert.equal(screen.isRunning, true);
  for (let i = 0; i < 90 && (player.state !== 'idle' || player.technique); i++) session.update(DT);
  for (let i = 0; i < 10; i++) { input.script.push({ charge: true }); session.update(DT); }
  input.script.push({ charge: true, action1: true, action1Pressed: true });
  session.update(DT);
  assert.equal(player.combat.attack?.def.id, 'ba1');
  assert.deepEqual(session.clones, []);
  assert.equal(player.combat.chargedCooldowns.active('ba1Clone'), false);
  const calls = [];
  const { follow } = session.camera;
  session.camera.follow = (...args) => { calls.push(args); return follow.apply(session.camera, args); };
  screen.update(DT);
  assert.deepEqual(calls.map(([p, s]) => [p, s]), [[player, null]]);
});

test('Back, Esc and gamepad Back leave the CPU dialog for the menu without changing anything', async () => {
  const { app, screen } = await enterPractice();
  const { session } = screen;
  const initial = session.cpu;
  assert.equal(screen.cpuRosterBack.getAttribute('aria-label'), 'Back to practice menu');
  screen.openMenu();
  screen.cpuBtn.click();
  cpuSlotFor(screen, '9999').click(); // pointer: selects, does not confirm
  assert.equal(screen.cpuRoster.selectedId, '9999');
  app.input.key('Escape');
  assert.equal(screen.cpuRosterOpen, false);
  assert.equal(screen.cpuRosterOverlay.hidden, true);
  assert.equal(screen.menuOpen, true, 'the menu stays');
  assert.equal(document.activeElement, screen.cpuBtn);
  assert.deepEqual(app.nav.scopes, [screen.menuScope]);
  assert.equal(session.cpu, initial, 'the same default CPU');
  assert.equal(initial.def.id, '0001');

  screen.cpuBtn.click();
  screen.cpuRosterBack.click();
  assert.equal(screen.cpuRosterOpen, false);
  screen.cpuBtn.click();
  app.nav.command('back');
  assert.equal(screen.cpuRosterOpen, false);
  assert.equal(document.activeElement, screen.cpuBtn);

  // With a CPU: backing out keeps it.
  const cpu = await enableCpu(screen, '9999');
  screen.openMenu();
  screen.cpuBtn.click();
  cpuSlotFor(screen, '0001').click();
  app.nav.command('back');
  assert.equal(session.cpu, cpu);
  assert.deepEqual(session.fighters, [session.player, cpu]);
  app.nav.command('back');
  assert.equal(screen.menuOpen, false, 'Back from the menu resumes practice');
});

test('the new menu items take part in keyboard / gamepad navigation', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  const items = [screen.changeBtn, screen.cpuBtn, screen.returnBtn];
  items.forEach((b, i) => { b.rect = { left: 0, top: i * 50, width: 280, height: 44 }; });
  const visited = [document.activeElement];
  for (let i = 0; i < 2; i++) {
    app.nav.command('down');
    visited.push(document.activeElement);
  }
  assert.deepEqual(visited, items);
  app.nav.command('up');
  assert.equal(document.activeElement, screen.cpuBtn);
  app.nav.command('confirm');
  assert.equal(screen.cpuRosterOpen, true, 'confirm opens the CPU dialog');
});

test('a failed CPU load keeps the current CPU (or none) and the CPU dialog', async () => {
  const { app, screen } = await enterSoloPractice();
  const { session } = screen;
  const load = app.loadCharacter;
  screen.openMenu();
  screen.cpuBtn.click();
  app.loadCharacter = () => Promise.resolve({ usable: false });
  cpuSlotFor(screen, '9999').click(0);
  await flush();
  assert.match(app.loading.error.message, /#9999's sprite frames could not be loaded/);
  assert.equal(session.cpu, null, 'still no CPU');
  assert.deepEqual(session.fighters, [session.player]);
  assert.equal(screen.cpuRosterOpen, true);
  assert.equal(screen.cpuSwapping, false);
  assert.equal(screen.isRunning, false);
  app.loading.error.opts.onBack();
  assert.equal(document.activeElement, cpuSlotFor(screen, '9999'), 'back to choosing');
  assert.equal(screen.cpuBtn.textContent, 'Enable CPU');

  // With a CPU, a failed replacement keeps it.
  app.loadCharacter = load;
  cpuSlotFor(screen, '9999').click(0);
  await flush();
  const cpu = session.cpu;
  assert.ok(cpu);
  screen.openMenu();
  screen.cpuBtn.click();
  app.loadCharacter = () => Promise.resolve({ usable: false });
  cpuSlotFor(screen, '0001').click(0);
  await flush();
  assert.equal(session.cpu, cpu);
  assert.deepEqual(session.fighters, [session.player, cpu]);
  assert.equal(screen.cpuRosterOpen, true);
  assert.equal(screen.disableCpuBtn.hidden, false);
});

test('leaving while CPU art is still loading never touches the old session', async () => {
  const { app, screen } = await enterPractice();
  const session = screen.session;
  const initial = session.cpu;
  screen.openMenu();
  screen.cpuBtn.click();
  let resolve;
  app.loadCharacter = () => new Promise((r) => { resolve = r; });
  cpuSlotFor(screen, '9999').click(0);
  assert.equal(screen.cpuSwapping, true);
  assert.equal(screen.isRunning, false);
  screen.exit();
  assert.equal(screen.cpuSwapping, false);
  assert.equal(screen.cpuRosterOpen, false);
  assert.equal(screen.cpuRosterOverlay.hidden, true);
  assert.deepEqual(app.nav.scopes, []);
  resolve(fakeSprites());
  await flush();
  assert.equal(screen.session, null);
  assert.equal(session.cpu, initial, 'never swapped for the late #9999');
  assert.deepEqual(session.fighters, []);
});

test('changing Player 1\'s fighter keeps the CPU, rewired to the new fighter', async () => {
  const { app, screen } = await enterPractice();
  const { session } = screen;
  const input = app.input;
  const cpu = await enableCpu(screen, '9999');
  const old = session.player;
  // The old fighter's Sphere Rush holds the CPU.
  for (let i = 0; i < 10; i++) { input.script.push({ charge: true }); session.update(DT); }
  input.script.push({ charge: true, action2: true, action2Pressed: true });
  session.update(DT);
  const rush = old.technique;
  for (let i = 0; i < 120 && !rush.hitConfirmed; i++) session.update(DT);
  assert.ok(cpu.combat.isBoundBy(rush));

  screen.openMenu();
  screen.openRoster();
  slotFor(screen, '9999').click(0);
  await flush();
  const p = session.player;
  assert.notEqual(p, old);
  assert.equal(p.def.id, '9999');
  assert.equal(session.cpu, cpu, 'the same CPU');
  assert.equal(cpu.def.id, '9999');
  assert.deepEqual(session.fighters, [p, cpu]);
  assert.equal(p.opponent, cpu);
  assert.equal(cpu.opponent, p);
  assert.equal(old.opponent, null);
  assert.equal(session.secondary, cpu);
  assert.equal(rush.endReason, 'destroy');
  assert.equal(cpu.combat.immobilized, false, 'released');
  assert.deepEqual(session.projectiles, []);
  assert.deepEqual(session.clones, []);
  assert.equal(screen.cpuBtn.textContent, 'Change CPU');
  assert.equal(screen.hud.panel.name.textContent, '#9999');
  assert.equal(app.selection.characterId, '0001');
});

// ---- Charged cooldowns and the Void ------------------------------------------

test('a Practice Void respawn is a fresh training state: 0 Knockback, full stamina and both charged abilities ready again', () => {
  const { session, run, until } = practiceSession();
  const { player } = session;
  // Use both charged abilities for real.
  run({ charge: true }, 10);
  run({ charge: true, action1: true, action1Pressed: true });
  run({ charge: true }, 2);
  run({ charge: true, action2: true, action2Pressed: true });
  const cd = player.combat.chargedCooldowns;
  assert.ok(cd.active('ba1Clone') && cd.active('rasenRush'));
  until(() => !player.technique, 400);
  player.combat.knockback = 88;
  player.combat.spendStamina(100);
  assert.equal(player.combat.staminaExhausted, true);
  Object.assign(player.body, { x: PRACTICE_MAP.voidBounds.right + 20, grounded: false, ground: null });
  run();
  assert.equal(player.lostToVoid, true);
  assert.equal(player.combat.knockback, 88, 'kept through the wait');
  run({}, RESPAWN_STEPS);
  assert.equal(player.lostToVoid, false);
  assert.equal(player.combat.knockback, 0);
  assert.equal(player.combat.stamina, player.combat.maxStamina, 'stamina full');
  assert.equal(player.combat.staminaExhausted, false, 'and no longer exhausted');
  assert.equal(cd === player.combat.chargedCooldowns ? cd.size : player.combat.chargedCooldowns.size, 0);
  assert.equal(player.combat.chargedCooldowns.active('ba1Clone'), false);
  assert.equal(player.combat.chargedCooldowns.active('rasenRush'), false);
  // Ready at once: the next Charged BA2 starts.
  run({ charge: true }, 10);
  run({ charge: true, action2: true, action2Pressed: true });
  assert.ok(player.technique, 'Charged BA2 is ready again');
});

// ---- Fresh visits ---------------------------------------------------------------

test('a fresh visit starts with the default CPU again and a fresh 0-Knockback fighter, whatever the last visit left', async () => {
  const { app, screen, loads } = await enterPractice();
  await enableCpu(screen, '9999');
  screen.session.player.combat.knockback = 42;
  screen.session.player.combat.chargedCooldowns.start('ba1Clone', 5);
  // The last visit ends with the CPU disabled: that is never remembered.
  screen.openMenu();
  screen.cpuBtn.click();
  screen.disableCpuBtn.click();
  assert.equal(screen.session.cpu, null);

  screen.exit();
  const before = loads.length;
  await screen.enter();
  const { session } = screen;
  assert.deepEqual(loads.slice(before), ['0001'], 'one load for both');
  assert.ok(session.cpu, 'the CPU is back');
  assert.equal(session.cpu.def.id, '0001');
  assert.equal(session.player.combat.knockback, 0);
  assert.equal(session.player.combat.chargedCooldowns.size, 0);
  assert.deepEqual(session.fighters, [session.player, session.cpu]);
  assert.equal(session.player.def.id, '0001');
  assert.equal(session.secondary, session.cpu);
  assert.equal(screen.hud.cpuPanel.wrap.hidden, false);
  assert.equal(screen.hud.cpuPanel.name.textContent, '#0001');
  screen.openMenu();
  assert.deepEqual(labels(screen.menuOverlay), PRACTICE_MENU);
  screen.cpuBtn.click();
  assert.equal(screen.cpuRosterTitle.textContent, 'Change CPU');
  assert.equal(screen.disableCpuBtn.hidden, false, 'disabling it still works');
  screen.disableCpuBtn.click();
  assert.equal(screen.session.cpu, null);
  assert.equal(app.selection.characterId, '0001', 'nothing of Practice reaches Quick Battle');
});

// ---- Leaving ------------------------------------------------------------------

test('Return goes Home, and leaving cleans up the session, input, scopes and listeners', async () => {
  const { app, screen } = await enterPractice();
  assert.equal(app.input.listeners.size, 2, 'menu navigator + practice keys');
  assert.equal(ResizeObserver.live.has(screen.resizeObserver), true);
  const session = screen.session;
  const player = session.player;
  screen.openMenu();
  screen.returnBtn.click();
  assert.deepEqual(app.screens.calls, [['home', {}, { reset: true }]]);

  screen.exit(); // the screen manager's swap
  assert.equal(screen.session, null);
  assert.deepEqual(session.fighters, []);
  assert.equal(player.technique, null);
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screen.menuOpen, false);
  assert.equal(screen.rosterOpen, false);
  assert.equal(screen.cpuRosterOpen, false);
  assert.equal(app.input.gameplayActive, false);
  assert.equal(screen.touch.enabled, false);
  assert.equal(app.input.listeners.size, 1, 'practice key listener removed');
  assert.equal(ResizeObserver.live.has(screen.resizeObserver), false);
  assert.equal(docListeners.get('visibilitychange')?.has(screen.onVisibility) ?? false, false);
  screen.update(DT); // nothing runs underneath Home
});

test('leaving while the fighter dialog is open closes everything', async () => {
  const { app, screen } = await enterPractice();
  screen.openMenu();
  screen.openRoster();
  screen.exit();
  assert.deepEqual(app.nav.scopes, []);
  assert.equal(screen.rosterOverlay.hidden, true);
  assert.equal(screen.menuOverlay.inert, false);
  assert.equal(screen.hudRoot.inert, false);
});

// ---- Stage --------------------------------------------------------------------

test('the training stage is its own map, outside MAPS and so outside Select Stage', () => {
  assert.deepEqual(MAPS.map((m) => m.id), ['desert', 'city']);
  assert.ok(!MAPS.includes(PRACTICE_MAP));
  assert.equal(getMap('practice'), null);
  assert.equal(PRACTICE_MAP.theme, 'practice');
  assert.deepEqual(PRACTICE_MAP.platforms, []);
  assert.deepEqual(PRACTICE_MAP.solids, []);
  // Player 1's spawn, then the CPU's: as far apart as Quick Battle's two
  // starting fighters, each facing the other.
  assert.equal(PRACTICE_MAP.spawnPoints.length, 2);
  const { left, right, top } = PRACTICE_MAP.mainStage;
  assert.ok(right - left >= 1200 && right - left <= 1500, 'a compact training block');
  // The Void a short way past its edges (room to recover), a little below
  // it and well above it (see platform-stage.test.mjs).
  const v = PRACTICE_MAP.voidBounds;
  assert.ok(v.left <= left - 250 && v.left >= left - 400 && v.right >= right + 250 && v.right <= right + 400);
  assert.ok(v.bottom >= top + 300 && v.bottom <= top + 450 && v.top < top - 400);
  const [p1, cpu] = PRACTICE_MAP.spawnPoints;
  assert.deepEqual(p1, { x: 2000, facing: 1 }, 'Player 1\'s spawn is unchanged');
  for (const { x } of [p1, cpu]) assert.ok(x > left && x < right);
  const gap = cpu.x - p1.x;
  assert.ok(gap >= 300 && gap <= 340, `CPU ${gap} units to the right`);
  for (const map of MAPS) {
    const [a, b] = map.spawnPoints;
    assert.ok(Math.abs(Math.abs(b.x - a.x) - gap) <= 40, `about ${map.name}'s spawn gap`);
  }
  assert.equal(cpu.facing, -1, 'the CPU faces Player 1');
});

test('the practice theme is registered and draws without building paths each frame', () => {
  const theme = createTheme(PRACTICE_MAP, {});
  assert.ok(theme instanceof PracticeTheme);
  assert.equal(theme.shadow.skew, 0);
  const ctx = fakeContext();
  const before = path2dCount;
  for (const x of [0, 1500, 4000 - 960]) {
    const view = { ctx, x, y: 480, w: 960, h: 540, scale: 1.333, pxW: 1280, pxH: 720 };
    theme.prepare(view);
    theme.update(DT, view);
    theme.drawBackground(ctx, view);
    theme.drawTerrain(ctx, view);
    theme.drawForeground(ctx, view);
  }
  assert.equal(path2dCount, before);
});

// ---- Quick Battle is unchanged --------------------------------------------------

test('Quick Battle still creates its AI CPU, round intro, 99-second timer and two-panel HUD, with none of Practice\'s rules', () => {
  const input = fakeInput();
  const battle = new Battle({
    canvas: new Element('canvas'), map: getMap('desert'),
    p1Def: DEF_0001, p2Def: DEF_0001, p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input,
  });
  assert.equal(battle.fighters.length, 2);
  assert.ok(battle.p1.controller instanceof PlayerController);
  assert.ok(battle.p2.controller instanceof TrainingAIController);
  assert.equal(battle.p2.label, 'CPU');
  assert.equal(battle.p1.opponent, battle.p2);
  assert.equal(battle.secondary, battle.p2);
  assert.equal(battle.phase, 'intro');
  assert.equal(battle.round, 1);
  assert.equal(battle.timeLeft, CONFIG.battle.roundSeconds);
  assert.equal(battle.p1.inputLocked, true, 'locked through the intro');
  for (let i = 0; i < Math.ceil(CONFIG.battle.introSeconds * 60) + 60; i++) battle.update(DT);
  assert.equal(battle.phase, 'fight');
  assert.ok(battle.timeLeft < CONFIG.battle.roundSeconds);
  // None of Practice Ground's rules: no damage numbers (its respawns are
  // Quick Battle's own, after a point; see match-score.test.mjs).
  assert.ok(!(battle instanceof PracticeSession));
  for (const key of ['cpu', 'damageNumbers']) assert.equal(key in battle, false, `no ${key}`);
  assert.deepEqual([battle.p1.combat.knockback, battle.p2.combat.knockback], [0, 0]);

  const root = new Element('div');
  const hud = new HUD(root);
  hud.bind(battle.p1, battle.p2);
  hud.update(battle);
  assert.equal(root.children.length, 3);
  assert.equal(hud.right.tag.textContent, 'CPU');
  assert.equal(hud.roundLabel.textContent, 'ROUND 1');
  assert.equal(hud.timer.textContent, String(Math.ceil(battle.timeLeft)));
  assert.equal(hud.pauseButton.html, ICONS.pause);
});

test('Select Fighter still builds the full roster from the shared component and confirms into Select Stage', () => {
  const { app } = fakeApp();
  const select = new CharacterSelectScreen(app);
  select.enter();
  const { slots } = select.roster;
  assert.equal(slots.length, CONFIG.roster.totalSlots);
  assert.equal(select.roster.name.id, 'preview-name');
  assert.equal(select.roster.previewPanel.getAttribute('aria-labelledby'), 'preview-name');
  assert.ok(select.roster.selectedId === '0001');
  select.focusDefault();
  assert.equal(document.activeElement, slots[0]);
  slots.find((s) => s._def?.id === '9999').click(0);
  assert.equal(app.selection.characterId, '9999');
  assert.deepEqual(app.screens.calls, [['map']]);

  // All three rosters can share the page: no id is used twice.
  const practice = new PracticeGroundScreen(app);
  const ids = [];
  const collect = (n) => { if (n instanceof Element) { if (n.id) ids.push(n.id); n.children.forEach(collect); } };
  collect(select.el);
  collect(practice.el);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);
  for (const id of ['preview-name', 'practice-preview-name', 'practice-cpu-preview-name']) assert.ok(ids.includes(id), id);
  assert.equal(getCharacter('9999').displayName, '#9999');
});
