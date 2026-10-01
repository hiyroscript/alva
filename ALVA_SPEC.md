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
  one helper (`frames` / `framePath` in `js/data/characters.js`), from the
  character's id.
- `#0001` frames live in `assets/characters/0001/`: four idle frames
  `0001_idle_1`–`4` (≈560–592 × 800–832 px), six run frames `0001_run_1`–`6`
  (≈128–160 × 184–188 px), two each of jump (624 × 816 px), fall
  (544 × 832 px) and land (≈528–544 × 560–688 px), one hurt frame
  `0001_hurt_1` (608 × 752 px), one mid-air hurt frame
  `0001_midair_hurt_1` (424 × 272 px), four attack1 frames (the punch)
  `0001_attack1_1`–`0001_attack1_4` (≈264–376 × 392–432 px), three
  midair_attack1 frames (the kunai slash)
  `0001_midair_attack1_1`–`0001_midair_attack1_3` (≈216–352 × 424–536 px),
  seven attack2 frames (the kick) `0001_attack2_1`–`0001_attack2_7`
  (≈224–336 × 384–424 px), five midair_attack2 frames (the airborne kick)
  `0001_midair_attack2_1`–`0001_midair_attack2_5` (≈248–424 × 344–448 px),
  three extra_attack frames (the
  Throw) `0001_extra_attack_1`–`0001_extra_attack_3` (≈280–312 × 360–376 px),
  twelve attack4 (Sphere Rush) poses `0001_attack4_1`–`0001_attack4_12`
  (≈64–110 × 80–104 px, ≈2× pixel art), two mouvment (Dash) frames
  `0001_mouvment_1` (47 × 41 px) and `0001_mouvment_2` (48 × 40 px) and
  four single Shield frames, all drawn at 1× (one file pixel per art
  pixel): `0001_prepshield_1` (35 × 51 px, the guard being raised),
  `0001_shielding_1` (36 × 47 px, the held guard), `0001_releaseshield_1`
  (39 × 45 px, the guard lowered) and `0001_midair_shielding_1`
  (26 × 49 px, the held guard in the air, its only mid-air Shield frame).
  All four face right. The old Dodge frames (`0001_dodge_1`–`3`,
  `0001_midair_dodge_1`–`3`) are still in the folder, named by the same
  rule, but are no longer registered or loaded: Dodge was removed.
- Every one of #0001's files was renamed to this rule byte for byte (a
  plain rename: no image was re-encoded, and the tests check each file's
  SHA-256 against the original upload). No file under an older name
  remains, and no code or data refers to one.
- The four Clone Attack startup poses, `0001_attack3_summon_1`–`_4`
  (288 / 288 / 280 / 272 × 416 px, 8× pixel art like #0001's other poses),
  are one one-shot fighter clip, `attack3_summon` (10 fps, never looped):
  #0001 squaring up, bringing his fists in, then holding the hand seal that
  summons the clone. They are the four poses of the retired held Down
  stance, recovered byte for byte from the repository's history (commit
  538d73a, the tests check each file's SHA-256 and git blob id) and
  renamed for Attack 3: its two startup poses became `_1` and `_2`, its two
  held poses `_3` and `_4`, and they now play once, in that order. The
  stance itself is gone for good; only its art was reused.
- The twelve Sphere Rush poses are fighter poses, registered as logical
  one-shot clips in `animations` rather than one blind animation, each with
  one role: `attack4_form` (`attack4_1`–`attack4_3`, formation: the rear palm opens
  for the sphere), `attack4_dash` (`attack4_4`–`attack4_6`, the rush: the sphere
  carried behind, swung forward on `attack4_6`), `attack4_confirm`
  (`attack4_7`–`attack4_8`, the successful contact and stop; `attack4_8` is held
  while the sphere on the opponent spins and grows), `attack4_explosion`
  (`attack4_9` alone, the pose of the blast itself) and `attack4_release`
  (`attack4_10`–`attack4_12`, the release / recovery after the blast). A rush
  that catches nobody has its own one-frame `attack4_whiff_release`: `attack4_12`
  alone. That clip and `attack4_release` share the one `0001_attack4_12.png` (the
  same URL, preloaded once, never a copy on disk). They use the normal
  fighter normalization (bottom-centre anchor, fighter height, per-clip
  source facing, pixel-grid detection) and inherit the character's
  `sourceFacing: 1`.
- The same folder holds #0001's projectile art: three shuriken frames
  `0001_extra_attack_object_1`–`0001_extra_attack_object_3` (48–64 px square). They are the in-flight
  spin of one shuriken, not fighter poses and not three shurikens. They are
  registered apart from the fighter animations (`projectileAnimations`),
  preloaded with the character, and normalized and drawn separately: same
  grid detection, a centre anchor instead of bottom-centre, and the
  fighter's world-per-art-pixel scale, never fitted to the fighter's height.
- The same folder holds #0001's effect art: the clone appear / vanish cloud,
  ten frames `0001_attack3_object_1`–`0001_attack3_object_10` (≈38–210 × 36–132 px, ≈2×
  pixel art), a smoke puff that grows, fills out and then breaks into
  scattered wisps. Appearance plays them in forward order (`attack3_object_1 → … →
  attack3_object_10`); disappearance plays the same ten files in reverse order
  (`attack3_object_10 → … → attack3_object_1`), reversed at runtime, never duplicated or
  reversed on disk. They are registered apart from the fighter and projectile
  animations (`effectAnimations.attack3_object`), preloaded with the character,
  and normalized like projectile art (own art size, centre anchor, the
  fighter's world-per-art-pixel scale, never fitted to the fighter's height).
  The cloud is direction-neutral (`sourceFacing: 0`) and never mirrored. No
  file name has a space in it (an early upload's did; it was replaced).
- The same folder holds the Sphere Rush's blue sphere, eleven effect frames
  `0001_attack4_object_1`–`0001_attack4_object_11` (≈36–116 × 34–118 px, ≈2× pixel art),
  registered as three `effectAnimations` at 12 fps:
  `attack4_object_build` (`attack4_object_1`–`attack4_object_6`, energy gathering into the
  complete orb, once, 0.5 s), `attack4_object_impact` (`attack4_object_7`–`attack4_object_9`, the
  authored rotation of the orb spinning on the caught opponent, looped
  `7 → 8 → 9 → 7 → …`, 0.25 s a turn, `loop: true`; the technique draws it
  ever larger through the hold, since the frames' own sizes do not grow) and
  `attack4_object_explosion` (`attack4_object_10`–`attack4_object_11`, the lighter, brighter
  blast, once, ≈0.167 s; never part of the spin). Normalized like the clone
  cloud (own art size, centre anchor, the fighter's world-per-art-pixel
  scale, never fitted to the fighter's height): the complete `attack4_object_6` orb
  is 38 × 41 art pixels, ≈64 × 69 world units. Direction-neutral
  (`sourceFacing: 0`): the round orb is never mirrored, only its position
  offset follows facing. It is not a projectile. None of the 23 files is
  duplicated, and none remains at the repository root.
- `#0002` frames live in `assets/characters/0002/`: 85 frames cut from
  one supplied sprite sheet, each cropped tight to its art with the sheet's
  flat green background (0, 90, 20) made transparent and nothing else
  changed (1×, 8-bit RGBA, one file pixel per art pixel; the visual
  config forces `pixelSize: 1`, so no grid is looked for). Eight idle
  frames (the fighting stance, 29–30 × 38–39 px, the reference: 39 art
  pixels), twelve run frames (≤ 38 × 40), eight jump frames (the spin
  ball, 30 × 28–30, looped), one fall frame (arms spread, 35 × 48), four
  mouvment (Dash) frames (the figure-eight blur, 37–39 × 36), one hurt
  (34 × 42) and one mid-air hurt (38 × 32), one `shielding` guard (29 × 39),
  four attack1 frames (the One-Two), four attack2 frames (the Rapid Kicks,
  74–94 × 71–80 px: the kick trails reach far in front and below the
  standing foot), the eight ball frames again for each of midair_attack1
  (the Homing Attack), midair_attack2 (the Bounce Attack) and attack3 (the
  Spin Attack), four midair_attack3 frames (the Blue Tornado, 34–35 ×
  45–46), nine extra_attack frames (the Whirlwind, 29–56 × 37–39) and four
  extra_attack_object frames (the tornado it sends, the same drawing as
  the Blue Tornado's, as a projectile). Every clip is its own files, named
  for it, so the ball and the tornado are copies on disk under their own
  codenames. Everything faces right. No Land or mid-air Shield art.
  Each clip's `heightRatio` is its tallest frame over 39, so every frame
  normalizes at exactly one art pixel per file pixel, and `visual.height`
  (66 world units) puts #0002's art pixels at #0001's size (88 / 52 units
  each).
- Where automatic anchoring would drag the body, a clip authors its own
  anchors: `anchorX` (art pixels from the left of each frame's visible art)
  on #0002's ball and tornado (their own middle), Whirlwind (the body
  inside the wind) and One-Two (its planted feet), and `anchorY` (art pixels
  down from the top of each frame's art to the feet) on its Rapid Kicks,
  whose trails sweep below the standing foot: without it the bottom-anchored
  frame would lift the whole body off the ground by the trail's depth. A
  frame with no `anchorY` stands on the bottom of its art, as every other
  does (`drawFrame` draws it at `-anchorArtY`).
- `assets/characters/0001/` and `assets/characters/0002/` are the only
  fighter art in the repository, and any future fighter's frames go in a
  folder of its own id.
- Source orientation: #0001's art faces right (`sourceFacing: 1` on the
  character), every registered clip included. An animation may override
  the character's orientation with its own `sourceFacing` (none of #0001's
  does now); the normalized clip keeps it, and
  the renderer mirrors a frame only when the fighter's facing differs from
  its clip's `sourceFacing`. It is rendering metadata only: the fighter's
  facing, movement, hurtboxes and hitboxes never change with it. The Throw
  frames face right like the rest. The shuriken art is a four-point star
  spinning clockwise; it is mirrored when thrown left so it always rolls
  forward.
- The idle, jump, fall, land and hurt frames (≈16× pixel art), the mid-air
  hurt, attack1, attack2, extra_attack and extra_attack_object frames (≈8×),
  the run frames (≈4×), the clone cloud, Sphere Rush pose and sphere
  frames (≈2×) and the mouvment (Dash) and Shield frames (1×, whose grid cannot be
  detected, so each clip's `heightRatio` (the Dash's 41 / 52, the Shield's
  51 / 52, 47 / 52, 45 / 52 and 49 / 52) fits its tallest frame at exactly
  one art pixel per file pixel against idle's 52 art pixels)
  are at very different raw scales. A normalization
  system must, once per frame: read the alpha channel, find the visible bounds,
  detect the pixel-art grid, resample to one pixel per art pixel, and anchor
  bottom-centre so the fighter never grows, shrinks, jumps or slides when
  switching animations.
- Sprites render with `imageSmoothingEnabled = false` and, where the size
  allows, whole device pixels per art pixel.
- **Never redraw, recolour, replace or AI-generate the #0001 artwork** (or
  any fighter art supplied later). Do not
  download third-party art. Stage art is original and procedural.
- `alvafav.PNG` is the site favicon source.

## 4. Architecture

- One application controller (`App`) owns the managers, the
  `requestAnimationFrame` loop and cross-screen selection state.
- A screen manager swaps `<section>` screens with short CSS transitions (no page
  reloads); inactive screens are `hidden` and `inert`.
- Systems: asset loader, input (keyboard, touch, gamepad), menu navigator,
  device detection, audio stub, sprite normalizer/animator, fighter state
  machine, controllers (player / combat AI for Quick Battle and Watch Mode /
  training AI),
  physics, camera, combat, launch bounce,
  projectiles, summoned clones, techniques, HUD, touch controls
  (two layouts, each rearrangeable, 7.4), stage themes, fighter roster, the
  player's settings (`js/core/settings.js`, 6.10) and the interface
  language (`js/core/i18n.js`, 6.11), which `App` owns and applies to the
  whole page.
- One arena (`js/game/arena.js`) owns the fixed-step world and its Canvas
  rendering. `Battle` adds the combat-AI CPU at the chosen difficulty (in
  Watch Mode one on each side), phases and round timer; Practice Ground (`PracticeSession`)
  runs Player 1, and an optional training-dummy CPU, with none of them.
- Data-driven content: `js/data/characters.js`, `js/data/maps.js` (the Quick
  Battle stages), `js/data/practice-map.js` (the training stage) and
  `js/data/powers.js` (the Power tier tables, 7.2) and `js/data/launch.js`
  (the Base Launch values and Directional Launches, 7.2) and
  `js/data/difficulty.js` (the four CPU levels, 6.3a, used by Quick Battle
  and Watch Mode). Adding a fighter
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
drawn over fighters in battle (Energy bar, A3 / A4 rings, 7.3) uses no green,
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
- **Today one slot is selectable:** `#0001` in slot 01, selected and
  focused by default; the other 47 are locked. A fighter that is not
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
  - **#0001 sprite source** — original sprite material from *Jump Ultimate
    Stars*; The Spriters Resource; source sheet uploaded by
    Dazz; contributor FRET.
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
  the data, the file names nor the documentation name #0002's. Never imply ownership of
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
  at an opponent then do nothing or miss: attack3 has nobody to appear
  behind, so its press does nothing at all (no other attack instead) and
  starts no cooldown; the Sphere Rush
  dashes, finds no one and ends as a miss (after its `attack4_12` whiff release
  pose), its cooldown spent.
- **Practice CPU (on by default):** a training dummy, slot `p2`, labelled CPU, at
  the stage's second spawn (320 units right of Player 1's, facing it). It has
  no controller, so it never walks, jumps, drops, attacks, throws, summons
  or shields; it is otherwise a normal fighter (hurtboxes, real damage
  adding to its own Launch Point, so launching hits send it further as it
  builds up, hitstun, hurt animations, launches, gravity, stage and pushbox
  collisions, binds; it keeps its spawn's facing, never turning toward its
  opponent). With it, Player 1 and the CPU are
  each other's opponent, so clones, projectiles, the Sphere Rush and melee
  target it and the camera frames both. Each hit it takes shows the
  Launch Point it added (the CombatSystem's resolved hit event) in red over its
  head as a positive `+3`, `+1` or `+10`, rising and fading over 0.8 s;
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
  training state: its Launch Point back to 0, full Energy and not exhausted,
  its A3 / A4 cooldowns cleared (both abilities ready) and its velocity,
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
  the actions (Shuriken / `extra_attack`, Transform, Shield, Punch / `attack1`,
  Kick / `attack2`, Clone Attack / `attack3`, Sphere Rush / `attack4`,
  Jump; a numbered button the fighter does not have, such as `attack5`
  for #0001, stays hidden).
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
  lives in `js/core/i18n.js` (`STRINGS.en`, `STRINGS.fr`), looked up by
  stable key with `t(key, params)` (`{name}` placeholders; a placeholder may
  hold another key as `{ t: key }`; `plural(key, n)` follows each language's
  rules). Keys name what a string is for, never what it says, and a
  translated string is never an identifier. English game copy (Powers,
  Launch, difficulty levels, stage names and taglines, neutral control names,
  each fighter's own touch-button names) is read from the registries that
  own it, so it cannot drift; every key exists in both languages, and a key
  missing from French falls back to English. Internal identifiers (control
  and move codenames, character, map and scheme ids, CSS classes, data keys)
  and proper names (ALVA, #0001, Shuriken, the credited sources) never
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
  framed; its Energy bar, name tag and A3 / A4 rings go with it, its HUD card
  stays), and anything holding or aiming at it lets go. Every fighter taken
  on one step is out before any is handed on, so a simultaneous fall is one
  event. It is not geometry: nothing rebounds off it (see Launch bounce,
  7.2). After `CONFIG.battle.respawnSeconds` (2 s, counted on the
  simulation clock, never a timer) it is back at its own spawn (the usual
  reset onto the surface under it, never inside a solid) in a clean neutral
  state: 0 Launch Point, full Energy and not exhausted, A3 / A4 ready,
  no velocity, stun, freeze, attack, Shield, technique or Dash; it is active at
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
  (`CONFIG.render.fighterHeight`, #0001's 88 units) occupies ≈ 10 % of
  viewport height (8.8–11.5 %), whoever is picked, each fighter drawn at
  its own art scale, so a shorter or taller fighter simply stands shorter
  or taller on the same stage. A 16:9 view shows the whole main stage with air past both
  ledges, and narrower screens zoom out further for it.

### 7.2 Fighters, physics and combat

- **Roster and availability.** `CHARACTERS` (`js/data/characters.js`)
  holds two definitions today, `#0001` in roster slot 01 and `#0002` in
  slot 02, each fully implemented (everything below) and playable:
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
  own art folder, `rosterSlot` and `available: true`.
- **Attack loadout** (`js/data/loadout.js`). A fighter's attacks go by
  universal codenames, the same for every character: the numbered attacks
  `attack1` to `attack5`, each one's mid-air version `midair_attack1` to
  `midair_attack5`, one optional `extra_attack` (a throw, a projectile, a
  utility move of its own) and the reserved `transform`. What the player
  calls a move (#0001's Punch, Kick, Shuriken, Clone Attack, Sphere Rush)
  is its `abilityNames`, never its codename. The rules, checked for every
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
    `<attack>_object` (#0001's shuriken is `extra_attack_object`), a
    summon's cloud and a technique's sphere `<attack>_object...` effect
    clips, a technique's own poses `<attack>_...` (#0001's `attack4_form`
    to `attack4_whiff_release`), and the files follow (3).
  #0001 has four numbered attacks, all four its buttons: `attack1` (the
  Punch; `midair_attack1`, the kunai slash) and `attack2` (the Kick;
  `midair_attack2`, the airborne kick) are ordinary attacks, `attack3` (the
  Clone Attack) a summon and `attack4` (the Sphere Rush) a technique, and
  `extra_attack` is its Throw. It has no `attack5` button. #0002 has three
  numbered attacks: `attack1` (the One-Two;
  `midair_attack1`, the Homing Attack), `attack2` (the Rapid Kicks;
  `midair_attack2`, the Bounce Attack) and `attack3` (the Spin Attack;
  `midair_attack3`, the Blue Tornado) are its buttons, and `extra_attack` is
  its Whirlwind. It has no `attack4` or `attack5` button.
- `#0001` has Idle, Run, Jump, Fall, Land, Hurt, Mid-air Hurt, attack1,
  midair_attack1, attack2, midair_attack2,
  Shield (raise, held and lower poses), Mid-air Shield (held only), Dash (`mouvment`),
  Throw and the Sphere Rush (six clips), plus the
  Shuriken projectile animation and the clone-cloud and sphere effects.
  No invented frames. Rising uses Jump and
  descending (walking off a ledge included) uses Fall; each plays once at 10 fps
  and holds its last frame. Land plays once at 12 fps on touchdown, for
  exactly the clip's length, then returns to idle or run. Land is a visual
  state only: it never changes movement or collision, and a new jump, attack
  or hitstun cuts it short. If those frames fail to load, the fighter holds an
  idle frame without stretching or rotating. Facing flips the sprite (per
  clip, against that clip's source orientation; see 3). For players it is manual: only
  the fighter's own movement (running past a small speed on the ground,
  steering in the air), a Dash and an attack started with a direction held
  turn it (the attack faces that direction as it starts, so a turn made on
  the press step, run left → press right and attack1 together, strikes right,
  never the stale way). **During an action of its own** (an attack or the
  Shield) the direction held turns it at once, left to right or right to
  left, as often as the player likes (`Fighter.updateFacing`): the hitbox,
  a step-in still to come and a shuriken not yet released all go the new
  way. Turning never walks or runs. A technique faces the direction held
  on the step it starts (so the Sphere Rush pressed with Left held rushes
  left); from then on a stun, a bind, a Dash and a technique hold the
  facing. A spawn or respawn takes the spawn's `facing`, and otherwise it
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
  impact freeze. Hitstun outranks every other state (technique, bound,
  attack, Dash, Shield, tumble, jump, fall, land, Shield lower pose, run and
  idle), and normal states resume when it ends. The pose is visual only (no
  collider changes), but being hit is not: a hit (never a block) or a bind
  takes the fighter out of its own attack on its next step, so nothing of
  that attack is left to strike, release a shuriken or recover from (no
  cooldown either). Checked on the fighter's next step, two attacks that
  connect on the same step still trade. A stunned fighter's push or
  launch runs down at its own `movement.hitstunFriction` (1600) on the
  ground and `hitstunAirDrag` (210) in the air, whatever is held: the rates
  Launch Point was tuned against, apart from the movement rework. Missing
  hurt art holds an idle frame.
- **Launch reaction** (the character's `launchReaction`, resolved by
  `resolveLaunchReaction` in `js/game/combat.js`; every field optional,
  the defaults change nothing). None of it changes a launch's strength.
  - *Launch stun.* A launching hit stuns for its own `hitstun` plus
    `stunPerThousand` (0.2 s for #0001) per 1000 units / s of launch
    speed, never more than `maxStun` (0.7 s) extra: a big hit at a high
    Launch Point is a clear moment to chase. attack2 at 50 Launch Point (1200
    units / s) stuns 0.28 + 0.24 s. The event's `hitstun` is the total.
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
- **Launch bounce** (`js/game/launch-bounce.js`: every fighter's
  `LAUNCH_BOUNCE` settings, which a character may override with its own
  `launchBounce`, `enabled: false` included; #0001 overrides none). A launch
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
    Ground attack1 rebounds its target off a wall right behind it from about 50
    Launch Point, midair_attack2 off the floor from about 25; the body's
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
    does the shuriken's hit. A clone's hit and the Sphere Rush explosion
    launch through the same `CombatSystem.applyHit` and rebound like any
    launch (the blast into a rock outcrop ricochets back across the mesa).
- attack1 is #0001's first attack, on the `attack1` button. On the
  ground it is a punch (`attack1`, 4 frames); in the air a kunai slash
  (`midair_attack1`, midair_attack1, 3 frames: `midair_attack1_1`–`midair_attack1_3`); the character data
  maps `attack1: { ground: 'attack1', air: 'midair_attack1' }` and the fighter picks by grounded state
  when the button is pressed. Both play once at 12 fps, and the phases are
  whole frames: ground attack1 is frame 1 startup, frame 2 active, frames 3–4
  recovery; midair_attack1 is frames 1–2 startup (kunai drawn back, then
  overhead) and frame 3 active (the slash arc), with no recovery frame, so
  the attack ends with its clip. Ground attack1 hits once for 3 damage, 0.32 s
  hitstun, 0.14 s blockstun, 0.05 s hitstop and a 0.15 s cooldown, and
  declares `baseLaunch: 1, directionalLaunch: 'horizontal'`: an unblocked
  hit adds its 3 to the opponent's Launch Point, then pushes it away at 1 ×
  that new Launch Point (from 117: 120, at impact vx 1200 × facing) with no
  vertical launch. midair_attack1 hits once for 3 damage, 0.32 s hitstun,
  0.15 s blockstun, 0.05 s hitstop and a 0.16 s cooldown (longer, making up
  for the missing recovery), and declares `baseLaunch: 2,
  directionalLaunch: 'vertical'`: an unblocked hit launches the opponent
  upward at 2 × its new Launch Point with no sideways push (from 117: at
  impact vx 0, vy −2400), less high than ground attack2's launch from the same
  Launch Point, as attack2 adds more damage first. A Shielded midair_attack1 is
  neither pushed nor launched. Hitboxes match the
  strike in the contact frame (the punch; the slash arc in front of the
  fighter) and mirror with facing. A direction held while an attack plays
  turns it (see the facing rule in 4); movement follows the attack's own data (see Attack movement below):
  ground attack1 keeps 0.75 of the speed it started with (never more than that
  share of top speed) and slides on it under 0.4 of the ground
  deceleration, with no steering, so a running punch carries on about 20
  units instead of stopping dead; midair_attack1 keeps all of its drift and
  0.85 of the air steering, for chasing airborne opponents. Gravity still
  applies, and a midair_attack1 that lands finishes its own clip (only what
  is left of it: never restarted) instead of switching to ground attack1 or
  Land. Both are combo starters: once they hit, the rest may be cut short
  from their strike on (`hitCancel` 1/12 s, 2/12 s; see Hit-cancels
  below). Ground attack1 is ground-only.
- attack2 is #0001's secondary basic attack, on the `attack2`
  button, selected the same way (`attack2: { ground: 'attack2', air: 'midair_attack2' }`). On the ground it
  is a spinning high kick (`attack2`, 7 real frames); in the air an airborne kick
  (`midair_attack2`, midair_attack2, 5 real frames: `midair_attack2_1`–`midair_attack2_5`). Both play once at
  12 fps, and the phases are the frames that visibly strike: ground attack2 is
  frames 1–3 startup (step in, lead jab, spin), frames 4–5 active (the kick,
  drawn with motion trails), frames 6–7 recovery; midair_attack2 is frames 1–2
  startup, frame 3 active (the kick's forward-low arc) and frames 4–5
  recovery. Ground attack2 is slower, more committed and heavier than ground
  attack1: it hits once for 5 damage, 0.28 s hitstun, 0.15 s blockstun and
  0.09 s hitstop, with a 0.15 s cooldown, and declares `baseLaunch: 2, directionalLaunch:
  'vertical'`: an unblocked hit adds its 5, then launches the opponent
  upward at 2 × its new Launch Point (from 115: 120, at impact vx 0,
  vy −2400, airborne, before normal gravity brings it down). midair_attack2 hits
  once for 5 damage, 0.28 s hitstun, 0.14 s blockstun and 0.08 s hitstop,
  with a 0.1 s cooldown, and declares `baseLaunch: 2, directionalLaunch:
  'reverseVertical'`: an unblocked hit drives the opponent downward just as
  hard (from 115: at impact vx 0, vy +2400). A grounded opponent is knocked
  straight back onto the ground it stands on; an airborne one is sent down
  toward it. Driven into the ground hard enough (500 units / s, from about
  25 Launch Point), either rebounds off it once (see Launch bounce). Neither
  has a horizontal launch. Both come from the shared
  launch path, not special attack2 code. A Shielded attack2 adds no Launch Point
  and launches nothing (the Shield pays 25 Energy and takes its blockstun
  and hitstop). Hitboxes cover the ground kick's arc and the airborne
  kick's forward-low arc in front of the fighter and mirror with facing.
  The same turning applies. Ground attack2 keeps half the speed it started
  with, slides under half the ground deceleration and, on its first frame
  (the step in), raises its forward speed to 280, a subtle step of about 20
  units that shoves an opponent standing close along through the
  pushboxes; midair_attack2 keeps all of its drift and 0.7 of the air
  steering, never frozen sideways. Gravity keeps working, and a mid-air
  attack2 that lands finishes what is left of its own clip instead of
  switching to ground attack2 or Land. Both are launchers: once they hit, the
  rest may be cut short from their kick on (`hitCancel` 3/12 s, 2/12 s).
  Ground attack2 is ground-only; pressing attack2 and Jump on the same step attacks
  on the ground.
- The two mid-air numbered attacks swapped moves: midair_attack1 is the
  three-frame kunai slash that used to be midair_attack2, and midair_attack2 the
  five-frame airborne kick that used to be midair_attack1. Each move took its
  whole package with it (art, timing, hitbox, damage, stun, hitstop and
  cooldown); only its launch changed, to the values above. The frame
  files were renamed to match: `midair_attack1_1`–`3` is the slash and
  `midair_attack2_1`–`5` the kick.
- Throw is #0001's projectile attack and its extra attack, on the
  `extra_attack` button (player-facing name Throw; keyboard J, gamepad X /
  Square, the touch **Shuriken** button).
  The character data maps `extra_attack: 'extra_attack'`: the button and the move
  share one codename. It is ground-only: there is no
  mid-air Throw art, so pressing it in the air does nothing (no pose, no
  shuriken, Jump / Fall continue). One press plays the 3-frame `extra_attack` clip (the `extra_attack_1`–`extra_attack_3` files)
  once at 12 fps (`extra_attack_1` raises the shuriken by the face, `extra_attack_2` whips the
  arm across and lets go, `extra_attack_3` follows through) and releases exactly one
  shuriken; holding the button neither loops the clip nor throws again. Its
  phases are whole frames: frame 1 startup, frame 2 active (the release),
  frame 3 recovery. The attack has no melee hitbox (`hitbox: null`); instead
  a one-shot projectile event releases the shuriken once, on the step the
  attack's time reaches `extra_attack_2` (`spawnAt` 1/12 s; like other phases it may
  trail the art by one simulation step, never before the release pose and
  never after the Throw ends), at the throwing hand (16 units in front of
  the origin, 38 up, mirrored with facing). A Throw hit before its release
  throws nothing. A direction held turns it like other attacks (before
  the release, the shuriken goes the new way); it keeps half the speed it
  started with, slides under 0.6 of the ground deceleration and keeps 0.3
  of the steering, so the thrower is never rooted to the spot. Gravity keeps working, and there is a 0.25 s
  cooldown after it. It is a spacing and interruption tool, never a combo
  starter: no hit-cancel, and the shuriken's short stun leaves no
  follow-up. Like attack1 / attack2, Throw never starts while Shield is held with
  a Shield that can go up (the Shield takes the step; let go of Shield to
  throw, and a Throw pressed meanwhile comes out as it is let go, see the
  combat input buffer below). If
  the Throw frames or the shuriken frames are missing, Throw is refused
  (logged): never a faked pose or an invisible projectile.
- The shuriken is an independent battle entity (`js/game/projectile.js`), not
  a fighter hitbox: it has its own position (interpolated between fixed
  steps like the fighters), velocity, animation clock, hitbox, combat data
  and lifetime, all from character data (`projectiles.shuriken`). Its
  direction is #0001's facing at the release and never changes afterwards,
  even if #0001 turns, jumps, shields or is hit. It flies straight at
  700 units/s, looping `extra_attack_object_1 → extra_attack_object_2 → extra_attack_object_3` at 18 fps (art
  only; speed never depends on it). Its hitbox is 10 × 10 units, centred.
  It hits at most once: 1 damage (+1 Launch Point), 0.16 s hitstun, 0.10 s
  blockstun, 0.04 s hitstop on the target only (the thrower does not freeze)
  and `baseLaunch: 0, directionalLaunch: null`: 0 × any Launch Point is no
  launch, so it neither pushes nor launches, however high the target's
  Launch Point (from 500 the target is at 501 and still not launched), then
  it disappears. Hits resolve through the same `CombatSystem.applyHit` as melee,
  with the shuriken's direction in place of the attacker's facing, and credit
  #0001 as the attacker. It never hits its thrower. A raised Shield blocks
  it from either side: it is used up and gone, and the target pays 25
  Energy and takes no Launch Point, stun or launch (only the Shield's
  blockstun and the hitstop). A missed
  shuriken disappears after 1.5 s, once it has flown into the Void, or when it
  meets a solid block (the main stage's own cliff face included); one-way
  platforms and the open air past a ledge do not stop it. No multi-hit,
  homing, bouncing, piercing, explosion or clash. The Battle owns live
  projectiles: each fixed step it updates the fighters, spawns released
  projectiles (once each), moves them, resolves melee and projectile hits,
  then removes spent ones. They are drawn on the battle canvas over the
  fighters, centred on their position with image smoothing off, and cleared
  on restart.
- `down` (S / ↓, D-pad or left stick down) is a
  direction only, never a stance, state or modifier: it has no animation,
  locks no movement, refills nothing and changes no attack. It does two
  things, both in the air: held while falling it is the fast fall, and held
  as a hit lands it steers the launch downward (see Movement and game feel
  and Launch steering). On the ground it does nothing at all: the fighter
  idles, runs, attacks, jumps and shields exactly as with nothing held, and
  every numbered button does the same thing whether or not Down is held. On
  a one-way platform it never drops through (the player has no
  drop-through control; see the stages above). Menus read Down from their
  own bindings, the same keys and pad directions as ever (7.4). State
  priority is
  hitstun > technique > bound > attack > Dash > Shield > tumble > jump /
  fall > land > Shield lower pose > run > idle: a hit shows Hurt at once.
- `shield` is the shared player action, the Shield button (keyboard L,
  gamepad RB / RT, the touch **Shield** button). What it does, how a
  fighter defends, is character data (`defense` in
  `js/data/characters.js`, frozen by `createDefenseDefinition`), not part of
  the input system. The one defense type is the Shield, `{ type: 'shield',
  groundAnimation, airAnimation, groundStartAnimation,
  groundReleaseAnimation }`; the type is checked, so a future fighter can
  defend another way, and an unknown type is an error. #0001 uses it:
  `shielding`, `midair_shielding`, `prepshield` and `releaseshield`. There is no
  Dodge (no invulnerability, evasive frames or one-press defensive move)
  and no chip-damage Block anywhere in the engine.
- #0001's **Shield** is a held state, `CombatState.shielding`: up while
  `shield` is held and the Shield is allowed, down the step it is let go.
  Allowed means: the fighter is free to act (no attack, stun, bind,
  technique or Dash; the Shield never cuts one short, and comes up the step
  it ends if `shield` is still held), it is not exhausted
  (`CombatState.canShield`: any Energy left is enough) and the held art
  for where it is. It is decided before the
  combat intents: while `shield` is held with a Shield that can go up, no
  attack, Throw, summon, technique, Dash or jump starts (let go of `shield`
  first: an attack or a jump pressed meanwhile is buffered and comes out
  the step the Shield is let go, if that is soon enough; a summon or
  technique pressed meanwhile is not kept). On the ground it shows `prepshield` (`0001_prepshield_1`) for
  one Shield frame (12 fps, 1/12 s) as it goes up, then `shielding`
  (`0001_shielding_1`) for as long as it is held; lowered on the ground,
  `releaseshield` (`0001_releaseshield_1`) shows for one frame (the
  `shieldRelease` state) while nothing of higher priority takes over
  (visual only: movement resumes at once). In the air there is only
  `midair_shielding` (`0001_midair_shielding_1`), the held pose:
  no raise or lower pose, and a Shield lowered in the air goes straight
  back to Jump / Fall. Landing with it up keeps the held pose (no raise
  pose, no Land). While it is up horizontal input moves nothing (on the
  ground no walking, running or Dash, the current velocity slowing under
  the normal deceleration; in the air momentum carries on under the normal
  air drag with no steering), though the direction held turns the fighter.
  In the air it **slows the fall**: a faster fall (a fast fall included)
  brakes toward `defense.slowFallSpeed` (#0001: 200 units / s) at
  `slowFallBrake` (6000 / s², so 0.2 s from the fast fall's 1400), and
  gravity never takes it past that while the Shield stays up; a rise is
  untouched (`stepBody`'s fall cap, from `Fighter.update`). A Shield without
  `slowFallSpeed` (0) falls as ever. A
  missing held clip refuses the Shield (logged once per clip); missing
  raise or lower poses are simply skipped.
- **Blocking.** The Shield is a full circle: while it is up, any hit that
  reaches the fighter's own hurtboxes (the same `CombatSystem` overlap as
  any hit, never a bigger circle) is blocked, whichever side it comes from:
  melee, projectiles, clone attacks and the Sphere Rush's contact alike. A
  blocked hit adds no Launch Point and launches nothing (launch strength 0,
  final launch zero, whatever its Base Launch and direction), shows no
  hurt pose and deals no hitstun; the hitbox is used up exactly as by a
  hit (an attack's `hasHit`, a projectile gone, a clone's `hasHit`, the
  technique's contact). The fighter pays `energy.shieldHitCost` (25) for
  it, once, in `CombatSystem.applyHit`, or all it has left when that is
  less, and the event is a `'block'` with that `energyCost`. The hit's hitstop still freezes both sides as usual, and
  its `blockstun` becomes `CombatState.shieldStun`: the Shield is held up
  through it even if `shield` is let go, and the fighter cannot act until it
  is over. A block that empties the bar (with 25 or less left) exhausts the
  fighter and drops the Shield at once, clearing the blockstun. That block
  itself stands, never turned into a hit
  after the fact, but any later hit, even on the same step, lands in full.
  Holding the Shield costs nothing, and a miss costs nothing: only a
  confirmed block is paid for.
- **Perfect Shield.** A hit that lands within `defense.perfectWindow`
  (0.1 s) of the Shield going up is a perfect block (`Fighter.perfectShield`,
  the event's `perfect`): it costs no Energy and deals no blockstun, so the
  fighter can let go and answer at once, while the attacker, whose attack
  was blocked, still has its whole recovery (no hit-cancel). The hit's
  hitstop still freezes both. Only a raise after the Shield has been down
  for `perfectRearm` (0.25 s) has that window, so tapping `shield` over and
  over never keeps one open; held up longer, or raised again too soon, a
  block is an ordinary one. It is drawn as a white ring bursting from the
  block (see Hit effects, 7.3). Quick Battle's CPU pulls one off only as
  often as its level earns it: a raise that close to contact succeeds with
  a chance of its `guard` trait to the fourth power (Brutal often, Easy almost never),
  and otherwise it takes the hit.
- The Shield's look (`js/game/shield-fx.js`): a wavy circle round the
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
  radius 0.62 × that height (≈55 units for #0001), so it surrounds head and
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
  in `js/game/combat.js`, every field optional: `max` 100, `regen` 12 / s,
  `dashCost` 15, `dashCancelCost` 40, `shieldHitCost` 25) is the one resource a fighter spends, and only on a Dash (as it
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
  jumps, attacks, Throw, summons or techniques, and none of them spend it. A respawn and a restart start it full.
- **Dash** (movement, not an attack): two press edges of the same
  horizontal direction (`runLeftPressed` / `runRightPressed`, 7.4), the second
  within `movement.dashTapWindow` (0.22 s) of the first, start a Dash that
  way (`Fighter.trackDashTaps`, `tryDash`); the other direction replaces the
  waiting tap, both at once cancel it, and a double tap that cannot Dash is
  used up, never queued. A one-step request (`mouvementLeftPressed` /
  `mouvementRightPressed`, 7.4: one tap of the Joystick touch layout's Left
  mouvement / Right mouvement, `mouvementLeft` / `mouvementRight`) goes straight to the same `tryDash`, so every
  rule, cost and effect below applies unchanged; it is not a direction
  press (it never pairs with one), it forgets any first tap waiting, it is
  used up whether or not it Dashes, and both at once ask for nothing. A Dash needs the fighter free to act (no attack,
  stun, bind, technique or Dash running) or in an attack that hit
  and may be cut short (a **Dash cancel**, see Hit-cancels), grounded,
  not shielding nor holding `shield` for a Shield
  that can go up, not exhausted (it pays `dashCost` 15 once as it starts,
  `dashCancelCost` 40 for a Dash cancel, or all that is left when that is
  less, emptying the bar) and its real `mouvment` clip (`mouvment_1 → mouvment_2`,
  once at `MOUVMENT_FPS` 10; without it the Dash is refused and logged, never
  faked with the run). A held Shield and attacks are resolved before it on
  the same step, so either wins over it. The fighter faces the Dash at once and
  moves at `movement.dashSpeed` (900, about 2.7× Speed Power 2's 330; the
  top speed itself never changes) for one pass of the clip (0.2 s, ≈180
  units on open ground), ignoring input; afterwards the normal movement
  takes over from that speed, its excess over top speed bleeding off at
  `movement.overspeedDeceleration` (6000) whatever is held: holding on it
  eases into the run at top speed within about four steps, letting go
  slides about 50 units to a stop, and pressing back brakes harder still.
  No speed spike, no dead stop. It obeys collision: a solid stops it (the Dash ends against
  it), and leaving the ground ends it (the fighter falls on with its speed).
  Hitstun or a bind end it at once. While it runs the fighter cannot attack,
  shield, jump, summon, start a technique or Dash again (an attack or a jump pressed late in
  it is kept by the input buffers and comes out the step it ends: a Dash
  into a punch, keeping at most the punch's share of top speed, never a
  lunge; there is no attack-cancel out of a Dash). A Dash asked for during
  an impact freeze (a double tap or a one-step request) is kept and tried
  on the step the freeze ends, like the attack presses made then. It has no hitbox,
  damage, launch or invulnerability. The training CPU never dashes (its
  input never has press edges); Quick Battle's combat AI dashes only
  through the same double tap a player uses (a press, a release and a
  press within the window), and guards against double-tapping by accident.
- **Summons and techniques** are numbered buttons of their own (see the
  attack loadout above), dispatched by type, not a summon shortcut. A
  button whose `actions` entry is `{ type: 'summon', id }` sends out the
  entry `id` in `summons` (a detached temporary entity), and one whose entry
  is `{ type: 'technique', id }` starts the entry `id` in `techniques` (a
  sequence the fighter performs itself). #0001 has
  `attack3: { type: 'summon', id: 'attack3' }` (the Clone Attack) and
  `attack4: { type: 'technique', id: 'attack4' }` (the Sphere Rush).
  `Fighter.tryAction` sends either to `Fighter.trySpecial`, which dispatches
  on the type (`trySummon` / `tryTechnique`). The rule is shared: the
  button's own new press, on the ground, with the fighter free to act (no
  attack, stun, bind, technique, Dash or held Shield; one never cuts an
  attack short) and its cooldown over. Anything else, an airborne press, a
  busy fighter, a cooldown still running, no opponent for a summon, missing
  art or invalid data, makes the press do nothing at all: never Punch or
  Kick (or any other attack) in its place, never kept for later (the combat
  input buffer below keeps ordinary attacks only), never an invisible move.
  Holding the button does not repeat it, and neither Down nor any other
  input changes what it does. Each has its own cooldown instead of any
  cost: the summon's or technique's `cooldown` (5 s for both of #0001's),
  kept per ability in `CombatState.abilityCooldowns` (a `CooldownTimers`:
  `{ remaining, duration }` per id, apart from ordinary attacks' short
  recovery cooldowns in `CombatState.cooldowns`), started the moment the
  move is accepted (a summon's startup included) and recovering at 1 s per
  second, whatever the fighter does (impact freezes included), never below
  0. Neither spends Energy. The Clone
  Attack never depends on technique code, nor the technique on the summon
  system.
- attack3 Clone Attack (#0001). Trigger: a new press of `attack3` (O,
  gamepad LT, touch slot 3, the **Clone Attack** button) on the ground,
  under the shared rule above. It is data on the character: `actions`
  maps `attack3` to the `attack3` summon, which names the attack (`attack1`),
  the cloud effect (`attack3_object`), the owner's startup
  (`startupAnimation: 'attack3_summon'`, below), `cooldown` 5, `behindDistance` 48 world
  units, the cloud's `effectOffset` (centred 44 units above the clone's feet,
  half the fighter's height) and a `noGround` fallback (the
  attack `midair_attack2` at `offset` `{ x: 0, y: -36 }` from the opponent's
  origin) for when there is no ground behind the opponent (below). A
  successful summon starts attack3's 5-second cooldown once, when it is
  accepted, whether or not the clone then hits; the overhead fallback is the
  same summon, never a second cooldown. While it cools, an attack3 press
  does nothing. With no opponent no clone is summoned, no cooldown starts
  and the press does nothing. Before
  starting its cooldown, the summon checks that its startup pose and the
  cloud have real frames, that both of its attacks (attack1 and the no-ground midair_attack2)
  are defined with a hitbox and real frames, and that there is an opponent,
  wherever the opponent stands, so whether it works never depends on where
  the clone would appear; missing art or data logs a warning, starts no
  cooldown, summons nothing and does nothing else. One press summons
  exactly one clone; holding attack3 does not repeat it. The cooldown (5 s)
  outlasts a clone's life (≈1.3 s), so clones never overlap; each runs its
  own independent lifecycle.
  Startup: the accepted press puts #0001 into his summoning startup
  (`Fighter.pendingSummon`: the summon's id, its target, the startup clip
  and its clock; visual state `summon`, between `bound` and `attack` in
  priority: hitstun, technique, bound, summon, attack, dash, shield, …).
  On the press step itself he shows `attack3_summon_1` (no idle frame
  first), then plays `attack3_summon_1 → 2 → 3 → 4` once at 10 fps, each
  pose 0.1 s (6 fixed steps), 0.4 s in all, never looped. The four files
  are the poses of the retired held Down stance, recovered byte for byte
  from the repository's history and renamed for Attack 3: its two startup
  poses as `attack3_summon_1` and `_2`, its two held poses as `_3` and
  `_4` (the hand seal). For the startup he is committed: standing still
  (his speed set to 0 on the press, so a run never slides under the pose),
  facing as he did when it was accepted (a held direction never turns
  him, and nothing turns him toward the opponent), and unable to attack,
  Throw, start a summon or technique, Dash, jump, raise the Shield or drop
  through a platform (`canAct` is false; a press of an ordinary attack in
  its last 0.15 s is kept by the combat input buffer, as after any action).
  The step after its last pose (one pass of the clip, counted from the
  press step) the summon request is queued at the opponent it was cast at
  and #0001 is free again on that very step; the Battle spawns the clone
  the same step, on cloud frame 1. The startup is cut short, with no clone
  and the cooldown already started left to run, by a hit (any hit,
  `CombatSystem.applyHit`, which shows the hurt pose on the hit's own
  step), by losing the ground under him (he falls from where he is), by
  the Void taking him or his target, by a reset, a respawn, a Practice
  Ground fighter or CPU change, or the arena going. A target no longer his
  opponent, or out of play, when the pose ends gets no clone, and no other
  fighter is targeted instead. With no `startupAnimation` a summon is sent
  out on the press itself and its owner is free at once (the schema's
  default). The startup is the owner's pose; the smoke cloud
  (`attack3_object`) is the clone's own effect, played where it appears.
  The owner does not perform attack1: no `0001_attack1_1*` art, no attack
  and no attack1 cooldown. Once summoned, the
  clone is independent: the owner may move, jump, throw, attack, shield or
  be hit and launched, and the clone still finishes appearing, attacking and
  vanishing, with no cooldown refund. It never retargets or summons again.
  The clone is not a Fighter (`js/game/clone.js`): it has no Launch Point,
  controller, pushbox, hurtboxes, defence, jump or coyote logic, physics or
  gravity, and it is not in `battle.fighters`. It is untargetable, takes no
  part in fighter separation or solid collision (the opponent can move
  through it), is ignored by the camera (framing still uses P1 and the CPU)
  and has no marker, name, ring, shadow or HUD card. Its position
  facing and attack are snapshotted once, on the step it is sent out (as
  the owner's startup ends), facing the way the opponent faces then. Normally it stands on the opponent's back side
  (`x = target.x − target.facing × 48`, never clamped: there are no side
  walls), at the opponent's foot height, and performs attack1. That
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
  and performs #0001's existing midair_attack2 kick. Either way it never moves,
  turns, chases, falls, lands or teleports after that, and never re-checks
  the ground or switches attack, so an opponent who moves away before the
  strike makes it whiff. Lifecycle, all on fixed steps: APPEAR plays
  `attack3_object_1 → … → attack3_object_10` once at 20 fps (0.5 s), with no hitbox; the
  clone's first attack frame (`attack1_1`, or `midair_attack2_1` overhead) shows
  beneath the last cloud frame as the smoke clears. ATTACK plays one
  ordinary grounded attack1 from frame 1 with the owner's
  real sprites (`0001_attack1_1 → attack1_2 → attack1_3 → attack1_4` at 12 fps, the same
  per-clip `sourceFacing` mirroring, no tint, transparency, outline or
  silhouette) and attack1's own resolved attack definition (`attacks.attack1`: frame 1
  startup, frame 2 active, frames 3–4 recovery, 3 damage, 0.32 s hitstun,
  0.14 s blockstun, 0.05 s hitstop; the clone never moves or follows up, so
  it reads none of the attack's movement or hit-cancel data), so its hitbox exists only on the active
  frame and hits at most once. It performs the owner's normalized attack1, so it
  inherits attack1's Base Launch 1 and horizontal Directional Launch (along the
  clone's facing, away from the clone) automatically through the shared
  `CombatSystem.applyHit`; the summon has no launch data of its own and
  never computes a launch itself. The overhead clone instead plays
  midair_attack2 from frame 1 (`0001_midair_attack2_1 → … → midair_attack2_5` at 12 fps)
  with its own resolved definition (`attacks.midair_attack2`: frames 1–2
  startup, frame 3 active, frames 4–5 recovery, 5 damage, 0.28 s hitstun,
  0.14 s blockstun, 0.08 s hitstop), whose hitbox, from the overhead spot,
  lands on a stationary opponent's hurtboxes, and whose Base Launch 2
  reverse vertical launch drives the opponent downward (from 115: `vy =
  +2400`, no sideways push; none on a block, like any vertical launch). VANISH removes the
  body and plays
  the same cloud backwards, `attack3_object_10 → … → attack3_object_1`, at the same 20 fps
  (0.5 s), with no hitbox; the clone is then removed. The clone's hitbox is
  resolved from the clone's own position and facing, never the owner's. A hit
  credits the owner as the attacker (the combat event also names the clone as
  its `summon`) and pushes the target along the clone's facing, away from the
  clone. It is a detached hit: the target gets the attack's hitstop and the
  clone pauses its own attack clock for the same 0.05 s (as many steps as
  the target's freeze), but the owner is never
  frozen (like a projectile's thrower). A raised Shield blocks it from
  either side, a clone at its back included: the attack is used up, the
  target pays 25 Energy and takes no Launch Point or launch (the overhead
  kick's spike included), and the clone still pauses for the hitstop.
  Clones are drawn behind both fighters (terrain, shadows, clones, CPU, P1,
  projectiles, foreground), with the cloud centred at the effect offset at
  the fighters' art-pixel scale. The Battle owns live clones: each fixed step
  it updates the fighters, spawns projectiles and moves them, advances live
  clones, spawns the clones summoned that step (each on cloud frame 1),
  resolves melee, projectile and clone hits, then drops spent projectiles and
  finished clones. Restart / rematch and leaving the battle clear every clone.
  The debug overlay draws a clone's hitbox in the attack colour, labelled
  with its attack (`clone attack1`, or `clone midair_attack2` overhead), only on its
  active frame; a clone has no hurtboxes to draw.
- attack4 Sphere Rush (#0001, `techniques.attack4`, runtime in
  `js/game/technique.js`). Not a summon, a projectile, ordinary attack2
  or a big melee hitbox: #0001 himself changes animation, holds the sphere,
  dashes and makes contact, driven by a dedicated technique runtime with
  explicit phases (`form`, `dash`, then `whiffRelease` after a miss, or
  `confirm`, `wait`, `explode`, `release` after a hit, and `done`), never
  inferred from animation frames. It sets no `combat.attack`. Trigger:
  a new press of `attack4` (M, gamepad L3, touch slot 4, the **Sphere
  Rush** button) on the ground, under the shared rule for summons and
  techniques above; attack2 (5 damage, `attack2_1`–`attack2_7`;
  midair_attack2 `midair_attack2_1`–`5`) is untouched and never becomes
  it. Grounded only. Once started it owns the fighter (nothing needs to stay
  held); it ends only by a miss, a wall, ground loss, a
  hit on #0001, a contact blocked by a Shield, a lost bind (the Void
  included), completion or a reset. Starting it (the attack4 press step) starts
  attack4's 5-second cooldown, spent whatever follows: a hit, a miss, a
  block, a wall, ground loss or an interruption. Sprite
  partitioning:

  | Frames | Clip | Role |
  | --- | --- | --- |
  | `attack4_1`–`3` | `attack4_form` | formation |
  | `attack4_4`–`6` | `attack4_dash` | rush / contact search |
  | `attack4_7`–`8` | `attack4_confirm` | successful contact and stop; `attack4_8` held while the sphere grows |
  | `attack4_9` | `attack4_explosion` | the explosion pose |
  | `attack4_10`–`12` | `attack4_release` | release / recovery after the explosion |
  | `attack4_12` | `attack4_whiff_release` | release after a rush that caught nobody |
  | `attack4_object_1`–`6` | `attack4_object_build` | sphere formation (once) |
  | `attack4_object_7`–`9` | `attack4_object_impact` | sphere spinning on the target (looped), drawn larger over the hold |
  | `attack4_object_10`–`11` | `attack4_object_explosion` | explosion (once) |

  Deterministic sequence, in 60 Hz fixed steps (all clips at 12 fps; the
  technique's clock follows the sprite animator, so a clip's first frame
  shows 4 steps, later frames 5):
  1. FORM (activation step + 29 more, 0.5 s): on the attack4 press #0001
     stops, horizontal speed 0, controls and facing locked (the facing is
     snapshotted here: the direction held on the press step if any, else
     the way it faced). `attack4_1 → attack4_2 → attack4_3`
     play once, `attack4_3` held, while `attack4_object_1 → … → attack4_object_6` form in his
     rear palm; poses and sphere frames change on the same steps. It lasts
     the longer of the two clips, so the rush never starts before `attack4_object_6`
     has completed its frame time. No movement, no hitbox.
  2. DASH (15 steps, 0.25 s): `attack4_4 → attack4_5 → attack4_6` once, at a fixed
     1050 world units / s in the snapshotted facing, through normal
     fixed-step physics (≈262 units at most; solids and ground respected, and
     running off a ledge is ground lost; player left / right ignored). The complete `attack4_object_6` stays
     in the hand, never rebuilt. This is the only contact search: each step
     the sphere's hitbox (48 × 48 units, centred on the sphere) is tested
     against the opponent's hurtboxes, from the sphere's actual world
     position. Hand offsets (sphere centre from #0001's origin, facing
     right, x mirrored with facing, one per pose shown): `attack4_1` (−15, −47)
     the fist, `attack4_2` / `attack4_3` (−25, −42) the open palm, `attack4_4`
     (−32, −51) and `attack4_5` (−34, −51) trailing behind him, `attack4_6`
     (32, −47) swung in front. So contact is made on the forward swing
     (`attack4_6`), after the rush has closed in; pushboxes keep #0001 from
     running through the opponent meanwhile. No contact by the end of
     `attack4_6`, or a solid wall reached first (no pass-through), is a miss:
     WHIFF RELEASE below.
  3. WHIFF RELEASE (a miss only; 5 steps, one `attack4_12` frame at 12 fps,
     1/12 s, the `attack4_whiff_release` clip):
     from the step after the dash's last (or the very step a wall stops it)
     the rush stops dead where it is (`vx` 0, no slide) and the contact
     search ends. The sphere is let go: it simply vanishes, with no impact
     or explosion frames (`attack4_object_7`–`11`), no hit, damage or bind, and none
     of the successful-hit poses (`attack4_7`–`11`, nor the full
     `attack4_10`–`12` recovery). #0001 shows `attack4_12` alone, still committed
     (controls and facing locked, buttons ignored), and is back in Idle /
     normal control only on the step after that frame: the last pose of a
     clean miss is always `attack4_12`, never a jump straight from `attack4_6` to
     Idle. The technique then ends as a `miss` (or `wall`).
  4. CONFIRM (from the contact step): the rush stops at once (`vx` 0, no
     sliding through). The contact, applied exactly once through
     `CombatSystem.applyHit`: no damage (no large initial hit), Base Launch 0
     and no Directional Launch (no launch), 0.2 s hitstun, 0.15 s blockstun, 0.06 s hitstop on the
     target only. It is only the setup: the first tick (below) is its own
     `tickHit`, dealt straight after it on the same step.
     The target is then bound (below) with its horizontal speed zeroed and,
     on that same contact step (hits resolve after both fighters have picked
     their poses, so the technique re-picks the target's), is already shown
     in its Hurt pose (`hurt`, or `midair_hurt` if caught airborne): no
     one-step delay. The sphere moves from the hand onto it (centre at the
     target's origin + (0, −48), over its body, following it every step) and
     spins there: `attack4_object_7 → attack4_object_8 → attack4_object_9 → attack4_object_7 → …`, one frame
     every 1/12 s counted from the contact step, for as long as it holds
     the target (eight turns in the 2 s delay). #0001 plays
     `attack4_7 → attack4_8` once from the same step (`attack4_7` 5 steps, then
     `attack4_8`; 10 steps in all).
  5. WAIT: #0001 holds `attack4_8` (never `attack4_9`–`12` before the blast),
     committed (no movement, attack, summon, Shield, Throw or jump),
     and the bound target holds in its Hurt pose with the sphere still
     spinning on it and growing: `sphereGrowth` draws it from `startScale`
     (1, its own art size) at the start of the hold, by the same amount
     every step, to `endScale` (1.4) as it explodes. The growth is explicit
     because the spin frames' own sizes shrink slightly (`attack4_object_7`–`9` are
     ≈116, 106 and 100 px wide); it never shrinks or pulses, and it is
     visual only: the sphere stays centred on the target (the drawn frame
     grows about its centre), and no hitbox, hurtbox, collision or hit ever
     reads it (the rush's hitbox is gone since the contact).
     TICKS: the contact queues exactly one `tickHit` at once, dealt on the
     contact step itself right after the contact; then, through CONFIRM
     and WAIT, while the target is still bound by the technique, every
     whole `tickInterval` (0.5 s) since the contact step is one more. Each
     goes through `CombatSystem.applyHit`: 1 damage (+1 Launch Point), Base
     Launch 0 and no Directional Launch (no launch), no stun or hitstop, so
     the hold never stutters. They fall on the contact step and 0.5, 1.0 and
     1.5 s after it (steps 0, 30, 60 and 90), counted on the fixed-step
     clock by threshold crossings (the contact's own tick counts as the
     first, so the contact step can never deal two), never from animation
     frames; none before the contact, none after the technique ends or the
     bind is lost, and none on the explosion's step (the explosion is never
     also a tick). Each is one combat event (`move` `attack4.tickHit`).
  6. EXPLODE: exactly 2.0 s (`explosionDelay`, 120 steps) after the
     contact step, counted from the hit, never from formation: #0001
     switches to `attack4_9`, the explosion pose, and the sphere stops spinning
     and growing and plays `attack4_object_10 → attack4_object_11` once at the grown size. On
     the step `attack4_object_10` first shows the target is released from the bind
     and then takes the explosion, exactly once: 10 damage (14 in all with
     the four ticks) with `baseLaunch: 3, directionalLaunch: 'horizontal'`:
     the 10 is added first, then the target's new Launch Point is tripled
     and sent sideways along the rush, through the same shared launch as
     every other hit (from 110 before the blast: 120, a strength of 360,
     launched at 3600 units/s; a fresh target, 14 after the ticks and the
     blast, at 3 × 14 = 42, so 420 units/s). It is the
     technique's only launching hit. 0.55 s hitstun, 0.12 s hitstop
     (twice the contact's), 0.3 s blockstun. Releasing first keeps the bind
     from cancelling the launch. `attack4_9` is held for the whole blast (it lasts
     the longer of the blast and the explosion pose).
  7. RELEASE: only once the blast is over, the sphere is gone and #0001
     recovers through `attack4_10 → attack4_11 → attack4_12` once (15 steps, 0.25 s),
     still committed: no sphere, hit, bind or contact search.
  8. DONE: after `attack4_12` the technique is cleared and #0001 returns to
     Idle / normal control. A full sequence is exactly six hit events: the
     contact (0), four ticks (1 each, the first on the contact step) and the
     explosion (10): 14 in all.
  The bind is a combat status separate from hitstun (`CombatState.bind` /
  `unbind`, keyed by the technique as a token so it only ever releases its
  own hold). While bound a fighter can't act (`canAct()` is false): no walk,
  run, jump, Throw, attack, summon, technique, Shield or turning; its horizontal
  speed is held at 0, gravity and vertical collision still apply (an
  airborne catch falls and lands, the sphere following it), and it shows
  Hurt / Mid-air Hurt. It lasts until the explosion, or until the technique
  is cancelled. Ground dependency: from the first `attack4_1` frame to the end,
  #0001 must be supported by real ground, checked every step
  (`body.grounded`, not remembered from the start). Losing it in formation,
  mid-dash (running off a ledge; no hover over the gap, no snap back),
  during a miss's whiff release or after the hit (the recovery included)
  cancels the technique on that step: sphere removed, any bind
  released at once (ticks already dealt stay; no further tick or
  explosion) and #0001
  enters Fall, straight down. A hit on #0001 in any phase cancels it the same
  way and shows the normal Hurt (no armour, no invulnerability). A raised
  Shield blocks the contact from either side: the target pays 25 Energy
  and takes no Launch Point; there is no bind, no tick (not even the
  contact's), no sphere left on it and no explosion, and the technique ends
  at once (`blocked`), #0001 free on the next step. The target losing its bind meanwhile
  (a reset, or the Void taking it) ends it too. No Launch Point ends
  the hold: there is no knockout. Before starting, the technique requires all six fighter clips
  and all three sphere effects (and valid data); anything missing logs a
  warning and the press does nothing (no attack2 or other attack in its
  place): never a sphere around the wrong pose, an invisible sphere, bind
  or delayed hit, and no cooldown starts. The
  sphere is drawn over both fighters (terrain, shadows, clones, CPU, P1,
  sphere, projectiles, foreground), centred at the fighters' art-pixel
  scale with image smoothing off, never mirrored. Restart / rematch
  (`Fighter.reset`) and leaving the battle end any technique, its sphere,
  bind and pending explosion, and drop its owner and target references. The
  debug overlay draws the rushing sphere's hitbox as a dashed cyan box
  labelled `attack4 dash`, then a dashed cyan cross on the attached
  sphere's centre, and labels a bound fighter `bound`.
- Every fighter's central combat number is its **Launch Point**
  (`CombatState.launchPoint`): it starts at 0 (a new fighter, a Quick
  Battle restart / rematch, a new Practice fighter and every respawn after
  the Void all start from 0), grows by exactly the damage received, never
  goes below 0, has no maximum and is shown as a bare number (no % sign). A
  hit's `damage` is how much it adds: #0001's attack1 3, midair_attack1 3, attack2 5,
  midair_attack2 5, shuriken 1, the clone's attack1 3 or overhead midair_attack2 5,
  the Sphere Rush 0 on contact, 1 per tick and 10 on the explosion (a hit a
  Shield blocks adds nothing).
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
  launch's direction by up to 15 degrees with the direction it holds
  (launch steering, see Launch reaction above), never its speed. Its
  event carries `damage`, `launchPointBefore`, `launchPointAfter`,
  `baseLaunch` (the integer), `directionalLaunch`, `launchStrength`,
  `finalLaunch` (the world-space `{ x, y }` velocity given, steered),
  `launchSpeed` (its length), `hitstun` (the stun dealt, launch stun
  included), `perfect` (a perfect block), `point` (where the hit landed,
  for its effects) and `energyCost` (25 on a block, 0 on a hit or a
  perfect block). Launch Point
  never disables a fighter (`canAct()` never reads it) and never takes one
  out: only the Void does. On time-up in Quick Battle, level on points, the
  fighter with the lower Launch Point wins (a fighter still waiting to
  respawn counts the Launch Point it fell with); equal is a draw.
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
  fast to respond, never simply fast. Everything below is data on the
  character (`movement`, and each attack's movement fields), read by
  `Fighter.moveHorizontal` / `moveAttack`, with defaults so a fighter that
  declares none of the new fields still moves. #0001's values:
  - *Ground.* `acceleration` 4200 (rest to top speed in 5 steps, about
    0.08 s), `deceleration` 4200 (letting go stops a run in 5 steps, about
    10 units of slide: a short, natural stop, never an instant one, so it
    can stop right beside an opponent), `turnBoost` 2.6 (pressing against
    the way it moves brakes at acceleration × 2.6 until that way is spent;
    the rest of that step accelerates the new way: a full turn in about 7
    steps, never a one-step flip). Above top speed (after a Dash) the
    excess bleeds off at `overspeedDeceleration` (6000).
  - *Air.* `airAcceleration` 3000, `airTurnBoost` 2.0 and a light
    `airDeceleration` drag of 380: steering bends the drift instead of
    replacing it, a running jump carries its speed, a standing jump can be
    steered to full speed in 7 steps, and a full reversal takes about 10
    steps of a 44-step jump (the ground's takes 7: not the same). Above
    top speed (a launch, a jump out of a Dash), holding the way it already
    moves never slows the fighter beyond the drag; pressing against it
    brakes.
  - *Jump.* Unchanged in strength (Jump Power) and still buffered
    (`jumpBuffer` 0.12 s) with coyote time (`coyoteTime` 0.1 s). Takeoff
    is on the press step, and the jump only sets the upward speed: the run
    carries straight into the air (no horizontal reset), so run → jump →
    drift is one continuous motion.
  - *Higher jump.* A tap is the normal jump (Jump Power 2: 169 units),
    exactly its old arc. Jump still held `highJumpWindow` (0.15 s) after
    takeoff (held from the takeoff step on: a press a little longer than a
    tap) makes it the higher jump: from that step to its apex it rises
    under a lighter share of gravity, set once so it tops out at
    `highJumpHeight` (1.4) × the normal height, about 237 units
    (`Fighter.highJump`, `highJumpLift`). No kick in speed: the arc
    stretches. Decided once and kept whether Jump stays held or not; the
    apex, a hit, the air jump or the ground ends it. Ground jumps only
    (coyote time included); the air jump is never a higher one. Both CPUs
    let go of Jump inside the window (`jumpTapHold`): their jumps are
    normal ones.
  - *Air jump.* `airJumps` (1) more jump in the air, past coyote time, at
    `airJumpRatio` (0.9) × the normal jump's speed (about 137 units of
    rise), always full height, the jump clip from its first frame. A
    direction held sets off that way at least at top speed (a change of
    course); with none held the drift carries on. Landing gives it back,
    and so does a hit. Not while stunned, bound, shielding or in a
    technique; a jump pressed in the air with none left waits (the jump
    buffer) for the ground. It may cut short an attack that hit, like a
    ground jump. Quick Battle's CPU uses it to get back to the stage. A
    jump and an air jump from a stage's highest footing still stay well
    clear of the upper Void.
  - *Fast fall.* Down (the `down` input: S / ↓, D-pad or stick down,
    with no mobile Down button) held in the air while
    already descending speeds the fall up toward
    `fastFallSpeed` (1400) at `fastFallAcceleration` (12000) on top of
    gravity: never while rising, never a jump in speed and never slower
    than the fall already is; it lands on platforms like any fall. Aerial
    attacks may fast-fall (back to the ground after an aerial); a stun, a
    bind or an air Shield may not. A descent from a jump's apex takes
    about 9 steps instead of 21. `Fighter.fastFalling` is true on the
    steps it applies.
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
    attack; `lockMovement: false` keeps full locomotion. #0001: attack1 0.75 /
    0 / 0.4 (a running punch slides on, no creep), attack2 0.5 / 0 / 0.5 with
    its step-in, Throw 0.5 / 0.3 / 0.6, midair_attack1 all its drift and 0.85
    steering, midair_attack2 all its drift and 0.7: aerials follow the stick,
    so a juggle can be steered after. A technique owns
    its own movement instead (the Sphere Rush's 1050 rush) and a clone
    never moves: neither reads these.
  - *Combat input buffer.* A Throw / attack1 / attack2 press the fighter cannot act
    on yet (an attack or its recovery, a stun, a Dash, a cooldown, `shield`
    held for its Shield) is kept for `movement.attackBuffer` (0.15 s) and
    comes out on the first step it can, if it still maps to an attack that
    can start there (on the ground or in the air as the fighter is then).
    The latest such press wins; one older than the buffer never fires.
    Presses made during an impact freeze are kept and do not age through
    it. Only ordinary attacks: a summon or technique happens on its own
    press or not at all (one pressed while it cools down, in the air or
    while the fighter is busy is simply gone), and a reserved
    button, an air Throw or an attack without art is never kept. Kept
    presses keep their order with a buffered jump: a jump pressed before
    the attack goes first and the attack comes out next step, in the air;
    pressed on the same step, the ground attack goes first. So attack2 pressed
    shortly before attack1 ends starts on attack1's last step, and Shield → release
    → attack has no gap.
  - *Hit-cancels.* An attack that hits (a Shield's block does not count)
    may be cut short once its time reaches its `hitCancel` (seconds in, or
    null for never; the step its freeze ends at the earliest), by another
    attack, a jump or, on the ground, a Dash (a **Dash cancel**, for
    `energy.dashCancelCost`, 40 for #0001 against a plain Dash's 15: two
    from a full bar, and a third empties it, Shield included): walking, the
    Shield, summons and techniques still wait for its end, and left alone it plays out in
    full. A Dash asked for during the hit's freeze comes out the step it
    ends. It cuts into itself only once its own cooldown has run since it
    became cancellable. The cut attack's cooldown starts as it is cut. A
    whiff or a block keeps the whole recovery (and never Dash-cancels), so
    commitment is unchanged where it matters. #0001's attack1, attack2, midair_attack1
    and midair_attack2 open theirs from their strike; the Throw has none.
  - *Combo routes.* Movement, recovery and the buffer do most of the work;
    hitstun is only long enough for the intended follow-up to arrive.
    attack1 (0.32 s) is the starter, attack2 (0.28 s, a stronger freeze) the
    launcher, midair_attack1 the pursuit tool, midair_attack2 the spike, the
    shuriken spacing only. At low Launch Point these are true combos (the
    target never gets to act between the hits): attack1 → attack2 (attack2 pressed
    anywhere in about 0.2 s after attack1), attack1 → attack1 at close range (a string
    of two to six that attack1's own push ends), attack2 → attack1 while the launch is
    still a hop, attack2 → jump → midair_attack1 once it launches properly (Launch
    Point about 25–65), and midair_attack2 → land (fast) → attack1 on a grounded
    target. attack1 → Dash → attack1 chases attack1's push from 0 to about 85 Launch
    Point, so the starter has a follow-up where attack1 → attack2 no longer
    reaches. Launch Point breaks them by itself, with no combo counter: attack1's
    push carries the target out of attack2's reach past about 25, out of a Dash's
    past about 85, and attack2's launch out of a jump's reach past about 65, so
    at high Launch Point combat turns into pursuit and ring-outs. None loops:
    every hit adds to the Launch Point that sends the next one further, and
    a Dash chase spends the Energy the Shield needs, ending within seven
    hits. Stage geometry bends
    that into new routes (a rebound off a wall or a spiked floor is a moment
    to chase), never a loop: a wall's rebounds are capped until the target
    recovers, and a rebound flies past the attacker (Launch bounce).
  - *Hitstop.* Per hit, by strength: 0.05 s for attack1 and midair_attack1 (a
    crisp tap, never sticky on repeated jabs), 0.08–0.09 s for the kicks,
    0.12 s for the Sphere Rush blast, still the strongest; a hard rebound
    off the stage freezes its fighter alone for 0.05 s. It freezes the
    fighters, never the controls: presses made during it are kept, and a
    frozen fighter is drawn still where it stopped.
  - *Air combos.* With the air jump, the launch stun and aerials that
    steer, attack2 → jump → midair_attack1 leads on to a third hit: straight into
    another midair_attack1 or a midair_attack2 spike below about 20 Launch Point,
    and through the air jump into a midair_attack2 up to about 40 or a mid-air
    attack1 up to about 45. Gone by about 65, when attack2 launches past any jump.
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
  fighter's own top speed; an attack's steering and the speed it may keep on
  the ground are shares of that top speed); acceleration, deceleration, the
  turn boosts, the overspeed bleed, air control and drag, gravity, fall
  speed, the fast fall, coyote time, the jump and attack buffers, hitstun
  friction, launches, projectiles, the Shield and techniques (the
  Sphere Rush's 1050 dash) never depend on it, just as none of them depend
  on Jump Power. The shared
  Fighter applies both for Player 1, the CPU and Practice Ground alike. A
  declared tier the table lacks (or a fighter missing a Power) is logged and
  gets tier 2.
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
  or the other field. #0001's hits:

  | Hit | Damage | Base Launch | Directional Launch |
  | --- | --- | --- | --- |
  | Ground attack1 | 3 | 1 | horizontal |
  | Ground attack2 | 5 | 2 | vertical |
  | midair_attack1 | 3 | 2 | vertical |
  | midair_attack2 | 5 | 2 | reverse vertical |
  | Shuriken | 1 | 0 | none |
  | Sphere Rush contact | 0 | 0 | none |
  | Sphere Rush tick (on the contact step, then every 0.5 s while held) | 1 | 0 | none |
  | Sphere Rush explosion | 10 | 3 | horizontal |

  Launch never depends on either fighter's Jump or Speed Power.
- Combat architecture (Launch Point, Base Launch, Directional Launch, damage, hitboxes, hurtboxes, attack definitions,
  the Shield button's `defense` (typed, the Shield so far), Energy, launches,
  stun and blockstun, hitstop, cooldowns, summon and technique cooldowns, binds, typed
  numbered buttons, summons and techniques) is data-driven. numbered attacks 1 and 2,
  Throw (with its shuriken projectile), the attack3 Clone Attack (#0001's
  own summoning pose, then a summoned clone performing attack1, or
  midair_attack2 over an opponent with no ground behind it) and the attack4 Sphere Rush (a
  technique) are implemented through it with real artwork; Transform stays reserved
  (mapped to no attack) until real sprites exist, and no attack, projectile,
  clone or frame is ever fabricated. An attack whose frames fail to load is
  refused (no substitute pose, no invisible hitbox), and so is a Shield, and so
  is a clone summon whose startup pose, cloud or attack art is missing (no
  pose, no cooldown starts),
  and so is a technique with any of its clips missing.
- Quick Battle: 5 minutes (`CONFIG.battle.roundSeconds`, 300 seconds),
  first to `CONFIG.battle.pointsToWin` (3) points, against a CPU that uses the same fighter definition and fights with
  it at the difficulty chosen on Select Difficulty (6.3a): Quick Battle's
  combat AI, `CombatAIController` (`js/game/combat-ai.js`). `BattleScreen`
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
    only on the step its button goes down). Attacks, Throws, the Shield,
    summons and techniques (their own buttons, `attack3` and `attack4` for
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
    with Shield / a step / a jump / a Dash / a strike first; strike; Throw;
    approach; hold a spacing; jump in; Dash in; press a summon or technique
    button (a Clone Attack, or a Sphere Rush, which it saves for a safe
    distance or an opening rather than throwing it in point blank); make
    for the centre; wait), each built from the fighter's own data (reach
    from its hitboxes, Throw range and flight from its projectile, its
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
  `js/game/fighter-controller.js`, unused by every mode.
- Match score (`Battle.score`, `{ p1, p2 }`, the match's own: never on a
  fighter or its character, and not `round`): both start at 0. A fall into
  the Void scores exactly one point for the opponent, at once, if the
  opponent is itself in play; the fighter that fell never scores for it.
  When both are out together (taken on the same step, or one taken while
  the other still waits to respawn) that fall scores nothing, so a double
  K.O. never moves both toward the win. The global phase stays `fight`
  while a fighter waits to respawn: the timer runs on and the survivor
  plays on (an attack3 then has nobody to appear behind and falls back to
  attack1; nothing can hit, hold or aim at the absent fighter). The point that
  reaches 3 ends the match: no respawn for the loser, the `ko` phase (the
  K.O. beat) and then the result. Once time is up or the match is won, a
  fall scores nothing and nobody respawns. The result: 3 points wins
  (`reason: 'void'`); on time, more points wins (`'points'`), then the lower
  Launch Point (`'time'`), else a draw. Restart and rematch reset both scores
  to 0 and cancel any respawn wait.
- **Attack mechanics beyond a timed hitbox** (`js/game/combat.js`,
  `js/game/character.js`, `js/game/projectile.js`). Each is data on an
  attack (or a projectile), generic, and validated as its definition is
  built; #0002 is the fighter that uses them:
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
  - **Motion** (`motion`, one of four kinds; a motion attack never changes physical facing for a visual turn
    while it plays): `homing` hangs through its startup (no gravity), then
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
    hang, dash, plunge or lift would cancel the launch, so it must recover
    first (an air jump, a fast fall or landing).
  - **Per airtime** (`airUses`): how many times the attack may start before
    the fighter lands or is hit. **Free fall** (`freeFall: true`): started
    in the air, it leaves the fighter with no attack and no air jump until
    it lands or is hit.
  - **Body** (`passThrough: true`): no pushbox against other fighters while
    it plays. (`hurtboxes`): the fighter's own replaced while it plays.
  - **Piercing projectiles** (`pierce: { hits, interval }`): strike up to
    `hits` times, at least `interval` seconds apart, staying in play between
    them; the last resolves as the projectile's `finisher` (its own damage
    and launch, its stuns defaulting to the projectile's). A block stops it.
  - The CPU reads all of it from the data: each attack's reach swept along
    its motion (`attackReach`: a roll's path, a plunge's depth, a lift's
    height, a homing dash's lock-on range) for choosing and fearing it, the
    travel time before a moving strike can arrive, per-airtime starts and
    free fall; it uses a lift (a `rise` air attack) to recover when its air
    jump is spent, fast-falling first to end a launch, and never plans a
    summon or technique for a fighter with none.
- **#0002, the speedster.** Speed Power 3, Jump Power 2, a quicker start
  (acceleration 4800, air 3200) and a longer, faster Dash (1100 units/s for
  one pass of its four-frame clip, ≈220 units). No summon or technique. Its Shield is a
  ground guard only (`airAnimation: null`: in the air the Shield input does
  nothing, quietly). Its body: collider 26 × 62, pushbox 30, hurtboxes
  `{ -18, -64, 34, 32 }` (head and torso) and `{ -14, -32, 34, 32 }` (legs).
  Its moves:
  - **One-Two** (`attack1`, 4 frames at 15 fps): two strikes, the jab
    (frame 2: 1, no launch, holding the target) and the straight (frame 4:
    2, Base Launch 1 sideways); hit-cancel once the straight is out.
  - **Homing Attack** (`midair_attack1`, the ball): `homing`, range 240,
    speed 1000 for up to 0.22 s after a 0.15 s hang; 2, Base Launch 1
    upward; springs off at 760 up and 140 back, its air jump given back by a
    hit; a miss keeps a fifth of its speed. Once per airtime.
  - **Rapid Kicks** (`attack2`, 4 frames at 20 fps played twice): a 0.2 s
    wind-up, three kicks (1 each, no launch, each stun outlasting the gap to
    the next), then the finisher (3, Base Launch 2 sideways); no hit-cancel,
    a 1.2 s cooldown.
  - **Bounce Attack** (`midair_attack2`, the ball): `bounce`, a 0.1 s hang,
    then 1300 units/s down, rebounding at 900; 2, Base Launch 2 downward.
    Twice per airtime.
  - **Spin Attack** (`attack3`, the ball): `roll`, 400 + 0.8 × the run (up
    to 820), friction 420, after a 0.17 s curl; `passThrough`, the ball's
    hurtbox; 2, Base Launch 1 sideways; recoil 260 off a Shield; 1.6 s
    cooldown.
  - **Blue Tornado** (`midair_attack3`, 4 frames looped): `rise` at 460
    (≈175 units in all), three strikes that carry the target up (1 each),
    then the finisher (2, Base Launch 2 upward); once per airtime, and free
    fall after.
  - **Whirlwind** (`extra_attack`, 9 frames at 18 fps): sends its tornado
    (`extra_attack_object`) on frame 6: 260 units/s for 1.6 s, piercing
    five strikes 0.14 s apart, four of 1 that carry the target along and
    lift it 300 units/s, then the finisher (2, Base Launch 2 upward); a
    1.4 s cooldown.
  Its tuning comes from seeded CPU-vs-CPU fights against #0001 (120
  one-minute fights per level on Desert): at Hard and Brutal both fall
  into the Void about as often; at Easy and Medium #0002's CPU still wins
  more.

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
  no cooldowns. Each tag is its fighter's label: in Watch Mode the left card
  is CPU 1 and the right CPU 2, in the same two tag styles.
- Score dots (battles only, Quick Battle and Watch Mode): under each card, centred, one small CSS
  circle per point the match is played to (`pointsToWin`, 3), an outlined
  empty ring (○) filled solid white (●) for each point that fighter has
  scored, in order, the moment it is scored (the third fills as the K.O.
  beat starts). They survive respawns and reset only on a new match, a
  restart or a rematch. Practice Ground shows none.
- Fighter status (Canvas, `js/game/fighter-status.js`, drawn by the Arena
  over everything, the Void included, for each fighter in play whose body
  is on screen, at its interpolated position). Both parts are temporary:
  a thin **Energy bar** just above the name tag, only while Energy is
  below full (`energy < maxEnergy`; hidden at full, so a fresh or
  respawned fighter shows none): one bar, about the fighter's width, at
  least 44 CSS px, a black outline, a dark track and a bright purple fill
  (`#b026ff`), `energy / maxEnergy` wide, shrinking from the right; gray
  instead from the moment it empties and through the whole refill,
  proportional to what has come back, and gone, never purple, once full. Under the feet a row of
  **A3** / **A4** rings (attack3 `attack3`, attack4 `attack4`), one only for each
  summon or technique button actually cooling down (`abilityCooldowns.active`), in
  button order (`specialAttacks`): a lone ring centred under the
  fighter, two side by side, no slot kept for a ready one and nothing at
  all while both are ready. Each is a white ring with a black outline that
  fills clockwise from the top as the ability recovers (`progress = 1 −
  remaining / duration`, read straight from the cooldown state), the seconds left inside it (`4.3`, one decimal,
  rounded up so it never reads `0.0`), and its white `A3` / `A4` label
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
- **Hit effects** (`js/game/hit-fx.js`, owned by the Arena, so Quick Battle
  and Practice Ground alike): presentation only, fed each step's combat
  events. They never change a simulation step; a test steps the same fight
  with and without them and compares every step.
  - *Screen shake* scaled to the hit: 1.5 CSS px, plus 0.18 per point of
    damage and 1 per 320 units / s of launch speed, up to 14, dying away
    over about a quarter of a second; a block and a perfect block give a
    small one. Technique ticks (no stun, no launch) show nothing.
  - *Hit flash:* the fighter hit is drawn for one frame as a white
    silhouette of its own current pose (the frame itself where no canvas
    can be made). Never on a block.
  - *Sparks* where the hit landed (the event's `point`: the middle of the
    hitbox's overlap with the hurtbox it touched, or the shuriken, or the
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
  extra attack (`extra_attack`, #0001's Throw), K Transform (`transform`, reserved), L Shield (`shield`), U
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
  character's own ability names (#0001's Shuriken, Punch, Kick, Clone Attack
  and Sphere Rush) are presentation only: its `abilityNames`, keyed by move
  codename and read through `abilityName` (`js/data/abilities.js`), which
  gives an unnamed move its neutral `MOVES` label. No screen shows them yet. `` ` `` toggles a
  debug overlay (colliders, hurtboxes, attack hitboxes while active, each
  flying projectile's hitbox in magenta with its name, each clone's attack
  hitbox, labelled `clone attack1` or `clone midair_attack2`, on its active frame,
  the Sphere Rush's
  dashed cyan sphere box / centre with a `bound` label on a caught fighter,
  a `ricochet n` label on a fighter flying off its n-th rebound,
  solids with the main floor's block among them, and the Void's fixed kill
  line, dashed violet).
  For #0001, O (`attack3`) is the Clone Attack and M (`attack4`) the
  Sphere Rush, pressed directly like any numbered button (7.2); `,`
  (`attack5`) does nothing for it. The input
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
  in both. For #0001 (four numbered buttons) it is —

  ```
              [SPHERE]        [SHURIKEN]
        [CLONE]   [TRANSFORM] [SHIELD]
            [PUNCH] [KICK] [JUMP]
  ```

  The numbered attack buttons (`attack1` to `attack5`, `.tc-attack`) take
  numbered slots (`data-slot`, set by `setCharacter` through
  `attackSlots`): `attack1` is always slot 1 and `attack2` slot 2 (the
  bottom row, where Punch and Kick have always been), and the fighter's
  other numbered buttons fill slots 3, 4 and 5 in order, a honeycomb round
  Transform and Shield that never overlaps another button and widens the
  cluster by at most half a pitch:

  ```
             [4]  [5]  [EXTRA]
          [3]  [TRANSFORM] [SHIELD]
             [1]  [2]  [JUMP]
  ```

  So N numbered buttons use slots 1 to N, whatever kind of move each one
  is: 2 → 1–2, 3 → 1–3, 4 → 1–4 (#0001: the Clone Attack in slot 3 and
  the Sphere Rush in slot 4), 5 → 1–5. A summon or technique button is
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
  right). Each frame is chosen to read as the move. For #0001:
  **Shuriken** `extra_attack` frame 1 (`extra_attack_2`, the shuriken
  leaving the hand), **Punch** `attack1` frame 1 (`attack1_2`, the punch),
  **Kick** `attack2` frame 4 (`attack2_5`, the high kick), **Clone Attack**
  `attack3_summon` frame 2 (`attack3_summon_3`, the hand seal of the
  summoning pose it then performs), **Sphere Rush** `attack4_dash` frame 1
  (`attack4_5`, the rush). #0001's air previews are `midair_attack1_3`
  and `midair_attack2_2`. #0002 uses `attack1_4` / `midair_attack1_1`,
  `attack2_2` / `midair_attack2_5`, and `attack3_5` / `midair_attack3_3`.
  Whirlwind uses `projectileAnimations.extra_attack_object`, frame 2
  (`0002_extra_attack_object_3.png`), with a tornado SVG fallback.
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
  whatever it looks like, so #0001's Clone Attack is `attack3` and its
  Sphere Rush `attack4`. The combat glyphs are drawn slightly larger
  (`.tc-ability .icon`); every button shares the pressed state.
  Tapping the timer or the pause section beneath it (top centre, 7.3) pauses.
  Original circular buttons, translucent dark fill, white outlines; pressed
  buttons scale down and brighten to white — no hue.
  A reserved button (only Transform, and only while the fighter has none)
  uses a dashed outline and never shows nagging alerts; Shuriken, Shield,
  Punch, Kick, Clone Attack and Sphere Rush are solid. A button for a move
  the fighter does not have at all (left out of its `actions`, #0001's
  `attack5` included: `abilityPresence` in `js/ui/mobile-abilities.js`) is hidden:
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

- Entry point `index.html`; styles in `styles.css` (design tokens at the top);
  modules under `js/`; `.nojekyll` at the root.
- The repository is intended to be named `alva` (GitHub Pages path `/alva/`).
  If it still carries an older name, the site simply serves from that path —
  no code references the repository name.

### Combat CPU attack orientation

The combat controller supplies a live horizontal target direction for attack
initiation and each simulation step, including after both fighters move. Equal
coordinates retain the last valid direction; missing/out-of-play targets are
ignored. Ordinary attacks turn their hitboxes and pending projectile release
with their artwork. Motion attacks and techniques use separate visual facing
so their existing trajectory, collision and hit directions remain intact.
Spawned projectiles never turn with their owner. This does not synthesize
movement or Dash input and does not change manual or training facing.
