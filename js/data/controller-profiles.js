// Controller profiles: what a controller does for each fighter.
//
// Two kinds of action, one layout per fighter (docs/systems/input.md has
// the whole picture):
//
//   universal   the same for every fighter, with the same recommended
//               inputs for everyone (UNIVERSAL_DEFAULTS): Movement, Jump,
//               Dash / air dash, Fast fall, Shield, Deflect and Pause.
//   moves       the fighter's own attacks and abilities, one action for
//               each move it really has, where it has it: `ground:<control>`
//               on the ground and `air:<control>` in the air, <control> its
//               combat button codename (attack1 ... attack5, extra_attack).
//               Each fighter authors its own recommended inputs for them in
//               its definition (`controller.layout`), chosen for that move,
//               never for its attack number.
//
// A binding is the physical input of one action:
//
//   { button, modifier, stick, direction, activation }
//
//   button      the button pressed (a normalized PAD_BUTTONS id: 'west' is
//               Square / X), or null when the input is a stick direction
//               itself (a stick input: the right stick pushed up)
//   modifier    a button held first (R2 for "R2 + Square", L2 for "L2 +
//               Right stick up"), or null
//   stick       where `direction` is read (STICKS: 'leftStick',
//               'rightStick', 'dpad', or 'leftStickDpad' for either), always
//               named, whatever moves the fighter; null with no direction
//   direction   'up', 'down', 'left', 'right', 'horizontal' (left or
//               right), 'forward' or 'back' (the way the fighter faces, or
//               away from it), or null. With a button it is a condition:
//               the stick must point that way as the button goes down
//               ("Left stick down + Square"). Without one it is the input.
//   activation  'press' (once, as it goes down), 'hold' (once, after
//               HOLD_THRESHOLD held) or 'continuous' (lasts while held)
//
// Movement's binding is { source }: which stick or pad moves the fighter
// (MOVEMENT_SOURCES). It moves the fighter and nothing else: no other
// binding reads it, so both sticks are free to be configured apart.
//
// The player may change every binding of every fighter (Settings ›
// Controls › Controller controls); a saved profile is keyed by the
// fighter's id and holds the whole layout. Nothing here changes what an
// action does: a binding only decides which control codename a physical
// input sends (js/core/controller-resolver.js), and the Fighter decides,
// as ever, what that does.
//
// Shared code never names a fighter: every fighter-specific value comes
// from its definition, and a fighter with no authored layout gets a safe,
// conflict-free fallback (fallbackLayout), flagged as not designed yet.

import { NUMBERED_ATTACKS } from '../config.js';
import { actionType } from './loadout.js';
import { isSpecialAbility } from './special-abilities.js';
import { PAD_BUTTONS } from '../core/gamepad-devices.js';

export { PAD_BUTTONS };

// What moves the fighter.
export const MOVEMENT_SOURCES = Object.freeze(['leftStick', 'dpad', 'leftStickDpad', 'rightStick']);

// Where a binding's direction is read: either stick, the D-pad, or the
// left stick and the D-pad together (the same four a fighter can move with).
export const STICKS = MOVEMENT_SOURCES;

// Where a binding's direction may point. 'horizontal' is left or right;
// 'forward' and 'back' are the way the fighter faces and the other way.
export const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right', 'horizontal', 'forward', 'back']);

// How a binding activates (see the top).
export const ACTIVATIONS = Object.freeze(['press', 'hold', 'continuous']);

// Seconds a 'hold' binding's input must stay held before it activates.
export const HOLD_THRESHOLD = 0.25;

// The editor's categories, in order.
export const CATEGORIES = Object.freeze(['movement', 'defense', 'ground', 'air', 'abilities', 'other']);

// The universal actions: their kind, editor category, where they apply,
// which activations they allow, whether a direction may be added to a
// button (`directional`) and whether a stick direction may be the input
// itself (`stickInput`). `jump`, `shield` and `fastFall` keep their held
// behaviour whatever their input (a higher jump, a Shield held up, a fall
// sped up while held), so they are always 'continuous'; Pause is always a
// press of a button.
const UNIVERSAL = Object.freeze([
  Object.freeze({ id: 'move', kind: 'move', category: 'movement', place: 'both' }),
  Object.freeze({ id: 'jump', kind: 'jump', category: 'movement', place: 'both', activations: ['continuous'], directional: true, stickInput: true }),
  Object.freeze({ id: 'dash', kind: 'dash', category: 'movement', place: 'both', activations: ['press', 'hold'], directional: false, stickInput: true }),
  Object.freeze({ id: 'fastFall', kind: 'fastFall', category: 'movement', place: 'both', activations: ['continuous'], directional: true, stickInput: true }),
  Object.freeze({ id: 'shield', kind: 'shield', category: 'defense', place: 'ground', activations: ['continuous'], directional: true, stickInput: true }),
  Object.freeze({ id: 'deflect', kind: 'deflect', category: 'defense', place: 'air', activations: ['press', 'hold'], directional: true, stickInput: true }),
  Object.freeze({ id: 'pause', kind: 'pause', category: 'other', place: 'both', activations: ['press'], directional: false, stickInput: false }),
]);

export const UNIVERSAL_ACTIONS = Object.freeze(UNIVERSAL.map((a) => a.id));

const binding = (button, { modifier = null, stick = null, direction = null, activation = 'press' } = {}) =>
  Object.freeze({ button, modifier, stick, direction, activation });
// A stick input: `stick` pushed `direction` is the input itself.
const flick = (stick, direction, { modifier = null, activation = 'press' } = {}) =>
  binding(null, { modifier, stick, direction, activation });

// The recommended universal inputs, the same for every fighter, chosen
// together so no finger is ever asked for two things at once:
//
//   the left stick moves, and pushed down in the air fast-falls;
//   Cross / A jumps (held a little longer, higher);
//   R1 / RB Dashes and air-dashes, the way the left stick points (or the
//     fighter faces): the right index finger, so the left thumb aims, the
//     right thumb stays on the jump and attack buttons and a Dash flows
//     straight into either;
//   L1 / LB defends: held on the ground it is the Shield, pressed in the
//     air the Deflect. One guard button, on a finger of its own: guarding
//     never takes the right thumb off the attacks (let go and strike at
//     once), a bumper's short travel makes the Deflect's timing crisp, and
//     the left thumb keeps steering and turning while it is held;
//   Options / Menu pauses.
//
// The three face buttons other than Jump, both triggers and the right
// stick are left to each fighter's own moves.
export const UNIVERSAL_DEFAULTS = Object.freeze({
  move: Object.freeze({ source: 'leftStick' }),
  jump: binding('south', { activation: 'continuous' }),
  dash: binding('r1'),
  fastFall: flick('leftStick', 'down', { activation: 'continuous' }),
  shield: binding('l1', { activation: 'continuous' }),
  deflect: binding('l1'),
  pause: binding('start'),
});

// The inputs a move with no authored binding is given, in order: the face
// buttons, the triggers, the right stick, the D-pad and the stick clicks,
// all single inputs. Each is taken only where it conflicts with nothing
// already in the layout (see fillLayout).
const FALLBACK_INPUTS = Object.freeze([
  binding('west'), binding('north'), binding('east'), binding('r2'), binding('l2'),
  flick('rightStick', 'up'), flick('rightStick', 'down'), flick('rightStick', 'forward'), flick('rightStick', 'back'),
  binding('dpadUp'), binding('dpadDown'), binding('dpadLeft'), binding('dpadRight'),
  binding('l3'), binding('r3'), binding('select'),
]);

// The control codenames a move action may be on.
const MOVE_CONTROLS = Object.freeze([...NUMBERED_ATTACKS, 'extra_attack']);

// An action id is a universal action or `<place>:<control>`.
export const ACTION_ID = /^(move|jump|dash|fastFall|shield|deflect|pause|(ground|air):(attack[1-5]|extra_attack))$/;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// The move codename `def`'s `control` performs on the ground or in the air,
// or null.
export function moveFor(def, control, place) {
  const mapping = def?.actions?.[control];
  if (!mapping) return null;
  if (typeof mapping === 'string') return mapping;
  if (isObject(mapping) && Object.hasOwn(mapping, 'type')) return place === 'ground' ? mapping.id : null;
  return (place === 'ground' ? mapping.ground : mapping.air) ?? null;
}

// Every action `def` can be given a controller input for, in the editor's
// order: the universal ones it has (Shield only with a Shield, Deflect only
// with a Deflect; both without a fighter), then each of its moves where it
// really is: a ground-only attack has no air action, a summon or a
// technique only a ground one, a reserved button none. Each is
//
//   { id, kind, category, place, activations, directional, stickInput,
//     control, move, special }
//
// `kind` 'attack' for a move (an attack, summon or technique), `place`
// 'ground', 'air' or 'both'; `move` the move codename it performs (for its
// name), `special` its execution type when that is a summon or a technique
// (null for an ordinary attack). A move's category is where it is played
// ('ground' or 'air'), or 'abilities' (Special abilities) only for a move the
// fighter itself classifies as Special (isSpecialAbility,
// js/data/special-abilities.js): never because it throws a projectile or is
// a technique or a summon. The category moves a row in the editor and
// nothing else: the action's id, and so its binding, stays the same.
export function controllerActions(def = null) {
  const out = [];
  for (const a of UNIVERSAL) {
    if (a.id === 'shield' && def && def.defense?.type !== 'shield') continue;
    if (a.id === 'deflect' && def && !def.deflect) continue;
    if (a.id === 'pause') continue;
    out.push({ ...a, activations: a.activations ? [...a.activations] : [], directional: !!a.directional, stickInput: !!a.stickInput });
  }
  const moves = { ground: [], air: [] };
  for (const control of MOVE_CONTROLS) {
    if (!def?.actions?.[control]) continue;
    const type = actionType(def, control);
    for (const place of ['ground', 'air']) {
      const move = moveFor(def, control, place);
      if (!move) continue;
      if (type === 'attack') {
        const attack = def.attacks?.[move];
        if (!attack) continue;
        if (place === 'air' && attack.groundOnly) continue;
      }
      const special = type === 'summon' || type === 'technique' ? type : null;
      moves[place].push({
        id: `${place}:${control}`, kind: 'attack', category: isSpecialAbility(def, move) ? 'abilities' : place, place,
        activations: ['press', 'hold'], directional: true, stickInput: true, control, move, special,
      });
    }
  }
  out.push(...moves.ground.filter((m) => m.category === 'ground'), ...moves.air.filter((m) => m.category === 'air'));
  out.push(...moves.ground.filter((m) => m.category === 'abilities'), ...moves.air.filter((m) => m.category === 'abilities'));
  const pause = UNIVERSAL.find((a) => a.id === 'pause');
  out.push({ ...pause, activations: [...pause.activations], directional: false, stickInput: false });
  return out;
}

// The actions by id.
export function actionMap(actions) {
  return new Map(actions.map((a) => [a.id, a]));
}

// `raw`'s fields as a binding if they make one, whatever the action: a
// known button or none, a modifier that is another button, a direction
// exactly when a stick is named, a direction when there is no button, a
// known activation. Null otherwise.
function bindingShape(raw) {
  if (!isObject(raw)) return null;
  const button = raw.button ?? null;
  const modifier = raw.modifier ?? null;
  const stick = raw.stick ?? null;
  const direction = raw.direction ?? null;
  const activation = raw.activation;
  if (button !== null && !PAD_BUTTONS.includes(button)) return null;
  if (modifier !== null && (!PAD_BUTTONS.includes(modifier) || modifier === button)) return null;
  if (stick !== null && !STICKS.includes(stick)) return null;
  if (direction !== null && !DIRECTIONS.includes(direction)) return null;
  if ((stick === null) !== (direction === null)) return null;
  if (button === null && direction === null) return null;
  if (!ACTIVATIONS.includes(activation)) return null;
  return { button, modifier, stick, direction, activation };
}

// `raw` as a binding for `action`, checked against everything the action
// allows; null if it is not one (a stored value that no longer fits falls
// back to the recommended one).
export function normalizeBinding(action, raw) {
  if (!action || !isObject(raw)) return null;
  if (action.kind === 'move') {
    return MOVEMENT_SOURCES.includes(raw.source) ? { source: raw.source } : null;
  }
  const b = bindingShape(raw);
  if (!b) return null;
  if (b.button !== null && b.direction !== null && !action.directional) return null;
  if (b.button === null && !action.stickInput) return null;
  if (!action.activations.includes(b.activation)) return null;
  return b;
}

// Whether two bindings are the same input.
export function sameBinding(a, b) {
  if (!a || !b) return a === b;
  if ('source' in a || 'source' in b) return a.source === b.source;
  return a.button === b.button && a.modifier === b.modifier && (a.stick ?? null) === (b.stick ?? null) &&
    a.direction === b.direction && a.activation === b.activation;
}

// Whether `b` is a stick input (a stick direction is its input).
export const isStickInput = (b) => !!b && !('source' in b) && b.button === null;

// The places an action applies in.
const placesOf = (action) => (action.place === 'both' ? ['ground', 'air'] : [action.place]);
const overlap = (a, b) => placesOf(a).some((p) => placesOf(b).includes(p));

// ---- Physical inputs -------------------------------------------------------------------

// The physical parts of each stick (the left stick and the D-pad for
// 'leftStickDpad'), and the sides of each direction ('forward' and 'back'
// are left or right, as the fighter faces).
const PARTS = Object.freeze({
  leftStick: ['leftStick'], rightStick: ['rightStick'], dpad: ['dpad'], leftStickDpad: ['leftStick', 'dpad'],
});
const SIDES = Object.freeze({
  up: ['up'], down: ['down'], left: ['left'], right: ['right'],
  horizontal: ['left', 'right'], forward: ['left', 'right'], back: ['left', 'right'],
});
const DPAD_SIDES = Object.freeze({ up: 'dpadUp', down: 'dpadDown', left: 'dpadLeft', right: 'dpadRight' });

// The physical inputs `stick` pointing `direction` is made of: a stick's
// sides as 'rightStick:up', the D-pad's as its buttons ('dpadUp').
export function stickAtoms(stick, direction) {
  return (PARTS[stick] ?? []).flatMap((part) => (SIDES[direction] ?? []).map((side) => (part === 'dpad' ? DPAD_SIDES[side] : `${part}:${side}`)));
}

// The physical inputs whose going down sets `b` off.
const triggerAtoms = (b) => (b.button !== null ? [b.button] : stickAtoms(b.stick, b.direction));
const intersects = (a, b) => a.some((x) => b.includes(x));

// How specific a direction is: a stick direction (forward and back
// included) beats left-or-right, which beats anywhere.
export const directionRank = (direction) => (direction === null || direction === undefined ? 0 : direction === 'horizontal' ? 1 : 2);

// Whether two directions on the same stick can both be met at once: left-
// or-right meets every side, forward and back meet left and right (as the
// fighter faces one way or the other), never each other.
export function directionsMeet(a, b) {
  if (a === null || b === null || a === b) return true;
  const lateral = (d) => SIDES[d]?.length === 2 || d === 'left' || d === 'right';
  if (!lateral(a) || !lateral(b)) return false;
  if (a === 'horizontal' || b === 'horizontal') return true;
  const facing = (d) => d === 'forward' || d === 'back';
  return facing(a) !== facing(b);
}

// Whether the directions two buttons' bindings ask for can both hold as
// their button goes down: always, if either asks for none or they are read
// on sticks with nothing in common (both sticks can point at once).
function conditionsMeet(a, b) {
  if (!a.direction || !b.direction) return true;
  if (!PARTS[a.stick].some((p) => PARTS[b.stick].includes(p))) return true;
  return directionsMeet(a.direction, b.direction);
}

// What the Movement source moves with: the left and right sides of its
// stick or D-pad (up and down move nothing).
export function movementAtoms(source) {
  return stickAtoms(source, 'horizontal');
}

// The D-pad buttons `source` moves with (none are free for actions).
export function movementButtons(source) {
  return movementAtoms(source).filter((x) => PAD_BUTTONS.includes(x));
}

// ---- Layouts ---------------------------------------------------------------------------

// Every move of `def` given an input: its own `authored` binding where that
// fits the move, else the first of FALLBACK_INPUTS that conflicts with
// nothing in the layout so far (no universal action's input, no other
// move's, no overlap of any kind), so the result never conflicts. Returns
// { bindings (moves only), complete } (complete: every move authored).
function fillLayout(def, authored) {
  const actions = controllerActions(def);
  const bindings = {};
  for (const a of actions) if (a.kind !== 'attack') bindings[a.id] = UNIVERSAL_DEFAULTS[a.id];
  let complete = true;
  for (const a of actions) {
    if (a.kind !== 'attack') continue;
    const own = normalizeBinding(a, authored?.[a.id]);
    if (own) bindings[a.id] = own;
    else complete = false;
  }
  for (const a of actions) {
    if (a.kind !== 'attack' || bindings[a.id]) continue;
    for (const input of FALLBACK_INPUTS) {
      const candidate = normalizeBinding(a, input);
      if (!candidate) continue;
      const trial = { ...bindings, [a.id]: candidate };
      if (profileConflicts(actions, trial).some((c) => c.actions.includes(a.id))) continue;
      bindings[a.id] = candidate;
      break;
    }
  }
  const moves = {};
  for (const a of actions) if (a.kind === 'attack' && bindings[a.id]) moves[a.id] = bindings[a.id];
  return { bindings: moves, complete: complete && !!authored };
}

// A conflict-free layout for `def`'s moves from FALLBACK_INPUTS, for a
// fighter that has not had one designed for it: each place takes the
// inputs in order, skipping any already used there.
export function fallbackLayout(def) {
  return fillLayout(def, null).bindings;
}

// Whether `def` authors its own recommended layout for its moves.
export function hasAuthoredLayout(def) {
  return isObject(def?.controller?.layout);
}

// The recommended binding of every action `def` has: the universal ones'
// UNIVERSAL_DEFAULTS, its moves' from its own `controller.layout` (or
// the fallback's, for a fighter with none, or for a move its layout leaves
// out, never on an input its layout already uses). Returns { bindings,
// authored } (authored: every move designed for it).
export function recommendedProfile(def = null) {
  const actions = controllerActions(def);
  const filled = fillLayout(def, hasAuthoredLayout(def) ? def.controller.layout : null);
  const bindings = {};
  for (const a of actions) bindings[a.id] = a.kind === 'attack' ? filled.bindings[a.id] ?? null : UNIVERSAL_DEFAULTS[a.id];
  return { bindings, authored: filled.complete };
}

// The profile `def` plays with: every action it has, each with the
// player's saved binding (`stored`, the saved profile for its id, if any)
// where that still fits the action, else the recommended one. Returns
// { character, actions, bindings, customized }.
export function resolveProfile(def = null, stored = null) {
  const actions = controllerActions(def);
  const { bindings: recommended } = recommendedProfile(def);
  const bindings = {};
  let customized = false;
  for (const a of actions) {
    const own = isObject(stored) ? normalizeBinding(a, stored[a.id]) : null;
    bindings[a.id] = own ?? recommended[a.id];
    if (own && !sameBinding(own, recommended[a.id])) customized = true;
  }
  return { character: def?.id ?? null, actions, bindings, customized };
}

// ---- Stored profiles ------------------------------------------------------------------

// A stored binding's shape, checked without knowing the fighter (the
// settings store has no registry): the action-specific rules are applied
// when a profile is resolved for its fighter (normalizeBinding).
function storedBinding(id, raw) {
  if (!isObject(raw)) return null;
  if (id === 'move') return MOVEMENT_SOURCES.includes(raw.source) ? { source: raw.source } : null;
  return bindingShape(raw);
}

// A fighter id as stored: a short word (the roster's four-digit ids, or a
// test fighter's).
const STORED_ID = /^[\w-]{1,32}$/;

// One fighter's stored profile, every entry checked (unknown actions and
// malformed bindings dropped, never the whole profile).
export function sanitizeStoredProfile(raw) {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!ACTION_ID.test(id)) continue;
    const b = storedBinding(id, value);
    if (b) out[id] = b;
  }
  return out;
}

// Every stored profile, keyed by fighter id, each checked.
export function sanitizeStoredProfiles(raw) {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [id, profile] of Object.entries(raw)) {
    if (!STORED_ID.test(id)) continue;
    const clean = sanitizeStoredProfile(profile);
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

// ---- Profiles saved before the sticks were named (settings versions 4 and 5) ----------

// Then, a binding was { button, modifier, direction, activation }, and its
// direction was read on whatever moved the fighter. These were the
// universal defaults: L1 / LB Dashed, Circle / B was the Shield and the
// Deflect. Kept only to tell, in a profile saved then, which bindings were
// the player's own (upgradeStoredProfile); nothing plays with them.
export const LEGACY_UNIVERSAL_DEFAULTS = Object.freeze({
  move: Object.freeze({ source: 'leftStick' }),
  jump: Object.freeze({ button: 'south', modifier: null, direction: null, activation: 'continuous' }),
  dash: Object.freeze({ button: 'l1', modifier: null, direction: null, activation: 'press' }),
  fastFall: Object.freeze({ button: null, modifier: null, direction: 'down', activation: 'continuous' }),
  shield: Object.freeze({ button: 'east', modifier: null, direction: null, activation: 'continuous' }),
  deflect: Object.freeze({ button: 'east', modifier: null, direction: null, activation: 'press' }),
  pause: Object.freeze({ button: 'start', modifier: null, direction: null, activation: 'press' }),
});

const LEGACY_DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down', 'horizontal']);

// A binding saved then, in today's shape: its direction read on `source`,
// the stick or pad that moved the fighter. Null if it was malformed then.
function legacyBinding(id, raw, source) {
  if (!isObject(raw)) return null;
  if (id === 'move') return MOVEMENT_SOURCES.includes(raw.source) ? { source: raw.source } : null;
  const direction = raw.direction ?? null;
  if (direction !== null && !LEGACY_DIRECTIONS.includes(direction)) return null;
  // A modifier needed a button then.
  if ((raw.button ?? null) === null && (raw.modifier ?? null) !== null) return null;
  return bindingShape({ ...raw, stick: direction === null ? null : source });
}

// A profile saved then, every entry in today's shape (each direction on the
// stick or pad that moved the fighter in that profile).
function legacyProfile(raw) {
  if (!isObject(raw)) return {};
  const source = MOVEMENT_SOURCES.includes(raw.move?.source) ? raw.move.source : 'leftStick';
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!ACTION_ID.test(id)) continue;
    const b = legacyBinding(id, value, source);
    if (b) out[id] = b;
  }
  return out;
}

// The layout `def` recommended then, in today's shape: the legacy universal
// defaults and its own moves' `controller.previous` (the layout it shipped
// with then, kept in its definition). Its moves are unknown without one.
function legacyRecommended(def) {
  const out = {};
  for (const [id, raw] of Object.entries(LEGACY_UNIVERSAL_DEFAULTS)) out[id] = legacyBinding(id, raw, 'leftStick');
  const previous = def?.controller?.previous;
  if (isObject(previous)) for (const [id, raw] of Object.entries(previous)) out[id] = legacyBinding(id, raw, 'leftStick');
  return out;
}

// One fighter's profile saved under settings version 4 or 5, upgraded:
//
//   - every binding in today's shape (its direction on the stick or pad
//     that moved the fighter in it, so it plays exactly as it did);
//   - the player's own choices kept: every binding that differs from what
//     `def` recommended then (for a fighter the game does not know, every
//     binding);
//   - the rest dropped, so today's recommended layout fills it in, as long
//     as that mix conflicts with nothing; where it would, the whole layout
//     the player played with then (what they saved, the old recommended
//     bindings round it) is kept, still conflict-free and still theirs.
//
// A profile with no choice of the player's own at all is gone: that
// fighter plays with today's recommended layout. Never fails.
export function upgradeStoredProfile(def, raw) {
  const saved = legacyProfile(raw);
  if (!def) return saved;
  const before = legacyRecommended(def);
  const own = {};
  for (const [id, b] of Object.entries(saved)) {
    if (!before[id] || !sameBinding(b, before[id])) own[id] = b;
  }
  if (!Object.keys(own).length) return {};
  const mixed = resolveProfile(def, own);
  if (!profileConflicts(mixed.actions, mixed.bindings).length) return own;
  const whole = {};
  for (const a of controllerActions(def)) {
    const b = saved[a.id] ?? before[a.id];
    if (b) whole[a.id] = b;
  }
  return whole;
}

// Every profile saved under settings version 4 or 5, upgraded, each for the
// fighter `lookup(id)` finds (or none): see upgradeStoredProfile. A
// profile left with nothing is dropped; one fighter's never touches
// another's.
export function upgradeStoredProfiles(raw, lookup = () => null) {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [id, profile] of Object.entries(raw)) {
    if (!STORED_ID.test(id)) continue;
    let def = null;
    try {
      def = lookup(id) ?? null;
    } catch {
      def = null;
    }
    const clean = sanitizeStoredProfile(upgradeStoredProfile(def, profile));
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

// ---- Conflicts ------------------------------------------------------------------------

// Every problem with `bindings` (by action id) for `actions`, each
// { severity, type, actions: [ids], button, stick, direction } (`button`
// the button in question, or `stick` and `direction` the stick input or
// direction in question):
//
//   error 'same'       two actions set off by the same physical input with
//                      the same modifier, where both can apply (a place in
//                      common), and nothing makes one the more specific:
//                      the same button with no direction, or directions
//                      that can be met at once and are as specific as each
//                      other (Left stick down + Square beside Right stick up
//                      + Square: both can hold); the same stick direction
//                      (Right stick left beside Right stick forward: the
//                      same when facing left); a D-pad button beside a
//                      stick input on that side of the D-pad
//   error 'movement'   an input the Movement source already moves with: a
//                      side of its stick or D-pad, as a button, a modifier
//                      or a stick input
//   warning 'modifier' a button held as one action's modifier that is also
//                      another action's own button where both apply:
//                      holding it for the combination triggers that action
//                      first
//   warning 'direction' a direction one action asks for with its button
//                      that is, on the same stick, another action's stick
//                      input: pushing the stick for the first triggers the
//                      second
//
// Shared inputs are not conflicts in themselves: the same input in
// different places (a ground move and an air move, the Shield and the
// Deflect), a combination beside its plain button (R2 + Square beside
// Square), a direction beside no direction (Down + Square beside Square:
// the more specific one wins), left-or-right beside left, either stick's
// up beside the other's all resolve one way.
export function profileConflicts(actions, bindings) {
  const out = [];
  const list = actions.filter((a) => a.kind !== 'move' && bindings[a.id]).map((a) => ({ action: a, b: bindings[a.id] }));
  const source = bindings.move?.source ?? UNIVERSAL_DEFAULTS.move.source;
  const moving = movementAtoms(source);
  const subject = (b) => (b.button !== null ? { button: b.button, stick: null, direction: null } : { button: null, stick: b.stick, direction: b.direction });
  for (const { action, b } of list) {
    if (intersects(triggerAtoms(b), moving)) out.push({ severity: 'error', type: 'movement', actions: [action.id], ...subject(b) });
    if (b.modifier && moving.includes(b.modifier)) out.push({ severity: 'error', type: 'movement', actions: [action.id], button: b.modifier, stick: null, direction: null });
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (!overlap(A.action, B.action)) continue;
      if (A.b.modifier === B.b.modifier && intersects(triggerAtoms(A.b), triggerAtoms(B.b))) {
        let clash;
        if (A.b.button !== null && B.b.button !== null) {
          clash = conditionsMeet(A.b, B.b) && directionRank(A.b.direction) === directionRank(B.b.direction);
        } else if (A.b.button === null && B.b.button === null) {
          clash = directionsMeet(A.b.direction, B.b.direction) && directionRank(A.b.direction) === directionRank(B.b.direction);
        } else {
          clash = true;
        }
        if (clash) out.push({ severity: 'error', type: 'same', actions: [A.action.id, B.action.id], ...subject(A.b) });
        continue;
      }
      for (const [P, Q] of [[A, B], [B, A]]) {
        if (P.b.modifier && Q.b.button === P.b.modifier && !Q.b.modifier &&
          (!Q.b.direction || (P.b.button !== null && conditionsMeet(P.b, Q.b)))) {
          out.push({ severity: 'warning', type: 'modifier', actions: [P.action.id, Q.action.id], button: P.b.modifier, stick: null, direction: null });
        }
        if (P.b.button !== null && P.b.direction && Q.b.button === null && (Q.b.modifier === null || Q.b.modifier === P.b.modifier) &&
          intersects(stickAtoms(P.b.stick, P.b.direction), stickAtoms(Q.b.stick, Q.b.direction)) && directionsMeet(P.b.direction, Q.b.direction)) {
          out.push({ severity: 'warning', type: 'direction', actions: [P.action.id, Q.action.id], button: null, stick: P.b.stick, direction: P.b.direction });
        }
      }
    }
  }
  return out;
}

// Whether `conflicts` include one that keeps a profile from being saved.
export const hasBlockingConflict = (conflicts) => conflicts.some((c) => c.severity === 'error');

// ---- A definition's own layout --------------------------------------------------------

// Every way `def`'s authored `controller` breaks the rules, one sentence
// each (empty when it keeps them, or authors none): every entry of its
// `layout` names a move action the fighter has, with a binding that action
// allows, and the whole recommended profile is free of conflicts, not even
// a warning. `previous`, the layout it recommended before (for profiles
// saved then, see upgradeStoredProfile), is an object of move bindings.
export function controllerLayoutProblems(def) {
  const problems = [];
  if (def?.controller === undefined) return problems;
  if (!isObject(def.controller)) return ['`controller` must be an object'];
  const extra = Object.keys(def.controller).filter((k) => k !== 'layout' && k !== 'previous');
  if (extra.length) problems.push(`controller has unknown field(s) ${extra.join(', ')}`);
  if (def.controller.previous !== undefined && !isObject(def.controller.previous)) problems.push('controller.previous must be an object of bindings');
  const layout = def.controller.layout;
  if (!isObject(layout)) {
    problems.push('controller.layout must be an object of bindings');
    return problems;
  }
  const actions = actionMap(controllerActions(def));
  for (const [id, raw] of Object.entries(layout)) {
    const action = actions.get(id);
    if (!action) problems.push(`controller.layout.${id} is not one of its moves (${[...actions.values()].filter((a) => a.kind === 'attack').map((a) => a.id).join(', ')})`);
    else if (action.kind !== 'attack') problems.push(`controller.layout.${id}: universal actions keep their universal inputs`);
    else if (!normalizeBinding(action, raw)) problems.push(`controller.layout.${id} is not a valid binding for it`);
  }
  for (const action of actions.values()) {
    if (action.kind === 'attack' && !Object.hasOwn(layout, action.id)) problems.push(`controller.layout has no binding for ${action.id}`);
  }
  if (!problems.length) {
    const { bindings } = recommendedProfile(def);
    for (const c of profileConflicts([...actions.values()], bindings)) {
      problems.push(`controller.layout: ${c.actions.join(' and ')} conflict (${c.type})`);
    }
  }
  return problems;
}

// Throws, naming every problem, if `def`'s layout breaks the rules.
export function assertControllerLayout(def) {
  const problems = controllerLayoutProblems(def);
  if (problems.length) {
    throw new Error(`[Alva] Character "${def?.id}" breaks the controller layout rules:\n- ${problems.join('\n- ')}`);
  }
}
