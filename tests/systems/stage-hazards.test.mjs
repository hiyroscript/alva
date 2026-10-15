// Run with node --test tests/systems/stage-hazards.test.mjs (no dependencies).
// Adamaris's volcano and its rocks (js/game/stage-hazards.js,
// js/data/stage-hazards.js): the two randomly drawn states, the eruption's
// phases, the rocks' damage and Base Launch through the shared launch rules,
// a hit with no owner that nothing can turn back, the Shield's universal
// block, one hit per fighter per rock, the red warnings (exactly where and
// before each rock lands), random landings across the beach, determinism on
// the fixed step and the battle's seed, restarts and clean-up, and what the
// CPU may know. Real physics, Fighter, CombatSystem and Battle; the canvas is
// a stand-in, so paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap } from '../../js/data/maps.js';
import { StageCollision } from '../../js/game/physics.js';
import { CombatSystem, HAZARD_SOURCE } from '../../js/game/combat/combat.js';
import { ATTACK_SOURCES } from '../../js/game/combat/offense.js';
import { LAUNCH_UNIT_SPEED } from '../../js/data/launch.js';
import { VOLCANO, VOLCANIC_ROCKS, VOLCANO_STATES, ERUPTION_PHASES } from '../../js/data/stage-hazards.js';
import { StageHazards, VolcanoController, rockWarning } from '../../js/game/stage-hazards.js';
import { StageModel } from '../../js/game/ai/cpu-intelligence/stage-model.js';
import { CONFIG } from '../../js/config.js';
import { def, DT, fakeSprites, makeFighter } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');

const ADAMARIS = getMap('adamaris');
const G = ADAMARIS.mainStage.top;

// The volcano's own little world: a stage and its hazards.
function world(seed = 1, opts = {}) {
  const stage = new StageCollision(ADAMARIS);
  const hazards = new StageHazards(stage, ADAMARIS, { seed, ...opts });
  return { stage, hazards, volcano: hazards.volcano };
}

// Runs the hazards `seconds` of fixed steps, calling `each` after every one.
function run(hazards, seconds, each = () => {}, live = true) {
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    hazards.update(DT, { live });
    each(i);
  }
}

// A real Battle on Adamaris with a still CPU and scripted Player 1 input.
function battleOn({ seed = 5, mode } = {}) {
  const sprites = fakeSprites();
  const script = { held: {} };
  const input = { flush() {}, sample: () => ({ ...script.held }) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: ADAMARIS, p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, seed, mode,
  });
  battle.p2.controller = null;
  if (mode === 'watch') battle.p1.controller = null;
  return { battle, script };
}

// A rock of `size` placed by hand, landing at `x` on the next step.
function dropRock(hazards, size, x) {
  const spec = VOLCANIC_ROCKS[size];
  const rock = {
    id: `test#${size}#${x}`, source: hazards.volcano, size, spec, hit: spec.hit, x, radius: spec.radius, height: spec.height,
    warning: spec.warning, flight: spec.warning + 0.5, arc: 200, spin: 0, shape: 0.5,
    age: spec.warning + 0.5 - DT / 2, prevAge: 0, renderAge: 0,
  };
  hazards.addRock(rock);
  return rock;
}

// ---- The volcano's states -----------------------------------------------------------

test('the volcano starts dormant (a preview, erupting), in a valid state, with its opening spell', () => {
  const { volcano } = world();
  assert.ok(volcano instanceof VolcanoController);
  assert.equal(volcano.state, VOLCANO_STATES.dormant);
  assert.equal(volcano.phase, null);
  assert.ok(volcano.duration >= VOLCANO.openingDormantSeconds[0] && volcano.duration <= VOLCANO.openingDormantSeconds[1]);
  assert.equal(volcano.throwing, false);
  const preview = world(1, { opening: 'erupting' }).volcano;
  assert.equal(preview.state, VOLCANO_STATES.erupting);
  assert.equal(preview.phase, ERUPTION_PHASES.buildup);
  assert.deepEqual(Object.values(VOLCANO_STATES), ['dormant', 'erupting'], 'exactly two primary states');
});

test('both states are reachable and drawn at random: dormant follows dormant, eruption follows eruption, never a fixed alternation', () => {
  const seen = new Set();
  let erupting = 0;
  let steps = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { hazards, volcano } = world(seed);
    run(hazards, 900, () => {
      steps++;
      if (volcano.state === 'erupting') erupting++;
    });
    const h = volcano.history;
    for (let i = 2; i < h.length; i++) seen.add(h.slice(i - 2, i + 1).map((st) => st[0].toUpperCase()).join(''));
  }
  for (const seq of ['DDE', 'EDE', 'EED', 'DEE', 'DDD', 'EEE']) assert.ok(seen.has(seq), `${seq} happens`);
  // Noticeable but never the whole match: about two fifths of the time.
  const share = erupting / steps;
  assert.ok(share > 0.25 && share < 0.55, `erupting ${(share * 100).toFixed(0)}% of the time`);
});

test('an eruption runs its visible phases in order: buildup, burst, active, cooldown; rocks fly only from the burst to the cooldown', () => {
  const { hazards, volcano } = world(9, { opening: 'erupting' });
  const phases = [];
  const thrownIn = new Map();
  let last = volcano.thrown;
  while (volcano.history.length === 1) {
    hazards.update(DT);
    const p = volcano.phase;
    if (phases.at(-1) !== p) phases.push(p);
    if (volcano.thrown > last) thrownIn.set(p, (thrownIn.get(p) ?? 0) + volcano.thrown - last);
    last = volcano.thrown;
  }
  // Through its whole first period (the next one starts its own).
  assert.deepEqual(phases.slice(0, 4), ['buildup', 'burst', 'active', 'cooldown']);
  assert.ok(thrownIn.get('burst') > 0, 'the first rocks fly with the burst');
  assert.ok(thrownIn.get('active') > 0, 'more volleys while active');
  assert.equal(thrownIn.get('buildup'), undefined, 'none in the buildup');
  assert.equal(thrownIn.get('cooldown'), undefined, 'none in the cooldown');
  // The glow rises through the buildup and falls in the cooldown, never jumping.
  const glows = [];
  const w = world(9, { opening: 'erupting' });
  run(w.hazards, 30, () => glows.push(w.volcano.glow));
  for (let i = 1; i < glows.length; i++) assert.ok(Math.abs(glows[i] - glows[i - 1]) < 0.08, `step ${i}`);
  assert.ok(Math.max(...glows) > 0.8 && Math.min(...glows) < 0.12);
});

test('dormant periods throw nothing; every eruption throws rocks; the periods run on the simulation clock and hold while the fight is not on', () => {
  const { hazards, volcano } = world(4);
  let thrownWhileDormant = 0;
  const eruptions = [];
  let last = 0;
  let clock = volcano.time;
  run(hazards, 600, () => {
    if (volcano.state === 'dormant' && volcano.thrown > last) thrownWhileDormant++;
    // A new period starts its clock over.
    if (volcano.state === 'erupting' && volcano.time < clock) eruptions.push({ at: last });
    if (volcano.state === 'erupting' && eruptions.length) eruptions.at(-1).end = volcano.thrown;
    last = volcano.thrown;
    clock = volcano.time;
  });
  assert.equal(thrownWhileDormant, 0);
  assert.ok(eruptions.length >= 5, `${eruptions.length} eruptions`);
  for (const e of eruptions.slice(0, -1)) assert.ok(e.end - e.at >= 2, `an eruption threw ${e.end - e.at}`);
  // Held: nothing advances, nothing new is thrown.
  const held = world(4);
  const before = { time: held.volcano.time, state: held.volcano.state };
  run(held.hazards, 30, () => {}, false);
  assert.deepEqual({ time: held.volcano.time, state: held.volcano.state }, before);
  assert.equal(held.volcano.thrown, 0);
});

test('the same seed plays the same volcano and the same rocks; another seed does not', () => {
  const trace = (seed) => {
    const { hazards, volcano } = world(seed);
    const out = [];
    run(hazards, 240, (i) => {
      for (const r of hazards.landed) out.push(`${i}:${r.size}:${r.x.toFixed(4)}`);
    });
    return { history: volcano.history.join(), landed: out };
  };
  const a = trace(77);
  assert.deepEqual(trace(77), a);
  assert.ok(a.landed.length > 10);
  assert.notDeepEqual(trace(78), a);
});

test('the hazards are the same whatever the render rate: the fixed step decides every rock', () => {
  // The Arena's frame loop: fixed steps fed from whatever frame time comes.
  const play = (frameDt) => {
    const { hazards } = world(31);
    const landed = [];
    let acc = 0;
    let stepIndex = 0;
    for (let t = 0; t < 180; t += frameDt) {
      acc += Math.min(frameDt, CONFIG.sim.maxFrameDelta);
      while (acc >= DT) {
        hazards.update(DT);
        for (const r of hazards.landed) landed.push([stepIndex, r.size, r.x]);
        acc -= DT;
        stepIndex++;
      }
      hazards.interpolate(acc / DT);
    }
    return landed.filter(([i]) => i < 60 * 170);
  };
  const at60 = play(1 / 60);
  assert.ok(at60.length > 10);
  assert.deepEqual(play(1 / 30), at60);
  assert.deepEqual(play(1 / 144), at60);
});

test('a restart puts the volcano back at its opening, nothing flying, landing or shown', () => {
  const { stage, hazards, volcano } = world(6);
  run(hazards, 60);
  while (!hazards.rocks.length) hazards.update(DT);
  hazards.reset();
  assert.equal(volcano.state, 'dormant');
  assert.equal(volcano.time, 0);
  assert.deepEqual([hazards.rocks.length, hazards.impacts.length, hazards.landed.length, stage.dangerZones.length], [0, 0, 0, 0]);
  // And a Battle's restart (a rematch) resets it with everything else.
  const { battle } = battleOn();
  battle.setPhase('fight');
  for (let i = 0; i < 60 * 40; i++) battle.update(DT);
  assert.ok(battle.stageHazards.volcano.thrown > 0);
  battle.restart();
  assert.equal(battle.stageHazards.volcano.state, 'dormant');
  assert.deepEqual([battle.stageHazards.rocks.length, battle.stageHazards.impacts.length, battle.stage.dangerZones.length], [0, 0, 0]);
});

// ---- The rocks ------------------------------------------------------------------------

test('both rocks deal exactly 1; the small one has Base Launch 1, the large one 2, straight up', () => {
  assert.deepEqual(Object.keys(VOLCANIC_ROCKS), ['small', 'large']);
  const { small, large } = VOLCANIC_ROCKS;
  assert.deepEqual([small.hit.damage, large.hit.damage], [1, 1]);
  assert.deepEqual([small.hit.baseLaunch, large.hit.baseLaunch], [1, 2]);
  assert.deepEqual([small.hit.directionalLaunch, large.hit.directionalLaunch], ['vertical', 'vertical']);
  assert.ok(large.radius > small.radius && large.size > small.size, 'a large rock is bigger, and so is its warning');
  assert.ok(Object.isFrozen(small.hit) && Object.isFrozen(large.hit));
});

test('a rock\'s hit adds its damage to the Launch Point first, then launches Base Launch x that new Launch Point, with no owner and no credit', () => {
  const stage = new StageCollision(ADAMARIS);
  for (const [size, base] of [['small', 1], ['large', 2]]) {
    const { fighter } = makeFighter({ stage, x: 1500 });
    fighter.combat.launchPoint = 6;
    const combat = new CombatSystem();
    const hazards = new StageHazards(stage, ADAMARIS, { seed: 1 });
    const rock = dropRock(hazards, size, 1500);
    hazards.update(DT);
    assert.deepEqual(hazards.landed, [rock]);
    hazards.resolve([fighter], combat);
    assert.equal(combat.events.length, 1);
    const e = combat.events[0];
    assert.equal(e.type, 'hit');
    assert.deepEqual([e.damage, e.launchPointBefore, e.launchPointAfter], [1, 6, 7]);
    assert.equal(e.baseLaunch, base);
    assert.equal(e.launchStrength, base * 7, 'Base Launch x the updated Launch Point');
    assert.ok(Math.abs(e.finalLaunch.x) < 1e-9 && Math.abs(e.finalLaunch.y + base * 7 * LAUNCH_UNIT_SPEED) < 1e-6, 'straight up');
    assert.equal(fighter.body.vy, e.finalLaunch.y);
    assert.equal(fighter.combat.launchPoint, 7);
    assert.ok(fighter.combat.stun > 0, 'the usual hit reaction');
    // A stage hazard's: nobody's attack, nobody credited.
    assert.equal(e.attacker, null);
    assert.equal(e.attack, false);
    assert.equal(e.source, HAZARD_SOURCE);
    assert.ok(!ATTACK_SOURCES.includes(e.source));
    assert.equal(e.hazard, rock);
    assert.equal(e.projectile, null);
    assert.equal(rock.owner, undefined);
  }
});

test('a rock strikes where it lands, the step it lands: both fighters in its reach, each once; nobody outside it, nobody high above it, nobody for a warning alone', () => {
  const stage = new StageCollision(ADAMARIS);
  const a = makeFighter({ stage, x: 1500 }).fighter;
  const b = makeFighter({ stage, x: 1530, facing: -1 }).fighter;
  const far = makeFighter({ stage, x: 1500 + VOLCANIC_ROCKS.large.radius + 60 }).fighter;
  const high = makeFighter({ stage, x: 1500 }).fighter;
  high.body.y = G - 400;
  const all = [a, b, far, high];
  const combat = new CombatSystem();
  const hazards = new StageHazards(stage, ADAMARIS, { seed: 1 });
  const rock = dropRock(hazards, 'large', 1500);
  rock.age = 0;
  rock.flight = 1.5;
  // Its warning shows for a long while, and strikes nobody.
  let hits = 0;
  for (let i = 0; i < 200; i++) {
    combat.events.length = 0;
    hazards.update(DT);
    hazards.resolve(all, combat);
    hits += combat.events.length;
    if (hazards.landed.length) {
      assert.deepEqual(combat.events.map((e) => e.target).sort((x, y) => x.body.x - y.body.x), [a, b], 'both in reach, nobody else');
    }
  }
  assert.equal(hits, 2, 'one hit per fighter, once');
});

test('a raised Shield blocks a rock like any hit: no Launch Point, no launch', () => {
  const stage = new StageCollision(ADAMARIS);
  const { fighter, step } = makeFighter({ stage, x: 1500 });
  step({ shield: true, shieldPressed: true });
  step({ shield: true });
  assert.equal(fighter.combat.shielding, true);
  const combat = new CombatSystem();
  const hazards = new StageHazards(stage, ADAMARIS, { seed: 1 });
  dropRock(hazards, 'large', 1500);
  hazards.update(DT);
  hazards.resolve([fighter], combat);
  const e = combat.events[0];
  assert.equal(e.type, 'block');
  assert.equal(e.damage, 0);
  assert.equal(fighter.combat.launchPoint, 0);
  assert.equal(e.launchStrength, 0);
  assert.equal(e.attacker, null);
});

test('no Deflect ever turns a rock back: rocks are never projectiles, a live Deflect over one changes nothing, and it lands and strikes as ever', () => {
  const { battle, script } = battleOn();
  battle.setPhase('fight');
  const p1 = battle.p1;
  // Player 1 jumps and Deflects as a rock comes down on it.
  script.held = { jump: true, jumpPressed: true };
  battle.update(DT);
  script.held = { jump: true };
  for (let i = 0; i < 4; i++) battle.update(DT);
  script.held = { shield: true, shieldPressed: true };
  battle.update(DT);
  script.held = {};
  assert.equal(p1.combat.attack?.def.deflectProjectiles, true, 'Deflecting');
  // The rock lands under it next step, its reach up to the Deflecting
  // fighter's body.
  const rock = dropRock(battle.stageHazards, 'large', p1.body.x);
  rock.height = G - p1.body.y + 200;
  const landing = rock.x;
  const deflectedBefore = battle.combat.deflections.length;
  let event = null;
  for (let i = 0; i < 3 && !event; i++) {
    battle.update(DT);
    event = battle.combat.events.find((e) => e.hazard === rock) ?? null;
  }
  assert.ok(event, 'it struck the Deflecting fighter');
  assert.equal(event.type, 'hit');
  assert.equal(event.attacker, null, 'still nobody\'s');
  assert.equal(battle.projectiles.includes(rock), false, 'never a projectile');
  assert.equal(battle.combat.deflections.length, deflectedBefore, 'nothing turned back');
  assert.equal(rock.x, landing, 'its landing never moved');
  assert.equal(battle.stageHazards.rocks.includes(rock), false, 'and it is gone once landed');
});

test('a Battle\'s rocks strike either fighter, CPU or player, the same way; none fly before the fight', () => {
  const { battle } = battleOn({ seed: 12 });
  // The intro: the volcano holds.
  for (let i = 0; i < 60; i++) battle.update(DT);
  assert.equal(battle.phase, 'intro');
  assert.equal(battle.stageHazards.volcano.time, 0);
  battle.setPhase('fight');
  const struck = new Set();
  for (let i = 0; i < 60 * 240 && struck.size < 2; i++) {
    // Keep both fighters standing where rocks fall.
    if (battle.stageHazards.rocks.length) {
      const r = battle.stageHazards.rocks[0];
      for (const f of battle.inPlay) if (f.body.grounded && !f.combat.stun) f.body.x = r.x + (f === battle.p1 ? -10 : 10);
    }
    battle.update(DT);
    for (const e of battle.combat.events) if (e.source === HAZARD_SOURCE && e.type === 'hit') struck.add(e.target.slot);
  }
  assert.deepEqual([...struck].sort(), ['p1', 'p2']);
});

// ---- Warnings and landings --------------------------------------------------------------

test('every rock shows its red warning before it lands, exactly where it lands, at its impact\'s reach, and it goes as the rock lands', () => {
  const { stage, hazards } = world(3);
  const shown = new Map();
  let checked = 0;
  run(hazards, 300, () => {
    for (const z of stage.dangerZones) if (!shown.has(z.id)) shown.set(z.id, { ...z });
    for (const r of hazards.landed) {
      const z = shown.get(r.id);
      assert.ok(z, `${r.id}: warned`);
      assert.equal(z.x, r.x, 'the very place');
      assert.equal(z.radius, r.radius, 'its reach');
      assert.ok(Math.abs(z.timeLeft - r.warning) <= DT + 1e-9, `shown ${z.timeLeft.toFixed(3)} s before`);
      assert.ok(r.warning >= 0.9 && r.warning <= 1.4, 'about a second to react');
      assert.ok(!stage.dangerZones.some((d) => d.id === r.id), 'gone once landed');
      checked++;
    }
    // Never a zone for a rock not yet shown.
    for (const z of stage.dangerZones) {
      const r = hazards.rocks.find((x) => x.id === z.id);
      assert.ok(r && rockWarning(r, false) !== null);
    }
  });
  assert.ok(checked > 20, `${checked} rocks checked`);
});

test('rocks land all over the beach: every fifth of it, never one spot, kept apart when they land together', () => {
  const { hazards } = world(8);
  const xs = [];
  const t = ADAMARIS.hazards[0].targets;
  let close = 0;
  let pairs = 0;
  run(hazards, 900, () => {
    for (const r of hazards.landed) xs.push(r.x);
    if (hazards.landed.length > 1) {
      const [p, q] = hazards.landed;
      pairs++;
      if (Math.abs(p.x - q.x) < p.radius + q.radius) close++;
    }
  });
  assert.ok(xs.length > 80);
  assert.ok(xs.every((x) => x >= t.left && x <= t.right), 'inside the beach\'s combat area');
  assert.ok(t.left >= ADAMARIS.voidBounds.left + 100 && t.right <= ADAMARIS.voidBounds.right - 100, 'never out in the Void');
  const bins = [0, 0, 0, 0, 0];
  for (const x of xs) bins[Math.min(4, Math.floor(((x - t.left) / (t.right - t.left)) * 5))]++;
  for (const [i, n] of bins.entries()) assert.ok(n >= xs.length * 0.08, `region ${i}: ${n} of ${xs.length}`);
  assert.equal(new Set(xs.map((x) => x.toFixed(3))).size, xs.length, 'no landing repeats');
  assert.ok(close <= pairs * 0.1, 'simultaneous rocks keep their circles apart');
});

test('rocks, warnings and impacts all clean up: nothing grows without end', () => {
  const { stage, hazards } = world(2);
  let most = 0;
  run(hazards, 600, () => {
    most = Math.max(most, hazards.rocks.length + hazards.impacts.length);
  });
  assert.ok(most < 30, `at most ${most} at once`);
  // Held until everything has landed and played out.
  run(hazards, 10, () => {}, false);
  assert.deepEqual([hazards.rocks.length, hazards.impacts.length, stage.dangerZones.length], [0, 0, 0]);
});

test('the CPU knows a rock only by its visible warning, never where one will land before it shows', () => {
  const { stage, hazards } = world(5);
  const model = StageModel.of(stage);
  run(hazards, 200, () => {
    const visible = hazards.rocks.filter((r) => rockWarning(r, false) !== null).map((r) => r.id).sort();
    assert.deepEqual(model.dangerZones.map((z) => z.id).sort(), visible);
  });
  // On the continuous beach the CPU's main stage edges are the combat
  // area's, and there are no ledges.
  assert.equal(model.ledges, false);
  assert.deepEqual([model.left, model.right], [ADAMARIS.mainStage.left, ADAMARIS.mainStage.right]);
});

test('a CPU standing in a warning often steps out of it, at every difficulty, but never every time', () => {
  for (const difficulty of ['easy', 'brutal']) {
    let under = 0;
    let out = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sprites = fakeSprites();
      const battle = new Battle({
        canvas: { getContext: () => ({}) }, map: ADAMARIS, mode: 'watch', seed, difficulty,
        p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input: { flush() {}, sample: () => ({}) },
      });
      battle.setPhase('fight');
      const cpu = battle.p2;
      battle.p1.body.x = 900;
      battle.p1.controller = null;
      for (let k = 0; k < 6; k++) {
        // A rock aimed straight at the CPU, its warning showing.
        const rock = dropRock(battle.stageHazards, 'large', cpu.body.x);
        rock.age = 0;
        rock.flight = rock.warning + 0.02;
        let landedFar = null;
        for (let i = 0; i < 120 && landedFar === null; i++) {
          battle.update(DT);
          if (battle.stageHazards.landed.includes(rock)) landedFar = Math.abs(cpu.body.x - rock.x) >= rock.radius + cpu.body.halfW;
        }
        under++;
        if (landedFar) out++;
        for (let i = 0; i < 90; i++) battle.update(DT);
      }
    }
    assert.ok(out > 0, `${difficulty}: steps out sometimes (${out}/${under})`);
    assert.ok(out < under, `${difficulty}: not every time (${out}/${under})`);
  }
});
