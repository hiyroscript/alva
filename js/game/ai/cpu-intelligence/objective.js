// CPU Intelligence, layer 5a: the match objective.
//
// Purpose: what the CPU is trying to achieve in the match as a whole, above
// the fight of the moment (strategy.js): winning the exchange in front of it
// is not always what wins the match. One objective at a time, chosen from
// the score and the points each fighter still needs, the clock (regulation
// or overtime, and how much is left against how long a point has been
// taking), overtime's Launch Point tiebreak (both Launch Points recovering
// as the seconds run, js/data/launch.js) and its closing Void, both
// fighters' exposure where they stand (how likely the other's best launch
// is to end their life now and after another hit or two: Strategy.danger,
// dangerSoon, finish and finishSoon, from the real launch rules), and how
// long the fight has gone without an exchange:
//
//   build      even: build an advantage (take the stage, land hits)
//   finish     the opponent can be finished: look for the launch that ends
//              its life, keep it from recovering in peace
//   stabilize  the CPU is the exposed one and there is time: break off, let
//              its Launch Point recover somewhere safer, Shield what comes,
//              then come back
//   protect    ahead with the clock running down, or ahead on overtime's
//              tiebreak: no needless risk, counter when it is safe
//   survive    the same with seconds left: run the clock out
//   force      behind with too little time to wait, or losing overtime's
//              tiebreak: take the risks a comeback needs
//   regroup    the opponent is out of play (respawning): reposition,
//              recover, be ready for its return
//
// An objective persists: it has a minimum dwell (longer the more
// disciplined the level), the current one keeps a bonus, and only an
// important event (a point scored, a respawn, overtime starting, the
// opponent leaving or rejoining play, the clock entering its last stretch,
// a heavy hit taken) or a clearly better objective changes it sooner. It
// watches its own progress: a stabilize that keeps getting hit gives way to
// fighting back. Waiting has a price: the longer nothing happens the more
// impatient the CPU grows (sooner on a less patient level), unless waiting
// is itself winning (ahead with the clock running, its Launch Point coming
// back), so two cautious CPUs never wait on each other for ever.
//
// The objective informs the strategy (`bias`: the modes it favours, how
// much the bar for a commitment moves, how much risk counts, how well
// waiting suits it), never the moves. The level's `awareness` decides how
// fully the CPU reads the match, `discipline` how firmly it holds an
// objective, `patience` how long it is content to wait. A little seeded
// temperament (bolder or more patient this match) keeps two CPUs of one
// level from being the same player.
//
// Inputs: the situation (situation.js), the strategy's launch estimates,
// the brain (clock, RNG, profile, the time of the last exchange).
// Outputs: MatchObjective, OBJECTIVES.
// Important constraints: reads only what a player can see (the HUD's score,
// clock and Launch Points, the stage, the fighters); bounded work, a few
// times a second.

import {
  LAUNCH_RECOVERY_AMOUNT, LAUNCH_RECOVERY_DELAY, LAUNCH_RECOVERY_INTERVAL,
} from '../../../data/launch.js';

export const OBJECTIVES = Object.freeze(['build', 'finish', 'stabilize', 'protect', 'survive', 'force', 'regroup']);

// What each objective asks of the strategy: mode preferences, a shift of the
// bar a commitment must clear (`aggro`, as the modes' own), a factor on how
// much risk counts, how well a deliberate wait suits it (`wait`, 0-1), how
// selective it is about committing to an attack on a free opponent
// (`select`, a factor on the value of waiting for a clearer chance), and
// whether it breaks off to recover.
const BIAS = Object.freeze({
  build: Object.freeze({ modes: Object.freeze({ controlledOffense: 0.08, neutral: 0.05 }), aggro: 0, risk: 1, wait: 0.35, select: 1, retreat: false }),
  finish: Object.freeze({
    modes: Object.freeze({ finisherHunt: 0.45, trapControl: 0.15, rushdown: 0.1, survival: -0.25 }),
    aggro: 0.12, risk: 0.95, wait: 0.15, select: 0.75, retreat: false,
  }),
  stabilize: Object.freeze({
    modes: Object.freeze({ survival: 0.55, counterplay: 0.12, rushdown: -0.45, controlledOffense: -0.2, finisherHunt: -0.2 }),
    aggro: -0.35, risk: 1.4, wait: 0.95, select: 1.6, retreat: true,
  }),
  protect: Object.freeze({
    modes: Object.freeze({ counterplay: 0.3, zoning: 0.15, survival: 0.15, neutral: 0.1, rushdown: -0.4, finisherHunt: -0.15 }),
    aggro: -0.25, risk: 1.35, wait: 0.8, select: 1.6, retreat: false,
  }),
  survive: Object.freeze({
    modes: Object.freeze({ survival: 0.65, counterplay: 0.2, zoning: 0.1, rushdown: -0.7, finisherHunt: -0.4, controlledOffense: -0.3 }),
    aggro: -0.5, risk: 1.7, wait: 1, select: 2, retreat: false,
  }),
  force: Object.freeze({
    modes: Object.freeze({ rushdown: 0.55, finisherHunt: 0.3, controlledOffense: 0.15, survival: -0.6, counterplay: -0.3, zoning: -0.2 }),
    aggro: 0.35, risk: 0.75, wait: 0, select: 0.4, retreat: false,
  }),
  regroup: Object.freeze({ modes: Object.freeze({}), aggro: 0, risk: 1, wait: 1, select: 1, retreat: false }),
});

// Seconds a point takes before the match has shown its own pace.
const PACE_PRIOR = 45;
// Launch Point recovered per second once recovery is running.
const RECOVERY_RATE = LAUNCH_RECOVERY_AMOUNT / LAUNCH_RECOVERY_INTERVAL;

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

export class MatchObjective {
  constructor(profile) {
    this.profile = profile;
    this.scores = Object.fromEntries(OBJECTIVES.map((k) => [k, 0]));
    this.reset();
  }

  // A new match: nothing known, a fresh temperament from `rng`.
  reset(rng = null) {
    this.kind = 'build';
    this.reason = 'even: building an advantage';
    this.since = 0;
    // How many objectives it has taken up this match (a token for "this
    // time it asked").
    this.entries = 0;
    this.elapsed = 0;
    this.points = 0;
    this.last = null;
    this.impatience = 0;
    this.urgent = false;
    this.changed = false;
    this.failingUntil = -Infinity;
    this.hitsTaken = 0;
    this.lpAt = 0;
    this.tiebreak = 0;
    this.winningByWaiting = false;
    this.myExp = 0;
    this.foeExp = 0;
    this.bias = BIAS.build;
    this.strength = 0.35 + 0.65 * this.profile.awareness;
    // This match's temperament: a little bolder or warier, more or less
    // patient, within what the level allows.
    const draw = () => (rng ? rng() * 2 - 1 : 0);
    this.temper = { boldness: draw() * 0.08, patience: draw() * 0.15 };
    for (const k of OBJECTIVES) this.scores[k] = 0;
  }

  // Whether waiting suits the objective (0-1).
  get wait() {
    return this.bias.wait;
  }

  // How selective the objective makes it about committing on a free
  // opponent (a factor on the value of waiting), as fully as it reads the
  // match.
  get select() {
    return 1 + (this.bias.select - 1) * this.strength;
  }

  // The bar shift and risk factor the strategy applies, as fully as the
  // level reads the match (impatience lowers the bar whatever the
  // objective).
  get aggro() {
    return this.bias.aggro * this.strength + this.impatience * 0.4 + this.temper.boldness;
  }

  get risk() {
    return 1 + (this.bias.risk - 1) * this.strength;
  }

  // The bias the objective gives strategy mode `mode`.
  modeBias(mode) {
    return (this.bias.modes[mode] ?? 0) * this.strength;
  }

  // Seconds of patience before waiting turns to impatience, for this level
  // and temperament.
  get patienceSeconds() {
    return (3 + this.profile.patience * 8) * (1 + this.temper.patience);
  }

  // Re-weighs the objectives (see the header). `strategy` carries the launch
  // estimates, `dt` seconds since the last update, `idle` seconds since the
  // last exchange. Sets `changed` when the objective changed.
  update(s, strategy, brain, dt, idle) {
    const p = this.profile;
    this.since += dt;
    this.changed = false;
    const m = s.match;
    if (s.present) this.elapsed += dt;
    // Important events: a point, a respawn, overtime, the last stretch.
    const scored = m.mine + m.theirs;
    const late = m.timeLeft < 30;
    const final = m.timeLeft < 12;
    const now = { scored, present: s.present, overtime: m.overtime, late, final, lp: s.me.lp };
    const was = this.last;
    // The first look at the match is free to choose.
    let urgent = !was;
    if (was) {
      if (scored !== was.scored) {
        this.points += scored - was.scored;
        urgent = true;
      }
      if (now.present !== was.present || now.overtime !== was.overtime || now.late !== was.late || now.final !== was.final) urgent = true;
      if (s.me.lp >= was.lp + 8) urgent = true;
      if (this.kind === 'stabilize' && s.me.lp > was.lp + 0.5) this.hitsTaken++;
    }
    this.last = now;
    const sc = this.scores;
    if (!s.present) {
      for (const k of OBJECTIVES) sc[k] = -1;
      sc.regroup = 10;
      this.impatience = 0;
      this.choose('regroup', urgent, brain, 'opponent out of play: regrouping for its return');
      return this;
    }
    const aw = this.strength;
    const me = s.me;
    const op = s.op;
    // Each fighter's exposure: how likely the other's best launch is to end
    // its life now or after another hit or two, smoothed over about a second
    // (a step toward a ledge and back is no reason to change the plan).
    const k = 1 - Math.exp(-dt / 0.8);
    this.myExp += (Math.max(strategy.danger, 0.6 * strategy.dangerSoon) - this.myExp) * k;
    this.foeExp += (Math.max(strategy.finish, 0.6 * strategy.finishSoon) - this.foeExp) * k;
    const myExp = this.myExp;
    const foeExp = this.foeExp;
    // How long a point has been taking in this match.
    const pace = clamp((this.elapsed + PACE_PRIOR * 2) / (this.points + 2), 20, 90);
    const timeLeft = Number.isFinite(m.timeLeft) ? m.timeLeft : Infinity;
    const lead = m.lead;
    // Overtime level on points: the lower Launch Point when the clock runs
    // out, both recovering as it runs (1 by 0.5 s once 2 s pass unhit).
    let tiebreak = 0;
    if (m.overtime && lead === 0) {
      const back = Math.max(0, timeLeft - LAUNCH_RECOVERY_DELAY) * RECOVERY_RATE;
      const mine = Math.max(0, me.lp - back);
      const theirs = Math.max(0, op.lp - back);
      tiebreak = Math.abs(mine - theirs) < 1e-6 ? 0 : mine < theirs ? 1 : -1;
    }
    this.tiebreak = tiebreak;
    const otLeft = m.overtime ? clamp(1 - timeLeft / 60) : 0;
    // Waiting is winning when ahead with the clock running, or while the
    // Launch Point comes back down; otherwise it wears patience thin.
    const winningByWaiting = (lead > 0 && timeLeft < lead * pace * 2) || tiebreak > 0 ||
      (this.kind === 'stabilize' && me.lp > 0 && myExp > 0.15);
    this.winningByWaiting = winningByWaiting;
    const grace = this.patienceSeconds;
    this.impatience = winningByWaiting ? 0 : clamp((idle - grace) / (3 + 3 * p.patience));
    const failing = brain.clock < this.failingUntil;
    // The scores.
    sc.regroup = -10;
    sc.build = 0.45 + this.impatience * 0.4;
    sc.finish = foeExp * 1.4 - myExp * 0.3 + (op.offstage ? 0.3 : 0) + (m.mine >= m.toWin - 1 ? 0.08 : 0) + this.temper.boldness;
    // Breaking off pays only with the time to recover something (2 s
    // unhit, then 2 a second) and no comeback to make.
    const recoverable = clamp((Math.min(timeLeft, 60) - LAUNCH_RECOVERY_DELAY) / 20);
    sc.stabilize = ((myExp - foeExp * 0.6) * 1.5 + clamp((me.lp - op.lp) / 150, -0.2, 0.3)) * recoverable -
      this.impatience * 0.6 - (failing ? 0.6 : 0);
    // A break-off under way sees itself through until the Launch Point has
    // come well down (its staying power fades as it does).
    if (this.kind === 'stabilize' && this.lpAt > 0) sc.stabilize += 0.3 * clamp(me.lp / this.lpAt) * (failing ? 0 : 1);
    sc.protect = 0;
    sc.survive = 0;
    sc.force = 0;
    if (lead > 0) {
      sc.protect = clamp(1 - timeLeft / (lead * pace * 1.6)) * 1.4 * aw;
      if (timeLeft < 14) sc.survive = (0.4 + 1.2 * (1 - timeLeft / 14)) * aw;
    } else if (lead < 0) {
      sc.force = (clamp((-lead * pace) / Math.max(1, timeLeft)) * 1.3 + (m.theirs >= m.toWin - 1 ? 0.12 : 0)) * aw;
    } else if (m.overtime) {
      if (tiebreak > 0) {
        sc.protect = (0.55 + 0.4 * otLeft) * aw;
        if (timeLeft < 14) sc.survive = (0.4 + 1.2 * (1 - timeLeft / 14)) * aw;
      } else if (tiebreak < 0) sc.force = (0.5 + 0.7 * otLeft) * aw;
      else sc.force = (0.25 + 0.45 * otLeft) * aw;
    }
    // A stabilize that keeps getting hit gives way to fighting back.
    if (this.kind === 'stabilize' && this.hitsTaken >= 2 + Math.round(p.discipline * 2)) {
      this.failingUntil = brain.clock + 4;
      this.hitsTaken = 0;
      urgent = true;
      brain.telemetry.note(brain, 'stabilize broken', 'kept getting hit while recovering: fighting back');
    }
    let best = this.kind;
    const keep = 0.12 + p.discipline * 0.18;
    for (const k of OBJECTIVES) if (sc[k] + (k === this.kind ? keep : 0) > sc[best] + (best === this.kind ? keep : 0)) best = k;
    if (this.impatience >= 1 && this.since > 1 && (this.kind === 'stabilize' || this.kind === 'protect') && !winningByWaiting) {
      brain.telemetry.count('impatience');
    }
    this.choose(best, urgent, brain, () => this.explain(best, s, { myExp, foeExp, tiebreak, timeLeft }));
    return this;
  }

  // Takes `best` if it may change now: an urgent event, a clear gap, or the
  // current one's minimum dwell over.
  choose(best, urgent, brain, why) {
    if (best === this.kind) return;
    const p = this.profile;
    const sc = this.scores;
    const dwell = 1.2 + p.discipline * 2.3;
    const gap = sc[best] - sc[this.kind];
    if (!(urgent || gap > 0.6 || this.since >= dwell)) return;
    const from = this.kind;
    this.kind = best;
    this.reason = typeof why === 'function' ? why() : why;
    this.bias = BIAS[best];
    this.since = 0;
    this.changed = true;
    this.entries++;
    this.hitsTaken = 0;
    this.lpAt = brain.situation?.me?.lp ?? 0;
    brain.telemetry.count('objectiveChanges');
    brain.telemetry.note(brain, `objective ${from} → ${best}`, this.reason);
  }

  // Why objective `kind` fits, in words built from the numbers behind it.
  explain(kind, s, { myExp, foeExp, tiebreak, timeLeft }) {
    const m = s.match;
    const lp = `Launch Point ${Math.round(s.me.lp)} to ${Math.round(s.op.lp)}`;
    const clock = Number.isFinite(timeLeft) ? `${Math.round(timeLeft)} s left${m.overtime ? ' in overtime' : ''}` : 'no clock';
    switch (kind) {
      case 'finish': return `opponent exposed (${Math.round(foeExp * 100)}% a launch ends its life): hunting the finish; ${lp}`;
      case 'stabilize': return `own Launch Point dangerous here (${Math.round(myExp * 100)}%), the opponent's ${Math.round(foeExp * 100)}%: breaking off to recover; ${lp}, ${clock}`;
      case 'protect': return m.lead > 0 ? `ahead ${m.mine}-${m.theirs} with ${clock}: protecting the lead` : `ahead on the tiebreak (${lp}), ${clock}: protecting it`;
      case 'survive': return `ahead with ${clock}: running out the clock`;
      case 'force': return m.lead < 0 ? `behind ${m.mine}-${m.theirs} with ${clock}: forcing the fight` :
        tiebreak < 0 ? `losing the tiebreak (${lp}), ${clock}: forcing the fight` : `level in overtime, ${clock}: looking for the deciding hit`;
      case 'build': return this.impatience > 0.3 ? `nothing happening for a while: taking the initiative; ${lp}` : `even: building an advantage; ${lp}`;
      default: return 'regrouping';
    }
  }
}
