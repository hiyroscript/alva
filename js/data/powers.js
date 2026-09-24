// Power database: gameplay abilities owned at a fixed tier.
//
// Powers come in two scopes, by what owns them:
//
//   fighter Powers (Jump, Speed) belong to a fighter. Its definition names
//     one tier of each (`powers: { jump: 2, speed: 2 }` in
//     js/data/characters.js).
//   attack Powers (Horizontal Knockback, Vertical Knockback) belong to one
//     attack, so a fighter's attacks can differ. Each attack definition names
//     the tier of each axis it uses (`powers: { horizontalKnockback: 2 }`);
//     an axis it leaves out has no knockback.
//
// Each Power is one frozen table of tiers and the single source of truth for
// its names, descriptions, tier numbers and tuning values. A definition only
// names a tier; the resolvers below turn it into the gameplay value, and the
// Discover screen reads the same names and descriptions (never the values).
//
// Adding a Power type means adding its tier table and an entry to POWERS;
// Discover lists every entry without further changes.

// ---- Tier tables ------------------------------------------------------------

// Jump Power (fighter): the initial upward speed (world units / s) of a
// fighter's normal, voluntary jump. At Alva's gravity (CONFIG.sim.gravity,
// 2500) tier 1 is a very low hop, tier 2 is the normal jump and tier 3 goes a
// little higher. Gravity, fall speed, coyote time and the jump buffer are
// movement stats and never depend on the tier.
export const JUMP_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Jump Power 1', description: 'Very low jump.', jumpVelocity: 650 }),
  Object.freeze({ tier: 2, name: 'Jump Power 2', description: 'Normal jump.', jumpVelocity: 920 }),
  Object.freeze({ tier: 3, name: 'Jump Power 3', description: 'Slightly higher jump.', jumpVelocity: 1000 }),
]);

// Speed Power (fighter): the top speed (world units / s) of a fighter's
// normal left / right movement, on the ground and in the air alike. Tier 2
// is the normal speed and tier 3 only a little faster. Acceleration,
// deceleration, the turn boost and air control are movement stats; knockback,
// projectiles, Dodges and charged techniques have speeds of their own.
export const SPEED_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Speed Power 1', description: 'Slow.', maxSpeed: 270 }),
  Object.freeze({ tier: 2, name: 'Speed Power 2', description: 'Normal speed.', maxSpeed: 330 }),
  Object.freeze({ tier: 3, name: 'Speed Power 3', description: 'Slightly faster.', maxSpeed: 360 }),
]);

// Horizontal Knockback Power (attack): the sideways speed (world units / s)
// an attack's hit gives its target, away from the attacker. It becomes the
// attack's `knockback.x` (see createAttackDefinition in js/game/combat.js).
export const HORIZONTAL_KNOCKBACK_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Horizontal Knockback Power 1', description: 'Light horizontal knockback.', knockbackX: 140 }),
  Object.freeze({ tier: 2, name: 'Horizontal Knockback Power 2', description: 'Normal horizontal knockback.', knockbackX: 180 }),
  Object.freeze({ tier: 3, name: 'Horizontal Knockback Power 3', description: 'Strong horizontal knockback.', knockbackX: 220 }),
]);

// Vertical Knockback Power (attack): the upward launch speed (world units / s)
// an attack's unblocked hit gives its target. It becomes the attack's positive
// `knockback.y`, which CombatSystem.applyHit applies as `vy = -knockback.y`.
export const VERTICAL_KNOCKBACK_POWER_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Vertical Knockback Power 1', description: 'Light upward launch.', knockbackY: 220 }),
  Object.freeze({ tier: 2, name: 'Vertical Knockback Power 2', description: 'Normal upward launch.', knockbackY: 300 }),
  Object.freeze({ tier: 3, name: 'Vertical Knockback Power 3', description: 'Strong upward launch.', knockbackY: 380 }),
]);

// ---- Registry ------------------------------------------------------------------

// Every Power type, in reference order. `scope` says what declares it: a
// fighter's `powers` ('fighter') or an attack's `powers` ('attack').
// `defaultTier` is used only when a definition declares a tier the table
// lacks (logged; see resolveTier).
export const POWERS = Object.freeze([
  Object.freeze({
    id: 'jump',
    scope: 'fighter',
    name: 'Jump Power',
    summary: 'Controls how high a normal jump goes. Higher tiers jump higher.',
    tiers: JUMP_POWER_TIERS,
    defaultTier: 2,
  }),
  Object.freeze({
    id: 'speed',
    scope: 'fighter',
    name: 'Speed Power',
    summary: 'Controls maximum movement speed. Higher tiers move faster.',
    tiers: SPEED_POWER_TIERS,
    defaultTier: 2,
  }),
  Object.freeze({
    id: 'horizontalKnockback',
    scope: 'attack',
    name: 'Horizontal Knockback Power',
    summary: 'Controls how strongly an attack pushes a hit opponent sideways. Higher tiers push farther.',
    tiers: HORIZONTAL_KNOCKBACK_POWER_TIERS,
    defaultTier: 2,
  }),
  Object.freeze({
    id: 'verticalKnockback',
    scope: 'attack',
    name: 'Vertical Knockback Power',
    summary: 'Controls how strongly an attack launches a hit opponent upward. Higher tiers launch higher.',
    tiers: VERTICAL_KNOCKBACK_POWER_TIERS,
    defaultTier: 2,
  }),
]);

export const FIGHTER_POWERS = Object.freeze(POWERS.filter((p) => p.scope === 'fighter'));
export const ATTACK_POWERS = Object.freeze(POWERS.filter((p) => p.scope === 'attack'));

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

// ---- Fighter Powers ------------------------------------------------------------

// The tier of fighter Power `powerId` that fighter definition `def` declares
// in `def.powers`. Every fighter owns a tier of every fighter Power, so a
// missing one is malformed data (logged, default tier). Null for an unknown
// id or an attack Power, which no fighter owns.
export function getFighterPowerTier(def, powerId) {
  const power = getPower(powerId);
  if (power?.scope !== 'fighter') return null;
  return resolveTier(power, def?.powers?.[powerId], def?.displayName ?? 'A fighter');
}

export const getJumpPowerTier = (def) => getFighterPowerTier(def, 'jump');
export const getSpeedPowerTier = (def) => getFighterPowerTier(def, 'speed');

// Upward speed of `def`'s normal jump, from its Jump Power tier.
export const getJumpVelocity = (def) => getJumpPowerTier(def).jumpVelocity;

// Top speed of `def`'s normal movement, from its Speed Power tier.
export const getMaxSpeed = (def) => getSpeedPowerTier(def).maxSpeed;

// ---- Attack Powers -------------------------------------------------------------

// The tier of attack Power `powerId` that attack spec `attack` declares in
// `attack.powers`, or null when it declares none: an attack uses only the
// axes it names. A declared tier the table lacks is logged and gets the
// default tier. Null for an unknown id or a fighter Power.
export function getAttackPowerTier(attack, powerId) {
  const power = getPower(powerId);
  if (power?.scope !== 'attack') return null;
  const declared = attack?.powers?.[powerId];
  if (declared == null) return null;
  return resolveTier(power, declared, `Attack "${attack?.id ?? '?'}"`);
}

// Sideways knockback of attack spec `attack`, from its Horizontal Knockback
// Power; 0 when it declares none.
export const getHorizontalKnockback = (attack) =>
  getAttackPowerTier(attack, 'horizontalKnockback')?.knockbackX ?? 0;

// Upward launch of attack spec `attack`, from its Vertical Knockback Power;
// 0 when it declares none.
export const getVerticalKnockback = (attack) =>
  getAttackPowerTier(attack, 'verticalKnockback')?.knockbackY ?? 0;

// The frozen { x, y } knockback of attack spec `attack` from its knockback
// Powers, each axis independent: horizontal only, vertical only, both or
// neither. An entry in `attack.powers` that is not an attack Power is logged
// and ignored.
export function getAttackKnockback(attack) {
  for (const id of Object.keys(attack?.powers ?? {})) {
    if (getPower(id)?.scope !== 'attack') {
      console.warn(`[Alva] Attack "${attack.id ?? '?'}" declares "${id}", which is not an attack Power; ignoring it.`);
    }
  }
  return Object.freeze({ x: getHorizontalKnockback(attack), y: getVerticalKnockback(attack) });
}
