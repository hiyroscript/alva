// Practice Ground's training stage. Same schema as a MAPS entry (see
// js/data/maps.js), but deliberately kept out of MAPS: the Select Stage
// screen offers every MAPS entry as a Quick Battle stage.
//
// One broad, flat floor with no platforms, solids or hazards, and a single
// spawn on the room's centre axis. The bounds sit on grid lines of the
// practice theme (js/stages/practice-theme.js), whose side walls mark them.

export const PRACTICE_MAP = {
  id: 'practice',
  name: 'Practice Ground',
  tagline: 'Training room',
  worldWidth: 4000,
  worldHeight: 1100,
  groundLevel: 900,
  bounds: { left: 320, right: 3680 },
  cameraBounds: { left: 0, right: 4000, top: 0, bottom: 1100 },
  spawnPoints: [
    { x: 2000, facing: 1 },
  ],
  platforms: [],
  solids: [],
  theme: 'practice',
};
