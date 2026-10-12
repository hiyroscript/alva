// Full CPU matches for tests and benchmarks (imported by *.test.mjs files and
// tests/benchmarks/; not a test file itself). A real Battle (js/game/battle.js)
// in Watch Mode on a real stage, both sides driven by any controllers (CPU
// Intelligence at any level, or a reference opponent), stepped at the fixed
// rate until the result, with the measurements the CPU benchmark reports:
// the winner and why, points, Launch Point dealt and taken, eliminations
// and accidental self-eliminations, hits, combos (hits that follow within
// a second), punishes (hits on an opponent in its recovery), Shields and
// Deflects that worked, recoveries, Energy exhaustion, and each CPU's own
// telemetry (move usage, invalid inputs, inactivity, stuck navigation,
// failed plans). Deterministic: the same arguments play the same match.

import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { mulberry32, deriveSeed } from '../../js/core/utils.js';
import { fakeSpritesOf, DT } from './fighter-harness.mjs';
import { ReferenceOpponent } from './reference-opponents.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// A controller from a spec: a difficulty id ('easy' ... 'brutal') for CPU
// Intelligence, or 'ref:<style>' for a reference opponent.
export function controllerFor(spec, seed) {
  const rng = mulberry32(seed);
  if (spec.startsWith('ref:')) return new ReferenceOpponent({ style: spec.slice(4), rng });
  return new CombatAIController({ difficulty: spec, rng });
}

function sideStats() {
  return {
    points: 0, dealt: 0, taken: 0, hits: 0, blocked: 0, combos: 0, punishes: 0, kos: 0, selfKOs: 0, falls: 0,
    shieldBlocks: 0, deflects: 0, exhausted: 0, maxLP: 0,
  };
}

// One match: `a` and `b` are controller specs for P1 (CPU 1) and P2 (CPU 2),
// `defA` / `defB` their fighters. Runs to the result (or `maxSeconds`).
export function runMatch({ a, b, defA, defB, map = 'desert', seed = 1, maxSeconds = 600, matchSeconds } = {}) {
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(map), mode: 'watch', seed, difficulty: 'medium',
    p1Def: defA, p2Def: defB, p1Sprites: fakeSpritesOf(defA), p2Sprites: fakeSpritesOf(defB),
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p1.controller = controllerFor(a, deriveSeed(seed, 11));
  battle.p2.controller = controllerFor(b, deriveSeed(seed, 12));
  if (matchSeconds != null) {
    battle.roundSeconds = matchSeconds;
    battle.timeLeft = matchSeconds;
  }
  battle.setPhase('fight');
  const stats = { p1: sideStats(), p2: sideStats() };
  const lastHit = { p1: -Infinity, p2: -Infinity };
  const lastHitBy = { p1: -Infinity, p2: -Infinity };
  const lost = { p1: false, p2: false };
  const tired = { p1: false, p2: false };
  let t = 0;
  let steps = 0;
  const limit = Math.round(maxSeconds / DT);
  while (battle.phase !== 'result' && steps < limit) {
    const live = battle.phase === 'fight';
    battle.update(DT);
    steps++;
    t += DT;
    for (const e of battle.combat.events) {
      const by = e.attacker.slot;
      const on = e.target.slot;
      if (e.type === 'hit') {
        stats[by].hits++;
        stats[by].dealt += e.damage;
        stats[on].taken += e.damage;
        if (t - lastHitBy[by] < 1) stats[by].combos++;
        lastHitBy[by] = t;
        lastHit[on] = t;
        const foeAttack = e.target.combat.attack;
        if (foeAttack && foeAttack.def && e.target.combat.phase === 'recovery') stats[by].punishes++;
      } else {
        stats[by].blocked++;
        stats[on].shieldBlocks++;
      }
    }
    for (const d of battle.combat.deflections) stats[d.fighter.slot].deflects++;
    for (const f of battle.fighters) {
      const side = f.slot;
      stats[side].maxLP = Math.max(stats[side].maxLP, f.combat.launchPoint);
      if (f.lostToVoid && !lost[side] && live) {
        stats[side].falls++;
        if (t - lastHit[side] > 3) stats[side].selfKOs++;
        else stats[f.opponent.slot].kos++;
      }
      lost[side] = f.lostToVoid;
      if (f.combat.energyExhausted && !tired[side]) stats[side].exhausted++;
      tired[side] = f.combat.energyExhausted;
    }
  }
  stats.p1.points = battle.score.p1;
  stats.p2.points = battle.score.p2;
  const done = battle.phase === 'result';
  const result = done ? battle.result : { outcome: battle.score.p1 > battle.score.p2 ? 'p1' : battle.score.p2 > battle.score.p1 ? 'p2' : 'draw', reason: 'cut' };
  const telemetry = (f) => (f.controller.telemetry ? f.controller.telemetry.report() : null);
  return {
    outcome: result.outcome, reason: result.reason, seconds: t, stats,
    telemetry: { p1: telemetry(battle.p1), p2: telemetry(battle.p2) },
  };
}
