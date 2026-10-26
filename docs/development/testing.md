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
| [`tests/systems/`](../../tests/systems/) | The shared mechanics, for every fighter: the shared combat rules over every fighter and every kind of hit at once (`combat-rules`: Energy 100 and its costs, the damage tiers 1 / 3 / 5 / 10, difficulty never touching a hit, the cooldowns, one movement baseline), the cooldown policy (`cooldown-policy`: 5 s for 10 damage, 3 s for a heal, a paralysis, a charm, a float or a fear, nothing for anything else, precedence, refused authored values, the roster's table, the CPU reading the same cooldowns), movement, universal movement (`universal-movement`: the same values and trajectories for every fighter, the triple jump), momentum (`momentum`), the movement rules (`movement-rules`), attack mobility (`attack-mobility`: the tiers, every attack naming its own, quick strikes keeping the run, steering in every phase, heavy and planted moves staying committed), the Dash and the air dash (`air-mouvment`), facing, Down, the platform drop (`drop-through`: every fighter, held Down never dropping, the floor, a deck and a solid never, the states that rule it out, a moving cloud, every device, the CPU never pressing Down on the ground), combos and hit-cancels, Energy, defense (`defense`: the Shield, and the Shield holding its fighter still on every device, for every fighter and the CPU, at any frame rate), the Deflect (`deflect`), Launch, launch reaction and bounce, loadouts, codenames, the fighter status, the hit effects on screen (`hit-fx`) and in play (`hit-effects`: paralysis, block push, stall, and every way past a Shield refused; `quake`: a hit that reaches only fighters on the ground, on strikes, bursts and projectiles; `charm`: a charmed fighter's hits on its charmer healing it, through every kind of hit, the Shield rule kept, its time, the CPU holding its strikes, the mark and the glow; `float`: a hit that holds its target off the ground, rising, until it falls, ended by a launch; `fear`: a frightened fighter's frightener fed by every hit it lands on it, the Shield rule kept, its time, the mark and the glow; `gaze`: a hit that reaches only a fighter facing where it comes from, on strikes and bursts, a Shield raised toward it blocking it), the plunge that lands (`slam`: its impact, its landing clip, the CPU's reading of it), the attack classification (`attack-classification`: every move that can deal damage an attack whatever executes it, the Deflect an attack and a defense, the Shield a defense, movement neither, never by name; for every fighter and a test-only fighter with mechanics nobody has made yet), absolute Shield protection (`shield-protection`: every damage source against an open target and a raised, perfect, from-behind and last-Energy Shield, same-step hits, exhaustion, projectiles turned back), pulls (and a pull that reaches only its front), projectile clashes, the projectiles' spin (`projectile-spin`), the cast form of techniques (and a cast that heals its own fighter, and a burst's art played once behind the fighters), the Special classification and its mark (`special-abilities`: the roster's seven Specials, the editor categories with every binding unchanged, the list's rules, execution types and cooldowns untouched, Cherry Blossom Impact's timing, the mark's lifecycle for players and CPUs), the player's direct attack buttons (`direct-input`: each button its own move, a repeat during the attack nothing and nothing following it, mashing never beating an attack's length or cooldown, a press out of reach whiffing where it is thrown, and nothing of the removed Combat Assist or Combo Assist left), Automatic turn-around (`turn-around`: on by default, the closest valid enemy faced standing, running and in the air with the movement unchanged, Off as the manual rules, no enemy, one out of play, overlapping x, several enemies, attacks aimed, committed moves and released projectiles keeping their course, never a CPU, Practice Ground, respawn, restart and determinism at every frame rate) and each fighter's basic strings made by hand (`basic-strings`: the Launch Point ranges they land up to), stages (`platform-stage`: finite and continuous ground), Adamaris (`adamaris`: its registration, its continuous sand, camera, overtime, theme and full matches) and its volcano (`stage-hazards`: the two randomly drawn states and the eruption's phases, the rocks' damage and Base Launch, no owner and no Deflect, the Shield, one hit per fighter, the warnings, random landings, determinism, frame-rate independence, the CPUs), Jökull (`jokull`: its sectioned glacier and seams, every kind of contact and what never counts, damage and cracks, the break's phases and collision, falling pieces, every query of a destroyed section, the CPU's live reading and escape, the blizzard's checks, 0.25 chance, states, harmlessness and determinism, respawns, rematches, overtime, full matches, the theme), the Void's ripple where it takes a fighter (`void-ripple`), Asperitas and its platform hazards (`platform-hazards`: the stage's data, each hazard's own state machine and stream, random reappearance and its validation, separation over long seeded runs, riding, jumping off and falling, battles, frame-rate independence, overtime, the CPUs on it), the combat AI's controller contract (`combat-ai`) and CPU Intelligence (`cpu-intelligence`: inputs and intent-aware liveness, every move of every fighter recognized and used at every level, the Deflect both ways, recovery, strategy, punishes, difficulty progression, determinism; `cpu-behaviour`: its match-level behaviour scenario by scenario on real Battles, breaking off to recover, finishing an exposed opponent, protecting a lead, forcing a comeback, deliberate waits and their ends, waiting out a respawn, a fading cloud, a hazard's warning, a turtle, the overtime tiebreak and its closing Void, two cautious CPUs never waiting on each other for ever, impatient footwork stepping into its own range, and the liveness monitor telling a wait from a stall), ability names, a fighter that is not #0001, ensembles (`ensemble`: a fighter drawn as several members, its rules, every member on the fighter's state on the same step, the formation and its glide, moves of one, two and three members as one move, the Deflect of one, the idle float, the facing, determinism at any frame rate, an ordinary fighter untouched), and game controllers (`controller-devices`: identification across browsers, the four-controller limit, Player 1, disconnection and reconnection, Reconnect, no or blocked Gamepad API; `controller-profiles`: the actions read from each definition, the universal defaults, every fighter's authored layout (one input a move, the shared button language), the strict comfort rules (each refused, for current and future fighters), the fallback, bindings on every button and either stick, conflicts by physical input, stored profiles and the upgrade of those saved before the sticks were named; `controller-input`: the controller in play on real Fighters, the universal layout, every fighter's whole layout, the right stick's presses (deadzone, release, wobble, forward by facing, both sticks at once), combinations on buttons and sticks, directions on their own stick, ground / air context, custom bindings and every universal action remapped, menus never leaking into play). |
| [`tests/fighters/0001/`](../../tests/fighters/0001/), [`tests/fighters/0002/`](../../tests/fighters/0002/), [`tests/fighters/0003/`](../../tests/fighters/0003/), [`tests/fighters/0004/`](../../tests/fighters/0004/), [`tests/fighters/0005/`](../../tests/fighters/0005/), [`tests/fighters/0006/`](../../tests/fighters/0006/) | One fighter's own art and moves, with its exact values. #0001's are split by subject: `fighter-0001` (registration, art, data, names), `moves-0001` (every move's mechanic), `combos-0001` (its combo routes) and `cpu-0001` (the CPU playing it and facing it); #0003's, #0004's and #0005's are each in one file, `fighter-0003`, `fighter-0004` and `fighter-0005` (the real PNGs, scale and anchors, every move's mechanic, the CPU, its names and credits, and that its source character is named nowhere); #0006's, `fighter-0006`, its three members as one fighter (registration and its kit, who performs each move, its names, touch buttons and controller layout, the real PNGs at one scale, all three always drawn and moving, hurt, launched, shielding and lost to the Void together, one hurtbox and one Launch Point, every move's mechanic: the Power Punch, the Flying Kick, the Tornado Spin's pull, carry and sweep, the Flying Punch, the Triple Strike's lock-on and its one hit, Heat Vision's beam, Ice Breath's freeze, the Sonic Scream's wave clearing the floor, carrying, turning a shot back and shoving a Shield, green's Deflect, both facings, the camera, the CPU playing its whole kit and a whole Battle, its credits, its source characters named nowhere). |
| [`tests/fighters/profiles.test.mjs`](../../tests/fighters/profiles.test.mjs) | Every playable fighter's Discover profile: one whole 1–5 difficulty, a play-style description in both languages, and the profile-review guard (see below). |
| [`tests/fighters/fixtures/`](../../tests/fighters/fixtures/) | Test-only fighters (never in the game): `sample-fighter.mjs` (different moves on the same codenames), `loadout-fighters.mjs` (one fighter per loadout shape), `test-fighters.mjs` (fighters the screen tests register for their own run), `cooling-fighters.mjs` (a copy of #0001 for the shared technique cooldown runtime, and `techniqueCooldown`, the policy's length for one of its techniques), `offense-fighters.mjs` (a fighter with offensive mechanics nobody has made yet: a summon that attacks later, a cast releasing two damaging sources, a lingering field, a hybrid strike that turns projectiles back, all built from ordinary data), `ensemble-fighter.mjs` (#0006's members with test-only moves of one, two and three members, for the ensemble's tests). |
| [`tests/interface/`](../../tests/interface/) | Screens (Discover: its three sections — Fighters, Movement, Launch — localization, reference-page scrolling, the Fighters page, the play-style dialog), the HUD, touch controls and their layouts, Settings, Select Stage (`stage-select`: the 24-slot roster, selection and confirmation, Quick Battle's and Watch Mode's separate choices, Random Stage, the live preview), the ability HUD (`ability-hud`: its rows, wheel, art, keyboard and controller inputs, cooldowns and restrictions, which screens show it), installing Alva (`install`: the installation state, the native prompt accepted and declined, every platform's manual steps, the installed state, the install dialog's focus, keyboard, controller, pointer and both languages, the manifest and its icons under a sub-path, the Download icon's animation), the controller interface (`controller-ui`: Home's indicator, Controller Connections, the cursor, Settings › Controller controls, the editor, binding capture on buttons and either stick, the diagram lighting either stick), the interface's shared contracts (`ui-consistency`: sentence case in both languages, hover and the focus ring kept apart by the input modality, one glass and dim for every dialog, the menu corners, the dialog stack), localization, the stylesheet parts, the splash. |
| [`tests/integration/`](../../tests/integration/) | Whole modes: match scoring, the match clock and overtime in both battle modes (`overtime`: the closing Void, its waves, the elimination burst), difficulty, Watch Mode, Practice Ground, the empty roster, and every pairing of playable fighters. |
| [`tests/helpers/`](../../tests/helpers/) | `fighter-harness.mjs` (the Fighter on a test stage), `cpu-match.mjs` (a whole seeded match on a real `Battle` between any two controllers, with its measurements), `cpu-scenario.mjs` (one CPU Intelligence on a real `Battle` with the match set up as a scenario needs it: score, clock, overtime and its closing Void, both Launch Points, positions, any opponent), `reference-opponents.mjs` (five scripted reference styles for the CPU benchmark, and `CompetentOpponent`, a scripted regular player: spacing, Shields, whiff punishes, anti-airs, recoveries), `png-art.mjs` (a PNG decoder and just enough canvas to normalize a fighter's real frames), `stylesheet.mjs` (the CSS as the page links it), `fake-gamepad.mjs` (Gamepad-API-shaped PlayStation, Xbox, Nintendo and generic pads with real id strings, and a rig wiring them into a real `ControllerManager` and `InputManager`). |
| [`tests/benchmarks/`](../../tests/benchmarks/) | Not run by `node --test`: `cpu-benchmark.mjs`, the CPU Intelligence match benchmark, and `feel-metrics.mjs`, the combat-feel responsiveness proxies (see below). |

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

## The combat-feel metrics

```sh
node tests/benchmarks/feel-metrics.mjs                  # the table
node tests/benchmarks/feel-metrics.mjs --json out.json  # raw numbers too
```

Responsiveness proxies on the real Fighter, every fighter on the same flat
stage, from the same spawn, with the same scripted inputs at 60 Hz, so two
revisions compare number for number (run it on each): the steps to
reverse at full speed (ground and air), a running attack's speed through
it with the direction held and let go, how far a standing attack can be
steered, back-spacing, an aerial's drift held back and held on, Dash →
Attack 1, and Dashes per 10 s.
They show whether control and momentum survive a change of action, never
whether the game is fun; the tests assert the rules.

## The CPU benchmark

```sh
node tests/benchmarks/cpu-benchmark.mjs                       # the standard suite, 2 seeds
node tests/benchmarks/cpu-benchmark.mjs --suite behaviour     # every level v the competent reference, and mirrors
node tests/benchmarks/cpu-benchmark.mjs --suite all           # both suites
node tests/benchmarks/cpu-benchmark.mjs --seeds 4             # more games per matchup
node tests/benchmarks/cpu-benchmark.mjs --only brutal:hard    # one matchup
node tests/benchmarks/cpu-benchmark.mjs --from 5 --seeds 4    # seeds 5-8 (split runs across processes)
node tests/benchmarks/cpu-benchmark.mjs --json out.json       # raw results too
```

Deterministic full matches (first to 3, the 5-minute clock and overtime)
over every pairing of the playable fighters both ways round, Yerma and Sol-Noir (ids `desert` and `city`; `--maps desert,city,asperitas,adamaris,jokull` adds Asperitas, Adamaris and Jökull),
both starting sides and the seeds asked for, for each matchup: Brutal
against Hard and Medium, Hard against Medium and Easy, Medium against
Easy, Brutal against each reference style, Easy against the balanced one
(the standard suite); every level against the competent reference and
against itself (the behaviour suite). It reports each matchup's win rate
with its 95% Wilson interval, points, Launch Point dealt and taken,
eliminations and self-eliminations, combos, punishes, Shield blocks,
Deflects, exhaustion, invalid inputs, inactivity, stuck navigation and
every move's usage; then how each side played: attack presses, jumps,
Dashes and direction reversals per minute in play, the share of its free
time spent standing still and how much of that it meant, its longest
stillness, Shield time, the longest lull and stretch without contact, and
the time spent in each match objective. The measured results are in
[CPU Intelligence](../systems/ai.md#benchmark).

## The fighter harness

[`tests/helpers/fighter-harness.mjs`](../../tests/helpers/fighter-harness.mjs)
builds real Fighters on a test stage with fake sprite sets (clip
metadata, no decoded PNGs):

| Export | Use |
| --- | --- |
| `harnessFor(character)` | The helpers below, bound to one fighter: `{ def, fakeSprites, makeFighter, duel }`. Prefer it for anything that is not about #0001. |
| `makeFighter({ character, sprites, x, y, facing, stage })` | One fighter, stepped by hand (`step(held)`). `sprites` defaults to the character's own. |
| `duel({ attackerCharacter, targetCharacter, ... })` | Two fighters, their projectiles and clones and the real `CombatSystem`, stepped in the battle's order. |
| `cpuFight(defA, defB, { seconds, seed, difficulty })` | Two seeded CPUs in a real fight; its log keeps each step's inputs, attack, state, whether the fighter was free to act and exhausted, whether its CPU was waiting on purpose, and its speed. |
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
tests, the current documentation), and no trace of the retired transform
button's control, move, binding, style or name in the code, the stylesheet,
the page or the current documentation (the word stays where it is a
graphics operation, `ctx.setTransform` or a CSS `transform`); every frame
path existing. They scan
folders recursively, so new modules are covered without editing the
tests. [`UPDATES.md`](../../UPDATES.md) is the history record and is not
scanned for retired names.

## What the tests cannot check

Rendering (sprite scale and anchoring, layout, safe areas, the touch
controls' placement on a real screen), real input devices and
performance need a browser. Check desktop, a phone in landscape, both
playable fighters, Quick Battle, Watch Mode, Practice Ground, Settings,
the touch controls and both languages after visual or input changes.

How the CPU feels to play against is not something a test can check
either: the tests and the benchmark measure its decisions, its waits and
its results against scripts and against itself, never against people. The
human playtesting checklist is in
[CPU Intelligence](../systems/ai.md#human-playtesting).

Installing Alva is the browsers' own: the tests run the install dialog
against a stand-in window and synthetic `beforeinstallprompt` /
`appinstalled` events, and a headless Chromium (Playwright) can confirm
the manifest parses and reports nothing but its own ephemeral profile
(`in-incognito`) as an installability error. What only a real device
proves: Chrome or Edge on a computer and on Android showing their own
install confirmation from **Add to Home Screen**, the installed app
opening standalone at `./` under the GitHub Pages sub-path with its icon,
`appinstalled` arriving, and the dialog reading "Alva is already
installed!" inside the installed app; Safari on an iPhone or iPad (Share ›
Add to Home Screen, then launching from the Home Screen, where
`navigator.standalone` is true); Safari on a Mac (File › Add to Dock);
and that Samsung Internet and Firefox show what the manual steps say.

## Controllers: mocked, then real hardware

Every controller test runs on mocked pads (`tests/helpers/fake-gamepad.mjs`):
the Gamepad API's shape and the id strings browsers really report, but no
hardware. They prove the identification rules, the resolver and the
interface; they cannot prove a particular controller, browser, operating
system or connection reports what the mocks do. Before calling a controller
change done, check it in a real browser with a real DualShock 4 /
DualSense and an Xbox One / Series controller (USB and Bluetooth where
possible): Home's indicator, Controller Connections, the cursor, every
default of each fighter in Practice Ground (the right stick's moves
included, pushed while the left stick runs or drifts), a custom layout with
a right-stick input and a stick-with-a-button input, a capture of each in
the binding dialog, a well-worn stick resting off centre (no press), and
pulling the cable mid-run.

