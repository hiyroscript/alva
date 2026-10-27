// Run with node --test tests/systems/strict-combat-rules.test.mjs (no dependencies).
// The strict combat rules for cooldowns and Energy, every fighter, human or
// CPU (cancellation is tests/systems/move-cancel.test.mjs):
//   - Only 3 s and 5 s cooldowns exist, and each starts once, as its move is
//     released: a single strike as it goes live, a multi-hit string as its
//     last strike goes live, a throw as its projectile spawns, a slam as its
//     impact lands, a technique as its cast lets go, a summon as its clone
//     appears. Interrupted before that, none starts; released, it runs on
//     whatever follows, never started again.
//   - Every Energy price is 15, and an ordinary move that creates a construct
//     (a projectile, a burst, a clone) pays it once as it starts; a move with
//     a special cooldown pays nothing for its construct. Never per hit,
//     flight or clone strike; never for a refused press; never given back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter, playableCharacters, CHARACTERS } from '../../js/data/characters.js';
import { CONSTRUCT_ENERGY_COST, constructEnergyCost, createsConstruct } from '../../js/data/energy.js';
import { createAttackDefinition, attackReleaseAt } from '../../js/game/combat/attacks.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { createSummonDefinition } from '../../js/game/combat/summon.js';
import { analyzeCapabilities, moveReady } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { mulberry32 } from '../../js/core/utils.js';
import { makeFighter } from '../helpers/fighter-harness.mjs';
import { playerRig, press, attackOf } from '../helpers/player-rig.mjs';

const C1 = getCharacter('0001');
const C2 = getCharacter('0002');
const C5 = getCharacter('0005');
const EPS = 1e-6;
const BOX = { x: 0, y: -60, w: 30, h: 20 };
const far = (character, opts = {}) => playerRig({ character, gap: 900, automaticTurnAround: false, ...opts });

// #0001 with its Jab (attack1) replaced by `spec`, played with the Jab's art.
const withJab = (spec) => ({ ...C1, attacks: { ...C1.attacks, attack1: { animation: 'attack1', ...spec } } });

// ---- Release-based cooldowns -----------------------------------------------------------------------

test('a release point is read from each attack\'s structure: a strike as it goes live, a string as its last strike does, a throw as it spawns; a slam with an impact and a pending attack have none', () => {
  const strike = createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, startup: 0.1, active: 0.05, recovery: 0.2 });
  assert.equal(attackReleaseAt(strike), 0.1);
  assert.equal(strike.releaseAt, 0.1);
  const string = createAttackDefinition({ id: 'a', hitbox: BOX, recovery: 0.1, hits: [{ at: 0.05, active: 0.05, damage: 5 }, { at: 0.2, active: 0.05, damage: 5 }] });
  assert.equal(string.releaseAt, 0.2, 'its last strike, never its first');
  const projectiles = { o: { animation: 'o', speed: 400, lifetime: 1, hitbox: BOX, damage: 3 } };
  const thrown = createAttackDefinition({ id: 'a', hitbox: null, projectile: { id: 'o', spawnAt: 0.25 } }, { projectiles });
  assert.equal(thrown.releaseAt, 0.25);
  const slam = createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, motion: { type: 'slam', fallSpeed: 900, impact: { hitbox: BOX, hit: { damage: 10 } } } });
  assert.equal(slam.releaseAt, null, 'released by its impact as it lands');
  // The roster: every attack that strikes or throws has a release point.
  for (const c of CHARACTERS) {
    const f = makeFighter({ character: c }).fighter;
    for (const a of [...Object.values(f.attacks), f.deflect].filter(Boolean)) {
      const slammed = a.motion?.type === 'slam' && a.motion.impact;
      if (a.pending || slammed) assert.equal(a.releaseAt, null, `#${c.id} ${a.id}`);
      else assert.ok(a.releaseAt >= 0 && a.releaseAt <= a.total, `#${c.id} ${a.id}: ${a.releaseAt}`);
    }
  }
});

test('ordinary moves never cool down: no timer after any of them, for anyone', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    for (const action of ['attack1', 'attack2', 'extra_attack']) {
      const id = r.player.attackFor(action);
      if (!id || r.player.attacks[id].cooldown > 0) continue;
      r.tick(press(action));
      r.until(() => !r.player.combat.attack);
      assert.equal(r.player.combat.cooldowns.has(id), false, `#${c.id} ${id}`);
      r.until(() => r.player.canAct());
      r.player.combat.refillEnergy();
    }
  }
});

test('a 5 s throw (#0002\'s Whirlwind) starts its cooldown the step its tornado spawns, exactly once, and keeps it through a hit and its end', () => {
  const r = far(C2);
  r.tick(press('extra_attack'));
  const record = r.player.combat.attack;
  assert.equal(record.def.id, 'extra_attack');
  assert.equal(r.player.combat.cooldowns.has('extra_attack'), false, 'nothing on the press');
  while (!record.released) {
    assert.equal(r.player.combat.cooldowns.has('extra_attack'), false, `nothing in its startup (${record.time.toFixed(3)})`);
    assert.equal(r.projectiles.length, 0);
    r.tick();
  }
  assert.ok(record.time >= record.def.projectile.spawnAt - EPS, 'released at its spawn');
  assert.equal(r.player.combat.cooldowns.get('extra_attack'), 5, 'its 5 s from the release step');
  r.tick();
  assert.equal(r.projectiles.length, 1, 'the tornado is out');
  // A hit in its recovery: the cooldown runs on, never restarted.
  r.player.combat.stun = 0.3;
  let last = r.player.combat.cooldowns.get('extra_attack');
  for (let i = 0; i < 60; i++) {
    r.tick();
    const now = r.player.combat.cooldowns.get('extra_attack');
    assert.ok(now < last, 'only ever running down');
    last = now;
  }
  assert.equal(r.player.combat.attack, null);
});

test('a throw interrupted before its projectile spawns throws nothing and starts no cooldown: it may be used again at once', () => {
  const r = far(C2);
  r.tick(press('extra_attack'));
  r.player.combat.stun = 0.1;
  r.tick();
  assert.equal(r.player.combat.attack, null, 'interrupted in its startup');
  r.until(() => r.player.canAct());
  for (let i = 0; i < 30; i++) r.tick();
  assert.equal(r.projectiles.length, 0, 'nothing thrown');
  assert.equal(r.player.combat.cooldowns.has('extra_attack'), false, 'no 5 s');
  r.tick(press('extra_attack'));
  assert.equal(attackOf(r.player), 'extra_attack', 'ready again');
  // The CPU reads the same: ready after the interrupted try.
  const cpu = new Fighter({
    def: C2, sprites: r.player.sprites, stage: r.player.stage, slot: 1, label: 'CPU', spawn: { x: 400, facing: 1 },
    controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(2) }),
  });
  cpu.opponent = r.player;
  const whirlwind = analyzeCapabilities(cpu).moves.find((m) => m.id === 'extra_attack');
  assert.equal(moveReady(cpu, whirlwind), true, 'never treated as cooling after an interrupted startup');
  cpu.combat.cooldowns.set('extra_attack', 5);
  assert.equal(moveReady(cpu, whirlwind), false, 'never pressed while it really cools');
});

test('a single 10-damage strike starts its 5 s as it goes live; one interrupted in its startup starts none', () => {
  const c = withJab({ hitbox: BOX, damage: 10, startup: 0.1, active: 0.05, recovery: 0.2 });
  const r = far(c);
  r.tick(press('attack1'));
  const record = r.player.combat.attack;
  while (record.time < 0.1 - EPS) {
    assert.equal(r.player.combat.cooldowns.has('attack1'), false, 'none in its startup');
    r.tick();
  }
  assert.equal(r.player.combat.cooldowns.get('attack1'), 5, 'live: its 5 s');
  const i = far(c);
  i.tick(press('attack1'));
  i.tick();
  i.player.combat.stun = 0.2;
  i.tick();
  assert.equal(i.player.combat.attack, null);
  assert.equal(i.player.combat.cooldowns.has('attack1'), false, 'interrupted before its strike: none');
});

test('a multi-hit 10-damage string starts its 5 s only as its last strike goes live: an early strike is not its release', () => {
  const c = withJab({ hitbox: BOX, recovery: 0.2, hits: [{ at: 0.05, active: 0.05, damage: 5 }, { at: 0.25, active: 0.05, damage: 5 }] });
  const r = far(c);
  r.tick(press('attack1'));
  const record = r.player.combat.attack;
  assert.equal(record.def.cooldown, 5);
  while (record.time < 0.25 - EPS) {
    assert.equal(r.player.combat.cooldowns.has('attack1'), false, `none at ${record.time.toFixed(3)}`);
    r.tick();
  }
  assert.equal(r.player.combat.cooldowns.get('attack1'), 5, 'its last strike live: 5 s');
  // Interrupted between the strikes: none.
  const i = far(c);
  i.tick(press('attack1'));
  while (i.player.combat.attack.time < 0.15) i.tick();
  i.player.combat.stun = 0.2;
  i.tick();
  assert.equal(i.player.combat.attack, null);
  assert.equal(i.player.combat.cooldowns.has('attack1'), false, 'its first strike only: no cooldown');
});

test('a slam with a 10-damage impact starts its 5 s as the impact lands, not as it plunges', () => {
  const air = C1.attacks.midair_attack2;
  const c = {
    ...C1,
    attacks: {
      ...C1.attacks,
      midair_attack2: {
        animation: air.animation, startup: 0.05, active: 1.5, recovery: 0.2, hitbox: BOX, damage: 3,
        motion: { type: 'slam', fallSpeed: 1200, impact: { hitbox: BOX, hit: { damage: 10 } } },
      },
    },
  };
  const r = far(c);
  r.tick(press('jump'));
  for (let i = 0; i < 10; i++) r.tick({ jump: true });
  r.tick(press('attack2'));
  const record = r.player.combat.attack;
  assert.equal(record?.def.id, 'midair_attack2');
  while (!r.player.grounded) {
    assert.equal(r.player.combat.cooldowns.has('midair_attack2'), false, 'none while it plunges');
    r.tick();
  }
  assert.ok(record.motion.landed, 'landed');
  assert.ok(Math.abs(r.player.combat.cooldowns.get('midair_attack2') - 5) < EPS, 'its 5 s from the impact');
});

test('a summon (#0005\'s Red Balloon) starts its 3 s as its clone appears, never in the startup; the clone\'s bite never restarts it', () => {
  const r = playerRig({ character: C5, gap: 300, automaticTurnAround: false });
  r.tick(press('attack5'));
  assert.ok(r.player.pendingSummon, 'its startup');
  const cd = r.player.combat.abilityCooldowns;
  while (!r.clones.length) {
    assert.equal(cd.active('attack5'), false, 'no cooldown in the startup');
    r.tick();
  }
  assert.ok(Math.abs(cd.remaining('attack5') - 3) < EPS, 'the clone is out: its 3 s');
  let last = cd.remaining('attack5');
  while (r.clones.length) {
    r.tick();
    if (!cd.active('attack5')) break;
    assert.ok(cd.remaining('attack5') < last, 'the clone\'s attack never restarts it');
    last = cd.remaining('attack5');
  }
  // A hit during the startup: no clone, no cooldown, ready again.
  const h = playerRig({ character: C5, gap: 300, automaticTurnAround: false });
  h.tick(press('attack5'));
  h.tick();
  h.player.combat.stun = 0.2;
  h.tick();
  assert.equal(h.player.pendingSummon, null, 'its startup broken');
  for (let i = 0; i < 90; i++) h.tick();
  assert.equal(h.clones.length, 0, 'no clone');
  assert.equal(h.player.combat.abilityCooldowns.active('attack5'), false, 'no 3 s');
  h.tick(press('attack5'));
  assert.ok(h.player.pendingSummon, 'summoned again at once');
});

// ---- Universal Energy --------------------------------------------------------------------------

test('constructs are read from data: a projectile, a burst or a clone with no special cooldown costs 15; a melee strike, a heal or a 3 s / 5 s move nothing', () => {
  assert.equal(CONSTRUCT_ENERGY_COST, 15);
  assert.equal(createsConstruct('attack', { projectile: { id: 'o' } }), true);
  assert.equal(createsConstruct('attack', { hitbox: BOX }), false, 'a melee strike');
  assert.equal(createsConstruct('technique', { burst: {} }), true);
  assert.equal(createsConstruct('technique', { heal: 10 }), false, 'a heal of its own');
  assert.equal(createsConstruct('summon', {}), true);
  assert.equal(constructEnergyCost('attack', { projectile: {} }, 'ordinary'), 15);
  assert.equal(constructEnergyCost('attack', { projectile: {} }, 'exceptional'), 0);
  assert.equal(constructEnergyCost('technique', { projectile: {} }, 'tenDamage'), 0);
  // Whatever it is called: the data decides.
  const projectiles = { o: { animation: 'o', speed: 400, lifetime: 1, hitbox: BOX, damage: 3 } };
  const named = createAttackDefinition({ id: 'hollow_purple', hitbox: null, projectile: { id: 'o', spawnAt: 0 } }, { projectiles });
  assert.equal(named.energyCost, 15);
  // A declared cost must agree.
  assert.throws(() => createAttackDefinition({ id: 'a', hitbox: null, projectile: { id: 'o', spawnAt: 0 }, energyCost: 20 }, { projectiles }),
    /declares energyCost 20: the Energy policy gives it 15/);
  assert.throws(() => createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, energyCost: 15 }), /gives it 0/);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 3 } }, energyCost: 15 }).energyCost, 15);
  assert.throws(() => createSummonDefinition({ id: 's', attack: 'x', cloud: 'c', energyCost: 0 }, { attacks: { x: { hitbox: BOX, damage: 3 } } }),
    /gives it 15/);
});

test('the roster: every move\'s Energy cost, from what it creates and its cooldown class', () => {
  const table = {
    // Red and Blue are ordinary throws; Unlimited Void (3 s) and Hollow Purple (5 s) pay nothing.
    '0001': { attack2: 15, attack3: 15, 'tech:attack4': 0, 'tech:attack5': 0 },
    // The Whirlwind is a 5 s throw.
    '0002': {},
    // Cherry Blossom Impact is an ordinary burst; the Mystical Palm a heal (3 s).
    '0003': { 'tech:attack3': 15, 'tech:attack4': 0 },
    '0004': { extra_attack: 15, 'tech:attack4': 0, 'tech:attack5': 0 },
    // The Red Balloon's clone (3 s) and the Deadlights (3 s).
    '0005': { 'summon:attack5': 0, 'tech:attack4': 0 },
    // Two ordinary projectile techniques; Ice Breath (3 s).
    '0006': { 'tech:attack3': 15, 'tech:attack5': 15, 'tech:attack4': 0 },
    // The Pistol, an ordinary shot; the Molotov Cocktail's fire and the
    // Sawn-Offs' burst, ordinary casts; the Rocket Launcher (5 s).
    '0007': { extra_attack: 15, 'tech:attack3': 15, 'tech:attack4': 15, 'tech:attack5': 0 },
  };
  for (const c of CHARACTERS) {
    const f = makeFighter({ character: c }).fighter;
    const got = {};
    for (const [id, a] of Object.entries(f.attacks)) if (a.energyCost) got[id] = a.energyCost;
    for (const [id, t] of Object.entries(f.techniqueDefs)) got[`tech:${id}`] = t.energyCost;
    for (const [id, s] of Object.entries(f.summonDefs)) got[`summon:${id}`] = s.energyCost;
    assert.deepEqual(got, table[c.id], `#${c.id}`);
    // The CPU plans with the very cost the Fighter pays.
    f.opponent = makeFighter({ character: c, x: 900 }).fighter;
    for (const m of analyzeCapabilities(f).moves) {
      const expected = m.kind === 'deflect' ? f.energyDef.deflectCost : m.def.energyCost;
      assert.equal(m.energyCost, expected, `#${c.id} ${m.key}`);
    }
  }
});

test('an ordinary throw pays 15 once as it starts, never again over its flight, its strikes or its turning back', () => {
  // Maximum Blue (#0001's attack3): a piercing orb that strikes several times.
  const r = playerRig({ character: C1, gap: 220, automaticTurnAround: false });
  r.tick(press('attack3'));
  assert.equal(r.player.combat.energy, 100 - 15, 'its 15, and no refill on that step');
  let last = r.player.combat.energy;
  for (let i = 0; i < 180; i++) {
    r.tick();
    assert.ok(r.player.combat.energy >= last - EPS, `never paid again (${i})`);
    last = r.player.combat.energy;
  }
  assert.ok(r.events.filter((e) => e.ability === 'attack3').length > 1, 'it struck, more than once');
});

test('a construct move refused for Energy costs nothing and is never kept; with less than 15 left it takes all and exhausts', () => {
  for (const c of playableCharacters()) {
    const f = far(c).player;
    const costly = ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].find((a) => {
      const id = f.attackFor(a, true);
      const sp = f.def.actions?.[a];
      if (sp && typeof sp === 'object' && sp.type) {
        const d = sp.type === 'technique' ? f.techniqueDefs[sp.id] : f.summonDefs[sp.id];
        return d?.energyCost > 0;
      }
      return f.attacks[id]?.energyCost > 0;
    });
    if (!costly) continue;
    const r = far(c);
    r.player.combat.setEnergy(0);
    r.player.combat.regenEnergy(50);
    assert.equal(r.player.combat.energyExhausted, true);
    r.tick(press(costly));
    assert.equal(r.player.combat.attack, null, `#${c.id} ${costly}: refused while exhausted`);
    assert.equal(r.player.technique, null);
    assert.equal(r.player.pendingSummon, null);
    assert.equal(r.player.bufferedAttack, null, `#${c.id}: an Energy refusal is never kept`);
    const low = far(c);
    low.player.combat.setEnergy(10);
    low.tick(press(costly));
    assert.ok(low.player.combat.attack || low.player.technique || low.player.pendingSummon, `#${c.id} ${costly}: it still happens`);
    assert.equal(low.player.combat.energy, 0, 'all that was left');
    assert.equal(low.player.combat.energyExhausted, true, 'exhausted until full');
  }
});

test('Energy is never given back: a construct move interrupted before it releases keeps its payment', () => {
  const r = far(C1);
  r.tick(press('attack2'));
  assert.equal(r.player.combat.energy, 85);
  r.player.combat.stun = 0.2;
  r.tick();
  assert.equal(r.player.combat.attack, null);
  assert.ok(r.player.combat.energy < 85 + 1, 'only the passive refill, no refund');
  for (let i = 0; i < 30; i++) r.tick();
  assert.equal(r.projectiles.length, 0, 'nothing thrown');
});

test('a CPU pays the same: its throw costs 15 and it never presses a construct move while exhausted', () => {
  for (const c of playableCharacters()) {
    const player = makeFighter({ character: c }).fighter;
    const cpu = new Fighter({
      def: c, sprites: player.sprites, stage: player.stage, slot: 1, label: 'CPU', spawn: { x: 900, facing: -1 },
      controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(4) }),
    });
    cpu.opponent = player;
    const caps = analyzeCapabilities(cpu);
    cpu.combat.setEnergy(0);
    for (const m of caps.moves) {
      if (m.energyCost > 0) assert.equal(moveReady(cpu, m), false, `#${c.id} ${m.key}: never while exhausted`);
    }
    cpu.combat.refillEnergy();
    const melee = caps.moves.find((m) => m.kind === 'melee' && !m.air);
    assert.equal(moveReady(cpu, melee), true, `#${c.id}: a free melee strike is ready`);
  }
});

test('the CPU sees a cooldown only once a move is released, and a move interrupted before then is ready again', () => {
  const r = playerRig({ character: C1, gap: 400, automaticTurnAround: false });
  const cpu = new Fighter({
    def: C1, sprites: r.player.sprites, stage: r.player.stage, slot: 1, label: 'CPU', spawn: { x: 100, facing: 1 },
    controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(5) }),
  });
  cpu.opponent = r.player;
  const purple = analyzeCapabilities(cpu).moves.find((m) => m.id === 'attack5' && m.kind === 'technique');
  r.tick(press('attack5'));
  assert.ok(r.player.technique, 'Hollow Purple casting');
  assert.equal(r.player.combat.abilityCooldowns.active('attack5'), false, 'not before the release');
  r.until(() => r.player.technique?.released);
  assert.ok(Math.abs(r.player.combat.abilityCooldowns.remaining('attack5') - 5) < EPS, 'fired: 5 s');
  r.tick();
  assert.ok(r.projectiles.some((p) => p.ability === 'attack5'), 'the sphere is out');
  // A CPU fighter in the same state is read the same way.
  cpu.combat.abilityCooldowns.start('attack5', 5);
  assert.equal(moveReady(cpu, purple), false);
  cpu.combat.abilityCooldowns.clear();
  assert.equal(moveReady(cpu, purple), true);
});
