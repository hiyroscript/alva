// Run with node --test tests/codenames.test.mjs (no dependencies).
// The canonical control and move codenames, in one place. They are
// universal, the same for every character (a character's own ability names
// are per character): every gameplay control (runLeft, runRight,
// mouvementLeft, mouvementRight, jump, charge, shield, uniqueba, transform,
// ba1, ba2, pause) and every move (ba1, maba1, cba1, ba2, maba2, cba2,
// uniqueba, transform) goes by exactly one name, from the bindings and input
// snapshots through every character's data, the charged actions, their
// cooldowns and the combat AI. The retired generic names survive nowhere as
// an alias. Behaviour lives in the other test files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { def, fakeSprites, makeFighter, STAGE } from './fighter-harness.mjs';
import { ACTIONS, ACTION_LABELS, CONFIG, MOVES } from '../js/config.js';
import { CHARACTERS } from '../js/data/characters.js';
import { COMBAT_ACTIONS, Fighter } from '../js/game/character.js';
import { blankInput } from '../js/game/fighter-controller.js';
import { readMoveset } from '../js/game/combat-ai.js';
import { CHARGED_LABELS, cbaIndicators } from '../js/game/fighter-status.js';
import { ABILITY_ACTIONS } from '../js/ui/mobile-abilities.js';

// The normalized fighter input snapshot, field for field.
const SNAPSHOT = [
  'runLeft', 'runRight', 'charge', 'jump', 'shield', 'uniqueba', 'transform', 'ba1', 'ba2',
  'runLeftPressed', 'runRightPressed', 'mouvementLeftPressed', 'mouvementRightPressed',
  'jumpPressed', 'chargePressed', 'shieldPressed',
  'uniquebaPressed', 'transformPressed', 'ba1Pressed', 'ba2Pressed',
  'dropPressed',
];

// Control and move names the refactor retired, none of which may come back.
const RETIRED_CONTROLS = [
  'left', 'right', 'primary', 'special', 'defense', 'action1', 'action2',
  'dashLeft', 'dashRight',
];
const RETIRED_MOVES = ['midairBa1', 'midairBa2', 'throw', 'ba1Clone', 'rasenRush'];

test('the gameplay controls are the canonical codenames, keys unchanged', () => {
  assert.deepEqual([...ACTIONS], [
    'runLeft', 'runRight', 'charge', 'jump', 'uniqueba', 'transform', 'shield', 'ba1', 'ba2', 'pause',
  ]);
  assert.deepEqual(Object.keys(CONFIG.bindings), [...ACTIONS]);
  assert.deepEqual(Object.keys(ACTION_LABELS), [...ACTIONS]);
  assert.deepEqual(CONFIG.bindings.runLeft, ['KeyA', 'ArrowLeft']);
  assert.deepEqual(CONFIG.bindings.runRight, ['KeyD', 'ArrowRight']);
  assert.deepEqual(CONFIG.bindings.charge, ['KeyS', 'ArrowDown']);
  assert.deepEqual(CONFIG.bindings.jump, ['KeyW', 'Space', 'ArrowUp']);
  assert.deepEqual(CONFIG.bindings.uniqueba, ['KeyJ']);
  assert.deepEqual(CONFIG.bindings.transform, ['KeyK']);
  assert.deepEqual(CONFIG.bindings.shield, ['KeyL']);
  assert.deepEqual(CONFIG.bindings.ba1, ['KeyU']);
  assert.deepEqual(CONFIG.bindings.ba2, ['KeyI']);
  assert.deepEqual(CONFIG.bindings.pause, ['Escape', 'KeyP']);
  assert.equal(ACTION_LABELS.transform, 'Transform');
  assert.equal(ACTION_LABELS.shield, 'Shield');
  // Menus keep their own directions: menu Left / Right are not runLeft / runRight.
  assert.deepEqual(Object.keys(CONFIG.menuBindings), ['up', 'down', 'left', 'right', 'confirm', 'back']);
  for (const name of RETIRED_CONTROLS) {
    assert.equal(CONFIG.bindings[name], undefined, `no ${name} binding`);
    assert.ok(!ACTIONS.includes(name), `no ${name} action`);
  }
});

test('COMBAT_ACTIONS are uniqueba, transform, ba1 and ba2; shield, jump and charge stay held-state controls', () => {
  assert.deepEqual(COMBAT_ACTIONS, ['uniqueba', 'transform', 'ba1', 'ba2']);
  for (const held of ['shield', 'jump', 'charge']) assert.ok(!COMBAT_ACTIONS.includes(held), held);
  assert.deepEqual([...ABILITY_ACTIONS], ['uniqueba', 'ba1', 'ba2']);
});

test('the move codenames are universal: each belongs to one combat button, on the ground, in the air or charged', () => {
  assert.deepEqual(Object.keys(MOVES), ['ba1', 'maba1', 'cba1', 'ba2', 'maba2', 'cba2', 'uniqueba', 'transform']);
  assert.deepEqual(Object.entries(MOVES).map(([id, m]) => [id, m.button, m.variant]), [
    ['ba1', 'ba1', 'ground'], ['maba1', 'ba1', 'air'], ['cba1', 'ba1', 'charged'],
    ['ba2', 'ba2', 'ground'], ['maba2', 'ba2', 'air'], ['cba2', 'ba2', 'charged'],
    ['uniqueba', 'uniqueba', null], ['transform', 'transform', null],
  ]);
  for (const m of Object.values(MOVES)) assert.ok(COMBAT_ACTIONS.includes(m.button), m.button);
  // Neutral names, never one character's: its own ability names go on top.
  assert.deepEqual(Object.values(MOVES).map((m) => m.label), [
    'Basic Attack 1', 'Mid-air Basic Attack 1', 'Charged Basic Attack 1',
    'Basic Attack 2', 'Mid-air Basic Attack 2', 'Charged Basic Attack 2',
    'Unique Basic Attack', 'Transform',
  ]);
  assert.equal(ACTION_LABELS.uniqueba, 'Unique Basic Attack');
  for (const label of [...Object.values(ACTION_LABELS), ...Object.values(MOVES).map((m) => m.label)]) {
    assert.doesNotMatch(label, /Throw|Shuriken|Punch|Kick|Clone|Sphere|#0001/, `${label}: not a character's own name`);
  }
});

test('every character keys its moves by the universal codenames, each on its own button', () => {
  // The move a button makes where the fighter is (`variants`): its own
  // variant, or the button's one move (no variant).
  const onButton = (id, button, variants) =>
    MOVES[id]?.button === button && (MOVES[id].variant === null || variants.includes(MOVES[id].variant));
  for (const c of CHARACTERS) {
    const who = `#${c.id}`;
    for (const id of Object.keys(c.attacks ?? {})) {
      assert.ok(MOVES[id] && MOVES[id].variant !== 'charged', `${who}: attack ${id} is a universal ground / air / single move`);
    }
    for (const id of [...Object.keys(c.summons ?? {}), ...Object.keys(c.chargedTechniques ?? {})]) {
      assert.equal(MOVES[id]?.variant, 'charged', `${who}: charged move ${id} is cba1 or cba2`);
    }
    for (const [button, mapping] of Object.entries(c.actions ?? {})) {
      assert.ok(COMBAT_ACTIONS.includes(button), `${who}: actions.${button} is a combat button`);
      if (mapping === null) continue;
      if (typeof mapping === 'string') {
        assert.ok(onButton(mapping, button, ['ground', 'air']), `${who}: ${button} -> ${mapping}`);
      } else {
        if (mapping.ground) assert.ok(onButton(mapping.ground, button, ['ground']), `${who}: ${button} on the ground -> ${mapping.ground}`);
        if (mapping.air) assert.ok(onButton(mapping.air, button, ['air']), `${who}: ${button} in the air -> ${mapping.air}`);
      }
    }
    for (const [button, charged] of Object.entries(c.chargedActions ?? {})) {
      assert.ok(onButton(charged.id, button, ['charged']) && MOVES[charged.id].variant === 'charged',
        `${who}: Charge + ${button} -> ${charged.id}`);
    }
    for (const button of Object.keys(c.mobileAbilities ?? {})) {
      assert.ok(ACTIONS.includes(button), `${who}: mobileAbilities.${button} names a control`);
    }
  }
});

test('every controller builds the same canonical input snapshot', async () => {
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
});

test('#0001\'s actions resolve to the canonical move ids, on the ground and in the air', () => {
  assert.deepEqual(def.actions, {
    uniqueba: 'uniqueba',
    transform: null,
    ba1: { ground: 'ba1', air: 'maba1' },
    ba2: { ground: 'ba2', air: 'maba2' },
  });
  const { fighter, step } = makeFighter();
  assert.deepEqual(COMBAT_ACTIONS.map((a) => fighter.attackFor(a)), ['uniqueba', null, 'ba1', 'ba2']);
  step({ jump: true, jumpPressed: true });
  assert.deepEqual(COMBAT_ACTIONS.map((a) => fighter.attackFor(a)), ['uniqueba', null, 'maba1', 'maba2']);
});

test('#0001\'s moves: attacks and their animation keys are ba1, maba1, ba2, maba2 and uniqueba; the art files keep their names', () => {
  assert.deepEqual(Object.keys(def.attacks).sort(), ['ba1', 'ba2', 'maba1', 'maba2', 'uniqueba']);
  for (const [id, atk] of Object.entries(def.attacks)) assert.equal(atk.animation, id, `${id} plays its own clip`);
  const file = (url) => url.split('/').pop();
  assert.deepEqual(def.animations.maba1.frames.map(file), ['0001_midair1ba1.png', '0001_midair1ba2.png', '0001_midair1ba3.png']);
  assert.deepEqual(def.animations.maba2.frames.map(file), [1, 2, 3, 4, 5].map((n) => `0001_midair2ba${n}.png`));
  assert.deepEqual(def.animations.uniqueba.frames.map(file), ['0001_throw1.png', '0001_throw2.png', '0001_throw3.png']);
  for (const name of RETIRED_MOVES) {
    assert.equal(def.attacks[name], undefined, `no ${name} attack`);
    assert.equal(def.animations[name], undefined, `no ${name} animation`);
    assert.equal(def.summons[name], undefined, `no ${name} summon`);
    assert.equal(def.chargedTechniques[name], undefined, `no ${name} technique`);
  }
  for (const name of RETIRED_CONTROLS) {
    assert.equal(def.actions[name], undefined, `no ${name} action`);
    assert.equal(def.mobileAbilities[name], undefined, `no ${name} mobile ability`);
    assert.equal(def.chargedActions[name], undefined, `no ${name} charged action`);
  }
});

test('charged actions: Charge + ba1 is cba1 (the Clone Attack), Charge + ba2 is cba2 (the Sphere Rush)', () => {
  assert.deepEqual(def.chargedActions, {
    ba1: { type: 'summon', id: 'cba1' },
    ba2: { type: 'technique', id: 'cba2' },
  });
  assert.deepEqual(Object.keys(def.summons), ['cba1']);
  assert.equal(def.summons.cba1.attack, 'ba1');
  assert.equal(def.summons.cba1.noGround.attack, 'maba2');
  assert.deepEqual(Object.keys(def.chargedTechniques), ['cba2']);
  assert.equal(def.chargedTechniques.cba2.dashAnimation, 'rasenDash', 'its phases keep their own art names');
  assert.deepEqual({ ...CHARGED_LABELS }, { ba1: 'CBA1', ba2: 'CBA2' });
});

test('real charged actions start the cba1 and cba2 cooldowns, shown as CBA1 and CBA2', () => {
  const summoner = makeFighter();
  const foe = makeFighter({ x: 900, facing: -1 });
  summoner.fighter.opponent = foe.fighter;
  summoner.step({ charge: true });
  summoner.step({ charge: true, ba1: true, ba1Pressed: true });
  assert.ok(summoner.fighter.combat.chargedCooldowns.active('cba1'));
  assert.deepEqual(summoner.fighter.summons.map((s) => s.id), ['cba1']);
  summoner.step({});
  summoner.step({ charge: true });
  summoner.step({ charge: true, ba2: true, ba2Pressed: true });
  assert.equal(summoner.fighter.technique?.def.id, 'cba2');
  assert.equal(summoner.fighter.technique.action, 'ba2');
  assert.deepEqual(cbaIndicators(summoner.fighter).map((c) => [c.id, c.action, c.label]), [
    ['cba1', 'ba1', 'CBA1'],
    ['cba2', 'ba2', 'CBA2'],
  ]);
});

test('the combat AI discovers the moveset by its canonical names', () => {
  const moves = readMoveset(new Fighter({ def, sprites: fakeSprites(), stage: STAGE, spawn: { x: 500 } }));
  assert.deepEqual(moves.melee.map((m) => [m.action, m.id, m.air]).sort(), [
    ['ba1', 'ba1', false], ['ba1', 'maba1', true], ['ba2', 'ba2', false], ['ba2', 'maba2', true],
  ]);
  assert.deepEqual(moves.ranged.map((m) => [m.action, m.id, m.air]), [['uniqueba', 'uniqueba', false]]);
  assert.deepEqual(moves.charged.map((c) => [c.action, c.id]), [['ba1', 'cba1'], ['ba2', 'cba2']]);
  assert.ok([...moves.melee, ...moves.ranged, ...moves.charged].every((m) => m.action !== 'transform'), 'transform is reserved');
});

test('no retired control or move identifier is left in the game code', () => {
  const ROOT = new URL('../js/', import.meta.url);
  const files = readdirSync(ROOT, { recursive: true }).filter((f) => f.endsWith('.js'));
  const retired = new RegExp([
    // Unambiguous identifiers, anywhere in the code.
    '\\b(action1|action2|midairBa1|midairBa2|ba1Clone|rasenRush)\\b',
    '\\b(dashLeftPressed|dashRightPressed|leftPressed|rightPressed|queueTouchDash|touchDash)\\b',
    '\\b(primaryPressed|specialPressed|defensePressed|cabIndicators|drawCabIndicators|CAB_STYLE)\\b',
    '\\bCAB[12]?\\b',
    // The generic control names, wherever they are used as one. A
    // character's `defense` entry (what shield does) is another thing, and
    // so are geometry's and the menus' left / right: runLeft / runRight are
    // held to their name by the bindings and snapshot checks above.
    "'(primary|special|defense)'",
    '\\b(input|out|held|frame|bindings|actions)\\.(primary|special|defense)\\b',
  ].join('|'));
  for (const file of files) {
    const code = readFileSync(new URL(file, ROOT), 'utf8');
    const hit = code.split('\n').findIndex((line) => retired.test(line));
    assert.equal(hit, -1, `${file}:${hit + 1} still uses a retired name`);
  }
});
