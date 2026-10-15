// Run with node --test tests/systems/hit-effects.test.mjs (no dependencies).
// The shared hit effects (js/game/combat/hit-effects.js), what any hit may
// do beyond its damage and launch: `paralyze` (a timed hold that a launch
// ends) and `blockPush` (a Shield that blocks it is shoved back); that no
// effect gets past a raised Shield, and that a way past one (`unblockable`
// and the rest) is refused; and a Shield's `stall` (a melee blow it blocks
// freezes its attacker; see js/game/combat/defense.js). Checked with
// bespoke hits through the real CombatSystem.applyHit, then in play on the
// real Fighter (see tests/helpers/fighter-harness.mjs). Nothing here names
// a fighter's move: #0001 is only the body the hits land on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HIT_EFFECT_FIELDS, resolveHitEffects } from '../../js/game/combat/hit-effects.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { createSummonDefinition } from '../../js/game/combat/summon.js';
import { SHIELD_BYPASS_FIELDS } from '../../js/game/combat/offense.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { getCharacter } from '../../js/data/characters.js';
import { def, DT, duel, makeFighter, steps, probeHit } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const SHIELD = { shield: true, shieldPressed: true };
const HOLD = { shield: true };

// A bespoke hit: no damage and no launch unless given (a probe, see
// probeHit), its own stuns.
const hit = (spec = {}) => probeHit({
  id: 'testHit', damage: 0, hitstun: 0.2, blockstun: 0.12, hitstop: 0, ...spec,
});

// An attacker and a target side by side (the target at x 540, facing it),
// and a CombatSystem to resolve hits between them.
function pair({ shield = false } = {}) {
  const a = makeFighter({ x: 500 });
  const t = makeFighter({ x: 540, facing: -1 });
  a.fighter.opponent = t.fighter;
  t.fighter.opponent = a.fighter;
  if (shield) {
    t.step(SHIELD);
    for (let i = 0; i < steps(def.defense.perfectWindow) + 2; i++) t.step(HOLD);
    assert.equal(t.fighter.combat.shielding, true);
  }
  return { attacker: a.fighter, target: t.fighter, step: t.step, system: new CombatSystem() };
}

// ---- Data ---------------------------------------------------------------------------

test('every effect is optional, and its default changes nothing', () => {
  assert.deepEqual([...HIT_EFFECT_FIELDS], ['paralyze', 'blockPush', 'quake', 'charm']);
  assert.deepEqual(resolveHitEffects(undefined), { paralyze: 0, blockPush: 0, quake: false, charm: 0 });
  assert.deepEqual(resolveHitEffects({ damage: 5 }), { paralyze: 0, blockPush: 0, quake: false, charm: 0 });
  assert.deepEqual(resolveHitEffects({ paralyze: 1.5, blockPush: 400 }), { paralyze: 1.5, blockPush: 400, quake: false, charm: 0 });
  assert.deepEqual(resolveHitEffects({ quake: true }), { paralyze: 0, blockPush: 0, quake: true, charm: 0 });
  assert.deepEqual(resolveHitEffects({ charm: 2.5 }), { paralyze: 0, blockPush: 0, quake: false, charm: 2.5 });
  // An attack, a projectile, a technique's burst and a finisher all carry
  // them, resolved the same way.
  assert.equal(hit().unblockable, undefined, 'no hit has a way past a Shield');
  assert.equal(hit({ paralyze: 1 }).paralyze, 1);
  const proj = createProjectileDefinition({
    id: 'testShot', speed: 100, damage: 1, paralyze: 0.5, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 },
  });
  assert.equal(proj.finisher.paralyze, 0.5, 'a finisher inherits its projectile\'s');
  const tech = createTechniqueDefinition({
    id: 'testCast', castAnimation: 'a', releaseAnimation: 'b', burst: { hitbox: { x: -1, y: -1, w: 2, h: 2 }, hit: { damage: 1, paralyze: 2 } },
  });
  assert.equal(tech.burst.hit.paralyze, 2);
  // A multi-hit attack's strikes take the attack's unless they say.
  const multi = createAttackDefinition({
    id: 'testMulti', hitbox: { x: 0, y: -10, w: 10, h: 10 }, blockPush: 300,
    hits: [{ at: 0.1, active: 0.05, damage: 1 }, { at: 0.2, active: 0.05, damage: 1, blockPush: 0 }],
  });
  assert.deepEqual(multi.hits.map((h) => h.blockPush), [300, 0]);
});

test('a value of the wrong kind is refused, naming its owner', () => {
  assert.throws(() => resolveHitEffects({ unblockable: 'yes' }, 'Hit "x"'), /Hit "x" declares unblockable: every attack is blockable/);
  assert.throws(() => resolveHitEffects({ paralyze: -1 }), /paralyze must be seconds from 0/);
  assert.throws(() => resolveHitEffects({ blockPush: '520' }), /blockPush must be a speed from 0/);
  assert.throws(() => resolveHitEffects({ quake: 'yes' }), /quake must be true or false/);
  assert.throws(() => hit({ paralyze: 'long' }), /Attack "testHit"'s paralyze/);
  assert.throws(() => createProjectileDefinition({ id: 'testShot', damage: 1, blockPush: -5 }), /Projectile "testShot"'s blockPush/);
});

test('nothing in the shared code names a fighter or a move', () => {
  const code = readFileSync(new URL('../../js/game/combat/hit-effects.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /000\d|attack\d|extra_attack|technique|projectile/);
});

// ---- No way past a Shield --------------------------------------------------------------

test('a way past a Shield is refused wherever a hit is built: an attack, a strike, a projectile, a finisher, a burst, a summon', () => {
  for (const field of SHIELD_BYPASS_FIELDS) {
    for (const value of [true, false]) {
      const way = { [field]: value };
      assert.throws(() => resolveHitEffects(way, 'Hit "x"'), new RegExp(`Hit "x" declares ${field}: every attack is blockable`));
      assert.throws(() => hit(way), /Attack "testHit" declares/);
      assert.throws(() => createAttackDefinition({ id: 'testPending', animation: 'a', pending: true, ...way }), /Attack "testPending" declares/);
      assert.throws(() => createAttackDefinition({
        id: 'testMulti', hitbox: { x: 0, y: -10, w: 10, h: 10 }, hits: [{ at: 0.1, active: 0.05, damage: 1, ...way }],
      }), /testMulti" hit 1 declares/);
      assert.throws(() => createProjectileDefinition({ id: 'testShot', damage: 1, ...way }), /Projectile "testShot" declares/);
      assert.throws(() => createProjectileDefinition({
        id: 'testShot', damage: 1, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3, ...way },
      }), /finisher declares/);
      assert.throws(() => createTechniqueDefinition({
        id: 'testCast', castAnimation: 'a', releaseAnimation: 'b', burst: { hitbox: { x: -1, y: -1, w: 2, h: 2 }, hit: { damage: 1, ...way } },
      }), /declares/);
      assert.throws(() => createTechniqueDefinition({ id: 'testCast', castAnimation: 'a', releaseAnimation: 'b', projectile: { id: 'x' }, ...way }), /Technique "testCast" declares/);
      assert.throws(() => createSummonDefinition({ id: 'testSummon', attack: 'attack1', cloud: 'c', ...way }), /Summon "testSummon" declares/);
    }
  }
});

test('a hit that once got past a Shield is blocked like any other: nothing through, whatever its damage, launch or effects', () => {
  // Even a hand-built definition that still carries the old field: applyHit
  // never reads it.
  for (const spec of [
    { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal' },
    { damage: 3, paralyze: 1.8 },
    { damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', carry: { lift: 300 } },
  ]) {
    const { attacker, target, system } = pair({ shield: true });
    target.combat.launchPoint = 50;
    const energy = target.combat.energy;
    const legacy = Object.freeze({ ...hit(spec), unblockable: true });
    const e = system.applyHit(attacker, target, legacy, { velocity: { x: 900, y: 0 } });
    assert.equal(e.type, 'block', JSON.stringify(spec));
    assert.equal(e.attack, true, 'an attack, blocked');
    assert.equal(e.damage, 0);
    assert.equal(e.launchStrength, 0);
    assert.equal(e.launchSpeed, 0);
    assert.equal(e.hitstun, 0);
    assert.equal(e.paralysis, 0);
    assert.equal(e.energyCost, target.energyDef.shieldHitCost, 'the Shield pays for it like any block');
    assert.equal(target.combat.energy, energy - e.energyCost);
    assert.equal(target.combat.launchPoint, 50, 'its Launch Point never moves');
    assert.equal(target.combat.stun, 0);
    assert.equal(target.combat.immobilized, false);
    assert.equal(target.body.vx, 0, 'neither launched nor carried');
    assert.equal(target.body.vy, 0);
    assert.equal(target.combat.shielding, true);
  }
});

// ---- Paralyze -----------------------------------------------------------------------

test('a paralysing hit holds its target for its seconds: no acting, no sideways speed, its hurt pose', () => {
  const { attacker, target, step, system } = pair();
  const e = system.applyHit(attacker, target, hit({ damage: 3, paralyze: 1, hitstun: 0.1 }));
  assert.equal(e.paralysis, 1);
  assert.equal(target.combat.immobilized, true);
  let held = 0;
  for (let i = 0; i < 600; i++) {
    step({ runRight: true, ...(i % 7 === 0 ? P('attack1') : {}) });
    if (!target.combat.immobilized) break;
    held++;
    assert.equal(target.combat.attack, null, 'it never attacks');
    assert.equal(target.body.vx, 0, 'held in place');
    assert.equal(target.canAct(), false);
    assert.equal(target.animator.anim.key, 'hurt');
  }
  assert.equal(held + 1, steps(1), 'exactly a second');
  assert.equal(target.combat.paralysis, 0, 'free once it runs out');
});

test('a longer hold wins, a hit that only stuns keeps it, and any launching hit ends it at once', () => {
  const { attacker, target, system } = pair();
  system.applyHit(attacker, target, hit({ paralyze: 1.5 }));
  system.applyHit(attacker, target, hit({ paralyze: 0.5 }));
  assert.equal(target.combat.paralysis, 1.5, 'the longer hold');
  system.applyHit(attacker, target, hit({ damage: 3 }));
  assert.equal(target.combat.paralysis, 1.5, 'a hit that launches nothing keeps it');
  const e = system.applyHit(attacker, target, hit({ damage: 5, baseLaunch: 2, directionalLaunch: 'vertical' }));
  assert.ok(e.launchSpeed > 0);
  assert.equal(target.combat.paralysis, 0, 'the launch is never held back');
  assert.ok(target.body.vy < 0, 'up it goes');
  // A paralysing hit that launches holds nothing.
  const other = pair();
  const both = other.system.applyHit(other.attacker, other.target, hit({ damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', paralyze: 2 }));
  assert.equal(both.paralysis, 0);
  assert.equal(other.target.combat.immobilized, false);
});

test('a blocked paralysing hit holds nothing; a paralysis never runs down during an impact freeze', () => {
  const blocked = pair({ shield: true });
  const e = blocked.system.applyHit(blocked.attacker, blocked.target, hit({ paralyze: 2 }));
  assert.equal(e.type, 'block');
  assert.equal(e.paralysis, 0);
  assert.equal(blocked.target.combat.immobilized, false);
  const { attacker, target, step, system } = pair();
  system.applyHit(attacker, target, hit({ paralyze: 0.5, hitstop: 0.1 }));
  step({});
  assert.equal(target.combat.paralysis, 0.5, 'frozen: the hold waits');
  for (let i = 0; i < steps(0.1); i++) step({});
  assert.ok(target.combat.paralysis < 0.5, 'then it runs down');
});

test('a paralysed fighter is not drawn in by a pull, and still falls under gravity in the air', () => {
  const { attacker, target, step, system } = pair();
  system.applyHit(attacker, target, hit({ paralyze: 1 }));
  const shot = { alive: true, owner: attacker, x: 700, y: 760, direction: -1, def: { pull: { radius: 400, speed: 900, offset: { x: 0, y: 0 } } } };
  applyPulls([attacker, target], [shot], DT);
  assert.equal(target.body.vx, 0, 'it holds where it is');
  Object.assign(target.body, { y: 600, grounded: false, ground: null, vy: 0 });
  step({});
  assert.ok(target.body.vy > 0, 'falling');
  assert.equal(target.body.vx, 0);
});

// ---- Block push and stall --------------------------------------------------------------

test('a blocked hit with blockPush shoves the Shield along the hit\'s direction; one without, nothing', () => {
  const { attacker, target, system } = pair({ shield: true });
  target.body.vx = 0;
  const e = system.applyHit(attacker, target, hit({ blockPush: 520 }), { facing: 1 });
  assert.equal(e.type, 'block');
  assert.equal(target.body.vx, 520);
  const plain = pair({ shield: true });
  plain.target.body.vx = 0;
  plain.system.applyHit(plain.attacker, plain.target, hit(), { facing: 1 });
  assert.equal(plain.target.body.vx, 0);
  // A real hit is no block: it pushes nothing of its own.
  const real = pair();
  real.target.body.vx = 0;
  real.system.applyHit(real.attacker, real.target, hit({ blockPush: 520 }), { facing: 1 });
  assert.equal(real.target.body.vx, 0);
});

test('a Shield that stalls freezes the melee attacker it blocks for at least its stall; detached hits stall nothing', () => {
  const stall = def.defense.stall;
  assert.ok(stall > 0, '#0001\'s Shield stalls');
  // Melee, in play: the attacker freezes in the Shield.
  const d = duel({ gap: 40 });
  d.tick({}, SHIELD);
  for (let i = 0; i < steps(def.defense.perfectWindow) + 2; i++) d.tick({}, HOLD);
  d.tick(P('attack1'), HOLD);
  for (let i = 0; i < 30 && !d.events.length; i++) d.tick({}, HOLD);
  const [e] = d.events;
  assert.equal(e.type, 'block');
  assert.equal(e.stall, stall);
  assert.ok(Math.abs(d.attacker.combat.hitstop - stall) < 1e-9, 'frozen for the stall');
  // A Shield with no stall: the hit's own hitstop only.
  const plain = duel({ gap: 40, targetCharacter: getCharacter('0002') });
  plain.tick({}, SHIELD);
  for (let i = 0; i < steps(0.2); i++) plain.tick({}, HOLD);
  plain.tick(P('attack1'), HOLD);
  for (let i = 0; i < 30 && !plain.events.length; i++) plain.tick({}, HOLD);
  assert.equal(plain.events[0].type, 'block');
  assert.equal(plain.events[0].stall, 0);
  assert.ok(Math.abs(plain.attacker.combat.hitstop - def.attacks.attack1.hitstop) < 1e-9);
  // Detached: a projectile's block freezes nobody but the target.
  const { attacker, target, system } = pair({ shield: true });
  const ev = system.applyHit(attacker, target, hit({ hitstop: 0.05 }), { detached: true });
  assert.equal(ev.stall, 0);
  assert.equal(attacker.combat.hitstop, 0);
});
