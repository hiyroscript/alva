// Interface localization: the one source of every player-facing string, in
// English and French, looked up by stable key.
//
//   t('home.play')                    'Play' / 'Jouer'
//   t('roster.slot', { num: '07' })   'Slot 07' / 'Emplacement 07'
//   plural('unit.second', 3)          '3 seconds' / '3 secondes'
//
// Keys name what a string is for, never what it says, and internal
// identifiers (control and move codenames, character, map and scheme ids,
// CSS classes, data keys) are never translated. The English copy of game
// data (Powers, Launch, difficulty levels, stages, control names and each
// fighter's own touch-button names) is read from the registries that own it,
// so it cannot drift from them; STRINGS.fr translates every key, and a key
// missing from a language falls back to English.
//
// App owns the active language: it applies the player's saved choice
// (js/core/settings.js) at start and after every change. Changing it sets
// <html lang> and tells every onLanguageChange listener; App then re-reads
// every marked string on the page (localizeTree), so the whole interface
// follows without a reload. Strings are marked as they are made: tx() for
// an element's text, tattr() for an attribute (e.g. its aria-label),
// iconLabel() for a label beside an inline SVG icon, and setText() /
// setAttr() when code changes one later.

import { CONFIG, ACTION_LABELS } from '../config.js';
import { LANGUAGES, DEFAULT_LANGUAGE } from './settings.js';
import { POWERS } from '../data/powers.js';
import {
  LAUNCH_POINT_SUMMARY, LAUNCH_FORMULA, BASE_LAUNCH_SUMMARY, BASE_LAUNCH_DESCRIPTIONS, DIRECTIONAL_LAUNCH_SUMMARY,
  DIRECTIONAL_LAUNCHES,
} from '../data/launch.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { MAPS } from '../data/maps.js';
import { CHARACTERS } from '../data/characters.js';

export { LANGUAGES, DEFAULT_LANGUAGE };

// Each language by its own name, so a player can find theirs whatever
// language the game is in. Never translated.
export const LANGUAGE_NAMES = Object.freeze({ en: 'English', fr: 'Français' });

// A Directional Launch's key part: its id, or 'none'.
const directionKey = (id) => id ?? 'none';

// The English copy the game's registries own, under their keys.
function registryStrings() {
  const out = {};
  for (const [action, label] of Object.entries(ACTION_LABELS)) out[`control.${action}`] = label;
  for (const def of CHARACTERS) {
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

const EN = {
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
  'credits.sprites.title': '#0001 sprite source',
  'credits.sprites.material': 'Original sprite material from Jump Ultimate Stars',
  'credits.sprites.site': 'The Spriters Resource',
  'credits.sprites.uploader': 'Source sheet uploaded by Dazz',
  'credits.sprites.contributor': 'Contributor: FRET',
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
  'settings.scheme.joystickDesc': 'A round joystick to move, one-tap Left and Right mouvement buttons to Dash, and Down to the left of the joystick to fast-fall.',
  'settings.scheme.classicDesc': 'The original Left, Down and Right buttons. Tap a direction twice to Dash; hold Down in the air to fast-fall.',
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

const FR = {
  'brand.title': CONFIG.title,

  'control.runLeft': 'Aller à gauche',
  'control.runRight': 'Aller à droite',
  'control.down': 'Bas',
  'control.jump': 'Saut',
  'control.extra_attack': 'Attaque supplémentaire',
  'control.transform': 'Transformation',
  'control.shield': 'Bouclier',
  'control.attack1': 'Attaque 1',
  'control.attack2': 'Attaque 2',
  'control.attack3': 'Attaque 3',
  'control.attack4': 'Attaque 4',
  'control.attack5': 'Attaque 5',
  'control.pause': 'Pause',
  'ability.0001.extra_attack': 'Shuriken',
  'ability.0001.attack1': 'Coup de poing',
  'ability.0001.attack2': 'Coup de pied',
  'ability.0001.attack3': 'Attaque du clone',
  'ability.0001.attack4': 'Ruée sphérique',
  'ability.0002.extra_attack': 'Tourbillon',
  'ability.0002.attack1': 'Coup de poing',
  'ability.0002.attack2': 'Coup de pied',
  'ability.0002.attack3': 'Vrille',

  'power.jump.name': 'Puissance de saut',
  'power.jump.summary': 'Détermine la hauteur d’un saut normal. Plus le niveau est élevé, plus le saut est haut.',
  'power.jump.tier.1.name': 'Puissance de saut 1',
  'power.jump.tier.1.description': 'Saut très bas.',
  'power.jump.tier.2.name': 'Puissance de saut 2',
  'power.jump.tier.2.description': 'Saut normal.',
  'power.jump.tier.3.name': 'Puissance de saut 3',
  'power.jump.tier.3.description': 'Saut un peu plus haut.',
  'power.speed.name': 'Puissance de vitesse',
  'power.speed.summary': 'Détermine la vitesse de déplacement maximale. Plus le niveau est élevé, plus le déplacement est rapide.',
  'power.speed.tier.1.name': 'Puissance de vitesse 1',
  'power.speed.tier.1.description': 'Lent.',
  'power.speed.tier.2.name': 'Puissance de vitesse 2',
  'power.speed.tier.2.description': 'Vitesse normale.',
  'power.speed.tier.3.name': 'Puissance de vitesse 3',
  'power.speed.tier.3.description': 'Un peu plus rapide.',

  'launch.pointSummary':
    'Le Point d’éjection correspond aux dégâts accumulés : il part de 0 et tous les dégâts subis s’y ajoutent. ' +
    'Quand un coup dont l’Éjection de base dépasse 0 touche, le Point d’éjection détermine la force de l’éjection : ' +
    'plus il est élevé, plus l’éjection est forte. Il revient à 0 après une élimination, à la réapparition.',
  'launch.formula': 'Force d’éjection = Éjection de base × Point d’éjection',
  'launch.baseSummary':
    'Chaque coup a une Éjection de base de 0, 1, 2 ou 3. Les dégâts du coup s’ajoutent d’abord au Point d’éjection, ' +
    'puis le nouveau Point d’éjection est multiplié par l’Éjection de base.',
  'launch.base.0': 'Aucune éjection. Le Point d’éjection est multiplié par zéro.',
  'launch.base.1': 'Éjection normale. Utilise le Point d’éjection une fois.',
  'launch.base.2': 'Éjection double. Utilise deux fois le Point d’éjection.',
  'launch.base.3': 'Éjection triple. Utilise trois fois le Point d’éjection.',
  'launch.directionalSummary':
    'Chaque coup a aussi une Éjection directionnelle. Elle détermine où la force d’éjection envoie la cible, jamais sa puissance.',
  'launch.direction.none.name': 'Aucune',
  'launch.direction.none.description': 'Le coup inflige des dégâts, mais ne provoque aucune éjection directionnelle.',
  'launch.direction.horizontal.name': 'Horizontale',
  'launch.direction.horizontal.description': 'Éjecte dans le sens où va le coup.',
  'launch.direction.vertical.name': 'Verticale',
  'launch.direction.vertical.description': 'Éjecte vers le haut.',
  'launch.direction.reverseVertical.name': 'Verticale inversée',
  'launch.direction.reverseVertical.description': 'Éjecte vers le bas.',

  'difficulty.easy.name': 'Facile',
  'difficulty.easy.description': 'Réactions lentes. Laisse des ouvertures.',
  'difficulty.medium.name': 'Moyen',
  'difficulty.medium.description': 'Réactions et décisions équilibrées.',
  'difficulty.hard.name': 'Difficile',
  'difficulty.hard.description': 'Réactions rapides. Se défend et punit.',
  'difficulty.brutal.name': 'Brutal',
  'difficulty.brutal.description': 'Réactions vives. Décisions implacables.',

  'map.desert.name': 'Désert',
  'map.desert.tagline': 'Mesa de grès à l’heure dorée',
  'map.city.name': 'Ville',
  'map.city.tagline': 'Toit d’immeuble à la nuit tombée',

  'common.back': 'Retour',
  'common.selected': 'Sélectionné',
  'common.default': 'Par défaut',
  'common.retry': 'Réessayer',
  'common.loading': 'Chargement',
  'common.loadingName': 'Chargement de {name}',
  'common.assetsUnavailable': 'Ressources indisponibles',
  'common.spritesFailed': ({ names, where }) =>
    `Les sprites de ${joinList(names, 'fr')} n’ont pas pu être chargés. Vérifiez votre connexion et la présence des fichiers dans ${where}.`,
  'common.confirm': 'Confirmer',
  'common.cancel': 'Annuler',
  'common.noFighters': 'Aucun combattant disponible',
  'common.fighterUnavailable': 'Combattant indisponible',
  'common.fighterUnavailableMessage': 'Cette session ne peut pas commencer : un combattant nécessaire n’est pas disponible.',

  'hint.navigate': 'Naviguer',
  'hint.select': 'Sélectionner',
  'hint.back': 'Retour',
  'key.enter': 'Entrée',
  'key.esc': 'Échap',

  'screen.splash': 'Introduction',
  'screen.mode': 'Choix du mode',
  'screen.difficulty': 'Choix de la difficulté',
  'screen.character': 'Choix du combattant',
  'screen.map': 'Choix de l’arène',
  'screen.watchDifficulty': 'Mode Spectateur : choix de la difficulté',
  'screen.watchCpu1': 'Mode Spectateur : choix du CPU 1',
  'screen.watchCpu2': 'Mode Spectateur : choix du CPU 2',
  'screen.watchMap': 'Mode Spectateur : choix de l’arène',
  'screen.battle': 'Combat',
  'screen.practice': 'Terrain d’entraînement',
  'screen.discover': 'Découvrir',

  'rotate.title': 'Tournez votre appareil',
  'rotate.text': 'Alva se joue en mode paysage.',

  'splash.credit': 'un jeu de {developer}',

  'home.lede': 'Un projet de fan, fait avec cœur.',
  'home.menu': 'Menu principal',
  'home.play': 'Jouer',
  'home.watch': 'Mode Spectateur',
  'home.practice': 'Terrain d’entraînement',
  'home.discover': 'Découvrir',
  'home.settings': 'Paramètres',
  'home.credits': 'Crédits',
  'home.creditsRegion': 'Crédits. Faites défiler ou utilisez les flèches et les touches Page pour les lire.',
  'home.by': 'par {developer}',

  'credits.createdBy': 'Créé par {developer}',
  'credits.original.title': 'Création originale',
  'credits.original.line': 'Conception du jeu, code, interface, logo {title} et illustrations des arènes Désert et Ville par {developer}.',
  'credits.sprites.title': 'Source des sprites de #0001',
  'credits.sprites.material': 'Sprites d’origine tirés de Jump Ultimate Stars',
  'credits.sprites.site': 'The Spriters Resource',
  'credits.sprites.uploader': 'Planche source publiée par Dazz',
  'credits.sprites.contributor': 'Contribution : FRET',
  'credits.sprites0002.title': 'Source des sprites de #0002',
  'credits.sprites0002.sheet': 'Planche de sprites de thespriteanimations sur DeviantArt',
  'credits.rights.title': 'Droits',
  'credits.rights.ownership': '{developer} n’a pas créé les illustrations originales de personnages et de jeux de tiers, et n’en revendique pas la propriété.',
  'credits.rights.holders': 'Les personnages, les jeux et les propriétés d’origine appartiennent à leurs ayants droit respectifs.',
  'credits.project.title': 'Projet',
  'credits.project.unofficial': 'Projet de fan non officiel.',
  'credits.project.endorsement': 'Aucune affiliation ni approbation n’est sous-entendue.',

  'setup.quickBattle': 'Combat rapide',
  'setup.watch': 'Mode Spectateur',
  'setup.steps': 'Étapes : {name}',
  'step.mode': 'Mode',
  'step.difficulty': 'Difficulté',
  'step.fighter': 'Combattant',
  'step.stage': 'Arène',
  'step.cpu': 'CPU {n}',

  'mode.title': 'Choisir le mode',
  'mode.kicker': 'Jouer',
  'mode.index': 'Mode {index}',
  'mode.quickBattle.description': 'Choisissez une difficulté, un combattant et une arène, puis lancez le combat.',
  'mode.select': 'Choisir',
  'mode.details': 'Détails du mode',

  'difficulty.title': 'Choisir la difficulté',
  'difficulty.group': 'Difficulté',
  'difficulty.current': 'Actuelle',
  'difficulty.card': '{name}, niveau {level} sur {count}',

  'character.title': 'Choisir le combattant',
  'watch.cpuTitle': 'Choisir le CPU {n}',
  'roster.grid': 'Liste des combattants',
  'roster.panel': 'Combattants',
  'roster.available': '{name}, disponible',
  'roster.locked': 'Emplacement {num}, verrouillé',
  'roster.statusLocked': 'Verrouillé',
  'roster.statusAvailable': 'Disponible',
  'roster.slot': 'Emplacement {num}',
  'roster.confirm': 'Confirmer le combattant',
  'roster.none': 'Choisissez un combattant',

  'map.title': 'Choisir l’arène',
  'map.stages': 'Arènes',
  'map.available.one': '{n} disponible',
  'map.available.other': '{n} disponibles',
  'map.card': '{name}. {tagline}',
  'map.preview': 'Aperçu de l’arène {name}',
  'map.start': 'Confirmer et lancer le combat',
  'map.watchStart': 'Confirmer et regarder le combat',

  'banner.ready': 'PRÊTS',
  'banner.round': 'ROUND {n}',
  'banner.fight': 'COMBAT',
  'banner.timeOver': 'TEMPS ÉCOULÉ',
  'banner.time': 'TEMPS',
  'banner.void': 'VIDE',
  'banner.ko': 'K.-O.',
  'result.kickerKo': 'K.-O.',
  'result.kickerTime': 'Temps écoulé',
  'result.void': '{loser} est tombé dans le Vide pour le point final.',
  'result.points': 'Le temps est écoulé. Le plus de points l’emporte.',
  'result.time': 'Le temps est écoulé à égalité de points. Le plus petit Point d’éjection l’emporte.',
  'result.rematch': 'Revanche',
  'result.changeStage': 'Changer d’arène',
  'side.quickBattle.p1.wins': 'Victoire du joueur 1',
  'side.quickBattle.p1.name': 'Le joueur 1',
  'side.quickBattle.p2.wins': 'Victoire du CPU',
  'side.quickBattle.p2.name': 'Le CPU',
  'side.watch.p1.wins': 'Victoire du CPU 1',
  'side.watch.p1.name': 'Le CPU 1',
  'side.watch.p2.wins': 'Victoire du CPU 2',
  'side.watch.p2.name': 'Le CPU 2',
  'pause.title': 'Pause',
  'pause.resume': 'Reprendre',
  'pause.restart': 'Recommencer le combat',
  'pause.home': 'Retour à l’accueil',
  'confirmHome.title': 'Retourner à l’accueil ?',
  'confirmHome.message': 'Le combat en cours prendra fin et sa progression sera perdue.',
  'confirmHome.confirm': 'Retour à l’accueil',
  'confirmHome.cancel': 'Continuer à jouer',
  'battle.canvas': 'Combat',
  'battle.watchCanvas': 'Combat en mode Spectateur : CPU 1, {p1}, contre CPU 2, {p2}',

  'slot.p1': 'J1',
  'slot.cpu': 'CPU',
  'slot.cpu1': 'CPU 1',
  'slot.cpu2': 'CPU 2',
  'hud.player1': 'Joueur 1',
  'hud.launchPoint': 'Point d’éjection',
  'hud.energy': 'Énergie {value} sur {max}',
  'hud.energyExhausted': 'Énergie épuisée, en recharge : {value} sur {max}',
  'hud.score.one': '{who} : {points} point sur {total}',
  'hud.score.other': '{who} : {points} points sur {total}',
  'hud.pauseGame': 'Mettre en pause',
  'hud.pause': 'Pause',
  'hud.pauseNoLimit': 'Mettre en pause, sans limite de temps',
  'hud.pauseTime': 'Mettre en pause, il reste {left}',
  'hud.round': 'ROUND {n}',
  'hud.practiceMenu': 'Menu d’entraînement',
  'unit.minute.one': '{n} minute',
  'unit.minute.other': '{n} minutes',
  'unit.second.one': '{n} seconde',
  'unit.second.other': '{n} secondes',

  'practice.title': 'Terrain d’entraînement',
  'practice.changeFighter': 'Changer de combattant',
  'practice.changeCpu': 'Changer de CPU',
  'practice.enableCpu': 'Activer le CPU',
  'practice.selectCpu': 'Choisir le CPU',
  'practice.disableCpu': 'Désactiver le CPU',
  'practice.return': 'Retour',
  'practice.backToMenu': 'Retour au menu d’entraînement',

  'discover.title': 'Découvrir',
  'discover.sections': 'Sections de Découvrir',
  'discover.power': 'Puissance',
  'discover.launch': 'Éjection',
  'discover.passives': 'Passifs',
  'discover.tiers': 'Niveaux – {name}',
  'discover.launchPointTitle': 'Point d’éjection',
  'discover.baseLaunchTitle': 'Éjection de base',
  'discover.baseLaunchValue': 'Éjection de base {value}',
  'discover.baseLaunchValues': 'Valeurs d’Éjection de base',
  'discover.directionalLaunchTitle': 'Éjection directionnelle',
  'discover.directions': 'Directions d’Éjection directionnelle',

  'touch.dpad': 'Déplacement',
  'touch.joystick': 'Joystick de déplacement',
  'touch.actions': 'Actions',
  'touch.mouvementLeft': 'Mouvement à gauche',
  'touch.mouvementRight': 'Mouvement à droite',

  'firstRun.title': 'Langue',
  'firstRun.prompt': 'Choisissez votre langue',
  'firstRun.note': 'Vous pourrez la changer plus tard dans les Paramètres.',

  'settings.title': 'Paramètres',
  'settings.close': 'Fermer les paramètres',
  'settings.language': 'Langue',
  'settings.languageNote': 'La langue de tous les menus, libellés et messages.',
  'settings.controls': 'Commandes',
  'settings.mobileControls': 'Commandes tactiles',
  'settings.controlsNote': 'La disposition tactile du Combat rapide et du Terrain d’entraînement. Les commandes au clavier et à la manette ne changent pas.',
  'settings.scheme.joystick': 'Joystick',
  'settings.scheme.classic': 'Boutons classiques',
  'settings.scheme.joystickDesc': 'Un joystick rond pour se déplacer, des boutons de mouvement gauche et droit pour sprinter d’une seule touche, et Bas à gauche du joystick pour tomber plus vite.',
  'settings.scheme.classicDesc': 'Les boutons Gauche, Bas et Droite d’origine. Touchez deux fois une direction pour sprinter; maintenez Bas en l’air pour tomber plus vite.',
  'settings.customize': 'Personnaliser les commandes tactiles',
  'settings.customizeNote': 'Déplacez et redimensionnez chaque commande de la disposition {scheme}.',
  'settings.customized': 'Disposition personnalisée',

  'editor.label': 'Éditeur des commandes tactiles',
  'editor.layout': 'Disposition {scheme}',
  'editor.hint': 'Faites glisser une commande pour la déplacer. Sélectionnez-en une pour la redimensionner.',
  'editor.keyHint': 'Sélectionnez une commande, puis déplacez-la avec les flèches.',
  'editor.none': 'Aucune commande sélectionnée',
  'editor.size': 'Taille',
  'editor.sizeValue': '{percent} %',
  'editor.smaller': 'Plus petit',
  'editor.larger': 'Plus grand',
  'editor.reset': 'Rétablir par défaut',
  'editor.done': 'Terminé',
  'editor.moving': 'Déplacement de {name}. Utilisez les flèches, puis Sélectionner ou Retour pour terminer.',
  'editor.placed': '{name} en place.',
  'editor.resetDone': 'Disposition par défaut rétablie.',
  'editor.surface': 'Aperçu de l’écran de combat',
};

export const STRINGS = Object.freeze({ en: Object.freeze(EN), fr: Object.freeze(FR) });

// ---- Active language --------------------------------------------------------------

let active = DEFAULT_LANGUAGE;
const listeners = new Set();
const warned = new Set();

export function getLanguage() {
  return active;
}

// Makes `language` ('en' or 'fr'; anything else is English) the interface
// language: <html lang> follows at once, and listeners hear about a real
// change. Returns whether it changed.
export function setLanguage(language) {
  const next = LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  const root = globalThis.document?.documentElement;
  if (root) root.lang = next;
  if (next === active) return false;
  active = next;
  for (const fn of [...listeners]) fn(next);
  return true;
}

// Calls `fn(language)` after every change; returns an unsubscribe.
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Keeps the interface language on `settings`' language setting
// (js/core/settings.js): now (English until the player picks one) and after
// every change of it. Returns an unsubscribe.
export function followSettings(settings) {
  setLanguage(settings.language);
  return settings.onChange((name, value) => {
    if (name === 'language') setLanguage(value);
  });
}

// Whether `key` has a string (in English, which every key has).
export function hasTranslation(key) {
  return Object.hasOwn(STRINGS[DEFAULT_LANGUAGE], key);
}

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, name) => (params && name in params ? String(params[name]) : whole));

// `params` with every { t: key } value read as that key's string, so a
// placeholder can hold another translated string ("{name} setup" with the
// setup's own name) and still follow the language.
function resolveParams(params, language) {
  if (!params) return params;
  const out = {};
  for (const [name, value] of Object.entries(params)) {
    out[name] = value && typeof value === 'object' && typeof value.t === 'string' ? t(value.t, undefined, language) : value;
  }
  return out;
}

// The string for `key` in `language` (the active one by default), with each
// {name} filled from `params`. A key no language has is logged once and
// shown as itself, so a gap is visible rather than blank.
export function t(key, params, language = active) {
  const text = STRINGS[language]?.[key] ?? STRINGS[DEFAULT_LANGUAGE][key];
  if (text === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[Alva] No string for "${key}".`);
    }
    return key;
  }
  const values = resolveParams(params, language);
  return typeof text === 'function' ? text(values ?? {}) : fill(text, values);
}

// `key`.one or `key`.other by the active language's plural rules for `n`
// (French counts 0 and 1 as one), with {n} filled.
export function plural(key, n, params = {}) {
  let category = n === 1 ? 'one' : 'other';
  try {
    category = new Intl.PluralRules(active).select(n) === 'one' ? 'one' : 'other';
  } catch {
    // Keep the English rule.
  }
  return t(`${key}.${category}`, { n, ...params });
}

// `items` as one phrase in `language`: "A", "A and B", "A, B and C".
export function joinList(items, language = active) {
  try {
    return new Intl.ListFormat(language, { type: 'conjunction' }).format(items);
  } catch {
    return items.join(language === 'fr' ? ' et ' : ' and ');
  }
}

// `key` in every language, for the first-launch chooser, which must make
// sense before any language is chosen: "Language · Langue".
export function bilingual(key) {
  return LANGUAGES.map((language) => t(key, undefined, language)).join(' · ');
}

// The spoken or shown name of a fighter's slot tag ('P1', 'CPU', 'CPU 1',
// 'CPU 2'); any other tag is shown as it is.
const SLOT_KEYS = Object.freeze({ P1: 'slot.p1', CPU: 'slot.cpu', 'CPU 1': 'slot.cpu1', 'CPU 2': 'slot.cpu2' });
export function slotLabel(tag) {
  return SLOT_KEYS[tag] ? t(SLOT_KEYS[tag]) : tag;
}

// ---- Marked strings -----------------------------------------------------------------

// The attributes a marked string can fill.
const ATTRS = Object.freeze(['aria-label', 'aria-description', 'aria-valuetext', 'alt', 'title']);

const encode = (params) => (params ? JSON.stringify(params) : '');
function decode(raw) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// el() attributes for text that follows the language: the string itself and
// its mark (key and params).
export function tx(key, params) {
  return { text: t(key, params), 'data-i18n': key, 'data-i18n-params': params ? encode(params) : null };
}

// el() attributes for attribute `name` (e.g. 'aria-label') following the
// language, likewise.
export function tattr(name, key, params) {
  return {
    [name]: t(key, params),
    [`data-i18n-${name}`]: key,
    [`data-i18n-${name}-params`]: params ? encode(params) : null,
  };
}

// el() attributes for a label in a <span> beside an inline SVG icon (set
// through innerHTML): the label follows the language, the icon stays.
export function iconLabel(key, icon, { iconFirst = false, params } = {}) {
  const span = `<span>${escapeHtml(t(key, params))}</span>`;
  return {
    html: iconFirst ? `${icon}${span}` : `${span}${icon}`,
    'data-i18n-span': key,
    'data-i18n-params': params ? encode(params) : null,
  };
}

// Sets `node`'s text to `key` (with `params`) and marks it, so it follows
// the language from now on.
export function setText(node, key, params) {
  node.textContent = t(key, params);
  node.setAttribute('data-i18n', key);
  node.setAttribute('data-i18n-params', encode(params));
}

// Sets `node`'s attribute `name` to `key` (with `params`) and marks it.
export function setAttr(node, name, key, params) {
  node.setAttribute(name, t(key, params));
  node.setAttribute(`data-i18n-${name}`, key);
  node.setAttribute(`data-i18n-${name}-params`, encode(params));
}

// Sets attribute `name` to text no translation owns (a fighter's own name
// for a button), dropping any mark it had.
export function setPlainAttr(node, name, value) {
  node.setAttribute(name, value);
  node.setAttribute(`data-i18n-${name}`, '');
}

// Re-reads every marked string in `root` and below in the active language.
export function localizeTree(root) {
  if (!root?.getAttribute) return;
  const key = root.getAttribute('data-i18n');
  if (key) root.textContent = t(key, decode(root.getAttribute('data-i18n-params')));
  const spanKey = root.getAttribute('data-i18n-span');
  if (spanKey) {
    const span = root.querySelector?.('span');
    if (span) span.textContent = t(spanKey, decode(root.getAttribute('data-i18n-params')));
  }
  for (const name of ATTRS) {
    const attrKey = root.getAttribute(`data-i18n-${name}`);
    if (attrKey) root.setAttribute(name, t(attrKey, decode(root.getAttribute(`data-i18n-${name}-params`))));
  }
  for (const child of [...(root.children ?? [])]) localizeTree(child);
}

// The translator App owns (app.i18n).
export const i18n = Object.freeze({
  t, plural, joinList, bilingual, setLanguage, onLanguageChange, followSettings, localizeTree,
  get language() { return active; },
});
