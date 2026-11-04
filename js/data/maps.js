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
//               Void's, as on every stage. A finite floor may be divided
//               into `sections` ({ id, left, right, breakable }, left to
//               right): contiguous blocks tiling the main stage exactly, one
//               height, each its own solid down to its bottom, so the floor
//               plays and looks as one; a `breakable` one is switched off
//               for good by the stage hazard that names it (`section`, see
//               `hazards`), and the one under the main stage's centre is
//               never breakable (Jökull's glacier). Never continuous: past
//               a broken section there is only open air.
// mainStage:    the main floor, finite. Fighters stand on its top (`top`)
//               only between `left` and `right`; past either edge there is
//               nothing to stand on and they fall. Below its top it is a
//               solid body down to `bottom` (a cliff, facade or block face
//               the theme draws in depth), collided like a solid. A stage
//               with nothing under its floor (Asperitas's cloud) keeps
//               `bottom` shallow: a slab, never a hidden foundation.
// platforms:    one-way surfaces (pass through from below, land from above).
//               `dropThrough` controls whether a fighter may drop through
//               them (a player's tap of Down, the training CPU's
//               drop); true unless a platform says otherwise.
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
//               Every finite main stage is MAIN_STAGE_LENGTH (1400) long
//               (right - left), Practice Ground's included; a continuous
//               ground's mainStage, the combat area, is that long too.
// cameraBounds: where the camera may travel to frame the fight: the stage,
//               the open air around it and a strip of the Void past its
//               edge (cameraAround), never far into the black.
// voidBounds:   the Void, the kill boundary (see StageCollision.inVoid): a
//               fighter whose centre leaves this rectangle is lost to it.
//               Set by margins around the main stage (voidAround), the
//               same VOID_MARGINS on every stage: past each ledge by enough
//               to be knocked off, fight briefly and drift back; below the
//               stage's top by enough to fall a little way first; and above
//               it clear of every jump from the highest footing, so only a
//               launch reaches it.
// hazards:      optional stage hazards that are not platforms (see
//               js/data/stage-hazards.js and js/game/stage-hazards.js): each
//               { id, behavior, ... } runs its own controller, e.g.
//               Adamaris's volcano, whose falling rocks strike the beach,
//               Jökull's breakable ice sections (`ice-section`, `section`
//               naming the floor section it breaks) and its blizzard.
// theme:        key into the stage theme registry (js/stages/index.js).

import { CONFIG } from '../config.js';

// Every finite main stage's length, right - left, world units: one size of
// stage everywhere (Practice Ground's training block included), so a
// fighter's spacing, recovery and launches mean the same on every one. A
// continuous ground (Adamaris) runs on past its Void, but its mainStage,
// the combat area the camera frames and the Void is set around, is this
// long too. Each stage keeps its own centre (x 1800; Practice Ground 2000).
export const MAIN_STAGE_LENGTH = 1400;

// The Void-free space, the same on every stage (Practice Ground's and
// Adamaris's included): the Void's margins around the main stage, in world
// units at a fighter's centre (see voidAround). `side` past each ledge,
// `top` above the main stage's top, `bottom` below it. These are the Void
// update's: the shared 360 / 800 / 400 the stages mostly had, then the side
// and top margins pushed back 1.3 times (360 -> 468, 800 -> 1040), the
// bottom left as it was. The top is far clear of every jump from every
// stage's highest footing (Asperitas's highest cloud, 290 over its main
// cloud, Super Jump and triple jump included: about 260 to spare), so only
// a launch reaches it. Overtime closes the Void in from these
// (CONFIG.battle.overtimeVoid, StageCollision.closeVoid).
export const VOID_MARGINS = Object.freeze({ side: 468, top: 1040, bottom: 400 });

// How far the camera may see past the Void's edge on every stage (see
// cameraAround).
const CAMERA_PAST_VOID = 140;

// A main stage centred on `centerX`, MAIN_STAGE_LENGTH long, its top at
// `top` and its body down to `bottom`.
export function mainStageAround(centerX, top, bottom) {
  const half = MAIN_STAGE_LENGTH / 2;
  return Object.freeze({ left: centerX - half, right: centerX + half, top, bottom });
}

// The Void's rectangle from margins around `main`: `side` world units past
// each ledge, `top` above the stage's top and `bottom` below it (measured at
// a fighter's centre, like StageCollision.inVoid).
export function voidAround(main, { side, top, bottom } = VOID_MARGINS) {
  return Object.freeze({
    left: main.left - side, right: main.right + side, top: main.top - top, bottom: main.top + bottom,
  });
}

// Camera bounds: the Void's rectangle and `margin` world units more on every
// side, so the black edge comes into view as a fighter nears it but the
// camera never wanders deep into it.
export function cameraAround(bounds, margin = CAMERA_PAST_VOID) {
  return Object.freeze({
    left: bounds.left - margin, right: bounds.right + margin, top: bounds.top - margin, bottom: bounds.bottom + margin,
  });
}

// Yerma (id desert) and Sol-Noir (id city): their ids are the ones they
// were first given, kept so every reference stays valid.
const DESERT_MAIN = mainStageAround(1800, 860, 2000);
// No platforms: the rock outcrops are the highest footing.
const DESERT_VOID = voidAround(DESERT_MAIN);

// Its highest deck is 272 above the roof.
const CITY_MAIN = mainStageAround(1800, 980, 2120);
const CITY_VOID = voidAround(CITY_MAIN);

// A cloud slab floating in open sky: its collision is the cloud's dense
// core, 64 units deep, with nothing at all beneath it.
const ASPERITAS_MAIN = mainStageAround(1800, 900, 964);
// The drifting clouds can rise to 290 above the main cloud, and no jump
// from the highest of them reaches the Void's top line (VOID_MARGINS.top).
const ASPERITAS_VOID = voidAround(ASPERITAS_MAIN);

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
// there are no platforms or solids on the sand, only open beach.
const ADAMARIS_MAIN = mainStageAround(1800, 900, 1300);
const ADAMARIS_VOID = voidAround(ADAMARIS_MAIN);

// Jökull: one great glacier block over an open frozen abyss, as long as
// every other main stage, its ice 330 deep (a real foundation, its
// underside in view above the Void). Its floor is three sections side by
// side at one height (see `ground`): the centre, 880 wide (63%), permanent;
// the two wings, 260 each (19%), breakable. Both spawns are on the centre,
// and once both wings are gone the centre alone is still wider than any
// Dash and jump needs. The Void is set around the whole glacier as it
// starts (VOID_MARGINS, as everywhere), so a broken wing leaves open air
// inside it to fall through and recover across.
const JOKULL_MAIN = mainStageAround(1800, 900, 1230);
const JOKULL_VOID = voidAround(JOKULL_MAIN);
const JOKULL_SECTIONS = Object.freeze([
  Object.freeze({ id: 'jokull-west', left: JOKULL_MAIN.left, right: JOKULL_MAIN.left + 260, breakable: true }),
  Object.freeze({ id: 'jokull-centre', left: JOKULL_MAIN.left + 260, right: JOKULL_MAIN.right - 260 }),
  Object.freeze({ id: 'jokull-east', left: JOKULL_MAIN.right - 260, right: JOKULL_MAIN.right, breakable: true }),
]);

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
    cameraBounds: cameraAround(DESERT_VOID),
    voidBounds: DESERT_VOID,
    spawnPoints: [
      { x: 1640, facing: 1 },
      { x: 1960, facing: -1 },
    ],
    platforms: [],
    solids: [
      { id: 'rock-west', x: 1190, y: 792, w: 176, h: 68 },
      { id: 'rock-east', x: 2220, y: 796, w: 188, h: 64 },
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
    cameraBounds: cameraAround(CITY_VOID),
    voidBounds: CITY_VOID,
    spawnPoints: [
      { x: 1630, facing: 1 },
      { x: 1970, facing: -1 },
    ],
    platforms: [
      { id: 'rack-west', x: 1130, y: 876, w: 115, h: 16, dropThrough: true, kind: 'rack' },
      { id: 'billboard', x: 1258, y: 752, w: 145, h: 18, dropThrough: true, kind: 'catwalk' },
      { id: 'overpass', x: 1418, y: 830, w: 220, h: 22, dropThrough: true, kind: 'girder' },
      { id: 'tower-deck', x: 1720, y: 708, w: 160, h: 20, dropThrough: false, kind: 'deck' },
      { id: 'scaffold', x: 1953, y: 840, w: 180, h: 16, dropThrough: true, kind: 'scaffold' },
      { id: 'sign-walk', x: 2148, y: 730, w: 140, h: 18, dropThrough: true, kind: 'catwalk' },
      { id: 'rack-east', x: 2295, y: 864, w: 105, h: 16, dropThrough: true, kind: 'rack' },
    ],
    solids: [
      { id: 'bulkhead', x: 2412, y: 884, w: 76, h: 96 },
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
    cameraBounds: cameraAround(ASPERITAS_VOID),
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
    cameraBounds: cameraAround(ADAMARIS_VOID),
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
  {
    id: 'jokull',
    name: 'Jökull',
    tagline: 'A frozen kingdom on the verge of collapse',
    description:
      'An immense glacier suspended above an endless frozen abyss. Its three ice sections appear united, but the outer edges fracture under repeated landings. Beneath swirling snow and sudden blizzards, every step brings the ice closer to breaking.',
    traits: [
      ['Terrain', 'Frozen glacier'],
      ['Platforms', 'Three connected ice sections'],
      ['Hazards', 'Collapsing ice and blizzards'],
      ['Obstacles', 'None'],
      ['Light', 'Polar daylight'],
    ],
    // Finite, never continuous: past a wing that has broken away there is
    // nothing but air.
    ground: Object.freeze({ type: 'finite', sections: JOKULL_SECTIONS }),
    mainStage: JOKULL_MAIN,
    cameraBounds: cameraAround(JOKULL_VOID),
    voidBounds: JOKULL_VOID,
    spawnPoints: [
      { x: 1640, facing: 1 },
      { x: 1960, facing: -1 },
    ],
    platforms: [],
    solids: [],
    // Both wings are hazards (each breaks after its own 15 contacts, see
    // js/data/stage-hazards.js ICE_SECTION), and so is the weather.
    hazards: [
      Object.freeze({ id: 'jokull-west-ice', behavior: 'ice-section', section: 'jokull-west' }),
      Object.freeze({ id: 'jokull-east-ice', behavior: 'ice-section', section: 'jokull-east' }),
      Object.freeze({ id: 'jokull-blizzard', behavior: 'blizzard' }),
    ],
    theme: 'jokull',
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
