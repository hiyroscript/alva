// Shared ability artwork selection for touch buttons and canvas status.
import { NUMBERED_ATTACKS } from '../config.js';
import { specialAction } from './loadout.js';

// Extra and numbered attacks use fighter art; Jump keeps its glyph.
export const SPRITE_BUTTONS = Object.freeze(['extra_attack', ...NUMBERED_ATTACKS]);

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
// { url, collection, animation, frame, mirrored }, the file of frame `frame` of its
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
  return { url, collection, animation: preview.animation, frame: preview.frame, mirrored: facing < 0 };
}

