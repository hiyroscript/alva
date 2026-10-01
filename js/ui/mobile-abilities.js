// Mobile presentation of a fighter's own buttons: the accessible name each
// fighter-specific touch button has (Shuriken, Punch, Kick, Clone Attack and
// Sphere Rush for #0001), the frame of the fighter's own art it shows,
// whether it shows as reserved, and whether the fighter has the ability at
// all. Authored per fighter as `mobileAbilities` in js/data/characters.js
// and read only here: UI data, never combat data. Which abilities a fighter
// has comes from its `actions`, the same data combat and the CPU go by, so
// the buttons can never offer a move the fighter does not have, and every
// numbered attack it has is a button (see js/data/loadout.js), whatever
// kind of move it is. The buttons keep sending the extra_attack /
// transform / attack1 ... attack5 / jump control codenames, so the internal
// input names are the same whatever a button looks like, and nothing a
// button shows decides what it does.
//
// Art: each of SPRITE_BUTTONS shows one frame of the fighter's own
// animations, the one its `preview` names ({ animation, frame }: a clip of
// the fighter's `animations`, and an index in that clip's frame list,
// counted from 0 as visual.portrait's is), in its own colours. The frame is
// authored, never guessed from attack data or file names, and its file is
// the clip's own: no path is written twice. Transform keeps its star glyph
// (dashed while reserved), and the Shield, Down and movement buttons are
// universal glyphs (js/game/touch-controls.js). A button with no frame to
// show (no fighter named yet, a layout editor's absent button, a preview
// that names no frame) shows a neutral glyph instead.
//
// Names are shown in the interface language (js/core/i18n.js): a fighter's
// own name for a button where the translations have it, the neutral control
// name where the fighter has none, and otherwise the authored name as it is.

import { t, hasTranslation } from '../core/i18n.js';
import { COMBAT_BUTTONS, NUMBERED_ATTACKS } from '../config.js';
import { ICONS } from './icons.js';

// The touch buttons whose look belongs to the fighter: every combat button
// (COMBAT_BUTTONS in js/config.js). The rest (shield, jump, down,
// runLeft, runRight and the mouvement buttons) are universal, the same for
// everyone, though Jump shows the fighter's own jump (SPRITE_BUTTONS).
export const ABILITY_ACTIONS = COMBAT_BUTTONS;

// The touch buttons drawn with a frame of the fighter's own art: the extra
// attack, every numbered attack and Jump. Transform is not one of them: it
// keeps its glyph.
export const SPRITE_BUTTONS = Object.freeze(['extra_attack', ...NUMBERED_ATTACKS, 'jump']);

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
export function mobileAbilityLabelKey(def, action) {
  const own = def?.mobileAbilities?.[action];
  if (!own?.label) return `control.${action}`;
  const key = `ability.${def.id}.${action}`;
  return hasTranslation(key) ? key : null;
}

// Previews already reported as naming no frame, so each warns once.
const reported = new Set();

// The frame `def` shows on `action`'s button (one of SPRITE_BUTTONS):
// { url, animation, frame, mirrored }, the file of frame `frame` of its
// clip `animation`, mirrored when that clip's art faces left (so every
// preview faces right, the way the buttons read). Null when there is none
// to show: no fighter, no preview authored, or a preview naming a clip or
// frame the fighter does not have (reported once, never a crash).
export function previewFrame(def, action) {
  const preview = def?.mobileAbilities?.[action]?.preview;
  if (!preview || !SPRITE_BUTTONS.includes(action)) return null;
  const clip = def.animations?.[preview.animation];
  const url = Number.isInteger(preview.frame) ? clip?.frames?.[preview.frame] : undefined;
  if (typeof url !== 'string') {
    const key = `${def.id}.${action}`;
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
export function mobileAbility(def, action) {
  const presence = abilityPresence(def, action);
  if (presence === 'absent') return null;
  const own = def?.mobileAbilities?.[action];
  const key = mobileAbilityLabelKey(def, action);
  // A button drawn with a glyph rather than art (Transform) shows the
  // fighter's own glyph when it presents one (`icon`, a key of ICONS), else
  // the star; every other button's glyph is the neutral one.
  const glyph = SPRITE_BUTTONS.includes(action) ? null : ICONS[own?.icon];
  return {
    label: key ? t(key) : own.label,
    sprite: previewFrame(def, action),
    icon: glyph || ICONS[FALLBACK_ICONS[action]],
    pending: presence === 'reserved',
  };
}

// The universal Jump button's art on `def`'s touch controls: its own jump
// frame (`mobileAbilities.jump.preview`) and the jump arrow when it has
// none (or the frame fails to load). Jump keeps its universal name.
export function jumpArt(def) {
  return { sprite: previewFrame(def, 'jump'), icon: ICONS[FALLBACK_ICONS.jump] };
}
