// Run with node --test tests/systems/limit.test.mjs (no dependencies).
// A Limit Break (`limit`, a technique's: js/game/combat/technique.js): a
// technique that opens only once its own fighter's Limit gauge
// (CombatState.limitGauge) holds that many Launch Points. The gauge fills
// by the damage of every real hit its fighter takes, whoever deals it, and
// by nothing else: unlike the Launch Point it never recovers, a heal never
// touches it and a blocked hit fills nothing. Releasing the technique
// breaks the Limit (the whole gauge spent); a cast broken before its
// release spends nothing; a fresh life starts empty. The start, the CPU and
// the ability HUD all ask limitReady, so they never disagree. Checked on a
// test-only caster (#0001 whose Unlimited Void needs a Limit) through the
// real Fighter and CombatSystem; #0014's Sunburst Fist in its own tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatState } from '../../js/game/combat/combat-state.js';
import { createTechniqueDefinition, limitFill, limitReady } from '../../js/game/combat/technique.js';
import { abilityGroups, abilityStatus, moveRestriction } from '../../js/game/combat/move-status.js';
import { analyzeCapabilities, moveReady } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { def, duel, makeFighter, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: -50, y: -100, w: 100, h: 100 };

// #0001 whose Unlimited Void is a Limit Break: it opens at 20.
const BREAKER = {
  ...def,
  id: 'test-limit-breaker',
  techniques: { ...def.techniques, attack4: { ...def.techniques.attack4, limit: 20 } },
};

test('a Limit is a whole number of Launch Points any technique may need: none by default, refused when it is anything else', () => {
  assert.equal(createTechniqueDefinition({ id: 'a', burst: { hitbox: BOX, hit: { damage: 3 } } }).limit, 0, 'none by default');
  assert.equal(createTechniqueDefinition({ id: 'a', limit: 30, burst: { hitbox: BOX, hit: { damage: 3 } } }).limit, 30);
  for (const bad of [-1, 2.5, '30', true, NaN, Infinity]) {
    assert.throws(() => createTechniqueDefinition({ id: 'a', limit: bad, burst: { hitbox: BOX, hit: { damage: 3 } } }),
      /limit must be a whole number of Launch Points/, String(bad));
  }
  // A start condition, never a mechanic of what it lets go: no cooldown or
  // Energy of its own.
  assert.equal(cooldownClass('technique', { limit: 30, burst: { hitbox: BOX, hit: { damage: 3 } } }), 'ordinary');
});

test('the gauge fills by exactly the damage of each real hit; a block, a heal and recovery leave it as it is; spending empties it', () => {
  const c = new CombatState();
  assert.equal(c.limitGauge, 0, 'a fresh state is empty');
  c.fillLimit(3);
  c.fillLimit(10);
  c.fillLimit(0);
  assert.equal(c.limitGauge, 13);
  c.launchPoint = 13;
  c.heal(10);
  for (let i = 0; i < steps(10); i++) c.update(1 / 60);
  assert.equal(c.launchPoint, 0, 'its Launch Point recovered');
  assert.equal(c.limitGauge, 13, 'its Limit never does');
  c.spendLimit();
  assert.equal(c.limitGauge, 0);
  // Through the real CombatSystem: a hit fills it, a blocked one does not.
  const d = duel({ gap: 40 });
  d.tick(P('attack1'));
  for (let i = 0; i < steps(0.6); i++) d.tick();
  const dealt = d.events.filter((e) => e.type === 'hit').reduce((s, e) => s + e.damage, 0);
  assert.ok(dealt > 0);
  assert.equal(d.target.combat.limitGauge, dealt, 'its target\'s gauge, by the damage it took');
  assert.equal(d.attacker.combat.limitGauge, 0, 'dealing fills nothing');
  const guarded = duel({ gap: 40 });
  guarded.tick({}, P('shield'));
  for (let i = 0; i < steps(0.3); i++) guarded.tick({}, { shield: true });
  guarded.tick(P('attack1'), { shield: true });
  for (let i = 0; i < steps(0.6); i++) guarded.tick({}, { shield: true });
  assert.ok(guarded.events.some((e) => e.type === 'block'));
  assert.equal(guarded.target.combat.limitGauge, 0, 'a block fills nothing');
});

test('below its Limit a press does nothing, nothing paid; the CPU never plans it; the HUD shows it held back and filling', () => {
  const { fighter, step } = makeFighter({ character: BREAKER });
  const t = fighter.techniqueDefs.attack4;
  assert.equal(limitReady(fighter, t), false);
  assert.equal(limitFill(fighter, t), 0);
  step(P('attack4'));
  assert.equal(fighter.technique, null, 'nothing starts');
  const entry = abilityGroups(BREAKER).ground.find((e) => e.action === 'attack4');
  assert.equal(moveRestriction(fighter, entry, 'ground'), 'limit');
  fighter.combat.limitGauge = 5;
  assert.equal(abilityStatus(fighter, entry, 'ground').limitFill, 0.25, 'a quarter full');
  const other = abilityGroups(BREAKER).ground.find((e) => e.action === 'attack5');
  assert.equal(abilityStatus(fighter, other, 'ground').limitFill, 1, 'a technique that needs none reads full');
  // The CPU reads the same.
  const foe = makeFighter({}).fighter;
  fighter.opponent = foe;
  const m = analyzeCapabilities(fighter).moves.find((x) => x.id === 'attack4');
  assert.equal(moveReady(fighter, m), false, 'never planned below its Limit');
  fighter.combat.limitGauge = 20;
  assert.equal(limitReady(fighter, t), true);
  assert.equal(moveRestriction(fighter, entry, 'ground'), null);
  assert.equal(moveReady(fighter, m), true);
});

test('releasing it breaks the Limit, all the gauge spent; a cast broken before its release spends nothing', () => {
  const d = duel({ attackerCharacter: BREAKER, gap: 60 });
  d.attacker.combat.limitGauge = 27;
  d.tick(P('attack4'));
  assert.ok(d.attacker.technique, 'it starts at 20 and more');
  assert.equal(d.attacker.combat.limitGauge, 27, 'nothing spent as it starts');
  for (let i = 0; i < steps(1.5) && d.attacker.technique; i++) d.tick();
  assert.equal(d.attacker.combat.limitGauge, 0, 'spent whole as it lets go');
  // Broken by a hit: the gauge kept, and fuller for the hit.
  const broken = duel({ targetCharacter: BREAKER, gap: 40 });
  broken.target.combat.limitGauge = 20;
  broken.tick({}, P('attack4'));
  assert.ok(broken.target.technique);
  broken.tick(P('attack1'));
  for (let i = 0; i < steps(0.6); i++) broken.tick();
  assert.equal(broken.target.technique, null, 'broken');
  assert.ok(broken.target.combat.limitGauge > 20, 'kept, and fuller');
});
