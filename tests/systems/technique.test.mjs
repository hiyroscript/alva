// Run with node --test tests/systems/technique.test.mjs (no dependencies).
// Techniques (js/game/combat/technique.js), in their one form, the cast: a
// numbered button whose move the fighter performs standing still, committed
// to a casting pose, then lets go of all at once: a projectile, a burst
// round itself (with art of its own as it goes out), or both. Its timing is
// its clips', its facing is snapshotted as it starts, it needs the ground
// throughout, a hit breaks
// it, and its cooldown (a 3 s or 5 s one) runs from its release, never its start. Checked on a test-only caster
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
      castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release',
      projectile: { id: 'attack4_object', offset: { x: 50, y: -40 } },
      burst: { hitbox: { x: -100, y: -100, w: 200, h: 100 }, hit: { damage: 3, hitstun: 0.3, hitstop: 0.05 } },
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
  assert.equal(t.burst.hit.damage, 3);
  assert.equal(t.burst.hit.blockstun, 0.12, 'a hit\'s own defaults');
  assert.equal(t.burst.hit.paralyze, 0, 'and the shared hit effects');
  assert.deepEqual({ ...t.offense, sources: [...t.offense.sources] }, { attack: true, defense: false, sources: ['burst', 'projectile'] },
    'executed as a technique, classified as an attack');
  assert.deepEqual([...TECHNIQUE_CLIPS], ['castAnimation', 'releaseAnimation']);
  assert.deepEqual(createTechniqueDefinition({ id: 'x', projectile: { id: 'o' } }).projectile.offset, { x: 0, y: 0 });
  assert.throws(() => createTechniqueDefinition({}), /need an id/);
  assert.throws(() => createTechniqueDefinition({ id: 'x', burst: { hitbox: { x: 0, y: 0, w: 1, h: 1 }, hit: { damage: 1, paralyze: -1 } } }), /Hit "x.burst"'s paralyze/);
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
  assert.match(techniqueProblem(fighter, t({ burst: { hitbox: { x: 0, y: 0, w: 0, h: 10 }, hit: { damage: 1 } } })), /burst has no hitbox/);
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
  assert.deepEqual(fighter.releases[0], { id: 'attack4_object', offset: { x: 50, y: -40 }, direction: 1, ability: 'attack4' });
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
    assert.equal(burst[0].damage, 3);
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
  assert.equal(early.attacker.combat.abilityCooldowns.active('attack4'), false, 'never released: no cooldown');
  for (let i = 0; i < steps(CAST + RELEASE); i++) early.tick();
  assert.deepEqual(early.projectiles, [], 'nothing came of it');
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

// The caster with a burst that paralyzes: an exceptional effect, so the
// cooldown policy gives it 3 s (js/data/cooldowns.js).
const PARALYZER = {
  ...CASTER,
  id: 'test-paralyzer',
  techniques: {
    attack4: {
      ...CASTER.techniques.attack4,
      burst: { ...CASTER.techniques.attack4.burst, hit: { ...CASTER.techniques.attack4.burst.hit, paralyze: 0.5 } },
    },
  },
};
const PARALYZER_SPRITES = fakeSpritesOf(PARALYZER);

test('its cooldown runs from its release, never its press; a press while it runs, in the air or mid-attack does nothing at all', () => {
  const { fighter, step } = makeFighter({ character: PARALYZER, sprites: PARALYZER_SPRITES });
  assert.equal(fighter.techniqueDefs.attack4.cooldown, 3, 'a paralysis: the policy\'s 3 s');
  assert.equal(caster().fighter.techniqueDefs.attack4.cooldown, 0, 'the plain caster: no cooldown at all');
  step({});
  step(P('attack4'));
  const cd = fighter.combat.abilityCooldowns;
  assert.equal(cd.active('attack4'), false, 'nothing on the press step');
  while (!fighter.technique.released) {
    assert.equal(cd.active('attack4'), false, 'nothing while it casts');
    step({});
  }
  assert.equal(cd.remaining('attack4'), 3, 'started on the release step');
  step({});
  assert.ok(Math.abs(cd.remaining('attack4') - (3 - DT)) < 1e-9, 'running from there');
  while (fighter.technique) step({});
  step(P('attack4'));
  assert.equal(fighter.technique, null, 'cooling down: nothing');
  assert.equal(fighter.combat.attack, null, 'and no other move instead');
  for (let i = 0; i < steps(3); i++) step({});
  assert.equal(cd.active('attack4'), false);
  assert.equal(fighter.combat.energy, 100, 'a 3 s technique pays no Energy');
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

// ---- A heal of its own ----------------------------------------------------------------

// The healer: the same caster, its Attack 4 a cast that heals it of 10
// Launch Points and releases nothing else.
const HEALER = {
  ...CASTER,
  id: 'test-healer',
  techniques: { attack4: { castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release', heal: 10 } },
};
const HEALER_SPRITES = fakeSpritesOf(HEALER);
const healer = (opts = {}) => makeFighter({ character: HEALER, sprites: HEALER_SPRITES, ...opts });

test('a heal is a whole number of Launch Points; a cast that only heals releases something, and is no attack', () => {
  const t = createTechniqueDefinition({ id: 'attack4', ...HEALER.techniques.attack4 });
  assert.equal(t.heal, 10);
  assert.equal(createTechniqueDefinition({ id: 'x', burst: CASTER.techniques.attack4.burst }).heal, 0, 'none by default');
  assert.deepEqual({ ...t.offense, sources: [...t.offense.sources] }, { attack: false, defense: false, sources: [] },
    'it harms nobody: no attack, whatever executes it');
  assert.equal(techniqueProblem(healer().fighter, t), null, 'a heal is something to release');
  for (const bad of [-1, 2.5, '10', NaN]) {
    assert.throws(() => createTechniqueDefinition({ id: 'attack4', ...HEALER.techniques.attack4, heal: bad }), /heal must be a whole number/, String(bad));
  }
});

test('as it releases it takes its heal off its own fighter\'s Launch Point, never below 0, and leaves the passive recovery as it was', () => {
  const { fighter, step } = healer();
  fighter.combat.launchPoint = 25;
  fighter.combat.launchRecoveryRemaining = 99;
  step(P('attack4'));
  let at = -1;
  for (let i = 0; i < steps(CAST) + 5 && at < 0; i++) {
    step({});
    if (fighter.heals.length) at = i;
  }
  assert.ok(at >= 0, 'healed');
  assert.equal(fighter.technique.phase, 'release', 'as the cast ends');
  assert.deepEqual(fighter.heals, [{ amount: 10, ability: 'attack4' }]);
  assert.equal(fighter.combat.launchPoint, 15);
  assert.ok(fighter.combat.launchRecoveryRemaining > 90, 'the passive schedule untouched');
  step({});
  assert.deepEqual(fighter.heals, [], 'recorded for its own step only');
  // Below its heal, down to 0 and no further.
  const low = healer();
  low.fighter.combat.launchPoint = 4;
  low.step(P('attack4'));
  for (let i = 0; i < steps(CAST + RELEASE) + 5; i++) low.step({});
  assert.equal(low.fighter.combat.launchPoint, 0);
});

test('a hit before it lets go breaks it and heals nothing', () => {
  const d = duel({ attackerCharacter: HEALER, attackerSprites: HEALER_SPRITES, gap: 300 });
  d.attacker.combat.launchPoint = 30;
  d.tick({});
  d.tick(P('attack4'));
  d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  assert.equal(d.attacker.technique, null);
  for (let i = 0; i < steps(CAST + RELEASE); i++) d.tick();
  assert.equal(d.attacker.combat.launchPoint, 31, 'only the hit counted');
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack4'), false, 'never released: no cooldown');
});

// ---- The burst's art --------------------------------------------------------------------

// The singer: the caster whose burst plays art as it goes out, an
// effectAnimations clip of its own (named after it, attack4_object...: here
// #0001's Hollow Purple sphere, borrowed), centred 40 units up and 10 ahead.
const SINGER = {
  ...CASTER,
  id: 'test-singer',
  effectAnimations: { attack4_object_ring: { ...def.projectileAnimations.attack5_object, loop: false, fps: 10 } },
  techniques: {
    attack4: {
      ...CASTER.techniques.attack4,
      projectile: null,
      burst: { ...CASTER.techniques.attack4.burst, effect: { animation: 'attack4_object_ring', offset: { x: 10, y: -40 } } },
    },
  },
};
const SINGER_SPRITES = fakeSpritesOf(SINGER);

test('a burst may name its art (`effect`): an effect clip of its own, centred at an offset; art only, refused without its art', () => {
  const t = createTechniqueDefinition({ id: 'attack4', ...SINGER.techniques.attack4 });
  assert.deepEqual(t.burst.effect, { animation: 'attack4_object_ring', offset: { x: 10, y: -40 } });
  assert.ok(Object.isFrozen(t.burst.effect) && Object.isFrozen(t.burst.effect.offset));
  assert.equal(createTechniqueDefinition({ id: 'attack4', ...CASTER.techniques.attack4 }).burst.effect, null, 'none by default');
  assert.equal(t.cooldownClass, createTechniqueDefinition({ id: 'attack4', ...CASTER.techniques.attack4, projectile: null }).cooldownClass, 'art changes no cooldown');
  assert.throws(() => createTechniqueDefinition({ id: 'attack4', burst: { ...SINGER.techniques.attack4.burst, effect: { offset: {} } } }), /burst effect needs an animation/);
  const singer = makeFighter({ character: SINGER, sprites: SINGER_SPRITES }).fighter;
  assert.equal(techniqueProblem(singer, t), null);
  const bare = makeFighter({ character: SINGER, sprites: fakeSpritesOf(SINGER, undefined, undefined, []) }).fighter;
  assert.match(techniqueProblem(bare, t), /burst effect "attack4_object_ring" has no animation frames/);
});

test('the loadout rules: a burst\'s art is an effectAnimations clip named after its technique', async () => {
  const { loadoutProblems } = await import('../../js/data/loadout.js');
  const burstProblems = (d) => loadoutProblems(d).filter((p) => /burst/.test(p));
  assert.deepEqual(burstProblems(SINGER), []);
  const missing = { ...SINGER, effectAnimations: {} };
  assert.ok(burstProblems(missing).some((p) => /burst effect "attack4_object_ring" is not in `effectAnimations`/.test(p)));
  const misnamed = {
    ...SINGER,
    effectAnimations: { attack3_object: SINGER.effectAnimations.attack4_object_ring },
    techniques: { attack4: { ...SINGER.techniques.attack4, burst: { ...SINGER.techniques.attack4.burst, effect: { animation: 'attack3_object' } } } },
  };
  assert.ok(burstProblems(misnamed).some((p) => /burst effect "attack3_object" is not named attack4_object/.test(p)));
});

test('as it lets go, its fighter hands over the burst\'s art once: its clip, its centre mirrored with the cast\'s facing; a broken cast none', () => {
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ character: SINGER, sprites: SINGER_SPRITES, facing });
    step(P('attack4'));
    const given = [];
    for (let i = 0; i < steps(CAST + RELEASE) + 5; i++) {
      step({});
      given.push(...fighter.effects);
    }
    assert.deepEqual(given, [{ animation: 'attack4_object_ring', x: fighter.body.x + 10 * facing, y: fighter.body.y - 40, facing }]);
  }
  const d = duel({ attackerCharacter: SINGER, attackerSprites: SINGER_SPRITES, gap: 300 });
  d.tick(P('attack4'));
  d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  let any = false;
  for (let i = 0; i < steps(CAST + RELEASE); i++) {
    d.tick();
    any ||= d.attacker.effects.length > 0;
  }
  assert.equal(any, false, 'broken before it let go: no art');
});

test('the arena plays a burst\'s art once where it went out, behind the fighters, then drops it', async () => {
  const { Battle } = await import('../../js/game/battle.js');
  const { getMap } = await import('../../js/data/maps.js');
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: SINGER, p2Def: def,
    p1Sprites: SINGER_SPRITES, p2Sprites: fakeSpritesOf(def), input: { flush() {}, sample: () => ({}) },
  });
  let next = {};
  battle.p1.controller = { getInput: () => { const n = next; next = {}; return n; } };
  battle.p2.controller = null;
  battle.setPhase('fight');
  next = P('attack4');
  let seen = 0;
  let at = null;
  for (let i = 0; i < steps(CAST + RELEASE + 2); i++) {
    battle.update(DT);
    if (battle.castEffects.length) {
      seen++;
      at ??= { ...battle.castEffects[0] };
    }
  }
  const clip = SINGER_SPRITES.effect('attack4_object_ring');
  assert.ok(at, 'played');
  assert.equal(at.clip, clip);
  assert.equal(Math.abs(seen - clip.frames.length / clip.fps / DT) <= 1, true, `one pass of its clip (${seen} steps)`);
  assert.deepEqual(battle.castEffects, [], 'then gone');
  const arena = readFileSync(new URL('../../js/game/arena.js', import.meta.url), 'utf8');
  assert.match(arena, /drawCastEffect\(e\)[\s\S]*drawClone\(c\)[\s\S]*this\.drawFighter\(f\)/, 'drawn behind the clones and fighters');
  battle.destroy();
});
