// Run with node --test tests/systems/jokull.test.mjs (no dependencies).
// Jökull, the fifth stage: its registration, its sectioned glacier (three
// contiguous sections at one height, crossed with no seam; the centre
// permanent), what counts as a contact on a breakable wing (one per new
// footing, never per step: every kind of landing, a walk across the seam,
// both fighters, never a wall or the underside, never past 15), the damage
// and the break (critical, separating with its collision gone that very
// step, collapsing, destroyed for the match, its pieces falling and
// dropped), the blizzard (exactly 0.25 per check, checks on their own
// interval, its states in order, never overlapping, harmless, seeded and
// frame-rate independent), the CPU's live reading of the stage, rematches
// and respawns, overtime, full matches in Quick Battle and Watch Mode, and
// the theme (every state drawn, every number finite). Real physics,
// Fighter, Battle, CPU and themes; the canvas is a recording stand-in, so
// paint still needs real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMap, stageSlots, voidAround } from '../../js/data/maps.js';
import { StageCollision, createBody, stepBody, resolveSolidOverlap } from '../../js/game/physics.js';
import {
  MAX_ICE_CONTACTS, ICE_SECTION, ICE_SECTION_STATES, ICE_DAMAGE_LEVELS, BLIZZARD_CHANCE, BLIZZARD, WEATHER_STATES, VOLCANIC_ROCKS,
} from '../../js/data/stage-hazards.js';
import { StageHazards, IceSectionController, BlizzardController, iceDamageLevel } from '../../js/game/stage-hazards.js';
import { StageModel } from '../../js/game/ai/cpu-intelligence/stage-model.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { Projectile } from '../../js/game/combat/projectile.js';
import { CONFIG } from '../../js/config.js';
import { def, DT, fakeSprites, makeFighter, steps } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};
const { Battle } = await import('../../js/game/battle.js');
const { createTheme } = await import('../../js/stages/index.js');

const JOKULL = getMap('jokull');
const G = JOKULL.mainStage.top;
const S = ICE_SECTION_STATES;
const W = WEATHER_STATES;
const HALF = def.collider.width / 2;
const [WEST, CENTRE, EAST] = JOKULL.ground.sections;

// Jökull's own little world: its stage and its hazards.
function world(seed = 1, opts = {}) {
  const stage = new StageCollision(JOKULL);
  const hazards = new StageHazards(stage, JOKULL, { seed, ...opts });
  return { stage, hazards, west: hazards.iceFor('jokull-west'), east: hazards.iceFor('jokull-east'), blizzard: hazards.blizzard };
}

// Lifts a fighter `h` world units into the air, falling.
function lift(fighter, h) {
  fighter.body.y -= h;
  fighter.body.grounded = false;
  fighter.body.ground = null;
}

// A fighter on world `w` at x (or `air` units above it, falling), stepped
// with the stage's hazards after it each step, as the Arena does.
function fighterOn(w, x, { air = 0, live = true } = {}) {
  const { fighter, step } = makeFighter({ stage: w.stage, x });
  if (air) lift(fighter, air);
  const tick = (held = {}) => {
    step(held);
    w.hazards.update(DT, { live, fighters: [fighter] });
    return fighter;
  };
  // One update first: the body is seen where it was placed (no landing).
  w.hazards.update(DT, { live, fighters: [fighter] });
  return { fighter, tick };
}

// Ticks until `pred`, at most `limit` steps; the steps taken.
function until(tick, pred, held = {}, limit = 600) {
  for (let i = 1; i <= limit; i++) {
    tick(typeof held === 'function' ? held(i) : held);
    if (pred()) return i;
  }
  return null;
}

// Breaks a wing outright: its remaining contacts, then its whole break.
function breakWing(w, ice) {
  while (ice.state === S.intact) ice.contact(ice.section.x + ice.section.w / 2);
  for (let i = 0; i < 600 && (ice.state !== S.destroyed || ice.debris.length); i++) w.hazards.update(DT);
}

function battleOn({ seed = 5, mode, difficulty = 'medium' } = {}) {
  const sprites = fakeSprites();
  const input = { flush() {}, sample: () => ({}) };
  return new Battle({
    canvas: { getContext: () => ({}) }, map: JOKULL, p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input, seed, mode, difficulty,
  });
}

// A context that checks every number it is handed is finite and counts
// what is painted.
function checkingContext() {
  const counts = { painted: 0, bad: [] };
  const check = (name, args) => {
    for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) counts.bad.push(name);
  };
  return new Proxy(counts, {
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
}

// ---- Registration -------------------------------------------------------------------

test('Jökull is the fifth stage, slot 05, after the four that were there, unchanged', () => {
  assert.deepEqual(MAPS.map((m) => m.id), ['desert', 'city', 'asperitas', 'adamaris', 'jokull']);
  assert.deepEqual(MAPS.slice(0, 4).map((m) => [m.name, m.theme]), [['Yerma', 'desert'], ['Sol-Noir', 'city'], ['Asperitas', 'asperitas'], ['Adamaris', 'adamaris']]);
  const slot = stageSlots()[4];
  assert.equal(slot.num, '05');
  assert.equal(slot.map, JOKULL);
  assert.equal(JOKULL.name, 'Jökull', 'the accented ö kept');
  assert.equal(JOKULL.theme, 'jokull');
  assert.equal(JOKULL.tagline, 'A frozen kingdom on the verge of collapse');
  assert.ok(JOKULL.description.startsWith('An immense glacier suspended above an endless frozen abyss.'));
  assert.deepEqual(JOKULL.traits, [
    ['Terrain', 'Frozen glacier'], ['Platforms', 'Three connected ice sections'], ['Hazards', 'Collapsing ice and blizzards'],
    ['Obstacles', 'None'], ['Light', 'Polar daylight'],
  ]);
  assert.notEqual(JOKULL.ground.type, 'continuous', 'finite: past a broken wing there is only air');
  assert.deepEqual(JOKULL.platforms, []);
  assert.deepEqual(JOKULL.solids, []);
  assert.deepEqual(JOKULL.hazards.map((h) => [h.behavior, h.section ?? null]), [
    ['ice-section', 'jokull-west'], ['ice-section', 'jokull-east'], ['blizzard', null],
  ]);
  for (const reducedMotion of [false, true]) {
    const theme = createTheme(JOKULL, { reducedMotion });
    assert.equal(theme.constructor.name, 'JokullTheme');
    assert.equal(theme.hazards, null, 'no live hazards: whole and calm');
  }
});

test('the durability and the weather are each one named number: 15 contacts, a 0.25 chance per check', () => {
  assert.equal(MAX_ICE_CONTACTS, 15);
  assert.equal(ICE_SECTION.maxContacts, MAX_ICE_CONTACTS);
  assert.equal(BLIZZARD_CHANCE, 0.25);
  assert.equal(BLIZZARD.chance, BLIZZARD_CHANCE);
  const { west, east, blizzard } = world();
  assert.equal(west.max, 15);
  assert.equal(east.max, 15);
  assert.equal(blizzard.chance, 0.25);
  assert.ok(west instanceof IceSectionController && blizzard instanceof BlizzardController);
});

// ---- Geometry -------------------------------------------------------------------------

test('three contiguous sections at one exact height make one glacier; the centre is permanent and both spawns are on it', () => {
  const stage = new StageCollision(JOKULL);
  const [w, c, e] = stage.floors;
  assert.deepEqual(stage.floors.map((f) => f.id), ['jokull-west', 'jokull-centre', 'jokull-east']);
  assert.equal(w.x, JOKULL.mainStage.left);
  assert.equal(w.x + w.w, c.x, 'west meets centre: no gap, no overlap');
  assert.equal(c.x + c.w, e.x, 'centre meets east');
  assert.equal(e.x + e.w, JOKULL.mainStage.right);
  for (const f of stage.floors) {
    assert.equal(f.y, G, `${f.id}: the one height`);
    assert.equal(f.h, JOKULL.mainStage.bottom - G, `${f.id}: its whole block, the same depth`);
  }
  const total = JOKULL.mainStage.right - JOKULL.mainStage.left;
  assert.ok(c.w / total >= 0.6 && c.w / total <= 0.65, `centre ${(c.w / total * 100).toFixed(1)}%`);
  for (const f of [w, e]) assert.ok(f.w / total >= 0.17 && f.w / total <= 0.2, `${f.id} ${(f.w / total * 100).toFixed(1)}%`);
  assert.equal(stage.floor, c, 'the floor is the permanent centre');
  assert.equal(c.breakable, false);
  assert.ok(Object.isFrozen(c), 'nothing can switch it off');
  assert.deepEqual(stage.breakableFloors, [w, e]);
  for (const sp of JOKULL.spawnPoints) assert.ok(sp.x - HALF > c.x && sp.x + HALF < c.x + c.w, `spawn ${sp.x} on the centre`);
  // The Void and the camera are set round the whole glacier as it starts.
  assert.deepEqual({ ...JOKULL.voidBounds }, { ...voidAround(JOKULL.mainStage, { side: 360, top: 800, bottom: 420 }) });
  assert.ok(JOKULL.cameraBounds.left < JOKULL.voidBounds.left && JOKULL.cameraBounds.right > JOKULL.voidBounds.right);
  // A sectioned floor is checked as it is built.
  const bad = (sections) => () => new StageCollision({ ...JOKULL, ground: { type: 'finite', sections } });
  assert.throws(bad([WEST, { ...CENTRE, left: 1370 }, EAST]), /no gap, no overlap/);
  assert.throws(bad([WEST, { ...CENTRE, right: 2230 }, EAST]), /no gap, no overlap/);
  assert.throws(bad([WEST, { ...CENTRE, breakable: true }, EAST]), /centre cannot be breakable/);
  assert.throws(bad([{ ...WEST, right: 2500 }]), /at least two sections/);
  assert.throws(bad([WEST, { ...CENTRE, id: 'jokull-west' }, EAST]), /id of its own/);
  assert.throws(() => new StageCollision({ ...JOKULL, ground: { type: 'continuous', reach: 2000, sections: JOKULL.ground.sections } }), /cannot be divided/);
  assert.throws(() => new StageHazards(stage, { hazards: [{ id: 'x', behavior: 'ice-section', section: 'jokull-centre' }] }), /not a breakable floor section/);
});

test('running, Dashing and jumping across both seams is seamless: never a wall, a step or a lost footing', () => {
  const w = world();
  const { fighter, tick } = fighterOn(w, WEST.left + 30);
  const grounds = [];
  until(tick, () => fighter.body.x > EAST.right - 40, (i) => {
    const b = fighter.body;
    assert.equal(b.grounded, true, `grounded at ${b.x.toFixed(1)}`);
    assert.equal(b.y, G, 'never a step');
    assert.equal(b.wall, 0, 'never a wall');
    assert.equal(b.impactVx, 0);
    if (grounds.at(-1) !== b.ground.id) grounds.push(b.ground.id);
    // A Dash part of the way.
    return i % 40 === 0 ? { runRight: true, mouvementRightPressed: true } : { runRight: true };
  }, 2000);
  assert.deepEqual(grounds, ['jokull-west', 'jokull-centre', 'jokull-east'], 'footing passes from section to section');
  // Its footing passes exactly as its centre crosses each seam.
  const stage = w.stage;
  const body = createBody({ x: WEST.right - 5, y: G, width: 34, height: 80 });
  body.grounded = true;
  body.ground = stage.floorSection('jokull-west');
  body.vx = 60;
  const seen = [];
  for (let i = 0; i < 12; i++) {
    stepBody(body, DT, stage, CONFIG.sim.gravity);
    seen.push([body.x, body.ground.id]);
  }
  for (const [x, id] of seen) assert.equal(id, x < WEST.right ? 'jokull-west' : 'jokull-centre', `at ${x.toFixed(2)}`);
  // A jump that lands right on a seam lands on the section under the centre.
  const { fighter: f2, tick: t2 } = fighterOn(w, CENTRE.right + 2);
  t2({ jump: true, jumpPressed: true });
  until(t2, () => f2.body.grounded, { jump: true });
  assert.equal(f2.body.ground.id, 'jokull-east');
  assert.equal(f2.body.y, G);
});

// ---- Contacts --------------------------------------------------------------------------

test('one landing is one contact; standing, walking, shielding and fighting on the same footing add none', () => {
  const w = world();
  const { fighter, tick } = fighterOn(w, WEST.left + 120);
  assert.equal(w.west.contacts, 0, 'placed there by a spawn: no landing');
  tick({ jump: true, jumpPressed: true });
  until(tick, () => fighter.body.grounded, { jump: true });
  assert.equal(w.west.contacts, 1);
  for (let i = 0; i < steps(5); i++) tick();
  assert.equal(w.west.contacts, 1, 'five seconds standing: still one');
  for (let i = 0; i < steps(0.25); i++) tick({ runLeft: true });
  for (let i = 0; i < steps(0.4); i++) tick({ runRight: true });
  for (let i = 0; i < steps(1); i++) tick({ shield: true, shieldPressed: i === 0 });
  for (let i = 0; i < steps(1.2); i++) tick({ attack1Pressed: i % 20 === 0 });
  assert.equal(fighter.body.ground.id, 'jokull-west');
  assert.equal(w.west.contacts, 1, 'walking, shielding and attacking on it: still one');
  assert.equal(w.east.contacts, 0);
});

test('walking from the centre onto a wing is one entry, as its centre crosses the seam; jittering on the seam adds none', () => {
  const w = world();
  const { fighter, tick } = fighterOn(w, CENTRE.left + 60);
  const at = until(tick, () => w.west.contacts > 0, { runLeft: true });
  assert.ok(at, 'it entered');
  assert.ok(fighter.body.x < WEST.right && fighter.body.x > WEST.right - 10, `counted as its centre crossed (${fighter.body.x.toFixed(1)})`);
  assert.equal(w.west.contacts, 1);
  // Back and forth across the seam, its collider overlapping the wing all along.
  for (let i = 0; i < steps(3); i++) {
    fighter.body.x = WEST.right + 6 * Math.sin(i * 0.9);
    tick();
  }
  assert.equal(w.west.contacts, 1, 'seam jitter: still one');
  // Fully onto the centre, then back: a new entry.
  until(tick, () => fighter.body.x - HALF > WEST.right + 4, { runRight: true });
  until(tick, () => w.west.contacts === 2, { runLeft: true });
  assert.equal(w.west.contacts, 2);
  // The centre never cracks and never counts.
  assert.equal(w.east.contacts, 0);
});

test('every kind of new footing counts: a jump, a higher jump, an air jump, an air dash, a fall from above, a launch, a blizzard landing', () => {
  const landings = {
    jump: (tick, f) => {
      tick({ jump: true, jumpPressed: true });
      until(tick, () => f.body.grounded, {});
    },
    'higher jump': (tick, f) => {
      tick({ jump: true, jumpPressed: true });
      let top = f.body.y;
      until(tick, () => {
        top = Math.min(top, f.body.y);
        return f.body.grounded;
      }, { jump: true });
      assert.ok(G - top > 180, `it rose ${(G - top).toFixed(0)}`);
    },
    'air jump': (tick, f) => {
      tick({ jump: true, jumpPressed: true });
      for (let i = 0; i < 18; i++) tick();
      tick({ jump: true, jumpPressed: true });
      until(tick, () => f.body.grounded, {});
    },
    'air dash': (tick, f) => {
      f.body.x = WEST.left + 20;
      tick({ jump: true, jumpPressed: true });
      for (let i = 0; i < 14; i++) tick();
      tick({ mouvementRightPressed: true });
      assert.ok(f.dash, 'air-dashing');
      until(tick, () => f.body.grounded, { runLeft: true });
    },
    'fall from above': null,
    launch: (tick, f) => {
      const combat = new CombatSystem();
      combat.hazardHit(f, VOLCANIC_ROCKS.large.hit, { x: f.body.x - 60, y: G - 160, w: 120, h: 160 }, { id: 'probe' });
      assert.ok(f.body.vy < 0 || f.combat.hitstop > 0, 'launched');
      until(tick, () => f.body.grounded && f.combat.stun <= 0 && f.combat.hitstop <= 0, {}, 900);
    },
  };
  for (const [kind, land] of Object.entries(landings)) {
    const w = world();
    const x = WEST.left + 150;
    const { fighter, tick } = land ? fighterOn(w, x) : fighterOn(w, x, { air: 300 });
    if (land) land(tick, fighter);
    else until(tick, () => fighter.body.grounded, {});
    assert.equal(fighter.body.ground?.id, 'jokull-west', `${kind}: back on the wing`);
    assert.equal(w.west.contacts, 1, `${kind}: one contact`);
  }
  // During a blizzard, exactly the same.
  const w = world();
  w.blizzard.enter(W.blizzard);
  const { fighter, tick } = fighterOn(w, EAST.left + 100);
  tick({ jump: true, jumpPressed: true });
  until(tick, () => fighter.body.grounded, {});
  assert.equal(w.blizzard.state, W.blizzard);
  assert.equal(w.east.contacts, 1, 'a blizzard landing counts');
});

test('a wall or the underside is never footing: hitting a wing\'s side or its underside counts nothing', () => {
  const w = world();
  // In the air beside the east wing's outer face, below its top, driven into it.
  const side = createBody({ x: EAST.right + 40, y: G + 120, width: 34, height: 80 });
  side.vx = -500;
  let walled = false;
  for (let i = 0; i < 12; i++) {
    stepBody(side, DT, w.stage, 0);
    side.vy = 0;
    walled ||= side.wall !== 0;
    w.hazards.update(DT, { fighters: [{ body: side }] });
  }
  assert.ok(walled, 'it met the wall');
  // Under the west wing, rising into its underside.
  const under = createBody({ x: WEST.left + 100, y: JOKULL.mainStage.bottom + 120, width: 34, height: 80 });
  under.vy = -900;
  let bonked = false;
  for (let i = 0; i < 20; i++) {
    stepBody(under, DT, w.stage, CONFIG.sim.gravity);
    bonked ||= under.bonked;
    w.hazards.update(DT, { fighters: [{ body: under }] });
  }
  assert.ok(bonked, 'it struck the underside');
  assert.deepEqual([w.west.contacts, w.east.contacts], [0, 0]);
});

test('both fighters crack the same wing, on the same step too, never past its 15; the two wings count apart, and the centre never', () => {
  const w = world();
  const a = fighterOn(w, WEST.left + 60, { air: 200 });
  const b = makeFighter({ stage: w.stage, x: WEST.left + 200 });
  lift(b.fighter, 200);
  const both = () => {
    a.fighter.update(DT, { stage: w.stage, gravity: CONFIG.sim.gravity });
    b.step();
    w.hazards.update(DT, { fighters: [a.fighter, b.fighter] });
  };
  w.hazards.update(DT, { fighters: [a.fighter, b.fighter] });
  for (let i = 0; i < 120 && !(a.fighter.body.grounded && b.fighter.body.grounded); i++) both();
  assert.equal(w.west.contacts, 2, 'both landed on the same step: two contacts');
  // 13 more, then both land together on the 14th: only one more counts.
  for (let i = 0; i < 12; i++) w.west.contact(WEST.left + 30);
  assert.equal(w.west.contacts, 14);
  for (const f of [a.fighter, b.fighter]) lift(f, 150);
  for (let i = 0; i < 120 && !(a.fighter.body.grounded && b.fighter.body.grounded); i++) both();
  assert.equal(w.west.contacts, 15, 'never past the maximum');
  assert.equal(w.west.state, S.critical);
  assert.equal(w.west.contact(WEST.left + 30), false, 'a broken wing takes no more');
  // The two wings apart: 12 on one, 3 on the other.
  const v = world();
  for (let i = 0; i < 12; i++) v.west.contact(WEST.left + 20 * i);
  for (let i = 0; i < 3; i++) v.east.contact(EAST.left + 50 * i);
  assert.deepEqual([v.west.contacts, v.east.contacts], [12, 3]);
  assert.equal(ICE_DAMAGE_LEVELS[v.west.level], 'deep');
  assert.equal(ICE_DAMAGE_LEVELS[v.east.level], 'hairline');
  assert.ok(v.west.cracks.length > v.east.cracks.length * 2, 'the west far more cracked');
  // Landings on the centre: nothing anywhere.
  const { fighter, tick } = fighterOn(v, 1800);
  for (let n = 0; n < 5; n++) {
    tick({ jump: true, jumpPressed: true });
    until(tick, () => fighter.body.grounded, {});
  }
  assert.deepEqual([v.west.contacts, v.east.contacts], [12, 3]);
});

test('the damage shows in fifths and builds up: hairline, branching, spreading, deep, unstable, then failure', () => {
  const levels = Array.from({ length: 16 }, (_, n) => ICE_DAMAGE_LEVELS[iceDamageLevel(n, 15)]);
  assert.deepEqual(levels, [
    'intact', 'hairline', 'hairline', 'hairline', 'branching', 'branching', 'branching', 'spreading', 'spreading', 'spreading',
    'deep', 'deep', 'deep', 'unstable', 'unstable', 'failure',
  ]);
  const { west } = world(3);
  let points = 0;
  let front = 0;
  for (let n = 1; n <= 14; n++) {
    const kept = west.cracks.map((c) => c.pts.slice());
    west.contact(WEST.left + 20 + ((n * 37) % 220));
    const now = west.cracks.reduce((sum, c) => sum + c.pts.length, 0);
    assert.ok(now > points, `contact ${n}: more fracture`);
    kept.forEach((pts, i) => assert.deepEqual(west.cracks[i].pts.slice(0, pts.length), pts, `contact ${n}: old cracks kept (only ever extended)`));
    points = now;
    front = west.cracks.filter((c) => c.face === 'front').length;
    assert.equal(west.unstable, n >= 13, `contact ${n}: unstable from 13`);
  }
  assert.ok(front > 0, 'the front face cracks too');
  // The network is the stream's, never redrawn: the same contacts, the same cracks.
  const again = world(3).west;
  for (let n = 1; n <= 14; n++) again.contact(WEST.left + 20 + ((n * 37) % 220));
  assert.deepEqual(again.cracks, west.cracks);
  // Every crack point on the section's own top or face.
  for (const c of west.cracks) {
    for (let i = 0; i < c.pts.length; i += 2) {
      assert.ok(c.pts[i] >= WEST.left && c.pts[i] <= WEST.right);
      if (c.face === 'top') assert.ok(c.pts[i + 1] >= 0 && c.pts[i + 1] <= 1);
      else assert.ok(c.pts[i + 1] >= G && c.pts[i + 1] <= JOKULL.mainStage.bottom + 20);
    }
  }
});

// ---- The break ------------------------------------------------------------------------

test('the 15th contact starts the break: critical (still solid), separating (collision gone that step), collapsing, destroyed for good', () => {
  const w = world(4);
  const ice = w.west;
  for (let i = 0; i < 14; i++) ice.contact(WEST.left + 100);
  assert.equal(ice.state, S.intact, '14: still standing');
  assert.equal(ice.section.active, true);
  ice.contact(WEST.left + 100);
  assert.equal(ice.state, S.critical, 'the 15th: the critical fracture at once');
  const seen = [];
  let collisionOffAt = null;
  let separatingAt = null;
  for (let i = 1; i <= steps(3); i++) {
    w.hazards.update(DT);
    if (seen.at(-1) !== ice.state) seen.push(ice.state);
    if (ice.state === S.separating && separatingAt === null) separatingAt = i;
    if (!ice.section.active && collisionOffAt === null) collisionOffAt = i;
    if (ice.state === S.critical || ice.state === S.intact) assert.equal(ice.section.active, true, 'solid until it separates');
  }
  assert.deepEqual(seen, [S.critical, S.separating, S.collapsing, S.destroyed]);
  assert.equal(collisionOffAt, separatingAt, 'collision gone on the very step it separates');
  assert.equal(separatingAt, Math.round(ICE_SECTION.criticalSeconds / DT));
  assert.deepEqual(ice.history, [S.intact, S.critical, S.separating, S.collapsing, S.destroyed]);
  // Destroyed for the rest of the match: no contact, no regeneration.
  for (let i = 0; i < steps(60); i++) w.hazards.update(DT);
  assert.equal(ice.state, S.destroyed);
  assert.equal(ice.section.active, false);
  assert.equal(ice.contact(WEST.left + 50), false);
  assert.equal(w.east.state, S.intact, 'the other wing untouched');
  assert.equal(w.stage.floor.active, undefined, 'the centre has nothing to switch off');
});

test('its pieces separate, fall and turn, and are all gone once well below the Void', () => {
  const w = world(6);
  const ice = w.east;
  for (let i = 0; i < 15; i++) ice.contact(EAST.left + 60);
  while (ice.state !== S.separating) w.hazards.update(DT);
  const chunks = ice.debris.filter((p) => p.kind === 'chunk');
  assert.equal(chunks.length, ICE_SECTION.columns * 3, 'its whole block in pieces');
  assert.equal(ice.debris.filter((p) => p.kind === 'shard').length, ICE_SECTION.shards);
  // The chunks tile the block: their areas add up to it.
  const area = (poly) => {
    let a = 0;
    for (let k = 0; k < poly.length; k += 2) {
      const j = (k + 2) % poly.length;
      a += poly[k] * poly[j + 1] - poly[j] * poly[k + 1];
    }
    return Math.abs(a) / 2;
  };
  const total = chunks.reduce((sum, p) => sum + area(p.poly), 0);
  const block = EAST.right - EAST.left;
  assert.ok(Math.abs(total / (block * (JOKULL.mainStage.bottom - G)) - 1) < 0.12, `the pieces cover the block (${(total / (block * (JOKULL.mainStage.bottom - G))).toFixed(3)})`);
  const start = chunks.map((p) => [p.x, p.y]);
  for (let i = 0; i < steps(0.6); i++) w.hazards.update(DT);
  chunks.forEach((p, i) => {
    assert.ok(p.y > start[i][1] + 40, 'falling');
    assert.ok(p.x > start[i][0], 'pushed out away from the centre');
  });
  assert.ok(chunks.some((p) => Math.abs(p.a) > 0.1), 'turning');
  let n = 0;
  while ((ice.debris.length || ice.state !== S.destroyed) && n++ < steps(6)) w.hazards.update(DT);
  assert.equal(ice.debris.length, 0, 'every piece dropped');
  assert.equal(ice.state, S.destroyed);
  assert.ok(n * DT < 3, `all gone within ${(n * DT).toFixed(2)} s of separating`);
});

test('whoever stands on a wing as it separates falls (unless the centre they still overlap holds them), and is taken only by the Void', () => {
  const w = world(2);
  const out = fighterOn(w, WEST.left + 80);
  const edge = fighterOn(w, WEST.right - HALF + 6);
  const fighters = [out.fighter, edge.fighter];
  const tickAll = () => {
    for (const f of fighters) f.update(DT, { stage: w.stage, gravity: CONFIG.sim.gravity });
    w.hazards.update(DT, { fighters });
  };
  w.hazards.update(DT, { fighters });
  for (let i = 0; i < 15; i++) w.west.contact(WEST.left + 80);
  while (w.west.state === S.critical) {
    tickAll();
    if (w.west.state === S.critical) assert.equal(out.fighter.body.grounded, true, 'solid through the critical fracture');
  }
  // The step it separated: let go of at once.
  assert.equal(out.fighter.body.grounded, false);
  assert.equal(out.fighter.body.ground, null);
  // The one whose collider still overlapped the centre stands on it, no fall.
  assert.equal(edge.fighter.body.grounded, true);
  assert.equal(edge.fighter.body.ground, w.stage.floor);
  const y0 = out.fighter.body.y;
  let lost = null;
  for (let i = 1; i <= steps(3) && lost === null; i++) {
    tickAll();
    assert.equal(edge.fighter.body.y, G, 'the centre holds');
    if (w.stage.inVoid(out.fighter.body)) lost = i;
    else assert.ok(!out.fighter.body.grounded, 'nothing under it: it falls');
  }
  assert.ok(out.fighter.body.y > y0 + 200, 'it fell into the gap');
  assert.ok(lost !== null && lost > 15, `the Void took it after ${lost} steps of falling, not at once`);
  assert.equal(w.stage.floor.y, G);
});

test('a destroyed section is gone from every query: landing, walls, ceilings, support, shadows, projectiles and the CPU\'s model', () => {
  const w = world();
  breakWing(w, w.west);
  const { stage } = w;
  const west = stage.floorSection('jokull-west');
  const x = WEST.left + 100;
  assert.equal(stage.surfaceBelow(x - HALF, x + HALF, G).ref, null, 'nothing under it');
  assert.equal(stage.supportsAt(x - HALF, x + HALF, G), false);
  assert.equal(stage.solidAcross(WEST.left, WEST.right, G + 100, 80), false, 'no wall where it was');
  // A body dropped onto where it was falls straight through.
  const drop = createBody({ x, y: G - 100, width: 34, height: 80 });
  for (let i = 0; i < 60; i++) stepBody(drop, DT, stage, CONFIG.sim.gravity);
  assert.equal(drop.grounded, false);
  assert.ok(drop.y > G + 200);
  // Across where its block was, below the top: no wall; up through it: no ceiling.
  const across = createBody({ x: WEST.left - 60, y: G + 150, width: 34, height: 80 });
  across.vx = 600;
  for (let i = 0; i < 20; i++) {
    stepBody(across, DT, stage, 0);
    across.vy = 0;
    assert.ok(across.wall === 0 || across.x + across.halfW >= CENTRE.left - 0.5, 'no wall but the centre\'s own face');
  }
  assert.ok(across.x > WEST.left + 100, 'it crossed where the block was');
  const up = createBody({ x, y: JOKULL.mainStage.bottom + 100, width: 34, height: 80 });
  up.vy = -1900;
  for (let i = 0; i < 20; i++) stepBody(up, DT, stage, CONFIG.sim.gravity);
  assert.ok(up.y < G, 'up through where it was: no ceiling');
  // No push out of it either.
  const inside = createBody({ x, y: G + 100, width: 34, height: 80 });
  resolveSolidOverlap(inside, stage);
  assert.equal(inside.x, x);
  // A projectile flies through where it was.
  const shot = { x: WEST.left + 20, y: G + 60, vx: 300, alive: true, age: 0, def: { lifetime: 5 }, hitbox: (o) => Object.assign(o, { x: shot.x - 5, y: shot.y - 5, w: 10, h: 10 }) };
  Projectile.prototype.update.call(Object.assign(shot, { prevX: 0, prevY: 0, prevAge: 0 }), DT, stage);
  assert.equal(shot.alive, true, 'not stopped by ice that is gone');
  // The CPU's model: no surface there, the ledge moved in to the centre's edge.
  const model = StageModel.of(stage);
  assert.ok(!model.surfaces.some((s) => s.ref === west), 'not a surface');
  assert.equal(model.left, CENTRE.left);
  assert.equal(model.right, EAST.right);
  assert.equal(model.supported(x, HALF, G), false);
  assert.equal(model.offstage(x, G, HALF, false), true);
  assert.ok(model.landingTarget(WEST.left + 20, HALF).x > CENTRE.left, 'a recovery aims at the centre');
  assert.ok(model.safeSpot(WEST.left + 10, 40) >= CENTRE.left + 40);
  assert.equal(model.edgeRoom(CENTRE.left + 50, -1), 50);
  assert.equal(model.blocked(WEST.left, CENTRE.left - 1, G + 100, 80), false);
});

// ---- The CPU's reading of it -----------------------------------------------------------------

test('the CPU reads the wings live: whole, then unstable (a danger zone it can see), breaking, gone; and never the next blizzard', () => {
  const w = world(8);
  const model = StageModel.of(w.stage);
  const westSurface = () => model.surfaces.find((s) => s.ref.id === 'jokull-west');
  assert.deepEqual([model.left, model.right], [WEST.left, EAST.right], 'both wings are footing');
  assert.equal(model.surfaces.filter((s) => s.main).length, 3);
  assert.equal(westSurface().integrity, 1);
  for (let i = 0; i < 12; i++) w.west.contact(WEST.left + 50);
  w.hazards.update(DT);
  assert.equal(westSurface().damage, ICE_DAMAGE_LEVELS.indexOf('deep'));
  assert.equal(westSurface().unstable, false);
  assert.equal(model.dangerZones.length, 0, 'deep cracks, not yet a warning: the CPU still fights there');
  w.west.contact(WEST.left + 50);
  w.hazards.update(DT);
  assert.equal(westSurface().unstable, true);
  const zone = model.dangerZones.find((z) => z.kind === 'ice');
  assert.ok(zone, 'critically unstable: a danger zone over the wing');
  assert.equal(zone.x, (WEST.left + WEST.right) / 2);
  assert.equal(zone.radius, (WEST.right - WEST.left) / 2);
  assert.equal(model.dangerAt(WEST.left + 30, HALF), zone);
  assert.equal(model.dangerAt(1800, HALF), null, 'never over the centre\'s middle');
  w.west.contact(WEST.left + 50);
  w.west.contact(WEST.left + 50);
  w.hazards.update(DT);
  assert.equal(w.west.state, S.critical);
  assert.equal(model.left, CENTRE.left, 'a wing visibly breaking is no footing to count on');
  assert.ok(model.dangerZones.some((z) => z.id.endsWith(':critical')));
  breakWing(w, w.west);
  assert.equal(model.dangerZones.length, 0);
  assert.ok(!westSurface());
  // The weather is never in what the CPU reads.
  assert.ok(!Object.keys(model).some((k) => /blizzard|weather/i.test(k)));
});

test('a CPU standing on a wing that turns critically unstable steps off it onto the centre, as its level reads the stage', () => {
  let off = 0;
  const tries = 6;
  for (let seed = 1; seed <= tries; seed++) {
    const battle = battleOn({ seed, difficulty: 'brutal', mode: 'quick-battle' });
    battle.p1.controller = { getInput: () => ({}) };
    battle.setPhase('fight');
    battle.p1.body.x = EAST.left + 200;
    battle.p2.body.x = WEST.left + 70;
    for (let i = 0; i < 20; i++) battle.update(DT);
    const ice = battle.stageHazards.iceFor('jokull-west');
    while (ice.contacts < 13) ice.contact(WEST.left + 70);
    let stepped = false;
    for (let i = 0; i < steps(2.5) && !stepped; i++) {
      battle.update(DT);
      const b = battle.p2.body;
      if (b.grounded && b.ground === battle.stage.floor && b.x - b.halfW > WEST.right) stepped = true;
    }
    if (stepped) off++;
  }
  assert.ok(off >= tries / 2, `Brutal stepped off ${off} of ${tries}`);
});

// ---- The blizzard -------------------------------------------------------------------

// The weather alone, run `seconds` of fixed steps, recording each check's
// time and outcome.
function weather(seed, seconds = 600, opts = {}) {
  const w = world(seed, opts);
  const b = w.blizzard;
  const checks = [];
  let t = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const before = b.checks;
    const state = b.state;
    w.hazards.update(DT);
    t += DT;
    if (b.checks > before) checks.push({ t, storm: b.outcomes.at(-1), from: state });
  }
  return { b, checks };
}

test('the weather checks on its own interval, never every step: after its opening calm, then 12–18 s apart while calm', () => {
  const { b, checks } = weather(11, 900);
  assert.ok(checks.length > 30, `${checks.length} checks`);
  assert.ok(checks[0].t >= BLIZZARD.openingCalmSeconds[0] - DT && checks[0].t <= BLIZZARD.openingCalmSeconds[1] + DT, `the first at ${checks[0].t.toFixed(2)} s`);
  const storm = BLIZZARD.warningSeconds[0] + BLIZZARD.blizzardSeconds[0] + BLIZZARD.clearingSeconds[0];
  for (let i = 1; i < checks.length; i++) {
    const gap = checks[i].t - checks[i - 1].t;
    assert.equal(checks[i].from, W.calm, 'only calm weather checks');
    if (checks[i - 1].storm) assert.ok(gap >= storm + BLIZZARD.checkSeconds[0] - DT, `after a storm: ${gap.toFixed(2)} s`);
    else assert.ok(gap >= BLIZZARD.checkSeconds[0] - DT && gap <= BLIZZARD.checkSeconds[1] + DT, `between checks: ${gap.toFixed(2)} s`);
  }
  assert.equal(b.checks, checks.length);
});

test('one check in four starts a blizzard: exactly 0.25 per check, a failed one leaving it calm, never forced either way', () => {
  let storms = 0;
  let total = 0;
  const runs = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const { checks } = weather(seed, 1200);
    for (const c of checks) {
      total++;
      if (c.storm) storms++;
    }
    const pattern = checks.map((c) => (c.storm ? 'B' : '-')).join('');
    for (const run of ['--', 'BB', '-B-', 'B-B']) if (pattern.includes(run)) runs.add(run);
  }
  const share = storms / total;
  assert.ok(total > 2000, `${total} checks`);
  assert.ok(Math.abs(share - 0.25) < 0.025, `storms on ${(share * 100).toFixed(1)}% of checks`);
  assert.deepEqual([...runs].sort(), ['--', '-B-', 'B-B', 'BB'].sort(), 'no alternation: calm after calm, storm after storm');
});

test('a storm runs warning, blizzard, clearing, back to calm, each for its own while, and two never overlap', () => {
  const w = world(13);
  const b = w.blizzard;
  const spans = [];
  let cur = null;
  for (let i = 0; i < steps(900); i++) {
    w.hazards.update(DT);
    if (!cur || cur.state !== b.state) {
      if (cur) spans.push(cur);
      cur = { state: b.state, steps: 0 };
    }
    cur.steps++;
    if (b.state === W.blizzard) assert.equal(b.intensity, 1);
    if (b.state === W.calm) assert.equal(b.intensity, 0);
  }
  const order = { calm: 'warning', warning: 'blizzard', blizzard: 'clearing', clearing: 'calm' };
  for (let i = 1; i < spans.length; i++) assert.equal(spans[i].state, order[spans[i - 1].state], 'always in order: no overlap, no skip');
  const range = { warning: BLIZZARD.warningSeconds, blizzard: BLIZZARD.blizzardSeconds, clearing: BLIZZARD.clearingSeconds };
  for (const s of spans.slice(1)) {
    if (!range[s.state]) continue;
    const secs = s.steps * DT;
    assert.ok(secs >= range[s.state][0] - 2 * DT && secs <= range[s.state][1] + 2 * DT, `${s.state} ${secs.toFixed(2)} s`);
  }
  assert.ok(spans.some((s) => s.state === W.blizzard), 'it stormed');
  assert.ok(b.storms > 3);
  // The whiteout builds and clears gradually, never in one jump.
  const w2 = world(13);
  const series = [];
  for (let i = 0; i < steps(400); i++) {
    w2.hazards.update(DT);
    series.push(w2.blizzard.intensity);
  }
  for (let i = 1; i < series.length; i++) assert.ok(Math.abs(series[i] - series[i - 1]) < 0.04, `step ${i}`);
});

test('the blizzard touches nothing in play: no damage, Launch Point, stun or push, and the ice cracks and breaks through it as ever', () => {
  const battle = battleOn({ seed: 3 });
  battle.p1.controller = null;
  battle.p2.controller = null;
  battle.setPhase('fight');
  const b = battle.stageHazards.blizzard;
  b.enter(W.warning);
  const before = battle.fighters.map((f) => [f.body.x, f.body.y, f.combat.launchPoint, f.combat.energy]);
  let events = 0;
  for (let i = 0; i < steps(12) && b.state !== W.calm; i++) {
    battle.update(DT);
    events += battle.combat.events.length;
  }
  assert.equal(events, 0, 'no hit of any kind');
  assert.deepEqual(battle.fighters.map((f) => [f.body.x, f.body.y, f.combat.launchPoint, f.combat.energy]), before, 'nobody moved, hurt or stunned');
  assert.deepEqual(battle.stageHazards.iceSections.map((c) => c.contacts), [0, 0], 'the ice untouched by the weather');
  // And through a blizzard the ice still breaks.
  b.enter(W.blizzard);
  const ice = battle.stageHazards.iceFor('jokull-east');
  for (let i = 0; i < 15; i++) ice.contact(EAST.left + 40);
  for (let i = 0; i < steps(2); i++) battle.update(DT);
  assert.equal(ice.state, S.destroyed);
  assert.equal(ice.section.active, false);
});

test('the weather and the ice are seeded and fixed-step: the same seed the same match, at 30, 60 or 144 frames a second', () => {
  const a = weather(21, 300);
  const b = weather(21, 300);
  assert.deepEqual(a.checks, b.checks);
  assert.deepEqual(a.b.history, b.b.history);
  assert.notDeepEqual(weather(22, 300).checks, a.checks, 'another seed, another sky');
  const trace = (fps) => {
    const battle = battleOn({ seed: 77, mode: 'watch', difficulty: 'hard' });
    battle.setPhase('fight');
    const log = [];
    const update = battle.update.bind(battle);
    battle.update = (dt) => {
      update(dt);
      const h = battle.stageHazards;
      log.push(`${h.blizzard.state}:${h.blizzard.checks}|${h.iceSections.map((c) => `${c.contacts}:${c.state}`).join(',')}|${battle.p1.body.x.toFixed(4)}`);
    };
    const frame = 1 / fps;
    for (let t = 0; t < 40; t += frame) battle.frame(frame);
    return log;
  };
  const x = trace(30);
  const y = trace(60);
  const z = trace(144);
  // (A lethal launch's slow motion feeds fewer steps in the same time, at
  // any frame rate: the steps themselves must match.)
  const n = Math.min(x.length, y.length, z.length);
  assert.ok(n > 60 * 25, `${n} steps compared`);
  assert.deepEqual(x.slice(0, n), y.slice(0, n));
  assert.deepEqual(y.slice(0, n), z.slice(0, n));
});

// ---- Match lifecycle ------------------------------------------------------------------------

test('a respawn keeps the stage as it is; a rematch builds it whole again, calm, nothing falling', () => {
  const battle = battleOn({ seed: 9 });
  battle.p1.controller = null;
  battle.p2.controller = null;
  battle.setPhase('fight');
  const h = battle.stageHazards;
  const west = h.iceFor('jokull-west');
  const east = h.iceFor('jokull-east');
  for (let i = 0; i < 15; i++) west.contact(WEST.left + 40);
  for (let i = 0; i < 6; i++) east.contact(EAST.left + 40);
  h.blizzard.enter(W.blizzard);
  for (let i = 0; i < steps(0.5); i++) battle.update(DT);
  // A fall and a respawn: the stage as it was.
  battle.p2.body.x = JOKULL.voidBounds.left - 50;
  battle.update(DT);
  assert.equal(battle.p2.lostToVoid, true);
  for (let i = 0; i < steps(CONFIG.battle.respawnSeconds + 0.5); i++) battle.update(DT);
  assert.equal(battle.p2.lostToVoid, false, 'respawned');
  assert.equal(west.state, S.destroyed, 'still gone');
  assert.equal(west.section.active, false);
  assert.equal(east.contacts, 6, 'its cracks kept');
  // The rematch.
  battle.restart();
  for (const c of h.iceSections) {
    assert.equal(c.state, S.intact);
    assert.equal(c.contacts, 0);
    assert.equal(c.section.active, true);
    assert.deepEqual([c.cracks.length, c.debris.length, c.impacts.length], [0, 0, 0]);
  }
  assert.equal(h.blizzard.state, W.calm);
  assert.equal(h.blizzard.intensity, 0);
  assert.deepEqual(battle.stage.dangerZones, []);
  // A new battle, its own stage: nothing of this one.
  const other = battleOn({ seed: 9 });
  assert.notEqual(other.stage, battle.stage);
  assert.ok(other.stageHazards.iceSections.every((c) => c.state === S.intact && c.contacts === 0));
});

test('overtime closes the Void round the glacier with both wings or neither: the centre stays wholly inside', () => {
  for (const broken of [false, true]) {
    const battle = battleOn({ seed: 4 });
    battle.setPhase('fight');
    if (broken) for (const c of battle.stageHazards.iceSections) {
      for (let i = 0; i < 15; i++) c.contact(c.section.x + 30);
    }
    for (let i = 0; i < steps(2.5); i++) battle.update(DT);
    battle.setVoidPressure(1);
    const v = battle.stage.void;
    const { sideEndGap, bottomEndGap } = CONFIG.battle.overtimeVoid;
    assert.deepEqual({ ...v }, { left: JOKULL.mainStage.left - sideEndGap, right: JOKULL.mainStage.right + sideEndGap, top: JOKULL.voidBounds.top, bottom: G + bottomEndGap });
    assert.ok(v.left < CENTRE.left && v.right > CENTRE.right, 'the centre wholly inside');
    // Standing anywhere on the centre is safe.
    for (const x of [CENTRE.left + HALF, 1800, CENTRE.right - HALF]) assert.equal(battle.stage.inVoid({ x, y: G, height: 80 }), false);
  }
});

// ---- Full matches -------------------------------------------------------------------------

test('Quick Battle and Watch Mode play full matches on Jökull: the CPUs fight on the wings while they last, the ice breaks, nobody stands on missing ice', () => {
  let contacts = 0;
  let broken = 0;
  for (const [mode, seed, difficulty] of [['watch', 4, 'medium'], ['watch', 9, 'brutal'], ['quick-battle', 21, 'hard']]) {
    const battle = battleOn({ mode, seed, difficulty });
    if (mode === 'quick-battle') battle.p1.controller = null;
    battle.setPhase('fight');
    for (let i = 0; i < steps(300) && battle.phase === 'fight'; i++) {
      battle.update(DT);
      for (const f of battle.inPlay) {
        assert.ok(Number.isFinite(f.body.x) && Number.isFinite(f.body.y), `${mode}: finite`);
        if (f.body.grounded) {
          assert.notEqual(f.body.ground.active, false, `${mode}: never standing on ice that is gone`);
          if (f.body.ground.kind === 'floor') assert.equal(f.body.y, G);
        }
      }
    }
    assert.notEqual(battle.phase, 'fight', `${mode}: the match ended`);
    // Both CPUs of a Watch match share one stage and one weather.
    assert.equal(battle.p1.stage, battle.p2.stage);
    contacts += battle.stageHazards.iceSections.reduce((sum, c) => sum + c.contacts, 0);
    broken += battle.stageHazards.iceSections.filter((c) => c.state !== S.intact).length;
  }
  assert.ok(contacts > 20, `the wings were fought on (${contacts} contacts)`);
  assert.ok(broken > 0, 'and broke');
});

test('with both wings gone the CPUs fight on the centre alone, recover to it, and the match still ends', () => {
  const battle = battleOn({ mode: 'watch', seed: 12, difficulty: 'hard' });
  battle.setPhase('fight');
  for (const c of battle.stageHazards.iceSections) for (let i = 0; i < 15; i++) c.contact(c.section.x + 30);
  for (let i = 0; i < steps(300) && battle.phase === 'fight'; i++) {
    battle.update(DT);
    for (const f of battle.inPlay) if (f.body.grounded && f.body.ground.kind === 'floor') assert.equal(f.body.ground, battle.stage.floor, 'only the centre');
  }
  assert.notEqual(battle.phase, 'fight');
});

// ---- The theme -------------------------------------------------------------------------

test('the theme draws every state of the glacier and the weather, live and still, every number finite', () => {
  const view = { scale: 1.1, w: 1600, h: 860, pxW: 1760, pxH: 946, dpr: 2, x: 1000, y: G - 602 };
  const states = {
    'both intact': () => {},
    'one damaged': (w) => { for (let i = 0; i < 5; i++) w.west.contact(WEST.left + 40 * i); },
    'two levels': (w) => {
      for (let i = 0; i < 12; i++) w.west.contact(WEST.left + 20 * i);
      for (let i = 0; i < 3; i++) w.east.contact(EAST.left + 60 * i);
    },
    critical: (w) => { for (let i = 0; i < 15; i++) w.west.contact(WEST.left + 30); },
    breaking: (w) => {
      for (let i = 0; i < 15; i++) w.east.contact(EAST.left + 30);
      for (let i = 0; i < steps(0.5); i++) w.hazards.update(DT);
    },
    'one gone': (w) => breakWing(w, w.west),
    'both gone': (w) => {
      breakWing(w, w.west);
      breakWing(w, w.east);
    },
    blizzard: (w) => {
      for (let i = 0; i < 14; i++) w.east.contact(EAST.left + 30);
      w.blizzard.enter(W.blizzard);
      for (let i = 0; i < 30; i++) w.hazards.update(DT);
    },
  };
  for (const reducedMotion of [false, true]) {
    for (const [name, setup] of Object.entries(states)) {
      const w = world(5);
      setup(w);
      w.hazards.interpolate(0.5);
      const theme = createTheme(JOKULL, { reducedMotion, hazards: w.hazards });
      const state = JSON.stringify(w.hazards.iceSections.map((c) => [c.state, c.contacts, c.cracks, c.debris.map((p) => [p.x, p.y])]));
      const ctx = checkingContext();
      for (const x of [700, 1000, 1500, 2200]) {
        const v = { ...view, ctx, x };
        theme.prepare(v);
        theme.update(1 / 60, v);
        theme.drawBackground(ctx, v);
        theme.drawTerrain(ctx, v);
        theme.drawForeground(ctx, v);
        theme.drawVoid(ctx, v, w.stage.void, []);
      }
      assert.deepEqual(ctx.bad, [], `${name}, ${reducedMotion ? 'reduced' : 'full'} motion: finite`);
      assert.ok(ctx.painted > 150, `${name}: a full scene (${ctx.painted})`);
      assert.equal(JSON.stringify(w.hazards.iceSections.map((c) => [c.state, c.contacts, c.cracks, c.debris.map((p) => [p.x, p.y])])), state, `${name}: drawing changes nothing`);
    }
  }
  // Without live hazards (a roster thumbnail): whole and calm.
  const ctx = checkingContext();
  const theme = createTheme(JOKULL, { reducedMotion: true });
  const v = { ...view, ctx };
  theme.prepare(v);
  theme.update(1 / 60, v);
  theme.drawBackground(ctx, v);
  theme.drawTerrain(ctx, v);
  theme.drawForeground(ctx, v);
  assert.deepEqual(ctx.bad, []);
  assert.equal(theme.storm, 0);
  assert.ok(theme.sections.every((sec) => theme.controllerOf(sec) === null && theme.standing(null)));
});

test('the theme reads the ice where it is: a wing\'s cracks and pieces are its controller\'s, the storm the weather\'s', () => {
  const w = world(2);
  const theme = createTheme(JOKULL, { hazards: w.hazards });
  const [west, , east] = theme.sections;
  assert.equal(theme.controllerOf(west), w.west);
  assert.equal(theme.controllerOf(east), w.east);
  assert.equal(theme.controllerOf(theme.sections[1]), null, 'the centre has none');
  w.blizzard.enter(W.blizzard);
  w.hazards.update(DT);
  w.hazards.interpolate(1);
  assert.equal(theme.storm, 1);
  assert.ok(theme.wind > 1.5, 'the wind rises with it');
  // With reduced motion nothing shakes, whatever the ice does.
  const still = createTheme(JOKULL, { hazards: w.hazards, reducedMotion: true });
  for (let i = 0; i < 15; i++) w.west.contact(WEST.left + 40);
  assert.equal(still.shakeOf(w.west), 0);
  theme.update(0.37, { w: 0 });
  assert.notEqual(theme.shakeOf(w.west), 0, 'a full-motion theme shakes it');
});

test('a preview\'s demonstration runs in its own world: the wings crack, break and form again there, and a battle never sees any of it', () => {
  const battle = battleOn({ seed: 2 });
  const preview = world(2, { opening: 'erupting', demo: true });
  const seen = new Set();
  let storm = false;
  let rebuilt = false;
  for (let i = 0; i < steps(60); i++) {
    preview.hazards.update(DT);
    for (const c of preview.hazards.iceSections) {
      if (seen.has(`${c.id}:destroyed`) && c.state === S.intact) rebuilt = true;
      seen.add(`${c.id}:${c.state}`);
    }
    storm ||= preview.blizzard.state === W.blizzard;
  }
  for (const id of ['jokull-west-ice', 'jokull-east-ice']) {
    for (const state of Object.values(S)) assert.ok(seen.has(`${id}:${state}`), `${id} ${state}`);
  }
  assert.ok(rebuilt, 'the preview (only) builds a broken wing again');
  assert.ok(storm, 'and shows a blizzard');
  assert.ok(battle.stageHazards.iceSections.every((c) => c.state === S.intact && c.contacts === 0 && c.section.active));
  assert.equal(battle.stageHazards.blizzard.state, W.calm);
  assert.equal(battle.stageHazards.iceSections.some((c) => c.demo), false, 'a battle never demonstrates');
});
