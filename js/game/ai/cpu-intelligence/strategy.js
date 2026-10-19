// CPU Intelligence, layer 5: strategic decision-making (how to fight the
// exchange in front of it, under the match objective: objective.js).
//
// Purpose: the way the CPU fights now, continuously re-weighed from the
// fight itself: both fighters' Launch Points (how close each is to being
// finished by the other's best launch from where they stand, now and after
// another hit or two, judged by the real launch rules), their footing and
// distance from the Void, Energy, what each fighter's kit is good at (from
// its capabilities: zoning tools, traps, finishers), what the opponent model
// has seen, and what the match objective asks (it carries the score, the
// clock and overtime). The modes are universal, never a fighter's
// personality:
//
//   rushdown           high pressure, fast approaches, close conversions
//   controlledOffense  pressure that keeps good spacing and an escape
//   neutral            approach, defend and punish in turn
//   counterplay        invite a commitment and punish it
//   zoning             control space with projectiles and long reach
//   trapControl        restrict escapes (a ledge, a lingering hit)
//   survival           cut elimination risk while staying useful: break
//                      off, recover, Shield, counter what is safe
//   finisherHunt       look for the launch that ends a life
//   recovery           get back to the stage
//
// Each mode is a utility; the current one keeps a bonus and a minimum
// dwell (hysteresis), so the CPU changes its mind deliberately rather than
// every step. A mode sets what the tactical layer prefers (how much a hit
// must be worth before it commits, how much risk counts, which roles it
// favours and what spacing it keeps), never what it can do; the match
// objective shifts the same knobs (`params` is the two composed). The
// opponent model adds role preferences of its own (`adaptive`: anti-airs
// against a jumper, Shield pressure against a wall, counter-projectiles and
// approaches against a zoner, punishes against a whiffer), as fast and as
// far as the level adapts.
//
// Inputs: the situation, the opponent model, the launch judge, the match
// objective. Outputs: Strategy (mode, params, adaptive, the launch
// estimates: danger, dangerSoon, finish, finishSoon; dangerAt).

const MODES = ['rushdown', 'controlledOffense', 'neutral', 'counterplay', 'zoning', 'trapControl', 'survival', 'finisherHunt', 'recovery'];

// What each mode asks of the tactical layer: `aggro` lowers the bar for a
// commitment, `risk` scales how much a bad outcome counts, `spacing`
// chooses the neutral distance, `roles` favours moves by role.
const PARAMS = Object.freeze({
  rushdown: { aggro: 0.55, risk: 0.8, spacing: 'close', roles: { poke: 0.25, approach: 0.3, comboStarter: 0.25 } },
  controlledOffense: { aggro: 0.35, risk: 1, spacing: 'edge', roles: { poke: 0.2, punish: 0.15, launcher: 0.1 } },
  neutral: { aggro: 0.2, risk: 1.05, spacing: 'outside', roles: { punish: 0.2 } },
  counterplay: { aggro: 0.05, risk: 1.2, spacing: 'bait', roles: { punish: 0.35, antiAir: 0.25 } },
  zoning: { aggro: 0.2, risk: 1.1, spacing: 'far', roles: { zoning: 0.4, trap: 0.25, counterProjectile: 0.15 } },
  trapControl: { aggro: 0.3, risk: 1, spacing: 'edge', roles: { trap: 0.35, areaDenial: 0.3, antiAir: 0.2, launcher: 0.1 } },
  survival: { aggro: -0.1, risk: 1.7, spacing: 'far', roles: { poke: 0.1, zoning: 0.2, defensiveDisengage: 0.2 } },
  finisherHunt: { aggro: 0.45, risk: 0.9, spacing: 'edge', roles: { finisher: 0.6, launcher: 0.35, edgeGuard: 0.4 } },
  recovery: { aggro: -0.5, risk: 2, spacing: 'far', roles: { recovery: 1 } },
});

// The Launch Point another hit or two would add: what "soon" means for the
// launch estimates.
const SOON = 8;

export class Strategy {
  constructor(profile) {
    this.profile = profile;
    this.params = { aggro: 0, risk: 1, spacing: 'outside', roles: PARAMS.neutral.roles };
    this.adaptive = { antiAir: 0, shieldPressure: 0, counterProjectile: 0, punish: 0, approach: 0, zoning: 0 };
    this.reset();
  }

  reset() {
    this.mode = 'neutral';
    this.since = 0;
    this.scores = Object.fromEntries(MODES.map((m) => [m, 0]));
    this.danger = 0;
    this.dangerSoon = 0;
    this.finish = 0;
    this.finishSoon = 0;
    this.age = Infinity;
    for (const k of Object.keys(this.adaptive)) this.adaptive[k] = 0;
    this.compose(null);
  }

  // How likely the best launch available to `attackerCaps` is to end the
  // target's life (0-1), as `judge` reckons it at the target's Launch Point
  // plus `extra`: the CPU's own danger ('me') or its finishing chances
  // ('foe'), where the target stands or at `at` ({ x, y, grounded }), struck
  // from the attacker's side.
  koThreat(s, judge, attackerCaps, target, extra = 0, at = null) {
    const who = target === 'foe' ? s.op : s.me;
    const from = target === 'foe' ? s.me : s.op;
    const pos = at
      ? { x: at.x, y: at.y, grounded: at.grounded ?? true, halfW: who.halfW, height: who.height }
      : { x: who.x, y: who.y, grounded: who.grounded, halfW: who.halfW, height: who.height };
    // A launch sends its target away from whoever strikes it.
    const face = Math.sign(pos.x - from.x) || (target === 'foe' ? 1 : -1);
    let best = 0;
    for (const m of attackerCaps.moves) {
      let lp = who.lp + extra;
      const list = m.projectile ? m.projectile.strikes : m.strikes;
      for (const st of list) {
        lp += st.damage;
        if (!st.dir || !(st.baseLaunch > 0)) continue;
        const l = judge.launch(s, target, pos, lp, st, face);
        // A quick move is a more credible threat than a long cast.
        const credible = 1 / (1 + Math.max(0, m.lead - 0.15) * 1.5);
        if (l.ko * credible > best) best = l.ko * credible;
      }
    }
    return best;
  }

  // The CPU's own danger were it standing at (x, y) on the ground, struck
  // from where the opponent is: how a spot it might move to compares.
  dangerAt(s, judge, x, y, extra = 0) {
    return this.koThreat(s, judge, s.foeCaps, 'me', extra, { x, y, grounded: true });
  }

  // `dt` seconds on (a reassessment's).
  tick(dt) {
    this.since += dt;
    this.age += dt;
  }

  // The launch estimates (see the header): the heavy part, a few times a
  // second is plenty.
  estimate(s, judge) {
    if (!s.present) return this;
    if (this.age < 0.2) return this;
    this.age = 0;
    this.danger = this.koThreat(s, judge, s.foeCaps, 'me');
    this.finish = this.koThreat(s, judge, s.caps, 'foe');
    this.dangerSoon = Math.max(this.danger, this.koThreat(s, judge, s.foeCaps, 'me', SOON));
    this.finishSoon = Math.max(this.finish, this.koThreat(s, judge, s.caps, 'foe', SOON));
    return this;
  }

  // Re-weighs the modes for the situation `s` (see the header), under
  // `objective` (a MatchObjective, or null).
  update(s, model, judge, objective = null) {
    const p = this.profile;
    if (!s.present) {
      this.switchTo(s.me.offstage ? 'recovery' : 'neutral', objective);
      this.compose(objective);
      return this;
    }
    this.estimate(s, judge);
    const d = this.danger;
    const f = this.finish;
    const caps = s.caps;
    const zoningTools = caps.roles.get('zoning').length;
    const trapTools = caps.roles.get('trap').length + caps.roles.get('areaDenial').length;
    const sc = this.scores;
    const energyLow = s.me.exhausted ? 1 : Math.max(0, (35 - s.me.energy) / 35);
    const foeTired = s.op.exhausted ? 1 : Math.max(0, (30 - s.op.energy) / 30) * 0.5;
    const cornered = Math.max(0, 1 - s.myEdge / 260);
    const foeCornered = Math.max(0, 1 - s.foeEdge / 260);
    sc.recovery = s.me.offstage ? 10 : -10;
    sc.finisherHunt = f * 1.5 * p.opportunity + (s.op.offstage ? 0.7 * p.stageSense : 0) - d * 0.3;
    sc.survival = d * 1.4 * p.riskSense - f * 0.4 + energyLow * 0.35 * p.energySense + cornered * d * 0.4;
    sc.rushdown = p.initiative * 0.55 + foeTired * 0.6 + foeCornered * 0.2 - d * 0.7 - energyLow * 0.2 +
      (model.shieldy < 0.25 ? 0.1 : 0);
    sc.controlledOffense = 0.5 + p.initiative * 0.25 - d * 0.25 + foeCornered * 0.15;
    sc.neutral = 0.52;
    sc.counterplay = (model.aggressive - 0.4) * 1.2 * p.adapt + model.whiffy * 0.6 * p.adapt + model.dashy * 0.2 * p.adapt + d * 0.25 + 0.2;
    sc.zoning = zoningTools ? 0.25 + (model.aggressive < 0.45 ? 0.15 : 0) + (s.dist > 280 ? 0.15 : 0) - model.zoner * 0.2 * p.adapt +
      energyLow * 0.15 : -1;
    sc.trapControl = trapTools ? 0.2 + foeCornered * 0.45 * p.stageSense + model.shieldy * 0.25 * p.adapt + model.walls * 0.2 * p.adapt : -1;
    if (objective) for (const mode of MODES) if (mode !== 'recovery') sc[mode] += objective.modeBias(mode);
    // Hysteresis: the current mode keeps a bonus, and a new one must beat
    // it by a margin after a minimum dwell.
    sc[this.mode] += 0.15;
    let best = this.mode;
    for (const mode of MODES) if (sc[mode] > sc[best]) best = mode;
    if (best !== this.mode) {
      const urgent = best === 'recovery' || this.mode === 'recovery' || sc[best] - sc[this.mode] > 0.45 || objective?.changed;
      if (urgent || this.since > 0.9) this.switchTo(best, objective);
    }
    // What the opponent's habits make worth reaching for.
    const a = this.adaptive;
    a.antiAir = model.jumpy * 0.5 * p.adapt;
    a.shieldPressure = model.walls * 0.4 * p.adapt;
    a.counterProjectile = model.zoner * 0.4 * p.adapt;
    a.approach = model.zoner * 0.25 * p.adapt;
    a.punish = model.whiffy * 0.3 * p.adapt;
    a.zoning = model.walls * 0.2 * p.adapt;
    this.compose(objective);
    return this;
  }

  switchTo(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.since = 0;
  }

  // The mode's parameters shifted by the objective (one object, reused).
  compose(objective) {
    const base = PARAMS[this.mode];
    const out = this.params;
    out.aggro = base.aggro + (objective ? objective.aggro : 0);
    out.risk = base.risk * (objective ? objective.risk : 1);
    out.spacing = base.spacing;
    out.roles = base.roles;
    return out;
  }
}

export { MODES };
