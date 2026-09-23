# Alva

A 2D sprite fighting game for the browser by **hiyroscript**. Pure HTML, CSS and
JavaScript with Canvas 2D: no frameworks, no build step, no 3D. It runs on desktop
and on phones and tablets in landscape.

This is the first playable foundation: full menu flow, a 48-slot roster, two
large stages, movement and platform physics, a camera, a HUD, touch controls,
and a combat system that is wired up and ready for attack sprites.

The full product specification, including the Alva brand system, is in
[`ALVA_SPEC.md`](./ALVA_SPEC.md).

## Run locally

The game uses ES modules and reads sprite pixels, so it has to be served over
HTTP. Opening `index.html` straight from disk (`file://`) won't work.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `npx http-server`, …). You don't need `npm install`.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, select your branch and `/ (root)`.
3. Open `https://<user>.github.io/alva/`.

`index.html` is the entry point. Every asset and module path is relative
(`./assets/...`, `./js/...`), so the game works under any sub-path, including
`/alva/`. `.nojekyll` stops Jekyll from processing the site.

### Repository name

The product is Alva, but the GitHub repository itself is still named `maxy`, so
until it is renamed the site is served from `/maxy/`. Rename it under
**Settings → General → Repository name** (GitHub redirects the old URL). Nothing
in the code depends on the repository name, so no file changes are needed.

## Controls

| Action | Keyboard | Touch (landscape) |
| --- | --- | --- |
| Move left / right | `A` `D` or `←` `→` | Lower-left ◀ ▶ |
| Down / drop through platform | `S` or `↓` | Lower-left ▼ |
| Jump | `W`, `Space` or `↑` | Lower-right, bottom corner |
| Primary* | `J` | Lower-right, top |
| Special* | `K` | Lower-right, middle row |
| Block | `L` | Lower-right, middle row |
| Action 1* / Action 2* | `U` / `I` | Lower-right, bottom row |
| Pause | `Esc` or `P` | Timer or pause button, top centre |

\* Wired into input and combat, but inactive until #0001 has attack animations.

- **Menus:** arrow keys or WASD to move, `Enter` to select, `Esc` to go back. Mouse and touch work too.
- **Touch:** several fingers work at once (hold Right and press Jump). You can slide your thumb between the movement buttons.
- **Gamepad (standard layout):** D-pad or left stick to move, A to jump, X / Y / B / LB for the reserved actions, RB or RT to block, Start to pause.
- **Debug:** `` ` `` toggles the collider and hurtbox overlay in battle.

Touch controls show on touch-first devices (coarse pointer, or a touch actually detected). A narrow desktop window doesn't count as a phone. On a phone held in portrait, the game pauses and asks you to rotate.

## Current content

- **Characters:** #0001
- **Maps:** Desert (wide, open, 3.8 screens) and City (rooftops with 7 one-way platforms, 3.1 screens)
- **Animations:** Idle, Run
- **Mode:** Quick Battle: 1 round, 99 seconds, against a non-attacking training CPU

## Design

Alva's interface follows Seren's restrained visual discipline: near-black and
charcoal surfaces, off-white typography, gray hierarchy and thin translucent
borders. Green is the sole interface accent, used sparingly for primary actions,
selection and progress. Check marks, filled indicators and an off-white focus
ring with dark separation keep states identifiable beyond colour.

- **Tokens** live at the top of `styles.css` (`--bg`, `--surface*`, `--text*`,
  `--border*`, `--accent*`, `--action*`, radii, shadows, `--focus-ring`). Deeper
  green action fills preserve contrast for white labels; muted text is lifted
  for legibility on charcoal.
- **Wordmark:** `js/ui/logo.js` draws ALVA from geometric SVG letterforms and
  inherits `currentColor`, so it needs no font download. `alvafav.PNG`
  is the site favicon.
- **Home** pairs an oversized off-white ALVA wordmark, the line "Fan project.
  Big heart." and a Play action with an angled strip of semi-transparent glass
  over the black background. A crisp green slash separates the two zones.
  Plain-text credits roll upward inside the glass in an endless loop and stand
  still for reduced-motion users. Wheel/trackpad, pointer or touch dragging,
  and focused arrow/Page keys scroll the credits manually. Automatic movement
  resumes from that position after about 2 seconds of inactivity; reduced-motion
  mode remains manual-only. Help & Credits stays visible but is disabled
  for now. The strip shifts outward on narrow screens.
- **Other screens** retain their established layouts, controls and navigation;
  only interface colours change. Battle keeps readable dark translucent chrome.
- Character sprites and stage artwork keep their original colours. No artwork,
  Canvas rendering, physics or combat is changed by the interface theme.

## How it's built

```
index.html            entry point
styles.css            all UI styling (Alva dark/green design tokens + screens)
ALVA_SPEC.md          product specification
alvafav.PNG           site favicon
assets/characters/0001/   #0001 sprite frames (unchanged originals)
js/
  main.js, config.js  boot + global config (bindings, render, timing)
  core/               app controller, screen manager, menu navigation,
                      asset loader, input (keyboard/touch/gamepad), device, audio stub
  screens/            splash, home, mode, character, map, help, battle
  game/               battle loop, fighter state machine, physics, camera,
                      combat, sprite normalizer/animator, HUD, touch controls
  stages/             Desert and City layered renderers (procedural Canvas 2D)
  data/               characters.js, maps.js
  ui/                 wordmark, icons, overlays, shared help content, stage preview
```

- **Sprite normalization.** The idle frames are pixel art at roughly 16× scale and the run frames at 4×. When a frame loads, the game reads its alpha channel once and finds the visible bounds. It then detects the pixel grid from every colour transition and resamples the frame to 1 pixel per art pixel. Every frame is drawn at the same world scale, anchored bottom-centre at the upper-body centroid, so the fighter keeps the same size and position when switching between idle and run. When the size stays close to the target, each art pixel maps to a whole number of device pixels.
- **Simulation.** Fixed 60 Hz steps with interpolated rendering, so movement is the same at 30, 60 and 120 Hz. Colliders, hurtboxes and pushboxes are set in data and don't depend on PNG size.
- **Stages.** Six parallax layers (sky, far, mid, near, terrain, atmosphere) are generated once from a seeded RNG into cached `Path2D` geometry. Collision comes only from `js/data/maps.js`, so any layer can later be swapped for image art.

### Adding a fighter (#0002)

1. Put the frames in `assets/characters/0002/`.
2. Add a definition to `CHARACTERS` in `js/data/characters.js` (animations, movement, collider, hurtboxes, stats).
3. Give it a free `rosterSlot`.

To add attacks, create animations with real frames, define them in `attacks` (see the schema in `js/game/combat.js`), and map them in `actions`. An attack without frames is refused rather than faked.

### Adding a map

Add an entry to `MAPS` in `js/data/maps.js` (size, ground, bounds, spawns, platforms, solids), then register a theme renderer in `js/stages/index.js`.

## Credits

**ALVA**, created by hiyroscript.

**Original work.** Game design, code, interface, ALVA wordmark, and Desert / City
stage artwork by hiyroscript.

**#0001 sprite source.** Original sprite material from:

- *Jump Ultimate Stars*
- The Spriters Resource. Source sheet uploaded by Dazz, contributor FRET.

**Rights.** hiyroscript did not create or claim ownership of the original
third-party character/game artwork. Original characters, games, and related
properties belong to their respective rights holders.

**Project.** Unofficial fan project. No affiliation or endorsement is implied.

The in-game credits (Home credits roll and Credits tab) render from one list in
`js/ui/help-content.js`. The game ships with no audio.
