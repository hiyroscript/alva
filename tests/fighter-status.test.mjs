// Run with node --test tests/fighter-status.test.mjs (no dependencies).
// The status drawn with each fighter on the Arena canvas: the purple
// stamina bar over its name tag and the CAB1 / CAB2 cooldown rings under
// its feet. The state helpers are checked directly; the drawing through a
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

test('CAB1 and CAB2: one indicator per charged action, named after its button, never plain BA1 / BA2', () => {
  assert.deepEqual({ ...CHARGED_LABELS }, { action1: 'CAB1', action2: 'CAB2' });
  const { fighter } = makeFighter();
  const list = cabIndicators(fighter);
  assert.deepEqual(list.map((c) => [c.label, c.id, c.action]), [['CAB1', 'ba1Clone', 'action1'], ['CAB2', 'rasenRush', 'action2']]);
  for (const c of list) assert.deepEqual([c.progress, c.ready, c.text], [1, true, ''], `${c.label} ready: complete, no number`);
});

test('the rings read the real cooldowns: empty as one starts, half way at half, the seconds left counting down, complete when ready', () => {
  const { fighter } = makeFighter();
  const cd = fighter.combat.chargedCooldowns;
  cd.start('ba1Clone', 5);
  let [cab1, cab2] = cabIndicators(fighter);
  assert.deepEqual([cab1.progress, cab1.ready, cab1.text], [0, false, '5.0']);
  assert.deepEqual([cab2.progress, cab2.ready], [1, true], 'CAB2 is its own');
  for (const [dt, text, progress] of [[0.7, '4.3', 0.14], [1.8, '2.5', 0.5], [1.7, '0.8', 0.84]]) {
    cd.update(dt);
    [cab1] = cabIndicators(fighter);
    assert.equal(cab1.text, text);
    assert.ok(Math.abs(cab1.progress - progress) < 1e-9, `progress = 1 - remaining / duration (${cab1.progress})`);
  }
  cd.update(0.8);
  [cab1] = cabIndicators(fighter);
  assert.deepEqual([cab1.progress, cab1.ready, cab1.text], [1, true, '']);
  // Never 0.0 while still cooling down.
  assert.equal(formatCooldown(0.01), '0.1');
  assert.equal(formatCooldown(4.3), '4.3');
  assert.equal(formatCooldown(4.31), '4.4');
});

test('a real Charged BA1 starts CAB1\'s ring at once, and Charge fills it faster', () => {
  const d = duel();
  d.tick({ charge: true });
  d.tick({ charge: true, action1: true, action1Pressed: true });
  assert.equal(d.clones.length, 1);
  let [cab1, cab2] = cabIndicators(d.attacker);
  assert.deepEqual([cab1.text, cab1.progress], ['5.0', 0]);
  assert.equal(cab2.ready, true);
  assert.ok(cabIndicators(d.target).every((c) => c.ready), 'the other fighter\'s rings do not move');
  // Half a second of Charge takes a whole second off.
  for (let i = 0; i < 30; i++) d.tick({ charge: true });
  [cab1] = cabIndicators(d.attacker);
  assert.equal(cab1.text, '4.0');
  assert.ok(Math.abs(cab1.progress - 0.2) < 1e-9);
});

test('CAB rings are white with a black outline: ring, number and label; never green', () => {
  assert.equal(CAB_STYLE.fill, '#ffffff');
  assert.equal(CAB_STYLE.outline, '#000000');
  const { fighter } = makeFighter();
  fighter.combat.chargedCooldowns.start('rasenRush', 5);
  fighter.combat.chargedCooldowns.update(2.5);
  const { ctx, calls } = recorder();
  drawCabIndicators(ctx, fighter, 400, 300, 1.2);
  assert.deepEqual(texts(calls), ['CAB1', '2.5', 'CAB2'], 'CAB1 ready (no number), CAB2 cooling (2.5 left)');
  for (const c of calls.filter((x) => x.fn === 'fillText')) assert.equal(c.fill, CAB_STYLE.fill, `${c.args[0]} in white`);
  for (const c of calls.filter((x) => x.fn === 'strokeText')) assert.equal(c.stroke, CAB_STYLE.outline, `${c.args[0]} outlined in black`);
  assert.deepEqual(texts(calls, 'strokeText'), texts(calls), 'every text outlined');
  // Each ring: a black stroke under it wider than the ring, a faint track,
  // then the white progress arc.
  const strokes = calls.filter((c) => c.fn === 'stroke');
  assert.ok(strokes.some((s) => s.stroke === CAB_STYLE.outline));
  assert.ok(strokes.some((s) => s.stroke === CAB_STYLE.fill));
  const outline = strokes.find((s) => s.stroke === CAB_STYLE.outline);
  const ring = strokes.find((s) => s.stroke === CAB_STYLE.fill);
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
  // One row, CAB1 left of CAB2, under the feet (y below 300).
  const [l1, , l2] = calls.filter((c) => c.fn === 'fillText');
  assert.ok(l1.args[1] < 400 && l2.args[1] > 400, 'side by side, centred under the fighter');
  assert.ok(l1.args[2] > 300 && l1.args[2] === l2.args[2], 'in one row below the feet');
  assert.ok(l2.args[1] - l1.args[1] > 20, 'apart enough not to overlap');
});

test('the stamina bar: purple over a dark track in a black outline, shrinking from the right; gray while exhausted', () => {
  const { fighter } = makeFighter();
  const c = fighter.combat;
  const rect = { x: 100, y: 50, w: 52, h: 6 };
  const bars = () => {
    const { ctx, calls } = recorder();
    drawStaminaBar(ctx, fighter, rect, 1.2);
    return calls.filter((x) => x.fn === 'fillRect').map((x) => ({ fill: x.fill, rect: x.args }));
  };
  let drawn = bars();
  assert.deepEqual(drawn.map((d) => d.fill), [STAMINA_STYLE.outline, STAMINA_STYLE.track, STAMINA_STYLE.fill]);
  assert.equal(STAMINA_STYLE.outline, '#000000');
  assert.deepEqual(drawn[2].rect, [100, 50, 52, 6], 'full');
  c.setStamina(50);
  drawn = bars();
  assert.deepEqual(drawn[2].rect, [100, 50, 26, 6], 'half: the fill contracts');
  assert.deepEqual(staminaBarState(fighter), { ratio: 0.5, exhausted: false, color: STAMINA_STYLE.fill });
  c.drainStamina(100);
  drawn = bars();
  assert.equal(drawn.length, 2, 'empty: no fill at all');
  c.regenStamina(40);
  drawn = bars();
  assert.equal(drawn[2].fill, STAMINA_STYLE.exhausted, 'refilling while exhausted: gray');
  assert.equal(drawn[2].rect[2], Math.round(52 * 0.4), 'as long as what has come back');
  c.regenStamina(59.9);
  assert.equal(bars()[2].fill, STAMINA_STYLE.exhausted, 'still gray at 99.9');
  c.regenStamina(0.1);
  assert.equal(bars()[2].fill, STAMINA_STYLE.fill, 'purple again at exactly full');
  // Purple, not green: red and blue well above green.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(STAMINA_STYLE.fill.slice(i, i + 2), 16));
  assert.ok(r > g && b > g, STAMINA_STYLE.fill);
});

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

test('in play, each fighter gets its bar over its name tag and its rings under its feet, drawn after the Void', () => {
  const { battle, render } = renderedBattle();
  const { p1, p2 } = battle;
  const calls = render();
  const at = (pred) => calls.findIndex(pred);
  const voidAt = at((c) => c.fn === 'void');
  const purple = calls.filter((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill);
  assert.equal(purple.length, 2, 'one bar per fighter');
  assert.ok(at((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill) > voidAt, 'over the Void');
  assert.ok(at((c) => c.fn === 'fillText' && c.args[0] === 'CAB1') > voidAt);
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 2);
  assert.equal(texts(calls).filter((t) => t === 'CAB2').length, 2);
  // Stacked: bar, then the tag, then the fighter; the rings below its feet.
  for (const f of [p1, p2]) {
    const bar = battle.staminaBarRect(f);
    const [x, , footY] = battle.markerAnchor(f);
    assert.ok(bar.y + bar.h < battle.markerTop(f), 'the bar sits clear above the name tag');
    assert.ok(Math.abs(bar.x + bar.w / 2 - x) <= 1, 'centred over the fighter');
    assert.ok(bar.w >= 44, 'never too small to read: 44 CSS px at least');
    const tag = calls.find((c) => c.fn === 'fillText' && c.args[0] === f.label);
    assert.ok(tag.args[2] > bar.y + bar.h, `${f.label}'s tag under its bar`);
    const label = calls.filter((c) => c.fn === 'fillText' && c.args[0] === 'CAB1').find((c) => Math.abs(c.args[1] - x) < 60);
    assert.ok(label.args[2] > footY, 'the rings under the feet');
  }
  // The bar follows the interpolated position, not the raw body.
  p1.renderX = p1.body.x + 30;
  const moved = battle.staminaBarRect(p1);
  const [mx] = battle.markerAnchor(p1);
  assert.ok(Math.abs(moved.x + moved.w / 2 - mx) <= 1);
  assert.equal(battle.markerAnchor(p1)[0], battle.toScreen(p1.renderX, p1.renderY)[0]);
});

test('no bar, rings or tag for a fighter out of play (waiting to respawn), and none but its edge pointer off screen', () => {
  const { battle, render } = renderedBattle();
  const { p2 } = battle;
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  let calls = render();
  assert.equal(calls.filter((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill).length, 1, 'Player 1\'s only');
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1);
  assert.ok(!texts(calls).includes('CPU'), 'no tag either');
  // Back after its wait: everything shows again, the rings ready.
  for (let i = 0; i < 120; i++) battle.update(DT);
  assert.equal(p2.lostToVoid, false);
  calls = render();
  assert.equal(texts(calls).filter((t) => t === 'CAB2').length, 2);
  assert.ok(cabIndicators(p2).every((c) => c.ready));
  // Off screen: the tag's edge pointer only.
  p2.renderX = battle.view.x + battle.view.w + 400;
  calls = render();
  assert.equal(calls.filter((c) => c.fn === 'fillRect' && c.fill === STAMINA_STYLE.fill).length, 1);
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1);
  assert.ok(texts(calls).includes('CPU'), 'the edge pointer still names it');
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
