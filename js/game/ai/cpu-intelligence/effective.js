// CPU Intelligence: the real numbers of the match (the Adventure update).
//
// Purpose: every prediction the CPU makes of damage, launch, recovery or
// Energy reads the numbers as the match really applies them, through each
// fighter's modifiers (js/game/combat/modifiers.js), not the authored ones.
// In every mode but Adventure the modifiers are the identity and nothing
// here changes a value, bit for bit. In Adventure the CPU (Venture) deals
// `damageDealt` times its hits' damage, and the player may take less
// (Brave Soldier), deal more (Redoutable Strength), recover more a tick
// (Nearly Immortal) or more often (Velocious Immune System), and pay less
// for everything that costs Energy (Maximum Energy).
//
// The modifiers are known rules of the match, like the clock or the score,
// never perception: the CPU reads its opponent's (`fighter.modifiers`) as
// it reads the stage, while its opponent's state stays what perception
// shows it. Nothing here computes a rule twice: each helper is the combat
// engine's own function (hitDamage, recoveryAmount, recoveryInterval,
// energyCost).
//
// Inputs: modifiers objects (Situation's `me.mods` and `op.mods`).
// Outputs: modsOf, effectiveDamage, effectiveRecovery, effectiveEnergyCost,
// BASE_RECOVERY_RATE.

import { LAUNCH_RECOVERY_DELAY } from '../../../data/launch.js';
import { IDENTITY_MODIFIERS, hitDamage, recoveryAmount, recoveryInterval, energyCost } from '../../combat/modifiers.js';

// A fighter's modifiers for the match (the identity's when it has none).
export function modsOf(fighter) {
  return fighter?.modifiers ?? fighter?.combat?.modifiers ?? IDENTITY_MODIFIERS;
}

// What a real hit of `damage` from a fighter with `attacker` modifiers adds
// to a target with `target` modifiers (a strike's damage, or a number of
// Launch Points "another hit or two" would add).
export function effectiveDamage(attacker, target, damage) {
  return hitDamage(damage, attacker, target);
}

// How a fighter with `mods` recovers Launch Point: { delay, amount,
// interval, rate } (seconds before it starts, points a tick, seconds a
// tick, points a second once it runs).
export function effectiveRecovery(mods) {
  const amount = recoveryAmount(mods);
  const interval = recoveryInterval(mods);
  return { delay: LAUNCH_RECOVERY_DELAY, amount, interval, rate: amount / interval };
}

// Points a second the universal recovery takes off (the identity's rate).
export const BASE_RECOVERY_RATE = effectiveRecovery(IDENTITY_MODIFIERS).rate;

// How much faster than the universal rate a fighter with `mods` recovers
// (1 with the identity's).
export function recoveryRelief(mods) {
  return effectiveRecovery(mods).rate / BASE_RECOVERY_RATE;
}

// What a cost of `cost` Energy really costs a fighter with `mods`.
export function effectiveEnergyCost(mods, cost) {
  return energyCost(cost, mods);
}
