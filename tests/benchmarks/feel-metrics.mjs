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
//   step-in        from a standstill, an ordinary ground attack pressed
//                  with nothing held: how far its Step-in carries it while
//                  it plays, and how many times its speed rises (once at
//                  most)
//   steered        the same attack with Run held, then held back, through
//                  it, aimed the way it faces (so nothing held can turn it):
//                  how much further either moves it than nothing held (0:
//                  attacks are never steered), from a standstill and from a
//                  run
//   run → attack   running right at top speed, the attack pressed: its
//                  speed one step in and as it ends, how far it carries on
//                  with nothing held, and the steps after it ends before
//                  Run held moves it again (1: normal movement back at once)
//   air drift      drifting right at top speed at a jump's apex, an
//                  ordinary aerial pressed: the drift it ends with, and how
//                  much Run or left held changes it (0)
//   dash → attack  Attack 1 at the Dash's first cancel step: the speed it
//                  starts with and six steps on
//   dashes / 10 s  Dashes started by pressing the Dash every step it is
//                  allowed, alternating sides, from a full bar
//
// These are proxies: they show whether momentum survives a change of
// action, that the Step-in is slight and that nothing steers an attack,
// never whether the game is fun. Nothing here is
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

// An ordinary ground attack `action`, from a standstill (`from` 'stand')
// or a run, with `during` held through it: its speed one step in and as it
// ends, how far it travels while it plays, how many times its speed rises
// (its Step-in) and, `during` still held, the steps after it before the
// fighter moves on under Run again.
function groundAttack(makeFighter, action, { from, during }) {
  const h = from === 'stand' ? makeFighter({ x: 600 }) : running(makeFighter);
  h.fighter.controller.attackFacing = () => h.fighter.facing;
  const x0 = h.fighter.body.x;
  // Pressed with nothing held (a direction held as it is pressed only
  // chooses the way it faces), `during` held from the next step on.
  h.step(P(action));
  const first = h.fighter.body.vx;
  const samples = playOut(h, during);
  const playing = samples.slice(0, -1);
  const end = playing.at(-1) ?? { x: h.fighter.body.x, vx: h.fighter.body.vx };
  let rises = 0;
  let last = first;
  for (const { vx } of playing) {
    if (vx > last + 1e-9) rises++;
    last = vx;
  }
  let restored = 0;
  const v = h.fighter.body.vx;
  for (let i = 0; i < 30 && h.fighter.body.vx <= v + 1e-9; i++) {
    h.step(RIGHT);
    restored++;
  }
  return { first: round(first), end: round(end.vx), travel: round(end.x - x0, 1), rises, restored };
}

function airAttack(makeFighter, action, held) {
  const h = running(makeFighter);
  h.fighter.controller.attackFacing = () => h.fighter.facing;
  h.step({ ...RIGHT, ...P('jump') });
  for (let i = 0; i < 120 && h.fighter.body.vy < 0; i++) h.step(RIGHT);
  const before = h.fighter.body.vx;
  h.step({ ...held, ...P(action) });
  const samples = playOut(h, held);
  const end = samples.at(-2)?.vx ?? h.fighter.body.vx;
  return { before: round(before), end: round(end, 1) };
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
    const stand = groundAttack(makeFighter, action, { from: 'stand', during: {} });
    const run = groundAttack(makeFighter, action, { from: 'run', during: {} });
    ground[id] = {
      stand,
      run,
      steered: {
        standRun: round(groundAttack(makeFighter, action, { from: 'stand', during: RIGHT }).travel - stand.travel, 3),
        standBack: round(groundAttack(makeFighter, action, { from: 'stand', during: LEFT }).travel - stand.travel, 3),
        runRun: round(groundAttack(makeFighter, action, { from: 'run', during: RIGHT }).travel - run.travel, 3),
        runBack: round(groundAttack(makeFighter, action, { from: 'run', during: LEFT }).travel - run.travel, 3),
      },
      restored: groundAttack(makeFighter, action, { from: 'run', during: RIGHT }).restored,
    };
  }
  const air = {};
  for (const { action, id } of attacksOf(c, probe, 'air')) {
    const free = airAttack(makeFighter, action, {});
    air[id] = {
      free,
      steered: {
        run: round(airAttack(makeFighter, action, RIGHT).end - free.end, 3),
        back: round(airAttack(makeFighter, action, LEFT).end - free.end, 3),
      },
    };
  }
  results.fighters[c.id] = { ground, air, dashAttack: dashAttack(makeFighter) };
}

const u = results.universal;
console.log(`reverse: ground ${u.reverseGroundSteps} steps, air ${u.reverseAirSteps} steps`);
console.log(`dashes / 10 s: ${u.dashesIn10s}`);
for (const [id, f] of Object.entries(results.fighters)) {
  console.log(`\n#${id}  dash → Attack 1: ${f.dashAttack.start} → ${f.dashAttack.later} units/s`);
  console.log('  ground attack        step-in travel/rises | steered: stand run/back, run run/back | run → attack first/end travel | restored');
  for (const [atk, m] of Object.entries(f.ground)) {
    const st = m.steered;
    console.log(
      `  ${atk.padEnd(20)} ${`${m.stand.travel}/${m.stand.rises}`.padStart(19)}` +
      ` | ${`${st.standRun}/${st.standBack}, ${st.runRun}/${st.runBack}`.padStart(30)}` +
      ` | ${`${m.run.first}/${m.run.end} ${m.run.travel}`.padStart(25)} | ${m.restored}`,
    );
  }
  for (const [atk, m] of Object.entries(f.air)) {
    console.log(`  ${atk.padEnd(20)} air drift ${m.free.before} → ${m.free.end}; steered: run ${m.steered.run}, back ${m.steered.back}`);
  }
}

const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(results, null, 2));
