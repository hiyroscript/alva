// Combat Assist: the human player's short, automatic approach before a
// melee attack, turned on or off in Home › Settings › Combat
// (js/core/settings.js).
//
// Purpose: the measurements that decide whether a melee press made just out
// of reach closes the gap first, and how: the requested attack's own hitbox
// against the opponent's hurtboxes, straight across on the ground and
// straight at the target in the air (down, up or across: an aerial is
// thrown anywhere in a jump), capped by one Dash's travel on the ground and
// one air dash's in the air. The Fighter (js/game/fighters/fighter.js) owns
// the rest: the runtime state (fighter.combatAssist), when in each fixed
// step it is read, the presses that replace or cancel it, and who has it at
// all (a player's controller with the setting on, never a CPU). It moves at
// the Dash's and the air dash's speed and range, but it is neither: it
// never costs Energy (full, partly spent or exhausted, it is free).
//
// Inputs: a Fighter (its body, pushbox, universal movement values and its
// Dash and air dash durations), the attack definition its press resolved to
// (js/game/combat/attacks.js), its opponent (body, facing, hurtboxes and
// pushbox) and the stage collision (js/game/physics.js).
// Outputs: assistsAttack, assistSpeed, assistRange, meleeGap, reachVector,
// approachMove, approachClear, REACHED and ASSIST_MARGIN.
//
// Important constraints: pure and deterministic, from simulation data only
// (bodies and definitions, never render positions, the DOM or a clock).
// Nothing here names a fighter, an attack or a button: an attack is melee
// by its data (isMeleeAttack), and homing by its motion. The attack is
// measured, never changed: its hitbox, damage, timing and motion stay
// exactly as authored. A homing attack is never served at all
// (assistsAttack). An attack whose own reach (attackReach: a roll's path, a
// pull's circle) already covers its target needs no approach, and one that
// gets one stops as soon as that reach does; but how far away an approach
// may start is measured from the box its strike is drawn with alone, so no
// attack's assist reaches further for its motion.

import { worldBox } from './combat.js';
import { attackReach, isMeleeAttack } from './attacks.js';

// Whether attack `atk` may be served by an approach at all: a melee attack
// (isMeleeAttack), unless it homes in on its target by itself (a `homing`
// motion: its own lock-on is its approach, however far it reaches). Read
// from the attack's data alone.
export function assistsAttack(atk) {
  return isMeleeAttack(atk) && atk.motion?.type !== 'homing';
}

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
// every one is behind it. `dy` measures it as if the fighter were that much
// lower (higher, negative) first.
export function meleeGap(fighter, hitbox, target, direction, dy = 0) {
  const { x, y } = fighter.body;
  const top = y + dy + hitbox.y;
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

// The vertical span, its middle, and the width of `target`'s hurtboxes,
// together.
function bodyOf(target) {
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const hurt of target.hurtboxes ?? target.def.hurtboxes) {
    const hb = worldBox(target, hurt, scratchHurt);
    top = Math.min(top, hb.y);
    bottom = Math.max(bottom, hb.y + hb.h);
    left = Math.min(left, hb.x);
    right = Math.max(right, hb.x + hb.w);
  }
  return { top, bottom, middle: (top + bottom) / 2, width: right - left };
}

// The straight move that puts `box` (facing right from `fighter`'s origin,
// turned toward `direction`, 1 right or -1 left) over `target`: { dx, dy,
// length }, `dx` along `direction` (never back) and `dy` down. On the
// ground (`air` false) across only, against the hurtboxes at the box's
// height, ASSIST_MARGIN past the nearest one's edge. In the air, also up or
// down: unless `box` already spans the target's middle (a plunge's path
// down onto a target below, a lift's up into one above), it brings
// `strike` (the box the attack strikes with first) into the target's body
// from above or below, half the shorter of the two deep; and across it
// goes half the narrower of the two into it. In the air both may move, so
// it never settles for an overlap at the edge. Null when the box could not
// reach it that way (another level for the ground, the target behind).
export function reachVector(fighter, box, target, direction, air = false, strike = box) {
  const { y } = fighter.body;
  let dy = 0;
  let margin = ASSIST_MARGIN;
  if (air) {
    const body = bodyOf(target);
    const top = y + box.y;
    if (!(top < body.middle && body.middle < top + box.h)) {
      const depth = Math.min(strike.h, body.bottom - body.top) / 2;
      const sTop = y + strike.y;
      const sBottom = sTop + strike.h;
      if (sBottom < body.top + depth) dy = body.top + depth - sBottom;
      else if (sTop > body.bottom - depth) dy = body.bottom - depth - sTop;
    }
    margin = Math.max(ASSIST_MARGIN, Math.min(strike.w, body.width) / 2);
  }
  const gap = meleeGap(fighter, box, target, direction, dy);
  if (!Number.isFinite(gap)) return null;
  const dx = Math.max(0, gap + margin);
  // `least`: the shortest move across that still reaches (just past the
  // edge), for an approach the target's body leaves no room to go deeper.
  return { dx, dy, length: Math.hypot(dx, dy), least: Math.max(0, gap + ASSIST_MARGIN) };
}

// The approach is over: the attack's own reach covers its target.
export const REACHED = Object.freeze({ dx: 0, dy: 0, length: 0 });

// Moves shorter than this are none (positions are sums of floats).
const NO_MOVE = 1e-6;

// The move the approach must still make for attack `atk` (melee) to reach
// `target`, toward `direction`: REACHED once the attack's own reach
// (attackReach: its box, or its motion's or pull's) covers it, else the
// straight move until it does (reachVector; on the ground, across only, in
// the air (`air`) any way). As the approach `start`s, REACHED as soon as
// that reach meets the target at all (no approach: the attack as ever).
// Null when it cannot: the move longer than `left` world units of travel,
// as it starts the box its strike is drawn with too (never its motion), or
// the fighter's pushbox meeting the target's across where their bodies end
// side by side (the approach never goes through anyone: in the air it goes
// only as deep as that leaves room for, at least to the edge of reach;
// above or below it, as pushboxes do, it may pass over), or no way at all
// (another level for the ground, the target behind).
export function approachMove(fighter, atk, target, direction, left, air = false, start = false) {
  const reach = attackReach(atk);
  if (start && meleeGap(fighter, reach, target, direction) < 0) return REACHED;
  const move = reachVector(fighter, reach, target, direction, air, atk.hitbox);
  if (!move) return null;
  if (move.length <= NO_MOVE) return REACHED;
  if (move.length > left) return null;
  if (start) {
    const strike = reachVector(fighter, atk.hitbox, target, direction, air);
    if (!strike || strike.length > left) return null;
  }
  const a = fighter.body;
  const b = target.body;
  const endY = a.y + move.dy;
  if (!(endY - a.height < b.y && b.y - b.height < endY)) return move;
  const room = direction * (b.x - a.x) - (fighter.def.pushbox.width + target.def.pushbox.width) / 2;
  if (move.dx <= room) return move;
  if (move.least > room) return null;
  const dx = Math.max(0, room);
  const length = Math.hypot(dx, move.dy);
  return length <= NO_MOVE ? REACHED : { dx, dy: move.dy, length, least: move.least };
}

// Whether `fighter` can make `move` (from approachMove) toward `direction`
// with nothing in the way: no solid anywhere across its path, and on the
// ground (`air` false) footing at the same height where it would stop; in
// the air, nothing to land on along a move down. The approach never runs
// into a wall, a ceiling or off its ground, nor lands midway.
export function approachClear(fighter, stage, direction, move, air = false) {
  const b = fighter.body;
  const to = b.x + direction * move.dx;
  const toY = b.y + move.dy;
  const x0 = direction > 0 ? b.x : to - b.halfW;
  const x1 = direction > 0 ? to + b.halfW : b.x;
  const top = Math.min(b.y, toY) - b.height;
  const bottom = Math.max(b.y, toY);
  if (stage.solidAcross(x0, x1, bottom, bottom - top)) return false;
  if (!air) return stage.supportsAt(to - b.halfW, to + b.halfW, b.y);
  const span0 = Math.min(b.x, to) - b.halfW;
  const span1 = Math.max(b.x, to) + b.halfW;
  return !(move.dy > 0 && stage.surfaceBelow(span0, span1, b.y).y <= toY + 1);
}
