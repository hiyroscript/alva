# The character system

Alva is built around one universal character system: shared game systems
that work for any fighter, and fighter definitions that supply everything
that makes a fighter itself. #0001 and #0002 are two members of the
roster, not templates: neither is the default that shared code falls back
to, and adding a third means writing its definition, not copying either.

## Three layers

| Layer | Where | What it decides |
| --- | --- | --- |
| **Shared systems** | `js/game/`, `js/data/loadout.js`, `js/data/launch.js`, `js/data/powers.js` | The rules: how movement, attacks, hits, launches, the Shield, Energy, summons, techniques, the CPU, input and rendering work. The same for every fighter. |
| **Fighter configuration** | each fighter's definition, `js/data/characters/<id>.js` | The numbers and choices those rules read: its body, movement profile, Powers, Energy, launch reaction, which buttons it has and what kind of move each is, every attack's timing, hitbox, damage and launch. |
| **Fighter capabilities** | the same definition | Optional, explicit pieces a fighter may or may not have: a `defense` (the Shield, on the ground), a `deflect` (the Shield button in the air), a Dash (`dashSpeed` and a `mouvment` clip), an air dash (`airDashSpeed` and a `midair_mouvment` clip), projectiles (spinning ones with a `rotationSpeed`), summons, techniques, an extra attack, attack mechanics such as `motion`, `hits` or `deflectProjectiles`. A shared system checks for the capability, never for the fighter. |

So "#0002 is faster" is configuration (Speed Power 3, a higher
acceleration, a faster Dash); "#0001's Maximum Blue drags its target in"
is a capability (a `pull` on its projectile) running on the shared pull
rule; and "an attack keeps some of its momentum" is a shared rule every
fighter's attacks follow with their own `momentum` values.

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

Every definition is validated against the loadout rules as the registry
loads (`assertLoadout`); one that breaks a rule is refused with every
problem named.

## What a definition holds

| Field | Read by | Required |
| --- | --- | --- |
| `id`, `displayName`, `rosterSlot`, `available` | registry, roster, HUD | yes |
| `sourceFacing`, `animations`, `projectileAnimations`, `effectAnimations`, `animationFallbacks`, `visual` | sprite normalization, Fighter, renderers, roster | `animations` (with the states it needs) and `visual` |
| `collider`, `pushbox`, `hurtboxes` | physics, combat, the AI | yes |
| `powers`, `movement` | Fighter, [movement](../systems/movement.md) | yes |
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
