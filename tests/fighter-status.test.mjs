// Run with node --test tests/fighter-status.test.mjs (no dependencies).
// The status drawn with each fighter on the Arena canvas: the purple
// stamina bar over its name tag, only while below full (gray through an
// exhaustion's whole refill), and the CAB1 / CAB2 cooldown rings under its
// feet, only while cooling down. The state helpers are checked directly;
// the drawing through a
// canvas context that records what it is asked to paint (layout and paint
// themselves still need a real browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import {
  cabIndicators, staminaBarState, formatCooldown, drawCabIndicators, drawStaminaBar, statusOnScreen,
  CAB_STYLE, STAMINA_STYLE, CHARGED_LABELS,
} from '../js/game/fighter-status.js';
import { def, DT, fakeSprites, makeFighter, duel } from './fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// A 2D context that records every call with the styles in force at the time.
function recorder() {
  const calls = [];
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', globalAlpha: 1 };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => stack.push({ ...state });
      if (k === 'restore') return () => Object.assign(state, stack.pop());
      if (k === 'measureText') return (text) => ({ width: String(text).length * 6 });
      return (...args) => calls.push({ fn: k, args, fill: state.fillStyle, stroke: state.strokeStyle, lineWidth: state.lineWidth });
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, calls };
}

const texts = (calls, fn = 'fillText') => calls.filter((c) => c.fn === fn).map((c) => c.args[0]);

const labels = (fighter) => cabIndicators(fighter).map((c) => c.label);
// What drawCabIndicators paints for `fighter` under feet at (400, 300): each
// ring's CAB label and its x, in drawing order.
const drawnRings = (fighter) => {
  const { ctx, calls } = recorder();
  const count = drawCabIndicators(ctx, fighter, 400, 300, 1.2);
  const rings = calls.filter((c) => c.fn === 'fillText' && /^CAB[12]$/.test(c.args[0])).map((c) => ({ label: c.args[0], x: c.args[1] }));
  assert.equal(count, rings.length);
  return { rings, calls };
};

// ---- CAB1 / CAB2: only while cooling down ------------------------------------

test('CAB1 and CAB2 are named after their buttons, never plain BA1 / BA2; ready, neither has any indicator at all', () => {
  assert.deepEqual({ ...CHARGED_LABELS }, { action1: 'CAB1', action2: 'CAB2' });
  const { fighter } = makeFighter();
  assert.deepEqual(Object.values(def.chargedActions).map((c) => c.id), ['ba1Clone', 'rasenRush']);
  assert.deepEqual(cabIndicators(fighter), [], 'both ready: no entries, not ready ones made invisible');
  const { rings, calls } = drawnRings(fighter);
  assert.deepEqual(rings, []);
  assert.deepEqual(calls, [], 'nothing under the fighter: no ring, label, number or empty slot');
  // Each one is its own: CAB2 alone, then CAB1 alone.
  fighter.combat.chargedCooldowns.start('rasenRush', 5);
  assert.deepEqual(cabIndicators(fighter).map((c) => [c.label, c.id, c.action]), [['CAB2', 'rasenRush', 'action2']]);
  fighter.combat.chargedCooldowns.clear();
  fighter.combat.chargedCooldowns.start('ba1Clone', 5);
  assert.deepEqual(cabIndicators(fighter).map((c) => [c.label, c.id, c.action]), [['CAB1', 'ba1Clone', 'action1']]);
});

test('the rings read the real cooldowns: empty as one starts, half way at half, the seconds left counting down, gone when ready', () => {
  const { fighter } = makeFighter();
  const cd = fighter.combat.chargedCooldowns;
  cd.start('ba1Clone', 5);
  let [cab1, cab2] = cabIndicators(fighter);
  assert.deepEqual([cab1.label, cab1.progress, cab1.text], ['CAB1', 0, '5.0']);
  assert.equal(cab2, undefined, 'CAB2 is ready: absent');
  for (const [dt, text, progress] of [[0.7, '4.3', 0.14], [1.8, '2.5', 0.5], [1.7, '0.8', 0.84]]) {
    cd.update(dt);
    [cab1] = cabIndicators(fighter);
    assert.equal(cab1.text, text);
    assert.ok(Math.abs(cab1.progress - progress) < 1e-9, `progress = 1 - remaining / duration (${cab1.progress})`);
  }
  cd.update(0.8);
  assert.equal(cd.active('ba1Clone'), false);
  assert.deepEqual(cabIndicators(fighter), [], 'ready: removed, not left complete');
  // Never 0.0 while still cooling down.
  assert.equal(formatCooldown(0.01), '0.1');
  assert.equal(formatCooldown(4.3), '4.3');
  assert.equal(formatCooldown(4.31), '4.4');
});

test('real Charged BA1 then Charged BA2: CAB1 appears at once, CAB2 joins it, CAB1 goes first, the last one leaves nothing', () => {
  const d = duel({ gap: 200 });
  const f = d.attacker;
  const cd = f.combat.chargedCooldowns;
  d.tick({ charge: true });
  assert.deepEqual(labels(f), []);
  // CAB1 used: its ring on the very step, CAB2 still absent.
  d.tick({ charge: true, action1: true, action1Pressed: true });
  assert.equal(d.clones.length, 1);
  let [cab1, cab2] = cabIndicators(f);
  assert.deepEqual([cab1.label, cab1.text, cab1.progress], ['CAB1', '5.0', 0]);
  assert.equal(cab2, undefined);
  assert.deepEqual(labels(d.target), [], 'the other fighter shows nothing');
  // Charge fills it faster: half a second of Charge takes a whole second off.
  for (let i = 0; i < 30; i++) d.tick({ charge: true });
  [cab1] = cabIndicators(f);
  assert.equal(cab1.text, '4.0');
  assert.ok(Math.abs(cab1.progress - 0.2) < 1e-9);
  // CAB2 used while CAB1 cools: both, side by side, CAB1 on the left.
  d.tick({ charge: true, action2: true, action2Pressed: true });
  assert.ok(f.technique, 'the Sphere Rush started');
  assert.deepEqual(labels(f), ['CAB1', 'CAB2']);
  const both = drawnRings(f).rings;
  assert.deepEqual(both.map((r) => r.label), ['CAB1', 'CAB2']);
  assert.ok(both[0].x < 400 && both[1].x > 400, 'side by side, centred under the fighter as a pair');
  // Every step: exactly the active cooldowns, none ever shown ready.
  const seen = [];
  for (let i = 0; i < 600 && cd.size; i++) {
    d.tick();
    const list = cabIndicators(f);
    assert.deepEqual(list.map((c) => c.id), ['ba1Clone', 'rasenRush'].filter((id) => cd.active(id)));
    for (const c of list) assert.ok(c.progress < 1 && c.text !== '0.0', `${c.label} still cooling (${c.text})`);
    const key = list.map((c) => c.label).join(' ');
    if (seen.at(-1) !== key) {
      seen.push(key);
      if (key === 'CAB2') {
        // CAB1 finished: only CAB1 went, and CAB2 moved to the centre.
        assert.deepEqual(drawnRings(f).rings, [{ label: 'CAB2', x: 400 }]);
      }
    }
  }
  assert.deepEqual(seen, ['CAB1 CAB2', 'CAB2', ''], 'CAB1 first, then CAB2, then nothing');
  assert.deepEqual(drawnRings(f).calls, [], 'all ready: no cooldown UI under the fighter');
});

test('CAB rings are white with a black outline: ring, number and label; never green; a lone ring is centred', () => {
  assert.equal(CAB_STYLE.fill, '#ffffff');
  assert.equal(CAB_STYLE.outline, '#000000');
  const { fighter } = makeFighter();
  fighter.combat.chargedCooldowns.start('rasenRush', 5);
  fighter.combat.chargedCooldowns.update(2.5);
  let { rings, calls } = drawnRings(fighter);
  assert.deepEqual(texts(calls), ['2.5', 'CAB2'], 'CAB2 cooling (2.5 left), nothing for the ready CAB1');
  assert.deepEqual(rings, [{ label: 'CAB2', x: 400 }], 'alone: straight under the fighter, no slot kept for CAB1');
  for (const c of calls.filter((x) => x.fn === 'fillText')) assert.equal(c.fill, CAB_STYLE.fill, `${c.args[0]} in white`);
  for (const c of calls.filter((x) => x.fn === 'strokeText')) assert.equal(c.stroke, CAB_STYLE.outline, `${c.args[0]} outlined in black`);
  assert.deepEqual(texts(calls, 'strokeText'), texts(calls), 'every text outlined');
  // Each ring: a black stroke under it wider than the ring, a faint track,
  // then the white progress arc.
  const strokes = calls.filter((c) => c.fn === 'stroke');
  const outline = strokes.find((s) => s.stroke === CAB_STYLE.outline);
  const ring = strokes.find((s) => s.stroke === CAB_STYLE.fill);
  assert.ok(outline && ring);
  assert.ok(outline.lineWidth > ring.lineWidth, 'the outline shows on both sides of the ring');
  // CAB2's progress arc ends half way round, from the top.
  const arcs = calls.filter((c) => c.fn === 'arc');
  const half = arcs.find((a) => Math.abs(a.args[4] - (-Math.PI / 2 + Math.PI)) < 1e-9);
  assert.ok(half, 'an arc from the top to half way');
  assert.equal(half.args[3], -Math.PI / 2);
  // Nothing but white, its faint track and black: no green (the old HUD
  // rings' accent) anywhere.
  const used = new Set(calls.filter((c) => ['stroke', 'fillText', 'strokeText'].includes(c.fn)).map((c) => (c.fn === 'fillText' ? c.fill : c.stroke)));
  assert.deepEqual([...used].sort(), [CAB_STYLE.outline, CAB_STYLE.fill, CAB_STYLE.track].sort());
  // Both cooling: one row, CAB1 left of CAB2, under the feet (y below 300).
  fighter.combat.chargedCooldowns.start('ba1Clone', 5);
  ({ calls } = drawnRings(fighter));
  assert.deepEqual(texts(calls), ['5.0', 'CAB1', '2.5', 'CAB2']);
  const [l1, l2] = calls.filter((c) => c.fn === 'fillText' && /^CAB/.test(c.args[0]));
  assert.ok(l1.args[1] < 400 && l2.args[1] > 400, 'side by side, centred under the fighter');
  assert.ok(Math.abs((l1.args[1] + l2.args[1]) / 2 - 400) <= 1, 'the pair centred');
  assert.ok(l1.args[2] > 300 && l1.args[2] === l2.args[2], 'in one row below the feet');
  assert.ok(l2.args[1] - l1.args[1] > 20, 'apart enough not to overlap');
});

// ---- Stamina bar: only while below full ----------------------------------------

const DEFENSE = { defense: true, defensePressed: true };
// Two presses of `dir`, one step apart: a Dash's double tap.
const doubleTap = (step, dir = 'right') => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};
const BLOCKER = { ...def, defense: { type: 'block' } };
// The fill rectangles drawStaminaBar paints for `fighter`, or null when it
// draws nothing.
const barFills = (fighter, rect = { x: 100, y: 50, w: 52, h: 6 }) => {
  const { ctx, calls } = recorder();
  const drew = drawStaminaBar(ctx, fighter, rect, 1.2);
  assert.equal(drew, calls.length > 0);
  return drew ? calls.filter((x) => x.fn === 'fillRect').map((x) => ({ fill: x.fill, rect: x.args })) : null;
};
// Steps `step` with no input until the bar is hidden again, checking every
// step on the way: still shown, below full and never purple while exhausted.
// Returns the steps taken and the colours seen.
const refillUntilHidden = (fighter, step, held = {}) => {
  const colors = new Set();
  for (let i = 1; i <= 1200; i++) {
    step(held);
    const bar = staminaBarState(fighter);
    if (!bar.visible) {
      assert.equal(fighter.combat.stamina, fighter.combat.maxStamina, 'hidden exactly at full');
      assert.equal(fighter.combat.staminaExhausted, false);
      assert.equal(barFills(fighter), null);
      return { steps: i, colors };
    }
    assert.ok(fighter.combat.stamina < fighter.combat.maxStamina);
    if (bar.exhausted) assert.equal(bar.color, STAMINA_STYLE.exhausted, `gray at ${fighter.combat.stamina}`);
    colors.add(bar.color);
  }
  throw new Error('never refilled');
};

test('the stamina bar: hidden at full; purple over a dark track in a black outline, shrinking from the right; gray while exhausted', () => {
  const { fighter } = makeFighter();
  const c = fighter.combat;
  assert.deepEqual(staminaBarState(fighter), { visible: false, ratio: 1, exhausted: false, color: STAMINA_STYLE.fill });
  assert.equal(barFills(fighter), null, 'full: no bar at all');
  c.setStamina(50);
  let drawn = barFills(fighter);
  assert.deepEqual(drawn.map((d) => d.fill), [STAMINA_STYLE.outline, STAMINA_STYLE.track, STAMINA_STYLE.fill]);
  assert.equal(STAMINA_STYLE.outline, '#000000');
  assert.deepEqual(drawn[2].rect, [100, 50, 26, 6], 'half: the fill contracts');
  assert.deepEqual(staminaBarState(fighter), { visible: true, ratio: 0.5, exhausted: false, color: STAMINA_STYLE.fill });
  c.drainStamina(100);
  assert.deepEqual(staminaBarState(fighter), { visible: true, ratio: 0, exhausted: true, color: STAMINA_STYLE.exhausted });
  drawn = barFills(fighter);
  assert.deepEqual(drawn.map((d) => d.fill), [STAMINA_STYLE.outline, STAMINA_STYLE.track], 'empty: shown, with no fill at all');
  c.regenStamina(40);
  drawn = barFills(fighter);
  assert.equal(drawn[2].fill, STAMINA_STYLE.exhausted, 'refilling while exhausted: gray');
  assert.equal(drawn[2].rect[2], Math.round(52 * 0.4), 'as long as what has come back');
  c.regenStamina(59.9);
  assert.equal(barFills(fighter)[2].fill, STAMINA_STYLE.exhausted, 'still gray at 99.9');
  c.regenStamina(0.1);
  assert.equal(barFills(fighter), null, 'exactly full: gone, never a full purple bar');
  // Purple, not green: red and blue well above green.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(STAMINA_STYLE.fill.slice(i, i + 2), 16));
  assert.ok(r > g && b > g, STAMINA_STYLE.fill);
});

test('a fresh fighter shows no bar; a real Dash or Dodge brings it up at once, it stays through the refill and goes at full', () => {
  for (const [label, act] of [['Dash', (step) => doubleTap(step)], ['Dodge', (step) => step(DEFENSE)]]) {
    const { fighter, step } = makeFighter();
    assert.equal(staminaBarState(fighter).visible, false, `${label}: fresh, full, hidden`);
    act(step);
    assert.equal(fighter.combat.stamina, 75, `${label} spent 25`);
    assert.deepEqual(staminaBarState(fighter), { visible: true, ratio: 0.75, exhausted: false, color: STAMINA_STYLE.fill });
    assert.equal(barFills(fighter)[2].rect[2], 39, `${label}: shown at 75%`);
    const { steps: n, colors } = refillUntilHidden(fighter, step);
    assert.ok(n > 100, `${label}: shown for the whole refill (${n} steps)`);
    assert.deepEqual([...colors], [STAMINA_STYLE.fill], `${label}: an ordinary refill is purple throughout`);
  }
});

test('Charge only fills the bar faster: it still shows until full, and hides at full', () => {
  const normal = makeFighter();
  normal.fighter.combat.setStamina(40);
  const slow = refillUntilHidden(normal.fighter, normal.step).steps;
  const charging = makeFighter();
  charging.fighter.combat.setStamina(40);
  const fast = refillUntilHidden(charging.fighter, charging.step, { charge: true });
  assert.ok(fast.steps < slow * 0.5, `faster in Charge (${fast.steps} vs ${slow} steps)`);
  assert.deepEqual([...fast.colors], [STAMINA_STYLE.fill]);
});

test('the gray exhaustion cycle: exactly 0 turns it gray, gray through 25, 75 and 99, gone only when full', () => {
  const { fighter, step } = makeFighter({ character: BLOCKER });
  const c = fighter.combat;
  // A held Block runs it dry: exactly 0, exhausted, the guard dropped.
  for (let i = 0; i < 600 && !c.staminaExhausted; i++) {
    step({ defense: true });
    assert.equal(staminaBarState(fighter).color, c.staminaExhausted ? STAMINA_STYLE.exhausted : STAMINA_STYLE.fill);
  }
  assert.equal(c.stamina, 0);
  assert.equal(c.staminaExhausted, true);
  assert.deepEqual(staminaBarState(fighter), { visible: true, ratio: 0, exhausted: true, color: STAMINA_STYLE.exhausted });
  // Refilling by itself: gray, and locked, at every checkpoint.
  for (const mark of [25, 75, 99]) {
    while (c.stamina < mark) step();
    const bar = staminaBarState(fighter);
    assert.deepEqual([bar.visible, bar.exhausted, bar.color], [true, true, STAMINA_STYLE.exhausted], `still gray at ${c.stamina}`);
    assert.equal(barFills(fighter)[2].fill, STAMINA_STYLE.exhausted);
  }
  // The rest of the way: never purple before full, then gone the step it is.
  const { colors } = refillUntilHidden(fighter, step);
  assert.deepEqual([...colors], [STAMINA_STYLE.exhausted], 'no purple before it was full');
  assert.deepEqual([c.stamina, c.staminaExhausted], [c.maxStamina, false]);
});

// ---- On the stage ----------------------------------------------------------------

// A Battle on a recording canvas: a 1280 x 720 view over the stage, the
// theme's layers reduced to markers in the call list.
function renderedBattle() {
  const sprites = fakeSprites();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p2.controller = null;
  const { ctx, calls } = recorder();
  battle.ctx = ctx;
  const mark = (name) => () => calls.push({ fn: name, args: [] });
  battle.theme = {
    prepare() {}, update() {}, drawBackground: mark('background'), drawTerrain: mark('terrain'),
    drawForeground: mark('foreground'), drawVoid: mark('void'), shadow: { alpha: 0.3, skew: 0, stretch: 1 },
  };
  const { p1 } = battle;
  Object.assign(battle.view, { ctx, pxW: 1280, pxH: 720, scale: 1.2, x: p1.body.x - 533, y: p1.body.y - 420, w: 1066, h: 600 });
  battle.pxPerArt = 2;
  battle.setPhase('fight');
  const render = () => {
    calls.length = 0;
    battle.render();
    return calls;
  };
  return { battle, render };
}

test('in play: nothing over or under a fighter with full stamina and both CABs ready; its bar over its tag and rings under its feet once they show, drawn after the Void', () => {
  const { battle, render } = renderedBattle();
  const { p1, p2 } = battle;
  const purple = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill);
  let calls = render();
  assert.deepEqual(purple(calls), [], 'full: no bars');
  assert.ok(!texts(calls).some((t) => /^CAB/.test(t)), 'all ready: no rings');
  assert.deepEqual(texts(calls).sort(), ['CPU', 'P1'], 'only the name tags');
  // Nothing kept above the tag for a hidden bar.
  for (const f of [p1, p2]) assert.equal(battle.statusTop(f), battle.markerTop(f));
  // P1 spends stamina and uses CAB1: its bar and CAB1, nothing more; the
  // CPU still shows neither.
  p1.combat.setStamina(75);
  p1.combat.chargedCooldowns.start('ba1Clone', 5);
  calls = render();
  const at = (pred) => calls.findIndex(pred);
  const voidAt = at((c) => c.fn === 'void');
  assert.equal(purple(calls).length, 1, 'P1\'s bar only');
  assert.ok(at((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill) > voidAt, 'over the Void');
  assert.ok(at((c) => c.fn === 'fillText' && c.args[0] === 'CAB1') > voidAt);
  assert.deepEqual(texts(calls).filter((t) => /^CAB/.test(t)), ['CAB1'], 'P1\'s CAB1 only');
  // Stacked: bar, then the tag, then the fighter; the ring below its feet.
  const bar = battle.staminaBarRect(p1);
  const [x, , footY] = battle.markerAnchor(p1);
  assert.ok(bar.y + bar.h < battle.markerTop(p1), 'the bar sits clear above the name tag');
  assert.ok(Math.abs(bar.x + bar.w / 2 - x) <= 1, 'centred over the fighter');
  assert.ok(bar.w >= 44, 'never too small to read: 44 CSS px at least');
  assert.deepEqual(purple(calls)[0].args.slice(0, 2), [bar.x, bar.y]);
  assert.equal(battle.statusTop(p1), bar.y - 1, 'the bar is now the top');
  assert.equal(battle.statusTop(p2), battle.markerTop(p2));
  const tag = calls.find((c) => c.fn === 'fillText' && c.args[0] === p1.label);
  assert.ok(tag.args[2] > bar.y + bar.h, 'P1\'s tag under its bar');
  const label = calls.find((c) => c.fn === 'fillText' && c.args[0] === 'CAB1');
  assert.ok(label.args[2] > footY, 'the ring under the feet');
  assert.ok(Math.abs(label.args[1] - x) <= 1, 'alone: centred under the fighter');
  // The bar follows the interpolated position, not the raw body.
  p1.renderX = p1.body.x + 30;
  const moved = battle.staminaBarRect(p1);
  const [mx] = battle.markerAnchor(p1);
  assert.ok(Math.abs(moved.x + moved.w / 2 - mx) <= 1);
  assert.equal(battle.markerAnchor(p1)[0], battle.toScreen(p1.renderX, p1.renderY)[0]);
});

test('no bar, rings or tag for a fighter out of play (waiting to respawn); back, it starts full and ready, so shows none; off screen only its edge pointer', () => {
  const { battle, render } = renderedBattle();
  const { p1, p2 } = battle;
  const purple = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill);
  const spend = (f) => {
    f.combat.setStamina(50);
    f.combat.chargedCooldowns.start('ba1Clone', 5);
  };
  spend(p1);
  spend(p2);
  assert.equal(purple(render()).length, 2);
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  let calls = render();
  assert.equal(purple(calls).length, 1, 'Player 1\'s only');
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1);
  assert.ok(!texts(calls).includes('CPU'), 'no tag either');
  // Back after its wait: full stamina and every cooldown ready, so only its
  // tag shows.
  for (let i = 0; i < 120; i++) battle.update(DT);
  assert.equal(p2.lostToVoid, false);
  assert.equal(p2.combat.stamina, p2.combat.maxStamina);
  assert.deepEqual(cabIndicators(p2), []);
  assert.equal(staminaBarState(p2).visible, false);
  calls = render();
  assert.ok(texts(calls).includes('CPU'));
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1, 'P1\'s CAB1, still cooling');
  assert.equal(purple(calls).length, 1, 'P1\'s bar, still refilling');
  // Off screen, with something to show: the tag's edge pointer only.
  spend(p2);
  p2.renderX = battle.view.x + battle.view.w + 400;
  calls = render();
  assert.equal(purple(calls).length, 1);
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1);
  assert.ok(texts(calls).includes('CPU'), 'the edge pointer still names it');
  assert.ok(p1.combat.stamina < p1.combat.maxStamina);
  const view = { pxW: 1280, pxH: 720 };
  assert.equal(statusOnScreen(640, 400, view), true);
  assert.equal(statusOnScreen(-40, 400, view), false);
  assert.equal(statusOnScreen(1330, 400, view), false);
  assert.equal(statusOnScreen(640, -40, view), false);
});

test('the rings and bar are canvas-drawn, never DOM in a HUD card', () => {
  const hud = readFileSync(new URL('../js/game/hud.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(hud, /CAB|cooldown|chargedCooldowns/i, 'the HUD knows nothing of them');
  const status = readFileSync(new URL('../js/game/fighter-status.js', import.meta.url), 'utf8');
  assert.doesNotMatch(status, /document\.|createElement/, 'no DOM');
  assert.doesNotMatch(status, /energy/i, 'stamina is not Energy');
  const arena = readFileSync(new URL('../js/game/arena.js', import.meta.url), 'utf8');
  assert.match(arena, /drawVoid[\s\S]*drawStatus\(fighters\)/, 'drawn after the Void');
});
