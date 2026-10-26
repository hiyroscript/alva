// Run with node --test tests/systems/slam.test.mjs (no dependencies).
// The slam (attack `motion: { type: 'slam', fallSpeed, impact }`, see
// js/game/combat/attacks.js): the plunge that lands. It hangs through its
// startup, plunges at a fixed speed striking whatever it passes (never
// stopped by it), and meeting the ground ends the plunge there: its impact
// strikes every opponent its box meets round the landing point, and the
// attack goes straight to its recovery, played on the ground in its
// impact's own clip (no landing cancel). A plunge that runs out in the air
// lands nothing. Checked on a test-only fighter (#0001's body and clips,
// its Red Kick made a slam) through the real Fighter and CombatSystem, and
// in the CPU's reading of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attackReach, createAttackDefinition } from '../../js/game/combat/attacks.js';
import { attackOffense } from '../../js/game/combat/offense.js';
import { loadoutProblems } from '../../js/data/loadout.js';
import { DT, def, duel, fakeSpritesOf, makeFighter, steps } from '../helpers/fighter-harness.mjs';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const A = def.animations;

const HANG = 0.1;
const PLUNGE = 0.6;
const LANDING = 0.2;
const IMPACT = { x: -100, y: -40, w: 200, h: 44 };
// The stomper: its mid-air Attack 2 a slam whose landing plays its own
// clip (#0001's High Kick frames, as midair_attack2_impact).
const STOMPER = {
  ...def,
  id: 'test-stomper',
  animations: { ...A, midair_attack2_impact: { ...A.extra_attack, frames: A.extra_attack.frames } },
  attacks: {
    ...def.attacks,
    midair_attack2: {
      animation: 'midair_attack2', startup: HANG, active: PLUNGE, recovery: LANDING,
      damage: 3, baseLaunch: 1, directionalLaunch: 'reverseVertical', hitbox: { x: -20, y: -40, w: 40, h: 50 },
      hitstun: 0.3, airUses: 1, airControl: 0,
      motion: {
        type: 'slam', fallSpeed: 1500,
        impact: { hitbox: IMPACT, hit: { damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', quake: true }, animation: 'midair_attack2_impact' },
      },
    },
  },
};
const SPRITES = fakeSpritesOf(STOMPER);
const stomper = (opts = {}) => makeFighter({ character: STOMPER, sprites: SPRITES, ...opts });
const versus = (opts = {}) => duel({ attackerCharacter: STOMPER, attackerSprites: SPRITES, ...opts });
const slamDef = () => createAttackDefinition({ id: 'midair_attack2', ...STOMPER.attacks.midair_attack2 });

// Up into the air, `rise` steps after a jump.
function airborne(step, rise = 12) {
  step(P('jump'));
  for (let i = 0; i < rise; i++) step({});
}

// ---- Data ---------------------------------------------------------------------------

test('a slam is data: its fall speed and its impact, a hit validated as an attack\'s', () => {
  const atk = slamDef();
  assert.equal(atk.motion.type, 'slam');
  assert.equal(atk.motion.fallSpeed, 1500);
  assert.ok(Object.isFrozen(atk.motion.impact) && Object.isFrozen(atk.motion.impact.hit));
  assert.deepEqual({ ...atk.motion.impact.hitbox }, IMPACT);
  assert.equal(atk.motion.impact.hit.id, 'midair_attack2', 'named for its attack');
  assert.equal(atk.motion.impact.hit.damage, 5);
  assert.equal(atk.motion.impact.hit.quake, true);
  assert.equal(atk.motion.impact.hit.blockstun, 0.12, 'a hit\'s own defaults');
  assert.equal(atk.motion.impact.animation, 'midair_attack2_impact');
  assert.deepEqual([...attackOffense(atk).sources], ['strike', 'impact'], 'its impact is part of what makes it an attack');
  const bad = (motion) => () => createAttackDefinition({ id: 'x', hitbox: { x: 0, y: 0, w: 1, h: 1 }, damage: 3, motion });
  assert.throws(bad({ type: 'slam' }), /slam motion needs a positive fallSpeed/);
  assert.throws(bad({ type: 'slam', fallSpeed: 900, impact: { hit: { damage: 3 } } }), /impact needs a hitbox/);
  assert.throws(bad({ type: 'slam', fallSpeed: 900, impact: { hitbox: IMPACT } }), /impact needs a hit/);
  assert.throws(bad({ type: 'slam', fallSpeed: 900, impact: { hitbox: IMPACT, hit: { damage: 2 } } }), /declares damage 2/);
  assert.throws(bad({ type: 'slam', fallSpeed: 900, impact: { hitbox: IMPACT, hit: { damage: 3, unblockable: true } } }), /every attack is blockable/);
  assert.throws(bad({ type: 'bounce', fallSpeed: 900, impact: { hitbox: IMPACT, hit: { damage: 3 } } }), /only a slam lands with one/);
  assert.equal(createAttackDefinition({ id: 'y', hitbox: { x: 0, y: 0, w: 1, h: 1 }, damage: 3, motion: { type: 'slam', fallSpeed: 900 } }).motion.impact, null, 'an impact is optional');
});

test('its landing clip is the attack\'s own art: there, and named after it', () => {
  assert.deepEqual(loadoutProblems(STOMPER), []);
  const missing = { ...STOMPER, animations: { ...STOMPER.animations } };
  delete missing.animations.midair_attack2_impact;
  assert.ok(loadoutProblems(missing).some((p) => /impact plays "midair_attack2_impact", which is not in `animations`/.test(p)));
  const misnamed = { ...STOMPER, animations: { ...STOMPER.animations, landing: A.extra_attack } };
  misnamed.attacks = { ...STOMPER.attacks, midair_attack2: { ...STOMPER.attacks.midair_attack2, motion: { ...STOMPER.attacks.midair_attack2.motion, impact: { ...STOMPER.attacks.midair_attack2.motion.impact, animation: 'landing' } } } };
  assert.ok(loadoutProblems(misnamed).some((p) => /impact plays "landing": it is not named midair_attack2_/.test(p)));
});

test('attackReach takes in the plunge and its impact where the plunge would land at the furthest', () => {
  const atk = slamDef();
  const reach = attackReach(atk);
  const fall = 1500 * PLUNGE;
  assert.equal(reach.x, IMPACT.x);
  assert.equal(reach.x + reach.w, IMPACT.x + IMPACT.w);
  assert.equal(reach.y, -40);
  const plungeBottom = -40 + 50 + fall;
  assert.ok(Math.abs(reach.y + reach.h - Math.max(plungeBottom, IMPACT.y + IMPACT.h + fall)) < 1e-9, 'down to the lowest of the two');
});

// ---- The plunge and the landing ----------------------------------------------------------

test('it hangs, plunges at its fall speed, and lands where it meets the ground: no rebound, its recovery on the ground in its landing clip', () => {
  const { fighter, step } = stomper();
  airborne(step);
  const y0 = fighter.body.y;
  step(P('attack2'));
  for (let i = 1; i < steps(HANG); i++) step({});
  assert.ok(Math.abs(fighter.body.y - y0) < 1, 'hung through its startup');
  step({});
  assert.equal(fighter.body.vy, 1500, 'the plunge');
  let landed = -1;
  for (let i = 0; i < 120 && landed < 0; i++) {
    step({});
    if (fighter.body.grounded) landed = i;
  }
  assert.ok(landed >= 0, 'it reaches the ground');
  const atk = fighter.combat.attack;
  assert.ok(atk, 'still its attack: the landing is its recovery');
  assert.equal(atk.motion.landed, true);
  assert.equal(fighter.combat.phase, 'recovery');
  assert.equal(fighter.animator.anim.key, 'midair_attack2_impact', 'its landing clip, from its first frame');
  assert.equal(fighter.animator.index, 0);
  // Stays down (no rebound) for its recovery, then free.
  let n = 0;
  while (fighter.combat.attack) {
    assert.equal(fighter.body.grounded, true, 'no rebound');
    step({});
    n++;
  }
  assert.ok(Math.abs(n - steps(LANDING)) <= 1, `its whole landing (${n} steps), never cancelled`);
  assert.equal(fighter.canAct(), true);
});

test('its impact strikes every opponent standing round the landing point, either side, and a Shield blocks it', () => {
  for (const [gap, shield, want] of [[90, false, 'hit'], [-90, false, 'hit'], [90, true, 'block'], [160, false, null]]) {
    const d = versus({ gap });
    d.tick(P('jump'), shield ? { shield: true } : {});
    for (let i = 0; i < 12; i++) d.tick({}, shield ? { shield: true } : {});
    d.tick(P('attack2'), shield ? { shield: true } : {});
    for (let i = 0; i < 120 && !d.attacker.body.grounded; i++) d.tick({}, shield ? { shield: true } : {});
    const impact = d.events.filter((e) => e.move === 'midair_attack2');
    assert.equal(impact[0]?.type ?? null, want, `${gap} away${shield ? ', Shield up' : ''}`);
    if (want === 'hit') {
      assert.equal(impact[0].damage, 5);
      assert.ok(impact[0].finalLaunch.y < 0, 'thrown upward');
      assert.equal(d.attacker.combat.attack.confirmed, true, 'a real hit confirms the attack');
    }
    assert.equal(impact.length <= 1, true, 'once');
  }
});

test('an opponent met on the way down is struck and the plunge goes on through to the ground', () => {
  const d = versus({ gap: 10 });
  d.tick(P('jump'));
  for (let i = 0; i < 12; i++) d.tick();
  // The target in the air under the slam, held there.
  Object.assign(d.target.body, { y: d.attacker.body.y + 80, grounded: false, ground: null, gravityScale: 0, vy: 0 });
  d.tick(P('attack2'));
  for (let i = 0; i < 120 && !d.attacker.body.grounded; i++) {
    d.target.body.vy = Math.max(0, d.target.body.vy);
    d.tick();
  }
  assert.equal(d.events[0]?.type, 'hit', 'the heel on the way down');
  assert.equal(d.events[0].move, 'midair_attack2');
  assert.equal(d.attacker.body.grounded, true, 'plunged on through to the ground');
  assert.equal(d.attacker.combat.attack?.motion.landed, true);
});

test('a plunge that runs out in the air lands nothing: it falls on under gravity, and touchdown ends it as ever', () => {
  const { fighter, step } = stomper({ y: 0 });
  fighter.body.y = -1200;
  fighter.body.grounded = false;
  step(P('attack2'));
  for (let i = 0; i < steps(HANG + PLUNGE) + 1; i++) step({});
  assert.equal(fighter.body.grounded, false, 'still in the air');
  assert.equal(fighter.combat.attack.motion.done, true);
  assert.equal(fighter.combat.attack.motion.landed ?? false, false, 'nothing landed');
  for (let i = 0; i < 300 && !fighter.body.grounded; i++) step({});
  assert.equal(fighter.combat.attack, null, 'the landing cancel ends it on touchdown');
});

// ---- The CPU -----------------------------------------------------------------------------

test('the CPU reads a slam\'s impact, and weighs it as a plunge from the air', () => {
  const caps = analyzeCapabilities(stomper().fighter);
  const m = caps.moves.find((x) => x.key === 'attack2:air');
  assert.equal(m.motion, 'slam');
  assert.deepEqual({ ...m.impact.box }, IMPACT);
  assert.equal(m.impact.strike.damage, 5);
  assert.equal(m.impact.strike.quake, true);
  assert.equal(m.damage, 8, 'its heel and its impact');
  assert.ok(m.roles.has('airToGround') && m.roles.has('areaDenial'));
  assert.equal(DT > 0, true);
});
