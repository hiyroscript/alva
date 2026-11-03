// Online Play's netcode, version 1: delay-based lockstep. Both browsers run
// the same Battle (js/game/battle.js, mode 'online') from the same seed, and
// step it only when they know both players' inputs for that step, so the two
// simulations stay identical without ever sending the world itself.
//
// What it owns, and in what order things happen each animation frame
// (advance, called by Arena.frame in place of its own accumulator loop):
//
//   1. The simulation clock is fed with the frame's time, slowed as ever by
//      a lethal launch's slow motion (the Arena passes dt × fx.timeScale).
//      Slow motion may change how fast steps are fed, never what a step
//      does: a step still runs only with both inputs known, whatever the
//      clock says.
//   2. For each whole step due (at most CONFIG.sim.maxStepsPerFrame a
//      frame, as offline): the local player's input is sampled once for
//      step n + D (D = CONFIG.online.inputDelay), from their usual devices
//      (the keyboard, touch or any controller, through InputManager.sample
//      exactly as offline), for their fighter as it is now. Then, if the
//      other player's input for step n has arrived, step n runs; if not,
//      the match waits (nothing runs, nothing is banked) and says so after a
//      moment ("Waiting for opponent…"), ending it after
//      CONFIG.online.disconnectGraceMs ("Connection lost").
//   3. One packet goes to the other browser (at most every
//      `sendIntervalMs`: CONFIG.online.sendIntervalMs online, as the match
//      goes through the room server): every local frame it has not
//      acknowledged yet (up to CONFIG.online.resendWindow, oldest first)
//      and the latest step this browser holds the other's frames through.
//      A lost packet costs nothing: the next one carries the same frames.
//
// Steps 0 to D - 1 play neutral frames on both sides, so the first real
// input lands on step D. If one browser runs ahead it simply waits for the
// other; if it falls behind (the other's frames reach two steps past what it
// needs) it runs one extra step a frame until it has caught up.
//
// Each fighter is still a PlayerController (js/game/fighters/fighter-
// controller.js): it samples a LockstepChannel, which hands it the decoded
// frame of the step being run, so no fighter code knows it is online. A
// flush (a respawn, the fight starting, a restart) is a rule of the match on
// both browsers at the same step: it drops the presses of the frames
// already sampled for that player (the steps up to n + D), as offline it
// drops the presses already made, and the local devices' buffered presses
// too.
//
// Every CONFIG.online.hashInterval steps each side hashes the match
// (js/online/state-hash.js) and sends the hash; a difference ends the match
// as a desync ("Connection problem (desync)"), logging both states with
// `debug`. 'leave' ends it on the other side ("Your opponent left.").
//
// Rollback netcode would replace step 2's wait with a prediction and a
// rewind: it needs Battle to snapshot and restore its whole state, which it
// cannot yet (docs/gameplay/online-play.md).

import { CONFIG } from '../config.js';
import { HELD_MASK, blankFrame, decodeFrame, encodeFrame, isFrame } from './input-frame.js';
import { battleState, hashState } from './state-hash.js';
import { listeners } from './transport.js';

export const SLOTS = Object.freeze(['p1', 'p2']);
export const otherSlot = (slot) => (slot === 'p1' ? 'p2' : 'p1');

// A stall shorter than this shows nothing (a frame or two late is normal).
export const WAITING_NOTICE_MS = 300;
// With nothing new to send, a packet still goes this often, so the other
// side knows this one is there.
const HEARTBEAT_MS = 100;
// How many hashes are kept for comparison.
const HASHES_KEPT = 8;
// How many times 'leave' is sent (the link is not reliable).
const LEAVE_COPIES = 3;

const wallClock = () => globalThis.performance?.now?.() ?? Date.now();

// One player's input as their fighter's PlayerController reads it: the
// frame of the step being run (see LockstepSession.frameFor).
export class LockstepChannel {
  constructor(session, slot) {
    this.session = session;
    this.slot = slot;
    this.frame = blankFrame();
  }

  sample() {
    return this.session.frameFor(this.slot, this.frame);
  }

  flush() {
    this.session.flushSlot(this.slot);
  }
}

// What an online Battle takes as its `input`: each player's channel
// (player(slot), as Local Play's InputManager gives), and a flush of both.
export class OnlineInput {
  constructor(session) {
    this.session = session;
    this.channels = { p1: new LockstepChannel(session, 'p1'), p2: new LockstepChannel(session, 'p2') };
    this.neutral = blankFrame();
  }

  player(slot) {
    return this.channels[slot] ?? null;
  }

  flush() {
    for (const channel of Object.values(this.channels)) channel.flush();
  }

  // Nobody plays from this: each fighter samples its own channel.
  sample() {
    return this.neutral;
  }
}

export class LockstepSession {
  // `transport`: the link to the other browser (js/online/transport.js).
  // `localSlot`: this browser's player ('p1' for the room's host, 'p2' for
  // its guest). `match`: this match's number in the room, so a packet of
  // another match is never read. `sampleLocal(context)`: the local
  // player's input snapshot for their fighter as it is (InputManager.
  // sample); `flushLocal()`: drops the local devices' buffered presses.
  // `clock()`: milliseconds, for the waits and the send interval only
  // (never for a step). `sendIntervalMs`: the least time between two
  // input packets (0: one every frame).
  constructor({
    transport, localSlot = 'p1', match = 1, sampleLocal = () => null, flushLocal = () => {}, clock = wallClock,
    delay = CONFIG.online.inputDelay, hashInterval = CONFIG.online.hashInterval, resendWindow = CONFIG.online.resendWindow,
    sendIntervalMs = 0,
    graceMs = CONFIG.online.disconnectGraceMs, loadTimeoutMs = CONFIG.online.loadTimeoutMs,
    maxStepsPerFrame = CONFIG.sim.maxStepsPerFrame, step = CONFIG.sim.step, debug = false,
  }) {
    this.transport = transport;
    this.localSlot = localSlot === 'p2' ? 'p2' : 'p1';
    this.remoteSlot = otherSlot(this.localSlot);
    this.match = match;
    this.sampleLocal = sampleLocal;
    this.flushLocal = flushLocal;
    this.clock = clock;
    this.delay = Math.max(0, Math.round(delay));
    this.hashInterval = Math.max(1, Math.round(hashInterval));
    this.resendWindow = Math.max(1, Math.round(resendWindow));
    this.sendIntervalMs = Math.max(0, Number(sendIntervalMs) || 0);
    this.graceMs = graceMs;
    this.loadTimeoutMs = loadTimeoutMs;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.stepSeconds = step;
    this.debug = debug;
    this.battle = null;
    this.input = new OnlineInput(this);

    // Each player's frames by step; the first D are neutral on both sides.
    this.frames = { p1: new Map(), p2: new Map() };
    for (let s = 0; s < this.delay; s++) {
      this.frames.p1.set(s, 0);
      this.frames.p2.set(s, 0);
    }
    // The next step to run, and the one running (or last run).
    this.next = 0;
    this.current = -1;
    // The next local step to sample; the last local frame the other side
    // acknowledged; the last step this side holds the other's frames
    // through, and the last it acknowledged.
    this.localNext = this.delay;
    this.peerHas = this.delay - 1;
    this.remoteHave = this.delay - 1;
    this.ackSent = null;
    this.lastSent = -Infinity;
    // Each player's last step whose presses a flush dropped.
    this.flushedThrough = { p1: -1, p2: -1 };
    this.acc = 0;
    this.alpha = 0;
    // While the local player is in a menu (the match menu, the Match
    // Results), their frames are neutral: the world runs on, they play
    // nothing.
    this.muted = false;
    this.localHashes = new Map();
    this.remoteHashes = new Map();
    // 'running' until the match ends here: 'left' (the other side left),
    // 'quit' (this side left), 'timeout', 'desync' or 'closed'.
    this.status = 'running';
    this.endReason = null;
    this.heard = false;
    this.peerGone = false;
    this.waitingSince = null;
    this.waiting = false;
    this.events = listeners();
    this.unsubs = [
      transport.onMessage((m) => this.receive(m)),
      transport.onClose(() => this.peerClosed()),
    ];
  }

  // fn(type, detail) for 'waiting', 'resumed', 'peerClosed' and 'end'
  // ({ reason, step, state }). Returns the removal.
  on(fn) {
    return this.events.on(fn);
  }

  get running() {
    return this.status === 'running';
  }

  // Drives `battle` from now on: it steps only through advance().
  attach(battle) {
    this.battle = battle;
    battle.stepper = this;
    return this;
  }

  // ---- The frames ------------------------------------------------------------------

  // `slot`'s input for the step being run, into `out`: its frame, less its
  // presses if a flush dropped them.
  frameFor(slot, out) {
    let bits = this.frames[slot]?.get(this.current) ?? 0;
    if (this.current <= this.flushedThrough[slot]) bits &= HELD_MASK;
    return decodeFrame(bits, out);
  }

  // A flush of `slot` at the step being run (see the top).
  flushSlot(slot) {
    if (!this.flushedThrough || !Object.hasOwn(this.flushedThrough, slot)) return;
    this.flushedThrough[slot] = Math.max(this.flushedThrough[slot], this.current + this.delay);
    if (slot === this.localSlot) this.flushLocal?.();
  }

  // The local player's frame for the next step to sample.
  sampleNext() {
    const f = this.battle?.[this.localSlot];
    const context = f ? { grounded: !!f.body?.grounded, facing: f.facing, character: f.def ?? null } : undefined;
    const bits = this.muted ? 0 : encodeFrame(this.sampleLocal(context));
    this.frames[this.localSlot].set(this.localNext, bits);
    this.localNext += 1;
  }

  // Samples what is due (up to the next step + D) and says whether the next
  // step can run: the other player's frame for it is here.
  prepare() {
    while (this.localNext <= this.next + this.delay) this.sampleNext();
    return this.frames[this.remoteSlot].has(this.next);
  }

  // Runs the next step, then its checkpoint and a little housekeeping.
  runStep() {
    this.current = this.next;
    this.battle.update(this.stepSeconds);
    this.next += 1;
    const s = this.current;
    if ((s + 1) % this.hashInterval === 0) this.checkpoint(s);
    // Frames no longer needed: the other's for steps run, ours once both
    // run and acknowledged.
    this.frames[this.remoteSlot].delete(s - 1);
    const local = this.frames[this.localSlot];
    for (const k of local.keys()) {
      if (k < s && k <= this.peerHas) local.delete(k);
      else break;
    }
  }

  // ---- The clock --------------------------------------------------------------------

  // One animation frame's worth of `dt` simulation seconds (already slowed
  // by any slow motion): see the top. Returns how far between steps to
  // draw (0 to 1).
  advance(dt) {
    if (!this.running || !this.battle) return this.alpha;
    const step = this.stepSeconds;
    this.acc += Math.max(0, Number(dt) || 0);
    // Behind the other browser: catch up a step this frame.
    if (this.remoteHave - (this.next + this.delay) > 1) this.acc += step;
    let steps = 0;
    let stalled = false;
    while (this.acc >= step && steps < this.maxStepsPerFrame) {
      if (!this.prepare()) {
        stalled = true;
        break;
      }
      this.runStep();
      this.acc -= step;
      steps += 1;
      if (!this.running) break;
    }
    // Waiting banks nothing; a frame too long for its steps drops the rest
    // of its time, as offline.
    if (stalled) this.acc = Math.min(this.acc, step);
    else if (steps >= this.maxStepsPerFrame) this.acc = 0;
    this.sendInputs();
    if (this.running) this.track(stalled);
    this.alpha = Math.min(1, Math.max(0, this.acc / step));
    return this.alpha;
  }

  // Whether the match waits, for how long, and whether it has waited too
  // long: the grace once the other side has been heard from, the load
  // allowance before.
  track(stalled) {
    const t = this.clock();
    if (!stalled) {
      this.waitingSince = null;
      if (this.waiting) {
        this.waiting = false;
        this.events.emit('resumed');
      }
      return;
    }
    if (this.waitingSince === null) this.waitingSince = t;
    const waited = t - this.waitingSince;
    if (!this.waiting && waited >= WAITING_NOTICE_MS) {
      this.waiting = true;
      this.events.emit('waiting');
    }
    if (waited >= (this.heard ? this.graceMs : this.loadTimeoutMs)) this.end('timeout');
  }

  // ---- The link ---------------------------------------------------------------------

  // The packet for this frame (see the top), unless the last one went less
  // than `sendIntervalMs` ago, or there is nothing new and a heartbeat went
  // recently.
  sendInputs() {
    if (!this.transport?.open) return;
    const t = this.clock();
    if (this.sendIntervalMs && t - this.lastSent < this.sendIntervalMs) return;
    const first = this.peerHas + 1;
    const last = Math.min(this.localNext - 1, first + this.resendWindow - 1);
    if (last < first && this.ackSent === this.remoteHave && t - this.lastSent < HEARTBEAT_MS) return;
    const f = [];
    for (let s = first; s <= last; s++) f.push(this.frames[this.localSlot].get(s) ?? 0);
    this.transport.send({ t: 'in', m: this.match, s: first, f, a: this.remoteHave });
    this.lastSent = t;
    this.ackSent = this.remoteHave;
  }

  receive(message) {
    if (!message || message.m !== this.match || !this.running) return;
    this.heard = true;
    switch (message.t) {
      case 'in': {
        const { s, f, a } = message;
        if (Number.isInteger(a)) this.peerHas = Math.max(this.peerHas, Math.min(a, this.localNext - 1));
        if (!Number.isInteger(s) || !Array.isArray(f)) return;
        const frames = this.frames[this.remoteSlot];
        f.forEach((bits, i) => {
          const at = s + i;
          if (at >= this.next && isFrame(bits) && !frames.has(at)) frames.set(at, bits);
        });
        while (frames.has(this.remoteHave + 1)) this.remoteHave += 1;
        return;
      }
      case 'h':
        if (!Number.isInteger(message.s) || !Number.isInteger(message.h)) return;
        this.remoteHashes.set(message.s, message.h);
        this.compare(message.s);
        return;
      case 'state':
        if (this.debug) console.error(`[Alva] Online desync at step ${message.s}: the other browser's state`, message.state);
        return;
      case 'leave':
        this.end('left');
        return;
      default:
    }
  }

  // The match's hash after step `s`, kept and sent.
  checkpoint(s) {
    const state = battleState(this.battle);
    const h = hashState(state);
    this.localHashes.set(s, { h, state });
    for (const k of this.localHashes.keys()) {
      if (this.localHashes.size <= HASHES_KEPT) break;
      this.localHashes.delete(k);
    }
    this.transport?.send({ t: 'h', m: this.match, s, h });
    this.compare(s);
  }

  // Both hashes of step `s`, once both are here: equal, they are dropped;
  // different, the match ends as a desync.
  compare(s) {
    const local = this.localHashes.get(s);
    const remote = this.remoteHashes.get(s);
    if (!local || remote === undefined) return;
    this.remoteHashes.delete(s);
    if (local.h === remote) {
      this.localHashes.delete(s);
      return;
    }
    if (this.debug) {
      console.error(`[Alva] Online desync at step ${s}: this browser's state`, local.state);
      this.transport?.send({ t: 'state', m: this.match, s, state: local.state });
    }
    this.end('desync', { step: s, state: local.state });
  }

  // The other browser is gone from the link: the match waits for it like
  // any silence, and times out after the grace.
  peerClosed() {
    if (this.peerGone) return;
    this.peerGone = true;
    this.events.emit('peerClosed');
  }

  // This player leaves the match: the other side is told (a few times, the
  // link being unreliable) and the match ends here.
  leave() {
    if (!this.running) return;
    for (let i = 0; i < LEAVE_COPIES; i++) this.transport?.send({ t: 'leave', m: this.match });
    this.end('quit');
  }

  end(reason, detail = {}) {
    if (!this.running) return;
    this.status = 'ended';
    this.endReason = reason;
    if (this.waiting) this.waiting = false;
    this.events.emit('end', { reason, ...detail });
  }

  // Lets go of the link and the battle (the link itself stays open for the
  // next match: the room owns it).
  dispose() {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    if (this.battle?.stepper === this) this.battle.stepper = null;
    this.events.clear();
    if (this.running) this.status = 'ended';
  }
}
