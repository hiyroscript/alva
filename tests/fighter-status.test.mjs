// Run with node --test tests/fighter-status.test.mjs (no dependencies).
// The status drawn with each fighter on the Arena canvas: the purple
// three-segment Energy bar over its name tag, only while below full (gray
// through an exhaustion's whole refill), and the CAB1 / CAB2 cooldown rings
// under its feet, only while cooling down. The state helpers are checked directly;
// the drawing through a
// canvas context that records what it is asked to paint (layout and paint
// themselves still need a real browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import {
  cabIndicators, energyBarState, energySegmentRects, formatCooldown, drawCabIndicators, drawEnergyBar, statusOnScreen,
  CAB_STYLE, ENERGY_STYLE, ENERGY_SEGMENTS, CHARGED_LABELS,
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

// ---- Energy bar: three segments, only while below full ------------------------

const HOLD = { defense: true };
// Two presses of `dir`, one step apart: a Dash's double tap.
const doubleTap = (step, dir = 'right') => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};
const RECT = { x: 100, y: 50, w: 54, h: 6 };
// What drawEnergyBar paints for `fighter` in RECT at dpr 1: per segment, its
// outline, track and (if any) fill rectangles, or null when it draws nothing.
const barDrawing = (fighter, rect = RECT, dpr = 1) => {
  const { ctx, calls } = recorder();
  const drew = drawEnergyBar(ctx, fighter, rect, dpr);
  assert.equal(drew, calls.length > 0);
  return drew ? calls.filter((x) => x.fn === 'fillRect').map((x) => ({ fill: x.fill, rect: x.args })) : null;
};
const fillsOf = (drawing, color) => drawing.filter((d) => d.fill === color).map((d) => d.rect);
// Steps `step` with `held` until the bar is hidden again, checking every
// step on the way: still shown, below full and never purple while exhausted.
// Returns the steps taken and the colours seen.
const refillUntilHidden = (fighter, step, held = {}) => {
  const colors = new Set();
  for (let i = 1; i <= 1200; i++) {
    step(held);
    const bar = energyBarState(fighter);
    if (!bar.visible) {
      assert.equal(fighter.combat.energy, fighter.combat.maxEnergy, 'hidden exactly at full');
      assert.equal(fighter.combat.energyExhausted, false);
      assert.equal(barDrawing(fighter), null);
      return { steps: i, colors };
    }
    assert.ok(fighter.combat.energy < fighter.combat.maxEnergy);
    if (bar.exhausted) assert.equal(bar.color, ENERGY_STYLE.exhausted, `gray at ${fighter.combat.energy}`);
    colors.add(bar.color);
  }
  throw new Error('never refilled');
};

test('the segments\' layout: three adjacent tracks with small gaps, spanning exactly the bar\'s compact footprint', () => {
  for (const [rect, dpr] of [[RECT, 1], [{ x: 10, y: 5, w: 44, h: 4 }, 1], [{ x: 0, y: 0, w: 96, h: 9 }, 2], [{ x: 3, y: 7, w: 61, h: 5 }, 1.5]]) {
    const segs = energySegmentRects(rect, dpr);
    assert.equal(segs.length, 3);
    assert.equal(segs[0].x, rect.x, 'starts where the bar does');
    assert.equal(segs[2].x + segs[2].w, rect.x + rect.w, 'ends where the bar does: the old footprint');
    const o = Math.max(1, Math.round(dpr));
    for (let i = 0; i < 3; i++) {
      const s = segs[i];
      assert.deepEqual([s.y, s.h], [rect.y, rect.h]);
      assert.ok(Number.isInteger(s.x) && Number.isInteger(s.w) && s.w > 0, 'whole pixels');
      if (i) {
        const gap = s.x - (segs[i - 1].x + segs[i - 1].w);
        assert.ok(gap > 2 * o, `a clear gap between the outlines (${gap} px)`);
        assert.ok(gap <= 3 * o + 1, 'a small one');
      }
    }
    // As wide as their shares (34 : 33 : 33), to the pixel.
    const inner = segs.reduce((a, s) => a + s.w, 0);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(segs[i].w - (inner * ENERGY_SEGMENTS[i]) / 100) <= 1, `segment ${i}`);
  }
});

test('the Energy bar: hidden at full; three purple segments on dark tracks in black outlines, the front one spent first; gray while exhausted', () => {
  const { fighter } = makeFighter();
  const c = fighter.combat;
  const bar = energyBarState(fighter);
  assert.deepEqual([bar.visible, bar.energy, bar.maxEnergy, bar.exhausted, bar.color], [false, 100, 100, false, ENERGY_STYLE.fill]);
  assert.equal(barDrawing(fighter), null, 'full: no bar, no empty placeholders');
  const [front, middle, back] = energySegmentRects(RECT, 1);
  c.setEnergy(75);
  let drawn = barDrawing(fighter);
  assert.equal(fillsOf(drawn, ENERGY_STYLE.outline).length, 3, 'three outlined segments');
  assert.equal(fillsOf(drawn, ENERGY_STYLE.track).length, 3);
  assert.equal(ENERGY_STYLE.outline, '#000000');
  let fills = fillsOf(drawn, ENERGY_STYLE.fill);
  // 75: the front one keeps 9 of its 34, held against its back end; the
  // middle and back ones are full.
  const part = Math.round(front.w * (9 / 34));
  assert.deepEqual(fills, [
    [front.x + front.w - part, front.y, part, front.h],
    [middle.x, middle.y, middle.w, middle.h],
    [back.x, back.y, back.w, back.h],
  ]);
  // 50: the front one gone, the middle half, the back full.
  c.setEnergy(50);
  fills = fillsOf(barDrawing(fighter), ENERGY_STYLE.fill);
  assert.equal(fills.length, 2);
  assert.deepEqual(fills[0], [middle.x + middle.w - Math.round(middle.w * 17 / 33), middle.y, Math.round(middle.w * 17 / 33), middle.h]);
  assert.deepEqual(fills[1], [back.x, back.y, back.w, back.h]);
  // 0: shown, gray-ready, with no fill at all.
  c.setEnergy(0);
  const empty = energyBarState(fighter);
  assert.deepEqual([empty.visible, empty.exhausted, empty.color], [true, true, ENERGY_STYLE.exhausted]);
  drawn = barDrawing(fighter);
  assert.equal(fillsOf(drawn, ENERGY_STYLE.outline).length, 3);
  assert.equal(drawn.filter((d) => d.fill !== ENERGY_STYLE.outline && d.fill !== ENERGY_STYLE.track).length, 0, 'empty');
  // Refilling while exhausted: gray, from the back segment.
  c.regenEnergy(25);
  fills = fillsOf(barDrawing(fighter), ENERGY_STYLE.exhausted);
  assert.equal(fills.length, 1, 'only the back segment has any yet');
  assert.equal(fills[0][0] + fills[0][2], back.x + back.w);
  assert.equal(fillsOf(barDrawing(fighter), ENERGY_STYLE.fill).length, 0, 'never purple while exhausted');
  c.regenEnergy(74.9);
  assert.equal(fillsOf(barDrawing(fighter), ENERGY_STYLE.exhausted).length, 3, 'still gray at 99.9, all three');
  c.regenEnergy(0.1);
  assert.equal(barDrawing(fighter), null, 'exactly full: gone, never a full purple bar');
  // Purple, not green (nor the Shield's red): red and blue well above green.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ENERGY_STYLE.fill.slice(i, i + 2), 16));
  assert.ok(r > g && b > g, ENERGY_STYLE.fill);
  assert.ok(b > 0xc0, 'blue enough to read purple, never red');
});

test('a fresh fighter shows no bar; a real Dash or blocked hit brings it up at once, it stays through the refill and goes at full', () => {
  const dashed = makeFighter();
  assert.equal(energyBarState(dashed.fighter).visible, false, 'fresh, full, hidden');
  doubleTap(dashed.step);
  const d = duel();
  d.tick({}, HOLD);
  d.tick({ action1: true, action1Pressed: true }, HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  assert.equal(d.events[0].type, 'block');
  for (const [label, fighter, step] of [['Dash', dashed.fighter, dashed.step], ['block', d.target, (held) => d.tick({}, held)]]) {
    assert.equal(fighter.combat.energy, 75, `${label} spent 25`);
    const bar = energyBarState(fighter);
    assert.deepEqual([bar.visible, bar.exhausted, bar.color], [true, false, ENERGY_STYLE.fill], label);
    assert.deepEqual(bar.segments.map((s) => s.ratio), [9 / 34, 1, 1], `${label}: the front segment spent`);
    const { steps: n, colors } = refillUntilHidden(fighter, step);
    assert.ok(n > 100, `${label}: shown for the whole refill (${n} steps)`);
    assert.deepEqual([...colors], [ENERGY_STYLE.fill], `${label}: an ordinary refill is purple throughout`);
  }
});

test('Charge only fills the bar faster: it still shows until full, and hides at full', () => {
  const normal = makeFighter();
  normal.fighter.combat.setEnergy(40);
  const slow = refillUntilHidden(normal.fighter, normal.step).steps;
  const charging = makeFighter();
  charging.fighter.combat.setEnergy(40);
  const fast = refillUntilHidden(charging.fighter, charging.step, { charge: true });
  assert.ok(fast.steps < slow * 0.5, `faster in Charge (${fast.steps} vs ${slow} steps)`);
  assert.deepEqual([...fast.colors], [ENERGY_STYLE.fill]);
});

test('the gray exhaustion cycle: exactly 0 turns all three gray, gray through 25, 75 and 99, gone only when full', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  step({ rightPressed: true, right: true });
  step({});
  c.setEnergy(25);
  step({ rightPressed: true, right: true });
  assert.ok(fighter.dash, 'a Dash spent the last 25');
  assert.equal(c.energy, 0);
  assert.equal(c.energyExhausted, true);
  assert.deepEqual(energyBarState(fighter).segments.map((s) => s.ratio), [0, 0, 0]);
  assert.equal(energyBarState(fighter).color, ENERGY_STYLE.exhausted);
  // Refilling by itself: gray at every checkpoint.
  for (const mark of [25, 75, 99]) {
    while (c.energy < mark) step();
    const bar = energyBarState(fighter);
    assert.deepEqual([bar.visible, bar.exhausted, bar.color], [true, true, ENERGY_STYLE.exhausted], `still gray at ${c.energy}`);
    assert.equal(fillsOf(barDrawing(fighter), ENERGY_STYLE.fill).length, 0);
    assert.ok(fillsOf(barDrawing(fighter), ENERGY_STYLE.exhausted).length > 0);
  }
  // The rest of the way: never purple before full, then gone the step it is.
  const { colors } = refillUntilHidden(fighter, step);
  assert.deepEqual([...colors], [ENERGY_STYLE.exhausted], 'no purple before it was full');
  assert.deepEqual([c.energy, c.energyExhausted], [c.maxEnergy, false]);
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

test('in play: nothing over or under a fighter with full Energy and both CABs ready; its bar over its tag and rings under its feet once they show, drawn after the Void', () => {
  const { battle, render } = renderedBattle();
  const { p1, p2 } = battle;
  // A fighter's bar: its three segment outlines, black fillRects of the
  // bar's height plus the outline (the CAB rings are strokes and text).
  const bars = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.outline);
  const purple = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.fill);
  let calls = render();
  assert.deepEqual(bars(calls), [], 'full: no bars');
  assert.ok(!texts(calls).some((t) => /^CAB/.test(t)), 'all ready: no rings');
  assert.deepEqual(texts(calls).sort(), ['CPU', 'P1'], 'only the name tags');
  // Nothing kept above the tag for a hidden bar.
  for (const f of [p1, p2]) assert.equal(battle.statusTop(f), battle.markerTop(f));
  // P1 spends Energy and uses CAB1: its bar and CAB1, nothing more; the
  // CPU still shows neither.
  p1.combat.setEnergy(75);
  p1.combat.chargedCooldowns.start('ba1Clone', 5);
  calls = render();
  const at = (pred) => calls.findIndex(pred);
  const voidAt = at((c) => c.fn === 'void');
  assert.equal(bars(calls).length, 3, 'P1\'s three segments only');
  assert.equal(purple(calls).length, 3);
  assert.ok(at((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.fill) > voidAt, 'over the Void');
  assert.ok(at((c) => c.fn === 'fillText' && c.args[0] === 'CAB1') > voidAt);
  assert.deepEqual(texts(calls).filter((t) => /^CAB/.test(t)), ['CAB1'], 'P1\'s CAB1 only');
  // Stacked: bar, then the tag, then the fighter; the ring below its feet.
  const bar = battle.energyBarRect(p1);
  const [x, , footY] = battle.markerAnchor(p1);
  assert.ok(bar.y + bar.h < battle.markerTop(p1), 'the bar sits clear above the name tag');
  assert.ok(Math.abs(bar.x + bar.w / 2 - x) <= 1, 'centred over the fighter');
  assert.ok(bar.w >= 44, 'never too small to read: 44 CSS px at least');
  assert.ok(bar.w <= 70, 'the three segments together keep the old compact footprint');
  const segs = energySegmentRects(bar, battle.view.dpr);
  assert.deepEqual(purple(calls).map((c) => c.args.slice(1, 4)), [
    [bar.y, Math.round(segs[0].w * 9 / 34), bar.h], [bar.y, segs[1].w, bar.h], [bar.y, segs[2].w, bar.h],
  ]);
  assert.equal(purple(calls).at(-1).args[0] + purple(calls).at(-1).args[2], bar.x + bar.w, 'the back segment ends the bar');
  assert.equal(battle.statusTop(p1), bar.y - 1, 'the bar is now the top');
  assert.equal(battle.statusTop(p2), battle.markerTop(p2));
  const tag = calls.find((c) => c.fn === 'fillText' && c.args[0] === p1.label);
  assert.ok(tag.args[2] > bar.y + bar.h, 'P1\'s tag under its bar');
  const label = calls.find((c) => c.fn === 'fillText' && c.args[0] === 'CAB1');
  assert.ok(label.args[2] > footY, 'the ring under the feet');
  assert.ok(Math.abs(label.args[1] - x) <= 1, 'alone: centred under the fighter');
  // The bar follows the interpolated position, not the raw body.
  p1.renderX = p1.body.x + 30;
  const moved = battle.energyBarRect(p1);
  const [mx] = battle.markerAnchor(p1);
  assert.ok(Math.abs(moved.x + moved.w / 2 - mx) <= 1);
  assert.equal(battle.markerAnchor(p1)[0], battle.toScreen(p1.renderX, p1.renderY)[0]);
});

test('no bar, rings or tag for a fighter out of play (waiting to respawn); back, it starts full and ready, so shows none; off screen only its edge pointer', () => {
  const { battle, render } = renderedBattle();
  const { p1, p2 } = battle;
  // How many fighters' bars are drawn: three black segment outlines each.
  const barsDrawn = (calls) => {
    const outlines = calls.filter((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.outline).length;
    assert.equal(outlines % 3, 0, 'whole bars only');
    return { length: outlines / 3 };
  };
  const spend = (f) => {
    f.combat.setEnergy(50);
    f.combat.chargedCooldowns.start('ba1Clone', 5);
  };
  spend(p1);
  spend(p2);
  assert.equal(barsDrawn(render()).length, 2);
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  let calls = render();
  assert.equal(barsDrawn(calls).length, 1, 'Player 1\'s only');
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1);
  assert.ok(!texts(calls).includes('CPU'), 'no tag either');
  // Back after its wait: full Energy and every cooldown ready, so only its
  // tag shows.
  for (let i = 0; i < 120; i++) battle.update(DT);
  assert.equal(p2.lostToVoid, false);
  assert.equal(p2.combat.energy, p2.combat.maxEnergy);
  assert.deepEqual(cabIndicators(p2), []);
  assert.equal(energyBarState(p2).visible, false);
  calls = render();
  assert.ok(texts(calls).includes('CPU'));
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1, 'P1\'s CAB1, still cooling');
  assert.equal(barsDrawn(calls).length, 1, 'P1\'s bar, still refilling');
  // Off screen, with something to show: the tag's edge pointer only.
  spend(p2);
  p2.renderX = battle.view.x + battle.view.w + 400;
  calls = render();
  assert.equal(barsDrawn(calls).length, 1);
  assert.equal(texts(calls).filter((t) => t === 'CAB1').length, 1);
  assert.ok(texts(calls).includes('CPU'), 'the edge pointer still names it');
  assert.ok(p1.combat.energy < p1.combat.maxEnergy);
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
  assert.doesNotMatch(status, /stamina/i, 'Energy, never the old Stamina');
  const arena = readFileSync(new URL('../js/game/arena.js', import.meta.url), 'utf8');
  assert.match(arena, /drawVoid[\s\S]*drawStatus\(fighters\)/, 'drawn after the Void');
});
