// CPU Intelligence benchmark: repeatable CPU-vs-CPU matches, measured.
//
//   node tools/cpu-benchmark.mjs                       # the full benchmark
//   node tools/cpu-benchmark.mjs --level brutal --seeds 2
//   node tools/cpu-benchmark.mjs --levels easy,medium,hard,brutal --opponents rushdown,zoner
//   node tools/cpu-benchmark.mjs --ladder              # each level against the others
//
// Every match is a real Battle (js/game/battle.js) under the full match
// rules (first to 3 points, the 7-minute clock, overtime and its closing
// Void, then points, then the lower Launch Point), on a real stage with
// every fighter's own definition, stepped at the fixed 60 Hz. Each tested
// level plays the benchmark population (below) with every pairing of
// playable fighters (mirrors included), on both stages, from both sides,
// over several seeds.
//
// The benchmark population: the scripted styles of
// tests/helpers/benchmark-opponents.mjs (rushdown, zoner, turtle,
// aerial: competent, fast-reacting, single-minded) and CPU Intelligence
// itself at Easy and Medium. Hard and Brutal against each other are the
// ladder (--ladder), reported apart.
//
// Not a test (node --test never runs it): a measurement for tuning and
// for the report in docs/systems/ai.md. Deterministic: the same arguments
// give the same numbers.

import { Battle } from '../js/game/battle.js';
import { getMap, MAPS } from '../js/data/maps.js';
import { playableCharacters } from '../js/data/characters.js';
import { CPUIntelligenceController } from '../js/game/ai/cpu-intelligence.js';
import { knowFighter } from '../js/game/ai/knowledge.js';
import { mulberry32, deriveSeed } from '../js/core/utils.js';
import { CONFIG } from '../js/config.js';
import { fakeSpritesOf } from '../tests/helpers/fighter-harness.mjs';
import { ScriptedOpponent, BENCHMARK_STYLES } from '../tests/helpers/benchmark-opponents.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const DT = CONFIG.sim.step;
const LEVELS = ['easy', 'medium', 'hard', 'brutal'];
export const POPULATION = Object.freeze([...BENCHMARK_STYLES, 'easy', 'medium']);

function controllerFor(who, seed) {
  const rng = mulberry32(seed);
  if (LEVELS.includes(who)) return new CPUIntelligenceController({ difficulty: who, rng });
  return new ScriptedOpponent({ style: who, rng });
}

// One full match: `a` (a level or a style) on the p1 side against `b`.
export function runMatch({ a, b, defA, defB, mapId, seed, cap = CONFIG.battle.matchSeconds + CONFIG.battle.overtimeSeconds + 5 }) {
  const input = { flush() {}, sample: () => ({}) };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), mode: 'watch', seed, difficulty: 'medium',
    p1Def: defA, p2Def: defB, p1Sprites: fakeSpritesOf(defA), p2Sprites: fakeSpritesOf(defB), input,
  });
  battle.p1.controller = controllerFor(a, deriveSeed(seed, 1));
  battle.p2.controller = controllerFor(b, deriveSeed(seed, 2));
  battle.fx = { take() {}, takeBounce() {}, reset() {}, addElimination() {}, timeScale: 1, sampleTrail() {} };
  battle.setPhase('fight');
  const sides = battle.fighters.map((f) => ({
    f, falls: 0, selfFalls: 0, dealt: 0, taken: 0, hits: 0, offstage: 0, returned: 0, lastHitAt: -Infinity, out: false, wasOff: false,
  }));
  let steps = 0;
  const limit = Math.ceil(cap / DT);
  while (battle.phase !== 'result' && steps < limit) {
    battle.update(DT);
    steps++;
    const t = steps * DT;
    for (const e of battle.combat.events) {
      if (e.type !== 'hit') continue;
      const atk = sides.find((s) => s.f === e.attacker);
      const tgt = sides.find((s) => s.f === e.target);
      if (atk) {
        atk.dealt += e.damage;
        atk.hits++;
      }
      if (tgt) {
        tgt.taken += e.damage;
        tgt.lastHitAt = t;
      }
    }
    for (const s of sides) {
      const f = s.f;
      if (f.lostToVoid && !s.out) {
        s.out = true;
        s.falls++;
        if (t - s.lastHitAt > 2.5) s.selfFalls++;
        if (s.wasOff) s.wasOff = false;
      } else if (!f.lostToVoid) {
        s.out = false;
        const b = f.body;
        const off = !b.grounded && !battle.stage.surfaceBelow(b.x - b.halfW, b.x + b.halfW, b.y).ref;
        if (off && !s.wasOff) {
          s.wasOff = true;
          s.offstage++;
        } else if (s.wasOff && b.grounded) {
          s.wasOff = false;
          s.returned++;
        }
      }
    }
  }
  const result = battle.result;
  const stats = sides.map((s) => ({ ...s, f: undefined, cpu: s.f.controller.stats ?? null, moves: knowFighter(s.f).moves.map((m) => m.key) }));
  return { a, b, defA: defA.id, defB: defB.id, mapId, seed, result, score: { ...battle.score }, seconds: steps * DT, stats };
}

// Every match of `level` against `opponents`: each fighter pairing, each
// stage, each side, each seed.
export function* schedule(level, opponents, { seeds = 2, maps = MAPS.map((m) => m.id) } = {}) {
  const fighters = playableCharacters();
  let n = 0;
  for (const opp of opponents) {
    for (const defA of fighters) {
      for (const defB of fighters) {
        for (const mapId of maps) {
          for (let s = 0; s < seeds; s++) {
            const seed = 1000 + 97 * n++;
            yield { level, opp, mine: 0, args: { a: level, b: opp, defA, defB, mapId, seed } };
            yield { level, opp, mine: 1, args: { a: opp, b: level, defA: defB, defB: defA, mapId, seed: seed + 1 } };
          }
        }
      }
    }
  }
}

function summarize(level, opp, matches) {
  let wins = 0;
  let draws = 0;
  let kos = 0;
  let falls = 0;
  let selfFalls = 0;
  let dealt = 0;
  let taken = 0;
  let off = 0;
  let back = 0;
  let seconds = 0;
  let deflA = 0;
  let defl = 0;
  let combos = 0;
  let idle = 0;
  let controllable = 0;
  let longest = 0;
  let blocks = 0;
  const used = new Set();
  const usable = new Set();
  for (const { m, mine } of matches) {
    const me = m.stats[mine];
    const them = m.stats[1 - mine];
    const outcome = m.result.outcome;
    if (outcome === 'draw') draws++;
    else if ((outcome === 'p1') === (mine === 0)) wins++;
    kos += them.falls;
    falls += me.falls;
    selfFalls += me.selfFalls;
    dealt += me.dealt;
    taken += me.taken;
    off += me.offstage;
    back += me.returned;
    seconds += m.seconds;
    if (me.cpu) {
      deflA += me.cpu.deflectAttempts;
      defl += me.cpu.deflects;
      combos += me.cpu.combos;
      idle += me.cpu.idle;
      controllable += me.cpu.controllable;
      blocks += me.cpu.blocks;
      longest = Math.max(longest, me.cpu.longestIdle);
      for (const k of Object.keys(me.cpu.moves)) used.add(`${mine ? m.defB : m.defA}/${k}`);
    }
    for (const k of me.moves) usable.add(`${mine ? m.defB : m.defA}/${k}`);
  }
  const n = matches.length;
  return {
    level, opp, matches: n, winRate: wins / n, draws, kosPerMatch: kos / n, fallsPerMatch: falls / n, selfFallsPerMatch: selfFalls / n,
    dealtPerMatch: dealt / n, takenPerMatch: taken / n, recovery: off ? back / off : 1, avgSeconds: seconds / n,
    deflectAttempts: deflA, deflects: defl, blocks, combosPerMatch: combos / n,
    idleShare: controllable ? idle / controllable : 0, longestIdleSteps: longest,
    moveUse: usable.size ? [...usable].filter((k) => used.has(k)).length / usable.size : 0,
    unused: [...usable].filter((k) => !used.has(k)),
  };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function printRow(r) {
  console.log([
    r.level.padEnd(7), r.opp.padEnd(9), String(r.matches).padStart(4), pct(r.winRate).padStart(7),
    r.kosPerMatch.toFixed(2).padStart(6), r.fallsPerMatch.toFixed(2).padStart(6), r.selfFallsPerMatch.toFixed(2).padStart(6),
    r.dealtPerMatch.toFixed(0).padStart(6), r.takenPerMatch.toFixed(0).padStart(6), pct(r.recovery).padStart(7),
    `${r.deflects}/${r.deflectAttempts}`.padStart(8), String(r.blocks).padStart(6), r.combosPerMatch.toFixed(1).padStart(6),
    pct(r.idleShare).padStart(6), String(r.longestIdleSteps).padStart(5), pct(r.moveUse).padStart(7), r.avgSeconds.toFixed(0).padStart(5),
  ].join(' '));
}

const HEADER = 'level   opponent  n     win    KOs  falls  selfF  dealt  taken    recov  deflect blocks combos  idle  maxI   moves  secs';

export function runBenchmark({ levels = ['brutal'], opponents = POPULATION, seeds = 2, maps, quiet = false } = {}) {
  const rows = [];
  for (const level of levels) {
    const byOpp = new Map();
    for (const job of schedule(level, opponents.filter((o) => o !== level), { seeds, maps })) {
      const m = runMatch(job.args);
      if (!byOpp.has(job.opp)) byOpp.set(job.opp, []);
      byOpp.get(job.opp).push({ m, mine: job.mine });
    }
    const all = [];
    for (const [opp, matches] of byOpp) {
      const r = summarize(level, opp, matches);
      rows.push(r);
      all.push(...matches);
      if (!quiet) printRow(r);
    }
    const total = summarize(level, 'ALL', all);
    rows.push(total);
    if (!quiet) printRow(total);
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const levels = (opt('levels', null) ?? opt('level', 'brutal')).split(',');
  const seeds = Number(opt('seeds', 2));
  const maps = opt('maps', null)?.split(',');
  const t0 = Date.now();
  console.log(HEADER);
  if (args.includes('--ladder')) {
    for (const level of levels) runBenchmark({ levels: [level], opponents: LEVELS.filter((l) => l !== level), seeds, maps });
  } else {
    const opponents = opt('opponents', POPULATION.join(',')).split(',');
    const rows = runBenchmark({ levels, opponents, seeds, maps });
    for (const r of rows.filter((x) => x.opp === 'ALL')) {
      if (r.unused.length) console.log(`${r.level}: never used ${r.unused.join(', ')}`);
    }
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
