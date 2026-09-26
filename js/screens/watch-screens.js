// WATCH MODE: Alva's CPU-vs-CPU spectator mode, opened straight from Home.
//
//   Home → Select Difficulty → Select CPU 1 → Select CPU 2 → Select Stage → Battle
//
// Its four setup screens are Quick Battle's own screens configured for Watch
// Mode (the same difficulty cards, fighter roster and stage selector), each
// under the kicker "Watch Mode" with the Watch Mode setup steps. Their
// choices live in app.selection.watch, apart from Quick Battle's, so neither
// setup ever changes the other's. One difficulty drives both CPUs, and CPU 1
// and CPU 2 may be the same fighter. Starting hands the Battle screen
// `mode: 'watch'`: a real Battle where both fighters are the combat AI.

import { DifficultySelectScreen } from './difficulty-select-screen.js';
import { CharacterSelectScreen } from './character-select-screen.js';
import { MapSelectScreen } from './map-select-screen.js';
import { WATCH_SETUP } from '../ui/components.js';

export class WatchDifficultyScreen extends DifficultySelectScreen {
  constructor(app) {
    super(app, {
      id: 'watch-difficulty', setup: WATCH_SETUP, step: 0, selection: () => app.selection.watch, next: 'watch-cpu1',
    });
  }
}

// Select CPU 1 (`cpu` 1) or Select CPU 2 (`cpu` 2): its own screen and
// roster, so the back stack holds both and their preview ids differ.
export class WatchFighterScreen extends CharacterSelectScreen {
  constructor(app, cpu) {
    const id = `watch-cpu${cpu}`;
    super(app, {
      id,
      title: `Select CPU ${cpu}`,
      setup: WATCH_SETUP,
      step: cpu,
      selection: () => app.selection.watch,
      key: `cpu${cpu}CharacterId`,
      next: cpu === 1 ? 'watch-cpu2' : 'watch-map',
      previewId: `${id}-preview-name`,
    });
  }
}

export class WatchMapScreen extends MapSelectScreen {
  constructor(app) {
    super(app, {
      id: 'watch-map', setup: WATCH_SETUP, step: 3, selection: () => app.selection.watch,
      startLabel: 'Confirm and watch battle',
    });
  }

  battleParams() {
    const { mapId, cpu1CharacterId, cpu2CharacterId, difficulty } = this.selection();
    return { mode: 'watch', mapId, cpu1CharacterId, cpu2CharacterId, difficulty };
  }
}
