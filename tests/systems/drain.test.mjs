// Run with node --test tests/systems/drain.test.mjs (no dependencies).
// A drain (`drain: Energy`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a real hit takes that much Energy off its
// target at once, never below 0, and gives it to nobody (nothing gives
// Energy back). Reaching 0 exhausts the target as any 0 does: no Dash, air
// dash, Deflect, Shield or construct move until its bar is full again. It
// is no payment (the target's refill runs on), a blocked hit drains
// nothing, and it is routine for the cooldown policy (a light strike may
// drain and stay ordinary). Checked on a test-only fighter (#0001's body
// and clips with a draining Jab) through the real Fighter and CombatSystem,
// for the cooldown policy, the attack classification and the CPU's reading
// of a strike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { isHarmfulHit } from '../../js/game/combat/offense.js';
import { EXCEPTIONAL_EFFECTS, ROUTINE_EFFECTS, cooldownClass } from '../../js/data/cooldowns.js';
import { MAX_ENERGY } from '../../js/data/energy.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { DT, def, duel, fakeSpritesOf, makeFighter, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };
const jab = (spec = {}) => createAttackDefinition({ id: 'jab', hitbox: BOX, damage: 3, ...spec });

// The drainer: #0001 whose Jab drains 30 Energy.
const DRAINER = {
  ...def,
  id: 'test-drainer',
  attacks: { ...def.attacks, attack1: { ...def.attacks.attack1, drain: 30, hitCancel: null } },
};

// ---- Data -------------------------------------------------------------------------------

test('a drain is Energy from 0 to the whole bar any hit may declare: none by default, inherited like the other hit effects, refused when it is anything else', () => {
  assert.equal(jab({ drain: 40 }).drain, 40);
  assert.equal(jab().drain, 0, 'none by default');
  assert.equal(jab({ drain: MAX_ENERGY }).drain, MAX_ENERGY, 'the whole bar at most');
  const multi = createAttackDefinition({
    id: 'c', hitbox: BOX, drain: 5,
    hits: [{ at: 0.1, active: 0.05, damage: 1 }, { at: 0.2, active: 0.05, damage: 1, drain: 0 }],
  });
  assert.deepEqual(multi.hits.map((h) => h.drain), [5, 0], 'a strike takes the attack\'s unless it says');
  const shot = createProjectileDefinition({ id: 'd', speed: 100, damage: 1, drain: 10, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 } });
  assert.equal(shot.finisher.drain, 10, 'a finisher inherits its projectile\'s');
  assert.equal(createTechniqueDefinition({ id: 'e', burst: { hitbox: BOX, hit: { damage: 1, drain: 50 } } }).burst.hit.drain, 50);
  for (const bad of [-1, '20', true, Infinity, NaN, MAX_ENERGY + 1]) {
    assert.throws(() => jab({ drain: bad }), /drain must be Energy from 0 to 100/, String(bad));
  }
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, drain: 5 }), /pending but declares drain/);
});

test('a drain is routine: it earns no cooldown and no Energy cost of its own; a hit that drains is an attack', () => {
  assert.ok(ROUTINE_EFFECTS.includes('drain'));
  assert.equal(EXCEPTIONAL_EFFECTS.includes('drain'), false);
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 1, drain: 100 }), 'ordinary');
  assert.equal(jab({ drain: 30 }).cooldown, 0);
  assert.equal(jab({ drain: 30 }).energyCost, 0, 'a strike that drains is still a melee strike');
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 10, drain: 100 } } }).cooldown, 5, 'its 10 earns the 5 s');
  assert.equal(isHarmfulHit({ damage: 0, drain: 10 }), true);
});

// ---- Draining ---------------------------------------------------------------------------

test('a real hit takes its drain off its target\'s Energy at once, given to nobody, its event saying how much', () => {
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  const system = new CombatSystem();
  a.combat.setEnergy(50);
  const e = system.applyHit(a, b, jab({ drain: 30 }));
  assert.equal(e.type, 'hit');
  assert.equal(e.damage, 3, 'the hit lands in full');
  assert.equal(e.drained, 30);
  assert.equal(b.combat.energy, MAX_ENERGY - 30);
  assert.equal(a.combat.energy, 50, 'nothing given to the attacker');
  assert.equal(b.combat.energySpent, 0, 'no payment');
  assert.equal(b.combat.energyExhausted, false);
  // Never below 0: what was left, and the target exhausted.
  b.combat.setEnergy(12);
  const last = system.applyHit(a, b, jab({ drain: 30 }));
  assert.equal(last.drained, 12);
  assert.equal(b.combat.energy, 0);
  assert.equal(b.combat.energyExhausted, true, 'reaching 0 exhausts it');
  // A projectile or a burst drains the same way.
  b.combat.refillEnergy();
  const shot = system.applyHit(a, b, createProjectileDefinition({ id: 'p', speed: 100, damage: 1, drain: 15 }), { projectile: { ability: 'p' } });
  assert.equal(shot.drained, 15);
  assert.equal(b.combat.energy, 85);
});

test('a blocked hit drains nothing: the Shield pays its own block, as ever', () => {
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  const system = new CombatSystem();
  b.combat.shielding = true;
  const blocked = system.applyHit(a, b, jab({ drain: 40 }));
  assert.equal(blocked.type, 'block');
  assert.equal(blocked.drained, 0);
  assert.equal(b.combat.energy, MAX_ENERGY - 15, 'only the block\'s own 15');
});

test('drained to 0 in a real fight, the target is exhausted: no Shield and no Dash until its bar refills completely; its refill runs on', () => {
  const d = duel({ attackerCharacter: DRAINER, attackerSprites: fakeSpritesOf(DRAINER), targetCharacter: def, targetSprites: fakeSpritesOf(def), gap: 44 });
  d.target.combat.setEnergy(25);
  d.tick(P('attack1'));
  d.until(() => d.events.length > 0, 40);
  // All it had left (25, and what it refilled while the Jab came out).
  assert.ok(d.events[0].drained > 25 && d.events[0].drained < 30, `${d.events[0].drained}`);
  assert.equal(d.target.combat.energyExhausted, true);
  for (let i = 0; i < steps(0.6); i++) d.tick();
  d.tick({}, P('shield'));
  assert.equal(d.target.combat.shielding, false, 'no Shield while exhausted');
  const before = d.target.combat.energy;
  assert.ok(before > 0, 'its refill ran on');
  for (let i = 0; i < steps(1); i++) d.tick();
  assert.ok(d.target.combat.energy > before);
  assert.ok(DT > 0);
});

// ---- The CPU ------------------------------------------------------------------------------

test('the CPU reads a strike\'s drain', () => {
  const caps = analyzeCapabilities(makeFighter({ character: DRAINER, sprites: fakeSpritesOf(DRAINER) }).fighter);
  const jabCaps = caps.moves.find((m) => m.key === 'attack1:ground');
  assert.ok(jabCaps, 'its Jab is read');
  assert.equal(jabCaps.strikes[0].drain, 30);
});
