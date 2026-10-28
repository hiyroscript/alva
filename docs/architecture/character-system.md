# The character system

Alva is built around one universal character system: shared game systems
that work for any fighter, and fighter definitions that supply everything
that makes a fighter itself. #0001, #0002, #0003, #0004, #0005, #0006,
#0007, #0008 and #0009 are members of the roster, not templates: none is the default that shared code falls back
to, and adding another means writing its definition, not copying one.

**All fighters share universal baseline locomotion. Character identity
changes the moveset, not run/jump/Dash fundamentals.** Run speed,
acceleration, turning, air control, the jump and the triple jump, the
fast fall, the Dash, the air dash, coyote time and the buffers are one
set of numbers ([`js/data/movement.js`](../../js/data/movement.js),
[movement](../systems/movement.md)) that no definition may declare or
change: a fighter's lore, archetype or look never makes it run faster,
jump higher or fall heavier. What a fighter brings is its moves, their
motion included.

## Three layers

| Layer | Where | What it decides |
| --- | --- | --- |
| **Shared systems** | `js/game/`, `js/data/movement.js`, `js/data/loadout.js`, `js/data/launch.js` | The rules: how movement, attacks, hits, launches, the Shield, Energy, summons, techniques, the CPU, input and rendering work. The same for every fighter, and so are movement's numbers. |
| **Fighter configuration** | each fighter's definition, `js/data/characters/<id>.js` | The numbers and choices those rules read: its body, its Energy refill rate, launch reaction, which buttons it has and what kind of move each is, every attack's timing, hitbox, damage (one of the tiers 1, 3, 5, 10), launch and motion. Never its movement or Energy maximum/costs. Repeat cooldowns have a shared 0.5 s floor, with finite longer overrides. |
| **Fighter capabilities** | the same definition | Optional, explicit pieces a fighter may or may not have: a `defense` (the Shield, on the ground), a `deflect` (the Shield button in the air), the art for the universal Dash (a `mouvment` clip) and air dash (a `midair_mouvment` clip), projectiles (spinning ones with a `rotationSpeed`), summons, techniques, an extra attack, attack mechanics such as `motion`, `hits` or `deflectProjectiles`. A shared system checks for the capability, never for the fighter. |

So "#0001's Maximum Blue drags its target in" is a capability (a `pull`
on its projectile) running on the shared pull rule; "#0002's Homing
Attack dashes at its target" is a capability (a `homing` motion on its
attack) running on the shared motion rules; "#0003's Cherry Blossom
Impact can be jumped" is a capability (a `quake` on its burst's hit)
running on the shared rule of what a hit reaches; "#0004's song turns its
opponent's blows into its healing" is a capability (a `charm` on its
burst's hit) running on the shared hit resolution; "#0005's Deadlights
leave whoever looks into them floating" is a capability (a `float` and a
`gaze` on its burst's hit) running on the same rules; and "an attack keeps its
momentum" is a shared rule every fighter's attacks follow with their own
`momentum` values. "#0002 is faster" is not a thing a definition can say:
it runs exactly as fast as #0001, and its speed lives in its moves.

Nor can a definition say what is an attack, or that one gets past a
Shield. A move's **execution type** (an ordinary attack, a summon, a
technique, the Deflect: `actions` and the schema it is built by) says how
it works; its **classification** (attack, defense, both or neither:
`offense`, inferred by the shared
[`js/game/combat/offense.js`](../../js/game/combat/offense.js) from what
it can do) says what it is, and is never read from its name. Every move
that can deal damage, directly or through what it creates (a projectile, a
burst, a clone's strike, a projectile turned back), is an attack, and a
raised Shield blocks every attack ([combat: attack
classification](../systems/combat.md#attack-classification)). So a future
fighter's Shadow Clone, Meteor Storm or Poison Field obeys the Shield with
no code written for it.

## The registry

[`js/data/characters.js`](../../js/data/characters.js) is the one list of
definitions (`CHARACTERS`) and the lookups everything else uses:

| Export | Meaning |
| --- | --- |
| `CHARACTERS` | Every registered definition (a plain, mutable array, the same instance for the whole run: tests push and splice temporary fighters on it). |
| `getCharacter(id)` | Any definition, playable or not (the engine and its tests build fighters from it). |
| `isPlayable(def)`, `getPlayableCharacter(id)`, `playableCharacters()` | Whether one may be picked, preloaded or started; only `available: true` fighters are. Every route that selects, preloads or starts a fighter goes through these, so a disabled or missing one never starts, and with none playable every match route stays closed. |
| `characterFramePaths(def)` | Every frame a fighter needs before battle, each once. |
| `framePath`, `frames` | The art path convention (from `js/data/characters/helpers.js`). |

Every definition is validated as the registry loads: against the
loadout rules (`assertLoadout`), for movement of its own
(`assertUniversalMovement`: a `movement` profile, `powers` or any
universal movement field is refused) and against the combat rules
(`assertCombatRules`: every hit's damage one of 1, 3, 5 or 10, every
attack's repeat cooldown finite and non-negative, the Deflect's fixed strike, no
way past a Shield (`unblockable` and every other Shield bypass), any
`offensive` agreeing with what the move does, a summon's clone performing
an attack that strikes, and no Energy maximum or cost of its own), and
its `specialAbilities` (`assertSpecialAbilities`: only moves it really
performs, each once), and its Mash Combo pair (`assertMashCombo`: exactly
two distinct grounded close-range melee strikes, each a button's ground
move or its button-less `mash_attack`, never a Special, aerial,
projectile, summon, technique, 3 s / 5 s move, pull, carry, roll or dash,
or a strike reaching past close range: [combat](../systems/combat.md#mash-combo));
one that breaks a rule is refused with the problem named.

## What a definition holds

| Field | Read by | Required |
| --- | --- | --- |
| `id`, `displayName`, `rosterSlot`, `available` | registry, roster, HUD | yes |
| `sourceFacing`, `animations`, `projectileAnimations`, `effectAnimations`, `animationFallbacks`, `visual` | sprite normalization, Fighter, renderers, roster | `animations` (with the states it needs; `{}` for an ensemble) and `visual` |
| `ensemble` | [ensembles](#ensembles-one-fighter-several-members): the registry (`assertEnsemble`), the loadout rules, the renderers | no (an ordinary fighter: one body drawn as one) |
| `collider`, `pushbox`, `hurtboxes` | physics, combat, the AI | yes |
| `movement`, `powers` | nobody: refused ([movement](../systems/movement.md)) | never (movement is universal) |
| `energy` | [Energy](../systems/energy.md) | no: only its `regen` is its own (default 12); the bar and every cost are universal |
| `launchReaction`, `launchBounce` | [launch](../systems/launch.md) | no (defaults) |
| `defense` | [defense](../systems/defense.md) | no (none: the Shield button does nothing on the ground) |
| `deflect` | [defense: the Deflect](../systems/defense.md#the-deflect) | no (none: the Shield button does nothing in the air) |
| `actions` | Fighter, the AI, touch controls, input | yes (`attack1`, `attack2` at least) |
| `attacks`, `projectiles`, `summons`, `techniques` | [combat](../systems/combat.md) | `attacks` for every mapped attack |
| `mobileAbilities` | touch controls ([input](../systems/input.md#touch-controls)) | no (neutral glyphs and names) |
| `abilityNames` | localization, touch labels | no (neutral names) |
| `specialAbilities` | the controller editor's Special abilities category, the Special ability mark ([combat](../systems/combat.md#special-abilities)) | no (none Special); each entry a move it really performs |
| `mashCombo` | the [Mash Combo](../systems/combat.md#mash-combo): the Fighter (`mashPair`), the CPU (`caps.mash`) | yes: `{ attacks: [A, B] }`, its two grounded close-range melee strikes (`mash_attack`, a button-less partner, only where every button is taken by other kinds of moves) |

Character-specific constants (playback rates, art measurements, shared
hitboxes) live beside the definition in the same module.

## Ensembles: one fighter, several members

A fighter may be a group: several bodies seen together that move, fight
and get hurt as one (#0006, three sisters). Its `ensemble`
([`js/data/ensemble.js`](../../js/data/ensemble.js)) is presentation and
performance data, never more fighters:

| One, as every fighter | Its own, per member |
| --- | --- |
| definition, roster slot, `Fighter`, controller, input | an `id` (lowercase, in its file names) |
| body (position, velocity, ground, facing), collider, pushbox | a `home` in the group (art pixels from the origin, facing right, mirrored with facing) |
| hurtbox (one, as big as a single fighter's), Launch Point, Energy, Shield, cooldowns, stun, hitstop, launch | its own clips (`animations`, `<id>_<codename>_<member>_<frame>.png`) |
| the combat state: what it is doing | its own animator, playing the fighter's state in its own clip |

Every member plays the fighter's state on the same fixed step (the clips
the whole group plays, `GROUP_CLIPS`, are every member's), so one jump, one
Dash, one hit, one launch is all of them. A move names who performs it
(`members` on an attack, a technique and the Deflect: one member is the
ordinary case, the Deflect exactly one, two or three only for a combination
written as one move); the performer steps to the fighter's origin, the
others step back behind it, and everyone glides home after. A move is one
move however many perform it: one press, one cooldown, the strikes it
authors and nothing more. A picture of one of its moves (a touch button,
an ability tile) shows the clip of the move's first performer (`clipFor`).
The registry refuses a broken ensemble with every problem named
(`assertEnsemble`), and a move of an ordinary fighter may name no members.

At runtime ([`js/game/rendering/ensemble.js`](../../js/game/rendering/ensemble.js),
[rendering: ensembles](../systems/rendering.md#ensembles)) the fighter's
sprites are an `EnsembleSprites` and its animator an `EnsembleAnimator`,
answering the Fighter as a `SpriteSet` and a `SpriteAnimator` do; the shared
systems never ask which they have. The renderers draw `fighterParts(f)`:
one part for an ordinary fighter, one per member for an ensemble. Nothing
of it reaches movement, collision or combat.

## The Discover profile, beside the definition

Each playable fighter also has a **profile** in
[`js/data/fighter-profiles.js`](../../js/data/fighter-profiles.js), keyed
by its id and kept out of the definition on purpose:

| Field | Read by | Meaning |
| --- | --- | --- |
| `difficulty` | Discover's Fighters page (`js/ui/fighter-browser.js`) | ONE whole number from 1 to 5 rating together how hard the fighter is to pick up and play effectively and how hard it is to master (`DIFFICULTY_SCALE`). Never separate learning and mastery scores, never derived from move counts: a person assigns it. |
| `descriptionKey` | Discover's play-style dialog | The translation key of its play-style description (English and French): two concise sentences (about 30–55 words) on approach, strengths and vulnerabilities, without named moves, numerical mechanics, difficulty commentary, backstory or faster universal movement. |
| `reviewedSourceHash` | the tests only | The SHA-256 of `js/data/characters/<id>.js` (UTF-8, `\n` line endings) when the profile was last reviewed. |

The profile is editorial: the definition and the fighter's specification
stay authoritative for every mechanic, and the game never reads the
profile. It must follow the definition, though:
[`tests/fighters/profiles.test.mjs`](../../tests/fighters/profiles.test.mjs)
fails whenever a definition's source no longer matches its profile's
`reviewedSourceHash`, and whenever a playable fighter has no valid profile
or description in both languages. Changing a fighter therefore always
brings its rating and description back for review
([adding a fighter: the Discover
profile](../characters/adding-characters.md#7-the-discover-profile)). The
hash lives in the profile, never in the definition, so it never covers
itself.

## What stays shared

Shared code may *mention* a fighter in a comment as an example ("e.g.
#0001's Hollow Purple"), but never branches on one. The tests enforce it:
no module of the engine, the AI, the touch controls or the status display
contains a fighter id or special-cases a numbered attack (an ensemble is a
capability like any other: `isEnsemble(def)`, never an id)
([`tests/systems/loadout.test.mjs`](../../tests/systems/loadout.test.mjs)),
the loadout rules name no fighter, combat names no attack, and simulation code never reads presentation metadata. Canvas status and touch
buttons share the DOM-independent `js/data/ability-preview.js` selector.

Two shared conventions came from the first fighter and are fixed
references, not requirements on any fighter:

- the camera's reference height, `CONFIG.render.fighterHeight` (88 world
  units, what 52 art pixels make at the common art-pixel size): the view
  is sized for a fighter that tall whoever is picked;
- the common art-pixel size, 88 / 52 world units per art pixel: a fighter's
  `visual.height` is its reference clip's art height × 88 / 52, so all
  fighters' pixels are the same size on screen.

One shared runtime has a single form so far: the technique runtime
implements one shape of technique, the cast (stand committed, then let go
of a projectile, a burst round the fighter, or both), which #0001's
Unlimited Void and Hollow Purple use ([combat:
techniques](../systems/combat.md#techniques)). The capabilities its moves
needed (the `hover` motion, pulls, repelling and erasing projectiles, the
shared hit effects, a Shield's stall) were added to the shared systems as
data any fighter may use, never as #0001's own code; so were the Deflect
(and its `deflectProjectiles`), the air dash and the projectiles' spin,
which both fighters opt into through their definitions.

## Adding a fighter

[Adding a fighter](../characters/adding-characters.md) walks through it
end to end. Each current fighter's specification is in
[`docs/characters/`](../characters/README.md).
