// Run with node --test tests/integration/roster-matrix.test.mjs (no dependencies).
// Every pairing of the roster's playable fighters, both ways round and
// mirrored (#0001 v #0002, #0002 v #0001, #0001 v #0001, #0002 v #0002 as
// the roster ships), through the shared systems: a real Battle in Watch
// Mode (a seeded combat AI on each side) on a real stage, with every
// fighter's own definition and art. Character-neutral: each check reads the
// fighter's own data (its `actions`, attacks, summons and techniques), never
// one fighter's values, so it holds for whichever fighters are playable.
// Also: the same seed plays the same match step for step, and the frame
// rate never changes a fixed step. Rendering is not checked here (the view
// is never sized, so nothing is drawn).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { playableCharacters } from '../../js/data/characters.js';
import { COMBAT_BUTTONS } from '../../js/config.js';
import { DT, fakeSpritesOf } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const PLAYABLE = playableCharacters();
const PAIRS = PLAYABLE.flatMap((a) => PLAYABLE.map((b) => [a, b]));
const pairName = ([a, b]) => `${a.displayName} v ${b.displayName}`;

// A Watch Mode match between `a` (CPU 1) and `b` (CPU 2), in its fight
// phase, its every fixed step recorded per fighter.
function watch(a, b, { seed = 11, difficulty = 'hard' } = {}) {
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'watch', seed, difficulty,
    p1Def: a, p2Def: b, p1Sprites: fakeSpritesOf(a), p2Sprites: fakeSpritesOf(b), input,
  });
  battle.setPhase('fight');
  const steps = [];
  const events = [];
  const update = battle.update.bind(battle);
  battle.update = (dt) => {
    update(dt);
    events.push(...battle.combat.events);
    steps.push(battle.fighters.map((f) => ({
      x: f.body.x, y: f.body.y, vx: f.body.vx, vy: f.body.vy, state: f.state, facing: f.facing,
      attack: f.combat.attack?.def.id ?? null, technique: f.technique?.def.id ?? null, summon: f.pendingSummon?.id ?? null,
      launchPoint: f.combat.launchPoint, energy: f.combat.energy, lost: f.lostToVoid,
      pressed: COMBAT_BUTTONS.filter((action) => f.controller.out[`${action}Pressed`]),
    })));
  };
  return { battle, steps, events };
}

const run = (m, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) m.battle.update(DT);
  return m;
};

test('the roster as it ships: at least two playable fighters, so every pairing below is a real one', () => {
  assert.ok(PLAYABLE.length >= 2, PLAYABLE.map((c) => c.id).join(', '));
  assert.equal(PAIRS.length, PLAYABLE.length ** 2, 'both ways round, and each fighter against itself');
});

for (const pair of PAIRS) {
  test(`${pairName(pair)}: both CPUs fight with their own moves only, and the hits land through the one combat system`, () => {
    const m = run(watch(...pair), 20);
    for (const [side, def] of pair.entries()) {
      const own = m.steps.map((s) => s[side]);
      const buttons = new Set(own.flatMap((s) => s.pressed));
      const attacks = new Set(own.map((s) => s.attack).filter(Boolean));
      // Only buttons the fighter has a move on; only its own attacks (its
      // Deflect, the Shield button's in the air, among them), summons and
      // techniques ever start.
      for (const action of buttons) assert.ok(def.actions?.[action], `${def.displayName} pressed ${action}, which it has no move on`);
      for (const id of attacks) {
        assert.ok(id in def.attacks || (id === 'deflect' && def.deflect), `${def.displayName} started ${id}, which is not one of its attacks`);
      }
      for (const s of own) {
        if (s.technique) assert.ok(s.technique in (def.techniques ?? {}), `${def.displayName}: technique ${s.technique}`);
        if (s.summon) assert.ok(s.summon in (def.summons ?? {}), `${def.displayName}: summon ${s.summon}`);
        for (const k of ['x', 'y', 'vx', 'vy', 'launchPoint', 'energy']) assert.ok(Number.isFinite(s[k]), `${def.displayName}: ${k}`);
      }
      assert.ok(attacks.size > 0, `${def.displayName} attacked at least once`);
    }
    // Every hit is credited to one fighter of the match and lands on the
    // other, whichever fighters they are.
    const [p1, p2] = m.battle.fighters;
    assert.ok(m.events.length > 0, 'hits landed');
    for (const e of m.events) {
      assert.ok((e.attacker === p1 && e.target === p2) || (e.attacker === p2 && e.target === p1), 'one fighter hits the other');
    }
  });
}

test('the same seed plays the same match, step for step, for every pairing', () => {
  for (const pair of PAIRS) {
    const first = run(watch(...pair, { seed: 5 }), 8).steps;
    const again = run(watch(...pair, { seed: 5 }), 8).steps;
    assert.deepEqual(again, first, pairName(pair));
  }
});

test('the frame rate never changes a fixed step: 30, 60 and 144 fps play the same match', () => {
  for (const pair of PAIRS) {
    const paced = (fps) => {
      const m = watch(...pair, { seed: 9 });
      // Frames of 1/fps seconds until well past 6 s of fixed steps, however
      // the accumulator divides them.
      for (let t = 0; t < 7; t += 1 / fps) m.battle.frame(1 / fps);
      return m.steps;
    };
    const runs = [30, 60, 144].map(paced);
    const n = Math.round(6 / DT);
    for (const steps of runs) assert.ok(steps.length >= n, `${pairName(pair)}: ${steps.length} steps`);
    assert.deepEqual(runs[0].slice(0, n), runs[1].slice(0, n), `${pairName(pair)}: 30 and 60 fps`);
    assert.deepEqual(runs[2].slice(0, n), runs[1].slice(0, n), `${pairName(pair)}: 144 and 60 fps`);
  }
});
