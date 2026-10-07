# Quick Battle

One player against a CPU, on a stage they pick, first to 3 points. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.3 to §6.5, §7.2.8
and §7.3.

**Flow:** Splash → Home → Play → Select Mode → Select Difficulty → Select
Fighter → Select Stage → Battle.

**Scoring.** 7 minutes (`CONFIG.battle.matchSeconds`, 420 s; the
HUD starts at `7:00`), first to 3 points (`CONFIG.battle.pointsToWin`).
Each time a fighter falls into the Void its opponent scores a point at
once; the one that fell is out of play for 2 seconds
(`CONFIG.battle.respawnSeconds`, on the simulation clock), then back at its
spawn with 0 Launch Point, full Energy and its cooldowns ready, while the
fight and the timer carry on. The third point wins the match at once, in
overtime too (a short **K.O.** beat, then the result; the loser does not
come back). If both fall together, or one falls while the other is still
waiting to come back, that fall scores nothing.

**Time.** When the 7 minutes run out with one side ahead on points, it
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
Level on both (within 1e-6) is a draw: no dialog, and a fresh battle
starts. Restart and Rematch clear overtime: 0–0, `7:00`, the stage's own
Void and normal waves.

**Watch Mode plays the same.** The same `Battle` runs
[Watch Mode](watch-mode.md), with the same 7-minute clock, overtime,
closing Void and results: there is one match clock for every Battle.

**The Void's burst.** Whenever the Void takes a fighter, in any mode, a
short burst plays where it went in, in the fighter's own colours (see
[rendering](../systems/rendering.md#hit-effects)): paint only, nothing in
play changes.

## Difficulty

**Play → Quick Battle** goes through four setup steps (Mode, Difficulty,
Fighter, Stage), shown in the header's progress steps: Splash → Home → Select
Mode → Select Difficulty → Select Fighter → Select Stage → Battle. Back from
Select Fighter returns to Select Difficulty, and Back from there to Select
Mode. The choice is Quick Battle's own (`app.selection.difficulty`, Medium
on a fresh start) and stays through Restart Battle, Rematch and every Void
respawn; Practice Ground never reads it.

- **Easy:** slower reactions, often too late or not at all; pauses, misjudges
  spacing, rarely uses its fighter's summons and techniques (#0001's
  Unlimited Void and Hollow Purple, say). Still attacks: inexperienced, not
  disabled.
- **Medium:** a balanced opponent: its fighter's attacks and extra attack,
  an occasional Shield, summon or technique; answers slow threats, still
  gets caught.
- **Hard:** fast reactions; Shields and steps away from real threats (in
  the air, Deflects the shots it can catch), punishes recovery, spaces,
  jumps in, dashes and air dashes, and uses its summons and techniques
  deliberately.
- **Brutal:** reacts within a few frames (never instantly), reassesses
  constantly, manages Energy and cooldowns, and uses the full moveset. It
  still waits, spaces and retreats when that is the stronger choice.

**Difficulty changes how well the CPU thinks, not what its fighter is
allowed to do.** `js/data/difficulty.js` holds one profile per level, the
only place a level is validated (anything unknown is Medium): reaction
window, lapse chance, reassessment interval, decision noise, hesitation,
spacing error, motion lookahead, and weights for defense, punishing, the
summons and techniques (`specials`), Dash, planning, aggression, stage sense
and Energy care. Every trait
is ordered from Easy to Brutal. None of it touches a fighter: damage, launch,
stun, timing, speed, jumps, gravity, Dash, Shield, Energy and what anything
costs in it, cooldowns, hitboxes, respawns and scoring are the character's
and the match's own, identical on every level (and the same hit resolves
exactly as a player's would).

How the CPU plays: [combat AI](../systems/ai.md).

## Code

| | |
| --- | --- |
| [`js/screens/battle-screen.js`](../../js/screens/battle-screen.js) | Loading the fighters (refusing one that is not playable), the HUD, pause, results, rematch and restart. Also runs Watch Mode. |
| [`js/game/battle.js`](../../js/game/battle.js) | `Battle`: phases (intro, fight, time-up, K.O., result), each mode's clock, overtime (`period`, `overtimeProgress`), the score, each side's controller (`BATTLE_MODES`). |
| [`js/game/arena.js`](../../js/game/arena.js) | The fixed-step world, the Void (closing it in: `setVoidPressure`, `voidWaveSpeed`) and respawns, the camera and drawing. |
| [`js/game/physics.js`](../../js/game/physics.js) | `StageCollision`: the Void in force (`void`, `baseVoid`, `closeVoid`, `inVoid`). |
| [`js/ui/hud.js`](../../js/ui/hud.js) | The fighter cards, score dots, timer (OVERTIME label) and pause. |
| [`js/screens/difficulty-select-screen.js`](../../js/screens/difficulty-select-screen.js), [`character-select-screen.js`](../../js/screens/character-select-screen.js), [`map-select-screen.js`](../../js/screens/map-select-screen.js) | The setup steps. |

## Tests

[`tests/integration/match-score.test.mjs`](../../tests/integration/match-score.test.mjs)
(scoring, respawns, K.O., time-up),
[`tests/integration/overtime.test.mjs`](../../tests/integration/overtime.test.mjs)
(the 7-minute clock, overtime and its results, the closing Void, its waves,
the elimination burst),
[`tests/integration/difficulty.test.mjs`](../../tests/integration/difficulty.test.mjs),
[`tests/interface/battle-screen.test.mjs`](../../tests/interface/battle-screen.test.mjs)
(pause, HUD, results, the OVERTIME banner and label, refusing a fighter
that is not playable),
[`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs).
