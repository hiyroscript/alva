# Rendering

Everything drawn on the battle canvas, and how sprites are prepared for
it. Rendering reads the simulation and never feeds back into it. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §3 (assets), §7.1
(stages and camera) and §7.3 (battle chrome).

| Module | Owns |
| --- | --- |
| [`js/game/rendering/sprite-normalizer.js`](../../js/game/rendering/sprite-normalizer.js) | `SpriteSet`: each fighter's loaded clips, normalized once per frame (visible bounds, pixel-grid detection, resampling to one pixel per art pixel, anchors), clip durations (which time the Dash, the land pose and summon startups), `drawFrame`. |
| [`js/game/rendering/sprite-animator.js`](../../js/game/rendering/sprite-animator.js) | `SpriteAnimator`: which frame of which clip a fighter shows. |
| [`js/game/rendering/camera.js`](../../js/game/rendering/camera.js) | Framing the fighters in play inside the camera bounds. |
| [`js/game/rendering/hit-fx.js`](../../js/game/rendering/hit-fx.js) | Hit effects from each step's combat events: shake, flash, sparks, trails, rebound sparks, the lethal launch's slow motion (`HIT_FX`). |
| [`js/game/rendering/shield-fx.js`](../../js/game/rendering/shield-fx.js) | The Shield's wavy circle. |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The Energy bar and cooldown rings drawn with each fighter. |
| [`js/game/arena.js`](../../js/game/arena.js) | The draw order and the debug overlay. |
| [`js/stages/`](../../js/stages/) | Stage themes (Desert, City, Practice Ground), the shared one-point perspective and the Void. |
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

## Draw order

`Arena.render`, back to front: the stage's background and terrain,
shadows, clones, each fighter in play (the CPU, then Player 1 on top: its
speed trail, the Shield's interior, the fighter, the Shield's rim), the
technique objects, projectiles, hit sparks, the stage's foreground, the
Void, then each fighter's markers and status over everything, and the
debug overlay when it is on (`` ` ``).

## Fighter status

Over each fighter in play whose body is on screen: a thin bright purple
**Energy bar** above its name tag, only while Energy is below full (gray
through an exhaustion's refill), and under its feet one ring per summon or
technique button cooling down, labelled by the button (**A4** / **A5** for
#0001's techniques),
filling clockwise with the seconds left. Nothing is drawn while all are
ready.

## Hit effects

Presentation only: they never change a simulation step (a test steps the
same fight with and without them). Screen shake scaled to the hit, a
one-frame white flash on the fighter hit, sparks where it landed (a red
ring for a block, white for a perfect Shield), speed trails behind a fast
tumbling fighter, sparks and a small shake off a rebounding surface, and a
short slow-motion zoom on a launch predicted to reach the Void. Reduced
motion drops the shake and the zoom. Tuning: `HIT_FX` (`shake`, `flash`,
`sparks`, `trail`, `lethal`, `bounce`).

## Tests

- [`tests/systems/hit-fx.test.mjs`](../../tests/systems/hit-fx.test.mjs),
  [`fighter-status.test.mjs`](../../tests/systems/fighter-status.test.mjs),
  [`platform-stage.test.mjs`](../../tests/systems/platform-stage.test.mjs).
- Normalization against real PNGs: [`tests/fighters/0001/fighter-animation.test.mjs`](../../tests/fighters/0001/fighter-animation.test.mjs),
  [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs).
- The canvas is a recording stand-in in every test: layout, scale and
  paint still need a real browser.
