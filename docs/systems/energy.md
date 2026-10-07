# Energy

The one resource a fighter spends, and only on three things: a Dash or an
air dash (as it starts), Combat Assist's approach (as it starts: the human
player's, see [combat](combat.md#combat-assist)) and the Shield (for each
hit it blocks). There is no separate Shield meter: this is it. Movement,
jumps, attacks (the Deflect included), summons and techniques never touch
it. The product rules are
[`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

| Module | Owns |
| --- | --- |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `resolveEnergy` (a fighter's settings over the defaults) and the state on `CombatState`: `energy`, `maxEnergy`, `energyExhausted`, `spendEnergy`, `updateEnergy`, `setEnergy`. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Paying for a Dash (`tryDash`), an air dash (`tryAirDash`) or Combat Assist's approach (`tryCombatAssist`) and refilling every step none was paid for. |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | Paying for a blocked hit (`applyHit`). |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The bar over the fighter. |

## Settings

A fighter's `energy` entry; every field is optional:

| Field | Default | Meaning |
| --- | --- | --- |
| `max` | 100 | Full, and where every fighter starts (a respawn and a restart refill it). |
| `regen` | 12 | Refill per second, one passive rate whatever the fighter does. |
| `dashCost` | 15 | Paid once as a Dash or an air dash starts (the air dash has no cost of its own), and once as Combat Assist's approach starts, on the ground or in the air (a replacement melee press during it pays nothing more). |
| `dashCancelCost` | the fighter's `dashCost` | Paid instead by a Dash or an air dash that cuts short an attack that hit. |
| `shieldHitCost` | 25 | Paid once for every hit the Shield blocks. |

#0001 declares `max` 100, `regen` 14, `dashCost` 12, `dashCancelCost` 35
and `shieldHitCost` 20 (its Energy goes further than most); #0002 `max`
100, `regen` 12, `dashCost` 15, `dashCancelCost` 40 and `shieldHitCost`
25.

## Rules

- A Dash, an air dash, Combat Assist's approach or a block works whenever
  the fighter is not exhausted, however little is left: a cost larger than
  what remains takes all of it.
- Reaching 0, however it happens, **exhausts** the fighter: no Dash, air
  dash, Combat Assist approach or Shield until Energy is back at exactly
  `max` (a partial refill does not unlock them). The bar turns gray
  through the refill. An exhausted player's melee press still starts its
  attack, where the fighter stands.
- No refill on a step a Dash, an air dash or an approach was paid for.
- An approach that is cancelled gives nothing back.
- Holding the Shield costs nothing; a miss costs nothing; a perfect
  Shield costs nothing; a Deflect, which is no Shield, costs nothing
  either.
- The bar shows over the fighter's name tag only while below full
  ([rendering](rendering.md#fighter-status)); the HUD card describes it to
  screen readers only.

## Tests

[`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs)
(defaults, clamping, the refill, every cost, overspending, exhaustion,
the bar), the Dash cancel's cost in
[`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs), and
Combat Assist's in
[`tests/systems/combat-assist.test.mjs`](../../tests/systems/combat-assist.test.mjs).
