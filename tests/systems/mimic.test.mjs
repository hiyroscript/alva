// Run with node --test tests/systems/mimic.test.mjs (no dependencies).
// A mimic (`mimic: { spawnAt, offset, siphon }` on a single melee strike,
// js/game/combat/attacks.js and js/game/combat/mimic.js): a real hit copies
// the strongest projectile its target throws (the most one throw deals one
// target, then its launch, then a hold; only one that flies) into its
// fighter's hands, and its next use of a mimic throws that copy instead of
// striking: the projectile alone, its own definition and art, now the
// thrower's, its cooldown and Energy the policies' for the copy. A target
// that throws nothing gives up `siphon` Energy instead, all of it to the
// mimic's fighter. A block takes nothing. Checked on test-only fighters
// (#0001's body and clips, its Jab a mimic) through the real Fighter and
// CombatSystem, for the schema, the policies, the Mash Combo and the CPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition, projectileDrop } from '../../js/game/combat/projectile.js';
import { COPY_FLOOR_CLEARANCE, mimicThrow, projectileStrength, strongestProjectile, throwOffset } from '../../js/game/combat/mimic.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { EXCEPTIONAL_EFFECTS, ROUTINE_EFFECTS } from '../../js/data/cooldowns.js';
import { MAX_ENERGY } from '../../js/data/energy.js';
import { mashComboProblems } from '../../js/data/mash-combo.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { getCharacter } from '../../js/data/characters.js';
import { def, duel, fakeSpritesOf, steps } from '../helpers/fighter-harness.mjs';
import { playableCharacters } from '../../js/data/characters.js';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };
const touch = (spec = {}) => createAttackDefinition({ id: 'touch', hitbox: BOX, damage: 1, mimic: { spawnAt: 0.1, offset: { x: 20, y: -40 }, siphon: 40 }, ...spec });

// The mimic: #0001 whose Jab is a touch that copies, or takes 40 Energy.
const MIMIC = {
  ...def,
  id: 'test-mimic',
  attacks: {
    ...def.attacks,
    attack1: { ...def.attacks.attack1, hitCancel: null, mimic: { spawnAt: 0.1, offset: { x: 30, y: -60 }, siphon: 40 } },
  },
};
// The same mimic, letting go low (20 units up, as a small fighter's hand
// does): a tall copy has to be lifted to clear the floor.
const LOW = {
  ...MIMIC,
  id: 'test-mimic-low',
  attacks: { ...MIMIC.attacks, attack1: { ...MIMIC.attacks.attack1, mimic: { spawnAt: 0.1, offset: { x: 30, y: -20 }, siphon: 40 } } },
};
// #0001 with no projectile of its own: nothing to copy.
const EMPTY = { ...def, id: 'test-empty', attacks: { ...def.attacks, attack2: { ...def.attacks.attack1 }, midair_attack2: { ...def.attacks.midair_attack1 } } };
delete EMPTY.projectiles;
delete EMPTY.projectileAnimations;
delete EMPTY.techniques;
EMPTY.actions = { attack1: def.actions.attack1, attack2: def.actions.attack1 };

const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};
const versus = (target, opts = {}, mimic = MIMIC) => duel({
  attackerCharacter: mimic, attackerSprites: fakeSpritesOf(mimic), targetCharacter: target, targetSprites: fakeSpritesOf(target), gap: 40, ...opts,
});
const thrown = (d) => d.projectiles.filter((p) => p.owner === d.attacker);

// ---- Data -------------------------------------------------------------------------------

test('a mimic is a single melee strike\'s { spawnAt, offset, siphon }: none by default, refused on anything else', () => {
  assert.deepEqual(touch().mimic, { spawnAt: 0.1, offset: { x: 20, y: -40 }, siphon: 40 });
  assert.equal(createAttackDefinition({ id: 'x', hitbox: BOX, damage: 1 }).mimic, null, 'none by default');
  assert.equal(touch({ mimic: { spawnAt: 0 } }).mimic.siphon, 0, 'no siphon unless it says');
  const refused = [
    [{ hitbox: null, damage: undefined, projectile: { id: 'p', spawnAt: 0.1 } }, /throws a projectile/],
    [{ hits: [{ at: 0.05, active: 0.05, damage: 1 }], damage: undefined }, /strikes in a string/],
    [{ motion: { type: 'rise', speed: 300 } }, /moves on its own/],
    [{ pull: { radius: 50, speed: 100 } }, /pulls/],
    [{ deflectProjectiles: true }, /turns projectiles back/],
  ];
  for (const [spec, why] of refused) assert.throws(() => touch(spec), why);
  for (const bad of [-1, 1, '0.1', NaN]) assert.throws(() => touch({ mimic: { spawnAt: bad } }), /spawnAt/, String(bad));
  for (const bad of [-1, 2.5, MAX_ENERGY + 1, '40']) assert.throws(() => touch({ mimic: { spawnAt: 0.1, siphon: bad } }), /siphon/, String(bad));
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, mimic: { spawnAt: 0 } }), /pending but declares mimic/);
});

test('a mimic is routine: the touch earns no cooldown and costs nothing, and it is never a Mash Combo partner', () => {
  assert.ok(ROUTINE_EFFECTS.includes('mimic') && ROUTINE_EFFECTS.includes('siphon'));
  assert.equal(EXCEPTIONAL_EFFECTS.includes('mimic'), false);
  assert.equal(touch().cooldown, 0);
  assert.equal(touch().energyCost, 0, 'a touch is a melee strike');
  assert.equal(touch().offense.attack, true);
  const pair = mashComboProblems({ ...MIMIC, mashCombo: { attacks: ['attack1', 'extra_attack'] } });
  assert.ok(pair.some((p) => /mimics/.test(p)), 'its next use throws');
});

// ---- What a touch copies -------------------------------------------------------------------

test('the strongest projectile: the most one throw deals one target, then its launch, then a hold; only one that flies and has its art', () => {
  const shot = (id, spec) => createProjectileDefinition({ id, animation: id, speed: 300, ...spec });
  const art = { projectile: (a) => (a === 'noart' ? null : { frames: [{}], fps: 1 }) };
  const fighter = (defs) => ({ def: { id: 'x' }, sprites: art, projectileDefs: Object.fromEntries(defs.map((d) => [d.id, d])) });
  const pierce = shot('pierce', { damage: 1, pierce: { hits: 3, interval: 0.1 }, finisher: { damage: 3 } });
  assert.deepEqual(projectileStrength(pierce), { damage: 5, launch: 0, hold: 0 }, 'every strike of a piercing one');
  const stab = shot('stab', { damage: 3, backstab: { damage: 5, baseLaunch: 3 } });
  assert.deepEqual(projectileStrength(stab), { damage: 5, launch: 3, hold: 0 }, 'a backstab by its harder hit');
  const pick = (...defs) => strongestProjectile(fighter(defs))?.id ?? null;
  assert.equal(pick(shot('a', { damage: 3 }), pierce), 'pierce', 'more damage');
  assert.equal(pick(shot('a', { damage: 5 }), shot('b', { damage: 5, baseLaunch: 2 })), 'b', 'then the harder launch');
  assert.equal(pick(shot('a', { damage: 1 }), shot('b', { damage: 1, paralyze: 0.5 })), 'b', 'then a hold');
  assert.equal(pick(shot('a', { damage: 3 }), shot('b', { damage: 3 })), 'a', 'a tie: the first listed');
  assert.equal(pick(shot('a', { damage: 1 }), shot('trap', { damage: 10, speed: 0 })), 'a', 'a trap never flies: never copied');
  assert.equal(pick(shot('noart', { damage: 10 }), shot('a', { damage: 1 })), 'a', 'none without its art');
  assert.equal(pick(), null);
  // The roster's: #0007's rocket over its pistol, #0016's arrow over her
  // pistol shots; #0009's Air Blast, never its Earth Pillar.
  const real = (id) => duel({ attackerCharacter: getCharacter(id), targetCharacter: getCharacter(id) }).attacker;
  assert.equal(strongestProjectile(real('0007')).id, 'attack5_object');
  assert.equal(strongestProjectile(real('0016')).id, 'attack3_object');
  assert.equal(strongestProjectile(real('0009')).id, 'attack3_object');
  assert.equal(strongestProjectile(real('0003')), null, 'nothing to copy');
});

// ---- The copy, then the throw ------------------------------------------------------------

test('a real hit copies the target\'s strongest projectile into the attacker\'s hands; its next mimic throws it, the projectile alone, the attacker\'s now', () => {
  const d = versus(def);
  d.tick(P('attack1'));
  after(d, 0.4);
  const [hit] = d.events.filter((e) => e.attacker === d.attacker);
  assert.deepEqual([hit.type, hit.copied, hit.siphoned], ['hit', 'attack5_object', 0], '#0001\'s sphere, its 10');
  const copy = d.attacker.combat.copy;
  assert.equal(copy.def, d.target.projectileDefs.attack5_object, 'its own definition');
  assert.equal(copy.sprites, d.target.sprites, 'its own art');
  assert.equal(copy.from, '0001');
  assert.equal(d.target.projectileDefs.attack5_object, copy.def, 'the target keeps its own');
  // The same button now throws.
  const atk = d.attacker.attackDef('attack1');
  assert.equal(atk.id, 'attack1', 'the same move');
  assert.equal(atk.hitbox, null, 'it strikes nothing itself');
  assert.equal(atk.projectile.borrowed.def, copy.def);
  assert.equal(atk.cooldown, 5, 'a copy that deals 10: the policy\'s 5 s');
  assert.equal(atk.energyCost, 0, 'and so no Energy');
  assert.equal(mimicThrow(d.attacker.attacks.attack1, copy), atk, 'built once per copy');
  d.target.body.x = d.attacker.body.x + 300;
  after(d, 0.3);
  d.tick(P('attack1'));
  after(d, 0.12);
  const [p] = thrown(d);
  assert.ok(p, 'thrown as its spawnAt crosses');
  assert.equal(p.def, copy.def);
  assert.equal(p.sprites, d.target.sprites, 'drawn at its thrower\'s art-pixel size');
  assert.equal(p.ability, 'attack1', 'the attack that threw it');
  assert.equal(d.attacker.combat.copy, null, 'out of its hands');
  assert.equal(d.attacker.attackDef('attack1'), d.attacker.attacks.attack1, 'a touch again');
  assert.ok(Math.abs(d.attacker.combat.cooldowns.get('attack1') - 5) < 0.2, 'its 5 s from the throw');
});

test('a copy too tall for its thrower leaves lifted clear of its feet, never lowered: it flies, never sunk into the floor it stands on', () => {
  const shot = (h) => createProjectileDefinition({ id: 's', animation: 's', speed: 300, damage: 1, hitbox: { x: -10, y: -h / 2, w: 20, h } });
  assert.deepEqual(throwOffset({ x: 30, y: -40 }, shot(20)), { x: 30, y: -40 }, 'a small one where the hand is');
  assert.deepEqual(throwOffset({ x: 30, y: -40 }, shot(116)), { x: 30, y: -58 - COPY_FLOOR_CLEARANCE }, 'a tall one lifted, its box clear');
  assert.deepEqual(throwOffset({ x: 30, y: -90 }, shot(116)), { x: 30, y: -90 }, 'never lowered');
  // #0001's sphere, 116 units tall, thrown from the ground by a hand 20 units
  // up: it flies on and strikes, where at the hand's height it would have
  // met the floor.
  const d = versus(def, {}, LOW);
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.equal(d.attacker.combat.copy?.id, 'attack5_object');
  assert.equal(d.attacker.attackDef('attack1').projectile.offset.y, -58 - COPY_FLOOR_CLEARANCE);
  d.target.body.x = d.attacker.body.x + 220;
  after(d, 0.3);
  d.tick(P('attack1'));
  after(d, 0.2);
  const [p] = thrown(d);
  assert.ok(p?.alive, 'in flight');
  const box = p.hitbox({});
  assert.ok(box.y + box.h <= d.attacker.body.y - COPY_FLOOR_CLEARANCE + 1e-9, 'its whole box over her feet');
  after(d, 0.6);
  assert.ok(d.events.some((e) => e.attacker === d.attacker && e.source === 'projectile' && e.type === 'hit' && e.damage === 10), 'it struck');
});

// Where the target of a copy thrown low stands: 200 units off for one that
// flies straight; for a lobbed one (`arc`, #0018's grenade), just short of
// where its curve brings it down to the floor from that low hand.
function reachOf(copy) {
  const def0 = copy.def;
  if (!def0.arc) return 200;
  const o = throwOffset(LOW.attacks.attack1.mimic.offset, def0);
  const clear = -o.y - (def0.hitbox.y + def0.hitbox.h);
  let t = 0;
  while (projectileDrop(def0, t) < clear) t += 1 / 120;
  return o.x + def0.speed * t - 16;
}

test('every copy the roster offers, thrown from the ground by a hand low down, flies and strikes', () => {
  for (const target of playableCharacters()) {
    const d = versus(target, { gap: 34 }, LOW);
    d.tick(P('attack1'));
    after(d, 0.6);
    const copy = d.attacker.combat.copy;
    if (!copy) continue;
    d.attacker.combat.setEnergy(100);
    d.target.combat.launchPoint = 0;
    after(d, 1.2);
    d.target.body.x = d.attacker.body.x + reachOf(copy);
    d.target.body.vx = 0;
    const from = d.events.length;
    d.tick(P('attack1'));
    after(d, 2.5);
    const landed = d.events.slice(from).filter((e) => e.attacker === d.attacker && e.source === 'projectile');
    assert.ok(landed.length > 0, `#${target.id}'s ${copy.id} flew and struck`);
  }
});

test('an ordinary copy costs its throw 15 Energy, as any thrown construct; a throw cut short before it lets go keeps the copy', () => {
  const d = versus(getCharacter('0016'));
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.equal(d.attacker.combat.copy?.id, 'attack3_object');
  d.target.body.x = d.attacker.body.x + 300;
  after(d, 0.3);
  const energy = d.attacker.combat.energy;
  d.tick(P('attack1'));
  assert.equal(d.attacker.combat.energy, energy - 15);
  after(d, 0.05);
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.3, hitstop: 0 }));
  after(d, 0.4);
  assert.equal(thrown(d).length, 0, 'nothing thrown');
  assert.equal(d.attacker.combat.copy?.id, 'attack3_object', 'still held');
});

test('a block takes nothing; a target that throws nothing gives up the siphon, all of it to the attacker, never past its bar', () => {
  const blocked = versus(def);
  blocked.tick(P('attack1'), { shield: true });
  after(blocked, 0.4, {}, { shield: true });
  assert.deepEqual(blocked.events.filter((e) => e.attacker === blocked.attacker).map((e) => [e.type, e.copied, e.siphoned]), [['block', null, 0]]);
  assert.equal(blocked.attacker.combat.copy, null);
  const d = versus(EMPTY);
  d.attacker.combat.setEnergy(30);
  d.tick(P('attack1'));
  after(d, 0.3);
  const [hit] = d.events.filter((e) => e.attacker === d.attacker);
  assert.deepEqual([hit.type, hit.copied, hit.siphoned], ['hit', null, 40]);
  assert.ok(d.attacker.combat.energy >= 70 - 1e-9, 'its 30 and the 40 it took');
  assert.equal(d.attacker.combat.copy, null);
  const full = versus(EMPTY);
  full.target.combat.setEnergy(20);
  full.tick(P('attack1'));
  after(full, 0.3);
  const took = full.events.find((e) => e.attacker === full.attacker).siphoned;
  assert.ok(took >= 20 && took < 40, `all it had, its 20 and its refill since (${took}), never more`);
  assert.equal(full.target.combat.energyExhausted, true, 'emptied: exhausted');
  assert.equal(full.attacker.combat.energy, MAX_ENERGY, 'never past the bar');
});

test('the CPU reads a held copy as a ranged throw of it, and the touch as a melee strike', () => {
  const d = versus(getCharacter('0016'));
  assert.ok(readMoveset(d.attacker).melee.some((m) => m.action === 'attack1' && m.atk.mimic));
  assert.equal(analyzeCapabilities(d.attacker).moves.find((m) => m.action === 'attack1' && !m.air).mimic.siphon, 40);
  d.tick(P('attack1'));
  after(d, 0.4);
  const ranged = readMoveset(d.attacker).ranged.find((r) => r.action === 'attack1');
  assert.ok(ranged, 'a throw now');
  assert.equal(ranged.proj, d.target.projectileDefs.attack3_object);
  assert.equal(analyzeCapabilities(d.attacker).copy, d.attacker.combat.copy);
});
