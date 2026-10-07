# Rendering

Everything drawn on the battle canvas, and how sprites are prepared for
it. Rendering reads the simulation and never feeds back into it. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §3 (assets), §7.1
(stages and camera) and §7.3 (battle chrome).

| Module | Owns |
| --- | --- |
| [`js/game/rendering/sprite-normalizer.js`](../../js/game/rendering/sprite-normalizer.js) | `SpriteSet`: each fighter's loaded clips, normalized once per frame (visible bounds, pixel-grid detection, resampling to one pixel per art pixel, anchors), clip durations (which time the land pose, pending attacks and summon startups; the Dash and the air dash last the universal Dash's length, their clips played once across it), `drawFrame`, `drawCenteredFrame` (projectiles and effects, optionally turned). |
| [`js/game/rendering/sprite-animator.js`](../../js/game/rendering/sprite-animator.js) | `SpriteAnimator`: which frame of which clip a fighter shows. |
| [`js/game/rendering/camera.js`](../../js/game/rendering/camera.js) | Framing the fighters in play inside the camera bounds: a lead ahead of Player 1 (`LEAD` seconds of its speed, counted to `LEAD_SPEED` at most, so a Dash's burst never swings the view) and a follow quick enough (`FOLLOW_X`, `FOLLOW_Y`) that a fighter at a Dash's speed stays well inside the margin. |
| [`js/game/rendering/hit-fx.js`](../../js/game/rendering/hit-fx.js) | Hit effects from each step's combat events: shake, flash, sparks, trails, rebound sparks, the lethal launch's slow motion, the Void's elimination burst (`HIT_FX`, `eliminationPalette`). |
| [`js/game/rendering/shield-fx.js`](../../js/game/rendering/shield-fx.js) | The Shield's wavy circle. |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The Energy bar and cooldown rings drawn with each fighter. |
| [`js/game/arena.js`](../../js/game/arena.js) | The draw order and the debug overlay. |
| [`js/stages/`](../../js/stages/) | Stage themes (Desert, City, Practice Ground), the shared one-point perspective and the Void (drawn around the bounds the Arena hands it). |
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
land clip is a pose that running goes straight past. No frame is ever
invented or interpolated: the art's own frames, played faster.

## Draw order

`Arena.render`, back to front: the stage's background and terrain,
shadows, clones, each fighter in play (the CPU, then Player 1 on top: its
speed trail, the Shield's interior, the fighter, the Shield's rim), the
technique objects, projectiles, hit sparks, the stage's foreground, the
Void, the elimination bursts (over the black, where each fighter went in),
then each fighter's markers and status over everything, and the debug
overlay when it is on (`` ` ``).

## The Void

`StageTheme.drawVoid(ctx, view, bounds)` draws the black and its red rim
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

Over each fighter in play whose body is on screen: a thin bright purple
**Energy bar** above its name tag, only while Energy is below full (gray
through an exhaustion's refill), and under its feet one ring per summon or
technique button cooling down, labelled by the button (**A4** / **A5**;
#0001's techniques have no cooldown, so it never shows one),
filling clockwise with the seconds left. Nothing is drawn while all are
ready.

## Hit effects

Presentation only: they never change a simulation step (a test steps the
same fight with and without them). Screen shake scaled to the hit, a
one-frame white flash on the fighter hit, sparks where it landed (a red
ring for a block, white for a perfect Shield), speed trails behind a fast
tumbling fighter and fainter ones behind a Dash or an air dash while it
lasts (`trail.dashAlpha`), sparks and a small shake off a rebounding surface, and a
short slow-motion zoom on a launch predicted to reach the Void. Reduced
motion drops the shake and the zoom. Tuning: `HIT_FX` (`shake`, `flash`,
`sparks`, `trail`, `lethal`, `bounce`, `elimination`).

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
  [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs).
- The canvas is a recording stand-in in every test: layout, scale and
  paint still need a real browser.
