// SELECT CPU: Custom Play's fourth step, between Select Fighter and Select
// Stage. Quick Battle's own instance of the fighter roster screen (see
// js/screens/character-select-screen.js), as Watch Mode's CPU screens are:
// its own screen, roster and preview id. Confirming a fighter makes it the
// CPU's (app.selection.cpuCharacterId, apart from Player 1's characterId; the
// two may be the same fighter) and moves on to Select Stage.

import { CharacterSelectScreen } from './character-select-screen.js';
import { QUICK_BATTLE_CUSTOM_SETUP } from '../ui/components.js';

export class QuickCpuScreen extends CharacterSelectScreen {
  constructor(app) {
    super(app, {
      id: 'quick-cpu',
      title: 'character.cpuTitle',
      setup: QUICK_BATTLE_CUSTOM_SETUP,
      step: 3,
      key: 'cpuCharacterId',
      next: 'map',
      previewId: 'quick-cpu-preview-name',
    });
  }
}
