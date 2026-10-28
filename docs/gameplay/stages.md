# Stages

Every stage is a compact platform-fighter stage. Its map (`js/data/maps.js`,
`js/data/practice-map.js`) keeps four things apart:

- **Ground** (`ground`, optional): the kind of main floor. `finite` (the
  default) is the main stage below, with a ledge at each end. `continuous`
  (Adamaris's beach, `{ type: 'continuous', reach }`) is ground at the main
  stage's top that runs `reach` world units past each side of the Void
  (`resolveGround` in `js/game/physics.js`): real collision everywhere a
  fighter can be, so there is no ledge to walk off, no slab, cliff or wall;
  the main stage is then the combat area the camera frames and the Void
  (overtime's closing one included) is set around, exactly as on every
  other stage, and only the side Void ends a run along the sand. A finite
  floor may be divided into **sections** (`{ type: 'finite', sections }`,
  Jökull's glacier, see below): contiguous blocks side by side tiling the
  main stage exactly, at one height, each its own solid; a `breakable` one
  can be switched off for good by the stage hazard that names it, and the
  one under the main stage's centre never can.
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
  and the third point ends the match instead (at once: the loser stays
  out, and after the match nobody respawns). Every fall bursts where the fighter went in, in its own
  colours (`visual.eliminationPalette`), paint only, and the Void itself
  ripples where the fighter's centre crossed its boundary (every side and
  corner, overtime's closed edge included): a bright pulse there, its black
  edge and red rim heaving in a damped wave that runs out along it, the rim
  burning brighter, and rings spreading through the black; still and fading
  with reduced motion. Paint only: the kill line never moves for it. On screen
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

Yerma (id `desert`) is a sandstone mesa over open desert air; Sol-Noir (id
`city`) a rooftop block over the street canyon; Asperitas one great cloud
adrift high above the cloud sea, with two drifting cloud hazards over it;
Adamaris a tropical beach under a volcano that throws rocks onto the sand;
Jökull one great glacier over a frozen abyss, whose two outer sections
break away under repeated landings, under sudden blizzards;
Practice Ground a training block against its gridded wall. All six are
drawn in the same pseudo-3D perspective, with the Practice Ground's
projection shared by every stage. (Yerma and Sol-Noir were first called
Desert and City; their ids, themes and layouts are unchanged.)

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.1.

**Stages are data plus a theme.** Collision comes only from the map data
([`js/data/maps.js`](../../js/data/maps.js),
[`js/data/practice-map.js`](../../js/data/practice-map.js)): the main
stage, platforms (one-way: fighters jump up through them from below, and
a tap of Down drops a fighter through one unless its `dropThrough` is
false, see [Platform drop](../systems/movement.md#platform-drop)),
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
(01 Yerma, 02 Sol-Noir, 03 Asperitas, 04 Adamaris, 05 Jökull) and every other slot is a reserved,
unavailable placeholder (a lock, nothing to press, never focused). No
stage is ever made up for a placeholder, and Practice Ground is never one
of the slots. A new `MAPS` entry simply takes the next slot (the counter,
*5 available / 24 slots*, follows), and the roster grows past 24 only once
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

## Adamaris

A tropical beach at midday, a towering volcano across the bay. Its traits:
Terrain *Tropical beach*, Platforms *Continuous ground*, Hazards *Volcanic
rockfall*, Obstacles *None*, Light *Tropical daylight*.

- **The beach is the ground** (`ground: { type: 'continuous', reach: 2400 }`):
  no platform, slab, ledge, cliff or wall; the sand is collision from far
  past the left Void to far past the right one. The main stage (1400 wide,
  as Asperitas's) is the combat area: the camera, the Void (360 past each
  side, 800 above, 400 below) and overtime's closing Void are set round it
  as on every stage, so the fighters are framed just as large. A fighter
  who runs or is knocked along the sand is taken by the side Void as it
  crosses the line; the sand carries on beneath the black.
- **The volcano** (`hazards: [{ id: 'adamaris-volcano', behavior: 'volcano' }]`,
  tuned in [`js/data/stage-hazards.js`](../../js/data/stage-hazards.js),
  run by [`js/game/stage-hazards.js`](../../js/game/stage-hazards.js)) has
  exactly two states, **dormant** (a little steam, no rocks) and
  **erupting**. When a period ends the next is drawn at random (an eruption
  with a 42 % chance, whatever the last one was), so dormant can follow
  dormant and an eruption an eruption; dormant spells last 6–11 s,
  eruptions 7–11 s, and every match opens with a dormant spell of 4–7 s.
  An eruption shows its phases in order: **buildup** (1.4 s, the crater
  brightening), **burst** (0.6 s, lava and smoke bursting out, the first
  rocks), **active** (more volleys every 1–1.8 s, one to three rocks each)
  and **cooldown** (the last 1.8 s, the plume dying down, no new rocks).
  Rocks already flying finish their flight whatever the volcano does next.
- **Volcanic rocks** are stage hazards, never projectiles: they are not in
  the battle's projectiles, so no Deflect (nor any repelling or erasing
  projectile) can turn one back, take it, erase it or make it anyone's,
  and their hits have no attacker and credit nobody (`source: 'hazard'`,
  `attack: false`). Two sizes, each **1 damage**: a small rock has **Base
  Launch 1**, a large one **Base Launch 2**, both straight up, through the
  shared Launch rules (the damage joins the Launch Point first, then the
  launch is Base Launch × that Launch Point). A raised Shield blocks one
  like any hit. A rock strikes only where it lands, the step it lands: its
  impact (46 units round for a small rock, 72 for a large one, and 110 /
  140 up from the sand) against each fighter's hurtboxes, each fighter in
  it once, both fighters if both are there; nobody high above it.
- **Random landings**: every rock picks its own landing anywhere across the
  combat area (x 1060–2540) from the battle's seed, kept clear of the
  other rocks landing at about the same time; never a fixed list, never
  aimed at a fighter.
- **Red warnings**: from 1.1 s (small) or 1.3 s (large) before it lands,
  each rock's red circle shows on the sand at exactly its landing and
  exactly its impact's reach: a glowing ring over a translucent red
  interior, an inner ring closing in and the rock's shadow growing, all
  brightening as it nears (still, at full strength, with reduced motion).
  It goes the step the rock lands. Nothing is ever struck by a warning.
- **Its art** (`js/stages/adamaris-theme.js`): sky and cumulus, the sun,
  the volcano centred far out on its own island (rocky flanks, gullies,
  forest, a crater that glows, lava running down, steam or a plume of ash,
  lava fountaining), islands and green headlands on the horizon, the sea
  (swells rolling in, glints, the volcano's glow on the water), foam
  washing over wet sand at the shore, the rippled beach with shells and
  pebbles, palms leaning in at the sides, sea spray, drifting sand and
  falling ash. Each rock is drawn flying out of the crater on its own
  bowed path, growing as it comes, with a glowing trail, and lands in a
  flash, a shock ring, thrown sand, fragments and dust (bigger for a large
  rock), with a small shake (none with reduced motion).
- **CPUs** read only what anyone can see: the warnings showing now
  (`StageModel.dangerZones`, never a landing before its warning). A CPU
  standing in one may step out of it after its reaction time; how often it
  notices depends on its level (often for Brutal, far less for Easy, never
  every time). The volcano strikes CPUs exactly as it strikes players.
- **Previews**: the large animated preview runs its own volcano (opening on
  an eruption, so it shows what the stage does); a thumbnail draws it at
  rest.

## Jökull

An immense glacier hanging over an endless frozen abyss on a polar day.
Its traits: Terrain *Frozen glacier*, Platforms *Three connected ice
sections*, Hazards *Collapsing ice and blizzards*, Obstacles *None*, Light
*Polar daylight*. Tagline: *A frozen kingdom on the verge of collapse.*

- **One platform, three sections.** The main stage (x 1100–2500, top 900,
  its ice 330 deep: a real foundation, its jagged underside in view above
  the Void) is a finite floor in three sections side by side
  (`ground: { type: 'finite', sections }`, resolved by `resolveGround` in
  [`js/game/physics.js`](../../js/game/physics.js)): the **west wing**
  (1100–1360, 19 %), the **centre** (1360–2240, 63 %) and the **east
  wing** (2240–2500, 19 %). They are three independent solids
  (`StageCollision.floors`), each its whole block, touching with no gap at
  exactly one height, so the glacier plays and looks as one: a section's
  side stops only a body below its top, and the next one's top is level,
  so running, Dashing, jumping, shielding and fighting cross a seam with
  no wall, step or lost footing. Of two sections under one body, the one
  under its centre is its ground (`stepBody`, `surfaceBelow`), so its
  footing passes from one to the next exactly as its centre crosses the
  seam. Both spawns are on the centre.
- **Why not a continuous ground.** Adamaris's `continuous` ground runs on
  past the Void; here that would leave invisible support where a wing has
  fallen. A sectioned *finite* floor has real ledges at both ends and,
  once a wing is gone, real open air in its place. The camera, the Void
  (360 past each ledge, 420 below the top, 800 above it) and overtime's
  closing Void are set round the glacier's whole starting footprint, so a
  broken wing leaves a gap inside the Void to fall through and recover
  across, and the centre stays wholly inside it, overtime included.
- **The centre** (`jokull-centre`) is permanent: never cracked, never
  switched off (a frozen solid with no `active` flag), the same size all
  match, everyone's footing and recovery target. It shows only decorative
  ancient ice.
- **The wings** are stage hazards (`hazards`: `jokull-west-ice` and
  `jokull-east-ice`, behaviour `ice-section`, tuned by `ICE_SECTION` in
  [`js/data/stage-hazards.js`](../../js/data/stage-hazards.js), run by
  `IceSectionController` in
  [`js/game/stage-hazards.js`](../../js/game/stage-hazards.js)), each with
  its own counter, cracks, timing and stream: nothing passes from one to
  the other or across the centre.
- **What counts as a contact.** One for every new footing a fighter takes
  on a wing, never one per step: the step its ground becomes that wing (a
  jump's, a Super Jump's, an air jump's or an air dash's landing, a fall
  onto it from above, a landing after a launch, in a blizzard or not), or
  its centre crossing the seam from the centre section. The footing lasts
  while it stays on the ground overlapping the wing, so standing,
  walking, shielding, fighting or jittering on the seam add nothing; it
  ends when the fighter leaves the ground or no longer overlaps the wing,
  after which a new footing counts again. A wall or the underside is never
  footing, a launch's rebound is no landing, and a body placed by a spawn
  is not a landing. Both fighters count alike, on the same step too, but a
  wing never counts past its maximum, and nothing counts outside the fight.
- **Durability**: `MAX_ICE_CONTACTS` = **15** (`ICE_SECTION.maxContacts`),
  the one number to change. The damage shows in fifths of it
  (`ICE_DAMAGE_LEVELS`, `iceDamageLevel`): 0 clean thick ice; 1–3 hairline
  fractures; 4–6 branching cracks and frost chips; 7–9 cracks across the
  top and down the front face; 10–12 deep fractures, the inner seam
  opening; 13–14 critical instability, a tremble, and its whole span a
  danger zone; 15 failure. The fracture network is cumulative: each
  contact adds a fracture at its impact or carries an old one further
  (generated once from the wing's own stream and kept, never redrawn at
  random), the cracks darker, wider and more joined up as it goes, on the
  top and the front face alike. Each contact also flashes the ice with
  cold stress spreading from the impact, throws up chips and jolts the
  wing a little.
- **The break** starts on the 15th contact, in three phases:
  **critical** (0.3 s; phase A: the wing shakes, its cracks race and glow
  white and cyan, chips jump off it; still solid), **separating** (0.32 s;
  phase B: torn from the centre along a jagged line, split into its pieces
  over its dark interior; its collision is off from this phase's very
  first step) and **collapsing** (1.1 s; phase C: its nine pieces (its top
  slab and foundation, three by three) and a spray of shards fall, turning,
  pushed out from the centre, powder streaming behind them), then
  **destroyed** for the rest of the match. A small shake comes with the
  fracture and more with the separation (none with reduced motion).
  Whoever stands on a wing as it separates falls (`releaseGround`) with
  every move and recovery intact, unless the centre their collider still
  overlaps holds them up; nobody is taken but by the Void. The pieces are
  art: never projectiles, hits or collision, dropped once well below the
  Void. The centre's exposed edge is drawn torn along the wing's tear line,
  its walkable lip exactly where its collision ends.
- **Gone is gone.** A destroyed wing is out of every query (landings,
  walls, ceilings, `surfaceBelow` and so shadows, projectiles, the debug
  overlay, the CPU), stays gone through falls and respawns, and only a new
  battle or a rematch (`Battle.restart`, `StageHazards.reset`) builds it
  whole again. Every battle (and every preview) has its own; the map is
  never written.
- **The blizzard** (`jokull-blizzard`, behaviour `blizzard`, tuned by
  `BLIZZARD`, run by `BlizzardController`): calm, then a weather check
  after a 5–8 s opening calm and every 12–18 s while calm; each check is
  one draw with exactly `BLIZZARD_CHANCE` = **0.25** (never per step or
  frame). A failed check leaves it calm; a successful one starts a storm:
  **warning** (1–1.5 s, the wind rising, snow thickening, fog drawing in),
  **blizzard** (6–9 s, the whiteout) and **clearing** (1–1.5 s), back to
  calm, after which the checks start again. Only calm checks, so storms
  never overlap, and nothing forces one weather after another. Its clock
  runs on the fixed step from its own stream of the battle's seed, held
  outside the fight. It never touches play: no damage, Launch Point,
  stun, push or pull, and never the ice's durability; the ice cracks and
  breaks through it as ever.
- **Its art** ([`js/stages/jokull-theme.js`](../../js/stages/jokull-theme.js)):
  a pale polar sky, a low sun through icy cloud with its halo, cirrus,
  snow-covered ranges, a frozen plain with ice shelves, seracs and frosted
  rock rising out of the abyss, cold haze thickening into the depths; the
  glacier's snowy top (sastrugi, polished blue ice, frost, drifts at its
  edges), its front face (snow cap, blue-white ice deepening to turquoise
  and navy, strata, light shafts, trapped bubbles, ancient fractures) and
  its toothed underside. Snow falls in three depths on an ambient wind
  with gusts and powder blowing over the ice. A blizzard strengthens all
  of it: driving streaks, fog banks on the wind, the distance fading out
  and a whiteout over the battle canvas (never the HUD) that still leaves
  the glacier and fighters showing; the cracks of a wing about to break
  are drawn again over it, so the cue is never lost. The theme draws only
  the live state (`opts.hazards`): nothing it does changes the ice.
- **CPUs** read the live floor through their `StageModel`: each wing is a
  surface while it is there, with the damage it shows (`damage`,
  `integrity`, `unstable`, `broken`); the main floor's edges (`left`,
  `right`) move in to the centre's own as soon as a wing starts breaking,
  so a recovery, a safe spot or a retreat never aims at missing ice. A
  wing critically unstable or breaking is a danger zone a CPU may step off
  onto the centre after its reaction time, more reliably the higher its
  level, never every time; before that the wings are fought on like any
  footing. The weather is not in what a CPU reads.
- **Previews**: the large animated preview runs its own ice and weather
  in a world of its own as a demonstration (`demo`), since no fighter
  lands there: the wings take contacts on their own timer, crack, break
  away and (only in a preview) form again after a rest, and the weather
  brings a storm at every check. A thumbnail, or reduced motion, draws the
  glacier whole and the weather calm.
- **Reduced motion** changes only the look: no shaking or jolting, no
  pulsing glow, slow snow and wind, a steady storm veil; the cracks, the
  break and its timing are exactly the same.

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

A stage whose floor breaks needs no new code either: divide its finite
`ground` into `sections`, mark the ones that may break `breakable`, and
give each a stage hazard with `behavior: 'ice-section'` naming it
(`section`); add a blizzard with `behavior: 'blizzard'`. Its theme draws
them from `opts.hazards` (`iceFor`, `blizzard`).

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
[`tests/systems/stage-hazards.test.mjs`](../../tests/systems/stage-hazards.test.mjs)
(the volcano's random states and phases, the rocks' damage and Base
Launch, no owner and no Deflect, the Shield, one hit per fighter, the
warnings, random landings, determinism and frame-rate independence,
restarts and clean-up, the CPUs);
[`tests/systems/adamaris.test.mjs`](../../tests/systems/adamaris.test.mjs)
(the stage's registration, its continuous sand, camera, overtime, theme,
and full matches on it);
[`tests/systems/jokull.test.mjs`](../../tests/systems/jokull.test.mjs)
(Jökull's registration, its sectioned glacier and seams, every kind of
contact and what never counts, the damage levels and cracks, the break's
phases and collision, the falling pieces, every query of a destroyed
section, the CPU's live reading and its escape, the blizzard's checks,
chance, states, harmlessness and determinism, respawns and rematches,
overtime, full matches and the theme);
[`tests/systems/void-ripple.test.mjs`](../../tests/systems/void-ripple.test.mjs)
(the Void's ripple);
[`tests/interface/stage-select.test.mjs`](../../tests/interface/stage-select.test.mjs)
(the 24-slot roster, selection, Random Stage, the preview).
