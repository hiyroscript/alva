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
  three Dodge frames `0001_dodge1`–`0001_dodge3` (≈256–288 × 384–416 px)
  and three mid-air Dodge frames `0001_midairdodge1`–`0001_midairdodge3`
  (≈288–320 × 376–400 px). `0001_dodge3` happens to be the same image as
  `0001_charge1`; it is kept under its own name as the Dodge's recovery
  frame.
- File names: `ba` means basic attack; the digit before it says which one
  (`1ba` is Basic Attack 1, `2ba` Basic Attack 2). The number at the very end
  is always the frame number (`0001_1ba3.png` is Basic Attack 1, frame 3;
  `0001_midair2ba1.png` is Mid-air Basic Attack 2, frame 1). Charge is the
  exception: `charge1` / `charge2` are its startup frames and the lettered
  `chargea` / `chargeb` its sustained loop; `charge1` is also reused, as the
  same file, for the Charge release pose.
- The idle, jump, fall, land and hurt frames (≈16× pixel art), the mid-air
  hurt, Basic Attack 1 and 2, Charge and Dodge frames (≈8×) and the run frames (≈4×)
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
Home → Help & Credits (the Home entry is disabled for now)
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
  Mode and is focused by default; **Help & Credits** (chevron) stays visible but
  is a genuinely disabled button for now: muted gray label and outline, no
  hover or press response, skipped by keyboard/gamepad focus. The pause-menu
  Help is disabled the same way (7.3); the Help & Credits screen and the pause
  Help view remain in place. Home buttons have a small 3 px radius.
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
  diagram, movement, Charge & Energy, Defense, stages and platforms, pause,
  notes on this build.
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
- Confirmation dialog (`alertdialog`, modal): battle glass panel (7.3) with the
  dimmed battle visible behind it, off-white title, gray message, outlined
  cancel (**Keep Playing**, focused) and green confirm (**Return Home**).
  Returning Home from a battle is always confirmed; cancelling returns focus
  to the pause menu.
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
  seven one-way platforms that fighters jump up through from below. The
  player has no drop-through control and walks off an edge to come down; the
  training CPU can drop through all of them except the water-tower deck.
- Collision comes only from map data, never from art.
- The camera frames both fighters, interpolates smoothly and never shows
  outside the map. Fighters occupy ≈ 14–18 % of viewport height.

### 7.2 Fighters, physics and combat

- `#0001` has Idle, Run, Jump, Fall, Land, Hurt, Mid-air Hurt, Basic Attack 1,
  Mid-air Basic Attack 1, Basic Attack 2, Mid-air Basic Attack 2, Charge,
  Dodge and Mid-air Dodge.
  No invented frames. Rising uses Jump and
  descending (walking off a ledge included) uses Fall; each plays once at 10 fps
  and holds its last frame. Land plays once at 12 fps on touchdown, for
  exactly the clip's length, then returns to idle or run. Land is a visual
  state only: it never changes movement or collision, and a new jump, attack
  or hitstun cuts it short. If those frames fail to load, the fighter holds an
  idle frame without stretching or rotating. Facing flips the sprite and turns
  toward the opponent when standing.
- Hitstun shows Hurt while grounded and Mid-air Hurt while airborne, switching
  to Hurt if the fighter lands still stunned; the pose also holds through the
  impact freeze. Hitstun outranks every other state (attack, Defense, jump,
  fall, land, charge, charge release, run and idle), and normal states resume
  when it ends. It is a visual state only:
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
  interruptions (a hit, BA1, BA2, a Dodge, a jump, leaving the ground) do not
  play `chargeRelease` first, and letting go of Charge on the same step as
  one of them goes straight to it. The release pose is visual only: no
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
  priority is hitstun > attack > Defense (Dodge) > jump / fall > land >
  charge > charge release > run > idle (a Block-type guard would sit between
  land and charge): a hit shows Hurt at once, BA1 / BA2 start straight out of
  a held Charge, Jump interrupts it, and a Defense press interrupts it with a
  Dodge. If Charge is still held when that Dodge ends, a fresh Charge starts
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
- Every fighter has an Energy resource (`energy` / `maxEnergy` on its combat
  state, capacity from the character's `stats.energy`, 100 for #0001). It
  starts full and refills on restart / rematch. No rule spends, drains or
  restores Energy yet, Charge and Dodge included, and the winner is still
  decided by remaining health.
- Physics: acceleration, deceleration, max speed, gravity, jump impulse,
  ground/platform/solid collision, stage bounds, landing detection; collision
  boxes independent of PNG size; bottom-centre origin; no sinking, floating,
  jitter or escaping the stage.
- Combat architecture (health, damage, hitboxes, hurtboxes, attack definitions,
  Defense with Block / Dodge implementations, invulnerability, knockback,
  stun and blockstun, hitstop, cooldowns) is data-driven. Basic Attacks 1
  and 2 are implemented through it with real artwork; Primary and Special
  stay reserved (mapped to no attack) until real sprites exist, and no attack
  or frame is ever fabricated. An attack whose frames fail to load is refused
  (no substitute pose, no invisible hitbox), and so is a Dodge.
- Quick Battle: one round, 99 seconds, against a non-attacking training CPU
  that uses the same fighter definition. It never charges or uses Defense;
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
  gameplay-resource exception to the green-only interface accent (5.1); no
  Energy gain or spending is implemented yet.
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
  repeat): A/D or ←/→ move, S/↓ Charge (held), W/Space/↑ jump, J primary, K special,
  L Defense, U Basic Attack 1 (BA1), I Basic Attack 2 (BA2), Esc/P pause.
  `` ` `` toggles a debug overlay (colliders, hurtboxes, and attack hitboxes
  while active). In menus S/↓ still navigate down: menu bindings are separate
  from the gameplay `charge` action.
- Gamepad (standard layout) for movement (D-pad / left stick left and
  right), Charge in battle (D-pad down / left stick down, held; menus still
  read them as Down), jump (A), Basic Attack 1 (B / Circle), Basic Attack 2
  (LB), reserved actions (X / Y), Defense (RB / RT) and Start to pause/menus.
- Touch (landscape, Pointer Events, true multi-touch): lower-left
  Left · C · Right with thumb sliding, where the middle button reads **C**, is
  labelled "Charge" and stays pressed for as long as the pointer holds it;
  lower-right staggered cluster —
  Primary (top) · Special, Defense · BA1, BA2, Jump (bottom-right). The
  Defense button sits in the old Block slot; it reads exactly **D** (no
  shield icon) because #0001's Defense is a Dodge, and is labelled "Defense".
  The BA1 button (Basic Attack 1, internally `action1`) and the BA2 button
  (Basic Attack 2, internally `action2`) are solid like Defense and Jump.
  Tapping the timer or the pause section beneath it (top centre, 7.3) pauses.
  Original circular icons, translucent dark fill, white outlines; pressed
  buttons scale down and brighten to white — no hue.
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
