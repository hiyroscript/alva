// CPU Intelligence, layer 11: debugging, telemetry and the liveness
// monitor.
//
// Purpose: explain and measure the CPU. Always on and cheap: counters for
// every move it starts (its usage), presses the fighter refused (invalid
// inputs: there should be none), plans that expired or failed, stuck
// navigation, inactivity incidents, recoveries, Shields and Deflects, and
// the plans it chose by kind. Off by default and lightweight when on
// (`debug`): a ring of decision traces, each built from the decision's own
// data (the mode, the plan and its reason, the target, the hit chance and
// value behind it, both Launch Points and the danger and finishing chances,
// the Energy policy, what interrupted the last plan, recent opponent
// habits), and the latest picture for an overlay or a console.
//
// The liveness monitor is the safety net behind Rule A: whenever the
// fighter is free to act in a live match and nothing has moved it, pressed
// a button or held the Shield for longer than a brief deliberate pause, it
// counts an inactivity incident and asks the brain for a fresh, purposeful
// plan. Stuck navigation (a plan that keeps moving toward a target without
// getting closer) is caught the same way.
//
// Inputs: the brain. Outputs: Telemetry.

const TRACE = 64;
// Longest a free fighter may stay still without a plan that means it.
export const STILL_LIMIT = 0.45;

export class Telemetry {
  constructor(debug = false) {
    this.debug = debug;
    this.counters = {
      invalidInputs: 0, expiredPlans: 0, failedPlans: 0, stuckNavigation: 0, inactivity: 0,
      shields: 0, deflects: 0, recoveries: 0, dashes: 0, airDashes: 0, jumps: 0, decisions: 0, combos: 0,
    };
    this.moveUsage = new Map();
    this.plans = new Map();
    this.fails = new Map();
    this.trace = [];
    this.latest = null;
    this.still = 0;
    this.pending = null;
  }

  // Everything back to zero (a new match).
  clear() {
    for (const k of Object.keys(this.counters)) this.counters[k] = 0;
    this.moveUsage.clear();
    this.plans.clear();
    this.fails.clear();
    this.trace.length = 0;
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
    if (!this.debug) return;
    const entry = {
      t: Math.round(brain.clock * 1000) / 1000,
      mode: brain.strategy.mode,
      plan: plan.kind,
      reason: plan.reason ?? plan.why ?? '',
      move: plan.cand?.move.id ?? plan.move?.id ?? null,
      hitChance: plan.cand ? Math.round(plan.cand.p * 100) / 100 : null,
      value: plan.cand ? Math.round(plan.cand.value * 10) / 10 : null,
      target: plan.targetX != null ? Math.round(plan.targetX) : null,
      myLP: s?.me.lp ?? null,
      foeLP: s?.present ? s.op.lp : null,
      danger: Math.round(brain.strategy.danger * 100) / 100,
      finish: Math.round(brain.strategy.finish * 100) / 100,
      energy: s ? Math.round(s.me.energy) : null,
      interrupted: brain.lastInterrupt ?? null,
      opponent: brain.opponent.summary(),
    };
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

  // A plain-language line for the latest decision.
  explain() {
    const e = this.latest;
    if (!e) return '';
    return `[${e.mode}] ${e.plan}${e.move ? ` ${e.move}` : ''}: ${e.reason}`;
  }

  // A snapshot of every counter, for tests and benchmarks.
  report() {
    return {
      ...this.counters,
      moveUsage: Object.fromEntries(this.moveUsage),
      plans: Object.fromEntries(this.plans),
      fails: Object.fromEntries(this.fails),
    };
  }
}
