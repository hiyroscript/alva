// English: every interface string, by stable key (see js/localization/i18n.js
// for how keys are looked up and filled). English is the fallback language:
// every key has a string here, and a key another language lacks shows this
// one.
//
// The English copy of game data (control names, each fighter's own button
// and ability names, Powers, Launch, difficulty levels, stages) is not
// written here: registryStrings reads it from the registries that own it,
// so it cannot drift from them. Only interface copy is authored below.

import { CONFIG, ACTION_LABELS } from '../../config.js';
import { POWERS } from '../../data/powers.js';
import {
  LAUNCH_POINT_SUMMARY, LAUNCH_FORMULA, BASE_LAUNCH_SUMMARY, BASE_LAUNCH_DESCRIPTIONS, DIRECTIONAL_LAUNCH_SUMMARY,
  DIRECTIONAL_LAUNCHES,
} from '../../data/launch.js';
import { DIFFICULTIES } from '../../data/difficulty.js';
import { MAPS } from '../../data/maps.js';
import { abilityName } from '../../data/abilities.js';
import { CHARACTERS } from '../../data/characters.js';

// A Directional Launch's key part: its id, or 'none'.
const directionKey = (id) => id ?? 'none';

// The English copy the game's registries own, under their keys.
function registryStrings() {
  const out = {};
  for (const [action, label] of Object.entries(ACTION_LABELS)) out[`control.${action}`] = label;
  for (const def of CHARACTERS) {
    for (const mapping of Object.values(def.actions ?? {})) {
      if (mapping?.air) out[`ability.${def.id}.${mapping.air}`] = abilityName(def, mapping.air);
    }
    for (const [action, own] of Object.entries(def.mobileAbilities ?? {})) {
      if (own?.label) out[`ability.${def.id}.${action}`] = own.label;
    }
  }
  for (const power of POWERS) {
    out[`power.${power.id}.name`] = power.name;
    out[`power.${power.id}.summary`] = power.summary;
    for (const tier of power.tiers) {
      out[`power.${power.id}.tier.${tier.tier}.name`] = tier.name;
      out[`power.${power.id}.tier.${tier.tier}.description`] = tier.description;
    }
  }
  out['launch.pointSummary'] = LAUNCH_POINT_SUMMARY;
  out['launch.formula'] = LAUNCH_FORMULA;
  out['launch.baseSummary'] = BASE_LAUNCH_SUMMARY;
  for (const [value, description] of Object.entries(BASE_LAUNCH_DESCRIPTIONS)) out[`launch.base.${value}`] = description;
  out['launch.directionalSummary'] = DIRECTIONAL_LAUNCH_SUMMARY;
  for (const d of DIRECTIONAL_LAUNCHES) {
    out[`launch.direction.${directionKey(d.id)}.name`] = d.name;
    out[`launch.direction.${directionKey(d.id)}.description`] = d.description;
  }
  for (const d of DIFFICULTIES) {
    out[`difficulty.${d.id}.name`] = d.name;
    out[`difficulty.${d.id}.description`] = d.description;
  }
  for (const map of MAPS) {
    out[`map.${map.id}.name`] = map.name;
    out[`map.${map.id}.tagline`] = map.tagline;
  }
  return out;
}

// Each name made possessive, joined by "and": "#0001's", or "A's and B's".
const possessives = (names) => names.map((n) => `${n}'s`).join(' and ');

export const EN = {
  ...registryStrings(),
  'brand.title': CONFIG.title,

  'common.back': 'Back',
  'common.selected': 'Selected',
  'common.default': 'Default',
  'common.retry': 'Retry',
  'common.loading': 'Loading',
  'common.loadingName': 'Loading {name}',
  'common.assetsUnavailable': 'Assets unavailable',
  'common.spritesFailed': ({ names, where }) =>
    `${possessives(names)} sprite frames could not be loaded. Check your connection and that the files in ${where} exist.`,
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.noFighters': 'No fighters available',
  'common.fighterUnavailable': 'Fighter unavailable',
  'common.fighterUnavailableMessage': 'This session cannot start: a fighter it needs is not available.',

  'hint.navigate': 'Navigate',
  'hint.select': 'Select',
  'hint.back': 'Back',
  'key.enter': 'Enter',
  'key.esc': 'Esc',

  'screen.splash': 'Intro',
  'screen.mode': 'Select mode',
  'screen.difficulty': 'Select difficulty',
  'screen.character': 'Select fighter',
  'screen.map': 'Select map',
  'screen.watchDifficulty': 'Watch Mode: select difficulty',
  'screen.watchCpu1': 'Watch Mode: select CPU 1',
  'screen.watchCpu2': 'Watch Mode: select CPU 2',
  'screen.watchMap': 'Watch Mode: select stage',
  'screen.battle': 'Battle',
  'screen.practice': 'Practice Ground',
  'screen.discover': 'Discover',

  'rotate.title': 'Rotate your device',
  'rotate.text': 'Alva is designed for landscape play.',

  'splash.credit': 'a game by {developer}',

  'home.lede': 'Fan project. Big heart.',
  'home.menu': 'Main menu',
  'home.play': 'Play',
  'home.watch': 'Watch Mode',
  'home.practice': 'Practice Ground',
  'home.discover': 'Discover',
  'home.settings': 'Settings',
  'home.credits': 'Credits',
  'home.creditsRegion': 'Credits. Scroll or use arrow and Page keys to read.',
  'home.by': 'by {developer}',

  'credits.createdBy': 'Created by {developer}',
  'credits.original.title': 'Original work',
  'credits.original.line': 'Game design, code, interface, {title} wordmark, and Desert / City stage artwork by {developer}.',
  'credits.sprites0001.title': '#0001 sprite source',
  'credits.sprites0001.sheet': 'Sprite sheet by Finhj on DeviantArt',
  'credits.sprites0001.sheetCredits': 'Sheet credits: ZetrasBlack, R0B4N',
  'credits.sprites0002.title': '#0002 sprite source',
  'credits.sprites0002.sheet': 'Sprite sheet by thespriteanimations on DeviantArt',
  'credits.rights.title': 'Rights',
  'credits.rights.ownership': '{developer} did not create or claim ownership of the original third-party character/game artwork.',
  'credits.rights.holders': 'Original characters, games, and related properties belong to their respective rights holders.',
  'credits.project.title': 'Project',
  'credits.project.unofficial': 'Unofficial fan project.',
  'credits.project.endorsement': 'No affiliation or endorsement is implied.',

  'setup.quickBattle': 'Quick Battle',
  'setup.watch': 'Watch Mode',
  'setup.steps': '{name} setup',
  'step.mode': 'Mode',
  'step.difficulty': 'Difficulty',
  'step.fighter': 'Fighter',
  'step.stage': 'Stage',
  'step.cpu': 'CPU {n}',

  'mode.title': 'Select Mode',
  'mode.kicker': 'Play',
  'mode.index': 'Mode {index}',
  'mode.quickBattle.description': 'Choose a difficulty, a fighter and a stage, then enter battle.',
  'mode.select': 'Select',
  'mode.details': 'Mode details',

  'difficulty.title': 'Select Difficulty',
  'difficulty.group': 'Difficulty',
  'difficulty.current': 'Current',
  'difficulty.card': '{name}, level {level} of {count}',

  'character.title': 'Select Fighter',
  'watch.cpuTitle': 'Select CPU {n}',
  'roster.grid': 'Fighter roster',
  'roster.panel': 'Roster',
  'roster.available': '{name}, available',
  'roster.locked': 'Slot {num}, locked',
  'roster.statusLocked': 'Locked',
  'roster.statusAvailable': 'Available',
  'roster.slot': 'Slot {num}',
  'roster.confirm': 'Confirm fighter',
  'roster.none': 'Select a fighter',

  'map.title': 'Select Stage',
  'map.stages': 'Stages',
  'map.available.one': '{n} available',
  'map.available.other': '{n} available',
  'map.card': '{name}. {tagline}',
  'map.preview': '{name} stage preview',
  'map.start': 'Confirm and start battle',
  'map.watchStart': 'Confirm and watch battle',

  'banner.ready': 'READY',
  'banner.round': 'ROUND {n}',
  'banner.fight': 'FIGHT',
  'banner.timeOver': 'TIME OVER',
  'banner.time': 'TIME',
  'banner.void': 'VOID',
  'banner.ko': 'K.O.',
  'result.kickerKo': 'K.O.',
  'result.kickerTime': 'Time over',
  'result.void': '{loser} fell into the Void for the final point.',
  'result.points': 'Time ran out. More points wins the match.',
  'result.time': 'Time ran out with the points level. Lower Launch Point wins.',
  'result.rematch': 'Rematch',
  'result.changeStage': 'Change Stage',
  'side.quickBattle.p1.wins': 'Player 1 Wins',
  'side.quickBattle.p1.name': 'Player 1',
  'side.quickBattle.p2.wins': 'CPU Wins',
  'side.quickBattle.p2.name': 'The CPU',
  'side.watch.p1.wins': 'CPU 1 Wins',
  'side.watch.p1.name': 'CPU 1',
  'side.watch.p2.wins': 'CPU 2 Wins',
  'side.watch.p2.name': 'CPU 2',
  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart Battle',
  'pause.home': 'Return to Home',
  'confirmHome.title': 'Return to Home?',
  'confirmHome.message': 'The current battle will end and its progress will be discarded.',
  'confirmHome.confirm': 'Return Home',
  'confirmHome.cancel': 'Keep Playing',
  'battle.canvas': 'Battle',
  'battle.watchCanvas': 'Watch Mode battle: CPU 1, {p1}, against CPU 2, {p2}',

  'slot.p1': 'P1',
  'slot.cpu': 'CPU',
  'slot.cpu1': 'CPU 1',
  'slot.cpu2': 'CPU 2',
  'hud.player1': 'Player 1',
  'hud.launchPoint': 'Launch Point',
  'hud.energy': 'Energy {value} of {max}',
  'hud.energyExhausted': 'Energy exhausted, refilling: {value} of {max}',
  'hud.score.one': '{who}: {points} of {total} points',
  'hud.score.other': '{who}: {points} of {total} points',
  'hud.pauseGame': 'Pause game',
  'hud.pause': 'Pause',
  'hud.pauseNoLimit': 'Pause game, no time limit',
  'hud.pauseTime': 'Pause game, {left} remaining',
  'hud.round': 'ROUND {n}',
  'hud.practiceMenu': 'Practice menu',
  'unit.minute.one': '{n} minute',
  'unit.minute.other': '{n} minutes',
  'unit.second.one': '{n} second',
  'unit.second.other': '{n} seconds',

  'practice.title': 'Practice Ground',
  'practice.changeFighter': 'Change Fighter',
  'practice.changeCpu': 'Change CPU',
  'practice.enableCpu': 'Enable CPU',
  'practice.selectCpu': 'Select CPU',
  'practice.disableCpu': 'Disable CPU',
  'practice.return': 'Return',
  'practice.backToMenu': 'Back to practice menu',

  'discover.title': 'Discover',
  'discover.sections': 'Discover sections',
  'discover.power': 'Power',
  'discover.launch': 'Launch',
  'discover.passives': 'Passives',
  'discover.tiers': '{name} tiers',
  'discover.launchPointTitle': 'Launch Point',
  'discover.baseLaunchTitle': 'Base Launch',
  'discover.baseLaunchValue': 'Base Launch {value}',
  'discover.baseLaunchValues': 'Base Launch values',
  'discover.directionalLaunchTitle': 'Directional Launch',
  'discover.directions': 'Directional Launch directions',

  'touch.dpad': 'Movement',
  'touch.joystick': 'Movement joystick',
  'touch.actions': 'Actions',
  'touch.deflect': 'Deflect',
  'touch.mouvementLeft': 'Left mouvement',
  'touch.mouvementRight': 'Right mouvement',

  'firstRun.title': 'Language',
  'firstRun.prompt': 'Choose your language',
  'firstRun.note': 'You can change it later in Settings.',

  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.language': 'Language',
  'settings.languageNote': 'The language of every menu, label and message.',
  'settings.controls': 'Controls',
  'settings.mobileControls': 'Mobile Controls',
  'settings.controlsNote': 'The touch layout for Quick Battle and Practice Ground. Keyboard and gamepad controls stay the same.',
  'settings.scheme.joystick': 'Joystick',
  'settings.scheme.classic': 'Classic Buttons',
  'settings.scheme.joystickDesc': 'A round joystick to move, with one-tap Left and Right mouvement buttons to Dash.',
  'settings.scheme.classicDesc': 'Left and Right buttons. Tap a direction twice to Dash.',
  'settings.customize': 'Customize touch controls',
  'settings.customizeNote': 'Move and resize every control of the {scheme} layout.',
  'settings.customized': 'Custom layout',

  'editor.label': 'Touch control editor',
  'editor.layout': '{scheme} layout',
  'editor.hint': 'Drag a control to move it. Select one to resize it.',
  'editor.keyHint': 'Select a control, then use the arrows to move it.',
  'editor.none': 'No control selected',
  'editor.size': 'Size',
  'editor.sizeValue': '{percent}%',
  'editor.smaller': 'Smaller',
  'editor.larger': 'Larger',
  'editor.reset': 'Reset to defaults',
  'editor.done': 'Done',
  'editor.moving': 'Moving {name}. Use the arrows, then Select or Back to finish.',
  'editor.placed': '{name} placed.',
  'editor.resetDone': 'Layout reset to defaults.',
  'editor.surface': 'Battle screen preview',
};
