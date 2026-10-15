// Run with node --test tests/systems/controller-profiles.test.mjs (no dependencies).
// Controller profiles: the actions a controller can give each fighter,
// read from its definition (never its id); the universal defaults, the same
// for every fighter; each playable fighter's own authored layout (complete,
// valid and free of conflicts) and the fallback a new fighter gets;
// bindings and their checks; conflicts (and the shared buttons that are
// not conflicts); stored profiles, malformed data included; and the shared
// controller engine never naming a fighter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTERS, playableCharacters, getCharacter } from '../../js/data/characters.js';
import {
  controllerActions, recommendedProfile, resolveProfile, fallbackLayout, normalizeBinding, profileConflicts,
  hasBlockingConflict, controllerLayoutProblems, sanitizeStoredProfiles, sanitizeStoredProfile, UNIVERSAL_DEFAULTS,
  UNIVERSAL_ACTIONS, CATEGORIES, ACTIVATIONS, DIRECTIONS, MOVEMENT_SOURCES, HOLD_THRESHOLD, actionMap, hasAuthoredLayout, ACTION_ID,
} from '../../js/data/controller-profiles.js';
import { LOADOUT_CASES, WITH_EXTRA } from '../fighters/fixtures/loadout-fighters.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { FUTURE_FIGHTER } from '../fighters/fixtures/offense-fighters.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const b = (button, { modifier = null, direction = null, activation = 'press' } = {}) => ({ button, modifier, direction, activation });
const ids = (def) => controllerActions(def).map((a) => a.id);

// ---- The actions -------------------------------------------------------------------------

test('the vocabulary: universal actions, editor categories, activations, directions and movement sources', () => {
  assert.deepEqual([...UNIVERSAL_ACTIONS], ['move', 'jump', 'dash', 'fastFall', 'shield', 'deflect', 'pause']);
  assert.deepEqual([...CATEGORIES], ['movement', 'defense', 'ground', 'air', 'abilities', 'other']);
  assert.deepEqual([...ACTIVATIONS], ['press', 'hold', 'continuous']);
  assert.deepEqual([...DIRECTIONS], ['left', 'right', 'up', 'down', 'horizontal']);
  assert.deepEqual([...MOVEMENT_SOURCES], ['leftStick', 'dpad', 'leftStickDpad', 'rightStick']);
  assert.ok(HOLD_THRESHOLD > 0 && HOLD_THRESHOLD <= 0.3, 'a short hold');
});

test('the universal defaults are the comfortable ones and the same for every fighter', () => {
  assert.deepEqual(UNIVERSAL_DEFAULTS.move, { source: 'leftStick' });
  assert.deepEqual(UNIVERSAL_DEFAULTS.jump, b('south', { activation: 'continuous' }), 'Cross / A, held for the higher jump');
  assert.deepEqual(UNIVERSAL_DEFAULTS.dash, b('l1'), 'L1 / LB: the right thumb stays on the attacks');
  assert.deepEqual(UNIVERSAL_DEFAULTS.fastFall, b(null, { direction: 'down', activation: 'continuous' }), 'the stick down');
  assert.deepEqual(UNIVERSAL_DEFAULTS.shield, b('east', { activation: 'continuous' }), 'Circle / B held');
  assert.deepEqual(UNIVERSAL_DEFAULTS.deflect, b('east'), 'Circle / B pressed, in the air');
  assert.deepEqual(UNIVERSAL_DEFAULTS.pause, b('start'), 'Options / Menu');
  for (const def of playableCharacters()) {
    const { bindings } = recommendedProfile(def);
    for (const id of UNIVERSAL_ACTIONS) {
      if (bindings[id]) assert.deepEqual(bindings[id], UNIVERSAL_DEFAULTS[id], `#${def.id} ${id}`);
    }
  }
});

test('#0001\'s actions are read from its definition: its moves where they really are, its two Specials apart, no slot it lacks', () => {
  const def = getCharacter('0001');
  assert.deepEqual(ids(def), [
    'move', 'jump', 'dash', 'fastFall', 'shield', 'deflect',
    'ground:attack1', 'ground:attack2', 'ground:attack3', 'ground:extra_attack',
    'air:attack1', 'air:attack2', 'air:attack3', 'air:extra_attack',
    'ground:attack4', 'ground:attack5',
    'pause',
  ]);
  const byId = actionMap(controllerActions(def));
  assert.equal(byId.get('ground:attack2').category, 'ground', 'Red throws a projectile, and is an ordinary ground attack for all that');
  assert.equal(byId.get('ground:attack3').category, 'ground', 'Maximum Blue too');
  assert.equal(byId.get('ground:attack4').category, 'abilities', 'Unlimited Void: Special');
  assert.equal(byId.get('ground:attack5').category, 'abilities', 'Hollow Purple: Special');
  assert.equal(byId.get('ground:attack4').special, 'technique', 'its execution type is unchanged');
  assert.equal(byId.get('air:attack2').move, 'midair_attack2');
  assert.equal(byId.get('air:extra_attack').move, 'extra_attack', 'the High Kick works in the air too');
  assert.ok(!byId.has('ground:transform') && !byId.has('air:transform') && !byId.has('air:attack4'), 'no Transform, nothing ground-only in the air');
});

test('#0002\'s actions: three ordinary attacks both ways, a ground-only Whirlwind, no attack4 or attack5', () => {
  const def = getCharacter('0002');
  assert.deepEqual(ids(def), [
    'move', 'jump', 'dash', 'fastFall', 'shield', 'deflect',
    'ground:attack1', 'ground:attack2', 'ground:attack3', 'ground:extra_attack',
    'air:attack1', 'air:attack2', 'air:attack3',
    'pause',
  ]);
  const actions = controllerActions(def);
  assert.equal(actionMap(actions).get('ground:extra_attack').category, 'ground', 'the Whirlwind\'s tornado is an ordinary ground attack');
  assert.ok(!actions.some((a) => a.category === 'abilities'), 'no Special at all');
});

test('any loadout gets exactly the actions it has: summons and techniques on the ground only, no Shield or Deflect it lacks', () => {
  for (const c of LOADOUT_CASES) {
    const actions = actionMap(controllerActions(c.def));
    for (const button of c.buttons) {
      assert.ok(actions.has(`ground:${button}`), `case ${c.name}: ground ${button}`);
      assert.equal(actions.has(`air:${button}`), c.types[button] === 'attack', `case ${c.name}: air ${button}`);
    }
    for (const missing of ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'].filter((x) => !c.buttons.includes(x))) {
      assert.ok(!actions.has(`ground:${missing}`), `case ${c.name}: no ${missing}`);
    }
  }
  assert.ok(ids(WITH_EXTRA).includes('ground:extra_attack'));
  const noDefense = { ...SAMPLE_FIGHTER, defense: undefined, deflect: undefined };
  assert.ok(!ids(noDefense).includes('shield') && !ids(noDefense).includes('deflect'));
  // No fighter at all: the universal actions only.
  assert.deepEqual(ids(null), ['move', 'jump', 'dash', 'fastFall', 'shield', 'deflect', 'pause']);
});

// ---- Authored layouts ------------------------------------------------------------------

test('every playable fighter ships a complete, valid, conflict-free layout designed for it', () => {
  for (const def of playableCharacters()) {
    assert.ok(hasAuthoredLayout(def), `#${def.id} authors its layout`);
    assert.deepEqual(controllerLayoutProblems(def), [], `#${def.id}`);
    const { bindings, authored } = recommendedProfile(def);
    assert.equal(authored, true, `#${def.id}: every move designed`);
    assert.deepEqual(profileConflicts(controllerActions(def), bindings), [], `#${def.id}: no conflict, not even a warning`);
  }
});

test('#0001\'s recommended layout: punch and kick on single face buttons, projectiles behind R2, Void behind L2, Blue on R1 in the air', () => {
  const { bindings } = recommendedProfile(getCharacter('0001'));
  assert.deepEqual(bindings['ground:attack1'], b('west'), 'Jab: Square');
  assert.deepEqual(bindings['ground:extra_attack'], b('north'), 'High Kick: Triangle');
  assert.deepEqual(bindings['ground:attack2'], b('west', { modifier: 'r2' }), 'Red: R2 + Square');
  assert.deepEqual(bindings['ground:attack3'], b('east', { modifier: 'r2' }), 'Maximum Blue: R2 + Circle');
  assert.deepEqual(bindings['ground:attack4'], b('north', { modifier: 'l2' }), 'Unlimited Void: L2 + Triangle');
  assert.deepEqual(bindings['ground:attack5'], b('north', { modifier: 'r2' }), 'Hollow Purple: R2 + Triangle');
  assert.deepEqual(bindings['air:attack1'], b('west'), 'Floating Straight: Square');
  assert.deepEqual(bindings['air:attack2'], b('north'), 'Red Kick: Triangle');
  assert.deepEqual(bindings['air:attack3'], b('r1'), 'Blue: R1');
  assert.deepEqual(bindings['air:extra_attack'], b('west', { modifier: 'l2' }), 'aerial High Kick: L2 + Square');
});

test('#0002\'s recommended layout: Square and Triangle on the ground, R1 for both spins, the stick picking Homing or Bounce', () => {
  const { bindings } = recommendedProfile(getCharacter('0002'));
  assert.deepEqual(bindings['ground:attack1'], b('west'), 'One-Two: Square');
  assert.deepEqual(bindings['ground:attack2'], b('north'), 'Rapid Kicks: Triangle');
  assert.deepEqual(bindings['ground:attack3'], b('r1'), 'Spin Attack: R1');
  assert.deepEqual(bindings['ground:extra_attack'], b('north', { modifier: 'r2' }), 'Whirlwind: R2 + Triangle');
  assert.deepEqual(bindings['air:attack1'], b('west'), 'Homing Attack: Square, any direction');
  assert.deepEqual(bindings['air:attack2'], b('west', { direction: 'down' }), 'Bounce Attack: Down + Square');
  assert.deepEqual(bindings['air:attack3'], b('r1'), 'Blue Tornado: R1, the Spin Attack\'s button in the air');
});

test('a layout that is incomplete, names a move the fighter lacks, retunes a universal action or conflicts is refused', () => {
  const base = getCharacter('0002');
  const layout = base.controller.layout;
  const without = { ...layout };
  delete without['air:attack3'];
  const cases = [
    [{ layout: without }, /no binding for air:attack3/],
    [{ layout: { ...layout, 'ground:attack4': b('r1') } }, /not one of its moves/],
    [{ layout: { ...layout, jump: b('north') } }, /not one of its moves|universal/],
    [{ layout: { ...layout, 'ground:attack1': b('zz') } }, /not a valid binding/],
    [{ layout: { ...layout, 'ground:attack3': b('north') } }, /conflict/],
    [{ layout, colour: 'blue' }, /unknown field/],
    ['layout', /must be an object/],
  ];
  for (const [controller, problem] of cases) {
    const problems = controllerLayoutProblems({ ...base, controller });
    assert.ok(problems.some((p) => problem.test(p)), `${JSON.stringify(controller).slice(0, 60)}: ${problems.join('; ')}`);
  }
  // No layout at all is not a problem: the fighter gets the fallback.
  assert.deepEqual(controllerLayoutProblems({ ...base, controller: undefined }), []);
});

test('a new fighter with no layout gets a safe, editable fallback, flagged as not designed yet', () => {
  // The test fighters copy #0001's definition: without its layout, they are
  // fighters nobody has designed one for.
  const bare = (def) => ({ ...def, controller: undefined });
  for (const def of [SAMPLE_FIGHTER, FUTURE_FIGHTER, ...LOADOUT_CASES.map((c) => c.def), WITH_EXTRA].map(bare)) {
    assert.equal(hasAuthoredLayout(def), false, def.id);
    const actions = controllerActions(def);
    const { bindings, authored } = recommendedProfile(def);
    assert.equal(authored, false, `${def.id}: a fallback, not a design`);
    for (const a of actions) assert.ok(bindings[a.id], `${def.id}: ${a.id} has an input`);
    assert.deepEqual(profileConflicts(actions, bindings).filter((c) => c.severity === 'error'), [], `${def.id}: no conflict`);
    // Never a universal default's input in the same place.
    const fallback = fallbackLayout(def);
    for (const [id, binding] of Object.entries(fallback)) {
      assert.ok(!(binding.button === 'south' && !binding.modifier), `${id}: not Jump's button`);
      assert.ok(!(binding.button === 'l1' && !binding.modifier), `${id}: not the Dash's`);
    }
  }
  // Partly authored: the rest falls back, around the authored inputs.
  const partial = { ...getCharacter('0002'), controller: { layout: { 'ground:attack1': b('north'), 'air:attack1': b('r1') } } };
  const { bindings, authored } = recommendedProfile(partial);
  assert.equal(authored, false);
  assert.ok(bindings['air:attack3']);
  assert.deepEqual(profileConflicts(controllerActions(partial), bindings), []);
  // A layout made for another fighter (a copy's) keeps what fits, fills in
  // the rest and never conflicts with itself. (The sample fighter's moves
  // all fit the layout it copies.)
  assert.equal(recommendedProfile(SAMPLE_FIGHTER).authored, true, 'every move it has finds its input in #0001\'s layout');
  for (const def of [SAMPLE_FIGHTER, FUTURE_FIGHTER]) {
    const inherited = recommendedProfile(def);
    assert.deepEqual(profileConflicts(controllerActions(def), inherited.bindings).filter((c) => c.severity === 'error'), [], def.id);
  }
});

// ---- Bindings --------------------------------------------------------------------------------

test('a binding is checked against its action: buttons, modifiers, directions and activations it allows', () => {
  const actions = actionMap(controllerActions(getCharacter('0001')));
  const red = actions.get('ground:attack2');
  assert.deepEqual(normalizeBinding(red, b('west', { modifier: 'r2' })), b('west', { modifier: 'r2' }));
  assert.deepEqual(normalizeBinding(red, b('west', { direction: 'left', activation: 'hold' })), b('west', { direction: 'left', activation: 'hold' }));
  for (const bad of [
    b('nope'), b('west', { modifier: 'west' }), b('west', { modifier: 'x' }), b('west', { direction: 'diagonal' }),
    b('west', { activation: 'continuous' }), b(null), null, 'west', [],
  ]) {
    assert.equal(normalizeBinding(red, bad), null, JSON.stringify(bad));
  }
  // The Shield stays held, Jump keeps its held higher jump, Pause stays a press.
  assert.equal(normalizeBinding(actions.get('shield'), b('east')), null);
  assert.ok(normalizeBinding(actions.get('shield'), b('l2', { activation: 'continuous' })));
  assert.equal(normalizeBinding(actions.get('jump'), b('south', { activation: 'hold' })), null);
  assert.equal(normalizeBinding(actions.get('pause'), b('start', { activation: 'continuous' })), null);
  // The Dash takes its direction from the stick: no direction of its own.
  assert.equal(normalizeBinding(actions.get('dash'), b('l1', { direction: 'left' })), null);
  // Only the Fast fall may be a direction alone.
  assert.ok(normalizeBinding(actions.get('fastFall'), b(null, { direction: 'down', activation: 'continuous' })));
  assert.ok(normalizeBinding(actions.get('fastFall'), b('r1', { activation: 'continuous' })), 'or a button');
  assert.equal(normalizeBinding(red, b(null, { direction: 'down' })), null);
  // Movement: a source.
  assert.deepEqual(normalizeBinding(actions.get('move'), { source: 'dpad' }), { source: 'dpad' });
  assert.equal(normalizeBinding(actions.get('move'), { source: 'mouse' }), null);
});

// ---- Conflicts --------------------------------------------------------------------------------

test('conflicts: the same input twice where both apply is an error; a modifier that is also a button is a warning', () => {
  const def = getCharacter('0001');
  const actions = controllerActions(def);
  const { bindings } = recommendedProfile(def);
  // Two ground attacks on Square.
  let c = profileConflicts(actions, { ...bindings, 'ground:extra_attack': b('west') });
  assert.deepEqual(c.map((x) => [x.severity, x.type, x.actions.sort().join('+'), x.button]), [['error', 'same', 'ground:attack1+ground:extra_attack', 'west']]);
  assert.equal(hasBlockingConflict(c), true);
  // Jump (everywhere) on an air attack's button.
  c = profileConflicts(actions, { ...bindings, jump: b('r1', { activation: 'continuous' }) });
  assert.ok(c.some((x) => x.type === 'same' && x.actions.includes('air:attack3')));
  // A D-pad button while the D-pad moves.
  c = profileConflicts(actions, { ...bindings, move: { source: 'dpad' }, 'air:attack3': b('dpadUp') });
  assert.deepEqual(c.map((x) => [x.type, x.actions[0], x.button]), [['movement', 'air:attack3', 'dpadUp']]);
  // R2 held for Red while R2 alone is the Spin... warning only.
  c = profileConflicts(actions, { ...bindings, 'ground:extra_attack': b('r2') });
  assert.ok(c.length && c.every((x) => x.severity === 'warning' && x.type === 'modifier'));
  assert.equal(hasBlockingConflict(c), false);
});

test('shared buttons that resolve one way are not conflicts', () => {
  const two = getCharacter('0002');
  const one = getCharacter('0001');
  // Spin Attack and Blue Tornado on R1 (ground / air); the Shield and the
  // Deflect on Circle; Whirlwind's R2 + Triangle beside Triangle; Bounce's
  // Down + Square beside Square.
  assert.deepEqual(profileConflicts(controllerActions(two), recommendedProfile(two).bindings), []);
  // A combination beside its plain button, and a direction beside none.
  const actions = controllerActions(one);
  const { bindings } = recommendedProfile(one);
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'ground:extra_attack': b('west', { direction: 'up' }) }), []);
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'air:attack2': b('west', { direction: 'horizontal' }) }), [],
    'left-or-right beside anywhere: the more specific wins');
  // The same direction is ambiguous again.
  assert.ok(hasBlockingConflict(profileConflicts(actions, {
    ...bindings, 'air:attack2': b('west', { direction: 'down' }), 'air:attack1': b('west', { direction: 'down' }),
  })));
});

// ---- Stored profiles ------------------------------------------------------------------------

test('a stored profile is checked entry by entry: malformed bindings and unknown actions drop, never the rest', () => {
  const raw = {
    '0001': {
      jump: b('north', { activation: 'continuous' }),
      'ground:attack2': b('west', { modifier: 'l2' }),
      'air:attack9': b('west'),
      bogus: b('west'),
      dash: { button: 'east', activation: 'sometimes' },
      move: { source: 'dpad' },
      shield: 'circle',
    },
    '0002': 'not an object',
    'bad id!': { jump: b('south', { activation: 'continuous' }) },
    '0003': {},
  };
  assert.deepEqual(sanitizeStoredProfiles(raw), {
    '0001': {
      jump: b('north', { activation: 'continuous' }),
      'ground:attack2': b('west', { modifier: 'l2' }),
      move: { source: 'dpad' },
    },
  });
  for (const junk of [null, undefined, 'x', 3, [], [{}]]) assert.deepEqual(sanitizeStoredProfiles(junk), {});
  assert.deepEqual(sanitizeStoredProfile({ jump: { button: 'south', modifier: 'south', activation: 'continuous' } }), {});
});

test('a profile saved before Transform was removed loses its ground:transform and air:transform bindings, and keeps every other', () => {
  const kept = {
    move: { source: 'dpad' },
    'ground:attack1': b('r3'),
    'air:attack1': b('r3'),
  };
  const raw = {
    '0001': { ...kept, 'ground:transform': b('west', { modifier: 'l2' }), 'air:transform': b('north', { modifier: 'l2' }) },
    '0002': { 'ground:transform': b('r1') },
  };
  assert.deepEqual(sanitizeStoredProfiles(raw), { '0001': kept }, 'a profile with nothing else left is gone');
  for (const id of ['ground:transform', 'air:transform']) assert.equal(ACTION_ID.test(id), false, `${id} is no action id`);
  for (const id of ['ground:attack1', 'air:extra_attack', 'shield']) assert.equal(ACTION_ID.test(id), true, id);
  // Resolved against the fighter: its other saved bindings as saved, no
  // Transform action to bind, offer or conflict with.
  const def = getCharacter('0001');
  const p = resolveProfile(def, sanitizeStoredProfile(raw['0001']));
  for (const [id, binding] of Object.entries(kept)) assert.deepEqual(p.bindings[id], binding, id);
  assert.equal(p.customized, true);
  assert.ok(!Object.keys(p.bindings).some((id) => /transform/.test(id)));
  assert.deepEqual(profileConflicts(controllerActions(def), p.bindings).filter((c) => c.severity === 'error'), []);
  for (const c of CHARACTERS) assert.ok(controllerActions(c).every((a) => !/transform/.test(a.id)), `#${c.id}: never offered for binding`);
});

test('a saved profile resolves against the fighter: what fits it is used, what does not falls back to the recommended binding', () => {
  const def = getCharacter('0001');
  const { bindings: recommended } = recommendedProfile(def);
  const p = resolveProfile(def, {
    jump: b('north', { activation: 'continuous' }),
    shield: b('east'), // a Shield that is not held: refused
    'ground:attack5': b('r3'),
  });
  assert.deepEqual(p.bindings.jump, b('north', { activation: 'continuous' }));
  assert.deepEqual(p.bindings.shield, recommended.shield);
  assert.deepEqual(p.bindings['ground:attack5'], b('r3'));
  assert.equal(p.customized, true);
  assert.equal(resolveProfile(def, null).customized, false);
  assert.equal(resolveProfile(def, recommended).customized, false, 'a saved copy of the recommended layout is not custom');
  assert.equal(p.character, '0001');
});

// ---- The shared engine is generic --------------------------------------------------------

test('the shared controller engine never names a fighter: its layouts come from the definitions', () => {
  for (const file of [
    'js/data/controller-profiles.js', 'js/core/controller-resolver.js', 'js/core/controller-manager.js',
    'js/core/gamepad-devices.js', 'js/core/input-manager.js', 'js/ui/controller-editor.js', 'js/ui/controller-glyphs.js',
    'js/ui/controller-dialog.js', 'js/ui/controller-cursor.js',
  ]) {
    const code = read(file).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'000\d'|"000\d"|#000\d|Jab|Hollow Purple|Homing|Blue Tornado|Whirlwind/, file);
  }
  // Each layout lives in its own fighter's definition.
  for (const def of CHARACTERS) {
    assert.ok(read(`js/data/characters/${def.id}.js`).includes('controller: {'), `#${def.id}`);
  }
});
