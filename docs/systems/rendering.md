# Rendering

Everything drawn on the battle canvas, and how sprites are prepared for
it. Rendering reads the simulation and never feeds back into it. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §3 (assets), §7.1
(stages and camera) and §7.3 (battle chrome).

| Module | Owns |
| --- | --- |
| [`js/game/rendering/sprite-normalizer.js`](../../js/game/rendering/sprite-normalizer.js) | `SpriteSet`: each fighter's loaded clips, normalized once per frame (visible bounds, pixel-grid detection, resampling to one pixel per art pixel, anchors), clip durations (which time the land pose, pending attacks and summon startups; the Dash and the air dash last the universal Dash's length, their clips played once across it), `drawFrame`, `drawCenteredFrame` (projectiles and effects, optionally turned). |
| [`js/game/rendering/sprite-animator.js`](../../js/game/rendering/sprite-animator.js) | `SpriteAnimator`: which frame of which clip a fighter shows, and when a clip restarts (a new key, a new move activation). |
| [`js/game/rendering/ensemble.js`](../../js/game/rendering/ensemble.js) | A fighter drawn as several members ([ensembles](#ensembles)): `EnsembleSprites` (its members' sprite sets as one), `EnsembleAnimator` (every member playing the fighter's state, its formation, glide and idle float), `fighterParts` (what is drawn of any fighter), `buildFighterSprites` and `createAnimator` (the factories every mode builds fighters' art with), `idlePose` (a menu's idle). |
| [`js/game/rendering/camera.js`](../../js/game/rendering/camera.js) | Framing the fighters in play inside the camera bounds: a lead ahead of Player 1 (`LEAD` seconds of its speed, counted to `LEAD_SPEED` at most, so a Dash's burst never swings the view) and a follow quick enough (`FOLLOW_X`, `FOLLOW_Y`) that a fighter at a Dash's speed stays well inside the margin. |
| [`js/game/rendering/hit-fx.js`](../../js/game/rendering/hit-fx.js) | Hit effects from each step's combat events: shake, flash, sparks, trails, rebound sparks, the heal glow (a technique's heal, a charmed hit's, or a hit that feeds on a fear), the lethal launch's slow motion, the Void's elimination burst (`HIT_FX`, `eliminationPalette`). |
| [`js/game/rendering/shield-fx.js`](../../js/game/rendering/shield-fx.js) | The Shield's wavy circle. |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The Energy bar, cooldown rings, Special ability mark, charm mark, fear mark and Mash Combo counter drawn with each fighter. |
| [`js/game/arena.js`](../../js/game/arena.js) | The draw order, a burst's art as it plays (`castEffects`) and the debug overlay. |
| [`js/stages/`](../../js/stages/) | Stage themes (Yerma `desert`, Sol-Noir `city`, Asperitas, Adamaris, Jökull `jokull`, Practice Ground), the shared one-point perspective and the Void (drawn around the bounds the Arena hands it). Asperitas's theme draws its drifting clouds from the live runtime platforms the Arena hands it; Adamaris's draws its volcano, rocks, warnings and impacts from the live stage hazards (`opts.hazards`); Jökull's draws its glacier section by section from them too (each wing's cracks, contacts, break and falling pieces, the centre torn where one went) and its weather (snow, wind and the blizzard's whiteout over the battle canvas, never the HUD). |
| [`js/ui/hud.js`](../../js/ui/hud.js), [`js/ui/sprite-art.js`](../../js/ui/sprite-art.js) | The DOM HUD and portraits (interface, not canvas). |

## Sprites

A fighter's art may come at any raw scale. Each frame is analysed once
when it loads: the alpha channel is read, the visible bounds found, the
pixel-art grid detected from colour transitions (or the clip's
`heightRatio` used where no grid can be detected, or the character's fixed
`visual.pixelSize`), and the frame resampled to one pixel per art pixel.
Every frame is drawn bottom-centre at a stable horizontal anchor (the
upper-body centroid, or the clip's own `anchorX`; the feet, or its own
`anchorY`), so a fighter never grows, shrinks or slides between clips.
Each fighter is drawn at its own art scale (`Arena.pxPerArtOf`), from its
`visual.height`; the view is sized for a fighter of the reference height
(`CONFIG.render.fighterHeight`, 88 units: a fixed camera convention, not
a requirement on any fighter), so a shorter or taller fighter simply
stands shorter or taller on the same stage. Projectile and effect art keeps
its own size, centre-anchored at the fighter's art-pixel scale. Sprites
are drawn with image smoothing off and, where the size allows, whole
device pixels per art pixel. Each clip says which way its art faces
(`sourceFacing`); a frame is mirrored only when the fighter faces the
other way.

Animation keeps up with the speed: the run clip's rate follows the
fighter's speed against the universal top speed, from its
`minSpeedScale` up to its `maxSpeedScale` (1.6 unless the clip says
otherwise) on a Dash's run-on; the Dash's and the air dash's clips are
played once across the universal Dash, whatever their frame count; the
land clip is a pose that running goes straight past; a Mash Combo turn's
clip plays at the turn's rate (2), frame for frame with its strikes. No
frame is ever invented or interpolated: the art's own frames, played faster.

**When a clip restarts.** A clip starts from its first frame when the
fighter's state key changes, when a caller asks (`restart`: an air jump, a
Dash), and when a new **activation** of a move begins: `Fighter.updateState`
hands the animator the record of the move playing (`activationOf`: the
attack's, the technique's, the summon startup's, the Dash's), and a
different record restarts the clip once, as it begins, never on every step.
This fixed the stuck-frame bug: the same attack started on the very step
its last activation ended (a fresh press landing on that step, a Mash
Combo turn of the same move) kept the same key, so `play()` skipped it and
the whole new activation showed the old one's last frame. Nothing else
restarts a clip, so every legitimate hold stays: a single-frame pose, the
Shield held, an impact freeze (`updateState(0)`), and a non-looping clip
shorter than its move holding its last frame until the move ends (every
attack's clip fits inside its attack: none is cut short). A clip with no
usable `fps` holds its first frame, reported once, instead of looping on a
zero-length frame. An ensemble's performers restart their own clips on a
new activation; the members aside play their aside clip, belonging to
none.

## Ensembles

A fighter drawn as several members (its `ensemble`,
[`js/data/ensemble.js`](../../js/data/ensemble.js); #0006) is one fighter
drawn as several parts. Its sprites are an `EnsembleSprites`: one
`SpriteSet` per member, built from the member's own clips, every member at
the one art-pixel size its `visual.height` (the whole group's height at
home) gives; it answers the Fighter as a sprite set does (`has` a clip when
every member whose definition has it loaded it, `duration` the longest
member's pass, the reference member's projectile and effect art). Its
animator is an `EnsembleAnimator`: each member has her own `SpriteAnimator`
and her own place, and on every fixed step

- every member plays the fighter's visual state (Fighter.updateState) in
  her own clip, or, while a move names some of them (`members`), the
  performers play it and the others their `asideAnimation`;
- every member moves toward her place for that state at most `glide` art
  pixels a second (never a jump): home with no performers, a single
  performer at the fighter's origin, several centred on it, the others
  lined up behind the rearmost performer (`retreat`, then `spacing`
  apart), a move's own `formation` over all of it; places are turned the
  way the art faces (Fighter.visualFacing), so a turn glides the group over
  to its mirrored places;
- a member playing her idle clip floats, up to `float.height` off her place
  and back every `float.period`, each on her own beat, faded in and out.

Between steps `Fighter.interpolate` places each member between her last two
places, as it does the body, so the group looks the same at any frame rate.
The renderers draw `fighterParts(f)`: an ordinary fighter's one frame, or
each member's frame at the fighter's interpolated position plus her place,
mirrored by her own clip's `sourceFacing`, back to front (the performers of
a move in front). The Arena draws a fighter, its hit flash and its speed
trail from those parts; the roster's preview, Select Stage's preview and
the HUD portrait draw the group (`idlePose`, `EnsembleSprites.makePortrait`:
every member at home, cropped by `visual.portrait`, its `size` a share of
the group's width). Nothing of it reaches the body, collision or a hitbox.

## Draw order

Each frame first places everything between its last two steps by the same
share (`alpha`): the fighters (`Fighter.interpolate`), the projectiles and
any moving platform (`StageCollision.interpolate`), so a fighter riding a
cloud never lags it on screen. A fighter carried by its platform is drawn
moving from where it stood before the carry.

`Arena.render`, back to front: the stage's background and terrain (on
Adamaris the stage hazards' red warnings and flying rocks are part of its
terrain, behind the fighters, and their impacts' bursts part of its
foreground; on Jökull the glacier's cracks, contacts and falling pieces
are its terrain, and its snow and blizzard its foreground, over the
fighters),
shadows, clones, each fighter in play (the CPU, then Player 1 on top: its
speed trail, the Shield's interior, the fighter, the Shield's rim), the
technique objects, projectiles, hit sparks, the stage's foreground, the
Void (with the ripples where it has just taken a fighter), the elimination
bursts (over the black, where each fighter went in),
then each fighter's markers and status over everything, and the debug
overlay when it is on (`` ` ``: solid platforms where they are drawn, and a
line naming each stage hazard's state). A fighter's shadow and ground ring
lie on the solid surface under it (a moving platform where it is drawn,
as faint as the platform is while it fades); a vanished platform takes
none.

## The Void

`StageTheme.drawVoid(ctx, view, bounds, ripples)` draws the black and its red rim
around `bounds`, which the Arena always passes as its stage's Void in force
(`stage.void`): the map's `voidBounds`, or the closer rectangle of Quick
Battle's overtime (`StageCollision.closeVoid`). The theme keeps no copy and
never decides the boundary, so the drawn edge and the kill line can never
drift apart. Its waves (`VOID.waves`) run on the theme's clock plus
`voidSurge`, the extra wave motion `advanceVoid(dt, speed)` adds while the
Arena's `voidWaveSpeed` is above 1 (up to 4× through overtime): a change of
speed never jumps their phase, and their shape, amplitude, rim and black
never change. `resetVoid` brings them back to normal on a restart. With
reduced motion they hold still at any speed.

**The ripple.** Whenever the Void takes a fighter, `Arena.checkVoid` finds
where its centre crossed the boundary this step (`voidCrossing`: the point
on the line from its centre a step ago to its centre now, on the side it
reached first; a centre the closing Void passed over is anchored to the
nearest point of the boundary) and hands it to `HitEffects.addVoidRipple`,
before the fighter-coloured burst. Each ripple (`HIT_FX.voidRipple`, 1.5 s)
is laid over the slow waves of its own side, and of a side whose line runs
within 70 units of it (a corner), by `rippleOffset`: a dip right where the
fighter went in, a ringing swell there and a damped wave packet running out
along the edge both ways at 520 units / s, all dying away; the black and the
rim are traced from the same rippled points, so they heave together.
`drawVoidRipples` then lights it: a crimson stir and rings spreading through
the black (clipped to it), the rim burning brighter along the disturbed
stretch, and a bright pulse at the point. Two eliminations make two
ripples, each ageing on its own; they expire and a restart clears them.
With reduced motion only a still dip, a still ring and the pulse show, and
the elimination shakes nothing. Paint only: the kill line, scoring and
respawns never read it.

## Projectile spin

A projectile whose definition has a `rotationSpeed` (degrees per second,
clockwise on screen; 0 by default) spins as it flies: #0001's Red, Maximum
Blue and Hollow Purple at 2160, six whole turns a second. The angle is its
rotationSpeed × its own age (`projectileAngle`; `Projectile.angle` on the
fixed step, `renderAngle` from the age interpolated between steps like its
position), so it is the same at any frame rate and never reads a clock of
its own. `drawCenteredFrame` translates to the projectile's centre,
rotates, mirrors if the art travels the other way, and draws round the
normalized anchor at the usual scale; with no rotation it draws exactly as
it always has. It is art only: the hitbox, velocity, launches, pulls and
clashes never turn, and being turned back (a repel or a Deflect) never
resets it. A projectile is drawn at the art-pixel scale of the fighter
whose art it is, whoever owns it now.

## Fighter status

Above each on-screen fighter's name tag, the bright purple **Energy bar**
shows only below full and turns gray during exhaustion. Under the feet, a
centered row shows only active cooldowns with a duration **above 0.5 seconds**
(the cooldown policy's 3 s and 5 s, [combat](combat.md#cooldowns)):
#0001 Unlimited Void (3 s), Hollow Purple (5 s), #0002 Whirlwind (5 s),
#0003 Mystical Palm Technique (3 s), #0004 Ievan Polkka (5 s) and World is
Mine (3 s), #0005 Deadlights (3 s) and Red Balloon (3 s), #0006 Ice Breath (3 s), #0007 Rocket Launcher (5 s), #0008 Feast (3 s) and Gum-Gum Giant Pistol (5 s), long ordinary attacks as well as summons
and techniques. The fighter the ability HUD shows
([input](input.md#the-ability-hud)) has no rings while that HUD is on show
(`Arena.hudCooldownsFor`, set by the screen each frame): the HUD carries its
cooldowns, so the same timer is never shown twice as prominently. The CPU,
Watch Mode's fighters and a player on a touch screen keep their rings.

Each white, black-outlined ring fills clockwise from the top. Its center shows
the same art as its touch button, selected once by `js/data/ability-preview.js`
from `mobileAbilities`: Unlimited Void's `attack4_cast` frame 5, Hollow Purple's
`projectileAnimations.attack5_object` frame 0, Whirlwind's
`projectileAnimations.extra_attack_object` frame 2; the Heavenly Foot of
Pain's `midair_attack2` frame 2, Cherry Blossom Impact's `attack3_cast` frame 2
and the Mystical Palm Technique's `attack4_cast` frame 3; Ievan Polkka's
`projectileAnimations.attack4_object` frame 0 (the little double) and World is
Mine's `attack5_release` frame 0. The renderer uses the
fighter's loaded normalized sprites and `drawCenteredFrame`, preserving colors
and transparency with smoothing off. There is no dependency on UI/DOM code and
no duplicated preview definition. Missing art is not invented.

Remaining seconds (`4.3`, one decimal rounded up) appear below the ring in
outlined white text. No internal codename appears. Baseline timers are implicit;
ready timers draw nothing and leave no gap in the centered row.

### The Special ability mark

While a fighter performs one of its **Special abilities**
([combat](combat.md#special-abilities): #0001's Unlimited Void and Hollow
Purple, #0003's Mystical Palm Technique, #0004's World is Mine, #0005's
Deadlights and Red Balloon, #0006's Ice Breath, #0007's Rocket Launcher, #0008's Feast and Gum-Gum Giant Pistol), a bright orange (`#ff9f1c`)
exclamation mark with a dark outline floats over it, centered above the
top of its status column (its Energy bar while that shows, else its name
tag: `Arena.specialMarkRect`, `specialMarkRect` in
[`fighter-status.js`](../../js/game/rendering/fighter-status.js)), so it
never covers the fighter's art, its tag, its bar or its cooldown rings. It
is drawn as shapes (a bar rounded at both ends, wider at the top, over a
dot), not a font glyph, crisp at any device pixel ratio: 17 world units
tall at the view's scale, never under 16 nor over 34 CSS pixels. It bobs
up to 2 CSS pixels on a 1.1 s cycle (`specialMarkBob`), held still with
reduced motion. `Arena.statusTop` counts it while it shows, so Practice
Ground's damage numbers float above it.

It shows exactly while the Special is being performed, read live every
frame (`activeSpecialAbility` in
[`move-status.js`](../../js/game/combat/move-status.js)): from the step
its technique (or summon's startup, or attack) is accepted, through the
cast and the release, to the step it ends, however it ends (finished, a
hit, the ground lost, a reset). Never for a move that is not Special (Red,
Maximum Blue, the Whirlwind, Cherry Blossom Impact, any other attack),
movement, the Shield, the Deflect or a cooldown alone, and never because
something the Special released (Hollow Purple's sphere) is still flying.
It works the same for Player 1 and a CPU, in every mode (Quick Battle,
Watch Mode, Practice Ground, mirror matches), and over both fighters at
once when both perform one; an off-screen fighter keeps only its edge
pointer.

### The charm mark

While a hit's `charm` holds a fighter ([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox):
its hits on whoever charmed it heal that fighter instead; #0004's World is
Mine), a bright pink (`#ff5fa2`) heart with a dark outline (`#2a0614`)
floats over it (`CHARM_MARK_STYLE`, `charmMarkRect` and `drawCharmMark` in
[`fighter-status.js`](../../js/game/rendering/fighter-status.js);
`Arena.charmMarkRect`), so the player sees why its blows heal its opponent.
It sits centred over the status column like the Special ability mark, above
that mark while it shows (a charmed fighter performing a Special of its
own), else above its Energy bar or name tag; drawn as shapes (two lobes
over a point), 15 world units tall at the view's scale, never under 14 nor
over 30 CSS pixels, a little wider than tall, bobbing like the Special mark
(held still with reduced motion). `Arena.statusTop` counts it. It shows for
exactly as long as the charm runs (`CombatState.charm`, read live every
frame), for players and CPUs alike; the charmer has none.

### The fear mark

While a hit's `fear` holds a fighter ([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox):
every hit whoever frightened it lands on it feeds that fighter; #0005's Red
Balloon), a drop of cold sweat, pale icy blue (`#a8dcff`) with a white
glint and a dark outline (`#06182a`), floats over it (`FEAR_MARK_STYLE`,
`fearMarkRect` and `drawFearMark` in
[`fighter-status.js`](../../js/game/rendering/fighter-status.js);
`Arena.fearMarkRect`), so the player sees why its opponent's hits on it
heal that opponent. It sits centred over the status column, above the
charm mark or the Special ability mark while either shows, else above its
Energy bar or name tag; drawn as shapes (pointed at the top, round below),
as tall as the charm mark and a little narrower than tall. It trembles
where the other marks bob: 1.5 CSS pixels either side on a 0.12 s cycle
(`fearMarkTremble`), held still with reduced motion. `Arena.statusTop`
counts it. It shows for exactly as long as the fear runs
(`CombatState.fear`, read live every frame), for players and CPUs alike;
the frightener has none.

A floating fighter (a hit's `float`) needs no mark: it is drawn in its
`midair_hurt` pose, rising.

### The Mash Combo counter

While a fighter's Mash Combo is armed or running (`mashCounterState`), a
compact dark pill over it reads *Mash Combo!* (armed), then *Mash Combo
7/12* (`hud.mashCombo`, *Combo frénétique* in French), with a thin bar
filling turn by turn under the text: cyan through the series, gold on the
twelfth turn. It sits above every mark that shows (`Arena.mashCounterRect`,
included in `statusTop`, so Practice Ground's damage numbers float above
it), scales with the world like the marks, and is gone the step the series
ends. Read live from `fighter.mash`; drawn for Player 1 and a CPU alike.

## A burst's art

A technique's burst may name the art it plays as it goes out (`burst.effect`,
[combat](combat.md#techniques)): on the step the burst lets go, its fighter
hands it over (`Fighter.effects`), and the arena plays that effect clip
once, from that step, on the simulation clock (`Arena.castEffects`,
`addCastEffect`, `updateCastEffects`), centred where it went out (the
fighter's position then, plus its offset mirrored with the cast's facing),
at the fighter's art-pixel scale, drawn behind the clones and the fighters
(`drawCastEffect`): it goes out round its fighter, who stays in front. A
clip with no facing of its own (`sourceFacing` 0) is never mirrored. It
stays where it went out if the fighter moves, and is dropped once it has
played through. Art only: the burst's hit has already landed on its step.
#0004's World is Mine plays its ring of sound this way (39 frames at 30
fps).

## Hit effects

Presentation only: they never change a simulation step (a test steps the
same fight with and without them). Screen shake scaled to the hit, a
one-frame white flash on the fighter hit, sparks where it landed (a red
ring for a block, white for a perfect Shield), speed trails behind a fast
tumbling fighter and fainter ones behind a Dash or an air dash while it
lasts (`trail.dashAlpha`), sparks and a small shake off a rebounding surface, a
heal glow on a fighter that heals itself (a technique's `heal`, read from
`Fighter.heals`: a soft green ring opening round the middle of its body and a
few green plus marks floating up, gone after `sparks.heal`, 0.7 s, a little
bigger for a bigger heal; the same glow on a fighter that a charmed
opponent's hit heals, from its `charmed` event, with no shake, flash or
impact spark, and on a fighter whose hit feeds on its opponent's fear, from
the hit's `fed`, beside that hit's own effects), and a
short slow-motion zoom on a launch predicted to reach the Void. Reduced
motion drops the shake and the zoom. Tuning: `HIT_FX` (`shake`, `flash`,
`sparks`, `trail`, `mash`, `lethal`, `bounce`, `elimination`).

**A Mash Combo** ([combat](combat.md#mash-combo)): while a series runs,
fading afterimages of the fighter's strikes trail it (`trail.mashAlpha`,
sampled every `trail.mashEvery`, at most `trail.count`, each gone after
`trail.life`): for a fighter drawn as several members, only the members
performing the turn (`fighterParts` filtered by `performing`). Every
strike of a turn that lands adds a short white slash along the strike
(`sparks.slash`) beside its ordinary spark; the finisher's a burst ring in
amber (`sparks.finisher`) and a harder shake (`mash.finisherShake`, none
with reduced motion). Afterimages and slashes are paint only: no box, no
hit, no damage event; a trail is dropped once the series is over.

**The elimination burst.** Whenever the Void takes a fighter (in any mode,
two at once included), `Arena.checkVoid` hands it to
`HitEffects.addElimination` before it leaves play: its body's centre where
it went in, its `visual.height` and its colours are caught there, so the
burst plays on (`drawEliminations`, after the Void) once the fighter has
gone. A white flash that pops and fades, a ring opening out in the
fighter's first colour, and 24 shards in all its colours, each over a thin
dark line, flung out to about a fighter's height and fading over 0.55 s;
the shards come from a seeded generator, so a burst always draws the same.
A small shake comes with it. The colours are character data: each fighter's
`visual.eliminationPalette` (3–5 CSS colours picked from its art), or
`NEUTRAL_ELIMINATION_PALETTE` (white, light grey, amber) for a fighter
without one; the effect never knows a fighter by id. Paint only: no damage,
launch or stun, and the fight steps the same with or without it. With
reduced motion there is no shake and the shards travel about a third as
far; the colour flash and fade stay.

## Tests

- [`tests/systems/projectile-spin.test.mjs`](../../tests/systems/projectile-spin.test.mjs):
  the spin (its angle from age, never its box, kept through a turn back)
  and the rotated draw on a recording canvas.
- [`tests/systems/hit-fx.test.mjs`](../../tests/systems/hit-fx.test.mjs),
  [`fighter-status.test.mjs`](../../tests/systems/fighter-status.test.mjs),
  [`platform-stage.test.mjs`](../../tests/systems/platform-stage.test.mjs).
- [`tests/integration/overtime.test.mjs`](../../tests/integration/overtime.test.mjs):
  the drawn Void around the bounds collision tests, its waves speeding up
  (and still with reduced motion), and the elimination burst (one per
  fighter taken, its palette and place, outliving the fighter, gone after
  its life and on a restart, paint only).
- Normalization against real PNGs: [`tests/fighters/0001/fighter-animation.test.mjs`](../../tests/fighters/0001/fighter-animation.test.mjs),
  [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs),
  [`tests/fighters/0003/fighter-0003.test.mjs`](../../tests/fighters/0003/fighter-0003.test.mjs),
  [`tests/fighters/0004/fighter-0004.test.mjs`](../../tests/fighters/0004/fighter-0004.test.mjs),
  [`tests/fighters/0005/fighter-0005.test.mjs`](../../tests/fighters/0005/fighter-0005.test.mjs),
  [`tests/fighters/0006/fighter-0006.test.mjs`](../../tests/fighters/0006/fighter-0006.test.mjs)
  (three members, one scale),
  [`tests/fighters/0007/fighter-0007.test.mjs`](../../tests/fighters/0007/fighter-0007.test.mjs),
  [`tests/fighters/0008/fighter-0008.test.mjs`](../../tests/fighters/0008/fighter-0008.test.mjs)
  (anchors authored where its limbs stretch far from its body, and where
  its legs reach below its feet).
- Ensembles: [`tests/systems/ensemble.test.mjs`](../../tests/systems/ensemble.test.mjs)
  (every member on the fighter's state on the same step, the formation,
  gliding, the float, the facing, determinism at any frame rate, the parts
  drawn).
- The charm mark and the charmer's glow:
  [`tests/systems/charm.test.mjs`](../../tests/systems/charm.test.mjs); the
  fear mark and the frightener's glow:
  [`tests/systems/fear.test.mjs`](../../tests/systems/fear.test.mjs); a
  burst's art played once behind the fighters:
  [`tests/systems/technique.test.mjs`](../../tests/systems/technique.test.mjs).
- Clip restarts and holds:
  [`tests/systems/animation-restart.test.mjs`](../../tests/systems/animation-restart.test.mjs)
  (the stuck-frame bug for every fighter, one restart per activation,
  changing moves without idle, a Mash Combo's twelve turns on every fighter
  and #0006's sisters, a freeze, a hit, a respawn, the Shield's hold, a
  last frame held on purpose, every clip fitting its attack, an unusable
  fps); the Mash Combo's counter, slashes and afterimages:
  [`tests/systems/mash-combo.test.mjs`](../../tests/systems/mash-combo.test.mjs).
- The canvas is a recording stand-in in every test: layout, scale and
  paint still need a real browser.
