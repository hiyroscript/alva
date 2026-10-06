# The character system

Alva is built around one universal character system: shared game systems
that work for any fighter, and fighter definitions that supply everything
that makes a fighter itself. #0001 and #0002 are two members of the
roster, not templates: neither is the default that shared code falls back
to, and adding a third means writing its definition, not copying either.

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
| **Fighter configuration** | each fighter's definition, `js/data/characters/<id>.js` | The numbers and choices those rules read: its body, Energy, launch reaction, which buttons it has and what kind of move each is, every attack's timing, hitbox, damage, launch and motion. Never its movement. |
| **Fighter capabilities** | the same definition | Optional, explicit pieces a fighter may or may not have: a `defense` (the Shield, on the ground), a `deflect` (the Shield button in the air), the art for the universal Dash (a `mouvment` clip) and air dash (a `midair_mouvment` clip), projectiles (spinning ones with a `rotationSpeed`), summons, techniques, an extra attack, attack mechanics such as `motion`, `hits` or `deflectProjectiles`. A shared system checks for the capability, never for the fighter. |

So "#0001's Maximum Blue drags its target in" is a capability (a `pull`
on its projectile) running on the shared pull rule; "#0002's Homing
Attack dashes at its target" is a capability (a `homing` motion on its
attack) running on the shared motion rules; and "an attack keeps its
momentum" is a shared rule every fighter's attacks follow with their own
`momentum` values. "#0002 is faster" is not a thing a definition can say:
it runs exactly as fast as #0001, and its speed lives in its moves.

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
loadout rules (`assertLoadout`) and for movement of its own
(`assertUniversalMovement`: a `movement` profile, `powers` or any
universal movement field is refused); one that breaks a rule is refused
with every problem named.

## What a definition holds

| Field | Read by | Required |
| --- | --- | --- |
| `id`, `displayName`, `rosterSlot`, `available` | registry, roster, HUD | yes |
| `sourceFacing`, `animations`, `projectileAnimations`, `effectAnimations`, `animationFallbacks`, `visual` | sprite normalization, Fighter, renderers, roster | `animations` (with the states it needs) and `visual` |
| `collider`, `pushbox`, `hurtboxes` | physics, combat, the AI | yes |
| `movement`, `powers` | nobody: refused ([movement](../systems/movement.md)) | never (movement is universal) |
| `energy` | [Energy](../systems/energy.md) | no (defaults) |
| `launchReaction`, `launchBounce` | [launch](../systems/launch.md) | no (defaults) |
| `defense` | [defense](../systems/defense.md) | no (none: the Shield button does nothing on the ground) |
| `deflect` | [defense: the Deflect](../systems/defense.md#the-deflect) | no (none: the Shield button does nothing in the air) |
| `actions` | Fighter, the AI, touch controls, input | yes (`attack1`, `attack2` at least) |
| `attacks`, `projectiles`, `summons`, `techniques` | [combat](../systems/combat.md) | `attacks` for every mapped attack |
| `mobileAbilities` | touch controls ([input](../systems/input.md#touch-controls)) | no (neutral glyphs and names) |
| `abilityNames` | localization, touch labels | no (neutral names) |

Character-specific constants (playback rates, art measurements, shared
hitboxes) live beside the definition in the same module.

## What stays shared

Shared code may *mention* a fighter in a comment as an example ("e.g.
#0001's Hollow Purple"), but never branches on one. The tests enforce it:
no module of the engine, the AI, the touch controls or the status display
contains a fighter id or special-cases a numbered attack
([`tests/systems/loadout.test.mjs`](../../tests/systems/loadout.test.mjs)),
the loadout rules name no fighter, combat names no attack, and nothing in
`js/game/` reads touch art or ability names.

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
