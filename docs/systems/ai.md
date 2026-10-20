# CPU Intelligence

Quick Battle's CPU and both of Watch Mode's are one universal intelligence,
**CPU Intelligence** (`js/game/ai/cpu-intelligence/`), behind the
`CombatAIController` every mode builds. It plays whatever fighter it is
given from that fighter's own data, at the difficulty chosen. There is one
brain for every fighter and every level: a level changes how well it
perceives, thinks and executes, never what its fighter can do. It plays a
match, not only an exchange: it knows what it is after in the match as a
whole (building an advantage, finishing an exposed opponent, breaking off
to recover, protecting a lead, forcing a comeback), and it may stand still
on purpose, knowing why it waits and what will end the wait. The product
rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.8 and §6.3a.

Practice Ground keeps its training dummy (no controller); the older
non-attacking `TrainingAIController` stays in
`js/game/fighters/fighter-controller.js`, unused by every mode.

## Modules

| Module | Layer | Owns |
| --- | --- | --- |
| [`combat-ai.js`](../../js/game/ai/combat-ai.js) | — | `CombatAIController`, the controller the modes build: CPU Intelligence itself. |
| [`cpu-intelligence/brain.js`](../../js/game/ai/cpu-intelligence/brain.js) | the hierarchy | `CpuIntelligence`: runs the layers every fixed step, the decision order and its cadence, choosing whether to commit or wait, combo follow-ups and their hit-confirm, breaking off to a safer spot and deliberate waits, recovery and edge-guard plans, the point of no return, launch steering, the intent-aware liveness monitor, the attack orientation, directives for tests. |
| [`cpu-intelligence/capabilities.js`](../../js/game/ai/cpu-intelligence/capabilities.js) | 1. capabilities | `analyzeCapabilities` (cached per fighter): every move with its timing, reach, strikes, projectile, motion, cooldowns, air uses, Energy and **roles**; the Shield, the Deflect, movement and launch reaction. `moveReady`. |
| [`cpu-intelligence/perception.js`](../../js/game/ai/cpu-intelligence/perception.js) | 2. perception | `Perception`: the opponent as it was `latency` ago (a ring of snapshots), recognized or lapsed events, the projectiles and clones the CPU has seen. |
| [`cpu-intelligence/situation.js`](../../js/game/ai/cpu-intelligence/situation.js), [`stage-model.js`](../../js/game/ai/cpu-intelligence/stage-model.js), [`prediction.js`](../../js/game/ai/cpu-intelligence/prediction.js) | 3. world model | `Situation` (rebuilt each step), `StageModel` (ledges, surfaces, the Void in force, read live; a stage's moving or vanishing platforms read live too: where each is now, and none while it is hidden or forming, nor as a stepping stone while it fades; on a continuous ground, the combat area's edges in place of ledges; and a stage hazard's visible warnings, `dangerZones`, never a landing before its warning shows), and the forward simulation on the game's own rules: paths, jump arcs, move contact, projectile contact, launches and recoveries. |
| [`cpu-intelligence/opponent-model.js`](../../js/game/ai/cpu-intelligence/opponent-model.js) | 4. opponent model | `OpponentModel`: decaying rates of what the opponent was seen doing (jumps, Shields under threat and held, projectiles, Dashes, whiffs, attacks within reach, backing off when hurt, moving about, preferred range, repeated moves) and of how the CPU's own attacks fared against it (blocked, whiffed, punished); the habits read from them (`turtling`, `walls`, `punishing`, `mobile`, `recovering`, …), trusted as fast as the level adapts. |
| [`cpu-intelligence/objective.js`](../../js/game/ai/cpu-intelligence/objective.js) | 5a. match objective | `MatchObjective`: what the CPU is after in the match (build, finish, stabilize, protect, survive, force, regroup) from the score, the clock, overtime's tiebreak and its closing Void, both fighters' exposure and how long nothing has happened; persistence, progress checks, impatience, a seeded temperament. |
| [`cpu-intelligence/strategy.js`](../../js/game/ai/cpu-intelligence/strategy.js) | 5b. combat strategy | `Strategy`: the launch estimates (`danger`, `finish`, and after another hit or two `dangerSoon`, `finishSoon`; `dangerAt` any spot), and the mode (rushdown, controlled offense, neutral, counterplay, zoning, trap control, survival, finisher hunt, recovery) re-weighed from both Launch Points, footing, Energy, kit, habits and the match objective, with hysteresis. |
| [`cpu-intelligence/evaluator.js`](../../js/game/ai/cpu-intelligence/evaluator.js), [`values.js`](../../js/game/ai/cpu-intelligence/values.js) | 6–7. tactics, combos | `Evaluator`: every move now, out of a Dash or out of a jump, scored by expected utility; combo follow-ups on the launch dealt. `LaunchJudge`, `KO_VALUE`: what outcomes are worth. |
| [`cpu-intelligence/defense.js`](../../js/game/ai/cpu-intelligence/defense.js) | threats | `Defense`: recognized threats (melee, projectiles, throws, techniques, clones) and the best answer to each. |
| [`cpu-intelligence/plans.js`](../../js/game/ai/cpu-intelligence/plans.js) | 8. plans | `makePlan`: each plan kind as a small state machine over steps, with a lifetime, an explicit end and its intent (a plan that stands still on purpose says so); footwork with a dead band; `hold` (a deliberate wait and what ends it) and `retreat`; `CONTINUED`, the plans a reassessment carries on rather than restarts. |
| [`cpu-intelligence/executor.js`](../../js/game/ai/cpu-intelligence/executor.js) | 9. execution | `Executor`: the plan's wishes turned into one legal `FighterInput` snapshot (press edges, jump holds, the Mouvement request, no Shield in the air but the Deflect), with the ledge guard. |
| [`cpu-intelligence/telemetry.js`](../../js/game/ai/cpu-intelligence/telemetry.js) | 11. telemetry | `Telemetry`: counters, move usage, waits with their reasons and ends, time per objective, inactivity by cause, the debug trace and its events, `STILL_LIMIT`, `WAIT_LIMIT`. |
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

## From the match to the buttons

Four layers, each informing the one below and never reaching past it:

1. **The match objective** (`MatchObjective`): what winning the match asks
   for now, which is not always winning the exchange in front of it.
2. **The combat strategy** (`Strategy`): the mode that serves it, the bar a
   commitment must clear, how much risk counts, the spacing.
3. **The tactical plan**: the move, Dash-in, jump-in, footwork, retreat or
   wait chosen by expected utility under that strategy (`Evaluator`,
   `choose`, `movePlan`).
4. **Legal inputs** (`Executor`): one input snapshot, as a player's.

### Match objectives

| Objective | When | What it asks of the strategy |
| --- | --- | --- |
| `build` | Even: nothing more pressing. | The modes as they are, waiting a little for clearer chances; grows as impatience does. |
| `finish` | The opponent exposed: the CPU's best launch likely to end its life now or after another hit or two (more so off the stage, or at match point). | Finisher hunt and trap control, a lower bar, risk counting a little less, crossing over to launch toward the near ledge. |
| `stabilize` | The CPU the exposed one, with time to recover (2 s unhit, then 2 Launch Point a second) and no comeback to make. | Survival and counterplay, a higher bar, risk counting more, and breaking off: a safer spot, then a deliberate wait there, Shield ready. |
| `protect` | Ahead with the clock running down (against how long a point has been taking in this match), or ahead on overtime's tiebreak. | Counterplay and zoning, a higher bar, no needless risk: it lets the opponent come and still counters. |
| `survive` | Ahead with seconds left. | Running the clock out: a safe spot, no edge-guarding. |
| `force` | Behind with too little time to wait, or losing (or level on) overtime's tiebreak. | Rushdown and finisher hunt, a much lower bar, risk counting less, no waiting. |
| `regroup` | The opponent out of play (respawning). | A spot near where it will come back, waiting there (healing itself if it can). |

Each fighter's exposure is read from the real launch rules
(`Strategy.danger`, `finish` and their "after another hit or two" forms),
smoothed over about a second, so a step toward a ledge and back changes
nothing. Overtime's tiebreak is projected to the end of the clock, both
Launch Points recovering as it runs. The closing Void is in every launch
prediction, so late overtime makes the stage more dangerous to it.

**Persistence.** An objective has a minimum dwell (1.2 s, plus up to 2.3 s
with the level's `discipline`) and keeps a bonus while it holds; only an
important event (a point scored, a respawn, overtime starting, the clock
entering its last 30 or 12 s, a heavy hit taken, the first look at the
match) or a clearly better objective changes it sooner. It watches its own
progress: a `stabilize` that keeps getting hit (2 to 4 hits, by
discipline) gives way to fighting back for 4 s, and one whose Launch Point
is not coming down by at least 4 every 5 s (the opponent pressing it the
whole time) stops counting as progress.

**Impatience** grows once nothing has happened for longer than the level's
patience (3 s plus up to 8 s, by `patience`), or once a break-off has
stalled that long, unless waiting is itself winning (ahead with the clock
running, its Launch Point coming back down). It lowers the bar and lifts
`build` over the waiting objectives, so two cautious CPUs never wait on
each other for ever. A little seeded **temperament** (a touch bolder or
more patient this match) keeps two CPUs of one level from being the same
player. The level's `awareness` decides how fully all of this is read (a
casual player half reads the score and the clock), `discipline` how
reliably it does what the objective asks (whether it heeds a call to break
off is drawn once per call).

## The step

Every fixed step, in this order:

1. **Observe.** Perception records the opponent and recognizes what it
   did (an attack's startup, a whiff, a jump, a landing, a Dash, a Shield,
   exhaustion, a projectile, a clone, a cast) once it has been on screen
   for the level's latency, or lets it lapse. The situation is rebuilt:
   the CPU's own fighter exactly, its opponent as perceived and carried
   forward by its visible motion (or, off the stage and free, along its
   likely recovery) and shifted by the level's misjudgement of range (a
   lasting impression that drifts to a fresh one every second or so, never
   a flicker), both kits, the stage, the projectiles it has seen, the score
   and clock. The opponent model takes in the events. On the level's
   reassessment cadence (`think`) the launch estimates, the match objective
   and the strategy mode are re-weighed, and it draws whether it sees the
   openings (`punish`) and the finishers (`opportunity`) this time.
2. **Forced states.** Stunned, frozen or paralysed, it only steers the
   coming launch (as a player may hold a direction).
3. **Survival.** Off the stage, the recovery plan takes over: several
   routes (when to air jump, whether to air dash, a lift as a last
   resort) are simulated on the real rules and the best one flown, the
   level judging the timing more or less precisely, and routes through
   the reach of an opponent waiting at the ledge are avoided. A visible
   hazard warning under it, or a platform starting to fade under it, is
   stepped out of, as often as the level notices.
4. **Threats.** A newly recognized threat may interrupt any plan with the
   best answer: a Shield (raised in time, perfect when the level times
   it), a jump over it (timed if it is still far), a step or a Dash out of
   reach, drifting away, the Deflect (timed so the swat is live as the
   shot arrives, and worth more when the turned-back shot can still hit
   its thrower), a strike that lands first, or a projectile that erases or
   repels it. Every threat is an attack and every attack is blockable, so
   the Shield is weighed against all of them: a technique's burst (Unlimited
   Void), a sphere (Hollow Purple), a clone's strike and a Deflect's as
   surely as a jab; it is chosen when it scores best, never forced (breaking
   a cast before it lets go, or Deflecting a shot back, often scores
   better). An answer for later is held until its moment, so the CPU keeps
   playing meanwhile.
5. **Combos.** When its hit lands, it knows only once it has seen it land
   (its hit-confirm: the level's reaction, quicker the more reliable its
   combos), then searches the best follow-up the rules allow against the
   launch it dealt (hit-cancels, a Dash or a jump after the hit) and
   presses it in time, or drops it if it no longer connects or the level
   fumbles it (`comboReliability`). A dropped combo is not picked up
   again as a fresh opening.
6. **The plan.** A committed plan (a Dash-in, a jump-in, a recovery, an
   answer) carries on until its objective is met or it fails. Before a
   strike is pressed it is checked again from where the CPU really is
   (still connects, still leaves a way home), and a jump-in waiting off
   the stage is dropped before the point of no return.
7. **Tactics.** If the plan may be reconsidered, a new one is chosen
   ([choosing to commit](#choosing-to-commit)). A fresh decision comes on
   the level's reassessment cadence, like the next thing a player decides
   to do; in between, only an opening it sees is taken at once, and its
   footwork carries on. The attack sequence with the best utility if it
   clears the bar, else the movement the objective and mode call for
   (breaking off to a safer spot or a deliberate wait, navigation to
   another level, edge-guarding, crossing over to finish, neutral
   footwork).
8. **Execute** through the executor, with the ledge guard.
9. **Liveness**, aware of intent ([waiting on purpose](#waiting-on-purpose)).

## Choosing to commit

Against a free opponent, keeping its options open is worth something: a
patient player waits for a clearer chance. Each candidate's utility has
that **value of waiting** taken off before it is compared: `0.4 + 1.6 ×
patience`, times how selective the objective is, less as impatience grows,
and less again when waiting would not make the opponent commit (it sits
behind a raised Shield, turtles by habit, or holds back). An **opening**
(the opponent still busy when the move lands) pays nothing for it and is
taken at once. Keeping out of the fight (`stabilize`, `protect`,
`survive`), even an opening must be a clear one (a hit chance of 0.45 or
more, and half the wait paid), and going in after the opponent (a Dash-in
or a jump-in from the ground) pays more again: it lets the opponent come.
The best candidate (with the level's noise) is taken only if it clears the
**bar**, `1 − aggro`, `aggro` being the mode's own plus the objective's
shift and its impatience.

**Pressure that is not working** (attacks on a free opponent that whiffed
or were blocked, one after another: 2 to 5 tries, by the mode's aggression
and the level's initiative) is broken off for a moment: back to a spacing
outside the opponent's reach, taking only an opening, before it presses
again. Impatient, or for a moment after a wait at its spacing that ran past
`WAIT_LIMIT`, its footwork stops waiting at the edge of the opponent's
reach for something to happen and steps into its own range, where it has
options. A finisher it does not see this time is weighed for everything but
the life it would end. Its own combo is no fresh opening before it has
confirmed the hit, nor once it has dropped it.

## Waiting on purpose

Standing still is allowed when it is meant. A plan that stands still on
purpose has `intent` `'wait'` and a `why`: a `hold` (recovering Launch
Point, protecting the lead, running out the clock), footwork settled at its
spacing (its dead band keeps it from twitching round the spot: it sets off
only once past the band, re-aims only when the opponent has moved past it,
and lets go a stopping distance early), a ledge guarded, a spot taken while
the opponent respawns. `controller.waiting` gives the reason.

A **hold** knows the spot it holds (walked back to if it is pushed off),
whether to keep its Shield ready, and what ends the wait: the opponent
coming within reach (unless its Shield is up and holding), its patience
running out (1.4 s plus up to 2.6 s by `patience`, more when waiting suits
the objective, by temperament), the objective changing, its Launch Point
down to 40% of where the wait began, the footing fading, a hazard's
warning, the opponent leaving or rejoining play. Its **Shield** goes up
only as an opponent on its level closes in or attacks, for a few blocks at
most (2 to 4, by discipline) and at most 0.9 to 2.3 s at a stretch (by
patience), then rests 1.2 to 2 s before it may go up again; never without
the Energy for it. A wait the opponent's reach would end at once is no
wait: it keeps its footwork, or fights.

The **liveness monitor** tells two kinds of stillness apart. Free to act on
the ground in a live match, with nothing held, pressed or moving:

- with a plan whose intent is `'wait'`, it is **waiting**: counted with its
  reason (`telemetry.waitReasons`), never an incident. A wait that runs on
  unbroken past `WAIT_LIMIT` (10 s) makes it reassess at once and (unless
  it is running out the clock) move for a moment before it may wait again:
  a wait is never endless;
- with no plan, a plan that should be moving but is not, or a walk the
  ledge guard keeps holding back, it is an **inactivity incident** after
  `STILL_LIMIT` (0.45 s), counted by cause (`inactivityCauses`; a ledge
  guard holding it back is a navigation failure too), and a fresh plan is
  taken at once.

## Breaking off to recover

With the objective `stabilize` (and the level heeding it), `protect` or
`survive`, the CPU looks for a **safer spot** a couple of times a second: a
handful of spots on the floor it stands on (where it is, 160 and 320
further from the opponent, 480 with a good stage sense, the centre), each
weighed by how likely the opponent's best launch would be to end its life
there after another hit or two (`Strategy.dangerAt`, the Void in force
included), the room it leaves to the opponent and to the ledge behind it,
the way there and its distance from the Void; never past the opponent (no
way there but through it), never under a hazard's warning, a lower level
weighing them less exactly. Only a clearly better spot more than 50 away is
worth a **retreat** (Dashing clear when the opponent is right on it and the
Energy allows; abandoned, and not tried again at once, when the opponent
cuts it off, the way is blocked or the spot comes under a warning);
otherwise it **holds** where it stands. The break-off sees itself through
until its Launch Point has come well down, and gives way at once when the
opponent becomes exposed (`finish`), when it keeps getting hit, or when its
Launch Point is not coming back. The telemetry counts retreats, those that
held (Launch Point recovered unhit), those a hit broke, and the Launch
Point recovered meanwhile.

While the opponent is **out of play** (respawning) an attack planned on it
is dropped before it is pressed (nobody to hit), and the CPU takes up a
spot on the centre side of where it will reappear, outside its reach, and
waits there, its Launch Point recovering (a heal of its own is cast if it
has one); a wait there that runs past `WAIT_LIMIT` takes a fresh spot a
little nearer the centre.

## Evaluating an option

Each candidate (a move now, out of a Dash of a few lengths, or out of a
jump arc) is simulated on the game's own rules (`stepBody`, `steer`,
`steerAttack`, the attack's own motion) against the opponent's predicted
path, and scored as expected utility:

- **P(hit), P(block), P(miss):** the room it has against how far the
  opponent could move once it sees it coming (and is free to), a Shield
  in the way (the opponent's observed habit; every move is blockable, a
  technique's or a summon's included), the move's predictability from
  repetition. An opponent already behind its Shield that cannot lower it
  before the move lands (held in its blockstun, or no time to react)
  blocks it for certain: the CPU never predicts a hit through a raised
  Shield, and at most a small chance (that it is lowered first) otherwise.
- **Values:** damage weighed by the Launch Point it reaches, the launch
  judged by the real launch rules (a launch that ends a life is worth
  `KO_VALUE`, more at match point; one that leaves the target off the
  stage an edge-guard), a paralysis (or a float, which holds as one does)
  as the hits it opens, a charm as the
  seconds of unanswered offence it buys (4 a second, a quarter of that
  while one is still running), a fear as the seconds of feeding it buys (3
  a second, a sixth of that while one is still running) and, while an
  opponent is frightened of it, every hit by what it would feed (its damage,
  more the higher the CPU's own Launch Point), the combo the
  stun leaves time for; a block or a whiff costs what the opponent can
  punish in the window it leaves.
- **Risks:** an incoming threat that lands first; walking into the live
  box of the attack the opponent is already making; being interrupted by
  an opponent free in time (it reacting, or up close pressing a quicker
  strike first, by its observed habit); the CPU's own elimination (a
  recovery simulated from where the move ends); at a Launch Point where
  the opponent's best launch ends its life, being hit costs a life; an
  attack's own pull, reeling an opponent the CPU could likely finish where
  it stands (its `finish` estimate over 0.35: by a ledge, say) back to
  safety, gives that finish up, unless the move's own blow is likely to
  end its life.
- **Costs:** Energy (emptying the bar is worth it only for a life), long
  cooldowns, tempo (the same hit is worth less the longer it takes).
- **Preferences:** the strategy mode's roles (and the roles the opponent's
  habits call for: anti-air against a jumper, Shield pressure against a
  turtle, a counter-projectile against a zoner), and variety (a move left
  unused grows more tempting, more deliberately the higher the level).
- **The opponent's habits** shift the chances: a block is likelier against
  one that walls (Shields and holds back), a whiff costs more against one
  that punishes, and a slow move is likelier to be avoided by one that
  keeps moving.

## Universal by construction

Nothing in `js/game/ai/` names a fighter or branches on its id (Rule C,
checked by the tests). Everything comes from the fighter's data through
`analyzeCapabilities`: each move's classification (`offense`, the same
shared reading combat makes: a technique, a summon, a throw and the Deflect
are attacks to the CPU too, the Deflect a defense as well), its role
(`poke`, `approach`, `comboStarter`, `launcher`, `finisher`, `antiAir`,
`zoning`, `trap`, `areaDenial`, `punish`, `edgeGuard`, `recovery`,
`counterProjectile`, `shieldPressure`, `defensiveDisengage`, `spike`,
`heal`; none gets past a Shield), its reach swept along its motion (a
slam's to where it would land, with its impact), its projectile's range
and pull, its technique's burst and heal, its summon's clone, whether a
hit is a quake or a gaze, its cooldowns and air uses. The forward
simulation follows the same rules as combat: a quake strike, burst or
impact meets only a fighter its path has standing on the ground (so the CPU
counts on none against an airborne opponent, and fears none while its own
path keeps it in the air), a gaze burst only an opponent facing the CPU,
and a slam stands through its landing where it lands. A
heal is no attack: the CPU casts it when it has taken enough for the
whole heal to count and the opponent, busy as long as it is and then
closing in with a Dash and a run, could not reach it before the cast lets
go (`healPlan`). Charmed by its opponent (a hit's `charm`: its hits on
that opponent would heal it), it strikes nothing at it while the charm
runs: no new plan to attack, no combo follow-up, no strike or projectile
in answer to a threat; it keeps its distance (out of the opponent's
reach) and defends, then fights as ever once it runs out (`me.charmed` in
the situation). Frightened by its opponent (a hit's `fear`: every hit that
opponent lands on it feeds that opponent), it keeps just out of the
opponent's reach and never presses in until the fear runs out
(`me.frightened`); it sees an opponent frightened of it as long as the
fear it saw has left (`op.frightened`). Movement is universal (`js/data/movement.js`). A new
fighter is played well with no CPU change at all.

## Difficulty

A profile (`js/data/difficulty.js`) holds only how well the CPU thinks:

| Trait | Effect |
| --- | --- |
| `react` | Perception latency window (Easy 0.30–0.46 s, Medium 0.19–0.30, Hard 0.15–0.22, Brutal 0.07–0.105; never zero). |
| `lapse` | Chance a new opponent action is not recognized. |
| `think` | Seconds between reassessments and fresh decisions (Easy 0.22–0.36 s, Medium 0.08–0.14, Hard 0.04–0.07, Brutal 0.034–0.056); an opening it sees, a threat and a combo are looked at at once. |
| `noise` | Jitter on every option's utility. |
| `rangeError`, `predictError` | Spacing misjudgement (Easy 34 units, Medium 15, Hard 7, Brutal 2), applied to the whole projected path of the opponent, so it misjudges whether its own moves connect; error on the projected motion. |
| `timing` | Execution error on a timed press. |
| `lookahead`, `planDepth` | How far motion is projected; which Dash lengths, jump arcs and targets are weighed. |
| `comboReliability` | Chance a found follow-up is executed in time (Easy 0.32, Medium 0.64, Hard 0.86, Brutal 0.98), and how quickly it confirms its hit before following up. |
| `guard`, `perfectShield` | How fully threats are answered; how often a Shield is perfect. |
| `punish`, `opportunity` | How often an opening, or a finisher, is recognized. |
| `adapt` | How fast and far observed habits are trusted; how deliberately it varies its moves. |
| `energySense`, `riskSense`, `stageSense` | Energy management; how fully risks count; ledges, edge-guards, the point of no return. |
| `diSkill`, `recoverySkill` | Steering launches; accuracy of recovery routes. |
| `initiative` | Willingness to start offense; how long it keeps up pressure that is not working. |
| `patience` | How long it is content to wait on purpose, and what a clearer chance is worth to it (the value of waiting). |
| `discipline` | How reliably it does what its objective asks (breaking off to recover, not chasing damage while protecting a lead), how firmly it holds an objective, how few blocks it Shields before moving. |
| `awareness` | How fully it reads the match: the score, the clock, overtime's tiebreak, each fighter's exposure. |

Every trait is ordered Easy → Brutal (`CAPABILITY`). No level changes
damage, launch, hitstun, blockstun, timing, speed, jumps, gravity, the
Dash, the Shield, Energy or its costs, cooldowns, hitboxes, physics,
scoring or respawns: no module of the fighter, the combat engine or the
physics reads a difficulty.

The same intelligence runs on every level (no feature is switched off
for a lower one); what changes is how well each part of it works:

- **Easy**, a casual player: sees things late and decides slowly (a fresh
  idea every quarter to third of a second), misjudges ranges (it whiffs,
  and walks into hits), confirms and finishes combos unreliably, often
  misses openings and finishers, half reads the score and the clock, often
  keeps trading when it should break off, and waits only briefly before it
  goes back in. It plays to win, uses its whole kit, and is beatable.
- **Medium**, a regular player: combos, adapts to habits, recovers
  reliably, breaks off and comes back more often than not, reads the match
  most of the time.
- **Hard**, tournament level: reads the slower moves, punishes whiffs,
  edge-guards, manages Energy, plays the score and the clock, and is
  patient when patience pays.
- **Brutal**, elite: fast (never instant) reactions and consistent
  judgement, deep jump and Dash searches, precise punishes and recoveries,
  quick adaptation, and disciplined match play.

## Debugging

`new CombatAIController({ difficulty, rng, debug: true })` keeps a ring of
decision traces (`telemetry.trace`): the match objective and why ("own
Launch Point dangerous here (62%), the opponent's 8%: breaking off to
recover; Launch Point 131 to 40, 214 s left"), the mode, the plan, its
intent and reason (built from the numbers behind it: "Dash into;
extra_attack lands in 417 ms; launches", "stabilize: moving to safer
ground (21% a launch ends its life there, 58% here)"), its target, the
move, hit chance and value, both Launch Points, the danger and finishing
chances, Energy, what interrupted the last plan, and the opponent model's
summary; and a ring of the notable events between them
(`telemetry.events`: an objective changed, a wait that ended and why, a
retreat abandoned, held or broken, a long wait). `telemetry.explain()`
gives the latest in one line (`[stabilize · survival] hold: holding here,
Shield ready, while Launch Point 131 recovers (the opponent 420 away)`). With `debug` off none of this is built. The counters
(`telemetry.report()`) always run, cheaply: invalid inputs; expired,
failed and abandoned plans; stuck navigation and navigation failures;
inactivity by cause; waits (how many, seconds, reasons, what ended them,
long waits) and impatience; retreats (held, broken, Dashes clear) and the
Launch Point recovered breaking off; pressure resets; objective changes
and the seconds spent in each; threats that interrupted a plan; openings
and finishers recognized and missed; Shields, Deflects, recoveries,
Dashes, jumps, decisions, combos, answers by kind, every move's usage,
plans by kind.

For tests, `controller.neutral = false` holds its own offense and footwork
(it still perceives, defends and recovers), `controller.waiting` says what
it is deliberately waiting for (or null), `controller.objective` is its
match objective, and `controller.command(spec)` hands it one plan through
the same inputs (`{ press }`, `{ jump, dir }`, `{ dash }`,
`{ move, seconds }`, `{ shield }`).

## Tests and benchmark

- [`tests/systems/cpu-intelligence.test.mjs`](../../tests/systems/cpu-intelligence.test.mjs):
  inputs and intent-aware liveness at every level, approach, stage
  navigation (City), projectiles and the Deflect both ways, anti-air,
  recovery, Energy,
  Launch Point and match-situation strategy, overtime, punishes, move
  coverage (every move of every fighter in real fights at every level, and
  in an opportunity made for it: recognized, pressed, landed), combat
  correctness, difficulty progression, determinism, the debug trace.
- [`tests/systems/cpu-behaviour.test.mjs`](../../tests/systems/cpu-behaviour.test.mjs),
  on [`tests/helpers/cpu-scenario.mjs`](../../tests/helpers/cpu-scenario.mjs)
  (a CPU on a real `Battle` with the match set up as a scenario needs it):
  breaking off to recover with a dangerous Launch Point (A), finishing an
  exposed opponent (B), protecting a lead late and forcing a comeback, and
  Easy reading the match less fully (C, D), recovering and coming back
  (E), standing still deliberately when nothing needs doing (F), waiting
  out a respawn (G), stepping off a fading cloud (H), a retreat never ending
  under a hazard's warning (I), learning a turtle (J), overtime's tiebreak
  and its closing Void (K), every fighter through its capabilities (L), two
  cautious CPUs never waiting on each other for ever, and impatient
  footwork stepping into its own range (M), a break-off giving way to a
  finish once (N), the liveness monitor (a broken move plan and a
  ledge-guarded walk are incidents, a deliberate wait is not), and the
  telemetry's explanations.
- [`tests/systems/stage-hazards.test.mjs`](../../tests/systems/stage-hazards.test.mjs):
  the CPU knows a falling rock only by its visible warning, and a CPU in one
  steps out of it often, at every level, never every time (`avoidHazards`
  in `brain.js`: once per warning it decides whether it noticed, from its
  `stageSense` and `lapse`, capped at 90 %, and moves after its `react`
  time, the nearer way unless that way is under another warning).
- [`tests/systems/platform-hazards.test.mjs`](../../tests/systems/platform-hazards.test.mjs):
  the CPUs on Asperitas, Quick Battle and Watch Mode: following the player
  onto the drifting clouds, never picking a stale, fading or vanished one,
  never stuck, no accidental falls.
- [`tests/systems/combat-ai.test.mjs`](../../tests/systems/combat-ai.test.mjs):
  the controller contract (press edges, perceived facing, reserved
  buttons, the ledge guard, reaction scaling, cooldowns, no writes).
- [`tests/fighters/0001/cpu-0001.test.mjs`](../../tests/fighters/0001/cpu-0001.test.mjs),
  [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs),
  [`tests/fighters/0003/fighter-0003.test.mjs`](../../tests/fighters/0003/fighter-0003.test.mjs),
  [`tests/fighters/0004/fighter-0004.test.mjs`](../../tests/fighters/0004/fighter-0004.test.mjs):
  the CPU playing, and facing, each fighter; the quake and the slam read
  by the CPU in [`quake.test.mjs`](../../tests/systems/quake.test.mjs) and
  [`slam.test.mjs`](../../tests/systems/slam.test.mjs); a charmed CPU
  holding its strikes in [`charm.test.mjs`](../../tests/systems/charm.test.mjs);
  a float weighed as the hold it is in
  [`float.test.mjs`](../../tests/systems/float.test.mjs);
  [`tests/fighters/0005/fighter-0005.test.mjs`](../../tests/fighters/0005/fighter-0005.test.mjs):
  the CPU playing #0005 against each fighter, every move used.
- [`tests/helpers/cpu-match.mjs`](../../tests/helpers/cpu-match.mjs) and
  [`reference-opponents.mjs`](../../tests/helpers/reference-opponents.mjs):
  full matches on a real `Battle` (with how each side played: presses,
  jumps, Dashes, reversals, stillness and how much of it was meant, Shield
  time, lulls, objectives), five scripted reference styles, and
  `CompetentOpponent`, a scripted regular player (it spaces, Shields about
  half the attacks it sees, punishes whiffs, anti-airs, recovers with its
  air dash).
- [`tests/benchmarks/cpu-benchmark.mjs`](../../tests/benchmarks/cpu-benchmark.mjs),
  run by hand (`node tests/benchmarks/cpu-benchmark.mjs --suite all
  --seeds 4`): the benchmark below.

## Benchmark

Measured with `node tests/benchmarks/cpu-benchmark.mjs --suite all
--seeds 4` (run as four processes, `--from 1` to `--from 4 --seeds 1`):
256 deterministic matches per matchup (every pairing of the four fighters
both ways round and mirrored, Yerma and Sol-Noir, both starting sides,
seeds 1 to 4), first to 3 points under the full clock and overtime. Win
rates are the first side's, with their 95% Wilson interval. "Before" is the
previous CPU (commit `65fadc1`) measured by the same harness and recorder.

### Standard suite

| Matchup | Win rate before | Win rate now | Points now | Launch Point dealt : taken now |
| --- | --- | --- | --- | --- |
| Brutal v Hard | 91.8% [87.8–94.6] | **94.5%** (242–14) [91.0–96.7] | 2.93 : 0.83 | 245 : 143 |
| Brutal v Medium | 97.7% | 100% (256–0) | 3.00 : 0.20 | 219 : 72 |
| Brutal v aggressive reference | 100% | 100% | 3.00 : 0.04 | 213 : 46 |
| Brutal v defensive reference | 100% | 100% | 3.00 : 0.07 | 160 : 1 |
| Brutal v projectile reference | 100% | 100% | 3.00 : 0.05 | 142 : 4 |
| Brutal v jump-heavy reference | 100% | 100% | 3.00 : 0.09 | 203 : 62 |
| Brutal v balanced reference | 100% | 100% | 3.00 : 0.06 | 176 : 27 |
| Hard v Medium | 86.3% | 94.1% (241–15) | 2.91 : 0.84 | 243 : 148 |
| Hard v Easy | 99.6% (Easy 0.28 points) | 100% (Easy 0.05 points) | 3.00 : 0.05 | 218 : 50 |
| Medium v Easy | 93.0% (Easy 0.86 points) | 99.2% (Easy 0.23 points) | 2.98 : 0.23 | 239 : 98 |
| Easy v balanced reference | 99.6% (LP 184 : 100) | 92.2% (236–20) | 2.82 : 0.78 | 183 : 182 |

### Behaviour suite: how each level plays

Against the competent reference (`CompetentOpponent`), per minute in play
unless stated; "still" is the share of its time free on the ground spent
standing still, "meant" how much of that was a deliberate wait; ground
reversals are changes of running direction while free to act.

| Level | Win rate (LP taken) before → now | Attack presses | Ground reversals | Still (meant) | Longest still | Shield s/match | Energy run out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 100% (56) → 96.9% (144) | 101.8 → 65.9 | 48.2 → 43.5 | 0% → 21% (100%) | 0.3 → 10.0 s | 0.1 → 2.4 | 64 → 7 |
| Medium | 100% (33) → 100% (48) | 105.5 → 91.0 | 33.3 → 25.0 | 1% → 14% (96%) | 0.6 → 10.0 s | 0.1 → 0.1 | 65 → 19 |
| Hard | 100% (24) → 100% (31) | 105.8 → 98.4 | 26.0 → 16.8 | 2% → 14% (82%) | 0.3 → 9.2 s | 0.1 → 0.1 | 36 → 37 |
| Brutal | 100% (13) → 100% (14) | 106.8 → 101.5 | 20.1 → 11.7 | 4% → 13% (74%) | 0.3 → 1.5 s | 0.1 → 0.1 | 17 → 21 |

Each level against itself (Watch Mode):

| Mirror | Match length | Attack presses | Shield s/match | Longest lull (no attack by either) | Objectives (share of time in play) |
| --- | --- | --- | --- | --- | --- |
| Easy | 111 → 186 s | 77.8 → 53.7 | 0.1 → 6.8 | 3.4 → 5.5 s | build 54%, finish 21%, stabilize 20%, force 4% |
| Medium | 94 → 118 s | 75.6 → 63.1 | 0.1 → 3.6 | 3.9 → 4.6 s | build 52%, finish 25%, stabilize 22% |
| Hard | 86 → 105 s | 73.2 → 65.8 | 0.2 → 2.8 | 3.5 → 4.7 s | build 48%, finish 28%, stabilize 24% |
| Brutal | 82 → 98 s | 68.8 → 63.2 | 0.2 → 2.3 | 4.5 → 5.1 s | build 42%, finish 31%, stabilize 26% |

**New level against old level** (both CPUs in one match, the same game
code; 48 matches each: twelve pairings of the fighters, both stages, both
sides, seed 1):

| Level | New wins | Points new : old |
| --- | --- | --- |
| Easy | 4% | 0.52 : 2.88 |
| Medium | 23% | 1.54 : 2.60 |
| Hard | 27% | 1.60 : 2.60 |
| Brutal | 50% | 2.17 : 2.19 |

### What the numbers say

- **The old CPU's hyperactivity beat patience at the middle levels.** The
  new Medium and Hard lose to the old ones (23% and 27%): the old CPU
  decided again the moment an action ended and pressed about 100 times a
  minute at every level, and that relentless pressure beats a patient
  player of the same reactions. Brutal, which reassesses fast enough for
  either, is as strong as before (50%). The new middle levels are meant to
  be regular and tournament players rather than relentless machines; if
  they should be as strong as before, `patience` and `think` for Medium and
  Hard are where to tune.
- **Easy is no longer a weaker Brutal.** Before, every level pressed about
  100 times a minute against the competent reference and Easy took 56
  Launch Point a match from it; now Easy presses 66 times a minute, takes
  144, and scores against Medium almost never (0.23 points a match, from
  0.86). The levels are further apart: Hard beats Medium 94% (from 86%),
  Medium beats Easy 99% (from 93%). That gap is steep; whether Easy is now
  right for a newcomer is for playtesting.
- **Brutal's 95% target**, against the benchmark composition (Hard, Medium
  and the five reference styles, 1,792 matches): **99.2%** (1,778–14)
  [98.7–99.5], from 98.5%: met. **Against Hard alone it is not met: 94.5%**
  [91.0–96.7], from 91.8%. Review of the target: the composition is mostly
  scripted styles every level beats, so meeting it says little; the number
  that matters is Brutal against Hard, the same intelligence with slower
  reactions and judgement, which the specification does not allow to be won
  by mechanical precision alone. A target against Hard (or the competent
  reference) would be the more honest one to keep.
- **It waits, and means it.** A level now spends 13–21% of its free time on
  the ground standing still, most of it (71–100% by matchup) a deliberate
  wait with a reason; the rest is brief settles of footwork. No stillness ran past `WAIT_LIMIT` (10 s), and the longest
  lull between two CPUs in any matchup is 8.4 s (5.5 s in the mirrors).
- **Less twitching.** Ground reversals fell at every level (Brutal from 20
  to 12 a minute).
- **Clean execution:** no inactivity incident or stuck navigation in any of
  the 4,864 matches; five refused presses in all of them (three before).
  Accidental self-eliminations stay rare (Brutal 5 in 512 matches against
  Hard and Medium, as before).
- **Every move is used at every level.** The rarest is #0004's Ievan
  Polkka, cast 5 times in Easy's 32,232 presses (13 in 20,620 before): a
  heal that needs a safe moment, which a casual player seldom makes.
- **Performance** (Node, one process, Easy and Brutal mirrors on both
  stages, every CPU step timed): 108 µs a step on average (99 µs before),
  1.4 ms at the 99th percentile (1.2 ms), 3.0 ms at the 99.9th (3.2 ms);
  the rare spikes past a frame (16.7 ms) are there before and after
  (garbage collection). The debug trace and its events cost nothing with
  `debug` off. A browser on a phone is slower than Node: check Watch Mode
  there (see the checklist below).

**Limitations.** The reference opponents, the competent one included, are
scripts with no strategy: every level beats them, so they measure
robustness against styles and how the CPU plays, not human skill. Against
the defensive reference, which never attacks, a CPU ahead on points may let
the clock run: 5 of its 256 matches had a stretch of more than 20 s with no
attack by either side (the longest 186 s), the CPU stepping in for a moment
after each 10-second wait but finding nothing worth committing to. Easy's
casual misreads mean it sometimes trades when it should not (it heeds a
call to break off about half the time). No result here is a claim about play
against people.

## Human playtesting

No result in this document comes from people: the tests and the benchmark
measure the CPU against scripts and against itself. Whether it feels like
a human of its level is for human playtesting, which has not been done for
this version. A session that does it should cover, for each level, at
least three Quick Battles (different fighters and stages, Asperitas and
Adamaris among them) and one Watch Mode match, and note for each: level,
fighters, stage, result, how hard it felt (1–5), and anything that looked
wrong.

- **Easy.** Can a newcomer win within their first few matches, without it
  feeling like it lets them? Does it look like a person who is still
  learning (late reactions, whiffs, dropped combos, trading when it should
  not) rather than a machine that mashes or one that gives up?
- **Medium, Hard, Brutal.** Is each a clear step up from the one below? Does
  Hard punish mistakes and play the clock; does Brutal feel strong without
  looking inhuman (no frame-perfect reactions to everything)?
- **Waiting.** When it stands still, can you tell why (a safer spot, Shield
  ready, its Launch Point coming down; a lead to protect; a respawn to wait
  for)? Is it ever still for no reason? How long before it comes back: too
  soon to matter, or so long it is boring?
- **Breaking off.** With a high Launch Point, does it back away and recover,
  and can a player exploit that (chasing it into a corner, baiting its
  Shield until it breaks)? Does it ever camp behind its Shield?
- **The match.** Ahead late, does it protect the lead without stalling
  unfairly? Behind late, does it force the fight? In overtime, does it play
  the Launch Point tiebreak and respect the closing Void?
- **Movement.** Any left-right twitching on the spot, running back and forth
  at a ledge, or getting stuck under a platform?
- **Watch Mode.** Are CPU v CPU matches watchable: no long standoffs where
  both wait, no endless trading?
- **Performance.** A steady 60 Hz with two CPUs (Watch Mode) on a phone.
- **Both languages.** The four difficulty lines on Select Difficulty, in
  English and French.
