# Combat AI

Quick Battle's CPU and both of Watch Mode's are one controller,
`CombatAIController`, that plays whatever fighter it is given from that
fighter's own data, at the difficulty chosen. Difficulty changes how well
it thinks, never what its fighter can do. The product rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.8 and §6.3a.

| Module | Owns |
| --- | --- |
| [`js/game/ai/combat-ai.js`](../../js/game/ai/combat-ai.js) | `CombatAIController`: perception, sensing, evaluation, acting, the safety guard and the attack orientation it supplies. |
| [`js/game/ai/moveset.js`](../../js/game/ai/moveset.js) | `readMoveset` (cached per fighter): what the fighter can do, read from its definition and art. `hurtExtent`. |
| [`js/data/difficulty.js`](../../js/data/difficulty.js) | The four levels (Easy, Medium, Hard, Brutal), each a profile of perception and judgement traits; `resolveDifficulty` (anything unknown is Medium). |
| [`js/game/fighters/fighter-controller.js`](../../js/game/fighters/fighter-controller.js) | `PlayerController`, `blankInput`, `jumpTapHold`, and the older non-attacking `TrainingAIController` (unused by every mode). |
| [`js/game/battle.js`](../../js/game/battle.js) | Building each side's controller with a seeded RNG (`BATTLE_MODES`, `deriveSeed`). |

## A controller like a player's

`Fighter.update` asks its controller for one input snapshot per fixed
step; the CPU produces exactly the snapshot a player would (held
directions, Down, Jump, Shield, the combat buttons and their one-step
`…Pressed` edges, a Dash or an air dash by double tap, a Deflect by a
fresh Shield press in the air). The fighter and the combat
system decide what those inputs do, so the CPU cannot attack while
stunned, skip recovery, bypass a cooldown or spawn anything itself. It
never writes to a fighter, never reads the player's raw input, and never
uses the training CPU's platform drop.

Each step it **perceives** (something new the opponent does, such as an
attack's startup, a projectile, a clone's cloud, a technique or a whiff,
is an event taken in after a reaction delay sampled from the level, or
never on a lapse), **senses** the fight (both fighters, their attacks and
phases, Shield, techniques, Energy, Launch Point, cooldowns, projectiles,
clones, the stage, the score and the clock), **evaluates** options when
its reassessment timer is due or an event is urgent (answer a threat,
strike, throw a projectile, a summon or technique, approach, space, Dash, jump in,
air dash, make for the centre, wait) and **acts** over as many steps as an option
needs. A guard keeps it off the main floor's edge, and every jump it
presses is the normal one (`jumpTapHold`). Prediction is limited to
projecting current motion over the level's short horizon.

## From the fighter's own data

The options come from `readMoveset(fighter)`, never from a fighter's id:

- every button in its `actions` that starts an attack, on the ground and
  in the air, split into melee (with its reach swept along its motion,
  or widened to its pull's circle: `attackReach`) and ranged (with its
  projectile's speed, its pull's reach and what its hit is worth, every
  strike of a piercing one counted);
- its summons and techniques (each with its own button, its lead, where
  it lands and its hit), only if their art and data are complete;
- whether it has a Shield on the ground (`groundShield`; there is no
  Shield in the air, and nothing in the moveset says there is), a Deflect
  in the air (`deflect`: its attack on the `shield` button, its reach,
  whether it turns projectiles back and its Energy cost), a Dash and an air dash (each with
  its distance and cost; the Dash also with its `reach`, the distance its
  burst's run-on adds, and what a Dash cancel costs). The distances come
  from the universal movement values, the same for every fighter;
- its hurtboxes' extent.

A reserved button, a button the fighter does not have, or a move it would
refuse for missing art is never in its moveset, so the CPU never presses a
button that cannot do anything. A fighter with no summons or techniques
never plans one; one with no Shield never shields.

Its Shield is weighed by what a block costs, the same whether the block
would be perfect or not (a perfect block's advantage is its missing
blockstun, never Energy).

How it weighs a hit is generic too: damage and launch (more at a high
Launch Point and near a ledge it launches toward), a paralysis as the free
hits it opens, and a paralysed opponent as an opening as long as the hold
lasts. A technique that holds the fighter in place while it casts counts
the risk of being struck first, smaller when its opponent hides behind a
Shield that cannot stop it. And it never raises a Shield against a hit no
Shield stops: it steps out, jumps, Dashes, strikes first or, with an
erasing projectile of its own, meets it instead.

It does not play the same trick over and over: a summon, a technique or
a ranged attack pressed in the last few seconds (`SPECIAL_REST`) is
weighed down, each move apart, so a move with no cooldown (#0001's
techniques and orbs have none) is one choice among its moves rather than
the only one. The same on every level: judgement, not a rule of the fight.

In the air it never holds the Shield button (a Shield plan ends as it
leaves the ground). Its answer to a projectile on course for it there is
its Deflect, considered when the Deflect pressed now would be live as the
shot meets its box (and before the shot reaches its body); a careful
level watches such a shot step by step, since the window is a few steps
long. Unblockable shots too: a Deflect is no Shield. It costs Energy as it
starts, as it does a player, so the CPU never plans one while exhausted
and weighs its price as it weighs a block's. The Deflect is also one of
its aerial strikes. The air dash is mobility: knocked off the stage
but level with its top and too far out to drift back, it air dashes home
(as often as its level Dashes at all), and in the air it may air dash to
close in, both only when an air dash could start (one left this airtime,
not exhausted, not in free fall, not flying from a launch).

It plays the faster game as a player does, through the same rules:

- **Attack drift.** Where an attack carries it before it strikes is
  computed by stepping the very rules the Fighter runs (`attackStartSpeed`
  and `steerAttack` from `js/game/fighters/movement.js`) over the attack's
  startup, so a Dash's burst carried into an attack is a lunge it plans
  for.
- **The Dash.** It Dashes in from a little more than a Dash's length out
  to where a Dash, its run-on and a strike reach; a planned follow-up
  strikes out of the Dash as soon as one connects, cutting it short past
  its cancel time, rather than waiting for it to end.
- **Hit-cancels.** Mid-attack, when its attack hit and may be cut short,
  it may follow up at once (`chase`), as readily as its level punishes: a
  strike that connects now (never the same attack again), or on the
  ground a Dash after an opponent sent out of reach (a level that Dashes,
  with the Energy a Dash cancel costs).
- **The triple jump.** Knocked off the stage it jumps back with every air
  jump it has left (both, after a hit gives them back).

## Difficulty

`js/data/difficulty.js` holds one profile per level: reaction window
(`react`), lapse chance, reassessment interval (`think`), decision noise,
hesitation, spacing error, motion lookahead, and weights for defense
(`guard`), punishing, summons and techniques (`specials`), Dash, planning,
aggression, stage sense and Energy care. Every trait is ordered from Easy
to Brutal; Brutal's reaction is fast but never zero. The reaction windows
are the same for every fighter (set against startups from a jab's 1/12 s
to a technique's half second or more);
no level changes damage, launch, hitstun, blockstun, animation timing,
speed, jumps, gravity, the Dash, the Shield, Energy or any cost in it,
cooldowns, hitboxes, physics, scoring or respawns: Easy and Brutal
control the very same physical fighter. A profile holds the traits above
and nothing else, and no module of the fighter, the combat engine or the
physics reads a difficulty, so there is nothing a level could multiply a
hit by; [`tests/systems/combat-rules.test.mjs`](../../tests/systems/combat-rules.test.mjs)
resolves the same attacks, blocks, Dash and Deflect under every level
(and for a player) and finds them identical, step for step.

## Determinism

Each CPU draws from an injected seeded RNG (`mulberry32`). In Watch Mode
each side has its own stream derived from the battle's seed, so a seeded
match replays step for step while the two CPUs never share one sequence,
even in a mirror match.

## Attack orientation

The controller also supplies `attackFacing`: the live direction of its
target, sampled by the Fighter every simulation step while an attack, a
technique or a summon startup plays. Ordinary attacks turn their hitboxes
(and a projectile not yet released) with the sprite; motion attacks and
techniques only turn their artwork, keeping their committed direction;
spawned projectiles never turn. Equal horizontal coordinates keep the
last valid direction. Player and training controllers supply none, so
manual facing is unchanged.

## Tests

- [`tests/systems/combat-ai.test.mjs`](../../tests/systems/combat-ai.test.mjs):
  it fights through inputs only, reacts late on low levels and early (never
  instantly) on high ones, keeps off the Void's edge, never touches a
  fighter's stats, and reads every fighter's moveset from its data.
- [`tests/systems/deflect.test.mjs`](../../tests/systems/deflect.test.mjs)
  and [`air-mouvment.test.mjs`](../../tests/systems/air-mouvment.test.mjs):
  the CPU Deflecting a shot in the air, never holding a Shield there, and
  air dashing home.
- [`tests/integration/difficulty.test.mjs`](../../tests/integration/difficulty.test.mjs):
  the levels, their ordering and the Select Difficulty screen.
- [`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs):
  every pairing, each CPU using only its own moves, seeded replays.
- [`tests/systems/facing.test.mjs`](../../tests/systems/facing.test.mjs):
  the CPU's attack orientation.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs)
  and [`tests/systems/sample-fighter.test.mjs`](../../tests/systems/sample-fighter.test.mjs):
  the CPU playing fighters that are not #0001.
