// Run with node --test tests/systems/momentum.test.mjs (no dependencies).
// Momentum is state worth keeping: a legal change of action never throws
// away the speed the fighter has. Run → jump, Dash → jump, Dash → attack,
// attack → jump, attack → Dash, the air jump, air dash → aerial, landing,
// the impact freeze and overspeed, each checked for every playable fighter
// on the real Fighter, physics and combat (see
// tests/helpers/fighter-harness.mjs). Only real forces change it: a hit,
// a wall, a move whose own mechanic redirects the body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playableCharacters, getCharacter } from '../../js/data/characters.js';
import { CONFIG } from '../../js/config.js';
import { DT, MOVEMENT, harnessFor } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const JUMP = P('jump');
const RIGHT = { runRight: true };
const LEFT = { runLeft: true };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const mv = MOVEMENT;
// The steps a Dash commits to before an attack or a jump may cut it short.
const COMMIT = Math.ceil(mv.dashCancelTime / DT - 1e-9);

// The ordinary (no motion of its own) ground and air attacks a fighter has
// on a numbered button, by button.
function ordinary(c, f) {
  const out = [];
  for (const [action, mapping] of Object.entries(c.actions)) {
    if (!mapping?.ground) continue;
    const ground = f.attacks[mapping.ground];
    const air = f.attacks[mapping.air];
    out.push({ action, ground: ground && !ground.motion ? ground : null, air: air && !air.motion ? air : null });
  }
  return out;
}

for (const c of playableCharacters()) {
  const { makeFighter, duel } = harnessFor(c);
  const name = c.displayName;

  // A fighter running right at top speed.
  const running = (opts) => {
    const f = makeFighter(opts);
    for (let i = 0; i < 20; i++) f.step(RIGHT);
    assert.equal(f.fighter.body.vx, mv.maxSpeed);
    return f;
  };
  // A fighter `n` steps into a Dash to the right.
  const dashing = (n = COMMIT) => {
    const f = makeFighter({ x: 300 });
    f.step({ ...RIGHT, runRightPressed: true });
    f.step({});
    f.step({ ...RIGHT, mouvementRightPressed: true });
    for (let i = 0; i < n; i++) f.step({});
    assert.ok(f.fighter.dash, 'still dashing');
    return f;
  };

  test(`${name}: run → jump keeps the whole run; Dash → jump keeps the whole Dash, never snapped to top speed`, () => {
    const run = running();
    run.step({ ...RIGHT, ...JUMP });
    assert.equal(run.fighter.grounded, false);
    assert.equal(run.fighter.body.vx, mv.maxSpeed, 'the run\'s speed, all of it');
    const dash = dashing();
    dash.step(JUMP);
    assert.equal(dash.fighter.grounded, false, 'the jump cut the Dash short');
    assert.equal(dash.fighter.dash, null);
    assert.equal(dash.fighter.body.vx, mv.dashSpeed, 'the Dash\'s speed, all of it');
    // Then it bleeds off smoothly in the air (the Dash's burst), never at once.
    let prev = dash.fighter.body.vx;
    while (dash.fighter.body.vx > mv.maxSpeed) {
      dash.step(RIGHT);
      const d = prev - dash.fighter.body.vx;
      assert.ok(d > 0 && d <= mv.airOverspeedDeceleration * DT + 1e-9, `eases by ${d}`);
      prev = dash.fighter.body.vx;
    }
  });

  test(`${name}: a Dash commits to a moment of itself, then an attack cuts it short keeping its speed`, () => {
    for (const { action, ground } of ordinary(c, makeFighter().fighter)) {
      if (!ground || ground.projectile) continue;
      const { fighter, step } = dashing(0);
      step(P(action));
      assert.equal(fighter.combat.attack, null, 'not in the Dash\'s first steps: the press is kept');
      let n = 1;
      while (!fighter.combat.attack && n < 20) { step({}); n++; }
      assert.equal(fighter.combat.attack?.def.id, ground.id, `${action}: out as the cancel window opens`);
      assert.equal(n, COMMIT);
      assert.equal(fighter.dash, null);
      // Its momentum share of the Dash's speed, then one step of the
      // overspeed brake: far beyond top speed.
      const kept = mv.dashSpeed * ground.momentum;
      assert.ok(close(fighter.body.vx, kept - Math.max(mv.overspeedDeceleration, mv.deceleration * ground.friction) * DT),
        `${action}: ${fighter.body.vx} from ${kept}`);
      if (ground.momentum >= 1) assert.ok(fighter.body.vx > 2 * mv.maxSpeed, `${action}: a Dash attack, not a standing one`);
    }
  });

  test(`${name}: air dash → aerial keeps the air dash's speed (its airMomentum share), never snapped to top speed`, () => {
    for (const { action, air } of ordinary(c, makeFighter().fighter)) {
      if (!air) continue;
      const { fighter, step } = makeFighter({ x: 300 });
      step(JUMP);
      for (let i = 0; i < 6; i++) step({});
      step({ mouvementRightPressed: true });
      assert.equal(fighter.dash?.air, true);
      for (let i = 0; i < COMMIT; i++) step({});
      step(P(action));
      assert.equal(fighter.combat.attack?.def.id, air.id, action);
      assert.ok(fighter.body.vx >= mv.airDashSpeed * air.airMomentum - mv.airOverspeedDeceleration * DT - 1e-9,
        `${action}: ${fighter.body.vx}`);
      assert.ok(fighter.body.vx > mv.maxSpeed, `${action}: still faster than a run`);
    }
    // And air dash → air jump: the jump cuts it short, its speed carried on.
    const { fighter, step } = makeFighter({ x: 300 });
    step(JUMP);
    for (let i = 0; i < 25; i++) step({});
    step({ mouvementRightPressed: true });
    for (let i = 0; i < COMMIT; i++) step({});
    step(JUMP);
    assert.equal(fighter.dash, null);
    assert.ok(fighter.body.vy < 0, 'an air jump');
    assert.ok(fighter.body.vx > mv.airDashSpeed - mv.airOverspeedDeceleration * DT - 1e-9, 'at the air dash\'s speed');
  });

  test(`${name}: an air jump keeps the horizontal speed it finds; steering the other way bends it, never flips it`, () => {
    for (const vx of [mv.maxSpeed, 900, -650]) {
      const { fighter, step } = makeFighter();
      step(JUMP);
      for (let i = 0; i < 12; i++) step({});
      fighter.body.vx = vx;
      step({ ...JUMP, ...(vx > 0 ? RIGHT : LEFT) });
      assert.ok(fighter.body.vy < 0 && fighter.airJumps === mv.airJumps - 1, 'an air jump');
      const steered = vx > mv.maxSpeed ? vx - mv.airDeceleration * DT : vx;
      assert.ok(Math.abs(fighter.body.vx - steered) < 1e-9 || Math.abs(fighter.body.vx) >= Math.abs(vx) - mv.airDeceleration * DT,
        `${vx}: kept (${fighter.body.vx})`);
    }
    // Moving right fast, air-jumping with left held: the speed bends round
    // step by step at the air's turn, never a jump to the other way.
    const { fighter, step } = makeFighter();
    step(JUMP);
    for (let i = 0; i < 12; i++) step({});
    fighter.body.vx = 600;
    const log = [fighter.body.vx];
    step({ ...JUMP, ...LEFT });
    log.push(fighter.body.vx);
    for (let i = 0; i < 12; i++) log.push(step(LEFT).body.vx);
    const hardest = mv.airAcceleration * mv.airTurnBoost * DT + 1e-9;
    for (let i = 1; i < log.length; i++) assert.ok(log[i - 1] - log[i] <= hardest, `step ${i}: ${log[i - 1]} → ${log[i]}`);
    assert.ok(close(log[1], 600 - mv.airAcceleration * mv.airTurnBoost * DT), 'the air jump step: one step of air steering, nothing more');
    assert.ok(log.at(-1) < 0, 'and air control turns it round');
  });

  test(`${name}: a hit-cancel keeps momentum: attack → jump keeps the attack's speed; attack → Dash goes the Dash's way at its speed`, () => {
    for (const cut of ['jump', 'dash']) {
      const d = duel({ gap: 44, x: 500 });
      d.tick(P('attack1'));
      d.until(() => d.attacker.combat.cancellable, 60);
      const atk = d.attacker.combat.attack;
      d.attacker.body.vx = 300;
      if (cut === 'jump') {
        d.tick(JUMP);
        assert.notEqual(d.attacker.combat.attack, atk, 'cut short');
        assert.ok(d.attacker.body.vy < 0);
        // The step's own ground movement (the attack's friction) ran before
        // the jump took off; the jump itself takes nothing.
        assert.ok(close(d.attacker.body.vx, 300 - mv.deceleration * atk.def.friction * DT), `its speed carried into the air (${d.attacker.body.vx})`);
      } else {
        d.tick({ mouvementLeftPressed: true });
        assert.equal(d.attacker.dash?.direction, -1);
        assert.equal(d.attacker.facing, -1, 'facing the Dash');
        assert.equal(d.attacker.body.vx, -mv.dashSpeed, 'the Dash\'s way, at its speed');
      }
    }
  });

  test(`${name}: landing keeps the speed it lands with; a jump, an attack or a Dash pressed just before touchdown comes out at once`, () => {
    // Falling fast to the right: the touchdown step leaves the speed as the
    // air left it, then the ground's rules carry on from it.
    const fall = (held, press, spend = () => {}) => {
      const f = makeFighter({ x: 300 });
      f.step(JUMP);
      while (f.fighter.body.vy < 0) f.step({});
      while (f.fighter.body.y < 800 - 60) f.step(held);
      // Just before touchdown, a Dash's burst of its own.
      f.fighter.body.vx = 750;
      f.fighter.burst = true;
      spend(f.fighter);
      if (press) f.step({ ...held, ...press });
      let vxAir = f.fighter.body.vx;
      while (!f.fighter.grounded) {
        vxAir = f.fighter.body.vx;
        f.step(held);
      }
      return { ...f, vxAir };
    };
    const land = fall(RIGHT);
    assert.equal(land.fighter.body.landed, true);
    const landed = land.fighter.body.vx;
    assert.ok(landed > mv.maxSpeed, `landed at ${landed}: carried on`);
    assert.ok(land.vxAir - landed <= mv.airOverspeedDeceleration * DT + 1e-9, 'one step of air drag at most');
    land.step(RIGHT);
    assert.ok(close(land.fighter.body.vx, landed - mv.overspeedHoldDeceleration * DT), 'then the gentle held rate');
    // High-speed landing → immediate jump: the press made in the air (its
    // triple jump spent) jumps on touchdown, with the speed it landed with.
    const hop = fall(RIGHT, JUMP, (f) => { f.airJumps = 0; });
    hop.step(RIGHT);
    assert.ok(hop.fighter.body.vy < 0 && !hop.fighter.grounded, 'jumped again at once');
    assert.ok(hop.fighter.body.vx > mv.maxSpeed, `still fast: ${hop.fighter.body.vx}`);
    // ...an attack its aerial cannot answer (cooling down): its ground
    // version, the step after touchdown, keeping the speed.
    const hit = fall(RIGHT, P('attack1'), (f) => f.combat.cooldowns.set(c.actions.attack1.air, 1));
    if (hit.fighter.combat.attack?.def.id !== c.actions.attack1.ground) hit.step(RIGHT);
    assert.equal(hit.fighter.combat.attack?.def.id, c.actions.attack1.ground, 'a ground attack straight off the landing');
    assert.ok(hit.fighter.body.vx > mv.maxSpeed, 'with the landing\'s speed');
    // ...a Dash, its air dash spent.
    const dash = fall(RIGHT, { mouvementRightPressed: true }, (f) => { f.airDashes = 0; });
    let n = 0;
    while (!dash.fighter.dash && n < 3) { dash.step(RIGHT); n++; }
    assert.equal(dash.fighter.dash?.air, false, 'a ground Dash');
    assert.ok(n <= 1, `on the first grounded step (${n})`);
  });

  test(`${name}: an aerial whose recovery reaches the ground is over on touchdown; the land pose never holds anyone`, () => {
    const f = makeFighter();
    const air = ordinary(c, f.fighter).find((o) => o.air && !o.air.motion)?.air;
    if (air) {
      const plain = { ...c, attacks: { ...c.attacks, [air.id]: { ...c.attacks[air.id], motion: undefined } } };
      const low = harnessFor(plain).makeFighter();
      low.step(JUMP);
      while (low.fighter.body.vy < 0 || low.fighter.body.y < 790) low.step({});
      const press = Object.keys(c.actions).find((a) => c.actions[a]?.air === air.id);
      low.step(P(press));
      const atk = low.fighter.combat.attack;
      assert.equal(atk?.def.id, air.id);
      while (!low.fighter.grounded) low.step({});
      while (low.fighter.combat.attack === atk && low.fighter.combat.phase !== 'recovery') low.step({});
      assert.notEqual(low.fighter.combat.attack, atk, 'its recovery is not played out on the ground');
      assert.ok(low.fighter.canAct(), 'free on touchdown');
    }
    // With or without land art, the step after touchdown is free and a held
    // direction is a run at once.
    const { fighter, step } = makeFighter();
    step(JUMP);
    while (!fighter.grounded) step(RIGHT);
    assert.equal(fighter.state, 'run', 'running straight out of the landing');
    assert.ok(fighter.canAct());
  });

  test(`${name}: the impact freeze stops the body without losing its speed: after it, exactly the same velocity`, () => {
    // A Dash attack into the opponent, from whichever distance lands it
    // fast: still well over top speed when it strikes.
    let d = null;
    for (let gap = 80; gap <= 260 && !d; gap += 10) {
      const run = duel({ gap, x: 400 });
      run.tick({ ...RIGHT, runRightPressed: true });
      run.tick({});
      run.tick({ ...RIGHT, mouvementRightPressed: true });
      run.tick(P('attack1'));
      for (let i = 0; i < 30 && !(run.attacker.combat.hitstop > 0); i++) run.tick({});
      if (run.attacker.combat.hitstop > 0 && run.attacker.body.vx > mv.maxSpeed) d = run;
    }
    assert.ok(d, 'a Dash attack that lands at speed');
    const vx = d.attacker.body.vx;
    const vy = d.attacker.body.vy;
    const x = d.attacker.body.x;
    assert.ok(vx > mv.maxSpeed, `struck at speed (${vx})`);
    let frozen = 0;
    // Every step it is still frozen after: not a unit moved, not a unit of
    // speed lost.
    for (d.tick(RIGHT); d.attacker.combat.hitstop > 0; d.tick(RIGHT)) {
      frozen++;
      assert.equal(d.attacker.body.vx, vx, 'held, not lost');
      assert.equal(d.attacker.body.vy, vy);
      assert.equal(d.attacker.body.x, x);
    }
    // The step the freeze ends it picks up from exactly that speed: one
    // step of its attack's own movement, nothing more.
    const atk = d.attacker.combat.attack;
    const brake = Math.max(mv.overspeedDeceleration, mv.deceleration * (atk?.def.friction ?? 1)) * DT;
    assert.ok(Math.abs(vx - d.attacker.body.vx) <= brake + 1e-9, `resumed at ${d.attacker.body.vx} from ${vx}`);
    assert.ok(frozen >= 0);
  });

  test(`${name}: above top speed a change of state never clamps the speed: it bleeds off at a rate`, () => {
    // The Dash running out into a held run, a let-go slide, a Shield, a
    // jump and back down: each step's change bounded by the harshest rate
    // that applies, and the held run settles at top speed, never below.
    for (const held of [RIGHT, {}, { shield: true }]) {
      const { fighter, step } = dashing(0);
      const log = [];
      for (let i = 0; i < 40; i++) log.push(step(held).body.vx);
      const harshest = Math.max(mv.overspeedDeceleration, mv.deceleration) * DT + 1e-9;
      for (let i = 1; i < log.length; i++) {
        const d = log[i - 1] - log[i];
        assert.ok(d >= -1e-9 && d <= harshest, `${JSON.stringify(held)} step ${i}: ${log[i - 1]} → ${log[i]}`);
      }
      if (held === RIGHT) assert.equal(log.at(-1), mv.maxSpeed);
      void fighter;
    }
  });
}

test('holding the way it goes keeps a Dash\'s speed far longer than letting go; pressing back turns it round fastest', () => {
  const c = getCharacter('0001');
  const after = (held) => {
    const { fighter, step } = harnessFor(c).makeFighter({ x: 300 });
    step({ ...RIGHT, runRightPressed: true });
    step({});
    step({ ...RIGHT, mouvementRightPressed: true });
    while (fighter.dash) step({});
    const x = fighter.body.x;
    let n = 0;
    while (fighter.body.vx > mv.maxSpeed && n < 120) { step(held); n++; }
    return { steps: n, distance: fighter.body.x - x };
  };
  const hold = after(RIGHT);
  const letGo = after({});
  const back = after(LEFT);
  assert.ok(hold.steps > letGo.steps * 1.8, `held ${hold.steps} steps vs let go ${letGo.steps}`);
  assert.ok(hold.distance > letGo.distance * 1.8, `held ${hold.distance.toFixed(0)} vs let go ${letGo.distance.toFixed(0)}`);
  assert.ok(back.steps < letGo.steps, `pressed back ${back.steps} steps`);
});

test('a launch\'s speed is not a burst: it flies on under the air drag, so momentum rules never weaken a launch', () => {
  const { fighter, step } = harnessFor(getCharacter('0002')).makeFighter();
  step(JUMP);
  fighter.burst = false;
  fighter.body.vx = 1100;
  step({});
  assert.ok(close(fighter.body.vx, 1100 - mv.airDeceleration * DT), 'the drag only');
  // A hit ends any burst of the fighter's own.
  fighter.burst = true;
  fighter.takeHit({ launchSpeed: 0 });
  assert.equal(fighter.burst, false);
  assert.equal(CONFIG.sim.gravity, 2500);
});
