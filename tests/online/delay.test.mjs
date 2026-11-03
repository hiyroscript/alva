// Each match's input delay (js/online/delay.js): the smallest that covers
// the send interval, the trip measured to the other player and a margin,
// within its range; the ping probe that measures the trip; the start that
// carries the host's choice to both players.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_A, TEST_B, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';

const { CONFIG } = await import('../../js/config.js');
const { chooseDelay, validDelay, DelayProbe, SAMPLES_KEPT, SAMPLES_NEEDED } = await import('../../js/online/delay.js');
const { readStart } = await import('../../js/online/match-setup.js');
const { memoryTransportPair } = await import('../../js/online/transport.js');

useTestFighters(TEST_A, TEST_B);

const steps = (n) => Array(SAMPLES_NEEDED).fill(n);

test('the delay covers the send interval, half the round trip and the margin, in steps, within its range', () => {
  // (33 + rtt / 2 + 15) / 16.67, rounded up.
  assert.equal(chooseDelay(steps(0)), 3, 'next door: the least, 50 ms');
  assert.equal(chooseDelay(steps(20)), 4, '20 ms round trip: 67 ms');
  assert.equal(chooseDelay(steps(60)), 5, '60 ms: 83 ms');
  assert.equal(chooseDelay(steps(100)), 6, '100 ms: 100 ms');
  assert.equal(chooseDelay(steps(130)), 7);
  assert.equal(chooseDelay(steps(400)), CONFIG.online.inputDelayRange.max, 'far: the most, 200 ms');
  // Too few round trips: the game's default.
  assert.equal(chooseDelay([]), CONFIG.online.inputDelay);
  assert.equal(chooseDelay([20, 20, 20]), CONFIG.online.inputDelay);
  assert.equal(chooseDelay(undefined), CONFIG.online.inputDelay);
  // Most of the ups and downs are covered, a single stray one is not.
  assert.equal(chooseDelay([20, 20, 20, 20, 20, 500]), chooseDelay(steps(20)), 'one stray round trip of six ignored');
  assert.equal(chooseDelay([20, 20, 20, 20, 120, 120]), chooseDelay(steps(120)), 'two of six slow: covered');
  assert.equal(chooseDelay([20, -5, NaN, Infinity, 20, 20, 20]), 4, 'nonsense skipped');
});

test('a valid delay is a whole number of steps in the range; the start reads it, or the default', () => {
  for (const d of [3, 7, 12]) assert.equal(validDelay(d), d);
  for (const d of [2, 13, 4.5, '6', null, undefined, -3]) assert.equal(validDelay(d), null, String(d));
  const start = { match: 1, seed: 9, p1: { name: 'A', fighterId: TEST_A.id }, p2: { name: 'B', fighterId: TEST_B.id } };
  assert.equal(readStart({ ...start, delay: 4 }).delay, 4);
  assert.equal(readStart(start).delay, CONFIG.online.inputDelay, 'no delay: the default');
  assert.equal(readStart({ ...start, delay: 40 }).delay, CONFIG.online.inputDelay, 'out of range: the default');
});

test('the probe: the host pings, the other side answers at once, the round trips are kept; then it slows down, and stops', () => {
  const pair = memoryTransportPair();
  let now = 0;
  const timers = [];
  const timing = { setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.cleared = true; } };
  const host = new DelayProbe({ transport: pair.a, measuring: true, now: () => now, ...timing });
  const guest = new DelayProbe({ transport: pair.b, now: () => now + 5000, ...timing });
  assert.deepEqual(JSON.parse(pair.inbox.b[0]), { t: 'ping', id: 1 }, 'the host pings at once');
  const tick = (rtt) => {
    now += rtt;
    pair.deliver();
    const next = timers.filter((t) => !t.cleared).at(-1);
    next.cleared = true;
    now += next.ms;
    next.fn();
    return next.ms;
  };
  assert.equal(tick(40), CONFIG.online.pingIntervalMs);
  assert.deepEqual(host.samples, [40], 'measured on the host\'s own clock');
  assert.deepEqual(guest.samples, [], 'the other side only answers');
  for (let i = 1; i < SAMPLES_KEPT; i++) tick(30 + i);
  assert.equal(host.samples.length, SAMPLES_KEPT);
  assert.equal(tick(50), CONFIG.online.pingRefreshMs, 'enough measured: every few seconds');
  assert.equal(host.samples.length, SAMPLES_KEPT, 'the most recent kept');
  assert.equal(host.samples.at(-1), 50);
  assert.equal(host.delay(), chooseDelay(host.samples));
  // A pong for a ping it never sent, or garbage, counts for nothing (the
  // ping still on its way answered first).
  pair.deliver();
  const kept = [...host.samples];
  pair.b.send({ t: 'pong', id: 999 });
  pair.b.send({ t: 'pong' });
  pair.b.send(null);
  pair.deliver();
  assert.deepEqual(host.samples, kept);
  // Stopped: no answers, no pings.
  guest.stop();
  host.stop();
  const before = pair.sent.a + pair.sent.b;
  pair.a.send({ t: 'ping', id: 77 });
  pair.deliver();
  host.ping();
  assert.equal(pair.sent.a + pair.sent.b, before + 1, 'only the test\'s own ping went');
  assert.ok(timers.every((t) => t.cleared || t.ran), 'no timer left running');
});
