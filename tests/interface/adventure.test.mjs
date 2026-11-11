// Run with node --test tests/interface/adventure.test.mjs (no dependencies).
// Adventure's interface (the Adventure update): Select Mode's two cards
// (01 Adventure, the default and first focus, then 02 Quick Battle) and its
// narrower details panel, Adventure going straight to its level selector,
// the selector's locked, cleared and next cells, its milestone marks and
// wide row, the two-step Reset progress, every Back, the Perquisite cards'
// dialog, and the French. On a minimal fake DOM (tests/helpers/adventure-app.mjs);
// the layout rules are read from the stylesheet, and how it looks is for
// real-browser checks.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  boot, memoryStorage, settle, current, stepNames, currentStep, Element,
} from '../helpers/adventure-app.mjs';
import { stylesheet } from '../helpers/stylesheet.mjs';

const { setLanguage, localizeTree, onLanguageChange } = await import('../../js/localization/i18n.js');
const { ADVENTURE_KEY } = await import('../../js/core/adventure-progress.js');
const { RESET_ARM_SECONDS } = await import('../../js/screens/adventure-level-screen.js');
const { MODES, DEFAULT_MODE } = await import('../../js/screens/mode-select-screen.js');
const { PerquisiteCards } = await import('../../js/ui/perquisite-cards.js');
const { MenuNavigator } = await import('../../js/core/menu-navigator.js');
const { PERQUISITE_ICONS } = await import('../../js/ui/icons.js');

// Home → Play: Select Mode.
function toMode(booted) {
  booted.screens.home.actions.play.click();
  assert.equal(current(booted.app), 'mode');
}

// …then Adventure: its level selector.
function toLevels(booted) {
  toMode(booted);
  booted.screens.mode.cardFor('adventure').click();
  assert.equal(current(booted.app), 'adventure-levels');
}

// Progress saved as `values` (unlocked, perquisites, milestones), for a
// fresh app.
function storageWith(values) {
  return memoryStorage({ [ADVENTURE_KEY]: JSON.stringify({ version: 1, seed: 7, ...values }) });
}

const label = (cell) => cell.getAttribute('aria-label');

// ---- Select Mode ------------------------------------------------------------------------

test('Select Mode lists 01 Adventure then 02 Quick Battle, Adventure the default card and the first focus', () => {
  const booted = boot();
  toMode(booted);
  const { mode } = booted.screens;
  assert.deepEqual(MODES.map((m) => [m.id, m.index]), [['adventure', '01'], ['quick-battle', '02']]);
  assert.equal(DEFAULT_MODE, 'adventure');
  const cards = mode.el.querySelectorAll('.mode-card');
  assert.deepEqual(cards.map((c) => c.getAttribute('data-mode')), ['adventure', 'quick-battle']);
  assert.deepEqual(cards.map((c) => c.querySelector('.mode-index').textContent), ['Mode 01', 'Mode 02']);
  assert.deepEqual(cards.map((c) => c.querySelector('.mode-name').textContent), ['Adventure', 'Quick battle']);
  assert.equal(cards[0].querySelector('.mode-desc').textContent, 'Thirty levels against an ever-sharper CPU. Earn Perquisites as you climb.');
  assert.equal(cards[1].querySelector('.mode-desc').textContent, 'Regular play or Custom play: choose a difficulty and your fighter, then enter battle.');
  assert.equal(cards[0].hasAttribute('data-nav-default'), true);
  assert.equal(cards[1].hasAttribute('data-nav-default'), false);
  assert.equal(document.activeElement, cards[0], 'Adventure takes focus first');
  for (const c of cards) assert.ok(c.hasAttribute('data-nav-no-hover-focus'), 'hover previews only');
  // The steps follow the card focused.
  assert.deepEqual([stepNames(mode), currentStep(mode)], [['Mode', 'Level', 'Fighter'], 0]);
  cards[1].focus();
  assert.deepEqual(stepNames(mode), ['Mode', 'Difficulty', 'Fighter'], 'Quick Battle\'s Regular Play');
  cards[0].focus();
  assert.deepEqual(stepNames(mode), ['Mode', 'Level', 'Fighter']);
});

test('the details panel describes Adventure first, then Quick Battle, in two sections', () => {
  const booted = boot();
  toMode(booted);
  const info = booted.screens.mode.el.querySelector('.mode-info');
  const sections = info.querySelectorAll('.mode-info-section');
  assert.deepEqual(sections.map((s) => s.getAttribute('data-mode')), ['adventure', 'quick-battle']);
  assert.deepEqual(sections[0].querySelectorAll('p').map((p) => p.textContent), [
    'Clear 30 levels in order. Each level, Venture — the CPU — becomes 1.5 times smarter. Every 5 levels, choose one Perquisite to keep.',
    'Your opponent’s fighter and the stage are drawn at random. Standard match rules: first to 3 points, 5 minutes, then overtime.',
  ]);
  assert.equal(info.querySelectorAll('[data-nav]').length, 0, 'text that fits is no stop for the arrows');
});

test('Adventure opens its level selector at once: no play-type dialog, the mode chosen', () => {
  const booted = boot();
  toLevels(booted);
  assert.equal(booted.app.choiceDialog.isOpen, false, 'no dialog');
  assert.equal(booted.app.selection.mode, 'adventure');
  assert.deepEqual(booted.app.screens.stack, ['home', 'mode']);
  // Keyboard: Enter on the focused card does the same.
  const again = boot();
  toMode(again);
  again.app.input.key('Enter');
  again.app.input.pad('confirm');
  assert.equal(current(again.app), 'adventure-levels');
  // Quick Battle still asks.
  const quick = boot();
  toMode(quick);
  quick.screens.mode.cardFor('quick-battle').click();
  assert.equal(quick.app.choiceDialog.isOpen, true);
});

test('arrows and the D-pad move between the two cards', () => {
  const booted = boot();
  toMode(booted);
  const [adventure, quick] = booted.screens.mode.cards;
  adventure.rect = { left: 40, top: 120, width: 900, height: 120 };
  quick.rect = { left: 40, top: 250, width: 900, height: 120 };
  booted.screens.mode.el.querySelector('.btn-back').rect = { left: 40, top: 20, width: 90, height: 40 };
  booted.app.input.key('ArrowDown');
  assert.equal(document.activeElement, quick);
  booted.app.input.pad('up');
  assert.equal(document.activeElement, adventure);
});

// ---- The level selector -----------------------------------------------------------------

test('the selector: its header, thirty cells 01 to 30, Level 01 next and focused on a fresh run', () => {
  const booted = boot();
  toLevels(booted);
  const { levels } = booted.screens;
  assert.equal(levels.el.querySelector('.screen-title').textContent, 'Select level');
  assert.equal(levels.el.querySelector('.kicker').textContent, 'Adventure');
  assert.deepEqual([stepNames(levels), currentStep(levels)], [['Mode', 'Level', 'Fighter'], 1]);
  assert.ok(levels.el.querySelector('.steps').children[0].classList.contains('is-done'), 'Mode checked');
  assert.equal(levels.cells.length, 30);
  assert.deepEqual(levels.cells.map((c) => c.querySelector('.adventure-cell-num').textContent), Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0')));
  assert.equal(document.activeElement, levels.cells[0]);
  assert.equal(label(levels.cells[0]), 'Level 01, next');
  assert.equal(label(levels.cells[6]), 'Level 07, locked');
  assert.equal(levels.resetButton.disabled, true, 'nothing to reset yet');
});

test('locked, cleared and next: their states, names and reach; a locked cell can never be chosen', () => {
  const booted = boot({ storage: storageWith({ unlocked: 8 }) });
  toLevels(booted);
  const { levels } = booted.screens;
  const cell = (n) => levels.cellFor(n);
  assert.equal(label(cell(3)), 'Level 03, cleared');
  assert.equal(label(cell(8)), 'Level 08, next');
  assert.equal(label(cell(9)), 'Level 09, locked');
  assert.ok(cell(3).classList.contains('is-cleared') && !cell(3).disabled);
  assert.ok(cell(8).classList.contains('is-next') && !cell(8).disabled);
  assert.ok(cell(9).classList.contains('is-locked'));
  assert.equal(cell(9).disabled, true);
  assert.equal(cell(9).getAttribute('aria-disabled'), 'true');
  assert.equal(document.activeElement, cell(8), 'the next level is the default focus');
  // Locked: nothing happens, by press or by call.
  cell(9).click();
  levels.choose(9);
  assert.equal(current(booted.app), 'adventure-levels');
  cell(9).focus();
  assert.equal(document.activeElement, cell(8), 'a locked cell takes no focus');
  // Cleared: a replay is allowed.
  cell(3).click();
  assert.equal(current(booted.app), 'adventure-character');
  assert.equal(booted.app.selection.adventureLevel, 3);
});

test('milestones carry a card mark, hollow until claimed, filled after', () => {
  const booted = boot({ storage: storageWith({ unlocked: 12, milestones: { 5: { offer: ['braveSoldier', 'maximumEnergy'], picked: 'braveSoldier' } }, perquisites: { braveSoldier: 1 } }) });
  toLevels(booted);
  const { levels } = booted.screens;
  const marked = levels.cells.filter((c) => c.querySelector('.adventure-cell-card')).map((c) => c._level);
  assert.deepEqual(marked, [5, 10, 15, 20, 25, 30]);
  assert.ok(levels.cellFor(5).classList.contains('is-claimed'));
  assert.equal(levels.cellFor(10).classList.contains('is-claimed'), false);
  assert.equal(levels.cellFor(5).getAttribute('aria-description'), 'Perquisite claimed');
  assert.equal(levels.cellFor(10).getAttribute('aria-description'), 'Offers a Perquisite');
});

test('the wide row: Venture at the level focused and the Perquisites owned, information only', () => {
  const booted = boot({ storage: storageWith({ unlocked: 12, perquisites: { braveSoldier: 2, maximumEnergy: 1 } }) });
  toLevels(booted);
  const { levels } = booted.screens;
  levels.cellFor(7).focus();
  assert.equal(levels.ventureTitle.textContent, 'Venture · Level 07');
  // 1.5^6, to two decimals: how much smarter, and nothing about damage.
  assert.equal(levels.ventureLine.textContent, '×11.39 smarter vs Level 1');
  assert.deepEqual(levels.perquisiteList.children.map((li) => li.textContent), ['Brave SoldierII', 'Maximum EnergyI']);
  assert.equal(levels.wide.querySelectorAll('[data-nav]').length, 0, 'never focused');
  // None owned: a dash.
  const fresh = boot();
  toLevels(fresh);
  assert.deepEqual(fresh.screens.levels.perquisiteList.children.map((li) => li.textContent), ['—']);
});

test('Reset progress: the first press arms it for 3.2 s, then it disarms; a second press in time resets it all', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const storage = storageWith({ unlocked: 9, perquisites: { nearlyImmortal: 1 }, milestones: { 5: { offer: ['nearlyImmortal', 'braveSoldier'], picked: 'nearlyImmortal' } } });
    const booted = boot({ storage });
    toLevels(booted);
    const { levels } = booted.screens;
    const button = levels.resetButton;
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('data-i18n-span'), 'adventure.reset');
    // Armed, then disarmed after 3.2 s with nothing reset.
    button.click(0);
    assert.ok(button.classList.contains('is-armed'));
    assert.equal(button.getAttribute('data-i18n-span'), 'adventure.resetConfirm');
    assert.equal(RESET_ARM_SECONDS, 3.2);
    mock.timers.tick(3199);
    assert.ok(button.classList.contains('is-armed'), 'still armed at 3.199 s');
    mock.timers.tick(1);
    assert.equal(button.classList.contains('is-armed'), false, 'disarmed at 3.2 s');
    assert.equal(button.getAttribute('data-i18n-span'), 'adventure.reset');
    assert.equal(booted.app.adventure.unlocked, 9, 'nothing reset');
    // Armed again, and the second press in time resets.
    button.click(1);
    mock.timers.tick(2000);
    button.click(1);
    assert.equal(booted.app.adventure.unlocked, 1);
    assert.equal(booted.app.adventure.perquisiteLevel('nearlyImmortal'), 0);
    assert.equal(booted.app.adventure.claimed(5), false);
    const saved = JSON.parse(storage.map.get(ADVENTURE_KEY));
    assert.deepEqual([saved.unlocked, saved.cleared, saved.milestones], [1, [], {}]);
    assert.equal(label(levels.cellFor(1)), 'Level 01, next', 'repainted');
    assert.equal(label(levels.cellFor(8)), 'Level 08, locked');
    assert.equal(document.activeElement, levels.cellFor(1), 'focus back on Level 01');
    assert.equal(button.disabled, true, 'nothing left to reset');
    assert.equal(button.classList.contains('is-armed'), false);
  } finally {
    mock.timers.reset();
  }
});

test('Reset progress works from Enter / J and gamepad A as from a click, and never on hover', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const booted = boot({ storage: storageWith({ unlocked: 4 }) });
    toLevels(booted);
    const { levels } = booted.screens;
    const button = levels.resetButton;
    button.dispatch('pointerenter');
    button.dispatch('mouseover');
    assert.equal(button.classList.contains('is-armed'), false, 'hover does nothing');
    button.focus();
    booted.app.input.key('KeyJ');
    assert.ok(button.classList.contains('is-armed'), 'J arms it');
    booted.app.input.pad('confirm');
    assert.equal(booted.app.adventure.unlocked, 1, 'gamepad A resets');
  } finally {
    mock.timers.reset();
  }
});

test('Back paths: the selector to Select Mode on Adventure; Adventure\'s Select Fighter to the selector', () => {
  const booted = boot({ storage: storageWith({ unlocked: 6 }) });
  toLevels(booted);
  booted.screens.levels.el.querySelector('.btn-back').click();
  assert.equal(current(booted.app), 'mode');
  assert.equal(document.activeElement, booted.screens.mode.cardFor('adventure'), 'focus on the Adventure card');
  assert.deepEqual(stepNames(booted.screens.mode), ['Mode', 'Level', 'Fighter']);
  booted.screens.mode.cardFor('adventure').click();
  booted.screens.levels.cellFor(4).click();
  const { fighter } = booted.screens;
  assert.equal(current(booted.app), 'adventure-character');
  assert.equal(fighter.el.querySelector('.kicker').textContent, 'Adventure');
  assert.deepEqual([stepNames(fighter), currentStep(fighter)], [['Mode', 'Level', 'Fighter'], 2], 'no difficulty step, no CPU or stage');
  booted.app.input.key('Escape');
  assert.equal(current(booted.app), 'adventure-levels');
  assert.equal(document.activeElement, booted.screens.levels.cellFor(6), 'the next level focused again');
  booted.app.input.pad('back');
  assert.equal(current(booted.app), 'mode');
});

// ---- The Perquisite cards ------------------------------------------------------------------

function cardsDialog() {
  const app = { audio: { play() {} }, screens: { current: null }, input: { onKey() {}, onPadMenu() {}, setMenuOwner() {} } };
  app.nav = new MenuNavigator(app);
  const root = new Element('div');
  root.hidden = true;
  return { app, dialog: new PerquisiteCards(root, app), root };
}

test('the cards: a modal dialog, "Level 05" over "Choose a Perquisite", exactly two cards, no close button', async () => {
  const { dialog, root } = cardsDialog();
  let picked = null;
  dialog.open({ level: 5, offer: ['braveSoldier', 'velociousImmuneSystem'], levels: { velociousImmuneSystem: 1 } }).then((id) => { picked = id; });
  assert.equal(root.hidden, false);
  assert.equal(root.getAttribute('role'), 'dialog');
  assert.equal(root.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.kicker.textContent, 'Level 05');
  assert.equal(dialog.title.textContent, 'Choose a Perquisite');
  assert.equal(dialog.cards.length, 2);
  assert.equal(root.querySelectorAll('.dialog-close').length, 0, 'no way out but a pick');
  const [brave, velocious] = dialog.cards;
  assert.equal(brave.querySelector('.perquisite-card-name').textContent, 'Brave Soldier');
  assert.equal(brave.querySelector('.perquisite-card-level').textContent, 'Level I');
  assert.equal(brave.querySelector('.perquisite-card-new').textContent, 'New');
  assert.equal(brave.querySelector('.perquisite-card-effect').textContent, 'Take 8% less damage');
  assert.equal(brave.querySelector('.perquisite-card-was'), null, 'nothing was, at level I');
  assert.equal(brave.querySelector('.perquisite-card-icon').innerHTML, PERQUISITE_ICONS.braveSoldier);
  assert.equal(velocious.querySelector('.perquisite-card-level').textContent, 'Level II');
  assert.equal(velocious.querySelector('.perquisite-card-new'), null);
  assert.equal(velocious.querySelector('.perquisite-card-effect').textContent, 'Launch Point recovers every 0.44 s instead of 0.5 s (recovery still starts after 2 s)');
  assert.equal(velocious.querySelector('.perquisite-card-was').textContent, 'was every 0.46 s');
  assert.equal(document.activeElement, brave, 'the first card focused');
  for (const c of dialog.cards) assert.ok(c.hasAttribute('data-nav-no-hover-focus'), 'hover previews only');
  // Esc, Back and the dim do nothing.
  dialog.scope.onBack();
  root.dispatch('click');
  dialog.dismiss();
  assert.equal(dialog.isOpen, true);
  velocious.click(0);
  await settle();
  assert.equal(picked, 'velociousImmuneSystem');
  assert.equal(root.hidden, true);
});

test('the cards follow the language: French names, effects and badges', () => {
  const { dialog, root } = cardsDialog();
  const off = onLanguageChange(() => localizeTree(root));
  try {
    dialog.open({ level: 10, offer: ['nearlyImmortal', 'maximumEnergy'], levels: { nearlyImmortal: 2 } });
    setLanguage('fr');
    const [nearly, energy] = dialog.cards;
    assert.equal(dialog.kicker.textContent, 'Niveau 10');
    assert.equal(dialog.title.textContent, 'Choisissez une Perquisite');
    assert.equal(nearly.querySelector('.perquisite-card-name').textContent, 'Presque Immortel');
    assert.equal(nearly.querySelector('.perquisite-card-level').textContent, 'Niveau III');
    assert.equal(nearly.querySelector('.perquisite-card-effect').textContent, 'Récupérez 3 points d’éjection à chaque palier de récupération au lieu de 2');
    assert.equal(nearly.querySelector('.perquisite-card-was').textContent, 'avant : 2,75');
    assert.equal(energy.querySelector('.perquisite-card-name').textContent, 'Énergie Maximale');
    assert.equal(energy.querySelector('.perquisite-card-new').textContent, 'Nouveau');
  } finally {
    setLanguage('en');
    off();
    dialog.close(null);
  }
});

// ---- French ------------------------------------------------------------------------------------

test('the selector and Select Mode read in French, live, without a reload', () => {
  const booted = boot({ storage: storageWith({ unlocked: 8, perquisites: { redoutableStrength: 1 } }) });
  toLevels(booted);
  const { levels, mode } = booted.screens;
  levels.cellFor(7).focus();
  const off = onLanguageChange(() => { localizeTree(levels.el); localizeTree(mode.el); });
  try {
    setLanguage('fr');
    assert.equal(levels.el.querySelector('.screen-title').textContent, 'Choisir le niveau');
    assert.equal(levels.el.querySelector('.kicker').textContent, 'Aventure');
    assert.deepEqual(stepNames(levels), ['Mode', 'Niveau', 'Combattant']);
    assert.equal(label(levels.cellFor(3)), 'Niveau 03, terminé');
    assert.equal(label(levels.cellFor(8)), 'Niveau 08, suivant');
    assert.equal(label(levels.cellFor(9)), 'Niveau 09, verrouillé');
    assert.equal(levels.ventureTitle.textContent, 'Venture · Niveau 07');
    assert.equal(levels.ventureLine.textContent, '×11,39 plus intelligent par rapport au niveau 1');
    assert.equal(levels.perquisiteList.children[0].textContent, 'Force RedoutableI');
    assert.equal(levels.resetButton.getAttribute('data-i18n-span'), 'adventure.reset');
    assert.deepEqual(mode.el.querySelectorAll('.mode-name').map((n) => n.textContent), ['Aventure', 'Combat rapide']);
    assert.equal(mode.cardFor('adventure').querySelector('.mode-desc').textContent,
      'Trente niveaux face à un CPU toujours plus intelligent. Gagnez des Perquisites en progressant.');
  } finally {
    setLanguage('en');
    off();
  }
  localizeTree(levels.el);
  assert.equal(levels.el.querySelector('.screen-title').textContent, 'Select level');
});

// ---- Layout ---------------------------------------------------------------------------------

test('the details panel is narrower than before, a step smaller, and stacks capped at 32 vh so both cards stay in full', () => {
  const css = stylesheet();
  const setup = readFileSync(new URL('../../css/setup.css', import.meta.url), 'utf8');
  // Before: minmax(0, 1.75fr) minmax(220px, 1fr), the panel 36 % of the row.
  const cols = setup.match(/\.mode-layout \{ grid-template-columns: minmax\(0, ([\d.]+)fr\) minmax\((\d+)px, ([\d.]+)fr\); \}/);
  assert.ok(cols, 'two columns, the rail first');
  const [rail, min, panel] = [Number(cols[1]), Number(cols[2]), Number(cols[3])];
  assert.ok(panel / (rail + panel) < 1 / 2.75 - 0.05, `the panel's share (${(panel / (rail + panel)).toFixed(2)}) well under the old 0.36`);
  assert.ok(min < 220, 'and its minimum narrower');
  assert.match(setup, /\.mode-rail \{[^}]*flex-direction: column/, 'the cards stack in the rail');
  // A step smaller: heading 13-14 px, text 12-13 px, clamp() kept.
  assert.match(setup, /\.mode-info-heading \{[^}]*font-size: clamp\(13px, [\d.]+vh, 14px\)/);
  assert.match(setup, /\.mode-info-description \{[^}]*font-size: clamp\(12px, [\d.]+vh, 13px\)/);
  assert.match(setup, /\.mode-info-content \{[^}]*overflow-y: auto/, 'it still scrolls inside');
  // Stacked (≤ 720 px, tall / narrow): auto height capped near a third of
  // the window, the cards in full above it.
  const responsive = readFileSync(new URL('../../css/responsive.css', import.meta.url), 'utf8');
  for (const query of ['@media (max-width: 720px)', '@media (max-aspect-ratio: 1/1) and (min-height: 600px)']) {
    const blocks = responsive.split(query).slice(1).map((rest) => rest.slice(0, rest.indexOf('\n}\n')));
    const rules = blocks.find((b) => b.includes('.mode-layout'));
    assert.ok(rules, `${query} lays Select Mode out`);
    assert.match(rules, /\.mode-layout \{ grid-template-columns: 1fr; grid-template-rows: auto auto;/, `${query}: stacked, each row its own height`);
    assert.match(rules, /\.mode-info \{ max-height: 32vh; \}/, `${query}: capped at 32 vh`);
  }
  // Short landscape: ten cells a row, flatter, so all thirty fit.
  assert.match(responsive, /@media \(max-height: 560px\) \{\n  \.adventure-grid \{ grid-template-columns: repeat\(10, minmax\(0, 1fr\)\);/);
  assert.match(setup, /\.adventure-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(54px, 1fr\)\)/);
  assert.match(setup, /\.adventure-grid-wrap \{[^}]*overflow-y: auto/, 'the grid scrolls on its own; Back stays put');
  // The setup screens' corners, the cells' and the reset's included.
  assert.match(setup, /\.adventure-cell \{[^}]*border-radius: var\(--radius-menu\)/);
  assert.match(css, /:where\(html:not\(\.is-pointer-input\)\) \.adventure-cell:focus \{ box-shadow: var\(--focus-ring\); \}/);
});
