// Move status: a read-only view of a fighter's moves for presentation (the
// ability HUD, js/ui/ability-hud.js; the Special ability mark,
// js/game/rendering/fighter-status.js). Universal: it reads every fighter's
// loadout and live combat state the same way, and never names a fighter.
//
// Inputs: a Fighter, its definition's loadout (js/data/loadout.js; read
// with moveFor, js/data/controller-profiles.js) and its combat state
// (js/game/combat/combat-state.js).
// Outputs: abilityGroups (which moves each place shows, in control order),
// moveCooldown (one move's cooldown as the combat state holds it),
// abilityStatus (a move's cooldown and any other restriction on it),
// activeMove (the move being performed now) and activeSpecialAbility (that
// move, when the fighter classifies it as Special).
// Important constraints: nothing here writes or keeps time. Every value is
// read from the authoritative stores, CombatState.cooldowns (ordinary
// attacks and the Deflect) and CombatState.abilityCooldowns (summons and
// techniques), exactly as the Fighter checks them before it starts a move,
// so what a reader shows can never disagree with what the fighter (or a
// CPU) can do. Changing place (ground or air) never touches a timer.

import { COMBAT_BUTTONS, NUMBERED_ATTACKS } from '../../config.js';
import { REPEAT_COOLDOWN } from '../../data/cooldowns.js';
import { moveFor } from '../../data/controller-profiles.js';
import { specialAction } from '../../data/loadout.js';
import { isSpecialAbility } from '../../data/special-abilities.js';
import { summonProblem } from './summon.js';
import { techniqueProblem } from './technique.js';

// The combat buttons in control order: the numbered attacks, then the extra
// attack, as the keyboard lays them out.
export const ABILITY_ORDER = Object.freeze([...NUMBERED_ATTACKS, ...COMBAT_BUTTONS.filter((b) => !NUMBERED_ATTACKS.includes(b))]);

// What `def` shows in each place, in ABILITY_ORDER: { ground, air }, each a
// list of { action, move, special } (`special`: 'summon', 'technique' or
// null). A button shows where it performs a move the fighter really has:
// on the ground its ground move (an attack, a summon or a technique), in
// the air its air move, never a ground-only one or a special. A reserved
// button (mapped to null), a button the fighter lacks and a move it has no
// definition for show nowhere.
export function abilityGroups(def) {
  const out = { ground: [], air: [] };
  for (const action of ABILITY_ORDER) {
    const special = specialAction(def, action);
    for (const place of ['ground', 'air']) {
      const move = moveFor(def, action, place);
      if (!move) continue;
      if (special) {
        const defs = special.type === 'technique' ? def.techniques : def.summons;
        if (!defs?.[move]) continue;
      } else {
        const atk = def.attacks?.[move];
        if (!atk || (place === 'air' && atk.groundOnly)) continue;
      }
      out[place].push(Object.freeze({ action, move, special: special?.type ?? null }));
    }
  }
  return out;
}

// One move's cooldown, read live: { id, duration, remaining, progress,
// cooling, special }. `duration` is the full length of the cooldown now
// running (its move's own when it is ready), `progress` how far it has
// recovered (0 as it starts, 1 ready) and `special` whether its length is
// one of the policy's special ones (longer than the repeat delay).
// `special` (the move kind) says which store holds it: a summon's and a
// technique's own timers, else the ordinary ones.
export function moveCooldown(fighter, id, kind = null) {
  const combat = fighter.combat;
  let remaining = 0;
  let duration = 0;
  let own = 0;
  if (kind === 'technique' || kind === 'summon') {
    const timers = combat.abilityCooldowns;
    remaining = timers.remaining(id);
    duration = timers.duration(id);
    own = (kind === 'technique' ? fighter.techniqueDefs : fighter.summonDefs)?.[id]?.cooldown ?? 0;
  } else {
    remaining = combat.cooldowns.get(id) ?? 0;
    own = (id === 'deflect' ? fighter.deflect : fighter.attacks?.[id])?.cooldown ?? 0;
    duration = remaining > 0 ? Math.max(own, remaining) : 0;
  }
  const cooling = remaining > 0;
  const length = cooling ? duration : own;
  return {
    id,
    duration: length,
    remaining,
    progress: cooling && duration > 0 ? Math.min(1, Math.max(0, 1 - remaining / duration)) : 1,
    cooling,
    special: length > REPEAT_COOLDOWN + 1e-9,
  };
}

// Why move `entry` (from abilityGroups) of `fighter` cannot start in its
// place for a reason other than its cooldown, or null. Shown apart from a
// cooldown, never as one: 'airUses' (its starts for this airtime are used
// up), 'freeFall' (an earlier move spent the airtime) and 'art' (its frames
// are missing: refused, never faked). Only the place the fighter is in now
// can be spent this way; the other place's moves are a preview of what
// comes after landing or leaving the ground.
export function moveRestriction(fighter, entry, place) {
  if (entry.special) {
    const defs = entry.special === 'technique' ? fighter.techniqueDefs : fighter.summonDefs;
    const def = defs?.[entry.move];
    if (!def) return 'art';
    const problem = entry.special === 'technique' ? techniqueProblem(fighter, def) : summonProblem(fighter, def);
    return problem ? 'art' : null;
  }
  const atk = fighter.attacks?.[entry.move];
  if (!atk?.animation || !fighter.sprites?.has?.(atk.animation)) return 'art';
  const here = fighter.body?.grounded ? 'ground' : 'air';
  if (place !== 'air' || here !== 'air') return null;
  if (fighter.freeFall) return 'freeFall';
  if (atk.airUses > 0 && (fighter.airAttacks?.get(atk.id) ?? 0) >= atk.airUses) return 'airUses';
  return null;
}

// Everything a reader shows for `entry` in `place`: { action, move,
// special, cooldown (moveCooldown), restriction (moveRestriction), ready }.
// `ready` is neither cooling nor restricted (whether the fighter is free to
// act at this instant is its own business: a hit or an attack in progress
// holds every move alike).
export function abilityStatus(fighter, entry, place) {
  const cooldown = moveCooldown(fighter, entry.move, entry.special);
  const restriction = moveRestriction(fighter, entry, place);
  return { ...entry, cooldown, restriction, ready: !cooldown.cooling && !restriction };
}

// The move `fighter` is performing at this instant, by its codename, or
// null: its technique, from the first cast frame to the last release frame
// (Fighter.technique: set as it is accepted, cleared the step it ends,
// whether it finished, was hit, lost the ground or was reset); its summon's
// startup (Fighter.pendingSummon); or its ordinary attack
// (CombatState.attack). What a move left behind (a projectile still flying,
// a clone, a paralysis) and its cooldown are not the move being performed.
export function activeMove(fighter) {
  if (fighter?.technique) return fighter.technique.def?.id ?? null;
  if (fighter?.pendingSummon) return fighter.pendingSummon.id ?? null;
  return fighter?.combat?.attack?.def?.id ?? null;
}

// The Special ability `fighter` is performing at this instant (see
// activeMove and isSpecialAbility, js/data/special-abilities.js), or null.
export function activeSpecialAbility(fighter) {
  const move = activeMove(fighter);
  return move && isSpecialAbility(fighter.def, move) ? move : null;
}
