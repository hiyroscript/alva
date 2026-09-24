// Power database: gameplay abilities a fighter owns at a fixed tier.
//
// Each Power is one table of tiers and the single source of truth for them:
// a fighter's definition only names its tier (`powers: { jump: 2 }` in
// js/data/characters.js), the helpers below turn that into the gameplay
// value, and the Discover screen reads the same names and descriptions.
//
// Adding a Power type means adding its tier table and an entry to POWERS;
// Discover lists every entry without further changes.

// Jump Power: the initial upward speed (world units / s) of a fighter's
// normal, voluntary jump. At Alva's gravity (CONFIG.sim.gravity, 2500) tier 1
// is a very low hop, tier 2 is the normal jump (#0001's original 920) and
// tier 3 goes a little higher. Gravity, fall speed, coyote time and the jump
// buffer are movement stats and never depend on the tier.
export const JUMP_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Jump Power 1', description: 'Very low jump.', jumpVelocity: 650 }),
  Object.freeze({ tier: 2, name: 'Jump Power 2', description: 'Normal jump.', jumpVelocity: 920 }),
  Object.freeze({ tier: 3, name: 'Jump Power 3', description: 'Slightly higher jump.', jumpVelocity: 1000 }),
]);

// Every Power type, in reference order. `defaultTier` is used only when a
// fighter's definition names no valid tier (logged; see getFighterPowerTier).
export const POWERS = Object.freeze([
  Object.freeze({
    id: 'jump',
    name: 'Jump Power',
    summary: 'Controls how high a fighter’s normal jump goes. Higher tiers jump higher.',
    tiers: JUMP_POWER_TIERS,
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

// The tier of Power `powerId` that fighter definition `def` declares in
// `def.powers`. Malformed data (no `powers`, or a tier the table lacks) is
// logged and falls back to the Power's default tier, so a fighter always
// gets a playable value; valid fighters always resolve through their table.
export function getFighterPowerTier(def, powerId) {
  const power = getPower(powerId);
  if (!power) return null;
  const declared = def?.powers?.[powerId];
  const tier = power.tiers.find((t) => t.tier === declared);
  if (tier) return tier;
  const fallback = power.tiers.find((t) => t.tier === power.defaultTier);
  console.warn(`[Alva] ${def?.displayName ?? 'A fighter'} declares no valid ${power.name} (powers.${powerId}: ${declared}); using ${fallback.name}.`);
  return fallback;
}

export const getJumpPowerTier = (def) => getFighterPowerTier(def, 'jump');

// Upward speed of `def`'s normal jump, from its Jump Power tier.
export const getJumpVelocity = (def) => getJumpPowerTier(def).jumpVelocity;
