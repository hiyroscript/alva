// Combo Assist: the human player's Attack 1 / Attack 2 alternation, turned
// on or off in Home › Settings › Combat (js/core/settings.js).
//
// Purpose: which move a repeated basic attack asks for, in two cases.
//   - A fresh press once the attack is over (finished, cut short or
//     interrupted), while that attack's own repeat cooldown still runs:
//     Attack 1 asks for Attack 2 instead, Attack 2 for Attack 1
//     (comboAction). The press is then an ordinary request for that move,
//     under every rule a request goes through (Fighter.tryAction: its
//     cooldown, art, airtime, place, the player's cancellation rules and
//     Combat Assist).
//   - A repeat while the attack still plays (the player's press for the
//     attack in progress, Fighter.repeatsMove): the follow-up it queues is
//     the other attack of the pair, read from the attack really playing,
//     never from the button pressed (followUpAction). The Fighter keeps it
//     until that attack plays out in full and only then tries it, as an
//     ordinary request (Fighter.comboQueue).
//
// Inputs: a Fighter (its loadout through attackFor, its CombatState
// cooldowns and attack in progress, and whether an attack could start where
// it is: Fighter.attackStartable), the pressed control codename or the
// attack in progress, and where the fighter is (on the ground or not).
// Outputs: COMBO_PAIRS, comboAction and followUpAction.
//
// Important constraints: pure and deterministic, from simulation state
// alone. It keeps no timer of its own: the source attack's repeat cooldown
// (CombatState.cooldowns, the cooldown policy's from js/data/cooldowns.js:
// the repeat delay, or 3 s / 5 s) is the whole window for a fresh press, so
// a longer cooldown is a longer window and nothing is shortened or
// overwritten; a queued follow-up lasts exactly as long as its attack plays.
// Only the two buttons in COMBO_PAIRS ever alternate (never Extra Attack or
// Attack 3 to 5), each resolved through the fighter's own `actions` for
// where it is (its ground or mid-air move), and only when both are attacks.
// Who has it at all is the Fighter's call (Fighter.comboAssistOn: the human
// player's controller with the setting on, never a CPU).

// The buttons that alternate, each with its partner.
export const COMBO_PAIRS = Object.freeze({ attack1: 'attack2', attack2: 'attack1' });

// The action a fresh press of `action` asks for on `fighter`, which is on
// the ground or not (`grounded`): its partner (COMBO_PAIRS) when the attack
// `action` performs there is over and cooling down (its repeat cooldown
// runs, and it is not the attack in progress) and the partner's attack
// could start there now, cooldown included (Fighter.attackStartable);
// otherwise `action` itself. So a press made while its own attack still
// plays is never alternated here (it is a repeat, whose follow-up waits for
// the attack to end: followUpAction), and one whose partner is unavailable
// stays the ordinary press it was, never forced into a move that cannot
// start.
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

// The action whose attack follows attack record `attack` (the attack in
// progress, CombatState.attack) once it plays out: the partner (COMBO_PAIRS)
// of the button whose move it is where it started (its `airborne`: the
// ground's moves, or the air's), when that partner is another attack there;
// otherwise null (an Extra Attack, Attack 3 to 5, the Deflect, a button
// without a partner attack). Read from the attack itself, never from the
// button pressed: Attack 1 repeated during the Attack 2 that its own last
// press made follows up with Attack 1.
export function followUpAction(fighter, attack) {
  const grounded = !attack.airborne;
  for (const [action, partner] of Object.entries(COMBO_PAIRS)) {
    if (fighter.attackFor(action, grounded) !== attack.def.id) continue;
    const alternate = fighter.attackFor(partner, grounded);
    return alternate && alternate !== attack.def.id && fighter.attacks[alternate] ? partner : null;
  }
  return null;
}
