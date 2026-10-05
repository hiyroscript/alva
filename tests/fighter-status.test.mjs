// Run with node --test tests/fighter-status.test.mjs (no dependencies).
// The status drawn with each fighter on the Arena canvas: the bright purple
// Energy bar over its name tag, only while below full (gray
// through an exhaustion's whole refill), and the A3 / A4 cooldown rings of
// #0001's direct Attack 3 and Attack 4 (the Clone Attack's summon and the
// Sphere Rush technique) under its feet, only while cooling down. The state
// helpers are checked directly; the drawing through a canvas context that
// records what it is asked to paint (layout and paint themselves still
// need a real browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../js/game/battle.js';
import { getMap } from '../js/data/maps.js';
import {
  cooldownIndicators, energyBarState, formatCooldown, drawCooldownIndicators, drawEnergyBar, statusOnScreen,
  COOLDOWN_STYLE, ENERGY_STYLE, cooldownLabel,
} from '../js/game/rendering/fighter-status.js';
import { specialAttacks } from '../js/data/loadout.js';
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

const labels = (fighter) => cooldownIndicators(fighter).map((c) => c.label);
// What drawCooldownIndicators paints for `fighter` under feet at (400, 300):
// each ring's label (A3, A4) and its x, in drawing order.
const drawnRings = (fighter) => {
  const { ctx, calls } = recorder();
  const count = drawCooldownIndicators(ctx, fighter, 400, 300, 1.2);
  const rings = calls.filter((c) => c.fn === 'fillText' && /^A\d$/.test(c.args[0])).map((c) => ({ label: c.args[0], x: c.args[1] }));
  assert.equal(count, rings.length);
  return { rings, calls };
};

// ---- A3 / A4: only while cooling down ------------------------------------

test('A3 and A4 are named after the attacks they are (attack3, attack4), each its own button; ready, neither has any indicator at all', () => {
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map(cooldownLabel), ['A1', 'A2', 'A3', 'A4', 'A5']);
  assert.equal(cooldownLabel('midair_attack3'), 'A3');
  assert.equal(cooldownLabel('extra_attack'), 'EXTRA_ATTACK');
  const { fighter } = makeFighter();
  assert.deepEqual(specialAttacks(def), ['attack3', 'attack4'], 'its summon and its technique, each on its own button');
  assert.deepEqual(cooldownIndicators(fighter), [], 'both ready: no entries, not ready ones made invisible');
  const { rings, calls } = drawnRings(fighter);
  assert.deepEqual(rings, []);
  assert.deepEqual(calls, [], 'nothing under the fighter: no ring, label, number or empty slot');
  // Each one is its own: A4 alone, then A3 alone.
  fighter.combat.abilityCooldowns.start('attack4', 5);
  assert.deepEqual(cooldownIndicators(fighter).map((c) => [c.label, c.id]), [['A4', 'attack4']]);
  fighter.combat.abilityCooldowns.clear();
  fighter.combat.abilityCooldowns.start('attack3', 5);
  assert.deepEqual(cooldownIndicators(fighter).map((c) => [c.label, c.id]), [['A3', 'attack3']]);
  assert.deepEqual(Object.keys(cooldownIndicators(fighter)[0]).sort(), ['id', 'label', 'progress', 'text']);
});

test('the rings read the real cooldowns: empty as one starts, half way at half, the seconds left counting down, gone when ready', () => {
  const { fighter } = makeFighter();
  const cd = fighter.combat.abilityCooldowns;
  cd.start('attack3', 5);
  let [attack3, attack4] = cooldownIndicators(fighter);
  assert.deepEqual([attack3.label, attack3.progress, attack3.text], ['A3', 0, '5.0']);
  assert.equal(attack4, undefined, 'A4 is ready: absent');
  for (const [dt, text, progress] of [[0.7, '4.3', 0.14], [1.8, '2.5', 0.5], [1.7, '0.8', 0.84]]) {
    cd.update(dt);
    [attack3] = cooldownIndicators(fighter);
    assert.equal(attack3.text, text);
    assert.ok(Math.abs(attack3.progress - progress) < 1e-9, `progress = 1 - remaining / duration (${attack3.progress})`);
  }
  cd.update(0.8);
  assert.equal(cd.active('attack3'), false);
  assert.deepEqual(cooldownIndicators(fighter), [], 'ready: removed, not left complete');
  // Never 0.0 while still cooling down.
  assert.equal(formatCooldown(0.01), '0.1');
  assert.equal(formatCooldown(4.3), '4.3');
  assert.equal(formatCooldown(4.31), '4.4');
});

test('real attack3 then attack4: A3 appears at once, A4 joins it, A3 goes first, the last one leaves nothing', () => {
  const d = duel({ gap: 200 });
  const f = d.attacker;
  const cd = f.combat.abilityCooldowns;
  d.tick({});
  assert.deepEqual(labels(f), []);
  // A3 used: its ring on the very step, as #0001's summoning startup
  // begins (the clone follows it), A4 still absent.
  d.tick({ attack3: true, attack3Pressed: true });
  assert.equal(f.state, 'summon');
  assert.equal(d.clones.length, 0);
  let [attack3, attack4] = cooldownIndicators(f);
  assert.deepEqual([attack3.label, attack3.text, attack3.progress], ['A3', '5.0', 0]);
  assert.equal(attack4, undefined);
  assert.deepEqual(labels(d.target), [], 'the other fighter shows nothing');
  // In real time, whatever is held: half a second, Down held or not, takes
  // half a second off.
  for (let i = 0; i < 30; i++) d.tick(i % 2 ? { down: true } : {});
  assert.equal(d.clones.length, 1, 'the clone is out by now');
  [attack3] = cooldownIndicators(f);
  assert.equal(attack3.text, '4.5');
  assert.ok(Math.abs(attack3.progress - 0.1) < 1e-9);
  // A4 used while A3 cools: both, side by side, A3 on the left.
  d.tick({ attack4: true, attack4Pressed: true });
  assert.ok(f.technique, 'the Sphere Rush started');
  assert.deepEqual(labels(f), ['A3', 'A4']);
  const both = drawnRings(f).rings;
  assert.deepEqual(both.map((r) => r.label), ['A3', 'A4']);
  assert.ok(both[0].x < 400 && both[1].x > 400, 'side by side, centred under the fighter as a pair');
  // Every step: exactly the active cooldowns, none ever shown ready.
  const seen = [];
  for (let i = 0; i < 600 && cd.size; i++) {
    d.tick();
    const list = cooldownIndicators(f);
    assert.deepEqual(list.map((c) => c.id), ['attack3', 'attack4'].filter((id) => cd.active(id)));
    for (const c of list) assert.ok(c.progress < 1 && c.text !== '0.0', `${c.label} still cooling (${c.text})`);
    const key = list.map((c) => c.label).join(' ');
    if (seen.at(-1) !== key) {
      seen.push(key);
      if (key === 'A4') {
        // A3 finished: only A3 went, and A4 moved to the centre.
        assert.deepEqual(drawnRings(f).rings, [{ label: 'A4', x: 400 }]);
      }
    }
  }
  assert.deepEqual(seen, ['A3 A4', 'A4', ''], 'A3 first, then A4, then nothing');
  assert.deepEqual(drawnRings(f).calls, [], 'all ready: no cooldown UI under the fighter');
});

test('cooldown rings are white with a black outline: ring, number and label; never green; a lone ring is centred', () => {
  assert.equal(COOLDOWN_STYLE.fill, '#ffffff');
  assert.equal(COOLDOWN_STYLE.outline, '#000000');
  const { fighter } = makeFighter();
  fighter.combat.abilityCooldowns.start('attack4', 5);
  fighter.combat.abilityCooldowns.update(2.5);
  let { rings, calls } = drawnRings(fighter);
  assert.deepEqual(texts(calls), ['2.5', 'A4'], 'A4 cooling (2.5 left), nothing for the ready A3');
  assert.deepEqual(rings, [{ label: 'A4', x: 400 }], 'alone: straight under the fighter, no slot kept for A3');
  for (const c of calls.filter((x) => x.fn === 'fillText')) assert.equal(c.fill, COOLDOWN_STYLE.fill, `${c.args[0]} in white`);
  for (const c of calls.filter((x) => x.fn === 'strokeText')) assert.equal(c.stroke, COOLDOWN_STYLE.outline, `${c.args[0]} outlined in black`);
  assert.deepEqual(texts(calls, 'strokeText'), texts(calls), 'every text outlined');
  // Each ring: a black stroke under it wider than the ring, a faint track,
  // then the white progress arc.
  const strokes = calls.filter((c) => c.fn === 'stroke');
  const outline = strokes.find((s) => s.stroke === COOLDOWN_STYLE.outline);
  const ring = strokes.find((s) => s.stroke === COOLDOWN_STYLE.fill);
  assert.ok(outline && ring);
  assert.ok(outline.lineWidth > ring.lineWidth, 'the outline shows on both sides of the ring');
  // A4's progress arc ends half way round, from the top.
  const arcs = calls.filter((c) => c.fn === 'arc');
  const half = arcs.find((a) => Math.abs(a.args[4] - (-Math.PI / 2 + Math.PI)) < 1e-9);
  assert.ok(half, 'an arc from the top to half way');
  assert.equal(half.args[3], -Math.PI / 2);
  // Nothing but white, its faint track and black: no green (the old HUD
  // rings' accent) anywhere.
  const used = new Set(calls.filter((c) => ['stroke', 'fillText', 'strokeText'].includes(c.fn)).map((c) => (c.fn === 'fillText' ? c.fill : c.stroke)));
  assert.deepEqual([...used].sort(), [COOLDOWN_STYLE.outline, COOLDOWN_STYLE.fill, COOLDOWN_STYLE.track].sort());
  // Both cooling: one row, A3 left of A4, under the feet (y below 300).
  fighter.combat.abilityCooldowns.start('attack3', 5);
  ({ calls } = drawnRings(fighter));
  assert.deepEqual(texts(calls), ['5.0', 'A3', '2.5', 'A4']);
  const [l1, l2] = calls.filter((c) => c.fn === 'fillText' && /^A\d$/.test(c.args[0]));
  assert.ok(l1.args[1] < 400 && l2.args[1] > 400, 'side by side, centred under the fighter');
  assert.ok(Math.abs((l1.args[1] + l2.args[1]) / 2 - 400) <= 1, 'the pair centred');
  assert.ok(l1.args[2] > 300 && l1.args[2] === l2.args[2], 'in one row below the feet');
  assert.ok(l2.args[1] - l1.args[1] > 20, 'apart enough not to overlap');
});

// ---- Energy bar: only while below full ------------------------------------------

const HOLD = { shield: true };
// Two presses of `dir`, one step apart: a Dash's double tap.
const doubleTap = (step, dir = 'runRight') => {
  step({ [`${dir}Pressed`]: true, [dir]: true });
  step({});
  return step({ [`${dir}Pressed`]: true, [dir]: true });
};
const RECT = { x: 100, y: 52, w: 52, h: 6 };
// What drawEnergyBar paints for `fighter` in RECT at dpr 1: its outline,
// track and (if any) fill rectangles, or null when it draws nothing.
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

test('the Energy bar: hidden at full; one bright purple fill over a dark track in a black outline, shrinking from the right; gray while exhausted', () => {
  const { fighter } = makeFighter();
  const c = fighter.combat;
  const bar = energyBarState(fighter);
  assert.deepEqual([bar.visible, bar.energy, bar.maxEnergy, bar.ratio, bar.exhausted, bar.color], [false, 100, 100, 1, false, ENERGY_STYLE.fill]);
  assert.equal(barDrawing(fighter), null, 'full: no bar at all');
  c.setEnergy(50);
  let drawn = barDrawing(fighter);
  assert.deepEqual(drawn.map((d) => d.fill), [ENERGY_STYLE.outline, ENERGY_STYLE.track, ENERGY_STYLE.fill], 'one bar: outline, track, fill');
  assert.equal(ENERGY_STYLE.outline, '#000000');
  assert.deepEqual(drawn[0].rect, [RECT.x - 1, RECT.y - 1, RECT.w + 2, RECT.h + 2], 'the outline round the whole bar');
  assert.deepEqual(drawn[2].rect, [100, 52, 26, 6], 'half: the fill contracts from the right');
  c.setEnergy(85);
  assert.deepEqual(barDrawing(fighter)[2].rect, [100, 52, Math.round(52 * 0.85), 6]);
  c.setEnergy(0);
  const empty = energyBarState(fighter);
  assert.deepEqual([empty.visible, empty.ratio, empty.exhausted, empty.color], [true, 0, true, ENERGY_STYLE.exhausted]);
  drawn = barDrawing(fighter);
  assert.deepEqual(drawn.map((d) => d.fill), [ENERGY_STYLE.outline, ENERGY_STYLE.track], 'empty: shown, with no fill at all');
  c.regenEnergy(40);
  drawn = barDrawing(fighter);
  assert.equal(drawn[2].fill, ENERGY_STYLE.exhausted, 'refilling while exhausted: gray');
  assert.equal(drawn[2].rect[2], Math.round(52 * 0.4), 'as long as what has come back');
  c.regenEnergy(59.9);
  assert.equal(barDrawing(fighter)[2].fill, ENERGY_STYLE.exhausted, 'still gray at 99.9');
  c.regenEnergy(0.1);
  assert.equal(barDrawing(fighter), null, 'exactly full: gone, never a full purple bar');
  // Bright purple, not green (nor the Shield's red): full blue, strong red.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ENERGY_STYLE.fill.slice(i, i + 2), 16));
  assert.ok(r > g && b > g, ENERGY_STYLE.fill);
  assert.ok(b === 0xff && r >= 0xa0 && g <= 0x40, `bright and saturated (${ENERGY_STYLE.fill})`);
});

test('a fresh fighter shows no bar; a real Dash or blocked hit brings it up at once, it stays through the refill and goes at full', () => {
  const dashed = makeFighter();
  assert.equal(energyBarState(dashed.fighter).visible, false, 'fresh, full, hidden');
  doubleTap(dashed.step);
  const d = duel();
  // Up well before the hit: an ordinary block, never a perfect one.
  for (let i = 0; i < 9; i++) d.tick({}, HOLD);
  d.tick({ attack1: true, attack1Pressed: true }, HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  assert.equal(d.events[0].type, 'block');
  for (const [label, fighter, step] of [['Dash', dashed.fighter, dashed.step], ['block', d.target, (held) => d.tick({}, held)]]) {
    const spent = label === 'Dash' ? 15 : 25;
    assert.equal(fighter.combat.energy, 100 - spent, `${label} spent ${spent}`);
    const bar = energyBarState(fighter);
    assert.deepEqual([bar.visible, bar.exhausted, bar.color], [true, false, ENERGY_STYLE.fill], label);
    assert.ok(Math.abs(bar.ratio - (100 - spent) / 100) < 1e-9, `${label}: shown at ${100 - spent}%`);
    assert.equal(barDrawing(fighter)[2].rect[2], Math.round(52 * (100 - spent) / 100));
    const { steps: n, colors } = refillUntilHidden(fighter, step);
    assert.ok(n >= (spent / 12) * 60 - 1, `${label}: shown for the whole refill (${n} steps)`);
    assert.deepEqual([...colors], [ENERGY_STYLE.fill], `${label}: an ordinary refill is purple throughout`);
  }
});

test('the bar refills at one rate, Down held or not: it shows until full, and hides at full', () => {
  const normal = makeFighter();
  normal.fighter.combat.setEnergy(40);
  const plain = refillUntilHidden(normal.fighter, normal.step);
  const down = makeFighter();
  down.fighter.combat.setEnergy(40);
  const held = refillUntilHidden(down.fighter, down.step, { down: true });
  assert.equal(held.steps, plain.steps, `the same refill (${held.steps} vs ${plain.steps} steps)`);
  assert.deepEqual([...held.colors], [ENERGY_STYLE.fill]);
});

test('the gray exhaustion cycle: a Dash with too little left empties it, gray through 25, 75 and 99, gone only when full', () => {
  const { fighter, step } = makeFighter();
  const c = fighter.combat;
  step({ runRightPressed: true, runRight: true });
  step({});
  c.setEnergy(8);
  step({ runRightPressed: true, runRight: true });
  assert.ok(fighter.dash, 'a Dash on 8, though it costs 15');
  assert.equal(c.energy, 0);
  assert.equal(c.energyExhausted, true);
  assert.equal(energyBarState(fighter).ratio, 0);
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

test('in play: nothing over or under a fighter with full Energy and Attack 3 and Attack 4 ready; its bar over its tag and rings under its feet once they show, drawn after the Void', () => {
  const { battle, render } = renderedBattle();
  const { p1, p2 } = battle;
  // A fighter's bar: its black outline fillRect (the cooldown rings are strokes
  // and text).
  const bars = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.outline);
  const purple = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.fill);
  let calls = render();
  assert.deepEqual(bars(calls), [], 'full: no bars');
  assert.ok(!texts(calls).some((t) => /^A\d$/.test(t)), 'all ready: no rings');
  assert.deepEqual(texts(calls).sort(), ['CPU', 'P1'], 'only the name tags');
  // Nothing kept above the tag for a hidden bar.
  for (const f of [p1, p2]) assert.equal(battle.statusTop(f), battle.markerTop(f));
  // P1 spends Energy and uses A3: its bar and A3, nothing more; the
  // CPU still shows neither.
  p1.combat.setEnergy(75);
  p1.combat.abilityCooldowns.start('attack3', 5);
  calls = render();
  const at = (pred) => calls.findIndex(pred);
  const voidAt = at((c) => c.fn === 'void');
  assert.equal(bars(calls).length, 1, 'P1\'s bar only');
  assert.equal(purple(calls).length, 1);
  assert.ok(at((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.fill) > voidAt, 'over the Void');
  assert.ok(at((c) => c.fn === 'fillText' && c.args[0] === 'A3') > voidAt);
  assert.deepEqual(texts(calls).filter((t) => /^A\d$/.test(t)), ['A3'], 'P1\'s A3 only');
  // Stacked: bar, then the tag, then the fighter; the ring below its feet.
  const bar = battle.energyBarRect(p1);
  const [x, , footY] = battle.markerAnchor(p1);
  assert.ok(bar.y + bar.h < battle.markerTop(p1), 'the bar sits clear above the name tag');
  assert.ok(Math.abs(bar.x + bar.w / 2 - x) <= 1, 'centred over the fighter');
  assert.ok(bar.w >= 44, 'never too small to read: 44 CSS px at least');
  assert.ok(bar.w <= 70, 'compact: about the fighter\'s width');
  assert.deepEqual(purple(calls)[0].args, [bar.x, bar.y, Math.round(bar.w * 0.75), bar.h], 'one fill from the left, 75% wide');
  assert.equal(battle.statusTop(p1), bar.y - 1, 'the bar is now the top');
  assert.equal(battle.statusTop(p2), battle.markerTop(p2));
  const tag = calls.find((c) => c.fn === 'fillText' && c.args[0] === p1.label);
  assert.ok(tag.args[2] > bar.y + bar.h, 'P1\'s tag under its bar');
  const label = calls.find((c) => c.fn === 'fillText' && c.args[0] === 'A3');
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
  // How many fighters' bars are drawn: one black outline each.
  const barsDrawn = (calls) => calls.filter((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.outline);
  const spend = (f) => {
    f.combat.setEnergy(50);
    f.combat.abilityCooldowns.start('attack3', 5);
  };
  spend(p1);
  spend(p2);
  assert.equal(barsDrawn(render()).length, 2);
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  let calls = render();
  assert.equal(barsDrawn(calls).length, 1, 'Player 1\'s only');
  assert.equal(texts(calls).filter((t) => t === 'A3').length, 1);
  assert.ok(!texts(calls).includes('CPU'), 'no tag either');
  // Back after its wait: full Energy and every cooldown ready, so only its
  // tag shows.
  for (let i = 0; i < 120; i++) battle.update(DT);
  assert.equal(p2.lostToVoid, false);
  assert.equal(p2.combat.energy, p2.combat.maxEnergy);
  assert.deepEqual(cooldownIndicators(p2), []);
  assert.equal(energyBarState(p2).visible, false);
  calls = render();
  assert.ok(texts(calls).includes('CPU'));
  assert.equal(texts(calls).filter((t) => t === 'A3').length, 1, 'P1\'s A3, still cooling');
  assert.equal(barsDrawn(calls).length, 1, 'P1\'s bar, still refilling');
  // Off screen, with something to show: the tag's edge pointer only.
  spend(p2);
  p2.renderX = battle.view.x + battle.view.w + 400;
  calls = render();
  assert.equal(barsDrawn(calls).length, 1);
  assert.equal(texts(calls).filter((t) => t === 'A3').length, 1);
  assert.ok(texts(calls).includes('CPU'), 'the edge pointer still names it');
  assert.ok(p1.combat.energy < p1.combat.maxEnergy);
  const view = { pxW: 1280, pxH: 720 };
  assert.equal(statusOnScreen(640, 400, view), true);
  assert.equal(statusOnScreen(-40, 400, view), false);
  assert.equal(statusOnScreen(1330, 400, view), false);
  assert.equal(statusOnScreen(640, -40, view), false);
});

test('the rings and bar are canvas-drawn, never DOM in a HUD card', () => {
  const hud = readFileSync(new URL('../js/ui/hud.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(hud, /cooldown|abilityCooldowns/i, 'the HUD knows nothing of them');
  const status = readFileSync(new URL('../js/game/rendering/fighter-status.js', import.meta.url), 'utf8');
  assert.doesNotMatch(status, /document\.|createElement/, 'no DOM');
  assert.doesNotMatch(status, /stamina/i, 'Energy, never the old Stamina');
  const arena = readFileSync(new URL('../js/game/arena.js', import.meta.url), 'utf8');
  assert.match(arena, /drawVoid[\s\S]*drawStatus\(fighters\)/, 'drawn after the Void');
});
