// Combat flow: the combat input buffer, hit-cancels (a connected attack's
// rest cut short by another attack or a jump), the combo routes they open
// at low Launch Point, how a higher Launch Point breaks them by launching
// the target further, a hit interrupting the target's own attack, and the
// Shield's transitions. Frame-exact, on the real Fighter, CombatSystem and
// physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { def, DT, makeFighter, duel } from './fighter-harness.mjs';

const mv = def.movement;
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const ATTACK1 = P('attack1');
const ATTACK2 = P('attack2');
const THROW = P('extra_attack');
const JUMP = P('jump');
const BUFFER_STEPS = Math.floor(mv.attackBuffer / DT + 1e-6);

// A duel whose target's every update is logged: `free[i]` is whether the
// target could act on step i (after its own update, before that step's
// hits), so a combo is exactly "never free between its hits".
function combo({ gap = 40, lp = 0, targetHeld = () => ({}) } = {}) {
  const d = duel({ gap, pushboxes: true });
  d.target.combat.launchPoint = lp;
  const free = [];
  const update = d.target.update.bind(d.target);
  d.target.update = (dt, ctx) => {
    update(dt, ctx);
    free.push(d.target.canAct());
  };
  const hits = []; // { step, move }
  let i = 0;
  const run = (script, steps = 90) => {
    for (let k = 0; k < steps; k++, i++) {
      const before = d.events.length;
      d.tick(script(i) ?? {}, targetHeld(i));
      for (const e of d.events.slice(before)) if (e.attacker === d.attacker && e.type === 'hit') hits.push({ step: i, move: e.move });
    }
    return hits;
  };
  // Whether the target never got to act between hit a and hit b.
  const held = (a, b) => free.slice(hits[a].step + 1, hits[b].step + 1).every((f) => !f);
  return { ...d, run, hits, free, held };
}

// ---- The combat input buffer ------------------------------------------------------

test('an attack pressed during a recovery comes out on the first step it can', () => {
  for (let early = 1; early <= BUFFER_STEPS; early++) {
    const { fighter, step } = makeFighter();
    step(ATTACK1);
    const total = Math.round(fighter.combat.attack.def.total / DT);
    let n = 1;
    while (n < total - early) {
      step({});
      n++;
    }
    step(ATTACK2);
    assert.equal(fighter.combat.attack.def.id, 'attack1', 'not while attack1 still plays');
    while (fighter.combat.attack?.def.id === 'attack1') step({});
    assert.equal(fighter.combat.attack?.def.id, 'attack2', `pressed ${early} step(s) early: out as attack1 ends`);
    assert.equal(fighter.combat.attack.time, 0, 'on that very step');
  }
});

test('a press older than the buffer never comes out: no ancient inputs', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK1);
  step(ATTACK2);
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(step({}).combat.attack?.def.id);
  assert.ok(!seen.has('attack2'), 'pressed far too early: dropped');
  assert.equal(fighter.bufferedAttack, null);
});

test('a press during a cooldown comes out as the cooldown ends; the latest press wins', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK1);
  while (fighter.combat.attack) step({});
  assert.ok(fighter.combat.cooldowns.has('attack1'));
  // Pressed inside the buffer's reach of the cooldown's end.
  while (fighter.combat.cooldowns.get('attack1') > mv.attackBuffer - 2 * DT) step({});
  step(ATTACK1);
  assert.equal(fighter.combat.attack, null, 'still cooling down');
  while (fighter.combat.cooldowns.has('attack1')) step({});
  assert.equal(fighter.combat.attack?.def.id, 'attack1', 'the step the cooldown is over');
  // Pressed as the attack ends, far longer before that than the buffer
  // keeps it: gone. (The Throw's cooldown outlasts the buffer.)
  const early = makeFighter();
  early.step(THROW);
  while (early.fighter.combat.attack) early.step({});
  assert.ok(early.fighter.combat.cooldowns.get('extra_attack') > mv.attackBuffer + 2 * DT);
  early.step(THROW);
  for (let i = 0; i < 30; i++) early.step({});
  assert.equal(early.fighter.combat.attack, null);

  const latest = makeFighter();
  latest.step(ATTACK1);
  while (latest.fighter.combat.attack.time < 3 / 12) latest.step({});
  latest.step(ATTACK2);
  latest.step(THROW);
  while (latest.fighter.combat.attack?.def.id === 'attack1') latest.step({});
  assert.equal(latest.fighter.combat.attack?.def.id, 'extra_attack');
});

test('only presses that could start are kept: never transform, an air Throw or an attack without art; charged presses never', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK1);
  step(P('transform'));
  assert.equal(fighter.bufferedAttack, null, 'reserved');
  const air = makeFighter();
  air.step(JUMP);
  air.step(ATTACK1);
  assert.equal(air.fighter.combat.attack?.def.id, 'midair_attack1');
  air.step(ATTACK2);
  air.step(THROW);
  assert.equal(air.fighter.bufferedAttack?.action, 'attack2', 'an air Throw never replaces it');
  // A attack3 press on its cooldown is used up, never kept for later.
  const d = duel({ gap: 600 });
  d.tick({ charge: true });
  d.tick({ charge: true, ...ATTACK1 });
  assert.ok(d.attacker.combat.chargedCooldowns.active('attack3'));
  d.tick({ charge: true, ...ATTACK1 });
  assert.equal(d.attacker.bufferedAttack, null);
  for (let i = 0; i < 20; i++) d.tick({});
  assert.equal(d.attacker.combat.attack, null, 'no attack1 later either');
});

test('presses made during an impact freeze are kept, and do not age through it', () => {
  const d = combo({ gap: 40 });
  d.run((i) => (i === 0 ? ATTACK1 : {}), 6);
  assert.equal(d.hits.length, 1);
  assert.ok(d.attacker.combat.hitstop > 0, 'frozen');
  d.run(() => ATTACK2, 1);
  const buffered = d.attacker.bufferedAttack;
  assert.equal(buffered?.action, 'attack2');
  while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
  assert.equal(d.attacker.combat.attack?.def.id, 'attack2', 'out as soon as the freeze is over');
});

test('a press while Shield holds the Shield up comes out the step the Shield is let go', () => {
  const { fighter, step } = makeFighter();
  step({ shield: true });
  step({ shield: true, ...ATTACK1 });
  assert.equal(fighter.combat.shielding, true);
  assert.equal(fighter.combat.attack, null);
  step({ shield: true });
  step({});
  assert.equal(fighter.combat.shielding, false);
  assert.equal(fighter.combat.attack?.def.id, 'attack1', 'Shield -> release -> attack, without delay');
});

test('buffered presses keep their order: jump then attack1 is a jump and an air attack1; together, the ground attack goes first', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK2);
  while (fighter.combat.attack.time < fighter.combat.attack.def.total - 5 * DT) step({});
  step(JUMP);
  step(ATTACK1);
  while (fighter.combat.attack?.def.id === 'attack2') step({});
  assert.equal(fighter.grounded, false, 'the jump first');
  assert.equal(fighter.combat.attack, null);
  step({});
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack1', 'then the attack, in the air');

  const same = makeFighter();
  same.step(ATTACK2);
  while (same.fighter.combat.attack.time < same.fighter.combat.attack.def.total - 5 * DT) same.step({});
  same.step({ ...JUMP, ...ATTACK1 });
  while (same.fighter.combat.attack?.def.id === 'attack2') same.step({});
  assert.equal(same.fighter.combat.attack?.def.id, 'attack1', 'on the ground');
});

// ---- Hit-cancels ------------------------------------------------------------------

test('an attack1 that hits may be cut short by attack2 the step its freeze ends; its cooldown starts then', () => {
  const d = combo({ gap: 40 });
  d.run((i) => (i === 0 ? ATTACK1 : i === 2 ? ATTACK2 : {}), 8);
  assert.equal(d.hits.length, 1);
  while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
  assert.equal(d.attacker.combat.attack?.def.id, 'attack2', 'cut short into attack2');
  assert.ok(d.attacker.combat.cooldowns.has('attack1'), 'attack1\'s cooldown from the cut');
});

test('a whiffed or blocked attack keeps its whole recovery: no cut short', () => {
  for (const blocked of [false, true]) {
    const d = combo({ gap: blocked ? 40 : 300, targetHeld: () => (blocked ? { shield: true } : {}) });
    d.run((i) => (i === 0 ? ATTACK1 : {}), 1);
    const atk = d.attacker.combat.attack;
    let n = 0;
    for (; d.attacker.combat.attack === atk; n++) d.run(() => ATTACK2, 1);
    const freeze = blocked ? Math.round(atk.def.hitstop / DT) : 0;
    assert.equal(n, Math.round(atk.def.total / DT) + freeze, blocked ? 'blocked: in full' : 'whiffed: in full');
    assert.equal(d.attacker.combat.attack?.def.id, 'attack2', 'then the buffered attack2');
  }
});

test('a jump or a Dash cuts a connected attack2 short; walking, the Shield and Charge never do', () => {
  const hitBa2 = () => {
    const d = combo({ gap: 40 });
    d.run((i) => (i === 0 ? ATTACK2 : {}), 16);
    assert.equal(d.hits.length, 1);
    while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
    assert.ok(d.attacker.combat.cancellable);
    return d;
  };
  const j = hitBa2();
  j.run(() => JUMP, 1);
  assert.equal(j.attacker.combat.attack, null);
  assert.equal(j.attacker.grounded, false, 'jumping after the launched target');

  for (const held of [{ runRight: true }, { shield: true }, { charge: true }]) {
    const d = hitBa2();
    const atk = d.attacker.combat.attack;
    d.run(() => held, 3);
    assert.equal(d.attacker.combat.attack, atk, `${Object.keys(held)[0]}: the attack plays on`);
  }
  const dash = hitBa2();
  dash.run((i) => (i % 2 ? {} : { runRight: true, runRightPressed: true }), 3);
  assert.ok(dash.attacker.dash, 'a double tap Dashes out of it');
  assert.equal(dash.attacker.combat.attack, null);
  assert.ok(dash.attacker.combat.cooldowns.has('attack2'), 'attack2\'s cooldown from the cut');
});

// ---- Dash cancel ----------------------------------------------------------------------

const MOUVEMENT_RIGHT = { runRight: true, mouvementRightPressed: true };
const MOUVEMENT_LEFT = { runLeft: true, mouvementLeftPressed: true };

test('a Dash cancel: out of an attack1 that hit, either way, for dashCancelCost instead of dashCost', () => {
  const energy = def.energy;
  assert.ok(energy.dashCancelCost > energy.dashCost);
  for (const [press, direction] of [[MOUVEMENT_RIGHT, 1], [MOUVEMENT_LEFT, -1]]) {
    const d = combo({ gap: 40 });
    d.run((i) => (i === 0 ? ATTACK1 : {}), 6);
    assert.ok(d.attacker.combat.hitstop > 0, 'the hit\'s freeze');
    d.run(() => press, 1);
    assert.equal(d.attacker.dash, null, 'never during it...');
    assert.equal(d.attacker.combat.energy, 100);
    while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
    assert.equal(d.attacker.dash?.direction, direction, '...but asked for in it, out the step it ends');
    assert.equal(d.attacker.facing, direction, 'facing the Dash');
    assert.equal(d.attacker.combat.attack, null);
    assert.ok(d.attacker.combat.cooldowns.has('attack1'));
    assert.equal(d.attacker.combat.energy, 100 - energy.dashCancelCost);
  }
  // A plain Dash still costs its own price.
  const { fighter, step } = makeFighter();
  step(MOUVEMENT_RIGHT);
  assert.ok(fighter.dash);
  assert.equal(fighter.combat.energy, 100 - energy.dashCost);
});

test('no Dash cancel out of a whiff, a block, an aerial or while exhausted: nothing is spent and the attack plays on', () => {
  const tryCancel = (d, what) => {
    const atk = d.attacker.combat.attack;
    assert.ok(atk, `${what}: attacking`);
    const energy = d.attacker.combat.energy;
    d.run(() => MOUVEMENT_RIGHT, 1);
    assert.equal(d.attacker.dash, null, what);
    assert.equal(d.attacker.combat.attack, atk, `${what}: the attack plays on`);
    assert.ok(d.attacker.combat.energy >= energy, `${what}: nothing spent`);
  };
  const whiff = combo({ gap: 300 });
  whiff.run((i) => (i === 0 ? ATTACK1 : {}), 9);
  tryCancel(whiff, 'whiffed');
  const block = combo({ gap: 40, targetHeld: () => ({ shield: true }) });
  block.run((i) => (i === 0 ? ATTACK1 : {}), 9);
  assert.equal(block.events[0]?.type, 'block');
  tryCancel(block, 'blocked');
  const tired = combo({ gap: 40 });
  tired.attacker.combat.setEnergy(0);
  tired.run((i) => (i === 0 ? ATTACK1 : {}), 9);
  assert.ok(tired.attacker.combat.cancellable);
  tryCancel(tired, 'exhausted');
  // A midair_attack1 that hits may be cut short by an air jump, never a Dash.
  const air = combo({ gap: 40 });
  for (const f of [air.attacker, air.target]) Object.assign(f.body, { y: 700, vy: 0, grounded: false, ground: null });
  air.run((i) => (i === 0 ? ATTACK1 : {}), 1);
  while (!air.hits.length) air.run(() => ({}), 1);
  while (air.attacker.combat.hitstop > 0) air.run(() => ({}), 1);
  assert.ok(air.attacker.combat.cancellable);
  tryCancel(air, 'in the air');
});

test('attack1 -> Dash -> attack1 chases a push attack1 -> attack2 no longer reaches, into high Launch Point', () => {
  for (const lp of [30, 50, 70]) {
    const direct = combo({ gap: 40, lp });
    direct.run((i) => (i === 0 ? ATTACK1 : i === 6 ? ATTACK2 : {}), 60);
    assert.ok(direct.hits.length < 2 || !direct.held(0, 1), `LP ${lp}: attack2 alone is out of reach`);

    const d = combo({ gap: 40, lp });
    let dashAt = -1;
    d.run((i) => {
      if (i === 0) return ATTACK1;
      if (dashAt < 0 && d.attacker.combat.cancellable) {
        dashAt = i;
        return MOUVEMENT_RIGHT;
      }
      return dashAt > 0 && i === dashAt + 6 ? ATTACK1 : {};
    }, 70);
    assert.deepEqual(d.hits.map((h) => h.move), ['attack1', 'attack1'], `LP ${lp}`);
    assert.ok(d.held(0, 1), `LP ${lp}: the target never got to act`);
  }
});

test('attack1 -> Dash -> attack1 never loops: Energy allows two cancels and the third empties the bar, so the chase ends within seven hits', () => {
  for (const lp of [0, 30]) {
    const d = combo({ gap: 40, lp });
    let dashAt = -1;
    let cancels = 0;
    d.run((i) => {
      if (i === 0) return ATTACK1;
      if (dashAt < 0 && d.attacker.combat.cancellable) {
        dashAt = i;
        return MOUVEMENT_RIGHT;
      }
      if (dashAt >= 0 && d.attacker.dash && d.attacker.dash.time === 0) cancels++;
      if (dashAt >= 0 && i === dashAt + 5) {
        dashAt = -1;
        return ATTACK1;
      }
      return {};
    }, 400);
    let chain = 1;
    while (chain < d.hits.length && d.held(chain - 1, chain)) chain++;
    assert.ok(chain >= 3, `LP ${lp}: a real chase (${chain} hits)`);
    assert.ok(chain <= 7, `LP ${lp}: ${chain} hits, never a loop`);
    assert.ok(d.attacker.combat.energyExhausted || d.attacker.combat.energy < def.energy.dashCancelCost,
      'the chase spent the Energy the Shield needs');
  }
});

test('left alone, a connected attack plays out its whole clip; into itself only once its cooldown has run', () => {
  const d = combo({ gap: 40 });
  d.run((i) => (i === 0 ? ATTACK1 : {}), 1);
  const atk = d.attacker.combat.attack;
  let n = 0;
  for (; d.attacker.combat.attack === atk; n++) d.run(() => ({}), 1);
  assert.equal(n, Math.round(atk.def.total / DT) + Math.round(atk.def.hitstop / DT), 'its whole clip and the freeze');

  const self = combo({ gap: 40 });
  self.run((i) => (i === 0 ? ATTACK1 : {}), 6);
  while (self.attacker.combat.hitstop > 0) self.run(() => ({}), 1);
  const first = self.attacker.combat.attack;
  let steps = 0;
  while (self.attacker.combat.attack === first) {
    self.run(() => ATTACK1, 1);
    steps++;
  }
  assert.equal(self.attacker.combat.attack?.def.id, 'attack1', 'into itself');
  assert.equal(steps, Math.round(first.def.cooldown / DT), 'after its cooldown, counted from the cut\'s opening');
});

// ---- Routes at low Launch Point -------------------------------------------------------

test('attack1 -> attack2 is a true combo at low Launch Point, with a forgiving window for the second press', () => {
  for (const lp of [0, 10, 20]) {
    for (const press of [1, 4, 8, 11]) {
      const d = combo({ gap: 40, lp });
      d.run((i) => (i === 0 ? ATTACK1 : i === press ? ATTACK2 : {}), 60);
      assert.deepEqual(d.hits.map((h) => h.move), ['attack1', 'attack2'], `LP ${lp}, attack2 ${press} steps after attack1`);
      assert.ok(d.held(0, 1), `LP ${lp}, attack2 at ${press}: the target never got to act`);
    }
  }
});

test('attack1 -> attack1 combos at LP 0 close in; its own pushback ends the string within a few hits', () => {
  const d = combo({ gap: 38 });
  d.run((i) => (i % 12 === 0 ? ATTACK1 : {}), 300);
  assert.ok(d.hits.length >= 2 && d.held(0, 1), 'another light attack');
  let chain = 1;
  while (chain < d.hits.length && d.held(chain - 1, chain)) chain++;
  assert.ok(chain >= 2 && chain <= 6, `a ${chain}-hit string, never a loop`);
  // Holding forward adds no more: the punch does not creep after its target.
  const f = combo({ gap: 38 });
  f.run((i) => ({ runRight: true, ...(i % 12 === 0 ? ATTACK1 : {}) }), 300);
  let fchain = 1;
  while (fchain < f.hits.length && f.held(fchain - 1, fchain)) fchain++;
  assert.ok(fchain <= 6, `still ${fchain}`);
  // From LP 25, attack1's push already carries the target out of a second one.
  const mid = combo({ gap: 40, lp: 25 });
  mid.run((i) => (i % 12 === 0 ? ATTACK1 : {}), 40);
  assert.ok(mid.hits.length < 2 || !mid.held(0, 1));
});

test('attack2 -> jump -> air attack1 is a true combo at medium Launch Point; attack2 -> attack1 at low', () => {
  for (const lp of [30, 40, 50]) {
    const d = combo({ gap: 40, lp });
    // A tap: the normal jump after the launch.
    d.run((i) => (i === 0 ? ATTACK2 : i === 18 ? JUMP : i === 21 ? ATTACK1 : {}), 70);
    assert.deepEqual(d.hits.map((h) => h.move), ['attack2', 'midair_attack1'], `LP ${lp}`);
    assert.ok(d.held(0, 1), `LP ${lp}: the launched target never got to act`);
  }
  for (const lp of [0, 10]) {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? ATTACK2 : i === 18 ? ATTACK1 : {}), 60);
    assert.deepEqual(d.hits.map((h) => h.move), ['attack2', 'attack1'], `LP ${lp}`);
    assert.ok(d.held(0, 1));
  }
});

test('midair_attack2 drives a grounded target into the ground; landing (fast) leads into a grounded attack1', () => {
  for (const lp of [0, 40, 100]) {
    const d = combo({ gap: 20, lp });
    Object.assign(d.attacker.body, { y: 800 - 130, vy: 0, grounded: false, ground: null });
    d.run((i) => ({ charge: true, ...(i === 0 ? ATTACK2 : {}) }), 16);
    assert.deepEqual(d.hits.map((h) => h.move), ['midair_attack2'], `LP ${lp}: the spike`);
    d.run(() => ATTACK1, 1);
    d.run(() => ({}), 30);
    assert.deepEqual(d.hits.map((h) => h.move), ['midair_attack2', 'attack1'], `LP ${lp}`);
    assert.ok(d.held(0, 1), `LP ${lp}: grounded pressure, unbroken`);
  }
});

// ---- High Launch Point breaks them ---------------------------------------------------

test('a high Launch Point launches the target too far for the same routes: combat turns to pursuit', () => {
  // attack1 -> attack2: attack1's push alone carries the target out of reach.
  for (const lp of [40, 80]) {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? ATTACK1 : i === 4 ? ATTACK2 : {}), 60);
    assert.ok(d.hits.length === 1 || !d.held(0, 1), `LP ${lp}: no attack1 -> attack2`);
  }
  // attack2 -> jump -> air attack1: the launch sends the target far above the jump.
  for (const lp of [90, 120]) {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? ATTACK2 : i === 18 ? JUMP : i === 21 ? ATTACK1 : {}), 70);
    assert.ok(d.hits.length === 1 || !d.held(0, 1), `LP ${lp}: no attack2 -> air attack1`);
  }
  // The separation attack1 makes grows with Launch Point.
  const pushed = (lp) => {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? ATTACK1 : {}), 60);
    return d.target.body.x - d.attacker.body.x;
  };
  assert.ok(pushed(0) < pushed(40) && pushed(40) < pushed(100));
  assert.ok(pushed(100) > 200, 'far out of every reach');
});

// ---- Interruption --------------------------------------------------------------------

test('a hit interrupts the target\'s own attack; two that connect on one step still trade', () => {
  // The target winds up attack2 (three frames); an attack1 lands first.
  const d = combo({ gap: 40, targetHeld: (i) => (i === 0 ? ATTACK2 : {}) });
  d.run((i) => (i === 1 ? ATTACK1 : {}), 40);
  assert.deepEqual(d.hits.map((h) => h.move), ['attack1']);
  assert.ok(!d.events.some((e) => e.attacker === d.target), 'its kick never came out');

  const t = duel({ gap: 40 });
  t.tick(ATTACK1, ATTACK1);
  t.until(() => t.events.length > 0, 20);
  assert.equal(t.events.length, 2, 'both punches land');
  assert.deepEqual(new Set(t.events.map((e) => e.attacker)), new Set([t.attacker, t.target]));
});

// ---- Shield --------------------------------------------------------------------------

test('attack -> recover -> Shield: held Shield raises it the step the attack is over', () => {
  const { fighter, step } = makeFighter();
  step(ATTACK1);
  let n = 0;
  while (fighter.combat.attack) {
    step({ shield: true });
    n++;
    if (fighter.combat.attack) assert.equal(fighter.combat.shielding, false, 'never cuts the attack short');
  }
  assert.equal(fighter.combat.shielding, true, 'up on the very step');
  assert.equal(n, Math.round(fighter.attacks.attack1.total / DT));
});
