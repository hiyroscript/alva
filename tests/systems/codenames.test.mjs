// Run with node --test tests/systems/codenames.test.mjs (no dependencies).
// The canonical control, move, animation and file codenames, in one place.
// They are universal, the same for every character (a character's own
// ability names are per character): every gameplay control (runLeft,
// runRight, mouvementLeft, mouvementRight, down, jump, shield,
// extra_attack, transform, attack1 to attack5, pause), every move (attack1
// to attack5, midair_attack1 to midair_attack5, extra_attack, transform) and
// every file (<id>_<codename>_<frame>.png) goes by exactly one name, from
// the bindings and input snapshots through every character's data, its
// summons and techniques, their cooldowns, the combat AI and the art on
// disk. The retired names, and the retired mechanic's every word, survive
// nowhere, not even as an alias. The loadout
// rules themselves are in loadout.test.mjs; behaviour in the other files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { def, fakeSprites, makeFighter, startupSteps, STAGE } from '../helpers/fighter-harness.mjs';
import { ACTIONS, ACTION_LABELS, COMBAT_BUTTONS, CONFIG, MOVES, NUMBERED_ATTACKS } from '../../js/config.js';
import { CHARACTERS, characterFramePaths, framePath, frames } from '../../js/data/characters.js';
import { actionType, loadoutProblems, specialAction } from '../../js/data/loadout.js';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { COMBAT_ACTIONS, Fighter } from '../../js/game/fighters/fighter.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { cooldownIndicators } from '../../js/game/rendering/fighter-status.js';
import { ABILITY_ACTIONS } from '../../js/ui/mobile-abilities.js';
import { stylesheetFiles } from '../helpers/stylesheet.mjs';
import { COOLING_CASTER } from '../fighters/fixtures/cooling-fighters.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

const HELD = ['runLeft', 'runRight', 'down', 'jump', 'extra_attack', 'transform', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'];

// The normalized fighter input snapshot, field for field.
const SNAPSHOT = [
  ...HELD,
  ...HELD.map((control) => `${control}Pressed`),
  'mouvementLeftPressed', 'mouvementRightPressed', 'dropPressed',
];

// Every name the codename migrations retired, none of which may come back:
// the attack codenames before attack1 to attack5 / extra_attack, the control
// names before those, and the old art stems and animation keys. (The
// retired mechanic's vocabulary is guarded as a whole, below.)
const RETIRED_ATTACKS = ['ba1', 'ba2', 'maba1', 'maba2', 'cba1', 'cba2', 'uniqueba'];
const RETIRED_CONTROLS = [
  'left', 'right', 'primary', 'special', 'defense', 'action1', 'action2', 'dashLeft', 'dashRight',
];
const RETIRED_MOVES = ['midairBa1', 'midairBa2', 'throw', 'ba1Clone', 'rasenRush', 'shuriken'];
const RETIRED_ANIMATIONS = [
  'dash', 'midairHurt', 'shield', 'shieldStart', 'shieldRelease',
  'midairShield', 'midair_shielding', 'cloneCloud', 'rasenForm', 'rasenDash', 'rasenConfirm', 'rasenExplosion', 'rasenRelease',
  'rasenWhiffRelease', 'rasenSphereBuild', 'rasenSphereImpact', 'rasenSphereExplosion',
];
const RETIRED_STEMS = ['1ba', '2ba', 'midair1ba', 'midair2ba', 'throw', 'shuriken', 'cloneav', 'rasen', 'prasen', 'releaseblock', 'midairhurt', 'dash'];
// The names this migration retired (the attack codenames and everything
// built on them): gone from the code, the tests and the documentation.
const RETIRED_NOW = new RegExp([
  `\\b(${RETIRED_ATTACKS.join('|')})(Pressed)?\\b`,
  '\\b(cbaIndicators|drawCbaIndicators|CBA_STYLE|CBA[12]?)\\b',
  '\\b(Basic Attack|Unique Basic|BA[12])\\b',
  '\\b(midairHurt|midairShield|shieldStart|cloneCloud|rasen[A-Z]\\w*)\\b',
  // The air Shield's clip, gone with the air Shield (the air's is the Deflect).
  '\\bmidair_shielding\\b',
  `0001_(${RETIRED_STEMS.join('|')})`,
].join('|'));
// ...and, in the game code, every older retired name too (the tests keep
// their own checks that those stay gone).
const RETIRED_CODE = new RegExp([
  `\\b(${RETIRED_ATTACKS.join('|')})(Pressed)?\\b`,
  '\\b(cbaIndicators|drawCbaIndicators|CBA_STYLE|CBA[12]?)\\b',
  '\\b(action1|action2|midairBa1|midairBa2|ba1Clone|rasenRush)\\b',
  '\\b(dashLeftPressed|dashRightPressed|leftPressed|rightPressed|queueTouchDash|touchDash)\\b',
  '\\b(primaryPressed|specialPressed|defensePressed|cabIndicators|drawCabIndicators|CAB_STYLE)\\b',
  '\\bCAB[12]?\\b',
  '\\b(Basic Attack|Unique Basic|BA[12])\\b',
  '\\b(midairHurt|midairShield|shieldStart|cloneCloud|rasen[A-Z]\\w*)\\b',
  '\\bmidair_shielding\\b',
  `0001_(${RETIRED_STEMS.join('|')})`,
].join('|'));

test('the gameplay controls are the canonical codenames; existing keys unchanged, attack3 to attack5 on free keys', () => {
  assert.deepEqual([...ACTIONS], [
    'runLeft', 'runRight', 'down', 'jump', 'extra_attack', 'transform', 'shield',
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'pause',
  ]);
  assert.deepEqual([...NUMBERED_ATTACKS], ['attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  assert.deepEqual(Object.keys(CONFIG.bindings).sort(), [...ACTIONS, 'mouvementLeft', 'mouvementRight'].sort());
  assert.deepEqual(Object.keys(ACTION_LABELS), [...ACTIONS]);
  assert.deepEqual(CONFIG.bindings.runLeft, ['KeyA', 'ArrowLeft']);
  assert.deepEqual(CONFIG.bindings.runRight, ['KeyD', 'ArrowRight']);
  assert.deepEqual(CONFIG.bindings.down, ['KeyS', 'ArrowDown']);
  assert.deepEqual(CONFIG.bindings.jump, ['KeyW', 'Space', 'ArrowUp']);
  // The migrated controls keep their keys.
  assert.deepEqual(CONFIG.bindings.extra_attack, ['KeyJ']);
  assert.deepEqual(CONFIG.bindings.transform, ['KeyK']);
  assert.deepEqual(CONFIG.bindings.shield, ['KeyL']);
  assert.deepEqual(CONFIG.bindings.attack1, ['KeyU']);
  assert.deepEqual(CONFIG.bindings.attack2, ['KeyI']);
  // The new ones: O after U and I, then M and , on the row below.
  assert.deepEqual(CONFIG.bindings.attack3, ['KeyO']);
  assert.deepEqual(CONFIG.bindings.attack4, ['KeyM']);
  assert.deepEqual(CONFIG.bindings.attack5, ['Comma']);
  assert.deepEqual(CONFIG.bindings.pause, ['Escape', 'KeyP']);
  // No key does two gameplay jobs.
  const keys = Object.values(CONFIG.bindings).flat();
  assert.equal(new Set(keys).size, keys.length, 'every gameplay key is bound once');
  assert.deepEqual(
    ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => ACTION_LABELS[a]),
    ['Attack 1', 'Attack 2', 'Attack 3', 'Attack 4', 'Attack 5', 'Extra Attack'],
  );
  assert.equal(ACTION_LABELS.transform, 'Transform');
  assert.equal(ACTION_LABELS.shield, 'Shield');
  // Menus keep their own directions: menu Left / Right are not runLeft / runRight.
  assert.deepEqual(Object.keys(CONFIG.menuBindings), ['up', 'down', 'left', 'right', 'confirm', 'back']);
  for (const name of [...RETIRED_CONTROLS, ...RETIRED_ATTACKS]) {
    assert.equal(CONFIG.bindings[name], undefined, `no ${name} binding`);
    assert.ok(!ACTIONS.includes(name), `no ${name} action`);
  }
});

test('the combat buttons are extra_attack, transform and attack1 to attack5; shield, jump and down stay held-state controls', () => {
  assert.deepEqual([...COMBAT_BUTTONS], ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  assert.equal(COMBAT_ACTIONS, COMBAT_BUTTONS, 'the Fighter reads the same list');
  for (const held of ['shield', 'jump', 'down']) assert.ok(!COMBAT_ACTIONS.includes(held), held);
  assert.deepEqual([...ABILITY_ACTIONS], [...COMBAT_BUTTONS], 'the touch buttons a fighter presents');
});

test('the move codenames are universal and neutral: numbered attacks, their mid-air versions, the extra attack and transform', () => {
  assert.deepEqual(Object.keys(MOVES), [
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3',
    'attack4', 'midair_attack4', 'attack5', 'midair_attack5', 'extra_attack', 'transform',
  ]);
  for (const [i, id] of NUMBERED_ATTACKS.entries()) {
    assert.deepEqual({ ...MOVES[id] }, { number: i + 1, air: false, label: `Attack ${i + 1}` });
    assert.deepEqual({ ...MOVES[`midair_${id}`] }, { number: i + 1, air: true, label: `Mid-air Attack ${i + 1}` });
  }
  assert.deepEqual({ ...MOVES.extra_attack }, { number: null, air: false, label: 'Extra Attack' });
  assert.deepEqual({ ...MOVES.transform }, { number: null, air: false, label: 'Transform' });
  // Nothing global says what attack3 or attack4 is for: whether it is an
  // ordinary attack, a summon or a technique is each character's loadout.
  for (const m of Object.values(MOVES)) {
    assert.deepEqual(Object.keys(m).sort(), ['air', 'label', 'number'], 'no button, variant or role');
  }
  // Neutral names, never one character's: its own ability names go on top.
  for (const label of [...Object.values(ACTION_LABELS), ...Object.values(MOVES).map((m) => m.label)]) {
    assert.doesNotMatch(label, /Throw|Shuriken|Punch|Kick|Clone|Sphere|#0001|Basic|BA\d/, `${label}: neutral`);
  }
  for (const name of [...RETIRED_ATTACKS, ...RETIRED_MOVES]) assert.equal(MOVES[name], undefined, `no ${name} move`);
});

test('every character (and the tests\' sample fighter) keys its moves by the universal codenames and keeps the loadout rules', () => {
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    const who = `#${c.id}`;
    assert.deepEqual(loadoutProblems(c), [], `${who} keeps the loadout rules`);
    for (const id of Object.keys(c.attacks ?? {})) assert.ok(Object.hasOwn(MOVES, id), `${who}: attack ${id} is a move codename`);
    for (const [type, table] of [['summon', c.summons], ['technique', c.techniques]]) {
      for (const id of Object.keys(table ?? {})) {
        assert.ok(NUMBERED_ATTACKS.includes(id), `${who}: ${id} is a numbered attack`);
        assert.equal(actionType(c, id), type, `${who}: ${id} is its own ${type} button`);
      }
    }
    for (const button of Object.keys(c.mobileAbilities ?? {})) {
      assert.ok(ACTIONS.includes(button), `${who}: mobileAbilities.${button} names a control`);
    }
    for (const move of Object.keys(c.abilityNames ?? {})) {
      assert.ok(Object.hasOwn(MOVES, move), `${who}: abilityNames.${move} names a universal move`);
    }
  }
});

test('every controller builds the same canonical input snapshot, every combat button up to attack5 included', async () => {
  assert.deepEqual(Object.keys(blankInput()), SNAPSHOT);
  for (const [key, value] of Object.entries(blankInput())) assert.equal(value, false, key);
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, hidden: false };
  const { InputManager } = await import('../../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  // Player 1's snapshot: everything but the training CPU's drop intent.
  assert.deepEqual(Object.keys(input.sample()).sort(), SNAPSHOT.filter((k) => k !== 'dropPressed').sort());
  assert.equal(typeof input.queueTouchMouvement, 'function');
  assert.equal(input.touchMouvement, 0);
  for (const gone of ['queueTouchDash', 'touchDash']) assert.equal(input[gone], undefined, gone);
  for (const name of RETIRED_ATTACKS) {
    assert.equal(name in input.sample(), false, name);
    assert.equal(`${name}Pressed` in blankInput(), false, `${name}Pressed`);
  }
});

test('#0001\'s actions resolve to the canonical move ids: attacks on the ground and in the air, attack4 and attack5 its techniques', () => {
  assert.deepEqual(def.actions, {
    extra_attack: 'extra_attack',
    transform: null,
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(COMBAT_ACTIONS.map((a) => specialAction(def, a)?.id ?? null), [null, null, null, null, null, 'attack4', 'attack5']);
  const { fighter, step } = makeFighter();
  assert.deepEqual(COMBAT_ACTIONS.map((a) => fighter.attackFor(a)), ['extra_attack', null, 'attack1', 'attack2', 'attack3', null, null]);
  step({ jump: true, jumpPressed: true });
  assert.deepEqual(COMBAT_ACTIONS.map((a) => fighter.attackFor(a)), ['extra_attack', null, 'midair_attack1', 'midair_attack2', 'midair_attack3', null, null]);
});

test('#0001\'s moves, clips and objects go by the codenames: attack1 to attack3 with their mid-air versions, extra_attack, attack4 and attack5', () => {
  assert.deepEqual(Object.keys(def.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3',
  ]);
  for (const [id, atk] of Object.entries(def.attacks)) assert.equal(atk.animation, id, `${id} plays its own clip`);
  assert.deepEqual(Object.keys(def.animations), [
    'idle', 'run', 'jump', 'fall', 'land', 'mouvment', 'midair_mouvment', 'hurt', 'midair_hurt', 'shielding', 'deflect',
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3',
    'attack4_cast', 'attack4_release', 'attack5_cast', 'attack5_release', 'extra_attack',
  ]);
  // Each orb is the projectile of the attack that releases it.
  assert.deepEqual(Object.keys(def.projectileAnimations), ['attack2_object', 'attack3_object', 'attack5_object']);
  assert.deepEqual(Object.keys(def.projectiles), ['attack2_object', 'attack3_object', 'attack5_object']);
  assert.equal(def.attacks.attack2.projectile.id, 'attack2_object');
  assert.equal(def.attacks.attack3.projectile.id, 'attack3_object');
  assert.equal(def.techniques.attack5.projectile.id, 'attack5_object');
  assert.equal(def.effectAnimations, undefined, 'no effect art: everything it creates is a projectile');
  assert.equal(def.summons, undefined, 'no summon');
  for (const name of [...RETIRED_ATTACKS, ...RETIRED_MOVES, ...RETIRED_ANIMATIONS]) {
    for (const table of ['attacks', 'animations', 'projectileAnimations', 'projectiles', 'techniques', 'abilityNames']) {
      assert.equal(def[table][name], undefined, `no ${table}.${name}`);
    }
  }
  for (const name of [...RETIRED_CONTROLS, ...RETIRED_ATTACKS]) {
    assert.equal(def.actions[name], undefined, `no ${name} action`);
    assert.equal(def.mobileAbilities[name], undefined, `no ${name} mobile ability`);
  }
});

test('attack4 is Unlimited Void\'s technique and attack5 Hollow Purple\'s, each keyed by its own button and its clips named after it', () => {
  assert.deepEqual(Object.keys(def.techniques), ['attack4', 'attack5']);
  for (const id of ['attack4', 'attack5']) {
    assert.equal(def.techniques[id].castAnimation, `${id}_cast`);
    assert.equal(def.techniques[id].releaseAnimation, `${id}_release`);
  }
  assert.ok(def.techniques.attack4.burst, 'Unlimited Void releases a burst');
  assert.equal(def.techniques.attack4.projectile, undefined);
  assert.equal(def.techniques.attack5.burst, undefined);
  assert.deepEqual(def.abilityNames, {
    extra_attack: 'High Kick', attack1: 'Jab', midair_attack1: 'Floating Straight', attack2: 'Red', midair_attack2: 'Red Kick',
    attack3: 'Maximum Blue', midair_attack3: 'Blue', attack4: 'Unlimited Void', attack5: 'Hollow Purple',
  });
});

test('pressing attack4 and attack5 starts their cooldowns, keyed by those moves with shared artwork', () => {
  // The real roster technique starts its timer on the same press.
  const free = makeFighter();
  free.step({ attack4: true, attack4Pressed: true });
  assert.equal(free.fighter.technique?.def.id, 'attack4');
  assert.equal(free.fighter.combat.abilityCooldowns.size, 1);
  assert.deepEqual(cooldownIndicators(free.fighter).map(c => c.id), ['attack4']);
  // A fighter whose techniques have one: keyed by the move, shown by it.
  const caster = makeFighter({ character: COOLING_CASTER });
  const foe = makeFighter({ x: 1400, facing: -1 });
  caster.fighter.opponent = foe.fighter;
  caster.step({ attack4: true, attack4Pressed: true });
  assert.equal(caster.fighter.technique?.def.id, 'attack4');
  assert.equal(caster.fighter.technique.action, 'attack4');
  while (caster.fighter.technique) caster.step({});
  caster.step({ attack5: true, attack5Pressed: true });
  assert.equal(caster.fighter.technique?.def.id, 'attack5');
  assert.deepEqual([...caster.fighter.combat.abilityCooldowns.entries.keys()], ['attack4', 'attack5']);
  assert.deepEqual(cooldownIndicators(caster.fighter).map((c) => c.id), ['attack4', 'attack5']);
});

test('the combat AI discovers the moveset by its canonical names, and reaches attack4 and attack5 through their own buttons', () => {
  const moves = readMoveset(new Fighter({ def, sprites: fakeSprites(), stage: STAGE, spawn: { x: 500 } }));
  assert.deepEqual(moves.melee.map((m) => [m.action, m.id, m.air]).sort(), [
    ['attack1', 'attack1', false], ['attack1', 'midair_attack1', true],
    ['attack2', 'midair_attack2', true], ['attack3', 'midair_attack3', true],
    ['extra_attack', 'extra_attack', false], ['extra_attack', 'extra_attack', true],
  ]);
  assert.deepEqual(moves.ranged.map((m) => [m.action, m.id, m.air]), [['attack2', 'attack2', false], ['attack3', 'attack3', false]]);
  assert.deepEqual(moves.specials.map((c) => [c.action, c.id, c.type]), [['attack4', 'attack4', 'technique'], ['attack5', 'attack5', 'technique']]);
  assert.ok([...moves.melee, ...moves.ranged, ...moves.specials].every((m) => m.action !== 'transform'), 'transform is reserved');
  assert.ok([...moves.melee, ...moves.ranged].every((m) => !['attack4', 'attack5'].includes(m.action)), 'attack4 and attack5 are no melee or ranged attacks');
  // The Shield button's own move in the air goes by its universal codename.
  assert.deepEqual([moves.deflect.action, moves.deflect.id, moves.deflect.air], ['shield', 'deflect', true]);
});

// ---- Files ------------------------------------------------------------------

test('every fighter frame is <id>_<codename>_<frame>.png in its own folder, and the frame helpers build exactly that', () => {
  assert.equal(framePath('0027', 'attack2', 3), './assets/characters/0027/0027_attack2_3.png');
  assert.equal(framePath('0027', 'idle', 1), './assets/characters/0027/0027_idle_1.png');
  assert.deepEqual(frames('0027', 'midair_attack2', 2), [
    './assets/characters/0027/0027_midair_attack2_1.png', './assets/characters/0027/0027_midair_attack2_2.png',
  ]);
  assert.deepEqual(frames('0027', 'attack4_object', 2, 10), [
    './assets/characters/0027/0027_attack4_object_10.png', './assets/characters/0027/0027_attack4_object_11.png',
  ]);
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    const id = c.id === 'sample' ? '0001' : c.id;
    const pattern = new RegExp(`^\\./assets/characters/${id}/${id}_([a-z0-9_]+)_(\\d+)\\.png$`);
    for (const [table, clips] of [['animations', c.animations], ['projectileAnimations', c.projectileAnimations], ['effectAnimations', c.effectAnimations]]) {
      for (const [key, clip] of Object.entries(clips ?? {})) {
        for (const url of clip.frames) {
          const m = pattern.exec(url);
          assert.ok(m, `${table}.${key}: ${url} follows <id>_<codename>_<frame>.png`);
          // The frame's codename is its clip's own, or the one its clip is a
          // part of (attack4_form plays attack4_*); every frame is numbered.
          const codename = m[1];
          if (c === SAMPLE_FIGHTER) continue;
          assert.ok(key === codename || key.startsWith(`${codename}_`), `${table}.${key} plays ${codename} frames`);
        }
      }
    }
    for (const url of characterFramePaths(c)) assert.ok(existsSync(new URL(url.slice(2), ROOT)), `${url} exists`);
  }
});

test('#0001\'s folder holds only codename files, none under a retired stem, every one loaded', () => {
  const files = readdirSync(new URL('assets/characters/0001/', ROOT));
  assert.equal(files.length, 78);
  for (const name of files) {
    assert.match(name, /^0001_[a-z][a-z0-9_]*_\d+\.png$/, name);
    assert.doesNotMatch(name, new RegExp(`^0001_(${RETIRED_STEMS.join('|')})\\d*\\.png$`), name);
  }
  // Every file is in a clip: nothing on disk that the game never loads.
  const used = new Set(characterFramePaths(def).map((url) => url.split('/').pop()));
  assert.deepEqual(files.filter((n) => !used.has(n)), []);
  assert.equal(used.size, files.length);
});

// ---- Retired names ------------------------------------------------------------

test('no retired attack, control, animation or file name is left in the game code, the stylesheet or the page', () => {
  const files = readdirSync(new URL('js/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
  for (const file of [...files, ...stylesheetFiles(), 'index.html']) {
    const lines = read(file).split('\n');
    const hit = lines.findIndex((line) => RETIRED_CODE.test(line));
    assert.equal(hit, -1, `${file}:${hit + 1} still uses a retired name: ${lines[hit]}`);
  }
  // The generic control names, wherever they are used as one. A character's
  // `defense` entry (what shield does) is another thing, and so are
  // geometry's and the menus' left / right.
  const generic = /'(primary|special)'|\b(input|out|held|frame|bindings|actions)\.(primary|special|defense)\b/;
  for (const file of files) assert.doesNotMatch(read(file), generic, file);
});

test('no retired name is left in the tests or the current documentation either', () => {
  const tests = readdirSync(new URL('tests/', ROOT), { recursive: true })
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('codenames.test.mjs')).map((f) => `tests/${f}`);
  const docs = readdirSync(new URL('docs/', ROOT), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`);
  assert.ok(tests.length > 40 && docs.length > 0);
  for (const file of [...tests, 'README.md', 'ALVA_SPEC.md', 'CLAUDE.md', ...docs]) {
    const lines = read(file).split('\n');
    const hit = lines.findIndex((line) => RETIRED_NOW.test(line));
    assert.equal(hit, -1, `${file}:${hit + 1} still uses a retired name: ${lines[hit]}`);
  }
  // Test files are named by the new codenames too, wherever they sit.
  for (const gone of ['basic-attack', 'basic-attack-2', 'throw']) {
    assert.ok(!tests.some((f) => f.endsWith(`/${gone}.test.mjs`)), `${gone}.test.mjs`);
  }
});

// The retired stance mechanic, as a whole: none of its words is left in any
// file name, path, line of code, style, test or document of the repository.
// Its stem is written with a character class so this file never matches
// itself; French words that only share its letters (Chargement, chargés,
// en recharge: loading, and Energy refilling) are not it.
const RETIRED_MECHANIC = /(?<!re)c[h]arg(?!ement|és)/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

// Every file and folder of the repository but its git store, as paths.
function repositoryPaths(dir = '') {
  return readdirSync(new URL(dir || './', ROOT), { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the retired stance mechanic is gone for good: no file name, identifier, style, translation, test or document of it', () => {
  const paths = repositoryPaths();
  assert.ok(paths.includes('js/game/combat/technique.js') && paths.includes('README.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, RETIRED_MECHANIC, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = read(path).split('\n');
    const hit = lines.findIndex((line) => RETIRED_MECHANIC.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}: ${lines[hit]}`);
  }
  // Nor in any definition's data, the art each one loads, or a translation key.
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    assert.doesNotMatch(JSON.stringify(c), RETIRED_MECHANIC, `#${c.id}`);
    for (const url of characterFramePaths(c)) assert.doesNotMatch(url, RETIRED_MECHANIC, url);
  }
});

test('the guard still catches the retired mechanic coming back, under any of its old names', () => {
  // Its stem, put together here so this file never spells it.
  const stem = ['c', 'h', 'a', 'r', 'g', 'e'].join('');
  const Stem = stem[0].toUpperCase() + stem.slice(1);
  for (const attempt of [
    stem, Stem, `${stem}Pressed`, `${stem}d`, `${stem}_loop`, `${Stem}Stance`,
    `0001_${stem}_1.png`, `0001_${stem}_a.png`, `assets/characters/0001/0001_${stem}_b.png`,
    `tests/${stem}.test.mjs`, `.tc-${stem}`, `control.${stem}`, `${stem.toUpperCase()}_FPS`,
    JSON.stringify({ ...def, animations: { ...def.animations, [stem]: def.animations.attack4_cast } }),
    JSON.stringify({ ...def, actions: { ...def.actions, [stem]: 'attack1' } }),
  ]) {
    assert.match(attempt, RETIRED_MECHANIC, `caught: ${attempt.slice(0, 40)}`);
  }
  // Words that only share its letters are not it.
  for (const fine of ['re' + stem, 'Re' + stem, `${Stem.slice(0, 5)}ement`, `${stem.slice(0, 5)}és`]) assert.doesNotMatch(fine, RETIRED_MECHANIC, fine);
});
