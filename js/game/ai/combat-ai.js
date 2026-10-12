// Combat AI: the CPU opponent of Quick Battle (Regular and Custom Play) and
// both CPUs of Watch Mode. Practice Ground keeps its controller-less
// training dummy (see js/game/practice.js).
//
// CombatAIController is the controller every battle mode builds (see
// BATTLE_MODES in js/game/battle.js): the same contract as
// PlayerController (Fighter.update asks it for one FighterInput snapshot
// per fixed step), the difficulty it was given, its injected seeded RNG,
// `reset` (a restart or rematch forgets everything), and the attack
// orientation it supplies (`attackFacing`). Everything it decides comes
// from CPU Intelligence (js/game/ai/cpu-intelligence/), the one universal
// intelligence that plays every fighter from its own data: there is no
// other decision engine behind it and no fallback.

import { CpuIntelligence } from './cpu-intelligence/brain.js';

export class CombatAIController extends CpuIntelligence {}
