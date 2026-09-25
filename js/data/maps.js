// Map database. All coordinates are world units with y pointing down.
// A fighter's origin is bottom-centre, so spawn/platform `y` values are the
// surface the feet rest on.
//
// Every stage is a finite platform-fighter stage: a compact main stage with
// open air past both ledges, and the Void a short way beyond: a blast zone,
// not a distant world edge. Four separate things, each its own field:
//
// mainStage:    the main floor, finite. Fighters stand on its top (`top`)
//               only between `left` and `right`; past either edge there is
//               nothing to stand on and they fall. Below its top it is a
//               solid body down to `bottom` (a cliff, facade or block face
//               the theme draws in depth), collided like a solid.
// platforms:    one-way surfaces (pass through from below, land from above).
//               `dropThrough` controls whether the training CPU can drop
//               through them (the player has no drop control).
//               `h` is visual slab thickness only; `kind` picks the art.
// solids:       full AABB blocks (collide on every side).
// cameraBounds: where the camera may travel to frame the fight: the stage,
//               the open air around it and a strip of the Void past its
//               edge (cameraAround), never far into the black.
// voidBounds:   the Void, the kill boundary (see StageCollision.inVoid): a
//               fighter whose centre leaves this rectangle is lost to it.
//               Set by margins around the main stage (voidAround): past
//               each ledge by enough to be knocked off, fight briefly and
//               drift back; below the stage's top by enough to fall a
//               little way first; and above it clear of every jump from the
//               highest footing, so only a launch reaches it.
// theme:        key into the stage theme registry (js/stages/index.js).

// The Void's rectangle from margins around `main`: `side` world units past
// each ledge, `top` above the stage's top and `bottom` below it (measured at
// a fighter's centre, like StageCollision.inVoid).
export function voidAround(main, { side, top, bottom }) {
  return Object.freeze({
    left: main.left - side, right: main.right + side, top: main.top - top, bottom: main.top + bottom,
  });
}

// Camera bounds: the Void's rectangle and `margin` world units more on every
// side, so the black edge comes into view as a fighter nears it but the
// camera never wanders deep into it.
export function cameraAround(bounds, margin) {
  return Object.freeze({
    left: bounds.left - margin, right: bounds.right + margin, top: bounds.top - margin, bottom: bounds.bottom + margin,
  });
}

const DESERT_MAIN = Object.freeze({ left: 1120, right: 2480, top: 860, bottom: 2000 });
// No platforms: the rock outcrops are the highest footing.
const DESERT_VOID = voidAround(DESERT_MAIN, { side: 360, top: 760, bottom: 400 });

const CITY_MAIN = Object.freeze({ left: 1080, right: 2520, top: 980, bottom: 2120 });
// A little more headroom than Desert, over its highest deck (272 above the
// roof), and a little more fall below the roof.
const CITY_VOID = voidAround(CITY_MAIN, { side: 340, top: 800, bottom: 420 });

export const MAPS = [
  {
    id: 'desert',
    name: 'Desert',
    tagline: 'Sandstone mesa at golden hour',
    description:
      'A compact sandstone mesa over open desert air. Open footing and clear ledges make it a stage about spacing and movement.',
    traits: [
      ['Terrain', 'Sandstone mesa'],
      ['Obstacles', '2 rock outcrops'],
      ['Platforms', 'None'],
      ['Light', 'Sunset'],
    ],
    mainStage: DESERT_MAIN,
    cameraBounds: cameraAround(DESERT_VOID, 140),
    voidBounds: DESERT_VOID,
    spawnPoints: [
      { x: 1640, facing: 1 },
      { x: 1960, facing: -1 },
    ],
    platforms: [],
    solids: [
      { id: 'rock-west', x: 1210, y: 792, w: 176, h: 68 },
      { id: 'rock-east', x: 2200, y: 796, w: 188, h: 64 },
    ],
    theme: 'desert',
  },
  {
    id: 'city',
    name: 'City',
    tagline: 'Rooftop block after dark',
    description:
      'One rooftop block at night. Vents, girders and catwalks stack into vertical routes above the roof, with the street far below its edges.',
    traits: [
      ['Terrain', 'Rooftop'],
      ['Obstacles', '1 stair bulkhead'],
      ['Platforms', '7 one-way'],
      ['Light', 'Night'],
    ],
    mainStage: CITY_MAIN,
    cameraBounds: cameraAround(CITY_VOID, 140),
    voidBounds: CITY_VOID,
    spawnPoints: [
      { x: 1630, facing: 1 },
      { x: 1970, facing: -1 },
    ],
    platforms: [
      { id: 'rack-west', x: 1110, y: 876, w: 115, h: 16, dropThrough: true, kind: 'rack' },
      { id: 'billboard', x: 1245, y: 752, w: 145, h: 18, dropThrough: true, kind: 'catwalk' },
      { id: 'overpass', x: 1410, y: 830, w: 220, h: 22, dropThrough: true, kind: 'girder' },
      { id: 'tower-deck', x: 1720, y: 708, w: 160, h: 20, dropThrough: false, kind: 'deck' },
      { id: 'scaffold', x: 1960, y: 840, w: 180, h: 16, dropThrough: true, kind: 'scaffold' },
      { id: 'sign-walk', x: 2160, y: 730, w: 140, h: 18, dropThrough: true, kind: 'catwalk' },
      { id: 'rack-east', x: 2315, y: 864, w: 105, h: 16, dropThrough: true, kind: 'rack' },
    ],
    solids: [
      { id: 'bulkhead', x: 2432, y: 884, w: 76, h: 96 },
    ],
    theme: 'city',
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || null;
}
