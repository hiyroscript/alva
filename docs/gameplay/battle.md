# Quick Battle

One player against a CPU, on a stage they pick, first to 3 points. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.3 to §6.5, §7.2.8
and §7.3.

**Flow:** Splash → Home → Play → Select Mode → Select Difficulty → Select
Fighter → Select Stage → Battle.

**Scoring.** 5 minutes (`CONFIG.battle.roundSeconds`), first to 3 points
(`CONFIG.battle.pointsToWin`). Each time a fighter falls into the Void its
opponent scores a point at once; the one that fell is out of play for 2
seconds (`CONFIG.battle.respawnSeconds`, on the simulation clock), then
back at its spawn with 0 Launch Point, full Energy and its cooldowns
ready, while the fight and the timer carry on. The third point wins the
match (a short **K.O.** beat, then the result; the loser does not come
back). If both fall together, or one falls while the other is still
waiting to come back, that fall scores nothing. If time runs out first,
more points wins, then the lower Launch Point; equal on both is a draw,
and a fresh battle starts.

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
- **Hard:** fast reactions; Shields and steps away from real threats,
  punishes recovery, spaces, jumps in, dashes and uses its summons and
  techniques deliberately.
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
speed, jumps, Dash, Shield, Energy, cooldowns, hitboxes, respawns and scoring
are the character's and the match's own, identical on every level.

How the CPU plays: [combat AI](../systems/ai.md).

## Code

| | |
| --- | --- |
| [`js/screens/battle-screen.js`](../../js/screens/battle-screen.js) | Loading the fighters (refusing one that is not playable), the HUD, pause, results, rematch and restart. Also runs Watch Mode. |
| [`js/game/battle.js`](../../js/game/battle.js) | `Battle`: phases (intro, fight, time-up, K.O., result), the timer, the score, each side's controller (`BATTLE_MODES`). |
| [`js/game/arena.js`](../../js/game/arena.js) | The fixed-step world, the Void and respawns, the camera and drawing. |
| [`js/ui/hud.js`](../../js/ui/hud.js) | The fighter cards, score dots, timer and pause. |
| [`js/screens/difficulty-select-screen.js`](../../js/screens/difficulty-select-screen.js), [`character-select-screen.js`](../../js/screens/character-select-screen.js), [`map-select-screen.js`](../../js/screens/map-select-screen.js) | The setup steps. |

## Tests

[`tests/integration/match-score.test.mjs`](../../tests/integration/match-score.test.mjs)
(scoring, respawns, K.O., time-up),
[`tests/integration/difficulty.test.mjs`](../../tests/integration/difficulty.test.mjs),
[`tests/interface/battle-screen.test.mjs`](../../tests/interface/battle-screen.test.mjs)
(pause, HUD, results, refusing a fighter that is not playable),
[`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs).
