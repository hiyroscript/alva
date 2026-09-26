// Mobile presentation of a fighter's own abilities: the icon and accessible
// name each fighter-specific touch button shows (Shuriken, Punch and Kick
// for #0001). Authored per fighter as `mobileAbilities` in
// js/data/characters.js and read only here: UI data, never combat data. The
// buttons keep sending the uniqueba / ba1 / ba2 control codenames, so the
// internal input names are the same whatever a button looks like.

import { ACTION_LABELS } from '../config.js';
import { ICONS } from './icons.js';

// The touch buttons whose look belongs to the fighter. The rest (shield,
// transform, jump, charge, runLeft, runRight and the mouvement buttons) are
// universal, the same for everyone.
export const ABILITY_ACTIONS = Object.freeze(['uniqueba', 'ba1', 'ba2']);

// A fighter with no entry for one of them (a future, unfinished fighter)
// still gets a usable button: the generic action name and a neutral glyph
// that tells the three apart.
const FALLBACK_ICONS = Object.freeze({ uniqueba: 'ring', ba1: 'pip1', ba2: 'pip2' });

// { label, icon } for `action` on `def`'s touch controls: `label` is the
// button's accessible name, `icon` the SVG markup it shows.
export function mobileAbility(def, action) {
  const own = def?.mobileAbilities?.[action];
  return {
    label: own?.label || ACTION_LABELS[action],
    icon: ICONS[own?.icon] || ICONS[FALLBACK_ICONS[action]],
  };
}
