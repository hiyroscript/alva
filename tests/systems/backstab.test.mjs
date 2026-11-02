// Run with node --test tests/systems/backstab.test.mjs (no dependencies).
// A backstab (`backstab: { damage, baseLaunch, directionalLaunch, hitstun,
// hitstop }`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a hit that lands harder on a fighter with
// its back turned to where it comes from (backTurned). A real hit that
// finds its target so deals the backstab's damage, launch and stuns instead
// of its own, and its event says so; facing it, the hit is its own. A
// Shield blocks it like any hit, either way round. The cooldown policy
// weighs a move by the harder of the two, and the CPU values a backstab
// where its target's back is turned. Checked through the real Fighter,
// techniques and CombatSystem, for melee strikes, a technique's burst and a
// projectile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { backTurned, resolveHitEffects } from '../../js/game/combat/hit-effects.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { ROUTINE_EFFECTS } from '../../js/data/cooldowns.js';
import { def, duel, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };
const KILL = { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal' };

test('a backstab is a hit\'s own damage tier and launch: none by default, validated as any hit\'s, nothing else in it', () => {
  assert.equal(resolveHitEffects({}).backstab, null);
  const b = resolveHitEffects({ backstab: { ...KILL, hitstun: 0.6 } }).backstab;
  assert.deepEqual(b, { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.6, hitstop: null });
  assert.ok(Object.isFrozen(b));
  // On every kind of hit: an attack, a strike of a string, a projectile and
  // its finisher, a technique's burst.
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, backstab: KILL }).backstab.damage, 10);
  const multi = createAttackDefinition({ id: 'm', hitbox: BOX, backstab: KILL, hits: [{ at: 0.1, active: 0.05, damage: 1 }] });
  assert.equal(multi.hits[0].backstab.damage, 10, 'a strike takes its attack\'s');
  const shot = createProjectileDefinition({
    id: 'p', speed: 100, damage: 1, backstab: { damage: 5 }, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 },
  });
  assert.equal(shot.finisher.backstab.damage, 5, 'a finisher takes its projectile\'s');
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 5, backstab: KILL } } }).burst.hit.backstab.damage, 10);
  // Refused: a damage off the tiers, a field it may not declare, a way past
  // a Shield, a stun that is no time.
  assert.throws(() => resolveHitEffects({ backstab: { damage: 2 } }, 'Hit "x"'), /Hit "x"'s backstab declares damage 2/);
  assert.throws(() => resolveHitEffects({ backstab: { damage: 10, paralyze: 1 } }, 'Hit "x"'), /may declare only damage/);
  assert.throws(() => resolveHitEffects({ backstab: { damage: 10, unblockable: true } }, 'Hit "x"'), /every attack is blockable/);
  assert.throws(() => resolveHitEffects({ backstab: { damage: 10, hitstun: -1 } }), /hitstun and hitstop must be seconds/);
  assert.throws(() => resolveHitEffects({ backstab: 10 }), /must be a hit's damage and launch/);
  assert.throws(() => createAttackDefinition({ id: 'p', animation: 'a', pending: true, backstab: KILL }), /pending but declares backstab/);
});

test('the cooldown policy weighs a move by its backstab too: one that kills for 10 from behind waits 5 s', () => {
  assert.ok(ROUTINE_EFFECTS.includes('backstab'));
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 3, backstab: { damage: 5 } }), 'ordinary');
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 3, backstab: KILL }), 'tenDamage');
  assert.equal(cooldownClass('technique', { burst: { hitbox: BOX, hit: { damage: 5, backstab: KILL } } }), 'tenDamage');
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, backstab: KILL }).cooldown, 5);
});

test('a back is turned to a hit coming from the side it faces away from; level with it, to a hit travelling the way it faces', () => {
  const f = makeFighter({ x: 500, facing: 1 }).fighter;
  assert.equal(backTurned(f, 400, 1), true, 'from behind it');
  assert.equal(backTurned(f, 600, -1), false, 'from in front of it');
  assert.equal(backTurned(f, 500, 1), true, 'level with it, travelling the way it faces');
  assert.equal(backTurned(f, 500, -1), false, 'level with it, travelling at its face');
  assert.equal(backTurned(f, null, 1), true, 'no source: by the way the hit travels');
});

// A test-only fighter (#0001's body and clips) whose Jab is a backstab.
const STABBER = {
  ...def,
  id: 'test-stabber',
  attacks: { ...def.attacks, attack1: { ...def.attacks.attack1, backstab: KILL, hitCancel: null } },
};

test('a melee strike deals its backstab to a back turned to it, its own to a fighter facing it; a Shield blocks it either way', () => {
  for (const [targetFacing, damage, launch, stab] of [[-1, 3, 1, false], [1, 10, 3, true]]) {
    const d = duel({ attackerCharacter: STABBER, attackerSprites: fakeSpritesOf(STABBER), targetFacing });
    d.tick(P('attack1'));
    for (let i = 0; i < 30; i++) d.tick();
    const e = d.events[0];
    assert.deepEqual([e.type, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab], ['hit', damage, launch, 'horizontal', stab], `target facing ${targetFacing}`);
    assert.equal(d.target.combat.launchPoint, damage);
  }
  const shielded = duel({ attackerCharacter: STABBER, attackerSprites: fakeSpritesOf(STABBER), targetFacing: 1 });
  shielded.tick({}, { shield: true, shieldPressed: true });
  for (let i = 0; i < 20; i++) shielded.tick({}, { shield: true });
  shielded.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 30; i++) shielded.tick({}, { shield: true });
  assert.deepEqual([shielded.events[0].type, shielded.events[0].damage, shielded.events[0].backstab], ['block', 0, false]);
});

test('a technique\'s burst round its fighter backstabs a fighter behind it facing away, by where the hit comes from', () => {
  const caster = {
    ...def,
    id: 'test-burst-stabber',
    techniques: {
      ...def.techniques,
      attack4: { ...def.techniques.attack4, burst: { hitbox: { x: -200, y: -120, w: 400, h: 120 }, hit: { damage: 3, backstab: KILL } } },
    },
  };
  for (const [gap, targetFacing, damage] of [[60, -1, 3], [60, 1, 10], [-60, -1, 10], [-60, 1, 3]]) {
    const d = duel({ attackerCharacter: caster, attackerSprites: fakeSpritesOf(caster), gap, targetFacing });
    d.tick(P('attack4'));
    for (let i = 0; i < 120 && !d.events.length; i++) d.tick();
    assert.equal(d.events[0]?.damage, damage, `target ${gap > 0 ? 'ahead' : 'behind'}, facing ${targetFacing}`);
  }
});

test('the shared code names no fighter or move for it, and the CPU weighs a backstab where its target\'s back is turned', () => {
  const code = readFileSync(new URL('../../js/game/combat/hit-effects.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /000\d|attack\d|extra_attack/);
  const values = readFileSync(new URL('../../js/game/ai/cpu-intelligence/values.js', import.meta.url), 'utf8');
  assert.match(values, /backTurned/);
});
