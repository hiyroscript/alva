// How controller inputs read on screen: each button by the name its own
// family gives it (Cross and Circle on a PlayStation pad, A and B on an
// Xbox pad, never one family's names for the other's buttons), a binding as
// one phrase ("R2 + Square", "Left stick down + Square", "Right stick up"),
// always naming the stick a direction is read on, its activation, and a
// small original controller diagram that lights the buttons and the stick
// (either one, with its direction) a binding uses. Presentation only:
// bindings themselves are normalized (js/data/controller-profiles.js).

import { t, hasTranslation } from '../localization/i18n.js';
import { buttonCode, buttonLabelKey, buttonGlyph, DEFAULT_FAMILY, FAMILIES } from '../core/gamepad-devices.js';
import { abilityName } from '../data/abilities.js';

// The families' own names (proper names, the same in every language).
export const FAMILY_NAMES = Object.freeze({ playstation: 'PlayStation', xbox: 'Xbox' });

// A family that is supported, else the default one.
export const displayFamily = (family) => (FAMILIES.includes(family) ? family : DEFAULT_FAMILY);

// `button`'s name on a `family` pad ('R2', 'Square', 'A', 'D-pad up').
export function buttonName(family, button, model = null) {
  const f = displayFamily(family);
  const code = buttonCode(f, button, model);
  if (code) return code;
  return t(buttonLabelKey(f, button, model));
}

// A stick's (or the Movement source's) name ('Left stick', 'Right stick',
// 'D-pad').
export const sourceName = (source) => t(`pad.source.${source}`);
export const stickName = sourceName;

// `direction` of `stick` ('Left stick down', 'Right stick forward').
export const directionName = (direction, stick) => t(`pad.direction.${direction}`, { source: sourceName(stick ?? 'leftStick') });

// A binding as one phrase, joined by "+": its direction (on its own
// stick), its modifier and its button ("Left stick down + Square", "R2 +
// Circle"), or for a stick input its modifier and the stick pushed ("Right
// stick up", "L2 + Right stick up").
export function bindingText(binding, family, model = null) {
  if (!binding) return t('pad.notBound');
  if ('source' in binding) return sourceName(binding.source);
  const parts = [];
  if (binding.button && binding.direction) parts.push(directionName(binding.direction, binding.stick));
  if (binding.modifier) parts.push(buttonName(family, binding.modifier, model));
  if (binding.button) parts.push(buttonName(family, binding.button, model));
  else if (binding.direction) parts.push(directionName(binding.direction, binding.stick));
  return parts.join(' + ');
}

// How `binding` activates, for `action` ({ kind }), as the editor says it:
// Press (Push for a stick), Modifier + press, Hold to activate, Hold;
// Jump's press-and-hold.
export function activationText(binding, action) {
  if (!binding || 'source' in binding) return '';
  if (action?.kind === 'jump' && binding.button) return t('pad.activation.jump');
  const stick = binding.button === null && !!binding.direction;
  if (binding.activation === 'press' && binding.modifier) return t(stick ? 'pad.activation.modifierPush' : 'pad.activation.modifierPress');
  if (binding.activation === 'press' && stick) return t('pad.activation.push');
  return t(`pad.activation.${binding.activation}`);
}

// Arrows for directions: 'forward' and 'back' as their side for a fighter
// facing `facing` (1 right, -1 left), or as » and « without one.
const ARROWS = Object.freeze({ left: '←', right: '→', up: '↑', down: '↓', horizontal: '↔', forward: '»', back: '«' });
export function directionArrow(direction, facing = null) {
  if ((direction === 'forward' || direction === 'back') && (facing === 1 || facing === -1)) {
    const right = direction === 'forward' ? facing > 0 : facing < 0;
    return right ? '→' : '←';
  }
  return ARROWS[direction] ?? '';
}

// A stick's short mark on a chip: L or R for the sticks, ✚ for the D-pad.
const STICK_MARKS = Object.freeze({ leftStick: 'L', rightStick: 'R', dpad: '✚', leftStickDpad: 'L✚' });
export const stickMark = (stick) => STICK_MARKS[stick] ?? '';

// A stick direction as a chip shows it: its stick's mark and its arrow
// ("R↑", "L↓").
export const stickGlyph = (stick, direction, facing = null) => `${stickMark(stick)}${directionArrow(direction, facing)}`;

// An action's name: a universal action's own, a move's by its fighter
// (`def`), in the interface language where there is a translation.
export function actionName(def, action) {
  if (action.kind !== 'attack') return t(`controller.action.${action.id}`);
  const key = `ability.${def?.id}.${action.place === 'air' && action.move !== action.control ? action.move : action.control}`;
  if (def && hasTranslation(key)) return t(key);
  return abilityName(def, action.move) ?? action.move;
}

// An action's one-line description, or null.
export function actionDescription(def, action) {
  const key = action.kind === 'attack' ? `ability.${def?.id}.${action.move}.description` : `controller.action.${action.id}.description`;
  if (hasTranslation(key)) return t(key);
  return action.kind === 'attack' ? def?.abilityDescriptions?.[action.move] ?? null : null;
}

// ---- The controller diagram ----------------------------------------------------------

// Where each button sits (viewBox 0 0 320 200). The D-pad and the left
// stick swap places between the families, as on the pads themselves.
const FACE = { south: [232, 126], east: [254, 104], west: [210, 104], north: [232, 82] };
const SHAPES = (family) => {
  const xbox = family === 'xbox';
  const pad = xbox ? [120, 146] : [86, 104];
  const left = xbox ? [86, 104] : [120, 146];
  return { pad, left, right: [200, 146] };
};

// The diagram's SVG markup for `family`, every button marked with
// data-pad-button so highlight() can light it.
export function diagramSVG(family) {
  const f = displayFamily(family);
  const { pad, left, right } = SHAPES(f);
  const g = (button) => buttonGlyph(f, button);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const label = (x, y, text, size = 9) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
  const rectBtn = (button, x, y, w, h, r, text) =>
    `<g class="pad-btn" data-pad-button="${button}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>${text ? label(x + w / 2, y + h / 2, text) : ''}</g>`;
  const circleBtn = (button, x, y, r, text, size) =>
    `<g class="pad-btn" data-pad-button="${button}"><circle cx="${x}" cy="${y}" r="${r}"/>${label(x, y, text, size)}</g>`;
  const [px, py] = pad;
  const stick = (button, [x, y], name) =>
    `<g class="pad-btn pad-stick" data-pad-button="${button}" data-pad-stick="${name}"><circle cx="${x}" cy="${y}" r="17"/><circle class="pad-stick-cap" cx="${x}" cy="${y}" r="10"/><text class="pad-arrow" x="${x}" y="${y}" font-size="11" text-anchor="middle" dominant-baseline="central"></text></g>`;
  return `<svg class="pad-diagram pad-diagram--${f}" viewBox="0 0 320 200" aria-hidden="true" focusable="false">
<path class="pad-body" d="M70 54H250C284 54 304 80 311 120C317 158 305 188 282 188C262 188 251 172 237 154H83C69 172 58 188 38 188C15 188 3 158 9 120C16 80 36 54 70 54Z"/>
${rectBtn('l2', 46, 6, 58, 18, 6, g('l2'))}${rectBtn('r2', 216, 6, 58, 18, 6, g('r2'))}
${rectBtn('l1', 46, 30, 58, 14, 5, g('l1'))}${rectBtn('r1', 216, 30, 58, 14, 5, g('r1'))}
<g class="pad-dpad" data-pad-stick="dpad">${rectBtn('dpadUp', px - 8, py - 24, 16, 16, 3, g('dpadUp'))}${rectBtn('dpadDown', px - 8, py + 8, 16, 16, 3, g('dpadDown'))}${rectBtn('dpadLeft', px - 24, py - 8, 16, 16, 3, g('dpadLeft'))}${rectBtn('dpadRight', px + 8, py - 8, 16, 16, 3, g('dpadRight'))}</g>
${Object.entries(FACE).map(([b, [x, y]]) => circleBtn(b, x, y, 11, g(b), f === 'playstation' ? 11 : 10)).join('')}
${rectBtn('select', 132, 86, 20, 11, 5.5, '')}${rectBtn('start', 168, 86, 20, 11, 5.5, '')}
${stick('l3', left, 'leftStick')}${stick('r3', right, 'rightStick')}
</svg>`;
}

// The diagram parts a stick is (the left stick and the D-pad for either).
const STICK_PARTS = Object.freeze({
  leftStick: ['leftStick'], rightStick: ['rightStick'], dpad: ['dpad'], leftStickDpad: ['leftStick', 'dpad'],
});
// The D-pad buttons a direction points with.
const DPAD_SIDES = Object.freeze({
  up: ['dpadUp'], down: ['dpadDown'], left: ['dpadLeft'], right: ['dpadRight'],
  horizontal: ['dpadLeft', 'dpadRight'], forward: ['dpadLeft', 'dpadRight'], back: ['dpadLeft', 'dpadRight'],
});

// Lights `binding`'s inputs in `svg` (a diagramSVG element): its button
// and modifier, and its direction on its own stick (left or right, each
// apart, an arrow in it; the D-pad's sides), a stick input's stick lit as
// the input it is. For Movement, the source.
export function highlight(svg, binding) {
  if (!svg?.querySelectorAll) return;
  for (const node of svg.querySelectorAll('.is-on, .is-mod, .is-dir, .is-side')) node.classList.remove('is-on', 'is-mod', 'is-dir', 'is-side');
  for (const arrow of svg.querySelectorAll('.pad-arrow')) arrow.textContent = '';
  if (!binding) return;
  const lit = (button, cls) => svg.querySelector(`[data-pad-button="${button}"]`)?.classList.add(cls);
  if ('source' in binding) {
    for (const part of STICK_PARTS[binding.source] ?? []) svg.querySelector(`[data-pad-stick="${part}"]`)?.classList.add('is-dir');
    return;
  }
  if (binding.button) lit(binding.button, 'is-on');
  if (binding.modifier) lit(binding.modifier, 'is-mod');
  if (binding.direction && binding.stick) {
    for (const part of STICK_PARTS[binding.stick] ?? []) {
      const node = svg.querySelector(`[data-pad-stick="${part}"]`);
      node?.classList.add('is-dir');
      if (!binding.button) node?.classList.add('is-on');
      const arrow = node?.querySelector?.('.pad-arrow');
      if (arrow) arrow.textContent = directionArrow(binding.direction);
      if (part === 'dpad') for (const side of DPAD_SIDES[binding.direction] ?? []) lit(side, 'is-side');
    }
  }
}
