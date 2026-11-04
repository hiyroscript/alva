// How long each online match waits between sampling a player's input and
// playing it (its input delay, in steps), chosen for that match from how
// long a packet takes between the two players, so nearby players get the
// shortest delay and far ones a longer one with no pauses.
//
// The match goes through a TURN relay (js/online/match-link.js), and a
// frame for step n must reach the other browser before step n runs there:
// it is sampled D steps earlier and sent at once, then takes its one-way
// trip. So D is the smallest number of steps that covers the trip and a
// margin for its ups and downs (CONFIG.online.delayMarginMs), within
// CONFIG.online.inputDelayRange. The trip is measured in the room before
// the match: while the link is open, each player's DelayProbe bounces pings
// off the other one (a ping, answered at once by a pong) and keeps the
// round trips. The host's browser chooses D from its own and puts it in the
// match's start (both browsers must use the same D, or their steps would
// not match); with too few round trips measured, D is CONFIG.online.
// inputDelay.
//
// The pings are packets on the match's link like any other ({ t: 'ping' }
// and { t: 'pong' }: the lockstep ignores them): five a second for the
// first two or three seconds, then one every few seconds.

import { CONFIG } from '../config.js';

// Round trips kept (the most recent), and how many are needed to choose.
export const SAMPLES_KEPT = 12;
export const SAMPLES_NEEDED = 4;
// Of the round trips kept, the one at this share of the way up (most of
// the ups and downs covered, a single stray one ignored).
const PERCENTILE = 0.8;

// The delay `d` if it is one a match may use, else null.
export function validDelay(d, range = CONFIG.online.inputDelayRange) {
  return Number.isInteger(d) && d >= range.min && d <= range.max ? d : null;
}

// The input delay, in steps, for round trips `samples` (milliseconds):
// see the top (`sendIntervalMs`: how long a frame may wait to be sent, none
// as the game sends every frame at once). `fallback` when too few were
// measured.
export function chooseDelay(samples, {
  sendIntervalMs = 0, marginMs = CONFIG.online.delayMarginMs,
  stepMs = CONFIG.sim.step * 1000, range = CONFIG.online.inputDelayRange, fallback = CONFIG.online.inputDelay,
} = {}) {
  const rtts = (samples ?? []).filter((r) => Number.isFinite(r) && r >= 0).sort((a, b) => a - b);
  if (rtts.length < SAMPLES_NEEDED) return fallback;
  const rtt = rtts[Math.min(rtts.length - 1, Math.ceil(rtts.length * PERCENTILE) - 1)];
  const steps = Math.ceil((sendIntervalMs + rtt / 2 + marginMs) / stepMs);
  return Math.min(range.max, Math.max(range.min, steps));
}

// One player's pings over the match's `transport`: answers the other
// player's at once, and (for `measuring`, the host) sends its own and keeps
// the round trips (`samples`). Every CONFIG.online.pingIntervalMs until
// SAMPLES_KEPT are in, then every CONFIG.online.pingRefreshMs. `samples`:
// round trips to start from (a link made again to the same player: the
// next match need not wait for new ones), pinged for at the quick rate
// until SAMPLES_NEEDED of its own are in. `now()`: milliseconds. stop()
// ends it.
export class DelayProbe {
  constructor({
    transport, measuring = false, now = () => globalThis.performance?.now?.() ?? Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
    intervalMs = CONFIG.online.pingIntervalMs, refreshMs = CONFIG.online.pingRefreshMs, samples = [],
  }) {
    this.transport = transport;
    this.measuring = !!measuring;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.intervalMs = intervalMs;
    this.refreshMs = refreshMs;
    this.samples = (Array.isArray(samples) ? samples : []).filter((r) => Number.isFinite(r) && r >= 0).slice(-SAMPLES_KEPT);
    // Round trips this probe measured itself.
    this.measured = 0;
    this.sent = new Map();
    this.nextId = 1;
    this.timer = null;
    this.stopped = false;
    this.unsubscribe = transport.onMessage((m) => this.receive(m));
    if (this.measuring) this.ping();
  }

  // One ping now, and the next one scheduled.
  ping() {
    if (this.stopped) return;
    this.clearTimer(this.timer);
    const id = this.nextId++;
    this.sent.set(id, this.now());
    // Pings never answered are forgotten.
    if (this.sent.size > SAMPLES_KEPT) this.sent.delete(this.sent.keys().next().value);
    this.transport.send({ t: 'ping', id });
    const enough = this.samples.length >= SAMPLES_KEPT && this.measured >= SAMPLES_NEEDED;
    const wait = enough ? this.refreshMs : this.intervalMs;
    this.timer = this.setTimer(() => this.ping(), wait);
    this.timer?.unref?.();
  }

  receive(m) {
    if (this.stopped || !m || typeof m !== 'object') return;
    if (m.t === 'ping' && Number.isInteger(m.id)) {
      this.transport.send({ t: 'pong', id: m.id });
    } else if (m.t === 'pong' && this.sent.has(m.id)) {
      const rtt = this.now() - this.sent.get(m.id);
      this.sent.delete(m.id);
      this.samples.push(rtt);
      this.measured += 1;
      if (this.samples.length > SAMPLES_KEPT) this.samples.shift();
    }
  }

  // The delay for a match now (see chooseDelay).
  delay(options) {
    return chooseDelay(this.samples, options);
  }

  stop() {
    this.stopped = true;
    this.clearTimer(this.timer);
    this.timer = null;
    this.unsubscribe?.();
  }
}
