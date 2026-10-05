# Energy

The one resource a fighter spends, and only on two things: a Dash (as it
starts) and the Shield (for each hit it blocks). Movement, jumps, attacks,
summons and techniques never touch it. The product rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

| Module | Owns |
| --- | --- |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `resolveEnergy` (a fighter's settings over the defaults) and the state on `CombatState`: `energy`, `maxEnergy`, `energyExhausted`, `spendEnergy`, `updateEnergy`, `setEnergy`. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Paying for a Dash (`tryDash`) and refilling every step no Dash was paid for. |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | Paying for a blocked hit (`applyHit`). |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The bar over the fighter. |

## Settings

A fighter's `energy` entry; every field is optional:

| Field | Default | Meaning |
| --- | --- | --- |
| `max` | 100 | Full, and where every fighter starts (a respawn and a restart refill it). |
| `regen` | 12 | Refill per second, one passive rate whatever the fighter does. |
| `dashCost` | 15 | Paid once as a Dash starts. |
| `dashCancelCost` | the fighter's `dashCost` | Paid instead by a Dash that cuts short an attack that hit. |
| `shieldHitCost` | 25 | Paid once for every hit the Shield blocks. |

#0001 and #0002 both declare `max` 100, `regen` 12, `dashCost` 15,
`dashCancelCost` 40 and `shieldHitCost` 25.

## Rules

- A Dash or a block works whenever the fighter is not exhausted, however
  little is left: a cost larger than what remains takes all of it.
- Reaching 0, however it happens, **exhausts** the fighter: no Dash and
  no Shield until Energy is back at exactly `max` (a partial refill does
  not unlock them). The bar turns gray through the refill.
- Holding the Shield costs nothing; a miss costs nothing; a perfect
  Shield costs nothing.
- The bar shows over the fighter's name tag only while below full
  ([rendering](rendering.md#fighter-status)); the HUD card describes it to
  screen readers only.

## Tests

[`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs)
(defaults, clamping, the refill, every cost, overspending, exhaustion,
the bar), and the Dash cancel's cost in
[`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs).
