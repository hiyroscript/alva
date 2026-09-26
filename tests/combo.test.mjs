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
const BA1 = P('action1');
const BA2 = P('action2');
const THROW = P('primary');
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
    step(BA1);
    const total = Math.round(fighter.combat.attack.def.total / DT);
    let n = 1;
    while (n < total - early) {
      step({});
      n++;
    }
    step(BA2);
    assert.equal(fighter.combat.attack.def.id, 'ba1', 'not while BA1 still plays');
    while (fighter.combat.attack?.def.id === 'ba1') step({});
    assert.equal(fighter.combat.attack?.def.id, 'ba2', `pressed ${early} step(s) early: out as BA1 ends`);
    assert.equal(fighter.combat.attack.time, 0, 'on that very step');
  }
});

test('a press older than the buffer never comes out: no ancient inputs', () => {
  const { fighter, step } = makeFighter();
  step(BA1);
  step(BA2);
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(step({}).combat.attack?.def.id);
  assert.ok(!seen.has('ba2'), 'pressed far too early: dropped');
  assert.equal(fighter.bufferedAttack, null);
});

test('a press during a cooldown comes out as the cooldown ends; the latest press wins', () => {
  const { fighter, step } = makeFighter();
  step(BA1);
  while (fighter.combat.attack) step({});
  assert.ok(fighter.combat.cooldowns.has('ba1'));
  // Pressed inside the buffer's reach of the cooldown's end.
  while (fighter.combat.cooldowns.get('ba1') > mv.attackBuffer - 2 * DT) step({});
  step(BA1);
  assert.equal(fighter.combat.attack, null, 'still cooling down');
  while (fighter.combat.cooldowns.has('ba1')) step({});
  assert.equal(fighter.combat.attack?.def.id, 'ba1', 'the step the cooldown is over');
  // Pressed as the attack ends, far longer before that than the buffer
  // keeps it: gone.
  const early = makeFighter();
  early.step(BA1);
  while (early.fighter.combat.attack) early.step({});
  early.step(BA1);
  for (let i = 0; i < 20; i++) early.step({});
  assert.equal(early.fighter.combat.attack, null);

  const latest = makeFighter();
  latest.step(BA1);
  while (latest.fighter.combat.attack.time < 3 / 12) latest.step({});
  latest.step(BA2);
  latest.step(THROW);
  while (latest.fighter.combat.attack?.def.id === 'ba1') latest.step({});
  assert.equal(latest.fighter.combat.attack?.def.id, 'throw');
});

test('only presses that could start are kept: never Special, an air Throw or an attack without art; charged presses never', () => {
  const { fighter, step } = makeFighter();
  step(BA1);
  step(P('special'));
  assert.equal(fighter.bufferedAttack, null, 'reserved');
  const air = makeFighter();
  air.step(JUMP);
  air.step(BA1);
  assert.equal(air.fighter.combat.attack?.def.id, 'midairBa1');
  air.step(BA2);
  air.step(THROW);
  assert.equal(air.fighter.bufferedAttack?.action, 'action2', 'an air Throw never replaces it');
  // A Charged BA1 press on its cooldown is used up, never kept for later.
  const d = duel({ gap: 600 });
  d.tick({ charge: true });
  d.tick({ charge: true, ...BA1 });
  assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'));
  d.tick({ charge: true, ...BA1 });
  assert.equal(d.attacker.bufferedAttack, null);
  for (let i = 0; i < 20; i++) d.tick({});
  assert.equal(d.attacker.combat.attack, null, 'no BA1 later either');
});

test('presses made during an impact freeze are kept, and do not age through it', () => {
  const d = combo({ gap: 40 });
  d.run((i) => (i === 0 ? BA1 : {}), 6);
  assert.equal(d.hits.length, 1);
  assert.ok(d.attacker.combat.hitstop > 0, 'frozen');
  d.run(() => BA2, 1);
  const buffered = d.attacker.bufferedAttack;
  assert.equal(buffered?.action, 'action2');
  while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
  assert.equal(d.attacker.combat.attack?.def.id, 'ba2', 'out as soon as the freeze is over');
});

test('a press while Defense holds the Shield up comes out the step the Shield is let go', () => {
  const { fighter, step } = makeFighter();
  step({ defense: true });
  step({ defense: true, ...BA1 });
  assert.equal(fighter.combat.shielding, true);
  assert.equal(fighter.combat.attack, null);
  step({ defense: true });
  step({});
  assert.equal(fighter.combat.shielding, false);
  assert.equal(fighter.combat.attack?.def.id, 'ba1', 'Shield -> release -> attack, without delay');
});

test('buffered presses keep their order: jump then BA1 is a jump and an air BA1; together, the ground attack goes first', () => {
  const { fighter, step } = makeFighter();
  step(BA2);
  while (fighter.combat.attack.time < fighter.combat.attack.def.total - 5 * DT) step({});
  step(JUMP);
  step(BA1);
  while (fighter.combat.attack?.def.id === 'ba2') step({});
  assert.equal(fighter.grounded, false, 'the jump first');
  assert.equal(fighter.combat.attack, null);
  step({});
  assert.equal(fighter.combat.attack?.def.id, 'midairBa1', 'then the attack, in the air');

  const same = makeFighter();
  same.step(BA2);
  while (same.fighter.combat.attack.time < same.fighter.combat.attack.def.total - 5 * DT) same.step({});
  same.step({ ...JUMP, ...BA1 });
  while (same.fighter.combat.attack?.def.id === 'ba2') same.step({});
  assert.equal(same.fighter.combat.attack?.def.id, 'ba1', 'on the ground');
});

// ---- Hit-cancels ------------------------------------------------------------------

test('a BA1 that hits may be cut short by BA2 the step its freeze ends; its cooldown starts then', () => {
  const d = combo({ gap: 40 });
  d.run((i) => (i === 0 ? BA1 : i === 2 ? BA2 : {}), 8);
  assert.equal(d.hits.length, 1);
  while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
  assert.equal(d.attacker.combat.attack?.def.id, 'ba2', 'cut short into BA2');
  assert.ok(d.attacker.combat.cooldowns.has('ba1'), 'BA1\'s cooldown from the cut');
});

test('a whiffed or blocked attack keeps its whole recovery: no cut short', () => {
  for (const blocked of [false, true]) {
    const d = combo({ gap: blocked ? 40 : 300, targetHeld: () => (blocked ? { defense: true } : {}) });
    d.run((i) => (i === 0 ? BA1 : {}), 1);
    const atk = d.attacker.combat.attack;
    let n = 0;
    for (; d.attacker.combat.attack === atk; n++) d.run(() => BA2, 1);
    const freeze = blocked ? Math.round(atk.def.hitstop / DT) : 0;
    assert.equal(n, Math.round(atk.def.total / DT) + freeze, blocked ? 'blocked: in full' : 'whiffed: in full');
    assert.equal(d.attacker.combat.attack?.def.id, 'ba2', 'then the buffered BA2');
  }
});

test('a jump cuts a connected BA2 short; walking, a Dash, the Shield and Charge never do', () => {
  const hitBa2 = () => {
    const d = combo({ gap: 40 });
    d.run((i) => (i === 0 ? BA2 : {}), 16);
    assert.equal(d.hits.length, 1);
    while (d.attacker.combat.hitstop > 0) d.run(() => ({}), 1);
    assert.ok(d.attacker.combat.cancellable);
    return d;
  };
  const j = hitBa2();
  j.run(() => JUMP, 1);
  assert.equal(j.attacker.combat.attack, null);
  assert.equal(j.attacker.grounded, false, 'jumping after the launched target');

  for (const held of [{ right: true }, { defense: true }, { charge: true }]) {
    const d = hitBa2();
    const atk = d.attacker.combat.attack;
    d.run(() => held, 3);
    assert.equal(d.attacker.combat.attack, atk, `${Object.keys(held)[0]}: the attack plays on`);
  }
  const dash = hitBa2();
  const atk = dash.attacker.combat.attack;
  dash.run((i) => (i % 2 ? {} : { right: true, rightPressed: true }), 4);
  assert.equal(dash.attacker.dash, null);
  assert.equal(dash.attacker.combat.attack, atk);
});

test('left alone, a connected attack plays out its whole clip; into itself only once its cooldown has run', () => {
  const d = combo({ gap: 40 });
  d.run((i) => (i === 0 ? BA1 : {}), 1);
  const atk = d.attacker.combat.attack;
  let n = 0;
  for (; d.attacker.combat.attack === atk; n++) d.run(() => ({}), 1);
  assert.equal(n, Math.round(atk.def.total / DT) + Math.round(atk.def.hitstop / DT), 'its whole clip and the freeze');

  const self = combo({ gap: 40 });
  self.run((i) => (i === 0 ? BA1 : {}), 6);
  while (self.attacker.combat.hitstop > 0) self.run(() => ({}), 1);
  const first = self.attacker.combat.attack;
  let steps = 0;
  while (self.attacker.combat.attack === first) {
    self.run(() => BA1, 1);
    steps++;
  }
  assert.equal(self.attacker.combat.attack?.def.id, 'ba1', 'into itself');
  assert.equal(steps, Math.round(first.def.cooldown / DT), 'after its cooldown, counted from the cut\'s opening');
});

// ---- Routes at low Launch Point -------------------------------------------------------

test('BA1 -> BA2 is a true combo at low Launch Point, with a forgiving window for the second press', () => {
  for (const lp of [0, 10, 20]) {
    for (const press of [1, 4, 8, 11]) {
      const d = combo({ gap: 40, lp });
      d.run((i) => (i === 0 ? BA1 : i === press ? BA2 : {}), 60);
      assert.deepEqual(d.hits.map((h) => h.move), ['ba1', 'ba2'], `LP ${lp}, BA2 ${press} steps after BA1`);
      assert.ok(d.held(0, 1), `LP ${lp}, BA2 at ${press}: the target never got to act`);
    }
  }
});

test('BA1 -> BA1 combos at LP 0 close in; its own pushback ends the string within a few hits', () => {
  const d = combo({ gap: 38 });
  d.run((i) => (i % 12 === 0 ? BA1 : {}), 300);
  assert.ok(d.hits.length >= 2 && d.held(0, 1), 'another light attack');
  let chain = 1;
  while (chain < d.hits.length && d.held(chain - 1, chain)) chain++;
  assert.ok(chain >= 2 && chain <= 4, `a ${chain}-hit string, never a loop`);
  // Holding forward adds no more: the punch does not creep after its target.
  const f = combo({ gap: 38 });
  f.run((i) => ({ right: true, ...(i % 12 === 0 ? BA1 : {}) }), 300);
  let fchain = 1;
  while (fchain < f.hits.length && f.held(fchain - 1, fchain)) fchain++;
  assert.ok(fchain <= 4, `still ${fchain}`);
  // From LP 20, BA1's push already carries the target out of a second one.
  const mid = combo({ gap: 40, lp: 20 });
  mid.run((i) => (i % 12 === 0 ? BA1 : {}), 40);
  assert.ok(mid.hits.length < 2 || !mid.held(0, 1));
});

test('BA2 -> jump -> air BA1 is a true combo at medium Launch Point; BA2 -> BA1 at low', () => {
  for (const lp of [30, 40, 50]) {
    const d = combo({ gap: 40, lp });
    // Jump held on after the press: the full jump after the launch.
    d.run((i) => ({ ...(i === 0 ? BA2 : i === 18 ? JUMP : i === 21 ? BA1 : {}), jump: i >= 18 && i < 30 }), 70);
    assert.deepEqual(d.hits.map((h) => h.move), ['ba2', 'midairBa1'], `LP ${lp}`);
    assert.ok(d.held(0, 1), `LP ${lp}: the launched target never got to act`);
  }
  for (const lp of [0, 10]) {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? BA2 : i === 18 ? BA1 : {}), 60);
    assert.deepEqual(d.hits.map((h) => h.move), ['ba2', 'ba1'], `LP ${lp}`);
    assert.ok(d.held(0, 1));
  }
});

test('mid-air BA2 drives a grounded target into the ground; landing (fast) leads into a grounded BA1', () => {
  for (const lp of [0, 40, 100]) {
    const d = combo({ gap: 20, lp });
    Object.assign(d.attacker.body, { y: 800 - 130, vy: 0, grounded: false, ground: null });
    d.run((i) => ({ charge: true, ...(i === 0 ? BA2 : {}) }), 16);
    assert.deepEqual(d.hits.map((h) => h.move), ['midairBa2'], `LP ${lp}: the spike`);
    d.run(() => BA1, 1);
    d.run(() => ({}), 30);
    assert.deepEqual(d.hits.map((h) => h.move), ['midairBa2', 'ba1'], `LP ${lp}`);
    assert.ok(d.held(0, 1), `LP ${lp}: grounded pressure, unbroken`);
  }
});

// ---- High Launch Point breaks them ---------------------------------------------------

test('a high Launch Point launches the target too far for the same routes: combat turns to pursuit', () => {
  // BA1 -> BA2: BA1's push alone carries the target out of reach.
  for (const lp of [40, 80]) {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? BA1 : i === 4 ? BA2 : {}), 60);
    assert.ok(d.hits.length === 1 || !d.held(0, 1), `LP ${lp}: no BA1 -> BA2`);
  }
  // BA2 -> jump -> air BA1: the launch sends the target far above the jump.
  for (const lp of [90, 120]) {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? BA2 : i === 18 ? JUMP : i === 21 ? BA1 : {}), 70);
    assert.ok(d.hits.length === 1 || !d.held(0, 1), `LP ${lp}: no BA2 -> air BA1`);
  }
  // The separation BA1 makes grows with Launch Point.
  const pushed = (lp) => {
    const d = combo({ gap: 40, lp });
    d.run((i) => (i === 0 ? BA1 : {}), 60);
    return d.target.body.x - d.attacker.body.x;
  };
  assert.ok(pushed(0) < pushed(40) && pushed(40) < pushed(100));
  assert.ok(pushed(100) > 200, 'far out of every reach');
});

// ---- Interruption --------------------------------------------------------------------

test('a hit interrupts the target\'s own attack; two that connect on one step still trade', () => {
  // The target winds up BA2 (three frames); a BA1 lands first.
  const d = combo({ gap: 40, targetHeld: (i) => (i === 0 ? BA2 : {}) });
  d.run((i) => (i === 1 ? BA1 : {}), 40);
  assert.deepEqual(d.hits.map((h) => h.move), ['ba1']);
  assert.ok(!d.events.some((e) => e.attacker === d.target), 'its kick never came out');

  const t = duel({ gap: 40 });
  t.tick(BA1, BA1);
  t.until(() => t.events.length > 0, 20);
  assert.equal(t.events.length, 2, 'both punches land');
  assert.deepEqual(new Set(t.events.map((e) => e.attacker)), new Set([t.attacker, t.target]));
});

// ---- Shield --------------------------------------------------------------------------

test('attack -> recover -> Shield: held Defense raises it the step the attack is over', () => {
  const { fighter, step } = makeFighter();
  step(BA1);
  let n = 0;
  while (fighter.combat.attack) {
    step({ defense: true });
    n++;
    if (fighter.combat.attack) assert.equal(fighter.combat.shielding, false, 'never cuts the attack short');
  }
  assert.equal(fighter.combat.shielding, true, 'up on the very step');
  assert.equal(n, Math.round(fighter.attacks.ba1.total / DT));
});
