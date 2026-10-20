// Run with node --test tests/systems/float.test.mjs (no dependencies).
// A float (`float: seconds`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a real hit that launches nothing makes
// its target float for that long. It is held exactly as a paralysis holds
// it (no acting, no sideways speed, its hurt pose), but lifted off the
// ground and rising slowly, FLOAT_RISE_SPEED with no gravity, until it runs
// out and the fighter falls; a hit that launches it ends it at once.
// Checked on a test-only fighter (#0001's body and clips with a floating
// Jab) against every fighter of the roster through the real Fighter and
// CombatSystem; for the cooldown policy (a float is exceptional: 3 s), the
// attack classification and the CPU's reading of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { FLOAT_RISE_SPEED } from '../../js/game/combat/hit-effects.js';
import { isHarmfulHit } from '../../js/game/combat/offense.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { getCharacter } from '../../js/data/characters.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { DT, def, duel, fakeSpritesOf, makeFighter, probeHit, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// The floater: #0001 whose Jab floats for 1.2 s and launches nothing.
const FLOATER = {
  ...def,
  id: 'test-floater',
  attacks: {
    ...def.attacks,
    attack1: { ...def.attacks.attack1, float: 1.2, baseLaunch: 0, directionalLaunch: null, hitCancel: null },
  },
};
const SPRITES = fakeSpritesOf(FLOATER);
const versus = (target = def, opts = {}) => duel({
  attackerCharacter: FLOATER, attackerSprites: SPRITES, targetCharacter: target, targetSprites: fakeSpritesOf(target), ...opts,
});
// The floater's Jab lands on the target: the step it does, and the duel.
function floated(target = def, opts = {}) {
  const d = versus(target, opts);
  d.tick(P('attack1'));
  d.until(() => d.events.some((e) => e.type === 'hit'), 40);
  return d;
}

// ---- Data -------------------------------------------------------------------------------

test('a float is seconds from 0 any hit may declare: none by default, inherited like the other hit effects, refused when it is anything else', () => {
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 1, float: 1.5 }).float, 1.5);
  assert.equal(createAttackDefinition({ id: 'b', hitbox: BOX, damage: 1 }).float, 0, 'none by default');
  const multi = createAttackDefinition({
    id: 'c', hitbox: BOX, float: 1,
    hits: [{ at: 0.1, active: 0.05, damage: 1 }, { at: 0.2, active: 0.05, damage: 1, float: 0 }],
  });
  assert.deepEqual(multi.hits.map((h) => h.float), [1, 0], 'a strike takes the attack\'s unless it says');
  const shot = createProjectileDefinition({ id: 'd', speed: 100, damage: 1, float: 2, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 } });
  assert.equal(shot.finisher.float, 2, 'a finisher inherits its projectile\'s');
  assert.equal(createTechniqueDefinition({ id: 'e', burst: { hitbox: BOX, hit: { damage: 1, float: 1.6 } } }).burst.hit.float, 1.6);
  for (const bad of [-1, '2', true, Infinity, NaN]) {
    assert.throws(() => createAttackDefinition({ id: 'f', hitbox: BOX, damage: 1, float: bad }), /float must be seconds from 0/, String(bad));
  }
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, float: 1 }), /pending but declares float/);
});

test('a float is exceptional, as a paralysis is: 3 s, and a ten-damage float 5 s; a hit that floats is an attack', () => {
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 1, float: 1 }), 'exceptional');
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 1, float: 1 }).cooldown, 3);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 1, float: 1.6 } } }).cooldown, 3);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 10, float: 1.6 } } }).cooldown, 5);
  assert.equal(isHarmfulHit({ damage: 0, float: 1 }), true);
  assert.equal(isHarmfulHit({ damage: 0, float: 0 }), false);
});

// ---- Floating ---------------------------------------------------------------------------

test('a real hit lifts its target off the ground and holds it rising, helpless, for its seconds; then it falls', () => {
  for (const target of ['0001', '0002', '0003', '0004', '0005'].map(getCharacter)) {
    const d = floated(target);
    const e = d.events.find((x) => x.type === 'hit');
    assert.equal(e.float, 1.2, `#${target.id}: the event says so`);
    assert.equal(e.paralysis, 1.2, 'a float holds as a paralysis does');
    const c = d.target.combat;
    assert.equal(c.afloat, true);
    assert.equal(c.immobilized, true, 'it cannot act');
    // Through the freeze, then rising.
    while (d.target.combat.hitstop > 0) d.tick();
    const y0 = d.target.body.y;
    d.tick();
    assert.equal(d.target.body.grounded, false, `#${target.id}: off the ground`);
    assert.equal(d.target.body.vx, 0, 'no sideways speed');
    assert.ok(near(d.target.body.vy, -FLOAT_RISE_SPEED), 'rising at the float speed, no gravity');
    for (let i = 0; i < steps(0.5); i++) d.tick({}, P('attack1'));
    assert.ok(near(y0 - d.target.body.y, FLOAT_RISE_SPEED * (0.5 + DT), 1e-3), `#${target.id}: a steady rise`);
    assert.equal(d.target.combat.attack, null, 'its presses do nothing');
    assert.equal(d.target.state, 'bound');
    assert.equal(d.target.animator.anim.key, 'midair_hurt', 'its hurt pose, in the air');
    // Run out: it falls back to the ground.
    d.until(() => !d.target.combat.afloat, steps(2));
    assert.equal(d.target.combat.immobilized, false, 'free as the float ends');
    d.until(() => d.target.body.grounded, steps(2));
  }
});

test('a hit that launches a floating fighter ends the float at once; one that launches nothing keeps it', () => {
  const d = floated();
  while (d.target.combat.hitstop > 0) d.tick();
  d.tick();
  const system = new CombatSystem();
  system.applyHit(d.attacker, d.target, probeHit({ id: 'tick', damage: 1, hitbox: BOX, hitstun: 0.1 }));
  assert.equal(d.target.combat.afloat, true, 'a hit that launches nothing: still floating');
  system.applyHit(d.attacker, d.target, probeHit({ id: 'launch', damage: 1, hitbox: BOX, baseLaunch: 2, directionalLaunch: 'horizontal' }));
  assert.equal(d.target.combat.afloat, false, 'launched: the float is over');
  assert.equal(d.target.combat.paralysis, 0);
  assert.equal(d.target.combat.floating, 0);
});

test('a blocked hit floats nobody, and a hit that floats and launches only launches', () => {
  const d = versus();
  d.tick({}, { shield: true });
  d.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 40 && !d.events.length; i++) d.tick({}, { shield: true });
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.events[0].float, 0);
  assert.equal(d.target.combat.floating, 0);
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  b.combat.launchPoint = 40;
  const e = new CombatSystem().applyHit(a, b, createAttackDefinition({
    id: 'x', hitbox: BOX, damage: 1, float: 1, baseLaunch: 1, directionalLaunch: 'vertical',
  }));
  assert.equal(e.float, 0);
  assert.equal(b.combat.afloat, false);
});

test('the longer float wins, it runs down with its paralysis, and a reset clears it', () => {
  const f = makeFighter().fighter;
  const c = f.combat;
  c.float(1);
  c.float(0.4);
  assert.ok(near(c.floating, 1) && near(c.paralysis, 1), 'the longer one stays');
  c.hitstop = 0.2;
  for (let i = 0; i < steps(0.2); i++) c.update(DT);
  assert.ok(near(c.floating, 1, 1e-6), 'held through a freeze, as a paralysis is');
  for (let i = 0; i < steps(1); i++) c.update(DT);
  assert.equal(c.floating, 0);
  assert.equal(c.afloat, false);
  c.float(2);
  f.reset(f.stage);
  assert.equal(f.combat.floating, 0);
});

test('the CPU weighs a float as the hold it is', () => {
  const f = makeFighter({ character: FLOATER, sprites: SPRITES }).fighter;
  const jab = analyzeCapabilities(f).moves.find((m) => m.id === 'attack1');
  assert.equal(jab.strikes[0].float, 1.2);
  assert.equal(jab.paralyze, 1.2, 'held as a paralysis holds');
  assert.ok(jab.roles.has('comboStarter'));
});
