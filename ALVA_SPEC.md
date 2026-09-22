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
- `assets/favicon.svg` holds the Alva "A" monogram.

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

Alva's interface is **white-dominant and strictly monochrome**: white, black
and grays. There is **no accent hue** — no orange, blue, purple, green, red or
gold in the interface. Emphasis comes from contrast, weight, borders, shape and
spacing.

| Token | Value | Use |
| --- | --- | --- |
| `--bg`, `--surface` | `#ffffff` | Page and panel backgrounds |
| `--surface-subtle` | `#f7f7f7` | Quiet surfaces, preview stages |
| `--surface-muted` | `#efefef` | Pressed states, tracks |
| `--text` / `--text-strong` | `#111111` / `#000000` | Body text / headings |
| `--text-secondary` | `#5c5c5c` | Supporting copy |
| `--text-muted` | `#737373` | Labels, meta (≥ 4.5:1 on white) |
| `--text-faint` | `#a6a6a6` | Decorative / unavailable only |
| `--border` / `--border-strong` | `#e4e4e4` / `#cccccc` | Dividers / control outlines |
| `--ink` | `#111111` | Primary action fill |
| `--focus-ring` | `0 0 0 2px #fff, 0 0 0 4px #000` | Keyboard/gamepad focus |

Exact neutrals may be refined for contrast, but the system stays monochrome.

### 5.2 Component rules

- **Primary action:** black fill, white text, medium radius; hover slightly
  lighter; pressed darker with a slight scale.
- **Secondary action:** white fill, black text, gray border; hover light gray.
- **Selected:** black border (2 px), light-gray surface where useful, and a
  black check mark or filled indicator.
- **Focus:** the black focus ring (white offset on light surfaces). Never
  colour alone.
- **Progress:** black fill on a pale-gray track.
- **Tabs:** active tab black text with a black underline; inactive gray.
- **Setup steps:** done = gray with a check; current = black, filled number,
  black underline; future = light gray.
- **Panels:** white, thin `#e4e4e4` border, restrained radius (8/12/18 px),
  at most a soft neutral shadow. No textures, grids or glows.

### 5.3 Wordmark and favicon

- The wordmark reads **ALVA**, drawn from original geometric SVG letterforms
  (`js/ui/logo.js`): bold, uppercase, evenly and optically spaced, no skew, no
  shadows, no effects. It inherits `currentColor`.
- It is used in the Home header (small), the Home title (large) and the loading
  overlay. The SVG exposes `role="img"`, `aria-label="ALVA"` and a `<title>`;
  repeated decorative copies are `aria-hidden`.
- Favicon: white rounded square, thin gray outline, black "A" monogram.

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
- No streaks, wipes, glows, constant ambient animation or large hover
  translations.
- `prefers-reduced-motion: reduce` removes transitions and animation, and the
  Home fighter preview holds a still frame.

### 5.6 Game content exception

The monochrome rule covers interface chrome: menus, buttons, cards, overlays,
focus/selection states, HUD accents and decoration. **Character sprites and
stage artwork are game content** and keep their own colours (e.g. the City's
warm neon lighting and the Desert's sunset). Do not grayscale gameplay art to
fit the palette.

## 6. Screens and flow

```
Splash → Home → Select Mode → Select Fighter → Select Map → Battle
Home → Help & Credits
Battle → Pause → Resume / Restart / Help / Return to Home (confirmed)
Battle (time over) → Result → Rematch / Change Stage / Return to Home
```

Every menu screen except Home has a consistent Back action. Keyboard, mouse,
touch and gamepad all navigate menus with one shared highlight (mouse hover
moves focus).

### 6.1 Splash

- Black screen; "a game by hiyroscript" (exact wording) fades in near the
  bottom centre in soft gray with generous letter spacing, holds, fades out.
- Total ≈ 2.5–3.5 s; any key or tap skips.
- Home then dissolves in over the black (the splash stays mounted underneath
  until the fade completes) so the change to the white interface is deliberate,
  never a flash. The page background is black before boot and during the splash.
- Reduced motion: no fades, short hold.
- No wordmark or logo animation on the splash.

### 6.2 Home

An application-style shell, centred with a maximum content width of ≈ 1160 px:

- **Header:** small ALVA wordmark (left), "Build x.y.z" pill (right), thin
  divider below.
- **Intro column:** eyebrow "2D sprite fighting game", the large ALVA wordmark
  as the page heading, one short line of supporting copy, then the actions.
- **Actions:** exactly two — **Play** (primary, black, arrow icon) opens Select
  Mode; **Help & Credits** (secondary, outlined, chevron) opens Help & Credits.
  Play is focused by default. No numbering, no arcade styling.
- **Fighter preview:** a contained light-gray card on the right showing the
  current fighter's idle loop as a charcoal silhouette with a soft ground
  shadow and a small caption (name · Idle). Uses the already-loaded,
  normalized sprite set; tinted once; pixelated; DPR-aware; supporting, never
  dominant. It stays invisible if the frames are unavailable.
- **Footer:** "by hiyroscript" and keyboard hints (hidden on touch-first
  devices), small gray text above a thin divider.
- Responsive: two columns on wide screens; tighter spacing and a smaller
  preview on tablets; on short phone landscape the eyebrow, then the supporting
  copy and caption, drop out so the wordmark, Play and Help & Credits always fit
  without scrolling; stacked layout on tall desktop windows.

### 6.3 Select Mode

- Header "Select Mode" with setup steps (Mode · Fighter · Stage).
- One large Quick Battle card (art area with two neutral fighter silhouettes,
  name, description "Choose a fighter and stage, then enter battle.", black
  Select action) in a rail built for future modes, plus a details panel
  (format, rounds, timer, opponent, how it works).
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
- Stage details sit in a white information card over the preview.
- "Start Battle · <Stage>" primary action.

### 6.6 Help & Credits

- Two tabs (Help, Credits) sharing one scrollable panel; ←/→ switch tabs,
  ↑/↓ scroll.
- Help: desktop controls rendered from the live key bindings, mobile control
  diagram, movement, stages and platforms, pause, notes on this build.
- Credits (must remain visible and readable):
  - **Alva** — created by hiyroscript; game design, code, interface, the Alva
    wordmark and the Desert and City stage art are original work for Alva.
  - **#0001 sprite source** — Naruto Uzumaki; *Jump Ultimate Stars*; Nintendo
    DS / DSi; The Spriters Resource; source sheet uploaded by Dazz; contributor
    FRET. hiyroscript did not create the original Naruto artwork and does not
    own the Naruto or Jump Ultimate Stars intellectual property.
  - **Rights** — original characters, games and related properties belong to
    their respective rights holders.
- Never imply ownership of Naruto, Jump Ultimate Stars, Nintendo IP or The
  Spriters Resource material.

### 6.7 Loading and dialogs

- Loading overlay: white background, small ALVA wordmark, black label
  ("Loading #0001"), pale-gray track with black progress fill; shown after a
  short delay so instant loads don't flash.
- Error state: readable message, black **Retry** and outlined **Back**.
  Battle never starts before its sprites are ready.
- Confirmation dialog (`alertdialog`, modal): white panel, subtle border and
  shadow, black title, gray message, outlined cancel and black confirm.
  Returning Home from a battle is always confirmed.
- Portrait on touch devices: a white "Rotate your device — Alva is designed for
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
  the same monochrome rules: translucent black HUD panels, white labels, gray
  secondary text.
- HUD: P1 (filled white tag, white health bar) top-left; CPU (outlined tag,
  gray health bar) top-right; round label and timer top-centre. The timer
  inverts (white block, black digits) for the last ten seconds.
- Player markers above fighters and ground rings: P1 white, CPU gray.
- Round banners ("ROUND 1", "FIGHT", "TIME") in white on a dark band.
- Pause and result menus are white Alva panels over a dimmed battle with a
  black primary action (Resume / Rematch).

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
