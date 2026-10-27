// The Mash Combo at runtime: one fighter's press detector and its
// automatic series, the same state machine for every fighter, human or CPU.
//
// Purpose: the single source of truth for whether a press counts, when five
// have been made, when the series may start, which move each turn plays,
// how many turns are left and when the series is over. The rules and the
// pair are data (js/data/mash-combo.js); the Fighter
// (js/game/fighters/fighter.js) owns one MashCombo, feeds it its presses and
// its clock, starts each turn it hands out through its ordinary
// startAttack, and ends it when it is interrupted. CombatSystem
// (js/game/combat/combat.js) reads a turn's record (`mash` on the attack in
// progress) to suppress the launch of turns 1 to 11.
//
// States:
//
//   idle       counting: the presses of one trigger button so far, fresh
//              presses only, each at the simulation clock it was made on
//   armed      five presses recognized: the series waits for the first
//              moment its fighter may legally start an attack (the move its
//              first press started plays out unless a hit-confirmed window
//              opens), for MASH_COMBO.armWait at most
//   active     the series: `turn` of `turns` playing, `sequence` the moves
//
// Completed or interrupted, it is idle again, its presses forgotten, and
// `lastEnd` says how it ended ({ reason, turn }): 'complete', 'blocked'
// (a turn met a Shield), 'interrupted' (a hit, a paralysis, a launch, lost
// ground), 'expired' (never got to start), 'refused' (a move could not
// start), 'void' or 'reset'.
//
// Inputs: a fighter's resolved pair (resolveMashPair) and the simulation
// clock (tick). Outputs: MashCombo, resolveMashPair.
// Important constraints: deterministic and fixed-step: its clock is the sum
// of the fighter's steps (an impact freeze's included), never the frame
// rate. Nothing here names a fighter; it never starts an attack itself.

import { MASH_COMBO, mashPairOf, mashSequence, mashTriggers } from '../../data/mash-combo.js';

// Slack for comparing sums of fixed steps (see PHASE_EPSILON).
const EPSILON = 1e-6;

// `def`'s pair as the engine uses it ({ attacks: [A, B], triggers: button
// -> attack }), or null when it has none whose moves the fighter has (a
// test fixture; every registered fighter has one, see
// js/data/characters.js).
export function resolveMashPair(def, attacks) {
  const pair = mashPairOf(def);
  if (!pair || !pair.every((id) => attacks?.[id])) return null;
  const triggers = mashTriggers(def);
  if (!triggers.size) return null;
  return Object.freeze({ attacks: Object.freeze([...pair]), triggers });
}

export class MashCombo {
  constructor(pair, rules = MASH_COMBO) {
    this.pair = pair;
    this.rules = rules;
    this.clock = 0;
    // The presses of `button` counted so far (their clock times, oldest
    // first; never more than rules.presses).
    this.button = null;
    this.times = [];
    this.state = 'idle';
    this.armedAt = 0;
    this.first = null;
    this.sequence = null;
    this.turn = 0;
    // The attack record of the turn playing (the Fighter's), so the turn
    // that ended can be read (whether a Shield blocked it).
    this.record = null;
    this.lastEnd = null;
    // How many series have started and completed, for readers that count.
    this.started = 0;
    this.completed = 0;
  }

  get armed() {
    return this.state === 'armed';
  }

  get active() {
    return this.state === 'active';
  }

  // Recognized or running: the fighter's presses are the combo's.
  get engaged() {
    return this.state !== 'idle';
  }

  get turns() {
    return this.rules.turns;
  }

  // Presses counted toward a combo right now (0 to rules.presses - 1).
  get pressCount() {
    return this.times.length;
  }

  // Turns still to come after the one playing.
  get turnsLeft() {
    return this.active ? this.rules.turns - this.turn : 0;
  }

  // One fixed step of `dt` seconds: a count whose last press is too old is
  // forgotten, and an armed combo that never got to start is dropped.
  tick(dt) {
    this.clock += dt;
    const r = this.rules;
    if (this.times.length && this.clock - this.times[this.times.length - 1] > r.maxGap + EPSILON) this.clearPresses();
    if (this.armed && this.clock - this.armedAt > r.armWait + EPSILON) this.end('expired');
  }

  // Forgets the presses counted so far (a combo already armed or running
  // is not affected).
  clearPresses() {
    this.button = null;
    this.times.length = 0;
  }

  // A fresh press of combat button `button`, `eligible` when it may count
  // (the fighter on the ground, the press made for the ground, nothing
  // holding it). Returns 'armed' for the press that completes the count
  // (the combo is recognized: that press is the combo's, nothing else),
  // 'counted', 'reset' (another button, an ineligible press: the count
  // starts over) or null while a combo is armed or running (the Fighter
  // drops those presses).
  press(button, eligible) {
    if (this.engaged) return null;
    const r = this.rules;
    if (!eligible || !this.pair?.triggers.has(button)) {
      this.clearPresses();
      return 'reset';
    }
    const last = this.times[this.times.length - 1];
    if (button !== this.button || (last != null && this.clock - last > r.maxGap + EPSILON)) {
      this.clearPresses();
      this.button = button;
    }
    this.times.push(this.clock);
    // Rolling: a press older than the window drops off.
    while (this.times.length && this.clock - this.times[0] > r.window + EPSILON) this.times.shift();
    if (this.times.length < r.presses) return 'counted';
    this.first = this.pair.triggers.get(button);
    this.sequence = mashSequence(this.pair.attacks, this.first, r.turns);
    this.state = 'armed';
    this.armedAt = this.clock;
    this.clearPresses();
    return 'armed';
  }

  // The armed combo starts its series (the Fighter then starts turn 1).
  start() {
    if (!this.armed) return false;
    this.state = 'active';
    this.turn = 0;
    this.started++;
    return true;
  }

  // The next turn: { id, turn, turns, final } (turn counted from 1; final
  // on the last, whose launch is its own), or null when none is left.
  nextTurn() {
    if (!this.active || this.turn >= this.rules.turns) return null;
    this.turn++;
    return Object.freeze({
      id: this.sequence[this.turn - 1], turn: this.turn, turns: this.rules.turns, final: this.turn === this.rules.turns,
    });
  }

  // Over, for `reason` (see the header): idle again, nothing left of it.
  end(reason) {
    if (!this.engaged) return;
    if (reason === 'complete') this.completed++;
    this.lastEnd = Object.freeze({ reason, turn: this.turn, at: this.clock });
    this.state = 'idle';
    this.turn = 0;
    this.first = null;
    this.sequence = null;
    this.record = null;
    this.clearPresses();
  }

  // What anyone may see of it (the HUD, the CPU's perception): null while
  // idle.
  view() {
    if (!this.engaged) return null;
    return { state: this.state, turn: this.turn, turns: this.rules.turns, first: this.first, sequence: this.sequence };
  }
}
