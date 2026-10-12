# CPU Intelligence

Quick Battle's CPU and both of Watch Mode's are one universal intelligence,
**CPU Intelligence** (`js/game/ai/cpu-intelligence/`), behind the
`CombatAIController` every mode builds. It plays whatever fighter it is
given from that fighter's own data, at the difficulty chosen. There is one
brain for every fighter and every level: a level changes how well it
perceives, thinks and executes, never what its fighter can do. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.8 and §6.3a.

Practice Ground keeps its training dummy (no controller); the older
non-attacking `TrainingAIController` stays in
`js/game/fighters/fighter-controller.js`, unused by every mode.

## Modules

| Module | Layer | Owns |
| --- | --- | --- |
| [`combat-ai.js`](../../js/game/ai/combat-ai.js) | — | `CombatAIController`, the controller the modes build: CPU Intelligence itself. |
| [`cpu-intelligence/brain.js`](../../js/game/ai/cpu-intelligence/brain.js) | the hierarchy | `CpuIntelligence`: runs the layers every fixed step, the decision order, combo follow-ups, recovery and edge-guard plans, the point of no return, launch steering, liveness, the attack orientation, directives for tests. |
| [`cpu-intelligence/capabilities.js`](../../js/game/ai/cpu-intelligence/capabilities.js) | 1. capabilities | `analyzeCapabilities` (cached per fighter): every move with its timing, reach, strikes, projectile, motion, cooldowns, air uses, Energy and **roles**; the Shield, the Deflect, movement and launch reaction. `moveReady`. |
| [`cpu-intelligence/perception.js`](../../js/game/ai/cpu-intelligence/perception.js) | 2. perception | `Perception`: the opponent as it was `latency` ago (a ring of snapshots), recognized or lapsed events, the projectiles and clones the CPU has seen. |
| [`cpu-intelligence/situation.js`](../../js/game/ai/cpu-intelligence/situation.js), [`stage-model.js`](../../js/game/ai/cpu-intelligence/stage-model.js), [`prediction.js`](../../js/game/ai/cpu-intelligence/prediction.js) | 3. world model | `Situation` (rebuilt each step), `StageModel` (ledges, surfaces, the Void in force, read live), and the forward simulation on the game's own rules: paths, jump arcs, move contact, projectile contact, launches and recoveries. |
| [`cpu-intelligence/opponent-model.js`](../../js/game/ai/cpu-intelligence/opponent-model.js) | 4. opponent model | `OpponentModel`: decaying rates of what the opponent was seen doing (jumps, Shields under threat, projectiles, Dashes, whiffs, attacks within reach, preferred range, repeated moves), trusted as fast as the level adapts. |
| [`cpu-intelligence/strategy.js`](../../js/game/ai/cpu-intelligence/strategy.js) | 5. strategy | `Strategy`: the mode (rushdown, controlled offense, neutral, counterplay, zoning, trap control, survival, finisher hunt, recovery) re-weighed from both Launch Points, footing, Energy, kit, habits, score and clock, with hysteresis. |
| [`cpu-intelligence/evaluator.js`](../../js/game/ai/cpu-intelligence/evaluator.js), [`values.js`](../../js/game/ai/cpu-intelligence/values.js) | 6–7. tactics, combos | `Evaluator`: every move now, out of a Dash or out of a jump, scored by expected utility; combo follow-ups on the launch dealt. `LaunchJudge`, `KO_VALUE`: what outcomes are worth. |
| [`cpu-intelligence/defense.js`](../../js/game/ai/cpu-intelligence/defense.js) | threats | `Defense`: recognized threats (melee, projectiles, throws, techniques, clones) and the best answer to each. |
| [`cpu-intelligence/plans.js`](../../js/game/ai/cpu-intelligence/plans.js) | 8. plans | `makePlan`: each plan kind as a small state machine over steps, with a lifetime and an explicit end. |
| [`cpu-intelligence/executor.js`](../../js/game/ai/cpu-intelligence/executor.js) | 9. execution | `Executor`: the plan's wishes turned into one legal `FighterInput` snapshot (press edges, jump holds, the Mouvement request, no Shield in the air but the Deflect), with the ledge guard. |
| [`cpu-intelligence/telemetry.js`](../../js/game/ai/cpu-intelligence/telemetry.js) | 11. telemetry | `Telemetry`: counters, move usage, the debug trace, `STILL_LIMIT`. |
| [`js/data/difficulty.js`](../../js/data/difficulty.js) | 10. humanization | The four profiles and `CAPABILITY` (which way each trait improves). |

`js/game/ai/moveset.js` (`readMoveset`, `hurtExtent`) is the raw reading
of a definition the capability analyzer builds on.

## A controller like a player's

`Fighter.update` asks its controller for one input snapshot per fixed
step (1/60 s). The CPU returns exactly the snapshot a player's controller
would: held directions, Down, Jump, Shield, the combat buttons and their
one-step `…Pressed` edges, a Dash or an air dash by an explicit
Mouvement request, a Deflect by a fresh Shield press in the air. The
fighter and the combat system decide what those inputs do, so the CPU
cannot attack while stunned, skip recovery, bypass a cooldown, Dash while
exhausted or spawn anything. It never writes to a fighter, never reads the
player's raw input or the DOM, never uses the wall clock, and never has
Combat Assist. Every random draw comes from its injected seeded RNG.

## The step

Every fixed step, in this order:

1. **Observe.** Perception records the opponent and recognizes what it
   did (an attack's startup, a whiff, a jump, a landing, a Dash, a Shield,
   exhaustion, a projectile, a clone, a cast) once it has been on screen
   for the level's latency, or lets it lapse. The situation is rebuilt:
   the CPU's own fighter exactly, its opponent as perceived and carried
   forward by its visible motion (or, off the stage and free, along its
   likely recovery), both kits, the stage, the projectiles it has seen,
   the score and clock. The opponent model takes in the events.
2. **Forced states.** Stunned, frozen or paralysed, it only steers the
   coming launch (as a player may hold a direction).
3. **Survival.** Off the stage, the recovery plan takes over: several
   routes (when to air jump, whether to air dash, a lift as a last
   resort) are simulated on the real rules and the best one flown, the
   level judging the timing more or less precisely, and routes through
   the reach of an opponent waiting at the ledge are avoided.
4. **Threats.** A newly recognized threat may interrupt any plan with the
   best answer: a Shield (raised in time, perfect when the level times
   it), a jump over it (timed if it is still far), a step or a Dash out of
   reach, drifting away, the Deflect (timed so the swat is live as the
   shot arrives, and worth more when the turned-back shot can still hit
   its thrower), a strike that lands first, or a projectile that erases or
   repels it. Never a Shield against what no Shield stops. An answer for
   later is held until its moment, so the CPU keeps playing meanwhile.
5. **Combos.** When its hit lands, the best follow-up the rules allow is
   searched against the launch it dealt (hit-cancels, a Dash or a jump
   after the hit) and pressed in time, or dropped if it no longer
   connects.
6. **The plan.** A committed plan (a Dash-in, a jump-in, a recovery, an
   answer) carries on until its objective is met or it fails. Before a
   strike is pressed it is checked again from where the CPU really is
   (still connects, still leaves a way home), and a jump-in waiting off
   the stage is dropped before the point of no return.
7. **Strategy and tactics.** On the level's reassessment cadence the
   strategy mode is re-weighed and, if the plan may be reconsidered, a
   new one chosen: the attack sequence with the best utility if it
   clears the mode's bar, else the movement the mode calls for (neutral
   footwork, navigation to another level, edge-guarding, repositioning).
8. **Execute** through the executor, with the ledge guard.
9. **Liveness.** Free to act in a live match and still for longer than a
   deliberate pause (`STILL_LIMIT`, 0.45 s), it counts an incident and
   takes a fresh plan at once (Rule A).

## Evaluating an option

Each candidate (a move now, out of a Dash of a few lengths, or out of a
jump arc) is simulated on the game's own rules (`stepBody`, `steer`,
`steerAttack`, the attack's own motion) against the opponent's predicted
path, and scored as expected utility:

- **P(hit), P(block), P(miss):** the room it has against how far the
  opponent could move once it sees it coming (and is free to), a Shield
  in the way (the opponent's observed habit), the move's predictability
  from repetition.
- **Values:** damage weighed by the Launch Point it reaches, the launch
  judged by the real launch rules (a launch that ends a life is worth
  `KO_VALUE`, more at match point; one that leaves the target off the
  stage an edge-guard), a paralysis as the hits it opens, the combo the
  stun leaves time for; a block or a whiff costs what the opponent can
  punish in the window it leaves.
- **Risks:** an incoming threat that lands first; walking into the live
  box of the attack the opponent is already making; being interrupted by
  an opponent free in time (it reacting, or up close pressing a quicker
  strike first, by its observed habit); the CPU's own elimination (a
  recovery simulated from where the move ends); at a Launch Point where
  the opponent's best launch ends its life, being hit costs a life.
- **Costs:** Energy (emptying the bar is worth it only for a life), long
  cooldowns, tempo (the same hit is worth less the longer it takes).
- **Preferences:** the strategy mode's roles, and variety (a move left
  unused grows more tempting, more deliberately the higher the level).

## Universal by construction

Nothing in `js/game/ai/` names a fighter or branches on its id (Rule C,
checked by the tests). Everything comes from the fighter's data through
`analyzeCapabilities`: each move's role (`poke`, `approach`,
`comboStarter`, `launcher`, `finisher`, `antiAir`, `zoning`, `trap`,
`areaDenial`, `punish`, `edgeGuard`, `recovery`, `counterProjectile`,
`defensiveDisengage`), its reach swept along its motion, its projectile's
range and pull, its technique's burst, its summon's clone, its cooldowns
and air uses. Movement is universal (`js/data/movement.js`). A new
fighter is played well with no CPU change at all.

## Difficulty

A profile (`js/data/difficulty.js`) holds only how well the CPU thinks:

| Trait | Effect |
| --- | --- |
| `react` | Perception latency window (Easy 0.30–0.46 s, Medium 0.19–0.30, Hard 0.15–0.22, Brutal 0.07–0.105; never zero). |
| `lapse` | Chance a new opponent action is not recognized. |
| `think` | Seconds between reassessments (urgent events are looked at at once). |
| `noise` | Jitter on every option's utility. |
| `rangeError`, `predictError` | Spacing misjudgement; error on the projected motion. |
| `timing` | Execution error on a timed press. |
| `lookahead`, `planDepth` | How far motion is projected; which Dash lengths, jump arcs and targets are weighed. |
| `comboReliability` | Chance a found follow-up is executed in time. |
| `guard`, `perfectShield` | How fully threats are answered; how often a Shield is perfect. |
| `punish`, `opportunity` | How often an opening, or a finisher, is recognized. |
| `adapt` | How fast and far observed habits are trusted; how deliberately it varies its moves. |
| `energySense`, `riskSense`, `stageSense` | Energy management; how fully risks count; ledges, edge-guards, the point of no return. |
| `diSkill`, `recoverySkill` | Steering launches; accuracy of recovery routes. |
| `initiative` | Willingness to start offense. |

Every trait is ordered Easy → Brutal (`CAPABILITY`). No level changes
damage, launch, hitstun, blockstun, timing, speed, jumps, gravity, the
Dash, the Shield, Energy or its costs, cooldowns, hitboxes, physics,
scoring or respawns: no module of the fighter, the combat engine or the
physics reads a difficulty.

- **Easy**, a casual player: sees things late, misjudges ranges, rarely
  times a punish, recovers loosely, but always plays (never idle).
- **Medium**, a tryhard: combos, adapts to habits, recovers reliably.
- **Hard**, tournament level: reads the slower moves, punishes whiffs,
  edge-guards, manages Energy.
- **Brutal**, elite: fast (never instant) reactions and consistent
  judgement, deep jump and Dash searches, precise punishes and recoveries,
  quick adaptation.

## Debugging

`new CombatAIController({ difficulty, rng, debug: true })` keeps a ring of
decision traces (`telemetry.trace`): the mode, the plan and its reason
(built from the numbers behind it: "Dash into; extra_attack lands in
417 ms; launches"), the move, hit chance and value, both Launch Points,
the danger and finishing chances, Energy, what interrupted the last plan,
and the opponent model's summary. `telemetry.explain()` gives the latest
in one line. The counters (`telemetry.report()`: invalid inputs, expired
and failed plans, stuck navigation, inactivity, Shields, Deflects,
recoveries, Dashes, jumps, decisions, combos, answers by kind, every
move's usage, plans by kind) always run.

For tests, `controller.neutral = false` holds its own offense and footwork
(it still perceives, defends and recovers), and `controller.command(spec)`
hands it one plan through the same inputs (`{ press }`, `{ jump, dir }`,
`{ dash }`, `{ move, seconds }`, `{ shield }`).

## Tests and benchmark

- [`tests/systems/cpu-intelligence.test.mjs`](../../tests/systems/cpu-intelligence.test.mjs):
  inputs and liveness at every level, approach, stage navigation (City),
  projectiles and the Deflect both ways, anti-air, recovery, Energy,
  Launch Point and match-situation strategy, overtime, punishes, move
  coverage (every move of every fighter in real fights at every level, and
  in an opportunity made for it: recognized, pressed, landed), combat
  correctness, difficulty progression, determinism, the debug trace.
- [`tests/systems/combat-ai.test.mjs`](../../tests/systems/combat-ai.test.mjs):
  the controller contract (press edges, perceived facing, reserved
  buttons, the ledge guard, reaction scaling, cooldowns, no writes).
- [`tests/fighters/0001/cpu-0001.test.mjs`](../../tests/fighters/0001/cpu-0001.test.mjs),
  [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  the CPU playing, and facing, each fighter.
- [`tests/helpers/cpu-match.mjs`](../../tests/helpers/cpu-match.mjs) and
  [`reference-opponents.mjs`](../../tests/helpers/reference-opponents.mjs):
  full matches on a real `Battle`, and five scripted reference styles.
- [`tests/benchmarks/cpu-benchmark.mjs`](../../tests/benchmarks/cpu-benchmark.mjs),
  run by hand (`node tests/benchmarks/cpu-benchmark.mjs --seeds 4`): the
  benchmark below.

## Benchmark

Measured on this code with `node tests/benchmarks/cpu-benchmark.mjs
--seeds 4`: 64 deterministic matches per matchup (both fighters each way
round and mirrored, Desert and City, both starting sides, seeds 1 to 4),
first to 3 points under the full clock and overtime. Win rates are the
first side's, with their 95% Wilson interval.

| Matchup | Win rate | Points | Launch Point dealt : taken (per game) |
| --- | --- | --- | --- |
| Brutal v Hard | **92.2%** (59–5) [83–97] | 2.91 : 1.20 | 238 : 147 |
| Brutal v Medium | 98.4% (63–1) [92–100] | 2.98 : 0.73 | 237 : 120 |
| Brutal v aggressive reference | 100% (64–0) [94–100] | 3.00 : 0.03 | 215 : 44 |
| Brutal v defensive reference | 100% (64–0) [94–100] | 3.00 : 0.02 | 178 : 0 |
| Brutal v projectile reference | 100% (64–0) [94–100] | 3.00 : 0.03 | 162 : 7 |
| Brutal v jump-heavy reference | 100% (64–0) [94–100] | 3.00 : 0.09 | 218 : 64 |
| Brutal v balanced reference | 100% (64–0) [94–100] | 3.00 : 0.05 | 195 : 28 |
| Hard v Medium | 79.7% (51–13) [68–88] | 2.69 : 1.56 | 232 : 190 |
| Hard v Easy | 98.4% (63–1) [92–100] | 2.97 : 0.48 | 234 : 104 |
| Medium v Easy | 93.8% (60–4) [85–98] | 2.91 : 1.00 | 247 : 152 |
| Easy v balanced reference | 100% (64–0) [94–100] | 3.00 : 0.25 | 205 : 86 |

- **Brutal's 95% target**, against the benchmark composition (Hard, Medium
  and the five reference styles, 448 games): **98.7%** (442–6) [97.1–99.4],
  met. **Against Hard alone it is not met: 92.2%** on these 64 games
  (91.4% over 256 games on seeds 1–16 while tuning). Brutal and Hard are
  the same intelligence and the gap is mostly reaction time: Brutal's
  window was deliberately not pushed below 0.07 s to close it (in a
  128-game trial, Brutal at 0.05–0.075 s beat a faster Hard, 0.12–0.19 s,
  96.9% of the time; the specification rules out winning by mechanical
  precision alone). Hard was set to a tournament player's 0.15–0.22 s.
- **Every move is used at every level** in these matches. Across Brutal v
  Hard, #0001's moves range from 3.5% (Hollow Purple) to 21.3% (the
  Homing Attack) of its presses, #0002's from 3.2% (the ground Spin
  Attack) to 28.1% (the Homing Attack in the air); the Deflect is 6.8% and
  20.5% of them (most as an aerial strike).
- **Clean execution:** no invalid input, inactivity incident or stuck
  navigation in any of the 704 matches. Falls with no hit in the 3
  seconds before (self-eliminations) were rare: Brutal 4 in 448 games,
  Hard 3 in 128, Medium 1 in 64, Easy 2 in 64. Energy ran out at most 10
  times in 64 games (Brutal against the projectile reference).
- **Limitations.** The reference opponents are simple scripts: every level,
  Easy included, beats them, so they measure robustness against styles,
  not human skill. No result here is a claim about play against people.
  Shields that actually block stay rare (about one a game): the CPU
  prefers to step, jump or strike first against these opponents' attacks.
