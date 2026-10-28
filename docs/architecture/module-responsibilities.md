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
| `app.js` | `App`: the managers, the frame loop, cross-screen selection state (Quick Battle's, Watch Mode's and Local Play's), the Local Play session (`startLocalPlay`, `endLocalPlay`), preloading and loading fighters, the language and settings wiring. | `main.js` |
| `screen-manager.js` | Screen registration and transitions (`hidden` / `inert`), Back and `backTo` (back to a screen in the stack, e.g. Change fighters). | `app.js`, every screen |
| `menu-navigator.js` | Menu navigation scopes for keyboard, pointer and the controller (its commands, and the controller cursor it owns), and the dialog stack (each dialog above the one that opened it, the layers beneath inert, focus restored). | `app.js`, `screens/discover-screen.js`, every dialog |
| `input-modality.js` | The input modality on `<html>` (mouse, touch, keyboard, gamepad), so hover and the focus ring only show for their own input. | `menu-navigator.js` |
| `input-manager.js` | `InputManager`: keyboard, touch and Player 1's controller merged into one snapshot per step with press edges, resolved for the fighter being played; one `ControllerChannel` per player (Local Play's fighters each sample their own, controller only); the controllers' menu commands (with the player who sent each) and cursor stick, from the menu's owner; binding capture. | `app.js` |
| `gamepad-devices.js` | Controller identification (PlayStation / Xbox, conservatively), the normalized button names and each family's names for them. | `controller-manager.js`, `data/controller-profiles.js`, `ui/controller-glyphs.js` |
| `controller-manager.js` | `ControllerManager`: connected controllers, the four-controller limit, the status, Player 1's and Player 2's controllers, the Local Play session (each player's own controller, lost and recovered), refresh, and each player's buttons and sticks each frame. | `app.js`, `input-manager.js`, `ui/controller-dialog.js`, `screens/home-screen.js`, `ui/controller-editor.js` |
| `controller-resolver.js` | `ControllerResolver`, `compileProfile`: a controller's presses resolved into control codenames for a fighter and where it is (one owner per press, modifier first, directions read on their own stick, forward and back by facing, each stick's pushes as presses of their own with a deadzone and a release, activations); the stick thresholds. | `input-manager.js`, `ui/controller-editor.js` |
| `settings.js` | The versioned settings store (the only module touching storage): language, Mobile Controls, custom touch layouts, Automatic turn-around, each fighter's controller layout. | `app.js`, `localization/i18n.js`, `ui/settings-dialog.js`, `ui/touch-controls.js`, `ui/touch-layout-editor.js`, `ui/controller-editor.js` |
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
| `characters.js` | The fighter registry: `CHARACTERS`, `getCharacter`, `isPlayable`, `getPlayableCharacter`, `playableCharacters`, `characterFramePaths` (an ensemble's members' frames included); re-exports `framePath` / `frames` / `memberFramePath` / `memberFrames`. Validates every definition (`assertLoadout`, `assertEnsemble`, `assertUniversalMovement`, `assertCombatRules`: damage tiers, policy cooldowns, the Deflect's strike, universal Energy and move Energy costs; `assertControllerLayout`; `assertSpecialAbilities`). | `core/app.js`, `localization/strings/en.js`, the battle, practice, home and character-select screens, `ui/fighter-roster.js`, `ui/fighter-browser.js`, `ui/touch-layout-editor.js` |
| `fighter-profiles.js` | Discover's editorial profile of each fighter, keyed by id (`FIGHTER_PROFILES`, `getFighterProfile`): ONE 1–5 difficulty rating (`DIFFICULTY_SCALE` says what each step means), its concise, two-sentence play-style description’s translation key (approach, strengths, vulnerabilities; no named moves) and `reviewedSourceHash`, the SHA-256 of its definition's source when last reviewed (`tests/fighters/profiles.test.mjs` fails once the definition changes). `assertFighterProfile` refuses anything else. Imports nothing; the game never reads it. | `ui/fighter-browser.js` |
| `characters/0001.js`, `characters/0002.js`, `characters/0003.js`, `characters/0004.js`, `characters/0005.js`, `characters/0006.js`, `characters/0007.js`, `characters/0008.js`, `characters/0009.js` | One fighter's whole definition each (`CHARACTER_0001`, `CHARACTER_0002`, `CHARACTER_0003`, `CHARACTER_0004`, `CHARACTER_0005`, `CHARACTER_0006`, `CHARACTER_0007`, `CHARACTER_0008`, `CHARACTER_0009`) and its own constants. | `characters.js` |
| `ensemble.js` | Ensembles, a fighter drawn as several members: the schema (`isEnsemble`, `ensembleMembers`, `memberIds`, `memberClips`, `hasClip`, `clipFor`, `ensembleFramePaths`, `GROUP_CLIPS`, `ENSEMBLE_DEFAULTS`) and its rules (`ensembleProblems`, `assertEnsemble`): members, homes, group clips, who performs each move. Presentation data only. | `characters.js`, `loadout.js`, `ability-preview.js`, `game/rendering/ensemble.js` |
| `characters/helpers.js` | `framePath`, `frames`: the asset-path convention; `memberFramePath`, `memberFrames`: an ensemble member's (`<id>_<codename>_<member>_<frame>.png`); `pad` and `flick`: one binding of a fighter's controller layout (a button, or a stick pushed); `legacyPad`: one of the layout it recommended before. | `characters.js` and each definition |
| `controller-profiles.js` | Controller profiles: the actions a fighter can bind (from its definition), the binding shape (a button or a stick input, a modifier, a direction on its own named stick, an activation), the universal defaults, each fighter's recommended layout (its own `controller.layout`, else a fallback), binding checks, conflicts by physical input, stored-profile sanitizing, the upgrade of profiles saved before the sticks were named, and the layout rules the registry enforces, the strict comfort rules (`comfortProblems`) included. | `characters.js`, `core/settings.js`, `core/input-manager.js`, `core/controller-resolver.js`, `core/app.js`, `ui/controller-editor.js` |
| `special-abilities.js` | The player-facing Special classification, each fighter's own `specialAbilities`: `isSpecialAbility`, `specialAbilities`, `performableMoves`, the rules (`specialAbilityProblems`, `assertSpecialAbilities`). Never inferred from a move's execution type, never read for combat or cooldowns. | `characters.js`, `controller-profiles.js`, `game/combat/move-status.js` |
| `loadout.js` | The attack loadout rules and `actions` readers (a move's clips read from its performers for an ensemble). | `characters.js`, `game/fighters/fighter.js`, `game/ai/moveset.js`, `game/rendering/fighter-status.js`, `ui/mobile-abilities.js` |
| `movement.js` | The universal movement values every fighter runs on (`BASE_FIGHTER_MOVEMENT`), the check that refuses a definition's own, and the Discover copy for them. | `data/characters.js`, `game/fighters/fighter.js`, `game/rendering/hit-fx.js`, `localization/strings/en.js`, `screens/discover-screen.js` |
| `attack-movement.js` | How an attack moves its fighter, the same for every fighter: the shared Step-in (`STEP_IN`), each move's verdict (`resolveStepIn`, `stepInEligible`: `authored`, `universal`, `declined`, `exempt`), what an attack keeps of its speed (`resolveAttackCarry`) and the retired steering fields it refuses (`STEERING_FIELDS`): nothing held steers a grounded attack, and every move keeps the universal air control in the air. | `game/combat/attacks.js` |
| `launch.js` | Launch Point, Base Launch, Directional Launch: registry, formula and validation; the damage tiers every hit deals (`ALLOWED_DAMAGE_VALUES`, `resolveHitDamage`). | `game/combat/attacks.js`, `combat.js`, `projectile.js`, `technique.js`, `localization/strings/en.js`, `screens/discover-screen.js` |
| `difficulty.js` | The four CPU levels and their profiles (`CAPABILITY`: which way each trait improves). | `core/app.js`, `game/battle.js`, `game/ai/cpu-intelligence/brain.js`, `localization/strings/en.js`, `screens/difficulty-select-screen.js` |
| `cooldowns.js` | The cooldown policy every move's reuse delay comes from: none for an ordinary move, 5 s for a move that deals 10, 3 s for a heal, a paralysis, a charm, a float or a fear, each started as its move is released (`moveImpact`, `cooldownClass`, `resolveCooldown`, `RELEASE_EVENTS`, the exceptional and routine effects). | `game/combat/attacks.js`, `technique.js`, `summon.js`, `move-status.js`, `rendering/fighter-status.js` |
| `energy.js` | The Energy policy: one nominal price, `ENERGY_COST` (15), for a Dash, an air dash, a Dash cancel, a Deflect, a block and an ordinary construct move (`createsConstruct`, `constructEnergyCost`, `resolveMoveEnergy`). | `game/combat/combat-state.js`, `attacks.js`, `technique.js`, `summon.js` |
| `abilities.js` | `abilityName`: a fighter's name for a move, or its neutral name. | `localization/strings/en.js`, `ui/mobile-abilities.js` |
| `maps.js`, `practice-map.js` | The Quick Battle stages (Yerma `desert`, Sol-Noir `city`, Asperitas, Adamaris, Jökull `jokull`: each one's ground (a sectioned one's `sections` included), platforms, any platform hazard's `dynamic` block and any stage `hazards`); `stageSlots` (Select Stage's 24-slot roster from the registry); `traitId`; the training stage (kept out of `MAPS`). | `core/app.js`, the battle, map-select and practice screens, `screens/quick-battle-setup.js`, `localization/strings/en.js` |
| `stage-hazards.js` | The stage hazards' tuning by behaviour key (`STAGE_HAZARD_BEHAVIORS`, `VOLCANO`: period lengths, the eruption chance, phases, volleys, spacing), the volcano's states and phases, and the two volcanic rocks (`VOLCANIC_ROCKS`: reach, warning, flight, and each one's hit: 1 damage, Base Launch 1 or 2, upward). | `game/stage-hazards.js` |
| `platform-hazards.js` | The dynamic platforms' tuning by behaviour key (`PLATFORM_BEHAVIORS`, `CLOUD_DRIFT`: state durations, travel, fades, weights, relocation, the volume kept clear) and the hazard states (`HAZARD_STATES`, `ORDINARY_STATES`). | `game/platform-hazards.js` |

## `js/game/`

| Module | Owns | Used by |
| --- | --- | --- |
| `arena.js` | `Arena`: the fixed-step world (fighters, projectiles, clones, combat, hit effects, the Void and respawns), the camera and all canvas drawing. | `battle.js`, `practice.js` |
| `battle.js` | `Battle` (Quick Battle, Watch Mode and Local Play): phases (intro, fight, celebration), timer, score, the match's end exactly once (`finishMatch`, the frozen `final` result), each side's controller (the player's Automatic turn-around setting to the player's alone) and each CPU's celebration after the match. | `screens/battle-screen.js` |
| `match-stats.js` | `MatchStats`: each side's match statistics from the combat events and each CombatState's running totals, kept across lives, frozen with the result. | `battle.js` |
| `practice.js` | `PracticeSession`: Player 1 (with the player's Automatic turn-around setting, every fighter swapped in included) and the optional training dummy, damage numbers. | `screens/practice-screen.js` |
| `physics.js` | Bodies, integration, stage collision (`StageCollision`, with its runtime platforms, static and dynamic (`active`, `prevX` / `prevY`, `interpolate`), and the queries `surfaceBelow`, `supportsAt`, `solidAcross`, `floorSection` and `inVoid`; the ground's kind, finite or continuous, and a finite one's sections (`resolveGround`, `GROUND_TYPES`, `floors`, `breakableFloors`: a solid switched off, `active` false, is gone from every query); the visible `dangerZones`; `stepBody` (of two surfaces at one height, the one under a body's centre), `carryBody` (riding a moving platform), `releaseGround` (letting go of a vanished platform or a broken section, or standing on the neighbour still under it), `separate`, `dropThrough`). | `arena.js`, `platform-hazards.js`, `fighters/fighter.js`, `rendering/hit-fx.js`, `ui/stage-preview.js` |
| `stage-hazards.js` | `StageHazards`, `VolcanoController`, `IceSectionController` and `BlizzardController`: each stage hazard's own state machine and random stream (the volcano's dormant and erupting periods drawn at random, its eruption phases and volleys; an ice section's contacts, one per new footing, its fracture network, its break (critical, separating with its floor section switched off, collapsing, destroyed) and its falling pieces; the weather's checks, 0.25 each, and its calm, warning, blizzard and clearing), the rocks in flight, where each lands, its warning (`rockWarning`, the stage's live `dangerZones`, an unstable ice section's too), its impact, and its hit through `CombatSystem.hazardHit` (no owner, never a projectile); each step's `events`; a preview's `demo`. | `arena.js`, `ui/stage-preview.js`, `stages/adamaris-theme.js`, `stages/jokull-theme.js` |
| `platform-hazards.js` | `PlatformHazards` and `HazardController`: each dynamic platform's own state machine and random stream (idle, horizontal, vertical, disappearing, hidden, reappearing), random reappearance and its validation (`findPlacement`, `clearAt`), separation (`assertHazardLayout`, `hazardEnvelope`, `hazardVolume`, `mainKeepOut`). | `arena.js`, `ui/stage-preview.js` |
| `fighters/fighter.js` | `Fighter`: the per-fighter state machine and step order (requests and cancellation, the same for a player and a CPU: each button its own move, an attack that can harm cut short only in its hit-confirmed window, the Deflect and a move that harms nobody yielding to any valid request (`moveYields`), construct Energy paid as a move starts; facing, manual or Automatic turn-around's: who has it, when in the step it turns, which committed moves keep theirs); `separateFighters`; `COMBAT_ACTIONS`. | `arena.js`, `battle.js`, `practice.js`, `ai/moveset.js` |
| `fighters/turn-around.js` | Automatic turn-around's targeting: `isValidEnemy`, `closestEnemy` (squared world distance, ties to the first listed, no allocation), `facingToward`. Orientation only. | `fighters/fighter.js` |
| `fighters/movement.js` | The shared movement rules over the movement values: ordinary locomotion (`steer`) and an attack's own movement (`attackDrift`, `activationStep`: its Step-in, never steered on the ground, the universal air control in the air). | `fighters/fighter.js`, `ai/cpu-intelligence/prediction.js` |
| `fighters/fighter-controller.js` | `PlayerController` (the one kind that may carry Automatic turn-around), `TrainingAIController`, `blankInput`, `jumpTapHold`, `wallAhead` and `jumpFor` (the CPUs' choice of the normal jump or the Super Jump), `HELD_CONTROLS`. | `fighters/fighter.js`, `ai/cpu-intelligence/executor.js`, `battle.js`, `practice.js`, `core/input-manager.js` |
| `combat/move-status.js` | A read-only view of a fighter's moves for presentation: each place's moves from the loadout (`abilityGroups`), each move's cooldown and any other restriction, read from the combat state (`moveCooldown`, `moveRestriction`, `abilityStatus`), and the move being performed now (`activeMove`, `activeSpecialAbility`). Writes nothing, keeps no time. | `ui/ability-hud.js`, `arena.js` |
| `combat/attacks.js` | The attack schema and phases, cooldowns from the cooldown policy (`js/data/cooldowns.js`), motions, pulls' validation (`resolvePull`), the `deflectProjectiles` capability's validation, melee or ranged (`isMeleeAttack`, `isRangedAttack`). | `combat/combat.js`, `combat/combat-state.js`, `combat/summon.js`, `combat/projectile.js`, `combat/deflect.js`, `fighters/fighter.js`, `ai/moveset.js`, `ai/cpu-intelligence/` |
| `combat/hit-effects.js` | The shared hit effects (`paralyze`, `blockPush`, `quake`, `charm`, `float`, `fear`, `gaze`) and their validation; `FLOAT_RISE_SPEED`; `createHit`, a hit's schema (an attack's or a technique's burst); `hitReaches` (a quake reaches only a fighter on the ground, a gaze only one facing where it comes from); refuses any way past a Shield. | `combat/attacks.js`, `combat/projectile.js`, `combat/technique.js`, `combat/combat.js`, `fighters/fighter.js`, `data/stage-hazards.js` |
| `combat/offense.js` | The attack classification: what an action, entity or hit can do (attack, defense, both, neither), inferred from its data, the hit sources events name, the refused Shield bypasses, and the cancellation rule built on it (`yieldsToRequests`: a move that harms nobody, or a defense such as the Deflect, gives way to any valid request). | `combat/attacks.js`, `combat/projectile.js`, `combat/technique.js`, `combat/summon.js`, `combat/defense.js`, `data/characters.js`, `ai/cpu-intelligence/capabilities.js` |
| `combat/pull.js` | Pulls: attacks and projectiles drawing opponents in, each step (a `front` pull only the side it faces), and whom each holds (`Fighter.drawnBy`: a fighter drawn in never shoves the pull's owner, see `separateFighters`). | `arena.js` |
| `combat/defense.js` | The defense schema (the Shield, on the ground; air Shield fields refused). | `fighters/fighter.js` |
| `combat/deflect.js` | The Deflect schema: an attack definition with every Deflect's fixed strike (`DEFLECT_DAMAGE`, `DEFLECT_BASE_LAUNCH`). | `fighters/fighter.js` |
| `combat/combat-state.js` | `CombatState` (with the holds a hit leaves: paralysis, float, charm, fear; an attack's release, `releaseAttack`, starting its cooldown once), `CooldownTimers`, `resolveEnergy` and the universal Energy rules re-exported from `data/energy.js`. | `fighters/fighter.js` |
| `combat/combat.js` | `CombatSystem` (projectiles a live Deflect turns back, then hit resolution), launch reaction, `worldBox`. | `arena.js`, `fighters/fighter.js` |
| `combat/projectile.js` | Projectiles, and what they do to each other (`clashProjectiles`: repel, erase); `turnBack` (shared by repel and the Deflect); the art's spin (`projectileAngle`). | `arena.js`, `fighters/fighter.js` |
| `combat/summon.js` | The summon system and its clones. | `arena.js`, `fighters/fighter.js`, `ai/moveset.js` |
| `combat/technique.js` | The technique runtime. | `fighters/fighter.js`, `ai/moveset.js`, `data/loadout.js` |
| `combat/launch-bounce.js` | Launch rebounds and their settings. | `fighters/fighter.js`, `rendering/hit-fx.js` |
| `ai/combat-ai.js` | `CombatAIController`: CPU Intelligence as the modes build it. | `battle.js` |
| `ai/celebration.js` | `CelebrationController`: a CPU's behaviour once its match is over (ability spam, the Void run, idle, dash dance, jump spam), on a seeded stream of its own. | `battle.js` |
| `ai/moveset.js` | `readMoveset`, `hurtExtent`: a definition read raw. | `ai/cpu-intelligence/capabilities.js` |
| `ai/cpu-intelligence/brain.js` | `CpuIntelligence`: the layers run every step in their order, the choice to commit (the value of waiting, pressure resets, hit-confirm), plans (breaking off to a safer spot, deliberate waits), recovery, the intent-aware liveness, the attack orientation, test directives (see [CPU Intelligence](../systems/ai.md)). | `ai/combat-ai.js` |
| `ai/cpu-intelligence/capabilities.js` | `analyzeCapabilities` (each move's timing, reach, strikes and roles), `moveReady`, `MOVE_ROLES`. | the other CPU Intelligence modules |
| `ai/cpu-intelligence/perception.js` | `Perception`: the opponent as seen `latency` ago, recognized events, seen projectiles and clones. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/situation.js`, `stage-model.js` | `Situation` (the world model rebuilt each step), `StageModel` (ledges, surfaces, the live Void, dynamic platforms read live: where they are, whether they are solid or fading; a sectioned floor's breakable sections read live: their damage, and the main floor's edges moving in once one breaks). | `ai/cpu-intelligence/` |
| `ai/cpu-intelligence/prediction.js` | The forward simulation on the game's rules: paths, jump arcs, move and projectile contact, launches, recoveries. | `ai/cpu-intelligence/` |
| `ai/cpu-intelligence/opponent-model.js` | `OpponentModel`: the opponent's observed habits (and how the CPU's own attacks fare against it), decaying. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/objective.js` | `MatchObjective`, `OBJECTIVES`: the match objective (build, finish, stabilize, protect, survive, force, regroup) from the score, the clock, overtime's tiebreak and both fighters' exposure, with dwell, events and impatience. | `ai/cpu-intelligence/brain.js`, `strategy.js` |
| `ai/cpu-intelligence/strategy.js` | `Strategy`: the strategic mode with hysteresis, under the match objective; the launch estimates now and after another hit (`danger`, `finish`, `dangerSoon`, `finishSoon`, `dangerAt` a spot). | `ai/cpu-intelligence/brain.js`, `objective.js` |
| `ai/cpu-intelligence/evaluator.js`, `values.js` | `Evaluator` (expected utility of every option), `LaunchJudge`, `KO_VALUE`. | `ai/cpu-intelligence/` |
| `ai/cpu-intelligence/defense.js` | `Defense`: threats and their answers. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/plans.js` | `makePlan`, `COMMITTED`, `CONTINUED`: each plan kind's steps (the deliberate `hold` and the `retreat` among them). | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/executor.js` | `Executor`: one legal input snapshot, the ledge guard. | `ai/cpu-intelligence/brain.js` |
| `ai/cpu-intelligence/telemetry.js` | `Telemetry`, `STILL_LIMIT`, `WAIT_LIMIT`: counters, move usage, waits and their reasons, the debug trace and its events. | `ai/cpu-intelligence/brain.js` |
| `rendering/sprite-normalizer.js` | `SpriteSet`, sprite normalization and drawing. | `arena.js`, `rendering/ensemble.js`, `ui/stage-preview.js` |
| `rendering/sprite-animator.js` | `SpriteAnimator`. | `rendering/ensemble.js`, `combat/summon.js` |
| `rendering/ensemble.js` | A fighter's art as the game builds it (`buildFighterSprites`, `createAnimator`): a `SpriteSet` and a `SpriteAnimator`, or for an ensemble `EnsembleSprites` and `EnsembleAnimator` (every member on the fighter's state, the formation, gliding, the idle float); `fighterParts` (what is drawn of any fighter), `formationTargets`, `idlePose`, `poseBounds`. Presentation only. | `core/app.js`, `fighters/fighter.js`, `arena.js`, `rendering/hit-fx.js`, `ui/fighter-roster.js`, `ui/stage-preview.js` |
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
built from the setup screens), `local-play-screens` (Local Play's Select
local mode and setup, built from the same screens), `battle`, `practice`,
`discover`) is
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
| `components.js` | Shared menu pieces (headers with their setup steps, each setup's steps and Quick Battle's play types, buttons, the Settings gear and X of a dialog that pauses play (`dialogControls`), hint bars). | the setup screens, battle, practice, discover |
| `hud.js` | The battle and practice HUD (DOM). | `screens/battle-screen.js`, `screens/practice-screen.js` |
| `local-play.js` | Local Play's player identity: each player's tone (red, blue), badge and the setup's turn note. | `screens/local-play-screens.js`, `screens/battle-screen.js`, `ability-hud.js`, `hud.js` |
| `ability-hud.js` | The ability HUD (DOM): Player 1's moves, art and keyboard or controller inputs on a ground / air wheel, with their cooldowns, for keyboard and controller play; in Local Play one for each player, on that player's own controller (`setPlayer`). | `screens/battle-screen.js`, `screens/practice-screen.js` |
| `touch-controls.js` | `TouchControls`: both touch layouts, one press per touch, and Player 1's live move state on the combat buttons (`showStatus`, read through `game/combat/move-status.js`). | `screens/battle-screen.js`, `screens/practice-screen.js`, `touch-layout-editor.js` |
| `mobile-abilities.js` | Which touch buttons a fighter has, their names and art. | `touch-controls.js`, `controller-editor.js` |
| `touch-layout-editor.js` | The layout editor. | `core/app.js` |
| `fighter-roster.js` | The 48-slot roster (Select Fighter, Quick Battle's Select CPU, Watch Mode's CPU screens, Practice Ground's dialogs), with bottom-right fighter identifiers (`#0001`, etc.) on a translucent strip and small slot indices at the top-left. Shared difficulty stars and play-style modal; the action sits above Confirm, or at the bottom-right when Confirm is absent. Its preview head, status, Confirm and slot activation are hooks a subclass may override. | `screens/character-select-screen.js`, `screens/practice-screen.js`, `fighter-browser.js` |
| `fighter-browser.js` | `FighterBrowser`: the roster read-only for Discover's Fighters page (no Confirm; a press only selects), each fighter's difficulty stars in the Available badge's place and the Play style description button, using the shared `InfoDialog`. | `screens/discover-screen.js` |
| `sprite-art.js` | Portrait and preview painting. | `fighter-roster.js`, `hud.js`, `stage-preview.js` |
| `stage-preview.js` | Select Stage's live preview (and still thumbnails); an animated preview of a stage with hazards runs them in its own `StageCollision`, `PlatformHazards` and `StageHazards` (a demonstration: Jökull's wings break, and form again, on a timer of their own). | `screens/map-select-screen.js` |
| `overlays.js` | The loading overlay, the confirm dialog (`alertdialog`; over a paused game, with Settings and the X), and the `role="dialog"` modals built on one shared base (its own navigation scope, the screen beneath inert, focus returned): the choice dialog (Quick Battle's play type) and the information dialog (`InfoDialog`, Discover's play-style description). | `core/app.js`, `ui/install-dialog.js` |
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
