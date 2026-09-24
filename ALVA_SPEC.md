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
  (≈264–376 × 392–432 px), five mid-air Basic Attack 1 frames
  `0001_midair1ba1`–`0001_midair1ba5` (≈248–424 × 344–448 px), seven Basic
  Attack 2 frames `0001_2ba1`–`0001_2ba7` (≈224–336 × 384–424 px), three
  mid-air Basic Attack 2 frames `0001_midair2ba1`–`0001_midair2ba3`
  (≈216–352 × 424–536 px), four Charge frames `0001_charge1`,
  `0001_charge2`, `0001_chargea` and `0001_chargeb` (≈272–288 × 416 px),
  three Dodge frames `0001_dodge1`–`0001_dodge3` (≈256–288 × 384–416 px),
  three mid-air Dodge frames `0001_midairdodge1`–`0001_midairdodge3`
  (≈288–320 × 376–400 px) and three Throw frames `0001_throw1`–`0001_throw3`
  (≈280–312 × 360–376 px), and twelve Charged BA2 (Sphere Rush) poses
  `0001_rasen1`–`0001_rasen12` (≈64–110 × 80–104 px, ≈2× pixel art).
  `0001_dodge3` happens to be the same image as `0001_charge1`; it is kept
  under its own name as the Dodge's recovery frame.
- The twelve Sphere Rush poses are fighter poses, registered as three
  logical one-shot clips in `animations` rather than one blind animation:
  `rasenForm` (`rasen1`–`rasen3`, preparation: the rear palm opens for the
  sphere), `rasenDash` (`rasen4`–`rasen6`, the rush: the sphere carried
  behind, swung forward on `rasen6`) and `rasenConfirm` (`rasen7`–`rasen12`,
  the palm driven into the opponent, then the recovery). They use the normal
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
  registered as three one-shot `effectAnimations` at 12 fps:
  `rasenSphereBuild` (`prasen1`–`prasen6`, energy gathering into the
  complete orb, 0.5 s), `rasenSphereImpact` (`prasen7`–`prasen9`, the orb
  intensifying on the opponent, 0.25 s) and `rasenSphereExplosion`
  (`prasen10`–`prasen11`, the blast, ≈0.167 s). Normalized like the clone
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
  is always the frame number (`0001_1ba3.png` is Basic Attack 1, frame 3;
  `0001_midair2ba1.png` is Mid-air Basic Attack 2, frame 1). Charge is the
  exception: `charge1` / `charge2` are its startup frames and the lettered
  `chargea` / `chargeb` its sustained loop; `charge1` is also reused, as the
  same file, for the Charge release pose.
- The idle, jump, fall, land and hurt frames (≈16× pixel art), the mid-air
  hurt, Basic Attack 1 and 2, Charge, Dodge, Throw and shuriken frames (≈8×),
  the run frames (≈4×) and the clone cloud, Sphere Rush pose and sphere
  frames (≈2×)
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
  Battle stages) and `js/data/practice-map.js` (the training stage). Adding a
  fighter means adding frames, a definition and a roster slot — never editing
  engine code.
- Simulation uses fixed 60 Hz steps with interpolated rendering and a clamped
  frame delta, so behaviour is identical at 30, 60 and 120 Hz.

## 5. Brand identity

### 5.1 Palette

Alva's interface is **near-black/charcoal dominant**, with off-white typography,
gray hierarchy and **green as the sole interface accent**. It follows Seren's
visual discipline without copying its assets. Green signals actions, selection
and progress; it does not fill every card, border or heading. The single
exception is the blue battle-HUD Energy meter (`--energy`, 7.3), a
gameplay-resource colour; nothing else in the interface turns blue.

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
| `--energy` | `#3b82f6` | Battle HUD Energy meter fill only (gameplay-resource exception) |
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
Home → Practice Ground (starts at once with #0001)
Practice Ground → More → Change Fighter (roster dialog) / Enable CPU or Change CPU (CPU roster dialog → Disable CPU) / Allow or Revoke infinite energy / Return (Home)
Battle → Pause → Resume / Restart / Return to Home (confirmed); Help is shown but disabled for now
Battle (time over, one fighter ahead) → Result → Rematch / Change Stage / Return to Home
Battle (time over, draw) → a fresh battle starts, no dialog
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
- **Actions:** exactly two — **Play** (green, white text, arrow) opens Select
  Mode and is focused by default; **Practice Ground** (outlined, chevron)
  beneath it opens Practice Ground (6.8) straight away, with no mode, fighter
  or stage select. It replaced the former, disabled Help & Credits entry; the
  Help & Credits screen and the pause Help view remain in place (the
  pause-menu Help is still disabled, 7.3). Home buttons have a small 3 px
  radius.
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
  diagram, movement, Charge & Energy (including Charge + BA1 = Clone Attack,
  25 Energy, and Charge + BA2 = Sphere Rush: already Charging, forms before
  dashing, needs a hit to continue, two hits with the second delayed, ground
  needed throughout; no extra control row: both use the existing Charge,
  BA1 and BA2 controls), Throw, Defense, stages and platforms, pause, notes
  on this build.
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

A solo training room, entered straight from Home.

- **Start:** every fresh entry loads #0001 (character `0001`) through the usual
  loading overlay and gives control at once: no fighter select, countdown,
  round banner, timer, CPU or result. It runs until the player returns Home.
  Practice keeps its own fighter and CPU choices; it never reads or changes
  Quick Battle's selection. Every fresh entry also starts with no CPU and
  infinite energy off.
- **Player 1:** one fighter under Player 1's control, with normal movement,
  physics, attacks, projectiles, clones, Charge, Defense, animation, camera
  and touch controls. Until a CPU is enabled there is no other fighter,
  hidden or not, and the camera follows Player 1 alone. Moves aimed at an
  opponent then fall back or miss: Charged BA1 has nobody to appear behind,
  so it is an ordinary BA1 and costs no Energy; the Sphere Rush dashes, finds
  no one and ends as a miss.
- **Practice CPU (optional):** a training dummy, slot `p2`, labelled CPU, at
  the stage's second spawn (320 units right of Player 1's, facing it). It has
  no controller, so it never walks, jumps, drops, attacks, throws, charges,
  blocks or dodges; it is otherwise a normal fighter (hurtboxes, real damage,
  hitstun, hurt animations, knockback, gravity, stage and pushbox
  collisions, binds, facing its opponent). With it, Player 1 and the CPU are
  each other's opponent, so clones, projectiles, the Sphere Rush and melee
  target it and the camera frames both. Each hit it takes shows its resolved
  damage (the CombatSystem's hit event) in red over its head, `-6` or `-2.5`,
  rising and fading over 0.8 s; simultaneous hits stack. Knocked out, it is
  restored to full health once its hit reaction ends. No HUD panel,
  timer or rounds come with it.
- **Training stage:** its own map (`js/data/practice-map.js`), kept out of the
  Quick Battle stage list. Original Canvas artwork of a minimalist combat
  laboratory: a pale, cool-gray room built from one square grid, with a gridded
  back wall, a broad flat floor in one-point perspective, stronger lines every
  five cells, a darker centre axis, side walls at the stage bounds and a ruler
  along the floor's front edge. No scenery, particles, hazards or moving parts.
  Only the camera moves the room; its static geometry is computed once.
- **HUD:** only the P1 panel (tag, name, health, Energy) top-left and a compact
  glass **More** button (three dots, `aria-label="Practice menu"`,
  `aria-haspopup="dialog"`, `aria-expanded`) centred at the top where Quick
  Battle's timer sits, a responsive 8–14 px lower. No CPU panel (even with a
  practice CPU), round label, timer or pause control.
- **Practice menu:** More, Esc / P or gamepad Start freezes practice
  (simulation, gameplay input and touch controls stop) and floats a light,
  translucent glass menu centred under the More button over a lightly
  dimmed, still stage. It holds exactly **Change Fighter** (green, focused),
  **Enable CPU** (**Change CPU** while there is one), **Allow infinite
  energy** (**Revoke infinite energy** while on) and **Return** (outlined).
  More again, Esc / Back, P, Start or a press on the dim resumes. **Return**
  goes Home and tears everything down.
- **Infinite energy:** a Practice-only rule for Player 1: its Energy is full
  before and after every simulation step, so every cost can be paid while the
  moves keep their normal rules and cooldowns, and the HUD bar stays full.
  Allowing it refills at once; revoking it just stops the refills. The
  toggle keeps the menu open and focus on the button. It survives Change
  Fighter; the CPU never has it.
- **Change Fighter:** opens the fighter roster (the same component, rules and
  look as Select Fighter, 6.4) as one large translucent glass dialog
  (`role="dialog"`, `aria-modal`, titled "Change Fighter"; about 90 vw ×
  88 dvh, safe-area aware, the roster scrolling inside it) over the paused
  stage. The current fighter starts selected, previewed and focused; the
  menu beneath is inert. Confirming loads the fighter, replaces the practice
  fighter in place at the spawn with full health and Energy, clears the old
  fighter's projectiles, clones and technique, rebinds the HUD, closes both
  overlays and resumes. Back / Esc closes only the dialog and returns focus to
  Change Fighter, leaving the fighter unchanged. A failed load keeps the
  current fighter and the dialog. A practice CPU stays through the swap, now
  facing the new fighter, and infinite energy stays on.
- **CPU dialog:** Enable CPU / Change CPU opens a second instance of the same
  roster dialog (its own ids and navigation scope), titled Select CPU or
  Change CPU. Confirming loads the fighter, puts it on the CPU spawn
  (replacing any current CPU, never Player 1), closes both overlays and
  resumes. Back / Esc returns to the menu unchanged. While a CPU exists,
  **Disable CPU** sits right beside Back: it removes the CPU with everything
  aimed at it (a technique holding it, clones summoned at it, opponent links,
  its damage numbers), closes the dialog and leaves practice paused in the
  menu with focus on Enable CPU. A failed load keeps the current CPU (or
  none) and the dialog.

## 7. Battle

### 7.1 Stages and camera

- Stages are 2.5–4 viewport widths wide, drawn procedurally as six parallax
  layers (sky, far, mid, near, terrain, atmosphere) cached as `Path2D`.
- **Desert:** wide, bright, open; mesas, rock formations, sunset haze, drifting
  sand; two rock outcrops to hop onto.
- **City:** rooftops at night; dense skyline, vents, girders, warm neon;
  seven one-way platforms that fighters jump up through from below. The
  player has no drop-through control and walks off an edge to come down; the
  training CPU can drop through all of them except the water-tower deck.
- Collision comes only from map data, never from art.
- The camera frames both fighters (Practice Ground's fighter alone until a
  practice CPU is enabled),
  interpolates smoothly and never shows outside the map. Fighters occupy
  ≈ 14–18 % of viewport height.

### 7.2 Fighters, physics and combat

- `#0001` has Idle, Run, Jump, Fall, Land, Hurt, Mid-air Hurt, Basic Attack 1,
  Mid-air Basic Attack 1, Basic Attack 2, Mid-air Basic Attack 2, Charge,
  Dodge, Mid-air Dodge, Throw and the Sphere Rush (three clips), plus the
  Shuriken projectile animation and the clone-cloud and sphere effects.
  No invented frames. Rising uses Jump and
  descending (walking off a ledge included) uses Fall; each plays once at 10 fps
  and holds its last frame. Land plays once at 12 fps on touchdown, for
  exactly the clip's length, then returns to idle or run. Land is a visual
  state only: it never changes movement or collision, and a new jump, attack
  or hitstun cuts it short. If those frames fail to load, the fighter holds an
  idle frame without stretching or rotating. Facing flips the sprite (per
  clip, against that clip's source orientation; see 3) and turns toward the
  opponent when standing.
- Hitstun shows Hurt while grounded and Mid-air Hurt while airborne, switching
  to Hurt if the fighter lands still stunned; the pose also holds through the
  impact freeze. Hitstun outranks every other state (charged technique,
  bound, attack, Defense, jump, fall, land, charge, charge release, run and
  idle), and normal states resume when it ends. It is a visual state only:
  no physics or collider changes. Missing hurt art holds an idle frame.
- Basic Attack 1 (BA1) is #0001's first attack, on the `action1` input. On the
  ground it is a punch (`ba1`, 4 frames); in the air a kick (`midairBa1`,
  5 frames); the character data maps `action1: { ground, air }` and the
  fighter picks by grounded state when the button is pressed. Both play once
  at 12 fps. Phases are whole frames: ground BA1 is frame 1 startup, frame 2
  active, frames 3–4 recovery; mid-air BA1 is frames 1–2 startup, frame 3
  active, frames 4–5 recovery. Each hits once for 6 damage, 0.22 s hitstun,
  0.14 s blockstun, 0.06 s hitstop, 180 horizontal knockback and no launch,
  with a 0.1 s cooldown. Hitboxes match the strike in the contact frame and
  mirror with facing. Movement and facing lock while an attack plays; gravity
  still applies, and a mid-air BA1 that lands finishes its own clip. Ground
  BA1 is ground-only.
- Basic Attack 2 (BA2) is #0001's secondary basic attack, on the `action2`
  input, selected the same way (`action2: { ground, air }`). On the ground it
  is a spinning high kick (`ba2`, 7 real frames); in the air a kunai slash
  (`midairBa2`, 3 real frames). Both play once at 12 fps, and the phases are
  the frames that visibly strike: ground BA2 is frames 1–3 startup (step in,
  lead jab, spin), frames 4–5 active (the kick, drawn with motion trails),
  frames 6–7 recovery; mid-air BA2 is frames 1–2 startup (kunai drawn back,
  then overhead) and frame 3 active (the slash arc), with no recovery frame,
  so the attack ends with its clip. BA2 is slower and heavier than BA1: each
  hits once for 8 damage, 0.24 s hitstun, 0.15 s blockstun, 0.07 s hitstop,
  220 horizontal knockback and no launch, with a 0.15 s cooldown on the
  ground and 0.18 s in the air. Hitboxes cover the kick arc and the slash arc
  in front of the fighter and mirror with facing. The same movement/facing
  lock applies, gravity keeps working, and a mid-air BA2 that lands finishes
  its own clip instead of switching to ground BA2 or Land. Ground BA2 is
  ground-only; pressing BA2 and Jump on the same step attacks on the ground.
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
  working, and there is a 0.25 s cooldown after it. No Energy cost. Like
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
  It hits at most once: 4 damage, 0.16 s hitstun, 0.10 s blockstun, 0.04 s
  hitstop on the target only (the thrower does not freeze), 140 horizontal
  knockback along the shuriken's own direction and no launch, then it
  disappears. Hits resolve through the same `CombatSystem.applyHit` as melee,
  with the shuriken's direction in place of the attacker's facing, and credit
  #0001 as the attacker. It never hits its thrower. During a Dodge's
  invulnerable frames it passes through unspent (no damage, stun, hitstop,
  knockback or event) and can still connect if it overlaps once they end; a
  future Block-type fighter guarding toward it blocks it with the normal chip
  damage, blockstun and half knockback, and it disappears. A missed shuriken
  disappears after 1.5 s, once it has flown past a stage edge, or when it
  meets a solid block; one-way platforms do not stop it. No multi-hit,
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
  pose and no clone) or when the Clone Attack cannot be paid for: BA1 while
  Charge is still held and sufficient Energy is available summons a clone
  instead of making the owner perform BA1, and the owner stays in Charge
  (see the Charged BA1 Clone Attack below). Likewise BA2 pressed while Charge
  is still held starts the Charged BA2 Sphere Rush instead of BA2 (below),
  and BA2 interrupts Charge as an ordinary BA2 only when Charge is let go on
  the press step or the Sphere Rush cannot start. The release pose is visual only: no
  damage, hitbox, invulnerability, armour, Energy change, knockback or
  special movement, and movement resumes normally while it shows. Every new
  Charge, including one started during the release pose, restarts from
  `charge1`. Charge is grounded
  only: held in the air, the fighter keeps Jump / Fall (no charge art is
  shown); held through touchdown, Land plays out first and Charge follows.
  While charging, horizontal movement is locked (a run decelerates normally
  to a stop) while gravity and collision still apply. Collider and hurtboxes
  are unchanged. Charge has no hitbox, no damage, no armour and no
  invulnerability, and it is not an attack or a combat action. State
  priority is hitstun > charged technique > bound > attack > Defense (Dodge)
  > jump / fall > land > charge > charge release > run > idle (a Block-type
  guard would sit between land and charge): a hit shows Hurt at once, Throw
  starts straight out of a held Charge (so do BA1 when the Clone Attack
  cannot be paid for and BA2 when the Sphere Rush cannot start), Jump
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
  invulnerable frames passes through: no health loss, hitstun, blockstun,
  knockback or hitstop, and the attack is not used up, so it can still
  connect if it is active after the window ends. A hit during startup or
  recovery is a full, normal hit that cancels the Dodge. A Dodge causes no
  chip damage, no blockstun and no block event, and gives no Energy, sound,
  particles or counter. Priority: an attack pressed on the same step wins and
  no Dodge starts; a Dodge that starts on the ground owns its step, so a Jump
  pressed with it does not launch; Defense during an attack or hitstun does
  nothing. If a Dodge clip's frames are missing, that Dodge is refused
  (logged) rather than granting invisible invulnerability. The debug overlay
  grays a fighter's hurtboxes while it is invulnerable.
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
  one that cannot (missing art, invalid data, too little Energy) lets the
  same press fall through to the button's normal attack. The Clone Attack
  never depends on technique code, nor the technique on the summon system.
- Charged BA1 Clone Attack (#0001). Trigger: the fighter must already be
  Charging (it entered the Charge state on an earlier simulation step), and
  Charge must still be held on the step BA1 (`action1`: U, B / Circle, touch
  **BA1**) is pressed. There is no new button or key. Charge and BA1 pressed
  together from idle on the same first step is an ordinary BA1 (normal action
  priority), and so is BA1 pressed on the step Charge is let go (no release
  pose, no clone, no cost). It is data on the character: `chargedActions`
  maps `action1` to the `ba1Clone` summon, which names the attack (`ba1`),
  the cloud effect (`cloneCloud`), `energyCost` 25, `behindDistance` 48 world
  units, the cloud's `effectOffset` (centred 44 units above the clone's feet,
  half the fighter's height) and a `stageMargin`. A successful summon spends
  exactly 25 Energy once, when it is accepted (100 → 75 → 50 → 25 → 0; a full
  meter pays for four; never below 0), and nothing is spent per cloud frame,
  on the attack, on a hit or miss, or on vanishing. With less than 25 Energy
  no clone is summoned and nothing is spent: the press falls through to the
  ordinary grounded BA1. Before paying, the summon checks that the cloud and
  BA1 have real frames, BA1 is defined and there is an opponent; missing art
  logs a warning, spends nothing, summons nothing and falls back to BA1
  (itself refused if BA1's frames are missing). One press summons exactly one
  clone; holding BA1 does not repeat it. There is no hidden one-clone limit:
  each further paid press while still charging summons another, each on its
  own independent lifecycle.
  The owner does not perform BA1: no `0001_1ba*` art, no attack, no BA1
  cooldown, no `chargeRelease`. While Charge stays held it remains in Charge,
  playing its normal `charge1 → charge2 → chargea ↔ chargeb` art (there is no
  summon pose). Once summoned, the clone is independent: the owner may release
  Charge (the normal release pose), jump, throw, use BA2, dodge, be hit or
  even be knocked out, and the clone still finishes appearing, attacking and
  vanishing, with no refund. It never retargets or summons again.
  The clone is not a Fighter (`js/game/clone.js`): it has no health, Energy,
  controller, pushbox, hurtboxes, defence, jump or coyote logic, physics or
  gravity, and it is not in `battle.fighters`. It is untargetable, takes no
  part in fighter separation or solid collision (the opponent can move
  through it), is ignored by the camera (framing still uses P1 and the CPU)
  and has no marker, name, ring, shadow, health or Energy bar. Its position
  and facing are snapshotted once, on the summon step: on the opponent's back
  side (`x = target.x − target.facing × 48`, clamped inside the stage's
  horizontal bounds), at the opponent's foot height (a target on a platform
  or airborne included), facing the way the opponent faced. It never moves,
  turns, chases or teleports after that, so an opponent who moves away before
  the punch makes it whiff. Lifecycle, all on fixed steps: APPEAR plays
  `cloneav1 → … → cloneav10` once at 20 fps (0.5 s), with no hitbox; the
  clone's first BA1 frame shows beneath the last cloud frame as the smoke
  clears. ATTACK plays one ordinary grounded BA1 from frame 1 with the owner's
  real sprites (`0001_1ba1 → 1ba2 → 1ba3 → 1ba4` at 12 fps, the same
  per-clip `sourceFacing` mirroring, no tint, transparency, outline or
  silhouette) and BA1's own definition (`attacks.ba1`: frame 1 startup, frame
  2 active, frames 3–4 recovery, 6 damage, 0.22 s hitstun, 0.14 s blockstun,
  0.06 s hitstop, 180 horizontal knockback), so its hitbox exists only on the
  active frame and hits at most once. VANISH removes the body and plays the
  same cloud backwards, `cloneav10 → … → cloneav1`, at the same 20 fps
  (0.5 s), with no hitbox; the clone is then removed. The clone's hitbox is
  resolved from the clone's own position and facing, never the owner's. A hit
  credits the owner as the attacker (the combat event also names the clone as
  its `summon`) and pushes the target along the clone's facing, away from the
  clone. It is a detached hit: the target gets BA1's hitstop and the clone
  pauses its own attack clock for the same 0.06 s, but the owner is never
  frozen (like a projectile's thrower). During a Dodge's invulnerable frames
  it passes through unspent (no damage, stun, knockback or hitstop) and can
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
  The debug overlay draws a clone's BA1 hitbox in the attack colour, labelled
  `clone ba1`, only on its active frame; a clone has no hurtboxes to draw.
- Charged BA2 Sphere Rush (#0001, `chargedTechniques.rasenRush`, runtime in
  `js/game/charged-technique.js`). Not a summon, a projectile, ordinary BA2
  or a big melee hitbox: #0001 himself changes animation, holds the sphere,
  dashes and makes contact, driven by a dedicated technique runtime with
  explicit phases (`form`, `dash`, `confirm`, `wait`, `explode`, `done`),
  never inferred from animation frames. It sets no `combat.attack`. Trigger:
  the shared charged-action rule with BA2 (`action2`: I, LB, touch **BA2**);
  no new control. Charge and BA2 pressed together from idle, or BA2 pressed
  on the step Charge is let go, is ordinary BA2 (8 damage, `2ba1`–`2ba7`,
  unchanged; mid-air BA2 `midair2ba1`–`3` likewise) with no release pose.
  Grounded only (Charge is too). Once started it owns the fighter and Charge
  no longer needs to be held; it ends only by a miss, a wall, ground loss, a
  hit on #0001, a blocked contact, a knockout, completion or a reset. Sprite
  partitioning:

  | Frames | Clip | Role |
  | --- | --- | --- |
  | `rasen1`–`3` | `rasenForm` | preparation |
  | `rasen4`–`6` | `rasenDash` | dash / contact search |
  | `rasen7`–`12` | `rasenConfirm` | hit-confirm continuation |
  | `prasen1`–`6` | `rasenSphereBuild` | sphere formation |
  | `prasen7`–`9` | `rasenSphereImpact` | confirmed sphere |
  | `prasen10`–`11` | `rasenSphereExplosion` | explosion |

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
     fixed-step physics (≈262 units at most; stage bounds, solids and ground
     respected; player left / right ignored). The complete `prasen6` stays
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
     `rasen6`, or a solid wall or stage edge reached first (no pass-through),
     is a miss: no hit, bind, `rasen7`–`12` or `prasen7`–`11`; the sphere
     is removed, the rush stops dead (no slide) and #0001 is back in Idle /
     normal control on the next step.
  3. CONFIRM (from the contact step): the rush stops at once (`vx` 0, no
     sliding through). Hit 1 of 2, applied exactly once through
     `CombatSystem.applyHit`: 4 damage (100 → 96), no knockback or launch,
     0.2 s hitstun, 0.15 s blockstun, 0.06 s hitstop on the target only.
     The target is then bound (below) with its horizontal speed zeroed, the
     sphere moves from the hand onto it (centre at the target's origin +
     (0, −48), over its body, following it every step) and plays
     `prasen7 → prasen8 → prasen9` once, then holds `prasen9`, while #0001
     plays `rasen7 → … → rasen12` exactly once from the same step.
  4. WAIT: #0001 holds `rasen12`, committed (no movement, attack, summon,
     Dodge, Throw, jump or Charge), and the bound target holds with the
     sphere on it.
  5. EXPLODE: exactly 2.0 s (`explosionDelay`, 120 steps) after the
     contact step, counted from the hit, never from formation: the sphere
     plays `prasen10 → prasen11` once, and on the step `prasen10` first
     shows the target is released from the bind and then takes hit 2: 16
     damage (96 → 80; 20 in all), knockback 420 along the rush and a 220
     launch, 0.55 s hitstun, 0.12 s hitstop (twice the first hit's), 0.3 s
     blockstun. Releasing first keeps the bind from cancelling the launch.
  6. DONE: after `prasen11` the sphere is removed and the technique cleared;
     #0001 returns to Idle / normal control. Exactly two damage events for a
     full sequence. A Charge still held does not restart by itself: it has to
     be let go and held again.
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
  mid-dash (running off a ledge; no hover over the gap, no snap back) or
  after the hit cancels the technique on that step: sphere removed, any bind
  released at once (hit 1's damage stays, hit 2 never happens) and #0001
  enters Fall, straight down. A hit on #0001 in any phase cancels it the same
  way and shows the normal Hurt (no armour, no invulnerability). A Dodge's
  invulnerable frames let the rushing sphere pass without a hit, damage,
  bind or use of the sphere; the search continues and may still connect
  after them, otherwise it is a miss. A Block-type guard (future fighters)
  facing the rush blocks the contact with the normal chip damage and
  blockstun; then there is no bind or explosion and the technique ends. A
  first hit that knocks the target out ends it at once (no bind, no
  explosion), as does the target being knocked out or losing its bind
  meanwhile. Before starting, the technique requires all three fighter clips
  and all three sphere effects (and valid data); anything missing logs a
  warning and the same press becomes an ordinary BA2: never a sphere around
  the wrong pose, an invisible sphere, bind or delayed hit. Energy cost 0
  (`energyCost` is data-ready; nothing is drained, refunded or gained). The
  sphere is drawn over both fighters (terrain, shadows, clones, CPU, P1,
  sphere, projectiles, foreground), centred at the fighters' art-pixel
  scale with image smoothing off, never mirrored. Restart / rematch
  (`Fighter.reset`) and leaving the battle end any technique, its sphere,
  bind and pending explosion, and drop its owner and target references. The
  debug overlay draws the rushing sphere's hitbox as a dashed cyan box
  labelled `charged ba2 dash`, then a dashed cyan cross on the attached
  sphere's centre, and labels a bound fighter `bound`.
- Every fighter has an Energy resource (`energy` / `maxEnergy` on its combat
  state, capacity from the character's `stats.energy`, 100 for #0001). It
  starts full and refills on restart / rematch. It changes only through the
  combat state's `canSpendEnergy` / `spendEnergy` helpers, and #0001's
  Charged BA1 Clone Attack (25) is the only thing that spends it. There is no
  Energy regeneration or gain: Charge, hits, Dodges and time generate none,
  and BA1, BA2, Throw, Defense and the Charged BA2 Sphere Rush cost none. The winner is still decided by
  remaining health.
- Physics: acceleration, deceleration, max speed, gravity, jump impulse,
  ground/platform/solid collision, stage bounds, landing detection; collision
  boxes independent of PNG size; bottom-centre origin; no sinking, floating,
  jitter or escaping the stage.
- Combat architecture (health, damage, hitboxes, hurtboxes, attack definitions,
  Defense with Block / Dodge implementations, invulnerability, knockback,
  stun and blockstun, hitstop, cooldowns, Energy, binds, charged actions,
  summons and charged techniques) is data-driven. Basic Attacks 1 and 2,
  Throw (with its shuriken projectile), the Charged BA1 Clone Attack (a
  summoned clone performing BA1) and the Charged BA2 Sphere Rush (a charged
  technique) are implemented through it with real artwork; Special stays reserved
  (mapped to no attack) until real sprites exist, and no attack, projectile,
  clone or frame is ever fabricated. An attack whose frames fail to load is
  refused (no substitute pose, no invisible hitbox), and so is a Dodge, and so
  is a clone summon whose cloud or attack art is missing (nothing is spent),
  and so is a charged technique with any of its clips missing.
- Quick Battle: one round, 99 seconds, against a non-attacking training CPU
  that uses the same fighter definition. It never attacks, throws, charges,
  summons clones, uses the Sphere Rush or uses Defense (while bound, its
  input is simply ignored);
  it drops through one-way platforms with an internal intent that no player
  control produces.

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
- HUD fighter panels: P1 (filled white tag) top-left and CPU (outlined tag)
  top-right, identical glass, each with, in order, the tag and fighter name,
  a green health bar, and a blue Energy bar directly beneath it. There are no
  subtitle rows. Both health bars use the Alva green (`--accent`) with a
  lower-opacity green delayed-damage layer; tags and names, not colour, tell
  the fighters apart.
- Energy bars (`role="meter"`, `aria-label="Energy"`, reporting the fighter's
  real energy against its maximum) are the same width as health and slightly
  shorter, with the same track, and one solid `--energy` blue fill with no
  delayed-damage layer. Both P1 and CPU show one, both start full, and the CPU's
  fills from the right like its health bar. Blue here is a deliberate
  gameplay-resource exception to the green-only interface accent (5.1). The
  meter changes the moment Energy is spent (each Clone Attack drops it by a
  quarter: 100 % → 75 % → 50 % → 25 % → 0 %; the Sphere Rush never moves
  it); no Energy gain is implemented yet.
- Timer + pause: one glass control at top centre. The round label and timer
  sit on top; a rectangular pause section sits directly beneath with no gap,
  the same width and a hairline seam, so only the outer corners are rounded.
  Both halves are buttons that pause the game; the timer half is labelled
  "Pause game, N seconds remaining". For the last ten seconds only the digits
  change, from a slightly softened off-white to pure white; the glass never
  changes colour, inverts or flashes.
- Player markers above fighters and ground rings: P1 white, CPU gray.
- Round banners ("ROUND 1", "FIGHT", "TIME") in white on a dark band.
- Pause menu: glass panel over a dimmed battle with "Quick Battle" (no stage
  name), "Paused", green **Resume** (default), **Restart Battle**, **Help** and
  **Return to Home**. Help is shown but disabled for now: muted, no hover or
  press response, skipped by keyboard/gamepad focus.
- Time over: if one fighter has more health, a glass result menu offers green
  **Rematch**, **Change Stage** and **Return to Home**. A draw opens no dialog;
  once the TIME banner has played, a fresh battle starts.

### 7.4 Input

- Keyboard (simultaneous keys, held-state tracking, no reliance on key
  repeat): A/D or ←/→ move, S/↓ Charge (held), W/Space/↑ jump, J Throw (the
  internal `primary` action), K Special (reserved), L Defense, U Basic
  Attack 1 (BA1), I Basic Attack 2 (BA2), Esc/P pause (the Practice menu in
  Practice Ground). `` ` `` toggles a
  debug overlay (colliders, hurtboxes, attack hitboxes while active, each
  flying projectile's hitbox in magenta with its name, each clone's BA1
  hitbox, labelled `clone ba1`, on its active frame, and the Sphere Rush's
  dashed cyan sphere box / centre with a `bound` label on a caught fighter).
  BA1 pressed while Charge is still held is the Charged BA1 Clone Attack
  and BA2 the Charged BA2 Sphere Rush (7.2): no extra key. In menus S/↓ still navigate down: menu bindings are separate
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
