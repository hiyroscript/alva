// The combat AI's moveset reader: what a fighter can do, read from its own
// definition and art, for any fighter.
//
// Purpose: one place that turns a Fighter's resolved data (its `actions`,
// attacks, projectiles, summons, techniques, defense, Dash and hurtboxes)
// into the options the CPU weighs (js/game/ai/combat-ai.js). The CPU never
// assumes a move: whatever a fighter's definition gives it, and nothing
// else, is in its moveset.
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
// its own motion (`reach`, see attackReach in js/game/combat/attacks.js) and that
// motion's kind (`motion`: a roll, a homing dash, a plunge, a lift, or
// null); its summons and techniques (`specials`, #0001's attack3 and
// attack4), each with its own button (`action`); whether it has a Shield
// and a Dash. An action mapped to null (a reserved button, like #0001's
// transform) is left out, as is anything the fighter would refuse for
// missing art, so the AI never presses a button that cannot do anything.
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
      const lead = sprites.duration(summon.startupAnimation) + passOf(sprites.effect(summon.cloud)) + (attack?.startup ?? 0);
      specials.push({ action, type: 'summon', id: spec.id, lead, hit: attack });
    } else if (spec?.type === 'technique') {
      const t = f.techniqueDefs[spec.id];
      if (!t || techniqueProblem(f, t)) continue;
      const form = Math.max(sprites.duration(t.formAnimation), passOf(sprites.effect(t.sphereBuild)));
      const rush = sprites.duration(t.dashAnimation);
      // The span the sphere sweeps over the rush, facing right from the
      // fighter's origin: its hand positions through the dash clip, carried
      // forward by the rush.
      const hands = t.handOffsets?.[t.dashAnimation]?.length ? t.handOffsets[t.dashAnimation] : [{ x: 0, y: 0 }];
      const hb = t.sphereHitbox;
      const x0 = Math.min(...hands.map((h) => h.x)) + hb.x;
      const x1 = Math.max(...hands.map((h) => h.x)) + hb.x + hb.w + t.dashSpeed * rush;
      const y0 = Math.min(...hands.map((h) => h.y)) + hb.y;
      const y1 = Math.max(...hands.map((h) => h.y)) + hb.y + hb.h;
      const ticks = t.tickHit ? Math.floor(t.explosionDelay / t.tickInterval) : 0;
      const damage = (t.firstHit?.damage ?? 0) + ticks * (t.tickHit?.damage ?? 0) + (t.explosionHit?.damage ?? 0);
      specials.push({
        action, type: 'technique', id: spec.id, lead: form, form, rush,
        box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        hit: { ...t.explosionHit, damage },
      });
    }
  }
  const dashDistance = (def.movement?.dashSpeed ?? 0) * f.dashDuration;
  const moveset = {
    def, sprites, melee, ranged, specials,
    shield: f.defense?.type === 'shield',
    dash: dashDistance > 0 && sprites.has('mouvment') ? { distance: dashDistance, cost: f.energyDef.dashCost } : null,
    hurt: hurtExtent(def),
  };
  MOVESETS.set(f, moveset);
  return moveset;
}
