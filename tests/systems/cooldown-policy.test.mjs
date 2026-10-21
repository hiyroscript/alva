// The cooldown policy (js/data/cooldowns.js): exactly two special
// cooldowns, 5 s for a move that deals 10 damage and 3 s for one with an
// exceptional effect (a heal, a paralysis), derived from structured combat
// data for every kind of move; everything else only the universal 0.5 s
// repeat delay (none for a Deflect). No authored value bypasses it, the
// roster follows it, and the CPU obeys exactly what the player does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, duel, makeFighter } from '../helpers/fighter-harness.mjs';
import {
  COOLDOWN_CLASSES, EXCEPTIONAL_COOLDOWN, EXCEPTIONAL_EFFECTS, REPEAT_COOLDOWN, ROUTINE_EFFECTS, SPECIAL_COOLDOWNS, TEN_DAMAGE_COOLDOWN,
  cooldownClass, moveImpact, policyCooldown, resolveCooldown,
} from '../../js/data/cooldowns.js';
import { CHARACTERS, assertCombatRules, getCharacter } from '../../js/data/characters.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { createSummonDefinition } from '../../js/game/combat/summon.js';
import { createDeflectDefinition } from '../../js/game/combat/deflect.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { HIT_EFFECT_FIELDS } from '../../js/game/combat/hit-effects.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { analyzeCapabilities, moveReady } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { mulberry32 } from '../../js/core/utils.js';

const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const DEF_0003 = getCharacter('0003');
const BOX = { x: 0, y: -60, w: 30, h: 20 };
const P = (action) => ({ [action]: true, [`${action}Pressed`]: true });
const attack = (spec, projectiles) => createAttackDefinition({ id: 'a', hitbox: BOX, ...spec }, { projectiles });
const PROJECTILE = (spec) => ({ animation: 'o', speed: 400, lifetime: 1, hitbox: { x: -10, y: -10, w: 20, h: 20 }, ...spec });

test('the policy has exactly two special lengths, 3 s and 5 s, beside the 0.5 s repeat delay', () => {
  assert.equal(REPEAT_COOLDOWN, 0.5);
  assert.deepEqual([...SPECIAL_COOLDOWNS], [3, 5]);
  assert.deepEqual({ ...COOLDOWN_CLASSES }, { ordinary: null, exceptional: EXCEPTIONAL_COOLDOWN, tenDamage: TEN_DAMAGE_COOLDOWN });
  assert.equal(policyCooldown('ordinary'), 0.5);
  assert.equal(policyCooldown('ordinary', { exempt: true }), 0);
  assert.equal(policyCooldown('exceptional'), 3);
  assert.equal(policyCooldown('tenDamage'), 5);
  assert.throws(() => policyCooldown('legendary'), /Unknown cooldown class/);
});

test('1-2: a 3-damage or a 5-damage attack with nothing exceptional has only the repeat delay', () => {
  assert.equal(attack({ damage: 3 }).cooldown, 0.5);
  assert.equal(attack({ damage: 5, baseLaunch: 3, directionalLaunch: 'vertical' }).cooldown, 0.5);
  assert.equal(attack({ damage: 1 }).cooldownClass, 'ordinary');
});

test('3: an attack that deals 10 waits 5 s, a strike of a multi-hit one, or a total of 10, alike', () => {
  assert.equal(attack({ damage: 10 }).cooldown, 5);
  assert.equal(attack({ damage: 10 }).cooldownClass, 'tenDamage');
  const finisher = attack({ hits: [{ at: 0, active: 0.05, damage: 1 }, { at: 0.1, active: 0.05, damage: 10 }] });
  assert.equal(finisher.cooldown, 5, 'a 10-damage finisher strike');
  const total = attack({ hits: [{ at: 0, active: 0.05, damage: 5 }, { at: 0.1, active: 0.05, damage: 5 }] });
  assert.equal(total.damage, 10);
  assert.equal(total.cooldown, 5, 'its strikes add up to 10');
  const short = attack({ hits: [{ at: 0, active: 0.05, damage: 3 }, { at: 0.1, active: 0.05, damage: 5 }] });
  assert.equal(short.cooldown, 0.5, '8 in all is no ten-damage move');
  const slam = attack({ damage: 3, motion: { type: 'slam', fallSpeed: 900, impact: { hitbox: BOX, hit: { damage: 10 } } } });
  assert.equal(slam.cooldown, 5, 'a slam whose impact deals 10');
});

test('4-5: a move whose projectile, or its projectile\'s finisher, deals 10 waits 5 s', () => {
  const projectiles = {
    big: PROJECTILE({ damage: 10 }),
    grind: PROJECTILE({ damage: 1, pierce: { hits: 3, interval: 0.2 }, finisher: { damage: 10 } }),
    small: PROJECTILE({ damage: 3 }),
  };
  const throws = (id) => ({ hitbox: null, projectile: { id, spawnAt: 0.1, offset: { x: 0, y: 0 } } });
  assert.equal(attack(throws('big'), projectiles).cooldown, 5);
  assert.equal(attack(throws('grind'), projectiles).cooldown, 5, 'its finisher deals 10');
  assert.equal(attack(throws('small'), projectiles).cooldown, 0.5);
  const cast = (id) => createTechniqueDefinition({ id: 't', projectile: { id } }, { projectiles });
  assert.equal(cast('big').cooldown, 5, 'a technique\'s projectile counts too');
  assert.equal(cast('small').cooldown, 0.5);
  // The cooldown is the move's, not one per projectile or hitbox.
  assert.deepEqual(moveImpact('attack', throws('grind'), { projectiles }).hits.map((h) => h.damage), [1, 1, 10]);
  // The roster's: Hollow Purple's sphere and the Whirlwind's tornado finisher.
  const one = makeFighter({ character: DEF_0001 }).fighter;
  const two = makeFighter({ character: DEF_0002 }).fighter;
  assert.equal(one.techniqueDefs.attack5.cooldown, 5);
  assert.equal(two.attacks.extra_attack.cooldown, 5);
});

test('6-7: a healing technique and a paralysis (or any hard hold) wait 3 s', () => {
  assert.equal(createTechniqueDefinition({ id: 't', heal: 10 }).cooldown, 3);
  assert.equal(createTechniqueDefinition({ id: 't', heal: 10 }).cooldownClass, 'exceptional');
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 3, paralyze: 1.5 } } }).cooldown, 3);
  assert.equal(attack({ damage: 3, paralyze: 0.8 }).cooldown, 3, 'an attack that paralyzes');
  assert.equal(attack({ hits: [{ at: 0, active: 0.1, damage: 1, paralyze: 0.4 }] }).cooldown, 3, 'a strike that paralyzes');
  const projectiles = { hold: PROJECTILE({ damage: 1, pierce: { hits: 2, interval: 0.2 }, finisher: { damage: 3, paralyze: 0.6 } }) };
  assert.equal(attack({ hitbox: null, projectile: { id: 'hold', spawnAt: 0 } }, projectiles).cooldown, 3, 'a projectile finisher that paralyzes');
  // A summon is judged by its clone's attack.
  const attacks = { attack1: { hitbox: BOX, damage: 3, paralyze: 1 }, attack2: { hitbox: BOX, damage: 3 } };
  assert.equal(createSummonDefinition({ id: 's', attack: 'attack1', cloud: 'c' }, { attacks }).cooldown, 3);
  assert.equal(createSummonDefinition({ id: 's', attack: 'attack2', cloud: 'c' }, { attacks }).cooldown, 0.5);
  assert.equal(createSummonDefinition({ id: 's', attack: 'attack2', cloud: 'c', noGround: { attack: 'attack1' } }, { attacks }).cooldown, 3,
    'the more severe of its two attacks');
  // The roster's: Unlimited Void and the Mystical Palm Technique.
  assert.equal(makeFighter({ character: DEF_0001 }).fighter.techniqueDefs.attack4.cooldown, 3);
  assert.equal(makeFighter({ character: DEF_0003 }).fighter.techniqueDefs.attack4.cooldown, 3);
});

test('8-10: a pull, ordinary hitstun, a slam, a bounce, a launch or a quake earns nothing', () => {
  assert.equal(attack({ damage: 3, pull: { radius: 200, speed: 1300 } }).cooldown, 0.5, 'a pull');
  assert.equal(attack({ damage: 3, hitstun: 1.2, blockstun: 0.6, hitstop: 0.2 }).cooldown, 0.5, 'a long hitstun');
  assert.equal(attack({ damage: 5, baseLaunch: 3, directionalLaunch: 'vertical', quake: true, blockPush: 600 }).cooldown, 0.5, 'a launch, a quake, a shove');
  assert.equal(attack({ damage: 3, motion: { type: 'bounce', fallSpeed: 1400, rebound: 900 } }).cooldown, 0.5, 'a bounce');
  assert.equal(attack({ damage: 3, motion: { type: 'slam', fallSpeed: 1500, impact: { hitbox: BOX, hit: { damage: 5, quake: true } } } }).cooldown, 0.5, 'a slam');
  assert.equal(attack({ damage: 3, motion: { type: 'homing', range: 200, speed: 1000 } }).cooldown, 0.5, 'homing');
  assert.equal(attack({ damage: 3, carry: { lift: 300 } }).cooldown, 0.5, 'a carry');
  const projectiles = { orb: PROJECTILE({ damage: 1, pull: { radius: 140, speed: 360 }, pierce: { hits: 3, interval: 0.25 }, finisher: { damage: 3 } }) };
  assert.equal(attack({ hitbox: null, projectile: { id: 'orb', spawnAt: 0 } }, projectiles).cooldown, 0.5, 'a pulling, grinding orb');
  // The roster's: Blue and Maximum Blue pull, Cherry Blossom Impact quakes,
  // the Heavenly Foot of Pain slams, the Bounce Attack bounces.
  const one = makeFighter({ character: DEF_0001 }).fighter;
  const two = makeFighter({ character: DEF_0002 }).fighter;
  const three = makeFighter({ character: DEF_0003 }).fighter;
  assert.equal(one.attacks.attack3.cooldown, 0.5);
  assert.equal(one.attacks.midair_attack3.cooldown, 0.5);
  assert.equal(three.techniqueDefs.attack3.cooldown, 0.5);
  assert.equal(three.attacks.midair_attack2.cooldown, 0.5);
  assert.equal(two.attacks.midair_attack2.cooldown, 0.5);
});

test('11: a move that qualifies for both waits 5 s, never 8: the special cooldowns never add up', () => {
  assert.equal(attack({ damage: 10, paralyze: 1 }).cooldown, 5);
  assert.equal(createTechniqueDefinition({ id: 't', heal: 5, burst: { hitbox: BOX, hit: { damage: 10, paralyze: 1 } } }).cooldown, 5);
  assert.equal(createTechniqueDefinition({ id: 't', heal: 5, burst: { hitbox: BOX, hit: { damage: 10, paralyze: 1 } } }).cooldownClass, 'tenDamage');
});

test('12: an authored cooldown the policy does not give is refused, as the move is built and as a fighter registers', () => {
  for (const cooldown of [2, 4, 6, 8, 10, 12]) {
    assert.throws(() => attack({ damage: 3, cooldown }), /the cooldown policy gives it 0.5 s/, `${cooldown}`);
    assert.throws(() => attack({ damage: 10, cooldown }), /the cooldown policy gives it 5 s/, `${cooldown}`);
    assert.throws(() => createTechniqueDefinition({ id: 't', heal: 10, cooldown }), /the cooldown policy gives it 3 s/, `${cooldown}`);
  }
  assert.throws(() => attack({ damage: 10, cooldown: 0.5 }), /gives it 5 s/, 'a ten-damage move cannot keep the baseline either');
  assert.throws(() => attack({ damage: 3, cooldown: 3 }), /gives it 0.5 s/, 'nor an ordinary one borrow a special length');
  // What the policy gives, it accepts.
  assert.equal(attack({ damage: 10, cooldown: 5 }).cooldown, 5);
  assert.equal(attack({ damage: 3, cooldown: 0.5 }).cooldown, 0.5);
  assert.equal(resolveCooldown(undefined, 'x', { cls: 'exceptional' }), 3);
  // A fighter that authors an 8-second move never registers.
  const greedy = { ...DEF_0001, attacks: { ...DEF_0001.attacks, attack1: { ...DEF_0001.attacks.attack1, cooldown: 8 } } };
  assert.throws(() => assertCombatRules(greedy), /Attack "attack1" declares cooldown 8/);
  const slowHeal = { ...DEF_0003, techniques: { ...DEF_0003.techniques, attack4: { ...DEF_0003.techniques.attack4, cooldown: 12 } } };
  assert.throws(() => assertCombatRules(slowHeal), /Technique "attack4" declares cooldown 12/);
  const shortDeflect = { ...DEF_0002, deflect: { ...DEF_0002.deflect, cooldown: 0.05 } };
  assert.throws(() => assertCombatRules(shortDeflect), /Attack "deflect" declares cooldown 0.05: the cooldown policy gives it 0 s/);
  // And a fighter cannot get one past the Fighter either.
  assert.throws(() => makeFighter({ character: greedy }), /declares cooldown 8/);
});

test('the roster: every move\'s cooldown, reclassified from its mechanics', () => {
  const table = {
    '0001': { attack1: 0.5, midair_attack1: 0.5, attack2: 0.5, midair_attack2: 0.5, attack3: 0.5, midair_attack3: 0.5, extra_attack: 0.5, attack4: 3, attack5: 5, deflect: 0 },
    '0002': { attack1: 0.5, midair_attack1: 0.5, attack2: 0.5, midair_attack2: 0.5, attack3: 0.5, midair_attack3: 0.5, extra_attack: 5, deflect: 0 },
    '0003': { attack1: 0.5, midair_attack1: 0.5, attack2: 0.5, midair_attack2: 0.5, extra_attack: 0.5, attack3: 0.5, attack4: 3, deflect: 0 },
    // Ievan Polkka's double: six strikes adding up to 10; World is Mine: a charm.
    '0004': { attack1: 0.5, midair_attack1: 0.5, attack2: 0.5, midair_attack2: 0.5, attack3: 0.5, midair_attack3: 0.5, extra_attack: 0.5, attack4: 5, attack5: 3, deflect: 0 },
    // The Deadlights: a float; the Red Balloon: its phantom's bite frightens
    // (the bite itself, its attack5, the same: a fear).
    '0005': { attack1: 0.5, midair_attack1: 0.5, attack2: 0.5, midair_attack2: 0.5, attack3: 0.5, midair_attack3: 0.5, attack5: 3, extra_attack: 0.5, attack4: 3, deflect: 0 },
    // Ice Breath: a freeze.
    '0006': { attack1: 0.5, midair_attack1: 0.5, attack2: 0.5, midair_attack2: 0.5, extra_attack: 0.5, attack3: 0.5, attack4: 3, attack5: 0.5, deflect: 0 },
  };
  for (const c of CHARACTERS) {
    const f = makeFighter({ character: c }).fighter;
    const got = { deflect: f.deflect?.cooldown };
    for (const [id, a] of Object.entries(f.attacks)) got[id] = a.cooldown;
    for (const [id, t] of Object.entries(f.techniqueDefs)) got[id] = t.cooldown;
    for (const [id, s] of Object.entries(f.summonDefs)) got[id] = s.cooldown;
    assert.deepEqual(got, table[c.id], `#${c.id}`);
    // No definition authors a cooldown at all any more: it is derived.
    for (const group of ['attacks', 'techniques', 'summons']) {
      for (const [id, spec] of Object.entries(c[group] ?? {})) assert.equal('cooldown' in spec, false, `#${c.id} ${id}`);
    }
    assert.equal('cooldown' in (c.deflect ?? {}), false, `#${c.id} deflect`);
  }
});

test('every effect a hit or a move can carry is classified, exceptional or routine, on purpose', () => {
  for (const field of HIT_EFFECT_FIELDS) {
    assert.ok(EXCEPTIONAL_EFFECTS.includes(field) || ROUTINE_EFFECTS.includes(field), `${field} is classified`);
  }
  for (const field of EXCEPTIONAL_EFFECTS) assert.equal(ROUTINE_EFFECTS.includes(field), false, field);
  assert.deepEqual([...EXCEPTIONAL_EFFECTS], ['heal', 'paralyze', 'charm', 'float', 'fear']);
  for (const routine of ['pull', 'quake', 'gaze', 'blockPush', 'carry', 'repel', 'erase', 'motion', 'hitstun']) assert.ok(ROUTINE_EFFECTS.includes(routine), routine);
  // Classification reads data only: a move called anything is judged the same.
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 3, animation: 'hollow_purple' }), 'ordinary');
});

test('13: a technique broken during its cast keeps the cooldown it began on acceptance; nothing re-casts through it', () => {
  for (const [button, seconds] of [['attack4', 3], ['attack5', 5]]) {
    const d = duel({ attackerCharacter: DEF_0001, gap: 300 });
    d.tick({});
    d.tick(P(button));
    assert.ok(d.attacker.technique, `${button}: casting`);
    new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
    assert.equal(d.attacker.technique, null, `${button}: broken`);
    const cd = d.attacker.combat.abilityCooldowns;
    assert.ok(Math.abs(cd.remaining(button) - seconds) < 1e-9, `${button}: its ${seconds} s runs on`);
    let refused = true;
    for (let i = 0; i < Math.round((seconds - 0.2) / DT); i++) {
      d.tick(i % 7 === 0 ? P(button) : {});
      if (d.attacker.technique) refused = false;
    }
    assert.ok(refused, `${button}: never cast again before it is over`);
    d.until(() => !cd.active(button));
    d.tick(P(button));
    assert.ok(d.attacker.technique, `${button}: ready once it is over`);
  }
});

test('14: the CPU and the player read the same cooldowns and the CPU never presses through one', () => {
  for (const c of CHARACTERS) {
    const player = makeFighter({ character: c }).fighter;
    const cpu = new Fighter({
      def: c, sprites: player.sprites, stage: player.stage, slot: 1, label: 'CPU',
      controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(1) }), spawn: { x: 900, facing: -1 },
    });
    const of = (f) => [
      ...Object.values(f.attacks).map((a) => a.cooldown), ...Object.values(f.techniqueDefs).map((t) => t.cooldown), f.deflect?.cooldown,
    ];
    assert.deepEqual(of(cpu), of(player), `#${c.id}`);
    // What the CPU plans with is the very same cooldown.
    cpu.opponent = player;
    for (const m of analyzeCapabilities(cpu).moves) {
      const planned = m.kind === 'technique' || m.kind === 'summon' ? m.abilityCooldown : m.cooldown;
      assert.equal(planned, m.def.cooldown, `#${c.id} ${m.id}`);
    }
    for (const m of analyzeCapabilities(cpu).moves.filter((x) => x.kind === 'technique')) {
      assert.equal(moveReady(cpu, m), true, `#${c.id} ${m.id}: ready`);
      cpu.combat.abilityCooldowns.start(m.id, m.def.cooldown);
      assert.equal(moveReady(cpu, m), false, `#${c.id} ${m.id}: cooling, never pressed`);
    }
  }
});
