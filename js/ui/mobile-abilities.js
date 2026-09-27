// Mobile presentation of a fighter's own abilities: the icon and accessible
// name each fighter-specific touch button shows (Shuriken, Punch and Kick
// for #0001), and whether it shows as reserved. Authored per fighter as
// `mobileAbilities` in js/data/characters.js and read only here: UI data,
// never combat data. The buttons keep sending the uniqueba / transform /
// ba1 / ba2 control codenames, so the internal input names are the same
// whatever a button looks like.
//
// Names are shown in the interface language (js/core/i18n.js): a fighter's
// own name for a button where the translations have it, the neutral control
// name where the fighter has none, and otherwise the authored name as it is.

import { t, hasTranslation } from '../core/i18n.js';
import { ICONS } from './icons.js';

// The touch buttons whose look belongs to the fighter. The rest (shield,
// jump, charge, runLeft, runRight and the mouvement buttons) are universal,
// the same for everyone.
export const ABILITY_ACTIONS = Object.freeze(['uniqueba', 'transform', 'ba1', 'ba2']);

// A fighter with no entry for one of them (a future, unfinished fighter)
// still gets a usable button: the generic action name and a neutral glyph
// that tells them apart.
const FALLBACK_ICONS = Object.freeze({ uniqueba: 'ring', transform: 'transform', ba1: 'pip1', ba2: 'pip2' });

// Buttons shown as reserved (a dashed outline) while the fighter has no
// entry of its own for them: a fighter with a Transform presents it in its
// `mobileAbilities`, and without one it is the neutral star, dashed.
const RESERVED = new Set(['transform']);

// The translation key of `action`'s name on `def`'s touch button: the
// fighter's own name where the translations know it, the neutral control
// name where the fighter authors none, or null for a name only the
// fighter's data has (shown as authored).
export function mobileAbilityLabelKey(def, action) {
  const own = def?.mobileAbilities?.[action];
  if (!own?.label) return `control.${action}`;
  const key = `ability.${def.id}.${action}`;
  return hasTranslation(key) ? key : null;
}

// { label, icon, pending } for `action` on `def`'s touch controls: `label`
// is the button's accessible name, `icon` the SVG markup it shows and
// `pending` whether it shows as reserved.
export function mobileAbility(def, action) {
  const own = def?.mobileAbilities?.[action];
  const key = mobileAbilityLabelKey(def, action);
  return {
    label: key ? t(key) : own.label,
    icon: ICONS[own?.icon] || ICONS[FALLBACK_ICONS[action]],
    pending: !own && RESERVED.has(action),
  };
}
