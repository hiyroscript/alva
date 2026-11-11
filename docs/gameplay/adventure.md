# Adventure

**Home → Play → Select Mode → Adventure** is Alva's single-player
progression: thirty levels played in order against one CPU difficulty of
its own, **Venture**, which grows smarter with every level, and five
**Perquisites**, permanent upgrades the player picks from two cards every
five levels. It is only there: Local Play, Online Play, Watch Mode and
Practice Ground never list it, link to it or read its state. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.3b; it came with the
[Adventure update](../../UPDATES.md#adventure-update).

```
Select Mode → 01 Adventure → Select Level → Select Fighter
  → (levels 5, 10, 15, 20, 25, 30, that milestone unclaimed) the Perquisite cards
  → Battle (the CPU's fighter and the stage drawn at random, Venture at that level)
```

| Module | Owns |
| --- | --- |
| [`js/data/adventure.js`](../../js/data/adventure.js) | All of Adventure's data: `ADVENTURE_LEVELS` (30), `PERQUISITE_MILESTONES`, Venture (`VENTURE_SMARTS_GROWTH`, `VENTURE_LIMITS`, `ventureProfile`, `ventureSmarts`), the Perquisites (`PERQUISITES`, `perquisiteScale`, `perquisiteEffect`, `perquisiteModifiers`, `perquisiteOffer`) and the player's modifiers in a battle (`adventureModifiers`; Venture's fighter has none). |
| [`js/core/adventure-progress.js`](../../js/core/adventure-progress.js) | The saved progress (`AdventureProgress`, key `alva.adventure`): levels unlocked and cleared, Perquisites owned, each milestone's offer and pick, the run's seed. |
| [`js/screens/adventure-level-screen.js`](../../js/screens/adventure-level-screen.js) | Select Level (`adventure-levels`). |
| [`js/screens/adventure-setup.js`](../../js/screens/adventure-setup.js) | The flow from a level to its Battle: Adventure's Select Fighter (`adventure-character`), the cards when due, each battle's draw. |
| [`js/ui/perquisite-cards.js`](../../js/ui/perquisite-cards.js) | The Perquisite cards' dialog. |
| [`js/game/combat/modifiers.js`](../../js/game/combat/modifiers.js) | The per-fighter modifiers the combat engine reads (identity everywhere but the Adventure player's fighter). |
| [`js/game/ai/cpu-intelligence/effective.js`](../../js/game/ai/cpu-intelligence/effective.js) | The CPU's reads of the real, modified numbers. |

## Select Mode

Two cards in the rail: **01 Adventure** ("Thirty levels against an
ever-sharper CPU. Earn Perquisites as you climb."), the default card and
the first focus, then **02 Quick Battle**. Selecting Adventure opens no
dialog: it becomes `app.selection.mode` and goes straight to Select Level.
The header's steps follow the card focused (Adventure's Mode · Level ·
Fighter). The Mode details panel, narrower now and a step smaller,
describes Adventure first, then Quick Battle; stacked (≤ 720 px, or a
tall, narrow window) it takes its own height up to 32 vh and scrolls inside,
so both cards stay in full.

## Select Level

Thirty square cells, `01` to `30`, in mono figures (a grid of at least
54 px a cell on wide screens, ten a row in short landscape), from the
progress saved on this device:

- **Locked** (above the next level): dimmed, a faint border, disabled (no
  pointer, Tab or arrow reaches it), "Level 07, locked".
- **Cleared** (below it): a green tint, green figures and a small check,
  "Level 03, cleared". Replaying one is allowed.
- **Next** (the highest open level): off-white, charcoal figures, the
  default focus, "Level 08, next".
- Levels 5, 10, 15, 20, 25 and 30 carry a small card mark: hollow until
  that milestone's Perquisite is picked, filled after.

Under the grid, a wide row, information only: Venture at the level focused
("Venture · Level 07", "×11.39 smarter vs Level 1") and the
Perquisites owned as chips ("Brave Soldier II"), or a dash. **Reset
progress** at the bottom, outlined in the warning tone: a first press arms
it ("Confirm reset") for 3.2 s; a second press within that time clears
everything (Level 1 next, nothing cleared, every Perquisite and milestone)
and focus goes to Level 01; otherwise it disarms. Click, Enter / J or
gamepad A, never hover; disabled while there is nothing to reset. Back
returns to Select Mode on the Adventure card.

## The battle

Select Fighter is the shared roster (kicker "Adventure", steps Mode ✓ ·
Level ✓ · **Fighter**; no difficulty, CPU or stage step). Confirming a
fighter shows the Perquisite cards first when the level is a milestone not
yet claimed, then draws the CPU's fighter and the stage exactly as Regular
Play does (`drawRegularPlay`), on a seed of the battle's own that the
Battle then plays on. The match is a Quick Battle's: 3 points, 5:00,
overtime under the closing Void, the Launch Point tiebreak, the
celebration, the toast and the Match Results. The HUD shows **Lv 07 ·
Venture** under the timer; the intro announces **LEVEL 07** over Venture's
line.

- **A win** clears the level and, when it was the next one, unlocks the
  one after, saved at once (before the celebration is over).
- **A loss or a draw** changes nothing; nothing already won is lost.
- **Match Results**: "Adventure · Level 07" over the title, then **Next
  level** (green, only after a win with a level after it: the next
  level's cards if it is an unclaimed milestone, else straight into its
  battle with the same fighter and a fresh draw), **Retry level** (a new
  draw), **Change fighter**, **Level select** and **Return to home
  screen**. No Rematch, no Change stage.
- **Level 30 won**: "Adventure complete!" under the toast's line; every
  cell shows cleared from then on.
- **Pause**: Restart Battle replays the same level and draw; the rest is
  Quick Battle's.

## Venture

One difficulty that grows with the level, never a fifth choice beside
Easy to Brutal (the Difficulty screen and Watch Mode list four). It only
ever grows **smarter** (`VENTURE_SMARTS_GROWTH`, 1.5; `ventureProfile`,
the one place it is computed): Level 1 is Easy's profile exactly. Each
level, every trait's distance from perfect play is divided by 1.5:
`value(L) = limit + (easy − limit) / 1.5^(L−1)`. Perfect play is each
trait's physical limit (`VENTURE_LIMITS`), not Brutal: a reaction and a
reassessment of at least two simulation steps (never on the frame
something starts), no lapse, noise, misjudgement or timing error, a
lookahead of 1 s, a plan depth of 4 (rounded, a whole number) and every
probability 1. No trait ever gets worse from a level to the next. By
Level 6 it already reacts faster than Brutal and plans as deep (13 of its
24 traits at least Brutal's); by Level 9 it matches or passes Brutal on 22
of them (all but its lapses and how often it reassesses); from Level 11 it
is past Brutal on every trait but plan depth, where both are at the limit
(4).

Venture never scales a hit. Its fighter is the same at every level as at
any difficulty: the same damage, launch, speed, Energy and every other
mechanic. A CPU has no Perquisite and a difficulty has no modifier, so its
side of the battle always has the identity's modifiers (the Battle refuses
anything else for a CPU's side): Level 30 hits exactly as hard as Level 1,
or as Easy in Quick Battle. Its hits used to grow 1.05 times a level;
that growth was [removed](../../UPDATES.md#later-venture-only-gets-smarter).

## Perquisites

| id | Name (EN / FR) | Effect | I | II | III | IV | V |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `braveSoldier` | Brave Soldier / Brave Soldat | damage received (what real hits add to the player's Launch Point, a hazard's included) down | 8 % | 12 % | 16 % | 20 % | 24 % |
| `nearlyImmortal` | Nearly Immortal / Presque Immortel | Launch Points recovered a tick (`LAUNCH_RECOVERY_AMOUNT`, 2) up | +0.5 | +0.75 | +1 | +1.25 | +1.5 |
| `velociousImmuneSystem` | Velocious Immune System / Système Immunitaire Véloce | the ticks come faster (`LAUNCH_RECOVERY_INTERVAL`, 0.5 s, shortened; never the 2 s delay) | −8 % | −12 % | −16 % | −20 % | −24 % |
| `maximumEnergy` | Maximum Energy / Énergie Maximale | every Energy cost (Dash, air dash, a blocked hit, Deflect, a move's own) down | 8 % | 12 % | 16 % | 20 % | 24 % |
| `redoutableStrength` | Redoutable Strength / Force Redoutable | damage dealt (real hits) up | 8 % | 12 % | 16 % | 20 % | 24 % |

Level n is the base × (1 + 0.5 × (n − 1)): I ×1, II ×1.5, III ×2, IV ×2.5,
V ×3. Before the battle of levels 5, 10, 15, 20, 25 and 30, the first time
each is started, two cards pop in (a fade alone with reduced motion; stacked
on a narrow portrait screen), each a different Perquisite at the next level
the player does not own (level I, "New", of one they do not have), with its
icon, name, level in Roman numerals, its effect in plain numbers ("Launch
Point recovers every 0.44 s instead of 0.5 s (recovery still starts after
2 s)") and, for an upgrade, what it was. One at V never comes up again, and
a level once owned never does. The pair is drawn from the run's seed and
the milestone's level and saved with the milestone, so a reload in the
middle of the choice shows the same two. The player must pick: no close
button, and Esc, Back or a press on the dim do nothing. Picking saves at
once (that Perquisite a level up, the milestone claimed: losing never
unclaims it), then the battle starts. Six picks in a full run, from 25
levels: two are always open.

## How the modifiers reach the fighters

Each side's fighter gets a **modifiers** object for the whole battle
(`Battle({ modifiers: { p1, p2 } })`, kept through every restart, rematch
and respawn): `damageDealt`, `damageTaken`, `recoveryAmountBonus`,
`recoveryIntervalScale`, `energyCostScale`. Every mode but Adventure
leaves them out, so both sides have the identity's, which changes nothing
bit for bit (the online state hash and lockstep included). In Adventure the
player's come from their Perquisites; the CPU's are the identity's at every
level (a CPU has no Perquisite, and no difficulty scales a hit). The combat
engine reads only the object it is handed, never a mode, a fighter id or
Adventure state:

- `CombatSystem.applyHit`: a real hit's damage is its own × the
  attacker's `damageDealt` × the target's `damageTaken`, added to the
  Launch Point and the Limit gauge (so the launch grows with it). A hit of
  0 stays 0, a blocked hit deals 0 and pays the block's (scaled) cost.
- `CombatState.updateLaunchRecovery`: each tick takes off
  `LAUNCH_RECOVERY_AMOUNT + recoveryAmountBonus`, every
  `LAUNCH_RECOVERY_INTERVAL × recoveryIntervalScale`; the delay never
  changes.
- `Fighter.payEnergy` and the blocked hit: every cost × `energyCostScale`.

Fractional Launch Points stay fractional; the HUD and the Match Results
show whole numbers, and overtime's tiebreak compares the real values. The
match statistics count what really happened (the scaled damage, what was
really paid).

## The CPU

CPU Intelligence reasons with the real numbers
(`js/game/ai/cpu-intelligence/effective.js`, the engine's own functions):
its own hits land as authored (Venture's `damageDealt` is 1 at every
level); against Brave Soldier it knows its hits do less, so it sees a
kill-confirm at a higher Launch Point (`LaunchJudge.strikes`,
`Strategy.koThreat`); against Redoutable Strength it weighs the player's
hits more in its guard and risk; against Nearly Immortal and Velocious
Immune System it knows the player's Launch Point drains faster, so waiting
is worth less and a finish now worth more (it keeps its momentum); against
Maximum Energy its read of
"about to run dry" uses the player's costs; overtime's tiebreak projects
each fighter's own recovery. Its own Energy reads use full costs. The
modifiers are rules of the match, known like the clock; perception is
unchanged. The celebration and Watch Mode's CPUs never see anything but the
identity.

## Saved progress

`alva.adventure` in the browser's storage (reached, like the settings',
through `js/core/settings.js`), one versioned object:

```js
{ version: 1, unlocked: 1..31 /* 31: all cleared */, cleared: [levels],
  perquisites: { braveSoldier: 0..5, ... },
  milestones: { "5": { offer: ["idA", "idB"], picked: "idA" | null }, ... }, seed }
```

Every field is checked on reading (levels clamped, a cleared level above
the next dropped, a Perquisite level a whole number 0 to 5, a milestone's
offer two different known Perquisites and its pick one of them or none);
anything corrupt or of an unknown version is fresh progress. A storage that
refuses or is missing keeps the progress for this visit only and never
throws. Only Reset progress clears it (and clearing the site's data).

## Screenshots

In [`docs/screenshots/adventure-update/`](../screenshots/adventure-update/),
English and French, on a desktop window and a phone held sideways (2000 ×
924 device pixels): Select Mode (`01-…`), the level selector fresh,
mid-run and complete (`02-…` to `04-…`), the Perquisite cards (`05-…`), the
intro's level and Venture (`06-…`) and the HUD's tag (`07-…`); and Select
Mode stacked on a tall, narrow window (`08-…`).

## Tests

- [`tests/interface/adventure.test.mjs`](../../tests/interface/adventure.test.mjs):
  Select Mode's two cards and details, the selector's states and wide row,
  the two-step reset, every Back, the cards' dialog, the French, the
  layout's rules.
- [`tests/integration/adventure.test.mjs`](../../tests/integration/adventure.test.mjs):
  the whole flow, wins and losses, Next level, Retry, Level select, Change
  fighter, Level 30, progress across a fresh app, Adventure nowhere else,
  the identity in every other mode.
- [`tests/systems/venture.test.mjs`](../../tests/systems/venture.test.mjs):
  Venture's profile at every level, and its hits dealing exactly what any
  other CPU's do at every level from 1 to 30.
- [`tests/systems/perquisites.test.mjs`](../../tests/systems/perquisites.test.mjs):
  the table, the offers, every effect at its place, the saved progress.
- [`tests/systems/adventure-cpu.test.mjs`](../../tests/systems/adventure-cpu.test.mjs):
  the CPU with the identity (the same seeded matches with and without the
  identity spelled out) and against the player's Perquisites.
