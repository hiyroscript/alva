// Run with node --test tests/platform-stage.test.mjs (no dependencies).
// The platform-fighter stage: finite main floors with open ledges and no side
// walls, the four separate stage areas (main stage, open air, camera bounds,
// Void), the Void as the kill boundary in Quick Battle and a respawn in
// Practice Ground (see practice-ground.test.mjs), the wider camera and the
// Void's art. Real physics, Fighter, Battle and themes; the canvas is a
// recording stand-in, so paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMap } from '../js/data/maps.js';
import { PRACTICE_MAP } from '../js/data/practice-map.js';
import { StageCollision, createBody, stepBody, separate, resolveSolidOverlap } from '../js/game/physics.js';
import { CONFIG } from '../js/config.js';
import { def, DT, STAGE, SIM_CTX, fakeSprites, makeFighter, stageMap } from './fighter-harness.mjs';

// Stage themes build Path2D art, which Node lacks: a do-nothing stand-in.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../js/game/battle.js');
const { computeWorldScale } = await import('../js/game/arena.js');
const { createTheme } = await import('../js/stages/index.js');

const ALL_MAPS = [...MAPS, PRACTICE_MAP];
const HALF = def.collider.width / 2;
const G = STAGE.groundY; // the harness stage's main floor: x 0 - 2000, top 800

// A Quick Battle on `mapId` with scripted Player 1 input and a still CPU.
function realBattle(mapId = 'desert') {
  const sprites = fakeSprites();
  const script = { held: {} };
  const input = { flush() {}, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.p2.controller = null;
  return { battle, script };
}

// ---- Stage data: four separate areas ---------------------------------------------

test('every stage keeps its main stage, camera bounds and Void apart, the Void far past the ledges', () => {
  for (const m of ALL_MAPS) {
    const { left, right, top, bottom } = m.mainStage;
    const v = m.voidBounds;
    const cb = m.cameraBounds;
    assert.equal(m.bounds, undefined, `${m.id}: no arena wall bounds`);
    assert.ok(right > left && bottom > top, m.id);
    // Real off-stage space on every side of the main stage.
    assert.ok(v.left <= left - 600 && v.right >= right + 600, `${m.id}: the Void is far past both ledges`);
    assert.ok(v.bottom >= top + 600, `${m.id}: and well below the stage`);
    assert.ok(v.top <= top - 900, `${m.id}: and high above it`);
    // The camera can reach just past the Void's edge, never the other way round.
    assert.ok(cb.left < v.left && cb.right > v.right && cb.top < v.top && cb.bottom > v.bottom, `${m.id}: camera bounds`);
    // Spawns, platforms and solids all on the main stage.
    for (const s of m.spawnPoints) assert.ok(s.x - HALF > left && s.x + HALF < right, `${m.id}: spawn ${s.x}`);
    for (const p of [...m.platforms, ...m.solids]) assert.ok(p.x >= left && p.x + p.w <= right, `${m.id}: ${p.id}`);
  }
});

test('the stages are compact platform-fighter stages', () => {
  const width = (m) => m.mainStage.right - m.mainStage.left;
  for (const m of MAPS) assert.ok(width(m) >= 1300 && width(m) <= 1600, `${m.id}: ${width(m)}`);
  assert.ok(width(PRACTICE_MAP) >= 1200 && width(PRACTICE_MAP) <= 1500);
  const city = getMap('city');
  assert.equal(city.platforms.length, 7, 'City keeps all seven one-way platforms');
  assert.deepEqual(city.platforms.map((p) => p.y), [876, 752, 830, 708, 840, 730, 864], 'at their heights');
  assert.deepEqual(getMap('desert').solids.map((s) => s.id), ['rock-west', 'rock-east'], 'Desert keeps its rocks');
});

// ---- Physics: finite floor, no walls ----------------------------------------------------

test('surfaceBelow reports the main floor only over its footprint, and nothing at all past it', () => {
  assert.equal(STAGE.surfaceBelow(1000, 1034, G).ref.id, '__floor');
  assert.equal(STAGE.surfaceBelow(-20, 14, G).ref.id, '__floor', 'any overlap counts');
  for (const x of [-100, -34, 2000, 2400]) {
    assert.deepEqual(STAGE.surfaceBelow(x, x + 34, G), { y: Infinity, ref: null }, `open air at ${x}`);
    assert.equal(STAGE.supportsAt(x, x + 34, G), false);
  }
  // A platform still counts over open air if one is there.
  const s = new StageCollision(stageMap({ platforms: [{ id: 'out', x: 2100, y: 700, w: 100, h: 16 }] }));
  assert.equal(s.surfaceBelow(2120, 2154, 600).ref.id, 'out');
});

test('a fighter runs straight off either ledge: no wall stops it, the floor stops holding it, and it falls', () => {
  for (const [dir, x, edge] of [['right', 1900, 2000], ['left', 100, 0]]) {
    const { fighter, step } = makeFighter({ x, facing: dir === 'right' ? 1 : -1 });
    const sign = dir === 'right' ? 1 : -1;
    let leftGround = null;
    for (let i = 0; i < 90; i++) {
      step({ [dir]: true });
      const b = fighter.body;
      assert.equal(b.wall, 0, 'never against a wall');
      if (leftGround === null && !b.grounded) {
        leftGround = b.x;
        // Supported for exactly as long as its collider overlaps the floor.
        assert.ok(sign > 0 ? b.x - b.halfW >= edge : b.x + b.halfW <= edge, `left the floor at ${b.x}`);
      }
    }
    const b = fighter.body;
    assert.ok(leftGround !== null, 'it left the floor');
    assert.ok(sign * (b.x - edge) > 200, `carried on well past the ${dir} ledge (x ${b.x.toFixed(0)})`);
    assert.ok(Math.abs(b.vx) > 300, 'at full speed: nothing zeroed it');
    assert.ok(b.y > G + 400, 'falling below the stage');
    assert.equal(fighter.state, 'fall');
  }
});

test('a fighter can be knocked out past a ledge, and below the stage\'s top its body is the stage\'s own cliff', () => {
  // Knocked off sideways at speed, from the edge.
  const body = createBody({ x: 1990, y: G, width: 34, height: 80 });
  body.grounded = true;
  body.vx = 600;
  for (let i = 0; i < 60; i++) stepBody(body, DT, STAGE, CONFIG.sim.gravity);
  assert.ok(body.x > 2300 && !body.grounded && body.y > G);
  // Drifting back under the stage's top, it meets the cliff face (a solid's
  // side), not an invisible wall at the old bounds.
  const back = createBody({ x: 2040, y: G + 200, width: 34, height: 80 });
  back.vx = -400;
  let met = false;
  for (let i = 0; i < 20; i++) {
    stepBody(back, DT, STAGE, 0);
    met ||= back.wall === -1;
  }
  assert.ok(met, 'met the cliff face');
  assert.equal(back.x, 2000 + back.halfW, 'and stays against it');
  // Above the top, the same drift lands it back on the stage.
  const over = createBody({ x: 2040, y: G - 40, width: 34, height: 80 });
  over.vx = -300;
  for (let i = 0; i < 30 && !over.grounded; i++) stepBody(over, DT, STAGE, CONFIG.sim.gravity);
  assert.equal(over.grounded, true);
  assert.equal(over.ground.id, '__floor');
});

test('pushboxes split evenly with no walls: a fighter at the ledge can be shoved off it', () => {
  const a = createBody({ x: 1960, y: G, width: 34, height: 80 });
  const b = createBody({ x: 1985, y: G, width: 34, height: 80 });
  a.grounded = b.grounded = true;
  separate(a, b, 18, 18, STAGE);
  assert.equal(b.x - a.x, 36, 'fully apart');
  assert.equal(a.x, 1960 - 5.5);
  assert.equal(b.x, 1985 + 5.5, 'the outer fighter moves its full half, toward the ledge');
  resolveSolidOverlap(b, STAGE);
  assert.equal(b.x, 1990.5, 'standing on the floor is no overlap with it');
  // Past the ledge entirely.
  const c = createBody({ x: 1999, y: G, width: 34, height: 80 });
  const d = createBody({ x: 2010, y: G, width: 34, height: 80 });
  c.grounded = d.grounded = true;
  separate(c, d, 18, 18, STAGE);
  assert.ok(d.x - d.halfW > 2000, `pushed out over the drop (x ${d.x})`);
});

test('the Void is a fixed line tested at the body\'s centre', () => {
  const v = STAGE.void;
  const at = (x, y) => STAGE.inVoid({ x, y, height: 80 });
  assert.equal(at(1000, G), false);
  assert.equal(at(-800, G), false, 'open air past the ledge is not the Void');
  assert.equal(at(v.left + 0.5, G), false);
  assert.equal(at(v.left - 0.5, G), true);
  assert.equal(at(v.right + 0.5, G), true);
  assert.equal(at(1000, v.bottom + 40), false, 'centre exactly on the line');
  assert.equal(at(1000, v.bottom + 40.5), true);
  assert.equal(at(1000, v.top + 39.5), true);
});

// ---- Quick Battle: the Void defeats -----------------------------------------------------

test('Quick Battle: falling into the Void defeats that fighter at once, then the KO beat, then the result', () => {
  const { battle, script } = realBattle('city');
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  const timeLeft = battle.timeLeft;
  // Player 1 runs off the roof's west edge (under the one-way platforms).
  script.held = { left: true };
  let steps = 0;
  while (!p1.lostToVoid && steps++ < 60 * 6) battle.update(DT);
  assert.equal(p1.lostToVoid, true);
  assert.ok(steps < 60 * 4, 'long before the timer');
  assert.ok(battle.timeLeft > timeLeft - 4);
  assert.equal(battle.phase, 'ko');
  assert.equal(p1.combat.health, 0);
  assert.deepEqual(battle.result, { outcome: 'p2', reason: 'void' });
  // Out of play: frozen, and neither framed nor fought.
  const frozen = { x: p1.body.x, y: p1.body.y };
  assert.equal(battle.secondary, p2);
  assert.deepEqual(battle.inPlay, [p2]);
  for (let i = 0; i < 30; i++) battle.update(DT);
  assert.deepEqual({ x: p1.body.x, y: p1.body.y }, frozen);
  while (battle.phase === 'ko') battle.update(DT);
  assert.equal(battle.phase, 'result');
  assert.ok(Math.abs(battle.phaseTime) < 1e-9);
  // A rematch brings both back.
  battle.restart();
  assert.equal(p1.lostToVoid, false);
  assert.equal(p1.combat.health, p1.combat.maxHealth);
  assert.deepEqual(battle.inPlay, [p1, p2]);
  assert.equal(battle.result.reason, 'time');
});

test('Quick Battle: the CPU in the Void loses; a technique holding it lets go, and whatever aimed at it goes', () => {
  const { battle, script } = realBattle('desert');
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  // Catch the CPU in the Sphere Rush.
  p2.body.x = p1.body.x + 120;
  script.held = { charge: true };
  for (let i = 0; i < 10; i++) battle.update(DT);
  script.held = { charge: true, action2: true, action2Pressed: true };
  battle.update(DT);
  script.held = {};
  const rush = p1.technique;
  for (let i = 0; i < 120 && !rush.hitConfirmed; i++) battle.update(DT);
  assert.ok(p2.combat.immobilized);
  p1.summons.push({ id: 'ba1Clone', target: p2 });
  Object.assign(p2.body, { x: battle.stage.void.right + 50, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  assert.equal(p1.technique, null);
  assert.equal(rush.endReason, 'released');
  assert.equal(p2.combat.immobilized, false);
  assert.deepEqual(p1.summons, []);
  assert.ok(battle.clones.every((c) => c.target !== p2));
  assert.equal(battle.phase, 'ko');
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'void' });
  assert.equal(battle.secondary, null, 'the camera frames Player 1 alone');
});

test('Quick Battle: after time runs out, a fighter the Void takes still loses; both taken is a draw', () => {
  const { battle } = realBattle('city');
  battle.setPhase('timeup');
  Object.assign(battle.p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(battle.phase, 'timeup', 'no KO beat once time is up');
  assert.deepEqual(battle.result, { outcome: 'p1', reason: 'void' });
  Object.assign(battle.p1.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.deepEqual(battle.result, { outcome: 'draw', reason: 'void' });
});

test('the training CPU never walks off a ledge on its own', () => {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.setPhase('fight');
  const { right } = battle.map.mainStage;
  // Player 1 hovers out past the east ledge; the CPU follows it to the edge.
  Object.assign(battle.p1.body, { x: right + 300, y: 700, gravityScale: 0, grounded: false, ground: null });
  battle.p2.body.x = right - 60;
  for (let i = 0; i < 60 * 5; i++) {
    battle.p1.body.vy = 0;
    battle.update(DT);
    assert.equal(battle.p2.body.grounded, true, `still on the mesa at step ${i}`);
  }
  assert.ok(battle.p2.body.x > right - 60, 'it came right up to the edge');
  assert.equal(battle.p2.lostToVoid, false);
});

// ---- Camera -------------------------------------------------------------------------

test('the world scale is a platform-fighter view: fighters about a tenth of the view, the whole main stage across it', () => {
  const sprites = { refArtHeight: 52, worldPerArt: def.visual.height / 52 };
  const r = CONFIG.render;
  for (const m of ALL_MAPS) {
    const stageW = m.mainStage.right - m.mainStage.left;
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [1688, 780], [2048, 1536], [800, 600]]) {
      const scale = computeWorldScale(w, h, sprites, m);
      const ratio = (def.visual.height * scale) / h;
      assert.ok(ratio >= r.fighterScreenRatioMin - 1e-9 && ratio <= r.fighterScreenRatioMax + 1e-9, `${m.id} ${w}x${h}: ${ratio}`);
      const viewW = w / scale;
      // Wide screens show the whole stage and air past both ledges; narrow
      // ones zoom out for it as far as readability allows.
      if (w / h >= 16 / 9 - 0.01) assert.ok(viewW >= stageW + 2 * r.stageFrameMargin - 1, `${m.id} ${w}x${h}: ${viewW}`);
      else assert.ok(viewW >= stageW || Math.abs(ratio - r.fighterScreenRatioMin) < 1e-6, `${m.id} ${w}x${h}`);
    }
  }
  // At 16:9 fighters stand at about a tenth of the height.
  const ratio = (def.visual.height * computeWorldScale(1280, 720, sprites, getMap('desert'))) / 720;
  assert.ok(ratio >= 0.095 && ratio <= 0.105, `${ratio}`);
});

test('the camera leans toward the stage while framing, never past a framed fighter\'s margin', () => {
  const { battle } = realBattle('desert');
  const cam = battle.camera;
  cam.setView(1560, 880, 1);
  const { left, right } = battle.map.mainStage;
  const centre = (left + right) / 2;
  const fighter = (x, y = 860) => ({ renderX: x, renderY: y, lastGroundY: y, body: { vx: 0, y, grounded: true, height: 80 } });
  // Alone at the east ledge: the view leans back over the stage.
  cam.computeTarget(fighter(right), null);
  const cx = cam.tx + cam.w / 2;
  assert.ok(cx < right && cx > centre, `centre ${cx}`);
  assert.ok(right - cam.tx > cam.w * 0.2, 'the fighter stays inside the margin');
  // Far out near the Void, the fighter still sits inside the margin.
  const far = battle.stage.void.right - 20;
  cam.computeTarget(fighter(far), null);
  assert.ok(Math.abs(far - (cam.tx + cam.w * 0.8)) < 1e-6, 'held right at the margin');
  // Camera bounds are not the stage: the view may go out over the open air.
  cam.snap(fighter(far), null);
  assert.ok(cam.x + cam.w > right + 600);
  assert.ok(cam.x + cam.w <= battle.map.cameraBounds.right + 1e-6);
});

// ---- Void art -------------------------------------------------------------------------

// A context that records every path point, for comparing edges between
// frames.
function recordingContext() {
  const points = [];
  const ctx = new Proxy({ points }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => points.push([k, x, y]);
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}

function drawVoidAt(theme, view, time) {
  const ctx = recordingContext();
  theme.time = time;
  theme.drawVoid(ctx, { ...view, ctx });
  return ctx.points;
}

test('the Void is drawn only near its edge, black and wavering, and holds still with reduced motion', () => {
  const m = getMap('desert');
  const v = m.voidBounds;
  const base = { scale: 1, w: 1560, h: 880, pxW: 1560, pxH: 880 };
  const centre = { ...base, x: 1800 - 780, y: 860 - 616 };
  const nearBottom = { ...base, x: 1800 - 780, y: v.bottom - 700 };
  for (const reducedMotion of [false, true]) {
    const theme = createTheme(m, { reducedMotion });
    assert.deepEqual(drawVoidAt(theme, centre, 0), [], 'nothing boxes the stage in during neutral play');
    const a = drawVoidAt(theme, nearBottom, 0);
    const b = drawVoidAt(theme, nearBottom, 1.3);
    assert.ok(a.length > 20, 'a traced edge');
    // Its solid edge wavers around the fixed line, never far from it.
    const edge = a.filter(([k, , y]) => k === 'lineTo' && y > v.bottom - 40 && y < v.bottom + 40);
    assert.ok(edge.length > 10);
    const ys = edge.map(([, , y]) => y);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 4, 'wavy, not ruled');
    if (reducedMotion) assert.deepEqual(a, b, 'reduced motion: the edge holds still');
    else assert.notDeepEqual(a, b, 'the edge moves with time');
  }
});

test('the Void is drawn over the fighters and everything else on the stage', () => {
  const { battle } = realBattle('desert');
  const order = [];
  battle.theme = {
    prepare() {}, update() {}, shadow: { alpha: 0.3, skew: 0, stretch: 1 },
    drawBackground: () => order.push('background'),
    drawTerrain: () => order.push('terrain'),
    drawForeground: () => order.push('foreground'),
    drawVoid: () => order.push('void'),
  };
  battle.ctx = recordingContext();
  Object.assign(battle.view, { ctx: battle.ctx, pxW: 1280, pxH: 720, scale: 1, x: 1000, y: 300, w: 1280, h: 720 });
  battle.pxPerArt = 2;
  battle.render();
  assert.deepEqual(order, ['background', 'terrain', 'foreground', 'void']);
});
