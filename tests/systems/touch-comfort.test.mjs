// Run with node --test tests/systems/touch-comfort.test.mjs (no dependencies).
// The touch comfort rules (js/data/touch-comfort.js; docs/characters/
// adding-characters.md, The touch comfort rules): a strict rule for every
// fighter on the roster and every fighter added later. Every definition the
// game loads keeps them, the registry refuses one that breaks any of them
// (each refused on its own, for a current fighter and a future one), and
// the shared touch controls keep the ones no definition can touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTERS, getCharacter } from '../../js/data/characters.js';
import { COMBAT_BUTTONS } from '../../js/config.js';
import { TOUCH_COMFORT, touchComfortProblems, assertTouchComfort } from '../../js/data/touch-comfort.js';
import { mashRow } from '../../js/data/mash-combo.js';
import { TOUCH_CONTROL_IDS, TOUCH_DEFAULT_SCALE } from '../../js/core/touch-layout.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const DEF = getCharacter('0001');

// `def` with `changes` over it (a shallow copy: the real one is untouched).
const variant = (def, changes) => ({ ...def, ...changes });
const withAbility = (def, button, ability) => variant(def, { mobileAbilities: { ...def.mobileAbilities, [button]: ability } });

test('every fighter the game loads keeps the touch comfort rules, and the registry checks each one as it loads', () => {
  for (const def of CHARACTERS) {
    assert.deepEqual(touchComfortProblems(def), [], def.id);
    assert.doesNotThrow(() => assertTouchComfort(def));
  }
  assert.match(read('js/data/characters.js'), /assertMashCombo\(def\);\s*assertTouchComfort\(def\);/);
  // Universal: nothing in the rules names a fighter.
  assert.doesNotMatch(read('js/data/touch-comfort.js').replace(/^\s*\/\/.*$/gm, ''), /'000\d'|#000\d|displayName/);
});

test('rule 1: one button a move, pressed directly; a combination, hold, modifier or sequence is refused', () => {
  for (const mapping of [
    { ground: 'attack1', hold: 'attack2' },
    { ground: 'attack1', modifier: 'shield' },
    ['attack1', 'attack2'],
    { sequence: ['attack1', 'attack2'] },
    { ground: 'attack1', air: 'midair_attack1', double: 'attack3' },
    42,
  ]) {
    const problems = touchComfortProblems(variant(DEF, { actions: { ...DEF.actions, attack2: mapping } }));
    assert.ok(problems.some((p) => p.startsWith('actions.attack2 is not one move in one plain tap')), JSON.stringify(mapping));
  }
  // A move name, a { ground, air } pair, a Special and a reserved button are all one plain tap.
  for (const mapping of ['attack2', { ground: 'attack2', air: 'midair_attack2' }, DEF.actions.attack4]) {
    const problems = touchComfortProblems(variant(DEF, { actions: { ...DEF.actions, attack2: mapping } }));
    assert.equal(problems.filter((p) => p.startsWith('actions.attack2 is not')).length, 0, JSON.stringify(mapping));
  }
});

test('rule 2: a fighter never places, sizes or adds a touch control, nor dresses a universal one', () => {
  for (const field of TOUCH_COMFORT.layoutFields) {
    assert.ok(touchComfortProblems(variant(DEF, { [field]: { attack3: { x: 0.5, y: 0.5 } } })).some((p) => p.startsWith(`${field}:`)), field);
  }
  for (const key of ['x', 'y', 'scale', 'slot', 'position', 'size', 'column']) {
    const problems = touchComfortProblems(withAbility(DEF, 'attack3', { ...DEF.mobileAbilities.attack3, [key]: 1 }));
    assert.ok(problems.some((p) => p.startsWith(`mobileAbilities.attack3.${key}:`)), key);
  }
  const preview = touchComfortProblems(withAbility(DEF, 'attack3', { ...DEF.mobileAbilities.attack3, preview: { ...DEF.mobileAbilities.attack3.preview, scale: 2 } }));
  assert.ok(preview.some((p) => p.startsWith('mobileAbilities.attack3.preview.scale:')));
  for (const universal of ['jump', 'shield', 'runLeft', 'down', 'mouvementLeft', 'stick']) {
    const problems = touchComfortProblems(withAbility(DEF, universal, { label: 'Mine', preview: { animation: 'idle', frame: 0 } }));
    assert.ok(problems.some((p) => p.startsWith(`mobileAbilities.${universal}: only the fighter's own combat buttons`)), universal);
  }
  // Art for a button the fighter does not have.
  const two = getCharacter('0002');
  assert.ok(!Object.hasOwn(two.actions, 'attack5'));
  assert.ok(touchComfortProblems(withAbility(two, 'attack5', { label: 'Extra', preview: { animation: 'idle', frame: 0 } })).some((p) => p.startsWith('mobileAbilities.attack5: the fighter has no attack5 button')));
});

test('rule 3: every button the fighter has shows its move, named, with a frame of its own art, and its distinct air move too', () => {
  const { attack3, ...rest } = DEF.mobileAbilities;
  assert.ok(attack3);
  const none = touchComfortProblems(variant(DEF, { mobileAbilities: rest }));
  assert.ok(none.includes('mobileAbilities.attack3.label: every touch button the fighter has is named'));
  assert.ok(none.includes('mobileAbilities.attack3.preview: every touch button the fighter has shows a frame of its move\'s own art'));
  const nowhere = touchComfortProblems(withAbility(DEF, 'attack3', { ...attack3, preview: { animation: 'no_such_clip', frame: 0 } }));
  assert.ok(nowhere.includes('mobileAbilities.attack3.preview names no frame the fighter has'));
  // A distinct air move without art of its own.
  const air = Object.entries(DEF.actions).find(([, m]) => m && typeof m === 'object' && m.air && m.ground && m.air !== m.ground);
  assert.ok(air, 'a button with a distinct air move');
  const [button] = air;
  const { previews, ...bare } = DEF.mobileAbilities[button];
  assert.ok(previews?.air);
  assert.ok(touchComfortProblems(withAbility(DEF, button, bare)).some((p) => p.startsWith(`mobileAbilities.${button}.previews.air:`)));
  // A reserved button (null) needs no art: there is no move to show yet.
  const reserved = variant(DEF, { actions: { ...DEF.actions, attack5: null }, mobileAbilities: (({ attack5, ...m }) => m)(DEF.mobileAbilities) });
  assert.equal(touchComfortProblems(reserved).filter((p) => p.includes('attack5')).length, 0);
});

test('rule 4: beside Jump only the fighter\'s Mash Combo buttons, the place next to Jump never empty', () => {
  for (const def of CHARACTERS) {
    const row = mashRow(def);
    assert.ok(row[1], `${def.id}: a button next to Jump`);
    assert.ok(row.every((b) => b === null || COMBAT_BUTTONS.includes(b)), def.id);
  }
  // A pair with one button: next to Jump.
  assert.deepEqual(mashRow({ id: 'x', actions: { attack1: 'attack1', attack2: 'attack2' }, mashCombo: { attacks: ['mash_attack', 'attack2'] } }), [null, 'attack2']);
  assert.deepEqual(mashRow({ id: 'x', actions: { attack1: 'attack1', attack2: 'attack2' }, mashCombo: { attacks: ['attack2', 'mash_attack'] } }), [null, 'attack2']);
  // Neither on a button: refused.
  const broken = variant(DEF, { mashCombo: { attacks: ['mash_attack', 'mash_attack'] } });
  assert.ok(touchComfortProblems(broken).includes('the place next to Jump would be empty: at least one Mash Combo move must be on a button'));
});

test('a future fighter is held to the same rules: built from nothing, it is refused until it keeps every one', () => {
  const future = {
    id: '9999',
    actions: { attack1: 'attack1', attack2: { ground: 'attack2', air: 'midair_attack2' }, attack3: { ground: 'attack3', tap: 'attack1' } },
    mashCombo: { attacks: ['attack1', 'attack2'] },
    mobileAbilities: { attack1: { label: 'Jab', preview: { animation: 'attack1', frame: 0 }, scale: 1.6 }, jump: { label: 'Leap' } },
    touchLayout: { attack1: { x: 0.9, y: 0.9 } },
    animations: { attack1: { frames: ['a.png'] } },
  };
  const problems = touchComfortProblems(future);
  for (const start of [
    'actions.attack3 is not one move in one plain tap',
    'touchLayout:',
    'mobileAbilities.attack1.scale:',
    'mobileAbilities.jump: only the fighter\'s own combat buttons',
    'mobileAbilities.attack2.label:',
    'mobileAbilities.attack2.preview:',
  ]) assert.ok(problems.some((p) => p.startsWith(start)), start);
  assert.throws(() => assertTouchComfort(future), /Character "9999" breaks the touch comfort rules/);
});

test('the shared touch controls keep the rules no definition can touch', () => {
  // The universal controls are the same for everyone: every control id is a
  // universal one or a combat button, never a fighter's own.
  const universal = ['down', 'mouvementLeft', 'stick', 'mouvementRight', 'runLeft', 'runRight', 'shield', 'jump'];
  for (const ids of Object.values(TOUCH_CONTROL_IDS)) {
    for (const id of ids) assert.ok(universal.includes(id) || COMBAT_BUTTONS.includes(id), id);
  }
  // Big enough for thumbs: every control 130 %, the fighter's other moves a little smaller.
  assert.deepEqual({ ...TOUCH_DEFAULT_SCALE }, { control: 1.3, move: 1.1 });
  // Flush in the corners, inside the safe area.
  const css = read('css/touch-controls.css');
  assert.match(css, /--tc-bottom: var\(--safe-b\);/);
  assert.match(css, /\.tc-dpad \{[^}]*left: var\(--safe-l\);/);
  assert.match(css, /\.tc-actions \{[^}]*right: var\(--safe-r\);/);
  // The row beside Jump comes only from the pair; no place by button id.
  const controls = read('js/ui/touch-controls.js');
  assert.match(controls, /export const mashButtons = mashRow;/);
  assert.doesNotMatch(css, /\.tc-extra_attack \{|\.tc-attack\[data-slot/);
  // The rules are written down where a new fighter's author reads them.
  assert.match(read('docs/characters/adding-characters.md'), /#### The touch comfort rules \(strict\)/);
  assert.match(read('CLAUDE.md'), /Touch comfort is a strict rule/);
});
