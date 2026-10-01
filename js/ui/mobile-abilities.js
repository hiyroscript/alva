// Mobile ability presentation, authored in character.mobileAbilities.
// The loadout selects the ground/air move; preview (or previews.ground)
// selects its ground/shared artwork and previews.air selects a distinct
// airborne move. Each descriptor is { animation, frame, collection? }:
// a zero-based frame in animations, or explicitly projectileAnimations.
// No duplicated asset paths and no character-specific rendering branches.
// Unavailable air moves keep their ground artwork, visibly inactive.
// Missing/failed art uses a glyph (fallbackIcon may override the neutral
// one). Labels follow the interface language. Jump is always universal.

import { t, hasTranslation } from '../core/i18n.js';
import { COMBAT_BUTTONS, NUMBERED_ATTACKS } from '../config.js';
import { ICONS } from './icons.js';
import { abilityName } from '../data/abilities.js';
import { specialAction } from '../data/loadout.js';

// The touch buttons whose look belongs to the fighter: every combat button
// (COMBAT_BUTTONS in js/config.js). Shield, Jump, runLeft, runRight and
// the mouvement buttons are universal.
export const ABILITY_ACTIONS = COMBAT_BUTTONS;

// The touch buttons drawn with a frame of the fighter's own art: the extra
// attack and every numbered attack. Transform and Jump keep their glyphs.
export const SPRITE_BUTTONS = Object.freeze(['extra_attack', ...NUMBERED_ATTACKS]);

// The neutral glyph of each button with no frame of its own to show: one
// that tells them apart (a ring, one pip per attack number, the star, the
// jump arrow), never a fighter's.
const FALLBACK_ICONS = Object.freeze({
  extra_attack: 'ring', transform: 'transform', jump: 'jump',
  attack1: 'pip1', attack2: 'pip2', attack3: 'pip3', attack4: 'pip4', attack5: 'pip5',
});

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
//   'absent'       left out of its `actions`: a button the fighter does not
//                  have at all (attack3 to attack5 for a fighter with fewer
//                  numbered attacks; an extra_attack it has none of), so it
//                  shows no button
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

// Previews already reported as naming no frame, so each warns once.
const reported = new Set();

// Read the same loadout as Fighter.attackFor; a special is ground-only.
export function abilityMove(def, action, airborne = false) {
  const special = specialAction(def, action);
  if (special) return airborne ? null : special.id;
  const mapping = def?.actions?.[action];
  return typeof mapping === 'string' ? mapping : mapping?.[airborne ? 'air' : 'ground'] ?? null;
}

export function abilityAvailable(def, action, airborne = false) {
  if (!def?.actions) return true;
  const move = abilityMove(def, action, airborne);
  return !!move && !(airborne && def.attacks?.[move]?.groundOnly);
}

// The frame `def` shows on `action`'s button (one of SPRITE_BUTTONS):
// { url, animation, frame, mirrored }, the file of frame `frame` of its
// clip `animation`, mirrored when that clip's art faces left (so every
// preview faces right, the way the buttons read). Null when there is none
// to show: no fighter, no preview authored, or a preview naming a clip or
// frame the fighter does not have (reported once, never a crash).
export function previewFrame(def, action, airborne = false) {
  const own = def?.mobileAbilities?.[action];
  const move = abilityMove(def, action, airborne);
  const ground = abilityMove(def, action, false);
  // An unavailable air move keeps its ground artwork, marked inactive by
  // TouchControls. A distinct air move never silently borrows ground art.
  const context = airborne && move && move !== ground ? 'air' : 'ground';
  const preview = own?.previews?.[context] ?? (context === 'ground' ? own?.preview : null);
  if (!preview || !SPRITE_BUTTONS.includes(action)) return null;
  const collection = preview.collection ?? 'animations';
  const clip = ['animations', 'projectileAnimations'].includes(collection) ? def[collection]?.[preview.animation] : null;
  const url = Number.isInteger(preview.frame) ? clip?.frames?.[preview.frame] : undefined;
  if (typeof url !== 'string') {
    const key = `${def.id}.${action}.${context}.${collection}.${preview.animation}.${preview.frame}`;
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(`[Alva] #${def.id}'s ${action} button preview names no frame ("${preview.animation}" frame ${preview.frame}); showing a neutral glyph.`);
    }
    return null;
  }
  const facing = clip.sourceFacing ?? def.sourceFacing ?? 1;
  return { url, animation: preview.animation, frame: preview.frame, mirrored: facing < 0 };
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
  // A button drawn with a glyph rather than art (Transform) shows the
  // fighter's own glyph when it presents one (`icon`, a key of ICONS), else
  // the star; every other button's glyph is the neutral one.
  const glyph = SPRITE_BUTTONS.includes(action) ? null : ICONS[own?.icon];
  return {
    label: key ? t(key) : airName || own?.label,
    sprite: previewFrame(def, action, airborne),
    icon: glyph || ICONS[own?.fallbackIcon] || ICONS[FALLBACK_ICONS[action]],
    pending: presence === 'reserved',
  };
}

// Jump always keeps the same upward arrow and universal name.
export function jumpArt() {
  return { sprite: null, icon: ICONS.jump };
}
