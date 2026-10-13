// Combo Assist: the human player's Attack 1 / Attack 2 alternation, turned
// on or off in Home › Settings › Combat (js/core/settings.js).
//
// Purpose: which move a fresh press of a combo button asks for. Attack 1
// pressed again once its attack is over (finished, cut short or
// interrupted), while that attack's own repeat cooldown still runs, asks
// for Attack 2 instead; Attack 2 the same way asks for Attack 1. Nothing
// else changes: the press is then an ordinary request for that move, under
// every rule a request goes through (Fighter.tryAction: its cooldown, art,
// airtime, place, the player's cancellation rules and Combat Assist).
//
// Inputs: a Fighter (its loadout through attackFor, its CombatState
// cooldowns and attack in progress, and whether an attack could start where
// it is: Fighter.attackStartable), the pressed control codename and where
// the fighter is (on the ground or not).
// Outputs: COMBO_PAIRS and comboAction.
//
// Important constraints: pure and deterministic, from simulation state
// alone. It keeps no timer of its own: the source attack's repeat cooldown
// (CombatState.cooldowns, from js/data/cooldowns.js or the attack's longer
// authored one) is the whole window, so a longer cooldown is a longer
// window and nothing is shortened or overwritten. Only the two buttons in
// COMBO_PAIRS ever alternate (never Extra Attack or Attack 3 to 5), each
// resolved through the fighter's own `actions` for where it is (its
// ground or mid-air move), and only when both are attacks. Who has it at
// all is the Fighter's call (Fighter.comboAssistOn: the human player's
// controller with the setting on, never a CPU).

// The buttons that alternate, each with its partner.
export const COMBO_PAIRS = Object.freeze({ attack1: 'attack2', attack2: 'attack1' });

// The action a fresh press of `action` asks for on `fighter`, which is on
// the ground or not (`grounded`): its partner (COMBO_PAIRS) when the attack
// `action` performs there is over and cooling down (its repeat cooldown
// runs, and it is not the attack in progress) and the partner's attack
// could start there now, cooldown included (Fighter.attackStartable);
// otherwise `action` itself. So a press made while its own attack still
// plays is never alternated, and one whose partner is unavailable stays the
// ordinary press it was, never forced into a move that cannot start.
export function comboAction(fighter, action, grounded = fighter.body.grounded) {
  const partner = COMBO_PAIRS[action];
  if (!partner) return action;
  const source = fighter.attackFor(action, grounded);
  const combat = fighter.combat;
  if (!source || !fighter.attacks[source] || !combat.cooldowns.has(source) || combat.attack?.def.id === source) return action;
  const alternate = fighter.attackFor(partner, grounded);
  const atk = alternate ? fighter.attacks[alternate] : null;
  return atk && fighter.attackStartable(atk, grounded) ? partner : action;
}
