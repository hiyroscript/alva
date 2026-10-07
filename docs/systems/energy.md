# Energy

The one resource a fighter spends, on the same terms for every fighter,
and only on three things: a Dash or an air dash (as it starts, a Dash
cancel included), the Deflect (as it starts) and the Shield (for each hit
it blocks, a perfect block included). There is no separate Shield meter:
this is it. Movement, jumps, attacks, Combat Assist (the human player's
approach, see [combat](combat.md#combat-assist)), summons and techniques
never touch it, and no defense, however it turns out, gives any back. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

| Module | Owns |
| --- | --- |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | The rules (`MAX_ENERGY`, `DASH_ENERGY_COST`, `BLOCK_ENERGY_COST`, `DEFLECT_ENERGY_COST`), `resolveEnergy` (the rules and a fighter's refill rate; anything else refused) and the state on `CombatState`: `energy`, `maxEnergy`, `energyExhausted`, `spendEnergy`, `updateEnergy`, `setEnergy`. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Paying for a Dash (`tryDash`), an air dash (`tryAirDash`) or a Deflect (`tryDeflect`), all through `payEnergy`, and refilling every step nothing was paid on. |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | Paying for a blocked hit (`applyHit`), a perfect one exactly as any other. |
| [`js/data/characters.js`](../../js/data/characters.js) | Refusing, as the registry loads, a definition whose `energy` entry breaks the rules (`assertCombatRules`). |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The bar over the fighter. |

## The rules

The same for every fighter, written once in `combat-state.js`:

| What | Energy | Constant (resolved field) |
| --- | --- | --- |
| The bar, full: where every fighter starts, and what a respawn, a reset or a restart refills it to | 100 | `MAX_ENERGY` (`max`) |
| A Dash, an air dash, or either cutting short an attack that hit (a Dash cancel) | 25, once, as it starts | `DASH_ENERGY_COST` (`dashCost`, `dashCancelCost`) |
| A Deflect | 15, once, as it starts, whatever it meets | `DEFLECT_ENERGY_COST` (`deflectCost`) |
| A hit the Shield blocks, a perfect block included | 15, per block | `BLOCK_ENERGY_COST` (`shieldHitCost`) |
| Combat Assist's approach | 0, ever | — |
| Running, jumps, air jumps, the fast fall, turning, air control, attacks, projectiles, summons, techniques | 0 | — |

## Settings

A fighter's `energy` entry sets one thing, its refill rate:

| Field | Default | Meaning |
| --- | --- | --- |
| `regen` | 12 | Refill per second, one passive rate whatever the fighter does. |

#0001 declares `regen` 14, #0002 `regen` 12. Nothing else in the entry is
a fighter's own: `max`, `dashCost`, `dashCancelCost`, `shieldHitCost` and
`deflectCost` may be left out (and are, by both fighters), and declaring
any of them with another value than the rule's, or a field the schema
does not know, is refused, naming the fighter and the field.

## Rules

- A Dash, an air dash, a Deflect or a block works whenever the fighter is
  not exhausted, however little is left: a cost larger than what remains
  takes all of it.
- Reaching 0, however it happens, **exhausts** the fighter: no Dash, air
  dash, Deflect or Shield until Energy is back at exactly 100 (a partial
  refill does not unlock them). The bar turns gray through the refill. An
  exhausted player's melee press still starts its attack (Combat Assist's
  approach included: it costs nothing).
- No refill on a step a Dash, an air dash or a Deflect was paid for
  (`Fighter.energyPaidAt`); every other step refills at the one rate, a
  held Shield, a block and Combat Assist's approach included.
- Holding the Shield costs nothing; a miss costs nothing; a perfect
  Shield costs the same 15 as any block (its advantage is no blockstun,
  never Energy). A Deflect is no Shield: it pays its own 15 as it starts,
  and a whiff has paid it all the same.
- Nothing gives Energy back: no block, perfect block, Deflect that lands,
  projectile turned back or cancelled approach refunds anything or adds a
  refill of its own. Only the passive refill, and a full refill on a
  respawn, a reset or a restart, raise it.
- Difficulty never changes any of it: the CPU pays what a player pays.
- The bar shows over the fighter's name tag only while below full
  ([rendering](rendering.md#fighter-status)); the HUD card describes it to
  screen readers only.

## Tests

[`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs)
(the rules, clamping, the refill, every cost, overspending, exhaustion,
the bar),
[`tests/systems/combat-rules.test.mjs`](../../tests/systems/combat-rules.test.mjs)
(every registered fighter: 100 everywhere it starts or refills, 25 for
the Dash, the air dash and the Dash cancel, 15 for a block and a perfect
block, 15 for a Deflect hit or whiffed, nothing back for landing one or
turning a projectile back), the Dash cancel's cost in
[`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs), the
Deflect's in
[`tests/systems/deflect.test.mjs`](../../tests/systems/deflect.test.mjs),
and Combat Assist's (none) in
[`tests/systems/combat-assist.test.mjs`](../../tests/systems/combat-assist.test.mjs).
