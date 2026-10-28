// Match statistics: what each side of a Battle did over the whole
// competitive match, for the Match Results dialog (js/screens/battle-screen.js).
//
// Purpose: one counter set per side (p1 and p2, Team I and Team II), kept
// across every life and respawn, started over by a new match (a restart or
// a rematch), and frozen once the match is decided (snapshot): what the
// fighters do during the celebration after it never reaches the numbers.
//
// Inputs: the Battle after each fixed step of the live match (record). It
// only observes what the game already reports, never repeating a rule:
// the CombatSystem's hit, block and charm events and its deflections of
// that step (js/game/combat/combat.js), and each fighter's running totals of
// Energy paid and Launch Point recovered (CombatState.energySpent and
// launchPointRecovered, js/game/combat/combat-state.js), counted where they
// change. A respawn's fresh CombatState starts both totals at 0, so a
// respawn's reset is never a recovery and nothing paid before it is lost.
// The Void falls come from the Battle itself (fall), as it scores them.
//
// Outputs: snapshot(), a deeply frozen { p1, p2 } of the counters below.
// Nothing here knows which fighter is which: no fighter is ever special.

// Every counter a side keeps, in the order the results show them.
//   points           the final score (the Battle's, set as it is frozen)
//   damageDealt      damage its hits added to the opponent's Launch Point
//                    (its melee, projectiles, clones, techniques and
//                    Deflected projectiles alike; never a blocked hit)
//   damageReceived   damage added to its own Launch Point, a stage
//                    hazard's included (credited to nobody else)
//   launchPointRecovered  Launch Point taken off by passive recovery and
//                    by heals (a technique's, a fear's feeding, a charmed
//                    opponent's hit)
//   blocks           hits its Shield stopped (a perfect Shield included)
//   perfectShields   of those, the ones a perfect Shield stopped
//   deflects         projectiles its Deflect turned back
//   energyConsumed   Energy actually paid (a partial payment as paid)
//   voidFalls        times it fell into the Void during the match
//   successfulAttacks  hits it landed that were not blocked
//   highestHit       the most damage one of its hits dealt
export const STAT_KEYS = Object.freeze([
  'points', 'damageDealt', 'damageReceived', 'launchPointRecovered', 'blocks', 'perfectShields',
  'deflects', 'energyConsumed', 'voidFalls', 'successfulAttacks', 'highestHit',
]);

const SIDES = Object.freeze(['p1', 'p2']);

const blankSide = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

export class MatchStats {
  // `fighters`: the Battle's fighters, each with its `slot` ('p1' / 'p2').
  constructor(fighters) {
    this.fighters = fighters;
    this.reset();
  }

  // A new match: every counter at 0, and each fighter's running totals
  // read from where they stand now.
  reset() {
    this.sides = { p1: blankSide(), p2: blankSide() };
    this.seen = new Map();
    for (const f of this.fighters) this.seen.set(f, this.mark(f.combat));
  }

  mark(combat) {
    return { combat, energy: combat?.energySpent ?? 0, recovered: combat?.launchPointRecovered ?? 0 };
  }

  sideOf(f) {
    return f && SIDES.includes(f.slot) ? this.sides[f.slot] : null;
  }

  // One fixed step of the live match: its combat events and deflections,
  // and what each fighter paid and recovered since the last step (from 0
  // on a CombatState it has not seen yet: a respawn's fresh one).
  record(battle) {
    const combat = battle.combat;
    for (const e of combat.events) {
      const by = e.hazard ? null : this.sideOf(e.attacker);
      const to = this.sideOf(e.target);
      if (e.type === 'hit') {
        if (to) to.damageReceived += e.damage;
        if (by && e.attacker !== e.target) {
          by.damageDealt += e.damage;
          by.successfulAttacks += 1;
          by.highestHit = Math.max(by.highestHit, e.damage);
        }
      } else if (e.type === 'block' && to) {
        to.blocks += 1;
        if (e.perfect) to.perfectShields += 1;
      }
    }
    for (const d of combat.deflections) {
      const side = this.sideOf(d.fighter);
      if (side) side.deflects += 1;
    }
    for (const f of this.fighters) {
      const side = this.sideOf(f);
      let seen = this.seen.get(f);
      if (!seen || seen.combat !== f.combat) seen = this.mark(null);
      const c = f.combat;
      if (side && c) {
        side.energyConsumed += Math.max(0, (c.energySpent ?? 0) - seen.energy);
        side.launchPointRecovered += Math.max(0, (c.launchPointRecovered ?? 0) - seen.recovered);
      }
      this.seen.set(f, this.mark(c));
    }
  }

  // `f` fell into the Void while the match was live.
  fall(f) {
    const side = this.sideOf(f);
    if (side) side.voidFalls += 1;
  }

  // The counters as they stand, with `score` as each side's points, frozen
  // all the way down: nothing may change them afterwards.
  snapshot(score = { p1: 0, p2: 0 }) {
    const out = {};
    for (const slot of SIDES) out[slot] = Object.freeze({ ...this.sides[slot], points: score[slot] ?? 0 });
    return Object.freeze(out);
  }
}
