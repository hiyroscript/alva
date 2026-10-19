// A CPU scenario on a real Battle (imported by tests; not a test file
// itself): CPU Intelligence as Player 2 (as Quick Battle's CPU), at any
// level and seed, against any opponent as Player 1, on a real stage, with the
// match set up as the scenario needs it (score, clock, overtime and how far
// its Void has closed, both Launch Points, positions), then stepped at the
// fixed rate through the real Battle (its clock, overtime, Void, respawns,
// stage hazards and platform hazards all running).
//
//   const sc = scenario({ difficulty: 'hard', cpuLP: 120, score: [0, 0], timeLeft: 200 });
//   sc.run(4);                 // seconds
//   sc.ai.objective.kind      // what the CPU is after
//
// `foe` is a controller spec ('ref:<style>' or a level, see controllerFor),
// a controller, or a function `(n, self) => input` (called every step, n
// from 1), or null for a fighter that does nothing.

import { Battle, PERIODS } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { mulberry32 } from '../../js/core/utils.js';
import { playableCharacters } from '../../js/data/characters.js';
import { fakeSpritesOf, DT } from './fighter-harness.mjs';
import { controllerFor } from './cpu-match.mjs';

export function scenario({
  map = 'desert', cpuDef = playableCharacters()[0], foeDef = playableCharacters()[0], difficulty = 'hard', seed = 1, debug = false,
  foe = null, cpuX = null, foeX = null, cpuLP = 0, foeLP = 0, score = [0, 0], timeLeft = null, overtime = false, holdLP = false,
} = {}) {
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(map), mode: 'quick-battle', seed, difficulty,
    p1Def: foeDef, p2Def: cpuDef, p1Sprites: fakeSpritesOf(foeDef), p2Sprites: fakeSpritesOf(cpuDef),
    input: { flush() {}, sample: () => ({}) },
  });
  const ai = new CombatAIController({ difficulty, rng: mulberry32(seed), debug });
  const { p1: foeFighter, p2: cpu } = battle;
  cpu.controller = ai;
  let n = 0;
  if (typeof foe === 'string') foeFighter.controller = controllerFor(foe, seed + 101);
  else if (typeof foe === 'function') foeFighter.controller = { getInput: (self) => ({ ...blankInput(), ...foe(n, self) }) };
  else foeFighter.controller = foe ?? { getInput: () => blankInput() };
  battle.setPhase('fight');
  if (cpuX != null) cpu.body.x = cpuX;
  if (foeX != null) foeFighter.body.x = foeX;
  cpu.combat.launchPoint = cpuLP;
  foeFighter.combat.launchPoint = foeLP;
  battle.score.p2 = score[0];
  battle.score.p1 = score[1];
  if (overtime) {
    battle.period = PERIODS.overtime;
    battle.timeLeft = timeLeft ?? battle.overtimeSeconds;
    battle.setVoidPressure(battle.overtimeProgress);
  } else if (timeLeft != null) {
    battle.timeLeft = timeLeft;
  }
  const lp = { cpu: cpuLP, foe: foeLP };
  const step = () => {
    n++;
    battle.update(DT);
    // Launch Points held where the scenario puts them, if asked (at least
    // that much: what the fight adds stays).
    if (holdLP) {
      cpu.combat.launchPoint = Math.max(cpu.combat.launchPoint, lp.cpu);
      foeFighter.combat.launchPoint = Math.max(foeFighter.combat.launchPoint, lp.foe);
    }
  };
  const run = (seconds, each = null) => {
    for (let i = 0; i < Math.round(seconds / DT) && battle.phase !== 'result'; i++) {
      step();
      if (each && each(i) === false) break;
    }
  };
  return { battle, ai, cpu, foe: foeFighter, step, run, lp, get n() { return n; } };
}

export { DT };
