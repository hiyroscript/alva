// Central application controller: owns the managers, the main
// requestAnimationFrame loop and cross-screen selection state.

import { CONFIG } from '../config.js';
import { AssetLoader } from './asset-loader.js';
import { InputManager } from './input-manager.js';
import { AudioManager } from './audio-manager.js';
import { Device } from './device.js';
import { ScreenManager } from './screen-manager.js';
import { MenuNavigator } from './menu-navigator.js';
import { LoadingOverlay, ConfirmDialog } from '../ui/overlays.js';
import { CHARACTERS, getCharacter, characterFramePaths } from '../data/characters.js';
import { MAPS } from '../data/maps.js';
import { SpriteSet } from '../game/sprite-normalizer.js';

import { SplashScreen } from '../screens/splash-screen.js';
import { HomeScreen } from '../screens/home-screen.js';
import { ModeSelectScreen } from '../screens/mode-select-screen.js';
import { CharacterSelectScreen } from '../screens/character-select-screen.js';
import { MapSelectScreen } from '../screens/map-select-screen.js';
import { HelpCreditsScreen } from '../screens/help-credits-screen.js';
import { BattleScreen } from '../screens/battle-screen.js';
import { PracticeGroundScreen } from '../screens/practice-screen.js';
import { DiscoverScreen } from '../screens/discover-screen.js';

export class App {
  constructor() {
    this.config = CONFIG;
    this.device = new Device().init();
    this.input = new InputManager(CONFIG.bindings);
    this.audio = new AudioManager();
    this.assets = new AssetLoader();
    this.screens = new ScreenManager(this);
    this.nav = new MenuNavigator(this);
    this.loading = new LoadingOverlay(document.getElementById('loading-overlay'));
    this.dialog = new ConfirmDialog(document.getElementById('confirm-dialog'), this);

    // Quick Battle's choices. Practice Ground keeps its own fighter.
    this.selection = {
      mode: 'quick-battle',
      characterId: CHARACTERS.find((c) => c.available)?.id ?? null,
      mapId: MAPS[0].id,
    };

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
    s.register(new CharacterSelectScreen(this));
    s.register(new MapSelectScreen(this));
    // No longer linked from Home (Practice Ground took its entry); kept in place.
    s.register(new HelpCreditsScreen(this));
    s.register(new BattleScreen(this));
    s.register(new PracticeGroundScreen(this));
    s.register(new DiscoverScreen(this));

    // Preload every available fighter while the splash plays.
    for (const def of CHARACTERS) if (def.available) this.loadCharacter(def.id);

    this.device.addEventListener('change', () => this.screens.current?.onDeviceChange?.());
    s.go('splash');
    requestAnimationFrame(this.loop);
  }

  // Loads + normalizes a fighter's frames once. Resolves to a SpriteSet
  // (possibly unusable if every frame failed).
  loadCharacter(id, onProgress) {
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
