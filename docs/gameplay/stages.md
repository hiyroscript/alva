# Stages

Every stage is a compact platform-fighter stage. Its map (`js/data/maps.js`,
`js/data/practice-map.js`) keeps four things apart:

- **Main stage** (`mainStage`): the finite main floor. Fighters stand on its
  top only between its `left` and `right` edges; below its top it is a solid
  block (a cliff, facade or block face), drawn and collided exactly alike.
- **Off-stage space**: the open air past both ledges. There are no side walls,
  visible or invisible: fighters can run, jump or be knocked off either ledge
  and fall below the stage, and drift back if they still can.
- **Camera bounds** (`cameraBounds`): where the camera may travel: the Void's
  rectangle plus a 140-unit strip past it (`cameraAround`), so the black edge
  comes into view as a fighter nears it but the camera never wanders deep
  into it.
- **The Void** (`voidBounds`): the kill boundary, a blast zone set by margins
  around the main stage (`voidAround`): 340–380 units past each ledge,
  400–420 below the stage's top and 760–800 above it (clear of any jump from
  the highest footing, so only a launch reaches it). A fighter whose centre
  leaves the Void in force (`StageCollision.inVoid`, which tests
  `stage.void`: this rectangle, except through Quick Battle's overtime) is taken by it: out
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
- **Overtime's closing Void** (Quick Battle only, see
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
the street canyon; Practice Ground a training block against its gridded
wall. All three are drawn in the same pseudo-3D perspective, with the
Practice Ground's projection shared by every stage.

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

## Adding a stage

Add an entry to `MAPS` in [`js/data/maps.js`](../../js/data/maps.js)
(size, ground, bounds, spawns, platforms, solids, its Void and camera
margins), then register a theme renderer in
[`js/stages/index.js`](../../js/stages/index.js). Every `MAPS` entry becomes
a stage on Quick Battle's and Watch Mode's Select Stage; the Practice
Ground stage lives apart in
[`js/data/practice-map.js`](../../js/data/practice-map.js). Its English
name and tagline are read from the map; add their French translations to
[`js/localization/strings/fr.js`](../../js/localization/strings/fr.js)
(`map.<id>.name`, `map.<id>.tagline`).

## Tests

[`tests/systems/platform-stage.test.mjs`](../../tests/systems/platform-stage.test.mjs)
(the stage areas, the Void, the camera, the themes).
