// Run with node --test tests/systems/platform-hazards.test.mjs (no dependencies).
// Asperitas and its two cloud hazards: the stage's data (one shallow main
// cloud, exactly two drifting hazard clouds in disjoint regions), each
// hazard's own state machine and random stream, random reappearance (new
// places in both x and y, chosen while hidden, validated before the cloud
// is solid, never into a fighter, never outside the Void in force), the
// platforms never meeting (long seeded runs), and real moving-platform
// physics (landing, riding, jumping off, falling when one vanishes). Real
// physics, Fighter, Battle and themes; paint still needs real-browser
// verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMap, stageSlots } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { CLOUD_DRIFT, HAZARD_STATES } from '../../js/data/platform-hazards.js';
import { StageCollision, createBody, stepBody, carryBody } from '../../js/game/physics.js';
import {
  PlatformHazards, hazardVolume, hazardEnvelope, mainKeepOut, assertHazardLayout,
} from '../../js/game/platform-hazards.js';
import { CHARACTERS } from '../../js/data/characters.js';
import { CONFIG } from '../../js/config.js';
import { mulberry32 } from '../../js/core/utils.js';
import { def, DT, MOVEMENT, fakeSprites, makeFighter } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');
const { createTheme } = await import('../../js/stages/index.js');
const { StageModel } = await import('../../js/game/ai/cpu-intelligence/stage-model.js');

const S = HAZARD_STATES;
const ASPERITAS = getMap('asperitas');
const LEFT = 'asperitas-cloud-left';
const RIGHT = 'asperitas-cloud-right';
const B = CLOUD_DRIFT;

// A fresh Asperitas stage and its hazards.
function sky(seed = 1, map = ASPERITAS) {
  const stage = new StageCollision(map);
  const hazards = new PlatformHazards(stage, { seed });
  return { stage, hazards, left: hazards.get(LEFT), right: hazards.get(RIGHT) };
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Every step of `seconds` of the hazards, calling `each(step)` after it.
function run(hazards, seconds, each = () => {}, bodies = []) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    hazards.update(DT, bodies);
    each(i);
  }
}

// Puts a controller into a move of its own (tests only): from where it is
// to (x, y) over `duration` seconds.
function forceMove(c, x, y, duration = 2) {
  const p = c.platform;
  c.state = x !== p.x ? S.horizontal : S.vertical;
  c.from = { x: p.x, y: p.y };
  c.to = { x, y };
  c.time = 0;
  c.duration = duration;
}

// Holds a controller still for a long while (tests only).
function forceIdle(c, seconds = 60) {
  c.state = S.idle;
  c.time = 0;
  c.duration = seconds;
}

// ---- Stage registration ------------------------------------------------------------

test('Asperitas is registered as the third stage, with its own theme', () => {
  assert.deepEqual(MAPS.map((m) => m.id).slice(0, 3), ['desert', 'city', 'asperitas']);
  const m = getMap('asperitas');
  assert.ok(m);
  assert.equal(m.name, 'Asperitas');
  assert.equal(m.tagline, 'Above the clouds, beyond the horizon');
  assert.equal(m.theme, 'asperitas');
  assert.ok(!MAPS.includes(PRACTICE_MAP), 'Practice Ground stays apart');
  for (const reducedMotion of [false, true]) {
    const theme = createTheme(m, { reducedMotion });
    assert.equal(theme.constructor.name, 'AsperitasTheme');
    assert.equal(theme.groundY, m.mainStage.top);
  }
  // A live stage's platforms can be handed over, as the Arena does.
  const stage = new StageCollision(m);
  assert.equal(createTheme(m, { platforms: stage.platforms }).platforms, stage.platforms);
  assert.deepEqual(m.traits, [
    ['Terrain', 'Floating clouds'],
    ['Platforms', '2 moving cloud platforms'],
    ['Hazards', '2 shifting cloud hazards'],
    ['Obstacles', 'None'],
    ['Light', 'Daylight'],
  ]);
});

test('one main cloud, no foundation under it, and exactly two upper clouds, both hazards', () => {
  const m = ASPERITAS;
  const main = m.mainStage;
  const width = main.right - main.left;
  assert.ok(width >= 1300 && width <= 1600, 'a main platform as wide as the other stages\'');
  // No foundation: the floor's solid body is a shallow slab, not a block
  // down to the Void (Desert's and City's run 1140 deep).
  assert.ok(main.bottom - main.top <= 80, `a ${main.bottom - main.top}-unit slab`);
  assert.ok(main.bottom < m.voidBounds.bottom - 200, 'open sky under it, well before the Void');
  const stage = new StageCollision(m);
  assert.equal(stage.floor.h, main.bottom - main.top);
  assert.equal(stage.floor.hazard, undefined, 'the main cloud is ordinary terrain, not a hazard');
  assert.deepEqual(m.solids, [], 'no obstacles');
  assert.equal(m.platforms.length, 2, 'exactly two upper clouds');
  assert.deepEqual(m.platforms.map((p) => p.id), [LEFT, RIGHT]);
  for (const p of m.platforms) {
    assert.equal(p.hazard, true, `${p.id} is a hazard`);
    assert.equal(p.kind, 'cloud');
    assert.equal(p.dropThrough, true);
    assert.equal(p.dynamic.behavior, 'cloud-drift');
    assert.deepEqual([...p.dynamic.moves], ['horizontal', 'vertical']);
    assert.equal(p.dynamic.disappears, true);
    assert.equal(p.dynamic.reappearance, 'random');
    assert.ok(p.y < main.top - 150, `${p.id} floats above the main cloud`);
  }
  // At runtime they are one-way platforms, separate objects from the map's.
  for (const p of stage.platforms) {
    assert.equal(p.oneWay, true);
    assert.notEqual(p, m.platforms.find((q) => q.id === p.id), 'the stage\'s own copy');
  }
  assert.deepEqual(stage.dynamicPlatforms.map((p) => p.id), [LEFT, RIGHT]);
  // Desert and City keep everything they had.
  assert.equal(getMap('desert').platforms.length, 0);
  assert.equal(getMap('desert').mainStage.bottom - getMap('desert').mainStage.top, 1140);
  assert.equal(getMap('city').platforms.length, 7);
  assert.ok(getMap('city').platforms.every((p) => !p.dynamic && !p.hazard));
});

test('both fighters spawn on the main cloud, apart, never on a hazard', () => {
  const stage = new StageCollision(ASPERITAS);
  const [a, b] = ASPERITAS.spawnPoints.map((s) => makeFighter({ stage, x: s.x, facing: s.facing }).fighter);
  for (const f of [a, b]) {
    assert.equal(f.body.grounded, true);
    assert.equal(f.body.ground, stage.floor);
    assert.equal(f.body.y, ASPERITAS.mainStage.top);
  }
  assert.ok(b.body.x - a.body.x >= 300, 'comfortable room to start');
  assert.equal(a.facing, 1);
  assert.equal(b.facing, -1);
});

test('the hazard regions are disjoint by construction: from each other, and from the main cloud with room to stand under them', () => {
  const stage = new StageCollision(ASPERITAS);
  assertHazardLayout(stage);
  const [a, b] = stage.dynamicPlatforms;
  const ea = hazardEnvelope(a, B);
  const eb = hazardEnvelope(b, B);
  assert.equal(overlaps(ea, eb), false);
  assert.ok(eb.left - ea.right >= 80, `${eb.left - ea.right} units between the two regions' art`);
  for (const p of [a, b]) {
    const e = hazardEnvelope(p, B);
    assert.equal(overlaps(e, mainKeepOut(stage, p.dynamic.mainClearance)), false);
    // Room under the lowest a cloud's art can hang for the tallest fighter.
    const tallest = Math.max(...CHARACTERS.map((c) => c.collider.height));
    assert.ok(stage.floor.y - e.bottom > tallest, `${p.id}: ${stage.floor.y - e.bottom} units over the main cloud`);
    // Over the main cloud: never past its ledges.
    const r = p.dynamic.region;
    assert.ok(r.left >= stage.floor.x && r.right <= stage.floor.x + stage.floor.w);
    assert.ok(r.right - r.left - p.w >= 2 * B.horizontalTravel[1], 'room to drift its longest move either way');
    assert.ok(r.bottom - r.top >= B.verticalTravel[1], 'room for its longest rise or fall');
  }
  // A layout that could meet is refused outright.
  const bad = { ...ASPERITAS, platforms: ASPERITAS.platforms.map((p, i) => (i === 1 ? { ...p, x: 1500, dynamic: { ...p.dynamic, region: { ...p.dynamic.region, left: 1500 } } } : p)) };
  assert.throws(() => new PlatformHazards(new StageCollision(bad)), /could meet/);
  const low = { ...ASPERITAS, platforms: [{ ...ASPERITAS.platforms[0], dynamic: { ...ASPERITAS.platforms[0].dynamic, region: { ...ASPERITAS.platforms[0].dynamic.region, bottom: 860 } } }] };
  assert.throws(() => new PlatformHazards(new StageCollision(low)), /main stage/);
});

test('no jump reaches the upper Void, even from the highest a cloud can rise', () => {
  const g = CONFIG.sim.gravity * MOVEMENT.gravityScale;
  const v = MOVEMENT.jumpVelocity;
  // The higher jump, then both air jumps at their apexes.
  const rise = ((v ** 2) * MOVEMENT.highJumpHeight + (v * MOVEMENT.airJumpRatio) ** 2 * MOVEMENT.airJumps) / (2 * g);
  const highest = Math.min(...ASPERITAS.platforms.map((p) => p.dynamic.region.top));
  const tallest = Math.max(...CHARACTERS.map((c) => c.collider.height));
  const apex = highest - rise - tallest / 2;
  assert.ok(apex - ASPERITAS.voidBounds.top > 30, `apex ${apex.toFixed(0)} vs Void ${ASPERITAS.voidBounds.top}`);
});

// ---- Independent controllers ----------------------------------------------------------

test('each hazard has its own state, timers, motion and random stream', () => {
  const { hazards, left, right } = sky(7);
  assert.equal(hazards.controllers.length, 2);
  assert.notEqual(left.rng, right.rng, 'two generators');
  assert.notEqual(left.from, right.from);
  // Their streams differ from the very first draw.
  const a = sky(7).left.rng;
  const b = sky(7).right.rng;
  const first = Array.from({ length: 5 }, () => [a(), b()]);
  assert.ok(first.every(([x, y]) => x !== y));
  // Changing one controller's own timer or state leaves the other alone.
  const before = { state: right.state, time: right.time, duration: right.duration };
  left.time = 99;
  left.state = S.hidden;
  assert.deepEqual({ state: right.state, time: right.time, duration: right.duration }, before);
});

test('a hazard runs the same with or without the other: nothing between them is shared', () => {
  const both = sky(31);
  const alone = sky(31, { ...ASPERITAS, platforms: [ASPERITAS.platforms[1]] });
  const trace = (c) => `${c.state} ${c.platform.x.toFixed(4)} ${c.platform.y.toFixed(4)} ${c.platform.active}`;
  for (let i = 0; i < 60 * 240; i++) {
    both.hazards.update(DT);
    alone.hazards.update(DT);
    assert.equal(trace(both.right), trace(alone.right), `step ${i}`);
  }
  assert.ok(both.right.history.length > 20);
});

test('the two hazards are not synchronized: they behave differently at the same time', () => {
  const { hazards, left, right } = sky(3);
  let different = 0;
  let steps = 0;
  const seen = { [LEFT]: new Set(), [RIGHT]: new Set() };
  run(hazards, 600, () => {
    steps++;
    if (left.state !== right.state) different++;
    seen[LEFT].add(left.state);
    seen[RIGHT].add(right.state);
  });
  assert.ok(different / steps > 0.5, `in different states ${(100 * different / steps).toFixed(0)}% of the time`);
  // Each goes through all six states, on its own.
  for (const id of [LEFT, RIGHT]) assert.deepEqual([...seen[id]].sort(), Object.values(S).sort(), id);
  assert.notDeepEqual(left.history.slice(0, 20), right.history.slice(0, 20));
});

test('every state change is a valid one, and the cloud never sticks in one state', () => {
  const next = {
    [S.idle]: [S.idle, S.horizontal, S.vertical, S.disappearing],
    [S.horizontal]: [S.idle, S.horizontal, S.vertical, S.disappearing],
    [S.vertical]: [S.idle, S.horizontal, S.vertical, S.disappearing],
    [S.disappearing]: [S.hidden],
    [S.hidden]: [S.reappearing],
    [S.reappearing]: [S.idle, S.horizontal, S.vertical],
  };
  for (const seed of [1, 2, 3, 4, 5]) {
    const { hazards } = sky(seed);
    for (const c of hazards.controllers) {
      const seenStates = [];
      let longest = 0;
      let streak = 0;
      let last = null;
      c.begin = ((begin) => function (state) {
        begin.call(this, state);
        seenStates.push(this.state);
      })(c.begin);
      run(hazards, 300, () => {
        streak = c.state === last ? streak + 1 : 0;
        last = c.state;
        longest = Math.max(longest, streak);
      });
      for (let i = 1; i < seenStates.length; i++) {
        assert.ok(next[seenStates[i - 1]].includes(seenStates[i]), `${c.id}: ${seenStates[i - 1]} → ${seenStates[i]}`);
      }
      // The longest any single state lasts: a move or idle at most 5 s
      // (a repeat of the same state starts it over), hidden at most 2.5 s
      // plus retries.
      assert.ok(longest * DT < 30, `${c.id}: stuck ${longest * DT}s`);
      assert.ok(seenStates.length > 40, `${c.id}: ${seenStates.length} states in 5 minutes`);
    }
  }
});

test('idle holds still, horizontal eases across, vertical eases up or down, all inside the region', () => {
  const { hazards, left } = sky(11);
  const p = left.platform;
  const r = left.region;
  const seen = { idle: 0, horizontal: 0, vertical: 0 };
  let prev = { x: p.x, y: p.y };
  run(hazards, 400, () => {
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (left.state === S.idle && left.time > DT) {
      assert.equal(dx, 0);
      assert.equal(dy, 0);
      seen.idle++;
    } else if (left.state === S.horizontal && left.time > DT) {
      assert.equal(dy, 0, 'horizontal: never up or down');
      seen.horizontal += dx !== 0 ? 1 : 0;
    } else if (left.state === S.vertical && left.time > DT) {
      assert.equal(dx, 0, 'vertical: never across');
      seen.vertical += dy !== 0 ? 1 : 0;
    }
    // Gentle: never faster than a fraction of a walk, never a jump while
    // it can be seen.
    if (p.opacity > 0) assert.ok(Math.hypot(dx, dy) <= 130 * DT, `${Math.hypot(dx, dy).toFixed(2)} units in a step`);
    assert.ok(p.x >= r.left - 1e-6 && p.x + p.w <= r.right + 1e-6 && p.y >= r.top - 1e-6 && p.y <= r.bottom + 1e-6);
    prev = { x: p.x, y: p.y };
  });
  assert.ok(seen.idle > 0 && seen.horizontal > 0 && seen.vertical > 0, JSON.stringify(seen));
  // A move starts and ends at rest (eased), and its length and duration are
  // the behaviour's.
  const { hazards: h2, right } = sky(12);
  let moves = 0;
  right.begin = ((begin) => function (state) {
    begin.call(this, state);
    if (state === S.horizontal || state === S.vertical) {
      moves++;
      const travel = Math.abs(this.axis === 'x' ? this.to.x - this.from.x : this.to.y - this.from.y);
      const [lo, hi] = this.axis === 'x' ? B.horizontalTravel : B.verticalTravel;
      assert.ok(travel >= B.minTravel - 1e-9 && travel <= hi + 1e-9, `travel ${travel}`);
      assert.ok(this.duration >= B.moveSeconds[0] && this.duration <= B.moveSeconds[1]);
      assert.ok(this.speed > 0 && Math.abs(this.speed - travel / this.duration) < 1e-9);
      assert.ok(this.direction === 1 || this.direction === -1);
      void lo;
    }
  })(right.begin);
  run(h2, 300);
  assert.ok(moves > 10);
});

test('disappearing fades with collision on; hidden has no collision at all; reappearing fades in, solid only from part-way', () => {
  const { stage, hazards, left } = sky(5);
  const p = left.platform;
  let phase = null;
  let lastOpacity = 1;
  const checked = new Set();
  run(hazards, 600, () => {
    if (left.state !== phase) {
      phase = left.state;
      lastOpacity = p.opacity;
      return;
    }
    if (phase === S.disappearing) {
      assert.equal(p.active, true, 'solid while it fades');
      assert.ok(p.opacity <= lastOpacity && p.opacity < 1);
      checked.add('fade-out');
    } else if (phase === S.hidden) {
      assert.equal(p.active, false);
      assert.equal(p.opacity, 0);
      // Nothing there: no surface, no landing.
      const at = stage.surfaceBelow(p.x, p.x + p.w, p.y - 1);
      assert.notEqual(at.ref, p);
      checked.add('hidden');
    } else if (phase === S.reappearing) {
      assert.ok(p.opacity >= lastOpacity);
      if (p.active) assert.ok(left.time / left.duration >= B.solidAt - 1e-9, 'solid only from solidAt');
      else assert.ok(p.opacity <= B.solidAt + 1e-9, 'not yet solid: never more than half-formed');
      checked.add(p.active ? 'solid' : 'forming');
    }
    lastOpacity = p.opacity;
  });
  assert.deepEqual([...checked].sort(), ['fade-out', 'forming', 'hidden', 'solid']);
});

test('a disappearance takes the behaviour\'s times, and never skips hidden or reappearing', () => {
  const { hazards, right } = sky(9);
  const spans = { disappearing: [], hidden: [], reappearing: [] };
  let state = right.state;
  let since = 0;
  run(hazards, 900, () => {
    since += DT;
    if (right.state !== state) {
      if (state in spans) spans[state].push(since);
      state = right.state;
      since = 0;
    }
  });
  assert.ok(spans.disappearing.length >= 5, `${spans.disappearing.length} disappearances`);
  for (const t of spans.disappearing) assert.ok(t >= B.fadeOutSeconds[0] - 2 * DT && t <= B.fadeOutSeconds[1] + 2 * DT, `fade-out ${t}`);
  for (const t of spans.hidden) assert.ok(t >= B.hiddenSeconds[0] - 2 * DT && t <= B.hiddenSeconds[1] + 2 * DT, `hidden ${t}`);
  for (const t of spans.reappearing) assert.ok(t >= B.fadeInSeconds[0] - 2 * DT && t <= B.fadeInSeconds[1] + 2 * DT, `fade-in ${t}`);
});

// ---- Random reappearance --------------------------------------------------------------

// Every disappearance of `c` over `seconds`: where it vanished, where it
// formed again, and where it was on each step in between.
function reappearances(c, hazards, seconds, bodies = []) {
  const out = [];
  let current = null;
  run(hazards, seconds, () => {
    const p = c.platform;
    if (c.state === S.hidden && !current) current = { from: { ...c.vanishedAt }, hiddenSteps: 0 };
    if (current && c.state === S.hidden) current.hiddenSteps++;
    if (current && c.state === S.reappearing) {
      current.to = { x: p.x, y: p.y };
      out.push(current);
      current = null;
    }
  }, bodies);
  return out;
}

test('a vanished cloud forms again somewhere new: varied in both x and y, inside its region, a real move away', () => {
  for (const id of [LEFT, RIGHT]) {
    const { hazards } = sky(21);
    const c = hazards.get(id);
    const r = c.region;
    const list = reappearances(c, hazards, 1800);
    assert.ok(list.length >= 20, `${id}: ${list.length} reappearances`);
    for (const { from, to } of list) {
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      assert.ok(d >= B.minRelocation, `${id}: moved only ${d.toFixed(0)}`);
      assert.ok(to.x >= r.left && to.x + c.platform.w <= r.right && to.y >= r.top && to.y <= r.bottom);
    }
    const xs = list.map((e) => e.to.x);
    const ys = list.map((e) => e.to.y);
    const spread = (v) => Math.max(...v) - Math.min(...v);
    assert.ok(spread(xs) > (r.right - r.left - c.platform.w) * 0.6, `${id}: x spread ${spread(xs).toFixed(0)}`);
    assert.ok(spread(ys) > (r.bottom - r.top) * 0.6, `${id}: y spread ${spread(ys).toFixed(0)}`);
    // Not always the same place, nor back where it vanished.
    assert.ok(new Set(list.map((e) => `${e.to.x.toFixed(1)},${e.to.y.toFixed(1)}`)).size > list.length * 0.8);
    assert.ok(list.some((e) => e.to.x > e.from.x) && list.some((e) => e.to.x < e.from.x), 'farther right and farther left');
    assert.ok(list.some((e) => e.to.y < e.from.y) && list.some((e) => e.to.y > e.from.y), 'higher and lower');
  }
});

test('it relocates only while fully hidden: never a visible teleport, never a slide while forming', () => {
  for (const seed of [2, 8, 13]) {
    const { hazards } = sky(seed);
    for (const c of hazards.controllers) {
      const p = c.platform;
      let prev = { x: p.x, y: p.y, opacity: p.opacity };
      let jumps = 0;
      run(hazards, 600, () => {
        const d = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (d > 5) {
          jumps++;
          assert.equal(prev.opacity, 0, 'invisible before');
          assert.equal(p.opacity, 0, 'and after');
          assert.equal(p.active, false);
          assert.equal(c.state, S.hidden);
        }
        // Still from the first frame it shows again until it is formed.
        if (c.state === S.reappearing && c.time > 0) assert.equal(d, 0, 'still while forming');
        prev = { x: p.x, y: p.y, opacity: p.opacity };
      });
      assert.ok(jumps > 3, `${c.id} relocated ${jumps} times`);
    }
  }
});

test('a cloud is validated before it is solid again: clear of the main cloud, the other hazard, fighters and the Void', () => {
  const { stage, hazards } = sky(17);
  // Fighters drifting about the sky above the main cloud.
  const rng = mulberry32(99);
  const bodies = Array.from({ length: 3 }, () => createBody({ x: 1500, y: 700, width: 30, height: 90 }));
  let restored = 0;
  const wasActive = new Map(hazards.controllers.map((c) => [c, c.platform.active]));
  run(hazards, 900, (i) => {
    for (const c of hazards.controllers) {
      const p = c.platform;
      if (p.active && !wasActive.get(c)) {
        restored++;
        assert.equal(c.occupied(p.x, p.y, bodies), false, 'nobody inside it');
        assert.equal(c.clearAt(p.x, p.y, bodies), true, 'a valid place');
        const box = hazardVolume(p, B);
        assert.equal(overlaps(box, mainKeepOut(stage, p.dynamic.mainClearance)), false);
        for (const o of hazards.controllers) if (o !== c && o.platform.active) assert.equal(overlaps(box, hazardVolume(o.platform, B)), false);
      }
      wasActive.set(c, p.active);
    }
    // The fighters move on after the check, as they would in their own step.
    if (i % 20 === 0) for (const b of bodies) Object.assign(b, { x: 1150 + rng() * 1300, y: 560 + rng() * 300 });
  }, bodies);
  assert.ok(restored >= 10, `${restored} restorations checked`);
});

test('a place a fighter occupies is refused: the cloud waits hidden, with a bounded search, and forms once there is room', () => {
  const { hazards, left } = sky(4);
  const p = left.platform;
  const r = left.region;
  // Bodies filling the left cloud's whole region.
  const wall = [];
  for (let x = r.left; x <= r.right; x += 40) for (let y = r.top - 20; y <= r.bottom + 80; y += 60) wall.push(createBody({ x, y, width: 40, height: 100 }));
  forceIdle(hazards.get(RIGHT));
  left.begin(S.disappearing);
  let hiddenFor = 0;
  run(hazards, 12, () => {
    if (left.state === S.hidden) hiddenFor += DT;
  }, wall);
  assert.equal(left.state, S.hidden, 'still waiting');
  assert.ok(hiddenFor > B.hiddenSeconds[1] + 5, `waited ${hiddenFor.toFixed(1)}s`);
  assert.equal(p.active, false);
  assert.ok(left.failures > 10, `${left.failures} failed tries, none endless`);
  // A single placement search tries a bounded number of places.
  let tries = 0;
  const clearAt = left.clearAt;
  left.clearAt = function (...args) {
    tries++;
    return clearAt.apply(this, args);
  };
  assert.equal(left.findPlacement(wall), null);
  assert.ok(tries <= B.placementAttempts + 5, `${tries} places tried`);
  left.clearAt = clearAt;
  // The way clears: it forms again, and only then.
  run(hazards, 3, () => {}, []);
  assert.notEqual(left.state, S.hidden);
  assert.ok([S.reappearing, S.idle, S.horizontal, S.vertical].includes(left.state));
});

test('a fighter inside a forming cloud keeps it from becoming solid, and is never pushed', () => {
  const { stage, hazards, left } = sky(6);
  forceIdle(hazards.get(RIGHT));
  left.begin(S.disappearing);
  // Wait for the start of its fade-in.
  for (let i = 0; i < 600 && left.state !== S.reappearing; i++) hazards.update(DT, []);
  assert.equal(left.state, S.reappearing);
  const p = left.platform;
  // A fighter's body right inside where it is forming (in the air).
  const body = createBody({ x: p.x + p.w / 2, y: p.y + 20, width: 30, height: 90 });
  body.vy = 0;
  const at = { x: body.x, y: body.y };
  for (let i = 0; i < 120; i++) {
    hazards.update(DT, [body]);
    assert.equal(p.active, false, 'not solid while someone is inside');
    assert.ok(p.opacity <= B.solidAt + 1e-9);
  }
  assert.deepEqual({ x: body.x, y: body.y }, at, 'never moved by it');
  assert.equal(left.state, S.reappearing);
  // It leaves: the cloud becomes solid and finishes forming.
  body.y = p.y + 400;
  for (let i = 0; i < 120 && !p.active; i++) hazards.update(DT, [body]);
  assert.equal(p.active, true);
  assert.equal(stage.surfaceBelow(p.x, p.x + p.w, p.y - 1).ref, p);
});

test('placements respect the Void in force: never where the Void has closed', () => {
  const { stage, hazards, left } = sky(10);
  forceIdle(hazards.get(RIGHT));
  const r = left.region;
  const mid = (r.left + r.right) / 2;
  // A Void (artificially) closed in past the middle of the left region:
  // only its right half stays valid.
  stage.void = Object.freeze({ ...stage.void, left: mid - 40 - B.volume.side });
  for (let i = 0; i < 40; i++) {
    const at = left.findPlacement([]);
    if (!at) continue;
    assert.ok(at.x >= mid - 1, `placed at ${at.x.toFixed(0)}, inside the Void at ${stage.void.left}`);
  }
  // Overtime's real closing Void never reaches the regions: placements carry on.
  stage.void = stage.baseVoid;
  stage.closeVoid(1, CONFIG.battle.overtimeVoid);
  const list = reappearances(left, hazards, 300);
  assert.ok(list.length >= 3);
  for (const e of list) assert.ok(left.clearAt(e.to.x, e.to.y, []));
});

// ---- Separation ---------------------------------------------------------------------

test('long seeded runs: the three clouds never touch, even moving, vanishing and forming, with fighters about', () => {
  const rng = mulberry32(2024);
  let checkedSteps = 0;
  const sawStates = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const { stage, hazards } = sky(seed * 7919);
    const keep = mainKeepOut(stage, ASPERITAS.platforms[0].dynamic.mainClearance);
    const bodies = [createBody({ x: 1600, y: 700, width: 30, height: 90 }), createBody({ x: 2000, y: 700, width: 30, height: 90 })];
    run(hazards, 240, (i) => {
      if (i % 30 === 0) for (const b of bodies) Object.assign(b, { x: 1100 + rng() * 1400, y: 500 + rng() * 420 });
      const [a, b] = hazards.controllers;
      const va = hazardVolume(a.platform, B);
      const vb = hazardVolume(b.platform, B);
      sawStates.add(`${a.state}/${b.state}`);
      // Hidden or not: wherever a cloud is, it is clear (a hidden one sits
      // where it will form).
      assert.equal(overlaps(va, vb), false, `seed ${seed} step ${i}: the two hazards`);
      assert.equal(overlaps(va, keep), false, `seed ${seed} step ${i}: left and the main cloud`);
      assert.equal(overlaps(vb, keep), false, `seed ${seed} step ${i}: right and the main cloud`);
      for (const c of hazards.controllers) {
        const p = c.platform;
        const r = c.region;
        assert.ok(p.x >= r.left - 1e-6 && p.x + p.w <= r.right + 1e-6 && p.y >= r.top - 1e-6 && p.y <= r.bottom + 1e-6, `${c.id} inside its region`);
      }
      checkedSteps++;
    }, bodies);
  }
  assert.ok(checkedSteps > 150000);
  for (const pair of [`${S.hidden}/${S.hidden}`, `${S.reappearing}/${S.horizontal}`, `${S.disappearing}/${S.vertical}`]) {
    const [x, y] = pair.split('/');
    assert.ok(sawStates.has(pair) || sawStates.has(`${y}/${x}`), `saw ${pair}`);
  }
});

test('a move that would sweep into another platform is refused, and the cloud idles instead', () => {
  const { hazards, left, right } = sky(14);
  // Pretend the right cloud holds the whole sky (tests only).
  Object.defineProperty(right, 'reserved', { get: () => ({ left: -1e4, right: 1e4, top: -1e4, bottom: 1e4 }) });
  for (let i = 0; i < 30; i++) {
    left.begin(i % 2 ? S.horizontal : S.vertical);
    assert.equal(left.state, S.idle);
  }
  assert.equal(left.findPlacement([]), null, 'and nowhere to form');
  void hazards;
});

// ---- Fighters on the clouds ---------------------------------------------------------

// A fighter standing on hazard `id`, the hazards held idle.
function standOn(id, seed = 1) {
  const { stage, hazards } = sky(seed);
  for (const c of hazards.controllers) forceIdle(c);
  const c = hazards.get(id);
  const p = c.platform;
  const { fighter, step } = makeFighter({ stage, x: p.x + p.w / 2, y: p.y - 0.5 });
  assert.equal(fighter.body.grounded, true);
  assert.equal(fighter.body.ground, p);
  const tick = (held = {}) => {
    hazards.update(DT, [fighter]);
    return step(held);
  };
  return { stage, hazards, c, p, fighter, tick };
}

test('a fighter lands on each cloud from above, and jumps up through it from below', () => {
  for (const id of [LEFT, RIGHT]) {
    const { stage, hazards } = sky(3);
    for (const c of hazards.controllers) forceIdle(c);
    const p = hazards.get(id).platform;
    const { fighter, step } = makeFighter({ stage, x: p.x + p.w / 2, y: p.y - 200 });
    for (let i = 0; i < 90 && !fighter.body.grounded; i++) {
      hazards.update(DT, [fighter]);
      step();
    }
    assert.equal(fighter.body.ground, p, `${id}: landed on it`);
    assert.equal(fighter.body.y, p.y);
    // From under it, a jump passes up through it (one-way) and lands on top.
    const under = makeFighter({ stage, x: p.x + p.w / 2 });
    assert.equal(under.fighter.body.ground, stage.floor);
    under.step({ jump: true, jumpPressed: true });
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      hazards.update(DT, [under.fighter]);
      under.step({ jump: true, ...(i === 20 ? { jumpPressed: true } : {}) });
      landed = under.fighter.body.ground === p;
    }
    assert.ok(landed, `${id}: reached from the main cloud`);
  }
});

test('a cloud drifting across carries a grounded fighter with it, feet exactly on its surface', () => {
  const { c, p, fighter, tick } = standOn(LEFT);
  const startGap = fighter.body.x - p.x;
  forceMove(c, p.x + 120, p.y, 2);
  for (let i = 0; i < 120; i++) {
    tick();
    assert.equal(fighter.body.ground, p, `step ${i}`);
    assert.equal(fighter.body.y, p.y);
    assert.ok(Math.abs(fighter.body.x - p.x - startGap) < 1e-6, 'carried exactly');
  }
  assert.ok(p.x > c.from.x + 100, 'it really moved');
  // Drawn moving with it too: no lag between the two between steps.
  for (const alpha of [0, 0.5, 1]) {
    fighter.interpolate(alpha);
    const px = p.prevX + (p.x - p.prevX) * alpha;
    assert.ok(Math.abs(fighter.renderX - px - startGap) < 1e-6);
  }
});

test('a cloud rising or sinking carries a grounded fighter up and down: never sinking through, never left hovering', () => {
  for (const dy of [-90, 90]) {
    const { c, p, fighter, tick } = standOn(RIGHT, 2);
    const y0 = p.y;
    const target = Math.min(c.region.bottom, Math.max(c.region.top, y0 + dy));
    forceMove(c, p.x, target, 2);
    for (let i = 0; i < 125; i++) {
      tick();
      assert.equal(fighter.body.grounded, true, `${dy}: step ${i}`);
      assert.equal(fighter.body.ground, p);
      assert.equal(fighter.body.y, p.y, 'feet on the surface');
    }
    assert.equal(p.y, target);
    assert.notEqual(p.y, y0);
  }
});

test('walking, running and the Dash work on a moving cloud, and walking off its edge drops the fighter', () => {
  const { c, p, fighter, tick } = standOn(LEFT, 4);
  forceMove(c, p.x + 100, p.y, 3);
  const x0 = fighter.body.x - p.x;
  for (let i = 0; i < 10; i++) tick({ runRight: true });
  assert.ok(fighter.body.x - p.x > x0 + 20, 'ran along it while it moved');
  assert.equal(fighter.body.ground, p);
  // A Dash (Q / E's request).
  tick({ runRight: true, mouvementRight: true, mouvementRightPressed: true });
  assert.ok(fighter.dash || fighter.body.vx > MOVEMENT.maxSpeed, 'dashing');
  // On off the edge, and falling (to the main cloud below).
  let off = false;
  for (let i = 0; i < 40; i++) {
    tick({ runRight: true });
    off ||= !fighter.body.grounded && fighter.body.x - fighter.body.halfW > p.x + p.w;
  }
  assert.ok(off, 'walked off its edge into the air');
  assert.notEqual(fighter.body.ground, p);
});

test('jumping off a moving cloud leaves it behind: the cloud never drags a fighter through the air', () => {
  const { c, p, fighter, tick } = standOn(RIGHT, 5);
  forceMove(c, p.x - 120, p.y, 2);
  for (let i = 0; i < 30; i++) tick();
  const x = fighter.body.x;
  tick({ jump: true, jumpPressed: true });
  assert.equal(fighter.body.grounded, false);
  for (let i = 0; i < 15; i++) tick({ jump: true });
  assert.equal(fighter.body.carryX, 0);
  // No sideways speed of its own: the cloud's drift does not follow it up.
  assert.ok(Math.abs(fighter.body.x - x) < 2, `drifted ${fighter.body.x - x}`);
  assert.ok(p.x < c.from.x - 20, 'while the cloud went on');
});

test('a cloud vanishing under a fighter lets it fall: no teleport, push, damage or stun, its actions intact', () => {
  const { stage, c, p, fighter, tick } = standOn(LEFT, 6);
  const lp = fighter.combat.launchPoint;
  c.begin(S.disappearing);
  let prev = { x: fighter.body.x, y: fighter.body.y };
  let fell = false;
  for (let i = 0; i < 90; i++) {
    tick();
    const b = fighter.body;
    assert.ok(Math.abs(b.x - prev.x) < 1e-9, 'no sideways shove');
    assert.ok(b.y - prev.y >= 0 && b.y - prev.y < 30, 'no teleport');
    if (c.state === S.hidden) {
      assert.notEqual(b.ground, p, 'the stale ground reference is gone');
      if (!b.grounded) fell = true;
    } else assert.equal(b.ground, p, 'solid while it fades');
    prev = { x: b.x, y: b.y };
  }
  assert.ok(fell, 'it fell');
  assert.ok(fighter.body.vy > 300 || fighter.body.ground === stage.floor, 'under gravity');
  assert.equal(fighter.combat.launchPoint, lp, 'no damage');
  assert.equal(fighter.combat.stun, 0, 'no stun');
  assert.equal(fighter.launch, null, 'no launch');
  // Coyote time and the air jumps are still there.
  assert.equal(fighter.airJumps, MOVEMENT.airJumps);
});

test('falling through where a hidden cloud is: nothing to land on', () => {
  const { stage, hazards, left } = sky(8);
  forceIdle(hazards.get(RIGHT));
  left.begin(S.disappearing);
  for (let i = 0; i < 120 && left.state !== S.hidden; i++) hazards.update(DT);
  forceIdle(left);
  left.state = S.hidden;
  const p = left.platform;
  assert.equal(p.active, false);
  const body = createBody({ x: p.x + p.w / 2, y: p.y - 60, width: 30, height: 90 });
  for (let i = 0; i < 40; i++) {
    hazards.update(DT, [body]);
    stepBody(body, DT, stage, CONFIG.sim.gravity);
    assert.notEqual(body.ground, p);
  }
  assert.ok(body.y > p.y + 40, 'straight through');
  assert.equal(carryBody(body), false);
});

test('the debug overlay, shadows and the CPU\'s stage model all read the live clouds', () => {
  const { stage, hazards, left } = sky(19);
  const model = new StageModel(stage);
  const p = left.platform;
  const entry = () => model.surfaces.find((s) => s.ref === p);
  assert.ok(entry());
  forceMove(left, p.x + 80, p.y, 1);
  for (let i = 0; i < 30; i++) hazards.update(DT);
  assert.equal(entry().x0, p.x, 'where it is now, never where it started');
  assert.equal(entry().y, p.y);
  assert.equal(entry().hazard, true);
  assert.equal(entry().moving, true);
  left.begin(S.disappearing);
  for (let i = 0; i < 120 && left.state !== S.hidden; i++) hazards.update(DT);
  assert.equal(entry(), undefined, 'a vanished cloud is no surface');
  assert.equal(model.surfaceOf(p), null);
  assert.equal(model.usable(p), false);
  assert.equal(model.usable(stage.floor), true);
  // Never a stepping stone while it fades.
  const right = hazards.get(RIGHT);
  right.begin(S.disappearing);
  hazards.update(DT);
  assert.equal(model.surfaces.find((s) => s.ref === right.platform).fading, true);
  const step = model.stepToward(stage.floor.y, right.platform.y, right.platform.x + 20, right.platform.x, 500);
  assert.notEqual(step?.ref, right.platform);
});

// ---- Battles on Asperitas ---------------------------------------------------------

function battleOn(seed = 1, extra = {}) {
  const sprites = fakeSprites();
  const script = { held: {} };
  const input = { flush() {}, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: ASPERITAS, p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, seed, ...extra,
  });
  return { battle, script };
}

test('every battle builds its own clouds from the map, never writing it; a rematch puts them back', () => {
  const before = JSON.stringify(ASPERITAS);
  const a = battleOn(1).battle;
  const b = battleOn(1).battle;
  assert.notEqual(a.stage.platforms[0], b.stage.platforms[0]);
  a.setPhase('fight');
  for (let i = 0; i < 60 * 30; i++) a.update(DT);
  assert.equal(JSON.stringify(ASPERITAS), before, 'MAPS untouched');
  a.restart();
  for (const c of a.hazards.controllers) {
    assert.equal(c.platform.x, c.home.x);
    assert.equal(c.platform.y, c.home.y);
    assert.equal(c.platform.active, true);
  }
  // The same seed, the same clouds.
  const c = battleOn(5).battle;
  const d = battleOn(5).battle;
  for (let i = 0; i < 600; i++) {
    c.update(DT);
    d.update(DT);
  }
  assert.deepEqual(c.hazards.controllers.map((h) => h.history), d.hazards.controllers.map((h) => h.history));
});

test('the clouds step on the fixed step: the same at 30, 60 and 144 frames a second', () => {
  const trace = (fps) => {
    const { battle } = battleOn(77);
    battle.p2.controller = null;
    battle.setPhase('fight');
    const steps = [];
    const update = battle.update.bind(battle);
    battle.update = (dt) => {
      update(dt);
      steps.push(battle.hazards.controllers.map((c) => `${c.state}:${c.platform.x.toFixed(6)}:${c.platform.y.toFixed(6)}:${c.platform.active}`).join('|'));
    };
    const frame = 1 / fps;
    for (let t = 0; t < 40; t += frame) battle.frame(frame);
    return steps;
  };
  const a = trace(30);
  const b = trace(60);
  const c = trace(144);
  const n = Math.min(a.length, b.length, c.length);
  assert.ok(n > 60 * 39);
  assert.deepEqual(a.slice(0, n), b.slice(0, n));
  assert.deepEqual(b.slice(0, n), c.slice(0, n));
});

test('on Asperitas a fighter still runs off a ledge into the Void, and respawns on the main cloud', () => {
  const { battle, script } = battleOn(3);
  battle.p2.controller = null;
  battle.setPhase('fight');
  const p1 = battle.p1;
  script.held = { runLeft: true };
  let steps = 0;
  while (!p1.lostToVoid && steps++ < 60 * 6) battle.update(DT);
  assert.equal(p1.lostToVoid, true);
  assert.deepEqual(battle.score, { p1: 0, p2: 1 });
  script.held = {};
  while (p1.lostToVoid) battle.update(DT);
  assert.equal(p1.body.ground, battle.stage.floor);
  assert.equal(p1.body.x, ASPERITAS.spawnPoints[0].x);
});

test('overtime: the Void closes in and the clouds carry on, forming only inside it', () => {
  const { battle } = battleOn(12);
  battle.p2.controller = null;
  battle.p1.controller = null;
  battle.setPhase('fight');
  battle.timeLeft = 0.01;
  for (let i = 0; i < 3; i++) battle.update(DT);
  assert.equal(battle.overtime, true);
  const seen = new Set();
  for (let i = 0; i < 60 * 70; i++) {
    battle.update(DT);
    for (const c of battle.hazards.controllers) {
      seen.add(c.state);
      const v = battle.stage.void;
      const box = hazardVolume(c.platform, B);
      assert.ok(box.left > v.left && box.right < v.right && box.bottom < v.bottom && c.platform.y - 120 > v.top);
    }
  }
  assert.ok(battle.voidPressure > 0.9 || battle.phase !== 'fight');
  assert.ok(seen.has(S.hidden) && seen.has(S.reappearing), [...seen].join());
});

test('the hazards never hurt: a match of clouds and no attacks deals no damage', () => {
  const { battle } = battleOn(23);
  battle.setPhase('fight');
  for (const f of battle.fighters) f.controller = null;
  // One fighter on each cloud.
  for (const [f, c] of [[battle.p1, battle.hazards.controllers[0]], [battle.p2, battle.hazards.controllers[1]]]) {
    Object.assign(f.body, { x: c.platform.x + c.platform.w / 2, y: c.platform.y, grounded: true, ground: c.platform, vx: 0, vy: 0 });
  }
  for (let i = 0; i < 60 * 60; i++) battle.update(DT);
  for (const f of battle.fighters) {
    assert.equal(f.combat.launchPoint, 0);
    assert.equal(f.combat.stun, 0);
  }
  assert.equal(battle.combat.events.length, 0);
});

test('the stage roster places Asperitas in slot 3', () => {
  const slots = stageSlots();
  assert.equal(slots[2].map, ASPERITAS);
  assert.equal(slots[2].num, '03');
});

// ---- CPUs on Asperitas ---------------------------------------------------------------

// Watches every stepping stone the CPUs pick: never a vanished cloud, never
// where a cloud was. Restores StageModel afterwards.
function watchSteps(fn) {
  const original = StageModel.prototype.stepToward;
  const seen = { calls: 0, picked: 0, stale: 0 };
  StageModel.prototype.stepToward = function (...args) {
    const s = original.apply(this, args);
    seen.calls++;
    if (s) {
      seen.picked++;
      if (s.ref.active === false || s.x0 !== s.ref.x || s.y !== s.ref.y || s.fading) seen.stale++;
    }
    return s;
  };
  try {
    fn();
  } finally {
    StageModel.prototype.stepToward = original;
  }
  return seen;
}

test('Quick Battle: the CPU follows the player up onto the moving clouds and never aims at a stale or vanished one', () => {
  const seen = watchSteps(() => {
    const { battle } = battleOn(2, { difficulty: 'medium' });
    battle.setPhase('fight');
    const { p1, p2 } = battle;
    let cloudSteps = 0;
    let hits = 0;
    for (let i = 0; i < 60 * 60 && battle.phase === 'fight'; i++) {
      // Player 1 waits on whichever cloud is solid, again each time it is
      // back on the main cloud.
      if (p1.body.ground === battle.stage.floor && i % 240 === 0) {
        const c = battle.hazards.controllers.find((h) => h.platform.active && h.platform.opacity === 1);
        if (c) Object.assign(p1.body, { x: c.platform.x + c.platform.w / 2, y: c.platform.y, grounded: true, ground: c.platform, vx: 0, vy: 0 });
      }
      battle.update(DT);
      if (p2.body.ground?.hazard) cloudSteps++;
      hits += battle.combat.events.filter((e) => e.attacker === p2).length;
      // The CPU never stands on, or is grounded by, a cloud that is not there.
      assert.ok(!p2.body.ground || p2.body.ground.active !== false);
    }
    assert.ok(cloudSteps > 20, `the CPU stood on the clouds for ${cloudSteps} steps`);
    assert.ok(hits > 10, `and fought there (${hits} hits)`);
    assert.equal(p2.controller.telemetry.report().stuckNavigation ?? 0, 0, 'never stuck');
  });
  assert.ok(seen.picked > 20, `${seen.picked} stepping stones picked`);
  assert.equal(seen.stale, 0, 'none of them stale, fading or gone');
});

test('Watch Mode: two CPUs play Asperitas through to a result, never stuck and never falling in on their own', async () => {
  const { runMatch } = await import('../helpers/cpu-match.mjs');
  const [a, b] = CHARACTERS;
  const seen = watchSteps(() => {
    for (const seed of [1, 4]) {
      const r = runMatch({ a: 'hard', b: 'medium', defA: a, defB: b, map: 'asperitas', seed, maxSeconds: 200, matchSeconds: 180 });
      assert.notEqual(r.reason, 'cut', `seed ${seed}: a real result`);
      for (const side of ['p1', 'p2']) {
        assert.ok(r.stats[side].hits > 5, `seed ${seed} ${side}: fought`);
        assert.equal(r.stats[side].selfKOs, 0, `seed ${seed} ${side}: no accidental falls`);
        assert.ok((r.telemetry[side].stuckNavigation ?? 0) <= 2, `seed ${seed} ${side}: navigates`);
      }
    }
  });
  assert.equal(seen.stale, 0);
});
