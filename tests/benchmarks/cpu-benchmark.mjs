// CPU Intelligence benchmark (not part of `node --test`: run it by hand).
//
//   node tests/benchmarks/cpu-benchmark.mjs                 # the standard suite
//   node tests/benchmarks/cpu-benchmark.mjs --seeds 6       # more games per cell
//   node tests/benchmarks/cpu-benchmark.mjs --only brutal:hard
//   node tests/benchmarks/cpu-benchmark.mjs --from 5 --seeds 4   # seeds 5-8
//   node tests/benchmarks/cpu-benchmark.mjs --json out.json # raw results too
//
// Full, deterministic matches (tests/helpers/cpu-match.mjs: a real Battle
// in Watch Mode, first to 3 points, the 7-minute clock and overtime) over
// every pairing of the playable fighters (both ways round and mirrored),
// both stages (Desert and City), both starting sides and a range of seeds,
// for each matchup of the suite:
//
//   brutal v hard, brutal v medium, hard v medium, medium v easy, hard v easy,
//   and Brutal against each reference style (aggressive, defensive,
//   projectile-focused, jump-heavy, balanced: tests/helpers/reference-opponents.mjs)
//
// It reports, per matchup, the first side's win rate (with its 95% Wilson
// interval), points, Launch Point dealt and taken, eliminations and
// accidental self-eliminations, combos, punishes, Shield blocks, Deflects,
// Energy exhaustion, invalid inputs, inactivity incidents, stuck
// navigation and failed plans, and every move's usage. The numbers are
// measured, never assumed: Brutal's 95% target is reported against the
// composition above, whatever it comes to.

import { writeFileSync } from 'node:fs';
import { playableCharacters } from '../../js/data/characters.js';
import { runMatch } from '../helpers/cpu-match.mjs';
import { REFERENCE_STYLES } from '../helpers/reference-opponents.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SEEDS = Number(arg('seeds', 2));
if (process.env.FLAGS) for (const f of process.env.FLAGS.split(',')) globalThis[f] = true;
const FROM = Number(arg('from', 1));
const ONLY = arg('only', null);
const JSON_OUT = arg('json', null);
const MAPS = (arg('maps', 'desert,city')).split(',');
const MAX = Number(arg('max', 600));

const MATCHUPS = [
  ['brutal', 'hard'], ['brutal', 'medium'], ['hard', 'medium'], ['medium', 'easy'], ['hard', 'easy'],
  ...REFERENCE_STYLES.map((s) => ['brutal', `ref:${s}`]),
  ['easy', 'ref:balanced'],
];

const fighters = playableCharacters();
const pairs = fighters.flatMap((x) => fighters.map((y) => [x, y]));

function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - r) / d, (c + r) / d];
}

const results = [];
const t0 = Date.now();
for (const [x, y] of MATCHUPS) {
  if (ONLY && ONLY !== `${x}:${y}`) continue;
  const agg = {
    games: 0, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, dealt: 0, taken: 0, kos: 0, selfKOs: 0,
    foeSelfKOs: 0, combos: 0, punishes: 0, shieldBlocks: 0, deflects: 0, exhausted: 0, invalid: 0, inactivity: 0, stuck: 0,
    failed: 0, seconds: 0, usage: {},
  };
  for (const map of MAPS) {
    for (const [defA, defB] of pairs) {
      for (let seed = FROM; seed < FROM + SEEDS; seed++) {
        for (const flip of [false, true]) {
          // `x` plays defA from the left, or from the right (flipped).
          const m = flip
            ? runMatch({ a: y, b: x, defA: defB, defB: defA, map, seed, maxSeconds: MAX })
            : runMatch({ a: x, b: y, defA, defB, map, seed, maxSeconds: MAX });
          const me = flip ? 'p2' : 'p1';
          const them = flip ? 'p1' : 'p2';
          agg.games++;
          if (m.outcome === me) agg.wins++;
          else if (m.outcome === them) agg.losses++;
          else agg.draws++;
          const s = m.stats[me];
          const o = m.stats[them];
          agg.pointsFor += s.points;
          agg.pointsAgainst += o.points;
          agg.dealt += s.dealt;
          agg.taken += s.taken;
          agg.kos += s.kos;
          agg.selfKOs += s.selfKOs;
          agg.foeSelfKOs += o.selfKOs;
          agg.combos += s.combos;
          agg.punishes += s.punishes;
          agg.shieldBlocks += s.shieldBlocks;
          agg.deflects += s.deflects;
          agg.exhausted += s.exhausted;
          agg.seconds += m.seconds;
          const tel = m.telemetry[me];
          if (tel) {
            agg.invalid += tel.invalidInputs;
            agg.inactivity += tel.inactivity;
            agg.stuck += tel.stuckNavigation;
            agg.failed += tel.failedPlans;
            const fighter = defA.id;
            agg.usage[fighter] ??= {};
            for (const [k, v] of Object.entries(tel.moveUsage)) agg.usage[fighter][k] = (agg.usage[fighter][k] ?? 0) + v;
          }
        }
      }
    }
  }
  const [lo, hi] = wilson(agg.wins, agg.games);
  results.push({ matchup: `${x} v ${y}`, ...agg, winRate: agg.wins / agg.games, ci: [lo, hi] });
  const g = agg.games;
  console.log(
    `${`${x} v ${y}`.padEnd(24)} games ${String(g).padStart(3)}  win ${(100 * agg.wins / g).toFixed(1).padStart(5)}% ` +
    `[${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}]  W-L-D ${agg.wins}-${agg.losses}-${agg.draws}  ` +
    `pts ${(agg.pointsFor / g).toFixed(2)}:${(agg.pointsAgainst / g).toFixed(2)}  LP ${(agg.dealt / g).toFixed(0)}:${(agg.taken / g).toFixed(0)}  ` +
    `selfKO ${agg.selfKOs}/${agg.foeSelfKOs}  combos ${(agg.combos / g).toFixed(1)}  punish ${(agg.punishes / g).toFixed(1)}  ` +
    `shield ${(agg.shieldBlocks / g).toFixed(1)}  deflect ${(agg.deflects / g).toFixed(1)}  exh ${agg.exhausted}  ` +
    `invalid ${agg.invalid}  idle ${agg.inactivity}  stuck ${agg.stuck}  ${(agg.seconds / g).toFixed(0)}s/game`,
  );
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const r of results) {
  console.log(`\n${r.matchup}: move usage`);
  for (const [fighter, usage] of Object.entries(r.usage)) {
    console.log(`  #${fighter}: ${Object.entries(usage).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
