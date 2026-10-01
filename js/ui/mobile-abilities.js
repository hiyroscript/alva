// Mobile presentation of a fighter's own buttons: the accessible name each
// fighter-specific touch button has (Shuriken, Punch, Kick, Clone Attack and
// Sphere Rush for #0001), the frame of the fighter's own art it shows on the
// ground and in the air, whether it shows as reserved or out of reach, and
// whether the fighter has the ability at all. Authored per fighter as
// `mobileAbilities` in js/data/characters.js and read only here: UI data,
// never combat data. Which abilities a fighter has, and which move each
// button makes on the ground and in the air, comes from its `actions`, the
// same data combat and the CPU go by, so the buttons can never offer a move
// the fighter does not have, and every numbered attack it has is a button
// (see js/data/loadout.js), whatever kind of move it is. The buttons keep
// sending the extra_attack / transform / attack1 ... attack5 control
// codenames, so the internal input names are the same whatever a button
// looks like, and nothing a button shows decides what it does.
//
// Art: each of SPRITE_BUTTONS shows one frame of the fighter's own art for
// the move it makes where the fighter is. An entry authors it as `preview`
// (one picture, on the ground and in the air) or `previews: { ground, air }`
// (one for each). A preview is { animation, frame }: a clip of the
// fighter's `animations` and an index in its frame list, counted from 0 as
// visual.portrait's is, in its own colours. It may name another of the
// fighter's clip collections (`collection`: 'projectileAnimations' or
// 'effectAnimations', see PREVIEW_COLLECTIONS), so a button can show what
// its move throws, and a glyph of ICONS to show without its frame (`icon`);
// a per-state preview may also name the button for that state (`label`).
// The frame is authored, never guessed from attack data or file names, and
// its file is the clip's own: no path is written twice. In the air a button
// whose move has a mid-air version shows that one's preview (and name); a
// button whose move is ground-only there (a summon, a technique, a
// ground-only attack) keeps its ground picture, shown out of reach
// (`unavailable`), and still sends its input. Transform keeps its star glyph
// (dashed while reserved), and the Shield, Jump and movement buttons are
// universal glyphs (js/game/touch-controls.js). A button with no frame to
// show (no fighter named yet, a layout editor's absent button, a preview
// that names no frame) shows a glyph instead: its preview's `icon`, else a
// neutral one.
//
// Names are shown in the interface language (js/core/i18n.js): a fighter's
// own name for a button where the translations have it, the neutral control
// name where the fighter has none, and otherwise the authored name as it is.

import { t, hasTranslation } from '../core/i18n.js';
import { COMBAT_BUTTONS, NUMBERED_ATTACKS } from '../config.js';
import { specialAction } from '../data/loadout.js';
import { ICONS } from './icons.js';

// The touch buttons whose look belongs to the fighter: every combat button
// (COMBAT_BUTTONS in js/config.js). The rest (shield, jump, runLeft,
// runRight and the mouvement buttons) are universal, the same for everyone.
export const ABILITY_ACTIONS = COMBAT_BUTTONS;

// The touch buttons drawn with a frame of the fighter's own art: the extra
// attack and every numbered attack. Transform keeps its glyph, and Jump its
// up arrow, the same for every fighter wherever it is.
export const SPRITE_BUTTONS = Object.freeze(['extra_attack', ...NUMBERED_ATTACKS]);

// The fighter's clip collections a preview may name (`collection`): its own
// poses (the default), the art of what it throws, and its effects.
export const PREVIEW_COLLECTIONS = Object.freeze(['animations', 'projectileAnimations', 'effectAnimations']);

// The neutral glyph of each button with no frame of its own to show: one
// that tells them apart (a ring, one pip per attack number, the star),
// never a fighter's.
const FALLBACK_ICONS = Object.freeze({
  extra_attack: 'ring', transform: 'transform',
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

// The move `def`'s `action` button makes on the ground, or in the air when
// `airborne`, by its `actions` (as Fighter.attackFor and tryAction go by
// them): an ordinary attack's ground or mid-air version, the id of a summon
// or a technique on the ground, the one attack of a button mapped to one
// wherever that attack may start. Null where the button makes no move: one
// the fighter does not have or that is reserved, and in the air a summon,
// a technique or a ground-only attack.
export function buttonMove(def, action, airborne = false) {
  const mapping = def?.actions?.[action];
  if (!mapping) return null;
  if (specialAction(def, action)) return airborne ? null : mapping.id;
  const id = typeof mapping === 'string' ? mapping : airborne ? mapping.air : mapping.ground;
  if (!id || (airborne && def.attacks?.[id]?.groundOnly)) return null;
  return id;
}

// Which of its states `action`'s button presents on `def` (`state`:
// 'ground' or 'air') and whether its move is out of reach where the
// fighter is (`unavailable`). On the ground, the ground. In the air, the
// air if the button has a move there; if not, the ground, out of reach. A
// button with no fighter's move to go by (none named, or reserved) is
// always shown as on the ground.
function presentation(def, action, airborne) {
  if (!airborne || !def?.actions || abilityPresence(def, action) !== 'implemented') {
    return { state: 'ground', unavailable: false };
  }
  return buttonMove(def, action, true) ? { state: 'air', unavailable: false } : { state: 'ground', unavailable: true };
}

// `own`'s preview for `state`: its `previews[state]` (none if it authors
// none for that state), else its one `preview`, the same in both.
function previewOf(own, state) {
  if (own?.previews) return own.previews[state] ?? null;
  return own?.preview ?? null;
}

// The translation key of `action`'s name on `def`'s touch button, on the
// ground or in the air (`airborne`): the fighter's own name for that state
// or for the button where the translations know it, the neutral control
// name where the fighter authors none, or null for a name only the
// fighter's data has (shown as authored).
export function mobileAbilityLabelKey(def, action, airborne = false) {
  const own = def?.mobileAbilities?.[action];
  const { state } = presentation(def, action, airborne);
  if (own?.previews?.[state]?.label) {
    const key = `ability.${def.id}.${action}.${state}`;
    return hasTranslation(key) ? key : null;
  }
  if (!own?.label) return `control.${action}`;
  const key = `ability.${def.id}.${action}`;
  return hasTranslation(key) ? key : null;
}

// Previews already reported as naming no frame, so each warns once.
const reported = new Set();

// The frame `def` shows on `action`'s button (one of SPRITE_BUTTONS) on the
// ground, or in the air when `airborne` (see presentation): { url,
// collection, animation, frame, mirrored }, the file of frame `frame` of
// the clip `animation` in `collection`, mirrored when that clip's art faces
// left (so every preview faces right, the way the buttons read; the art of
// a projectile or an effect is direction-neutral unless it says
// otherwise). Null when there is none to show: no fighter, no preview
// authored for that state, or a preview naming a collection, clip or frame
// the fighter does not have (reported once, never a crash).
export function previewFrame(def, action, airborne = false) {
  if (!SPRITE_BUTTONS.includes(action)) return null;
  const { state } = presentation(def, action, airborne);
  const preview = previewOf(def?.mobileAbilities?.[action], state);
  if (!preview) return null;
  const collection = preview.collection ?? 'animations';
  const clip = PREVIEW_COLLECTIONS.includes(collection) ? def[collection]?.[preview.animation] : undefined;
  const url = Number.isInteger(preview.frame) ? clip?.frames?.[preview.frame] : undefined;
  if (typeof url !== 'string') {
    const key = `${def.id}.${action}.${state}`;
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(`[Alva] #${def.id}'s ${action} button ${state} preview names no frame ("${collection}.${preview.animation}" frame ${preview.frame}); showing a glyph.`);
    }
    return null;
  }
  const facing = clip.sourceFacing ?? (collection === 'animations' ? def.sourceFacing ?? 1 : 0);
  return { url, collection, animation: preview.animation, frame: preview.frame, mirrored: facing < 0 };
}

// { label, sprite, icon, pending, unavailable } for `action` on `def`'s
// touch controls, on the ground or in the air (`airborne`): `label` is the
// button's accessible name, `sprite` the frame of the fighter's art it
// shows (see previewFrame; null for none), `icon` the SVG glyph it shows
// instead when it has no sprite, or should its sprite fail to load,
// `pending` whether it shows as reserved and `unavailable` whether its move
// is out of reach where the fighter is (ground-only, in the air). Null
// when the fighter does not have the ability at all (see abilityPresence):
// there is no button to present, not even a neutral one.
export function mobileAbility(def, action, airborne = false) {
  const presence = abilityPresence(def, action);
  if (presence === 'absent') return null;
  const own = def?.mobileAbilities?.[action];
  const { state, unavailable } = presentation(def, action, airborne);
  const key = mobileAbilityLabelKey(def, action, airborne);
  // A button drawn with art falls back on its preview's own glyph; one
  // drawn with a glyph (Transform) shows the fighter's own glyph when it
  // presents one (`icon`, a key of ICONS). Else the neutral one.
  const glyph = SPRITE_BUTTONS.includes(action) ? ICONS[previewOf(own, state)?.icon] : ICONS[own?.icon];
  return {
    label: key ? t(key) : own.previews?.[state]?.label ?? own.label,
    sprite: previewFrame(def, action, airborne),
    icon: glyph || ICONS[FALLBACK_ICONS[action]],
    pending: presence === 'reserved',
    unavailable,
  };
}
