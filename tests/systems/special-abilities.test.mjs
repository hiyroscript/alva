// Run with node --test tests/systems/special-abilities.test.mjs (no dependencies).
// Special abilities: the player-facing classification each fighter makes of
// its own moves (js/data/special-abilities.js), apart from how a move is
// executed (js/data/loadout.js) and from its cooldown (js/data/cooldowns.js).
// The roster's exact classification; the controller editor's categories it
// decides, with every binding unchanged; the rules a definition's list must
// keep; a future fighter opting in with data alone; the moves' execution
// types, cooldowns and Cherry Blossom Impact's quicker, frame-aligned timing;
// and the orange mark's lifecycle (js/game/combat/move-status.js
// activeSpecialAbility, drawn by js/game/rendering/fighter-status.js) for
// every Special and every move that is not one, for a player and a CPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../js/data/characters.js';
import {
  isSpecialAbility, performableMoves, specialAbilities, specialAbilityProblems, assertSpecialAbilities,
} from '../../js/data/special-abilities.js';
import { actionMap, controllerActions, recommendedProfile } from '../../js/data/controller-profiles.js';
import { actionType, specialAttacks } from '../../js/data/loadout.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { activeMove, activeSpecialAbility } from '../../js/game/combat/move-status.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { mulberry32 } from '../../js/core/utils.js';
import { DT, duel, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const press = (action) => ({ [action]: true, [`${action}Pressed`]: true });
const near = (a, b) => Math.abs(a - b) < 1e-9;

// The roster's classification, as the owner set it: every move each fighter
// can perform, and whether it is Special.
const SPECIALS = Object.freeze({
  '0001': ['attack4', 'attack5'],
  '0002': [],
  '0003': ['attack4'],
  '0004': ['attack5'],
  '0005': ['attack4', 'attack5'],
  '0006': ['attack4'],
  '0007': ['attack5'],
});

// ---- The classification ------------------------------------------------------------------

test('exactly eight Specials across the roster: Unlimited Void and Hollow Purple, none for #0002, the Mystical Palm Technique, World is Mine, the Deadlights, the Red Balloon, Ice Breath and the Rocket Launcher', () => {
  let total = 0;
  for (const def of playableCharacters()) {
    assert.deepEqual(def.specialAbilities, SPECIALS[def.id], `#${def.id} declares its own, explicitly`);
    assert.deepEqual(specialAbilities(def), SPECIALS[def.id], `#${def.id}`);
    for (const move of performableMoves(def)) {
      assert.equal(isSpecialAbility(def, move), SPECIALS[def.id].includes(move), `#${def.id} ${move}`);
    }
    total += specialAbilities(def).length;
  }
  assert.equal(total, 8);
  const name = (id, move) => getCharacter(id).abilityNames[move];
  assert.deepEqual(specialAbilities(getCharacter('0001')).map((m) => name('0001', m)), ['Unlimited Void', 'Hollow Purple']);
  assert.deepEqual(specialAbilities(getCharacter('0003')).map((m) => name('0003', m)), ['Mystical Palm Technique']);
  assert.deepEqual(specialAbilities(getCharacter('0004')).map((m) => name('0004', m)), ['World is Mine']);
  assert.deepEqual(specialAbilities(getCharacter('0005')).map((m) => name('0005', m)), ['Deadlights', 'Red Balloon']);
  assert.deepEqual(specialAbilities(getCharacter('0006')).map((m) => name('0006', m)), ['Ice Breath']);
  assert.deepEqual(specialAbilities(getCharacter('0007')).map((m) => name('0007', m)), ['Rocket Launcher']);
  // The Molotov Cocktail and the Sawn-Offs are techniques too, and ordinary.
  for (const move of ['attack3', 'attack4']) {
    assert.equal(actionType(getCharacter('0007'), move), 'technique');
    assert.equal(isSpecialAbility(getCharacter('0007'), move), false, `${name('0007', move)} is not Special`);
  }
  // Heat Vision and the Sonic Scream are techniques too, and ordinary.
  for (const move of ['attack3', 'attack5']) {
    assert.equal(actionType(getCharacter('0006'), move), 'technique');
    assert.equal(isSpecialAbility(getCharacter('0006'), move), false, `${name('0006', move)} is not Special`);
  }
  // The Red Balloon is the roster's first summon; Dark Tendrils pull, and
  // are ordinary to the player.
  assert.equal(actionType(getCharacter('0005'), 'attack5'), 'summon');
  assert.equal(isSpecialAbility(getCharacter('0005'), 'extra_attack'), false, 'Dark Tendrils are not Special');
  // Ievan Polkka is a technique too, and ordinary to the player.
  assert.equal(actionType(getCharacter('0004'), 'attack4'), 'technique');
  assert.equal(isSpecialAbility(getCharacter('0004'), 'attack4'), false, 'Ievan Polkka is not Special');
  // The four moves reclassified as ordinary.
  for (const [id, move, label] of [
    ['0001', 'attack2', 'Red'], ['0001', 'attack3', 'Maximum Blue'],
    ['0002', 'extra_attack', 'Whirlwind'], ['0003', 'attack3', 'Cherry Blossom Impact'],
  ]) {
    assert.equal(name(id, move), label);
    assert.equal(isSpecialAbility(getCharacter(id), move), false, `${label} is not Special`);
  }
});

test('Special is never inferred: a projectile, a technique or a summon is not Special unless its fighter says so', () => {
  const def = getCharacter('0001');
  assert.ok(def.attacks.attack2.projectile && def.attacks.attack3.projectile, 'Red and Maximum Blue throw projectiles');
  assert.equal(isSpecialAbility(def, 'attack2'), false);
  const cbi = getCharacter('0003');
  assert.equal(actionType(cbi, 'attack3'), 'technique', 'Cherry Blossom Impact is executed as a technique');
  assert.equal(isSpecialAbility(cbi, 'attack3'), false);
  // The same fighter with no list has no Special at all, whatever its moves are.
  const bare = { ...def, specialAbilities: undefined };
  assert.deepEqual(specialAbilities(bare), []);
  assert.ok(!controllerActions(bare).some((a) => a.category === 'abilities'));
  // Nothing about a move but the fighter's list decides: not its name.
  const renamed = { ...def, abilityNames: { ...def.abilityNames, attack2: 'Unlimited Void' } };
  assert.equal(isSpecialAbility(renamed, 'attack2'), false);
  for (const junk of [null, undefined, 4, {}, ['attack4']]) assert.equal(isSpecialAbility(def, junk), false);
  assert.equal(isSpecialAbility(null, 'attack4'), false);
});

test('the controller editor\'s categories follow the classification; every binding and availability stays as it was', () => {
  const expect = {
    '0001': {
      ground: ['attack1', 'attack2', 'attack3', 'extra_attack'],
      air: ['attack1', 'attack2', 'attack3', 'extra_attack'],
      abilities: ['ground:attack4', 'ground:attack5'],
    },
    '0002': {
      ground: ['attack1', 'attack2', 'attack3', 'extra_attack'],
      air: ['attack1', 'attack2', 'attack3'],
      abilities: [],
    },
    '0003': {
      ground: ['attack1', 'attack2', 'attack3', 'extra_attack'],
      air: ['attack1', 'attack2'],
      abilities: ['ground:attack4'],
    },
    '0004': {
      ground: ['attack1', 'attack2', 'attack3', 'attack4', 'extra_attack'],
      air: ['attack1', 'attack2', 'attack3'],
      abilities: ['ground:attack5'],
    },
    '0005': {
      ground: ['attack1', 'attack2', 'attack3', 'extra_attack'],
      air: ['attack1', 'attack2', 'attack3'],
      abilities: ['ground:attack4', 'ground:attack5'],
    },
    '0006': {
      ground: ['attack1', 'attack2', 'attack3', 'attack5', 'extra_attack'],
      air: ['attack1', 'attack2', 'extra_attack'],
      abilities: ['ground:attack4'],
    },
    '0007': {
      ground: ['attack1', 'attack2', 'attack3', 'attack4', 'extra_attack'],
      air: ['attack1', 'attack2'],
      abilities: ['ground:attack5'],
    },
  };
  for (const def of playableCharacters()) {
    const actions = controllerActions(def);
    const of = (category) => actions.filter((a) => a.category === category).map((a) => a.id);
    assert.deepEqual(of('ground'), expect[def.id].ground.map((c) => `ground:${c}`), `#${def.id} ground`);
    assert.deepEqual(of('air'), expect[def.id].air.map((c) => `air:${c}`), `#${def.id} air`);
    assert.deepEqual(of('abilities'), expect[def.id].abilities, `#${def.id} Special abilities`);
    for (const a of actions.filter((x) => x.kind === 'attack')) {
      assert.equal(a.category === 'abilities', isSpecialAbility(def, a.move), `#${def.id} ${a.id}`);
    }
    // The recommended layout is exactly the authored one, row for row.
    const { bindings } = recommendedProfile(def);
    for (const [id, binding] of Object.entries(def.controller.layout)) assert.deepEqual(bindings[id], binding, `#${def.id} ${id}`);
  }
  // Ground-only stays ground-only: no new aerial version for a technique or
  // the Whirlwind.
  const ids = (id) => controllerActions(getCharacter(id)).map((a) => a.id);
  assert.ok(!ids('0003').includes('air:attack3'), 'Cherry Blossom Impact: still ground only');
  assert.ok(!ids('0002').includes('air:extra_attack'), 'the Whirlwind: still ground only');
  assert.ok(ids('0001').includes('air:attack2') && ids('0001').includes('air:attack3'), 'Red and Blue keep their own aerials');
  // The four ordinary moves that are projectiles or techniques have the
  // inputs their fighters authored for them, whatever their category.
  const binding = (id, action) => recommendedProfile(getCharacter(id)).bindings[action];
  const input = (button, extra = {}) => ({ button, modifier: null, stick: null, direction: null, activation: 'press', ...extra });
  assert.deepEqual(binding('0001', 'ground:attack2'), input('r2'), 'Red');
  assert.deepEqual(binding('0001', 'ground:attack3'), input('east'), 'Maximum Blue');
  assert.deepEqual(binding('0002', 'ground:extra_attack'), input('r2'), 'Whirlwind');
  assert.deepEqual(binding('0003', 'ground:attack3'), input(null, { stick: 'rightStick', direction: 'down' }), 'Cherry Blossom Impact');
});

test('execution types and the loadout\'s own special semantics are untouched', () => {
  assert.deepEqual(specialAttacks(getCharacter('0001')), ['attack4', 'attack5'], 'its techniques');
  assert.deepEqual(specialAttacks(getCharacter('0002')), []);
  assert.deepEqual(specialAttacks(getCharacter('0003')), ['attack3', 'attack4'], 'Cherry Blossom Impact is still a technique');
  const types = (id) => Object.fromEntries(['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']
    .map((b) => [b, actionType(getCharacter(id), b)]));
  assert.deepEqual(types('0001'), { attack1: 'attack', attack2: 'attack', attack3: 'attack', attack4: 'technique', attack5: 'technique', extra_attack: 'attack' });
  assert.deepEqual(types('0002'), { attack1: 'attack', attack2: 'attack', attack3: 'attack', attack4: null, attack5: null, extra_attack: 'attack' });
  assert.deepEqual(types('0003'), { attack1: 'attack', attack2: 'attack', attack3: 'technique', attack4: 'technique', attack5: null, extra_attack: 'attack' });
  // The moves keep their mechanics.
  const p = getCharacter('0001').projectiles;
  assert.equal(p.attack2_object.repel, true, 'Red repels');
  assert.ok(p.attack3_object.pull && p.attack3_object.pierce, 'Maximum Blue pulls and grinds');
  assert.equal(p.attack5_object.erase, true, 'Hollow Purple erases');
  assert.ok(getCharacter('0001').techniques.attack4.burst.hit.paralyze > 0, 'Unlimited Void paralyzes');
  assert.equal(getCharacter('0003').techniques.attack4.heal, 10, 'the Mystical Palm Technique heals');
  assert.equal(getCharacter('0003').techniques.attack3.burst.hit.quake, true, 'Cherry Blossom Impact quakes');
  const whirl = getCharacter('0002').projectiles.extra_attack_object;
  assert.ok(whirl.finisher, 'the Whirlwind\'s tornado keeps its finisher');
});

test('cooldowns never depend on the label: the policy\'s classes are unchanged, and relabelling changes none', () => {
  const classes = (def) => {
    const out = {};
    const context = { projectiles: def.projectiles, attacks: def.attacks };
    for (const [id, spec] of Object.entries(def.attacks)) out[id] = cooldownClass('attack', { id, ...spec }, context);
    for (const [id, spec] of Object.entries(def.techniques ?? {})) out[id] = cooldownClass('technique', { id, ...spec }, context);
    return out;
  };
  const c1 = classes(getCharacter('0001'));
  assert.equal(c1.attack4, 'exceptional', 'Unlimited Void: 3 s');
  assert.equal(c1.attack5, 'tenDamage', 'Hollow Purple: 5 s');
  assert.equal(c1.attack2, 'ordinary', 'Red');
  assert.equal(c1.attack3, 'ordinary', 'Maximum Blue');
  assert.equal(classes(getCharacter('0002')).extra_attack, 'tenDamage', 'the Whirlwind keeps its 5 s');
  const c3 = classes(getCharacter('0003'));
  assert.equal(c3.attack4, 'exceptional', 'the Mystical Palm Technique: 3 s');
  assert.equal(c3.attack3, 'ordinary', 'Cherry Blossom Impact');
  for (const def of playableCharacters()) {
    const flipped = { ...def, specialAbilities: [...performableMoves(def)].filter((m) => !isSpecialAbility(def, m)) };
    assert.deepEqual(classes(flipped), classes(def), `#${def.id}: labels move no cooldown`);
    const { fighter } = makeFighter({ character: def });
    const { fighter: relabelled } = makeFighter({ character: flipped, sprites: fakeSpritesOf(def) });
    for (const id of Object.keys(fighter.attacks)) assert.equal(relabelled.attacks[id].cooldown, fighter.attacks[id].cooldown, `#${def.id} ${id}`);
    for (const id of Object.keys(fighter.techniqueDefs)) assert.equal(relabelled.techniqueDefs[id].cooldown, fighter.techniqueDefs[id].cooldown, `#${def.id} ${id}`);
  }
  const { fighter: f2 } = makeFighter({ character: getCharacter('0002') });
  assert.equal(f2.attacks.extra_attack.cooldown, 5, 'the Whirlwind: still 5 s');
});

// ---- The rules ---------------------------------------------------------------------------

test('a list may name only moves the fighter can really perform, each once', () => {
  const def = getCharacter('0001');
  const with_ = (specialAbilities) => ({ ...def, specialAbilities });
  for (const def of CHARACTERS) assert.deepEqual(specialAbilityProblems(def), [], def.id);
  assert.deepEqual(specialAbilityProblems({ ...def, specialAbilities: undefined }), [], 'leaving it out: none');
  assert.deepEqual(specialAbilityProblems(with_([])), []);
  assert.match(specialAbilityProblems(with_('attack4'))[0], /must be a list/);
  assert.match(specialAbilityProblems(with_(['attack9']))[0], /not a move codename/);
  assert.match(specialAbilityProblems(with_(['Unlimited Void']))[0], /not a move codename/, 'never a display name');
  assert.match(specialAbilityProblems(with_(['attack4', 'attack4']))[0], /twice/);
  assert.match(specialAbilityProblems(with_(['midair_attack4']))[0], /cannot perform/, 'a technique has no mid-air version');
  assert.match(specialAbilityProblems(with_(['transform']))[0], /not a move codename/, 'the retired Transform is no move');
  const reserved = { ...def, actions: { ...def.actions, extra_attack: null }, specialAbilities: ['extra_attack'] };
  assert.match(specialAbilityProblems(reserved)[0], /cannot perform/, 'a reserved button');
  const noAir = { ...def, attacks: { ...def.attacks, extra_attack: { ...def.attacks.extra_attack, groundOnly: true } } };
  assert.ok(performableMoves(noAir).has('extra_attack'));
  const ground = getCharacter('0002');
  assert.match(specialAbilityProblems({ ...ground, specialAbilities: ['attack4'] })[0], /cannot perform/, 'a button it lacks');
  assert.match(specialAbilityProblems({ ...ground, specialAbilities: ['midair_attack5'] })[0], /cannot perform/);
  const pending = { ...def, attacks: { ...def.attacks, attack1: { animation: 'attack1', pending: true } }, specialAbilities: ['attack1'] };
  assert.match(specialAbilityProblems(pending)[0], /cannot perform/, 'an art-only move strikes nothing');
  assert.throws(() => assertSpecialAbilities(with_(['attack9'])), /breaks the Special ability rules/);
  // An unvalidated list never classifies what it cannot perform.
  assert.equal(isSpecialAbility(with_(['midair_attack4', 'attack9']), 'midair_attack4'), false);
  assert.equal(isSpecialAbility({ ...ground, specialAbilities: ['attack4'] }, 'attack4'), false);
  // The registry refuses a broken list as it loads.
  assert.match(read('js/data/characters.js'), /assertSpecialAbilities\(def\);/);
});

test('a future fighter opts its own moves in with data alone: an aerial, a ground attack, a summon', () => {
  const sample = { ...SAMPLE_FIGHTER, specialAbilities: ['midair_attack2', 'extra_attack'] };
  assert.deepEqual(specialAbilityProblems(sample), []);
  const actions = actionMap(controllerActions(sample));
  assert.equal(actions.get('air:attack2').category, 'abilities', 'only the aerial version');
  assert.equal(actions.get('ground:attack2').category, 'ground', 'its ground version stays ordinary');
  assert.equal(actions.get('ground:extra_attack').category, 'abilities');
  assert.equal(actions.get('air:extra_attack')?.category ?? 'abilities', 'abilities', 'the same move in the air too');
  const summoner = SAMPLE_FIGHTER.summons && Object.keys(SAMPLE_FIGHTER.summons)[0];
  if (summoner) {
    const def = { ...SAMPLE_FIGHTER, specialAbilities: [summoner] };
    assert.deepEqual(specialAbilityProblems(def), []);
    assert.equal(actionMap(controllerActions(def)).get(`ground:${summoner}`).category, 'abilities');
  }
  // The shared modules never name a fighter, a move or a move's name.
  for (const file of ['js/data/special-abilities.js', 'js/data/controller-profiles.js', 'js/game/combat/move-status.js', 'js/game/rendering/fighter-status.js', 'js/game/arena.js']) {
    const code = read(file).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'000\d'|#000\d(?![\da-f])/i, `${file}: no fighter id`);
    assert.doesNotMatch(code, /===?\s*'(attack[1-5]|extra_attack|midair_attack[1-5])'/, `${file}: no move special-cased`);
    assert.doesNotMatch(code, /Unlimited Void|Hollow Purple|Mystical Palm|Whirlwind|Cherry Blossom|Maximum Blue/, `${file}: no move name`);
  }
});

// ---- Timing ------------------------------------------------------------------------------

// Seconds `f` spends on the technique `move` from its press to the step it
// is free again, and the phases it went through.
function performTechnique(id, move) {
  const { fighter: f, step } = makeFighter({ character: getCharacter(id) });
  step({});
  step(press(move));
  assert.ok(f.technique, `#${id} ${move} accepted`);
  const { castDuration, releaseDuration } = f.technique;
  let steps = 1;
  while (f.technique && steps < 600) {
    step({});
    steps++;
  }
  return { f, castDuration, releaseDuration, seconds: steps * DT };
}

test('Cherry Blossom Impact: every frame kept, at ordinary-attack pace (20 fps): a 0.2 s cast and a 0.25 s release, 0.45 s in all', () => {
  const def = getCharacter('0003');
  const cast = def.animations.attack3_cast;
  const release = def.animations.attack3_release;
  assert.equal(cast.frames.length, 4, 'all four cast frames');
  assert.equal(release.frames.length, 5, 'all five release frames');
  assert.deepEqual([cast.fps, release.fps], [20, 20]);
  for (const clip of [cast, release]) assert.ok(near(60 / clip.fps, Math.round(60 / clip.fps)), 'whole 60 Hz steps per frame');
  const { castDuration, releaseDuration, seconds } = performTechnique('0003', 'attack3');
  assert.ok(near(castDuration, 0.2) && near(releaseDuration, 0.25));
  assert.ok(Math.abs(seconds - 0.45) <= DT + 1e-9, `free as the last frame ends (${seconds.toFixed(3)} s)`);
  assert.ok(seconds < 0.73 - 0.2, 'noticeably quicker than its old 0.73 s');
});

test('the eruption lands on the release\'s first frame, the fist in the ground, and still throws up who stands there', () => {
  const d = duel({ gap: 120, attackerCharacter: getCharacter('0003'), targetCharacter: getCharacter('0003') });
  d.tick({});
  d.tick(press('attack3'));
  const t = d.attacker.technique;
  let castSteps = 1;
  while (t.phase === 'cast') {
    assert.equal(d.events.filter((e) => e.attacker === d.attacker).length, 0, 'nothing before the fist meets the ground');
    d.tick({});
    castSteps++;
  }
  assert.equal(castSteps, 13, 'a 0.2 s cast: 12 steps of it, then the burst on the 13th step from the press');
  assert.equal(d.attacker.animator.anim.key, 'attack3_release');
  assert.equal(d.attacker.animator.index, 0, 'the release\'s first frame: the fist in the ground');
  const hit = d.events.find((e) => e.attacker === d.attacker);
  assert.equal(hit?.type, 'hit');
  assert.equal(hit.damage, 5);
  assert.equal(hit.baseLaunch, 3);
  assert.ok(hit.finalLaunch.y < 0, 'thrown upward');
});

test('the Specials keep their long, deliberate animations; Red, Maximum Blue and the Whirlwind keep their speed', () => {
  const void_ = performTechnique('0001', 'attack4');
  assert.ok(near(void_.castDuration, 0.5) && near(void_.releaseDuration, 1 / 3), 'Unlimited Void: 0.5 s + 1/3 s');
  const purple = performTechnique('0001', 'attack5');
  assert.ok(near(purple.castDuration, 5 / 6) && near(purple.releaseDuration, 1 / 3), 'Hollow Purple: 5/6 s + 1/3 s');
  const palm = performTechnique('0003', 'attack4');
  assert.ok(near(palm.castDuration, 1) && near(palm.releaseDuration, 0.25), 'the Mystical Palm Technique: 1 s + 0.25 s');
  const cbi = performTechnique('0003', 'attack3');
  for (const special of [void_, purple, palm]) assert.ok(special.seconds > cbi.seconds + 0.3, 'clearly more committed than an ordinary attack');
  const fps = (id, clip) => getCharacter(id).animations[clip].fps;
  assert.deepEqual([fps('0001', 'attack2'), fps('0001', 'attack3'), fps('0002', 'extra_attack')], [20, 15, 20], 'unchanged rates');
});

// ---- The orange mark ---------------------------------------------------------------------

test('each Special shows the mark from the step it is accepted to the step it ends, through cast and release; its cooldown alone never does', () => {
  for (const [id, move] of [['0001', 'attack4'], ['0001', 'attack5'], ['0003', 'attack4']]) {
    const { fighter: f, step } = makeFighter({ character: getCharacter(id) });
    step({});
    assert.equal(activeSpecialAbility(f), null, 'idle: none');
    step(press(move));
    assert.equal(activeSpecialAbility(f), move, `#${id} ${move}: at once`);
    const phases = new Set();
    while (f.technique) {
      phases.add(f.technique.phase);
      assert.equal(activeSpecialAbility(f), move);
      step({});
    }
    assert.deepEqual([...phases], ['cast', 'release'], 'all through both phases');
    assert.equal(activeSpecialAbility(f), null, 'gone the step it ends');
    assert.ok(f.combat.abilityCooldowns.active(move), 'still cooling down…');
    for (let i = 0; i < 30; i++) {
      step({});
      assert.equal(activeSpecialAbility(f), null, '…with no mark');
    }
  }
});

test('a hit breaking a Special takes the mark with it at once; a projectile still flying never keeps it', () => {
  for (const [id, move] of [['0001', 'attack4'], ['0001', 'attack5'], ['0003', 'attack4']]) {
    const d = duel({ gap: 300, attackerCharacter: getCharacter(id) });
    d.tick({});
    d.tick(press(move));
    for (let i = 0; i < 10; i++) d.tick({});
    assert.equal(activeSpecialAbility(d.attacker), move);
    new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
    assert.equal(d.attacker.technique, null, 'broken');
    assert.equal(activeSpecialAbility(d.attacker), null, `#${id} ${move}: gone at once`);
  }
  // Hollow Purple: the sphere flies on after the release; the mark does not.
  const d = duel({ gap: 300 });
  d.tick({});
  d.tick(press('attack5'));
  while (d.attacker.technique) d.tick({});
  assert.ok(d.projectiles.some((p) => p.owner === d.attacker), 'the sphere still flying');
  assert.equal(activeSpecialAbility(d.attacker), null);
  // A reset (a rematch) ends it too.
  const { fighter: f, step } = makeFighter();
  step({});
  step(press('attack4'));
  assert.equal(activeSpecialAbility(f), 'attack4');
  f.reset(f.stage);
  assert.equal(f.technique, null);
  assert.equal(activeSpecialAbility(f), null);
});

test('never during an ordinary move, movement or defence: Red, Maximum Blue, the Whirlwind, Cherry Blossom Impact and the rest', () => {
  for (const def of playableCharacters()) {
    for (const action of ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']) {
      const type = actionType(def, action);
      if (!type) continue;
      const ground = type === 'attack' ? def.actions[action].ground ?? def.actions[action] : action;
      if (isSpecialAbility(def, ground)) continue;
      const { fighter: f, step } = makeFighter({ character: def });
      step({});
      step(press(action));
      assert.ok(activeMove(f), `#${def.id} ${action} started`);
      for (let i = 0; i < 120 && activeMove(f); i++) {
        assert.equal(activeSpecialAbility(f), null, `#${def.id} ${action}`);
        step({});
      }
    }
  }
  // Running, jumping, Dashing, shielding and the Deflect.
  const { fighter: f, step } = makeFighter();
  const seen = [];
  for (const held of [{ right: true }, { jump: true, jumpPressed: true }, {}, {}, { mouvmentRight: true, mouvmentRightPressed: true }, { shield: true }, { shield: true }]) {
    step(held);
    seen.push(activeSpecialAbility(f));
  }
  for (let i = 0; i < 20; i++) step({});
  step({ jump: true, jumpPressed: true });
  for (let i = 0; i < 4; i++) step({});
  step({ shield: true, shieldPressed: true });
  seen.push(activeSpecialAbility(f));
  assert.ok(seen.every((m) => m === null));
});

test('a CPU performing a Special shows the mark too, and both fighters may show theirs at once', () => {
  // A seeded CPU match, #0001 against #0003: wherever a CPU performs a move,
  // the Arena places the mark exactly while that move is one of its
  // fighter's Specials.
  const p1Def = getCharacter('0001');
  const p2Def = getCharacter('0003');
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'watch', seed: 7, difficulty: 'hard',
    p1Def, p2Def, p1Sprites: fakeSpritesOf(p1Def), p2Sprites: fakeSpritesOf(p2Def), input: { flush() {}, sample: () => ({}) },
  });
  battle.p1.controller = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(3) });
  battle.p2.controller = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(4) });
  battle.setPhase('fight');
  const specialSteps = { p1: 0, p2: 0 };
  let ordinarySteps = 0;
  for (let i = 0; i < 60 * 90 && battle.phase === 'fight'; i++) {
    battle.update(DT);
    for (const [key, f] of [['p1', battle.p1], ['p2', battle.p2]]) {
      if (f.lostToVoid) continue;
      const move = activeMove(f);
      const special = !!move && isSpecialAbility(f.def, move);
      assert.equal(!!battle.specialMarkRect(f), special, `${key} performing ${move}`);
      if (special) specialSteps[key]++;
      else if (move) ordinarySteps++;
    }
  }
  assert.ok(specialSteps.p1 + specialSteps.p2 > 0, 'a CPU used a Special');
  assert.ok(ordinarySteps > 0, 'and plenty of ordinary moves, unmarked');
});
