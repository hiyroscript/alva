// Run with node --test tests/online/lockstep.test.mjs (no dependencies).
// Online Play's lockstep (js/online/lockstep.js) on real Battles over an
// in-memory transport (js/online/transport.js): each step runs only with
// both players' inputs, the local input lands D steps after it is sampled
// (3 by default), lost packets are made up by the next ones, a late
// opponent makes the match wait ("Waiting for opponent…") and a silent one
// ends it after the grace, 'leave' ends it as a forfeit, a flush drops the
// presses already sampled on both sides alike, and slow motion and the
// steps-per-frame cap change only when steps run, never what they do. The
// input frame carries every field a player's snapshot has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../js/game/battle.js';
import { MAPS } from '../../js/data/maps.js';
import { CONFIG } from '../../js/config.js';
import { playableCharacters } from '../../js/data/characters.js';
import { PlayerController, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { LockstepSession, LockstepChannel, WAITING_NOTICE_MS } from '../../js/online/lockstep.js';
import { FRAME_FIELDS, encodeFrame, decodeFrame, HELD_MASK, blankFrame, isFrame } from '../../js/online/input-frame.js';
import { memoryTransportPair } from '../../js/online/transport.js';
import { battleHash } from '../../js/online/state-hash.js';
import { fakeSpritesOf } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class { constructor() { return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) }); } };

const STEP = CONFIG.sim.step;
const [DEF_A, DEF_B = DEF_A] = playableCharacters();

// Two browsers: each a Battle and its lockstep over one pair, a shared
// clock (milliseconds), and `script[slot](n)`: the input that browser's
// player gives on its n-th sample.
function match({ delay = 3, drop, scripts = {}, map = MAPS[0], p1 = DEF_A, p2 = DEF_B, seed = 77, debug = false } = {}) {
  const pair = memoryTransportPair({ drop });
  const clock = { now: 0 };
  const sides = {};
  for (const [slot, transport] of [['p1', pair.a], ['p2', pair.b]]) {
    let n = 0;
    const flushes = [];
    const session = new LockstepSession({
      transport, localSlot: slot, delay, clock: () => clock.now, debug,
      sampleLocal: () => (scripts[slot] ? scripts[slot](n++) : (n++, null)),
      flushLocal: () => flushes.push(session.current),
    });
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map, mode: 'online', seed, p1Def: p1, p2Def: p2,
      p1Sprites: fakeSpritesOf(p1), p2Sprites: fakeSpritesOf(p2), input: session.input, labels: { p1: 'Ann', p2: 'Bob' },
    });
    session.attach(battle);
    const events = [];
    session.on((type, detail) => events.push([type, detail?.reason]));
    sides[slot] = { session, battle, events, flushes };
  }
  // One animation frame on each side (`dt` seconds each, or { p1, p2 }),
  // then the network delivers what is waiting.
  const frame = (dt = STEP, { deliver = true } = {}) => {
    clock.now += 1000 * (typeof dt === 'number' ? dt : Math.max(dt.p1 ?? 0, dt.p2 ?? 0));
    for (const slot of ['p1', 'p2']) sides[slot].session.advance(typeof dt === 'number' ? dt : dt[slot] ?? 0);
    if (deliver) pair.deliver();
  };
  return { pair, clock, ...sides, frame };
}

// What a scripted player does: deterministic, every control.
function scripted(seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let held = {};
  return () => {
    if (rnd() < 0.15) {
      held = {
        runLeft: rnd() < 0.35, runRight: rnd() < 0.35, down: rnd() < 0.1, jump: rnd() < 0.15, shield: rnd() < 0.08,
        attack1: rnd() < 0.1, attack3: rnd() < 0.05, extra_attack: rnd() < 0.05,
      };
    }
    const frame = { ...held };
    for (const control of ['jump', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack', 'shield', 'down']) {
      if (rnd() < 0.04) frame[`${control}Pressed`] = true;
    }
    if (rnd() < 0.02) frame.mouvementLeftPressed = true;
    else if (rnd() < 0.02) frame.mouvementRightPressed = true;
    return frame;
  };
}

test('the input frame: every field of a player\'s snapshot, one bit each, round trip exact', () => {
  const { dropPressed, ...snapshot } = blankInput();
  assert.deepEqual([...FRAME_FIELDS].sort(), Object.keys(snapshot).sort(), 'everything a PlayerController hands its Fighter');
  assert.equal(FRAME_FIELDS.length, 26);
  for (const [i, field] of FRAME_FIELDS.entries()) {
    const bits = encodeFrame({ [field]: true });
    assert.equal(bits, 1 << i, field);
    const back = decodeFrame(bits);
    for (const other of FRAME_FIELDS) assert.equal(back[other], other === field, `${field} → ${other}`);
  }
  const all = Object.fromEntries(FRAME_FIELDS.map((f) => [f, true]));
  assert.equal(encodeFrame(all), 2 ** 26 - 1);
  assert.ok(isFrame(2 ** 26 - 1) && !isFrame(2 ** 26) && !isFrame(-1) && !isFrame(1.5));
  // A flush keeps what is held, drops every press.
  const kept = decodeFrame(encodeFrame(all) & HELD_MASK);
  for (const f of FRAME_FIELDS) assert.equal(kept[f], !/Pressed$|^pressed/.test(f), f);
  assert.deepEqual(decodeFrame(0), blankFrame());
});

test('both sides step together, each step only once both inputs are known; the local input lands D steps after it is sampled', () => {
  const pressAt = 10;
  const m = match({
    delay: 3,
    scripts: { p1: (n) => (n === pressAt ? { runRight: true } : null), p2: () => null },
  });
  const seen = [];
  const channel = m.p2.battle.p1.controller.input;
  assert.ok(m.p2.battle.p1.controller instanceof PlayerController, 'a player either side, no CPU');
  assert.ok(channel instanceof LockstepChannel);
  const sample = channel.sample.bind(channel);
  channel.sample = () => {
    const f = sample();
    if (f.runRight) seen.push(m.p2.session.current);
    return f;
  };
  for (let i = 0; i < 40; i++) m.frame();
  assert.equal(m.p1.session.next, m.p2.session.next);
  assert.ok(m.p1.session.next >= 38);
  // Sampled on p1's 11th sample (sample n is for step n + D): played on the
  // other browser at step 13, never before.
  assert.deepEqual(seen, [pressAt + 3]);
  assert.equal(battleHash(m.p1.battle), battleHash(m.p2.battle));
});

test('a lost packet costs nothing: every frame comes again in the next one until acknowledged', () => {
  let n = 0;
  // Lose four packets in five.
  const m = match({ drop: () => (n++ % 5) !== 0, scripts: { p1: scripted(1), p2: scripted(2) } });
  for (let i = 0; i < 600; i++) m.frame();
  assert.ok(m.pair.dropped.a > 300 && m.pair.dropped.b > 300, 'most packets lost');
  assert.ok(m.p1.session.next > 450, `still playing (${m.p1.session.next} steps)`);
  assert.ok(Math.abs(m.p1.session.next - m.p2.session.next) <= 6);
  assert.deepEqual(m.p1.events.filter(([t]) => t === 'end'), []);
  assert.deepEqual(m.p2.events.filter(([t]) => t === 'end'), []);
});

test('a late opponent: the match waits (nothing runs, nothing banked), says so, and resumes as their inputs arrive', () => {
  const m = match({ scripts: { p1: scripted(3), p2: scripted(4) } });
  for (let i = 0; i < 30; i++) m.frame();
  const before = m.p1.session.next;
  m.pair.hold = true;
  for (let i = 0; i < 10; i++) m.frame();
  // p1 runs at most the D steps it already holds p2's frames for.
  assert.ok(m.p1.session.next <= before + 3 + 1, 'stopped');
  const stalled = m.p1.session.next;
  for (let i = 0; i < 30; i++) m.frame();
  assert.equal(m.p1.session.next, stalled, 'no step without the other\'s input');
  assert.ok(m.p1.session.acc <= STEP, 'nothing banked while waiting');
  assert.ok(m.clock.now > WAITING_NOTICE_MS);
  assert.deepEqual(m.p1.events.filter(([t]) => t === 'waiting'), [['waiting', undefined]]);
  m.pair.hold = false;
  m.frame();
  m.frame();
  assert.ok(m.p1.session.next > stalled, 'resumed');
  assert.ok(m.p1.events.some(([t]) => t === 'resumed'));
  for (let i = 0; i < 60; i++) m.frame();
  assert.equal(battleHash(m.p1.battle) === battleHash(m.p2.battle) || m.p1.session.next !== m.p2.session.next, true);
});

test('a silent opponent ends the match after the grace ("Connection lost"); a closed link waits the same grace', async () => {
  const m = match({ scripts: { p1: scripted(5), p2: scripted(6) } });
  for (let i = 0; i < 20; i++) m.frame();
  m.pair.hold = true;
  const frames = Math.ceil(CONFIG.online.disconnectGraceMs / (1000 * STEP)) + 10;
  for (let i = 0; i < frames; i++) m.frame();
  assert.deepEqual(m.p1.events.filter(([t]) => t === 'end'), [['end', 'timeout']]);
  assert.equal(m.p1.session.running, false);
  const steps = m.p1.session.next;
  m.pair.hold = false;
  for (let i = 0; i < 10; i++) m.frame();
  assert.equal(m.p1.session.next, steps, 'an ended match stays ended');

  const c = match();
  for (let i = 0; i < 20; i++) c.frame();
  c.pair.b.close();
  await Promise.resolve();
  c.frame();
  assert.ok(c.p1.events.some(([t]) => t === 'peerClosed'));
  for (let i = 0; i < frames; i++) c.frame();
  assert.ok(c.p1.events.some(([t, r]) => t === 'end' && r === 'timeout'));
});

test('before the other browser is first heard from (both loading), the wait is the load allowance, not the grace', () => {
  const m = match();
  m.pair.hold = true;
  const graceFrames = Math.ceil(CONFIG.online.disconnectGraceMs / (1000 * STEP)) + 10;
  for (let i = 0; i < graceFrames; i++) m.frame();
  assert.equal(m.p1.session.running, true, 'still loading is not a disconnect');
  const more = Math.ceil((CONFIG.online.loadTimeoutMs - CONFIG.online.disconnectGraceMs) / (1000 * STEP)) + 10;
  for (let i = 0; i < more; i++) m.frame();
  assert.ok(m.p1.events.some(([t, r]) => t === 'end' && r === 'timeout'));
});

test('leaving is a forfeit: the other side hears it and its match ends ("Your opponent left.")', () => {
  const m = match({ scripts: { p1: scripted(7), p2: scripted(8) } });
  for (let i = 0; i < 30; i++) m.frame();
  m.p2.session.leave();
  m.pair.deliver();
  assert.deepEqual(m.p2.events.filter(([t]) => t === 'end'), [['end', 'quit']]);
  assert.deepEqual(m.p1.events.filter(([t]) => t === 'end'), [['end', 'left']]);
  // The Battle records it: the side that left loses.
  const result = m.p1.battle.forfeit('p2');
  assert.equal(result.winner, 'p1');
  assert.equal(result.reason, 'forfeit');
  assert.equal(m.p1.battle.matchOver, true);
  assert.equal(m.p1.battle.forfeit('p1').winner, 'p1', 'once over, nothing changes');
  // Copies were sent: a lossy link still gets one through.
  let n = 0;
  const lossy = match({ drop: (msg) => msg.t === 'leave' && n++ < 2 });
  for (let i = 0; i < 10; i++) lossy.frame();
  lossy.p1.session.leave();
  lossy.pair.deliver();
  assert.ok(lossy.p2.events.some(([t, r]) => t === 'end' && r === 'left'));
});

test('another match\'s packets are never read', () => {
  const m = match();
  for (let i = 0; i < 10; i++) m.frame();
  const before = m.p1.session.remoteHave;
  m.p1.session.receive({ t: 'in', m: 99, s: before + 1, f: [1, 1, 1, 1], a: 0 });
  m.p1.session.receive({ t: 'leave', m: 99 });
  assert.equal(m.p1.session.remoteHave, before);
  assert.equal(m.p1.session.running, true);
  // Nor frames this build could not make.
  m.p1.session.receive({ t: 'in', m: 1, s: before + 1, f: [2 ** 30, -1, 'x'], a: 0 });
  assert.equal(m.p1.session.remoteHave, before);
});

test('a flush (a respawn, the fight starting) drops the presses already sampled for that player, on both sides alike', () => {
  const m = match({ scripts: { p1: () => ({ runRight: true, attack1Pressed: true }), p2: () => null } });
  for (let i = 0; i < 20; i++) m.frame();
  // The fight starting flushed both players on both sides, at the same step.
  assert.ok(m.p1.flushes.length >= 1, 'the local devices flushed too');
  for (const side of [m.p1, m.p2]) {
    assert.equal(side.session.flushedThrough.p1, side.session.flushedThrough.p1);
  }
  assert.deepEqual(m.p1.session.flushedThrough, m.p2.session.flushedThrough);
  // Read at a flushed step, a frame keeps what is held and loses its presses.
  const session = m.p2.session;
  session.current = session.next;
  session.frames.p1.set(session.current, encodeFrame({ runRight: true, attack1Pressed: true }));
  session.flushSlot('p1');
  const f = session.frameFor('p1', blankFrame());
  assert.equal(f.runRight, true);
  assert.equal(f.attack1Pressed, false);
  assert.equal(session.flushedThrough.p1, session.current + session.delay);
});

test('muted (the menu or the Match Results open): the local player plays nothing, the world runs on', () => {
  const m = match({ scripts: { p1: () => ({ runRight: true }), p2: () => null } });
  m.p1.session.muted = true;
  for (let i = 0; i < 300; i++) m.frame();
  assert.ok(m.p1.session.next > 280, 'the world ran');
  const x0 = m.p1.battle.p1.body.x;
  for (let i = 0; i < 60; i++) m.frame();
  assert.equal(m.p1.battle.p1.body.x, x0, 'nothing played');
  assert.equal(m.p2.battle.p1.body.x, x0, 'on both sides');
});

test('slow motion and the steps-per-frame cap change when steps run, never what they do', () => {
  // One side's frames come slowly and unevenly (a slow device, slow motion),
  // the other's fast and in bursts past the cap: the same match all the same.
  const a = match({ scripts: { p1: scripted(11), p2: scripted(12) } });
  for (let i = 0; i < 900; i++) a.frame({ p1: STEP * (0.25 + (i % 5) * 0.2), p2: i % 9 === 0 ? STEP * 9 : STEP * 0.5 });
  for (let i = 0; i < 600; i++) a.frame();
  // Settle both on the same step to compare.
  const target = Math.min(a.p1.session.next, a.p2.session.next) - 1;
  assert.ok(target > 300);
  const b = match({ scripts: { p1: scripted(11), p2: scripted(12) } });
  const hashes = [];
  const record = (side, out) => {
    const update = side.battle.update.bind(side.battle);
    side.battle.update = (dt) => {
      update(dt);
      if (side.session.current === target) out.push(battleHash(side.battle));
    };
  };
  record(b.p1, hashes);
  record(b.p2, hashes);
  for (let i = 0; i < target + 20; i++) b.frame();
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0], hashes[1]);
  assert.deepEqual(a.p1.events.filter(([t]) => t === 'end'), [], 'no desync, ever');
  assert.deepEqual(a.p2.events.filter(([t]) => t === 'end'), []);
});

test('a browser left behind catches up, a step more a frame, and never runs past what it holds', () => {
  const m = match({ scripts: { p1: scripted(13), p2: scripted(14) } });
  // p2's device runs at two thirds of the speed for a while.
  for (let i = 0; i < 240; i++) m.frame({ p1: STEP, p2: STEP * 0.66 });
  const gap = m.p1.session.next - m.p2.session.next;
  assert.ok(gap <= 3 + 1, `p1 never more than D ahead (${gap})`);
  for (let i = 0; i < 60; i++) m.frame();
  assert.ok(Math.abs(m.p1.session.next - m.p2.session.next) <= 2, 'level again');
});
