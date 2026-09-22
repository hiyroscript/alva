// Map database. All coordinates are world units with y pointing down.
// A fighter's origin is bottom-centre, so spawn/platform `y` values are the
// surface the feet rest on.
//
// platforms: one-way surfaces (pass through from below, land from above).
//            `dropThrough` controls whether Down drops through them.
//            `h` is visual slab thickness only; `kind` picks the art.
// solids:    full AABB blocks (collide on every side).
// bounds:    horizontal playable limits for fighter colliders.
// theme:     key into the stage theme registry (js/stages/index.js).

export const MAPS = [
  {
    id: 'desert',
    name: 'DESERT',
    tagline: 'Sandstone basin at golden hour',
    description:
      'A wide, sun-baked basin ringed by mesas. Open footing and long sightlines make it a stage about spacing and movement.',
    traits: [
      ['Terrain', 'Open sand'],
      ['Obstacles', '2 rock outcrops'],
      ['Platforms', 'None'],
      ['Light', 'Sunset'],
    ],
    worldWidth: 3600,
    worldHeight: 1000,
    groundLevel: 860,
    bounds: { left: 150, right: 3450 },
    cameraBounds: { left: 0, right: 3600, top: 0, bottom: 1000 },
    spawnPoints: [
      { x: 1640, facing: 1 },
      { x: 1960, facing: -1 },
    ],
    platforms: [],
    solids: [
      { id: 'rock-west', x: 640, y: 792, w: 176, h: 68 },
      { id: 'rock-east', x: 2780, y: 796, w: 188, h: 64 },
    ],
    theme: 'desert',
  },
  {
    id: 'city',
    name: 'CITY',
    tagline: 'Rooftop district after dark',
    description:
      'A dense rooftop block at night. Vents, girders and catwalks stack into vertical routes above the main roof.',
    traits: [
      ['Terrain', 'Rooftops'],
      ['Obstacles', '1 stair bulkhead'],
      ['Platforms', '7 one-way'],
      ['Light', 'Night'],
    ],
    worldWidth: 3000,
    worldHeight: 1100,
    groundLevel: 980,
    bounds: { left: 130, right: 2870 },
    cameraBounds: { left: 0, right: 3000, top: 0, bottom: 1100 },
    spawnPoints: [
      { x: 1330, facing: 1 },
      { x: 1670, facing: -1 },
    ],
    platforms: [
      { id: 'rack-west', x: 330, y: 876, w: 200, h: 16, dropThrough: true, kind: 'rack' },
      { id: 'billboard', x: 560, y: 752, w: 230, h: 18, dropThrough: true, kind: 'catwalk' },
      { id: 'overpass', x: 960, y: 830, w: 380, h: 22, dropThrough: true, kind: 'girder' },
      { id: 'tower-deck', x: 1420, y: 708, w: 190, h: 20, dropThrough: false, kind: 'deck' },
      { id: 'scaffold', x: 1700, y: 840, w: 300, h: 16, dropThrough: true, kind: 'scaffold' },
      { id: 'sign-walk', x: 2080, y: 730, w: 220, h: 18, dropThrough: true, kind: 'catwalk' },
      { id: 'rack-east', x: 2400, y: 864, w: 220, h: 16, dropThrough: true, kind: 'rack' },
    ],
    solids: [
      { id: 'bulkhead', x: 2690, y: 884, w: 150, h: 96 },
    ],
    theme: 'city',
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || null;
}
