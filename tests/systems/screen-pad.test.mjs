// Run with node --test tests/systems/screen-pad.test.mjs (no dependencies).
// The Screen Pad (the Screen Pad update): the left half of the screen as an
// invisible gesture surface. Its pure rules (classifyGesture, padHold,
// followAnchor, the SCREEN_PAD thresholds), then the real TouchControls on a
// minimal fake DOM feeding the real InputManager, and a real Fighter played
// by it: a tap is one Jump (three, the triple jump), a swipe one Dash or air
// dash, a hold and drag a Run with no Jump on lift, a drag down Down (the
// Super Jump with Jump, the fast fall in the air), a quick flick down on a
// one-way platform a drop and a long one none, a swipe up the Super Jump on
// the ground and a jump in the air, a flick mid-run a Dash with the run
// going on; a slow drift never jumps or dashes, a second finger on the pad
// is ignored, a button is never a gesture, and a cancel, a pause, focus
// lost, a scheme switch or a trailing click leave nothing behind. Layout and
// real touch still need a real browser (the pad's geometry and paint are
// checked from the stylesheet below).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stylesheet } from '../helpers/stylesheet.mjs';

class Node {
  parentNode = null;
}
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  dataset = {};
  html = '';
  style = { setProperty(name, value) { this[name] = value; } };
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
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  set textContent(v) { this.children = []; this.html = String(v); }
  get textContent() { return this.html; }
  set innerHTML(v) { this.children = []; this.html = v; }
  get innerHTML() { return this.html; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.html = ''; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event) { for (const fn of this.listeners.get(type) || []) fn({ type, ...event }); }
  setPointerCapture() {}
  getBoundingClientRect() { return this.rect; }
  closest() { return null; }
  // Every element under this one.
  descendants() { return this.children.flatMap((c) => (c instanceof Element ? [c, ...c.descendants()] : [])); }
}

globalThis.Node = Node;
globalThis.document = { createElement: (tag) => new Element(tag), createTextNode: (text) => ({ textContent: text }), addEventListener() {} };
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
// A 390 × 844 phone held in landscape: the short side is 390 px.
globalThis.innerWidth = 844;
globalThis.innerHeight = 390;
const SHORT = 390;

const {
  TouchControls, SCREEN_PAD, JOYSTICK, ScreenPadGesture, classifyGesture, padHold, followAnchor,
} = await import('../../js/ui/touch-controls.js');
const { InputManager } = await import('../../js/core/input-manager.js');
const { CONFIG } = await import('../../js/config.js');
const { Fighter } = await import('../../js/game/fighters/fighter.js');
const { PlayerController } = await import('../../js/game/fighters/fighter-controller.js');
const { STAGE, SIM_CTX, DT, MOVEMENT, fakeSpritesOf, DEFAULT_CHARACTER } = await import('../helpers/fighter-harness.mjs');
const { TOUCH_CONTROL_IDS, sanitizeTouchLayout } = await import('../../js/core/touch-layout.js');

const DEF = DEFAULT_CHARACTER;
const STEP_MS = DT * 1000;
const px = (shortSides) => shortSides * SHORT;

// ---- The thresholds and the pure rules -------------------------------------------

test('SCREEN_PAD: every threshold in one frozen place, distances in short sides, times in seconds', () => {
  assert.ok(Object.isFrozen(SCREEN_PAD));
  assert.deepEqual({ ...SCREEN_PAD }, {
    tapTime: 0.2, tapSlop: 0.03, swipeTime: 0.25, swipeDistance: 0.08, swipeAngle: 35, upAngle: 40,
    radius: 0.1, maxRadius: 0.08, flick: true, flickSpeed: 1.5, flickWindow: 0.05, flickRearm: 0.5, flickRun: 0.5,
  });
  // A tap can never hold a Run: its slop is inside the stick's engage line.
  assert.ok(SCREEN_PAD.tapSlop < JOYSTICK.engage * SCREEN_PAD.radius);
  // A swipe always travels past it, and a flick re-anchors past it.
  assert.ok(SCREEN_PAD.swipeDistance > JOYSTICK.engage * SCREEN_PAD.radius);
  assert.ok(SCREEN_PAD.flickRun > JOYSTICK.engage);
  // The anchor is only dragged along well past the engage line, and close
  // enough that turning back after a long slide is a short push.
  assert.ok(SCREEN_PAD.maxRadius > 2 * JOYSTICK.engage * SCREEN_PAD.radius);
  assert.ok(SCREEN_PAD.maxRadius + JOYSTICK.engage * SCREEN_PAD.radius <= 0.12);
  // A swipe's sideways and upward angles never overlap.
  assert.ok(SCREEN_PAD.swipeAngle + SCREEN_PAD.upAngle < 90);
});

test('classifyGesture: a tap, a swipe each way, a swipe up, and nothing for the rest', () => {
  assert.equal(classifyGesture(0, 0, 0.05), 'tap');
  assert.equal(classifyGesture(0.02, -0.01, 0.19), 'tap', 'a little wobble');
  assert.equal(classifyGesture(0, 0, 0.21), null, 'held too long: nothing');
  assert.equal(classifyGesture(0.01, 0, 0.1, 0.05), null, 'moved past the slop and back: no tap');
  assert.equal(classifyGesture(-0.1, 0, 0.12), 'left');
  assert.equal(classifyGesture(0.1, 0.05, 0.2), 'right', '27° off horizontal');
  assert.equal(classifyGesture(0.1, 0.08, 0.2), null, '39° off horizontal: neither');
  assert.equal(classifyGesture(0, -0.12, 0.15), 'up');
  assert.equal(classifyGesture(0.06, -0.1, 0.15), 'up', '31° off vertical');
  assert.equal(classifyGesture(0, 0.12, 0.15), null, 'a swipe down is no swipe (it is a Down flick)');
  assert.equal(classifyGesture(0.07, 0, 0.1), null, 'too short');
  assert.equal(classifyGesture(0.3, 0, 0.26), null, 'too slow');
});

test('padHold: the joystick\'s own hysteresis on the floating stick, a diagonal holding both, up holding nothing', () => {
  const r = SCREEN_PAD.radius;
  assert.deepEqual(padHold(0.3 * r, 0), { run: null, down: false });
  assert.deepEqual(padHold(0.34 * r, 0), { run: 'runRight', down: false });
  assert.deepEqual(padHold(0.3 * r, 0, { run: 'runRight', down: false }), { run: 'runRight', down: false }, 'held until the deadzone');
  assert.deepEqual(padHold(0.2 * r, 0, { run: 'runRight', down: false }), { run: null, down: false });
  assert.deepEqual(padHold(0, 0.5 * r), { run: null, down: true });
  assert.deepEqual(padHold(-0.5 * r, 0.6 * r), { run: 'runLeft', down: true }, 'down-left');
  assert.deepEqual(padHold(0, -r), { run: null, down: false }, 'pushing up does nothing');
  assert.deepEqual(padHold(0.9 * r, 0.5 * r), { run: 'runRight', down: false }, 'a run drifting low never holds Down');
});

test('followAnchor: the anchor stays put inside maxRadius and is dragged along behind the finger past it', () => {
  const a = { x: 100, y: 100 };
  assert.equal(followAnchor(a, 130, 100, 60), a);
  assert.deepEqual(followAnchor(a, 200, 100, 60), { x: 140, y: 100 });
  const b = followAnchor(a, 100, 300, 60);
  assert.deepEqual(b, { x: 100, y: 240 });
});

// ---- The recogniser alone ----------------------------------------------------------

function recorder() {
  const log = [];
  const g = new ScreenPadGesture({
    hold: (c, on) => log.push(['hold', c, on]),
    pulse: (c) => log.push(['pulse', c]),
    dash: (d) => log.push(['dash', d]),
  }, () => SHORT);
  return { g, log };
}

test('the recogniser: one gesture classified once; a stick never jumps or dashes on lift', () => {
  // A tap.
  let { g, log } = recorder();
  g.begin(1, 100, 200, 0);
  g.end(1, 102, 199, 90);
  assert.deepEqual(log, [['pulse', 'jump']]);
  // A swipe right: a few frames of Run first, then exactly one Dash.
  ({ g, log } = recorder());
  g.begin(1, 100, 200, 0);
  g.move(1, 120, 200, 30);
  g.end(1, 150, 200, 90);
  assert.deepEqual(log, [['hold', 'runRight', true], ['dash', 1], ['hold', 'runRight', false]]);
  // A swipe up: Down and Jump on the same sample.
  ({ g, log } = recorder());
  g.begin(1, 100, 200, 0);
  g.end(1, 100, 150, 100);
  assert.deepEqual(log, [['pulse', 'down'], ['pulse', 'jump']]);
  // A hold and drag: a stick, let go on lift, nothing else.
  ({ g, log } = recorder());
  g.begin(1, 100, 200, 0);
  g.move(1, 130, 200, 50);
  g.move(1, 140, 200, 300);
  g.end(1, 145, 200, 600);
  assert.deepEqual(log, [['hold', 'runRight', true], ['hold', 'runRight', false]]);
  // The same hold ended by a sudden jerk sideways: that is a flick (one
  // Dash), still never a Jump.
  ({ g, log } = recorder());
  g.begin(1, 100, 200, 0);
  g.move(1, 130, 200, 50);
  g.move(1, 140, 200, 300);
  g.end(1, 180, 200, 320);
  assert.deepEqual(log, [['hold', 'runRight', true], ['dash', 1], ['hold', 'runRight', false]]);
});

// ---- The real touch controls, input and Fighter ------------------------------------

// The real InputManager behind the real TouchControls (Screen Pad, the
// default), and a real Fighter played by it at (x, y). `t` is the event
// clock in ms; `step()` runs one simulation step and moves it on.
function padPlay({ x = 500, y = 800 } = {}) {
  const input = new InputManager(CONFIG.bindings);
  input.setGameplayActive(true);
  input.sample();
  const tc = new TouchControls(new Element('div'), input);
  tc.setCharacter(DEF);
  tc.setEnabled(true);
  const fighter = new Fighter({
    def: DEF, sprites: fakeSpritesOf(DEF), stage: STAGE, slot: 0, label: 'P1',
    controller: new PlayerController(input), spawn: { x, y, facing: 1 },
  });
  const clock = { t: 1000 };
  const ev = (pointerId, cx, cy, extra = {}) => ({ pointerId, clientX: cx, clientY: cy, timeStamp: clock.t, preventDefault() {}, ...extra });
  const p = {
    input, tc, fighter, clock,
    dashes: 0,
    step() {
      const before = fighter.dash;
      fighter.update(DT, SIM_CTX);
      if (fighter.dash && fighter.dash !== before) p.dashes++;
      clock.t += STEP_MS;
      return fighter;
    },
    steps(n) { for (let i = 0; i < n; i++) p.step(); },
    wait(ms) { clock.t += ms; },
    down: (cx, cy, id = 1) => tc.pad.dispatch('pointerdown', ev(id, cx, cy)),
    move: (cx, cy, id = 1) => tc.pad.dispatch('pointermove', ev(id, cx, cy)),
    up: (cx, cy, id = 1) => tc.pad.dispatch('pointerup', ev(id, cx, cy)),
    cancel: (type = 'pointercancel', id = 1) => tc.pad.dispatch(type, ev(id, undefined, undefined)),
    // A drag from (x0, y0) to (x1, y1) over `ms`, one move a frame.
    drag(x0, y0, x1, y1, ms, id = 1) {
      const n = Math.max(1, Math.round(ms / STEP_MS));
      for (let i = 1; i <= n; i++) {
        clock.t += ms / n;
        tc.pad.dispatch('pointermove', ev(id, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n));
      }
    },
    // A whole tap at (cx, cy): down, `ms` later up.
    tap(cx = 150, cy = 200, ms = 60, id = 1) {
      p.down(cx, cy, id);
      p.wait(ms);
      p.up(cx, cy, id);
    },
  };
  return p;
}

// Falling in the air from y.
function airborne(p, y = 300) {
  Object.assign(p.fighter.body, { y, prevY: y, vy: 0, grounded: false, ground: null });
  p.step();
}

test('Screen Pad renders only the right-hand cluster: the invisible pad on the left, no Down, Run, Dash or stick', () => {
  const p = padPlay();
  const { tc } = p;
  assert.equal(tc.scheme, 'screenpad', 'the default');
  assert.deepEqual(tc.root.children, [tc.pad, tc.actions]);
  assert.deepEqual([...tc.buttons.keys()].sort(), ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack', 'jump', 'shield']);
  for (const gone of [tc.stick, tc.joystick, tc.dpad, tc.downButton, ...tc.mouvementButtons.values(), ...tc.padButtons.values()]) {
    assert.equal(tc.root.descendants().includes(gone), false, 'nothing of the lower-left cluster');
  }
  assert.deepEqual([...tc.getControlElements().keys()], [...TOUCH_CONTROL_IDS.screenpad]);
  assert.deepEqual([...TOUCH_CONTROL_IDS.screenpad], ['extra_attack', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump']);
  // The pad is no button and is never announced.
  assert.equal(tc.pad.tagName, 'DIV');
  assert.equal(tc.pad.getAttribute('aria-hidden'), 'true');
  assert.equal(tc.pad.getAttribute('role'), null);
  assert.equal(tc.pad.getAttribute('tabindex'), null);
  assert.equal(tc.pad.getAttribute('data-control'), null);
  assert.equal(tc.pad.children.length, 0);
});

test('a tap is one Jump on lift, never on touch; three taps are the triple jump', () => {
  const p = padPlay();
  p.steps(3);
  p.down(150, 200);
  let f = p.input.sample();
  assert.equal(f.jumpPressed, false, 'nothing on touch-down');
  p.wait(80);
  p.up(151, 201);
  f = p.input.sample();
  assert.deepEqual([f.jump, f.jumpPressed, f.down, f.downPressed], [true, true, false, false], 'one Jump, held for this sample');
  f = p.input.sample();
  assert.deepEqual([f.jump, f.jumpPressed], [false, false], 'then let go');
  // Through the Fighter: a normal jump, then two air jumps.
  const q = padPlay();
  q.steps(3);
  q.tap();
  q.step();
  assert.ok(q.fighter.body.vy < 0 && !q.fighter.grounded, 'a jump');
  assert.equal(q.fighter.superJumpTakeoff, null, 'a normal one');
  assert.ok(q.fighter.body.vy >= -MOVEMENT.jumpVelocity - 1e-6);
  q.steps(12);
  q.tap();
  q.step();
  assert.equal(q.fighter.airJumped, true, 'the first air jump');
  q.steps(12);
  q.tap();
  q.step();
  assert.equal(q.fighter.airJumped, true, 'the second: the triple jump');
  assert.equal(q.fighter.airJumps, 0);
});

test('a swipe left or right is exactly one Dash that way, on the ground and in the air', () => {
  for (const [dx, dir] of [[-1, -1], [1, 1]]) {
    const p = padPlay();
    p.steps(3);
    p.down(200, 200);
    p.drag(200, 200, 200 + dx * px(0.12), 200, 80);
    p.up(200 + dx * px(0.12), 200);
    const f = p.input.sample();
    assert.equal(f.mouvementLeftPressed, dir === -1);
    assert.equal(f.mouvementRightPressed, dir === 1);
    assert.equal(f.jumpPressed, false, 'no Jump');
    const g = padPlay();
    g.steps(3);
    g.down(200, 200);
    g.drag(200, 200, 200 + dx * px(0.12), 200, 80);
    g.up(200 + dx * px(0.12), 200);
    g.step();
    assert.ok(g.fighter.dash && !g.fighter.dash.air, 'a Dash on the ground');
    assert.equal(g.fighter.dash.direction, dir);
    g.steps(30);
    assert.equal(g.dashes, 1, 'exactly one');
    // In the air: an air dash.
    const a = padPlay();
    airborne(a);
    a.down(200, 200);
    a.drag(200, 200, 200 + dx * px(0.12), 200, 80);
    a.up(200 + dx * px(0.12), 200);
    a.step();
    assert.ok(a.fighter.dash?.air, 'an air dash');
    assert.equal(a.fighter.dash.direction, dir);
    a.steps(20);
    assert.equal(a.dashes, 1);
  }
});

test('a swipe against a held run is a Dash that way; the pad goes through the touch Dash path unchanged', () => {
  // A swipe left that first drifts right: the Dash goes left.
  const p = padPlay();
  p.down(300, 200);
  p.drag(300, 200, 315, 200, 30);
  assert.equal(p.input.isHeld('runRight'), true);
  p.drag(315, 200, 300 - px(0.1), 200, 60);
  p.up(300 - px(0.1), 200);
  const f = p.input.sample();
  assert.deepEqual([f.mouvementLeftPressed, f.mouvementRightPressed], [true, false]);
  assert.equal(f.runRight, false, 'the run it crossed is let go');
  // Its requests are queueTouchMouvement's, one sample each, as a Dash
  // button's: the touch rule for two in one sample (the latest) is kept.
  const calls = [];
  const q = padPlay();
  const queue = q.input.queueTouchMouvement.bind(q.input);
  q.input.queueTouchMouvement = (d) => { calls.push(d); queue(d); };
  q.down(200, 200);
  q.drag(200, 200, 200 + px(0.12), 200, 80);
  q.up(200 + px(0.12), 200);
  assert.deepEqual(calls, [1], 'one request a swipe');
  assert.equal(q.input.sample().mouvementRightPressed, true);
  assert.equal(q.input.sample().mouvementRightPressed, false, 'gone after one sample');
});

test('touch, hold and drag runs for as long as it is held; lifting it never jumps or dashes', () => {
  const p = padPlay();
  p.steps(3);
  p.down(200, 200);
  p.drag(200, 200, 200 + px(0.06), 200, 300);
  let f = p.input.sample();
  assert.deepEqual([f.runRight, f.runLeft], [true, false], 'Run right');
  for (let i = 0; i < 20; i++) p.step();
  assert.ok(p.fighter.body.vx > 0, 'running');
  // Across the anchor: Run left.
  p.drag(200 + px(0.06), 200, 200 - px(0.06), 200, 400);
  f = p.input.sample();
  assert.deepEqual([f.runRight, f.runLeft], [false, true]);
  p.up(200 - px(0.06), 200);
  f = p.input.sample();
  assert.deepEqual([f.runLeft, f.jumpPressed, f.mouvementLeftPressed, f.mouvementRightPressed, f.downPressed], [false, false, false, false, false]);
  // A long slide never runs out of stick: the anchor follows.
  const q = padPlay();
  q.down(100, 200);
  q.drag(100, 200, 400, 200, 1500);
  assert.equal(q.input.isHeld('runRight'), true);
  q.drag(400, 200, 400 - px(0.12), 200, 400);
  assert.equal(q.input.isHeld('runLeft'), true, 'turning back is a short push, wherever the slide went');
  q.up(400 - px(0.12), 200);
});

test('a slow drift never jumps or dashes, and a resting thumb holds nothing', () => {
  const p = padPlay();
  p.steps(3);
  p.down(200, 200);
  p.drag(200, 200, 200 + px(0.025), 200 + px(0.02), 1500);
  let f = p.input.sample();
  assert.deepEqual([f.runRight, f.down], [false, false], 'inside the engage line');
  p.drag(200 + px(0.025), 200 + px(0.02), 200 + px(0.2), 200 - px(0.05), 1500);
  p.up(200 + px(0.2), 200 - px(0.05));
  f = p.input.sample();
  assert.deepEqual([f.jumpPressed, f.mouvementLeftPressed, f.mouvementRightPressed], [false, false, false]);
  // A slow drift upward, past every swipe distance: nothing at all.
  const q = padPlay();
  q.down(200, 300);
  q.drag(200, 300, 200, 300 - px(0.3), 2000);
  q.up(200, 300 - px(0.3));
  f = q.input.sample();
  assert.deepEqual([f.jump, f.jumpPressed, f.down, f.downPressed, f.runLeft, f.runRight], [false, false, false, false, false, false],
    'pushing up while holding does nothing');
});

test('a drag down holds Down: with Jump on the right, the Super Jump; in the air, the fast fall; diagonally, a Run as well', () => {
  const sj = padPlay();
  sj.steps(3);
  sj.down(200, 200);
  sj.drag(200, 200, 200, 200 + px(0.07), 300);
  let f = sj.input.sample();
  assert.deepEqual([f.down, f.downPressed], [true, true], 'a real press edge');
  sj.steps(4);
  sj.tc.buttons.get('jump').dispatch('pointerdown', { pointerId: 9, preventDefault() {} });
  sj.step();
  assert.ok(sj.fighter.superJumpTakeoff, 'the Super Jump: Down on the pad, Jump on the right');
  assert.ok(sj.fighter.body.vy < -MOVEMENT.jumpVelocity);
  sj.tc.buttons.get('jump').dispatch('pointerup', { pointerId: 9 });
  // A second thumb's tap on the pad while the first holds Down: the same chord.
  const two = padPlay();
  two.steps(3);
  two.down(200, 200);
  two.drag(200, 200, 200, 200 + px(0.07), 300);
  two.steps(3);
  two.tap(350, 120, 60, 2);
  two.step();
  assert.ok(two.fighter.superJumpTakeoff, 'Down with one thumb, a tap with the other');
  // The fast fall.
  const ff = padPlay();
  airborne(ff);
  for (let i = 0; i < 30 && !(ff.fighter.body.vy > 0); i++) ff.step();
  ff.down(200, 200);
  ff.drag(200, 200, 200, 200 + px(0.07), 200);
  ff.step();
  ff.step();
  assert.equal(ff.fighter.fastFalling, true);
  ff.wait(300);
  ff.up(200, 200 + px(0.07));
  ff.step();
  assert.equal(ff.fighter.fastFalling, false, 'let go: a normal fall');
  // Down-left: both.
  const d = padPlay();
  d.down(200, 200);
  d.drag(200, 200, 200 - px(0.05), 200 + px(0.06), 300);
  f = d.input.sample();
  assert.deepEqual([f.runLeft, f.down], [true, true]);
});

test('a quick flick down on a one-way platform drops through it; held past dropTapTime it stands', () => {
  const LEDGE_Y = 600;
  const drop = padPlay({ x: 1000, y: LEDGE_Y });
  drop.steps(3);
  assert.equal(drop.fighter.body.ground?.id, 'ledge');
  drop.down(200, 200);
  drop.drag(200, 200, 200, 200 + px(0.08), 50);
  drop.up(200, 200 + px(0.08));
  drop.step();
  assert.equal(drop.fighter.grounded, false, 'through the platform');
  assert.equal(drop.fighter.body.dropId, 'ledge');
  // So fast no move arrived before the lift: the lift's own position counts.
  const fast = padPlay({ x: 1000, y: LEDGE_Y });
  fast.steps(3);
  fast.down(200, 200);
  fast.wait(40);
  fast.up(200, 200 + px(0.09));
  fast.step();
  assert.equal(fast.fighter.body.dropId, 'ledge', 'a flick within one frame still drops');
  // Held down past dropTapTime: no drop.
  const hold = padPlay({ x: 1000, y: LEDGE_Y });
  hold.steps(3);
  hold.down(200, 200);
  hold.drag(200, 200, 200, 200 + px(0.08), 50);
  for (let i = 0; i < Math.ceil(MOVEMENT.dropTapTime / DT) + 2; i++) hold.step();
  hold.up(200, 200 + px(0.08));
  hold.step();
  assert.equal(hold.fighter.body.ground?.id, 'ledge', 'held too long: it stays');
  // A run with the thumb drifting low never drops it.
  const run = padPlay({ x: 1000, y: LEDGE_Y });
  run.steps(3);
  run.down(200, 200);
  run.drag(200, 200, 200 + px(0.09), 200 + px(0.04), 300);
  run.steps(2);
  run.up(200 + px(0.09), 200 + px(0.04));
  run.step();
  assert.equal(run.fighter.body.dropId ?? null, null);
});

test('a swipe up is the Super Jump on the ground and a normal jump in the air', () => {
  const p = padPlay();
  p.steps(3);
  p.down(200, 300);
  p.drag(200, 300, 200, 300 - px(0.12), 100);
  p.up(200, 300 - px(0.12));
  const f = p.input.sample();
  assert.deepEqual([f.down, f.downPressed, f.jump, f.jumpPressed], [true, true, true, true], 'Down and Jump on the same sample');
  const after = p.input.sample();
  assert.deepEqual([after.down, after.jump], [false, false], 'both let go after it');
  const g = padPlay();
  g.steps(3);
  g.down(200, 300);
  g.drag(200, 300, 200, 300 - px(0.12), 100);
  g.up(200, 300 - px(0.12));
  g.step();
  assert.ok(g.fighter.superJumpTakeoff, 'the Super Jump');
  assert.ok(g.fighter.body.vy < -MOVEMENT.jumpVelocity);
  // In the air: an air jump, never a Super Jump.
  const a = padPlay();
  airborne(a);
  a.steps(5);
  const airJumps = a.fighter.airJumps;
  a.down(200, 300);
  a.drag(200, 300, 200, 300 - px(0.12), 100);
  a.up(200, 300 - px(0.12));
  a.step();
  assert.equal(a.fighter.airJumped, true);
  assert.equal(a.fighter.superJumpTakeoff, null);
  assert.equal(a.fighter.airJumps, airJumps - 1);
});

test('a flick while running is one Dash that way, the run goes on, and another needs the finger to slow first', () => {
  const p = padPlay();
  p.steps(3);
  p.down(200, 200);
  p.drag(200, 200, 200 + px(0.06), 200, 300);
  p.steps(5);
  assert.equal(p.input.isHeld('runRight'), true);
  // A sudden flick right: 0.1 short sides in 30 ms (≈ 3.3 short sides/s).
  p.drag(200 + px(0.06), 200, 200 + px(0.16), 200, 30);
  p.step();
  assert.equal(p.dashes, 1, 'a Dash, without lifting');
  assert.equal(p.fighter.dash.direction, 1);
  assert.equal(p.input.isHeld('runRight'), true, 'the run goes on');
  // Still fast: no second Dash for the same spike.
  p.drag(200 + px(0.16), 200, 200 + px(0.26), 200, 30);
  p.steps(30);
  assert.equal(p.dashes, 1, 'one Dash a spike');
  // Slowed down, then a flick back left: a Dash left, and the run turns.
  p.drag(200 + px(0.26), 200, 200 + px(0.265), 200, 200);
  p.drag(200 + px(0.265), 200, 200 + px(0.165), 200, 30);
  p.step();
  assert.equal(p.dashes, 2);
  assert.equal(p.fighter.dash.direction, -1);
  assert.equal(p.input.isHeld('runLeft'), true, 'running the way of the Dash');
  p.wait(100);
  p.up(200 + px(0.165), 200);
  const f = p.input.sample();
  assert.deepEqual([f.runLeft, f.jumpPressed, f.mouvementLeftPressed, f.mouvementRightPressed], [false, false, false, false], 'lifting a stick: nothing more');
});

test('a second finger on the pad is ignored while the first steers; a button press is never a gesture', () => {
  const p = padPlay();
  p.down(200, 200, 1);
  p.drag(200, 200, 200 + px(0.06), 200, 300, 1);
  p.down(300, 100, 2);
  p.move(300 - px(0.2), 100, 2);
  p.up(300 - px(0.2), 100, 2);
  let f = p.input.sample();
  assert.deepEqual([f.runRight, f.runLeft, f.mouvementLeftPressed, f.jumpPressed], [true, false, false, false], 'the first still steers alone');
  p.tap(300, 100, 50, 3);
  f = p.input.sample();
  assert.equal(f.jumpPressed, false, 'a second finger\'s tap is no Jump (the first holds no Down)');
  p.up(200 + px(0.06), 200, 1);
  // Buttons: their own pointers, never the pad's, wherever they sit.
  const q = padPlay();
  const attack = q.tc.buttons.get('attack1');
  attack.rect = { left: 10, top: 10, width: 60, height: 60 };
  attack.dispatch('pointerdown', { pointerId: 7, clientX: 40, clientY: 40, preventDefault() {} });
  attack.dispatch('pointerup', { pointerId: 7, clientX: 40, clientY: 40 });
  assert.equal(q.tc.gesture.active, null, 'the pad never saw it');
  f = q.input.sample();
  assert.deepEqual([f.attack1Pressed, f.jumpPressed], [true, false]);
  // And a finger already on the pad takes no button's press with it.
  q.down(200, 200, 1);
  q.tc.buttons.get('shield').dispatch('pointerdown', { pointerId: 8, preventDefault() {} });
  assert.equal(q.tc.gesture.owns(8), false);
  q.tc.buttons.get('shield').dispatch('pointerup', { pointerId: 8 });
  q.up(200, 200, 1);
});

test('nothing sticks: a cancel, a lost capture, a pause, focus lost and a scheme switch let go of everything', () => {
  for (const end of ['pointercancel', 'lostpointercapture']) {
    const p = padPlay();
    p.down(200, 200);
    p.drag(200, 200, 200 - px(0.05), 200 + px(0.06), 300);
    assert.ok(p.input.isHeld('runLeft') && p.input.isHeld('down'));
    p.cancel(end);
    const f = p.input.sample();
    assert.deepEqual([f.runLeft, f.down, f.jumpPressed, f.mouvementLeftPressed], [false, false, false, false], end);
    assert.equal(p.tc.gesture.active, null);
  }
  // A pause (the controls disabled): let go, and an unsampled tap dropped.
  const pause = padPlay();
  pause.down(200, 200);
  pause.drag(200, 200, 200 + px(0.06), 200, 300);
  pause.tap(300, 120, 50, 2);
  pause.tc.setEnabled(false);
  assert.equal(pause.input.isHeld('runRight'), false);
  assert.equal(pause.input.touchPulses.size, 0, 'no Jump waiting for the next sample');
  assert.equal(pause.tc.gesture.active, null);
  pause.down(200, 200);
  assert.equal(pause.tc.gesture.active, null, 'disabled: the pad takes nothing');
  // Focus lost (InputManager.suspend): the pad's finger forgotten too.
  const blur = padPlay();
  blur.down(200, 200);
  blur.drag(200, 200, 200 + px(0.06), 200 + px(0.07), 300);
  blur.input.suspend();
  assert.equal(blur.tc.gesture.active, null);
  assert.equal(blur.tc.pointers.size, 0);
  blur.drag(200 + px(0.06), 200 + px(0.07), 200 + px(0.08), 200 + px(0.08), 100);
  const f = blur.input.sample();
  assert.deepEqual([f.runRight, f.down], [false, false], 'its later moves hold nothing');
  // A scheme switch.
  const sw = padPlay();
  sw.down(200, 200);
  sw.drag(200, 200, 200 + px(0.06), 200 + px(0.07), 300);
  sw.tc.setScheme('joystick');
  assert.deepEqual([sw.input.isHeld('runRight'), sw.input.isHeld('down')], [false, false]);
  assert.equal(sw.tc.gesture.active, null);
  assert.equal(sw.tc.pointers.size, 0);
  assert.ok([...sw.tc.counts.values()].every((n) => n === 0));
  // The pad's pointers do nothing in another scheme.
  sw.down(200, 200);
  assert.equal(sw.tc.gesture.active, null);
});

test('a trailing click presses nothing: the pad is no button, and its lift marks its own click', () => {
  const p = padPlay();
  const pressed = [];
  const setTouch = p.input.setTouch.bind(p.input);
  p.input.setTouch = (a, on) => { pressed.push([a, on]); setTouch(a, on); };
  p.tap(200, 200, 60);
  p.input.sample();
  const listeners = p.tc.root.listeners.get('click');
  for (const fn of listeners) fn({ target: { closest: () => null }, detail: 0, timeStamp: p.clock.t + 20 });
  for (const fn of listeners) fn({ target: { closest: () => p.tc.pad }, detail: 1, timeStamp: p.clock.t + 20 });
  assert.deepEqual(pressed, [], 'nothing pressed by any click');
  assert.equal(p.tc.lastPointerEnd, p.clock.t, 'the lift noted');
  assert.equal(p.input.sample().jumpPressed, false);
});

test('no visual element is added while a gesture runs, and nothing on the pad changes', () => {
  const p = padPlay();
  const snapshot = () => JSON.stringify({
    children: p.tc.root.descendants().length,
    pad: [p.tc.pad.className, [...p.tc.pad.attrs], { ...p.tc.pad.style }, p.tc.pad.children.length, p.tc.pad.html],
  });
  const before = snapshot();
  p.down(200, 200);
  p.drag(200, 200, 200 + px(0.06), 200 + px(0.07), 300);
  assert.equal(snapshot(), before, 'during');
  p.drag(200 + px(0.06), 200 + px(0.07), 200 + px(0.2), 200, 30);
  p.up(200 + px(0.2), 200);
  p.tap();
  assert.equal(snapshot(), before, 'after');
});

// ---- Coverage and invisibility, from the stylesheet ---------------------------------

const CSS = stylesheet();
const rule = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return CSS.match(new RegExp(`(?:^|\\n|\\}\\s*)${esc} \\{([^}]*)\\}`))?.[1] ?? '';
};

test('the pad covers exactly the left half of the screen, top to bottom, insets and the strip under the HUD included', () => {
  const pad = rule('.tc-screenpad');
  for (const decl of ['position: absolute;', 'top: 0;', 'bottom: 0;', 'left: 0;', 'width: 50%;', 'pointer-events: auto;', 'touch-action: none;']) {
    assert.ok(pad.includes(decl), decl);
  }
  // The box it is a half of is the whole screen, padding (the safe-area
  // insets) included, at any size: the controls fill the screen, which
  // fills the viewport.
  const controls = rule('.touch-controls');
  assert.match(controls, /position: absolute;/);
  assert.match(controls, /inset: 0;/);
  assert.match(rule('.screen'), /position: absolute;\s*inset: 0;/);
  // So at any viewport (and after any rotation) the pad's box is
  // { left: 0, top: 0, width: W / 2, height: H }: its size is a fraction of
  // the live box, never a fixed one.
  assert.doesNotMatch(pad, /\d+px|vw|vh|max-|min-/, 'no fixed size');
  const geometry = (w, h) => ({ left: 0, top: 0, width: w * 0.5, height: h });
  for (const [w, h] of [[844, 390], [390, 844], [1180, 820], [667, 375], [2560, 1440]]) {
    assert.deepEqual(geometry(w, h), { left: 0, top: 0, width: w / 2, height: h }, `${w}×${h}`);
  }
  // The HUD takes no touch over it: only its pause or More button does.
  assert.match(rule('.hud'), /pointer-events: none;/);
  assert.match(rule('.hud-center'), /pointer-events: auto;/);
  assert.match(rule('.practice-more'), /pointer-events: auto;/);
  assert.match(rule('.ability-hud--p1') + CSS.match(/\.ability-hud[^{]*\{[^}]*pointer-events: none;/)?.[0], /pointer-events: none;/);
  // The right-hand cluster sits above it, so a button always wins.
  assert.match(rule('.touch-controls[data-scheme="screenpad"] .tc-actions'), /z-index: 1;/);
  assert.match(pad, /z-index: 0;/);
  // The editor never shows it.
  assert.match(rule('.touch-controls.is-editing .tc-screenpad'), /display: none;/);
});

test('the pad draws nothing, ever: no fill, border, shadow, outline, highlight or pseudo-element, in any state', () => {
  const pad = rule('.tc-screenpad');
  for (const decl of ['background: transparent;', 'border: 0;', 'box-shadow: none;', 'outline: none;', '-webkit-tap-highlight-color: transparent;']) {
    assert.ok(pad.includes(decl), decl);
  }
  assert.match(rule('.tc-screenpad::before, .tc-screenpad::after'), /content: none;/);
  // No other rule ever styles it (pressed, active, paused or anything else).
  const mentions = [...CSS.matchAll(/([^{}]*tc-screenpad[^{}]*)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
  const allowed = new Set([
    '.tc-screenpad', '.tc-screenpad::before, .tc-screenpad::after', '.touch-controls.is-editing .tc-screenpad',
  ]);
  for (const [selector] of mentions) assert.ok(allowed.has(selector.replace(/^.*\*\/\s*/s, '')), selector);
  // And the code never gives it a class, a style or a child.
  const code = readFileSync(new URL('../../js/ui/touch-controls.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /this\.pad\.(classList|style|append|replaceChildren|innerHTML|setAttribute)/);
});

test('the Screen Pad layout keeps only its own controls, sanitized like the others', () => {
  const layout = sanitizeTouchLayout('screenpad', {
    jump: { x: 1.5, y: 0.5, scale: 9 }, down: { x: 0.1, y: 0.9, scale: 1 }, stick: { x: 0.2, y: 0.8, scale: 1 },
    runLeft: { x: 0.1, y: 0.8, scale: 1 }, mouvementLeft: { x: 0.1, y: 0.5, scale: 1 }, attack1: { x: 0.3, y: 0.3, scale: 1.1 },
    shield: 'x',
  });
  assert.deepEqual(layout, { attack1: { x: 0.3, y: 0.3, scale: 1.1 }, jump: { x: 1, y: 0.5, scale: 1.8 } });
});

// ---- The one-time hint -----------------------------------------------------------------

test('the Screen Pad hint: a card shown on the first play with Screen Pad on a touch screen, dismissed by any touch, never again', async () => {
  const { ScreenPadHint } = await import('../../js/ui/screen-pad-hint.js');
  const { Settings, SETTINGS_KEY } = await import('../../js/core/settings.js');
  const listeners = new Map();
  const saved = { add: globalThis.addEventListener, remove: globalThis.removeEventListener };
  globalThis.addEventListener = (type, fn, options) => listeners.set(type, { fn, options });
  globalThis.removeEventListener = (type, fn) => { if (listeners.get(type)?.fn === fn) listeners.delete(type); };
  try {
    const map = new Map();
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
    const settings = new Settings(storage);
    let touchUI = true;
    const hint = new ScreenPadHint(settings, () => touchUI);
    assert.equal(hint.root.getAttribute('role'), 'status');
    assert.ok(hint.root.classNames.has('screenpad-hint'));
    // A card of text, never a drawing of the pad.
    assert.equal(hint.root.descendants().some((n) => n.tagName === 'SVG' || n.classNames.has('tc-screenpad')), false);
    assert.deepEqual(hint.root.children.map((c) => c.getAttribute('data-i18n')),
      ['touch.screenPadHint.title', 'touch.screenPadHint.body', 'touch.screenPadHint.dismiss']);
    // Not for another scheme, nor on a screen with no touch controls.
    hint.sync(true, 'joystick');
    assert.equal(hint.shown, false);
    touchUI = false;
    hint.sync(true, 'screenpad');
    assert.equal(hint.shown, false);
    touchUI = true;
    hint.sync(true, 'screenpad');
    assert.equal(hint.shown, true);
    assert.equal(hint.root.hidden, false);
    // It takes no pointer: it listens for the first touch anywhere, in the
    // capture phase, passively (the touch still plays).
    const { fn, options } = listeners.get('pointerdown');
    assert.deepEqual(options, { capture: true, passive: true });
    // A pause only hides it.
    hint.sync(false);
    assert.equal(hint.root.hidden, true);
    assert.equal(settings.screenPadHintSeen, false);
    assert.equal(listeners.has('pointerdown'), false);
    hint.sync(true, 'screenpad');
    listeners.get('pointerdown').fn({});
    assert.equal(hint.root.hidden, true);
    assert.equal(settings.screenPadHintSeen, true);
    assert.equal(JSON.parse(map.get(SETTINGS_KEY)).screenPadHintSeen, true, 'remembered');
    assert.equal(listeners.has('pointerdown'), false);
    hint.sync(true, 'screenpad');
    assert.equal(hint.shown, false, 'never again');
    const later = new ScreenPadHint(new Settings(storage), () => true);
    later.sync(true, 'screenpad');
    assert.equal(later.shown, false, 'nor on a later visit');
    assert.equal(typeof fn, 'function');
  } finally {
    globalThis.addEventListener = saved.add;
    globalThis.removeEventListener = saved.remove;
  }
});

test('the hint card is styled as a card that takes no pointer, shown only on a touch screen', () => {
  const card = rule('.screenpad-hint');
  assert.match(card, /pointer-events: none;/);
  assert.match(card, /display: none;/);
  assert.match(CSS, /html\.is-touch \.screenpad-hint:not\(\[hidden\]\) \{ display: grid;/);
});
