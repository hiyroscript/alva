// The combat AI's moveset reader: what a fighter can do, read from its own
// definition and art, for any fighter.
//
// Purpose: one place that turns a Fighter's resolved data (its `actions`,
// attacks, projectiles, summons, techniques, defense, Deflect, Dash, air
// dash and hurtboxes) into the options the CPU weighs
// (js/game/ai/combat-ai.js). The CPU never assumes a move: whatever a
// fighter's definition gives it, and nothing else, is in its moveset.
//
// Inputs: a Fighter (js/game/fighters/fighter.js) with its resolved
// definitions and SpriteSet.
// Outputs: readMoveset (cached per fighter) and hurtExtent.
// Important constraints: read-only. A move the fighter would refuse (missing
// art, a reserved or absent button) is left out, so the CPU never presses a
// button that cannot do anything.

import { COMBAT_ACTIONS } from '../fighters/fighter.js';
import { attackReach } from '../combat/attacks.js';
import { summonProblem } from '../combat/summon.js';
import { techniqueProblem } from '../combat/technique.js';
import { specialAction } from '../../data/loadout.js';

const passOf = (anim) => (anim ? anim.frames.length / anim.fps : 0);

// The smallest box round both `a` (or nothing) and `b`.
function union(a, b) {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// Horizontal half-width and vertical span of a fighter's hurtboxes (their
// union, either facing), read from its own data.
export function hurtExtent(def) {
  let hw = 0;
  let top = Infinity;
  let bottom = -Infinity;
  for (const hb of def.hurtboxes ?? []) {
    hw = Math.max(hw, Math.abs(hb.x), Math.abs(hb.x + hb.w));
    top = Math.min(top, hb.y);
    bottom = Math.max(bottom, hb.y + hb.h);
  }
  if (!Number.isFinite(top)) return { hw: def.collider.width / 2, top: -def.collider.height, bottom: 0 };
  return { hw, top, bottom };
}

const MOVESETS = new WeakMap();

// Read once per fighter (and again if its definition or art changes): every
// attack a button starts, on the ground and in the air, split into melee and
// ranged (only the buttons in its `actions`, attack3 to attack5 included
// where it has them), each melee one with where its strikes can reach over
// its own motion and pull (`reach`, see attackReach in
// js/game/combat/attacks.js) and that motion's kind (`motion`: a roll, a
// homing dash, a plunge, a lift, a hover, or null); its summons and
// techniques (`specials`, e.g. #0001's attack4 and attack5), each with its
// own button (`action`), what it takes to come out (`lead`), how long it
// carries the fighter on, committed (`hold`: a technique's cast and
// release, a summon's startup) and, for a technique, where it lands
// (`box`) and with what (`hit`); whether it has a
// Shield on the ground (`groundShield`: there is none in the air), a
// Deflect in the air (`deflect`, on the `shield` button: its attack and
// reach, and whether it turns projectiles back), a Dash and an air dash
// (the universal ones, if it has their art: how far each goes).
// An action mapped to null (a reserved button, like #0001's transform) is
// left out, as is anything the fighter would refuse for missing art, so the
// AI never presses a button that cannot do anything.
export function readMoveset(f) {
  const cached = MOVESETS.get(f);
  if (cached && cached.def === f.def && cached.sprites === f.sprites) return cached;
  const { def, sprites } = f;
  const melee = [];
  const ranged = [];
  for (const action of COMBAT_ACTIONS) {
    const mapping = def.actions?.[action];
    if (!mapping || specialAction(def, action)) continue;
    const pairs = typeof mapping === 'string' ? [[mapping, false], [mapping, true]] : [[mapping.ground, false], [mapping.air, true]];
    for (const [id, air] of pairs) {
      const atk = id ? f.attacks[id] : null;
      if (!atk || (air && atk.groundOnly) || !atk.animation || !sprites.has(atk.animation)) continue;
      if (atk.projectile) {
        const proj = f.projectileDefs[atk.projectile.id];
        if (!proj?.animation || !sprites.projectile(proj.animation) || !(proj.speed > 0)) continue;
        ranged.push({ action, air, id, atk, proj });
      } else if (atk.hitbox) {
        melee.push({ action, air, id, atk, reach: attackReach(atk), motion: atk.motion?.type ?? null });
      }
    }
  }
  const specials = [];
  for (const action of COMBAT_ACTIONS) {
    const spec = specialAction(def, action);
    if (spec?.type === 'summon') {
      const summon = f.summonDefs[spec.id];
      if (!summon || summonProblem(f, summon)) continue;
      const attack = f.attacks[summon.attack];
      // From the press to its strike: the owner's startup (if any), one pass
      // of the cloud, then the attack's startup.
      const hold = sprites.duration(summon.startupAnimation);
      const lead = hold + passOf(sprites.effect(summon.cloud)) + (attack?.startup ?? 0);
      specials.push({ action, type: 'summon', id: spec.id, lead, hold, hit: attack });
    } else if (spec?.type === 'technique') {
      const t = f.techniqueDefs[spec.id];
      if (!t || techniqueProblem(f, t)) continue;
      // From the press to its release: one pass of its cast.
      const lead = sprites.duration(t.castAnimation);
      const shot = t.projectile ? f.projectileDefs[t.projectile.id] : null;
      // Where it can land, facing right from the fighter's origin: its
      // burst's box round the fighter, and its projectile's path over the
      // whole of its life.
      let box = t.burst ? { ...t.burst.hitbox } : null;
      if (shot) {
        const o = t.projectile.offset;
        const hb = shot.hitbox;
        box = union(box, { x: o.x + hb.x, y: o.y + hb.y, w: hb.w + shot.speed * shot.lifetime, h: hb.h });
      }
      specials.push({
        action, type: 'technique', id: spec.id, lead, hold: lead + sprites.duration(t.releaseAnimation), box,
        hit: t.burst?.hit ?? shot, projectile: shot ? { def: shot, offset: t.projectile.offset } : null,
      });
    }
  }
  const mv = f.movement;
  const dashDistance = mv.dashSpeed * f.dashDuration;
  const airDashDistance = mv.airDashSpeed * f.airDashDuration;
  // How far a Dash's burst runs on once it is over with nothing held: down
  // to top speed at the overspeed brake, then to a stop.
  const runOn = (mv.dashSpeed ** 2 - mv.maxSpeed ** 2) / (2 * mv.overspeedDeceleration) + mv.maxSpeed ** 2 / (2 * mv.deceleration);
  const guard = f.defense?.type === 'shield' ? f.defense.groundAnimation : null;
  const deflect = f.deflect && sprites.has(f.deflect.animation) ? f.deflect : null;
  const moveset = {
    def, sprites, melee, ranged, specials,
    groundShield: !!guard && sprites.has(guard),
    // Pressed on `shield` in the air, an aerial strike like any other, that
    // may also turn projectiles back while it is live.
    deflect: deflect ? {
      action: 'shield', air: true, id: deflect.id, atk: deflect, reach: attackReach(deflect),
      motion: deflect.motion?.type ?? null, deflect: true, catches: deflect.deflectProjectiles,
    } : null,
    // A Dash: how far it goes, and how far with its run-on (`reach`).
    dash: dashDistance > 0 && sprites.has('mouvment')
      ? { distance: dashDistance, reach: dashDistance + runOn, cost: f.energyDef.dashCost, cancelCost: f.energyDef.dashCancelCost }
      : null,
    airDash: airDashDistance > 0 && sprites.has('midair_mouvment')
      ? { distance: airDashDistance, duration: f.airDashDuration, cost: f.energyDef.dashCost, uses: f.airDashUses }
      : null,
    hurt: hurtExtent(def),
  };
  MOVESETS.set(f, moveset);
  return moveset;
}
