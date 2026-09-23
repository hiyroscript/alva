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
  restrained neutral shadows. No new textures or glass effects.

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
- No streaks, wipes or large hover translations. Home alone has subtle
  continuous lane motion and a restrained bloom around its stable green slash.
- `prefers-reduced-motion: reduce` removes transitions and animation, and the
  Home road lanes remain still.

### 5.6 Game content exception

The dark/green palette covers interface chrome: menus, buttons, cards, overlays,
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
  until the fade completes) for a seamless dark transition. The page and browser
  theme stay dark before boot, during the splash and throughout navigation.
- Reduced motion: no fades, short hold.
- No wordmark or logo animation on the splash.

### 6.2 Home

An open editorial composition with a full-screen near-black background:

- **Header:** quiet small ALVA mark and mono "Build x.y.z" label.
- **Intro:** muted uppercase "2D sprite fighting game", dramatically enlarged
  original ALVA SVG wordmark, then one short supporting line.
- **Actions:** exactly two — **Play** (green, white text, arrow) opens Select
  Mode; **Help & Credits** (restrained secondary, chevron) opens Help & Credits.
  Play is focused by default. Home buttons have a small 3 px radius.
- **Road:** decorative HTML/CSS, `aria-hidden`, roughly the right 44% on wide
  screens, angled 21 degrees and extended beyond the viewport. Charcoal asphalt,
  subtle pale lane markings on a 1.8 s cycle, and dark top/bottom fades. A stable
  3 px green slash follows the road's left edge. No fighter preview or Canvas.
- **Footer:** "by hiyroscript" and existing keyboard hints (hidden on touch-first
  devices), gray typography and a subtle top hairline.
- **Responsive:** safe-area-aware, no Home scrolling. On narrow layouts the road
  moves farther off-screen but remains a background strip. Short landscape
  heights reduce title size, gaps and action height while retaining meaningful
  content. Reduced motion stops decorative lane and entrance animations.
- All other screens retain their layout, structure, spacing and behaviour.

### 6.3 Select Mode

- Header "Select Mode" with setup steps (Mode · Fighter · Stage).
- One large Quick Battle card (art area with two neutral fighter silhouettes,
  name, description "Choose a fighter and stage, then enter battle.", green
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
- Stage details sit in a dark information card over the preview.
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
