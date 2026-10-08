// CPU Intelligence: adaptation, the opponent's habits as observed.
//
// Purpose: what this opponent tends to do, learned during the match from
// what the CPU actually saw: how often it jumps in, shields when attacked,
// throws projectiles, approaches or backs off, attacks unsafely (a whiff it
// can be punished for), punishes the CPU's own whiffs, dodges shots by
// jumping, which moves it favours and the distance it likes to fight at.
// Each habit is a running rate that moves only as fast as the level adapts
// and only after enough evidence (one action is never a pattern), and is
// weighed only as strongly as the level recognizes patterns. Kept through
// respawns, cleared for a new match.
//
// Inputs: the situation each step and the combat events the CPU took in.
// Outputs: OpponentModel.
// Important constraints: observation only. Never the opponent's input,
// never a prediction of its next press: tendencies, nothing more.

// Habits and their neutral prior (the rate assumed with no evidence).
const PRIORS = Object.freeze({
  jumpIns: 0.3, shields: 0.3, projectiles: 0.3, approaches: 0.5, unsafe: 0.3, punishes: 0.5, dodgesShots: 0.3,
});

export class OpponentModel {
  constructor(profile) {
    this.profile = profile;
    this.reset();
  }

  reset() {
    this.rate = { ...PRIORS };
    this.evidence = Object.fromEntries(Object.keys(PRIORS).map((k) => [k, 0]));
    this.moveUse = new Map();
    this.preferredDist = 160;
    this.prevFoeAttack = null;
    this.prevFoeAttackWhiffed = false;
    this.prevAir = false;
    this.prevApproach = 0;
    this.myExposedSince = null;
  }

  // One observation of habit `key`: `value` 1 (it did) or 0 (it did not).
  observe(key, value) {
    const n = ++this.evidence[key];
    const step = this.profile.adaptation * 0.25 * Math.min(1, n / 3);
    this.rate[key] += (value - this.rate[key]) * step;
  }

  // How much habit `key` should sway a decision now: its rate's departure
  // from the prior, as far as the evidence and the level allow (-1 to 1).
  bias(key) {
    const n = this.evidence[key];
    if (n < 3) return 0;
    const conf = Math.min(1, (n - 2) / 8);
    return (this.rate[key] - PRIORS[key]) * 2 * conf * this.profile.patterns;
  }

  get punishes() { return this.rate.punishes; }

  // Every step: what the opponent did, as perceived.
  update(S, events) {
    if (!S.foeIn) return;
    const fv = S.fv;
    // A jump in: it leaves the ground toward the CPU, within reach.
    const air = !fv.grounded;
    if (air && !this.prevAir && S.dist < 360) {
      const toward = Math.sign(fv.vx) === Math.sign(S.x - fv.x) && Math.abs(fv.vx) > 60;
      this.observe('jumpIns', toward ? 1 : 0);
    }
    this.prevAir = air;
    // A new attack: which move, from how far; a projectile or not.
    const atk = fv.atkDef;
    if (atk && atk !== this.prevFoeAttack) {
      this.moveUse.set(atk.id, (this.moveUse.get(atk.id) ?? 0) + 1);
      this.observe('projectiles', atk.projectile ? 1 : 0);
      this.preferredDist += (S.dist - this.preferredDist) * 0.15 * this.profile.adaptation;
    }
    if (!atk && this.prevFoeAttack && this.prevFoeAttackWhiffed) this.observe('unsafe', 1);
    if (atk) this.prevFoeAttackWhiffed = S.foeWhiffing && fv.atkDef.recovery > 0.12;
    this.prevFoeAttack = atk;
    // Approach or retreat, while both are on the ground near each other.
    if (fv.grounded && S.dist < 500 && Math.abs(fv.vx) > 100) {
      const approach = Math.sign(fv.vx) === Math.sign(S.x - fv.x) ? 1 : 0;
      if (approach !== this.prevApproach) {
        this.observe('approaches', approach);
        this.prevApproach = approach;
      }
    }
    for (const e of events) {
      if (e.attacker === S.self) {
        // It blocked or got hit by the CPU's attack: did it shield?
        if (!e.projectile && !e.technique) this.observe('shields', e.type === 'block' ? 1 : 0);
        if (e.projectile) this.observe('dodgesShots', 0);
      } else if (e.target === S.self && e.type === 'hit') {
        if (this.myExposedSince !== null && S.clock - this.myExposedSince < 0.6) this.observe('punishes', 1);
      }
    }
    // The CPU's own whiff: was it punished? (Counted when it ends.)
    const mine = S.attack;
    if (mine && !mine.hasHit && S.attackPhase === 'recovery' && this.myExposedSince === null) this.myExposedSince = S.clock;
    if (!mine && this.myExposedSince !== null) {
      if (S.clock - this.myExposedSince > 0.6) {
        this.observe('punishes', 0);
        this.myExposedSince = null;
      }
    }
  }

  // A projectile of the CPU's that passed the opponent: dodged.
  shotDodged() {
    this.observe('dodgesShots', 1);
  }

  // Whether it has a favourite move (used far more than any other).
  favourite() {
    let best = null;
    let n = 0;
    let total = 0;
    for (const [id, c] of this.moveUse) {
      total += c;
      if (c > n) {
        n = c;
        best = id;
      }
    }
    return total >= 6 && n / total > 0.45 ? best : null;
  }
}
