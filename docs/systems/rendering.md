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
| [`js/game/rendering/hit-fx.js`](../../js/game/rendering/hit-fx.js) | Hit effects from each step's combat events: shake, flash, sparks, trails, rebound sparks, the heal glow (a technique's heal, a charmed hit's, or a hit that feeds on a fear), the Super Jump's dust, the lethal launch's slow motion, the Void's elimination burst and the respawn burst, the same played backwards before a fighter comes back (`HIT_FX`, `eliminationPalette`). |
| [`js/game/rendering/shield-fx.js`](../../js/game/rendering/shield-fx.js) | The Shield's wavy circle. |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The Energy bar, cooldown rings, Special ability mark, charm mark, fear mark, Mash Combo counter and held-copy mark drawn with each fighter. |
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
stands shorter or taller on the same stage. The camera sits
`CONFIG.render.cameraZoom` (1.35) closer than the whole-stage view, one
tuning point for every fighter and every map: `computeWorldScale` in
[`js/game/arena.js`](../../js/game/arena.js) multiplies the target fighter
height (a tenth of the view) and its minimum and maximum by it and relaxes
the stage fit by the same factor, so fighters stand about 13.5 % of the
view tall and the camera follows them across the stage, never past the
camera bounds; a lethal launch's zoom closes in on top of it. Projectile and effect art keeps
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
shadows, the Super Jump's dust (on the ground, behind everything that
fights), clones, each fighter in play (the CPU, then Player 1 on top: its
speed trail, the Shield's interior, the fighter, the Shield's rim), the
technique objects, projectiles, hit sparks, the stage's foreground, the
Void (with the ripples where it has just taken a fighter), the elimination
bursts (over the black, where each fighter went in), the respawn bursts (over
everything, where each fighter is about to come back),
then each fighter's markers and status over everything, and the debug
overlay when it is on (`` ` ``: solid platforms where they are drawn, and a
line naming each stage hazard's state). A fighter's shadow and ground ring
lie on the solid surface under it (a moving platform where it is drawn,
as faint as the platform is while it fades); a vanished platform takes
none.

A cloaked fighter (a technique's `cloak`, [combat](combat.md#techniques))
is drawn as a faint shimmer: its frames, its speed trail, its shadow and
its ground ring at a fifth of their strength (`CLOAK_ALPHA` 0.2),
wavering a little on the effects clock (`CLOAK_WAVER`, steady under
reduced motion; `Arena.cloakAlpha`). Its name tag, Energy bar and marks
stay as they are, so its player never loses it. Art only: nothing in the
simulation reads it.

## The Void

`StageTheme.drawVoid(ctx, view, bounds, ripples)` draws the black and its red rim
around `bounds`, which the Arena always passes as its stage's Void in force
(`stage.void`): the map's `voidBounds`, or the closer rectangle of Quick
Battle's overtime (`StageCollision.closeVoid`). The theme keeps no copy and
never decides the boundary, so the drawn edge and the kill line can never
drift apart. Its waves (`VOID.waves`) run on the theme's clock plus
`voidSurge`, the extra wave motion `advanceVoid(dt, speed)` adds while the
Arena's `voidWaveSpeed` is above 1 (up to 6× through overtime, rising with
the Void's eased pressure): a change of
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
resets it. #0018's grenade tumbles at 540, a turn and a half a second, as
it is lobbed (its height changing along its `arc` is the simulation's: the
art is drawn where it is, interpolated between steps like any
projectile's position). A projectile is drawn at the art-pixel scale of
the fighter whose art it is, whoever owns it now.

## Fighter status

Above each on-screen fighter's name tag, the bright purple **Energy bar**
shows only below full and turns gray during exhaustion. Under the feet, a
centered row shows only active cooldowns with a duration **above 0.5 seconds**
(the cooldown policy's 3 s and 5 s, [combat](combat.md#cooldowns)):
#0001 Unlimited Void (3 s), Hollow Purple (5 s), #0002 Whirlwind (5 s),
#0003 Mystical Palm Technique (3 s), #0004 Ievan Polkka (5 s) and World is
Mine (3 s), #0005 Deadlights (3 s) and Red Balloon (3 s), #0006 Ice Breath (3 s), #0007 Rocket Launcher (5 s), #0008 Feast (3 s) and Gum-Gum Giant Pistol (5 s), #0009 Freezing Splash (3 s) and Air Sphere (5 s), #0010 Kill (5 s) and Emergency Meeting (3 s), #0011 Web Shot (3 s), Camouflage (3 s) and Venom Punch (3 s), #0012 Dragonblade (5 s), #0013 Sixty-Four Palms (5 s), #0014 Sunburst Fist (5 s), long ordinary attacks as well as summons
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
Deadlights and Red Balloon, #0006's Ice Breath, #0007's Rocket Launcher, #0008's Feast and Gum-Gum Giant Pistol, #0009's Freezing Splash and Air Sphere, #0010's Kill, Vent and Emergency Meeting, #0011's Camouflage and Venom Punch, #0012's Dragonblade, #0013's Twin Lion Fists and Sixty-Four Palms, #0014's Sunburst Fist, #0015's Gift and Air Gift, #0016's Medipack, #0017's Earth Chop, Finders Keepers and Air Finders Keepers, #0018's Diary and Axe Swing), a bright orange (`#ff9f1c`)
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

### The held-copy mark

While a fighter holds a copy a mimic of its took ([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox):
the strongest projectile of the fighter it touched, which its next mimic
throws; #0017's Finders Keepers), the copy's own art (its clip's first
frame, never mirrored, fitted inside) floats over it in a dark round
badge with a white ring and a dark outline (`COPY_MARK_STYLE`,
`copyMarkRect` and `drawCopyMark` in
[`fighter-status.js`](../../js/game/rendering/fighter-status.js);
`Arena.copyMarkRect`), so both players see what that fighter's next touch
will throw. It sits centred over the status column, above every other mark
that shows (the Mash Combo counter, the fear mark, the charm mark, the
Special ability mark), else above its Energy bar or name tag: 19 world
units across at the view's scale, never under 18 nor over 34 CSS pixels.
It does not move. `Arena.statusTop` counts it. It shows for exactly as
long as the copy is held (`CombatState.copy`, read live every frame: from
the step it is taken to the step it is thrown or the fighter's life ends),
for players and CPUs alike.

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
`sparks`, `trail`, `mash`, `lethal`, `bounce`, `elimination`, `dust`).

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

**The Super Jump's dust.** Every Super Jump that takes off (a player's or
a CPU's) records where its feet left the ground, what it stood on and
where on it (`Fighter.superJumpTakeoff`, set on its takeoff step only);
`Arena.update` hands it to `HitEffects.addSuperJumpDust`, so there is
exactly one burst per Super Jump and none for a normal jump, an air jump,
Down alone, a refused press or a CPU's plan that never took off. `drawDust`
draws it on the ground, after the shadows and before every fighter: a
small cloud at the feet, two puffs rolling out along the surface either
side (each a few overlapping circles, easing out), a faint flat ring
spreading over the surface and six motes rising, warm pale grey over a
warm dark edge so it reads on night, sand, snow and cloud alike, all
fading out together in `dust.life` (0.3 s). It never follows the fighter:
it stays where it was raised, and on a moving platform (`ground.dynamic`)
it is drawn where that platform is drawn, at the same offset, as faint as
the platform is. At most `dust.max` (8) live at once, the oldest going
first; it ages on the effects' real-time clock like every spark, and a
restart clears it. No shake. With reduced motion it spreads only
`dust.reducedTravel` as far and raises no motes. Paint only: no box, no
collision, and the fight steps the same with or without it. Tuning:
`HIT_FX.dust`.

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

**The respawn burst.** A fighter coming back from the Void is announced by
its own elimination burst played backwards, before it is back. In the last
`HIT_FX.elimination.life` of its wait (`Arena.updateRespawns`, the step
the wait crosses into it, once; all of it if the wait were shorter),
`Arena.announceSpawn` hands `HitEffects.addSpawn` the place its respawn
will put it (`Fighter.spawnPlacement`, read without moving it). The burst
is caught like an elimination (the centre of where its body will be, its
`visual.height`, its palette, a seed) into its own list (`spawns`), so it
never counts as an elimination, and drawn by the same code (`drawBurst`)
with its progress reversed (`drawSpawns`: k = 1 − age / life), over the
fighters, the Void and the elimination bursts: at age t it draws exactly
what an elimination draws at age life − t. The shards start at their full
reach and fly in to that centre, quickening as they go; the ring closes
from its widest; everything fades in; the white flash grows and pops at
the very end, on the step the fighter appears. Every mode's respawns and
Practice Ground's get it; a fighter already on the stage (a match's start,
a restart or rematch, Practice Ground's arrivals and swaps) gets none (a
battle screen's match entrance brings each fighter on with this very burst,
[above](#the-match-entrance)), and
a restart during the wait clears it with the other effects. The same
shake and the same reduced-motion handling (no shake, short travel).
Tuning: `HIT_FX.elimination`, the one source for both. Paint only: the
wait and the respawn are exactly as without it, and the fight steps the
same with or without it.

## The match entrance

A battle screen's match entrance ([battle](../gameplay/battle.md#the-matchs-entrance))
is drawn in two places.

**The versus screen and its cover** (Parts A and B) are drawn by
`MatchEntranceArt` ([`js/game/rendering/match-entrance.js`](../../js/game/rendering/match-entrance.js))
on a canvas of its own, over the battle canvas and every piece of the
match's chrome, under the pause menu and the Match Results, with the
battle canvas's device-pixel-ratio cap (`CONFIG.render.dprCap`) and Canvas
2D only. Its time is the Battle's (`Battle.entranceTime`, between steps by
the frame's `alpha`), so a pause holds it. Its look is `ENTRANCE_LOOK`
(every size a share of the canvas's height or width, so a resize lays it
out again where it is; its timing is `CONFIG.battle.entrance`):

- The bolt: a jagged, slightly leaning line down the middle with two to
  four forks (`boltShape`, from the match's seed and `Battle.matchIndex`:
  the same on both browsers online, another each match), three strokes (a
  blurred glow in Alva's green `#2bff6a`, a bright mid stroke, a near-white
  core `#eaffdc`), drawn top to bottom over 0.12 s, then flickering: its
  joints re-rolled seven times a second (`boltPoints`), its glow pulsing.
  A low green-white flash and a small shake at contact.
- The black under it, eased in from 0.25 to 0.75 s. Before it, the canvas
  is clear there: the player sees the frame they had (the battle canvas
  keeps its last frame, and draws nothing of the new match until the
  cover; while the loading overlay shows, the entrance's canvas lies over
  it until the black is whole, then comes back under the pause menu).
- Each side's fighter on its idle clip (`idlePose`, every member of an
  ensemble at its home), mirrored to face the bolt by each clip's own
  `sourceFacing`, at a whole number of device pixels per art pixel chosen
  so its idle art (`idleBounds`, over the whole clip) stands about half the
  screen's height, never wider than its half (`fighterScale`), image
  smoothing off; sliding in with a small overshoot and two faint
  afterimages; its side and name under it in the HUD's font.
- The cover: the bolt's three strokes growing to 2.6 screen widths (the
  green everywhere, its hard green-white core a broad band), then, the
  stage under it, rubbed out from the centre outward (a `destination-out`
  gradient).
- Reduced motion: no shake, overshoot or re-roll (a gentler pulse); the
  fighters fade in where they stand; the cover is a plain green fade in
  and out.

**The camera-led spawns** (Part C) are the battle canvas's own. The
fighters still waiting (`Fighter.awaitingEntrance`) are out of play:
`Arena.inPlay` leaves them out, so they have no body, shadow, ring, marker,
status or trail on screen; each appears with the respawn's burst
(`HitEffects.addSpawn`, started `HIT_FX.elimination.life` before it).

### The screen-space zoom (strict)

Part C's camera move toward a spawn is a pure 2D zoom of the picture,
never a change of perspective. Every stage is drawn in one-point
perspective ([`js/stages/perspective.js`](../../js/stages/perspective.js)),
whose projection reads the view's place (`Perspective.y` against `refY`,
the parallax layers against `view.x`): moving or resizing the view tilts
the stage's planes, shifts the horizon and slides the layers. So through
the entrance the view is a frozen lens, the home view (its `x`, `y`, `w`,
`h` and `scale` never change: `Battle.syncView`), and the zoom is one
affine applied after projection, in device pixels:
`{ k, ox, oy }`, a frame pixel P landing at `(ox, oy) + k·P`, which is a
scale k about the fixed point F = o / (1 − k): F + k·(P − F). A pan is a
moving F, never a moving lens.

Every draw path sets absolute transforms (`ctx.setTransform(1, 0, 0, 1, 0,
0)` for screen space, `Perspective.plane`, a theme's `layer`), so an outer
`ctx.scale` would be undone by the first of them. Instead
`installScreenZoom` ([`js/game/rendering/screen-zoom.js`](../../js/game/rendering/screen-zoom.js))
puts the zoom in front of every `setTransform` (either form) and
`resetTransform` on the battle canvas's context for the length of one
render (`Battle.render` through `withScreenZoom`), then gives the context
back exactly as it was: the one place the zoom is composed. The theme's
background, terrain, foreground and Void, `clipAboveRim`, `Arena.toScreen`'s
screen points, the sprites, the shadows, the hit effects (the spawn burst
among them) and the markers are all drawn through it unchanged. The
framed region is held inside the home frame (`framedZoom`), so nothing
the home frame did not draw ever shows; the spawn burst's shake nudges the
zoom (`nudgedZoom`), never the lens, and only as far as that allows. It is
exact and costs nothing: no offscreen buffer, every vector and pixel drawn
at full resolution at the zoom. Line widths and text scale with the
picture; a shadow's blur, which no transform reaches, does not.

The lethal launch's zoom (`HIT_FX.lethal` in `Arena.syncView`) and the
follow camera are untouched: this rule is the entrance's. The same helper
could carry the lethal zoom as a screen-space zoom too; it does not.

Measured in Chromium on all five battle stages at 1280 × 720: the zoomed
frame matches the home frame scaled by 1.6 about F to a mean of about
1/255 per channel (bilinear resampling and the stage's own sparkle), while
a zoom made by moving and rescaling the view differs by 15 to 22 on average
with about a tenth of the pixels badly off.

## Tests

- [`tests/systems/match-entrance.test.mjs`](../../tests/systems/match-entrance.test.mjs):
  the screen-space zoom's invariant (every world point at several depths,
  on each stage's own projection, through `Perspective.plane`, the screen
  identity and a parallax layer, landing at F + z·(home − F) within a
  pixel), the lens never moving and the zoom held inside the home frame
  through the whole entrance, the render drawn through it and the context
  given back, the bolt's seeded shape, every fighter's size on the versus
  screen, and the versus screen drawn at every step and laid out again on
  a resize.
- [`tests/systems/projectile-spin.test.mjs`](../../tests/systems/projectile-spin.test.mjs):
  the spin (its angle from age, never its box, kept through a turn back)
  and the rotated draw on a recording canvas.
- [`tests/systems/super-jump-dust.test.mjs`](../../tests/systems/super-jump-dust.test.mjs):
  one burst per Super Jump (a player's or a CPU's) at ground level, none
  for anything else, its life, bound and restart, a moving cloud, the draw
  order, reduced motion, and the fight stepping the same without it.
- [`tests/systems/hit-fx.test.mjs`](../../tests/systems/hit-fx.test.mjs),
  [`fighter-status.test.mjs`](../../tests/systems/fighter-status.test.mjs),
  [`platform-stage.test.mjs`](../../tests/systems/platform-stage.test.mjs).
- [`tests/integration/overtime.test.mjs`](../../tests/integration/overtime.test.mjs):
  the drawn Void around the bounds collision tests, its waves speeding up
  (and still with reduced motion), and the elimination burst (one per
  fighter taken, its palette and place, outliving the fighter, gone after
  its life and on a restart, paint only).
- [`tests/systems/spawn-burst.test.mjs`](../../tests/systems/spawn-burst.test.mjs):
  the respawn burst starting its life before the fighter is back, where it
  will stand, ending as it appears, once per respawn, in every mode and
  Practice Ground; none for a fighter already on the stage (a match's
  start, a restart, Practice Ground's arrivals); cleared by a restart
  during the wait; each fighter's palette and size; the exact time-reverse
  of the elimination; fading in, closing in, the flash at the end; its
  life, shake and reduced motion; the draw order; never an elimination; and
  a whole CPU match stepping the same without it.
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
  its legs reach below its feet),
  [`tests/fighters/0009/fighter-0009.test.mjs`](../../tests/fighters/0009/fighter-0009.test.mjs)
  (anchors authored on its trousers where its staff, its water and its
  whirl reach far from its body; its wind, rock and sphere at the same
  art-pixel size, centred),
  [`tests/fighters/0010/fighter-0010.test.mjs`](../../tests/fighters/0010/fighter-0010.test.mjs)
  (anchors authored on its suit where its fists, its pistol, its knife,
  its tongue, the emergency button and the vent reach from its body, the
  vent alone on its own middle; its meeting's call at the same art-pixel
  size, centred).
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
