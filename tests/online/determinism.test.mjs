// Run with node --test tests/online/determinism.test.mjs (no dependencies).
// Online Play stands on one fact: two Battles built from the same seed and
// fed the same inputs step for step stay identical, every number, for the
// whole match. Here two real Battles (mode 'online') run side by side for
// thousands of steps with scripted inputs on both sides (every control:
// runs, jumps and Super Jumps, Down, the Shield and the Deflect, Dashes,
// every attack button, bursts of presses for the Mash Combo), for every
// playable fighter and on every stage, their hashes (js/online/state-hash.js)
// compared every 60 steps; then whole matches through the real lockstep
// (js/online/lockstep.js) over a lossy, uneven link; and a planted
// difference of a billionth is caught as a desync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { MAPS } from '../../js/data/maps.js';
import { CONFIG } from '../../js/config.js';
import { playableCharacters } from '../../js/data/characters.js';
import { LockstepSession } from '../../js/online/lockstep.js';
import { encodeFrame, decodeFrame, blankFrame } from '../../js/online/input-frame.js';
import { memoryTransportPair } from '../../js/online/transport.js';
import { battleHash, battleState } from '../../js/online/state-hash.js';
import { mulberry32 } from '../../js/core/utils.js';
import { fakeSpritesOf } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class { constructor() { return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) }); } };

const STEP = CONFIG.sim.step;
const STEPS = 6000;
const FIGHTERS = playableCharacters();

// A scripted player: held controls changing every so often, presses of
// every button, Down with Jump for the Super Jump, Dashes, and now and then
// five quick presses of one attack (a Mash Combo's start).
function player(seed) {
  const rnd = mulberry32(seed);
  let held = {};
  let burst = null;
  return (step) => {
    if (rnd() < 0.08) {
      held = {
        runLeft: rnd() < 0.3, runRight: rnd() < 0.3, down: rnd() < 0.12, jump: rnd() < 0.12, shield: rnd() < 0.1,
        attack1: rnd() < 0.1, attack2: rnd() < 0.08, extra_attack: rnd() < 0.05,
      };
    }
    const f = { ...held };
    for (const control of ['jump', 'shield', 'down', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']) {
      if (rnd() < 0.035) f[`${control}Pressed`] = f[control] = true;
    }
    if (rnd() < 0.01) f.down = f.downPressed = f.jumpPressed = f.jump = true;
    if (rnd() < 0.015) f.mouvementLeftPressed = true;
    else if (rnd() < 0.015) f.mouvementRightPressed = true;
    if (!burst && rnd() < 0.004) burst = { control: rnd() < 0.5 ? 'attack1' : 'attack2', until: step + 20 };
    if (burst) {
      if (step % 4 === 0) f[`${burst.control}Pressed`] = f[burst.control] = true;
      if (step >= burst.until) burst = null;
    }
    // Where a controller's presses were made for, as a pad would say.
    if (rnd() < 0.2) f.pressedOnGround = true;
    return f;
  };
}

// A channel playing a fixed list of frames, step by step (the same object
// shape a LockstepChannel hands its PlayerController).
class ScriptChannel {
  constructor(frames, clock) {
    this.frames = frames;
    this.clock = clock;
    this.out = blankFrame();
  }

  sample() {
    return decodeFrame(this.frames[this.clock.step] ?? 0, this.out);
  }

  flush() {}
}

function battle({ map, p1, p2, seed, input }) {
  return new Battle({
    canvas: { getContext: () => ({}) }, map, mode: 'online', seed, p1Def: p1, p2Def: p2,
    p1Sprites: fakeSpritesOf(p1), p2Sprites: fakeSpritesOf(p2), input,
    automaticTurnAround: { p1: true, p2: seed % 2 === 0 }, labels: { p1: 'Ann', p2: 'Bob' },
  });
}

// Two Battles, the same seed and the same frames: their hashes every 60
// steps (and the last).
function sideBySide({ map, p1, p2, seed, steps = STEPS }) {
  const frames = { p1: [], p2: [] };
  const a = player(seed * 2 + 1);
  const b = player(seed * 2 + 2);
  for (let s = 0; s < steps; s++) {
    frames.p1.push(encodeFrame(a(s)));
    frames.p2.push(encodeFrame(b(s)));
  }
  const runs = [0, 1].map(() => {
    const clock = { step: 0 };
    const channels = { p1: new ScriptChannel(frames.p1, clock), p2: new ScriptChannel(frames.p2, clock) };
    const input = { player: (slot) => channels[slot], flush() {}, sample: () => blankFrame() };
    return { clock, battle: battle({ map, p1, p2, seed, input }), hashes: [] };
  });
  for (let s = 0; s < steps; s++) {
    for (const run of runs) {
      run.clock.step = s;
      run.battle.update(STEP);
      if ((s + 1) % 60 === 0 || s === steps - 1) run.hashes.push(battleHash(run.battle));
    }
  }
  return runs;
}

// Every playable fighter on each side once, and every stage: each fighter
// against the next, on the stages in turn.
const MATCHUPS = Array.from({ length: Math.max(FIGHTERS.length, MAPS.length) }, (_, i) => ({
  p1: FIGHTERS[i % FIGHTERS.length],
  p2: FIGHTERS[(i + 1) % FIGHTERS.length],
  map: MAPS[i % MAPS.length],
  seed: 1000 + i * 37,
}));

test('the matchups cover every playable fighter, on both sides, and every stage', () => {
  assert.ok(FIGHTERS.length >= 2);
  for (const f of FIGHTERS) {
    assert.ok(MATCHUPS.some((m) => m.p1 === f), `#${f.id} as p1`);
    assert.ok(MATCHUPS.some((m) => m.p2 === f), `#${f.id} as p2`);
  }
  for (const map of MAPS) assert.ok(MATCHUPS.some((m) => m.map === map), map.id);
});

for (const { p1, p2, map, seed } of MATCHUPS) {
  test(`two Battles side by side stay identical for ${STEPS} steps: #${p1.id} v #${p2.id} on ${map.id}`, () => {
    const [x, y] = sideBySide({ map, p1, p2, seed });
    assert.equal(x.hashes.length, Math.ceil(STEPS / 60));
    for (let i = 0; i < x.hashes.length; i++) {
      if (x.hashes[i] !== y.hashes[i]) {
        assert.fail(`diverged by step ${(i + 1) * 60}: ${JSON.stringify(battleState(x.battle))} vs ${JSON.stringify(battleState(y.battle))}`);
      }
    }
    // Something happened: the fighters moved and fought (no hash of a
    // frozen world proves anything). A match may end early, its world then
    // still for a while: the hashes still change many times over.
    const state = battleState(x.battle);
    assert.ok(state.elapsed > 30 || x.battle.matchOver, 'the fight ran');
    assert.ok(new Set(x.hashes).size > 25, `the world kept changing (${new Set(x.hashes).size} different hashes)`);
    // And fought: hits landed both ways and points were scored.
    const stats = x.battle.stats.snapshot(x.battle.score);
    assert.ok(stats.p1.damageDealt > 0 && stats.p2.damageDealt > 0, 'both sides landed hits');
    assert.ok(x.battle.score.p1 + x.battle.score.p2 > 0, 'falls into the Void scored');
  });
}

// Two browsers through the real lockstep, every packet at risk: the
// lockstep's own checks never fire, and the test's own hashes agree.
function networked({ p1, p2, map, seed, steps = 2400, loss = 0.15 }) {
  const rnd = mulberry32(seed);
  const pair = memoryTransportPair({ drop: () => rnd() < loss });
  const clock = { now: 0 };
  const sides = {};
  for (const [slot, transport, script] of [['p1', pair.a, player(seed + 5)], ['p2', pair.b, player(seed + 6)]]) {
    let n = 0;
    const session = new LockstepSession({ transport, localSlot: slot, clock: () => clock.now, sampleLocal: () => script(n++) });
    const b = battle({ map, p1, p2, seed, input: session.input });
    session.attach(b);
    const hashes = new Map();
    const update = b.update.bind(b);
    b.update = (dt) => {
      update(dt);
      if ((session.current + 1) % 60 === 0) hashes.set(session.current, battleHash(b));
    };
    const ends = [];
    session.on((type, detail) => {
      if (type === 'end') ends.push(detail.reason);
    });
    sides[slot] = { session, battle: b, hashes, ends };
  }
  for (let i = 0; sides.p1.session.next < steps || sides.p2.session.next < steps; i++) {
    clock.now += 1000 / 60;
    // Uneven frames: one side a little slower, both now and then late.
    sides.p1.session.advance(STEP * (0.8 + rnd() * 0.5));
    sides.p2.session.advance(STEP * (i % 30 === 0 ? 4 : 0.95 + rnd() * 0.1));
    // The network delivers most frames at once and holds some back.
    if (rnd() < 0.85) pair.deliver();
    if (i > steps * 4) assert.fail('the match stopped advancing');
  }
  return sides;
}

for (const { p1, p2, map, seed } of MATCHUPS.slice(0, 3)) {
  test(`through the lockstep over a lossy, uneven link: #${p1.id} v #${p2.id} on ${map.id}, no desync and the same hashes`, () => {
    const { p1: a, p2: b } = networked({ p1, p2, map, seed });
    assert.deepEqual(a.ends, []);
    assert.deepEqual(b.ends, []);
    let compared = 0;
    for (const [step, hash] of a.hashes) {
      if (!b.hashes.has(step)) continue;
      assert.equal(hash, b.hashes.get(step), `step ${step}`);
      compared++;
    }
    assert.ok(compared >= 35, `compared ${compared} checkpoints`);
  });
}

test('a difference of a billionth is caught at the next checkpoint: both sides end the match as a desync', () => {
  const { p1, p2, map, seed } = MATCHUPS[0];
  const pair = memoryTransportPair();
  const clock = { now: 0 };
  const sides = {};
  for (const [slot, transport] of [['p1', pair.a], ['p2', pair.b]]) {
    const script = player(seed + (slot === 'p1' ? 1 : 2));
    let n = 0;
    const session = new LockstepSession({ transport, localSlot: slot, clock: () => clock.now, sampleLocal: () => script(n++) });
    const b = battle({ map, p1, p2, seed, input: session.input });
    session.attach(b);
    const ends = [];
    session.on((type, detail) => {
      if (type === 'end') ends.push(detail);
    });
    sides[slot] = { session, battle: b, ends };
  }
  let planted = null;
  for (let i = 0; i < 1200 && !(sides.p1.ends.length && sides.p2.ends.length); i++) {
    clock.now += 1000 / 60;
    for (const side of Object.values(sides)) side.session.advance(STEP);
    pair.deliver();
    if (planted === null && sides.p2.session.next >= 500) {
      planted = sides.p2.session.next;
      sides.p2.battle.p1.body.x += 1e-9;
    }
  }
  assert.ok(planted !== null);
  for (const slot of ['p1', 'p2']) {
    const [end] = sides[slot].ends;
    assert.equal(end?.reason, 'desync', slot);
    assert.ok(end.step >= planted - 1 && end.step < planted + 60 + CONFIG.online.inputDelay + 2, `${slot}: caught at step ${end.step}`);
    assert.ok(end.state?.fighters?.length === 2, 'the state is kept for the debug log');
  }
});
