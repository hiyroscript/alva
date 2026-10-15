// The cooldown policy: how long every discrete move waits before it can be
// used again, the same rules for every fighter. A fighter never chooses a
// move's cooldown; the policy derives it from what the move does, read from
// its structured combat data (its hits, its projectile, its burst, its
// impact, its heal), never from its name or its fighter.
//
//   1. A move that deals 10 damage waits TEN_DAMAGE_COOLDOWN (5 s): any one
//      hit of it dealing 10 (a strike, a multi-hit's finisher, its
//      projectile or that projectile's finisher, a slam's impact, a
//      technique's burst, a summoned clone's attack), or everything one use
//      can deal one target adding up to 10 or more.
//   2. Otherwise a move with an exceptional effect waits
//      EXCEPTIONAL_COOLDOWN (3 s): one listed in EXCEPTIONAL_EFFECTS (a heal
//      of Launch Point, a paralysis that holds its target in place, a charm
//      that turns its target's hits into heals).
//   3. Otherwise it has no cooldown of its own: only the universal repeat
//      delay, REPEAT_COOLDOWN (0.5 s).
//
// The first rule that applies decides; the special cooldowns never add up
// (a 10-damage paralysis is 5 s, never 8). Nothing else counts: launching,
// pushing, pulling, homing, carrying, a projectile, a quake, a bounce, a
// slam, ordinary hitstun or blockstun, a long animation (ROUTINE_EFFECTS).
//
// Exempt moves (the Deflect) skip the universal repeat delay: with no
// special class their cooldown is 0, none at all. Locomotion, jumps and the
// Shield have no move cooldown either; the Dash and the air dash keep their
// own movement timers (CombatState.movementCooldowns), outside this policy.
//
// So exactly three lengths exist: REPEAT_COOLDOWN, EXCEPTIONAL_COOLDOWN and
// TEN_DAMAGE_COOLDOWN (and 0 for an exempt move). A definition may leave
// `cooldown` out (and should: it is derived); one that declares it must
// agree with the policy, or it is refused as it is built (resolveCooldown):
// no fighter can author an 8-second cooldown, a 12-second heal or a 0.05 s
// Deflect. A value up to REPEAT_COOLDOWN on a move with no special class is
// the baseline itself, so it is accepted (and is the baseline).

export const REPEAT_COOLDOWN = 0.5;
export const EXCEPTIONAL_COOLDOWN = 3;
export const TEN_DAMAGE_COOLDOWN = 5;

// The damage that makes a move a ten-damage move (the top damage tier).
export const TEN_DAMAGE = 10;

// Every special cooldown the policy can give, shortest first.
export const SPECIAL_COOLDOWNS = Object.freeze([EXCEPTIONAL_COOLDOWN, TEN_DAMAGE_COOLDOWN]);

// A move's class, by the rule that applies to it (see above), and the
// cooldown each gives (null: the baseline, or none for an exempt move).
export const COOLDOWN_CLASSES = Object.freeze({
  ordinary: null,
  exceptional: EXCEPTIONAL_COOLDOWN,
  tenDamage: TEN_DAMAGE_COOLDOWN,
});

// The effects that make a move exceptional (rule 2), by the field that
// carries them: a move's own `heal` (Launch Point it restores to its
// fighter, see js/game/combat/technique.js), a hit's `paralyze` (seconds
// it holds its target in place, unable to act) and a hit's `charm`
// (seconds its target's hits on the charmer heal it instead; both in
// js/game/combat/hit-effects.js). A new effect that stops a fighter acting
// or restores it belongs here.
export const EXCEPTIONAL_EFFECTS = Object.freeze(['heal', 'paralyze', 'charm']);

// Every other combat capability a hit or a move may declare, classified as
// routine: none of them earns a cooldown, however strong it looks. Every
// shared hit effect (HIT_EFFECT_FIELDS) and every field that shapes a
// strike, a projectile or a move's motion is in one list or the other (the
// cooldown tests check it), so a new one has to be classified on purpose.
export const ROUTINE_EFFECTS = Object.freeze([
  'damage', 'baseLaunch', 'directionalLaunch', 'hitstun', 'blockstun', 'hitstop',
  'blockPush', 'quake', 'carry', 'pull', 'repel', 'erase', 'pierce', 'finisher', 'stall',
  'motion', 'step', 'hits', 'projectile', 'burst', 'deflectProjectiles', 'passThrough', 'hurtboxes',
  'airUses', 'freeFall', 'groundOnly', 'hitCancel',
]);

const sum = (hits) => hits.reduce((total, h) => total + h.damage, 0);
const hit = (spec, inherited = {}) => ({
  damage: spec?.damage ?? 0,
  paralyze: spec?.paralyze ?? inherited.paralyze ?? 0,
  charm: spec?.charm ?? inherited.charm ?? 0,
});

// Every hit projectile `spec` deals one target, in order: its strike once,
// or a piercing one's `pierce.hits` strikes, the last its `finisher`.
export function projectileHits(spec) {
  if (!spec) return [];
  const count = spec.pierce?.hits > 1 ? spec.pierce.hits : 1;
  const hits = Array.from({ length: count }, () => hit(spec));
  if (spec.pierce && spec.finisher) hits[count - 1] = hit(spec.finisher, spec);
  return hits;
}

// What one use of a move can do to one target, from its raw entry (a
// character's `attacks`, `techniques` or `summons` entry, or its
// `deflect`): { hits, heal }. `kind` is 'attack', 'technique' or 'summon';
// `context` the fighter's own `projectiles` (for a throw or a cast) and
// `attacks` (for a summon's clone). Without a context, only the move's own
// hits count.
export function moveImpact(kind, spec, { projectiles = null, attacks = null } = {}) {
  if (!spec) return { hits: [], heal: 0 };
  if (kind === 'summon') {
    // A clone performs one attack, or its no-ground one: the more severe.
    const uses = [spec.attack, spec.noGround?.attack]
      .filter(Boolean)
      .map((id) => moveImpact('attack', attacks?.[id], { projectiles }));
    return uses.sort((a, b) => rank(b) - rank(a) || sum(b.hits) - sum(a.hits))[0] ?? { hits: [], heal: 0 };
  }
  const hits = [];
  if (kind === 'technique') {
    if (spec.burst?.hit) hits.push(hit(spec.burst.hit));
  } else if (!spec.pending) {
    if (Array.isArray(spec.hits)) for (const h of spec.hits) hits.push(hit(h, spec));
    else if (spec.hitbox !== null && spec.damage !== undefined) hits.push(hit(spec));
    if (spec.motion?.impact?.hit) hits.push(hit(spec.motion.impact.hit));
  }
  if (spec.projectile?.id) hits.push(...projectileHits(projectiles?.[spec.projectile.id]));
  return { hits, heal: kind === 'technique' ? spec.heal ?? 0 : 0 };
}

const CLASS_RANK = Object.freeze({ ordinary: 0, exceptional: 1, tenDamage: 2 });
const rank = (impact) => CLASS_RANK[impactClass(impact)];

// The class of what a move does (see moveImpact): 'tenDamage',
// 'exceptional' or 'ordinary', by the first rule that applies.
export function impactClass({ hits = [], heal = 0 } = {}) {
  if (hits.some((h) => h.damage >= TEN_DAMAGE) || sum(hits) >= TEN_DAMAGE) return 'tenDamage';
  if (heal > 0 || hits.some((h) => h.paralyze > 0 || h.charm > 0)) return 'exceptional';
  return 'ordinary';
}

// A move's class straight from its raw entry (see moveImpact).
export function cooldownClass(kind, spec, context) {
  return impactClass(moveImpact(kind, spec, context));
}

// The cooldown the policy gives a move of class `cls`: its special one, else
// the universal repeat delay (none at all for an exempt move).
export function policyCooldown(cls = 'ordinary', { exempt = false } = {}) {
  const special = COOLDOWN_CLASSES[cls];
  if (special === undefined) throw new Error(`[Alva] Unknown cooldown class "${cls}"`);
  return special ?? (exempt ? 0 : REPEAT_COOLDOWN);
}

const REASONS = Object.freeze({
  tenDamage: 'it deals 10 damage',
  exceptional: 'it has an exceptional effect (a heal, a paralysis or a charm)',
  ordinary: 'it deals no 10 damage and has no exceptional effect',
});

// The cooldown `owner` (a move, named in errors) really has: the policy's
// for its class `cls` (see policyCooldown). A declared `value` must be
// finite, non-negative seconds, and must agree with the policy (anything up
// to REPEAT_COOLDOWN is the baseline itself, on a move that is not exempt);
// any other is refused, never quietly kept or rounded.
export function resolveCooldown(value, owner = 'Move', { exempt = false, cls = 'ordinary' } = {}) {
  const policy = policyCooldown(cls, { exempt });
  if (value === undefined) return policy;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`[Alva] ${owner} declares cooldown ${value}: expected finite, non-negative seconds`);
  }
  const declared = exempt ? value : Math.max(REPEAT_COOLDOWN, value);
  if (Math.abs(declared - policy) > 1e-9) {
    throw new Error(`[Alva] ${owner} declares cooldown ${value}: the cooldown policy gives it ${policy} s, as ${REASONS[cls]} (js/data/cooldowns.js)`);
  }
  return policy;
}
