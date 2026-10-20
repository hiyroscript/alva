// Stage theme registry: map.theme -> renderer class.
// New maps reuse the same interface (see stage-theme.js). `practice` draws
// Practice Ground's training room (js/data/practice-map.js), which is not a
// Quick Battle stage. `opts`: `reducedMotion`; `platforms`, the live
// runtime platforms to draw (a StageCollision's: where each dynamic one is
// now, see js/game/platform-hazards.js), and a theme handed none draws the
// map's own, where they start; and `hazards`, the live stage hazards (a
// StageHazards, see js/game/stage-hazards.js: Adamaris's volcano and its
// rocks, Jökull's ice sections and weather), and a theme handed none draws
// them at rest (the volcano dormant, the glacier whole, the weather calm).

import { DesertTheme } from './desert-theme.js';
import { CityTheme } from './city-theme.js';
import { AsperitasTheme } from './asperitas-theme.js';
import { AdamarisTheme } from './adamaris-theme.js';
import { JokullTheme } from './jokull-theme.js';
import { PracticeTheme } from './practice-theme.js';

const THEMES = {
  desert: DesertTheme,
  city: CityTheme,
  asperitas: AsperitasTheme,
  adamaris: AdamarisTheme,
  jokull: JokullTheme,
  practice: PracticeTheme,
};

export function createTheme(map, opts) {
  const Theme = THEMES[map.theme];
  if (!Theme) throw new Error(`[Alva] Unknown stage theme "${map.theme}"`);
  return new Theme(map, opts);
}
