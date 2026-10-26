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
//      that turns its target's hits into heals, a float that lifts its
//      target helpless into the air, a fear that makes its own hits on its
//      target heal it).
//   3. Otherwise it is an ordinary move: no cooldown at all (0). There is
//      no universal repeat delay: what keeps an ordinary move from being
//      used again at once is its own animation (it never restarts or cuts
//      into itself while it plays, see Fighter.tryAction) and, for one that
//      creates a gameplay construct (a projectile, a clone, a burst), its
//      Energy (js/data/energy.js).
//
// The first rule that applies decides; the special cooldowns never add up
// (a 10-damage paralysis is 5 s, never 8). Nothing else counts: launching,
// pushing, pulling, homing, carrying, a projectile, a quake, a bounce, a
// slam, ordinary hitstun or blockstun, a long animation (ROUTINE_EFFECTS).
// The Deflect deals 3 and has no special effect: it is ordinary, 0.
// Locomotion, jumps and the Shield have no move cooldown either; the Dash
// and the air dash keep their own movement timers
// (CombatState.movementCooldowns, movement.dashRepeat), outside this policy.
//
// So exactly two lengths exist, EXCEPTIONAL_COOLDOWN and
// TEN_DAMAGE_COOLDOWN, and 0 for every ordinary move. A definition may
// leave `cooldown` out (and should: it is derived); one that declares it
// must agree with the policy, or it is refused as it is built
// (resolveCooldown): no fighter can author an 8-second cooldown, a
// 12-second heal or a 0.5 s jab.
//
// A special cooldown starts only once its move is released (see
// RELEASE_EVENTS): never on the press, the startup or the cast. A move
// interrupted before it releases starts none; one released keeps its
// cooldown whatever happens after (a hit in its recovery, a miss, a block,
// a projectile turned back, a clone gone). One activation starts it once.

export const EXCEPTIONAL_COOLDOWN = 3;
export const TEN_DAMAGE_COOLDOWN = 5;

// The damage that makes a move a ten-damage move (the top damage tier).
export const TEN_DAMAGE = 10;

// Every special cooldown the policy can give, shortest first.
export const SPECIAL_COOLDOWNS = Object.freeze([EXCEPTIONAL_COOLDOWN, TEN_DAMAGE_COOLDOWN]);

// A move's class, by the rule that applies to it (see above), and the
// cooldown each gives (0: none at all).
export const COOLDOWN_CLASSES = Object.freeze({
  ordinary: 0,
  exceptional: EXCEPTIONAL_COOLDOWN,
  tenDamage: TEN_DAMAGE_COOLDOWN,
});

// The effects that make a move exceptional (rule 2), by the field that
// carries them: a move's own `heal` (Launch Point it restores to its
// fighter, see js/game/combat/technique.js), a hit's `paralyze` (seconds
// it holds its target in place, unable to act), a hit's `charm` (seconds
// its target's hits on the charmer heal it instead), a hit's `float`
// (seconds it holds its target helpless, rising in the air) and a hit's
// `fear` (seconds its fighter's own hits on its target feed it; all four in
// js/game/combat/hit-effects.js). A new effect that stops a fighter acting
// or restores it belongs here.
export const EXCEPTIONAL_EFFECTS = Object.freeze(['heal', 'paralyze', 'charm', 'float', 'fear']);

// Every other combat capability a hit or a move may declare, classified as
// routine: none of them earns a cooldown, however strong it looks. Every
// shared hit effect (HIT_EFFECT_FIELDS) and every field that shapes a
// strike, a projectile or a move's motion is in one list or the other (the
// cooldown tests check it), so a new one has to be classified on purpose.
export const ROUTINE_EFFECTS = Object.freeze([
  'damage', 'baseLaunch', 'directionalLaunch', 'hitstun', 'blockstun', 'hitstop',
  'blockPush', 'quake', 'gaze', 'carry', 'pull', 'repel', 'erase', 'pierce', 'finisher', 'stall',
  'motion', 'step', 'mobility', 'hits', 'projectile', 'burst', 'deflectProjectiles', 'passThrough', 'hurtboxes',
  'airUses', 'freeFall', 'groundOnly', 'hitCancel',
]);

const sum = (hits) => hits.reduce((total, h) => total + h.damage, 0);
const hit = (spec, inherited = {}) => ({
  damage: spec?.damage ?? 0,
  paralyze: spec?.paralyze ?? inherited.paralyze ?? 0,
  charm: spec?.charm ?? inherited.charm ?? 0,
  float: spec?.float ?? inherited.float ?? 0,
  fear: spec?.fear ?? inherited.fear ?? 0,
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
  if (heal > 0 || hits.some((h) => h.paralyze > 0 || h.charm > 0 || h.float > 0 || h.fear > 0)) return 'exceptional';
  return 'ordinary';
}

// A move's class straight from its raw entry (see moveImpact).
export function cooldownClass(kind, spec, context) {
  return impactClass(moveImpact(kind, spec, context));
}

// The cooldown the policy gives a move of class `cls`: its special one, or
// 0 for an ordinary move.
export function policyCooldown(cls = 'ordinary') {
  const seconds = COOLDOWN_CLASSES[cls];
  if (seconds === undefined) throw new Error(`[Alva] Unknown cooldown class "${cls}"`);
  return seconds;
}

// When each kind of move is released, the one event its special cooldown
// starts on (see the top), by what the move is. Release is not a hit: a
// projectile that later misses, a strike that whiffs or is blocked was
// released all the same.
//
//   strike       a single-strike melee attack: its strike goes live (its
//                startup over).
//   strikes      a multi-hit attack: its last strike goes live, the whole
//                authored string emitted (an early strike is not enough).
//   projectile   an attack that throws one: the projectile is spawned (the
//                attack's time crosses its spawnAt, the thrower not stunned).
//   impact       a slam with an impact: the impact strikes, as it lands
//                (one whose plunge runs out in the air never releases).
//   technique    its cast is over and it lets go of what it casts (its
//                projectile, its burst, its heal: Technique.release).
//   summon       its clone actually appears (spawnClones,
//                js/game/combat/summon.js).
//
// An attack that both strikes and throws is released once both have.
export const RELEASE_EVENTS = Object.freeze(['strike', 'strikes', 'projectile', 'impact', 'technique', 'summon']);

const REASONS = Object.freeze({
  tenDamage: 'it deals 10 damage',
  exceptional: 'it has an exceptional effect (a heal, a paralysis, a charm, a float or a fear)',
  ordinary: 'it deals no 10 damage and has no exceptional effect',
});

// The cooldown `owner` (a move, named in errors) really has: the policy's
// for its class `cls` (see policyCooldown). A declared `value` must be
// finite, non-negative seconds, and must agree with the policy exactly (0
// for an ordinary move); any other is refused, never quietly kept or
// rounded.
export function resolveCooldown(value, owner = 'Move', { cls = 'ordinary' } = {}) {
  const policy = policyCooldown(cls);
  if (value === undefined) return policy;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`[Alva] ${owner} declares cooldown ${value}: expected finite, non-negative seconds`);
  }
  if (Math.abs(value - policy) > 1e-9) {
    throw new Error(`[Alva] ${owner} declares cooldown ${value}: the cooldown policy gives it ${policy} s, as ${REASONS[cls]} (js/data/cooldowns.js)`);
  }
  return policy;
}
