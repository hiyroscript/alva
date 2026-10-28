# Watch Mode

**Home → Watch Mode** is Alva's CPU-vs-CPU spectator mode: Home → Watch
Mode → Select Difficulty → Select CPU 1 → Select CPU 2 → Select Stage →
CPU vs CPU Battle. Its four setup steps (Difficulty, CPU 1, CPU 2, Stage)
show in the header's progress steps under the kicker "Watch Mode", and Back
retraces them to Home, landing on each choice.

- **Spectator only.** Both fighters are `CombatAIController`s, one each, and
  nobody controls either: no gameplay input is read and the touch controls
  are hidden, in either Mobile Controls layout. Pause (`Esc`, `P`, a controller's Options / Menu or the HUD's pause button),
  Resume, Restart Battle, the result toast, the Match Results, Rematch,
  Change fighters (back to Select CPU 1, the difficulty kept), Change Stage
  and Return to Home work as in Quick Battle.
- **One difficulty for both.** The chosen level (Easy, Medium, Hard or
  Brutal) drives both CPUs. As in Quick Battle, it changes only how they
  decide, never their fighters or the rules.
- **Any two fighters.** CPU 1 and CPU 2 each pick from the shared roster,
  and may be different fighters or the same one. A mirror match loads its
  fighter once.
- **The normal battle.** It is the real `Battle` (`mode: 'watch'`), so
  first to 3 points, Void scoring and respawns, Launch Point, Energy,
  Shields, summons and techniques, clones, projectiles, stage physics,
  camera and hit effects (the Void's fighter-coloured burst included) are
  all unchanged.
- **The same clock and overtime.** 5 minutes, then, with the points level,
  60 seconds of overtime under the closing Void, then the lower Launch
  Point, and level on that too a draw (never a fresh battle by itself),
  exactly as in [Quick Battle](battle.md#the-matchs-end), the celebration
  after the match included. The HUD tags say **CPU 1** and **CPU 2**; the
  result names the sides **Team I** (CPU 1) and **Team II** (CPU 2): the
  announcement is **VICTORY!** over the winning team's name, or **GAME.**
  for a draw (nobody here is defeated), and the toast says "Team II wins!"
  or "No winner, game ended with a draw.".
- **After the match.** The winning CPU celebrates (ability spam, a run into
  the Void, idle, a dash dance, jump spam, at random); the losing one stays
  calm; after a draw both only move about. Nobody respawns and nothing
  changes the result ([CPU celebration](../systems/ai.md#after-the-match-the-celebration)).
- **Its own choices.** Watch Mode keeps them in `app.selection.watch`
  (difficulty, `cpu1CharacterId`, `cpu2CharacterId`, stage), apart from
  Quick Battle's, so neither setup changes the other's.
- **Two random streams.** Each CPU draws from its own seeded RNG, both
  derived from the battle's seed (`deriveSeed` in `js/core/utils.js`), so a
  seeded match is reproducible while the two CPUs never make the same random
  choices, even in a mirror match. Unseeded, every match differs. Each
  side's celebration after the match draws from a further stream of its
  own, so it never moves the CPUs' combat randomness.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.5a and
§7.2.8.

## Code

| | |
| --- | --- |
| [`js/screens/watch-screens.js`](../../js/screens/watch-screens.js) | Its four setup steps, built from Quick Battle's setup screens with their own ids and selection. |
| [`js/screens/battle-screen.js`](../../js/screens/battle-screen.js) | The same Battle screen, in `mode: 'watch'`: no gameplay input, no touch controls. |
| [`js/game/battle.js`](../../js/game/battle.js) | `BATTLE_MODES.watch`: a `CombatAIController` on each side, with its own seeded stream. |

## Tests

[`tests/integration/watch-mode.test.mjs`](../../tests/integration/watch-mode.test.mjs),
[`tests/systems/celebration.test.mjs`](../../tests/systems/celebration.test.mjs),
[`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs)
(every pairing of fighters in a real Watch Mode battle, seeded replays,
frame-rate independence).
