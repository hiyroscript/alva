// Run with node --test tests/systems/super-jump-dust.test.mjs (no dependencies).
// The Super Jump's dust (HitEffects.addSuperJumpDust and drawDust in
// js/game/rendering/hit-fx.js, raised from Fighter.superJumpTakeoff by
// Arena.update): exactly one burst for every Super Jump that really takes
// off, a player's or a CPU's, at ground level where it left the ground and
// staying there (riding a moving platform it took off from), none for a
// normal jump, an air jump, Down alone or a refused press; it fades out in
// about a third of a second, is bounded, cleared by a restart, drawn
// behind the fighters, quieter with reduced motion, and never changes a
// step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HitEffects, HIT_FX } from '../../js/game/rendering/hit-fx.js';
import { StageCollision } from '../../js/game/physics.js';
import { PlatformHazards } from '../../js/game/platform-hazards.js';
import { HAZARD_STATES } from '../../js/data/platform-hazards.js';
import { getMap } from '../../js/data/maps.js';
import { def, DT, MOVEMENT, fakeSprites, makeFighter } from '../helpers/fighter-harness.mjs';

const JUMP = { jump: true, jumpPressed: true };
const DOWN = { down: true, downPressed: true };
const SUPER = { ...JUMP, ...DOWN };
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');

// A canvas context that records the calls made on it.
function recorder() {
  const calls = [];
  return new Proxy({ calls }, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
    set: (t, k, v) => {
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
}

// A Battle on `map` with Player 1 played by `script(i)` (i: its step) and
// the CPU standing still unless `cpu` says otherwise.
function battleWith(script, { map = 'desert', reducedMotion = false } = {}) {
  let i = 0;
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => script(i++) ?? {} };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(map), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, reducedMotion,
  });
  battle.p2.controller = null;
  battle.setPhase('fight');
  battle.p2.body.x = battle.p1.body.x + 400;
  // Every burst ever raised, by the fighter it came from.
  battle.raised = [];
  const add = battle.fx.addSuperJumpDust.bind(battle.fx);
  battle.fx.addSuperJumpDust = (takeoff) => {
    battle.raised.push(takeoff);
    add(takeoff);
  };
  return battle;
}

// ---- What raises it --------------------------------------------------------------------

test('every Super Jump that takes off raises exactly one burst, at ground level where its feet left the ground', () => {
  const battle = battleWith((i) => (i === 5 || i === 100 ? SUPER : {}));
  const p1 = battle.p1;
  let x = null;
  for (let s = 0; s < 160; s++) {
    if (s === 5) x = p1.body.x;
    battle.update(DT);
    if (s === 5) {
      assert.equal(battle.raised.length, 1, 'on its takeoff step');
      assert.equal(battle.fx.dusts.length, 1);
      const d = battle.fx.dusts[0];
      assert.equal(d.x, x, 'where it stood');
      assert.equal(d.y, battle.stage.floor.y, 'at ground level, never where the fighter is now');
      assert.ok(p1.body.y < d.y, 'the fighter rising away from it');
    }
  }
  assert.equal(battle.raised.length, 2, 'one for each Super Jump');
  battle.destroy();
});

test('no dust for a normal jump, an air jump with Down held, Down alone, or a Super Jump refused', () => {
  const none = (why, script, steps = 120) => {
    const battle = battleWith(script);
    for (let s = 0; s < steps; s++) battle.update(DT);
    assert.equal(battle.raised.length, 0, why);
    assert.equal(battle.fx.dusts.length, 0, why);
    battle.destroy();
  };
  none('a normal jump, held', (i) => (i === 3 ? JUMP : i < 30 ? { jump: true } : {}));
  none('a normal jump, then Down and Jump in the air', (i) => (i === 3 ? JUMP : i === 12 ? SUPER : {}));
  none('Down alone, tapped and held', (i) => (i === 3 ? DOWN : i < 60 ? { down: true } : {}));
  none('Jump first, Down after', (i) => (i === 3 ? JUMP : i === 4 ? { ...DOWN, jump: true } : {}));
  // Refused: pressed while an attack plays, long before its end: the
  // buffer runs out and nothing takes off.
  const refused = battleWith((i) => (i === 3 ? P('attack4') : i === 4 ? SUPER : {}));
  let jumped = false;
  for (let s = 0; s < 40; s++) {
    refused.update(DT);
    jumped ||= refused.p1.body.vy < -MOVEMENT.jumpVelocity;
  }
  assert.equal(jumped, false, 'it never took off');
  assert.equal(refused.raised.length, 0, 'a refused press');
  refused.destroy();
});

test('a CPU\'s Super Jump raises the same burst as a player\'s', async () => {
  const { CombatAIController } = await import('../../js/game/ai/combat-ai.js');
  const battle = battleWith(() => ({}));
  const ai = new CombatAIController({ difficulty: 'easy', rng: () => 0.5 });
  battle.p2.controller = ai;
  battle.p2.body.x = battle.p1.body.x + 700;
  battle.update(DT);
  ai.command({ jump: 'super', dir: 0 });
  for (let s = 0; s < 20 && !battle.raised.length; s++) battle.update(DT);
  assert.equal(battle.raised.length, 1);
  const [d] = battle.fx.dusts;
  assert.equal(d.y, battle.stage.floor.y);
  assert.ok(battle.p2.body.vy < -MOVEMENT.jumpVelocity, 'a real Super Jump');
  battle.destroy();
});

// ---- Its life ---------------------------------------------------------------------------

test('it fades out in about a third of a second, never lingers, and a restart clears it', () => {
  const fx = new HitEffects();
  fx.addSuperJumpDust({ x: 100, y: 800, ground: null });
  assert.ok(HIT_FX.dust.life >= 0.2 && HIT_FX.dust.life <= 0.35);
  let frames = 0;
  while (fx.dusts.length && frames < 200) {
    fx.update(1 / 144);
    frames++;
  }
  assert.ok(Math.abs(frames / 144 - HIT_FX.dust.life) < 2 / 144, `gone after ${(frames / 144).toFixed(3)} s`);
  // Bounded: past the limit the oldest goes.
  for (let i = 0; i < HIT_FX.dust.max + 5; i++) fx.addSuperJumpDust({ x: i, y: 800, ground: null });
  assert.equal(fx.dusts.length, HIT_FX.dust.max);
  assert.equal(fx.dusts[0].x, 5);
  fx.reset();
  assert.equal(fx.dusts.length, 0);
  // A Battle's restart clears what was in the air, and so does a respawn's
  // fresh fighter carry no takeoff of its own.
  const battle = battleWith((i) => (i === 3 ? SUPER : {}));
  for (let s = 0; s < 5; s++) battle.update(DT);
  assert.equal(battle.fx.dusts.length, 1);
  battle.restart();
  assert.equal(battle.fx.dusts.length, 0, 'restart');
  battle.p1.respawn(battle.stage);
  assert.equal(battle.p1.superJumpTakeoff, null, 'respawn');
  battle.destroy();
});

test('on a moving cloud it stays on the cloud, drawn where the cloud is drawn, while the fighter rises away', () => {
  const stage = new StageCollision(getMap('asperitas'));
  const hazards = new PlatformHazards(stage, { seed: 1 });
  const c = hazards.controllers[0];
  const p = c.platform;
  c.state = HAZARD_STATES.horizontal;
  c.from = { x: p.x, y: p.y };
  c.to = { x: p.x + 120, y: p.y };
  c.time = 0;
  c.duration = 2;
  const { fighter, step } = makeFighter({ stage, x: p.x + p.w / 2, y: p.y - 0.5 });
  const tick = (held = {}) => {
    hazards.update(DT, [fighter]);
    return step(held);
  };
  for (let i = 0; i < 5; i++) tick();
  assert.equal(fighter.body.ground, p);
  tick(SUPER);
  const takeoff = fighter.superJumpTakeoff;
  assert.equal(takeoff.ground, p, 'it took off from the cloud');
  const fx = new HitEffects();
  fx.addSuperJumpDust(takeoff);
  const [d] = fx.dusts;
  const startX = fx.dustAt(d).x;
  for (let i = 0; i < 12; i++) tick();
  p.renderX = p.x;
  p.renderY = p.y;
  const at = fx.dustAt(d);
  assert.ok(Math.abs(at.x - (p.x + takeoff.dx)) < 1e-9, 'on the cloud where it took off');
  assert.ok(Math.abs(at.y - p.y) < 1e-9, 'on its surface');
  assert.ok(at.x > startX, 'carried with it');
  assert.ok(fighter.body.y < at.y - 100, 'the fighter far above it');
});

// ---- How it is drawn ----------------------------------------------------------------------

test('it is drawn on the ground, behind the fighters; with reduced motion it barely spreads and raises no motes', () => {
  const draw = (reducedMotion, age) => {
    const fx = new HitEffects({ reducedMotion });
    fx.addSuperJumpDust({ x: 0, y: 0, ground: null });
    fx.update(age);
    const ctx = recorder();
    fx.drawDust(ctx, (x, y) => [x, y], 1);
    return ctx.calls;
  };
  const full = draw(false, HIT_FX.dust.life * 0.6);
  const quiet = draw(true, HIT_FX.dust.life * 0.6);
  const arcs = (calls) => calls.filter(([k]) => k === 'arc');
  const widest = (calls) => Math.max(...arcs(calls).map(([, x, , r]) => Math.abs(x) + r));
  assert.ok(arcs(full).length > arcs(quiet).length, 'motes only with motion');
  assert.ok(widest(full) > widest(quiet) * 1.5, `spreads: ${widest(full).toFixed(0)} vs ${widest(quiet).toFixed(0)}`);
  // Everything at or above the ground line it rose from, nothing below.
  for (const [, , y, r] of arcs(full)) assert.ok(y - r <= 0 + 1e-9 && y <= 0 + 1e-9, 'above the ground');
  // Gone once its life is over: nothing drawn.
  assert.equal(arcs(draw(false, HIT_FX.dust.life + 0.01)).length, 0);

  // In the Arena: drawn after the shadows and before every fighter.
  const battle = battleWith((i) => (i === 3 ? SUPER : {}));
  for (let s = 0; s < 6; s++) battle.update(DT);
  const order = [];
  battle.ctx = recorder();
  battle.view.pxW = 100;
  const theme = battle.theme;
  for (const k of ['prepare', 'drawBackground', 'drawTerrain', 'drawForeground', 'drawVoid']) theme[k] = () => {};
  battle.drawShadow = () => order.push('shadow');
  battle.drawFighter = () => order.push('fighter');
  battle.drawTrail = () => {};
  battle.drawMarkers = () => {};
  battle.drawStatus = () => {};
  battle.fx.drawDust = () => order.push('dust');
  battle.render();
  assert.deepEqual(order.slice(0, 4), ['shadow', 'shadow', 'dust', 'fighter']);
  battle.destroy();
});

test('the dust never changes a step: a match with Super Jumps runs the same with or without it', () => {
  const run = (withDust) => {
    const battle = battleWith((i) => (i % 70 === 3 ? { ...SUPER, runRight: true } : i % 70 < 30 ? { runRight: true } : {}));
    if (!withDust) battle.fx.addSuperJumpDust = () => {};
    const out = [];
    for (let s = 0; s < 400; s++) {
      battle.update(DT);
      out.push([battle.p1.body.x, battle.p1.body.y, battle.p1.body.vx, battle.p1.body.vy].join());
    }
    battle.destroy();
    return out;
  };
  assert.deepEqual(run(true), run(false));
});
