// Run with node --test tests/systems/volley.test.mjs (no dependencies).
// A volley (`volley: { count, interval }` on an attack's `projectile`
// entry, see js/game/combat/attacks.js): one throw of several shots of the
// same projectile, the first at `spawnAt` and each next one `interval`
// later, each a projectile of its own, all one use of the move (one press,
// one Energy cost, one cooldown, released with the first). A hit on the
// thrower stops the shots still to come; a Shield that blocks any shot
// stops the volley (its shots still flying are gone, no more are thrown),
// so it never costs a Shield more than one block. Checked through the real
// Fighter, Projectile and CombatSystem, on a test fighter (#0001's body
// and clips) whose Red is thrown as a volley.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAttackDefinition, lastShotAt } from '../../js/game/combat/attacks.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { cooldownClass, moveImpact } from '../../js/data/cooldowns.js';
import { BLOCK_ENERGY_COST, CONSTRUCT_ENERGY_COST } from '../../js/data/energy.js';
import { CONFIG } from '../../js/config.js';
import { def, duel, fakeSpritesOf, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const SHOT = { id: 'attack2_object', spawnAt: 0.1, offset: { x: 40, y: -60 } };

// #0001's Red, made light (1, no launch, no push, no repel) and thrown three
// at a time, a fifteenth of a second apart.
const THROWER = {
  ...def,
  id: 'test-volley',
  attacks: {
    ...def.attacks,
    attack2: {
      ...def.attacks.attack2, startup: 0.1, active: 0.15, recovery: 0.15,
      projectile: { ...def.attacks.attack2.projectile, spawnAt: 0.1, volley: { count: 3, interval: 1 / 15 } },
    },
  },
  projectiles: {
    ...def.projectiles,
    attack2_object: {
      ...def.projectiles.attack2_object, damage: 1, baseLaunch: 0, directionalLaunch: null, blockPush: 0, repel: false,
      hitstun: 0.2, speed: 900,
    },
  },
};

const thrower = (opts = {}) => duel({ attackerCharacter: THROWER, attackerSprites: fakeSpritesOf(THROWER), ...opts });

test('a volley is validated as the attack is built: two or more shots, a fixed step apart at least, the last within the attack', () => {
  const ok = createAttackDefinition({ id: 'v', hitbox: null, total: 1, startup: 0.1, active: 0.2, recovery: 0.2, projectile: { ...SHOT, volley: { count: 3, interval: 0.1 } } });
  assert.deepEqual(ok.projectile.volley, { count: 3, interval: 0.1 });
  assert.ok(Object.isFrozen(ok.projectile.volley));
  assert.equal(lastShotAt(ok), 0.1 + 2 * 0.1);
  assert.equal(ok.releaseAt, 0.1, 'released with its first shot');
  const lone = createAttackDefinition({ id: 'l', hitbox: null, projectile: SHOT });
  assert.equal(lone.projectile.volley, null, 'a lone shot has none');
  assert.equal(lastShotAt(lone), 0.1);
  const build = (volley, recovery = 0.3) => createAttackDefinition({ id: 'x', hitbox: null, startup: 0.1, active: 0.1, recovery, projectile: { ...SHOT, volley } });
  assert.throws(() => build({ count: 1, interval: 0.1 }), /volley needs a whole count of 2 or more/);
  assert.throws(() => build({ count: 2.5, interval: 0.1 }), /volley needs a whole count of 2 or more/);
  assert.throws(() => build({ count: 3, interval: CONFIG.sim.step / 2 }), /interval of at least one fixed step/);
  assert.throws(() => build({ count: 3, interval: -1 }), /interval of at least one fixed step/);
  assert.throws(() => build({ count: 3, interval: 0.2 }, 0.1), /last shot after the attack is over/);
  // A technique lets go of one projectile, never a volley.
  assert.throws(() => createTechniqueDefinition({ id: 't', castAnimation: 'a_cast', releaseAnimation: 'a_release', projectile: { id: 'a_object', volley: { count: 2, interval: 0.1 } } }), /only an attack throws one/);
});

test('the cooldown policy counts every shot of a volley: three of 1 are ordinary, four of 3 add up to 10', () => {
  const projectiles = { s_object: { damage: 1 }, h_object: { damage: 3 } };
  const three = { hitbox: null, projectile: { id: 's_object', spawnAt: 0, volley: { count: 3, interval: 0.1 } } };
  assert.equal(moveImpact('attack', three, { projectiles }).hits.length, 3);
  assert.equal(cooldownClass('attack', three, { projectiles }), 'ordinary');
  const four = { hitbox: null, projectile: { id: 'h_object', spawnAt: 0, volley: { count: 4, interval: 0.1 } } };
  assert.equal(cooldownClass('attack', four, { projectiles }), 'tenDamage', '4 x 3 = 12');
});

test('one press throws every shot, one after another from the same hand, each aimed where the fighter faces as it leaves', () => {
  const d = thrower({ gap: 2000 });
  const energy = d.attacker.combat.energy;
  d.tick(P('attack2'));
  assert.equal(energy - d.attacker.combat.energy, CONSTRUCT_ENERGY_COST, 'one Energy cost for the whole volley, as it starts');
  const spawned = [];
  for (let i = 0; i < steps(0.5); i++) {
    const before = d.projectiles.length;
    d.tick();
    if (d.projectiles.length > before) spawned.push(d.attacker.combat.attack ? d.attacker.combat.attack.time : null);
  }
  assert.equal(d.projectiles.length, 3, 'three shots in the air');
  assert.equal(spawned.length, 3, 'one a step at most');
  assert.ok(Math.abs(spawned[1] - spawned[0] - 1 / 15) < 1e-6 && Math.abs(spawned[2] - spawned[1] - 1 / 15) < 1e-6, `a fifteenth apart: ${spawned}`);
  assert.equal(new Set(d.projectiles.map((p) => p.volleyOf)).size, 1, 'one throw');
  assert.ok(d.projectiles.every((p) => p.direction === 1 && p.ability === 'attack2'));
  assert.ok(d.attacker.combat.energy > energy - CONSTRUCT_ENERGY_COST, 'nothing more paid for the later shots');
});

test('every shot strikes on its own: three light hits on a fighter in their way', () => {
  const d = thrower({ gap: 140 });
  d.tick(P('attack2'));
  for (let i = 0; i < steps(0.8); i++) d.tick();
  const hits = d.events.filter((e) => e.type === 'hit');
  assert.equal(hits.length, 3);
  assert.ok(hits.every((e) => e.source === 'projectile' && e.damage === 1));
  assert.equal(d.target.combat.launchPoint, 3);
});

test('a hit on the thrower stops the shots still to come; those already thrown fly on', () => {
  const d = thrower({ gap: 2000 });
  d.tick(P('attack2'));
  for (let i = 0; i < steps(0.12); i++) d.tick();
  assert.equal(d.projectiles.length, 1);
  d.attacker.combat.stun = 0.5;
  for (let i = 0; i < steps(0.4); i++) d.tick();
  assert.equal(d.attacker.combat.attack, null, 'the throw is over');
  assert.equal(d.projectiles.length, 1, 'nothing more was thrown');
});

test('a Shield that blocks a shot stops the volley: the rest gone, none more thrown, one block paid for', () => {
  const d = thrower({ gap: 90 });
  d.tick({}, { shield: true, shieldPressed: true });
  for (let i = 0; i < 20; i++) d.tick({}, { shield: true });
  d.tick(P('attack2'), { shield: true });
  for (let i = 0; i < steps(0.8); i++) d.tick({}, { shield: true });
  const blocks = d.events.filter((e) => e.type === 'block');
  assert.equal(blocks.length, 1, 'one block');
  assert.equal(blocks[0].energyCost, BLOCK_ENERGY_COST, 'one block paid for');
  assert.equal(d.events.filter((e) => e.type === 'hit').length, 0);
  assert.equal(d.projectiles.length, 0, 'no shot of it left flying');
  assert.ok(d.attacker.combat.attack === null || d.attacker.combat.attack.volleyStopped, 'the throw throws no more');
});

test('a shot turned back is its deflector\'s and no longer part of the volley', () => {
  const d = thrower({ gap: 2000 });
  d.tick(P('attack2'));
  for (let i = 0; i < steps(0.12); i++) d.tick();
  const shot = d.projectiles[0];
  assert.ok(shot.volleyOf);
  shot.turnBack(d.target, -1);
  assert.equal(shot.volleyOf, null);
});

test('the shared code names no fighter or move for it', () => {
  for (const file of ['attacks.js', 'combat-state.js', 'combat.js', 'projectile.js']) {
    const code = readFileSync(new URL(`../../js/game/combat/${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'000\d'|volley[^\n]*extra_attack/, file);
  }
});
