// Knockback: how strongly an ordinary attack moves an opponent when it
// connects. Not a Power: it belongs to each attack, never to a fighter.
//
// An attack declares one Knockback descriptor in js/data/characters.js, an
// axis and a strength level, which are independent of each other:
//
//   knockback: { axis: 'horizontal', level: 'low' }
//   knockback: { axis: 'vertical', level: 'high' }
//   knockback: { axis: 'vertical', level: 'mid', sign: -1 }
//
// Horizontal Knockback pushes the target away along the hit's facing, so it
// takes no sign. Vertical Knockback launches the target upward; `sign: -1`
// reverses it, driving the target downward at the same level's strength. An
// attack that declares no `knockback` has none.
//
// KNOCKBACK_LEVELS is the single source of truth for the three levels: their
// names, descriptions and tuning values. createAttackDefinition in
// js/game/combat.js resolves an attack's descriptor through
// resolveKnockback, once, into the numeric `knockback: { x, y }` that
// CombatSystem.applyHit reads; the Discover screen reads the same names and
// descriptions (never the values).

// ---- Levels ------------------------------------------------------------------

// Each level's speed (world units / s) along each axis: `horizontal` becomes
// the attack's `knockback.x` and `vertical` its `knockback.y`. Listed in
// reference order, weakest first.
export const KNOCKBACK_LEVELS = Object.freeze({
  low: Object.freeze({ id: 'low', name: 'Low', description: 'Light knockback.', horizontal: 140, vertical: 480 }),
  mid: Object.freeze({ id: 'mid', name: 'Mid', description: 'Medium knockback.', horizontal: 180, vertical: 640 }),
  high: Object.freeze({ id: 'high', name: 'High', description: 'Strong knockback.', horizontal: 220, vertical: 800 }),
});

export const KNOCKBACK_AXES = Object.freeze(['horizontal', 'vertical']);

// The level named `id` ('low', 'mid' or 'high'), or null. Only those exact
// strings: a tier number, a display name ('Low') or an inherited key is not
// a level.
export function getKnockbackLevel(id) {
  return typeof id === 'string' && Object.hasOwn(KNOCKBACK_LEVELS, id) ? KNOCKBACK_LEVELS[id] : null;
}

// ---- Reference copy --------------------------------------------------------------

// What Discover says about Knockback beside its levels. Mechanics only: no
// fighter, attack or tuning value is ever named.
export const KNOCKBACK_SUMMARY = 'Controls how strongly an attack moves an opponent when it connects.';

export const KNOCKBACK_DIRECTIONS = Object.freeze([
  Object.freeze({ id: 'horizontal', name: 'Horizontal', description: 'Pushes the opponent away from the direction of the hit.' }),
  Object.freeze({ id: 'vertical', name: 'Vertical', description: 'Launches the opponent upward.' }),
  Object.freeze({ id: 'reversed', name: 'Reversed vertical', description: 'Drives the opponent downward.' }),
]);

export const KNOCKBACK_DIRECTION_SUMMARY =
  'Direction is separate from strength: any level can push an opponent sideways, launch it upward or drive it downward.';

// ---- Resolution ------------------------------------------------------------------

const NONE = Object.freeze({ x: 0, y: 0 });
const FIELDS = ['axis', 'level', 'sign'];

const show = (value) => (typeof value === 'string' ? `'${value}'` : Array.isArray(value) ? 'an array' : String(value));

// Why `knockback` is not a valid descriptor, or null when it is.
function problemWith(knockback) {
  if (typeof knockback !== 'object' || Array.isArray(knockback)) {
    return `${show(knockback)} is not a Knockback descriptor { axis, level }`;
  }
  const unknown = Object.keys(knockback).filter((key) => !FIELDS.includes(key));
  if (unknown.length) return `unknown field ${unknown.map((key) => `"${key}"`).join(', ')}`;
  const { axis, level, sign } = knockback;
  if (!KNOCKBACK_AXES.includes(axis)) return `axis ${show(axis)} is not 'horizontal' or 'vertical'`;
  if (!getKnockbackLevel(level)) return `level ${show(level)} is not 'low', 'mid' or 'high'`;
  if (sign === undefined || sign === 1) return null;
  if (sign === -1) return axis === 'vertical' ? null : 'only vertical Knockback can be reversed (sign: -1)';
  return `sign ${show(sign)} is not 1 or -1`;
}

// The frozen numeric { x, y } of Knockback descriptor `knockback`, declared
// by `owner` (named in any warning). `x` is always positive (applyHit sends
// it along the hit's facing); `y` is positive for an upward launch and
// negative when reversed. No descriptor (undefined or null) is no knockback.
// A malformed one is logged and also gets no knockback, so bad data never
// pushes or launches anyone with a force nobody chose.
export function resolveKnockback(knockback, owner = 'An attack') {
  if (knockback == null) return NONE;
  const problem = problemWith(knockback);
  if (problem) {
    console.warn(`[Alva] ${owner} declares invalid Knockback (${problem}); it has no knockback.`);
    return NONE;
  }
  const { axis, level, sign = 1 } = knockback;
  const force = getKnockbackLevel(level)[axis];
  return axis === 'horizontal' ? Object.freeze({ x: force, y: 0 }) : Object.freeze({ x: 0, y: sign * force });
}
