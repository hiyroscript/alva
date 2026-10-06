// Run with node --test tests/fighters/0001/moves-0001.test.mjs (no dependencies).
// #0001's moves in play, each one's mechanic as well as its hit: the Jab
// and its follow-ups, the Floating Straight and the High Kick standing on
// the air, Red blasting, shoving a Shield and turning projectiles back, the
// Red Kick locking on, Maximum Blue dragging its target in and grinding
// it, Blue yanking an opponent to its palm, Unlimited Void's sure hit and
// paralysis, Hollow Purple's chant and its sphere erasing and passing
// through everything, and Infinity stalling the blows it blocks. Runs the
// real Fighter, projectiles, pulls and CombatSystem (see
// tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, MOVEMENT, duel, fakeSpritesOf, makeFighter, steps } from '../../helpers/fighter-harness.mjs';
import { getCharacter } from '../../../js/data/characters.js';
import { LAUNCH_UNIT_SPEED as U } from '../../../js/data/launch.js';

const DEF = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const SHIELD = { shield: true, shieldPressed: true };
const HOLD = { shield: true };
const A = DEF.attacks;

// #0001 on its own, and against a target (#0001 unless given) at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, ...opts });
const versus = (opts = {}) => duel({ attackerCharacter: DEF, ...opts });
// Up in the air, rising well clear of the ground.
const airborne = (step, rise = 10) => {
  step(P('jump'));
  for (let i = 0; i < rise; i++) step({});
};
// The target raises its Shield and holds it past the perfect window.
const raise = (d) => {
  d.tick({}, SHIELD);
  for (let i = 0; i < steps(d.target.defense.perfectWindow) + 2; i++) d.tick({}, HOLD);
};
// Ticks until `pred` holds, with `held` and `targetHeld` every step.
const tickUntil = (d, pred, held = {}, targetHeld = {}, limit = 240) => {
  for (let i = 0; i < limit && !pred(); i++) d.tick(held, targetHeld);
  assert.ok(pred(), 'condition never reached');
};

// ---- The Jab ------------------------------------------------------------------------

test('the Jab lands on its third frame for 2, pushing the target away (Base Launch 1 sideways)', () => {
  const d = versus({ gap: 40 });
  d.target.combat.launchPoint = 30;
  d.tick(P('attack1'));
  let n = 1;
  while (!d.events.length && n < 30) { d.tick(); n++; }
  assert.equal(n, steps(A.attack1.startup) + 1, 'out after its two wind-up frames');
  const [e] = d.events;
  assert.equal(e.move, 'attack1');
  assert.equal(e.damage, 2);
  assert.deepEqual({ ...e.finalLaunch }, { x: 32 * U, y: 0 });
});

test('a Jab that hits can be cut short into another Jab or a High Kick; one that whiffs cannot', () => {
  for (const next of ['attack1', 'extra_attack']) {
    const d = versus({ gap: 40 });
    d.tick(P('attack1'));
    tickUntil(d, () => d.events.length > 0);
    const first = d.attacker.combat.attack;
    tickUntil(d, () => d.attacker.combat.cancellable, {}, {}, 20);
    // Into itself only once its own cooldown has run since it opened.
    for (let i = 0; i < 20 && d.attacker.combat.attack === first; i++) d.tick(P(next));
    assert.notEqual(d.attacker.combat.attack, first, `${next}: the Jab cut short`);
    assert.equal(d.attacker.combat.attack?.def.id, next, `${next} straight out of the Jab`);
  }
  const whiff = solo();
  whiff.step(P('attack1'));
  for (let i = 0; i < steps(A.attack1.startup + A.attack1.active); i++) whiff.step({});
  whiff.step(P('extra_attack'));
  assert.equal(whiff.fighter.combat.attack?.def.id, 'attack1', 'still in its own recovery');
});

test('a running Jab carries the run on through it, never braked, never steered', () => {
  const { fighter, step } = solo({ x: 300 });
  for (let i = 0; i < 40; i++) step({ runRight: true });
  const speed = fighter.body.vx;
  assert.equal(speed, MOVEMENT.maxSpeed, 'a full run');
  step({ runRight: true, ...P('attack1') });
  assert.equal(fighter.combat.attack?.def.id, 'attack1');
  assert.equal(fighter.body.vx, speed, 'all of the run carried in');
  step({ runLeft: true });
  assert.equal(fighter.body.vx, speed, 'held back the other way: no steering, no braking');
  while (fighter.combat.attack) {
    step({});
    if (fighter.combat.attack) assert.equal(fighter.body.vx, speed, 'carried on to its last frame');
  }
});

// ---- Standing on the air -------------------------------------------------------------

test('the Floating Straight stands on the air while it strikes: no fall, twice per airtime', () => {
  const { fighter, step } = solo();
  airborne(step);
  step(P('attack1'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack1');
  const y = fighter.body.y;
  while (fighter.combat.attack) {
    step({});
    if (fighter.combat.attack) assert.equal(fighter.body.vy, 0, 'standing on the air');
  }
  assert.ok(Math.abs(fighter.body.y - y) < 1, 'where it began');
  for (let i = 0; i < steps(A.midair_attack1.cooldown); i++) step({});
  step(P('attack1'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack1', 'a second one');
  while (fighter.combat.attack) step({});
  for (let i = 0; i < steps(A.midair_attack1.cooldown); i++) step({});
  assert.equal(fighter.body.grounded, false);
  step(P('attack1'));
  assert.equal(fighter.combat.attack, null, 'not a third before it lands');
  while (!fighter.body.grounded) step({});
  for (let i = 0; i < 10; i++) step({});
  airborne(step);
  step(P('attack1'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack1', 'landing gives them back');
});

test('the High Kick: a leap in, then 4 and Base Launch 2 straight up; in the air it stands on the air, once', () => {
  const d = versus({ gap: 50 });
  d.target.combat.launchPoint = 25;
  d.tick(P('extra_attack'));
  let leap = 0;
  for (let i = 0; i < 20 && !d.events.length; i++) {
    d.tick();
    leap = Math.max(leap, d.attacker.body.vx);
  }
  // Raised to the step's speed on frame 2, its lunge fading from there.
  const fade = MOVEMENT.overspeedHoldDeceleration * DT;
  assert.ok(leap >= A.extra_attack.step.speed - fade - 1e-9 && leap <= A.extra_attack.step.speed, `the leap in on frame 2 (${leap})`);
  const [e] = d.events;
  assert.equal(e.damage, 4);
  assert.deepEqual({ ...e.finalLaunch }, { x: 0, y: -58 * U });
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  while (fighter.combat.attack) {
    step({});
    if (fighter.combat.attack) assert.equal(fighter.body.vy, 0);
  }
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'once per airtime');
});

// ---- Red ------------------------------------------------------------------------------

test('Red leaves the palms on frame 4 and flies 600 units/s for about 300 units', () => {
  const { fighter, step } = solo();
  step(P('attack2'));
  let n = 1;
  while (!fighter.releases.length && n < 30) { step({}); n++; }
  assert.equal(n, steps(A.attack2.projectile.spawnAt) + 1, 'on the step its time crosses spawnAt (the press step counted)');
  assert.deepEqual(fighter.releases[0], { id: 'attack2_object', offset: { x: 44, y: -70 }, direction: 1 });
  const orb = DEF.projectiles.attack2_object;
  assert.equal(orb.speed, 600);
  assert.ok(Math.abs(orb.speed * orb.lifetime - 300) < 1);
});

test('Red pushes its target away: 2 and Base Launch 1 along its flight', () => {
  const d = versus({ gap: 200 });
  d.target.combat.launchPoint = 46;
  d.tick(P('attack2'));
  tickUntil(d, () => d.events.length > 0, {}, {}, 60);
  const [e] = d.events;
  assert.equal(e.move, 'attack2_object');
  assert.equal(e.damage, 2);
  assert.deepEqual({ ...e.finalLaunch }, { x: 48 * U, y: 0 });
  // Thrown on the run, the orb still pushes by its own launch alone: a
  // projectile passes on no run (only a fighter's own strike does).
  const run = versus({ gap: 260 });
  run.attacker.body.vx = MOVEMENT.maxSpeed;
  run.tick(P('attack2'));
  tickUntil(run, () => run.events.length > 0, {}, {}, 60);
  assert.equal(run.events[0].move, 'attack2_object');
  assert.equal(run.events[0].carried, 0);
});

test('a Shield that blocks Red is shoved back 520 units/s, and pays for it', () => {
  const d = versus({ gap: 200 });
  raise(d);
  const energy = d.target.combat.energy;
  d.tick(P('attack2'), HOLD);
  tickUntil(d, () => d.events.length > 0, {}, HOLD, 60);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.target.body.vx, DEF.projectiles.attack2_object.blockPush, 'shoved along Red\'s flight');
  assert.ok(d.target.combat.energy < energy);
  const x = d.target.body.x;
  for (let i = 0; i < steps(0.4); i++) d.tick({}, HOLD);
  assert.ok(d.target.body.x > x + 10, `it gave ground (${(d.target.body.x - x).toFixed(1)})`);
  assert.equal(d.target.combat.shielding, true, 'its guard held');
});

test('Red turns the other fighter\'s projectile around: #0001\'s from then on, flying back at its thrower', () => {
  // #0002 sends its Whirlwind; #0001 answers with Red as it comes.
  const d = versus({ gap: 420, targetCharacter: DEF_0002, targetSprites: fakeSpritesOf(DEF_0002) });
  d.tick({}, P('extra_attack'));
  tickUntil(d, () => d.projectiles.some((p) => p.owner === d.target), {}, {}, 60);
  const whirlwind = d.projectiles.find((p) => p.owner === d.target);
  d.tick(P('attack2'));
  tickUntil(d, () => whirlwind.owner === d.attacker || !whirlwind.alive, {}, {}, 60);
  assert.equal(whirlwind.owner, d.attacker, 'turned: #0001\'s now');
  assert.equal(whirlwind.direction, 1, 'back the way Red flies');
  tickUntil(d, () => d.events.some((e) => e.projectile === whirlwind), {}, {}, 120);
  const back = d.events.find((e) => e.projectile === whirlwind);
  assert.equal(back.target, d.target, 'its own Whirlwind strikes #0002');
  assert.equal(back.attacker, d.attacker, 'credited to #0001');
});

// ---- The Red Kick ------------------------------------------------------------------------

test('the Red Kick hangs for its lock-on, flies at its opponent re-aimed every step, blasts it and springs off', () => {
  const d = versus({ gap: 150 });
  d.attacker.body.y -= 60;
  d.attacker.body.grounded = false;
  d.attacker.body.ground = null;
  d.target.combat.launchPoint = 30;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  for (let i = 1; i < steps(A.midair_attack2.startup); i++) {
    d.tick();
    assert.equal(d.attacker.body.vy, 0, 'hanging');
  }
  tickUntil(d, () => d.events.length > 0, {}, {}, 30);
  const [e] = d.events;
  assert.equal(e.move, 'midair_attack2');
  assert.equal(e.damage, 3);
  assert.ok(e.finalLaunch.x > 0, 'blasted away');
  d.tick();
  assert.ok(d.attacker.body.vy < 0, 'springs up off it');
  assert.ok(d.attacker.body.vx < 0, 'and back');
});

// ---- Maximum Blue ------------------------------------------------------------------------

test('Maximum Blue drags a target into itself and grinds it: three strikes 0.25 s apart, the last its collapse upward', () => {
  const d = versus({ gap: 300 });
  d.target.combat.launchPoint = 20;
  d.tick(P('attack3'));
  tickUntil(d, () => d.projectiles.length === 1, {}, {}, 30);
  const orb = d.projectiles[0];
  assert.equal(orb.def.id, 'attack3_object');
  const x0 = d.target.body.x;
  tickUntil(d, () => d.target.body.x < x0 - 5, {}, {}, 60);
  assert.equal(d.events.length, 0, 'drawn toward the orb before it arrives');
  // Each strike, and the step it landed on.
  const at = [];
  for (let n = 0; n < steps(1.5) && at.length < 3; n++) {
    const before = d.events.length;
    d.tick();
    if (d.events.length > before) at.push(n);
  }
  const hits = d.events.filter((e) => e.projectile === orb);
  assert.deepEqual(hits.map((e) => e.damage), [1, 1, 2]);
  assert.deepEqual(at.slice(1).map((n, i) => n - at[i]), [15, 15], '0.25 s apart');
  assert.ok(hits.slice(0, 2).every((e) => e.launchSpeed === 0), 'the grinding launches nothing');
  assert.ok(hits[2].finalLaunch.y < 0 && hits[2].finalLaunch.x === 0, 'the collapse pops it upward');
  assert.equal(orb.alive, false, 'spent');
});

test('a raised Shield is not drawn in by Maximum Blue, and blocking it ends the orb', () => {
  const d = versus({ gap: 260 });
  raise(d);
  const x = d.target.body.x;
  d.tick(P('attack3'), HOLD);
  tickUntil(d, () => d.events.length > 0, {}, HOLD, 180);
  assert.equal(d.events[0].type, 'block');
  assert.ok(Math.abs(d.target.body.x - x) < 1, 'it held its ground');
  d.tick({}, HOLD);
  assert.deepEqual(d.projectiles, [], 'one blocked strike and the orb is gone');
});

// ---- Blue ---------------------------------------------------------------------------------

test('Blue yanks an opponent in to its palm and strikes it upward, standing on the air', () => {
  const d = versus({ gap: 150 });
  d.attacker.body.y -= 30;
  d.attacker.body.grounded = false;
  d.attacker.body.ground = null;
  d.target.body.y -= 30;
  d.target.body.grounded = false;
  d.target.body.ground = null;
  d.tick(P('attack3'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack3');
  tickUntil(d, () => d.events.length > 0, {}, {}, 20);
  const [e] = d.events;
  assert.equal(e.move, 'midair_attack3');
  assert.equal(e.damage, 2);
  assert.ok(e.finalLaunch.y < 0 && e.finalLaunch.x === 0, 'up');
  // Out of the pull's reach: nothing.
  const far = versus({ gap: 320 });
  far.attacker.body.y -= 30;
  far.attacker.body.grounded = false;
  far.attacker.body.ground = null;
  far.tick(P('attack3'));
  for (let i = 0; i < 20; i++) far.tick();
  assert.deepEqual(far.events, []);
});

// ---- Unlimited Void -------------------------------------------------------------------------

test('Unlimited Void: half a second of cast, then a sure hit round #0001 that no Shield stops, paralyzing for 1.7 s', () => {
  const d = versus({ gap: 200 });
  raise(d);
  d.tick(P('attack4'), HOLD);
  const t = d.attacker.technique;
  assert.equal(t?.action, 'attack4');
  assert.equal(t.castDuration, 0.5);
  tickUntil(d, () => d.events.length > 0, {}, HOLD, 60);
  const [e] = d.events;
  assert.equal(e.type, 'hit', 'through the Shield');
  assert.equal(e.technique, t);
  assert.equal(e.damage, 3);
  assert.equal(e.energyCost, 0);
  assert.equal(e.paralysis, 1.7);
  assert.equal(d.target.combat.immobilized, true);
  // #0001 is free a third of a second later; its opponent is held a good
  // while longer.
  tickUntil(d, () => !d.attacker.technique, {}, {}, 60);
  assert.ok(d.target.combat.paralysis > 1.2, `still held (${d.target.combat.paralysis.toFixed(2)} s)`);
  assert.ok(d.attacker.combat.abilityCooldowns.remaining('attack4') > 12, 'a long cooldown');
});

test('the domain reaches 250 units either side and well over #0001\'s head, and no further', () => {
  for (const [gap, hit] of [[240, true], [-240, true], [300, false]]) {
    const d = versus({ gap: Math.abs(gap), attackerFacing: 1 });
    if (gap < 0) {
      d.target.body.x = d.attacker.body.x - 240;
      d.target.body.prevX = d.target.body.x;
    }
    d.tick(P('attack4'));
    for (let i = 0; i < steps(1.2); i++) d.tick();
    assert.equal(d.events.length > 0, hit, `at ${gap}`);
  }
  const up = versus({ gap: 60 });
  Object.assign(up.target.body, { y: up.attacker.body.y - 150, grounded: false, ground: null, gravityScale: 0 });
  up.tick(P('attack4'));
  for (let i = 0; i < steps(0.7); i++) { up.target.body.vy = 0; up.tick(); }
  assert.equal(up.events.length, 1, 'an opponent in the air over it is caught too');
});

test('a paralyzed opponent can be hit freely; the first hit that launches it sets it free', () => {
  const d = versus({ gap: 120 });
  d.tick(P('attack4'));
  tickUntil(d, () => d.target.combat.immobilized, {}, {}, 60);
  tickUntil(d, () => !d.attacker.technique, {}, {}, 60);
  // Walk in and stop (a kick keeps a run's speed: it would carry #0001
  // past), then kick.
  for (let i = 0; i < 20 && d.target.body.x - d.attacker.body.x > 45; i++) d.tick({ runRight: true });
  tickUntil(d, () => d.attacker.body.vx === 0, {}, {}, 20);
  d.target.combat.launchPoint = 0;
  const before = d.events.length;
  d.tick(P('extra_attack'));
  tickUntil(d, () => d.events.length > before, {}, {}, 20);
  const kick = d.events.at(-1);
  assert.equal(kick.target, d.target);
  assert.ok(kick.launchSpeed > 0, 'the High Kick launches');
  assert.equal(d.target.combat.immobilized, false, 'and the launch is never held back');
});

// ---- Hollow Purple ----------------------------------------------------------------------------

test('Hollow Purple: a five-sixths of a second chant, then the sphere through any Shield for 12 and Base Launch 3, flying on through', () => {
  const d = versus({ gap: 400 });
  raise(d);
  d.target.combat.launchPoint = 20;
  d.tick(P('attack5'), HOLD);
  const t = d.attacker.technique;
  assert.equal(t?.action, 'attack5');
  assert.ok(Math.abs(t.castDuration - 5 / 6) < 1e-9);
  let castSteps = 1;
  while (d.attacker.technique?.phase === 'cast') { d.tick({}, HOLD); castSteps++; }
  assert.equal(castSteps, steps(5 / 6) + 1);
  tickUntil(d, () => d.events.length > 0, {}, HOLD, 60);
  const [e] = d.events;
  assert.equal(e.type, 'hit', 'no Shield stops it');
  assert.equal(e.move, 'attack5_object');
  assert.equal(e.damage, 12);
  assert.deepEqual({ ...e.finalLaunch }, { x: 3 * 32 * U, y: 0 });
  assert.equal(e.projectile.alive, true, 'it flies on through');
  for (let i = 0; i < 30; i++) d.tick();
  assert.equal(d.events.filter((x) => x.projectile === e.projectile).length, 1, 'each fighter once');
});

test('Hollow Purple erases the projectiles it meets; a hit during the chant breaks it and nothing is cast', () => {
  const d = versus({ gap: 500, targetCharacter: DEF_0002, targetSprites: fakeSpritesOf(DEF_0002) });
  d.tick(P('attack5'));
  for (let i = 0; i < steps(0.7); i++) d.tick();
  d.tick({}, P('extra_attack'));
  tickUntil(d, () => d.projectiles.length === 2, {}, {}, 60);
  const whirlwind = d.projectiles.find((p) => p.owner === d.target);
  tickUntil(d, () => !whirlwind.alive, {}, {}, 120);
  assert.equal(whirlwind.owner, d.target, 'never turned: gone');
  assert.ok(d.projectiles.some((p) => p.def.id === 'attack5_object' && p.alive), 'the sphere flies on');
  // Broken mid-chant.
  const b = versus({ gap: 40 });
  b.tick(P('attack5'));
  const t = b.attacker.technique;
  b.tick({}, P('attack1'));
  tickUntil(b, () => !b.attacker.technique, {}, {}, 30);
  assert.equal(t.endReason, 'hit');
  assert.equal(t.released, false);
  for (let i = 0; i < steps(1.5); i++) b.tick();
  assert.ok(b.projectiles.every((p) => p.def.id !== 'attack5_object'), 'no sphere');
  assert.ok(b.attacker.combat.abilityCooldowns.active('attack5'), 'and the cooldown spent');
});

// ---- Infinity -------------------------------------------------------------------------------

test('Infinity stalls the blow it blocks: the attacker freezes 0.25 s, long enough for a Jab back', () => {
  // #0001 shields; its opponent (the attacker here) Jabs into it.
  const d = duel({ gap: 40 });
  raise(d);
  d.tick(P('attack1'), HOLD);
  tickUntil(d, () => d.events.length > 0, {}, HOLD, 20);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.events[0].stall, 0.25);
  assert.ok(Math.abs(d.attacker.combat.hitstop - 0.25) < 1e-9);
  // Let go and Jab back: it lands while the attacker is still frozen or
  // recovering.
  d.tick({}, {});
  while (d.target.combat.hitstop > 0 || d.target.combat.shieldStun > 0) d.tick({}, {});
  d.tick({}, P('attack1'));
  tickUntil(d, () => d.events.length > 1, {}, {}, 20);
  assert.equal(d.events[1].target, d.attacker, 'punished');
  assert.equal(d.events[1].type, 'hit');
});

test('Infinity is the ground\'s: in the air the Shield button is the Deflect\'s arm sweep, falling as ever', () => {
  const { fighter, step } = solo();
  const plain = solo();
  for (const r of [step, plain.step]) {
    r(P('jump'));
    while ((r === step ? fighter : plain.fighter).body.vy < 0) r({});
  }
  step(SHIELD);
  plain.step({});
  const shown = [];
  while (fighter.combat.attack) {
    assert.equal(fighter.combat.shielding, false, 'never Infinity');
    assert.equal(fighter.combat.attack.def.id, 'deflect');
    shown.push(fighter.animator.frame.url.split('/').pop());
    assert.equal(fighter.body.vy, plain.fighter.body.vy, 'falling exactly as a plain fall: no slow fall');
    step(HOLD);
    plain.step({});
  }
  assert.deepEqual([...new Set(shown)], ['0001_deflect_1.png', '0001_deflect_2.png', '0001_deflect_3.png', '0001_deflect_4.png']);
  assert.equal(shown.length, steps(DEF.deflect.startup + DEF.deflect.active + DEF.deflect.recovery), 'a third of a second');
});
