# Architecture decisions

The decisions that shape the codebase, why they were made, and what they
rule out. Each is current; when one changes, update it here.

## No framework, no build step

Plain HTML, CSS and vanilla ES modules, served as they are. The repository
is the site: GitHub Pages serves it from any sub-path, there is nothing to
install, and nothing can drift between source and build. It rules out
bundlers, TypeScript compilation, CSS preprocessors and package
dependencies, and requires every path to be relative.

## A fixed-step, deterministic simulation

The world advances in fixed 1/60 s steps from an accumulator; rendering
interpolates between steps. The same inputs and seeds give the same match
at any frame rate, which is what lets the tests replay fights step for
step and compare them. Presentation (hit effects, camera, slow motion)
may change how many steps run per frame, never what a step does.

## One character system, fighters as data

Shared systems implement the rules; each fighter's definition supplies its
values and optional capabilities ([the character system](../architecture/character-system.md)).
A new fighter is a new definition module and its art, never engine code.
Shared code never checks a fighter's id; a fighter-specific need becomes a
capability any fighter can opt into.

## One module per fighter, one registry

Each definition lives in `js/data/characters/<id>.js` beside its own
constants; `js/data/characters.js` only registers and validates them and
keeps the public lookups. `CHARACTERS` stays one mutable array for the
whole run, because the tests register temporary fighters on it.

## Universal codenames

Controls, moves, animations and files go by one universal vocabulary
([`codename_rule`](../../codename_rule)), so every system (input, combat,
the AI, the touch controls, localization) agrees on a fighter's buttons
without knowing the fighter. Player-facing names are presentation data.
The `mouvment` spelling is part of that contract.

## Typed buttons: ordinary attacks, summons, techniques

A numbered button's entry says what kind of move it is. That keeps the
loadout rules, the touch controls, the AI and cooldowns generic: none of
them knows that #0001's `attack4` is a technique.

## Refuse rather than fake

A move, Shield, Dash, projectile or effect without its real frames is
refused and logged. It keeps broken data visible and keeps the game
honest to its art.

## Movement rules as pure functions

`js/game/fighters/movement.js` holds the movement arithmetic as pure
functions over a profile, while the Fighter keeps all state and the step
order. The profile's every field is documented in one place, and the
rules can be tested against any values without building a fighter.

## Combat split by responsibility

The attack schema, the defense schema, the per-fighter combat state and
hit resolution are separate modules under `js/game/combat/`, beside the
projectile, summon, technique and launch-bounce runtimes. Hit resolution
is one `applyHit` for every kind of attacker.

## The simulation never touches the DOM

`js/game/` draws on the canvas it is given and nothing else; the HUD and
touch controls are interface components in `js/ui/`. The tests can run
the whole simulation without a document.

## One string table per language

Every player-facing string is a translation key; English copy of game
data is read from the registries that own it. The translator
(`js/localization/i18n.js`) is separate from the tables.

## A split stylesheet, cascade order preserved

The CSS is split into parts by area and linked in the original order
from `index.html`. Splitting at section boundaries, in order, keeps the
cascade exactly as it was while making each area's rules easy to find.

## Settings in one versioned store

Only `js/core/settings.js` touches storage: one versioned object, every
value checked on load, a migration path for older versions, and a safe
fallback when storage is missing or blocked.
