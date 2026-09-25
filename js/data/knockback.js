// Knockback: how an attack moves an opponent when it connects. Two separate
// values decide every launch, and neither is ever derived from the other:
//
//   Default (base) Knockback: the attack's own. Belongs to the move and says
//   which way it launches and how hard it naturally does. A shove, a punch, a
//   launcher and an explosion each have their own, even against a fighter
//   that has taken nothing yet. Not a Power, and not the fighter's.
//
//   Accumulated Knockback: the fighter's own number (CombatState.knockback,
//   the one the HUD shows). Starts at 0 and grows by the damage of every hit
//   the fighter takes. It adds an independent extra launch whenever that
//   fighter is hit by a launching move; it never scales the move's default.
//
// An attack declares its default Knockback in js/data/characters.js as one
// descriptor, an axis and a strength level, which are independent:
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
// resolveKnockback, once, into the numeric `baseKnockback: { x, y }` that
// CombatSystem.applyHit reads, and the descriptor's axis into its
// `accumulatedKnockbackAxis`; the Discover screen reads the same names and
// descriptions (never the values). Bespoke hits that are not fighter attacks
// (a projectile's, a charged technique's) declare a numeric `baseKnockback`
// directly, and may name their `accumulatedKnockbackAxis` (see
// resolveLaunchAxis).
//
// A hit's final launch is the sum of two parts (resolveLaunch):
//
//   final launch = default launch + accumulated-Knockback bonus
//
// The bonus comes from the target's accumulated Knockback alone
// (accumulatedKnockbackBonus), after the hit's damage has been added. It
// follows the move's launch axis and direction but never its size, so at
// the same accumulated Knockback a weak push and a strong blast gain exactly
// the same extra launch and keep their natural difference. A move with no
// default launch (a shuriken, a technique's ticks) is not a launching hit:
// it gains no bonus either, however much Knockback the target has.

// ---- Levels ------------------------------------------------------------------

// Each level's default launch speed (world units / s) along each axis:
// `horizontal` becomes the attack's `baseKnockback.x` and `vertical` its
// `baseKnockback.y`. Attack strength only: never accumulated Knockback, a
// multiplier or the launch at high Knockback. Listed in reference order,
// weakest first.
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

// ---- Accumulated Knockback ---------------------------------------------------------

// How much extra launch (world units / s) each point of a target's
// accumulated Knockback adds, per axis: vertical launches are naturally
// larger, so that axis gets its own rate. Fighter-side tuning, the same for
// every attack; never an attack's strength. No maximum.
export const ACCUMULATED_KNOCKBACK_SCALING = Object.freeze({ horizontalPerPoint: 2, verticalPerPoint: 4 });

// The extra launch speed a fighter with `accumulated` Knockback takes along
// `axis` ('horizontal' or 'vertical'): 0 at 0, growing steadily (linearly)
// with no cap. Knockback never goes below 0, and no axis (null) is no bonus.
export function accumulatedKnockbackBonus(accumulated, axis) {
  const { horizontalPerPoint, verticalPerPoint } = ACCUMULATED_KNOCKBACK_SCALING;
  const perPoint = axis === 'horizontal' ? horizontalPerPoint : axis === 'vertical' ? verticalPerPoint : 0;
  return Math.max(0, accumulated) * perPoint;
}

// ---- Launch ----------------------------------------------------------------------

// The axis a default launch `base` moves along the most: 'horizontal' or
// 'vertical' (horizontal on a tie), or null when it has no launch at all.
export function dominantLaunchAxis(base) {
  if (!base.x && !base.y) return null;
  return Math.abs(base.x) >= Math.abs(base.y) ? 'horizontal' : 'vertical';
}

// The axis the accumulated-Knockback bonus follows for a hit with default
// launch `base`, declared by `owner` (named in any warning). `declared` is
// the hit's own `accumulatedKnockbackAxis`, when it names one; otherwise, or
// when it names something other than an axis `base` actually launches
// along (logged), the dominant axis. Null for a hit with no default launch:
// it is not a launching hit, whatever it declares.
export function resolveLaunchAxis(base, declared, owner = 'A hit') {
  const dominant = dominantLaunchAxis(base);
  if (declared == null || !dominant) return dominant;
  if (declared === 'horizontal' && base.x) return declared;
  if (declared === 'vertical' && base.y) return declared;
  console.warn(`[Alva] ${owner} declares accumulatedKnockbackAxis ${show(declared)}, which its baseKnockback does not launch along; using '${dominant}'.`);
  return dominant;
}

// The launch a hit with default launch `base` gives a target that now has
// `accumulated` Knockback, in the move's own frame (x away from the
// attacker, y upward): `{ base, bonus, final }`, with final = base + bonus.
// The bonus is the target's accumulatedKnockbackBonus along `axis` (by
// default the dominant one), in the sign `base` already has there, so a
// push stays a push, a launch rises and a spike still drives down; the other
// axis keeps its default unchanged. It never depends on the size of `base`,
// and a hit with no default launch gets none.
export function resolveLaunch(base, accumulated, axis = dominantLaunchAxis(base)) {
  let bx = 0;
  let by = 0;
  if (axis === 'horizontal' && base.x) bx = Math.sign(base.x) * accumulatedKnockbackBonus(accumulated, axis);
  else if (axis === 'vertical' && base.y) by = Math.sign(base.y) * accumulatedKnockbackBonus(accumulated, axis);
  return {
    base: { x: base.x, y: base.y },
    bonus: { x: bx, y: by },
    final: { x: base.x + bx, y: base.y + by },
  };
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

// The frozen numeric default launch { x, y } of Knockback descriptor
// `knockback`, declared by `owner` (named in any warning). `x` is always positive (applyHit sends
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
