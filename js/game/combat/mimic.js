// Mimicry: a touch that takes what its target fights with (an attack's
// `mimic`, see js/game/combat/attacks.js).
//
// Inputs: the two fighters of a real hit by a mimic (CombatSystem.update,
// js/game/combat/combat.js), their resolved projectiles and art.
// Outputs: strongestProjectile (what a touch would copy off a fighter),
// projectileStrength, mimicFrom (the copy, or the Energy taken instead),
// mimicThrow (the attack that throws a held copy), throwOffset and
// COPY_FLOOR_CLEARANCE (where a copy leaves, clear of the floor) and copyOf
// (the copy a fighter holds, or null).
// Important constraints: nothing here names a fighter or a move. A copy is
// the projectile alone, its own definition and its own art (never what
// threw it), held by one fighter at a time (CombatState.copy) until a mimic
// of its throws it; the throw is an ordinary projectile attack built by
// the shared createAttackDefinition, so its cooldown, its Energy and its
// classification are the policies' for what it throws, and its hits go
// through CombatSystem.applyHit like any projectile's (a raised Shield
// blocks them). Taking Energy is no hit: it follows a real one.
//
//   the copy   { id, def, anim, sprites, from, throws }: the projectile's
//              id and resolved definition, its normalized clip and the
//              sprite set it was drawn from (its thrower's, whose
//              art-pixel size it keeps), the fighter it was copied off (its
//              definition's id) and the throws built for it (mimicThrow).

import { projectileHits } from '../../data/cooldowns.js';
import { createAttackDefinition } from './attacks.js';

// How strong one throw of projectile definition `def` is, against one
// target: `damage`, everything it can deal (every strike of a piercing one,
// its finisher's included; a backstab counted by its harder hit, as the
// cooldown policy weighs it), then `launch`, its hardest Base Launch, then
// `hold`, whether any strike holds or turns its target (a paralysis, a
// float, a charm or a fear).
export function projectileStrength(def) {
  const hits = projectileHits(def);
  const strikes = def.pierce && def.finisher ? [def, def.finisher] : [def];
  return {
    damage: hits.reduce((total, h) => total + h.damage, 0),
    launch: Math.max(0, ...strikes.map((h) => Math.max(h.baseLaunch ?? 0, h.backstab?.baseLaunch ?? 0))),
    hold: hits.some((h) => h.paralyze > 0 || h.float > 0 || h.charm > 0 || h.fear > 0) ? 1 : 0,
  };
}

// Whether strength `a` beats `b` (see projectileStrength), in that order.
const beats = (a, b) => a.damage - b.damage || a.launch - b.launch || a.hold - b.hold;

// The strongest projectile `fighter` throws (see projectileStrength), as a
// copy (see the header), or null when it throws none. Only one that flies
// (a `speed` above 0: a trap, an obstacle or a call left where it appears
// is no shot to take) and whose art it has; a tie goes to the one its
// definition lists first. What it holds of another's is not its own.
export function strongestProjectile(fighter) {
  let best = null;
  for (const [id, def] of Object.entries(fighter?.projectileDefs ?? {})) {
    if (!(def?.speed > 0)) continue;
    const anim = fighter.sprites?.projectile?.(def.animation);
    if (!anim) continue;
    const strength = projectileStrength(def);
    if (best && beats(strength, best.strength) <= 0) continue;
    best = { id, def, anim, sprites: fighter.sprites, strength };
  }
  if (!best) return null;
  return { id: best.id, def: best.def, anim: best.anim, sprites: best.sprites, from: fighter.def?.id ?? null, throws: new Map() };
}

// A real hit of mimic attack `def` by `attacker` landed on `target` (see
// CombatSystem.update): the attacker takes a copy of the target's strongest
// projectile into its hands (CombatState.holdCopy), or, when the target
// throws none, the Energy of `siphon` off the target (as a drain takes it:
// never below 0, reaching 0 exhausts it) and all of it for itself (never
// past its bar). Returns what it took: `copied` (the projectile's id, or
// null) and `siphoned` (the Energy taken, 0 with a copy).
export function mimicFrom(attacker, target, def) {
  const copy = strongestProjectile(target);
  if (copy) {
    attacker.combat.holdCopy(copy);
    return { copied: copy.id, siphoned: 0 };
  }
  const siphoned = def.mimic.siphon > 0 ? target.combat.drain(def.mimic.siphon) : 0;
  if (siphoned > 0) attacker.combat.gainEnergy(siphoned);
  return { copied: null, siphoned };
}

// The copy `fighter` holds now (see the header), or null.
export function copyOf(fighter) {
  return fighter?.combat?.copy ?? null;
}

// World units a copy's box is kept clear of its thrower's feet as it
// leaves (see throwOffset).
export const COPY_FLOOR_CLEARANCE = 2;

// Where a copy of projectile definition `def` leaves a mimic whose own
// `offset` is `offset` (facing right from its fighter's origin): there,
// unless its box would reach down to its fighter's feet. A copy was drawn
// and sized for its own thrower: a sphere or a whirlwind as tall as a
// fighter let go at a small fighter's shoulder would sink into the floor
// it stands on, and a projectile that meets a solid block is gone on its
// first step (see Projectile.update). So it is lifted, never lowered, as
// far as it takes to keep the whole of its box COPY_FLOOR_CLEARANCE over
// the feet, its middle still before the fighter's hand.
export function throwOffset(offset, def) {
  const hb = def.hitbox;
  const lowest = -(hb.y + hb.h) - COPY_FLOOR_CLEARANCE;
  return Object.freeze({ x: offset.x, y: Math.min(offset.y, lowest) });
}

// The attack mimic `touch` is while its fighter holds `copy`: the same
// move, clip and phases, its strike gone and a throw of the copy in its
// place, as `touch.mimic.spawnAt` crosses, from its `offset` (lifted for a
// copy too tall for it: see throwOffset; the projectile's own definition
// and art carried along as `borrowed`, see Projectile.release). Built by
// createAttackDefinition, judged with the copy for its cooldown and its
// Energy, once per copy and touch.
export function mimicThrow(touch, copy) {
  const built = copy.throws.get(touch.id);
  if (built) return built;
  const def = createAttackDefinition({
    id: touch.id,
    animation: touch.animation,
    startup: touch.startup,
    active: touch.active,
    recovery: touch.recovery,
    hitbox: null,
    projectile: {
      id: copy.id, spawnAt: touch.mimic.spawnAt, offset: throwOffset(touch.mimic.offset, copy.def),
      borrowed: Object.freeze({ def: copy.def, anim: copy.anim, sprites: copy.sprites, from: copy.from }),
    },
    groundOnly: touch.groundOnly,
    airUses: touch.airUses,
    momentum: touch.momentum,
    airMomentum: touch.airMomentum,
    friction: touch.friction,
    thrownCopy: true,
  }, { projectiles: { [copy.id]: copy.def } });
  copy.throws.set(touch.id, def);
  return def;
}
