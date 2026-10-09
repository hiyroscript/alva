# Testing

```sh
node --test                                         # everything
node --test tests/systems/movement.test.mjs         # one file
node --test tests/fighters/0001/                    # one folder
```

The tests use Node's built-in runner and nothing else: no dependencies,
no browser. They run the real game modules (the Fighter, physics,
combat, the AI, the screens and the HUD) on a minimal fake DOM and a
recording stand-in for the canvas, so layout, scale and paint still need
a real browser.

## Layout

| Folder | What it covers |
| --- | --- |
| [`tests/systems/`](../../tests/systems/) | The shared mechanics, for every fighter: the shared combat rules over every fighter and every kind of hit at once (`combat-rules`: Energy 100 and its costs, the damage tiers 1 / 3 / 5 / 10, difficulty never touching a hit, the cooldowns, one movement baseline), movement, universal movement (`universal-movement`: the same values and trajectories for every fighter, the triple jump), momentum (`momentum`), the movement rules (`movement-rules`), the Dash and the air dash (`air-mouvment`), facing, Down, combos and hit-cancels, Energy, defense, the Deflect (`deflect`), Launch, launch reaction and bounce, loadouts, codenames, the fighter status, the hit effects on screen (`hit-fx`) and in play (`hit-effects`: unblockable, paralysis, block push, stall), pulls, projectile clashes, the projectiles' spin (`projectile-spin`), the cast form of techniques, Combat Assist (`combat-assist`: the player's melee approach, that it costs no Energy, its cancellations, and no CPU ever having it), stages, the combat AI, ability names, and a fighter that is not #0001. |
| [`tests/fighters/0001/`](../../tests/fighters/0001/), [`tests/fighters/0002/`](../../tests/fighters/0002/) | One fighter's own art and moves, with its exact values. #0001's are split by subject: `fighter-0001` (registration, art, data, names), `moves-0001` (every move's mechanic), `combos-0001` (its combo routes) and `cpu-0001` (the CPU playing it and facing it). |
| [`tests/fighters/profiles.test.mjs`](../../tests/fighters/profiles.test.mjs) | Every playable fighter's Discover profile: one whole 1–5 difficulty, a play-style description in both languages, and the profile-review guard (see below). |
| [`tests/fighters/fixtures/`](../../tests/fighters/fixtures/) | Test-only fighters (never in the game): `sample-fighter.mjs` (different moves on the same codenames), `loadout-fighters.mjs` (one fighter per loadout shape), `test-fighters.mjs` (fighters the screen tests register for their own run), `cooling-fighters.mjs` (#0001 with technique cooldowns, for alternative shared cooldown durations). |
| [`tests/interface/`](../../tests/interface/) | Screens (Discover: its three sections, the Fighters page, the play-style dialog), the HUD, touch controls and their layouts, Settings, localization, the stylesheet parts, the splash. |
| [`tests/integration/`](../../tests/integration/) | Whole modes: match scoring, the match clock and overtime in both battle modes (`overtime`: the closing Void, its waves, the elimination burst), difficulty, Watch Mode, Practice Ground, the empty roster, and every pairing of playable fighters. |
| [`tests/helpers/`](../../tests/helpers/) | `fighter-harness.mjs` (the Fighter on a test stage), `png-art.mjs` (a PNG decoder and just enough canvas to normalize a fighter's real frames), `stylesheet.mjs` (the CSS as the page links it). |

## Universal tests and fighter tests

Keep the two apart:

- **A test of a shared mechanic** should not pass only because one fighter
  happens to have particular values. Drive it from the values it is given
  (made-up values, like
  [`movement-rules.test.mjs`](../../tests/systems/movement-rules.test.mjs)),
  from each fighter's own data (loop over `playableCharacters()`, like
  [`roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs)),
  or from a fixture fighter.
- **A test of one fighter** checks its exact numbers, frames and
  interactions, and lives in `tests/fighters/<id>/`. Never turn a
  fighter's value into a universal requirement.

Many of the older system tests run their mechanic with #0001's definition
and check #0001's numbers (frame-exact timings, combo routes). They are
correct for #0001, and the same rules are covered for every fighter by the
character-neutral tests above.

## The fighter harness

[`tests/helpers/fighter-harness.mjs`](../../tests/helpers/fighter-harness.mjs)
builds real Fighters on a test stage with fake sprite sets (clip
metadata, no decoded PNGs):

| Export | Use |
| --- | --- |
| `harnessFor(character)` | The helpers below, bound to one fighter: `{ def, fakeSprites, makeFighter, duel }`. Prefer it for anything that is not about #0001. |
| `makeFighter({ character, sprites, x, y, facing, stage })` | One fighter, stepped by hand (`step(held)`). `sprites` defaults to the character's own. |
| `duel({ attackerCharacter, targetCharacter, ... })` | Two fighters, their projectiles and clones and the real `CombatSystem`, stepped in the battle's order. |
| `cpuFight(defA, defB, { seconds, seed, difficulty })` | Two seeded CPUs in a real fight. |
| `fakeSpritesOf(character, ...)` | A sprite set for any character. |
| `probeHit(spec)` | A bare hit for `CombatSystem.applyHit` that is no authored content: a probe of the launch, stun or hit-effect math dealing any damage (0 by default), every other field validated by `createAttackDefinition`. No authored hit may deal anything but 1, 3, 5 or 10. |
| `DEFAULT_CHARACTER`, `def`, `fakeSprites`, `BASE` | The compatibility default: #0001, because the first tests were written against it. Used deliberately by #0001's own tests; not a reference fighter. |
| `stageMap`, `STAGE`, `SIM_CTX`, `DT`, `steps`, `stepUntil`, `frameName`, `recordAttack`, `sequence`, `startupSteps` | Stage, timing and recording helpers. |

Screen tests that need fighters to pick register test-only ones from
`tests/fighters/fixtures/test-fighters.mjs` (`withTestFighters`,
`useTestFighters`) and take them out again, so `CHARACTERS` ends each run
as it started.

## The profile-review guard

Each fighter's Discover profile (`js/data/fighter-profiles.js`) stores
`reviewedSourceHash`, the SHA-256 of its definition
(`js/data/characters/<id>.js`, read as UTF-8 with line endings normalized
to `\n`) as it was when its rating and play-style description were last
reviewed. `profiles.test.mjs` recomputes it, so **any change to a
fighter's definition fails the suite** with "#0001 changed since its
Discover profile was reviewed. Recheck its difficulty and play-style
description, then update reviewedSourceHash in js/data/fighter-profiles.js
to …" (the new hash). That failure is the point: recheck the profile
against the change ([adding a fighter: the Discover
profile](../characters/adding-characters.md#7-the-discover-profile)),
then record the hash. It also fails while a playable fighter has no
profile, an invalid one, or a description missing in either language.

## Source checks

Some tests read source files to enforce architecture rules: no fighter id
or numbered-attack special case in the engine, the AI or the touch
controls; no language checks outside the translator; nothing but the
Arena drawing the Shield; no retired codename anywhere (the code, the
tests, the current documentation); every frame path existing. They scan
folders recursively, so new modules are covered without editing the
tests. [`UPDATES.md`](../../UPDATES.md) is the history record and is not
scanned for retired names.

## What the tests cannot check

Rendering (sprite scale and anchoring, layout, safe areas, the touch
controls' placement on a real screen), real input devices and
performance need a browser. Check desktop, a phone in landscape, both
playable fighters, Quick Battle, Watch Mode, Practice Ground, Settings,
the touch controls and both languages after visual or input changes.
