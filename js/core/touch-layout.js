// Custom touch-control layouts: which controls a player may move and resize
// in each Mobile Controls scheme, how a layout is stored, and the geometry
// that turns a stored layout into places on the screen. Pure data and
// math: TouchControls (js/game/touch-controls.js) applies a layout, the
// layout editor (js/ui/touch-layout-editor.js) makes one and Settings
// (js/core/settings.js) keeps one per scheme.
//
// A layout is one scheme's customised controls, keyed by stable control id
// (never a translated label): { [id]: { x, y, scale } }. `x` and `y` are the
// control's centre as fractions (0 to 1) of the touch-control area, the
// screen inside its safe-area insets and a small margin (the padding of
// .touch-controls in styles.css), so a layout made on one landscape screen
// fits another. `scale` multiplies the control's own size, and its hit area
// with it. A control a layout leaves out stays exactly where the stylesheet
// puts it, at its own size: the empty layout is Alva's original one.

import { clamp } from './utils.js';
import { NUMBERED_ATTACKS } from '../config.js';

// Every control each scheme shows, in reading order: the lower-left cluster
// first, then the lower-right actions, all five numbered attack buttons
// included (a fighter shows only the ones it has; the layout is every
// fighter's). `stick` is the joystick itself. A control id is its codename,
// never a translated label: a stored layout with any other id simply leaves
// that out, so one saved while the schemes still had a Down button (`down`)
// loads with every other control where it was.
export const TOUCH_CONTROL_IDS = Object.freeze({
  joystick: Object.freeze([
    'mouvementLeft', 'stick', 'mouvementRight',
    'extra_attack', 'transform', 'shield', ...NUMBERED_ATTACKS, 'jump',
  ]),
  classic: Object.freeze([
    'runLeft', 'runRight',
    'extra_attack', 'transform', 'shield', ...NUMBERED_ATTACKS, 'jump',
  ]),
});

// How far a control may shrink or grow, and the size step of the editor's
// Smaller / Larger buttons and slider. 0.7 keeps the smallest control (a
// Dash button on the smallest screen) above a 22 px target; 1.8 nearly
// doubles the largest without covering the screen.
export const TOUCH_SCALE = Object.freeze({ min: 0.7, max: 1.8, step: 0.1 });

// How far one keyboard or gamepad nudge moves a control, as a fraction of
// the area's width (across) or height (up and down).
export const TOUCH_NUDGE = 0.02;

const round = (value, places) => {
  const k = 10 ** places;
  return Math.round(value * k) / k;
};

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// `value` held to the size limits (and whole steps of 0.01).
export function clampScale(value) {
  return round(clamp(value, TOUCH_SCALE.min, TOUCH_SCALE.max), 2);
}

// One stored control as { x, y, scale }, or null when it cannot be used:
// not an object, or a centre or scale that is not a finite number. A centre
// off the area is pulled back onto its edge and a scale past a limit onto
// that limit, so no stored value can hide a control or blow it up.
export function sanitizeTouchControl(value) {
  if (!isPlainObject(value)) return null;
  const { x, y, scale } = value;
  if (![x, y, scale].every(Number.isFinite)) return null;
  return { x: round(clamp(x, 0, 1), 4), y: round(clamp(y, 0, 1), 4), scale: clampScale(scale) };
}

// `value` as a layout of `scheme`: only that scheme's control ids, each
// entry checked (an unusable one is dropped: that control keeps its place),
// in the scheme's own order. Anything that is not a layout is the empty one.
export function sanitizeTouchLayout(scheme, value) {
  const ids = TOUCH_CONTROL_IDS[scheme];
  const layout = {};
  if (!ids || !isPlainObject(value)) return layout;
  for (const id of ids) {
    if (!Object.hasOwn(value, id)) continue;
    const entry = sanitizeTouchControl(value[id]);
    if (entry) layout[id] = entry;
  }
  return layout;
}

// Every scheme's layout from `value` ({ joystick, classic }), each checked.
export function sanitizeTouchLayouts(value) {
  const source = isPlainObject(value) ? value : {};
  return Object.fromEntries(Object.keys(TOUCH_CONTROL_IDS).map((scheme) => [
    scheme, sanitizeTouchLayout(scheme, Object.hasOwn(source, scheme) ? source[scheme] : null),
  ]));
}

// ---- Geometry -------------------------------------------------------------------

// The area a layout's fractions are measured in: the box `rect` less its
// `padding` ({ top, right, bottom, left } in px).
export function layoutArea(rect, padding = {}) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  return {
    left: rect.left + left,
    top: rect.top + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
}

// One axis of a centre kept between `lo` and `hi`; a control longer than
// the area is centred in it.
const keepInside = (value, lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(value, lo, hi));

// The screen centre { x, y } of a control of unscaled `size` ({ width,
// height }) placed by `entry` ({ x, y, scale }) in `area`: its stored centre,
// moved just far enough that the whole scaled control stays in the area, so
// every control can always be reached.
export function placeControl(area, entry, size) {
  const halfW = (size.width * entry.scale) / 2;
  const halfH = (size.height * entry.scale) / 2;
  return {
    x: keepInside(area.left + entry.x * area.width, area.left + halfW, area.left + area.width - halfW),
    y: keepInside(area.top + entry.y * area.height, area.top + halfH, area.top + area.height - halfH),
  };
}

// A screen point as the fractions of `area` a layout stores.
export function normalizePoint(area, point) {
  const fraction = (value, start, length) => (length > 0 ? round(clamp((value - start) / length, 0, 1), 4) : 0.5);
  return { x: fraction(point.x, area.left, area.width), y: fraction(point.y, area.top, area.height) };
}
