// Run with node --test tests/loadout.test.mjs (no dependencies).
// The attack loadout rules (js/data/loadout.js), data-driven over the
// matrix of tests/loadout-fighters.mjs: which numbered attacks each fighter
// has, which have a button of their own and a mid-air version, and which
// Charge reaches from which button; then the same fighters through the real
// Fighter (ground, air, Charge, the combat input buffer), the keyboard and
// gamepad, and the combat AI; and every rule the validator enforces, each
// broken on purpose. #0001's own loadout is one case among them, never a
// special one. Its touch buttons are in controls-ui.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG, NUMBERED_ATTACKS } from '../js/config.js';
import { CHARACTERS, getCharacter } from '../js/data/characters.js';
import {
  CHARGE_REPLACES, MIN_NUMBERED_ATTACKS, assertLoadout, attackButtons, chargeOnlyAttacks, chargeReplacement,
  describeLoadout, hasChargeReplacements, loadoutProblems, midairAttack, numberedAttacks,
} from '../js/data/loadout.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { readMoveset } from '../js/game/combat-ai.js';
import { DT, cpuFight, duel, fakeSpritesOf, makeFighter } from './fighter-harness.mjs';
import { LOADOUT_CASES, WITH_EXTRA, loadoutFighter } from './loadout-fighters.mjs';
import { SAMPLE_FIGHTER } from './sample-fighter.mjs';

const DEF_0001 = getCharacter('0001');
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const CHARGE = { charge: true };
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

// Holds Charge for a few steps (a Charge since an earlier step), then
// presses `button` with Charge still held; returns the fighter.
function chargedPress(d, button) {
  for (let i = 0; i < 5; i++) d.tick(CHARGE);
  assert.equal(d.attacker.charging, true, 'in Charge');
  d.tick({ ...CHARGE, ...P(button) });
  return d.attacker;
}

// ---- The matrix ------------------------------------------------------------------

for (const c of LOADOUT_CASES) {
  const label = `Case ${c.name}: ${c.count} attacks${c.charge ? ' + Charge' : ', no Charge'}`;

  test(`${label}: buttons ${c.buttons.join(', ')}${c.chargeOnly.length ? `; Charge reaches ${c.chargeOnly.join(', ')}` : ''}`, () => {
    const def = c.def;
    assert.deepEqual(loadoutProblems(def), [], 'it keeps every rule');
    assert.deepEqual(numberedAttacks(def), NUMBERED_ATTACKS.slice(0, c.count), 'attack1 to its highest, in a row');
    assert.deepEqual(attackButtons(def), c.buttons, 'the buttons of its own');
    assert.deepEqual(chargeOnlyAttacks(def), c.chargeOnly);
    assert.equal(hasChargeReplacements(def), c.charge);
    assert.deepEqual(describeLoadout(def), {
      numbered: NUMBERED_ATTACKS.slice(0, c.count),
      buttons: c.buttons,
      air: Object.fromEntries(c.buttons.map((b) => [b, `midair_${b}`])),
      charge: c.charged,
      extra: false,
    });
    // Every button is { ground: attackN, air: midair_attackN }; a numbered
    // attack only Charge reaches has no button and needs no mid-air version.
    for (const button of c.buttons) {
      assert.deepEqual(def.actions[button], { ground: button, air: midairAttack(button) }, button);
      assert.ok(def.attacks[midairAttack(button)], `${button} has its mid-air version`);
    }
    for (const id of c.chargeOnly) {
      assert.equal(def.actions[id], undefined, `${id}: no button`);
      assert.equal(def.attacks[midairAttack(id)], undefined, `${id}: no mid-air version needed`);
      assert.equal(def.animations[midairAttack(id)], undefined);
    }
    for (const [button, id] of Object.entries(c.charged)) {
      assert.equal(chargeReplacement(def, button).id, id, `Charge + ${button} -> ${id}`);
      assert.equal(CHARGE_REPLACES[button], id, 'the one rule for every character');
    }
  });

  test(`${label}: each button makes its own attack on the ground and its mid-air one in the air; nothing else presses`, () => {
    for (const button of COMBAT_ACTIONS) {
      const ground = fighterOf(c.def);
      ground.step(P(button));
      const air = airborne(c.def);
      air.step(P(button));
      if (c.buttons.includes(button)) {
        assert.equal(ground.fighter.combat.attack?.def.id, button, `${button} on the ground`);
        assert.equal(air.fighter.combat.attack?.def.id, midairAttack(button), `${button} in the air`);
        assert.equal(ground.fighter.combat.attack.def.damage, Number(button.slice(6)), 'its own data');
      } else {
        // A button it does not have (a charge-only attack3 or attack4,
        // attack5 of a smaller fighter, its reserved or missing extras).
        assert.equal(ground.fighter.combat.attack, null, `${button}: nothing on the ground`);
        assert.equal(air.fighter.combat.attack, null, `${button}: nothing in the air`);
        assert.equal(ground.fighter.summons.length + (ground.fighter.technique ? 1 : 0), 0, `${button}: no Charge replacement either`);
      }
    }
  });

  test(`${label}: while Charging, each button makes its Charge replacement, or its own attack where it has none`, () => {
    for (const button of c.buttons) {
      const d = duel({ attackerCharacter: c.def, attackerSprites: fakeSpritesOf(c.def), gap: 150 });
      const f = chargedPress(d, button);
      const id = c.charged[button];
      if (id === 'attack3') {
        assert.equal(f.combat.attack, null, 'no normal attack');
        assert.ok(f.combat.chargedCooldowns.active('attack3'), 'attack3, the summon, with its cooldown');
        assert.equal(d.clones.length, 1, 'its clone');
        assert.equal(d.clones[0].attackDef.id, 'attack1');
      } else if (id === 'attack4') {
        assert.equal(f.technique?.def.id, 'attack4', 'attack4, the technique');
        assert.ok(f.combat.chargedCooldowns.active('attack4'));
      } else {
        assert.equal(f.combat.attack?.def.id, button, `no Charge replacement on ${button}: ${button} itself`);
        assert.equal(f.combat.chargedCooldowns.size, 0);
      }
    }
    // Pressing a charge-only attack's own codename while Charging does
    // nothing: it is reached through its button only.
    for (const id of c.chargeOnly) {
      const d = duel({ attackerCharacter: c.def, attackerSprites: fakeSpritesOf(c.def), gap: 150 });
      const f = chargedPress(d, id);
      assert.equal(f.combat.attack, null, id);
      assert.equal(f.combat.chargedCooldowns.size, 0, id);
      assert.equal(f.charging, true, `${id}: still charging, nothing happened`);
    }
  });
}

test('Case F: attack5 is an ordinary third button beside the Charge replacements, midair_attack5 in the air, and it hits', () => {
  const F = LOADOUT_CASES.find((c) => c.name === 'F').def;
  const air = airborne(F);
  air.step(P('attack5'));
  assert.equal(air.fighter.combat.attack.def.id, 'midair_attack5');
  const d = duel({ attackerCharacter: F, attackerSprites: fakeSpritesOf(F) });
  d.tick(P('attack5'));
  d.until(() => d.events.length > 0);
  assert.deepEqual([d.events[0].type, d.events[0].move, d.events[0].damage], ['hit', 'attack5', 5]);
  // Charging does not change what attack5 does: it has no replacement.
  const charged = duel({ attackerCharacter: F, attackerSprites: fakeSpritesOf(F), gap: 150 });
  assert.equal(chargedPress(charged, 'attack5').combat.attack?.def.id, 'attack5');
});

test('#0001 is Case E with an extra attack: four numbered attacks and Charge, attack1 and attack2 its only numbered buttons', () => {
  const E = LOADOUT_CASES.find((c) => c.name === 'E');
  const own = describeLoadout(DEF_0001);
  assert.deepEqual({ ...own, extra: false }, describeLoadout(E.def));
  assert.equal(own.extra, true);
  assert.deepEqual(own.charge, { attack1: 'attack3', attack2: 'attack4' });
  assert.deepEqual(chargeOnlyAttacks(DEF_0001), ['attack3', 'attack4']);
  assert.deepEqual(attackButtons(DEF_0001), ['attack1', 'attack2'], 'no attack3 or attack4 button');
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

test('the CPU knows each fighter\'s buttons and Charge replacements from its loadout, never a charge-only attack as a button', () => {
  for (const c of LOADOUT_CASES) {
    const { fighter } = fighterOf(c.def);
    const moves = readMoveset(fighter);
    const pressed = new Set([...moves.melee, ...moves.ranged].map((m) => m.action));
    assert.deepEqual([...pressed].sort(), [...c.buttons].sort(), `Case ${c.name}: its buttons`);
    assert.deepEqual(moves.charged.map((m) => [m.action, m.id]), Object.entries(c.charged), `Case ${c.name}: Charge + button`);
    for (const id of c.chargeOnly) assert.ok(!pressed.has(id), `Case ${c.name}: never presses ${id} itself`);
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

test('a Case F CPU presses attack5 but never attack3 or attack4: it reaches them only as Charge + attack1 / attack2', () => {
  const F = LOADOUT_CASES.find((c) => c.name === 'F').def;
  let replacements = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { a, log } = cpuFight(F, DEF_0001, { seconds: 40, seed });
    const mine = log.get(a);
    assert.ok(mine.some((s) => s.attack5Pressed), `seed ${seed}: attack5 has a button`);
    assert.ok(!mine.some((s) => s.attack3Pressed || s.attack4Pressed), `seed ${seed}: no attack3 or attack4 button is ever pressed`);
    // Each Charge replacement starts on a step where Charge is held (and
    // was on the step before) and its button is pressed.
    mine.forEach((s, i) => {
      for (const id of s.charged.filter((c) => !(mine[i - 1]?.charged ?? []).includes(c))) {
        replacements++;
        const button = id === 'attack3' ? 'attack1' : 'attack2';
        assert.ok(s.charge && mine[i - 1]?.charge && s[`${button}Pressed`], `seed ${seed}: ${id} from Charge + ${button}`);
      }
    });
  }
  assert.ok(replacements > 0, 'it did use its Charge replacements');
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
  breaks((d) => { d.attacks.attack6 = { ...d.attacks.attack5, animation: 'attack5' }; }, /attacks\.attack6 is not a move codename/);
  breaks((d) => { d.chargeReplacements = { attack5: { type: 'summon', id: 'attack6' } }; }, /only attack1 \(-> attack3\) and attack2 \(-> attack4\)/);
});

test('the numbered attacks are contiguous, normal buttons and Charge replacements together', () => {
  // attack1, attack2, attack4: attack3 skipped.
  breaks((d) => { delete d.actions.attack3; delete d.actions.attack5; }, /are not attack1 to attack3 in a row/);
  // attack3 only from Charge, attack5 a button, attack4 nowhere.
  const D = LOADOUT_CASES.find((c) => c.name === 'D').def;
  breaks((d) => { d.actions.attack5 = { ground: 'attack5', air: 'midair_attack5' }; }, /not attack1 to attack4 in a row/, D);
});

test('every normal numbered button has its mid-air version, named midair_attackN, and both exist', () => {
  breaks((d) => { d.actions.attack3 = { ground: 'attack3' }; }, /actions\.attack3 must be \{ ground: 'attack3', air: 'midair_attack3' \}/);
  breaks((d) => { d.actions.attack3 = 'attack3'; }, /actions\.attack3 must be/);
  breaks((d) => { d.actions.attack3 = { ground: 'attack3', air: 'midair_attack1' }; }, /actions\.attack3 must be/);
  breaks((d) => { delete d.attacks.midair_attack4; }, /names attack "midair_attack4", which is not in `attacks`/);
  breaks((d) => { delete d.attacks.attack5; }, /names attack "attack5", which is not in `attacks`/);
  breaks((d) => { delete d.animations.midair_attack2; }, /attack "midair_attack2" plays "midair_attack2", which is not in `animations`/);
});

test('Charge replacements are attack3 from attack1 and attack4 from attack2, each a real summon or technique', () => {
  const E = LOADOUT_CASES.find((c) => c.name === 'E').def;
  breaks((d) => { d.chargeReplacements.attack1.id = 'attack4'; }, /chargeReplacements\.attack1 is attack3, not "attack4"/, E);
  breaks((d) => { d.chargeReplacements.attack2.type = 'projectile'; }, /has type "projectile"/, E);
  breaks((d) => { delete d.summons.attack3; }, /summons attack3, which is not in `summons`/, E);
  breaks((d) => { delete d.chargedTechniques.attack4; }, /performs attack4, which is not in `chargedTechniques`/, E);
  breaks((d) => { d.summons.attack3.attack = 'attack9'; }, /summon attack3 names attack "attack9"/, E);
  breaks((d) => { delete d.effectAnimations.attack3_object; }, /cloud "attack3_object" is not in `effectAnimations`/, E);
  breaks((d) => { delete d.animations.attack4_dash; }, /dashAnimation "attack4_dash" is not in `animations`/, E);
  // With Charge, attack3 is always attack1's replacement...
  breaks((d) => { d.chargeReplacements = { attack2: { type: 'technique', id: 'attack4' } }; }, /attack3 is Charge \+ attack1/, E);
  // ...and attack4 attack2's: never a button in its place.
  const D = LOADOUT_CASES.find((c) => c.name === 'D').def;
  breaks((d) => {
    d.actions.attack4 = { ground: 'attack4', air: 'midair_attack4' };
    d.attacks.attack4 = d.attacks.attack1;
    d.attacks.midair_attack4 = d.attacks.midair_attack1;
  }, /attack4 is Charge \+ attack2/, D);
  // A summon or technique no replacement names is refused too.
  breaks((d) => { d.summons.attack5 = d.summons.attack3; }, /summons\.attack5 is no Charge replacement's/, E);
});

test('attack3 and attack4 are ordinary buttons without Charge and Charge replacements with it; a charge-only attack gets a button only when authored as one', () => {
  const B = LOADOUT_CASES.find((c) => c.name === 'B').def;
  const D = LOADOUT_CASES.find((c) => c.name === 'D').def;
  assert.deepEqual(attackButtons(B), ['attack1', 'attack2', 'attack3']);
  assert.deepEqual(attackButtons(D), ['attack1', 'attack2']);
  // attack3 authored as a button as well as Charge + attack1: both, and the
  // button then needs its mid-air version like any other.
  const both = structuredClone({ ...D, animations: D.animations, attacks: D.attacks });
  both.actions.attack3 = { ground: 'attack3', air: 'midair_attack3' };
  both.attacks.attack3 = { ...both.attacks.attack1, animation: 'attack3' };
  both.animations.attack3 = D.animations.attack1;
  assert.ok(loadoutProblems(both).some((p) => /midair_attack3/.test(p)), 'its mid-air version is missing');
  both.attacks.midair_attack3 = { ...both.attacks.midair_attack1, animation: 'midair_attack3' };
  both.animations.midair_attack3 = D.animations.midair_attack1;
  assert.deepEqual(loadoutProblems(both), []);
  assert.deepEqual(attackButtons(both), ['attack1', 'attack2', 'attack3']);
  assert.deepEqual(chargeOnlyAttacks(both), []);
  assert.equal(chargeReplacement(both, 'attack1').id, 'attack3');
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
});

test('the engine goes by the loadout, never by an attack\'s number: no character or attack special-cased', () => {
  for (const file of ['js/game/character.js', 'js/game/combat-ai.js', 'js/game/touch-controls.js', 'js/ui/mobile-abilities.js', 'js/game/fighter-status.js']) {
    const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'000\d'/, `${file}: no fighter id`);
    assert.doesNotMatch(code, /===?\s*'attack[3-5]'|'attack[3-5]'\s*===?/, `${file}: no attack3 to attack5 special case`);
  }
});
