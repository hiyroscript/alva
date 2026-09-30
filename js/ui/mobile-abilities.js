// Mobile presentation of a fighter's own abilities: the icon and accessible
// name each fighter-specific touch button shows (Shuriken, Punch and Kick
// for #0001), whether it shows as reserved, and whether the fighter has
// the ability at all. Authored per fighter as `mobileAbilities` in
// js/data/characters.js and read only here: UI data, never combat data.
// Which abilities a fighter has comes from its `actions`, the same data
// combat and the CPU go by, so the buttons can never offer a move the
// fighter does not have. The buttons keep sending the uniqueba / transform
// / ba1 / ba2 control codenames, so the internal input names are the same
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

// How `def` has the ability on `action`'s button, from its `actions`:
//
//   'implemented'  mapped to a move: the fighter's own button
//   'reserved'     mapped to null, or Transform with nothing of the
//                  fighter's own to present: wired, a move still to come,
//                  shown dashed
//   'absent'       left out of its `actions`: a move the fighter does not
//                  possess at all (e.g. a fighter whose moves are not
//                  authored yet), so it has no button
//
// With no `actions` to go by (no fighter named yet) every button stays,
// Transform reserved. A fighter that presents its own Transform (in
// `mobileAbilities`) is never shown reserved.
export function abilityPresence(def, action) {
  const actions = def?.actions;
  if (actions && !Object.hasOwn(actions, action)) return 'absent';
  const own = def?.mobileAbilities?.[action];
  if (!own && (RESERVED.has(action) || actions?.[action] === null)) return 'reserved';
  return 'implemented';
}

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
// `pending` whether it shows as reserved. Null when the fighter does not
// have the ability at all (see abilityPresence): there is no button to
// present, not even a neutral one.
export function mobileAbility(def, action) {
  const presence = abilityPresence(def, action);
  if (presence === 'absent') return null;
  const own = def?.mobileAbilities?.[action];
  const key = mobileAbilityLabelKey(def, action);
  return {
    label: key ? t(key) : own.label,
    icon: ICONS[own?.icon] || ICONS[FALLBACK_ICONS[action]],
    pending: presence === 'reserved',
  };
}
