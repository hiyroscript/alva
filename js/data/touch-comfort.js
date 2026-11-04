// The touch comfort rules: what every fighter's touch controls must be, a
// strict rule for every fighter on the roster and every fighter added
// later, the touch counterpart of the controller comfort rules
// (comfortProblems in js/data/controller-profiles.js). Someone who has
// never played Alva must be able to pick up a phone or a tablet, choose any
// fighter and play it with their thumbs without fighting the buttons.
//
// The rules (docs/characters/adding-characters.md, The touch comfort rules)
// are of two kinds. The shared touch controls (js/ui/touch-controls.js,
// js/core/touch-layout.js, css/touch-controls.css) keep the ones no
// definition can touch: the universal controls (Run, Down, the Dash
// buttons, Jump, Shield) the same for everyone, 130 % by default and the
// fighter's other moves 110 %, flush in the corners inside the safe area,
// nothing overlapping, nothing past the top HUD, nothing shrunk to fit.
// What a definition could break, this module checks, and the registry
// (js/data/characters.js) refuses a definition that breaks any of it:
//
//   1  One button a move, pressed directly. Every combat button the fighter
//      has (its `actions`) starts its move in one plain tap: one move name,
//      a { ground, air } pair or a Special ({ type, id }), or null for a
//      reserved one. Never a combination, a held stance, a modifier, a
//      direction, a double tap or a sequence.
//   2  The fighter never places, sizes or adds a touch control. Its
//      `mobileAbilities` only say what a button shows (`label`, `preview`,
//      `previews`, `fallbackIcon`), for its own combat buttons only (never
//      Jump, Shield or a movement control, whose glyphs are universal),
//      and it has no touch layout of its own (no `touch`, `touchControls`,
//      `touchLayout` or `touchButtons`).
//   3  The button shows the move. Every combat button the fighter has
//      (not a reserved one) has a name (`label`) and a frame of the move's
//      own art (`preview`, resolved by previewFrame); a distinct air move
//      has its own (`previews.air`).
//   4  The Mash Combo row. The two places beside Jump hold only the
//      fighter's two Mash Combo buttons (mashRow in js/data/mash-combo.js),
//      the place next to Jump never empty: a pair with one button puts it
//      there.
//
// Inputs: a character definition. Outputs: TOUCH_COMFORT,
// touchComfortProblems, assertTouchComfort. Important constraints: frozen
// and universal; nothing here names a fighter.

import { COMBAT_BUTTONS } from '../config.js';
import { abilityMove, previewFrame } from './ability-preview.js';
import { mashRow } from './mash-combo.js';

// What a fighter's touch buttons may say about themselves, and nothing else.
export const TOUCH_COMFORT = Object.freeze({
  abilityKeys: Object.freeze(['label', 'preview', 'previews', 'fallbackIcon']),
  previewKeys: Object.freeze(['animation', 'frame', 'collection']),
  previewPlaces: Object.freeze(['ground', 'air']),
  // Definition fields that would be a touch layout of the fighter's own.
  layoutFields: Object.freeze(['touch', 'touchControls', 'touchLayout', 'touchButtons']),
});

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Whether `mapping` (one of `actions`) starts its move in one plain tap.
function directMapping(mapping) {
  if (mapping === null || typeof mapping === 'string') return true;
  if (!isObject(mapping)) return false;
  const keys = Object.keys(mapping);
  if (keys.every((k) => k === 'ground' || k === 'air')) return keys.length > 0 && keys.every((k) => typeof mapping[k] === 'string' || mapping[k] === null);
  // A Special: { type, id }.
  return keys.length === 2 && keys.includes('type') && keys.includes('id') && typeof mapping.id === 'string';
}

// Every way `def`'s touch controls break the touch comfort rules, one
// sentence each.
export function touchComfortProblems(def) {
  const problems = [];
  const say = (text) => problems.push(text);
  const actions = isObject(def?.actions) ? def.actions : {};
  const has = (button) => Object.hasOwn(actions, button);
  // 1: one button a move, pressed directly.
  for (const button of COMBAT_BUTTONS) {
    if (has(button) && !directMapping(actions[button])) {
      say(`actions.${button} is not one move in one plain tap (a move name, { ground, air } or a Special): no combination, hold, modifier or sequence on a touch button`);
    }
  }
  // 2: the fighter never places, sizes or adds a touch control.
  for (const field of TOUCH_COMFORT.layoutFields) {
    if (Object.hasOwn(def ?? {}, field)) say(`${field}: a fighter has no touch layout of its own; the shared touch controls place every button`);
  }
  const own = isObject(def?.mobileAbilities) ? def.mobileAbilities : {};
  for (const [button, ability] of Object.entries(own)) {
    if (!COMBAT_BUTTONS.includes(button)) {
      say(`mobileAbilities.${button}: only the fighter's own combat buttons show its art; ${button} is universal`);
      continue;
    }
    if (!has(button)) say(`mobileAbilities.${button}: the fighter has no ${button} button`);
    if (!isObject(ability)) {
      say(`mobileAbilities.${button} is not an object`);
      continue;
    }
    for (const key of Object.keys(ability)) {
      if (!TOUCH_COMFORT.abilityKeys.includes(key)) say(`mobileAbilities.${button}.${key}: a button only says what it shows (${TOUCH_COMFORT.abilityKeys.join(', ')}), never where it stands or how big it is`);
    }
    const previews = [['preview', ability.preview]];
    if (ability.previews !== undefined) {
      if (!isObject(ability.previews)) say(`mobileAbilities.${button}.previews is not an object`);
      else {
        for (const [place, preview] of Object.entries(ability.previews)) {
          if (!TOUCH_COMFORT.previewPlaces.includes(place)) say(`mobileAbilities.${button}.previews.${place}: only ground and air`);
          else previews.push([`previews.${place}`, preview]);
        }
      }
    }
    for (const [where, preview] of previews) {
      if (!isObject(preview)) continue;
      for (const key of Object.keys(preview)) {
        if (!TOUCH_COMFORT.previewKeys.includes(key)) say(`mobileAbilities.${button}.${where}.${key}: a preview is a frame of the fighter's art (${TOUCH_COMFORT.previewKeys.join(', ')}) and nothing else`);
      }
    }
  }
  // 3: every combat button it has shows its move.
  for (const button of COMBAT_BUTTONS) {
    if (!has(button) || actions[button] === null) continue;
    const ability = isObject(own[button]) ? own[button] : null;
    if (!ability?.label) say(`mobileAbilities.${button}.label: every touch button the fighter has is named`);
    if (!ability?.preview) say(`mobileAbilities.${button}.preview: every touch button the fighter has shows a frame of its move's own art`);
    else if (!previewFrame(def, button, false)) say(`mobileAbilities.${button}.preview names no frame the fighter has`);
    const ground = abilityMove(def, button, false);
    const air = abilityMove(def, button, true);
    if (air && ground && air !== ground && !ability?.previews?.air) say(`mobileAbilities.${button}.previews.air: its distinct air move (${air}) shows its own art`);
  }
  // 4: the Mash Combo row.
  const row = mashRow(def);
  if (!row[1]) say('the place next to Jump would be empty: at least one Mash Combo move must be on a button');
  for (const button of row) {
    if (button && !COMBAT_BUTTONS.includes(button)) say(`${button} beside Jump is no combat button`);
  }
  return problems;
}

// Throws, naming every problem, if `def` breaks the touch comfort rules.
export function assertTouchComfort(def) {
  const problems = touchComfortProblems(def);
  if (problems.length) {
    throw new Error(`[Alva] Character "${def?.id}" breaks the touch comfort rules:\n- ${problems.join('\n- ')}`);
  }
}
