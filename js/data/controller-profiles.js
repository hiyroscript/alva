// Controller profiles: what a controller does for each fighter.
//
// Two kinds of action, one layout per fighter (docs/systems/input.md has
// the whole picture):
//
//   universal   the same for every fighter, with the same recommended
//               buttons for everyone (UNIVERSAL_DEFAULTS): Movement, Jump,
//               Dash / air dash, Fast fall, Shield, Deflect and Pause.
//   moves       the fighter's own attacks and abilities, one action for
//               each move it really has, where it has it: `ground:<control>`
//               on the ground and `air:<control>` in the air, <control> its
//               combat button codename (attack1 ... attack5, extra_attack,
//               transform). Each fighter authors its own recommended
//               buttons for them in its definition (`controller.layout`),
//               chosen for that move, never for its attack number.
//
// A binding is the physical input of one action:
//
//   { button, modifier, direction, activation }
//
//   button      the button pressed (a normalized PAD_BUTTONS id: 'west' is
//               Square / X), or null for a direction alone (Fast fall)
//   modifier    a button held first (R2 for "R2 + Square"), or null
//   direction   where the movement stick must point as the button goes
//               down ('left', 'right', 'up', 'down', 'horizontal' for left
//               or right), or null for anywhere
//   activation  'press' (once, as it goes down), 'hold' (once, after
//               HOLD_THRESHOLD held) or 'continuous' (lasts while held)
//
// Movement's binding is { source }: which stick or pad moves the fighter
// (MOVEMENT_SOURCES). Directions in other bindings read that same source.
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
import { PAD_BUTTONS, DPAD_BUTTONS } from '../core/gamepad-devices.js';

export { PAD_BUTTONS };

// Where a binding's direction may point. 'horizontal' is left or right.
export const DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down', 'horizontal']);

// How a binding activates (see the top).
export const ACTIVATIONS = Object.freeze(['press', 'hold', 'continuous']);

// Seconds a 'hold' binding's input must stay held before it activates.
export const HOLD_THRESHOLD = 0.25;

// What moves the fighter.
export const MOVEMENT_SOURCES = Object.freeze(['leftStick', 'dpad', 'leftStickDpad', 'rightStick']);

// The editor's categories, in order.
export const CATEGORIES = Object.freeze(['movement', 'defense', 'ground', 'air', 'abilities', 'other']);

// The universal actions: their kind, editor category, where they apply,
// which activations they allow and whether a direction may be added.
// `jump`, `shield` and `fastFall` keep their held behaviour whatever their
// input (a higher jump, a Shield held up, a fall sped up while held), so
// they are always 'continuous'; Pause is always a press.
const UNIVERSAL = Object.freeze([
  Object.freeze({ id: 'move', kind: 'move', category: 'movement', place: 'both' }),
  Object.freeze({ id: 'jump', kind: 'jump', category: 'movement', place: 'both', activations: ['continuous'], directional: true }),
  Object.freeze({ id: 'dash', kind: 'dash', category: 'movement', place: 'both', activations: ['press', 'hold'], directional: false }),
  Object.freeze({ id: 'fastFall', kind: 'fastFall', category: 'movement', place: 'both', activations: ['continuous'], directional: true, directionOnly: true }),
  Object.freeze({ id: 'shield', kind: 'shield', category: 'defense', place: 'ground', activations: ['continuous'], directional: true }),
  Object.freeze({ id: 'deflect', kind: 'deflect', category: 'defense', place: 'air', activations: ['press', 'hold'], directional: true }),
  Object.freeze({ id: 'pause', kind: 'pause', category: 'other', place: 'both', activations: ['press'], directional: false }),
]);

export const UNIVERSAL_ACTIONS = Object.freeze(UNIVERSAL.map((a) => a.id));

const binding = (button, { modifier = null, direction = null, activation = 'press' } = {}) =>
  Object.freeze({ button, modifier, direction, activation });

// The recommended universal buttons, the same for every fighter: the left
// stick moves; Cross / A jumps; L1 / LB Dashes the way the stick points (or
// faces), keeping the right thumb on the attack buttons; the stick pushed
// down fast-falls; Circle / B held is the Shield on the ground and a fresh
// press of it the Deflect in the air; Options / Menu pauses.
export const UNIVERSAL_DEFAULTS = Object.freeze({
  move: Object.freeze({ source: 'leftStick' }),
  jump: binding('south', { activation: 'continuous' }),
  dash: binding('l1'),
  fastFall: binding(null, { direction: 'down', activation: 'continuous' }),
  shield: binding('east', { activation: 'continuous' }),
  deflect: binding('east'),
  pause: binding('start'),
});

// The inputs a fighter with no authored layout gets for its moves, in
// order: face buttons first, then R1, then trigger combinations. None is a
// universal default's input (see fallbackLayout).
const FALLBACK_INPUTS = Object.freeze([
  ['west'], ['north'], ['r1'],
  ['west', 'r2'], ['north', 'r2'], ['east', 'r2'], ['south', 'r2'],
  ['west', 'l2'], ['north', 'l2'], ['east', 'l2'], ['south', 'l2'], ['r1', 'l2'],
]);

// The control codenames a move action may be on.
const MOVE_CONTROLS = Object.freeze([...NUMBERED_ATTACKS, 'extra_attack', 'transform']);

// An action id is a universal action or `<place>:<control>`.
export const ACTION_ID = /^(move|jump|dash|fastFall|shield|deflect|pause|(ground|air):(attack[1-5]|extra_attack|transform))$/;

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
//   { id, kind, category, place, activations, directional, directionOnly,
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
    out.push({ ...a, activations: a.activations ? [...a.activations] : [], directional: !!a.directional, directionOnly: !!a.directionOnly });
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
        activations: ['press', 'hold'], directional: true, directionOnly: false, control, move, special,
      });
    }
  }
  out.push(...moves.ground.filter((m) => m.category === 'ground'), ...moves.air.filter((m) => m.category === 'air'));
  out.push(...moves.ground.filter((m) => m.category === 'abilities'), ...moves.air.filter((m) => m.category === 'abilities'));
  const pause = UNIVERSAL.find((a) => a.id === 'pause');
  out.push({ ...pause, activations: [...pause.activations], directional: false, directionOnly: false });
  return out;
}

// The actions by id.
export function actionMap(actions) {
  return new Map(actions.map((a) => [a.id, a]));
}

// `raw` as a binding for `action`, checked against everything the action
// allows; null if it is not one (a stored value that no longer fits falls
// back to the recommended one).
export function normalizeBinding(action, raw) {
  if (!action || !isObject(raw)) return null;
  if (action.kind === 'move') {
    return MOVEMENT_SOURCES.includes(raw.source) ? { source: raw.source } : null;
  }
  const button = raw.button ?? null;
  const modifier = raw.modifier ?? null;
  const direction = raw.direction ?? null;
  const activation = raw.activation;
  if (button !== null && !PAD_BUTTONS.includes(button)) return null;
  if (modifier !== null && (!PAD_BUTTONS.includes(modifier) || modifier === button || button === null)) return null;
  if (direction !== null && (!DIRECTIONS.includes(direction) || !action.directional)) return null;
  if (button === null && !(action.directionOnly && direction !== null)) return null;
  if (!action.activations.includes(activation)) return null;
  return { button, modifier, direction, activation };
}

// Whether two bindings are the same input.
export function sameBinding(a, b) {
  if (!a || !b) return a === b;
  if ('source' in a || 'source' in b) return a.source === b.source;
  return a.button === b.button && a.modifier === b.modifier && a.direction === b.direction && a.activation === b.activation;
}

// The places an action applies in.
const placesOf = (action) => (action.place === 'both' ? ['ground', 'air'] : [action.place]);
const overlap = (a, b) => placesOf(a).some((p) => placesOf(b).includes(p));

// The input key a binding takes up for the fallback's choices.
const inputKey = (b) => `${b.modifier ?? ''}+${b.button}`;

// Every move of `def` given an input: its own `authored` binding where that
// fits the move, else the next of FALLBACK_INPUTS free in that place (no
// universal action's input, no other move's), so the result never
// conflicts. Returns { bindings (moves only), complete } (complete: every
// move authored).
function fillLayout(def, authored) {
  const actions = controllerActions(def);
  const used = { ground: new Set(), air: new Set() };
  const take = (action, b) => {
    if (!b?.button || b.direction) return;
    for (const place of placesOf(action)) used[place].add(inputKey(b));
  };
  for (const a of actions) if (a.kind !== 'attack' && a.kind !== 'move') take(a, UNIVERSAL_DEFAULTS[a.id]);
  const bindings = {};
  let complete = true;
  for (const a of actions) {
    if (a.kind !== 'attack') continue;
    const own = normalizeBinding(a, authored?.[a.id]);
    if (own) {
      bindings[a.id] = own;
      take(a, own);
    } else {
      complete = false;
    }
  }
  for (const a of actions) {
    if (a.kind !== 'attack' || bindings[a.id]) continue;
    const input = FALLBACK_INPUTS.find(([button, modifier]) => !used[a.place].has(`${modifier ?? ''}+${button}`));
    if (!input) continue;
    const [button, modifier = null] = input;
    bindings[a.id] = binding(button, { modifier });
    take(a, bindings[a.id]);
  }
  return { bindings, complete: complete && !!authored };
}

// A conflict-free layout for `def`'s moves from FALLBACK_INPUTS, for a
// fighter that has not had one designed for it: each place takes the
// inputs in order, skipping any a universal action already uses there.
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
  const button = raw.button ?? null;
  const modifier = raw.modifier ?? null;
  const direction = raw.direction ?? null;
  if (button !== null && !PAD_BUTTONS.includes(button)) return null;
  if (modifier !== null && (!PAD_BUTTONS.includes(modifier) || modifier === button || button === null)) return null;
  if (direction !== null && !DIRECTIONS.includes(direction)) return null;
  if (button === null && direction === null) return null;
  if (!ACTIVATIONS.includes(raw.activation)) return null;
  return { button, modifier, direction, activation: raw.activation };
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

// ---- Conflicts ------------------------------------------------------------------------

// The buttons `source` moves with (none are free for actions).
export function movementButtons(source) {
  return source === 'dpad' || source === 'leftStickDpad' ? [...DPAD_BUTTONS] : [];
}

// How specific a direction is: a stick direction beats left-or-right,
// which beats anywhere.
export const directionRank = (direction) => (direction === null ? 0 : direction === 'horizontal' ? 1 : 2);

// Whether two directions can both be met at once.
function directionsMeet(a, b) {
  if (a === null || b === null || a === b) return true;
  if (a === 'horizontal') return b === 'left' || b === 'right';
  if (b === 'horizontal') return a === 'left' || a === 'right';
  return false;
}

// Every problem with `bindings` (by action id) for `actions`, each
// { severity, type, actions: [ids], button }:
//
//   error 'same'       two actions on the very same input where both can
//                      apply (same button, modifier and direction, a place
//                      in common): one input, two actions, unresolvable
//   error 'movement'   a button the Movement source already moves with
//   warning 'modifier' a button held as one action's modifier that is also
//                      another action's own button where both apply:
//                      holding it for the combination triggers that action
//                      first
//
// Shared buttons are not conflicts in themselves: the same button in
// different places (Spin Attack on the ground, Blue Tornado in the air; the
// Shield and the Deflect), a combination beside its plain button (R2 +
// Square beside Square), or a direction beside no direction (Down + Square
// beside Square: the more specific one wins) all resolve one way.
export function profileConflicts(actions, bindings) {
  const out = [];
  const list = actions.filter((a) => a.kind !== 'move' && bindings[a.id]).map((a) => ({ action: a, b: bindings[a.id] }));
  const source = bindings.move?.source ?? UNIVERSAL_DEFAULTS.move.source;
  const moving = movementButtons(source);
  for (const { action, b } of list) {
    const taken = [b.button, b.modifier].filter((x) => x && moving.includes(x));
    for (const button of taken) out.push({ severity: 'error', type: 'movement', actions: [action.id], button });
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (!overlap(A.action, B.action)) continue;
      if (A.b.button === B.b.button && A.b.modifier === B.b.modifier && A.b.direction === B.b.direction) {
        out.push({ severity: 'error', type: 'same', actions: [A.action.id, B.action.id], button: A.b.button });
        continue;
      }
      for (const [P, Q] of [[A, B], [B, A]]) {
        if (P.b.modifier && Q.b.button === P.b.modifier && !Q.b.modifier && directionsMeet(P.b.direction, Q.b.direction)) {
          out.push({ severity: 'warning', type: 'modifier', actions: [P.action.id, Q.action.id], button: P.b.modifier });
        }
      }
    }
  }
  return out;
}

// Whether `conflicts` include one that keeps a profile from being saved.
export const hasBlockingConflict = (conflicts) => conflicts.some((c) => c.severity === 'error');

// ---- A definition's own layout --------------------------------------------------------

// Every way `def`'s authored `controller.layout` breaks the rules, one
// sentence each (empty when it keeps them, or authors none): every entry
// names a move action the fighter has, with a binding that action allows,
// and the whole recommended profile is free of conflicts.
export function controllerLayoutProblems(def) {
  const problems = [];
  if (def?.controller === undefined) return problems;
  if (!isObject(def.controller)) return ['`controller` must be an object'];
  const extra = Object.keys(def.controller).filter((k) => k !== 'layout');
  if (extra.length) problems.push(`controller has unknown field(s) ${extra.join(', ')}`);
  const layout = def.controller.layout;
  if (!isObject(layout)) {
    problems.push('controller.layout must be an object of bindings');
    return problems;
  }
  const actions = actionMap(controllerActions(def));
  for (const [id, raw] of Object.entries(layout)) {
    const action = actions.get(id);
    if (!action) problems.push(`controller.layout.${id} is not one of its moves (${[...actions.values()].filter((a) => a.kind === 'attack').map((a) => a.id).join(', ')})`);
    else if (action.kind !== 'attack') problems.push(`controller.layout.${id}: universal actions keep their universal buttons`);
    else if (!normalizeBinding(action, raw)) problems.push(`controller.layout.${id} is not a valid binding for it`);
  }
  for (const action of actions.values()) {
    if (action.kind === 'attack' && !Object.hasOwn(layout, action.id)) problems.push(`controller.layout has no binding for ${action.id}`);
  }
  if (!problems.length) {
    const { bindings } = recommendedProfile(def);
    for (const c of profileConflicts([...actions.values()], bindings).filter((x) => x.severity === 'error')) {
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
