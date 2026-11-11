// Whose point of view decides a sound (the Sound update): one helper for
// every mode, so no screen decides it on its own.
//
//   Mode                     Ejections                       Post-match music
//   Quick Battle, Adventure  Player 1 is the player,         Victory if Player 1 wins,
//                            the CPU the opponent            Defeat if Player 1 loses
//   Online Play              this device's player is the     from this player's side
//                            player
//   Local Play               the universal ejection, both    always Victory, whoever wins
//   Watch Mode               the universal ejection          Victory (nobody's side)
//   Practice Ground          the player's fighter is the     none: only the ambience
//                            player, the dummy the opponent
//   any draw                 —                               the stage's Draw version
//
// `side` is the slot ('p1' or 'p2') whose fighter is "the player", or null
// when nobody's is (Local Play, Watch Mode). `ejections` is 'sided' (the
// player's and the opponent's ejections sound differently) or 'universal'.
// `endings` is 'sided' (Victory or Defeat from `side`), 'victory' (always
// Victory) or null (Practice Ground: no music). `music` is 'theme' or
// 'ambience'.

import { SFX } from './sounds.js';

const QUICK = Object.freeze({ side: 'p1', ejections: 'sided', endings: 'sided', music: 'theme' });
const SHARED = Object.freeze({ side: null, ejections: 'universal', endings: 'victory', music: 'theme' });

export const AUDIO_MODES = Object.freeze(['quick-battle', 'adventure', 'online', 'local', 'watch', 'practice']);

// The point of view of `mode` ('quick-battle', 'adventure', 'online',
// 'local', 'watch' or 'practice'; anything else is Quick Battle's).
// Online, `localSlot` is this device's side.
export function audioPerspective(mode, { localSlot = 'p1' } = {}) {
  switch (mode) {
    case 'online':
      return Object.freeze({ mode, ...QUICK, side: localSlot === 'p2' ? 'p2' : 'p1' });
    case 'local':
    case 'watch':
      return Object.freeze({ mode, ...SHARED });
    case 'practice':
      return Object.freeze({ mode, side: 'p1', ejections: 'sided', endings: null, music: 'ambience' });
    case 'adventure':
      return Object.freeze({ mode, ...QUICK });
    default:
      return Object.freeze({ mode: 'quick-battle', ...QUICK });
  }
}

// The ejection sound for the fighter of slot `slot` leaving play.
export function ejectionSound(perspective, slot) {
  if (perspective.ejections !== 'sided') return SFX.ejectUniversal;
  return slot === perspective.side ? SFX.ejectPlayer : SFX.ejectOpponent;
}

// The post-match version ('victory', 'defeat' or 'draw') for a match won
// by `winner` ('p1', 'p2', or null for a draw), or null when the mode has
// no music (Practice Ground).
export function endingVersion(perspective, winner) {
  if (!perspective.endings) return null;
  if (!winner) return 'draw';
  if (perspective.endings === 'victory') return 'victory';
  return winner === perspective.side ? 'victory' : 'defeat';
}
