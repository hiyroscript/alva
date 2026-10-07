// Run with node --test tests/fighters/0001/cpu-0001.test.mjs (no dependencies).
// The combat AI playing #0001, and playing against it, from its data
// alone (js/game/ai/moveset.js, js/game/ai/combat-ai.js): it reads Red and
// Maximum Blue as its projectiles, Blue's reach as its pull's, Unlimited
// Void and Hollow Purple as techniques on their own buttons, and in real
// fights it uses all of them; facing them, it never raises a Shield
// against a hit no Shield stops. Seeded CPUs on the real Fighter and
// CombatSystem (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuFight, DT, fakeSpritesOf, makeFighter, stageMap } from '../../helpers/fighter-harness.mjs';
import { CONFIG } from '../../../js/config.js';
import { getCharacter } from '../../../js/data/characters.js';
import { readMoveset } from '../../../js/game/ai/moveset.js';
import { CombatAIController } from '../../../js/game/ai/combat-ai.js';
import { attackReach } from '../../../js/game/combat/attacks.js';
import { Fighter } from '../../../js/game/fighters/fighter.js';
import { StageCollision } from '../../../js/game/physics.js';
import { mulberry32 } from '../../../js/core/utils.js';

const DEF = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

test('the CPU reads #0001\'s moves from its data: two projectiles, its close moves with their reach, two techniques', () => {
  const { fighter } = makeFighter({ character: DEF });
  const ms = readMoveset(fighter);
  assert.deepEqual(ms.ranged.map((r) => [r.action, r.id]), [['attack2', 'attack2'], ['attack3', 'attack3']]);
  assert.deepEqual(ms.specials.map((c) => [c.action, c.type]), [['attack4', 'technique'], ['attack5', 'technique']]);
  // Unlimited Void lands round it; Hollow Purple along its sphere's path.
  const [voidCast, purple] = ms.specials;
  assert.deepEqual(voidCast.box, DEF.techniques.attack4.burst.hitbox);
  assert.ok(purple.box.w > DEF.projectiles.attack5_object.speed, 'the sphere\'s whole flight');
  assert.ok(voidCast.hit.unblockable && voidCast.hit.paralyze > 0);
  // Blue's reach is its pull's circle, not just its palm.
  const blue = ms.melee.find((m) => m.id === 'midair_attack3');
  assert.deepEqual(blue.reach, attackReach(fighter.attacks.midair_attack3));
  assert.ok(blue.reach.w > DEF.attacks.midair_attack3.hitbox.w * 3);
  assert.equal(ms.melee.find((m) => m.id === 'midair_attack1').motion, 'hover');
  assert.equal(ms.melee.find((m) => m.id === 'midair_attack2').motion, 'homing');
});

test('CPU fights with #0001 use its whole kit: the Jab, the High Kick, Red, Maximum Blue, its aerials and its techniques', () => {
  const used = new Set();
  const techniques = new Set();
  const landed = new Set();
  for (const seed of [3, 5]) {
    for (const [a, b] of [[DEF, DEF_0002], [DEF_0002, DEF], [DEF, DEF]]) {
      const { log, events } = cpuFight(a, b, { seconds: 40, seed, difficulty: 'brutal' });
      for (const [f, steps] of log) {
        if (f.def !== DEF) continue;
        for (const s of steps) {
          if (s.attack) used.add(s.attack);
          if (s.technique) techniques.add(s.technique);
        }
      }
      for (const e of events) if (e.attacker.def === DEF && e.type === 'hit') landed.add(e.move);
    }
  }
  for (const id of ['attack1', 'attack2', 'attack3', 'extra_attack']) assert.ok(used.has(id), id);
  assert.ok(['midair_attack1', 'midair_attack2', 'midair_attack3'].filter((id) => used.has(id)).length >= 2, 'its aerials too');
  assert.deepEqual([...techniques].sort(), ['attack4', 'attack5'], 'both techniques');
  // Its orbs and the purple sphere land; Unlimited Void, a close-range
  // commitment the CPU casts sparingly, is checked cast above.
  for (const move of ['attack2_object', 'attack3_object', 'attack5_object']) assert.ok(landed.has(move), `${move} lands`);
});

test('facing Hollow Purple or Unlimited Void, the CPU never raises a Shield: it gets out of the way or erases it instead', () => {
  const stage = new StageCollision(stageMap());
  for (const [button, gap] of [['attack5', 420], ['attack4', 200]]) {
    let shields = 0;
    let answered = 0;
    for (let seed = 0; seed < 6; seed++) {
      let n = 0;
      const ai = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(600 + seed) });
      const foe = new Fighter({
        def: DEF, sprites: fakeSpritesOf(DEF), stage, slot: 'p1', spawn: { x: 800, facing: 1 },
        controller: { getInput: () => (n === 5 ? P(button) : {}) },
      });
      const cpu = new Fighter({ def: DEF, sprites: fakeSpritesOf(DEF), stage, slot: 'p2', spawn: { x: 800 + gap, facing: -1 }, controller: ai });
      foe.opponent = cpu;
      cpu.opponent = foe;
      const world = { stage, projectiles: [], clones: [], fighters: [foe, cpu], score: { p1: 0, p2: 0 }, timeLeft: 99 };
      const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
      cpu.update(DT, ctx);
      ai.thinkTimer = Infinity;
      let moved = false;
      for (; n < 150; n++) {
        foe.update(DT, ctx);
        cpu.update(DT, ctx);
        if (ai.out.shield) shields++;
        if (ai.out.jumpPressed || ai.out.runLeft || ai.out.runRight || cpu.dash) moved = true;
        // Or it meets the sphere with an erasing one of its own (its own
        // Hollow Purple: two erasing projectiles both go).
        const shot = cpu.technique?.def.projectile;
        if (shot && cpu.projectileDefs[shot.id]?.erase) moved = true;
      }
      if (moved) answered++;
    }
    assert.equal(shields, 0, `${button}: no Shield against what no Shield stops`);
    assert.ok(answered >= 3, `${button}: it moves to answer it (${answered}/6)`);
  }
});
