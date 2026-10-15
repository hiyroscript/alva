// Run with node --test tests/systems/adamaris.test.mjs (no dependencies).
// Adamaris, the fourth stage: its registration, its continuous beach (real
// collision past both sides of the Void, with the camera, the Void and
// overtime's closing Void set round the same compact combat area as every
// other stage), its theme (built and drawn with and without live hazards,
// every coordinate finite) and full CPU matches on it in Quick Battle and
// Watch Mode. Real physics, Fighter, Battle and themes; the canvas is a
// recording stand-in, so paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMap, stageSlots } from '../../js/data/maps.js';
import { StageCollision } from '../../js/game/physics.js';
import { CONFIG } from '../../js/config.js';
import { def, DT, fakeSprites, makeFighter } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');
const { computeWorldScale } = await import('../../js/game/arena.js');
const { createTheme } = await import('../../js/stages/index.js');
const { StageHazards } = await import('../../js/game/stage-hazards.js');

const ADAMARIS = getMap('adamaris');
const G = ADAMARIS.mainStage.top;

// A context that checks every number it is handed is finite and counts
// what is painted.
function checkingContext() {
  const counts = { painted: 0, bad: [] };
  const check = (name, args) => {
    for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) counts.bad.push(name);
  };
  const ctx = new Proxy(counts, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...args) => (check(k, args), { addColorStop(at) { check('addColorStop', [at]); } });
      if (k === 'measureText') return () => ({ width: 10 });
      return (...args) => {
        check(k, args);
        if (k === 'fill' || k === 'stroke' || k === 'fillRect') t.painted++;
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) t.bad.push(k);
      t[k] = v;
      return true;
    },
  });
  return ctx;
}

function battleOn({ seed = 5, mode, difficulty = 'medium' } = {}) {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  return new Battle({
    canvas: { getContext: () => ({}) }, map: ADAMARIS, p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, seed, mode, difficulty,
  });
}

test('Adamaris is the fourth stage of the roster, with its own theme, continuous ground and volcano', () => {
  assert.deepEqual(MAPS.map((m) => m.id), ['desert', 'city', 'asperitas', 'adamaris']);
  assert.equal(stageSlots()[3].map, ADAMARIS, 'slot 04');
  assert.equal(stageSlots().length, CONFIG.stageRoster.totalSlots);
  assert.equal(ADAMARIS.name, 'Adamaris');
  assert.equal(ADAMARIS.tagline, 'A paradise beneath a restless volcano');
  assert.deepEqual(ADAMARIS.traits, [
    ['Terrain', 'Tropical beach'], ['Platforms', 'Continuous ground'], ['Hazards', 'Volcanic rockfall'], ['Obstacles', 'None'], ['Light', 'Tropical daylight'],
  ]);
  assert.equal(ADAMARIS.theme, 'adamaris');
  assert.deepEqual(ADAMARIS.ground, { type: 'continuous', reach: 2400 });
  assert.deepEqual(ADAMARIS.platforms, [], 'no platform: the beach is the ground');
  assert.deepEqual(ADAMARIS.solids, []);
  assert.deepEqual(ADAMARIS.hazards.map((h) => h.behavior), ['volcano']);
  // The renamed stages keep their ids, layouts and themes.
  assert.deepEqual([getMap('desert').name, getMap('city').name], ['Yerma', 'Sol-Noir']);
  assert.deepEqual([getMap('desert').theme, getMap('city').theme], ['desert', 'city']);
  for (const reducedMotion of [false, true]) {
    const theme = createTheme(ADAMARIS, { reducedMotion });
    assert.equal(theme.constructor.name, 'AdamarisTheme');
    assert.equal(theme.groundY, G);
    assert.equal(theme.hazards, null, 'no live hazards: the volcano at rest');
  }
});

test('the sand is real collision: run, jump, Dash and land on it, anywhere across and past the combat area', () => {
  const stage = new StageCollision(ADAMARIS);
  for (const x of [ADAMARIS.mainStage.left - 300, 1500, 1800, ADAMARIS.mainStage.right + 300]) {
    const { fighter, step } = makeFighter({ stage, x });
    assert.equal(fighter.grounded, true, `standing at ${x}`);
    assert.equal(fighter.body.y, G);
    step({ jump: true, jumpPressed: true });
    let rose = false;
    for (let i = 0; i < 120; i++) {
      step({ jump: true });
      if (fighter.body.y < G - 100) rose = true;
    }
    assert.ok(rose, 'it jumped');
    assert.equal(fighter.grounded, true, 'and landed on the sand');
    assert.equal(fighter.body.y, G);
    // A Dash along the beach ends on the sand too.
    step({ runRight: true, mouvementRight: true });
    for (let i = 0; i < 40; i++) step({ runRight: true });
    assert.equal(fighter.grounded, true);
    assert.equal(fighter.body.y, G);
  }
});

test('the camera frames Adamaris like every stage: the same compact combat area, fighters just as big', () => {
  const sprites = fakeSprites();
  const asperitas = getMap('asperitas');
  for (const [w, h] of [[1280, 720], [1920, 1080], [844, 390], [2560, 1440]]) {
    const scale = computeWorldScale(w, h, sprites, ADAMARIS);
    assert.equal(scale, computeWorldScale(w, h, sprites, asperitas), `${w}x${h}: as Asperitas, whose combat area is as wide`);
    const ratio = (CONFIG.render.fighterHeight * scale) / h;
    assert.ok(ratio >= CONFIG.render.fighterScreenRatioMin - 1e-9, `${w}x${h}: fighters ${(ratio * 100).toFixed(1)}% of the view`);
  }
  // Camera bounds round the Void, never round the far-reaching ground.
  const stage = new StageCollision(ADAMARIS);
  assert.ok(ADAMARIS.cameraBounds.left > stage.floor.x + 1000 && ADAMARIS.cameraBounds.right < stage.floor.x + stage.floor.w - 1000);
});

test('overtime closes the Void on the beach exactly as on every stage, and the side Void still takes a fighter standing on sand', () => {
  const battle = battleOn();
  battle.setPhase('fight');
  battle.setVoidPressure(1);
  const m = ADAMARIS.mainStage;
  const { sideEndGap, bottomEndGap } = CONFIG.battle.overtimeVoid;
  assert.deepEqual({ ...battle.stage.void }, {
    left: m.left - sideEndGap, right: m.right + sideEndGap, top: ADAMARIS.voidBounds.top, bottom: m.top + bottomEndGap,
  });
  // Standing on the sand just past the closed edge: taken at once, with the
  // Void's ripple where it crossed.
  battle.p2.controller = null;
  battle.p2.body.x = m.left - sideEndGap + 4;
  battle.p2.body.prevX = battle.p2.body.x;
  battle.p2.body.vx = -300;
  for (let i = 0; i < 10 && !battle.p2.lostToVoid; i++) battle.update(DT);
  assert.equal(battle.p2.lostToVoid, true);
  assert.equal(battle.score.p1, 1);
  assert.equal(battle.fx.ripples.length, 1);
  assert.equal(battle.fx.ripples[0].side, 'left');
  assert.equal(battle.fx.ripples[0].x, battle.stage.void.left);
  battle.setVoidPressure(0);
  assert.deepEqual({ ...battle.stage.void }, { ...ADAMARIS.voidBounds });
});

test('the theme draws everything with live hazards (an eruption, rocks, warnings, impacts) and without, every number finite', () => {
  const view = { scale: 1.1, w: 1600, h: 860, pxW: 1760, pxH: 946, dpr: 2, x: 1000, y: G - 602 };
  for (const reducedMotion of [false, true]) {
    for (const live of [false, true]) {
      const stage = new StageCollision(ADAMARIS);
      const hazards = live ? new StageHazards(stage, ADAMARIS, { seed: 3, opening: 'erupting' }) : null;
      const theme = createTheme(ADAMARIS, { reducedMotion, hazards });
      if (hazards) {
        // Into the eruption, with rocks flying and some landed.
        for (let i = 0; i < 60 * 5; i++) hazards.update(DT);
        while (!hazards.impacts.length || !hazards.rocks.length) hazards.update(DT);
        hazards.interpolate(0.5);
        assert.ok(theme.eruption > 0.3, 'erupting');
      }
      const ctx = checkingContext();
      const v = { ...view, ctx };
      theme.prepare(v);
      theme.update(1 / 60, v);
      theme.drawBackground(ctx, v);
      theme.drawTerrain(ctx, v);
      theme.drawForeground(ctx, v);
      theme.drawVoid(ctx, { ...v, x: ADAMARIS.voidBounds.left - 300 }, stage.void, [{ side: 'left', x: stage.void.left, y: G - 40, age: 0.3, life: 1.5 }]);
      assert.deepEqual(ctx.bad, [], `${reducedMotion ? 'reduced' : 'full'} motion, ${live ? 'live' : 'still'}: finite`);
      assert.ok(ctx.painted > 60, `a full scene painted (${ctx.painted})`);
    }
  }
});

test('Quick Battle and Watch Mode play full matches on Adamaris: CPUs move, fight and stay on the sand, the volcano strikes, the match ends', () => {
  for (const mode of ['quick-battle', 'watch']) {
    const battle = battleOn({ mode, seed: 21, difficulty: 'hard' });
    if (mode === 'quick-battle') battle.p1.controller = null;
    battle.setPhase('fight');
    let hazardHits = 0;
    let moved = 0;
    const startX = battle.p2.body.x;
    for (let i = 0; i < 60 * 300 && battle.phase === 'fight'; i++) {
      battle.update(DT);
      for (const f of battle.inPlay) {
        assert.ok(Number.isFinite(f.body.x) && Number.isFinite(f.body.y), `${mode}: finite`);
        assert.ok(f.body.y <= G + 1e-6, `${mode}: never below the sand`);
        if (f.body.grounded) assert.equal(f.body.y, G, `${mode}: grounded only on the sand`);
      }
      moved = Math.max(moved, Math.abs(battle.p2.body.x - startX));
      hazardHits += battle.combat.events.filter((e) => e.source === 'hazard').length;
    }
    assert.ok(moved > 200, `${mode}: the CPU moves about`);
    assert.ok(battle.stageHazards.volcano.thrown > 0, `${mode}: the volcano threw rocks`);
    assert.ok(hazardHits > 0 || mode === 'quick-battle', `${mode}: and they struck`);
    assert.notEqual(battle.phase, 'fight', `${mode}: the match ended`);
  }
});
