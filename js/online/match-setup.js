// What an online match is, read from the room's start message
// ({ match, seed, p1, p2 }, server/src/room.js): the same answer in both
// browsers, so both build the very same Battle.
//
// The stage is drawn at random, as Regular Play's is (randomStage), from
// the host's seed on a stream of its own, so both players get the same one
// and it never moves the Battle's own randomness (its hazards, on the seed
// itself). The fighters are the two players' picks, refused if this build
// cannot play either; each side keeps its player's own Automatic
// turn-around and is named by its player's online name.

import { getPlayableCharacter } from '../data/characters.js';
import { mulberry32, deriveSeed } from '../core/utils.js';
import { randomStage } from '../screens/quick-battle-setup.js';

// The stage draw's stream of the seed ('stag').
export const STAGE_STREAM = 0x73746167;

export function stageForSeed(seed) {
  return randomStage(mulberry32(deriveSeed(seed >>> 0, STAGE_STREAM)));
}

// The match `start` describes, or null if this build cannot play it.
export function readStart(start) {
  if (!start || !Number.isInteger(start.seed) || start.seed < 0) return null;
  const p1Def = getPlayableCharacter(start.p1?.fighterId);
  const p2Def = getPlayableCharacter(start.p2?.fighterId);
  const map = stageForSeed(start.seed);
  if (!p1Def || !p2Def || !map) return null;
  return {
    match: start.match ?? 1,
    seed: start.seed >>> 0,
    map,
    p1Def,
    p2Def,
    labels: { p1: String(start.p1.name ?? ''), p2: String(start.p2.name ?? '') },
    automaticTurnAround: { p1: start.p1.turn !== false, p2: start.p2.turn !== false },
  };
}
