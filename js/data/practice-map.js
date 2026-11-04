// Practice Ground's training stage. Same schema as a MAPS entry (see
// js/data/maps.js), but deliberately kept out of MAPS: the Select Stage
// screen offers every MAPS entry as a Quick Battle stage.
//
// One compact, flat training block with no platforms, solids or hazards,
// open air past both of its edges and the Void a short way beyond: the same
// main-stage length (MAIN_STAGE_LENGTH) and the same Void margins
// (VOID_MARGINS) as every Quick Battle stage. Player 1 spawns on the room's
// centre axis; the optional practice CPU spawns 320 units to its right (as
// far apart as Quick Battle's two starting fighters), facing it. The
// block's edges sit on major lines of the practice theme's grid, which runs
// from that centre axis (js/stages/practice-theme.js).

import { voidAround, cameraAround, mainStageAround } from './maps.js';

const MAIN = mainStageAround(2000, 900, 2040);
const VOID = voidAround(MAIN);

export const PRACTICE_MAP = {
  id: 'practice',
  name: 'Practice Ground',
  tagline: 'Training room',
  mainStage: MAIN,
  cameraBounds: cameraAround(VOID),
  voidBounds: VOID,
  spawnPoints: [
    { x: 2000, facing: 1 },
    { x: 2320, facing: -1 },
  ],
  platforms: [],
  solids: [],
  theme: 'practice',
};
