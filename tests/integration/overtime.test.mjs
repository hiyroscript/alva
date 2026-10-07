// Run with node --test tests/integration/overtime.test.mjs (no dependencies).
// Quick Battle's match clock and overtime, and the fighter-coloured burst
// the Void leaves: the 7-minute clock (Watch Mode keeping its 5), time-up
// with the points apart or level, overtime as the same live fight played on
// (score, Launch Points and everything in play kept), its results, the Void
// closing in from the sides and bottom (collision and the drawn Void alike)
// with its waves speeding up, restarts, Practice Ground left alone, and the
// elimination burst. Runs the real Battle, Fighter, physics, themes and hit
// effects on a stub canvas (see tests/helpers/fighter-harness.mjs); the
// screen's banner, HUD and result copy are in
// tests/interface/battle-screen.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMap, MAPS } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { getCharacter } from '../../js/data/characters.js';
import { CONFIG } from '../../js/config.js';
import { StageCollision } from '../../js/game/physics.js';
import { HIT_FX, HitEffects, eliminationPalette, NEUTRAL_ELIMINATION_PALETTE } from '../../js/game/rendering/hit-fx.js';
import { Projectile } from '../../js/game/combat/projectile.js';
import { def, DT, fakeSprites, fakeSpritesOf } from '../helpers/fighter-harness.mjs';

// Stage themes build Path2D art, which Node lacks: a do-nothing stand-in.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle, BATTLE_MODES, PERIODS } = await import('../../js/game/battle.js');
const { PracticeSession } = await import('../../js/game/practice.js');
const { createTheme } = await import('../../js/stages/index.js');

const RESPAWN_STEPS = Math.round(CONFIG.battle.respawnSeconds / DT);
const OT = CONFIG.battle.overtimeSeconds;
const { sideEndGap, bottomEndGap, maxWaveSpeedMultiplier } = CONFIG.battle.overtimeVoid;

// A battle in its fight phase on `mapId`, Player 1 driven by `script.held`,
// the other side by `script.cpu` (both stand still unless given input).
function match({ mapId = 'desert', mode, p1Def = def, p2Def = def } = {}) {
  const script = { held: {}, cpu: {} };
  const input = { flushes: 0, flush() { this.flushes++; }, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), mode, p1Def, p2Def,
    p1Sprites: fakeSpritesOf(p1Def), p2Sprites: fakeSpritesOf(p2Def), input, seed: 1,
  });
  // Watch Mode's Player 1 side is a CPU too: both stand still here.
  if (mode === 'watch') battle.p1.controller = { getInput: () => ({ ...script.held }) };
  battle.p2.controller = { getInput: () => ({ ...script.cpu }) };
  battle.setPhase('fight');
  const run = (steps = 1) => {
    for (let i = 0; i < steps; i++) battle.update(DT);
  };
  // Runs the normal clock down to its last step.
  const toTimeUp = () => {
    battle.timeLeft = DT / 2;
    run();
  };
  return { battle, script, input, run, toTimeUp };
}

// Carries `f` past the Void in force; its next step takes it.
const intoVoid = (battle, f) => {
  Object.assign(f.body, { y: battle.stage.void.bottom + 100, vy: 0, grounded: false, ground: null });
};

// A snapshot of everything overtime must carry on with.
function liveState(battle) {
  return {
    score: { ...battle.score },
    fighters: battle.fighters.map((f) => ({
      x: f.body.x, y: f.body.y, vx: f.body.vx, vy: f.body.vy,
      launchPoint: f.combat.launchPoint, energy: f.combat.energy,
      cooldown: f.combat.abilityCooldowns.remaining('attack3'), lostToVoid: f.lostToVoid, respawnTimer: f.respawnTimer,
    })),
    projectiles: battle.projectiles.length,
    clones: battle.clones.length,
  };
}

// The Void the closing reaches at `p` on `map`, worked out here from the
// rule itself.
function expectedVoid(map, p) {
  const base = map.voidBounds;
  const m = map.mainStage;
  const lerp = (a, b) => a + (b - a) * p;
  return {
    left: lerp(base.left, m.left - sideEndGap),
    right: lerp(base.right, m.right + sideEndGap),
    top: base.top,
    bottom: lerp(base.bottom, m.top + bottomEndGap),
  };
}

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

// ---- The clocks --------------------------------------------------------------------

test('config: Quick Battle 7:00 and 60 s of overtime; the Void closes to 120 past each ledge and 140 below the top; waves to 4x', () => {
  assert.equal(CONFIG.battle.quickBattleSeconds, 420);
  assert.equal(CONFIG.battle.roundSeconds, 300, 'Watch Mode keeps its 5 minutes');
  assert.equal(OT, 60);
  assert.deepEqual({ sideEndGap, bottomEndGap, maxWaveSpeedMultiplier }, { sideEndGap: 120, bottomEndGap: 140, maxWaveSpeedMultiplier: 4 });
  assert.equal(CONFIG.battle.pointsToWin, 3, 'still first to 3');
  assert.deepEqual([BATTLE_MODES['quick-battle'].seconds, BATTLE_MODES['quick-battle'].overtime], [420, true]);
  assert.deepEqual([BATTLE_MODES.watch.seconds, BATTLE_MODES.watch.overtime], [300, false]);
});

test('Quick Battle starts at exactly 420 s, Watch Mode at its 300; both in the normal period on the map\'s own Void', () => {
  const quick = match();
  assert.equal(quick.battle.mode, 'quick-battle');
  quick.battle.restart();
  assert.equal(quick.battle.timeLeft, 420);
  assert.equal(quick.battle.roundSeconds, 420);
  assert.equal(quick.battle.overtimeSeconds, 60);
  const watch = match({ mode: 'watch' });
  watch.battle.restart();
  assert.equal(watch.battle.timeLeft, 300);
  assert.equal(watch.battle.overtimeSeconds, 0, 'no overtime in Watch Mode');
  for (const { battle } of [quick, watch]) {
    assert.equal(battle.period, PERIODS.regulation);
    assert.equal(battle.overtime, false);
    assert.equal(battle.overtimeProgress, 0);
    assert.equal(battle.stage.void, battle.stage.baseVoid);
    assert.deepEqual({ ...battle.stage.void }, { ...battle.map.voidBounds });
    assert.equal(battle.voidWaveSpeed, 1);
  }
});

test('the normal clock counts down on simulation steps: 7:00 to 0:00 in 420 s of steps, not a frame less', () => {
  const { battle, run } = match();
  run(60);
  near(battle.timeLeft, 419, 'one second of steps');
  battle.timeLeft = 1;
  run(59);
  assert.equal(battle.phase, 'fight');
  assert.ok(battle.timeLeft > 0);
  // Ahead on points: the next step ends it.
  battle.score.p1 = 1;
  run();
  assert.equal(battle.phase, 'timeup');
});

// ---- The end of the normal clock -------------------------------------------------

test('time-up with the points apart: no overtime; the normal time-up and result, more points wins, whatever the Launch Point', () => {
  for (const [score, winner] of [[{ p1: 2, p2: 0 }, 'p1'], [{ p1: 1, p2: 2 }, 'p2']]) {
    const { battle, run, toTimeUp } = match();
    Object.assign(battle.score, score);
    battle[winner].combat.launchPoint = 250;
    toTimeUp();
    assert.equal(battle.phase, 'timeup');
    assert.equal(battle.overtime, false, 'no overtime');
    assert.equal(battle.timeLeft, 0);
    assert.deepEqual(battle.stage.void, battle.stage.baseVoid, 'the Void never moved');
    run(Math.ceil(CONFIG.battle.timeUpSeconds / DT) + 1);
    assert.equal(battle.phase, 'result');
    assert.deepEqual(battle.result, { outcome: winner, reason: 'points' });
  }
});

test('time-up with the points level: overtime, the same live fight; its clock starts at 60 and the Launch Point decides nothing yet', () => {
  const { battle, run, toTimeUp } = match();
  const { p1, p2 } = battle;
  battle.score.p1 = 1;
  battle.score.p2 = 1;
  // A Launch Point lead that would have won on time before.
  p1.combat.launchPoint = 12;
  p2.combat.launchPoint = 140;
  p1.combat.setEnergy(35);
  p1.combat.abilityCooldowns.start('attack3', 5);
  p1.body.x = battle.map.mainStage.left + 50;
  p2.body.vx = 120;
  // A projectile in flight, out of the way.
  const far = { x: -1e5, y: -1e5, w: 1, h: 1 };
  const shot = { alive: true, owner: p1, def: {}, update() {}, interpolate() {}, hitbox: (out) => Object.assign(out, far) };
  battle.projectiles.push(shot);
  // The CPU waits to respawn across the boundary.
  intoVoid(battle, p2);
  run();
  assert.deepEqual(battle.score, { p1: 2, p2: 1 });
  battle.score.p1 = 1;
  const before = liveState(battle);
  const phaseTime = battle.phaseTime;
  // The very step the normal clock runs out.
  battle.timeLeft = DT / 2;
  const flushes = battle.input.flushes;
  run();
  assert.equal(battle.phase, 'fight', 'not time-up: the fight goes on');
  assert.equal(battle.period, PERIODS.overtime);
  assert.equal(battle.overtime, true);
  near(battle.timeLeft, OT, 'overtime\'s clock starts full');
  assert.ok(battle.phaseTime > phaseTime, 'the same phase, never re-entered');
  assert.equal(battle.input.flushes, flushes, 'no input dropped');
  assert.deepEqual([p1.inputLocked, p2.inputLocked], [false, false], 'still controllable');
  assert.equal(battle.round, 1, 'not a second round');
  // Everything carries on (one more step of the world, nothing reset).
  const after = liveState(battle);
  assert.deepEqual(after.score, before.score);
  assert.deepEqual(after.fighters.map((f) => f.launchPoint), [12, 140]);
  assert.ok(Math.abs(after.fighters[0].energy - before.fighters[0].energy) < 1, 'Energy as it was');
  assert.ok(after.fighters[0].cooldown > 0 && after.fighters[0].cooldown < before.fighters[0].cooldown, 'cooldowns still running');
  assert.ok(Math.abs(after.fighters[0].x - before.fighters[0].x) < 1, 'nobody moved back to a spawn');
  assert.equal(after.fighters[1].lostToVoid, true, 'still out');
  assert.ok(after.fighters[1].respawnTimer > 0 && after.fighters[1].respawnTimer < before.fighters[1].respawnTimer, 'its wait runs on');
  assert.ok(battle.projectiles.includes(shot), 'projectiles kept');
  assert.equal(battle.result.outcome !== undefined, true);
  // The wait ends inside overtime: it respawns as ever.
  run(RESPAWN_STEPS);
  assert.equal(p2.lostToVoid, false);
  assert.equal(p2.combat.launchPoint, 0, 'a normal respawn');
});

test('Watch Mode keeps its old rule: 5:00 level on points goes straight to the Launch Point, never to overtime', () => {
  const { battle, run, toTimeUp } = match({ mode: 'watch' });
  battle.p1.combat.launchPoint = 20;
  battle.p2.combat.launchPoint = 50;
  toTimeUp();
  assert.equal(battle.phase, 'timeup');
  assert.equal(battle.overtime, false);
  run(Math.ceil(CONFIG.battle.timeUpSeconds / DT) + 1);
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'time' });
});

// ---- Overtime --------------------------------------------------------------------------

test('overtime is playable: Player 1 moves, falls score, respawns run, and the clock counts down to its own time-up', () => {
  const { battle, run, script, toTimeUp } = match();
  const { p1, p2 } = battle;
  toTimeUp();
  assert.equal(battle.overtime, true);
  const x = p1.body.x;
  script.held = { runRight: true };
  run(20);
  script.held = {};
  assert.ok(p1.body.x > x + 10, 'Player 1 runs');
  intoVoid(battle, p2);
  run();
  assert.deepEqual(battle.score, { p1: 1, p2: 0 }, 'a fall scores in overtime');
  assert.equal(battle.phase, 'fight', 'and the match goes on');
  run(RESPAWN_STEPS);
  assert.equal(p2.lostToVoid, false, 'respawned');
  intoVoid(battle, p1);
  run();
  assert.deepEqual(battle.score, { p1: 1, p2: 1 });
  run(RESPAWN_STEPS);
  assert.equal(p1.lostToVoid, false);
  // Run the rest of overtime out.
  let steps = 0;
  while (battle.phase === 'fight' && steps++ < Math.ceil(OT / DT) + 5) run();
  assert.equal(battle.phase, 'timeup');
  assert.equal(battle.timeLeft, 0);
  assert.ok(steps < Math.ceil(OT / DT), `overtime ran its remaining clock (${steps} steps)`);
});

test('a third point in overtime ends the match at once: the K.O. beat, then the result', () => {
  const { battle, run, toTimeUp } = match();
  battle.score.p1 = 2;
  battle.score.p2 = 2;
  toTimeUp();
  assert.equal(battle.overtime, true);
  run(120);
  intoVoid(battle, battle.p1);
  run();
  assert.equal(battle.phase, 'ko', 'no waiting for the clock');
  assert.ok(battle.timeLeft > OT - 3);
  assert.deepEqual(battle.score, { p1: 2, p2: 3 });
  assert.equal(battle.p1.respawnTimer, null, 'the loser stays out');
  run(Math.ceil(CONFIG.battle.koSeconds / DT) + 1);
  assert.equal(battle.phase, 'result');
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'void' });
});

test('overtime\'s end: more points wins; level on points, the lower Launch Point; equal on both (within 1e-6) a draw', () => {
  const end = (score, a, b) => {
    const { battle, run, toTimeUp } = match();
    toTimeUp();
    assert.equal(battle.overtime, true);
    Object.assign(battle.score, score);
    battle.p1.combat.launchPoint = a;
    battle.p2.combat.launchPoint = b;
    battle.timeLeft = DT / 2;
    run();
    assert.equal(battle.phase, 'timeup', 'overtime never repeats');
    assert.equal(battle.overtime, true);
    run(Math.ceil(CONFIG.battle.timeUpSeconds / DT) + 1);
    assert.equal(battle.phase, 'result');
    return battle.result;
  };
  assert.deepEqual(end({ p1: 1, p2: 0 }, 300, 0), { outcome: 'p1', reason: 'overtimePoints' }, 'points first');
  assert.deepEqual(end({ p1: 0, p2: 2 }, 0, 300), { outcome: 'p2', reason: 'overtimePoints' });
  assert.deepEqual(end({ p1: 1, p2: 1 }, 30, 31), { outcome: 'p1', reason: 'overtimeLaunchPoint' }, 'lower Launch Point');
  assert.deepEqual(end({ p1: 0, p2: 0 }, 90, 12.5), { outcome: 'p2', reason: 'overtimeLaunchPoint' });
  assert.deepEqual(end({ p1: 2, p2: 2 }, 40, 40 + 1e-9), { outcome: 'draw', reason: 'overtimeLaunchPoint' }, 'a draw');
  assert.equal(end({ p1: 0, p2: 0 }, 0, 0).outcome, 'draw');
});

test('a restart or rematch clears overtime: 0-0, 7:00, the map\'s own Void, waves at normal speed, nothing left of the burst', () => {
  const { battle, run, toTimeUp } = match();
  battle.score.p1 = 1;
  battle.score.p2 = 1;
  toTimeUp();
  run(Math.round(40 / DT));
  assert.ok(battle.overtimeProgress > 0.6);
  assert.notDeepEqual({ ...battle.stage.void }, { ...battle.stage.baseVoid });
  assert.ok(battle.voidWaveSpeed > 1);
  battle.theme.advanceVoid(1, battle.voidWaveSpeed);
  assert.ok(battle.theme.voidSurge > 0);
  intoVoid(battle, battle.p2);
  run();
  assert.equal(battle.fx.eliminations.length, 1);
  battle.restart();
  assert.equal(battle.period, PERIODS.regulation);
  assert.equal(battle.overtime, false);
  assert.equal(battle.overtimeProgress, 0);
  assert.equal(battle.timeLeft, 420);
  assert.deepEqual(battle.score, { p1: 0, p2: 0 });
  assert.equal(battle.phase, 'intro');
  assert.equal(battle.stage.void, battle.stage.baseVoid, 'the map\'s own Void');
  assert.deepEqual({ ...battle.stage.void }, { ...battle.map.voidBounds });
  assert.equal(battle.voidPressure, 0);
  assert.equal(battle.voidWaveSpeed, 1);
  assert.equal(battle.theme.voidSurge, 0, 'the waves at their normal phase');
  assert.deepEqual(battle.fx.eliminations, [], 'no burst left over');
  // And a full normal clock to play again before any overtime.
  battle.setPhase('fight');
  run(60);
  assert.equal(battle.overtime, false);
  assert.ok(battle.timeLeft > 418);
});

// ---- The closing Void ---------------------------------------------------------------

test('overtime progress is deterministic, monotonic and clamped to 0-1, from overtime\'s own clock', () => {
  const trace = () => {
    const { battle, run, toTimeUp } = match();
    toTimeUp();
    const out = [battle.overtimeProgress];
    for (let i = 0; i < Math.ceil(OT / DT) + 30; i++) {
      run();
      out.push(battle.overtimeProgress);
    }
    return out;
  };
  const a = trace();
  assert.deepEqual(a, trace(), 'the same every time');
  assert.ok(a[0] < 1e-3, 'from (about) 0 at its start');
  for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1], `monotonic at ${i}`);
  assert.ok(a.every((p) => p >= 0 && p <= 1), 'clamped');
  assert.equal(a.at(-1), 1, 'and 1 at its end, held there');
  // Halfway through the clock, halfway closed.
  const { battle, run, toTimeUp } = match();
  toTimeUp();
  run(Math.round(OT / 2 / DT));
  near(battle.overtimeProgress, 0.5, 'halfway');
  // Outside overtime there is none, whatever the clock says.
  const normal = match().battle;
  normal.timeLeft = 5;
  assert.equal(normal.overtimeProgress, 0);
});

test('through overtime the Void closes linearly from the left, right and bottom only; the top never moves; on both stages', () => {
  for (const map of MAPS) {
    const { battle, run, toTimeUp } = match({ mapId: map.id });
    const base = { ...map.voidBounds };
    toTimeUp();
    let last = { ...battle.stage.void };
    for (let s = 0; s < Math.ceil(OT / DT) + 2; s++) {
      run();
      const v = battle.stage.void;
      assert.ok(v.left >= last.left && v.right <= last.right && v.bottom <= last.bottom, `${map.id}: only ever closing`);
      assert.equal(v.top, base.top, `${map.id}: the top never moves`);
      last = { ...v };
    }
    // At its end: exactly the destinations, relative to the main stage.
    const m = map.mainStage;
    assert.deepEqual({ ...battle.stage.void }, { left: m.left - sideEndGap, right: m.right + sideEndGap, top: base.top, bottom: m.top + bottomEndGap });
    // In between, a straight line from the map's own.
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      battle.setVoidPressure(p);
      const want = expectedVoid(map, p);
      for (const k of ['left', 'right', 'top', 'bottom']) near(battle.stage.void[k], want[k], `${map.id} ${k} at ${p}`);
    }
    assert.deepEqual({ ...map.voidBounds }, base, 'map.voidBounds never written');
    assert.ok(Object.isFrozen(map.voidBounds));
  }
});

test('the closed Void always leaves the ledges and the surface clear, whatever the tuning; it never moves outward', () => {
  for (const map of [...MAPS, PRACTICE_MAP]) {
    const m = map.mainStage;
    const stage = new StageCollision(map);
    const v = stage.closeVoid(1, CONFIG.battle.overtimeVoid);
    assert.ok(v.left < m.left - 100 && v.right > m.right + 100, `${map.id}: outside both ledges`);
    assert.ok(v.bottom > m.top + 100, `${map.id}: below the surface`);
    // A fighter standing on either ledge's very edge, or anywhere on the
    // main stage, is never in it.
    for (const x of [m.left + 1, (m.left + m.right) / 2, m.right - 1]) {
      assert.equal(stage.inVoid({ x, y: m.top, height: 100 }), false);
    }
    // Hostile tuning: no gap, or a negative one, still never reaches the
    // stage; out-of-range progress is clamped.
    for (const gaps of [{ sideEndGap: 0, bottomEndGap: 0 }, { sideEndGap: -500, bottomEndGap: -500 }]) {
      const w = stage.closeVoid(7, gaps);
      assert.ok(w.left < m.left && w.right > m.right && w.bottom > m.top, `${map.id}: clamped clear of the stage`);
      assert.equal(w.top, stage.baseVoid.top);
    }
    assert.equal(stage.closeVoid(-3, CONFIG.battle.overtimeVoid), stage.baseVoid, 'below 0 is the map\'s own');
    // A gap wider than the map's own Void never pushes it out.
    const wide = stage.closeVoid(1, { sideEndGap: 5000, bottomEndGap: 5000 });
    assert.deepEqual({ ...wide }, { ...stage.baseVoid });
  }
});

test('StageCollision.inVoid uses the Void in force: a fighter the closing edge passes is taken on that very step, through the usual flow', () => {
  const { battle, run, toTimeUp } = match();
  const { p1, p2 } = battle;
  const m = battle.map.mainStage;
  const base = battle.map.voidBounds;
  // Hovering out past the right ledge, safe from the map's own Void.
  const x = m.right + sideEndGap + 60;
  assert.ok(x < base.right);
  const probe = { x, y: m.top, height: 80 };
  assert.equal(battle.stage.inVoid(probe), false);
  battle.setVoidPressure(1);
  assert.equal(battle.stage.inVoid(probe), true, 'the same point is in the closed Void');
  battle.setVoidPressure(0);
  assert.equal(battle.stage.inVoid(probe), false);
  // Overtime closing in on a fighter held out there (CPU in the air, kept
  // in place each step).
  toTimeUp();
  let taken = -1;
  for (let s = 0; s < Math.ceil(OT / DT) && taken < 0; s++) {
    Object.assign(p2.body, { x, y: m.top - 200, vx: 0, vy: 0, grounded: false, ground: null });
    run();
    if (p2.lostToVoid) taken = s;
  }
  assert.ok(taken > 0, 'taken once the edge passed it');
  const v = battle.stage.void;
  assert.ok(v.right < x, 'the edge in force had passed its centre');
  assert.deepEqual(battle.score, { p1: 1, p2: 0 }, 'scored like any fall');
  assert.ok(p2.respawnTimer > 0, 'and it waits to respawn as ever');
  assert.equal(battle.fx.eliminations.length, 1, 'with its burst');
  assert.equal(p1.lostToVoid, false);
  // Projectiles and the CPU's senses read the same stage.
  assert.equal(battle.simCtx.stage, battle.stage);
  assert.equal(battle.simCtx.stage.void, v);
});

test('a projectile goes once it flies clean out of the Void in force, where the map\'s own would have kept it', () => {
  const { battle } = match();
  const m = battle.map.mainStage;
  const def = { speed: 600, lifetime: 10, hitbox: { x: -5, y: -5, w: 10, h: 10 } };
  const shoot = () => new Projectile({ owner: battle.p1, def, anim: null, x: m.right + sideEndGap + 10, y: m.top - 40, direction: 1 });
  const free = shoot();
  free.update(DT, battle.stage);
  assert.equal(free.alive, true, 'inside the map\'s own Void it flies on');
  battle.setVoidPressure(1);
  const closed = shoot();
  closed.update(DT, battle.stage);
  assert.equal(closed.alive, false, 'past the closed edge it is gone');
});

test('the drawn Void is handed exactly the rectangle collision tests, every frame, and traces its edge there', () => {
  const { battle, toTimeUp, run } = match();
  toTimeUp();
  run(Math.round(30 / DT));
  const handed = [];
  const real = battle.theme;
  battle.theme = {
    prepare() {}, update() {}, advanceVoid() {}, resetVoid() {}, shadow: { alpha: 0.3, skew: 0, stretch: 1 },
    drawBackground() {}, drawTerrain() {}, drawForeground() {},
    drawVoid: (ctx, view, bounds) => handed.push(bounds),
  };
  battle.ctx = recordingContext();
  Object.assign(battle.view, { ctx: battle.ctx, pxW: 1280, pxH: 720, scale: 1, x: 1000, y: 300, w: 1280, h: 720 });
  battle.pxPerArt = 2;
  battle.render();
  assert.deepEqual(handed, [battle.stage.void], 'the very object collision reads');
  assert.notEqual(handed[0], battle.stage.baseVoid);
  // The real theme traces its wavy edge around the bounds it is handed,
  // not the map's.
  battle.theme = real;
  const v = battle.stage.void;
  const ctx = recordingContext();
  const view = { ctx, scale: 1, dpr: 1, w: 1560, h: 880, pxW: 1560, pxH: 880, x: 1800 - 780, y: v.bottom - 700 };
  real.drawVoid(ctx, view, v);
  const edge = ctx.points.filter(([k, , y]) => k === 'lineTo' && Math.abs(y - v.bottom) <= 13);
  assert.ok(edge.length > 10, 'the bottom edge sits on the closed line');
  assert.ok(ctx.points.every(([, , y]) => y < battle.map.voidBounds.bottom - 13 || y > v.bottom + 13), 'none at the map\'s old line');
});

// ---- Void waves ------------------------------------------------------------------------

test('the Void\'s waves speed up through overtime, smoothly and ever faster, to about 4x; never with reduced motion', () => {
  const { battle, toTimeUp, run } = match();
  assert.equal(battle.voidWaveSpeed, 1);
  const speeds = [];
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    battle.setVoidPressure(p);
    speeds.push(battle.voidWaveSpeed);
    near(battle.voidWaveSpeed, 1 + 3 * p * p, `speed at ${p}`);
  }
  assert.equal(speeds[0], 1);
  near(speeds.at(-1), maxWaveSpeedMultiplier, 'about 4x at the end');
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] > speeds[i - 1]);
  assert.ok(speeds[4] - speeds[3] > speeds[1] - speeds[0], 'the speeding-up grows (an ease-in)');
  battle.setVoidPressure(0);
  // Through a real overtime, step by step.
  toTimeUp();
  let last = battle.voidWaveSpeed;
  for (let s = 0; s < Math.ceil(OT / DT); s++) {
    run();
    assert.ok(battle.voidWaveSpeed >= last);
    last = battle.voidWaveSpeed;
  }
  near(last, maxWaveSpeedMultiplier, 'at its end');

  // The theme runs its waves on at the speed it is given, its shape the
  // same; its phase never jumps when the speed changes.
  const map = getMap('desert');
  const v = map.voidBounds;
  const view = { scale: 1, dpr: 1, w: 1560, h: 880, pxW: 1560, pxH: 880, x: 1800 - 780, y: v.bottom - 700 };
  const shot = (theme) => {
    const ctx = recordingContext();
    theme.drawVoid(ctx, { ...view, ctx }, v);
    return ctx.points.filter(([k, , y]) => k === 'lineTo' && Math.abs(y - v.bottom) < 40).map(([, , y]) => y - v.bottom);
  };
  const slow = createTheme(map);
  const fast = createTheme(map);
  for (const theme of [slow, fast]) theme.update(0.5, view);
  slow.advanceVoid(0.5, 1);
  fast.advanceVoid(0.5, 4);
  assert.equal(slow.voidSurge, 0, 'normal speed: no surge');
  near(fast.voidSurge, 1.5, '3 s more of wave motion over 0.5 s at 4x');
  const a = shot(slow);
  const b = shot(fast);
  assert.notDeepEqual(a, b, 'the fast waves are further on');
  assert.ok(Math.max(...b.map(Math.abs)) <= 12 + 1e-9, 'never more than its normal amplitude');
  // Tiny steps at changing speed: no jump.
  const theme = createTheme(map);
  let prev = shot(theme);
  for (let i = 1; i <= 60; i++) {
    theme.update(1 / 60, view);
    theme.advanceVoid(1 / 60, 1 + 3 * (i / 60) ** 2);
    const now = shot(theme);
    const moved = Math.max(...now.map((y, j) => Math.abs(y - prev[j])));
    assert.ok(moved < 1.5, `frame ${i}: the edge moves on smoothly (${moved.toFixed(2)})`);
    prev = now;
  }
  // Reduced motion: still, however fast and however long.
  const still = createTheme(map, { reducedMotion: true });
  const s0 = shot(still);
  still.update(3, view);
  still.advanceVoid(3, 4);
  assert.deepEqual(shot(still), s0, 'reduced motion: the waves hold still');
  // A frame feeds the theme the Arena's speed.
  const calls = [];
  battle.theme = { ...battle.theme, prepare() {}, update() {}, drawVoid() {}, advanceVoid: (dt, speed) => calls.push(speed) };
  battle.render = () => {};
  battle.frame(1 / 60);
  assert.deepEqual(calls, [battle.voidWaveSpeed]);
});

test('reduced motion: overtime still closes the Void in for real; only the art holds still', () => {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('city'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, reducedMotion: true,
  });
  battle.p2.controller = null;
  battle.setPhase('fight');
  battle.timeLeft = DT / 2;
  battle.update(DT);
  assert.equal(battle.overtime, true);
  for (let i = 0; i < Math.ceil(OT / DT) + 2; i++) battle.update(DT);
  const m = battle.map.mainStage;
  assert.equal(battle.stage.void.right, m.right + sideEndGap, 'the gameplay boundary moved all the same');
});

// ---- Practice Ground -------------------------------------------------------------------

test('Practice Ground never closes its Void: no period, no clock, the map\'s own static Void and normal waves, its respawn unchanged', () => {
  const input = { flush() {}, sample: () => ({}) };
  const session = new PracticeSession({ canvas: { getContext: () => ({}) }, map: PRACTICE_MAP, def, sprites: fakeSprites(), input });
  for (const key of ['period', 'overtime', 'overtimeProgress', 'timeLeft', 'overtimeSeconds']) assert.equal(key in session, false, key);
  const base = session.stage.void;
  assert.equal(base, session.stage.baseVoid);
  for (let i = 0; i < Math.round(90 / DT); i++) session.update(DT);
  assert.equal(session.stage.void, base, 'never moved');
  assert.equal(session.voidPressure, 0);
  assert.equal(session.voidWaveSpeed, 1);
  // A fall: a burst, and its usual respawn.
  const p = session.player;
  Object.assign(p.body, { x: PRACTICE_MAP.voidBounds.right + 20, grounded: false, ground: null });
  session.update(DT);
  assert.equal(p.lostToVoid, true);
  assert.equal(session.fx.eliminations.length, 1, 'the shared burst plays here too');
  for (let i = 0; i < RESPAWN_STEPS; i++) session.update(DT);
  assert.equal(p.lostToVoid, false, 'back after its wait');
  assert.equal(session.stage.void, base);
});

// ---- The elimination burst -------------------------------------------------------------

test('a fall bursts exactly once, where the fighter went in, in its own colours; it plays on after the fighter is gone, then ends', () => {
  const p2Def = getCharacter('0002');
  const { battle, run } = match({ p2Def });
  const { p2 } = battle;
  intoVoid(battle, p2);
  // Where it is taken: its body centre on the step the Void takes it.
  p2.body.vy = 0;
  run();
  assert.equal(p2.lostToVoid, true);
  assert.deepEqual(battle.inPlay, [battle.p1], 'gone from play');
  assert.equal(battle.fx.eliminations.length, 1, 'exactly one burst');
  const [burst] = battle.fx.eliminations;
  assert.equal(burst.slot, 'p2');
  near(burst.x, p2.body.x, 'x');
  near(burst.y, p2.body.y - p2.body.height / 2, 'y: its centre');
  assert.deepEqual(burst.palette, p2Def.visual.eliminationPalette, 'its own palette');
  assert.equal(burst.size, p2Def.visual.height, 'sized by the fighter');
  // More steps, the fighter still out: no second burst.
  run(30);
  assert.equal(battle.fx.eliminations.length, 1);
  // Drawn after the fighter has gone, in its colours, then over and gone.
  const ctx = recordingContext();
  battle.fx.drawEliminations(ctx, (x, y) => [x, y], 1, 1);
  const colours = new Set(ctx.strokes.map((s) => s.color));
  for (const c of p2Def.visual.eliminationPalette) assert.ok(colours.has(c), `drawn in ${c}`);
  const shards = ctx.points.filter(([k]) => k === 'moveTo').length;
  assert.ok(shards >= 20 * 2 && shards <= 30 * 2, `20-30 shards, each over its dark line (${shards / 2})`);
  const { life } = HIT_FX.elimination;
  assert.ok(life >= 0.45 && life <= 0.65, `${life} s`);
  battle.fx.update(life * 0.5);
  assert.equal(battle.fx.eliminations.length, 1, 'still playing');
  battle.fx.update(life * 0.5 + 1e-6);
  assert.deepEqual(battle.fx.eliminations, [], 'over and gone');
  const after = recordingContext();
  battle.fx.drawEliminations(after, (x, y) => [x, y], 1, 1);
  assert.deepEqual(after.points, [], 'nothing left to draw');
});

test('two fighters taken on the same step burst once each, each in its own palette at its own place', () => {
  const p1Def = getCharacter('0001');
  const p2Def = getCharacter('0002');
  const { battle, run } = match({ p1Def, p2Def });
  const { p1, p2 } = battle;
  intoVoid(battle, p1);
  intoVoid(battle, p2);
  p1.body.x -= 200;
  p2.body.x += 200;
  run();
  assert.deepEqual([p1.lostToVoid, p2.lostToVoid], [true, true]);
  const bursts = battle.fx.eliminations;
  assert.equal(bursts.length, 2);
  const bySlot = Object.fromEntries(bursts.map((b) => [b.slot, b]));
  assert.deepEqual(bySlot.p1.palette, p1Def.visual.eliminationPalette);
  assert.deepEqual(bySlot.p2.palette, p2Def.visual.eliminationPalette);
  near(bySlot.p1.x, p1.body.x, 'p1 x');
  near(bySlot.p2.x, p2.body.x, 'p2 x');
  assert.notDeepEqual(p1Def.visual.eliminationPalette, p2Def.visual.eliminationPalette, 'two different fighters, two different bursts');
  // A restart clears them.
  battle.restart();
  assert.deepEqual(battle.fx.eliminations, []);
});

test('palettes are character data: each playable fighter has 3-5 colours of its own; a fighter without falls back to a neutral one', () => {
  for (const id of ['0001', '0002']) {
    const palette = getCharacter(id).visual.eliminationPalette;
    assert.ok(Array.isArray(palette) && palette.length >= 3 && palette.length <= 5, id);
    assert.ok(palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)), id);
    assert.equal(eliminationPalette(getCharacter(id)), palette);
  }
  assert.equal(eliminationPalette({ visual: { height: 80 } }), NEUTRAL_ELIMINATION_PALETTE);
  assert.equal(eliminationPalette({ visual: { eliminationPalette: [] } }), NEUTRAL_ELIMINATION_PALETTE);
  assert.equal(eliminationPalette(null), NEUTRAL_ELIMINATION_PALETTE);
  assert.ok(NEUTRAL_ELIMINATION_PALETTE.length >= 3);
  // The shared effect knows no fighter by id.
  const source = readFileSync(new URL('../../js/game/rendering/hit-fx.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /'000\d'|"000\d"|\.id\s*===/, 'no fighter id in the effect');
});

test('the burst is paint only: the same fight steps identically with and without it, and it never touches a fighter', () => {
  const run = (withBurst) => {
    const { battle, run: step } = match();
    if (!withBurst) battle.fx.addElimination = () => {};
    const out = [];
    for (let i = 0; i < 3; i++) {
      intoVoid(battle, battle.p2);
      step(RESPAWN_STEPS + 2);
      out.push(JSON.stringify([battle.score, battle.p1.body.x, battle.p1.body.y, battle.p2.body.x, battle.p2.body.y, battle.p1.combat.launchPoint, battle.p2.combat.stun]));
    }
    return out;
  };
  assert.deepEqual(run(true), run(false));
});

test('reduced motion: the burst keeps its colour flash and fade, with no shake and its shards barely travelling', () => {
  const sizeOf = (reducedMotion) => {
    const fx = new HitEffects({ reducedMotion });
    fx.addElimination({ slot: 'p1', def: getCharacter('0001'), body: { x: 0, y: 0, height: 100 } });
    const shake = fx.shake.amp;
    fx.update(HIT_FX.elimination.life * 0.8);
    const ctx = recordingContext();
    fx.drawEliminations(ctx, (x, y) => [x, y], 1, 1);
    const reach = Math.max(...ctx.points.map(([, x, y]) => Math.hypot(x, y + 50)));
    return { shake, reach, drawn: ctx.points.length };
  };
  const full = sizeOf(false);
  const calm = sizeOf(true);
  assert.ok(full.shake > 0, 'a small shake normally');
  assert.equal(calm.shake, 0, 'none with reduced motion');
  assert.ok(calm.drawn > 0, 'still a burst');
  assert.ok(calm.reach < full.reach * 0.6, `the shards travel much less (${calm.reach.toFixed(0)} vs ${full.reach.toFixed(0)})`);
  assert.ok(full.reach < 100 * 2, 'scaled to the fighter, not the screen');
});

// ---- Helpers ---------------------------------------------------------------------------------

// A context that records path points and each stroke's colour.
function recordingContext() {
  const points = [];
  const strokes = [];
  const state = { strokeStyle: null, fillStyle: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k === 'points') return points;
      if (k === 'strokes') return strokes;
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => points.push([k, x, y]);
      if (k === 'stroke') return () => strokes.push({ color: state.strokeStyle });
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
