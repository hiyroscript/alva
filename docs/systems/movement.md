# Movement

**All fighters share universal baseline locomotion. Character identity
changes the moveset, not run/jump/Dash fundamentals.**

Alva has one movement system and one set of movement numbers, the same for
every fighter on the roster. How fast a fighter runs, how quickly it
turns, how high it jumps, its triple jump, its fast fall, its Dash and its
air dash never depend on who it is, how it looks or what its lore says: a
"speedster" runs exactly as fast as a sorcerer. What makes fighters
different is their moves, and a move may travel in its own way (a homing
dash, a roll, a plunge, a hover) because that motion is the move.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.3 (and
attack movement, the input buffer and hit-cancels in §7.2.4). This guide
explains how the code carries them out.

## 1. The shared implementation

| Module | Owns |
| --- | --- |
| [`js/data/movement.js`](../../js/data/movement.js) | The numbers: `BASE_FIGHTER_MOVEMENT`, one frozen object every Fighter reads (`MOVEMENT_FIELDS` lists them). `movementProblems` / `assertUniversalMovement`, which the registry uses to refuse a definition that declares movement of its own. And the Discover copy (`MOVEMENT_SUMMARY`, `MOVEMENT_GUIDE`). |
| [`js/game/fighters/movement.js`](../../js/game/fighters/movement.js) | The rules, as pure functions over those numbers: `steer` (ordinary locomotion: ground and air acceleration, braking, turning, overspeed), `attackDrift` (an attack's horizontal movement: its Step-in, then on the ground its speed running down whatever is held, in the air the universal air control), `activationStep` (the Step-in an activation makes: its move's on the ground, none in the air), `attackStartSpeed` (the momentum an attack keeps), `stepInTravel` (how far a Step-in carries a fighter, for planners), `hitstunDrag`, `fastFallVelocity`, `airJump`, `highJumpLift`. Each reads the values it is given on every call and writes only the body it is handed. |
| [`js/data/attack-movement.js`](../../js/data/attack-movement.js) | How an attack moves its fighter, the same rules for everyone: the shared Step-in (`STEP_IN`) and its verdict per move (`resolveStepIn`, `stepInEligible`), what an attack keeps of its speed (`resolveAttackCarry`), and the retired steering fields it refuses (`STEERING_FIELDS`). See [attack movement](#5-attack-movement). |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | All movement *state* (the body, the Dash or air dash, the burst, the jump buffer, coyote time, the higher jump, air jumps and air dashes left, the waiting tap, the buffered Dash) and the order things happen in each fixed step (`Fighter.update`). It decides *when* a rule applies (a stun, a paralysis, a Shield, a technique or a Dash takes the step first) and calls `movement.js` for the arithmetic. `fighter.movement` is always `BASE_FIGHTER_MOVEMENT`. |
| [`js/game/physics.js`](../../js/game/physics.js) | Integration and collision (`stepBody`): gravity, the fall cap, landing, solids and one-way platforms, moving ones included (`carryBody` carries a fighter standing on one by exactly its movement before its own step; `releaseGround` lets go of one that has vanished; see [stages](../gameplay/stages.md#platform-hazards)). It never knows why a body moves. |

No fighter definition has a `movement` profile or `powers` any more: the
registry ([`js/data/characters.js`](../../js/data/characters.js)) refuses
a definition that declares either, or any field of
`BASE_FIGHTER_MOVEMENT` at its top level, as it loads. The Fighter never
reads a definition's movement even if one is handed to it directly, so a
new fighter gets every value below without writing any of them, and no
fighter can get a faster run by any route. (Jump Power and Speed Power,
the tiers that used to set a fighter's jump and top speed, are gone: see
[history](#history).)

What happens in one fixed step, in order (`Fighter.update`): the
controller's input is read; cooldowns recover; a hit or paralysis ends a
technique, a summon's startup, a Dash or an attack; during an impact
freeze nothing moves (velocities are frozen, never lost; presses are
kept, a Shield press excepted); the Dash (or air dash) and a summon's
startup advance their clocks; in the air a fresh Shield press tries the
Deflect, then combat presses are tried (or buffered); a Dash (on the
ground) or an air dash (in the air) is tried, or buffered; a technique
advances; the Shield goes up or down (on the ground only); then
horizontal movement is chosen, in priority: standing still (a summon's
startup, a technique's cast, a paralysis), the hitstun drift, the Dash's
or the air dash's speed (an air dash also holds the fall off), the
Shield's stand (no steering at all), an attack's
own motion, an attack's drift (its Step-in; never steered on the ground,
the universal air control in the air), or normal steering.
Then the jump (buffered, with coyote time), the air jump, the higher
jump's lift and the fast fall; then the body is integrated and collided;
then launch rebounds, landing resets (air jumps, air dashes, per-airtime
attacks, free fall) and the landing cancel, the end of a Dash that lost
its ground or an air dash that found it, of a technique or a summon's
startup that lost its ground, the end of a spent burst, Energy refill,
facing and the visual state.

The simulation is fixed-step (1/60 s) and deterministic: the same inputs
give the same fight, step for step, at any frame rate
([`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs)
plays every pairing at 30, 60 and 144 fps and compares every step).

## 2. The universal values

`BASE_FIGHTER_MOVEMENT`, in world units and seconds (world gravity is
`CONFIG.sim.gravity`, 2500 units/s²):

| Field | Value | What it does |
| --- | --- | --- |
| `maxSpeed` | 420 | Top speed: what holding a direction builds toward from rest, on the ground and in the air. Not a cap (see overspeed). |
| `acceleration` | 6000 | Ground: rest to top speed in five steps (about 80 ms). |
| `deceleration` | 4800 | Ground: letting go stops a full run in about 90 ms, an 18-unit slide. |
| `turnBoost` | 2.2 | Ground: pressing against the way it moves brakes at `acceleration` × this (never softer than letting go), then accelerates the new way: a full turn in six steps. |
| `overspeedDeceleration` | 5400 | Ground, above top speed, nothing held (or pressing back, if harder than the turn): the excess bleeds off at this rate. |
| `overspeedHoldDeceleration` | 2400 | Ground, above top speed, holding the way it moves: far gentler, so speed is kept by whoever keeps going. |
| `airAcceleration` | 4000 | Air: speed gained toward top speed. Steering bends the drift instead of replacing it. |
| `airDeceleration` | 360 | Air: the gentle drag with nothing held. |
| `airTurnBoost` | 2.0 | Air: as `turnBoost`. |
| `airOverspeedDeceleration` | 2600 | Air, above top speed, for a burst of the fighter's own (a Dash's or an air dash's): it bleeds off at this rate. A launch's speed never does. |
| `jumpVelocity` | 920 | The normal jump's upward speed: about 170 units high. |
| `gravityScale` | 1 | The share of world gravity on the body. |
| `maxFallSpeed` | 1500 | The fall cap. |
| `fastFallAcceleration` / `fastFallSpeed` | 14000 / 1500 | Down held while falling speeds the fall up at this rate, to this speed. |
| `coyoteTime` | 0.1 | How long after leaving the ground a ground jump is still allowed. |
| `jumpBuffer` | 0.12 | How long a jump press waits for the first step it can be used. |
| `highJumpWindow` / `highJumpHeight` | 0.15 / 1.4 | Jump still held this long after takeoff makes the higher jump, up to this × the normal jump's height. |
| `airJumps` / `airJumpRatio` | 2 / 0.78 | The triple jump: two jumps in the air, each at this × the jump's speed (about 105 units each). Landing or a hit gives both back. |
| `dashSpeed` / `dashDuration` | 1250 / 1/6 | The Dash: a burst at this speed for this long (about 208 units). |
| `dashCancelTime` | 0.05 | From this far into a Dash or air dash, an attack, a Deflect or a jump may cut it short. |
| `airDashSpeed` / `airDashDuration` / `airDashUses` | 1250 / 1/6 / 1 | The air dash, once per airtime; landing or a hit gives it back. |
| `dashRepeat` | 0.4 | A Dash (or, on its own timer, an air dash) may start again this long after the last one started. |
| `attackBuffer` | 0.15 | How long an attack press (and a Dash request) the fighter cannot act on yet is kept. |
| `hitstunFriction` / `hitstunAirDrag` | 1600 / 210 | How a launch or push runs down while stunned, whatever is held: the rates Launch Point is tuned against. |
| `dropThroughTime` | 0.28 | How long a platform drop (a fresh Down press on a one-way platform, or the training CPU's own drop) ignores that platform. |

The values are tuned against the stages (main floors about 1400 units
wide), the camera and combat ranges: a Dash covers about a seventh of a
stage, a Dash held on through its run-on about a third. The triple jump is
kept to a height from which no stage's highest footing reaches the Void
above it.

## 3. Momentum

Speed is state worth keeping. A legal change of action never throws it
away:

- **Jumps.** A jump only sets the upward speed: the run's (or the Dash's)
  whole sideways speed carries into the air. An air jump is vertical
  only, a fresh rise at `airJumpRatio` × the jump's speed: the sideways
  speed carries straight through it, and steering the other way bends it
  round as the air allows (`airTurnBoost`), never in one step.
- **Attacks.** An attack keeps its `momentum` share of the speed it starts
  with (`airMomentum` in the air: all of it unless its data says
  otherwise), never capped at top speed: a Dash's burst carries on into
  the attack. From there, on the ground, it runs down as if nothing were
  held (nothing steers a grounded attack); in the air the universal air
  control applies as ever. A rooted attack is a choice its data makes (a
  `momentum` of 0), never the default.
- **Dashes.** A Dash or air dash goes at its speed or at the fighter's own
  speed that way if that is faster: it never slows anyone down. When it
  ends (run out, cut short, or stopped by a wall or the ground) the
  fighter keeps the speed it has.
- **Landing.** Touchdown keeps the speed the fighter lands with; the
  ground's rules carry on from it.
- **The impact freeze.** Hitstop freezes the body, never its velocity:
  after it, exactly the same speed.
- **The Shield.** The one stop a player chooses: raising the ground Shield
  ends the fighter's own sideways speed on that step (a run, a Dash's
  burst, an attack's slide), never a slide behind it; speed an outside
  force gave it (a pull's drag, a stun's slide) runs down instead
  ([below](#the-shield-holds-still)).
- **Overspeed.** Top speed is what locomotion builds toward, not a cap.
  Above it the excess bleeds off at a rate, never at once: on the ground
  gently while the fighter holds the way it moves
  (`overspeedHoldDeceleration`), harder with nothing held
  (`overspeedDeceleration`), hardest pressing back (the turn). In the air
  a **burst** (`Fighter.burst`: the speed came from the fighter's own Dash
  or air dash) bleeds off at `airOverspeedDeceleration`; once the speed is
  back to top speed, or a hit lands, the burst is over.

What may change momentum is a real force: a hit, a launch, a carry, a
pull, a rebound, a wall, a move whose own mechanic redirects the body (a
homing dash, a roll, a plunge, a lift, a hover, a Step-in, a technique's
or summon's rooted cast, a paralysis), the Void. A launch's speed is
never a burst, so momentum rules never weaken a launch.

## 4. Jumps

A tap of Jump is the normal jump; held past `highJumpWindow` after
takeoff it becomes the higher jump, rising under lighter gravity to
`highJumpHeight` × the normal jump's height. A jump is buffered
(`jumpBuffer`) and allowed for `coyoteTime` after leaving the ground.

**The triple jump.** In the air, past coyote time, a jump press is an air
jump while one is left: two per airtime (`airJumps: 2` counts jumps after
the ground jump). Ground jump, air jump, air jump; a fourth press does
nothing until the airtime resources are restored: by landing, by a hit
(`Fighter.takeHit`), and by a homing dash that hits (its spring off the
target). Each air jump is the same height, held or tapped (never a
higher jump), and starts the jump clip over. Walking off an edge keeps
both. Free fall (after a move that spends the airtime) rules them out.

## 5. Attack movement

Three universal rules ([`js/data/attack-movement.js`](../../js/data/attack-movement.js)),
the same for every fighter, a player's or a CPU's, and kept apart:

**No steering on the ground.** Nothing held moves a fighter through a
grounded attack: no direction, no Run, no switch of direction, in its
startup, its strike or its recovery, whatever the move (an ordinary
strike, a throw, a Special, one with a 3 s or 5 s cooldown). The Fighter
routes every attack through `attackDrift`, which ignores the direction
held on the ground; a technique's cast and a summon's startup hold the
fighter still. A direction held still **turns** an attack (7.2.2 of the
specification; a CPU's attacks and, with Automatic turn-around on, a
player's are aimed instead), but turning moves nothing. What carries a
fighter through a grounded attack is only:

- what it already had: the attack's `momentum` share of the speed it
  started with, all of it unless the move says otherwise, then running
  down under `friction` × the ground deceleration (1 unless the move says
  otherwise; above top speed the overspeed brake);
- its Step-in (below);
- its own `motion` (a roll, a homing dash:
  [combat](combat.md#attack-mechanics-beyond-a-timed-hitbox));
- outside forces (a hit, a pull, a moving platform).

**Air control in the air.** In the air every move, whatever it is (an
aerial, a hover, a plunge, a lift, the Deflect, a homing dash's hang and
recovery, a grounded attack carried off a ledge), keeps the **universal
air control**: exactly the air steering a fighter has outside an attack
(`airAcceleration`, `airTurnBoost`, the `airDeceleration` drag), from its
`airMomentum` share of the drift it started with. No move has air control
of its own, better or worse; only a motion that sets the horizontal speed
itself (a homing dash's dash, a roll flying off a ledge) overrides it
while it does.

Normal locomotion comes back the step the attack is over (or cut short).
The retired Attack Mobility system (its tiers `quick`, `medium`, `heavy`,
`planted` and their `mobility`, `control`, `airControl`, `topSpeed`,
`airTopSpeed` and `lockMovement`) is gone: an attack declaring any of
them is refused.

**The Step-in.** Every grounded direct melee strike carries its fighter a
slight way forward by itself, once per activation: as its time reaches
`STEP_IN.lead` × its lead (half way to its first strike), its forward
speed is raised to at least `STEP_IN.speed` (360, never slower than it
already goes that way), the way the strike faces then (an attack turned
before it turns its lunge with it; once made, nothing redirects it), and
runs down from there: about 11 units
from a standstill, a lean into the blow, never a Dash. A multi-hit string
steps in once, not once a strike. Each definition records the verdict
(`stepIn`):

| Verdict | When | Its lunge |
| --- | --- | --- |
| `authored` | the move writes `step: { at, speed }` | its own, exactly as written (with its own `friction`, if any): no other is added |
| `universal` | it writes nothing, and it is a direct strike of its body's: a hitbox, no projectile, no motion of its own, no Deflect | `STEP_IN` |
| `declined` | it writes `step: false`: it roots its fighter, or what strikes is something it conjures away from its body (#0005's Phantom Hands and Dark Tendrils), or no body moves at all (a phantom's bite) | none |
| `exempt` | a throw, a move with a motion of its own, the Deflect, a pending move | none |

The Step-in belongs to the activation (`activationStep`, recorded as the
attack starts): an attack started in the air never steps in, landing
never makes it lunge, a grounded one that has left the ground by its time
skips it (never firing later), and cancelling the attack drops it. Only
the Fighter itself, and the CPU's prediction of it, make one: a clone
performing a move never moves.

The CPU obeys exactly the same rules through the same functions: its
predictions (`moveContact`, `predictTrack` in
[`js/game/ai/cpu-intelligence/prediction.js`](../../js/game/ai/cpu-intelligence/prediction.js))
call `attackDrift` and `activationStep`, so a predicted strike gains its
real Step-in and nothing else (an aerial is predicted with nothing held,
its air control being the CPU's own choice), and its executor holds no
direction through a grounded attack (nothing would come of one); in the
air, over ground, its own aerials play out where it planned them, and over
the Void (or steering home) it steers them toward ground.

## 6. The Dash and the air dash

**The Dash.** A grounded burst at `dashSpeed` for `dashDuration`, the
fighter's own `mouvment` clip played once across it whatever its frame
count and rate (the codename keeps that spelling: see
[conventions](../development/conventions.md#codenames)). It starts on a
one-step explicit request (`mouvementLeftPressed` / `mouvementRightPressed`):
Q/E, the controller's Dash binding (R1 / RB by default: the way the
movement stick points, else the way the fighter faces; bound to a stick
pushed left or right, the way it is pushed), or either touch layout's
Mouvement buttons. Run taps never request it, on the ground or airborne.
`Fighter.tryMouvment` selects `tryDash` on the ground or `tryAirDash` in the air.
It needs the fighter free to act (or in an attack that hit and
may be cut short: a Dash cancel; or in a move that yields to any request,
such as a heal), grounded, not shielding, not exhausted
and real `mouvment` frames (refused and logged otherwise, never faked
with the run). It costs 15 Energy (`DASH_ENERGY_COST`, the same for every
fighter, a Dash cancel included; see [Energy](energy.md)); running,
jumps, air jumps, turning, air control and the fast fall cost none. It is movement only: no hitbox, damage,
launch or invulnerability. Leaving the ground or meeting a solid ends it.

**The air dash.** The same requests in the air: straight across at
`airDashSpeed` for `airDashDuration`, its own `midair_mouvment` clip once
across it, facing the way it goes at once; its vertical speed is zeroed
as it starts and gravity is held off throughout (no fall, no fast fall).
`airDashUses` per airtime, given back on landing and by a hit; an air
jump gives none back. The same rules as a Dash otherwise, and never while
still flying from a launch or in free fall, and for the same 15 Energy.
Meeting a solid or the ground ends it.

**Flowing out of them.** Both commit to `dashCancelTime` of themselves;
from then on an attack, a Deflect or a jump (an air jump in the air) may
cut them short, carrying on from their speed: run → Dash → attack, jump
→ air dash → aerial, Dash → jump. A new Dash still waits for one to end.
Either sets the fighter's burst, and its speed carries on after it,
bleeding off as overspeed does.

**Buffered.** A Dash asked for while the fighter is busy (an attack or its
recovery, a stun, another Dash, an impact freeze) is kept like an attack
press for `attackBuffer` and comes out on the first step it can; so is
one in the air that no air dash answers, which is the Dash if the fighter
lands in time. One refused on the ground for any other reason (no
Energy, the Shield held, no art) is used up.

**Automatic turn-around.** The human player's fighter, with the setting on
(Home › Settings › Combat, the default; [combat](combat.md#facing-and-automatic-turn-around)),
faces the closest enemy by itself. It changes the facing only: every
number in this guide, every velocity and every input reads exactly as with
it off. It only turns the fighter while it is not moving left or right:
running or steering (a direction held), or on the ground still sliding
faster than a run turns it (20 units/s) after a run or a Dash, the
fighter faces the way it goes and never runs backwards; stopped, or in
the air with nothing held, it faces its enemy. A Dash or an air dash
faces and goes its own way to its end, and the enemy is faced once the
fighter has stopped.
Nothing ever moves the fighter toward an enemy: an attack pressed out of
reach whiffs where it is thrown.

## 7. Landing

Landing never holds a fighter. On the touchdown step it is free to run,
turn, jump, attack, Dash or Shield; a press made just before (within its
buffer) comes out at once. An attack started in the air whose recovery
runs on the ground is over on touchdown (the **landing cancel**): its
startup and strike play on, its recovery does not. The one exception is a
`slam` that lands: its landing is its recovery, played out on the ground
in its impact clip ([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox)). The land clip is a
pose only (a fighter without one, like #0002, simply goes to its stance):
running, or anything of higher priority, goes straight past it, so a land
clip never makes a fighter less responsive.

On a moving platform (a stage hazard) the rules are the same: a grounded
fighter is carried by the platform's own movement each step and then
moves as ever (walking, running and the Dash add to the ride); a jump
leaves the platform behind with no speed taken from it; a platform that
vanishes leaves the fighter in the air, falling, with its coyote time,
air jumps and every action intact.

## 8. Capabilities by art

The numbers are universal; whether a fighter has the art for a capability
is its own ([`codename_rule`](../../codename_rule)): without `mouvment`
frames there is no Dash, without `midair_mouvment` frames no air dash
(refused and logged, never faked). Every **playable** fighter has both, so
every playable fighter has the same capabilities
([`tests/systems/universal-movement.test.mjs`](../../tests/systems/universal-movement.test.mjs)).

## Platform drop

A fresh Down press (S / ↓, the left stick pushed down, the touch Down
button) while standing on a one-way platform that allows it drops the
fighter through it (`dropThrough` in
[`js/game/physics.js`](../../js/game/physics.js)): the platform is ignored
for `dropThroughTime` and the fighter falls on from where it stood, its
speed kept. Every one-way platform allows it unless its map says
`dropThrough: false` (Sol-Noir's water-tower deck); the main floor and the
solids never do. It needs the fighter free to act (no attack, stun,
paralysis, technique, summon's startup or Dash) and no Shield up. Down
held from before never drops, so a fast fall carried into a landing stands
on the platform; and a jump pressed on the same step jumps from where the
fighter stood. A moving cloud drops a fighter the same way. The training
CPU asks for the same drop with its own `dropPressed`; Quick Battle's
combat AI never presses Down on the ground (it plans no drop and walks off
an edge instead).

## The Shield holds still

A raised Shield plants its fighter: there is no walking behind it, and no
movement value for it. The step the Shield goes up, the fighter's own
sideways speed (a run, a Dash's burst, an attack's slide) stops at once.
Its own means it was free on its last step and nothing has hit it or
drawn it in since (`ownSpeed` in `Fighter.update`); speed an outside
force gave it (a pull's drag, a stun's slide) runs down behind the Shield
instead, as a block's push does. A Shield press that raises nothing (a
stun, exhaustion, no art, a Dash, the air) stops nothing.

While it is up the held direction is ignored for movement (it still turns
the fighter), on every device and for the CPU alike: the body steers with
nothing held (`steer` with no direction), so a block's push (`blockPush`,
set after the Shield is up) shoves it and runs down under the normal
deceleration, and a moving platform carries it as it carries anyone (its
carry is not velocity). No running and no Dash behind it. Jump jumps
straight out of a raised Shield (never out of blockstun: the press waits
in the jump buffer), with whatever push is still running and nothing
else; the ordinary air control takes over from there. Let go of the
Shield and the held direction runs as ever, from rest. The rules are the
Shield's ([defense](defense.md)).

## Repeat cooldowns

Dash and air dash are discrete actions, each with a separate reuse timer from
acceptance, the universal `dashRepeat` (0.4 s, its own movement timer: the
attacks' old 0.5-second repeat delay is gone, and this is no replacement for it; `CombatState.movementCooldowns`, `mouvment`
and `midair_mouvment`). Their speed, duration, cancel time, Energy cost and airtime
limits stay the same. Player and CPU check the same `Fighter.movementReady`.
Requests made during these timers are discarded even through hitstop; busy
requests for an otherwise ready Dash keep the existing short buffer. Landing
or being hit refunds airtime resources but never the repeat timer. Reset and
respawn clear both timers; live overtime preserves them.

Running, ground/air jumps, Shield and Deflect are exempt from the new baseline.
Fast fall remains directional movement.

## History

The rules came largely from the [movement
update](../../UPDATES.md#movement-update) (pull requests #49 and #57),
first tuned on the first #0001; the [effect
update](../../UPDATES.md#effect-update) added the air jump. Each fighter
then had a movement profile of its own and two Power tiers (Jump Power
for its jump, Speed Power for its top speed), and #0002 ran faster than
#0001. [Universal movement](../../UPDATES.md#universal-movement-and-momentum)
retired all of that: one set of faster values for everyone, the triple
jump, momentum kept through every change of action, and Dashes that flow
into attacks and jumps. The old values are kept in
[`UPDATES.md`](../../UPDATES.md).
[Universal Step-in and no attack steering](../../UPDATES.md#universal-step-in-and-no-attack-steering)
retired the attack mobility tiers and steering grounded attacks, gave
every move the universal air control in the air, and gave every grounded
direct strike the shared Step-in.

## Tests

- [`tests/systems/universal-movement.test.mjs`](../../tests/systems/universal-movement.test.mjs):
  the values, the registry refusing a fighter's own movement, every
  playable fighter measured field by field (identical), identical input
  traces giving #0001 and #0002 identical trajectories, and the triple
  jump for each fighter.
- [`tests/systems/combat-rules.test.mjs`](../../tests/systems/combat-rules.test.mjs):
  every registered and test fighter built on the very same
  `BASE_FIGHTER_MOVEMENT` object (run, acceleration, turning, air
  control, the jumps, gravity scale, fall limits, Dash and air dash, the
  buffers), every movement field refused in a definition, one world
  gravity; and that running, jumps and the fast fall cost no Energy.
- [`tests/systems/momentum.test.mjs`](../../tests/systems/momentum.test.mjs):
  momentum through run → jump, Dash → jump, Dash → attack, attack → jump,
  attack → Dash, the air jump, air dash → aerial, landing, the impact
  freeze and overspeed, for each fighter.
- [`tests/systems/movement-rules.test.mjs`](../../tests/systems/movement-rules.test.mjs):
  the rules against made-up values, an attack's drift and Step-in
  (once, on the ground, never late) among them.
- [`tests/systems/step-in.test.mjs`](../../tests/systems/step-in.test.mjs):
  the Step-in policy and its refusals, every fighter's verdicts, and for
  every playable fighter and every move it can press: the Step-in from
  rest (slight, once, the way it faces, none for a throw, a cast, a
  summon, a motion or a declined move, none in the air or on landing),
  that no direction, Run or switch held through any grounded move, from
  rest, a run or a Dash, changes its path, that every aerial and the
  Deflect move under exactly the universal air control, a CPU's and a
  player's alike,
  normal movement back at once, the CPU's prediction walking the
  Fighter's own path, a wall stopping a Step-in, and a clone never moving.
- [`tests/benchmarks/feel-metrics.mjs`](../../tests/benchmarks/feel-metrics.mjs)
  (by hand, not part of `node --test`): responsiveness proxies measured
  with identical scripted inputs (Step-in travel and how often it rises,
  the displacement Run or a held-back direction adds to a grounded attack
  (0) and to an aerial (the air control),
  run → attack, normal movement's return, aerial drift, Dash → attack,
  Dashes per 10 s), to compare two revisions number for number.
- [`tests/systems/air-mouvment.test.mjs`](../../tests/systems/air-mouvment.test.mjs):
  the air dash for both fighters.
- [`tests/systems/movement.test.mjs`](../../tests/systems/movement.test.mjs),
  [`dash.test.mjs`](../../tests/systems/dash.test.mjs),
  [`down.test.mjs`](../../tests/systems/down.test.mjs),
  [`facing.test.mjs`](../../tests/systems/facing.test.mjs),
  [`turn-around.test.mjs`](../../tests/systems/turn-around.test.mjs),
  [`combo.test.mjs`](../../tests/systems/combo.test.mjs): the same rules,
  frame-exact, run on #0001, including the `hover` motion of its Floating
  Straight.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  #0002's motion attacks.
- [`tests/systems/slam.test.mjs`](../../tests/systems/slam.test.mjs) and
  [`tests/fighters/0003/fighter-0003.test.mjs`](../../tests/fighters/0003/fighter-0003.test.mjs):
  the `slam` motion (#0003's Heavenly Foot of Pain, #0004's Stage Dive),
  whose landing is its recovery, never cancelled.
- [`tests/fighters/0004/fighter-0004.test.mjs`](../../tests/fighters/0004/fighter-0004.test.mjs):
  #0004's `rise` (the Leekspin, carrying its target) and its `slam`.
- [`tests/fighters/0005/fighter-0005.test.mjs`](../../tests/fighters/0005/fighter-0005.test.mjs):
  #0005's `hover` (Floating Hands, once per airtime);
  [`tests/fighters/0006/fighter-0006.test.mjs`](../../tests/fighters/0006/fighter-0006.test.mjs):
  #0006's `homing` on the ground as well as once per airtime (the Triple
  Strike) and its `roll` (the Tornado Spin); and
  [`tests/systems/float.test.mjs`](../../tests/systems/float.test.mjs):
  a floating fighter held off the ground, rising at `FLOAT_RISE_SPEED`
  with no gravity, then falling.
