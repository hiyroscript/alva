// Run with node --test tests/systems/technique.test.mjs (no dependencies).
// Techniques (js/game/combat/technique.js), in their one form, the cast: a
// numbered button whose move the fighter performs standing still, committed
// to a casting pose, then lets go of all at once: a projectile, a burst
// round itself, or both. Its timing is its clips', its facing is
// snapshotted as it starts, it needs the ground throughout, a hit breaks
// it, and its cooldown runs from its start. Checked on a test-only caster
// (#0001's body and clips, re-timed, with a technique of its own) through
// the real Fighter, projectiles and CombatSystem (see
// tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTechniqueDefinition, techniqueProblem, TECHNIQUE_CLIPS } from '../../js/game/combat/technique.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { def, DT, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';
import { StageCollision } from '../../js/game/physics.js';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const A = def.animations;

// The caster: its Attack 4 a cast of 6 frames at 20 fps (0.3 s), then a
// release pose of 0.2 s, letting go of an orb (#0001's Red, borrowed as its
// own attack4_object) and a burst 100 units round it.
const CAST = 0.3;
const RELEASE = 0.2;
const CASTER = {
  ...def,
  id: 'test-caster',
  animations: { ...A, attack4_cast: { ...A.attack4_cast, fps: 20 }, attack4_release: { ...A.attack4_release, fps: 5 } },
  projectiles: { ...def.projectiles, attack4_object: { ...def.projectiles.attack2_object, animation: 'attack4_object' } },
  projectileAnimations: { ...def.projectileAnimations, attack4_object: def.projectileAnimations.attack2_object },
  actions: { ...def.actions, attack4: { type: 'technique', id: 'attack4' } },
  techniques: {
    attack4: {
      castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release', cooldown: 3,
      projectile: { id: 'attack4_object', offset: { x: 50, y: -40 } },
      burst: { hitbox: { x: -100, y: -100, w: 200, h: 100 }, hit: { damage: 2, hitstun: 0.3, hitstop: 0.05 } },
    },
  },
};
const SPRITES = fakeSpritesOf(CASTER);
const caster = (opts = {}) => makeFighter({ character: CASTER, sprites: SPRITES, ...opts });
const versus = (opts = {}) => duel({ attackerCharacter: CASTER, attackerSprites: SPRITES, ...opts });

// ---- Data ---------------------------------------------------------------------------

test('a technique is data: its clips, its cooldown and what it releases, frozen and validated', () => {
  const t = createTechniqueDefinition({ id: 'attack4', ...CASTER.techniques.attack4 });
  assert.ok(Object.isFrozen(t) && Object.isFrozen(t.projectile) && Object.isFrozen(t.burst) && Object.isFrozen(t.burst.hit));
  assert.deepEqual(t.projectile, { id: 'attack4_object', offset: { x: 50, y: -40 } });
  assert.equal(t.burst.hit.damage, 2);
  assert.equal(t.burst.hit.blockstun, 0.12, 'a hit\'s own defaults');
  assert.equal(t.burst.hit.unblockable, false, 'and the shared hit effects');
  assert.deepEqual([...TECHNIQUE_CLIPS], ['castAnimation', 'releaseAnimation']);
  assert.deepEqual(createTechniqueDefinition({ id: 'x', projectile: { id: 'o' } }).projectile.offset, { x: 0, y: 0 });
  assert.throws(() => createTechniqueDefinition({}), /need an id/);
  assert.throws(() => createTechniqueDefinition({ id: 'x', burst: { hitbox: { x: 0, y: 0, w: 1, h: 1 }, hit: { paralyze: -1 } } }), /Hit "x.burst"'s paralyze/);
  // The runtime is one form: nothing of a fighter, a button or another form.
  const code = readFileSync(new URL('../../js/game/combat/technique.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /000\d|'attack\d'|dash|rush|sphere|tick|bind|explosion/i);
});

test('a technique that cannot be shown or releases nothing is refused before it starts', () => {
  const { fighter } = caster();
  const t = (spec) => createTechniqueDefinition({ id: 'attack4', ...CASTER.techniques.attack4, ...spec });
  assert.equal(techniqueProblem(fighter, t({})), null);
  assert.match(techniqueProblem(fighter, t({ castAnimation: 'nope' })), /fighter clip "nope" has no animation frames/);
  assert.match(techniqueProblem(fighter, t({ projectile: null, burst: null })), /releases nothing/);
  assert.match(techniqueProblem(fighter, t({ projectile: { id: 'attack9_object' } })), /projectile "attack9_object" is not defined/);
  assert.match(techniqueProblem(fighter, t({ burst: { hitbox: { x: 0, y: 0, w: 0, h: 10 }, hit: {} } })), /burst has no hitbox/);
});

// ---- The cast ------------------------------------------------------------------------

test('it casts for its cast clip, standing still and committed, then releases once and holds its release pose', () => {
  const { fighter, step } = caster();
  step({});
  step({ ...P('attack4'), runRight: true });
  const t = fighter.technique;
  assert.equal(t?.phase, 'cast');
  assert.equal(t.action, 'attack4');
  assert.equal(t.castDuration, CAST);
  assert.equal(t.releaseDuration, RELEASE);
  let castSteps = 1;
  const x = fighter.body.x;
  while (fighter.technique?.phase === 'cast') {
    step({ runRight: true, ...P('attack1'), ...P('jump') });
    castSteps++;
    assert.equal(fighter.body.x, x, 'still, whatever is held');
    assert.equal(fighter.combat.attack, null, 'nothing else starts');
    assert.equal(fighter.body.grounded, true, 'no jump');
  }
  assert.equal(castSteps, steps(CAST) + 1, 'its cast pose for the whole clip, releasing on the step after');
  assert.equal(t.phase, 'release');
  assert.equal(t.released, true);
  assert.equal(fighter.releases.length, 1, 'its projectile, queued once');
  assert.deepEqual(fighter.releases[0], { id: 'attack4_object', offset: { x: 50, y: -40 }, direction: 1 });
  fighter.releases.length = 0;
  let releaseSteps = 0;
  while (fighter.technique) {
    step({});
    releaseSteps++;
    assert.equal(fighter.releases.length, 0, 'never again');
  }
  assert.equal(releaseSteps, steps(RELEASE));
  assert.equal(t.endReason, 'done');
  assert.equal(fighter.canAct(), true);
});

test('it goes the way held as it starts, and never turns while it plays', () => {
  const { fighter, step } = caster();
  step({});
  step({ ...P('attack4'), runLeft: true });
  assert.equal(fighter.facing, -1, 'turned on the press step');
  assert.equal(fighter.technique.facing, -1);
  while (fighter.technique?.phase === 'cast') step({ runRight: true });
  assert.equal(fighter.facing, -1, 'never turned back');
  assert.equal(fighter.releases[0].direction, -1, 'released that way');
});

test('its burst strikes every opponent its box meets, in front or behind, once, freezing only them', () => {
  for (const behind of [false, true]) {
    const d = versus({ gap: 80 });
    d.tick({});
    // Behind: cast facing away from the target (the direction held on the
    // press step), the box reaching back over it all the same.
    d.tick({ ...P('attack4'), ...(behind ? { runLeft: true } : {}) });
    assert.equal(d.attacker.technique.facing, behind ? -1 : 1);
    d.until(() => d.events.some((e) => e.technique), steps(CAST) + 5);
    const burst = d.events.filter((e) => e.technique);
    assert.equal(burst.length, 1, 'once');
    assert.equal(burst[0].damage, 2);
    assert.equal(burst[0].target, d.target);
    assert.equal(burst[0].technique.action, 'attack4');
    assert.equal(d.attacker.combat.hitstop, 0, 'detached: the caster never freezes');
    d.until(() => !d.attacker.technique, 60);
    assert.equal(d.events.filter((e) => e.technique).length, 1, 'and never again');
  }
});

test('a hit during the cast breaks it and nothing is released; one after the release leaves what it let go', () => {
  const strike = createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 });
  // Mid-cast.
  const early = versus({ gap: 300 });
  early.tick({});
  early.tick(P('attack4'));
  const t = early.attacker.technique;
  early.tick();
  new CombatSystem().applyHit(early.target, early.attacker, strike);
  assert.equal(early.attacker.technique, null);
  assert.equal(t.endReason, 'hit');
  assert.equal(t.released, false);
  for (let i = 0; i < steps(CAST + RELEASE); i++) early.tick();
  assert.deepEqual(early.projectiles, [], 'nothing came of it');
  assert.ok(early.attacker.combat.abilityCooldowns.active('attack4'), 'its cooldown runs on all the same');
  // In its release pose: the orb is out and flies on.
  const late = versus({ gap: 300 });
  late.tick({});
  late.tick(P('attack4'));
  const cast = late.attacker.technique;
  late.until(() => late.projectiles.length === 1, steps(CAST) + 5);
  assert.equal(cast.phase, 'release');
  new CombatSystem().applyHit(late.target, late.attacker, strike);
  assert.equal(cast.endReason, 'hit');
  late.tick();
  assert.equal(late.projectiles.length, 1, 'the orb flies on');
});

test('it needs the ground throughout: losing it ends the cast, nothing released, and the fighter falls', () => {
  const stage = new StageCollision(stageMap({ platforms: [{ id: 'deck', x: 400, y: 700, w: 200, h: 16 }] }));
  const { fighter, step } = caster({ x: 500, y: 700, stage });
  step({});
  assert.equal(fighter.body.ground?.id, 'deck');
  step(P('attack4'));
  const t = fighter.technique;
  // The deck gives way under it.
  stage.platforms.length = 0;
  step({});
  assert.equal(fighter.technique, null);
  assert.equal(t.endReason, 'ground');
  assert.equal(t.released, false);
  assert.equal(fighter.body.grounded, false);
  assert.deepEqual(fighter.releases, []);
});

test('its cooldown runs from its start; a press while it runs, in the air or mid-attack does nothing at all', () => {
  const { fighter, step } = caster();
  step({});
  step(P('attack4'));
  const cd = fighter.combat.abilityCooldowns;
  assert.equal(cd.remaining('attack4'), 3, 'started on the press step');
  step({});
  assert.ok(Math.abs(cd.remaining('attack4') - (3 - DT)) < 1e-9, 'running from there');
  while (fighter.technique) step({});
  step(P('attack4'));
  assert.equal(fighter.technique, null, 'cooling down: nothing');
  assert.equal(fighter.combat.attack, null, 'and no other move instead');
  for (let i = 0; i < steps(3); i++) step({});
  assert.equal(cd.active('attack4'), false);
  // In the air: nothing.
  step(P('jump'));
  for (let i = 0; i < 6; i++) step({});
  step(P('attack4'));
  assert.equal(fighter.technique, null);
  assert.equal(cd.active('attack4'), false, 'nothing spent');
  while (!fighter.body.grounded) step({});
  for (let i = 0; i < 12; i++) step({});
  // Mid-attack: nothing either.
  step(P('attack1'));
  step(P('attack4'));
  assert.equal(fighter.technique, null);
  assert.equal(cd.active('attack4'), false);
});
