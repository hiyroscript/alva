# Movement

Alva has one movement system, used by every fighter, and each fighter has
its own movement profile. The system decides *how* acceleration, braking,
turning, air steering, jumps, the fast fall, the Dash, the air dash and
attack momentum work; a fighter's definition decides *how much*. Two fighters with
different profiles move differently under exactly the same rules, and a
new fighter needs no movement code of its own.

The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.3 (and
attack movement, the input buffer and hit-cancels in §7.2.4). This guide
explains how the code carries them out.

## 1. The shared implementation

| Module | Owns |
| --- | --- |
| [`js/game/fighters/movement.js`](../../js/game/fighters/movement.js) | The rules, as pure functions over a movement profile: `steer` (ground and air acceleration, braking, turning, overspeed), `steerAttack` (an attack's step-in and steering), `attackStartSpeed` (the momentum an attack keeps), `hitstunDrag`, `fastFallVelocity`, `airJump`, `highJumpLift`, `readDashTap` (the double tap). Each reads the values it is given on every call and writes only the body or tap record it is handed. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | All movement *state* (the body, the Dash or air dash, the jump buffer, coyote time, the higher jump, air jumps and air dashes left, the waiting tap) and the order things happen in each fixed step (`Fighter.update`). It decides *when* a rule applies (a stun, a paralysis, a Shield, a technique or a Dash takes the step first) and calls `movement.js` for the arithmetic. |
| [`js/game/physics.js`](../../js/game/physics.js) | Integration and collision (`stepBody`): gravity, the fall cap, landing, solids and one-way platforms. It never knows why a body moves. |
| [`js/data/powers.js`](../../js/data/powers.js) | Top speed (Speed Power) and jump speed (Jump Power), by tier. |

What happens in one fixed step, in order (`Fighter.update`): the
controller's input is read; cooldowns recover; a hit or paralysis ends a
technique, a summon's startup, a Dash or an attack; during an impact
freeze nothing moves (presses are kept, a Shield press excepted); the
Dash (or air dash) and a summon's startup advance their clocks; in the
air a fresh Shield press tries the Deflect, then combat presses are tried
(or buffered); a Dash (on the ground) or an air dash (in the air) is
tried; a technique advances; the Shield goes up or down (on the ground
only); then horizontal movement is chosen, in priority: a technique's own
velocity, standing still (a summon's startup, a technique's cast, a
paralysis), the hitstun drift, the Dash's or the air dash's speed (an air
dash also holds the fall off), a Shield's stand, an attack's own motion,
an attack's steering, or normal steering. Then the jump (buffered, with
coyote time), the air jump, the higher jump's lift and the fast fall;
then the body is integrated and collided; then launch rebounds, landing
resets (air jumps, air dashes, per-airtime attacks, free fall), the end of
a Dash that lost its ground or an air dash that found it, of a technique
or a summon's startup that lost its ground, Energy refill, facing and the
visual state.

The simulation is fixed-step (1/60 s) and deterministic: the same inputs
give the same fight, step for step, at any frame rate
([`tests/integration/roster-matrix.test.mjs`](../../tests/integration/roster-matrix.test.mjs)
plays every pairing at 30, 60 and 144 fps and compares every step).

## 2. The movement profile

A fighter's `movement` entry, in world units and seconds. "Default" is
what the shared code uses when the field is left out; nothing beyond that
is validated, so a missing *required* field breaks that part of the
fighter's movement rather than raising an error.

| Field | Unit | Default | What it does |
| --- | --- | --- | --- |
| `acceleration` | units/s² | required | Ground: speed gained toward top speed while a direction is held. |
| `deceleration` | units/s² | required | Ground: speed lost while nothing is held. |
| `turnBoost` | × | required | Ground: pressing against the way it moves brakes at `acceleration` × `turnBoost` (never softer than `deceleration`), then accelerates the new way. |
| `overspeedDeceleration` | units/s² | 0 (just `deceleration`) | Ground: above top speed (after a Dash) the excess bleeds off at this rate, whatever is held. |
| `airAcceleration` | units/s² | required | Air: speed gained toward top speed. Steering bends the drift instead of replacing it. |
| `airDeceleration` | units/s² | required | Air: the gentle drag while nothing is held. |
| `airTurnBoost` | × | `turnBoost` | Air: as `turnBoost`. |
| `gravityScale` | × | 1 | The share of world gravity (2500 units/s²) on the fighter's body. |
| `maxFallSpeed` | units/s | 1500 | The fall cap. |
| `coyoteTime` | s | required (> 0 to jump) | How long after leaving the ground a ground jump is still allowed. |
| `jumpBuffer` | s | required (> 0 to jump) | How long a jump press is kept for the first step it can be used. |
| `highJumpWindow` | s | never | Jump still held this long after takeoff makes the higher jump. |
| `highJumpHeight` | × | 1 | The higher jump's apex, × the normal jump's height. |
| `airJumps` | count | 0 | Jumps in the air before landing again; landing or a hit gives them back. |
| `airJumpRatio` | × | 1 | An air jump's speed, × the normal jump's. |
| `fastFallAcceleration` | units/s² | required with `fastFallSpeed` | Down held while falling speeds the fall up at this rate... |
| `fastFallSpeed` | units/s | none | ...up to this speed. Not positive: no fast fall. |
| `attackBuffer` | s | 0 (no buffer) | How long an ordinary attack press the fighter cannot act on yet is kept. |
| `hitstunFriction` | units/s² | `deceleration` / 2 | Ground drag on a stunned fighter's push or launch, whatever is held. |
| `hitstunAirDrag` | units/s² | `airDeceleration` / 2 | The same in the air. |
| `dashSpeed` | units/s | none | The Dash's speed. Not positive: no Dash. |
| `dashTapWindow` | s | 0 | The most time between the two taps of a double tap (the Dash's and the air dash's). |
| `airDashSpeed` | units/s | none | The air dash's speed. Not positive: no air dash. |
| `airDashUses` | count | 1 | Air dashes per airtime; landing or a hit gives them back. |
| `dropThroughTime` | s | required for a drop | How long a platform drop ignores the platform (the training CPU's drop only; no player control drops through). |

**Top speed and jump speed are not in the profile.** They come from the
fighter's Powers (`powers: { jump, speed }`):

| Power | Tier 1 | Tier 2 | Tier 3 | Sets |
| --- | --- | --- | --- | --- |
| Jump Power | 650 | 920 | 1000 | the normal jump's upward speed (units/s) |
| Speed Power | 270 | 330 | 360 | the top speed of normal left / right movement, ground and air (units/s) |

`Fighter` resolves them once (`getJumpVelocity`, `getMaxSpeed`); a tier the
table lacks, or a missing Power, is logged and gets tier 2. Nothing else
reads them: acceleration, deceleration, turning, air control, gravity,
falling, launches, projectiles, the Shield and techniques never depend on
a Power. An attack's steering and the speed it may keep on the ground are
shares of the fighter's own top speed, and the run clip's playback rate
follows the fighter's speed relative to its own top speed. The Powers'
names and descriptions are what the Discover screen shows
([`js/screens/discover-screen.js`](../../js/screens/discover-screen.js)).

### Attack movement

Each attack also says how its fighter moves while it plays
([combat](combat.md#attacks)): `momentum` / `airMomentum` (the share of
the speed it started with that it keeps; on the ground never more than
that share of top speed), `control` / `airControl` (a share of normal
steering), `friction` (× the ground deceleration on what is not steered)
and `step: { at, speed }` (a step-in). The defaults are a planted attack:
all the speed kept, no steering, normal friction. `lockMovement: false`
keeps normal locomotion throughout. An attack with a `motion` of its own
(a homing dash, a plunge, a lift, a roll) owns the body instead
([combat](combat.md#attack-mechanics-beyond-a-timed-hitbox)).

### The Dash

A grounded burst at `movement.dashSpeed` for exactly one pass of the
fighter's own `mouvment` clip (the codename keeps that spelling: see
[conventions](../development/conventions.md#codenames)). It starts on a
double tap of a direction (two `runLeftPressed` / `runRightPressed` edges
within `dashTapWindow`, from any device) or one tap of a Joystick-layout
Dash button (`mouvementLeftPressed` / `mouvementRightPressed`), both
through the same `Fighter.tryDash` (in the air the same requests are the
air dash, below). It needs the fighter free to act (or in
an attack that hit and may be cut short: a Dash cancel), grounded, not
shielding, not exhausted, a positive `dashSpeed` and real `mouvment`
frames (refused and logged otherwise, never faked with the run). It costs
`energy.dashCost` (`dashCancelCost` for a Dash cancel; see
[Energy](energy.md)). It is movement only: no hitbox, damage, launch or
invulnerability. Leaving the ground or meeting a solid ends it; the normal
movement then takes over from its speed, the excess bleeding off at
`overspeedDeceleration`.

### The air dash

The fighter's own mid-air mouvment, a capability apart from the Dash:
the same requests (a double tap, a mouvement button) that Dash on the
ground air dash in the air, both through `Fighter.tryMouvment` (the Dash
by `tryDash`, the air dash by `tryAirDash`). Straight across the air at
`movement.airDashSpeed` for exactly one pass of the fighter's own
`midair_mouvment` clip, facing the way it goes at once: its vertical
speed is zeroed as it starts and gravity is held off throughout (no fall,
no fast fall), then normal airborne physics take over, its sideways speed
capped at the fighter's top speed as it ends. `airDashUses` per airtime
(1 unless authored), given back on landing and by a hit as the air jumps
are; an air jump gives none back. The same rules as a Dash otherwise: free
to act or in an attack that hit and may be cut short (a Dash cancel in the
air, for `dashCancelCost`), not exhausted, paying `energy.dashCost`; never
while stunned, paralyzed or already dashing; and, as an attack's own
motion, never while still flying from a launch or in free fall. Missing
`midair_mouvment` art refuses it (logged), never faked with the Dash's
clip or the run. It is movement only: no hitbox, damage, launch,
invulnerability, Shield or Deflect. Meeting a solid or the ground ends it.

### Capabilities a fighter may leave out

| Left out | Result |
| --- | --- |
| `fastFallSpeed` (or not positive) | no fast fall |
| `dashSpeed` (or not positive), or the `mouvment` clip | no Dash: a double tap or Dash button does nothing on the ground |
| `airDashSpeed` (or not positive), or the `midair_mouvment` clip | no air dash: a double tap or Dash button does nothing in the air |
| `airJumps` | no air jump |
| `highJumpWindow` | every jump is the normal jump |
| `attackBuffer` | early presses are not kept |
| `hitstunFriction` / `hitstunAirDrag` | half its normal deceleration / air drag while stunned |

## 3. Each fighter's values

The numbers are each fighter's own, in its definition and its character
specification:

| Field | [#0001](../characters/0001.md#movement-profile) | [#0002](../characters/0002.md#movement-profile) |
| --- | --- | --- |
| Speed / Jump Power | 2 (330) / 2 (920) | 3 (360) / 2 (920) |
| `acceleration` / `deceleration` / `turnBoost` | 4200 / 4200 / 2.6 | 4800 / 4200 / 2.6 |
| `airAcceleration` / `airDeceleration` / `airTurnBoost` | 3000 / 380 / 2.0 | 3200 / 380 / 2.0 |
| `fastFallAcceleration` / `fastFallSpeed` | 12000 / 1400 | 12000 / 1400 |
| `airJumps` / `airJumpRatio` | 1 / 0.9 | 1 / 0.9 |
| `highJumpWindow` / `highJumpHeight` | 0.15 / 1.4 | 0.15 / 1.4 |
| `dashSpeed` / Dash clip | 950 / 0.2 s (about 190 units) | 1100 / 0.2 s (about 220 units) |
| `airDashSpeed` / `airDashUses` / air dash clip | 950 / 1 / 0.2 s (about 190 units) | 1100 / 1 / 0.2 s (about 220 units) |

Equal values are a tuning choice, not a shared requirement: each profile
is its fighter's own.

### History: the movement update

The current rules came largely from the [movement
update](../../UPDATES.md#movement-update) (pull requests #49 and #57),
whose numbers were first tuned on the first #0001, the only fighter at
the time (since replaced by the current #0001, which kept that movement
profile with a faster Dash); the [effect
update](../../UPDATES.md#effect-update) added the air jump and a short hop
that was later replaced by the higher jump. Those historical values are
kept in [`UPDATES.md`](../../UPDATES.md); the mechanics themselves have
always been the Fighter's, for every fighter.

## Tests

- [`tests/systems/movement-profile.test.mjs`](../../tests/systems/movement-profile.test.mjs):
  the rules against made-up profiles, then every playable fighter held to
  its own profile and Powers.
- [`tests/systems/air-mouvment.test.mjs`](../../tests/systems/air-mouvment.test.mjs):
  the air dash, for both fighters: its request, clip, speed, flat path,
  uses per airtime and what gives them back, its rules, that it is
  movement only, and the CPU's air dash home.
- [`tests/systems/movement.test.mjs`](../../tests/systems/movement.test.mjs),
  [`dash.test.mjs`](../../tests/systems/dash.test.mjs),
  [`down.test.mjs`](../../tests/systems/down.test.mjs),
  [`facing.test.mjs`](../../tests/systems/facing.test.mjs),
  [`combo.test.mjs`](../../tests/systems/combo.test.mjs),
  [`powers.test.mjs`](../../tests/systems/powers.test.mjs): the same rules,
  frame-exact, run with #0001's profile (their numbers are #0001's),
  including the `hover` motion of its Floating Straight.
- [`tests/fighters/0002/fighter-0002.test.mjs`](../../tests/fighters/0002/fighter-0002.test.mjs):
  #0002's profile and motion attacks.
