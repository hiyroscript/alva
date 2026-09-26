// Hit effects (js/game/hit-fx.js): screen shake, the white hit flash,
// sparks, speed trails and a lethal launch's slow-motion zoom. Presentation
// only: these check what each hit asks for, and that none of it ever changes
// a simulation step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HitEffects, HIT_FX, launchIsLethal, whiteFrame } from '../js/game/hit-fx.js';
import { StageCollision } from '../js/game/physics.js';
import { CONFIG } from '../js/config.js';
import { def, DT, duel, stageMap, fakeSprites } from './fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const ARENA = (stage) => ({ stage, gravity: CONFIG.sim.gravity, step: DT });

// A real hit through the real CombatSystem: `lp` on the target, `press` from
// the attacker, `targetHeld` for the target.
function hitWith({ lp = 0, press = P('action1'), targetHeld = {}, stage, x, gap = 40 } = {}) {
  const d = duel({ gap, stage, x });
  d.target.combat.launchPoint = lp;
  d.tick(press, targetHeld);
  for (let i = 0; i < 40 && !d.events.length; i++) d.tick({}, targetHeld);
  return { d, e: d.events[0] };
}

test('a hit shakes the screen by its strength, flashes its target white for one frame and throws sparks where it landed', () => {
  const fx = new HitEffects();
  const light = hitWith({ lp: 0 });
  fx.take([light.e], ARENA(light.d.target.body && new StageCollision(stageMap())));
  const lightShake = fx.shake.amp;
  assert.ok(lightShake > 0);
  assert.equal(fx.flashing(light.e.target), true);
  assert.equal(fx.sparks.length, 1);
  assert.equal(fx.sparks[0].kind, 'hit');
  assert.ok(light.e.point, 'the hit carries where it landed');
  assert.ok(Math.abs(fx.sparks[0].x - light.e.point.x) < 1e-9);
  // One frame, then gone.
  fx.update(1 / 60);
  assert.equal(fx.flashing(light.e.target), false);
  // A harder hit shakes harder.
  const heavy = hitWith({ lp: 80, press: P('action2') });
  const fx2 = new HitEffects();
  fx2.take([heavy.e], ARENA(new StageCollision(stageMap())));
  assert.ok(fx2.shake.amp > lightShake);
  assert.ok(fx2.shake.amp <= Math.max(HIT_FX.shake.max, HIT_FX.shake.lethal));
  // The shake dies away.
  for (let i = 0; i < 60; i++) fx2.update(1 / 60);
  assert.deepEqual(fx2.shakeOffset(), { x: 0, y: 0 });
});

test('a block shows a red ring and a small shake, a perfect one a white ring; neither flashes; a tick shows nothing', () => {
  const block = { type: 'block', perfect: false, target: { body: { x: 0, y: 0, height: 80 } }, damage: 0, launchSpeed: 0, hitstun: 0, point: { x: 10, y: -40 } };
  const fx = new HitEffects();
  fx.take([block, { ...block, perfect: true }], ARENA(null));
  assert.deepEqual(fx.sparks.map((s) => s.kind), ['block', 'perfect']);
  assert.equal(fx.flashing(block.target), false);
  assert.ok(fx.shake.amp > 0 && fx.shake.amp <= HIT_FX.shake.perfect);
  const tick = { type: 'hit', target: block.target, damage: 1, launchSpeed: 0, hitstun: 0, point: block.point };
  const quiet = new HitEffects();
  quiet.take([tick], ARENA(null));
  assert.equal(quiet.sparks.length, 0);
  assert.equal(quiet.shake.amp, 0);
});

test('reduced motion: no shake and no zoom; the flash, sparks and trails stay', () => {
  const stage = new StageCollision(stageMap({ left: 0, right: 700 }));
  const { e } = hitWith({ lp: 200, stage, x: 560, gap: 40, press: P('action1') });
  const fx = new HitEffects({ reducedMotion: true });
  fx.take([e], ARENA(stage));
  assert.equal(fx.shake.amp, 0);
  assert.equal(fx.flashing(e.target), true);
  assert.equal(fx.sparks.length, 1);
  assert.ok(fx.timeScale < 1, 'the slow motion is not motion');
  assert.equal(fx.zoom, 1);
});

test('a launch that will carry its fighter into the Void is lethal; one it can recover from is not', () => {
  // Near the right ledge, a hard sideways push.
  const stage = new StageCollision(stageMap({ left: 0, right: 700 }));
  const far = hitWith({ lp: 200, stage, x: 560, gap: 40 });
  assert.ok(far.e.launchSpeed > 1500);
  assert.equal(launchIsLethal(far.e, stage, CONFIG.sim.gravity, DT), true);
  // The same hit at a low Launch Point, or far from any edge, is not.
  const low = hitWith({ lp: 20, stage, x: 560, gap: 40 });
  assert.equal(launchIsLethal(low.e, stage, CONFIG.sim.gravity, DT), false);
  const wide = new StageCollision(stageMap({ left: 0, right: 6000 }));
  const mid = hitWith({ lp: 60, stage: wide, x: 3000, gap: 40 });
  assert.equal(launchIsLethal(mid.e, wide, CONFIG.sim.gravity, DT), false);
  // It only reads the body: the real one is untouched.
  const before = { ...far.d.target.body };
  launchIsLethal(far.e, stage, CONFIG.sim.gravity, DT);
  assert.deepEqual({ ...far.d.target.body }, before);
});

test('a lethal launch slows the clock and closes the view in on its fighter, then both ease back', () => {
  const stage = new StageCollision(stageMap({ left: 0, right: 700 }));
  const { e } = hitWith({ lp: 200, stage, x: 560, gap: 40 });
  const fx = new HitEffects();
  fx.take([e], ARENA(stage));
  assert.equal(fx.zoomFocus, e.target);
  assert.equal(fx.timeScale, HIT_FX.lethal.scale);
  fx.update(0.1);
  assert.ok(fx.zoom > 1.2, `closing in (${fx.zoom})`);
  const { hold, ease } = HIT_FX.lethal;
  fx.update(hold);
  assert.ok(fx.timeScale > HIT_FX.lethal.scale && fx.timeScale < 1, 'easing back');
  fx.update(ease);
  assert.equal(fx.timeScale, 1);
  assert.equal(fx.zoom, 1);
  assert.equal(fx.zoomFocus, null);
  // Only one at a time.
  fx.take([e], ARENA(stage));
  const first = fx.slow;
  fx.take([e], ARENA(stage));
  assert.equal(fx.slow, first);
});

test('a fighter tumbling fast leaves a fading trail of its own poses; slower, the trail fades out', () => {
  const { d } = hitWith({ lp: 90, press: P('action2') });
  const f = d.target;
  assert.equal(f.tumbling, true);
  f.renderX = f.body.x;
  f.renderY = f.body.y;
  const fx = new HitEffects();
  for (let i = 0; i < 12; i++) {
    fx.sampleTrail(f, 1 / 60);
    f.renderY -= 20;
  }
  const ghosts = fx.ghosts(f);
  assert.ok(ghosts.length >= 2 && ghosts.length <= HIT_FX.trail.count);
  assert.ok(ghosts.every((g) => g.alpha > 0 && g.alpha <= HIT_FX.trail.alpha && g.frame));
  assert.ok(ghosts[0].alpha < ghosts.at(-1).alpha, 'older ones fainter');
  f.body.vy = 0;
  f.body.vx = 0;
  for (let i = 0; i < 30; i++) fx.sampleTrail(f, 1 / 60);
  assert.equal(fx.ghosts(f).length, 0);
});

test('the white flash is a silhouette of the same frame; with no canvas to draw on, the frame itself', () => {
  const frame = { canvas: { width: 0, height: 0 }, artW: 10, artH: 20, anchorArtX: 5 };
  assert.equal(whiteFrame(frame), frame);
});

test('effects never change a step: the same fight, stepped with and without them, is identical', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../js/game/battle.js');
  const { getMap } = await import('../js/data/maps.js');
  const sprites = fakeSprites();
  const run = (withFx) => {
    let i = 0;
    const input = {
      flush() {},
      sample() {
        const k = i++ % 50;
        return { right: k < 20, action1: k === 22, action1Pressed: k === 22, action2: k === 40, action2Pressed: k === 40, jump: k === 30, jumpPressed: k === 30 };
      },
    };
    const battle = new Battle({ canvas: { getContext: () => ({}) }, map: getMap('city'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input });
    battle.p2.controller = null;
    battle.p2.combat.launchPoint = 40;
    if (!withFx) battle.fx = { take() {}, reset() {}, timeScale: 1 };
    battle.setPhase('fight');
    battle.p2.body.x = battle.p1.body.x + 44;
    const out = [];
    let events = 0;
    for (let s = 0; s < 600; s++) {
      battle.update(DT);
      events += battle.combat.events.length;
      out.push([battle.p1.body.x, battle.p1.body.y, battle.p2.body.x, battle.p2.body.y, battle.p2.combat.launchPoint].join());
    }
    battle.destroy();
    return { out, events };
  };
  const a = run(true);
  const b = run(false);
  assert.ok(a.events >= 3, 'a real fight');
  assert.deepEqual(a.out, b.out);
});

test('a flash set during a frame\'s steps is drawn by that frame\'s render, then gone', async () => {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../js/game/battle.js');
  const { getMap } = await import('../js/data/maps.js');
  const sprites = fakeSprites();
  let once = {};
  const input = { flush() {}, sample: () => { const out = once; once = {}; return out; } };
  const battle = new Battle({ canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input });
  battle.p2.controller = null;
  battle.setPhase('fight');
  battle.p2.body.x = battle.p1.body.x + 44;
  const drawn = [];
  battle.render = () => drawn.push(battle.fx.flashing(battle.p2));
  once = P('action1');
  for (let i = 0; i < 30; i++) battle.frame(1 / 60 + 1e-9);
  assert.equal(drawn.filter(Boolean).length, 1, 'exactly one frame drawn white');
  battle.destroy();
});
