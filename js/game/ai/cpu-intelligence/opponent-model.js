// CPU Intelligence, layer 4: opponent modeling.
//
// Purpose: a lightweight, human-like memory of how this opponent plays,
// built only from what the CPU has recognized (perception's events and the
// visible picture of its opponent): how often it jumps, attacks on the
// ground or in the air, throws projectiles, Dashes and Shields; how often it
// raises its Shield when something comes at it; how far away it likes to
// start its attacks; whether it presses forward or backs off; which moves it
// repeats; how often it whiffs. Every statistic is a rolling rate with
// exponential decay, so one observation never becomes a permanent
// assumption and old habits fade. The level's `adapt` decides how quickly
// the evidence is trusted (`trust`): an Easy CPU only acts on obvious,
// repeated habits; a Brutal one adapts fast, but only to what it saw.
//
// Inputs: perceived events and pictures. Outputs: OpponentModel.
// Important constraints: never reads inputs (only what the fighter did on
// screen) and never predicts a random choice: it estimates tendencies.

// How fast every rate forgets (per second): about a 12-second memory.
const DECAY = 1 / 12;

export class OpponentModel {
  constructor(profile) {
    this.profile = profile;
    this.reset();
  }

  // A new match or rematch: nothing known about this opponent yet.
  reset() {
    this.time = 0;
    this.n = {
      jump: 0, groundAttack: 0, airAttack: 0, projectile: 0, dash: 0, shield: 0, whiff: 0,
      threatened: 0, shieldedThreat: 0, jumpedThreat: 0, approach: 0, retreat: 0, technique: 0,
      closeTime: 0, closeAttack: 0,
    };
    this.attackDist = 120;
    this.attackDistW = 0;
    this.moves = new Map();
    this.lastMove = null;
    this.repeat = 0;
    this.aggression = 0.5;
    this.side = 0;
  }

  // Seconds of observation behind the current rates (decayed).
  get evidence() {
    return Math.min(this.time, 1 / DECAY);
  }

  // How much the CPU trusts what it has seen: grows with the evidence, at
  // the level's adaptation speed.
  trust(count) {
    const k = 0.5 + (1 - this.profile.adapt) * 8;
    return (count / (count + k)) * (0.25 + 0.75 * this.profile.adapt);
  }

  // A rate per second of `kind`, decayed.
  rate(kind) {
    const span = this.evidence;
    return span > 0.5 ? this.n[kind] * DECAY / (1 - Math.exp(-DECAY * span)) : 0;
  }

  // Ages every count by `dt` and takes in this step's recognized events and
  // the opponent's motion relative to the CPU (`dx` from the CPU to it;
  // `near`: within reach of its own strikes).
  update(dt, events, view, dx, threatenedNow, near = false) {
    this.time += dt;
    const f = Math.exp(-DECAY * dt);
    for (const k of Object.keys(this.n)) this.n[k] *= f;
    this.attackDistW *= f;
    for (const e of events) {
      if (!e.recognized) continue;
      switch (e.kind) {
        case 'attack': {
          const def = e.data;
          if (def?.projectile) this.n.projectile += 1;
          else if (view.grounded) this.n.groundAttack += 1;
          else this.n.airAttack += 1;
          if (near && !def?.projectile) this.n.closeAttack += 1;
          const d = Math.abs(dx);
          this.attackDist = (this.attackDist * this.attackDistW + d) / (this.attackDistW + 1);
          this.attackDistW += 1;
          const id = def?.id ?? null;
          if (id) this.moves.set(id, (this.moves.get(id) ?? 0) * f + 1);
          this.repeat = id && id === this.lastMove ? this.repeat + 1 : 0;
          this.lastMove = id;
          break;
        }
        case 'technique': this.n.technique += 1; break;
        case 'jump': case 'airJump': this.n.jump += 1; break;
        case 'dash': case 'airDash': this.n.dash += 1; break;
        case 'shield':
          this.n.shield += 1;
          if (threatenedNow) this.n.shieldedThreat += 1;
          break;
        case 'whiff': this.n.whiff += 1; break;
        default: break;
      }
    }
    if (threatenedNow) this.n.threatened += dt * 4;
    if (near) this.n.closeTime += dt;
    // Pressing forward (toward the CPU) or backing off.
    const toward = -Math.sign(dx) * view.vx;
    if (view.grounded && Math.abs(view.vx) > 60) {
      if (toward > 0) this.n.approach += dt;
      else this.n.retreat += dt;
    }
    const a = this.n.approach + this.n.groundAttack * 0.4 + this.n.airAttack * 0.4;
    const r = this.n.retreat + this.n.shield * 0.3 + this.n.projectile * 0.3;
    this.aggression = a + r > 0.3 ? a / (a + r) : 0.5;
  }

  // ---- What the CPU makes of it (each 0-1, weighed by trust) ----------------

  // How often it jumps, as a habit worth covering from the ground.
  get jumpy() {
    return this.trust(this.n.jump) * Math.min(1, this.rate('jump') / 0.8);
  }

  // How readily its Shield goes up when it is threatened.
  get shieldy() {
    const t = this.n.threatened;
    const prior = 0.3;
    const seen = t > 0.5 ? Math.min(1, this.n.shieldedThreat / t) : prior;
    const w = this.trust(t);
    return prior * (1 - w) + seen * w;
  }

  // How much it relies on projectiles.
  get zoner() {
    return this.trust(this.n.projectile) * Math.min(1, this.rate('projectile') / 0.5);
  }

  // How aggressive it is (0.5: unknown or balanced).
  get aggressive() {
    const w = this.trust(this.n.approach + this.n.retreat + this.n.groundAttack);
    return 0.5 * (1 - w) + this.aggression * w;
  }

  // How often its attacks miss: reckless, punishable.
  get whiffy() {
    return this.trust(this.n.whiff) * Math.min(1, this.rate('whiff') / 0.5);
  }

  // How many attacks a second it starts within reach of the CPU: how likely
  // it is to be pressing a button of its own at any moment up close (a
  // prior of about one a second until seen).
  get pressure() {
    const t = this.n.closeTime;
    const prior = 1.2;
    const seen = t > 0.3 ? this.n.closeAttack / t : prior;
    const w = this.trust(t * 2);
    return prior * (1 - w) + seen * w;
  }

  // How often it Dashes.
  get dashy() {
    return this.trust(this.n.dash) * Math.min(1, this.rate('dash') / 0.5);
  }

  // The distance it tends to start attacks from (world units), or null.
  get preferredRange() {
    return this.attackDistW > 1.5 ? this.attackDist : null;
  }

  // How predictable its next attack is: the same move over and over.
  get predictableMove() {
    return this.repeat >= 2 ? this.lastMove : null;
  }

  // A short summary for the debug trace.
  summary() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      jumpy: r(this.jumpy), shieldy: r(this.shieldy), zoner: r(this.zoner), aggressive: r(this.aggressive),
      whiffy: r(this.whiffy), dashy: r(this.dashy), pressure: r(this.pressure), range: this.preferredRange && Math.round(this.preferredRange),
      repeats: this.predictableMove,
    };
  }
}
