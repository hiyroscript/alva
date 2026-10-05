// Central application controller: owns the managers, the main
// requestAnimationFrame loop and cross-screen selection state, the player's
// settings and the interface language.
//
// Start-up: the complete intro plays first. A new player then chooses a
// language in Home; a returning player
// proceeds directly to Home in their saved language.

import { CONFIG } from '../config.js';
import { AssetLoader } from './asset-loader.js';
import { InputManager } from './input-manager.js';
import { AudioManager } from './audio-manager.js';
import { Device } from './device.js';
import { ScreenManager } from './screen-manager.js';
import { MenuNavigator } from './menu-navigator.js';
import { Settings } from './settings.js';
import { i18n, followSettings, onLanguageChange, localizeTree } from './i18n.js';
import { LoadingOverlay, ConfirmDialog } from '../ui/overlays.js';
import { LanguageDialog } from '../ui/language-dialog.js';
import { SettingsDialog } from '../ui/settings-dialog.js';
import { TouchLayoutEditor } from '../ui/touch-layout-editor.js';
import { getCharacter, getPlayableCharacter, playableCharacters, characterFramePaths } from '../data/characters.js';
import { MAPS } from '../data/maps.js';
import { DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { SpriteSet } from '../game/rendering/sprite-normalizer.js';

import { SplashScreen } from '../screens/splash-screen.js';
import { HomeScreen } from '../screens/home-screen.js';
import { ModeSelectScreen } from '../screens/mode-select-screen.js';
import { DifficultySelectScreen } from '../screens/difficulty-select-screen.js';
import { CharacterSelectScreen } from '../screens/character-select-screen.js';
import { MapSelectScreen } from '../screens/map-select-screen.js';
import { WatchDifficultyScreen, WatchFighterScreen, WatchMapScreen } from '../screens/watch-screens.js';
import { BattleScreen } from '../screens/battle-screen.js';
import { PracticeGroundScreen } from '../screens/practice-screen.js';
import { DiscoverScreen } from '../screens/discover-screen.js';

// Quick Battle's choices, and Watch Mode's apart from them (one difficulty
// for both CPUs, a fighter each), as they start. Practice Ground keeps its
// own fighter, and its training-dummy CPU never reads the difficulty. Every
// fighter is the first playable one, or null while there is none: never a
// disabled one.
export function initialSelection() {
  const firstFighter = playableCharacters()[0]?.id ?? null;
  return {
    mode: 'quick-battle',
    difficulty: DEFAULT_DIFFICULTY,
    characterId: firstFighter,
    mapId: MAPS[0].id,
    watch: {
      difficulty: DEFAULT_DIFFICULTY,
      cpu1CharacterId: firstFighter,
      cpu2CharacterId: firstFighter,
      mapId: MAPS[0].id,
    },
  };
}

export class App {
  constructor() {
    this.config = CONFIG;
    this.device = new Device().init();
    this.input = new InputManager(CONFIG.bindings);
    // The player's saved settings (Home › Settings), read once here, and
    // the interface language they hold (English until one is chosen). The
    // language follows every change of the setting, and the whole page
    // follows the language.
    this.settings = new Settings();
    this.i18n = i18n;
    followSettings(this.settings);
    onLanguageChange(() => this.localize());
    this.audio = new AudioManager();
    this.assets = new AssetLoader();
    this.screens = new ScreenManager(this);
    this.nav = new MenuNavigator(this);
    this.loading = new LoadingOverlay(document.getElementById('loading-overlay'));
    this.dialog = new ConfirmDialog(document.getElementById('confirm-dialog'), this);
    this.languageDialog = new LanguageDialog(document.getElementById('language-dialog'), this);
    this.settingsDialog = new SettingsDialog(document.getElementById('settings-dialog'), this);
    this.touchEditor = new TouchLayoutEditor(document.getElementById('touch-editor'), this);

    this.selection = initialSelection();

    this.spriteSets = new Map();   // characterId -> SpriteSet
    this.spritePromises = new Map();

    this.lastTime = 0;
    this.loop = this.loop.bind(this);
  }

  start() {
    const s = this.screens;
    s.register(new SplashScreen(this));
    s.register(new HomeScreen(this));
    s.register(new ModeSelectScreen(this));
    s.register(new DifficultySelectScreen(this));
    s.register(new CharacterSelectScreen(this));
    s.register(new MapSelectScreen(this));
    // Watch Mode's setup: Difficulty → CPU 1 → CPU 2 → Stage.
    s.register(new WatchDifficultyScreen(this));
    s.register(new WatchFighterScreen(this, 1));
    s.register(new WatchFighterScreen(this, 2));
    s.register(new WatchMapScreen(this));
    s.register(new BattleScreen(this));
    s.register(new PracticeGroundScreen(this));
    s.register(new DiscoverScreen(this));
    // The page's own static labels (index.html) in the language in use.
    localizeTree(document.body);

    this.preloadFighters();

    this.device.addEventListener('change', () => {
      this.screens.current?.onDeviceChange?.();
      if (this.touchEditor.isOpen) this.touchEditor.refresh();
    });
    requestAnimationFrame(this.loop);
    s.go('splash');
  }

  // Called once by a completed splash. Enter Home before asking a new player
  // for a language; an exited or restarted splash cannot continue.
  continueAfterSplash(isCurrent) {
    if (!isCurrent()) return;
    this.screens.go('home', {}, { reset: true });
    return this.languageDialog.ensureChosen();
  }

  // Re-reads every string on the page in the new language: each marked one
  // (js/core/i18n.js), then the few a screen composes itself.
  localize() {
    localizeTree(document.body);
    for (const screen of this.screens.screens.values()) screen.localize?.();
  }

  // Preloads every playable fighter (while the splash plays): none while
  // none is available, and never a disabled one.
  preloadFighters() {
    for (const def of playableCharacters()) this.loadCharacter(def.id);
  }

  // Loads + normalizes a fighter's frames once. Resolves to a SpriteSet
  // (possibly unusable if every frame failed), or to null without loading
  // anything for an id that is not playable (unknown or disabled).
  loadCharacter(id, onProgress) {
    if (!getPlayableCharacter(id)) return Promise.resolve(null);
    if (this.spriteSets.has(id)) {
      onProgress?.(1, 1);
      return Promise.resolve(this.spriteSets.get(id));
    }
    if (this.spritePromises.has(id)) {
      const p = this.spritePromises.get(id);
      if (onProgress) {
        const def = getCharacter(id);
        const urls = characterFramePaths(def);
        // Report progress for this caller as images settle.
        const tick = () => {
          const done = urls.filter((u) => this.assets.images.has(u) || this.assets.failed.has(u)).length;
          onProgress(done, urls.length);
          if (!this.spriteSets.has(id)) setTimeout(tick, 60);
        };
        tick();
      }
      return p;
    }
    const def = getCharacter(id);
    const promise = this.assets.loadAll(characterFramePaths(def), onProgress).then(({ failed }) => {
      const set = SpriteSet.build(def, (url) => this.assets.get(url));
      if (failed.length) console.error(`[Alva] ${def.displayName}: ${failed.length} frame(s) failed to load`, failed);
      if (!set.usable) console.error(`[Alva] ${def.displayName} has no usable frames.`);
      this.spriteSets.set(id, set);
      this.spritePromises.delete(id);
      return set;
    });
    this.spritePromises.set(id, promise);
    return promise;
  }

  getSprites(id) {
    return this.spriteSets.get(id) || null;
  }

  // Drop a failed load so it can be retried.
  resetCharacter(id) {
    const set = this.spriteSets.get(id);
    if (set && !set.usable) {
      for (const url of characterFramePaths(getCharacter(id))) this.assets.forget(url);
      this.spriteSets.delete(id);
    }
  }

  loop(now) {
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.25) : 0;
    this.lastTime = now;
    this.input.pollGamepads(now);
    this.screens.current?.update(dt);
    requestAnimationFrame(this.loop);
  }
}
