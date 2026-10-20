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
| `js/ui/` | Reusable interface pieces (DOM), the HUD and touch controls included. | config, core, data, localization, game (rendering helpers; the stage preview also its own stage collision and hazards), stages |

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
| `menu-navigator.js` | Menu navigation scopes for keyboard, pointer and the controller (its commands, and the controller cursor it owns), and the dialog stack (each dialog above the one that opened it, the layers beneath inert, focus restored). | `app.js`, `screens/discover-screen.js`, every dialog |
| `input-modality.js` | The input modality on `<html>` (mouse, touch, keyboard, gamepad), so hover and the focus ring only show for their own input. | `menu-navigator.js` |
| `input-manager.js` | `InputManager`: keyboard, touch and Player 1's controller merged into one snapshot per step with press edges, resolved for the fighter being played; the controller's menu commands and cursor stick; binding capture. | `app.js` |
| `gamepad-devices.js` | Controller identification (PlayStation / Xbox, conservatively), the normalized button names and each family's names for them. | `controller-manager.js`, `data/controller-profiles.js`, `ui/controller-glyphs.js` |
| `controller-manager.js` | `ControllerManager`: connected controllers, the four-controller limit, the status, Player 1's controller, refresh, and Player 1's buttons and sticks each frame. | `app.js`, `input-manager.js`, `ui/controller-dialog.js`, `screens/home-screen.js`, `ui/controller-editor.js` |
| `controller-resolver.js` | `ControllerResolver`, `compileProfile`: a controller's presses resolved into control codenames for a fighter and where it is (one owner per press, modifier first, directions, activations); the stick thresholds. | `input-manager.js`, `ui/controller-editor.js` |
| `settings.js` | The versioned settings store (the only module touching storage): language, Mobile Controls, custom touch layouts, Combat Assist, Combo Assist, each fighter's controller layout. | `app.js`, `localization/i18n.js`, `ui/settings-dialog.js`, `ui/touch-controls.js`, `ui/touch-layout-editor.js`, `ui/controller-editor.js` |
| `touch-layout.js` | Touch control ids, layout geometry and sanitizing. | `settings.js`, `ui/touch-controls.js`, `ui/touch-layout-editor.js` |
| `asset-loader.js` | Image loading and decoding. | `app.js` |
| `device.js` | Touch-first detection, orientation, reduced motion. | `app.js` |
| `web-app-install.js` | `WebAppInstall`: whether Alva can be installed as a web app and how (the browser's `beforeinstallprompt` kept for a real press, `appinstalled`, running as the installed app, `installPlatform` for the manual instructions). No service worker, no storage. | `app.js`, `ui/install-dialog.js` (through `app.install`), `screens/home-screen.js` |
| `audio-manager.js` | The audio stub (the game ships with no audio). | `app.js` |
| `organic-edge.js` | The wavering-edge geometry the Void and the Shield share. | `game/rendering/shield-fx.js`, `stages/stage-theme.js` |
| `utils.js` | Small helpers (`clamp`, `approach`, `el`, seeded RNG `mulberry32`, `deriveSeed`...). | most modules |

## `js/data/`

| Module | Owns | Used by |
| --- | --- | --- |
| `characters.js` | The fighter registry: `CHARACTERS`, `getCharacter`, `isPlayable`, `getPlayableCharacter`, `playableCharacters`, `characterFramePaths`; re-exports `framePath` / `frames`. Validates every definition (`assertLoadout`, `assertUniversalMovement`, `assertCombatRules`: damage tiers, repeat cooldowns, the Deflect's strike, universal Energy; `assertControllerLayout`; `assertSpecialAbilities`). | `core/app.js`, `localization/strings/en.js`, the battle, practice, home and character-select screens, `ui/fighter-roster.js`, `ui/fighter-browser.js`, `ui/touch-layout-editor.js` |
| `fighter-profiles.js` | Discover's editorial profile of each fighter, keyed by id (`FIGHTER_PROFILES`, `getFighterProfile`): ONE 1–5 difficulty rating (`DIFFICULTY_SCALE` says what each step means), its concise, two-sentence play-style description’s translation key (approach, strengths, vulnerabilities; no named moves) and `reviewedSourceHash`, the SHA-256 of its definition's source when last reviewed (`tests/fighters/profiles.test.mjs` fails once the definition changes). `assertFighterProfile` refuses anything else. Imports nothing; the game never reads it. | `ui/fighter-browser.js` |
| `characters/0001.js`, `characters/0002.js`, `characters/0003.js`, `characters/0004.js`, `characters/0005.js` | One fighter's whole definition each (`CHARACTER_0001`, `CHARACTER_0002`, `CHARACTER_0003`, `CHARACTER_0004`, `CHARACTER_0005`) and its own constants. | `characters.js` |
| `characters/helpers.js` | `framePath`, `frames`: the asset-path convention; `pad`: one binding of a fighter's controller layout. | `characters.js` and each definition |
| `controller-profiles.js` | Controller profiles: the actions a fighter can bind (from its definition), the universal defaults, each fighter's recommended layout (its own `controller.layout`, else a fallback), binding checks, conflicts, stored-profile sanitizing, and the layout rules the registry enforces. | `characters.js`, `core/settings.js`, `core/input-manager.js`, `core/app.js`, `ui/controller-editor.js` |
| `special-abilities.js` | The player-facing Special classification, each fighter's own `specialAbilities`: `isSpecialAbility`, `specialAbilities`, `performableMoves`, the rules (`specialAbilityProblems`, `assertSpecialAbilities`). Never inferred from a move's execution type, never read for combat or cooldowns. | `characters.js`, `controller-profiles.js`, `game/combat/move-status.js` |
| `loadout.js` | The attack loadout rules and `actions` readers. | `characters.js`, `game/fighters/fighter.js`, `game/ai/moveset.js`, `game/rendering/fighter-status.js`, `ui/mobile-abilities.js` |
| `movement.js` | The universal movement values every fighter runs on (`BASE_FIGHTER_MOVEMENT`), the check that refuses a definition's own, and the Discover copy for them. | `data/characters.js`, `game/fighters/fighter.js`, `game/rendering/hit-fx.js`, `localization/strings/en.js`, `screens/discover-screen.js` |
| `launch.js` | Launch Point, Base Launch, Directional Launch: registry, formula and validation; the damage tiers every hit deals (`ALLOWED_DAMAGE_VALUES`, `resolveHitDamage`). | `game/combat/attacks.js`, `combat.js`, `projectile.js`, `technique.js`, `localization/strings/en.js`, `screens/discover-screen.js` |
| `difficulty.js` | The four CPU levels and their profiles (`CAPABILITY`: which way each trait improves). | `core/app.js`, `game/battle.js`, `game/ai/cpu-intelligence/brain.js`, `localization/strings/en.js`, `screens/difficulty-select-screen.js` |
| `cooldowns.js` | The cooldown policy every move's reuse delay comes from: the 0.5 s repeat delay, 5 s for a move that deals 10, 3 s for a heal, a paralysis, a charm, a float or a fear (`moveImpact`, `cooldownClass`, `resolveCooldown`, the exceptional and routine effects). | `game/combat/attacks.js`, `technique.js`, `summon.js`, `move-status.js`, `fighters/fighter.js`, `rendering/fighter-status.js` |
| `abilities.js` | `abilityName`: a fighter's name for a move, or its neutral name. | `localization/strings/en.js`, `ui/mobile-abilities.js` |
| `maps.js`, `practice-map.js` | The Quick Battle stages (Yerma `desert`, Sol-Noir `city`, Asperitas, Adamaris: each one's ground, platforms, any platform hazard's `dynamic` block and any stage `hazards`); `stageSlots` (Select Stage's 24-slot roster from the registry); `traitId`; the training stage (kept out of `MAPS`). | `core/app.js`, the battle, map-select and practice screens, `screens/quick-battle-setup.js`, `localization/strings/en.js` |
| `stage-hazards.js` | The stage hazards' tuning by behaviour key (`STAGE_HAZARD_BEHAVIORS`, `VOLCANO`: period lengths, the eruption chance, phases, volleys, spacing), the volcano's states and phases, and the two volcanic rocks (`VOLCANIC_ROCKS`: reach, warning, flight, and each one's hit: 1 damage, Base Launch 1 or 2, upward). | `game/stage-hazards.js` |
| `platform-hazards.js` | The dynamic platforms' tuning by behaviour key (`PLATFORM_BEHAVIORS`, `CLOUD_DRIFT`: state durations, travel, fades, weights, relocation, the volume kept clear) and the hazard states (`HAZARD_STATES`, `ORDINARY_STATES`). | `game/platform-hazards.js` |

## `js/game/`

| Module | Owns | Used by |
| --- | --- | --- |
| `arena.js` | `Arena`: the fixed-step world (fighters, projectiles, clones, combat, hit effects, the Void and respawns), the camera and all canvas drawing. | `battle.js`, `practice.js` |
| `battle.js` | `Battle` (Quick Battle and Watch Mode): phases, timer, score, K.O., each side's controller (the player's Combat Assist setting to the player's alone). | `screens/battle-screen.js` |
| `practice.js` | `PracticeSession`: Player 1 (with the player's Combat Assist setting) and the optional training dummy, damage numbers. | `screens/practice-screen.js` |
| `physics.js` | Bodies, integration, stage collision (`StageCollision`, with its runtime platforms, static and dynamic (`active`, `prevX` / `prevY`, `interpolate`), and the queries `surfaceBelow`, `supportsAt`, `solidAcross` and `inVoid`; the ground's kind, finite or continuous (`resolveGround`, `GROUND_TYPES`); the visible `dangerZones`; `stepBody`, `carryBody` (riding a moving platform), `releaseGround` (letting go of a vanished one), `separate`, `dropThrough`). | `arena.js`, `platform-hazards.js`, `fighters/fighter.js`, `rendering/hit-fx.js`, `ui/stage-preview.js` |
| `stage-hazards.js` | `StageHazards` and `VolcanoController`: each stage hazard's own state machine and random stream (the volcano's dormant and erupting periods drawn at random, its eruption phases and volleys), the rocks in flight, where each lands, its warning (`rockWarning`, the stage's live `dangerZones`), its impact, and its hit through `CombatSystem.hazardHit` (no owner, never a projectile). | `arena.js`, `ui/stage-preview.js`, `stages/adamaris-theme.js` |
| `platform-hazards.js` | `PlatformHazards` and `HazardController`: each dynamic platform's own state machine and random stream (idle, horizontal, vertical, disappearing, hidden, reappearing), random reappearance and its validation (`findPlacement`, `clearAt`), separation (`assertHazardLayout`, `hazardEnvelope`, `hazardVolume`, `mainKeepOut`). | `arena.js`, `ui/stage-preview.js` |
| `fighters/fighter.js` | `Fighter`: the per-fighter state machine and step order (Combat Assist's approach included: who has it, its presses, its cancellations; and Combo Assist's queued follow-up: its one-entry queue, when a repeat registers it, what drops it, when it is tried); `separateFighters`; `COMBAT_ACTIONS`. | `arena.js`, `battle.js`, `practice.js`, `ai/moveset.js` |
| `fighters/movement.js` | The shared movement rules over the movement values. | `fighters/fighter.js`, `ai/cpu-intelligence/prediction.js` |
| `fighters/fighter-controller.js` | `PlayerController` (the one kind that may carry Combat Assist), `TrainingAIController`, `blankInput`, `jumpTapHold`, `HELD_CONTROLS`. | `fighters/fighter.js`, `ai/cpu-intelligence/executor.js`, `battle.js`, `practice.js`, `core/input-manager.js` |
| `combat/move-status.js` | A read-only view of a fighter's moves for presentation: each place's moves from the loadout (`abilityGroups`), each move's cooldown and any other restriction, read from the combat state (`moveCooldown`, `moveRestriction`, `abilityStatus`), whether it is Combo Assist's queued follow-up (`moveQueued`), and the move being performed now (`activeMove`, `activeSpecialAbility`). Writes nothing, keeps no time. | `ui/ability-hud.js`, `arena.js` |
| `combat/attacks.js` | The attack schema and phases, cooldowns from the cooldown policy (`js/data/cooldowns.js`), motions, pulls' validation (`resolvePull`), the `deflectProjectiles` capability's validation, melee or ranged (`isMeleeAttack`, `isRangedAttack`). | `combat/combat.js`, `combat/combat-state.js`, `combat/summon.js`, `combat/projectile.js`, `combat/deflect.js`, `fighters/fighter.js`, `ai/moveset.js`, `ai/cpu-intelligence/` |
| `combat/combat-assist.js` | Combat Assist's rules of measure: `assistsAttack`, `meleeGap`, `inReach`, `reachVector`, `approachMove`, `REACHED`, `approachClear`, `assistRange`, `assistSpeed`, `ASSIST_MARGIN`, and where a target sliding from a hit will stop (`slideStop`, `assistTarget`). | `fighters/fighter.js` |
| `combat/combo-assist.js` | Combo Assist's rules: `COMBO_PAIRS`, `comboAction` (attack1 pressed while its attack cools down asks for attack2, and the reverse, read from the fighter's loadout and cooldowns) and `followUpAction` (the follow-up a repeat during the attack queues, read from the attack really playing; the Fighter owns the queue). | `fighters/fighter.js` |
| `combat/hit-effects.js` | The shared hit effects (`paralyze`, `blockPush`, `quake`, `charm`, `float`, `fear`, `gaze`) and their validation; `FLOAT_RISE_SPEED`; `createHit`, a hit's schema (an attack's or a technique's burst); `hitReaches` (a quake reaches only a fighter on the ground, a gaze only one facing where it comes from); refuses any way past a Shield. | `combat/attacks.js`, `combat/projectile.js`, `combat/technique.js`, `combat/combat.js`, `fighters/fighter.js`, `data/stage-hazards.js` |
| `combat/offense.js` | The attack classification: what an action, entity or hit can do (attack, defense, both, neither), inferred from its data, the hit sources events name, and the refused Shield bypasses. | `combat/attacks.js`, `combat/projectile.js`, `combat/technique.js`, `combat/summon.js`, `combat/defense.js`, `data/characters.js`, `ai/cpu-intelligence/capabilities.js` |
| `combat/pull.js` | Pulls: attacks and projectiles drawing opponents in, each step (a `front` pull only the side it faces), and whom each holds (`Fighter.drawnBy`: a fighter drawn in never shoves the pull's owner, see `separateFighters`). | `arena.js` |
| `combat/defense.js` | The defense schema (the Shield, on the ground; air Shield fields refused). | `fighters/fighter.js` |
| `combat/deflect.js` | The Deflect schema: an attack definition with every Deflect's fixed strike (`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`). | `fighters/fighter.js` |
| `combat/combat-state.js` | `CombatState` (with the holds a hit leaves: paralysis, float, charm, fear, and `finished`, the attack that played out in full this step), `CooldownTimers`, `resolveEnergy` and the universal Energy rules (`MAX_ENERGY`, `DASH_ENERGY_COST`, `BLOCK_ENERGY_COST`, `DEFLECT_ENERGY_COST`). | `fighters/fighter.js` |
| `combat/combat.js` | `CombatSystem` (projectiles a live Deflect turns back, then hit resolution), launch reaction, `worldBox`. | `arena.js`, `combat/combat-assist.js`, `fighters/fighter.js` |
| `combat/projectile.js` | Projectiles, and what they do to each other (`clashProjectiles`: repel, erase); `turnBack` (shared by repel and the Deflect); the art's spin (`projectileAngle`). | `arena.js`, `fighters/fighter.js` |
| `combat/summon.js` | The summon system and its clones. | `arena.js`, `fighters/fighter.js`, `ai/moveset.js` |
| `combat/technique.js` | The technique runtime. | `fighters/fighter.js`, `ai/moveset.js`, `data/loadout.js` |
| `combat/launch-bounce.js` | Launch rebounds and their settings. | `fighters/fighter.js`, `rendering/hit-fx.js` |
| `ai/combat-ai.js` | `CombatAIController`: CPU Intelligence as the modes build it. | `battle.js` |
| `ai/moveset.js` | `readMoveset`, `hurtExtent`: a definition read raw. | `ai/cpu-intelligence/capabilities.js` |
| `ai/cpu-intelligence/brain.js` | `CpuIntelligence`: the layers run every step in their order, the choice to commit (the value of waiting, pressure resets, hit-confirm), plans (breaking off to a safer spot, deliberate waits), recovery, the intent-aware liveness, the attack orientation, test directives (see [CPU Intelligence](../systems/ai.md)). | `ai/combat-ai.js` |
| `ai/cpu-intelligence/capabilities.js` | `analyzeCapabilities` (each move's timing, reach, strikes and roles), `moveReady`, `MOVE_ROLES`. | the other CPU Intelligence modules |
| `ai/cpu-intelligence/perception.js` | `Perception`: the opponent as seen `latency` ago, recognized events, seen projectiles and clones. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/situation.js`, `stage-model.js` | `Situation` (the world model rebuilt each step), `StageModel` (ledges, surfaces, the live Void, dynamic platforms read live: where they are, whether they are solid or fading). | `ai/cpu-intelligence/` |
| `ai/cpu-intelligence/prediction.js` | The forward simulation on the game's rules: paths, jump arcs, move and projectile contact, launches, recoveries. | `ai/cpu-intelligence/` |
| `ai/cpu-intelligence/opponent-model.js` | `OpponentModel`: the opponent's observed habits (and how the CPU's own attacks fare against it), decaying. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/objective.js` | `MatchObjective`, `OBJECTIVES`: the match objective (build, finish, stabilize, protect, survive, force, regroup) from the score, the clock, overtime's tiebreak and both fighters' exposure, with dwell, events and impatience. | `ai/cpu-intelligence/brain.js`, `strategy.js` |
| `ai/cpu-intelligence/strategy.js` | `Strategy`: the strategic mode with hysteresis, under the match objective; the launch estimates now and after another hit (`danger`, `finish`, `dangerSoon`, `finishSoon`, `dangerAt` a spot). | `ai/cpu-intelligence/brain.js`, `objective.js` |
| `ai/cpu-intelligence/evaluator.js`, `values.js` | `Evaluator` (expected utility of every option), `LaunchJudge`, `KO_VALUE`. | `ai/cpu-intelligence/` |
| `ai/cpu-intelligence/defense.js` | `Defense`: threats and their answers. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/plans.js` | `makePlan`, `COMMITTED`, `CONTINUED`: each plan kind's steps (the deliberate `hold` and the `retreat` among them). | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/executor.js` | `Executor`: one legal input snapshot, the ledge guard. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/telemetry.js` | `Telemetry`, `STILL_LIMIT`, `WAIT_LIMIT`: counters, move usage, waits and their reasons, the debug trace and its events. | `ai/cpu-intelligence/brain.js` |
| `rendering/sprite-normalizer.js` | `SpriteSet`, sprite normalization and drawing. | `arena.js`, `core/app.js`, `ui/stage-preview.js` |
| `rendering/sprite-animator.js` | `SpriteAnimator`. | `fighters/fighter.js`, `combat/summon.js` |
| `rendering/camera.js` | The camera. | `arena.js` |
| `rendering/hit-fx.js` | Hit effects. | `arena.js` |
| `rendering/shield-fx.js` | The Shield's look. | `arena.js` (only) |
| `rendering/fighter-status.js` | The Energy bar, cooldown rings, the Special ability mark (`specialMarkRect`, `drawSpecialMark`), the charm's heart (`charmMarkRect`, `drawCharmMark`) and the fear's drop of cold sweat (`fearMarkRect`, `drawFearMark`). | `arena.js` |

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
(Regular Play's random draw and `randomStage`, which Select Stage's Random
Stage shares, the Battle's start parameters, where Select Fighter goes
next), used by `character-select-screen.js` and `map-select-screen.js`.
`map-select-screen.js` is Select Stage: the 24-slot stage roster, Random
Stage, the highlighted stage's details and its live preview.

Discover’s section registry (`js/screens/discover-screen.js`) orders three sections:
Fighters, Movement and Launch, opening on Fighters. All three use accessible
tab activation and keyboard/gamepad navigation. Movement and Launch read their
registries through English/French translation keys and scroll independently.

| `js/ui/` module | Owns | Used by |
| --- | --- | --- |
| `components.js` | Shared menu pieces (headers with their setup steps, each setup's steps and Quick Battle's play types, buttons, hint bars). | the setup screens, battle, practice, discover |
| `hud.js` | The battle and practice HUD (DOM). | `screens/battle-screen.js`, `screens/practice-screen.js` |
| `ability-hud.js` | The ability HUD (DOM): Player 1's moves, art and keyboard or controller inputs on a ground / air wheel, with their cooldowns, for keyboard and controller play. | `screens/battle-screen.js`, `screens/practice-screen.js` |
| `touch-controls.js` | `TouchControls`: both touch layouts, one press per touch, and Player 1's live move state on the combat buttons (`showStatus`, read through `game/combat/move-status.js`). | `screens/battle-screen.js`, `screens/practice-screen.js`, `touch-layout-editor.js` |
| `mobile-abilities.js` | Which touch buttons a fighter has, their names and art. | `touch-controls.js`, `controller-editor.js` |
| `touch-layout-editor.js` | The layout editor. | `core/app.js` |
| `fighter-roster.js` | The 48-slot roster (Select Fighter, Quick Battle's Select CPU, Watch Mode's CPU screens, Practice Ground's dialogs), with bottom-right fighter identifiers (`#0001`, etc.) on a translucent strip and small slot indices at the top-left. Shared difficulty stars and play-style modal; the action sits above Confirm, or at the bottom-right when Confirm is absent. Its preview head, status, Confirm and slot activation are hooks a subclass may override. | `screens/character-select-screen.js`, `screens/practice-screen.js`, `fighter-browser.js` |
| `fighter-browser.js` | `FighterBrowser`: the roster read-only for Discover's Fighters page (no Confirm; a press only selects), each fighter's difficulty stars in the Available badge's place and the Play style description button, using the shared `InfoDialog`. | `screens/discover-screen.js` |
| `sprite-art.js` | Portrait and preview painting. | `fighter-roster.js`, `hud.js`, `stage-preview.js` |
| `stage-preview.js` | Select Stage's live preview (and still thumbnails); an animated preview of a stage with hazards runs them in its own `StageCollision` and `PlatformHazards`. | `screens/map-select-screen.js` |
| `overlays.js` | The loading overlay, the confirm dialog (`alertdialog`), and the `role="dialog"` modals built on one shared base (its own navigation scope, the screen beneath inert, focus returned): the choice dialog (Quick Battle's play type) and the information dialog (`InfoDialog`, Discover's play-style description). | `core/app.js`, `ui/install-dialog.js` |
| `install-dialog.js` | `InstallDialog`, what Home's Download button opens: the explanation, the browser's own installation where offered, the manual steps per platform (`INSTALL_INSTRUCTIONS`), the installed state; on the shared modal base. | `core/app.js` |
| `settings-dialog.js`, `language-dialog.js` | Settings; the first-launch language chooser. | `core/app.js` |
| `controller-dialog.js` | Controller Connections (Home's controller button), and the status marks the Home indicator shares. | `core/app.js`, `screens/home-screen.js` |
| `controller-editor.js` | `ControllerControls`: Settings › Controls › Controller controls: the roster, each fighter's editor (every move row with its touch button's art, `rowArt`) and the binding dialog (capture, conflicts, save, cancel, restore). | `core/app.js` |
| `controller-glyphs.js` | Button names by family, binding and activation phrases, action names and descriptions, the controller diagram. | `controller-dialog.js`, `controller-editor.js` |
| `controller-cursor.js` | The circular controller cursor (part of the menu navigator). | `core/menu-navigator.js` |
| `credits.js`, `logo.js`, `icons.js` | The credits list, the wordmark, inline SVG glyphs. | Home, overlays, the HUD and touch controls |

## `js/stages/`

`index.js` registers the themes (`desert-theme.js`, `city-theme.js`,
`asperitas-theme.js`, `practice-theme.js`, each built on `stage-theme.js`)
for the arena and the stage preview; `perspective.js` is the one-point
perspective every stage shares. A theme may be handed the live runtime
platforms (`opts.platforms`, a `StageCollision`'s) to draw a stage's
moving platforms where they are now; Asperitas's does, and draws its
clouds from the map where none are handed over (a thumbnail).
