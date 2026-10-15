// Map database. All coordinates are world units with y pointing down.
// A fighter's origin is bottom-centre, so spawn/platform `y` values are the
// surface the feet rest on.
//
// Every stage is a platform-fighter stage: a compact main stage (the combat
// area), and the Void a short way beyond it: a blast zone, not a distant
// world edge. Most have open air past both ledges; a stage whose ground is
// continuous (Adamaris's beach, `ground`) has none. Separate things, each
// its own field:
//
// ground:       optional, the kind of main floor (js/game/physics.js
//               resolveGround): { type: 'finite' } (the default: the main
//               stage below) or { type: 'continuous', reach }, ground at the
//               main stage's top running `reach` world units past each side
//               of the Void, so there is no ledge anywhere a fighter can be.
//               mainStage then stays the combat area the camera frames and
//               the Void (overtime's closing one included) is set around;
//               only collision reaches further. A side elimination is the
//               Void's, as on every stage.
// mainStage:    the main floor, finite. Fighters stand on its top (`top`)
//               only between `left` and `right`; past either edge there is
//               nothing to stand on and they fall. Below its top it is a
//               solid body down to `bottom` (a cliff, facade or block face
//               the theme draws in depth), collided like a solid. A stage
//               with nothing under its floor (Asperitas's cloud) keeps
//               `bottom` shallow: a slab, never a hidden foundation.
// platforms:    one-way surfaces (pass through from below, land from above).
//               `dropThrough` controls whether the training CPU can drop
//               through them (the player has no drop control).
//               `h` is visual slab thickness only; `kind` picks the art.
//               `hazard: true` marks a stage hazard; `dynamic` makes it
//               move (see below).
// dynamic:      on a platform: it is not fixed. Its controller
//               (js/game/platform-hazards.js) moves it and switches it off
//               and on, with the behaviour `behavior` names
//               (js/data/platform-hazards.js); `x` / `y` are only where it
//               starts. `region` is where its collision slab may ever be
//               (x from `left` to `right`, its surface y from `top` to
//               `bottom`); `moves` the axes it drifts on; `disappears`
//               whether it fades out, hides and forms again;
//               `reappearance: 'random'` that it forms again anywhere in its
//               region, never back where it went; `mainClearance` the room
//               it keeps above the main stage's top. Every region's whole
//               envelope is disjoint from the main stage's and from every
//               other hazard's (checked as a stage is built), so platforms
//               never meet.
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
// hazards:      optional stage hazards that are not platforms (see
//               js/data/stage-hazards.js and js/game/stage-hazards.js): each
//               { id, behavior, ... } runs its own controller, e.g.
//               Adamaris's volcano, whose falling rocks strike the beach.
// theme:        key into the stage theme registry (js/stages/index.js).

import { CONFIG } from '../config.js';

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

// Yerma (id desert) and Sol-Noir (id city): their ids are the ones they
// were first given, kept so every reference stays valid.
const DESERT_MAIN = Object.freeze({ left: 1120, right: 2480, top: 860, bottom: 2000 });
// No platforms: the rock outcrops are the highest footing.
const DESERT_VOID = voidAround(DESERT_MAIN, { side: 360, top: 760, bottom: 400 });

const CITY_MAIN = Object.freeze({ left: 1080, right: 2520, top: 980, bottom: 2120 });
// A little more headroom than Desert, over its highest deck (272 above the
// roof), and a little more fall below the roof.
const CITY_VOID = voidAround(CITY_MAIN, { side: 340, top: 800, bottom: 420 });

// A cloud slab floating in open sky: its collision is the cloud's dense
// core, 64 units deep, with nothing at all beneath it.
const ASPERITAS_MAIN = Object.freeze({ left: 1100, right: 2500, top: 900, bottom: 964 });
// More headroom than City: the drifting clouds can rise to 290 above the
// main cloud, and no jump from the highest of them reaches the line.
const ASPERITAS_VOID = voidAround(ASPERITAS_MAIN, { side: 360, top: 840, bottom: 400 });

// Asperitas's two drifting clouds: hazards because they will not stay put
// (they drift, rest, fade out from under a fighter and form again
// elsewhere), never because they hurt. Each keeps to its own half of the
// sky above the main cloud: 120 units between the two regions (92 between
// their art), and their lowest art stays 110 above the main cloud's top
// (room for any fighter to stand beneath).
const CLOUD = Object.freeze({
  h: 30, dropThrough: true, kind: 'cloud', hazard: true,
});
const cloudHazard = (region) => Object.freeze({
  behavior: 'cloud-drift',
  region: Object.freeze(region),
  moves: Object.freeze(['horizontal', 'vertical']),
  disappears: true,
  reappearance: 'random',
  mainClearance: 110,
});

// Adamaris: a beach. Its sand is the ground itself, continuous past both
// sides of the Void (no ledge, no slab, nothing to walk off), with the same
// compact combat area and blast zone as every other stage around it; and
// there are no platforms or solids on the sand, only open beach. Its top
// line is 800 above the sand (as City's), well clear of every jump.
const ADAMARIS_MAIN = Object.freeze({ left: 1100, right: 2500, top: 900, bottom: 1300 });
const ADAMARIS_VOID = voidAround(ADAMARIS_MAIN, { side: 360, top: 800, bottom: 400 });

export const MAPS = [
  {
    id: 'desert',
    name: 'Yerma',
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
    name: 'Sol-Noir',
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
  {
    id: 'asperitas',
    name: 'Asperitas',
    tagline: 'Above the clouds, beyond the horizon',
    description:
      'One great cloud adrift high above the cloud sea, with two smaller clouds drifting over it. They move, rest, fade away and form again somewhere new.',
    traits: [
      ['Terrain', 'Floating clouds'],
      ['Platforms', '2 moving cloud platforms'],
      ['Hazards', '2 shifting cloud hazards'],
      ['Obstacles', 'None'],
      ['Light', 'Daylight'],
    ],
    mainStage: ASPERITAS_MAIN,
    cameraBounds: cameraAround(ASPERITAS_VOID, 140),
    voidBounds: ASPERITAS_VOID,
    spawnPoints: [
      { x: 1640, facing: 1 },
      { x: 1960, facing: -1 },
    ],
    platforms: [
      {
        id: 'asperitas-cloud-left', x: 1290, y: 700, w: 184, ...CLOUD,
        dynamic: cloudHazard({ left: 1180, right: 1740, top: 610, bottom: 730 }),
      },
      {
        id: 'asperitas-cloud-right', x: 2120, y: 650, w: 170, ...CLOUD,
        dynamic: cloudHazard({ left: 1860, right: 2420, top: 610, bottom: 730 }),
      },
    ],
    solids: [],
    theme: 'asperitas',
  },
  {
    id: 'adamaris',
    name: 'Adamaris',
    tagline: 'A paradise beneath a restless volcano',
    description:
      'Golden sands stretch along a tropical sea beneath a towering volcano. Watch the crater carefully: sudden eruptions send volcanic rocks crashing onto the beach.',
    traits: [
      ['Terrain', 'Tropical beach'],
      ['Platforms', 'Continuous ground'],
      ['Hazards', 'Volcanic rockfall'],
      ['Obstacles', 'None'],
      ['Light', 'Tropical daylight'],
    ],
    ground: Object.freeze({ type: 'continuous', reach: 2400 }),
    mainStage: ADAMARIS_MAIN,
    cameraBounds: cameraAround(ADAMARIS_VOID, 140),
    voidBounds: ADAMARIS_VOID,
    spawnPoints: [
      { x: 1640, facing: 1 },
      { x: 1960, facing: -1 },
    ],
    platforms: [],
    solids: [],
    // The volcano in the distance, its rocks landing anywhere across the
    // beach's combat area (`targets`: x from `left` to `right`).
    hazards: [
      Object.freeze({ id: 'adamaris-volcano', behavior: 'volcano', targets: Object.freeze({ left: 1060, right: 2540 }) }),
    ],
    theme: 'adamaris',
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || null;
}

// Select Stage's roster: CONFIG.stageRoster.totalSlots slots (more only if
// the stages outnumber it), in order, each { index, num, map }: the
// playable stages of `maps` (MAPS: every entry is one; Practice Ground is
// not among them) in the first slots, and `map` null for every reserved
// placeholder after them. Nothing about a placeholder is a stage: no map
// is ever made up for one.
export function stageSlots(maps = MAPS, total = CONFIG.stageRoster.totalSlots) {
  const count = Math.max(total, maps.length);
  return Array.from({ length: count }, (_, index) => ({
    index, num: String(index + 1).padStart(2, '0'), map: maps[index] ?? null,
  }));
}

// A trait's id, from its English label ('Terrain' → 'terrain'): the key
// its translations go by (map.trait.<id>, map.<map>.trait.<id>).
export const traitId = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
