// The match entrance (js/game/entrance.js): its timeline in order (nobody in
// play before their spawn, each fighter appearing exactly 0.5 s after the
// camera's zoom reaches its spawn, the intro only once both stand there and
// the camera is home, the clock never moving), the world held still
// through it, its sounds (each entrance cue once, at its step's start; the
// spawn's cue for both entrance spawns and every Void respawn, heard as
// sfx.spawn; the closed list's four additions and nothing else), the
// screen-space zoom (§5: a pure 2D zoom of the picture, never a change of
// perspective), Restart and Rematch replaying it, nothing of the match's
// score, statistics or ejections touched, the home view the follow camera
// takes over, the versus screen's art, and reduced motion keeping the same
// timeline.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, PHASES } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { entranceTimeline, entranceStep, entranceFraming, ENTRANCE_STEPS } from '../../js/game/entrance.js';
import {
  framedZoom, nudgedZoom, zoomFocus, zoomPoint, installScreenZoom, removeScreenZoom, withScreenZoom, IDENTITY_ZOOM,
} from '../../js/game/rendering/screen-zoom.js';
import { MatchEntranceArt, boltShape, boltPoints, idleBounds, fighterScale, ENTRANCE_LOOK } from '../../js/game/rendering/match-entrance.js';
import { HIT_FX } from '../../js/game/rendering/hit-fx.js';
import { createTheme } from '../../js/stages/index.js';
import { BattleAudio } from '../../js/core/audio/battle-audio.js';
import { AudioManager, revealRoot } from '../../js/core/audio-manager.js';
import { ALLOWED_SOUNDS, SOUND_KINDS, SFX, SoundRegistry, isAllowedSound } from '../../js/core/audio/sounds.js';
import { SFX_RECIPES } from '../../js/core/audio/sfx.js';
import { getMap, MAPS } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { getCharacter } from '../../js/data/characters.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { CONFIG } from '../../js/config.js';
import { fakeSpritesOf, DT } from '../helpers/fighter-harness.mjs';
import { fakeAudio } from '../helpers/fake-audio.mjs';
import { realArt } from '../helpers/png-art.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const DEF = getCharacter('0001');
const CFG = CONFIG.battle.entrance;
const TIMELINE = entranceTimeline();
const EPS = 1e-6;

// ---- Helpers ------------------------------------------------------------------------

// A 2D context that keeps its transform, as a canvas's does: setTransform,
// save / restore, translate, scale; where (x, y) lands (`map`).
function matrixContext() {
  const ctx = {
    m: [1, 0, 0, 1, 0, 0],
    stack: [],
    setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; },
    save() { this.stack.push([...this.m]); },
    restore() { this.m = this.stack.pop() ?? this.m; },
    translate(x, y) {
      const [a, b, c, d, e, f] = this.m;
      this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
    },
    scale(sx, sy) {
      const [a, b, c, d, e, f] = this.m;
      this.m = [a * sx, b * sx, c * sy, d * sy, e, f];
    },
    map(x, y) {
      const [a, b, c, d, e, f] = this.m;
      return [a * x + c * y + e, b * x + d * y + f];
    },
  };
  return ctx;
}

// A canvas context recording every call, answering what drawing asks.
function recordingContext() {
  const calls = [];
  return new Proxy({ calls }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 10 });
      return (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

const stubInput = () => {
  const input = { flushes: 0, flush() { this.flushes += 1; }, sample: () => ({}) };
  input.player = () => input;
  return input;
};

// A real Battle built as every battle screen builds it: with its entrance.
function entranceBattle({ mapId = 'desert', mode = 'quick-battle', seed = 7, reducedMotion = false, p2Def = DEF, entrance = true } = {}) {
  const input = stubInput();
  const battle = new Battle({
    canvas: { getContext: () => recordingContext(), classList: { toggle() {} } }, map: getMap(mapId), mode, seed, reducedMotion, entrance,
    p1Def: DEF, p2Def, p1Sprites: fakeSpritesOf(DEF), p2Sprites: fakeSpritesOf(p2Def), input,
  });
  return { battle, input };
}

// Lays the battle's view out as a canvas `w` x `h` device pixels would.
function layOut(battle, w = 1280, h = 720) {
  battle.canvas.getBoundingClientRect = () => ({ width: w, height: h });
  globalThis.window ??= { devicePixelRatio: 1 };
  battle.resize(true);
}

// Steps until `done()` (or the entrance's length and more), returning how
// many steps it took.
function stepUntil(battle, done, limit = Math.ceil(TIMELINE.total / DT) + 400) {
  for (let i = 0; i < limit; i++) {
    if (done()) return i;
    battle.update(DT);
  }
  throw new Error('never happened');
}

function recorder() {
  const calls = [];
  return new Proxy({}, { get: (_, name) => (name === 'calls' ? calls : (...args) => { calls.push([name, ...args]); }) });
}
const callsNamed = (engine, name) => engine.calls.filter((c) => c[0] === name);

// ---- The timeline -------------------------------------------------------------------------------

test('the timeline: every step in order and contiguous, the defaults the owner set, every value in CONFIG.battle.entrance', () => {
  assert.deepEqual(TIMELINE.steps.map((s) => s.id), [...ENTRANCE_STEPS]);
  for (let i = 0; i < TIMELINE.steps.length; i++) {
    const s = TIMELINE.steps[i];
    assert.ok(s.end >= s.start, s.id);
    if (i > 0) assert.ok(Math.abs(s.start - TIMELINE.steps[i - 1].end) < EPS, `${s.id} follows on`);
  }
  assert.equal(TIMELINE.steps[0].start, 0);
  assert.ok(Math.abs(TIMELINE.steps.at(-1).end - TIMELINE.total) < EPS);
  // The owner's defaults (the task's §8 table).
  assert.equal(CFG.boltDraw, 0.12);
  assert.equal(CFG.flash, 0.1);
  assert.equal(TIMELINE.blackStart, 0.25);
  assert.ok(Math.abs(TIMELINE.blackEnd - 0.75) < EPS);
  assert.equal(TIMELINE.slides.p1.start, 0.95);
  assert.equal(TIMELINE.slides.p2.start, 1.25);
  assert.ok(Math.abs(TIMELINE.slides.p1.end - TIMELINE.slides.p1.start - 0.28) < EPS);
  assert.equal(TIMELINE.cover, 3.5);
  assert.ok(Math.abs(TIMELINE.coverFull - 3.78) < EPS);
  assert.ok(Math.abs(TIMELINE.revealEnd - TIMELINE.coverFull - 0.45) < EPS);
  const [one, two] = TIMELINE.spawns;
  assert.equal(one.zoomStart, 4.85);
  for (const s of TIMELINE.spawns) {
    assert.ok(Math.abs(s.arrive - s.zoomStart - 0.6) < EPS, 'a 0.6 s zoom');
    assert.ok(Math.abs(s.appear - s.arrive - 0.5) < EPS, 'the fighter 0.5 s after the zoom arrives');
    assert.ok(Math.abs(s.appear - s.burst - HIT_FX.elimination.life) < EPS, 'its burst starts the elimination\'s life before');
    assert.ok(Math.abs(s.backStart - s.appear - 0.35) < EPS, 'a beat');
    assert.ok(Math.abs(s.home - s.backStart - 0.6) < EPS, 'back in 0.6 s');
  }
  assert.deepEqual([one.slot, two.slot], ['p1', 'p2'], 'Team I first');
  assert.ok(two.zoomStart >= one.home, 'Team II after Team I is home');
  assert.ok(TIMELINE.total > 9 && TIMELINE.total < 10.5, `about ten seconds (${TIMELINE.total})`);
  assert.equal(entranceStep(TIMELINE, 0), 'strike');
  assert.equal(entranceStep(TIMELINE, 3.6), 'cover');
  assert.equal(entranceStep(TIMELINE, one.arrive + 0.1), 'awaitI');
  assert.equal(entranceStep(TIMELINE, TIMELINE.total), 'done');
  assert.ok(Object.isFrozen(CFG));
});

test('the entrance in order: nobody in play before their spawn, each 0.5 s after its zoom arrives, the intro only once both stand there and the camera is home, the clock never moving', () => {
  const { battle, input } = entranceBattle();
  layOut(battle);
  assert.equal(battle.phase, PHASES.entrance);
  assert.deepEqual(battle.inPlay, [], 'an empty stage');
  assert.equal(battle.secondary, null);
  assert.deepEqual(battle.cameraTargets, [null, null], 'the camera held');
  for (const f of battle.fighters) assert.equal(f.inputLocked, true);
  const timeLeft = battle.timeLeft;
  const homeView = { ...battle.view };
  const appeared = {};
  const flushesBefore = input.flushes;
  let step = 0;
  let introAt = null;
  while (battle.phase === PHASES.entrance) {
    battle.alpha = 0;
    battle.syncView();
    const t = battle.phaseTime;
    for (const f of battle.fighters) {
      if (!f.awaitingEntrance && !(f.slot in appeared)) appeared[f.slot] = t;
      assert.equal(battle.inPlay.includes(f), !f.awaitingEntrance);
    }
    // The lens never moves: the same view all through.
    assert.equal(battle.view.x, homeView.x);
    assert.equal(battle.view.y, homeView.y);
    assert.equal(battle.view.scale, homeView.scale);
    battle.update(DT);
    step += 1;
    if (battle.phase === PHASES.intro) introAt = battle.phaseTime === 0 ? step : null;
  }
  for (const s of TIMELINE.spawns) {
    assert.ok(Math.abs(appeared[s.slot] - s.appear) <= DT + EPS, `${s.slot} appears at ${appeared[s.slot]}, its moment ${s.appear}`);
    assert.ok(Math.abs(appeared[s.slot] - s.arrive - 0.5) <= DT + EPS, `${s.slot}: 0.5 s after its zoom arrives`);
  }
  assert.ok(appeared.p1 < appeared.p2, 'Team I first');
  assert.ok(Math.abs(step * DT - TIMELINE.total) <= DT + EPS, 'the intro starts as the entrance ends');
  assert.equal(introAt, step, 'with phaseTime 0: the banner\'s timing unchanged');
  assert.equal(battle.timeLeft, timeLeft, 'the match clock never moved');
  assert.equal(battle.elapsed, 0);
  assert.ok(input.flushes > flushesBefore, 'the presses buffered meanwhile dropped as the intro starts');
  for (const f of battle.fighters) assert.equal(f.inputLocked, true, 'still locked: the intro');
  // The camera is home as the follow camera takes over: no jump.
  assert.equal(battle.screenZoom.k, 1);
  battle.syncView();
  assert.deepEqual(battle.screenZoom, IDENTITY_ZOOM);
  const before = { x: battle.camera.x, y: battle.camera.y };
  battle.frame(1 / 60);
  assert.ok(Math.abs(battle.camera.x - before.x) < 1e-6 && Math.abs(battle.camera.y - before.y) < 1e-6, 'its target is the home view');
  // Then the existing intro, untouched.
  const intro = Math.round(CONFIG.battle.introSeconds / DT);
  for (let i = 0; i < intro + 1; i++) battle.update(DT);
  assert.equal(battle.phase, PHASES.fight);
});

test('the world holds still through the entrance: no physics, no CPU, no hazard, no respawn; the fighters who appeared only idle', () => {
  const { battle } = entranceBattle({ mapId: 'asperitas', mode: 'watch', seed: 11 });
  const hazards = () => battle.stage.platforms.map((p) => [p.x, p.y, p.active]);
  const startHazards = JSON.stringify(hazards());
  let thought = 0;
  for (const f of battle.fighters) {
    const own = f.controller;
    const getInput = own.getInput.bind(own);
    own.getInput = (...a) => { thought += 1; return getInput(...a); };
  }
  const places = () => battle.fighters.map((f) => [f.body.x, f.body.y, f.body.vx, f.body.vy, f.facing, f.state]);
  const start = JSON.stringify(places());
  const frames = new Set();
  stepUntil(battle, () => {
    if (!battle.p1.awaitingEntrance) frames.add(battle.p1.animator.frame);
    return battle.phase !== PHASES.entrance;
  });
  assert.equal(JSON.stringify(places()), start, 'nobody moved, slid, fell or turned');
  assert.equal(thought, 0, 'no CPU thought');
  assert.equal(JSON.stringify(hazards()), startHazards, 'no hazard advanced');
  assert.equal(battle.stageHazards.rocks?.length ?? 0, 0);
  assert.ok(frames.size > 1, 'its idle clip plays');
});

test('the entrance\'s cues: each sound once at its step\'s start, each spawn once as it pops, nothing else; the spawn\'s burst the elimination burst played backwards, timed as a respawn\'s', () => {
  const { battle } = entranceBattle();
  const heard = [];
  battle.cueListener = (type, detail) => heard.push({ type, t: battle.phaseTime, slot: detail?.fighter?.slot ?? null });
  const bursts = [];
  const addSpawn = battle.fx.addSpawn.bind(battle.fx);
  battle.fx.addSpawn = (f, at) => { bursts.push({ slot: f.slot, t: battle.phaseTime, at }); return addSpawn(f, at); };
  const addElimination = battle.fx.addElimination.bind(battle.fx);
  let eliminations = 0;
  battle.fx.addElimination = (f) => { eliminations += 1; return addElimination(f); };
  stepUntil(battle, () => battle.phase !== PHASES.entrance);
  const of = (type) => heard.filter((h) => h.type === type);
  assert.deepEqual(heard.map((h) => h.type), ['entranceBolt', 'entranceCover', 'entranceReveal', 'spawned', 'spawned']);
  const near = (t, at, what) => assert.ok(t >= at - EPS && t < at + DT + EPS, `${what} at ${t}, its moment ${at}`);
  near(of('entranceBolt')[0].t, 0, 'the strike');
  near(of('entranceCover')[0].t, TIMELINE.cover, 'the cover');
  near(of('entranceReveal')[0].t, TIMELINE.coverFull, 'the reveal');
  assert.deepEqual(of('spawned').map((h) => h.slot), ['p1', 'p2']);
  for (const s of TIMELINE.spawns) near(heard.find((h) => h.type === 'spawned' && h.slot === s.slot).t, s.appear, `${s.slot}'s spawn`);
  assert.deepEqual(bursts.map((b) => b.slot), ['p1', 'p2']);
  for (const s of TIMELINE.spawns) {
    const b = bursts.find((x) => x.slot === s.slot);
    near(b.t, s.burst, `${s.slot}'s burst`);
    const place = battle[s.slot].spawnPlacement(battle.stage);
    assert.deepEqual([b.at.x, b.at.y], [place.x, place.y], 'where it stands');
  }
  assert.equal(eliminations, 0, 'no elimination burst');
  assert.equal(battle.fx.ripples.length, 0, 'no Void ripple');
});

test('the score, the statistics and the ejections never see the entrance', () => {
  const { battle } = entranceBattle();
  const heard = [];
  battle.cueListener = (type) => heard.push(type);
  // Through the entrance and the intro, up to the fight's first step.
  stepUntil(battle, () => battle.phase === PHASES.fight);
  assert.deepEqual(battle.score, { p1: 0, p2: 0 });
  assert.equal(heard.includes('ejected'), false);
  const blank = new Battle({
    canvas: { getContext: () => recordingContext() }, map: getMap('desert'), seed: 7,
    p1Def: DEF, p2Def: DEF, p1Sprites: fakeSpritesOf(DEF), p2Sprites: fakeSpritesOf(DEF), input: stubInput(),
  });
  stepUntil(blank, () => blank.phase === PHASES.fight);
  assert.deepEqual(battle.stats.snapshot(battle.score), blank.stats.snapshot(blank.score), 'not one statistic: as a match with none');
  assert.equal(battle.elapsed, blank.elapsed);
  assert.equal(battle.timeLeft, blank.timeLeft, 'the same clock as a match with no entrance');
  for (const f of battle.fighters) {
    assert.equal(f.lostToVoid, false);
    assert.equal(f.ejected, false);
    assert.equal(f.respawnTimer, null);
    assert.equal(f.combat.launchPoint, 0);
  }
  assert.equal(battle.final, null);
});

test('Restart and Rematch replay the entrance: both off the stage again, the timeline from its start, every cue again', () => {
  const { battle } = entranceBattle();
  stepUntil(battle, () => battle.phase === PHASES.fight);
  for (let i = 0; i < 60; i++) battle.update(DT);
  battle.score.p1 = 2;
  const firstMatch = battle.matchIndex;
  for (const how of ['restart', 'rematch']) {
    if (how === 'rematch') {
      battle.finishMatch();
      assert.equal(battle.phase, PHASES.celebration);
    }
    const heard = [];
    battle.cueListener = (type) => heard.push(type);
    battle.restart();
    assert.equal(battle.phase, PHASES.entrance, how);
    assert.equal(battle.phaseTime, 0);
    assert.deepEqual(battle.inPlay, [], `${how}: nobody on the stage`);
    for (const f of battle.fighters) assert.equal(f.awaitingEntrance, true);
    assert.deepEqual(battle.score, { p1: 0, p2: 0 });
    assert.ok(battle.matchIndex > firstMatch, 'a new match: its own bolt');
    stepUntil(battle, () => battle.phase !== PHASES.entrance);
    assert.deepEqual(heard, ['restart', 'entranceBolt', 'entranceCover', 'entranceReveal', 'spawned', 'spawned'], how);
    assert.equal(battle.phase, PHASES.intro);
  }
});

test('without its entrance a Battle starts on its intro as ever (headless matches), and Practice Ground has none', () => {
  const { battle } = entranceBattle({ entrance: false });
  assert.equal(battle.phase, PHASES.intro);
  assert.equal(battle.entrance, null);
  assert.equal(battle.inPlay.length, 2);
  assert.equal(battle.entranceTime, null);
  const session = new PracticeSession({
    canvas: { getContext: () => recordingContext() }, map: PRACTICE_MAP, def: DEF, sprites: fakeSpritesOf(DEF), input: stubInput(),
  });
  assert.equal(session.phase, undefined);
  assert.ok(session.fighters.every((f) => !f.awaitingEntrance));
});

test('reduced motion: the same timeline, so an online match starts in step either way; only a gentler zoom', () => {
  const plain = entranceBattle().battle;
  const reduced = entranceBattle({ reducedMotion: true }).battle;
  assert.deepEqual(reduced.entrance, plain.entrance);
  layOut(plain);
  layOut(reduced);
  const s = TIMELINE.spawns[0];
  assert.ok(Math.abs(plain.entranceZoom(s.arrive).k - CFG.zoom) < EPS);
  assert.ok(Math.abs(reduced.entranceZoom(s.arrive).k - CFG.reducedZoom) < EPS);
  assert.ok(CFG.reducedZoom > 1 && CFG.reducedZoom < CFG.zoom);
  const steps = (b) => stepUntil(b, () => b.phase !== PHASES.entrance);
  assert.equal(steps(plain), steps(reduced));
});

// ---- The camera: a pure 2D zoom (§5) ------------------------------------------------------------

test('§5: every world point, at every depth, lands at F + z·(home − F) on a theme\'s own projection, through every kind of transform the stages set', () => {
  const view = { x: 1180, y: 400, w: 1185, h: 667, scale: 1.08, pxW: 1280, pxH: 720, dpr: 1 };
  for (const mapId of ['desert', 'city', 'asperitas', 'adamaris', 'jokull']) {
    const theme = createTheme(getMap(mapId), {});
    const persp = theme.persp;
    assert.ok(persp, `${mapId} has its projection`);
    for (const [k, cx, cy] of [[1.6, 300, 420], [1.25, 1000, 200], [1.4, 640, 360]]) {
      const zoom = framedZoom(view.pxW, view.pxH, k, cx, cy);
      const F = zoomFocus(zoom);
      const ctx = matrixContext();
      installScreenZoom(ctx, zoom);
      for (const f of [0.08, 0.3, 0.6, 1, 1.25]) {
        for (const [x, y] of [[1200, 860], [1800, 700], [2400, 300], [900, 1100]]) {
          const home = persp.point(view, x, y, f);
          const want = [F[0] + zoom.k * (home[0] - F[0]), F[1] + zoom.k * (home[1] - F[1])];
          // Drawn on the plane at depth f (Perspective.plane: an absolute
          // transform), and as a screen point under the identity.
          persp.plane(ctx, view, f);
          const onPlane = ctx.map(x, y);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const onScreen = ctx.map(...home);
          for (const got of [onPlane, onScreen]) {
            assert.ok(Math.hypot(got[0] - want[0], got[1] - want[1]) < 1, `${mapId} f=${f} (${x}, ${y}) at ${k}: ${got} vs ${want}`);
          }
        }
        // A parallax layer (StageTheme.layer) too.
        theme.layer(ctx, view, f);
        const p = ctx.map(1500, 700);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        theme.layer({ setTransform(...m) { ctx.raw = m; } }, view, f);
        const [a, , , d, e, ff] = ctx.raw;
        const home = [a * 1500 + e, d * 700 + ff];
        assert.ok(Math.hypot(p[0] - (F[0] + zoom.k * (home[0] - F[0])), p[1] - (F[1] + zoom.k * (home[1] - F[1]))) < 1);
      }
      removeScreenZoom(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      assert.deepEqual(ctx.map(10, 20), [10, 20], 'the context given back as it was');
    }
  }
});

test('§5 in the Battle: the lens stays the home view through the entrance, the zoom held inside the home frame, the shake in screen space, and the whole render drawn through it', () => {
  const { battle } = entranceBattle();
  layOut(battle, 1280, 720);
  const home = { ...battle.view };
  const { pxW: W, pxH: H } = home;
  const seen = [];
  for (let t = 0; t < TIMELINE.total; t += 0.05) {
    battle.phaseTime = t;
    battle.alpha = 0;
    battle.syncView();
    const z = battle.screenZoom;
    seen.push(z.k);
    assert.equal(battle.view.x, home.x);
    assert.equal(battle.view.y, home.y);
    assert.equal(battle.view.w, home.w);
    assert.equal(battle.view.scale, home.scale);
    assert.ok(z.k >= 1 - EPS && z.k <= CFG.zoom + EPS);
    // The framed region, (0 - o) / k to (W - o) / k, inside the home frame.
    assert.ok(-z.ox / z.k >= -EPS && (W - z.ox) / z.k <= W + EPS, `t=${t}: no blank edge`);
    assert.ok(-z.oy / z.k >= -EPS && (H - z.oy) / z.k <= H + EPS);
  }
  assert.ok(Math.max(...seen) > CFG.zoom - EPS, 'it reaches the zoom');
  // The spawn's place is what it closes in on: Team I's middle near the
  // centre of what it frames.
  const s = TIMELINE.spawns[0];
  battle.phaseTime = s.arrive;
  battle.syncView();
  const f = battle.p1;
  const at = f.spawnPlacement(battle.stage);
  const [sx, sy] = zoomPoint(battle.screenZoom, ...battle.toScreen(at.x, at.y - f.body.height / 2));
  assert.ok(sx > 0 && sx < W && sy > 0 && sy < H, 'Team I\'s spawn in the frame');
  // A shake only nudges the zoom, never the lens, never past the frame.
  battle.fx.shake = { amp: 5, time: 0, life: 0.3 };
  battle.fx.clock = 0.37;
  battle.syncView();
  assert.equal(battle.view.x, home.x);
  const n = nudgedZoom({ k: 1, ox: 0, oy: 0 }, W, H, 4, -4);
  assert.deepEqual(n, { k: 1, ox: 0, oy: 0 }, 'at the home view nothing beyond its edges shows');
  // The render: every absolute transform the stage, the fighters and the
  // effects set is composed with the zoom, and the canvas is given back.
  battle.fx.shake = { amp: 0, time: 0, life: 0 };
  battle.p1.awaitingEntrance = false;
  battle.phaseTime = s.arrive + 0.6;
  battle.syncView();
  const zoom = battle.screenZoom;
  const ctx = battle.ctx;
  ctx.calls.length = 0;
  battle.render();
  const sets = ctx.calls.filter((c) => c[0] === 'setTransform');
  assert.ok(sets.length > 5);
  const identity = sets.filter(([, a, b, c, d]) => a === zoom.k && d === zoom.k && !b && !c);
  assert.ok(identity.some(([, , , , , e, f]) => Math.abs(e - zoom.ox) < EPS && Math.abs(f - zoom.oy) < EPS), 'screen space is the zoomed identity');
  assert.equal(Object.hasOwn(ctx, 'setTransform'), false, 'given back');
  // Before the cover hides the versus screen nothing of the stage is drawn.
  battle.phaseTime = 1;
  ctx.calls.length = 0;
  battle.render();
  assert.equal(ctx.calls.length, 0);
});

test('the screen zoom: framed, held inside the frame, its focus and points; installed and given back exactly, either setTransform form', () => {
  const z = framedZoom(800, 400, 2, 100, 100);
  assert.deepEqual(z, { k: 2, ox: 0, oy: 0 }, 'held at the top left corner');
  const mid = framedZoom(800, 400, 2, 400, 200);
  assert.deepEqual(mid, { k: 2, ox: -400, oy: -200 });
  assert.deepEqual(zoomFocus(mid), [400, 200]);
  assert.equal(zoomFocus(IDENTITY_ZOOM), null);
  assert.deepEqual(zoomPoint(mid, 400, 200), [400, 200], 'the focus stays put');
  const own = { set: [], setTransform(...m) { this.set.push(m); } };
  const original = own.setTransform;
  installScreenZoom(own, mid);
  own.setTransform({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
  own.resetTransform();
  assert.deepEqual(own.set.slice(-2), [[2, 0, 0, 2, -380, -160], [2, 0, 0, 2, -400, -200]]);
  removeScreenZoom(own);
  assert.equal(own.setTransform, original, 'its own method back');
  assert.equal(Object.hasOwn(own, 'resetTransform'), false);
  let drew = false;
  withScreenZoom(own, IDENTITY_ZOOM, () => { drew = true; });
  assert.ok(drew);
  assert.equal(own.setTransform, original);
});

test('the home view is the match start\'s framing on every battle stage: the follow camera\'s own target once both stand on their spawns', () => {
  for (const map of MAPS) {
    const { battle } = entranceBattle({ mapId: map.id });
    layOut(battle, 1280, 720);
    const home = { x: battle.camera.x, y: battle.camera.y };
    battle.camera.snap(battle.p1, battle.p2);
    assert.ok(Math.abs(battle.camera.x - home.x) < 1 && Math.abs(battle.camera.y - home.y) < 1, `${map.id}: within a pixel`);
    assert.ok(Math.abs(home.x + battle.camera.w / 2 - battle.stage.centerX) < 1 || battle.camera.w >= map.cameraBounds.right - map.cameraBounds.left,
      `${map.id}: centred on the stage`);
  }
});

test('entranceFraming: the centre, then each spawn eased in and out, in turn', () => {
  const [one, two] = TIMELINE.spawns;
  assert.equal(entranceFraming(TIMELINE, 4), null);
  assert.equal(entranceFraming(TIMELINE, one.zoomStart).amount, 0);
  assert.deepEqual(entranceFraming(TIMELINE, one.arrive), { slot: 'p1', amount: 1 });
  assert.deepEqual(entranceFraming(TIMELINE, one.appear), { slot: 'p1', amount: 1 });
  assert.ok(Math.abs(entranceFraming(TIMELINE, (one.backStart + one.home) / 2).amount - 0.5) < 1e-6);
  assert.equal(entranceFraming(TIMELINE, one.home), null);
  assert.equal(entranceFraming(TIMELINE, two.arrive).slot, 'p2');
  assert.equal(entranceFraming(TIMELINE, TIMELINE.total - 0.01), null);
});

// ---- The spawn's sound, and the closed list -------------------------------------------------------

test('the spawn cue: once per entrance spawn and once per Void respawn, heard as sfx.spawn; Practice Ground\'s respawns too, as its ejections are', () => {
  const { battle } = entranceBattle();
  const engine = recorder();
  const sound = new BattleAudio(engine);
  sound.attach(battle, { stage: 'desert', mode: 'quick-battle' });
  stepUntil(battle, () => battle.phase === PHASES.fight);
  assert.deepEqual(callsNamed(engine, 'fighterSpawned').map((c) => c[1].slot), ['p1', 'p2']);
  // A fall, then its respawn: the cue once, as it is back.
  const f = battle.p2;
  const v = battle.stage.void;
  Object.assign(f.body, { x: v.right + 200, prevX: v.right + 150 });
  battle.update(DT);
  assert.equal(f.lostToVoid, true);
  stepUntil(battle, () => !f.lostToVoid);
  for (let i = 0; i < 30; i++) battle.update(DT);
  assert.deepEqual(callsNamed(engine, 'fighterSpawned').map((c) => c[1].slot), ['p1', 'p2', 'p2']);
  sound.detach();
  // Practice Ground.
  const session = new PracticeSession({
    canvas: { getContext: () => recordingContext() }, map: PRACTICE_MAP, def: DEF, sprites: fakeSpritesOf(DEF), input: stubInput(),
  });
  const practice = recorder();
  const ears = new BattleAudio(practice);
  ears.attach(session, { mode: 'practice' });
  const p = session.player;
  Object.assign(p.body, { x: session.stage.void.right + 200, prevX: session.stage.void.right + 150 });
  session.update(DT);
  for (let i = 0; i < Math.ceil(CONFIG.battle.respawnSeconds / DT) + 5; i++) session.update(DT);
  assert.equal(callsNamed(practice, 'fighterEjected').length, 1);
  assert.equal(callsNamed(practice, 'fighterSpawned').length, 1);
  // The engine plays the spawn's effect for it, the same for every fighter.
  const page = fakeAudio();
  const real = new AudioManager({ win: page.win, doc: page.doc, AudioContextClass: page.AudioContext, timers: page.timers });
  real.trace = [];
  page.win.press();
  assert.equal(real.fighterSpawned({ slot: 'p1' }), true);
  assert.equal(real.fighterSpawned({ slot: 'p2' }, { pan: 0.4 }), true);
  assert.deepEqual(real.trace.filter((e) => e.type === 'sfx').map((e) => e.id), [SFX.spawn, SFX.spawn]);
});

test('the entrance heard: silence for the music until the reveal, each entrance sound once, then the stage\'s theme; a restart into the entrance does the same', () => {
  const { battle } = entranceBattle({ mapId: 'city' });
  const engine = recorder();
  const sound = new BattleAudio(engine);
  sound.attach(battle, { stage: 'city', mode: 'local' });
  assert.equal(callsNamed(engine, 'battleStarted').length, 0, 'no music under the versus screen');
  assert.equal(callsNamed(engine, 'entranceStarted').length, 1);
  stepUntil(battle, () => battle.phase === PHASES.intro);
  const order = engine.calls.map((c) => c[0]).filter((n) => /^entrance|battleStarted|fighterSpawned/.test(n));
  assert.deepEqual(order, ['entranceStarted', 'entranceBolt', 'entranceCover', 'entranceReveal', 'battleStarted', 'fighterSpawned', 'fighterSpawned']);
  assert.deepEqual(callsNamed(engine, 'entranceReveal')[0].slice(1), ['city'], 'the reveal knows the stage\'s key');
  assert.deepEqual(callsNamed(engine, 'battleStarted')[0].slice(1), ['city', 'local', { localSlot: 'p1' }]);
  battle.restart();
  assert.equal(callsNamed(engine, 'restarted').length, 0, 'not the old restart: the entrance\'s');
  assert.equal(callsNamed(engine, 'entranceStarted').length, 2);
  stepUntil(battle, () => battle.phase === PHASES.intro);
  assert.equal(callsNamed(engine, 'battleStarted').length, 2);
  assert.equal(callsNamed(engine, 'entranceBolt').length, 2);
  sound.detach();
  // The engine: each entrance event is its own effect; the reveal resolves
  // onto the stage's tonic, between A3 and A4.
  const page = fakeAudio();
  const real = new AudioManager({ win: page.win, doc: page.doc, AudioContextClass: page.AudioContext, timers: page.timers });
  real.trace = [];
  page.win.press();
  real.entranceStarted();
  real.entranceBolt();
  real.entranceCover();
  real.entranceReveal('desert');
  assert.deepEqual(real.trace.filter((e) => e.type === 'sfx').map((e) => e.id), [SFX.boltStrike, SFX.boltCover, SFX.entranceReveal]);
  for (const stage of ['desert', 'city', 'asperitas', 'adamaris', 'jokull']) {
    const f = revealRoot(stage);
    assert.ok(f >= 220 && f < 440, `${stage}: ${f}`);
  }
  assert.equal(revealRoot('practice'), null);
});

test('the closed list: exactly the four the owner added, sixteen kinds, 37 sounds, and still nothing else', () => {
  for (const [id, kind] of [[SFX.spawn, '13'], [SFX.boltStrike, '14'], [SFX.boltCover, '15'], [SFX.entranceReveal, '16']]) {
    assert.equal(SOUND_KINDS[id], kind, id);
    assert.equal(isAllowedSound(id), true);
    assert.equal(typeof SFX_RECIPES[id], 'function', `${id} is synthesized`);
    assert.doesNotThrow(() => new SoundRegistry().register(id, {}));
  }
  assert.equal(ALLOWED_SOUNDS.length, 25 + 1 + 11);
  assert.equal(new Set(Object.values(SOUND_KINDS)).size, 17, 'twelve kinds and 4b, then 13 to 16');
  for (const name of ['sfx.bolt', 'sfx.versus', 'sfx.respawn', 'sfx.entrance', 'sfx.menu', 'sfx.jump']) {
    assert.equal(isAllowedSound(name), false, name);
    assert.throws(() => new SoundRegistry().register(name, {}), /not one of Alva's sounds/, name);
  }
});

test('each new recipe is built from the shared building blocks on the effects bus, under the ejections and ends', () => {
  const page = fakeAudio();
  const engine = new AudioManager({ win: page.win, doc: page.doc, AudioContextClass: page.AudioContext, timers: page.timers });
  page.win.press();
  for (const id of [SFX.spawn, SFX.boltStrike, SFX.boltCover, SFX.entranceReveal]) {
    const end = SFX_RECIPES[id](page.ctx, engine.sfx, 1, { pitch: 1, level: 1, pan: 0, direction: 1, reverb: engine.sfxReverbIn, root: 293.66 }, engine.bank);
    assert.ok(Number.isFinite(end) && end > 1.2 && end < 4, `${id} ends (${end})`);
  }
  // The effects slider covers them like every effect: none is made at 0.
  engine.levels.sfx = 0;
  assert.equal(engine.entranceBolt(), false);
  assert.equal(engine.fighterSpawned({ slot: 'p1' }), false);
});

// ---- The versus screen's art --------------------------------------------------------------------

test('the bolt: its shape drawn from the seed (the same on both browsers, another each match), 2 to 4 forks, top to bottom, a flicker only past its contact', () => {
  const a = boltShape(1234);
  assert.deepEqual(boltShape(1234), a, 'the same seed, the same bolt');
  assert.notDeepEqual(boltShape(1235), a, 'another seed, another');
  const counts = new Set();
  for (let seed = 1; seed < 200; seed++) {
    const shape = boltShape(seed);
    assert.ok(shape.forks.length >= 2 && shape.forks.length <= 4, `${seed}: ${shape.forks.length} forks`);
    counts.add(shape.forks.length);
    const { main } = boltPoints(shape, 1280, 720);
    assert.ok(main[1] < 0 && main.at(-1) > 720, 'from the top edge to the bottom edge');
    const xs = main.filter((_, i) => i % 2 === 0);
    assert.ok(xs.every((x) => Math.abs(x - 640) < 0.12 * 1280), 'down the middle');
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4]);
  assert.deepEqual(boltPoints(a, 800, 400, 0, 1), boltPoints(a, 800, 400, 0, 1));
  assert.notDeepEqual(boltPoints(a, 800, 400, 3, 1).main, boltPoints(a, 800, 400, 0, 1).main, 're-rolled');
});

// Fighters of different art sizes, an ensemble among them, on their real art.
const ART = Object.fromEntries(['0001', '0002', '0006', '0011'].map((id) => [id, realArt(getCharacter(id)).sprites]));

test('the fighters on the versus screen: every fighter about half the screen\'s height, whole pixels, in its half; an ensemble with all its members', () => {
  assert.ok(ART['0006'].members, 'an ensemble among them');
  for (const [id, sprites] of Object.entries(ART)) {
    const def = { id };
    const box = idleBounds(sprites);
    assert.ok(box, def.id);
    for (const [w, h] of [[844 * 2, 390 * 2], [1440, 900], [1280, 720]]) {
      const n = fighterScale(box, w, h);
      assert.equal(n, Math.round(n));
      const tall = (box.bottom - box.top) * n;
      assert.ok(tall / h > 0.38 && tall / h <= ENTRANCE_LOOK.fighterHeight + 0.08 + EPS, `${def.id} at ${w}x${h}: ${(tall / h).toFixed(2)}`);
      assert.ok((box.right - box.left) * n <= ENTRANCE_LOOK.fighterWidth * w / 2 + EPS, `${def.id}: inside its half`);
    }
  }
});

test('the versus screen drawn at every step, laid out again on a resize, cleared once the cover has cleared', () => {
  const canvas = { width: 0, height: 0, rect: { width: 844, height: 390 } };
  const ctx = recordingContext();
  canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => canvas.rect;
  const art = new MatchEntranceArt(canvas);
  art.begin({
    timeline: TIMELINE, seed: 99,
    sides: { p1: { sprites: ART['0001'], side: 'Team I', name: '#0001' }, p2: { sprites: ART['0006'], side: 'Team II', name: '#0006' } },
  });
  assert.equal(canvas.width, 844);
  for (let t = 0; t < TIMELINE.revealEnd + 0.2; t += 0.02) {
    ctx.calls.length = 0;
    const drew = art.draw(t);
    assert.equal(drew, t < TIMELINE.revealEnd);
    const images = ctx.calls.filter((c) => c[0] === 'drawImage').length;
    if (t >= TIMELINE.slides.p2.end && t < TIMELINE.cover) assert.ok(images >= 1 + ART['0006'].members.length, `both fighters, every member, at ${t}`);
    if (t >= TIMELINE.coverFull) assert.equal(images, 0, 'the versus screen gone under the cover');
    if (t < TIMELINE.slides.p1.start) assert.equal(images, 0, 'no fighter before its slide');
  }
  canvas.rect = { width: 1440, height: 900 };
  assert.equal(art.layout(), true, 'laid out again');
  assert.equal(art.layout(), false);
  assert.equal(canvas.height, 900);
  assert.equal(art.draw(2), true);
  // With reduced motion the steps are the same; nothing shakes.
  art.begin({ timeline: TIMELINE, seed: 99, sides: {}, reducedMotion: true });
  assert.deepEqual(art.shakeAt(TIMELINE.contact + 0.01), [0, 0]);
  assert.deepEqual(art.shakeAt(TIMELINE.cover + 0.01), [0, 0]);
  art.reducedMotion = false;
  assert.notDeepEqual(art.shakeAt(TIMELINE.contact + 0.01), [0, 0]);
  assert.equal(art.showing(null), false);
});
