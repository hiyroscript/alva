# Stages

Every stage is a compact platform-fighter stage. Its map (`js/data/maps.js`,
`js/data/practice-map.js`) keeps four things apart:

- **Main stage** (`mainStage`): the finite main floor. Fighters stand on its
  top only between its `left` and `right` edges; below its top it is a solid
  block (a cliff, facade or block face), drawn and collided exactly alike.
  A stage with nothing under its floor keeps that block shallow: Asperitas's
  main cloud is a 64-unit slab with open sky beneath it, never a hidden
  foundation.
- **Off-stage space**: the open air past both ledges. There are no side walls,
  visible or invisible: fighters can run, jump or be knocked off either ledge
  and fall below the stage, and drift back if they still can.
- **Camera bounds** (`cameraBounds`): where the camera may travel: the Void's
  rectangle plus a 140-unit strip past it (`cameraAround`), so the black edge
  comes into view as a fighter nears it but the camera never wanders deep
  into it.
- **The Void** (`voidBounds`): the kill boundary, a blast zone set by margins
  around the main stage (`voidAround`): 340–380 units past each ledge,
  400–420 below the stage's top and 760–840 above it (clear of any jump from
  the highest footing, Asperitas's clouds at their highest included, so
  only a launch reaches it). A fighter whose centre
  leaves the Void in force (`StageCollision.inVoid`, which tests
  `stage.void`: this rectangle, except through a battle's overtime) is taken by it: out
  of play at once (not drawn, hit, targeted or framed), and back at its own
  spawn 2 seconds later (`CONFIG.battle.respawnSeconds`, on the simulation
  clock), fresh. In Quick Battle each fall is also a point for the opponent,
  and the third point ends the match instead (a short **K.O.** beat, then
  the result). Every fall bursts where the fighter went in, in its own
  colours (`visual.eliminationPalette`), paint only. On screen
  the Void is one solid black layer with a single gently wavering edge,
  lined on the stage's side by a thin red rim (about 1.5 CSS px, no glow)
  traced from exactly the same points, so the two never drift apart; it
  only shows once the view nears it (never in neutral play), and holds still
  (rim included) with reduced motion. The drawn edge and its rim are art
  only: they waver around the kill line, never move it. The Shield's circle
  (see Shield) shares this look, black with a red line, on the same kind of
  slow waves.
- **Overtime's closing Void** (Quick Battle and Watch Mode, see
  [Quick Battle](battle.md)): through its 60 seconds the Void's left and
  right edges close in to 120 units past each ledge and its bottom rises
  to 140 below the main stage's top, linearly, from each stage's own
  `voidBounds` (never written: `StageCollision` keeps the map's rectangle
  as `baseVoid` and the one in force as `void`, see `closeVoid`). The top
  never moves, and the Void never reaches a ledge or the surface. The
  drawn Void is traced around the same rectangle collision tests, and its
  waves run up to 4× faster (and hold still with reduced motion). The camera keeps
  the stage's own bounds. Practice Ground's Void never moves.

The camera is a platform-fighter view: fighters stand about a tenth of the
viewport tall, the whole main stage with some air past its ledges fits across
a 16:9 view (narrower screens zoom out further, never below 8.8 %), and the
framing leans toward the stage's centre while it follows the fight.

Desert is a sandstone mesa over open desert air; City a rooftop block over
the street canyon; Asperitas one great cloud adrift high above the cloud
sea, with two drifting cloud hazards over it; Practice Ground a training
block against its gridded wall. All four are drawn in the same pseudo-3D
perspective, with the Practice Ground's projection shared by every stage.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.1.

**Stages are data plus a theme.** Collision comes only from the map data
([`js/data/maps.js`](../../js/data/maps.js),
[`js/data/practice-map.js`](../../js/data/practice-map.js)): the main
stage, platforms (one-way: fighters jump up through them from below),
solids, spawn points and the Void's and camera's margins. Each stage's art
is a procedural Canvas theme ([`js/stages/`](../../js/stages/)): flat
parallax layers (sky, far, mid, near, atmosphere) generated once from a
seeded RNG into cached `Path2D` geometry, and the playable geometry drawn
in one shared one-point perspective
([`js/stages/perspective.js`](../../js/stages/perspective.js)) so it has
depth. Any layer could later be swapped for image art without touching
collision.

## Select Stage: the 24-slot roster

Quick Battle's and Watch Mode's Select Stage
([`js/screens/map-select-screen.js`](../../js/screens/map-select-screen.js),
Watch Mode's an instance of it) is a large live preview of the
highlighted stage beside the **stage roster**: `CONFIG.stageRoster.totalSlots`
(24) slots, laid out six by four on a large display. `stageSlots()`
([`js/data/maps.js`](../../js/data/maps.js)) fills them from the real
registry: the playable stages (`MAPS`, in order) take the first slots
(01 Desert, 02 City, 03 Asperitas) and every other slot is a reserved,
unavailable placeholder (a lock, nothing to press, never focused). No
stage is ever made up for a placeholder, and Practice Ground is never one
of the slots. A new `MAPS` entry simply takes the next slot (the counter,
*3 available / 24 slots*, follows), and the roster grows past 24 only once
the stages outnumber it.

Each stage tile has a still thumbnail (the stage as its map lays it out:
no hazard runs in a thumbnail), its number and name, the standard focus
ring and a green check and underline while it is the selected stage.
Highlighting a tile (keyboard, controller, the controller cursor, or mouse
hover) previews it: the large preview, then its details under the roster
(name, tagline, Selected badge, and its traits, a stage's hazards among
them, called hazards). A pointer press selects a stage and a second press
confirms; a keyboard or controller press selects and confirms at once;
Confirm starts the selected stage. The grid scrolls (the focused tile
brought into view) where it cannot fit: phones held sideways, tall
windows (which stack the preview over the roster).

**Random Stage** sits apart from the 24 slots, beside the counter. It is
an action, not a stage: it picks one of the playable stages at random
(`randomStage` in
[`js/screens/quick-battle-setup.js`](../../js/screens/quick-battle-setup.js),
every stage equally likely, the same pick Regular Play's draw uses),
stores it as this setup's stage, highlights its tile, previews it and
keeps focus on itself so the player can roll again. It never starts the
battle. Quick Battle's choice (`app.selection.mapId`) and Watch Mode's
(`app.selection.watch.mapId`) stay apart.

## Asperitas

A sky stage: open air far above a sea of clouds, in daylight. It has
exactly three surfaces to stand on:

1. **The main cloud** (`mainStage`, 1400 wide): stationary, never a
   hazard, the spawn for both fighters, with open ledges. Its collision is
   a shallow solid slab (64 units) under a flat walkable top; its art is a
   billowing mass of vapour (rows of puffs receding into depth over a
   billowing front) with nothing beneath it but sky.
2. **Two drifting clouds** (`asperitas-cloud-left`, `asperitas-cloud-right`):
   one-way platforms marked `hazard: true` and `dynamic` (see below). They
   never damage, stun, launch or take anyone: their hazard is that they
   will not stay put.

Its traits: Terrain *Floating clouds*, Platforms *2 moving cloud
platforms*, Hazards *2 shifting cloud hazards*, Obstacles *None*, Light
*Daylight*. The theme is
[`js/stages/asperitas-theme.js`](../../js/stages/asperitas-theme.js):
the sky, sun and rays, far cumulus, cirrus, cloud banks and the cloud sea
in parallax, clouds drifting by below; the clouds you stand on drawn in
bright white with lavender shadows, the hazards with a gentle cool rim
and glow beneath (never warning red), a soft breathing of their
underside, faint trails while they drift, and a fade-out and forming
effect. Their walkable top is always exactly their collision.

## Platform hazards

A **dynamic platform** is a one-way platform whose map entry has a
`dynamic` block: `behavior` (its tuning, by key, in
[`js/data/platform-hazards.js`](../../js/data/platform-hazards.js)),
`region` (where its collision slab may ever be), `moves` (the axes it
drifts on), `disappears`, `reappearance: 'random'` and `mainClearance`
(the room it keeps above the main stage). `x` / `y` are only where it
starts. Every battle (and every animated preview) builds its own runtime
copy (`StageCollision.platforms`; the map is never written) and a
`PlatformHazards` system ([`js/game/platform-hazards.js`](../../js/game/platform-hazards.js))
with one **HazardController** per platform.

**Independent state machines.** Each controller has its own random stream
(`deriveSeed(battleSeed, stream of its id)`), state, timer, duration,
direction, speed, start and destination, opacity, collision and hidden
time. Nothing is shared, so the two clouds line up only by chance (a
cloud runs exactly the same whether or not the other exists). The states:

| State | What it does |
| --- | --- |
| `idle` | Holds still (1.5–4 s). |
| `horizontal` | Eases left or right (60–140 units over 2–5 s, a sine ease: it starts and ends at rest). |
| `vertical` | Eases up or down (35–90 units over 2–5 s). |
| `disappearing` | Fades out where it is (0.5–0.9 s), still solid. |
| `hidden` | Invisible with no collision (1–2.5 s); relocates. |
| `reappearing` | Fades in at its new place (0.5–0.9 s), still; solid from 55% of the fade. |

When an ordinary state ends, the next is drawn by weight from idle,
horizontal, vertical and disappearing (never disappearing straight after
forming). Disappearing always runs disappearing → hidden → reappearing.
A move keeps inside the region (the other way, or shortened, if there is
no room); a move that would sweep into anything another platform holds is
refused and the cloud idles instead.

**Random reappearance.** As it vanishes, the cloud chooses where it will
form again, anywhere in its region in both x and y: random candidates
first (the first valid one at least 120 units from where it vanished),
then the region's corners and middle, then the farthest valid place
found. A place is valid if it is inside the region, clear of the main
cloud's keep-out and of everything the other hazard holds (where it is,
the rest of its move, where it will form), clear of every fighter's
collider, and inside the Void in force (overtime's included) with room to
stand. It moves there on its first fully hidden step, never while any of
it can be seen. As its hidden time ends it checks the place again (a
fighter may have moved in) and picks a fresh one if needed; if nowhere is
valid it waits hidden and tries again, a bounded search each time. It
forms still, where it is; it becomes solid only once nobody is inside it
(until then it holds half-formed and not solid), so it never forms into a
fighter or pushes anyone.

**Never touching.** Each region's whole envelope (the region with the
cloud's art around it) is disjoint from the main cloud's keep-out (its
slab and 110 units above its top, room for any fighter beneath) and from
every other region (120 units apart). `assertHazardLayout` refuses a
stage that breaks this as it is built, so no move can ever bring two
platforms together; every move and placement is validated again on top.

**Fighters.** Each fixed step the hazards move first (`Arena.update`),
and anyone standing on a cloud that has just vanished lets go of it
(`releaseGround`: no push, no speed taken or given). Then each fighter is
carried by its platform's movement this step (`carryBody`: exactly the
platform's own displacement, so feet stay on a rising or sinking cloud)
before taking its own step, so it walks, runs, Dashes, attacks, Shields
and is launched as ever. A fighter in the air is never carried, so a
jump leaves the cloud behind. A landing counts a platform that moved this
step if the feet were above it as it was or as it is. A cloud that has
vanished is gone from every query (`surfaceBelow`, landings, shadows,
the debug overlay, the CPU); a fighter on it simply falls, its jumps and
actions intact. Fighters and clouds are drawn at the same interpolation
between steps (`StageCollision.interpolate`), so a rider never lags its
cloud. The hazards run on the fixed step only: the same at any frame
rate, and through overtime.

**CPUs** read the live platforms through their `StageModel`: a dynamic
surface is where it is now, one that is hidden or still forming is not a
surface, and one visibly fading is never chosen as a stepping stone. They
know nothing of a hazard's next move. The main cloud stays their fallback
and their recovery target.

## Adding a stage

Add an entry to `MAPS` in [`js/data/maps.js`](../../js/data/maps.js)
(size, ground, bounds, spawns, platforms, solids, its Void and camera
margins, its traits), then register a theme renderer in
[`js/stages/index.js`](../../js/stages/index.js). Every `MAPS` entry becomes
a stage on Quick Battle's and Watch Mode's Select Stage, in the next slot
of the roster (no layout change), with its own still thumbnail and live
preview; Random Stage and Regular Play can draw it at once. The Practice
Ground stage lives apart in
[`js/data/practice-map.js`](../../js/data/practice-map.js). Its English
name, tagline and trait values are read from the map; add their French
translations to
[`js/localization/strings/fr.js`](../../js/localization/strings/fr.js)
(`map.<id>.name`, `map.<id>.tagline`, `map.<id>.trait.<trait>`, and
`map.trait.<trait>` for a trait no stage had before).

A stage with moving or vanishing platforms needs no new code: give a
platform a `dynamic` block naming a behaviour (`cloud-drift`, or a new
one added to [`js/data/platform-hazards.js`](../../js/data/platform-hazards.js)),
with regions that cannot meet (the stage refuses ones that can), and
draw it in its theme from the live platforms the Arena hands over
(`opts.platforms`: each one's `renderX`, `renderY`, `opacity` and
`state`).

## Tests

[`tests/systems/platform-stage.test.mjs`](../../tests/systems/platform-stage.test.mjs)
(the stage areas, the Void, the camera, the themes);
[`tests/systems/platform-hazards.test.mjs`](../../tests/systems/platform-hazards.test.mjs)
(Asperitas's data, each hazard's state machine and stream, random
reappearance, separation over long seeded runs, riding, jumping off and
falling, battles, frame-rate independence, overtime, the CPUs);
[`tests/interface/stage-select.test.mjs`](../../tests/interface/stage-select.test.mjs)
(the 24-slot roster, selection, Random Stage, the preview).
