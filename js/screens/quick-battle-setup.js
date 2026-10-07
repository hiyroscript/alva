// QUICK BATTLE SETUP: how a Quick Battle's choices become its Battle.
//
//   Regular Play: Mode → Difficulty → Fighter → Battle
//   Custom Play:  Mode → Difficulty → Fighter → CPU → Stage → Battle
//
// The choices live in app.selection, the one state the Battle screen reads
// (Watch Mode keeps its own in app.selection.watch): the play type, the
// difficulty, Player 1's fighter (characterId), the CPU's (cpuCharacterId)
// and the stage (mapId). Custom Play picks the CPU's fighter on Select CPU
// and the stage on Select Stage. Regular Play draws both at random as the
// player confirms their fighter (drawRegularPlay), stores them in the same
// fields and starts the Battle at once; Restart Battle and Rematch replay
// that Battle, so only a new setup draws again.

import { playableCharacters } from '../data/characters.js';
import { MAPS } from '../data/maps.js';
import { resolvePlayType } from '../ui/components.js';

// One entry of `list` at random (`random` returns [0, 1), as Math.random
// does), or null for an empty list.
export function pickRandom(list, random = Math.random) {
  if (!list.length) return null;
  const i = Math.floor(random() * list.length);
  return list[Math.min(Math.max(i, 0), list.length - 1)];
}

// Regular Play's draw into `selection`: a CPU fighter from the fighters
// playable now (null while there is none, never a locked one) and a stage
// from MAPS (never Practice Ground, which is not one of them).
export function drawRegularPlay(selection, random = Math.random) {
  selection.cpuCharacterId = pickRandom(playableCharacters(), random)?.id ?? null;
  selection.mapId = pickRandom(MAPS, random).id;
}

// What starting a Quick Battle hands the Battle screen.
export function quickBattleParams(selection) {
  const { mapId, characterId, cpuCharacterId, difficulty } = selection;
  return { mapId, characterId, cpuCharacterId, difficulty };
}

// Once Player 1's fighter is confirmed: Custom Play goes on to Select CPU;
// Regular Play draws the CPU's fighter and the stage and starts the Battle.
export function continueAfterFighter(app, random = Math.random) {
  const selection = app.selection;
  if (resolvePlayType(selection.playType) === 'custom') {
    app.screens.go('quick-cpu');
    return;
  }
  drawRegularPlay(selection, random);
  app.screens.go('battle', quickBattleParams(selection));
}
