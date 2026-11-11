// Run with node --test tests/integration/adventure.test.mjs (no dependencies).
// Adventure end to end (the Adventure update), on the real ScreenManager,
// MenuNavigator, Select Mode, level selector, Select Fighter, Perquisite
// cards and Battle screen (tests/helpers/adventure-app.mjs):
//
//   Select Mode → Adventure → Select Level → Select Fighter
//     → (a milestone unclaimed) the Perquisite cards → Battle
//
// The battle (the CPU's fighter and the stage drawn, Venture at the level,
// each side's modifiers), a win that unlocks the next level and is saved at
// once, a loss or a draw that changes nothing, the Match Results' Next
// level, Retry level, Change fighter and Level select, clearing Level 30,
// the progress kept across a fresh app, and Adventure nowhere in Local
// Play, Online Play or Watch Mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, memoryStorage, settleAll, current, stepNames } from '../helpers/adventure-app.mjs';

const { ADVENTURE_KEY } = await import('../../js/core/adventure-progress.js');
const { ventureProfile, ventureStrength } = await import('../../js/data/adventure.js');
const { MAPS } = await import('../../js/data/maps.js');
const { playableCharacters } = await import('../../js/data/characters.js');
const { BATTLE_MODES } = await import('../../js/game/battle.js');
const { IDENTITY_MODIFIERS } = await import('../../js/game/combat/modifiers.js');
const { DIFFICULTIES } = await import('../../js/data/difficulty.js');
const { CONFIG } = await import('../../js/config.js');
const { LOCAL_MODES } = await import('../../js/screens/local-play-screens.js');

const storageWith = (values) => memoryStorage({ [ADVENTURE_KEY]: JSON.stringify({ version: 1, seed: 11, ...values }) });
const saved = (storage) => JSON.parse(storage.map.get(ADVENTURE_KEY));
const actionNames = (screen) => screen.resultsActionsRoot.children.map((b) => b.textContent);

// Home → Play → Adventure → Level `level` → the first playable fighter
// confirmed. Returns once the battle (or the cards) is up.
async function startLevel(booted, level) {
  const { app, screens } = booted;
  if (current(app) === 'home') screens.home.actions.play.click();
  if (current(app) === 'mode') screens.mode.cardFor('adventure').click();
  assert.equal(current(app), 'adventure-levels');
  screens.levels.cellFor(level).click();
  assert.equal(current(app), 'adventure-character');
  screens.fighter.confirm(playableCharacters()[0]);
  await settleAll();
}

// The match ends now with `outcome` ('p1': the player wins), and the screen
// shows it.
function finish(booted, outcome) {
  const screen = booted.screens.battle;
  screen.battle.finishMatch({ outcome, reason: outcome === 'draw' ? 'overtimeLaunchPoint' : 'void' });
  screen.showFinal();
  screen.openResults();
}

test('the full flow: a level, a fighter, the cards at Level 5, then the battle with Venture at that level', async () => {
  const storage = storageWith({ unlocked: 5 });
  const booted = boot({ storage });
  const { app, screens } = booted;
  await startLevel(booted, 5);
  // The cards first, over Select Fighter.
  assert.equal(app.perquisiteCards.isOpen, true, 'the cards, before the battle');
  assert.equal(current(app), 'adventure-character');
  assert.equal(app.perquisiteCards.kicker.textContent, 'Level 05');
  const [first] = app.perquisiteCards.cards;
  const id = first._perquisite;
  // Esc does nothing: a Perquisite must be picked.
  app.input.key('Escape');
  assert.equal(app.perquisiteCards.isOpen, true);
  assert.equal(current(app), 'adventure-character');
  first.click(0);
  await settleAll();
  // Saved at once, the milestone claimed.
  assert.equal(saved(storage).perquisites[id], 1);
  assert.equal(saved(storage).milestones['5'].picked, id);
  // The battle: the player's fighter, a CPU and a stage drawn, Venture at 5.
  assert.equal(current(app), 'battle');
  const screen = screens.battle;
  const battle = screen.battle;
  assert.equal(screen.mode, 'adventure');
  assert.equal(screen.level, 5);
  assert.equal(battle.mode, 'quick-battle', 'Player 1 against the CPU, as Quick Battle');
  assert.equal(battle.p1.def.id, playableCharacters()[0].id);
  assert.ok(playableCharacters().some((d) => d.id === battle.p2.def.id), 'the CPU drawn among the playable fighters');
  assert.ok(MAPS.some((m) => m.id === battle.map.id), 'the stage drawn among the stages');
  assert.equal(battle.seed, app.selection.adventure.seed, 'the battle plays on the seed its draw came from');
  assert.equal(battle.p2.controller.profile, ventureProfile(5));
  assert.equal(battle.p2.modifiers.damageDealt, ventureStrength(5));
  assert.notEqual(battle.p1.modifiers, IDENTITY_MODIFIERS, 'the Perquisite picked is on');
  // Standard match rules.
  assert.equal(battle.pointsToWin, CONFIG.battle.pointsToWin);
  assert.equal(battle.roundSeconds, CONFIG.battle.matchSeconds);
  assert.equal(battle.overtimeSeconds, CONFIG.battle.overtimeSeconds);
  // The HUD's tag and the pause kicker.
  assert.equal(screen.hud.levelTag.hidden, false);
  assert.equal(screen.hud.levelTag.textContent, 'Lv 05 · Venture');
  assert.equal(screen.pauseKicker.textContent, 'Adventure');
  // The intro announces the level and Venture at it.
  screen.updateBanner();
  assert.equal(screen.bannerMain.textContent, 'LEVEL 05');
  assert.equal(screen.bannerSub.textContent, 'Venture · ×5.06 smarter · ×1.22 damage');
});

test('a claimed milestone shows no cards again, and a lost milestone stays claimed', async () => {
  const storage = storageWith({ unlocked: 5 });
  const booted = boot({ storage });
  await startLevel(booted, 5);
  booted.app.perquisiteCards.cards[1].click(0);
  await settleAll();
  finish(booted, 'p2');
  assert.equal(saved(storage).milestones['5'].picked !== null, true, 'losing does not unclaim it');
  // Retry: straight into battle.
  booted.screens.battle.adventureActions.retry.click(0);
  await settleAll();
  assert.equal(booted.app.perquisiteCards.isOpen, false);
  assert.equal(current(booted.app), 'battle');
  assert.equal(booted.screens.battle.level, 5);
});

test('a win on the next level unlocks the one after, saved at once; a loss or a draw changes nothing', async () => {
  for (const [outcome, unlocked] of [['p1', 4], ['p2', 3], ['draw', 3]]) {
    const storage = storageWith({ unlocked: 3 });
    const booted = boot({ storage });
    await startLevel(booted, 3);
    finish(booted, outcome);
    assert.equal(saved(storage).unlocked, unlocked, `${outcome}: saved as it ends, before anything else`);
    assert.equal(booted.app.adventure.unlocked, unlocked);
    assert.equal((saved(storage).cleared ?? []).includes(3), outcome === 'p1');
  }
  // A cleared level replayed and won unlocks nothing more.
  const storage = storageWith({ unlocked: 6 });
  const booted = boot({ storage });
  await startLevel(booted, 2);
  finish(booted, 'p1');
  assert.equal(saved(storage).unlocked, 6);
});

test('the Match Results after a win: Adventure · Level NN, Next level first, then Retry, Change fighter, Level select, Home', async () => {
  const booted = boot({ storage: storageWith({ unlocked: 2 }) });
  await startLevel(booted, 2);
  finish(booted, 'p1');
  const screen = booted.screens.battle;
  assert.equal(screen.resultsKicker.hidden, false);
  assert.equal(screen.resultsKicker.textContent, 'Adventure · Level 02');
  assert.deepEqual(actionNames(screen), ['Next level', 'Retry level', 'Change fighter', 'Level select', 'Return to home screen']);
  assert.equal(document.activeElement, screen.adventureActions.next, 'Next level, the green primary, focused');
  assert.ok(screen.adventureActions.next.classList.contains('is-primary'));
  assert.ok(!actionNames(screen).includes('Change stage'), 'no Change stage');
  assert.ok(!actionNames(screen).includes('Rematch'));
  // After a loss: no Next level, Retry the primary.
  const lost = boot({ storage: storageWith({ unlocked: 2 }) });
  await startLevel(lost, 2);
  finish(lost, 'p2');
  assert.deepEqual(actionNames(lost.screens.battle), ['Retry level', 'Change fighter', 'Level select', 'Return to home screen']);
  assert.equal(document.activeElement, lost.screens.battle.adventureActions.retry);
});

test('Next level: the next level\'s battle with the same fighter and a fresh draw; its cards first at a milestone', async () => {
  const storage = storageWith({ unlocked: 9 });
  const booted = boot({ storage });
  await startLevel(booted, 8);
  const firstSeed = booted.app.selection.adventure.seed;
  finish(booted, 'p1');
  const screen = booted.screens.battle;
  screen.adventureActions.next.click(0);
  await settleAll();
  assert.equal(current(booted.app), 'battle');
  assert.equal(screen.level, 9);
  assert.equal(screen.battle.p2.controller.profile, ventureProfile(9));
  assert.equal(screen.battle.p1.def.id, playableCharacters()[0].id, 'the same fighter');
  assert.notEqual(booted.app.selection.adventure.seed, firstSeed, 'a fresh draw');
  assert.equal(screen.resultsOverlay.hidden, true);
  assert.equal(screen.hud.levelTag.textContent, 'Lv 09 · Venture');
  // 9 won: Next is Level 10, a milestone: the cards over the battle first.
  finish(booted, 'p1');
  screen.adventureActions.next.click(0);
  await settleAll();
  assert.equal(booted.app.perquisiteCards.isOpen, true);
  assert.equal(booted.app.perquisiteCards.kicker.textContent, 'Level 10');
  booted.app.perquisiteCards.cards[0].click(0);
  await settleAll();
  assert.equal(screen.level, 10);
  assert.equal(saved(storage).milestones['10'].picked, booted.app.perquisiteCards.cards[0]._perquisite);
});

test('Retry level draws again; Restart Battle replays the same draw; Level select and Change fighter go back', async () => {
  const booted = boot({ storage: storageWith({ unlocked: 4 }) });
  await startLevel(booted, 4);
  const screen = booted.screens.battle;
  const seed = screen.battle.seed;
  // Pause → Restart Battle: the same level, the same draw.
  screen.pause();
  screen.restart();
  assert.equal(screen.battle.seed, seed);
  assert.equal(screen.level, 4);
  finish(booted, 'p2');
  screen.adventureActions.retry.click(0);
  await settleAll();
  assert.equal(screen.level, 4);
  assert.notEqual(screen.battle.seed, seed, 'a new random draw');
  // Level select.
  finish(booted, 'p2');
  screen.adventureActions.levels.click(0);
  assert.equal(current(booted.app), 'adventure-levels');
  assert.equal(document.activeElement, booted.screens.levels.cellFor(4));
  // Change fighter.
  booted.screens.levels.cellFor(4).click();
  booted.screens.fighter.confirm(playableCharacters()[0]);
  await settleAll();
  finish(booted, 'p2');
  screen.adventureActions.fighter.click(0);
  assert.equal(current(booted.app), 'adventure-character');
  assert.deepEqual(stepNames(booted.screens.fighter), ['Mode', 'Level', 'Fighter']);
  assert.deepEqual(booted.app.screens.stack, ['home', 'mode', 'adventure-levels']);
});

test('clearing Level 30: "Adventure complete!" on the toast, every cell cleared, and it stays so', async () => {
  const cleared = Array.from({ length: 29 }, (_, i) => i + 1);
  const storage = storageWith({ unlocked: 30, cleared });
  const booted = boot({ storage });
  await startLevel(booted, 30);
  // Level 30 is a milestone: its cards first.
  booted.app.perquisiteCards.cards[0].click(0);
  await settleAll();
  const screen = booted.screens.battle;
  screen.battle.finishMatch({ outcome: 'p1', reason: 'void' });
  screen.showFinal();
  assert.equal(screen.toast.hidden, false);
  assert.equal(screen.toastNote.hidden, false);
  assert.equal(screen.toastNote.textContent, 'Adventure complete!');
  screen.openResults();
  assert.deepEqual(actionNames(screen), ['Retry level', 'Change fighter', 'Level select', 'Return to home screen'], 'no level after 30');
  assert.equal(saved(storage).unlocked, 31);
  screen.adventureActions.levels.click(0);
  const { levels } = booted.screens;
  assert.ok(levels.cells.every((c) => c.dataset.state === 'cleared'), 'all thirty cleared');
  assert.equal(document.activeElement, levels.cellFor(30));
  // A fresh app, the same storage: still complete.
  const again = boot({ storage });
  again.screens.home.actions.play.click();
  again.screens.mode.cardFor('adventure').click();
  assert.ok(again.screens.levels.cells.every((c) => c.dataset.state === 'cleared'));
  // A loss elsewhere never shows the line.
  const other = boot({ storage: storageWith({ unlocked: 3 }) });
  await startLevel(other, 3);
  finish(other, 'p1');
  assert.equal(other.screens.battle.toastNote.hidden, true);
});

test('progress survives a fresh app: unlocked levels, cleared ones and Perquisites', async () => {
  const storage = memoryStorage();
  const first = boot({ storage });
  await startLevel(first, 1);
  finish(first, 'p1');
  first.screens.battle.adventureActions.next.click(0);
  await settleAll();
  finish(first, 'p1');
  const later = boot({ storage });
  later.screens.home.actions.play.click();
  later.screens.mode.cardFor('adventure').click();
  const { levels } = later.screens;
  assert.deepEqual(levels.cells.slice(0, 4).map((c) => c.dataset.state), ['cleared', 'cleared', 'next', 'locked']);
  assert.equal(document.activeElement, levels.cellFor(3));
  assert.equal(levels.progressMeta.textContent, '2 / 30 cleared');
});

// ---- Nowhere else ------------------------------------------------------------------------

test('Adventure appears nowhere in Local Play, Online Play or Watch Mode: no screen, rail or rule lists, links to or reads it', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  for (const file of ['js/screens/local-play-screens.js', 'js/screens/online-screens.js', 'js/screens/online-battle-screen.js',
    'js/screens/watch-screens.js', 'js/online/rules.js', 'js/online/match-setup.js', 'js/online/online-session.js', 'js/online/lockstep.js',
    'js/screens/practice-screen.js', 'js/game/practice.js', 'server/src/rules.js']) {
    assert.doesNotMatch(read(file), /adventure|venture|perquisite/i, file);
  }
  assert.deepEqual(LOCAL_MODES.map((m) => m.id), ['quick-battle']);
  assert.deepEqual([...CONFIG.online.modes], ['quick-battle']);
  assert.deepEqual(Object.keys(BATTLE_MODES), ['quick-battle', 'watch', 'local', 'online'], 'no Battle mode of its own');
  assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['easy', 'medium', 'hard', 'brutal'], 'Watch Mode and Quick Battle list four levels');
});

test('every other mode plays with the identity\'s modifiers on both sides and its own difficulty', async () => {
  const { Battle } = await import('../../js/game/battle.js');
  const { getMap } = await import('../../js/data/maps.js');
  const { fakeSprites } = await import('../helpers/fighter-harness.mjs');
  const def = playableCharacters()[0];
  for (const mode of Object.keys(BATTLE_MODES)) {
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('desert'), mode, seed: 2, difficulty: 'hard', p1Def: def, p2Def: def,
      p1Sprites: fakeSprites(), p2Sprites: fakeSprites(), input: { flush() {}, sample: () => ({}), player: () => ({ flush() {}, sample: () => ({}) }) },
    });
    for (const f of battle.fighters) {
      assert.equal(f.modifiers, IDENTITY_MODIFIERS, `${mode} ${f.slot}`);
      assert.equal(f.combat.modifiers, IDENTITY_MODIFIERS);
      if (f.controller?.kind === 'cpu') assert.equal(f.controller.difficulty, 'hard', `${mode}: its own difficulty`);
    }
  }
});
