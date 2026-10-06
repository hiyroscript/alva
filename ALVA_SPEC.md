# Alva — Product Specification

Alva is a browser-based 2D sprite fighting game by **hiyroscript**. This
document is the product specification: what the game is, how it must
behave, and how it must look.

**How it is organized.**

- This document holds the product requirements and every shared rule:
  platform, assets, architecture, brand, screens and flow, battle, input,
  accessibility and performance. Its rules apply to every fighter alike;
  where it gives a fighter's value, that is an example and says whose.
- Each fighter's own specification (its art, body, movement profile,
  Powers and moves, with their exact values) is a document of its own and
  part of this specification: [7.2.9](#729-character-specifications)
  lists them ([`docs/characters/`](docs/characters/)).
- The guides in [`docs/`](docs/README.md) explain how the code carries
  these rules out: which modules own what, which data fields a system
  reads, how to extend it and which tests cover it. They describe; this
  document decides. A guide that disagrees with it is the one to correct.
- History (what changed when, and why) lives in
  [`UPDATES.md`](UPDATES.md), not here: this document describes the game
  as it is now. The [README](README.md) covers running and deploying it.
- Nothing here is a future plan. The one capability wired before any
  fighter uses it, Transform, is marked reserved where it appears.

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
- Viewport: `width=device-width, initial-scale=1, maximum-scale=1,
  user-scalable=no, viewport-fit=cover`: a web game, so rapid taps and
  pinches never zoom the page. Together with `touch-action: none` on the
  battle and practice screens, the battle canvas and every touch button,
  this is the whole zoom guard: no JavaScript double-tap detection and no
  blanket `preventDefault()` on touch events. The fighter roster and
  Discover panels still scroll (`touch-action: pan-y`).
- The page never scrolls; every screen fits the viewport and respects
  `env(safe-area-inset-*)`.

## 3. Assets

- **One naming rule for every fighter's art.** Each file is
  `<id>_<codename>_<frame>.png` in `assets/characters/<id>/`: the
  character's own four-digit id, then a universal codename, then the frame.
  The codename is the one the engine uses (7.2, 7.4), never a move's name in game,
  so a fighter's folder reads the same whatever its moves are called
  (`0027_attack2_1.png`, `0027_midair_attack2_1.png`,
  `0027_attack4_object_3.png`, never `0027_fireball3.png`). The last part is
  always the frame number, counted from 1, even for a single frame
  (`0001_hurt_1.png`). The codenames:
  - fighter states: `idle`, `run`, `jump`, `fall`, `land`, `hurt`,
    `midair_hurt` and `mouvment` (the Dash; the stem is spelled `mouvment` on
    purpose);
  - the Shield: `prepshield` (raised), `shielding` (held), `releaseshield`
    (lowered) and `midair_shielding` (held in the air);
  - attacks: `attack1` to `attack5`, `midair_attack1` to `midair_attack5`
    and `extra_attack`;
  - anything an attack creates (a projectile, a clone's cloud, a sphere):
    `<attack>_object`, e.g. `extra_attack_object`, `attack3_object`,
    `attack4_object`.
  The code builds every path with
  one helper (`frames` / `framePath` in `js/data/characters/helpers.js`), from the
  character's id.
- Each fighter's art lives in `assets/characters/<id>/` and nowhere else
  (none at the repository root): `assets/characters/0001/` and
  `assets/characters/0002/` are the only fighter art in the repository
  today, and any future fighter's frames go in a folder of its own id.
  Every file, its size and the clips it makes are listed in the fighter's
  character specification (7.2.9).
- Supplied art may come at very different raw scales (one sheet's poses
  alone may range from 1× to about 16× pixel art). A normalization system must, once
  per frame: read the alpha channel, find the visible bounds, detect the
  pixel-art grid (or, where none can be detected, size the clip by its
  `heightRatio`, or by the character's fixed `visual.pixelSize`), resample
  to one pixel per art pixel, and anchor bottom-centre so the fighter
  never grows, shrinks, jumps or slides when switching animations. By
  convention every fighter's art pixel is the same world size, 88 / 52
  units (the roster's common art-pixel size): a fighter's `visual.height`
  is its reference clip's art height × 88 / 52, so fighters stand at their
  own true heights side by side.
- Where automatic anchoring would drag the body, a clip authors its own
  anchors: `anchorX` (art pixels from the left of each frame's visible
  art) and `anchorY` (art pixels down from the top of each frame's art to
  the feet), for art that reaches below the feet; without it a
  bottom-anchored frame would lift the whole body off the ground. A frame
  with no `anchorY` stands on the bottom of its art (`drawFrame` draws it
  at `-anchorArtY`).
- Source orientation: a character's art declares the way it faces
  (`sourceFacing` on the character, 1 for right), and an animation may
  override it with its own `sourceFacing`; the normalized clip keeps it,
  and the renderer mirrors a frame only when the fighter's facing differs
  from its clip's `sourceFacing`. It is rendering metadata only: the
  fighter's facing, movement, hurtboxes and hitboxes never change with it.
  Projectile art travels its own `sourceFacing` way and is mirrored when
  thrown the other way; `sourceFacing: 0` marks direction-neutral art,
  never mirrored. (All of #0001's and #0002's art faces right; #0001's
  three orbs are direction-neutral.)
- Projectile and effect art (a character's `projectileAnimations` and
  `effectAnimations`) is normalized apart from the fighter's poses: the
  same grid detection, a centre anchor instead of bottom-centre, and the
  fighter's world-per-art-pixel scale, never fitted to the fighter's
  height. A clip reused by two others shares the same file (the same URL,
  preloaded once), never a copy on disk.
- Sprites render with `imageSmoothingEnabled = false` and, where the size
  allows, whole device pixels per art pixel.
- **Never redraw, recolour, replace or AI-generate a fighter's supplied
  artwork** (#0001's, #0002's or any later fighter's). Do not download
  third-party art. Stage art is original and procedural.
- `alvafav.PNG` is the site favicon source.

## 4. Architecture

- One application controller (`App`, `js/core/app.js`) owns the managers,
  the `requestAnimationFrame` loop and cross-screen selection state.
- A screen manager swaps `<section>` screens with short CSS transitions (no page
  reloads); inactive screens are `hidden` and `inert`.
- Systems, by folder (each module's responsibility and dependencies:
  [`docs/architecture/module-responsibilities.md`](docs/architecture/module-responsibilities.md)):
  `js/core/` (asset loader, input for keyboard, touch and gamepad, menu
  navigator, device detection, audio stub, the player's settings
  `js/core/settings.js` (6.10), touch-layout geometry, utilities);
  `js/localization/` (the interface language, 6.11, which `App` owns and
  applies to the whole page, with one string table per language);
  `js/data/` (the registries: characters and each fighter's definition,
  loadout rules, maps, Powers, Launch, difficulty, ability names);
  `js/game/` (the arena, battle and practice modes and physics, with
  `fighters/` for the fighter state machine, its movement rules and
  controllers, `combat/` for attacks, defense, combat state, hit
  resolution, projectiles, summons, techniques and launch bounce, `ai/`
  for the combat AI and its moveset reader, and `rendering/` for the
  camera, sprite normalizer and animator, hit and Shield effects and the
  fighter status); `js/stages/` (stage themes); `js/screens/`;
  `js/ui/` (components, the HUD, touch controls in two layouts, each
  rearrangeable (7.4), the fighter roster, dialogs).
- One arena (`js/game/arena.js`) owns the fixed-step world and its Canvas
  rendering. `Battle` adds the combat-AI CPU at the chosen difficulty (in
  Watch Mode one on each side), phases and round timer; Practice Ground (`PracticeSession`)
  runs Player 1, and an optional training-dummy CPU, with none of them.
- Data-driven content: `js/data/characters.js` (the registry) with one
  definition module per fighter in `js/data/characters/`,
  `js/data/maps.js` (the Quick Battle stages), `js/data/practice-map.js`
  (the training stage), `js/data/powers.js` (the Power tier tables, 7.2),
  `js/data/launch.js` (the Base Launch values and Directional Launches,
  7.2) and `js/data/difficulty.js` (the four CPU levels, 6.3a, used by
  Quick Battle and Watch Mode). Adding a fighter means adding frames, a
  definition module (including its Power tiers, movement profile and each
  hit's damage, Base Launch and Directional Launch), its registration and
  a roster slot — never editing engine code.
- Simulation uses fixed 60 Hz steps with interpolated rendering and a clamped
  frame delta, so behaviour is identical at 30, 60 and 120 Hz.

## 5. Brand identity

### 5.1 Palette

Alva's interface is **near-black/charcoal dominant**, with off-white typography,
gray hierarchy and **green as the sole interface accent**. It follows Seren's
visual discipline without copying its assets. Green signals actions, selection
and progress; it does not fill every card, border or heading. The status
drawn over fighters in battle (Energy bar, cooldown rings, 7.3) uses no green,
and neither does the Shield's black-and-red circle.
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
First launch (no language chosen yet) → Splash → Home + Language chooser (6.11)
Splash → Home → Select Mode → Select Difficulty → Select Fighter → Select Stage → Battle
Home → Watch Mode → Select Difficulty → Select CPU 1 → Select CPU 2 → Select Stage → CPU vs CPU Battle (6.5a)
Home → Practice Ground (starts at once with the first playable fighter and a practice CPU of it)
Home → Discover (Power / Launch / Passives reference; Back returns Home)
Home (no playable fighter) → Play, Watch Mode and Practice Ground disabled, "No fighters available"; Discover and Settings open
Home → Settings gear → Settings dialog over Home (Language / Controls; Esc, Back or close returns to Home) → Customize touch controls → layout editor (Done or Back returns to Settings)
Practice Ground → More → Change Fighter (roster dialog) / Change CPU, or Enable CPU once disabled (CPU roster dialog → Disable CPU) / Return (Home)
Battle → Pause → Resume / Restart Battle / Return to Home (confirmed)
Battle (a fighter falls into the Void) → the opponent scores a point → that fighter respawns 2 s later; the fight goes on
Battle (a fighter scores its 3rd point) → K.O. → Result → Rematch / Change Stage / Return to Home
Battle (time over, one fighter ahead on points, or level with the lower Launch Point) → Result → Rematch / Change Stage / Return to Home
Battle (time over, level on points and Launch Point: a draw) → a fresh battle starts, no dialog
```

A Watch Mode battle follows the same Battle lines (pause, points, K.O.,
result, draw); its Change Stage returns to Watch Mode's Select Stage.

Every menu screen except Home has a consistent Back action. Keyboard, mouse,
touch and gamepad all navigate menus with one shared highlight (mouse hover
moves focus, except on preview-only items such as the Select Mode and Select
Difficulty cards).

### 6.1 Splash

- The splash always comes first. On a device where no language has been
  chosen yet, Home opens after the complete sequence and shows the one-time
  chooser (6.11). Home remains visible but inactive until a choice. The splash credit may
  use the temporary English default. A returning player uses their saved
  language and proceeds directly from splash to Home.
- Start on blank, pure black, with no text, loading UI, Home or rotate overlay.
  Both `./hs.jpg` and `./alvafav.PNG` must load through AssetLoader and fully
  decode before either image appears. Fighter preloading continues independently.
- Show `hs.jpg` first, centred with its natural proportions, responsive sizing
  and rounded corners. Fade in for 900 ms, hold for 1600 ms, and fade out for
  800 ms. A continuous, gentle forward zoom from 0.96 to 1.04 spans all three phases.
- "a game by hiyroscript" (exact wording; "un jeu de hiyroscript" in French) sits near the bottom centre in soft gray
  with generous letter spacing. It fades in and out with `hs.jpg` and does not zoom.
- After 220 ms of clean black, show `alvafav.PNG` with the same treatment at
  its own appropriate size. The images never overlap visibly.
- After the second fade-out and 200 ms of black, the application navigates
  to Home with a reset stack, then asks for a language only if none was chosen.
  Home's existing entrance dissolve reveals it over the black splash.
- Input does not skip loading or the sequence. Leaving or re-entering cancels
  pending animation and delays. A load/decode failure logs an error and skips
  the entire intro without showing partial or broken artwork, then uses the
  same continuation to Home and, for new players only, its language chooser.
- Reduced motion retains the same preload gate and image order, with no zoom
  or fades: each image holds for 1000 ms, separated by the same black beats.
- The page is black before boot; the rotate overlay resumes normally on Home.
  Asset paths remain relative and the existing favicon reference is unchanged.

### 6.2 Home

An open editorial composition on a full-screen near-black background, with
the menu on the left and an angled glass credits strip on the right. There is
no header, build label, eyebrow or keyboard hint bar.

- **Intro:** the dramatically enlarged original ALVA SVG wordmark, then the
  supporting line "Fan project. Big heart." ("Un projet de fan, fait avec
  cœur." in French). The wordmark's first visible stroke lines up with the
  start of that line.
- **Actions:** exactly four, in this order — **Play** (green, white text,
  arrow) opens Select Mode and is focused by default; **Watch Mode**
  (outlined, chevron) beneath it opens Watch Mode's Select Difficulty (6.5a)
  directly, never Select Mode; **Practice Ground** (outlined, chevron)
  beneath that opens Practice Ground (6.8) straight away, with no mode,
  fighter or stage select; and **Discover** (outlined, chevron, like
  Practice Ground) last opens the Discover reference (6.9). All four are in
  keyboard / gamepad menu navigation, in that order, which the DOM order
  matches whatever the layout. Home buttons have a small 3 px radius.
- **No playable fighter:** Play, Watch Mode and Practice Ground each start a
  match, so they are open only while some fighter is playable (7.2; #0001
  is, today). With none, they are disabled (quieter outline, muted label, no hover
  or press response), out of Tab and menu navigation, and a press goes
  nowhere; each is described (`aria-describedby`) by a small muted note under
  the menu, "No fighters available" ("Aucun combattant disponible"), a
  `role="status"` line shown only then, which the wordmark's height allowance
  makes room for. Focus starts on Discover. Discover, the Settings gear and
  the credits stay open. Home re-reads the roster on every visit, so the
  first playable fighter reopens them with nothing else to change.
- **Settings gear:** Settings is Home chrome, not a menu action: a compact
  square button with an original inline SVG gear (`ICONS.settings`,
  `currentColor`), named "Settings" / "Paramètres", in the top right corner
  inside the safe area (`--safe-t`, `--safe-r`), above the credits column.
  It is in keyboard / gamepad navigation (→ from the menu, or ↑ from Play)
  and opens the Settings dialog over Home (6.10); focus returns to it when
  the dialog closes. There is no gear over live Battle or Practice play.
- **Footer:** "by hiyroscript" in gray monospace, full width under a subtle
  top hairline.
- **Credits strip:** two walls. The back wall is the same near-black as the
  menu; in front of it, a semi-transparent glass strip roughly covers the right
  44% on wide screens, angled 21 degrees and extended beyond the viewport, with
  a faint sheen and edge highlights. A stable 3 px green slash with a
  restrained bloom runs along its left edge, and the strip fades out at the
  top and bottom. No fighter preview or Canvas.
- **Credits roll:** plain upright text (group titles and lines from the
  credits data in `js/ui/credits.js`, see 6.6; no cards or boxes), centred in a column inside the
  glass and clipped to it. It rolls upward at a slow constant speed and loops
  seamlessly without end. The roll is driven by the app's frame loop, so
  re-entering Home never stacks timers. The animation-only duplicate is
  `aria-hidden`.
- **Responsive:** safe-area-aware, no Home scrolling. On narrow layouts the
  strip moves farther right and the credits column narrows; when the window is
  taller than it is wide the strip is mostly off-screen and the credits remain
  for assistive technology only. Short landscape heights reduce title size,
  gaps, action height and credit type, so the four actions fit above the
  footer down to a 568 × 320 window, or 844 × 390 with a home-indicator
  inset, clear of the credits column. The wordmark keeps its size wherever
  there is room and shrinks only as much as a short window needs: its width
  is capped by the height left once the padding, footer, tagline and
  actions are counted. Reduced motion stops the roll and
  entrance animations and shows one still copy of the credits that can be
  scrolled by hand.
- All other screens retain their layout, structure, spacing and behaviour.

### 6.3 Select Mode

- Header "Select Mode" with setup steps (Mode · Difficulty · Fighter · Stage).
- A compact Quick Battle card and a full-height Mode details panel, top-aligned.
  No artwork and no keyboard hint bar.
- Quick Battle card (Mode 01, name, description "Choose a difficulty, a
  fighter and a stage, then enter battle.", green Select action) in a rail
  built for future modes.
- Mode details panel: only its heading and a hairline beneath it.
- Mouse hover only previews the card (lighter surface and border) and does not
  move focus. A click, Enter or gamepad confirm selects Quick Battle and opens
  Select Difficulty. Keyboard/gamepad focus shows the standard focus ring, which
  stays hidden while the last menu input was a pointer press.
- No fake modes or online matchmaking.

### 6.3a Select Difficulty

- Quick Battle's second setup step (`js/screens/difficulty-select-screen.js`,
  screen id `difficulty`): kicker "Quick Battle", header "Select Difficulty",
  setup steps with Difficulty current (Mode checked). Back returns to Select
  Mode; Back from Select Fighter returns here.
- Four large selectable cards in ascending order, inspired by Seren's
  four-level scale but in Alva's charcoal, off-white and green:
  **01 Easy** "Slower reactions. Leaves openings.", **02 Medium** "Balanced
  reactions and decisions.", **03 Hard** "Fast reactions. Defends and
  punishes.", **04 Brutal** "Sharp reactions. Relentless decisions." Each
  shows its large mono index, a four-bar ascending scale (1 to 4 bars lit in
  the green accent, the rest hollow outlines, so the level reads by shape and
  label, never by colour alone; Brutal's top bar is a step brighter, the same
  accent family), its name and its line. Each card is a button named "Easy,
  level 1 of 4" (etc.) and described by its line.
- The current level carries the green "Current" check pill (the selected
  stage card's), a green-tinted border and `aria-current="true"`. A fresh
  Quick Battle starts on Medium; returning to the screen focuses the current
  level. Choosing a card (click, Enter / J, gamepad A) sets
  `app.selection.difficulty` and opens Select Fighter. Hover previews only
  (it does not move keyboard/gamepad focus), as on Select Mode.
- One row of four on wide screens; a 2 × 2 grid on narrow windows (≤ 720 px)
  and tall/narrow ones; compact cards in short landscape (the kicker hides
  below 420 px of height). The card area scrolls on its own if a window is
  too short, so Back stays reachable. Back uses the setup screens' 3 px
  radius.
- Between the full header and the phone layout (≤ 1100 px wide) the setup
  steps keep only the current step's name, so four steps fit; completed steps
  keep their check.
- Watch Mode's first step is another instance of this screen (6.5a).

### 6.4 Select Fighter

- Deliberately large roster: 48 slots in a responsive, scrollable grid.
- The roster is `CHARACTERS`, placed by each fighter's `rosterSlot`; a
  fighter is always shown with the `#`. Only a playable fighter (`available`,
  7.2) is a selectable slot; every other slot is a quiet locked placeholder
  (silhouette + lock). No invented names or power ratings.
- **Today two slots are selectable:** `#0001` in slot 01 (selected and
  focused by default, as the first playable fighter) and `#0002` in slot
  02; the other 46 are locked. A fighter that is not
  playable (disabled, with `available: false`) keeps its slot but shows it
  locked like the rest ("Slot 01, locked"): never focused, selected,
  confirmed or previewed, and no portrait loads for it. With no playable
  fighter at all nothing is selected, the preview shows slot 01 locked,
  and Confirm stays disabled, labelled "No fighters available", the
  screen's default focus its Back button; a stale or direct choice of a
  fighter that is not playable never selects its slot.
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
- Watch Mode's Select CPU 1 and Select CPU 2 are two more instances of this
  screen, each with its own roster (6.5a).

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

### 6.5a Watch Mode

Alva's CPU-vs-CPU spectator mode (`js/screens/watch-screens.js`), opened
straight from Home: Home → Watch Mode → Select Difficulty → Select CPU 1 →
Select CPU 2 → Select Stage → CPU vs CPU Battle.

- **Setup.** Four steps, shown in the header's progress steps (Difficulty ·
  CPU 1 · CPU 2 · Stage, the list named "Watch Mode setup", completed steps
  checked) under the kicker "Watch Mode". Each is Quick Battle's own screen
  configured for Watch Mode, with its own screen id and section: Select
  Difficulty (`watch-difficulty`, the same four cards, 6.3a), **Select CPU
  1** (`watch-cpu1`) and **Select CPU 2** (`watch-cpu2`), each its own
  instance of the shared fighter roster (6.4) with its own preview id, and
  Select Stage (`watch-map`, 6.5, primary action "Confirm and watch
  battle"). Choosing a level opens Select CPU 1, confirming a fighter opens
  the next step, and Back retraces them to Home, landing on each choice.
- **One difficulty.** The chosen level applies to both CPUs; there is no
  per-CPU setting. It changes how they decide, never their fighters or the
  rules (6.3a, 7.2).
- **Any two fighters.** CPU 1 and CPU 2 may be different fighters or the
  same one; mirror matches are allowed.
- **Its own selection.** `app.selection.watch` (`difficulty`,
  `cpu1CharacterId`, `cpu2CharacterId`, `mapId`; Medium, the first playable
  fighter for both, or none while none is playable, and the first stage on a
  fresh start) is apart from Quick Battle's, so neither setup changes the
  other's. Stale values fall back as Quick Battle's do (Medium, the first
  playable fighter, the first stage), and a side that is not playable is
  never started (6.7).
- **The battle.** Starting hands the Battle screen `mode: 'watch'`, the
  stage, both fighters and the level. It is the real `Battle` (7.2) with a
  `CombatAIController` on each side and no `PlayerController`; everything
  else, timer, points, Void scoring, respawns, Launch Point, Energy, Shields,
  summons and techniques, clones, projectiles, stage physics, camera, hit effects,
  results, rematch and restart, is unchanged. Both fighters' sprites load
  through the usual loading overlay (once for a mirror match); a failure of
  either uses the usual error with Retry and Back (to Select Stage).
- **Spectator only.** No gameplay input is read and the touch controls are
  hidden, whichever Mobile Controls layout is chosen (no joystick, Dash
  buttons or Down either). Pause (`Esc`, `P`, gamepad Start, the HUD's
  timer or pause button), Resume, Restart Battle and Return to Home work as
  in Quick Battle, and so do Rematch and Change Stage (which returns to
  Watch Mode's Select Stage).
- **Names.** The HUD tags, the markers over the fighters and the results
  say **CPU 1** and **CPU 2** ("CPU 1 Wins", "CPU 2 fell into the Void for
  the final point."); the pause dialog's kicker is "Watch Mode"; the canvas
  is labelled "Watch Mode battle: CPU 1, #0001, against CPU 2, #0001".

### 6.6 Credits

- There is no in-game Help: no Help screen or tab, and no Help in the pause
  menu (7.3). The controls are documented in the README and in 7.4.
- Credits (must remain visible and readable) are the Home credits roll
  (6.2). One list in `js/ui/credits.js` feeds it, each line a translation
  key (6.11), so the roll follows the interface language; proper names stay
  as they are:
  - **ALVA** — created by hiyroscript.
  - **Original work** — game design, code, interface, ALVA wordmark, and
    Desert / City stage artwork by hiyroscript.
  - **#0001 sprite source** — sprite sheet by Finhj on DeviantArt, the
    line linked to the sheet's page (by the deviation's number alone, so
    the address names nothing); the credits the sheet itself gives:
    ZetrasBlack, R0B4N.
  - **#0002 sprite source** — sprite sheet by thespriteanimations on
    DeviantArt, the line linked to the sheet's page (by the deviation's
    number).
  - **Rights** — hiyroscript did not create or claim ownership of the original
    third-party character/game artwork. Original characters, games, and related
    properties belong to their respective rights holders.
  - **Project** — unofficial fan project. No affiliation or endorsement is
    implied.
- A credit is never invented: a fighter's sprite source is named only as
  it was supplied. A credit line may link to its source (`{ label, href }`
  in `js/ui/credits.js`): a new tab, the address never translated, the roll
  holding still while the link has keyboard focus, and its hidden second
  copy never focusable.
- The UI does not name the character behind #0001 or #0002 (or any
  fighter): each stays `#0001` / `#0002` in game, and neither the code,
  the data, the file names nor the documentation name either. Never imply ownership of
  original third-party characters, games, artwork, or related properties;
  these belong to their respective rights holders.

### 6.7 Loading and dialogs

- Loading overlay: near-black background, small ALVA wordmark, off-white label
  ("Loading #0001"), charcoal track with green progress fill; shown after a
  short delay so instant loads don't flash.
- Error state: readable message, green **Retry** and outlined **Back**.
  Battle never starts before its sprites are ready.
- Fighter unavailable: a Battle (Quick Battle, or either side of Watch Mode)
  or a Practice Ground session asked to start with a fighter that is not
  playable (disabled, removed, missing or unknown, from a stale
  selection or the route itself) loads nothing and shows the same overlay
  headed "Fighter unavailable", "This session cannot start: a fighter it
  needs is not available.", with only **Back** (focused; to Home): there is
  nothing to retry.
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

- **Start:** every fresh entry loads the default fighter, the first playable
  one (`practiceDefaultFighter`; never a fixed id), through the usual
  loading overlay and gives control at once: no fighter select, countdown,
  round banner, timer, points or result. It runs until the player returns
  Home. Practice keeps its own fighter and CPU choices; it never reads or
  changes Quick Battle's selection. Every fresh entry starts with a fresh
  fighter at 0 Launch Point and the practice CPU already enabled: the same
  default fighter, sharing its one loaded sprite set (one load for
  both), paired with Player 1, framed by the camera and shown on its own HUD
  card. A CPU disabled (or changed) on an earlier visit is never
  remembered.
- **Player 1:** one fighter under Player 1's control, with normal movement,
  physics, attacks, projectiles, clones, techniques, Dash, Shield, animation,
  camera and touch controls. With the CPU disabled there is no other
  fighter, hidden or not, and the camera follows Player 1 alone. Moves aimed
  at an opponent then do nothing or miss: a summon has nobody to appear
  behind, so its press does nothing at all (no other attack instead) and
  starts no cooldown; a homing dash with nobody to lock on to dashes
  straight ahead; a pull draws nobody in; #0001's Unlimited Void casts and
  its burst meets no one, its cooldown spent; projectiles fly and expire.
- **Practice CPU (on by default):** a training dummy, slot `p2`, labelled CPU, at
  the stage's second spawn (320 units right of Player 1's, facing it). It has
  no controller, so it never walks, jumps, drops, attacks, throws, summons
  or shields; it is otherwise a normal fighter (hurtboxes, real damage
  adding to its own Launch Point, so launching hits send it further as it
  builds up, hitstun, hurt animations, launches, gravity, stage and pushbox
  collisions, pulls, paralysis; it keeps its spawn's facing, never turning
  toward its opponent). With it, Player 1 and the CPU are
  each other's opponent, so clones, projectiles, pulls, techniques and
  melee target it and the camera frames both. Each hit it takes shows the
  Launch Point it added (the CombatSystem's resolved hit event) in red over its
  head as a positive `+2`, `+1` or `+12`, rising and fading over 0.8 s;
  simultaneous hits stack, and a hit that adds nothing shows none. It is
  never knocked out. Its own HUD card follows its Launch Point; no timer,
  rounds or points come with it.
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
  training state: its Launch Point back to 0, full Energy and not exhausted,
  its summon and technique cooldowns cleared (every one ready) and its
  velocity, stun, freeze, paralysis, attack and Dash reset; whatever aimed
  at it (clones summoned at it, its own projectiles, damage numbers) goes.
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
  with everything aimed at it (a summon's startup cast at it, clones
  summoned at it, opponent links, its damage numbers) and its HUD card, closes the
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
  **PASSIVES** (ids `power`, `launch`, `passives`), as a
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
- **Passives:** intentionally empty — no cards, placeholder or "coming
  soon" copy — until a passives registry exists. The section is fully
  selectable and accessible.
- A new Power type appears here once it is added to `POWERS`, with no
  change to the screen.

### 6.10 Settings

A translucent glass dialog over Home (`js/ui/settings-dialog.js`), opened by
Home's Settings gear. Home stays visible behind a light dim, blurred where
backdrop blur is supported, in the same glass as the pause and Practice
panels (`.glass--panel`); the header holds the kicker "ALVA", the title
"Settings" and a labelled close button. It holds the player's settings,
saved on this device, in exactly two sections:

- **Language** — **English** and **Français**, each named in its own
  language and marked with its own `lang`, as a `radiogroup` of two `radio`
  buttons; the one in use is ticked and outlined in green. Choosing one saves
  it at once and the whole interface switches immediately (6.11), this
  dialog included; the dialog stays open.
- **Controls** — **Mobile Controls**, the touch layout Quick Battle and
  Practice Ground use (7.4), with exactly two choices shown as two cards,
  each with a small drawing of its lower-left corner and a line on what it
  gives:
  - **Joystick** (marked "Default") — a circular joystick to move, the
    single-tap **Left mouvement** / **Right mouvement** Dash buttons above
    it.
  - **Classic Buttons** — the original layout: Left and Right at the lower left, a double tap of Left or Right to Dash.

  The cards are a `radiogroup` of two `radio` buttons (`aria-checked`, each
  described by its line); hover only previews. The one in use carries a green
  "Selected" pill and border. Choosing one saves it at once; the next battle
  or practice uses it. Beneath them, **Customize touch controls** opens the
  touch layout editor (6.10a) for the layout in use, beside a line naming
  that layout and a "Custom layout" tag once it has one.
- **Modal behaviour.** `role="dialog"`, `aria-modal="true"`, labelled by its
  title. Opening it pushes its own navigation scope (arrows, D-pad, Enter,
  A move and choose inside it only; nothing behind it can be reached) and
  makes Home `inert`; focus lands on the language in use. `Esc`, gamepad
  Back, the close button or a press on the dim around the panel (never
  inside it) close it, removing exactly its scope, and focus returns to the
  gear. It is never a screen: the screen stays Home throughout.
- **Responsive.** Up to 760 px wide; on short landscape screens the body
  scrolls on its own (`overscroll-behavior: contain`, `touch-action: pan-y`)
  while Home never scrolls, and the cards drop their lines below 460 px of
  height. Narrow windows stack the cards.
- Presentation and input configuration only: keyboard bindings, gamepad
  mappings, fighters and rules never change, and Watch Mode stays free of
  player controls whichever layout is chosen.
- **Storage.** `js/core/settings.js` is the only module that touches
  storage (no other module reads or writes `localStorage` or
  `sessionStorage`): one versioned object under the `localStorage` key
  `alva.settings`, read once at start (`app.settings`) and written whole on
  each change —

  ```
  { "version": 2,
    "language": "en" | "fr" | null,
    "mobileControls": "joystick" | "classic",
    "touchLayouts": { "joystick": { … }, "classic": { … } } }
  ```

  `language` is null until the player picks one (English is used meanwhile,
  but the first-launch chooser still asks: a default is never mistaken for a
  choice). A version 1 object (`{ "version": 1, "mobileControls": … }`) is
  migrated: its Joystick / Classic choice is kept, no language is chosen yet
  (so the chooser shows once) and both layouts are empty. Every value is
  checked on load, one by one: nothing stored, corrupt JSON, any other
  version, an unknown language or scheme, or a malformed layout entry (see
  6.10a) falls back to its own default without disturbing valid
  neighbours. Storage that is missing or throws keeps every choice for the
  visit only.

### 6.10a Touch layout editor

A second modal layer (`js/ui/touch-layout-editor.js`), full screen, over a
still stand-in for a battle screen (a dusk sky, a floor, a dashed outline
where the HUD's centre control sits). It shows the layout in use with its
real touch controls: a `TouchControls` instance drawn and placed by the same
code and stylesheet as in battle, never enabled, so nothing it does reaches
gameplay. Every control of the layout can be moved and resized, the joystick
itself included:

- **Joystick:** Left mouvement, the joystick, Right mouvement, and
  the actions (High Kick / `extra_attack`, Transform, Shield, Jab /
  `attack1`, Red / `attack2`, Maximum Blue / `attack3`, Unlimited Void /
  `attack4`, Hollow Purple / `attack5`, Jump; for #0001's names: every
  fighter shares the layout, so all five numbered buttons show, one the
  fighter does not have, such as #0002's `attack4` and `attack5`, in its
  neutral look).
- **Classic Buttons:** Left, Right, and the same actions.

Each control has a stable control id, independent of its translated name
(`TOUCH_CONTROL_IDS` in `js/core/touch-layout.js`:
`mouvementLeft`, `stick`, `mouvementRight`, `runLeft`, `runRight`,
`extra_attack`, `transform`, `shield`, `attack1` to `attack5`, `jump`); ids
are never shown. A saved layout entry under an id the scheme no longer has
is dropped when the layout is read.

- **Drag** a control to move it; the preview follows at once, and the
  control always stays whole inside the touch-control area. A press that
  barely moves is a tap: it only selects.
- **Select** a control (tap, click, or Enter / A on it): it wears a dashed
  green ring, and the compact glass toolbar across the top names it and
  enables **Smaller** (−), **Larger** (+) and a size slider, 70 % to 180 %
  in 10 % steps, with the value beside them. The control grows or shrinks
  round its centre, and its touch area with it. The size controls are
  disabled while nothing is selected.
- **Keyboard / gamepad:** in the editor (only there) the controls are
  focusable and part of the navigation scope. Enter / A on a focused control
  starts moving it (announced, a solid ring): the arrows or D-pad nudge it by
  2 % of the area per press until Enter / A, `Esc` / Back or focus leaving
  it ends the move. ← / → on the focused slider resize the selected control.
- **Reset to defaults** puts this layout back exactly on Alva's own; **Done**,
  or `Esc` / Back when nothing is being moved, returns to Settings with focus
  on Customize touch controls.
- **Saving** is automatic and deterministic: each change is saved as it
  lands — a drag when it ends, each nudge, each size step, a reset — as that
  layout's own entry in `touchLayouts`; the other layout is never touched,
  and switching Mobile Controls later brings back that layout's own
  arrangement.
- **Stored form.** A layout is `{ [controlId]: { x, y, scale } }`: `x` and `y`
  are the control's centre as fractions (0 to 1, four decimals) of the
  touch-control area, the screen inside its safe-area insets and a 6 px
  margin (the padding of `.touch-controls`); `scale` multiplies its own size.
  Never raw pixels, so a layout made on one landscape screen fits another. A
  control a layout leaves out stays where the stylesheet puts it; the empty
  layout is the original one. On load and on save every entry is checked:
  unknown ids, the other layout's ids, non-objects and non-finite numbers are
  dropped; centres are clamped to 0–1 and scales to 0.7–1.8.
- The toolbar fades and ignores the pointer while a control is dragged; on
  short landscape screens it tightens and drops its hint. The HUD's pause
  and More buttons sit above the touch controls in play (`.hud` z-index 4),
  so no layout can cover them.

### 6.11 Language

Alva's interface is in **English** or **French** (Canadian / international
French, concise game terms).

- **First launch.** The splash always plays first. With no language chosen yet,
  `App.continueAfterSplash` enters Home with a reset stack and shows a
  one-time chooser (`js/ui/language-dialog.js`) over Home, after the splash
  has completed its final black hold: title "Language · Langue", the prompt "Choose your
  language · Choisissez votre langue" and a note that it can be changed in
  Settings, all in both languages at once, and exactly two buttons,
  **English** and **Français**, each with its own `lang`. The browser's
  preferred language only decides which one has focus first. It is a real
  modal (`role="dialog"`, `aria-modal`, its own navigation scope; Back does
  nothing: a choice is required). Choosing saves the language through the
  Settings store, switches the interface immediately and returns focus to
  Home. Home is visible but inert behind the chooser. A returning player goes directly
  from splash to Home in their saved language (`LanguageDialog.ensureChosen()`
  resolves at once). Failed splash loads use the same continuation.
- **One source of strings.** Every player-facing and screen-reader string
  lives in one table per language (`js/localization/strings/en.js` and
  `fr.js`, exposed as `STRINGS.en` and `STRINGS.fr` by
  `js/localization/i18n.js`), looked up by
  stable key with `t(key, params)` (`{name}` placeholders; a placeholder may
  hold another key as `{ t: key }`; `plural(key, n)` follows each language's
  rules). Keys name what a string is for, never what it says, and a
  translated string is never an identifier. English game copy (Powers,
  Launch, difficulty levels, stage names and taglines, neutral control names,
  each fighter's own touch-button names) is read from the registries that
  own it, so it cannot drift; every key exists in both languages, and a key
  missing from French falls back to English. Internal identifiers (control
  and move codenames, character, map and scheme ids, CSS classes, data keys)
  and proper names (ALVA, #0001, Brutal, the credited sources) never
  change.
- **Coverage.** Home (menu, tagline, credits, footer), screen headings,
  kickers and setup steps, Back, difficulty cards, the roster, stage cards,
  Discover, Settings and the editor, the pause, result and Return to Home
  dialogs, Practice Ground's menu and dialogs, loading and error messages,
  banners, the HUD's labels and spoken descriptions (the slot tags too: P1
  reads J1 in French, on the cards and over the fighters), touch-control
  names, keyboard hints (keycaps included), and `index.html`'s own screen
  labels and rotate prompt.
- **Switching.** `App` applies the saved language at start and after every
  change of the setting (`followSettings`). A change sets
  `document.documentElement.lang` and re-reads every marked string on the
  page at once (`localizeTree`: each element made with `tx`, `tattr`,
  `iconLabel`, `setText` or `setAttr` carries its key), plus the few a
  screen composes itself (`screen.localize()`), with no reload. Strings made
  later (dialogs, touch names, HUD labels) are made in the language in use.
- The boot-error and no-script fallbacks, shown before any script runs,
  carry both languages.

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
  jump (its air jump included) from any stage's highest footing reaches the upper line. Camera
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
  to come down, and so does Quick Battle's combat AI; the training CPU can
  drop through all of them except the water-tower deck. Neither CPU ever
  walks off the roof's edges on its own.
- Collision comes only from map data, never from art.
- **The Void:** a fighter whose centre leaves `voidBounds` (a fixed
  rectangle, `StageCollision.inVoid`) is taken by it: it leaves play at once
  (frozen and no longer updated, drawn, collided, hit, targeted, pushed or
  framed; its Energy bar, name tag and cooldown rings go with it, its HUD card
  stays), and anything aiming at it lets go. Every fighter taken
  on one step is out before any is handed on, so a simultaneous fall is one
  event. It is not geometry: nothing rebounds off it (see Launch bounce,
  7.2). After `CONFIG.battle.respawnSeconds` (2 s, counted on the
  simulation clock, never a timer) it is back at its own spawn (the usual
  reset onto the surface under it, never inside a solid) in a clean neutral
  state: 0 Launch Point, full Energy and not exhausted, every summon and
  technique ready, no velocity, stun, freeze, paralysis, attack, Shield,
  technique or Dash; it is active at
  once, with no respawn invulnerability or platform. Its Launch Point stays
  as it fell until then. In Quick Battle each fall also scores (7.2). Art: one
  solid black layer beyond the boundary with a single gently wavering inner
  edge (±12 units around the line), drawn over everything in one path and
  one fill, only on the sides the view comes near, so neutral play is never
  boxed in: no stacked bands, second edge or glow. A thin red rim
  (`#d21f2b`, 1.5 CSS px showing, no blur or shadow) runs along that edge on
  the stage's side: the one set of edge points (`voidEdgePoints`) is stroked
  in red first, at twice that width, then filled black, which hides the
  rim's Void-side half and any of it under another side's black at a
  corner. The wave, rim included, is art only (the kill line never moves)
  and holds still with reduced motion.
- The camera frames both fighters in play (the one still in play alone
  while the other waits to respawn, and holding still if neither is;
  Practice Ground's fighter alone while its CPU is disabled), leaning toward
  the main stage's centre while it
  does, interpolates smoothly and never shows outside its camera bounds (the
  stage, the air around it and a strip past the Void's edge). A fighter of the reference height
  (`CONFIG.render.fighterHeight`, 88 world units: a fixed camera convention,
  what 52 art pixels make at the roster's art-pixel size, never a
  requirement on any fighter) occupies ≈ 10 % of
  viewport height (8.8–11.5 %), whoever is picked, each fighter drawn at
  its own art scale, so a shorter or taller fighter simply stands shorter
  or taller on the same stage. A 16:9 view shows the whole main stage with air past both
  ledges, and narrower screens zoom out further for it.

### 7.2 Fighters, physics and combat

The rules in 7.2.1 to 7.2.8 are shared: every fighter follows them, and a
fighter's own numbers, art and moves come from its definition. A value
given here is the engine's default, or a named fighter's as an example;
each fighter's own values are in its character specification (7.2.9).

#### 7.2.1 Roster and the character system

- **Roster and availability.** `CHARACTERS` (the registry,
  `js/data/characters.js`) holds two definitions today, each in a module of
  its own (`js/data/characters/0001.js`, `0002.js`): `#0001` in roster slot
  01 and `#0002` in slot 02, each fully implemented (7.2.9) and playable:
  `available: true`. Both are preloaded at startup, and #0001, the first
  playable one, is the initial Quick Battle choice, both Watch Mode CPUs
  and the Practice default. A definition existing
  (`getCharacter`, which the engine and its tests build fighters from) is
  not the same as it being playable (`isPlayable`, `getPlayableCharacter`,
  `playableCharacters`): only a playable fighter is preloaded at startup,
  offered by a roster, the initial Quick Battle / Watch Mode choice or the
  Practice default, or started in a Battle or Practice Ground; nothing ever
  falls back to a disabled or missing one (6.2, 6.4, 6.7, 6.8). Disabling a
  fighter is setting its `available: false` (every file of it kept, its
  roster slot then locked), and a new fighter is a new definition with its
  own art folder, definition module, `rosterSlot` and `available: true`
  (docs/characters/adding-characters.md).
- **Shared systems, per-fighter values.** Everything in 7.2.2 to 7.2.8 is
  one rule for every fighter. A fighter supplies only data: its art and
  clips, body, movement profile, Powers, Energy, `defense`,
  `launchReaction` (and optionally `launchBounce`), attacks, projectiles,
  summons, techniques, button map (`actions`), touch buttons
  (`mobileAbilities`) and ability names (`abilityNames`). No shared system
  reads a fighter's id or treats one fighter as the reference: where a
  value below is a fighter's, it is named as an example. A capability a
  fighter leaves out (a `defense`, a Dash, a projectile, a summon, a
  technique, an extra attack, a button) is simply absent for it.
- **Attack loadout** (`js/data/loadout.js`). A fighter's attacks go by
  universal codenames, the same for every character: the numbered attacks
  `attack1` to `attack5`, each one's mid-air version `midair_attack1` to
  `midair_attack5`, one optional `extra_attack` (a throw, a projectile, a
  utility move of its own) and the reserved `transform`. What the player
  calls a move (#0001's Jab, Red, Maximum Blue, Unlimited Void, Hollow
  Purple, High Kick) is its `abilityNames`, never its codename. The rules, checked for every
  definition as `js/data/characters.js` loads (`assertLoadout`; a
  definition that breaks one is refused, every problem named):
  - 2 to 5 numbered attacks, `attack1` and `attack2` always, numbered in a
    row from `attack1` to the highest; never a sixth. The `extra_attack`
    is outside that count.
  - Every numbered attack the fighter has is a numbered combat button of
    its own (`actions.attackN`), pressed directly. Nothing else reaches
    one: no held stance, modifier or other button. Its entry says which
    kind of move it is (`ACTION_TYPES`):
    - an ordinary attack, `{ ground: 'attackN', air: 'midair_attackN' }`:
      it always has its mid-air version, and both are real attacks with
      real clips;
    - a summon, `{ type: 'summon', id: 'attackN' }`: the detached entity
      `summons.attackN`;
    - a technique, `{ type: 'technique', id: 'attackN' }`: the multi-phase
      move `techniques.attackN` the fighter performs itself.
    A summon or technique is keyed by the button it is (`id` is always the
    button's own codename), needs its data and art, has no mid-air version
    (it is ground-only) and has its own cooldown. `attack1` and `attack2`
    are always ordinary attacks; `attack3` to `attack5` may be any of the
    three kinds. A summon or technique no button names is refused.
  - So a fighter with N numbered attacks has exactly N numbered buttons,
    `attack1` to `attackN`, whatever kind each one is: 2 → `attack1`
    `attack2`; 3 → `attack1`–`attack3`; 4 → `attack1`–`attack4`;
    5 → `attack1`–`attack5`.
  - Whatever an attack creates is named after it: a projectile
    `<attack>_object` (#0001's Red is `attack2_object`, the sphere its
    Hollow Purple releases `attack5_object`), a summon's cloud
    `<attack>_object...` effect clips, a technique's own poses
    `<attack>_...` (#0001's `attack4_cast` and `attack4_release`), and the
    files follow (3).
  For example, #0001 has five numbered attacks, all five its buttons:
  `attack1` (the Jab; `midair_attack1`, the Floating Straight), `attack2`
  (Red; `midair_attack2`, the Red Kick) and `attack3` (Maximum Blue;
  `midair_attack3`, Blue) are ordinary attacks, `attack4` (Unlimited Void)
  and `attack5` (Hollow Purple) techniques, and `extra_attack` is its High
  Kick. #0002 has three
  numbered attacks: `attack1` (the One-Two;
  `midair_attack1`, the Homing Attack), `attack2` (the Rapid Kicks;
  `midair_attack2`, the Bounce Attack) and `attack3` (the Spin Attack;
  `midair_attack3`, the Blue Tornado) are its buttons, and `extra_attack` is
  its Whirlwind. It has no `attack4` or `attack5` button.

#### 7.2.2 States, animation and facing

- **Clips and states.** Every fighter's clips are its own: Idle and Run;
  Jump while rising and Fall while descending (walking off a ledge
  included), each looped or held on its last frame as its clip says; an
  optional Land, played once on touchdown for exactly the clip's length
  and then back to idle or run (a fighter with no land clip lands straight
  into its stance; Land is a visual state only and never changes movement
  or collision, and a new jump, attack or hitstun cuts it short); Hurt and
  Mid-air Hurt for hitstun; its attacks', Shield's and Dash's clips; and
  its projectile and effect art. No invented frames. If the airborne,
  landing or hurt frames fail to load, the fighter holds the frame its
  `animationFallbacks` names (e.g. #0001's and #0002's first idle frame)
  without stretching or rotating; attacks, the Shield and the Dash never
  fall back (7.2.4, 7.2.5). Facing flips the sprite (per clip, against
  that clip's source orientation; see 3).
- **Facing.** For players it is manual: only
  the fighter's own movement (running past a small speed on the ground,
  steering in the air), a Dash and an attack started with a direction held
  turn it (the attack faces that direction as it starts, so a turn made on
  the press step, run left → press right and attack1 together, strikes right,
  never the stale way). **During an action of its own** (an attack or the
  Shield) the direction held turns it at once, left to right or right to
  left, as often as the player likes (`Fighter.updateFacing`): the hitbox,
  a step-in still to come and a projectile not yet released (e.g. #0001's
  Red) all go the new way. Turning never walks or runs. A technique faces the direction held
  on the step it starts (so #0001's Hollow Purple pressed with Left held
  sends its sphere left); from then on a stun, a paralysis, a Dash and a
  technique hold the facing. A spawn or respawn takes the spawn's `facing`, and otherwise it
  keeps its last facing. Manual players and the non-attacking training
  controller never auto-face. The combat CPU aims at its live opponent on
  attack initiation and each simulation step, including side switches during
  startup, active frames and recovery. It supplies an orientation separately
  from movement input. Motion attacks and techniques retain their physical
  direction while their artwork tracks; spawned projectiles stay on course.
  Equal horizontal coordinates keep the last valid orientation. The HUD
  portraits facing the timer (7.3) are a separate, fixed rule.
- Hitstun shows Hurt while grounded and Mid-air Hurt while airborne, switching
  to Hurt if the fighter lands still stunned; the pose also holds through the
  impact freeze. Hitstun outranks every other state (technique, bound (a
  paralysis), attack, Dash, Shield, tumble, jump, fall, land, Shield lower
  pose, run and idle), and normal states resume when it ends. The pose is
  visual only (no collider changes), but being hit is not: a hit (never a
  block) or a paralysis takes the fighter out of its own attack on its next step, so nothing of
  that attack is left to strike, release a projectile or recover from (no
  cooldown either). Checked on the fighter's next step, two attacks that
  connect on the same step still trade. A stunned fighter's push or
  launch runs down at its own `movement.hitstunFriction` on the ground and
  `hitstunAirDrag` in the air (half its deceleration and air drag when it
  declares none), whatever is held. Missing hurt art holds its fallback
  frame.
- `down` (S / ↓, D-pad or left stick down) is a
  direction only, never a stance, state or modifier: it has no animation,
  locks no movement, refills nothing and changes no attack. It does two
  things, both in the air: held while falling it is the fast fall, and held
  as a hit lands it steers the launch downward (see the fast fall, 7.2.3,
  and launch steering, 7.2.7). On the ground it does nothing at all: the fighter
  idles, runs, attacks, jumps and shields exactly as with nothing held, and
  every numbered button does the same thing whether or not Down is held. On
  a one-way platform it never drops through (the player has no
  drop-through control; see the stages above). Menus read Down from their
  own bindings, the same keys and pad directions as ever (7.4). State
  priority is
  hitstun > technique > bound > attack > Dash > Shield > tumble > jump /
  fall > land > Shield lower pose > run > idle: a hit shows Hurt at once.

#### 7.2.3 Physics, movement and Powers

- Physics: acceleration, deceleration, turn braking, max speed (from the
  fighter's Speed Power, below), air steering and drag, gravity, jump
  impulse (from its Jump Power, below), the fast fall,
  ground/platform/solid collision on a finite main floor (no side walls:
  a fighter can leave the stage and fall), landing detection; collision boxes
  independent of PNG size; bottom-centre origin; no sinking, floating or
  jitter. A collision stops the body on that axis and reports the speed it
  stopped; only a launch turns that into a rebound (Launch bounce). Pushboxes
  split an overlap evenly, so a fighter at a ledge can be shoved off it; a
  fighter flying off a rebound passes through them.
- **Movement and game feel.** Movement is immediate, smooth and precise;
  fast to respond, never simply fast. The rules are the same for every
  fighter (`js/game/fighters/movement.js`, docs/systems/movement.md); each
  fighter's `movement` profile and Powers supply the numbers, so two
  fighters move differently under the same rules. #0001's and #0002's
  values, and how they play, are in their character specifications
  (7.2.9).
  - *Ground.* From rest to top speed at `acceleration`; letting go stops
    the fighter at `deceleration` (a short, natural stop, never an
    instant one); pressing against the way it moves brakes at
    `acceleration` × `turnBoost` (never softer than letting go) until
    that way is spent, the rest of that step accelerating the new way, so
    a turn is quick but never a one-step flip. Above top speed (after a
    Dash) the excess bleeds off at `overspeedDeceleration`, whatever is
    held.
  - *Air.* The same shape with `airAcceleration`, `airTurnBoost` (its
    `turnBoost` when it declares none) and a light `airDeceleration`
    drag: steering bends the drift instead of replacing it, and a running
    jump carries its speed. Above top speed (a launch, a jump out of a
    Dash), holding the way it already moves never slows the fighter
    beyond the drag; pressing against it brakes.
  - *Jump.* Its strength is its Jump Power; it is buffered (`jumpBuffer`)
    and has coyote time (`coyoteTime`), both of which must be positive for
    the fighter to jump at all. Takeoff is on the press step, and the jump
    only sets the upward speed: the run carries straight into the air (no
    horizontal reset), so run → jump → drift is one continuous motion.
  - *Higher jump.* A tap is the normal jump. Jump still held
    `highJumpWindow` after takeoff (held from the takeoff step on: a press
    a little longer than a tap) makes it the higher jump: from that step to
    its apex it rises under a lighter share of gravity, set once so it tops
    out at `highJumpHeight` × the normal height (`Fighter.highJump`,
    `highJumpLift`). No kick in speed: the arc stretches. Decided once and
    kept whether Jump stays held or not; the apex, a hit, the air jump or
    the ground ends it. Ground jumps only (coyote time included); the air
    jump is never a higher one. A fighter with no `highJumpWindow` never
    makes one. Both CPUs let go of Jump inside the window (`jumpTapHold`):
    their jumps are normal ones.
  - *Air jump.* `airJumps` more jumps in the air (none when it declares
    none), past coyote time, at `airJumpRatio` (1 when it declares none) ×
    the normal jump's speed, always full height, the jump clip from its
    first frame. A direction held sets off that way at least at top speed
    (a change of course); with none held the drift carries on. Landing
    gives them back, and so does a hit. Not while stunned, paralysed,
    shielding or in a technique, nor in free fall; a jump pressed in the air with none
    left waits (the jump buffer) for the ground. It may cut short an attack
    that hit, like a ground jump. Quick Battle's CPU uses it to get back to
    the stage. A jump and an air jump from a stage's highest footing stay
    well clear of the upper Void.
  - *Fast fall.* Down (the `down` input: S / ↓, D-pad or stick down,
    with no mobile Down button) held in the air while already descending
    speeds the fall up toward `fastFallSpeed` at `fastFallAcceleration` on
    top of gravity: never while rising, never a jump in speed and never
    slower than the fall already is; it lands on platforms like any fall.
    A fighter whose `fastFallSpeed` is not positive has none. Aerial attacks
    may fast-fall (back to the ground after an aerial); a stun, a
    paralysis, an air Shield, a technique or an attack's own motion (a
    hover included) may not.
    `Fighter.fastFalling` is true on the steps it applies.
  Attack movement, the combat input buffer, hit-cancels and hitstop are
  combat rules (7.2.4).
- **Dash** (movement, not an attack): two press edges of the same
  horizontal direction (`runLeftPressed` / `runRightPressed`, 7.4), the second
  within `movement.dashTapWindow` (e.g. #0001's 0.22 s) of the first, start a Dash that
  way (`Fighter.trackDashTaps`, `tryDash`); the other direction replaces the
  waiting tap, both at once cancel it, and a double tap that cannot Dash is
  used up, never queued. A one-step request (`mouvementLeftPressed` /
  `mouvementRightPressed`, 7.4: one tap of the Joystick touch layout's Left
  mouvement / Right mouvement, `mouvementLeft` / `mouvementRight`) goes straight to the same `tryDash`, so every
  rule, cost and effect below applies unchanged; it is not a direction
  press (it never pairs with one), it forgets any first tap waiting, it is
  used up whether or not it Dashes, and both at once ask for nothing. A Dash needs the fighter free to act (no attack,
  stun, paralysis, technique or Dash running) or in an attack that hit
  and may be cut short (a **Dash cancel**, see Hit-cancels, 7.2.4), grounded,
  not shielding nor holding `shield` for a Shield
  that can go up, not exhausted (it pays `energy.dashCost` once as it
  starts, `dashCancelCost` for a Dash cancel, or all that is left when that
  is less, emptying the bar), a positive `movement.dashSpeed` and its real
  `mouvment` clip (played once; without it the Dash is refused and logged,
  never faked with the run). A held Shield and attacks are resolved before it on
  the same step, so either wins over it. The fighter faces the Dash at once and
  moves at `movement.dashSpeed` (the top speed itself never changes) for
  one pass of its own `mouvment` clip, ignoring input (e.g. #0001: 950
  units/s for 0.2 s, about 190 units; #0002: 1100 units/s for 0.2 s,
  about 220); afterwards the normal movement takes over from that speed,
  its excess over top speed bleeding off at
  `movement.overspeedDeceleration` whatever is held, so holding on eases
  into the run and letting go slides to a stop. No speed spike, no dead
  stop. It obeys collision: a solid stops it (the Dash ends against
  it), and leaving the ground ends it (the fighter falls on with its speed).
  Hitstun or a paralysis end it at once. While it runs the fighter cannot attack,
  shield, jump, summon, start a technique or Dash again (an attack or a jump pressed late in
  it is kept by the input buffers and comes out the step it ends: a Dash
  into a Jab, keeping at most the Jab's share of top speed, never a
  lunge; there is no attack-cancel out of a Dash). A Dash asked for during
  an impact freeze (a double tap or a one-step request) is kept and tried
  on the step the freeze ends, like the attack presses made then. It has no hitbox,
  damage, launch or invulnerability. The training CPU never dashes (its
  input never has press edges); Quick Battle's combat AI dashes only
  through the same double tap a player uses (a press, a release and a
  press within the window), and guards against double-tapping by accident.
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

  Each fighter's tiers are in its character specification (7.2.9): #0001
  has Jump Power 2 and Speed Power 2, #0002 Jump Power 2 and Speed Power 3. The tiers are the only
  sources: movement has no raw `jumpVelocity` or `maxSpeed`.
  Speed Power feeds the same normal left / right target speed on the ground
  and in the air (and the run clip's playback rate, relative to the
  fighter's own top speed; an attack's steering and the speed it may keep on
  the ground are shares of that top speed); acceleration, deceleration, the
  turn boosts, the overspeed bleed, air control and drag, gravity, fall
  speed, the fast fall, coyote time, the jump and attack buffers, hitstun
  friction, launches, projectiles (e.g. #0001's Red at its own 600) and
  techniques, pulls and the Shield never depend on it, just as none of them depend
  on Jump Power. The shared
  Fighter applies both for Player 1, the CPU and Practice Ground alike. A
  declared tier the table lacks (or a fighter missing a Power) is logged and
  gets tier 2.

#### 7.2.4 Combat

- **Attacks** are data on the character (`attacks`, keyed by move
  codename; the schema is `createAttackDefinition` in
  `js/game/combat/attacks.js`), turned once into frozen definitions: an
  `animation` (real frames are required: an attack without them is refused,
  never faked), phases (`startup`, `active`, `recovery`, timed to whole
  frames of the clip so the hitbox is live only while the strike is on
  screen), a `hitbox` facing right from the fighter's origin (bottom-centre,
  mirrored with facing, live only in the active phase, at most one hit per
  attack), its `damage`, `baseLaunch` and `directionalLaunch` (7.2.7),
  `hitstun`, `blockstun`, `hitstop` and a short `cooldown`, `groundOnly`,
  and how it moves and combos (below). An airborne version that lands
  finishes what is left of its own clip (never restarted) instead of
  switching to the ground version or Land. A projectile attack has
  `hitbox: null` and a `projectile` release instead (below). A *pending*
  attack (`pending: true`) is art only: one pass of its clip, no hit, and
  declaring combat fields on one is refused.
  - *Attack movement.* Normal locomotion is off while an attack plays, but
    that is not the same as standing still: an attack keeps a share of the
    horizontal speed it started with (`momentum` on the ground, never more
    than that share of top speed; `airMomentum` in the air), may be
    steered with a share of the normal acceleration and top speed
    (`control`, `airControl`), lets the rest of its speed run down under
    `friction` × the ground deceleration (the air drag in the air), and may
    move by itself (`step: { at, speed }`: forward speed raised to at
    least `speed` as its time crosses `at`, on the ground). Defaults
    (`momentum` 1, `control` 0, `friction` 1, no step) are a planted
    attack; `lockMovement: false` keeps full locomotion. A technique holds
    its fighter still instead and a clone never moves: neither reads these.
  - *Combat input buffer.* An ordinary attack press the fighter cannot act
    on yet (an attack or its recovery, a stun, a Dash, a cooldown, `shield`
    held for its Shield) is kept for `movement.attackBuffer` and comes out
    on the first step it can, if it still maps to an attack that can start
    there (on the ground or in the air as the fighter is then). The latest
    such press wins; one older than the buffer never fires. Presses made
    during an impact freeze are kept and do not age through it. Only
    ordinary attacks: a summon or technique happens on its own press or not
    at all (one pressed while it cools down, in the air or while the
    fighter is busy is simply gone), and a reserved button, a ground-only
    attack pressed in the air or an attack without art is never kept. Kept
    presses keep their order with a buffered jump: a jump pressed before
    the attack goes first and the attack comes out next step, in the air;
    pressed on the same step, the ground attack goes first. A fighter with
    no positive `attackBuffer` keeps nothing.
  - *Hit-cancels.* An attack that hits (a Shield's block does not count)
    may be cut short once its time reaches its `hitCancel` (seconds in, or
    null for never; the step its freeze ends at the earliest), by another
    attack, a jump or, on the ground, a Dash (a **Dash cancel**, for
    `energy.dashCancelCost`): walking, the Shield, summons and techniques
    still wait for its end, and left alone it plays out in full. A Dash
    asked for during the hit's freeze comes out the step it ends. It cuts
    into itself only once its own cooldown has run since it became
    cancellable. The cut attack's cooldown starts as it is cut. A whiff or
    a block keeps the whole recovery (and never Dash-cancels), so
    commitment is unchanged where it matters. Which attacks open a
    follow-up, and the combo routes they make, are each fighter's own
    (7.2.9). No route loops: every hit adds to the Launch Point that sends
    the next one further, a Dash chase spends the Energy the Shield needs,
    and a wall's rebounds are capped until the target recovers (7.2.7).
  - *Hitstop.* Per hit, its own `hitstop`; a hard rebound off the stage
    freezes its fighter alone for `LAUNCH_BOUNCE.hitstop`. It freezes the
    fighters, never the controls: presses made during it are kept, and a
    frozen fighter is drawn still where it stopped. A detached hit (a
    projectile's, a clone's, a technique's) freezes only its target.
- **Projectiles** (`projectiles` on the character, `<attack>_object`,
  named after the attack that throws it; runtime in
  `js/game/combat/projectile.js`) are independent battle entities, not a
  fighter hitbox: each has its own position (interpolated between fixed
  steps like the fighters), velocity, animation clock, hitbox, combat data
  and lifetime, all from character data. The attack releases exactly one,
  once, as its time crosses the release's `spawnAt`, from its `offset`
  (facing right, mirrored), aimed where the fighter faces then; a hit
  before that point throws nothing, and its direction never changes
  afterwards, whoever turns, jumps, shields or is hit. Its speed never
  depends on its art. It hits through the same `CombatSystem.applyHit` as
  melee, with its own direction in place of the attacker's facing, credits
  its thrower and freezes only its target; it never hits its thrower. By
  default it strikes once and is gone (a Shield blocks it and it is used
  up), and it also disappears at the end of its `lifetime`, in the Void or
  against a solid block (the main stage's own cliff face included);
  one-way platforms and the open air past a ledge do not stop it. A
  piercing one strikes again and an erasing one flies on through (below).
  The Battle owns live projectiles: each fixed step it updates the
  fighters, spawns released projectiles (once each), moves them, lets them
  meet each other (`clashProjectiles`, below), applies the pulls of
  attacks and projectiles (`applyPulls`), resolves hits, then removes
  spent ones. They are
  drawn on the battle canvas over the fighters, centred on their position
  with image smoothing off, and cleared on restart. Missing projectile art
  refuses the attack that throws it (logged): never an invisible
  projectile.
- **Attack mechanics beyond a timed hitbox** (`js/game/combat/attacks.js`,
  `js/game/combat/combat.js`, `js/game/fighters/fighter.js`,
  `js/game/combat/projectile.js`, `js/game/combat/pull.js`,
  `js/game/combat/hit-effects.js`). Each is data on an attack (or a
  projectile), generic, and validated as its definition is built; any
  fighter may use them (#0001 and #0002 use them between them today):
  - **Strikes** (`hits`): a multi-hit attack lists its strikes, each live
    in its own window (`at` to `at + active`) and striking at most once,
    with its own `damage`, `baseLaunch` and `directionalLaunch`; its
    `hitbox`, `hitstun`, `blockstun`, `hitstop` and `carry` default to the
    attack's. The attack's startup and active phase follow from them
    (declaring either, or an attack-level damage or launch, is refused), and
    so do its overall box (round every strike's), damage (their sum) and
    launch (the last strike's), for readers such as the CPU. Any real hit
    confirms it (its hit-cancel counts from the first); a Shield that blocks
    a strike stops the string there, so a flurry never empties a Shield.
  - **Carry** (`carry: { lift }`, on an attack, a strike or a projectile): a
    real hit that launches nothing gives its target the velocity of what
    struck it (the attacker's body, or the projectile), less `lift` upward.
  - **Motion** (`motion`, one of five kinds; a motion attack never changes physical facing for a visual turn
    while it plays): `hover` stands on the air for the whole attack (no
    fall, its drift steered as its `airMomentum` and `airControl` allow);
    `homing` hangs through its startup (no gravity), then
    locks on to its opponent if in play, within `range` of its middle and
    not behind it, and dashes at `speed`, re-aimed at the target's middle
    every step, until its active phase ends (straight ahead with no target);
    contact (hit or block) springs it off the target, `rebound` up and
    `recoil` back; a dash that ends without contact keeps `exit` of its
    velocity, and one that reaches the ground stops. `bounce` hangs, then
    plunges at a fixed `fallSpeed`; meeting the ground or an opponent sends
    it back up at `rebound` and ends the attack (a ground bounce is no
    landing). `rise` hangs, then rises at `speed` for its active phase and
    carries on up under gravity. `roll` curls through its startup (sliding
    on), then rolls the way it faces at `speed` plus `keep` × the running
    speed it had, up to `maxSpeed`, losing `friction` per second on the
    ground (none in the air); a wall stops it, and a Shield that blocks it
    stops it dead and sends it back at `recoil`. No motion attack starts
    while its fighter is still flying from a launch (`Fighter.launch`): a
    hang, hover, dash, plunge or lift would cancel the launch, so it must
    recover first (an air jump, a fast fall or landing).
  - **Pull** (`pull: { radius, speed, offset }` on an attack, `{ radius,
    speed }` on a projectile): every step an attack's active phase is open
    (or a projectile flies), each opponent whose middle is within `radius`
    of its point (the attack's `offset`, facing right and mirrored; the
    projectile's centre) is moved straight toward it at up to `speed`,
    never past it: a grounded fighter along the ground (lifted only toward
    a point above its head), an airborne one along both axes. A raised
    Shield, a paralysed fighter, the owner and a fighter out of play are
    never drawn. The strike then meets whoever was drawn into it; the CPU
    reads a pulling attack's reach as its box widened to the pull's circle.
  - **Hit effects** (on any hit: an attack, a strike, a projectile, a
    finisher, a technique's burst): `unblockable` (a raised Shield takes it
    in full, Launch Point, launch and stun, and pays nothing); `paralyze`
    (seconds a real hit holds its target in place, `CombatState.paralyze`:
    it cannot act, its sideways speed is held at 0, it shows its hurt pose,
    the longer of two holds wins, it runs down like hitstun and never
    during an impact freeze, and any hit that launches the target ends it
    at once); `blockPush` (a Shield that blocks the hit is shoved along the
    hit's direction at that speed). Each defaults to changing nothing, and
    a value of the wrong kind is refused.
  - **Per airtime** (`airUses`): how many times the attack may start before
    the fighter lands or is hit. **Free fall** (`freeFall: true`): started
    in the air, it leaves the fighter with no attack and no air jump until
    it lands or is hit.
  - **Body** (`passThrough: true`): no pushbox against other fighters while
    it plays. (`hurtboxes`): the fighter's own replaced while it plays.
  - **Piercing projectiles** (`pierce: { hits, interval }`): strike up to
    `hits` times, at least `interval` seconds apart, staying in play between
    them; the last resolves as the projectile's `finisher` (its own damage
    and launch, its stuns and hit effects defaulting to the projectile's).
    A block stops it.
  - **Projectiles that act on each other** (`clashProjectiles`): `repel:
    true` turns another fighter's projectile it meets back the way it
    flies, that projectile its owner's from then on (as if thrown by it, its
    strikes starting over); `erase: true` makes another fighter's
    projectile it meets disappear, and it flies on through every fighter it
    strikes, each once. When two of different owners meet, erasing beats
    repelling beats neither; two of the same rank that act both go, and two
    that do neither pass each other by.
  - The CPU reads all of it from the data: each attack's reach swept along
    its motion (`attackReach`: a roll's path, a plunge's depth, a lift's
    height, a homing dash's lock-on range) for choosing and fearing it, the
    travel time before a moving strike can arrive, per-airtime starts and
    free fall; it uses a lift (a `rise` air attack) to recover when its air
    jump is spent, fast-falling first to end a launch, and never plans a
    summon or technique for a fighter with none.
- **Combat architecture** (Launch Point, Base Launch, Directional Launch,
  damage, hitboxes, hurtboxes, attack definitions, the Shield button's
  `defense` (typed, the Shield so far), Energy, launches, stun and
  blockstun, hitstop, cooldowns, summon and technique cooldowns,
  paralysis, pulls, typed numbered buttons, summons and techniques) is data-driven: every
  fighter's moves are implemented through it with real artwork (7.2.9),
  Transform stays reserved (mapped to no attack) until real sprites exist,
  and no attack, projectile, clone or frame is ever fabricated. An attack
  whose frames fail to load is refused (no substitute pose, no invisible
  hitbox), and so is a Shield, a summon whose startup pose, cloud or
  attack art is missing (no pose, no cooldown starts), and a technique
  with any of its clips missing.

#### 7.2.5 Defense and Energy

- `shield` is the shared player action, the Shield button (keyboard L,
  gamepad RB / RT, the touch **Shield** button). What it does, how a
  fighter defends, is character data (`defense` in
  each character's definition, frozen by `createDefenseDefinition` in
  `js/game/combat/defense.js`), not part of
  the input system. The one defense type is the Shield, `{ type: 'shield',
  groundAnimation, airAnimation, groundStartAnimation,
  groundReleaseAnimation }`; the type is checked, so a future fighter can
  defend another way, and an unknown type is an error. A fighter with no
  `defense` does nothing on the button. #0001 and #0002 both use the
  Shield (#0001's, Infinity, stalls the blows it blocks; #0002's is on the
  ground only). There is no
  Dodge (no invulnerability, evasive frames or one-press defensive move)
  and no chip-damage Block anywhere in the engine.
- The **Shield** is a held state, `CombatState.shielding`: up while
  `shield` is held and the Shield is allowed, down the step it is let go.
  Allowed means: the fighter is free to act (no attack, stun, paralysis,
  technique or Dash; the Shield never cuts one short, and comes up the step
  it ends if `shield` is still held), it is not exhausted
  (`CombatState.canShield`: any Energy left is enough) and the held art
  for where it is. It is decided before the
  combat intents: while `shield` is held with a Shield that can go up, no
  attack, summon, technique, Dash or jump starts (let go of `shield`
  first: an attack or a jump pressed meanwhile is buffered and comes out
  the step the Shield is let go, if that is soon enough; a summon or
  technique pressed meanwhile is not kept). On the ground it shows its
  optional `groundStartAnimation` for one pass as it goes up, then
  `groundAnimation` (#0001's `shielding`) for as long as it is held;
  lowered on the ground, the optional `groundReleaseAnimation` shows for
  one pass (the `shieldRelease` state) while nothing of higher priority
  takes over (visual only: movement resumes at once). Neither #0001 nor
  #0002 has a raise or lower pose. In the air there is only `airAnimation`
  (#0001's `midair_shielding`), the held pose: no raise or lower pose, and a Shield
  lowered in the air goes straight back to Jump / Fall; a Shield with no
  `airAnimation` (#0002's) simply cannot go up in the air. Landing with it up keeps the held pose (no raise
  pose, no Land). While it is up horizontal input moves nothing (on the
  ground no walking, running or Dash, the current velocity slowing under
  the normal deceleration; in the air momentum carries on under the normal
  air drag with no steering), though the direction held turns the fighter.
  In the air it **slows the fall**: a faster fall (a fast fall included)
  brakes toward `defense.slowFallSpeed` (#0001: 90 units / s) at
  `slowFallBrake` (#0001: 6000 / s², so about 0.22 s from its fast fall's 1400), and
  gravity never takes it past that while the Shield stays up; a rise is
  untouched (`stepBody`'s fall cap, from `Fighter.update`). A Shield without
  `slowFallSpeed` (0) falls as ever. A
  missing held clip refuses the Shield (logged once per clip); missing
  raise or lower poses are simply skipped.
- **Blocking.** The Shield is a full circle: while it is up, any hit that
  reaches the fighter's own hurtboxes (the same `CombatSystem` overlap as
  any hit, never a bigger circle) is blocked, whichever side it comes from:
  melee, projectiles, clone attacks and a technique's burst alike, unless
  the hit is `unblockable` (7.2.4: it lands in full, and the Shield pays
  nothing). A blocked hit adds no Launch Point and launches nothing (launch
  strength 0, final launch zero, whatever its Base Launch and direction),
  shows no hurt pose, deals no hitstun and paralyzes nothing; the hitbox
  is used up exactly as by a hit (an attack's `hasHit`, a projectile gone,
  a clone's `hasHit`). A hit with `blockPush` still shoves the Shield
  along its direction. The fighter pays `energy.shieldHitCost` (25 by default) for
  it, once, in `CombatSystem.applyHit`, or all it has left when that is
  less, and the event is a `'block'` with that `energyCost`. The hit's hitstop still freezes both sides as usual, and
  its `blockstun` becomes `CombatState.shieldStun`: the Shield is held up
  through it even if `shield` is let go, and the fighter cannot act until it
  is over. A block that empties the bar (with `shieldHitCost` or less left) exhausts the
  fighter and drops the Shield at once, clearing the blockstun. That block
  itself stands, never turned into a hit
  after the fact, but any later hit, even on the same step, lands in full.
  Holding the Shield costs nothing, and a miss costs nothing: only a
  confirmed block is paid for.
- **Stall.** A Shield with `defense.stall` (seconds; #0001's Infinity:
  0.25) freezes the attacker of a melee blow it blocks for at least that
  long (the hit's own hitstop when that is longer), time for the defender
  to let go and punish; the event carries it as `stall`. A detached hit (a
  projectile's, a clone's, a technique's) stalls nothing. 0 (the default)
  is none.
- **Perfect Shield.** A hit that lands within `defense.perfectWindow`
  (#0001's and #0002's: 0.1 s) of the Shield going up is a perfect block (`Fighter.perfectShield`,
  the event's `perfect`): it costs no Energy and deals no blockstun, so the
  fighter can let go and answer at once, while the attacker, whose attack
  was blocked, still has its whole recovery (no hit-cancel). The hit's
  hitstop still freezes both. Only a raise after the Shield has been down
  for `perfectRearm` (#0001's and #0002's: 0.25 s) has that window, so tapping `shield` over and
  over never keeps one open; held up longer, or raised again too soon, a
  block is an ordinary one. It is drawn as a white ring bursting from the
  block (see Hit effects, 7.3). Quick Battle's CPU pulls one off only as
  often as its level earns it: a raise that close to contact succeeds with
  a chance of its `guard` trait to the fourth power (Brutal often, Easy almost never),
  and otherwise it takes the hit.
- The Shield's look (`js/game/rendering/shield-fx.js`): a wavy circle round the
  fighter, drawn procedurally on the battle canvas (no PNG), kin to the
  Void: a barely-there black interior (`rgba(0, 0, 0, 0.16)`) drawn behind
  the fighter's sprite, then in front of it a black wavy rim (3.5 CSS px)
  with a thin red line (`#d21f2b`, 1.25 CSS px) on its outer side, both on
  the same waves: the red is traced (1.125 CSS px) further out than the
  black, so it covers the black's outermost 1.25 px, flush with its outer
  edge. From the fighter outward it reads interior, black boundary, red
  edge; there is never a red ring inside the black. Its centre is the
  fighter's body middle (half the character's `visual.height` over the
  interpolated feet) and its mean
  radius 0.62 × that height (≈66 units for #0001), so it surrounds head and
  feet whatever frame is on screen. The perimeter leans in and out by at
  most 10 % of the radius (`SHIELD_SHAPE.amp` 0.1), a sum of two
  whole-number sine waves round the circle (so it always closes and its
  mean radius never changes: it wavers like the Void's edge, never pulses)
  drifting slowly on the Arena's effects clock, traced at 96 points so the
  curve stays smooth; with reduced motion it holds a still, wavy shape. It is drawn only while the Shield is up, under
  the Void, name tags and status, and never used by collision. The debug
  overlay labels a shielding fighter `shield`; its hurtboxes are drawn as
  usual.
- **Energy** (`CombatState.energy`, `maxEnergy`, `energyExhausted`;
  settings from the character's `energy` entry through `resolveEnergy`
  in `js/game/combat/combat-state.js`, every field optional: `max` 100,
  `regen` 12 / s, `dashCost` 15, `shieldHitCost` 25, and `dashCancelCost`
  the fighter's own `dashCost` when it declares none; #0001 declares 35,
  #0002 40) is the one resource a fighter spends, and only on a Dash (as it
  starts: `dashCost`, or `dashCancelCost` for a Dash that cuts short an
  attack that hit, which is the fighter's `dashCost` when it declares none)
  and on the Shield (for each hit it blocks). Either works whenever the fighter is not
  exhausted, however little is left: a cost larger than what remains is
  paid by taking all of it (`CombatState.spendEnergy`), never going below
  0. Every fighter starts full, and every
  change goes through `setEnergy`, clamped to [0, max]. It refills by
  itself at `regen` on every step no Dash was paid for (idle, moving,
  airborne, attacking, shielding, stunned or frozen; `updateEnergy`), at
  that one rate whatever is held. Reaching 0 (a Dash or a block alike, an overspend included)
  exhausts the fighter: Dash and Shield stay unavailable however much has
  refilled (1, 25, 50, 75, 99) until Energy is back at exactly max, which
  clears it. Energy never gates movement,
  jumps, attacks, projectiles, summons or techniques, and none of them spend it. A respawn and a restart start it full.

#### 7.2.6 Summons and techniques

- **Summons and techniques** are numbered buttons of their own (see the
  attack loadout above), dispatched by type, not a summon shortcut. A
  button whose `actions` entry is `{ type: 'summon', id }` sends out the
  entry `id` in `summons` (a detached temporary entity), and one whose entry
  is `{ type: 'technique', id }` starts the entry `id` in `techniques` (a
  sequence the fighter performs itself). For example, #0001 has
  `attack4: { type: 'technique', id: 'attack4' }` (Unlimited Void) and
  `attack5: { type: 'technique', id: 'attack5' }` (Hollow Purple); no
  fighter in the roster has a summon today (the loadout tests' Case D
  does).
  `Fighter.tryAction` sends either to `Fighter.trySpecial`, which dispatches
  on the type (`trySummon` / `tryTechnique`). The rule is shared: the
  button's own new press, on the ground, with the fighter free to act (no
  attack, stun, paralysis, technique, Dash or held Shield; one never cuts
  an attack short) and its cooldown over. Anything else, an airborne press, a
  busy fighter, a cooldown still running, no opponent for a summon, missing
  art or invalid data, makes the press do nothing at all: never an
  ordinary attack in its place, never kept for later (the combat
  input buffer below keeps ordinary attacks only), never an invisible move.
  Holding the button does not repeat it, and neither Down nor any other
  input changes what it does. Each has its own cooldown instead of any
  cost: the summon's or technique's `cooldown` (e.g. 14 s for #0001's
  Unlimited Void, 12 s for its Hollow Purple),
  kept per ability in `CombatState.abilityCooldowns` (a `CooldownTimers`:
  `{ remaining, duration }` per id, apart from ordinary attacks' short
  recovery cooldowns in `CombatState.cooldowns`), started the moment the
  move is accepted (a summon's startup included) and recovering at 1 s per
  second, whatever the fighter does (impact freezes included), never below
  0. Neither spends Energy. The summon system never depends on technique
  code, nor the technique runtime on the summon system.
- **Summons** (`summons` on the character; runtime in
  `js/game/combat/summon.js`). The one kind of summon so far is a clone of
  its owner: a temporary attack entity, not a fighter, drawn with the
  owner's real art and performing one of the owner's own `attacks` once,
  with that attack's own resolved definition. A summon names that
  `attack`, the `cloud` effect it appears and vanishes through (an
  `effectAnimations` entry named after it, `<attack>_object`), its
  `cooldown`, how far behind the target it appears (`behindDistance`), the
  cloud's `effectOffset`, an optional `noGround: { attack, offset }`
  fallback and an optional `startupAnimation`.
  - *Startup.* With a `startupAnimation`, the accepted press puts the
    owner into its own summoning pose (`Fighter.pendingSummon`, visual
    state `summon`, between `bound` and `attack` in priority): it plays
    once from the press step, the owner standing still (speed 0), keeping
    its facing and unable to do anything else; the summon is queued the
    step after its last frame, and the owner is free on that step. A hit
    (its hurt pose on the hit's own step), lost ground, the Void taking it
    or its target, a reset or respawn, a Practice Ground fighter or CPU
    change or the arena going cut it short: no clone, never another target,
    the cooldown (started on acceptance) running on. Without one the
    summon is sent out on the press and the owner is free at once.
  - *Placement.* The clone appears on the target's back side
    (`x = target.x − target.facing × behindDistance`, never clamped: there
    are no side walls), at the target's foot height, if something the
    clone's collider (its owner's) would stand on lies there; otherwise,
    with a `noGround` fallback, at that `offset` from the target's origin
    (mirrored with facing) performing the fallback's attack; without one it
    always appears behind. It faces the way the target faced at the summon.
    Position, facing and attack are chosen once, and it never moves, turns,
    falls, retargets or re-checks the ground after that, so a target who
    moves away makes it whiff.
  - *Lifecycle.* APPEAR plays the cloud forwards once (no hitbox), the
    clone's first attack frame showing beneath its last frame; ATTACK plays
    the attack once from frame 1 with the owner's sprites and the attack's
    own phases, its hitbox live only in the active phase, hitting at most
    once; VANISH removes the body and plays the same cloud backwards once;
    then it is removed. Its hit resolves from its own position and facing
    through the shared `CombatSystem.applyHit`, credits the owner (the
    event names the clone as its `summon`), inherits the attack's damage,
    Base Launch and Directional Launch (a horizontal launch travels along
    the clone's facing), and freezes the target and the clone, never the
    owner. A Shield blocks it like any hit. Once sent out it finishes
    whatever its owner does next.
  - *Not a fighter.* No Launch Point, controller, pushbox, hurtboxes,
    physics or gravity, camera or HUD presence: it cannot be hit and
    nothing collides with it. Clones are drawn behind both fighters; the
    Battle owns them (each fixed step it advances live clones, spawns the
    ones summoned that step on cloud frame 1, resolves their hits and drops
    finished ones), and restart, rematch and leaving the battle clear them.
  - Before the cooldown starts the summon checks that its startup pose and
    cloud have real frames, that its attacks are defined with a hitbox and
    real frames, and that there is an opponent in play: anything missing
    logs a warning, starts no cooldown and summons nothing. No fighter in
    the roster summons today; the rules above stand for the next one.
- **Techniques** (`techniques` on the character; runtime in
  `js/game/combat/technique.js`) are multi-phase moves the fighter itself
  performs: not an attack (no `combat.attack`), a projectile or a summon.
  The runtime implements one form of technique, the **cast**: the fighter
  stands committed to a casting pose, then lets go of what it casts all at
  once. Explicit phases, never inferred from animation frames: *cast*
  (`castAnimation`, played once from the press step; the fighter stands
  still in the facing snapshotted at the start, the direction held on the
  press step if any, and can do nothing else), *release* (on its first
  step the technique releases, exactly once: its `projectile`, an entry of
  the character's `projectiles` sent the snapshotted way from its
  `offset`, exactly as an attack throws one, and its `burst`, whose `hit`
  is dealt once to every opponent its `hitbox` meets, facing right from
  the fighter's origin and mirrored, so a box round the fighter reaches
  both sides; then `releaseAnimation` plays once, the fighter still
  committed) and *done* (the fighter is free). A technique releases a
  projectile, a burst or both. Its burst's hit resolves through the shared
  `CombatSystem.applyHit` with its own damage, launch and hit effects,
  freezing only its targets; what it throws is a projectile like any
  other. It needs real ground from its first cast frame to its last
  (ground lost ends it at once, nothing released if it was still casting,
  and the fighter falls), and a hit on the fighter ends it (no armour):
  whatever it had not released yet never is, while what it already let go
  stays (the projectile flies on, the burst has landed). Its cooldown
  runs from its start whatever happens. Every clip, the projectile's art
  and valid data are required before it starts (`techniqueProblem`):
  anything missing logs a warning and the press does nothing. #0001's
  Unlimited Void (a burst) and Hollow Purple (a projectile) are casts
  (docs/characters/0001.md); a technique of another shape would be a new
  form in the runtime, not a new reading of these fields. The CPU reads a
  technique's lead (its cast), where it lands (its burst's box, its
  projectile's path) and its hit, both to use it and to answer one being
  cast at it (stepping out, striking first to break it, or a Shield, never
  against a hit no Shield stops).

#### 7.2.7 Launch

- Every fighter's central combat number is its **Launch Point**
  (`CombatState.launchPoint`): it starts at 0 (a new fighter, a Quick
  Battle restart / rematch, a new Practice fighter and every respawn after
  the Void all start from 0), grows by exactly the damage received, never
  goes below 0, has no maximum and is shown as a bare number (no % sign). A
  hit's `damage` is how much it adds (a hit a Shield blocks adds nothing);
  each fighter's hits are listed in its character specification (7.2.9).
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
  0, 1200, 2400 and 3600); at 37, 0, 37, 74 and 111. A hit a Shield
  blocks is the one exception: it adds no Launch Point and launches
  nothing at all (launch strength 0), whatever its Base Launch and
  direction; there is no chip damage and no partial launch. A hit that
  launches replaces the target's sideways speed (a
  vertical one sends it straight up or down) and, when it has one, its
  vertical speed; a hit that does not launch (Base Launch 0, no direction,
  or blocked) leaves the target's velocity alone. The target may bend a
  launch's direction by up to its `steerAngle` with the direction it holds
  (launch steering, see Launch reaction below), never its speed. Its
  event carries `damage`, `launchPointBefore`, `launchPointAfter`,
  `baseLaunch` (the integer), `directionalLaunch`, `launchStrength`,
  `finalLaunch` (the world-space `{ x, y }` velocity given, steered),
  `launchSpeed` (its length), `hitstun` (the stun dealt, launch stun
  included), `perfect` (a perfect block), `point` (where the hit landed,
  for its effects) and `energyCost` (the Shield's cost on a block, 0 on a
  hit or a perfect block). Launch Point
  never disables a fighter (`canAct()` never reads it) and never takes one
  out: only the Void does. On time-up in Quick Battle, level on points, the
  fighter with the lower Launch Point wins (a fighter still waiting to
  respawn counts the Launch Point it fell with); equal is a draw.
- **Launch** (`js/data/launch.js`): how a hit sends its target flying. It is
  not a Power: every hit (an attack's, a projectile's, a
  technique's) declares its own `baseLaunch` and `directionalLaunch` beside
  its `damage`, independently of each other:
  `damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal'`,
  `damage: 5, baseLaunch: 2, directionalLaunch: 'vertical'`, or
  `damage: 5, baseLaunch: 2, directionalLaunch: 'reverseVertical'` to drive
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
  or the other field. Each fighter's hits (damage, Base Launch and
  Directional Launch) are tabled in its character specification (7.2.9).
  Launch never depends on either fighter's Jump or Speed Power.
- **Launch reaction** (the character's `launchReaction`, resolved by
  `resolveLaunchReaction` in `js/game/combat/combat.js`; every field optional,
  the defaults change nothing; the values below are #0001's and #0002's). None of it changes a launch's strength.
  - *Launch stun.* A launching hit stuns for its own `hitstun` plus
    `stunPerThousand` (0.2 s for #0001) per 1000 units / s of launch
    speed, never more than `maxStun` (0.7 s) extra: a big hit at a high
    Launch Point is a clear moment to chase. (#0001's High Kick at 56
    Launch Point, 1200 units / s, stuns 0.3 + 0.24 s.) The event's `hitstun` is the total.
  - *Tumble.* Launched at `tumbleSpeed` (1100 units / s) or faster, the
    fighter tumbles (`Fighter.tumbling`, the `tumble` state, drawn with
    `midair_hurt`): through the stun and on past it, until it acts (an
    attack, a jump or air jump, the Shield, a fast fall) or lands.
    Steering alone does not end it. A slower launch ends a tumble; a hit
    that launches nothing leaves it.
  - *Launch steering.* The direction the target holds as a hit lands
    (Left / Right, Jump up, Down down) bends the launch toward it by up
    to `steerAngle` (15 degrees): only the part of it across the launch
    counts (the sine of the angle between them), so holding along a launch
    or against it bends nothing, and the speed never changes. Standing on
    the ground, Down bends nothing (the floor is in the way). It is the
    defender's skill: surviving a launch, or slipping out of a follow-up.
    `finalLaunch` is the steered velocity; with nothing held it is the
    formula exactly.
  - A hit (never a block) also gives the target its air jump back, so a
    launch never strands it without one.
- **Launch bounce** (`js/game/combat/launch-bounce.js`: every fighter's
  `LAUNCH_BOUNCE` settings, which a character may override with its own
  `launchBounce`, `enabled: false` included; #0001 and #0002 override none). A launch
  that drives its fighter hard into stage geometry rebounds off it instead
  of stopping dead, and may ricochet on to the next surface. It is not part
  of a launch's strength: Launch Point, Base Launch and Directional Launch
  resolve exactly as below, and only the velocity the launch leaves the
  fighter with can rebound, so the Launch Point decides it by itself: a
  weak launch never bounces, a harder one rebounds, a huge one can ricochet
  from surface to surface or on into the Void.
  - *Physics stays generic.* `stepBody` still stops a body at whatever it
    meets (a solid's side zeroes `vx`, a landing or a ceiling `vy`) and never
    bounces anything or knows why the body moves. It reports the speed each
    contact stopped, just before zeroing it (`impactVx`, `impactVy`; the
    contact is `wall`, `landed` or `bonked`, its normal (−wall, 0), (0, −1)
    or (0, 1)). After the fighter's step, `bounceLaunch` decides whether that
    stop was a launch's impact and turns it back into a rebound.
  - *Only a launch.* A launching hit starts a launch sequence
    (`Fighter.launch`, from `Fighter.takeHit`): which way the launch carries
    the fighter on each axis, and how many times it has rebounded. It lasts
    until the fighter is back in ordinary play: on the ground with its stun
    over, acting again once free (an attack, a jump or air jump, the Shield,
    a fast fall, a technique) or bound. A hit that launches nothing leaves it
    as it is. So walking or running into a wall, jumping into a ceiling and
    landing stay ordinary stops. A surface also rebounds a fighter only if
    the launch, or its latest rebound, is carrying it into that surface:
    falling back down after an upward or sideways launch is an ordinary
    landing (gravity alone never bounces anyone), while a spike drives into
    the floor and a rebound off a ceiling drives back down to it.
  - *Threshold.* A contact rebounds when the speed it stopped into the
    surface is at least `minImpactSpeed` (500 units / s). Only what crosses
    the surface counts, so a glancing contact never rebounds hard. Slower, it
    is an ordinary stop, and that surface spends the launch on that axis.
    For example, #0001's Jab rebounds its target off a wall right behind
    it from about 50 Launch Point, its Red Kick from about 25; the body's
    `maxFallSpeed` (1500) still caps a downward launch.
  - *Rebound.* The stopped speed comes back reversed and scaled by the
    surface's restitution: a solid's side (`wallRestitution` 0.72), a floor
    (the main floor's top, a solid's top, a one-way platform's top:
    `floorRestitution` 0.6) or a solid's underside (`ceilingRestitution`
    0.65). What ran along the surface is kept, so a diagonal impact
    ricochets instead of reversing (into a wall at vx 800, vy 300, it leaves
    at about vx −576, vy 300). A corner, a side and a floor or ceiling met on
    one step, rebounds on both axes, once each, as one rebound. The body is
    left at the surface it struck, never inside it. A floor rebound is no
    landing: the fighter is airborne at once, with no Land pose and no air
    jump back. Every rebound is weaker than its impact, so a ricochet always
    dies away: a spike rebounds once and then lands, and a hard sideways
    launch between two walls ricochets wall to wall two or three times.
    Deterministic: no randomness, fixed steps only.
  - *Where.* Solids (the Desert's rock outcrops, the City's bulkhead) and the
    main floor's own cliff faces below its top are geometry. One-way
    platforms are geometry only from above: a launch up through one passes as
    ever, and a spike onto one's top rebounds off it. There are no side
    walls, and the Void is not geometry: a launch past a ledge flies on into
    it, and nothing rebounds off its edge.
  - *Stun and freeze.* A rebound leaves the fighter at least `stun` (0.2 s)
    of hitstun, so it never gets control back while it flies off the surface
    (a longer stun of its own runs on). A rebound at least `hitstopSpeed`
    (1200 units / s) into the surface first freezes the fighter where it
    struck for `hitstop` (0.05 s, two steps): fly, impact, pause, rebound.
    Softer ones never freeze.
  - *Hit again.* A rebounding fighter is a target like any other. A new
    launch replaces its velocity (the usual launch rules) and its heading,
    but the sequence's rebounds count on until the fighter has recovered:
    past `maxBounces` (5) every surface is an ordinary stop for it. A
    fighter flying off a rebound (`Fighter.ricocheting`) also passes through
    the other fighter's pushbox (`separateFighters`), so a rebound carries
    it past the attacker instead of pinning it in reach. Together they keep
    a wall from holding a combo forever (hit, rebound back into reach, hit
    again...): punching a battered opponent into a wall over and over ends
    within about six hits.
  - A Shield's block launches nothing, so it never rebounds, and neither
    does any hit with Base Launch 0 (such as Maximum Blue's grinding
    strikes). A clone's hit, a projectile's and a technique's launch through
    the same `CombatSystem.applyHit` and rebound like any launch (#0001's
    Hollow Purple driving its target into a rock outcrop ricochets it back
    across the mesa).

#### 7.2.8 Matches and the combat AI

- Quick Battle: 5 minutes (`CONFIG.battle.roundSeconds`, 300 seconds),
  first to `CONFIG.battle.pointsToWin` (3) points, against a CPU that uses the same fighter definition and fights with
  it at the difficulty chosen on Select Difficulty (6.3a): Quick Battle's
  combat AI, `CombatAIController` (`js/game/ai/combat-ai.js`). `BattleScreen`
  passes `app.selection.difficulty` to `Battle`, which validates it once
  (`resolveDifficulty`: anything unknown is Medium), keeps it for the whole
  battle (restart, rematch and every respawn keep it; a restart also clears
  the controller's plans) and builds the CPU's controller with it and a
  seeded `mulberry32` RNG.
- Watch Mode (6.5a): the same `Battle` with `mode: 'watch'`
  (`BATTLE_MODES` in `js/game/battle.js`): P1 and P2 are both
  `CombatAIController`s at the one chosen difficulty, labelled CPU 1 and
  CPU 2, each from its own fighter definition. Each CPU has its own RNG
  stream derived from the battle's seed (`deriveSeed`: P2 keeps the seed
  itself, as Quick Battle's CPU does, P1 a scrambled one), so a seeded match
  is reproducible and the two never share one sequence, not even in a mirror
  match; unseeded, the seed comes from the clock. Restart and rematch keep
  both controllers and reset their plans. Every rule below is the same as in
  Quick Battle.
  - **Input only.** Like `PlayerController`, it only returns the standard
    input snapshot (`runLeft`, `runRight`, `down`, `jump`, `shield`,
    `extra_attack`, `transform`, `attack1` to `attack5` and their `…Pressed` edges, each edge true
    only on the step its button goes down). Attacks, projectiles, the Shield,
    summons and techniques (their own buttons, `attack4` and `attack5` for
    #0001, pressed directly), the fast fall (`down`), jumps and the Dash (a
    double tap) all go through the fighter
    exactly as a player's do. It never writes to a fighter, never spawns or
    moves anything, never reads the player's raw input, and never uses the
    training CPU's platform drop: it walks off platform edges instead.
  - **Sense → evaluate → act.** It senses what the simulation shows (both
    fighters' positions, motion, attacks and their phases, Shield,
    Energy, Launch Point, cooldowns, techniques, projectiles, clones, the
    stage's ledges and platforms, the score and the clock through
    `ctx.stage` / `ctx.battle`), scores the options that fit (answer a threat
    with Shield / a step / a jump / a Dash / a strike first; strike; throw a projectile;
    approach; hold a spacing; jump in; Dash in; press a summon or technique
    button (a technique it saves for a safe distance or an opening rather
    than casting it point blank, unless no Shield stops it and its
    opponent hides behind one); make for the centre; wait), each built
    from the fighter's own data (reach from its hitboxes and pulls, a
    projectile's range, flight and worth (a piercing one's every strike)
    from its data, a paralysis as the free hits it opens, its
    summons and techniques from the typed buttons in `actions`, each only
    on the ground and off cooldown; a button mapped to null is never
    pressed), and acts over as many steps as needed.
  - **Reaction.** A new attack startup, projectile, clone, technique or
    whiff is an event, taken in after a delay sampled from the
    level's reaction window, or never on a lapse; only then can it be
    answered. Neutral decisions follow the level's reassessment cadence and
    planning time. Prediction is limited to projecting current motion over a
    short, level-set horizon.
  - **Difficulty** (`js/data/difficulty.js`) sets only these traits: reaction
    window, lapse chance, reassessment interval, decision noise, hesitation,
    spacing error, motion lookahead, and weights for defense, punishing,
    summons and techniques (`specials`), Dash, planning, aggression, stage sense and Energy care.
    Every trait is ordered Easy → Brutal; Brutal's reaction is fast but never
    zero. No level changes damage, launch, hitstun, startup or recovery,
    speed, gravity, jumps, Dash, Shield, Energy, cooldowns, hitboxes,
    invulnerability, score or respawns.
  - It never walks off the main floor on its own, follows its opponent up and
    down platforms, and stands still while its opponent is out of play.
  Practice Ground's CPU is a different thing: a controller-less training
  dummy that never moves or attacks, whatever the Quick Battle difficulty.
  The older non-attacking `TrainingAIController` remains in
  `js/game/fighters/fighter-controller.js`, unused by every mode.
  - **Attack orientation.** The combat controller supplies a live
    horizontal target direction for attack initiation and each simulation
    step, including after both fighters move. Equal coordinates retain the
    last valid direction; missing or out-of-play targets are ignored.
    Ordinary attacks turn their hitboxes and pending projectile release
    with their artwork. Motion attacks and techniques use separate visual
    facing so their existing trajectory, collision and hit directions
    remain intact. Spawned projectiles never turn with their owner. This
    does not synthesize movement or Dash input and does not change manual
    or training facing.
- Match score (`Battle.score`, `{ p1, p2 }`, the match's own: never on a
  fighter or its character, and not `round`): both start at 0. A fall into
  the Void scores exactly one point for the opponent, at once, if the
  opponent is itself in play; the fighter that fell never scores for it.
  When both are out together (taken on the same step, or one taken while
  the other still waits to respawn) that fall scores nothing, so a double
  K.O. never moves both toward the win. The global phase stays `fight`
  while a fighter waits to respawn: the timer runs on and the survivor
  plays on (a summon then has nobody to appear behind and its press does
  nothing at all; nothing can hit, hold or aim at the absent fighter). The point that
  reaches 3 ends the match: no respawn for the loser, the `ko` phase (the
  K.O. beat) and then the result. Once time is up or the match is won, a
  fall scores nothing and nobody respawns. The result: 3 points wins
  (`reason: 'void'`); on time, more points wins (`'points'`), then the lower
  Launch Point (`'time'`), else a draw. Restart and rematch reset both scores
  to 0 and cancel any respawn wait.

#### 7.2.9 Character specifications

Each playable fighter has a character specification of its own, part of
this specification: its art, clips, body, movement profile and Powers, its
moves with their exact values, its defense, Energy and launch reaction,
its touch buttons and its combo routes. The rules above are not repeated
there, and nothing in one is a rule for another fighter.

- **#0001**: [docs/characters/0001.md](docs/characters/0001.md) (the
  limitless sorcerer: the Jab and Floating Straight, Red and the Red Kick,
  Maximum Blue and Blue, the High Kick, the Unlimited Void and Hollow
  Purple techniques, and Infinity, a Shield that stalls the blows it
  blocks).
- **#0002**: [docs/characters/0002.md](docs/characters/0002.md) (the
  speedster: the One-Two, Homing Attack, Rapid Kicks, Bounce Attack, Spin
  Attack, Blue Tornado and Whirlwind, a ground guard).

Adding one is described in
[docs/characters/adding-characters.md](docs/characters/adding-characters.md).

### 7.3 Battle chrome

- The battle keeps deliberate dark chrome over the stage for legibility, using
  the same neutral hierarchy: white labels, gray secondary text.
- **Battle glass** (`.glass` in `css/battle.css`): semi-transparent charcoal with a
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
  no cooldowns. Each tag is its fighter's label: in Watch Mode the left card
  is CPU 1 and the right CPU 2, in the same two tag styles.
- Score dots (battles only, Quick Battle and Watch Mode): under each card, centred, one small CSS
  circle per point the match is played to (`pointsToWin`, 3), an outlined
  empty ring (○) filled solid white (●) for each point that fighter has
  scored, in order, the moment it is scored (the third fills as the K.O.
  beat starts). They survive respawns and reset only on a new match, a
  restart or a rematch. Practice Ground shows none.
- Fighter status (Canvas, `js/game/rendering/fighter-status.js`, drawn by the Arena
  over everything, the Void included, for each fighter in play whose body
  is on screen, at its interpolated position). Both parts are temporary:
  a thin **Energy bar** just above the name tag, only while Energy is
  below full (`energy < maxEnergy`; hidden at full, so a fresh or
  respawned fighter shows none): one bar, about the fighter's width, at
  least 44 CSS px, a black outline, a dark track and a bright purple fill
  (`#b026ff`), `energy / maxEnergy` wide, shrinking from the right; gray
  instead from the moment it empties and through the whole refill,
  proportional to what has come back, and gone, never purple, once full. Under the feet a row of
  cooldown rings, one only for each summon or technique button actually
  cooling down (`abilityCooldowns.active`), labelled by its button (`A4`
  for `attack4`, `A5` for `attack5`: #0001's Unlimited Void and Hollow
  Purple), in button order (`specialAttacks`): a lone ring centred under
  the fighter, two side by side, no slot kept for a ready one and nothing
  at all while all are ready. Each is a white ring with a black outline that
  fills clockwise from the top as the ability recovers (`progress = 1 −
  remaining / duration`, read straight from the cooldown state), the seconds left inside it (`4.3`, one decimal,
  rounded up so it never reads `0.0`), and its white label (`A4`)
  beneath, all text outlined in black; it disappears on the step the
  cooldown ends. No green. With the bar hidden nothing is kept above the
  tag (`Arena.statusTop`). A fighter off screen keeps only its edge
  pointer; one out of play shows none of it.
- Accessibility: the Launch Point number sits in a group labelled "Launch
  Point" (no maximum); each card carries a screen-reader-only Energy description
  in steps of 5 ("Energy 75 of 100", "Energy exhausted, refilling: 40 of
  100"; the card has no Energy meter of its own), and each score row is an image labelled "Player 1:
  1 of 3 points". The HUD writes to the DOM only when a shown value
  changes.
- Timer + pause: one glass control at top centre. The round label and timer
  sit on top; a rectangular pause section sits directly beneath with no gap,
  the same width and a hairline seam, so only the outer corners are rounded.
  The timer reads minutes and seconds (`5:00`, `1:27`, `0:09`). Both halves
  are buttons that pause the game; the timer half is labelled "Pause game,
  M minutes S seconds remaining" (just the minutes or just the seconds when
  the other is 0). For the last ten seconds only the digits change, from a
  slightly softened off-white to pure white; the glass never changes colour,
  inverts or flashes.
- Player markers above fighters (under their Energy bars) and ground
  rings: P1 white, CPU gray.
- **Hit effects** (`js/game/rendering/hit-fx.js`, owned by the Arena, so Quick Battle
  and Practice Ground alike): presentation only, fed each step's combat
  events. They never change a simulation step; a test steps the same fight
  with and without them and compares every step.
  - *Screen shake* scaled to the hit: 1.5 CSS px, plus 0.18 per point of
    damage and 1 per 320 units / s of launch speed, up to 14, dying away
    over about a quarter of a second; a block and a perfect block give a
    small one. A hit with no stun and no launch (a Launch Point tick)
    shows nothing.
  - *Hit flash:* the fighter hit is drawn for one frame as a white
    silhouette of its own current pose (the frame itself where no canvas
    can be made). Never on a block.
  - *Sparks* where the hit landed (the event's `point`: the middle of the
    hitbox's overlap with the hurtbox it touched, or the projectile, or the
    target's body): a white core with amber streaks, each over a thin
    dark line, thrown mostly along the launch and bigger for a stronger
    hit; a red ring for a block; a white ring edged in red for a perfect
    block.
  - *Speed trails:* a tumbling fighter moving at 900 units / s or faster
    leaves up to six fading afterimages of its own poses behind it.
  - *Rebounds:* a launch rebounding off the stage (`Fighter.bounce`, handed
    over by the Arena each step) throws the hit's sparks off the surface
    where it struck, sized by its speed into it, and one at 900 units / s or
    faster shakes the screen a little (1 px per 450 units / s, up to 7). No
    flash: a surface is not a hit.
  - *Lethal launch:* a launch that would carry its fighter into the Void
    if it did nothing (its body stepped on with the stage's own physics
    through the stun and 0.3 s more, at its hitstun rates and then its
    normal ones, no steering or jump, rebounding as the fighter's launch
    would, each rebound's stun included; `launchIsLethal`) slows the clock the
    fixed steps are fed from to a quarter for 0.45 s, easing back over
    0.3 s, while the view closes in to 1.35 × on that fighter (never past
    the camera bounds) with a big shake. One at a time. Every step is
    still exactly one step.
  - Reduced motion drops the shake and the zoom; the flash, sparks, trails
    and slow motion stay.
- Round banners ("ROUND 1", "FIGHT", "TIME", and "K.O." under "VOID" when a
  fighter's fall gives the opponent its third point) in white on a dark
  band.
- Pause menu: glass panel over a dimmed battle with "Quick Battle" ("Watch
  Mode" in Watch Mode; no stage name), "Paused", green **Resume** (default), **Restart Battle** and
  **Return to Home**, nothing else. `Esc` / Back resumes.
- Time over: the fighter with more points wins ("Time ran out. More points
  wins the match."); level on points, the one with the lower Launch Point
  wins ("Time ran out with the points level. Lower Launch Point wins."). A glass result menu offers green **Rematch**, **Change Stage**
  and **Return to Home**. Level on both is a draw: no dialog; once the TIME
  banner has played, a fresh battle starts.
- Match K.O.: once the K.O. banner has played, the same result menu opens
  with the kicker "K.O." and the line "The CPU fell into the Void for the
  final point." (or "Player 1 fell ...").
- Result titles: "Player 1 Wins" or "CPU Wins" in Quick Battle, "CPU 1 Wins"
  or "CPU 2 Wins" in Watch Mode, whose K.O. line names CPU 1 or CPU 2.

### 7.4 Input

- Keyboard (simultaneous keys, held-state tracking, no reliance on key
  repeat): A/D or ←/→ move (`runLeft` / `runRight`; twice in a row to Dash), S/↓ Down (`down`; held; a direction only: in the air while falling, the fast fall, and as a hit lands, steering the launch downward), W/Space/↑ jump (`jump`; tapped, the normal jump; held a little longer, the higher jump; again in the air, the air jump), J the
  extra attack (`extra_attack`, e.g. #0001's High Kick), K Transform (`transform`, reserved), L Shield (`shield`), U
  `attack1`, I `attack2`, O `attack3`, M `attack4`, `,` `attack5` (the
  numbered buttons along the row above J K L, then the row below it; a
  fighter acts only on the ones it has a button for, 7.2), Esc/P pause
  (`pause`; the Practice menu in Practice Ground). Each control goes by
  that one codename: its key in `CONFIG.bindings` and `ACTIONS`, its field
  in every input snapshot, and for the combat buttons (`COMBAT_BUTTONS`:
  `extra_attack`, `transform`, `attack1` to `attack5`) its key in a
  character's `actions`. The moves have universal codenames too (`MOVES`
  in `js/config.js`), the same for every character, whatever it calls them
  in game: `attack1` to `attack5`, `midair_attack1` to `midair_attack5`,
  `extra_attack` and `transform` (reserved), each with a neutral label
  ("Attack 3", "Mid-air Attack 3", "Extra Attack") and nothing about what
  it does for a character (its loadout decides that, 7.2). A
  character's own ability names (#0001's Jab, Red, Maximum Blue, Unlimited
  Void, Hollow Purple and High Kick) are presentation only: its `abilityNames`, keyed by move
  codename and read through `abilityName` (`js/data/abilities.js`), which
  gives an unnamed move its neutral `MOVES` label. No screen shows them yet. `` ` `` toggles a
  debug overlay (colliders, hurtboxes, attack hitboxes while active, each
  flying projectile's hitbox in magenta with its name, each clone's attack
  hitbox, labelled `clone attack1` or `clone midair_attack2`, on its active frame,
  a technique's burst box, dashed cyan, through its release, labelled with
  the attack and its phase (`attack4 release`), a `paralyzed s` label on a
  paralysed fighter with its seconds left, a `shield` label on a shielding
  one, a `ricochet n` label on a fighter flying off its n-th rebound,
  solids with the main floor's block among them, and the Void's fixed kill
  line, dashed violet).
  For #0001, O (`attack3`) is Maximum Blue (Blue in the air), M
  (`attack4`) Unlimited Void and `,` (`attack5`) Hollow Purple, pressed
  directly like any numbered button (7.2); for #0002, M and `,` do
  nothing. The input
  snapshot (`InputManager.sample()`) carries `runLeftPressed` / `runRightPressed`
  press edges for the Dash's double tap (7.2), from the same normalized
  press counting as every other action, whichever device made them: a key
  (never its auto-repeat), a touch button, the D-pad, or the left stick
  crossing from neutral into its held zone (holding it there makes no more;
  back near neutral and out again makes another). It also carries
  `mouvementLeftPressed` / `mouvementRightPressed`: a Dash asked for in one tap
  (`InputManager.queueTouchMouvement(direction)`, from the Joystick layout's
  mouvement buttons, `mouvementLeft` / `mouvementRight`), true for exactly one sample and then gone (`flush()` and
  `clear()` drop it too); it holds no direction and makes no press edge.
  Every controller's snapshot carries both, false (the combat AI still
  Dashes by double tap). Fighter never reads raw
  key timestamps; menus never read these edges. In menus S/↓ still navigate down: menu bindings are separate
  from the gameplay `down` action.
- Gamepad (standard layout) for movement (D-pad / left stick left and
  right), Down in battle (`down`: D-pad down / left stick down, held; the
  fast fall in the air and downward launch steering; menus still read them
  as Down), jump (A), the extra attack (X / Square), `attack1`
  (B / Circle), `attack2` (LB), `attack3` (LT), `attack4` (L3), `attack5`
  (R3), Transform (Y / Triangle, reserved), Shield (RB / RT) and Start to
  pause/menus, sending the same codenames.
- Touch (landscape, Pointer Events, true multi-touch), in one of two
  layouts chosen under Settings → Controls → Mobile Controls (6.10);
  `TouchControls.setScheme('joystick' | 'classic')` switches them (anything
  else is Joystick), and Quick Battle and Practice Ground apply the saved
  one, and that layout's saved custom placement (`setLayout`, 6.10a), each
  time they are entered. A switch first lets go of everything held
  (every pointer, direction, Jump, Shield and the rest) and
  recentres the joystick, so nothing is ever left down.
  - **Custom placement.** `TouchControls.applyLayout()` moves each control
    the layout names by the CSS `translate` property, from where the
    stylesheet puts it to its stored centre in the current touch-control
    area (kept whole inside it), and sizes it by `scale`, which grows its
    hit area with it; controls the layout leaves out are untouched, so the
    default layout is the stylesheet's own, pixel for pixel. Battle and
    Practice Ground re-apply it after every resize, orientation or device
    change. Every control keeps its element, handlers and codename: held
    buttons, the one-tap Dash buttons, multi-touch and `setCharacter` work
    exactly as before; the joystick measures its drawn radius (thresholds
    and travel are fractions of it) and draws its knob in its own unscaled
    pixels; Classic Buttons' cluster still captures the pointer and
    hit-tests Left / Right where they are drawn, so a thumb slides
    between them wherever they sit. In battle the controls are never
    keyboard-focusable (`tabindex="-1"`); only the editor's copy is.
  - **Joystick** (the default): the lower-left corner holds one circular
    joystick (a translucent round base with no marks on it and a movable
    knob, in the buttons' style; a group named "Movement joystick"). It
    captures one pointer and holds the existing `runLeft` or `runRight` input
    once pushed sideways past 0.34 of its radius, letting go back inside
    0.24 (a deadzone with a little hysteresis, so a resting thumb never
    drifts or flickers). Crossing the centre releases one direction before
    holding the other. Only the sideways part counts: up and down move the
    knob, never Jump or Down. The knob follows the thumb, clamped to
    0.56 of the radius, and eases back to the centre on release, cancel,
    lost capture, pause, disabling or a scheme switch. It is digital like
    the rest of ALVA's input: how far it is pushed never changes speed.
    Pushing it out twice quickly is a double tap, as with the gamepad stick.
    The base is plain: no arrows are drawn in it, only the knob. Above its
    top-left and top-right sit two small Dash buttons named exactly **Left
    mouvement** and **Right mouvement** (◀ ▶ glyphs): one tap asks for one
    Dash that way (`queueTouchMouvement`, 7.2) and holds nothing; each
    shows pressed while touched. No Down button or extra hit region exists.
  - **Classic Buttons**: lower-left Left · Right with thumb sliding and
    double-tap Dash; no joystick or separate Dash buttons.

  The editor exposes only these controls. Legacy saved `down` entries are
  discarded during sanitization; all other positions and scales survive.

  Both layouts share the lower-right staggered cluster, in the same place
  in both. For example, for #0001 (five numbered buttons) it is —

  ```
             [VOID]  [PURPLE]  [HIGH KICK]
        [MAX BLUE]   [TRANSFORM] [SHIELD]
               [JAB]  [RED]  [JUMP]
  ```

  The numbered attack buttons (`attack1` to `attack5`, `.tc-attack`) take
  numbered slots (`data-slot`, set by `setCharacter` through
  `attackSlots`): `attack1` is always slot 1 and `attack2` slot 2 (the
  bottom row, where attack1 and attack2 have always been), and the fighter's
  other numbered buttons fill slots 3, 4 and 5 in order, a honeycomb round
  Transform and Shield that never overlaps another button and widens the
  cluster by at most half a pitch:

  ```
             [4]  [5]  [EXTRA]
          [3]  [TRANSFORM] [SHIELD]
             [1]  [2]  [JUMP]
  ```

  So N numbered buttons use slots 1 to N, whatever kind of move each one
  is: 2 → 1–2, 3 → 1–3 (#0002), 4 → 1–4, 5 → 1–5 (#0001: Unlimited Void
  in slot 4 and Hollow Purple in slot 5). A summon or technique button is
  pressed exactly like an attack button. The saved custom layout (6.10a) keys every one of them by its
  codename, so a placed `attack5` stays where the player put it whichever
  slot a fighter would give it.

  No touch button shows text: no **T**, **D** or attack number. Its
  accessible name says what it is. The fighter's own buttons, the large
  top one (`extra_attack`) and the numbered attack buttons show a
  frame of the fighter's own animation for that move, in the art's own
  colours and transparency (never tinted white or in `currentColor`): one
  image element per button (`.tc-sprite-icon`, empty `alt`,
  `aria-hidden="true"`, no pointer events), centred and fitted whole, its
  aspect kept (`object-fit: contain`, crisp pixels), inside the square
  inscribed in the round button (70% of it), so no sprite is clipped by
  the circle or stretched; the button's size, hit area, shell, press
  feedback and pending style are its own. Each button's name and frame come
  from the character's `mobileAbilities` (UI data, never read by combat,
  and never deciding what a button does): `label`, and `preview:
  { animation, frame }`, a clip of the fighter's own `animations` and a
  frame of it counted from 0 (as `visual.portrait.frame` is), resolved by
  `previewFrame` in `js/ui/mobile-abilities.js` to that clip's own file (no
  path is written twice; a clip drawn facing left is mirrored to face
  right). Each frame is chosen to read as the move; each fighter's choices
  are in its character specification (7.2.9). A button may name a
  `fallbackIcon` (a key of `ICONS`) to show if its image cannot load.
  `previews.air` describes the distinct airborne move selected by `actions`;
  `preview` or `previews.ground` describes ground/shared artwork. A preview
  may explicitly select `collection: 'projectileAnimations'`. Jump always
  uses `ICONS.jump`, with its universal name ("Jump", "Saut").
  After each simulation frame, Battle and Practice synchronize the actual
  player's grounded state with `TouchControls.setAirborne`; unchanged
  states do no presentation work. Landing restores ground artwork. Air
  labels use localized move names. Ground-only abilities keep their ground
  artwork, dimmed and marked `aria-disabled`, with combat restrictions intact.
  `TouchControls.setCharacter(def)` applies them in place, without
  rebuilding anything: the same buttons, and the same image in each, only
  its source changed (`TouchControls.showArt`). Quick Battle calls it with
  Player 1's fighter as it enters (Watch Mode, where nobody plays, hides
  the touch controls instead), Practice Ground as it enters and on every
  successful Change Fighter (a CPU change never touches them). A button
  with no frame to show (no fighter named yet, a fighter with no
  `mobileAbilities`, a preview naming no clip or frame, reported once, or
  a file that fails to load, reported once and not tried again) shows its
  fallback glyph instead (a ring, one to five pips, or the authored tornado), its
  name and input unchanged; with no `mobileAbilities` the names are the
  generic ones ("Extra Attack", "Attack 1" to "Attack 5"). Valid fighters
  never fall back in play. Transform keeps its glyph: it is reserved until
  a fighter presents its own (with its own `icon`, a key of `ICONS`); with
  no `transform` entry (#0001 and #0002 have none) it is the neutral star,
  labelled "Transform", with a dashed outline. The universal buttons belong
  to the controls and keep their original monochrome SVG glyphs
  (`currentColor`, from `js/ui/icons.js`): **Shield** (the shield outline,
  labelled "Shield"; held for as long as the pointer stays on it) in the
  old Block slot, Jump and the Left / Right arrows, the joystick and the
  Dash buttons. Only the presentation is per fighter: each button's
  `data-action` is its control codename (`extra_attack`, `transform`,
  `shield`, `attack1` to `attack5`, `jump`, `runLeft`, `runRight`),
  whatever it looks like, so #0001's Unlimited Void is `attack4` and its
  Hollow Purple `attack5`. The combat glyphs are drawn slightly larger
  (`.tc-ability .icon`); every button shares the pressed state.
  Tapping the timer or the pause section beneath it (top centre, 7.3) pauses.
  Original circular buttons, translucent dark fill, white outlines; pressed
  buttons scale down and brighten to white — no hue.
  A reserved button (only Transform, and only while the fighter has none)
  uses a dashed outline and never shows nagging alerts; the fighter's own
  moves and Shield are solid. A button for a move the fighter does not
  have at all (left out of its `actions`, #0002's `attack4` and `attack5`
  included: `abilityPresence` in `js/ui/mobile-abilities.js`) is hidden:
  not drawn, not named, never focused and never pressed (a hidden `attack1`
  or `attack2` keeps its slot empty, so no other button moves); the same
  element returns for a fighter that has it.
  The touch layout editor keeps it on show, neutral, since every fighter
  shares the layout.
- Touch controls appear only on touch-first devices (coarse pointer or an
  observed touch), never merely because a desktop window is narrow.
- Gameplay pauses when the pause menu (Practice Ground: the Practice menu,
  the Change Fighter dialog or the CPU dialog) is open, the tab is hidden, or
  the device is blocked in portrait.

## 8. Accessibility

- Semantic buttons, headings, lists, tabs (`tablist`/`tab`/`tabpanel`),
  radio groups (Settings' Language and Mobile Controls), dialogs
  (`dialog`/`alertdialog`, `aria-modal`, labelled/described: the language
  chooser, Settings, the layout editor, pause, result and confirm),
  `aria-pressed`/`aria-checked` for selections, `aria-live` previews and
  editor announcements.
- Every modal pushes its own navigation scope and removes exactly that scope
  when it closes; focus enters it on open and returns to what opened it (or
  leaves it) on close, never staying in hidden content.
- `<html lang>` always names the interface language; the language choices
  carry their own `lang`; every `aria-label` and dialog label follows a
  language change.
- Every touch control is a real button with its own name, whatever its
  glyph: the joystick is a group named "Movement joystick", its Dash
  buttons "Left mouvement" and "Right mouvement" — in French
  "Joystick de déplacement", "Mouvement à gauche" and "Mouvement à droite".
- The layout editor has a non-drag way to make every change: keyboard and
  gamepad select a control, nudge it in small steps in an explicit move mode
  and resize it with the navigable Smaller / Larger buttons and slider.
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

- Entry point `index.html` at the root (for GitHub Pages); styles in
  `css/`, one stylesheet part per area linked from `index.html` in cascade
  order (design tokens first, in `css/base.css`; responsive overrides
  last); modules under `js/`; documentation under `docs/`; tests under
  `tests/`; `.nojekyll` at the root. Every path is relative.
- The repository is `hiyroscript/alva` (GitHub Pages path `/alva/`). No
  code references the repository name, so the site works under any
  sub-path.
