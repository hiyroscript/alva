// Practice Ground's training stage. Same schema as a MAPS entry (see
// js/data/maps.js), but deliberately kept out of MAPS: the Select Stage
// screen offers every MAPS entry as a Quick Battle stage.
//
// One compact, flat training block with no platforms, solids or hazards,
// open air past both of its edges and the Void beyond. Player 1 spawns on
// the room's centre axis; the optional practice CPU spawns 320 units to its
// right (as far apart as Quick Battle's two starting fighters), facing it.
// The block's edges and both spawns sit on grid lines of the practice theme
// (js/stages/practice-theme.js).

export const PRACTICE_MAP = {
  id: 'practice',
  name: 'Practice Ground',
  tagline: 'Training room',
  mainStage: { left: 1360, right: 2640, top: 900, bottom: 2040 },
  cameraBounds: { left: 340, right: 3660, top: -420, bottom: 1800 },
  voidBounds: { left: 500, right: 3500, top: -260, bottom: 1640 },
  spawnPoints: [
    { x: 2000, facing: 1 },
    { x: 2320, facing: -1 },
  ],
  platforms: [],
  solids: [],
  theme: 'practice',
};
