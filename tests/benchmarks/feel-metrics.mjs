// Combat-feel metrics (not part of `node --test`: run it by hand).
//
//   node tests/benchmarks/feel-metrics.mjs              # the table
//   node tests/benchmarks/feel-metrics.mjs --json out.json   # raw numbers too
//
// Responsiveness proxies measured on the real Fighter, physics and combat
// (tests/helpers/fighter-harness.mjs), every fighter on the same flat stage,
// from the same spawn, with the same scripted inputs at the fixed 60 Hz
// step, so two revisions of the code can be compared number for number:
//
//   reverse        steps from full speed one way to full speed the other
//                  (ground, then air)
//   run → attack   running right at top speed, an ordinary ground attack
//                  pressed with right still held: its speed one step in
//                  and as it ends (and the lowest in between), and how far
//                  it travels while it plays; then the same with nothing
//                  held after the press
//   steer          from a standstill, the attack pressed with right held:
//                  how far the player can move it while it plays
//   back-space     running right, the attack pressed and left held at
//                  once: how far it drifts back (negative is backward)
//   air steer      drifting right at top speed at a jump's apex, an
//                  ordinary aerial pressed with left held: the drift it
//                  ends with (how much the player turned round), and with
//                  right held (how much of the drift it keeps)
//   dash → attack  Attack 1 at the Dash's first cancel step: the speed it
//                  starts with and six steps on
//   dashes / 10 s  Dashes started by pressing the Dash every step it is
//                  allowed, alternating sides, from a full bar
//
// These are proxies: they show whether control and momentum survive a
// change of action, never whether the game is fun. Nothing here is
// asserted; the tests assert the rules.

import { writeFileSync } from 'node:fs';
import { playableCharacters, getCharacter } from '../../js/data/characters.js';
import { harnessFor, DT, MOVEMENT as MV } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const RIGHT = { runRight: true };
const LEFT = { runLeft: true };
const COMMIT = Math.ceil(MV.dashCancelTime / DT - 1e-9);
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

// Every ordinary attack a fighter has on a button (no motion of its own but
// a hover), by place: [{ action, id }].
function attacksOf(c, f, place) {
  const out = [];
  for (const [action, mapping] of Object.entries(c.actions ?? {})) {
    if (!mapping || mapping.type) continue;
    const id = typeof mapping === 'string' ? mapping : mapping[place];
    const atk = id ? f.attacks[id] : null;
    if (!atk || (atk.motion && atk.motion.type !== 'hover')) continue;
    if (place === 'air' && atk.groundOnly) continue;
    out.push({ action, id });
  }
  return out;
}

// Steps `h` (one fighter) with `held` until its attack is over; returns the
// samples taken, one per step.
function playOut(h, held) {
  const samples = [];
  for (let i = 0; i < 240 && h.fighter.combat.attack; i++) {
    h.step(held);
    samples.push({ x: h.fighter.body.x, vx: h.fighter.body.vx });
  }
  return samples;
}

function running(makeFighter) {
  const h = makeFighter({ x: 300 });
  for (let i = 0; i < 20; i++) h.step(RIGHT);
  return h;
}

function groundAttack(makeFighter, action, { during, pressHeld }) {
  const h = pressHeld === 'stand' ? makeFighter({ x: 600 }) : running(makeFighter);
  const x0 = h.fighter.body.x;
  h.step({ ...(pressHeld === 'stand' ? RIGHT : pressHeld), ...P(action) });
  const first = h.fighter.body.vx;
  const samples = playOut(h, during);
  const end = samples.at(-1) ?? { x: h.fighter.body.x, vx: h.fighter.body.vx };
  return {
    first: round(first),
    end: round(end.vx),
    min: round(Math.min(first, ...samples.map((s) => s.vx))),
    travel: round(end.x - x0),
    steps: samples.length + 1,
  };
}

function airAttack(makeFighter, action, held) {
  const h = running(makeFighter);
  h.step({ ...RIGHT, ...P('jump') });
  for (let i = 0; i < 120 && h.fighter.body.vy < 0; i++) h.step(RIGHT);
  const before = h.fighter.body.vx;
  h.step({ ...held, ...P(action) });
  const samples = playOut(h, held);
  const end = samples.at(-1)?.vx ?? h.fighter.body.vx;
  return { before: round(before), end: round(end), turned: round(before - end) };
}

function reverseSteps(makeFighter, air) {
  const h = makeFighter({ x: 900, y: air ? 200 : undefined });
  if (air) {
    // Hang the body in the air at top speed (gravity aside, steering is the
    // same whatever the height).
    h.fighter.body.grounded = false;
    h.fighter.body.ground = null;
  } else {
    for (let i = 0; i < 20; i++) h.step(RIGHT);
  }
  h.fighter.body.vx = MV.maxSpeed;
  let n = 0;
  while (h.fighter.body.vx > -MV.maxSpeed + 1e-6 && n < 120) {
    if (air) h.fighter.body.y = 200;
    h.step(LEFT);
    n++;
  }
  return n;
}

function dashAttack(makeFighter) {
  const h = makeFighter({ x: 300 });
  h.step(RIGHT);
  h.step({ ...RIGHT, mouvementRightPressed: true });
  for (let i = 0; i < COMMIT; i++) h.step(RIGHT);
  h.step({ ...RIGHT, ...P('attack1') });
  const start = h.fighter.body.vx;
  for (let i = 0; i < 6; i++) h.step(RIGHT);
  return { start: round(start), later: round(h.fighter.body.vx), attacking: !!h.fighter.combat.attack };
}

function dashesIn10s(makeFighter) {
  const h = makeFighter({ x: 1000 });
  let side = 1;
  let count = 0;
  for (let i = 0; i < 600; i++) {
    const before = h.fighter.dash;
    const press = side > 0 ? { mouvementRightPressed: true } : { mouvementLeftPressed: true };
    h.step(press);
    if (h.fighter.dash && h.fighter.dash !== before) {
      count++;
      side = -side;
    }
    // Keep it near the middle of the floor.
    h.fighter.body.x = 1000;
  }
  return count;
}

const results = { universal: {}, fighters: {} };
{
  const { makeFighter } = harnessFor(getCharacter('0001'));
  results.universal.reverseGroundSteps = reverseSteps(makeFighter, false);
  results.universal.reverseAirSteps = reverseSteps(makeFighter, true);
  results.universal.dashesIn10s = dashesIn10s(makeFighter);
}
for (const c of playableCharacters()) {
  const { makeFighter } = harnessFor(c);
  const probe = makeFighter().fighter;
  const ground = {};
  for (const { action, id } of attacksOf(c, probe, 'ground')) {
    ground[id] = {
      runHeld: groundAttack(makeFighter, action, { pressHeld: RIGHT, during: RIGHT }),
      runReleased: groundAttack(makeFighter, action, { pressHeld: RIGHT, during: {} }),
      standSteer: groundAttack(makeFighter, action, { pressHeld: 'stand', during: RIGHT }),
      backSpace: groundAttack(makeFighter, action, { pressHeld: RIGHT, during: LEFT }),
    };
  }
  const air = {};
  for (const { action, id } of attacksOf(c, probe, 'air')) {
    air[id] = { back: airAttack(makeFighter, action, LEFT), on: airAttack(makeFighter, action, RIGHT) };
  }
  results.fighters[c.id] = { ground, air, dashAttack: dashAttack(makeFighter) };
}

const u = results.universal;
console.log(`reverse: ground ${u.reverseGroundSteps} steps, air ${u.reverseAirSteps} steps`);
console.log(`dashes / 10 s: ${u.dashesIn10s}`);
for (const [id, f] of Object.entries(results.fighters)) {
  console.log(`\n#${id}  dash → Attack 1: ${f.dashAttack.start} → ${f.dashAttack.later} units/s`);
  console.log('  ground attack        run held: first/min/end travel | released: end travel | stand steer | back-space');
  for (const [atk, m] of Object.entries(f.ground)) {
    console.log(
      `  ${atk.padEnd(20)} ${`${m.runHeld.first}/${m.runHeld.min}/${m.runHeld.end}`.padStart(13)} ${String(m.runHeld.travel).padStart(5)}` +
      ` | ${String(m.runReleased.end).padStart(5)} ${String(m.runReleased.travel).padStart(5)}` +
      ` | ${String(m.standSteer.travel).padStart(5)} | ${String(m.backSpace.travel).padStart(5)}`,
    );
  }
  for (const [atk, m] of Object.entries(f.air)) {
    console.log(`  ${atk.padEnd(20)} air drift ${m.back.before} → left held ${m.back.end}, right held ${m.on.end}`);
  }
}

const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(results, null, 2));
