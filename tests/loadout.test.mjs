// Run with node --test tests/loadout.test.mjs (no dependencies).
// The attack loadout rules (js/data/loadout.js), data-driven over the
// matrix of tests/loadout-fighters.mjs: which numbered attacks each fighter
// has (every one a button of its own), which kind of move each button is
// (an ordinary attack with its mid-air version, a summon or a technique);
// then the same fighters through the real Fighter (ground, air, the combat
// input buffer), the keyboard and gamepad, and the combat AI; and every
// rule the validator enforces, each broken on purpose. #0001's own loadout
// is one case among them, never a special one. Its touch buttons are in
// controls-ui.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG, NUMBERED_ATTACKS } from '../js/config.js';
import { CHARACTERS, getCharacter } from '../js/data/characters.js';
import {
  ACTION_TYPES, MIN_NUMBERED_ATTACKS, actionType, assertLoadout, attackButtons, describeLoadout, loadoutProblems,
  midairAttack, numberedAttacks, specialAction, specialAttacks,
} from '../js/data/loadout.js';
import * as loadoutModule from '../js/data/loadout.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { readMoveset } from '../js/game/combat-ai.js';
import { DT, cpuFight, duel, fakeSpritesOf, makeFighter, startupSteps } from './fighter-harness.mjs';
import { LOADOUT_CASES, WITH_EXTRA, loadoutFighter } from './loadout-fighters.mjs';
import { SAMPLE_FIGHTER } from './sample-fighter.mjs';

const DEF_0001 = getCharacter('0001');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const JUMP = { jump: true, jumpPressed: true };
const fighterOf = (def, opts = {}) => makeFighter({ character: def, sprites: fakeSpritesOf(def), ...opts });

// A fighter of `def` in the air, falling, free to act.
function airborne(def) {
  const f = fighterOf(def);
  f.step(JUMP);
  f.step({ jump: true });
  assert.equal(f.fighter.grounded, false);
  return f;
}

// ---- The matrix ------------------------------------------------------------------

for (const c of LOADOUT_CASES) {
  const kinds = c.buttons.map((b) => (c.types[b] === 'attack' ? b : `${b} (${c.types[b]})`));
  const label = `Case ${c.name}: ${c.count} attacks${c.specials ? ' with a summon and a technique' : ''}`;

  test(`${label}: buttons ${kinds.join(', ')}, every numbered attack a button of its own`, () => {
    const def = c.def;
    assert.deepEqual(loadoutProblems(def), [], 'it keeps every rule');
    assert.deepEqual(numberedAttacks(def), NUMBERED_ATTACKS.slice(0, c.count), 'attack1 to its highest, in a row');
    assert.deepEqual(attackButtons(def), c.buttons, 'the buttons of its own');
    assert.deepEqual(attackButtons(def), numberedAttacks(def), 'one button per numbered attack: nothing reached another way');
    const ordinary = c.buttons.filter((b) => c.types[b] === 'attack');
    assert.deepEqual(describeLoadout(def), {
      numbered: NUMBERED_ATTACKS.slice(0, c.count),
      buttons: c.buttons,
      air: Object.fromEntries(ordinary.map((b) => [b, `midair_${b}`])),
      types: c.types,
      extra: false,
    });
    assert.deepEqual(specialAttacks(def), c.buttons.filter((b) => c.types[b] !== 'attack'));
    for (const button of c.buttons) {
      assert.equal(actionType(def, button), c.types[button], button);
      if (c.types[button] === 'attack') {
        // An ordinary button is { ground: attackN, air: midair_attackN }.
        assert.deepEqual(def.actions[button], { ground: button, air: midairAttack(button) }, button);
        assert.ok(def.attacks[midairAttack(button)], `${button} has its mid-air version`);
        assert.equal(specialAction(def, button), null);
      } else {
        // A summon or a technique is { type, id }, keyed by the button it
        // is, and needs no mid-air version.
        assert.deepEqual(def.actions[button], { type: c.types[button], id: button }, button);
        assert.deepEqual(specialAction(def, button), { type: c.types[button], id: button });
        assert.equal(def.attacks[midairAttack(button)], undefined, `${button}: no mid-air version needed`);
        assert.equal(def.animations[midairAttack(button)], undefined);
      }
    }
  });

  test(`${label}: each button makes its own move, on the ground, and in the air where it has one; nothing else presses`, () => {
    for (const button of COMBAT_ACTIONS) {
      const ground = duel({ attackerCharacter: c.def, attackerSprites: fakeSpritesOf(c.def), gap: 150 });
      ground.tick(P(button));
      const air = airborne(c.def);
      air.step(P(button));
      const type = c.buttons.includes(button) ? c.types[button] : null;
      const f = ground.attacker;
      if (type === 'attack') {
        assert.equal(f.combat.attack?.def.id, button, `${button} on the ground`);
        assert.equal(air.fighter.combat.attack?.def.id, midairAttack(button), `${button} in the air`);
        assert.equal(f.combat.attack.def.damage, Number(button.slice(6)), 'its own data');
        assert.equal(f.combat.abilityCooldowns.size, 0);
      } else if (type === 'summon') {
        assert.equal(f.combat.attack, null, `${button}: no attack of the fighter's own`);
        assert.ok(f.combat.abilityCooldowns.active(button), `${button}, the summon, with its cooldown`);
        // Its owner's summoning startup first (#0001's, borrowed), then the
        // clone, from the same press.
        assert.equal(f.state, 'summon', `${button}: the startup, from the press`);
        assert.equal(ground.clones.length, 0, 'no clone before the startup ends');
        for (let i = 0; i < startupSteps(c.def, button); i++) ground.tick();
        assert.equal(ground.clones.length, 1, 'its clone');
        assert.equal(ground.clones[0].attackDef.id, 'attack1');
      } else if (type === 'technique') {
        assert.equal(f.technique?.def.id, button, `${button}, the technique`);
        assert.ok(f.combat.abilityCooldowns.active(button));
      } else {
        // A button it does not have (attack5 of a smaller fighter, its
        // reserved or missing extras).
        assert.equal(f.combat.attack, null, `${button}: nothing on the ground`);
        assert.equal(f.summons.length + ground.clones.length + (f.technique ? 1 : 0), 0, `${button}: no summon or technique either`);
      }
      if (type !== 'attack') {
        // A summon or a technique is ground-only: nothing in the air.
        assert.equal(air.fighter.combat.attack, null, `${button}: nothing in the air`);
        assert.equal(air.fighter.summons.length + (air.fighter.technique ? 1 : 0), 0, `${button}: no summon or technique in the air`);
        assert.equal(air.fighter.combat.abilityCooldowns.size, 0, `${button}: no cooldown spent in the air`);
      }
    }
  });

  test(`${label}: Down held changes nothing about what a button makes`, () => {
    for (const button of c.buttons) {
      const plain = duel({ attackerCharacter: c.def, attackerSprites: fakeSpritesOf(c.def), gap: 150 });
      plain.tick(P(button));
      const down = duel({ attackerCharacter: c.def, attackerSprites: fakeSpritesOf(c.def), gap: 150 });
      for (let i = 0; i < 5; i++) down.tick({ down: true });
      down.tick({ down: true, ...P(button) });
      const what = (d) => [d.attacker.combat.attack?.def.id ?? null, d.attacker.technique?.def.id ?? null, d.clones.length];
      assert.deepEqual(what(down), what(plain), button);
    }
  });
}

test('Case F: attack5 is an ordinary button beside the summon and the technique, midair_attack5 in the air, and it hits', () => {
  const F = LOADOUT_CASES.find((c) => c.name === 'F').def;
  const air = airborne(F);
  air.step(P('attack5'));
  assert.equal(air.fighter.combat.attack.def.id, 'midair_attack5');
  const d = duel({ attackerCharacter: F, attackerSprites: fakeSpritesOf(F) });
  d.tick(P('attack5'));
  d.until(() => d.events.length > 0);
  assert.deepEqual([d.events[0].type, d.events[0].move, d.events[0].damage], ['hit', 'attack5', 5]);
});

test('#0001 is Case E with an extra attack: four numbered buttons, attack3 a summon and attack4 a technique', () => {
  const E = LOADOUT_CASES.find((c) => c.name === 'E');
  const own = describeLoadout(DEF_0001);
  assert.deepEqual({ ...own, extra: false }, describeLoadout(E.def));
  assert.equal(own.extra, true);
  assert.deepEqual(own.types, { attack1: 'attack', attack2: 'attack', attack3: 'summon', attack4: 'technique' });
  assert.deepEqual(attackButtons(DEF_0001), ['attack1', 'attack2', 'attack3', 'attack4'], 'Attack 1 to Attack 4');
  assert.equal(Object.hasOwn(DEF_0001.actions, 'attack5'), false, 'no Attack 5');
  assert.deepEqual(DEF_0001.actions.attack3, { type: 'summon', id: 'attack3' });
  assert.deepEqual(DEF_0001.actions.attack4, { type: 'technique', id: 'attack4' });
  assert.deepEqual(Object.keys(own), ['numbered', 'buttons', 'air', 'types', 'extra'], 'nothing reached through another button');
  assert.deepEqual(ACTION_TYPES, ['attack', 'summon', 'technique']);
});

test('an extra_attack sits beside five numbered attacks, outside their count, on its own button', () => {
  assert.deepEqual(loadoutProblems(WITH_EXTRA), []);
  assert.deepEqual(numberedAttacks(WITH_EXTRA), [...NUMBERED_ATTACKS], 'still five numbered attacks');
  assert.equal(describeLoadout(WITH_EXTRA).extra, true);
  const ground = fighterOf(WITH_EXTRA);
  ground.step(P('extra_attack'));
  assert.equal(ground.fighter.combat.attack.def.id, 'extra_attack');
  while (ground.fighter.combat.attack) ground.step({});
  assert.deepEqual(ground.fighter.releases.map((r) => r.id), ['extra_attack_object'], 'its projectile, named after it');
  // Its own button: it needs no midair_extra_attack.
  assert.equal(WITH_EXTRA.attacks.midair_extra_attack, undefined);
  // And it counts toward nothing: one numbered attack and an extra_attack
  // is still too few.
  const tooFew = loadoutFighter({ id: 'one', count: 1, extra: true });
  assert.ok(loadoutProblems(tooFew).some((p) => /numbered attacks/.test(p)));
});

// ---- Input ---------------------------------------------------------------------------

test('the combat input buffer keeps every numbered attack button through attack5', () => {
  const C = LOADOUT_CASES.find((c) => c.name === 'C').def;
  for (const button of NUMBERED_ATTACKS) {
    const first = button === 'attack5' ? 'attack1' : 'attack5';
    const { fighter, step } = fighterOf(C);
    step(P(first));
    const busy = fighter.combat.attack;
    // Pressed a few steps before `first` ends: too early, so it is kept.
    while (busy.def.total - busy.time > 3 * DT) step({});
    step(P(button));
    assert.equal(fighter.combat.attack, busy, `${button} waits`);
    assert.equal(fighter.bufferedAttack?.action, button, `${button} is kept`);
    while (fighter.combat.attack === busy) step({});
    assert.equal(fighter.combat.attack?.def.id, button, `${button} comes out as soon as ${first} ends`);
  }
});

test('keyboard O, M and , and gamepad LT, L3 and R3 press attack3, attack4 and attack5; the old keys are untouched', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code) => listeners[type]({ code, repeat: false, preventDefault() {} });
  for (const [code, action] of [['KeyU', 'attack1'], ['KeyI', 'attack2'], ['KeyO', 'attack3'], ['KeyM', 'attack4'], ['Comma', 'attack5'], ['KeyJ', 'extra_attack']]) {
    key('keydown', code);
    const f = input.sample();
    assert.equal(f[action], true, code);
    assert.equal(f[`${action}Pressed`], true, code);
    for (const other of COMBAT_ACTIONS.filter((a) => a !== action)) assert.equal(f[other], false, `${code} presses only ${action}`);
    key('keyup', code);
    input.sample();
  }
  listeners.gamepadconnected();
  for (const [i, action] of [[1, 'attack1'], [4, 'attack2'], [6, 'attack3'], [10, 'attack4'], [11, 'attack5'], [2, 'extra_attack']]) {
    pad.buttons[i].pressed = true;
    input.pollGamepads(0);
    assert.equal(input.sample()[`${action}Pressed`], true, `pad button ${i}`);
    pad.buttons[i].pressed = false;
    input.pollGamepads(0);
    input.sample();
  }
});

// ---- The combat AI -------------------------------------------------------------------------

test('the CPU knows each fighter\'s buttons from its loadout: its attacks, and its summons and techniques on their own buttons', () => {
  for (const c of LOADOUT_CASES) {
    const { fighter } = fighterOf(c.def);
    const moves = readMoveset(fighter);
    const pressed = new Set([...moves.melee, ...moves.ranged].map((m) => m.action));
    const ordinary = c.buttons.filter((b) => c.types[b] === 'attack');
    assert.deepEqual([...pressed].sort(), [...ordinary].sort(), `Case ${c.name}: its attacks`);
    assert.deepEqual(
      moves.specials.map((m) => [m.action, m.id, m.type]),
      c.buttons.filter((b) => c.types[b] !== 'attack').map((b) => [b, b, c.types[b]]),
      `Case ${c.name}: each summon and technique on its own button`,
    );
  }
});

test('a CPU presses whichever of attack3 to attack5 it has a button for, and the attack comes out', () => {
  const C = LOADOUT_CASES.find((c) => c.name === 'C').def;
  for (const button of ['attack3', 'attack4', 'attack5']) {
    // Art for this one button only: every other numbered attack would be
    // refused, so the CPU's melee is this button's alone.
    const keys = Object.keys(C.animations).filter((k) => !/attack\d$/.test(k) || k.endsWith(button));
    const { a, log } = cpuFight(C, DEF_0001, { seconds: 20, seed: 1, spritesA: fakeSpritesOf(C, keys) });
    const mine = log.get(a);
    assert.ok(mine.some((s) => s[`${button}Pressed`]), `presses ${button}`);
    assert.ok(mine.some((s) => s.attack === button || s.attack === `midair_${button}`), `and ${button} comes out`);
    for (const other of NUMBERED_ATTACKS.filter((b) => b !== button)) {
      assert.ok(!mine.some((s) => s[`${other}Pressed`]), `never ${other}, which would do nothing`);
    }
  }
});

test('a Case F CPU presses attack3, attack4 and attack5 directly: each summon or technique starts on its own button', () => {
  const F = LOADOUT_CASES.find((c) => c.name === 'F').def;
  let specials = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { a, log } = cpuFight(F, DEF_0001, { seconds: 40, seed });
    const mine = log.get(a);
    assert.ok(mine.some((s) => s.attack5Pressed), `seed ${seed}: attack5 has a button`);
    // Each summon or technique starts on a step where its own button is
    // pressed, and no other numbered button with it.
    mine.forEach((s, i) => {
      for (const id of s.cooling.filter((c) => !(mine[i - 1]?.cooling ?? []).includes(c))) {
        specials++;
        assert.ok(s[`${id}Pressed`], `seed ${seed}: ${id} from its own button`);
        for (const other of ['attack1', 'attack2']) assert.ok(!s[`${other}Pressed`], `seed ${seed}: ${id} never from ${other}`);
      }
    });
  }
  assert.ok(specials > 0, 'it did use its summon and technique');
});

// ---- The rules, each broken ------------------------------------------------------------------

// `def` changed by `edit` (a function of a deep copy) breaks exactly the
// rule `pattern` names.
function breaks(edit, pattern, base = LOADOUT_CASES.find((c) => c.name === 'C').def) {
  const def = structuredClone({ ...base, animations: base.animations, attacks: base.attacks });
  edit(def);
  const problems = loadoutProblems(def);
  assert.ok(problems.some((p) => pattern.test(p)), `${pattern}: ${problems.join(' | ') || 'no problem found'}`);
  assert.throws(() => assertLoadout(def), /breaks the attack loadout rules/);
  return problems;
}

test('a character has 2 to 5 numbered attacks, attack1 and attack2 always, and never a sixth', () => {
  assert.equal(MIN_NUMBERED_ATTACKS, 2);
  assert.equal(NUMBERED_ATTACKS.length, 5);
  breaks((d) => { delete d.actions.attack2; delete d.actions.attack3; delete d.actions.attack4; delete d.actions.attack5; }, /1 numbered attacks/);
  breaks((d) => { delete d.actions.attack1; }, /attack1 needs a button/);
  breaks((d) => { delete d.actions.attack2; }, /attack2 needs a button/);
  breaks((d) => { d.actions.attack6 = { ground: 'attack6', air: 'midair_attack6' }; }, /actions\.attack6 is not a combat button/);
  breaks((d) => { d.actions.attack6 = { type: 'summon', id: 'attack6' }; }, /actions\.attack6 is not a combat button/);
  breaks((d) => { d.attacks.attack6 = { ...d.attacks.attack5, animation: 'attack5' }; }, /attacks\.attack6 is not a move codename/);
});

test('the numbered attacks are contiguous, whatever kind of move each button is', () => {
  // attack1, attack2, attack4: attack3 skipped.
  breaks((d) => { delete d.actions.attack3; delete d.actions.attack5; }, /are not attack1 to attack3 in a row/);
  // attack3 a summon, attack5 a button, attack4 nowhere.
  const D = LOADOUT_CASES.find((c) => c.name === 'D').def;
  breaks((d) => { d.actions.attack5 = { ground: 'attack5', air: 'midair_attack5' }; }, /not attack1 to attack4 in a row/, D);
});

test('every ordinary numbered button has its mid-air version, named midair_attackN, and both exist', () => {
  breaks((d) => { d.actions.attack3 = { ground: 'attack3' }; }, /actions\.attack3 must be \{ ground: 'attack3', air: 'midair_attack3' \}/);
  breaks((d) => { d.actions.attack3 = 'attack3'; }, /actions\.attack3 must be/);
  breaks((d) => { d.actions.attack3 = { ground: 'attack3', air: 'midair_attack1' }; }, /actions\.attack3 must be/);
  breaks((d) => { delete d.attacks.midair_attack4; }, /names attack "midair_attack4", which is not in `attacks`/);
  breaks((d) => { delete d.attacks.attack5; }, /names attack "attack5", which is not in `attacks`/);
  breaks((d) => { delete d.animations.midair_attack2; }, /attack "midair_attack2" plays "midair_attack2", which is not in `animations`/);
});

test('a summon or technique button is { type, id }, keyed by the button it is, a real summon or technique, and never attack1 or attack2', () => {
  const E = LOADOUT_CASES.find((c) => c.name === 'E').def;
  breaks((d) => { d.actions.attack3.id = 'attack4'; }, /actions\.attack3 must be \{ type: 'summon', id: 'attack3' \}/, E);
  breaks((d) => { d.actions.attack3.air = 'midair_attack3'; }, /actions\.attack3 must be \{ type: 'summon', id: 'attack3' \}/, E);
  breaks((d) => { d.actions.attack4.type = 'projectile'; }, /actions\.attack4 has type "projectile" \(summon or technique\)/, E);
  breaks((d) => { delete d.summons.attack3; }, /summons attack3, which is not in `summons`/, E);
  breaks((d) => { delete d.techniques.attack4; }, /performs attack4, which is not in `techniques`/, E);
  breaks((d) => { d.summons.attack3.attack = 'attack9'; }, /summon attack3 names attack "attack9"/, E);
  breaks((d) => { delete d.effectAnimations.attack3_object; }, /cloud "attack3_object" is not in `effectAnimations`/, E);
  breaks((d) => { delete d.animations.attack4_dash; }, /dashAnimation "attack4_dash" is not in `animations`/, E);
  // attack1 and attack2 are always ordinary attacks.
  breaks((d) => { d.actions.attack1 = { type: 'summon', id: 'attack1' }; }, /actions\.attack1 must be an ordinary attack/, E);
  breaks((d) => { d.actions.attack2 = { type: 'technique', id: 'attack2' }; }, /actions\.attack2 must be an ordinary attack/, E);
  // A summon or technique no button is gets refused: nothing is left to be
  // reached some other way.
  breaks((d) => { d.summons.attack5 = d.summons.attack3; }, /summons\.attack5 is no button's/, E);
  breaks((d) => { d.techniques.attack3 = d.techniques.attack4; }, /techniques\.attack3 is no button's/, E);
  breaks((d) => { d.actions.attack3 = { ground: 'attack3', air: 'midair_attack3' }; }, /summons\.attack3 is no button's|names attack "attack3"/, E);
});

test('what kind of move attack3 to attack5 are is data: the same button is an ordinary attack, a summon or a technique as authored', () => {
  const B = LOADOUT_CASES.find((c) => c.name === 'B').def;
  const D = LOADOUT_CASES.find((c) => c.name === 'D').def;
  assert.equal(actionType(B, 'attack3'), 'attack');
  assert.equal(actionType(D, 'attack3'), 'summon');
  assert.deepEqual(attackButtons(B), attackButtons(D), 'a button either way');
  // B's attack3 turned into D's summon by data alone: it keeps the rules
  // and needs no mid-air version.
  const summoned = structuredClone({ ...B, animations: B.animations, attacks: B.attacks });
  summoned.actions.attack3 = { type: 'summon', id: 'attack3' };
  summoned.summons = { attack3: { ...DEF_0001.summons.attack3 } };
  summoned.animations.attack3_summon = DEF_0001.animations.attack3_summon;
  summoned.effectAnimations = { attack3_object: DEF_0001.effectAnimations.attack3_object };
  delete summoned.attacks.attack3;
  delete summoned.attacks.midair_attack3;
  assert.deepEqual(loadoutProblems(summoned), []);
  const d = duel({ attackerCharacter: summoned, attackerSprites: fakeSpritesOf(summoned), gap: 150 });
  d.tick(P('attack3'));
  for (let i = 0; i < startupSteps(summoned, 'attack3'); i++) d.tick();
  assert.equal(d.clones.length, 1, 'the same button, now a summon');
  assert.equal(actionType(summoned, 'attack1'), 'attack');
  assert.equal(actionType(summoned, 'attack5'), null, 'no such button');
  assert.equal(actionType({ actions: { transform: null } }, 'transform'), null, 'reserved');
});

test('whatever an attack creates is named after it: <attack>_object', () => {
  breaks((d) => {
    d.actions.extra_attack = 'extra_attack';
    d.attacks.extra_attack = { ...DEF_0001.attacks.extra_attack, projectile: { ...DEF_0001.attacks.extra_attack.projectile, id: 'star' } };
    d.animations.extra_attack = DEF_0001.animations.extra_attack;
    d.projectiles.star = DEF_0001.projectiles.extra_attack_object;
    d.projectileAnimations.extra_attack_object = DEF_0001.projectileAnimations.extra_attack_object;
  }, /throws "star": its projectile is extra_attack_object/);
  const E = LOADOUT_CASES.find((c) => c.name === 'E').def;
  breaks((d) => {
    d.effectAnimations.smoke = d.effectAnimations.attack3_object;
    d.summons.attack3.cloud = 'smoke';
  }, /cloud "smoke" is not named attack3_object/, E);
  breaks((d) => { d.effectAnimations.sparkles = d.effectAnimations.attack3_object; }, /effectAnimations\.sparkles is not named after the attack/, E);
});

test('extra_attack and transform are one move each, or reserved', () => {
  breaks((d) => { d.actions.extra_attack = { ground: 'extra_attack', air: 'midair_extra_attack' }; }, /actions\.extra_attack must be 'extra_attack' or null/);
  breaks((d) => { d.actions.transform = 'attack1'; }, /actions\.transform must be 'transform' or null/);
  assert.deepEqual(loadoutProblems({ ...LOADOUT_CASES[0].def, actions: { ...LOADOUT_CASES[0].def.actions, transform: null } }), []);
});

test('every definition the game loads keeps the rules, and a broken one is refused as the module loads', () => {
  for (const def of [...CHARACTERS, SAMPLE_FIGHTER, WITH_EXTRA, ...LOADOUT_CASES.map((c) => c.def)]) {
    assert.deepEqual(loadoutProblems(def), [], def.id);
    assert.doesNotThrow(() => assertLoadout(def));
  }
  const source = readFileSync(new URL('../js/data/characters.js', import.meta.url), 'utf8');
  assert.match(source, /for \(const def of CHARACTERS\) assertLoadout\(def\);/);
  // The rules are generic: nothing in them names a character.
  const rules = readFileSync(new URL('../js/data/loadout.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(rules, /'000\d'|#000\d|displayName|Punch|Kick|Shuriken|Clone|Sphere/);
  // And they describe direct buttons only: no modifier, stance or
  // replacement layer.
  assert.deepEqual(Object.keys(loadoutModule).sort(), [
    'ACTION_TYPES', 'EXTRA_ATTACK', 'MIN_NUMBERED_ATTACKS', 'NUMBERED_ATTACKS', 'actionType', 'assertLoadout', 'attackButtons',
    'describeLoadout', 'isNumberedAttack', 'loadoutProblems', 'midairAttack', 'numberedAttacks', 'objectOf', 'specialAction',
    'specialAttacks',
  ]);
});

test('the engine goes by the loadout, never by an attack\'s number: no character or attack special-cased', () => {
  for (const file of ['js/game/character.js', 'js/game/combat-ai.js', 'js/game/touch-controls.js', 'js/ui/mobile-abilities.js', 'js/game/fighter-status.js']) {
    const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'000\d'/, `${file}: no fighter id`);
    assert.doesNotMatch(code, /===?\s*'attack[3-5]'|'attack[3-5]'\s*===?/, `${file}: no attack3 to attack5 special case`);
  }
});
