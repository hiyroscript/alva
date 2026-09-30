// Run with node --test tests/codenames.test.mjs (no dependencies).
// The canonical control, move, animation and file codenames, in one place.
// They are universal, the same for every character (a character's own
// ability names are per character): every gameplay control (runLeft,
// runRight, mouvementLeft, mouvementRight, jump, charge, shield,
// extra_attack, transform, attack1 to attack5, pause), every move (attack1
// to attack5, midair_attack1 to midair_attack5, extra_attack, transform) and
// every file (<id>_<codename>_<frame>.png) goes by exactly one name, from
// the bindings and input snapshots through every character's data, its
// Charge replacements, their cooldowns, the combat AI and the art on disk.
// The retired names survive nowhere, not even as an alias. The loadout
// rules themselves are in loadout.test.mjs; behaviour in the other files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { def, fakeSprites, makeFighter, STAGE } from './fighter-harness.mjs';
import { ACTIONS, ACTION_LABELS, COMBAT_BUTTONS, CONFIG, MOVES, NUMBERED_ATTACKS } from '../js/config.js';
import { CHARACTERS, characterFramePaths, framePath, frames } from '../js/data/characters.js';
import { loadoutProblems } from '../js/data/loadout.js';
import { SAMPLE_FIGHTER } from './sample-fighter.mjs';
import { COMBAT_ACTIONS, Fighter } from '../js/game/character.js';
import { blankInput } from '../js/game/fighter-controller.js';
import { readMoveset } from '../js/game/combat-ai.js';
import { cooldownIndicators, cooldownLabel } from '../js/game/fighter-status.js';
import { ABILITY_ACTIONS } from '../js/ui/mobile-abilities.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

const HELD = ['runLeft', 'runRight', 'charge', 'jump', 'extra_attack', 'transform', 'shield', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'];

// The normalized fighter input snapshot, field for field.
const SNAPSHOT = [
  ...HELD,
  ...HELD.map((control) => `${control}Pressed`),
  'mouvementLeftPressed', 'mouvementRightPressed', 'dropPressed',
];

// Every name the codename migrations retired, none of which may come back:
// the attack codenames before attack1 to attack5 / extra_attack, the control
// names before those, the charged-action vocabulary, and the old art stems
// and animation keys.
const RETIRED_ATTACKS = ['ba1', 'ba2', 'maba1', 'maba2', 'cba1', 'cba2', 'uniqueba'];
const RETIRED_CONTROLS = [
  'left', 'right', 'primary', 'special', 'defense', 'action1', 'action2', 'dashLeft', 'dashRight',
];
const RETIRED_MOVES = ['midairBa1', 'midairBa2', 'throw', 'ba1Clone', 'rasenRush', 'shuriken'];
const RETIRED_ANIMATIONS = [
  'dash', 'midairHurt', 'chargeStart', 'chargeLoop', 'chargeRelease', 'shield', 'shieldStart', 'shieldRelease',
  'midairShield', 'cloneCloud', 'rasenForm', 'rasenDash', 'rasenConfirm', 'rasenExplosion', 'rasenRelease',
  'rasenWhiffRelease', 'rasenSphereBuild', 'rasenSphereImpact', 'rasenSphereExplosion',
];
const RETIRED_STEMS = ['1ba', '2ba', 'midair1ba', 'midair2ba', 'throw', 'shuriken', 'cloneav', 'rasen', 'prasen', 'releaseblock', 'midairhurt', 'dash'];
// The names this migration retired (the attack codenames and everything
// built on them): gone from the code, the tests and the documentation.
const RETIRED_NOW = new RegExp([
  `\\b(${RETIRED_ATTACKS.join('|')})(Pressed)?\\b`,
  '\\b(chargedActions|tryChargedAction|CHARGED_LABELS|cbaIndicators|drawCbaIndicators|CBA_STYLE|CBA[12]?)\\b',
  '\\b(Basic Attack|Unique Basic|Charged BA|BA[12])\\b',
  '\\b(midairHurt|chargeStart|chargeLoop|midairShield|shieldStart|cloneCloud|rasen[A-Z]\\w*)\\b',
  `0001_(${RETIRED_STEMS.join('|')})`,
].join('|'));
// ...and, in the game code, every older retired name too (the tests keep
// their own checks that those stay gone).
const RETIRED_CODE = new RegExp([
  `\\b(${RETIRED_ATTACKS.join('|')})(Pressed)?\\b`,
  '\\b(chargedActions|tryChargedAction|CHARGED_LABELS|cbaIndicators|drawCbaIndicators|CBA_STYLE|CBA[12]?)\\b',
  '\\b(action1|action2|midairBa1|midairBa2|ba1Clone|rasenRush)\\b',
  '\\b(dashLeftPressed|dashRightPressed|leftPressed|rightPressed|queueTouchDash|touchDash)\\b',
  '\\b(primaryPressed|specialPressed|defensePressed|cabIndicators|drawCabIndicators|CAB_STYLE)\\b',
  '\\bCAB[12]?\\b',
  '\\b(Basic Attack|Unique Basic|Charged BA|BA[12])\\b',
  '\\b(midairHurt|chargeStart|chargeLoop|midairShield|shieldStart|cloneCloud|rasen[A-Z]\\w*)\\b',
  `0001_(${RETIRED_STEMS.join('|')})`,
].join('|'));

test('the gameplay controls are the canonical codenames; existing keys unchanged, attack3 to attack5 on free keys', () => {
  assert.deepEqual([...ACTIONS], [
    'runLeft', 'runRight', 'charge', 'jump', 'extra_attack', 'transform', 'shield',
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'pause',
  ]);
  assert.deepEqual([...NUMBERED_ATTACKS], ['attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  assert.deepEqual(Object.keys(CONFIG.bindings), [...ACTIONS]);
  assert.deepEqual(Object.keys(ACTION_LABELS), [...ACTIONS]);
  assert.deepEqual(CONFIG.bindings.runLeft, ['KeyA', 'ArrowLeft']);
  assert.deepEqual(CONFIG.bindings.runRight, ['KeyD', 'ArrowRight']);
  assert.deepEqual(CONFIG.bindings.charge, ['KeyS', 'ArrowDown']);
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

test('the combat buttons are extra_attack, transform and attack1 to attack5; shield, jump and charge stay held-state controls', () => {
  assert.deepEqual([...COMBAT_BUTTONS], ['extra_attack', 'transform', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']);
  assert.equal(COMBAT_ACTIONS, COMBAT_BUTTONS, 'the Fighter reads the same list');
  for (const held of ['shield', 'jump', 'charge']) assert.ok(!COMBAT_ACTIONS.includes(held), held);
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
  // Nothing global says what attack3 or attack4 is for: whether it is a
  // button or reached through Charge is each character's loadout.
  for (const m of Object.values(MOVES)) {
    assert.deepEqual(Object.keys(m).sort(), ['air', 'label', 'number'], 'no button, variant or role');
  }
  // Neutral names, never one character's: its own ability names go on top.
  for (const label of [...Object.values(ACTION_LABELS), ...Object.values(MOVES).map((m) => m.label)]) {
    assert.doesNotMatch(label, /Throw|Shuriken|Punch|Kick|Clone|Sphere|#0001|Basic|BA\d|Charged/, `${label}: neutral`);
  }
  for (const name of [...RETIRED_ATTACKS, ...RETIRED_MOVES]) assert.equal(MOVES[name], undefined, `no ${name} move`);
});

test('every character (and the tests\' sample fighter) keys its moves by the universal codenames and keeps the loadout rules', () => {
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    const who = `#${c.id}`;
    assert.deepEqual(loadoutProblems(c), [], `${who} keeps the loadout rules`);
    for (const id of Object.keys(c.attacks ?? {})) assert.ok(Object.hasOwn(MOVES, id), `${who}: attack ${id} is a move codename`);
    for (const id of [...Object.keys(c.summons ?? {}), ...Object.keys(c.chargedTechniques ?? {})]) {
      assert.ok(NUMBERED_ATTACKS.includes(id), `${who}: ${id} is a numbered attack`);
    }
    for (const button of Object.keys(c.mobileAbilities ?? {})) {
      assert.ok(ACTIONS.includes(button), `${who}: mobileAbilities.${button} names a control`);
    }
    for (const move of Object.keys(c.abilityNames ?? {})) {
      assert.ok(Object.hasOwn(MOVES, move), `${who}: abilityNames.${move} names a universal move`);
    }
    assert.equal('chargedActions' in c, false, `${who}: its Charge replacements go by chargeReplacements`);
  }
});

test('every controller builds the same canonical input snapshot, every combat button up to attack5 included', async () => {
  assert.deepEqual(Object.keys(blankInput()), SNAPSHOT);
  for (const [key, value] of Object.entries(blankInput())) assert.equal(value, false, key);
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, hidden: false };
  const { InputManager } = await import('../js/core/input-manager.js');
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

test('#0001\'s actions resolve to the canonical move ids, on the ground and in the air; it has no attack3 to attack5 button', () => {
  assert.deepEqual(def.actions, {
    extra_attack: 'extra_attack',
    transform: null,
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
  });
  const { fighter, step } = makeFighter();
  assert.deepEqual(COMBAT_ACTIONS.map((a) => fighter.attackFor(a)), ['extra_attack', null, 'attack1', 'attack2', null, null, null]);
  step({ jump: true, jumpPressed: true });
  assert.deepEqual(COMBAT_ACTIONS.map((a) => fighter.attackFor(a)), ['extra_attack', null, 'midair_attack1', 'midair_attack2', null, null, null]);
});

test('#0001\'s moves, clips and objects go by the codenames: attack1, midair_attack1, attack2, midair_attack2, extra_attack, attack3 and attack4', () => {
  assert.deepEqual(Object.keys(def.attacks).sort(), ['attack1', 'attack2', 'extra_attack', 'midair_attack1', 'midair_attack2']);
  for (const [id, atk] of Object.entries(def.attacks)) assert.equal(atk.animation, id, `${id} plays its own clip`);
  assert.deepEqual(Object.keys(def.animations), [
    'idle', 'run', 'jump', 'fall', 'mouvment', 'land', 'hurt', 'midair_hurt',
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'charge', 'charge_loop', 'charge_release',
    'prepshield', 'shielding', 'releaseshield', 'midair_shielding', 'extra_attack',
    'attack4_form', 'attack4_dash', 'attack4_confirm', 'attack4_explosion', 'attack4_release', 'attack4_whiff_release',
  ]);
  assert.deepEqual(Object.keys(def.projectileAnimations), ['extra_attack_object']);
  assert.deepEqual(Object.keys(def.projectiles), ['extra_attack_object']);
  assert.equal(def.attacks.extra_attack.projectile.id, 'extra_attack_object');
  assert.deepEqual(Object.keys(def.effectAnimations), [
    'attack3_object', 'attack4_object_build', 'attack4_object_impact', 'attack4_object_explosion',
  ]);
  for (const name of [...RETIRED_ATTACKS, ...RETIRED_MOVES, ...RETIRED_ANIMATIONS]) {
    for (const table of ['attacks', 'animations', 'projectileAnimations', 'effectAnimations', 'projectiles', 'summons', 'chargedTechniques', 'abilityNames']) {
      assert.equal(def[table][name], undefined, `no ${table}.${name}`);
    }
  }
  for (const name of [...RETIRED_CONTROLS, ...RETIRED_ATTACKS]) {
    assert.equal(def.actions[name], undefined, `no ${name} action`);
    assert.equal(def.mobileAbilities[name], undefined, `no ${name} mobile ability`);
    assert.equal(def.chargeReplacements[name], undefined, `no ${name} Charge replacement`);
  }
});

test('Charge replacements: Charge + attack1 is attack3 (the Clone Attack), Charge + attack2 is attack4 (the Sphere Rush)', () => {
  assert.deepEqual(def.chargeReplacements, {
    attack1: { type: 'summon', id: 'attack3' },
    attack2: { type: 'technique', id: 'attack4' },
  });
  assert.deepEqual(Object.keys(def.summons), ['attack3']);
  assert.equal(def.summons.attack3.attack, 'attack1');
  assert.equal(def.summons.attack3.noGround.attack, 'midair_attack2');
  assert.equal(def.summons.attack3.cloud, 'attack3_object');
  assert.deepEqual(Object.keys(def.chargedTechniques), ['attack4']);
  assert.deepEqual(
    ['formAnimation', 'dashAnimation', 'confirmAnimation', 'explosionAnimation', 'releaseAnimation', 'whiffReleaseAnimation',
      'sphereBuild', 'sphereImpact', 'sphereExplosion'].map((field) => def.chargedTechniques.attack4[field]),
    ['attack4_form', 'attack4_dash', 'attack4_confirm', 'attack4_explosion', 'attack4_release', 'attack4_whiff_release',
      'attack4_object_build', 'attack4_object_impact', 'attack4_object_explosion'],
  );
  assert.deepEqual(Object.keys(def.chargedTechniques.attack4.handOffsets), ['attack4_form', 'attack4_dash']);
  assert.deepEqual(def.abilityNames, {
    extra_attack: 'Shuriken', attack1: 'Punch', attack2: 'Kick', attack3: 'Clone Attack', attack4: 'Sphere Rush',
  });
  assert.equal(cooldownLabel('attack3'), 'A3');
  assert.equal(cooldownLabel('attack4'), 'A4');
});

test('real Charge replacements start the attack3 and attack4 cooldowns, keyed by those moves and shown as A3 and A4', () => {
  const summoner = makeFighter();
  const foe = makeFighter({ x: 900, facing: -1 });
  summoner.fighter.opponent = foe.fighter;
  summoner.step({ charge: true });
  summoner.step({ charge: true, attack1: true, attack1Pressed: true });
  assert.ok(summoner.fighter.combat.chargedCooldowns.active('attack3'));
  assert.deepEqual(summoner.fighter.summons.map((s) => s.id), ['attack3']);
  summoner.step({});
  summoner.step({ charge: true });
  summoner.step({ charge: true, attack2: true, attack2Pressed: true });
  assert.equal(summoner.fighter.technique?.def.id, 'attack4');
  assert.equal(summoner.fighter.technique.action, 'attack2');
  assert.deepEqual([...summoner.fighter.combat.chargedCooldowns.entries.keys()], ['attack3', 'attack4']);
  assert.deepEqual(cooldownIndicators(summoner.fighter).map((c) => [c.id, c.action, c.label]), [
    ['attack3', 'attack1', 'A3'],
    ['attack4', 'attack2', 'A4'],
  ]);
});

test('the combat AI discovers the moveset by its canonical names, and reaches attack3 and attack4 only through their buttons', () => {
  const moves = readMoveset(new Fighter({ def, sprites: fakeSprites(), stage: STAGE, spawn: { x: 500 } }));
  assert.deepEqual(moves.melee.map((m) => [m.action, m.id, m.air]).sort(), [
    ['attack1', 'attack1', false], ['attack1', 'midair_attack1', true], ['attack2', 'attack2', false], ['attack2', 'midair_attack2', true],
  ]);
  assert.deepEqual(moves.ranged.map((m) => [m.action, m.id, m.air]), [['extra_attack', 'extra_attack', false]]);
  assert.deepEqual(moves.charged.map((c) => [c.action, c.id]), [['attack1', 'attack3'], ['attack2', 'attack4']]);
  assert.ok([...moves.melee, ...moves.ranged, ...moves.charged].every((m) => m.action !== 'transform'), 'transform is reserved');
  assert.ok([...moves.melee, ...moves.ranged].every((m) => !['attack3', 'attack4', 'attack5'].includes(m.action)), 'no attack3 to attack5 button');
});

// ---- Files ------------------------------------------------------------------

test('every fighter frame is <id>_<codename>_<frame>.png in its own folder, and the frame helpers build exactly that', () => {
  assert.equal(framePath('0027', 'attack2', 3), './assets/characters/0027/0027_attack2_3.png');
  assert.equal(framePath('0027', 'charge', 'a'), './assets/characters/0027/0027_charge_a.png');
  assert.deepEqual(frames('0027', 'midair_attack2', 2), [
    './assets/characters/0027/0027_midair_attack2_1.png', './assets/characters/0027/0027_midair_attack2_2.png',
  ]);
  assert.deepEqual(frames('0027', 'attack4_object', 2, 10), [
    './assets/characters/0027/0027_attack4_object_10.png', './assets/characters/0027/0027_attack4_object_11.png',
  ]);
  for (const c of [...CHARACTERS, SAMPLE_FIGHTER]) {
    const id = c.id === 'sample' ? '0001' : c.id;
    const pattern = new RegExp(`^\\./assets/characters/${id}/${id}_([a-z0-9_]+)_(\\d+|[ab])\\.png$`);
    for (const [table, clips] of [['animations', c.animations], ['projectileAnimations', c.projectileAnimations], ['effectAnimations', c.effectAnimations]]) {
      for (const [key, clip] of Object.entries(clips ?? {})) {
        for (const url of clip.frames) {
          const m = pattern.exec(url);
          assert.ok(m, `${table}.${key}: ${url} follows <id>_<codename>_<frame>.png`);
          // The frame's codename is its clip's own, or the one its clip is a
          // part of (attack4_form plays attack4_*, charge_loop charge_*).
          const codename = m[1];
          if (c === SAMPLE_FIGHTER) continue;
          assert.ok(key === codename || key.startsWith(`${codename}_`), `${table}.${key} plays ${codename} frames`);
          // Lettered frames are Charge's loop, and nothing else.
          if (/[ab]$/.test(m[2])) assert.equal(`${codename}_${key}`, 'charge_charge_loop', url);
        }
      }
    }
    for (const url of characterFramePaths(c)) assert.ok(existsSync(new URL(url.slice(2), ROOT)), `${url} exists`);
  }
});

test('#0001\'s folder holds only codename files, none under a retired stem', () => {
  const files = readdirSync(new URL('assets/characters/0001/', ROOT));
  assert.equal(files.length, 92);
  for (const name of files) {
    assert.match(name, /^0001_[a-z][a-z0-9_]*_(\d+|[ab])\.png$/, name);
    assert.doesNotMatch(name, new RegExp(`^0001_(${RETIRED_STEMS.join('|')})\\d*\\.png$`), name);
  }
  const used = new Set(characterFramePaths(def).map((url) => url.split('/').pop()));
  // Only the retired Dodge frames are not loaded (Dodge was removed; their
  // names follow the convention all the same).
  assert.deepEqual(files.filter((n) => !used.has(n)).sort(), [
    '0001_dodge_1.png', '0001_dodge_2.png', '0001_dodge_3.png',
    '0001_midair_dodge_1.png', '0001_midair_dodge_2.png', '0001_midair_dodge_3.png',
  ]);
});

// ---- Retired names ------------------------------------------------------------

test('no retired attack, control, animation or file name is left in the game code, the stylesheet or the page', () => {
  const files = readdirSync(new URL('js/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
  for (const file of [...files, 'styles.css', 'index.html']) {
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
  const tests = readdirSync(new URL('tests/', ROOT)).filter((f) => f.endsWith('.mjs') && f !== 'codenames.test.mjs');
  for (const file of [...tests.map((f) => `tests/${f}`), 'README.md', 'ALVA_SPEC.md', 'CLAUDE.md']) {
    const lines = read(file).split('\n');
    const hit = lines.findIndex((line) => RETIRED_NOW.test(line));
    assert.equal(hit, -1, `${file}:${hit + 1} still uses a retired name: ${lines[hit]}`);
  }
  // Test files are named by the new codenames too.
  for (const gone of ['basic-attack', 'basic-attack-2', 'charged-ba2', 'throw']) {
    assert.equal(existsSync(new URL(`tests/${gone}.test.mjs`, ROOT)), false, `tests/${gone}.test.mjs`);
  }
});
