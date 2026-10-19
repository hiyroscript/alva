# Quick Battle

One player against a CPU, first to 3 points. The product rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.3 to §6.5, §7.2.8 and §7.3.

**Flow.** Selecting Quick Battle on Select Mode opens a choice of two play
types (a modal dialog; Esc, gamepad Back, its close button or a press
around it dismiss it, choosing nothing, focus back on the Quick Battle card):

- **Regular Play:** Splash → Home → Play → Select Mode → Quick Battle →
  Regular Play → Select Difficulty → Select Fighter → Battle. Confirming the
  fighter draws the CPU's fighter at random from the fighters playable now
  (never a locked one) and the stage at random from `MAPS` (never Practice
  Ground), and starts the Battle: no Select CPU, no Select Stage.
- **Custom Play:** Splash → Home → Play → Select Mode → Quick Battle →
  Custom Play → Select Difficulty → Select Fighter → Select CPU → Select
  Stage → Battle.

Player 1 and the CPU each have their own fighter (`app.selection.characterId`
and `cpuCharacterId`, possibly the same one), the CPU's picked on Select CPU
or drawn by Regular Play into that same field, as is the stage (`mapId`), so
the Battle screen reads one state either way
([`js/screens/quick-battle-setup.js`](../../js/screens/quick-battle-setup.js)).
Each side is checked on its own: a fighter that is not playable is never
started and nothing stands in for it. Restart Battle and Rematch keep the
match's fighters and stage, Regular Play's draw included; a new setup draws
again. Player 1 alone has the touch controls (its fighter's art and names)
and the Combat Assist setting; the difficulty only changes how the CPU
thinks.

**Ability HUD.** Playing with a keyboard or a controller, Player 1's
moves sit in the bottom-right corner: each move's own art over the key or
pad input that performs it, the moves of where the fighter is now on top
and the other place's smaller beneath, turning like a small wheel as it
jumps and lands, each with its cooldown (seconds for the 3 s and 5 s ones,
a faint sweep for the 0.5 s repeat delay) ([input](../systems/input.md#the-ability-hud)).
It hides under the pause menu and at the result, never shows in Watch
Mode, and a touch screen keeps its touch controls instead. While it shows,
Player 1's cooldown rings under its feet step aside; the CPU keeps its own.

**Scoring.** 5 minutes (`CONFIG.battle.matchSeconds`, 300 s; the
HUD starts at `5:00`), first to 3 points (`CONFIG.battle.pointsToWin`).
Each time a fighter falls into the Void its opponent scores a point at
once; the one that fell is out of play for 2 seconds
(`CONFIG.battle.respawnSeconds`, on the simulation clock), then back at its
spawn with 0 Launch Point, full Energy and its cooldowns ready, while the
fight and the timer carry on. The third point wins the match at once, in
overtime too (a short **K.O.** beat, then the result; the loser does not
come back). If both fall together, or one falls while the other is still
waiting to come back, that fall scores nothing.

**Time.** When the 5 minutes run out with one side ahead on points, it
wins (the usual TIME beat, then the result: "Time ran out. More points
wins the match."). With the points level, the Launch Point decides nothing
yet: the match goes to **overtime**.

**Overtime.** 60 seconds more (`CONFIG.battle.overtimeSeconds`) of the same
fight, never a new one and never "Round 2": the score, both Launch Points,
Energy, cooldowns, positions, projectiles, clones, techniques and respawn
waits all carry on, and both fighters stay in control. The HUD's timer
jumps to `1:00` under an **OVERTIME** label and counts down like the
normal clock (the last ten seconds in the usual brighter digits; spoken as
"Pause game, overtime, … remaining"), and an **OVERTIME** banner under
"POINTS LEVEL" shows for about 1.4 s, then gets out of the way. Pause
freezes it all, as ever. Through overtime the Void presses in:

- its left and right edges close in and its bottom rises, linearly over the
  whole 60 seconds, from the stage's own Void to 120 world units past each
  ledge and 140 below the main stage's top
  (`CONFIG.battle.overtimeVoid.sideEndGap` / `bottomEndGap`, measured from
  each stage's `mainStage`, so every stage closes the same way). **The top
  never moves.** It never reaches a ledge or the surface: the main stage is
  always safe to stand on. The stage itself (floor, platforms, solids,
  spawns) and the camera's bounds do not change;
- it is the real kill boundary, not a picture: collision
  (`StageCollision.inVoid`), projectiles, the lethal-launch preview and the
  CPU all read the one rectangle in force (`stage.void`), and the drawn
  black edge is traced around exactly that rectangle. A fighter the closing
  edge passes is taken on that very step, through the usual Void flow
  (point, respawn, burst);
- its waves speed up, smoothly and ever faster, to 4× their normal speed at
  the end (`1 + 3 × progress²`, `maxWaveSpeedMultiplier`), keeping their
  shape, amplitude, red rim and black. With reduced motion the waves stay
  still; the boundary still closes in, since that is gameplay.

When overtime runs out, more points wins ("Overtime ran out. More points
wins the match."); level on points, the lower Launch Point (the number on
the HUD; a fighter still out counts the one it fell with) wins ("Overtime
ran out with the points still level. The lower Launch Point decides it.").
Level on both (within 1e-6) is a **tie**: the match is over, and the
result menu says so ("End of overtime", "Tie", "Overtime ended with the
points and Launch Point equal."), naming no winner, with the usual
Rematch, Change Stage and Return to Home. Nothing restarts by itself.
Restart and Rematch clear overtime: 0–0, `5:00`, the stage's own Void and
normal waves.

**Change Stage** opens the mode's own Select Stage with the fighters and
the level kept: Custom Play's (Back from it to Select CPU) and Watch
Mode's, where those matches started; after Regular Play the stage selector
takes the Battle's place, its steps Mode · Difficulty · Fighter · Stage,
and Back from it returns to Select Fighter.

**Watch Mode plays the same.** The same `Battle` runs
[Watch Mode](watch-mode.md), with the same 5-minute clock, overtime,
closing Void and results, the tie included: there is one match clock for
every Battle.

**The Void's burst.** Whenever the Void takes a fighter, in any mode, a
short burst plays where it went in, in the fighter's own colours (see
[rendering](../systems/rendering.md#hit-effects)): paint only, nothing in
play changes.

## Difficulty

**Play → Quick Battle** shows the setup steps of the play type chosen in
the header's progress steps: Custom Play's five (Mode, Difficulty,
Fighter, CPU, Stage), Regular Play's three (Mode, Difficulty, Fighter), never
a step the player will not visit. Back retraces the steps visited: Select
Stage → Select CPU → Select Fighter → Select Difficulty → Select Mode in
Custom Play, Select Fighter → Select Difficulty → Select Mode in Regular
Play. The difficulty is Quick Battle's own (`app.selection.difficulty`,
Medium on a fresh start), the same for both play types, and stays through
Restart Battle, Rematch and every Void respawn; Practice Ground never reads
it.

All four levels are one intelligence, CPU Intelligence, using every move,
the Dash, the air dash, the Shield and the Deflect. Each plays with a
purpose: it knows what it is after in the match (building an advantage,
finishing an exposed opponent, breaking off to let its Launch Point
recover, protecting a lead, forcing a comeback), and it may stand still
when waiting is the better play, never as idleness:

- **Easy:** a casual player. Sees things late (or misses them), decides
  slowly, misjudges ranges, often drops a combo or misses a finish, reads
  the score and the clock only now and then, recovers loosely; beatable,
  but always trying to win.
- **Medium:** a regular player. Practical combos, answers the slower
  threats, picks up the opponent's obvious habits, breaks off to recover
  and protects a lead most of the time, still overcommits now and then.
- **Hard:** tournament level. Reads the telegraphed moves, punishes
  whiffs and bad landings, edge-guards, plays the stage and its Launch
  Point, manages Energy and spacing.
- **Brutal:** elite. Reacts within a few frames (never instantly),
  reassesses constantly, adapts fast, waits for its openings, finishes
  when a launch ends a life, never sees what a player could not.

**Difficulty changes how well the CPU thinks, not what its fighter is
allowed to do.** `js/data/difficulty.js` holds one profile per level, the
only place a level is validated (anything unknown is Medium): reaction
window, lapse chance, reassessment interval, decision noise, range,
prediction and timing error, lookahead, plan depth, combo reliability,
guard, perfect Shield timing, punish and opportunity recognition,
adaptation, Energy, risk and stage sense, launch steering, recovery skill,
initiative, patience, discipline and match awareness. Every trait is
ordered from Easy to Brutal. None of it
touches a fighter: damage, launch, stun, timing, speed, jumps, gravity,
Dash, Shield, Energy and what anything costs in it, cooldowns, hitboxes,
respawns and scoring are the character's and the match's own, identical on
every level (and the same hit resolves exactly as a player's would).

How the CPU plays: [CPU Intelligence](../systems/ai.md).

## Code

| | |
| --- | --- |
| [`js/screens/battle-screen.js`](../../js/screens/battle-screen.js) | Loading the fighters (refusing one that is not playable), the HUD, pause, results (the tie included), rematch, restart and Change Stage. Also runs Watch Mode. |
| [`js/game/battle.js`](../../js/game/battle.js) | `Battle`: phases (intro, fight, time-up, K.O., result), each mode's clock, overtime (`period`, `overtimeProgress`), the score, each side's controller (`BATTLE_MODES`). |
| [`js/game/arena.js`](../../js/game/arena.js) | The fixed-step world, the Void (closing it in: `setVoidPressure`, `voidWaveSpeed`) and respawns, the camera and drawing. |
| [`js/game/physics.js`](../../js/game/physics.js) | `StageCollision`: the Void in force (`void`, `baseVoid`, `closeVoid`, `inVoid`). |
| [`js/ui/hud.js`](../../js/ui/hud.js) | The fighter cards, score dots, timer (OVERTIME label) and pause. |
| [`js/screens/mode-select-screen.js`](../../js/screens/mode-select-screen.js), [`js/ui/overlays.js`](../../js/ui/overlays.js) (`ChoiceDialog`) | Select Mode and its Custom Play / Regular Play choice. |
| [`js/screens/difficulty-select-screen.js`](../../js/screens/difficulty-select-screen.js), [`character-select-screen.js`](../../js/screens/character-select-screen.js), [`quick-cpu-screen.js`](../../js/screens/quick-cpu-screen.js), [`map-select-screen.js`](../../js/screens/map-select-screen.js) | The setup steps (`js/ui/components.js` holds each play type's steps). |
| [`js/screens/quick-battle-setup.js`](../../js/screens/quick-battle-setup.js) | Regular Play's draw, what starting hands the Battle screen, and where Select Fighter goes next. |

## Tests

[`tests/integration/match-score.test.mjs`](../../tests/integration/match-score.test.mjs)
(scoring, respawns, K.O., time-up),
[`tests/integration/overtime.test.mjs`](../../tests/integration/overtime.test.mjs)
(the 5-minute clock, overtime and its results, the closing Void, its waves,
the elimination burst),
[`tests/integration/difficulty.test.mjs`](../../tests/integration/difficulty.test.mjs),
[`tests/integration/quick-battle.test.mjs`](../../tests/integration/quick-battle.test.mjs)
(the play-type dialog, both routes and their steps and Back, Regular Play's
draw, the CPU's own fighter, Change Stage),
[`tests/interface/battle-screen.test.mjs`](../../tests/interface/battle-screen.test.mjs)
(pause, HUD, results, the tie, the OVERTIME banner and label, refusing a
fighter that is not playable),
[`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs).
