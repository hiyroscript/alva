// Run with node --test tests/systems/void-ripple.test.mjs (no dependencies).
// The Void's ripple where it takes a fighter: the crossing point on its
// boundary (every side, corners, a Void closing over a fighter), one ripple
// per elimination alongside the fighter-coloured burst, the edge itself
// heaving there (and only there) while collision and scoring never move,
// reduced motion, expiry, and overtime's closing Void. Real Battle, physics
// and themes; the canvas is a recording stand-in, so paint still needs
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap } from '../../js/data/maps.js';
import { HitEffects, HIT_FX } from '../../js/game/rendering/hit-fx.js';
import { def, DT, fakeSprites } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');
const { voidCrossing } = await import('../../js/game/arena.js');
const { createTheme } = await import('../../js/stages/index.js');

const V = Object.freeze({ left: 0, right: 1000, top: 0, bottom: 800 });
// A body (bottom-centre origin, 80 tall) whose centre moved from (x0, y0)
// to (x1, y1).
const moved = (x0, y0, x1, y1) => ({ prevX: x0, prevY: y0 + 40, x: x1, y: y1 + 40, height: 80 });

function battleOn(mapId = 'desert', seed = 3) {
  const sprites = fakeSprites();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => ({}) }, seed,
  });
  battle.p1.controller = null;
  battle.p2.controller = null;
  battle.setPhase('fight');
  return battle;
}

// Sends `f` across the boundary on the next step: its centre at (x, y),
// moving `vx` world units / s sideways, in the air.
function launch(f, x, y, vx, vy = 0) {
  const b = f.body;
  b.x = b.prevX = x;
  b.y = b.prevY = y + b.height / 2;
  b.vx = vx;
  b.vy = vy;
  b.grounded = false;
  b.ground = null;
}

// A context recording every path point, for comparing edges.
function recordingContext() {
  const points = [];
  return new Proxy({ points }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => points.push([x, y]);
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

test('the crossing point is where the centre passed through the boundary, on every side', () => {
  assert.deepEqual(voidCrossing(moved(10, 400, -30, 440), V), { side: 'left', x: 0, y: 410 });
  assert.deepEqual(voidCrossing(moved(990, 200, 1010, 240), V), { side: 'right', x: 1000, y: 220 });
  assert.deepEqual(voidCrossing(moved(500, 20, 540, -20), V), { side: 'top', x: 520, y: 0 });
  assert.deepEqual(voidCrossing(moved(300, 780, 260, 820), V), { side: 'bottom', x: 280, y: 800 });
});

test('a diagonal through a corner takes the side it reached first; a centre the Void closed over is anchored to the nearest boundary', () => {
  // Through the top-left corner, crossing the top first.
  const c = voidCrossing(moved(20, 10, -20, -50), V);
  assert.equal(c.side, 'top');
  assert.equal(c.y, 0);
  assert.ok(c.x > 0 && c.x < 20);
  // ... and the left first.
  const d = voidCrossing(moved(10, 30, -30, -10), V);
  assert.equal(d.side, 'left');
  assert.equal(d.x, 0);
  // Already outside a step ago (a closing Void passed it): the side it is
  // furthest past, the nearest point on it.
  assert.deepEqual(voidCrossing(moved(1040, 300, 1050, 310), V), { side: 'right', x: 1000, y: 310 });
  assert.deepEqual(voidCrossing(moved(400, 900, 410, 950), V), { side: 'bottom', x: 410, y: 800 });
});

test('a Void elimination makes its ripple at the crossing, alongside the fighter-coloured burst, and never moves the boundary, the score or the respawn', () => {
  const battle = battleOn();
  const v = battle.stage.void;
  const boundary = { ...v };
  const f = battle.p2;
  launch(f, v.left + 6, 700, -900);
  battle.update(DT);
  assert.equal(f.lostToVoid, true);
  assert.equal(battle.fx.ripples.length, 1);
  const r = battle.fx.ripples[0];
  assert.equal(r.side, 'left');
  assert.equal(r.x, v.left);
  // On the line from where its centre was to where it is, at the boundary.
  const b = f.body;
  const [x0, y0, x1, y1] = [b.prevX, b.prevY - b.height / 2, b.x, b.y - b.height / 2];
  assert.ok(x0 > v.left && x1 < v.left, 'it crossed this step');
  const k = (v.left - x0) / (x1 - x0);
  assert.ok(Math.abs(r.y - (y0 + (y1 - y0) * k)) < 1e-6, `at the crossing (${r.y})`);
  assert.equal(r.slot, 'p2');
  assert.equal(battle.fx.eliminations.length, 1, 'the fighter-coloured burst as ever');
  assert.deepEqual({ ...battle.stage.void }, boundary, 'the boundary never moved');
  assert.equal(battle.score.p1, 1, 'the point scored as ever');
  assert.equal(f.respawnTimer, 2, 'the respawn as ever');
  // Drawing it changes nothing either.
  const ctx = recordingContext();
  battle.theme.drawVoid(ctx, { ctx, scale: 1, dpr: 1, w: 1400, h: 860, pxW: 1400, pxH: 860, x: v.left - 200, y: 300 }, battle.stage.void, battle.fx.ripples);
  assert.deepEqual({ ...battle.stage.void }, boundary);
  assert.equal(battle.stage.inVoid({ x: v.left + 1, y: 600, height: 80 }), false);
});

test('each side gets its own ripple there, and two eliminations on one step make two independent ripples', () => {
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const battle = battleOn('asperitas');
    const v = battle.stage.void;
    const f = battle.p1;
    const at = {
      left: [v.left + 5, 600, -900], right: [v.right - 5, 600, 900],
      top: [1500, v.top + 5, 0, -900], bottom: [1500, v.bottom - 5, 0, 900],
    }[side];
    launch(f, ...at);
    battle.update(DT);
    assert.equal(battle.fx.ripples.length, 1, side);
    assert.equal(battle.fx.ripples[0].side, side);
  }
  const battle = battleOn('city');
  const v = battle.stage.void;
  launch(battle.p1, v.left + 3, 700, -900);
  launch(battle.p2, v.right - 3, 650, 900);
  battle.update(DT);
  assert.deepEqual(battle.fx.ripples.map((r) => r.side), ['left', 'right']);
  // Ageing one never erases the other; both expire.
  battle.fx.update(0.4);
  assert.equal(battle.fx.ripples.length, 2);
  battle.fx.update(HIT_FX.voidRipple.life);
  assert.deepEqual(battle.fx.ripples, [], 'expired');
  assert.deepEqual(battle.fx.eliminations, []);
});

test('ripples expire, a reset clears them, and a closing Void in overtime ripples at its closed edge', () => {
  const fx = new HitEffects();
  fx.addVoidRipple({ side: 'left', x: 0, y: 10 });
  fx.addVoidRipple({ side: 'left', x: 0, y: 50 });
  fx.update(HIT_FX.voidRipple.life * 0.5);
  assert.equal(fx.ripples.length, 2);
  fx.update(HIT_FX.voidRipple.life);
  assert.equal(fx.ripples.length, 0);
  fx.addVoidRipple({ side: 'top', x: 0, y: 0 });
  fx.reset();
  assert.deepEqual(fx.ripples, []);
  const battle = battleOn('desert');
  battle.startOvertime();
  // Its clock all but run out: the Void fully closed.
  battle.timeLeft = 1e-4;
  battle.setVoidPressure(1);
  const v = battle.stage.void;
  assert.ok(v.left > battle.map.voidBounds.left, 'closed in');
  launch(battle.p1, v.left + 4, 760, -900);
  battle.update(DT);
  assert.equal(battle.p1.lostToVoid, true);
  assert.equal(battle.fx.ripples[0].x, battle.stage.void.left, 'on the closed edge');
});

test('the drawn edge visibly heaves where the ripple is, and only there; the rim follows the same points', () => {
  const m = getMap('desert');
  const theme = createTheme(m, { reducedMotion: false });
  const v = m.voidBounds;
  const view = { scale: 1, dpr: 1, w: 1400, h: 900, pxW: 1400, pxH: 900, x: v.left - 300, y: 200 };
  const edge = (ripples) => theme.voidEdgePoints(v, 'left', 0, view.x - 40, view.x + view.w + 40, view.y - 40, view.y + view.h + 40, ripples);
  const calm = edge([]);
  const r = { side: 'left', x: v.left, y: 650, age: 0.35, life: HIT_FX.voidRipple.life };
  const rippled = edge([r]);
  assert.equal(rippled.length, calm.length);
  let near = 0;
  let far = 0;
  for (let i = 0; i < calm.length; i += 2) {
    const y = calm[i + 1];
    const dx = Math.abs(rippled[i] - calm[i]);
    if (Math.abs(y - 650) < 400) near = Math.max(near, dx);
    else if (Math.abs(y - 650) > 900) far = Math.max(far, dx);
  }
  assert.ok(near > 8, `the edge heaves ${near.toFixed(1)} units near the point`);
  assert.ok(far < 0.5, `and is calm far from it (${far.toFixed(2)})`);
  // The wave runs out along the edge: later, its crest is further away.
  const offsetAt = (age, d) => Math.abs(theme.rippleOffset(v, 'left', 650 + d, [{ ...r, age }]));
  const crest = (age) => {
    let best = 0;
    let at = 0;
    for (let d = 0; d < 1200; d += 5) if (offsetAt(age, d) > best) [best, at] = [offsetAt(age, d), d];
    return at;
  };
  assert.ok(crest(0.9) > crest(0.3) + 150, 'travelling outward');
  // Both the rim and the black are traced from the same rippled points.
  const ctx = recordingContext();
  theme.time = 0;
  theme.drawVoid(ctx, { ...view, ctx }, v, [r]);
  const ys = new Set(ctx.points.map(([, y]) => y));
  assert.ok(rippled.filter((_, i) => i % 2 === 1).every((y) => ys.has(y)));
});

test('with reduced motion the ripple holds still: a pulse at the point, no wave running along the edge', () => {
  const m = getMap('desert');
  const v = m.voidBounds;
  const still = createTheme(m, { reducedMotion: true });
  const full = createTheme(m, { reducedMotion: false });
  const r = (age) => [{ side: 'left', x: v.left, y: 600, age, life: HIT_FX.voidRipple.life }];
  // At the point: a visible dip.
  assert.ok(Math.abs(still.rippleOffset(v, 'left', 600, r(0.1))) > 10);
  // Far along the edge where the full wave has reached: nothing.
  const d = HIT_FX.voidRipple.speed * 0.8;
  assert.ok(Math.abs(full.rippleOffset(v, 'left', 600 + d, r(0.8))) > 2, 'the full wave travels');
  assert.ok(Math.abs(still.rippleOffset(v, 'left', 600 + d, r(0.8))) < 0.01, 'the still one does not');
  // And no shake from an elimination.
  const fx = new HitEffects({ reducedMotion: true });
  fx.addElimination({ body: { x: 0, y: 0, height: 80 }, def });
  fx.addVoidRipple({ side: 'left', x: 0, y: 0 });
  assert.equal(fx.shake.amp, 0);
  assert.equal(fx.ripples.length, 1, 'the ripple still shows');
});
