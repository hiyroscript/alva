// The simulation probe of the itch.io release's equivalence check
// (equivalence.mjs): seeded matches of every mode on the real Battle and
// PracticeSession, stepped at the fixed rate, with a digest of the world
// as they go. equivalence.mjs runs it twice, once on the modules in js/ as
// they are and once bundled with the release's own esbuild options, and
// the two must agree step for step.
//
// Run directly (`node tools/itch/sim-probe.mjs`), it prints its digests as
// JSON. Fighters use clip metadata only (the tests' fake sprite sets): the
// simulation never reads pixels.

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { playableCharacters } from '../../js/data/characters.js';
import { MAPS } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { DIFFICULTY_IDS } from '../../js/data/difficulty.js';
import { HELD_CONTROLS, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { CONFIG } from '../../js/config.js';
import { fakeSpritesOf } from '../../tests/helpers/fighter-harness.mjs';

const DT = CONFIG.sim.step;
// Steps between checkpoints (one second), so a difference is placed in time.
const CHECKPOINT = 60;

// Nothing in a step may depend on the machine: wall-clock time is frozen
// and Math.random is a seeded stream (only presentation reads either). The
// stage themes build Path2D shapes, which Node lacks: a stand-in that draws
// nothing, as the tests' (tests/helpers/cpu-match.mjs).
function freezeClocks() {
  let t = 0x2545f491;
  Math.random = () => {
    t = (Math.imul(t, 1664525) + 1013904223) >>> 0;
    return t / 4294967296;
  };
  Date.now = () => 0;
  globalThis.performance.now = () => 0;
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) });
    }
  };
}

// A player's hands, scripted from a seed: runs and turns, jumps (short and
// held), Down (fast falls, drops, the Super Jump with Jump), the Shield and
// the Deflect, Dashes, every attack button, and bursts of five quick
// presses (the Mash Combo).
class ScriptedHands {
  constructor(seed) {
    this.t = seed >>> 0;
    this.holds = new Map();
    this.prev = new Set();
    this.dir = 0;
    this.burst = null;
  }

  rand() {
    this.t = (Math.imul(this.t ^ (this.t >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return this.t / 4294967296;
  }

  hold(control, min, max) {
    this.holds.set(control, min + Math.floor(this.rand() * (max - min + 1)));
  }

  sample(ctx = {}) {
    if (this.rand() < 0.04) this.dir = [-1, 0, 1][Math.floor(this.rand() * 3)];
    if (this.rand() < 0.035) this.hold('jump', 1, 14);
    if (this.rand() < 0.02) this.hold('down', 2, 18);
    if (this.rand() < 0.012) this.hold('shield', 4, 40);
    for (const control of HELD_CONTROLS) {
      if (control.startsWith('attack') || control === 'extra_attack') if (this.rand() < 0.012) this.hold(control, 1, 3);
    }
    if (!this.burst && this.rand() < 0.004) this.burst = { control: this.rand() < 0.5 ? 'attack1' : 'attack2', left: 5, wait: 0 };
    if (this.burst && --this.burst.wait <= 0) {
      this.hold(this.burst.control, 1, 1);
      this.burst.wait = 4;
      if (--this.burst.left === 0) this.burst = null;
    }
    const held = new Set();
    for (const [control, left] of this.holds) {
      held.add(control);
      if (left <= 1) this.holds.delete(control);
      else this.holds.set(control, left - 1);
    }
    if (this.dir < 0) held.add('runLeft');
    if (this.dir > 0) held.add('runRight');

    const input = blankInput();
    let pressed = false;
    for (const control of HELD_CONTROLS) {
      input[control] = held.has(control);
      input[`${control}Pressed`] = held.has(control) && !this.prev.has(control);
      pressed ||= input[`${control}Pressed`];
    }
    if (this.rand() < 0.008) input[this.rand() < 0.5 ? 'mouvementLeftPressed' : 'mouvementRightPressed'] = true;
    input.pressedOnGround = pressed && ctx.grounded === true;
    input.pressedInAir = pressed && ctx.grounded === false;
    this.prev = held;
    return input;
  }

  flush() {
    this.holds.clear();
    this.burst = null;
  }
}

// Every value reachable from `root`, in a fixed order (own enumerable keys
// in insertion order, arrays, Maps and Sets in order), each object once.
// Numbers exactly as stored (-0 and NaN included). No constructor or
// function names: the bundle may rename a top-level class or function.
function deepDigest(root) {
  const hash = createHash('sha256');
  const seen = new Map();
  const walk = (v) => {
    switch (typeof v) {
      case 'number': hash.update(Object.is(v, -0) ? 'n-0;' : `n${v};`); return;
      case 'string': hash.update(`s${v.length}:${v};`); return;
      case 'boolean': hash.update(v ? 'T' : 'F'); return;
      case 'undefined': hash.update('U'); return;
      case 'bigint': hash.update(`b${v};`); return;
      case 'function': case 'symbol': hash.update('f'); return;
      default:
    }
    if (v === null) return void hash.update('N');
    if (seen.has(v)) return void hash.update(`@${seen.get(v)};`);
    seen.set(v, seen.size);
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      hash.update(`[${v.length}`);
      for (let i = 0; i < v.length; i++) walk(v[i]);
      hash.update(']');
    } else if (v instanceof Map) {
      hash.update(`M${v.size}`);
      for (const [k, x] of v) { walk(k); walk(x); }
    } else if (v instanceof Set) {
      hash.update(`S${v.size}`);
      for (const x of v) walk(x);
    } else {
      const keys = Object.keys(v);
      hash.update(`{${keys.length}`);
      for (const k of keys) { hash.update(`${k}=`); walk(v[k]); }
      hash.update('}');
    }
  };
  walk(root);
  return hash.digest('hex').slice(0, 24);
}

// What every step leaves behind, cheaply: each fighter's body, state,
// facing, combat, Energy, Launch Point and frame, and the projectiles,
// clones, events, score and clock.
function stepState(arena) {
  const f = (x) => x && [
    x.body.x, x.body.y, x.body.vx, x.body.vy, x.body.grounded, x.facing, x.state, x.lostToVoid,
    x.combat.launchPoint, x.combat.energy, x.combat.phase, x.combat.attack?.def?.id ?? null,
    x.combat.attack?.time ?? null, [...x.combat.cooldowns], x.animator?.frame?.url ?? null,
  ];
  return JSON.stringify([
    arena.fighters.map(f),
    arena.projectiles.map((p) => [p.x, p.y, p.vx, p.vy, p.dead]),
    arena.clones.length,
    (arena.combat?.events ?? []).map((e) => [e.type, e.damage, e.attacker?.slot, e.target?.slot]),
    arena.score ?? null, arena.phase ?? null, arena.timeLeft ?? null, arena.matchOver ?? null,
  ]);
}

function record(arena, steps, { until, during } = {}) {
  const checkpoints = [];
  let rolling = createHash('sha256');
  let n = 0;
  for (; n < steps; n++) {
    during?.(n);
    arena.update(DT);
    rolling.update(stepState(arena));
    if ((n + 1) % CHECKPOINT === 0) {
      checkpoints.push(`${rolling.digest('hex').slice(0, 16)}:${deepDigest(arena)}`);
      rolling = createHash('sha256');
    }
    if (until?.()) break;
  }
  checkpoints.push(`${rolling.digest('hex').slice(0, 16)}:${deepDigest(arena)}`);
  return { steps: n, checkpoints };
}

const canvas = () => ({ getContext: () => ({}) });

// A match's result: the score, the outcome once it is decided, overtime.
const result = (b) => ({
  score: `${b.score.p1}-${b.score.p2}`, outcome: b.final?.outcome ?? 'undecided', reason: b.final?.reason ?? null, overtime: b.overtime,
});

// Three seconds into the celebration after the match's end.
function celebrated(b) {
  let after = 0;
  return () => b.matchOver && ++after >= 180;
}
const roster = () => playableCharacters();

function battle({ mode, p1, p2, map, difficulty, seed, hands }) {
  return new Battle({
    canvas: canvas(), map, mode, seed, difficulty,
    p1Def: p1, p2Def: p2, p1Sprites: fakeSpritesOf(p1), p2Sprites: fakeSpritesOf(p2),
    input: { flush() {}, sample: (ctx) => hands?.p1?.sample(ctx) ?? blankInput(), player: (slot) => hands?.[slot] },
  });
}

// Every mode, every fighter on each side, every stage, every CPU level.
export function scenarios() {
  const F = roster();
  const list = [];
  F.forEach((p1, i) => {
    const p2 = F[(i + 4) % F.length];
    list.push({
      name: `watch ${p1.id} v ${p2.id} on ${MAPS[i % MAPS.length].id}, ${DIFFICULTY_IDS[i % DIFFICULTY_IDS.length]}`,
      run: (steps) => {
        const b = battle({ mode: 'watch', p1, p2, map: MAPS[i % MAPS.length], difficulty: DIFFICULTY_IDS[i % DIFFICULTY_IDS.length], seed: 1000 + i });
        return { ...record(b, steps.match, { until: celebrated(b) }), result: result(b) };
      },
    });
  });
  for (const [def, map, seed] of [[F[0], MAPS[1], 77], [F[5 % F.length], MAPS[4 % MAPS.length], 78]]) {
    list.push({
      name: `watch mirror ${def.id} on ${map.id}, brutal`,
      run: (steps) => {
        const b = battle({ mode: 'watch', p1: def, p2: def, map, difficulty: 'brutal', seed });
        return { ...record(b, steps.match, { until: celebrated(b) }), result: result(b) };
      },
    });
  }
  // The clock cut to 1 s, so the match goes to overtime level: its closing
  // Void, and the Launch Point tiebreak when it ends level.
  for (const [i, map] of [[2, MAPS[2 % MAPS.length]], [6, MAPS[4 % MAPS.length]]]) {
    const p1 = F[i % F.length];
    const p2 = F[(i + 5) % F.length];
    list.push({
      name: `watch overtime ${p1.id} v ${p2.id} on ${map.id}, hard`,
      run: (steps) => {
        const b = battle({ mode: 'watch', p1, p2, map, difficulty: 'hard', seed: 4000 + i });
        b.roundSeconds = 1;
        b.timeLeft = 1;
        return { ...record(b, steps.match, { until: celebrated(b) }), result: result(b) };
      },
    });
  }
  F.forEach((p1, i) => {
    const p2 = F[(i + 2) % F.length];
    list.push({
      name: `quick battle ${p1.id} (scripted player) v ${p2.id} on ${MAPS[(i + 2) % MAPS.length].id}, ${DIFFICULTY_IDS[(i + 1) % DIFFICULTY_IDS.length]}`,
      run: (steps) => {
        const hands = { p1: new ScriptedHands(500 + i) };
        const b = battle({ mode: 'quick-battle', p1, p2, map: MAPS[(i + 2) % MAPS.length], difficulty: DIFFICULTY_IDS[(i + 1) % DIFFICULTY_IDS.length], seed: 2000 + i, hands });
        return { ...record(b, steps.play), result: result(b) };
      },
    });
  });
  for (const i of [0, 1]) {
    const p1 = F[(i * 3) % F.length];
    const p2 = F[(i * 3 + 7) % F.length];
    list.push({
      name: `local play ${p1.id} v ${p2.id} on ${MAPS[(i + 3) % MAPS.length].id}`,
      run: (steps) => {
        const hands = { p1: new ScriptedHands(900 + i), p2: new ScriptedHands(950 + i) };
        const b = battle({ mode: 'local', p1, p2, map: MAPS[(i + 3) % MAPS.length], seed: 3000 + i, hands });
        return { ...record(b, steps.play), result: result(b) };
      },
    });
  }
  F.forEach((def, i) => {
    const other = F[(i + 1) % F.length];
    list.push({
      name: `practice ground ${def.id} (fighter swap to ${other.id}, dummy removed and back)`,
      run: (steps) => {
        const hands = new ScriptedHands(700 + i);
        const s = new PracticeSession({ canvas: canvas(), map: PRACTICE_MAP, def, sprites: fakeSpritesOf(def), input: hands });
        s.setCPU(other, fakeSpritesOf(other));
        const third = Math.floor(steps.practice / 3);
        return record(s, steps.practice, {
          during: (n) => {
            if (n === third) s.setFighter(other, fakeSpritesOf(other));
            if (n === third + 300) s.removeCPU();
            if (n === third + 420) s.setCPU(def, fakeSpritesOf(def));
          },
        });
      },
    });
  });
  return list;
}

// Every scenario's digests (or those whose name includes `only`); `quick`
// shortens them (a smoke run).
export function runScenarios({ quick = false, only = '' } = {}) {
  freezeClocks();
  const steps = quick ? { match: 1200, play: 600, practice: 600 } : { match: 30000, play: 5400, practice: 3600 };
  return scenarios().filter(({ name }) => name.includes(only)).map(({ name, run }) => ({ name, ...run(steps) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
  process.stdout.write(JSON.stringify(runScenarios({ quick: process.argv.includes('--quick'), only })));
}
