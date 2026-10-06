// Run with node --test tests/systems/deflect.test.mjs (no dependencies).
// The Deflect: what the shared `shield` input does in the air, for every
// fighter that has one (#0001 and #0002 as the roster ships). An attack
// in every way (its own clip, phases, strike, cooldown), never a Shield:
// its strike is always 3 at Base Launch 2, and while its strike is live its
// box turns the other fighters' projectiles back (`deflectProjectiles`),
// before any projectile can strike on that step. Uses the real Fighter,
// CombatSystem, projectiles and combat AI (see
// tests/helpers/fighter-harness.mjs); each check runs against both
// fighters' own data where it is about the shared rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter } from '../../js/data/characters.js';
import { CONFIG } from '../../js/config.js';
import { createDeflectDefinition, DEFLECT_BASE_LAUNCH, DEFLECT_DAMAGE } from '../../js/game/combat/deflect.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { CombatSystem, worldBox } from '../../js/game/combat/combat.js';
import { Projectile, clashProjectiles } from '../../js/game/combat/projectile.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { StageCollision } from '../../js/game/physics.js';
import { mulberry32 } from '../../js/core/utils.js';
import { DT, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';

const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const FIGHTERS = [DEF_0001, DEF_0002];
const PRESS = { shield: true, shieldPressed: true };
const HOLD = { shield: true };
const JUMP = { jump: true, jumpPressed: true };
const ATTACK1 = { attack1: true, attack1Pressed: true };

// Puts fighter `f` in the air at (`x`, `y`), still: it falls from there.
function aloft(f, y = 400, x = f.body.x) {
  Object.assign(f.body, { x, prevX: x, y, prevY: y, vx: 0, vy: 0, grounded: false, ground: null });
}

// A live projectile of `owner`'s `id`, centred at (x, y), flying `direction`.
function shot(owner, id, x, y, direction) {
  const def = owner.projectileDefs[id];
  return new Projectile({ owner, def, anim: owner.sprites.projectile(def.animation), x, y, direction });
}

// `f`'s Deflect box where it is now, in the world.
const deflectBox = (f) => worldBox(f, f.deflect.hitbox, {});

// ---- The shared rule --------------------------------------------------------------

test('every Deflect strikes for exactly 3 at Base Launch 2: the shared rule, which no fighter authors or may change', () => {
  assert.equal(DEFLECT_DAMAGE, 3);
  assert.equal(DEFLECT_BASE_LAUNCH, 2);
  for (const c of FIGHTERS) {
    const own = createDeflectDefinition(c.deflect);
    assert.equal(own.id, 'deflect', `#${c.id}`);
    assert.equal(own.damage, 3, `#${c.id}: 3`);
    assert.equal(own.baseLaunch, 2, `#${c.id}: Base Launch 2`);
    assert.equal(own.deflectProjectiles, true, `#${c.id}: it turns projectiles back`);
    assert.equal(own.groundOnly, false);
    assert.ok(Object.isFrozen(own));
    assert.equal(c.deflect.damage, undefined, `#${c.id}: never written, so it cannot drift`);
    assert.equal(c.deflect.baseLaunch, undefined);
    assert.equal(makeFighter({ character: c }).fighter.deflect.damage, 3, `#${c.id}'s fighter`);
  }
  const spec = DEF_0001.deflect;
  assert.equal(createDeflectDefinition({ ...spec, damage: 3, baseLaunch: 2 }).damage, 3, 'the rule itself may be written out');
  for (const damage of [0, 2, 4, 12]) assert.throws(() => createDeflectDefinition({ ...spec, damage }), /every Deflect deals 3/);
  for (const baseLaunch of [0, 1, 3]) assert.throws(() => createDeflectDefinition({ ...spec, baseLaunch }), /Base Launch 2/);
  // One strike in the air, with a box and a clip: nothing else passes.
  assert.throws(() => createDeflectDefinition({ ...spec, hits: [{ at: 0, active: 0.1 }] }), /one strike/);
  assert.throws(() => createDeflectDefinition({ ...spec, projectile: { id: 'x', spawnAt: 0 } }), /one strike/);
  assert.throws(() => createDeflectDefinition({ ...spec, pending: true }), /one strike/);
  assert.throws(() => createDeflectDefinition({ ...spec, groundOnly: true }), /ground-only/);
  assert.throws(() => createDeflectDefinition({ ...spec, hitbox: null }), /hitbox/);
  assert.throws(() => createDeflectDefinition({ ...spec, animation: null }), /animation/);
  assert.equal(createDeflectDefinition(undefined), null, 'a fighter may have none');
});

test('turning projectiles back is an explicit capability: no other attack of either fighter has it, and none has it by default', () => {
  assert.equal(createAttackDefinition({ id: 'plain', hitbox: { x: 0, y: -60, w: 30, h: 20 } }).deflectProjectiles, false);
  assert.throws(() => createAttackDefinition({ id: 'boxless', hitbox: null, deflectProjectiles: true }), /no hitbox/);
  for (const c of FIGHTERS) {
    const { fighter } = makeFighter({ character: c });
    for (const [id, atk] of Object.entries(fighter.attacks)) assert.equal(atk.deflectProjectiles, false, `#${c.id} ${id}`);
    assert.equal(fighter.deflect.deflectProjectiles, true, `#${c.id}'s Deflect`);
  }
});

// ---- The button --------------------------------------------------------------------

for (const c of FIGHTERS) {
  test(`#${c.id}: Shield on the ground, never in the air; a fresh press in the air is its Deflect, once, for exactly its length`, () => {
    // On the ground: the Shield, as ever.
    const ground = makeFighter({ character: c });
    ground.step(PRESS);
    assert.equal(ground.fighter.combat.shielding, true, 'grounded Shield');
    assert.equal(ground.fighter.combat.attack, null, 'no Deflect on the ground');
    // Held into the air from before the jump starts nothing there.
    const held = makeFighter({ character: c });
    held.step(JUMP);
    for (let i = 0; i < 10; i++) {
      held.step(HOLD);
      assert.equal(held.fighter.combat.shielding, false, `step ${i}: no Shield up in the air`);
      assert.equal(held.fighter.combat.attack, null, `step ${i}: holding is no press`);
    }
    // A fresh press in the air.
    const { fighter: f, step } = makeFighter({ character: c });
    aloft(f, 300);
    step(PRESS);
    const atk = f.combat.attack;
    assert.equal(atk?.def.id, 'deflect');
    assert.equal(f.state, 'attack');
    assert.equal(f.animator.anim.key, 'deflect', 'its own clip');
    let shown = 1;
    const phases = new Set([f.combat.phase]);
    while (f.combat.attack) {
      step(HOLD);
      if (!f.combat.attack) break;
      assert.equal(f.combat.attack, atk, 'held, it is never started again');
      assert.equal(f.combat.shielding, false, 'never a Shield');
      phases.add(f.combat.phase);
      shown++;
    }
    assert.equal(shown, steps(atk.def.total), 'exactly its authored length');
    assert.deepEqual([...phases], ['startup', 'active', 'recovery']);
    // Still held, nothing more starts: one press, one Deflect.
    for (let i = 0; i < 30 && !f.grounded; i++) {
      step(HOLD);
      assert.equal(f.combat.attack, null, `step ${i}`);
    }
  });
}

test('a Deflect needs a fresh press each time, and waits out its own cooldown; a press it cannot use is never kept for later', () => {
  const { fighter: f, step } = makeFighter();
  aloft(f, 100);
  step(PRESS);
  while (f.combat.attack) step({});
  assert.ok(f.combat.cooldowns.has('deflect'), 'its cooldown runs');
  step(PRESS);
  assert.equal(f.combat.attack, null, 'not during its cooldown...');
  while (f.combat.cooldowns.has('deflect')) step({});
  for (let i = 0; i < 5; i++) step({});
  assert.equal(f.combat.attack, null, '...and never later from that press');
  step(PRESS);
  assert.equal(f.combat.attack?.def.id, 'deflect', 'a fresh press once it is over');
});

test('a Deflect never starts stunned, paralyzed, mid-attack, mid-Deflect, air dashing, in free fall or without its art', () => {
  const refused = (label, setup) => {
    const { fighter: f, step } = makeFighter(setup.options);
    aloft(f, 200);
    setup.before?.(f, step);
    const was = f.combat.attack;
    step(PRESS);
    if (was?.def.id === 'deflect') assert.equal(f.combat.attack, was, `${label}: not restarted`);
    else assert.notEqual(f.combat.attack?.def.id, 'deflect', label);
  };
  refused('stunned', { before: (f) => { f.combat.stun = 0.3; } });
  refused('paralyzed', { before: (f) => f.combat.paralyze(1) });
  refused('in an attack that may not be cut short', { before: (f, step) => step(ATTACK1) });
  refused('already deflecting', { before: (f, step) => step(PRESS) });
  refused('air dashing', { before: (f, step) => { step({ runRight: true, mouvementRightPressed: true }); assert.ok(f.dash?.air); } });
  refused('in free fall (after the Blue Tornado)', {
    options: { character: DEF_0002 },
    before: (f, step) => {
      step({ attack3: true, attack3Pressed: true });
      while (f.combat.attack) step({});
      assert.equal(f.freeFall, true);
    },
  });
  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    const sprites = fakeSpritesOf(DEF_0001, Object.keys(DEF_0001.animations).filter((k) => k !== 'deflect'));
    refused('no deflect art', { options: { sprites } });
    const { fighter, step } = makeFighter({ sprites });
    aloft(fighter, 200);
    step(PRESS);
    step({});
    step(PRESS);
    assert.equal(fighter.combat.attack, null);
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.filter((w) => /Deflect "deflect" has no animation frames/.test(w)).length, 2, 'logged once per fighter, never faked');
});

test('a Deflect may cut short an attack that hit, as any attack may (the repository\'s cancel), and wins over an attack pressed with it', () => {
  // The Floating Straight hits, reaches its hit-cancel: the Deflect cuts it.
  const d = duel({ gap: 40 });
  aloft(d.attacker, 500);
  aloft(d.target, 500, d.target.body.x);
  d.tick(ATTACK1);
  d.until(() => d.events.length > 0);
  while (d.attacker.combat.hitstop > 0 || !d.attacker.combat.cancellable) d.tick();
  d.tick(PRESS);
  assert.equal(d.attacker.combat.attack?.def.id, 'deflect');
  assert.ok(d.attacker.combat.cooldowns.has('midair_attack1'), 'the cut attack\'s cooldown');
  // Pressed with an attack button on the same step: the Deflect, and the
  // attack press is not kept for afterwards.
  const { fighter: f, step } = makeFighter();
  aloft(f, 200);
  step({ ...PRESS, ...ATTACK1 });
  assert.equal(f.combat.attack?.def.id, 'deflect');
  while (f.combat.attack) step({});
  step({});
  assert.equal(f.combat.attack, null, 'no Floating Straight after it');
});

// ---- Not a Shield ------------------------------------------------------------------

for (const c of FIGHTERS) {
  test(`#${c.id}: the Deflect strikes for 3 at Base Launch 2 through the one combat system, and costs no Energy`, () => {
    for (const lp of [0, 40]) {
      const d = duel({ attackerCharacter: c, gap: 30 });
      aloft(d.attacker, 500);
      aloft(d.target, 500, d.target.body.x);
      d.target.combat.launchPoint = lp;
      d.tick(PRESS);
      d.until(() => d.events.length > 0);
      const [e] = d.events;
      assert.equal(e.type, 'hit');
      assert.equal(e.move, 'deflect');
      assert.equal(e.attacker, d.attacker);
      assert.equal(e.damage, 3, 'exactly 3');
      assert.equal(e.baseLaunch, 2);
      assert.equal(e.directionalLaunch, c.deflect.directionalLaunch);
      assert.equal(e.launchPointAfter, lp + 3);
      assert.equal(e.launchStrength, 2 * (lp + 3));
      assert.equal(d.attacker.combat.energy, 100, 'nothing spent');
      assert.equal(d.attacker.combat.shielding, false);
    }
  });
}

test('a Deflect protects nothing: hit while it plays, the blow lands in full: no block, no perfect Shield, no Energy, no blockstun, no stall', () => {
  for (const c of FIGHTERS) {
    // The Deflect turned away from the blow, so the two never trade; the
    // target a little higher, as it falls while the Floating Straight hovers.
    const d = duel({ targetCharacter: c, gap: 40, targetFacing: 1 });
    aloft(d.attacker, 500);
    aloft(d.target, 470, d.target.body.x);
    d.tick(ATTACK1, PRESS);
    assert.equal(d.target.combat.attack?.def.id, 'deflect');
    d.until(() => d.events.length > 0);
    const [e] = d.events;
    assert.equal(e.type, 'hit', `#${c.id}: not blocked`);
    assert.equal(e.target, d.target);
    assert.equal(e.perfect, false, 'no perfect Shield');
    assert.equal(e.energyCost, 0, 'no Shield paid');
    assert.equal(e.stall, 0, 'no stall');
    assert.equal(e.damage, DEF_0001.attacks.midair_attack1.damage);
    assert.equal(d.target.combat.energy, 100);
    assert.equal(d.target.combat.shieldStun, 0, 'no blockstun');
    assert.ok(d.target.combat.stun > 0, 'hitstun instead');
    assert.equal(d.attacker.combat.hitstop, DEF_0001.attacks.midair_attack1.hitstop, 'the attacker freezes only for its own hit');
    while (d.target.combat.hitstop > 0) d.tick();
    d.tick();
    assert.equal(d.target.combat.attack, null, 'the hit takes it out of its Deflect');
  }
});

// ---- Turning projectiles back -----------------------------------------------------

for (const c of FIGHTERS) {
  test(`#${c.id}: only the live Deflect turns a projectile back, never its startup or recovery`, () => {
    for (const phase of ['startup', 'active', 'recovery']) {
      // #0001 throws, the deflecting fighter faces it from 400 units off.
      const d = duel({ targetCharacter: c, gap: 400 });
      aloft(d.target, 400, d.target.body.x);
      d.tick({}, PRESS);
      while (d.target.combat.phase !== phase) d.tick();
      // A Red inside the Deflect's box, clear of the body: only the box
      // meets it (as it moves on by one step's flight first).
      const box = deflectBox(d.target);
      const red = shot(d.attacker, 'attack2_object', box.x - 600 * DT, box.y + box.h / 2, 1);
      d.projectiles.push(red);
      d.tick();
      if (phase === 'active') {
        assert.equal(red.owner, d.target, `${phase}: now the deflecting fighter's`);
        assert.equal(red.direction, -1, `${phase}: flying away from it`);
        assert.equal(red.vx, -red.speed);
      } else {
        assert.equal(red.owner, d.attacker, `${phase}: untouched`);
        assert.equal(red.direction, 1);
      }
      assert.equal(red.alive, true, `${phase}: never destroyed for it`);
      assert.deepEqual(d.projectiles, [red], `${phase}: the same projectile, no copy`);
    }
  });
}

test('a projectile the live Deflect catches never strikes the deflecting fighter on that step, though it already touches the body', () => {
  for (const c of FIGHTERS) {
    const caught = (deflect) => {
      const d = duel({ targetCharacter: c, gap: 400 });
      aloft(d.target, 400, d.target.body.x);
      if (deflect) {
        d.tick({}, PRESS);
        while (d.target.combat.phase !== 'startup' || d.target.combat.attack.time + DT < d.target.deflect.startup - 1e-6) d.tick();
      }
      // Overlapping the box and the front hurtbox once it has moved on
      // this step: the step the Deflect goes live.
      const b = d.target.body;
      const red = shot(d.attacker, 'attack2_object', b.x - 12 - 600 * DT, b.y - 40, 1);
      d.projectiles.push(red);
      d.tick();
      return { d, red };
    };
    const plain = caught(false);
    assert.equal(plain.d.events[0]?.type, 'hit', `#${c.id}: without a Deflect it strikes`);
    const { d, red } = caught(true);
    assert.equal(d.target.combat.phase, 'active');
    assert.deepEqual(d.events, [], `#${c.id}: no hit at all that step`);
    assert.equal(d.target.combat.launchPoint, 0);
    assert.equal(red.owner, d.target);
    for (let i = 0; i < 10; i++) d.tick();
    assert.ok(d.events.every((e) => e.target !== d.target), 'nor later: it is its own now');
  }
});

test('turned back, its strikes start over, and it strikes the fighter who threw it: unblockable, erasing or piercing, it is turned back all the same', () => {
  // #0001's Hollow Purple, at #0002 in the air.
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF_0002, gap: 260 });
  aloft(d.target, 700, d.target.body.x);
  d.tick({}, PRESS);
  while (d.target.combat.phase !== 'active') d.tick();
  const box = deflectBox(d.target);
  const purple = shot(d.attacker, 'attack5_object', box.x - 58 - 640 * DT + 8, box.y + box.h / 2, 1);
  purple.hits = 1;
  purple.lastStrike = purple.age;
  purple.through.add(d.target);
  d.projectiles.push(purple);
  d.tick();
  assert.equal(purple.owner, d.target, 'unblockable and erasing, it is turned back');
  assert.equal(purple.hits, 0, 'its strikes start over');
  assert.equal(purple.lastStrike, -Infinity);
  assert.equal(purple.through.size, 0);
  // It flies home and strikes #0001, who threw it, now credited to #0002.
  d.until(() => d.events.some((e) => e.projectile === purple), 120);
  const e = d.events.find((ev) => ev.projectile === purple);
  assert.equal(e.attacker, d.target);
  assert.equal(e.target, d.attacker);
  assert.equal(e.damage, DEF_0001.projectiles.attack5_object.damage);
  assert.ok(e.finalLaunch.x < 0, 'launched the way it now flies');
  // A piercing one too: #0002's tornado, mid-grind, turned back by #0001.
  const t = duel({ attackerCharacter: DEF_0002, targetCharacter: DEF_0001, gap: 300 });
  aloft(t.target, 500, t.target.body.x);
  t.tick({}, PRESS);
  while (t.target.combat.phase !== 'active') t.tick();
  const tb = deflectBox(t.target);
  const tornado = shot(t.attacker, 'extra_attack_object', tb.x - 24 - 260 * DT + 6, tb.y + tb.h / 2, 1);
  tornado.hits = 3;
  tornado.lastStrike = tornado.age;
  t.projectiles.push(tornado);
  t.tick();
  assert.equal(tornado.owner, t.target);
  assert.equal(tornado.hits, 0, 'every strike back, its finisher last again');
  assert.equal(tornado.nextHit, tornado.def);
});

test('an attack without the capability never turns a projectile back: the Floating Straight\'s box lets a Red through', () => {
  const d = duel({ gap: 400 });
  aloft(d.target, 400, d.target.body.x);
  d.tick({}, ATTACK1);
  while (d.target.combat.phase !== 'active') d.tick();
  const box = worldBox(d.target, d.target.combat.attack.def.hitbox, {});
  const red = shot(d.attacker, 'attack2_object', box.x - 600 * DT, box.y + box.h / 2, 1);
  d.projectiles.push(red);
  d.tick();
  assert.equal(red.owner, d.attacker);
  assert.equal(red.direction, 1);
});

test('Red still repels, and a Red that was turned back by a Deflect repels for its new owner', () => {
  // Red against #0002's tornado, as ever: the tornado is turned round.
  const a = makeFighter({ character: DEF_0001 }).fighter;
  const b = makeFighter({ character: DEF_0002, x: 900 }).fighter;
  const red = shot(a, 'attack2_object', 600, 700, 1);
  const tornado = shot(b, 'extra_attack_object', 610, 700, -1);
  clashProjectiles([red, tornado]);
  assert.equal(tornado.owner, a, 'repelled to Red\'s owner');
  assert.equal(tornado.direction, 1);
  // A Red #0002 Deflected is #0002's: it repels #0001's own Maximum Blue.
  const sys = new CombatSystem();
  const { fighter: deflector, step } = makeFighter({ character: DEF_0002, x: 700 });
  deflector.facing = -1;
  aloft(deflector, 500);
  step(PRESS);
  while (deflector.combat.phase !== 'active') step({});
  const box = deflectBox(deflector);
  const back = shot(a, 'attack2_object', box.x, box.y + box.h / 2, 1);
  sys.update([a, deflector], [back]);
  assert.equal(back.owner, deflector);
  assert.deepEqual(sys.deflections.map((x) => [x.fighter, x.from, x.direction]), [[deflector, a, -1]]);
  const blue = shot(a, 'attack3_object', back.x - 20, back.y, 1);
  clashProjectiles([back, blue]);
  assert.equal(blue.owner, deflector, 'the turned-back Red repels for its new owner');
  assert.equal(blue.direction, -1);
});

// ---- The CPU -------------------------------------------------------------------------

test('a CPU in the air Deflects a shot on course for it, and turns it back at its thrower', () => {
  for (const c of FIGHTERS) {
    // No gravity, so the CPU hangs where it is while the tornado comes.
    const stage = new StageCollision(stageMap());
    const ctx = { stage, gravity: 0, battle: null };
    const ai = new CombatAIController({ difficulty: 'hard', rng: mulberry32(7) });
    const me = new Fighter({ def: c, sprites: fakeSpritesOf(c), stage, slot: 'p2', label: 'CPU', spawn: { x: 700, y: 500, facing: 1 }, controller: ai });
    const foe = new Fighter({ def: DEF_0002, sprites: fakeSpritesOf(DEF_0002), stage, slot: 'p1', label: 'P', spawn: { x: 1300, facing: -1 } });
    me.opponent = foe;
    foe.opponent = me;
    aloft(me, 500);
    const system = new CombatSystem();
    const tornado = shot(foe, 'extra_attack_object', 1100, 500 - 70, -1);
    const projectiles = [tornado];
    ctx.battle = { projectiles, clones: [], combat: system };
    let deflected = false;
    for (let i = 0; i < steps(1.5) && tornado.alive && !deflected; i++) {
      me.update(DT, ctx);
      foe.update(DT, ctx);
      for (const p of projectiles) p.update(DT, stage);
      system.update([me, foe], projectiles);
      deflected = tornado.owner === me;
    }
    assert.ok(deflected, `#${c.id}: Deflected`);
    assert.equal(me.combat.launchPoint, 0, `#${c.id}: untouched`);
    assert.equal(tornado.direction, 1, 'sent back the way it came');
  }
});

test('a CPU never holds a Shield in the air: it presses the button there only to Deflect', () => {
  for (const [a, b] of [[DEF_0001, DEF_0002], [DEF_0002, DEF_0001]]) {
    const stage = new StageCollision(stageMap());
    const ctx = { stage, gravity: CONFIG.sim.gravity, battle: { projectiles: [], clones: [], combat: new CombatSystem() } };
    const ais = [new CombatAIController({ difficulty: 'hard', rng: mulberry32(3) }), new CombatAIController({ difficulty: 'brutal', rng: mulberry32(4) })];
    const fighters = [a, b].map((def, i) => new Fighter({
      def, sprites: fakeSpritesOf(def), stage, slot: i ? 'p2' : 'p1', label: `CPU ${i + 1}`,
      spawn: { x: 800 + i * 300, facing: i ? -1 : 1 }, controller: ais[i],
    }));
    fighters[0].opponent = fighters[1];
    fighters[1].opponent = fighters[0];
    let airborneSteps = 0;
    for (let n = 0; n < steps(20); n++) {
      for (const [i, f] of fighters.entries()) {
        f.update(DT, ctx);
        const out = ais[i].out;
        if (!f.grounded) airborneSteps++;
        if (!f.grounded) assert.ok(!out.shield || out.shieldPressed, `step ${n}: no Shield held in the air`);
        assert.ok(f.grounded || !f.combat.shielding, 'never shielding in the air');
      }
      ctx.battle.combat.update(fighters, []);
    }
    assert.ok(airborneSteps > 0, 'they took to the air');
  }
});
