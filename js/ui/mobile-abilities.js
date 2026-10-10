// Mobile ability presentation, authored in character.mobileAbilities.
// The loadout selects the ground/air move; preview (or previews.ground)
// selects its ground/shared artwork and previews.air selects a distinct
// airborne move. Each descriptor is { animation, frame, collection? }:
// a zero-based frame in animations, or explicitly projectileAnimations.
// No duplicated asset paths and no character-specific rendering branches.
// Unavailable air moves keep their ground artwork, visibly inactive.
// Missing/failed art uses a glyph (fallbackIcon may override the neutral
// one). Labels follow the interface language. Jump is always universal.

import { t, hasTranslation } from '../localization/i18n.js';
import { COMBAT_BUTTONS } from '../config.js';
import { ICONS } from './icons.js';
import { abilityName } from '../data/abilities.js';
import { abilityMove, previewFrame } from '../data/ability-preview.js';
export { SPRITE_BUTTONS, abilityMove, abilityAvailable, previewFrame } from '../data/ability-preview.js';

// The touch buttons whose look belongs to the fighter: every combat button
// (COMBAT_BUTTONS in js/config.js). Shield, Jump, runLeft, runRight and
// the mouvement buttons are universal.
export const ABILITY_ACTIONS = COMBAT_BUTTONS;

// The neutral glyph of each button with no frame of its own to show: one
// that tells them apart (a ring, one pip per attack number, the
// jump arrow), never a fighter's.
const FALLBACK_ICONS = Object.freeze({
  extra_attack: 'ring', jump: 'jump',
  attack1: 'pip1', attack2: 'pip2', attack3: 'pip3', attack4: 'pip4', attack5: 'pip5',
});

// How `def` has the ability on `action`'s button, from its `actions`:
//
//   'implemented'  mapped to a move: the fighter's own button
//   'reserved'     mapped to null with no presentation of its own,
//                  shown dashed
//   'absent'       left out of its `actions`: a button the fighter does not
//                  have at all (attack3 to attack5 for a fighter with fewer
//                  numbered attacks; an extra_attack it has none of), so it
//                  shows no button
//
// With no `actions` to go by (no fighter named yet) every button stays.
export function abilityPresence(def, action) {
  const actions = def?.actions;
  if (actions && !Object.hasOwn(actions, action)) return 'absent';
  const own = def?.mobileAbilities?.[action];
  if (!own && actions?.[action] === null) return 'reserved';
  return 'implemented';
}

// The translation key of `action`'s name on `def`'s touch button: the
// fighter's own name where the translations know it, the neutral control
// name where the fighter authors none, or null for a name only the
// fighter's data has (shown as authored).
export function mobileAbilityLabelKey(def, action, airborne = false) {
  const move = abilityMove(def, action, airborne);
  if (airborne && move && move !== abilityMove(def, action, false)) {
    const key = `ability.${def.id}.${move}`;
    return hasTranslation(key) ? key : null;
  }
  const own = def?.mobileAbilities?.[action];
  if (!own?.label) return `control.${action}`;
  const key = `ability.${def.id}.${action}`;
  return hasTranslation(key) ? key : null;
}

// { label, sprite, icon, pending } for `action` on `def`'s touch controls:
// `label` is the button's accessible name, `sprite` the frame of the
// fighter's art it shows (see previewFrame; null for none), `icon` the SVG
// glyph it shows instead when it has no sprite, or should its sprite fail
// to load, and `pending` whether it shows as reserved. Null when the
// fighter does not have the ability at all (see abilityPresence): there is
// no button to present, not even a neutral one.
export function mobileAbility(def, action, airborne = false) {
  const presence = abilityPresence(def, action);
  if (presence === 'absent') return null;
  const own = def?.mobileAbilities?.[action];
  const key = mobileAbilityLabelKey(def, action, airborne);
  const move = abilityMove(def, action, airborne);
  const airName = airborne && move && move !== abilityMove(def, action, false) ? abilityName(def, move) : null;
  return {
    label: key ? t(key) : airName || own?.label,
    sprite: previewFrame(def, action, airborne),
    icon: ICONS[own?.fallbackIcon] || ICONS[FALLBACK_ICONS[action]],
    pending: presence === 'reserved',
  };
}

// Jump always keeps the same upward arrow and universal name.
export function jumpArt() {
  return { sprite: null, icon: ICONS.jump };
}
