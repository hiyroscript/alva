// Map database. All coordinates are world units with y pointing down.
// A fighter's origin is bottom-centre, so spawn/platform `y` values are the
// surface the feet rest on.
//
// Every stage is a finite platform-fighter stage: a compact main stage with
// open air past both ledges, and the Void far beyond. Four separate things,
// each its own field:
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
//               the open air around it and the Void's edge.
// voidBounds:   the Void, the kill boundary (see StageCollision.inVoid): a
//               fighter whose centre leaves this rectangle is lost to it. It
//               sits far past the ledges, well below the stage and high above
//               it, independent of the stage and the camera.
// theme:        key into the stage theme registry (js/stages/index.js).

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
    mainStage: { left: 1120, right: 2480, top: 860, bottom: 2000 },
    cameraBounds: { left: 100, right: 3500, top: -460, bottom: 1760 },
    voidBounds: { left: 260, right: 3340, top: -300, bottom: 1600 },
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
    mainStage: { left: 1080, right: 2520, top: 980, bottom: 2120 },
    cameraBounds: { left: 60, right: 3540, top: -340, bottom: 1880 },
    voidBounds: { left: 220, right: 3380, top: -180, bottom: 1720 },
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
