// Power database: fighter abilities owned at a fixed tier.
//
// Powers belong to a fighter: its definition names one tier of each
// (`powers: { jump: 2, speed: 2 }` in js/data/characters.js). Each Power is
// one frozen table of tiers and the single source of truth for its names,
// descriptions, tier numbers and tuning values. A definition only names a
// tier; the resolvers below turn it into the gameplay value, and the Discover
// screen reads the same names and descriptions (never the values).
//
// Adding a Power type means adding its tier table and an entry to POWERS;
// Discover lists every entry without further changes. (How hard an attack
// moves its target is Launch, not a Power: see js/data/launch.js.)

// ---- Tier tables ------------------------------------------------------------

// Jump Power: the initial upward speed (world units / s) of a fighter's
// normal, voluntary jump. At Alva's gravity (CONFIG.sim.gravity, 2500) tier 1
// is a very low hop, tier 2 is the normal jump and tier 3 goes a little
// higher. Gravity, fall speed, coyote time and the jump buffer are movement
// stats and never depend on the tier.
export const JUMP_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Jump Power 1', description: 'Very low jump.', jumpVelocity: 650 }),
  Object.freeze({ tier: 2, name: 'Jump Power 2', description: 'Normal jump.', jumpVelocity: 920 }),
  Object.freeze({ tier: 3, name: 'Jump Power 3', description: 'Slightly higher jump.', jumpVelocity: 1000 }),
]);

// Speed Power: the top speed (world units / s) of a fighter's normal left /
// right movement, on the ground and in the air alike. Tier 2 is the normal
// speed and tier 3 only a little faster. Acceleration, deceleration, the turn
// boost and air control are movement stats; launches, projectiles, Dashes
// and charged techniques have speeds of their own.
export const SPEED_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Speed Power 1', description: 'Slow.', maxSpeed: 270 }),
  Object.freeze({ tier: 2, name: 'Speed Power 2', description: 'Normal speed.', maxSpeed: 330 }),
  Object.freeze({ tier: 3, name: 'Speed Power 3', description: 'Slightly faster.', maxSpeed: 360 }),
]);

// ---- Registry ------------------------------------------------------------------

// Every Power type, in reference order. `defaultTier` is used only when a
// fighter declares a tier the table lacks (logged; see resolveTier).
export const POWERS = Object.freeze([
  Object.freeze({
    id: 'jump',
    name: 'Jump Power',
    summary: 'Controls how high a normal jump goes. Higher tiers jump higher.',
    tiers: JUMP_POWER_TIERS,
    defaultTier: 2,
  }),
  Object.freeze({
    id: 'speed',
    name: 'Speed Power',
    summary: 'Controls maximum movement speed. Higher tiers move faster.',
    tiers: SPEED_POWER_TIERS,
    defaultTier: 2,
  }),
]);

export function getPower(id) {
  return POWERS.find((p) => p.id === id) || null;
}

// The tier entry numbered `tier` of Power `powerId`, or null.
export function getPowerTier(powerId, tier) {
  return getPower(powerId)?.tiers.find((t) => t.tier === tier) || null;
}

// The tier of `power` numbered `declared`. A tier the table lacks is logged,
// naming `owner`, and falls back to the Power's default tier, so malformed
// data still gets a playable value; valid data always resolves through its
// table.
function resolveTier(power, declared, owner) {
  const tier = getPowerTier(power.id, declared);
  if (tier) return tier;
  const fallback = getPowerTier(power.id, power.defaultTier);
  console.warn(`[Alva] ${owner} declares no valid ${power.name} (powers.${power.id}: ${declared}); using ${fallback.name}.`);
  return fallback;
}

// ---- Resolvers -------------------------------------------------------------------

// The tier of Power `powerId` that fighter definition `def` declares in
// `def.powers`. Every fighter owns a tier of every Power, so a missing one is
// malformed data (logged, default tier). Null for an unknown id.
export function getFighterPowerTier(def, powerId) {
  const power = getPower(powerId);
  if (!power) return null;
  return resolveTier(power, def?.powers?.[powerId], def?.displayName ?? 'A fighter');
}

export const getJumpPowerTier = (def) => getFighterPowerTier(def, 'jump');
export const getSpeedPowerTier = (def) => getFighterPowerTier(def, 'speed');

// Upward speed of `def`'s normal jump, from its Jump Power tier.
export const getJumpVelocity = (def) => getJumpPowerTier(def).jumpVelocity;

// Top speed of `def`'s normal movement, from its Speed Power tier.
export const getMaxSpeed = (def) => getSpeedPowerTier(def).maxSpeed;
