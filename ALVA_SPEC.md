# Alva — Product Specification

Alva is a browser-based 2D sprite fighting game by **hiyroscript**. This
document is the single specification for the product: what it is, how it must
behave, and how it must look. The README covers running and deploying it.

---

## 1. Product

- **Name:** Alva. The wordmark and document title are set in capitals (ALVA);
  running text uses "Alva".
- **Developer credit:** hiyroscript.
- **Genre:** 2D sprite fighting game, played in the browser on desktop/laptop
  and on phones and tablets in landscape.
- **Character:** calm, precise and professional. Alva should feel like opening
  a polished modern application, not a loud arcade title screen.

## 2. Platform and technical constraints

- Plain HTML, CSS and vanilla JavaScript ES modules. Canvas 2D for battle and
  sprite previews; HTML/CSS for menus (better layout and accessibility).
- No framework, no build step, no npm dependencies, no CSS framework
  (Tailwind, Bootstrap), no WebGL/Three.js/Babylon.js, no 3D assets or fake 3D.
- A working `index.html` at the repository root for GitHub Pages.
- **Every URL is relative** (`./assets/...`, `./js/...`). Never use root-relative
  paths: the project page may live under `/alva/` (or the current repository
  name) and must work under any sub-path.
- Must be served over HTTP(S); sprite normalization reads pixel data.
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`.
- The page never scrolls; every screen fits the viewport and respects
  `env(safe-area-inset-*)`.

## 3. Assets

- `#0001` frames live in `assets/characters/0001/`: four idle frames
  (≈560–592 × 800–832 px), six run frames (≈128–160 × 184–188 px), two
  each of jump (624 × 816 px), fall (544 × 832 px) and land (≈528–544 ×
  560–688 px), one hurt frame (608 × 752 px), one mid-air hurt frame
  (424 × 272 px), four Basic Attack 1 frames `0001_1ba1`–`0001_1ba4`
  (≈264–376 × 392–432 px), three mid-air Basic Attack 1 frames (the kunai
  slash) `0001_midair2ba1`–`0001_midair2ba3` (≈216–352 × 424–536 px), seven
  Basic Attack 2 frames `0001_2ba1`–`0001_2ba7` (≈224–336 × 384–424 px),
  five mid-air Basic Attack 2 frames (the airborne kick)
  `0001_midair1ba1`–`0001_midair1ba5` (≈248–424 × 344–448 px), four Charge
  frames `0001_charge1`,
  `0001_charge2`, `0001_chargea` and `0001_chargeb` (≈272–288 × 416 px),
  three Dodge frames `0001_dodge1`–`0001_dodge3` (≈256–288 × 384–416 px),
  three mid-air Dodge frames `0001_midairdodge1`–`0001_midairdodge3`
  (≈288–320 × 376–400 px) and three Throw frames `0001_throw1`–`0001_throw3`
  (≈280–312 × 360–376 px), twelve Charged BA2 (Sphere Rush) poses
  `0001_rasen1`–`0001_rasen12` (≈64–110 × 80–104 px, ≈2× pixel art) and two
  Dash frames `0001_dash1` (47 × 41 px) and `0001_dash2` (48 × 40 px), drawn
  at 1× (one file pixel per art pixel).
  `0001_dodge3` happens to be the same image as `0001_charge1`; it is kept
  under its own name as the Dodge's recovery frame.
- The twelve Sphere Rush poses are fighter poses, registered as logical
  one-shot clips in `animations` rather than one blind animation, each with
  one role: `rasenForm` (`rasen1`–`rasen3`, formation: the rear palm opens
  for the sphere), `rasenDash` (`rasen4`–`rasen6`, the rush: the sphere
  carried behind, swung forward on `rasen6`), `rasenConfirm`
  (`rasen7`–`rasen8`, the successful contact and stop; `rasen8` is held
  while the sphere on the opponent spins and grows), `rasenExplosion`
  (`rasen9` alone, the pose of the blast itself) and `rasenRelease`
  (`rasen10`–`rasen12`, the release / recovery after the blast). A rush
  that catches nobody has its own one-frame `rasenWhiffRelease`: `rasen12`
  alone. That clip and `rasenRelease` share the one `0001_rasen12.png` (the
  same URL, preloaded once, never a copy on disk). They use the normal
  fighter normalization (bottom-centre anchor, fighter height, per-clip
  source facing, pixel-grid detection) and inherit the character's
  `sourceFacing: 1`.
- The same folder holds #0001's projectile art: three shuriken frames
  `0001_shuriken1`–`0001_shuriken3` (48–64 px square). They are the in-flight
  spin of one shuriken, not fighter poses and not three shurikens. They are
  registered apart from the fighter animations (`projectileAnimations`),
  preloaded with the character, and normalized and drawn separately: same
  grid detection, a centre anchor instead of bottom-centre, and the
  fighter's world-per-art-pixel scale, never fitted to the fighter's height.
- The same folder holds #0001's effect art: the clone appear / vanish cloud,
  ten frames `0001_cloneav1`–`0001_cloneav10` (≈38–210 × 36–132 px, ≈2×
  pixel art), a smoke puff that grows, fills out and then breaks into
  scattered wisps. Appearance plays them in forward order (`cloneav1 → … →
  cloneav10`); disappearance plays the same ten files in reverse order
  (`cloneav10 → … → cloneav1`), reversed at runtime, never duplicated or
  reversed on disk. They are registered apart from the fighter and projectile
  animations (`effectAnimations.cloneCloud`), preloaded with the character,
  and normalized like projectile art (own art size, centre anchor, the
  fighter's world-per-art-pixel scale, never fitted to the fighter's height).
  The cloud is direction-neutral (`sourceFacing: 0`) and never mirrored. An
  early upload named `0001_ cloneav8.png` (with a space) was replaced by
  `0001_cloneav8.png`; only the latter exists.
- The same folder holds the Sphere Rush's blue sphere, eleven effect frames
  `0001_prasen1`–`0001_prasen11` (≈36–116 × 34–118 px, ≈2× pixel art),
  registered as three `effectAnimations` at 12 fps:
  `rasenSphereBuild` (`prasen1`–`prasen6`, energy gathering into the
  complete orb, once, 0.5 s), `rasenSphereImpact` (`prasen7`–`prasen9`, the
  authored rotation of the orb spinning on the caught opponent, looped
  `7 → 8 → 9 → 7 → …`, 0.25 s a turn, `loop: true`; the technique draws it
  ever larger through the hold, since the frames' own sizes do not grow) and
  `rasenSphereExplosion` (`prasen10`–`prasen11`, the lighter, brighter
  blast, once, ≈0.167 s; never part of the spin). Normalized like the clone
  cloud (own art size, centre anchor, the fighter's world-per-art-pixel
  scale, never fitted to the fighter's height): the complete `prasen6` orb
  is 38 × 41 art pixels, ≈64 × 69 world units. Direction-neutral
  (`sourceFacing: 0`): the round orb is never mirrored, only its position
  offset follows facing. It is not a projectile. None of the 23 files is
  duplicated, and none remains at the repository root.
- Source orientation: #0001's art faces right (`sourceFacing: 1` on the
  character), except `midairdodge1`–`3`, which are drawn facing left. An
  animation may override the character's orientation with its own
  `sourceFacing` (`midairDodge` has `-1`); the normalized clip keeps it, and
  the renderer mirrors a frame only when the fighter's facing differs from
  its clip's `sourceFacing`. It is rendering metadata only: the fighter's
  facing, movement, hurtboxes and hitboxes never change with it. The Throw
  frames face right like the rest. The shuriken art is a four-point star
  spinning clockwise; it is mirrored when thrown left so it always rolls
  forward.
- File names: `ba` means basic attack; the digit before it says which one
  (`1ba` is Basic Attack 1, `2ba` Basic Attack 2). The number at the very end
  is always the frame number (`0001_1ba3.png` is Basic Attack 1, frame 3).
  The two mid-air sets are the exception to the first rule: they keep their
  original names after the mid-air moves swapped buttons, so
  `0001_midair2ba1.png` is Mid-air Basic Attack 1 (the kunai slash), frame
  1, and `0001_midair1ba1.png` Mid-air Basic Attack 2 (the airborne kick),
  frame 1. Charge is the
  exception: `charge1` / `charge2` are its startup frames and the lettered
  `chargea` / `chargeb` its sustained loop; `charge1` is also reused, as the
  same file, for the Charge release pose.
- The idle, jump, fall, land and hurt frames (≈16× pixel art), the mid-air
  hurt, Basic Attack 1 and 2, Charge, Dodge, Throw and shuriken frames (≈8×),
  the run frames (≈4×), the clone cloud, Sphere Rush pose and sphere
  frames (≈2×) and the Dash frames (1×, whose grid cannot be detected, so
  the clip's `heightRatio` of 41 / 52 fits its tallest frame at exactly one
  art pixel per file pixel against idle's 52 art pixels)
  are at very different raw scales. A normalization
  system must, once per frame: read the alpha channel, find the visible bounds,
  detect the pixel-art grid, resample to one pixel per art pixel, and anchor
  bottom-centre so the fighter never grows, shrinks, jumps or slides when
  switching animations.
- Sprites render with `imageSmoothingEnabled = false` and, where the size
  allows, whole device pixels per art pixel.
- **Never redraw, recolour, replace or AI-generate the #0001 artwork.** Do not
  download third-party art. Stage art is original and procedural.
- `alvafav.PNG` is the site favicon source.

## 4. Architecture

- One application controller (`App`) owns the managers, the
  `requestAnimationFrame` loop and cross-screen selection state.
- A screen manager swaps `<section>` screens with short CSS transitions (no page
  reloads); inactive screens are `hidden` and `inert`.
- Systems: asset loader, input (keyboard, touch, gamepad), menu navigator,
  device detection, audio stub, sprite normalizer/animator, fighter state
  machine, controllers (player / training AI), physics, camera, combat,
  projectiles, summoned clones, charged techniques, HUD, touch controls,
  stage themes, fighter roster.
- One arena (`js/game/arena.js`) owns the fixed-step world and its Canvas
  rendering. Quick Battle (`Battle`) adds the CPU, phases and round timer;
  Practice Ground (`PracticeSession`) runs Player 1, and an optional
  training-dummy CPU, with none of them.
- Data-driven content: `js/data/characters.js`, `js/data/maps.js` (the Quick
  Battle stages), `js/data/practice-map.js` (the training stage) and
  `js/data/powers.js` (the Power tier tables, 7.2) and `js/data/launch.js`
  (the Base Launch values and Directional Launches, 7.2). Adding a fighter
  means adding frames, a definition (including its Power tiers and each
  hit's damage, Base Launch and Directional Launch) and a roster slot —
  never editing engine code.
- Simulation uses fixed 60 Hz steps with interpolated rendering and a clamped
  frame delta, so behaviour is identical at 30, 60 and 120 Hz.

## 5. Brand identity

### 5.1 Palette

Alva's interface is **near-black/charcoal dominant**, with off-white typography,
gray hierarchy and **green as the sole interface accent**. It follows Seren's
visual discipline without copying its assets. Green signals actions, selection
and progress; it does not fill every card, border or heading. The status
drawn over fighters in battle (stamina bar, CAB rings, 7.3) uses no green.
Nothing in the interface turns blue.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` / `--surface` | `#050506` / `#0a0b0c` | Page / panels |
| `--surface-subtle` | `#141518` | Quiet surfaces, preview backgrounds |
| `--surface-muted` / `--surface-sunken` | `#1c1f24` / `#08090a` | Pressed states, tracks / recesses |
| `--text` / `--text-strong` | `#f4f5f6` / `#ffffff` | Body text / headings |
| `--text-secondary` / `--text-muted` | `#a7acb3` / `#8c929a` | Supporting copy / readable metadata |
| `--text-faint` | `#4c5158` | Decorative / unavailable only |
| `--border` / `--border-strong` / `--border-hover` | White at 9% / 16% / 28% | Hairlines / outlines / hover |
| `--accent` / `--accent-hi` / `--accent-lo` | `#2fbf63` / `#7cf7a6` / `#1f8f4a` | Green accent family |
| `--accent-wash` | `rgba(47,191,99,.14)` | Subtle selected fill |
| `--action` / `--action-hover` / `--action-pressed` | `#197a3d` / `#1b8141` / `#146332` | Green fills with ≥ 4.5:1 white label contrast |
| `--surface-overlay` | `rgba(10,11,12,.94)` | Readable map detail chrome |
| `--focus-ring` | Dark 2 px separation, off-white 4 px outer ring | Keyboard/gamepad focus |

### 5.2 Component rules

- **Primary action:** deep green fill, white text; hover slightly lighter,
  pressed darker. Existing geometry is retained outside Home.
- **Secondary action:** transparent or charcoal, off-white/gray text, thin
  gray border; hover slightly lightens the surface.
- **Selected:** green border plus a check mark, filled indicator or underline.
  Small bright-green indicators use dark text for contrast.
- **Focus:** off-white ring with dark separation; never green alone.
- **Progress:** green fill on a charcoal track.
- **Tabs:** active off-white text with green underline; inactive gray.
- **Setup steps:** done = gray with a check; current = filled green number and
  underline; future = gray.
- **Panels:** charcoal, translucent light hairlines, established radii and
  restrained neutral shadows. No new textures. Glass appears in two places
  only: the Home credits strip (6.2) and the battle glass (7.3) used by the
  battle HUD, the pause/result panels and the Return Home confirmation.

### 5.3 Wordmark and favicon

- The wordmark reads **ALVA**, drawn from original geometric SVG letterforms
  (`js/ui/logo.js`): bold, uppercase, evenly and optically spaced, no skew, no
  shadows, no effects. It inherits `currentColor`.
- It is used as the large Home title and in the loading overlay. The SVG
  exposes `role="img"`, `aria-label="ALVA"` and a `<title>`;
  repeated decorative copies are `aria-hidden`.
- Favicon: `alvafav.PNG`, referenced with a relative URL for project subpaths.

### 5.4 Typography

- System font stack only: `system-ui, -apple-system, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif`; monospace for small labels.
- Hierarchy through size and weight (600–700), not effects. No skewed or
  900-weight display text in the interface.
- Headings and buttons in title case ("Select Fighter", "Start Battle");
  small metadata labels in tracked monospace capitals.
- The Select Stage action "Confirm and start battle" is intentionally sentence case.

### 5.5 Motion

- 120–220 ms hover/focus transitions, gentle screen transitions (short fade
  and ≤ 12 px slide), subtle press feedback, restrained idle animation.
- No streaks, wipes or large hover translations. Home alone has continuous
  motion: a slow, constant upward credits roll beside its stable green slash.
- `prefers-reduced-motion: reduce` removes transitions and animation; the Home
  credits remain manual-only as a single readable copy.
- Home credits accept wheel/trackpad, touch/pointer dragging, and arrow/Page
  keys when focused. Interaction pauses the roll; after about 2 seconds of
  inactivity it resumes from the current position at 22 CSS px/sec.

### 5.6 Game content exception

The dark/green palette covers interface chrome: menus, buttons, cards, overlays,
focus/selection states, HUD accents and decoration. **Character sprites and
stage artwork are game content** and keep their own colours (e.g. the City's
warm neon lighting and the Desert's sunset). Do not grayscale gameplay art to
fit the palette.

## 6. Screens and flow

```
Splash → Home → Select Mode → Select Fighter → Select Stage → Battle
Home → Practice Ground (starts at once with #0001 and a #0001 practice CPU)
Home → Discover (Power / Launch / Conditions reference; Back returns Home)
Practice Ground → More → Change Fighter (roster dialog) / Change CPU, or Enable CPU once disabled (CPU roster dialog → Disable CPU) / Return (Home)
Battle → Pause → Resume / Restart / Return to Home (confirmed); Help is shown but disabled for now
Battle (a fighter falls into the Void) → the opponent scores a point → that fighter respawns 2 s later; the fight goes on
Battle (a fighter scores its 3rd point) → K.O. → Result → Rematch / Change Stage / Return to Home
Battle (time over, one fighter ahead on points, or level with the lower Launch Point) → Result → Rematch / Change Stage / Return to Home
Battle (time over, level on points and Launch Point: a draw) → a fresh battle starts, no dialog
```

Every menu screen except Home has a consistent Back action. Keyboard, mouse,
touch and gamepad all navigate menus with one shared highlight (mouse hover
moves focus, except on preview-only items such as the Select Mode card).

### 6.1 Splash

- Start on blank, pure black, with no text, loading UI, Home or rotate overlay.
  Both `./hs.jpg` and `./alvafav.PNG` must load through AssetLoader and fully
  decode before either image appears. Fighter preloading continues independently.
- Show `hs.jpg` first, centred with its natural proportions, responsive sizing
  and rounded corners. Fade in for 900 ms, hold for 1600 ms, and fade out for
  800 ms. A continuous, gentle forward zoom from 0.96 to 1.04 spans all three phases.
- "a game by hiyroscript" (exact wording) sits near the bottom centre in soft gray
  with generous letter spacing. It fades in and out with `hs.jpg` and does not zoom.
- After 220 ms of clean black, show `alvafav.PNG` with the same treatment at
  its own appropriate size. The images never overlap visibly.
- After the second fade-out and 200 ms of black, navigate to Home. Its existing
  entrance dissolve reveals it over the still-mounted black splash.
- Input does not skip loading or the sequence. Leaving or re-entering cancels
  pending animation and delays. A load/decode failure logs an error and skips
  the entire intro to Home without showing partial or broken artwork.
- Reduced motion retains the same preload gate and image order, with no zoom
  or fades: each image holds for 1000 ms, separated by the same black beats.
- The page is black before boot; the rotate overlay resumes normally after splash.
  Asset paths remain relative and the existing favicon reference is unchanged.

### 6.2 Home

An open editorial composition on a full-screen near-black background, with
the menu on the left and an angled glass credits strip on the right. There is
no header, build label, eyebrow or keyboard hint bar.

- **Intro:** the dramatically enlarged original ALVA SVG wordmark, then the
  supporting line "Fan project. Big heart." The wordmark's first visible stroke
  lines up with the start of that line.
- **Actions:** exactly three — **Play** (green, white text, arrow) opens Select
  Mode and is focused by default; **Practice Ground** (outlined, chevron)
  beneath it opens Practice Ground (6.8) straight away, with no mode, fighter
  or stage select. It replaced the former, disabled Help & Credits entry; the
  Help & Credits screen and the pause Help view remain in place (the
  pause-menu Help is still disabled, 7.3). **Discover** (outlined, chevron,
  like Practice Ground) directly beneath it opens the Discover reference
  (6.9). All three are in keyboard / gamepad menu navigation, in that order.
  Home buttons have a small 3 px radius.
- **Footer:** "by hiyroscript" in gray monospace, full width under a subtle
  top hairline.
- **Credits strip:** two walls. The back wall is the same near-black as the
  menu; in front of it, a semi-transparent glass strip roughly covers the right
  44% on wide screens, angled 21 degrees and extended beyond the viewport, with
  a faint sheen and edge highlights. A stable 3 px green slash with a
  restrained bloom runs along its left edge, and the strip fades out at the
  top and bottom. No fighter preview or Canvas.
- **Credits roll:** plain upright text (group titles and lines from the shared
  credits data, see 6.6; no cards or boxes), centred in a column inside the
  glass and clipped to it. It rolls upward at a slow constant speed and loops
  seamlessly without end. The roll is driven by the app's frame loop, so
  re-entering Home never stacks timers. The animation-only duplicate is
  `aria-hidden`.
- **Responsive:** safe-area-aware, no Home scrolling. On narrow layouts the
  strip moves farther right and the credits column narrows; when the window is
  taller than it is wide the strip is mostly off-screen and the credits remain
  for assistive technology only. Short landscape heights reduce title size,
  gaps, action height and credit type. Reduced motion stops the roll and
  entrance animations and shows one still copy of the credits that can be
  scrolled by hand.
- All other screens retain their layout, structure, spacing and behaviour.

### 6.3 Select Mode

- Header "Select Mode" with setup steps (Mode · Fighter · Stage).
- A compact Quick Battle card and a full-height Mode details panel, top-aligned.
  No artwork and no keyboard hint bar.
- Quick Battle card (Mode 01, name, description "Choose a fighter and stage,
  then enter battle.", green Select action) in a rail built for future modes.
- Mode details panel: only its heading and a hairline beneath it.
- Mouse hover only previews the card (lighter surface and border) and does not
  move focus. A click, Enter or gamepad confirm selects Quick Battle and opens
  Select Fighter. Keyboard/gamepad focus shows the standard focus ring, which
  stays hidden while the last menu input was a pointer press.
- No fake modes or online matchmaking.

### 6.4 Select Fighter

- Deliberately large roster: 48 slots in a responsive, scrollable grid.
- Only `#0001` (always shown with the `#`) is selectable; other slots are quiet
  locked placeholders (silhouette + lock). No invented names or power ratings.
- Locked slots are non-interactive: hover, Tab and keyboard/gamepad navigation
  skip them, and they show no hover border or focus ring. Any fighter marked
  available becomes a normal selectable slot.
- The selected fighter keeps its check badge but no green outline; focus uses
  the standard neutral focus ring.
- Preview panel: clean animated idle fighter preview in original colours,
  availability badge, fighter name, and "Confirm fighter" primary button.
  No animation controls, frame facts, attack-set or roster-slot metadata,
  preview floor line, roster availability count, or bottom control hints.
  Keyboard/gamepad activation confirms immediately; pointer selects first and confirms on a second press.

### 6.5 Select Stage

- Two stages, **Desert** and **City**, with a large live preview (stage
  artwork only, gentle camera pan) and selectable cards with thumbnails.
- The preview has no fighters and no text overlay; it carries an accessible
  stage label instead.
- Cards show thumbnail, stage name and tagline, with no stage-number label.
  The selected card keeps its Selected badge but no green outline; focus uses
  the standard neutral focus ring.
- "Confirm and start battle" primary action (same label for every
  stage). No bottom control hints.

### 6.6 Help & Credits

- Two tabs (Help, Credits) sharing one scrollable panel; ←/→ switch tabs,
  ↑/↓ scroll.
- Help: desktop controls rendered from the live key bindings, mobile control
  diagram, movement, Charge & cooldowns (including Charge + BA1 = Clone
  Attack and Charge + BA2 = Sphere Rush: already Charging, forms before
  dashing, needs a hit to continue, +1 Launch Point every half second while it
  holds the opponent and 15 on the delayed blast, ground needed throughout;
  each on its own 5-second cooldown that Charge recovers twice as fast; no
  extra control row: both use the existing Charge, BA1 and BA2 controls),
  Throw, Defense, stages and platforms, pause, notes on this build.
- Home no longer links to this screen (its entry became Practice Ground); the
  screen stays in place, and its shared content still feeds the Home credits
  roll and the pause Help view.
- Credits (must remain visible and readable). One list in
  `js/ui/help-content.js` feeds both this tab and the Home credits roll:
  - **ALVA** — created by hiyroscript.
  - **Original work** — game design, code, interface, ALVA wordmark, and
    Desert / City stage artwork by hiyroscript.
  - **#0001 sprite source** — original sprite material from *Jump Ultimate
    Stars*; The Spriters Resource; source sheet uploaded by
    Dazz; contributor FRET.
  - **Rights** — hiyroscript did not create or claim ownership of the original
    third-party character/game artwork. Original characters, games, and related
    properties belong to their respective rights holders.
  - **Project** — unofficial fan project. No affiliation or endorsement is
    implied.
- The UI does not name the character behind #0001. Never imply ownership of
  original third-party characters, games, artwork, or related properties;
  these belong to their respective rights holders.

### 6.7 Loading and dialogs

- Loading overlay: near-black background, small ALVA wordmark, off-white label
  ("Loading #0001"), charcoal track with green progress fill; shown after a
  short delay so instant loads don't flash.
- Error state: readable message, green **Retry** and outlined **Back**.
  Battle never starts before its sprites are ready.
- Confirmation dialog (`alertdialog`, modal): battle glass panel (7.3) with the
  dimmed battle visible behind it, off-white title, gray message, outlined
  cancel (**Keep Playing**, focused) and green confirm (**Return Home**).
  Returning Home from a battle is always confirmed; cancelling returns focus
  to the pause menu.
- Portrait on touch devices: a dark "Rotate your device — Alva is designed for
  landscape play." overlay; the battle pauses and resumes correctly on return
  to landscape.

### 6.8 Practice Ground

A training room, entered straight from Home.

- **Start:** every fresh entry loads #0001 (character `0001`) through the usual
  loading overlay and gives control at once: no fighter select, countdown,
  round banner, timer, points or result. It runs until the player returns
  Home. Practice keeps its own fighter and CPU choices; it never reads or
  changes Quick Battle's selection. Every fresh entry starts with a fresh
  fighter at 0 Launch Point and the practice CPU already enabled: the same
  default fighter (#0001), sharing its one loaded sprite set (one load for
  both), paired with Player 1, framed by the camera and shown on its own HUD
  card. A CPU disabled (or changed) on an earlier visit is never
  remembered.
- **Player 1:** one fighter under Player 1's control, with normal movement,
  physics, attacks, projectiles, clones, Charge, Dash, Defense, animation,
  camera and touch controls. With the CPU disabled there is no other
  fighter, hidden or not, and the camera follows Player 1 alone. Moves aimed
  at an opponent then fall back or miss: Charged BA1 has nobody to appear
  behind, so it is an ordinary BA1 and starts no cooldown; the Sphere Rush
  dashes, finds no one and ends as a miss (after its `rasen12` whiff release
  pose), its cooldown spent.
- **Practice CPU (on by default):** a training dummy, slot `p2`, labelled CPU, at
  the stage's second spawn (320 units right of Player 1's, facing it). It has
  no controller, so it never walks, jumps, drops, attacks, throws, charges,
  blocks or dodges; it is otherwise a normal fighter (hurtboxes, real damage
  adding to its own Launch Point, so launching hits send it further as it
  builds up, hitstun, hurt animations, launches, gravity, stage and pushbox
  collisions, binds; it keeps its spawn's facing, never turning toward its
  opponent). With it, Player 1 and the CPU are
  each other's opponent, so clones, projectiles, the Sphere Rush and melee
  target it and the camera frames both. Each hit it takes shows the
  Launch Point it added (the CombatSystem's resolved hit event) in red over its
  head as a positive `+5`, `+1` or `+15`, rising and fading over 0.8 s;
  simultaneous hits stack, and a hit that adds nothing (the Sphere Rush's
  contact) shows none. It is never knocked out. Its own HUD card follows its
  Launch Point; no timer, rounds or points come with it.
- **Training stage:** its own map (`js/data/practice-map.js`), kept out of the
  Quick Battle stage list. Original Canvas artwork of a minimalist combat
  laboratory: a pale, cool-gray room built from one square grid, with a gridded
  back wall (continuing down past the block's edges) and one compact training
  block in one-point perspective, 1280 units wide, open at both edges: its top
  gridded with stronger lines every five cells and a darker centre axis, its
  outer side face past either ledge, and a ruler along its front edge. No side
  walls, scenery, particles, hazards or moving parts. Only the camera moves the
  room; its static geometry is computed once. A fighter that falls into the
  Void is out of play at once (7.1) and, 2 s later
  (`CONFIG.battle.respawnSeconds`), back at its own spawn, still, in a fresh
  training state: its Launch Point back to 0, full stamina and not exhausted,
  its charged cooldowns cleared (both abilities ready) and its velocity,
  stun, freeze, attack and Dash reset; whatever held or aimed at it (a
  Sphere Rush bind and its ticks, clones, projectiles, damage numbers) goes.
  Player 1 and the CPU each wait out their own 2 s. No point is scored, and
  practice carries on.
- **HUD:** the P1 card and the CPU card (the same cards as Quick Battle's,
  7.3: portrait facing the centre, divider, tag and name over the Launch
  Point number), both against a compact glass **More** button (three dots,
  `aria-label="Practice menu"`, `aria-haspopup="dialog"`, `aria-expanded`)
  centred at the top where Quick Battle's timer sits, a responsive 8–14 px
  lower. No score dots (practice has no points), round label, timer or pause
  control. The CPU card shows only while there is a CPU: rebound when it is
  changed, hidden when it is disabled.
- **Practice menu:** More, Esc / P or gamepad Start freezes practice
  (simulation, gameplay input and touch controls stop) and floats a light,
  translucent glass menu centred under the More button over a lightly
  dimmed, still stage. It holds exactly **Change Fighter** (green, focused),
  **Change CPU** (**Enable CPU** once the CPU is disabled) and **Return**
  (outlined).
  More again, Esc / Back, P, Start or a press on the dim resumes. **Return**
  goes Home and tears everything down.
- **Change Fighter:** opens the fighter roster (the same component, rules and
  look as Select Fighter, 6.4) as one large translucent glass dialog
  (`role="dialog"`, `aria-modal`, titled "Change Fighter"; about 90 vw ×
  88 dvh, safe-area aware, the roster scrolling inside it) over the paused
  stage. The current fighter starts selected, previewed and focused; the
  menu beneath is inert. Confirming loads the fighter, replaces the practice
  fighter in place at the spawn with 0 Launch Point and no cooldowns, clears the old
  fighter's projectiles, clones and technique, rebinds the HUD, closes both
  overlays and resumes. Back / Esc closes only the dialog and returns focus to
  Change Fighter, leaving the fighter unchanged. A failed load keeps the
  current fighter and the dialog. A practice CPU stays through the swap as
  it is.
- **CPU dialog:** Change CPU / Enable CPU opens a second instance of the same
  roster dialog (its own ids and navigation scope), titled Change CPU or
  Select CPU. Confirming loads the fighter, puts it on the CPU spawn
  (replacing any current CPU, never Player 1), rebinds the CPU card, closes
  both overlays and resumes. Back / Esc returns to the menu unchanged. While
  a CPU exists, **Disable CPU** sits right beside Back: it removes the CPU
  with everything aimed at it (a technique holding it, clones summoned at
  it, opponent links, its damage numbers) and its HUD card, closes the
  dialog and leaves practice paused in the menu with focus on Enable CPU.
  A failed load keeps the current CPU (or none) and the dialog.

### 6.9 Discover

An in-game reference, entered from Home's Discover action. Its composition
follows Seren's Cars & more reference screen (an index rail beside a
scrollable page of structured entries) in Alva's own visual language:
charcoal surfaces, off-white type, thin borders and the green accent.
Discover is a character-neutral mechanics reference, not a roster or stat
sheet: it explains how each mechanic works and never says which fighter (or
which of a fighter's attacks) uses which Power, tier, Base Launch or
Directional Launch. No
character name or
ID appears anywhere on it, visibly or in accessible text, and it does not
read the character database, so it stays the same as fighters are added.

- **Header:** the standard menu header — Back (Alva's back icon, labelled
  "Back") and the title **Discover**. Back, Esc / Backspace and gamepad B
  return Home.
- **Rail:** exactly three sections, **POWER**, **LAUNCH** then
  **CONDITIONS**, as a
  `tablist` of real buttons (`tab`, `aria-selected`, `aria-controls`, roving
  tabindex; each page a focusable `tabpanel`). Every visit opens on Power.
  The open section wears a green bar on its leading edge, a faint green wash
  and bolder, full-strength type, so it never relies on colour alone.
  Keyboard or gamepad focus on a section opens it; a click or tap selects
  it; mouse hover is only a preview. Down the left on wide and short
  landscape windows; across the top of the page (bar underneath) on narrow
  windows (≤ 600 px wide unless shorter than 441 px) and tall ones, with
  slightly tighter tracking so the three sections fit side by side.
- **Page:** fills the rest and scrolls on its own; the document never
  scrolls. The open page is a stop in menu navigation so a gamepad can
  scroll it: ↑ / ↓ scroll it while it can scroll that way, then move on,
  and leaving it toward the rail lands on the open section's tab. The hidden
  page is `hidden`, so nothing in it can take focus. Focus shows as an inset
  frame, so an empty page shows it too.
- **Power:** one entry per Power type, in registry order, built only from
  `POWERS` in `js/data/powers.js` (names, descriptions, tier numbers), so it
  cannot drift from gameplay. Each entry is the Power's name and summary
  beside (stacked when there is no room for two columns) its three tiers,
  each with its name, description and a decorative rising-bar meter; every
  tier row looks the same, none is singled out. There are two:
  - **Jump Power**: "Controls how high a normal jump goes. Higher tiers jump
    higher." — Jump Power 1 "Very low jump.", Jump Power 2 "Normal jump.",
    Jump Power 3 "Slightly higher jump."
  - **Speed Power**: "Controls maximum movement speed. Higher tiers move
    faster." — Speed Power 1 "Slow.", Speed Power 2 "Normal speed.", Speed
    Power 3 "Slightly faster."

  Launch is not a Power and is not listed here.
- **Launch:** built only from the registry and reference copy in
  `js/data/launch.js` (`BASE_LAUNCH_VALUES`, `DIRECTIONAL_LAUNCHES` and their
  summaries), in the same entry and row language as Power. Three entries:
  - **Launch Point**: accumulated damage: it starts at 0, all damage taken is
    added to it, the higher it is the harder a hit with a Base Launch above 0
    launches, and it resets to 0 after an elimination, on respawn. Explained,
    with no rows.
  - **Base Launch**: every hit has a Base Launch of 0, 1, 2 or 3; the hit's
    damage is added to the Launch Point first, then the new Launch Point is
    multiplied by it. Rows: Base Launch 0 "No launch. The Launch Point is
    multiplied by zero.", 1 "Normal launch. Uses the Launch Point once.", 2
    "Double launch. Uses twice the Launch Point.", 3 "Triple launch. Uses
    three times the Launch Point.", each marked with its own number (not a
    meter: these are literal multipliers, not tiers), and the formula
    "Launch strength = Base Launch × Launch Point" set apart beneath the
    entry's text.
  - **Directional Launch**: it decides where the launch strength sends the
    target, never how strong it is. Rows: None "The hit deals damage but
    causes no directional launch." (a dash marker), Horizontal "Launches in
    the direction the hit is traveling.", Vertical "Launches upward.",
    Reverse vertical "Launches downward.", each with a decorative arrow
    (along, up, down).

  It names no fighter or attack, and never shows the removed Low / Mid /
  High levels or growth.
- No tuning values (velocities, speeds) or other physics
  constants are shown on either page, and there is no fighter list, "Used
  by" label or ownership highlighting. On short landscape windows the
  entries and rows tighten so a page's entries scroll by in a few steps.
- **Conditions:** intentionally empty — no cards, placeholder or "coming
  soon" copy — until a Conditions system exists. The section is fully
  selectable and accessible.
- A new Power type appears here once it is added to `POWERS`, with no
  change to the screen.

## 7. Battle

### 7.1 Stages and camera

- Stages are compact platform-fighter stages, not enclosed arenas. Each map
  keeps four things apart: the **main stage** (`mainStage`, a finite main
  floor: fighters stand on its top only between its edges, and below its top
  it is a solid block), the **off-stage** open air past both ledges, the
  **camera bounds** (`cameraBounds`) and **the Void** (`voidBounds`, the
  kill boundary). There are no side walls, visible or invisible: fighters can
  run, jump or be knocked off either ledge, fall below the stage and drift
  back if they can.
- Main stages are 1280–1440 units wide (Desert 1360, City 1440, Practice
  Ground 1280). The Void is a blast zone set by margins around the main
  stage (`voidAround` in `js/data/maps.js`, data per stage): Desert 360
  past each ledge, 400 below the stage's top and 760 above it; City 340,
  420 and 800 (over its highest deck); Practice Ground 380 (its block is the
  narrowest), 400 and 760. There is room to be knocked off, fight briefly
  and drift back, but a fighter carried on outward is lost soon after; no
  jump from any stage's highest footing reaches the upper line. Camera
  bounds are the Void's rectangle plus 140 on every side (`cameraAround`),
  so the neutral view never shows the Void and the camera never wanders deep
  into it.
- Backgrounds are flat parallax layers (sky, far, mid, near, atmosphere)
  cached as `Path2D`. The playable geometry (main stage, platforms, solids)
  is drawn in one shared one-point perspective (`js/stages/perspective.js`,
  Practice Ground's projection): a top that recedes in depth, a front face
  with thickness and the side face past whichever ledge the view looks
  beyond, lined up exactly with collision at the fighters' depth.
- **Desert:** a compact sandstone mesa at golden hour over open desert air;
  sky, sun, far mesas, dunes, buttes and hoodoos on the desert floor below,
  warm haze thickening beneath the rim, drifting sand; a rippled sandy top, a
  strata-banded cliff face fading into the haze, and two faceted rock
  outcrops to hop onto. No boundary cliffs.
- **City:** one rooftop block at night over the street canyon; dense skyline,
  moon, searchlights, the elevated train, warm neon; a roof with its props,
  a lit facade and seven one-way platforms (racks, catwalks with billboards,
  a girder, the water-tower deck, a scaffold) that fighters jump up through
  from below, each a slab with depth, plus a stair bulkhead. No boundary
  buildings. The player has no drop-through control and walks off an edge
  to come down; the training CPU can drop through all of them except the
  water-tower deck, and never walks off the roof's edges on its own.
- Collision comes only from map data, never from art.
- **The Void:** a fighter whose centre leaves `voidBounds` (a fixed
  rectangle, `StageCollision.inVoid`) is taken by it: it leaves play at once
  (frozen and no longer updated, drawn, collided, hit, targeted, pushed or
  framed; its stamina bar, name tag and CAB rings go with it, its HUD card
  stays), and anything holding or aiming at it lets go. Every fighter taken
  on one step is out before any is handed on, so a simultaneous fall is one
  event. After `CONFIG.battle.respawnSeconds` (2 s, counted on the
  simulation clock, never a timer) it is back at its own spawn (the usual
  reset onto the surface under it, never inside a solid) in a clean neutral
  state: 0 Launch Point, full stamina and not exhausted, CAB1 / CAB2 ready,
  no velocity, stun, freeze, attack, technique or Dash; it is active at
  once, with no respawn invulnerability or platform. Its Launch Point stays
  as it fell until then. In Quick Battle each fall also scores (7.2). Art: one
  solid black layer beyond the boundary with a single gently wavering inner
  edge (±12 units around the line), drawn over everything in one path and
  one fill, only on the sides the view comes near, so neutral play is never
  boxed in: no stacked bands, second edge or glow. The wave is art only (the
  kill line never moves) and holds still with reduced motion.
- The camera frames both fighters in play (the one still in play alone
  while the other waits to respawn, and holding still if neither is;
  Practice Ground's fighter alone while its CPU is disabled), leaning toward
  the main stage's centre while it
  does, interpolates smoothly and never shows outside its camera bounds (the
  stage, the air around it and a strip past the Void's edge). Fighters occupy ≈ 10 % of
  viewport height (8.8–11.5 %): a 16:9 view shows the whole main stage with
  air past both ledges, and narrower screens zoom out further for it.

### 7.2 Fighters, physics and combat

- `#0001` has Idle, Run, Jump, Fall, Land, Hurt, Mid-air Hurt, Basic Attack 1,
  Mid-air Basic Attack 1, Basic Attack 2, Mid-air Basic Attack 2, Charge,
  Dodge, Mid-air Dodge, Dash, Throw and the Sphere Rush (six clips), plus the
  Shuriken projectile animation and the clone-cloud and sphere effects.
  No invented frames. Rising uses Jump and
  descending (walking off a ledge included) uses Fall; each plays once at 10 fps
  and holds its last frame. Land plays once at 12 fps on touchdown, for
  exactly the clip's length, then returns to idle or run. Land is a visual
  state only: it never changes movement or collision, and a new jump, attack
  or hitstun cuts it short. If those frames fail to load, the fighter holds an
  idle frame without stretching or rotating. Facing flips the sprite (per
  clip, against that clip's source orientation; see 3). It is manual: only
  the fighter's own movement (running past a small speed on the ground,
  steering in the air) and a Dash turn it, a spawn or respawn takes the
  spawn's `facing`, and otherwise it keeps its last facing. It never turns
  toward the opponent by itself (the player, the training CPU and the
  practice dummy alike), so attacks, Throws and the Sphere Rush go the way
  the fighter already faces. The HUD portraits facing the timer (7.3) are a
  separate, fixed rule.
- Hitstun shows Hurt while grounded and Mid-air Hurt while airborne, switching
  to Hurt if the fighter lands still stunned; the pose also holds through the
  impact freeze. Hitstun outranks every other state (charged technique,
  bound, attack, Defense, jump, fall, land, charge, charge release, run and
  idle), and normal states resume when it ends. It is a visual state only:
  no physics or collider changes. Missing hurt art holds an idle frame.
- Basic Attack 1 (BA1) is #0001's first attack, on the `action1` input. On the
  ground it is a punch (`ba1`, 4 frames); in the air a kunai slash
  (`midairBa1`, 3 frames: `midair2ba1`–`midair2ba3`); the character data
  maps `action1: { ground, air }` and the fighter picks by grounded state
  when the button is pressed. Both play once at 12 fps, and the phases are
  whole frames: ground BA1 is frame 1 startup, frame 2 active, frames 3–4
  recovery; mid-air BA1 is frames 1–2 startup (kunai drawn back, then
  overhead) and frame 3 active (the slash arc), with no recovery frame, so
  the attack ends with its clip. Ground BA1 hits once for 5 damage, 0.22 s
  hitstun, 0.14 s blockstun, 0.06 s hitstop and a 0.1 s cooldown, and
  declares `baseLaunch: 1, directionalLaunch: 'horizontal'`: an unblocked
  hit adds its 5 to the opponent's Launch Point, then pushes it away at 1 ×
  that new Launch Point (from 115: 120, at impact vx 1200 × facing) with no
  vertical launch. Mid-air BA1 hits once for 5 damage, 0.24 s hitstun,
  0.15 s blockstun, 0.07 s hitstop and a 0.18 s cooldown (longer, making up
  for the missing recovery), and declares `baseLaunch: 2,
  directionalLaunch: 'vertical'`: an unblocked hit launches the opponent
  upward at 2 × its new Launch Point with no sideways push (from 115: at
  impact vx 0, vy −2400), less high than ground BA2's launch from the same
  Launch Point, as BA2 adds more damage first. A blocked mid-air BA1 is
  neither pushed nor launched. Hitboxes match the
  strike in the contact frame (the punch; the slash arc in front of the
  fighter) and mirror with facing. Movement and facing lock while an attack
  plays; gravity still applies, and a mid-air BA1 that lands finishes its
  own clip instead of switching to ground BA1 or Land. Ground BA1 is
  ground-only.
- Basic Attack 2 (BA2) is #0001's secondary basic attack, on the `action2`
  input, selected the same way (`action2: { ground, air }`). On the ground it
  is a spinning high kick (`ba2`, 7 real frames); in the air an airborne kick
  (`midairBa2`, 5 real frames: `midair1ba1`–`midair1ba5`). Both play once at
  12 fps, and the phases are the frames that visibly strike: ground BA2 is
  frames 1–3 startup (step in, lead jab, spin), frames 4–5 active (the kick,
  drawn with motion trails), frames 6–7 recovery; mid-air BA2 is frames 1–2
  startup, frame 3 active (the kick's forward-low arc) and frames 4–5
  recovery. Ground BA2 is slower and heavier than ground BA1: it hits once
  for 10 damage, 0.24 s hitstun, 0.15 s blockstun and 0.07 s hitstop, with a
  0.15 s cooldown, and declares `baseLaunch: 2, directionalLaunch:
  'vertical'`: an unblocked hit adds its 10, then launches the opponent
  upward at 2 × its new Launch Point (from 110: 120, at impact vx 0,
  vy −2400, airborne, before normal gravity brings it down). Mid-air BA2 hits
  once for 10 damage, 0.22 s hitstun, 0.14 s blockstun and 0.06 s hitstop,
  with a 0.1 s cooldown, and declares `baseLaunch: 2, directionalLaunch:
  'reverseVertical'`: an unblocked hit drives the opponent downward just as
  hard (from 110: at impact vx 0, vy +2400). A grounded opponent is knocked
  straight back onto the ground it stands on; an airborne one is sent down
  toward it. Neither has a horizontal launch. Both come from the shared
  launch path, not special BA2 code. A blocked BA2 still takes chip damage
  (added to Launch Point), blockstun and hitstop, but is never launched or
  driven down (Block cancels every vertical launch) and is not pushed. Hitboxes cover the ground kick's arc and the airborne
  kick's forward-low arc in front of the fighter and mirror with facing.
  The same movement/facing lock applies, gravity keeps working, and a
  mid-air BA2 that lands finishes its own clip instead of switching to
  ground BA2 or Land. Ground BA2 is ground-only; pressing BA2 and Jump on
  the same step attacks on the ground.
- The two mid-air Basic Attacks swapped moves: mid-air BA1 is the
  three-frame kunai slash that used to be mid-air BA2, and mid-air BA2 the
  five-frame airborne kick that used to be mid-air BA1. Each move took its
  whole package with it (art, timing, hitbox, damage, stun, hitstop and
  cooldown); only its launch changed, to the values above. The frame
  files keep their original names.
- Throw is #0001's projectile attack, on the internal `primary` action
  (player-facing name Throw; keyboard J, gamepad X / Square, touch **T**).
  The character data maps `primary: 'throw'`. It is ground-only: there is no
  mid-air Throw art, so pressing it in the air does nothing (no pose, no
  shuriken, Jump / Fall continue). One press plays the 3-frame `throw` clip
  once at 12 fps (`throw1` raises the shuriken by the face, `throw2` whips the
  arm across and lets go, `throw3` follows through) and releases exactly one
  shuriken; holding the button neither loops the clip nor throws again. Its
  phases are whole frames: frame 1 startup, frame 2 active (the release),
  frame 3 recovery. The attack has no melee hitbox (`hitbox: null`); instead
  a one-shot projectile event releases the shuriken once, on the step the
  attack's time reaches `throw2` (`spawnAt` 1/12 s; like other phases it may
  trail the art by one simulation step, never before the release pose and
  never after the Throw ends), at the throwing hand (16 units in front of
  the origin, 38 up, mirrored with facing). A Throw hit before its release
  throws nothing. Movement and facing lock like other attacks, gravity keeps
  working, and there is a 0.25 s cooldown after it. Like
  BA1 / BA2, Throw pressed on the same step as Defense wins and no Dodge
  starts, and it cuts straight out of Charge without the release pose. If
  the Throw frames or the shuriken frames are missing, Throw is refused
  (logged): never a faked pose or an invisible projectile.
- The shuriken is an independent battle entity (`js/game/projectile.js`), not
  a fighter hitbox: it has its own position (interpolated between fixed
  steps like the fighters), velocity, animation clock, hitbox, combat data
  and lifetime, all from character data (`projectiles.shuriken`). Its
  direction is #0001's facing at the release and never changes afterwards,
  even if #0001 turns, jumps, dodges, charges or is hit. It flies straight at
  700 units/s, looping `shuriken1 → shuriken2 → shuriken3` at 18 fps (art
  only; speed never depends on it). Its hitbox is 10 × 10 units, centred.
  It hits at most once: 1 damage (+1 Launch Point), 0.16 s hitstun, 0.10 s
  blockstun, 0.04 s hitstop on the target only (the thrower does not freeze)
  and `baseLaunch: 0, directionalLaunch: null`: 0 × any Launch Point is no
  launch, so it neither pushes nor launches, however high the target's
  Launch Point (from 500 the target is at 501 and still not launched), then
  it disappears. Hits resolve through the same `CombatSystem.applyHit` as melee,
  with the shuriken's direction in place of the attacker's facing, and credit
  #0001 as the attacker. It never hits its thrower. During a Dodge's
  invulnerable frames it passes through unspent (no damage, stun, hitstop,
  launch or event) and can still connect if it overlaps once they end; a
  future Block-type fighter guarding toward it blocks it with the normal chip
  damage and blockstun (no launch to halve), and it disappears. A missed
  shuriken disappears after 1.5 s, once it has flown into the Void, or when it
  meets a solid block (the main stage's own cliff face included); one-way
  platforms and the open air past a ledge do not stop it. No multi-hit,
  homing, bouncing, piercing, explosion or clash. The Battle owns live
  projectiles: each fixed step it updates the fighters, spawns released
  projectiles (once each), moves them, resolves melee and projectile hits,
  then removes spent ones. They are drawn on the battle canvas over the
  fighters, centred on their position with image smoothing off, and cleared
  on restart.
- Charge is one logical fighter state (`charge`) drawn by two clips: the
  startup `chargeStart` (`charge1`, `charge2`, played once) and the sustained
  loop `chargeLoop` (`chargea`, `chargeb`, looping), both at 10 fps. Holding
  Charge plays `charge1 → charge2 → chargea ↔ chargeb`: the startup lasts
  exactly one pass of its clip, then A and B alternate for as long as Charge
  is held, never returning to `charge1` / `charge2` during that hold.
  Charge is driven by the held input alone. It is never a toggle, latch or
  buffered press, and has no minimum hold. Voluntarily releasing Charge
  enters a brief `chargeRelease` visual state using `charge1` for one Charge
  frame-time (its own one-frame clip at 10 fps, 0.1 s), then resumes the
  normal state (idle, or run if a direction is held). It is a release only
  when the fighter was charging on the previous step, Charge is no longer
  held, and nothing of higher priority started on that step; higher-priority
  interruptions (a hit, BA1, BA2, Throw, a Dodge, a jump, leaving the ground,
  the Sphere Rush) do not play `chargeRelease` first, and letting go of
  Charge on the same step as one of them goes straight to it. BA1 interrupts Charge only when
  Charge is let go on the BA1 press step (an ordinary BA1, with no release
  pose and no clone) or when the Clone Attack cannot happen (no opponent, or
  missing art): BA1 while Charge is still held summons a clone
  instead of making the owner perform BA1, and the owner stays in Charge
  (see the Charged BA1 Clone Attack below). Likewise BA2 pressed while Charge
  is still held starts the Charged BA2 Sphere Rush instead of BA2 (below),
  and BA2 interrupts Charge as an ordinary BA2 only when Charge is let go on
  the press step or the Sphere Rush cannot start. The release pose is visual only: no
  damage, hitbox, invulnerability, armour, cooldown change, launch or
  special movement, and movement resumes normally while it shows. Every new
  Charge, including one started during the release pose, restarts from
  `charge1`. Charge is grounded
  only: held in the air, the fighter keeps Jump / Fall (no charge art is
  shown); held through touchdown, Land plays out first and Charge follows.
  While charging, horizontal movement is locked (a run decelerates normally
  to a stop) while gravity and collision still apply. Collider and hurtboxes
  are unchanged. Charge has no hitbox, no damage, no armour and no
  invulnerability, and it is not an attack or a combat action; the one thing
  it does is recover the charged cooldowns faster (see the charged actions
  below) and, separately, refill stamina faster (below). State
  priority is hitstun > charged technique > bound > attack > Defense (Dodge)
  > Dash > jump / fall > land > charge > charge release > run > idle (a Block-type
  guard would sit between land and charge): a hit shows Hurt at once, Throw
  starts straight out of a held Charge (so do BA1 when the Clone Attack
  cannot happen and BA2 when the Sphere Rush cannot start), Jump
  interrupts it, and a Defense press interrupts it with a Dodge. If Charge is still held when that Dodge ends, a fresh Charge starts
  from `charge1`, never from `chargea` / `chargeb`. Charge on a one-way
  platform charges in place and never drops through. If the charge frames
  fail to load, the fighter holds a still idle frame; without the release
  clip the release pose is skipped.
- Defense is the shared player action (keyboard L, gamepad RB / RT, touch
  **D**). How a fighter defends is character data (`defense` in
  `js/data/characters.js`), not part of the input system: Block is one
  possible defense mechanism (a held guard with chip damage from
  `stats.blockDamageScale` and each attack's `blockstun`), Dodge is another.
  Character #0001 uses Defense type: Dodge. It never blocks: no guard state,
  idle-as-guard pose, chip damage or `blockDamageScale`. The Block mechanism
  stays in the engine for future characters with `defense: { type: 'block' }`.
- #0001's Dodge has two real clips, both played once at 12 fps:
  Ground Dodge `dodge1 → dodge2 → dodge3` (`dodge`) and Mid-Air Dodge
  `midairdodge1 → midairdodge2 → midairdodge3` (`midairDodge`). One press =
  one Dodge; holding Defense does not auto-repeat it, and a new Dodge needs a
  new press. Ground or air is selected at activation, and a mid-air Dodge
  continues through landing to the end of its own clip (no switch to the
  ground Dodge or to Land). A Dodge lasts one pass of its clip and is not an
  attack: no hitbox, damage, cooldown, `hasHit` or combat event. While it
  plays, gravity continues, horizontal input is locked like an attack (the
  current velocity slows under the normal ground deceleration or air drag),
  and there is no invented dash, lift, spike or teleport. Facing locks for
  the whole Dodge. Invulnerability is aligned to the visible Dodge frames:
  on the ground frame 1 is startup (bracing), frame 2 invulnerable (the
  side-on lean away) and frame 3 recovery (settling back); in the air
  frames 1–2 are invulnerable (drawn breaking up into afterimages) and frame 3
  recovery (solid again). Like attack phases, the window may trail the art by
  one simulation step. An attack whose active hitbox overlaps the
  invulnerable frames passes through: no Launch Point added, hitstun, blockstun,
  launch or hitstop, and the attack is not used up, so it can still
  connect if it is active after the window ends. A hit during startup or
  recovery is a full, normal hit that cancels the Dodge. A Dodge causes no
  chip damage, no blockstun and no block event, and gives no cooldown, sound,
  particles or counter. Priority: an attack pressed on the same step wins and
  no Dodge starts; a Dodge that starts on the ground owns its step, so a Jump
  pressed with it does not launch; Defense during an attack or hitstun does
  nothing. If a Dodge clip's frames are missing, that Dodge is refused
  (logged) rather than granting invisible invulnerability. The debug overlay
  grays a fighter's hurtboxes while it is invulnerable. Each Dodge pays
  `stamina.dodgeCost` (25) as it starts: none starts while the fighter is
  exhausted or has less than that left, and a Dodge that does not start
  (no Dodge move, missing art, the fighter not free to act) spends nothing.
  A Block-type guard drains `stamina.blockDrain` (20) per second while held
  (rate × step, no refill meanwhile); the step that empties it drops the
  guard at once, and no guard starts while exhausted.
- **Stamina** (`CombatState.stamina`, `maxStamina`, `staminaExhausted`;
  settings from the character's `stamina` entry through `resolveStamina`
  in `js/game/combat.js`, every field optional: `max` 100, `regen` 12 / s,
  `chargeRegen` 30 / s, `dashCost` 25, `dodgeCost` 25, `blockDrain` 20 / s)
  is the one resource a fighter spends, and only on Dash, Dodge and Block.
  It is not the removed Energy and is never called that. Every fighter
  starts full, and every change goes through `setStamina`, clamped to
  [0, max]. It refills by itself at `regen` on every step nothing spent it
  (idle, moving, airborne, attacking, stunned or frozen), at `chargeRegen`
  instead while the fighter is really in its Charge stance (`charging`:
  never the release pose, a charged technique or a Charge held through
  one); this is separate from, and on top of, Charge's faster charged
  cooldowns. Reaching 0 exhausts the fighter: Dash, Dodge and Block stay
  unavailable however much has refilled (25, 99) until stamina is back at
  exactly max, which clears it. Stamina never gates movement, jumps,
  attacks, Throw, Charge or the charged actions, and none of them spend it.
  A respawn and a restart start it full.
- **Dash** (movement, not an attack): two press edges of the same
  horizontal direction (`leftPressed` / `rightPressed`, 7.4), the second
  within `movement.dashTapWindow` (0.22 s) of the first, start a Dash that
  way (`Fighter.trackDashTaps`, `tryDash`); the other direction replaces the
  waiting tap, both at once cancel it, and a double tap that cannot Dash is
  used up, never queued. A Dash needs the fighter free to act (no attack,
  Dodge, stun, bind, charged technique or Dash running), grounded, neither
  in nor holding Charge, the stamina for it (not exhausted, `dashCost` 25
  left, paid once as it starts) and its real `dash` clip (`dash1 → dash2`,
  once at `DASH_FPS` 10; without it the Dash is refused and logged, never
  faked with the run). Attacks, then Defense, are resolved before it on the
  same step, so either wins over it. The fighter faces the Dash at once and
  moves at `movement.dashSpeed` (600, about 1.8× Speed Power 2's 330; the
  top speed itself never changes) for one pass of the clip (0.2 s, ≈120
  units), ignoring input; afterwards the normal movement takes over from
  that speed. It obeys collision: a solid stops it (the Dash ends against
  it), and leaving the ground ends it (the fighter falls on with its speed).
  Hitstun or a bind end it at once. While it runs the fighter cannot attack,
  Dodge, jump, charge or Dash again. It has no hitbox, damage, launch or
  invulnerability. The training CPU never dashes (its input never has press
  edges), though any caller may use `tryDash`.
- Charged actions are a generic dispatch, not a summon shortcut. The
  character's `chargedActions` maps a combat button to a typed descriptor:
  `{ type: 'summon', id }` (an entry in `summons`: a detached temporary
  entity; the fighter keeps charging) or `{ type: 'technique', id }` (an entry
  in `chargedTechniques`: a sequence the fighter performs itself). #0001 has
  `action1: { type: 'summon', id: 'ba1Clone' }` (the Clone Attack) and
  `action2: { type: 'technique', id: 'rasenRush' }` (the Sphere Rush); its
  normal `actions` are unchanged. The activation rule is shared: the fighter
  must already be Charging (it entered the Charge state on an earlier
  simulation step) and Charge must still be held on the step the button is
  newly pressed. `Fighter.tryChargedAction` dispatches on the type
  (`trySummon` / `tryTechnique`); one that happens consumes the press, and
  one that cannot (no opponent for a summon, missing art, invalid data) lets
  the same press fall through to the button's normal attack. Each charged
  action has its own cooldown instead of any cost: the summon's or
  technique's `cooldown` (5 s for both of #0001's), kept per ability in
  `CombatState.chargedCooldowns` (a `CooldownTimers`: `{ remaining, duration }`
  per id, apart from ordinary attacks' short recovery cooldowns in
  `CombatState.cooldowns`), and started the moment the action happens. While
  it is cooling down, the charged press is consumed and does nothing at
  all: no normal attack in its place, no reset, no invisible move. Both
  recover at 1 s per second, or `stats.chargedCooldownRate` (2 for #0001)
  while the fighter is really in its Charge stance (a Charge held since an
  earlier step and still held, not interrupted): a fresh 5 s cooldown takes
  about 2.5 s of uninterrupted charging. Running, jumping, attacking, being
  hit or frozen, dodging, a Charge release and a charged technique recover
  at the normal rate, and starting to Charge never resets anything. Never
  below 0. The Clone Attack never depends on technique code, nor the
  technique on the summon system.
- Charged BA1 Clone Attack (#0001). Trigger: the fighter must already be
  Charging (it entered the Charge state on an earlier simulation step), and
  Charge must still be held on the step BA1 (`action1`: U, B / Circle, touch
  **BA1**) is pressed. There is no new button or key. Charge and BA1 pressed
  together from idle on the same first step is an ordinary BA1 (normal action
  priority), and so is BA1 pressed on the step Charge is let go (no release
  pose, no clone, no cooldown). It is data on the character: `chargedActions`
  maps `action1` to the `ba1Clone` summon, which names the attack (`ba1`),
  the cloud effect (`cloneCloud`), `cooldown` 5, `behindDistance` 48 world
  units, the cloud's `effectOffset` (centred 44 units above the clone's feet,
  half the fighter's height) and a `noGround` fallback (the
  attack `midairBa2` at `offset` `{ x: 0, y: -36 }` from the opponent's
  origin) for when there is no ground behind the opponent (below). A
  successful summon starts Charged BA1's 5-second cooldown once, when it is
  accepted, whether or not the clone then hits; the overhead fallback is the
  same summon, never a second cooldown. While it cools, a Charged BA1 press
  does nothing. With no opponent no clone is summoned and no cooldown
  starts: the press falls through to the ordinary grounded BA1. Before
  starting its cooldown, the summon checks that the cloud has
  real frames, that both of its attacks (BA1 and the no-ground Mid-air BA2)
  are defined with a hitbox and real frames, and that there is an opponent,
  wherever the opponent stands, so whether it works never depends on where
  the clone would appear; missing art or data logs a warning, starts no
  cooldown, summons nothing and falls back to BA1 (itself refused if BA1's
  frames are missing). One press summons exactly one
  clone; holding BA1 does not repeat it. The cooldown (5 s, or about 2.5 s
  of Charge) outlasts a clone's life (≈1.3 s), so clones never overlap; each
  runs its own independent lifecycle.
  The owner does not perform BA1: no `0001_1ba*` art, no attack, no BA1
  cooldown, no `chargeRelease`. While Charge stays held it remains in Charge,
  playing its normal `charge1 → charge2 → chargea ↔ chargeb` art (there is no
  summon pose). Once summoned, the clone is independent: the owner may release
  Charge (the normal release pose), jump, throw, use BA2, dodge or be hit and
  launched, and the clone still finishes appearing, attacking and
  vanishing, with no cooldown refund. It never retargets or summons again.
  The clone is not a Fighter (`js/game/clone.js`): it has no Launch Point,
  controller, pushbox, hurtboxes, defence, jump or coyote logic, physics or
  gravity, and it is not in `battle.fighters`. It is untargetable, takes no
  part in fighter separation or solid collision (the opponent can move
  through it), is ignored by the camera (framing still uses P1 and the CPU)
  and has no marker, name, ring, shadow or HUD card. Its position
  facing and attack are snapshotted once, on the summon step, facing the way
  the opponent faced. Normally it stands on the opponent's back side
  (`x = target.x − target.facing × 48`, never clamped: there are no side
  walls), at the opponent's foot height, and performs BA1. That
  spot counts as ground only if something the clone's collider (#0001's, 34
  wide) would stand on lies at the opponent's current foot height (within
  the physics' 0.5-unit tolerance, with the same horizontal overlap a
  landing body needs), judged at the spot where the clone would really
  appear. A lower platform or the floor further down does not count, and
  neither does the opponent itself being grounded. With no such ground (an
  opponent at a platform's edge or a ledge with its back to the drop, or an
  airborne opponent), the clone appears over the opponent instead, at
  `x = target.x`, `y = target.y − 36` (feet level with its upper body; a
  sideways `offset.x` would mirror with facing, unclamped as well),
  and performs #0001's existing Mid-air BA2 kick. Either way it never moves,
  turns, chases, falls, lands or teleports after that, and never re-checks
  the ground or switches attack, so an opponent who moves away before the
  strike makes it whiff. Lifecycle, all on fixed steps: APPEAR plays
  `cloneav1 → … → cloneav10` once at 20 fps (0.5 s), with no hitbox; the
  clone's first attack frame (`1ba1`, or `midair1ba1` overhead) shows
  beneath the last cloud frame as the smoke clears. ATTACK plays one
  ordinary grounded BA1 from frame 1 with the owner's
  real sprites (`0001_1ba1 → 1ba2 → 1ba3 → 1ba4` at 12 fps, the same
  per-clip `sourceFacing` mirroring, no tint, transparency, outline or
  silhouette) and BA1's own resolved attack definition (`attacks.ba1`: frame 1
  startup, frame 2 active, frames 3–4 recovery, 5 damage, 0.22 s hitstun,
  0.14 s blockstun, 0.06 s hitstop), so its hitbox exists only on the active
  frame and hits at most once. It performs the owner's normalized BA1, so it
  inherits BA1's Base Launch 1 and horizontal Directional Launch (along the
  clone's facing, away from the clone) automatically through the shared
  `CombatSystem.applyHit`; the summon has no launch data of its own and
  never computes a launch itself. The overhead clone instead plays
  Mid-air BA2 from frame 1 (`0001_midair1ba1 → … → midair1ba5` at 12 fps)
  with its own resolved definition (`attacks.midairBa2`: frames 1–2
  startup, frame 3 active, frames 4–5 recovery, 10 damage, 0.22 s hitstun,
  0.14 s blockstun, 0.06 s hitstop), whose hitbox, from the overhead spot,
  lands on a stationary opponent's hurtboxes, and whose Base Launch 2
  reverse vertical launch drives the opponent downward (from 110: `vy =
  +2400`, no sideways push; none on a block, like any vertical launch). VANISH removes the
  body and plays
  the same cloud backwards, `cloneav10 → … → cloneav1`, at the same 20 fps
  (0.5 s), with no hitbox; the clone is then removed. The clone's hitbox is
  resolved from the clone's own position and facing, never the owner's. A hit
  credits the owner as the attacker (the combat event also names the clone as
  its `summon`) and pushes the target along the clone's facing, away from the
  clone. It is a detached hit: the target gets the attack's hitstop and the
  clone pauses its own attack clock for the same 0.06 s, but the owner is never
  frozen (like a projectile's thrower). During a Dodge's invulnerable frames
  it passes through unspent (no damage, stun, launch or hitstop) and can
  still connect if the active frame outlasts them. A Block-type guard (future
  fighters) blocks it only when facing the clone (the clone's facing drives
  the check), so a guard still facing away from a clone at its back is hit.
  Clones are drawn behind both fighters (terrain, shadows, clones, CPU, P1,
  projectiles, foreground), with the cloud centred at the effect offset at
  the fighters' art-pixel scale. The Battle owns live clones: each fixed step
  it updates the fighters, spawns projectiles and moves them, advances live
  clones, spawns the clones summoned that step (each on cloud frame 1),
  resolves melee, projectile and clone hits, then drops spent projectiles and
  finished clones. Restart / rematch and leaving the battle clear every clone.
  The debug overlay draws a clone's hitbox in the attack colour, labelled
  with its attack (`clone ba1`, or `clone midairBa2` overhead), only on its
  active frame; a clone has no hurtboxes to draw.
- Charged BA2 Sphere Rush (#0001, `chargedTechniques.rasenRush`, runtime in
  `js/game/charged-technique.js`). Not a summon, a projectile, ordinary BA2
  or a big melee hitbox: #0001 himself changes animation, holds the sphere,
  dashes and makes contact, driven by a dedicated technique runtime with
  explicit phases (`form`, `dash`, then `whiffRelease` after a miss, or
  `confirm`, `wait`, `explode`, `release` after a hit, and `done`), never
  inferred from animation frames. It sets no `combat.attack`. Trigger:
  the shared charged-action rule with BA2 (`action2`: I, LB, touch **BA2**);
  no new control. Charge and BA2 pressed together from idle, or BA2 pressed
  on the step Charge is let go, is ordinary BA2 (10 damage, `2ba1`–`2ba7`,
  unchanged; mid-air BA2 `midair1ba1`–`5` likewise) with no release pose.
  Grounded only (Charge is too). Once started it owns the fighter and Charge
  no longer needs to be held; it ends only by a miss, a wall, ground loss, a
  hit on #0001, a blocked contact, a lost bind (the Void included),
  completion or a reset. Starting it (the BA2 press step) starts Charged
  BA2's 5-second cooldown, spent whatever follows: a hit, a miss, a Dodge, a
  wall, ground loss or an interruption. Sprite
  partitioning:

  | Frames | Clip | Role |
  | --- | --- | --- |
  | `rasen1`–`3` | `rasenForm` | formation |
  | `rasen4`–`6` | `rasenDash` | rush / contact search |
  | `rasen7`–`8` | `rasenConfirm` | successful contact and stop; `rasen8` held while the sphere grows |
  | `rasen9` | `rasenExplosion` | the explosion pose |
  | `rasen10`–`12` | `rasenRelease` | release / recovery after the explosion |
  | `rasen12` | `rasenWhiffRelease` | release after a rush that caught nobody |
  | `prasen1`–`6` | `rasenSphereBuild` | sphere formation (once) |
  | `prasen7`–`9` | `rasenSphereImpact` | sphere spinning on the target (looped), drawn larger over the hold |
  | `prasen10`–`11` | `rasenSphereExplosion` | explosion (once) |

  Deterministic sequence, in 60 Hz fixed steps (all clips at 12 fps; the
  technique's clock follows the sprite animator, so a clip's first frame
  shows 4 steps, later frames 5):
  1. FORM (activation step + 29 more, 0.5 s): on the BA2 press #0001 leaves
     Charge with no `chargeRelease`, horizontal speed 0, controls and facing
     locked (the facing is snapshotted here). `rasen1 → rasen2 → rasen3`
     play once, `rasen3` held, while `prasen1 → … → prasen6` form in his
     rear palm; poses and sphere frames change on the same steps. It lasts
     the longer of the two clips, so the rush never starts before `prasen6`
     has completed its frame time. No movement, no hitbox.
  2. DASH (15 steps, 0.25 s): `rasen4 → rasen5 → rasen6` once, at a fixed
     1050 world units / s in the snapshotted facing, through normal
     fixed-step physics (≈262 units at most; solids and ground respected, and
     running off a ledge is ground lost; player left / right ignored). The complete `prasen6` stays
     in the hand, never rebuilt. This is the only contact search: each step
     the sphere's hitbox (48 × 48 units, centred on the sphere) is tested
     against the opponent's hurtboxes, from the sphere's actual world
     position. Hand offsets (sphere centre from #0001's origin, facing
     right, x mirrored with facing, one per pose shown): `rasen1` (−15, −47)
     the fist, `rasen2` / `rasen3` (−25, −42) the open palm, `rasen4`
     (−32, −51) and `rasen5` (−34, −51) trailing behind him, `rasen6`
     (32, −47) swung in front. So contact is made on the forward swing
     (`rasen6`), after the rush has closed in; pushboxes keep #0001 from
     running through the opponent meanwhile. No contact by the end of
     `rasen6`, or a solid wall reached first (no pass-through), is a miss:
     WHIFF RELEASE below.
  3. WHIFF RELEASE (a miss only; 5 steps, one `rasen12` frame at 12 fps,
     1/12 s, the `rasenWhiffRelease` clip):
     from the step after the dash's last (or the very step a wall stops it)
     the rush stops dead where it is (`vx` 0, no slide) and the contact
     search ends. The sphere is let go: it simply vanishes, with no impact
     or explosion frames (`prasen7`–`11`), no hit, damage or bind, and none
     of the successful-hit poses (`rasen7`–`11`, nor the full
     `rasen10`–`12` recovery). #0001 shows `rasen12` alone, still committed
     (controls and facing locked, buttons ignored), and is back in Idle /
     normal control only on the step after that frame: the last pose of a
     clean miss is always `rasen12`, never a jump straight from `rasen6` to
     Idle. The technique then ends as a `miss` (or `wall`).
  4. CONFIRM (from the contact step): the rush stops at once (`vx` 0, no
     sliding through). The contact, applied exactly once through
     `CombatSystem.applyHit`: no damage (no large initial hit), Base Launch 0
     and no Directional Launch (no launch), 0.2 s hitstun, 0.15 s blockstun, 0.06 s hitstop on the
     target only.
     The target is then bound (below) with its horizontal speed zeroed and,
     on that same contact step (hits resolve after both fighters have picked
     their poses, so the technique re-picks the target's), is already shown
     in its Hurt pose (`hurt`, or `midairHurt` if caught airborne): no
     one-step delay. The sphere moves from the hand onto it (centre at the
     target's origin + (0, −48), over its body, following it every step) and
     spins there: `prasen7 → prasen8 → prasen9 → prasen7 → …`, one frame
     every 1/12 s counted from the contact step, for as long as it holds
     the target (eight turns in the 2 s delay). #0001 plays
     `rasen7 → rasen8` once from the same step (`rasen7` 5 steps, then
     `rasen8`; 10 steps in all).
  5. WAIT: #0001 holds `rasen8` (never `rasen9`–`12` before the blast),
     committed (no movement, attack, summon, Dodge, Throw, jump or Charge),
     and the bound target holds in its Hurt pose with the sphere still
     spinning on it and growing: `sphereGrowth` draws it from `startScale`
     (1, its own art size) at the start of the hold, by the same amount
     every step, to `endScale` (1.4) as it explodes. The growth is explicit
     because the spin frames' own sizes shrink slightly (`prasen7`–`9` are
     ≈116, 106 and 100 px wide); it never shrinks or pulses, and it is
     visual only: the sphere stays centred on the target (the drawn frame
     grows about its centre), and no hitbox, hurtbox, collision or hit ever
     reads it (the rush's hitbox is gone since the contact).
     TICKS: through CONFIRM and WAIT, while the target is still bound by the
     technique, every whole `tickInterval` (0.5 s) since the contact step
     is one `tickHit` on it through `CombatSystem.applyHit`: 1 damage (+1
     Launch Point), Base Launch 0 and no Directional Launch (no launch), no
     stun or hitstop, so the hold never stutters. They fall 0.5, 1.0 and 1.5 s after the contact (steps 30, 60
     and 90), counted on the fixed-step clock, never from animation frames;
     none before the contact, none after the technique ends or the bind is
     lost, and none on the explosion's step (the explosion is never also a
     tick). Each is one combat event (`move` `rasenRush.tickHit`).
  6. EXPLODE: exactly 2.0 s (`explosionDelay`, 120 steps) after the
     contact step, counted from the hit, never from formation: #0001
     switches to `rasen9`, the explosion pose, and the sphere stops spinning
     and growing and plays `prasen10 → prasen11` once at the grown size. On
     the step `prasen10` first shows the target is released from the bind
     and then takes the explosion, exactly once: 15 damage (18 in all with
     the three ticks) with `baseLaunch: 3, directionalLaunch: 'horizontal'`:
     the 15 is added first, then the target's new Launch Point is tripled
     and sent sideways along the rush, through the same shared launch as
     every other hit (from 105 before the blast: 120, a strength of 360,
     launched at 3600 units/s; a fresh target, 18 after the ticks and the
     blast, at 54, so 540 units/s). It is the
     technique's only launching hit. 0.55 s hitstun, 0.12 s hitstop
     (twice the contact's), 0.3 s blockstun. Releasing first keeps the bind
     from cancelling the launch. `rasen9` is held for the whole blast (it lasts
     the longer of the blast and the explosion pose).
  7. RELEASE: only once the blast is over, the sphere is gone and #0001
     recovers through `rasen10 → rasen11 → rasen12` once (15 steps, 0.25 s),
     still committed: no sphere, hit, bind or contact search.
  8. DONE: after `rasen12` the technique is cleared and #0001 returns to
     Idle / normal control. A full sequence is exactly five hit events: the
     contact (0), three ticks (1 each) and the explosion (15).
     A Charge still held does not restart by itself: it has to be let go
     and held again.
  The bind is a combat status separate from hitstun (`CombatState.bind` /
  `unbind`, keyed by the technique as a token so it only ever releases its
  own hold). While bound a fighter can't act (`canAct()` is false): no walk,
  run, jump, Charge, Throw, BA1, BA2, Defense or turning; its horizontal
  speed is held at 0, gravity and vertical collision still apply (an
  airborne catch falls and lands, the sphere following it), and it shows
  Hurt / Mid-air Hurt. It lasts until the explosion, or until the technique
  is cancelled. Ground dependency: from the first `rasen1` frame to the end,
  #0001 must be supported by real ground, checked every step
  (`body.grounded`, not remembered from the start). Losing it in formation,
  mid-dash (running off a ledge; no hover over the gap, no snap back),
  during a miss's whiff release or after the hit (the recovery included)
  cancels the technique on that step: sphere removed, any bind
  released at once (ticks already dealt stay; no further tick or
  explosion) and #0001
  enters Fall, straight down. A hit on #0001 in any phase cancels it the same
  way and shows the normal Hurt (no armour, no invulnerability). A Dodge's
  invulnerable frames let the rushing sphere pass without a hit, damage,
  bind or use of the sphere; the search continues and may still connect
  after them, otherwise it is a miss. A Block-type guard (future fighters)
  facing the rush blocks the contact with its blockstun (the contact deals
  no damage, so no chip damage either); then there is no bind, tick or
  explosion and the technique ends. The target losing its bind meanwhile
  (a reset, or the Void taking it) ends it too. No Launch Point ends
  the hold: there is no knockout. Before starting, the technique requires all six fighter clips
  and all three sphere effects (and valid data); anything missing logs a
  warning and the same press becomes an ordinary BA2: never a sphere around
  the wrong pose, an invisible sphere, bind or delayed hit, and no cooldown
  starts. The
  sphere is drawn over both fighters (terrain, shadows, clones, CPU, P1,
  sphere, projectiles, foreground), centred at the fighters' art-pixel
  scale with image smoothing off, never mirrored. Restart / rematch
  (`Fighter.reset`) and leaving the battle end any technique, its sphere,
  bind and pending explosion, and drop its owner and target references. The
  debug overlay draws the rushing sphere's hitbox as a dashed cyan box
  labelled `charged ba2 dash`, then a dashed cyan cross on the attached
  sphere's centre, and labels a bound fighter `bound`.
- Every fighter's central combat number is its **Launch Point**
  (`CombatState.launchPoint`): it starts at 0 (a new fighter, a Quick
  Battle restart / rematch, a new Practice fighter and every respawn after
  the Void all start from 0), grows by exactly the damage received, never
  goes below 0, has no maximum and is shown as a bare number (no % sign). A
  hit's `damage` is how much it adds: #0001's BA1 5, mid-air BA1 5, BA2 10,
  mid-air BA2 10, shuriken 1, the clone's BA1 5 or overhead mid-air BA2 10,
  the Sphere Rush 0 on contact, 1 per tick and 15 on the explosion (a
  blocked hit adds its chip damage).
  Every fighter has a Launch Point that starts at 0 and increases by damage
  received. Every hit declares a Base Launch of 0, 1, 2 or 3 and a
  Directional Launch. After a hit's damage is added, its launch strength is:
  Base Launch × the target's new Launch Point. Base Launch 0 therefore never
  launches, while 1 uses normal Launch Point strength, 2 doubles it, and 3
  triples it.

  | Concept | Belongs to | Meaning |
  | --- | --- | --- |
  | Damage | the hit | how much it adds to the target's Launch Point |
  | Launch Point | the fighter | the damage it has taken this life, a plain number |
  | Base Launch | the hit | 0, 1, 2 or 3: how many times the new Launch Point the launch strength is |
  | Directional Launch | the hit | `null`, `'horizontal'`, `'vertical'` or `'reverseVertical'`: where that strength goes |
  | Launch strength | the hit's result | Base Launch × Launch Point (after this hit's damage) |

  Damage, Base Launch and Directional Launch are authored separately on
  every hit, and none is derived from another. The shared
  `CombatSystem.applyHit` adds the damage first, then computes the strength
  (`resolveLaunchStrength`) and turns it into a velocity
  (`resolveDirectionalLaunch`, `js/data/launch.js`) at `LAUNCH_UNIT_SPEED`,
  10 world units per second per point: horizontal along the hit's travel
  (`vx = strength × 10 × facing`), vertical upward (`vy = −strength × 10`,
  as world y grows downward), reverse vertical downward (`vy = +strength ×
  10`), `null` nothing at all. That multiplication is the whole strength:
  no base velocity is added, and horizontal and vertical launches use the
  same number. The one conversion factor is the same for every hit and
  direction, so it only puts the strength in the world's units (gravity
  2500, a jump 920) and never changes its proportions. At 120 Launch Point,
  Base Launch 0, 1, 2 and 3 give strengths of 0, 120, 240 and 360 (speeds
  0, 1200, 2400 and 3600); at 37, 0, 37, 74 and 111. Block modifies the resolved launch afterward: a blocked hit
  keeps half of a horizontal launch (`BLOCKED_HORIZONTAL_LAUNCH_SCALE`, a
  Block rule, not part of Base Launch) and none of a vertical or reverse
  vertical one. A hit that launches replaces the target's sideways speed (a
  vertical one sends it straight up or down) and, when it has one, its
  vertical speed; a hit that does not launch (Base Launch 0, no direction,
  or nothing left after Block) leaves the target's velocity alone. Its
  event carries `damage`, `launchPointBefore`, `launchPointAfter`,
  `baseLaunch` (the integer), `directionalLaunch`, `launchStrength` and
  `finalLaunch` (the world-space `{ x, y }` velocity given). Launch Point
  never disables a fighter (`canAct()` never reads it) and never takes one
  out: only the Void does. On time-up in Quick Battle, level on points, the
  fighter with the lower Launch Point wins (a fighter still waiting to
  respawn counts the Launch Point it fell with); equal is a draw.
- Physics: acceleration, deceleration, max speed (from the fighter's Speed
  Power, below), gravity, jump impulse (from its Jump Power, below),
  ground/platform/solid collision on a finite main floor (no side walls:
  a fighter can leave the stage and fall), landing detection; collision boxes
  independent of PNG size; bottom-centre origin; no sinking, floating or
  jitter. Pushboxes split an overlap evenly, so a fighter at a ledge can be
  shoved off it.
- **Powers** (`js/data/powers.js`): fighter abilities owned at one of three
  tiers, Jump Power and Speed Power. Each Power is a frozen tier table in
  the one `POWERS` registry, the single source of its names, descriptions,
  tier numbers and tuning values: gameplay reads the values, the Discover
  reference (6.9) the names and descriptions. A fighter's definition
  declares one tier of each (`powers: { jump: 2, speed: 2 }`); `Fighter`
  resolves them once, at construction (`getJumpVelocity`, `getMaxSpeed`).

  Tier values (world units per second, at the global gravity of 2500):

  | Power | Tier 1 | Tier 2 | Tier 3 | Becomes |
  | --- | --- | --- | --- | --- |
  | Jump Power | 650 | 920 | 1000 | initial upward speed of the normal jump |
  | Speed Power | 270 | 330 | 360 | top speed of normal movement |

  #0001 has **Jump Power 2** and **Speed Power 2**, exactly its original 920
  jump and 330 top speed, so its jump and movement are unchanged. The tiers
  are the only sources: movement has no raw `jumpVelocity` or `maxSpeed`.
  Speed Power feeds the same normal left / right target speed on the ground
  and in the air (and the run clip's playback rate, relative to the
  fighter's own top speed); acceleration, deceleration, the turn boost, air
  control, gravity, fall speed, coyote time, the jump buffer, launches,
  projectiles, Dodges and charged techniques (the Sphere Rush's 1050 dash)
  never depend on it, just as none of them depend on Jump Power. The shared
  Fighter applies both for Player 1, the CPU and Practice Ground alike. A
  declared tier the table lacks (or a fighter missing a Power) is logged and
  gets tier 2.
- **Launch** (`js/data/launch.js`): how a hit sends its target flying. It is
  not a Power: every hit (an attack's, a projectile's, a charged
  technique's) declares its own `baseLaunch` and `directionalLaunch` beside
  its `damage`, independently of each other:
  `damage: 5, baseLaunch: 1, directionalLaunch: 'horizontal'`,
  `damage: 10, baseLaunch: 2, directionalLaunch: 'vertical'`, or
  `damage: 10, baseLaunch: 2, directionalLaunch: 'reverseVertical'` to drive
  the target downward. `BASE_LAUNCH_VALUES` (`[0, 1, 2, 3]`) holds the only
  legal Base Launch values: literal multipliers, not tiers, levels or
  velocities. `DIRECTIONAL_LAUNCHES` holds the only legal directions:
  `null` (None), `'horizontal'`, `'vertical'` and `'reverseVertical'`
  (Reverse vertical). `resolveHitLaunch` validates both fields once, when a
  hit's definition is built (`createAttackDefinition`,
  `createProjectileDefinition`, `createTechniqueDefinition`): a hit that
  declares neither has Base Launch 0 and no direction; any other Base
  Launch (0.5, 4, 10, −1 ...) is logged and becomes 0, an unknown direction
  is logged and becomes `null`, and a nonzero Base Launch with no direction
  is logged and never launches, so bad data never launches anyone with a
  strength nobody chose. Neither field is inferred from damage, the hitbox
  or the other field. #0001's hits:

  | Hit | Damage | Base Launch | Directional Launch |
  | --- | --- | --- | --- |
  | Ground BA1 | 5 | 1 | horizontal |
  | Ground BA2 | 10 | 2 | vertical |
  | Mid-air BA1 | 5 | 2 | vertical |
  | Mid-air BA2 | 10 | 2 | reverse vertical |
  | Shuriken | 1 | 0 | none |
  | Sphere Rush contact | 0 | 0 | none |
  | Sphere Rush tick (every 0.5 s while held) | 1 | 0 | none |
  | Sphere Rush explosion | 15 | 3 | horizontal |

  Launch never depends on either fighter's Jump or Speed Power.
- Combat architecture (Launch Point, Base Launch, Directional Launch, damage, hitboxes, hurtboxes, attack definitions,
  Defense with Block / Dodge implementations, invulnerability, launches,
  stun and blockstun, hitstop, cooldowns, charged-action cooldowns, binds, charged actions,
  summons and charged techniques) is data-driven. Basic Attacks 1 and 2,
  Throw (with its shuriken projectile), the Charged BA1 Clone Attack (a
  summoned clone performing BA1, or Mid-air BA2 over an opponent with no
  ground behind it) and the Charged BA2 Sphere Rush (a charged
  technique) are implemented through it with real artwork; Special stays reserved
  (mapped to no attack) until real sprites exist, and no attack, projectile,
  clone or frame is ever fabricated. An attack whose frames fail to load is
  refused (no substitute pose, no invisible hitbox), and so is a Dodge, and so
  is a clone summon whose cloud or attack art is missing (no cooldown starts),
  and so is a charged technique with any of its clips missing.
- Quick Battle: 99 seconds, first to `CONFIG.battle.pointsToWin` (3)
  points, against a non-attacking training CPU that uses the same fighter
  definition. It never attacks, throws, charges, summons clones, uses the
  Sphere Rush, dashes or uses Defense (while bound, its input is simply
  ignored); it drops through one-way platforms with an internal intent that
  no player control produces, and stands still while its opponent is out of
  play.
- Match score (`Battle.score`, `{ p1, p2 }`, the match's own: never on a
  fighter or its character, and not `round`): both start at 0. A fall into
  the Void scores exactly one point for the opponent, at once, if the
  opponent is itself in play; the fighter that fell never scores for it.
  When both are out together (taken on the same step, or one taken while
  the other still waits to respawn) that fall scores nothing, so a double
  K.O. never moves both toward the win. The global phase stays `fight`
  while a fighter waits to respawn: the timer runs on and the survivor
  plays on (a Charged BA1 then has nobody to appear behind and falls back to
  BA1; nothing can hit, hold or aim at the absent fighter). The point that
  reaches 3 ends the match: no respawn for the loser, the `ko` phase (the
  K.O. beat) and then the result. Once time is up or the match is won, a
  fall scores nothing and nobody respawns. The result: 3 points wins
  (`reason: 'void'`); on time, more points wins (`'points'`), then the lower
  Launch Point (`'time'`), else a draw. Restart and rematch reset both scores
  to 0 and cancel any respawn wait.

### 7.3 Battle chrome

- The battle keeps deliberate dark chrome over the stage for legibility, using
  the same neutral hierarchy: white labels, gray secondary text.
- **Battle glass** (`.glass` in `styles.css`): semi-transparent charcoal with a
  faint top sheen, a light translucent hairline and a soft shadow; darker than
  the Home strip so type stays readable over bright and dark stage art. HUD
  pieces float over a canvas that repaints every frame, so they skip backdrop
  blur. Pause, result and confirmation panels sit over a paused battle and add
  a light blur where supported, with a denser fill as the fallback. The stage
  stays dimly visible behind every panel.
- HUD fighter cards: P1 (filled white tag) and CPU (outlined tag), in the
  HUD grid's two outer columns but pulled in against the timer (P1's
  `justify-self: end`, the CPU's `start`), so the top reads [P1 card]
  [timer] [CPU card], separate elements with little space between, a
  centred platform-fighter HUD rather than corner health bars; safe areas
  still apply. Each is one compact, semi-transparent glass card (lighter
  than the menu panels, so the stage shows through, dark enough to read on
  every stage): the character's portrait (its own `visual.portrait` crop,
  painted by the same helper as the roster, pixelated), one thin vertical
  divider, then the tag and name (`displayName`) with the Launch Point
  beneath it as a large bare number (`0`, `27`, `143`; no bar,
  maximum, `/100` or `%`). The CPU's card mirrors P1's (portrait on the
  outer right edge). Both portraits face the timer, whatever the fighters'
  facing in play: P1's faces right, the CPU's left, each mirrored
  (`.is-mirrored`, `data-facing`) only when its art (the portrait clip's
  `sourceFacing`, else the character's) faces the other way. The cards hold
  no cooldowns.
- Score dots (Quick Battle only): under each card, centred, one small CSS
  circle per point the match is played to (`pointsToWin`, 3), an outlined
  empty ring (○) filled solid white (●) for each point that fighter has
  scored, in order, the moment it is scored (the third fills as the K.O.
  beat starts). They survive respawns and reset only on a new match, a
  restart or a rematch. Practice Ground shows none.
- Fighter status (Canvas, `js/game/fighter-status.js`, drawn by the Arena
  over everything, the Void included, for each fighter in play whose body
  is on screen, at its interpolated position). Both parts are temporary:
  a thin **stamina bar** just above the name tag, only while stamina is
  below full (`stamina < maxStamina`; hidden at full, so a fresh or
  respawned fighter shows none; about the fighter's width, at least 44 CSS
  px; a black outline, a dark track and a purple fill, `stamina /
  maxStamina` wide, shrinking from the right; gray instead from the moment
  it empties and through the whole refill, proportional to what has come
  back, and gone, never purple, once full), and under the feet a row of
  **CAB1** / **CAB2** rings (Charged BA1, Charged BA2), one only for each
  charged action actually cooling down (`chargedCooldowns.active`), in the
  character's `chargedActions` order: a lone ring centred under the
  fighter, two side by side, no slot kept for a ready one and nothing at
  all while both are ready. Each is a white ring with a black outline that
  fills clockwise from the top as the ability recovers (`progress = 1 −
  remaining / duration`, read straight from the cooldown state, so Charge
  visibly speeds it), the seconds left inside it (`4.3`, one decimal,
  rounded up so it never reads `0.0`), and its white `CAB1` / `CAB2` label
  beneath, all text outlined in black; it disappears on the step the
  cooldown ends. No green. With the bar hidden nothing is kept above the
  tag (`Arena.statusTop`). A fighter off screen keeps only its edge
  pointer; one out of play shows none of it.
- Accessibility: the Launch Point number sits in a group labelled "Launch
  Point" (no maximum); each card carries a screen-reader-only stamina description
  in steps of 5 ("Stamina 75 of 100", "Stamina exhausted, refilling: 40 of
  100"; never "Energy"), and each score row is an image labelled "Player 1:
  1 of 3 points". The HUD writes to the DOM only when a shown value
  changes.
- Timer + pause: one glass control at top centre. The round label and timer
  sit on top; a rectangular pause section sits directly beneath with no gap,
  the same width and a hairline seam, so only the outer corners are rounded.
  Both halves are buttons that pause the game; the timer half is labelled
  "Pause game, N seconds remaining". For the last ten seconds only the digits
  change, from a slightly softened off-white to pure white; the glass never
  changes colour, inverts or flashes.
- Player markers above fighters (under their stamina bars) and ground
  rings: P1 white, CPU gray.
- Round banners ("ROUND 1", "FIGHT", "TIME", and "K.O." under "VOID" when a
  fighter's fall gives the opponent its third point) in white on a dark
  band.
- Pause menu: glass panel over a dimmed battle with "Quick Battle" (no stage
  name), "Paused", green **Resume** (default), **Restart Battle**, **Help** and
  **Return to Home**. Help is shown but disabled for now: muted, no hover or
  press response, skipped by keyboard/gamepad focus.
- Time over: the fighter with more points wins ("Time ran out. More points
  wins the match."); level on points, the one with the lower Launch Point
  wins ("Time ran out with the points level. Lower Launch Point wins."). A glass result menu offers green **Rematch**, **Change Stage**
  and **Return to Home**. Level on both is a draw: no dialog; once the TIME
  banner has played, a fresh battle starts.
- Match K.O.: once the K.O. banner has played, the same result menu opens
  with the kicker "K.O." and the line "The CPU fell into the Void for the
  final point." (or "Player 1 fell ...").

### 7.4 Input

- Keyboard (simultaneous keys, held-state tracking, no reliance on key
  repeat): A/D or ←/→ move (twice in a row to Dash), S/↓ Charge (held), W/Space/↑ jump, J Throw (the
  internal `primary` action), K Special (reserved), L Defense, U Basic
  Attack 1 (BA1), I Basic Attack 2 (BA2), Esc/P pause (the Practice menu in
  Practice Ground). `` ` `` toggles a
  debug overlay (colliders, hurtboxes, attack hitboxes while active, each
  flying projectile's hitbox in magenta with its name, each clone's attack
  hitbox, labelled `clone ba1` or `clone midairBa2`, on its active frame,
  the Sphere Rush's
  dashed cyan sphere box / centre with a `bound` label on a caught fighter,
  solids with the main floor's block among them, and the Void's fixed kill
  line, dashed violet).
  BA1 pressed while Charge is still held is the Charged BA1 Clone Attack
  and BA2 the Charged BA2 Sphere Rush (7.2): no extra key. The input
  snapshot (`InputManager.sample()`) carries `leftPressed` / `rightPressed`
  press edges for the Dash's double tap (7.2), from the same normalized
  press counting as every other action, whichever device made them: a key
  (never its auto-repeat), a touch button, the D-pad, or the left stick
  crossing from neutral into its held zone (holding it there makes no more;
  back near neutral and out again makes another). Fighter never reads raw
  key timestamps; menus never read these edges. In menus S/↓ still navigate down: menu bindings are separate
  from the gameplay `charge` action.
- Gamepad (standard layout) for movement (D-pad / left stick left and
  right), Charge in battle (D-pad down / left stick down, held; menus still
  read them as Down), jump (A), Throw (X / Square), Basic Attack 1
  (B / Circle), Basic Attack 2 (LB), Special (Y / Triangle, reserved),
  Defense (RB / RT) and Start to pause/menus.
- Touch (landscape, Pointer Events, true multi-touch): lower-left
  Left · C · Right with thumb sliding, where the middle button reads **C**, is
  labelled "Charge" and stays pressed for as long as the pointer holds it;
  lower-right staggered cluster —
  Throw (top, the larger button, reading exactly **T** and labelled
  "Throw"; it sends the internal `primary` action) · Special, Defense · BA1,
  BA2, Jump (bottom-right). The
  Defense button sits in the old Block slot; it reads exactly **D** (no
  shield icon) because #0001's Defense is a Dodge, and is labelled "Defense".
  The BA1 button (Basic Attack 1, internally `action1`) and the BA2 button
  (Basic Attack 2, internally `action2`) are solid like Defense and Jump.
  Tapping the timer or the pause section beneath it (top centre, 7.3) pauses.
  Original circular icons, translucent dark fill, white outlines; pressed
  buttons scale down and brighten to white — no hue.
  Reserved actions (only Special now) use dashed outlines and never show
  nagging alerts; Throw is solid.
- Touch controls appear only on touch-first devices (coarse pointer or an
  observed touch), never merely because a desktop window is narrow.
- Gameplay pauses when the pause menu (Practice Ground: the Practice menu,
  the Change Fighter dialog or the CPU dialog) is open, the tab is hidden, or
  the device is blocked in portrait.

## 8. Accessibility

- Semantic buttons, headings, lists, tabs (`tablist`/`tab`/`tabpanel`),
  dialogs (`dialog`/`alertdialog`, `aria-modal`, labelled/described),
  `aria-pressed`/`aria-checked` for selections, `aria-live` previews.
- Visible focus everywhere; focus is managed on every screen and overlay.
- Never rely on colour alone for focus, selection, availability, errors or
  the current setup step — use borders, check marks, filled indicators, labels
  and weight.
- Text meets WCAG AA contrast on its surface; touch targets are comfortable
  (≥ 44 px where space allows).

## 9. Performance

- Target 60 FPS on reasonably modern phones. Cap the canvas backing-store
  device pixel ratio, cache stage geometry, only touch the DOM when HUD values
  change, and tint menu silhouettes once.
- Keep gameplay in logical world units; separate CSS size from backing-buffer
  size.

## 10. Repository

- Entry point `index.html`; styles in `styles.css` (design tokens at the top);
  modules under `js/`; `.nojekyll` at the root.
- The repository is intended to be named `alva` (GitHub Pages path `/alva/`).
  If it still carries an older name, the site simply serves from that path —
  no code references the repository name.
