# Launch

How hits send fighters flying, for every fighter alike: Launch Point,
Base Launch and Directional Launch, how a launched fighter reacts, and how
a hard launch rebounds off the stage. The product rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.7; the in-game reference is
the Discover screen's LAUNCH page, built from the same registry.

| Module | Owns |
| --- | --- |
| [`js/data/launch.js`](../../js/data/launch.js) | The registry and the one formula: `BASE_LAUNCH_VALUES` (`[0, 1, 2, 3]`), `DIRECTIONAL_LAUNCHES` (`null`, `'horizontal'`, `'vertical'`, `'reverseVertical'`), `LAUNCH_UNIT_SPEED` (7 units/s per point), `PERFECT_SHIELD_HEAL` (5), `resolveHitLaunch` (validation), `resolveLaunchStrength`, `resolveDirectionalLaunch`, and the reference copy Discover shows. |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | `CombatSystem.applyHit` (the order below) and the launch reaction: `resolveLaunchReaction`, `resolveLaunchStun`, `steerLaunch`. |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | Each fighter's Launch Point and passive recovery clock, advanced by the existing fixed-step update. |
| [`js/game/combat/launch-bounce.js`](../../js/game/combat/launch-bounce.js) | Rebounds: `LAUNCH_BOUNCE` (every setting), `resolveLaunchBounce`, `startLaunch`, `bounceLaunch`. |
| [`js/game/physics.js`](../../js/game/physics.js) | Stops a body at whatever it meets and reports the speed it stopped (`impactVx`, `impactVy`); never bounces anything itself. |

## The formula

Every fighter has a **Launch Point** (`CombatState.launchPoint`): 0 on
every fresh life (a new fighter, a restart or rematch, a respawn from the
Void), raised by exactly the damage each hit deals (1, 3, 5 or 10, the
four damage tiers: [combat](combat.md#damage)), never below 0, with no
maximum. It never stops a fighter acting and never takes one out: only
the Void does.

Every real, unblocked hit restarts recovery, including Base Launch 0 hits
and each strike of a multi-hit attack. Nothing recovers for 2 seconds;
then each complete 0.5-second interval removes 2 points, stopping at 0
(an odd Launch Point ends at 0, never −1). The first drop therefore comes
**2.5 seconds after the last hit**. For 10 points at t = 0: still 10 at
t = 2.0, 8 at t = 2.5, 6 at t = 3.0, and 4 at t = 3.5. A new hit discards
all partial progress and starts the full wait again. Shield blocks add
nothing and **do not reset recovery**. A perfect block takes
`PERFECT_SHIELD_HEAL` (5) off its own fighter at once, never below 0
(`CombatState.heal`): a heal, so the schedule runs on as it was, neither
restarted nor brought forward ([defense](defense.md)). The [launch &
energy update](../../UPDATES.md#launch--energy-update) made it 2 a tick
(it was 1) and added the perfect block's heal.

The universal `LAUNCH_RECOVERY_DELAY`, `LAUNCH_RECOVERY_INTERVAL` and
`LAUNCH_RECOVERY_AMOUNT` live in `js/data/launch.js`. In Adventure alone the
player's fighter's modifiers ([`js/game/combat/modifiers.js`](../../js/game/combat/modifiers.js))
may add to the amount (Nearly Immortal) and shorten the interval
(Velocious Immune System), never the delay, and may scale the damage a
real hit adds (Brave Soldier, Redoutable Strength: the hit's damage × the
attacker's `damageDealt` × the target's `damageTaken`), so the launch
grows with it; a Launch Point may then be fractional
([Adventure](../gameplay/adventure.md)). A CPU's fighter, Venture's at
every level included, and every other mode's have the identity's, which
change nothing. `CombatState` keeps
the seconds until the next point: initially delay + interval, then one
interval per tick. Its existing `update(dt)` consumes every complete tick
(even with a large dt), using `PHASE_EPSILON` at boundaries and preserving
partial time. It advances in every fighter simulation step, including
impact freeze and any action or stun; a paused simulation advances nothing.
At 0 it clears spare time. Fresh lives replace the combat state; fighters
waiting out of play for respawn receive no background updates.

Every hit (an attack's, a strike's, a projectile's, a technique's)
declares, independently of each other and of its damage, a **Base
Launch** (0, 1, 2 or 3: a multiplier, never a velocity) and a
**Directional Launch**:

```
launch strength = Base Launch × the target's new Launch Point
launch speed    = launch strength × LAUNCH_UNIT_SPEED (7 units/s per point)
```

`LAUNCH_UNIT_SPEED` is 7 since the launch & energy update (it was 10):
launches were nerfed there alone, with Base Launch, Launch Point and every
damage untouched. The same hit at the same Launch Point flies 70 % as fast
(30 Launch Point at Base Launch 2: strength 60, 420 units/s where it was
600), so a fighter needs about 43 % more Launch Point to be launched as
hard. It is the one knob. What is measured in units/s stays as it was and
so comes later: the launch reaction's stun and tumble (below) and the
rebound threshold (`minImpactSpeed`).

The damage is added first, so the hit that raises the Launch Point
already launches from the new total. The direction only decides where
the strength goes: along the hit's travel (`'horizontal'`: the attacker's
facing for melee, the projectile's direction, the clone's facing or the
technique's), upward (`'vertical'`), downward (`'reverseVertical'`), or
nowhere (`null`). A blocked hit adds no Launch Point and launches nothing.
`resolveHitLaunch` validates both fields once, when a hit's definition is
built: a Base Launch other than 0-3 is logged and becomes 0, an unknown
direction is logged and becomes `null`, and a nonzero Base Launch with no
direction is logged and never launches.

## Launch reaction (per fighter)

A fighter's `launchReaction` entry decides how it responds; every field
is optional and the defaults change nothing:

| Field | Default | Effect |
| --- | --- | --- |
| `stunPerThousand` | 0 | extra hitstun, seconds per 1000 units/s of launch speed |
| `maxStun` | 0 | the most extra hitstun a launch adds |
| `tumbleSpeed` | never | launched at least this fast, it tumbles in its mid-air hurt pose until it acts or lands |
| `steerAngle` | 0 | degrees the direction it holds as a hit lands may bend the launch (never its strength) |

A hit (never a block) also gives the target its air jumps back. Each
fighter's values are in its character specification (#0001 and #0002 use
0.2 s per 1000 units/s up to 0.7 s, #0003, #0004, #0005 and #0006 0.15 s
up to 0.55 s, #0007, #0008, #0009 and #0010 0.15 s up to 0.5 s, #0011
0.12 s up to 0.4 s, the roster's least: its spider-sense; #0012 0.14 s up
to 0.45 s, its cybernetic agility; #0013, #0014 and #0015 0.15 s up to 0.5 s;
#0016 0.14 s up to 0.45 s, an acrobat; #0017 0.1 s up to 0.35 s, a robot
who shrugs off what would floor anyone else; the
first six, #0010, #0013, #0014 and #0015 tumble from 1100 units/s, #0007, #0008, #0009, #0011,
#0012 and #0016 from 1150, #0017 from 1250; #0001 steers
a launch up to 18°, #0002 15°, #0003 20°, #0004 18°, #0005 20°, #0006 20°,
#0007 20°, #0008 20°, #0009 30°, the roster's most: light on the wind,
#0010 15°, #0011 25°, #0012 25°, #0013 20°, #0014 20°, #0015 20°, #0016 25°, #0017 25°).

A launching hit also ends a paralysis on the spot (a hit's `paralyze`,
see [combat](combat.md#attack-mechanics-beyond-a-timed-hitbox)), and a
float with it (a hit's `float`): a launch is never held back, and a
paralysed or floating fighter that is launched flies like any other.

## Launch bounce

A launch that drives its fighter into stage geometry at
`minImpactSpeed` or more (only the part crossing the surface counts)
rebounds instead of stopping dead: the stopped speed comes back reversed
and scaled by the surface's restitution, and what ran along the surface is
kept. Ordinary stops (walking into a wall, landing, falling back after a
launch) never rebound. A rebound keeps its fighter stunned at least
`stun`, a hard one freezes it at the surface for `hitstop`, a fighter
flying off a rebound passes the other fighter's pushbox, and rebounds
count on until the fighter recovers, at most `maxBounces`, so a wall can
never hold a combo. Solids and the main floor's cliff faces rebound;
one-way platforms only from above; the Void never.

| `LAUNCH_BOUNCE` setting | Value |
| --- | --- |
| `enabled` | true |
| `minImpactSpeed` | 500 units/s |
| `wallRestitution` / `floorRestitution` / `ceilingRestitution` | 0.72 / 0.6 / 0.65 |
| `maxBounces` | 5 |
| `stun` | 0.2 s |
| `hitstop` / `hitstopSpeed` | 0.05 s / 1200 units/s |

A fighter may override any of them with its own `launchBounce` entry
(`enabled: false` turns rebounds off for it); an unknown field is logged
and ignored. One fighter does today: #0008, whose body is rubber, rebounds
from an impact of 400 units/s (not 500) and sends back more of it (walls
0.9, the floor 0.8, ceilings 0.85), the rest the shared values
([its specification](../characters/0008.md#defense-energy-and-launch-reaction)).
The settings came from the
[bounce update](../../UPDATES.md#bounce-update).

## Tests

- [`tests/systems/launch.test.mjs`](../../tests/systems/launch.test.mjs):
  the registry, the formula, validation, every direction, the Shield's
  exception, recovery boundaries and resets across hit sources and fresh
  lives, and that nothing in combat singles out a fighter or attack.
- [`tests/systems/launch-reaction.test.mjs`](../../tests/systems/launch-reaction.test.mjs),
  [`tests/systems/launch-bounce.test.mjs`](../../tests/systems/launch-bounce.test.mjs).
- Each fighter's own hits: its tests under [`tests/fighters/`](../../tests/fighters/).
