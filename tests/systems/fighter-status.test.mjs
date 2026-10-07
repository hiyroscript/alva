// Run with node --test tests/systems/fighter-status.test.mjs (no dependencies).
// The status drawn with each fighter on the Arena canvas: the bright purple
// Energy bar over its name tag, only while below full (gray
// through an exhaustion's whole refill), and the icon-centered cooldown rings of
// #0001's direct Attack 4 and Attack 5 (its techniques, Unlimited Void and
// Hollow Purple) under its feet, only while cooling down. The state
// helpers are checked directly; the drawing through a canvas context that
// records what it is asked to paint (layout and paint themselves still
// need a real browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import {
  cooldownIndicators, energyBarState, formatCooldown, drawCooldownIndicators, drawEnergyBar, statusOnScreen,
  COOLDOWN_STYLE, ENERGY_STYLE,
} from '../../js/game/rendering/fighter-status.js';
import { getCharacter } from '../../js/data/characters.js';
import { previewFrame } from '../../js/data/ability-preview.js';
import { def, DT, fakeSprites, makeFighter, duel } from '../helpers/fighter-harness.mjs';
import { BLOCK_ENERGY_COST, DASH_ENERGY_COST } from '../../js/game/combat/combat-state.js';

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
      return (...args) => calls.push({ fn: k, args, fill: state.fillStyle, stroke: state.strokeStyle, lineWidth: state.lineWidth, smoothing: state.imageSmoothingEnabled });
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, calls };
}

const texts = (calls, fn = 'fillText') => calls.filter((c) => c.fn === fn).map((c) => c.args[0]);

test('only cooldowns above the baseline have rings, and each uses the shared touch preview', () => {
  for (const [id, action, seconds, animation, frame] of [
    ['0001', 'attack4', 3, 'attack4_cast', 5],
    ['0001', 'attack5', 5, 'attack5_object', 0],
    ['0002', 'extra_attack', 5, 'extra_attack_object', 2],
  ]) {
    const { fighter: f, step } = makeFighter({ character: getCharacter(id) });
    assert.deepEqual(cooldownIndicators(f), []);
    step({ [action]: true, [`${action}Pressed`]: true });
    if (action === 'extra_attack') while (f.combat.attack) step();
    const [c] = cooldownIndicators(f);
    assert.equal(c.id, action);
    assert.equal(c.text, seconds.toFixed(1));
    assert.equal(c.progress, 0);
    assert.deepEqual(c.preview, previewFrame(f.def, action));
    assert.equal(c.preview.animation, animation);
    assert.equal(c.preview.frame, frame);
    f.combat.update(seconds / 2);
    assert.equal(cooldownIndicators(f)[0].progress, 0.5);
    f.combat.update(seconds / 2);
    assert.deepEqual(cooldownIndicators(f), []);
  }
  const { fighter: f } = makeFighter();
  f.combat.cooldowns.set('attack1', 0.5);
  f.combat.abilityCooldowns.start('attack4', 0.5);
  f.combat.movementCooldowns.start('mouvment', 0.5);
  assert.deepEqual(cooldownIndicators(f), []);
  const { ctx, calls } = recorder();
  assert.equal(drawCooldownIndicators(ctx, f, 400, 300, 1), 0);
  assert.deepEqual(calls, []);
  assert.equal(formatCooldown(0.01), '0.1');
  assert.equal(formatCooldown(4.3), '4.3');
  assert.equal(formatCooldown(4.31), '4.4');
});

test('rings center untinted artwork and put outlined seconds below, recovering clockwise in a centered row', () => {
  const { fighter: f } = makeFighter();
  for (const [id, duration] of [['attack4', 3], ['attack5', 5]]) f.combat.abilityCooldowns.start(id, duration);
  f.combat.update(1.5);
  const art = [];
  for (const c of cooldownIndicators(f)) {
    const p = c.preview;
    const clip = p.collection === 'projectileAnimations' ? f.sprites.projectile(p.animation) : f.sprites.animations[p.animation];
    const frame = { canvas: { name: p.animation }, artW: 20, artH: 30, anchorArtX: 1, anchorArtY: 29 };
    clip.frames[p.frame] = frame;
    art.push(frame.canvas);
  }
  const { ctx, calls } = recorder();
  assert.equal(drawCooldownIndicators(ctx, f, 400, 300, 1.2), 2);
  assert.deepEqual(texts(calls), ['1.5', '3.5']);
  assert.deepEqual(texts(calls, 'strokeText'), ['1.5', '3.5']);
  const images = calls.filter(c => c.fn === 'drawImage');
  assert.deepEqual(images.map(c => c.args[0]), art, 'original canvases, no tint or fabricated art');
  assert.ok(images.every(c => c.smoothing === false), 'pixel art stays crisp');
  const centers = calls.filter(c => c.fn === 'translate').map(c => c.args);
  const labels = calls.filter(c => c.fn === 'fillText');
  assert.ok(centers[0][0] < 400 && centers[1][0] > 400);
  assert.ok(Math.abs((centers[0][0] + centers[1][0]) / 2 - 400) <= 1);
  labels.forEach((label, i) => {
    assert.equal(label.args[1], centers[i][0]);
    assert.ok(label.args[2] > centers[i][1] + 10, 'seconds below, never at the center');
    assert.equal(label.fill, COOLDOWN_STYLE.fill);
  });
  for (const im of images) {
    assert.ok(Math.abs(im.args[1] + im.args[3] / 2) <= 0.5, 'horizontal center');
    assert.ok(Math.abs(im.args[2] + im.args[4] / 2) <= 0.5, 'vertical center');
  }
  assert.ok(calls.some(c => c.fn === 'arc' && c.args[3] === -Math.PI / 2 && Math.abs(c.args[4] - Math.PI / 2) < 1e-9));
  const strokes = calls.filter(c => c.fn === 'stroke');
  assert.ok(strokes.find(c => c.stroke === COOLDOWN_STYLE.outline).lineWidth > strokes.find(c => c.stroke === COOLDOWN_STYLE.fill).lineWidth);
  f.combat.abilityCooldowns.update(1.5);
  const lone = recorder();
  assert.equal(drawCooldownIndicators(lone.ctx, f, 400, 300, 1.2), 1);
  assert.equal(lone.calls.find(c => c.fn === 'translate').args[0], 400);
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
    const spent = label === 'Dash' ? DASH_ENERGY_COST : BLOCK_ENERGY_COST;
    assert.equal(fighter.combat.energy, 100 - spent, `${label} spent ${spent}`);
    const bar = energyBarState(fighter);
    assert.deepEqual([bar.visible, bar.exhausted, bar.color], [true, false, ENERGY_STYLE.fill], label);
    assert.ok(Math.abs(bar.ratio - (100 - spent) / 100) < 1e-9, `${label}: shown at ${100 - spent}%`);
    assert.equal(barDrawing(fighter)[2].rect[2], Math.round(52 * (100 - spent) / 100));
    const { steps: n, colors } = refillUntilHidden(fighter, step);
    assert.ok(n >= (spent / def.energy.regen) * 60 - 1, `${label}: shown for the whole refill (${n} steps)`);
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

test('in play: nothing over or under a fighter with full Energy and Attack 4 and Attack 5 ready; its bar over its tag and rings under its feet once they show, drawn after the Void', () => {
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
  // P1 spends Energy and uses A4: its bar and A4, nothing more; the
  // CPU still shows neither.
  p1.combat.setEnergy(75);
  p1.combat.abilityCooldowns.start('attack4', 5);
  calls = render();
  const at = (pred) => calls.findIndex(pred);
  const voidAt = at((c) => c.fn === 'void');
  assert.equal(bars(calls).length, 1, 'P1\'s bar only');
  assert.equal(purple(calls).length, 1);
  assert.ok(at((c) => c.fn === 'fillRect' && c.fill === ENERGY_STYLE.fill) > voidAt, 'over the Void');
  assert.ok(at((c) => c.fn === 'fillText' && /^\d+\.\d$/.test(c.args[0])) > voidAt);
  assert.deepEqual(texts(calls).filter((t) => /^\d+\.\d$/.test(t)), ['5.0'], 'P1\'s A4 only');
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
  const label = calls.find((c) => c.fn === 'fillText' && /^\d+\.\d$/.test(c.args[0]));
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
    f.combat.abilityCooldowns.start('attack4', 5);
  };
  spend(p1);
  spend(p2);
  assert.equal(barsDrawn(render()).length, 2);
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  let calls = render();
  assert.equal(barsDrawn(calls).length, 1, 'Player 1\'s only');
  assert.equal(texts(calls).filter((t) => /^\d+\.\d$/.test(t)).length, 1);
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
  assert.equal(texts(calls).filter((t) => /^\d+\.\d$/.test(t)).length, 1, 'P1\'s A4, still cooling');
  assert.equal(barsDrawn(calls).length, 1, 'P1\'s bar, still refilling');
  // Off screen, with something to show: the tag's edge pointer only.
  spend(p2);
  p2.renderX = battle.view.x + battle.view.w + 400;
  calls = render();
  assert.equal(barsDrawn(calls).length, 1);
  assert.equal(texts(calls).filter((t) => /^\d+\.\d$/.test(t)).length, 1);
  assert.ok(texts(calls).includes('CPU'), 'the edge pointer still names it');
  assert.ok(p1.combat.energy < p1.combat.maxEnergy);
  const view = { pxW: 1280, pxH: 720 };
  assert.equal(statusOnScreen(640, 400, view), true);
  assert.equal(statusOnScreen(-40, 400, view), false);
  assert.equal(statusOnScreen(1330, 400, view), false);
  assert.equal(statusOnScreen(640, -40, view), false);
});

test('the rings and bar are canvas-drawn, never DOM in a HUD card', () => {
  const hud = readFileSync(new URL('../../js/ui/hud.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(hud, /cooldown|abilityCooldowns/i, 'the HUD knows nothing of them');
  const status = readFileSync(new URL('../../js/game/rendering/fighter-status.js', import.meta.url), 'utf8');
  assert.doesNotMatch(status, /document\.|createElement/, 'no DOM');
  assert.doesNotMatch(status, /stamina/i, 'Energy, never the old Stamina');
  const arena = readFileSync(new URL('../../js/game/arena.js', import.meta.url), 'utf8');
  assert.match(arena, /drawVoid[\s\S]*drawStatus\(fighters\)/, 'drawn after the Void');
});
