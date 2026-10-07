// Combat Assist: the human player's short, automatic approach before a
// melee attack, turned on or off in Home › Settings › Combat
// (js/core/settings.js).
//
// Purpose: the measurements that decide whether a melee press made just out
// of reach closes the gap first, and how far it goes: the requested
// attack's own hitbox against the opponent's hurtboxes, capped by one
// Dash's travel on the ground and one air dash's in the air. The Fighter (js/game/fighters/fighter.js) owns
// the rest: the runtime state (fighter.combatAssist), when in each fixed
// step it is read, its Energy, the presses that replace or cancel it, and
// who has it at all (a player's controller with the setting on, never a
// CPU).
//
// Inputs: a Fighter (its body, pushbox, universal movement values and its
// Dash and air dash durations), the attack definition its press resolved to
// (js/game/combat/attacks.js), its opponent (body, facing, hurtboxes and
// pushbox) and the stage collision (js/game/physics.js).
// Outputs: assistSpeed, assistRange, meleeGap, approachDistance,
// approachClear and ASSIST_MARGIN.
//
// Important constraints: pure and deterministic, from simulation data only
// (bodies and definitions, never render positions, the DOM or a clock).
// Nothing here names a fighter, an attack or a button: an attack is melee
// by its data (isMeleeAttack). The attack is measured, never changed: its
// hitbox, damage, timing and motion stay exactly as authored. An attack
// whose own reach (attackReach: a roll's path, a homing dash's lock-on, a
// pull's circle) already covers its target needs no approach, and one that
// gets one stops as soon as that reach does; but how far away an approach
// may start is measured from the box its strike is drawn with alone, so no
// attack's assist reaches further for its motion.

import { worldBox } from './combat.js';
import { attackReach } from './attacks.js';

// World units past the edge of reach the approach stops at, so the strike's
// box overlaps a hurtbox (the hit test is strict) rather than touching it.
export const ASSIST_MARGIN = 1;

// The speed an approach goes at: the universal Dash's on the ground, the
// air dash's in the air (`air`).
export function assistSpeed(fighter, air = false) {
  const mv = fighter.movement;
  return air ? mv.airDashSpeed : mv.dashSpeed;
}

// The most one approach may cover: one Dash's travel on the ground
// (movement.dashSpeed x the fighter's Dash duration), one air dash's in the
// air (`air`: airDashSpeed x its air dash duration). 0 for a fighter
// without that art (mouvment, or midair_mouvment), which then has no
// assist there.
export function assistRange(fighter, air = false) {
  const speed = assistSpeed(fighter, air);
  const duration = air ? fighter.airDashDuration : fighter.dashDuration;
  return speed > 0 && duration > 0 ? speed * duration : 0;
}

const scratchHurt = {};

// How much further `fighter` must go toward `direction` (1 right, -1
// left), facing that way, for `hitbox` (an attack's, facing right from the
// fighter's origin) to overlap one of `target`'s hurtboxes where they are
// now: negative when it already does, Infinity when none of them shares
// the box's height (a target on another level, or in the air above it) or
// every one is behind it.
export function meleeGap(fighter, hitbox, target, direction) {
  const { x, y } = fighter.body;
  const top = y + hitbox.y;
  const bottom = top + hitbox.h;
  // Distances along `direction` (u = direction x world x): the box's back
  // and front edges, and each hurtbox's near and far ones.
  const back = direction * x + hitbox.x;
  const front = back + hitbox.w;
  let gap = Infinity;
  for (const hurt of target.hurtboxes ?? target.def.hurtboxes) {
    const box = worldBox(target, hurt, scratchHurt);
    if (!(top < box.y + box.h && bottom > box.y)) continue;
    const near = direction > 0 ? box.x : -(box.x + box.w);
    if (near + box.w <= back) continue;
    gap = Math.min(gap, near - front);
  }
  return gap;
}

// How far the approach must still go for attack `atk` (melee) to reach
// `target`: 0 once the attack's own reach (attackReach) covers it; else
// how far until it does (its meleeGap, plus ASSIST_MARGIN). Infinity when
// the box its strike is drawn with could not reach it within `left` world
// units, nor without the fighter's pushbox meeting the target's (the
// approach never goes through anyone), nor at all (another level, the
// target behind).
export function approachDistance(fighter, atk, target, direction, left) {
  const reach = meleeGap(fighter, attackReach(atk), target, direction);
  if (reach < 0) return 0;
  const strike = meleeGap(fighter, atk.hitbox, target, direction);
  const room = direction * (target.body.x - fighter.body.x) - (fighter.def.pushbox.width + target.def.pushbox.width) / 2;
  const need = reach + ASSIST_MARGIN;
  return strike + ASSIST_MARGIN <= left && need <= room ? need : Infinity;
}

// Whether `fighter` can go `distance` world units straight toward
// `direction` with nothing in the way: no solid's side across the path
// and, on the ground (`air` false), footing at the same height where it
// would stop. The approach never runs into a wall or off its ground; one in
// the air (flat across, as an air dash) needs no footing.
export function approachClear(fighter, stage, direction, distance, air = false) {
  const b = fighter.body;
  const to = b.x + direction * distance;
  const x0 = direction > 0 ? b.x : to - b.halfW;
  const x1 = direction > 0 ? to + b.halfW : b.x;
  if (stage.solidAcross(x0, x1, b.y, b.height)) return false;
  return air || stage.supportsAt(to - b.halfW, to + b.halfW, b.y);
}
