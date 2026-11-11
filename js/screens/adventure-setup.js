// ADVENTURE SETUP: how an Adventure level becomes its Battle (the
// Adventure update).
//
//   Select Mode → Adventure → Select Level → Select Fighter
//     → (levels 5, 10, 15, 20, 25, 30, that milestone unclaimed) the Perquisite cards
//     → Battle (the CPU's fighter and the stage drawn at random, Venture at that level)
//
// Adventure's choices live apart from every other mode's: the level in
// app.selection.adventureLevel, the rest in app.selection.adventure (Player
// 1's fighter, and each battle's draw: the CPU's fighter, the stage and the
// seed). Every battle draws afresh, exactly as Regular Play draws
// (drawRegularPlay, js/screens/quick-battle-setup.js), on a seeded RNG of
// its own whose seed the Battle then plays on, so one battle is one seed.
// Restart Battle replays that draw; Next level and Retry level draw again.

import { drawRegularPlay } from './quick-battle-setup.js';
import { CharacterSelectScreen } from './character-select-screen.js';
import { adventureSetup } from '../ui/components.js';
import { newSeed } from '../core/adventure-progress.js';
import { mulberry32 } from '../core/utils.js';
import { isAdventureLevel, ADVENTURE_LEVELS } from '../data/adventure.js';

// Draws a new battle for the level in `selection` into `selection.adventure`:
// a seed, then from it (as Regular Play draws) the CPU's fighter and the
// stage.
export function drawAdventureBattle(selection, random = Math.random) {
  const own = selection.adventure;
  own.seed = newSeed(random);
  drawRegularPlay(own, mulberry32(own.seed));
}

// What starting an Adventure battle hands the Battle screen.
export function adventureParams(selection) {
  const { characterId, cpuCharacterId, mapId, seed } = selection.adventure;
  return { mode: 'adventure', level: selection.adventureLevel, characterId, cpuCharacterId, mapId, seed };
}

// The level after `level`, or null after the last.
export const nextAdventureLevel = (level) => (isAdventureLevel(level) && level < ADVENTURE_LEVELS ? level + 1 : null);

// Before level `level`'s battle: the Perquisite cards when it is a milestone
// not claimed yet (resolving once one is picked and saved), else at once.
// Resolves false only if the cards could not be shown (no offer: never in
// practice).
export async function pickPerquisiteIfDue(app, level) {
  const progress = app.adventure;
  if (!progress.needsPick(level)) return true;
  const offer = progress.offer(level);
  if (offer.length < 2) return false;
  const id = await app.perquisiteCards.open({ level, offer, levels: progress.perquisites });
  if (!id) return false;
  return progress.pick(level, id);
}

// Once Player 1's fighter is confirmed (or Next level / Retry level from the
// Match Results): the cards if due, then a fresh draw and the Battle.
// `start` goes to the battle (by default the Battle screen, in place of the
// current screen when that is the Battle itself).
export async function continueAdventure(app, { random = Math.random, start = null } = {}) {
  const selection = app.selection;
  const level = selection.adventureLevel;
  if (!isAdventureLevel(level) || !app.adventure.isOpen(level)) return false;
  const from = app.screens.current;
  if (!(await pickPerquisiteIfDue(app, level))) return false;
  // Left meanwhile (never, as the cards cannot be dismissed): nothing starts.
  if (app.screens.current !== from) return false;
  drawAdventureBattle(selection, random);
  const params = adventureParams(selection);
  if (start) start(params);
  else app.screens.go('battle', params);
  return true;
}

// Adventure's Select Fighter (screen id `adventure-character`): the shared
// roster, its kicker Adventure and its steps Mode · Level · Fighter, its
// choice kept in app.selection.adventure; confirming goes on to the cards
// (when due) and the Battle. Back returns to Select Level.
export function adventureFighterScreen(app) {
  return new CharacterSelectScreen(app, {
    id: 'adventure-character', setup: adventureSetup, step: 2, selection: () => app.selection.adventure,
    next: () => continueAdventure(app), previewId: 'adventure-preview-name',
  });
}
