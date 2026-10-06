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
| [`js/game/fighters/movement.js`](../../js/game/fighters/movement.js) | The rules, as pure functions over those numbers: `steer` (ground and air acceleration, braking, turning, overspeed), `steerAttack` (an attack's step-in and steering), `attackStartSpeed` (the momentum an attack keeps), `hitstunDrag`, `fastFallVelocity`, `airJump`, `highJumpLift`, `readDashTap` (the double tap). Each reads the values it is given on every call and writes only the body or tap record it is handed. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | All movement *state* (the body, the Dash or air dash, the burst, the jump buffer, coyote time, the higher jump, air jumps and air dashes left, the waiting tap, the buffered Dash) and the order things happen in each fixed step (`Fighter.update`). It decides *when* a rule applies (a stun, a paralysis, a Shield, a technique or a Dash takes the step first) and calls `movement.js` for the arithmetic. `fighter.movement` is always `BASE_FIGHTER_MOVEMENT`. |
| [`js/game/physics.js`](../../js/game/physics.js) | Integration and collision (`stepBody`): gravity, the fall cap, landing, solids and one-way platforms. It never knows why a body moves. |

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
or the air dash's speed (an air dash also holds the fall off), a Shield's
stand, an attack's own motion, an attack's steering, or normal steering.
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
| `dashTapWindow` | 0.22 | The most time between the two taps of a double tap (the Dash's and the air dash's). |
| `airDashSpeed` / `airDashDuration` / `airDashUses` | 1250 / 1/6 / 1 | The air dash, once per airtime; landing or a hit gives it back. |
| `attackBuffer` | 0.15 | How long an attack press (and a Dash request) the fighter cannot act on yet is kept. |
| `hitstunFriction` / `hitstunAirDrag` | 1600 / 210 | How a launch or push runs down while stunned, whatever is held: the rates Launch Point is tuned against. |
| `dropThroughTime` | 0.28 | How long a platform drop ignores the platform (the training CPU's drop only; no player control drops through). |

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
  with (`airMomentum` in the air), which is all of it unless the attack
  says otherwise, never capped at top speed: a Dash's burst carries on
  into the attack. A planted attack is a choice its data makes (a low
  `momentum`, a high `friction`), never the default.
- **Dashes.** A Dash or air dash goes at its speed or at the fighter's own
  speed that way if that is faster: it never slows anyone down. When it
  ends (run out, cut short, or stopped by a wall or the ground) the
  fighter keeps the speed it has.
- **Landing.** Touchdown keeps the speed the fighter lands with; the
  ground's rules carry on from it.
- **The impact freeze.** Hitstop freezes the body, never its velocity:
  after it, exactly the same speed.
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
homing dash, a roll, a plunge, a lift, a hover, a step-in, a technique's
or summon's planted cast, a paralysis), the Void. A launch's speed is
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

Each attack also says how its fighter moves while it plays
([combat](combat.md#attacks)): `momentum` / `airMomentum` (the share of
the speed it started with that it keeps, all of it by default),
`control` / `airControl` (a share of normal steering), `friction` (× the
ground deceleration on what is not steered; above top speed the overspeed
brake applies instead) and `step: { at, speed }` (a step-in that never
slows a fighter already going faster). `lockMovement: false` keeps normal
locomotion throughout. An attack with a `motion` of its own (a homing
dash, a plunge, a lift, a roll, a hover) owns the body instead
([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox)).

## 6. The Dash and the air dash

**The Dash.** A grounded burst at `dashSpeed` for `dashDuration`, the
fighter's own `mouvment` clip played once across it whatever its frame
count and rate (the codename keeps that spelling: see
[conventions](../development/conventions.md#codenames)). It starts on a
double tap of a direction (two `runLeftPressed` / `runRightPressed` edges
within `dashTapWindow`, from any device) or one tap of a Joystick-layout
Dash button (`mouvementLeftPressed` / `mouvementRightPressed`), both
through the same `Fighter.tryDash` (in the air the same requests are the
air dash). It needs the fighter free to act (or in an attack that hit and
may be cut short: a Dash cancel), grounded, not shielding, not exhausted
and real `mouvment` frames (refused and logged otherwise, never faked
with the run). It costs `energy.dashCost` (`dashCancelCost` for a Dash
cancel; see [Energy](energy.md)). It is movement only: no hitbox, damage,
launch or invulnerability. Leaving the ground or meeting a solid ends it.

**The air dash.** The same requests in the air: straight across at
`airDashSpeed` for `airDashDuration`, its own `midair_mouvment` clip once
across it, facing the way it goes at once; its vertical speed is zeroed
as it starts and gravity is held off throughout (no fall, no fast fall).
`airDashUses` per airtime, given back on landing and by a hit; an air
jump gives none back. The same rules as a Dash otherwise, and never while
still flying from a launch or in free fall. Meeting a solid or the ground
ends it.

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

## 7. Landing

Landing never holds a fighter. On the touchdown step it is free to run,
turn, jump, attack, Dash or Shield; a press made just before (within its
buffer) comes out at once. An attack started in the air whose recovery
runs on the ground is over on touchdown (the **landing cancel**): its
startup and strike play on, its recovery does not. The land clip is a
pose only (a fighter without one, like #0002, simply goes to its stance):
running, or anything of higher priority, goes straight past it, so a land
clip never makes a fighter less responsive.

## 8. Capabilities by art

The numbers are universal; whether a fighter has the art for a capability
is its own ([`codename_rule`](../../codename_rule)): without `mouvment`
frames there is no Dash, without `midair_mouvment` frames no air dash
(refused and logged, never faked). Every **playable** fighter has both, so
every playable fighter has the same capabilities
([`tests/systems/universal-movement.test.mjs`](../../tests/systems/universal-movement.test.mjs)).

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

## Tests

- [`tests/systems/universal-movement.test.mjs`](../../tests/systems/universal-movement.test.mjs):
  the values, the registry refusing a fighter's own movement, every
  playable fighter measured field by field (identical), identical input
  traces giving #0001 and #0002 identical trajectories, and the triple
  jump for each fighter.
- [`tests/systems/momentum.test.mjs`](../../tests/systems/momentum.test.mjs):
  momentum through run → jump, Dash → jump, Dash → attack, attack → jump,
  attack → Dash, the air jump, air dash → aerial, landing, the impact
  freeze and overspeed, for each fighter.
- [`tests/systems/movement-rules.test.mjs`](../../tests/systems/movement-rules.test.mjs):
  the rules against made-up values.
- [`tests/systems/air-mouvment.test.mjs`](../../tests/systems/air-mouvment.test.mjs):
  the air dash for both fighters.
- [`tests/systems/movement.test.mjs`](../../tests/systems/movement.test.mjs),
  [`dash.test.mjs`](../../tests/systems/dash.test.mjs),
  [`down.test.mjs`](../../tests/systems/down.test.mjs),
  [`facing.test.mjs`](../../tests/systems/facing.test.mjs),
  [`combo.test.mjs`](../../tests/systems/combo.test.mjs): the same rules,
  frame-exact, run on #0001, including the `hover` motion of its Floating
  Straight.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  #0002's motion attacks.
