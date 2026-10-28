// Run with node --test tests/systems/controller-profiles.test.mjs (no dependencies).
// Controller profiles: the actions a controller can give each fighter,
// read from its definition (never its id); the universal defaults, the same
// for every fighter; each playable fighter's own authored layout (complete,
// valid, free of conflicts, every move one input) and the fallback a new
// fighter gets; bindings and their checks (each direction naming its own
// stick, stick inputs, either stick); conflicts (and the shared inputs that
// are not conflicts); stored profiles, malformed data included, and the
// upgrade of profiles saved before the sticks were named; and the shared
// controller engine never naming a fighter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTERS, playableCharacters, getCharacter } from '../../js/data/characters.js';
import {
  controllerActions, recommendedProfile, resolveProfile, fallbackLayout, normalizeBinding, profileConflicts,
  hasBlockingConflict, controllerLayoutProblems, sanitizeStoredProfiles, sanitizeStoredProfile, UNIVERSAL_DEFAULTS,
  UNIVERSAL_ACTIONS, CATEGORIES, ACTIVATIONS, DIRECTIONS, MOVEMENT_SOURCES, STICKS, HOLD_THRESHOLD, actionMap, hasAuthoredLayout, ACTION_ID,
  upgradeStoredProfile, upgradeStoredProfiles, LEGACY_UNIVERSAL_DEFAULTS, stickAtoms, directionsMeet, movementButtons,
  COMFORT_INPUTS, comfortProblems, assertControllerLayout,
} from '../../js/data/controller-profiles.js';
import { PAD_BUTTONS } from '../../js/core/gamepad-devices.js';
import { LOADOUT_CASES, WITH_EXTRA } from '../fighters/fixtures/loadout-fighters.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';
import { FUTURE_FIGHTER } from '../fighters/fixtures/offense-fighters.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const b = (button, { modifier = null, stick = null, direction = null, activation = 'press' } = {}) => ({ button, modifier, stick, direction, activation });
// A stick input: `stick` (the right stick by default) pushed `direction`.
const flick = (direction, { stick = 'rightStick', modifier = null, activation = 'press' } = {}) => b(null, { modifier, stick, direction, activation });
// A binding as profiles saved before the sticks were named stored it.
const legacy = (button, { modifier = null, direction = null, activation = 'press' } = {}) => ({ button, modifier, direction, activation });
const ids = (def) => controllerActions(def).map((a) => a.id);

// ---- The actions -------------------------------------------------------------------------

test('the vocabulary: universal actions, editor categories, activations, directions, sticks and movement sources', () => {
  assert.deepEqual([...UNIVERSAL_ACTIONS], ['move', 'jump', 'dash', 'fastFall', 'shield', 'deflect', 'pause']);
  assert.deepEqual([...CATEGORIES], ['movement', 'defense', 'ground', 'air', 'abilities', 'other']);
  assert.deepEqual([...ACTIVATIONS], ['press', 'hold', 'continuous']);
  assert.deepEqual([...DIRECTIONS], ['up', 'down', 'left', 'right', 'horizontal', 'forward', 'back']);
  assert.deepEqual([...MOVEMENT_SOURCES], ['leftStick', 'dpad', 'leftStickDpad', 'rightStick']);
  assert.deepEqual([...STICKS], ['leftStick', 'dpad', 'leftStickDpad', 'rightStick'], 'either stick, the D-pad, or both of the left ones');
  assert.ok(HOLD_THRESHOLD > 0 && HOLD_THRESHOLD <= 0.3, 'a short hold');
  // Every button the standard mapping names is a button a player can bind.
  assert.deepEqual([...PAD_BUTTONS], [
    'south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
  ]);
});

test('the universal defaults are chosen together, and the same for every fighter', () => {
  assert.deepEqual(UNIVERSAL_DEFAULTS.move, { source: 'leftStick' });
  assert.deepEqual(UNIVERSAL_DEFAULTS.jump, b('south', { activation: 'continuous' }), 'Cross / A, held (with the left stick down on the ground: the Super Jump)');
  assert.deepEqual(UNIVERSAL_DEFAULTS.dash, b('r1'), 'R1 / RB: the right index finger, the left thumb aiming, the right thumb free');
  assert.deepEqual(UNIVERSAL_DEFAULTS.fastFall, flick('down', { stick: 'leftStick', activation: 'continuous' }), 'the left stick down');
  assert.deepEqual(UNIVERSAL_DEFAULTS.shield, b('l1', { activation: 'continuous' }), 'L1 / LB held');
  assert.deepEqual(UNIVERSAL_DEFAULTS.deflect, b('l1'), 'L1 / LB pressed, in the air: one guard button');
  assert.deepEqual(UNIVERSAL_DEFAULTS.pause, b('start'), 'Options / Menu');
  // No two universal actions on one finger where both apply, and no face
  // button taken but Jump's: three are left to every fighter's moves.
  const universal = controllerActions(null);
  assert.deepEqual(profileConflicts(universal, UNIVERSAL_DEFAULTS), []);
  const faces = new Set(Object.values(UNIVERSAL_DEFAULTS).map((x) => x.button).filter((x) => ['west', 'north', 'east', 'south'].includes(x)));
  assert.deepEqual([...faces], ['south']);
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

test('every recommended move is one input: no combination, no direction to hold with a button, the right stick only for a move\'s own direction', () => {
  for (const def of playableCharacters()) {
    const { bindings } = recommendedProfile(def);
    for (const a of controllerActions(def).filter((x) => x.kind === 'attack')) {
      const x = bindings[a.id];
      assert.equal(x.modifier, null, `#${def.id} ${a.id}: no button to hold first`);
      assert.equal(x.activation, 'press', `#${def.id} ${a.id}: it acts as it goes down`);
      if (x.button !== null) assert.equal(x.direction, null, `#${def.id} ${a.id}: a button alone`);
      else {
        assert.equal(x.stick, 'rightStick', `#${def.id} ${a.id}: the right stick, never the stick that moves`);
        assert.ok(['up', 'down', 'forward'].includes(x.direction), `#${def.id} ${a.id}: up, down or forward`);
      }
      assert.ok(!['south', 'r1', 'l1', 'start'].includes(x.button), `#${def.id} ${a.id}: never a universal action's button`);
    }
  }
});

test('the same buttons mean the same kind of move across the roster: Square the quick strike everywhere, the right stick up rising, down driving down', () => {
  for (const def of playableCharacters()) {
    const { bindings } = recommendedProfile(def);
    assert.deepEqual(bindings['ground:attack1'], b('west'), `#${def.id}: its quick strike on Square / X`);
    assert.deepEqual(bindings['air:attack1'], b('west'), `#${def.id}: its basic aerial on Square / X`);
    for (const [id, x] of Object.entries(bindings)) {
      if (x?.button !== null || !x?.direction) continue;
      const [place, control] = id.split(':');
      const move = def.attacks?.[def.actions[control]?.[place] ?? def.actions[control]];
      const motion = move?.motion?.type;
      if (x.direction === 'up' && place === 'air') assert.equal(motion, 'rise', `#${def.id} ${id}: up in the air rises`);
      if (x.direction === 'down' && place === 'air') assert.ok(['slam', 'bounce'].includes(motion), `#${def.id} ${id}: down in the air plunges`);
    }
  }
});

test('#0001\'s recommended layout: the Jab and the High Kick on the face, Blue on Circle and Red on R2 both ways, Unlimited Void on L2, Hollow Purple forward on the right stick', () => {
  const { bindings } = recommendedProfile(getCharacter('0001'));
  assert.deepEqual(bindings['ground:attack1'], b('west'), 'Jab: Square');
  assert.deepEqual(bindings['ground:extra_attack'], b('north'), 'High Kick: Triangle, the Jab\'s follow-up');
  assert.deepEqual(bindings['ground:attack3'], b('east'), 'Maximum Blue: Circle');
  assert.deepEqual(bindings['ground:attack2'], b('r2'), 'Red: R2, fired');
  assert.deepEqual(bindings['ground:attack4'], b('l2'), 'Unlimited Void: L2');
  assert.deepEqual(bindings['ground:attack5'], flick('forward'), 'Hollow Purple: the right stick forward, the way the sphere flies');
  assert.deepEqual(bindings['air:attack1'], b('west'), 'Floating Straight: Square');
  assert.deepEqual(bindings['air:extra_attack'], b('north'), 'aerial High Kick: Triangle');
  assert.deepEqual(bindings['air:attack3'], b('east'), 'Blue: Circle, the attraction both ways');
  assert.deepEqual(bindings['air:attack2'], b('r2'), 'Red Kick: R2, Red\'s trigger in the air');
});

test('#0002\'s recommended layout: three strikes on the face, the Whirlwind on R2, the right stick up and down for its rising and plunging spins', () => {
  const { bindings } = recommendedProfile(getCharacter('0002'));
  assert.deepEqual(bindings['ground:attack1'], b('west'), 'One-Two: Square');
  assert.deepEqual(bindings['ground:attack2'], b('north'), 'Rapid Kicks: Triangle');
  assert.deepEqual(bindings['ground:attack3'], b('east'), 'Spin Attack: Circle, pressed on the run');
  assert.deepEqual(bindings['ground:extra_attack'], b('r2'), 'Whirlwind: R2');
  assert.deepEqual(bindings['air:attack1'], b('west'), 'Homing Attack: Square, whatever the stick says');
  assert.deepEqual(bindings['air:attack3'], flick('up'), 'Blue Tornado: the right stick up');
  assert.deepEqual(bindings['air:attack2'], flick('down'), 'Bounce Attack: the right stick down');
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
    // A combination, or the stick that moves, never gets as far as a
    // conflict: the comfort rules refuse it first.
    [{ layout: { ...layout, 'ground:attack1': b('north', { modifier: 'east' }) } }, /comfort rule 1/],
    [{ layout: { ...layout, 'ground:attack3': flick('forward'), 'ground:extra_attack': flick('forward') } }, /conflict \(same\)/],
    [{ layout: { ...layout, 'air:attack2': flick('up') } }, /comfort rule 5/],
    [{ layout: { ...layout, 'air:attack2': flick('left', { stick: 'leftStick' }) } }, /comfort rule 2/],
    [{ layout: { ...layout, 'ground:attack1': legacy('west', { direction: 'down' }) } }, /not a valid binding/],
    [{ layout, previous: 'old' }, /previous must be an object/],
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

// ---- The comfort rules ---------------------------------------------------------------------

test('the comfort rules are strict: the comfortable inputs are eight single ones, and every playable fighter keeps every rule', () => {
  assert.deepEqual(COMFORT_INPUTS.map((x) => (x.button ?? `${x.stick} ${x.direction}`)), [
    'west', 'north', 'east', 'r2', 'l2', 'rightStick up', 'rightStick down', 'rightStick forward',
  ]);
  for (const def of playableCharacters()) assert.deepEqual(comfortProblems(def, def.controller.layout), [], `#${def.id}`);
  // The registry runs them: they are part of the layout rules every
  // definition must pass to load.
  assert.match(read('js/data/controller-profiles.js'), /if \(!problems\.length\) problems\.push\(\.\.\.comfortProblems\(def, layout\)\);/);
  assert.match(read('js/data/characters.js'), /assertControllerLayout\(def\);/);
});

test('a layout that breaks a comfort rule is refused, for any fighter, now or to come', () => {
  const rule = (n) => new RegExp(`comfort rule ${n}`);
  const refused = (base, changes, n, why) => {
    const def = { ...base, controller: { layout: { ...base.controller.layout, ...changes } } };
    const problems = controllerLayoutProblems(def);
    assert.ok(problems.some((p) => rule(n).test(p)), `${why}: ${problems.join('; ') || 'accepted'}`);
    assert.throws(() => assertControllerLayout(def), /breaks the controller layout rules/, why);
  };
  const one = getCharacter('0001');
  const two = getCharacter('0002');
  const three = getCharacter('0003');
  const four = getCharacter('0004');
  // 1. One input a move.
  refused(one, { 'ground:attack2': b('r2', { modifier: 'l2' }) }, 1, 'a button held first');
  refused(one, { 'ground:attack2': b('r2', { stick: 'leftStick', direction: 'up' }) }, 1, 'a direction held with a button');
  refused(one, { 'ground:attack2': b('r2', { activation: 'hold' }) }, 1, 'a hold to activate');
  refused(one, { 'ground:attack5': flick('forward', { modifier: 'l2' }) }, 1, 'a stick with a button held first');
  // 2. Only the comfortable inputs.
  for (const bad of [b('dpadUp'), b('r3'), b('l3'), b('select'), flick('back'), flick('left'), flick('horizontal')]) {
    refused(one, { 'ground:attack5': bad }, 2, JSON.stringify(bad));
  }
  refused(one, { 'ground:attack5': flick('up', { stick: 'leftStick' }) }, 2, 'the left stick, the one that moves');
  // 3. Square never empty.
  refused(two, { 'air:attack1': flick('forward') }, 3, 'nothing on Square in the air');
  refused(one, { 'ground:attack1': b('l2'), 'ground:attack4': b('west', { modifier: 'r2' }) }, 3, 'Square only as part of a combination');
  // 4. Never one press away from the Void.
  refused(three, { 'air:attack2': b('north') }, 4, 'a plunge on a button');
  refused(four, { 'air:attack3': flick('forward') }, 4, 'a plunge on the stick, but not down');
  refused(two, { 'air:attack3': b('east') }, 4, 'a move that spends the airtime on a button');
  // 5. In the air the stick points the way the move goes.
  refused(two, { 'air:attack3': flick('down'), 'air:attack2': flick('up') }, 5, 'rise and plunge swapped');
  // A fighter to come, with moves of its own, is held to them as well.
  const future = {
    ...SAMPLE_FIGHTER, id: 'future-comfort',
    controller: { layout: Object.fromEntries(controllerActions(SAMPLE_FIGHTER).filter((a) => a.kind === 'attack').map((a, i) => [a.id, b('west', { modifier: i ? 'r2' : null })])) },
  };
  assert.ok(comfortProblems(future, future.controller.layout).some((p) => rule(1).test(p)), 'a future fighter of combinations is refused');
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
    assert.deepEqual(profileConflicts(actions, bindings), [], `${def.id}: not even a warning`);
    // Never a universal default's input, and every move one input.
    const fallback = fallbackLayout(def);
    for (const [id, binding] of Object.entries(fallback)) {
      assert.ok(!['south', 'r1', 'l1', 'start'].includes(binding.button), `${id}: not Jump's, the Dash's, the guard's or Pause's button`);
      assert.equal(binding.modifier, null, `${id}: no combination`);
      assert.ok(binding.button !== null || binding.stick === 'rightStick', `${id}: a stick input only on the stick that does not move`);
    }
  }
  // Partly authored: the rest falls back, around the authored inputs.
  const partial = { ...getCharacter('0002'), controller: { layout: { 'ground:attack1': b('north'), 'air:attack1': b('r3') } } };
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

test('a binding is checked against its action: buttons, modifiers, sticks, directions and activations it allows', () => {
  const actions = actionMap(controllerActions(getCharacter('0001')));
  const red = actions.get('ground:attack2');
  assert.deepEqual(normalizeBinding(red, b('west', { modifier: 'r2' })), b('west', { modifier: 'r2' }));
  assert.deepEqual(normalizeBinding(red, b('west', { stick: 'leftStick', direction: 'left', activation: 'hold' })), b('west', { stick: 'leftStick', direction: 'left', activation: 'hold' }));
  assert.deepEqual(normalizeBinding(red, b('west', { stick: 'rightStick', direction: 'forward' })), b('west', { stick: 'rightStick', direction: 'forward' }), 'a direction on the right stick, facing-relative');
  // Every physical button, on any move.
  for (const button of PAD_BUTTONS) assert.ok(normalizeBinding(red, b(button)), button);
  // Either stick alone, any direction, with or without a modifier.
  for (const stick of STICKS) {
    for (const direction of DIRECTIONS) assert.deepEqual(normalizeBinding(red, flick(direction, { stick })), flick(direction, { stick }), `${stick} ${direction}`);
  }
  assert.deepEqual(normalizeBinding(red, flick('up', { modifier: 'l2' })), flick('up', { modifier: 'l2' }), 'L2 + Right stick up');
  for (const bad of [
    b('nope'), b('west', { modifier: 'west' }), b('west', { modifier: 'x' }), b('west', { stick: 'leftStick', direction: 'diagonal' }),
    b('west', { direction: 'down' }), // a direction never reads "whatever moves": it names its stick
    b('west', { stick: 'leftStick' }), // a stick with no direction
    b('west', { stick: 'thirdStick', direction: 'up' }),
    b('west', { activation: 'continuous' }), b(null), b(null, { modifier: 'l2' }), null, 'west', [],
  ]) {
    assert.equal(normalizeBinding(red, bad), null, JSON.stringify(bad));
  }
  // The Shield stays held, Jump stays held (a launch steered up), Pause stays a press of a button.
  assert.equal(normalizeBinding(actions.get('shield'), b('east')), null);
  assert.ok(normalizeBinding(actions.get('shield'), b('l2', { activation: 'continuous' })));
  assert.ok(normalizeBinding(actions.get('shield'), flick('down', { activation: 'continuous' })), 'or a stick held');
  assert.equal(normalizeBinding(actions.get('jump'), b('south', { activation: 'hold' })), null);
  assert.ok(normalizeBinding(actions.get('jump'), flick('up', { stick: 'leftStick', activation: 'continuous' })), 'up on the stick, if the player wants it');
  assert.equal(normalizeBinding(actions.get('pause'), b('start', { activation: 'continuous' })), null);
  assert.equal(normalizeBinding(actions.get('pause'), flick('down')), null, 'Pause is a button');
  // The Dash takes its direction from the stick: no direction to hold with
  // its button, but a stick pushed may be its input (it then goes that way).
  assert.equal(normalizeBinding(actions.get('dash'), b('r1', { stick: 'leftStick', direction: 'left' })), null);
  assert.ok(normalizeBinding(actions.get('dash'), flick('horizontal')));
  // The Fast fall: the stick down, or a button.
  assert.ok(normalizeBinding(actions.get('fastFall'), flick('down', { stick: 'leftStick', activation: 'continuous' })));
  assert.ok(normalizeBinding(actions.get('fastFall'), b('r1', { activation: 'continuous' })), 'or a button');
  // Movement: a source.
  assert.deepEqual(normalizeBinding(actions.get('move'), { source: 'dpad' }), { source: 'dpad' });
  assert.equal(normalizeBinding(actions.get('move'), { source: 'mouse' }), null);
});

test('physical inputs: a stick direction is its stick\'s sides (the D-pad\'s are its buttons); forward and back meet left and right, never each other', () => {
  assert.deepEqual(stickAtoms('rightStick', 'up'), ['rightStick:up']);
  assert.deepEqual(stickAtoms('leftStick', 'horizontal'), ['leftStick:left', 'leftStick:right']);
  assert.deepEqual(stickAtoms('dpad', 'down'), ['dpadDown']);
  assert.deepEqual(stickAtoms('leftStickDpad', 'down'), ['leftStick:down', 'dpadDown']);
  assert.deepEqual(stickAtoms('rightStick', 'forward'), ['rightStick:left', 'rightStick:right']);
  assert.equal(directionsMeet('forward', 'left'), true);
  assert.equal(directionsMeet('forward', 'back'), false);
  assert.equal(directionsMeet('horizontal', 'back'), true);
  assert.equal(directionsMeet('up', 'forward'), false);
  assert.equal(directionsMeet('left', 'right'), false);
  // What moves the fighter takes only its left and right.
  assert.deepEqual(movementButtons('dpad'), ['dpadLeft', 'dpadRight']);
  assert.deepEqual(movementButtons('leftStick'), []);
});

// ---- Conflicts --------------------------------------------------------------------------------

test('conflicts: the same input twice where both apply is an error; a modifier that is also a button is a warning', () => {
  const def = getCharacter('0001');
  const actions = controllerActions(def);
  const { bindings } = recommendedProfile(def);
  // Two ground attacks on Square.
  let c = profileConflicts(actions, { ...bindings, 'ground:attack3': b('west') });
  assert.deepEqual(c.map((x) => [x.severity, x.type, x.actions.sort().join('+'), x.button]), [['error', 'same', 'ground:attack1+ground:attack3', 'west']]);
  assert.equal(hasBlockingConflict(c), true);
  // Jump (everywhere) on an air attack's button.
  c = profileConflicts(actions, { ...bindings, jump: b('r2', { activation: 'continuous' }) });
  assert.ok(c.some((x) => x.type === 'same' && x.actions.includes('air:attack2')));
  // A side of the D-pad while the D-pad moves; its up and down move nothing.
  c = profileConflicts(actions, { ...bindings, move: { source: 'dpad' }, 'air:attack2': b('dpadLeft') });
  assert.deepEqual(c.map((x) => [x.type, x.actions[0], x.button]), [['movement', 'air:attack2', 'dpadLeft']]);
  assert.deepEqual(profileConflicts(actions, { ...bindings, move: { source: 'dpad' }, 'air:attack2': b('dpadUp') }), [], 'D-pad up is free');
  assert.deepEqual(profileConflicts(actions, { ...bindings, move: { source: 'leftStickDpad' }, jump: b('dpadUp', { activation: 'continuous' }) }), []);
  // The moving stick's own left or right as an input: every run would set it off.
  c = profileConflicts(actions, { ...bindings, dash: flick('horizontal', { stick: 'leftStick' }) });
  assert.deepEqual(c.map((x) => [x.severity, x.type, x.stick, x.direction]), [['error', 'movement', 'leftStick', 'horizontal']]);
  assert.deepEqual(profileConflicts(actions, {
    ...bindings, move: { source: 'rightStick' }, dash: flick('horizontal', { stick: 'leftStick' }), 'ground:attack5': b('r3'),
  }), [], 'free once the right stick moves (and the right stick then moves, Hollow Purple elsewhere)');
  c = profileConflicts(actions, { ...bindings, move: { source: 'rightStick' } });
  assert.deepEqual(c.map((x) => [x.type, x.actions[0]]), [['movement', 'ground:attack5']], 'a right stick input while the right stick moves');
  // A modifier that is another action's button: a warning only.
  c = profileConflicts(actions, { ...bindings, 'ground:attack5': b('west', { modifier: 'r2' }) });
  assert.ok(c.length && c.every((x) => x.severity === 'warning' && x.type === 'modifier' && x.button === 'r2'));
  assert.equal(hasBlockingConflict(c), false);
  // A direction held with a button that is, on that stick, another action's stick input.
  c = profileConflicts(actions, { ...bindings, jump: flick('up', { stick: 'leftStick', activation: 'continuous' }), 'ground:attack1': b('west', { stick: 'leftStick', direction: 'up' }) });
  assert.deepEqual(c.map((x) => [x.severity, x.type, x.actions.join('+'), x.stick, x.direction]), [['warning', 'direction', 'ground:attack1+jump', 'leftStick', 'up']]);
});

test('conflicts between stick inputs and stick directions: the same side of the same stick, never the other stick', () => {
  const def = getCharacter('0002');
  const actions = controllerActions(def);
  const { bindings } = recommendedProfile(def);
  // Right stick up twice in the air.
  let c = profileConflicts(actions, { ...bindings, 'air:attack1': flick('up') });
  assert.deepEqual(c.map((x) => [x.type, x.actions.sort().join('+'), x.stick, x.direction]), [['same', 'air:attack1+air:attack3', 'rightStick', 'up']]);
  // Left and forward: the same when facing left.
  c = profileConflicts(actions, { ...bindings, 'ground:attack1': flick('left'), 'ground:attack2': flick('forward') });
  assert.ok(hasBlockingConflict(c));
  // Forward and back never meet; left-or-right beside left: the more specific wins.
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'ground:attack1': flick('back'), 'ground:attack2': flick('forward') }), []);
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'ground:attack1': flick('horizontal'), 'ground:attack2': flick('left') }), []);
  // Up on the left stick beside up on the right stick: two inputs.
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'air:attack1': flick('up', { stick: 'leftStick' }) }), []);
  // A stick input beside the same with a modifier: the combination wins when held.
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'air:attack1': flick('up', { modifier: 'l2' }) }), []);
  // The left stick or D-pad down beside the left stick down: the same push.
  c = profileConflicts(actions, { ...bindings, 'air:attack1': flick('down', { stick: 'leftStickDpad' }) });
  assert.ok(c.some((x) => x.type === 'same' && x.actions.includes('fastFall')));
  // A D-pad button beside the D-pad pushed that way.
  c = profileConflicts(actions, { ...bindings, 'ground:attack1': b('dpadUp'), 'ground:attack2': flick('up', { stick: 'dpad' }) });
  assert.ok(c.some((x) => x.type === 'same' && x.severity === 'error'));
  // Square with a direction on each stick, as specific as each other and both able to hold: ambiguous.
  c = profileConflicts(actions, {
    ...bindings, 'ground:attack1': b('west', { stick: 'leftStick', direction: 'down' }), 'ground:attack2': b('west', { stick: 'rightStick', direction: 'up' }),
  });
  assert.ok(hasBlockingConflict(c));
  // ...but up and down on one stick never are.
  assert.deepEqual(profileConflicts(actions, {
    ...bindings, 'ground:attack1': b('west', { stick: 'rightStick', direction: 'down' }), 'ground:attack2': b('west', { stick: 'rightStick', direction: 'up' }),
  }), []);
});

test('shared inputs that resolve one way are not conflicts', () => {
  for (const def of playableCharacters()) {
    // The same face buttons on the ground and in the air, the Shield and the
    // Deflect on L1, the right stick down on the ground and in the air.
    assert.deepEqual(profileConflicts(controllerActions(def), recommendedProfile(def).bindings), [], `#${def.id}`);
  }
  // A combination beside its plain button, and a direction beside none.
  const one = getCharacter('0001');
  const actions = controllerActions(one);
  const { bindings } = recommendedProfile(one);
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'ground:attack3': b('west', { stick: 'leftStick', direction: 'up' }) }), []);
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'ground:attack3': b('west', { modifier: 'r3' }) }), []);
  assert.deepEqual(profileConflicts(actions, { ...bindings, 'air:attack2': b('west', { stick: 'leftStick', direction: 'horizontal' }) }), [],
    'left-or-right beside anywhere: the more specific wins');
  // The same direction is ambiguous again.
  assert.ok(hasBlockingConflict(profileConflicts(actions, {
    ...bindings, 'air:attack2': b('west', { stick: 'leftStick', direction: 'up' }), 'air:attack1': b('west', { stick: 'leftStick', direction: 'up' }),
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
      'ground:attack1': legacy('west', { direction: 'down' }), // a direction with no stick: whose?
      'ground:attack3': flick('up'),
      'air:attack1': b('west', { stick: 'rightStick', direction: 'forward' }),
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
      'ground:attack3': flick('up'),
      'air:attack1': b('west', { stick: 'rightStick', direction: 'forward' }),
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

// ---- Profiles saved before the sticks were named ----------------------------------------

// #0001's whole layout as the editor saved it under settings version 5,
// with `changes` made by the player.
function savedThen(def, changes = {}) {
  const out = { ...LEGACY_UNIVERSAL_DEFAULTS };
  for (const [id, binding] of Object.entries(def.controller.previous)) out[id] = binding;
  for (const id of Object.keys(out)) if (!controllerActions(def).some((a) => a.id === id)) delete out[id];
  return { ...out, ...changes };
}

// The fighters playable when settings version 5 saved profiles: a fighter
// added since (#0006, #0007) recommended nothing then, so it keeps no layout of
// then.
const PLAYABLE_THEN = Object.freeze(['0001', '0002', '0003', '0004', '0005']);

test('a profile saved before: nothing of the player\'s own, and the fighter plays with today\'s recommended layout', () => {
  for (const def of playableCharacters()) {
    if (!PLAYABLE_THEN.includes(def.id)) {
      assert.equal(def.controller.previous, undefined, `#${def.id} came after: no layout of then`);
      continue;
    }
    assert.ok(def.controller.previous, `#${def.id} keeps the layout it recommended then`);
    assert.deepEqual(upgradeStoredProfile(def, savedThen(def)), {}, `#${def.id}: an untouched layout gives way`);
  }
});

test('a profile saved before keeps the player\'s own choices, and today\'s layout fills in the rest where nothing conflicts', () => {
  const def = getCharacter('0005');
  // The player moved the Long Bite to R3 and Pause to Create.
  const upgraded = upgradeStoredProfile(def, savedThen(def, { 'ground:attack2': legacy('r3'), pause: legacy('select') }));
  assert.deepEqual(upgraded, { 'ground:attack2': b('r3'), pause: b('select') });
  const p = resolveProfile(def, upgraded);
  assert.deepEqual(p.bindings.dash, UNIVERSAL_DEFAULTS.dash, 'today\'s Dash');
  assert.deepEqual(p.bindings.shield, UNIVERSAL_DEFAULTS.shield, 'today\'s guard');
  assert.deepEqual(p.bindings['ground:attack5'], recommendedProfile(def).bindings['ground:attack5'], 'today\'s Red Balloon');
  assert.deepEqual(profileConflicts(p.actions, p.bindings), []);
});

test('a profile saved before whose choices would clash with today\'s layout is kept whole, exactly as it played', () => {
  const def = getCharacter('0001');
  // The Shield held on R2 (it was R2 + face buttons' modifier then, a
  // warning the player accepted): today R2 fires Red, so the mix would
  // clash; the whole old layout stays theirs.
  const then = savedThen(def, { shield: legacy('r2', { activation: 'continuous' }) });
  const upgraded = upgradeStoredProfile(def, then);
  assert.deepEqual(upgraded.shield, b('r2', { activation: 'continuous' }));
  assert.deepEqual(upgraded.dash, b('l1'), 'the Dash where it was');
  assert.deepEqual(upgraded.deflect, b('east'), 'the Deflect where it was');
  assert.deepEqual(upgraded['ground:attack2'], b('west', { modifier: 'r2' }), 'Red where it was');
  const p = resolveProfile(def, upgraded);
  assert.equal(hasBlockingConflict(profileConflicts(p.actions, p.bindings)), false);
  for (const a of p.actions) assert.ok(upgraded[a.id], `${a.id}: every binding kept, nothing of today mixed in`);
});

test('a profile saved before reads its directions on what moved the fighter then: they play exactly as they did', () => {
  const def = getCharacter('0002');
  // The D-pad moved it, so the old Down + Square and the Fast fall were the D-pad's.
  const upgraded = upgradeStoredProfile(def, savedThen(def, { move: { source: 'dpad' } }));
  assert.deepEqual(upgraded.move, { source: 'dpad' });
  assert.deepEqual(upgraded.fastFall, b(null, { stick: 'dpad', direction: 'down', activation: 'continuous' }), 'the D-pad down, as it was');
  assert.deepEqual(upgraded['air:attack2'], b('west', { stick: 'dpad', direction: 'down' }));
  // A fighter the game does not know: every binding kept, in today's shape.
  assert.deepEqual(upgradeStoredProfile(null, { move: { source: 'rightStick' }, fastFall: legacy(null, { direction: 'down', activation: 'continuous' }) }), {
    move: { source: 'rightStick' }, fastFall: b(null, { stick: 'rightStick', direction: 'down', activation: 'continuous' }),
  });
  // Malformed entries drop; one fighter's never touches another's.
  const all = upgradeStoredProfiles({
    '0001': savedThen(getCharacter('0001')),
    '0003': { 'ground:attack1': legacy('r3'), 'ground:attack2': { button: 'zz', activation: 'press' } },
    'bad id!': { jump: legacy('north', { activation: 'continuous' }) },
    '0099': { jump: legacy('north', { activation: 'continuous' }) },
  }, getCharacter);
  assert.deepEqual(all, { '0003': { 'ground:attack1': b('r3') }, '0099': { jump: b('north', { activation: 'continuous' }) } });
  for (const junk of [null, 'x', 3, []]) assert.deepEqual(upgradeStoredProfiles(junk, getCharacter), {});
  assert.deepEqual(upgradeStoredProfiles({ '0001': { jump: legacy('north', { activation: 'continuous' }) } }, () => { throw new Error('no registry'); }),
    { '0001': { jump: b('north', { activation: 'continuous' }) } }, 'a lookup that fails keeps the profile as saved');
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
