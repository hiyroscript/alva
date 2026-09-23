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
  (≈560–592 × 800–832 px) and six run frames (≈128–160 × 184–188 px).
- The idle and run frames are at very different raw scales. A normalization
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
  machine, controllers (player / training AI), physics, camera, combat, HUD,
  touch controls, stage themes.
- Data-driven content: `js/data/characters.js` and `js/data/maps.js`. Adding a
  fighter means adding frames, a definition and a roster slot — never editing
  engine code.
- Simulation uses fixed 60 Hz steps with interpolated rendering and a clamped
  frame delta, so behaviour is identical at 30, 60 and 120 Hz.

## 5. Brand identity

### 5.1 Palette

Alva's interface is **near-black/charcoal dominant**, with off-white typography,
gray hierarchy and **green as the sole interface accent**. It follows Seren's
visual discipline without copying its assets. Green signals actions, selection
and progress; it does not fill every card, border or heading.

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
  restrained neutral shadows. No new textures or glass effects; the Home
  credits strip (6.2) is the one glass surface.

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
Splash → Home → Select Mode → Select Fighter → Select Map → Battle
Home → Help & Credits (the Home entry is disabled for now)
Battle → Pause → Resume / Restart / Help / Return to Home (confirmed)
Battle (time over) → Result → Rematch / Change Stage / Return to Home
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
  Mode and is focused by default; **Help & Credits** (chevron) stays visible but
  is a genuinely disabled button for now: muted gray label and outline, no
  hover or press response, skipped by keyboard/gamepad focus. The Help &
  Credits screen and the pause-menu Help remain in place. Home buttons have a
  small 3 px radius.
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
- Preview panel: animated idle/run preview in original colours, availability
  badge, animation chips (Idle / Run), frame facts, "Confirm #0001" primary
  button. Keyboard/gamepad activation confirms immediately; pointer selects
  first and confirms on a second press.

### 6.5 Select Map

- Two stages, **Desert** and **City**, with a large live preview (idle fighters
  at the spawns, gentle camera pan) and selectable cards with thumbnails.
- Stage details sit in a dark information card over the preview.
- "Start Battle · <Stage>" primary action.

### 6.6 Help & Credits

- Two tabs (Help, Credits) sharing one scrollable panel; ←/→ switch tabs,
  ↑/↓ scroll.
- Help: desktop controls rendered from the live key bindings, mobile control
  diagram, movement, stages and platforms, pause, notes on this build.
- The Home entry to this screen is disabled for now; the screen stays in place
  so it can return.
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
- Confirmation dialog (`alertdialog`, modal): dark panel, subtle border and
  shadow, off-white title, gray message, outlined cancel and green confirm.
  Returning Home from a battle is always confirmed.
- Portrait on touch devices: a dark "Rotate your device — Alva is designed for
  landscape play." overlay; the battle pauses and resumes correctly on return
  to landscape.

## 7. Battle

### 7.1 Stages and camera

- Stages are 2.5–4 viewport widths wide, drawn procedurally as six parallax
  layers (sky, far, mid, near, terrain, atmosphere) cached as `Path2D`.
- **Desert:** wide, bright, open; mesas, rock formations, sunset haze, drifting
  sand; two rock outcrops to hop onto.
- **City:** rooftops at night; dense skyline, vents, girders, warm neon;
  seven one-way platforms (Down drops through) and a solid water-tower deck.
- Collision comes only from map data, never from art.
- The camera frames both fighters, interpolates smoothly and never shows
  outside the map. Fighters occupy ≈ 14–18 % of viewport height.

### 7.2 Fighters, physics and combat

- `#0001` has only Idle and Run. No invented frames; jumping uses the idle pose
  without stretching or rotating; facing flips the sprite and turns toward the
  opponent when standing.
- Physics: acceleration, deceleration, max speed, gravity, jump impulse,
  ground/platform/solid collision, stage bounds, landing detection; collision
  boxes independent of PNG size; bottom-centre origin; no sinking, floating,
  jitter or escaping the stage.
- Combat architecture (health, damage, hitboxes, hurtboxes, attack definitions,
  block, knockback, stun, cooldowns) exists but no attack is fabricated until
  real sprites exist. Block sets a guard state using the idle pose.
- Quick Battle: one round, 99 seconds, against a non-attacking training CPU
  that uses the same fighter definition.

### 7.3 Battle chrome

- The battle keeps deliberate dark chrome over the stage for legibility, using
  the same neutral hierarchy: translucent black HUD panels, white labels, gray
  secondary text.
- HUD: P1 (filled white tag, white health bar) top-left; CPU (outlined tag,
  gray health bar) top-right; round label and timer top-centre. The timer
  inverts (white block, black digits) for the last ten seconds.
- Player markers above fighters and ground rings: P1 white, CPU gray.
- Round banners ("ROUND 1", "FIGHT", "TIME") in white on a dark band.
- Pause and result menus are dark Alva panels over a dimmed battle with a
  green primary action (Resume / Rematch).

### 7.4 Input

- Keyboard (simultaneous keys, held-state tracking, no reliance on key
  repeat): A/D or ←/→ move, S/↓ down, W/Space/↑ jump, J primary, K special,
  L block, U action 1, I action 2, Esc/P pause. `` ` `` toggles a debug overlay.
- Gamepad (standard layout) for movement, jump, reserved actions, block and
  Start to pause/menus.
- Touch (landscape, Pointer Events, true multi-touch): lower-left Left / Down /
  Right with thumb sliding; lower-right staggered cluster —
  Primary (top) · Special, Block · Action 1, Action 2, Jump (bottom-right);
  round Pause top-right. Original circular icons, translucent dark fill, white
  outlines; pressed buttons scale down and brighten to white — no hue.
  Reserved actions use dashed outlines and never show nagging alerts.
- Touch controls appear only on touch-first devices (coarse pointer or an
  observed touch), never merely because a desktop window is narrow.
- Gameplay pauses when the pause menu is open, the tab is hidden, or the device
  is blocked in portrait.

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
