// CPU Intelligence, layer 11: debugging, telemetry and the liveness
// monitor.
//
// Purpose: explain and measure the CPU. Always on and cheap: counters for
// every move it starts (its usage), presses the fighter refused (invalid
// inputs: there should be none), plans that expired, failed or were
// abandoned, stuck navigation and other navigation failures, inactivity
// incidents (by cause), recoveries, Shields and Deflects, the plans it chose
// by kind, its deliberate waits (how long, why, and what ended each),
// retreats and how they turned out, the Launch Point it recovered while
// keeping out of the fight, how long it pursued each match objective and
// how often it changed, threats that interrupted a plan, and the openings
// and finishing chances it recognized. Off by default and lightweight when
// on (`debug`): a ring of decision traces, each built from the decision's
// own data (the match objective and why, the mode, the plan and its reason,
// the target, the hit chance and value behind it, both Launch Points and the
// danger and finishing chances, the Energy policy, what interrupted the last
// plan, recent opponent habits), a second ring of the notable events between
// them (`events`: a wait that ended and why, a retreat that held or broke,
// an objective that changed), and the latest picture for an overlay or a
// console.
//
// The liveness monitor (CpuIntelligence.liveness) tells two kinds of
// stillness apart. Standing still because its plan means it (a hold: it
// knows why it waits, what it protects and what would end the wait) is
// intentional: counted as waiting, never as an incident, though a wait that
// runs past WAIT_LIMIT without a break makes the brain reassess. Standing
// still with no plan that means it (no plan at all, a plan that should be
// moving but is not, a walk the ledge guard keeps holding back) is an
// inactivity incident after STILL_LIMIT, and the brain takes a fresh plan
// at once. Stuck navigation (a plan that keeps moving toward a target
// without getting closer) is caught the same way.
//
// Inputs: the brain. Outputs: Telemetry, STILL_LIMIT, WAIT_LIMIT.

const TRACE = 64;
// Longest a free fighter may stay still without a plan that means it.
export const STILL_LIMIT = 0.45;
// Longest a deliberate wait runs on unbroken before the brain reassesses
// whether waiting still serves it (it may well choose to wait on).
export const WAIT_LIMIT = 10;

const round = (v, k = 100) => Math.round(v * k) / k;

export class Telemetry {
  constructor(debug = false) {
    this.debug = debug;
    this.counters = {
      invalidInputs: 0, expiredPlans: 0, failedPlans: 0, abandonedPlans: 0, stuckNavigation: 0, navigationFailures: 0,
      inactivity: 0, shields: 0, deflects: 0, recoveries: 0, dashes: 0, airDashes: 0, jumps: 0, decisions: 0, combos: 0,
      waits: 0, waitSeconds: 0, longWaits: 0, impatience: 0, retreats: 0, retreatsHeld: 0, retreatsBroken: 0, lpRecovered: 0,
      disengageDashes: 0, pressureResets: 0, objectiveChanges: 0, threatInterrupts: 0, punishChances: 0, finishChances: 0, footingEscapes: 0,
    };
    this.moveUsage = new Map();
    this.plans = new Map();
    this.fails = new Map();
    this.waitReasons = new Map();
    this.waitEnds = new Map();
    this.objectiveTime = new Map();
    this.inactivityCauses = new Map();
    this.trace = [];
    this.events = [];
    this.latest = null;
    this.still = 0;
    this.pending = null;
  }

  // Everything back to zero (a new match).
  clear() {
    for (const k of Object.keys(this.counters)) this.counters[k] = 0;
    for (const m of [this.moveUsage, this.plans, this.fails, this.waitReasons, this.waitEnds, this.objectiveTime, this.inactivityCauses]) m.clear();
    this.trace.length = 0;
    this.events.length = 0;
    this.latest = null;
    this.still = 0;
    this.pending = null;
  }

  count(name, n = 1) {
    this.counters[name] = (this.counters[name] ?? 0) + n;
  }

  // A plan chosen (its kind counted; traced when debugging).
  planned(plan, brain, s) {
    this.plans.set(plan.kind, (this.plans.get(plan.kind) ?? 0) + 1);
    this.count('decisions');
    if (plan.intent === 'wait') this.count('waits');
    if (!this.debug) return;
    const o = brain.objective;
    const entry = {
      t: round(brain.clock, 1000),
      objective: o?.kind ?? null,
      objectiveWhy: o?.reason ?? null,
      mode: brain.strategy.mode,
      plan: plan.kind,
      reason: plan.reason ?? plan.why ?? '',
      intent: plan.intent ?? 'act',
      move: plan.cand?.move.id ?? plan.move?.id ?? null,
      hitChance: plan.cand ? round(plan.cand.p) : null,
      value: plan.cand ? round(plan.cand.value, 10) : null,
      target: plan.targetX != null ? Math.round(plan.targetX) : plan.holdX != null ? Math.round(plan.holdX) : null,
      myLP: s?.me.lp ?? null,
      foeLP: s?.present ? s.op.lp : null,
      danger: round(brain.strategy.danger),
      finish: round(brain.strategy.finish),
      energy: s ? Math.round(s.me.energy) : null,
      interrupted: brain.lastInterrupt ?? null,
      opponent: brain.opponent.summary(),
    };
    this.push(entry);
  }

  // A notable event between decisions (debug only), in its own ring: a
  // wait that ended and why, a retreat that held or broke, an objective
  // that changed.
  note(brain, event, detail = '') {
    if (!this.debug) return;
    this.events.push({ t: round(brain.clock, 1000), event, reason: detail, objective: brain.objective?.kind ?? null, mode: brain.strategy.mode });
    if (this.events.length > TRACE) this.events.shift();
  }

  push(entry) {
    this.trace.push(entry);
    if (this.trace.length > TRACE) this.trace.shift();
    this.latest = entry;
  }

  // A plan that could not be carried out, by kind.
  failed(kind) {
    this.count('failedPlans');
    this.fails.set(kind, (this.fails.get(kind) ?? 0) + 1);
  }

  // A move the fighter really started (counted by its move key).
  used(key) {
    this.moveUsage.set(key, (this.moveUsage.get(key) ?? 0) + 1);
  }

  // `dt` seconds of deliberate stillness, waiting for `reason`.
  waited(reason, dt) {
    this.counters.waitSeconds += dt;
    this.waitReasons.set(reason, (this.waitReasons.get(reason) ?? 0) + dt);
  }

  // A deliberate wait over, and why.
  waitEnded(brain, why) {
    this.waitEnds.set(why, (this.waitEnds.get(why) ?? 0) + 1);
    this.note(brain, 'wait ended', why);
  }

  // `dt` seconds pursuing match objective `kind`.
  spent(kind, dt) {
    this.objectiveTime.set(kind, (this.objectiveTime.get(kind) ?? 0) + dt);
  }

  // An inactivity incident, by its cause.
  inactive(cause) {
    this.count('inactivity');
    this.inactivityCauses.set(cause, (this.inactivityCauses.get(cause) ?? 0) + 1);
  }

  // A plain-language line for the latest decision.
  explain() {
    const e = this.latest;
    if (!e) return '';
    const head = e.objective ? `${e.objective} · ${e.mode}` : e.mode;
    return `[${head}] ${e.plan}${e.move ? ` ${e.move}` : ''}: ${e.reason}`;
  }

  // A snapshot of every counter, for tests and benchmarks.
  report() {
    const seconds = (m) => Object.fromEntries([...m].map(([k, v]) => [k, round(v, 10)]));
    return {
      ...this.counters,
      waitSeconds: round(this.counters.waitSeconds, 10),
      lpRecovered: round(this.counters.lpRecovered, 10),
      moveUsage: Object.fromEntries(this.moveUsage),
      plans: Object.fromEntries(this.plans),
      fails: Object.fromEntries(this.fails),
      waitReasons: seconds(this.waitReasons),
      waitEnds: Object.fromEntries(this.waitEnds),
      objectiveTime: seconds(this.objectiveTime),
      inactivityCauses: Object.fromEntries(this.inactivityCauses),
    };
  }
}
