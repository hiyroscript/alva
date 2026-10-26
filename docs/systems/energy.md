# Energy

The one resource a fighter spends, on the same terms for every fighter,
human or CPU, and at **one nominal price: 15**. It pays for a Dash or an
air dash (as it starts, a Dash cancel included), the Deflect (as it
starts), the Shield (for each hit it blocks, a perfect block included)
and every ordinary move that creates a gameplay construct (a projectile,
a burst, a clone: as it starts, once). There is no separate Shield meter:
this is it. Movement, jumps, melee strikes, turning (Automatic turn-around
included, see [combat](combat.md#facing-and-automatic-turn-around)), a
heal of the fighter's own and every move with a 3 s or 5 s cooldown never
touch it, and no defense, however it turns out, gives any back. The
product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §7.2.5.

| Module | Owns |
| --- | --- |
| [`js/data/energy.js`](../../js/data/energy.js) | The policy, the one source of every price: `MAX_ENERGY`, `ENERGY_COST` (15), `DASH_ENERGY_COST`, `BLOCK_ENERGY_COST`, `DEFLECT_ENERGY_COST`, `CONSTRUCT_ENERGY_COST` (all `ENERGY_COST`), `createsConstruct`, `constructEnergyCost`, `resolveMoveEnergy`. |
| [`js/game/combat/combat-state.js`](../../js/game/combat/combat-state.js) | `resolveEnergy` (the rules and a fighter's refill rate; anything else refused), the constants re-exported, and the state on `CombatState`: `energy`, `maxEnergy`, `energyExhausted`, `spendEnergy`, `updateEnergy`, `setEnergy`. |
| [`js/game/combat/attacks.js`](../../js/game/combat/attacks.js), [`technique.js`](../../js/game/combat/technique.js), [`summon.js`](../../js/game/combat/summon.js) | Each definition's `energyCost`, derived from what it creates and its cooldown class. |
| [`js/game/fighters/fighter.js`](../../js/game/fighters/fighter.js) | Paying for a Dash (`tryDash`), an air dash (`tryAirDash`), a Deflect (`tryDeflect`) or a construct move (`tryAction`, `trySummon`, `tryTechnique`), all through `payEnergy`, and refilling every step nothing was paid on. |
| [`js/game/combat/combat.js`](../../js/game/combat/combat.js) | Paying for a blocked hit (`applyHit`), a perfect one exactly as any other. |
| [`js/data/characters.js`](../../js/data/characters.js) | Refusing, as the registry loads, a definition whose `energy` entry or whose move's `energyCost` breaks the rules (`assertCombatRules`). |
| [`js/game/rendering/fighter-status.js`](../../js/game/rendering/fighter-status.js) | The bar over the fighter. |
| [`js/game/combat/move-status.js`](../../js/game/combat/move-status.js) | A move that costs Energy shown unavailable (`energy`) while the fighter is exhausted (the ability HUD, touch controls). |

## The rules

The same for every fighter, written once in `js/data/energy.js`:

| What | Energy | Constant (resolved field) |
| --- | --- | --- |
| The bar, full: where every fighter starts, and what a respawn, a reset or a restart refills it to | 100 | `MAX_ENERGY` (`max`) |
| A Dash, an air dash, or either cutting short a move (a Dash cancel) | 15, once, as it starts | `DASH_ENERGY_COST` (`dashCost`, `dashCancelCost`) |
| A Deflect | 15, once, as it starts, whatever it meets | `DEFLECT_ENERGY_COST` (`deflectCost`) |
| A hit the Shield blocks, a perfect block included | 15, per block | `BLOCK_ENERGY_COST` (`shieldHitCost`) |
| An ordinary construct move (below) | 15, once per activation, as it starts | `CONSTRUCT_ENERGY_COST` (`constructCost`; each move's `energyCost`) |
| Running, holding the Shield up, jumps, air jumps, the fast fall, turning (by hand or Automatic turn-around), air control, melee strikes, a heal of its own, any move with a 3 s or 5 s cooldown | 0 | — |

The Dash was 25, then 20 after the combat-feel overhaul; the [strict
combat rules](../../UPDATES.md#strict-combat-rules) make every price the
same 15. From a full bar a fighter has about seven paid actions in a row
before it runs dry, a few more with the refill.

## Construct moves

A move **creates a construct** when its structured data says so
(`createsConstruct`, never its name, button or fighter): an attack that
throws a `projectile`, a technique that releases a `projectile` or a
`burst` (a gameplay-affecting area round its caster), a summon (its
clone). A purely visual effect (a burst's `effect` clip, a clone's cloud)
is none; neither is a melee strike, a slam's `impact` or a `pull` (they
are the move itself), nor a heal of the caster's own.

Such a move costs `CONSTRUCT_ENERGY_COST` when its cooldown class is
**ordinary** (it has no cooldown: the removed 0.5 s repeat delay used to
be its only limit). One with a 3 s or 5 s cooldown pays nothing for its
construct: its cooldown is its limit. Each definition carries the result
as `energyCost` (derived; one that declares it must agree, or
`resolveMoveEnergy` refuses it).

| Fighter | Ordinary construct moves (15 each) | Construct moves with a special cooldown (0) |
| --- | --- | --- |
| #0001 | Red (attack2), Maximum Blue (attack3) | Unlimited Void (3 s), Hollow Purple (5 s) |
| #0002 | — | the Whirlwind (5 s) |
| #0003 | Cherry Blossom Impact (attack3, a burst) | — (the Mystical Palm Technique is a heal, 3 s) |
| #0004 | the Melody (extra_attack) | Ievan Polkka (5 s), World is Mine (3 s) |
| #0005 | — | the Deadlights (3 s), the Red Balloon (3 s) |
| #0006 | Heat Vision (attack3), the Sonic Scream (attack5) | Ice Breath (3 s) |

**One activation, one payment.** It is paid once, as the move starts
(`payEnergy`, after every other check: a refused press costs nothing):
never per projectile update, per hit (a piercing orb's several strikes),
per frame a construct lives, per clone strike, per projectile turned back,
per phase. Interrupted after it started (a hit in its startup, a summon's
startup broken), nothing is given back.

## Settings

A fighter's `energy` entry sets one thing, its refill rate:

| Field | Default | Meaning |
| --- | --- | --- |
| `regen` | 12 | Refill per second, one passive rate whatever the fighter does. |

#0001 declares `regen` 14, #0002 `regen` 12, #0003 `regen` 15, #0004
`regen` 14, #0005 `regen` 14, #0006 `regen` 14. Nothing
else in the entry is a fighter's own: `max`, `dashCost`, `dashCancelCost`,
`shieldHitCost`, `deflectCost` and `constructCost` may be left out (and
are, by every fighter), and declaring any of them with another value than
the rule's, or a field the schema does not know, is refused, naming the
fighter and the field.

## Rules

- Anything that costs Energy works whenever the fighter is not exhausted,
  however little is left: a cost larger than what remains takes all of it.
- Reaching 0, however it happens, **exhausts** the fighter: no Dash, air
  dash, Deflect, Shield or construct move until Energy is back at exactly
  100 (a partial refill does not unlock them). The bar turns gray through
  the refill, and the ability HUD and touch buttons mute every move that
  costs Energy. An exhausted fighter's melee attack press still starts its
  attack: melee strikes cost nothing. A press refused for Energy is never
  kept in the buffer.
- No refill on a step Energy was paid on (`Fighter.energyPaidAt`); every
  other step refills at the one rate, a held Shield and a block included.
- Holding the Shield costs nothing; a miss costs nothing; a perfect
  Shield costs the same 15 as any block (its advantage is no blockstun,
  never Energy). A Deflect is no Shield: it pays its own 15 as it starts,
  and a whiff has paid it all the same. Cancelled into an air dash, each
  pays its own 15: never one payment for both.
- Nothing gives Energy back: no block, perfect block, Deflect that lands,
  projectile turned back or cancelled move refunds anything or adds a
  refill of its own. Only the passive refill, and a full refill on a
  respawn, a reset or a restart, raise it.
- Difficulty never changes any of it: the CPU pays what a player pays,
  and plans with each move's own `energyCost`
  ([ai](ai.md)).
- The bar shows over the fighter's name tag only while below full
  ([rendering](rendering.md#fighter-status)); the HUD card describes it to
  screen readers only.

## Tests

[`tests/systems/energy.test.mjs`](../../tests/systems/energy.test.mjs)
(the rules, clamping, the refill, every cost, overspending, exhaustion,
the bar),
[`tests/systems/strict-combat-rules.test.mjs`](../../tests/systems/strict-combat-rules.test.mjs)
(constructs read from data, the roster's table, one payment per
activation, refused while exhausted and never kept, never refunded, the
CPU's costs),
[`tests/systems/combat-rules.test.mjs`](../../tests/systems/combat-rules.test.mjs)
(every registered fighter: 100 everywhere it starts or refills, 15 for
the Dash, the air dash and the Dash cancel, 15 for a block and a perfect
block, 15 for a Deflect hit or whiffed, nothing back for landing one or
turning a projectile back), the Dash cancel's cost in
[`tests/systems/combo.test.mjs`](../../tests/systems/combo.test.mjs), the
Deflect's (and a Deflect then an air dash, each its own 15) in
[`tests/systems/move-cancel.test.mjs`](../../tests/systems/move-cancel.test.mjs)
and [`tests/systems/deflect.test.mjs`](../../tests/systems/deflect.test.mjs),
and melee attacks and Automatic turn-around never touching it in
[`tests/systems/direct-input.test.mjs`](../../tests/systems/direct-input.test.mjs)
and [`tests/systems/turn-around.test.mjs`](../../tests/systems/turn-around.test.mjs).
