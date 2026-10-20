# Alva documentation

Which document answers what, and which one decides.

| Document | Role |
| --- | --- |
| [`README.md`](../README.md) | What Alva is, how to run and deploy it, where everything is. |
| [`ALVA_SPEC.md`](../ALVA_SPEC.md) | **The product specification.** What the game must do and look like, and every shared rule. Authoritative: where a guide below disagrees with it, the guide is wrong. |
| [`docs/characters/`](characters/README.md) | Each fighter's own specification (part of `ALVA_SPEC.md`), and how to add one. |
| [`docs/architecture/`](architecture/overview.md), [`docs/systems/`](systems/), [`docs/gameplay/`](gameplay/), [`docs/development/`](development/) | How the code carries the specification out: modules, data fields, extension points, tests. |
| [`UPDATES.md`](../UPDATES.md) | History: the named updates (movement, effect, bounce) and other large changes, with their pull requests, commits, tuning and tests. |
| [`codename_rule`](../codename_rule) | The naming contract for controls, moves, animations and files. |
| [`character_rule`](../character_rule) | The owner's direction for fighters' abilities. Protected: never edited. |

## Architecture

- [Overview](architecture/overview.md): from the page to a hit, one fixed
  step, the constraints that keep the game working.
- [Module responsibilities](architecture/module-responsibilities.md): every
  module, what it owns and who uses it.
- [The character system](architecture/character-system.md): shared
  systems, fighter configuration and fighter capabilities.

## Systems

Shared by every fighter; each guide lists its modules, the data it
reads, what a fighter may leave out, and its tests.

- [Movement](systems/movement.md): universal movement (one set of values
  for every fighter), momentum, the triple jump, the Dash and the air
  dash.
- [Combat](systems/combat.md): loadouts, attacks, hit resolution,
  projectiles, summons, techniques, cooldowns, the player's requests (move
  cancellation, Combo Assist), Combat Assist.
- [Launch](systems/launch.md): Launch Point, Base and Directional Launch,
  launch reaction, rebounds.
- [Defense](systems/defense.md): the Shield button and the Shield.
- [Energy](systems/energy.md): the Dash, Combat Assist and Shield
  resource.
- [CPU Intelligence](systems/ai.md): the CPU, its layers, its match objectives and deliberate waits, difficulty, the benchmark and the playtesting checklist.
- [Input](systems/input.md): controls on every device, touch layouts and
  their editor, game controllers (PlayStation and Xbox: connections, the
  menu cursor, each fighter's controller layout and its editor).
- [Rendering](systems/rendering.md): sprites, the camera, effects, the
  status drawn with each fighter.
- [Localization](systems/localization.md): English and French.

## Characters

- [The roster](characters/README.md)
- [#0001](characters/0001.md), [#0002](characters/0002.md), [#0003](characters/0003.md), [#0004](characters/0004.md), [#0005](characters/0005.md)
- [Adding a fighter](characters/adding-characters.md)

## Gameplay

- [Quick Battle](gameplay/battle.md) (and difficulty)
- [Watch Mode](gameplay/watch-mode.md)
- [Practice Ground](gameplay/practice.md)
- [Stages](gameplay/stages.md) (Select Stage's 24-slot roster and Random
  Stage, Asperitas and its platform hazards, Adamaris and its volcano, and adding a stage)

## Development

- [Running and deploying](development/setup.md)
- [Testing](development/testing.md): the layout, the harness, universal
  and fighter-specific tests.
- [Conventions](development/conventions.md): codenames, code,
  stylesheets, documentation.
- [Architecture decisions](development/architecture-decisions.md)
