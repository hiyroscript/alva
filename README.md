# Alva

A 2D sprite fighting game for the browser by **hiyroscript**. Pure HTML, CSS and
JavaScript with Canvas 2D: no frameworks, no build step, no 3D. It runs on desktop
and on phones and tablets in landscape.

This is the first playable foundation: full menu flow, a 48-slot roster, two
large stages, movement and platform physics, a camera, a HUD, touch controls,
and a data-driven combat system with #0001's two real attacks, Basic Attack 1
(BA1) and Basic Attack 2 (BA2), a ground and mid-air Dodge on the shared
Defense input, a held Charge stance, a Charged BA1 Clone Attack and a blue
Energy meter under each health bar.

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
| Charge | `S` or `↓` | Lower-left **C** |
| Jump | `W`, `Space` or `↑` | Lower-right, bottom corner |
| Throw | `J` | Lower-right, top (**T**) |
| Special* | `K` | Lower-right, middle row |
| Defense | `L` | Lower-right, middle row (**D**) |
| Basic Attack 1 (BA1) | `U` | Lower-right, bottom row (**BA1**) |
| Basic Attack 2 (BA2) | `I` | Lower-right, bottom row (**BA2**) |
| Pause | `Esc` or `P` | Timer or pause button, top centre |

\* Reserved: wired into input and combat, but inactive until #0001 has matching
attack animations. Its touch button has a dashed outline.

- **Basic Attack 1 (BA1):** a punch on the ground, a kick in the air. The same
  button picks the move from whether #0001 is grounded when you press it; a
  mid-air BA1 that lands keeps playing to the end. Internally this is the
  `action1` input.
- **Basic Attack 2 (BA2):** a slower, heavier spinning high kick on the
  ground, a kunai slash in the air. It picks the move the same way, and a
  mid-air BA2 that lands also plays to the end. Internally this is the
  `action2` input.
- **Throw:** #0001's projectile attack, on `J`, X / Square on a gamepad and
  **T** on touch. One press plays one three-frame Throw
  (`throw1 → throw2 → throw3`, once, at 12 fps) and releases exactly one
  shuriken as the arm whips forward on `throw2`; holding the button does not
  throw again. The shuriken leaves the throwing hand and flies straight the
  way #0001 was facing at the release, spinning through its own three-frame
  loop (`shuriken1 → shuriken2 → shuriken3`, 18 fps). Turning, jumping or
  getting hit afterwards does not change its course. It hits once (4 damage,
  a short hitstun and a small push away from the throw) and disappears; it
  also vanishes after 1.5 s, at a stage edge or against a solid rock or wall.
  A Dodge lets it pass through. Throw is ground-only for now because there
  are no mid-air Throw sprites: pressing it in the air does nothing. It has a
  0.25 s cooldown and no Energy cost. Internally it is the `primary` input.
- **Defense:** the game's generic defensive input: `L`, RB / RT on a
  gamepad, **D** on touch. Different characters may implement Defense
  differently (a Dodge, or in future a Block); the button stays the same.
  #0001 uses **Dodge**. One press plays one Dodge: a grounded sidestep
  (`dodge1 → dodge2 → dodge3`) on the ground, or a mid-air Dodge
  (`midairdodge1 → midairdodge2 → midairdodge3`) in the air, chosen when you
  press it. Holding Defense does not repeat it; press again for another.
  Attacks pass straight through #0001 during the evasive frames (the side-on
  `dodge2`, and the afterimage frames `midairdodge1`–`2`) and hit normally
  before and after them. There is no chip damage, blockstun or guard pose.
  The Dodge adds no dash or teleport: gravity keeps working in the air, and a
  mid-air Dodge that lands plays to the end. The touch button reads **D**
  because #0001's Defense is a Dodge.
- **Charge:** hold `S` / `↓` (**C** on touch, D-pad down or left stick down
  on a gamepad) while #0001 is on the ground. Held, it plays
  `charge1 → charge2` once, then loops `chargea ↔ chargeb` for as long as you
  hold it. Charge must be held; it never toggles. Let go and #0001 shows
  `charge1` briefly as a release pose (one Charge frame, 0.1 s), then returns
  to its normal state; the next Charge starts from the beginning again.
  #0001 stays in place while charging. Charge has no hitbox, armour or
  invulnerability, and it does not generate Energy. A Dodge, Jump, BA2,
  Throw or getting hit take over from it at once, without waiting for the
  release pose; so does BA1 if you let go of Charge as you press it. BA1
  pressed while Charge is still held is the Clone Attack (below). It works
  on one-way platforms without dropping through them. There is no
  drop-through control: walk off an edge to come down.
- **Clone Attack (Charged BA1):** while already holding Charge, press BA1. If
  #0001 has at least 25 Energy, 25 Energy is spent and a clone appears behind
  the opponent in a smoke cloud (`cloneav1 → … → cloneav10`, 20 fps),
  performs #0001's normal BA1, then vanishes through the cloud animation in
  reverse (`cloneav10 → … → cloneav1`). #0001 remains in Charge while the
  button stays held. With less than 25 Energy, BA1 behaves normally instead.
  The clone appears on the opponent's back side, facing it, at the spot where
  the opponent stood when you pressed BA1; it never follows, so an opponent
  who moves away makes it miss. Its punch is BA1's (6 damage, same hitbox,
  hitstun and knockback, pushing the opponent away from the clone), hits
  once, and passes through a Dodge's evasive frames like any attack. The
  impact freezes the opponent and the clone, never #0001. The clone cannot be
  hit, blocks nobody and is not followed by the camera. Once summoned it
  finishes appearing, attacking and vanishing whatever #0001 does next.
  Pressing Charge and BA1 on the same step from standing is an ordinary BA1.
- **Energy:** the blue bar under each health bar. It begins full. The Clone
  Attack spends 25 of it (a full bar pays for four); nothing else spends it,
  nothing restores it yet, and it refills on restart or rematch.
- **Menus:** arrow keys or WASD to move, `Enter` to select, `Esc` to go back. Mouse and touch work too.
- **Touch:** several fingers work at once (hold Right and press Jump, or hold C and press BA1). You can slide your thumb between Left / Charge / Right. **T** is Throw.
- **Gamepad (standard layout):** D-pad or left stick left / right to move and down to Charge in battle (they still navigate menus), A to jump, X / Square to Throw, B / Circle for Basic Attack 1, LB for Basic Attack 2, Y / Triangle for the reserved Special, RB or RT for Defense, Start to pause.
- **Debug:** `` ` `` toggles the collider, hurtbox and attack-hitbox overlay in battle (a hitbox shows only while it can connect; hurtboxes turn gray while a Dodge makes the fighter invulnerable; a flying shuriken's hitbox is outlined in magenta and labelled; a clone's BA1 hitbox shows in the attack colour, labelled `clone ba1`, only on its active frame).

Touch controls show on touch-first devices (coarse pointer, or a touch actually detected). A narrow desktop window doesn't count as a phone. On a phone held in portrait, the game pauses and asks you to rotate.

## Current content

- **Characters:** #0001
- **Maps:** Desert (wide, open, 3.8 screens) and City (rooftops with 7 one-way platforms, 3.1 screens)
- **Animations:** Idle, Run, Jump, Fall, Land (jump/fall play while airborne; land plays once on touchdown), Hurt and Mid-air Hurt (shown during hitstun on the ground / in the air), Basic Attack 1 (4 frames), Mid-air Basic Attack 1 (5 frames), Basic Attack 2 (7 frames) and Mid-air Basic Attack 2 (3 frames), each played once at 12 fps, Dodge and Mid-air Dodge (3 frames each, played once at 12 fps), Charge (charge1 → charge2 once, then chargea ↔ chargeb while held, at 10 fps, with charge1 shown briefly on release), Throw (3 fighter frames, played once at 12 fps), Shuriken (3 looping projectile frames at 18 fps, normalized and drawn separately from the fighter poses) and the clone appear / vanish cloud (`0001_cloneav1`–`0001_cloneav10`, an effect at 20 fps: forwards as a clone appears, the same frames in reverse as it vanishes)
- **Attacks:** Basic Attack 1 and Basic Attack 2, each on the ground and in the air, a ground Throw that releases one shuriken, and the Charged BA1 Clone Attack (25 Energy). Special is reserved.
- **Defense:** #0001 dodges, on the ground and in the air.
- **HUD:** each fighter panel shows a green health bar with a blue Energy bar directly beneath it. Both start full; the Energy bar drops by a quarter with each clone summoned.
- **Mode:** Quick Battle: 1 round, 99 seconds, against a non-attacking training CPU

## Design

Alva's interface follows Seren's restrained visual discipline: near-black and
charcoal surfaces, off-white typography, gray hierarchy and thin translucent
borders. Green is the sole interface accent, used sparingly for primary actions,
selection and progress. Check marks, filled indicators and an off-white focus
ring with dark separation keep states identifiable beyond colour. The one
deliberate exception is the blue Energy meter in the battle HUD, a
gameplay-resource colour; buttons, selection, focus and health stay green or
neutral.

- **Tokens** live at the top of `styles.css` (`--bg`, `--surface*`, `--text*`,
  `--border*`, `--accent*`, `--action*`, `--energy`, radii, shadows, `--focus-ring`). Deeper
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
                      combat, projectiles, summoned clones, sprite
                      normalizer/animator, HUD, touch controls
  stages/             Desert and City layered renderers (procedural Canvas 2D)
  data/               characters.js, maps.js
  ui/                 wordmark, icons, overlays, shared help content, stage preview
```

- **Sprite normalization.** The idle, jump, fall, land and hurt frames are pixel art at roughly 16× scale, the mid-air hurt, Basic Attack 1 and 2, Charge and Dodge frames at 8×, and the run frames at 4×. When a frame loads, the game reads its alpha channel once and finds the visible bounds. It then detects the pixel grid from every colour transition and resamples the frame to 1 pixel per art pixel. Every frame is drawn at the same world scale, anchored bottom-centre at the upper-body centroid, so the fighter keeps the same size and position when switching between animations. When the size stays close to the target, each art pixel maps to a whole number of device pixels. Projectile and effect art (the shuriken at 8×, the clone cloud at 2×) goes through the same grid detection but keeps its own art size, centre-anchored at the fighter's art-pixel scale, and is never fitted to the fighter's height.
- **Simulation.** Fixed 60 Hz steps with interpolated rendering, so movement is the same at 30, 60 and 120 Hz. Colliders, hurtboxes and pushboxes are set in data and don't depend on PNG size.
- **Stages.** Six parallax layers (sky, far, mid, near, terrain, atmosphere) are generated once from a seeded RNG into cached `Path2D` geometry. Collision comes only from `js/data/maps.js`, so any layer can later be swapped for image art.

### Adding a fighter (#0002)

1. Put the frames in `assets/characters/0002/`.
2. Add a definition to `CHARACTERS` in `js/data/characters.js` (animations, movement, collider, hurtboxes, stats).
3. Give it a free `rosterSlot`.

To add attacks, create animations with real frames, define them in `attacks` (see the schema in `js/game/combat.js`), and map them in `actions`: a string for one attack, or `{ ground, air }` to pick by whether the fighter is grounded (as #0001's `action1: { ground: 'ba1', air: 'midairBa1' }` and `action2: { ground: 'ba2', air: 'midairBa2' }` do). Time `startup` / `active` / `recovery` to whole frames of the clip so the hitbox is live only while the strike is on screen. An attack without frames is refused rather than faked.

To give a fighter a charged action, map a combat button in `chargedActions` to an entry in `summons` (see the schema in `js/game/clone.js`), as #0001's `action1: 'ba1Clone'` does. Pressed while already charging, with Charge still held, it pays the summon's `energyCost` and spawns a clone that performs one of the fighter's own `attacks` through an `effectAnimations` cloud. Without the Energy or the art, the press falls through to the normal attack.

To choose how a fighter defends, give it a `defense` entry. `{ type: 'dodge', ground, air }` (like #0001) plays one Dodge clip per press, with `startup` / `invulnerable` / `recovery` timed to whole frames of that clip; `{ type: 'block' }` is a held guard that takes chip damage (`stats.blockDamageScale`) and each attack's `blockstun`. Either way the player presses the same Defense button. A Dodge without frames is refused, so it never grants invisible invulnerability.

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
