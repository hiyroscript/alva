// Run with node --test tests/systems/spawn-burst.test.mjs (no dependencies).
// The respawn burst (HitEffects.addSpawn, drawSpawns; Arena.announceSpawn):
// a fighter coming back from the Void is announced by its own elimination
// burst played backwards, before it is back: started its life before the
// wait ends, where it will stand, popping as it appears. None for a fighter
// already on the stage (a match's start, a restart, Practice Ground's
// arrivals); in every mode and Practice Ground's respawns; cleared by a
// restart during the wait; in the fighter's own palette and size; the
// exact time-reverse of the elimination (the same strokes at age t as the
// elimination at age life - t); the same reduced-motion handling; drawn
// over the fighters; never counted as an elimination; and paint only, the
// same fight stepping identically with and without it. Real Battle,
// PracticeSession and physics; the canvas is a recording stand-in, so the
// look still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { CHARACTERS, getCharacter } from '../../js/data/characters.js';
import { CONFIG } from '../../js/config.js';
import { HIT_FX, HitEffects, eliminationPalette, NEUTRAL_ELIMINATION_PALETTE } from '../../js/game/rendering/hit-fx.js';
import { def, DT, fakeSpritesOf } from '../helpers/fighter-harness.mjs';

// Stage themes build Path2D art, which Node lacks: a do-nothing stand-in.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');
const { PracticeSession } = await import('../../js/game/practice.js');

const RESPAWN_STEPS = Math.round(CONFIG.battle.respawnSeconds / DT);
const { life } = HIT_FX.elimination;
const canvas = { getContext: () => ({}) };
const input = () => ({ flush() {}, sample: () => ({}) });
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

function battleOf({ p1Def = def, p2Def = def, mode, seed = 1 } = {}) {
  return new Battle({
    canvas, map: getMap('desert'), mode, p1Def, p2Def,
    p1Sprites: fakeSpritesOf(p1Def), p2Sprites: fakeSpritesOf(p2Def), input: input(), seed,
  });
}

// Carries `f` past the Void in force; its next step takes it.
const intoVoid = (arena, f) => {
  Object.assign(f.body, { y: arena.stage.void.bottom + 100, vy: 0, grounded: false, ground: null });
};

// A burst of fighter `f` where it stands now: at its centre, its size, its
// colours.
function assertBurstOf(burst, f, why) {
  assert.equal(burst.slot, f.slot, `${why}: its slot`);
  near(burst.x, f.body.x, `${why}: x`);
  near(burst.y, f.body.y - f.body.height / 2, `${why}: y, its centre`);
  assert.equal(burst.size, f.def.visual?.height ?? f.body.height, `${why}: its size`);
  assert.deepEqual(burst.palette, eliminationPalette(f.def), `${why}: its own palette`);
  assert.equal(burst.life, life, `${why}: the elimination's life`);
}

// A context recording every drawing call with the state it was made in.
function recordingContext() {
  const calls = [];
  const state = { globalAlpha: 1, strokeStyle: null, fillStyle: null, lineWidth: 1, lineCap: 'butt' };
  const stack = [];
  return new Proxy(state, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'save') return () => stack.push({ ...state });
      if (k === 'restore') return () => Object.assign(state, stack.pop());
      return (...args) => calls.push([k, ...args.map((a) => (typeof a === 'number' ? Math.round(a * 1e6) / 1e6 : a)), {
        alpha: Math.round(state.globalAlpha * 1e6) / 1e6, stroke: state.strokeStyle, fill: state.fillStyle,
        width: Math.round(state.lineWidth * 1e6) / 1e6,
      }]);
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const draw = (fx, kind) => {
  const ctx = recordingContext();
  fx[kind](ctx, (x, y) => [x * 2 + 10, y * 2 + 20], 2, 2);
  return ctx.calls;
};

// ---- When and where it is added --------------------------------------------------

// Steps the arena one fixed step and ages its effects by the same time, as a
// rendered frame at the simulation's own speed would.
const step = (arena) => {
  arena.update(DT);
  arena.fx.update(DT);
};

// Takes `f` by the Void, then steps through its wait, recording the step
// its burst was added and the step it came back.
function throughRespawn(arena, f) {
  intoVoid(arena, f);
  step(arena);
  assert.equal(f.lostToVoid, true, 'taken');
  const placed = f.spawnPlacement(arena.stage);
  let added = null;
  let back = null;
  let gone = null;
  let burst = null;
  let count = 0;
  for (let i = 1; i <= RESPAWN_STEPS + 6 && (back === null || gone === null); i++) {
    const before = new Set(arena.fx.spawns);
    step(arena);
    const fresh = arena.fx.spawns.filter((b) => !before.has(b) && b.slot === f.slot);
    count += fresh.length;
    if (added === null && fresh.length) {
      added = i;
      [burst] = fresh;
      assert.equal(f.lostToVoid, true, 'the burst starts while the fighter is still out of play');
    }
    if (back === null && !f.lostToVoid) back = i;
    if (burst && gone === null && !arena.fx.spawns.includes(burst)) gone = i;
  }
  return { added, back, gone, burst, placed, count };
}

test('a fighter already on the stage gets no burst: not as a match starts, in any mode, nor on a restart or a rematch', () => {
  for (const mode of ['quick-battle', 'watch', 'local', 'online']) {
    const battle = battleOf({ mode });
    assert.deepEqual(battle.fx.spawns, [], `${mode}: the match starts with both fighters there`);
    battle.setPhase('fight');
    for (let i = 0; i < 30; i++) step(battle);
    assert.deepEqual(battle.fx.spawns, [], mode);
    battle.restart();
    assert.deepEqual(battle.fx.spawns, [], `${mode}: a restart puts them back, with no burst`);
  }
});

test('Practice Ground gets none for a fighter it puts on its floor: its arrival, a CPU added or replaced, a swapped fighter', () => {
  const a = getCharacter('0001');
  const b = getCharacter('0004');
  const session = new PracticeSession({ canvas, map: PRACTICE_MAP, def: a, sprites: fakeSpritesOf(a), input: input() });
  assert.deepEqual(session.fx.spawns, []);
  session.setCPU(b, fakeSpritesOf(b));
  session.setCPU(a, fakeSpritesOf(a));
  session.setFighter(b, fakeSpritesOf(b));
  assert.deepEqual(session.fx.spawns, []);
});

test('a respawn is announced before the fighter is back: the burst starts its life before, where it will stand, and pops as it appears', () => {
  const p2Def = getCharacter('0003');
  const battle = battleOf({ p2Def });
  battle.setPhase('fight');
  for (let round = 1; round <= 2; round++) {
    const f = battle.p2;
    const { added, back, gone, burst, placed, count } = throughRespawn(battle, f);
    assert.ok(added !== null, `${round}: a burst`);
    assert.ok(back !== null, `${round}: back`);
    assert.equal(count, 1, `${round}: exactly one`);
    // Started the burst's life before the fighter is back, within a step.
    const lead = (back - added) * DT;
    assert.ok(Math.abs(lead - life) <= DT + 1e-9, `${round}: started ${lead.toFixed(3)} s before (life ${life} s)`);
    // Over (its flash popped) on the very step the fighter appears, give or
    // take one.
    assert.ok(Math.abs(gone - back) <= 1, `${round}: it ends as the fighter appears (gone at step ${gone}, back at ${back})`);
    // Where the fighter came back, in its palette and size.
    near(burst.x, placed.x, `${round}: x`);
    near(burst.y, placed.y - f.body.height / 2, `${round}: y, its centre`);
    near(f.body.x, placed.x, `${round}: the fighter is where the burst was`);
    near(f.body.y, placed.y, `${round}: the fighter's feet`);
    assert.equal(burst.slot, 'p2');
    assert.equal(burst.size, p2Def.visual.height);
    assert.deepEqual(burst.palette, eliminationPalette(p2Def));
  }
});

test('every mode announces its respawns the same way: Quick Battle, Watch Mode, Local Play and Online Play', () => {
  for (const mode of ['quick-battle', 'watch', 'local', 'online']) {
    const battle = battleOf({ mode });
    battle.setPhase('fight');
    const { added, back } = throughRespawn(battle, battle.p1);
    assert.ok(added !== null && back !== null && added < back, mode);
  }
});

test('Practice Ground announces every respawn too, the player\'s and the CPU\'s', () => {
  const a = getCharacter('0001');
  const b = getCharacter('0004');
  const session = new PracticeSession({ canvas, map: PRACTICE_MAP, def: a, sprites: fakeSpritesOf(a), input: input() });
  session.setCPU(b, fakeSpritesOf(b));
  for (const f of [session.cpu, session.player]) {
    const { added, back, burst, placed } = throughRespawn(session, f);
    assert.ok(added !== null && back !== null && added < back, f.slot);
    near(burst.x, placed.x, `${f.slot}: x`);
    assert.deepEqual(burst.palette, eliminationPalette(f.def));
  }
});

test('a restart during the wait clears the burst, and no burst comes for a respawn that never happens', () => {
  const battle = battleOf();
  battle.setPhase('fight');
  intoVoid(battle, battle.p2);
  step(battle);
  for (let i = 0; i < RESPAWN_STEPS - 5; i++) step(battle);
  assert.equal(battle.fx.spawns.length, 1, 'announced, the fighter still out');
  battle.restart();
  assert.deepEqual(battle.fx.spawns, [], 'the restart clears it');
  battle.setPhase('fight');
  for (let i = 0; i < RESPAWN_STEPS + 5; i++) step(battle);
  assert.deepEqual(battle.fx.spawns, [], 'nothing waits to respawn: no burst');
});

// ---- What it is ----------------------------------------------------------------------

test('every fighter bursts in its own palette and size; one without a palette in the neutral one', () => {
  for (const c of CHARACTERS) {
    const fx = new HitEffects();
    const f = { slot: 'p1', def: c, body: { x: 100, y: 300, height: 90 } };
    fx.addSpawn(f);
    const [burst] = fx.spawns;
    assert.deepEqual(burst.palette, eliminationPalette(c), c.id);
    assert.equal(burst.size, c.visual?.height ?? 90, c.id);
    const colours = new Set(draw(fx, 'drawSpawns').filter(([k]) => k === 'stroke').map((call) => call.at(-1).stroke));
    fx.update(life / 2);
    const mid = new Set(draw(fx, 'drawSpawns').filter(([k]) => k === 'stroke').map((call) => call.at(-1).stroke));
    for (const colour of eliminationPalette(c)) assert.ok(colours.has(colour) && mid.has(colour), `${c.id}: drawn in ${colour}`);
  }
  const fx = new HitEffects();
  fx.addSpawn({ slot: 'p2', def: { visual: {} }, body: { x: 0, y: 0, height: 80 } });
  assert.equal(fx.spawns[0].palette, NEUTRAL_ELIMINATION_PALETTE);
  assert.equal(fx.spawns[0].size, 80, 'sized by its body without an art height');
});

test('it is the elimination run backwards: at age t it draws exactly what the elimination draws at age life - t', () => {
  const f = { slot: 'p1', def: getCharacter('0002'), body: { x: 120, y: 340, height: 100 } };
  for (const reducedMotion of [false, true]) {
    for (const t of [1e-4, 0.05, 0.1, life * 0.25, life / 2, life * 0.7, life - 0.05, life - 1e-4]) {
      const spawn = new HitEffects({ reducedMotion });
      const elimination = new HitEffects({ reducedMotion });
      spawn.addSpawn(f);
      elimination.addElimination(f);
      assert.equal(spawn.spawns[0].seed, elimination.eliminations[0].seed, 'the same seed: the same shards');
      spawn.update(t);
      elimination.update(life - t);
      const forward = draw(elimination, 'drawEliminations');
      assert.ok(forward.length > 0, 'something drawn');
      assert.deepEqual(draw(spawn, 'drawSpawns'), forward, `t = ${t} (reduced motion ${reducedMotion})`);
    }
  }
});

test('it fades in and grows inward: shards from their full reach in to the centre, the ring closing, the flash popping at the end', () => {
  // Its centre at the world origin: x 0, y 0 (the body's feet 50 below).
  const f = { slot: 'p1', def: getCharacter('0001'), body: { x: 0, y: 50, height: 100 } };
  const at = (t) => {
    const fx = new HitEffects();
    fx.addSpawn(f);
    if (t > 0) fx.update(t);
    const calls = draw(fx, 'drawSpawns');
    // The burst's centre on screen: (0, 0) through the test's toScreen.
    const points = calls.filter(([k]) => k === 'moveTo').map(([, x, y]) => Math.hypot(x - 10, y - 20));
    const arcs = calls.filter(([k]) => k === 'arc');
    const strokes = calls.filter(([k]) => k === 'stroke');
    return {
      reach: Math.max(...points),
      ring: arcs.at(-1)[3], // the ring is the last arc (after the flash's)
      alpha: strokes.at(-1).at(-1).alpha,
      flash: calls.some(([k]) => k === 'fill'),
    };
  };
  const start = at(0);
  const mid = at(life * 0.5);
  const late = at(life * 0.8);
  const end = at(life - 1e-3);
  assert.equal(start.alpha, 0, 'invisible as it starts');
  assert.ok(mid.alpha > start.alpha && end.alpha > mid.alpha, 'fading in');
  assert.ok(start.reach > mid.reach && mid.reach > end.reach, `the shards fly inward (${start.reach.toFixed(0)} → ${mid.reach.toFixed(0)} → ${end.reach.toFixed(0)})`);
  assert.ok(start.ring > mid.ring && mid.ring > end.ring, 'the ring closes');
  near(start.ring, 2 * f.def.visual.height * HIT_FX.elimination.ring, 'the ring starts at its widest (cfg.ring fighter heights, at scale 2)');
  assert.equal(start.flash, false, 'no flash at first');
  assert.equal(mid.flash, false, 'nor halfway');
  assert.ok(late.flash && end.flash, 'the flash at the end');
  // It accelerates in: the last stretch covers more than the first.
  const quarter = at(life * 0.25);
  const three = at(life * 0.75);
  assert.ok(three.reach - end.reach > start.reach - quarter.reach, 'quickening as it goes (the ease-out reversed)');
});

test('it lasts the elimination\'s life, then is gone; a spawn shakes as an elimination does, never with reduced motion', () => {
  const f = { slot: 'p1', def: getCharacter('0001'), body: { x: 0, y: 0, height: 100 } };
  const fx = new HitEffects();
  fx.addSpawn(f);
  assert.equal(fx.shake.amp, HIT_FX.elimination.shake, 'the same small shake');
  fx.update(life * 0.5);
  assert.equal(fx.spawns.length, 1, 'still playing');
  fx.update(life * 0.5 + 1e-6);
  assert.deepEqual(fx.spawns, [], 'over and gone');
  assert.deepEqual(draw(fx, 'drawSpawns'), [], 'nothing left to draw');
  const calm = new HitEffects({ reducedMotion: true });
  calm.addSpawn(f);
  assert.equal(calm.shake.amp, 0, 'no shake with reduced motion');
  // With reduced motion the shards travel only a short way.
  const reach = (fxOf) => {
    const points = draw(fxOf, 'drawSpawns').filter(([k]) => k === 'moveTo').map(([, x, y]) => Math.hypot(x - 10, y - 20));
    return Math.max(...points);
  };
  const full = new HitEffects();
  full.addSpawn(f);
  assert.ok(reach(calm) < reach(full) * 0.6, 'short travel with reduced motion');
});

test('a respawn\'s burst is never counted as an elimination', () => {
  const battle = battleOf();
  battle.setPhase('fight');
  let eliminations = 0;
  const add = battle.fx.addElimination.bind(battle.fx);
  battle.fx.addElimination = (f) => { eliminations++; return add(f); };
  const { added } = throughRespawn(battle, battle.p2);
  assert.ok(added !== null);
  assert.equal(eliminations, 1, 'the fall, and only the fall');
});

test('the Arena draws the spawn burst over the fighters, and the shared code knows no fighter by id', () => {
  const arena = readFileSync(new URL('../../js/game/arena.js', import.meta.url), 'utf8');
  const render = arena.slice(arena.indexOf('this.drawFighter(f);'));
  assert.ok(render.includes('this.fx.drawSpawns('), 'drawn after the fighters');
  assert.ok(render.indexOf('this.fx.drawSpawns(') > render.indexOf('this.fx.drawEliminations('));
  for (const file of ['../../js/game/rendering/hit-fx.js', '../../js/game/arena.js', '../../js/game/battle.js', '../../js/game/practice.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /'00\d\d'|"00\d\d"/, `${file}: no fighter id`);
  }
});

// ---- Paint only ---------------------------------------------------------------------

test('paint only: a whole CPU match (eliminations, respawns, a restart) steps identically with and without the respawn burst', () => {
  const p1Def = getCharacter('0001');
  const p2Def = getCharacter('0002');
  const snapshot = (battle) => JSON.stringify({
    score: battle.score, phase: battle.phase, timeLeft: battle.timeLeft, final: battle.final,
    stats: battle.stats.snapshot?.() ?? null,
    projectiles: battle.projectiles.length, clones: battle.clones.length,
    fighters: battle.fighters.map((f) => ({
      body: [f.body.x, f.body.y, f.body.vx, f.body.vy, f.body.grounded], facing: f.facing, state: f.state,
      lp: f.combat.launchPoint, energy: f.combat.energy, stun: f.combat.stun, lost: f.lostToVoid, respawn: f.respawnTimer,
      locked: f.inputLocked, anim: f.animator?.frame?.url ?? null,
    })),
  });
  const run = (withSpawn) => {
    const saved = HitEffects.prototype.addSpawn;
    if (!withSpawn) HitEffects.prototype.addSpawn = function noSpawn() {};
    try {
      const battle = battleOf({ p1Def, p2Def, mode: 'watch', seed: 7 });
      const trace = [];
      for (let i = 0; i < 1500; i++) {
        if (i === 400) intoVoid(battle, battle.p1);
        if (i === 900) intoVoid(battle, battle.p2);
        if (i === 1200) battle.restart();
        battle.update(DT);
        if (i % 25 === 0) trace.push(snapshot(battle));
      }
      trace.push(snapshot(battle));
      return { trace, spawns: battle.fx.spawns.length };
    } finally {
      HitEffects.prototype.addSpawn = saved;
    }
  };
  const withSpawn = run(true);
  const without = run(false);
  assert.deepEqual(withSpawn.trace, without.trace);
  assert.equal(without.spawns, 0);
});
