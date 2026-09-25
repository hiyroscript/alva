// Practice Ground's training stage. Same schema as a MAPS entry (see
// js/data/maps.js), but deliberately kept out of MAPS: the Select Stage
// screen offers every MAPS entry as a Quick Battle stage.
//
// One compact, flat training block with no platforms, solids or hazards,
// open air past both of its edges and the Void a short way beyond (a little
// further past the ledges than Quick Battle's wider stages, as the block is
// narrower). Player 1 spawns on
// the room's centre axis; the optional practice CPU spawns 320 units to its
// right (as far apart as Quick Battle's two starting fighters), facing it.
// The block's edges and both spawns sit on grid lines of the practice theme
// (js/stages/practice-theme.js).

import { voidAround, cameraAround } from './maps.js';

const MAIN = Object.freeze({ left: 1360, right: 2640, top: 900, bottom: 2040 });
const VOID = voidAround(MAIN, { side: 380, top: 760, bottom: 400 });

export const PRACTICE_MAP = {
  id: 'practice',
  name: 'Practice Ground',
  tagline: 'Training room',
  mainStage: MAIN,
  cameraBounds: cameraAround(VOID, 140),
  voidBounds: VOID,
  spawnPoints: [
    { x: 2000, facing: 1 },
    { x: 2320, facing: -1 },
  ],
  platforms: [],
  solids: [],
  theme: 'practice',
};
