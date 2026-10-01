// In-game ability names: what each character calls its moves. The moves
// themselves go by the universal move codenames (MOVES in js/config.js),
// the same for every character; a character names them in its own
// `abilityNames` (js/data/characters.js), and a move it leaves out keeps
// the neutral name. Names only: nothing here reaches combat, and no screen
// shows them yet.

import { MOVES } from '../config.js';

// `def`'s name for `move` (a move codename): its own, else the neutral one
// ("Mid-air Attack 1"). Null for anything that is not a move codename. It
// names the move whether or not the character has it (a reserved transform
// included), and whatever role it plays for that character (attack3 is
// "Clone Attack" for #0001, a summon, and "Attack 3" for a
// character with no name of its own for it): what a character can do is
// its loadout's business, not its names'.
export function abilityName(def, move) {
  const neutral = MOVES[move]?.label;
  if (!neutral) return null;
  return def?.abilityNames?.[move] || neutral;
}
