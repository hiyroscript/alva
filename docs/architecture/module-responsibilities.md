# Module responsibilities

Every module under `js/`, what it owns, and which modules use it. "Used
by" is the module's importers in the source (tests aside), so a change to
a module's exports reaches exactly those. The folders' roles:

| Folder | Role | May import |
| --- | --- | --- |
| `js/core/` | Application shell: the app controller, screens, input devices, settings, assets, device and utilities. | config, data, localization, game, screens, ui (only `app.js` wires everything together) |
| `js/data/` | Registries and pure data: fighters, Discover's fighter profiles, universal movement, loadout rules, Launch, difficulty, maps, ability names. No DOM, no simulation state. | config, other data (and `loadout.js` reads the technique clip-field names from `game/combat/technique.js`) |
| `js/game/` | The simulation (fighters, combat, AI, physics, modes) and its canvas rendering. No DOM except the canvas it is given. | config, core/utils, data, stages, localization (the arena's canvas label only) |
| `js/stages/` | Stage themes: procedural Canvas art, perspective, the Void's look. | core |
| `js/localization/` | The interface languages. | config, core/settings, data (for registry-owned English copy) |
| `js/screens/` | One module per screen: navigation and the screen's lifecycle. | everything below them |
| `js/ui/` | Reusable interface pieces (DOM), the HUD and touch controls included. | config, core, data, localization, game (rendering helpers), stages |

There are no import cycles (checked over every module).

## Entry

| Module | Owns | Used by |
| --- | --- | --- |
| `js/main.js` | Boot: creates the `App`, shows the boot error if it fails. | `index.html` |
| `js/config.js` | Global data-only configuration: render, simulation step and gravity, battle timing and scoring, roster size, keyboard and menu bindings, the control and move codenames (`ACTIONS`, `COMBAT_BUTTONS`, `NUMBERED_ATTACKS`, `MOVES`, `ACTION_LABELS`). | almost everything |

## `js/core/`

| Module | Owns | Used by |
| --- | --- | --- |
| `app.js` | `App`: the managers, the frame loop, cross-screen selection state (Quick Battle's and Watch Mode's), preloading and loading fighters, the language and settings wiring. | `main.js` |
| `screen-manager.js` | Screen registration and transitions (`hidden` / `inert`). | `app.js`, every screen |
| `menu-navigator.js` | Menu navigation scopes for keyboard, pointer and gamepad. | `app.js`, `screens/discover-screen.js` |
| `input-manager.js` | `InputManager`: keyboard, gamepad and touch merged into one snapshot per step with press edges. | `app.js` |
| `settings.js` | The versioned settings store (the only module touching storage): language, Mobile Controls, custom touch layouts, Combat Assist. | `app.js`, `localization/i18n.js`, `ui/settings-dialog.js`, `ui/touch-controls.js`, `ui/touch-layout-editor.js` |
| `touch-layout.js` | Touch control ids, layout geometry and sanitizing. | `settings.js`, `ui/touch-controls.js`, `ui/touch-layout-editor.js` |
| `asset-loader.js` | Image loading and decoding. | `app.js` |
| `device.js` | Touch-first detection, orientation, reduced motion. | `app.js` |
| `audio-manager.js` | The audio stub (the game ships with no audio). | `app.js` |
| `organic-edge.js` | The wavering-edge geometry the Void and the Shield share. | `game/rendering/shield-fx.js`, `stages/stage-theme.js` |
| `utils.js` | Small helpers (`clamp`, `approach`, `el`, seeded RNG `mulberry32`, `deriveSeed`...). | most modules |

## `js/data/`

| Module | Owns | Used by |
| --- | --- | --- |
| `characters.js` | The fighter registry: `CHARACTERS`, `getCharacter`, `isPlayable`, `getPlayableCharacter`, `playableCharacters`, `characterFramePaths`; re-exports `framePath` / `frames`. Validates every definition (`assertLoadout`, `assertUniversalMovement`, `assertCombatRules`: damage tiers, repeat cooldowns, the Deflect's strike, universal Energy). | `core/app.js`, `localization/strings/en.js`, the battle, practice, home and character-select screens, `ui/fighter-roster.js`, `ui/fighter-browser.js`, `ui/touch-layout-editor.js` |
| `fighter-profiles.js` | Discover's editorial profile of each fighter, keyed by id (`FIGHTER_PROFILES`, `getFighterProfile`): ONE 1–5 difficulty rating (`DIFFICULTY_SCALE` says what each step means), its concise, two-sentence play-style description’s translation key (approach, strengths, vulnerabilities; no named moves) and `reviewedSourceHash`, the SHA-256 of its definition's source when last reviewed (`tests/fighters/profiles.test.mjs` fails once the definition changes). `assertFighterProfile` refuses anything else. Imports nothing; the game never reads it. | `ui/fighter-browser.js` |
| `characters/0001.js`, `characters/0002.js` | One fighter's whole definition each (`CHARACTER_0001`, `CHARACTER_0002`) and its own constants. | `characters.js` |
| `characters/helpers.js` | `framePath`, `frames`: the asset-path convention. | `characters.js` and each definition |
| `loadout.js` | The attack loadout rules and `actions` readers. | `characters.js`, `game/fighters/fighter.js`, `game/ai/moveset.js`, `game/rendering/fighter-status.js`, `ui/mobile-abilities.js` |
| `lore.js` | Ordered narrative entry ids and localization keys for Discover’s Lore page. Introductory placeholders until sourced world or character stories are added; independent of gameplay and navigation. | `screens/discover-screen.js` |
| `movement.js` | The universal movement values every fighter runs on (`BASE_FIGHTER_MOVEMENT`), the check that refuses a definition's own, and the Discover copy for them. | `data/characters.js`, `game/fighters/fighter.js`, `game/rendering/hit-fx.js`, `localization/strings/en.js`, `screens/discover-screen.js` |
| `launch.js` | Launch Point, Base Launch, Directional Launch: registry, formula and validation; the damage tiers every hit deals (`ALLOWED_DAMAGE_VALUES`, `resolveHitDamage`). | `game/combat/attacks.js`, `combat.js`, `projectile.js`, `technique.js`, `localization/strings/en.js`, `screens/discover-screen.js` |
| `difficulty.js` | The four CPU levels and their profiles. | `core/app.js`, `game/battle.js`, `game/ai/combat-ai.js`, `localization/strings/en.js`, `screens/difficulty-select-screen.js` |
| `abilities.js` | `abilityName`: a fighter's name for a move, or its neutral name. | `localization/strings/en.js`, `ui/mobile-abilities.js` |
| `maps.js`, `practice-map.js` | The Quick Battle stages; the training stage (kept out of `MAPS`). | `core/app.js`, the battle, map-select and practice screens, `localization/strings/en.js` |

## `js/game/`

| Module | Owns | Used by |
| --- | --- | --- |
| `arena.js` | `Arena`: the fixed-step world (fighters, projectiles, clones, combat, hit effects, the Void and respawns), the camera and all canvas drawing. | `battle.js`, `practice.js` |
| `battle.js` | `Battle` (Quick Battle and Watch Mode): phases, timer, score, K.O., each side's controller (the player's Combat Assist setting to the player's alone). | `screens/battle-screen.js` |
| `practice.js` | `PracticeSession`: Player 1 (with the player's Combat Assist setting) and the optional training dummy, damage numbers. | `screens/practice-screen.js` |
| `physics.js` | Bodies, integration, stage collision (`StageCollision`, with the queries `surfaceBelow`, `supportsAt`, `solidAcross` and `inVoid`; `stepBody`, `separate`, `dropThrough`). | `arena.js`, `fighters/fighter.js`, `rendering/hit-fx.js` |
| `fighters/fighter.js` | `Fighter`: the per-fighter state machine and step order (Combat Assist's approach included: who has it, its presses, its cancellations); `separateFighters`; `COMBAT_ACTIONS`. | `arena.js`, `battle.js`, `practice.js`, `ai/moveset.js` |
| `fighters/movement.js` | The shared movement rules over the movement values. | `fighters/fighter.js`, `ai/combat-ai.js` |
| `fighters/fighter-controller.js` | `PlayerController` (the one kind that may carry Combat Assist), `TrainingAIController`, `blankInput`, `jumpTapHold`, `HELD_CONTROLS`. | `fighters/fighter.js`, `ai/combat-ai.js`, `battle.js`, `practice.js`, `core/input-manager.js` |
| `combat/attacks.js` | The attack schema and phases, validated repeat cooldowns (`js/data/cooldowns.js`), motions, pulls' validation (`resolvePull`), the `deflectProjectiles` capability's validation, melee or ranged (`isMeleeAttack`, `isRangedAttack`). | `combat/combat.js`, `combat/combat-state.js`, `combat/summon.js`, `combat/projectile.js`, `combat/deflect.js`, `fighters/fighter.js`, `ai/combat-ai.js`, `ai/moveset.js` |
| `combat/combat-assist.js` | Combat Assist's rules of measure: `assistsAttack`, `meleeGap`, `reachVector`, `approachMove`, `REACHED`, `approachClear`, `assistRange`, `assistSpeed`, `ASSIST_MARGIN`. | `fighters/fighter.js` |
| `combat/hit-effects.js` | The shared hit effects (`unblockable`, `paralyze`, `blockPush`) and their validation. | `combat/attacks.js`, `combat/projectile.js`, `combat/technique.js` |
| `combat/pull.js` | Pulls: attacks and projectiles drawing opponents in, each step. | `arena.js` |
| `combat/defense.js` | The defense schema (the Shield, on the ground; air Shield fields refused). | `fighters/fighter.js` |
| `combat/deflect.js` | The Deflect schema: an attack definition with every Deflect's fixed strike (`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`). | `fighters/fighter.js` |
| `combat/combat-state.js` | `CombatState`, `CooldownTimers`, `resolveEnergy` and the universal Energy rules (`MAX_ENERGY`, `DASH_ENERGY_COST`, `BLOCK_ENERGY_COST`, `DEFLECT_ENERGY_COST`). | `fighters/fighter.js` |
| `combat/combat.js` | `CombatSystem` (projectiles a live Deflect turns back, then hit resolution), launch reaction, `worldBox`. | `arena.js`, `combat/combat-assist.js`, `fighters/fighter.js`, `ai/combat-ai.js` |
| `combat/projectile.js` | Projectiles, and what they do to each other (`clashProjectiles`: repel, erase); `turnBack` (shared by repel and the Deflect); the art's spin (`projectileAngle`). | `arena.js`, `fighters/fighter.js` |
| `combat/summon.js` | The summon system and its clones. | `arena.js`, `fighters/fighter.js`, `ai/moveset.js` |
| `combat/technique.js` | The technique runtime. | `fighters/fighter.js`, `ai/moveset.js`, `data/loadout.js` |
| `combat/launch-bounce.js` | Launch rebounds and their settings. | `fighters/fighter.js`, `rendering/hit-fx.js` |
| `ai/combat-ai.js` | `CombatAIController`. | `battle.js` |
| `ai/moveset.js` | `readMoveset`, `hurtExtent`. | `ai/combat-ai.js` |
| `rendering/sprite-normalizer.js` | `SpriteSet`, sprite normalization and drawing. | `arena.js`, `core/app.js`, `ui/stage-preview.js` |
| `rendering/sprite-animator.js` | `SpriteAnimator`. | `fighters/fighter.js`, `combat/summon.js` |
| `rendering/camera.js` | The camera. | `arena.js` |
| `rendering/hit-fx.js` | Hit effects. | `arena.js` |
| `rendering/shield-fx.js` | The Shield's look. | `arena.js` (only) |
| `rendering/fighter-status.js` | The Energy bar and cooldown rings. | `arena.js` |

## `js/localization/`

| Module | Owns | Used by |
| --- | --- | --- |
| `i18n.js` | The translator and marked strings. | `core/app.js`, every screen, most of `ui/`, `game/arena.js` |
| `strings/en.js`, `strings/fr.js` | The string tables. | `i18n.js` |
| `format.js` | `formatList`. | `i18n.js`, `strings/fr.js` |

## `js/screens/` and `js/ui/`

Each screen (`splash`, `home`, `mode-select`, `difficulty-select`,
`character-select`, `quick-cpu-screen` (Custom Play's Select CPU, built
from Select Fighter), `map-select`, `watch-screens` (Watch Mode's setup,
built from the setup screens), `battle`, `practice`, `discover`) is
registered by `core/app.js` and owns its own section of `index.html`.
`quick-battle-setup.js` is no screen: it is Quick Battle's setup logic
(Regular Play's random draw, the Battle's start parameters, where Select
Fighter goes next), used by `character-select-screen.js` and
`map-select-screen.js`.

Discover’s section registry (`js/screens/discover-screen.js`) orders Fighters,
Lore, Movement and Launch, opening on Fighters. Lore reads `data/lore.js` and
English/French translation keys; it shares the accessible tab activation,
independent scrolling and keyboard/gamepad navigation of the reference pages.

| `js/ui/` module | Owns | Used by |
| --- | --- | --- |
| `components.js` | Shared menu pieces (headers with their setup steps, each setup's steps and Quick Battle's play types, buttons, hint bars). | the setup screens, battle, practice, discover |
| `hud.js` | The battle and practice HUD (DOM). | `screens/battle-screen.js`, `screens/practice-screen.js` |
| `touch-controls.js` | `TouchControls`: both touch layouts. | `screens/battle-screen.js`, `screens/practice-screen.js`, `touch-layout-editor.js` |
| `mobile-abilities.js` | Which touch buttons a fighter has, their names and art. | `touch-controls.js` |
| `touch-layout-editor.js` | The layout editor. | `core/app.js` |
| `fighter-roster.js` | The 48-slot roster (Select Fighter, Quick Battle's Select CPU, Watch Mode's CPU screens, Practice Ground's dialogs), with bottom-right slot numbers and left-aligned names on a translucent strip. Shared difficulty stars and play-style modal; the action sits above Confirm, or at the bottom-right when Confirm is absent. Its preview head, status, Confirm and slot activation are hooks a subclass may override. | `screens/character-select-screen.js`, `screens/practice-screen.js`, `fighter-browser.js` |
| `fighter-browser.js` | `FighterBrowser`: the roster read-only for Discover's Fighters page (no Confirm; a press only selects), each fighter's difficulty stars in the Available badge's place and the Play style description button, using the shared `InfoDialog`. | `screens/discover-screen.js` |
| `sprite-art.js` | Portrait and preview painting. | `fighter-roster.js`, `hud.js`, `stage-preview.js` |
| `stage-preview.js` | Select Stage's live preview. | `screens/map-select-screen.js` |
| `overlays.js` | The loading overlay, the confirm dialog (`alertdialog`), and the `role="dialog"` modals built on one shared base (its own navigation scope, the screen beneath inert, focus returned): the choice dialog (Quick Battle's play type) and the information dialog (`InfoDialog`, Discover's play-style description). | `core/app.js` |
| `settings-dialog.js`, `language-dialog.js` | Settings; the first-launch language chooser. | `core/app.js` |
| `credits.js`, `logo.js`, `icons.js` | The credits list, the wordmark, inline SVG glyphs. | Home, overlays, the HUD and touch controls |

## `js/stages/`

`index.js` registers the themes (`desert-theme.js`, `city-theme.js`,
`practice-theme.js`, each built on `stage-theme.js`) for the arena and the
stage preview; `perspective.js` is the one-point perspective every stage
shares.
