// Stage theme registry: map.theme -> renderer class.
// New maps reuse the same interface (see stage-theme.js).

import { DesertTheme } from './desert-theme.js';
import { CityTheme } from './city-theme.js';

const THEMES = {
  desert: DesertTheme,
  city: CityTheme,
};

export function createTheme(map, opts) {
  const Theme = THEMES[map.theme];
  if (!Theme) throw new Error(`[Maxy] Unknown stage theme "${map.theme}"`);
  return new Theme(map, opts);
}
