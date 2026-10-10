// In-game ability names: what each character calls its moves. The moves
// themselves go by the universal move codenames (MOVES in js/config.js),
// the same for every character; a character names them in its own
// `abilityNames` (js/data/characters.js), and a move it leaves out keeps
// the neutral name. The touch resolver uses them for airborne move labels;
// nothing here reaches combat.

import { MOVES } from '../config.js';

// `def`'s name for `move` (a move codename): its own, else the neutral one
// ("Mid-air Attack 1"). Null for anything that is not a move codename. It
// names the move whether or not the character has it, and whatever role
// it plays for that character (attack4 is
// "Unlimited Void" for #0001, a technique, and "Attack 4" for a
// character with no name of its own for it): what a character can do is
// its loadout's business, not its names'.
export function abilityName(def, move) {
  const neutral = MOVES[move]?.label;
  if (!neutral) return null;
  return def?.abilityNames?.[move] || neutral;
}
