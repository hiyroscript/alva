// Launch: how a hit sends its target flying. Three concepts, nothing else:
//
//   Launch Point: the fighter's own number (CombatState.launchPoint, the one
//   the HUD shows). Starts at 0 on every fresh life and grows by exactly the
//   damage the fighter receives. Never negative, no maximum, and it never
//   defeats anyone by itself.
//
//   Base Launch: the hit's own multiplier (`baseLaunch`), one of 0, 1, 2 or
//   3. Not a velocity.
//
//   Directional Launch: the hit's own direction (`directionalLaunch`): null,
//   'horizontal', 'vertical' or 'reverseVertical'. Direction only, never
//   magnitude.
//
// A hit's damage is added to the target's Launch Point first. Its launch
// strength is then exactly
//
//   launch strength = Base Launch x the target's new Launch Point
//
// with nothing added to it: Base Launch 0 never launches, 1 uses the Launch
// Point once, 2 doubles it and 3 triples it. Directional Launch then sends
// that strength along the hit's facing ('horizontal'), upward ('vertical')
// or downward ('reverseVertical'); a null direction never launches. The
// strength becomes a speed at LAUNCH_UNIT_SPEED world units per second per
// point, one factor for every direction and every hit, so it only converts
// the game's numbers into the physics' units and never changes their
// proportions. A Shield is the only exception: a hit it blocks adds no
// Launch Point and launches nothing at all (see CombatSystem.applyHit in
// js/game/combat.js).
//
// Every hit (a fighter's attack, a projectile's, a charged technique's)
// declares both fields in js/data/characters.js, independently:
//
//   damage: 10, baseLaunch: 2, directionalLaunch: 'vertical'
//
// resolveHitLaunch validates them once, when the hit's definition is built.

// ---- Base Launch -----------------------------------------------------------------

// The only legal Base Launch values: the multipliers themselves.
export const BASE_LAUNCH_VALUES = Object.freeze([0, 1, 2, 3]);

// ---- Directional Launch ----------------------------------------------------------

// Every legal Directional Launch, by id, with its reference copy.
export const DIRECTIONAL_LAUNCHES = Object.freeze([
  Object.freeze({ id: null, name: 'None', description: 'The hit deals damage but causes no directional launch.' }),
  Object.freeze({ id: 'horizontal', name: 'Horizontal', description: 'Launches in the direction the hit is traveling.' }),
  Object.freeze({ id: 'vertical', name: 'Vertical', description: 'Launches upward.' }),
  Object.freeze({ id: 'reverseVertical', name: 'Reverse vertical', description: 'Launches downward.' }),
]);

const DIRECTION_IDS = DIRECTIONAL_LAUNCHES.map((d) => d.id);

// ---- Validation ------------------------------------------------------------------

const show = (value) => (typeof value === 'string' ? `'${value}'` : Array.isArray(value) ? 'an array' : String(value));

// A hit's Base Launch from its declared `baseLaunch`, declared by `owner`
// (named in any warning). None (undefined or null) is 0. Anything but 0, 1,
// 2 or 3 is logged and also 0, so bad data never launches anyone with a
// strength nobody chose.
export function resolveBaseLaunch(value, owner = 'A hit') {
  if (value == null) return 0;
  if (BASE_LAUNCH_VALUES.includes(value)) return value;
  console.warn(`[Alva] ${owner} declares invalid baseLaunch (${show(value)} is not 0, 1, 2 or 3); it has Base Launch 0.`);
  return 0;
}

// A hit's Directional Launch from its declared `directionalLaunch`,
// declared by `owner` (named in any warning). None (undefined) is null.
// Anything but null, 'horizontal', 'vertical' or 'reverseVertical' is
// logged and also null: no launch.
export function resolveDirectionalLaunchValue(value, owner = 'A hit') {
  if (value === undefined) return null;
  if (DIRECTION_IDS.includes(value)) return value;
  console.warn(`[Alva] ${owner} declares invalid directionalLaunch (${show(value)} is not null, 'horizontal', 'vertical' or 'reverseVertical'); it has none.`);
  return null;
}

// Both launch fields of hit spec `spec`, validated, for `owner`: `{
// baseLaunch, directionalLaunch }`. Neither is derived from the other or
// from anything else. A nonzero Base Launch with no direction is logged: it
// can never launch.
export function resolveHitLaunch(spec, owner = 'A hit') {
  const baseLaunch = resolveBaseLaunch(spec?.baseLaunch, owner);
  const directionalLaunch = resolveDirectionalLaunchValue(spec?.directionalLaunch, owner);
  if (baseLaunch > 0 && directionalLaunch === null) {
    console.warn(`[Alva] ${owner} declares Base Launch ${baseLaunch} with no directionalLaunch; it never launches.`);
  }
  return { baseLaunch, directionalLaunch };
}

// ---- Resolution ------------------------------------------------------------------

// A hit's launch strength against a target at `launchPoint` (already
// including this hit's damage): exactly Base Launch x Launch Point.
export function resolveLaunchStrength(baseLaunch, launchPoint) {
  return baseLaunch * launchPoint;
}

// World units per second of launch speed for each point of launch
// strength: the one conversion from launch strength to physics, the same for
// every direction and every hit. Without it a launch would be measured on the
// same scale as damage, far below the world's (gravity 2500, a jump 920), and
// no hit would visibly move anyone until very high Launch Points.
export const LAUNCH_UNIT_SPEED = 10;

const NO_LAUNCH = Object.freeze({ x: 0, y: 0 });

// The world-space launch velocity `{ x, y }` of `strength` sent along
// `direction`, for a hit traveling toward `facing` (1 right, -1 left): a
// speed of strength x LAUNCH_UNIT_SPEED. World y grows downward, so a
// vertical launch is negative y. Direction never changes the magnitude. A
// null direction, or no strength, is no launch at all.
export function resolveDirectionalLaunch(direction, strength, facing = 1) {
  if (!(strength > 0)) return NO_LAUNCH;
  const speed = strength * LAUNCH_UNIT_SPEED;
  if (direction === 'horizontal') return Object.freeze({ x: speed * facing, y: 0 });
  if (direction === 'vertical') return Object.freeze({ x: 0, y: -speed });
  if (direction === 'reverseVertical') return Object.freeze({ x: 0, y: speed });
  return NO_LAUNCH;
}

// ---- Reference copy --------------------------------------------------------------

// What Discover says about Launch. Mechanics only: no fighter or attack is
// ever named.
export const LAUNCH_POINT_SUMMARY =
  'Launch Point is accumulated damage: it starts at 0, and all damage taken is added to it. ' +
  'When a hit with a Base Launch above 0 connects, the Launch Point decides how strongly the target is launched: ' +
  'the higher it is, the harder the launch. It resets to 0 after an elimination, on respawn.';

export const LAUNCH_FORMULA = 'Launch strength = Base Launch × Launch Point';

export const BASE_LAUNCH_SUMMARY =
  'Every hit has a Base Launch of 0, 1, 2 or 3. The hit’s damage is added to the Launch Point first, then the new Launch Point is multiplied by the Base Launch.';

// What each Base Launch value does, by value.
export const BASE_LAUNCH_DESCRIPTIONS = Object.freeze({
  0: 'No launch. The Launch Point is multiplied by zero.',
  1: 'Normal launch. Uses the Launch Point once.',
  2: 'Double launch. Uses twice the Launch Point.',
  3: 'Triple launch. Uses three times the Launch Point.',
});

export const DIRECTIONAL_LAUNCH_SUMMARY =
  'Every hit also has a Directional Launch. It decides where the launch strength sends the target, never how strong it is.';
