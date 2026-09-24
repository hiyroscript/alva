// Stage theme registry: map.theme -> renderer class.
// New maps reuse the same interface (see stage-theme.js). `practice` draws
// Practice Ground's training room (js/data/practice-map.js), which is not a
// Quick Battle stage.

import { DesertTheme } from './desert-theme.js';
import { CityTheme } from './city-theme.js';
import { PracticeTheme } from './practice-theme.js';

const THEMES = {
  desert: DesertTheme,
  city: CityTheme,
  practice: PracticeTheme,
};

export function createTheme(map, opts) {
  const Theme = THEMES[map.theme];
  if (!Theme) throw new Error(`[Alva] Unknown stage theme "${map.theme}"`);
  return new Theme(map, opts);
}
